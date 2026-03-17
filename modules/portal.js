// ============ TRANSFER PORTAL MODULE ============
// Uses Worker endpoint: /api/portal/entries

var portalItems = [];
var portalFiltered = [];
var portalRecRows = [];

var portalSearchInputEl, portalStatusFilterEl, portalRefreshBtnEl, portalUseSnapshotEl;
var portalCountEl, portalMatchedCountEl, portalStatusEl, portalTableBodyEl, portalEmptyEl;
var portalRecTeamEl, portalRecModeEl, portalRecRefreshTeamBtn, portalRecRunBtn;
var portalRecTeamSummaryEl, portalReplaceListEl, portalRecBodyEl, portalRecEmptyEl;
var portalAIAnalyzeBtn, portalAIDownloadBtn, portalAIStatusEl, portalAIOutputEl;

var portalTeamCtx = null;
var portalRecDist = null;
var portalAllMbbPlayers = [];
var portalTargetSeason = '2026';
var portalLastAIReportText = '';

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
  portalRecModeEl = document.getElementById('portalRecMode');
  portalRecRefreshTeamBtn = document.getElementById('portalRecRefreshTeam');
  portalRecRunBtn = document.getElementById('portalRecRunBtn');
  portalRecTeamSummaryEl = document.getElementById('portalRecTeamSummary');
  portalReplaceListEl = document.getElementById('portalReplaceList');
  portalRecBodyEl = document.getElementById('portalRecBody');
  portalRecEmptyEl = document.getElementById('portalRecEmpty');
  portalAIAnalyzeBtn = document.getElementById('portalAIAnalyzeBtn');
  portalAIDownloadBtn = document.getElementById('portalAIDownloadBtn');
  portalAIStatusEl = document.getElementById('portalAIStatus');
  portalAIOutputEl = document.getElementById('portalAIOutput');
}

function portalNorm(s) {
  return (s || '').toString().toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
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

function portalFindPlayerMatch(name) {
  if (!name) return null;
  var needle = portalNorm(name);
  if (!needle) return null;
  var players = portalGetAllPlayers();
  if (!players.length) return null;

  for (var i = 0; i < players.length; i++) {
    var n = portalNorm(players[i].Player || players[i].Name || '');
    if (n && n === needle) return players[i];
  }
  for (var j = 0; j < players.length; j++) {
    var n2 = portalNorm(players[j].Player || players[j].Name || '');
    if (n2 && (n2.includes(needle) || needle.includes(n2))) return players[j];
  }
  return null;
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
  var yearEl = document.getElementById('cbdSeason');
  return (yearEl && yearEl.value) ? String(yearEl.value) : String(new Date().getFullYear());
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
  if (!portalReplaceListEl) return [];
  var out = [];
  portalReplaceListEl.querySelectorAll('input[type="checkbox"][data-player-name]:checked').forEach(function (el) {
    out.push(String(el.getAttribute('data-player-name') || ''));
  });
  return out;
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

function portalRenderReplaceList(roster) {
  if (!portalReplaceListEl) return;
  portalReplaceListEl.innerHTML = '';
  if (!roster || !roster.length) {
    portalReplaceListEl.innerHTML = '<div class="muted" style="font-size:12px">No roster data found for selected team in loaded pool.</div>';
    return;
  }

  var sorted = roster.slice().sort(function (a, b) {
    var mpA = portalSafeNum(a.MP) || portalSafeNum(a.MP_num) || 0;
    var mpB = portalSafeNum(b.MP) || portalSafeNum(b.MP_num) || 0;
    if (mpB !== mpA) return mpB - mpA;
    var sA = portalSafeNum(a.Score) || portalSafeNum(a.PerfScore_calc) || 0;
    var sB = portalSafeNum(b.Score) || portalSafeNum(b.PerfScore_calc) || 0;
    return sB - sA;
  }).slice(0, 15);

  sorted.forEach(function (r) {
    var nm = portalGetPlayerName(r);
    var score = portalSafeNum(r.Score) || portalSafeNum(r.PerfScore_calc);
    var posText = (r.Position || r.Pos || (typeof tbPosGroup === 'function' && tbPosGroup(r) === 'guard' ? 'Guard' : 'Big'));
    var div = document.createElement('label');
    div.className = 'portalReplaceItem';
    div.innerHTML =
      '<input type="checkbox" data-player-name="' + nm.replace(/"/g, '&quot;') + '">' +
      '<span class="portalReplaceText">' + nm + ' <span class="muted">(' + posText + (score !== null ? ', Perf ' + portalFmtNum(score, 1) : '') + ')</span></span>';
    portalReplaceListEl.appendChild(div);
  });
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
  portalRenderReplaceList(roster);
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

  var mode = (portalRecModeEl && portalRecModeEl.value) ? portalRecModeEl.value : 'fit';
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
    if (replaceGain !== null && mode === 'replace') final += 0.20 * replaceGain;

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
        if (typeof tbAddPlayer === 'function') tbAddPlayer(row.player);
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
    mode: (portalRecModeEl && portalRecModeEl.value) ? portalRecModeEl.value : 'fit',
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

function portalDownloadAIReport() {
  var reportText = (portalLastAIReportText || '').trim();
  if (!reportText && portalAIOutputEl) reportText = (portalAIOutputEl.innerText || '').trim();
  if (!reportText) {
    portalSetAIStatus('Run Analyze picks first to generate a report.');
    return;
  }

  var title = 'Transfer Portal Fit Report';
  var subtitle = (portalTeamCtx && portalTeamCtx.team ? portalTeamCtx.team : 'Team') + ' · Season ' + (portalTeamCtx && portalTeamCtx.season ? portalTeamCtx.season : portalTargetSeason);
  var text = title + '\n' + subtitle + '\n\n' + reportText.replace(/\u2022/g, '-');

  if (window.jspdf && window.jspdf.jsPDF) {
    var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var margin = 42;
    var lineH = 16;
    var y = margin;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    var lines = doc.splitTextToSize(text, pageW - margin * 2);

    for (var i = 0; i < lines.length; i++) {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(lines[i], margin, y);
      y += lineH;
    }
    doc.save(portalBuildReportFileName());
    portalSetAIStatus('PDF downloaded.');
    return;
  }

  var w = window.open('', '_blank');
  if (!w) {
    portalSetAIStatus('Popup blocked. Allow popups to export PDF.');
    return;
  }
  w.document.write('<!doctype html><html><head><title>' + title + '</title><style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.45;}pre{white-space:pre-wrap;font-family:inherit;}</style></head><body><h2>' + title + '</h2><div>' + subtitle + '</div><hr><pre>' +
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') +
    '</pre></body></html>');
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
  portalSetAIStatus('Analyzing with Gemini 2.5 Flash Lite...');
  portalAIOutputEl.style.display = 'block';
  portalAIOutputEl.innerHTML = '<div class="thDeepLoading"><span class="thDeepSpinner"></span> Evaluating picks and fit strategy...</div>';

  var ctx = portalBuildAIContext(8);
  var prompt =
    'You are an elite college basketball roster strategist. Analyze transfer portal replacement targets for the selected team using only the structured data below. ' +
    'Include strengths, weaknesses, fit rationale, and a practical replacement strategy. Explicitly reference team performance trends and shot profile where available. ' +
    'Return concise markdown with sections: ## Best Fits, ## Replacement Plan, ## Risks, ## Action Steps.\n\n' +
    '```json\n' + JSON.stringify(ctx, null, 2) + '\n```';

  try {
    var res = await fetch(PORTAL_GEMINI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: PORTAL_GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.55, maxOutputTokens: 2600 },
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
    portalSetAIStatus('Done');
    portalAIOutputEl.innerHTML = '<div class="portalAIMarkdown">' +
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/^##\s+(.*)$/gm, '<h4>$1</h4>')
        .replace(/^[-*]\s+(.*)$/gm, '<div class="portalAIBullet">• $1</div>')
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

  if (portalRecRows.length && portalTeamCtx) {
    portalComputeRecommendations();
    portalRenderRecommendations();
  }
}

function portalRenderTable() {
  if (!portalTableBodyEl) return;
  portalTableBodyEl.innerHTML = '';

  var matched = 0;
  portalFiltered.forEach(function (it) {
    var tr = document.createElement('tr');

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
    portalTableBodyEl.appendChild(tr);
  });

  if (portalCountEl) portalCountEl.textContent = String(portalFiltered.length);
  if (portalMatchedCountEl) portalMatchedCountEl.textContent = String(matched);
  if (portalEmptyEl) portalEmptyEl.style.display = portalFiltered.length ? 'none' : '';
}

async function loadPortalEntries() {
  if (!portalTableBodyEl) return;

  if (typeof league !== 'undefined' && league === 'WBB') {
    portalItems = [];
    portalFiltered = [];
    portalRenderTable();
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
    if (portalUseSnapshotEnabled()) {
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
    portalSetStatus((resp.headers.get('X-Cache') === 'HIT' ? 'Cached' : 'Live') + ' · ' + sourcePart + ' · ' + portalItems.length + ' rows');
    if (portalEmptyEl) portalEmptyEl.textContent = 'No portal entries found for current filters.';
    portalApplyFilters();
    portalRefreshTeamOptions();
  } catch (e) {
    portalItems = [];
    portalFiltered = [];
    portalRenderTable();
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

  portalRefreshBtnEl.addEventListener('click', function () {
    loadPortalEntries();
  });

  if (portalSearchInputEl) portalSearchInputEl.addEventListener('input', portalApplyFilters);
  if (portalStatusFilterEl) portalStatusFilterEl.addEventListener('change', function () { loadPortalEntries(); });
  if (portalUseSnapshotEl) portalUseSnapshotEl.addEventListener('change', function () { loadPortalEntries(); });

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

  if (portalRecModeEl) {
    portalRecModeEl.addEventListener('change', function () {
      if (portalTeamCtx && portalRecRows.length) portalRunRecommendations();
    });
  }

  if (portalReplaceListEl) {
    portalReplaceListEl.addEventListener('change', function () {
      if (!portalRecModeEl || portalRecModeEl.value !== 'replace') return;
      if (portalTeamCtx && portalRecRows.length) portalRunRecommendations();
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
}

window.TransferPortal = {
  initPage: initPortalPage,
  loadEntries: loadPortalEntries,
  runRecommendations: portalRunRecommendations,
  runAIAnalysis: portalRunAIAnalysis,
  downloadAIReport: portalDownloadAIReport,
};
