"""Quick structural validation of the generated steel-sections migration.

This validates the SQL file at the source-of-truth level: row count,
unique codes, expected product names, SEO field length caps, and the
absence of the boilerplate phrases that product-content.ts strips.
"""

import re
from pathlib import Path

PATH = Path(__file__).resolve().parent.parent / "supabase" / "migrations" / "155_steel_sections_ub_uc_shs_flat.sql"

EXPECTED = [
    # 21 UBs
    "UB 127x76x13kg", "UB 152x89x16kg", "UB 152x89x19kg", "UB 178x102x19kg",
    "UB 178x102x22kg", "UB 178x102x25kg", "UB 203x102x23kg", "UB 203x133x25kg",
    "UB 203x133x30kg", "UB 203x133x37kg", "UB 254x102x22kg", "UB 254x102x25kg",
    "UB 254x146x31kg", "UB 254x146x37kg", "UB 254x146x43kg", "UB 305x102x25kg",
    "UB 305x102x28kg", "UB 305x165x40kg", "UB 305x165x46kg", "UB 305x165x54kg",
    "UB 305x165x60kg",
    # 25 UCs
    "UC 152x152x23kg", "UC 152x152x30kg", "UC 152x152x37kg", "UC 152x152x44kg",
    "UC 152x152x51kg", "UC 152x152x58kg", "UC 152x152x67kg", "UC 203x203x46kg",
    "UC 203x203x52kg", "UC 203x203x60kg", "UC 203x203x71kg", "UC 203x203x86kg",
    "UC 203x203x100kg", "UC 203x203x113kg", "UC 254x254x73kg", "UC 254x254x89kg",
    "UC 254x254x107kg", "UC 254x254x132kg", "UC 254x254x167kg", "UC 305x305x97kg",
    "UC 305x305x118kg", "UC 305x305x137kg", "UC 305x305x158kg", "UC 305x305x198kg",
    "UC 305x305x240kg",
    # 4 SHS
    "SHS 100x100x4mm", "SHS 100x100x5mm", "SHS 100x100x10mm", "SHS 100x100x8mm",
    # 9 Flats
    "Flat 100x20", "Flat 200x20", "Flat 300x20", "Flat 300x10", "Flat 300x12",
    "Flat 400x20", "Flat 350x15", "Flat 350x12", "Flat 350x20",
]

content = PATH.read_text(encoding="utf-8")

# Row count + codes
codes = re.findall(r"\('(STL-\d{3})'", content)
print(f"Total rows: {len(codes)}")
print(f"Codes: STL-{codes[0]} to STL-{codes[-1]}")
print(f"Unique codes: {len(set(codes))}")

# Column count per row (the 8 comma-separated slots between ( and the
# matching ), excluding commas inside array literals).
match = re.search(r"VALUES\s*\((.+?)\),\s*\('STL-014'", content, re.DOTALL)
if match:
    sample = match.group(1)
    cols = sample.count(",") + 1
    print(f"Columns per row: {cols}")

# Expected names check
missing = [n for n in EXPECTED if n not in content]
print(f"Missing expected names: {missing or 'none'}")

# Direct SEO field length check via field-by-field walk.
# The row shape is fixed (see build_row in the generator), so we can
# extract the 8th (seo_title), 9th (seo_description) and 10th
# (short_description) string literal from each VALUES row.

def extract_field(row_str, field_index):
    """Pull the Nth SQL string literal out of a row tuple.

    Walks the row left-to-right, tracking whether we are inside a string
    literal. SQL string literals are bounded by single quotes; embedded
    quotes are escaped as ''.  This handles the array literals too because
    they always begin with ARRAY[ and contain their own quote-balancing.
    """
    in_string = False
    current = []
    out = []
    i = 0
    while i < len(row_str):
        ch = row_str[i]
        if in_string:
            if ch == "'" and i + 1 < len(row_str) and row_str[i + 1] == "'":
                current.append("'")
                i += 2
                continue
            if ch == "'":
                in_string = False
                out.append("".join(current))
                current = []
                i += 1
                continue
            current.append(ch)
            i += 1
            continue
        if ch == "'":
            in_string = True
            i += 1
            continue
        i += 1
    return out[field_index] if field_index < len(out) else ""


# Slice the VALUES block and split into individual row tuples.
values_match = re.search(r"VALUES\s*(.+?)\s*ON CONFLICT", content, re.DOTALL)
assert values_match, "Could not find VALUES block"
values_block = values_match.group(1)

# Split rows on "),\n  ('" boundary.
rows = re.findall(r"\((.*?)\)(?=,\s*\n\s*\(|;|\s*$)", values_block, re.DOTALL)
# Filter out the empty match from the last comma.
rows = [r for r in rows if r.strip()]
print(f"Parsed row tuples: {len(rows)}")

# Field indexes inside build_row (1-based in SQL, 0-based here):
# 0: code
# 1: name
# 2: description
# 3: unit
# 4: category
# 5: default_price
# 6: image_url
# 7: is_active
# 8: seo_title
# 9: seo_description
# 10: short_description
# 11: key_features (array)
# 12: search_tags (array)
# 13: brand (NULL string)
# 14: mpn (NULL string)
# 15: applications (array)
# 16-30: numeric / NULLs

# String-literal field index, 0-based, by walking the row:
# 0 code, 1 name, 2 description, 3 unit, 4 category, 5 image_url,
# 6 seo_title, 7 seo_description, 8 short_description,
# 9 key_features, 10 search_tags, 11 applications, 12 materials.
# (brand and mpn are emitted as the literal `NULL` and so don't open
#  a string literal — they aren't counted here.)
T_TITLE, T_DESC, T_SHORT = 6, 7, 8

titles, descs, shorts = [], [], []
for r in rows:
    titles.append(extract_field(r, T_TITLE))
    descs.append(extract_field(r, T_DESC))
    shorts.append(extract_field(r, T_SHORT))

# Note: the string-extraction above picks up the FIRST 11 strings in the
# row. Because brand and mpn are rendered as the literal "NULL" in
# build_row (sql_string(None) -> "NULL"), they are NOT quoted and so the
# index for short_description etc. matches the build_row output.
print(f"\nSEO titles: {len(titles)}")
long_titles = [(t, len(t)) for t in titles if len(t) > 60]
print(f"Titles over 60 chars: {len(long_titles)}")
for t, n in long_titles:
    print(f"  {n:3d}  {t}")

print(f"\nSEO descriptions: {len(descs)}")
long_descs = [(d, len(d)) for d in descs if len(d) > 160]
print(f"Descriptions over 160 chars: {len(long_descs)}")
for d, n in long_descs:
    print(f"  {n:3d}  {d[:80]}...")

print(f"\nShort descriptions: {len(shorts)}")
for s in shorts[:3]:
    print(f"  {len(s):3d}  {s[:80]}")

# Check for boilerplate phrases the SEO content-cleaner strips.
strip_phrases = [
    "supplied for trade and domestic building work",
    "structural steel or lintel component for openings and load-bearing frames",
]
for phrase in strip_phrases:
    occurrences = content.lower().count(phrase.lower())
    print(f"\nBoilerplate phrase '{phrase}': {occurrences} occurrences (should be 0)")

# Family image URL check
families = {
    "UB": "/products/universal-beam-mild-steel.webp",
    "UC": "/products/universal-column-mild-steel.webp",
    "SHS": "/products/square-hollow-section-mild-steel.webp",
    "Flat": "/products/flat-bar-mild-steel.webp",
}
for prefix, img in families.items():
    count = content.count(img)
    print(f"Family image {img} referenced: {count} times")
