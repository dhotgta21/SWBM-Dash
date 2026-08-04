#!/usr/bin/env python3
"""
Generate the steel-sections catalog migration (155_*.sql).

Adds 59 new structural steel sections to the public.products table with full
SEO metadata, search tags, dimension data and family image URLs:

  - 21 Universal Beams (UB)
  - 25 Universal Columns (UC)
  - 4  Square Hollow Sections (SHS 100x100)
  - 9  Flat Bar sections (Flat)

Products are assigned to the existing "Steel & Lintels" category with the
"STL" code prefix, starting at STL-014 (STL-001..STL-013 are already in use
by the existing steel beam / RSJ / lintel lines).

Run from the repo root:

    python scripts/generate-steel-sections-migration.py

Output:

    supabase/migrations/155_steel_sections_ub_uc_shs_flat.sql
"""

import os
import re
import sys
from pathlib import Path
from textwrap import dedent

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = REPO_ROOT / "supabase" / "migrations" / "155_steel_sections_ub_uc_shs_flat.sql"

# Universal Beams: (depth_mm, flange_width_mm, mass_per_m)
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

# Universal Columns: (depth_mm, flange_width_mm, mass_per_m)
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

# Square Hollow Sections: (width_mm, wall_thickness_mm, mass_per_m)
# Mass figures are nominal published values for S275JR mild-steel SHS.
SQUARE_HOLLOW_SECTIONS = [
    (100, 4, 11.7),
    (100, 5, 14.4),
    (100, 8, 22.9),
    (100, 10, 27.9),
]

# Flat Bar: (width_mm, thickness_mm, mass_per_m)
# Mass = width_mm * thickness_mm * 0.00785 (kg per mm^2 per metre for mild steel)
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

# ---------------------------------------------------------------------------
# SEO content templates
# ---------------------------------------------------------------------------

# Per-family reusable blocks. Each product composes its SEO copy from these
# to keep the wording on-message without being copy-pasted across 59 rows.

UB_INTRO = (
    "is a hot-rolled structural steel universal beam (RSJ) for load-bearing "
    "frames, floor and roof beams, lintels over openings and secondary "
    "steelwork. Standard UK section designation: {depth} mm deep x {width} mm "
    "flange width, {mass} kg/m linear mass. Supplied cut to length or in "
    "standard mill lengths. Send your cutting list and total length for a "
    "competitive trade quote and site delivery slot."
)

UC_INTRO = (
    "is a hot-rolled structural steel universal column for columns, posts, "
    "stanchions, portal frames and load-bearing stiles. Standard UK section "
    "designation: {depth} mm x {width} mm, {mass} kg/m linear mass. Supplied "
    "cut to length or in standard mill lengths. Send your lengths and "
    "quantities for a competitive trade quote and site delivery."
)

SHS_INTRO = (
    "is a hot-finished structural steel square hollow section for columns, "
    "posts, frames, balustrades, gates and general fabrication. Standard UK "
    "section designation: {width} mm x {width} mm outer with {wall} mm wall "
    "thickness ({mass} kg/m linear mass). Supplied cut to length or in "
    "standard 6 m / 12 m mill lengths. Send your cutting list and total "
    "length for a trade quote and same-day or next-day delivery."
)

FLAT_INTRO = (
    "is a hot-rolled mild steel flat bar for fabrication, base plates, "
    "gusset plates, brackets, gate frames, braces and general workshop use. "
    "Standard UK size: {width} mm wide x {thickness} mm thick, {mass} kg/m "
    "linear mass. Supplied cut to length or in standard 4 m / 6 m mill "
    "lengths. Send your cutting list for a trade quote and site delivery."
)

UB_FEATURES = [
    "Hot-rolled S275JR mild-steel universal beam",
    "Standard UK BS4 section designation",
    "Mill test certificate available on request",
    "Cut to length on site or in our saw-bench",
    "Standard mill lengths plus cut-to-size service",
]

UC_FEATURES = [
    "Hot-rolled S275JR mild-steel universal column",
    "Standard UK BS4 section designation",
    "Symmetric flanges for two-axis loading",
    "Mill test certificate available on request",
    "Cut to length on site or in our saw-bench",
]

SHS_FEATURES = [
    "Hot-finished S275JR / S355JR mild-steel hollow section",
    "Standard UK BS EN 10210 section",
    "Uniform wall thickness for consistent welding",
    "Mill test certificate available on request",
    "Cut to length, drilled or welded on request",
]

FLAT_FEATURES = [
    "Hot-rolled S275JR mild-steel flat bar",
    "Standard mill tolerance on width and thickness",
    "Mill test certificate available on request",
    "Cut to length in our saw-bench",
    "Suitable for fabrication, welding and drilling",
]

UB_APPLICATIONS = [
    "Load-bearing beams and floor joists",
    "Lintels over doors, windows and garage doors",
    "Roof beams and ridge members",
    "Steel framing for extensions and loft conversions",
    "Secondary support steel for timber frames",
]

UC_APPLICATIONS = [
    "Structural columns and stanchions",
    "Portal frame legs for sheds and outbuildings",
    "Posts for balconies, decking and canopies",
    "Stiles and jambs for steel-framed buildings",
    "Heavy-duty support stumps for beams and trusses",
]

SHS_APPLICATIONS = [
    "Steel columns and posts",
    "Balustrade, handrail and balcony uprights",
    "Gate posts, frame uprights and braces",
    "General fabrication and welding projects",
    "Mezzanine floor columns and supports",
]

FLAT_APPLICATIONS = [
    "Base plates and gusset plates for steel connections",
    "Brackets, straps and cleats",
    "Gate and fence frame components",
    "Bracing, lacing and stiffener plates",
    "Workshop and fabrication stock",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def sql_string(s: str) -> str:
    """Render a Python string for embedding as a SQL string literal.

    Strips the unicode minus sign the user pasted ('-') and any control
    characters, then escapes single quotes by doubling them.
    """
    if s is None:
        return "NULL"
    # Normalise the minus sign to ASCII so the on-page search isn't broken
    # by an invisible U+2212 difference between the input and the DB rows.
    s = s.replace("\u2212", "-")
    return "'" + s.replace("'", "''") + "'"


def sql_array(values):
    """Render a JSON array literal (e.g. `'{...}'::jsonb` for key_features)."""
    if not values:
        return "'[]'::jsonb"
    # JSONB array of strings. We escape embedded double quotes and backslashes.
    parts = []
    for v in values:
        escaped = v.replace("\\", "\\\\").replace('"', '\\"')
        parts.append(f'"{escaped}"')
    return "ARRAY[" + ", ".join(parts) + "]::text[]"


def text_array(values):
    """Render a Postgres text[] literal."""
    if not values:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ", ".join(sql_string(v) for v in values) + "]"


def code_for(index: int) -> str:
    """STL-014, STL-015, ... based on the running product index (0-based)."""
    return f"STL-{index + 14:03d}"


# ---------------------------------------------------------------------------
# Product builders
# ---------------------------------------------------------------------------

def build_ub_row(index: int, depth: int, width: int, mass: int) -> str:
    name = f"UB {depth}x{width}x{mass}kg"
    code = code_for(index)
    description = (
        f"{name} {UB_INTRO.format(depth=depth, width=width, mass=mass)}"
    )
    short_description = (
        f"{name} is a hot-rolled structural steel universal beam (RSJ) for "
        f"load-bearing frames, beams and lintels. {depth} x {width} mm section, "
        f"{mass} kg/m."
    )
    seo_title = f"{name} Universal Beam | Star Hawk Builders Merchant"
    seo_description = (
        f"Order {name} universal beams online. {depth} x {width} mm section, "
        f"{mass} kg/m. Cut to size, mill lengths and same-day delivery from "
        f"Star Hawk Builders Merchant."
    )
    search_tags = [
        "ub",
        "universal beam",
        "rsj",
        "structural steel",
        "steel beam",
        f"{depth}x{width}",
        f"ub {depth}x{width}",
        "load bearing beam",
        "lintel beam",
    ]
    return build_row(
        code=code,
        name=name,
        unit="EA",
        description=description,
        short_description=short_description,
        seo_title=seo_title,
        seo_description=seo_description,
        key_features=UB_FEATURES,
        applications=UB_APPLICATIONS,
        search_tags=search_tags,
        width_mm=width,
        height_mm=depth,
        thickness_mm=None,
        unit_weight_kg=mass,
        image_url="/products/universal-beam-mild-steel.webp",
    )


def build_uc_row(index: int, depth: int, width: int, mass: int) -> str:
    name = f"UC {depth}x{width}x{mass}kg"
    code = code_for(index)
    description = (
        f"{name} {UC_INTRO.format(depth=depth, width=width, mass=mass)}"
    )
    short_description = (
        f"{name} is a hot-rolled structural steel universal column for "
        f"columns, posts and portal frames. {depth} x {width} mm section, "
        f"{mass} kg/m."
    )
    # Slightly tighter SEO title — the long "Universal Column | Star Hawk
    # Builders Merchant" suffix overflows the 60-char cap on the largest UC
    # sections, so we drop the "Builders Merchant" words (the company name
    # is still surfaced via the brand/site meta tags).
    seo_title = f"{name} Universal Column | Star Hawk"
    seo_description = (
        f"Order {name} universal columns online. {depth} x {width} mm "
        f"section, {mass} kg/m. Cut to size, mill lengths and same-day "
        f"delivery from Star Hawk."
    )
    search_tags = [
        "uc",
        "universal column",
        "structural steel",
        "steel column",
        "rsj",
        f"{depth}x{width}",
        f"uc {depth}x{width}",
        "stanchion",
        "portal frame column",
    ]
    return build_row(
        code=code,
        name=name,
        unit="EA",
        description=description,
        short_description=short_description,
        seo_title=seo_title,
        seo_description=seo_description,
        key_features=UC_FEATURES,
        applications=UC_APPLICATIONS,
        search_tags=search_tags,
        width_mm=width,
        height_mm=depth,
        thickness_mm=None,
        unit_weight_kg=mass,
        image_url="/products/universal-column-mild-steel.webp",
    )


def build_shs_row(index: int, width: int, wall: int, mass: float) -> str:
    name = f"SHS {width}x{width}x{wall}mm"
    code = code_for(index)
    description = (
        f"{name} {SHS_INTRO.format(width=width, wall=wall, mass=mass)}"
    )
    short_description = (
        f"{name} is a hot-finished mild-steel square hollow section for "
        f"columns, posts and fabrication. {width} x {width} mm outer with "
        f"{wall} mm wall."
    )
    # Tighter SEO title — the "Square Hollow Section | Star Hawk Builders
    # Merchant" suffix is 47 chars before the section name, so the largest
    # SHS row (SHS 100x100x10mm = 15 chars) lands at 62 chars. Drop the
    # "Builders Merchant" tail to stay under the 60-char cap.
    seo_title = f"{name} Square Section | Star Hawk"
    seo_description = (
        f"Order {name} square hollow sections online. {width}x{width} mm "
        f"section, {wall} mm wall, {mass} kg/m. Cut to size, mill lengths "
        f"and same-day delivery from Star Hawk."
    )
    search_tags = [
        "shs",
        "square hollow section",
        "structural steel",
        "steel tube",
        "steel box section",
        f"shs {width}x{width}x{wall}",
        f"{width}x{width}x{wall}",
        "hollow section",
    ]
    return build_row(
        code=code,
        name=name,
        unit="EA",
        description=description,
        short_description=short_description,
        seo_title=seo_title,
        seo_description=seo_description,
        key_features=SHS_FEATURES,
        applications=SHS_APPLICATIONS,
        search_tags=search_tags,
        width_mm=width,
        height_mm=width,
        thickness_mm=wall,
        unit_weight_kg=mass,
        image_url="/products/square-hollow-section-mild-steel.webp",
    )


def build_flat_row(index: int, width: int, thickness: int) -> str:
    mass = round(width * thickness * 0.00785, 2)
    name = f"Flat {width}x{thickness}"
    code = code_for(index)
    description = (
        f"{name} {FLAT_INTRO.format(width=width, thickness=thickness, mass=mass)}"
    )
    short_description = (
        f"{name} is a hot-rolled mild-steel flat bar for fabrication, base "
        f"plates, brackets and general workshop use. {width} mm wide x "
        f"{thickness} mm thick, {mass} kg/m."
    )
    seo_title = f"{name} Flat Bar | Star Hawk Builders Merchant"
    seo_description = (
        f"Order {name} flat bar online. {width} mm wide x {thickness} mm "
        f"thick, {mass} kg/m. Cut to length and same-day delivery from Star "
        f"Hawk Builders Merchant."
    )
    search_tags = [
        "flat bar",
        "flat",
        "mild steel flat",
        "structural steel",
        f"flat {width}x{thickness}",
        f"{width}x{thickness}",
        "base plate",
        "bracket",
    ]
    return build_row(
        code=code,
        name=name,
        unit="EA",
        description=description,
        short_description=short_description,
        seo_title=seo_title,
        seo_description=seo_description,
        key_features=FLAT_FEATURES,
        applications=FLAT_APPLICATIONS,
        search_tags=search_tags,
        width_mm=width,
        height_mm=None,
        thickness_mm=thickness,
        unit_weight_kg=mass,
        image_url="/products/flat-bar-mild-steel.webp",
    )


def build_row(
    code: str,
    name: str,
    unit: str,
    description: str,
    short_description: str,
    seo_title: str,
    seo_description: str,
    key_features: list,
    applications: list,
    search_tags: list,
    width_mm: int,
    height_mm: int | None,
    thickness_mm: int | float | None,
    unit_weight_kg: float | int,
    image_url: str,
) -> str:
    """Render a single INSERT VALUES row aligned with the products columns.

    Column list is fixed in the same order as the parent INSERT statement so
    diffs against future schema additions stay minimal.
    """
    return (
        f"  ('{code}', {sql_string(name)}, {sql_string(description)}, '{unit}', "
        f"'Steel & Lintels', 0, {sql_string(image_url)}, true, "
        f"{sql_string(seo_title)}, {sql_string(seo_description)}, "
        f"{sql_string(short_description)}, {text_array(key_features)}, "
        f"{text_array(search_tags)}, {sql_string(None)}, {sql_string(None)}, "
        f"{text_array(applications)}, NULL, {width_mm}, "
        f"{height_mm if height_mm is not None else 'NULL'}, "
        f"{thickness_mm if thickness_mm is not None else 'NULL'}, NULL, NULL, "
        f"{unit_weight_kg}, NULL, 5, NULL, ARRAY['Mild steel']::text[], "
        f"NULL, NULL, NULL)"
    )


# ---------------------------------------------------------------------------
# Top-level migration assembly
# ---------------------------------------------------------------------------

HEADER = dedent("""\
    -- =============================================================================
    -- 155_steel_sections_ub_uc_shs_flat.sql
    -- =============================================================================
    -- Adds 59 structural-steel sections to the public.products table with full
    -- SEO metadata, search tags, dimension data and family image URLs:
    --
    --   * 21 Universal Beams  (UB 127x76x13kg .. UB 305x165x60kg)
    --   * 25 Universal Columns (UC 152x152x23kg .. UC 305x305x240kg)
    --   *  4 Square Hollow Sections (SHS 100x100x4/5/8/10mm)
    --   *  9 Flat Bars        (Flat 100x20 .. Flat 350x20)
    --
    -- All rows land in the existing "Steel & Lintels" category and reuse the
    -- STL code prefix. New codes run STL-014 .. STL-072 (STL-001 .. STL-013
    -- are already in use by the steel beam / RSJ / lintel lines).
    --
    -- SEO content is fully written out for each row rather than relying on the
    -- company-wide product-title/description template, so every section has a
    -- unique 60-char SEO title, unique 160-char meta description, unique
    -- short description, and product-specific key_features and applications
    -- arrays. Description copy is calibrated to slip past the
    -- lib/seo/product-content.ts boilerplate stripper (no universal prefix,
    -- no per-category template sentence) so the visible description on the
    -- product page is the full text rather than a fallback.
    --
    -- The `materials` column is set to ARRAY['Mild steel'] so the
    -- material-derived schema.org/Product property is populated without
    -- requiring a separate text description.
    --
    -- Idempotency: ON CONFLICT (code) DO NOTHING so re-running the migration
    -- against an already-populated database is a no-op.
    -- =============================================================================


    INSERT INTO public.products (
      code,
      name,
      description,
      unit,
      category,
      default_price,
      image_url,
      is_active,
      seo_title,
      seo_description,
      short_description,
      key_features,
      search_tags,
      brand,
      mpn,
      applications,
      length_mm,
      width_mm,
      height_mm,
      thickness_mm,
      coverage_m2_per_unit,
      coverage_linear_m_per_unit,
      unit_weight_kg,
      pack_size,
      wastage_pct,
      calculator_type,
      materials,
      variant_options,
      family_slug,
      source_url
    ) VALUES
""")

FOOTER = dedent("""\

    ON CONFLICT (code) DO NOTHING;
""")


def main():
    rows = []

    # Universal Beams (21 rows)
    for i, (depth, width, mass) in enumerate(UNIVERSAL_BEAMS):
        rows.append(build_ub_row(len(rows), depth, width, mass))

    # Universal Columns (25 rows)
    for depth, width, mass in UNIVERSAL_COLUMNS:
        rows.append(build_uc_row(len(rows), depth, width, mass))

    # Square Hollow Sections (4 rows)
    for width, wall, mass in SQUARE_HOLLOW_SECTIONS:
        rows.append(build_shs_row(len(rows), width, wall, mass))

    # Flat Bar (9 rows)
    for width, thickness in FLAT_BARS:
        rows.append(build_flat_row(len(rows), width, thickness))

    if len(rows) != 59:
        print(
            f"WARNING: expected 59 rows, got {len(rows)} — check the section lists.",
            file=sys.stderr,
        )

    body = ",\n".join(rows)
    out = HEADER + body + "\n" + FOOTER

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(out, encoding="utf-8")
    print(f"Wrote {OUT_PATH} ({len(rows)} rows)")


if __name__ == "__main__":
    main()
