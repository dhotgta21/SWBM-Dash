"""Promote the 10 walk-in (TEMPORARY) products from the admin dashboard
screenshot into permanent catalogue entries.

The operator captures these "on the fly" as walk-in invoice line items
via the QuickProductAdder. The screenshot showed 10 of them in the
Temporary products tab — each has only a placeholder code (TEMP-XXXXXXXX)
and a name; description, price, category and image are all missing.

This script emits a migration that:

  1. INSERTs 7 new permanent products covering the real catalogue items
     (Post Mix Concrete, Marshall Block Paving Pallet, Weep Vents,
     Air Brick Buff, Floor Beam 4.2m, Pavemix, Luxury Porcelain Slabs).
  2. Skips 3 of the screenshot rows:
        * Ibstock Red Multi        -> already a permanent product (BRI-033)
        * Cavitywall Insulation 150mm -> already a permanent product (CAV-008)
        * Fuel surcharge           -> service charge, not a physical product
     These rows stay as temporary on the operator's dashboard so they
     can decide what to do with them (edit + complete, or delete).

The codes below are picked to not collide with the 80-row catalog-plan
batch (which used AGG-001..009, BLO-001..004, BRI-001..033, CAV-001..008,
PLA-001..008, PIR-001..008, SHE-001..009, TIM-001..045) or the
consolidated STL rows (STL-001..076 after migration 158).

Output: supabase/migrations/159_promote_temporary_products.sql
"""

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT_PATH = REPO / "supabase" / "migrations" / "159_promote_temporary_products.sql"

# Each row is a permanent product. Fields are filled based on best guess
# of what the operator sells; the operator can adjust description, image
# and category post-migration via the admin form.
PRODUCTS = [
    {
        "code": "AGG-010",
        "name": "Post Mix Concrete",
        "category": "Aggregates & Cement",
        "unit": "BAG",
        "description": (
            "Post Mix Concrete is a fast-setting ready-to-use concrete mix for "
            "fence posts, gate posts, deck posts and small structural fixings. "
            "Just add water — no mixing required. Sets in minutes for quick "
            "fence and sign installations. Supplied in 20kg bags."
        ),
        "short_description": "Fast-setting ready-mix concrete for fence and gate posts.",
        "seo_title": "Post Mix Concrete 20kg | Star Hawk Builders Merchant",
        "seo_description": (
            "Order Post Mix Concrete online. Fast-setting ready-mix concrete for "
            "fence posts, gate posts and deck posts. 20kg bag, same-day delivery "
            "from Star Hawk."
        ),
        "image_url": "/products/post-mix-concrete.webp",
        "materials": ["Concrete", "Cement"],
        "search_tags": [
            "post mix", "postmix", "postcrete", "fence post concrete",
            "post mix concrete", "ready mix", "ready-mix", "fast set",
            "fast-set", "fence post mix", "concrete post",
        ],
        "applications": [
            "Fence post installation",
            "Gate post setting",
            "Deck post bases",
            "Sign post fixing",
            "Rotary line posts",
        ],
    },
    {
        "code": "BLO-005",
        "name": "Marshall Block Paving Pallet",
        "category": "Blocks",
        "unit": "EA",
        "description": (
            "Marshall Block Paving Pallet is a standard-sized block paving "
            "pallet covering approximately 10-12m² depending on block size. "
            "Standard 50mm thickness for domestic driveways, patios and paths. "
            "Available in Charcoal, Brindle, Burnt Ochre and Natural. Contact "
            "the trade counter for current colours and a delivered price."
        ),
        "short_description": "Standard block paving pallet (~10-12m²) for domestic driveways and patios.",
        "seo_title": "Marshall Block Paving Pallet | Star Hawk Builders Merchant",
        "seo_description": (
            "Order Marshall Block Paving Pallet online. Standard 50mm block "
            "paving, ~10-12m² per pallet for driveways and patios. Trade "
            "price and site delivery from Star Hawk."
        ),
        "image_url": "/products/marshall-block-paving.webp",
        "materials": ["Concrete"],
        "search_tags": [
            "block paving", "marshall", "paving slab", "driveway block",
            "patio block", "pallet paving", "block pave", "paving stone",
            "paving", "concrete block paving",
        ],
        "applications": [
            "Domestic driveways",
            "Garden patios",
            "Paths and walkways",
            "Parking areas",
        ],
    },
    {
        "code": "FIX-017",
        "name": "Weep Vents",
        "category": "Fixings",
        "unit": "EA",
        "description": (
            "Weep Vents are small plastic or stainless-steel vent inserts fitted "
            "in the perpend joints of external brickwork to drain moisture from "
            "cavity walls. Standard colour-matched to brick mortar. Pack of 50."
        ),
        "short_description": "Cavity wall weep vents for drainage through brickwork.",
        "seo_title": "Weep Vents | Star Hawk Builders Merchant",
        "seo_description": (
            "Order Weep Vents online. Cavity wall drainage inserts for "
            "external brickwork. Trade pack of 50, same-day delivery from "
            "Star Hawk."
        ),
        "image_url": "/products/weep-vents.webp",
        "materials": ["Plastic"],
        "search_tags": [
            "weep vent", "weep hole", "cavity vent", "wall vent",
            "brick vent", "drainage vent", "cavity drainage",
            "weep", "vent", "wall weep",
        ],
        "applications": [
            "External brickwork drainage",
            "Cavity wall venting",
            "Above DPC",
        ],
    },
    {
        "code": "BLO-006",
        "name": "Air Brick Buff",
        "category": "Blocks",
        "unit": "EA",
        "description": (
            "Air Brick Buff is a buff-coloured air brick for through-wall "
            "ventilation in suspended floors, sub-floor voids and cavity "
            "walls. Standard 215x140mm face size to suit a 9x6 inch opening. "
            "Manufactured in a buff/sandstone colour to match lighter brickwork."
        ),
        "short_description": "Buff-coloured air brick for sub-floor and cavity ventilation.",
        "seo_title": "Air Brick Buff | Star Hawk Builders Merchant",
        "seo_description": (
            "Order Air Brick Buff online. Buff-coloured through-wall air brick "
            "for sub-floor and cavity ventilation. Standard 215x140mm, trade "
            "price from Star Hawk."
        ),
        "image_url": "/products/air-brick-buff.webp",
        "materials": ["Clay"],
        "search_tags": [
            "air brick", "airbrick", "buff air brick", "ventilation brick",
            "sub floor vent", "cavity vent", "through wall vent",
            "air vent", "floor vent",
        ],
        "applications": [
            "Suspended floor ventilation",
            "Sub-floor void venting",
            "Cavity wall ventilation",
            "Garage sub-floor vents",
        ],
    },
    {
        "code": "STL-077",
        "name": "Floor Beam 4.2m",
        "category": "Steel & Lintels",
        "unit": "EA",
        "description": (
            "Floor Beam 4.2m is a pre-stressed concrete floor beam for "
            "ground and upper floors. Standard 4.2 metre length, 150mm deep, "
            "designed to work with concrete block infill. Trade price per "
            "beam — quantity discount available for full floor kits."
        ),
        "short_description": "Pre-stressed concrete floor beam, 4.2 metre length.",
        "seo_title": "Floor Beam 4.2m | Star Hawk Builders Merchant",
        "seo_description": (
            "Order Floor Beam 4.2m online. Pre-stressed concrete floor beam "
            "for ground and upper floors. Trade price and site delivery from "
            "Star Hawk."
        ),
        "image_url": "/products/floor-beam-concrete.webp",
        "materials": ["Concrete", "Pre-stressed concrete"],
        "search_tags": [
            "floor beam", "concrete floor beam", "pre-stressed beam",
            "prestressed beam", "4.2m beam", "4.2 metre beam",
            "ground floor beam", "upper floor beam", "floor joist",
        ],
        "applications": [
            "Ground floor construction",
            "Upper floor construction",
            "Extensions",
            "Garage floors",
        ],
    },
    {
        "code": "AGG-011",
        "name": "Pavemix",
        "category": "Aggregates & Cement",
        "unit": "BAG",
        "description": (
            "Pavemix is a pre-blended sand and cement paving mix for laying "
            "slabs, paviors and block paving bedding. Just add water, mix "
            "and lay. Supplied in 20kg bags. Trade pack pricing for full "
            "paving projects."
        ),
        "short_description": "Pre-blended sand and cement paving mix for slabs and paviors.",
        "seo_title": "Pavemix | Star Hawk Builders Merchant",
        "seo_description": (
            "Order Pavemix online. Pre-blended sand and cement paving mix for "
            "laying slabs, paviors and block paving. 20kg bag, same-day "
            "delivery from Star Hawk."
        ),
        "image_url": "/products/pavemix.webp",
        "materials": ["Sand", "Cement"],
        "search_tags": [
            "pavemix", "paving mix", "slab mix", "patio mix",
            "sand cement mix", "paving sand", "mortar mix",
            "paving bed", "paving base",
        ],
        "applications": [
            "Laying paving slabs",
            "Setting paviors",
            "Block paving bedding",
            "Patio construction",
        ],
    },
    {
        "code": "AGG-012",
        "name": "Luxury Porcelain Slabs",
        "category": "Aggregates & Cement",
        "unit": "M2",
        "description": (
            "Luxury Porcelain Slabs are large-format 20mm porcelain paving "
            "for premium patios, terraces and balconies. 600x600mm standard, "
            "available in Marble, Stone and Wood-effect finishes. Sold per "
            "square metre — order in full packs. Trade price on application."
        ),
        "short_description": "Large-format 20mm porcelain paving slabs for premium patios.",
        "seo_title": "Luxury Porcelain Slabs | Star Hawk Builders Merchant",
        "seo_description": (
            "Order Luxury Porcelain Slabs online. 20mm porcelain paving in "
            "Marble, Stone and Wood-effect finishes for premium patios and "
            "terraces. Trade price per m² from Star Hawk."
        ),
        "image_url": "/products/luxury-porcelain-slabs.webp",
        "materials": ["Porcelain"],
        "search_tags": [
            "porcelain slab", "porcelain paving", "luxury paving",
            "20mm porcelain", "large format slab", "patio slab",
            "porcelain tile", "outdoor porcelain", "premium paving",
        ],
        "applications": [
            "Premium patios",
            "Terraces",
            "Balconies",
            "Roof terraces",
        ],
    },
]


def sql_string(s: str | None) -> str:
    if s is None:
        return "NULL"
    return "'" + s.replace("'", "''") + "'"


def text_array(values) -> str:
    if not values:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ", ".join(sql_string(v) for v in values) + "]"


def jsonb_literal(obj) -> str:
    return sql_string(json.dumps(obj, ensure_ascii=False)) + "::jsonb"


HEADER = """\
-- =============================================================================
-- 159_promote_temporary_products.sql
-- =============================================================================
-- Promotes the 10 walk-in (TEMPORARY) products visible in the dashboard
-- screenshot into permanent catalogue entries. The operator captures these
-- on the fly as walk-in invoice line items via the QuickProductAdder
-- helper; this migration gives them real codes, categories, descriptions,
-- search tags and SEO so the public catalogue and search pick them up.
--
-- 7 new permanent products are inserted:
--
--   AGG-010  Post Mix Concrete
--   BLO-005  Marshall Block Paving Pallet
--   FIX-017  Weep Vents
--   BLO-006  Air Brick Buff
--   STL-077  Floor Beam 4.2m
--   AGG-011  Pavemix
--   AGG-012  Luxury Porcelain Slabs
--
-- 3 of the 10 screenshot rows are NOT migrated because:
--
--   * Ibstock Red Multi          -> already a permanent product (BRI-033)
--   * Cavitywall Insulation 150mm -> already a permanent product (CAV-008)
--   * Fuel surcharge             -> service charge, not a physical product
--
-- The 3 original temporary rows stay in the dashboard so the operator can
-- decide what to do with them (edit and fill in details, or hard-delete
-- via the trash icon in the Temporary products list).
--
-- Idempotency: every INSERT is `ON CONFLICT (code) DO UPDATE` so re-running
-- the migration updates the existing rows in place without duplicating.
-- =============================================================================

BEGIN;
"""


def build_insert_row(p) -> str:
    return (
        f"  ({sql_string(p['code'])},\n"
        f"   {sql_string(p['name'])},\n"
        f"   {sql_string(p['description'])},\n"
        f"   {sql_string(p['unit'])},\n"
        f"   {sql_string(p['category'])},\n"
        f"   0,\n"
        f"   {sql_string(p['image_url'])},\n"
        f"   true,\n"
        f"   {sql_string(p['seo_title'])},\n"
        f"   {sql_string(p['seo_description'])},\n"
        f"   {sql_string(p['short_description'])},\n"
        f"   {text_array(p['key_features'] if 'key_features' in p else [])},\n"
        f"   {text_array(p['search_tags'])},\n"
        f"   NULL,\n"
        f"   NULL,\n"
        f"   {text_array(p['applications'])},\n"
        f"   NULL,\n"
        f"   NULL,\n"
        f"   NULL,\n"
        f"   NULL,\n"
        f"   NULL,\n"
        f"   NULL,\n"
        f"   NULL,\n"
        f"   NULL,\n"
        f"   5,\n"
        f"   NULL,\n"
        f"   {text_array(p['materials'])},\n"
        f"   NULL,\n"
        f"   NULL,\n"
        f"   NULL)"
    )


def main():
    parts = [HEADER]

    # Cover the new code prefixes the operator might be searching under.
    # The audit also wants to know which categories we touched, so the
    # header comment lists them.
    categories = sorted({p["category"] for p in PRODUCTS})
    print(f"Categories covered: {', '.join(categories)}")
    print(f"Total new products: {len(PRODUCTS)}")
    print()

    parts.append(f"""\
-- ────────────────────────────────────────────────────────────────────────────
-- INSERT {len(PRODUCTS)} new permanent products
-- ────────────────────────────────────────────────────────────────────────────

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

    rows = [build_insert_row(p) for p in PRODUCTS]
    parts.append(",\n".join(rows))
    parts.append("\n\nON CONFLICT (code) DO UPDATE SET\n"
                 "  name = EXCLUDED.name,\n"
                 "  description = EXCLUDED.description,\n"
                 "  unit = EXCLUDED.unit,\n"
                 "  category = EXCLUDED.category,\n"
                 "  image_url = EXCLUDED.image_url,\n"
                 "  is_active = true,\n"
                 "  seo_title = EXCLUDED.seo_title,\n"
                 "  seo_description = EXCLUDED.seo_description,\n"
                 "  short_description = EXCLUDED.short_description,\n"
                 "  search_tags = EXCLUDED.search_tags,\n"
                 "  applications = EXCLUDED.applications,\n"
                 "  materials = EXCLUDED.materials;\n\n")

    parts.append("COMMIT;\n")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text("".join(parts), encoding="utf-8")
    print(f"Wrote {OUT_PATH}")
    print()
    print("Products to insert:")
    for p in PRODUCTS:
        print(f"  {p['code']}  {p['category']:<22}  {p['name']}")


if __name__ == "__main__":
    main()
