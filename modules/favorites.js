// ============ FAVORITES MODULE ============
// Per-user player favorites — heart button in profile modal + dedicated Favorites page.
// Dependencies: auth.js (authGetToken, authIsGuest, DEV_BYPASS_AUTH), teambuilder.js (tbPlayerKey, tbPlayerLeague)

var FAVS_BASE = 'https://hidden-salad-773b.bryanhkwan.workers.dev/favorites';

// ── Dev mode localStorage fallback (mirrors notes.js pattern) ────────────────
function _devFavsStore() { try { return JSON.parse(localStorage.getItem('_devFavs') || '[]'); } catch (_) { return []; } }
function _devFavsWrite(arr) { localStorage.setItem('_devFavs', JSON.stringify(arr)); }
async function _favsFetchDev(path, opts) {
  const method = (opts?.method || 'GET').toUpperCase();
  let favs = _devFavsStore();
  if (method === 'GET') return { favorites: favs };
  if (method === 'POST') {
    const body = JSON.parse(opts.body || '{}');
    if (favs.find(function(f) { return f.player_key === body.player_key; }))
      return { error: 'already_favorited' };
    const fav = Object.assign({ id: String(Date.now()), created_at: new Date().toISOString() }, body);
    favs.unshift(fav);
    _devFavsWrite(favs);
    return fav;
  }
  if (method === 'DELETE') {
    const key = new URLSearchParams((path.split('?')[1] || '')).get('key') || '';
    _devFavsWrite(favs.filter(function(f) { return f.player_key !== key; }));
    return { success: true };
  }
  return null;
}

// ── State ─────────────────────────────────────────────────────────────────────
var favsState = { favorites: [], loaded: false };

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function favsFetch(path, opts) {
  path = path || '';
  opts = opts || {};
  if (typeof DEV_BYPASS_AUTH !== 'undefined' && DEV_BYPASS_AUTH) return _favsFetchDev(path, opts);
  const token = typeof authGetToken === 'function' ? authGetToken() : null;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(FAVS_BASE + path, Object.assign({ credentials: 'include', headers: headers }, opts));
  if (res.status === 401) return null;   // not logged in — silent
  if (!res.ok) {
    const err = await res.json().catch(function() { return {}; });
    throw new Error(err.message || err.error || ('Error ' + res.status));
  }
  return res.json().catch(function() { return null; });
}

// ── Load favorites from server ────────────────────────────────────────────────
async function favsLoad() {
  if (typeof authIsGuest === 'function' && authIsGuest()) return; // guests don't have favorites
  try {
    const data = await favsFetch();
    if (!data) return;  // 401 / not logged in
    favsState.favorites = Array.isArray(data) ? data : (data.favorites || []);
    favsState.loaded    = true;
    favsRenderPage();
    // Refresh modal heart button if a profile is currently open
    if (typeof _currentProfilePlayer !== 'undefined' && _currentProfilePlayer) {
      favsUpdateModalBtn(_currentProfilePlayer);
    }
    favsUpdateTableHearts();
  } catch (e) {
    console.warn('[Favorites] load error:', e);
  }
}

// ── Query state ───────────────────────────────────────────────────────────────
function favsIsHearted(playerKey) {
  return favsState.favorites.some(function(f) { return f.player_key === playerKey; });
}

function _favsKeyFor(r) {
  return typeof tbPlayerKey === 'function'
    ? tbPlayerKey(r)
    : ((r.Player || '') + '||' + (r.Team || ''));
}

function _favsLeagueFor(r) {
  return typeof tbPlayerLeague === 'function' ? tbPlayerLeague(r) : (r._league || 'MBB');
}

// ── Toggle heart (add / remove) ───────────────────────────────────────────────
async function favsHeart(r) {
  if (typeof authIsGuest === 'function' && authIsGuest()) {
    alert('Please log in to save favorites.');
    return;
  }
  const key = _favsKeyFor(r);
  if (favsIsHearted(key)) {
    // ── Remove ──
    try {
      await favsFetch('?' + new URLSearchParams({ key: key }).toString(), { method: 'DELETE' });
      favsState.favorites = favsState.favorites.filter(function(f) { return f.player_key !== key; });
      favsUpdateModalBtn(r);
      favsRenderPage();
      favsUpdateTableHearts();
    } catch (e) { console.warn('[Favorites] unheart error:', e); }
  } else {
    // ── Add ──
    try {
      const fav = await favsFetch('', {
        method: 'POST',
        body: JSON.stringify({
          player_key:  key,
          player_name: r.Player  || '',
          team:        r.Team    || '',
          league:      _favsLeagueFor(r),
          pos:         r.Pos     || r.Position || '',
        }),
      });
      if (fav && !fav.error) {
        favsState.favorites.unshift({
          id:          String(fav.id || Date.now()),
          player_key:  key,
          player_name: r.Player  || '',
          team:        r.Team    || '',
          league:      _favsLeagueFor(r),
          pos:         r.Pos     || r.Position || '',
          created_at:  fav.created_at || new Date().toISOString(),
        });
        favsUpdateModalBtn(r);
        favsRenderPage();
        favsUpdateTableHearts();
      }
    } catch (e) { console.warn('[Favorites] heart error:', e); }
  }
}

// ── Update heart button in player profile modal ────────────────────────────────
function favsUpdateModalBtn(r) {
  var btn = document.getElementById('mFavBtn');
  if (!btn || !r) return;
  var key     = _favsKeyFor(r);
  var hearted = favsIsHearted(key);
  btn.textContent   = hearted ? '❤️ Favorited' : '🤍 Favorite';
  btn.style.color       = hearted ? '#f87171' : '';
  btn.style.borderColor = hearted ? '#f87171' : '';
  btn.onclick = function() { favsHeart(r); };
}

// ── Update inline heart buttons in the player table ───────────────────────────
function favsUpdateTableHearts() {
  document.querySelectorAll('[data-favkey]').forEach(function(btn) {
    var key = btn.getAttribute('data-favkey');
    var hearted = favsIsHearted(key);
    btn.textContent = hearted ? '❤️' : '🤍';
    btn.title       = hearted ? 'Remove favorite' : 'Add to favorites';
  });
}

// ── Helper: find full player row from tbAllComputed by player_key ─────────────
function _favsGetRow(fav) {
  if (typeof tbAllComputed === 'undefined' || !tbAllComputed) return null;
  var pools = Object.values(tbAllComputed);
  for (var i = 0; i < pools.length; i++) {
    var found = pools[i].find(function(r) { return _favsKeyFor(r) === fav.player_key; });
    if (found) return found;
  }
  return null;
}

// ── HTML escape ───────────────────────────────────────────────────────────────
function _favsEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Render the full Favorites page ───────────────────────────────────────────
function favsRenderPage() {
  var grid  = document.getElementById('favsGrid');
  var empty = document.getElementById('favsEmpty');
  if (!grid) return;

  var search   = ((document.getElementById('favsSearch')       || {}).value || '').toLowerCase();
  var lgFilter = (document.getElementById('favsLeagueFilter') || {}).value || '';

  var favs = favsState.favorites.slice();
  if (search)   favs = favs.filter(function(f) { return (f.player_name + ' ' + f.team).toLowerCase().indexOf(search) !== -1; });
  if (lgFilter) favs = favs.filter(function(f) { return f.league === lgFilter; });

  if (!favs.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = '';
    document.getElementById('favsCount') && (document.getElementById('favsCount').textContent = '0 players');
    return;
  }
  if (empty) empty.style.display = 'none';
  var countEl = document.getElementById('favsCount');
  if (countEl) countEl.textContent = favs.length + ' player' + (favs.length !== 1 ? 's' : '');

  grid.innerHTML = favs.map(function(fav) {
    var r      = _favsGetRow(fav);
    var ppg    = r && typeof safeNum !== 'undefined' ? safeNum(r.PPG).toFixed(1)     : '—';
    var apg    = r && typeof safeNum !== 'undefined' ? safeNum(r.APG).toFixed(1)     : '—';
    var rpg    = r && typeof safeNum !== 'undefined' ? safeNum(r.RPG).toFixed(1)     : '—';
    var score  = r && typeof safeNum !== 'undefined' ? safeNum(r._score).toFixed(0)  : '—';
    var leagueBadge = fav.league === 'WBB'
      ? '<span class="favsLeagueBadge favsLeagueBadge--wbb">WBB</span>'
      : '<span class="favsLeagueBadge favsLeagueBadge--mbb">MBB</span>';
    var hasRow = !!r;
    return [
      '<div class="favCard" tabindex="0">',
        '<div class="favCardTop">',
          '<div class="favCardName">' + _favsEsc(fav.player_name) + '</div>',
          '<button class="favHeart favHeart--rm" title="Remove favorite" data-rm-key="' + _favsEsc(fav.player_key) + '">❤️</button>',
        '</div>',
        '<div class="favCardMeta">' + _favsEsc(fav.team) + ' &nbsp;·&nbsp; ' + _favsEsc(fav.pos || '—') + ' &nbsp;·&nbsp; ' + leagueBadge + '</div>',
        '<div class="favCardStats">',
          '<div class="favStat"><span class="favStatLbl">PPG</span><span class="favStatVal">' + ppg + '</span></div>',
          '<div class="favStat"><span class="favStatLbl">APG</span><span class="favStatVal">' + apg + '</span></div>',
          '<div class="favStat"><span class="favStatLbl">RPG</span><span class="favStatVal">' + rpg + '</span></div>',
          '<div class="favStat"><span class="favStatLbl">Score</span><span class="favStatVal">' + score + '</span></div>',
        '</div>',
        hasRow ? '<button class="favCardBtn secondary" data-profile-key="' + _favsEsc(fav.player_key) + '">View Profile →</button>' : '',
      '</div>',
    ].join('');
  }).join('');

  // Wire remove buttons
  grid.querySelectorAll('.favHeart--rm').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var key = btn.getAttribute('data-rm-key');
      var fav = favsState.favorites.find(function(f) { return f.player_key === key; });
      if (!fav) return;
      var r = _favsGetRow(fav);
      if (r) {
        favsHeart(r);  // toggle removes it since it's already hearted
      } else {
        // No row available — delete directly
        favsFetch('?' + new URLSearchParams({ key: key }).toString(), { method: 'DELETE' }).then(function() {
          favsState.favorites = favsState.favorites.filter(function(f) { return f.player_key !== key; });
          favsRenderPage();
        }).catch(function(e) { console.warn('[Favorites] remove error:', e); });
      }
    };
  });

  // Wire View Profile buttons
  grid.querySelectorAll('.favCardBtn').forEach(function(btn) {
    btn.onclick = function() {
      var key = btn.getAttribute('data-profile-key');
      var fav = favsState.favorites.find(function(f) { return f.player_key === key; });
      if (!fav) return;
      var r = _favsGetRow(fav);
      if (r && typeof openProfile === 'function') openProfile(r);
    };
  });
}

// ── Init (search / filter event listeners) ───────────────────────────────────
function initFavsPage() {
  var searchEl = document.getElementById('favsSearch');
  var lgEl     = document.getElementById('favsLeagueFilter');
  if (searchEl) searchEl.addEventListener('input',  favsRenderPage);
  if (lgEl)     lgEl.addEventListener    ('change', favsRenderPage);
  // Render anything already in state (handles the case where favsLoad() resolved
  // before initFavsPage ran, or a race where the initial render was lost).
  favsRenderPage();
}

window.FavoritesManager = { favsLoad, favsHeart, favsIsHearted, favsUpdateModalBtn, favsRenderPage, initFavsPage };
