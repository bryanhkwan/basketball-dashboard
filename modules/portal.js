// ============ TRANSFER PORTAL MODULE ============
// Uses Worker endpoint: /api/portal/entries

var portalItems = [];
var portalFiltered = [];
var portalRecRows = [];

var portalSearchInputEl, portalStatusFilterEl, portalRefreshBtnEl, portalUseSnapshotEl;
var portalCountEl, portalMatchedCountEl, portalStatusEl, portalTableBodyEl, portalEmptyEl;
var portalRecTeamEl, portalRecRefreshTeamBtn, portalRecRunBtn;
var portalRecTeamSummaryEl, portalReplaceListEl, portalRecBodyEl, portalRecEmptyEl, portalRecContextEl;
var portalAIAnalyzeBtn, portalAIDownloadBtn, portalAIStatusEl, portalAIOutputEl;
var portalWatchAlertWrapEl, favsPortalAlertWrapEl, favsPortalBadgeEl;

var portalTeamCtx = null;
var portalRecDist = null;
var portalAllMbbPlayers = [];
var portalTargetSeason = '2026';
var portalLastAIReportText = '';
var portalDetectedDepartures = [];
var portalSelectedDepartureNames = [];
var portalWatchAlerts = [];
var portalFilterTimer = null;
var portalPlayerIndexRef = null;
var portalPlayerIndexExact = Object.create(null);
var portalPlayerIndexLoose = [];
var portalJsPdfPromise = null;

var PORTAL_GEMINI_PROXY_URL = 'https://white-pine-7669.bryanhkwan.workers.dev';
var PORTAL_GEMINI_MODEL = 'gemini-2.5-flash-lite';
var PORTAL_STAT_DIR = {
  'drtg': 'lower',
  'topg': 'lower',
};

function initPortalDOMRefs() {
  portalSearchInputEl = document.getElementById('portalSearchInput');
  portalStatusFilterEl = document.getElementById('portalStatusFilter');
  portalRefreshBtnEl = document.getElementById('portalRefreshBtn');
  portalUseSnapshotEl = document.getElementById('portalUseSnapshot');
  portalCountEl = document.getElementById('portalCount');
  portalMatchedCountEl = document.getElementById('portalMatchedCount');
  portalStatusEl = document.getElementById('portalStatus');
  portalTableBodyEl = document.getElementById('portalTableBody');
  portalEmptyEl = document.getElementById('portalEmpty');

  portalRecTeamEl = document.getElementById('portalRecTeam');
  portalRecRefreshTeamBtn = document.getElementById('portalRecRefreshTeam');
  portalRecRunBtn = document.getElementById('portalRecRunBtn');
  portalRecTeamSummaryEl = document.getElementById('portalRecTeamSummary');
  portalReplaceListEl = document.getElementById('portalReplaceList');
  portalRecBodyEl = document.getElementById('portalRecBody');
  portalRecEmptyEl = document.getElementById('portalRecEmpty');
  portalRecContextEl = document.getElementById('portalRecContext');
  portalAIAnalyzeBtn = document.getElementById('portalAIAnalyzeBtn');
  portalAIDownloadBtn = document.getElementById('portalAIDownloadBtn');
  portalAIStatusEl = document.getElementById('portalAIStatus');
  portalAIOutputEl = document.getElementById('portalAIOutput');
  portalWatchAlertWrapEl = document.getElementById('portalWatchAlertWrap');
  favsPortalAlertWrapEl = document.getElementById('favsPortalAlertWrap');
  favsPortalBadgeEl = document.getElementById('favsPortalBadge');
}

function portalNorm(s) {
  return (s || '').toString().toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function portalEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function portalGetAllPlayers() {
  if (typeof tbGetAllPlayers === 'function') {
    return tbGetAllPlayers('MBB') || [];
  }
  if (window._app && typeof window._app.tbGetAllPlayers === 'function') {
    return window._app.tbGetAllPlayers('MBB') || [];
  }
  return [];
}

function portalGetPlayerIndex() {
  var players = portalGetAllPlayers();
  if (portalPlayerIndexRef === players) {
    return { exact: portalPlayerIndexExact, loose: portalPlayerIndexLoose };
  }

  portalPlayerIndexRef = players;
  portalPlayerIndexExact = Object.create(null);
  portalPlayerIndexLoose = [];

  for (var i = 0; i < players.length; i++) {
    var player = players[i];
    var norm = portalNorm(player.Player || player.Name || '');
    if (!norm) continue;
    if (!portalPlayerIndexExact[norm]) portalPlayerIndexExact[norm] = player;
    portalPlayerIndexLoose.push({ norm: norm, player: player });
  }

  return { exact: portalPlayerIndexExact, loose: portalPlayerIndexLoose };
}

function portalFindPlayerMatch(name) {
  if (!name) return null;
  var needle = portalNorm(name);
  if (!needle) return null;
  var index = portalGetPlayerIndex();
  if (index.exact[needle]) return index.exact[needle];
  for (var j = 0; j < index.loose.length; j++) {
    var n2 = index.loose[j].norm;
    if (n2 && (n2.includes(needle) || needle.includes(n2))) return index.loose[j].player;
  }
  return null;
}

function portalScheduleApplyFilters(delayMs) {
  if (portalFilterTimer) clearTimeout(portalFilterTimer);
  portalFilterTimer = setTimeout(function () {
    portalFilterTimer = null;
    portalApplyFilters();
  }, Number.isFinite(delayMs) ? Math.max(0, delayMs) : 120);
}

function portalEnsureJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!portalJsPdfPromise) {
    portalJsPdfPromise = loadScriptOnce(
      'jspdf',
      'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
      {
        timeoutMs: 12000,
        test: function () { return window.jspdf && window.jspdf.jsPDF; },
        errorMessage: 'jsPDF failed to load.'
      }
    );
  }
  return portalJsPdfPromise;
}

function portalFmtDate(iso) {
  if (!iso) return '—';
  try {
    var d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '—';
    return d.toISOString().slice(0, 10);
  } catch (_) {
    return '—';
  }
}

function portalSetStatus(msg) {
  if (portalStatusEl) portalStatusEl.textContent = msg;
}

function portalSetAIStatus(msg) {
  if (portalAIStatusEl) portalAIStatusEl.textContent = msg || '';
}

function portalFmtNum(v, d) {
  d = d == null ? 1 : d;
  if (!Number.isFinite(+v)) return '—';
  return (+v).toFixed(d);
}

function portalSafeNum(v) {
  if (typeof safeNum === 'function') return safeNum(v);
  var n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function portalGetPlayerName(r) {
  return (r && (r.Player || r.Name || r.playerName)) ? String(r.Player || r.Name || r.playerName) : '';
}

function portalGetPlayerTeam(r) {
  return (r && (r.Team || r.team || r.fromTeam)) ? String(r.Team || r.team || r.fromTeam) : '';
}

function portalGetSeason() {
  if (typeof getDashboardSelectedSeason === 'function') return getDashboardSelectedSeason('2026');
  return '2026';
}

function portalStatDir(stat) {
  var key = String(stat || '').toLowerCase();
  if (PORTAL_STAT_DIR[key]) return PORTAL_STAT_DIR[key];
  if (typeof DEFAULT_DIR !== 'undefined' && DEFAULT_DIR && DEFAULT_DIR[stat]) return DEFAULT_DIR[stat];
  return 'higher';
}

function portalPctFromSorted(sorted, val) {
  if (!Array.isArray(sorted) || !sorted.length || !Number.isFinite(val)) return null;
  var lo = 0;
  var hi = sorted.length;
  while (lo < hi) {
    var mid = (lo + hi) >> 1;
    if (sorted[mid] <= val) lo = mid + 1;
    else hi = mid;
  }
  var p = lo / sorted.length;
  return p < 0 ? 0 : (p > 1 ? 1 : p);
}

function portalCollectAllMbbPlayers() {
  portalAllMbbPlayers = portalGetAllPlayers() || [];
  return portalAllMbbPlayers;
}

function portalBuildDistributions(players) {
  var allStats = {};
  var guardCats = (typeof GAP_CATEGORIES !== 'undefined' && GAP_CATEGORIES && GAP_CATEGORIES.Guards) ? GAP_CATEGORIES.Guards : [];
  var bigCats = (typeof GAP_CATEGORIES !== 'undefined' && GAP_CATEGORIES && GAP_CATEGORIES.Bigs) ? GAP_CATEGORIES.Bigs : [];
  guardCats.concat(bigCats).forEach(function (cat) {
    (cat.stats || []).forEach(function (s) { allStats[s] = true; });
  });
  allStats['PerfScore_calc'] = true;
  allStats['Score'] = true;

  var out = {};
  Object.keys(allStats).forEach(function (stat) {
    var arr = [];
    (players || []).forEach(function (p) {
      var x = portalSafeNum(p[stat]);
      if (x !== null) arr.push(x);
    });
    if (arr.length < 10) return;
    arr.sort(function (a, b) { return a - b; });
    out[stat] = { sorted: arr, invert: portalStatDir(stat) === 'lower' };
  });
  return out;
}

function portalStatPercentile(stat, val, dist) {
  if (!dist || !dist[stat]) return null;
  var d = dist[stat];
  var p = portalPctFromSorted(d.sorted, val);
  if (p === null) return null;
  if (d.invert) p = 1 - p;
  return p < 0 ? 0 : (p > 1 ? 1 : p);
}

function portalCategoryDefsForRoster(roster) {
  var guards = (roster || []).some(function (r) {
    return typeof tbPosGroup === 'function' ? tbPosGroup(r) === 'guard' : true;
  });
  var bigs = (roster || []).some(function (r) {
    return typeof tbPosGroup === 'function' ? tbPosGroup(r) !== 'guard' : true;
  });
  var defs = [];
  if (guards && bigs) defs = (GAP_CATEGORIES.Guards || []).concat(GAP_CATEGORIES.Bigs || []);
  else if (bigs) defs = GAP_CATEGORIES.Bigs || [];
  else defs = GAP_CATEGORIES.Guards || [];

  var seen = {};
  return defs.filter(function (d) {
    if (seen[d.label]) return false;
    seen[d.label] = true;
    return true;
  });
}

function portalCategoryScoresForPlayer(player, defs, dist) {
  var out = {};
  (defs || []).forEach(function (cat) {
    var sum = 0;
    var cnt = 0;
    (cat.stats || []).forEach(function (stat) {
      var x = portalSafeNum(player[stat]);
      if (x === null) return;
      var p = portalStatPercentile(stat, x, dist);
      if (p === null) return;
      sum += p;
      cnt += 1;
    });
    out[cat.label] = cnt > 0 ? (sum / cnt) : 0.5;
  });
  return out;
}

function portalCategoryScoresForRoster(roster, defs, dist) {
  var out = {};
  (defs || []).forEach(function (cat) {
    var sum = 0;
    var cnt = 0;
    (cat.stats || []).forEach(function (stat) {
      (roster || []).forEach(function (r) {
        var x = portalSafeNum(r[stat]);
        if (x === null) return;
        var p = portalStatPercentile(stat, x, dist);
        if (p === null) return;
        sum += p;
        cnt += 1;
      });
    });
    out[cat.label] = cnt > 0 ? (sum / cnt) : 0.5;
  });
  return out;
}

function portalCategoryPriorityFromTeamStats(teamStats) {
  var w = {};
  var set = function (k, v) { w[k] = Math.max(w[k] || 1, v); };
  if (!teamStats || !teamStats.teamStats || !teamStats.teamStats.fourFactors) return w;
  var ff = teamStats.teamStats.fourFactors;
  if (portalSafeNum(ff.effectiveFieldGoalPct) !== null && ff.effectiveFieldGoalPct < 50) set('Shooting', 1.35);
  if (portalSafeNum(ff.turnoverRatio) !== null && ff.turnoverRatio > 0.19) set('Ball security', 1.30);
  if (portalSafeNum(ff.offensiveReboundPct) !== null && ff.offensiveReboundPct < 28) {
    set('Off. rebounding', 1.25);
    set('Def. rebounding', 1.2);
  }
  if (portalSafeNum(ff.freeThrowRate) !== null && ff.freeThrowRate < 24) set('Free throws', 1.2);
  if (teamStats.opponentStats && teamStats.opponentStats.fourFactors) {
    var dff = teamStats.opponentStats.fourFactors;
    if (portalSafeNum(dff.effectiveFieldGoalPct) !== null && dff.effectiveFieldGoalPct > 52) set('Defense', 1.35);
    if (portalSafeNum(dff.offensiveReboundPct) !== null && dff.offensiveReboundPct > 30) set('Def. rebounding', 1.25);
  }
  return w;
}

function portalSelectedReplaceNames() {
  if (!portalSelectedDepartureNames.length) return [];
  return portalSelectedDepartureNames.map(function (nm) {
    var dep = portalDetectedDepartures.find(function (d) {
      return d.player && portalGetPlayerName(d.player) === nm;
    });
    return dep && dep.player ? portalGetPlayerName(dep.player) : nm;
  });
}

function portalBuildTeamSummary(teamName, ratings, stats, games, roster) {
  var rec = '—';
  if (games && Array.isArray(games.games) && games.games.length) {
    var w = 0;
    var l = 0;
    var tn = portalNorm(teamName);
    games.games.forEach(function (g) {
      var hn = portalNorm(g.homeTeam || '');
      var an = portalNorm(g.awayTeam || '');
      var isHome = hn === tn;
      var isAway = an === tn;
      if (!isHome && !isAway) return;
      var ts = portalSafeNum(isHome ? g.homePoints : g.awayPoints);
      var os = portalSafeNum(isHome ? g.awayPoints : g.homePoints);
      if (ts === null || os === null) return;
      if (ts > os) w += 1;
      else l += 1;
    });
    if (w + l > 0) rec = w + '-' + l;
  }

  var parts = [
    '<span class="pill">Team: <b>' + (teamName || '—') + '</b></span>',
    '<span class="pill">Record: <b>' + rec + '</b></span>',
    '<span class="pill">Roster pool: <b>' + ((roster || []).length) + '</b></span>',
  ];

  if (ratings) {
    parts.push('<span class="pill">AdjEM: <b>' + portalFmtNum(ratings.adjEM, 1) + '</b></span>');
    parts.push('<span class="pill">AdjO: <b>' + portalFmtNum(ratings.adjO, 1) + '</b></span>');
    parts.push('<span class="pill">AdjD: <b>' + portalFmtNum(ratings.adjD, 1) + '</b></span>');
    if (ratings.rank) parts.push('<span class="pill">Rank: <b>#' + ratings.rank + '</b></span>');
  }
  if (stats && stats.teamStats && stats.teamStats.fourFactors) {
    var ff = stats.teamStats.fourFactors;
    parts.push('<span class="pill">eFG%: <b>' + portalFmtNum(ff.effectiveFieldGoalPct, 1) + '</b></span>');
    parts.push('<span class="pill">TOV%: <b>' + portalFmtNum((ff.turnoverRatio || 0) * 100, 1) + '</b></span>');
  }
  return parts.join('');
}

function portalDetectDepartures(roster) {
  // Show the full roster as selectable targets — staff knows who's leaving
  // before it's official. No live portal cross-reference needed.
  var sorted = (roster || []).slice().sort(function (a, b) {
    var mpA = portalSafeNum(a.MP) || portalSafeNum(a.MP_num) || 0;
    var mpB = portalSafeNum(b.MP) || portalSafeNum(b.MP_num) || 0;
    if (mpB !== mpA) return mpB - mpA;
    var sA = portalSafeNum(a.Score) || portalSafeNum(a.PerfScore_calc) || 0;
    var sB = portalSafeNum(b.Score) || portalSafeNum(b.PerfScore_calc) || 0;
    return sB - sA;
  }).slice(0, 15);

  portalDetectedDepartures = sorted.map(function (r) { return { player: r }; });
  return portalDetectedDepartures;
}

function portalRenderDepartureCards(departures) {
  if (!portalReplaceListEl) return;
  portalReplaceListEl.innerHTML = '';
  if (!departures || !departures.length) {
    portalReplaceListEl.innerHTML = '<div class="muted" style="font-size:12px;padding:8px 4px">No roster data loaded for this team.</div>';
    return;
  }
  departures.forEach(function (dep) {
    var r = dep.player;
    var nm = portalGetPlayerName(r);
    var pos = r.Position || r.Pos || (typeof tbPosGroup === 'function' ? (tbPosGroup(r) === 'guard' ? 'G' : 'F/C') : '?');
    var score = portalSafeNum(r.Score) || portalSafeNum(r.PerfScore_calc);
    var card = document.createElement('div');
    card.className = 'portalDepartureCard' + (portalSelectedDepartureNames.indexOf(nm) >= 0 ? ' selected' : '');
    card.setAttribute('data-player-name', nm);
    card.innerHTML =
      '<div class="portalDepartureName">' + nm + '</div>' +
      '<div class="portalDepartureMeta">' + pos + (score !== null ? ' · Perf ' + portalFmtNum(score, 1) : '') + '</div>';
    card.addEventListener('click', function () {
      portalToggleDeparture(nm);
    });
    portalReplaceListEl.appendChild(card);
  });
}

function portalToggleDeparture(name) {
  if (!name) return;
  var idx = portalSelectedDepartureNames.indexOf(name);
  if (idx >= 0) {
    portalSelectedDepartureNames.splice(idx, 1);
  } else {
    portalSelectedDepartureNames.push(name);
  }
  // Update card selected states
  if (portalReplaceListEl) {
    portalReplaceListEl.querySelectorAll('.portalDepartureCard').forEach(function (c) {
      var cn = c.getAttribute('data-player-name');
      c.classList.toggle('selected', portalSelectedDepartureNames.indexOf(cn) >= 0);
    });
  }
  // Update context banner
  if (portalRecContextEl) {
    if (portalSelectedDepartureNames.length) {
      portalRecContextEl.style.display = '';
      portalRecContextEl.textContent = 'Finding upgrades to replace ' +
        portalSelectedDepartureNames.length + ' departure' +
        (portalSelectedDepartureNames.length > 1 ? 's' : '') + ': ' +
        portalSelectedDepartureNames.join(', ');
    } else {
      portalRecContextEl.style.display = 'none';
    }
  }
  // Rerun recommendations
  if (portalTeamCtx && portalTeamCtx.roster && portalTeamCtx.roster.length) {
    var players = portalCollectAllMbbPlayers();
    portalRecDist = portalBuildDistributions(players);
    portalComputeRecommendations();
    portalRenderRecommendations();
  }
}

function portalShowToast(msg) {
  var t = document.createElement('div');
  t.className = 'portalToast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.classList.add('show'); }, 10);
  setTimeout(function () {
    t.classList.remove('show');
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
  }, 2400);
}

function portalUserStorageKey(suffix) {
  var user = 'guest';
  try {
    if (typeof authIsGuest === 'function' && !authIsGuest() && typeof authGetUser === 'function') {
      user = authGetUser() || user;
    }
  } catch (_) {}
  user = String(user || 'guest').toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  return 'portal_' + suffix + '_' + user;
}

function portalSeenAlertsMap() {
  try {
    var raw = localStorage.getItem(portalUserStorageKey('watch_alerts_seen')) || '{}';
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function portalSaveSeenAlertsMap(map) {
  try {
    localStorage.setItem(portalUserStorageKey('watch_alerts_seen'), JSON.stringify(map || {}));
  } catch (_) {}
}

function portalEntryKey(it) {
  return [
    portalNorm(it && it.playerName),
    portalNorm(it && it.fromTeam),
    portalNorm(it && it.status),
    portalNorm(it && it.source),
  ].join('|');
}

function portalAlertDomId(key) {
  return 'portal-entry-' + String(key || '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function portalFavoritePortalMatch(fav) {
  if (!fav) return null;
  var favKey = String(fav.player_key || '');
  var favName = portalNorm(fav.player_name || '');
  var favTeam = portalNorm(fav.team || '');

  for (var i = 0; i < portalItems.length; i++) {
    var entry = portalItems[i];
    var match = portalFindPlayerMatch(entry.playerName);
    if (match && typeof tbPlayerKey === 'function' && tbPlayerKey(match) === favKey) {
      return { entry: entry, player: match };
    }
    var entryName = portalNorm(entry && entry.playerName);
    var entryTeam = portalNorm(entry && entry.fromTeam);
    if (favName && entryName === favName && (!favTeam || !entryTeam || favTeam === entryTeam)) {
      return { entry: entry, player: match };
    }
  }
  return null;
}

function portalBuildWatchAlerts() {
  var favs = (typeof favsState !== 'undefined' && favsState && Array.isArray(favsState.favorites))
    ? favsState.favorites
    : [];
  var alerts = [];
  favs.forEach(function (fav) {
    if (String(fav.league || 'MBB') !== 'MBB') return;
    var matched = portalFavoritePortalMatch(fav);
    if (!matched || !matched.entry) return;
    alerts.push({
      key: portalEntryKey(matched.entry),
      favorite: fav,
      entry: matched.entry,
      player: matched.player || null,
    });
  });
  alerts.sort(function (a, b) {
    var da = Date.parse((a.entry && a.entry.date) || '') || 0;
    var db = Date.parse((b.entry && b.entry.date) || '') || 0;
    if (db !== da) return db - da;
    return String((a.favorite && a.favorite.player_name) || '').localeCompare(String((b.favorite && b.favorite.player_name) || ''));
  });
  return alerts;
}

function portalAlertMarkup(alerts, opts) {
  opts = opts || {};
  var title = opts.title || 'Watchlist hit';
  var emptyText = opts.emptyText || '';
  var maxItems = opts.maxItems || alerts.length || 3;
  if (!alerts.length) return emptyText ? ('<div class="muted" style="font-size:12px">' + emptyText + '</div>') : '';
  var count = alerts.length;
  var label = count === 1 ? 'player from your watchlist is now in the portal.' : 'players from your watchlist are now in the portal.';
  var html = '<div class="portalWatchAlert">' +
    '<div class="portalWatchAlertHeader">' +
      '<div>' +
        '<div class="portalWatchAlertTitle">' + portalEsc(title) + '</div>' +
        '<div class="portalWatchAlertText">' + portalEsc(count + ' ' + label) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="portalWatchAlertList">';
  alerts.slice(0, maxItems).forEach(function (alert) {
    var fav = alert.favorite || {};
    var entry = alert.entry || {};
    html += '<span class="portalWatchAlertItem">' +
      '<b>' + portalEsc(fav.player_name || entry.playerName || 'Player') + '</b>' +
      '<span class="portalWatchAlertMeta">' + portalEsc((entry.status || 'Entered') + ' • ' + (entry.fromTeam || fav.team || '—')) + '</span>' +
      '<button class="portalWatchAlertBtn" data-portal-open="' + portalEsc(alert.key) + '">Open</button>' +
    '</span>';
  });
  html += '</div>';
  if (count > maxItems) {
    html += '<div class="portalWatchAlertText" style="margin-top:10px">' + portalEsc('+' + (count - maxItems) + ' more watched player' + (count - maxItems === 1 ? '' : 's') + ' currently in the portal.') + '</div>';
  }
  html += '</div>';
  return html;
}

function portalOpenAlert(alertKey) {
  if (!alertKey) return;
  var alert = portalWatchAlerts.find(function (it) { return it.key === alertKey; });
  if (!alert) return;

  var entryId = portalAlertDomId(alertKey);
  var row = document.getElementById(entryId);
  if (row) {
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('portalRowFlash');
    setTimeout(function () { row.classList.remove('portalRowFlash'); }, 1600);
  }

  if (alert.player && typeof openProfile === 'function') {
    openProfile(alert.player);
    return;
  }

  if (alert.entry && alert.entry.url) {
    window.open(alert.entry.url, '_blank', 'noopener,noreferrer');
  }
}

function portalWireAlertActions(root) {
  if (!root) return;
  root.querySelectorAll('[data-portal-open]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var key = btn.getAttribute('data-portal-open') || '';
      portalOpenAlert(key);
    });
  });
}

function portalRenderWatchAlerts() {
  var activeAlerts = portalWatchAlerts.filter(function (alert) {
    return portalFiltered.some(function (entry) { return portalEntryKey(entry) === alert.key; });
  });
  if (portalWatchAlertWrapEl) {
    if (activeAlerts.length) {
      portalWatchAlertWrapEl.style.display = '';
      portalWatchAlertWrapEl.innerHTML = portalAlertMarkup(activeAlerts, {
        title: 'Watchlist Portal Hits',
        maxItems: 4
      });
      portalWireAlertActions(portalWatchAlertWrapEl);
    } else {
      portalWatchAlertWrapEl.style.display = 'none';
      portalWatchAlertWrapEl.innerHTML = '';
    }
  }
  if (favsPortalAlertWrapEl) {
    if (portalWatchAlerts.length) {
      favsPortalAlertWrapEl.className = 'favsPortalAlertWrap';
      favsPortalAlertWrapEl.style.display = '';
      favsPortalAlertWrapEl.innerHTML = portalAlertMarkup(portalWatchAlerts, {
        title: 'Tracked Players Now In The Portal',
        maxItems: 6
      });
      portalWireAlertActions(favsPortalAlertWrapEl);
    } else {
      favsPortalAlertWrapEl.style.display = 'none';
      favsPortalAlertWrapEl.innerHTML = '';
    }
  }
  if (favsPortalBadgeEl) {
    favsPortalBadgeEl.textContent = String(portalWatchAlerts.length);
    favsPortalBadgeEl.style.display = portalWatchAlerts.length ? '' : 'none';
  }
}

function portalRefreshWatchAlerts() {
  portalWatchAlerts = portalBuildWatchAlerts();
  portalRenderWatchAlerts();
  return portalWatchAlerts;
}

function portalNotifyNewWatchAlerts() {
  var seen = portalSeenAlertsMap();
  var unseen = portalWatchAlerts.filter(function (alert) {
    return !seen[alert.key];
  });
  if (!unseen.length) return;
  unseen.forEach(function (alert) {
    seen[alert.key] = {
      player: (alert.favorite && alert.favorite.player_name) || (alert.entry && alert.entry.playerName) || '',
      seen_at: new Date().toISOString(),
    };
  });
  portalSaveSeenAlertsMap(seen);
  if (unseen.length === 1) {
    portalShowToast((unseen[0].favorite.player_name || unseen[0].entry.playerName || 'Watched player') + ' is now in the transfer portal');
  } else {
    portalShowToast(unseen.length + ' watched players are now in the transfer portal');
  }
}

async function portalLoadTeamContext(teamName) {
  if (!teamName) {
    portalTeamCtx = null;
    if (portalRecTeamSummaryEl) portalRecTeamSummaryEl.innerHTML = '<span class="muted">Select a team to load profile.</span>';
    if (portalReplaceListEl) portalReplaceListEl.innerHTML = '';
    return null;
  }

  var season = portalGetSeason();
  portalTargetSeason = season;
  if (portalRecTeamSummaryEl) portalRecTeamSummaryEl.innerHTML = '<span class="muted">Loading team profile...</span>';

  var ratings = null;
  if (typeof teamRatings !== 'undefined' && teamRatings) {
    ratings = teamRatings[teamName.toLowerCase()] || null;
  }

  var stats = null;
  var games = null;
  var zones = null;
  try {
    if (typeof loadTeamStats === 'function') stats = await loadTeamStats(teamName, season);
  } catch (_) {}
  try {
    if (typeof loadGamesForTeam === 'function') games = await loadGamesForTeam(teamName, season);
  } catch (_) {}
  try {
    if (typeof loadTeamShootingZones === 'function') zones = await loadTeamShootingZones(teamName, season);
  } catch (_) {}

  var roster = (portalAllMbbPlayers || []).filter(function (p) {
    return portalNorm(portalGetPlayerTeam(p)) === portalNorm(teamName);
  });

  // If no roster found, try to collect players again (in case they loaded after team dropdown was built)
  if (!roster.length && portalGetAllPlayers) {
    portalCollectAllMbbPlayers();
    roster = (portalAllMbbPlayers || []).filter(function (p) {
      return portalNorm(portalGetPlayerTeam(p)) === portalNorm(teamName);
    });
  }

  portalTeamCtx = {
    team: teamName,
    season: season,
    ratings: ratings,
    stats: stats,
    games: games,
    zones: zones,
    roster: roster,
  };

  if (portalRecTeamSummaryEl) portalRecTeamSummaryEl.innerHTML = portalBuildTeamSummary(teamName, ratings, stats, games, roster);
  portalSelectedDepartureNames = [];
  if (portalRecContextEl) portalRecContextEl.style.display = 'none';
  portalDetectDepartures(roster);
  portalRenderDepartureCards(portalDetectedDepartures);
  return portalTeamCtx;
}

function portalCandidateImpact(player, dist) {
  var p = portalSafeNum(player.Score);
  if (p === null) p = portalSafeNum(player.PerfScore_calc);
  if (p === null) return 0.45;
  var pct = portalStatPercentile('Score', p, dist);
  if (pct === null) pct = portalStatPercentile('PerfScore_calc', p, dist);
  return pct === null ? 0.45 : pct;
}

function portalCandidateRisk(player) {
  var flags = [];
  var mp = portalSafeNum(player.MP) || portalSafeNum(player.MP_num);
  var topg = portalSafeNum(player.TOPG);
  var ft = portalSafeNum(player['FT%']);
  if (mp !== null && mp < 15) flags.push('low-minute sample');
  if (topg !== null && topg > 2.8) flags.push('turnover risk');
  if (ft !== null && ft < 65) flags.push('FT variance');
  return flags;
}

function portalComputeRecommendations() {
  if (!portalTeamCtx || !portalTeamCtx.roster || !portalTeamCtx.roster.length) {
    portalRecRows = [];
    return [];
  }

  var removedNames = portalSelectedReplaceNames();
  var removedSet = {};
  removedNames.forEach(function (n) { removedSet[portalNorm(n)] = true; });

  var baseRoster = portalTeamCtx.roster.filter(function (p) {
    return !removedSet[portalNorm(portalGetPlayerName(p))];
  });
  if (!baseRoster.length) baseRoster = portalTeamCtx.roster.slice();

  var defs = portalCategoryDefsForRoster(baseRoster);
  var catBase = portalCategoryScoresForRoster(baseRoster, defs, portalRecDist);
  var catRemoved = removedNames.length
    ? portalCategoryScoresForRoster(portalTeamCtx.roster.filter(function (p) { return removedSet[portalNorm(portalGetPlayerName(p))]; }), defs, portalRecDist)
    : null;
  var priority = portalCategoryPriorityFromTeamStats(portalTeamCtx.stats);

  var rows = [];
  portalFiltered.forEach(function (entry) {
    var m = portalFindPlayerMatch(entry.playerName);
    if (!m) return;
    var playerTeam = portalNorm(portalGetPlayerTeam(m));
    if (playerTeam === portalNorm(portalTeamCtx.team)) return;

    var catPlayer = portalCategoryScoresForPlayer(m, defs, portalRecDist);
    var needNum = 0;
    var needDen = 0;
    var reasonPool = [];
    defs.forEach(function (cat) {
      var b = catBase[cat.label];
      var c = catPlayer[cat.label];
      var baseNeed = Math.max(0.05, 1 - (Number.isFinite(b) ? b : 0.5));
      var w = baseNeed * (priority[cat.label] || 1);
      var contrib = w * (Number.isFinite(c) ? c : 0.5);
      needNum += contrib;
      needDen += w;
      reasonPool.push({
        label: cat.label,
        contrib: contrib,
        cand: c,
        need: baseNeed,
      });
    });

    var needFit = needDen > 0 ? (needNum / needDen) : 0.5;
    var impact = portalCandidateImpact(m, portalRecDist);
    var replaceGain = null;
    if (catRemoved) {
      var rgNum = 0;
      var rgDen = 0;
      defs.forEach(function (cat) {
        var c = catPlayer[cat.label];
        var r = catRemoved[cat.label];
        var wt = priority[cat.label] || 1;
        rgNum += wt * ((Number.isFinite(c) ? c : 0.5) - (Number.isFinite(r) ? r : 0.5));
        rgDen += wt;
      });
      replaceGain = rgDen > 0 ? (rgNum / rgDen) : 0;
    }

    var style = 0.5;
    if (portalTeamCtx.zones && portalTeamCtx.zones.attemptsBreakdown) {
      var threeShare = portalSafeNum(portalTeamCtx.zones.attemptsBreakdown.threePointJumpers);
      var shooter = portalSafeNum(m['3P%']);
      if (threeShare !== null && shooter !== null) {
        style = (threeShare >= 35 && shooter >= 35) ? 0.72 : (threeShare < 30 && shooter >= 35 ? 0.62 : 0.5);
      }
    }

    var final = 0.45 * needFit + 0.25 * style + 0.20 * impact + 0.10 * 0.55;
    if (replaceGain !== null) final += 0.20 * replaceGain;

    var risks = portalCandidateRisk(m);
    if (risks.length) final -= Math.min(0.12, 0.03 * risks.length);

    reasonPool.sort(function (a, b) { return b.contrib - a.contrib; });
    var reasons = reasonPool.slice(0, 3).map(function (x) {
      return x.label + ' (' + Math.round((x.cand || 0) * 100) + 'th pct)';
    });

    rows.push({
      entry: entry,
      player: m,
      fit: final,
      needFit: needFit,
      style: style,
      impact: impact,
      replaceGain: replaceGain,
      reasons: reasons,
      risks: risks,
    });
  });

  rows.sort(function (a, b) { return b.fit - a.fit; });
  portalRecRows = rows.slice(0, 25);
  return portalRecRows;
}

function portalRenderRecommendations() {
  if (!portalRecBodyEl) return;
  portalRecBodyEl.innerHTML = '';

  if (!portalRecRows.length) {
    if (portalRecEmptyEl) portalRecEmptyEl.style.display = '';
    return;
  }
  if (portalRecEmptyEl) portalRecEmptyEl.style.display = 'none';

  portalRecRows.forEach(function (row, idx) {
    var tr = document.createElement('tr');
    var nm = row.entry.playerName || portalGetPlayerName(row.player) || 'Unknown';
    var team = row.entry.fromTeam || portalGetPlayerTeam(row.player) || '—';
    var fitPct = Math.max(0, Math.min(100, Math.round(row.fit * 100)));
    var gainTxt = row.replaceGain === null ? '—' : ((row.replaceGain >= 0 ? '+' : '') + Math.round(row.replaceGain * 100) + ' pts');
    var perf = portalSafeNum(row.player.Score) || portalSafeNum(row.player.PerfScore_calc);
    var addDisabled = typeof tbAddPlayer !== 'function';

    tr.innerHTML =
      '<td>' + (idx + 1) + '</td>' +
      '<td><b>' + nm + '</b><div class="muted" style="font-size:10px">Perf ' + (perf === null ? '—' : portalFmtNum(perf, 1)) + '</div></td>' +
      '<td>' + team + '</td>' +
      '<td>' + (row.entry.position || row.player.Position || row.player.Pos || '—') + '</td>' +
      '<td><span class="portalFitPill">' + fitPct + '</span></td>' +
      '<td>' + gainTxt + '</td>' +
      '<td><div style="font-size:11px">' + row.reasons.join(' · ') + '</div>' +
      (row.risks.length ? ('<div class="portalRiskText">Risk: ' + row.risks.join(', ') + '</div>') : '') + '</td>' +
      '<td><div style="display:flex;gap:6px;flex-wrap:wrap">' +
      '<button class="tbAddBtn portalRecAdd" ' + (addDisabled ? 'disabled' : '') + '>+ Add</button>' +
      '<button class="secondary portalRecOpen" style="padding:3px 8px;font-size:10px">Open</button>' +
      '</div></td>';

    var btnAdd = tr.querySelector('.portalRecAdd');
    if (btnAdd) {
      btnAdd.addEventListener('click', function () {
        if (typeof tbAddPlayer === 'function') {
          tbAddPlayer(row.player);
          var nm = row.entry.playerName || portalGetPlayerName(row.player) || 'Player';
          portalShowToast(nm + ' added to Team Builder');
        }
      });
    }
    var btnOpen = tr.querySelector('.portalRecOpen');
    if (btnOpen) {
      btnOpen.addEventListener('click', function () {
        if (typeof openProfile === 'function') openProfile(row.player);
      });
    }
    portalRecBodyEl.appendChild(tr);
  });
}

function portalBuildAIContext(topN) {
  var picks = (portalRecRows || []).slice(0, topN || 8).map(function (r, idx) {
    var p = r.player || {};
    return {
      rank: idx + 1,
      player: r.entry.playerName || portalGetPlayerName(p),
      sourceTeam: r.entry.fromTeam || portalGetPlayerTeam(p),
      position: r.entry.position || p.Position || p.Pos || null,
      fitScore: Math.round((r.fit || 0) * 100),
      replaceGainPts: r.replaceGain == null ? null : Math.round(r.replaceGain * 100),
      reasons: r.reasons,
      risks: r.risks,
      stats: {
        perf: portalSafeNum(p.Score) || portalSafeNum(p.PerfScore_calc),
        ppg: portalSafeNum(p.PPG),
        efg: portalSafeNum(p['eFG%']),
        threePct: portalSafeNum(p['3P%']),
        apg: portalSafeNum(p.APG),
        ato: portalSafeNum(p['A/TO']),
        drtg: portalSafeNum(p.DRtg),
        orp: portalSafeNum(p['OR%']),
        drp: portalSafeNum(p['DR%']),
        bpm: portalSafeNum(p.BPM),
        ws40: portalSafeNum(p['WS/40'])
      }
    };
  });

  var removed = portalSelectedReplaceNames();
  var gameSample = [];
  if (portalTeamCtx && portalTeamCtx.games && Array.isArray(portalTeamCtx.games.games)) {
    var tn = portalNorm(portalTeamCtx.team);
    gameSample = portalTeamCtx.games.games.slice(0, 8).map(function (g) {
      var hn = portalNorm(g.homeTeam || '');
      var isHome = hn === tn;
      return {
        opponent: isHome ? g.awayTeam : g.homeTeam,
        teamPoints: isHome ? g.homePoints : g.awayPoints,
        oppPoints: isHome ? g.awayPoints : g.homePoints,
        date: g.date || null,
      };
    });
  }

  return {
    team: portalTeamCtx ? portalTeamCtx.team : null,
    season: portalTeamCtx ? portalTeamCtx.season : portalTargetSeason,
    mode: portalSelectedDepartureNames.length ? 'replace' : 'fit',
    replacingPlayers: portalSelectedDepartureNames.slice(),
    removedPlayers: removed,
    teamRatings: portalTeamCtx ? portalTeamCtx.ratings : null,
    teamStats: portalTeamCtx ? portalTeamCtx.stats : null,
    teamShotProfile: portalTeamCtx ? portalTeamCtx.zones : null,
    recentGames: gameSample,
    recommendations: picks,
  };
}

function portalBuildReportFileName() {
  var team = portalTeamCtx && portalTeamCtx.team ? portalTeamCtx.team : 'team';
  var season = portalTeamCtx && portalTeamCtx.season ? portalTeamCtx.season : portalTargetSeason;
  var safe = (team + '_portal_fit_' + season)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safe + '.pdf';
}

async function portalDownloadAIReport() {
  var reportText = (portalLastAIReportText || '').trim();
  if (!reportText && portalAIOutputEl) reportText = (portalAIOutputEl.innerText || '').trim();
  if (!reportText) {
    portalSetAIStatus('Run Analyze picks first to generate a report.');
    return;
  }

  var teamName = (portalTeamCtx && portalTeamCtx.team ? portalTeamCtx.team : 'Team');
  var season = (portalTeamCtx && portalTeamCtx.season ? portalTeamCtx.season : portalTargetSeason);
  var mode = portalSelectedDepartureNames.length
    ? 'Replacing ' + portalSelectedDepartureNames.join(', ')
    : 'Team Fit Mode';
  var dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  try {
    await portalEnsureJsPdf();
  } catch (e) {
    portalSetAIStatus('PDF export unavailable right now.');
    if (typeof showWarn === 'function') showWarn('PDF export failed: ' + (e && e.message ? e.message : e));
    return;
  }

  if (window.jspdf && window.jspdf.jsPDF) {
    var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var margin = 50;
    var contentW = pageW - margin * 2;
    var pageNum = 1;

    function addFooter() {
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(155, 155, 165);
      doc.text('NCAA Scouting Dashboard  ·  Transfer Portal Fit Analysis  ·  ' + dateStr, margin, pageH - 22);
      doc.text('Page ' + pageNum, pageW - margin, pageH - 22, { align: 'right' });
      doc.setDrawColor(210, 215, 228);
      doc.setLineWidth(0.4);
      doc.line(margin, pageH - 32, pageW - margin, pageH - 32);
      doc.setTextColor(0, 0, 0);
    }

    // — Cover header block (navy, taller, with date + mode) —
    doc.setFillColor(15, 30, 60);
    doc.rect(0, 0, pageW, 128, 'F');
    doc.setFillColor(255, 210, 0);
    doc.rect(0, 128, pageW, 3, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('Transfer Portal Fit Report', margin, 46);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(190, 207, 235);
    doc.text(teamName + '  ·  Season ' + season + '  ·  ' + mode, margin, 72);

    doc.setFontSize(9.5);
    doc.setTextColor(130, 150, 185);
    doc.text('Generated ' + dateStr, margin, 98);

    doc.setTextColor(0, 0, 0);
    var y = 148;
    addFooter();

    // Helper: check page overflow, add new page with mini header
    function checkPage(needed) {
      needed = needed || 18;
      if (y + needed > pageH - 46) {
        addFooter();
        doc.addPage();
        pageNum++;
        // Mini continuation header
        doc.setFillColor(15, 30, 60);
        doc.rect(0, 0, pageW, 28, 'F');
        doc.setFillColor(255, 210, 0);
        doc.rect(0, 28, pageW, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(195, 210, 235);
        doc.text('Transfer Portal Fit Report  ·  ' + teamName + '  ·  Season ' + season, margin, 19);
        doc.setTextColor(0, 0, 0);
        y = 46;
        addFooter();
      }
    }

    // — Render markdown lines —
    var lines = reportText.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // Section header ##
      if (/^##\s+/.test(line)) {
        checkPage(34);
        y += 8;
        var hText = line.replace(/^##\s+/, '');
        // Navy/gold themed band
        doc.setFillColor(238, 242, 252);
        doc.rect(margin, y - 14, contentW, 26, 'F');
        doc.setFillColor(255, 210, 0);
        doc.rect(margin, y - 14, 4, 26, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(15, 30, 60);
        doc.text(hText, margin + 12, y + 4);
        doc.setTextColor(0, 0, 0);
        y += 22;
        continue;
      }

      // Sub-header ###
      if (/^###\s+/.test(line)) {
        checkPage(22);
        y += 5;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(30, 45, 85);
        doc.text(line.replace(/^###\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1'), margin + 6, y);
        doc.setTextColor(0, 0, 0);
        y += 16;
        continue;
      }

      // Bullet  -  *  •
      if (/^[-*•]\s+/.test(line)) {
        var bText = line.replace(/^[-*•]\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
        var bWrapped = doc.splitTextToSize(bText, contentW - 20);
        checkPage(bWrapped.length * 14 + 4);
        doc.setFillColor(255, 210, 0);
        doc.circle(margin + 6, y - 3.5, 2, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(40, 48, 68);
        for (var bw = 0; bw < bWrapped.length; bw++) {
          doc.text(bWrapped[bw], margin + 16, y);
          y += 14;
        }
        y += 2;
        doc.setTextColor(0, 0, 0);
        continue;
      }

      // Numbered list  1.  2.
      if (/^\d+\.\s+/.test(line)) {
        var nm = line.match(/^(\d+)\.\s+(.*)/);
        var numLabel = nm ? nm[1] + '.' : '';
        var numText  = (nm ? nm[2] : line).replace(/\*\*([^*]+)\*\*/g, '$1');
        var nWrapped = doc.splitTextToSize(numText, contentW - 24);
        checkPage(nWrapped.length * 14 + 4);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(200, 140, 0);
        doc.text(numLabel, margin + 4, y);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 48, 68);
        for (var nw = 0; nw < nWrapped.length; nw++) {
          doc.text(nWrapped[nw], margin + 22, y);
          y += 14;
        }
        y += 2;
        doc.setTextColor(0, 0, 0);
        continue;
      }

      // Empty line
      if (!line.trim()) { y += 6; continue; }

      // Regular paragraph
      var cleanLine = line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
      var pWrapped = doc.splitTextToSize(cleanLine, contentW);
      checkPage(pWrapped.length * 14 + 2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(40, 48, 68);
      for (var pw = 0; pw < pWrapped.length; pw++) {
        doc.text(pWrapped[pw], margin, y);
        y += 14;
      }
      y += 2;
      doc.setTextColor(0, 0, 0);
    }

    var blobUrl = doc.output('bloburl');
    window.open(blobUrl, '_blank');
    portalSetAIStatus('Report opened in new tab — use your browser\'s download button to save.');
    return;
  }

  // — Fallback: styled print window —
  var w = window.open('', '_blank');
  if (!w) { portalSetAIStatus('Popup blocked. Allow popups to export PDF.'); return; }
  var htmlBody = reportText
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^##\s+(.*)$/gm, '</p><h3>$1</h3><p>')
    .replace(/^###\s+(.*)$/gm, '</p><h4>$1</h4><p>')
    .replace(/^[-*•]\s+(.*)$/gm, '<li>$1</li>')
    .replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p>');
  w.document.write('<!doctype html><html><head><title>Transfer Portal Fit Report</title><style>' +
    'body{font-family:system-ui,Arial,sans-serif;margin:0;color:#222;}' +
    '.hdr{background:#0f1e3c;color:#fff;padding:28px 40px 22px;}' +
    '.hdr h1{margin:0 0 6px;font-size:22px;font-weight:700;}' +
    '.hdr .meta{margin:0;color:#bccce0;font-size:13px;}' +
    '.hdr .date{margin:4px 0 0;color:#8a9dbf;font-size:11px;}' +
    '.accent{height:3px;background:#ffd200;}' +
    '.body{padding:28px 40px;}' +
    'h3{background:#eef2fc;border-left:4px solid #ffd200;color:#0f1e3c;padding:9px 12px 9px 14px;margin:24px 0 10px;font-size:14px;}' +
    'h4{color:#1e2d5a;margin-top:16px;font-size:12.5px;}' +
    'li{margin:5px 0 5px 20px;line-height:1.6;font-size:13px;}' +
    'p{font-size:13px;line-height:1.65;margin:8px 0;}' +
    '@media print{body{margin:0;}.hdr,.accent{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}' +
    '</style></head><body>' +
    '<div class="hdr"><h1>Transfer Portal Fit Report</h1>' +
    '<p class="meta">' + teamName + ' &nbsp;·&nbsp; Season ' + season + ' &nbsp;·&nbsp; ' + mode + '</p>' +
    '<p class="date">Generated ' + dateStr + '</p></div>' +
    '<div class="accent"></div>' +
    '<div class="body"><p>' + htmlBody + '</p></div>' +
    '</body></html>');
  w.document.close();
  w.focus();
  w.print();
  portalSetAIStatus('Print dialog opened. Choose Save as PDF.');
}

async function portalRunAIAnalysis() {
  if (!portalRecRows.length || !portalTeamCtx) {
    portalSetAIStatus('Run recommendations first.');
    return;
  }
  if (!portalAIOutputEl) return;

  portalAIAnalyzeBtn.disabled = true;
  if (portalAIDownloadBtn) portalAIDownloadBtn.disabled = true;
  portalAIOutputEl.style.display = 'block';

  var teamName = portalTeamCtx.team;
  var season = portalTeamCtx.season || portalTargetSeason;
  var departures = portalSelectedDepartureNames.slice();
  var topPicks = (portalRecRows || []).slice(0, 8);

  // ── Phase 1: Fetch CBD API data for deep analysis ──
  portalSetAIStatus('Fetching shooting data for ' + teamName + '...');
  portalAIOutputEl.innerHTML = '<div class="thDeepLoading"><span class="thDeepSpinner"></span> Gathering advanced data from CBD API...</div>';

  var teamShooting = [];
  var picksShooting = {};
  var gameLog = [];

  // Fetch per-player shooting breakdown for the team
  try {
    if (typeof loadShootingForTeam === 'function') {
      teamShooting = await loadShootingForTeam(teamName, season) || [];
    }
  } catch (_) {}

  // Fetch shooting data for top recommended players' teams (dedupe teams)
  var pickTeams = {};
  topPicks.forEach(function (row) {
    var t = row.entry.fromTeam || portalGetPlayerTeam(row.player) || '';
    if (t && !pickTeams[t]) pickTeams[t] = true;
  });
  var pickTeamKeys = Object.keys(pickTeams);

  portalSetAIStatus('Fetching shooting data for ' + pickTeamKeys.length + ' source team(s)...');
  for (var ti = 0; ti < pickTeamKeys.length; ti++) {
    try {
      if (typeof loadShootingForTeam === 'function') {
        var psd = await loadShootingForTeam(pickTeamKeys[ti], season);
        if (psd && psd.length) picksShooting[pickTeamKeys[ti]] = psd;
      }
    } catch (_) {}
  }

  // Get game log (already cached from team context)
  if (portalTeamCtx.games && Array.isArray(portalTeamCtx.games.games)) {
    var tn = portalNorm(teamName);
    gameLog = portalTeamCtx.games.games.slice(0, 12).map(function (g) {
      var hn = portalNorm(g.homeTeam || '');
      var isHome = hn === tn;
      return {
        date: g.date || null,
        opponent: isHome ? g.awayTeam : g.homeTeam,
        teamPoints: isHome ? g.homePoints : g.awayPoints,
        oppPoints: isHome ? g.awayPoints : g.homePoints,
        result: (isHome ? g.homePoints : g.awayPoints) > (isHome ? g.awayPoints : g.homePoints) ? 'W' : 'L',
      };
    });
  }

  // ── Build departing player profiles ──
  var departureProfiles = departures.map(function (nm) {
    var rosterP = (portalTeamCtx.roster || []).find(function (r) {
      return portalGetPlayerName(r) === nm;
    });
    var shootingP = teamShooting.find(function (s) {
      return portalNorm(s.name || s.playerName || '') === portalNorm(nm);
    });

    var profile = { name: nm };
    if (rosterP) {
      profile.position = rosterP.Position || rosterP.Pos || null;
      profile.stats = {
        ppg: portalSafeNum(rosterP.PPG), rpg: portalSafeNum(rosterP.RPG),
        apg: portalSafeNum(rosterP.APG), spg: portalSafeNum(rosterP.SPG),
        bpg: portalSafeNum(rosterP.BPG), mp: portalSafeNum(rosterP.MP),
        efg: portalSafeNum(rosterP['eFG%']), threePct: portalSafeNum(rosterP['3P%']),
        ftPct: portalSafeNum(rosterP['FT%']), topg: portalSafeNum(rosterP.TOPG),
        bpm: portalSafeNum(rosterP.BPM), drtg: portalSafeNum(rosterP.DRtg),
        ws40: portalSafeNum(rosterP['WS/40']), usg: portalSafeNum(rosterP['USG%']),
        orPct: portalSafeNum(rosterP['OR%']), drPct: portalSafeNum(rosterP['DR%']),
        perf: portalSafeNum(rosterP.Score) || portalSafeNum(rosterP.PerfScore_calc),
      };
    }
    if (shootingP) {
      profile.shooting = shootingP;
    }
    return profile;
  });

  // ── Build recommended player profiles with shooting ──
  var recommendedProfiles = topPicks.map(function (row) {
    var p = row.player || {};
    var recTeam = row.entry.fromTeam || portalGetPlayerTeam(p) || '';
    var recShooting = (picksShooting[recTeam] || []).find(function (s) {
      return portalNorm(s.name || s.playerName || '') === portalNorm(row.entry.playerName || portalGetPlayerName(p));
    });

    return {
      rank: 0,
      name: row.entry.playerName || portalGetPlayerName(p),
      sourceTeam: recTeam,
      position: row.entry.position || p.Position || p.Pos || null,
      fitScore: Math.round((row.fit || 0) * 100),
      replaceGainPts: row.replaceGain == null ? null : Math.round(row.replaceGain * 100),
      reasons: row.reasons,
      risks: row.risks,
      stats: {
        ppg: portalSafeNum(p.PPG), rpg: portalSafeNum(p.RPG),
        apg: portalSafeNum(p.APG), spg: portalSafeNum(p.SPG),
        bpg: portalSafeNum(p.BPG), mp: portalSafeNum(p.MP),
        efg: portalSafeNum(p['eFG%']), threePct: portalSafeNum(p['3P%']),
        ftPct: portalSafeNum(p['FT%']), topg: portalSafeNum(p.TOPG),
        bpm: portalSafeNum(p.BPM), drtg: portalSafeNum(p.DRtg),
        ws40: portalSafeNum(p['WS/40']), usg: portalSafeNum(p['USG%']),
        orPct: portalSafeNum(p['OR%']), drPct: portalSafeNum(p['DR%']),
        perf: portalSafeNum(p.Score) || portalSafeNum(p.PerfScore_calc),
      },
      shooting: recShooting || null,
    };
  });
  recommendedProfiles.forEach(function (r, i) { r.rank = i + 1; });

  // ── Phase 2: Build deep analysis context ──
  portalSetAIStatus('Running deep analysis with Gemini...');
  portalAIOutputEl.innerHTML = '<div class="thDeepLoading"><span class="thDeepSpinner"></span> Analyzing ' +
    departures.length + ' departure' + (departures.length !== 1 ? 's' : '') +
    ' and ' + recommendedProfiles.length + ' replacement candidates...</div>';

  var deepCtx = {
    team: teamName,
    season: season,
    teamRatings: portalTeamCtx.ratings || null,
    teamStats: portalTeamCtx.stats || null,
    teamShotProfile: portalTeamCtx.zones || null,
    recentGames: gameLog,
    departures: departureProfiles,
    recommendations: recommendedProfiles,
  };

  var prompt =
    'You are an elite college basketball roster strategist and transfer portal analyst. ' +
    'Analyze the following team situation in depth using ALL the structured data provided.\n\n' +
    '## Context\n' +
    '**' + teamName + '** (' + season + ' season) has ' + departures.length +
    ' player' + (departures.length !== 1 ? 's' : '') + ' departing via the transfer portal. ' +
    'Your job is to evaluate the top ' + recommendedProfiles.length + ' portal replacement candidates.\n\n' +
    '## Instructions\n' +
    '- For EACH departing player, analyze what the team loses statistically (points, shooting, rebounds, defense, playmaking) using their per-game stats AND shot zone data when available.\n' +
    '- For EACH recommended replacement, explain specifically WHY they are a good fit by comparing their stats and shooting profile against what was lost.\n' +
    '- Consider team-level four factors (eFG%, TOV%, ORB%, FTR) and identify which departures hurt which factors.\n' +
    '- Recommend which replacement best fills EACH departing player\'s role. If one replacement can cover gaps from multiple departures, say so.\n' +
    '- Give a practical priority order: who to pursue first and why.\n' +
    '- Flag any risks (low-minute sample, turnover-prone, FT issues, style mismatch).\n\n' +
    'Return detailed markdown with these sections:\n' +
    '## What You Lose (per departure)\n' +
    '## Best Replacement Matches (who replaces whom and why)\n' +
    '## Combined Impact (net team improvement or regression)\n' +
    '## Recruitment Priority (ordered action plan)\n' +
    '## Risks & Watchouts\n\n' +
    '```json\n' + JSON.stringify(deepCtx, null, 2) + '\n```';

  try {
    var res = await fetch(PORTAL_GEMINI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: PORTAL_GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 4500 },
      })
    });
    var data = await res.json();
    if (!res.ok || data.error) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
    var text = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
      .map(function (p) { return p.text || ''; })
      .join('')
      .trim();
    if (!text) throw new Error('Empty AI response');
    portalLastAIReportText = text;
    portalSetAIStatus('Done — analyzed ' + departures.length + ' departure(s) with shooting + game data');
    portalAIOutputEl.innerHTML = '<div class="portalAIMarkdown">' +
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/^##\s+(.*)$/gm, '<h4>$1</h4>')
        .replace(/^###\s+(.*)$/gm, '<h5 style="margin:8px 0 4px;font-size:12px;color:var(--accent)">$1</h5>')
        .replace(/^[-*]\s+(.*)$/gm, '<div class="portalAIBullet">• $1</div>')
        .replace(/^(\d+)\.\s+(.*)$/gm, '<div class="portalAIBullet"><b>$1.</b> $2</div>')
        .replace(/\n{2,}/g, '<br><br>')
      + '</div>';
  } catch (e) {
    portalLastAIReportText = '';
    portalSetAIStatus('AI analysis failed');
    portalAIOutputEl.innerHTML = '<div class="muted" style="padding:12px">Unable to run AI analysis: ' +
      (e && e.message ? e.message : String(e)) + '</div>';
  } finally {
    portalAIAnalyzeBtn.disabled = false;
    if (portalAIDownloadBtn) portalAIDownloadBtn.disabled = false;
  }
}

function portalRefreshTeamOptions() {
  if (!portalRecTeamEl) return;
  var players = portalCollectAllMbbPlayers();
  var teamMap = {};
  players.forEach(function (p) {
    var t = portalGetPlayerTeam(p);
    if (!t) return;
    teamMap[t] = (teamMap[t] || 0) + 1;
  });
  var names = Object.keys(teamMap).sort(function (a, b) { return a.localeCompare(b); });
  var cur = portalRecTeamEl.value || '';
  portalRecTeamEl.innerHTML = '<option value="">- Select team -</option>';
  names.forEach(function (n) {
    var o = document.createElement('option');
    o.value = n;
    o.textContent = n + ' (' + teamMap[n] + ')';
    portalRecTeamEl.appendChild(o);
  });
  if (cur && teamMap[cur]) portalRecTeamEl.value = cur;
}

async function portalRunRecommendations() {
  if (!portalRecTeamEl || !portalRecTeamEl.value) {
    if (portalRecEmptyEl) {
      portalRecEmptyEl.style.display = '';
      portalRecEmptyEl.textContent = 'Select a team first.';
    }
    return;
  }

  if (portalRecRunBtn) portalRecRunBtn.disabled = true;
  if (portalRecEmptyEl) {
    portalRecEmptyEl.style.display = '';
    portalRecEmptyEl.textContent = 'Scoring fit candidates...';
  }

  if (!portalTeamCtx || portalTeamCtx.team !== portalRecTeamEl.value || portalTeamCtx.season !== portalGetSeason()) {
    await portalLoadTeamContext(portalRecTeamEl.value);
  }

  var players = portalCollectAllMbbPlayers();
  portalRecDist = portalBuildDistributions(players);
  // Re-detect departures in case portal items loaded after team selection
  if (portalTeamCtx && portalTeamCtx.roster) {
    portalDetectDepartures(portalTeamCtx.roster);
    portalRenderDepartureCards(portalDetectedDepartures);
  }
  portalComputeRecommendations();
  portalRenderRecommendations();
  if (portalRecRunBtn) portalRecRunBtn.disabled = false;
}

function portalUseSnapshotEnabled() {
  if (portalUseSnapshotEl && portalUseSnapshotEl.checked) return true;
  try {
    var params = new URLSearchParams(window.location.search || '');
    return params.get('portalSnapshot') === '1';
  } catch (_) {
    return false;
  }
}

function portalSnapshotCandidates(year) {
  return [
    'data/portal-247-' + year + '-snapshot.json',
    'data/portal-247-snapshot.json',
    'backend/dashboard-api/hidden-salad-773b/tmp_247_' + year + '_snapshot.json',
  ];
}

async function portalLoadSnapshot(year) {
  var candidates = portalSnapshotCandidates(year);
  for (var i = 0; i < candidates.length; i++) {
    try {
      var r = await fetch(candidates[i], { cache: 'no-store' });
      if (!r.ok) continue;
      var data = await r.json();
      var items = Array.isArray(data && data.items) ? data.items : null;
      if (!items || !items.length) continue;
      return {
        items: items.map(function (it) {
          return {
            source: it && it.source ? String(it.source) : '247snapshot',
            id: it && it.id ? it.id : null,
            date: it && it.date ? it.date : null,
            url: it && it.url ? it.url : '',
            slug: it && it.slug ? it.slug : '',
            title: it && it.title ? it.title : (it && it.playerName ? it.playerName : ''),
            excerpt: it && it.excerpt ? it.excerpt : '',
            playerName: it && it.playerName ? it.playerName : '',
            position: it && it.position ? it.position : '',
            fromTeam: it && it.fromTeam ? it.fromTeam : '',
            team: it && it.team ? it.team : (it && it.fromTeam ? it.fromTeam : ''),
            toTeam: it && it.toTeam ? it.toTeam : '',
            confidence: it && Number.isFinite(+it.confidence) ? +it.confidence : 0.85,
            status: it && it.status ? it.status : 'Entered',
            isPortalEntry: it && typeof it.isPortalEntry === 'boolean'
              ? it.isPortalEntry
              : ['entered', 'expected'].includes(String(it && it.status ? it.status : '').toLowerCase()),
          };
        }),
        path: candidates[i],
      };
    } catch (_) {}
  }
  return { items: [], path: '' };
}

function portalMergeItems(primary, extra) {
  var list = Array.isArray(primary) ? primary.slice() : [];
  var seen = Object.create(null);
  list.forEach(function (it) {
    var k = portalNorm((it && it.playerName) || '') + '|' + portalNorm((it && it.fromTeam) || '') + '|' + portalNorm((it && it.status) || '');
    seen[k] = true;
  });
  (Array.isArray(extra) ? extra : []).forEach(function (it) {
    var k = portalNorm((it && it.playerName) || '') + '|' + portalNorm((it && it.fromTeam) || '') + '|' + portalNorm((it && it.status) || '');
    if (seen[k]) return;
    seen[k] = true;
    list.push(it);
  });
  return list;
}

function portalApplyFilters() {
  var q = portalNorm(portalSearchInputEl ? portalSearchInputEl.value : '');
  var st = (portalStatusFilterEl && portalStatusFilterEl.value) ? portalStatusFilterEl.value : 'entries';

  portalFiltered = portalItems.filter(function (it) {
    var ls = (it.status || '').toLowerCase();
    if (st === 'entered' && ls !== 'entered') return false;
    if (st === 'expected' && ls !== 'expected') return false;
    if (st === 'entries' && ls !== 'entered' && ls !== 'expected') return false;
    if (!q) return true;
    var hay = portalNorm((it.playerName || '') + ' ' + (it.status || '') + ' ' + (it.position || '') + ' ' + (it.fromTeam || '') + ' ' + (it.toTeam || ''));
    return hay.includes(q);
  });

  portalRenderTable();
  portalRenderWatchAlerts();

  if (portalRecRows.length && portalTeamCtx) {
    portalComputeRecommendations();
    portalRenderRecommendations();
  }
}

function portalRenderTable() {
  if (!portalTableBodyEl) return;
  portalTableBodyEl.innerHTML = '';

  var matched = 0;
  var frag = document.createDocumentFragment();
  portalFiltered.forEach(function (it) {
    var tr = document.createElement('tr');
    tr.id = portalAlertDomId(portalEntryKey(it));

    var match = portalFindPlayerMatch(it.playerName);
    if (match) matched++;
    var ls = (it.status || '').toLowerCase();
    var statusColor = ls === 'entered' ? 'var(--good)' : ls === 'expected' ? 'var(--warn)' : 'var(--muted)';

    var tdPlayer = document.createElement('td');
    tdPlayer.textContent = it.playerName || 'Unknown';
    tdPlayer.style.fontWeight = '700';

    var tdStatus = document.createElement('td');
    tdStatus.textContent = it.status || '—';
    tdStatus.style.color = statusColor;
    tdStatus.style.fontWeight = '700';

    var tdDate = document.createElement('td');
    tdDate.textContent = portalFmtDate(it.date);

    var tdPos = document.createElement('td');
    tdPos.textContent = it.position || '—';

    var tdTeam = document.createElement('td');
    tdTeam.textContent = it.fromTeam || '—';

    var tdMatch = document.createElement('td');
    if (match) {
      var addBtn = document.createElement('button');
      addBtn.className = 'tbAddBtn';
      addBtn.textContent = '+ Add';
      addBtn.title = 'Add matched player to roster';
      addBtn.addEventListener('click', function () {
        if (typeof tbAddPlayer === 'function') tbAddPlayer(match);
      });
      tdMatch.appendChild(addBtn);
    } else {
      tdMatch.textContent = 'No match';
      tdMatch.className = 'muted';
    }

    var tdProfile = document.createElement('td');
    if (match) {
      var profBtn = document.createElement('button');
      profBtn.className = 'secondary';
      profBtn.style.padding = '4px 8px';
      profBtn.style.fontSize = '11px';
      profBtn.textContent = 'Open';
      profBtn.addEventListener('click', function () {
        if (typeof openProfile === 'function') openProfile(match);
      });
      tdProfile.appendChild(profBtn);
    } else {
      tdProfile.textContent = '—';
    }

    var tdSrc = document.createElement('td');
    var a = document.createElement('a');
    a.href = it.url || '#';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    var src = (it && it.source) ? String(it.source) : 'portal';
    if (src === '247sports') src = '247';
    if (src === '247snapshot') src = '247-snap';
    a.textContent = src;
    tdSrc.appendChild(a);

    tr.appendChild(tdPlayer);
    tr.appendChild(tdStatus);
    tr.appendChild(tdDate);
    tr.appendChild(tdPos);
    tr.appendChild(tdTeam);
    tr.appendChild(tdMatch);
    tr.appendChild(tdProfile);
    tr.appendChild(tdSrc);
    frag.appendChild(tr);
  });
  portalTableBodyEl.appendChild(frag);

  if (portalCountEl) portalCountEl.textContent = String(portalFiltered.length);
  if (portalMatchedCountEl) portalMatchedCountEl.textContent = String(matched);
  if (portalEmptyEl) portalEmptyEl.style.display = portalFiltered.length ? 'none' : '';
}

async function loadPortalEntries() {
  if (!portalTableBodyEl) return;

  if (typeof league !== 'undefined' && league === 'WBB') {
    portalItems = [];
    portalFiltered = [];
    portalWatchAlerts = [];
    portalRenderTable();
    portalRenderWatchAlerts();
    portalSetStatus('MBB source only');
    if (portalEmptyEl) {
      portalEmptyEl.style.display = '';
      portalEmptyEl.textContent = 'Portal board currently supports MBB feed. Switch to MBB to view candidates.';
    }
    return;
  }

  var base = (typeof WORKER_URL !== 'undefined' && WORKER_URL) || 'https://hidden-salad-773b.bryanhkwan.workers.dev';
  var q = (portalSearchInputEl && portalSearchInputEl.value) || '';
  var st = (portalStatusFilterEl && portalStatusFilterEl.value) ? portalStatusFilterEl.value : 'entries';
  var year = portalGetSeason();
  portalTargetSeason = year;

  function makeUrl(src) {
    var u = new URL(base + '/api/portal/entries');
    u.searchParams.set('source', src);
    u.searchParams.set('sport', 'mbb');
    u.searchParams.set('year', year);
    u.searchParams.set('limit', '100');
    u.searchParams.set('page', '1');
    u.searchParams.set('status', st);
    u.searchParams.set('onlyEntries', '1');
    if (q.trim()) u.searchParams.set('search', q.trim());
    return u;
  }

  portalSetStatus('Loading...');
  if (portalRefreshBtnEl) portalRefreshBtnEl.disabled = true;

  try {
    var usedSource = 'both';
    var resp = await fetch(makeUrl(usedSource).toString());
    if (!resp.ok) {
      usedSource = 'on3';
      resp = await fetch(makeUrl(usedSource).toString());
    }
    if (!resp.ok) throw new Error('Portal API ' + resp.status);

    var data = await resp.json();
    var apiItems = Array.isArray(data.items) ? data.items : [];
    var summary = (data && data.sourceSummary) ? data.sourceSummary : {};
    var snapshotInfo = { items: [], path: '' };

    // Auto-load snapshot as fallback if live feed returned nothing
    var autoSnapshotFallback = apiItems.length === 0 && !portalUseSnapshotEnabled();
    if (portalUseSnapshotEnabled() || autoSnapshotFallback) {
      snapshotInfo = await portalLoadSnapshot(year);
      if (snapshotInfo.items.length) {
        snapshotInfo.items = snapshotInfo.items.filter(function (it) {
          var ls = String((it && it.status) || '').toLowerCase();
          if (st === 'entered' && ls !== 'entered') return false;
          if (st === 'expected' && ls !== 'expected') return false;
          if (st === 'entries' && ls !== 'entered' && ls !== 'expected') return false;
          if (!q.trim()) return true;
          var hay = portalNorm((it.playerName || '') + ' ' + (it.status || '') + ' ' + (it.position || '') + ' ' + (it.fromTeam || '') + ' ' + (it.toTeam || ''));
          return hay.includes(portalNorm(q.trim()));
        });
        snapshotInfo.items.forEach(function (it) {
          it.source = '247snapshot';
        });
      }
    }

    portalItems = portalMergeItems(apiItems, snapshotInfo.items);
    var requestedSource = (data && data.sourceRequested) ? data.sourceRequested : usedSource;
    var sourceLabel = (data && data.source) ? data.source : usedSource;
    var sourcePart = sourceLabel;
    if (requestedSource && sourceLabel && requestedSource !== sourceLabel) {
      sourcePart = sourceLabel + ' fallback (requested ' + requestedSource + ')';
    }
    if (snapshotInfo.items.length) summary['247snapshot'] = (summary['247snapshot'] || 0) + snapshotInfo.items.length;
    if (summary) {
      var parts = [];
      Object.keys(summary).forEach(function (k) {
        parts.push(k + ': ' + summary[k]);
      });
      if (parts.length) sourcePart += ' (' + parts.join(', ') + ')';
    }
    if (portalUseSnapshotEnabled() && !snapshotInfo.items.length) {
      sourcePart += ' (snapshot: not found)';
    }
    if (autoSnapshotFallback && snapshotInfo.items.length) {
      sourcePart += ' (live empty — using local snapshot)';
    }
    var sourceErrors = Array.isArray(data.sourceErrors) ? data.sourceErrors : [];
    var errorSuffix = sourceErrors.length
      ? ' ⚠ ' + sourceErrors.map(function (e) { return (e.source || 'src') + ': ' + (e.error || 'failed'); }).join('; ')
      : '';
    portalSetStatus((resp.headers.get('X-Cache') === 'HIT' ? 'Cached' : 'Live') + ' · ' + sourcePart + ' · ' + portalItems.length + ' rows' + errorSuffix);
    if (portalEmptyEl) portalEmptyEl.textContent = 'No portal entries found for current filters.';
    portalApplyFilters();
    portalRefreshWatchAlerts();
    portalNotifyNewWatchAlerts();
    portalRefreshTeamOptions();
  } catch (e) {
    portalItems = [];
    portalFiltered = [];
    portalWatchAlerts = [];
    portalRenderTable();
    portalRenderWatchAlerts();
    portalSetStatus('Load failed');
    if (portalEmptyEl) {
      portalEmptyEl.style.display = '';
      portalEmptyEl.textContent = 'Unable to load transfer portal feed right now.';
    }
    if (typeof showWarn === 'function') showWarn('Transfer Portal load failed: ' + (e && e.message ? e.message : e));
  } finally {
    if (portalRefreshBtnEl) portalRefreshBtnEl.disabled = false;
  }
}

function initPortalPage() {
  initPortalDOMRefs();
  if (!portalRefreshBtnEl) return;

  if (portalUseSnapshotEl) {
    try {
      var saved = localStorage.getItem(portalUserStorageKey('snapshot_pref'));
      if (saved === '0') portalUseSnapshotEl.checked = false;
      else if (saved === '1') portalUseSnapshotEl.checked = true;
    } catch (_) {}
  }

  portalRefreshBtnEl.addEventListener('click', function () {
    loadPortalEntries();
  });

  if (portalSearchInputEl) portalSearchInputEl.addEventListener('input', function () {
    portalScheduleApplyFilters(120);
  });
  if (portalStatusFilterEl) portalStatusFilterEl.addEventListener('change', function () { loadPortalEntries(); });
  if (portalUseSnapshotEl) portalUseSnapshotEl.addEventListener('change', function () {
    try {
      localStorage.setItem(portalUserStorageKey('snapshot_pref'), portalUseSnapshotEl.checked ? '1' : '0');
    } catch (_) {}
    loadPortalEntries();
  });

  if (portalRecRefreshTeamBtn) {
    portalRecRefreshTeamBtn.addEventListener('click', async function () {
      if (!portalRecTeamEl || !portalRecTeamEl.value) return;
      await portalLoadTeamContext(portalRecTeamEl.value);
    });
  }

  if (portalRecTeamEl) {
    portalRecTeamEl.addEventListener('change', async function () {
      if (!portalRecTeamEl.value) return;
      await portalLoadTeamContext(portalRecTeamEl.value);
    });
  }

  if (portalRecRunBtn) {
    portalRecRunBtn.addEventListener('click', function () {
      portalRunRecommendations();
    });
  }

  if (portalAIAnalyzeBtn) {
    portalAIAnalyzeBtn.addEventListener('click', function () {
      portalRunAIAnalysis();
    });
  }

  if (portalAIDownloadBtn) {
    portalAIDownloadBtn.addEventListener('click', function () {
      portalDownloadAIReport();
    });
  }

  portalRefreshTeamOptions();
  portalRenderWatchAlerts();
}

window.TransferPortal = {
  initPage: initPortalPage,
  loadEntries: loadPortalEntries,
  refreshWatchAlerts: portalRefreshWatchAlerts,
  runRecommendations: portalRunRecommendations,
  runAIAnalysis: portalRunAIAnalysis,
  downloadAIReport: portalDownloadAIReport,
};
