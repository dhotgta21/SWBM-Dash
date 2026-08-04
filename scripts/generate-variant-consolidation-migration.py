"""Generate the variant-consolidation migration (158).

Replaces the 59 individual STL-014..072 product pages (UB/UC/SHS/Flat) with
4 consolidated products, each carrying a `variant_options` JSONB blob that
exposes the size as a dropdown on the public product page:

  STL-073  Universal Beam
           variants: 21 size options (UB 127x76x13kg .. UB 305x165x60kg)
  STL-074  Universal Column
           variants: 25 size options (UC 152x152x23kg .. UC 305x305x240kg)
  STL-075  Square Hollow Section
           variants: 4 wall-thickness options (4mm, 5mm, 8mm, 10mm)
  STL-076  Flat Bar
           variants: 9 size options (100x20 .. 350x20)

The 59 individual rows (STL-014..072) are soft-deleted in the same
migration and the old codes are recorded in product_redirects so the
existing URL space keeps working.

Apply order (this REPLACES 155, do not apply both):

    node scripts/apply-migration.mjs 156_image_wireup_seo_searchtags.sql
    node scripts/apply-migration.mjs 157_wireup_and_consolidation.sql
    node scripts/apply-migration.mjs 158_variant_consolidation.sql

Run from the repo root:

    python scripts/generate-variant-consolidation-migration.py

Output:

    supabase/migrations/158_variant_consolidation.sql
"""

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_PATH = REPO / "supabase" / "migrations" / "158_variant_consolidation.sql"

# Universal Beams (21) -> UB section variant
UNIVERSAL_BEAMS = [
    (127, 76, 13),
    (152, 89, 16),
    (152, 89, 19),
    (178, 102, 19),
    (178, 102, 22),
    (178, 102, 25),
    (203, 102, 23),
    (203, 133, 25),
    (203, 133, 30),
    (203, 133, 37),
    (254, 102, 22),
    (254, 102, 25),
    (254, 146, 31),
    (254, 146, 37),
    (254, 146, 43),
    (305, 102, 25),
    (305, 102, 28),
    (305, 165, 40),
    (305, 165, 46),
    (305, 165, 54),
    (305, 165, 60),
]

# Universal Columns (25) -> UC section variant
UNIVERSAL_COLUMNS = [
    (152, 152, 23),
    (152, 152, 30),
    (152, 152, 37),
    (152, 152, 44),
    (152, 152, 51),
    (152, 152, 58),
    (152, 152, 67),
    (203, 203, 46),
    (203, 203, 52),
    (203, 203, 60),
    (203, 203, 71),
    (203, 203, 86),
    (203, 203, 100),
    (203, 203, 113),
    (254, 254, 73),
    (254, 254, 89),
    (254, 254, 107),
    (254, 254, 132),
    (254, 254, 167),
    (305, 305, 97),
    (305, 305, 118),
    (305, 305, 137),
    (305, 305, 158),
    (305, 305, 198),
    (305, 305, 240),
]

# Square Hollow Sections (4) -> SHS wall-thickness variant
# Stored as (width_mm, wall_mm, mass_per_m_kg)
SQUARE_HOLLOW_SECTIONS = [
    (100, 4, 11.7),
    (100, 5, 14.4),
    (100, 8, 22.9),
    (100, 10, 27.9),
]

# Flat Bar (9) -> width x thickness variant
FLAT_BARS = [
    (100, 20),
    (200, 20),
    (300, 20),
    (300, 10),
    (300, 12),
    (400, 20),
    (350, 15),
    (350, 12),
    (350, 20),
]


def sql_string(s: str | None) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def slugify(value: str) -> str:
    return (
        value.lower()
        .replace("&", "and")
        .replace("/", "-")
        .replace(" ", "-")
    )


def jsonb_literal(obj) -> str:
    """Render a Python dict/list as a Postgres jsonb literal.

    The variant_options column is jsonb, so the cleanest portable form is
    `'...json...'::jsonb` — no escaping worries beyond JSON's own.
    """
    return sql_string(json.dumps(obj, ensure_ascii=False)) + "::jsonb"


def build_ub_consolidation() -> dict:
    """Return the 4 consolidated product rows as INSERT VALUES tuples + the
    matching product_redirects old_codes (STL-014..034)."""
    options = [
        {"value": f"ub-{d}x{w}x{m}", "text": f"UB {d}x{w}x{m}kg"}
        for d, w, m in UNIVERSAL_BEAMS
    ]
    variant_options = [
        {
            "material": "Mild steel",
            "image": "/products/universal-beam-mild-steel.webp",
            "selectors": [
                {
                    "name": "size",
                    "label": "Section size",
                    "options": options,
                }
            ],
        }
    ]
    return {
        "code": "STL-073",
        "name": "Universal Beam",
        "category": "Steel & Lintels",
        "description": (
            "Universal Beam (UB) is a hot-rolled structural steel I-section for "
            "load-bearing beams, lintels, floor joists and roof beams. Standard "
            "UK BS4 sections in S275JR mild steel, available cut to length or in "
            "standard mill lengths. Select a section size below for kg/m mass, "
            "overall dimensions and trade pricing."
        ),
        "short_description": (
            "Hot-rolled structural steel universal beam (RSJ) — 21 BS4 section "
            "sizes from UB 127x76x13kg to UB 305x165x60kg."
        ),
        "seo_title": "Universal Beam (UB) | Star Hawk Builders Merchant",
        "seo_description": (
            "Order Universal Beams (UB) online. 21 standard BS4 sections from "
            "UB 127x76x13kg to UB 305x165x60kg in S275JR mild steel. Cut to size, "
            "mill lengths and same-day delivery from Star Hawk."
        ),
        "unit": "EA",
        "image_url": "/products/universal-beam-mild-steel.webp",
        "materials": ["Mild steel"],
        "family_slug": "universal-beam",
        "variant_options": variant_options,
        "old_codes": [f"STL-{i + 14:03d}" for i in range(21)],
    }


def build_uc_consolidation() -> dict:
    options = [
        {"value": f"uc-{d}x{w}x{m}", "text": f"UC {d}x{w}x{m}kg"}
        for d, w, m in UNIVERSAL_COLUMNS
    ]
    variant_options = [
        {
            "material": "Mild steel",
            "image": "/products/universal-column-mild-steel.webp",
            "selectors": [
                {
                    "name": "size",
                    "label": "Section size",
                    "options": options,
                }
            ],
        }
    ]
    return {
        "code": "STL-074",
        "name": "Universal Column",
        "category": "Steel & Lintels",
        "description": (
            "Universal Column (UC) is a hot-rolled structural steel H-section for "
            "columns, posts, stanchions and portal frames. Standard UK BS4 sections "
            "in S275JR mild steel, available cut to length or in standard mill "
            "lengths. Select a section size below for kg/m mass, overall "
            "dimensions and trade pricing."
        ),
        "short_description": (
            "Hot-rolled structural steel universal column — 25 BS4 section "
            "sizes from UC 152x152x23kg to UC 305x305x240kg."
        ),
        "seo_title": "Universal Column (UC) | Star Hawk Builders Merchant",
        "seo_description": (
            "Order Universal Columns (UC) online. 25 standard BS4 sections from "
            "UC 152x152x23kg to UC 305x305x240kg in S275JR mild steel. Cut to "
            "size, mill lengths and same-day delivery from Star Hawk."
        ),
        "unit": "EA",
        "image_url": "/products/universal-column-mild-steel.webp",
        "materials": ["Mild steel"],
        "family_slug": "universal-column",
        "variant_options": variant_options,
        "old_codes": [f"STL-{i + 35:03d}" for i in range(25)],
    }


def build_shs_consolidation() -> dict:
    options = [
        {"value": f"shs-{w}x{w}x{wall}", "text": f"SHS {w}x{w}x{wall}mm ({mass} kg/m)"}
        for w, wall, mass in SQUARE_HOLLOW_SECTIONS
    ]
    variant_options = [
        {
            "material": "Mild steel",
            "image": "/products/square-hollow-section-mild-steel.webp",
            "selectors": [
                {
                    "name": "wall",
                    "label": "Wall thickness",
                    "options": options,
                }
            ],
        }
    ]
    return {
        "code": "STL-075",
        "name": "Square Hollow Section",
        "category": "Steel & Lintels",
        "description": (
            "Square Hollow Section (SHS) is a hot-finished structural steel tube "
            "for columns, posts, frames, balustrades and general fabrication. "
            "Standard UK BS EN 10210 sections in S275JR/S355JR mild steel, "
            "100mm x 100mm outer with four wall thickness options. Select a "
            "thickness below for kg/m mass and trade pricing."
        ),
        "short_description": (
            "Hot-finished mild-steel square hollow section — 100x100mm outer "
            "with 4mm, 5mm, 8mm or 10mm wall thickness."
        ),
        "seo_title": "Square Hollow Section (SHS) | Star Hawk Builders Merchant",
        "seo_description": (
            "Order Square Hollow Sections (SHS) online. 100x100mm outer with 4mm, "
            "5mm, 8mm or 10mm wall, in S275JR/S355JR mild steel. Cut to size, mill "
            "lengths and same-day delivery from Star Hawk."
        ),
        "unit": "EA",
        "image_url": "/products/square-hollow-section-mild-steel.webp",
        "materials": ["Mild steel"],
        "family_slug": "square-hollow-section",
        "variant_options": variant_options,
        "old_codes": [f"STL-{i + 60:03d}" for i in range(4)],
    }


def build_flat_consolidation() -> dict:
    options = [
        {
            "value": f"flat-{w}x{t}",
            "text": f"Flat {w}x{t}mm ({(w * t * 0.00785):.2f} kg/m)",
        }
        for w, t in FLAT_BARS
    ]
    variant_options = [
        {
            "material": "Mild steel",
            "image": "/products/flat-bar-mild-steel.webp",
            "selectors": [
                {
                    "name": "size",
                    "label": "Bar size",
                    "options": options,
                }
            ],
        }
    ]
    return {
        "code": "STL-076",
        "name": "Flat Bar",
        "category": "Steel & Lintels",
        "description": (
            "Flat Bar is a hot-rolled mild-steel rectangular bar for fabrication, "
            "base plates, gusset plates, brackets, gate frames and general workshop "
            "use. Standard UK sizes from 100x20mm up to 400x20mm. Select a size "
            "below for kg/m mass and trade pricing."
        ),
        "short_description": (
            "Hot-rolled mild-steel flat bar — 9 sizes from 100x20mm to 400x20mm."
        ),
        "seo_title": "Flat Bar | Star Hawk Builders Merchant",
        "seo_description": (
            "Order Flat Bar online. 9 sizes from 100x20mm to 400x20mm in S275JR "
            "mild steel. Cut to length, mill lengths and same-day delivery from "
            "Star Hawk Builders Merchant."
        ),
        "unit": "EA",
        "image_url": "/products/flat-bar-mild-steel.webp",
        "materials": ["Mild steel"],
        "family_slug": "flat-bar",
        "variant_options": variant_options,
        "old_codes": [f"STL-{i + 64:03d}" for i in range(9)],
    }


def build_search_tags_from_options(options: list) -> list:
    """Mirror every variant option's `text` field into the search_tags array.

    Without this, searching for "UB 127x76x13kg" on the public site
    returns nothing — the consolidated product's `name` is "Universal
    Beam", and the search_tags column is empty by default. Folding every
    size label into search_tags (which the 061 migration weights at C,
    the highest) means the search function surfaces the consolidated
    product when the operator or the customer types a specific size.
    """
    seen = set()
    out = []
    for opt in options:
        text = (opt.get("text") or "").strip()
        if text and text not in seen:
            seen.add(text)
            out.append(text)
    return out


CONSOLIDATIONS = [
    build_ub_consolidation(),
    build_uc_consolidation(),
    build_shs_consolidation(),
    build_flat_consolidation(),
]

# Re-derive the options lists the same way the rows do, so the search_tags
# block ends up with the same set of labels the variant_options column has.
for c in CONSOLIDATIONS:
    opts = c["variant_options"][0]["selectors"][0]["options"]
    c["search_tags"] = build_search_tags_from_options(opts)


HEADER = """\
-- =============================================================================
-- 158_variant_consolidation.sql
-- =============================================================================
-- Replaces the 59 individual STL-014..072 product pages (UB / UC / SHS /
-- Flat) with 4 consolidated products, each carrying a `variant_options` JSONB
-- blob that exposes the size as a dropdown on the public product page.
--
--   STL-073  Universal Beam       21 size variants (UB 127x76x13kg ... 305x165x60kg)
--   STL-074  Universal Column     25 size variants (UC 152x152x23kg ... 305x305x240kg)
--   STL-075  Square Hollow Section  4 wall-thickness variants (4 / 5 / 8 / 10 mm)
--   STL-076  Flat Bar              9 size variants (100x20 ... 400x20)
--
-- The 59 individual rows (STL-014..072) are soft-deleted (deleted_at +
-- is_active=false) in the same migration and their codes are recorded in
-- product_redirects so the existing URL space keeps working — old
-- /products/STL-014 URLs redirect to /products/STL-073 (the new
-- consolidated Universal Beam page).
--
-- This REPLACES 155 (the original "59 separate products" plan). Do not
-- apply 155 before or after this migration. Apply order:
--
--   1. 155 — SKIP (superseded by 158)
--   2. 156 — image wire-up + SEO + search_tags
--   3. 157 — wire-up + STL consolidation
--   4. 158 — THIS migration (variant consolidation)
--
-- The variant infrastructure (variant_options JSONB, ProductVariantSelector
-- component, ProductPurchaseCard with variantDescription) is already in
-- place — this migration just populates the data.
-- =============================================================================

BEGIN;

"""

SOFT_DELETE_BLOCK = """\
-- ────────────────────────────────────────────────────────────────────────
-- 1. Soft-delete the 59 superseded product rows
--    (STL-014..072). Setting is_active=false keeps the rows around
--    for the redirects below; deleted_at is set so the catalogue and
--    search filters exclude them.
-- ────────────────────────────────────────────────────────────────────────

UPDATE public.products
SET
  is_active = false,
  deleted_at = now()
WHERE code IN ({codes_csv})
  AND is_active = true;

"""

PRODUCT_REDIRECTS_BLOCK = """\
-- ────────────────────────────────────────────────────────────────────────
-- 2. Record product redirects so old /products/{{code}} URLs land on
--    the new consolidated product page. INSERT ... ON CONFLICT so
--    re-running this migration (after 068 renumbering left entries
--    in the table) is a no-op.
-- ────────────────────────────────────────────────────────────────────────

"""


def build_redirects_sql(consolidations) -> str:
    parts = []
    for c in consolidations:
        new_code = c["code"]
        for old_code in c["old_codes"]:
            parts.append(
                f"INSERT INTO public.product_redirects (old_code, new_code) "
                f"VALUES ({sql_string(old_code)}, {sql_string(new_code)}) "
                f"ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;\n"
            )
    return "".join(parts)


INSERT_COLUMNS = """\
INSERT INTO public.products (
  code,
  name,
  description,
  short_description,
  seo_title,
  seo_description,
  unit,
  category,
  default_price,
  image_url,
  is_active,
  materials,
  search_tags,
  variant_options,
  family_slug
) VALUES
"""


def build_insert_row(c) -> str:
    return (
        f"  ({sql_string(c['code'])},\n"
        f"   {sql_string(c['name'])},\n"
        f"   {sql_string(c['description'])},\n"
        f"   {sql_string(c['short_description'])},\n"
        f"   {sql_string(c['seo_title'])},\n"
        f"   {sql_string(c['seo_description'])},\n"
        f"   '{c['unit']}',\n"
        f"   {sql_string(c['category'])},\n"
        f"   0,\n"
        f"   {sql_string(c['image_url'])},\n"
        f"   true,\n"
        f"   ARRAY[{', '.join(sql_string(m) for m in c['materials'])}]::text[],\n"
        f"   ARRAY[{', '.join(sql_string(t) for t in c['search_tags'])}]::text[],\n"
        f"   {jsonb_literal(c['variant_options'])},\n"
        f"   {sql_string(c['family_slug'])})"
    )


def main():
    parts = [HEADER]

    # 1. Soft-delete the 59 superseded rows
    all_old_codes = []
    for c in CONSOLIDATIONS:
        all_old_codes.extend(c["old_codes"])
    codes_csv = ", ".join(sql_string(code) for code in all_old_codes)
    parts.append(SOFT_DELETE_BLOCK.format(codes_csv=codes_csv))

    # 2. Product redirects
    parts.append(PRODUCT_REDIRECTS_BLOCK)
    parts.append(build_redirects_sql(CONSOLIDATIONS))
    parts.append("\n")

    # 3. Insert the 4 consolidated products
    parts.append("""\
-- ────────────────────────────────────────────────────────────────────────
-- 3. Insert the 4 consolidated products with variant_options JSONB
-- ────────────────────────────────────────────────────────────────────────

""")
    parts.append(INSERT_COLUMNS)
    rows = [build_insert_row(c) for c in CONSOLIDATIONS]
    parts.append(",\n".join(rows))
    parts.append("\nON CONFLICT (code) DO UPDATE SET\n"
                "  name = EXCLUDED.name,\n"
                "  description = EXCLUDED.description,\n"
                "  short_description = EXCLUDED.short_description,\n"
                "  seo_title = EXCLUDED.seo_title,\n"
                "  seo_description = EXCLUDED.seo_description,\n"
                "  category = EXCLUDED.category,\n"
                "  image_url = EXCLUDED.image_url,\n"
                "  materials = EXCLUDED.materials,\n"
                "  search_tags = EXCLUDED.search_tags,\n"
                "  variant_options = EXCLUDED.variant_options,\n"
                "  family_slug = EXCLUDED.family_slug,\n"
                "  is_active = true,\n"
                "  deleted_at = NULL;\n\n")

    parts.append("COMMIT;\n")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text("".join(parts), encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    print()
    print("Consolidation summary:")
    for c in CONSOLIDATIONS:
        n = len(c["variant_options"][0]["selectors"][0]["options"])
        print(f"  {c['code']}  {c['name']:<25}  {n} variants  <- {len(c['old_codes'])} old codes")
    print()
    print(f"  Old codes soft-deleted: {len(all_old_codes)}")
    print(f"  Redirects recorded:     {len(all_old_codes)}")


if __name__ == "__main__":
    main()
