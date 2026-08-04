-- Add Parker Steel variant/metadata columns to products.
-- Supports material selectors and dimension/spec selectors on product pages.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS materials jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS variant_options jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS family_slug text,
  ADD COLUMN IF NOT EXISTS source_url text;

COMMENT ON COLUMN public.products.materials IS
  'Array of available material names for Parker Steel-style products (e.g. ["Mild Steel", "Stainless Steel", "Aluminium"]).';

COMMENT ON COLUMN public.products.variant_options IS
  'Per-material selector definitions (dimension dropdowns, thickness, etc.) used by the product page variant picker.';

COMMENT ON COLUMN public.products.family_slug IS
  'Shared slug that groups material variants of the same product family (e.g. "square-hollow-section").';

COMMENT ON COLUMN public.products.source_url IS
  'Original supplier URL this product was sourced from.';
