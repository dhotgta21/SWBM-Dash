-- =============================================================================
-- 157_wireup_and_consolidation.sql
-- =============================================================================
-- Closes the image_url gap for every product in the live DB outside the
-- 80-row catalog-plan.json batch + the 13 existing STL + the 2 existing
-- PIR lines.
--
-- Strategy (per the operator's "one image for size variants" rule):
--
--   1. Per-product wire-ups — 69 products whose IMG-{code}.webp photo
--      already exists on disk but was never assigned to image_url. These
--      are real product photos for products that exist in the live DB
--      but were not in the 2 July import batch (catalog-plan.json).
--      The 111 IMG-* files minus the 22 already wired by 156 and the
--      13 STL-001..013 and 2 PIR-001..002 = 74 (some are renumbering
--      duplicates — see note below).
--
--   2. STL-001..013 consolidation — all 13 existing steel sections
--      collapsed to 6 family images:
--        * 4 steel UBs (STL-001, 002, 003, 008) -> universal-beam
--        * 1 SHS (STL-004) -> square-hollow-section
--        * 1 PFC (STL-005) -> parallel-flange-channels
--        * 1 angle (STL-006) -> equal-angle
--        * 5 concrete lintels (STL-007, 010, 011, 012, 013) -> IMG-STL-007
--          (real photo, reused across all 5 sizes)
--        * 1 perforated steel lintel (STL-009) -> IMG-STL-009
--      Net: 6 distinct images for 13 products.
--
--   3. PIR-001, 002 consolidation -> pir-insulation-board.webp
--      (existing family image; the two per-product photos show the
--      same product at different thicknesses and the family image
--      is sufficient for SEO/visual identification).
--
-- Idempotency: every UPDATE is `WHERE code = '...' AND is_active = true`
-- so re-running is a no-op. The 156 migration and 155 migration remain
-- authoritative for the products they cover.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Per-product wire-ups (74 products)
-- ─────────────────────────────────────────────────────────────────────

UPDATE public.products SET image_url = '/products/IMG-AGG-003.webp' WHERE code = 'AGG-003' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-AGG-006.webp' WHERE code = 'AGG-006' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-AGG-008.webp' WHERE code = 'AGG-008' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BLO-002.webp' WHERE code = 'BLO-002' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BLO-003.webp' WHERE code = 'BLO-003' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-001.webp' WHERE code = 'BRI-001' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-002.webp' WHERE code = 'BRI-002' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-003.webp' WHERE code = 'BRI-003' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-004.webp' WHERE code = 'BRI-004' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-005.webp' WHERE code = 'BRI-005' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-006.webp' WHERE code = 'BRI-006' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-007.webp' WHERE code = 'BRI-007' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-008.webp' WHERE code = 'BRI-008' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-010.webp' WHERE code = 'BRI-010' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-013.webp' WHERE code = 'BRI-013' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-014.webp' WHERE code = 'BRI-014' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-015.webp' WHERE code = 'BRI-015' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-016.webp' WHERE code = 'BRI-016' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-017.webp' WHERE code = 'BRI-017' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-019.webp' WHERE code = 'BRI-019' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-021.webp' WHERE code = 'BRI-021' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-022.webp' WHERE code = 'BRI-022' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-023.webp' WHERE code = 'BRI-023' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-024.webp' WHERE code = 'BRI-024' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-025.webp' WHERE code = 'BRI-025' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-026.webp' WHERE code = 'BRI-026' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-027.webp' WHERE code = 'BRI-027' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-029.webp' WHERE code = 'BRI-029' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-030.webp' WHERE code = 'BRI-030' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-BRI-031.webp' WHERE code = 'BRI-031' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-CAV-001.webp' WHERE code = 'CAV-001' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-CAV-002.webp' WHERE code = 'CAV-002' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-CAV-003.webp' WHERE code = 'CAV-003' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-CAV-004.webp' WHERE code = 'CAV-004' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-CAV-005.webp' WHERE code = 'CAV-005' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-001.webp' WHERE code = 'FIX-001' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-002.webp' WHERE code = 'FIX-002' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-003.webp' WHERE code = 'FIX-003' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-004.webp' WHERE code = 'FIX-004' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-005.webp' WHERE code = 'FIX-005' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-006.webp' WHERE code = 'FIX-006' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-007.webp' WHERE code = 'FIX-007' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-008.webp' WHERE code = 'FIX-008' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-009.webp' WHERE code = 'FIX-009' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-010.webp' WHERE code = 'FIX-010' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-011.webp' WHERE code = 'FIX-011' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-012.webp' WHERE code = 'FIX-012' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-013.webp' WHERE code = 'FIX-013' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-014.webp' WHERE code = 'FIX-014' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-015.webp' WHERE code = 'FIX-015' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-FIX-016.webp' WHERE code = 'FIX-016' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-PLA-001.webp' WHERE code = 'PLA-001' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-PLA-002.webp' WHERE code = 'PLA-002' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-PLA-003.webp' WHERE code = 'PLA-003' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-PLA-004.webp' WHERE code = 'PLA-004' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-001.webp' WHERE code = 'ROO-001' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-002.webp' WHERE code = 'ROO-002' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-003.webp' WHERE code = 'ROO-003' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-004.webp' WHERE code = 'ROO-004' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-005.webp' WHERE code = 'ROO-005' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-006.webp' WHERE code = 'ROO-006' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-007.webp' WHERE code = 'ROO-007' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-008.webp' WHERE code = 'ROO-008' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-009.webp' WHERE code = 'ROO-009' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-010.webp' WHERE code = 'ROO-010' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-011.webp' WHERE code = 'ROO-011' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-012.webp' WHERE code = 'ROO-012' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-013.webp' WHERE code = 'ROO-013' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-014.webp' WHERE code = 'ROO-014' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-015.webp' WHERE code = 'ROO-015' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-ROO-016.webp' WHERE code = 'ROO-016' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-SHE-002.webp' WHERE code = 'SHE-002' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-TIM-001.webp' WHERE code = 'TIM-001' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-TIM-002.webp' WHERE code = 'TIM-002' AND is_active = true;

-- ─────────────────────────────────────────────────────────────────────
-- 2. STL-001..013 consolidation (13 products → 6 family images)
-- ─────────────────────────────────────────────────────────────────────

UPDATE public.products SET image_url = '/products/universal-beam-mild-steel.webp' WHERE code = 'STL-001' AND is_active = true;
UPDATE public.products SET image_url = '/products/universal-beam-mild-steel.webp' WHERE code = 'STL-002' AND is_active = true;
UPDATE public.products SET image_url = '/products/universal-beam-mild-steel.webp' WHERE code = 'STL-003' AND is_active = true;
UPDATE public.products SET image_url = '/products/square-hollow-section-mild-steel.webp' WHERE code = 'STL-004' AND is_active = true;
UPDATE public.products SET image_url = '/products/parallel-flange-channels-mild-steel.webp' WHERE code = 'STL-005' AND is_active = true;
UPDATE public.products SET image_url = '/products/equal-angle-mild-steel.webp' WHERE code = 'STL-006' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-STL-007.webp' WHERE code = 'STL-007' AND is_active = true;
UPDATE public.products SET image_url = '/products/universal-beam-mild-steel.webp' WHERE code = 'STL-008' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-STL-009.webp' WHERE code = 'STL-009' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-STL-007.webp' WHERE code = 'STL-010' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-STL-007.webp' WHERE code = 'STL-011' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-STL-007.webp' WHERE code = 'STL-012' AND is_active = true;
UPDATE public.products SET image_url = '/products/IMG-STL-007.webp' WHERE code = 'STL-013' AND is_active = true;

-- ─────────────────────────────────────────────────────────────────────
-- 3. PIR-001, 002 consolidation (2 products → 1 family image)
-- ─────────────────────────────────────────────────────────────────────

UPDATE public.products SET image_url = '/products/pir-insulation-board.webp' WHERE code = 'PIR-001' AND is_active = true;
UPDATE public.products SET image_url = '/products/pir-insulation-board.webp' WHERE code = 'PIR-002' AND is_active = true;

COMMIT;
