-- =============================================================================
-- 162_flatten_variant_options.sql
-- =============================================================================
-- Flattens the legacy variant_options JSONB shape into the new (post 2026-07-18
-- refactor) shape, and re-bakes the product's search_tags with the option
-- texts so the search RPC keeps matching typed size/spec queries.
--
-- Background: the original variant_options shape (introduced in migration 070
-- and populated by 158/161) was
--
--   [{ material, image, selectors: [{ name, label, options: [{ value, text }] }] }]
--
-- The per-variant `material` / `image` fields overlapped with the product-level
-- `image_url` and the new `materials` text[] column — operators had to keep
-- them in sync, which caused consistency drift. The multi-selector wrapping
-- (`selectors: [{name, label, options: []}]`) also added a layer the operator
-- never needed; for a steel "Universal Beam" product they wanted "list my
-- sizes", not "list my materials each with a list of my size selectors".
--
-- The new shape drops both:
--
--   [{ options: [{ value, text, measurements?: [{ name, value, unit }] }] }]
--
-- Material is now a product-level field (the existing `materials` text[]
-- column, surfaced as schema.org/Product.material). The product image is
-- the single `image_url` and renders for every variant. Per-option
-- measurements (length, weight, diameter, etc.) live on the option itself,
-- so a steel "UB 127x76x13kg · 6m" option can carry length_m + weight_kg
-- while a timber "47 × 100" option can carry just a bare label.
--
-- This migration is the only place we touch the existing data — the new
-- code in components/products/ProductForm.tsx, VariantEditor.tsx,
-- ProductSearch.tsx, ProductVariantSelector.tsx, InvoiceForm.tsx and
-- lib/public-products.ts writes the new shape on every save, so any
-- product touched after this migration lands is automatically in the new
-- shape. The migration here just flattens the ~200+ existing consolidated
-- products from 158 (steel) and 161 (timber/PIR/cavity/sheet) so they
-- show the right dropdowns in the meantime.
--
-- Apply order:
--   1. 158_variant_consolidation.sql               (already applied)
--   2. 161_multi_category_variant_consolidation.sql (already applied)
--   3. 162_flatten_variant_options.sql             (THIS migration)
--
-- Safety: the migration is idempotent — rows already in the new shape
-- (no `selectors` key on any variant) are returned unchanged by the
-- flatten function. Re-running produces the same result.
-- =============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. flatten_variant_options(jsonb) → jsonb
--    Returns the input unchanged when it's already the new shape
--    (no variant carries a `selectors` key). Otherwise collapses every
--    variant's `selectors[].options[]` into a single flat `options[]`
--    on the new variant, dropping `material`, `image`, and the selector
--    `name` / `label` wrapper.
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.flatten_variant_options(variant_options jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result jsonb;
  has_legacy_shape boolean;
BEGIN
  -- Null / non-array / empty short-circuits — return as-is.
  IF variant_options IS NULL THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(variant_options) <> 'array' THEN
    RETURN variant_options;
  END IF;
  IF jsonb_array_length(variant_options) = 0 THEN
    RETURN variant_options;
  END IF;

  -- Cheap shape probe: legacy shape has at least one variant with a
  -- `selectors` key. New shape never does.
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(variant_options) v
    WHERE v ? 'selectors'
  ) INTO has_legacy_shape;

  IF NOT has_legacy_shape THEN
    RETURN variant_options;
  END IF;

  -- Collapse every variant's selector options into a single flat
  -- options list on the new variant. Strips the option to its core
  -- {value, text} fields — any future per-option `measurements` are
  -- written by the admin form on the next edit.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'options',
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'value', o->>'value',
              'text',  o->>'text'
            )
            ORDER BY ord
          )
          FROM (
            SELECT o, row_number() OVER () AS ord
            FROM jsonb_array_elements(v->'selectors') s,
                 jsonb_array_elements(s->'options') o
          ) opt_rows
        ), '[]'::jsonb)
      )
    ),
    '[]'::jsonb
  )
  INTO result
  FROM jsonb_array_elements(variant_options) v;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.flatten_variant_options(jsonb) IS
  'Collapse the legacy variant_options shape (with material/image/selectors[]) into the new flat shape (with options[]). Idempotent: returns the input unchanged when already in the new shape.';

-- ────────────────────────────────────────────────────────────────────────
-- 2. Apply the flatten to every product that still has the legacy shape.
--    WHERE clause uses the same `? 'selectors'` shape probe so the UPDATE
--    is a no-op on rows that have already been edited into the new shape.
-- ────────────────────────────────────────────────────────────────────────

UPDATE public.products p
SET variant_options = public.flatten_variant_options(p.variant_options)
WHERE p.variant_options IS NOT NULL
  AND jsonb_typeof(p.variant_options) = 'array'
  AND jsonb_array_length(p.variant_options) > 0
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p.variant_options) v
    WHERE v ? 'selectors'
  );

-- ────────────────────────────────────────────────────────────────────────
-- 3. Re-bake search_tags so the option texts the legacy shape encoded
--    inside `selectors[].options[].text` are now also indexed at weight
--    C. The admin form auto-bakes the same union on every save, so this
--    one-shot UPDATE just catches the ~200+ products that haven't been
--    edited since the refactor.
--    De-duplicates against the existing search_tags array so we don't
--    lose manually-entered synonyms.
--
--    The `search_tags` column is NOT NULL — we MUST always return a
--    valid array (never NULL) from the subquery, otherwise the UPDATE
--    fails with "null value in column 'search_tags' violates not-null
--    constraint" for any product that has variant_options but no
--    option texts (e.g. a brand-new empty editor save, or a product
--    that just had its last size removed). `ARRAY(SELECT DISTINCT
--    unnest(...))` collapses an empty array to an empty array, not
--    NULL — and the outer COALESCE catches any NULL that slips through
--    so pre-existing NULL search_tags (a known issue on a handful of
--    legacy rows like BRI-072) get cleaned up to a valid empty array.
-- ────────────────────────────────────────────────────────────────────────

UPDATE public.products p
SET search_tags = COALESCE(sub.merged, ARRAY[]::text[])
FROM (
  SELECT
    p2.id AS pid,
    ARRAY(SELECT DISTINCT unnest(
      COALESCE(p2.search_tags, ARRAY[]::text[]) ||
      COALESCE((
        SELECT array_agg(DISTINCT opt->>'text')
        FROM jsonb_array_elements(p2.variant_options) v,
             jsonb_array_elements(v->'options') opt
        WHERE opt->>'text' IS NOT NULL
          AND opt->>'text' <> ''
      ), ARRAY[]::text[])
    )) AS merged
  FROM public.products p2
  WHERE p2.variant_options IS NOT NULL
    AND jsonb_typeof(p2.variant_options) = 'array'
    AND jsonb_array_length(p2.variant_options) > 0
) sub
WHERE p.id = sub.pid;

COMMIT;
