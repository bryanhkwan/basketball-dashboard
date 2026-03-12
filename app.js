// ============ APP.JS — THIN COORDINATOR ============
// All business logic lives in modules/*.js
// This file: DOMContentLoaded init, event listeners, window._app bridge

// ── CBD API request counter (real users only, tracks upstream MISSes) ────────
;(function () {
  var WORKER = 'https://hidden-salad-773b.bryanhkwan.workers.dev';
  function _monthKey() { return 'cbd_api_miss_' + new Date().toISOString().slice(0, 7); }

  function _isRealUser() {
    return (
      typeof authIsGuest  === 'function' && !authIsGuest() &&
      typeof authGetToken === 'function' &&  authGetToken()
    );
  }

  function _updateApiUsageBadge(count) {
    if (count === undefined) count = parseInt(localStorage.getItem(_monthKey()) || '0', 10);
    var badge = document.getElementById('apiUsageBadge');
    if (!badge) return;
    if (!_isRealUser()) { badge.style.display = 'none'; return; }
    var cls = count > 800 ? 'apiBadge--danger' : count > 500 ? 'apiBadge--warn' : 'apiBadge--ok';
    badge.className = 'apiBadge ' + cls;
    badge.title = 'CBD upstream API calls this month (HITs are cached & free, only MISSes counted). Limit: 1000/mo';
    badge.textContent = count + '/1k CBD';
    badge.style.display = '';
  }

  // Patch window.fetch to intercept worker CBD calls — only count real upstream MISSes
  var _origFetch = window.fetch;
  window.fetch = function (input) {
    var url = typeof input === 'string' ? input
            : (input instanceof Request)  ? input.url
            : String(input);
    var isCBD = url.startsWith(WORKER) &&
                (url.includes('/api/cbdata/') || url.includes('/api/proxy/'));
    if (!isCBD) return _origFetch.apply(this, arguments);

    var p = _origFetch.apply(this, arguments);
    // Side-effect only — do NOT chain so the caller always gets the original Response
    p.then(function (resp) {
      var hit = resp.headers.get('X-Cache') === 'HIT';
      if (!hit && _isRealUser()) {
        var key = _monthKey();
        var n = parseInt(localStorage.getItem(key) || '0', 10) + 1;
        localStorage.setItem(key, String(n));
        _updateApiUsageBadge(n);
      }
    }).catch(function () {});
    return p;
  };

  // Expose helpers for debugging in console
  window._apiUsageUpdateBadge = _updateApiUsageBadge;
  window._apiUsageCount       = function () { return parseInt(localStorage.getItem(_monthKey()) || '0', 10); };
  window._apiUsageReset       = function () { localStorage.setItem(_monthKey(), '0'); _updateApiUsageBadge(0); };
})();

// Surface runtime errors in the UI
window.addEventListener('error', (e) => {
  const box = document.getElementById('warn');
  if(!box) return;
  box.style.display = 'block';
  box.textContent = `JS Error: ${e.message}`;
});

window.addEventListener('DOMContentLoaded', () => {
  const sheetEl = document.getElementById('activeSheet');
  if(sheetEl && (sheetEl.textContent||'').trim() === '—') sheetEl.textContent = 'Ready (upload workbook)';

  // Initialize DOM refs in each module (call underlying functions directly — class
  // declarations in JS go into the declarative env record, not window, so
  // DataManager.initDOMRefs() would hit the class, not the instance)
  initDataDOMRefs();
  initTeamBuilderDOMRefs();

  // Initialize scoring weight defaults
  loadScoringWeight();

  // Initialize conference multiplier table
  renderConfMultTable();

  // Apply league theme on load
  applyLeagueTheme(league);

  // Weights body click handler for stat glossary
  weightsBody.addEventListener('click', (e)=>{
    const el = e.target.closest('.statLink');
    if(!el) return;
    const stat = el.getAttribute('data-stat') || el.dataset.stat || el.textContent;
    if(stat) openStatInfo(stat.trim());
  });

  // Conference multiplier listeners
  confMultToggleEl.addEventListener('change', ()=>{
    renderConfMultTable();
    if(wb) computeAll();
  });
  resetConfMultBtn.addEventListener('click', ()=>{
    confMultipliers = JSON.parse(JSON.stringify(DEFAULT_CONF_VALUES));
    renderConfMultTable();
    if(wb) computeAll();
  });

  // Profile modal close handlers
  mClose.addEventListener('click', closeProfile);
  modalBack.addEventListener('click', (e)=>{ if(e.target === modalBack) closeProfile(); });
  window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ closeProfile(); closeStatInfo(); } });

  // League toggle switch (header pill)
  const leagueSwitchInput = document.getElementById('leagueSwitchInput');
  if(leagueSwitchInput){
    leagueSwitchInput.addEventListener('change', () => switchLeague(leagueSwitchInput.checked ? 'WBB' : 'MBB'));
  }

  // Hidden league tab buttons (kept for setActiveTab compatibility)
  document.getElementById('tabMBB').addEventListener('click', ()=> switchLeague('MBB'));
  document.getElementById('tabWBB').addEventListener('click', ()=> switchLeague('WBB'));

  // Position tabs
  document.getElementById('tabGuards').addEventListener('click', ()=>{
    pos = 'Guards';
    setActiveTab(document.getElementById('tabGuards'), '.tab[data-pos]');
    renderWeights();
    reloadActiveSheet();
  });
  document.getElementById('tabBigs').addEventListener('click', ()=>{
    pos = 'Bigs';
    setActiveTab(document.getElementById('tabBigs'), '.tab[data-pos]');
    renderWeights();
    reloadActiveSheet();
  });

  fitPresetEl.addEventListener('change', ()=>{
    activeFitEl.textContent = fitPresetEl.options[fitPresetEl.selectedIndex].text;
    if(wb) { computed = computed.map(r => ({...r, FitScore_calc: fitScoreForRow(r)})); renderPlayers(); }
  });

  // Refresh data — MBB always from CBD API, WBB always from Google Sheets
  if (loadGsBtn) {
    loadGsBtn.addEventListener('click', async () => {
      var seasonEl = document.getElementById('cbdSeason');
      var seasonVal = seasonEl ? (seasonEl.value || '2026') : '2026';
      await loadAllData(seasonVal);
      if (typeof thRefreshTeamList === 'function') thRefreshTeamList();
    });
  }
  recalcBtn.addEventListener('click', ()=>{ if(wb) computeAll(); });
  resetWeightsBtn.addEventListener('click', ()=>{
    const base = JSON.parse(JSON.stringify(excelWeights));
    currentWeights[pos] = base[pos] || [];
    ensureWeightsCoverStats(pos, rows);
    renderWeights();
    computeAll();
  });
  resetValBtn.addEventListener('click', ()=>{
    applyLeagueDefaults(true);
    starValueEl.value = 100000;
    starPctEl.value = 0.95;
    mpModeEl.value = 'on';
    mpPctEl.value = 0.95;
    computeAll();
  });
  exportBtn.addEventListener('click', exportCSV);
  searchInput.addEventListener('input', debouncedSearch);
  showSelectedOnlyEl.addEventListener('change', renderWeights);
  advancedDirEl.addEventListener('change', renderWeights);

  [avgPayEl,minPayEl,maxPayEl,starValueEl,starPctEl,mpModeEl,mpPctEl].forEach(el=>{
    el.addEventListener('input', ()=>{ if(wb) computeAll(); });
    el.addEventListener('change', ()=>{ if(wb) computeAll(); });
  });

  // Team builder listeners
  tbClearBtn.addEventListener('click', ()=>{ tbRoster = []; clearWarn(); tbRefresh(); });
  tbMaxRosterEl.addEventListener('input', ()=>{ tbMaxLabelEl.textContent = tbMaxRosterEl.value; });
  [tbBudgetEl, tbPlayerCapEl, tbMaxRosterEl, tbWeakThreshEl, document.getElementById('tbTargetGuards'), document.getElementById('tbTargetBigs')].forEach(el => {
    if(el) el.addEventListener('change', ()=> tbRefresh());
  });
  tbWeakThreshEl.addEventListener('input', () => {
    tbWeakThreshLabelEl.textContent = tbWeakThreshEl.value + 'th';
    tbRefresh();
  });

  // Page navigation
  initPageNav();
  initTbSubNav();
  initTeamsPage();
  initFavsPage();
  initSharesPage();

  // Quick add widgets (roster + opponent)
  setupQuickAdd('tbQuickAddInput',  'tbQuickAddDropdown',  tbAddPlayer,  () => tbRoster);
  setupQuickAdd('oppQuickAddInput', 'oppQuickAddDropdown', oppAddPlayer, () => oppRoster);

  // Auto-populate API key (data load is triggered by auth flow via authStartLoading)
  if(gsKeyInput) gsKeyInput.value = DEFAULT_GS_API_KEY;

  // Render API usage badge if already logged in when page loads (covers page refreshes)
  if (typeof window._apiUsageUpdateBadge === 'function') window._apiUsageUpdateBadge();
});

// ============ window._app BRIDGE ============
// All modules that need cross-module access (especially AI chat) use this bridge.
window._app = {
  // Getters/setters for mutable state
  get tbRoster(){ return tbRoster; },
  set tbRoster(v){ tbRoster = v; },
  get oppRoster(){ return oppRoster; },
  set oppRoster(v){ oppRoster = v; },
  get computed(){ return computed; },
  get pos(){ return pos; },
  get league(){ return league; },
  get statDist(){ return statDist; },
  get currentWeights(){ return currentWeights; },

  // Functions exposed to AI chat and other external callers
  tbAddPlayer,
  tbRefresh,
  tbGetAllPlayers,
  tbPlayerKey,
  tbPlayerLeague,
  tbPosGroup,
  tbPlayerAvgPct,
  oppAddPlayer,
  oppRemovePlayer,
  oppRefresh,
  getHeadToHead,
  openProfile,
  openCompare,
  safeNum,
  fmtMoney,
  statPercentile,
  barColor,
  getInvertForStat,
  // Teams Hub / ratings
  get teamRatings()      { return teamRatings; },
  get allRatingsData()   { return allRatingsData; },
  loadGamesForTeam,
  loadShootingForTeam,
  thLoadOpponent,
  // Draft model
  draftProbability:    typeof draftProbability === 'function' ? draftProbability : function(){ return null; },
  draftGrade:          typeof draftGrade === 'function' ? draftGrade : function(){ return '—'; },
  draftRangeLabel:     typeof draftRangeLabel === 'function' ? draftRangeLabel : function(){ return '—'; },
  draftFactors:        typeof draftFactors === 'function' ? draftFactors : function(){ return []; },
  draftDevelopmentRecs:typeof draftDevelopmentRecs === 'function' ? draftDevelopmentRecs : function(){ return []; },
  draftComparables:    typeof draftComparables === 'function' ? draftComparables : function(){ return []; },
  draftInsights:       typeof draftInsights === 'function' ? draftInsights : function(){ return []; },
};
