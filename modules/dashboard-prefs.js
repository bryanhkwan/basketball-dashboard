// ============ DASHBOARD PREFS MODULE ============
// Account-level UI customization for hidden tabs and page sections.
// Dependencies: auth.js, teambuilder.js

var DASH_PREFS_BASE = 'https://hidden-salad-773b.bryanhkwan.workers.dev/preferences';
var DASH_PREF_PAGE_IDS = [
  'pagePlayers',
  'pagePortal',
  'pageTeamBuilder',
  'pageTeams',
  'pageValueLab',
  'pageMethodology',
  'pageLab',
  'pageWarRoom',
  'pageFavorites',
  'pageCollaborate'
];
var DASH_PREF_TAB_OPTIONS = [
  { pageId: 'pagePortal', label: 'Transfer Portal', desc: 'Hide the portal board tab from the top navigation.' },
  { pageId: 'pageTeams', label: 'Teams', desc: 'Hide the team scouting hub tab.' },
  { pageId: 'pageValueLab', label: 'Value Lab', desc: 'Hide the roster investment and ROI page.' },
  { pageId: 'pageLab', label: 'Tournament Lab', desc: 'Hide Tournament Lab and its War Room entry path.' },
  { pageId: 'pageFavorites', label: 'Favorites', desc: 'Hide the favorites page tab.' },
  { pageId: 'pageCollaborate', label: 'Collaborate', desc: 'Hide collaboration and sharing tools.' }
];
var DASH_PREF_SECTION_OPTIONS = {
  pagePlayers: [
    { id: 'evalPresetsCard', label: 'Evaluation presets', desc: 'Show or hide the saved model preset controls.' },
    { id: 'weightsCard', label: 'Weights / Min / Max', desc: 'Show or hide the main stat-weight editor.' },
    { id: 'valuationCard', label: 'Valuation settings', desc: 'Show or hide NIL valuation controls.' },
    { id: 'confMultCard', label: 'Conference multiplier', desc: 'Show or hide conference multiplier controls.' }
  ],
  pagePortal: [
    { id: 'portalBoardSection', label: 'Portal board', desc: 'Show or hide the live portal board section.' },
    { id: 'portalFitLabSection', label: 'Portal Fit Lab', desc: 'Show or hide portal fit recommendations and AI analysis.' }
  ],
  pageTeamBuilder: [
    { id: 'tbSubMyTeam', selector: '.tbSubBtn[data-sub="tbSubMyTeam"]', label: 'My Team sub-tab', desc: 'Show or hide the My Team sub-tab.' },
    { id: 'tbSubH2H', selector: '.tbSubBtn[data-sub="tbSubH2H"]', label: 'Head-to-Head sub-tab', desc: 'Show or hide the head-to-head sub-tab.' },
    { id: 'tbSubOpponent', selector: '.tbSubBtn[data-sub="tbSubOpponent"]', label: 'Opponent sub-tab', desc: 'Show or hide the opponent builder sub-tab.' }
  ],
  pageTeams: [
    { id: 'teamsOverviewSection', label: 'Program Overview', desc: 'Show or hide the team overview section.' },
    { id: 'teamsThreatsSection', label: 'Conference Threats', desc: 'Show or hide conference threat analysis.' },
    { id: 'teamsGameLogSection', label: 'Season Game Log', desc: 'Show or hide the team game log.' },
    { id: 'teamsH2HSection', label: 'Head-to-Head Records', desc: 'Show or hide head-to-head history.' },
    { id: 'teamsDNASection', label: 'Team DNA', desc: 'Show or hide team DNA analysis.' },
    { id: 'teamsScoutSection', label: 'Team Scout Report', desc: 'Show or hide the scout report section.' },
    { id: 'teamsCompareSection', label: 'Compare Teams', desc: 'Show or hide the compare-teams section.' },
    { id: 'teamsMatchupSection', label: 'Matchup Breakdown', desc: 'Show or hide matchup shot-chart analysis.' }
  ],
  pageValueLab: [
    { id: 'valueLabControlsSection', label: 'Case Controls', desc: 'Show or hide Value Lab case management and import controls.' },
    { id: 'valueLabKpisSection', label: 'Executive Summary', desc: 'Show or hide Value Lab KPI cards.' },
    { id: 'valueLabInsightsSection', label: 'Investment Readout', desc: 'Show or hide roster investment insights.' },
    { id: 'valueLabOutcomeSection', label: 'Outcome vs Spend', desc: 'Show or hide the wins versus spend section.' },
    { id: 'valueLabChartsSection', label: 'Charts', desc: 'Show or hide Value Lab charts and spend breakdowns.' },
    { id: 'valueLabRosterSection', label: 'Player ROI Board', desc: 'Show or hide the per-player ROI table.' }
  ],
  pageMethodology: [
    { id: 'methodDataSourcesSection', label: 'Data Sources', desc: 'Show or hide the data sources explainer.' },
    { id: 'methodPerfScoreSection', label: 'PerfScore', desc: 'Show or hide PerfScore methodology.' },
    { id: 'methodValuationSection', label: 'Valuation', desc: 'Show or hide valuation methodology.' },
    { id: 'methodPositionGroupsSection', label: 'Position Groups', desc: 'Show or hide position group notes.' },
    { id: 'methodRoleTagsSection', label: 'Role Tags', desc: 'Show or hide role tag methodology.' },
    { id: 'methodTeamBuilderSection', label: 'Team Workspaces', desc: 'Show or hide Team Hub and Team Builder methodology.' },
    { id: 'methodPortalSection', label: 'Transfer Portal', desc: 'Show or hide transfer portal methodology.' },
    { id: 'methodValueLabSection', label: 'Value Lab', desc: 'Show or hide Value Lab methodology.' },
    { id: 'methodAIScoutSection', label: 'AI Scout', desc: 'Show or hide the AI Scout explainer.' },
    { id: 'methodWbbDefaultsSection', label: 'WBB Defaults', desc: 'Show or hide WBB default model notes.' },
    { id: 'methodMonteCarloSection', label: 'Simulation Stack', desc: 'Show or hide the simulation methodology.' },
    { id: 'methodDraftRadarSection', label: 'Draft Radar', desc: 'Show or hide draft model methodology.' }
  ],
  pageLab: [
    { id: 'labWarRoomLauncherSection', label: 'War Room Launcher', desc: 'Show or hide the War Room launcher card.' },
    { id: 'labPickerSection', label: 'Team Picker', desc: 'Show or hide the multi-team picker.' },
    { id: 'labOverviewSection', label: 'Overview', desc: 'Show or hide Tournament Lab overview metrics.' },
    { id: 'labCommonDNASection', label: 'Common DNA', desc: 'Show or hide common team DNA analysis.' },
    { id: 'labProfilesSection', label: 'Team Profiles', desc: 'Show or hide team profile comparisons.' },
    { id: 'labClustersSection', label: 'K-Means Clusters', desc: 'Show or hide clustering output.' },
    { id: 'labPredictorSection', label: 'Tournament Predictor', desc: 'Show or hide tournament predictor results.' },
    { id: 'labArchetypesSection', label: 'Archetypes', desc: 'Show or hide team archetypes.' },
    { id: 'labShotZonesSection', label: 'Shot Zones', desc: 'Show or hide shot zone profiles.' },
    { id: 'labTendenciesSection', label: 'Play-by-Play Tendencies', desc: 'Show or hide play-by-play tendencies.' },
    { id: 'labDistributionsSection', label: 'Metric Distributions', desc: 'Show or hide metric distributions.' },
    { id: 'labDeepAnalysisSection', label: 'AI Deep Analysis', desc: 'Show or hide AI deep analysis output.' }
  ],
  pageWarRoom: [
    { id: 'warRoomBoardSection', label: 'Bracket Board', desc: 'Show or hide the fantasy-style bracket board.' },
    { id: 'warRoomToolsSection', label: 'Bracket Tools', desc: 'Show or hide setup and import tools.' },
    { id: 'warRoomAnalysisSection', label: 'Simulation & Analysis', desc: 'Show or hide simulation controls and AI output.' }
  ],
  pageFavorites: [
    { id: 'favsHeaderSection', label: 'Favorites Header', desc: 'Show or hide the favorites header and filters.' },
    { id: 'favsToolsSection', label: 'Folder Tools', desc: 'Show or hide favorites folders and bulk tools.' },
    { id: 'favsResultsSection', label: 'Favorites Results', desc: 'Show or hide the favorites results area.' }
  ],
  pageCollaborate: [
    { id: 'chatSidebar', label: 'Conversation Sidebar', desc: 'Show or hide the conversation list.' },
    { id: 'chatMain', label: 'Chat Workspace', desc: 'Show or hide the chat workspace.' }
  ]
};

var dashPrefsState = {
  loaded: false,
  loading: false,
  saving: false,
  customizing: false,
  prefs: null,
  draft: null,
};

var dashPrefsBtnEl, dashPrefsBarEl, dashPrefsBarTextEl, dashPrefsSaveBtnEl, dashPrefsResetBtnEl, dashPrefsCancelBtnEl;
var dashPrefsPlayersGridEl, dashPrefsPlayersRightstackEl, dashPrefsPlayersSettingsToggleEl;
var DASH_PREFS_GUEST_KEY = '_guestDashboardPrefs';

function dashPrefsClone(value) {
  if (typeof deepClone === 'function') return deepClone(value);
  return JSON.parse(JSON.stringify(value));
}

function dashPrefsDefault() {
  return {
    version: 1,
    hiddenTabs: [],
    hiddenSections: {},
  };
}

function dashPrefsAllowedTabSet() {
  var map = {};
  DASH_PREF_TAB_OPTIONS.forEach(function (item) { map[item.pageId] = true; });
  return map;
}

function dashPrefsAllowedSectionSet() {
  var map = {};
  Object.keys(DASH_PREF_SECTION_OPTIONS).forEach(function (pageId) {
    map[pageId] = {};
    (DASH_PREF_SECTION_OPTIONS[pageId] || []).forEach(function (item) {
      map[pageId][item.id] = true;
    });
  });
  return map;
}

function dashPrefsNormalize(raw) {
  var prefs = dashPrefsDefault();
  raw = raw && typeof raw === 'object' ? raw : {};
  var allowedTabs = dashPrefsAllowedTabSet();
  var allowedSections = dashPrefsAllowedSectionSet();

  if (Array.isArray(raw.hiddenTabs)) {
    prefs.hiddenTabs = raw.hiddenTabs.map(function (value) {
      return String(value || '').trim();
    }).filter(function (pageId, idx, arr) {
      return pageId && allowedTabs[pageId] && arr.indexOf(pageId) === idx;
    });
  }

  if (raw.hiddenSections && typeof raw.hiddenSections === 'object') {
    Object.keys(allowedSections).forEach(function (pageId) {
      var arr = Array.isArray(raw.hiddenSections[pageId]) ? raw.hiddenSections[pageId] : [];
      prefs.hiddenSections[pageId] = arr.map(function (value) {
        return String(value || '').trim();
      }).filter(function (sectionId, idx, all) {
        return sectionId && allowedSections[pageId][sectionId] && all.indexOf(sectionId) === idx;
      });
    });
  }

  return prefs;
}

function dashPrefsIsGuest() {
  return typeof authIsGuest === 'function' && authIsGuest();
}

function _devDashPrefsStore() {
  try { return JSON.parse(localStorage.getItem('_devDashboardPrefs') || '{}'); } catch (_) { return {}; }
}
function _devDashPrefsWrite(value) {
  localStorage.setItem('_devDashboardPrefs', JSON.stringify(value || {}));
}
function dashPrefsGuestStore() {
  try { return JSON.parse(localStorage.getItem(DASH_PREFS_GUEST_KEY) || '{}'); } catch (_) { return {}; }
}
function dashPrefsGuestWrite(value) {
  localStorage.setItem(DASH_PREFS_GUEST_KEY, JSON.stringify(value || {}));
}

async function _dashPrefsFetchDev(path, opts) {
  path = path || '';
  opts = opts || {};
  var method = ((opts.method || 'GET') + '').toUpperCase();
  if (method === 'GET' && path === '') {
    return { ui: dashPrefsNormalize(_devDashPrefsStore()) };
  }
  if (method === 'PUT' && path === '') {
    var body = JSON.parse(opts.body || '{}');
    var ui = dashPrefsNormalize((body && (body.ui || body.preferences || body)) || {});
    _devDashPrefsWrite(ui);
    return { ui: ui };
  }
  return null;
}

async function dashPrefsFetch(path, opts) {
  path = path || '';
  opts = opts || {};
  if (typeof DEV_BYPASS_AUTH !== 'undefined' && DEV_BYPASS_AUTH) {
    return _dashPrefsFetchDev(path, opts);
  }
  var token = typeof authGetToken === 'function' ? authGetToken() : null;
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  var res = await fetch(DASH_PREFS_BASE + path, Object.assign({ credentials: 'include', headers: headers }, opts));
  if (res.status === 401) {
    var unauthorized = new Error('Unauthorized');
    unauthorized.code = 'UNAUTHORIZED';
    throw unauthorized;
  }
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    throw new Error(data.message || data.error || ('Error ' + res.status));
  }
  return data;
}

function dashPrefsCurrentPageId() {
  if (window._dashboardCurrentPageId) return window._dashboardCurrentPageId;
  for (var i = 0; i < DASH_PREF_PAGE_IDS.length; i++) {
    var el = document.getElementById(DASH_PREF_PAGE_IDS[i]);
    if (el && el.style.display !== 'none') return DASH_PREF_PAGE_IDS[i];
  }
  return 'pagePlayers';
}

function dashPrefsIsPageVisible(pageId, prefs) {
  prefs = dashPrefsNormalize(prefs || dashPrefsState.prefs || dashPrefsDefault());
  if (!pageId || pageId === 'pagePlayers') return true;
  if (pageId === 'pageWarRoom') return dashPrefsIsPageVisible('pageLab', prefs);
  if (pageId === 'pageTeamBuilder') return dashPrefsIsPageVisible('pageTeams', prefs);
  return prefs.hiddenTabs.indexOf(pageId) === -1;
}

function dashPrefsFirstVisiblePage(prefs) {
  prefs = dashPrefsNormalize(prefs || dashPrefsState.prefs || dashPrefsDefault());
  var options = ['pagePlayers'].concat(DASH_PREF_TAB_OPTIONS.map(function (item) { return item.pageId; }));
  for (var i = 0; i < options.length; i++) {
    if (dashPrefsIsPageVisible(options[i], prefs)) return options[i];
  }
  return 'pagePlayers';
}

function dashPrefsHiddenSectionsFor(pageId, prefs) {
  prefs = dashPrefsNormalize(prefs || dashPrefsState.prefs || dashPrefsDefault());
  var hidden = prefs.hiddenSections && prefs.hiddenSections[pageId];
  return Array.isArray(hidden) ? hidden : [];
}

function dashPrefsEffectivePrefs() {
  return dashPrefsNormalize(
    dashPrefsState.customizing
      ? (dashPrefsState.draft || dashPrefsState.prefs || dashPrefsDefault())
      : (dashPrefsState.prefs || dashPrefsDefault())
  );
}

function dashPrefsSetHiddenInDraft(kind, targetId, hidden) {
  if (!dashPrefsState.customizing) return;
  var draft = dashPrefsClone(dashPrefsState.draft || dashPrefsState.prefs || dashPrefsDefault());
  draft.hiddenSections = draft.hiddenSections || {};

  if (kind === 'tab') {
    draft.hiddenTabs = Array.isArray(draft.hiddenTabs) ? draft.hiddenTabs.slice() : [];
    var tabIdx = draft.hiddenTabs.indexOf(targetId);
    if (hidden && tabIdx === -1) draft.hiddenTabs.push(targetId);
    if (!hidden && tabIdx >= 0) draft.hiddenTabs.splice(tabIdx, 1);
  } else if (kind === 'section') {
    var sectionPageId = dashPrefsFindSectionPage(targetId);
    if (!sectionPageId) return;
    draft.hiddenSections[sectionPageId] = Array.isArray(draft.hiddenSections[sectionPageId]) ? draft.hiddenSections[sectionPageId].slice() : [];
    var sectionIdx = draft.hiddenSections[sectionPageId].indexOf(targetId);
    if (hidden && sectionIdx === -1) draft.hiddenSections[sectionPageId].push(targetId);
    if (!hidden && sectionIdx >= 0) draft.hiddenSections[sectionPageId].splice(sectionIdx, 1);
  }

  dashPrefsState.draft = dashPrefsNormalize(draft);
}

function dashPrefsIsHidden(kind, targetId, prefs) {
  prefs = dashPrefsNormalize(prefs || dashPrefsEffectivePrefs());
  if (kind === 'tab') {
    return prefs.hiddenTabs.indexOf(targetId) >= 0;
  }
  if (kind === 'section') {
    var sectionPageId = dashPrefsFindSectionPage(targetId);
    if (!sectionPageId) return false;
    return dashPrefsHiddenSectionsFor(sectionPageId, prefs).indexOf(targetId) >= 0;
  }
  return false;
}

function dashPrefsFindSectionPage(sectionId) {
  var foundPageId = null;
  Object.keys(DASH_PREF_SECTION_OPTIONS).some(function (pageId) {
    var match = (DASH_PREF_SECTION_OPTIONS[pageId] || []).some(function (item) {
      return item.id === sectionId;
    });
    if (match) foundPageId = pageId;
    return match;
  });
  return foundPageId;
}

function dashPrefsResolveTargets(item) {
  if (!item) return [];
  var selectors = [];
  if (Array.isArray(item.targets) && item.targets.length) selectors = item.targets.slice();
  else if (item.selector) selectors = [item.selector];
  else if (item.id) selectors = ['#' + item.id];

  var out = [];
  selectors.forEach(function (selector) {
    document.querySelectorAll(selector).forEach(function (el) {
      if (out.indexOf(el) === -1) out.push(el);
    });
  });
  return out;
}

function dashPrefsEnsureToggle(targetEl, kind, targetId, label) {
  if (!targetEl) return null;
  targetEl.classList.add('dashPrefTarget');
  var toggle = targetEl.querySelector('.dashPrefToggle');
  if (!toggle) {
    toggle = document.createElement('span');
    toggle.className = 'dashPrefToggle';
    toggle.tabIndex = 0;
    toggle.setAttribute('role', 'button');
    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      dashPrefsHandleToggle(kind, targetId);
    });
    toggle.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      dashPrefsHandleToggle(kind, targetId);
    });
    targetEl.appendChild(toggle);
  }
  toggle.dataset.kind = kind;
  toggle.dataset.targetId = targetId;
  toggle.dataset.label = label || targetId;
  return toggle;
}

function dashPrefsHandleToggle(kind, targetId) {
  if (!dashPrefsState.customizing) return;
  var currentlyHidden = dashPrefsIsHidden(kind, targetId, dashPrefsState.draft);
  dashPrefsSetHiddenInDraft(kind, targetId, !currentlyHidden);
  dashPrefsRender();
}

function dashPrefsRenderNavTargets(effectivePrefs) {
  var customizing = !!dashPrefsState.customizing;
  var hiddenTabs = effectivePrefs.hiddenTabs || [];

  document.querySelectorAll('.pageNavBtn').forEach(function (btn) {
    var pageId = btn.dataset.page || '';
    var canHide = pageId && pageId !== 'pagePlayers' && DASH_PREF_TAB_OPTIONS.some(function (item) { return item.pageId === pageId; });
    var hidden = hiddenTabs.indexOf(pageId) >= 0;

    btn.classList.toggle('dashPrefLocked', !canHide);
    btn.classList.toggle('dashPrefDraftHidden', customizing && hidden);
    btn.style.display = customizing ? '' : (hidden ? 'none' : '');

    var existingToggle = btn.querySelector('.dashPrefToggle');
    if (!canHide) {
      if (existingToggle) existingToggle.style.display = 'none';
      btn.title = customizing ? 'Players stays available as the home page.' : '';
      return;
    }

    var meta = DASH_PREF_TAB_OPTIONS.find(function (item) { return item.pageId === pageId; }) || { label: pageId };
    var toggle = dashPrefsEnsureToggle(btn, 'tab', pageId, meta.label);
    if (toggle) {
      toggle.textContent = hidden ? '+' : '-';
      toggle.title = (hidden ? 'Show ' : 'Hide ') + meta.label;
      toggle.setAttribute('aria-label', toggle.title);
      toggle.style.display = customizing ? 'inline-flex' : 'none';
    }
  });
}

function dashPrefsRenderSectionTargets(effectivePrefs) {
  var customizing = !!dashPrefsState.customizing;
  var playerVisibleCount = 0;

  Object.keys(DASH_PREF_SECTION_OPTIONS).forEach(function (pageId) {
    var hiddenSections = dashPrefsHiddenSectionsFor(pageId, effectivePrefs);
    (DASH_PREF_SECTION_OPTIONS[pageId] || []).forEach(function (item) {
      var targets = dashPrefsResolveTargets(item);
      if (!targets.length) return;
      var hidden = hiddenSections.indexOf(item.id) >= 0;
      if (pageId === 'pagePlayers' && !hidden) playerVisibleCount += 1;

      targets.forEach(function (el, idx) {
        el.classList.add('dashPrefTarget');
        el.style.display = customizing ? '' : (hidden ? 'none' : '');
        el.classList.toggle('dashPrefDraftHidden', customizing && hidden);
        if (idx !== 0) return;
        var toggle = dashPrefsEnsureToggle(el, 'section', item.id, item.label);
        if (toggle) {
          toggle.textContent = hidden ? '+' : '-';
          toggle.title = (hidden ? 'Show ' : 'Hide ') + item.label;
          toggle.setAttribute('aria-label', toggle.title);
          toggle.style.display = customizing ? 'inline-flex' : 'none';
        }
      });
    });
  });

  dashPrefsSyncPlayersLayout(customizing, playerVisibleCount);
  dashPrefsSyncTeamBuilderSubtabs();
}

function dashPrefsSyncPlayersLayout(customizing, visibleCount) {
  if (dashPrefsPlayersGridEl) {
    dashPrefsPlayersGridEl.classList.toggle('playersGridFull', !customizing && visibleCount === 0);
  }
  if (dashPrefsPlayersRightstackEl) {
    dashPrefsPlayersRightstackEl.classList.toggle('rightstackHidden', !customizing && visibleCount === 0);
  }
  if (typeof setPlayersSettingsAvailable === 'function') {
    setPlayersSettingsAvailable(customizing || visibleCount > 0);
  } else if (dashPrefsPlayersSettingsToggleEl) {
    dashPrefsPlayersSettingsToggleEl.style.display = (customizing || visibleCount > 0) ? '' : 'none';
  }
}

function dashPrefsSyncTeamBuilderSubtabs() {
  var subButtons = Array.prototype.slice.call(document.querySelectorAll('.tbSubBtn'));
  if (!subButtons.length || dashPrefsState.customizing) return;

  var visibleButtons = subButtons.filter(function (btn) {
    return btn.style.display !== 'none';
  });
  var activeBtn = visibleButtons.find(function (btn) {
    return btn.classList.contains('active');
  }) || visibleButtons[0] || null;

  document.querySelectorAll('#tbSubMyTeam, #tbSubH2H, #tbSubOpponent').forEach(function (el) {
    el.style.display = 'none';
  });
  subButtons.forEach(function (btn) {
    btn.classList.toggle('active', !!activeBtn && btn === activeBtn);
  });

  if (activeBtn) {
    var target = document.getElementById(activeBtn.dataset.sub || '');
    if (target) target.style.display = '';
  }
}

function dashPrefsRenderBar() {
  if (!dashPrefsBarEl) return;
  dashPrefsBarEl.style.display = dashPrefsState.customizing ? 'flex' : 'none';
  if (dashPrefsBarTextEl) {
    dashPrefsBarTextEl.innerHTML = dashPrefsIsGuest()
      ? 'Customize mode is on. Tap the <b>-</b> or <b>+</b> markers to preview changes, then save them <b>locally in this browser only</b>.'
      : 'Customize mode is on. Tap the <b>-</b> or <b>+</b> markers on tabs and page sections to preview what stays visible.';
  }
  if (dashPrefsSaveBtnEl) {
    dashPrefsSaveBtnEl.textContent = dashPrefsIsGuest() ? 'Save Locally' : 'Save Changes';
    dashPrefsSaveBtnEl.title = dashPrefsIsGuest()
      ? 'Save this customize view in this browser only'
      : 'Save this customize view to your account';
  }
}

function dashPrefsRenderButton() {
  if (!dashPrefsBtnEl) return;
  if (dashPrefsIsGuest()) {
    dashPrefsBtnEl.textContent = 'Customize';
    dashPrefsBtnEl.title = dashPrefsState.customizing
      ? 'Leave customize mode without saving'
      : 'Customize the dashboard locally in this browser';
    return;
  }
  dashPrefsBtnEl.textContent = dashPrefsState.customizing ? 'Exit Customize' : 'Customize';
  dashPrefsBtnEl.title = dashPrefsState.customizing
    ? 'Leave customize mode without saving'
    : 'Customize visible tabs and page sections';
}

function dashPrefsRender() {
  var effectivePrefs = dashPrefsEffectivePrefs();

  document.body.classList.toggle('dashPrefsMode', !!dashPrefsState.customizing);
  dashPrefsRenderButton();
  dashPrefsRenderBar();
  dashPrefsRenderNavTargets(effectivePrefs);
  dashPrefsRenderSectionTargets(effectivePrefs);

  if (!dashPrefsState.customizing) {
    var currentPage = dashPrefsCurrentPageId();
    if (!dashPrefsIsPageVisible(currentPage, effectivePrefs)) {
      var fallback = dashPrefsFirstVisiblePage(effectivePrefs);
      if (typeof showDashboardPage === 'function') showDashboardPage(fallback);
    }
  }
}

function dashPrefsOpen() {
  dashPrefsState.customizing = true;
  dashPrefsState.draft = dashPrefsClone(dashPrefsState.prefs || dashPrefsDefault());
  dashPrefsRender();
}

function dashPrefsClose() {
  dashPrefsState.customizing = false;
  dashPrefsState.draft = null;
  dashPrefsRender();
}

function dashPrefsToggleMode() {
  if (dashPrefsState.customizing) {
    dashPrefsClose();
    return;
  }
  dashPrefsOpen();
}

async function dashPrefsSave() {
  if (!dashPrefsState.customizing) return;

  dashPrefsState.saving = true;
  try {
    if (dashPrefsIsGuest()) {
      dashPrefsState.prefs = dashPrefsNormalize(dashPrefsState.draft || dashPrefsDefault());
      dashPrefsGuestWrite(dashPrefsState.prefs);
      dashPrefsState.customizing = false;
      dashPrefsState.draft = null;
      dashPrefsRender();
      return;
    }
    var data = await dashPrefsFetch('', {
      method: 'PUT',
      body: JSON.stringify({ ui: dashPrefsState.draft || dashPrefsDefault() }),
    });
    dashPrefsState.prefs = dashPrefsNormalize((data && data.ui) || dashPrefsState.draft || dashPrefsDefault());
    dashPrefsState.customizing = false;
    dashPrefsState.draft = null;
    dashPrefsRender();
  } catch (e) {
    if (e && e.code === 'UNAUTHORIZED' && typeof authHandleUnauthorized === 'function') {
      authHandleUnauthorized('Your session expired. Please log in again to save dashboard preferences.');
      return;
    }
    console.warn('[DashboardPrefs] save error:', e);
  } finally {
    dashPrefsState.saving = false;
  }
}

function dashPrefsResetDraft() {
  if (!dashPrefsState.customizing) {
    dashPrefsOpen();
  }
  dashPrefsState.draft = dashPrefsDefault();
  dashPrefsRender();
}

async function dashPrefsBootstrap(force) {
  if (dashPrefsIsGuest()) {
    dashPrefsState.loaded = true;
    dashPrefsState.prefs = dashPrefsNormalize(dashPrefsGuestStore() || dashPrefsDefault());
    dashPrefsRender();
    return;
  }
  if (dashPrefsState.loading) return;
  if (dashPrefsState.loaded && !force) {
    dashPrefsState.prefs = dashPrefsNormalize(dashPrefsState.prefs || dashPrefsDefault());
    dashPrefsRender();
    return;
  }

  dashPrefsState.loading = true;
  try {
    var data = await dashPrefsFetch('', { method: 'GET' });
    dashPrefsState.loaded = true;
    dashPrefsState.prefs = dashPrefsNormalize((data && data.ui) || dashPrefsDefault());
    dashPrefsRender();
  } catch (e) {
    if (e && e.code === 'UNAUTHORIZED' && typeof authHandleUnauthorized === 'function') {
      authHandleUnauthorized('Your session expired. Please log in again to load dashboard preferences.');
      return;
    }
    console.warn('[DashboardPrefs] bootstrap error:', e);
    dashPrefsState.loaded = true;
    dashPrefsState.prefs = dashPrefsDefault();
    dashPrefsRender();
  } finally {
    dashPrefsState.loading = false;
  }
}

function dashPrefsResetSession() {
  dashPrefsState.loaded = false;
  dashPrefsState.loading = false;
  dashPrefsState.saving = false;
  dashPrefsState.customizing = false;
  dashPrefsState.prefs = dashPrefsDefault();
  dashPrefsState.draft = null;
  dashPrefsRender();
}

function dashPrefsRefreshUI() {
  dashPrefsRenderButton();
}

function initDashboardPrefs() {
  dashPrefsBtnEl = document.getElementById('dashboardPrefsBtn');
  dashPrefsBarEl = document.getElementById('dashboardPrefsBar');
  dashPrefsBarTextEl = document.getElementById('dashPrefsBarText');
  dashPrefsSaveBtnEl = document.getElementById('dashPrefsSaveBtn');
  dashPrefsResetBtnEl = document.getElementById('dashPrefsResetBtn');
  dashPrefsCancelBtnEl = document.getElementById('dashPrefsCancelBtn');
  dashPrefsPlayersGridEl = document.getElementById('playersGrid');
  dashPrefsPlayersRightstackEl = document.getElementById('playersRightstack');
  dashPrefsPlayersSettingsToggleEl = document.getElementById('playersSettingsToggleBtn');

  if (dashPrefsBtnEl && !dashPrefsBtnEl._bound) {
    dashPrefsBtnEl.addEventListener('click', dashPrefsToggleMode);
    dashPrefsBtnEl._bound = true;
  }
  if (dashPrefsSaveBtnEl && !dashPrefsSaveBtnEl._bound) {
    dashPrefsSaveBtnEl.addEventListener('click', dashPrefsSave);
    dashPrefsSaveBtnEl._bound = true;
  }
  if (dashPrefsResetBtnEl && !dashPrefsResetBtnEl._bound) {
    dashPrefsResetBtnEl.addEventListener('click', dashPrefsResetDraft);
    dashPrefsResetBtnEl._bound = true;
  }
  if (dashPrefsCancelBtnEl && !dashPrefsCancelBtnEl._bound) {
    dashPrefsCancelBtnEl.addEventListener('click', dashPrefsClose);
    dashPrefsCancelBtnEl._bound = true;
  }

  dashPrefsState.prefs = dashPrefsDefault();
  dashPrefsRender();
}

window.DashboardPrefs = {
  bootstrap: dashPrefsBootstrap,
  refreshUI: dashPrefsRefreshUI,
  resetSession: dashPrefsResetSession,
  isPageVisible: dashPrefsIsPageVisible,
  getFirstVisiblePage: dashPrefsFirstVisiblePage,
  isCustomizing: function () { return !!dashPrefsState.customizing; },
};

document.addEventListener('DOMContentLoaded', initDashboardPrefs);
