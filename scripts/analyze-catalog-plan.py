"""Analyze the local catalog-plan.json to provide a sample-based SEO audit.

This is a fallback for when we can't reach the live database. It uses the
catalog-plan.json snapshot which contains 80 product rows with full SEO
fields. Not a substitute for the live audit, but it lets us spot patterns
and field-completeness issues without DB access.
"""

import json
import re
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "catalog-plan.json"
data = json.loads(PATH.read_text(encoding="utf-8"))
upserts = data.get("upserts", [])

print(f"Total entries in catalog-plan.json: {len(upserts)}")
print(f"Generated at: {data.get('generatedAt')}")
print()

# Tally field coverage
fields = [
    "id", "name", "code", "category", "unit", "description",
    "short_description", "seo_title", "seo_description",
    "key_features", "search_tags", "applications",
    "image_url", "length_mm", "width_mm", "height_mm",
    "thickness_mm", "unit_weight_kg", "pack_size", "wastage_pct",
    "calculator_type", "brand", "mpn", "default_price", "is_active",
]

coverage = {f: 0 for f in fields}
non_empty = {f: 0 for f in fields}
for u in upserts:
    for f in fields:
        if f in u and u[f] is not None:
            coverage[f] += 1
            v = u[f]
            if isinstance(v, str):
                if v.strip():
                    non_empty[f] += 1
            elif isinstance(v, list):
                if len(v) > 0:
                    non_empty[f] += 1
            elif isinstance(v, (int, float)):
                if v != 0 or f == "wastage_pct":
                    non_empty[f] += 1
            else:
                non_empty[f] += 1

n = len(upserts)
print(f"=== Field presence (n={n}) ===")
print(f"{'field':<22} {'present':>9}  {'non-empty':>10}  {'pct':>6}")
for f in fields:
    pct = non_empty[f] * 100 // max(1, n)
    print(f"{f:<22} {coverage[f]:>9}  {non_empty[f]:>10}  {pct:>5}%")
print()

# Check categories
categories = {}
for u in upserts:
    cat = u.get("category") or "∅ (no category)"
    categories.setdefault(cat, []).append(u)
print(f"=== Category breakdown ===")
for cat, rows in sorted(categories.items()):
    print(f"  {cat:<24}  count={len(rows)}")
print()

# Identify issues
print("=== Issues found in catalog-plan.json ===")
print()

# 1. Missing image_url
no_image = [u for u in upserts if not u.get("image_url")]
print(f"-- Missing image_url: {len(no_image)} of {n} ({100*len(no_image)//n}%) --")
for u in no_image[:5]:
    print(f"   {u.get('code','?')} — {u.get('name','<unnamed>')}")
if len(no_image) > 5:
    print(f"   ... and {len(no_image) - 5} more")
print()

# 2. Missing category
no_cat = [u for u in upserts if not u.get("category")]
print(f"-- Missing category: {len(no_cat)} of {n} --")
for u in no_cat[:5]:
    print(f"   {u.get('code','?')} — {u.get('name','<unnamed>')}")
print()

# 3. Missing code
no_code = [u for u in upserts if not u.get("code")]
print(f"-- Missing code: {len(no_code)} of {n} --")
for u in no_code[:5]:
    print(f"   {u.get('id','?')} — {u.get('name','<unnamed>')}")
print()

# 4. Missing seo_title
no_seo_title = [u for u in upserts if not u.get("seo_title")]
print(f"-- Missing seo_title: {len(no_seo_title)} of {n} --")
for u in no_seo_title[:5]:
    print(f"   {u.get('code','?')} — {u.get('name','<unnamed>')}")
print()

# 5. Missing seo_description
no_seo_desc = [u for u in upserts if not u.get("seo_description")]
print(f"-- Missing seo_description: {len(no_seo_desc)} of {n} --")
for u in no_seo_desc[:5]:
    print(f"   {u.get('code','?')} — {u.get('name','<unnamed>')}")
print()

# 6. Missing short_description
no_short = [u for u in upserts if not u.get("short_description")]
print(f"-- Missing short_description: {len(no_short)} of {n} --")
for u in no_short[:5]:
    print(f"   {u.get('code','?')} — {u.get('name','<unnamed>')}")
print()

# 7. Missing key_features
no_kf = [u for u in upserts if not u.get("key_features") or len(u.get("key_features", [])) == 0]
print(f"-- Missing key_features: {len(no_kf)} of {n} --")
for u in no_kf[:5]:
    print(f"   {u.get('code','?')} — {u.get('name','<unnamed>')}")
print()

# 8. Missing applications
no_app = [u for u in upserts if not u.get("applications") or len(u.get("applications", [])) == 0]
print(f"-- Missing applications: {len(no_app)} of {n} --")
for u in no_app[:5]:
    print(f"   {u.get('code','?')} — {u.get('name','<unnamed>')}")
print()

# 9. Missing search_tags
no_tags = [u for u in upserts if not u.get("search_tags") or len(u.get("search_tags", [])) == 0]
print(f"-- Missing search_tags: {len(no_tags)} of {n} --")
for u in no_tags[:5]:
    print(f"   {u.get('code','?')} — {u.get('name','<unnamed>')}")
print()

# 10. SEO title length
too_long_titles = [(u, len(u["seo_title"])) for u in upserts if u.get("seo_title") and len(u["seo_title"]) > 60]
print(f"-- seo_title over 60 chars: {len(too_long_titles)} --")
for u, n_chars in too_long_titles[:5]:
    print(f"   {u.get('code','?')} — {n_chars} chars: {u['seo_title']}")
print()

# 11. SEO description length
too_long_descs = [(u, len(u["seo_description"])) for u in upserts if u.get("seo_description") and len(u["seo_description"]) > 160]
print(f"-- seo_description over 160 chars: {len(too_long_descs)} --")
for u, n_chars in too_long_descs[:5]:
    print(f"   {u.get('code','?')} — {n_chars} chars")
print()

# 12. Boilerplate phrases
strip_phrases = [
    "supplied for trade and domestic building work",
    "structural steel or lintel component for openings and load-bearing frames",
    "weather-resistant product for pitched or flat roof details and rainwater goods",
    "dependable fixing for secure connections in masonry, timber or steelwork",
    "quality-assured material that mixes and finishes as expected on site",
    "strong masonry block for load-bearing walls, partitions and structural infill",
    "versatile panel for flooring, roofing, wall sheathing or formwork",
    "treated or graded timber for structural frames, roofing and finishing details",
    "improves thermal and acoustic performance inside cavity construction",
    "structural steel or lintel component for openings and load-bearing frames",
    "wallboard and finishing plaster for smooth internal surfaces",
    "consistent quality facing or engineering brick for a range of brickwork finishes",
    "rigid insulation board giving high thermal efficiency in a slim build-up",
]
print("-- Boilerplate phrase occurrences (should be 0 for good SEO) --")
for phrase in strip_phrases:
    count = sum(1 for u in upserts if u.get("description") and phrase.lower() in u["description"].lower())
    if count > 0:
        print(f"   '{phrase[:60]}': {count}")
print()

# 13. default_price = 0
no_price = [u for u in upserts if not u.get("default_price") or u.get("default_price") == 0]
print(f"-- default_price = 0 (shown as 'Price on application'): {len(no_price)} of {n} --")
