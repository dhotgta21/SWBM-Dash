"""Map every catalog-plan product to an existing IMG-{code}.webp file (if one
exists) and identify which products still need new images generated.
"""

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PLAN = REPO / "catalog-plan.json"
IMG_DIR = REPO / "public" / "products"

data = json.loads(PLAN.read_text(encoding="utf-8"))
upserts = data.get("upserts", [])

existing_imgs = {p.name for p in IMG_DIR.glob("*.webp")}

wired = []
need_new = []
already_have = []

for u in upserts:
    code = u.get("code")
    if not code:
        continue
    candidate = f"IMG-{code}.webp"
    if candidate in existing_imgs:
        wired.append((code, u.get("name"), candidate))
    else:
        need_new.append((code, u.get("name"), u.get("category")))

print(f"Products with existing IMG file (just need to wire up): {len(wired)}")
for code, name, fn in wired:
    print(f"  {code:<8} -> /products/{fn}  {name}")
print()
print(f"Products that need a new image generated: {len(need_new)}")
for code, name, cat in need_new:
    print(f"  {code:<8} {cat:<22}  {name}")
print()

# Group need_new by category
by_cat = {}
for code, name, cat in need_new:
    by_cat.setdefault(cat, []).append((code, name))
print(f"New-image count by category:")
for cat in sorted(by_cat):
    rows = by_cat[cat]
    print(f"  {cat:<22}  {len(rows)} products  e.g. {rows[0][0]} ({rows[0][1]})")
