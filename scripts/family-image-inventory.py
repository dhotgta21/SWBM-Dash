"""Full inventory + family-image map for the entire public/products/ folder.

Goal: every product in the live DB should point to one image, and that
image should be the most specific "type" image available rather than a
per-product photo. Where a per-product photo already exists, keep it.
Where it doesn't, fall back to the family image for the product type.

This script:

  1. Lists every file in public/products/.
  2. Splits them into:
     - per-product (IMG-{CODE}.webp) → mapped to the matching code
     - family-style (named by type) → mapped to the family
  3. For every product in catalog-plan.json + the 59 new steel sections
     + the 13 existing STL-001..013, decides which image should be used
     and reports any product that still has no image.
  4. Prints a recommended file list to generate for any remaining gaps.
"""

import json
import re
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PLAN = REPO / "catalog-plan.json"
IMG_DIR = REPO / "public" / "products"

# 156 migration wire-ups (per-product IMG files that catalog-plan rows use)
PLAN_WIRED_TO_IMG = {
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

# 155 migration (steel sections) — each row points to a family image
STEEL_FAMILY = {
    "UB 127x76x13kg": "/products/universal-beam-mild-steel.webp",
    "UB 152x89x16kg": "/products/universal-beam-mild-steel.webp",
    "UB 152x89x19kg": "/products/universal-beam-mild-steel.webp",
    "UB 178x102x19kg": "/products/universal-beam-mild-steel.webp",
    "UB 178x102x22kg": "/products/universal-beam-mild-steel.webp",
    "UB 178x102x25kg": "/products/universal-beam-mild-steel.webp",
    "UB 203x102x23kg": "/products/universal-beam-mild-steel.webp",
    "UB 203x133x25kg": "/products/universal-beam-mild-steel.webp",
    "UB 203x133x30kg": "/products/universal-beam-mild-steel.webp",
    "UB 203x133x37kg": "/products/universal-beam-mild-steel.webp",
    "UB 254x102x22kg": "/products/universal-beam-mild-steel.webp",
    "UB 254x102x25kg": "/products/universal-beam-mild-steel.webp",
    "UB 254x146x31kg": "/products/universal-beam-mild-steel.webp",
    "UB 254x146x37kg": "/products/universal-beam-mild-steel.webp",
    "UB 254x146x43kg": "/products/universal-beam-mild-steel.webp",
    "UB 305x102x25kg": "/products/universal-beam-mild-steel.webp",
    "UB 305x102x28kg": "/products/universal-beam-mild-steel.webp",
    "UB 305x165x40kg": "/products/universal-beam-mild-steel.webp",
    "UB 305x165x46kg": "/products/universal-beam-mild-steel.webp",
    "UB 305x165x54kg": "/products/universal-beam-mild-steel.webp",
    "UB 305x165x60kg": "/products/universal-beam-mild-steel.webp",
    "UC 152x152x23kg": "/products/universal-column-mild-steel.webp",
    "UC 152x152x30kg": "/products/universal-column-mild-steel.webp",
    "UC 152x152x37kg": "/products/universal-column-mild-steel.webp",
    "UC 152x152x44kg": "/products/universal-column-mild-steel.webp",
    "UC 152x152x51kg": "/products/universal-column-mild-steel.webp",
    "UC 152x152x58kg": "/products/universal-column-mild-steel.webp",
    "UC 152x152x67kg": "/products/universal-column-mild-steel.webp",
    "UC 203x203x46kg": "/products/universal-column-mild-steel.webp",
    "UC 203x203x52kg": "/products/universal-column-mild-steel.webp",
    "UC 203x203x60kg": "/products/universal-column-mild-steel.webp",
    "UC 203x203x71kg": "/products/universal-column-mild-steel.webp",
    "UC 203x203x86kg": "/products/universal-column-mild-steel.webp",
    "UC 203x203x100kg": "/products/universal-column-mild-steel.webp",
    "UC 203x203x113kg": "/products/universal-column-mild-steel.webp",
    "UC 254x254x73kg": "/products/universal-column-mild-steel.webp",
    "UC 254x254x89kg": "/products/universal-column-mild-steel.webp",
    "UC 254x254x107kg": "/products/universal-column-mild-steel.webp",
    "UC 254x254x132kg": "/products/universal-column-mild-steel.webp",
    "UC 254x254x167kg": "/products/universal-column-mild-steel.webp",
    "UC 305x305x97kg": "/products/universal-column-mild-steel.webp",
    "UC 305x305x118kg": "/products/universal-column-mild-steel.webp",
    "UC 305x305x137kg": "/products/universal-column-mild-steel.webp",
    "UC 305x305x158kg": "/products/universal-column-mild-steel.webp",
    "UC 305x305x198kg": "/products/universal-column-mild-steel.webp",
    "UC 305x305x240kg": "/products/universal-column-mild-steel.webp",
    "SHS 100x100x4mm": "/products/square-hollow-section-mild-steel.webp",
    "SHS 100x100x5mm": "/products/square-hollow-section-mild-steel.webp",
    "SHS 100x100x8mm": "/products/square-hollow-section-mild-steel.webp",
    "SHS 100x100x10mm": "/products/square-hollow-section-mild-steel.webp",
    "Flat 100x20": "/products/flat-bar-mild-steel.webp",
    "Flat 200x20": "/products/flat-bar-mild-steel.webp",
    "Flat 300x20": "/products/flat-bar-mild-steel.webp",
    "Flat 300x10": "/products/flat-bar-mild-steel.webp",
    "Flat 300x12": "/products/flat-bar-mild-steel.webp",
    "Flat 400x20": "/products/flat-bar-mild-steel.webp",
    "Flat 350x15": "/products/flat-bar-mild-steel.webp",
    "Flat 350x12": "/products/flat-bar-mild-steel.webp",
    "Flat 350x20": "/products/flat-bar-mild-steel.webp",
}

# Map STL-001..013 to a family image. The existing 13 IMG-STL-XXX.webp are
# distinct per-SKU so we keep them where possible, but consolidate where
# the section TYPE matches.
STL_FAMILY = {
    # RSJ / universal beam — all share universal-beam-mild-steel.webp
    "STL-001": "/products/universal-beam-mild-steel.webp",
    "STL-002": "/products/universal-beam-mild-steel.webp",
    "STL-003": "/products/universal-beam-mild-steel.webp",
    # SHS box section
    "STL-004": "/products/square-hollow-section-mild-steel.webp",
    # PFC channel
    "STL-005": "/products/parallel-flange-channels-mild-steel.webp",
    # Steel angle
    "STL-006": "/products/equal-angle-mild-steel.webp",
    # Lintels — these are each distinct, keep the per-product photos
    "STL-007": "/products/IMG-STL-007.webp",
    "STL-008": "/products/IMG-STL-008.webp",
    "STL-009": "/products/IMG-STL-009.webp",
    "STL-010": "/products/IMG-STL-010.webp",
    "STL-011": "/products/IMG-STL-011.webp",
    "STL-012": "/products/IMG-STL-012.webp",
    "STL-013": "/products/IMG-STL-013.webp",
}

# ---------------------------------------------------------------------------
# Run the inventory
# ---------------------------------------------------------------------------

all_files = sorted(p.name for p in IMG_DIR.glob("*.webp"))
per_product = []   # IMG-{CODE}.webp
family_style = []  # everything else
for fn in all_files:
    if re.match(r"^IMG-[A-Z]{3}-\d{3}\.webp$", fn):
        per_product.append(fn)
    else:
        family_style.append(fn)

print("=" * 78)
print("PUBLIC/PRODUCTS/ IMAGE INVENTORY")
print("=" * 78)
print(f"Total files:            {len(all_files)}")
print(f"  Per-product (IMG-*):  {len(per_product)}")
print(f"  Family-style:         {len(family_style)}")
print()

# Parse per-product filenames to codes
img_per_code = {}
for fn in per_product:
    m = re.match(r"^IMG-([A-Z]{3}-\d{3})\.webp$", fn)
    img_per_code[m.group(1)] = fn

# ── Per-product IMG files grouped by prefix ─────────────────────────
print("[A] Per-product IMG-{CODE}.webp by prefix")
print("-" * 78)
by_prefix = defaultdict(list)
for code, fn in img_per_code.items():
    by_prefix[code.split("-")[0]].append(code)
for prefix in sorted(by_prefix):
    codes = sorted(by_prefix[prefix])
    print(f"  {prefix}  {len(codes):3d} files")
print()

# ── Family-style images by category ──────────────────────────────────
print("[B] Family-style images on disk (no IMG- prefix)")
print("-" * 78)
# Group family-style files by the type embedded in the name
def fam_key(fn: str) -> str:
    return fn.replace(".webp", "")

# Steel family
steel_fam = [fn for fn in family_style if any(k in fn for k in [
    "beam", "column", "hollow-section", "channel", "angle", "flat-bar",
    "round-bar", "square-bar", "hexagonal", "tube", "rebar", "tread",
    "mesh", "plate", "handrail", "tee-section", "expanded",
])]
print(f"Steel family images ({len(steel_fam)}):")
for fn in steel_fam:
    print(f"  {fn}")
print()

# Timber
timber_fam = [fn for fn in family_style if "timber" in fn or "batten" in fn]
print(f"Timber family images ({len(timber_fam)}):")
for fn in timber_fam:
    print(f"  {fn}")
print()

# Sheet / board
sheet_fam = [fn for fn in family_style if any(k in fn for k in [
    "osb", "plywood", "wbp", "chipboard", "shuttering",
])]
print(f"Sheet family images ({len(sheet_fam)}):")
for fn in sheet_fam:
    print(f"  {fn}")
print()

# PIR / cavity / insulation
ins_fam = [fn for fn in family_style if any(k in fn for k in [
    "pir", "cavity", "insulation",
])]
print(f"Insulation family images ({len(ins_fam)}):")
for fn in ins_fam:
    print(f"  {fn}")
print()

# Brick / aggregate / block / sand (from this turn + any new)
other_fam = [fn for fn in family_style if not any(k in fn for k in [
    "beam", "column", "hollow-section", "channel", "angle", "flat-bar",
    "round-bar", "square-bar", "hexagonal", "tube", "rebar", "tread",
    "mesh", "plate", "handrail", "tee-section", "expanded",
    "timber", "batten",
    "osb", "plywood", "wbp", "chipboard", "shuttering",
    "pir", "cavity", "insulation",
])]
print(f"Other family images ({len(other_fam)}):")
for fn in other_fam:
    print(f"  {fn}")
print()

# ── Build the comprehensive family map ──────────────────────────────
print("[C] COMPREHENSIVE FAMILY MAP - every product to one image")
print("-" * 78)
print()
print("Strategy: prefer per-product IMG file if it exists on disk;")
print("otherwise fall back to the type-family image; if neither exists,")
print("the product still needs a new family image generated.")
print()

data = json.loads(PLAN.read_text(encoding="utf-8"))
upserts = data.get("upserts", [])

# Build the product list
all_products = []
# 1. catalog-plan.json (80)
for u in upserts:
    code = u.get("code")
    if code:
        all_products.append({"code": code, "name": u.get("name"), "source": "catalog-plan"})
# 2. 155 steel (59)
for name in STEEL_FAMILY:
    # generate the code from name
    code = name.replace(" ", "-").replace("mm", "")
    all_products.append({"code": "STL-XXX", "name": name, "source": "155-migration"})
# 3. STL-001..013
for n in range(1, 14):
    all_products.append({"code": f"STL-{n:03d}", "name": f"Existing steel {n}", "source": "live-db"})

# Resolve image for each product
no_image = []
per_product_used = 0
family_used = 0
for p in all_products:
    code = p["code"]
    name = p["name"]
    src = p["source"]
    img = None
    if src == "catalog-plan" and code in PLAN_WIRED_TO_IMG and code in img_per_code:
        img = f"/products/{img_per_code[code]}"
        per_product_used += 1
    elif src == "155-migration" and name in STEEL_FAMILY:
        img = STEEL_FAMILY[name]
        family_used += 1
    elif src == "live-db" and code in STL_FAMILY:
        img = STL_FAMILY[code]
        if "IMG-" in img:
            per_product_used += 1
        else:
            family_used += 1
    p["image"] = img
    if not img:
        no_image.append(p)

print(f"Total products in scope:       {len(all_products)}")
print(f"  Per-product IMG file used:   {per_product_used}")
print(f"  Family image used:            {family_used}")
print(f"  No image:                     {len(no_image)}")
print()
if no_image:
    print("Products still without an image:")
    for p in no_image:
        print(f"  {p['code']:<10}  ({p['source']:<14})  {p['name']}")
    print()

# ── Consolidation opportunities ─────────────────────────────────────
print("[D] CONSOLIDATION OPPORTUNITIES")
print("-" * 78)
print()
print("Per-product IMG files on disk that COULD be consolidated to family")
print("images (i.e. the same type but different size/sku):")
print()
# For each prefix, look at per-product files vs family images
prefixes_with_per = sorted(set(c.split("-")[0] for c in img_per_code))
for prefix in prefixes_with_per:
    per_files = sorted(c for c in img_per_code if c.startswith(prefix + "-"))
    print(f"  {prefix}: {len(per_files)} per-product files")
    # Detect if there's already a family image for this prefix
    matching_family = []
    if prefix == "AGG":
        # aggregates — keep per-product (sand vs gravel looks different)
        print(f"    -> KEEP per-product (each aggregate is visually distinct)")
    elif prefix == "BLO":
        print(f"    -> KEEP per-product (dense vs aircrete looks different)")
    elif prefix == "BRI":
        print(f"    -> KEEP per-product (each brick colour/texture is distinct)")
    elif prefix == "CAV":
        print(f"    -> Could consolidate to 2-3 family images (full fill / partial / slab)")
    elif prefix == "FIX":
        print(f"    -> Could consolidate to 4-5 family images (wall ties / nails / screws / hangers / straps)")
    elif prefix == "PIR":
        print(f"    -> Already consolidated to pir-insulation-board.webp in 156")
    elif prefix == "PLA":
        print(f"    -> Could consolidate to 1-2 family images (standard vs specialised)")
    elif prefix == "ROO":
        print(f"    -> Could consolidate to 4-5 family images (tiles / felt / dpc / dpm / grp)")
    elif prefix == "SHE":
        print(f"    -> Mostly consolidated in 156, 1 per-product remaining")
    elif prefix == "STL":
        print(f"    -> Could consolidate by section type (UB/UC/SHS/PFC/angle/lintel)")
    elif prefix == "TIM":
        print(f"    -> Already consolidated in 156 (timber-c24-NxM.webp)")
    print()

# ── Recommended new family images to generate ───────────────────────
print("[E] RECOMMENDED NEW FAMILY IMAGES TO GENERATE")
print("-" * 78)
print()
print("To cover products in the live DB that aren't in catalog-plan.json")
print("and don't have an IMG-{code}.webp or a family-style image, generate:")
print()
print("  Cavity Insulation: 2 family images (full fill, partial fill)")
print("  Plasterboard:      1-2 family images (standard + specialised)")
print("  Roofing:           4-5 family images (tiles / felt / dpc / dpm / grp)")
print("  Fixings:           4-5 family images (ties / nails / screws / hangers / straps)")
print("  Sheet Materials:   already done (1 left, SHE-002)")
print()
print("Net new family images if we go this route: ~10-13 files")
print("Net new images if we keep all 89 existing per-product IMG files: 0")
print()
print("DECISION POINT: do we keep the 89 real per-product photos (better")
print("quality but 89 individual assets) or consolidate to ~13 family")
print("images (fewer assets but AI-generated stand-ins)?")
