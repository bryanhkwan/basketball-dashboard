// ============ APP.JS — THIN COORDINATOR ============
// All business logic lives in modules/*.js
// This file: DOMContentLoaded init, event listeners, window._app bridge

// ── CBD API request counter (real users only, tracks upstream MISSes) ────────
;(function () {
  var WORKER = URLS.WORKER;
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

var playersSettingsToggleBtnEl = null;
var playersSettingsDockEl = null;
var playersSettingsDrawerEl = null;
var playersSettingsBackdropEl = null;
var playersSettingsCloseBtnEl = null;
var playersBoardFootnoteEl = null;
var playersBoardFootnoteDefaultHtml = '';

function demoIsGuestMode() {
  return typeof authIsGuest === 'function' && authIsGuest();
}

function demoCanViewSensitiveModeling() {
  return !demoIsGuestMode();
}

function demoCanExportSensitiveData() {
  return !demoIsGuestMode();
}

function demoMoneyBand(value) {
  var n = Number(value);
  if (!Number.isFinite(n)) return '—';
  var sign = n < 0 ? '-' : '';
  var abs = Math.abs(n);
  var label = '$400k+';
  if (abs < 50000) label = '<$50k';
  else if (abs < 100000) label = '$50k–$100k';
  else if (abs < 150000) label = '$100k–$150k';
  else if (abs < 250000) label = '$150k–$250k';
  else if (abs < 400000) label = '$250k–$400k';
  return sign + label;
}

function demoFormatMoney(value) {
  var n = typeof safeNum === 'function' ? safeNum(value) : Number(value);
  if (!Number.isFinite(n)) return '—';
  if (!demoIsGuestMode()) {
    if (typeof fmtMoney === 'function') return fmtMoney(n);
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  return demoMoneyBand(n);
}

function demoFormatMoneyLabel(value, noun) {
  var band = demoFormatMoney(value);
  if (!demoIsGuestMode()) return band;
  return (noun || 'Value band') + ': ' + band;
}

function playersSettingsIsGuestLocked() {
  return demoIsGuestMode();
}

function promptGuestStaffAccess(message) {
  if (typeof authPromptUpgrade === 'function') {
    authPromptUpgrade(message);
    return;
  }
  alert(message || 'Log in with an approved staff account to access this internal workflow.');
}

function setPlayersSettingsOpen(open) {
  if (!playersSettingsDockEl || !playersSettingsToggleBtnEl || !playersSettingsDrawerEl || !playersSettingsBackdropEl) return;
  var nextOpen = !!open;
  playersSettingsDockEl.classList.toggle('playersSettingsDockOpen', nextOpen);
  playersSettingsDrawerEl.classList.toggle('isOpen', nextOpen);
  playersSettingsBackdropEl.classList.toggle('isOpen', nextOpen);
  playersSettingsToggleBtnEl.classList.toggle('isActive', nextOpen);
  playersSettingsDrawerEl.setAttribute('aria-hidden', nextOpen ? 'false' : 'true');
  document.body.classList.toggle('playersSettingsOpen', nextOpen);
  playersSettingsToggleBtnEl.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
}

function setPlayersSettingsAvailable(hasVisibleSections) {
  if (!playersSettingsToggleBtnEl) return;
  var available = !!hasVisibleSections;
  playersSettingsToggleBtnEl.style.display = available ? '' : 'none';
  if (!available) setPlayersSettingsOpen(false);
}

function refreshGuestDemoUI() {
  var locked = playersSettingsIsGuestLocked();
  if (playersSettingsToggleBtnEl) {
    playersSettingsToggleBtnEl.classList.toggle('isLocked', locked);
    playersSettingsToggleBtnEl.setAttribute('title', locked
      ? 'Model settings are reserved for approved staff accounts in demo mode.'
      : 'Open player model settings');
    playersSettingsToggleBtnEl.setAttribute('aria-disabled', locked ? 'true' : 'false');
  }
  if (playersBoardFootnoteEl) {
    playersBoardFootnoteEl.innerHTML = locked
      ? '<b>Model note</b> Guest mode keeps the player board and outputs visible, but the exact weighting and valuation formulas stay limited to approved staff accounts. Logged-in users can open Model settings and the full methodology for the internal calculation details.'
      : playersBoardFootnoteDefaultHtml;
  }
  if (typeof exportBtn !== 'undefined' && exportBtn) {
    exportBtn.classList.toggle('isLocked', locked);
    exportBtn.setAttribute('title', locked
      ? 'CSV export is reserved for approved staff accounts in demo mode.'
      : 'Export the current player table as CSV');
    exportBtn.setAttribute('aria-disabled', locked ? 'true' : 'false');
  }
  if (locked) setPlayersSettingsOpen(false);
}

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
    if(wb) requestComputeAll(0);
  });
  resetConfMultBtn.addEventListener('click', ()=>{
    confMultipliers = JSON.parse(JSON.stringify(DEFAULT_CONF_VALUES));
    renderConfMultTable();
    if(wb) computeAll();
  });

  // Profile modal close handlers
  mClose.addEventListener('click', closeProfile);
  modalBack.addEventListener('click', (e)=>{ if(e.target === modalBack) closeProfile(); });
  window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ closeProfile(); closeStatInfo(); if(typeof closeProjectionScoutModal === 'function') closeProjectionScoutModal(); } });

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

  // Refresh data — MBB from CBD API, WBB from ESPN/worker-backed sources
  if (loadGsBtn) {
    loadGsBtn.addEventListener('click', async () => {
      var seasonVal = typeof getDashboardSelectedSeason === 'function'
        ? getDashboardSelectedSeason('2026')
        : '2026';
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
    const resetDefaults = (typeof getValuationModelDefaults === 'function')
      ? getValuationModelDefaults('recommended', league)
      : (league === 'WBB'
          ? { starPct: 0.95, mpMode: 'on', mpPct: 0.95 }
          : { starPct: 0.97, mpMode: 'on', mpPct: 0.92 });
    applyLeagueDefaults(true);
    starPctEl.value = resetDefaults.starPct;
    mpModeEl.value = resetDefaults.mpMode;
    mpPctEl.value = resetDefaults.mpPct;
    computeAll();
  });
  exportBtn.addEventListener('click', ()=>{
    if (!demoCanExportSensitiveData()) {
      promptGuestStaffAccess('CSV export is reserved for approved staff accounts. Guest mode is meant to showcase the workflow without exposing raw internal exports.');
      return;
    }
    exportCSV();
  });
  searchInput.addEventListener('input', debouncedSearch);
  showSelectedOnlyEl.addEventListener('change', renderWeights);
  advancedDirEl.addEventListener('change', renderWeights);

  playersSettingsToggleBtnEl = document.getElementById('playersSettingsToggleBtn');
  playersSettingsDockEl = document.getElementById('playersRightstack');
  playersSettingsDrawerEl = document.getElementById('playersSettingsDrawer');
  playersSettingsBackdropEl = document.getElementById('playersSettingsBackdrop');
  playersSettingsCloseBtnEl = document.getElementById('playersSettingsCloseBtn');
  playersBoardFootnoteEl = document.getElementById('playersBoardFootnote');
  if (playersBoardFootnoteEl && !playersBoardFootnoteDefaultHtml) {
    playersBoardFootnoteDefaultHtml = playersBoardFootnoteEl.innerHTML;
  }
  if (playersSettingsToggleBtnEl && playersSettingsDockEl && playersSettingsDrawerEl && playersSettingsBackdropEl) {
    setPlayersSettingsOpen(false);
    playersSettingsToggleBtnEl.addEventListener('click', () => {
      if (playersSettingsIsGuestLocked()) {
        promptGuestStaffAccess('Model settings are reserved for approved staff accounts. Guest mode keeps the rankings and outputs visible, but not the internal tuning controls.');
        return;
      }
      setPlayersSettingsOpen(!playersSettingsDrawerEl.classList.contains('isOpen'));
    });
    playersSettingsBackdropEl.addEventListener('click', () => setPlayersSettingsOpen(false));
    if (playersSettingsCloseBtnEl) playersSettingsCloseBtnEl.addEventListener('click', () => setPlayersSettingsOpen(false));
    document.addEventListener('pointerdown', (event) => {
      if (!playersSettingsDrawerEl.classList.contains('isOpen')) return;
      var target = event.target;
      if (!target) return;
      if (playersSettingsDrawerEl.contains(target)) return;
      if (playersSettingsToggleBtnEl.contains(target)) return;
      setPlayersSettingsOpen(false);
      event.preventDefault();
      event.stopPropagation();
    }, true);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && playersSettingsDrawerEl.classList.contains('isOpen')) {
        setPlayersSettingsOpen(false);
      }
    });
  }
  refreshGuestDemoUI();

  if (typeof setPlayerValueView === 'function') setPlayerValueView(playerValueView, { skipPersist: true });
  if (typeof playerValueViewEl !== 'undefined' && playerValueViewEl) {
    playerValueViewEl.addEventListener('change', () => {
      if (typeof setPlayerValueView === 'function') setPlayerValueView(playerValueViewEl.value);
      renderPlayers();
    });
  }

  [avgPayEl,minPayEl,maxPayEl,starValueEl,starPctEl,mpModeEl,mpPctEl].forEach(el=>{
    if(!el) return;
    el.addEventListener('input', ()=>{ if(wb) requestComputeAll(120); });
    el.addEventListener('change', ()=>{ if(wb) requestComputeAll(0); });
  });

  // Team builder listeners
  tbClearBtn.addEventListener('click', ()=>{ tbRoster = []; clearWarn(); tbRefresh(); });
  tbMaxRosterEl.addEventListener('input', ()=>{ tbMaxLabelEl.textContent = tbMaxRosterEl.value; });
  [tbBudgetEl, tbPlayerCapEl, tbMaxRosterEl, tbWeakThreshEl, document.getElementById('tbTargetGuards'), document.getElementById('tbTargetBigs')].forEach(el => {
    if(el) el.addEventListener('change', ()=> tbRefresh());
  });
  tbWeakThreshEl.addEventListener('input', () => {
    tbWeakThreshLabelEl.textContent = tbWeakThreshEl.value + 'th';
    if(typeof tbScheduleRefresh === 'function') tbScheduleRefresh(90);
    else tbRefresh();
  });

  // Page navigation
  initPageNav();
  initTbSubNav();
  initTeamsPage();
  initFavsPage();
  initSharesPage();
  if (typeof initLabPage === 'function') initLabPage();
  if (typeof initValueLabPage === 'function') initValueLabPage();
  if (typeof initPortalPage === 'function') initPortalPage();

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
  openProjectionScoutModal,
  safeNum,
  fmtMoney,
  demoIsGuestMode,
  demoCanViewSensitiveModeling,
  demoCanExportSensitiveData,
  demoMoneyBand,
  demoFormatMoney,
  demoFormatMoneyLabel,
  statPercentile,
  barColor,
  getInvertForStat,
  setPlayersSettingsOpen,
  setPlayersSettingsAvailable,
  refreshGuestDemoUI,
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
