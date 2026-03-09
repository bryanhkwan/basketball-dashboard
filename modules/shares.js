// ============ SHARES / COLLABORATION MODULE ============
// Send player picks to teammates. Inbox + Sent views. Share button in player profile modal.
// Dependencies: auth.js, teambuilder.js (tbPlayerKey, tbPlayerLeague), favorites.js (favsHeart, favsState)

var SHARES_API = 'https://hidden-salad-773b.bryanhkwan.workers.dev';

var sharesState = { inbox: [], outbox: [], users: [], loaded: false };

// ── Helpers ───────────────────────────────────────────────────────────────────
function _sharesEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _sharesGetRow(playerKey) {
  if (typeof tbAllComputed === 'undefined' || !tbAllComputed) return null;
  var pools = Object.values(tbAllComputed);
  for (var i = 0; i < pools.length; i++) {
    var found = pools[i].find(function(r) {
      var k = typeof tbPlayerKey === 'function' ? tbPlayerKey(r) : ((r.Player||'')+'||'+(r.Team||''));
      return k === playerKey;
    });
    if (found) return found;
  }
  return null;
}

function _sharesKeyFor(r) {
  return typeof tbPlayerKey === 'function' ? tbPlayerKey(r) : ((r.Player||'')+'||'+(r.Team||''));
}

function _sharesTimeAgo(iso) {
  if (!iso) return '';
  var ms = Date.now() - new Date(iso).getTime();
  var s  = Math.floor(ms / 1000);
  if (s < 60)  return 'just now';
  var m = Math.floor(s / 60);
  if (m < 60)  return m + 'm ago';
  var h = Math.floor(m / 60);
  if (h < 24)  return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function sharesFetch(path, opts) {
  path = path || '';
  opts = opts || {};
  if (typeof authIsGuest === 'function' && authIsGuest()) return null;
  var token = typeof authGetToken === 'function' ? authGetToken() : null;
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  var res = await fetch(SHARES_API + path, Object.assign({ credentials: 'include', headers: headers }, opts));
  if (res.status === 401) return null;
  if (!res.ok) {
    var err = await res.json().catch(function() { return {}; });
    throw new Error(err.error || ('Error ' + res.status));
  }
  return res.json().catch(function() { return null; });
}

// ── Load inbox + outbox ───────────────────────────────────────────────────────
async function sharesLoad() {
  if (typeof authIsGuest === 'function' && authIsGuest()) return;
  try {
    var results = await Promise.all([
      sharesFetch('/shares?direction=inbox'),
      sharesFetch('/shares?direction=outbox'),
    ]);
    if (results[0]) sharesState.inbox  = results[0].shares  || [];
    if (results[1]) sharesState.outbox = results[1].shares  || [];
    sharesState.loaded = true;
    sharesUpdateBadge();
    sharesRenderInbox();
    sharesRenderSent();
  } catch (e) {
    console.warn('[Shares] load error:', e);
  }
}

// ── Load user list (for recipient autocomplete) ───────────────────────────────
async function sharesLoadUsers() {
  if (sharesState.users.length) return;  // already loaded
  try {
    var data = await sharesFetch('/users');
    if (!data) return;
    sharesState.users = data.users || [];
    var dl = document.getElementById('shareUserDatalist');
    if (dl) {
      dl.innerHTML = sharesState.users.map(function(u) {
        return '<option value="' + _sharesEsc(u.username) + '">';
      }).join('');
    }
  } catch (e) {
    console.warn('[Shares] load users error:', e);
  }
}

// ── Send a pick ───────────────────────────────────────────────────────────────
async function sharesSend(r, toUsername, message) {
  var key    = _sharesKeyFor(r);
  var league = typeof tbPlayerLeague === 'function' ? tbPlayerLeague(r) : (r._league || 'MBB');
  var result = await sharesFetch('/shares', {
    method: 'POST',
    body: JSON.stringify({
      to_username: toUsername,
      player_key:  key,
      player_name: r.Player   || '',
      team:        r.Team     || '',
      league:      league,
      pos:         r.Pos      || r.Position || '',
      message:     message    || '',
    }),
  });
  if (result && result.id) {
    sharesState.outbox.unshift({
      id: String(result.id), to_username: toUsername, player_key: key,
      player_name: r.Player||'', team: r.Team||'', league: league,
      pos: r.Pos||r.Position||'', message: message||'',
      created_at: result.created_at || new Date().toISOString(),
    });
    sharesRenderSent();
    return true;
  }
  return false;
}

// ── Mark read ─────────────────────────────────────────────────────────────────
async function sharesMarkRead(id) {
  try {
    await sharesFetch('/shares/' + id + '/read', { method: 'PATCH', body: '{}' });
    var share = sharesState.inbox.find(function(s) { return String(s.id) === String(id); });
    if (share && !share.read_at) {
      share.read_at = new Date().toISOString();
      sharesUpdateBadge();
    }
  } catch (e) { /* silent */ }
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function sharesDelete(id, fromInbox) {
  try {
    await sharesFetch('/shares/' + id, { method: 'DELETE' });
    if (fromInbox) {
      sharesState.inbox = sharesState.inbox.filter(function(s) { return String(s.id) !== String(id); });
      sharesUpdateBadge();
      sharesRenderInbox();
    } else {
      sharesState.outbox = sharesState.outbox.filter(function(s) { return String(s.id) !== String(id); });
      sharesRenderSent();
    }
  } catch (e) { console.warn('[Shares] delete error:', e); }
}

// ── Nav badge (unread count) ───────────────────────────────────────────────────
function sharesUpdateBadge() {
  var unread = sharesState.inbox.filter(function(s) { return !s.read_at; }).length;
  var badge  = document.getElementById('sharesNavBadge');
  if (!badge) return;
  badge.style.display = unread ? 'inline-flex' : 'none';
  badge.textContent   = unread > 9 ? '9+' : String(unread);
}

// ── Render inbox ──────────────────────────────────────────────────────────────
function sharesRenderInbox() {
  var container = document.getElementById('sharesInboxList');
  if (!container) return;

  if (!sharesState.inbox.length) {
    container.innerHTML =
      '<div class="sharesEmpty"><div class="sharesEmptyIcon">📭</div>' +
      '<div class="sharesEmptyTitle">No received picks</div>' +
      '<div class="sharesEmptyDesc">When a teammate sends you a player, it\'ll show up here.</div></div>';
    return;
  }

  container.innerHTML = sharesState.inbox.map(function(s) {
    var unread = !s.read_at;
    var badge  = s.league === 'WBB'
      ? '<span class="favsLeagueBadge favsLeagueBadge--wbb">WBB</span>'
      : '<span class="favsLeagueBadge favsLeagueBadge--mbb">MBB</span>';
    var r = _sharesGetRow(s.player_key);
    return (
      '<div class="shareCard' + (unread ? ' shareCard--unread' : '') + '" data-share-id="' + s.id + '">' +
        '<div class="shareCardHeader">' +
          '<div class="shareCardFrom">' + badge + '<span>From <b>' + _sharesEsc(s.from_username) + '</b></span></div>' +
          '<span class="shareCardTime">' + _sharesTimeAgo(s.created_at) + '</span>' +
        '</div>' +
        '<div class="shareCardPlayer">' + _sharesEsc(s.player_name) +
          (s.team ? '<span class="shareCardTeam"> · ' + _sharesEsc(s.team) + (s.pos ? ' · ' + _sharesEsc(s.pos) : '') + '</span>' : '') +
        '</div>' +
        (s.message ? '<div class="shareCardMsg">\u201c' + _sharesEsc(s.message) + '\u201d</div>' : '') +
        '<div class="shareCardActions">' +
          (r ? '<button class="secondary shareCardBtn" data-action="view" data-key="' + _sharesEsc(s.player_key) + '">View Profile</button>' : '') +
          '<button class="secondary shareCardBtn" data-action="fav" data-key="' + _sharesEsc(s.player_key) + '" data-name="' + _sharesEsc(s.player_name) + '" data-team="' + _sharesEsc(s.team) + '" data-league="' + _sharesEsc(s.league) + '" data-pos="' + _sharesEsc(s.pos||'') + '" data-sid="' + s.id + '">❤️ Save</button>' +
          '<button class="secondary shareCardBtn shareCardDel" data-action="del" data-id="' + s.id + '">✕</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  _sharesWireInbox(container);

  // Auto-mark unread as read when this pane is visible
  if (document.getElementById('sharesInboxList') &&
      document.getElementById('pageCollaborate') &&
      document.getElementById('pageCollaborate').style.display !== 'none') {
    sharesState.inbox.filter(function(s) { return !s.read_at; })
      .forEach(function(s) { sharesMarkRead(s.id); });
  }
}

function _sharesWireInbox(container) {
  container.querySelectorAll('[data-action="view"]').forEach(function(btn) {
    btn.onclick = function() {
      var r = _sharesGetRow(btn.getAttribute('data-key'));
      if (r && typeof openProfile === 'function') openProfile(r);
    };
  });

  container.querySelectorAll('[data-action="fav"]').forEach(function(btn) {
    btn.onclick = function() {
      var key    = btn.getAttribute('data-key');
      var sid    = btn.getAttribute('data-sid');
      var r      = _sharesGetRow(key);
      if (r && typeof favsHeart === 'function') {
        favsHeart(r);
        btn.textContent = '✓ Saved';
        btn.disabled = true;
      } else if (typeof favsFetch === 'function') {
        // save by metadata even if player row isn't loaded
        var payload = {
          player_key: key, player_name: btn.getAttribute('data-name'),
          team: btn.getAttribute('data-team'), league: btn.getAttribute('data-league'),
          pos:  btn.getAttribute('data-pos'),
        };
        favsFetch('', { method: 'POST', body: JSON.stringify(payload) }).then(function(res) {
          if (res && !res.error) {
            if (typeof favsState !== 'undefined')
              favsState.favorites.unshift(Object.assign({ id: String(res.id||Date.now()), created_at: res.created_at||new Date().toISOString() }, payload));
            if (typeof favsRenderPage === 'function') favsRenderPage();
            btn.textContent = '✓ Saved'; btn.disabled = true;
          }
        });
      }
      if (sid) sharesMarkRead(sid);
    };
  });

  container.querySelectorAll('[data-action="del"]').forEach(function(btn) {
    btn.onclick = function() { sharesDelete(btn.getAttribute('data-id'), true); };
  });
}

// ── Render sent ───────────────────────────────────────────────────────────────
function sharesRenderSent() {
  var container = document.getElementById('sharesSentList');
  if (!container) return;

  if (!sharesState.outbox.length) {
    container.innerHTML =
      '<div class="sharesEmpty"><div class="sharesEmptyIcon">📤</div>' +
      '<div class="sharesEmptyTitle">Nothing sent yet</div>' +
      '<div class="sharesEmptyDesc">Open a player profile and click <b>📤 Send</b> to share a pick.</div></div>';
    return;
  }

  container.innerHTML = sharesState.outbox.map(function(s) {
    var badge = s.league === 'WBB'
      ? '<span class="favsLeagueBadge favsLeagueBadge--wbb">WBB</span>'
      : '<span class="favsLeagueBadge favsLeagueBadge--mbb">MBB</span>';
    return (
      '<div class="shareCard" data-share-id="' + s.id + '">' +
        '<div class="shareCardHeader">' +
          '<div class="shareCardFrom">' + badge + '<span>To <b>' + _sharesEsc(s.to_username) + '</b></span></div>' +
          '<span class="shareCardTime">' + _sharesTimeAgo(s.created_at) + '</span>' +
        '</div>' +
        '<div class="shareCardPlayer">' + _sharesEsc(s.player_name) +
          (s.team ? '<span class="shareCardTeam"> · ' + _sharesEsc(s.team) + '</span>' : '') +
        '</div>' +
        (s.message ? '<div class="shareCardMsg">\u201c' + _sharesEsc(s.message) + '\u201d</div>' : '') +
        '<div class="shareCardActions">' +
          '<button class="secondary shareCardBtn shareCardDel" data-action="del-out" data-id="' + s.id + '">✕ Remove</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  container.querySelectorAll('[data-action="del-out"]').forEach(function(btn) {
    btn.onclick = function() { sharesDelete(btn.getAttribute('data-id'), false); };
  });
}

// ── Send modal ────────────────────────────────────────────────────────────────
var _shareModalPlayer = null;

function sharesOpenSendModal(r) {
  if (typeof authIsGuest === 'function' && authIsGuest()) {
    alert('Please log in to send picks.');
    return;
  }
  _shareModalPlayer = r;
  sharesLoadUsers();

  var back = document.getElementById('shareModalBack');
  if (!back) return;

  var nameEl = document.getElementById('shareModalPlayerName');
  var msgEl  = document.getElementById('shareModalMsg');
  var toEl   = document.getElementById('shareModalTo');
  var errEl  = document.getElementById('shareModalErr');
  var btnEl  = document.getElementById('shareModalSendBtn');

  if (nameEl) nameEl.textContent = (r.Player || '') + (r.Team ? '  ·  ' + r.Team : '');
  if (msgEl)  msgEl.value  = '';
  if (toEl)   toEl.value   = '';
  if (errEl)  errEl.textContent = '';
  if (btnEl)  { btnEl.disabled = false; btnEl.textContent = 'Send'; }

  back.style.display = 'flex';
  setTimeout(function() { if (toEl) toEl.focus(); }, 60);
}

function sharesCloseSendModal() {
  var back = document.getElementById('shareModalBack');
  if (back) back.style.display = 'none';
  _shareModalPlayer = null;
}

async function _sharesDoSend() {
  if (!_shareModalPlayer) return;
  var toEl    = document.getElementById('shareModalTo');
  var msgEl   = document.getElementById('shareModalMsg');
  var errEl   = document.getElementById('shareModalErr');
  var sendBtn = document.getElementById('shareModalSendBtn');
  var to      = (toEl ? toEl.value : '').trim();
  if (!to) { if (errEl) errEl.textContent = 'Enter a recipient username.'; return; }
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending…'; }
  if (errEl)   errEl.textContent = '';
  try {
    var msg = (msgEl ? msgEl.value : '').trim();
    await sharesSend(_shareModalPlayer, to, msg);
    sharesCloseSendModal();
  } catch (e) {
    if (errEl)   errEl.textContent = e.message || 'Send failed.';
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
  }
}

// ── Page init ─────────────────────────────────────────────────────────────────
function initSharesPage() {
  // Sub-tab switching
  document.querySelectorAll('.sharesSubBtn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.sharesSubBtn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.sharesPane').forEach(function(p) { p.style.display = 'none'; });
      btn.classList.add('active');
      var target = document.getElementById(btn.dataset.sub);
      if (target) target.style.display = '';
    });
  });

  // Send modal
  var sendBtn    = document.getElementById('shareModalSendBtn');
  var cancelBtn  = document.getElementById('shareModalCancelBtn');
  var back       = document.getElementById('shareModalBack');
  if (sendBtn)   sendBtn.addEventListener  ('click', _sharesDoSend);
  if (cancelBtn) cancelBtn.addEventListener('click', sharesCloseSendModal);
  if (back)      back.addEventListener     ('click', function(e) { if (e.target === back) sharesCloseSendModal(); });

  // Mark inbox read when the page is opened
  var inboxNavBtn = document.querySelector('[data-page="pageCollaborate"]');
  if (inboxNavBtn) {
    inboxNavBtn.addEventListener('click', function() {
      sharesRenderInbox();
      sharesRenderSent();
    });
  }
}

// ── Bulk send modal (send all players in a folder) ────────────────────────────
var _bulkShareFolderName = '';
var _bulkShareFavs       = [];

function sharesOpenBulkModal(folderName, favs) {
  if (typeof authIsGuest === 'function' && authIsGuest()) { alert('Please log in to send picks.'); return; }
  _bulkShareFolderName = folderName;
  _bulkShareFavs       = favs || [];
  sharesLoadUsers();

  var back     = document.getElementById('bulkShareModalBack');
  var titleEl  = document.getElementById('bulkShareFolderName');
  var toEl     = document.getElementById('bulkShareTo');
  var genEl    = document.getElementById('bulkShareGeneralMsg');
  var errEl    = document.getElementById('bulkShareErr');
  var sendBtn  = document.getElementById('bulkShareSendBtn');
  var listEl   = document.getElementById('bulkSharePlayerList');

  if (!back) return;
  if (titleEl)  titleEl.textContent = '\uD83D\uDCC1 ' + folderName + ' \u2014 ' + _bulkShareFavs.length + ' player' + (_bulkShareFavs.length !== 1 ? 's' : '');
  if (toEl)     toEl.value     = '';
  if (genEl)    genEl.value    = '';
  if (errEl)    errEl.textContent = '';
  if (sendBtn)  { sendBtn.disabled = false; sendBtn.textContent = 'Send All'; }
  if (sendBtn)  sendBtn.onclick = _sharesDoBulkSend;
  if (listEl) {
    listEl.innerHTML = _bulkShareFavs.map(function(fav, i) {
      return '<div class="bulkSharePlayer">' +
        '<div class="bulkSharePlayerName">' + _sharesEsc(fav.player_name) +
          '<span class="shareCardTeam"> \u00b7 ' + _sharesEsc(fav.team || '') + '</span></div>' +
        '<textarea class="bulkSharePlayerNote" data-idx="' + i + '" placeholder="Note for this player (optional)\u2026" rows="2"></textarea>' +
      '</div>';
    }).join('');
  }
  back.style.display = 'flex';
  setTimeout(function() { if (toEl) toEl.focus(); }, 60);
}

function sharesCloseBulkModal() {
  var back = document.getElementById('bulkShareModalBack');
  if (back) back.style.display = 'none';
  _bulkShareFolderName = ''; _bulkShareFavs = [];
}

async function _sharesDoBulkSend() {
  var toEl    = document.getElementById('bulkShareTo');
  var genEl   = document.getElementById('bulkShareGeneralMsg');
  var errEl   = document.getElementById('bulkShareErr');
  var sendBtn = document.getElementById('bulkShareSendBtn');
  var to      = (toEl ? toEl.value : '').trim();
  if (!to) { if (errEl) errEl.textContent = 'Enter a recipient username.'; return; }
  var generalMsg = (genEl ? genEl.value : '').trim();
  var notes = [];
  document.querySelectorAll('.bulkSharePlayerNote').forEach(function(ta) { notes.push(ta.value.trim()); });
  var players = _bulkShareFavs.map(function(fav, i) {
    return { player_key: fav.player_key, player_name: fav.player_name, team: fav.team || '', league: fav.league || 'MBB', pos: fav.pos || '', message: notes[i] || '' };
  });
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending\u2026'; }
  if (errEl)   errEl.textContent = '';
  try {
    var token   = typeof authGetToken === 'function' ? authGetToken() : null;
    var headers = { 'Content-Type': 'application/json' };
    if (token)  headers['Authorization'] = 'Bearer ' + token;
    var res = await fetch(SHARES_API + '/shares/bulk', { method: 'POST', credentials: 'include', headers: headers,
      body: JSON.stringify({ to_username: to, general_message: generalMsg, players: players }) });
    if (!res.ok) { var e = await res.json().catch(function() { return {}; }); throw new Error(e.error || ('Error ' + res.status)); }
    var result = await res.json();
    sharesCloseBulkModal();
    // Append a summary entry to outbox state
    for (var i = 0; i < players.length; i++) {
      sharesState.outbox.unshift({ id: 'bulk_' + Date.now() + '_' + i, to_username: to,
        player_key: players[i].player_key, player_name: players[i].player_name,
        team: players[i].team, league: players[i].league, pos: players[i].pos,
        message: players[i].message || generalMsg, created_at: result.created_at || new Date().toISOString() });
    }
    sharesRenderSent();
  } catch (e2) {
    if (errEl)   errEl.textContent = e2.message || 'Send failed.';
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Send All'; }
  }
}

window.SharesManager = { sharesLoad, sharesSend, sharesOpenSendModal, sharesCloseSendModal, sharesOpenBulkModal, sharesCloseBulkModal, sharesUpdateBadge, sharesRenderInbox, sharesRenderSent, initSharesPage };
