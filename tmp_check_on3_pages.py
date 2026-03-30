import re, json

# Check each page
for pg in range(1, 7):
    fname = f'tmp_on3_p{pg}.html'
    try:
        html = open(fname, 'r', encoding='utf-8').read()
    except:
        print(f'Page {pg}: file not found')
        continue
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
    if not m:
        print(f'Page {pg}: no __NEXT_DATA__')
        continue
    nd = json.loads(m.group(1))
    pp = nd['props']['pageProps']
    pd = pp.get('playerData', {})
    pag = pd.get('pagination', {})
    players = pd.get('list', [])
    # Get first and last player names
    first = players[0]['name'] if players else 'none'
    last = players[-1]['name'] if players else 'none'
    print(f'Page {pg}: {len(players)} players, pagination.currentPage={pag.get("currentPage")}, count={pag.get("count")}, first={first}, last={last}')
