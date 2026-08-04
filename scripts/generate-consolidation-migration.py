"""Generate the comprehensive wire-up + consolidation migration (157).

Per the operator's "one image for size variants" rule, this migration
finalises the image_url field for every product in the catalogue:

  * 89 per-product IMG-{code}.webp files on disk get wired up to the
    matching product code. These are real product photos for products
    that exist in the live DB but were never part of the 2 July
    catalog-plan.json batch.
  * The 13 existing STL-001..013 are consolidated to family images
    (per the operator's request — same product type = same image):
      STL-001, 002, 003, 008  -> universal-beam-mild-steel.webp (UB)
      STL-004                -> square-hollow-section-mild-steel.webp (SHS)
      STL-005                -> parallel-flange-channels-mild-steel.webp (PFC)
      STL-006                -> equal-angle-mild-steel.webp (angle)
      STL-007, 010, 011, 012, 013 -> IMG-STL-007.webp (concrete lintel,
        reused for all 5 concrete lintels — one image, multiple sizes)
      STL-009                -> IMG-STL-009.webp (perforated steel lintel,
        only one product of this type)
  * PIR-001, 002 are consolidated to the existing family image
    pir-insulation-board.webp (the two existing per-product photos
    show the same product at different thicknesses; one image suffices).

The 80 catalog-plan products were already covered by migration 156.
The 59 new steel sections (UB/UC/SHS/Flat) will be covered by migration
155. This migration closes the gap on every other product in the live DB
that we know about from the IMG-{code}.webp inventory.

Run from the repo root:

    python scripts/generate-consolidation-migration.py

Output:

    supabase/migrations/157_wireup_and_consolidation.sql
"""

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
IMG_DIR = REPO / "public" / "products"
OUT_PATH = REPO / "supabase" / "migrations" / "157_wireup_and_consolidation.sql"


# ---------------------------------------------------------------------------
# 1. Per-product wire-ups: every IMG-{CODE}.webp we found on disk
#    (except STL-001..013 which are handled by the consolidation block).
# ---------------------------------------------------------------------------

def sql_string(s: str | None) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


# Collect every IMG-{code}.webp on disk
img_per_code = {}
for p in IMG_DIR.glob("IMG-*.webp"):
    m = re.match(r"^IMG-([A-Z]{3}-\d{3})\.webp$", p.name)
    if m:
        img_per_code[m.group(1)] = p.name

# 156 already wired 22 of these to catalog-plan products. Skip those.
PLAN_WIRED = {
    "AGG-005", "AGG-002", "AGG-004", "AGG-007", "AGG-001",
    "PLA-008", "PLA-007", "PLA-005", "PLA-006",
    "BLO-004", "BLO-001",
    "CAV-006", "CAV-007", "CAV-008",
    "BRI-018", "BRI-028", "BRI-009", "BRI-011", "BRI-020", "BRI-012", "BRI-032", "BRI-033",
    "SHE-004", "SHE-001", "SHE-005", "SHE-003", "SHE-006", "SHE-007", "SHE-008", "SHE-009",
    "PIR-003", "PIR-004", "PIR-005", "PIR-006", "PIR-007", "PIR-008",
    *{f"TIM-{n:03d}" for n in range(3, 46)},
    "AGG-009",
}

# The 13 STL-001..013 will be consolidated, so skip them here.
STL_TO_CONSOLIDATE = {f"STL-{n:03d}" for n in range(1, 14)}

# PIR-001, 002 will be consolidated to the family image too
PIR_TO_CONSOLIDATE = {"PIR-001", "PIR-002"}

per_product_wireups = []
consolidated = []
for code, fn in sorted(img_per_code.items()):
    if code in PLAN_WIRED:
        continue
    if code in STL_TO_CONSOLIDATE:
        consolidated.append(code)
        continue
    if code in PIR_TO_CONSOLIDATE:
        consolidated.append(code)
        continue
    per_product_wireups.append((code, fn))


# ---------------------------------------------------------------------------
# 2. Consolidation map for the 13 existing STL + 2 PIR.
# ---------------------------------------------------------------------------

STL_CONSOLIDATION = {
    "STL-001": "/products/universal-beam-mild-steel.webp",
    "STL-002": "/products/universal-beam-mild-steel.webp",
    "STL-003": "/products/universal-beam-mild-steel.webp",
    "STL-008": "/products/universal-beam-mild-steel.webp",
    "STL-004": "/products/square-hollow-section-mild-steel.webp",
    "STL-005": "/products/parallel-flange-channels-mild-steel.webp",
    "STL-006": "/products/equal-angle-mild-steel.webp",
    "STL-007": "/products/IMG-STL-007.webp",
    "STL-010": "/products/IMG-STL-007.webp",
    "STL-011": "/products/IMG-STL-007.webp",
    "STL-012": "/products/IMG-STL-007.webp",
    "STL-013": "/products/IMG-STL-007.webp",
    "STL-009": "/products/IMG-STL-009.webp",
}

PIR_CONSOLIDATION = {
    "PIR-001": "/products/pir-insulation-board.webp",
    "PIR-002": "/products/pir-insulation-board.webp",
}


# ---------------------------------------------------------------------------
# 3. Build the migration
# ---------------------------------------------------------------------------

HEADER = """\
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
"""

FOOTER = "\nCOMMIT;\n"


def main():
    parts = [HEADER]

    # 1. Per-product wire-ups
    parts.append(f"\n-- ─────────────────────────────────────────────────────────────────────\n")
    parts.append(f"-- 1. Per-product wire-ups ({len(per_product_wireups)} products)\n")
    parts.append(f"-- ─────────────────────────────────────────────────────────────────────\n\n")
    for code, fn in per_product_wireups:
        parts.append(
            f"UPDATE public.products SET image_url = {sql_string('/products/' + fn)} "
            f"WHERE code = {sql_string(code)} AND is_active = true;\n"
        )

    # 2. STL consolidation
    parts.append(f"\n-- ─────────────────────────────────────────────────────────────────────\n")
    parts.append(f"-- 2. STL-001..013 consolidation ({len(STL_CONSOLIDATION)} products → 6 family images)\n")
    parts.append(f"-- ─────────────────────────────────────────────────────────────────────\n\n")
    for code, url in sorted(STL_CONSOLIDATION.items()):
        parts.append(
            f"UPDATE public.products SET image_url = {sql_string(url)} "
            f"WHERE code = {sql_string(code)} AND is_active = true;\n"
        )

    # 3. PIR consolidation
    parts.append(f"\n-- ─────────────────────────────────────────────────────────────────────\n")
    parts.append(f"-- 3. PIR-001, 002 consolidation ({len(PIR_CONSOLIDATION)} products → 1 family image)\n")
    parts.append(f"-- ─────────────────────────────────────────────────────────────────────\n\n")
    for code, url in sorted(PIR_CONSOLIDATION.items()):
        parts.append(
            f"UPDATE public.products SET image_url = {sql_string(url)} "
            f"WHERE code = {sql_string(code)} AND is_active = true;\n"
        )

    parts.append(FOOTER)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text("".join(parts), encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    print(f"  - {len(per_product_wireups)} per-product wire-ups")
    print(f"  - {len(STL_CONSOLIDATION)} STL consolidations -> 6 family images")
    print(f"  - {len(PIR_CONSOLIDATION)} PIR consolidations -> 1 family image")
    print()
    print("Per-product wire-ups by prefix:")
    by_prefix = {}
    for code, _ in per_product_wireups:
        prefix = code.split("-")[0]
        by_prefix.setdefault(prefix, []).append(code)
    for prefix in sorted(by_prefix):
        codes = by_prefix[prefix]
        print(f"  {prefix}: {len(codes)} products  e.g. {', '.join(codes[:3])}{'...' if len(codes) > 3 else ''}")


if __name__ == "__main__":
    main()
