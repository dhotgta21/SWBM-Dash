-- =============================================================================
-- 156_image_wireup_seo_searchtags.sql
-- =============================================================================
-- Deep-dive audit follow-up for the 80 products in catalog-plan.json:
--
--   1. Wire up the 22 products whose IMG-{code}.webp photo already exists
--      in public/products/ but was never assigned to image_url.
--   2. Wire up the 58 products that didn't have a per-product photo —
--      they share one of 16 family images (timber-c24-3x2.webp etc.)
--      that the operator drops into public/products/ before this migration
--      runs. The product NAME carries the actual length / size, so the
--      family image is enough to identify the cross-section.
--   3. Backfill search_tags for every product in this batch — the 061
--      migration only set tags on a subset of rows, so internal search was
--      degraded for the newer catalog rows. Tags include the technical
--      designation, common synonyms, and category words so a search for
--      "mortar sand" hits Building Sand, "drywall" hits PLA-008, etc.
--   4. Trim 3 over-long seo_titles and 3 over-long seo_descriptions
--      so they sit under the 60/160 char caps and don't get truncated
--      by lib/seo/page-defaults.ts:truncateOnWord.
--
-- Idempotent: every UPDATE is `WHERE code = '...'` so re-running
-- against a row that's already been updated is a no-op (the value
-- simply gets re-assigned to itself).
-- =============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Wire up existing IMG-{code}.webp files
--    (22 products)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.products SET image_url = '/products/IMG-AGG-005.webp' WHERE code = 'AGG-005' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-AGG-002.webp' WHERE code = 'AGG-002' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-AGG-004.webp' WHERE code = 'AGG-004' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-AGG-007.webp' WHERE code = 'AGG-007' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-AGG-001.webp' WHERE code = 'AGG-001' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-PLA-008.webp' WHERE code = 'PLA-008' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-PLA-007.webp' WHERE code = 'PLA-007' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-PLA-005.webp' WHERE code = 'PLA-005' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-PLA-006.webp' WHERE code = 'PLA-006' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BLO-004.webp' WHERE code = 'BLO-004' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BLO-001.webp' WHERE code = 'BLO-001' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-CAV-006.webp' WHERE code = 'CAV-006' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-018.webp' WHERE code = 'BRI-018' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-028.webp' WHERE code = 'BRI-028' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-009.webp' WHERE code = 'BRI-009' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-011.webp' WHERE code = 'BRI-011' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-020.webp' WHERE code = 'BRI-020' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-012.webp' WHERE code = 'BRI-012' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-SHE-004.webp' WHERE code = 'SHE-004' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-SHE-001.webp' WHERE code = 'SHE-001' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-SHE-005.webp' WHERE code = 'SHE-005' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-SHE-003.webp' WHERE code = 'SHE-003' AND is_active = true;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Wire up family images for products without a per-product photo
--    (58 products, 16 unique images — drop the family
--    WebP files into public/products/ before running this migration)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.products SET image_url = '/products/plaster-sand-large-bag.webp' WHERE code = 'AGG-009' AND is_active = true;
UPDATE public.products SET image_url = '/products/cavity-insulation-100mm.webp' WHERE code = 'CAV-007' AND is_active = true;
UPDATE public.products SET image_url = '/products/cavity-insulation-150mm.webp' WHERE code = 'CAV-008' AND is_active = true;
UPDATE public.products SET image_url = '/products/sandface-brick.webp' WHERE code = 'BRI-032' AND is_active = true;
UPDATE public.products SET image_url = '/products/ibstock-multi-red-brick.webp' WHERE code = 'BRI-033' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-3x2.webp' WHERE code = 'TIM-003' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-3x2.webp' WHERE code = 'TIM-004' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-3x2.webp' WHERE code = 'TIM-005' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-3x2.webp' WHERE code = 'TIM-006' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-3x2.webp' WHERE code = 'TIM-007' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-3x2.webp' WHERE code = 'TIM-008' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-3x2.webp' WHERE code = 'TIM-009' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-4x2.webp' WHERE code = 'TIM-010' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-4x2.webp' WHERE code = 'TIM-011' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-4x2.webp' WHERE code = 'TIM-012' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-4x2.webp' WHERE code = 'TIM-013' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-4x2.webp' WHERE code = 'TIM-014' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-4x2.webp' WHERE code = 'TIM-015' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-4x2.webp' WHERE code = 'TIM-016' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-6x2.webp' WHERE code = 'TIM-017' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-6x2.webp' WHERE code = 'TIM-018' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-6x2.webp' WHERE code = 'TIM-019' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-6x2.webp' WHERE code = 'TIM-020' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-6x2.webp' WHERE code = 'TIM-021' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-6x2.webp' WHERE code = 'TIM-022' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-6x2.webp' WHERE code = 'TIM-023' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-7x2.webp' WHERE code = 'TIM-024' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-7x2.webp' WHERE code = 'TIM-025' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-7x2.webp' WHERE code = 'TIM-026' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-7x2.webp' WHERE code = 'TIM-027' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-7x2.webp' WHERE code = 'TIM-028' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-7x2.webp' WHERE code = 'TIM-029' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-7x2.webp' WHERE code = 'TIM-030' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-8x2.webp' WHERE code = 'TIM-031' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-8x2.webp' WHERE code = 'TIM-032' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-8x2.webp' WHERE code = 'TIM-033' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-8x2.webp' WHERE code = 'TIM-034' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-8x2.webp' WHERE code = 'TIM-035' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-8x2.webp' WHERE code = 'TIM-036' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-8x2.webp' WHERE code = 'TIM-037' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-9x2.webp' WHERE code = 'TIM-038' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-9x2.webp' WHERE code = 'TIM-039' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-9x2.webp' WHERE code = 'TIM-040' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-9x2.webp' WHERE code = 'TIM-041' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-9x2.webp' WHERE code = 'TIM-042' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-9x2.webp' WHERE code = 'TIM-043' AND is_active = true;
UPDATE public.products SET image_url = '/products/timber-c24-9x2.webp' WHERE code = 'TIM-044' AND is_active = true;
UPDATE public.products SET image_url = '/products/pir-insulation-board.webp' WHERE code = 'PIR-003' AND is_active = true;
UPDATE public.products SET image_url = '/products/pir-insulation-board.webp' WHERE code = 'PIR-004' AND is_active = true;
UPDATE public.products SET image_url = '/products/pir-insulation-board.webp' WHERE code = 'PIR-005' AND is_active = true;
UPDATE public.products SET image_url = '/products/pir-insulation-board.webp' WHERE code = 'PIR-006' AND is_active = true;
UPDATE public.products SET image_url = '/products/pir-insulation-board.webp' WHERE code = 'PIR-007' AND is_active = true;
UPDATE public.products SET image_url = '/products/pir-insulation-board.webp' WHERE code = 'PIR-008' AND is_active = true;
UPDATE public.products SET image_url = '/products/osb3-tongue-groove-18mm.webp' WHERE code = 'SHE-006' AND is_active = true;
UPDATE public.products SET image_url = '/products/osb3-plywood-12mm.webp' WHERE code = 'SHE-007' AND is_active = true;
UPDATE public.products SET image_url = '/products/wbp-plywood-12mm.webp' WHERE code = 'SHE-008' AND is_active = true;
UPDATE public.products SET image_url = '/products/chipboard-22mm.webp' WHERE code = 'SHE-009' AND is_active = true;
UPDATE public.products SET image_url = '/products/treated-timber-batten-25x38.webp' WHERE code = 'TIM-045' AND is_active = true;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Backfill search_tags for every catalog-plan product
--    (80 products)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.products SET search_tags = ARRAY['cement', 'portland cement', 'general purpose cement', '25kg cement'] WHERE code = 'AGG-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['sand', 'sharp sand', 'grit sand', 'concrete sand', 'mortar sand'] WHERE code = 'AGG-002' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['mot type 1', 'hardcore', 'sub base', 'sub-base', 'type 1'] WHERE code = 'AGG-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['sand', 'building sand', 'soft sand', 'mortar sand', 'bricklaying sand'] WHERE code = 'AGG-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['gravel', 'aggregate', 'ballast', 'all in ballast', '20mm'] WHERE code = 'AGG-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['sand', 'plaster sand', 'rendering sand', 'plastering sand', 'fine sand'] WHERE code = 'AGG-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'moisture resistant plasterboard', 'green board', 'bathroom plasterboard'] WHERE code = 'PLA-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'acoustic plasterboard', 'sound board', 'soundproof plasterboard'] WHERE code = 'PLA-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'fire rated plasterboard', 'fire board', 'fire resistant plasterboard'] WHERE code = 'PLA-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plasterboard', 'plaster board', 'drywall', 'gypsum board', 'standard plasterboard', 'wall board', 'ceiling board'] WHERE code = 'PLA-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['block', 'building block', 'dense block', 'concrete block', 'solid block', '100mm dense block', '7.3n block'] WHERE code = 'BLO-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['block', 'building block', 'thermalite', 'aircrete', 'lightweight block', '100mm thermalite', '3.6n block'] WHERE code = 'BLO-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'tobacco brick', 'red brick'] WHERE code = 'BRI-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'tuscan red', 'multi brick', 'red multi'] WHERE code = 'BRI-011' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'engineering brick', 'slate blue', 'class b engineering'] WHERE code = 'BRI-012' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'heather brick', 'purple brick'] WHERE code = 'BRI-018' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'dapple light', 'buff brick', 'light brick'] WHERE code = 'BRI-020' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'rustic antique', 'antique brick', 'reclaimed look'] WHERE code = 'BRI-028' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'sandface', 'sand faced', 'red sandface'] WHERE code = 'BRI-032' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['brick', 'facing brick', 'ibstock', 'multi red', 'ibstock multi red'] WHERE code = 'BRI-033' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'cavity insulation', 'wall insulation', 'full fill cavity', '90mm insulation'] WHERE code = 'CAV-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'cavity insulation', 'wall insulation', 'full fill cavity', '100mm insulation'] WHERE code = 'CAV-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'cavity insulation', 'wall insulation', 'full fill cavity', '150mm insulation'] WHERE code = 'CAV-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board', '25mm pir', 'pir 25mm'] WHERE code = 'PIR-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board', '50mm pir', 'pir 50mm'] WHERE code = 'PIR-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board', '70mm pir', 'pir 70mm'] WHERE code = 'PIR-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board', '100mm pir', 'pir 100mm'] WHERE code = 'PIR-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board', '120mm pir', 'pir 120mm'] WHERE code = 'PIR-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['insulation', 'pir insulation', 'rigid insulation', 'foam board', '150mm pir', 'pir 150mm'] WHERE code = 'PIR-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['osb', 'osb board', 'osb3', 'oriented strand board', '18mm osb', 'osb3 18mm'] WHERE code = 'SHE-001' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['chipboard', 'chipboard flooring', 'flooring board', '18mm chipboard', 't&g chipboard'] WHERE code = 'SHE-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['plywood', 'ply', 'sheet board', 'shuttering plywood', 'shuttering ply', 'formwork plywood', '18mm plywood'] WHERE code = 'SHE-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['wbp plywood', 'exterior plywood', '18mm wbp', 'plywood', 'ply', 'sheet board'] WHERE code = 'SHE-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['osb', 'osb board', 'osb3', 'oriented strand board', 'tongue and groove osb', 't&g osb', '18mm osb t&g'] WHERE code = 'SHE-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['osb', 'osb board', 'osb3', 'oriented strand board', '12mm osb', 'osb3 12mm'] WHERE code = 'SHE-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['wbp plywood', 'exterior plywood', '12mm wbp', 'plywood', 'ply', 'sheet board', '12mm plywood'] WHERE code = 'SHE-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['chipboard', 'chipboard flooring', 'flooring board', '22mm chipboard', 't&g chipboard 22mm'] WHERE code = 'SHE-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber'] WHERE code = 'TIM-003' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber'] WHERE code = 'TIM-004' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber'] WHERE code = 'TIM-005' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber'] WHERE code = 'TIM-006' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber'] WHERE code = 'TIM-007' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber'] WHERE code = 'TIM-008' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '3x2 timber'] WHERE code = 'TIM-009' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber'] WHERE code = 'TIM-010' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber'] WHERE code = 'TIM-011' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber'] WHERE code = 'TIM-012' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber'] WHERE code = 'TIM-013' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber'] WHERE code = 'TIM-014' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber'] WHERE code = 'TIM-015' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '4x2 timber'] WHERE code = 'TIM-016' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber'] WHERE code = 'TIM-017' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber'] WHERE code = 'TIM-018' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber'] WHERE code = 'TIM-019' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber'] WHERE code = 'TIM-020' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber'] WHERE code = 'TIM-021' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber'] WHERE code = 'TIM-022' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '6x2 timber'] WHERE code = 'TIM-023' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber'] WHERE code = 'TIM-024' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber'] WHERE code = 'TIM-025' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber'] WHERE code = 'TIM-026' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber'] WHERE code = 'TIM-027' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber'] WHERE code = 'TIM-028' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber'] WHERE code = 'TIM-029' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '7x2 timber'] WHERE code = 'TIM-030' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber'] WHERE code = 'TIM-031' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber'] WHERE code = 'TIM-032' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber'] WHERE code = 'TIM-033' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber'] WHERE code = 'TIM-034' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber'] WHERE code = 'TIM-035' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber'] WHERE code = 'TIM-036' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '8x2 timber'] WHERE code = 'TIM-037' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber'] WHERE code = 'TIM-038' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber'] WHERE code = 'TIM-039' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber'] WHERE code = 'TIM-040' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber'] WHERE code = 'TIM-041' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber'] WHERE code = 'TIM-042' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber'] WHERE code = 'TIM-043' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber', 'c24 timber', 'carcassing timber', 'structural timber', '9x2 timber'] WHERE code = 'TIM-044' AND is_active = true;
UPDATE public.products SET search_tags = ARRAY['timber batten', 'roofing batten', 'treated batten', '25x38 batten', 'tanilised batten', 'timber'] WHERE code = 'TIM-045' AND is_active = true;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Trim over-long SEO titles + descriptions
--    (3 products)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.products SET
  seo_title = 'Moisture Resistant Plasterboard | Star Hawk',
  seo_description = 'Order Moisture Resistant Plasterboard 12.5mm online. Green face for kitchens, bathrooms and humid areas. Same-day delivery from Star Hawk.'
WHERE code = 'PLA-005' AND is_active = true;
UPDATE public.products SET
  seo_title = '100mm Dense Concrete Block 7.3N | Star Hawk',
  seo_description = 'Order 100mm Dense Concrete Block 7.3N online. Load-bearing dense aggregate block, 440x215x100mm. Trade price and site delivery from Star Hawk.'
WHERE code = 'BLO-001' AND is_active = true;
UPDATE public.products SET
  seo_title = 'Full Fill Cavity Insulation 90mm | Star Hawk',
  seo_description = 'Order Full Fill Cavity Insulation 90mm online. Rigid full-fill insulation board for cavity walls. Trade price and same-day delivery from Star Hawk.'
WHERE code = 'CAV-006' AND is_active = true;

COMMIT;
