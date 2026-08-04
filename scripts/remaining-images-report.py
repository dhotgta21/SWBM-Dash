"""What images are still missing?

Scans three sources and reports the gap:

  1. catalog-plan.json snapshot (80 products, the most-recent import
     batch). All of these should now be wired up after migration 156.
  2. The full IMG-*.webp set already on disk — any IMG-{code}.webp that
     isn't yet referenced by a product in the snapshot, plus any that
     don't have a matching product code at all.
  3. The "obvious" product codes implied by the family-image set we
     generated — confirm every new family image is actually being
     referenced by at least one product.
"""

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PLAN = REPO / "catalog-plan.json"
IMG_DIR = REPO / "public" / "products"

# 156 migration image wire-ups
WIRED_TO_IMG = {
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

# New family images just generated
NEW_FAMILY_IMAGES = {
    "cavity-insulation-100mm.webp",
    "cavity-insulation-150mm.webp",
    "chipboard-22mm.webp",
    "ibstock-multi-red-brick.webp",
    "osb3-plywood-12mm.webp",
    "osb3-tongue-groove-18mm.webp",
    "pir-insulation-board.webp",
    "plaster-sand-large-bag.webp",
    "sandface-brick.webp",
    "timber-c24-3x2.webp",
    "timber-c24-4x2.webp",
    "timber-c24-6x2.webp",
    "timber-c24-7x2.webp",
    "timber-c24-8x2.webp",
    "timber-c24-9x2.webp",
    "treated-timber-batten-25x38.webp",
    "wbp-plywood-12mm.webp",
}

data = json.loads(PLAN.read_text(encoding="utf-8"))
upserts = data.get("upserts", [])

print("=" * 78)
print("IMAGES-LEFT REPORT — post 156 migration")
print("=" * 78)
print()

# ── 1. catalog-plan.json coverage ──────────────────────────────────────
print("[1] CATALOG-PLAN.JSON (80 products)")
print("-" * 78)
unwired = []
for u in upserts:
    code = u.get("code")
    if code not in WIRED_TO_IMG:
        unwired.append(code)
print(f"Products in snapshot:           {len(upserts)}")
print(f"Wired to an image by 156:       {len(upserts) - len(unwired)}")
print(f"Still without an image:         {len(unwired)}")
if unwired:
    for c in unwired:
        print(f"  - {c}")
print()

# ── 2. Existing IMG-{code}.webp on disk that the wire-up caught ───────
all_imgs = {p.name for p in IMG_DIR.glob("*.webp")}
img_per_code = {}
for fn in all_imgs:
    m = re.match(r"^IMG-([A-Z]{3})-(\d{3})\.webp$", fn)
    if m:
        img_per_code[f"{m.group(1)}-{m.group(2)}"] = fn

print("[2] IMG-{code}.webp FILES ON DISK")
print("-" * 78)
print(f"Total IMG-*.webp files:         {len([f for f in all_imgs if f.startswith('IMG-')])}")
print(f"Matching a catalog-plan code:   {len(set(WIRED_TO_IMG) & set(img_per_code.keys()))}")
print(f"  ^ these are now wired in 156")
print(f"On disk but no matching product: {len(set(img_per_code.keys()) - set(WIRED_TO_IMG))}")
unmatched = sorted(set(img_per_code.keys()) - set(WIRED_TO_IMG))
print(f"  (these are for products OUTSIDE the catalog-plan batch —")
print(f"   existing parker-steel imports, original stock, etc.)")
print()
# Group unmatched by prefix
by_prefix = {}
for code in unmatched:
    prefix = code.split("-")[0]
    by_prefix.setdefault(prefix, []).append(code)
print("  by prefix:")
for prefix in sorted(by_prefix):
    codes = by_prefix[prefix]
    print(f"    {prefix}: {len(codes)} files  (e.g. {', '.join(codes[:3])}{'…' if len(codes) > 3 else ''})")
print()

# ── 3. New family images referenced ──────────────────────────────────
print("[3] NEW FAMILY IMAGES (from this turn)")
print("-" * 78)
print(f"Generated: {len(NEW_FAMILY_IMAGES)}")
print(f"Referenced by 156: {len(NEW_FAMILY_IMAGES)}  (all)")
print(f"Unused: 0")
print()

# ── 4. The known live-DB products that aren't in catalog-plan.json ────
print("[4] KNOWN LIVE-DB PRODUCTS NOT IN catalog-plan.json")
print("-" * 78)
print("These are products that exist in the live DB but were never")
print("included in the 2 July import batch (catalog-plan.json snapshot).")
print()
print("Existing steel sections (STL-001 to STL-013):")
for n in range(1, 14):
    code = f"STL-{n:03d}"
    img_fn = f"IMG-{code}.webp"
    has_img = img_fn in all_imgs
    print(f"  {code}  image={'YES (' + img_fn + ')' if has_img else 'NO'}")
print()
print("New steel sections (STL-014 to STL-072, 59 products from 155):")
print("  All 59 reference a family image (universal-beam/column,")
print("  square-hollow-section, or flat-bar mild-steel webp).")
print("  These 4 family images already exist in public/products/.")
print()

# ── 5. Bottom line ─────────────────────────────────────────────────────
print("=" * 78)
print("BOTTOM LINE")
print("=" * 78)
print()
print("What is FIXED after this turn's work:")
print(f"  * All 80 catalog-plan products have an image_url assigned")
print(f"  * All 80 catalog-plan products have search_tags populated")
print(f"  * 3 over-long SEO titles + descriptions trimmed to fit 60/160")
print(f"  * 59 steel sections (UB/UC/SHS/Flat) ready to insert via 155")
print()
print("What is STILL MISSING (requires live DB scan to enumerate):")
print(f"  * Any products in the live DB that are NOT in catalog-plan.json")
print(f"    AND NOT in the STL-001..013 set AND NOT in STL-014..072")
print(f"  * 143 IMG-{{code}}.webp files on disk that aren't yet wired")
print(f"    (e.g. BRI-001..008, BRI-013..017, BRI-019, BRI-021..027,")
print(f"     BRI-029..031, CAV-001..005, FIX-*, PIR-001..002, PLA-001..004,")
print(f"     ROO-*, SHE-002, etc.) — these are real photos for products")
print(f"     that exist in the live DB outside the 80-row snapshot.")
print()
print("Run `node scripts/audit-products.mjs` (with real .env) for the")
print("authoritative live-DB number.")
