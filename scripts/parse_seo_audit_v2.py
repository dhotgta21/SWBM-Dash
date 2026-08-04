import re

with open(r'C:\Users\sarpa\AppData\Local\Temp\local_search_audit.txt', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

# Split into page sections - each starts with a number and URL
pages = re.split(r'\n\s*(\d+)\s+(https://\S+)', text)

page_data = []
for i in range(1, len(pages), 3):
    if i+2 <= len(pages):
        num = pages[i]
        url = pages[i+1]
        body = pages[i+2]
        page_data.append((num, url, body))

print(f"Parsed pages: {len(page_data)}")

parsed = []
for num, url, body in page_data:
    lines = body.strip().split('\n')
    title = ''
    desc = ''
    metrics_line = ''
    word_count = None
    h1_count = None
    missing_alt = 0

    for line in lines:
        if line.startswith('Page Title:'):
            title = line.split('Page Title:')[1].strip()
        if line.startswith('Meta Description:'):
            desc = line.split('Meta Description:')[1].strip()
        if '/ 100' in line and ('H1' in line or 'H2' in line):
            metrics_line = line

    if metrics_line:
        ml = re.sub(r'\s+', ' ', metrics_line)
        
        # Word count: the last numeric token before the final Yes/No duplicate columns.
        # Walk backwards from the end of the line, skip No/Yes tokens, take first number.
        tokens = ml.strip().split()
        for token in reversed(tokens):
            if token in ('No', 'Yes'):
                continue
            clean = token.replace(',', '')
            if clean.isdigit():
                word_count = int(clean)
                break
        
        h1_match = re.search(r'H1\s*-\s*(\d+)', ml)
        if h1_match:
            h1_count = int(h1_match.group(1))
        
        # Missing alt tags = the number in parentheses after total alt tags
        # Format: H1 - X  total_alt (missing_alt) total_links (broken_links)
        alt_match = re.search(r'H1\s*-\s*\d+\s+(?:\d+\s+)?(\d+)\s*\((\d+)\)', ml)
        if alt_match:
            missing_alt = int(alt_match.group(2))

    parsed.append({
        'num': num,
        'url': url,
        'title': title,
        'desc': desc,
        'word_count': word_count,
        'h1_count': h1_count,
        'missing_alt': missing_alt,
        'metrics_line': metrics_line,
    })

# Categorize issues
sparse = [p for p in parsed if p['word_count'] and p['word_count'] < 500]
missing_h1 = [p for p in parsed if p['h1_count'] == 0]
missing_alt_pages = [p for p in parsed if p['missing_alt'] > 0]

# Find duplicates by title/desc content
titles = {}
descs = {}
for p in parsed:
    if p['title']:
        titles.setdefault(p['title'], []).append(p)
    if p['desc']:
        descs.setdefault(p['desc'], []).append(p)

dup_titles = {k: v for k, v in titles.items() if len(v) > 1}
dup_descs = {k: v for k, v in descs.items() if len(v) > 1}

print("\n" + "="*80)
print("DUPLICATE TITLES")
print("="*80)
for title, pages_list in dup_titles.items():
    print(f"\nTitle: {title}")
    for p in pages_list:
        print(f"  - {p['url']}")

print("\n" + "="*80)
print("DUPLICATE DESCRIPTIONS")
print("="*80)
for desc, pages_list in dup_descs.items():
    print(f"\nDesc: {desc[:120]}...")
    for p in pages_list:
        print(f"  - {p['url']}")

print("\n" + "="*80)
print("MISSING H1")
print("="*80)
for p in missing_h1:
    print(f"  - {p['url']} | {p['title'][:60]}")

print("\n" + "="*80)
print("MISSING ALT TAGS")
print("="*80)
for p in sorted(missing_alt_pages, key=lambda x: -x['missing_alt']):
    print(f"  - {p['missing_alt']:2d} missing | {p['url']} | {p['title'][:60]}")

print("\n" + "="*80)
print("SPARSE CONTENT (<500 WORDS)")
print("="*80)
for p in sorted(sparse, key=lambda x: x['word_count']):
    print(f"  - {p['word_count']:4d} words | {p['url']} | {p['title'][:60]}")

print("\n" + "="*80)
print("SUMMARY")
print("="*80)
print(f"Total pages parsed: {len(parsed)}")
print(f"Duplicate titles: {len(dup_titles)} groups, {sum(len(v) for v in dup_titles.values())} pages")
print(f"Duplicate descriptions: {len(dup_descs)} groups, {sum(len(v) for v in dup_descs.values())} pages")
print(f"Missing H1: {len(missing_h1)} pages")
print(f"Missing alt tags: {sum(p['missing_alt'] for p in missing_alt_pages)} total across {len(missing_alt_pages)} pages")
print(f"Sparse content (<500 words): {len(sparse)} pages")
