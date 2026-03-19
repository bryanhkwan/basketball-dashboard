// ============ TEAMS MODULE — Team Hub ============
// Dependencies: data.js (league, allRatingsData, teamRatings, _ratingsReady,
//               loadGamesForTeam, tbGetAllPlayers, showWarn, clearWarn),
//               teambuilder.js (oppRoster, oppRefresh)

// ── DOM refs ──────────────────────────────────────────────────────────────────
var thTeamSearch, thSeasonInput, thLoadBtn, thValueLabBtn;
var thOverviewEl, thThreatsEl, thGameLogEl, thH2HEl;
var thLoadingEl;
var thBracketGateEl, thBracketWorkspaceEl, thBracketSelectEl, thBracketNameEl, thBracketSeasonEl;
var thBracketTeamAddEl, thBracketSeedAddEl, thBracketRegionAddEl, thBracketImportEl, thBracketImportStatusEl;
var thBracketBoardEl, thBracketStatusEl, thBracketResultsEl, thBracketAIOutputEl;
var thBracketTeamCountEl, thBracketRegionCountEl, thBracketStructureEl, thBracketSimCountEl;
var thBracketPlayInModalEl, thBracketPlayInRegionEl, thBracketPlayInSeedEl, thBracketPlayInTeamAEl, thBracketPlayInTeamBEl;
var thWarRoomLaunchBtnEl, thWarRoomLockNoteEl;

// ── State (persisted across renders for compare feature) ──────────────────────
var thCurrentTeam   = '';
var thCurrentSeason = '2026';
var thMatchupMode   = 'season'; // 'season' | 'history'
var _thCurrentStats = null;
var thCurrentCompareTeam = '';
var _thCompareStats = null;
var _thLastMatchupCtx = null;
var _thLastMatchupShots = null;
var _thRecentTournamentCtx = null;
var _thTournamentIntelCtx = null;
var _thTeamIntelCache = {};
var _thDeepShotIntelCtx = null;
var _thWbbConfStandingsCache = {};
var _thDeepUseHeavyModel = (localStorage.getItem('thDeepModel') === 'heavy');
var _TH_GUEST_DA_LIMIT = 3;
var _TH_GUEST_DA_KEY = 'thGuestDACount';
var _thBracketState = { brackets: [], activeId: '', results: {} };
var _thBracketTeamOptionsHtml = '';
var _thBracketTeamsCache = [];
var _thBracketTeamSet = {};
var _thBracketTeamSourceRef = null;
var _thBracketPlayInTarget = null;
var _thBracketRenderFrame = 0;
var _thBracketJsPdfPromise = null;
var _TH_2026_ESPN_PRESET = {
  name: '2026 ESPN Men\'s Bracket',
  season: '2026',
  source: 'ESPN Men\'s Tournament Challenge bracket field (March 17, 2026)',
  entries: [
    { region: 'East', seed: 1, team: 'Duke' },
    { region: 'East', seed: 2, team: 'UConn' },
    { region: 'East', seed: 3, team: 'Michigan St' },
    { region: 'East', seed: 4, team: 'Kansas' },
    { region: 'East', seed: 5, team: 'St John\'s' },
    { region: 'East', seed: 6, team: 'Louisville' },
    { region: 'East', seed: 7, team: 'UCLA' },
    { region: 'East', seed: 8, team: 'Ohio State' },
    { region: 'East', seed: 9, team: 'TCU' },
    { region: 'East', seed: 10, team: 'UCF' },
    { region: 'East', seed: 11, team: 'South Florida' },
    { region: 'East', seed: 12, team: 'Northern Iowa' },
    { region: 'East', seed: 13, team: 'CA Baptist' },
    { region: 'East', seed: 14, team: 'N Dakota St' },
    { region: 'East', seed: 15, team: 'Furman' },
    { region: 'East', seed: 16, team: 'Siena' },
    { region: 'South', seed: 1, team: 'Florida' },
    { region: 'South', seed: 2, team: 'Houston' },
    { region: 'South', seed: 3, team: 'Illinois' },
    { region: 'South', seed: 4, team: 'Nebraska' },
    { region: 'South', seed: 5, team: 'Vanderbilt' },
    { region: 'South', seed: 6, team: 'North Carolina' },
    { region: 'South', seed: 7, team: 'Saint Mary\'s' },
    { region: 'South', seed: 8, team: 'Clemson' },
    { region: 'South', seed: 9, team: 'Iowa' },
    { region: 'South', seed: 10, team: 'Texas A&M' },
    { region: 'South', seed: 11, team: 'VCU' },
    { region: 'South', seed: 12, team: 'McNeese' },
    { region: 'South', seed: 13, team: 'Troy' },
    { region: 'South', seed: 14, team: 'Penn' },
    { region: 'South', seed: 15, team: 'Idaho' },
    { region: 'South', seed: 16, candidates: ['Prairie View A&M', 'Lehigh'] },
    { region: 'West', seed: 1, team: 'Arizona' },
    { region: 'West', seed: 2, team: 'Purdue' },
    { region: 'West', seed: 3, team: 'Gonzaga' },
    { region: 'West', seed: 4, team: 'Arkansas' },
    { region: 'West', seed: 5, team: 'Wisconsin' },
    { region: 'West', seed: 6, team: 'BYU' },
    { region: 'West', seed: 7, team: 'Miami' },
    { region: 'West', seed: 8, team: 'Villanova' },
    { region: 'West', seed: 9, team: 'Utah State' },
    { region: 'West', seed: 10, team: 'Missouri' },
    { region: 'West', seed: 11, candidates: ['Texas', 'NC State'] },
    { region: 'West', seed: 12, team: 'High Point' },
    { region: 'West', seed: 13, team: 'Hawai\'i' },
    { region: 'West', seed: 14, team: 'Kennesaw St' },
    { region: 'West', seed: 15, team: 'Queens' },
    { region: 'West', seed: 16, team: 'Long Island' },
    { region: 'Midwest', seed: 1, team: 'Michigan' },
    { region: 'Midwest', seed: 2, team: 'Iowa State' },
    { region: 'Midwest', seed: 3, team: 'Virginia' },
    { region: 'Midwest', seed: 4, team: 'Alabama' },
    { region: 'Midwest', seed: 5, team: 'Texas Tech' },
    { region: 'Midwest', seed: 6, team: 'Tennessee' },
    { region: 'Midwest', seed: 7, team: 'Kentucky' },
    { region: 'Midwest', seed: 8, team: 'Georgia' },
    { region: 'Midwest', seed: 9, team: 'Saint Louis' },
    { region: 'Midwest', seed: 10, team: 'Santa Clara' },
    { region: 'Midwest', seed: 11, candidates: ['Miami (OH)', 'SMU'] },
    { region: 'Midwest', seed: 12, team: 'Akron' },
    { region: 'Midwest', seed: 13, team: 'Hofstra' },
    { region: 'Midwest', seed: 14, team: 'Wright St' },
    { region: 'Midwest', seed: 15, team: 'Tennessee St' },
    { region: 'Midwest', seed: 16, candidates: ['UMBC', 'Howard'] }
  ]
};

function _thGuestDACount() {
  return parseInt(localStorage.getItem(_TH_GUEST_DA_KEY) || '0', 10);
}
function _thGuestDAIncrement() {
  var c = _thGuestDACount() + 1;
  localStorage.setItem(_TH_GUEST_DA_KEY, String(c));
  return c;
}
function _thIsGuest() {
  return typeof authIsGuest === 'function' && authIsGuest();
}

function _thSyncWarRoomLauncher() {
  if (!thWarRoomLaunchBtnEl) return;
  var guest = _thIsGuest();
  thWarRoomLaunchBtnEl.disabled = false;
  thWarRoomLaunchBtnEl.dataset.locked = guest ? '1' : '0';
  thWarRoomLaunchBtnEl.setAttribute('aria-disabled', guest ? 'true' : 'false');
  thWarRoomLaunchBtnEl.title = guest ? 'Log in to open Tournament War Room.' : 'Open Tournament War Room';
  thWarRoomLaunchBtnEl.textContent = guest ? '🔒 Tournament War Room (Users Only)' : '🏆 Open Tournament War Room';
  thWarRoomLaunchBtnEl.style.opacity = guest ? '0.72' : '1';
  thWarRoomLaunchBtnEl.style.cursor = guest ? 'pointer' : '';
  if (thWarRoomLockNoteEl) {
    thWarRoomLockNoteEl.textContent = guest
      ? 'Guest accounts can use Tournament Lab analysis, but Tournament War Room is locked until you log in.'
      : 'Open the dedicated bracket workspace for saved fields, simulations, and AI scouting reports.';
  }
}

function _thBracketStorageKey() {
  var user = 'guest';
  try {
    if (!_thIsGuest() && typeof authGetUser === 'function') user = authGetUser() || user;
  } catch (_) {}
  user = String(user || 'guest').toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  return 'th_tournament_brackets_' + user;
}

function _thEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _thBracketId() {
  return 'br_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function _thBracketRegions() {
  return ['South', 'East', 'West', 'Midwest'];
}

function _thDefaultBracket() {
  return {
    id: _thBracketId(),
    name: 'New Tournament Bracket',
    season: String(thSeasonInput && thSeasonInput.value ? thSeasonInput.value : '2026'),
    teams: [],
    createdAt: new Date().toISOString()
  };
}

function _thBracketActive() {
  return _thBracketState.brackets.find(function (b) { return b.id === _thBracketState.activeId; }) || null;
}

function _thSaveBracketState() {
  if (_thIsGuest()) return;
  try {
    localStorage.setItem(_thBracketStorageKey(), JSON.stringify(_thBracketState));
  } catch (_) {}
}

function _thLoadBracketState() {
  if (_thIsGuest()) {
    _thBracketState = { brackets: [], activeId: '', results: {} };
    return;
  }
  try {
    var raw = localStorage.getItem(_thBracketStorageKey()) || '';
    if (!raw) {
      _thBracketState = { brackets: [_thDefaultBracket()], activeId: '', results: {} };
      _thBracketState.activeId = _thBracketState.brackets[0].id;
      _thSaveBracketState();
      return;
    }
    var parsed = JSON.parse(raw);
    _thBracketState = {
      brackets: Array.isArray(parsed.brackets) ? parsed.brackets : [],
      activeId: parsed.activeId || '',
      results: parsed.results && typeof parsed.results === 'object' ? parsed.results : {}
    };
    if (!_thBracketState.brackets.length) {
      _thBracketState.brackets = [_thDefaultBracket()];
    }
    if (!_thBracketActive()) _thBracketState.activeId = _thBracketState.brackets[0].id;
  } catch (_) {
    _thBracketState = { brackets: [_thDefaultBracket()], activeId: '', results: {} };
    _thBracketState.activeId = _thBracketState.brackets[0].id;
  }
}

function _thBracketAllTeams() {
  var players = typeof tbGetAllPlayers === 'function' ? (tbGetAllPlayers('MBB') || []) : [];
  if (_thBracketTeamSourceRef === players && _thBracketTeamsCache.length) {
    return _thBracketTeamsCache.slice();
  }
  _thBracketTeamSourceRef = players;
  _thBracketTeamsCache = [...new Set(
    players
      .map(function (p) { return p.Team || ''; })
      .filter(Boolean)
  )].sort();
  return _thBracketTeamsCache.slice();
}

function _thResolvePresetTeamName(rawTeam, teamMap) {
  var knownMap = teamMap || {};
  var raw = String(rawTeam || '').trim();
  if (!raw) return '';
  var exact = knownMap[_thNormTeamName(raw)];
  if (exact) return exact;

  var aliasMap = {
    'miami': ['Miami', 'Miami (FL)', 'Miami FL'],
    'st johns': ['St John\'s', 'Saint John\'s'],
    'michigan st': ['Michigan St', 'Michigan State'],
    'ca baptist': ['CA Baptist', 'California Baptist'],
    'n dakota st': ['N Dakota St', 'North Dakota State', 'North Dakota St'],
    'saint marys': ['Saint Mary\'s', 'Saint Mary\'s CA', 'Saint Marys'],
    'hawaii': ['Hawai\'i', 'Hawaii'],
    'kennesaw st': ['Kennesaw St', 'Kennesaw State'],
    'saint louis': ['Saint Louis', 'Saint Louis Billikens', 'St Louis'],
    'miami oh': ['Miami (OH)', 'Miami OH', 'Miami-Ohio'],
    'wright st': ['Wright St', 'Wright State'],
    'tennessee st': ['Tennessee St', 'Tennessee State'],
    'long island': ['Long Island', 'LIU'],
    'prairie view am': ['Prairie View A&M', 'Prairie View', 'Prairie View AM'],
    'nc state': ['NC State', 'NCSU'],
    'south florida': ['South Florida', 'USF']
  };
  var aliasKey = _thNormTeamName(raw);
  var aliases = aliasMap[aliasKey] || [];
  for (var i = 0; i < aliases.length; i++) {
    var match = knownMap[_thNormTeamName(aliases[i])];
    if (match) return match;
  }

  var tokens = aliasKey.split(' ').filter(Boolean);
  var bestScore = 0;
  var bestTeam = '';
  Object.keys(knownMap).forEach(function (key) {
    var score = 0;
    tokens.forEach(function (token) {
      if (key.indexOf(token) >= 0) score += 1;
    });
    if (score > bestScore && score >= Math.max(2, tokens.length - 1)) {
      bestScore = score;
      bestTeam = knownMap[key];
    }
  });
  return bestTeam || raw;
}

function _thParseTeamCandidates(raw) {
  var text = String(raw || '').trim();
  if (!text) return [];
  text = text.replace(/^(winner\s+of|play-?in\s+winner\s*:?|first four\s*:?|tbd\s*:?|either\s+)/i, '').trim();
  var knownTeams = _thBracketAllTeams();
  var byNorm = {};
  knownTeams.forEach(function (team) { byNorm[_thNormTeamName(team)] = team; });

  if (byNorm[_thNormTeamName(text)]) return [byNorm[_thNormTeamName(text)]];

  var parts = text
    .split(/\s*\/\s*|\s+or\s+|\s*\|\s*/i)
    .map(function (s) { return s.trim(); })
    .filter(Boolean);

  var out = [];
  parts.forEach(function (part) {
    var match = byNorm[_thNormTeamName(part)];
    if (match && out.indexOf(match) === -1) out.push(match);
  });
  return out;
}

function _thPopulateBracketTeamSelects() {
  var teams = _thBracketAllTeams();
  _thBracketTeamSet = {};
  teams.forEach(function (team) { _thBracketTeamSet[_thNormTeamName(team)] = true; });
  _thBracketTeamOptionsHtml = teams.map(function (t) {
    return '<option value="' + _thEsc(t) + '">' + _thEsc(t) + '</option>';
  }).join('');
  if (thBracketTeamAddEl) thBracketTeamAddEl.innerHTML = '<option value="">-- Add a team --</option>' + _thBracketTeamOptionsHtml;
  _thPopulatePlayInPairSelects(
    thBracketPlayInTeamAEl ? thBracketPlayInTeamAEl.value : '',
    thBracketPlayInTeamBEl ? thBracketPlayInTeamBEl.value : ''
  );
}

function _thBracketSlotOptions(currentName) {
  var current = String(currentName || '').trim();
  var prefix = '';
  if (current && !_thBracketTeamSet[_thNormTeamName(current)]) {
    prefix = '<option value="' + _thEsc(current) + '">' + _thEsc(current) + '</option>';
  }
  return prefix + _thBracketTeamOptionsHtml;
}

function _thBracketSelectInitialMarkup(region, seed, currentName) {
  var current = String(currentName || '').trim();
  return '<select class="thBracketSlotSelect" data-bracket-region="' + _thEsc(region) + '" data-bracket-seed="' + seed + '" data-current="' + _thEsc(current) + '">' +
    '<option value="">-- Select team --</option>' +
    (current ? ('<option value="' + _thEsc(current) + '" selected>' + _thEsc(current) + '</option>') : '') +
  '</select>';
}

function _thHydrateBracketSelect(sel) {
  if (!sel || sel.dataset.hydrated === '1') return;
  var current = sel.getAttribute('data-current') || '';
  sel.innerHTML = '<option value="">-- Select team --</option>' + _thBracketSlotOptions(current);
  if (current) sel.value = current;
  sel.dataset.hydrated = '1';
}

function _thPopulatePlayInPairSelects(teamA, teamB) {
  var base = '<option value="">-- Select team --</option>' + _thBracketTeamOptionsHtml;
  if (thBracketPlayInTeamAEl) {
    thBracketPlayInTeamAEl.innerHTML = base;
    thBracketPlayInTeamAEl.value = teamA || '';
  }
  if (thBracketPlayInTeamBEl) {
    thBracketPlayInTeamBEl.innerHTML = base;
    thBracketPlayInTeamBEl.value = teamB || '';
  }
}

function _thBracketSeedEntry(region, seed) {
  var bracket = _thBracketActive();
  if (!bracket) return null;
  return (bracket.teams || []).find(function (item) {
    return (item.region || '') === region && Number(item.seed) === Number(seed);
  }) || null;
}

function _thOpenPlayInModal(region, seed) {
  if (!thBracketPlayInModalEl) return;
  _thBracketPlayInTarget = { region: region, seed: Number(seed) || 0 };
  var current = _thBracketSeedEntry(region, seed);
  var candidates = current && Array.isArray(current.candidates) ? current.candidates : [];
  if (thBracketPlayInRegionEl) thBracketPlayInRegionEl.textContent = region || 'Region';
  if (thBracketPlayInSeedEl) thBracketPlayInSeedEl.textContent = 'Seed ' + (seed || '--');
  _thPopulatePlayInPairSelects(candidates[0] || '', candidates[1] || '');
  thBracketPlayInModalEl.style.display = 'flex';
}

function _thClosePlayInModal() {
  if (!thBracketPlayInModalEl) return;
  thBracketPlayInModalEl.style.display = 'none';
  _thBracketPlayInTarget = null;
}

function _thSavePlayInModal() {
  if (!_thBracketPlayInTarget) return;
  var teamA = thBracketPlayInTeamAEl ? String(thBracketPlayInTeamAEl.value || '').trim() : '';
  var teamB = thBracketPlayInTeamBEl ? String(thBracketPlayInTeamBEl.value || '').trim() : '';
  if (!teamA || !teamB) {
    if (typeof showWarn === 'function') showWarn('Pick both teams for the play-in pair.');
    return;
  }
  if (_thNormTeamName(teamA) === _thNormTeamName(teamB)) {
    if (typeof showWarn === 'function') showWarn('Choose two different teams for the play-in pair.');
    return;
  }
  _thAssignBracketSeedEntry(_thBracketPlayInTarget.region, _thBracketPlayInTarget.seed, {
    team: teamA + ' / ' + teamB,
    candidates: [teamA, teamB]
  });
  _thClosePlayInModal();
}

function _thBracketFieldStructure(bracket) {
  var teams = bracket && Array.isArray(bracket.teams) ? bracket.teams : [];
  var total = teams.length;
  var byRegion = {};
  teams.forEach(function (item) {
    var region = item.region || 'Unassigned';
    byRegion[region] = (byRegion[region] || 0) + 1;
  });
  var counts = Object.keys(byRegion).map(function (k) { return byRegion[k]; });
  var isPowerOfTwo = total > 1 && (total & (total - 1)) === 0;
  var balanced = counts.length ? counts.every(function (c) { return c === counts[0]; }) : false;
  if (!total) return 'No teams added';
  if (counts.length === 4 && counts[0] === 16) return '64-team regional bracket';
  if (isPowerOfTwo && balanced) return total + '-team balanced field';
  if (isPowerOfTwo) return total + '-team custom field';
  return 'Needs power-of-two field';
}

function _thRoundLabel(teamCount) {
  if (teamCount === 64) return 'Round of 64';
  if (teamCount === 32) return 'Round of 32';
  if (teamCount === 16) return 'Sweet 16';
  if (teamCount === 8) return 'Elite 8';
  if (teamCount === 4) return 'Final 4';
  if (teamCount === 2) return 'Championship';
  return 'Round of ' + teamCount;
}

function _thBracketRoundLabels(totalTeams) {
  var out = [];
  var n = totalTeams;
  while (n >= 2) {
    out.push(_thRoundLabel(n));
    n = n / 2;
  }
  out.push('Champion');
  return out;
}

function _thNormalizeBracketName(name) {
  return String(name || '').trim() || 'Tournament Bracket';
}

function _thBracketSeedPairs(size) {
  if (size <= 1) return [1];
  var prev = _thBracketSeedPairs(size / 2);
  var out = [];
  prev.forEach(function (seed) {
    out.push(seed);
    out.push(size + 1 - seed);
  });
  return out;
}

function _thFirstRoundSeedPairs() {
  return [[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]];
}

function _thBuildBracketPairings(entries) {
  var ordered = (entries || []).slice().sort(function (a, b) {
    var sa = Number(a.seed) || 99;
    var sb = Number(b.seed) || 99;
    if (sa !== sb) return sa - sb;
    return String(a.team || '').localeCompare(String(b.team || ''));
  });
  var n = ordered.length;
  if (n < 2 || (n & (n - 1)) !== 0) return [];
  var pairSeeds = _thBracketSeedPairs(n);
  var bySeed = {};
  ordered.forEach(function (item, idx) {
    var key = Number(item.seed) || (idx + 1);
    if (!bySeed[key]) bySeed[key] = [];
    bySeed[key].push(item);
  });
  var slotOrder = [];
  pairSeeds.forEach(function (seed) {
    if (bySeed[seed] && bySeed[seed].length) slotOrder.push(bySeed[seed].shift());
  });
  ordered.forEach(function (item) {
    if (slotOrder.indexOf(item) === -1) slotOrder.push(item);
  });
  var pairs = [];
  for (var i = 0; i < slotOrder.length; i += 2) {
    if (slotOrder[i + 1]) pairs.push([slotOrder[i], slotOrder[i + 1]]);
  }
  return pairs;
}

function _thRegionSeedMap(bracket, region) {
  var map = {};
  (bracket && bracket.teams || []).forEach(function (item) {
    if ((item.region || '') !== region) return;
    map[Number(item.seed) || 0] = item;
  });
  return map;
}

function _thBracketTeamStats(teamName, season) {
  var key = (String(teamName || '') + ':' + String(season || '2026')).toLowerCase();
  return (typeof teamStatsCache !== 'undefined' && teamStatsCache[key]) ? teamStatsCache[key] : null;
}

function _thBracketTeamGames(teamName, season) {
  var key = (String(teamName || '') + ':' + String(season || '2026')).toLowerCase();
  var cached = (typeof teamGamesCache !== 'undefined' && teamGamesCache[key]) ? teamGamesCache[key] : null;
  return cached && Array.isArray(cached.games) ? cached.games.slice() : [];
}

function _thClamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function _thStdDev(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return null;
  var mean = arr.reduce(function (s, x) { return s + x; }, 0) / arr.length;
  var variance = arr.reduce(function (s, x) { return s + Math.pow(x - mean, 2); }, 0) / arr.length;
  return Math.sqrt(Math.max(0, variance));
}

function _thTeamGameMetrics(teamName, season) {
  var games = _thBracketTeamGames(teamName, season).filter(function (g) {
    return Number.isFinite(Number(g.homePoints)) && Number.isFinite(Number(g.awayPoints));
  }).sort(function (a, b) {
    return new Date(a.startDate || a.date || 0) - new Date(b.startDate || b.date || 0);
  });
  if (!games.length) {
    return {
      seasonMargin: 0,
      recentMargin: 0,
      seasonWinPct: 0.5,
      recentWinPct: 0.5,
      scoreSd: 11,
      recentScoreSd: 11,
      postseasonMargin: 0,
      postseasonWinPct: 0.5
    };
  }

  var teamKey = String(teamName || '').toLowerCase();
  var rows = games.map(function (g) {
    var isHome = String(g.homeTeam || '').toLowerCase() === teamKey;
    var teamPts = Number(isHome ? g.homePoints : g.awayPoints);
    var oppPts = Number(isHome ? g.awayPoints : g.homePoints);
    var meta = String((g.seasonType || '') + ' ' + (g.notes || '') + ' ' + (g.title || '') + ' ' + (g.label || '')).toLowerCase();
    return {
      teamPts: teamPts,
      oppPts: oppPts,
      margin: teamPts - oppPts,
      win: teamPts > oppPts ? 1 : 0,
      postseason: /post|tournament|semifinal|quarterfinal|championship|ncaa/.test(meta)
    };
  });
  var recent10 = rows.slice(-10);
  var recent5 = rows.slice(-5);
  var post = rows.filter(function (r) { return r.postseason; }).slice(-5);

  function avg(arr, key) {
    if (!arr.length) return 0;
    return arr.reduce(function (s, x) { return s + (x[key] || 0); }, 0) / arr.length;
  }

  return {
    seasonMargin: avg(rows, 'margin'),
    recentMargin: avg(recent10.length ? recent10 : rows, 'margin'),
    seasonWinPct: avg(rows, 'win'),
    recentWinPct: avg(recent10.length ? recent10 : rows, 'win'),
    scoreSd: _thStdDev(rows.map(function (r) { return r.teamPts; })) || 11,
    recentScoreSd: _thStdDev((recent5.length ? recent5 : rows).map(function (r) { return r.teamPts; })) || 11,
    postseasonMargin: post.length ? avg(post, 'margin') : avg(recent5.length ? recent5 : rows, 'margin'),
    postseasonWinPct: post.length ? avg(post, 'win') : avg(recent5.length ? recent5 : rows, 'win')
  };
}

function _thGetStat(obj, path, fallback) {
  try {
    var cur = obj;
    for (var i = 0; i < path.length; i++) {
      cur = cur ? cur[path[i]] : null;
    }
    var num = Number(cur);
    return Number.isFinite(num) ? num : fallback;
  } catch (_) {
    return fallback;
  }
}

function _thComputeMatchupAdjustment(statsA, statsB) {
  if (!statsA || !statsB) return { a: 0, b: 0, details: [] };
  var aTs = statsA.teamStats || {};
  var aOs = statsA.opponentStats || {};
  var bTs = statsB.teamStats || {};
  var bOs = statsB.opponentStats || {};
  var aFf = aTs.fourFactors || {};
  var aFfDef = aOs.fourFactors || {};
  var bFf = bTs.fourFactors || {};
  var bFfDef = bOs.fourFactors || {};
  var a = 0, b = 0;
  var details = [];

  function addEdge(label, edgeA, edgeB, scale) {
    a += edgeA * scale;
    b += edgeB * scale;
    details.push({ label: label, a: +(edgeA * scale).toFixed(2), b: +(edgeB * scale).toFixed(2) });
  }

  addEdge(
    'eFG matchup',
    ((_thGetStat(aFf, ['effectiveFieldGoalPct'], 50) - _thGetStat(bFfDef, ['effectiveFieldGoalPct'], 50)) / 10),
    ((_thGetStat(bFf, ['effectiveFieldGoalPct'], 50) - _thGetStat(aFfDef, ['effectiveFieldGoalPct'], 50)) / 10),
    1.8
  );
  addEdge(
    'Turnover matchup',
    ((_thGetStat(bFfDef, ['turnoverRatio'], 0.18) - _thGetStat(aFf, ['turnoverRatio'], 0.18)) * 100),
    ((_thGetStat(aFfDef, ['turnoverRatio'], 0.18) - _thGetStat(bFf, ['turnoverRatio'], 0.18)) * 100),
    0.24
  );
  addEdge(
    'Rebounding matchup',
    ((_thGetStat(aFf, ['offensiveReboundPct'], 28) - _thGetStat(bFfDef, ['offensiveReboundPct'], 28)) / 10),
    ((_thGetStat(bFf, ['offensiveReboundPct'], 28) - _thGetStat(aFfDef, ['offensiveReboundPct'], 28)) / 10),
    1.15
  );
  addEdge(
    'FT rate matchup',
    ((_thGetStat(aFf, ['freeThrowRate'], 28) - _thGetStat(bFfDef, ['freeThrowRate'], 28)) / 12),
    ((_thGetStat(bFf, ['freeThrowRate'], 28) - _thGetStat(aFfDef, ['freeThrowRate'], 28)) / 12),
    0.9
  );

  var a3Pct = _thGetStat(aTs, ['threePointFieldGoals', 'pct'], null);
  var b3Def = _thGetStat(bOs, ['threePointFieldGoals', 'pct'], null);
  var b3Pct = _thGetStat(bTs, ['threePointFieldGoals', 'pct'], null);
  var a3Def = _thGetStat(aOs, ['threePointFieldGoals', 'pct'], null);
  if (a3Pct !== null && b3Def !== null && b3Pct !== null && a3Def !== null) {
    addEdge('3PT style', (a3Pct - b3Def) / 10, (b3Pct - a3Def) / 10, 0.8);
  }

  var aPaint = _thGetStat(aTs, ['points', 'inPaint'], null);
  var bPaintAllow = _thGetStat(bOs, ['points', 'inPaint'], null);
  var bPaint = _thGetStat(bTs, ['points', 'inPaint'], null);
  var aPaintAllow = _thGetStat(aOs, ['points', 'inPaint'], null);
  if (aPaint !== null && bPaintAllow !== null && bPaint !== null && aPaintAllow !== null) {
    addEdge('Paint pressure', (aPaint - bPaintAllow) / 18, (bPaint - aPaintAllow) / 18, 0.75);
  }

  return {
    a: _thClamp(a, -5.5, 5.5),
    b: _thClamp(b, -5.5, 5.5),
    details: details
  };
}

function _thComputeRecencyAdjustment(teamName, season, ratingObj) {
  var metrics = _thTeamGameMetrics(teamName, season);
  var seasonStrength = ratingObj && Number.isFinite(+ratingObj.adjEM) ? +ratingObj.adjEM : 0;
  var recentSignal = (metrics.recentMargin - metrics.seasonMargin) * 0.32;
  var winSignal = (metrics.recentWinPct - metrics.seasonWinPct) * 5.2;
  var postSignal = (metrics.postseasonMargin - metrics.seasonMargin) * 0.18 + (metrics.postseasonWinPct - metrics.seasonWinPct) * 3.5;
  var shrink = seasonStrength > 20 ? 0.85 : seasonStrength < -5 ? 0.75 : 0.8;
  return _thClamp((recentSignal + winSignal + postSignal) * shrink, -4.5, 4.5);
}

function _thComputeTeamVolatility(teamName, season) {
  var metrics = _thTeamGameMetrics(teamName, season);
  var raw = metrics.scoreSd * 0.65 + metrics.recentScoreSd * 0.35;
  if (metrics.recentWinPct >= 0.8 && metrics.recentMargin >= 8) raw -= 0.6;
  if (metrics.recentWinPct <= 0.4 || metrics.recentMargin <= -2) raw += 0.5;
  return _thClamp(raw, 7.5, 15.5);
}

async function _thPrepareBracketContexts(bracket) {
  if (!bracket || !Array.isArray(bracket.teams)) return;
  var season = bracket.season || '2026';
  var seen = {};
  var names = [];
  bracket.teams.forEach(function (entry) {
    var pool = Array.isArray(entry && entry.candidates) && entry.candidates.length
      ? entry.candidates
      : [entry && entry.team];
    pool.forEach(function (name) {
      var clean = String(name || '').trim();
      if (!clean) return;
      var key = clean.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      names.push(clean);
    });
  });
  await Promise.all(names.map(function (name) {
    return Promise.all([
      typeof loadTeamStats === 'function' ? loadTeamStats(name, season).catch(function () { return null; }) : Promise.resolve(null),
      typeof loadGamesForTeam === 'function' ? loadGamesForTeam(name, season).catch(function () { return null; }) : Promise.resolve(null)
    ]);
  }));
}

function _thTeamPaceForBracket(teamName, season) {
  var key = (String(teamName || '') + ':' + String(season || '2026')).toLowerCase();
  if (typeof teamStatsCache !== 'undefined' && teamStatsCache[key] && Number.isFinite(+teamStatsCache[key].pace)) {
    return +teamStatsCache[key].pace;
  }
  return 68;
}

function _thBracketTeamRating(teamName, season) {
  var key = String(teamName || '').toLowerCase();
  var rating = teamRatings[key] || null;
  var statKey = (String(teamName || '') + ':' + String(season || '2026')).toLowerCase();
  var stats = (typeof teamStatsCache !== 'undefined' && teamStatsCache[statKey]) ? teamStatsCache[statKey] : null;
  return _thFallbackRating(teamName, rating, stats, season);
}

function _thSimResolvedTeams(teamA, teamB, season) {
  var ratA = _thBracketTeamRating(teamA.team, season);
  var ratB = _thBracketTeamRating(teamB.team, season);
  if (!ratA || !ratB) return null;
  var statsA = _thBracketTeamStats(teamA.team, season);
  var statsB = _thBracketTeamStats(teamB.team, season);
  var recA = _thComputeRecencyAdjustment(teamA.team, season, ratA);
  var recB = _thComputeRecencyAdjustment(teamB.team, season, ratB);
  var matchup = _thComputeMatchupAdjustment(statsA, statsB);
  var paceA = _thTeamPaceForBracket(teamA.team, season);
  var paceB = _thTeamPaceForBracket(teamB.team, season);
  var pace = _thClamp((paceA * 0.45) + (paceB * 0.45) + 6.8 * 0.10, 61, 75);
  var eOA = ((+ratA.adjO + +ratB.adjD) / 2) + recA + matchup.a;
  var eOB = ((+ratB.adjO + +ratA.adjD) / 2) + recB + matchup.b;
  var sdA = _thComputeTeamVolatility(teamA.team, season);
  var sdB = _thComputeTeamVolatility(teamB.team, season);

  function randn() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  var scoreA = Math.round((eOA / 100) * pace + randn() * sdA);
  var scoreB = Math.round((eOB / 100) * pace + randn() * sdB);
  scoreA = Math.max(45, scoreA);
  scoreB = Math.max(45, scoreB);
  while (scoreA === scoreB) {
    scoreA += Math.max(1, Math.round(randn() * 3 + 4));
    scoreB += Math.max(1, Math.round(randn() * 3 + 4));
  }

  var winner = scoreA > scoreB ? teamA : teamB;
  var loser = scoreA > scoreB ? teamB : teamA;
  return {
    winner: winner,
    loser: loser,
    scoreA: scoreA,
    scoreB: scoreB,
    upset: (Number(winner.seed) || 99) > (Number(loser.seed) || 99),
    margin: Math.abs(scoreA - scoreB),
    model: {
      pace: +pace.toFixed(1),
      adjA: +eOA.toFixed(2),
      adjB: +eOB.toFixed(2),
      recencyA: +recA.toFixed(2),
      recencyB: +recB.toFixed(2),
      matchupA: +matchup.a.toFixed(2),
      matchupB: +matchup.b.toFixed(2),
      sdA: +sdA.toFixed(2),
      sdB: +sdB.toFixed(2)
    }
  };
}

function _thResolvePlayInEntry(teamEntry, season) {
  if (!teamEntry) return null;
  var candidates = Array.isArray(teamEntry.candidates) ? teamEntry.candidates.slice() : [];
  if (!candidates.length) return teamEntry;
  if (candidates.length === 1) {
    return Object.assign({}, teamEntry, { team: candidates[0], candidates: [candidates[0]] });
  }
  var left = { team: candidates[0], seed: teamEntry.seed, region: teamEntry.region };
  var right = { team: candidates[1], seed: teamEntry.seed, region: teamEntry.region };
  var playIn = _thSimResolvedTeams(left, right, season);
  if (!playIn) return Object.assign({}, teamEntry, { team: candidates[0] });
  return Object.assign({}, teamEntry, {
    team: playIn.winner.team,
    candidates: candidates,
    playIn: {
      teamA: left.team,
      teamB: right.team,
      winner: playIn.winner.team,
      scoreA: playIn.scoreA,
      scoreB: playIn.scoreB
    }
  });
}

function _thSimSingleGame(teamA, teamB, season) {
  var resolvedA = _thResolvePlayInEntry(teamA, season);
  var resolvedB = _thResolvePlayInEntry(teamB, season);
  if (!resolvedA || !resolvedB) return null;
  var result = _thSimResolvedTeams(resolvedA, resolvedB, season);
  if (!result) return null;
  result.resolvedA = resolvedA;
  result.resolvedB = resolvedB;
  return result;
}

function _thRecordRoundAdvancement(summary, teamName, label) {
  if (!summary.rounds[teamName]) summary.rounds[teamName] = {};
  summary.rounds[teamName][label] = (summary.rounds[teamName][label] || 0) + 1;
}

function _thCommitBracketMutation(bracket, opts) {
  if (!bracket) return;
  delete _thBracketState.results[bracket.id];
  if (!(opts && opts.skipSave)) _thSaveBracketState();
  if (!(opts && opts.deferRender)) {
    _thRenderBracketBoard();
    _thRenderBracketResults();
  }
}

function _thSimBracketOnce(bracket) {
  var season = bracket.season || '2026';
  var totalTeams = bracket.teams.length;
  var labels = _thBracketRoundLabels(totalTeams);
  var rounds = labels.slice(0, labels.length - 1);
  var summary = { rounds: {}, games: [], champion: null, finalists: [], regionWinners: [], upsetCount: 0 };
  var regions = {};
  bracket.teams.forEach(function (team) {
    var region = team.region || 'Field';
    if (!regions[region]) regions[region] = [];
    regions[region].push(team);
    _thRecordRoundAdvancement(summary, team.team, rounds[0]);
  });

  var regionalWinners = [];
  Object.keys(regions).sort().forEach(function (region) {
    var current = _thBuildBracketPairings(regions[region]).map(function (pair) { return pair.slice(); });
    var roundIdx = 0;
    while (current.length) {
      var next = [];
      current.forEach(function (pair) {
        var result = _thSimSingleGame(pair[0], pair[1], season);
        if (!result) return;
        if (result.upset) summary.upsetCount += 1;
        summary.games.push({
          round: rounds[Math.min(roundIdx, rounds.length - 1)],
          region: region,
          teamA: pair[0].team,
          teamB: pair[1].team,
          winner: result.winner.team,
          loser: result.loser.team,
          margin: result.margin,
          upset: result.upset
        });
        next.push(result.winner);
      });
      if (next.length === 1) {
        regionalWinners.push(next[0]);
        summary.regionWinners.push({ region: region, team: next[0].team });
        break;
      }
      if (roundIdx + 1 < rounds.length) {
        next.forEach(function (team) { _thRecordRoundAdvancement(summary, team.team, rounds[roundIdx + 1]); });
      }
      current = [];
      for (var i = 0; i < next.length; i += 2) {
        if (next[i + 1]) current.push([next[i], next[i + 1]]);
      }
      roundIdx += 1;
    }
  });

  var finalPool = regionalWinners.slice();
  if (!finalPool.length) return summary;
  if (finalPool.length > 1 && rounds.indexOf('Final 4') >= 0) {
    finalPool.forEach(function (team) { _thRecordRoundAdvancement(summary, team.team, 'Final 4'); });
  }
  while (finalPool.length > 1) {
    var nextPool = [];
    for (var fp = 0; fp < finalPool.length; fp += 2) {
      if (!finalPool[fp + 1]) {
        nextPool.push(finalPool[fp]);
        continue;
      }
      var finalsGame = _thSimSingleGame(finalPool[fp], finalPool[fp + 1], season);
      if (!finalsGame) continue;
      summary.games.push({
        round: finalPool.length === 2 ? 'Championship' : 'Final 4',
        region: 'National',
        teamA: finalPool[fp].team,
        teamB: finalPool[fp + 1].team,
        winner: finalsGame.winner.team,
        loser: finalsGame.loser.team,
        margin: finalsGame.margin,
        upset: finalsGame.upset
      });
      nextPool.push(finalsGame.winner);
      if (finalPool.length === 2) {
        summary.finalists = [finalPool[fp].team, finalPool[fp + 1].team];
      }
    }
    if (nextPool.length === 1) {
      summary.champion = nextPool[0].team;
      _thRecordRoundAdvancement(summary, nextPool[0].team, 'Champion');
      break;
    }
    nextPool.forEach(function (team) {
      if (nextPool.length === 2) _thRecordRoundAdvancement(summary, team.team, 'Championship');
    });
    finalPool = nextPool;
  }

  return summary;
}

async function _thAggregateBracketSims(bracket, sims, onProgress) {
  var total = sims || 5000;
  var labels = _thBracketRoundLabels(bracket.teams.length);
  var roundCounts = {};
  var championCounts = {};
  var finalistCounts = {};
  var regionWinnerCounts = {};
  var upsetMap = {};
  var totalUpsets = 0;
  var samplePath = null;
  var chunkSize = total >= 10000 ? 250 : 100;
  for (var i = 0; i < total; i++) {
    var sim = _thSimBracketOnce(bracket);
    if (!samplePath) {
      samplePath = { regions: {} };
      (sim.games || []).forEach(function (game) {
        if (game.region === 'National') return;
        if (!samplePath.regions[game.region]) samplePath.regions[game.region] = { round2: [], sweet16: [], elite8: null };
        if (game.round === 'Round of 32') samplePath.regions[game.region].round2.push({ teamA: game.teamA, teamB: game.teamB, winner: game.winner });
        if (game.round === 'Sweet 16') samplePath.regions[game.region].sweet16.push({ teamA: game.teamA, teamB: game.teamB, winner: game.winner });
        if (game.round === 'Elite 8') samplePath.regions[game.region].elite8 = { teamA: game.teamA, teamB: game.teamB, winner: game.winner };
      });
      samplePath.finals = (sim.games || []).filter(function (game) { return game.region === 'National'; });
      samplePath.champion = sim.champion || null;
    }
    totalUpsets += sim.upsetCount || 0;
    Object.keys(sim.rounds || {}).forEach(function (team) {
      if (!roundCounts[team]) roundCounts[team] = {};
      Object.keys(sim.rounds[team]).forEach(function (label) {
        roundCounts[team][label] = (roundCounts[team][label] || 0) + sim.rounds[team][label];
      });
    });
    if (sim.champion) championCounts[sim.champion] = (championCounts[sim.champion] || 0) + 1;
    (sim.finalists || []).forEach(function (team) {
      finalistCounts[team] = (finalistCounts[team] || 0) + 1;
    });
    (sim.regionWinners || []).forEach(function (item) {
      var key = item.region + '|' + item.team;
      regionWinnerCounts[key] = (regionWinnerCounts[key] || 0) + 1;
    });
    (sim.games || []).forEach(function (game) {
      if (!game.upset) return;
      var upsetKey = game.winner + ' over ' + game.loser;
      upsetMap[upsetKey] = (upsetMap[upsetKey] || 0) + 1;
    });
    if ((i + 1) % chunkSize === 0 || i === total - 1) {
      if (typeof onProgress === 'function') onProgress(i + 1, total);
      if (i < total - 1) {
        await new Promise(function (resolve) { setTimeout(resolve, 0); });
      }
    }
  }

  var teamRows = bracket.teams.map(function (team) {
    var counts = roundCounts[team.team] || {};
    return {
      team: team.team,
      seed: team.seed,
      region: team.region,
      championPct: +(((championCounts[team.team] || 0) / total) * 100).toFixed(1),
      finalistPct: +(((finalistCounts[team.team] || 0) / total) * 100).toFixed(1),
      finalFourPct: +(((counts['Final 4'] || 0) / total) * 100).toFixed(1),
      eliteEightPct: +(((counts['Elite 8'] || 0) / total) * 100).toFixed(1),
      sweetSixteenPct: +(((counts['Sweet 16'] || 0) / total) * 100).toFixed(1),
      round32Pct: +(((counts['Round of 32'] || 0) / total) * 100).toFixed(1),
      reached: counts
    };
  }).sort(function (a, b) {
    if (b.championPct !== a.championPct) return b.championPct - a.championPct;
    if (b.finalFourPct !== a.finalFourPct) return b.finalFourPct - a.finalFourPct;
    return String(a.team).localeCompare(String(b.team));
  });

  var regionRows = Object.keys(regionWinnerCounts).map(function (key) {
    var parts = key.split('|');
    return {
      region: parts[0],
      team: parts[1],
      pct: +((regionWinnerCounts[key] / total) * 100).toFixed(1)
    };
  }).sort(function (a, b) { return b.pct - a.pct; });

  var upsetRows = Object.keys(upsetMap).map(function (key) {
    return { label: key, pct: +((upsetMap[key] / total) * 100).toFixed(1) };
  }).sort(function (a, b) { return b.pct - a.pct; }).slice(0, 10);

  return {
    simulations: total,
    bracketName: bracket.name,
    season: bracket.season,
    totalTeams: bracket.teams.length,
    labels: labels,
    samplePath: samplePath,
    methodology: {
      baseline: 'Adjusted offense/defense blended against opponent profile',
      recency: 'Last 10 games and recent postseason results nudge team strength',
      matchup: 'Four-factor and scoring-profile interactions adjust expected efficiency',
      volatility: 'Team-specific scoring volatility estimated from full-season and recent game logs'
    },
    teams: teamRows,
    regions: regionRows,
    upsets: upsetRows,
    avgUpsetsPerSim: +((totalUpsets / total) || 0).toFixed(2),
    championFavorite: teamRows[0] || null
  };
}

function _thRenderBracketManager() {
  if (!thBracketSelectEl) return;
  var active = _thBracketActive();
  thBracketSelectEl.innerHTML = _thBracketState.brackets.map(function (b) {
    return '<option value="' + _thEsc(b.id) + '"' + (active && active.id === b.id ? ' selected' : '') + '>' + _thEsc(b.name) + '</option>';
  }).join('');
  if (active) {
    if (thBracketNameEl) thBracketNameEl.value = active.name || '';
    if (thBracketSeasonEl) thBracketSeasonEl.value = active.season || '2026';
  }
}

function _thRenderBracketBoard() {
  if (!thBracketBoardEl) return;
  var bracket = _thBracketActive();
  if (!bracket) {
    thBracketBoardEl.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Create a bracket to get started.</div>';
    return;
  }
  var regions = _thBracketRegions();
  var result = _thBracketState.results[bracket.id] || null;
  var samplePath = result && result.samplePath ? result.samplePath : null;

  function renderFutureGameCard(roundLabel, idx, slots) {
    return '<div class="thBracketGame thBracketGame--future">' +
      '<div class="thBracketGameHead">' + _thEsc(roundLabel + ' · Game ' + (idx + 1)) + '</div>' +
      slots.map(function (slot) {
        return '<div class="thBracketSlot"><span class="thBracketSeed">•</span><div><div class="thBracketSlotTeam">' + _thEsc(slot || 'TBD') + '</div><div class="thBracketSlotMeta">Awaiting winner</div></div></div>';
      }).join('') +
    '</div>';
  }

  function renderRound64(region, seedMap) {
    return _thFirstRoundSeedPairs().map(function (pair, idx) {
      return '<div class="thBracketGame">' +
        '<div class="thBracketGameHead">Round of 64 · Game ' + (idx + 1) + '</div>' +
        pair.map(function (seed) {
          var current = seedMap[seed] || null;
          return '<div class="thBracketSlot">' +
            '<span class="thBracketSeed">' + seed + '</span>' +
            '<div>' +
              _thBracketSelectInitialMarkup(region, seed, current && current.team ? current.team : '') +
              '<div class="thBracketSlotActions">' +
                '<button type="button" class="thBracketPlayInBtn" data-playin-open="1" data-bracket-region="' + _thEsc(region) + '" data-bracket-seed="' + seed + '">' + ((current && current.candidates && current.candidates.length > 1) ? 'Edit play-in' : 'Set play-in') + '</button>' +
              '</div>' +
              ((current && current.candidates && current.candidates.length > 1) ? '<div class="thBracketSlotMeta">Play-in: ' + _thEsc(current.candidates.join(' / ')) + '</div>' : '') +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    }).join('');
  }

  function renderRegion(region, side) {
    var seedMap = _thRegionSeedMap(bracket, region);
    var regionRounds = samplePath && samplePath.regions && samplePath.regions[region] ? samplePath.regions[region] : null;
    var round2Games = regionRounds && regionRounds.round2 ? regionRounds.round2.map(function (game, idx) {
      return renderFutureGameCard('Round of 32', idx, [game.teamA, game.teamB]);
    }).join('') : new Array(4).fill(null).map(function (_, idx) {
      return renderFutureGameCard('Round of 32', idx, ['TBD', 'TBD']);
    }).join('');
    var sweet16Games = regionRounds && regionRounds.sweet16 ? regionRounds.sweet16.map(function (game, idx) {
      return renderFutureGameCard('Sweet 16', idx, [game.teamA, game.teamB]);
    }).join('') : new Array(2).fill(null).map(function (_, idx) {
      return renderFutureGameCard('Sweet 16', idx, ['TBD', 'TBD']);
    }).join('');
    var elite8Game = regionRounds && regionRounds.elite8
      ? renderFutureGameCard('Elite 8', 0, [regionRounds.elite8.teamA, regionRounds.elite8.teamB])
      : renderFutureGameCard('Elite 8', 0, ['TBD', 'TBD']);

    var cols = [
      '<div class="thBracketRoundCol"><div class="thBracketRoundTitle">Round of 64</div>' + renderRound64(region, seedMap) + '</div>',
      '<div class="thBracketRoundCol"><div class="thBracketRoundTitle">Round of 32</div>' + round2Games + '</div>',
      '<div class="thBracketRoundCol"><div class="thBracketRoundTitle">Sweet 16</div>' + sweet16Games + '</div>',
      '<div class="thBracketRoundCol"><div class="thBracketRoundTitle">Elite 8</div>' + elite8Game + '</div>'
    ];
    if (side === 'right') cols.reverse();

    return '<div class="thBracketRegion thBracketRegion--' + side + '">' +
      '<div class="thBracketRegionHead">' + _thEsc(region) + '</div>' +
      '<div class="thBracketRegionBracket">' + cols.join('') + '</div>' +
    '</div>';
  }

  var nationalGames = samplePath && Array.isArray(samplePath.finals) ? samplePath.finals : [];
  var finalFour = nationalGames.filter(function (g) { return g.round === 'Final 4'; });
  var titleGame = nationalGames.filter(function (g) { return g.round === 'Championship'; })[0] || null;

  thBracketBoardEl.innerHTML =
    '<div class="thBracketFantasy">' +
      '<div class="thBracketFantasySide thBracketFantasySide--left">' +
        renderRegion('East', 'left') +
        renderRegion('South', 'left') +
      '</div>' +
      '<div class="thBracketFantasyCenter">' +
        '<div class="thBracketFantasyCenterTitle">Final Four</div>' +
        (finalFour.length ? finalFour.map(function (game, idx) {
          return renderFutureGameCard('Final 4', idx, [game.teamA, game.teamB]);
        }).join('') : renderFutureGameCard('Final 4', 0, ['TBD', 'TBD']) + renderFutureGameCard('Final 4', 1, ['TBD', 'TBD'])) +
        '<div class="thBracketFantasyCenterTitle" style="margin-top:16px">National Championship</div>' +
        (titleGame ? renderFutureGameCard('Championship', 0, [titleGame.teamA, titleGame.teamB]) : renderFutureGameCard('Championship', 0, ['TBD', 'TBD'])) +
        '<div class="thBracketInsightList" style="margin-top:10px">' +
          '<div class="thBracketInsightItem"><b>Sample champion path:</b> ' + _thEsc(samplePath && samplePath.champion ? samplePath.champion : 'Run simulation to project the title path.') + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="thBracketFantasySide thBracketFantasySide--right">' +
        renderRegion('West', 'right') +
        renderRegion('Midwest', 'right') +
      '</div>' +
    '</div>';
  if (!thBracketBoardEl._thBracketBoardBound) {
    thBracketBoardEl.addEventListener('pointerdown', function (e) {
      var sel = e.target && e.target.closest ? e.target.closest('.thBracketSlotSelect') : null;
      if (sel) _thHydrateBracketSelect(sel);
    });
    thBracketBoardEl.addEventListener('focusin', function (e) {
      var sel = e.target && e.target.closest ? e.target.closest('.thBracketSlotSelect') : null;
      if (sel) _thHydrateBracketSelect(sel);
    });
    thBracketBoardEl.addEventListener('change', function (e) {
      var sel = e.target && e.target.closest ? e.target.closest('[data-bracket-region][data-bracket-seed]') : null;
      if (!sel) return;
      var region = sel.getAttribute('data-bracket-region') || '';
      var seed = parseInt(sel.getAttribute('data-bracket-seed'), 10) || 0;
      var value = sel.value || '';
      _thAssignBracketSeed(region, seed, value || '');
    });
    thBracketBoardEl.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-playin-open]') : null;
      if (!btn) return;
      _thOpenPlayInModal(btn.getAttribute('data-bracket-region') || '', parseInt(btn.getAttribute('data-bracket-seed'), 10) || 0);
    });
    thBracketBoardEl._thBracketBoardBound = true;
  }
  var groups = {};
  bracket.teams.forEach(function (item) {
    var region = item.region || 'Unassigned';
    groups[region] = true;
  });
  if (thBracketTeamCountEl) thBracketTeamCountEl.textContent = String(bracket.teams.length);
  if (thBracketRegionCountEl) thBracketRegionCountEl.textContent = String(Object.keys(groups).length);
  if (thBracketStructureEl) thBracketStructureEl.textContent = _thBracketFieldStructure(bracket);
}

function _thRenderBracketResults() {
  if (!thBracketResultsEl) return;
  var active = _thBracketActive();
  if (!active) {
    thBracketResultsEl.style.display = 'none';
    thBracketResultsEl.innerHTML = '';
    return;
  }
  var result = _thBracketState.results[active.id];
  if (!result) {
    thBracketResultsEl.style.display = 'none';
    thBracketResultsEl.innerHTML = '';
    return;
  }
  var topTeams = result.teams.slice(0, 12);
  var insightRows = [];
  if (result.championFavorite) {
    insightRows.push('<div class="thBracketInsightItem"><b>Model favorite:</b> ' + _thEsc(result.championFavorite.team) + ' wins the title in <b>' + result.championFavorite.championPct + '%</b> of sims.</div>');
  }
  if (result.upsets[0]) {
    insightRows.push('<div class="thBracketInsightItem"><b>Most common upset:</b> ' + _thEsc(result.upsets[0].label) + ' in <b>' + result.upsets[0].pct + '%</b> of simulations.</div>');
  }
  insightRows.push('<div class="thBracketInsightItem"><b>Bracket chaos level:</b> field averages <b>' + result.avgUpsetsPerSim + '</b> upsets per simulated tournament.</div>');
  if (result.methodology) {
    insightRows.push('<div class="thBracketInsightItem"><b>Method:</b> ' + _thEsc(result.methodology.baseline) + '; ' + _thEsc(result.methodology.matchup) + '; ' + _thEsc(result.methodology.recency) + '; ' + _thEsc(result.methodology.volatility) + '.</div>');
  }

  thBracketResultsEl.style.display = 'block';
  thBracketResultsEl.innerHTML =
    '<div class="thBracketStatGrid">' +
      '<div class="thBracketStatCard"><div class="thBracketStatVal">' + result.simulations.toLocaleString() + '</div><div class="thBracketStatLbl">Simulations</div></div>' +
      '<div class="thBracketStatCard"><div class="thBracketStatVal">' + result.totalTeams + '</div><div class="thBracketStatLbl">Teams In Field</div></div>' +
      '<div class="thBracketStatCard"><div class="thBracketStatVal">' + (result.championFavorite ? _thEsc(result.championFavorite.team) : '—') + '</div><div class="thBracketStatLbl">Top Champion Pick</div></div>' +
      '<div class="thBracketStatCard"><div class="thBracketStatVal">' + result.avgUpsetsPerSim + '</div><div class="thBracketStatLbl">Avg Upsets / Bracket</div></div>' +
    '</div>' +
    '<div class="thBracketResultsWrap">' +
      '<div>' +
        '<div class="thBracketMiniHead">Champion & Final Four Odds</div>' +
        '<table class="thBracketTable"><thead><tr><th>Team</th><th>Seed</th><th>Region</th><th>Champion</th><th>Final 4</th></tr></thead><tbody>' +
          topTeams.map(function (row) {
            return '<tr><td>' + _thEsc(row.team) + '</td><td>' + _thEsc(row.seed) + '</td><td>' + _thEsc(row.region) + '</td><td>' + row.championPct + '%</td><td>' + row.finalFourPct + '%</td></tr>';
          }).join('') +
        '</tbody></table>' +
      '</div>' +
      '<div>' +
        '<div class="thBracketMiniHead">War Room Notes</div>' +
        '<div class="thBracketInsightList">' + insightRows.join('') + '</div>' +
        '<div class="thBracketMiniHead" style="margin-top:12px">Region Winner Leaders</div>' +
        '<table class="thBracketTable"><thead><tr><th>Region</th><th>Team</th><th>Win %</th></tr></thead><tbody>' +
          result.regions.slice(0, 8).map(function (row) {
            return '<tr><td>' + _thEsc(row.region) + '</td><td>' + _thEsc(row.team) + '</td><td>' + row.pct + '%</td></tr>';
          }).join('') +
        '</tbody></table>' +
      '</div>' +
    '</div>';
}

function _thRenderBracketWorkspace() {
  var guest = _thIsGuest();
  _thSyncWarRoomLauncher();
  if (thBracketGateEl) {
    thBracketGateEl.style.display = guest ? '' : 'none';
    thBracketGateEl.innerHTML = guest
      ? '<div class="thBracketLockIcon">🔒</div><div style="font-size:16px;font-weight:800;color:var(--fg);margin-bottom:6px">Tournament War Room is user-only</div><div class="muted" style="font-size:12px;max-width:560px;margin:0 auto 10px">Log in to save tournament brackets, simulate the full field, and run Gemini 3 Flash bracket analysis.</div><button class="thLoadBtn" onclick="document.getElementById(\'guestLoginBtn\').click()">Login to unlock</button>'
      : '';
  }
  if (thBracketWorkspaceEl) thBracketWorkspaceEl.style.display = guest ? 'none' : '';
  if (guest) return;
  _thLoadBracketState();
  _thPopulateBracketTeamSelects();
  _thRenderBracketManager();
  _thRenderBracketBoard();
  _thRenderBracketResults();
}

function _thScheduleBracketWorkspaceRender() {
  if (_thBracketRenderFrame) cancelAnimationFrame(_thBracketRenderFrame);
  _thBracketRenderFrame = requestAnimationFrame(function () {
    _thBracketRenderFrame = 0;
    var warRoomPage = document.getElementById('pageWarRoom');
    if (warRoomPage && warRoomPage.style.display === 'none') return;
    _thRenderBracketWorkspace();
  });
}

function _thCommitBracketMeta() {
  var bracket = _thBracketActive();
  if (!bracket) return;
  bracket.name = _thNormalizeBracketName(thBracketNameEl ? thBracketNameEl.value : bracket.name);
  bracket.season = String(thBracketSeasonEl && thBracketSeasonEl.value ? thBracketSeasonEl.value : bracket.season || '2026');
  _thSaveBracketState();
  _thRenderBracketManager();
}

function _thCreateBracket() {
  var bracket = _thDefaultBracket();
  _thBracketState.brackets.unshift(bracket);
  _thBracketState.activeId = bracket.id;
  _thSaveBracketState();
  _thRenderBracketWorkspace();
}

function _thDuplicateBracket() {
  var active = _thBracketActive();
  if (!active) return;
  var copy = JSON.parse(JSON.stringify(active));
  copy.id = _thBracketId();
  copy.name = active.name + ' Copy';
  copy.createdAt = new Date().toISOString();
  copy.teams.forEach(function (team) { team.id = _thBracketId(); });
  _thBracketState.brackets.unshift(copy);
  _thBracketState.activeId = copy.id;
  _thSaveBracketState();
  _thRenderBracketWorkspace();
}

function _thDeleteBracket() {
  var active = _thBracketActive();
  if (!active) return;
  if (!confirm('Delete "' + active.name + '"?')) return;
  _thBracketState.brackets = _thBracketState.brackets.filter(function (b) { return b.id !== active.id; });
  delete _thBracketState.results[active.id];
  if (!_thBracketState.brackets.length) _thBracketState.brackets.push(_thDefaultBracket());
  _thBracketState.activeId = _thBracketState.brackets[0].id;
  _thSaveBracketState();
  _thRenderBracketWorkspace();
}

function _thAddBracketTeam(teamName, seed, region) {
  var bracket = _thBracketActive();
  if (!bracket || !teamName) return;
  if (bracket.teams.some(function (item) { return String(item.team).toLowerCase() === String(teamName).toLowerCase(); })) {
    if (typeof showWarn === 'function') showWarn(teamName + ' is already in this bracket.');
    return;
  }
  bracket.teams.push({
    id: _thBracketId(),
    team: teamName,
    seed: Math.max(1, Math.min(16, parseInt(seed, 10) || 1)),
    region: region || 'South'
  });
  _thCommitBracketMutation(bracket);
}

function _thRemoveBracketTeam(id) {
  var bracket = _thBracketActive();
  if (!bracket) return;
  bracket.teams = bracket.teams.filter(function (item) { return item.id !== id; });
  _thCommitBracketMutation(bracket);
}

function _thAssignBracketSeed(region, seed, teamName, opts) {
  return _thAssignBracketSeedEntry(region, seed, { team: teamName }, opts);
}

function _thAssignBracketSeedEntry(region, seed, entry, opts) {
  var bracket = _thBracketActive();
  if (!bracket || !region || !seed) return;
  entry = entry || {};
  var teamName = entry.team || '';
  bracket.teams = bracket.teams.filter(function (item) {
    if ((item.region || '') === region && Number(item.seed) === Number(seed)) return false;
    if (teamName && String(item.team).toLowerCase() === String(teamName).toLowerCase()) return false;
    if (Array.isArray(entry.candidates) && entry.candidates.length && Array.isArray(item.candidates)) {
      return !item.candidates.some(function (c) { return entry.candidates.indexOf(c) >= 0; });
    }
    if (Array.isArray(entry.candidates) && entry.candidates.length && item.team) {
      return !entry.candidates.some(function (c) { return String(c).toLowerCase() === String(item.team).toLowerCase(); });
    }
    return true;
  });
  if (teamName) {
    bracket.teams.push({
      id: _thBracketId(),
      team: teamName,
      seed: seed,
      region: region,
      candidates: Array.isArray(entry.candidates) ? entry.candidates.slice() : undefined
    });
  }
  _thCommitBracketMutation(bracket, opts);
}

function _thBuildEmpty64Bracket() {
  var bracket = _thBracketActive();
  if (!bracket) return;
  bracket.teams = [];
  _thCommitBracketMutation(bracket);
  if (thBracketImportStatusEl) thBracketImportStatusEl.textContent = 'Empty 64-slot bracket ready. Use the slot selectors or smart import.';
}

function _thClearBracketTeams() {
  var bracket = _thBracketActive();
  if (!bracket) return;
  if (!confirm('Clear every team from this bracket?')) return;
  bracket.teams = [];
  _thCommitBracketMutation(bracket);
}

function _thImportBracketTeams() {
  var bracket = _thBracketActive();
  if (!bracket || !thBracketImportEl) return;
  var lines = String(thBracketImportEl.value || '').split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
  var knownTeams = _thBracketAllTeams();
  var teamMap = {};
  knownTeams.forEach(function (team) { teamMap[_thNormTeamName(team)] = team; });
  var added = 0;
  var failed = [];
  var currentRegion = _thBracketRegions()[0];
  var seedCounters = { South: 0, East: 0, West: 0, Midwest: 0 };

  lines.forEach(function (line) {
    var normalizedLine = line.replace(/\s+/g, ' ').trim();
    var regionMatch = normalizedLine.match(/^(South|East|West|Midwest)\b/i);
    if (regionMatch) {
      currentRegion = regionMatch[1].charAt(0).toUpperCase() + regionMatch[1].slice(1).toLowerCase();
      return;
    }

    var parts = line.split('|').map(function (x) { return x.trim(); }).filter(Boolean);
    var seed = null;
    var region = currentRegion;
    var rawTeam = '';

    if (parts.length >= 3) {
      seed = parseInt(parts[0], 10) || null;
      rawTeam = parts[1];
      region = parts[2] || region;
    } else {
      var m = normalizedLine.match(/^(\d{1,2})\s+(.+)$/);
      if (m) {
        seed = parseInt(m[1], 10) || null;
        rawTeam = m[2].replace(/\s+\d{1,2}\s+.+$/, '').trim();
      } else {
        rawTeam = normalizedLine;
      }
    }

    var match = teamMap[_thNormTeamName(rawTeam)];
    var candidateList = [];
    if (!match) candidateList = _thParseTeamCandidates(rawTeam);
    if (!match && candidateList.length < 2) {
      failed.push(rawTeam);
      return;
    }
    if (!seed) {
      seedCounters[region] = (seedCounters[region] || 0) + 1;
      seed = Math.min(16, seedCounters[region]);
    } else {
      seedCounters[region] = Math.max(seedCounters[region] || 0, seed);
    }
    if (match) {
      _thAssignBracketSeed(region, seed, match, { deferRender: true, skipSave: true });
    } else {
      _thAssignBracketSeedEntry(region, seed, {
        team: candidateList.join(' / '),
        candidates: candidateList
      }, { deferRender: true, skipSave: true });
    }
    added += 1;
  });
  _thCommitBracketMutation(bracket);
  if (thBracketImportStatusEl) {
    thBracketImportStatusEl.textContent = added + ' added' + (failed.length ? ' · Unmatched: ' + failed.slice(0, 4).join(', ') + (failed.length > 4 ? '…' : '') : '');
  }
}

function _thAutofillBracketBySeedList() {
  var bracket = _thBracketActive();
  if (!bracket) return;
  var knownTeams = _thBracketAllTeams();
  if (!knownTeams.length) return;
  var byRating = knownTeams.map(function (team) {
    var rating = _thBracketTeamRating(team, bracket.season || '2026');
    return { team: team, adjEM: rating && Number.isFinite(+rating.adjEM) ? +rating.adjEM : -999 };
  }).sort(function (a, b) { return b.adjEM - a.adjEM; });
  var regions = _thBracketRegions();
  var used = {};
  bracket.teams = [];
  for (var r = 0; r < regions.length; r++) {
    for (var seed = 1; seed <= 16; seed++) {
      var idx = r * 16 + (seed - 1);
      var row = byRating[idx];
      if (!row || used[row.team]) continue;
      used[row.team] = true;
      bracket.teams.push({ id: _thBracketId(), team: row.team, seed: seed, region: regions[r] });
    }
  }
  _thCommitBracketMutation(bracket);
  if (thBracketImportStatusEl) thBracketImportStatusEl.textContent = 'Auto-filled a 64-team bracket using current model order.';
}

function _thLoadEspn2026Preset() {
  var bracket = _thBracketActive();
  if (!bracket) {
    _thCreateBracket();
    bracket = _thBracketActive();
  }
  if (!bracket) return;
  if (bracket.teams && bracket.teams.length && !confirm('Replace the current field with the ESPN 2026 preset?')) return;

  var teamMap = {};
  _thBracketAllTeams().forEach(function (team) { teamMap[_thNormTeamName(team)] = team; });
  var unresolved = [];
  bracket.name = _TH_2026_ESPN_PRESET.name;
  bracket.season = _TH_2026_ESPN_PRESET.season;
  bracket.teams = [];

  _TH_2026_ESPN_PRESET.entries.forEach(function (entry) {
    if (Array.isArray(entry.candidates) && entry.candidates.length) {
      var resolvedCandidates = entry.candidates.map(function (candidate) {
        return _thResolvePresetTeamName(candidate, teamMap);
      });
      resolvedCandidates.forEach(function (candidate, idx) {
        if (!teamMap[_thNormTeamName(candidate)]) unresolved.push(entry.candidates[idx]);
      });
      bracket.teams.push({
        id: _thBracketId(),
        team: resolvedCandidates.join(' / '),
        seed: entry.seed,
        region: entry.region,
        candidates: resolvedCandidates
      });
      return;
    }

    var resolvedTeam = _thResolvePresetTeamName(entry.team, teamMap);
    if (!teamMap[_thNormTeamName(resolvedTeam)]) unresolved.push(entry.team);
    bracket.teams.push({
      id: _thBracketId(),
      team: resolvedTeam,
      seed: entry.seed,
      region: entry.region
    });
  });

  _thCommitBracketMutation(bracket);
  _thRenderBracketManager();
  if (thBracketImportStatusEl) {
    thBracketImportStatusEl.textContent = 'Loaded ESPN 2026 preset (' + bracket.teams.length + ' slots).' +
      (unresolved.length ? ' Check unmatched names: ' + unresolved.slice(0, 4).join(', ') + (unresolved.length > 4 ? '…' : '') : '');
  }
}

function _thEnsureBracketJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!_thBracketJsPdfPromise) {
    _thBracketJsPdfPromise = loadScriptOnce(
      'jspdf',
      'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
      {
        timeoutMs: 12000,
        test: function () { return window.jspdf && window.jspdf.jsPDF; },
        errorMessage: 'jsPDF failed to load.'
      }
    );
  }
  return _thBracketJsPdfPromise;
}

function _thPdfFileName(name) {
  return String(name || 'tournament-war-room')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') + '.pdf';
}

async function _thOpenBracketPdfReport() {
  var bracket = _thBracketActive();
  var result = bracket ? _thBracketState.results[bracket.id] : null;
  if (!bracket || !result) {
    if (typeof showWarn === 'function') showWarn('Run a bracket simulation before exporting the War Room PDF.');
    return;
  }

  if (thBracketStatusEl) thBracketStatusEl.textContent = 'Building PDF preview...';
  try {
    var JsPDF = await _thEnsureBracketJsPdf();
    var doc = new JsPDF({ unit: 'pt', format: 'letter' });
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var margin = 42;
    var y = margin;

    function ensureSpace(height) {
      if (y + height <= pageH - margin) return;
      doc.addPage();
      y = margin;
    }
    function addTitle(text, size) {
      ensureSpace((size || 18) + 16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(size || 18);
      doc.text(text, margin, y);
      y += (size || 18) + 10;
    }
    function addBody(text, opts) {
      opts = opts || {};
      var fontSize = opts.fontSize || 10;
      var lineHeight = opts.lineHeight || 13;
      var indent = opts.indent || 0;
      var maxWidth = pageW - (margin * 2) - indent;
      var raw = Array.isArray(text) ? text.join('\n') : String(text || '');
      var lines = doc.splitTextToSize(raw, maxWidth);
      ensureSpace(lines.length * lineHeight + 4);
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      doc.setFontSize(fontSize);
      doc.text(lines, margin + indent, y);
      y += lines.length * lineHeight + (opts.gap != null ? opts.gap : 6);
    }
    function addSection(title, lines) {
      addTitle(title, 13);
      (lines || []).forEach(function (line) {
        addBody(line, { fontSize: 10, lineHeight: 13 });
      });
      y += 4;
    }

    var exportedAt = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
    var champion = result.championFavorite ? result.championFavorite.team + ' (' + result.championFavorite.championPct + '% title odds)' : 'No favorite available';
    var topTeams = result.teams.slice(0, 12);
    var regionLeaders = result.regions.slice(0, 8);
    var upsets = result.upsets.slice(0, 8);
    var methodology = result.methodology || {};
    var aiRaw = thBracketAIOutputEl && thBracketAIOutputEl.dataset ? (thBracketAIOutputEl.dataset.lastRaw || '') : '';

    doc.setProperties({
      title: bracket.name + ' War Room Report',
      subject: 'Tournament War Room simulation report',
      author: 'NCAA Scouting Dashboard'
    });

    addTitle(bracket.name || 'Tournament War Room', 20);
    addBody('Season: ' + (bracket.season || '2026') + '   •   Source preset: ' + (_TH_2026_ESPN_PRESET.source || 'Custom field'), { fontSize: 11, lineHeight: 14 });
    addBody('Exported: ' + exportedAt, { fontSize: 9, lineHeight: 12, gap: 10 });

    addSection('Simulation Snapshot', [
      'Simulations: ' + result.simulations.toLocaleString(),
      'Teams in field: ' + result.totalTeams,
      'Model favorite: ' + champion,
      'Average upsets per bracket: ' + result.avgUpsetsPerSim,
      'Sample champion path: ' + ((result.samplePath && result.samplePath.champion) || 'Not available')
    ]);

    addSection('Champion and Final Four Odds', topTeams.map(function (row, idx) {
      return (idx + 1) + '. ' + row.team + ' — Seed ' + row.seed + ' (' + row.region + '), Champion ' + row.championPct + '%, Final Four ' + row.finalFourPct + '%';
    }));

    addSection('Region Winner Leaders', regionLeaders.length ? regionLeaders.map(function (row) {
      return row.region + ': ' + row.team + ' (' + row.pct + '%)';
    }) : ['No region results available yet.']);

    addSection('Most Common Upsets', upsets.length ? upsets.map(function (row, idx) {
      return (idx + 1) + '. ' + row.label + ' — ' + row.pct + '%';
    }) : ['No upset patterns available yet.']);

    addSection('Methodology', [
      'Baseline: ' + (methodology.baseline || 'Adjusted offense/defense blended against opponent profile'),
      'Matchup: ' + (methodology.matchup || 'Four-factor and scoring-profile interactions adjust expected efficiency'),
      'Recency: ' + (methodology.recency || 'Last 10 games and recent postseason results nudge team strength'),
      'Volatility: ' + (methodology.volatility || 'Team-specific scoring volatility estimated from full-season and recent game logs')
    ]);

    addSection('Gemini Analysis', aiRaw
      ? aiRaw.split(/\r?\n/).map(function (line) {
          return line.replace(/^##\s*/, '').replace(/^###\s*/, '').trim();
        }).filter(Boolean)
      : ['Run Gemini Bracket Analysis to include the narrative scouting report in this PDF.']);

    var blobUrl = doc.output('bloburl');
    var preview = window.open(blobUrl, '_blank');
    if (!preview) {
      doc.save(_thPdfFileName((bracket.name || 'tournament-war-room') + '-report'));
      if (thBracketStatusEl) thBracketStatusEl.textContent = 'PDF downloaded';
      return;
    }
    if (thBracketStatusEl) thBracketStatusEl.textContent = 'PDF preview opened in a new tab';
  } catch (e) {
    if (thBracketStatusEl) thBracketStatusEl.textContent = 'PDF export failed';
    if (typeof showWarn === 'function') showWarn('War Room PDF export failed: ' + (e && e.message ? e.message : e));
  }
}

async function _thRunBracketSimulation() {
  var bracket = _thBracketActive();
  if (!bracket || !thBracketResultsEl) return;
  var total = bracket.teams.length;
  if (total < 2 || (total & (total - 1)) !== 0) {
    if (typeof showWarn === 'function') showWarn('Bracket simulation needs a power-of-two field (4, 8, 16, 32, 64…).');
    return;
  }
  if (thBracketStatusEl) thBracketStatusEl.textContent = 'Running tournament simulations...';
  thBracketResultsEl.style.display = 'block';
  thBracketResultsEl.innerHTML = '<div class="thDeepLoading"><span class="thDeepSpinner"></span> Running full-bracket Monte Carlo simulations...</div>';
  if (thBracketAIOutputEl) {
    thBracketAIOutputEl.style.display = 'none';
    thBracketAIOutputEl.innerHTML = '';
    if (thBracketAIOutputEl.dataset) delete thBracketAIOutputEl.dataset.lastRaw;
  }
  var nSims = thBracketSimCountEl ? (parseInt(thBracketSimCountEl.value, 10) || 5000) : 5000;
  try {
    if (thBracketStatusEl) thBracketStatusEl.textContent = 'Loading team contexts and recent form...';
    await _thPrepareBracketContexts(bracket);
    var result = await _thAggregateBracketSims(bracket, nSims, function (done, totalSims) {
      if (thBracketStatusEl) thBracketStatusEl.textContent = 'Running tournament simulations... ' + done.toLocaleString() + ' / ' + totalSims.toLocaleString();
    });
    _thBracketState.results[bracket.id] = result;
    _thSaveBracketState();
    _thRenderBracketBoard();
    _thRenderBracketResults();
    if (thBracketStatusEl) thBracketStatusEl.textContent = 'Simulation complete - ' + nSims.toLocaleString() + ' runs';

  } catch (e) {
    if (thBracketStatusEl) thBracketStatusEl.textContent = 'Simulation failed';
    thBracketResultsEl.innerHTML = '<div class="thMCError">Simulation failed: ' + _thEsc(e && e.message ? e.message : e) + '</div>';
  }
}

async function _thRunBracketAIAnalysis() {
  var bracket = _thBracketActive();
  var result = bracket ? _thBracketState.results[bracket.id] : null;
  if (!bracket || !result || !thBracketAIOutputEl) {
    if (typeof showWarn === 'function') showWarn('Run the bracket simulation first.');
    return;
  }
  if (_thIsGuest()) {
    if (typeof showWarn === 'function') showWarn('Tournament War Room is available only to logged-in users.');
    return;
  }
  if (thBracketStatusEl) thBracketStatusEl.textContent = 'Sending simulation context to Gemini 3 Flash...';
  thBracketAIOutputEl.style.display = 'block';
  thBracketAIOutputEl.innerHTML = '<div class="thDeepLoading"><span class="thDeepSpinner"></span> Generating bracket-level analysis...</div>';

  var payload = {
    bracket: {
      name: bracket.name,
      season: bracket.season,
      teamCount: bracket.teams.length,
      field: bracket.teams
    },
    simulation: {
      simulations: result.simulations,
      methodology: result.methodology,
      samplePath: result.samplePath,
      championOdds: result.teams.slice(0, 12).map(function (row) {
        return {
          team: row.team,
          seed: row.seed,
          region: row.region,
          championPct: row.championPct,
          finalFourPct: row.finalFourPct,
          eliteEightPct: row.eliteEightPct,
          sweetSixteenPct: row.sweetSixteenPct
        };
      }),
      regionLeaders: result.regions.slice(0, 8),
      upsetLeaders: result.upsets.slice(0, 8),
      avgUpsetsPerSim: result.avgUpsetsPerSim
    }
  };

  var systemInstruction = {
    parts: [{ text: 'You are an expert NCAA tournament strategist. Analyze only the provided bracket structure and simulation outputs. Be sharp, specific, and actionable for coaching staffs and front-office decision makers. Use markdown with ## headers and concise bullets.' }]
  };
  var prompt =
    'Analyze this NCAA tournament bracket simulation and produce a war-room report.\n\n' +
    'Use these exact sections:\n' +
    '## Title Favorite\n' +
    '## Final Four Outlook\n' +
    '## Best Value Teams\n' +
    '## Upset Watch\n' +
    '## Region By Region\n' +
    '## Most Likely Finals Paths\n' +
    '## Model Risk Notes\n' +
    '## Recommendation\n\n' +
    'Explain where the model is confident, where the bracket is volatile, which teams appear underseeded or dangerous relative to seed, and how the simulation methodology likely shaped the results. Keep it grounded in the simulation data only.\n\n' +
    '```json\n' + JSON.stringify(payload, null, 2) + '\n```';

  try {
    var res = await fetch('https://white-pine-7669.bryanhkwan.workers.dev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: systemInstruction,
        generationConfig: { temperature: 0.6, maxOutputTokens: 5000 }
      })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    var text = (((data.candidates || [])[0] || {}).content || {}).parts || [];
    var joined = text.map(function (p) { return p.text || ''; }).join('\n').trim();
    thBracketAIOutputEl.innerHTML = _thFmtDeepText(joined || 'No analysis returned.');
    thBracketAIOutputEl.dataset.lastRaw = joined || 'No analysis returned.';
    thBracketAIOutputEl.dataset.bracketName = bracket.name || '';
    thBracketAIOutputEl.dataset.bracketSeason = bracket.season || '';
    if (thBracketStatusEl) thBracketStatusEl.textContent = 'Gemini bracket analysis ready';
  } catch (e) {
    thBracketAIOutputEl.innerHTML = '<div class="thMCError">Bracket analysis failed: ' + _thEsc(e && e.message ? e.message : e) + '</div>';
    if (thBracketAIOutputEl.dataset) delete thBracketAIOutputEl.dataset.lastRaw;
    if (thBracketStatusEl) thBracketStatusEl.textContent = 'Bracket analysis failed';
  }
}

// ── Model toggle (exact same structure as MBB/WBB league toggle) ─────────────
function thSetDeepModel(heavy) {
  // Guests cannot use the Pro model
  if (heavy && _thIsGuest()) {
    if (typeof showWarn === 'function') showWarn('🔒 Pro model requires login. Guest users can only use 2.5 Lite.');
    var cb2 = document.getElementById('thModelSwitchInput');
    if (cb2) cb2.checked = false;
    return;
  }
  _thDeepUseHeavyModel = !!heavy;
  localStorage.setItem('thDeepModel', _thDeepUseHeavyModel ? 'heavy' : 'lite');
  var cb = document.getElementById('thModelSwitchInput');
  if (cb) cb.checked = _thDeepUseHeavyModel;
  var lblLite  = document.getElementById('thModelLblLite');
  var lblHeavy = document.getElementById('thModelLblHeavy');
  if (lblLite)  { lblLite.classList.toggle('active', !_thDeepUseHeavyModel); }
  if (lblHeavy) { lblHeavy.classList.toggle('active',  _thDeepUseHeavyModel); }
}

function initTeamsDOMRefs() {
  thTeamSearch  = document.getElementById('thTeamSearch');
  thSeasonInput = document.getElementById('thSeason');
  thLoadBtn     = document.getElementById('thLoadBtn');
  thValueLabBtn = document.getElementById('thValueLabBtn');
  thOverviewEl  = document.getElementById('thOverview');
  thThreatsEl   = document.getElementById('thThreats');
  thGameLogEl   = document.getElementById('thGameLog');
  thH2HEl       = document.getElementById('thH2H');
  thLoadingEl   = document.getElementById('thLoading');
  thBracketGateEl = document.getElementById('thBracketGate');
  thBracketWorkspaceEl = document.getElementById('thBracketWorkspace');
  thBracketSelectEl = document.getElementById('thBracketSelect');
  thBracketNameEl = document.getElementById('thBracketName');
  thBracketSeasonEl = document.getElementById('thBracketSeason');
  thBracketTeamAddEl = document.getElementById('thBracketTeamAdd');
  thBracketSeedAddEl = document.getElementById('thBracketSeedAdd');
  thBracketRegionAddEl = document.getElementById('thBracketRegionAdd');
  thBracketImportEl = document.getElementById('thBracketImport');
  thBracketImportStatusEl = document.getElementById('thBracketImportStatus');
  thBracketBoardEl = document.getElementById('thBracketBoard');
  thBracketStatusEl = document.getElementById('thBracketStatus');
  thBracketResultsEl = document.getElementById('thBracketResults');
  thBracketAIOutputEl = document.getElementById('thBracketAIOutput');
  thBracketPlayInModalEl = document.getElementById('thBracketPlayInModal');
  thBracketPlayInRegionEl = document.getElementById('thBracketPlayInRegion');
  thBracketPlayInSeedEl = document.getElementById('thBracketPlayInSeed');
  thBracketPlayInTeamAEl = document.getElementById('thBracketPlayInTeamA');
  thBracketPlayInTeamBEl = document.getElementById('thBracketPlayInTeamB');
  thWarRoomLaunchBtnEl = document.getElementById('labWarRoomBtn');
  thWarRoomLockNoteEl = document.getElementById('labWarRoomLockNote');
  thBracketTeamCountEl = document.getElementById('thBracketTeamCount');
  thBracketRegionCountEl = document.getElementById('thBracketRegionCount');
  thBracketStructureEl = document.getElementById('thBracketStructure');
  thBracketSimCountEl = document.getElementById('thBracketSimCount');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _thFmt(v, d) {
  d = d == null ? 1 : d;
  return Number.isFinite(+v) ? (+v).toFixed(d) : '—';
}

function _thGrade(p) {
  if (!Number.isFinite(p)) return 'var(--muted)';
  if (p >= 80) return 'var(--good)';
  if (p >= 55) return 'var(--accent)';
  if (p >= 35) return 'var(--warn)';
  return 'var(--bad)';
}

function _thPctOf(arr, v) {
  if (!arr.length || !Number.isFinite(v)) return null;
  return Math.round(arr.filter(x => x <= v).length / arr.length * 100);
}

function _thLoading(msg) {
  if (thLoadingEl) {
    thLoadingEl.textContent = msg || '';
    thLoadingEl.style.display = msg ? 'block' : 'none';
  }
}

function _thNormTeamName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b(university|college|of|the|at)\b/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function _thFindWbbConferenceForTeam(teamName) {
  if (!teamName || typeof tbGetAllPlayers !== 'function') return '';
  const tKey = _thNormTeamName(teamName);
  const sample = tbGetAllPlayers('WBB').find(p => _thNormTeamName(p.Team) === tKey && p.Conference);
  return sample ? String(sample.Conference).trim() : '';
}

async function _thBuildWbbConferenceStandings(confName, season) {
  const conf = String(confName || '').trim();
  const yr = String(season || thCurrentSeason || '2026');
  if (!conf || typeof tbGetAllPlayers !== 'function' || typeof loadGamesForTeam !== 'function') return null;
  const cacheKey = (conf + ':' + yr).toLowerCase();
  if (_thWbbConfStandingsCache[cacheKey] !== undefined) return _thWbbConfStandingsCache[cacheKey];

  const confKey = conf.toLowerCase();
  const confTeams = [...new Set(
    tbGetAllPlayers('WBB')
      .filter(p => String(p.Conference || '').trim().toLowerCase() === confKey)
      .map(p => p.Team)
      .filter(Boolean)
  )];
  if (!confTeams.length) {
    _thWbbConfStandingsCache[cacheKey] = null;
    return null;
  }

  const normSet = new Set(confTeams.map(_thNormTeamName));
  const gamesByTeam = await Promise.all(confTeams.map(t => loadGamesForTeam(t, yr).catch(() => null)));

  const rows = confTeams.map((team, idx) => {
    const tNorm = _thNormTeamName(team);
    const gd = gamesByTeam[idx] || null;
    const games = gd && gd.games ? gd.games : [];
    let confW = 0, confL = 0, overallW = 0, overallL = 0;

    games.forEach(g => {
      const hn = _thNormTeamName(g.homeTeam);
      const an = _thNormTeamName(g.awayTeam);
      const isHome = hn === tNorm;
      const isAway = an === tNorm;
      if (!isHome && !isAway) return;

      const ts = Number(isHome ? g.homePoints : g.awayPoints);
      const os = Number(isHome ? g.awayPoints : g.homePoints);
      if (!Number.isFinite(ts) || !Number.isFinite(os)) return;

      const won = ts > os;
      if (won) overallW++; else overallL++;

      const oppNorm = isHome ? an : hn;
      if (normSet.has(oppNorm)) {
        if (won) confW++; else confL++;
      }
    });

    const confGames = confW + confL;
    const overallGames = overallW + overallL;
    return {
      team: team,
      confW: confW,
      confL: confL,
      confPct: confGames ? (confW / confGames) : 0,
      overallW: overallW,
      overallL: overallL,
      overallPct: overallGames ? (overallW / overallGames) : 0,
    };
  });

  rows.sort((a, b) => {
    if (b.confPct !== a.confPct) return b.confPct - a.confPct;
    if (b.confW !== a.confW) return b.confW - a.confW;
    if (b.overallPct !== a.overallPct) return b.overallPct - a.overallPct;
    if (b.overallW !== a.overallW) return b.overallW - a.overallW;
    return String(a.team || '').localeCompare(String(b.team || ''));
  });

  const out = {};
  rows.forEach((r, i) => {
    out[_thNormTeamName(r.team)] = Object.assign({ rank: i + 1 }, r);
  });

  _thWbbConfStandingsCache[cacheKey] = out;
  return out;
}

// ── Render: Program Overview ──────────────────────────────────────────────────
function thRenderOverview(teamData, gamesData, statsData) {
  if (!thOverviewEl) return;
  // For WBB, teamData from ratings may be null — allow rendering with fallback
  const isWBB = (typeof league !== 'undefined' && league === 'WBB');
  if (!teamData && !isWBB) {
    thOverviewEl.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Select a team to view program analysis.</div>';
    return;
  }
  if (!teamData && isWBB && !thCurrentTeam) {
    thOverviewEl.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Select a team to view program analysis.</div>';
    return;
  }

  // Derive W-L record from games
  const games = (gamesData && gamesData.games) ? gamesData.games : [];
  let wins = 0, losses = 0, confW = 0, confL = 0;
  const tnForRecord = (teamData && teamData.team) ? teamData.team.toLowerCase() : (thCurrentTeam || '').toLowerCase();
  games.forEach(g => {
    const hn = (g.homeTeam || '').toLowerCase();
    const an = (g.awayTeam || '').toLowerCase();
    const isHome = hn === tnForRecord;
    const isAway = an === tnForRecord;
    if (!isHome && !isAway) return;
    const ts = isHome ? g.homePoints : g.awayPoints;
    const os = isHome ? g.awayPoints : g.homePoints;
    if (ts == null || os == null) return;
    const won = ts > os;
    if (won) wins++; else losses++;
    if (g.conferenceGame) { if (won) confW++; else confL++; }
  });

  const hasRecord = (wins + losses) > 0;
  const recordStr = hasRecord ? `${wins}–${losses}` : '—';
  const confRecord = (confW + confL) > 0 ? `${confW}–${confL} conf` : '';

  // Conference standing from ESPN (WBB) or game log (MBB)
  const standing = statsData && statsData.conferenceStanding;
  let confStandingStr = confRecord;
  if (standing && (standing.confWins != null || standing.confLosses != null)) {
    const cw = standing.confWins != null ? standing.confWins : '?';
    const cl = standing.confLosses != null ? standing.confLosses : '?';
    const rankPart = standing.confRank ? ` · #${standing.confRank} in conf` : '';
    confStandingStr = `${cw}–${cl} conf${rankPart}`;
  }

  const adjOs = allRatingsData.map(x => x.adjO).filter(Number.isFinite).sort((a,b)=>a-b);
  const adjDs = allRatingsData.map(x => x.adjD).filter(Number.isFinite).sort((a,b)=>a-b);
  const oPct  = teamData ? _thPctOf(adjOs, teamData.adjO) : null;
  const dPct  = (teamData && teamData.adjD != null) ? (100 - _thPctOf(adjDs, teamData.adjD)) : null;
  const adjEM = (teamData && Number.isFinite(teamData.adjEM)) ? teamData.adjEM : null;
  const emStr = adjEM != null ? ((adjEM >= 0 ? '+' : '') + _thFmt(adjEM)) : '—';
  const rankStr  = (teamData && teamData.rank) ? '#' + teamData.rank : '—';
  const rankColor = (teamData && teamData.rank) ? (teamData.rank <= 10 ? 'var(--good)' : teamData.rank <= 25 ? 'var(--accent)' : teamData.rank <= 50 ? 'var(--warn)' : 'var(--muted)') : 'var(--muted)';
  const displayName = (teamData && teamData.team) ? teamData.team : thCurrentTeam;
  // For WBB (no ratings), try to find conference from player pool
  let displayConf = (teamData && teamData.conference) ? teamData.conference : '';
  if (!displayConf && isWBB && thCurrentTeam && typeof tbGetAllPlayers === 'function') {
    const sample = tbGetAllPlayers().find(p => (p.Team || '').toLowerCase() === thCurrentTeam.toLowerCase());
    displayConf = (sample && sample.Conference) ? sample.Conference : '';
  }
  if (!displayConf) displayConf = '—';
  const displaySeason = thSeasonInput ? thSeasonInput.value : '2026';

  // Style-of-play assessments (only O/D based — tempo unavailable)
  const styleLines = [];
  if (oPct != null) {
    if (oPct >= 75) styleLines.push('🔥 Elite offensive efficiency');
    else if (oPct >= 55) styleLines.push('📈 Above-average offense');
    else if (oPct <= 30) styleLines.push('⬇️ Below-average offense');
  }
  if (dPct != null) {
    if (dPct >= 75) styleLines.push('🛡️ Elite defense');
    else if (dPct >= 55) styleLines.push('💪 Above-average defense');
    else if (dPct <= 30) styleLines.push('⚠️ Below-average defense');
  }
  if (adjEM != null) {
    if (adjEM >= 20) styleLines.push('⭐ Elite net efficiency');
    else if (adjEM <= -10) styleLines.push('📉 Negative net efficiency');
  }

  // WBB ESPN-based stats panel (when no Barttorvik ratings)
  const wbbStatsHtml = isWBB && statsData && statsData.teamStats ? (() => {
    const ts = statsData.teamStats;
    const ff = ts.fourFactors || {};
    const ppg = ts.points && statsData.games ? (ts.points.total / statsData.games).toFixed(1) : '—';
    const efg = ff.effectiveFieldGoalPct != null ? ff.effectiveFieldGoalPct.toFixed(1) + '%' : '—';
    const tovR = ff.turnoverRatio != null ? (ff.turnoverRatio * 100).toFixed(1) + '%' : '—';
    const orebP = ff.offensiveReboundPct != null ? ff.offensiveReboundPct.toFixed(1) + '%' : '—';
    const ftr = ff.freeThrowRate != null ? ff.freeThrowRate.toFixed(1) + '%' : '—';
    return `
      <div class="thRatCard"><div class="thRatVal">${ppg}</div><div class="thRatLabel">PPG</div><div class="thRatPct">points/game</div></div>
      <div class="thRatCard"><div class="thRatVal">${efg}</div><div class="thRatLabel">eFG%</div><div class="thRatPct">eff. FG rate</div></div>
      <div class="thRatCard"><div class="thRatVal">${orebP}</div><div class="thRatLabel">OREB%</div><div class="thRatPct">off. rebounding</div></div>
      <div class="thRatCard"><div class="thRatVal">${tovR}</div><div class="thRatLabel">TOV%</div><div class="thRatPct">turnover rate</div></div>
      <div class="thRatCard"><div class="thRatVal">${ftr}</div><div class="thRatLabel">FT Rate</div><div class="thRatPct">FTM/FGA</div></div>`;
  })() : `
      <div class="thRatCard">
        <div class="thRatVal" style="color:${_thGrade(oPct)}">${teamData ? _thFmt(teamData.adjO) : '—'}</div>
        <div class="thRatLabel">Adj. Offense</div>
        <div class="thRatPct">${oPct != null ? oPct+'th %ile' : ''}</div>
      </div>
      <div class="thRatCard">
        <div class="thRatVal" style="color:${_thGrade(dPct)}">${teamData ? _thFmt(teamData.adjD) : '—'}</div>
        <div class="thRatLabel">Adj. Defense</div>
        <div class="thRatPct">${dPct != null ? dPct+'th %ile' : ''}</div>
      </div>
      <div class="thRatCard">
        <div class="thRatVal" style="color:${adjEM!=null&&adjEM>=0?'var(--good)':adjEM!=null?'var(--bad)':'var(--muted)'}">${emStr}</div>
        <div class="thRatLabel">Net Efficiency</div>
        <div class="thRatPct">net rating</div>
      </div>
      <div class="thRatCard">
        <div class="thRatVal" style="color:${rankColor};font-size:20px">${rankStr}</div>
        <div class="thRatLabel">Natl Rank</div>
        <div class="thRatPct">by net efficiency</div>
      </div>
      <div class="thRatCard">
        <div class="thRatVal">${teamData ? _thFmt(teamData.srs) : '—'}</div>
        <div class="thRatLabel">SRS Rating</div>
        <div class="thRatPct">simple rating</div>
      </div>`;

  thOverviewEl.innerHTML = `
    <div class="thHeroCard">
      <div class="thHeroLeft">
        <div class="thTeamName">${displayName}</div>
        <div class="thConf">${displayConf} · Season ${displaySeason}</div>
        <div class="thRecord">${recordStr}${confStandingStr ? ' · ' + confStandingStr : ''}</div>
        ${styleLines.length ? `<div class="thStyleLines">${styleLines.map(s=>`<span class="thStyleTag">${s}</span>`).join('')}</div>` : ''}
      </div>
      <div class="thRatingsGrid">
        ${wbbStatsHtml}
      </div>
    </div>`;
}

// ── Render: Conference Threats ────────────────────────────────────────────────
function thRenderThreats(teamData, gamesData, wbbStandings) {
  if (!thThreatsEl) return;
  const isWBB = (typeof league !== 'undefined' && league === 'WBB');
  if (!teamData && !isWBB) {
    thThreatsEl.innerHTML = '<div class="muted" style="padding:16px;text-align:center">Select a team to view threats.</div>';
    return;
  }

  let conf = teamData && teamData.conference ? teamData.conference : '';
  if (!conf && isWBB && thCurrentTeam) {
    conf = _thFindWbbConferenceForTeam(thCurrentTeam);
  }

  const effectiveTeamData = teamData || { team: thCurrentTeam, conference: conf, season: +(thSeasonInput ? thSeasonInput.value : '2026'), adjEM: null };
  // Filter to the same season as teamData to avoid showing duplicate historical rows
  const targetSeason = effectiveTeamData.season || +(thSeasonInput ? thSeasonInput.value : '2026');
  const confTeams = allRatingsData
    .filter(t => t.conference === conf && +t.season === +targetSeason)
    .sort((a, b) => (b.adjEM || 0) - (a.adjEM || 0));

  let fallbackTeams = [];
  if (!confTeams.length && isWBB && conf && typeof tbGetAllPlayers === 'function') {
    const confKey = String(conf).trim().toLowerCase();
    const inConf = tbGetAllPlayers('WBB').filter(p => String(p.Conference || '').trim().toLowerCase() === confKey);
    const byTeam = {};
    inConf.forEach(p => {
      const t = p.Team || '';
      if (!t) return;
      if (!byTeam[t]) byTeam[t] = [];
      byTeam[t].push(p);
    });
    fallbackTeams = Object.keys(byTeam).map(t => {
      const arr = byTeam[t];
      const top = arr
        .map(p => safeNum(p.PerfScore))
        .filter(Number.isFinite)
        .sort((a,b) => b-a)
        .slice(0, 8);
      const avgTop = top.length ? +(top.reduce((s,v)=>s+v,0) / top.length).toFixed(1) : null;
      const key = t.toLowerCase();
      const known = teamRatings[key] || null;
      const adjEM = (known && Number.isFinite(+known.adjEM)) ? +known.adjEM : avgTop;
      return {
        team: t,
        conference: conf,
        season: +targetSeason,
        adjEM: adjEM,
        srs: null,
      };
    }).sort((a,b) => (b.adjEM || 0) - (a.adjEM || 0));
  }

  let listTeams = confTeams.length ? confTeams : fallbackTeams;
  if (isWBB && wbbStandings) {
    listTeams = listTeams.slice().sort((a, b) => {
      const sa = wbbStandings[_thNormTeamName(a.team)] || null;
      const sb = wbbStandings[_thNormTeamName(b.team)] || null;
      if (sa && sb) return sa.rank - sb.rank;
      if (sa) return -1;
      if (sb) return 1;
      return (b.adjEM || 0) - (a.adjEM || 0);
    });
  }

  if (!listTeams.length) {
    thThreatsEl.innerHTML = `<div class="muted" style="padding:16px;text-align:center">No conference data for ${conf || 'unknown conference'}.</div>`;
    return;
  }

  // Build H2H record from games data
  const games = (gamesData && gamesData.games) ? gamesData.games : [];
  const h2hMap = {};
  games.forEach(g => {
    const hn = (g.homeTeam || '').toLowerCase();
    const an = (g.awayTeam || '').toLowerCase();
    const tn = (effectiveTeamData.team || '').toLowerCase();
    const isHome = hn === tn;
    const isAway = an === tn;
    if (!isHome && !isAway) return;
    const opponent = isHome ? (g.awayTeam || '') : (g.homeTeam || '');
    const ts = isHome ? g.homePoints : g.awayPoints;
    const os = isHome ? g.awayPoints : g.homePoints;
    if (ts == null || os == null) return;
    if (!h2hMap[opponent]) h2hMap[opponent] = { w: 0, l: 0 };
    if (ts > os) h2hMap[opponent].w++; else h2hMap[opponent].l++;
  });

  let html = `<div class="thThreatsTable">
    <div class="thThreatHead">
      <span>#</span><span>Team</span><span>AdjEM</span><span>SRS</span><span>H2H</span><span></span>
    </div>`;

  listTeams.forEach((t, i) => {
    const sRow = isWBB && wbbStandings ? (wbbStandings[_thNormTeamName(t.team)] || null) : null;
    const isUs = (t.team || '').toLowerCase() === (effectiveTeamData.team || '').toLowerCase();
    const rec = Object.entries(h2hMap).find(([k]) => k.toLowerCase() === (t.team||'').toLowerCase());
    const h2h = rec ? rec[1] : null;
    const h2hStr = h2h ? `${h2h.w}–${h2h.l}` : isUs ? '—' : '';
    const h2hColor = h2h ? (h2h.w > h2h.l ? 'var(--good)' : h2h.w < h2h.l ? 'var(--bad)' : 'var(--warn)') : 'var(--muted)';
    const emColor = (t.adjEM||0) >= 0 ? 'var(--good)' : 'var(--bad)';
    const isThreat = !isUs && (t.adjEM || 0) > (effectiveTeamData.adjEM || 0) && (!h2h || h2h.l >= h2h.w);
    const escapedName = (t.team || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

    html += `<div class="thThreatRow${isUs ? ' thThreatUs' : isThreat ? ' thThreatDanger' : ''}">
      <span class="thThreatRank">${sRow ? sRow.rank : (i + 1)}</span>
      <span class="thThreatName">
        ${t.team || '—'}
        ${isUs ? '<span class="thYouBadge">you</span>' : ''}
        ${isThreat ? '<span class="thDangerBadge">⚠ threat</span>' : ''}
      </span>
      <span style="color:${emColor};font-weight:700">${(t.adjEM||0)>=0?'+':''}${_thFmt(t.adjEM)}</span>
      <span style="color:var(--muted)">${sRow ? (sRow.confW + '–' + sRow.confL) : _thFmt(t.srs)}</span>
      <span style="color:${h2hColor};font-weight:700">${h2hStr}</span>
      <span>${!isUs ? `<button class="secondary thOppBtn" onclick="thLoadOpponent('${escapedName}')" title="Load ${t.team} as opponent">⚔</button>` : ''}</span>
    </div>`;
  });

  html += '</div>';
  thThreatsEl.innerHTML = html;
}

// ── Render: Season Game Log ───────────────────────────────────────────────────
function thRenderGameLog(teamData, gamesData) {
  if (!thGameLogEl) return;
  if (!gamesData || !gamesData.games || !gamesData.games.length) {
    thGameLogEl.innerHTML = '<div class="muted" style="padding:20px;text-align:center">No game log data available yet.</div>';
    return;
  }

  const tn = (teamData ? teamData.team : thCurrentTeam || '').toLowerCase();
  const games = gamesData.games.slice().sort((a, b) =>
    new Date(a.startDate || a.date || 0) - new Date(b.startDate || b.date || 0)
  );

  let w = 0, l = 0;
  let html = `<div class="thGameLogTable">
    <div class="thGameLogHead">
      <span>Date</span><span>Opponent</span><span>H/A</span><span>Result</span><span>Score</span>
    </div>`;

  games.forEach(g => {
    const isHome = (g.homeTeam || '').toLowerCase() === tn;
    const opponent = isHome ? (g.awayTeam || '—') : (g.homeTeam || '—');
    const ts = isHome ? g.homePoints : g.awayPoints;
    const os = isHome ? g.awayPoints : g.homePoints;
    const hasScore = ts != null && os != null;
    const won = hasScore && ts > os;
    if (hasScore) { if (won) w++; else l++; }
    const dateRaw = g.startDate || g.date;
    const dateStr = dateRaw ? new Date(dateRaw).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '—';
    const scoreStr = hasScore ? `${ts}–${os}` : '—';
    const wl = hasScore ? (won ? 'W' : 'L') : '—';
    const wlColor = wl === 'W' ? 'var(--good)' : wl === 'L' ? 'var(--bad)' : 'var(--muted)';
    const ha = isHome ? 'H' : 'A';
    const streak = hasScore ? `(${w}–${l})` : '';

    html += `<div class="thGameRow">
      <span class="thGameDate">${dateStr}</span>
      <span class="thGameOpp">${opponent}</span>
      <span class="thGameHA">${ha}</span>
      <span class="thGameWL" style="color:${wlColor}">${wl} <span class="thGameStreak">${streak}</span></span>
      <span class="thGameScore">${scoreStr}</span>
    </div>`;
  });

  html += `</div>
    <div class="thGameLogFooter">Final record: <b style="color:var(--good)">${w}</b>–<b style="color:var(--bad)">${l}</b></div>`;
  thGameLogEl.innerHTML = html;
}

// ── Render: Head-to-Head Records ──────────────────────────────────────────────
function thRenderH2H(teamData, gamesData) {
  if (!thH2HEl) return;
  if (!gamesData || !gamesData.games || !gamesData.games.length) {
    thH2HEl.innerHTML = '<div class="muted" style="padding:20px;text-align:center">No head-to-head data available yet.</div>';
    return;
  }

  const tn = (teamData ? teamData.team : thCurrentTeam || '').toLowerCase();
  const oppMap = {};

  gamesData.games.forEach(g => {
    const isHome = (g.homeTeam || '').toLowerCase() === tn;
    const isAway = (g.awayTeam || '').toLowerCase() === tn;
    if (!isHome && !isAway) return;
    const opp = isHome ? (g.awayTeam || '') : (g.homeTeam || '');
    const ts  = isHome ? g.homePoints : g.awayPoints;
    const os  = isHome ? g.awayPoints : g.homePoints;
    if (ts == null || os == null) return;
    if (!oppMap[opp]) oppMap[opp] = { w: 0, l: 0, ourPts: [], theirPts: [] };
    if (ts > os) oppMap[opp].w++; else oppMap[opp].l++;
    oppMap[opp].ourPts.push(ts);
    oppMap[opp].theirPts.push(os);
  });

  const opponents = Object.entries(oppMap).sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l));
  if (!opponents.length) {
    thH2HEl.innerHTML = '<div class="muted" style="padding:20px;text-align:center">No head-to-head records found.</div>';
    return;
  }

  const avg = arr => arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length).toFixed(1) : '—';

  let html = `<div class="thH2HTable">
    <div class="thH2HHead">
      <span>Opponent</span><span>W</span><span>L</span><span>Avg Pts</span><span>Avg Allow</span><span>Margin</span>
    </div>`;

  opponents.forEach(([opp, rec]) => {
    const avgUs   = parseFloat(avg(rec.ourPts));
    const avgThem = parseFloat(avg(rec.theirPts));
    const margin  = Number.isFinite(avgUs) && Number.isFinite(avgThem) ? (avgUs - avgThem).toFixed(1) : '—';
    const marginColor = parseFloat(margin) > 0 ? 'var(--good)' : parseFloat(margin) < 0 ? 'var(--bad)' : 'var(--muted)';
    const wlColor = rec.w > rec.l ? 'var(--good)' : rec.w < rec.l ? 'var(--bad)' : 'var(--warn)';
    const escapedOpp = (opp || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

    html += `<div class="thH2HRow">
      <span class="thH2HOpp">
        ${opp}
        <button class="secondary thOppBtn" onclick="thLoadOpponent('${escapedOpp}')" style="margin-left:6px" title="Load as opponent">⚔</button>
      </span>
      <span style="color:var(--good);font-weight:700">${rec.w}</span>
      <span style="color:var(--bad);font-weight:700">${rec.l}</span>
      <span>${avg(rec.ourPts)}</span>
      <span>${avg(rec.theirPts)}</span>
      <span style="color:${marginColor};font-weight:700">${parseFloat(margin)>0?'+':''}${margin}</span>
    </div>`;
  });

  html += '</div>';
  thH2HEl.innerHTML = html;
}

// ── thRenderDNA — court heatmap + scoring profile + four factors + insights ────
function thRenderDNA(teamData, statsData, shootingData) {
  const el = document.getElementById('thDNA');
  if (!el) return;
  if (!statsData && !shootingData) {
    el.innerHTML = '<div class="muted" style="padding:24px;text-align:center">No team stats available for this team/season.</div>';
    return;
  }
  const s  = statsData;
  const ts = s ? s.teamStats    : null;
  const os = s ? s.opponentStats : null;
  const g  = (s && s.games) || 1;

  function pctOf(part, total) {
    const p = Number(part), t = Number(total);
    return (Number.isFinite(p) && Number.isFinite(t) && t > 0) ? Math.round(p / t * 100) : null;
  }
  const ppg       = ts ? +(ts.points.total / g).toFixed(1) : null;
  const oppg      = os ? +(os.points.total / g).toFixed(1) : null;
  const paintPct  = ts ? pctOf(ts.points && ts.points.inPaint, ts.points && ts.points.total) : null;
  let fbPct       = ts ? pctOf(ts.points && ts.points.fastBreak, ts.points && ts.points.total) : null;
  let topPct      = ts ? pctOf(ts.points && ts.points.offTurnovers, ts.points && ts.points.total) : null;
  const threeTend = ts ? pctOf(ts.threePointFieldGoals && ts.threePointFieldGoals.attempted, ts.fieldGoals && ts.fieldGoals.attempted) : null;
  const astRate   = ts ? pctOf(ts.assists, ts.fieldGoals && ts.fieldGoals.made) : null;
  const pace      = s  ? s.pace : null;

  // WBB fallback: estimate paint share from derived shooting zones when ESPN paint points are unavailable/zero.
  let paintPctResolved = paintPct;
  if (typeof league !== 'undefined' && league === 'WBB' && ts && ts.points && Number(ts.points.total) > 0 && shootingData) {
    if (paintPctResolved == null || paintPctResolved === 0) {
      const rimMade = Number((shootingData.dunks && shootingData.dunks.made) || 0)
        + Number((shootingData.tipIns && shootingData.tipIns.made) || 0)
        + Number((shootingData.layups && shootingData.layups.made) || 0);
      paintPctResolved = pctOf(rimMade * 2, ts.points.total);
    }
    // ESPN WBB often omits these; suppress misleading 0% when source is effectively missing.
    if (fbPct === 0) fbPct = null;
    if (topPct === 0) topPct = null;
  }

  const ff  = ts ? ts.fourFactors : null;
  const ofs = os ? os.fourFactors : null;
  const offEfg  = ff  ? ff.effectiveFieldGoalPct          : null;
  const offTov  = ff  ? Math.round(ff.turnoverRatio * 100) : null;
  const offOreb = ff  ? ff.offensiveReboundPct             : null;
  const offFtr  = ff  ? ff.freeThrowRate                   : null;
  const defFallback = shootingData && shootingData.defenseFourFactors ? shootingData.defenseFourFactors : null;
  const defEfg  = ofs ? ofs.effectiveFieldGoalPct           : (defFallback ? defFallback.effectiveFieldGoalPct : null);
  const defTov  = ofs ? Math.round(ofs.turnoverRatio * 100) : (defFallback && Number.isFinite(defFallback.turnoverRatio) ? Math.round(defFallback.turnoverRatio * 100) : null);
  const defOreb = ofs ? ofs.offensiveReboundPct             : (defFallback ? defFallback.offensiveReboundPct : null);
  const defFtr  = ofs ? ofs.freeThrowRate                   : (defFallback ? defFallback.freeThrowRate : null);

  // Auto-generate insights from the numbers
  const insights = [];
  if (offEfg != null) {
    if (offEfg >= 56) insights.push({ type: 'strength', text: `Elite shooting — eFG% of ${offEfg}% is well above the national avg (~50%). Creating high-quality looks consistently.` });
    else if (offEfg >= 52) insights.push({ type: 'strength', text: `Good shooting efficiency — eFG% of ${offEfg}% is above the national average.` });
    else if (offEfg <= 46) insights.push({ type: 'weakness', text: `Shooting struggles — eFG% of ${offEfg}% is below average. Needs better shot quality or improved shooting.` });
  }
  if (defEfg != null) {
    if (defEfg <= 44) insights.push({ type: 'strength', text: `Elite perimeter defense — holding opponents to just ${defEfg}% eFG. Significantly disrupts opponent offense.` });
    else if (defEfg <= 48) insights.push({ type: 'strength', text: `Good defensive shooting suppression — opponents at ${defEfg}% eFG.` });
    else if (defEfg >= 54) insights.push({ type: 'weakness', text: `Defensive concern — opponents shoot ${defEfg}% eFG. Giving up too many quality looks.` });
  }
  if (offTov != null) {
    if (offTov <= 13) insights.push({ type: 'strength', text: `Exceptional ball security — only ${offTov}% turnover rate. Rarely gives opponents easy transition buckets.` });
    else if (offTov >= 20) insights.push({ type: 'weakness', text: `Turnover issue — ${offTov}% TO rate hurts offensive possessions and creates transition opportunities for opponents.` });
  }
  if (defTov != null) {
    if (defTov >= 22) insights.push({ type: 'strength', text: `Disruptive defense — forcing ${defTov}% opponent turnover rate. Creates easy transition opportunities.` });
    else if (defTov <= 14) insights.push({ type: 'weakness', text: `Lacks defensive pressure — only forcing ${defTov}% opponent TO rate. Opponents handle the ball too freely.` });
  }
  if (offOreb != null) {
    if (offOreb >= 32) insights.push({ type: 'strength', text: `Dominant on the offensive glass — ${offOreb}% OReb rate means lots of extra possessions.` });
    else if (offOreb <= 22) insights.push({ type: 'weakness', text: `Weak offensive rebounding — only ${offOreb}% OReb rate. Rarely converts misses into second chances.` });
  }
  if (defOreb != null) {
    if (defOreb <= 24) insights.push({ type: 'strength', text: `Excellent defensive rebounding — holding opponents to ${defOreb}% OReb rate. Boxes out well.` });
    else if (defOreb >= 35) insights.push({ type: 'weakness', text: `Gets out-rebounded — opponents grab ${defOreb}% of their own misses, generating second-chance points.` });
  }
  if (paintPctResolved != null) {
    if (paintPctResolved >= 48) insights.push({ type: 'style', text: `Inside-out attack — ${paintPctResolved}% of points in the paint. Forces opponents to commit to interior defense.` });
    else if (paintPctResolved <= 34) insights.push({ type: 'style', text: `Perimeter-oriented offense — only ${paintPctResolved}% of points come from the paint. Very jump-shot dependent.` });
  }
  if (threeTend != null) {
    if (threeTend >= 48) insights.push({ type: 'style', text: `Heavy three-point volume — ${threeTend}% of FGA are 3s. Live-or-die by the three style.` });
    else if (threeTend <= 26) insights.push({ type: 'style', text: `Post and mid-range focus — only ${threeTend}% of shots are 3-pointers.` });
  }
  if (fbPct != null && fbPct >= 15) insights.push({ type: 'style', text: `Transition threat — ${fbPct}% of points come in transition. Loves to push pace and score in the open court.` });
  if (pace != null) {
    if (pace >= 72) insights.push({ type: 'style', text: `Up-tempo identity — ${pace} possessions/game. Creates havoc through volume and pace.` });
    else if (pace <= 63) insights.push({ type: 'style', text: `Deliberate half-court team — only ${pace} possessions/game. Controls tempo and grinds out wins.` });
  }

  // Four factors rows: label | our offense val | what opp does vs us (defense)
  function ffRow(label, offVal, defVal, offIsGood, defIsGood, offTip, defTip) {
    const fmtV = v => v != null ? (+v).toFixed(1) + '%' : '—';
    const oc = offIsGood == null ? 'var(--muted)' : offIsGood ? 'var(--good)' : 'var(--bad)';
    const dc = defIsGood == null ? 'var(--muted)' : defIsGood ? 'var(--good)' : 'var(--bad)';
    return `<div class="thFFRow">
      <div class="thFFVal" style="color:${oc}" title="${offTip||''}">${fmtV(offVal)}</div>
      <div class="thFFLabel">${label}</div>
      <div class="thFFVal thFFVal--def" style="color:${dc}" title="${defTip||''}">${fmtV(defVal)}</div>
    </div>`;
  }
  function grade(v, goodThresh, badThresh) {
    if (v == null) return null;
    if (v >= goodThresh) return true;
    if (v <= badThresh)  return false;
    return null;
  }

  const ff4Html = ts ? `
    <div class="thFFCard">
      <div class="thFFHead">
        <div class="thFFHeadCol"><div class="thFFHeadTitle" style="color:var(--accent)">Our Offense</div><div class="thFFHeadSub">what we do</div></div>
        <div class="thFFTitle">Four Factors</div>
        <div class="thFFHeadCol"><div class="thFFHeadTitle" style="color:var(--muted)">Defense</div><div class="thFFHeadSub">what opp does vs us</div></div>
      </div>
      <div class="thFFBody">
        ${ffRow('Eff. FG%',  offEfg,  defEfg,  grade(offEfg,54,46),                       defEfg!=null?(defEfg<=48?true:defEfg>=54?false:null):null, 'Our shooting efficiency (higher=better)', 'Opp eFG% against us (lower=better defense)')}
        ${ffRow('TO Rate',   offTov,  defTov,  offTov!=null?(offTov<=15?true:offTov>=21?false:null):null, defTov!=null?(defTov>=21?true:defTov<=14?false:null):null, 'Our turnover rate (lower=better)', 'Opp TO rate we force (higher=better)')}
        ${ffRow('Off. Reb%', offOreb, defOreb, grade(offOreb,30,22),                       defOreb!=null?(defOreb<=26?true:defOreb>=35?false:null):null, 'Our offensive rebound rate (higher=better)', 'Opp OReb% we allow (lower=better)')}
        ${ffRow('FT Rate',   offFtr,  defFtr,  grade(offFtr,35,22),                        defFtr!=null?(defFtr<=20?true:defFtr>=35?false:null):null,   'Our FT attempt rate (higher=better)', 'Opp FT rate we give up (lower=better)')}
      </div>
      <div class="thFFNote">eFG% = (FGM + 0.5×3PM) / FGA &nbsp;|&nbsp; TO Rate = TO / Poss &nbsp;|&nbsp; FT Rate = FTA / FGA</div>
    </div>` : '';

  const profHtml = [
    ppg       != null ? `<div class="thProfRow"><span class="thProfLabel">Points / game</span><span class="thProfVal">${ppg}</span></div>` : '',
    oppg      != null ? `<div class="thProfRow"><span class="thProfLabel">Opp Pts / game</span><span class="thProfVal">${oppg}</span></div>` : '',
    pace      != null ? `<div class="thProfRow"><span class="thProfLabel" title="Estimated possessions per 40 min game">Pace</span><span class="thProfVal">${pace} poss/g</span></div>` : '',
    paintPctResolved  != null ? `<div class="thProfRow"><span class="thProfLabel">Paint scoring</span><span class="thProfVal">${paintPctResolved}% of pts</span></div>` : '',
    fbPct     != null ? `<div class="thProfRow"><span class="thProfLabel">Fast break pts</span><span class="thProfVal">${fbPct}% of pts</span></div>` : '',
    topPct    != null ? `<div class="thProfRow"><span class="thProfLabel">Pts off TOs</span><span class="thProfVal">${topPct}% of pts</span></div>` : '',
    threeTend != null ? `<div class="thProfRow"><span class="thProfLabel" title="3-point attempts as % of all FGA">3PT tendency</span><span class="thProfVal">${threeTend}% of FGA</span></div>` : '',
    astRate   != null ? `<div class="thProfRow"><span class="thProfLabel" title="Assists per made field goal">Assist rate</span><span class="thProfVal">${astRate}% of FGM</span></div>` : '',
    ts && ts.trueShooting != null ? `<div class="thProfRow"><span class="thProfLabel" title="Points per shot attempt including FTs. Best overall shooting efficiency measure.">True Shooting%</span><span class="thProfVal">${ts.trueShooting}%</span></div>` : '',
  ].filter(Boolean).join('');

  const insightsHtml = insights.length
    ? insights.map(i => `<div class="thInsight thInsight--${i.type}"><span class="thInsIcon">${i.type==='strength'?'✅':i.type==='weakness'?'⚠️':'💡'}</span><span>${i.text}</span></div>`).join('')
    : '<div class="muted" style="padding:8px 0">Load team to generate analysis.</div>';

  const heatmapHtml = shootingData
    ? _buildCourtHeatmap(shootingData)
    : '<div class="muted" style="padding:24px;text-align:center;font-size:12px">Shooting zone data unavailable</div>';

  el.innerHTML = `
    <div class="thDNAGrid">
      <div class="thDNALeft">
        <div class="thDNASectionLabel">🏀 Team Shooting Zones</div>
        ${heatmapHtml}
      </div>
      <div class="thDNARight">
        <div class="thDNASectionLabel">📊 Scoring Profile</div>
        <div class="thProfCard">${profHtml || '<div class="muted">Stats unavailable</div>'}</div>
        <div style="height:16px"></div>
        ${ff4Html}
      </div>
    </div>
    <div class="thDNAInsights">
      <div class="thDNASectionLabel">🔍 Strengths &amp; Weaknesses Analysis</div>
      <div class="thInsightsGrid">${insightsHtml}</div>
    </div>`;
}

// ── thRenderTeamScout — full team scouting report sections ───────────────────
function thRenderTeamScout(teamName, teamData, statsData) {
  const el = document.getElementById('thScout');
  if (!el) return;
  if (!teamData && !statsData) {
    el.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Load a team to generate scouting analysis.</div>';
    return;
  }

  const ts = statsData ? statsData.teamStats : null;
  const os = statsData ? statsData.opponentStats : null;
  const ff = ts ? ts.fourFactors : null;
  const ofs = os ? os.fourFactors : null;
  const g = (statsData && statsData.games) || 1;

  const strengths = [];
  const weaknesses = [];
  const tendencies = [];
  const development = [];
  const matchup = [];

  const adjO = teamData ? +teamData.adjO : null;
  const adjD = teamData ? +teamData.adjD : null;
  const adjEM = teamData ? +teamData.adjEM : null;
  const pace = statsData ? +statsData.pace : null;
  const ppg = ts ? +(ts.points.total / g).toFixed(1) : null;
  const oppg = os ? +(os.points.total / g).toFixed(1) : null;
  const efg = ff ? +ff.effectiveFieldGoalPct : null;
  const defEfg = ofs ? +ofs.effectiveFieldGoalPct : null;
  const tov = ff ? +(ff.turnoverRatio * 100) : null;
  const forceTov = ofs ? +(ofs.turnoverRatio * 100) : null;
  const oreb = ff ? +ff.offensiveReboundPct : null;
  const allowOreb = ofs ? +ofs.offensiveReboundPct : null;
  const ftr = ff ? +ff.freeThrowRate : null;
  const allowFtr = ofs ? +ofs.freeThrowRate : null;
  const threeRate = ts ? +(ts.threePointFieldGoals.attempted / (ts.fieldGoals.attempted || 1) * 100) : null;
  const paintRate = ts ? +(ts.points.inPaint / (ts.points.total || 1) * 100) : null;
  const astRate = ts ? +(ts.assists / (ts.fieldGoals.made || 1) * 100) : null;

  const f1 = (v) => Number.isFinite(v) ? (+v).toFixed(1) : '—';

  if (Number.isFinite(adjEM) && adjEM >= 20) strengths.push(`Top-tier overall efficiency profile (adjEM ${f1(adjEM)}).`);
  if (Number.isFinite(adjO) && adjO >= 112) strengths.push(`High-powered offense (adjO ${f1(adjO)}) consistently creates efficient possessions.`);
  if (Number.isFinite(adjD) && adjD <= 95) strengths.push(`Elite defense (adjD ${f1(adjD)}) suppresses clean looks and limits scoring runs.`);
  if (Number.isFinite(efg) && efg >= 54) strengths.push(`Excellent shot quality and finishing (${f1(efg)}% eFG).`);
  if (Number.isFinite(defEfg) && defEfg <= 48) strengths.push(`Strong shot suppression (opponents only ${f1(defEfg)}% eFG).`);
  if (Number.isFinite(tov) && tov <= 15) strengths.push(`Secure with the ball (${f1(tov)}% offensive TO rate).`);
  if (Number.isFinite(forceTov) && forceTov >= 20) strengths.push(`Creates defensive events by forcing turnovers (${f1(forceTov)}%).`);
  if (Number.isFinite(oreb) && oreb >= 30) strengths.push(`Wins extra possessions on the offensive glass (${f1(oreb)}% OReb).`);

  if (Number.isFinite(adjEM) && adjEM <= 5) weaknesses.push(`Limited margin for error (adjEM ${f1(adjEM)}) — games tend to be volatile.`);
  if (Number.isFinite(adjO) && adjO <= 101) weaknesses.push(`Offense struggles to generate efficient scoring (adjO ${f1(adjO)}).`);
  if (Number.isFinite(adjD) && adjD >= 103) weaknesses.push(`Defensive consistency is a concern (adjD ${f1(adjD)}).`);
  if (Number.isFinite(efg) && efg <= 48) weaknesses.push(`Low shooting efficiency (${f1(efg)}% eFG) caps offensive ceiling.`);
  if (Number.isFinite(defEfg) && defEfg >= 53) weaknesses.push(`Allows too many clean shots (opponents ${f1(defEfg)}% eFG).`);
  if (Number.isFinite(tov) && tov >= 20) weaknesses.push(`Turnover-prone offense (${f1(tov)}%) gives away possessions.`);
  if (Number.isFinite(allowOreb) && allowOreb >= 33) weaknesses.push(`Defensive rebounding leak (allows ${f1(allowOreb)}% OReb).`);
  if (Number.isFinite(allowFtr) && allowFtr >= 33) weaknesses.push(`Foul discipline issues (opponents high FT rate ${f1(allowFtr)}).`);

  if (Number.isFinite(threeRate) && threeRate >= 44) tendencies.push(`Perimeter-heavy shot profile (${f1(threeRate)}% of FGA from 3).`);
  if (Number.isFinite(threeRate) && threeRate <= 27) tendencies.push(`Paint/midrange-driven offense (low 3PA rate ${f1(threeRate)}%).`);
  if (Number.isFinite(paintRate) && paintRate >= 46) tendencies.push(`Strong paint emphasis (${f1(paintRate)}% of points at rim/paint).`);
  if (Number.isFinite(astRate) && astRate >= 58) tendencies.push(`Ball-sharing identity (assist rate ${f1(astRate)}%).`);
  if (Number.isFinite(astRate) && astRate <= 45) tendencies.push(`Creation is more individual than system-based (assist rate ${f1(astRate)}%).`);
  if (Number.isFinite(pace) && pace >= 71) tendencies.push(`Fast-tempo team (${f1(pace)} possessions/game).`);
  if (Number.isFinite(pace) && pace <= 63) tendencies.push(`Deliberate half-court tempo (${f1(pace)} possessions/game).`);

  if (Number.isFinite(efg) && efg >= 49 && efg < 53) development.push(`Raise eFG from good to elite by improving shot selection/spacing in primary actions.`);
  if (Number.isFinite(tov) && tov >= 16 && tov <= 19) development.push(`Tighten ball security late-clock to reduce empty possessions.`);
  if (Number.isFinite(forceTov) && forceTov >= 15 && forceTov < 20) development.push(`Add more point-of-attack pressure to increase forced turnover volume.`);
  if (Number.isFinite(allowOreb) && allowOreb >= 27 && allowOreb < 33) development.push(`Improve gang rebounding and weak-side box-outs to cut second-chance points.`);
  if (Number.isFinite(allowFtr) && allowFtr >= 24 && allowFtr < 33) development.push(`Reduce foul rate via better closeout control and verticality at rim.`);

  if (Number.isFinite(threeRate) && threeRate >= 42) matchup.push(`How to guard them: run shooters off line, top-lock movement sets, force paint finishes over length.`);
  if (Number.isFinite(paintRate) && paintRate >= 44) matchup.push(`How to guard them: build a nail wall, shrink gaps early, force kick-outs to low-efficiency shooters.`);
  if (Number.isFinite(tov) && tov >= 18) matchup.push(`How to attack them: pressure guards and trap side PnR to force live-ball turnovers.`);
  if (Number.isFinite(forceTov) && forceTov >= 20) matchup.push(`How they defend: aggressive hands and passing-lane pressure; secure outlets and simplify first pass.`);
  if (Number.isFinite(defEfg) && defEfg <= 48) matchup.push(`How they defend: disciplined shot contest team; use paint touch + spray to shift help before the shot.`);
  if (Number.isFinite(allowOreb) && allowOreb >= 32) matchup.push(`How to attack them: crash weak side hard — they give up second chances.`);

  function sec(title, icon, arr, cls) {
    if (!arr.length) return '';
    return `<div class="scoutSection">
      <div class="scoutSectionHead">${icon} ${title}</div>
      <div class="scoutItems">${arr.map(t => `<div class="scoutItem ${cls}">${t}</div>`).join('')}</div>
    </div>`;
  }

  const html =
    sec('Strengths', '✅', strengths, 'scoutItem--strength') +
    sec('Weaknesses', '⚠️', weaknesses, 'scoutItem--weakness') +
    sec('Tendencies', '🔄', tendencies, 'scoutItem--tendency') +
    sec('Development Areas', '📈', development, 'scoutItem--dev') +
    sec('Matchup Notes', '🎯', matchup, 'scoutItem--matchup');

  el.innerHTML = html || '<div class="muted" style="padding:18px;text-align:center">Not enough data for full team scouting report.</div>';
}

// ── _thFmtDeepText — section-card markdown → HTML for deep analysis output ────
function _thFmtDeepText(text) {
  function stripInlineBold(t) {
    // Remove leading **...** or **...**: prefix, return {label, rest}
    var m = t.match(/^\*\*(.+?)\*\*[:\-]?\s*(.*)/);
    if (m) return { label: m[1].replace(/:$/, ''), rest: m[2] };
    return null;
  }
  function inlineFmt(t) {
    return t
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }

  // Group lines into sections bounded by ## headers
  const sections = [];
  let current = null;
  for (const rawLine of text.split('\n')) {
    const trimmed = rawLine.trim();
    if (/^## /.test(rawLine)) {
      if (current) sections.push(current);
      current = { head: rawLine.replace(/^## /, '').trim(), items: [] };
    } else if (/^### /.test(rawLine)) {
      if (!current) current = { head: '', items: [] };
      current.items.push({ type: 'subhead', text: rawLine.replace(/^### /, '').trim() });
    } else if (/^\d+[\.\)]\s/.test(rawLine.trimStart())) {
      if (!current) current = { head: '', items: [] };
      const m = rawLine.trimStart().match(/^(\d+)[\.\)]\s+(.*)/);
      if (m) {
        // Check if the numbered item itself has a bold label
        const lb = stripInlineBold(m[2]);
        if (lb && lb.rest) {
          current.items.push({ type: 'labeled', label: lb.label, rest: lb.rest });
        } else {
          current.items.push({ type: 'numbered', num: m[1], text: m[2] });
        }
      }
    } else if (/^[-•*] /.test(rawLine.trimStart())) {
      if (!current) current = { head: '', items: [] };
      const bt = rawLine.trimStart().replace(/^[-•*] /, '');
      const lb = stripInlineBold(bt);
      if (lb && lb.rest) {
        current.items.push({ type: 'labeled', label: lb.label, rest: lb.rest });
      } else {
        current.items.push({ type: 'bullet', text: bt });
      }
    } else if (trimmed !== '') {
      if (!current) current = { head: '', items: [] };
      // Plain text line — check for bold label pattern: **Label:** description
      const lb = stripInlineBold(trimmed);
      if (lb && lb.rest) {
        current.items.push({ type: 'labeled', label: lb.label, rest: lb.rest });
      } else {
        current.items.push({ type: 'text', text: trimmed });
      }
    }
  }
  if (current) sections.push(current);

  if (!sections.length) return '<div class="thDeepLine">' + inlineFmt(text) + '</div>';

  // Icon + accent-color map keyed on partial heading match
  var ICONS = [
    ['overall verdict', '🏆', '#f5c518'],
    ['verdict',         '🏆', '#f5c518'],
    ['strengths',       '✅', '#22c55e'],
    ['strength',        '✅', '#22c55e'],
    ['weaknesses',      '⚠️', '#ef4444'],
    ['weakness',        '⚠️', '#ef4444'],
    ['tendencies',      '🔄', '#a78bfa'],
    ['tendency',        '🔄', '#a78bfa'],
    ['head-to-head',    '⚔️', '#fb923c'],
    ['matchup',         '⚔️', '#fb923c'],
    ['offensive keys',  '🎯', '#2563eb'],
    ['defensive keys',  '🛡️', '#0891b2'],
    ['game plan',       '📋', '#2563eb'],
    ['adjustment',      '🔀', '#8b5cf6'],
    ['in-game',         '🔀', '#8b5cf6'],
    ['confidence',      '📊', '#64748b'],
    ['red flags',       '🚩', '#ef4444'],
    ['development',     '📈', '#22c55e'],
  ];
  function iconAndColor(head) {
    var h = head.toLowerCase();
    for (var i = 0; i < ICONS.length; i++) {
      if (h.indexOf(ICONS[i][0]) !== -1) return { icon: ICONS[i][1], color: ICONS[i][2] };
    }
    return { icon: '▸', color: 'var(--accent)' };
  }

  return sections.map(function(s) {
    var ic = iconAndColor(s.head);
    var headHtml = s.head
      ? '<div class="thDeepSectionHead" style="border-left:3px solid ' + ic.color + '">'
          + '<span class="thDeepSectionIcon">' + ic.icon + '</span>'
          + '<span class="thDeepSectionTitle">' + inlineFmt(s.head) + '</span>'
          + '</div>'
      : '';
    var bodyHtml = s.items.map(function(item) {
      if (item.type === 'subhead')
        return '<div class="thDeepSubHead">' + inlineFmt(item.text) + '</div>';
      if (item.type === 'labeled')
        return '<div class="thDeepLabelItem">'
          + '<div class="thDeepLabelHead">' + inlineFmt(item.label) + '</div>'
          + '<div class="thDeepLabelBody">' + inlineFmt(item.rest) + '</div>'
          + '</div>';
      if (item.type === 'numbered')
        return '<div class="thDeepItem"><span class="thDeepNum">' + item.num + '.</span><span>' + inlineFmt(item.text) + '</span></div>';
      if (item.type === 'bullet')
        return '<div class="thDeepBullet">' + inlineFmt(item.text) + '</div>';
      return '<div class="thDeepLine">' + inlineFmt(item.text) + '</div>';
    }).join('');
    return '<div class="thDeepSection">' + headHtml + '<div class="thDeepSectionBody">' + bodyHtml + '</div></div>';
  }).join('');
}

// ── Monte Carlo simulation engine ────────────────────────────────────────────
var _thLastMonteCarlo = null;

function thRunMonteCarlo(ratA, ratB, statsA, statsB, nSims, opts) {
  nSims = nSims || 10000;
  opts = opts || {};
  var oA = ratA ? +ratA.adjO : null;
  var dA = ratA ? +ratA.adjD : null;
  var oB = ratB ? +ratB.adjO : null;
  var dB = ratB ? +ratB.adjD : null;
  if (oA == null || dA == null || oB == null || dB == null) return null;

  // Expected efficiency: blend of offense vs opposing defense
  var eOA = (oA + dB) / 2;
  var eOB = (oB + dA) / 2;

  // Pace
  var paceA = (statsA && statsA.pace) ? +statsA.pace : 68;
  var paceB = (statsB && statsB.pace) ? +statsB.pace : 68;
  var gamePace = (paceA + paceB) / 2;

  // Per-team game-to-game scoring SD (default ~11 pts)
  var sdA = opts.sdA != null ? +opts.sdA : 11;
  var sdB = opts.sdB != null ? +opts.sdB : 11;
  // Correlation between team scoring deviations (0 = independent, 0..1)
  var rho = opts.rho != null ? Math.max(0, Math.min(1, +opts.rho)) : 0;
  // Overtime modeling
  var enableOT = opts.enableOT !== false;
  var maxOTPeriods = opts.maxOTPeriods != null ? Math.max(1, Math.min(6, +opts.maxOTPeriods)) : 3;

  function randn() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  var aWins = 0, bWins = 0, ties = 0, totalMarginA = 0;
  var regTies = 0, otGames = 0, otAWins = 0, otBWins = 0;
  var margins = [], scoresA = [], scoresB = [];
  var buckets = {};

  // Cholesky decomposition for correlated normals:
  // zA = u; zB = rho*u + sqrt(1-rho^2)*v
  var rhoFactor = Math.sqrt(Math.max(0, 1 - rho * rho));

  // OT setup (5-minute period approximation)
  var otPace = Math.max(5, Math.min(12, gamePace * 0.125));
  var otExpA = (eOA / 100) * otPace;
  var otExpB = (eOB / 100) * otPace;
  var otSdA = opts.otSdA != null ? +opts.otSdA : Math.max(2.5, Math.min(6.5, sdA * Math.sqrt(5 / 40)));
  var otSdB = opts.otSdB != null ? +opts.otSdB : Math.max(2.5, Math.min(6.5, sdB * Math.sqrt(5 / 40)));

  function resolveOvertime(rA0, rB0) {
    var rA = rA0, rB = rB0;
    var periods = 0;
    while (rA === rB && periods < maxOTPeriods) {
      var ou = randn(), ov = randn();
      var otNoiseA = ou * otSdA;
      var otNoiseB = (rho * ou + rhoFactor * ov) * otSdB;
      var addA = Math.max(0, Math.round(otExpA + otNoiseA));
      var addB = Math.max(0, Math.round(otExpB + otNoiseB));
      rA += addA;
      rB += addB;
      periods++;
    }
    if (rA === rB) {
      // Very rare fallback to avoid unresolved ties in simulation output
      var edge = (otExpA - otExpB) / 1.5;
      var pA = 1 / (1 + Math.exp(-edge));
      if (Math.random() < pA) rA += 1;
      else rB += 1;
    }
    return { rA: rA, rB: rB, periods: periods };
  }

  for (var i = 0; i < nSims; i++) {
    var u = randn(), v = randn();
    var noiseA = u * sdA;
    var noiseB = (rho * u + rhoFactor * v) * sdB;
    var ptsA = (eOA / 100) * gamePace + noiseA;
    var ptsB = (eOB / 100) * gamePace + noiseB;
    var rA = Math.round(ptsA), rB = Math.round(ptsB);

    if (enableOT && rA === rB) {
      regTies++;
      otGames++;
      var ot = resolveOvertime(rA, rB);
      rA = ot.rA;
      rB = ot.rB;
      if (rA > rB) otAWins++;
      else if (rB > rA) otBWins++;
    }

    scoresA.push(rA); scoresB.push(rB);
    var margin = rA - rB;
    margins.push(margin);
    totalMarginA += margin;
    if (rA > rB) aWins++; else if (rB > rA) bWins++; else ties++;
    var bk = Math.round(margin / 3) * 3;
    buckets[bk] = (buckets[bk] || 0) + 1;
  }

  margins.sort(function(a, b) { return a - b; });
  var mean = totalMarginA / nSims;
  var variance = margins.reduce(function(s, m) { return s + (m - mean) * (m - mean); }, 0) / nSims;
  var sd = Math.sqrt(variance);
  var median = margins[Math.floor(nSims / 2)];
  var p10 = margins[Math.floor(nSims * 0.10)];
  var p90 = margins[Math.floor(nSims * 0.90)];

  // Per-team score SDs
  var sumA = 0, sumB = 0;
  for (var j = 0; j < nSims; j++) { sumA += scoresA[j]; sumB += scoresB[j]; }
  var meanA = sumA / nSims, meanB = sumB / nSims;
  var varA = 0, varB = 0;
  for (var j2 = 0; j2 < nSims; j2++) { varA += (scoresA[j2] - meanA) * (scoresA[j2] - meanA); varB += (scoresB[j2] - meanB) * (scoresB[j2] - meanB); }
  var teamSdA = Math.sqrt(varA / nSims);
  var teamSdB = Math.sqrt(varB / nSims);

  scoresA.sort(function(a, b) { return a - b; });
  scoresB.sort(function(a, b) { return a - b; });
  var avgA = +meanA.toFixed(1);
  var avgB = +meanB.toFixed(1);

  var blowoutA = margins.filter(function(m) { return m >= 10; }).length;
  var blowoutB = margins.filter(function(m) { return m <= -10; }).length;
  var closeGames = margins.filter(function(m) { return Math.abs(m) <= 5; }).length;

  var result = {
    nSims: nSims,
    aWinPct: +(aWins / nSims * 100).toFixed(1),
    bWinPct: +(bWins / nSims * 100).toFixed(1),
    tiePct: +(ties / nSims * 100).toFixed(1),
    regulationTiePct: +(regTies / nSims * 100).toFixed(1),
    otRate: +(otGames / nSims * 100).toFixed(1),
    aWinInOTPct: +(otGames ? (otAWins / otGames * 100) : 0).toFixed(1),
    bWinInOTPct: +(otGames ? (otBWins / otGames * 100) : 0).toFixed(1),
    aWins: aWins, bWins: bWins, ties: ties,
    regulationTies: regTies, otGames: otGames,
    avgMargin: +mean.toFixed(1),
    medianMargin: median,
    stdDev: +sd.toFixed(1),
    teamSdA: +teamSdA.toFixed(1),
    teamSdB: +teamSdB.toFixed(1),
    p10: p10, p90: p90,
    avgScoreA: avgA, avgScoreB: avgB,
    blowoutAPct: +(blowoutA / nSims * 100).toFixed(1),
    blowoutBPct: +(blowoutB / nSims * 100).toFixed(1),
    closeGamePct: +(closeGames / nSims * 100).toFixed(1),
    buckets: buckets,
    // Store params used
    _sdA: sdA, _sdB: sdB, _rho: rho, _pace: gamePace,
    _enableOT: enableOT, _otPace: otPace, _otSdA: otSdA, _otSdB: otSdB, _maxOTPeriods: maxOTPeriods,
  };
  _thLastMonteCarlo = result;
  return result;
}

function _thEstimateOppPpgFromGames(teamName, season) {
  try {
    const key = (String(teamName || '') + ':' + String(season || thCurrentSeason || '2026')).toLowerCase();
    const gd = (typeof teamGamesCache !== 'undefined') ? teamGamesCache[key] : null;
    const games = gd && gd.games ? gd.games : [];
    if (!games.length) return null;
    const tn = String(teamName || '').toLowerCase();
    let sum = 0, n = 0;
    games.forEach(g => {
      const hn = String(g.homeTeam || '').toLowerCase();
      const an = String(g.awayTeam || '').toLowerCase();
      const hp = Number(g.homePoints), ap = Number(g.awayPoints);
      if (!Number.isFinite(hp) || !Number.isFinite(ap)) return;
      if (hn === tn) { sum += ap; n++; }
      else if (an === tn) { sum += hp; n++; }
    });
    return n ? (sum / n) : null;
  } catch (_) { return null; }
}

function _thFallbackRating(teamName, ratingObj, statsObj, season) {
  if (ratingObj && Number.isFinite(+ratingObj.adjO) && Number.isFinite(+ratingObj.adjD)) return ratingObj;
  if (!statsObj || !statsObj.teamStats || !statsObj.teamStats.points) return null;

  const g = Number(statsObj.games) || 1;
  const pace = Number(statsObj.pace) || 68;
  const ppg = Number(statsObj.teamStats.points.total) / g;
  let oppg = null;
  if (statsObj.opponentStats && statsObj.opponentStats.points && Number.isFinite(Number(statsObj.opponentStats.points.total))) {
    oppg = Number(statsObj.opponentStats.points.total) / g;
  }
  if (!Number.isFinite(oppg)) oppg = _thEstimateOppPpgFromGames(teamName, season);
  if (!Number.isFinite(oppg)) oppg = ppg; // neutral fallback when opponent scoring is unavailable

  const adjO = +(ppg / Math.max(1, pace) * 100).toFixed(1);
  const adjD = +(oppg / Math.max(1, pace) * 100).toFixed(1);
  return {
    team: teamName,
    adjO: adjO,
    adjD: adjD,
    adjEM: +(adjO - adjD).toFixed(1),
    _derived: true,
  };
}

// ── MC Sensitivity Analysis — how win% shifts with parameter tweaks ──────────
function _thRunMCSensitivity(ratA, ratB, statsA, statsB, baseOpts) {
  var quickN = 5000; // fewer sims for sensitivity (speed)
  var savedMC = _thLastMonteCarlo; // preserve main result
  var base = thRunMonteCarlo(ratA, ratB, statsA, statsB, quickN, baseOpts);
  if (!base) { _thLastMonteCarlo = savedMC; return null; }
  var rows = [];
  // SD +/- 3
  var sdUp = thRunMonteCarlo(ratA, ratB, statsA, statsB, quickN, {sdA: (baseOpts.sdA||11)+3, sdB: (baseOpts.sdB||11)+3, rho: baseOpts.rho||0});
  var sdDn = thRunMonteCarlo(ratA, ratB, statsA, statsB, quickN, {sdA: Math.max(5,(baseOpts.sdA||11)-3), sdB: Math.max(5,(baseOpts.sdB||11)-3), rho: baseOpts.rho||0});
  if (sdUp) rows.push({label:'Volatility +3', aWin: sdUp.aWinPct, bWin: sdUp.bWinPct, margin: sdUp.avgMargin, close: sdUp.closeGamePct});
  if (sdDn) rows.push({label:'Volatility −3', aWin: sdDn.aWinPct, bWin: sdDn.bWinPct, margin: sdDn.avgMargin, close: sdDn.closeGamePct});
  // Correlation tweak
  var rhoUp = thRunMonteCarlo(ratA, ratB, statsA, statsB, quickN, {sdA: baseOpts.sdA||11, sdB: baseOpts.sdB||11, rho: Math.min(1,(baseOpts.rho||0)+0.3)});
  if (rhoUp) rows.push({label:'Corr +0.3', aWin: rhoUp.aWinPct, bWin: rhoUp.bWinPct, margin: rhoUp.avgMargin, close: rhoUp.closeGamePct});
  // Pace tweak - we adjust via fake stats objects
  var fastStats = function(s, delta) { return s ? Object.assign({}, s, {pace: (+s.pace||68) + delta}) : {pace: 68+delta}; };
  var fast = thRunMonteCarlo(ratA, ratB, fastStats(statsA,4), fastStats(statsB,4), quickN, baseOpts);
  var slow = thRunMonteCarlo(ratA, ratB, fastStats(statsA,-4), fastStats(statsB,-4), quickN, baseOpts);
  if (fast) rows.push({label:'Pace +4', aWin: fast.aWinPct, bWin: fast.bWinPct, margin: fast.avgMargin, close: fast.closeGamePct});
  if (slow) rows.push({label:'Pace −4', aWin: slow.aWinPct, bWin: slow.bWinPct, margin: slow.avgMargin, close: slow.closeGamePct});
  _thLastMonteCarlo = savedMC; // restore main result
  return {base: base, rows: rows};
}

// ── thRunMonteCarloUI — standalone Monte Carlo runner (separate from Deep Analysis) ──
function thRunMonteCarloUI() {
  if (!thCurrentTeam || !thCurrentCompareTeam) {
    if (typeof showWarn === 'function') showWarn('Load a team and compare opponent first.');
    return;
  }
  var output = document.getElementById('thMonteCarloOutput');
  var btn = document.getElementById('thMonteCarloBtn');
  if (!output) return;

  var aName = thCurrentTeam;
  var bName = thCurrentCompareTeam;
  var ratA = _thFallbackRating(aName, teamRatings[(aName || '').toLowerCase()] || null, _thCurrentStats, thCurrentSeason);
  var ratB = _thFallbackRating(bName, teamRatings[(bName || '').toLowerCase()] || null, _thCompareStats, thCurrentSeason);

  var runCountEl = document.getElementById('thMCRunCount');
  var nSims = runCountEl ? parseInt(runCountEl.value, 10) || 10000 : 10000;

  // Read advanced MC parameters from UI controls
  var sdAEl = document.getElementById('thMCSdA');
  var sdBEl = document.getElementById('thMCSdB');
  var rhoEl = document.getElementById('thMCRho');
  var mcOpts = {
    sdA: sdAEl ? parseFloat(sdAEl.value) || 11 : 11,
    sdB: sdBEl ? parseFloat(sdBEl.value) || 11 : 11,
    rho: rhoEl ? parseFloat(rhoEl.value) || 0 : 0,
  };

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Simulating…'; }
  output.style.display = 'block';
  output.innerHTML = '<div class="thDeepLoading"><span class="thDeepSpinner"></span> Running ' + nSims.toLocaleString() + ' simulations…</div>';

  // Use setTimeout to let the UI update before running CPU-heavy sim
  setTimeout(function() {
    var mc = thRunMonteCarlo(ratA, ratB, _thCurrentStats, _thCompareStats, nSims, mcOpts);
    // Run sensitivity analysis
    var sens = _thRunMCSensitivity(ratA, ratB, _thCurrentStats, _thCompareStats, mcOpts);
    output.innerHTML =
      '<div class="thDeepHeader" style="background:rgba(124,58,237,.15)">' +
        '<span class="thDeepIcon">🎲</span>' +
        '<strong>Monte Carlo Simulation — ' + aName + ' vs ' + bName + '</strong>' +
        '<div style="margin-left:auto;display:flex;gap:6px;align-items:center">' +
          '<button class="thDeepClose" onclick="document.getElementById(\'thMonteCarloOutput\').style.display=\'none\'">&times;</button>' +
        '</div>' +
      '</div>' +
      '<div class="thDeepBody">' + _thRenderMonteCarloHTML(mc, aName, bName, sens) + '</div>';
    if (btn) { btn.disabled = false; btn.textContent = '🎲 Run Simulation'; }
  }, 30);
}

// ── MC Section Builders ─────────────────────────────────────────────────────
function _thBuildMCSummary(mc, aName, bName) {
  var fav = mc.aWinPct >= mc.bWinPct ? aName : bName;
  var dog = mc.aWinPct >= mc.bWinPct ? bName : aName;
  var favPct = Math.max(mc.aWinPct, mc.bWinPct);
  var dogPct = Math.min(mc.aWinPct, mc.bWinPct);
  var spread = Math.abs(mc.avgMargin);
  var verdict = '';
  if (favPct >= 75) verdict = fav + ' is a <strong>heavy favorite</strong> — ' + dog + ' needs an exceptional game or key matchup advantage to pull the upset.';
  else if (favPct >= 60) verdict = fav + ' is <strong>favored</strong>, but ' + dog + ' has a realistic path to the upset (' + dogPct + '% win probability).';
  else verdict = 'This is a <strong>toss-up game</strong>. Execution, game plan, and adjustments will likely decide the outcome.';

  var closeNote = '';
  if (mc.closeGamePct >= 40) closeNote = '<br>⏱ <strong>High close-game probability (' + mc.closeGamePct + '%)</strong> — late-game execution and free-throw shooting will be critical.';
  else if (mc.closeGamePct >= 25) closeNote = '<br>⏱ Moderate chance of a close finish (' + mc.closeGamePct + '%) — prepare end-of-game sets.';
  if (mc.otRate >= 3) closeNote += '<br>🕐 <strong>Overtime probability: ' + mc.otRate + '%</strong> — prep late-game foul/ATO packages and OT rotation plans.';

  return '<div class="thMCSummary">' +
    '<div class="thMCSummaryIcon">📋</div>' +
    '<div class="thMCSummaryText">' +
      '<div class="thMCSummaryTitle">Executive Summary</div>' +
      '<p>' + verdict + closeNote + '</p>' +
      '<p style="margin-top:6px;font-size:10.5px;color:var(--muted)">Projected spread: <strong style="color:var(--fg)">' + (mc.avgMargin > 0 ? aName : bName) + ' by ' + spread + '</strong> · 80% of outcomes fall within a ' + Math.abs(mc.p90 - mc.p10) + '-point window.</p>' +
    '</div>' +
  '</div>';
}

function _thBuildMCMatchups(aName, bName) {
  if (typeof tbGetAllPlayers !== 'function') return '';
  var all = tbGetAllPlayers(typeof league !== 'undefined' ? league : 'MBB');
  var aPlayers = all.filter(function(p) { return (p.Team || '').toLowerCase() === (aName || '').toLowerCase(); });
  var bPlayers = all.filter(function(p) { return (p.Team || '').toLowerCase() === (bName || '').toLowerCase(); });
  if (!aPlayers.length || !bPlayers.length) return '';

  function topN(arr, stat, n) {
    return arr.slice().sort(function(a, b) { return (safeNum(b[stat]) || 0) - (safeNum(a[stat]) || 0); }).slice(0, n);
  }
  function posLabel(r) {
    var p = (r.Position || r.Pos || '').toString();
    return p || (typeof tbPosGroup === 'function' && tbPosGroup(r) === 'guard' ? 'G' : 'F/C');
  }
  function pctlBadge(r, stat) {
    if (typeof statPercentile !== 'function') return '';
    var v = safeNum(r[stat]); if (v === null) return '';
    var p = statPercentile(stat, v);
    if (!Number.isFinite(p)) return '';
    var pct = Math.round(p * 100);
    var clr = pct >= 80 ? 'var(--good)' : pct >= 55 ? 'var(--accent)' : pct >= 35 ? 'var(--warn)' : 'var(--bad)';
    return '<span class="thMCMPctl" style="color:' + clr + '">' + pct + 'th</span>';
  }

  // Top scorers, playmakers, defenders
  var aScorers = topN(aPlayers, 'PPG', 3);
  var bScorers = topN(bPlayers, 'PPG', 3);

  function playerRow(r, side) {
    var clr = side === 'a' ? 'var(--accent)' : 'var(--warn)';
    var ppg = safeNum(r['PPG']); ppg = ppg != null ? ppg.toFixed(1) : '—';
    var efg = safeNum(r['eFG%']); efg = efg != null ? (efg > 1 ? efg.toFixed(1) : (efg * 100).toFixed(1)) : '—';
    var rpg = safeNum(r['RPG']); rpg = rpg != null ? rpg.toFixed(1) : '—';
    var apg = safeNum(r['APG']); apg = apg != null ? apg.toFixed(1) : '—';
    return '<div class="thMCMRow">' +
      '<div class="thMCMName" style="color:' + clr + '">' + (r.Player || r.Name || '—') + ' <span class="thMCMPos">' + posLabel(r) + '</span></div>' +
      '<div class="thMCMStats">' +
        '<span>' + ppg + ' ppg ' + pctlBadge(r, 'PPG') + '</span>' +
        '<span>' + efg + ' eFG% ' + pctlBadge(r, 'eFG%') + '</span>' +
        '<span>' + rpg + ' rpg</span>' +
        '<span>' + apg + ' apg</span>' +
      '</div>' +
    '</div>';
  }

  var maxRows = Math.max(aScorers.length, bScorers.length);
  var matchupRows = '';
  for (var i = 0; i < maxRows; i++) {
    matchupRows += '<div class="thMCMPair">';
    matchupRows += (i < aScorers.length) ? playerRow(aScorers[i], 'a') : '<div class="thMCMRow"></div>';
    matchupRows += '<div class="thMCMVs">vs</div>';
    matchupRows += (i < bScorers.length) ? playerRow(bScorers[i], 'b') : '<div class="thMCMRow"></div>';
    matchupRows += '</div>';
  }

  return '<div class="thMCSection">' +
    '<div class="thMCSectionHead">👤 Key Player Matchups</div>' +
    '<div class="thMCMHeader"><span style="color:var(--accent)">' + aName + '</span><span style="color:var(--warn)">' + bName + '</span></div>' +
    matchupRows +
  '</div>';
}

function _thBuildMCGamePlan(mc, aName, bName, ratA, ratB) {
  var items = [];
  var fav = mc.aWinPct >= mc.bWinPct ? 'a' : 'b';
  var favName = fav === 'a' ? aName : bName;
  var dogName = fav === 'a' ? bName : aName;
  var favPct = Math.max(mc.aWinPct, mc.bWinPct);

  // Tempo recommendation
  var paceA = (_thCurrentStats && _thCurrentStats.pace) ? +_thCurrentStats.pace : null;
  var paceB = (_thCompareStats && _thCompareStats.pace) ? +_thCompareStats.pace : null;
  if (paceA && paceB) {
    if (fav === 'a' && paceA > paceB + 3) items.push({icon:'🏃', text:'Push the pace — ' + aName + ' plays faster (' + paceA.toFixed(0) + ' vs ' + paceB.toFixed(0) + '). More possessions favor the better team.'});
    else if (fav === 'b' && paceA < paceB - 3) items.push({icon:'🐢', text:'Slow it down — ' + aName + ' should limit possessions. ' + bName + ' wants to run (' + paceB.toFixed(0) + ' pace).'});
    else if (fav === 'a' && paceA < paceB - 3) items.push({icon:'🏃', text:aName + ' is favored but plays slower. Consider pushing tempo to create more opportunities.'});
    else items.push({icon:'⚖️', text:'Pace is similar (' + paceA.toFixed(0) + ' vs ' + paceB.toFixed(0) + '). Game will likely be played at a neutral tempo.'});
  }

  // Close game prep
  if (mc.closeGamePct >= 35) {
    items.push({icon:'⏱', text:'High close-game probability (' + mc.closeGamePct + '%). Drill late-game situations: ATO sets, intentional fouls protocol, clock management.'});
  }

  // Efficiency edges
  if (ratA && ratB) {
    var oEdge = (ratA.adjO - ratB.adjO).toFixed(1);
    var dEdge = (ratB.adjD - ratA.adjD).toFixed(1);
    if (Math.abs(+oEdge) >= 4) {
      if (+oEdge > 0) items.push({icon:'🔥', text:aName + ' has a significant offensive efficiency edge (+' + oEdge + ' adjO). Prioritize high-value possessions and avoid live-ball turnovers.'});
      else items.push({icon:'🛡️', text:bName + ' has the offensive edge (' + Math.abs(+oEdge) + ' adjO better). Force tough shots and contest every attempt.'});
    }
    if (Math.abs(+dEdge) >= 4) {
      if (+dEdge > 0) items.push({icon:'🛡️', text:aName + ' has a defensive advantage (' + Math.abs(+dEdge) + ' pts better adjD). Attack their weaker rotations and get to the free-throw line.'});
      else items.push({icon:'⚠️', text:bName + ' defends at an elite level. Move the ball, use screens to create open looks, and be patient on offense.'});
    }
  }

  // Upset blueprint
  if (favPct >= 60 && fav === 'b') {
    items.push({icon:'🎯', text:'Upset path for ' + aName + ': ' + (mc.closeGamePct >= 30 ? 'Keep it close and execute late. ' : '') + 'Force turnovers, crash the boards, and limit transition points.'});
  } else if (favPct >= 60 && fav === 'a') {
    items.push({icon:'🎯', text:dogName + ' upset path: Control pace, force ' + favName + ' into half-court offense, and win the rebounding battle.'});
  }

  // Blowout risk
  var blowA = mc.blowoutAPct, blowB = mc.blowoutBPct;
  if (blowA >= 20 || blowB >= 20) {
    var blower = blowA >= blowB ? aName : bName;
    var blowPct = Math.max(blowA, blowB);
    items.push({icon:'📊', text:blower + ' has a ' + blowPct + '% chance of winning by 10+. The underdog should keep the game within striking distance through halftime.'});
  }

  // Tournament timing / timeout guidance (if available)
  var intel = _thTournamentIntelCtx && _thTournamentIntelCtx[bName];
  if (intel && intel.timeoutGuidance) {
    var tw = (intel.timeoutGuidance.recommendedWhen || [])[0];
    if (tw) {
      items.push({icon:'⏸️', text:'Timeout timing vs ' + bName + ': watch ' + tw.phase + ' (avg segment edge +' + tw.avgEdge + '). ' + tw.note});
    } else if (intel.timeoutGuidance.baselineRule) {
      items.push({icon:'⏸️', text:'Timeout timing vs ' + bName + ': ' + intel.timeoutGuidance.baselineRule});
    }
  }

  // Free throws
  items.push({icon:'🏀', text:'In projected close games, free-throw shooting is decisive. Identify your best FT shooters for late-game possessions.'});

  if (!items.length) return '';

  var html = items.map(function(it) {
    return '<div class="thMCGPItem"><span class="thMCGPIcon">' + it.icon + '</span><span>' + it.text + '</span></div>';
  }).join('');

  return '<div class="thMCSection">' +
    '<div class="thMCSectionHead">🏆 Coaching Game Plan</div>' +
    '<div class="thMCGPBody">' + html + '</div>' +
  '</div>';
}

function _thBuildMCSensitivity(mc, aName, bName, sens) {
  if (!sens || !sens.rows || !sens.rows.length) return '';
  function marginStr(m) {
    if (m > 0) return aName + ' +' + m;
    if (m < 0) return bName + ' +' + Math.abs(m);
    return 'Even';
  }
  var baseWin = mc.aWinPct;
  var thead = '<tr><th>Scenario</th><th>' + aName + ' Win%</th><th>' + bName + ' Win%</th><th>Margin</th><th>Close%</th><th>Δ Win%</th></tr>';
  var tbody = sens.rows.map(function(r) {
    var delta = +(r.aWin - baseWin).toFixed(1);
    var deltaClr = delta > 0 ? 'var(--good)' : delta < 0 ? 'var(--bad)' : 'var(--muted)';
    var deltaStr = (delta > 0 ? '+' : '') + delta + '%';
    return '<tr>' +
      '<td class="mc-sens-label">' + r.label + '</td>' +
      '<td>' + r.aWin + '%</td>' +
      '<td>' + r.bWin + '%</td>' +
      '<td>' + marginStr(r.margin) + '</td>' +
      '<td>' + r.close + '%</td>' +
      '<td style="color:' + deltaClr + ';font-weight:700">' + deltaStr + '</td>' +
    '</tr>';
  }).join('');
  return '<div class="thMCSection">' +
    '<div class="thMCSectionHead">🔬 Sensitivity Analysis</div>' +
    '<div style="padding:4px 12px 6px;font-size:10px;color:var(--muted)">How results shift when key parameters change</div>' +
    '<table class="thMCSensTable"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>' +
  '</div>';
}

function _thBuildMCRecentPBP(aName, bName) {
  const ctx = _thRecentTournamentCtx;
  if (!ctx) return '';

  function teamCard(name, color) {
    const d = ctx[name];
    if (!d) return '';
    const sp = d.shotProfile || {};
    const dt = d.date ? String(d.date).slice(0, 10) : '—';
    const scoreTxt = (d.score && d.score.for != null && d.score.against != null)
      ? (d.score.for + '–' + d.score.against)
      : '—';
    const rimTxt = sp.rim && sp.rim.att ? (sp.rim.pct + '% (' + sp.rim.made + '/' + sp.rim.att + ')') : '—';
    const midTxt = sp.jumper && sp.jumper.att ? (sp.jumper.pct + '% (' + sp.jumper.made + '/' + sp.jumper.att + ')') : '—';
    const threeTxt = sp.three_pointer && sp.three_pointer.att ? (sp.three_pointer.pct + '% (' + sp.three_pointer.made + '/' + sp.three_pointer.att + ')') : '—';
    return '<div class="thMCRecentCard">' +
      '<div class="thMCRecentTeam" style="color:' + color + '">' + name + '</div>' +
      '<div class="thMCRecentMeta">Latest tournament game: ' + dt + ' vs ' + (d.opponent || '—') + '</div>' +
      '<div class="thMCRecentMeta">Score: ' + scoreTxt + (d.gameNotes ? ' · ' + d.gameNotes : '') + '</div>' +
      '<div class="thMCRecentMeta">FG: ' + (sp.fgPct != null ? (sp.fgPct + '%') : '—') + ' · FGA: ' + (sp.fga != null ? sp.fga : '—') + ' · FTA shots: ' + (sp.fta != null ? sp.fta : '—') + '</div>' +
      '<div class="thMCRecentMeta">Rim: ' + rimTxt + ' · Mid: ' + midTxt + ' · 3PT: ' + threeTxt + '</div>' +
    '</div>';
  }

  const aCard = teamCard(aName, 'var(--accent)');
  const bCard = teamCard(bName, 'var(--warn)');
  if (!aCard && !bCard) return '';

  return '<div class="thMCSection">' +
    '<div class="thMCSectionHead">📼 Latest Tournament PBP Snapshot</div>' +
    '<div style="padding:8px 12px;font-size:10px;color:var(--muted)">Used alongside season baselines for prep context.</div>' +
    '<div class="thMCRecentWrap">' + aCard + bCard + '</div>' +
  '</div>';
}

function _thRenderMonteCarloHTML(mc, aName, bName, sens) {
  if (!mc) return '<div class="thMCError">Insufficient data for simulation (need adjusted efficiency ratings for both teams).</div>';

  // Build histogram bars
  var entries = Object.keys(mc.buckets).map(function(k) { return [+k, mc.buckets[k]]; }).sort(function(a, b) { return a[0] - b[0]; });
  var maxCount = Math.max.apply(null, entries.map(function(e) { return e[1]; }));
  var histHtml = '';
  entries.forEach(function(pair) {
    var margin = pair[0], count = pair[1];
    var pct = (count / maxCount * 100).toFixed(0);
    var color = margin > 0 ? 'var(--accent)' : margin < 0 ? 'var(--warn)' : 'var(--muted)';
    histHtml += '<div class="thMCBar">' +
      '<span class="thMCBarLabel">' + (margin > 0 ? '+' : '') + margin + '</span>' +
      '<div class="thMCBarTrack"><div class="thMCBarFill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
    '</div>';
  });

  function marginStr(m) {
    if (m > 0) return aName + ' +' + m;
    if (m < 0) return bName + ' +' + Math.abs(m);
    return 'Even';
  }

  // Parameters used note
  var paramsNote = mc.nSims.toLocaleString() + ' sims · SD: ' + mc._sdA + '/' + mc._sdB + ' pts';
  if (mc._rho > 0) paramsNote += ' · ρ=' + mc._rho.toFixed(2);
  paramsNote += ' · Pace: ' + mc._pace.toFixed(0);
  if (mc._enableOT) paramsNote += ' · OT: ' + mc.otRate + '% (OT SD ' + mc._otSdA.toFixed(1) + '/' + mc._otSdB.toFixed(1) + ', max ' + mc._maxOTPeriods + ')';

  return '<div class="thMCResult">' +
    // ── Win probability ──────────────────────────────────────────────
    '<div class="thMCWinRow">' +
      '<div class="thMCWinCard thMCWinCard--a">' +
        '<div class="thMCWinPct" style="color:var(--accent)">' + mc.aWinPct + '%</div>' +
        '<div class="thMCWinBar"><div class="thMCWinBarFill" style="width:' + mc.aWinPct + '%;background:var(--accent)"></div></div>' +
        '<div class="thMCWinName">' + aName + '</div>' +
      '</div>' +
      '<div class="thMCWinCardSep">' +
        '<div class="thMCWinVs">WIN %</div>' +
        '<div class="thMCScoreProj">' + mc.avgScoreA + ' – ' + mc.avgScoreB + '</div>' +
        '<div class="thMCScoreLbl">proj. score</div>' +
      '</div>' +
      '<div class="thMCWinCard thMCWinCard--b">' +
        '<div class="thMCWinPct" style="color:var(--warn)">' + mc.bWinPct + '%</div>' +
        '<div class="thMCWinBar"><div class="thMCWinBarFill" style="width:' + mc.bWinPct + '%;background:var(--warn)"></div></div>' +
        '<div class="thMCWinName">' + bName + '</div>' +
      '</div>' +
    '</div>' +
    // ── Key stats (expanded to 4x2) ──────────────────────────────────
    '<div class="thMCGrid thMCGrid--4col">' +
      '<div class="thMCGridItem"><div class="thMCGridVal">' + marginStr(mc.avgMargin) + '</div><div class="thMCGridLbl">Avg Margin</div></div>' +
      '<div class="thMCGridItem"><div class="thMCGridVal">' + marginStr(mc.medianMargin) + '</div><div class="thMCGridLbl">Median Margin</div></div>' +
      '<div class="thMCGridItem"><div class="thMCGridVal">±' + mc.stdDev + ' pts</div><div class="thMCGridLbl">Margin Std Dev</div></div>' +
      '<div class="thMCGridItem"><div class="thMCGridVal">' + mc.closeGamePct + '%</div><div class="thMCGridLbl">Close Game (≤5pt)</div></div>' +
      '<div class="thMCGridItem"><div class="thMCGridVal" style="color:var(--accent)">±' + mc.teamSdA + '</div><div class="thMCGridLbl">' + aName + ' Score SD</div></div>' +
      '<div class="thMCGridItem"><div class="thMCGridVal" style="color:var(--warn)">±' + mc.teamSdB + '</div><div class="thMCGridLbl">' + bName + ' Score SD</div></div>' +
      '<div class="thMCGridItem"><div class="thMCGridVal" style="color:var(--accent)">' + mc.blowoutAPct + '%</div><div class="thMCGridLbl">' + aName + ' Blowout</div></div>' +
      '<div class="thMCGridItem"><div class="thMCGridVal" style="color:var(--warn)">' + mc.blowoutBPct + '%</div><div class="thMCGridLbl">' + bName + ' Blowout</div></div>' +
    '</div>' +
    // ── 80% range banner ─────────────────────────────────────────────
    '<div class="thMCRangeBanner">80% of simulations fall between <strong>' + marginStr(mc.p10) + '</strong> and <strong>' + marginStr(mc.p90) + '</strong></div>' +
    // ── Histogram ────────────────────────────────────────────────────
    '<div class="thMCHistTitle">Score Margin Distribution</div>' +
    '<div class="thMCHist">' + histHtml + '</div>' +
    '<div class="thMCNote">' + paramsNote + '</div>' +
    _thBuildMCRecentPBP(aName, bName) +
    // ── Coach-friendly sections ──
    _thBuildMCSummary(mc, aName, bName) +
    _thBuildMCMatchups(aName, bName) +
    _thBuildMCGamePlan(mc, aName, bName,
      teamRatings[(aName || '').toLowerCase()] || null,
      teamRatings[(bName || '').toLowerCase()] || null) +
    // ── Sensitivity analysis ──
    _thBuildMCSensitivity(mc, aName, bName, sens) +
  '</div>';
}

// ── thRunDeepAnalysis — call Gemini directly and render results in-page ───────
async function thRunDeepAnalysis() {
  if (!thCurrentTeam || !thCurrentCompareTeam) {
    if (typeof showWarn === 'function') showWarn('Load a team and compare opponent first.');
    return;
  }

  // ── Guest limit check ──
  if (_thIsGuest()) {
    // Force lite model for guests
    if (_thDeepUseHeavyModel) thSetDeepModel(false);
    var usedCount = _thGuestDACount();
    if (usedCount >= _TH_GUEST_DA_LIMIT) {
      if (typeof showWarn === 'function') showWarn('🔒 Guest limit reached (' + _TH_GUEST_DA_LIMIT + '/' + _TH_GUEST_DA_LIMIT + ' Deep Analysis runs used). Log in for unlimited access.');
      var lockedOutput = document.getElementById('thDeepOutput');
      if (lockedOutput) {
        lockedOutput.style.display = 'block';
        lockedOutput.innerHTML = '<div style="text-align:center;padding:32px 20px;color:var(--muted)">' +
          '<div style="font-size:32px;margin-bottom:8px">🔒</div>' +
          '<div style="font-size:14px;font-weight:700;color:var(--fg);margin-bottom:6px">Guest Limit Reached</div>' +
          '<div style="font-size:12px">You\'ve used all ' + _TH_GUEST_DA_LIMIT + ' free Deep Analysis runs.<br>Log in for unlimited access and the Pro model.</div>' +
        '</div>';
      }
      return;
    }
  }

  const btn = document.querySelector('.thDeepBtn');
  const status = document.getElementById('thDeepAnalysisStatus');
  const output = document.getElementById('thDeepOutput');
  if (!output) return;

  // Show loading state
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Analyzing…'; }
  if (status) status.textContent = '';
  output.style.display = 'block';
  output.innerHTML = '<div class="thDeepLoading"><span class="thDeepSpinner"></span> Running deep analysis on all available matchup data…</div>';

  function teamSnapshot(name, ratings, stats) {
    const ts = stats ? stats.teamStats : null;
    const os = stats ? stats.opponentStats : null;
    const ff = ts ? ts.fourFactors : null;
    const ofs = os ? os.fourFactors : null;
    const g = (stats && stats.games) || 1;
    return {
      team: name,
      ratings: ratings ? { adjO: ratings.adjO, adjD: ratings.adjD, adjEM: ratings.adjEM, rank: ratings.rank, srs: ratings.srs } : null,
      scoring: ts ? {
        ppg: +(ts.points.total / g).toFixed(1),
        oppg: os ? +(os.points.total / g).toFixed(1) : null,
        pace: stats ? stats.pace : null,
        trueShooting: ts.trueShooting,
        threePct: ts.threePointFieldGoals ? ts.threePointFieldGoals.pct : null,
        threeAttemptRate: ts.threePointFieldGoals && ts.fieldGoals ? +(ts.threePointFieldGoals.attempted / (ts.fieldGoals.attempted || 1) * 100).toFixed(1) : null,
        paintRate: +(ts.points.inPaint / (ts.points.total || 1) * 100).toFixed(1),
        offTurnoverPtsRate: +(ts.points.offTurnovers / (ts.points.total || 1) * 100).toFixed(1),
      } : null,
      fourFactors: ff ? {
        offEfg: ff.effectiveFieldGoalPct,
        offTovRate: +(ff.turnoverRatio * 100).toFixed(1),
        offOreb: ff.offensiveReboundPct,
        offFtr: ff.freeThrowRate,
        defEfgAllowed: ofs ? ofs.effectiveFieldGoalPct : null,
        defTovForced: ofs ? +(ofs.turnoverRatio * 100).toFixed(1) : null,
        defOrebAllowed: ofs ? ofs.offensiveReboundPct : null,
        defFtrAllowed: ofs ? ofs.freeThrowRate : null,
      } : null,
    };
  }

  const aName = thCurrentTeam;
  const bName = thCurrentCompareTeam;
  const ratA = teamRatings[(aName || '').toLowerCase()] || null;
  const ratB = teamRatings[(bName || '').toLowerCase()] || null;
  const context = {
    season: thCurrentSeason,
    mode: thMatchupMode,
    teamA: teamSnapshot(aName, ratA, _thCurrentStats),
    teamB: teamSnapshot(bName, ratB, _thCompareStats),
    matchupShots: _thLastMatchupCtx,
    recentTournamentShots: _thRecentTournamentCtx,
    tournamentIntel: _thTournamentIntelCtx,
  };

  const systemInstruction = {
    parts: [{ text: 'You are an expert NCAA basketball analyst and coach. You have deep knowledge of advanced statistics, four factors, shot charting, and strategic game planning. Analyze only the structured data provided — do not reference external news or speculation. Be specific, data-driven, and actionable. Use markdown formatting with ## headers and bullet points for readability.' }]
  };

  // Fetch opponent game log (cached) to build "How to Beat" context
  let oppGameNote = '';
  try {
    const oppGamesData = typeof loadGamesForTeam === 'function'
      ? await loadGamesForTeam(bName, thCurrentSeason) : null;
    const oppGames = (oppGamesData && oppGamesData.games) ? oppGamesData.games : [];
    if (oppGames.length) {
      let wins = 0, losses = 0, totalPF = 0, totalPA = 0;
      const lossDetails = [], bigWins = [];
      const tn = bName.toLowerCase();
      oppGames.forEach(g => {
        const hn = (g.homeTeam || '').toLowerCase();
        const an = (g.awayTeam || '').toLowerCase();
        const isHome = hn === tn;
        const isAway = an === tn;
        if (!isHome && !isAway) return;               // skip games that don't involve this team
        const teamPts = isHome ? g.homePoints : g.awayPoints;
        const oppPts  = isHome ? g.awayPoints : g.homePoints;
        if (teamPts == null || oppPts == null) return; // skip games with missing scores
        const against = isHome ? (g.awayTeam || '?') : (g.homeTeam || '?');
        totalPF += teamPts; totalPA += oppPts;
        if (teamPts > oppPts) wins++;
        else {
          losses++;
          lossDetails.push({ vs: against, margin: oppPts - teamPts, score: teamPts + '-' + oppPts });
          if (oppPts - teamPts >= 10) bigWins.push(against + ' won by ' + (oppPts - teamPts) + ' (' + teamPts + '-' + oppPts + ')');
        }
      });
      const n = oppGames.length;
      const avgMgn = +((totalPF - totalPA) / n).toFixed(1);
      const closeL = lossDetails.filter(l => l.margin <= 5).map(l => l.vs + ' ' + l.score);
      oppGameNote = `\n\n${bName} season game log (${wins}-${losses}, avg margin ${avgMgn > 0 ? '+' : ''}${avgMgn}):` +
        (bigWins.length ? `\nTeams that beat them by 10+: ${bigWins.join('; ')}` : '') +
        (lossDetails.length ? `\nAll losses: ${lossDetails.slice(0, 8).map(l => l.vs + ' ' + l.score).join('; ')}` : '') +
        (closeL.length ? `\nClose losses (<=5pt): ${closeL.join('; ')}` : '');
    }
  } catch (_) {}

  // Guests always use lite model (double-check)
  const useHeavy = _thDeepUseHeavyModel && !_thIsGuest();
  const selectedModel = useHeavy ? 'gemini-3-flash-preview' : 'gemini-2.5-flash-lite';
  const maxTokens    = useHeavy ? 6000 : 4096;

  // Increment guest usage counter
  if (_thIsGuest()) {
    var newCount = _thGuestDAIncrement();
    // Update the button label with remaining count
    var daBtn = document.querySelector('.thDeepBtn');
    if (daBtn) {
      var remaining = _TH_GUEST_DA_LIMIT - newCount;
      if (remaining > 0) {
        daBtn.setAttribute('data-guest-remaining', remaining + ' left');
      }
    }
  }

  const userPrompt =
    `Produce a complete **tournament-ready** coach-level deep analysis for **${aName} vs ${bName}**.\n\n` +
    `Structure your response with these exact sections:\n` +
    `## Overall Verdict\n` +
    `## ${aName} \u2014 Strengths\n` +
    `## ${aName} \u2014 Weaknesses\n` +
    `## ${aName} \u2014 Tendencies\n` +
    `## ${bName} \u2014 Strengths\n` +
    `## ${bName} \u2014 Weaknesses\n` +
    `## ${bName} \u2014 Tendencies\n` +
    `## Shot Chart Intel \u2014 ${bName} Season Profile\n` +
    `(Use full-season play-by-play-derived shot chart trends and where their misses cluster.)\n` +
    `## Shot Chart Intel \u2014 ${bName} Recent MAC Tournament (Quarterfinal + Semifinal)\n` +
    `(Show how their recent tournament shot profile differs from season baseline.)\n` +
    `## Where ${bName} Misses Most (Exploit Map)\n` +
    `(Name the miss-heavy zones and exactly how ${aName} should force those looks.)\n` +
    `## Head-to-Head Matchup Notes\n` +
    `(How to guard each team, how each defends, mismatches to exploit)\n` +
    `## How to Beat ${bName}\n` +
    `(Using their season record, loss patterns, and which teams beat them \u2014 identify the exact blueprint ${aName} should follow. Be very specific and actionable for a tournament game.)\n` +
    `## Game Plan: Offensive Keys (5 items for each team)\n` +
    `## Game Plan: Defensive Keys (5 items for each team)\n` +
    `## Timeout Strategy vs ${bName}\n` +
    `(Recommend exact timeout trigger moments using tournament trends, period/phase patterns, and momentum-risk windows.)\n` +
    `## In-Game Adjustment Triggers (3 specific situations)\n` +
    `## Data Confidence & Red Flags\n\n` +
    `Use both season-long metrics and tournament play-by-play context provided in the JSON. Weight recent tournament tendencies as short-term form, but do not ignore season baselines. For ${bName}, explicitly use full-season PBP-derived trends, season shot chart profile, and recent MAC tournament shot chart profile.\n\n` +
    `All analysis must be grounded in this structured data only:${oppGameNote}\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;

  try {
    if (status) status.textContent = `Using ${selectedModel}\u2026`;
    const res = await fetch('https://white-pine-7669.bryanhkwan.workers.dev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selectedModel,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction,
        generationConfig: { temperature: 0.68, maxOutputTokens: maxTokens }
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    const rawText = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    if (!rawText) throw new Error('Empty response from AI.');
    if (status) status.textContent = '';
    var deepChartsHtml = _thBuildDeepShotReportHTML(aName, bName);
    output.innerHTML =
      '<div class="thDeepHeader">' +
        '<span class="thDeepIcon">\uD83E\uDDE0</span>' +
        '<strong>Deep Analysis \u2014 ' + aName + ' vs ' + bName + '</strong>' +
        '<span class="thDeepModelBadge">' + selectedModel + '</span>' +
        '<div style="margin-left:auto;display:flex;gap:6px;align-items:center">' +
          '<button class="thDeepPdfBtn" onclick="thDownloadDeepPDF()" title="Download PDF">\u2B07\uFE0F PDF</button>' +
          '<button class="thDeepClose" onclick="document.getElementById(\'thDeepOutput\').style.display=\'none\'">&times;</button>' +
        '</div>' +
      '</div>' +
      '<div class="thDeepBody">' +
        deepChartsHtml +
        _thFmtDeepText(rawText) +
      '</div>';
    thInitShotChart('thDeepOutput');
    output.dataset.lastRaw = rawText;
    output.dataset.aName   = aName;
    output.dataset.bName   = bName;
    output.dataset.season  = thCurrentSeason;
    output.dataset.model   = selectedModel;
  } catch (e) {
    if (status) status.textContent = '';
    output.innerHTML = '<div class="thDeepError">\u26A0 Analysis failed: ' + e.message + '. Check console for details.</div>';
    console.error('[thRunDeepAnalysis]', e);
  } finally {
    if (btn) {
      if (_thIsGuest()) {
        var rem = _TH_GUEST_DA_LIMIT - _thGuestDACount();
        if (rem <= 0) {
          btn.disabled = true;
          btn.textContent = '\ud83d\udd12 Limit Reached';
        } else {
          btn.disabled = false;
          btn.textContent = '\ud83e\udde0 Deep Analysis (' + rem + '/' + _TH_GUEST_DA_LIMIT + ')';
        }
      } else {
        btn.disabled = false;
        btn.textContent = '\ud83e\udde0 Deep Analysis';
      }
    }
  }
}

// \u2500\u2500 thDownloadDeepPDF \u2014 open print window with professional PDF report \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function thDownloadDeepPDF() {
  var output = document.getElementById('thDeepOutput');
  if (!output || !output.dataset.lastRaw) return;
  var aName   = output.dataset.aName  || 'Team A';
  var bName   = output.dataset.bName  || 'Team B';
  var season  = output.dataset.season || '';
  var model   = output.dataset.model  || '';
  var rawText = output.dataset.lastRaw;
  var mc = _thLastMonteCarlo || null;

  // Grab matchup shot chart SVGs from the page
  var shotChartsHtml = '';
  var matchupEl = document.getElementById('thMatchup');
  if (matchupEl) {
    var svgs = matchupEl.querySelectorAll('.shot-chart-svg');
    var titles = matchupEl.querySelectorAll('.thShotTitle');
    var statsEls = matchupEl.querySelectorAll('.thShotStats');
    svgs.forEach(function(svg, i) {
      var titleText = (titles[i] ? titles[i].textContent : '');
      var statsText = (statsEls[i] ? statsEls[i].textContent : '');
      // Clone SVG, strip interactive attrs, set print-friendly styling
      var clone = svg.cloneNode(true);
      clone.removeAttribute('data-filter');
      clone.setAttribute('style', 'width:100%;max-width:300px;display:block;margin:0 auto');
      shotChartsHtml += '<div class="sc-col">' +
        '<div class="sc-title">' + titleText + '</div>' +
        '<div>' + clone.outerHTML + '</div>' +
        '<div class="sc-stats">' + statsText + '</div>' +
      '</div>';
    });
    if (shotChartsHtml) {
      shotChartsHtml = '<div class="sc-row">' + shotChartsHtml + '</div>';
    }
  }

  // Build Monte Carlo section for PDF
  var mcHtml = '';
  if (mc) {
    function marginStr(m) {
      if (m > 0) return aName + ' +' + m;
      if (m < 0) return bName + ' +' + Math.abs(m);
      return 'Even';
    }
    // Histogram bars
    var entries = Object.keys(mc.buckets).map(function(k) { return [+k, mc.buckets[k]]; }).sort(function(a, b) { return a[0] - b[0]; });
    var maxCount = Math.max.apply(null, entries.map(function(e) { return e[1]; }));
    var histBars = '';
    entries.forEach(function(pair) {
      var margin = pair[0], count = pair[1];
      var pct = (count / maxCount * 100).toFixed(0);
      var color = margin > 0 ? '#2563eb' : margin < 0 ? '#f59e0b' : '#888';
      histBars += '<div class="mc-bar"><div class="mc-fill" style="width:' + pct + '%;background:' + color + '"></div><span class="mc-lbl">' + (margin > 0 ? '+' : '') + margin + '</span></div>';
    });

    mcHtml = '<div class="ps" style="break-inside:avoid"><div class="ps-head">\uD83C\uDFB2 Monte Carlo Simulation (' + mc.nSims.toLocaleString() + ' runs)</div><div class="ps-body">' +
      '<div class="mc-headline">' +
        '<div class="mc-win" style="border-color:#2563eb"><div class="mc-pct">' + mc.aWinPct + '%</div><div class="mc-name">' + aName + '</div></div>' +
        '<div class="mc-vs">vs</div>' +
        '<div class="mc-win" style="border-color:#f59e0b"><div class="mc-pct">' + mc.bWinPct + '%</div><div class="mc-name">' + bName + '</div></div>' +
      '</div>' +
      '<table class="mc-tbl"><tbody>' +
        '<tr><td>Avg Score</td><td>' + mc.avgScoreA + ' \u2013 ' + mc.avgScoreB + '</td></tr>' +
        '<tr><td>Avg Margin</td><td>' + marginStr(mc.avgMargin) + '</td></tr>' +
        '<tr><td>Median Margin</td><td>' + marginStr(mc.medianMargin) + '</td></tr>' +
        '<tr><td>Margin Std Dev</td><td>\u00B1' + mc.stdDev + ' pts</td></tr>' +
        '<tr><td>' + aName + ' Score SD</td><td>\u00B1' + mc.teamSdA + ' pts</td></tr>' +
        '<tr><td>' + bName + ' Score SD</td><td>\u00B1' + mc.teamSdB + ' pts</td></tr>' +
        '<tr><td>80% Range</td><td>' + marginStr(mc.p10) + ' to ' + marginStr(mc.p90) + '</td></tr>' +
        '<tr><td>Close Game (\u22645pt)</td><td>' + mc.closeGamePct + '%</td></tr>' +
        '<tr><td>' + aName + ' Blowout (10+)</td><td>' + mc.blowoutAPct + '%</td></tr>' +
        '<tr><td>' + bName + ' Blowout (10+)</td><td>' + mc.blowoutBPct + '%</td></tr>' +
      '</tbody></table>' +
      '<div style="font-size:7.5pt;color:#888;text-align:center;padding:4px 14px">' +
        'SD: ' + (mc._sdA||11) + '/' + (mc._sdB||11) + ' pts' + (mc._rho > 0 ? ' · \u03c1=' + mc._rho.toFixed(2) : '') + ' · Pace: ' + (mc._pace||68).toFixed(0) +
      '</div>' +
      '<div class="mc-hist-title">Score Margin Distribution</div>' +
      '<div class="mc-hist">' + histBars + '</div>' +
    '</div></div>';

    // ── Executive Summary for PDF ──
    var fav = mc.aWinPct >= mc.bWinPct ? aName : bName;
    var dog = mc.aWinPct >= mc.bWinPct ? bName : aName;
    var favPct = Math.max(mc.aWinPct, mc.bWinPct);
    var dogPct = Math.min(mc.aWinPct, mc.bWinPct);
    var spread = Math.abs(mc.avgMargin);
    var verdict = '';
    if (favPct >= 75) verdict = fav + ' is a <strong>heavy favorite</strong> — ' + dog + ' needs an exceptional game or key matchup advantage to pull the upset.';
    else if (favPct >= 60) verdict = fav + ' is <strong>favored</strong>, but ' + dog + ' has a realistic path to the upset (' + dogPct + '% win probability).';
    else verdict = 'This is a <strong>toss-up game</strong>. Execution, game plan, and adjustments will likely decide the outcome.';
    var closeNote = '';
    if (mc.closeGamePct >= 40) closeNote = '<br>⏱ <strong>High close-game probability (' + mc.closeGamePct + '%)</strong> — late-game execution and free-throw shooting will be critical.';
    else if (mc.closeGamePct >= 25) closeNote = '<br>⏱ Moderate chance of a close finish (' + mc.closeGamePct + '%) — prepare end-of-game sets.';
    var rangeSpan = Math.abs(mc.p90 - mc.p10);
    mcHtml += '<div class="ps" style="break-inside:avoid"><div class="ps-head">📋 Executive Summary</div><div class="ps-body">' +
      '<p class="mc-summary-p">' + verdict + closeNote + '</p>' +
      '<p class="mc-summary-sub">Projected spread: <strong>' + (mc.avgMargin > 0 ? aName : bName) + ' by ' + spread + '</strong> · 80% of outcomes fall within a ' + rangeSpan + '-point window.</p>' +
    '</div></div>';

    // ── Player Matchups for PDF ──
    if (typeof tbGetAllPlayers === 'function') {
      var mAll = tbGetAllPlayers(typeof league !== 'undefined' ? league : 'MBB');
      var mAPlayers = mAll.filter(function(p) { return (p.Team || '').toLowerCase() === (aName || '').toLowerCase(); });
      var mBPlayers = mAll.filter(function(p) { return (p.Team || '').toLowerCase() === (bName || '').toLowerCase(); });
      if (mAPlayers.length && mBPlayers.length) {
        function topN(arr, stat, n) { return arr.slice().sort(function(a, b) { return (safeNum(b[stat]) || 0) - (safeNum(a[stat]) || 0); }).slice(0, n); }
        function posLbl(r) { var p = (r.Position || r.Pos || '').toString(); return p || (typeof tbPosGroup === 'function' && tbPosGroup(r) === 'guard' ? 'G' : 'F/C'); }
        function pdfPctlBadge(r, stat) {
          if (typeof statPercentile !== 'function') return '';
          var v = safeNum(r[stat]); if (v === null) return '';
          var p = statPercentile(stat, v);
          if (!Number.isFinite(p)) return '';
          var pct = Math.round(p * 100);
          var clr = pct >= 80 ? '#16a34a' : pct >= 55 ? '#2563eb' : pct >= 35 ? '#d97706' : '#dc2626';
          return ' <span style="color:' + clr + ';font-size:8pt;font-weight:700">' + pct + 'th</span>';
        }
        var aScorers = topN(mAPlayers, 'PPG', 3);
        var bScorers = topN(mBPlayers, 'PPG', 3);
        function pdfPlayerCell(r, color) {
          var ppg = safeNum(r['PPG']); ppg = ppg != null ? ppg.toFixed(1) : '—';
          var efg = safeNum(r['eFG%']); efg = efg != null ? (efg > 1 ? efg.toFixed(1) : (efg * 100).toFixed(1)) : '—';
          var rpg = safeNum(r['RPG']); rpg = rpg != null ? rpg.toFixed(1) : '—';
          var apg = safeNum(r['APG']); apg = apg != null ? apg.toFixed(1) : '—';
          return '<td class="mc-mu-cell">' +
            '<div class="mc-mu-name" style="color:' + color + '">' + (r.Player || r.Name || '—') + ' <span class="mc-mu-pos">' + posLbl(r) + '</span></div>' +
            '<div class="mc-mu-stats">' + ppg + ' ppg' + pdfPctlBadge(r, 'PPG') + ' · ' + efg + ' eFG%' + pdfPctlBadge(r, 'eFG%') + ' · ' + rpg + ' rpg · ' + apg + ' apg</div>' +
          '</td>';
        }
        var maxRows = Math.max(aScorers.length, bScorers.length);
        var muRows = '';
        for (var mi = 0; mi < maxRows; mi++) {
          muRows += '<tr>' +
            (mi < aScorers.length ? pdfPlayerCell(aScorers[mi], '#2563eb') : '<td class="mc-mu-cell"></td>') +
            '<td class="mc-mu-vs">vs</td>' +
            (mi < bScorers.length ? pdfPlayerCell(bScorers[mi], '#d97706') : '<td class="mc-mu-cell"></td>') +
          '</tr>';
        }
        mcHtml += '<div class="ps" style="break-inside:avoid"><div class="ps-head">👤 Key Player Matchups</div><div class="ps-body">' +
          '<div class="mc-mu-header"><span style="color:#2563eb;font-weight:800">' + aName + '</span><span style="color:#d97706;font-weight:800">' + bName + '</span></div>' +
          '<table class="mc-mu-tbl"><tbody>' + muRows + '</tbody></table>' +
        '</div></div>';
      }
    }

    // ── Coaching Game Plan for PDF ──
    var gpItems = [];
    var gpFav = mc.aWinPct >= mc.bWinPct ? 'a' : 'b';
    var gpFavName = gpFav === 'a' ? aName : bName;
    var gpDogName = gpFav === 'a' ? bName : aName;
    var paceA = (_thCurrentStats && _thCurrentStats.pace) ? +_thCurrentStats.pace : null;
    var paceB = (_thCompareStats && _thCompareStats.pace) ? +_thCompareStats.pace : null;
    if (paceA && paceB) {
      if (gpFav === 'a' && paceA > paceB + 3) gpItems.push({icon:'🏃', text:'Push the pace — ' + aName + ' plays faster (' + paceA.toFixed(0) + ' vs ' + paceB.toFixed(0) + '). More possessions favor the better team.'});
      else if (gpFav === 'b' && paceA < paceB - 3) gpItems.push({icon:'🐢', text:'Slow it down — ' + aName + ' should limit possessions. ' + bName + ' wants to run (' + paceB.toFixed(0) + ' pace).'});
      else if (gpFav === 'a' && paceA < paceB - 3) gpItems.push({icon:'🏃', text:aName + ' is favored but plays slower. Consider pushing tempo to create more opportunities.'});
      else gpItems.push({icon:'⚖️', text:'Pace is similar (' + paceA.toFixed(0) + ' vs ' + paceB.toFixed(0) + '). Game will likely be played at a neutral tempo.'});
    }
    if (mc.closeGamePct >= 35) gpItems.push({icon:'⏱', text:'High close-game probability (' + mc.closeGamePct + '%). Drill late-game situations: ATO sets, intentional fouls protocol, clock management.'});
    var ratA = teamRatings[(aName || '').toLowerCase()] || null;
    var ratB = teamRatings[(bName || '').toLowerCase()] || null;
    if (ratA && ratB) {
      var oEdge = (ratA.adjO - ratB.adjO).toFixed(1);
      var dEdge = (ratB.adjD - ratA.adjD).toFixed(1);
      if (Math.abs(+oEdge) >= 4) {
        if (+oEdge > 0) gpItems.push({icon:'🔥', text:aName + ' has a significant offensive efficiency edge (+' + oEdge + ' adjO). Prioritize high-value possessions and avoid live-ball turnovers.'});
        else gpItems.push({icon:'🛡️', text:bName + ' has the offensive edge (' + Math.abs(+oEdge) + ' adjO better). Force tough shots and contest every attempt.'});
      }
      if (Math.abs(+dEdge) >= 4) {
        if (+dEdge > 0) gpItems.push({icon:'🛡️', text:aName + ' has a defensive advantage (' + Math.abs(+dEdge) + ' pts better adjD). Attack their weaker rotations and get to the free-throw line.'});
        else gpItems.push({icon:'⚠️', text:bName + ' defends at an elite level. Move the ball, use screens to create open looks, and be patient on offense.'});
      }
    }
    if (favPct >= 60 && gpFav === 'b') gpItems.push({icon:'🎯', text:'Upset path for ' + aName + ': ' + (mc.closeGamePct >= 30 ? 'Keep it close and execute late. ' : '') + 'Force turnovers, crash the boards, and limit transition points.'});
    else if (favPct >= 60 && gpFav === 'a') gpItems.push({icon:'🎯', text:gpDogName + ' upset path: Control pace, force ' + gpFavName + ' into half-court offense, and win the rebounding battle.'});
    var blowA = mc.blowoutAPct, blowB = mc.blowoutBPct;
    if (blowA >= 20 || blowB >= 20) {
      var blower = blowA >= blowB ? aName : bName;
      var blowPct = Math.max(blowA, blowB);
      gpItems.push({icon:'📊', text:blower + ' has a ' + blowPct + '% chance of winning by 10+. The underdog should keep the game within striking distance through halftime.'});
    }
    gpItems.push({icon:'🏀', text:'In projected close games, free-throw shooting is decisive. Identify your best FT shooters for late-game possessions.'});
    if (gpItems.length) {
      var gpHtml = gpItems.map(function(it) {
        return '<div class="mc-gp-item"><span class="mc-gp-icon">' + it.icon + '</span><span>' + it.text + '</span></div>';
      }).join('');
      mcHtml += '<div class="ps" style="break-inside:avoid"><div class="ps-head">🏆 Coaching Game Plan</div><div class="ps-body">' + gpHtml + '</div></div>';
    }
  }

  function buildPrintHtml(text) {
    var lines = text.split('\n');
    var html = '', inSection = false;
    lines.forEach(function(line) {
      if (line.indexOf('## ') === 0) {
        if (inSection) html += '</div></div>';
        html += '<div class="ps"><div class="ps-head">' + line.replace(/^## /, '') + '</div><div class="ps-body">';
        inSection = true;
      } else if (line.indexOf('### ') === 0) {
        html += '<div class="ps-sub">' + line.replace(/^### /, '') + '</div>';
      } else if (/^\d+\.\s/.test(line)) {
        html += '<div class="ps-num">' + line.replace(/^(\d+)\.\s/, '<span class="ps-n">$1.</span> ') + '</div>';
      } else if (/^[-\u2022*]\s/.test(line)) {
        html += '<div class="ps-bul">' + line.replace(/^[-\u2022*]\s/, '') + '</div>';
      } else if (/^\*\*(.+?):\*\*\s*(.*)$/.test(line)) {
        var m = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
        html += '<div class="ps-lbl"><span class="ps-lbl-h">' + m[1] + ':</span> ' + (m[2] || '') + '</div>';
      } else if (line.trim()) {
        html += '<p class="ps-p">' + line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>') + '</p>';
      }
    });
    if (inSection) html += '</div></div>';
    return html;
  }

  var ts  = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  var win = window.open('', '_blank', 'width=920,height=780');
  if (!win) { alert('Pop-ups blocked \u2014 please allow pop-ups to download PDF.'); return; }
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8">' +
'<title>Deep Analysis \u2014 ' + aName + ' vs ' + bName + ' (' + season + ')</title>' +
'<style>' +
'*{margin:0;padding:0;box-sizing:border-box}' +
'body{font-family:"Segoe UI",Arial,sans-serif;font-size:11pt;color:#111;background:#fff}' +
'.cover{background:linear-gradient(135deg,#0f2044 0%,#1a3a72 60%,#1d4faa 100%);color:#fff;padding:36px 44px 28px;page-break-after:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
'.cv-badge{font-size:7.5pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.55;margin-bottom:4px}' +
'.cv-title{font-size:20pt;font-weight:900;line-height:1.2}' +
'.cv-sub{font-size:12pt;opacity:.75;margin-top:6px}' +
'.cv-meta{display:flex;gap:22px;margin-top:16px;font-size:8.5pt;opacity:.65;flex-wrap:wrap}' +
'.cv-meta span::before{content:"\u25B8  "}' +
'.content{padding:24px 36px 32px}' +
'.ps{margin-bottom:14px;border:1px solid #cdd6e3;border-radius:5px;overflow:hidden;break-inside:avoid}' +
'.ps-head{background:#0f2044;color:#fff;font-size:9.5pt;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:7px 14px;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
'.ps-body{padding:0}' +
'.ps-sub{font-size:9pt;font-weight:700;color:#1a3a72;padding:7px 14px 3px;text-transform:uppercase;letter-spacing:.04em;border-top:1px solid #eaeff6}' +
'.ps-num{display:flex;gap:10px;padding:5px 14px;border-bottom:1px solid #f2f5fa;font-size:10.5pt;line-height:1.5}' +
'.ps-n{color:#1a3a72;font-weight:800;min-width:18px;flex-shrink:0}' +
'.ps-bul{padding:5px 14px 5px 30px;position:relative;border-bottom:1px solid #f2f5fa;font-size:10.5pt;line-height:1.5}' +
'.ps-bul::before{content:"\u25B8";position:absolute;left:13px;color:#1a3a72;font-size:8pt;top:6px}' +
'.ps-lbl{padding:5px 14px;border-bottom:1px solid #f2f5fa;font-size:10.5pt;line-height:1.5}' +
'.ps-lbl-h{font-weight:800;color:#0f2044}' +
'.ps-p{padding:5px 14px;font-size:10.5pt;line-height:1.6;color:#222;border-bottom:1px solid #f2f5fa}' +
'.ps-num:last-child,.ps-bul:last-child,.ps-lbl:last-child,.ps-p:last-child{border-bottom:none}' +
/* Shot chart print styles */
'.sc-row{display:flex;gap:16px;justify-content:center;margin-bottom:20px;flex-wrap:wrap;break-inside:avoid}' +
'.sc-col{flex:1;min-width:260px;max-width:340px;text-align:center}' +
'.sc-title{font-size:10pt;font-weight:800;color:#0f2044;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em}' +
'.sc-stats{font-size:8.5pt;color:#555;margin-top:4px}' +
'.sc-row svg rect[fill="#080f1e"]{fill:#eef1f6 !important}' +
'.sc-row svg rect[fill="#0d1b32"]{fill:#f5f7fb !important}' +
/* Monte Carlo print styles */
'.mc-headline{display:flex;justify-content:center;gap:24px;align-items:center;padding:14px 14px 8px}' +
'.mc-win{border:2px solid;border-radius:8px;padding:8px 18px;text-align:center;min-width:100px}' +
'.mc-pct{font-size:18pt;font-weight:900}' +
'.mc-name{font-size:8pt;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#555;margin-top:2px}' +
'.mc-vs{font-size:10pt;font-weight:700;color:#999}' +
'.mc-tbl{width:100%;border-collapse:collapse;font-size:10pt;margin:0}' +
'.mc-tbl td{padding:5px 14px;border-bottom:1px solid #f2f5fa}' +
'.mc-tbl td:first-child{font-weight:700;color:#0f2044;width:40%}' +
'.mc-hist-title{font-size:8.5pt;font-weight:700;color:#0f2044;text-transform:uppercase;letter-spacing:.04em;padding:10px 14px 4px}' +
'.mc-hist{padding:0 14px 10px}' +
'.mc-bar{display:flex;align-items:center;gap:6px;margin-bottom:2px;height:14px}' +
'.mc-fill{height:10px;border-radius:3px;min-width:2px;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
'.mc-lbl{font-size:7.5pt;color:#888;min-width:24px}' +
'.mc-summary-p{padding:10px 14px 4px;font-size:10.5pt;line-height:1.6;color:#222}' +
'.mc-summary-sub{padding:4px 14px 10px;font-size:9pt;color:#888}' +
'.mc-mu-header{display:flex;justify-content:space-between;padding:8px 14px 4px;font-size:9pt;text-transform:uppercase;letter-spacing:.05em}' +
'.mc-mu-tbl{width:100%;border-collapse:collapse}' +
'.mc-mu-cell{padding:6px 14px;border-bottom:1px solid #f2f5fa;vertical-align:top}' +
'.mc-mu-vs{text-align:center;font-size:8pt;font-weight:700;color:#aaa;padding:8px 4px;vertical-align:middle}' +
'.mc-mu-name{font-weight:800;font-size:10pt}' +
'.mc-mu-pos{font-size:8pt;color:#888;font-weight:400}' +
'.mc-mu-stats{font-size:8.5pt;color:#555;margin-top:2px}' +
'.mc-gp-item{display:flex;gap:8px;padding:7px 14px;border-bottom:1px solid #f2f5fa;font-size:10pt;line-height:1.5;align-items:flex-start}' +
'.mc-gp-item:last-child{border-bottom:none}' +
'.mc-gp-icon{flex-shrink:0;font-size:11pt}' +
'.footer{border-top:2px solid #0f2044;margin:0 36px;padding:10px 0;display:flex;justify-content:space-between;font-size:8pt;color:#888}' +
'.printbtn{text-align:center;padding:18px;background:#f8f9fb}' +
'.printbtn button{padding:10px 26px;font-size:11pt;background:#0f2044;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:700}' +
'@media print{.printbtn{display:none}@page{margin:.45in;size:letter}}' +
'</style></head><body>' +
'<div class="cover">' +
'<div class="cv-badge">NCAA Scouting Dashboard \u00B7 Deep Analysis Report</div>' +
'<div class="cv-title">' + aName + '<br>vs ' + bName + '</div>' +
'<div class="cv-sub">Tournament Preparation Scouting Report</div>' +
'<div class="cv-meta"><span>Season ' + season + '</span><span>' + ts + '</span><span>AI: ' + model + '</span></div>' +
'</div>' +
'<div class="content">' +
  (shotChartsHtml ? '<div class="ps" style="break-inside:avoid"><div class="ps-head">\uD83C\uDFAF Shot Charts</div><div class="ps-body" style="padding:12px">' + shotChartsHtml + '</div></div>' : '') +
  mcHtml +
  buildPrintHtml(rawText) +
'</div>' +
'<div class="footer"><span>NCAA Scouting Dashboard \u2014 Confidential</span><span>' + aName + ' vs ' + bName + ' \u00B7 ' + season + '</span></div>' +
'<div class="printbtn"><button onclick="window.print()">\uD83D\uDDA8\uFE0F Print / Save as PDF</button></div>' +
'</body></html>');
  win.document.close();
  setTimeout(function() { win.print(); }, 700);
}

// \u2500\u2500 thRenderCompare — side-by-side team comparison ────────────────────────────
function thRenderCompare(teamA, ratA, statsA, teamB, ratB, statsB) {
  const el = document.getElementById('thCompare');
  if (!el) return;
  if (!teamA || !teamB) {
    el.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Load a primary team first, then pick a team to compare.</div>';
    return;
  }
  const tsA = statsA ? statsA.teamStats     : null;
  const osA = statsA ? statsA.opponentStats : null;
  const tsB = statsB ? statsB.teamStats     : null;
  const osB = statsB ? statsB.opponentStats : null;
  const ffA = tsA ? tsA.fourFactors : null;
  const ffB = tsB ? tsB.fourFactors : null;
  const gA  = (statsA && statsA.games) || 1;
  const gB  = (statsB && statsB.games) || 1;

  function cmpRow(label, vA, vB, higherBetter, fmtFn) {
    const a = parseFloat(vA), b = parseFloat(vB);
    const fmt = fmtFn || (v => Number.isFinite(+v) ? (+v).toFixed(1) : '—');
    const aWins = Number.isFinite(a) && Number.isFinite(b) && (higherBetter ? a > b : a < b);
    const bWins = Number.isFinite(a) && Number.isFinite(b) && (higherBetter ? b > a : b < a);
    const aColor = aWins ? 'color:var(--good)' : bWins ? 'color:var(--bad)' : '';
    const bColor = bWins ? 'color:var(--good)' : aWins ? 'color:var(--bad)' : '';
    return `<div class="thCmpRow">
      <div class="thCmpVal${aWins?' thCmpWin':''}" style="${aColor}">${Number.isFinite(a)?fmt(a):'—'}</div>
      <div class="thCmpLabel">${label}</div>
      <div class="thCmpVal${bWins?' thCmpWin':''}" style="${bColor}">${Number.isFinite(b)?fmt(b):'—'}</div>
    </div>`;
  }

  // Edge analysis
  const edges = [];
  function checkEdge(name, vA, vB, higherBetter) {
    const a = parseFloat(vA), b = parseFloat(vB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) < 1.5) return;
    const aWins = higherBetter ? a > b : a < b;
    edges.push({ winner: aWins ? teamA : teamB, name, vW: (aWins?a:b).toFixed(1), vL: (aWins?b:a).toFixed(1), higher: higherBetter });
  }
  if (ratA && ratB) {
    checkEdge('Net Efficiency (adjEM)', ratA.adjEM, ratB.adjEM, true);
    checkEdge('Adjusted Offense',       ratA.adjO,  ratB.adjO,  true);
    checkEdge('Adjusted Defense',       ratA.adjD,  ratB.adjD,  false);
  }
  if (ffA && ffB) {
    checkEdge('effective FG%',        ffA.effectiveFieldGoalPct, ffB.effectiveFieldGoalPct, true);
    checkEdge('turnover rate',        ffA.turnoverRatio*100,      ffB.turnoverRatio*100,      false);
    checkEdge('offensive rebounding', ffA.offensiveReboundPct,   ffB.offensiveReboundPct,   true);
    checkEdge('free-throw rate',      ffA.freeThrowRate,          ffB.freeThrowRate,          true);
  }
  if (tsA && tsB) {
    checkEdge('true shooting%', tsA.trueShooting,                  tsB.trueShooting,                  true);
    checkEdge('3-point%',       tsA.threePointFieldGoals.pct,      tsB.threePointFieldGoals.pct,      true);
    checkEdge('scoring',        tsA.points.total/gA,               tsB.points.total/gB,               true);
  }

  const edgeHtml = edges.length
    ? edges.slice(0, 6).map(e =>
        `<div class="thEdgeItem"><b style="color:var(--accent)">${e.winner}</b> has a clear edge in <b>${e.name}</b> · ${e.vW} vs ${e.vL}</div>`
      ).join('')
    : '<div class="muted" style="padding:8px 0">Teams are closely matched — no standout advantages found.</div>';

  const rankA = ratA && ratA.rank ? '#' + ratA.rank : '—';
  const rankB = ratB && ratB.rank ? '#' + ratB.rank : '—';

  el.innerHTML = `
    <div class="thCmpHeader">
      <div class="thCmpTeamBlock"><div class="thCmpTeamName" style="color:var(--accent)">${teamA}</div><div class="thCmpRank">${rankA}</div></div>
      <div class="thCmpVs">VS</div>
      <div class="thCmpTeamBlock"><div class="thCmpTeamName" style="color:var(--warn)">${teamB}</div><div class="thCmpRank">${rankB}</div></div>
    </div>
    <div class="thCmpGrid">
      <div class="thCmpSection">
        <div class="thCmpSectionLabel">Efficiency Ratings</div>
        <div class="thCmpColHeads"><span style="color:var(--accent)">${teamA}</span><span></span><span style="color:var(--warn)">${teamB}</span></div>
        ${cmpRow('Adj. Offense',   ratA&&ratA.adjO,  ratB&&ratB.adjO,  true)}
        ${cmpRow('Adj. Defense',   ratA&&ratA.adjD,  ratB&&ratB.adjD,  false, v=>(+v).toFixed(1)+'↓')}
        ${cmpRow('Net Efficiency', ratA&&ratA.adjEM, ratB&&ratB.adjEM, true)}
        ${cmpRow('Natl Rank',      ratA&&ratA.rank,  ratB&&ratB.rank,  false, v=>'#'+Math.round(+v))}
        ${cmpRow('SRS',            ratA&&ratA.srs,   ratB&&ratB.srs,   true)}
      </div>
      ${(ffA || ffB) ? `<div class="thCmpSection">
        <div class="thCmpSectionLabel">Four Factors (Offense)</div>
        <div class="thCmpColHeads"><span style="color:var(--accent)">${teamA}</span><span></span><span style="color:var(--warn)">${teamB}</span></div>
        ${cmpRow('Eff. FG%',  ffA&&ffA.effectiveFieldGoalPct,  ffB&&ffB.effectiveFieldGoalPct,  true,  v=>(+v).toFixed(1)+'%')}
        ${cmpRow('TO Rate',   ffA&&(ffA.turnoverRatio*100),     ffB&&(ffB.turnoverRatio*100),    false, v=>(+v).toFixed(1)+'%')}
        ${cmpRow('OReb%',     ffA&&ffA.offensiveReboundPct,     ffB&&ffB.offensiveReboundPct,    true,  v=>(+v).toFixed(1)+'%')}
        ${cmpRow('FT Rate',   ffA&&ffA.freeThrowRate,           ffB&&ffB.freeThrowRate,          true,  v=>(+v).toFixed(1)+'%')}
      </div>` : ''}
      ${(tsA || tsB) ? `<div class="thCmpSection">
        <div class="thCmpSectionLabel">Scoring Profile</div>
        <div class="thCmpColHeads"><span style="color:var(--accent)">${teamA}</span><span></span><span style="color:var(--warn)">${teamB}</span></div>
        ${cmpRow('Pts / game',   tsA&&(tsA.points.total/gA),            tsB&&(tsB.points.total/gB),            true)}
        ${cmpRow('True Shoot%', tsA&&tsA.trueShooting,                  tsB&&tsB.trueShooting,                  true,  v=>(+v).toFixed(1)+'%')}
        ${cmpRow('3P%',          tsA&&tsA.threePointFieldGoals.pct,     tsB&&tsB.threePointFieldGoals.pct,     true,  v=>(+v).toFixed(1)+'%')}
        ${cmpRow('Pace',         statsA&&statsA.pace,                   statsB&&statsB.pace,                   true,  v=>(+v).toFixed(1))}
        ${cmpRow('Opp Pts/g',   osA&&(osA.points.total/gA),            osB&&(osB.points.total/gB),            false)}
      </div>` : ''}
    </div>
    <div class="thEdgeSection">
      <div class="thDNASectionLabel">🏆 Edge Analysis</div>
      <div class="thEdgeList">${edgeHtml}</div>
    </div>`;
}

// ── thLoadCompare — load second team stats and render comparison ──────────────
async function thLoadCompare() {
  const compareTeamEl = document.getElementById('thCompareTeam');
  const compareTeam   = compareTeamEl ? compareTeamEl.value : '';
  if (!compareTeam) { if (typeof showWarn === 'function') showWarn('Please select a team to compare against.'); return; }
  if (!thCurrentTeam)  { if (typeof showWarn === 'function') showWarn('Please load a primary team first.'); return; }
  const elCmp = document.getElementById('thCompare');
  const elMxp = document.getElementById('thMatchup');
  if (elCmp) elCmp.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Loading comparison…</div>';
  if (elMxp) elMxp.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Loading matchup data…</div>';
  const [statsB] = await Promise.all([
    loadTeamStats(compareTeam, thCurrentSeason),
  ]);
  thCurrentCompareTeam = compareTeam;
  _thCompareStats = statsB || null;
  _thRecentTournamentCtx = await _thLoadRecentTournamentCtx(thCurrentTeam, compareTeam, thCurrentSeason);
  _thTournamentIntelCtx = await _thLoadTournamentIntelCtx(thCurrentTeam, compareTeam, thCurrentSeason);
  _thDeepShotIntelCtx = await _thLoadDeepShotIntelForTeam(compareTeam, thCurrentSeason);
  const ratA = teamRatings[(thCurrentTeam||'').toLowerCase()] || null;
  const ratB = teamRatings[(compareTeam||'').toLowerCase()] || null;
  thRenderCompare(thCurrentTeam, ratA, _thCurrentStats, compareTeam, ratB, statsB);
  // Also trigger the matchup shot chart
  await thLoadMatchup(compareTeam);
}

// ── _thShotToSVG — transform full-court coordinates to SVG half-court ─────────
// Full court origin: x=0–940, y=0–500. SVG half court: viewBox 0 0 400 455. Basket at (200, 415).
// basketX: actual full-court x of the attacking basket (adaptive; defaults to 75 for MBB).
function _thShotToSVG(shot, attacksLeft, basketX) {
  if (basketX == null) basketX = attacksLeft ? 75 : 865;
  const dx = attacksLeft ? (shot.x - basketX) : (basketX - shot.x);  // depth from basket
  const dy = shot.y - 250;                                             // offset from lane center
  return {
    x: Math.round(200 + dy * 0.76),
    y: Math.round(415 - dx * 1.025),
  };
}

// Normalize source shot coordinates into full-court space expected by _thShotToSVG.
// Supports both:
// 1) Full-court: x 0..940, y 0..500
// 2) ESPN compact: x 0..50 (lateral), y 0..25 or 0..47 (depth)
function _thNormalizeShotForCourt(shot, compactMode) {
  const sx = Number(shot && shot.x);
  const sy = Number(shot && shot.y);
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
    return { x: 0, y: 0 };
  }
  if (!compactMode) {
    return { x: sx, y: sy };
  }

  // Default compact ESPN mapping: x~0..50 lateral, y~0..94 depth.
  const depthScale = compactMode === 'espn-compact' ? 10 : (940 / 47);
  // ESPN compact -> full-court: lateral maps to y-axis, depth maps to x-axis.
  const fx = sy * depthScale;
  const fy = sx * 10;
  return {
    x: Math.max(0, Math.min(940, fx)),
    y: Math.max(0, Math.min(500, fy)),
  };
}

// ── _th_buildShotChartSVG — SVG court with dots for made/missed shots ─────────
function _escAttr(s) { return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }
function _th_buildShotChartSVG(shots, teamName, color) {
  // Detect compact ESPN coordinate scale so WBB and MBB plot consistently.
  const maxAbsX = shots.reduce((m, s) => Math.max(m, Math.abs(Number(s && s.x) || 0)), 0);
  const maxAbsY = shots.reduce((m, s) => Math.max(m, Math.abs(Number(s && s.y) || 0)), 0);
  let compactMode = null;
  if (maxAbsX <= 60 && maxAbsY <= 120) {
    compactMode = 'espn-compact';
  }

  const normShots = shots.map(s => {
    const c = _thNormalizeShotForCourt(s, compactMode);
    return Object.assign({}, s, { x: c.x, y: c.y });
  });

  // Detect which basket this team attacks and compute actual basket x position.
  // Using rim shots only on the dominant side so mixed full-season data doesn't confuse the calc.
  const rimShots = normShots.filter(s => s.range === 'rim');
  const avgX = rimShots.length
    ? rimShots.reduce((s, p) => s + p.x, 0) / rimShots.length
    : 470;
  const attacksLeft = avgX < 470;
  const activeRim = rimShots.filter(s => attacksLeft ? s.x < 470 : s.x >= 470);
  const basketX = activeRim.length
    ? Math.round(activeRim.reduce((s, p) => s + p.x, 0) / activeRim.length)
    : (attacksLeft ? 75 : 865);

  const W = 400, H = 455;
  const tW = 'rgba(255,255,255,0.35)';
  const tD = 'rgba(255,255,255,0.20)';
  const bX = 200, bY = 415, pL = 148, pR = 252, pT = 265, ftY = 265, ftR = 52;
  // 3pt ellipse: rx=167 (lateral), ry=213 (depth) centered at basket (bX, bY).
  // Derived from transform scale: 20.75ft * 1.025px/unit ≈ 213px vertical; 22ft * 0.76 ≈ 167px lateral.
  const arc3L = bX - 167, arc3R = bX + 167, arc3T = bY - 213; // 33, 367, 202

  // Range colors
  const rangeColor = { rim: 'rgba(34,197,94,0.9)', jumper: 'rgba(99,179,237,0.9)', three_pointer: 'rgba(251,146,60,0.9)' };
  const rangeMissColor = { rim: 'rgba(34,197,94,0.4)', jumper: 'rgba(99,179,237,0.4)', three_pointer: 'rgba(251,146,60,0.4)' };

  let dots = '';
  normShots.forEach(shot => {
    if (shot.range === 'free_throw') return;
    const { x, y } = _thShotToSVG(shot, attacksLeft, basketX);
    if (x < 0 || x > W || y < -20 || y > H + 20) return; // outside visible area
    const c  = shot.made ? (rangeColor[shot.range] || 'rgba(200,200,200,0.8)') : (rangeMissColor[shot.range] || 'rgba(200,200,200,0.35)');
    const da = `class="shot-dot" data-player="${_escAttr(shot.shooter)}" data-zone="${shot.range}" data-made="${shot.made?'1':'0'}" data-period="${shot.period||''}" data-clock="${_escAttr(shot.clock||'')}"`;
    if (shot.made) {
      dots += `<g ${da}>`
             + `<circle cx="${x}" cy="${y}" r="7" fill="rgba(0,0,0,0)" stroke="none" pointer-events="all"/>`
             + `<circle cx="${x}" cy="${y}" r="4.5" fill="${c}" stroke="rgba(0,0,0,0.4)" stroke-width="0.8"/>`
             + `</g>`;
    } else {
      const d  = 4;
      dots += `<g ${da}>`
             + `<rect x="${x-8}" y="${y-8}" width="16" height="16" fill="rgba(0,0,0,0)" stroke="none" pointer-events="all"/>`
             + `<line x1="${x-d}" y1="${y-d}" x2="${x+d}" y2="${y+d}" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`
             + `<line x1="${x+d}" y1="${y-d}" x2="${x-d}" y2="${y+d}" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`
             + `</g>`;
    }
  });

  // Build zone stats for labels
  const zoneStats = {};
  normShots.forEach(s => {
    if (s.range === 'free_throw') return;
    if (!zoneStats[s.range]) zoneStats[s.range] = { made: 0, att: 0 };
    zoneStats[s.range].att++;
    if (s.made) zoneStats[s.range].made++;
  });
  const totalFGA = Object.values(zoneStats).reduce((s, z) => s + z.att, 0) || 1;

  const zoneLbl = (range, cx, cy) => {
    const z = zoneStats[range];
    if (!z || z.att === 0) return '';
    const pct = Math.round(z.made / z.att * 100);
    const vol = Math.round(z.att / totalFGA * 100);
    return `<text x="${cx}" y="${cy}" text-anchor="middle" font-family="inherit" font-size="11" font-weight="700" fill="${rangeColor[range]||'#fff'}">${pct}% <tspan font-size="8.5" fill="${tD}" font-weight="400">${z.made}/${z.att} · ${vol}%</tspan></text>`;
  };

  const ftZ = zoneStats['free_throw'];
  const ftStats = normShots.filter(s => s.range === 'free_throw');
  const ftMade = ftStats.filter(s => s.made).length;
  const ftAtt  = ftStats.length;

  return `<div class="thShotWrap">
    <div class="thShotTitle" style="color:${color}">${teamName}</div>
    <div class="thShotFilterHint">Click a make (●) or miss (✕) to filter · click court to reset</div>
    <svg class="shot-chart-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;max-width:340px;display:block;margin:0 auto;border-radius:10px;cursor:pointer">
      <rect width="${W}" height="${H}" fill="#080f1e"/>
      <rect x="10" y="10" width="380" height="430" rx="3" fill="#0d1b32"/>
      <rect x="10" y="10" width="380" height="430" rx="3" fill="none" stroke="${tW}" stroke-width="1.5"/>
      <rect x="${pL}" y="${pT}" width="${pR-pL}" height="${440-pT}" fill="none" stroke="${tW}" stroke-width="1.5"/>
      <path d="M ${pL} ${ftY} A ${ftR} ${ftR} 0 0 0 ${pR} ${ftY}" fill="none" stroke="${tW}" stroke-width="1.5" stroke-dasharray="4 4"/>
      <path d="M ${pL} ${ftY} A ${ftR} ${ftR} 0 0 1 ${pR} ${ftY}" fill="none" stroke="${tW}" stroke-width="1.5"/>
      <circle cx="${bX}" cy="${bY}" r="28" fill="none" stroke="${tW}" stroke-width="1.5"/>
      <line x1="${arc3L}" y1="440" x2="${arc3L}" y2="${bY}" stroke="${tW}" stroke-width="1.5"/>
      <line x1="${arc3R}" y1="440" x2="${arc3R}" y2="${bY}" stroke="${tW}" stroke-width="1.5"/>
      <path d="M ${arc3L} ${bY} A 167 213 0 0 1 ${bX} ${arc3T} A 167 213 0 0 1 ${arc3R} ${bY}" fill="none" stroke="${tW}" stroke-width="1.5"/>
      <line x1="${bX-20}" y1="${bY-28}" x2="${bX+20}" y2="${bY-28}" stroke="rgba(255,175,40,0.85)" stroke-width="2.5"/>
      <circle cx="${bX}" cy="${bY}" r="12" fill="none" stroke="rgba(255,175,40,0.85)" stroke-width="2.5"/>
      ${dots}
      ${zoneLbl('three_pointer', 200, 148)}
      ${zoneLbl('jumper', 110, 310)}
      ${zoneLbl('rim', 200, 438)}
    </svg>
    <div class="thShotStats">
      <span class="thShotStat" style="color:rgba(34,197,94,0.9)">● Rim ${zoneStats.rim ? Math.round(zoneStats.rim.made/zoneStats.rim.att*100)+'%' : '—'}</span>
      <span class="thShotStat" style="color:rgba(99,179,237,0.9)">● Mid ${zoneStats.jumper ? Math.round(zoneStats.jumper.made/zoneStats.jumper.att*100)+'%' : '—'}</span>
      <span class="thShotStat" style="color:rgba(251,146,60,0.9)">● 3PT ${zoneStats.three_pointer ? Math.round(zoneStats.three_pointer.made/zoneStats.three_pointer.att*100)+'%' : '—'}</span>
      ${ftAtt > 0 ? `<span class="thShotStat" style="color:rgba(200,180,255,0.9)">FT ${Math.round(ftMade/ftAtt*100)}%</span>` : ''}
    </div>
  </div>`;
}

// ── thInitShotTooltips — hover tooltip for shot chart dots ───────────────────
function thInitShotTooltips(containerId) {
  const container = document.getElementById(containerId);
  const tooltip   = document.getElementById('pShotTooltip');
  if (!container || !tooltip) return;
  const zl = { rim: 'At Rim', jumper: 'Mid-Range', three_pointer: '3-Pointer', free_throw: 'Free Throw' };

  container.addEventListener('mouseover', function(e) {
    const dot = e.target.closest && e.target.closest('.shot-dot');
    if (!dot) { tooltip.style.display = 'none'; return; }
    const pl  = dot.getAttribute('data-player') || 'Unknown';
    const zn  = zl[dot.getAttribute('data-zone')] || (dot.getAttribute('data-zone') || '');
    const mk  = dot.getAttribute('data-made') === '1';
    const per = dot.getAttribute('data-period');
    const clk = dot.getAttribute('data-clock');
    tooltip.innerHTML =
      `<div style="font-size:12px;font-weight:700;color:#e2e8f0">${pl}</div>` +
      `<div style="font-size:11px;margin-top:3px;color:${mk?'rgba(34,197,94,.9)':'rgba(239,68,68,.85)'}">${mk?'✓ Made':'✗ Missed'} · ${zn}</div>` +
      ((per || clk) ? `<div style="font-size:10px;color:rgba(150,170,200,.65);margin-top:2px">Period ${per||'—'} · ${clk||''}</div>` : '');
    tooltip.style.display = 'block';
  });
  container.addEventListener('mousemove', function(e) {
    const dot = e.target.closest && e.target.closest('.shot-dot');
    if (!dot) { tooltip.style.display = 'none'; return; }
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top  = (e.clientY - 44)  + 'px';
  });
  container.addEventListener('mouseleave', function() {
    tooltip.style.display = 'none';
  });
}

// ── thInitShotFilter — click makes/misses to dim the other group ─────────────
function thInitShotFilter(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('svg.shot-chart-svg').forEach(function(svgEl) {
    svgEl.addEventListener('click', function(e) {
      const dot = e.target.closest && e.target.closest('.shot-dot');
      if (!dot) {
        svgEl.removeAttribute('data-filter');
        return;
      }
      const want = dot.getAttribute('data-made') === '1' ? 'makes' : 'misses';
      if (svgEl.getAttribute('data-filter') === want) svgEl.removeAttribute('data-filter');
      else svgEl.setAttribute('data-filter', want);
    });
  });
}

// ── thInitShotChart — init both tooltip + filter for a container ─────────────
function thInitShotChart(containerId) {
  thInitShotTooltips(containerId);
  thInitShotFilter(containerId);
}

// ── Recent tournament context — latest game PBP snapshot per team ───────────
async function _thLoadRecentTournamentTeamCtx(teamName, season) {
  if (!teamName) return null;
  const gamesData = typeof loadGamesForTeam === 'function'
    ? await loadGamesForTeam(teamName, season)
    : null;
  const games = (gamesData && gamesData.games) ? gamesData.games : [];
  if (!games.length) return null;

  const tn = (teamName || '').toLowerCase();
  const todayIso = new Date().toISOString().slice(0, 10);

  const candidates = games
    .filter(g => {
      const hn = (g.homeTeam || '').toLowerCase();
      const an = (g.awayTeam || '').toLowerCase();
      const involvesTeam = hn === tn || an === tn;
      if (!involvesTeam) return false;
      const isFinal = (g.status || '').toLowerCase() === 'final';
      const isTournament = g.gameType === 'TRNMNT' || /championship|tournament|nit|ncaa/i.test(String(g.gameNotes || g.tournament || ''));
      return isFinal && isTournament;
    })
    .sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));

  if (!candidates.length) return null;

  const selected = candidates.find(g => String(g.startDate || '').slice(0, 10) === todayIso) || candidates[0];
  if (!selected || !selected.id) return null;

  const allShots = typeof loadPlaysForGame === 'function'
    ? await loadPlaysForGame(selected.id)
    : [];
  const shots = (allShots || []).filter(s => (s.team || '').toLowerCase() === tn);
  const fgaShots = shots.filter(s => s.range !== 'free_throw');
  const madeFga = fgaShots.filter(s => !!s.made).length;

  function zoneAgg(range) {
    const z = fgaShots.filter(s => s.range === range);
    const made = z.filter(s => !!s.made).length;
    const att = z.length;
    return { made, att, pct: att ? Math.round(made / att * 100) : null };
  }

  const isHome = (selected.homeTeam || '').toLowerCase() === tn;
  const ptsFor = isHome ? selected.homePoints : selected.awayPoints;
  const ptsAgainst = isHome ? selected.awayPoints : selected.homePoints;
  const opp = isHome ? (selected.awayTeam || '') : (selected.homeTeam || '');

  return {
    team: teamName,
    gameId: selected.id,
    date: selected.startDate || null,
    opponent: opp,
    gameType: selected.gameType || null,
    tournament: selected.tournament || null,
    gameNotes: selected.gameNotes || null,
    score: {
      for: ptsFor != null ? +ptsFor : null,
      against: ptsAgainst != null ? +ptsAgainst : null,
    },
    shotProfile: {
      fga: fgaShots.length,
      fgm: madeFga,
      fgPct: fgaShots.length ? +((madeFga / fgaShots.length) * 100).toFixed(1) : null,
      fta: shots.filter(s => s.range === 'free_throw').length,
      rim: zoneAgg('rim'),
      jumper: zoneAgg('jumper'),
      three_pointer: zoneAgg('three_pointer'),
    },
  };
}

async function _thLoadRecentTournamentCtx(teamA, teamB, season) {
  const [ctxA, ctxB] = await Promise.all([
    _thLoadRecentTournamentTeamCtx(teamA, season).catch(() => null),
    _thLoadRecentTournamentTeamCtx(teamB, season).catch(() => null),
  ]);
  return {
    asOf: new Date().toISOString(),
    [teamA]: ctxA,
    [teamB]: ctxB,
  };
}

async function _thLoadTournamentIntelTeamCtx(teamName, season) {
  if (!teamName) return null;
  const cacheKey = (teamName + ':' + season).toLowerCase();
  if (_thTeamIntelCache[cacheKey]) return _thTeamIntelCache[cacheKey];

  const gamesData = typeof loadGamesForTeam === 'function'
    ? await loadGamesForTeam(teamName, season)
    : null;
  const games = (gamesData && gamesData.games) ? gamesData.games : [];
  if (!games.length) return null;

  const tn = (teamName || '').toLowerCase();
  const seasonGames = games
    .filter(g => {
      const hn = (g.homeTeam || '').toLowerCase();
      const an = (g.awayTeam || '').toLowerCase();
      return (hn === tn || an === tn) && (g.status || '').toLowerCase() === 'final';
    })
    .sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));

  if (!seasonGames.length) return null;

  const trnGames = seasonGames
    .filter(g => g.gameType === 'TRNMNT' || /championship|tournament|nit|ncaa/i.test(String(g.gameNotes || g.tournament || '')))
    .slice(0, 8);

  const macRecentGames = seasonGames
    .filter(g => g.gameType === 'TRNMNT' && /MAC Championship/i.test(String(g.gameNotes || '')) && /Quarterfinal|Semifinal/i.test(String(g.gameNotes || '')))
    .sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));

  const playsBundles = await Promise.all(seasonGames.map(async g => {
    const plays = (typeof loadPlaysForGame === 'function' ? await loadPlaysForGame(g.id).catch(() => []) : []);
    const teamPlays = (plays || []).filter(p => (p.team || '').toLowerCase() === tn);
    const oppPlays = (plays || []).filter(p => (p.team || '').toLowerCase() !== tn);
    return { game: g, plays: plays || [], teamPlays, oppPlays };
  }));

  const seasonTeamPlays = playsBundles.flatMap(b => b.teamPlays || []);
  const seasonOppPlays = playsBundles.flatMap(b => b.oppPlays || []);
  const macRecentBundles = playsBundles.filter(b => macRecentGames.some(g => g.id === b.game.id));
  const macRecentTeamPlays = macRecentBundles.flatMap(b => b.teamPlays || []);

  function zoneAgg(shots, range) {
    const z = shots.filter(s => s.range === range);
    const made = z.filter(s => !!s.made).length;
    const att = z.length;
    const miss = att - made;
    return { made, att, miss, pct: att ? Math.round(made / att * 100) : null, missPct: att ? Math.round(miss / att * 100) : null };
  }

  function summarizeShotSet(teamShots) {
    const fgaShots = (teamShots || []).filter(s => s.range !== 'free_throw');
    const madeFga = fgaShots.filter(s => !!s.made).length;
    const total = fgaShots.length || 1;
    const rim = zoneAgg(fgaShots, 'rim');
    const jumper = zoneAgg(fgaShots, 'jumper');
    const three = zoneAgg(fgaShots, 'three_pointer');
    const zones = [
      { zone: 'rim', label: 'At Rim', ...rim, missShare: rim.miss ? Math.round(rim.miss / total * 100) : 0 },
      { zone: 'jumper', label: 'Mid-Range', ...jumper, missShare: jumper.miss ? Math.round(jumper.miss / total * 100) : 0 },
      { zone: 'three_pointer', label: '3PT', ...three, missShare: three.miss ? Math.round(three.miss / total * 100) : 0 },
    ];
    const byMissVolume = zones.slice().sort((a, b) => (b.miss || 0) - (a.miss || 0));
    const byMissRate = zones.slice().filter(z => (z.att || 0) >= 8).sort((a, b) => (b.missPct || 0) - (a.missPct || 0));
    return {
      fga: fgaShots.length,
      fgm: madeFga,
      fgPct: fgaShots.length ? +((madeFga / fgaShots.length) * 100).toFixed(1) : null,
      fta: (teamShots || []).filter(s => s.range === 'free_throw').length,
      zones: { rim, jumper, three_pointer: three },
      missHotspots: {
        byVolume: byMissVolume,
        byRate: byMissRate,
        primaryMissZone: byMissVolume[0] || null,
      },
    };
  }

  function estPts(play) {
    if (!play || !play.made) return 0;
    if (play.range === 'free_throw') return 1;
    if (play.range === 'three_pointer') return 3;
    return 2;
  }

  function clockPhase(period, clock) {
    const p = parseInt(period, 10) || 0;
    if (p >= 3) return 'OT';
    const parts = String(clock || '').split(':');
    const mm = parseInt(parts[0], 10);
    const rem = Number.isFinite(mm) ? mm : 0;
    if (p === 1) {
      if (rem > 12) return 'H1-Start';
      if (rem > 8) return 'H1-Mid';
      if (rem > 4) return 'H1-Late';
      return 'H1-Close';
    }
    if (p === 2) {
      if (rem > 12) return 'H2-Start';
      if (rem > 8) return 'H2-Mid';
      if (rem > 4) return 'H2-Late';
      return 'H2-Close';
    }
    return 'Other';
  }

  const phaseAgg = {};
  function addPhase(phase, side, pts) {
    if (!phaseAgg[phase]) phaseAgg[phase] = { teamPts: 0, oppPts: 0, teamEvents: 0, oppEvents: 0 };
    if (side === 'team') {
      phaseAgg[phase].teamPts += pts;
      phaseAgg[phase].teamEvents += 1;
    } else {
      phaseAgg[phase].oppPts += pts;
      phaseAgg[phase].oppEvents += 1;
    }
  }
  seasonTeamPlays.forEach(p => addPhase(clockPhase(p.period, p.clock), 'team', estPts(p)));
  seasonOppPlays.forEach(p => addPhase(clockPhase(p.period, p.clock), 'opp', estPts(p)));

  const phaseRows = Object.keys(phaseAgg).map(k => {
    const a = phaseAgg[k];
    return {
      phase: k,
      teamPts: +a.teamPts.toFixed(1),
      oppPts: +a.oppPts.toFixed(1),
      diff: +(a.teamPts - a.oppPts).toFixed(1),
      teamEvents: a.teamEvents,
      oppEvents: a.oppEvents,
    };
  });

  const timeoutWindows = phaseRows
    .filter(r => /^H2-/.test(r.phase) && r.diff >= 3)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 2)
    .map(r => ({
      phase: r.phase,
      avgEdge: r.diff,
      note: teamName + ' tends to swing this segment. If they string together 2+ made shots or a quick 6-0 burst here, call timeout to disrupt pace.',
    }));

  const scoreRows = seasonGames.map(g => {
    const isHome = (g.homeTeam || '').toLowerCase() === tn;
    const bundle = playsBundles.find(b => b.game.id === g.id);
    const playCount = bundle ? (bundle.plays || []).length : 0;
    const teamPts = isHome ? g.homePoints : g.awayPoints;
    const oppPts = isHome ? g.awayPoints : g.homePoints;
    return {
      id: g.id,
      date: g.startDate || null,
      opponent: isHome ? (g.awayTeam || '') : (g.homeTeam || ''),
      for: teamPts,
      against: oppPts,
      note: g.gameNotes || null,
      gameType: g.gameType || null,
      result: teamPts > oppPts ? 'W' : 'L',
      playCount: playCount,
    };
  });

  const wins = scoreRows.filter(r => Number.isFinite(r.for) && Number.isFinite(r.against) && r.for > r.against).length;
  const losses = scoreRows.filter(r => Number.isFinite(r.for) && Number.isFinite(r.against) && r.for < r.against).length;

  const intel = {
    team: teamName,
    season: season,
    seasonGames: seasonGames.length,
    seasonRecord: { wins, losses },
    tournamentGames: trnGames.length,
    recentMacTournamentGames: macRecentGames.map(g => ({
      id: g.id,
      date: g.startDate || null,
      note: g.gameNotes || null,
      opponent: ((g.homeTeam || '').toLowerCase() === tn) ? (g.awayTeam || '') : (g.homeTeam || ''),
    })),
    gameResults: scoreRows,
    seasonShotChartProfile: summarizeShotSet(seasonTeamPlays),
    recentTournamentShotChartProfile: summarizeShotSet(macRecentTeamPlays),
    phaseTrends: phaseRows,
    timeoutGuidance: {
      recommendedWhen: timeoutWindows,
      baselineRule: 'Use early timeout if ' + teamName + ' creates a 6-0 run or 3 made scoring events in ~2 minutes, especially in H2-Late/H2-Close.',
    },
    pbpCoverage: {
      withPlays: playsBundles.filter(b => (b.plays || []).length > 0).length,
      totalGames: playsBundles.length,
    },
  };

  _thTeamIntelCache[cacheKey] = intel;
  return intel;
}

async function _thLoadTournamentIntelCtx(teamA, teamB, season) {
  const [ctxA, ctxB] = await Promise.all([
    _thLoadTournamentIntelTeamCtx(teamA, season).catch(() => null),
    _thLoadTournamentIntelTeamCtx(teamB, season).catch(() => null),
  ]);
  return {
    asOf: new Date().toISOString(),
    [teamA]: ctxA,
    [teamB]: ctxB,
  };
}

async function _thLoadDeepShotIntelForTeam(teamName, season) {
  if (!teamName) return null;
  const gamesData = typeof loadGamesForTeam === 'function'
    ? await loadGamesForTeam(teamName, season)
    : null;
  const games = (gamesData && gamesData.games) ? gamesData.games : [];
  if (!games.length) return null;

  const tn = (teamName || '').toLowerCase();
  const finalGames = games.filter(g => {
    const hn = (g.homeTeam || '').toLowerCase();
    const an = (g.awayTeam || '').toLowerCase();
    return (hn === tn || an === tn) && (g.status || '').toLowerCase() === 'final';
  });

  const macTournamentGames = finalGames.filter(g =>
    g.gameType === 'TRNMNT' && /MAC Championship/i.test(String(g.gameNotes || ''))
  );

  const postSeasonGames = macTournamentGames.length
    ? macTournamentGames
    : finalGames.filter(g => g.gameType === 'TRNMNT');

  async function collectShots(gameList) {
    const bundles = await Promise.all(gameList.map(async g => {
      const plays = (typeof loadPlaysForGame === 'function'
        ? await loadPlaysForGame(g.id).catch(() => [])
        : []);
      return (plays || []).filter(p => (p.team || '').toLowerCase() === tn);
    }));
    return bundles.flat();
  }

  const seasonShots = await collectShots(finalGames);
  const postSeasonShots = await collectShots(postSeasonGames);

  return {
    team: teamName,
    season: season,
    seasonGames: finalGames.length,
    postSeasonGames: postSeasonGames.length,
    seasonShots: seasonShots,
    postSeasonShots: postSeasonShots,
  };
}

function _thBuildDeepShotReportHTML(aName, bName) {
  var parts = [];

  var shotIntel = _thDeepShotIntelCtx;
  if (shotIntel && (shotIntel.team || '').toLowerCase() === (bName || '').toLowerCase()) {
    parts.push(
      '<div class="thMCSection">' +
        '<div class="thMCSectionHead">📈 ' + bName + ' Shot Chart — Regular Season</div>' +
        '<div style="padding:8px 12px;font-size:10px;color:var(--muted)">Aggregated from ' + (shotIntel.seasonGames || 0) + ' final games.</div>' +
        '<div class="thShotChartsRow">' +
          _th_buildShotChartSVG(shotIntel.seasonShots || [], bName + ' regular season', 'var(--warn)') +
        '</div>' +
      '</div>'
    );

    parts.push(
      '<div class="thMCSection">' +
        '<div class="thMCSectionHead">🏆 ' + bName + ' Shot Chart — Tournament</div>' +
        '<div style="padding:8px 12px;font-size:10px;color:var(--muted)">Aggregated from ' + (shotIntel.postSeasonGames || 0) + ' tournament games.</div>' +
        '<div class="thShotChartsRow">' +
          _th_buildShotChartSVG(shotIntel.postSeasonShots || [], bName + ' tournament', 'var(--warn)') +
        '</div>' +
      '</div>'
    );
  }

  if (!parts.length) return '';
  return '<div class="thDeepCharts">' + parts.join('') + '</div>';
}

// ── thRenderMatchup — shot chart + zone breakdown for head-to-head games ──────
function thRenderMatchup(teamA, teamB, allShots, gamesPlayed, boxScores, mode) {
  mode = mode || 'season';
  const el = document.getElementById('thMatchup');
  if (!el) return;
  if (!teamA || !teamB) {
    el.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Load a primary team, then select an opponent and click Compare →</div>';
    return;
  }
  const shotsA = allShots.filter(s => (s.team||'').toLowerCase() === (teamA||'').toLowerCase());
  const shotsB = allShots.filter(s => (s.team||'').toLowerCase() === (teamB||'').toLowerCase());

  if (!allShots.length) {
    _thLastMatchupCtx = null;
    _thLastMatchupShots = null;
    el.innerHTML = `<div class="muted" style="padding:24px;text-align:center">No play-by-play data found for ${teamA} vs ${teamB} this season.</div>`;
    return;
  }

  _thLastMatchupShots = {
    teamA: teamA,
    teamB: teamB,
    mode: mode,
    gamesPlayed: gamesPlayed,
    shotsA: shotsA,
    shotsB: shotsB,
  };

  // Per-zone accuracy comparison
  const zones = ['rim', 'jumper', 'three_pointer'];
  const zoneLabel = { rim: 'At Rim', jumper: 'Mid-Range', three_pointer: '3-Pointers' };

  function zoneAgg(shots, range) {
    const z = shots.filter(s => s.range === range);
    const made = z.filter(s => s.made).length;
    const att  = z.length;
    const total = shots.filter(s => s.range !== 'free_throw').length || 1;
    return { made, att, pct: att ? Math.round(made/att*100) : null, vol: Math.round(att/total*100) };
  }

  // Box score aggregates across all matchup games
  let bsApts = 0, bsBpts = 0, bsAg = 0;
  (boxScores || []).forEach(g => {
    bsApts += (g.ptsA || 0);
    bsBpts += (g.ptsB || 0);
    bsAg++;
  });
  const avgPtsA = bsAg ? (bsApts/bsAg).toFixed(1) : null;
  const avgPtsB = bsAg ? (bsBpts/bsAg).toFixed(1) : null;

  // Auto-generate matchup insights
  const insights = [];
  const aRim = zoneAgg(shotsA, 'rim');
  const bRim = zoneAgg(shotsB, 'rim');
  const a3   = zoneAgg(shotsA, 'three_pointer');
  const b3   = zoneAgg(shotsB, 'three_pointer');
  const aMid = zoneAgg(shotsA, 'jumper');
  const bMid = zoneAgg(shotsB, 'jumper');
  const aFT  = shotsA.filter(s => s.range === 'free_throw');
  const bFT  = shotsB.filter(s => s.range === 'free_throw');

  if (bRim.vol >= 40 && bRim.pct != null) {
    if (bRim.pct >= 65) insights.push({ side: teamB, type: 'danger', text: `${teamB} attacks the rim aggressively (${bRim.vol}% of shots) and finishes well at ${bRim.pct}% — they exploit interior defense.` });
    else if (bRim.pct <= 50) insights.push({ side: teamA, type: 'strength', text: `${teamA} holds ${teamB} to only ${bRim.pct}% at the rim despite frequent attempts (${bRim.vol}% vol) — strong interior defense in this matchup.` });
  }
  if (b3.vol >= 40 && b3.pct != null) {
    if (b3.pct >= 38) insights.push({ side: teamB, type: 'danger', text: `${teamB} leans on the 3 (${b3.vol}% of FGA) and shoots it well at ${b3.pct}% in this matchup — close out early.` });
    else if (b3.pct <= 28) insights.push({ side: teamA, type: 'strength', text: `${teamA} forces ${teamB} into a lot of 3s (${b3.vol}% vol) and limits them to ${b3.pct}% — good perimeter pressure.` });
  }
  if (aRim.pct != null && aRim.vol >= 30) {
    if (aRim.pct >= 65) insights.push({ side: teamA, type: 'strength', text: `${teamA} is effective at the rim vs ${teamB} — ${aRim.pct}% on ${aRim.vol}% rim share. Attack the paint.` });
    else if (aRim.pct <= 45) insights.push({ side: teamB, type: 'danger', text: `${teamB} shuts down ${teamA} at the rim in this matchup — only ${aRim.pct}% despite ${aRim.vol}% rim attempts. May need to adjust.` });
  }
  if (a3.pct != null && a3.vol >= 30) {
    if (a3.pct >= 38) insights.push({ side: teamA, type: 'strength', text: `${teamA} shoots the 3 well vs ${teamB} — ${a3.pct}% on ${a3.vol}% three-point share. This is an exploitable matchup advantage.` });
    else if (a3.pct <= 25) insights.push({ side: teamB, type: 'danger', text: `${teamA} struggles from 3 vs ${teamB} — only ${a3.pct}% on heavy volume (${a3.vol}%). ${teamB} limits 3PT effectiveness.` });
  }
  if (aMid.pct != null && bMid.pct != null) {
    if (aMid.pct - bMid.pct >= 15) insights.push({ side: teamA, type: 'strength', text: `${teamA} shoots mid-range shots far better in this matchup (${aMid.pct}% vs ${teamB}'s ${bMid.pct}%) — a clear jump-shooting edge.` });
    else if (bMid.pct - aMid.pct >= 15) insights.push({ side: teamB, type: 'danger', text: `${teamB} outperforms ${teamA} in the mid-range (${bMid.pct}% vs ${aMid.pct}%) — watch for pull-up jumpers.` });
  }
  if (avgPtsA && avgPtsB) {
    const diff = parseFloat(avgPtsA) - parseFloat(avgPtsB);
    if (Math.abs(diff) >= 8) {
      if (diff > 0) insights.push({ side: teamA, type: 'strength', text: `${teamA} outscores ${teamB} by +${diff.toFixed(1)} pts/game in this head-to-head — a dominant offensive edge.` });
      else insights.push({ side: teamB, type: 'danger', text: `${teamB} outscores ${teamA} by +${Math.abs(diff).toFixed(1)} pts/game in this matchup.` });
    }
  }

  const insightHtml = insights.length
    ? insights.map(i => `<div class="thInsight thInsight--${i.type==='strength'?'strength':'weakness'}">
        <span class="thInsIcon">${i.type==='strength'?'✅':'⚠️'}</span>
        <span>${i.text}</span>
      </div>`).join('')
    : '<div class="muted" style="padding:8px 0">Limited data — play more games to see deeper analysis.</div>';

  // Zone table
  const zoneRowHtml = zones.map(z => {
    const zA = zoneAgg(shotsA, z);
    const zB = zoneAgg(shotsB, z);
    const fmtZ = (zs) => zs.att === 0 ? '—' : `${zs.pct}% · ${zs.made}/${zs.att} (${zs.vol}%)`;
    const aWins = zA.pct != null && zB.pct != null && zA.pct > zB.pct;
    const bWins = zA.pct != null && zB.pct != null && zB.pct > zA.pct;
    return `<div class="thZoneRow">
      <div class="thZoneVal${aWins?' thZoneWin':''}">${fmtZ(zA)}</div>
      <div class="thZoneLbl">${zoneLabel[z]}</div>
      <div class="thZoneVal${bWins?' thZoneWin':''}">${fmtZ(zB)}</div>
    </div>`;
  }).join('');

  const modeSubtitle = mode === 'history'
    ? `${gamesPlayed} most recent game${gamesPlayed!==1?'s':''} (multi-season)`
    : `${gamesPlayed} game${gamesPlayed!==1?'s':''} this season`;

  _thLastMatchupCtx = {
    gamesPlayed,
    mode,
    avgScore: {
      [teamA]: avgPtsA != null ? +avgPtsA : null,
      [teamB]: avgPtsB != null ? +avgPtsB : null,
    },
    shotVolume: {
      [teamA]: { fga: shotsA.filter(s => s.range !== 'free_throw').length, fta: shotsA.filter(s => s.range === 'free_throw').length },
      [teamB]: { fga: shotsB.filter(s => s.range !== 'free_throw').length, fta: shotsB.filter(s => s.range === 'free_throw').length },
    },
    zones: {
      rim: { [teamA]: zoneAgg(shotsA, 'rim'), [teamB]: zoneAgg(shotsB, 'rim') },
      jumper: { [teamA]: zoneAgg(shotsA, 'jumper'), [teamB]: zoneAgg(shotsB, 'jumper') },
      three_pointer: { [teamA]: zoneAgg(shotsA, 'three_pointer'), [teamB]: zoneAgg(shotsB, 'three_pointer') },
    },
  };

  el.innerHTML = `
    <div class="thMatchupToggleRow">
      <button class="thMatchupToggleBtn${mode==='season'?' active':''}" onclick="thLoadMatchup('${teamB.replace(/'/g,"\\'")}','season')">This Season</button>
      <button class="thMatchupToggleBtn${mode==='history'?' active':''}" onclick="thLoadMatchup('${teamB.replace(/'/g,"\\'")}','history')">Last 5 Matchups</button>
    </div>
    <div class="thMatchupHeader">
      <div class="thMatchupTeam" style="color:var(--accent)">${teamA}</div>
      <div class="thMatchupVs">${modeSubtitle}</div>
      <div class="thMatchupTeam" style="color:var(--warn)">${teamB}</div>
    </div>
    ${avgPtsA ? `<div class="thMatchupScore"><span style="color:var(--accent)">${avgPtsA} ppg</span> <span class="muted" style="font-size:11px">avg score</span> <span style="color:var(--warn)">${avgPtsB} ppg</span></div>` : ''}
    <div class="thShotChartsRow">
      ${_th_buildShotChartSVG(shotsA, teamA + ' offense', 'var(--accent)')}
      ${_th_buildShotChartSVG(shotsB, teamB + ' offense', 'var(--warn)')}
    </div>
    <div class="thZoneTable">
      <div class="thZoneHead">
        <span style="color:var(--accent)">${teamA}</span>
        <span>Zone</span>
        <span style="color:var(--warn)">${teamB}</span>
      </div>
      ${zoneRowHtml}
      <div class="thZoneNote">pct · made/att · (% of FGA)</div>
    </div>
    <div class="thDNAInsights" style="margin-top:16px">
      <div class="thDeepAnalysisRow">
        <div class="thDNASectionLabel" style="margin:0">🎯 Matchup Insights</div>
        <div class="thDeepControls">
          <div class="leagueSwitch" style="gap:6px${_thIsGuest() ? ';opacity:.45;pointer-events:none' : ''}">
            <span class="lsLabel${(_thDeepUseHeavyModel && !_thIsGuest()) ? '' : ' active'}" id="thModelLblLite" style="font-size:10.5px">⚡ 2.5 Lite</span>
            <label class="lsTrackWrap">
              <input type="checkbox" id="thModelSwitchInput"${(_thDeepUseHeavyModel && !_thIsGuest()) ? ' checked' : ''}${_thIsGuest() ? ' disabled' : ''}>
              <span class="lsTrack"></span>
            </label>
            <span class="lsLabel${(_thDeepUseHeavyModel && !_thIsGuest()) ? ' active' : ''}" id="thModelLblHeavy" style="font-size:10.5px">🧠 Pro${_thIsGuest() ? ' 🔒' : ''}</span>
          </div>
          <button class="thDeepBtn" onclick="thRunDeepAnalysis()"${(_thIsGuest() && _thGuestDACount() >= _TH_GUEST_DA_LIMIT) ? ' disabled' : ''}>${(_thIsGuest() && _thGuestDACount() >= _TH_GUEST_DA_LIMIT) ? '🔒 Limit Reached' : '🧠 Deep Analysis' + (_thIsGuest() ? ' (' + (_TH_GUEST_DA_LIMIT - _thGuestDACount()) + '/' + _TH_GUEST_DA_LIMIT + ')' : '')}</button>
          <span id="thDeepAnalysisStatus" style="font-size:10px;color:var(--muted);white-space:nowrap"></span>
        </div>
      </div>
      <div class="thInsightsGrid">${insightHtml}</div>
    </div>
    <div class="thMonteCarloRow">
      <div class="thDNASectionLabel" style="margin:0">🎲 Monte Carlo Simulation</div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <select id="thMCRunCount" class="thMCSelect" title="Number of simulations">
          <option value="10000" selected>10,000 runs</option>
          <option value="50000">50,000 runs</option>
          <option value="100000">100,000 runs</option>
        </select>
        <button id="thMonteCarloBtn" class="thDeepBtn" style="background:rgba(124,58,237,.14)" onclick="thRunMonteCarloUI()">🎲 Run Simulation</button>
      </div>
    </div>
    <div class="thMCAdvancedRow">
      <button class="thMCAdvToggle" onclick="this.parentElement.classList.toggle('open');this.textContent=this.parentElement.classList.contains('open')?'▾ Advanced':'▸ Advanced'">▸ Advanced</button>
      <div class="thMCAdvPanel">
        <div class="thMCAdvGroup">
          <label class="thMCAdvLabel" title="Game-to-game scoring volatility for ${teamA}. Higher = more unpredictable.">${teamA} Volatility (SD)
            <input type="range" id="thMCSdA" min="5" max="20" step="0.5" value="11" oninput="document.getElementById('thMCSdAVal').textContent=this.value">
            <span id="thMCSdAVal" class="thMCAdvVal">11</span>
          </label>
          <label class="thMCAdvLabel" title="Game-to-game scoring volatility for ${teamB}. Higher = more unpredictable.">${teamB} Volatility (SD)
            <input type="range" id="thMCSdB" min="5" max="20" step="0.5" value="11" oninput="document.getElementById('thMCSdBVal').textContent=this.value">
            <span id="thMCSdBVal" class="thMCAdvVal">11</span>
          </label>
          <label class="thMCAdvLabel" title="How much the two teams' scoring is linked. 0 = independent, 1 = fully correlated (both go up/down together).">Score Correlation (ρ)
            <input type="range" id="thMCRho" min="0" max="0.8" step="0.05" value="0" oninput="document.getElementById('thMCRhoVal').textContent=(+this.value).toFixed(2)">
            <span id="thMCRhoVal" class="thMCAdvVal">0.00</span>
          </label>
        </div>
        <div class="thMCAdvHint">Volatility = how many pts a team's score varies game-to-game (default 11). Correlation = shared game factors (tempo, refs) that push both scores up/down together.</div>
      </div>
    </div>
    <div id="thMonteCarloOutput" class="thDeepOutput" style="display:none"></div>
    <div id="thDeepOutput" class="thDeepOutput" style="display:none"></div>`;
  // Wire up model toggle checkbox
  setTimeout(function() {
    var cb = document.getElementById('thModelSwitchInput');
    if (cb) cb.addEventListener('change', function() { thSetDeepModel(cb.checked); });
  }, 50);
  setTimeout(() => thInitShotChart('thMatchup'), 50);
}

// ── thLoadMatchup — find games, load play-by-play, render; supports history ───
async function thLoadMatchup(compareTeam, mode) {
  mode = mode || thMatchupMode || 'season';
  thMatchupMode = mode;
  const el = document.getElementById('thMatchup');
  if (!el || !thCurrentTeam || !compareTeam) return;

  let matchupGames = [];

  if (mode === 'season') {
    // Use already-loaded game cache for current season
    const gamesDataCached = typeof teamGamesCache !== 'undefined'
      ? teamGamesCache[(thCurrentTeam + ':' + thCurrentSeason).toLowerCase()]
      : null;
    const allGames = gamesDataCached ? (gamesDataCached.games || []) : [];
    matchupGames = allGames.filter(g => {
      const hn = (g.homeTeam || '').toLowerCase();
      const an = (g.awayTeam || '').toLowerCase();
      const bn = (compareTeam || '').toLowerCase();
      return hn === bn || an === bn;
    });
  } else {
    // History mode: scan last 3 seasons, collect up to 5 most recent matchups
    el.innerHTML = `<div class="muted" style="padding:20px;text-align:center">Loading matchup history across seasons…</div>`;
    const curYear = parseInt(thCurrentSeason, 10) || 2026;
    const seasons = [curYear, curYear - 1, curYear - 2];
    const seasonData = await Promise.all(
      seasons.map(s => loadGamesForTeam(thCurrentTeam, String(s)).catch(() => null))
    );
    seasonData.forEach(data => {
      if (!data) return;
      const found = (data.games || []).filter(g => {
        const hn = (g.homeTeam || '').toLowerCase();
        const an = (g.awayTeam || '').toLowerCase();
        const bn = (compareTeam || '').toLowerCase();
        return hn === bn || an === bn;
      });
      matchupGames.push(...found);
    });
    // Most recent first, cap at 5
    matchupGames.sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));
    matchupGames = matchupGames.slice(0, 5);
  }

  if (!matchupGames.length) {
    el.innerHTML = `<div class="thMatchupToggleRow">
      <button class="thMatchupToggleBtn${mode==='season'?' active':''}" onclick="thLoadMatchup('${compareTeam.replace(/'/g,"\\'")}','season')">This Season</button>
      <button class="thMatchupToggleBtn${mode==='history'?' active':''}" onclick="thLoadMatchup('${compareTeam.replace(/'/g,"\\'")}','history')">Last 5 Matchups</button>
    </div><div class="muted" style="padding:24px;text-align:center">No games found between <b>${thCurrentTeam}</b> and <b>${compareTeam}</b>.</div>`;
    return;
  }

  // Backward-compatible fallback: older in-memory game cache may not include homeTeamId/awayTeamId.
  // For WBB, hydrate missing team ids from /api/wbb/teams so play.teamId can still map to team names.
  if (typeof league !== 'undefined' && league === 'WBB' && matchupGames.some(g => !g.homeTeamId || !g.awayTeamId)) {
    try {
      const tr = await fetch(WORKER_URL + '/api/wbb/teams?season=' + encodeURIComponent(thCurrentSeason)).then(r => r.json());
      const teamsMap = (tr && tr.teams) ? tr.teams : {};
      const nameToId = {};
      Object.keys(teamsMap).forEach(tid => {
        const t = teamsMap[tid] || {};
        [t.location, t.displayName, t.abbreviation, t.name].filter(Boolean).forEach(n => {
          nameToId[String(n).toLowerCase()] = String(tid);
        });
      });
      matchupGames.forEach(g => {
        if (!g.homeTeamId && g.homeTeam) g.homeTeamId = nameToId[String(g.homeTeam).toLowerCase()] || '';
        if (!g.awayTeamId && g.awayTeam) g.awayTeamId = nameToId[String(g.awayTeam).toLowerCase()] || '';
      });
    } catch (_) {}
  }

  el.innerHTML = `<div class="muted" style="padding:20px;text-align:center">Loading play-by-play for ${matchupGames.length} game${matchupGames.length!==1?'s':''}…</div>`;

  const playsArrays = await Promise.all(matchupGames.map(g => loadPlaysForGame(g.id)));
  const allShots = [];
  playsArrays.forEach((arr, idx) => {
    const g = matchupGames[idx] || {};
    const hId = String(g.homeTeamId || '');
    const aId = String(g.awayTeamId || '');
    const hName = g.homeTeam || '';
    const aName = g.awayTeam || '';
    (arr || []).forEach(p => {
      const tid = String(p && p.teamId || '');
      const mappedTeam = tid && hId && aId
        ? (tid === hId ? hName : (tid === aId ? aName : (p.team || '')))
        : (p.team || '');
      allShots.push(Object.assign({}, p, { team: mappedTeam }));
    });
  });

  const boxScores = matchupGames.map(g => {
    const tn = (thCurrentTeam || '').toLowerCase();
    const isHome = (g.homeTeam || '').toLowerCase() === tn;
    return {
      ptsA: isHome ? g.homePoints : g.awayPoints,
      ptsB: isHome ? g.awayPoints : g.homePoints,
    };
  });

  thRenderMatchup(thCurrentTeam, compareTeam, allShots, matchupGames.length, boxScores, mode);
}

// ── thLoadOpponent — load a team's players into the opponent slot ─────────────
function thLoadOpponent(teamName) {
  if (typeof tbGetAllPlayers !== 'function') return;
  const all = tbGetAllPlayers(typeof league !== 'undefined' ? league : 'MBB');
  const teamPlayers = all.filter(p => (p.Team || '').toLowerCase() === (teamName || '').toLowerCase());
  if (!teamPlayers.length) {
    if (typeof showWarn === 'function') showWarn('No players found for ' + teamName + '. Make sure the dataset is loaded.');
    return;
  }
  // Bulk push to opponent roster + refresh once
  if (typeof oppRoster !== 'undefined') {
    oppRoster.length = 0;
    teamPlayers.forEach(p => oppRoster.push(p));
  }
  if (typeof oppRefresh === 'function') oppRefresh();
  if (typeof clearWarn === 'function') clearWarn();

  // Navigate to Team Builder → Opponent tab
  const tbNavBtn  = document.querySelector('.pageNavBtn[data-page="pageTeamBuilder"]');
  const oppSubBtn = document.querySelector('.tbSubBtn[data-sub="tbSubOpponent"]');
  if (tbNavBtn)  tbNavBtn.click();
  setTimeout(() => { if (oppSubBtn) oppSubBtn.click(); }, 80);
}

// ── thLoadTeam — main entry point when Load button clicked ───────────────────
async function thLoadTeam(teamName, season) {
  if (!teamName) return;
  thCurrentTeam   = teamName;
  thCurrentSeason = season || '2026';
  _thCurrentStats = null;
  thCurrentCompareTeam = '';
  _thCompareStats = null;
  _thLastMatchupCtx = null;
  _thLastMatchupShots = null;
  _thRecentTournamentCtx = null;
  _thTournamentIntelCtx = null;
  _thTeamIntelCache = {};
  _thDeepShotIntelCtx = null;
  _thLoading('Loading team data…');

  const teamKey  = (teamName || '').toLowerCase();
  const teamData = teamRatings[teamKey] || null;

  // Show overview immediately while rest loads in parallel
  thRenderOverview(teamData, null, null);
  const loadingEls = [thThreatsEl, thGameLogEl, thH2HEl,
    document.getElementById('thDNA'), document.getElementById('thCompare'),
    document.getElementById('thMatchup'), document.getElementById('thScout')];
  loadingEls.forEach(el => { if (el) el.innerHTML = '<div class="muted" style="padding:16px;text-align:center">Loading…</div>'; });

  // Parallel fetch: games + team stats + team shooting zones
  const [gamesData, statsData, shootingData] = await Promise.all([
    loadGamesForTeam(teamName, thCurrentSeason),
    loadTeamStats(teamName, thCurrentSeason),
    loadTeamShootingZones(teamName, thCurrentSeason),
  ]);
  let wbbStandings = null;
  if (typeof league !== 'undefined' && league === 'WBB') {
    const confName = (teamData && teamData.conference) ? teamData.conference : _thFindWbbConferenceForTeam(teamName);
    wbbStandings = await _thBuildWbbConferenceStandings(confName, thCurrentSeason);
  }
  _thCurrentStats = statsData;
  _thLoading('');

  thRenderOverview(teamData, gamesData, statsData);
  thRenderThreats(teamData, gamesData, wbbStandings);
  thRenderGameLog(teamData, gamesData);
  thRenderH2H(teamData, gamesData);
  thRenderDNA(teamData, statsData, shootingData);
  thRenderTeamScout(teamName, teamData, statsData);
  // Reset compare/matchup to prompt state
  const elCmp = document.getElementById('thCompare');
  const elMxp = document.getElementById('thMatchup');
  if (elCmp) elCmp.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Pick a team in the compare box above →</div>';
  if (elMxp) elMxp.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Load a primary team, then select an opponent and click Compare →</div>';
}

// ── Populate team dropdown ────────────────────────────────────────────────────
function thPopulateTeams() {
  if (!thTeamSearch) return;
  const teams = [...new Set(
    (typeof tbGetAllPlayers === 'function' ? tbGetAllPlayers() : [])
      .map(p => p.Team || '')
      .filter(Boolean)
  )].sort();
  const opts = '<option value="">— Select a team —</option>' +
    teams.map(t => `<option value="${t.replace(/"/g,'&quot;')}">${t}</option>`).join('');
  thTeamSearch.innerHTML = opts;
  // Also populate compare dropdown
  const cmpEl = document.getElementById('thCompareTeam');
  if (cmpEl) cmpEl.innerHTML = '<option value="">— Select opponent team —</option>' +
    teams.map(t => `<option value="${t.replace(/"/g,'&quot;')}">${t}</option>`).join('');
  _thPopulateBracketTeamSelects();
}

// ── Refresh dropdown when player data changes (called from app.js) ────────────
function thRefreshTeamList() {
  thPopulateTeams();
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initTeamsPage() {
  initTeamsDOMRefs();
  thPopulateTeams();
  _thSyncWarRoomLauncher();

  if (thLoadBtn) {
    thLoadBtn.addEventListener('click', () => {
      const team   = thTeamSearch ? thTeamSearch.value   : '';
      const season = thSeasonInput ? thSeasonInput.value : '2026';
      if (!team) { if (typeof showWarn === 'function') showWarn('Please select a team first.'); return; }
      thLoadTeam(team, season);
    });
  }
  if (thValueLabBtn) {
    thValueLabBtn.addEventListener('click', function () {
      var team = thCurrentTeam || (thTeamSearch ? thTeamSearch.value : '');
      if (!team) {
        if (typeof showWarn === 'function') showWarn('Select or load a team first, then open Value Lab.');
        return;
      }
      if (window.ValueLab && typeof window.ValueLab.openActualTeam === 'function') {
        window.ValueLab.openActualTeam(team);
      } else if (typeof showDashboardPage === 'function') {
        showDashboardPage('pageValueLab');
      }
    });
  }

  // Compare button
  const thCompareBtn = document.getElementById('thCompareBtn');
  if (thCompareBtn) {
    thCompareBtn.addEventListener('click', () => thLoadCompare());
  }

  if (thBracketSelectEl) {
    thBracketSelectEl.addEventListener('change', function () {
      _thBracketState.activeId = thBracketSelectEl.value || '';
      _thSaveBracketState();
      _thRenderBracketWorkspace();
    });
  }
  if (thBracketNameEl) {
    thBracketNameEl.addEventListener('change', _thCommitBracketMeta);
  }
  if (thBracketSeasonEl) {
    thBracketSeasonEl.addEventListener('change', _thCommitBracketMeta);
  }
  var newBtn = document.getElementById('thBracketNewBtn');
  if (newBtn) newBtn.addEventListener('click', _thCreateBracket);
  var dupBtn = document.getElementById('thBracketDuplicateBtn');
  if (dupBtn) dupBtn.addEventListener('click', _thDuplicateBracket);
  var delBtn = document.getElementById('thBracketDeleteBtn');
  if (delBtn) delBtn.addEventListener('click', _thDeleteBracket);
  var addBtn = document.getElementById('thBracketAddBtn');
  if (addBtn) addBtn.addEventListener('click', function () {
    _thAddBracketTeam(
      thBracketTeamAddEl ? thBracketTeamAddEl.value : '',
      thBracketSeedAddEl ? thBracketSeedAddEl.value : 1,
      thBracketRegionAddEl ? thBracketRegionAddEl.value : 'South'
    );
  });
  var importBtn = document.getElementById('thBracketImportBtn');
  if (importBtn) importBtn.addEventListener('click', _thImportBracketTeams);
  var build64Btn = document.getElementById('thBracketBuild64Btn');
  if (build64Btn) build64Btn.addEventListener('click', _thBuildEmpty64Bracket);
  var preset2026Btn = document.getElementById('thBracketPreset2026Btn');
  if (preset2026Btn) preset2026Btn.addEventListener('click', _thLoadEspn2026Preset);
  var autofillBtn = document.getElementById('thBracketAutofillSeedsBtn');
  if (autofillBtn) autofillBtn.addEventListener('click', _thAutofillBracketBySeedList);
  var clearTeamsBtn = document.getElementById('thBracketClearTeamsBtn');
  if (clearTeamsBtn) clearTeamsBtn.addEventListener('click', _thClearBracketTeams);
  var simBtn = document.getElementById('thBracketSimBtn');
  if (simBtn) simBtn.addEventListener('click', _thRunBracketSimulation);
  var analyzeBtn = document.getElementById('thBracketAnalyzeBtn');
  if (analyzeBtn) analyzeBtn.addEventListener('click', _thRunBracketAIAnalysis);
  var pdfBtn = document.getElementById('thBracketPdfBtn');
  if (pdfBtn) pdfBtn.addEventListener('click', _thOpenBracketPdfReport);
  var playInCancelBtn = document.getElementById('thBracketPlayInCancelBtn');
  if (playInCancelBtn) playInCancelBtn.addEventListener('click', _thClosePlayInModal);
  var playInSaveBtn = document.getElementById('thBracketPlayInSaveBtn');
  if (playInSaveBtn) playInSaveBtn.addEventListener('click', _thSavePlayInModal);
  if (thBracketPlayInModalEl) {
    thBracketPlayInModalEl.addEventListener('click', function (e) {
      if (e.target === thBracketPlayInModalEl || (e.target && e.target.getAttribute && e.target.getAttribute('data-playin-close') === '1')) {
        _thClosePlayInModal();
      }
    });
  }

  // Allow pressing Enter in team search select (or hitting Enter in season input)
  if (thSeasonInput) {
    thSeasonInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && thLoadBtn) thLoadBtn.click();
    });
  }
}

// ── Class wrapper ─────────────────────────────────────────────────────────────
class TeamHub {
  init()                        { return initTeamsPage(); }
  refreshTeamList()             { return thRefreshTeamList(); }
  loadTeam(name, season)        { return thLoadTeam(name, season); }
  loadOpponent(teamName)        { return thLoadOpponent(teamName); }
  getCurrentTeam()              { return thCurrentTeam; }
  getCurrentSeason()            { return thCurrentSeason; }
  refreshTournamentHub()        { return _thScheduleBracketWorkspaceRender(); }
  refreshTournamentLauncher()   { return _thSyncWarRoomLauncher(); }
}

window.TeamHub = new TeamHub();
