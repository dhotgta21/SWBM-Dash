-- =============================================================================
-- 161_multi_category_variant_consolidation.sql
-- =============================================================================
-- Replaces 58 single-row-per-size products across 4 categories with 11
-- consolidated products, each carrying a `variant_options` JSONB blob
-- that exposes the size as a dropdown on the public product page.
--
--   TIMBER   42 rows (TIM-003..044) -> 6 products (TIM-046..051)
--              TIM-046  3x2 C24 Timber     7 length variants
--              TIM-047  4x2 C24 Timber     7 length variants
--              TIM-048  6x2 C24 Timber     7 length variants
--              TIM-049  7x2 C24 Timber     7 length variants
--              TIM-050  8x2 C24 Timber     7 length variants
--              TIM-051  9x2 C24 Timber     7 length variants
--              (TIM-045 Treated Batten left as-is)
--
--   PIR       6 rows (PIR-003..008)  -> 1 product  (PIR-009)
--              PIR-009  PIR Insulation Board  6 thickness variants
--
--   CAVITY    2 rows (CAV-007..008)  -> 1 product  (CAV-009)
--              CAV-009  Cavity Wall Insulation  2 thickness variants
--              (CAV-006 Full Fill 90mm left as-is)
--
--   SHEET     8 rows (SHE-001/003..009) -> 3 products (SHE-010..012)
--              SHE-010  OSB3 Board          3 size variants
--              SHE-011  Structural Plywood  3 size variants
--              SHE-012  Chipboard Flooring  2 size variants
--
-- The 58 individual rows are soft-deleted (deleted_at + is_active=false)
-- in the same migration and their codes are recorded in product_redirects
-- so the existing URL space keeps working -- old /products/TIM-005
-- permanently redirects to /products/TIM-046 (the new consolidated
-- 3x2 C24 Timber page) via getRedirectedProductCode() in
-- lib/public-products.ts:410.
--
-- This REPLACES the 42-row Timber catalogue plan and the 17 individual
-- PIR/CAV/SHE rows. Pattern is the same as 158 (steel consolidation).
-- Apply order:
--
--   1. 156_image_wireup_seo_searchtags.sql   (already applied)
--   2. 157_wireup_and_consolidation.sql      (already applied)
--   3. 158_variant_consolidation.sql         (already applied - steel)
--   4. 161_multi_category_variant_consolidation.sql  (THIS migration)
--
-- Calculator caveat (TIMBER only):
--   The TimberCalculator uses product.lengthMm for piece-length math,
--   which now varies per variant. The 6 consolidated timber products
--   have calculator_type=NULL until a follow-up code change makes
--   the calculator variant-aware. The "Calculate quantity" link
--   disappears from the consolidated timber product pages. PIR, CAV
--   and SHEET calculators continue to work because they use
--   lengthMm x widthMm (constant per consolidated product) for area
--   math.
--
-- Idempotency: every INSERT is ON CONFLICT (code) DO UPDATE so re-running
-- the migration updates in place without duplicating. Soft-deletes are
-- guarded by `is_active = true` so re-runs are no-ops. Redirects use
-- ON CONFLICT (old_code) DO UPDATE so re-runs are no-ops.
-- =============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- 1. TIMBER  (TIM-003..044 -> TIM-046..051, 42 rows -> 6 products)
--    TIM-045 Treated Timber Batten 25x38mm is left as a standalone
-- ────────────────────────────────────────────────────────────────────────

UPDATE public.products
SET is_active = false, deleted_at = now()
WHERE code IN ('TIM-003', 'TIM-004', 'TIM-005', 'TIM-006', 'TIM-007', 'TIM-008', 'TIM-009', 'TIM-010', 'TIM-011', 'TIM-012', 'TIM-013', 'TIM-014', 'TIM-015', 'TIM-016', 'TIM-017', 'TIM-018', 'TIM-019', 'TIM-020', 'TIM-021', 'TIM-022', 'TIM-023', 'TIM-024', 'TIM-025', 'TIM-026', 'TIM-027', 'TIM-028', 'TIM-029', 'TIM-030', 'TIM-031', 'TIM-032', 'TIM-033', 'TIM-034', 'TIM-035', 'TIM-036', 'TIM-037', 'TIM-038', 'TIM-039', 'TIM-040', 'TIM-041', 'TIM-042', 'TIM-043', 'TIM-044')
  AND is_active = true;

-- Map each old TIM-* code to its new consolidated code.
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-003', 'TIM-046') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-004', 'TIM-046') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-005', 'TIM-046') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-006', 'TIM-046') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-007', 'TIM-046') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-008', 'TIM-046') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-009', 'TIM-046') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-010', 'TIM-047') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-011', 'TIM-047') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-012', 'TIM-047') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-013', 'TIM-047') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-014', 'TIM-047') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-015', 'TIM-047') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-016', 'TIM-047') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-017', 'TIM-048') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-018', 'TIM-048') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-019', 'TIM-048') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-020', 'TIM-048') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-021', 'TIM-048') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-022', 'TIM-048') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-023', 'TIM-048') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-024', 'TIM-049') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-025', 'TIM-049') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-026', 'TIM-049') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-027', 'TIM-049') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-028', 'TIM-049') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-029', 'TIM-049') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-030', 'TIM-049') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-031', 'TIM-050') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-032', 'TIM-050') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-033', 'TIM-050') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-034', 'TIM-050') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-035', 'TIM-050') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-036', 'TIM-050') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-037', 'TIM-050') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-038', 'TIM-051') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-039', 'TIM-051') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-040', 'TIM-051') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-041', 'TIM-051') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-042', 'TIM-051') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-043', 'TIM-051') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('TIM-044', 'TIM-051') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;

-- 6 consolidated timber products, one per section size, each
-- with a single "size" selector carrying the 7 standard lengths.
-- calculator_type is set to NULL on the consolidated rows because the
-- TimberCalculator uses lengthMm for piece-length math which now varies
-- per variant. A follow-up code change will make the calculator
-- variant-aware (TODO: track in a separate issue).
INSERT INTO public.products (
  code, name, description, short_description, seo_title, seo_description,
  unit, category, default_price, image_url, is_active, materials,
  search_tags, variant_options, family_slug, calculator_type, wastage_pct,
  length_mm, width_mm, height_mm
) VALUES

  (
    'TIM-046',
    '3x2 C24 Timber',
    '3x2 C24 Timber is a stress-graded C24 structural softwood carcassing timber for stud walls, floor joists, roof joists, ceiling joists and general framing. Machined to 3 x 2 inches (75mm x 47mm actual), available in 7 standard lengths from 2.4m to 6m. Select a length below for full dimensions and trade pricing.',
    'Stress-graded C24 structural 3x2 carcassing timber — 7 lengths from 2.4m to 6m.',
    '3x2 C24 Timber | Star Hawk Builders Merchant',
    'Order 3x2 C24 Timber online. Stress-graded C24 structural 3x2 carcassing timber in 7 standard lengths from 2.4m to 6m. Trade price and same-day delivery from Star Hawk.',
    'EA',
    'Timber',
    0,
    '/products/timber-c24-3x2.webp',
    true,
    '["C24 softwood"]'::jsonb,
    ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber', '3x2 c24', '2x3 timber', '3 by 2 timber', '3x2 carcassing', '3x2 C24 Timber 2.4m', '3x2 C24 Timber 3m', '3x2 C24 Timber 3.6m', '3x2 C24 Timber 4.2m', '3x2 C24 Timber 4.8m', '3x2 C24 Timber 5.4m', '3x2 C24 Timber 6m'],
    '[{"material": "C24 structural timber", "image": "/products/timber-c24-3x2.webp", "selectors": [{"name": "size", "label": "Length", "options": [{"value": "3x2-2-4m", "text": "3x2 2.4m"}, {"value": "3x2-3m", "text": "3x2 3m"}, {"value": "3x2-3-6m", "text": "3x2 3.6m"}, {"value": "3x2-4-2m", "text": "3x2 4.2m"}, {"value": "3x2-4-8m", "text": "3x2 4.8m"}, {"value": "3x2-5-4m", "text": "3x2 5.4m"}, {"value": "3x2-6m", "text": "3x2 6m"}]}]}]'::jsonb,
    'timber-c24-3x2',
    NULL,
    5,
    NULL,
    75,
    47
  ),
  (
    'TIM-047',
    '4x2 C24 Timber',
    '4x2 C24 Timber is a stress-graded C24 structural softwood carcassing timber for stud walls, floor joists, roof joists, ceiling joists and general framing. Machined to 4 x 2 inches (100mm x 47mm actual), available in 7 standard lengths from 2.4m to 6m. Select a length below for full dimensions and trade pricing.',
    'Stress-graded C24 structural 4x2 carcassing timber — 7 lengths from 2.4m to 6m.',
    '4x2 C24 Timber | Star Hawk Builders Merchant',
    'Order 4x2 C24 Timber online. Stress-graded C24 structural 4x2 carcassing timber in 7 standard lengths from 2.4m to 6m. Trade price and same-day delivery from Star Hawk.',
    'EA',
    'Timber',
    0,
    '/products/timber-c24-4x2.webp',
    true,
    '["C24 softwood"]'::jsonb,
    ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber', '4x2 c24', '2x4 timber', '4 by 2 timber', '4x2 carcassing', '4x2 C24 Timber 2.4m', '4x2 C24 Timber 3m', '4x2 C24 Timber 3.6m', '4x2 C24 Timber 4.2m', '4x2 C24 Timber 4.8m', '4x2 C24 Timber 5.4m', '4x2 C24 Timber 6m'],
    '[{"material": "C24 structural timber", "image": "/products/timber-c24-4x2.webp", "selectors": [{"name": "size", "label": "Length", "options": [{"value": "4x2-2-4m", "text": "4x2 2.4m"}, {"value": "4x2-3m", "text": "4x2 3m"}, {"value": "4x2-3-6m", "text": "4x2 3.6m"}, {"value": "4x2-4-2m", "text": "4x2 4.2m"}, {"value": "4x2-4-8m", "text": "4x2 4.8m"}, {"value": "4x2-5-4m", "text": "4x2 5.4m"}, {"value": "4x2-6m", "text": "4x2 6m"}]}]}]'::jsonb,
    'timber-c24-4x2',
    NULL,
    5,
    NULL,
    100,
    47
  ),
  (
    'TIM-048',
    '6x2 C24 Timber',
    '6x2 C24 Timber is a stress-graded C24 structural softwood carcassing timber for stud walls, floor joists, roof joists, ceiling joists and general framing. Machined to 6 x 2 inches (150mm x 47mm actual), available in 7 standard lengths from 2.4m to 6m. Select a length below for full dimensions and trade pricing.',
    'Stress-graded C24 structural 6x2 carcassing timber — 7 lengths from 2.4m to 6m.',
    '6x2 C24 Timber | Star Hawk Builders Merchant',
    'Order 6x2 C24 Timber online. Stress-graded C24 structural 6x2 carcassing timber in 7 standard lengths from 2.4m to 6m. Trade price and same-day delivery from Star Hawk.',
    'EA',
    'Timber',
    0,
    '/products/timber-c24-6x2.webp',
    true,
    '["C24 softwood"]'::jsonb,
    ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber', '6x2 c24', '2x6 timber', '6 by 2 timber', '6x2 carcassing', '6x2 C24 Timber 2.4m', '6x2 C24 Timber 3m', '6x2 C24 Timber 3.6m', '6x2 C24 Timber 4.2m', '6x2 C24 Timber 4.8m', '6x2 C24 Timber 5.4m', '6x2 C24 Timber 6m'],
    '[{"material": "C24 structural timber", "image": "/products/timber-c24-6x2.webp", "selectors": [{"name": "size", "label": "Length", "options": [{"value": "6x2-2-4m", "text": "6x2 2.4m"}, {"value": "6x2-3m", "text": "6x2 3m"}, {"value": "6x2-3-6m", "text": "6x2 3.6m"}, {"value": "6x2-4-2m", "text": "6x2 4.2m"}, {"value": "6x2-4-8m", "text": "6x2 4.8m"}, {"value": "6x2-5-4m", "text": "6x2 5.4m"}, {"value": "6x2-6m", "text": "6x2 6m"}]}]}]'::jsonb,
    'timber-c24-6x2',
    NULL,
    5,
    NULL,
    150,
    47
  ),
  (
    'TIM-049',
    '7x2 C24 Timber',
    '7x2 C24 Timber is a stress-graded C24 structural softwood carcassing timber for stud walls, floor joists, roof joists, ceiling joists and general framing. Machined to 7 x 2 inches (175mm x 47mm actual), available in 7 standard lengths from 2.4m to 6m. Select a length below for full dimensions and trade pricing.',
    'Stress-graded C24 structural 7x2 carcassing timber — 7 lengths from 2.4m to 6m.',
    '7x2 C24 Timber | Star Hawk Builders Merchant',
    'Order 7x2 C24 Timber online. Stress-graded C24 structural 7x2 carcassing timber in 7 standard lengths from 2.4m to 6m. Trade price and same-day delivery from Star Hawk.',
    'EA',
    'Timber',
    0,
    '/products/timber-c24-7x2.webp',
    true,
    '["C24 softwood"]'::jsonb,
    ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber', '7x2 c24', '2x7 timber', '7 by 2 timber', '7x2 carcassing', '7x2 C24 Timber 2.4m', '7x2 C24 Timber 3m', '7x2 C24 Timber 3.6m', '7x2 C24 Timber 4.2m', '7x2 C24 Timber 4.8m', '7x2 C24 Timber 5.4m', '7x2 C24 Timber 6m'],
    '[{"material": "C24 structural timber", "image": "/products/timber-c24-7x2.webp", "selectors": [{"name": "size", "label": "Length", "options": [{"value": "7x2-2-4m", "text": "7x2 2.4m"}, {"value": "7x2-3m", "text": "7x2 3m"}, {"value": "7x2-3-6m", "text": "7x2 3.6m"}, {"value": "7x2-4-2m", "text": "7x2 4.2m"}, {"value": "7x2-4-8m", "text": "7x2 4.8m"}, {"value": "7x2-5-4m", "text": "7x2 5.4m"}, {"value": "7x2-6m", "text": "7x2 6m"}]}]}]'::jsonb,
    'timber-c24-7x2',
    NULL,
    5,
    NULL,
    175,
    47
  ),
  (
    'TIM-050',
    '8x2 C24 Timber',
    '8x2 C24 Timber is a stress-graded C24 structural softwood carcassing timber for stud walls, floor joists, roof joists, ceiling joists and general framing. Machined to 8 x 2 inches (200mm x 47mm actual), available in 7 standard lengths from 2.4m to 6m. Select a length below for full dimensions and trade pricing.',
    'Stress-graded C24 structural 8x2 carcassing timber — 7 lengths from 2.4m to 6m.',
    '8x2 C24 Timber | Star Hawk Builders Merchant',
    'Order 8x2 C24 Timber online. Stress-graded C24 structural 8x2 carcassing timber in 7 standard lengths from 2.4m to 6m. Trade price and same-day delivery from Star Hawk.',
    'EA',
    'Timber',
    0,
    '/products/timber-c24-8x2.webp',
    true,
    '["C24 softwood"]'::jsonb,
    ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber', '8x2 c24', '2x8 timber', '8 by 2 timber', '8x2 carcassing', '8x2 C24 Timber 2.4m', '8x2 C24 Timber 3m', '8x2 C24 Timber 3.6m', '8x2 C24 Timber 4.2m', '8x2 C24 Timber 4.8m', '8x2 C24 Timber 5.4m', '8x2 C24 Timber 6m'],
    '[{"material": "C24 structural timber", "image": "/products/timber-c24-8x2.webp", "selectors": [{"name": "size", "label": "Length", "options": [{"value": "8x2-2-4m", "text": "8x2 2.4m"}, {"value": "8x2-3m", "text": "8x2 3m"}, {"value": "8x2-3-6m", "text": "8x2 3.6m"}, {"value": "8x2-4-2m", "text": "8x2 4.2m"}, {"value": "8x2-4-8m", "text": "8x2 4.8m"}, {"value": "8x2-5-4m", "text": "8x2 5.4m"}, {"value": "8x2-6m", "text": "8x2 6m"}]}]}]'::jsonb,
    'timber-c24-8x2',
    NULL,
    5,
    NULL,
    200,
    47
  ),
  (
    'TIM-051',
    '9x2 C24 Timber',
    '9x2 C24 Timber is a stress-graded C24 structural softwood carcassing timber for stud walls, floor joists, roof joists, ceiling joists and general framing. Machined to 9 x 2 inches (225mm x 47mm actual), available in 7 standard lengths from 2.4m to 6m. Select a length below for full dimensions and trade pricing.',
    'Stress-graded C24 structural 9x2 carcassing timber — 7 lengths from 2.4m to 6m.',
    '9x2 C24 Timber | Star Hawk Builders Merchant',
    'Order 9x2 C24 Timber online. Stress-graded C24 structural 9x2 carcassing timber in 7 standard lengths from 2.4m to 6m. Trade price and same-day delivery from Star Hawk.',
    'EA',
    'Timber',
    0,
    '/products/timber-c24-9x2.webp',
    true,
    '["C24 softwood"]'::jsonb,
    ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber', '9x2 c24', '2x9 timber', '9 by 2 timber', '9x2 carcassing', '9x2 C24 Timber 2.4m', '9x2 C24 Timber 3m', '9x2 C24 Timber 3.6m', '9x2 C24 Timber 4.2m', '9x2 C24 Timber 4.8m', '9x2 C24 Timber 5.4m', '9x2 C24 Timber 6m'],
    '[{"material": "C24 structural timber", "image": "/products/timber-c24-9x2.webp", "selectors": [{"name": "size", "label": "Length", "options": [{"value": "9x2-2-4m", "text": "9x2 2.4m"}, {"value": "9x2-3m", "text": "9x2 3m"}, {"value": "9x2-3-6m", "text": "9x2 3.6m"}, {"value": "9x2-4-2m", "text": "9x2 4.2m"}, {"value": "9x2-4-8m", "text": "9x2 4.8m"}, {"value": "9x2-5-4m", "text": "9x2 5.4m"}, {"value": "9x2-6m", "text": "9x2 6m"}]}]}]'::jsonb,
    'timber-c24-9x2',
    NULL,
    5,
    NULL,
    225,
    47
  )

ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  short_description = EXCLUDED.short_description,
  seo_title = EXCLUDED.seo_title,
  seo_description = EXCLUDED.seo_description,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  materials = EXCLUDED.materials,
  search_tags = EXCLUDED.search_tags,
  variant_options = EXCLUDED.variant_options,
  family_slug = EXCLUDED.family_slug,
  calculator_type = EXCLUDED.calculator_type,
  wastage_pct = EXCLUDED.wastage_pct,
  width_mm = EXCLUDED.width_mm,
  height_mm = EXCLUDED.height_mm,
  is_active = true,
  deleted_at = NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 2. PIR INSULATION  (PIR-003..008 -> PIR-009, 6 rows -> 1 product)
-- ────────────────────────────────────────────────────────────────────────

UPDATE public.products
SET is_active = false, deleted_at = now()
WHERE code IN ('PIR-003', 'PIR-004', 'PIR-005', 'PIR-006', 'PIR-007', 'PIR-008')
  AND is_active = true;

INSERT INTO public.product_redirects (old_code, new_code) VALUES ('PIR-003', 'PIR-009') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('PIR-004', 'PIR-009') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('PIR-005', 'PIR-009') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('PIR-006', 'PIR-009') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('PIR-007', 'PIR-009') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('PIR-008', 'PIR-009') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;

INSERT INTO public.products (
  code, name, description, short_description, seo_title, seo_description,
  unit, category, default_price, image_url, is_active, materials,
  search_tags, variant_options, family_slug, calculator_type, wastage_pct,
  length_mm, width_mm, thickness_mm
) VALUES (
  'PIR-009',
  'PIR Insulation Board',
  'PIR Insulation Board is a high-performance rigid polyisocyanurate (PIR) foam board for roof, wall and floor insulation. Thermal conductivity as low as 0.022 W/mK, faced with low-emissivity aluminium foil on both sides. Standard 2400mm x 1200mm board, available in 6 thicknesses from 25mm to 150mm. Select a thickness below for R-values, coverage and trade pricing.',
  'High-performance rigid PIR insulation board — 2400x1200mm in 6 thicknesses from 25mm to 150mm.',
  'PIR Insulation Board | Star Hawk Builders Merchant',
  'Order PIR Insulation Board online. 2400x1200mm rigid PIR foam in 6 thicknesses (25/50/70/100/120/150mm) for roof, wall and floor insulation. Trade price and same-day delivery from Star Hawk.',
  'SHEET',
  'Insulation',
  0,
  '/products/pir-insulation-board.webp',
  true,
  '["PIR foam", "Aluminium foil facing"]'::jsonb,
  ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board', 'pir board', 'polyisocyanurate', 'thermal insulation', 'roof insulation', 'wall insulation', 'PIR 25mm', '25mm PIR', 'PIR 50mm', '50mm PIR', 'PIR 70mm', '70mm PIR', 'PIR 100mm', '100mm PIR', 'PIR 120mm', '120mm PIR', 'PIR 150mm', '150mm PIR'],
  '[{"material": "PIR rigid foam", "image": "/products/pir-insulation-board.webp", "selectors": [{"name": "size", "label": "Thickness", "options": [{"value": "pir-25mm", "text": "25mm"}, {"value": "pir-50mm", "text": "50mm"}, {"value": "pir-70mm", "text": "70mm"}, {"value": "pir-100mm", "text": "100mm"}, {"value": "pir-120mm", "text": "120mm"}, {"value": "pir-150mm", "text": "150mm"}]}]}]'::jsonb,
  'pir-insulation-board',
  'INSULATION',
  5,
  2400,
  1200,
  NULL
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  short_description = EXCLUDED.short_description,
  seo_title = EXCLUDED.seo_title,
  seo_description = EXCLUDED.seo_description,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  materials = EXCLUDED.materials,
  search_tags = EXCLUDED.search_tags,
  variant_options = EXCLUDED.variant_options,
  family_slug = EXCLUDED.family_slug,
  calculator_type = EXCLUDED.calculator_type,
  wastage_pct = EXCLUDED.wastage_pct,
  length_mm = EXCLUDED.length_mm,
  width_mm = EXCLUDED.width_mm,
  is_active = true,
  deleted_at = NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 3. CAVITY INSULATION  (CAV-007 + CAV-008 -> CAV-009, 2 rows -> 1 product)
--    CAV-006 "Full Fill Cavity Insulation 90mm" is a different product
--    (full fill vs partial fill) and is LEFT as a standalone.
-- ────────────────────────────────────────────────────────────────────────

UPDATE public.products
SET is_active = false, deleted_at = now()
WHERE code IN ('CAV-007', 'CAV-008')
  AND is_active = true;

INSERT INTO public.product_redirects (old_code, new_code) VALUES ('CAV-007', 'CAV-009') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('CAV-008', 'CAV-009') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;

INSERT INTO public.products (
  code, name, description, short_description, seo_title, seo_description,
  unit, category, default_price, image_url, is_active, materials,
  search_tags, variant_options, family_slug, calculator_type, wastage_pct,
  length_mm, width_mm, thickness_mm
) VALUES (
  'CAV-009',
  'Cavity Wall Insulation',
  'Cavity Wall Insulation is a partial-fill rigid insulation board for masonry cavity walls, installed between the inner and outer leaves with a residual cavity. Standard 1200mm x 450mm board, available in 100mm and 150mm thicknesses. Select a thickness below for R-values, coverage and trade pricing.',
  'Partial-fill cavity wall insulation — 1200x450mm board in 100mm and 150mm thicknesses.',
  'Cavity Wall Insulation | Star Hawk Builders Merchant',
  'Order Cavity Wall Insulation online. 1200x450mm partial-fill rigid insulation in 100mm and 150mm thicknesses. Trade price and same-day delivery from Star Hawk.',
  'SHEET',
  'Insulation',
  0,
  '/products/cavity-insulation-100mm.webp',
  true,
  '["Mineral wool"]'::jsonb,
  ARRAY['insulation', 'cavity insulation', 'wall insulation', 'partial fill cavity', 'cavity wall insulation', 'cavity batts', 'cavity insulation 100mm', '100mm cavity insulation', 'cavity insulation 150mm', '150mm cavity insulation'],
  '[{"material": "Partial-fill cavity insulation", "image": "/products/cavity-insulation-100mm.webp", "selectors": [{"name": "size", "label": "Thickness", "options": [{"value": "cav-100mm", "text": "100mm"}, {"value": "cav-150mm", "text": "150mm"}]}]}]'::jsonb,
  'cavity-wall-insulation',
  'INSULATION',
  5,
  1200,
  450,
  NULL
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  short_description = EXCLUDED.short_description,
  seo_title = EXCLUDED.seo_title,
  seo_description = EXCLUDED.seo_description,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  materials = EXCLUDED.materials,
  search_tags = EXCLUDED.search_tags,
  variant_options = EXCLUDED.variant_options,
  family_slug = EXCLUDED.family_slug,
  calculator_type = EXCLUDED.calculator_type,
  wastage_pct = EXCLUDED.wastage_pct,
  length_mm = EXCLUDED.length_mm,
  width_mm = EXCLUDED.width_mm,
  is_active = true,
  deleted_at = NULL;

-- ────────────────────────────────────────────────────────────────────────
-- 4. SHEET MATERIALS  (8 rows -> 3 products)
--    SHE-010  OSB3 Board              (SHE-001/006/007 12mm + 18mm + 18mm T&G)
--    SHE-011  Structural Plywood     (SHE-005/008/012/018mm WBP + 18mm shuttering)
--    SHE-012  Chipboard Flooring     (SHE-003 18mm + SHE-009 22mm)
-- ────────────────────────────────────────────────────────────────────────

UPDATE public.products
SET is_active = false, deleted_at = now()
WHERE code IN ('SHE-007', 'SHE-001', 'SHE-006', 'SHE-008', 'SHE-005', 'SHE-004', 'SHE-003', 'SHE-009')
  AND is_active = true;

INSERT INTO public.product_redirects (old_code, new_code) VALUES ('SHE-007', 'SHE-010') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('SHE-001', 'SHE-010') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('SHE-006', 'SHE-010') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('SHE-008', 'SHE-011') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('SHE-005', 'SHE-011') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('SHE-004', 'SHE-011') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('SHE-003', 'SHE-012') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;
INSERT INTO public.product_redirects (old_code, new_code) VALUES ('SHE-009', 'SHE-012') ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;

INSERT INTO public.products (
  code, name, description, short_description, seo_title, seo_description,
  unit, category, default_price, image_url, is_active, materials,
  search_tags, variant_options, family_slug, calculator_type, wastage_pct,
  length_mm, width_mm, thickness_mm
) VALUES

  (
    'SHE-010',
    'OSB3 Board',
    'OSB3 Board is a moisture-resistant oriented strand board for wall sheathing, roof decking, flooring sub-base and general structural use. Load-bearing structural grade to BS EN 300, suitable for use in humid conditions (OSB3). Square edge and Tongue & Groove profiles available, in 12mm and 18mm thicknesses. Select a size below for full dimensions and trade pricing.',
    'Moisture-resistant structural OSB3 board — 12mm and 18mm in square edge or T&G profiles.',
    'OSB3 Board | Star Hawk Builders Merchant',
    'Order OSB3 Board online. 12mm and 18mm structural OSB3 in square edge or T&G profile. Trade price and same-day delivery from Star Hawk.',
    'SHEET',
    'Sheet Materials',
    0,
    '/products/osb3-plywood-12mm.webp',
    true,
    '["OSB3 Board"]'::jsonb,
    ARRAY['sheet material', 'sheet materials', 'board', 'sheet', 'osb', 'osb board', 'osb3', 'oriented strand board', 'structural board', 'OSB3 Board 12mm Square Edge', 'OSB3 Board 18mm Square Edge', 'OSB3 Board 18mm Tongue & Groove'],
    '[{"material": "OSB3 Board", "image": "/products/osb3-plywood-12mm.webp", "selectors": [{"name": "size", "label": "Size", "options": [{"value": "osb3-12mm-se", "text": "12mm Square Edge"}, {"value": "osb3-18mm-se", "text": "18mm Square Edge"}, {"value": "osb3-18mm-tg", "text": "18mm Tongue & Groove"}]}]}]'::jsonb,
    'osb3-board',
    'SHEET_MATERIALS',
    5,
    2440,
    1220,
    NULL
  ),
  (
    'SHE-011',
    'Structural Plywood',
    'Structural Plywood is a high-quality WBP (Weather and Boil Proof) hardwood plywood for shuttering, formwork, exterior cladding, flooring sub-base and general construction. Bonded with phenolic resin for exterior / structural use. Available in 12mm and 18mm thicknesses. Select a size below for full dimensions and trade pricing.',
    'WBP structural hardwood plywood — 12mm and 18mm for shuttering, formwork and exterior use.',
    'Structural Plywood (WBP) | Star Hawk Builders Merchant',
    'Order Structural Plywood online. WBP hardwood plywood in 12mm and 18mm for shuttering, formwork and exterior use. Trade price and same-day delivery from Star Hawk.',
    'SHEET',
    'Sheet Materials',
    0,
    '/products/wbp-plywood-12mm.webp',
    true,
    '["Structural Plywood"]'::jsonb,
    ARRAY['sheet material', 'sheet materials', 'board', 'sheet', 'plywood', 'ply', 'wbp', 'structural plywood', 'shuttering plywood', 'exterior plywood', 'Structural Plywood 12mm WBP', 'Structural Plywood 18mm WBP', 'Structural Plywood 18mm Shuttering'],
    '[{"material": "Structural Plywood", "image": "/products/wbp-plywood-12mm.webp", "selectors": [{"name": "size", "label": "Size", "options": [{"value": "wbp-12mm", "text": "12mm WBP"}, {"value": "wbp-18mm", "text": "18mm WBP"}, {"value": "shutter-18mm", "text": "18mm Shuttering"}]}]}]'::jsonb,
    'structural-plywood',
    'SHEET_MATERIALS',
    5,
    2440,
    1220,
    NULL
  ),
  (
    'SHE-012',
    'Chipboard Flooring',
    'Chipboard Flooring is a high-density tongue-and-groove particleboard for floor decking, loft floors and platform construction. Standard 600mm wide T&G profile, available in 18mm and 22mm thicknesses. Select a thickness below for full dimensions and trade pricing.',
    'T&G chipboard flooring — 18mm and 22mm high-density particleboard.',
    'Chipboard Flooring (T&G) | Star Hawk Builders Merchant',
    'Order Chipboard Flooring online. 18mm and 22mm T&G high-density chipboard for floor decking. Trade price and same-day delivery from Star Hawk.',
    'SHEET',
    'Sheet Materials',
    0,
    '/products/chipboard-22mm.webp',
    true,
    '["Chipboard Flooring"]'::jsonb,
    ARRAY['sheet material', 'sheet materials', 'board', 'sheet', 'chipboard', 'chipboard flooring', 'flooring board', 't&g chipboard', 'particle board', 'Chipboard Flooring 18mm', 'Chipboard Flooring 22mm'],
    '[{"material": "Chipboard Flooring", "image": "/products/chipboard-22mm.webp", "selectors": [{"name": "size", "label": "Size", "options": [{"value": "chip-18mm", "text": "18mm"}, {"value": "chip-22mm", "text": "22mm"}]}]}]'::jsonb,
    'chipboard-flooring',
    'SHEET_MATERIALS',
    5,
    2400,
    600,
    NULL
  )

ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  short_description = EXCLUDED.short_description,
  seo_title = EXCLUDED.seo_title,
  seo_description = EXCLUDED.seo_description,
  category = EXCLUDED.category,
  image_url = EXCLUDED.image_url,
  materials = EXCLUDED.materials,
  search_tags = EXCLUDED.search_tags,
  variant_options = EXCLUDED.variant_options,
  family_slug = EXCLUDED.family_slug,
  calculator_type = EXCLUDED.calculator_type,
  wastage_pct = EXCLUDED.wastage_pct,
  length_mm = EXCLUDED.length_mm,
  width_mm = EXCLUDED.width_mm,
  is_active = true,
  deleted_at = NULL;

COMMIT;
