// ============ FAVORITES MODULE ============
// Per-user favorites with folders. Heart button in profile modal + dedicated Favorites page.
// Dependencies: auth.js, teambuilder.js (tbPlayerKey, tbPlayerLeague)

var FAVS_BASE = 'https://hidden-salad-773b.bryanhkwan.workers.dev/favorites';

// ── Dev mode localStorage fallback (mirrors notes.js pattern) ────────────────
function _devFavsStore() { try { return JSON.parse(localStorage.getItem('_devFavs') || '[]'); } catch (_) { return []; } }
function _devFavsWrite(arr) { localStorage.setItem('_devFavs', JSON.stringify(arr)); }
function _devFavFoldersStore() { try { return JSON.parse(localStorage.getItem('_devFavFolders') || '[]'); } catch (_) { return []; } }
function _devFavFoldersWrite(arr) { localStorage.setItem('_devFavFolders', JSON.stringify(arr)); }

function favsRefreshPortalAlerts() {
  if (window.TransferPortal && typeof window.TransferPortal.refreshWatchAlerts === 'function') {
    window.TransferPortal.refreshWatchAlerts();
  }
}

async function _favsFetchDev(path, opts) {
  var method = ((opts && opts.method) || 'GET').toUpperCase();
  // ── Folders sub-resource ──────────────────────────────────────────────────
  if (path === '/folders' || path.startsWith('/folders/')) {
    var folders = _devFavFoldersStore();
    if (method === 'GET') return { folders: folders };
    if (method === 'POST') {
      var body = JSON.parse((opts && opts.body) || '{}');
      var name = (body.name || '').trim();
      if (!name) return { error: 'name required' };
      if (folders.indexOf(name) === -1) { folders.push(name); folders.sort(); _devFavFoldersWrite(folders); }
      return { name: name, already_exists: folders.indexOf(name) !== -1 };
    }
    if (method === 'DELETE') {
      var delName = decodeURIComponent(path.replace('/folders/', '')).trim();
      _devFavFoldersWrite(folders.filter(function(f) { return f !== delName; }));
      var favs2 = _devFavsStore();
      _devFavsWrite(favs2.map(function(f) { return f.folder === delName ? Object.assign({}, f, { folder: '' }) : f; }));
      return { success: true };
    }
    return null;
  }
  // ── Favorites ─────────────────────────────────────────────────────────────
  var favs = _devFavsStore();
  if (method === 'GET') return { favorites: favs, folders: _devFavFoldersStore() };
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
// pendingFolders: folder names created by user but not yet containing any players.
// They persist across tab switches until explicitly deleted.
// serverFolders: persisted folder names loaded from / saved to the backend.
// Replaces the old in-memory pendingFolders array.
var favsState = { favorites: [], loaded: false, activeFolder: '', serverFolders: [], selectedKeys: new Set(), pendingFolders: [], lastSyncedAt: 0, syncPromise: null };
var _favsRenderTimer = null;

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function favsFetch(path, opts) {
  path = path || '';
  opts = opts || {};
  if (typeof DEV_BYPASS_AUTH !== 'undefined' && DEV_BYPASS_AUTH) return _favsFetchDev(path, opts);
  const token = typeof authGetToken === 'function' ? authGetToken() : null;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(FAVS_BASE + path, Object.assign({ credentials: 'include', headers: headers }, opts));
  if (res.status === 401) {
    var unauthorized = new Error('Unauthorized');
    unauthorized.code = 'UNAUTHORIZED';
    throw unauthorized;
  }
  if (!res.ok) {
    const err = await res.json().catch(function() { return {}; });
    throw new Error(err.message || err.error || ('Error ' + res.status));
  }
  return res.json().catch(function() { return null; });
}

// ── Load favorites + folders from server ────────────────────────────────────
async function favsLoad() {
  if (typeof authIsGuest === 'function' && authIsGuest()) return;
  try {
    const data = await favsFetch();
    if (!data) return;
    favsState.favorites     = Array.isArray(data) ? data : (data.favorites || []);
    // folders array is included in the same response
    favsState.serverFolders = Array.isArray(data.folders) ? data.folders : [];
    favsState.loaded = true;
    favsMarkSynced();
    favsRenderFolderBar();
    favsRenderPage();
    favsRefreshPortalAlerts();
    if (typeof _currentProfilePlayer !== 'undefined' && _currentProfilePlayer)
      favsUpdateModalBtn(_currentProfilePlayer);
    favsUpdateTableHearts();
  } catch (e) {
    if (e && e.code === 'UNAUTHORIZED') {
      favsState.loaded = false;
      favsState.lastSyncedAt = 0;
      if (typeof authHandleUnauthorized === 'function') {
        authHandleUnauthorized('Your session expired. Please log in again to sync favorites.');
      }
      return;
    }
    console.warn('[Favorites] load error:', e);
  }
}

// ── Folders ───────────────────────────────────────────────────────────────────
function favsGetFolders() {
  var seen = {}, result = [];
  // serverFolders is the authoritative list (persisted folders from DB)
  favsState.serverFolders.forEach(function(fn) {
    if (fn && !seen[fn]) { seen[fn] = true; result.push(fn); }
  });
  // Also include any folder names already used on favorites (legacy / data integrity)
  favsState.favorites.forEach(function(f) {
    if (f.folder && !seen[f.folder]) { seen[f.folder] = true; result.push(f.folder); }
  });
  return result.sort(function(a, b) { return a.localeCompare(b); });
}

async function favsSetFolder(playerKey, folderName) {
  folderName = (folderName || '').trim();
  try {
    // Ensure the folder exists in fav_folders if it's a new name
    if (folderName && favsState.serverFolders.indexOf(folderName) === -1) {
      await favsFetch('/folders', { method: 'POST', body: JSON.stringify({ name: folderName }) }).catch(function() {});
      favsState.serverFolders.push(folderName);
      favsState.serverFolders.sort(function(a, b) { return a.localeCompare(b); });
    }
    await favsFetch('', { method: 'PATCH', body: JSON.stringify({ player_key: playerKey, folder: folderName }) });
    var fav = favsState.favorites.find(function(f) { return f.player_key === playerKey; });
    if (fav) fav.folder = folderName;
    favsRenderFolderBar();
    favsRenderPage();
    favsRefreshPortalAlerts();
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
      favsState.selectedKeys.clear();
      favsRenderFolderBar(); favsRenderPage();
    });
  });

  bar.querySelectorAll('.favsFolderTabDel').forEach(function(x) {
    x.addEventListener('click', function(e) {
      e.stopPropagation();
      var fname = x.getAttribute('data-del-folder');
      if (!confirm('Delete folder "' + fname + '"? Players will become uncategorized.')) return;
      // Clear folder locally in state
      favsState.favorites.forEach(function(f) { if (f.folder === fname) f.folder = ''; });
      // Delete folder from server (atomically clears folder column on all its players too)
      favsFetch('/folders/' + encodeURIComponent(fname), { method: 'DELETE' }).catch(function() {});
      // Remove from local serverFolders list
      favsState.serverFolders = favsState.serverFolders.filter(function(fn) { return fn !== fname; });
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
      favsRefreshPortalAlerts();
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
        favsRefreshPortalAlerts();
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

// ── Bulk action bar (appears when cards are selected) ─────────────────────────
function _favsRenderBulkBar() {
  var bar = document.getElementById('favsBulkBar');
  if (!bar) return;
  var count = favsState.selectedKeys.size;
  if (count === 0) { bar.style.display = 'none'; bar.innerHTML = ''; return; }

  var folders = favsGetFolders();
  var opts = '<option value="" disabled selected>Move to folder\u2026</option>';
  opts += '<option value="__none__">\uD83D\uDCC1 No folder (remove)</option>';
  folders.forEach(function(fn) {
    opts += '<option value="' + _favsEsc(fn) + '">\uD83D\uDCC1 ' + _favsEsc(fn) + '</option>';
  });
  opts += '<option value="__new__">&#xff0b; New folder\u2026</option>';

  bar.innerHTML =
    '<span class="favsBulkCount">' + count + ' selected</span>' +
    '<select id="favsBulkFolderSel" class="favsBulkSel">' + opts + '</select>' +
    '<button id="favsBulkMoveBtn">Move \u2192</button>' +
    '<button id="favsBulkClearBtn" class="secondary">\u2715 Clear</button>';
  bar.style.display = 'flex';

  document.getElementById('favsBulkClearBtn').onclick = function() {
    favsState.selectedKeys.clear(); _favsRenderBulkBar();
    document.querySelectorAll('.favCardCheckbox').forEach(function(cb) { cb.checked = false; });
  };

  document.getElementById('favsBulkMoveBtn').onclick = async function() {
    var sel = document.getElementById('favsBulkFolderSel');
    var val = sel ? sel.value : '';
    if (!val || val === '' ) return;  // nothing chosen yet
    if (val === '__new__') {
      var name = (prompt('New folder name:') || '').trim();
      if (!name) return;
      if (favsState.pendingFolders.indexOf(name) === -1) favsState.pendingFolders.push(name);
      val = name;
    }
    var targetFolder = (val === '__none__') ? '' : val;
    // Ensure folder exists in fav_folders before assigning players to it
    if (targetFolder && favsState.serverFolders.indexOf(targetFolder) === -1) {
      await favsFetch('/folders', { method: 'POST', body: JSON.stringify({ name: targetFolder }) }).catch(function() {});
      favsState.serverFolders.push(targetFolder);
      favsState.serverFolders.sort(function(a, b) { return a.localeCompare(b); });
    }
    var keys = Array.from(favsState.selectedKeys);
    // Update local state immediately for responsive UI
    keys.forEach(function(k) {
      var fav = favsState.favorites.find(function(f) { return f.player_key === k; });
      if (fav) fav.folder = targetFolder;
    });
    // Persist all folder assignments to the server
    await Promise.all(keys.map(function(k) {
      return favsFetch('', { method: 'PATCH', body: JSON.stringify({ player_key: k, folder: targetFolder }) })
        .catch(function(e) { console.warn('[Favorites] bulk setFolder error for', k, e); });
    }));
    // Folder now has real players — remove from pending
    if (targetFolder) favsState.pendingFolders = favsState.pendingFolders.filter(function(fn) { return fn !== targetFolder; });
    favsState.selectedKeys.clear();
    favsRenderFolderBar();
    favsRenderPage();
    favsRefreshPortalAlerts();
  };
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

    var isSelected = favsState.selectedKeys.has(fav.player_key);

    return '<div class="favCard' + (isSelected ? ' favCard--selected' : '') + '" tabindex="0">' +
      '<div class="favCardHeader">' +
        '<label class="favCardCheck" onclick="event.stopPropagation()">' +
          '<input type="checkbox" class="favCardCheckbox" data-ck="' + _favsEsc(fav.player_key) + '"' + (isSelected ? ' checked' : '') + '>' +
        '</label>' +
        '<div class="favCardHeaderInner">' +
          '<div class="favCardName">' + _favsEsc(fav.player_name) + '</div>' +
          '<div class="favCardMeta">' + _favsEsc(fav.team) + '<span class="favCardDot">\u00b7</span>' + pos + '<span class="favCardDot">\u00b7</span>' + badge + '</div>' +
        '</div>' +
        '<button class="favHeart favHeart--rm" title="Remove favorite" data-rm-key="' + _favsEsc(fav.player_key) + '">\u2764\ufe0f</button>' +
      '</div>' +
      '<div class="favCardStats">' +
        '<div class="favStat"><span class="favStatVal">' + ppg + '</span><span class="favStatLbl">PPG</span></div>' +
        '<div class="favStat"><span class="favStatVal">' + apg + '</span><span class="favStatLbl">APG</span></div>' +
        '<div class="favStat"><span class="favStatVal">' + rpg + '</span><span class="favStatLbl">RPG</span></div>' +
        '<div class="favStat favStat--score"><span class="favStatVal" style="' + scoreColor + '">' + score + '</span><span class="favStatLbl">Score</span></div>' +
      '</div>' +
      '<div class="favCardFooter">' +
        '<select class="favFolderSel" data-fk="' + _favsEsc(fav.player_key) + '">' + folderOpts + '</select>' +
        (r ? '<button class="favCardBtn" data-profile-key="' + _favsEsc(fav.player_key) + '">View \u2192</button>' : '') +
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

  // Wire selection checkboxes
  grid.querySelectorAll('.favCardCheckbox').forEach(function(cb) {
    cb.onchange = function() {
      var key = cb.getAttribute('data-ck');
      if (cb.checked) favsState.selectedKeys.add(key);
      else            favsState.selectedKeys.delete(key);
      // Toggle selected style on the card
      var card = cb.closest('.favCard');
      if (card) card.classList.toggle('favCard--selected', cb.checked);
      _favsRenderBulkBar();
    };
  });

  _favsRenderBulkBar();
}

// ── Init (search / filter / folder create event listeners) ───────────────────
function initFavsPage() {
  if (!window.__favsVisibilityBound) {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) favsEnsureFresh(false);
    });
    window.addEventListener('focus', function () { favsEnsureFresh(false); });
    window.__favsVisibilityBound = true;
  }
  var searchEl  = document.getElementById('favsSearch');
  var lgEl      = document.getElementById('favsLeagueFilter');
  var addBtn    = document.getElementById('favsFolderAddBtn');
  var cancelBtn = document.getElementById('favsFolderCancelBtn');
  var inp       = document.getElementById('favsFolderInput');
  var createRow = document.getElementById('favsFolderCreateRow');

  if (searchEl) searchEl.addEventListener('input', function () {
    if (_favsRenderTimer) clearTimeout(_favsRenderTimer);
    _favsRenderTimer = setTimeout(function () {
      _favsRenderTimer = null;
      favsRenderPage();
    }, 120);
  });
  if (lgEl)     lgEl.addEventListener    ('change', favsRenderPage);

  function _doCreate() {
    var name = (inp ? inp.value : '').trim();
    if (!name) return;
    // Optimistically add to local list immediately for instant UI feedback
    if (favsState.serverFolders.indexOf(name) === -1) {
      favsState.serverFolders.push(name);
      favsState.serverFolders.sort(function(a, b) { return a.localeCompare(b); });
    }
    favsState.activeFolder = name;
    if (createRow) createRow.style.display = 'none';
    favsRenderFolderBar(); favsRenderPage();
    // Persist to server in the background
    favsFetch('/folders', { method: 'POST', body: JSON.stringify({ name: name }) })
      .catch(function(e) { console.warn('[Favorites] folder create error:', e); });
  }
  if (addBtn)    addBtn.addEventListener   ('click', _doCreate);
  if (cancelBtn) cancelBtn.addEventListener('click', function() { if (createRow) createRow.style.display = 'none'; });
  if (inp)       inp.addEventListener      ('keydown', function(e) {
    if (e.key === 'Enter')  _doCreate();
    if (e.key === 'Escape') { if (createRow) createRow.style.display = 'none'; }
  });

  favsRenderFolderBar();
  favsRenderPage();
  favsRefreshPortalAlerts();
}

window.FavoritesManager = { favsLoad, favsEnsureFresh, favsHeart, favsIsHearted, favsUpdateModalBtn, favsRenderPage, favsRenderFolderBar, favsGetFolders, favsSetFolder, initFavsPage };
