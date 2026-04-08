// ============ DATA MODULE ============
// Dependencies: config.js (clamp, clamp01, safeNum, fmtMoney, scalePct, percentileInc,
//   percentileRank, sheetToJson, sheetToAoa, aoaToObjects, extractSpreadsheetId,
//   SHEET_MAP, DEFAULT_GS_URL, DEFAULT_GS_API_KEY, FIT_PRESETS,
//   GUARD_DEFAULTS, BIG_DEFAULTS, DEFAULT_DIR, CONF_DISPLAY_ORDER,
//   DEFAULT_CONF_VALUES, CONF_ALIASES)

// --- Module-level state vars (global so other modules can access) ---
var wb = null;
var league = 'MBB';
var pos = 'Guards';
var excelWeights = {Guards:[], Bigs:[]};
var currentWeights = {Guards:[], Bigs:[]};
var rows = [];
var computed = [];
var tbAllComputed = {}; // cache: {'MBB_Guards': [...], 'MBB_Bigs': [...], ...}
var statDist = {};      // {stat: {sorted:[...], invert:boolean}}
var sort = { key:'ActualValuation_calc', dir:'desc' };
var baseStatsAll = [];
var lastPerfAvg = NaN, lastPerfStar = NaN;
var leagueRosters = {MBB:{tb:[],opp:[]}, WBB:{tb:[],opp:[]}};
var playerValueView = 'production';
var _projectionScoutOverrideMap = null;
var _projectionScoutOverrideKey = '';
var _projectionScoutTarget = null;
var _projectionScoutModalBound = false;
var _projectionScoutOverrideVersion = 0;

try {
  var _savedPlayerValueView = localStorage.getItem('players_value_view_v1');
  if (_savedPlayerValueView === 'projection') playerValueView = 'projection';
} catch (_) {}

// Career history cache — keyed by player name (lowercase), value: [{_season, ...stats}, …]
var careerData = {};
var _careerDataReady = false;
var _careerDataPromise = null;

// Class inference — inferred from multi-season career appearances
var _inferredClassMap = {};   // {playerNameLower: 'Fr'|'So'|'Jr'|'Sr'}
var _currentDataSeason = 2026;
var _leagueDataStatus = {
  MBB: { season: '', ready: false, loading: false, error: '', promise: null },
  WBB: { season: '', ready: false, loading: false, error: '', promise: null },
};

// ── Team intelligence caches (loaded in background after player data) ────────
var teamRatings    = {};  // keyed by lowercase team name → {team, adjO, adjD, adjEM, adjT, srs, sos, conference}
var allRatingsData = [];  // full array for cross-team comparisons / threats board
var _ratingsReady  = false;

var teamShootingCache      = {}; // keyed "teamName:season" → array of player shooting objects
var teamGamesCache         = {}; // keyed "teamName:season" → {games, teamStats}
var teamStatsCache         = {}; // keyed "teamName:season" → full team season stats object
var teamShootingZonesCache = {}; // keyed "teamName:season" → team-level shooting zone object
var playsCache             = {}; // keyed by gameId → compact shots array
var playerShotsCache       = {}; // keyed "team:season:playerName" → shots array
var _wbbTeamIdCache        = {}; // ESPN team name → id, populated once per session
var _wbbBiosBySeason       = {}; // season → { espnId: {height,classYr,hometown} }
var _wbbBioByAthlete       = {}; // espnId → best-known bio fallback across seasons
var _wbbFetchedTeamsBySeason = {}; // season → { teamId: true } once that roster is cached
var _wbbBioLoadsBySeason   = {}; // season → active roster fetch promise
var _wbbBioPageCache       = {}; // espnId → {height} parsed from ESPN bio page
var _wbbBioPageLoads       = {}; // espnId → active bio-page fetch promise
var _wbbActivePlayersRef   = null; // latest WBB player array backing the visible workbook
var _mbbTeamIdCache        = {}; // ESPN MBB team name → id, populated once per session
var _mbbHeightsBySeason    = {}; // season → { teamId|normName or id:espnId: heightInInches }
var _mbbHeightNameCache    = {}; // normalized player name → heightInInches fallback across seasons
var _mbbFetchedTeamsBySeason = {}; // season → { teamId: true } once that roster is cached
var _mbbHeightLoadsBySeason  = {}; // season → active roster fetch promise
var _mbbActivePlayersRef     = null; // latest MBB player array backing the visible workbook
var recruitingCache   = []; // flat array of recruit objects across multiple class years
var _recruitingReady  = false;
var _leagueRowsCache = {
  MBB: { season: '', wsRef: null, overrideVersion: -1, guards: [], bigs: [] },
  WBB: { season: '', wsRef: null, overrideVersion: -1, guards: [], bigs: [] },
};
var _ratingsCache = {};     // keyed "LEAGUE:season" -> team ratings array
var _ratingsLoads = {};     // keyed "LEAGUE:season" -> active promise
var _teamListRefreshTimer = null;
var _valueLabDataTimer = null;

// Live working copy (user-editable) — keyed by canonical name only
var confMultipliers = JSON.parse(JSON.stringify(DEFAULT_CONF_VALUES));

// --- DOM refs (queried once at module level) ---
var gsUrlInput, gsKeyInput, loadGsBtn, recalcBtn, exportBtn, resetWeightsBtn, resetValBtn;
var searchInput, warn, fitPresetEl, weightsBody, showSelectedOnlyEl, advancedDirEl;
var playersHead, playersBody, activeSheetEl, activeFitEl;
var playerValueViewEl, activeProjectionEl;
var projectionScoutModalBackEl, projectionScoutTitleEl, projectionScoutSubEl;
var projectionFilmBoostEl, projectionMedicalFlagEl, projectionScoutNoteEl;
var projectionScoutSaveBtnEl, projectionScoutClearBtnEl, projectionScoutCloseBtnEl;
var wTotalLocalEl, wRemainingEl, wOverBoxEl, wOverEl;
var kpiPlayers, kpiStats, kpiTotalW, kpiAvgPerf, kpiStarPerf;
var avgPayEl, minPayEl, maxPayEl, starValueEl, starPctEl, mpModeEl, mpPctEl;
var modalBack, mClose, mTitle, mSub, mScore, mFit, mVal, mMult, mMeta, mBars, mAllStats, mTags;
var confMultToggleEl, confMultBodyEl, confMultTableBody, confMultRangeEl, confMultLeagueNote, resetConfMultBtn;
var _computeAllTimer = null;
var _xlsxLoadPromise = null;

function scheduleNonCriticalWork(fn, timeoutMs){
  if(typeof fn !== 'function') return null;
  const timeout = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 1000;
  if(typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'){
    return window.requestIdleCallback(function(){ fn(); }, { timeout });
  }
  return setTimeout(fn, timeout);
}

function _evalPresetsLoaded(){
  return !!(window.EvalPresets && typeof window.EvalPresets.isLoaded === 'function' && window.EvalPresets.isLoaded());
}

function _scheduleTeamListRefresh(delayMs){
  if(_teamListRefreshTimer) clearTimeout(_teamListRefreshTimer);
  _teamListRefreshTimer = setTimeout(function(){
    _teamListRefreshTimer = null;
    if(typeof thRefreshTeamList === 'function') thRefreshTeamList();
  }, Number.isFinite(delayMs) ? Math.max(0, delayMs) : 120);
}

function _scheduleValueLabDataChange(delayMs){
  if(_valueLabDataTimer) clearTimeout(_valueLabDataTimer);
  _valueLabDataTimer = setTimeout(function(){
    _valueLabDataTimer = null;
    if(window.ValueLab && typeof window.ValueLab.handleDataChange === 'function') {
      window.ValueLab.handleDataChange();
    }
  }, Number.isFinite(delayMs) ? Math.max(0, delayMs) : 140);
}

function _dataApplyActiveLeagueConfig(opts){
  opts = opts && typeof opts === 'object' ? opts : {};
  const forceDefaults = !!opts.forceDefaults;
  const alwaysReloadData = opts.alwaysReloadData !== false;
  if(activeFitEl && fitPresetEl && fitPresetEl.selectedIndex >= 0){
    activeFitEl.textContent = fitPresetEl.options[fitPresetEl.selectedIndex].text;
  }
  if(_evalPresetsLoaded() && window.EvalPresets && typeof window.EvalPresets.applyActiveForCurrentLeague === 'function'){
    const presetChanged = !!window.EvalPresets.applyActiveForCurrentLeague();
    if(alwaysReloadData && !presetChanged) reloadActiveSheet();
    return;
  }
  loadScoringWeight();
  applyLeagueDefaults(forceDefaults);
  renderWeights();
  if(alwaysReloadData) reloadActiveSheet();
}

function _dataSeasonKey(season){
  return typeof normalizeDashboardSeason === 'function'
    ? normalizeDashboardSeason(season, String(_currentDataSeason || 2026))
    : String(season || _currentDataSeason || 2026);
}

function _dataPlaceholderSheet(){
  return { __aoa: [['Player','Team','Conference','Pos']] };
}

function _dataResetLeagueRowsCache(targetLeague){
  if(targetLeague){
    _leagueRowsCache[targetLeague] = { season: '', wsRef: null, overrideVersion: -1, guards: [], bigs: [] };
    return;
  }
  _leagueRowsCache.MBB = { season: '', wsRef: null, overrideVersion: -1, guards: [], bigs: [] };
  _leagueRowsCache.WBB = { season: '', wsRef: null, overrideVersion: -1, guards: [], bigs: [] };
}

function _dataEnsureWorkbookShell(){
  if(!wb || !wb.Sheets){
    wb = { SheetNames: [SHEET_MAP.MBB, SHEET_MAP.WBB], Sheets: {} };
  }
  if(!Array.isArray(wb.SheetNames)) wb.SheetNames = [];
  [SHEET_MAP.MBB, SHEET_MAP.WBB].forEach(function(name){
    if(!wb.SheetNames.includes(name)) wb.SheetNames.push(name);
    if(!wb.Sheets[name]) wb.Sheets[name] = _dataPlaceholderSheet();
  });
}

function _dataResetWorkbookShell(season){
  const seasonKey = _dataSeasonKey(season);
  wb = { SheetNames: [SHEET_MAP.MBB, SHEET_MAP.WBB], Sheets: {} };
  wb.Sheets[SHEET_MAP.MBB] = _dataPlaceholderSheet();
  wb.Sheets[SHEET_MAP.WBB] = _dataPlaceholderSheet();
  _leagueDataStatus.MBB = { season: seasonKey, ready: false, loading: false, error: '', promise: null };
  _leagueDataStatus.WBB = { season: seasonKey, ready: false, loading: false, error: '', promise: null };
  tbAllComputed = {};
  if(typeof _cachedAllPlayers !== 'undefined') _cachedAllPlayers = null;
  _dataResetLeagueRowsCache();
}

function _isLeagueDataLoaded(targetLeague, season){
  const status = _leagueDataStatus[targetLeague];
  return !!(status && status.ready && status.season === _dataSeasonKey(season));
}

function _dataCommitLeaguePlayers(targetLeague, players){
  _dataEnsureWorkbookShell();
  const headers = (players && players.length)
    ? Object.keys(players[0]).filter(function(k){ return !k.startsWith('_'); })
    : ['Player','Team','Conference','Pos'];
  const aoa = [headers];
  if(players && players.length){
    players.forEach(function(player){
      aoa.push(headers.map(function(header){ return player[header] !== undefined ? player[header] : ''; }));
    });
  }
  wb.Sheets[SHEET_MAP[targetLeague]] = { __aoa: aoa };
}

function _dataGetLeagueRows(targetLeague){
  const leagueKey = targetLeague === 'WBB' ? 'WBB' : 'MBB';
  const sheetName = findSheetLike(SHEET_MAP[leagueKey]) || SHEET_MAP[leagueKey];
  const ws = wb && wb.Sheets ? wb.Sheets[sheetName] : null;
  if(!ws) return null;

  const cache = _leagueRowsCache[leagueKey] || (_leagueRowsCache[leagueKey] = { season: '', wsRef: null, overrideVersion: -1, guards: [], bigs: [] });
  const seasonKey = _dataSeasonKey(_currentDataSeason);
  if(cache.season === seasonKey && cache.wsRef === ws && cache.overrideVersion === _projectionScoutOverrideVersion){
    return cache;
  }

  const allRows = parseSheetToRows(ws);
  const guards = [];
  const bigs = [];

  for(let i = 0; i < allRows.length; i++){
    const r = allRows[i];
    const out = {...r};
    out.Position = bucketPosition(r.Pos);
    if(out['TOV/G'] != null && out['TOPG'] == null) out['TOPG'] = out['TOV/G'];
    if(out['ORB%'] != null && out['OR%'] == null) out['OR%'] = out['ORB%'];
    if(out['DRB%'] != null && out['DR%'] == null) out['DR%'] = out['DRB%'];
    if(!out.Conference) out.Conference = '';
    if(out['3PA/G'] == null && out['3PA'] != null && out['G'] != null && +out['G'] > 0){
      out['3PA/G'] = +(+out['3PA'] / +out['G']).toFixed(2);
    }
    const tpp = +(out['3P%']) || 0;
    const tpag = +(out['3PA/G']) || 0;
    const gp = +(out['G']) || 0;
    if(tpp > 0 && tpag > 0){
      out['3PT_Rating'] = +(tpp * Math.min(1, tpag / 2.0) * Math.min(1, gp / 10)).toFixed(3);
    } else {
      out['3PT_Rating'] = 0;
    }
    const normalizedRow = projectionApplyScoutOverride(out);
    if(normalizedRow.Position === 'Bigs') bigs.push(normalizedRow);
    else guards.push(normalizedRow);
  }

  cache.season = seasonKey;
  cache.wsRef = ws;
  cache.overrideVersion = _projectionScoutOverrideVersion;
  cache.guards = guards;
  cache.bigs = bigs;
  return cache;
}

function initDataDOMRefs(){
  gsUrlInput = document.getElementById('gsUrl');
  gsKeyInput = document.getElementById('gsKey');
  loadGsBtn = document.getElementById('loadGs');
  recalcBtn = document.getElementById('recalc');
  exportBtn = document.getElementById('export');
  resetWeightsBtn = document.getElementById('resetWeights');
  resetValBtn = document.getElementById('resetVal');
  searchInput = document.getElementById('search');
  warn = document.getElementById('warn');
  fitPresetEl = document.getElementById('fitPreset');
  weightsBody = document.getElementById('weightsBody');
  showSelectedOnlyEl = document.getElementById('showSelectedOnly');
  advancedDirEl = document.getElementById('advancedDir');
  playersHead = document.getElementById('playersHead');
  playersBody = document.getElementById('playersBody');
  activeSheetEl = document.getElementById('activeSheet');
  activeFitEl = document.getElementById('activeFit');
  playerValueViewEl = document.getElementById('playerValueView');
  activeProjectionEl = document.getElementById('activeProjection');
  projectionScoutModalBackEl = document.getElementById('projectionScoutModalBack');
  projectionScoutTitleEl = document.getElementById('projectionScoutTitle');
  projectionScoutSubEl = document.getElementById('projectionScoutSub');
  projectionFilmBoostEl = document.getElementById('projectionFilmBoost');
  projectionMedicalFlagEl = document.getElementById('projectionMedicalFlag');
  projectionScoutNoteEl = document.getElementById('projectionScoutNote');
  projectionScoutSaveBtnEl = document.getElementById('projectionScoutSaveBtn');
  projectionScoutClearBtnEl = document.getElementById('projectionScoutClearBtn');
  projectionScoutCloseBtnEl = document.getElementById('projectionScoutCloseBtn');
  wTotalLocalEl = document.getElementById('wTotalLocal');
  wRemainingEl = document.getElementById('wRemaining');
  wOverBoxEl = document.getElementById('wOverBox');
  wOverEl = document.getElementById('wOver');
  kpiPlayers = document.getElementById('kpiPlayers');
  kpiStats = document.getElementById('kpiStats');
  kpiTotalW = document.getElementById('kpiTotalW');
  kpiAvgPerf = document.getElementById('kpiAvgPerf');
  kpiStarPerf = document.getElementById('kpiStarPerf');
  avgPayEl = document.getElementById('avgPay');
  minPayEl = document.getElementById('minPay');
  maxPayEl = document.getElementById('maxPay');
  starValueEl = document.getElementById('starValue');
  starPctEl = document.getElementById('starPct');
  mpModeEl = document.getElementById('mpMode');
  mpPctEl = document.getElementById('mpPct');
  modalBack = document.getElementById('modalBack');
  mClose = document.getElementById('mClose');
  mTitle = document.getElementById('mTitle');
  mSub = document.getElementById('mSub');
  mScore = document.getElementById('mScore');
  mFit = document.getElementById('mFit');
  mVal = document.getElementById('mVal');
  mMult = document.getElementById('mMult');
  mMeta = document.getElementById('mMeta');
  mBars = document.getElementById('mBars');
  mAllStats = document.getElementById('mAllStats');
  mTags = document.getElementById('mTags');
  confMultToggleEl = document.getElementById('confMultToggle');
  confMultBodyEl = document.getElementById('confMultBody');
  confMultTableBody = document.getElementById('confMultTableBody');
  confMultRangeEl = document.getElementById('confMultRange');
  confMultLeagueNote = document.getElementById('confMultLeagueNote');
  resetConfMultBtn = document.getElementById('resetConfMult');

  if(!_projectionScoutModalBound && projectionScoutModalBackEl){
    if(projectionScoutCloseBtnEl) projectionScoutCloseBtnEl.addEventListener('click', closeProjectionScoutModal);
    projectionScoutModalBackEl.addEventListener('click', function(e){ if(e.target === projectionScoutModalBackEl) closeProjectionScoutModal(); });
    if(projectionScoutSaveBtnEl) projectionScoutSaveBtnEl.addEventListener('click', saveProjectionScoutOverride);
    if(projectionScoutClearBtnEl) projectionScoutClearBtnEl.addEventListener('click', clearProjectionScoutOverride);
    _projectionScoutModalBound = true;
  }
}

// --- Helper functions ---

function showWarn(msg){
  if(warn){ warn.style.display = 'block'; warn.textContent = msg; }
}
function clearWarn(){
  if(warn){ warn.style.display = 'none'; warn.textContent = ''; }
}

function setActiveTab(el, groupSelector){
  document.querySelectorAll(groupSelector).forEach(x=>x.classList.remove('active'));
  el.classList.add('active');
}

function normalizeName(s){ return (s||'').toString().trim().toLowerCase().replace(/\s+/g,' '); }

function findSheetLike(target){
  if(!wb) return null;
  const t = normalizeName(target);
  for(const name of wb.SheetNames){
    if(normalizeName(name) === t) return name;
  }
  const tokens = t.split(' ').filter(Boolean);
  let best = null, bestScore = -1;
  for(const name of wb.SheetNames){
    const nn = normalizeName(name);
    let score = 0;
    tokens.forEach(tok => { if(nn.includes(tok)) score += 1; });
    if(nn.startsWith(tokens[0]||'')) score += 0.5;
    if(score > bestScore){ bestScore = score; best = name; }
  }
  if(bestScore >= Math.max(1, tokens.length/2)) return best;
  return null;
}

function bucketPosition(posStr){
  const p = (posStr||'').toString().trim().toUpperCase();
  if(!p || p === 'G' || p === 'G-F' || p === 'F-G') return 'Guards';
  return 'Bigs';
}

function prettyDir(isLower){
  return isLower ? 'Lower is better (↓)' : 'Higher is better (↑)';
}

function normalizeDirValue(v){
  const s = (v||'').toString().trim().toLowerCase();
  if(s.startsWith('low')) return 'lower';
  if(s.startsWith('high')) return 'higher';
  return '';
}

function guessDirForStat(stat){
  const key = (stat||'').toString().trim();
  if(DEFAULT_DIR[key]) return DEFAULT_DIR[key];
  const k = key.toLowerCase();
  if(k.includes('drtg') || k.includes('def rtg') || k.includes('defrating')) return 'lower';
  if(k.includes('tov') || k.includes('turn')) return 'lower';
  return 'higher';
}

function directionLabel(mn, mx, dir){
  const d = normalizeDirValue(dir) || (Number.isFinite(mn) && Number.isFinite(mx) && mn > mx ? 'lower' : 'higher');
  return d === 'lower' ? 'Lower' : 'Higher';
}

function getInvertForStat(stat){
  const w = (currentWeights[pos] || []).find(x => x.stat === stat);
  if(!w) return false;
  const d = normalizeDirValue(w.dir);
  if(d) return d === 'lower';
  return Number.isFinite(w.min) && Number.isFinite(w.max) && w.min > w.max;
}

function barColor(p){
  if(!Number.isFinite(p)) return 'var(--muted)';
  if(p >= 0.80) return 'var(--good)';
  if(p >= 0.60) return 'var(--accent2)';
  if(p >= 0.40) return 'var(--accent)';
  return 'var(--bad)';
}

// --- Sheet parsing ---

function parseSheetToRows(ws){
  const objRows = sheetToJson(ws);
  if(!objRows || !objRows.length) return [];
  return objRows.filter(obj => {
    return Object.values(obj).some(v => v !== undefined && v !== null && v !== '');
  });
}

function isLikelyNumericColumn(key){
  const k = (key||'').toString().trim();
  if(!k) return false;
  const bad = new Set([
    'Player','Name','Team','School','Conference','Conf','Position','Pos','Class','Yr','Year','ID','URL','Link','Height','Hometown',
    'Rank','Score','PerfScore','PerfScore_calc','FitScore','FitScore_calc','PredictedValue','PredictedValue_calc',
    'ActualValuation','ActualValuation_calc','MinMultiplier','MinMultiplier_calc','MP_num'
  ]);
  if(k.startsWith('Norm_')) return false;
  if(bad.has(k)) return false;
  return true;
}

function getNumericColumnsFromRows(rowArr){
  if(!rowArr?.length) return [];
  const keys = Object.keys(rowArr[0]);
  const cols = [];
  keys.forEach(k=>{
    if(!isLikelyNumericColumn(k)) return;
    let n=0, ok=0;
    for(let i=0;i<rowArr.length;i++){
      const v = Number(rowArr[i][k]);
      if(rowArr[i][k] === null || rowArr[i][k] === undefined || rowArr[i][k] === '') continue;
      n++;
      if(Number.isFinite(v)) ok++;
    }
    if(n >= 10 && ok/n >= 0.30) cols.push(k);
  });
  return cols;
}

function minMaxForStat(rowArr, stat){
  let mn = Infinity, mx = -Infinity, count=0;
  for(const r of rowArr){
    const v = Number(r[stat]);
    if(!Number.isFinite(v)) continue;
    count++;
    if(v < mn) mn = v;
    if(v > mx) mx = v;
  }
  if(count < 5) return {min: 0, max: 1, ok:false};
  if(mn === mx){
    const eps = (Math.abs(mn) || 1) * 0.01;
    mn -= eps; mx += eps;
  }
  return {min: mn, max: mx, ok:true};
}

function ensureWeightsCoverStats(forPos, rowArr){
  const allowed = new Set((baseStatsAll || []).slice());
  const exclude = new Set(['Player','Season','Team','Conference','G','GS','MP','Pos','Class','Rk',
    'FG','FGA','2P','2PA','3P','3PA','FT','FTA','ORB','DRB','TRB','AST','STL','BLK','TOV','PF','PTS',
    'Position','PerfScore_calc','PerfScore_raw','ConfMult_calc','MP_num','PredictedValue_calc',
    'ActualValuation_calc','MinMultiplier_calc','Score','FitScore_calc','CalcRank','BossRank',
    'ActualValuation','ValueDelta_calc','ValueDeltaPct_calc','_tbPosGroup']);
  if(rowArr && rowArr.length){
    const sample = rowArr[0] || {};
    for(const k of Object.keys(sample)){
      if(!exclude.has(k) && typeof sample[k] === 'number') allowed.add(k);
    }
  }

  const existing = currentWeights[forPos] || [];
  const existingSet = new Set(existing.map(x=>x.stat));

  for(const stat of allowed){
    if(existingSet.has(stat)) continue;
    const mm = (rowArr && rowArr.length && (stat in (rowArr[0]||{}))) ? minMaxForStat(rowArr, stat) : {min:0, max:1, ok:false};
    existing.push({stat, w:0, min:mm.min, max:mm.max, dir: guessDirForStat(stat), _auto:true});
    existingSet.add(stat);
  }

  existing.forEach(it=>{ if(!it.dir) it.dir = guessDirForStat(it.stat); });
  currentWeights[forPos] = existing;
}

function loadScoringWeight(){
  var gDef = (league === 'WBB' && typeof WBB_GUARD_DEFAULTS !== 'undefined') ? WBB_GUARD_DEFAULTS : GUARD_DEFAULTS;
  var bDef = (league === 'WBB' && typeof WBB_BIG_DEFAULTS   !== 'undefined') ? WBB_BIG_DEFAULTS   : BIG_DEFAULTS;
  excelWeights   = {Guards: JSON.parse(JSON.stringify(gDef)), Bigs: JSON.parse(JSON.stringify(bDef))};
  currentWeights = {Guards: JSON.parse(JSON.stringify(gDef)), Bigs: JSON.parse(JSON.stringify(bDef))};
  baseStatsAll = [...new Set([...gDef.map(x=>x.stat), ...bDef.map(x=>x.stat)])];
  return true;
}

// --- Weights UI ---

function updateWeightFooter(){
  const used = (currentWeights[pos] || []).filter(x => (Number(x.w)||0) !== 0);
  const totalW = used.reduce((a,b)=> a + (Number(b.w)||0), 0);
  const remaining = 100 - totalW;
  if(wTotalLocalEl) wTotalLocalEl.textContent = totalW.toFixed(1);
  if(wRemainingEl) wRemainingEl.textContent = remaining.toFixed(1);
  if(wOverBoxEl && wOverEl){
    if(remaining < -1e-9){
      wOverBoxEl.style.display = 'inline-flex';
      wOverEl.textContent = Math.abs(remaining).toFixed(1);
    }else{
      wOverBoxEl.style.display = 'none';
    }
  }
}

function renderWeights(){
  const wAll = currentWeights[pos] || [];
  const selectedOnly = !!showSelectedOnlyEl?.checked;
  let w = wAll.slice();
  if(selectedOnly) w = w.filter(it => (Number(it.w)||0) !== 0);

  w = w.slice().sort((a,b)=>{
    const aw = (Number(a.w)||0) !== 0 ? 0 : 1;
    const bw = (Number(b.w)||0) !== 0 ? 0 : 1;
    if(aw !== bw) return aw - bw;
    return a.stat.localeCompare(b.stat);
  });

  weightsBody.innerHTML = '';
  w.forEach((it) => {
    const idx = wAll.findIndex(x => x.stat === it.stat);
    const tr = document.createElement('tr');
    const selected = (Number(it.w)||0) !== 0;
    tr.style.background = selected ? 'rgba(122,162,255,.08)' : 'transparent';
    tr.innerHTML = `
      <td><span class="statLink" data-stat="${it.stat}">${it.stat}</span></td>
      <td><input type="number" step="0.1" value="${it.w}" data-k="w" data-i="${idx}"/></td>
      <td><input type="number" step="0.001" value="${it.min}" data-k="min" data-i="${idx}"/></td>
      <td><input type="number" step="0.001" value="${it.max}" data-k="max" data-i="${idx}"/></td>
      <td>
        ${(() => {
            const d = normalizeDirValue(it.dir) || (getInvertForStat(it.stat) ? 'lower' : 'higher');
            if(advancedDirEl && advancedDirEl.checked){
              return `<select data-k="dir" data-i="${idx}" style="width:100%; padding:7px 8px; border-radius:12px">
                  <option value="higher" ${(d==='higher')?'selected':''}>Higher</option>
                  <option value="lower" ${(d==='lower')?'selected':''}>Lower</option>
                </select>`;
            }
            const cls = d==='lower' ? 'down' : 'up';
            const title = d==='lower' ? 'Lower is better' : 'Higher is better';
            return `<div class="dirIcon ${cls}" title="${title}"></div>`;
        })()}
      </td>
    `;
    weightsBody.appendChild(tr);
  });
  weightsBody.querySelectorAll('input, select').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const i = Number(e.target.dataset.i);
      const k = e.target.dataset.k;
      const v = Number(e.target.value);
      currentWeights[pos][i][k] = v;
      const row = e.target.closest('tr');
      const it2 = currentWeights[pos][i];
      row.style.background = ((Number(it2.w)||0) !== 0) ? 'rgba(122,162,255,.08)' : 'transparent';
      updateWeightFooter();
      if(wb) requestComputeAll(120);
    });
  });

  const used = (currentWeights[pos] || []).filter(x => (Number(x.w)||0) !== 0);
  const totalW = used.reduce((a,b)=> a + (Number(b.w)||0), 0);
  kpiStats.textContent = String(used.length);
  kpiTotalW.textContent = totalW.toFixed(1);
  updateWeightFooter();
}

// --- Scoring + valuation ---

function scoreRow(r){
  const w = currentWeights[pos] || [];
  const used = w.filter(x => (Number(x.w)||0) !== 0);
  let score = 0;

  used.forEach(rule => {
    const raw = r[rule.stat];
    if(raw === undefined || raw === null || raw === '') return;
    let x = safeNum(raw);
    if(x === null) return;

    x = scalePct(rule.stat, x);

    let mn = Number(rule.min);
    let mx = Number(rule.max);

    mn = scalePct(rule.stat, mn);
    mx = scalePct(rule.stat, mx);

    if(!Number.isFinite(mn) || !Number.isFinite(mx) || mn === mx){
      return;
    }
    const lo = Math.min(mn, mx);
    const hi = Math.max(mn, mx);
    let val = (x - lo) / (hi - lo);

    const lowerBetter = getInvertForStat(rule.stat);
    if(lowerBetter) val = 1 - val;

    score += rule.w * clamp01(val);
  });

  return score;
}

function getMpMultiplier(mp, mpPctl){
  if(mpModeEl.value === 'off') return 1;
  if(!Number.isFinite(mp) || mp <= 0) return 0;
  if(!Number.isFinite(mpPctl) || mpPctl <= 0) return 1;
  return Math.min(1, Math.sqrt(mp / mpPctl));
}

function setPlayerValueView(mode, opts){
  const next = mode === 'projection' ? 'projection' : 'production';
  playerValueView = next;
  if(activeProjectionEl) activeProjectionEl.textContent = next === 'projection' ? 'Projection' : 'Production';
  if(playerValueViewEl && playerValueViewEl.value !== next) playerValueViewEl.value = next;
  if(!(opts && opts.skipPersist)){
    try { localStorage.setItem('players_value_view_v1', next); } catch (_) {}
  }
  return playerValueView;
}

function projectionCurrentUserKey(){
  let user = '';
  try {
    if(typeof authGetUser === 'function') user = authGetUser() || '';
    if(!user && typeof authIsGuest === 'function' && authIsGuest()) user = 'guest';
  } catch (_) {}
  return normalizeName(user || 'local') || 'local';
}

function projectionScoutStorageKey(){
  return ['projection_scout_overrides_v1', projectionCurrentUserKey(), league, String(_currentDataSeason || 2026)].join('::');
}

function projectionScoutPlayerKey(rowOrName, teamName){
  const playerName = typeof rowOrName === 'object'
    ? (rowOrName.Player || rowOrName.Name || '')
    : (rowOrName || '');
  const team = typeof rowOrName === 'object'
    ? (rowOrName.Team || rowOrName.team || teamName || '')
    : (teamName || '');
  return [league, String(_currentDataSeason || 2026), normalizeName(playerName), normalizeName(team)].join('||');
}

function projectionNormalizeFilmBoost(value){
  const numeric = safeNum(value);
  if(Number.isFinite(numeric)){
    const normalized = Math.abs(numeric) > 1 ? numeric / 100 : numeric;
    return clamp(normalized, -0.2, 0.35);
  }
  const text = (value ?? '').toString().trim().toLowerCase();
  if(text === 'high' || text === 'strong') return 0.18;
  if(text === 'medium' || text === 'moderate') return 0.10;
  if(text === 'low' || text === 'slight') return 0.05;
  if(text === 'off' || text === 'none' || text === 'model') return 0;
  return NaN;
}

function projectionSnapFilmBoost(value){
  const numeric = projectionNormalizeFilmBoost(value);
  if(!Number.isFinite(numeric) || numeric <= 0.001) return 0;
  const options = [0.05, 0.10, 0.18];
  let best = options[0];
  let dist = Math.abs(options[0] - numeric);
  options.forEach(option => {
    const nextDist = Math.abs(option - numeric);
    if(nextDist < dist){
      best = option;
      dist = nextDist;
    }
  });
  return best;
}

function projectionManualBoostLabel(value){
  const numeric = projectionNormalizeFilmBoost(value);
  if(!Number.isFinite(numeric) || Math.abs(numeric) < 0.001) return 'Off';
  if(numeric < 0) return 'Fade';
  if(numeric >= 0.16) return 'High';
  if(numeric >= 0.09) return 'Moderate';
  return 'Low';
}

function projectionNormalizeMedicalFlag(value){
  const label = (value ?? '').toString().trim().toLowerCase();
  if(!label || label === 'model' || label === 'default' || label === 'auto') return '';
  if(label === 'high') return 'High';
  if(label === 'moderate' || label === 'medium') return 'Moderate';
  if(label === 'low') return 'Low';
  return '';
}

function projectionManualMedicalRisk(label){
  switch(projectionNormalizeMedicalFlag(label)){
    case 'High': return { value: 0.78, label: 'High', source: 'manual', detail: 'manual scout medical flag' };
    case 'Moderate': return { value: 0.48, label: 'Moderate', source: 'manual', detail: 'manual scout medical flag' };
    case 'Low': return { value: 0.12, label: 'Low', source: 'manual', detail: 'manual scout medical flag' };
    default: return null;
  }
}

function projectionNormalizeScoutOverride(raw){
  raw = raw && typeof raw === 'object' ? raw : {};
  const filmBoostRaw = projectionSnapFilmBoost(raw.filmBoost);
  const medicalFlag = projectionNormalizeMedicalFlag(raw.medicalFlag);
  const note = (raw.note ?? '').toString().trim();
  return {
    key: String(raw.key || '').trim(),
    playerName: (raw.playerName ?? '').toString().trim(),
    teamName: (raw.teamName ?? '').toString().trim(),
    filmBoost: filmBoostRaw > 0 ? filmBoostRaw : 0,
    filmLabel: projectionManualBoostLabel(filmBoostRaw),
    medicalFlag: medicalFlag,
    note: note,
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

function projectionLoadScoutOverrideMap(force){
  const key = projectionScoutStorageKey();
  if(!force && _projectionScoutOverrideMap && _projectionScoutOverrideKey === key) return _projectionScoutOverrideMap;
  let parsed = {};
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '{}');
    parsed = raw && typeof raw === 'object' ? raw : {};
  } catch (_) {
    parsed = {};
  }
  const normalized = {};
  Object.keys(parsed).forEach(id => {
    const next = projectionNormalizeScoutOverride(parsed[id]);
    if(next.key) normalized[next.key] = next;
  });
  _projectionScoutOverrideKey = key;
  _projectionScoutOverrideMap = normalized;
  return normalized;
}

function projectionSaveScoutOverrideMap(map){
  const key = projectionScoutStorageKey();
  _projectionScoutOverrideKey = key;
  _projectionScoutOverrideMap = map || {};
  _projectionScoutOverrideVersion++;
  try {
    localStorage.setItem(key, JSON.stringify(_projectionScoutOverrideMap));
  } catch (_) {}
}

function projectionGetScoutOverride(row){
  if(!row) return null;
  const key = projectionScoutPlayerKey(row);
  const map = projectionLoadScoutOverrideMap();
  return key && map[key] ? map[key] : null;
}

function projectionApplyScoutOverride(row){
  if(!row) return row;
  const override = projectionGetScoutOverride(row);
  if(!override) return row;
  const next = {...row};
  if(override.filmBoost > 0) next.ProjectionBoost = override.filmBoost;
  if(override.medicalFlag) next.ProjectionMedicalFlag = override.medicalFlag;
  if(override.note) next.ProjectionScoutNote = override.note;
  return next;
}

function projectionFindMatchingPlayer(row){
  if(!row || typeof tbGetAllPlayers !== 'function') return null;
  const key = projectionScoutPlayerKey(row);
  return (tbGetAllPlayers(league) || tbGetAllPlayers() || []).find(candidate => projectionScoutPlayerKey(candidate) === key) || null;
}

function projectionRefreshAfterScoutOverride(row){
  projectionLoadScoutOverrideMap(true);
  if(wb) reloadActiveSheet();
  else computeAll();

  if(window.ValueLab && typeof window.ValueLab.handleDataChange === 'function') {
    window.ValueLab.handleDataChange();
  }

  if(typeof portalRecDist !== 'undefined') portalRecDist = null;
  if(typeof portalCollectAllPlayers === 'function') portalCollectAllPlayers();
  if(typeof portalRefreshTeamOptions === 'function') portalRefreshTeamOptions();

  if(typeof portalLoadTeamContext === 'function' && typeof portalTeamCtx !== 'undefined' && portalTeamCtx && portalTeamCtx.team){
    portalLoadTeamContext(portalTeamCtx.team).then(function(){
      if(typeof portalComputeRecommendations === 'function') portalComputeRecommendations();
      if(typeof portalRenderRecommendations === 'function') portalRenderRecommendations();
      if(typeof portalRefreshScenarioRows === 'function') portalRefreshScenarioRows();
    }).catch(function(){
      if(typeof portalRenderRecommendations === 'function') portalRenderRecommendations();
      if(typeof portalRefreshScenarioRows === 'function') portalRefreshScenarioRows();
    });
  } else {
    if(typeof portalRenderRecommendations === 'function') portalRenderRecommendations();
    if(typeof portalRefreshScenarioRows === 'function') portalRefreshScenarioRows();
  }

  if(typeof _currentProfilePlayer !== 'undefined' && _currentProfilePlayer && typeof openProfile === 'function'){
    const updated = projectionFindMatchingPlayer(_currentProfilePlayer);
    if(updated) openProfile(updated);
  }

  if(row && typeof renderPlayers === 'function') renderPlayers();
}

function openProjectionScoutModal(row){
  if(!projectionScoutModalBackEl || !row) return false;
  const override = projectionGetScoutOverride(row);
  _projectionScoutTarget = {
    key: projectionScoutPlayerKey(row),
    playerName: (row.Player || row.Name || '').toString(),
    teamName: (row.Team || '').toString(),
    row: row,
  };

  if(projectionScoutTitleEl) projectionScoutTitleEl.textContent = _projectionScoutTarget.playerName || 'Projection scout inputs';
  if(projectionScoutSubEl) projectionScoutSubEl.textContent = [_projectionScoutTarget.teamName || '—', league + ' ' + String(_currentDataSeason || 2026)].join(' • ');
  if(projectionFilmBoostEl) {
    const effectiveBoost = override ? override.filmBoost : projectionSnapFilmBoost(row.ProjectionBoost || row['Projection Boost'] || row.FilmBoost || row['Film Boost'] || row.ScoutBoost || row['Scout Boost']);
    projectionFilmBoostEl.value = effectiveBoost > 0 ? String(effectiveBoost.toFixed(2)) : '0';
  }
  if(projectionMedicalFlagEl) {
    const effectiveFlag = override ? override.medicalFlag : projectionNormalizeMedicalFlag(row.ProjectionMedicalFlag || row['Projection Medical Flag']);
    projectionMedicalFlagEl.value = effectiveFlag || '';
  }
  if(projectionScoutNoteEl) {
    projectionScoutNoteEl.value = override ? (override.note || '') : ((row.ProjectionScoutNote || '').toString());
  }

  projectionScoutModalBackEl.style.display = 'flex';
  return true;
}

function closeProjectionScoutModal(){
  if(!projectionScoutModalBackEl) return;
  projectionScoutModalBackEl.style.display = 'none';
  _projectionScoutTarget = null;
}

function saveProjectionScoutOverride(){
  if(!_projectionScoutTarget) return false;
  const targetRow = _projectionScoutTarget.row || null;
  const label = _projectionScoutTarget.playerName || 'Player';
  const map = {...projectionLoadScoutOverrideMap()};
  const filmBoost = projectionSnapFilmBoost(projectionFilmBoostEl ? projectionFilmBoostEl.value : 0);
  const medicalFlag = projectionNormalizeMedicalFlag(projectionMedicalFlagEl ? projectionMedicalFlagEl.value : '');
  const note = projectionScoutNoteEl ? projectionScoutNoteEl.value.trim() : '';
  if(filmBoost <= 0 && !medicalFlag && !note){
    delete map[_projectionScoutTarget.key];
  } else {
    map[_projectionScoutTarget.key] = projectionNormalizeScoutOverride({
      key: _projectionScoutTarget.key,
      playerName: _projectionScoutTarget.playerName,
      teamName: _projectionScoutTarget.teamName,
      filmBoost: filmBoost,
      medicalFlag: medicalFlag,
      note: note,
      updatedAt: new Date().toISOString(),
    });
  }
  projectionSaveScoutOverrideMap(map);
  closeProjectionScoutModal();
  projectionRefreshAfterScoutOverride(targetRow);
  if(typeof showWarn === 'function') clearWarn();
  if(typeof valueLabSetStatus === 'function') valueLabSetStatus(label + ' projection inputs saved.', 'good');
  return true;
}

function clearProjectionScoutOverride(){
  if(!_projectionScoutTarget) return false;
  const targetRow = _projectionScoutTarget.row || null;
  const label = _projectionScoutTarget.playerName || 'Player';
  const map = {...projectionLoadScoutOverrideMap()};
  delete map[_projectionScoutTarget.key];
  projectionSaveScoutOverrideMap(map);
  closeProjectionScoutModal();
  projectionRefreshAfterScoutOverride(targetRow);
  if(typeof showWarn === 'function') clearWarn();
  if(typeof valueLabSetStatus === 'function') valueLabSetStatus(label + ' projection inputs cleared.', 'good');
  return true;
}

function projectionGetGamesPlayed(row){
  const keys = ['G', 'GP', 'Games', 'GamesPlayed', 'gamesPlayed'];
  for(const key of keys){
    const value = safeNum(row[key]);
    if(Number.isFinite(value)) return value;
  }
  return NaN;
}

function projectionGetMinutesPerGame(row){
  const keys = ['MP', 'MPG', 'Minutes', 'MinutesPerGame', 'avgMinutes'];
  for(const key of keys){
    const value = safeNum(row[key]);
    if(Number.isFinite(value)) return value;
  }
  return NaN;
}

function projectionGetTotalMinutes(row){
  const games = projectionGetGamesPlayed(row);
  const minutes = projectionGetMinutesPerGame(row);
  if(Number.isFinite(games) && Number.isFinite(minutes)) return games * minutes;
  if(Number.isFinite(minutes)) return minutes;
  return NaN;
}

function projectionNormalizeClass(value){
  const raw = (value || '').toString().trim().toLowerCase();
  if(!raw) return '';
  if(raw.startsWith('gr') || raw.startsWith('5')) return 'Gr';
  if(raw.startsWith('sr') || raw === '4' || raw === 'senior') return 'Sr';
  if(raw.startsWith('jr') || raw === '3' || raw === 'junior') return 'Jr';
  if(raw.startsWith('so') || raw === '2' || raw === 'sophomore') return 'So';
  if(raw.startsWith('fr') || raw === '1' || raw === 'freshman') return 'Fr';
  return value.toString().trim();
}

function projectionClassConfidence(cls){
  switch(projectionNormalizeClass(cls)){
    case 'Fr': return 0.62;
    case 'So': return 0.74;
    case 'Jr': return 0.86;
    case 'Sr': return 0.92;
    case 'Gr': return 0.95;
    default: return 0.78;
  }
}

function projectionGetPriorCareerEntries(row){
  const key = normalizeName(row.Player || row.Name || '');
  if(!key || !careerData[key] || !careerData[key].length) return [];
  return careerData[key].filter(entry => Number(entry && entry._season) < Number(_currentDataSeason || 0));
}

function projectionGetStatusText(row){
  const keys = ['Injury Status', 'Injury_Status', 'InjuryStatus', 'Medical Risk', 'Medical_Risk', 'Availability', 'Status'];
  for(const key of keys){
    const value = (row[key] ?? '').toString().trim();
    if(value) return value;
  }
  return '';
}

function projectionGetManualMedicalFlag(row){
  const keys = ['ProjectionMedicalFlag', 'Projection Medical Flag', 'ProjectionMedicalRisk', 'Projection Medical Risk', 'ScoutMedicalFlag'];
  for(const key of keys){
    const value = projectionNormalizeMedicalFlag(row[key]);
    if(value) return value;
  }
  return '';
}

function projectionGetManualScoutNote(row){
  const keys = ['ProjectionScoutNote', 'Projection Scout Note', 'ScoutNote', 'Scout Note'];
  for(const key of keys){
    const value = (row[key] ?? '').toString().trim();
    if(value) return value;
  }
  return '';
}

function projectionGetManualBoost(row){
  const keys = ['ProjectionBoost', 'Projection Boost', 'FilmBoost', 'Film Boost', 'ScoutBoost', 'Scout Boost', 'ProjectionUpside'];
  for(const key of keys){
    const normalized = projectionNormalizeFilmBoost(row[key]);
    if(Number.isFinite(normalized)) return normalized;
  }
  return 0;
}

function projectionComputePriorPerf(entries, confMultOn){
  if(!entries || !entries.length) return NaN;
  let num = 0;
  let den = 0;
  entries.forEach((entry, idx) => {
    const perf = scoreRow(entry);
    if(!Number.isFinite(perf)) return;
    const conf = (entry['Conference'] ?? entry['Conf'] ?? '').toString().trim();
    const cm = confMultOn ? getConfMultiplier(conf) : 1;
    const recencyWeight = 0.9 + (idx / Math.max(1, entries.length - 1)) * 0.55;
    num += (perf * cm) * recencyWeight;
    den += recencyWeight;
  });
  return den ? (num / den) : NaN;
}

function projectionComputeConfidence(row, games, totalMinutes, priorCount){
  const gamesFactor = Number.isFinite(games) ? clamp01(games / 18) : 0;
  const minutesFactor = Number.isFinite(totalMinutes) ? clamp01(totalMinutes / 420) : 0;
  const sampleFactor = 0.55 * gamesFactor + 0.45 * minutesFactor;
  const classFactor = projectionClassConfidence(row.Class || row.Yr || row.Year || '');
  const priorFactor = clamp01((priorCount || 0) / 3);
  let confidence = 0.18 + 0.5 * sampleFactor + 0.2 * classFactor + 0.12 * priorFactor;
  if(Number.isFinite(games) && games <= 5) confidence -= 0.1;
  if(Number.isFinite(totalMinutes) && totalMinutes < 160) confidence -= 0.06;
  return clamp(confidence, 0.18, 0.98);
}

function projectionComputeMedicalRisk(row, games, totalMinutes, priorCount){
  const manualRisk = projectionManualMedicalRisk(projectionGetManualMedicalFlag(row));
  if(manualRisk) return manualRisk;
  const statusText = projectionGetStatusText(row).toLowerCase();
  if(statusText){
    if(/out|surgery|acl|season|redshirt|medical redshirt|torn|fracture|broken/.test(statusText)){
      return { value: 0.78, label: 'High', source: 'status', detail: statusText };
    }
    if(/questionable|doubtful|day.?to.?day|monitor|rehab|recover|returning|limited|ankle|knee|foot|hamstring|injur/.test(statusText)){
      return { value: 0.48, label: 'Moderate', source: 'status', detail: statusText };
    }
    if(/healthy|available|active|full go|cleared/.test(statusText)){
      return { value: 0.12, label: 'Low', source: 'status', detail: statusText };
    }
  }
  if((priorCount || 0) >= 2 && Number.isFinite(games) && Number.isFinite(totalMinutes) && games <= 8 && totalMinutes >= 140){
    return { value: 0.42, label: 'Moderate', source: 'derived', detail: 'short season sample after prior seasons' };
  }
  if(Number.isFinite(games) && Number.isFinite(totalMinutes) && games <= 5 && totalMinutes >= 80){
    return { value: 0.34, label: 'Moderate', source: 'derived', detail: 'very short season sample' };
  }
  return { value: 0.14, label: 'Low', source: 'model', detail: '' };
}

function projectionConfidenceLabel(confidence){
  if(!Number.isFinite(confidence)) return 'Unknown';
  if(confidence >= 0.82) return 'High';
  if(confidence >= 0.64) return 'Moderate';
  return 'Low';
}

function projectionConfidenceTone(confidence){
  if(!Number.isFinite(confidence)) return 'neutral';
  if(confidence >= 0.82) return 'good';
  if(confidence >= 0.64) return 'warn';
  return 'bad';
}

function projectionMedicalRiskTone(label){
  if(label === 'High') return 'bad';
  if(label === 'Moderate') return 'warn';
  return 'good';
}

function projectionTalentLabel(healthyPerf, perfPool){
  if(!Number.isFinite(healthyPerf)) return 'Needs more data';
  const pct = Array.isArray(perfPool) && perfPool.length >= 5
    ? clamp(percentileRank(perfPool.slice().sort((a,b)=>a-b), healthyPerf), 0, 1)
    : NaN;
  if(Number.isFinite(pct)){
    if(pct >= 0.9) return 'Star-caliber';
    if(pct >= 0.78) return 'Impact starter';
    if(pct >= 0.58) return 'Starter';
    if(pct >= 0.42) return 'Rotation';
  }
  return 'Developmental';
}

function projectionCalcMetrics(row, ctx){
  const games = projectionGetGamesPlayed(row);
  const totalMinutes = projectionGetTotalMinutes(row);
  const priorEntries = projectionGetPriorCareerEntries(row);
  const priorPerf = projectionComputePriorPerf(priorEntries, ctx.confMultOn);
  const confidence = projectionComputeConfidence(row, games, totalMinutes, priorEntries.length);
  const medicalRisk = projectionComputeMedicalRisk(row, games, totalMinutes, priorEntries.length);
  const manualBoost = projectionGetManualBoost(row);
  const manualMedicalFlag = projectionGetManualMedicalFlag(row);
  const manualScoutNote = projectionGetManualScoutNote(row);
  const productionPerf = safeNum(row.PerfScore_calc);
  const productionValue = safeNum(row.ActualValuation_calc);

  let healthyPerf = productionPerf;
  if(Number.isFinite(priorPerf) && Number.isFinite(productionPerf)){
    const currentWeight = clamp(0.42 + confidence * 0.42, 0.42, 0.88);
    healthyPerf = productionPerf * currentWeight + priorPerf * (1 - currentWeight);
  } else if(!Number.isFinite(healthyPerf) && Number.isFinite(priorPerf)){
    healthyPerf = priorPerf;
  }
  if(Number.isFinite(healthyPerf) && manualBoost !== 0){
    healthyPerf = healthyPerf * (1 + manualBoost * 0.2);
  }

  let healthyValue = NaN;
  if(Number.isFinite(healthyPerf) && Number.isFinite(ctx.avgPay) && ctx.avgPay > 0){
    healthyValue = ctx.avgPay * Math.exp(ctx.k * (healthyPerf - ctx.lastPerfAvg));
    healthyValue = clamp(healthyValue, ctx.minPay, ctx.maxPay);
  }

  let medianValue = productionValue;
  if(Number.isFinite(productionValue) && Number.isFinite(healthyValue)){
    const blend = clamp(0.18 + 0.62 * confidence - 0.24 * medicalRisk.value + (priorEntries.length ? 0.08 : 0), 0.12, 0.9);
    medianValue = clamp((productionValue * (1 - blend)) + (healthyValue * blend), ctx.minPay, ctx.maxPay);
  } else if(Number.isFinite(healthyValue)){
    medianValue = healthyValue;
  }

  const uncertainty = clamp((1 - confidence) * 0.75 + medicalRisk.value * 0.6, 0.12, 0.5);
  let floorPerf = Number.isFinite(healthyPerf) ? Math.max(0, healthyPerf * (1 - uncertainty * 0.54)) : NaN;
  let ceilingPerf = Number.isFinite(healthyPerf) ? healthyPerf * (1 + uncertainty * 0.42 + Math.max(0, manualBoost) * 0.08) : NaN;
  if(Number.isFinite(floorPerf) && Number.isFinite(healthyPerf) && floorPerf > healthyPerf) floorPerf = healthyPerf;
  if(Number.isFinite(ceilingPerf) && Number.isFinite(healthyPerf) && ceilingPerf < healthyPerf) ceilingPerf = healthyPerf;
  let floorValue = Number.isFinite(medianValue) ? clamp(medianValue * (1 - uncertainty), ctx.minPay, ctx.maxPay) : NaN;
  const ceilingBase = Number.isFinite(healthyValue) ? Math.max(healthyValue, medianValue) : medianValue;
  const ceilingBoost = clamp(1 + uncertainty * 0.68 + manualBoost * 0.16, 1.06, 1.45);
  let ceilingValue = Number.isFinite(ceilingBase) ? clamp(ceilingBase * ceilingBoost, ctx.minPay, ctx.maxPay) : NaN;
  if(Number.isFinite(floorValue) && Number.isFinite(medianValue) && floorValue > medianValue) floorValue = medianValue;
  if(Number.isFinite(ceilingValue) && Number.isFinite(medianValue) && ceilingValue < medianValue) ceilingValue = medianValue;

  const reasons = [];
  if(Number.isFinite(games) && games < 12) reasons.push('limited current-season sample');
  if(Number.isFinite(totalMinutes) && totalMinutes < 250) reasons.push('light total minutes');
  if(priorEntries.length) reasons.push('blended with ' + priorEntries.length + ' prior season' + (priorEntries.length === 1 ? '' : 's'));
  if(medicalRisk.label !== 'Low') reasons.push('medical risk ' + medicalRisk.label.toLowerCase());
  if(manualBoost > 0) reasons.push('scout upside boost applied');
  if(manualMedicalFlag) reasons.push('manual medical flag ' + manualMedicalFlag.toLowerCase());
  if(manualScoutNote) reasons.push('scout note attached');
  if(!reasons.length) reasons.push('stable projection profile');

  return {
    ProjectionGames_calc: games,
    ProjectionMinutesSample_calc: totalMinutes,
    ProjectionPriorSeasons_calc: priorEntries.length,
    ProjectionPerf_calc: healthyPerf,
    ProjectionFloorPerf_calc: floorPerf,
    ProjectionCeilingPerf_calc: ceilingPerf,
    ProjectionHealthyValue_calc: healthyValue,
    ProjectionMedianValue_calc: medianValue,
    ProjectionFloorValue_calc: floorValue,
    ProjectionCeilingValue_calc: ceilingValue,
    ProjectionConfidence_calc: confidence,
    ProjectionConfidenceLabel_calc: projectionConfidenceLabel(confidence),
    ProjectionConfidenceTone_calc: projectionConfidenceTone(confidence),
    ProjectionMedicalRisk_calc: medicalRisk.value,
    ProjectionMedicalRiskLabel_calc: medicalRisk.label,
    ProjectionMedicalRiskTone_calc: projectionMedicalRiskTone(medicalRisk.label),
    ProjectionMedicalRiskSource_calc: medicalRisk.source,
    ProjectionHealthyTalentLabel_calc: projectionTalentLabel(healthyPerf, ctx.perfPool),
    ProjectionReasonSummary_calc: reasons.join(' • '),
    ProjectionManualBoost_calc: manualBoost,
    ProjectionManualBoostLabel_calc: projectionManualBoostLabel(manualBoost),
    ProjectionManualMedicalFlag_calc: manualMedicalFlag,
    ProjectionScoutNote_calc: manualScoutNote,
    ProjectionDelta_calc: (Number.isFinite(medianValue) && Number.isFinite(productionValue)) ? (medianValue - productionValue) : NaN,
  };
}

function buildStatDistributions(){
  statDist = {};
  const fromWeights = (currentWeights[pos] || []).map(x => x.stat);
  const fromFit = Object.keys(FIT_PRESETS.balanced);
  const stats = Array.from(new Set([...fromWeights, ...fromFit])).filter(Boolean);

  stats.forEach(stat => {
    const arr = computed.map(r => safeNum(r[stat])).filter(Number.isFinite);
    if(arr.length < 5) return;
    const sorted = arr.slice().sort((a,b)=>a-b);
    statDist[stat] = {sorted, invert: getInvertForStat(stat)};
  });
}

function statPercentile(stat, x){
  const d = statDist[stat];
  if(!d) return NaN;
  let p = percentileRank(d.sorted, x);
  if(d.invert) p = 1 - p;
  return clamp(p, 0, 1);
}

function fitScoreForRow(r){
  const presetKey = fitPresetEl.value;
  const preset = FIT_PRESETS[presetKey] || FIT_PRESETS.balanced;

  let num = 0, den = 0;
  for(const [stat, w] of Object.entries(preset)){
    if(!w) continue;
    const x = safeNum(r[stat]);
    if(x === null) continue;
    const p = statPercentile(stat, x);
    if(!Number.isFinite(p)) continue;
    num += w * p;
    den += w;
  }
  if(den === 0) return NaN;
  return 100 * (num / den);
}

function archetypeTags(r){
  const p = (stat) => {
    const x = safeNum(r[stat]);
    if(x === null) return NaN;
    return statPercentile(stat, x);
  };

  const tags = [];
  if(pos === 'Guards'){
    const p3 = p('3P%'), pefg = p('eFG%'), pft = p('FT%'), pppg = p('PPG');
    const papg = p('APG'), pato = p('A/TO'), ptopg = p('TOPG');
    const pspg = p('SPG'), pdr = p('DR%'), pbpm = p('BPM');

    if(Number.isFinite(p3) && p3 >= 0.80) tags.push({t:'Shooter', c:'var(--accent2)'});
    if(Number.isFinite(pefg) && pefg >= 0.80) tags.push({t:'Efficient', c:'var(--good)'});
    if(Number.isFinite(pppg) && pppg >= 0.80) tags.push({t:'Scorer', c:'var(--accent)'});
    if(Number.isFinite(papg) && papg >= 0.80) tags.push({t:'Playmaker', c:'var(--accent2)'});
    if(Number.isFinite(pato) && pato >= 0.75) tags.push({t:'Low TO', c:'var(--good)'});
    if(Number.isFinite(pspg) && pspg >= 0.80) tags.push({t:'Disruptor', c:'var(--warn)'});
    if(Number.isFinite(pdr) && pdr >= 0.75) tags.push({t:'Defender', c:'var(--warn)'});
    if(Number.isFinite(pbpm) && pbpm >= 0.75) tags.push({t:'Impact', c:'var(--accent)'});

    if(tags.length === 0) tags.push({t:'Role Player', c:'var(--muted)'});
    return tags.slice(0, 6);
  }else{
    const pbpg = p('BPG'), pdrtg = p('DRtg'), pdr = p('DR%'), por = p('OR%'), pdrb = p('DRB/G');
    const pefg = p('eFG%'), p3 = p('3P%');

    if(Number.isFinite(pbpg) && pbpg >= 0.80) tags.push({t:'Rim Protector', c:'var(--warn)'});
    if((Number.isFinite(pdr) && pdr >= 0.80) || (Number.isFinite(pdrb) && pdrb >= 0.80)) tags.push({t:'Rebounder', c:'var(--accent2)'});
    if(Number.isFinite(pdrtg) && pdrtg >= 0.75) tags.push({t:'Anchor Defender', c:'var(--warn)'});
    if(Number.isFinite(pefg) && pefg >= 0.80) tags.push({t:'Efficient Finisher', c:'var(--good)'});
    if(Number.isFinite(por) && por >= 0.75) tags.push({t:'Extra Possessions', c:'var(--accent)'});
    if(Number.isFinite(p3) && p3 >= 0.75) tags.push({t:'Stretch Big', c:'var(--accent2)'});

    if(tags.length === 0) tags.push({t:'Frontcourt Role', c:'var(--muted)'});
    return tags.slice(0, 6);
  }
}

// --- Conference multiplier ---

function renderConfMultTable(){
  if(!confMultToggleEl) return;
  const isOn = confMultToggleEl.checked;
  confMultBodyEl.style.opacity = isOn ? '1' : '0.4';
  confMultBodyEl.style.pointerEvents = isOn ? 'auto' : 'none';
  confMultLeagueNote.textContent = league === 'WBB' ? '(WBB — will activate when conference column detected)' : '';

  confMultTableBody.innerHTML = '';
  CONF_DISPLAY_ORDER.forEach(conf => {
    const mult = confMultipliers[conf] ?? 1;
    const tr = document.createElement('tr');
    const isMac = conf === 'MAC';
    tr.innerHTML = `
      <td style="font-weight:${isMac?'700':'500'};${isMac?'color:var(--accent)':''}">${conf}${isMac ? ' (baseline)' : ''}</td>
      <td><input type="number" step="0.01" min="0.5" max="1.5" value="${mult.toFixed(2)}" class="confMult-input" data-conf="${conf}" style="${mult>1?'color:var(--good)':mult<1?'color:var(--bad)':'color:var(--text)'}"></td>
    `;
    confMultTableBody.appendChild(tr);
  });

  confMultTableBody.querySelectorAll('.confMult-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const conf = e.target.dataset.conf;
      const val = parseFloat(e.target.value);
      if(!Number.isFinite(val)) return;
      confMultipliers[conf] = val;
      e.target.style.color = val > 1 ? 'var(--good)' : val < 1 ? 'var(--bad)' : 'var(--text)';
      updateConfMultRange();
      if(wb) requestComputeAll(120);
    });
  });

  updateConfMultRange();
}

function updateConfMultRange(){
  if(!confMultRangeEl) return;
  const vals = CONF_DISPLAY_ORDER.map(c => confMultipliers[c] ?? 1);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  confMultRangeEl.textContent = `${mn.toFixed(2)} – ${mx.toFixed(2)}`;
}

function getConfMultiplier(confStr){
  if(!confStr) return 1;
  const c = confStr.toString().trim();
  if(confMultipliers[c] !== undefined) return confMultipliers[c];
  const alias = CONF_ALIASES[c];
  if(alias && confMultipliers[alias] !== undefined) return confMultipliers[alias];
  const cl = c.toLowerCase();
  for(const name of CONF_DISPLAY_ORDER){
    if(name.toLowerCase() === cl) return confMultipliers[name] ?? 1;
  }
  for(const [ak, av] of Object.entries(CONF_ALIASES)){
    if(ak.toLowerCase() === cl) return confMultipliers[av] ?? 1;
  }
  for(const name of CONF_DISPLAY_ORDER){
    if(cl.includes(name.toLowerCase()) || name.toLowerCase().includes(cl)) return confMultipliers[name] ?? 1;
  }
  return 1;
}

function sheetHasConference(){
  if(!rows || !rows.length) return false;
  return rows.some(r => {
    const c = (r['Conference'] ?? r['Conf'] ?? '').toString().trim();
    return c.length > 0;
  });
}

function requestComputeAll(delayMs){
  if(_computeAllTimer) clearTimeout(_computeAllTimer);
  const wait = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 120;
  _computeAllTimer = setTimeout(() => {
    _computeAllTimer = null;
    computeAll();
  }, wait);
}

// --- computeAll ---

function computeAll(options){
  options = options && typeof options === 'object' ? options : {};
  const skipRender = !!options.skipRender;
  if(_computeAllTimer){
    clearTimeout(_computeAllTimer);
    _computeAllTimer = null;
  }
  ensureWeightsCoverStats(pos, rows);

  if(!rows.length) {
    computed = [];
    if(!skipRender) renderPlayers();
    return;
  }

  const confMultOn = confMultToggleEl && confMultToggleEl.checked && sheetHasConference();

  // --- Pass 1: score + value in a single map (avoids 4 intermediate arrays) ---
  const perfArr = [];
  const mpArr = [];

  // Pre-read valuation params once
  const _starP = clamp(Number(starPctEl.value), 0.5, 0.999);
  const _mpP = clamp(Number(mpPctEl.value), 0.5, 0.999);
  const _avgPay = Number(avgPayEl.value);
  const _minPay = Number(minPayEl.value);
  const _maxPay = Number(maxPayEl.value);
  const _starValue = Number(starValueEl.value);

  // First light pass to get perfArr/mpArr for percentile anchors
  const _tempPerfs = new Float64Array(rows.length);
  const _tempRawPerfs = new Float64Array(rows.length);
  const _tempMps = new Float64Array(rows.length);
  const _tempCms = new Float64Array(rows.length);
  for(let i = 0; i < rows.length; i++){
    const r = rows[i];
    const perf = scoreRow(r);
    const cm = confMultOn ? getConfMultiplier((r['Conference'] ?? r['Conf'] ?? '').toString().trim()) : 1;
    const adjPerf = perf * cm;
    const mp = safeNum(r['MP']);
    _tempRawPerfs[i] = perf;
    _tempPerfs[i] = adjPerf;
    _tempCms[i] = cm;
    _tempMps[i] = Number.isFinite(mp) ? mp : NaN;
    if(Number.isFinite(adjPerf)) perfArr.push(adjPerf);
    if(Number.isFinite(mp)) mpArr.push(mp);
  }

  lastPerfAvg = perfArr.length ? perfArr.reduce((a,b)=>a+b,0) / perfArr.length : NaN;
  lastPerfStar = percentileInc(perfArr, _starP);
  const mpPctl = percentileInc(mpArr, _mpP);

  let k = 0;
  const denom = (lastPerfStar - lastPerfAvg);
  if(Number.isFinite(_starValue) && Number.isFinite(_avgPay) && _avgPay > 0 && Number.isFinite(denom) && Math.abs(denom) > 1e-9){
    k = Math.log(_starValue / _avgPay) / denom;
  }

  const _pickValKeys = ['Valuation','Value','ActualValuation','PredictedValue','Pay','Salary'];
  function _pickActualValuation(row){
    for(let j = 0; j < _pickValKeys.length; j++){
      const v = safeNum(row[_pickValKeys[j]]);
      if(Number.isFinite(v)) return v;
    }
    return NaN;
  }

  const projectionCtx = { confMultOn, avgPay: _avgPay, minPay: _minPay, maxPay: _maxPay, k, lastPerfAvg, perfPool: perfArr };

  // Main single-pass: score + valuation + projection + boss delta
  computed = new Array(rows.length);
  for(let i = 0; i < rows.length; i++){
    const r = rows[i];
    const adjPerf = _tempPerfs[i];
    const rawPerf = _tempRawPerfs[i];
    const mp = _tempMps[i];
    const cm = _tempCms[i];

    let pred = NaN, final = NaN, mult = 1;
    if(Number.isFinite(adjPerf) && Number.isFinite(_avgPay) && _avgPay > 0){
      pred = _avgPay * Math.exp(k * (adjPerf - lastPerfAvg));
      pred = clamp(pred, _minPay, _maxPay);
      mult = getMpMultiplier(mp, mpPctl);
      final = clamp(pred * mult, _minPay, _maxPay);
    }

    const bossRank = safeNum(r['Rank']);
    const bossVal = _pickActualValuation(r);
    const delta = (Number.isFinite(bossVal) && Number.isFinite(final)) ? (final - bossVal) : NaN;
    const deltaPct = (Number.isFinite(delta) && bossVal !== 0) ? (delta / bossVal) : NaN;

    const out = Object.assign({}, r, {
      PerfScore_calc: adjPerf, PerfScore_raw: rawPerf, ConfMult_calc: cm, MP_num: mp,
      Score: adjPerf, PredictedValue_calc: pred, MinMultiplier_calc: mult, ActualValuation_calc: final,
      BossRank: bossRank, ActualValuation: bossVal, ValueDelta_calc: delta, ValueDeltaPct_calc: deltaPct,
    });
    Object.assign(out, projectionCalcMetrics(out, projectionCtx));
    out._searchStr = ((out.Player || '') + ' ' + (out.Team || '') + ' ' + (out.Conference || out.Conf || '') + ' ' + (out.Position || out.Pos || '') + ' ' + (out.Height || '')).toLowerCase();
    computed[i] = out;
  }

  // --- Pass 2: stat distributions → fit score + cached percentiles ---
  buildStatDistributions();

  // Pre-compute percentiles for key stats used in scout report / profile
  var _pctStats = Object.keys(statDist);
  for(let i = 0; i < computed.length; i++){
    var _r = computed[i];
    _r.FitScore_calc = fitScoreForRow(_r);
    // Cache percentiles as _pct_<stat> on each player row
    for(var _si = 0; _si < _pctStats.length; _si++){
      var _s = _pctStats[_si];
      var _x = safeNum(_r[_s]);
      _r['_pct_' + _s] = (_x !== null) ? statPercentile(_s, _x) : NaN;
    }
  }

  const ranked = computed.slice().sort((a,b)=>{
    const pa = a.PerfScore_calc, pb = b.PerfScore_calc;
    const fa = a.FitScore_calc, fb = b.FitScore_calc;
    if(Number.isFinite(pa) && Number.isFinite(pb) && pa !== pb) return pb - pa;
    if(Number.isFinite(fa) && Number.isFinite(fb) && fa !== fb) return fb - fa;
    return String(a.Player||'').localeCompare(String(b.Player||''));
  });
  ranked.forEach((r,i)=>{ r.CalcRank = i + 1; });

  kpiPlayers.textContent = String(computed.length);
  kpiAvgPerf.textContent = Number.isFinite(lastPerfAvg) ? lastPerfAvg.toFixed(2) : '—';
  kpiStarPerf.textContent = Number.isFinite(lastPerfStar) ? lastPerfStar.toFixed(2) : '—';

  tbAllComputed[league + '_' + pos] = computed.slice();
  _cachedAllPlayers = null; // invalidate player pool cache

  // Apply inferred class from career data (if available)
  _applyInferredClassToPool(computed);
  _applyInferredClassToPool(rows);

  if(!skipRender) renderPlayers();
}

// --- Google Sheets load ---

async function loadFromGoogleSheets(url, apiKey){
  url = url || DEFAULT_GS_URL;
  apiKey = apiKey || DEFAULT_GS_API_KEY;
  var loadingOverlayEl = document.getElementById('loadingOverlay');
  var isInitialLoad = loadingOverlayEl && !loadingOverlayEl.classList.contains('hidden');

  function setProgress(pct, msg) { /* no-op: video loading screen has no progress bar */ }

  function finishIfInitial() {
    if (isInitialLoad && typeof authFinishLoading === 'function') authFinishLoading();
  }

  try{
    const sid = extractSpreadsheetId(url);
    if(!sid) { showWarn('Could not parse spreadsheet ID from the link.'); finishIfInitial(); return; }
    if(!apiKey) { showWarn('Missing API key.'); finishIfInitial(); return; }

    const ranges = [
      `${SHEET_MAP.MBB}!A1:ZZ`,
      `${SHEET_MAP.WBB}!A1:ZZ`,
    ];

    const qs = ranges.map(r => 'ranges=' + encodeURIComponent(r)).join('&');
    const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values:batchGet?key=${encodeURIComponent(apiKey)}&valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS&${qs}`;

    setProgress(10, 'Connecting to Google Sheets…');
    if (!isInitialLoad) showWarn('Loading from Google Sheets…');
    const res = await fetch(endpoint);
    setProgress(40, 'Downloading player data…');
    const data = await res.json();

    if(!res.ok){
      const msg = data?.error?.message || ('Google Sheets API error ('+res.status+')');
      showWarn(msg);
      finishIfInitial(); return;
    }
    if(!data.valueRanges || !data.valueRanges.length){
      showWarn('No data returned from Google Sheets API. Check permissions + sheet names.');
      finishIfInitial(); return;
    }

    setProgress(55, 'Processing spreadsheet data…');

    wb = { SheetNames: [], Sheets: {} };
    data.valueRanges.forEach(vr => {
      const range = vr.range || '';
      let sheetName = range.split('!')[0] || 'Sheet';
      sheetName = sheetName.replace(/^'(.*)'$/, '$1');
      const aoa = vr.values || [];
      wb.SheetNames.push(sheetName);
      wb.Sheets[sheetName] = { __aoa: aoa };
    });

    const need = [SHEET_MAP.MBB, SHEET_MAP.WBB];
    const missing = need.filter(n => !wb.SheetNames.includes(n) && !findSheetLike(n));
    if(missing.length){
      showWarn(`Missing sheet(s): ${missing.join(', ')}. Found: ${wb.SheetNames.join(', ')}`);
    } else {
      clearWarn();
    }

    resetWeightsBtn.disabled = false;
    recalcBtn.disabled = false;
    exportBtn.disabled = false;

    setProgress(65, 'Computing player scores…');

    // Use requestAnimationFrame to let the progress bar paint before heavy computation
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    _dataApplyActiveLeagueConfig({ forceDefaults: true, alwaysReloadData: true });

    setProgress(90, 'Caching all positions…');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    setProgress(100, 'Ready!');

    // Signal loading complete — reveal dashboard
    if (isInitialLoad && typeof authFinishLoading === 'function') {
      authFinishLoading();
    }
  }catch(err){
    showWarn(String(err?.message || err));
    // Even on error, finish loading so user isn't stuck
    if (isInitialLoad && typeof authFinishLoading === 'function') {
      authFinishLoading();
    }
  }
}

// ── loadFromCBData — College Basketball Data API (MBB only) ────────────────
async function loadFromCBData(year) {
  year = year || 2026;
  _currentDataSeason = parseInt(year, 10) || 2026;
  var WORKER = 'https://hidden-salad-773b.bryanhkwan.workers.dev';
  var loadingOverlayEl = document.getElementById('loadingOverlay');
  var isInitialLoad = loadingOverlayEl && !loadingOverlayEl.classList.contains('hidden');

  function finishIfInitial() {
    if (isInitialLoad && typeof authFinishLoading === 'function') authFinishLoading();
  }

  try {
    _mbbActivePlayersRef = null;
    if (!isInitialLoad) showWarn('Loading from College Basketball API…');

    const res = await fetch(WORKER + '/api/cbdata/players?season=' + encodeURIComponent(year));
    const data = await res.json();

    if (!res.ok) {
      showWarn(data.error || data.message || ('College Basketball API error (' + res.status + ')'));
      finishIfInitial(); return;
    }
    if (!data.players || !data.players.length) {
      showWarn('No players returned from College Basketball API (season ' + year + ').');
      finishIfInitial(); return;
    }

    // Build a synthetic workbook that parseSheetToRows() can consume.
    // Structure mirrors what loadFromGoogleSheets() builds:
    //   wb.Sheets[sheetName].__aoa = [[header1, header2, …], [val1, val2, …], …]
    var players = data.players;
    _mbbActivePlayersRef = players;
    var headers = Object.keys(players[0]).filter(function(k){ return !k.startsWith('_'); });
    var aoa = [headers].concat(players.map(function(p){
      return headers.map(function(h){ return p[h] !== undefined ? p[h] : ''; });
    }));

    wb = {
      SheetNames: [SHEET_MAP.MBB, SHEET_MAP.WBB],
      Sheets: {},
    };
    wb.Sheets[SHEET_MAP.MBB] = { __aoa: aoa };
    // WBB is not available from this API — placeholder keeps the tab from crashing
    wb.Sheets[SHEET_MAP.WBB] = { __aoa: [['Player','Team','Conference','Pos']] };

    clearWarn();
    resetWeightsBtn.disabled = false;
    recalcBtn.disabled       = false;
    exportBtn.disabled       = false;

    // Force MBB (API covers MBB only)
    if (league !== 'MBB') {
      league = 'MBB';
      var lmbb = document.getElementById('lsLabelMBB');
      var lwbb = document.getElementById('lsLabelWBB');
      var lsi  = document.getElementById('leagueSwitchInput');
      if (lmbb) lmbb.classList.add('active');
      if (lwbb) lwbb.classList.remove('active');
      if (lsi)  lsi.checked = false;
      if (typeof applyLeagueTheme === 'function') applyLeagueTheme('MBB');
    }

    _dataApplyActiveLeagueConfig({ forceDefaults: true, alwaysReloadData: true });

    finishIfInitial();

    // Background enrichment for MBB — fills Height from ESPN rosters.
    if (players && players.length) {
      _mbbLoadHeightsBackground(players, year).catch(() => {});
    }

  } catch (err) {
    showWarn('College Basketball API error: ' + (err.message || err));
    finishIfInitial();
  }
}

async function _loadMbbSheetData(year) {
  const WORKER = 'https://hidden-salad-773b.bryanhkwan.workers.dev';
  let res;
  let data = {};
  try {
    res = await fetch(WORKER + '/api/cbdata/players?season=' + encodeURIComponent(year));
    data = await res.json().catch(function(){ return {}; });
  } catch (err) {
    return { players: [], warning: 'Could not load MBB data: ' + (err && err.message ? err.message : err) };
  }
  if (!res || !res.ok) {
    return { players: [], warning: (data && (data.error || data.message)) || ('Could not load MBB data (HTTP ' + (res ? res.status : 'network') + ')') };
  }
  if (!data.players || !data.players.length) {
    return { players: [], warning: 'No MBB players returned from API (season ' + year + ').' };
  }
  return { players: data.players, warning: '' };
}

async function _loadWbbSheetData(year) {
  const warnings = [];
  const [wbbPlayersSettled, wbbTeamsSettled] = await Promise.allSettled([
    _wbbLoadAllPlayerPages(year),
    fetch(WORKER_URL + '/api/wbb/teams?season=' + encodeURIComponent(year)).then(function(r){ return r.json(); }),
  ]);

  if (!(wbbPlayersSettled.status === 'fulfilled' && wbbPlayersSettled.value && wbbPlayersSettled.value.length)) {
    const errText = wbbPlayersSettled.reason ? String(wbbPlayersSettled.reason) : 'ESPN byathlete fetch failed';
    return { players: [], warning: 'Could not load WBB data: ' + errText };
  }

  const players = wbbPlayersSettled.value;
  if (wbbTeamsSettled.status === 'fulfilled' && wbbTeamsSettled.value && wbbTeamsSettled.value.teams) {
    const teamsMap = wbbTeamsSettled.value.teams;
    const nameToTeamData = {};
    Object.values(teamsMap).forEach(function(td){
      if (td.location)     nameToTeamData[td.location.toLowerCase()] = td;
      if (td.displayName)  nameToTeamData[td.displayName.toLowerCase()] = td;
      if (td.abbreviation) nameToTeamData[td.abbreviation.toLowerCase()] = td;
      if (td.name)         nameToTeamData[td.name.toLowerCase()] = td;
    });
    players.forEach(function(player){
      const tid = String(player.TeamId || '');
      let teamData = tid ? teamsMap[tid] : null;
      if (!teamData && player.Team) teamData = nameToTeamData[player.Team.toLowerCase()] || null;
      if (teamData) {
        player.Team = teamData.location || teamData.displayName || player.Team;
        player.Conference = teamData.conference || '';
      }
    });
  } else {
    warnings.push('WBB team mapping was unavailable during load.');
  }

  players.forEach(_calcWbbDerivedStats);
  return { players: players, warning: warnings.join(' | ') };
}

async function ensureLeagueDataLoaded(targetLeague, year, opts) {
  opts = opts && typeof opts === 'object' ? opts : {};
  const seasonKey = _dataSeasonKey(year);
  if (!_leagueDataStatus[targetLeague] || _leagueDataStatus[targetLeague].season !== seasonKey) {
    _leagueDataStatus[targetLeague] = { season: seasonKey, ready: false, loading: false, error: '', promise: null };
  }
  const status = _leagueDataStatus[targetLeague];
  if (status.ready && status.season === seasonKey) return { loaded: true, warning: '' };
  if (status.loading && status.promise) return status.promise;

  _dataEnsureWorkbookShell();
  status.loading = true;
  status.error = '';
  status.promise = (async function(){
    try {
      const result = targetLeague === 'WBB'
        ? await _loadWbbSheetData(seasonKey)
        : await _loadMbbSheetData(seasonKey);

      if (_leagueDataStatus[targetLeague] !== status || status.season !== seasonKey) return { loaded: false, warning: '' };

      if (result.players && result.players.length) {
        if (targetLeague === 'MBB') _mbbActivePlayersRef = result.players;
        else _wbbActivePlayersRef = result.players;
        _dataCommitLeaguePlayers(targetLeague, result.players);
        status.ready = true;

        if (opts.refreshIfActive && targetLeague === league) {
          clearWarn();
          _dataApplyActiveLeagueConfig({ forceDefaults: false, alwaysReloadData: true });
          _scheduleTeamListRefresh(120);
        }

        if (result.players.length) {
          if (targetLeague === 'WBB') {
            scheduleNonCriticalWork(function(){ _wbbLoadHeightsBackground(result.players, seasonKey).catch(() => {}); }, opts.background ? 1400 : 800);
          } else {
            scheduleNonCriticalWork(function(){ _mbbLoadHeightsBackground(result.players, seasonKey).catch(() => {}); }, opts.background ? 1400 : 800);
          }
        }

        if (result.warning) console.warn(result.warning);
        return { loaded: true, warning: result.warning || '' };
      }

      status.ready = false;
      status.error = result.warning || ('Could not load ' + targetLeague + ' data.');
      _dataCommitLeaguePlayers(targetLeague, []);
      if (opts.userVisible && targetLeague === league && typeof showWarn === 'function') showWarn(status.error);
      else if (status.error) console.warn(status.error);
      return { loaded: false, warning: status.error };
    } catch (err) {
      if (_leagueDataStatus[targetLeague] !== status || status.season !== seasonKey) return { loaded: false, warning: '' };
      status.ready = false;
      status.error = targetLeague + ' load error: ' + (err && err.message ? err.message : err);
      _dataCommitLeaguePlayers(targetLeague, []);
      if (opts.userVisible && targetLeague === league && typeof showWarn === 'function') showWarn(status.error);
      else console.warn(status.error);
      return { loaded: false, warning: status.error };
    } finally {
      if (_leagueDataStatus[targetLeague] === status && status.season === seasonKey) {
        status.loading = false;
        status.promise = null;
      }
    }
  })();

  return status.promise;
}

// ── loadAllData — MBB from CBD API, WBB from ESPN/worker-backed sources ──────
async function loadAllData(year) {
  year = typeof normalizeDashboardSeason === 'function' ? normalizeDashboardSeason(year, '2026') : String(year || '2026');
  _currentDataSeason = parseInt(year, 10) || 2026;
  var loadingOverlayEl = document.getElementById('loadingOverlay');
  var isInitialLoad = loadingOverlayEl && !loadingOverlayEl.classList.contains('hidden');
  var primaryLeague = league === 'WBB' ? 'WBB' : 'MBB';
  var secondaryLeague = primaryLeague === 'MBB' ? 'WBB' : 'MBB';

  function finishIfInitial() {
    if (isInitialLoad && typeof authFinishLoading === 'function') authFinishLoading();
  }

  try {
    _dataResetWorkbookShell(year);
    teamRatings = {};
    allRatingsData = [];
    _ratingsReady = false;

    if (!isInitialLoad) showWarn('Loading ' + primaryLeague + ' data…');

    const primaryResult = await ensureLeagueDataLoaded(primaryLeague, year, {
      userVisible: !isInitialLoad,
      refreshIfActive: false,
      background: false,
    });

    if (primaryResult && primaryResult.loaded) clearWarn();
    else if (primaryResult && primaryResult.warning) showWarn(primaryResult.warning);

    resetWeightsBtn.disabled = false;
    recalcBtn.disabled       = false;
    exportBtn.disabled       = false;

    if (_careerDataReady) _inferClassFromCareerData();

    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    _dataApplyActiveLeagueConfig({ forceDefaults: true, alwaysReloadData: true });
    _scheduleTeamListRefresh(160);
    finishIfInitial();

    // Use the remaining intro-video time to prefetch non-critical data before the user interacts.
    // Phase 1 (~0.35s): active league ratings
    scheduleNonCriticalWork(function(){
      loadTeamRatings(year, primaryLeague).then(() => {
        _scheduleTeamListRefresh(120);
        _scheduleValueLabDataChange(160);
      }).catch(() => {});
    }, isInitialLoad ? 350 : 700);

    // Phase 2 (~1.2s): secondary league player data so MBB↔WBB switches are already warm
    scheduleNonCriticalWork(function(){
      ensureLeagueDataLoaded(secondaryLeague, year, {
        userVisible: false,
        refreshIfActive: true,
        background: true,
      }).then(function(result){
        if (result && result.loaded) {
          scheduleNonCriticalWork(function(){
            loadTeamRatings(year, secondaryLeague, { applyToGlobals: false }).catch(() => {});
          }, 700);
        }
      }).catch(() => {});
    }, isInitialLoad ? 1200 : 2200);

    // Phase 3 (8s): Career data — 5 API fetches, heavyweight. Deferred until user is settled.
    if (!_careerDataReady && !_careerDataPromise) {
      scheduleNonCriticalWork(function(){ loadCareerSeasons().catch(() => {}); }, 8000);
    }

    _scheduleValueLabDataChange(isInitialLoad ? 260 : 120);

  } catch (err) {
    showWarn('Data load error: ' + (err.message || err));
    finishIfInitial();
  }
}

// ── loadCareerSeasons — background-fetch 2022–2026 for career history ────────
async function loadCareerSeasons() {
  if (_careerDataReady) return careerData;
  if (_careerDataPromise) return _careerDataPromise;

  _careerDataPromise = (async function(){
    const WORKER = 'https://hidden-salad-773b.bryanhkwan.workers.dev';
    const years = [2022, 2023, 2024, 2025, 2026];

    const results = await Promise.allSettled(
      years.map(y => fetch(WORKER + '/api/cbdata/players?season=' + y).then(r => r.json()))
    );

    careerData = {};
    results.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      const seasonYear = years[i];
      const players = result.value.players || [];
      players.forEach(p => {
        const key = (p.Player || '').toLowerCase().trim();
        if (!key) return;
        if (!careerData[key]) careerData[key] = [];
        careerData[key].push(Object.assign({}, p, { _season: seasonYear }));
      });
    });

    Object.keys(careerData).forEach(k => {
      careerData[k].sort((a, b) => a._season - b._season);
    });

    _careerDataReady = true;
    _inferClassFromCareerData();
    _applyInferredClassAll();
    // Class inference is display-only — no need to re-run the full scoring pipeline.
    // Just re-render the player table to show updated class labels.
    if (typeof renderPlayers === 'function') scheduleNonCriticalWork(function(){ renderPlayers(); }, 120);

    if (typeof window._onCareerDataReady === 'function') {
      window._onCareerDataReady();
      window._onCareerDataReady = null;
    }

    return careerData;
  })();

  try {
    return await _careerDataPromise;
  } finally {
    _careerDataPromise = null;
  }
}

// ── Class inference from multi-season career data ────────────────────────────
// Same logic as tools/build-draft-dataset.js inferClass()
function _inferClassFromCareerData() {
  _inferredClassMap = {};
  var keys = Object.keys(careerData);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var entries = careerData[key];
    if (!entries || !entries.length) continue;
    var firstSeason = entries[0]._season; // sorted oldest → newest
    var years = _currentDataSeason - firstSeason;
    if (years <= 0)      _inferredClassMap[key] = 'Fr';
    else if (years === 1) _inferredClassMap[key] = 'So';
    else if (years === 2) _inferredClassMap[key] = 'Jr';
    else                  _inferredClassMap[key] = 'Sr';
  }
}

function _applyInferredClassToPool(pool) {
  if (!pool || !pool.length || !Object.keys(_inferredClassMap).length) return;
  for (var i = 0; i < pool.length; i++) {
    var r = pool[i];
    if (r.Class) continue;
    var key = (r.Player || '').toLowerCase().trim();
    if (_inferredClassMap[key]) {
      r.Class = _inferredClassMap[key];
    }
  }
}

function _applyInferredClassAll() {
  _applyInferredClassToPool(computed);
  _applyInferredClassToPool(rows);
  var keys = Object.keys(tbAllComputed);
  for (var i = 0; i < keys.length; i++) {
    _applyInferredClassToPool(tbAllComputed[keys[i]]);
  }
  _cachedAllPlayers = null;
}

// ── Shared worker URL ──────────────────────────────────────────────────────
var WORKER_URL = 'https://hidden-salad-773b.bryanhkwan.workers.dev';

// ── loadTeamRatings — adjusted efficiency + SRS for all teams ─────────────
async function loadTeamRatings(year) {
  var targetLeague = arguments.length > 1 && (arguments[1] === 'MBB' || arguments[1] === 'WBB')
    ? arguments[1]
    : (league === 'WBB' ? 'WBB' : 'MBB');
  var opts = arguments.length > 2 && arguments[2] && typeof arguments[2] === 'object' ? arguments[2] : {};
  year = year || 2026;
  const seasonKey = _dataSeasonKey(year);
  const cacheKey = targetLeague + ':' + seasonKey;
  const applyToGlobals = opts.applyToGlobals !== false;

  function applyTeams(teams){
    allRatingsData = Array.isArray(teams) ? teams.slice() : [];
    teamRatings = {};
    allRatingsData.forEach(function(t){
      if (t && t.team) teamRatings[t.team.toLowerCase()] = t;
    });
    _ratingsReady = allRatingsData.length > 0;
    if (typeof window._onRatingsReady === 'function') {
      window._onRatingsReady();
      window._onRatingsReady = null;
    }
  }

  if (_ratingsCache[cacheKey]) {
    if (applyToGlobals) applyTeams(_ratingsCache[cacheKey]);
    return _ratingsCache[cacheKey];
  }

  if (!_ratingsLoads[cacheKey]) {
    _ratingsLoads[cacheKey] = (async function(){
      const endpoint = targetLeague === 'WBB'
        ? WORKER_URL + '/api/wbb/ratings?season=' + seasonKey
        : WORKER_URL + '/api/cbdata/ratings?season=' + seasonKey;
      const r = await fetch(endpoint);
      if (!r.ok) return [];
      const data = await r.json();
      const teams = (data.teams || []).filter(function(t){ return +t.season === +seasonKey; });
      _ratingsCache[cacheKey] = teams;
      return teams;
    })().catch(function(e){
      console.warn('loadTeamRatings failed:', e);
      return [];
    }).finally(function(){
      delete _ratingsLoads[cacheKey];
    });
  }

  const teams = await _ratingsLoads[cacheKey];
  if (applyToGlobals) applyTeams(teams);
  return teams;
}

// ── loadShootingForTeam — shot-type breakdown for a team's players ───────────
async function loadShootingForTeam(team, year) {
  year = year || 2026;
  const key = (team + ':' + year).toLowerCase();
  if (teamShootingCache[key]) return teamShootingCache[key];
  try {
    const r = await fetch(WORKER_URL + '/api/cbdata/shooting?team=' + encodeURIComponent(team) + '&season=' + year);
    if (!r.ok) return [];
    const data = await r.json();
    teamShootingCache[key] = data.players || [];
    return teamShootingCache[key];
  } catch (e) {
    return [];
  }
}

// ── loadWbbConferenceStanding — fetch conference W/L/rank from ESPN standings ──
var _wbbStandingsCache = {}; // season -> { teamId: {confWins, confLosses, confRank, overallWins, overallLosses} }
async function loadWbbConferenceStanding(teamId, year) {
  if (!teamId) return null;
  year = typeof normalizeDashboardSeason === 'function' ? normalizeDashboardSeason(year, String(_currentDataSeason || 2026)) : String(year || _currentDataSeason || 2026);
  if (!_wbbStandingsCache[year]) {
    _wbbStandingsCache[year] = {};
    try {
      const url = 'https://site.web.api.espn.com/apis/v2/sports/basketball/womens-college-basketball/standings?region=us&lang=en&contentorigin=espn&type=0&level=1&sort=gamesbehind%3Aasc%2Cwins%3Adesc%2Closses%3Aasc&limit=500&groups=50&season=' + encodeURIComponent(year);
      const data = await fetch(url).then(r => r.json()).catch(() => null);
      const entries = (data && data.standings && data.standings.entries) || [];
      entries.forEach(e => {
        const tid = String(e.team && e.team.id || '');
        if (!tid) return;
        const statMap = {};
        (e.stats || []).forEach(s => { statMap[s.name] = s; });
        _wbbStandingsCache[year][tid] = {
          confWins:   statMap.wins          ? parseInt(statMap.wins.value)   : null,
          confLosses: statMap.losses        ? parseInt(statMap.losses.value) : null,
          confRank:   statMap.playoffSeed   ? parseInt(statMap.playoffSeed.value) : null,
          confPct:    statMap.leagueWinPercent ? statMap.leagueWinPercent.displayValue : null,
          gamesBehind: statMap.gamesBehind  ? statMap.gamesBehind.displayValue : null,
          rank:       e.team.rank           || null,
        };
      });
    } catch(_) {}
  }
  return (_wbbStandingsCache[year] && _wbbStandingsCache[year][String(teamId)]) || null;
}

// ── loadTeamStats — full team season stats (offense + defense + four factors) ─
async function loadTeamStats(team, year) {
  year = year || 2026;
  const key = (team + ':' + year).toLowerCase();
  if (teamStatsCache[key] !== undefined) return teamStatsCache[key];
  try {
    if (league === 'WBB') {
      // ESPN team stats — called directly from browser (CORS-friendly)
      const teamId = await _wbbEspnTeamId(team);
      if (!teamId) { teamStatsCache[key] = null; return null; }
      const [statsResp, standing] = await Promise.all([
        fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/teams/${teamId}/statistics?season=${year}`),
        loadWbbConferenceStanding(teamId, year),
      ]);
      if (!statsResp.ok) { teamStatsCache[key] = null; return null; }
      const data = await statsResp.json();
      const result = _mapEspnTeamStats(data);
      if (result && standing) result.conferenceStanding = standing;
      teamStatsCache[key] = result;
      return teamStatsCache[key];
    }
    const r = await fetch(WORKER_URL + '/api/cbdata/teamstats?team=' + encodeURIComponent(team) + '&season=' + year);
    if (!r.ok) return null;
    const data = await r.json();
    teamStatsCache[key] = data.stats || null;
    return teamStatsCache[key];
  } catch (e) { return null; }
}

// ── loadTeamShootingZones — team-level shooting zone breakdown ────────────────
async function loadTeamShootingZones(team, year) {
  year = year || 2026;
  const key = (team + ':' + year).toLowerCase();
  if (teamShootingZonesCache[key] !== undefined) return teamShootingZonesCache[key];
  try {
    if (league === 'WBB') {
      // Derive zone profile from WBB play-by-play so Team DNA can render a heatmap.
      const teamId = await _wbbEspnTeamId(team);
      const gamesData = await loadGamesForTeam(team, year);
      const games = (gamesData && gamesData.games) ? gamesData.games : [];
      if (!teamId || !games.length) { teamShootingZonesCache[key] = null; return null; }

      const completed = games.filter(g => g && g.id && g.completed !== false);
      if (!completed.length) { teamShootingZonesCache[key] = null; return null; }

      const playsArrays = await Promise.all(completed.map(g => loadPlaysForGame(g.id)));
      let rimAtt=0, rimMade=0, midAtt=0, midMade=0, threeAtt=0, threeMade=0, ftAtt=0, ftMade=0;
      let oppRimAtt=0, oppRimMade=0, oppMidAtt=0, oppMidMade=0, oppThreeAtt=0, oppThreeMade=0, oppFtAtt=0, oppFtMade=0;

      completed.forEach((g, idx) => {
        const arr = playsArrays[idx] || [];
        arr.forEach(s => {
          const tid = String(s && s.teamId || '');
          // Keep only plays with team attribution so we can split offense/defense.
          if (!tid) return;
          const ours = tid === String(teamId);
          const made = !!(s && s.made);
          const r = s && s.range;
          if (ours) {
            if (r === 'rim') { rimAtt++; if (made) rimMade++; }
            else if (r === 'jumper') { midAtt++; if (made) midMade++; }
            else if (r === 'three_pointer') { threeAtt++; if (made) threeMade++; }
            else if (r === 'free_throw') { ftAtt++; if (made) ftMade++; }
          } else {
            if (r === 'rim') { oppRimAtt++; if (made) oppRimMade++; }
            else if (r === 'jumper') { oppMidAtt++; if (made) oppMidMade++; }
            else if (r === 'three_pointer') { oppThreeAtt++; if (made) oppThreeMade++; }
            else if (r === 'free_throw') { oppFtAtt++; if (made) oppFtMade++; }
          }
        });
      });

      const nonFt = Math.max(1, rimAtt + midAtt + threeAtt);
      const pct = (m,a) => a > 0 ? +(m / a * 100).toFixed(1) : null;
      const vol = a => +(a / nonFt * 100).toFixed(1);

      const tracked = rimAtt + midAtt + threeAtt;
      const ftr = tracked > 0 ? +(ftAtt / tracked * 100).toFixed(1) : null;
      const oppFga = oppRimAtt + oppMidAtt + oppThreeAtt;
      const oppFgm = oppRimMade + oppMidMade + oppThreeMade;
      const oppEfg = oppFga > 0 ? +(((oppFgm + 0.5 * oppThreeMade) / oppFga) * 100).toFixed(1) : null;
      const oppFtr = oppFga > 0 ? +((oppFtMade / oppFga) * 100).toFixed(1) : null;

      const derived = {
        // Map rim attempts into restricted-area bucket used by existing heatmap function.
        dunks: { attempted: rimAtt, made: rimMade, pct: pct(rimMade, rimAtt) },
        tipIns: { attempted: 0, made: 0, pct: null },
        layups: { attempted: 0, made: 0, pct: null },
        twoPointJumpers: { attempted: midAtt, made: midMade, pct: pct(midMade, midAtt) },
        threePointJumpers: { attempted: threeAtt, made: threeMade, pct: pct(threeMade, threeAtt) },
        freeThrows: { attempted: ftAtt, made: ftMade, pct: pct(ftMade, ftAtt) },
        trackedShots: tracked,
        assistedPct: null,
        freeThrowRate: ftr,
        attemptsBreakdown: {
          dunks: vol(rimAtt),
          tipIns: 0,
          layups: 0,
          twoPointJumpers: vol(midAtt),
          threePointJumpers: vol(threeAtt),
        },
        defenseFourFactors: {
          effectiveFieldGoalPct: oppEfg,
          turnoverRatio: null,
          offensiveReboundPct: null,
          freeThrowRate: oppFtr,
        },
      };

      teamShootingZonesCache[key] = derived;
      return derived;
    }
    const r = await fetch(WORKER_URL + '/api/cbdata/teamshooting?team=' + encodeURIComponent(team) + '&season=' + year);
    if (!r.ok) return null;
    const data = await r.json();
    teamShootingZonesCache[key] = data.shooting || null;
    return teamShootingZonesCache[key];
  } catch (e) { return null; }
}

// ── loadGamesForTeam — season game log + team box scores ─────────────────────
async function loadGamesForTeam(team, year) {
  year = year || 2026;
  const key = (team + ':' + year).toLowerCase();
  if (teamGamesCache[key]) return teamGamesCache[key];
  try {
    if (league === 'WBB') {
      // ESPN schedule — called directly from browser (CORS-friendly)
      const teamId = await _wbbEspnTeamId(team);
      if (!teamId) { teamGamesCache[key] = null; return null; }
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/teams/${teamId}/schedule?season=${year}`);
      if (!r.ok) { teamGamesCache[key] = null; return null; }
      const data = await r.json();
      teamGamesCache[key] = _mapEspnScheduleToGames(data, team);
      return teamGamesCache[key];
    }
    const r = await fetch(WORKER_URL + '/api/cbdata/games?team=' + encodeURIComponent(team) + '&season=' + year);
    if (!r.ok) return null;
    const data = await r.json();
    teamGamesCache[key] = data;
    return data;
  } catch (e) {
    return null;
  }
}

// ── loadPlaysForGame — compact shot-by-shot data for one game ───────────────
async function loadPlaysForGame(gameId) {
  if (playsCache[gameId]) return playsCache[gameId];
  try {
    const endpoint = league === 'WBB'
      ? WORKER_URL + '/api/wbb/plays?gameId=' + gameId
      : WORKER_URL + '/api/cbdata/plays?gameId=' + gameId;
    const r = await fetch(endpoint);
    if (!r.ok) return [];
    const data = await r.json();
    playsCache[gameId] = data.plays || [];
    return playsCache[gameId];
  } catch (e) { return []; }
}

// ── loadPlayerShots — all season shots for one player via the worker ──────────
async function loadPlayerShots(team, season, playerName, espnId) {
  if (!team || !season || !playerName) return [];
  const key = (team + ':' + season + ':' + playerName).toLowerCase();
  if (playerShotsCache[key]) return playerShotsCache[key];
  try {
    const endpoint = league === 'WBB'
      ? WORKER_URL + '/api/wbb/playershots?team=' + encodeURIComponent(team) +
        '&season=' + encodeURIComponent(season) +
        '&playerName=' + encodeURIComponent(playerName) +
        (espnId ? '&espnId=' + encodeURIComponent(espnId) : '')
      : WORKER_URL + '/api/cbdata/playershots?team=' + encodeURIComponent(team) +
        '&season=' + encodeURIComponent(season) +
        '&playerName=' + encodeURIComponent(playerName);
    const r = await fetch(endpoint);
    const data = await r.json();
    const shots = data.shots || [];
    playerShotsCache[key] = shots;
    return shots;
  } catch (e) { return []; }
}

// ── WBB helpers — ESPN team ID lookup, derived stats, team stats mapping ──────

// Fetch all WBB player stat pages directly from ESPN byathlete API (CORS-friendly).
// Returns array of player objects with raw stats and _FGM/_FGA/etc. totals for derived stat calc.
async function _wbbLoadAllPlayerPages(year) {
  const base = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/womens-college-basketball/statistics/byathlete';
  let p1;
  try {
    p1 = await fetch(`${base}?limit=100&page=1&season=${year}`).then(r => r.json());
  } catch(e) { return []; }

  const totalPages = (p1.pagination && p1.pagination.pages) || 1;
  // Schema: top-level d.categories[i].names; per-athlete: entry.categories[i].totals
  const schema = (p1.categories || []).map(cat => cat.names || []);

  function parseStats(entry) {
    const stats = {};
    schema.forEach((names, ci) => {
      const vals = (entry.categories[ci] && entry.categories[ci].totals) || [];
      names.forEach((n, ni) => { stats[n] = parseFloat(vals[ni]) || 0; });
    });
    return stats;
  }

  // Fetch remaining pages in parallel batches of 20 (browser has no subrequest limits)
  const allPages = [p1];
  const CHUNK = 20;
  for (let start = 2; start <= totalPages; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, totalPages);
    const nums = [];
    for (let n = start; n <= end; n++) nums.push(n);
    const chunk = await Promise.all(
      nums.map(n => fetch(`${base}?limit=100&page=${n}&season=${year}`).then(r => r.json()).catch(() => null))
    );
    chunk.forEach(r => { if (r && r.athletes) allPages.push(r); });
  }

  const players = [];
  allPages.forEach(page => {
    (page.athletes || []).forEach(entry => {
      const ath = entry.athlete || {};
      if (!ath.displayName) return;
      const stats = parseStats(entry);
      players.push({
        Player:  ath.displayName || '',
        Team:    ath.teamName    || '',
        TeamId:  ath.teamId      || null,
        EspnId:  ath.id          || null,
        Conference: '',
        Pos:     (ath.position && ath.position.abbreviation) || '',
        Height:  '',
        Class:   '',
        Hometown: '',
        G:       stats.gamesPlayed || 0,
        MP:      +(stats.avgMinutes  || 0).toFixed(1),
        PPG:     +(stats.avgPoints   || 0).toFixed(1),
        'FG%':   stats.fieldGoalPct           ? +(stats.fieldGoalPct / 100).toFixed(4)           : 0,
        '3P%':   stats.threePointFieldGoalPct ? +(stats.threePointFieldGoalPct / 100).toFixed(4) : 0,
        'FT%':   stats.freeThrowPct           ? +(stats.freeThrowPct / 100).toFixed(4)           : 0,
        RPG:     +(stats.avgRebounds  || 0).toFixed(1),
        APG:     +(stats.avgAssists   || 0).toFixed(1),
        TOPG:    +(stats.avgTurnovers || 0).toFixed(2),
        SPG:     +(stats.avgSteals    || 0).toFixed(2),
        BPG:     +(stats.avgBlocks    || 0).toFixed(2),
        '3PA/G': +(stats.avgThreePointFieldGoalsAttempted || 0).toFixed(1),
        _FGM:    stats.fieldGoalsMade               || 0,
        _FGA:    stats.fieldGoalsAttempted           || 0,
        _3PM:    stats.threePointFieldGoalsMade      || 0,
        _3PA:    stats.threePointFieldGoalsAttempted || 0,
        _FTM:    stats.freeThrowsMade                || 0,
        _FTA:    stats.freeThrowsAttempted           || 0,
        _AST:    stats.assists    || 0,
        _TOV:    stats.turnovers  || 0,
        _PTS:    stats.points     || 0,
      });
    });
  });
  return players;
}

// Background enrichment after initial WBB load — populates Height, Class, Hometown.
// Fetches ESPN team rosters for the selected season in batches, keyed by EspnId.
async function _wbbEnrichPlayersBackground(players, season) {
  season = typeof normalizeDashboardSeason === 'function' ? normalizeDashboardSeason(season, String(_currentDataSeason || 2026)) : String(season || _currentDataSeason || 2026);
  if (!players || !players.length) return;
  const seasonKey = String(season);
  const teamIds = [...new Set(players.map(p => String(p.TeamId || '')).filter(Boolean))];
  const seasonBioMap = _wbbBiosBySeason[seasonKey] || (_wbbBiosBySeason[seasonKey] = {});
  const fetchedTeams = _wbbFetchedTeamsBySeason[seasonKey] || (_wbbFetchedTeamsBySeason[seasonKey] = {});

  function fmtClass(exp) {
    if (!exp) return '';
    const abbr = exp.abbreviation || exp.displayValue || '';
    if (abbr) return abbr;
    const yr = parseInt(exp.year || exp.yearValue || 0);
    return yr === 1 ? 'Fr' : yr === 2 ? 'So' : yr === 3 ? 'Jr' : yr === 4 ? 'Sr' : '';
  }
  function fmtHometown(bp) {
    if (!bp) return '';
    const parts = [bp.city, bp.state || bp.country].filter(Boolean);
    return parts.join(', ');
  }
  function mergeBio(existing, incoming) {
    return {
      height:   (incoming && incoming.height)   || (existing && existing.height)   || 0,
      classYr:  (incoming && incoming.classYr)  || (existing && existing.classYr)  || '',
      hometown: (incoming && incoming.hometown) || (existing && existing.hometown) || '',
    };
  }
  function applyCachedBios(targetPlayers) {
    let updated = 0;
    targetPlayers.forEach(p => {
      const bio = p && p.EspnId ? (seasonBioMap[String(p.EspnId)] || _wbbBioByAthlete[String(p.EspnId)] || null) : null;
      if (!bio) return;
      if (bio.height   && !p.Height)   { p.Height   = bio.height;   updated++; }
      if (bio.classYr  && !p.Class)    { p.Class    = bio.classYr;  updated++; }
      if (bio.hometown && !p.Hometown) { p.Hometown = bio.hometown; updated++; }
    });
    return updated;
  }
  function commitPlayersSheet() {
    if (!wb || !wb.Sheets || !players.length) return;
    if (_wbbActivePlayersRef && players !== _wbbActivePlayersRef) return;
    const headers = Object.keys(players[0]).filter(k => !k.startsWith('_'));
    const aoa = [headers].concat(players.map(p => headers.map(h => p[h] !== undefined ? p[h] : '')));
    wb.Sheets[SHEET_MAP.WBB] = { __aoa: aoa };
    if (league === 'WBB') reloadActiveSheet();
  }
  function parseDisplayHeightInches(value) {
    const m = String(value || '').match(/(\d+)\s*'\s*(\d+)/);
    if (!m) return 0;
    return (parseInt(m[1], 10) * 12) + parseInt(m[2], 10);
  }
  function fetchBioPageHeight(espnId) {
    const id = String(espnId || '');
    if (!id) return Promise.resolve(null);
    if (_wbbBioPageCache[id]) return Promise.resolve(_wbbBioPageCache[id]);
    if (_wbbBioPageLoads[id]) return _wbbBioPageLoads[id];
    const promise = fetch(`https://www.espn.com/womens-college-basketball/player/bio/_/id/${id}`)
      .then(r => r.ok ? r.text() : '')
      .then(html => {
        const match = String(html || '').match(/"displayHeight"\s*:\s*"([^"]+)"/i);
        const height = match ? parseDisplayHeightInches(match[1]) : 0;
        const bio = height ? { height: height, classYr: '', hometown: '' } : null;
        if (bio) _wbbBioPageCache[id] = bio;
        return bio;
      })
      .catch(() => null)
      .finally(() => { delete _wbbBioPageLoads[id]; });
    _wbbBioPageLoads[id] = promise;
    return promise;
  }

  let updated = applyCachedBios(players);
  const unfetchedTeamIds = teamIds.filter(tid => tid && !fetchedTeams[tid]);
  if (!unfetchedTeamIds.length) {
    if (updated > 0) commitPlayersSheet();
    return;
  }

  function fetchSeasonRosters(ids) {
    const promise = (async function() {
      const CHUNK = 25;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const batch = ids.slice(i, i + CHUNK);
        const rosterResps = await Promise.all(batch.map(tid =>
          fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/teams/${tid}/roster?season=${seasonKey}`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        ));
        rosterResps.forEach((rd, idx) => {
          const tid = batch[idx];
          if (!rd) return;
          fetchedTeams[tid] = true;
          (rd.athletes || []).forEach(a => {
            if (!a.id) return;
            const espnId = String(a.id);
            const bio = {
              height:   Number(a.height) || 0,
              classYr:  fmtClass(a.experience),
              hometown: fmtHometown(a.birthPlace),
            };
            seasonBioMap[espnId] = mergeBio(seasonBioMap[espnId], bio);
            _wbbBioByAthlete[espnId] = mergeBio(_wbbBioByAthlete[espnId], bio);
          });
        });
      }
    })();
    return promise.finally(() => {
      if (_wbbBioLoadsBySeason[seasonKey] === promise) delete _wbbBioLoadsBySeason[seasonKey];
    });
  }

  let loadPromise = _wbbBioLoadsBySeason[seasonKey];
  if (!loadPromise) {
    loadPromise = fetchSeasonRosters(unfetchedTeamIds);
    _wbbBioLoadsBySeason[seasonKey] = loadPromise;
  }

  try {
    await loadPromise;
  } catch (_) { }

  const unresolvedBioIds = [...new Set(
    players
      .filter(p => p && p.EspnId && !p.Height)
      .map(p => String(p.EspnId))
      .filter(id => id && !_wbbBioPageCache[id])
  )];
  if (unresolvedBioIds.length) {
    const bioResults = await Promise.all(unresolvedBioIds.map(fetchBioPageHeight));
    bioResults.forEach((bio, idx) => {
      const espnId = unresolvedBioIds[idx];
      if (!bio) return;
      seasonBioMap[espnId] = mergeBio(seasonBioMap[espnId], bio);
      _wbbBioByAthlete[espnId] = mergeBio(_wbbBioByAthlete[espnId], bio);
    });
  }

  updated += applyCachedBios(players);
  if (updated > 0) commitPlayersSheet();
}
var _wbbLoadHeightsBackground = _wbbEnrichPlayersBackground;

// Background enrichment after MBB load — populates Height from ESPN team rosters.
// This intentionally runs after CBD data is loaded so it cannot affect CBD API logic.
async function _mbbEnrichPlayersBackground(players, season) {
  season = typeof normalizeDashboardSeason === 'function' ? normalizeDashboardSeason(season, String(_currentDataSeason || 2026)) : String(season || _currentDataSeason || 2026);
  if (!players || !players.length) return;
  const seasonKey = String(season);

  const norm = s => String(s || '')
    .toLowerCase()
    .replace(/\b(university|college|of|the|at)\b/g, '')
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const seasonBioMap = _mbbHeightsBySeason[seasonKey] || (_mbbHeightsBySeason[seasonKey] = {});
  const fetchedTeams = _mbbFetchedTeamsBySeason[seasonKey] || (_mbbFetchedTeamsBySeason[seasonKey] = {});

  function applyCachedHeights(targetPlayers) {
    let updated = 0;
    targetPlayers.forEach(p => {
      if (!p || p.Height) return;
      const playerKey = norm(p.Player);
      if (!playerKey) return;
      const tid = _mbbTeamIdCache[norm(p.Team)] || '';
      const espnKey = p.EspnId ? ('id:' + String(p.EspnId)) : '';
      const h = (espnKey ? seasonBioMap[espnKey] : 0) || (tid ? seasonBioMap[tid + '|' + playerKey] : 0) || _mbbHeightNameCache[playerKey] || 0;
      if (!h) return;
      p.Height = h;
      updated++;
    });
    return updated;
  }

  function commitPlayersSheet() {
    if (!wb || !wb.Sheets || !players.length) return;
    if (_mbbActivePlayersRef && players !== _mbbActivePlayersRef) return;
    const headers = Object.keys(players[0]).filter(k => !k.startsWith('_'));
    if (headers.indexOf('Height') === -1) headers.push('Height');
    const aoa = [headers].concat(players.map(p => headers.map(h => p[h] !== undefined ? p[h] : '')));
    wb.Sheets[SHEET_MAP.MBB] = { __aoa: aoa };
    if (league === 'MBB') {
      reloadActiveSheet();
      if (typeof _currentProfilePlayer !== 'undefined' && _currentProfilePlayer && _currentProfilePlayer.Player) {
        const fresh = computed.find(p => p.Player === _currentProfilePlayer.Player && p.Team === _currentProfilePlayer.Team);
        if (fresh && fresh.Height && typeof openProfile === 'function') openProfile(fresh);
      }
    }
  }

  let updated = applyCachedHeights(players);

  // Build team name -> ESPN team id cache once.
  if (!_mbbTeamIdCache._loaded) {
    try {
      const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=500');
      const data = await r.json();
      const teams = ((((data.sports || [])[0] || {}).leagues || [])[0] || {}).teams || [];
      teams.forEach(e => {
        const t = e && e.team;
        if (!t || !t.id) return;
        [t.displayName, t.shortDisplayName, t.location, t.name, t.abbreviation]
          .filter(Boolean)
          .forEach(n => { _mbbTeamIdCache[norm(n)] = String(t.id); });
      });
    } catch (_) { }
    _mbbTeamIdCache._loaded = true;
  }

  updated += applyCachedHeights(players);

  const seenTeamIds = {};
  const teamIds = [];
  players.forEach(p => {
    const id = _mbbTeamIdCache[norm(p && p.Team)] || '';
    if (!id || seenTeamIds[id] || fetchedTeams[id]) return;
    seenTeamIds[id] = true;
    teamIds.push(id);
  });

  if (!teamIds.length) {
    if (updated > 0) commitPlayersSheet();
    return;
  }

  function fetchSeasonRosters(ids) {
    const promise = (async function() {
      const CHUNK = 25;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const batch = ids.slice(i, i + CHUNK);
        const rosterResps = await Promise.all(batch.map(tid =>
          fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/' + tid + '/roster?season=' + encodeURIComponent(seasonKey))
            .then(r => r.ok ? r.json() : null)
            .catch(() => null)
        ));
        rosterResps.forEach((rd, idx) => {
          if (!rd) return;
          const tid = batch[idx];
          fetchedTeams[tid] = true;
          (rd.athletes || []).forEach(a => {
            const h = a && Number(a.height);
            const n = norm(a && a.displayName);
            if (!h || !n) return;
            if (a && a.id) seasonBioMap['id:' + String(a.id)] = h;
            seasonBioMap[tid + '|' + n] = h;
            if (!_mbbHeightNameCache[n]) _mbbHeightNameCache[n] = h;
          });
        });
      }
    })();
    return promise.finally(() => {
      if (_mbbHeightLoadsBySeason[seasonKey] === promise) delete _mbbHeightLoadsBySeason[seasonKey];
    });
  }

  let loadPromise = _mbbHeightLoadsBySeason[seasonKey];
  if (!loadPromise) {
    loadPromise = fetchSeasonRosters(teamIds);
    _mbbHeightLoadsBySeason[seasonKey] = loadPromise;
  }

  try {
    await loadPromise;
  } catch (_) { }

  updated += applyCachedHeights(players);
  if (updated > 0) commitPlayersSheet();
}
var _mbbLoadHeightsBackground = _mbbEnrichPlayersBackground;

// Resolve ESPN team name → team ID (fetches once per session, caches in memory)
async function _wbbEspnTeamId(teamName) {
  const norm = s => s.toLowerCase().replace(/\b(university|college|of|the|at)\b/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const key = norm(teamName);
  if (_wbbTeamIdCache[key]) return _wbbTeamIdCache[key];
  if (!_wbbTeamIdCache._loaded) {
    try {
      const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/womens-college-basketball/teams?limit=500');
      const data = await r.json();
      (((data.sports || [])[0] || {}).leagues || [])[0]?.teams?.forEach(e => {
        const t = e.team;
        [t.displayName, t.shortDisplayName, t.location, t.name, t.abbreviation]
          .filter(Boolean).forEach(n => { _wbbTeamIdCache[norm(n)] = t.id; });
      });
    } catch(_) {}
    _wbbTeamIdCache._loaded = true;
  }
  return _wbbTeamIdCache[key] || null;
}

// Calculate WBB advanced stats in-place from raw ESPN totals; deletes _ prefixed fields
// Only computes stats that are genuinely derivable from ESPN byathlete data.
// BPM, WS/40, DRtg, OR%, DR% are NOT available for WBB — not set here.
function _calcWbbDerivedStats(p) {
  const fgm = p._FGM || 0, fga = p._FGA || 0;
  const m3  = p._3PM  || 0;
  const fta = p._FTA  || 0;
  const pts = p._PTS  || 0;
  const ast = p._AST  || 0, tov = p._TOV  || 0;
  const g   = p.G     || 1;

  p['eFG%'] = fga > 0 ? +((fgm + 0.5 * m3) / fga).toFixed(4) : 0;
  p['TS%']  = (fga + 0.44 * fta) > 0 ? +(pts / (2 * (fga + 0.44 * fta))).toFixed(4) : 0;
  p['A/TO'] = tov > 0 ? +(ast / tov).toFixed(2) : 0;
  // Ensure 3P% is decimal not whole-percent
  if (p['3P%'] > 1) p['3P%'] = +(p['3P%'] / 100).toFixed(4);
  // USG% approximated from player volume vs estimated WBB team possession-actions
  // NCAA WBB avg: ~57 FGA/g + 0.44×22 FTA/g + 14 TOV/g ≈ 80.7 possession-actions/game
  const fgaPG = fga / g, ftaPG = fta / g;
  p['USG%'] = +((fgaPG + 0.44 * ftaPG + p.TOPG) / 80.7 * 100).toFixed(1);
  // Clean up temp fields
  delete p._FGM; delete p._FGA; delete p._3PM; delete p._3PA;
  delete p._FTM; delete p._FTA; delete p._AST; delete p._TOV; delete p._PTS;
}

// Map ESPN team statistics API response → statsData format expected by thRenderDNA/thRenderTeamScout
function _mapEspnTeamStats(data) {
  // Flatten ESPN stats categories into a named lookup
  const raw = {};
  function extractStats(items) {
    (items || []).forEach(s => {
      if (s.name && s.value !== undefined) raw[s.name] = s.value;
    });
  }
  // Try multiple ESPN response formats
  if (data.results && data.results.stats) {
    (data.results.stats.categories || []).forEach(cat => extractStats(cat.stats || []));
  }
  if (Array.isArray(data.statistics)) {
    data.statistics.forEach(cat => {
      extractStats(cat.stats || []);
      // ESPN sometimes puts values directly in the category
      if (cat.name && cat.value !== undefined) raw[cat.name] = cat.value;
    });
  }

  const g   = raw.gamesPlayed || 1;
  const fgm = (raw.avgFieldGoalsMade      || 0) * g;
  const fga = (raw.avgFieldGoalsAttempted || 0) * g;
  const tpm = (raw.avgThreePointFieldGoalsMade      || 0) * g;
  const tpa = (raw.avgThreePointFieldGoalsAttempted || 0) * g;
  const ftm = (raw.avgFreeThrowsMade      || 0) * g;
  const fta = (raw.avgFreeThrowsAttempted || 0) * g;
  const ast = (raw.avgAssists    || 0) * g;
  const tov = (raw.avgTurnovers  || 0) * g;
  const pts = (raw.avgPoints     || 0) * g;
  const oreb= (raw.avgOffensiveRebounds || 0) * g;
  const dreb= (raw.avgDefensiveRebounds || 0) * g;
  const hasInPaint = raw.avgPointsInPaint != null;
  const hasFastBreak = raw.avgFastBreakPoints != null || raw.avgPointsInTransition != null || raw.avgPointsFastBreak != null;
  const hasOffTov = raw.avgPointsOffTurnovers != null || raw.avgPtsOffTurnovers != null;
  const inPaint = hasInPaint ? (raw.avgPointsInPaint * g) : null;
  const fastBreakPts = hasFastBreak ? ((raw.avgFastBreakPoints || raw.avgPointsInTransition || raw.avgPointsFastBreak || 0) * g) : null;
  const offTovPts = hasOffTov ? ((raw.avgPointsOffTurnovers || raw.avgPtsOffTurnovers || 0) * g) : null;

  const efgPct = fga > 0 ? +((fgm + 0.5 * tpm) / fga * 100).toFixed(1) : null;
  const tovRate= (fga + 0.44 * fta + tov) > 0 ? +(tov / (fga + 0.44 * fta + tov)).toFixed(4) : null;
  const orebPct= (oreb + dreb) > 0 ? +(oreb / (oreb + dreb) * 100).toFixed(1) : null;
  const ftrPct = fga > 0 ? +(ftm / fga * 100).toFixed(1) : null;

  return {
    games: g,
    pace: raw.possessionsPerGame || raw.avgPossessions || null,
    teamStats: {
      points: { total: pts, inPaint, fastBreak: fastBreakPts, offTurnovers: offTovPts },
      fieldGoals: { made: fgm, attempted: fga },
      threePointFieldGoals: { attempted: tpa },
      assists: ast,
      turnovers: tov,
      fourFactors: {
        effectiveFieldGoalPct: efgPct,
        turnoverRatio:         tovRate,
        offensiveReboundPct:   orebPct,
        freeThrowRate:         ftrPct,
      },
    },
    opponentStats: null,
  };
}

// Map ESPN team schedule → game list format used by thLoadMatchup
function _mapEspnScheduleToGames(data, teamName) {
  // ESPN sometimes returns score as object {value, displayValue} or plain string/number
  const parseScore = s => {
    if (s == null) return null;
    const n = typeof s === 'object' ? parseInt(s.value != null ? s.value : s.displayValue) : parseInt(s);
    return isNaN(n) ? null : n;
  };
  const games = (data.events || [])
    .filter(e => e.competitions && e.competitions[0])
    .map(e => {
      const comp  = e.competitions[0];
      const comps = comp.competitors || [];
      const home  = comps.find(c => c.homeAway === 'home') || {};
      const away  = comps.find(c => c.homeAway === 'away') || {};
      // Prefer location ("Ohio") over displayName ("Ohio Bobcats") so it matches thCurrentTeam
      return {
        id:         e.id,
        startDate:  e.date || '',
        homeTeam:   (home.team && (home.team.location || home.team.displayName || home.team.name)) || '',
        homeTeamId: (home.team && home.team.id) ? String(home.team.id) : '',
        awayTeam:   (away.team && (away.team.location || away.team.displayName || away.team.name)) || '',
        awayTeamId: (away.team && away.team.id) ? String(away.team.id) : '',
        homePoints: parseScore(home.score),
        awayPoints: parseScore(away.score),
        completed:  !!(comp.status && comp.status.type && comp.status.type.completed),
      };
    });
  return { games, teamStats: [] };
}

// ── loadRecruitingData — multi-class recruiting data ─────────────────────────
async function loadRecruitingData() {
  if (_recruitingReady && recruitingCache.length) return recruitingCache;
  try {
    const r = await fetch(WORKER_URL + '/api/cbdata/recruiting?seasons=2025,2024,2023,2022');
    if (!r.ok) return [];
    const data = await r.json();
    recruitingCache = data.recruits || [];
    _recruitingReady = true;
    return recruitingCache;
  } catch (e) {
    return [];
  }
}

function waitForXLSX(timeoutMs=5000){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(!_xlsxLoadPromise){
    _xlsxLoadPromise = loadScriptOnce(
      'xlsx',
      [
        'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js',
        './xlsx.full.min.js'
      ],
      {
        timeoutMs: timeoutMs,
        test: function(){ return window.XLSX; },
        errorMessage: 'XLSX library not loaded. Put xlsx.full.min.js next to this HTML.'
      }
    );
  }
  return _xlsxLoadPromise;
}

// --- League/pos functions ---

function applyLeagueDefaults(force){
  if(league === 'MBB'){
    if(force || avgPayEl.value === '' || Number(avgPayEl.value) === 35000){
      avgPayEl.value = 70000; minPayEl.value = 10000; maxPayEl.value = 300000;
    }
    if(force || starValueEl.value === '' || Number(starValueEl.value) === 70000){
      starValueEl.value = 150000;
    }
  }else{
    if(force || avgPayEl.value === '' || Number(avgPayEl.value) === 70000){
      avgPayEl.value = 35000; minPayEl.value = 5000; maxPayEl.value = 100000;
    }
    if(force || starValueEl.value === '' || Number(starValueEl.value) === 150000){
      starValueEl.value = 70000;
    }
  }
}

function applyLeagueTheme(lg){
  document.body.classList.toggle('wbb', lg === 'WBB');
  const swInput = document.getElementById('leagueSwitchInput');
  if(swInput) swInput.checked = (lg === 'WBB');
  const mbbLabel = document.getElementById('lsLabelMBB');
  const wbbLabel = document.getElementById('lsLabelWBB');
  if(mbbLabel) mbbLabel.classList.toggle('active', lg === 'MBB');
  if(wbbLabel) wbbLabel.classList.toggle('active', lg === 'WBB');
}

function switchLeague(newLeague){
  if(league === newLeague) return;

  // Save current league's rosters before switching
  leagueRosters[league].tb = tbRoster.slice();
  leagueRosters[league].opp = oppRoster.slice();

  // Clear current rosters
  tbRoster.length = 0;
  oppRoster.length = 0;

  // Switch league
  league = newLeague;
  setActiveTab(document.getElementById(`tab${newLeague}`), '.tab[data-league]');
  applyLeagueTheme(newLeague);
  _dataApplyActiveLeagueConfig({ forceDefaults: false, alwaysReloadData: true });
  if(!_isLeagueDataLoaded(newLeague, _currentDataSeason)){
    showWarn('Loading ' + newLeague + ' data…');
    ensureLeagueDataLoaded(newLeague, _currentDataSeason, {
      userVisible: true,
      refreshIfActive: true,
      background: false,
    }).catch(() => {});
  }

  // Restore new league's saved rosters
  leagueRosters[newLeague].tb.forEach(r => tbRoster.push(r));
  leagueRosters[newLeague].opp.forEach(r => oppRoster.push(r));

  // Defer heavy Team Builder and Opponent UI refresh to next frame
  requestAnimationFrame(function(){
    tbRefresh();
    oppRefresh();
  });

  // Defer team ratings + team list refresh to avoid blocking the thread
  scheduleNonCriticalWork(function(){
    loadTeamRatings(_currentDataSeason, newLeague).then(() => {
      _scheduleTeamListRefresh(120);
      _scheduleValueLabDataChange(160);
    }).catch(() => {});
  }, 300);

  // Defer conference multiplier table render
  requestAnimationFrame(function(){ if(!_evalPresetsLoaded()) renderConfMultTable(); });

  var portalPage = document.getElementById('pagePortal');
  if (typeof loadPortalEntries === 'function' && portalPage && portalPage.style.display !== 'none') {
    loadPortalEntries();
  } else {
    if (typeof portalRefreshTeamOptions === 'function') portalRefreshTeamOptions();
    if (typeof portalRefreshScenarioRows === 'function') portalRefreshScenarioRows();
  }

  // Notify AI chat that league changed (clears stale roster context from history)
  if (typeof window._chatOnLeagueSwitch === 'function') window._chatOnLeagueSwitch(newLeague);
  _scheduleValueLabDataChange(120);
}

function switchPos(newPos){
  pos = newPos;
}

function reloadActiveSheet(){
  if(!wb) return;
  clearWarn();
  const sheetName = findSheetLike(SHEET_MAP[league]) || SHEET_MAP[league];
  activeSheetEl.textContent = league + ' ' + pos;

  const ws = wb.Sheets[sheetName];
  if(!ws){
    showWarn(`Could not find sheet "${sheetName}" in the workbook. Check sheet names.`);
    rows = []; computed = []; renderPlayers(); return;
  }
  const cachedRows = _dataGetLeagueRows(league);
  if(!cachedRows){
    rows = []; computed = []; renderPlayers(); return;
  }
  const guards = cachedRows.guards || [];
  const bigs = cachedRows.bigs || [];

  rows = pos === 'Guards' ? guards : bigs;
  ensureWeightsCoverStats(pos, rows);
  renderWeights();
  computeAll({ skipRender: true });

  const sibPos = pos === 'Guards' ? 'Bigs' : 'Guards';
  const sibRows = pos === 'Guards' ? bigs : guards;
  if(sibRows.length){
    try{
      const savedPos = pos, savedRows = rows, savedComputed = computed;
      pos = sibPos;
      rows = sibRows;
      ensureWeightsCoverStats(pos, rows);
      computeAll({ skipRender: true });
      pos = savedPos; rows = savedRows; computed = savedComputed;
      ensureWeightsCoverStats(pos, rows);
    }catch(e){
      console.error('Sibling computation failed:', e);
      pos = pos === sibPos ? (sibPos === 'Guards' ? 'Bigs' : 'Guards') : pos;
    }
  }
  renderPlayers();
}

function exportCSV(){
  const cols = ['Rank','Player','Team','Conference','ConfMult_calc','Position','MP','Score','ProjectionPerf_calc','ProjectionFloorPerf_calc','ProjectionCeilingPerf_calc','FitScore_calc','PredictedValue_calc','ActualValuation_calc','ProjectionMedianValue_calc','ProjectionFloorValue_calc','ProjectionCeilingValue_calc','ProjectionConfidence_calc','ProjectionMedicalRiskLabel_calc','ProjectionManualBoostLabel_calc','ProjectionManualMedicalFlag_calc'];
  const lines = [];
  lines.push(cols.map(c => `"${c.replaceAll('"','""')}"`).join(','));
  computed.forEach(r => {
    const row = cols.map(c => `"${(r[c] ?? '').toString().replaceAll('"','""')}"`).join(',');
    lines.push(row);
  });
  const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scouting_${league.toLowerCase()}_${pos.toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Class wrapper (organizational) ---
class DataManager {
  initDOMRefs(){ return initDataDOMRefs(); }
  get wb(){ return wb; }
  get league(){ return league; }
  get pos(){ return pos; }
  get rows(){ return rows; }
  get computed(){ return computed; }
  get playerValueView(){ return playerValueView; }
  get statDist(){ return statDist; }
  get currentWeights(){ return currentWeights; }
  get tbAllComputed(){ return tbAllComputed; }
  loadScoringWeight(){ return loadScoringWeight(); }
  renderWeights(){ return renderWeights(); }
  renderConfMultTable(){ return renderConfMultTable(); }
  computeAll(){ return computeAll(); }
  requestComputeAll(delayMs){ return requestComputeAll(delayMs); }
  reloadActiveSheet(){ return reloadActiveSheet(); }
  applyLeagueDefaults(force){ return applyLeagueDefaults(force); }
  loadFromGoogleSheets(url, key){ return loadFromGoogleSheets(url, key); }
  exportCSV(){ return exportCSV(); }
  showWarn(msg){ return showWarn(msg); }
  clearWarn(){ return clearWarn(); }
  setPlayerValueView(mode, opts){ return setPlayerValueView(mode, opts); }
  openProjectionScoutModal(row){ return openProjectionScoutModal(row); }
  closeProjectionScoutModal(){ return closeProjectionScoutModal(); }
  getProjectionScoutOverride(row){ return projectionGetScoutOverride(row); }
  setActiveTab(el, sel){ return setActiveTab(el, sel); }
  applyLeagueTheme(lg){ return applyLeagueTheme(lg); }
  switchLeague(lg){ return switchLeague(lg); }
  switchPos(p){ return switchPos(p); }
}

window.DataManager = new DataManager();
