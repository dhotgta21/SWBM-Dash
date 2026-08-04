"""Generate migration 161: multi-category variant consolidation.

Collapses 59 single-row-per-size products across 4 categories into
14 consolidated products with variant_options JSONB dropdowns. Mirrors
the pattern established in 158_variant_consolidation.sql for steel.

  Section 1 - TIMBER   : 42 rows -> 6 products (TIM-046..051)
                          (TIM-045 Treated Batten stays as-is)
  Section 2 - PIR      :  6 rows -> 1 product  (PIR-009)
  Section 3 - CAVITY   :  2 rows -> 1 product  (CAV-009)
                          (CAV-006 Full Fill 90mm stays as-is)
  Section 4 - SHEET    :  8 rows -> 3 products (SHE-010..012)

Total: 59 product pages removed, 11 new consolidated products added,
57 product_redirects inserted so old URLs keep working.

Calculator notes:
  - TIMBER consolidated products drop calculator_type (the TimberCalculator
    uses lengthMm for piece-length math which now varies per variant).
    A follow-up code change is needed to make the calculator variant-aware.
  - PIR, CAVITY, SHEET keep calculator_type because the relevant calculators
    use lengthMm x widthMm for area math, which is constant per consolidated
    product. lengthMm/widthMm on the consolidated row carry the actual
    board/sheet dimensions.

Run from the repo root:

    python scripts/generate-161-migration.py

Output:

    supabase/migrations/161_multi_category_variant_consolidation.sql
"""

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_PATH = REPO / "supabase" / "migrations" / "161_multi_category_variant_consolidation.sql"

# ---------------------------------------------------------------------------
# Section 1 - TIMBER
# ---------------------------------------------------------------------------
# 6 section sizes x 7 standard lengths = 42 rows to consolidate.
# Plus TIM-045 Treated Timber Batten 25x38mm stays as a standalone.
# height_mm=47 is the actual 2x3/4x2/6x2/7x2/8x2/9x2 thickness in mm.
# width_mm is the section breadth in mm (75/100/150/175/200/225).

TIMBER_SECTIONS = [
    # (section_code, section_name, section_slug, family_image,
    #  height_mm, width_mm, section_label, search_prefixes)
    ("3x2",  "3x2 C24 Timber",  "timber-c24-3x2",  "timber-c24-3x2.webp",  47,  75, "3x2",  ["3x2 timber", "2x3 timber", "3 by 2 timber", "3x2 carcassing"]),
    ("4x2",  "4x2 C24 Timber",  "timber-c24-4x2",  "timber-c24-4x2.webp",  47, 100, "4x2",  ["4x2 timber", "2x4 timber", "4 by 2 timber", "4x2 carcassing"]),
    ("6x2",  "6x2 C24 Timber",  "timber-c24-6x2",  "timber-c24-6x2.webp",  47, 150, "6x2",  ["6x2 timber", "2x6 timber", "6 by 2 timber", "6x2 carcassing"]),
    ("7x2",  "7x2 C24 Timber",  "timber-c24-7x2",  "timber-c24-7x2.webp",  47, 175, "7x2",  ["7x2 timber", "2x7 timber", "7 by 2 timber", "7x2 carcassing"]),
    ("8x2",  "8x2 C24 Timber",  "timber-c24-8x2",  "timber-c24-8x2.webp",  47, 200, "8x2",  ["8x2 timber", "2x8 timber", "8 by 2 timber", "8x2 carcassing"]),
    ("9x2",  "9x2 C24 Timber",  "timber-c24-9x2",  "timber-c24-9x2.webp",  47, 225, "9x2",  ["9x2 timber", "2x9 timber", "9 by 2 timber", "9x2 carcassing"]),
]

TIMBER_LENGTHS = [
    # (length_m_str, slug_suffix, original_code_prefix)
    ("2.4m",  "2-4m", "003"),  # TIM-003
    ("3m",    "3m",   "004"),  # TIM-004
    ("3.6m",  "3-6m", "005"),  # TIM-005
    ("4.2m",  "4-2m", "006"),  # TIM-006
    ("4.8m",  "4-8m", "007"),  # TIM-007
    ("5.4m",  "5-4m", "008"),  # TIM-008
    ("6m",    "6m",   "009"),  # TIM-009
]

# Map each timber section to the base row of the 7 original codes that
# will be soft-deleted + redirected. The codes are sequential per
# section starting at the given base, incrementing by 1.
TIMBER_REDIRECT_BASE = {
    "3x2": "003",   # TIM-003..009
    "4x2": "010",   # TIM-010..016
    "6x2": "017",   # TIM-017..023
    "7x2": "024",   # TIM-024..030
    "8x2": "031",   # TIM-031..037
    "9x2": "038",   # TIM-038..044
}

# Consolidated product codes start at TIM-046 (TIM-045 is the standalone
# Treated Batten that we leave alone).
TIMBER_NEW_CODE_BASE = 46

# ---------------------------------------------------------------------------
# Section 2 - PIR
# ---------------------------------------------------------------------------

PIR_THICKNESSES = [
    # (thickness_mm, slug, label, original_code)
    (25,  "25mm",  "25mm",  "003"),
    (50,  "50mm",  "50mm",  "004"),
    (70,  "70mm",  "70mm",  "005"),
    (100, "100mm", "100mm", "006"),
    (120, "120mm", "120mm", "007"),
    (150, "150mm", "150mm", "008"),
]

PIR_NEW_CODE = "PIR-009"

# ---------------------------------------------------------------------------
# Section 3 - CAVITY
# ---------------------------------------------------------------------------
# Only the 100mm and 150mm "Cavity Wall Insulation" rows consolidate.
# CAV-006 "Full Fill Cavity Insulation 90mm" is a different product
# type (full fill vs partial fill) and stays standalone.

CAVITY_THICKNESSES = [
    # (thickness_mm, slug, label, original_code)
    (100, "100mm", "100mm", "007"),
    (150, "150mm", "150mm", "008"),
]

CAVITY_NEW_CODE = "CAV-009"

# ---------------------------------------------------------------------------
# Section 4 - SHEET MATERIALS
# ---------------------------------------------------------------------------
# Grouped by material type. Each group becomes one consolidated product
# with thickness / edge variants.

SHEET_GROUPS = [
    {
        "new_code": "SHE-010",
        "name": "OSB3 Board",
        "family_slug": "osb3-board",
        "family_image": "osb3-plywood-12mm.webp",
        "length_mm": 2440,
        "width_mm": 1220,
        "description": (
            "OSB3 Board is a moisture-resistant oriented strand board for "
            "wall sheathing, roof decking, flooring sub-base and general "
            "structural use. Load-bearing structural grade to BS EN 300, "
            "suitable for use in humid conditions (OSB3). Square edge and "
            "Tongue & Groove profiles available, in 12mm and 18mm thicknesses. "
            "Select a size below for full dimensions and trade pricing."
        ),
        "short_description": "Moisture-resistant structural OSB3 board — 12mm and 18mm in square edge or T&G profiles.",
        "seo_title": "OSB3 Board | Star Hawk Builders Merchant",
        "seo_description": "Order OSB3 Board online. 12mm and 18mm structural OSB3 in square edge or T&G profile. Trade price and same-day delivery from Star Hawk.",
        "variants": [
            # (label, value, original_code)
            ("12mm Square Edge", "osb3-12mm-se", "007"),
            ("18mm Square Edge", "osb3-18mm-se", "001"),
            ("18mm Tongue & Groove", "osb3-18mm-tg", "006"),
        ],
    },
    {
        "new_code": "SHE-011",
        "name": "Structural Plywood",
        "family_slug": "structural-plywood",
        "family_image": "wbp-plywood-12mm.webp",
        "length_mm": 2440,
        "width_mm": 1220,
        "description": (
            "Structural Plywood is a high-quality WBP (Weather and Boil "
            "Proof) hardwood plywood for shuttering, formwork, exterior "
            "cladding, flooring sub-base and general construction. Bonded "
            "with phenolic resin for exterior / structural use. Available "
            "in 12mm and 18mm thicknesses. Select a size below for full "
            "dimensions and trade pricing."
        ),
        "short_description": "WBP structural hardwood plywood — 12mm and 18mm for shuttering, formwork and exterior use.",
        "seo_title": "Structural Plywood (WBP) | Star Hawk Builders Merchant",
        "seo_description": "Order Structural Plywood online. WBP hardwood plywood in 12mm and 18mm for shuttering, formwork and exterior use. Trade price and same-day delivery from Star Hawk.",
        "variants": [
            ("12mm WBP", "wbp-12mm", "008"),
            ("18mm WBP", "wbp-18mm", "005"),
            ("18mm Shuttering", "shutter-18mm", "004"),
        ],
    },
    {
        "new_code": "SHE-012",
        "name": "Chipboard Flooring",
        "family_slug": "chipboard-flooring",
        "family_image": "chipboard-22mm.webp",
        "length_mm": 2400,
        "width_mm": 600,
        "description": (
            "Chipboard Flooring is a high-density tongue-and-groove "
            "particleboard for floor decking, loft floors and platform "
            "construction. Standard 600mm wide T&G profile, available in "
            "18mm and 22mm thicknesses. Select a thickness below for full "
            "dimensions and trade pricing."
        ),
        "short_description": "T&G chipboard flooring — 18mm and 22mm high-density particleboard.",
        "seo_title": "Chipboard Flooring (T&G) | Star Hawk Builders Merchant",
        "seo_description": "Order Chipboard Flooring online. 18mm and 22mm T&G high-density chipboard for floor decking. Trade price and same-day delivery from Star Hawk.",
        "variants": [
            ("18mm", "chip-18mm", "003"),
            ("22mm", "chip-22mm", "009"),
        ],
    },
]


# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------

def sql_string(value: str) -> str:
    """Quote a string for SQL. Escape single quotes by doubling them."""
    return "'" + value.replace("'", "''") + "'"


def jsonb_literal(value) -> str:
    """Render a Python value as a Postgres JSONB literal.

    Uses json.dumps for the JSON payload, then casts to ::jsonb so the
    server parses it correctly regardless of client settings.
    """
    return "'" + json.dumps(value, ensure_ascii=False).replace("'", "''") + "'::jsonb"


def text_array_literal(values) -> str:
    """Render a list of strings as a Postgres text[] literal.

    Used for the search_tags column (which is text[] in this schema,
    not jsonb). Each value is SQL-escaped, then the whole array is cast.
    """
    if not values:
        return "ARRAY[]::text[]"
    parts = [sql_string(v) for v in values]
    return "ARRAY[" + ", ".join(parts) + "]"


def indent(text: str, prefix: str = "  ") -> str:
    return "\n".join(prefix + line if line else line for line in text.splitlines())


# ---------------------------------------------------------------------------
# SQL builders
# ---------------------------------------------------------------------------

def build_timber_section() -> str:
    """Section 1 - TIMBER."""
    lines = []
    lines.append("-- ────────────────────────────────────────────────────────────────────────")
    lines.append("-- 1. TIMBER  (TIM-003..044 -> TIM-046..051, 42 rows -> 6 products)")
    lines.append("--    TIM-045 Treated Timber Batten 25x38mm is left as a standalone")
    lines.append("-- ────────────────────────────────────────────────────────────────────────")
    lines.append("")

    # 1a. Soft-delete the 42 superseded rows
    all_codes = []
    for section in TIMBER_SECTIONS:
        base = int(TIMBER_REDIRECT_BASE[section[0]])
        for offset in range(7):
            all_codes.append(f"'TIM-{base + offset:03d}'")
    lines.append("UPDATE public.products")
    lines.append("SET is_active = false, deleted_at = now()")
    lines.append("WHERE code IN (" + ", ".join(all_codes) + ")")
    lines.append("  AND is_active = true;")
    lines.append("")

    # 1b. Insert redirects
    lines.append("-- Map each old TIM-* code to its new consolidated code.")
    redirect_lines = []
    for i, section in enumerate(TIMBER_SECTIONS):
        new_code = f"TIM-{TIMBER_NEW_CODE_BASE + i:03d}"
        base = int(TIMBER_REDIRECT_BASE[section[0]])
        for offset in range(7):
            old_code = f"TIM-{base + offset:03d}"
            redirect_lines.append(
                f"INSERT INTO public.product_redirects (old_code, new_code) "
                f"VALUES ('{old_code}', '{new_code}') "
                f"ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;"
            )
    lines.extend(redirect_lines)
    lines.append("")

    # 1c. Insert consolidated products
    lines.append("-- 6 consolidated timber products, one per section size, each")
    lines.append("-- with a single \"size\" selector carrying the 7 standard lengths.")
    lines.append("-- calculator_type is set to NULL on the consolidated rows because the")
    lines.append("-- TimberCalculator uses lengthMm for piece-length math which now varies")
    lines.append("-- per variant. A follow-up code change will make the calculator")
    lines.append("-- variant-aware (TODO: track in a separate issue).")
    lines.append("INSERT INTO public.products (")
    lines.append("  code, name, description, short_description, seo_title, seo_description,")
    lines.append("  unit, category, default_price, image_url, is_active, materials,")
    lines.append("  search_tags, variant_options, family_slug, calculator_type, wastage_pct,")
    lines.append("  length_mm, width_mm, height_mm")
    lines.append(") VALUES")
    lines.append("")

    product_values = []
    for i, section in enumerate(TIMBER_SECTIONS):
        (sec, name, slug, family_image, height_mm, width_mm,
         label, search_prefixes) = section
        new_code = f"TIM-{TIMBER_NEW_CODE_BASE + i:03d}"

        # Build variant options JSONB
        variant_options = [{
            "material": "C24 structural timber",
            "image": f"/products/{family_image}",
            "selectors": [{
                "name": "size",
                "label": "Length",
                "options": [
                    {
                        "value": f"{sec.lower()}-{length_slug}",
                        "text": f"{label} {length_text}",
                    }
                    for (length_text, length_slug, _) in TIMBER_LENGTHS
                ],
            }],
        }]

        # Build search tags
        search_tags = [
            "timber", "c24 timber", "carcassing timber", "structural timber",
            f"{sec} timber", f"{sec} c24",
        ] + search_prefixes
        for (length_text, length_slug, _) in TIMBER_LENGTHS:
            search_tags.append(f"{name} {length_text}")
        # De-duplicate while preserving order
        seen = set()
        deduped = []
        for tag in search_tags:
            if tag not in seen:
                seen.add(tag)
                deduped.append(tag)
        search_tags = deduped

        description = (
            f"{name} is a stress-graded C24 structural softwood carcassing "
            f"timber for stud walls, floor joists, roof joists, ceiling joists "
            f"and general framing. Machined to {sec.replace('x', ' x ')} inches "
            f"({width_mm}mm x {height_mm}mm actual), available in 7 standard "
            f"lengths from 2.4m to 6m. Select a length below for full dimensions "
            f"and trade pricing."
        )
        short_description = (
            f"Stress-graded C24 structural {sec} carcassing timber — "
            f"7 lengths from 2.4m to 6m."
        )
        seo_title = f"{name} | Star Hawk Builders Merchant"
        seo_description = (
            f"Order {name} online. Stress-graded C24 structural {sec} "
            f"carcassing timber in 7 standard lengths from 2.4m to 6m. "
            f"Trade price and same-day delivery from Star Hawk."
        )

        product_values.append({
            "code": new_code,
            "name": name,
            "description": description,
            "short_description": short_description,
            "seo_title": seo_title,
            "seo_description": seo_description,
            "unit": "EA",
            "category": "Timber",
            "default_price": 0,
            "image_url": f"/products/{family_image}",
            "is_active": True,
            "materials": ["C24 softwood"],
            "search_tags": search_tags,
            "variant_options": variant_options,
            "family_slug": slug,
            "calculator_type": None,
            "wastage_pct": 5,
            "length_mm": None,  # no single length on a consolidated product
            "width_mm": width_mm,
            "height_mm": height_mm,
        })

    # Render the values tuples
    value_strs = []
    for v in product_values:
        # Use NULL for None values, render text arrays as ARRAY[], jsonb as ::jsonb
        def fmt(key, value):
            if value is None:
                return "NULL"
            if key in ("search_tags",):
                return text_array_literal(value)
            if key in ("variant_options", "materials"):
                return jsonb_literal(value)
            if key in ("default_price", "wastage_pct", "length_mm", "width_mm", "height_mm"):
                return str(value)
            if isinstance(value, bool):
                return "true" if value else "false"
            return sql_string(value)

        fields_in_order = [
            "code", "name", "description", "short_description",
            "seo_title", "seo_description", "unit", "category",
            "default_price", "image_url", "is_active", "materials",
            "search_tags", "variant_options", "family_slug",
            "calculator_type", "wastage_pct", "length_mm", "width_mm", "height_mm",
        ]
        rendered = [fmt(k, v[k]) for k in fields_in_order]
        value_strs.append("  (\n" + ",\n".join("    " + r for r in rendered) + "\n  )")

    lines.append(",\n".join(value_strs))
    lines.append("")
    lines.append("ON CONFLICT (code) DO UPDATE SET")
    lines.append("  name = EXCLUDED.name,")
    lines.append("  description = EXCLUDED.description,")
    lines.append("  short_description = EXCLUDED.short_description,")
    lines.append("  seo_title = EXCLUDED.seo_title,")
    lines.append("  seo_description = EXCLUDED.seo_description,")
    lines.append("  category = EXCLUDED.category,")
    lines.append("  image_url = EXCLUDED.image_url,")
    lines.append("  materials = EXCLUDED.materials,")
    lines.append("  search_tags = EXCLUDED.search_tags,")
    lines.append("  variant_options = EXCLUDED.variant_options,")
    lines.append("  family_slug = EXCLUDED.family_slug,")
    lines.append("  calculator_type = EXCLUDED.calculator_type,")
    lines.append("  wastage_pct = EXCLUDED.wastage_pct,")
    lines.append("  width_mm = EXCLUDED.width_mm,")
    lines.append("  height_mm = EXCLUDED.height_mm,")
    lines.append("  is_active = true,")
    lines.append("  deleted_at = NULL;")
    lines.append("")

    return "\n".join(lines)


def build_pir_section() -> str:
    """Section 2 - PIR INSULATION."""
    lines = []
    lines.append("-- ────────────────────────────────────────────────────────────────────────")
    lines.append("-- 2. PIR INSULATION  (PIR-003..008 -> PIR-009, 6 rows -> 1 product)")
    lines.append("-- ────────────────────────────────────────────────────────────────────────")
    lines.append("")

    # 2a. Soft-delete the 6 superseded rows
    codes = [f"'PIR-{t[3]}'" for t in PIR_THICKNESSES]
    lines.append("UPDATE public.products")
    lines.append("SET is_active = false, deleted_at = now()")
    lines.append("WHERE code IN (" + ", ".join(codes) + ")")
    lines.append("  AND is_active = true;")
    lines.append("")

    # 2b. Insert redirects
    for _, _, _, orig in PIR_THICKNESSES:
        lines.append(
            f"INSERT INTO public.product_redirects (old_code, new_code) "
            f"VALUES ('PIR-{orig}', '{PIR_NEW_CODE}') "
            f"ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;"
        )
    lines.append("")

    # 2c. Build the consolidated product
    variant_options = [{
        "material": "PIR rigid foam",
        "image": "/products/pir-insulation-board.webp",
        "selectors": [{
            "name": "size",
            "label": "Thickness",
            "options": [
                {"value": f"pir-{slug}", "text": f"{thickness}mm"}
                for (thickness, slug, label, _) in PIR_THICKNESSES
            ],
        }],
    }]

    search_tags = [
        "insulation", "pir insulation", "rigid insulation", "foam board",
        "pir board", "polyisocyanurate", "thermal insulation", "roof insulation",
        "wall insulation",
    ]
    for (thickness, slug, label, _) in PIR_THICKNESSES:
        search_tags.append(f"PIR {thickness}mm")
        search_tags.append(f"{thickness}mm PIR")

    description = (
        "PIR Insulation Board is a high-performance rigid polyisocyanurate "
        "(PIR) foam board for roof, wall and floor insulation. Thermal "
        "conductivity as low as 0.022 W/mK, faced with low-emissivity aluminium "
        "foil on both sides. Standard 2400mm x 1200mm board, available in 6 "
        "thicknesses from 25mm to 150mm. Select a thickness below for R-values, "
        "coverage and trade pricing."
    )
    short_description = (
        "High-performance rigid PIR insulation board — 2400x1200mm in 6 "
        "thicknesses from 25mm to 150mm."
    )
    seo_title = "PIR Insulation Board | Star Hawk Builders Merchant"
    seo_description = (
        "Order PIR Insulation Board online. 2400x1200mm rigid PIR foam "
        "in 6 thicknesses (25/50/70/100/120/150mm) for roof, wall and "
        "floor insulation. Trade price and same-day delivery from Star Hawk."
    )

    lines.append("INSERT INTO public.products (")
    lines.append("  code, name, description, short_description, seo_title, seo_description,")
    lines.append("  unit, category, default_price, image_url, is_active, materials,")
    lines.append("  search_tags, variant_options, family_slug, calculator_type, wastage_pct,")
    lines.append("  length_mm, width_mm, thickness_mm")
    lines.append(") VALUES (")
    lines.append("  " + sql_string(PIR_NEW_CODE) + ",")
    lines.append("  " + sql_string("PIR Insulation Board") + ",")
    lines.append("  " + sql_string(description) + ",")
    lines.append("  " + sql_string(short_description) + ",")
    lines.append("  " + sql_string(seo_title) + ",")
    lines.append("  " + sql_string(seo_description) + ",")
    lines.append("  " + sql_string("SHEET") + ",")
    lines.append("  " + sql_string("Insulation") + ",")
    lines.append("  0,")
    lines.append("  '/products/pir-insulation-board.webp',")
    lines.append("  true,")
    lines.append("  " + jsonb_literal(["PIR foam", "Aluminium foil facing"]) + ",")
    lines.append("  " + text_array_literal(search_tags) + ",")
    lines.append("  " + jsonb_literal(variant_options) + ",")
    lines.append("  " + sql_string("pir-insulation-board") + ",")
    lines.append("  " + sql_string("INSULATION") + ",")
    lines.append("  5,")
    lines.append("  2400,")
    lines.append("  1200,")
    lines.append("  NULL")
    lines.append(")")
    lines.append("ON CONFLICT (code) DO UPDATE SET")
    lines.append("  name = EXCLUDED.name,")
    lines.append("  description = EXCLUDED.description,")
    lines.append("  short_description = EXCLUDED.short_description,")
    lines.append("  seo_title = EXCLUDED.seo_title,")
    lines.append("  seo_description = EXCLUDED.seo_description,")
    lines.append("  category = EXCLUDED.category,")
    lines.append("  image_url = EXCLUDED.image_url,")
    lines.append("  materials = EXCLUDED.materials,")
    lines.append("  search_tags = EXCLUDED.search_tags,")
    lines.append("  variant_options = EXCLUDED.variant_options,")
    lines.append("  family_slug = EXCLUDED.family_slug,")
    lines.append("  calculator_type = EXCLUDED.calculator_type,")
    lines.append("  wastage_pct = EXCLUDED.wastage_pct,")
    lines.append("  length_mm = EXCLUDED.length_mm,")
    lines.append("  width_mm = EXCLUDED.width_mm,")
    lines.append("  is_active = true,")
    lines.append("  deleted_at = NULL;")
    lines.append("")

    return "\n".join(lines)


def build_cavity_section() -> str:
    """Section 3 - CAVITY INSULATION (100mm + 150mm only)."""
    lines = []
    lines.append("-- ────────────────────────────────────────────────────────────────────────")
    lines.append("-- 3. CAVITY INSULATION  (CAV-007 + CAV-008 -> CAV-009, 2 rows -> 1 product)")
    lines.append("--    CAV-006 \"Full Fill Cavity Insulation 90mm\" is a different product")
    lines.append("--    (full fill vs partial fill) and is LEFT as a standalone.")
    lines.append("-- ────────────────────────────────────────────────────────────────────────")
    lines.append("")

    # 3a. Soft-delete the 2 superseded rows
    codes = [f"'CAV-{t[3]}'" for t in CAVITY_THICKNESSES]
    lines.append("UPDATE public.products")
    lines.append("SET is_active = false, deleted_at = now()")
    lines.append("WHERE code IN (" + ", ".join(codes) + ")")
    lines.append("  AND is_active = true;")
    lines.append("")

    # 3b. Insert redirects
    for _, _, _, orig in CAVITY_THICKNESSES:
        lines.append(
            f"INSERT INTO public.product_redirects (old_code, new_code) "
            f"VALUES ('CAV-{orig}', '{CAVITY_NEW_CODE}') "
            f"ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;"
        )
    lines.append("")

    # 3c. Build the consolidated product
    variant_options = [{
        "material": "Partial-fill cavity insulation",
        "image": "/products/cavity-insulation-100mm.webp",
        "selectors": [{
            "name": "size",
            "label": "Thickness",
            "options": [
                {"value": f"cav-{slug}", "text": f"{thickness}mm"}
                for (thickness, slug, label, _) in CAVITY_THICKNESSES
            ],
        }],
    }]

    search_tags = [
        "insulation", "cavity insulation", "wall insulation", "partial fill cavity",
        "cavity wall insulation", "cavity batts",
    ]
    for (thickness, slug, label, _) in CAVITY_THICKNESSES:
        search_tags.append(f"cavity insulation {thickness}mm")
        search_tags.append(f"{thickness}mm cavity insulation")

    description = (
        "Cavity Wall Insulation is a partial-fill rigid insulation board for "
        "masonry cavity walls, installed between the inner and outer leaves "
        "with a residual cavity. Standard 1200mm x 450mm board, available in "
        "100mm and 150mm thicknesses. Select a thickness below for R-values, "
        "coverage and trade pricing."
    )
    short_description = (
        "Partial-fill cavity wall insulation — 1200x450mm board in 100mm "
        "and 150mm thicknesses."
    )
    seo_title = "Cavity Wall Insulation | Star Hawk Builders Merchant"
    seo_description = (
        "Order Cavity Wall Insulation online. 1200x450mm partial-fill rigid "
        "insulation in 100mm and 150mm thicknesses. Trade price and same-day "
        "delivery from Star Hawk."
    )

    lines.append("INSERT INTO public.products (")
    lines.append("  code, name, description, short_description, seo_title, seo_description,")
    lines.append("  unit, category, default_price, image_url, is_active, materials,")
    lines.append("  search_tags, variant_options, family_slug, calculator_type, wastage_pct,")
    lines.append("  length_mm, width_mm, thickness_mm")
    lines.append(") VALUES (")
    lines.append("  " + sql_string(CAVITY_NEW_CODE) + ",")
    lines.append("  " + sql_string("Cavity Wall Insulation") + ",")
    lines.append("  " + sql_string(description) + ",")
    lines.append("  " + sql_string(short_description) + ",")
    lines.append("  " + sql_string(seo_title) + ",")
    lines.append("  " + sql_string(seo_description) + ",")
    lines.append("  " + sql_string("SHEET") + ",")
    lines.append("  " + sql_string("Insulation") + ",")
    lines.append("  0,")
    lines.append("  '/products/cavity-insulation-100mm.webp',")
    lines.append("  true,")
    lines.append("  " + jsonb_literal(["Mineral wool"]) + ",")
    lines.append("  " + text_array_literal(search_tags) + ",")
    lines.append("  " + jsonb_literal(variant_options) + ",")
    lines.append("  " + sql_string("cavity-wall-insulation") + ",")
    lines.append("  " + sql_string("INSULATION") + ",")
    lines.append("  5,")
    lines.append("  1200,")
    lines.append("  450,")
    lines.append("  NULL")
    lines.append(")")
    lines.append("ON CONFLICT (code) DO UPDATE SET")
    lines.append("  name = EXCLUDED.name,")
    lines.append("  description = EXCLUDED.description,")
    lines.append("  short_description = EXCLUDED.short_description,")
    lines.append("  seo_title = EXCLUDED.seo_title,")
    lines.append("  seo_description = EXCLUDED.seo_description,")
    lines.append("  category = EXCLUDED.category,")
    lines.append("  image_url = EXCLUDED.image_url,")
    lines.append("  materials = EXCLUDED.materials,")
    lines.append("  search_tags = EXCLUDED.search_tags,")
    lines.append("  variant_options = EXCLUDED.variant_options,")
    lines.append("  family_slug = EXCLUDED.family_slug,")
    lines.append("  calculator_type = EXCLUDED.calculator_type,")
    lines.append("  wastage_pct = EXCLUDED.wastage_pct,")
    lines.append("  length_mm = EXCLUDED.length_mm,")
    lines.append("  width_mm = EXCLUDED.width_mm,")
    lines.append("  is_active = true,")
    lines.append("  deleted_at = NULL;")
    lines.append("")

    return "\n".join(lines)


def build_sheet_section() -> str:
    """Section 4 - SHEET MATERIALS (3 new products)."""
    lines = []
    lines.append("-- ────────────────────────────────────────────────────────────────────────")
    lines.append("-- 4. SHEET MATERIALS  (8 rows -> 3 products)")
    lines.append("--    SHE-010  OSB3 Board              (SHE-001/006/007 12mm + 18mm + 18mm T&G)")
    lines.append("--    SHE-011  Structural Plywood     (SHE-005/008/012/018mm WBP + 18mm shuttering)")
    lines.append("--    SHE-012  Chipboard Flooring     (SHE-003 18mm + SHE-009 22mm)")
    lines.append("-- ────────────────────────────────────────────────────────────────────────")
    lines.append("")

    # 4a. Soft-delete the 8 superseded rows
    all_codes = []
    for group in SHEET_GROUPS:
        for _, _, orig in group["variants"]:
            all_codes.append(f"'SHE-{orig}'")
    lines.append("UPDATE public.products")
    lines.append("SET is_active = false, deleted_at = now()")
    lines.append("WHERE code IN (" + ", ".join(all_codes) + ")")
    lines.append("  AND is_active = true;")
    lines.append("")

    # 4b. Insert redirects
    for group in SHEET_GROUPS:
        for _, _, orig in group["variants"]:
            lines.append(
                f"INSERT INTO public.product_redirects (old_code, new_code) "
                f"VALUES ('SHE-{orig}', '{group['new_code']}') "
                f"ON CONFLICT (old_code) DO UPDATE SET new_code = EXCLUDED.new_code;"
            )
    lines.append("")

    # 4c. Build the consolidated products
    lines.append("INSERT INTO public.products (")
    lines.append("  code, name, description, short_description, seo_title, seo_description,")
    lines.append("  unit, category, default_price, image_url, is_active, materials,")
    lines.append("  search_tags, variant_options, family_slug, calculator_type, wastage_pct,")
    lines.append("  length_mm, width_mm, thickness_mm")
    lines.append(") VALUES")
    lines.append("")

    product_values = []
    for group in SHEET_GROUPS:
        # Build variant options
        variant_options = [{
            "material": group["name"],
            "image": f"/products/{group['family_image']}",
            "selectors": [{
                "name": "size",
                "label": "Size",
                "options": [
                    {"value": v[1], "text": v[0]} for v in group["variants"]
                ],
            }],
        }]

        # Build search tags
        base_tags = ["sheet material", "sheet materials", "board", "sheet"]
        if "osb" in group["name"].lower():
            base_tags += ["osb", "osb board", "osb3", "oriented strand board", "structural board"]
        if "plywood" in group["name"].lower():
            base_tags += ["plywood", "ply", "wbp", "structural plywood", "shuttering plywood", "exterior plywood"]
        if "chipboard" in group["name"].lower():
            base_tags += ["chipboard", "chipboard flooring", "flooring board", "t&g chipboard", "particle board"]
        for (label, value, _) in group["variants"]:
            base_tags.append(f"{group['name']} {label}")

        # De-duplicate
        seen = set()
        deduped = []
        for tag in base_tags:
            if tag not in seen:
                seen.add(tag)
                deduped.append(tag)
        search_tags = deduped

        product_values.append({
            "code": group["new_code"],
            "name": group["name"],
            "description": group["description"],
            "short_description": group["short_description"],
            "seo_title": group["seo_title"],
            "seo_description": group["seo_description"],
            "unit": "SHEET",
            "category": "Sheet Materials",
            "default_price": 0,
            "image_url": f"/products/{group['family_image']}",
            "is_active": True,
            "materials": [group["name"]],
            "search_tags": search_tags,
            "variant_options": variant_options,
            "family_slug": group["family_slug"],
            "calculator_type": "SHEET_MATERIALS",
            "wastage_pct": 5,
            "length_mm": group["length_mm"],
            "width_mm": group["width_mm"],
            "thickness_mm": None,
        })

    # Render the values tuples
    value_strs = []
    for v in product_values:
        def fmt(key, value):
            if value is None:
                return "NULL"
            if key in ("search_tags",):
                return text_array_literal(value)
            if key in ("variant_options", "materials"):
                return jsonb_literal(value)
            if key in ("default_price", "wastage_pct", "length_mm", "width_mm", "thickness_mm"):
                return str(value)
            if isinstance(value, bool):
                return "true" if value else "false"
            return sql_string(value)

        fields_in_order = [
            "code", "name", "description", "short_description",
            "seo_title", "seo_description", "unit", "category",
            "default_price", "image_url", "is_active", "materials",
            "search_tags", "variant_options", "family_slug",
            "calculator_type", "wastage_pct", "length_mm", "width_mm", "thickness_mm",
        ]
        rendered = [fmt(k, v[k]) for k in fields_in_order]
        value_strs.append("  (\n" + ",\n".join("    " + r for r in rendered) + "\n  )")

    lines.append(",\n".join(value_strs))
    lines.append("")
    lines.append("ON CONFLICT (code) DO UPDATE SET")
    lines.append("  name = EXCLUDED.name,")
    lines.append("  description = EXCLUDED.description,")
    lines.append("  short_description = EXCLUDED.short_description,")
    lines.append("  seo_title = EXCLUDED.seo_title,")
    lines.append("  seo_description = EXCLUDED.seo_description,")
    lines.append("  category = EXCLUDED.category,")
    lines.append("  image_url = EXCLUDED.image_url,")
    lines.append("  materials = EXCLUDED.materials,")
    lines.append("  search_tags = EXCLUDED.search_tags,")
    lines.append("  variant_options = EXCLUDED.variant_options,")
    lines.append("  family_slug = EXCLUDED.family_slug,")
    lines.append("  calculator_type = EXCLUDED.calculator_type,")
    lines.append("  wastage_pct = EXCLUDED.wastage_pct,")
    lines.append("  length_mm = EXCLUDED.length_mm,")
    lines.append("  width_mm = EXCLUDED.width_mm,")
    lines.append("  is_active = true,")
    lines.append("  deleted_at = NULL;")
    lines.append("")

    return "\n".join(lines)


def build_header() -> str:
    """Migration file header."""
    return """-- =============================================================================
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
-- The 59 individual rows are soft-deleted (deleted_at + is_active=false)
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
"""


def build_footer() -> str:
    return "COMMIT;\n"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parts = [
        build_header(),
        build_timber_section(),
        build_pir_section(),
        build_cavity_section(),
        build_sheet_section(),
        build_footer(),
    ]
    OUT_PATH.write_text("\n".join(parts), encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    print(f"  size: {OUT_PATH.stat().st_size} bytes")
    # Quick line count for sanity
    lines = OUT_PATH.read_text(encoding="utf-8").splitlines()
    print(f"  lines: {len(lines)}")
    # Quick counts
    timber_old = sum(1 for _ in TIMBER_SECTIONS) * 7
    pir_old = len(PIR_THICKNESSES)
    cavity_old = len(CAVITY_THICKNESSES)
    sheet_old = sum(len(g["variants"]) for g in SHEET_GROUPS)
    total_old = timber_old + pir_old + cavity_old + sheet_old
    total_new = len(TIMBER_SECTIONS) + 1 + 1 + len(SHEET_GROUPS)
    print()
    print("Summary:")
    print(f"  TIMBER:  {timber_old} rows -> {len(TIMBER_SECTIONS)} products  (TIM-046..{46+len(TIMBER_SECTIONS)-1:03d})")
    print(f"  PIR:     {pir_old} rows -> 1 product  (PIR-009)")
    print(f"  CAVITY:  {cavity_old} rows -> 1 product  (CAV-009)")
    print(f"  SHEET:   {sheet_old} rows -> {len(SHEET_GROUPS)} products  (SHE-010..{10+len(SHEET_GROUPS)-1:03d})")
    print(f"  TOTAL:   {total_old} rows -> {total_new} products")


if __name__ == "__main__":
    main()
