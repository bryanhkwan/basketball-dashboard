import json, re

# Check the 4 missing players in local data
missing = {'caden pierce', 'cal klesmit', 'evan ramsey', 'tameron ferguson'}

for pg in range(1, 7):
    try:
        html = open(f'tmp_on3_p{pg}.html', 'r', encoding='utf-8').read()
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
        nd = json.loads(m.group(1))
        players = nd['props']['pageProps']['playerData']['list']
        for p in players:
            name = (p.get('name', '') or '').lower()
            if name in missing:
                key = p.get('key')
                print(f'Page {pg}: name={p.get("name")}, key={key}, '
                      f'commitStatus.type={p.get("commitStatus",{}).get("type","")}')
    except:
        pass

# Also check for dupes by key across ALL pages
all_players = []
for pg in range(1, 7):
    try:
        html = open(f'tmp_on3_p{pg}.html', 'r', encoding='utf-8').read()
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
        nd = json.loads(m.group(1))
        players = nd['props']['pageProps']['playerData']['list']
        for p in players:
            all_players.append(p)
    except:
        pass

# Find duplicate keys
from collections import Counter
keys = [str(p.get('key','')) for p in all_players]
key_counts = Counter(keys)
dupes = {k: v for k, v in key_counts.items() if v > 1}
print(f'\nDuplicate keys ({len(dupes)}):')
for k, count in dupes.items():
    names = [p.get('name') for p in all_players if str(p.get('key','')) == k]
    print(f'  key={k}: appears {count}x, names={names}')

# Check empty keys
empty_keys = [p for p in all_players if not p.get('key')]
print(f'\nPlayers with empty/null key: {len(empty_keys)}')
for p in empty_keys:
    print(f'  name={p.get("name")}, key={p.get("key")}')
