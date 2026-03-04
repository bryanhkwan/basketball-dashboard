// ============ APP.JS — THIN COORDINATOR ============
// All business logic lives in modules/*.js
// This file: DOMContentLoaded init, event listeners, window._app bridge

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

  // Data load buttons
  if(loadGsBtn){
    loadGsBtn.addEventListener('click', async ()=>{
      const key = gsKeyInput?.value?.trim() || DEFAULT_GS_API_KEY;
      await loadFromGoogleSheets(DEFAULT_GS_URL, key);
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

  // Quick add widgets (roster + opponent)
  setupQuickAdd('tbQuickAddInput',  'tbQuickAddDropdown',  tbAddPlayer,  () => tbRoster);
  setupQuickAdd('oppQuickAddInput', 'oppQuickAddDropdown', oppAddPlayer, () => oppRoster);

  // Auto-populate API key (data load is triggered by auth flow via authStartLoading)
  if(gsKeyInput) gsKeyInput.value = DEFAULT_GS_API_KEY;
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
};
