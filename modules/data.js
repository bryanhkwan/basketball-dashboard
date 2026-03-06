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

// Career history cache — keyed by player name (lowercase), value: [{_season, ...stats}, …]
var careerData = {};
var _careerDataReady = false;

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
var recruitingCache   = []; // flat array of recruit objects across multiple class years
var _recruitingReady  = false;

// Live working copy (user-editable) — keyed by canonical name only
var confMultipliers = JSON.parse(JSON.stringify(DEFAULT_CONF_VALUES));

// --- DOM refs (queried once at module level) ---
var gsUrlInput, gsKeyInput, loadGsBtn, recalcBtn, exportBtn, resetWeightsBtn, resetValBtn;
var searchInput, warn, fitPresetEl, weightsBody, showSelectedOnlyEl, advancedDirEl;
var playersHead, playersBody, activeSheetEl, activeFitEl;
var wTotalLocalEl, wRemainingEl, wOverBoxEl, wOverEl;
var kpiPlayers, kpiStats, kpiTotalW, kpiAvgPerf, kpiStarPerf;
var avgPayEl, minPayEl, maxPayEl, starValueEl, starPctEl, mpModeEl, mpPctEl;
var modalBack, mClose, mTitle, mSub, mScore, mFit, mVal, mMult, mMeta, mBars, mAllStats, mTags;
var confMultToggleEl, confMultBodyEl, confMultTableBody, confMultRangeEl, confMultLeagueNote, resetConfMultBtn;

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
    'Player','Name','Team','School','Conference','Conf','Position','Pos','Class','Yr','Year','ID','URL','Link',
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
  excelWeights = {Guards: JSON.parse(JSON.stringify(GUARD_DEFAULTS)), Bigs: JSON.parse(JSON.stringify(BIG_DEFAULTS))};
  currentWeights = {Guards: JSON.parse(JSON.stringify(GUARD_DEFAULTS)), Bigs: JSON.parse(JSON.stringify(BIG_DEFAULTS))};
  baseStatsAll = [...new Set([...GUARD_DEFAULTS.map(x=>x.stat), ...BIG_DEFAULTS.map(x=>x.stat)])];
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
      if(wb) computeAll();
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
      if(wb) computeAll();
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

// --- computeAll ---

function computeAll(){
  ensureWeightsCoverStats(pos, rows);

  if(!rows.length) { computed = []; renderPlayers(); return; }

  const confMultOn = confMultToggleEl && confMultToggleEl.checked && sheetHasConference();

  computed = rows.map(r => {
    const perf = scoreRow(r);
    const mp = safeNum(r['MP']);
    const conf = (r['Conference'] ?? r['Conf'] ?? '').toString().trim();
    const cm = confMultOn ? getConfMultiplier(conf) : 1;
    const adjPerf = perf * cm;
    return {...r, PerfScore_calc: adjPerf, PerfScore_raw: perf, ConfMult_calc: cm, MP_num: mp};
  });

  const perfArr = computed.map(r => r.PerfScore_calc).filter(Number.isFinite);
  lastPerfAvg = perfArr.reduce((a,b)=>a+b,0) / (perfArr.length || 1);

  const starP = clamp(Number(starPctEl.value), 0.5, 0.999);
  lastPerfStar = percentileInc(perfArr, starP);

  const mpP = clamp(Number(mpPctEl.value), 0.5, 0.999);
  const mpArr = computed.map(r => r.MP_num).filter(Number.isFinite);
  const mpPctl = percentileInc(mpArr, mpP);

  const avgPay = Number(avgPayEl.value);
  const minPay = Number(minPayEl.value);
  const maxPay = Number(maxPayEl.value);
  const starValue = Number(starValueEl.value);

  let k = 0;
  const denom = (lastPerfStar - lastPerfAvg);
  if(Number.isFinite(starValue) && Number.isFinite(avgPay) && avgPay > 0 && Number.isFinite(denom) && Math.abs(denom) > 1e-9){
    k = Math.log(starValue / avgPay) / denom;
  }

  computed = computed.map(r => {
    const perf = r.PerfScore_calc;
    const mp = r.MP_num;

    let pred = NaN, final = NaN, mult = 1;
    if(Number.isFinite(perf) && Number.isFinite(avgPay) && avgPay > 0){
      pred = avgPay * Math.exp(k * (perf - lastPerfAvg));
      pred = clamp(pred, minPay, maxPay);
      mult = getMpMultiplier(mp, mpPctl);
      final = clamp(pred * mult, minPay, maxPay);
    }
    return {...r,
      Score: perf,
      PredictedValue_calc: pred,
      MinMultiplier_calc: mult,
      ActualValuation_calc: final
    };
  });

  buildStatDistributions();
  computed = computed.map(r => ({...r, FitScore_calc: fitScoreForRow(r)}));

  function pickActualValuation(row){
    const keys = ['Valuation','Value','ActualValuation','ActualValuation','PredictedValue','Pay','Salary'];
    for(const k of keys){
      const v = safeNum(row[k]);
      if(Number.isFinite(v)) return v;
    }
    return NaN;
  }

  computed = computed.map(r => {
    const bossRank = safeNum(r['Rank']);
    const bossVal = pickActualValuation(r);
    const delta = (Number.isFinite(bossVal) && Number.isFinite(r.ActualValuation_calc)) ? (r.ActualValuation_calc - bossVal) : NaN;
    const deltaPct = (Number.isFinite(delta) && Number.isFinite(bossVal) && bossVal !== 0) ? (delta / bossVal) : NaN;
    return {...r, BossRank: bossRank, ActualValuation: bossVal, ValueDelta_calc: delta, ValueDeltaPct_calc: deltaPct};
  });

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

  renderPlayers();
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
    applyLeagueDefaults(true);
    renderWeights();
    activeFitEl.textContent = fitPresetEl.options[fitPresetEl.selectedIndex].text;

    // Use requestAnimationFrame to let the progress bar paint before heavy computation
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    reloadActiveSheet();

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
  var WORKER = 'https://hidden-salad-773b.bryanhkwan.workers.dev';
  var loadingOverlayEl = document.getElementById('loadingOverlay');
  var isInitialLoad = loadingOverlayEl && !loadingOverlayEl.classList.contains('hidden');

  function finishIfInitial() {
    if (isInitialLoad && typeof authFinishLoading === 'function') authFinishLoading();
  }

  try {
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

    applyLeagueDefaults(true);
    renderWeights();
    activeFitEl.textContent = fitPresetEl.options[fitPresetEl.selectedIndex].text;

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

    reloadActiveSheet();
    finishIfInitial();

  } catch (err) {
    showWarn('College Basketball API error: ' + (err.message || err));
    finishIfInitial();
  }
}

// ── loadAllData — MBB from CBD API, WBB from Google Sheets (parallel) ────────
async function loadAllData(year) {
  year = year || 2026;
  var WORKER = 'https://hidden-salad-773b.bryanhkwan.workers.dev';
  var loadingOverlayEl = document.getElementById('loadingOverlay');
  var isInitialLoad = loadingOverlayEl && !loadingOverlayEl.classList.contains('hidden');

  function finishIfInitial() {
    if (isInitialLoad && typeof authFinishLoading === 'function') authFinishLoading();
  }

  try {
    if (!isInitialLoad) showWarn('Loading data…');

    // Build Google Sheets URL for WBB only
    const sid = extractSpreadsheetId(DEFAULT_GS_URL);
    const wbbRange = encodeURIComponent(SHEET_MAP.WBB + '!A1:ZZ');
    const sheetsUrl = 'https://sheets.googleapis.com/v4/spreadsheets/' + sid +
      '/values:batchGet?key=' + encodeURIComponent(DEFAULT_GS_API_KEY) +
      '&valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS&ranges=' + wbbRange;

    // Fetch both sources in parallel
    const [mbbSettled, wbbSettled] = await Promise.allSettled([
      fetch(WORKER + '/api/cbdata/players?season=' + encodeURIComponent(year)),
      fetch(sheetsUrl)
    ]);

    wb = { SheetNames: [SHEET_MAP.MBB, SHEET_MAP.WBB], Sheets: {} };
    const warnings = [];

    // — MBB from CBD API —
    if (mbbSettled.status === 'fulfilled' && mbbSettled.value.ok) {
      const data = await mbbSettled.value.json();
      if (data.players && data.players.length) {
        const players = data.players;
        const headers = Object.keys(players[0]).filter(k => !k.startsWith('_'));
        const aoa = [headers].concat(players.map(p => headers.map(h => p[h] !== undefined ? p[h] : '')));
        wb.Sheets[SHEET_MAP.MBB] = { __aoa: aoa };
      } else {
        warnings.push('No MBB players returned from API (season ' + year + ').');
        wb.Sheets[SHEET_MAP.MBB] = { __aoa: [['Player','Team','Conference','Pos']] };
      }
    } else {
      const errText = mbbSettled.reason ? String(mbbSettled.reason) : 'HTTP ' + (mbbSettled.value && mbbSettled.value.status);
      warnings.push('Could not load MBB data: ' + errText);
      wb.Sheets[SHEET_MAP.MBB] = { __aoa: [['Player','Team','Conference','Pos']] };
    }

    // — WBB from Google Sheets —
    if (wbbSettled.status === 'fulfilled' && wbbSettled.value.ok) {
      const sheetsData = await wbbSettled.value.json();
      const vr = sheetsData.valueRanges && sheetsData.valueRanges[0];
      wb.Sheets[SHEET_MAP.WBB] = { __aoa: vr ? (vr.values || []) : [] };
    } else {
      const errText = wbbSettled.reason ? String(wbbSettled.reason) : 'HTTP ' + (wbbSettled.value && wbbSettled.value.status);
      warnings.push('Could not load WBB data: ' + errText);
      wb.Sheets[SHEET_MAP.WBB] = { __aoa: [['Player','Team','Conference','Pos']] };
    }

    if (warnings.length) showWarn(warnings.join(' | '));
    else clearWarn();

    resetWeightsBtn.disabled = false;
    recalcBtn.disabled       = false;
    exportBtn.disabled       = false;

    applyLeagueDefaults(true);
    renderWeights();
    activeFitEl.textContent = fitPresetEl.options[fitPresetEl.selectedIndex].text;

    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    reloadActiveSheet();
    // Refresh Teams Hub team dropdown whenever data reloads
    if (typeof thRefreshTeamList === 'function') thRefreshTeamList();
    // Populate career history in background — does not block initial render
    _careerDataReady = false;
    loadCareerSeasons().catch(() => {});
    // Populate team ratings in background — used by profiles and Team Hub
    _ratingsReady = false;
    loadTeamRatings(year).then(() => {
      // Second refresh after ratings load so team search has full team list
      if (typeof thRefreshTeamList === 'function') thRefreshTeamList();
    }).catch(() => {});
    finishIfInitial();

  } catch (err) {
    showWarn('Data load error: ' + (err.message || err));
    finishIfInitial();
  }
}

// ── loadCareerSeasons — background-fetch 2022–2026 for career history ────────
async function loadCareerSeasons() {
  const WORKER = 'https://hidden-salad-773b.bryanhkwan.workers.dev';
  const years = [2022, 2023, 2024, 2025, 2026];

  const results = await Promise.allSettled(
    years.map(y => fetch(WORKER + '/api/cbdata/players?season=' + y).then(r => r.json()))
  );

  careerData = {};
  results.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    const year = years[i];
    const players = result.value.players || [];
    players.forEach(p => {
      const key = (p.Player || '').toLowerCase().trim();
      if (!key) return;
      if (!careerData[key]) careerData[key] = [];
      careerData[key].push(Object.assign({}, p, { _season: year }));
    });
  });

  // Sort each player's history oldest → newest
  Object.keys(careerData).forEach(k => {
    careerData[k].sort((a, b) => a._season - b._season);
  });

  _careerDataReady = true;
  if (typeof window._onCareerDataReady === 'function') {
    window._onCareerDataReady();
    window._onCareerDataReady = null;
  }
}

// ── Shared worker URL ──────────────────────────────────────────────────────
var WORKER_URL = 'https://hidden-salad-773b.bryanhkwan.workers.dev';

// ── loadTeamRatings — adjusted efficiency + SRS for all MBB teams ──────────
async function loadTeamRatings(year) {
  year = year || 2026;
  try {
    const r = await fetch(WORKER_URL + '/api/cbdata/ratings?season=' + year);
    if (!r.ok) return;
    const data = await r.json();
    // Filter to requested season only — API returns all historical seasons,
    // keeping only the target year ensures teamRatings and percentiles are correct.
    allRatingsData = (data.teams || []).filter(t => +t.season === +year);
    teamRatings = {};
    allRatingsData.forEach(t => {
      if (t.team) teamRatings[t.team.toLowerCase()] = t;
    });
    _ratingsReady = true;
    if (typeof window._onRatingsReady === 'function') {
      window._onRatingsReady();
      window._onRatingsReady = null;
    }
  } catch (e) {
    console.warn('loadTeamRatings failed:', e);
  }
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

// ── loadTeamStats — full team season stats (offense + defense + four factors) ─
async function loadTeamStats(team, year) {
  year = year || 2026;
  const key = (team + ':' + year).toLowerCase();
  if (teamStatsCache[key] !== undefined) return teamStatsCache[key];
  try {
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
    const r = await fetch(WORKER_URL + '/api/cbdata/plays?gameId=' + gameId);
    if (!r.ok) return [];
    const data = await r.json();
    playsCache[gameId] = data.plays || [];
    return playsCache[gameId];
  } catch (e) { return []; }
}

// ── loadPlayerShots — all season shots for one player via the worker ──────────
async function loadPlayerShots(team, season, playerName) {
  if (!team || !season || !playerName) return [];
  const key = (team + ':' + season + ':' + playerName).toLowerCase();
  if (playerShotsCache[key]) return playerShotsCache[key];
  try {
    const r = await fetch(
      WORKER_URL + '/api/cbdata/playershots?team=' + encodeURIComponent(team) +
      '&season=' + encodeURIComponent(season) +
      '&playerName=' + encodeURIComponent(playerName)
    );
    const data = await r.json();
    const shots = data.shots || [];
    playerShotsCache[key] = shots;
    return shots;
  } catch (e) { return []; }
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
  return new Promise((resolve, reject)=>{
    const start = Date.now();
    const t = setInterval(()=>{
      if(window.XLSX){ clearInterval(t); resolve(true); }
      if(Date.now()-start > timeoutMs){
        clearInterval(t);
        reject(new Error("XLSX library not loaded. Put xlsx.full.min.js next to this HTML."));
      }
    }, 50);
  });
}

// --- League/pos functions ---

function applyLeagueDefaults(force){
  if(league === 'MBB'){
    if(force || avgPayEl.value === '' || Number(avgPayEl.value) === 35000){
      avgPayEl.value = 70000; minPayEl.value = 10000; maxPayEl.value = 300000;
    }
  }else{
    if(force || avgPayEl.value === '' || Number(avgPayEl.value) === 70000){
      avgPayEl.value = 35000; minPayEl.value = 5000; maxPayEl.value = 150000;
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
  applyLeagueDefaults(false);
  applyLeagueTheme(newLeague);
  renderConfMultTable();
  reloadActiveSheet();

  // Restore new league's saved rosters
  leagueRosters[newLeague].tb.forEach(r => tbRoster.push(r));
  leagueRosters[newLeague].opp.forEach(r => oppRoster.push(r));

  // Refresh Team Builder and Opponent UI with restored rosters
  tbRefresh();
  oppRefresh();

  // Notify AI chat that league changed (clears stale roster context from history)
  if (typeof window._chatOnLeagueSwitch === 'function') window._chatOnLeagueSwitch(newLeague);
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
  const allRows = parseSheetToRows(ws);

  const normalized = allRows.map(r => {
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
    return out;
  });

  const guards = normalized.filter(r => r.Position === 'Guards');
  const bigs = normalized.filter(r => r.Position === 'Bigs');

  rows = pos === 'Guards' ? guards : bigs;
  ensureWeightsCoverStats(pos, rows);
  renderWeights();
  computeAll();

  const sibPos = pos === 'Guards' ? 'Bigs' : 'Guards';
  const sibRows = pos === 'Guards' ? bigs : guards;
  if(sibRows.length){
    try{
      const savedPos = pos, savedRows = rows, savedComputed = computed;
      pos = sibPos;
      rows = sibRows;
      ensureWeightsCoverStats(pos, rows);
      computeAll();
      console.log(`Auto-cached ${league}_${sibPos}: ${tbAllComputed[league+'_'+sibPos]?.length || 0} players`);
      pos = savedPos; rows = savedRows; computed = savedComputed;
      ensureWeightsCoverStats(pos, rows);
      renderWeights();
      renderPlayers();
    }catch(e){
      console.error('Sibling computation failed:', e);
      pos = pos === sibPos ? (sibPos === 'Guards' ? 'Bigs' : 'Guards') : pos;
    }
  } else {
    console.warn(`No ${sibPos} rows found for ${league}`);
  }
  console.log('tbAllComputed keys:', Object.keys(tbAllComputed), 'sizes:', Object.fromEntries(Object.entries(tbAllComputed).map(([k,v])=>[k,v.length])));
}

function exportCSV(){
  const cols = ['Rank','Player','Team','Conference','ConfMult_calc','Position','MP','Score','FitScore_calc','PredictedValue_calc','MinMultiplier_calc','ActualValuation_calc'];
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
  get statDist(){ return statDist; }
  get currentWeights(){ return currentWeights; }
  get tbAllComputed(){ return tbAllComputed; }
  loadScoringWeight(){ return loadScoringWeight(); }
  renderWeights(){ return renderWeights(); }
  renderConfMultTable(){ return renderConfMultTable(); }
  computeAll(){ return computeAll(); }
  reloadActiveSheet(){ return reloadActiveSheet(); }
  applyLeagueDefaults(force){ return applyLeagueDefaults(force); }
  loadFromGoogleSheets(url, key){ return loadFromGoogleSheets(url, key); }
  exportCSV(){ return exportCSV(); }
  showWarn(msg){ return showWarn(msg); }
  clearWarn(){ return clearWarn(); }
  setActiveTab(el, sel){ return setActiveTab(el, sel); }
  applyLeagueTheme(lg){ return applyLeagueTheme(lg); }
  switchLeague(lg){ return switchLeague(lg); }
  switchPos(p){ return switchPos(p); }
}

window.DataManager = new DataManager();
