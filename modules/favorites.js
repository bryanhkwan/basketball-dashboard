// ============ FAVORITES MODULE ============
// Per-user favorites with folders. Heart button in profile modal + dedicated Favorites page.
// Dependencies: auth.js, teambuilder.js (tbPlayerKey, tbPlayerLeague)

var FAVS_BASE = 'https://hidden-salad-773b.bryanhkwan.workers.dev/favorites';

// ── Dev mode localStorage fallback (mirrors notes.js pattern) ────────────────
function _devFavsStore() { try { return JSON.parse(localStorage.getItem('_devFavs') || '[]'); } catch (_) { return []; } }
function _devFavsWrite(arr) { localStorage.setItem('_devFavs', JSON.stringify(arr)); }
async function _favsFetchDev(path, opts) {
  var method = ((opts && opts.method) || 'GET').toUpperCase();
  var favs = _devFavsStore();
  if (method === 'GET') return { favorites: favs };
  if (method === 'POST') {
    var body = JSON.parse((opts && opts.body) || '{}');
    if (favs.find(function(f) { return f.player_key === body.player_key; }))
      return { error: 'already_favorited' };
    var fav = Object.assign({ id: String(Date.now()), created_at: new Date().toISOString(), folder: '' }, body);
    favs.unshift(fav);
    _devFavsWrite(favs);
    return fav;
  }
  if (method === 'PATCH') {
    var pb = JSON.parse((opts && opts.body) || '{}');
    favs = favs.map(function(f) { return f.player_key === pb.player_key ? Object.assign({}, f, { folder: pb.folder || '' }) : f; });
    _devFavsWrite(favs); return { success: true };
  }
  if (method === 'DELETE') {
    var key = new URLSearchParams((path.split('?')[1] || '')).get('key') || '';
    _devFavsWrite(favs.filter(function(f) { return f.player_key !== key; }));
    return { success: true };
  }
  return null;
}

// ── State ─────────────────────────────────────────────────────────────────────
var favsState = { favorites: [], loaded: false, activeFolder: '' };

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
  if (typeof authIsGuest === 'function' && authIsGuest()) return;
  try {
    const data = await favsFetch();
    if (!data) return;
    favsState.favorites = Array.isArray(data) ? data : (data.favorites || []);
    favsState.loaded    = true;
    favsRenderFolderBar();
    favsRenderPage();
    if (typeof _currentProfilePlayer !== 'undefined' && _currentProfilePlayer)
      favsUpdateModalBtn(_currentProfilePlayer);
    favsUpdateTableHearts();
  } catch (e) {
    console.warn('[Favorites] load error:', e);
  }
}

// ── Folders ───────────────────────────────────────────────────────────────────
function favsGetFolders() {
  var seen = {}, result = [];
  favsState.favorites.forEach(function(f) {
    if (f.folder && !seen[f.folder]) { seen[f.folder] = true; result.push(f.folder); }
  });
  return result.sort(function(a, b) { return a.localeCompare(b); });
}

async function favsSetFolder(playerKey, folderName) {
  folderName = (folderName || '').trim();
  try {
    await favsFetch('', { method: 'PATCH', body: JSON.stringify({ player_key: playerKey, folder: folderName }) });
    var fav = favsState.favorites.find(function(f) { return f.player_key === playerKey; });
    if (fav) fav.folder = folderName;
    favsRenderFolderBar();
    favsRenderPage();
  } catch (e) { console.warn('[Favorites] setFolder error:', e); }
}

function favsRenderFolderBar() {
  var bar = document.getElementById('favsFolderBar');
  if (!bar) return;
  var folders  = favsGetFolders();
  var active   = favsState.activeFolder;
  var allCount = favsState.favorites.length;

  var html = '<button class="favsFolderTab' + (active === '' ? ' active' : '') + '" data-folder="">All <span class="favsFolderCount">' + allCount + '</span></button>';
  folders.forEach(function(fname) {
    var cnt = favsState.favorites.filter(function(f) { return f.folder === fname; }).length;
    html += '<button class="favsFolderTab' + (active === fname ? ' active' : '') + '" data-folder="' + _favsEsc(fname) + '">' +
      '&#128193; ' + _favsEsc(fname) + ' <span class="favsFolderCount">' + cnt + '</span>' +
      '<span class="favsFolderTabDel" data-del-folder="' + _favsEsc(fname) + '" title="Delete folder">&times;</span>' +
      '</button>';
  });
  // Show newly created folder as a tab even before any players are assigned to it
  if (active && folders.indexOf(active) === -1) {
    html += '<button class="favsFolderTab active" data-folder="' + _favsEsc(active) + '">' +
      '&#128193; ' + _favsEsc(active) + ' <span class="favsFolderCount">0</span>' +
      '<span class="favsFolderTabDel" data-del-folder="' + _favsEsc(active) + '" title="Delete folder">&times;</span>' +
      '</button>';
  }
  html += '<button class="favsFolderTabNew" id="favsFolderNewBtn">&#xff0b; New Folder</button>';

  if (active) {
    var sendCnt = favsState.favorites.filter(function(f) { return f.folder === active; }).length;
    if (sendCnt > 0)
      html += '<button class="favsFolderSendBtn" id="favsFolderSendBtn">&#128228; Send to Collaborate (' + sendCnt + ')</button>';
  }

  bar.innerHTML = html;

  bar.querySelectorAll('.favsFolderTab').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      if (e.target.classList.contains('favsFolderTabDel')) return;
      favsState.activeFolder = btn.getAttribute('data-folder');
      favsRenderFolderBar(); favsRenderPage();
    });
  });

  bar.querySelectorAll('.favsFolderTabDel').forEach(function(x) {
    x.addEventListener('click', function(e) {
      e.stopPropagation();
      var fname = x.getAttribute('data-del-folder');
      if (!confirm('Delete folder "' + fname + '"? Players will become uncategorized.')) return;
      var keys = favsState.favorites.filter(function(f) { return f.folder === fname; }).map(function(f) { return f.player_key; });
      keys.forEach(function(k) {
        var fav = favsState.favorites.find(function(f) { return f.player_key === k; });
        if (fav) fav.folder = '';
        favsFetch('', { method: 'PATCH', body: JSON.stringify({ player_key: k, folder: '' }) }).catch(function() {});
      });
      if (favsState.activeFolder === fname) favsState.activeFolder = '';
      favsRenderFolderBar(); favsRenderPage();
    });
  });

  var newBtn = document.getElementById('favsFolderNewBtn');
  if (newBtn) newBtn.addEventListener('click', function() {
    var row = document.getElementById('favsFolderCreateRow');
    if (row) { row.style.display = row.style.display === 'none' ? 'flex' : 'none'; }
    var inp = document.getElementById('favsFolderInput');
    if (inp) { inp.value = ''; inp.focus(); }
  });

  var sendBtn = document.getElementById('favsFolderSendBtn');
  if (sendBtn) sendBtn.addEventListener('click', function() {
    var fname = favsState.activeFolder;
    var sendFavs = favsState.favorites.filter(function(f) { return f.folder === fname; });
    if (typeof sharesOpenBulkModal === 'function') sharesOpenBulkModal(fname, sendFavs);
  });
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
      favsRenderFolderBar();
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
          folder:      '',
          created_at:  fav.created_at || new Date().toISOString(),
        });
        favsUpdateModalBtn(r);
        favsRenderFolderBar();
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
  var folder   = favsState.activeFolder;

  var favs = favsState.favorites.slice();
  if (folder)   favs = favs.filter(function(f) { return f.folder === folder; });
  if (search)   favs = favs.filter(function(f) { return (f.player_name + ' ' + f.team).toLowerCase().indexOf(search) !== -1; });
  if (lgFilter) favs = favs.filter(function(f) { return f.league === lgFilter; });

  if (!favs.length) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    document.getElementById('favsCount') && (document.getElementById('favsCount').textContent = '');
    return;
  }
  if (empty) empty.style.display = 'none';
  var countEl = document.getElementById('favsCount');
  if (countEl) countEl.textContent = favs.length + ' player' + (favs.length !== 1 ? 's' : '');

  var folders = favsGetFolders();

  grid.innerHTML = favs.map(function(fav) {
    var r      = _favsGetRow(fav);
    var ppg    = r ? ((safeNum(r.PPG)   ?? 0).toFixed(1)) : '—';
    var apg    = r ? ((safeNum(r.APG)   ?? 0).toFixed(1)) : '—';
    var rpg    = r ? ((safeNum(r.RPG)   ?? 0).toFixed(1)) : '—';
    var score  = r ? Math.round(safeNum(r.Score) ?? 0)    : '—';
    var isWBB  = fav.league === 'WBB';
    var badge  = '<span class="favsLeagueBadge ' + (isWBB ? 'favsLeagueBadge--wbb' : 'favsLeagueBadge--mbb') + '">' + _favsEsc(fav.league || 'MBB') + '</span>';
    var pos    = _favsEsc(fav.pos || '—');
    var scoreColor = (r && r.Score >= 70) ? 'color:#4ade80' : (r && r.Score >= 40) ? 'color:var(--accent)' : '';

    // Folder selector options
    var folderOpts = '<option value="">&#128193; No folder</option>';
    folders.forEach(function(fn) {
      folderOpts += '<option value="' + _favsEsc(fn) + '"' + (fav.folder === fn ? ' selected' : '') + '>&#128193; ' + _favsEsc(fn) + '</option>';
    });
    folderOpts += '<option value="__new__">&#xff0b; New folder&hellip;</option>';

    return '<div class="favCard" tabindex="0">' +
      '<div class="favCardHeader">' +
        '<div class="favCardHeaderInner">' +
          '<div class="favCardName">' + _favsEsc(fav.player_name) + '</div>' +
          '<div class="favCardMeta">' + _favsEsc(fav.team) + '<span class="favCardDot">·</span>' + pos + '<span class="favCardDot">·</span>' + badge + '</div>' +
        '</div>' +
        '<button class="favHeart favHeart--rm" title="Remove favorite" data-rm-key="' + _favsEsc(fav.player_key) + '">❤️</button>' +
      '</div>' +
      '<div class="favCardStats">' +
        '<div class="favStat"><span class="favStatVal">' + ppg + '</span><span class="favStatLbl">PPG</span></div>' +
        '<div class="favStat"><span class="favStatVal">' + apg + '</span><span class="favStatLbl">APG</span></div>' +
        '<div class="favStat"><span class="favStatVal">' + rpg + '</span><span class="favStatLbl">RPG</span></div>' +
        '<div class="favStat favStat--score"><span class="favStatVal" style="' + scoreColor + '">' + score + '</span><span class="favStatLbl">Score</span></div>' +
      '</div>' +
      '<div class="favCardFooter">' +
        '<select class="favFolderSel" data-fk="' + _favsEsc(fav.player_key) + '">' + folderOpts + '</select>' +
        (r ? '<button class="favCardBtn" data-profile-key="' + _favsEsc(fav.player_key) + '">View →</button>' : '') +
      '</div>' +
    '</div>';
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
        favsHeart(r);
      } else {
        favsFetch('?' + new URLSearchParams({ key: key }).toString(), { method: 'DELETE' }).then(function() {
          favsState.favorites = favsState.favorites.filter(function(f) { return f.player_key !== key; });
          favsRenderFolderBar(); favsRenderPage();
        }).catch(function(e2) { console.warn('[Favorites] remove error:', e2); });
      }
    };
  });

  // Wire folder selects
  grid.querySelectorAll('.favFolderSel').forEach(function(sel) {
    sel.onchange = function() {
      var key = sel.getAttribute('data-fk');
      var val = sel.value;
      if (val === '__new__') {
        var name = (prompt('New folder name:') || '').trim();
        if (!name) {
          var cur = favsState.favorites.find(function(f) { return f.player_key === key; });
          sel.value = (cur && cur.folder) || '';
          return;
        }
        favsSetFolder(key, name);
      } else {
        favsSetFolder(key, val);
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

// ── Init (search / filter / folder create event listeners) ───────────────────
function initFavsPage() {
  var searchEl  = document.getElementById('favsSearch');
  var lgEl      = document.getElementById('favsLeagueFilter');
  var addBtn    = document.getElementById('favsFolderAddBtn');
  var cancelBtn = document.getElementById('favsFolderCancelBtn');
  var inp       = document.getElementById('favsFolderInput');
  var createRow = document.getElementById('favsFolderCreateRow');

  if (searchEl) searchEl.addEventListener('input',  favsRenderPage);
  if (lgEl)     lgEl.addEventListener    ('change', favsRenderPage);

  function _doCreate() {
    var name = (inp ? inp.value : '').trim();
    if (!name) return;
    favsState.activeFolder = name;
    if (createRow) createRow.style.display = 'none';
    favsRenderFolderBar(); favsRenderPage();
  }
  if (addBtn)    addBtn.addEventListener   ('click', _doCreate);
  if (cancelBtn) cancelBtn.addEventListener('click', function() { if (createRow) createRow.style.display = 'none'; });
  if (inp)       inp.addEventListener      ('keydown', function(e) {
    if (e.key === 'Enter')  _doCreate();
    if (e.key === 'Escape') { if (createRow) createRow.style.display = 'none'; }
  });

  favsRenderFolderBar();
  favsRenderPage();
}

window.FavoritesManager = { favsLoad, favsHeart, favsIsHearted, favsUpdateModalBtn, favsRenderPage, favsRenderFolderBar, favsGetFolders, favsSetFolder, initFavsPage };
