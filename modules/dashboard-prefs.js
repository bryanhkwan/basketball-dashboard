// ============ DASHBOARD PREFS MODULE ============
// Account-level UI customization for hidden tabs and Players-page control sections.
// Dependencies: auth.js, teambuilder.js

var DASH_PREFS_BASE = 'https://hidden-salad-773b.bryanhkwan.workers.dev/preferences';
var DASH_PREF_PAGE_IDS = [
  'pagePlayers',
  'pagePortal',
  'pageTeamBuilder',
  'pageTeams',
  'pageMethodology',
  'pageLab',
  'pageWarRoom',
  'pageFavorites',
  'pageCollaborate'
];
var DASH_PREF_TAB_OPTIONS = [
  { pageId: 'pagePortal', label: 'Transfer Portal', desc: 'Hide the portal board tab from the top navigation.' },
  { pageId: 'pageTeamBuilder', label: 'Team Builder', desc: 'Hide roster construction tools from the main nav.' },
  { pageId: 'pageTeams', label: 'Teams', desc: 'Hide the team scouting hub tab.' },
  { pageId: 'pageMethodology', label: 'Methodology', desc: 'Hide the methodology / explainer page.' },
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
  ]
};

var dashPrefsState = {
  loaded: false,
  loading: false,
  saving: false,
  prefs: null,
  draft: null,
};

var dashPrefsBtnEl, dashPrefsBackEl, dashPrefsTabsEl, dashPrefsSectionsEl;
var dashPrefsStatusEl, dashPrefsSaveBtnEl, dashPrefsResetBtnEl, dashPrefsCloseBtnEl;

function dashPrefsClone(value) {
  if (typeof deepClone === 'function') return deepClone(value);
  return JSON.parse(JSON.stringify(value));
}

function dashPrefsDefault() {
  return {
    version: 1,
    hiddenTabs: [],
    hiddenSections: {
      pagePlayers: [],
    },
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

function dashPrefsIsPageVisible(pageId) {
  var prefs = dashPrefsState.prefs || dashPrefsDefault();
  if (!pageId || pageId === 'pagePlayers') return true;
  if (pageId === 'pageWarRoom') return dashPrefsIsPageVisible('pageLab');
  return prefs.hiddenTabs.indexOf(pageId) === -1;
}

function dashPrefsFirstVisiblePage() {
  var options = ['pagePlayers'].concat(DASH_PREF_TAB_OPTIONS.map(function (item) { return item.pageId; }));
  for (var i = 0; i < options.length; i++) {
    if (dashPrefsIsPageVisible(options[i])) return options[i];
  }
  return 'pagePlayers';
}

function dashPrefsHiddenSectionsFor(pageId) {
  var prefs = dashPrefsState.prefs || dashPrefsDefault();
  var hidden = prefs.hiddenSections && prefs.hiddenSections[pageId];
  return Array.isArray(hidden) ? hidden : [];
}

function dashPrefsApply(prefs) {
  dashPrefsState.prefs = dashPrefsNormalize(prefs);

  var hiddenTabs = dashPrefsState.prefs.hiddenTabs;
  document.querySelectorAll('.pageNavBtn').forEach(function (btn) {
    var pageId = btn.dataset.page || '';
    btn.style.display = hiddenTabs.indexOf(pageId) >= 0 ? 'none' : '';
  });

  Object.keys(DASH_PREF_SECTION_OPTIONS).forEach(function (pageId) {
    var hidden = dashPrefsHiddenSectionsFor(pageId);
    (DASH_PREF_SECTION_OPTIONS[pageId] || []).forEach(function (item) {
      var el = document.getElementById(item.id);
      if (!el) return;
      el.style.display = hidden.indexOf(item.id) >= 0 ? 'none' : '';
    });
  });

  var currentPage = dashPrefsCurrentPageId();
  if (!dashPrefsIsPageVisible(currentPage)) {
    var fallback = dashPrefsFirstVisiblePage();
    if (typeof showDashboardPage === 'function') showDashboardPage(fallback);
  }

  dashPrefsRefreshUI();
}

function dashPrefsSetStatus(msg, tone) {
  if (!dashPrefsStatusEl) return;
  dashPrefsStatusEl.textContent = msg || '';
  dashPrefsStatusEl.style.color = tone === 'warn'
    ? 'var(--warn)'
    : tone === 'bad'
      ? 'var(--bad)'
      : 'var(--muted)';
}

function dashPrefsRenderChoiceList(container, options, hiddenList) {
  if (!container) return;
  var hiddenSet = {};
  (hiddenList || []).forEach(function (value) { hiddenSet[value] = true; });
  container.innerHTML = '';

  options.forEach(function (item) {
    var label = document.createElement('label');
    label.className = 'dashPrefItem';

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !hiddenSet[item.value];
    input.dataset.prefValue = item.value;

    var copy = document.createElement('div');
    copy.className = 'dashPrefCopy';

    var title = document.createElement('div');
    title.className = 'dashPrefTitle';
    title.textContent = item.label;

    var desc = document.createElement('div');
    desc.className = 'dashPrefDesc';
    desc.textContent = item.desc || '';

    copy.appendChild(title);
    copy.appendChild(desc);
    label.appendChild(input);
    label.appendChild(copy);
    container.appendChild(label);
  });
}

function dashPrefsBuildDraftFromModal() {
  var draft = dashPrefsClone(dashPrefsState.draft || dashPrefsState.prefs || dashPrefsDefault());
  draft.hiddenTabs = [];
  if (dashPrefsTabsEl) {
    dashPrefsTabsEl.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
      if (!input.checked) draft.hiddenTabs.push(input.dataset.prefValue);
    });
  }

  draft.hiddenSections = draft.hiddenSections || {};
  draft.hiddenSections.pagePlayers = [];
  if (dashPrefsSectionsEl) {
    dashPrefsSectionsEl.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
      if (!input.checked) draft.hiddenSections.pagePlayers.push(input.dataset.prefValue);
    });
  }
  dashPrefsState.draft = dashPrefsNormalize(draft);
}

function dashPrefsRenderModal() {
  if (!dashPrefsBackEl) return;
  var draft = dashPrefsNormalize(dashPrefsState.draft || dashPrefsState.prefs || dashPrefsDefault());
  dashPrefsState.draft = draft;

  dashPrefsRenderChoiceList(
    dashPrefsTabsEl,
    DASH_PREF_TAB_OPTIONS.map(function (item) {
      return { value: item.pageId, label: item.label, desc: item.desc };
    }),
    draft.hiddenTabs
  );
  dashPrefsRenderChoiceList(
    dashPrefsSectionsEl,
    (DASH_PREF_SECTION_OPTIONS.pagePlayers || []).map(function (item) {
      return { value: item.id, label: item.label, desc: item.desc };
    }),
    (draft.hiddenSections && draft.hiddenSections.pagePlayers) || []
  );

  dashPrefsSetStatus('These preferences save to your account and load automatically next time you log in.', '');
}

function dashPrefsOpen() {
  if (dashPrefsIsGuest()) {
    var guestLoginBtn = document.getElementById('guestLoginBtn');
    if (guestLoginBtn) guestLoginBtn.click();
    return;
  }
  dashPrefsState.draft = dashPrefsClone(dashPrefsState.prefs || dashPrefsDefault());
  dashPrefsRenderModal();
  dashPrefsBackEl.style.display = 'flex';
}

function dashPrefsClose() {
  if (!dashPrefsBackEl) return;
  dashPrefsBackEl.style.display = 'none';
  dashPrefsState.draft = null;
}

async function dashPrefsSave() {
  if (dashPrefsIsGuest()) {
    dashPrefsSetStatus('Log in to save dashboard customization by account.', 'warn');
    return;
  }
  dashPrefsBuildDraftFromModal();
  dashPrefsState.saving = true;
  try {
    var data = await dashPrefsFetch('', {
      method: 'PUT',
      body: JSON.stringify({ ui: dashPrefsState.draft || dashPrefsDefault() }),
    });
    dashPrefsApply((data && data.ui) || dashPrefsState.draft || dashPrefsDefault());
    dashPrefsClose();
  } catch (e) {
    if (e && e.code === 'UNAUTHORIZED' && typeof authHandleUnauthorized === 'function') {
      authHandleUnauthorized('Your session expired. Please log in again to save dashboard preferences.');
      return;
    }
    console.warn('[DashboardPrefs] save error:', e);
    dashPrefsSetStatus(e.message || 'Could not save preferences.', 'warn');
  } finally {
    dashPrefsState.saving = false;
  }
}

function dashPrefsResetDraft() {
  dashPrefsState.draft = dashPrefsDefault();
  dashPrefsRenderModal();
}

async function dashPrefsBootstrap(force) {
  if (dashPrefsIsGuest()) {
    dashPrefsState.loaded = true;
    dashPrefsApply(dashPrefsDefault());
    return;
  }
  if (dashPrefsState.loading) return;
  if (dashPrefsState.loaded && !force) {
    dashPrefsApply(dashPrefsState.prefs || dashPrefsDefault());
    return;
  }

  dashPrefsState.loading = true;
  try {
    var data = await dashPrefsFetch('', { method: 'GET' });
    dashPrefsState.loaded = true;
    dashPrefsApply((data && data.ui) || dashPrefsDefault());
  } catch (e) {
    if (e && e.code === 'UNAUTHORIZED' && typeof authHandleUnauthorized === 'function') {
      authHandleUnauthorized('Your session expired. Please log in again to load dashboard preferences.');
      return;
    }
    console.warn('[DashboardPrefs] bootstrap error:', e);
    dashPrefsState.loaded = true;
    dashPrefsApply(dashPrefsDefault());
  } finally {
    dashPrefsState.loading = false;
  }
}

function dashPrefsResetSession() {
  dashPrefsState.loaded = false;
  dashPrefsState.loading = false;
  dashPrefsState.saving = false;
  dashPrefsState.prefs = dashPrefsDefault();
  dashPrefsState.draft = null;
  dashPrefsApply(dashPrefsDefault());
  dashPrefsClose();
}

function dashPrefsRefreshUI() {
  if (dashPrefsBtnEl) {
    dashPrefsBtnEl.title = dashPrefsIsGuest()
      ? 'Log in to save dashboard customization'
      : 'Customize visible tabs and page sections';
  }
}

function initDashboardPrefs() {
  dashPrefsBtnEl = document.getElementById('dashboardPrefsBtn');
  dashPrefsBackEl = document.getElementById('dashboardPrefsBack');
  dashPrefsTabsEl = document.getElementById('dashPrefsTabs');
  dashPrefsSectionsEl = document.getElementById('dashPrefsSections');
  dashPrefsStatusEl = document.getElementById('dashPrefsStatus');
  dashPrefsSaveBtnEl = document.getElementById('dashPrefsSaveBtn');
  dashPrefsResetBtnEl = document.getElementById('dashPrefsResetBtn');
  dashPrefsCloseBtnEl = document.getElementById('dashPrefsCloseBtn');

  if (dashPrefsBtnEl && !dashPrefsBtnEl._bound) {
    dashPrefsBtnEl.addEventListener('click', dashPrefsOpen);
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
  if (dashPrefsCloseBtnEl && !dashPrefsCloseBtnEl._bound) {
    dashPrefsCloseBtnEl.addEventListener('click', dashPrefsClose);
    dashPrefsCloseBtnEl._bound = true;
  }
  if (dashPrefsBackEl && !dashPrefsBackEl._bound) {
    dashPrefsBackEl.addEventListener('click', function (e) {
      if (e.target === dashPrefsBackEl) dashPrefsClose();
    });
    dashPrefsBackEl._bound = true;
  }

  dashPrefsApply(dashPrefsDefault());
  dashPrefsRefreshUI();
}

window.DashboardPrefs = {
  bootstrap: dashPrefsBootstrap,
  refreshUI: dashPrefsRefreshUI,
  resetSession: dashPrefsResetSession,
  isPageVisible: dashPrefsIsPageVisible,
  getFirstVisiblePage: dashPrefsFirstVisiblePage,
};

document.addEventListener('DOMContentLoaded', initDashboardPrefs);
