-- Migration 053: Add per-product calculator metadata.
-- These fields drive the public-shop quantity calculators so customers can
-- estimate how much material they need before adding items to their quote.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS length_mm numeric,
  ADD COLUMN IF NOT EXISTS width_mm numeric,
  ADD COLUMN IF NOT EXISTS height_mm numeric,
  ADD COLUMN IF NOT EXISTS thickness_mm numeric,
  ADD COLUMN IF NOT EXISTS coverage_m2_per_unit numeric,
  ADD COLUMN IF NOT EXISTS coverage_linear_m_per_unit numeric,
  ADD COLUMN IF NOT EXISTS unit_weight_kg numeric,
  ADD COLUMN IF NOT EXISTS pack_size integer,
  ADD COLUMN IF NOT EXISTS wastage_pct numeric DEFAULT 5,
  ADD COLUMN IF NOT EXISTS calculator_type text;

COMMENT ON COLUMN public.products.length_mm IS 'Product length in millimetres. Used by sheet-material, insulation and timber calculators.';
COMMENT ON COLUMN public.products.width_mm IS 'Product width in millimetres. Used by sheet-material, insulation and timber calculators.';
COMMENT ON COLUMN public.products.height_mm IS 'Product height in millimetres. Used by brick, block and timber calculators.';
COMMENT ON COLUMN public.products.thickness_mm IS 'Product thickness in millimetres. Used by insulation, plasterboard and sheet-material calculators.';
COMMENT ON COLUMN public.products.coverage_m2_per_unit IS 'Coverage area in square metres per unit (e.g. per bag, per roll). Used by plaster and paint-style calculators.';
COMMENT ON COLUMN public.products.coverage_linear_m_per_unit IS 'Linear coverage in metres per unit (e.g. guttering, trims, DPC). Used by roofing calculators.';
COMMENT ON COLUMN public.products.unit_weight_kg IS 'Weight of one unit in kilograms. Used by aggregates, cement and sand calculators.';
COMMENT ON COLUMN public.products.pack_size IS 'Number of items in a pack/box (e.g. screws per box). Used by fixing add-ons.';
COMMENT ON COLUMN public.products.wastage_pct IS 'Default wastage percentage used by the calculator when rounding up quantities.';
COMMENT ON COLUMN public.products.calculator_type IS 'Which calculator widget to render for this product (e.g. BRICK_WALL, SHEET_MATERIALS, MORTAR_CONCRETE).';
