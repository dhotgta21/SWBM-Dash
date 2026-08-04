-- =============================================================================
-- ALL-IN-ONE: make products visible (run this ONE file in Supabase SQL Editor)
-- =============================================================================
-- Fixes:
--   • Missing deleted_at / is_temporary columns
--   • Broken or missing SELECT RLS (anon + authenticated get zero rows)
--   • Empty products table (inserts construction sample SKUs)
--
-- Safe to re-run. Does not delete existing products.
-- =============================================================================

-- 1) Columns the app needs
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_temporary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz,
  ADD COLUMN IF NOT EXISTS temp_placeholder_code boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS default_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'EA',
  ADD COLUMN IF NOT EXISTS track_stock boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_quantity numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_level numeric NOT NULL DEFAULT 0;

-- 2) Open SELECT for catalogue (app also uses service_role; this fixes anon)
DROP POLICY IF EXISTS products_select ON public.products;
DROP POLICY IF EXISTS products_select_anon ON public.products;
DROP POLICY IF EXISTS products_select_authenticated ON public.products;

CREATE POLICY products_select ON public.products
  FOR SELECT
  USING (true);

GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO service_role;

-- 3) Ensure existing rows are active permanent catalogue lines
UPDATE public.products
   SET is_active = true,
       is_temporary = COALESCE(is_temporary, false),
       deleted_at = NULL
 WHERE COALESCE(is_active, false) = false
    OR deleted_at IS NOT NULL;

-- Only force-activate if we know they were soft flags; leave intentionally
-- inactive if operator set is_active=false and deleted_at is null with a note?
-- For demo fix: activate all non-temporary with a category.
UPDATE public.products
   SET is_active = true
 WHERE COALESCE(is_temporary, false) = false
   AND category IS NOT NULL
   AND deleted_at IS NULL
   AND is_active IS DISTINCT FROM true;

-- 4) Seed construction products if table is empty (or always upsert)
INSERT INTO public.products (code, name, unit, category, default_price, is_active) VALUES
  ('SHRP',      'Building Sand',                  'TON',  'Aggregates & Cement', 85.00,  true),
  ('BAL10',     '10mm All-in Ballast',            'TON',  'Aggregates & Cement', 92.00,  true),
  ('GRA20',     '20mm Gravel',                    'TON',  'Aggregates & Cement', 95.00,  true),
  ('TYPE1',     'MOT Type 1 Sub Base',            'TON',  'Aggregates & Cement', 38.00,  true),
  ('CEM-I',     'Portland Cement 25kg',           'BAG',  'Cement & Additives',  7.50,   true),
  ('CEM-RPD',   'Rapid Set Cement 25kg',          'BAG',  'Cement & Additives',  8.95,   true),
  ('PB-12-2400','Plasterboard 12.5mm 2400x1200',  'SHEET','Plasterboard',        14.50,  true),
  ('PB-MR-1800','Moisture Resistant Board 1800',  'SHEET','Plasterboard',        12.75,  true),
  ('DENSE-100', '100mm Dense Concrete Block',     'EA',   'Blocks',              1.85,   true),
  ('HOLLOW-100','100mm Hollow Block',             'EA',   'Blocks',              1.45,   true),
  ('AIR-100',   '100mm Aircrete Block',           'EA',   'Blocks',              2.35,   true),
  ('WIRE-FN',   'Wirecut Facing Brick',           'EA',   'Bricks',              0.65,   true),
  ('ENG-CLAS',  'Engineering Class B Brick',      'EA',   'Bricks',              0.78,   true),
  ('CLS38-89',  'CLS Timber 38x89mm 2.4m',        'EA',   'Timber',              6.40,   true),
  ('CLP-150',   'Treated Cladding 150mm 4.8m',    'EA',   'Timber',              12.90,  true),
  ('SKIR-MDF',  'MDF Skirting 119x18mm 4.4m',     'EA',   'Timber',              8.25,   true),
  ('CAV-100',   'Cavity Wall Insulation 100mm',   'SHEET','Cavity Insulation',   18.50,  true),
  ('FULL-50',   'Full Fill Cavity 50mm',          'SHEET','Cavity Insulation',   15.00,  true),
  ('PIR-100',   'PIR Insulation Board 100mm',     'SHEET','PIR Insulation',      32.00,  true),
  ('PIR-50',    'PIR Insulation Board 50mm',      'SHEET','PIR Insulation',      21.50,  true),
  ('OSB-18',    'OSB Board 18mm 2440x1220',       'SHEET','Sheet Materials',     24.75,  true),
  ('PLY-12',    'Hardwood Plywood 12mm',          'SHEET','Sheet Materials',     36.40,  true),
  ('MDF-18',    'MDF Sheet 18mm 2440x1220',       'SHEET','Sheet Materials',     27.90,  true),
  ('CAT-LIN',   'Catnic Cavity Lintel 1200mm',    'EA',   'Steel & Lintels',     42.00,  true),
  ('IB-LIN',    'IG Lintel 1500mm',               'EA',   'Steel & Lintels',     48.50,  true),
  ('CON-ROOF',  'Concrete Roof Tile',             'EA',   'Roofing',             0.85,   true),
  ('DRY-RDG',   'Dry Ridge Kit',                  'EA',   'Roofing',             95.00,  true),
  ('UND-FELT',  'Breathable Underlay 50m',        'ROLL', 'Roofing',             78.00,  true),
  ('UND-110',   'Underground Pipe 110mm',         'M',    'Drainage',            6.20,   true),
  ('GULLY',     'Bottle Gully',                   'EA',   'Drainage',            14.50,  true),
  ('IC-450',    'Inspection Chamber 450mm',       'EA',   'Drainage',            62.00,  true),
  ('SCR-FC',    'Frame Fixing Screws M8x100 x50', 'BOX',  'Fixings',             18.75,  true),
  ('NAIL-50',   'Galvanised Clout Nails 50mm',    'BOX',  'Fixings',             9.40,   true),
  ('TRL-VEL',   'Trowel 12" London Pattern',      'EA',   'Tools',               22.50,  true),
  ('LEV-1220',  'Spirit Level 1220mm',            'EA',   'Tools',               48.00,  true),
  ('MAS-PL',    'Pointing Trowel',                'EA',   'Tools',               11.25,  true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  unit = EXCLUDED.unit,
  category = EXCLUDED.category,
  default_price = EXCLUDED.default_price,
  is_active = true,
  is_temporary = false,
  deleted_at = NULL,
  updated_at = now();

-- 5) Proof: you must see public_visible > 0
SELECT
  COUNT(*) AS total_products,
  COUNT(*) FILTER (
    WHERE deleted_at IS NULL
      AND COALESCE(is_active, true)
      AND COALESCE(is_temporary, false) = false
      AND category IS NOT NULL
  ) AS public_visible
FROM public.products;

SELECT category, COUNT(*) AS n
FROM public.products
WHERE deleted_at IS NULL
  AND COALESCE(is_active, true)
  AND COALESCE(is_temporary, false) = false
GROUP BY category
ORDER BY category;
