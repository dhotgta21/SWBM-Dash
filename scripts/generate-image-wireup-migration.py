"""Generate the wire-up + SEO fix + search_tags backfill migration.

This script emits SQL UPDATE statements that:

  1. Set image_url on the 22 catalog-plan products that already have an
     IMG-{code}.webp file sitting in public/products/ (just unwired).
  2. Set image_url on the 58 catalog-plan products that don't have an
     IMG-{code}.webp file yet — these point to family images we'll
     generate separately (timber-c24-3x2.webp, etc.).
  3. Backfill search_tags for every product in the catalog-plan batch
     (the 061 migration only set tags on a subset of rows).
  4. Trim the 3 over-long SEO titles and 3 over-long SEO descriptions
     so they sit under the 60/160 char caps.

Run from the repo root:

    python scripts/generate-image-wireup-migration.py

Output:

    supabase/migrations/156_image_wireup_seo_searchtags.sql
"""

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PLAN = REPO / "catalog-plan.json"
IMG_DIR = REPO / "public" / "products"
OUT_PATH = REPO / "supabase" / "migrations" / "156_image_wireup_seo_searchtags.sql"

# ---------------------------------------------------------------------------
# Family-image plan for products that don't have an IMG-{code}.webp yet.
# Each entry maps product codes to the shared family image filename. We
# deliberately reuse one image across similar sizes (e.g. every 3x2 C24
# timber length shares the same family image) — the product name carries
# the actual length and the family image carries the cross-section shape.
# ---------------------------------------------------------------------------

FAMILY_IMAGE = {
    # AGG — Aggregates & Cement
    "AGG-009": "/products/plaster-sand-large-bag.webp",
    # CAV — Cavity Insulation
    "CAV-007": "/products/cavity-insulation-100mm.webp",
    "CAV-008": "/products/cavity-insulation-150mm.webp",
    # BRI — Bricks
    "BRI-032": "/products/sandface-brick.webp",
    "BRI-033": "/products/ibstock-multi-red-brick.webp",
    # PIR — PIR Insulation (one image for the whole family)
    "PIR-003": "/products/pir-insulation-board.webp",
    "PIR-004": "/products/pir-insulation-board.webp",
    "PIR-005": "/products/pir-insulation-board.webp",
    "PIR-006": "/products/pir-insulation-board.webp",
    "PIR-007": "/products/pir-insulation-board.webp",
    "PIR-008": "/products/pir-insulation-board.webp",
    # SHE — Sheet Materials
    "SHE-006": "/products/osb3-tongue-groove-18mm.webp",
    "SHE-007": "/products/osb3-plywood-12mm.webp",
    "SHE-008": "/products/wbp-plywood-12mm.webp",
    "SHE-009": "/products/chipboard-22mm.webp",
    # TIM — Timber (one image per cross-section, shared across all lengths)
    "TIM-003": "/products/timber-c24-3x2.webp",
    "TIM-004": "/products/timber-c24-3x2.webp",
    "TIM-005": "/products/timber-c24-3x2.webp",
    "TIM-006": "/products/timber-c24-3x2.webp",
    "TIM-007": "/products/timber-c24-3x2.webp",
    "TIM-008": "/products/timber-c24-3x2.webp",
    "TIM-009": "/products/timber-c24-3x2.webp",
    "TIM-010": "/products/timber-c24-4x2.webp",
    "TIM-011": "/products/timber-c24-4x2.webp",
    "TIM-012": "/products/timber-c24-4x2.webp",
    "TIM-013": "/products/timber-c24-4x2.webp",
    "TIM-014": "/products/timber-c24-4x2.webp",
    "TIM-015": "/products/timber-c24-4x2.webp",
    "TIM-016": "/products/timber-c24-4x2.webp",
    "TIM-017": "/products/timber-c24-6x2.webp",
    "TIM-018": "/products/timber-c24-6x2.webp",
    "TIM-019": "/products/timber-c24-6x2.webp",
    "TIM-020": "/products/timber-c24-6x2.webp",
    "TIM-021": "/products/timber-c24-6x2.webp",
    "TIM-022": "/products/timber-c24-6x2.webp",
    "TIM-023": "/products/timber-c24-6x2.webp",
    "TIM-024": "/products/timber-c24-7x2.webp",
    "TIM-025": "/products/timber-c24-7x2.webp",
    "TIM-026": "/products/timber-c24-7x2.webp",
    "TIM-027": "/products/timber-c24-7x2.webp",
    "TIM-028": "/products/timber-c24-7x2.webp",
    "TIM-029": "/products/timber-c24-7x2.webp",
    "TIM-030": "/products/timber-c24-7x2.webp",
    "TIM-031": "/products/timber-c24-8x2.webp",
    "TIM-032": "/products/timber-c24-8x2.webp",
    "TIM-033": "/products/timber-c24-8x2.webp",
    "TIM-034": "/products/timber-c24-8x2.webp",
    "TIM-035": "/products/timber-c24-8x2.webp",
    "TIM-036": "/products/timber-c24-8x2.webp",
    "TIM-037": "/products/timber-c24-8x2.webp",
    "TIM-038": "/products/timber-c24-9x2.webp",
    "TIM-039": "/products/timber-c24-9x2.webp",
    "TIM-040": "/products/timber-c24-9x2.webp",
    "TIM-041": "/products/timber-c24-9x2.webp",
    "TIM-042": "/products/timber-c24-9x2.webp",
    "TIM-043": "/products/timber-c24-9x2.webp",
    "TIM-044": "/products/timber-c24-9x2.webp",
    "TIM-045": "/products/treated-timber-batten-25x38.webp",
}

# ---------------------------------------------------------------------------
# search_tags backfill — product codes mapped to a list of search terms
# the hybrid search will weight. Tags include the technical designation,
# common synonyms, and category words so a search for "mortar sand" hits
# Building Sand, a search for "plasterboard drywall" hits PLA-008, etc.
# ---------------------------------------------------------------------------

SEARCH_TAGS = {
    # Aggregates & Cement
    "AGG-001": ["cement", "portland cement", "general purpose cement", "25kg cement"],
    "AGG-002": ["sand", "sharp sand", "grit sand", "concrete sand", "mortar sand"],
    "AGG-004": ["mot type 1", "hardcore", "sub base", "sub-base", "type 1"],
    "AGG-005": ["sand", "building sand", "soft sand", "mortar sand", "bricklaying sand"],
    "AGG-007": ["gravel", "aggregate", "ballast", "all in ballast", "20mm"],
    "AGG-009": ["sand", "plaster sand", "rendering sand", "plastering sand", "fine sand"],
    # Plasterboard
    "PLA-005": ["plasterboard", "plaster board", "drywall", "gypsum board",
                "moisture resistant plasterboard", "green board", "bathroom plasterboard"],
    "PLA-006": ["plasterboard", "plaster board", "drywall", "gypsum board",
                "acoustic plasterboard", "sound board", "soundproof plasterboard"],
    "PLA-007": ["plasterboard", "plaster board", "drywall", "gypsum board",
                "fire rated plasterboard", "fire board", "fire resistant plasterboard"],
    "PLA-008": ["plasterboard", "plaster board", "drywall", "gypsum board",
                "standard plasterboard", "wall board", "ceiling board"],
    # Blocks
    "BLO-001": ["block", "building block", "dense block", "concrete block",
                "solid block", "100mm dense block", "7.3n block"],
    "BLO-004": ["block", "building block", "thermalite", "aircrete",
                "lightweight block", "100mm thermalite", "3.6n block"],
    # Bricks
    "BRI-009": ["brick", "facing brick", "tobacco brick", "red brick"],
    "BRI-011": ["brick", "facing brick", "tuscan red", "multi brick", "red multi"],
    "BRI-012": ["brick", "engineering brick", "slate blue", "class b engineering"],
    "BRI-018": ["brick", "facing brick", "heather brick", "purple brick"],
    "BRI-020": ["brick", "facing brick", "dapple light", "buff brick", "light brick"],
    "BRI-028": ["brick", "facing brick", "rustic antique", "antique brick", "reclaimed look"],
    "BRI-032": ["brick", "facing brick", "sandface", "sand faced", "red sandface"],
    "BRI-033": ["brick", "facing brick", "ibstock", "multi red", "ibstock multi red"],
    # Cavity Insulation
    "CAV-006": ["insulation", "cavity insulation", "wall insulation",
                "full fill cavity", "90mm insulation"],
    "CAV-007": ["insulation", "cavity insulation", "wall insulation",
                "full fill cavity", "100mm insulation"],
    "CAV-008": ["insulation", "cavity insulation", "wall insulation",
                "full fill cavity", "150mm insulation"],
    # PIR Insulation
    "PIR-003": ["insulation", "pir insulation", "rigid insulation",
                "foam board", "25mm pir", "pir 25mm"],
    "PIR-004": ["insulation", "pir insulation", "rigid insulation",
                "foam board", "50mm pir", "pir 50mm"],
    "PIR-005": ["insulation", "pir insulation", "rigid insulation",
                "foam board", "70mm pir", "pir 70mm"],
    "PIR-006": ["insulation", "pir insulation", "rigid insulation",
                "foam board", "100mm pir", "pir 100mm"],
    "PIR-007": ["insulation", "pir insulation", "rigid insulation",
                "foam board", "120mm pir", "pir 120mm"],
    "PIR-008": ["insulation", "pir insulation", "rigid insulation",
                "foam board", "150mm pir", "pir 150mm"],
    # Sheet Materials
    "SHE-001": ["osb", "osb board", "osb3", "oriented strand board",
                "18mm osb", "osb3 18mm"],
    "SHE-003": ["chipboard", "chipboard flooring", "flooring board",
                "18mm chipboard", "t&g chipboard"],
    "SHE-004": ["plywood", "ply", "sheet board", "shuttering plywood",
                "shuttering ply", "formwork plywood", "18mm plywood"],
    "SHE-005": ["wbp plywood", "exterior plywood", "18mm wbp",
                "plywood", "ply", "sheet board"],
    "SHE-006": ["osb", "osb board", "osb3", "oriented strand board",
                "tongue and groove osb", "t&g osb", "18mm osb t&g"],
    "SHE-007": ["osb", "osb board", "osb3", "oriented strand board",
                "12mm osb", "osb3 12mm"],
    "SHE-008": ["wbp plywood", "exterior plywood", "12mm wbp",
                "plywood", "ply", "sheet board", "12mm plywood"],
    "SHE-009": ["chipboard", "chipboard flooring", "flooring board",
                "22mm chipboard", "t&g chipboard 22mm"],
    # Timber — all C24 carcassing, plus the treated batten. The tag set
    # is the same shape across sizes so a search for "4x2 timber" hits
    # every length.
    **{
        f"TIM-{n:03d}": [
            "timber", "c24 timber", "carcassing timber", "structural timber",
            size_tag,
        ]
        for n, size_tag in [
            # 3x2
            *[(i, "3x2 timber") for i in range(3, 10)],
            # 4x2
            *[(i, "4x2 timber") for i in range(10, 17)],
            # 6x2
            *[(i, "6x2 timber") for i in range(17, 24)],
            # 7x2
            *[(i, "7x2 timber") for i in range(24, 31)],
            # 8x2
            *[(i, "8x2 timber") for i in range(31, 38)],
            # 9x2
            *[(i, "9x2 timber") for i in range(38, 45)],
        ]
    },
    "TIM-045": ["timber batten", "roofing batten", "treated batten",
                "25x38 batten", "tanilised batten", "timber"],
}

# ---------------------------------------------------------------------------
# SEO title and description overrides for the 3 over-long rows in
# catalog-plan.json. Drop the "Builders Merchant" tail (the company name
# is already in the brand/site meta tags) so we sit under the 60/160
# char caps cleanly.
# ---------------------------------------------------------------------------

SEO_OVERRIDES = {
    "PLA-005": {
        "seo_title": "Moisture Resistant Plasterboard | Star Hawk",
        "seo_description": (
            "Order Moisture Resistant Plasterboard 12.5mm online. Green face "
            "for kitchens, bathrooms and humid areas. Same-day delivery from Star Hawk."
        ),
    },
    "BLO-001": {
        "seo_title": "100mm Dense Concrete Block 7.3N | Star Hawk",
        "seo_description": (
            "Order 100mm Dense Concrete Block 7.3N online. Load-bearing dense "
            "aggregate block, 440x215x100mm. Trade price and site delivery from Star Hawk."
        ),
    },
    "CAV-006": {
        "seo_title": "Full Fill Cavity Insulation 90mm | Star Hawk",
        "seo_description": (
            "Order Full Fill Cavity Insulation 90mm online. Rigid full-fill "
            "insulation board for cavity walls. Trade price and same-day delivery from Star Hawk."
        ),
    },
}


def sql_string(s: str | None) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def sql_text_array(values) -> str:
    if not values:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ", ".join(sql_string(v) for v in values) + "]"


# ---------------------------------------------------------------------------
# Build the migration
# ---------------------------------------------------------------------------

def main():
    data = json.loads(PLAN.read_text(encoding="utf-8"))
    upserts = data.get("upserts", [])
    existing_imgs = {p.name for p in IMG_DIR.glob("*.webp")}

    wire_existing = []   # (code, image_url)
    wire_family = []     # (code, image_url)
    for u in upserts:
        code = u.get("code")
        if not code:
            continue
        candidate = f"IMG-{code}.webp"
        if candidate in existing_imgs:
            wire_existing.append((code, f"/products/{candidate}"))
        elif code in FAMILY_IMAGE:
            wire_family.append((code, FAMILY_IMAGE[code]))

    # Build SQL
    parts = []
    parts.append("""\
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

""")

    # 1. Existing image wire-ups
    parts.append(f"""\
-- ────────────────────────────────────────────────────────────────────────────
-- 1. Wire up existing IMG-{{code}}.webp files
--    ({len(wire_existing)} products)
-- ────────────────────────────────────────────────────────────────────────────

""")
    for code, url in wire_existing:
        parts.append(
            f"UPDATE public.products SET image_url = {sql_string(url)} "
            f"WHERE code = {sql_string(code)} AND is_active = true;\n"
        )
    parts.append("\n")

    # 2. Family image wire-ups
    parts.append(f"""\
-- ────────────────────────────────────────────────────────────────────────────
-- 2. Wire up family images for products without a per-product photo
--    ({len(wire_family)} products, 16 unique images — drop the family
--    WebP files into public/products/ before running this migration)
-- ────────────────────────────────────────────────────────────────────────────

""")
    for code, url in wire_family:
        parts.append(
            f"UPDATE public.products SET image_url = {sql_string(url)} "
            f"WHERE code = {sql_string(code)} AND is_active = true;\n"
        )
    parts.append("\n")

    # 3. search_tags backfill
    parts.append(f"""\
-- ────────────────────────────────────────────────────────────────────────────
-- 3. Backfill search_tags for every catalog-plan product
--    ({len(SEARCH_TAGS)} products)
-- ────────────────────────────────────────────────────────────────────────────

""")
    for code, tags in SEARCH_TAGS.items():
        parts.append(
            f"UPDATE public.products SET search_tags = {sql_text_array(tags)} "
            f"WHERE code = {sql_string(code)} AND is_active = true;\n"
        )
    parts.append("\n")

    # 4. SEO overrides
    parts.append(f"""\
-- ────────────────────────────────────────────────────────────────────────────
-- 4. Trim over-long SEO titles + descriptions
--    ({len(SEO_OVERRIDES)} products)
-- ────────────────────────────────────────────────────────────────────────────

""")
    for code, ov in SEO_OVERRIDES.items():
        parts.append(
            f"UPDATE public.products SET\n"
            f"  seo_title = {sql_string(ov['seo_title'])},\n"
            f"  seo_description = {sql_string(ov['seo_description'])}\n"
            f"WHERE code = {sql_string(code)} AND is_active = true;\n"
        )
    parts.append("\n")

    parts.append("COMMIT;\n")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text("".join(parts), encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    print(f"  - {len(wire_existing)} existing-image wire-ups")
    print(f"  - {len(wire_family)} family-image wire-ups ({len(set(u for _, u in wire_family))} unique images)")
    print(f"  - {len(SEARCH_TAGS)} search_tags backfills")
    print(f"  - {len(SEO_OVERRIDES)} SEO overrides")


if __name__ == "__main__":
    main()
