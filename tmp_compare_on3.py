import json, re

# Get ALL On3 items from the API across pages
all_api = []
for pg in range(1, 10):
    try:
        d = json.load(open(f'on3_p{pg}.json'))
        items = d.get('items', [])
        if not items:
            break
        all_api.extend(items)
    except:
        break

print(f'Total API items across pages: {len(all_api)}')

# Get all local On3 items from __NEXT_DATA__
all_local = []
for pg in range(1, 7):
    try:
        html = open(f'tmp_on3_p{pg}.html', 'r', encoding='utf-8').read()
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
        nd = json.loads(m.group(1))
        players = nd['props']['pageProps']['playerData']['list']
        all_local.extend(players)
    except Exception as e:
        print(f'  Page {pg} local error: {e}')

print(f'Total local items across pages: {len(all_local)}')

# Deduplicate local by key
local_keys = set()
local_dedup = []
for p in all_local:
    k = str(p.get('key', '')) or p.get('name', '').lower()
    if k not in local_keys:
        local_keys.add(k)
        local_dedup.append(p)
print(f'Local items after dedup: {len(local_dedup)}')

# Build name sets
api_names = set(it.get('playerName', '').lower().strip() for it in all_api)
local_names = set(p.get('name', '').lower().strip() for p in local_dedup)

missing_from_api = local_names - api_names
extra_in_api = api_names - local_names

print(f'\nPlayers in local but NOT in API ({len(missing_from_api)}):')
for n in sorted(missing_from_api):
    print(f'  - {n}')

print(f'\nPlayers in API but NOT in local ({len(extra_in_api)}):')
for n in sorted(extra_in_api):
    print(f'  - {n}')
