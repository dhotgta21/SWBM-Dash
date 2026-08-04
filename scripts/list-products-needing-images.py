"""Dump every product that needs work, grouped by category, for the operator
to action. Reads from catalog-plan.json (the local snapshot of 80 products).

This is a fallback for when we can't reach the live DB. The actual number
of products missing images in the live database may be different — run
`node scripts/audit-products.mjs` after the migration is applied to get
the live numbers.
"""

import json
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "catalog-plan.json"
data = json.loads(PATH.read_text(encoding="utf-8"))
upserts = data.get("upserts", [])

# All 80 products in catalog-plan.json
print(f"=== All 80 products from catalog-plan.json, grouped by category ===")
print()

by_cat = {}
for u in upserts:
    cat = u.get("category") or "∅ (no category)"
    by_cat.setdefault(cat, []).append(u)

for cat in sorted(by_cat.keys()):
    rows = by_cat[cat]
    print(f"## {cat} ({len(rows)})")
    for u in rows:
        code = u.get("code", "?")
        name = u.get("name", "<unnamed>")
        has_image = bool(u.get("image_url"))
        has_seo = bool(u.get("seo_title")) and bool(u.get("seo_description"))
        seo = "OKSEO" if has_seo else "NOSEO"
        img = "OKimg" if has_image else "NOimg"
        print(f"   {code:<10}  {img} {seo}  {name}")
    print()

# All products missing images
print()
print(f"=== Products needing an image ({len(upserts)} of {len(upserts)}) ===")
print()
for u in upserts:
    code = u.get("code", "?")
    name = u.get("name", "<unnamed>")
    cat = u.get("category", "?")
    print(f"  {code:<10}  {cat:<24}  {name}")
