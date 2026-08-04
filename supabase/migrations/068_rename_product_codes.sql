-- =============================================================================
-- Star Hawk Builders Merchant — 068_rename_product_codes.sql
-- =============================================================================
-- One-time migration that renumbers every non-temporary product so its code
-- follows the category-prefix convention. Old codes are recorded in
-- product_redirects so existing public URLs keep working.
--
-- Example:
--   "CAT-LIN" in "Steel & Lintels" -> "STL-014"
--   "BAL10"   in "Aggregates & Cement" -> "AGG-008"
--
-- Products whose code starts with "TEMP-" are left untouched because the
-- dashboard treats that prefix as a temporary-product marker.
--
-- Idempotency: the migration is safe to re-run. Products whose code already
-- matches the new "XXX-NNN" format keep their existing code. New codes are
-- generated starting from the highest existing number in each prefix so they
-- never collide with codes that are already in use.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Redirect table: maps old product codes to their new codes.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_redirects (
  old_code text PRIMARY KEY,
  new_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_redirects IS
  'Maps legacy product codes to their current codes so old /products/{code} URLs redirect instead of 404ing.';

ALTER TABLE public.product_redirects ENABLE ROW LEVEL SECURITY;

-- The public product page reads this table with the anon client when a product
-- lookup fails, so anon must be able to SELECT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'product_redirects'
      AND policyname = 'product_redirects_anon_select'
  ) THEN
    CREATE POLICY product_redirects_anon_select
      ON public.product_redirects
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 2. Helper: category -> prefix mapping (mirrors lib/products.ts).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_category_code_prefix(category text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE COALESCE(category, 'Miscellaneous')
    WHEN 'Aggregates & Cement' THEN 'AGG'
    WHEN 'Plasterboard'        THEN 'PLA'
    WHEN 'Blocks'              THEN 'BLO'
    WHEN 'Cavity Insulation'   THEN 'CAV'
    WHEN 'Bricks'              THEN 'BRI'
    WHEN 'Timber'              THEN 'TIM'
    WHEN 'PIR Insulation'      THEN 'PIR'
    WHEN 'Sheet Materials'     THEN 'SHE'
    WHEN 'Cement & Additives'  THEN 'CEM'
    WHEN 'Steel & Lintels'     THEN 'STL'
    WHEN 'Roofing'             THEN 'ROO'
    WHEN 'Drainage'            THEN 'DRA'
    WHEN 'Tools'               THEN 'TOL'
    WHEN 'Fixings'             THEN 'FIX'
    WHEN 'Miscellaneous'       THEN 'MIS'
    ELSE UPPER(LEFT(COALESCE(category, 'Miscellaneous'), 3))
  END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Build a one-off mapping of every renumberable product.
--    Products already in the new "XXX-NNN" format keep their code.
--    Non-conforming products are numbered sequentially starting AFTER the
--    highest existing code number for their prefix, guaranteeing no collisions.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE code_rename_map AS
WITH prefix_max AS (
  SELECT
    public.get_category_code_prefix(category) AS prefix,
    COALESCE(
      MAX((regexp_match(code, '^[A-Z]{3}-([0-9]{3})$'))[1]::int),
      0
    ) AS max_num
  FROM public.products
  WHERE code ~ '^[A-Z]{3}-[0-9]{3}$'
  GROUP BY public.get_category_code_prefix(category)
)
SELECT
  p.id,
  p.code AS old_code,
  public.get_category_code_prefix(p.category) AS prefix,
  CASE
    WHEN p.code ~ '^[A-Z]{3}-[0-9]{3}$' THEN p.code
    ELSE
      COALESCE(pm.prefix, public.get_category_code_prefix(p.category))
      || '-'
      || LPAD(
           (COALESCE(pm.max_num, 0) + ROW_NUMBER() OVER (
             PARTITION BY public.get_category_code_prefix(p.category)
             ORDER BY p.created_at, p.id
           ))::text,
           3,
           '0'
         )
  END AS new_code
FROM public.products p
LEFT JOIN prefix_max pm
  ON pm.prefix = public.get_category_code_prefix(p.category)
WHERE p.code NOT LIKE 'TEMP-%';

-- -----------------------------------------------------------------------------
-- 4. Record redirects for every code that actually changes.
-- -----------------------------------------------------------------------------
INSERT INTO public.product_redirects (old_code, new_code)
SELECT old_code, new_code
FROM code_rename_map
WHERE old_code <> new_code
ON CONFLICT (old_code) DO UPDATE
SET new_code = EXCLUDED.new_code;

-- -----------------------------------------------------------------------------
-- 5. Apply the new codes. Already-conforming products are updated to the same
--    value, so this is effectively a no-op for them.
-- -----------------------------------------------------------------------------
UPDATE public.products p
SET code = m.new_code
FROM code_rename_map m
WHERE p.id = m.id;

DROP TABLE code_rename_map;

COMMIT;
