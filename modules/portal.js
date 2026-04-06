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
var portalTargetCountEl, portalTargetStatusEl, portalTargetBodyEl, portalTargetEmptyEl, portalTargetClearBtnEl;
var portalRepResearchBtnEl, portalRepExportBtnEl, portalRepClearBtnEl, portalRepLimitEl;
var portalRepStatusEl, portalRepBodyEl, portalRepEmptyEl, portalRepCountEl;
var portalWatchAlertWrapEl, favsPortalAlertWrapEl, favsPortalBadgeEl;
var portalBoardSubtitleEl, portalSnapshotWrapEl, portalSnapshotLabelEl, portalBoardHintEl, portalFitSubtitleEl, portalAISubtitleEl;

var portalTeamCtx = null;
var portalRecDist = null;
var portalAllPlayers = [];
var portalTargetSeason = '2026';
var portalLastAIReportText = '';
var portalDetectedDepartures = [];
var portalSelectedDepartureNames = [];
var portalWatchAlerts = [];
var portalScenarioRows = [];
var portalRepResults = [];
var portalFilterTimer = null;
var portalPlayerIndexRef = null;
var portalPlayerIndexExact = Object.create(null);
var portalPlayerIndexLoose = [];
var portalJsPdfPromise = null;
var portalRepBusy = false;

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
  portalTargetCountEl = document.getElementById('portalTargetCount');
  portalTargetStatusEl = document.getElementById('portalTargetStatus');
  portalTargetBodyEl = document.getElementById('portalTargetBody');
  portalTargetEmptyEl = document.getElementById('portalTargetEmpty');
  portalTargetClearBtnEl = document.getElementById('portalTargetClearBtn');
  portalRepResearchBtnEl = document.getElementById('portalRepResearchBtn');
  portalRepExportBtnEl = document.getElementById('portalRepExportBtn');
  portalRepClearBtnEl = document.getElementById('portalRepClearBtn');
  portalRepLimitEl = document.getElementById('portalRepLimit');
  portalRepStatusEl = document.getElementById('portalRepStatus');
  portalRepBodyEl = document.getElementById('portalRepBody');
  portalRepEmptyEl = document.getElementById('portalRepEmpty');
  portalRepCountEl = document.getElementById('portalRepCount');
  portalWatchAlertWrapEl = document.getElementById('portalWatchAlertWrap');
  favsPortalAlertWrapEl = document.getElementById('favsPortalAlertWrap');
  favsPortalBadgeEl = document.getElementById('favsPortalBadge');
  portalBoardSubtitleEl = document.getElementById('portalBoardSubtitle');
  portalSnapshotWrapEl = document.getElementById('portalSnapshotWrap');
  portalSnapshotLabelEl = document.getElementById('portalSnapshotLabel');
  portalBoardHintEl = document.getElementById('portalBoardHint');
  portalFitSubtitleEl = document.getElementById('portalFitSubtitle');
  portalAISubtitleEl = document.getElementById('portalAISubtitle');
}

function portalCurrentLeague() {
  var lg = (typeof league !== 'undefined' && league) ? String(league).toUpperCase() : 'MBB';
  return lg === 'WBB' ? 'WBB' : 'MBB';
}

function portalCurrentSport() {
  return portalCurrentLeague() === 'WBB' ? 'wbb' : 'mbb';
}

function portalSyncLeagueUI() {
  var isWbb = portalCurrentLeague() === 'WBB';
  if (portalBoardSubtitleEl) {
    portalBoardSubtitleEl.textContent = isWbb
      ? 'Live On3 transfer intel feed with player-name matching to your loaded WBB pool.'
      : 'Live On3 transfer intel feed with optional 247 supplement and player-name matching to your loaded player pool.';
  }
  if (portalSnapshotWrapEl) {
    portalSnapshotWrapEl.style.display = isWbb ? 'none' : '';
  }
  if (portalSnapshotLabelEl) {
    portalSnapshotLabelEl.textContent = 'Auto-merge local 247 snapshot';
  }
  if (portalUseSnapshotEl) {
    portalUseSnapshotEl.disabled = isWbb;
    if (isWbb) {
      portalUseSnapshotEl.checked = false;
    } else {
      try {
        var saved = localStorage.getItem(portalUserStorageKey('snapshot_pref'));
        if (saved === '0') portalUseSnapshotEl.checked = false;
        else if (saved === '1') portalUseSnapshotEl.checked = true;
      } catch (_) {}
    }
  }
  if (portalBoardHintEl) {
    portalBoardHintEl.textContent = isWbb
      ? 'Shows women\'s transfer portal entries from the live On3 feed and matches names back to your loaded WBB player pool.'
      : 'Shows real transfer portal entries from the live On3 feed first, then layers in your saved 247 snapshot as a supplement when enabled.';
  }
  if (portalFitSubtitleEl) {
    portalFitSubtitleEl.textContent = isWbb
      ? 'Select your team, flag the players you could lose, shortlist the portal names you actually like, and score how cleanly they fit that WBB roster.'
      : 'Select your team, flag the likely departures, shortlist the portal names you actually want, and score how cleanly they fit the roster before it\'s official.';
  }
  if (portalAISubtitleEl) {
    portalAISubtitleEl.textContent = isWbb
      ? 'Deep analysis using WBB player stats, game logs, and team context from the dashboard data stack. If you tag players in mind, the AI grades those targets first.'
      : 'Deep analysis using player stats, game logs, and team context from the dashboard data stack. If you tag players in mind, the AI grades those targets first.';
  }
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
  var lg = portalCurrentLeague();
  if (typeof tbGetAllPlayers === 'function') {
    return tbGetAllPlayers(lg) || [];
  }
  if (window._app && typeof window._app.tbGetAllPlayers === 'function') {
    return window._app.tbGetAllPlayers(lg) || [];
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

function portalFindPlayerMatch(name, teamName) {
  if (!name) return null;
  var needle = portalNorm(name);
  var teamNeedle = portalNorm(teamName || '');
  if (!needle) return null;
  var players = portalGetAllPlayers() || [];
  if (teamNeedle) {
    for (var i = 0; i < players.length; i++) {
      var player = players[i];
      if (portalNorm(player && (player.Player || player.Name || '')) !== needle) continue;
      if (portalNorm(portalGetPlayerTeam(player)) === teamNeedle) return player;
    }
  }
  var index = portalGetPlayerIndex();
  if (index.exact[needle]) return index.exact[needle];
  var looseFallback = null;
  for (var j = 0; j < index.loose.length; j++) {
    var n2 = index.loose[j].norm;
    if (!n2 || !(n2.includes(needle) || needle.includes(n2))) continue;
    if (!teamNeedle || portalNorm(portalGetPlayerTeam(index.loose[j].player)) === teamNeedle) return index.loose[j].player;
    if (!looseFallback) looseFallback = index.loose[j].player;
  }
  return looseFallback;
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

function portalSetRepStatus(msg) {
  if (portalRepStatusEl) portalRepStatusEl.textContent = msg || '';
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

function portalFmtMoney(v) {
  var n = portalSafeNum(v);
  if (n === null) return '\u2014';
  if (typeof demoFormatMoney === 'function') return demoFormatMoney(n);
  if (typeof fmtMoney === 'function') return fmtMoney(n);
  return '$' + Math.round(n).toLocaleString();
}

function portalGetPlayerClass(player) {
  if (!player) return '\u2014';
  var cls = player.Class || player.Yr || player.Year || player.Experience;
  return cls ? String(cls) : '\u2014';
}

function portalGetPlayerPerf(player) {
  if (!player) return null;
  var perf = portalSafeNum(player.Score);
  if (perf === null) perf = portalSafeNum(player.PerfScore_calc);
  return perf;
}

function portalGetPlayerValuation(player) {
  if (!player) return null;
  var value = portalSafeNum(player.ActualValuation_calc);
  if (value === null) value = portalSafeNum(player.ActualValuation);
  if (value === null) value = portalSafeNum(player.PredictedValue_calc);
  if (value === null) value = portalSafeNum(player.PredictedValue);
  if (value === null) value = portalSafeNum(player.Valuation);
  if (value === null) value = portalSafeNum(player.Value);
  return value;
}

function portalClamp01(v) {
  var n = Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function portalPlayerPosGroup(player) {
  if (!player) return 'guard';
  if (typeof tbPosGroup === 'function') return tbPosGroup(player);
  var pos = String(player.Position || player.Pos || '').toLowerCase();
  return (pos.indexOf('g') >= 0 || pos.indexOf('guard') >= 0) ? 'guard' : 'big';
}

function portalClassBucket(player) {
  var raw = String(player && (player.Class || player.Yr || player.Year || player.Experience || '')).trim().toLowerCase();
  if (!raw) return 'Unknown';
  if (raw.indexOf('grad') >= 0) return 'Sr+';
  if (raw.indexOf('fresh') >= 0 || raw.startsWith('fr')) return 'Fr';
  if (raw.indexOf('soph') >= 0 || raw.startsWith('so')) return 'So';
  if (raw.indexOf('jun') >= 0 || raw.startsWith('jr')) return 'Jr';
  if (raw.indexOf('sen') >= 0 || raw.startsWith('sr') || raw.startsWith('gr')) return 'Sr+';
  return String(player.Class || player.Yr || player.Year || 'Unknown');
}

function portalAverage(values) {
  var nums = (values || []).filter(function (v) { return Number.isFinite(v); });
  if (!nums.length) return null;
  var sum = nums.reduce(function (acc, v) { return acc + v; }, 0);
  return sum / nums.length;
}

function portalSelectedDeparturePlayers() {
  if (!portalTeamCtx || !Array.isArray(portalTeamCtx.roster)) return [];
  return portalSelectedReplaceNames().map(function (name) {
    return (portalTeamCtx.roster || []).find(function (row) {
      return portalNorm(portalGetPlayerName(row)) === portalNorm(name);
    }) || null;
  }).filter(Boolean);
}

function portalPositionFitScore(player, departurePlayers) {
  if (!departurePlayers || !departurePlayers.length) return 0.55;
  var candGroup = portalPlayerPosGroup(player);
  var candPos = String(player && (player.Position || player.Pos || '')).trim().toLowerCase();
  var sameGroupCount = 0;
  var exactPosCount = 0;

  departurePlayers.forEach(function (dep) {
    if (portalPlayerPosGroup(dep) === candGroup) sameGroupCount += 1;
    var depPos = String(dep && (dep.Position || dep.Pos || '')).trim().toLowerCase();
    if (candPos && depPos && candPos === depPos) exactPosCount += 1;
  });

  if (!sameGroupCount) return departurePlayers.length === 1 ? 0.28 : 0.36;

  var share = sameGroupCount / departurePlayers.length;
  var score = departurePlayers.length === 1 ? 0.88 : (0.72 + 0.20 * share);
  if (exactPosCount) score += 0.08;
  return portalClamp01(score);
}

function portalValueFitScore(player, impact, replaceGain, targetValue) {
  var candidateValue = portalGetPlayerValuation(player);
  var replaceEdge = replaceGain === null ? 0.5 : portalClamp01(0.5 + replaceGain);
  impact = portalClamp01(impact);

  if (candidateValue === null || candidateValue <= 0) {
    return portalClamp01(0.75 * impact + 0.25 * replaceEdge);
  }

  if (targetValue === null || targetValue <= 0) {
    return portalClamp01(0.8 * impact + 0.2 * replaceEdge);
  }

  var ratio = candidateValue / targetValue;
  var similarity = portalClamp01(1 - (Math.abs(ratio - 1) / 0.85));
  var costDiscipline = ratio <= 1.05 ? 1 : portalClamp01(1 - ((ratio - 1.05) / 0.95));
  var cheaperBonus = ratio < 0.95 ? portalClamp01((0.95 - ratio) / 0.45) : 0;

  return portalClamp01(
    0.40 * impact +
    0.25 * similarity +
    0.20 * costDiscipline +
    0.10 * cheaperBonus +
    0.05 * replaceEdge
  );
}

function portalUpsideScore(player, impact, targetValue) {
  var cls = portalClassBucket(player);
  var classBase = 0.58;
  if (cls === 'Fr') classBase = 0.95;
  else if (cls === 'So') classBase = 0.84;
  else if (cls === 'Jr') classBase = 0.68;
  else if (cls === 'Sr+') classBase = 0.44;

  var mp = portalSafeNum(player && player.MP);
  var minuteBase = mp === null ? 0.6 : (mp < 12 ? 0.42 : (mp < 18 ? 0.72 : (mp < 28 ? 0.86 : 0.68)));
  var candidateValue = portalGetPlayerValuation(player);
  var valueLeverage = 0.55;
  if (targetValue !== null && targetValue > 0 && candidateValue !== null && candidateValue > 0) {
    valueLeverage = candidateValue <= targetValue
      ? portalClamp01(0.65 + ((targetValue - candidateValue) / targetValue))
      : portalClamp01(0.62 - ((candidateValue - targetValue) / (targetValue * 2)));
  }

  return portalClamp01(
    0.42 * classBase +
    0.30 * portalClamp01(impact) +
    0.18 * minuteBase +
    0.10 * valueLeverage
  );
}

function portalReplacementType(positionFit, valueFit, upside, replaceGain, targetValue, candidateValue) {
  if (positionFit >= 0.84 && replaceGain !== null && replaceGain >= 0.03) return 'Direct replacement';
  if (valueFit >= 0.76) {
    if (targetValue !== null && candidateValue !== null && candidateValue <= targetValue * 1.05) return 'Value play';
    return 'Upgrade bet';
  }
  if (upside >= 0.76) return 'Upside swing';
  if (positionFit >= 0.84) return 'Role fit';
  return 'Rotation fit';
}

function portalBuildRecommendationReasons(reasonPool, meta) {
  var reasons = [];
  var seen = {};

  function addReason(label) {
    if (!label || seen[label]) return;
    seen[label] = true;
    reasons.push(label);
  }

  if (meta.departurePlayers && meta.departurePlayers.length) {
    if (meta.positionFit >= 0.84) addReason(meta.departurePlayers.length === 1 ? 'Same-position replacement' : 'Covers a departing role');
    else if (meta.departurePlayers.length === 1 && meta.positionFit < 0.4) addReason('Cross-position swing');
  }

  if (meta.valueFit >= 0.78) {
    if (meta.targetValue !== null && meta.candidateValue !== null) {
      if (meta.candidateValue <= meta.targetValue * 0.95) addReason('Best bang-for-buck');
      else if (meta.candidateValue <= meta.targetValue * 1.15) addReason('Similar valuation tier');
      else addReason('Higher-cost upgrade bet');
    } else {
      addReason('Strong value profile');
    }
  }

  if (meta.replaceGain !== null && meta.replaceGain >= 0.05) addReason('Improves lost production');
  if (meta.upside >= 0.78) addReason('High-upside development bet');

  reasonPool.sort(function (a, b) { return b.contrib - a.contrib; });
  reasonPool.forEach(function (item) {
    if (reasons.length >= 4) return;
    addReason(item.label + ' (' + Math.round((item.cand || 0) * 100) + 'th pct)');
  });

  return reasons.slice(0, 4);
}

function portalEnforcePositionBalance(rows, departurePlayers) {
  if (!Array.isArray(rows) || rows.length < 3 || !departurePlayers || departurePlayers.length !== 1) return rows;
  var targetGroup = portalPlayerPosGroup(departurePlayers[0]);
  var sameGroupRows = rows.filter(function (row) { return row.positionGroup === targetGroup; });
  if (sameGroupRows.length < 2) return rows;

  var topThree = rows.slice(0, 3);
  var sameInTopThree = topThree.filter(function (row) { return row.positionGroup === targetGroup; }).length;
  if (sameInTopThree >= 2) return rows;

  var chosen = [];
  var used = new Set();
  var bestOverall = rows[0];
  chosen.push(bestOverall);
  used.add(bestOverall);

  var needed = 2 - (bestOverall.positionGroup === targetGroup ? 1 : 0);
  sameGroupRows.forEach(function (row) {
    if (needed > 0 && !used.has(row)) {
      chosen.push(row);
      used.add(row);
      needed -= 1;
    }
  });

  rows.forEach(function (row) {
    if (chosen.length >= 3) return;
    if (!used.has(row)) {
      chosen.push(row);
      used.add(row);
    }
  });

  return chosen.concat(rows.filter(function (row) { return !used.has(row); }));
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

function portalCollectAllPlayers() {
  portalAllPlayers = portalGetAllPlayers() || [];
  return portalAllPlayers;
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
    var players = portalCollectAllPlayers();
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

function portalRepStorageKey() {
  return portalUserStorageKey('rep_research_' + portalCurrentSport() + '_' + portalGetSeason());
}

function portalTargetsStorageKey() {
  return portalUserStorageKey('fit_targets_' + portalCurrentSport() + '_' + portalGetSeason());
}

function portalNormalizeTargetItem(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  return {
    key: String(raw.key || '').trim(),
    playerName: String(raw.playerName || '').trim(),
    fromTeam: String(raw.fromTeam || raw.team || '').trim(),
    position: String(raw.position || '').trim(),
    source: String(raw.source || 'portal').trim(),
    url: String(raw.url || '').trim(),
    addedAt: Number.isFinite(Date.parse(raw.addedAt || '')) ? String(raw.addedAt) : new Date().toISOString(),
  };
}

function portalTargetKey(entry, player) {
  var playerName = portalGetPlayerName(player) || (entry && entry.playerName) || '';
  var fromTeam = portalGetPlayerTeam(player) || (entry && (entry.fromTeam || entry.team)) || '';
  return [portalCurrentSport(), portalGetSeason(), portalNorm(playerName), portalNorm(fromTeam)].join('|');
}

function portalLoadTargetList() {
  var out = [];
  var seen = Object.create(null);
  try {
    var raw = JSON.parse(localStorage.getItem(portalTargetsStorageKey()) || '[]');
    (Array.isArray(raw) ? raw : []).forEach(function (item) {
      var normalized = portalNormalizeTargetItem(item);
      if (!normalized.key || !normalized.playerName || seen[normalized.key]) return;
      seen[normalized.key] = true;
      out.push(normalized);
    });
  } catch (_) {}
  return out;
}

function portalSaveTargetList(list) {
  try {
    localStorage.setItem(portalTargetsStorageKey(), JSON.stringify(Array.isArray(list) ? list : []));
  } catch (_) {}
}

function portalTargetListToMap(list) {
  var out = Object.create(null);
  (Array.isArray(list) ? list : []).forEach(function (item) {
    if (item && item.key) out[item.key] = item;
  });
  return out;
}

function portalBuildStoredTarget(entry, player) {
  return portalNormalizeTargetItem({
    key: portalTargetKey(entry, player),
    playerName: portalGetPlayerName(player) || (entry && entry.playerName) || '',
    fromTeam: portalGetPlayerTeam(player) || (entry && (entry.fromTeam || entry.team)) || '',
    position: (entry && entry.position) || (player && (player.Position || player.Pos)) || '',
    source: (entry && entry.source) || 'portal',
    url: (entry && entry.url) || '',
    addedAt: new Date().toISOString(),
  });
}

function portalToggleTarget(entry, player) {
  if (!entry || !player) return false;
  var key = portalTargetKey(entry, player);
  var list = portalLoadTargetList();
  var next = [];
  var removed = false;
  list.forEach(function (item) {
    if (item.key === key) {
      removed = true;
      return;
    }
    next.push(item);
  });
  if (!removed) next.unshift(portalBuildStoredTarget(entry, player));
  portalSaveTargetList(next);
  portalRefreshScenarioRows();
  portalRenderTable();
  portalRenderRecommendations();
  portalShowToast((portalGetPlayerName(player) || entry.playerName || 'Player') + (removed ? ' removed from shortlist' : ' added to shortlist'));
  return !removed;
}

function portalClearTargets() {
  var list = portalLoadTargetList();
  if (!list.length) return;
  var ok = true;
  try {
    ok = window.confirm('Clear all tagged portal shortlist targets for the current league and season?');
  } catch (_) {}
  if (!ok) return;
  portalSaveTargetList([]);
  portalRefreshScenarioRows();
  portalRenderTable();
  portalRenderRecommendations();
  portalShowToast('Portal shortlist cleared');
}

function portalGetActiveAnalysisRows(limit) {
  var rows = (portalScenarioRows || []).filter(function (row) {
    return row && row.player && !row.sameTeam;
  });
  if (rows.length) {
    rows = rows.slice().sort(function (a, b) {
      return (b.scenarioFit || b.fit || 0) - (a.scenarioFit || a.fit || 0);
    });
  } else {
    rows = (portalRecRows || []).slice();
  }
  if (Number.isFinite(limit)) rows = rows.slice(0, Math.max(0, limit));
  return rows;
}

function portalLoadRepCacheMap() {
  try {
    var raw = localStorage.getItem(portalRepStorageKey()) || '{}';
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function portalSaveRepCacheMap(map) {
  try {
    localStorage.setItem(portalRepStorageKey(), JSON.stringify(map || {}));
  } catch (_) {}
}

function portalRepEntryKey(entry) {
  return [
    portalCurrentSport(),
    portalGetSeason(),
    portalNorm(entry && entry.playerName),
    portalNorm(entry && entry.fromTeam)
  ].join('|');
}

function portalRepParseJson(text) {
  var raw = String(text || '').trim();
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  var start = raw.indexOf('{');
  var end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object found');
  return JSON.parse(raw.slice(start, end + 1));
}

function portalRepConfidenceRank(value) {
  var v = String(value || '').toLowerCase();
  if (v === 'high') return 4;
  if (v === 'medium') return 3;
  if (v === 'low') return 2;
  if (v === 'none') return 1;
  return 0;
}

function portalRepConfidenceClass(value) {
  var v = String(value || 'none').toLowerCase();
  if (v !== 'high' && v !== 'medium' && v !== 'low') v = 'none';
  return 'portalRepConfidence--' + v;
}

function portalNormalizeRepSources(list) {
  var out = [];
  var seen = {};
  (Array.isArray(list) ? list : []).forEach(function (src) {
    if (out.length >= 4) return;
    var title = String(src && src.title ? src.title : src && src.url ? src.url : '').trim().slice(0, 160);
    var url = String(src && src.url ? src.url : '').trim().slice(0, 320);
    if (!title && !url) return;
    var key = title + '|' + url;
    if (seen[key]) return;
    seen[key] = true;
    out.push({ title: title || url, url: url });
  });
  return out;
}

function portalSanitizeRepResult(raw, entry, searchData, query) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var result = {
    key: portalRepEntryKey(entry),
    sport: portalCurrentSport(),
    season: portalGetSeason(),
    playerName: String(entry && entry.playerName ? entry.playerName : '').trim().slice(0, 120),
    fromTeam: String(entry && entry.fromTeam ? entry.fromTeam : '').trim().slice(0, 120),
    status: String(entry && entry.status ? entry.status : '').trim().slice(0, 40),
    query: String(query || '').trim().slice(0, 280),
    hasPublicRepresentation: raw.hasPublicRepresentation === true,
    repName: String(raw.agentName || raw.repName || raw.advisorName || '').trim().slice(0, 120),
    organization: String(raw.organization || raw.orgName || raw.agency || '').trim().slice(0, 140),
    publicBusinessEmail: String(raw.publicBusinessEmail || raw.email || '').trim().slice(0, 160),
    publicBusinessPhone: String(raw.publicBusinessPhone || raw.phone || '').trim().slice(0, 80),
    publicWebsite: String(raw.publicWebsite || raw.website || '').trim().slice(0, 320),
    contactPage: String(raw.contactPage || raw.contactUrl || '').trim().slice(0, 320),
    confidence: String(raw.confidence || 'none').trim().toLowerCase(),
    notes: String(raw.notes || raw.summary || '').trim().slice(0, 360),
    sources: portalNormalizeRepSources(raw.sources && raw.sources.length ? raw.sources : (searchData && searchData.sources ? searchData.sources : [])),
    searchedAt: new Date().toISOString()
  };

  if (result.confidence !== 'high' && result.confidence !== 'medium' && result.confidence !== 'low') {
    result.confidence = 'none';
  }
  if (!result.repName && !result.organization) result.hasPublicRepresentation = false;
  if ((result.repName || result.organization) && result.confidence === 'none') result.confidence = 'medium';
  if (!result.hasPublicRepresentation && !result.notes) result.notes = 'No clear public representation signal found in the current web results.';
  return result;
}

function portalBuildRepResearchQuery(entry) {
  var playerName = String(entry && entry.playerName ? entry.playerName : '').trim();
  var teamName = String(entry && entry.fromTeam ? entry.fromTeam : '').trim();
  var sportLabel = portalCurrentLeague() === 'WBB' ? 'women college basketball' : 'men college basketball';
  return '"' + playerName + '" ' + (teamName ? ('"' + teamName + '" ') : '') + sportLabel + ' agent OR advisor OR represented by OR management OR NIL';
}

async function portalRunPublicWebSearch(query) {
  try {
    var res = await fetch(PORTAL_GEMINI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'web_search', query: query })
    });
    var data = await res.json();
    if (!res.ok || data.error) throw new Error((data && data.error && data.error.message) || data.error || ('HTTP ' + res.status));
    return {
      summary: String(data && data.summary ? data.summary : '').trim(),
      sources: portalNormalizeRepSources(data && data.sources ? data.sources : [])
    };
  } catch (e) {
    return {
      error: 'Web search failed: ' + (e && e.message ? e.message : String(e)),
      summary: '',
      sources: []
    };
  }
}

async function portalExtractRepResearch(entry, searchData, query) {
  if (searchData && searchData.error) {
    return portalSanitizeRepResult({
      hasPublicRepresentation: false,
      confidence: 'none',
      notes: searchData.error
    }, entry, searchData, query);
  }

  var prompt =
    'You extract PUBLIC basketball player representation information from search evidence. Return JSON only.\n' +
    'Schema:\n' +
    '{"hasPublicRepresentation":boolean,"agentName":"","organization":"","publicBusinessEmail":"","publicBusinessPhone":"","publicWebsite":"","contactPage":"","confidence":"none|low|medium|high","notes":"","sources":[{"title":"","url":""}]}\n\n' +
    'Rules:\n' +
    '- Use ONLY explicit information from the supplied summary and source list.\n' +
    '- Do NOT guess agent names, organizations, phone numbers, or email addresses.\n' +
    '- Only include public business contact details for agencies, management groups, advisors, or public contact pages.\n' +
    '- Do NOT include private or personal contact details.\n' +
    '- If the evidence only suggests a likely agency but does not clearly state it, set confidence to low and explain why.\n' +
    '- If no clear representation signal exists, set hasPublicRepresentation=false and confidence=none.\n\n' +
    'Player: ' + String(entry && entry.playerName ? entry.playerName : '') + '\n' +
    'School: ' + String(entry && entry.fromTeam ? entry.fromTeam : '') + '\n' +
    'Search query: ' + String(query || '') + '\n\n' +
    'Search summary:\n' + String(searchData && searchData.summary ? searchData.summary : '') + '\n\n' +
    'Sources:\n' + portalNormalizeRepSources(searchData && searchData.sources ? searchData.sources : []).map(function (src) {
      return '- ' + src.title + ' | ' + src.url;
    }).join('\n');

  try {
    var res = await fetch(PORTAL_GEMINI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: PORTAL_GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1600 }
      })
    });
    var data = await res.json();
    if (!res.ok || data.error) throw new Error((data && data.error && data.error.message) || data.error || ('HTTP ' + res.status));
    var text = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
      .map(function (p) { return p.text || ''; })
      .join('')
      .trim();
    var parsed = portalRepParseJson(text);
    return portalSanitizeRepResult(parsed, entry, searchData, query);
  } catch (e) {
    return portalSanitizeRepResult({
      hasPublicRepresentation: false,
      confidence: 'none',
      notes: 'Structured extraction failed: ' + (e && e.message ? e.message : String(e))
    }, entry, searchData, query);
  }
}

async function portalResearchRepForEntry(entry, forceRefresh) {
  var key = portalRepEntryKey(entry);
  var cache = portalLoadRepCacheMap();
  if (!forceRefresh && cache[key]) {
    var cached = JSON.parse(JSON.stringify(cache[key]));
    cached.fromCache = true;
    return cached;
  }
  var query = portalBuildRepResearchQuery(entry);
  var searchData = await portalRunPublicWebSearch(query);
  var result = await portalExtractRepResearch(entry, searchData, query);
  cache[key] = result;
  portalSaveRepCacheMap(cache);
  result.fromCache = false;
  return result;
}

function portalRepContactMarkup(item) {
  var parts = [];
  if (item.publicBusinessEmail) {
    parts.push('<a href="mailto:' + portalEsc(item.publicBusinessEmail) + '">' + portalEsc(item.publicBusinessEmail) + '</a>');
  }
  if (item.publicBusinessPhone) {
    parts.push('<a href="tel:' + portalEsc(item.publicBusinessPhone) + '">' + portalEsc(item.publicBusinessPhone) + '</a>');
  }
  if (item.publicWebsite) {
    parts.push('<a href="' + portalEsc(item.publicWebsite) + '" target="_blank" rel="noopener noreferrer">Website</a>');
  }
  if (item.contactPage && item.contactPage !== item.publicWebsite) {
    parts.push('<a href="' + portalEsc(item.contactPage) + '" target="_blank" rel="noopener noreferrer">Contact page</a>');
  }
  if (!parts.length) return '<span class="muted">No public business contact found</span>';
  return parts.join('<br>');
}

function portalRepSourcesMarkup(item) {
  var sources = portalNormalizeRepSources(item && item.sources ? item.sources : []);
  if (!sources.length) return '<span class="muted">No sources saved</span>';
  return sources.map(function (src) {
    return '<a href="' + portalEsc(src.url) + '" target="_blank" rel="noopener noreferrer">' + portalEsc(src.title) + '</a>';
  }).join('<br>');
}

function portalRenderRepResults() {
  if (!portalRepBodyEl) return;
  portalRepBodyEl.innerHTML = '';

  var rows = (portalRepResults || []).slice().sort(function (a, b) {
    var diff = portalRepConfidenceRank(b && b.confidence) - portalRepConfidenceRank(a && a.confidence);
    if (diff) return diff;
    return String(a && a.playerName ? a.playerName : '').localeCompare(String(b && b.playerName ? b.playerName : ''));
  });

  var frag = document.createDocumentFragment();
  rows.forEach(function (item) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><div class="portalRepPlayer">' + portalEsc(item.playerName || 'Unknown') + '</div><div class="portalRepMeta">' + portalEsc(item.status || 'Portal') + '</div></td>' +
      '<td>' + portalEsc(item.fromTeam || '—') + '</td>' +
      '<td><div class="portalRepPlayer">' + portalEsc(item.repName || (item.hasPublicRepresentation ? 'Public rep found' : 'No public rep found')) + '</div><div class="portalRepMeta">' + portalEsc(item.organization || '—') + '</div></td>' +
      '<td class="portalRepContactCell">' + portalRepContactMarkup(item) + '</td>' +
      '<td><span class="portalRepConfidence ' + portalRepConfidenceClass(item.confidence) + '">' + portalEsc(item.confidence || 'none') + '</span></td>' +
      '<td class="portalRepSourcesCell">' + portalRepSourcesMarkup(item) + '</td>' +
      '<td>' + portalEsc(item.notes || '—') + '</td>';
    frag.appendChild(tr);
  });
  portalRepBodyEl.appendChild(frag);

  if (portalRepCountEl) portalRepCountEl.textContent = String(rows.length);
  if (portalRepEmptyEl) {
    portalRepEmptyEl.style.display = rows.length ? 'none' : '';
    portalRepEmptyEl.textContent = rows.length ? '' : 'No representation research cached for the current filtered portal board yet.';
  }
  if (portalRepExportBtnEl) portalRepExportBtnEl.disabled = !rows.length || portalRepBusy;
}

function portalSyncRepResultsFromCache() {
  var cache = portalLoadRepCacheMap();
  var seen = {};
  portalRepResults = portalFiltered.map(function (entry) {
    var key = portalRepEntryKey(entry);
    if (seen[key]) return null;
    seen[key] = true;
    return cache[key] || null;
  }).filter(Boolean);
  portalRenderRepResults();
}

function portalCsvEscape(value) {
  var str = String(value == null ? '' : value);
  if (/[",\n]/.test(str)) str = '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function portalExportRepResearchCsv() {
  var rows = (portalRepResults || []).slice();
  if (!rows.length) {
    portalSetRepStatus('No representation research results to export.');
    return;
  }
  var headers = [
    'Player', 'From Team', 'Status', 'Rep Name', 'Organization', 'Public Business Email',
    'Public Business Phone', 'Public Website', 'Contact Page', 'Confidence', 'Notes', 'Sources'
  ];
  var lines = [headers.map(portalCsvEscape).join(',')];
  rows.forEach(function (item) {
    lines.push([
      item.playerName,
      item.fromTeam,
      item.status,
      item.repName,
      item.organization,
      item.publicBusinessEmail,
      item.publicBusinessPhone,
      item.publicWebsite,
      item.contactPage,
      item.confidence,
      item.notes,
      (item.sources || []).map(function (src) { return (src.title || '') + ' ' + (src.url || ''); }).join(' | ')
    ].map(portalCsvEscape).join(','));
  });
  var blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'portal_rep_research_' + portalCurrentSport() + '_' + portalGetSeason() + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  portalSetRepStatus('CSV exported for ' + rows.length + ' researched portal players.');
}

function portalClearRepResearch() {
  var ok = true;
  try {
    ok = window.confirm('Clear cached public representation research for the current portal season?');
  } catch (_) {}
  if (!ok) return;
  try {
    localStorage.removeItem(portalRepStorageKey());
  } catch (_) {}
  portalRepResults = [];
  portalRenderRepResults();
  portalSetRepStatus('Cleared cached public representation research.');
}

async function portalRunRepResearch(forceRefresh) {
  if (portalRepBusy) return;
  if (!portalFiltered.length) {
    portalSetRepStatus('No filtered portal players to research.');
    portalRenderRepResults();
    return;
  }

  var limit = parseInt(portalRepLimitEl && portalRepLimitEl.value ? portalRepLimitEl.value : '20', 10);
  if (!Number.isFinite(limit)) limit = 20;
  limit = Math.max(1, Math.min(60, limit));
  if (portalRepLimitEl) portalRepLimitEl.value = String(limit);

  var entries = portalFiltered.slice(0, limit);
  var withSignals = 0;
  var cacheHits = 0;
  portalRepBusy = true;
  if (portalRepResearchBtnEl) portalRepResearchBtnEl.disabled = true;
  if (portalRepExportBtnEl) portalRepExportBtnEl.disabled = true;
  if (portalRepClearBtnEl) portalRepClearBtnEl.disabled = true;

  try {
    for (var i = 0; i < entries.length; i++) {
      portalSetRepStatus('Researching ' + (i + 1) + '/' + entries.length + ' - ' + (entries[i].playerName || 'Player'));
      var result = await portalResearchRepForEntry(entries[i], !!forceRefresh);
      if (result && result.hasPublicRepresentation) withSignals += 1;
      if (result && result.fromCache) cacheHits += 1;
      portalSyncRepResultsFromCache();
    }
    portalSetRepStatus('Done - ' + entries.length + ' players researched, ' + withSignals + ' with public rep signals, ' + cacheHits + ' cache hits. Public business contacts only.');
  } catch (e) {
    portalSetRepStatus('Representation research failed: ' + (e && e.message ? e.message : String(e)));
  } finally {
    portalRepBusy = false;
    if (portalRepResearchBtnEl) portalRepResearchBtnEl.disabled = false;
    if (portalRepClearBtnEl) portalRepClearBtnEl.disabled = false;
    portalRenderRepResults();
  }
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
    portalNorm(it && it.sport ? it.sport : portalCurrentSport()),
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
    if (String(fav.league || 'MBB').toUpperCase() !== portalCurrentLeague()) return;
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
    portalRefreshScenarioRows();
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

  var roster = (portalAllPlayers || []).filter(function (p) {
    return portalNorm(portalGetPlayerTeam(p)) === portalNorm(teamName);
  });

  // If no roster found, try to collect players again (in case they loaded after team dropdown was built)
  if (!roster.length && portalGetAllPlayers) {
    portalCollectAllPlayers();
    roster = (portalAllPlayers || []).filter(function (p) {
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
  portalRefreshScenarioRows();
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

function portalBuildRecommendationContext() {
  if (!portalTeamCtx || !portalTeamCtx.roster || !portalTeamCtx.roster.length) return null;
  if (!portalRecDist) portalRecDist = portalBuildDistributions(portalCollectAllPlayers());

  var removedNames = portalSelectedReplaceNames();
  var departurePlayers = portalSelectedDeparturePlayers();
  var removedSet = Object.create(null);
  removedNames.forEach(function (name) {
    removedSet[portalNorm(name)] = true;
  });

  var baseRoster = portalTeamCtx.roster.filter(function (player) {
    return !removedSet[portalNorm(portalGetPlayerName(player))];
  });
  if (!baseRoster.length) baseRoster = portalTeamCtx.roster.slice();

  var defs = portalCategoryDefsForRoster(baseRoster);
  var catBase = portalCategoryScoresForRoster(baseRoster, defs, portalRecDist);
  var catRemoved = removedNames.length
    ? portalCategoryScoresForRoster(portalTeamCtx.roster.filter(function (player) {
        return removedSet[portalNorm(portalGetPlayerName(player))];
      }), defs, portalRecDist)
    : null;

  return {
    removedNames: removedNames,
    removedSet: removedSet,
    departurePlayers: departurePlayers,
    departureImpactAvg: portalAverage(departurePlayers.map(function (player) {
      return portalCandidateImpact(player, portalRecDist);
    })),
    baseRoster: baseRoster,
    defs: defs,
    catBase: catBase,
    catRemoved: catRemoved,
    priority: portalCategoryPriorityFromTeamStats(portalTeamCtx.stats),
    targetValue: portalAverage(departurePlayers.map(function (player) {
      return portalGetPlayerValuation(player);
    })),
  };
}

function portalBuildScenarioSummary(player, ctx, meta) {
  var scenarioRoster = (ctx.baseRoster || []).concat([player]);
  var catScenario = portalCategoryScoresForRoster(scenarioRoster, ctx.defs, portalRecDist);
  var lifts = [];
  var weightedDeltaNum = 0;
  var weightedDeltaDen = 0;

  (ctx.defs || []).forEach(function (cat) {
    var before = Number.isFinite(ctx.catBase[cat.label]) ? ctx.catBase[cat.label] : 0.5;
    var after = Number.isFinite(catScenario[cat.label]) ? catScenario[cat.label] : 0.5;
    var delta = after - before;
    var weight = ctx.priority[cat.label] || 1;
    weightedDeltaNum += weight * delta;
    weightedDeltaDen += weight;
    lifts.push({ label: cat.label, delta: delta });
  });

  lifts.sort(function (a, b) { return b.delta - a.delta; });
  var weightedDelta = weightedDeltaDen > 0 ? (weightedDeltaNum / weightedDeltaDen) : 0;
  var impactEdge = (Number.isFinite(meta.impact) ? meta.impact : 0.5) - (ctx.departureImpactAvg == null ? 0.5 : ctx.departureImpactAvg);
  var deltaMeter = portalClamp01(0.5 + weightedDelta * 4);
  var impactMeter = portalClamp01(0.5 + impactEdge);
  var scenarioFit = portalClamp01(
    0.44 * meta.fit +
    0.22 * deltaMeter +
    0.12 * impactMeter +
    0.12 * meta.valueFit +
    0.10 * meta.positionFit
  );

  var verdict = 'Pass';
  var tone = 'bad';
  if (scenarioFit >= 0.78 && weightedDelta >= -0.01 && meta.positionFit >= 0.68) {
    verdict = 'Strong fit';
    tone = 'good';
  } else if (scenarioFit >= 0.67 && weightedDelta >= -0.03) {
    verdict = 'Solid pick';
    tone = 'good';
  } else if (scenarioFit >= 0.56) {
    verdict = 'Situational';
    tone = 'warn';
  }

  var valueView = 'Price sensitive';
  if (meta.candidateValue === null || meta.targetValue === null || meta.targetValue <= 0) {
    valueView = meta.valueFit >= 0.72 ? 'Worth the price' : 'Price sensitive';
  } else if (meta.candidateValue <= meta.targetValue * 0.9 && meta.valueFit >= 0.72) {
    valueView = 'Value bet';
  } else if (meta.candidateValue <= meta.targetValue * 1.12) {
    valueView = meta.valueFit >= 0.68 ? 'Worth the price' : 'Price sensitive';
  } else if (meta.candidateValue > meta.targetValue * 1.3) {
    valueView = 'Overpay risk';
  }

  var reasons = [];
  var improved = lifts.filter(function (item) { return item.delta > 0.01; }).slice(0, 2);
  if (improved.length) {
    reasons.push('Improves ' + improved.map(function (item) { return item.label; }).join(' + '));
  } else if (weightedDelta < -0.01) {
    reasons.push('Does not directly fix top team needs');
  }
  if (meta.valueFit >= 0.76) {
    reasons.push(valueView === 'Value bet' ? 'Keeps the deal in a strong value band' : 'Talent jump looks worth the band');
  } else if (valueView === 'Overpay risk') {
    reasons.push('Price climbs above the departing value band');
  }
  if (meta.positionFit < 0.45) reasons.push('Cross-position swing');
  if (meta.risks && meta.risks.length) reasons.push('Main risk: ' + meta.risks[0]);

  return {
    weightedDelta: weightedDelta,
    deltaPts: Math.round(weightedDelta * 100),
    impactEdge: impactEdge,
    scenarioFit: scenarioFit,
    verdict: verdict,
    tone: tone,
    valueView: valueView,
    reasons: reasons.slice(0, 3),
  };
}

function portalScoreCandidateEntry(entry, player, ctx) {
  if (!ctx || !entry || !player) return null;
  var playerTeam = portalNorm(portalGetPlayerTeam(player));
  if (playerTeam === portalNorm(portalTeamCtx.team)) return null;

  var catPlayer = portalCategoryScoresForPlayer(player, ctx.defs, portalRecDist);
  var needNum = 0;
  var needDen = 0;
  var reasonPool = [];
  ctx.defs.forEach(function (cat) {
    var baseVal = ctx.catBase[cat.label];
    var candVal = catPlayer[cat.label];
    var baseNeed = Math.max(0.05, 1 - (Number.isFinite(baseVal) ? baseVal : 0.5));
    var weight = baseNeed * (ctx.priority[cat.label] || 1);
    var contrib = weight * (Number.isFinite(candVal) ? candVal : 0.5);
    needNum += contrib;
    needDen += weight;
    reasonPool.push({
      label: cat.label,
      contrib: contrib,
      cand: candVal,
      need: baseNeed,
    });
  });

  var needFit = needDen > 0 ? (needNum / needDen) : 0.5;
  var impact = portalCandidateImpact(player, portalRecDist);
  var replaceGain = null;
  if (ctx.catRemoved) {
    var gainNum = 0;
    var gainDen = 0;
    ctx.defs.forEach(function (cat) {
      var cand = catPlayer[cat.label];
      var removed = ctx.catRemoved[cat.label];
      var weight = ctx.priority[cat.label] || 1;
      gainNum += weight * ((Number.isFinite(cand) ? cand : 0.5) - (Number.isFinite(removed) ? removed : 0.5));
      gainDen += weight;
    });
    replaceGain = gainDen > 0 ? (gainNum / gainDen) : 0;
  }

  var style = 0.5;
  if (portalTeamCtx.zones && portalTeamCtx.zones.attemptsBreakdown) {
    var threeShare = portalSafeNum(portalTeamCtx.zones.attemptsBreakdown.threePointJumpers);
    var shooter = portalSafeNum(player['3P%']);
    if (threeShare !== null && shooter !== null) {
      style = (threeShare >= 35 && shooter >= 35) ? 0.72 : (threeShare < 30 && shooter >= 35 ? 0.62 : 0.5);
    }
  }

  var positionFit = portalPositionFitScore(player, ctx.departurePlayers);
  var valueFit = portalValueFitScore(player, impact, replaceGain, ctx.targetValue);
  var upside = portalUpsideScore(player, impact, ctx.targetValue);
  var candidateValue = portalGetPlayerValuation(player);

  var final =
    0.27 * needFit +
    0.14 * style +
    0.14 * impact +
    0.16 * positionFit +
    0.17 * valueFit +
    0.08 * upside +
    0.04 * 0.55;
  if (replaceGain !== null) final += 0.16 * replaceGain;

  var risks = portalCandidateRisk(player);
  if (risks.length) final -= Math.min(0.12, 0.03 * risks.length);
  final = portalClamp01(final);

  var reasons = portalBuildRecommendationReasons(reasonPool, {
    departurePlayers: ctx.departurePlayers,
    positionFit: positionFit,
    valueFit: valueFit,
    upside: upside,
    replaceGain: replaceGain,
    targetValue: ctx.targetValue,
    candidateValue: candidateValue
  });

  var row = {
    entry: entry,
    player: player,
    fit: final,
    needFit: needFit,
    style: style,
    impact: impact,
    positionFit: positionFit,
    valueFit: valueFit,
    upside: upside,
    replaceGain: replaceGain,
    positionGroup: portalPlayerPosGroup(player),
    replacementType: portalReplacementType(positionFit, valueFit, upside, replaceGain, ctx.targetValue, candidateValue),
    candidateValue: candidateValue,
    targetValue: ctx.targetValue,
    reasons: reasons,
    risks: risks,
  };

  var scenario = portalBuildScenarioSummary(player, ctx, row);
  row.scenario = scenario;
  row.scenarioFit = scenario.scenarioFit;
  row.scenarioVerdict = scenario.verdict;
  row.scenarioTone = scenario.tone;
  return row;
}

function portalRefreshScenarioRows() {
  var targets = portalLoadTargetList();
  var ctx = portalBuildRecommendationContext();
  var rows = [];

  targets.forEach(function (target) {
    var entry = {
      playerName: target.playerName,
      fromTeam: target.fromTeam,
      team: target.fromTeam,
      position: target.position,
      source: target.source,
      url: target.url,
    };
    var player = portalFindPlayerMatch(target.playerName, target.fromTeam);
    var sameTeam = player && portalTeamCtx && portalNorm(portalGetPlayerTeam(player)) === portalNorm(portalTeamCtx.team);
    var scored = (!sameTeam && player && ctx) ? portalScoreCandidateEntry(entry, player, ctx) : null;
    if (scored) {
      scored.savedTarget = target;
      rows.push(scored);
      return;
    }
    rows.push({
      entry: entry,
      player: player,
      savedTarget: target,
      candidateValue: player ? portalGetPlayerValuation(player) : null,
      targetMissing: !player,
      sameTeam: !!sameTeam,
    });
  });

  rows.sort(function (a, b) {
    var left = a.scenarioFit || a.fit || 0;
    var right = b.scenarioFit || b.fit || 0;
    if (right !== left) return right - left;
    return String((a.savedTarget && a.savedTarget.addedAt) || '').localeCompare(String((b.savedTarget && b.savedTarget.addedAt) || '')) * -1;
  });

  portalScenarioRows = rows;
  portalRenderScenarioRows();
  return rows;
}

function portalRenderScenarioRows() {
  if (!portalTargetBodyEl) return;
  portalTargetBodyEl.innerHTML = '';

  var rows = portalScenarioRows || [];
  if (portalTargetCountEl) portalTargetCountEl.textContent = String(rows.length);
  if (portalTargetClearBtnEl) portalTargetClearBtnEl.disabled = !rows.length;

  if (portalTargetStatusEl) {
    if (!rows.length) {
      portalTargetStatusEl.textContent = 'Tag portal players from the board or recommendation list to score them as real-fit scenarios.';
    } else if (!portalTeamCtx || !portalTeamCtx.roster || !portalTeamCtx.roster.length) {
      portalTargetStatusEl.textContent = 'Select a team to turn this shortlist into scored fit scenarios.';
    } else if (!portalSelectedDepartureNames.length) {
      portalTargetStatusEl.textContent = 'No departures selected. Scenario grades currently reflect overall fit for ' + portalTeamCtx.team + '.';
    } else {
      portalTargetStatusEl.textContent = 'Shortlist scored for ' + portalTeamCtx.team + ' against departures: ' + portalSelectedDepartureNames.join(', ') + '. AI analysis will grade these targets first.';
    }
  }

  if (!rows.length) {
    if (portalTargetEmptyEl) portalTargetEmptyEl.style.display = '';
    return;
  }
  if (portalTargetEmptyEl) portalTargetEmptyEl.style.display = 'none';

  rows.forEach(function (row) {
    var tr = document.createElement('tr');
    var playerName = row.entry.playerName || portalGetPlayerName(row.player) || 'Unknown';
    var teamName = row.entry.fromTeam || portalGetPlayerTeam(row.player) || '—';
    var posLabel = row.entry.position || (row.player && (row.player.Position || row.player.Pos)) || '—';
    var fitPct = Number.isFinite(row.fit) ? Math.round(row.fit * 100) : null;
    var scenarioPct = Number.isFinite(row.scenarioFit) ? Math.round(row.scenarioFit * 100) : null;
    var deltaPts = row.scenario ? row.scenario.deltaPts : null;
    var deltaClass = deltaPts === null ? 'portalScenarioDelta--flat' : (deltaPts > 0 ? 'portalScenarioDelta--pos' : (deltaPts < 0 ? 'portalScenarioDelta--neg' : 'portalScenarioDelta--flat'));
    var verdict = row.scenario ? row.scenario.verdict : (row.targetMissing ? 'No match' : (row.sameTeam ? 'Same team' : 'Awaiting team'));
    var tone = row.scenario ? row.scenario.tone : (row.targetMissing ? 'bad' : 'warn');
    var valueText = portalFmtMoney(row.candidateValue);
    if (row.targetValue != null && row.candidateValue != null && row.targetValue > 0) {
      var pctDelta = Math.round(((row.candidateValue - row.targetValue) / row.targetValue) * 100);
      valueText += '<div class="muted" style="font-size:10px">' + (pctDelta >= 0 ? '+' : '') + pctDelta + '% vs loss band</div>';
    }

    var whyText = 'Select a team to score this target.';
    if (row.scenario && row.scenario.reasons && row.scenario.reasons.length) {
      whyText = row.scenario.reasons.join(' · ');
    } else if (row.scenario) {
      whyText = 'Balanced fit profile with no major red flags from the current scenario model.';
    } else if (row.sameTeam) {
      whyText = 'This player is already on the selected team roster, so no portal scenario applies.';
    } else if (row.targetMissing) {
      whyText = 'No dashboard player match was found, so the model cannot score this portal target yet.';
    }

    tr.innerHTML =
      '<td><b>' + portalEsc(playerName) + '</b><div class="muted" style="font-size:10px">' + portalEsc(row.replacementType || 'Shortlist target') + '</div></td>' +
      '<td>' + portalEsc(teamName) + '</td>' +
      '<td>' + portalEsc(posLabel) + '</td>' +
      '<td>' + (fitPct === null ? '—' : ('<span class="portalFitPill">' + fitPct + '</span>')) + '</td>' +
      '<td>' + (scenarioPct === null ? '—' : ('<span class="portalFitPill">' + scenarioPct + '</span>')) +
        '<div class="portalScenarioDelta ' + deltaClass + '">' + (deltaPts === null ? 'Awaiting team' : ((deltaPts >= 0 ? '+' : '') + deltaPts + ' need pts')) + '</div></td>' +
      '<td>' + valueText + '</td>' +
      '<td><span class="portalVerdictPill portalVerdictPill--' + tone + '">' + portalEsc(verdict) + '</span></td>' +
      '<td><div style="font-size:11px">' + portalEsc(whyText) + '</div></td>' +
      '<td><div style="display:flex;gap:6px;flex-wrap:wrap">' +
        (row.player ? '<button class="secondary portalTargetOpen" style="padding:3px 8px;font-size:10px">Open</button>' : '') +
        '<button class="secondary portalTargetRemove" style="padding:3px 8px;font-size:10px">Remove</button>' +
      '</div></td>';

    var openBtn = tr.querySelector('.portalTargetOpen');
    if (openBtn) {
      openBtn.addEventListener('click', function () {
        if (typeof openProfile === 'function' && row.player) openProfile(row.player);
      });
    }
    var removeBtn = tr.querySelector('.portalTargetRemove');
    if (removeBtn) {
      removeBtn.addEventListener('click', function () {
        portalToggleTarget(row.entry, row.player || {
          Player: row.entry.playerName,
          Team: row.entry.fromTeam,
          Position: row.entry.position,
          Pos: row.entry.position,
        });
      });
    }

    portalTargetBodyEl.appendChild(tr);
  });
}

function portalComputeRecommendations() {
  var ctx = portalBuildRecommendationContext();
  if (!ctx) {
    portalRecRows = [];
    portalRefreshScenarioRows();
    return [];
  }

  var rows = [];
  portalFiltered.forEach(function (entry) {
    var scored = portalScoreCandidateEntry(entry, portalFindPlayerMatch(entry.playerName, entry.fromTeam), ctx);
    if (scored) rows.push(scored);
  });

  rows.sort(function (a, b) { return b.fit - a.fit; });
  rows = portalEnforcePositionBalance(rows, ctx.departurePlayers);
  portalRecRows = rows.slice(0, 25);
  portalRefreshScenarioRows();
  return portalRecRows;
}

function portalRenderRecommendations() {
  if (!portalRecBodyEl) return;
  portalRecBodyEl.innerHTML = '';
  var targetMap = portalTargetListToMap(portalLoadTargetList());

  if (!portalRecRows.length) {
    if (portalRecEmptyEl) {
      portalRecEmptyEl.style.display = '';
      if (!portalRecEmptyEl.textContent || portalRecEmptyEl.textContent === 'Scoring fit candidates...') {
        portalRecEmptyEl.textContent = !portalFiltered.length
          ? 'No portal entries are available for the current board filters.'
          : 'No matched portal fit candidates were found for the current board and team context.';
      }
    }
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
    var targetKey = portalTargetKey(row.entry, row.player);
    var isTargeted = !!targetMap[targetKey];

    tr.innerHTML =
      '<td>' + (idx + 1) + '</td>' +
      '<td><b>' + nm + '</b><div class="muted" style="font-size:10px">Perf ' + (perf === null ? '—' : portalFmtNum(perf, 1)) + ' · ' + portalEsc(row.replacementType || 'Fit') + '</div></td>' +
      '<td>' + team + '</td>' +
      '<td>' + (row.entry.position || row.player.Position || row.player.Pos || '—') + '</td>' +
      '<td><span class="portalFitPill">' + fitPct + '</span></td>' +
      '<td>' + gainTxt + '</td>' +
      '<td><div style="font-size:11px">' + row.reasons.join(' · ') + '</div>' +
      (row.risks.length ? ('<div class="portalRiskText">Risk: ' + row.risks.join(', ') + '</div>') : '') + '</td>' +
      '<td><div style="display:flex;gap:6px;flex-wrap:wrap">' +
      '<button class="tbAddBtn portalRecAdd" ' + (addDisabled ? 'disabled' : '') + '>+ Add</button>' +
      '<button class="secondary portalRecTarget portalTargetBtn' + (isTargeted ? ' isActive' : '') + '" style="padding:3px 8px;font-size:10px">' + (isTargeted ? 'Targeted' : '+ Target') + '</button>' +
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
    var btnTarget = tr.querySelector('.portalRecTarget');
    if (btnTarget) {
      btnTarget.addEventListener('click', function () {
        portalToggleTarget(row.entry, row.player);
      });
    }
    portalRecBodyEl.appendChild(tr);
  });
}

async function portalFetchWbbGameLog(player, season) {
  var espnId = player && player.EspnId;
  if (!espnId) return [];
  try {
    var url = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/womens-college-basketball/athletes/'
      + espnId + '/gamelog?season=' + encodeURIComponent(season);
    var resp = await fetch(url);
    if (!resp.ok) return [];
    var data = await resp.json();
    var games = [];
    var events = data.events || {};
    var seasonTypes = data.seasonTypes || [];

    seasonTypes.forEach(function (seasonType) {
      var isPost = seasonType.type === 3 || Number(seasonType.id) === 3 || String(seasonType.displayName || '').toLowerCase().indexOf('post') >= 0;
      (seasonType.categories || []).forEach(function (category) {
        var labels = category.labels || data.labels || [];
        (category.events || []).forEach(function (eventItem) {
          var stats = eventItem.stats || [];
          var statMap = {};
          labels.forEach(function (label, idx) { statMap[label] = stats[idx]; });

          var eventInfo = events[String(eventItem.eventId)] || {};
          var opponent = eventInfo.opponent || {};
          var dateStr = String(eventInfo.gameDate || eventInfo.date || '').slice(0, 10);
          var homeAway = String(eventInfo.homeAway || 'home').toLowerCase() === 'home' ? 'H' : 'A';
          var score = String(eventInfo.score || '').split('-').map(Number);
          var result = '—';
          if (score.length === 2 && !isNaN(score[0]) && !isNaN(score[1])) {
            var myScore = homeAway === 'H' ? score[0] : score[1];
            var oppScore = homeAway === 'H' ? score[1] : score[0];
            result = (eventInfo.gameResult || (myScore > oppScore ? 'W' : 'L')) + ' ' + myScore + '-' + oppScore;
          }

          var fgRaw = String(statMap['FGM-FGA'] || statMap.FG || '').split('-');
          games.push({
            date: dateStr || null,
            opponent: opponent.displayName || opponent.abbreviation || '',
            homeAway: homeAway,
            result: result,
            seasonType: isPost ? 'postseason' : 'regular',
            points: parseInt(statMap.PTS || 0, 10) || 0,
            rebounds: parseInt(statMap.REB || 0, 10) || 0,
            assists: parseInt(statMap.AST || 0, 10) || 0,
            steals: parseInt(statMap.STL || 0, 10) || 0,
            blocks: parseInt(statMap.BLK || 0, 10) || 0,
            minutes: statMap.MIN || null,
            fgm: parseInt(fgRaw[0], 10) || 0,
            fga: parseInt(fgRaw[1], 10) || 0,
          });
        });
      });
    });

    return games.sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || ''));
    });
  } catch (_) {
    return [];
  }
}

async function portalFetchPlayerGameLog(player, season, isWbb) {
  if (!player) return [];
  if (isWbb) return portalFetchWbbGameLog(player, season);
  if (typeof WORKER_URL === 'undefined') return [];

  var team = portalGetPlayerTeam(player);
  var playerName = portalGetPlayerName(player);
  if (!team || !playerName) return [];

  try {
    var url = WORKER_URL + '/api/cbdata/playergamelog?team=' + encodeURIComponent(team)
      + '&season=' + encodeURIComponent(season)
      + '&playerName=' + encodeURIComponent(playerName);
    var resp = await fetch(url);
    if (!resp.ok) return [];
    var data = await resp.json();
    return Array.isArray(data.games) ? data.games : [];
  } catch (_) {
    return [];
  }
}

function portalSummarizePlayerGameLog(games) {
  var rows = (games || []).filter(function (game) {
    return game && (
      portalSafeNum(game.points) !== null ||
      portalSafeNum(game.rebounds) !== null ||
      portalSafeNum(game.assists) !== null
    );
  });
  if (!rows.length) return null;

  rows.sort(function (a, b) {
    return String(a.date || '').localeCompare(String(b.date || ''));
  });

  var lastFive = rows.slice(-5);
  var seasonPts = portalAverage(rows.map(function (game) { return portalSafeNum(game.points); }));
  var seasonReb = portalAverage(rows.map(function (game) { return portalSafeNum(game.rebounds); }));
  var seasonAst = portalAverage(rows.map(function (game) { return portalSafeNum(game.assists); }));
  var lastFivePts = portalAverage(lastFive.map(function (game) { return portalSafeNum(game.points); }));
  var lastFiveReb = portalAverage(lastFive.map(function (game) { return portalSafeNum(game.rebounds); }));
  var lastFiveAst = portalAverage(lastFive.map(function (game) { return portalSafeNum(game.assists); }));
  var trendDelta = (seasonPts === null || lastFivePts === null) ? null : +(lastFivePts - seasonPts).toFixed(1);

  return {
    gamesPlayed: rows.length,
    seasonAvg: {
      points: seasonPts,
      rebounds: seasonReb,
      assists: seasonAst
    },
    lastFiveAvg: {
      points: lastFivePts,
      rebounds: lastFiveReb,
      assists: lastFiveAst
    },
    scoring20PlusGames: rows.filter(function (game) { return (portalSafeNum(game.points) || 0) >= 20; }).length,
    doubleDigitScoringGames: rows.filter(function (game) { return (portalSafeNum(game.points) || 0) >= 10; }).length,
    bestScoringGame: rows.reduce(function (best, game) {
      var pts = portalSafeNum(game.points) || 0;
      return pts > best ? pts : best;
    }, 0),
    trendDeltaPoints: trendDelta,
    trendLabel: trendDelta === null ? 'steady' : (trendDelta >= 2 ? 'up' : (trendDelta <= -2 ? 'down' : 'steady'))
  };
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

function portalPrepMarkdownTableLine(line) {
  return String(line || '')
    .trim()
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .trim();
}

function portalIsMarkdownTableLine(line) {
  var trimmed = portalPrepMarkdownTableLine(line);
  if (!trimmed || /^```/.test(trimmed)) return false;
  if (/^#{1,6}\s+/.test(trimmed)) return false;
  var pipeCount = (trimmed.match(/\|/g) || []).length;
  if (pipeCount < 2) return false;
  return /^\|/.test(trimmed) || /\|$/.test(trimmed) || /\s\|\s/.test(trimmed) || pipeCount >= 4;
}

function portalNormalizeMarkdownTableLine(line) {
  var trimmed = portalPrepMarkdownTableLine(line);
  if (!portalIsMarkdownTableLine(trimmed)) return '';
  if (trimmed.charAt(0) !== '|') trimmed = '| ' + trimmed;
  if (trimmed.charAt(trimmed.length - 1) !== '|') trimmed += ' |';
  return trimmed;
}

function portalIsMarkdownTableSeparatorRow(cells) {
  if (!cells || !cells.length) return false;
  for (var i = 0; i < cells.length; i++) {
    var compact = String(cells[i] || '').replace(/\s+/g, '');
    if (!compact || !/^:?-{3,}:?$/.test(compact)) return false;
  }
  return true;
}

function portalParseMarkdownTable(lines, startIndex) {
  var rows = [];
  var sawSeparator = false;
  var sawTableLine = false;
  var idx = startIndex;
  while (idx < lines.length) {
    var rawLine = lines[idx];
    if (!rawLine || !rawLine.trim()) {
      if (sawTableLine) {
        idx++;
        continue;
      }
      break;
    }
    if (!portalIsMarkdownTableLine(rawLine)) break;
    sawTableLine = true;
    var normalized = portalNormalizeMarkdownTableLine(rawLine);
    var cells = normalized.split('|').slice(1, -1).map(function(c) {
      return c.trim().replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
    });
    if (portalIsMarkdownTableSeparatorRow(cells)) {
      sawSeparator = true;
      idx++;
      continue;
    }
    rows.push(cells);
    idx++;
  }
  if (rows.length < 2) return null;
  var columnCount = rows[0].length;
  for (var r = 1; r < rows.length; r++) {
    if (rows[r].length > columnCount) {
      rows[r] = rows[r].slice(0, columnCount - 1).concat([rows[r].slice(columnCount - 1).join(' | ')]);
    }
    while (rows[r].length < columnCount) rows[r].push('');
  }
  return { rows: rows, nextIndex: idx - 1 };
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

      var parsedTable = portalParseMarkdownTable(lines, i);
      if (parsedTable) {
        i = parsedTable.nextIndex;
        var tableRows = parsedTable.rows;
        var numCols = tableRows[0].length;
        var colWeights = numCols === 6 ? [0.85, 1.15, 1.05, 1.35, 0.7, 1.9] : [];
        var totalWeight = 0;
        var colWidths = [];
        for (var cw = 0; cw < numCols; cw++) totalWeight += (colWeights[cw] || 1);
        for (var cx = 0; cx < numCols; cx++) colWidths[cx] = contentW * ((colWeights[cx] || 1) / totalWeight);

        var hdr = tableRows[0];
        var headerWrapped = [];
        var headerLineCount = 1;
        for (var hw = 0; hw < numCols; hw++) {
          headerWrapped[hw] = doc.splitTextToSize(hdr[hw] || '', Math.max(20, colWidths[hw] - 6));
          headerLineCount = Math.max(headerLineCount, headerWrapped[hw].length || 1);
        }
        var headerH = Math.max(20, headerLineCount * 8 + 8);
        checkPage(headerH + 18);

        doc.setFillColor(15, 30, 60);
        doc.rect(margin, y - 12, contentW, headerH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        var headerX = margin;
        for (var hc = 0; hc < numCols; hc++) {
          doc.text(headerWrapped[hc], headerX + 3, y);
          headerX += colWidths[hc];
        }
        y += headerH - 4;
        doc.setFillColor(255, 210, 0);
        doc.rect(margin, y - 2, contentW, 1.5, 'F');
        y += 6;

        for (var tr = 1; tr < tableRows.length; tr++) {
          var wrappedCells = [];
          var lineCount = 1;
          for (var tc = 0; tc < numCols; tc++) {
            wrappedCells[tc] = doc.splitTextToSize(tableRows[tr][tc] || '', Math.max(20, colWidths[tc] - 6));
            lineCount = Math.max(lineCount, wrappedCells[tc].length || 1);
          }
          var rowH = Math.max(16, lineCount * 8 + 6);
          checkPage(rowH + 4);
          if (tr % 2 === 0) {
            doc.setFillColor(243, 245, 252);
            doc.rect(margin, y - 12, contentW, rowH, 'F');
          }
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(40, 48, 68);
          var cellX = margin;
          for (var td = 0; td < numCols; td++) {
            doc.text(wrappedCells[td], cellX + 3, y);
            cellX += colWidths[td];
          }
          y += rowH;
        }
        y += 6;
        doc.setTextColor(0, 0, 0);
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
  var htmlBody = portalFmtAIMarkdown(reportText);
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
    'table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11.5px;}' +
    'th{background:#0f1e3c;color:#fff;text-align:left;padding:6px 8px;font-size:11px;}' +
    'td{padding:5px 8px;border-bottom:1px solid #e0e0e0;}' +
    'tr:nth-child(even) td{background:#f5f7fc;}' +
    '@media print{body{margin:0;}.hdr,.accent{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}' +
    '</style></head><body>' +
    '<div class="hdr"><h1>Transfer Portal Fit Report</h1>' +
    '<p class="meta">' + teamName + ' &nbsp;·&nbsp; Season ' + season + ' &nbsp;·&nbsp; ' + mode + '</p>' +
    '<p class="date">Generated ' + dateStr + '</p></div>' +
    '<div class="accent"></div>' +
    '<div class="body">' + htmlBody + '</div>' +
    '</body></html>');
  w.document.close();
  w.focus();
  w.print();
  portalSetAIStatus('Print dialog opened. Choose Save as PDF.');
}

function portalFmtAIMarkdown(text) {
  var esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  var lines = esc.split('\n');
  var html = '';
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i];
    var parsedTable = portalParseMarkdownTable(lines, i);
    if (parsedTable) {
      i = parsedTable.nextIndex;
      var tableRows = parsedTable.rows;
      var numCols = tableRows[0].length;
      var cells = ln.split('|').slice(1, -1);
      html += '<table class="portalAITable"><thead><tr>';
      for (var hc = 0; hc < numCols; hc++) {
        html += '<th>' + tableRows[0][hc] + '</th>';
      }
      html += '</tr></thead><tbody>';
      for (var tr = 1; tr < tableRows.length; tr++) {
        html += '<tr>';
        for (var tc = 0; tc < numCols; tc++) {
          html += '<td>' + tableRows[tr][tc] + '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      continue;
    }
    if (/^##\s+/.test(ln)) { html += '<h4>' + ln.replace(/^##\s+/, '') + '</h4>'; }
    else if (/^###\s+/.test(ln)) { html += '<h5 style="margin:8px 0 4px;font-size:12px;color:var(--accent)">' + ln.replace(/^###\s+/, '') + '</h5>'; }
    else if (/^[-*]\s+/.test(ln)) { html += '<div class="portalAIBullet">\u2022 ' + ln.replace(/^[-*]\s+/, '').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</div>'; }
    else if (/^\d+\.\s+/.test(ln)) { var m = ln.match(/^(\d+)\.\s+(.*)/); html += '<div class="portalAIBullet"><b>' + m[1] + '.</b> ' + m[2].replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</div>'; }
    else if (ln.trim() === '') { html += '<br>'; }
    else { html += '<p>' + ln.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</p>'; }
  }
  return html;
}

async function portalRunAIAnalysis() {
  var hasShortlist = (portalScenarioRows || []).some(function (row) { return row && row.player && !row.sameTeam; });
  if ((!hasShortlist && !portalRecRows.length) || !portalTeamCtx) {
    portalSetAIStatus(hasShortlist ? 'Select a team first so the shortlist can be analyzed.' : 'Run recommendations first.');
    return;
  }
  if (!portalAIOutputEl) return;

  portalAIAnalyzeBtn.disabled = true;
  if (portalAIDownloadBtn) portalAIDownloadBtn.disabled = true;
  portalAIOutputEl.style.display = 'block';

  var isWbb = portalCurrentLeague() === 'WBB';
  var leagueTag = isWbb ? 'WBB' : 'MBB';
  var sportLabel = isWbb ? 'women\'s college basketball' : 'men\'s college basketball';
  var sportLabelShort = isWbb ? 'women\'s basketball' : 'men\'s basketball';
  var teamName = portalTeamCtx.team;
  var season = portalTeamCtx.season || portalTargetSeason;
  var departures = portalSelectedDepartureNames.slice();
  var topPickCount = Math.max(8, departures.length * 5 + 2);
  var usingShortlist = hasShortlist;
  var topPicks = portalGetActiveAnalysisRows(topPickCount);
  if (!topPicks.length) topPicks = (portalRecRows || []).slice(0, topPickCount);
  if (!topPicks.length) {
    portalSetAIStatus('No scored portal targets available yet.');
    portalAIAnalyzeBtn.disabled = false;
    if (portalAIDownloadBtn) portalAIDownloadBtn.disabled = false;
    return;
  }

  // ── Phase 1: Fetch supporting player/team data for deep analysis ──
  portalSetAIStatus('Fetching player and team context for ' + teamName + '...');
  portalAIOutputEl.innerHTML = '<div class="thDeepLoading"><span class="thDeepSpinner"></span> Gathering advanced player and team data...</div>';

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

  portalSetAIStatus('Fetching source-team context for ' + pickTeamKeys.length + ' team(s)...');
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
      profile.positionGroup = portalPlayerPosGroup(rosterP);
      profile.classYear = portalGetPlayerClass(rosterP);
      profile.valuation = portalGetPlayerValuation(rosterP);
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
      profile._playerRef = rosterP;
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
      positionGroup: row.positionGroup || portalPlayerPosGroup(p),
      classYear: portalGetPlayerClass(p),
      valuation: row.candidateValue != null ? row.candidateValue : portalGetPlayerValuation(p),
      fitScore: Math.round((row.fit || 0) * 100),
      scenarioFit: row.scenarioFit != null ? Math.round((row.scenarioFit || 0) * 100) : null,
      scenarioDeltaPts: row.scenario ? row.scenario.deltaPts : null,
      scenarioVerdict: row.scenario ? row.scenario.verdict : null,
      scenarioValueView: row.scenario ? row.scenario.valueView : null,
      scenarioReasons: row.scenario ? row.scenario.reasons : [],
      replaceGainPts: row.replaceGain == null ? null : Math.round(row.replaceGain * 100),
      replacementType: row.replacementType || 'Fit',
      reasons: row.reasons,
      risks: row.risks,
      fitBreakdown: {
        teamNeed: Math.round((row.needFit || 0) * 100),
        style: Math.round((row.style || 0) * 100),
        impact: Math.round((row.impact || 0) * 100),
        positionFit: Math.round((row.positionFit || 0) * 100),
        valueFit: Math.round((row.valueFit || 0) * 100),
        upside: Math.round((row.upside || 0) * 100)
      },
      valueDeltaPct: (row.targetValue != null && row.candidateValue != null && row.targetValue > 0)
        ? Math.round(((row.candidateValue - row.targetValue) / row.targetValue) * 100)
        : null,
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
      _playerRef: p
    };
  });
  recommendedProfiles.forEach(function (r, i) { r.rank = i + 1; });

  portalSetAIStatus(usingShortlist ? 'Fetching player trend context for shortlist targets...' : 'Fetching player trend context for departures and top fits...');
  var logTargets = departureProfiles.concat(recommendedProfiles);
  for (var li = 0; li < logTargets.length; li++) {
    var profile = logTargets[li];
    if (!profile._playerRef) continue;
    try {
      var playerGames = await portalFetchPlayerGameLog(profile._playerRef, season, isWbb);
      var gameLogSummary = portalSummarizePlayerGameLog(playerGames);
      if (gameLogSummary) profile.gameLogSummary = gameLogSummary;
    } catch (_) {}
    delete profile._playerRef;
  }

  // ── Phase 2: Build deep analysis context ──
  portalSetAIStatus('Running ' + sportLabelShort + ' portal analysis with Gemini...');
  portalAIOutputEl.innerHTML = '<div class="thDeepLoading"><span class="thDeepSpinner"></span> Analyzing ' +
    (usingShortlist
      ? (recommendedProfiles.length + ' shortlisted target' + (recommendedProfiles.length !== 1 ? 's' : '') + ' for ' + sportLabelShort)
      : (departures.length + ' departure' + (departures.length !== 1 ? 's' : '') + ' and ' + recommendedProfiles.length + ' replacement candidates for ' + sportLabelShort)) +
    '...</div>';

  var deepCtx = {
    team: teamName,
    season: season,
    analysisMode: usingShortlist ? 'staff-shortlist' : 'replacement-board',
    teamRatings: portalTeamCtx.ratings || null,
    teamStats: portalTeamCtx.stats || null,
    teamShotProfile: portalTeamCtx.zones || null,
    recentGames: gameLog,
    departures: departureProfiles,
    recommendations: recommendedProfiles,
  };

  var prompt = usingShortlist
    ? (
      'You are an elite ' + sportLabel + ' roster strategist and transfer portal analyst. ' +
      'Analyze the following staff-shortlisted portal targets in depth using ALL the structured data provided.\n\n' +
      '## Context\n' +
      '**' + teamName + '** (' + season + ' season, ' + leagueTag + ') is evaluating ' + recommendedProfiles.length +
      ' portal target' + (recommendedProfiles.length !== 1 ? 's' : '') + ' the staff already has in mind.' +
      (departures.length
        ? (' The staff is also planning around ' + departures.length + ' likely departure' + (departures.length !== 1 ? 's' : '') + ': ' + departures.join(', ') + '.')
        : ' No departures are locked in, so judge each target against the full current roster fit.') + '\n\n' +
      '## Instructions\n' +
      '- Use language and examples that fit ' + sportLabelShort + ' roster building, rotation balance, and portal decision-making.\n' +
      '- Treat fitScore, scenarioFit, scenarioVerdict, scenarioDeltaPts, scenarioValueView, fitBreakdown, replaceGainPts, valueDeltaPct, reasons, scenarioReasons, and risks as quantitative guardrails.\n' +
      '- Do NOT simply repeat the deterministic verdict. Use it as a starting point, then explain whether you agree or disagree and why.\n' +
      '- For EACH shortlisted target, clearly say whether the player is a Strong Fit, Solid Pick, Situational, or Pass.\n' +
      '- Explain what real roster problem the player solves, whether the price band looks justified, and what the biggest risk is.\n' +
      '- If departures are selected, explain how directly each target replaces what is leaving. If no departures are selected, focus on overall team need and roster balance.\n' +
      '- Use game-log trend context when it is available to call out consistency, late-season momentum, or volatility. Do not invent play-by-play data if it is not in the structured context.\n' +
      '- If shooting or zone data is missing, do not guess. Say the data is thinner there and lean on box-score production, efficiency, role, lineup fit, and team context instead.\n' +
      '- Be direct and business-minded: note where the staff is clearly buying a real answer, overpaying for a name, or taking an upside gamble.\n' +
      (isWbb
        ? '- On the women\'s side, call out backcourt/wing/post balance, ball security, shot volume, and rebounding load when they materially change the roster outlook.\n\n'
        : '- On the men\'s side, call out spacing, rim pressure, defensive playmaking, and glass impact when they materially change the roster outlook.\n\n') +
      'Return detailed markdown with these sections:\n' +
      '## Shortlist Verdicts\n' +
      'Use this exact table format:\n\n' +
      '| Player | From | Model Fit | Scenario | AI Verdict | Value View | Why It Works | Main Risk |\n' +
      '|--------|------|-----------|----------|------------|------------|--------------|-----------|\n' +
      '| ... | ... | 82 | 79 | Solid Pick | Price sensitive | ... | ... |\n\n' +
      'AI Verdict must be one of: Strong Fit, Solid Pick, Situational, Pass.\n' +
      'Value View must be one of: Worth the price, Price sensitive, Value bet, Overpay risk.\n' +
      'IMPORTANT: Every table row MUST start and end with a pipe character |. Always include the trailing | on every row. Do not insert blank lines between table rows.\n\n' +
      '## Best Overall Pick\n' +
      '## Best Budget Swing\n' +
      '## If The Asking Price Climbs\n' +
      '## Final Priority Order\n\n' +
      '```json\n' + JSON.stringify(deepCtx, null, 2) + '\n```'
    )
    : (
      'You are an elite ' + sportLabel + ' roster strategist and transfer portal analyst. ' +
      'Analyze the following team situation in depth using ALL the structured data provided.\n\n' +
      '## Context\n' +
      '**' + teamName + '** (' + season + ' season, ' + leagueTag + ') has ' + departures.length +
      ' player' + (departures.length !== 1 ? 's' : '') + ' departing via the transfer portal. ' +
      'Your job is to evaluate the top ' + recommendedProfiles.length + ' portal replacement candidates.\n\n' +
      '## Instructions\n' +
      '- Use language and examples that fit ' + sportLabelShort + ' roster building, rotation balance, and portal decision-making.\n' +
      '- For EACH departing player, analyze what the team loses statistically (points, shooting, rebounds, defense, playmaking) using their per-game stats AND shot zone data when available.\n' +
      '- Treat position realism as a real constraint. If the team loses a guard, make sure the core replacement plan stays guard-focused unless there is a clear roster-level reason to pivot big/wing, and vice versa for frontcourt losses.\n' +
      '- For EACH recommended replacement, explain specifically WHY they are a good fit by comparing their stats, shooting profile, recent-game summary, valuation tier, and role against what was lost.\n' +
      '- Consider team-level four factors (eFG%, TOV%, ORB%, FTR) and identify which departures hurt which factors.\n' +
      '- Recommend which replacement best fills EACH departing player\'s role. If one replacement can cover gaps from multiple departures, say so.\n' +
      '- Do not blindly chase the highest raw performer. Weigh acquisition realism, similar valuation tiers, bang-for-buck, and upside/potential. Better players often cost materially more and may be unrealistic.\n' +
      '- Use the fitBreakdown fields to separate direct replacements, value plays, upgrade bets, and upside swings.\n' +
      '- If a candidate is notably more expensive than the departing player, say whether the talent jump is worth it or likely unrealistic for that value band.\n' +
      '- Give a practical priority order: who to pursue first and why.\n' +
      '- Flag any risks (low-minute sample, turnover-prone, FT issues, style mismatch).\n' +
      '- Use game-log trend context when it is available to call out consistency, late-season momentum, or volatility. Do not invent play-by-play data if it is not in the structured context.\n' +
      '- If shooting or zone data is missing, do not guess. Say the data is thinner there and lean on box-score production, efficiency, role, lineup fit, and team context instead.\n' +
      '- Be direct and business-minded: note where the team is clearly upgrading, treading water, or accepting risk.\n' +
      (isWbb
        ? '- On the women\'s side, call out backcourt/wing/post balance, ball security, shot volume, and rebounding load when they materially change the roster outlook.\n\n'
        : '- On the men\'s side, call out spacing, rim pressure, defensive playmaking, and glass impact when they materially change the roster outlook.\n\n') +
      'Return detailed markdown with these sections:\n' +
      '## What You Lose (per departure)\n' +
      '## Best Replacement Matches\n' +
      'For EACH departing player, provide a markdown table with EXACTLY 5 replacement candidates ranked from the most premium/expensive option down to the most affordable bang-for-buck option.\n' +
      'Use this exact table format for each departing player (one table per player):\n\n' +
      '### Replacing [Departing Player Name]\n' +
      '| Tier | Player | From | Key Stats | Cost | Why This Pick |\n' +
      '|------|--------|------|-----------|------|---------------|\n' +
      '| Premium | ... | ... | ... | $$$ | ... |\n' +
      '| Upgrade | ... | ... | ... | $$ | ... |\n' +
      '| Direct Fit | ... | ... | ... | $$ | ... |\n' +
      '| Value Play | ... | ... | ... | $ | ... |\n' +
      '| Sleeper | ... | ... | ... | $ | ... |\n\n' +
      'Tier definitions:\n' +
      '- Premium = highest-ceiling target, may cost more than the departing player\n' +
      '- Upgrade = clear step up in at least one area, moderate cost\n' +
      '- Direct Fit = closest statistical and role match to the departing player\n' +
      '- Value Play = solid contributor at a lower valuation tier -- bang for your buck\n' +
      '- Sleeper = under-the-radar upside pick, youngest or lowest-minute breakout candidate\n\n' +
      'In the Key Stats column, include PPG/eFG%/APG or RPG as a compact slash-separated line (e.g. "14.2 PPG / 54% eFG / 4.1 APG"). Keep Why This Pick to 1-2 sentences max. Use the fitScore, valuation, stats, and fitBreakdown to assign tiers accurately. Do NOT repeat the same player across multiple departing-player tables unless they genuinely fit both roles.\n' +
      'IMPORTANT: Every table row MUST start and end with a pipe character |. Always include the trailing | on every row. Do not insert blank lines between table rows.\n\n' +
      '## Combined Impact (net team improvement or regression)\n' +
      '## Portal Priority (ordered action plan — who to call first)\n' +
      '## Risks & Watchouts\n\n' +
      '```json\n' + JSON.stringify(deepCtx, null, 2) + '\n```'
    );

  try {
    var res = await fetch(PORTAL_GEMINI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: PORTAL_GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 12000 },
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
    portalSetAIStatus(
      usingShortlist
        ? ('Done - graded ' + recommendedProfiles.length + ' shortlist target(s) using ' + sportLabelShort + ' team and player context')
        : ('Done - analyzed ' + departures.length + ' departure(s) using ' + sportLabelShort + ' team and player context')
    );
    portalAIOutputEl.innerHTML = '<div class="portalAIMarkdown">' + portalFmtAIMarkdown(text) + '</div>';
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
  var players = portalCollectAllPlayers();
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

  try {
    if (!portalItems.length) {
      if (portalRecEmptyEl) portalRecEmptyEl.textContent = 'Loading portal board first...';
      await loadPortalEntries();
    }

    if (!portalFiltered.length) {
      portalRecRows = [];
      portalRenderRecommendations();
      if (portalRecEmptyEl) {
        portalRecEmptyEl.style.display = '';
        portalRecEmptyEl.textContent = portalItems.length
          ? 'No portal entries match the current board filters. Adjust the search or status filter and try again.'
          : 'Portal board is empty right now, so there are no candidates to score.';
      }
      return;
    }

    if (!portalTeamCtx || portalTeamCtx.team !== portalRecTeamEl.value || portalTeamCtx.season !== portalGetSeason()) {
      await portalLoadTeamContext(portalRecTeamEl.value);
    }

    var players = portalCollectAllPlayers();
    portalRecDist = portalBuildDistributions(players);
    // Re-detect departures in case portal items loaded after team selection
    if (portalTeamCtx && portalTeamCtx.roster) {
      portalDetectDepartures(portalTeamCtx.roster);
      portalRenderDepartureCards(portalDetectedDepartures);
    }
    portalComputeRecommendations();
    portalRenderRecommendations();

    if (!portalRecRows.length && portalRecEmptyEl) {
      portalRecEmptyEl.style.display = '';
      portalRecEmptyEl.textContent = 'No scored fit candidates were found from the current portal board. This usually means the live portal names did not match the loaded player pool cleanly enough yet.';
    }
  } finally {
    if (portalRecRunBtn) portalRecRunBtn.disabled = false;
  }
}

function portalUseSnapshotEnabled() {
  if (portalCurrentLeague() === 'WBB') return false;
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
  var list = [];
  var seen = Object.create(null);

  function add(it) {
    if (!it) return;
    var k = portalNorm((it && it.playerName) || '') + '|' + portalNorm((it && it.fromTeam) || '') + '|' + portalNorm((it && it.status) || '');
    var existingIdx = seen[k];
    if (typeof existingIdx === 'number') {
      var existing = list[existingIdx];
      var incomingSrc = portalNorm(it && it.source ? it.source : '');
      var existingSrc = portalNorm(existing && existing.source ? existing.source : '');
      if (incomingSrc === 'on3' && existingSrc !== 'on3') {
        list[existingIdx] = it;
      }
      return;
    }
    seen[k] = list.length;
    list.push(it);
  }

  (Array.isArray(primary) ? primary : []).forEach(add);
  (Array.isArray(extra) ? extra : []).forEach(add);
  return list;
}

function portalStatusMatchesFilter(statusValue, filterValue) {
  var ls = portalNorm(statusValue || '');
  if (ls === 'transfer' || ls === 'intransfer' || ls === 'in transfer' || ls === 'available' || ls === 'portal') ls = 'entered';
  if (!filterValue || filterValue === 'all') return true;
  if (filterValue === 'entries') return ls === 'entered' || ls === 'expected' || ls === 'committed';
  return ls === filterValue;
}

function portalApplyFilters() {
  var q = portalNorm(portalSearchInputEl ? portalSearchInputEl.value : '');
  var st = (portalStatusFilterEl && portalStatusFilterEl.value) ? portalStatusFilterEl.value : 'entries';

  portalFiltered = portalItems.filter(function (it) {
    if (!portalStatusMatchesFilter(it && it.status, st)) return false;
    if (!q) return true;
    var hay = portalNorm((it.playerName || '') + ' ' + (it.status || '') + ' ' + (it.position || '') + ' ' + (it.fromTeam || '') + ' ' + (it.toTeam || ''));
    return hay.includes(q);
  });

  portalRenderTable();
  portalRenderWatchAlerts();
  portalSyncRepResultsFromCache();

  if (portalRecRows.length && portalTeamCtx) {
    portalComputeRecommendations();
    portalRenderRecommendations();
  }
}

function portalRenderTable() {
  if (!portalTableBodyEl) return;
  portalTableBodyEl.innerHTML = '';

  var matched = 0;
  var targetMap = portalTargetListToMap(portalLoadTargetList());
  var frag = document.createDocumentFragment();
  portalFiltered.forEach(function (it) {
    var tr = document.createElement('tr');
    tr.id = portalAlertDomId(portalEntryKey(it));

    var match = portalFindPlayerMatch(it.playerName, it.fromTeam);
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
    tdPos.textContent = it.position || '\u2014';

    var tdClass = document.createElement('td');
    tdClass.textContent = portalGetPlayerClass(match);

    var tdPerf = document.createElement('td');
    var perf = portalGetPlayerPerf(match);
    tdPerf.textContent = perf === null ? '\u2014' : portalFmtNum(perf, 1);

    var tdValue = document.createElement('td');
    var valuation = portalGetPlayerValuation(match);
    tdValue.textContent = portalFmtMoney(valuation);

    var tdTeam = document.createElement('td');
    tdTeam.textContent = it.fromTeam || '\u2014';

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

    var tdTarget = document.createElement('td');
    if (match) {
      var targetKey = portalTargetKey(it, match);
      var isTargeted = !!targetMap[targetKey];
      var targetBtn = document.createElement('button');
      targetBtn.className = 'secondary portalTargetBtn' + (isTargeted ? ' isActive' : '');
      targetBtn.textContent = isTargeted ? 'Targeted' : '+ Target';
      targetBtn.title = isTargeted ? 'Remove from Portal Fit Lab shortlist' : 'Add to Portal Fit Lab shortlist';
      targetBtn.addEventListener('click', function () {
        portalToggleTarget(it, match);
      });
      tdTarget.appendChild(targetBtn);
    } else {
      tdTarget.textContent = 'No data';
      tdTarget.className = 'muted';
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
    tr.appendChild(tdClass);
    tr.appendChild(tdPerf);
    tr.appendChild(tdValue);
    tr.appendChild(tdTeam);
    tr.appendChild(tdMatch);
    tr.appendChild(tdProfile);
    tr.appendChild(tdTarget);
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
  portalSyncLeagueUI();

  var base = (typeof WORKER_URL !== 'undefined' && WORKER_URL) || 'https://hidden-salad-773b.bryanhkwan.workers.dev';
  var q = (portalSearchInputEl && portalSearchInputEl.value) || '';
  var st = (portalStatusFilterEl && portalStatusFilterEl.value) ? portalStatusFilterEl.value : 'entries';
  var year = portalGetSeason();
  var sport = portalCurrentSport();
  var preferredSource = 'on3';
  portalTargetSeason = year;
  var apiPageLimit = 100;

  function makeUrl(src, pageNum) {
    var u = new URL(base + '/api/portal/entries');
    u.searchParams.set('source', src);
    u.searchParams.set('sport', sport);
    u.searchParams.set('year', year);
    u.searchParams.set('limit', String(apiPageLimit));
    u.searchParams.set('page', String(pageNum || 1));
    u.searchParams.set('status', st);
    u.searchParams.set('onlyEntries', '1');
    if (q.trim()) u.searchParams.set('search', q.trim());
    return u;
  }

  async function fetchPortalSource(src) {
    var firstResp = await fetch(makeUrl(src, 1).toString());
    if (!firstResp.ok) return { resp: firstResp, data: null, items: [] };

    var firstData = await firstResp.json();
    var allItems = Array.isArray(firstData.items) ? firstData.items.slice() : [];
    var totalAvailable = firstData && Number.isFinite(+firstData.totalAvailable) ? +firstData.totalAvailable : allItems.length;
    var totalPages = Math.max(1, Math.ceil(totalAvailable / apiPageLimit));

    if (totalPages > 1) {
      var pagePromises = [];
      for (var pageNum = 2; pageNum <= totalPages; pageNum++) {
        (function (n) {
          pagePromises.push(
            fetch(makeUrl(src, n).toString())
              .then(function (pageResp) {
                if (!pageResp.ok) throw new Error('Portal API page ' + n + ' failed with ' + pageResp.status);
                return pageResp.json();
              })
          );
        })(pageNum);
      }
      var pageResults = await Promise.all(pagePromises);
      pageResults.forEach(function (pageData) {
        if (Array.isArray(pageData.items) && pageData.items.length) {
          allItems = allItems.concat(pageData.items);
        }
      });
    }

    return {
      resp: firstResp,
      data: firstData,
      items: allItems,
    };
  }

  portalSetStatus('Loading...');
  if (portalRefreshBtnEl) portalRefreshBtnEl.disabled = true;

  try {
    var usedSource = preferredSource;
    var result = await fetchPortalSource(usedSource);
    if (!result.resp.ok) {
      usedSource = 'on3';
      result = await fetchPortalSource(usedSource);
    }
    var resp = result.resp;
    if (!resp.ok) throw new Error('Portal API ' + resp.status);

    var data = result.data || {};
    var apiItems = Array.isArray(result.items) ? result.items : [];
    var summary = (data && data.sourceSummary) ? data.sourceSummary : {};
    var snapshotInfo = { items: [], path: '' };
    var snapshotAllowed = sport !== 'wbb';

    // Auto-load snapshot as fallback if live feed returned nothing
    var autoSnapshotFallback = snapshotAllowed && apiItems.length === 0 && !portalUseSnapshotEnabled();
    if (snapshotAllowed && (portalUseSnapshotEnabled() || autoSnapshotFallback)) {
      snapshotInfo = await portalLoadSnapshot(year);
      if (snapshotInfo.items.length) {
        snapshotInfo.items = snapshotInfo.items.filter(function (it) {
          if (!portalStatusMatchesFilter(it && it.status, st)) return false;
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
    if (snapshotAllowed && portalUseSnapshotEnabled() && !snapshotInfo.items.length) {
      sourcePart += ' (snapshot: not found)';
    }
    if (snapshotAllowed && autoSnapshotFallback && snapshotInfo.items.length) {
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
    portalRefreshScenarioRows();
  } catch (e) {
    portalItems = [];
    portalFiltered = [];
    portalWatchAlerts = [];
    portalRenderTable();
    portalRenderWatchAlerts();
    portalRefreshScenarioRows();
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
  portalSyncLeagueUI();

  if (portalUseSnapshotEl && portalCurrentLeague() !== 'WBB') {
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

  if (portalRepResearchBtnEl) {
    portalRepResearchBtnEl.addEventListener('click', function () {
      portalRunRepResearch(false);
    });
  }

  if (portalRepExportBtnEl) {
    portalRepExportBtnEl.addEventListener('click', function () {
      portalExportRepResearchCsv();
    });
  }

  if (portalRepClearBtnEl) {
    portalRepClearBtnEl.addEventListener('click', function () {
      portalClearRepResearch();
    });
  }

  if (portalTargetClearBtnEl) {
    portalTargetClearBtnEl.addEventListener('click', function () {
      portalClearTargets();
    });
  }

  portalRefreshTeamOptions();
  portalRenderWatchAlerts();
  portalRenderRepResults();
  portalRefreshScenarioRows();
}

window.TransferPortal = {
  initPage: initPortalPage,
  loadEntries: loadPortalEntries,
  refreshWatchAlerts: portalRefreshWatchAlerts,
  runRecommendations: portalRunRecommendations,
  runAIAnalysis: portalRunAIAnalysis,
  downloadAIReport: portalDownloadAIReport,
  runRepresentationResearch: portalRunRepResearch,
  exportRepresentationResearch: portalExportRepResearchCsv,
};
