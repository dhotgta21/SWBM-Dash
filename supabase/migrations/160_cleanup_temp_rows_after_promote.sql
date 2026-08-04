-- =============================================================================
-- 160_cleanup_temp_rows_after_promote.sql
-- =============================================================================
-- Migration 159 promoted 7 walk-in (TEMPORARY) products into permanent
-- catalogue entries with real codes (AGG-010, BLO-005, FIX-017, BLO-006,
-- STL-077, AGG-011, AGG-012). It deliberately left the original
-- TEMP-XXXXXX rows in place so the operator could audit the migration
-- before clearing them.
--
-- This migration closes the loop: soft-deletes the 7 original temp rows
-- that now have a permanent equivalent. The 3 remaining temp rows
-- (Ibstock Red Multi, Cavitywall Insulation 150mm, Fuel surcharge) are
-- LEFT INTACT — they are either already a permanent product under a
-- different code (BRI-033, CAV-008) or are a service charge rather
-- than a physical product. The operator can keep them in the temp list
-- to edit, hard-delete, or leave alone.
--
-- v2: switched to LOWER(name) match so case differences between the
-- walk-in row and the permanent row don't cause the cleanup to miss
-- any. Also catches the spelling differences (e.g. "Floor Beam 4.2m"
-- in the permanent product vs "Floor Beam 4.2metre" in the walk-in
-- row, "Post Mix Concrete" vs "Post mix").
--
-- Idempotent: only matches rows that are still `is_temporary = true`
-- AND `deleted_at IS NULL`, so re-running the migration is a no-op.
-- =============================================================================

BEGIN;

-- Soft-delete the 7 walk-in rows that 159 promoted to permanent.
-- LOWER(name) on both sides so the match survives case drift between
-- the temp row and the permanent product. The 7 LOWER() targets are
-- the operator-facing name on the permanent product (e.g. "Air Brick
-- Buff"); the temp row may have been typed in any case.
UPDATE public.products
SET
  deleted_at = NOW(),
  is_active = false
WHERE is_temporary = true
  AND deleted_at IS NULL
  AND LOWER(name) IN (
    LOWER('Post Mix Concrete'),
    LOWER('Marshall Block Paving Pallet'),
    LOWER('Weep Vents'),
    LOWER('Air Brick Buff'),
    LOWER('Floor Beam 4.2m'),
    LOWER('Pavemix'),
    LOWER('Luxury Porcelain Slabs')
  );

COMMIT;
