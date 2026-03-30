import re, json

html = open('tmp_on3_page1.html', 'r', encoding='utf-8').read()

# Find any API URLs in the page
api_refs = re.findall(r'(https?://[^\s"\'<>]*(?:api|graphql)[^\s"\'<>]*)', html)
print(f'API URLs found: {len(api_refs)}')
for u in set(api_refs):
    print(f'  {u}')

# Check for buildId (Next.js data route)
m = re.search(r'"buildId"\s*:\s*"([^"]+)"', html)
if m:
    print(f'\nbuildId: {m.group(1)}')
    # Next.js data route would be /_next/data/{buildId}/transfer-portal/wire/basketball.json?page=2
    print(f'Data route: /_next/data/{m.group(1)}/transfer-portal/wire/basketball.json?page=2')

# Check for fetch/loadMore patterns in script bundles
load_more = re.findall(r'(load\s*more|loadMore|fetchMore|nextPage)', html[:500000], re.I)
print(f'\nLoad more references: {len(load_more)}')
