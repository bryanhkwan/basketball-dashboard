import re, json

html = open('tmp_on3_page1.html', 'r', encoding='utf-8').read()
m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.S)
if not m:
    print("No __NEXT_DATA__ found")
    exit()
nd = json.loads(m.group(1))
pp = nd['props']['pageProps']
pd = pp.get('playerData', {})
pag = pd.get('pagination', {})
print('pagination:', json.dumps(pag, indent=2))
print('players on page1:', len(pd.get('list', [])))
bp = pp.get('pageParams', {}).get('baseParams', {})
print('baseParams:', json.dumps(bp))
# Check if there's an API endpoint in the build data
rp = nd.get('runtimeConfig', nd.get('publicRuntimeConfig', {}))
print('runtimeConfig keys:', list(rp.keys()) if rp else 'none')
# Check queries or other data
queries = nd.get('props', {}).get('pageProps', {}).get('__N_SSP', None)
print('__N_SSP:', queries)
