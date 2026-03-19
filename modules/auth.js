// ============ AUTH MODULE ============
// Handles login / logout / session token storage.
// Dependencies: notes.js (notesSaveImmediate, notesState) — loaded after this file

// ⚠️  DEV ONLY — flip to true to skip login screen during local testing
var DEV_BYPASS_AUTH = false;

var AUTH_KEY = 'ncaa_auth_token';
var AUTH_USER_KEY = 'ncaa_auth_user';
var AUTH_GUEST_KEY = 'ncaa_guest_mode';
var GUEST_AI_KEY = 'ncaa_guest_ai_uses';

function authIsGuest() { return !authGetToken() && localStorage.getItem(AUTH_GUEST_KEY) === '1'; }

var LOGIN_URL = 'https://hidden-salad-773b.bryanhkwan.workers.dev/login';
var ME_URL = LOGIN_URL.replace(/\/login$/, '/me');

function authGetToken()    { return localStorage.getItem(AUTH_KEY); }
function authGetUser()     { return localStorage.getItem(AUTH_USER_KEY); }
function authSave(token, username) {
  localStorage.setItem(AUTH_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, username);
}
function authClear() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_GUEST_KEY);
}


async function authFetchMe() {
  const token = authGetToken();
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(ME_URL, { credentials: 'include', headers: headers });
  if (!res.ok) throw new Error('Session check failed (' + res.status + ')');
  const data = await res.json().catch(function () { return {}; });
  return data && data.user ? data.user : null;
}

async function authValidateStoredSession() {
  if (DEV_BYPASS_AUTH || authIsGuest()) return true;
  const token = authGetToken();
  if (!token) return false;
  try {
    const user = await authFetchMe();
    if (!user || !user.username) {
      authClear();
      return false;
    }
    authSave(token, user.username);
    return true;
  } catch (_) {
    authClear();
    return false;
  }
}

function authHandleUnauthorized(message) {
  authClear();
  if (window.EvalPresets && typeof window.EvalPresets.resetSession === 'function') {
    window.EvalPresets.resetSession();
  }
  const loadingOverlay = document.getElementById('loadingOverlay');
  const welcomeOverlay = document.getElementById('welcomeOverlay');
  if (loadingOverlay) loadingOverlay.classList.add('hidden');
  if (welcomeOverlay) welcomeOverlay.classList.add('hidden');
  authShowOverlay();
  const loginErr = document.getElementById('loginError');
  if (loginErr) loginErr.textContent = message || 'Your session expired. Please log in again.';
}

// Loading coordination — both flags must be true before Welcome shows
var _loadDataReady = false;
var _loadVideoEnded = false;

function authEnterGuest() {
  localStorage.setItem(AUTH_GUEST_KEY, '1');
  authStartLoading();
}

/* Show loading screen and start video + data fetch in parallel */
function authStartLoading() {
  _loadDataReady = false;
  _loadVideoEnded = false;

  document.getElementById('authOverlay').classList.add('hidden');
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');

  // Set up video — mark ended when it finishes (or errors / can't autoplay)
  const video = document.getElementById('loadingVideo');
  if (video) {
    const onVideoEnd = () => { _loadVideoEnded = true; _checkLoadingComplete(); };
    video.addEventListener('ended', onVideoEnd, { once: true });
    video.addEventListener('error', onVideoEnd, { once: true });
    video.play().catch(onVideoEnd);
  } else {
    _loadVideoEnded = true;
  }

  // Trigger data load in parallel — MBB from CBD API, WBB from ESPN/worker-backed sources
  if (typeof loadAllData === 'function') {
    const season = typeof getDashboardSelectedSeason === 'function'
      ? getDashboardSelectedSeason('2026')
      : '2026';
    setTimeout(() => loadAllData(season), 50);
  } else if (typeof loadFromGoogleSheets === 'function') {
    setTimeout(() => loadFromGoogleSheets(DEFAULT_GS_URL, DEFAULT_GS_API_KEY), 50);
  }
}

/* Called by data.js when data is fully loaded */
function authFinishLoading() {
  if (typeof favsLoad   === 'function') favsLoad();    // load per-user favorites after data is ready
  if (typeof sharesLoad === 'function') sharesLoad();  // load inbox + sent
  if (window.EvalPresets && typeof window.EvalPresets.bootstrap === 'function') {
    window.EvalPresets.bootstrap();
  }
  const loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay && !loadingOverlay.classList.contains('hidden')) {
    _loadDataReady = true;
    _checkLoadingComplete();
  } else {
    // Loading overlay not visible (e.g. manual Refresh Data button) — just update header
    _authSetupHeader();
  }
}

/* Show Welcome overlay once BOTH video has ended AND data is ready */
function _checkLoadingComplete() {
  if (!_loadDataReady || !_loadVideoEnded) return;

  const welcomeOverlay = document.getElementById('welcomeOverlay');
  const welcomeName   = document.getElementById('welcomeName');
  const name = authIsGuest() ? 'Guest' : (authGetUser() || 'Coach');
  if (welcomeName) welcomeName.textContent = name;
  if (welcomeOverlay) welcomeOverlay.classList.remove('hidden');

  // Auto-dismiss after 2 s
  setTimeout(() => {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('fade-out');
      }, 500);
    }
    _authSetupHeader();
  }, 1000);
}

function authShowDashboard() {
  document.getElementById('authOverlay').classList.add('hidden');
  _authSetupHeader();
}

/* Internal: set header user/buttons after auth */
function _authSetupHeader() {
  const userEl      = document.getElementById('authUser');
  const logoutBtn   = document.getElementById('logoutBtn');
  const guestLoginBtn = document.getElementById('guestLoginBtn');
  const notesToggle = document.getElementById('notesToggle');
  // Update API usage badge whenever auth state changes
  if (typeof window._apiUsageUpdateBadge === 'function') window._apiUsageUpdateBadge();
  if (authIsGuest()) {
    if (userEl)       userEl.textContent = 'Guest';
    if (logoutBtn)    logoutBtn.style.display = 'none';
    if (guestLoginBtn) guestLoginBtn.style.display = '';
    if (notesToggle)  notesToggle.style.display = 'none';
  } else {
    if (userEl)       userEl.textContent = authGetUser() || '';
    if (logoutBtn)    logoutBtn.style.display = '';
    if (guestLoginBtn) guestLoginBtn.style.display = 'none';
    if (notesToggle)  notesToggle.style.display = '';
  }
  if (window.TeamHub && typeof window.TeamHub.refreshTournamentLauncher === 'function') {
    window.TeamHub.refreshTournamentLauncher();
  }
  if (window.TeamHub && typeof window.TeamHub.refreshTournamentHub === 'function') {
    window.TeamHub.refreshTournamentHub();
  }
  if (window.EvalPresets && typeof window.EvalPresets.refreshUI === 'function') {
    window.EvalPresets.refreshUI();
  }
}

function authShowOverlay() {
  document.getElementById('authOverlay').classList.remove('hidden');
  const logoutBtn   = document.getElementById('logoutBtn');
  const guestLoginBtn = document.getElementById('guestLoginBtn');
  const notesToggle = document.getElementById('notesToggle');
  if (logoutBtn)    logoutBtn.style.display = 'none';
  if (guestLoginBtn) guestLoginBtn.style.display = 'none';
  if (notesToggle)  notesToggle.style.display = 'none';
  const userEl = document.getElementById('authUser');
  if (userEl) userEl.textContent = '';
}

async function authPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`);
  return data;
}

async function authInit() {
  const loginForm   = document.getElementById('loginForm');
  const loginErr    = document.getElementById('loginError');
  const logoutBtn   = document.getElementById('logoutBtn');
  const guestBtn    = document.getElementById('guestBtn');
  const guestLoginBtn = document.getElementById('guestLoginBtn');

  // Guest entry
  if (guestBtn) {
    guestBtn.addEventListener('click', () => authEnterGuest());
  }

  // Guest → Login (re-shows overlay, clears guest flag)
  if (guestLoginBtn) {
    guestLoginBtn.addEventListener('click', () => {
      localStorage.removeItem(AUTH_GUEST_KEY);
      const notesToggle = document.getElementById('notesToggle');
      if (notesToggle) notesToggle.style.display = 'none';
      authShowOverlay();
    });
  }

  // Login submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErr.textContent = '';
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = loginForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Logging in…';
    try {
      const data = await authPost(LOGIN_URL, { username, password });
      console.log('[Auth] login response:', JSON.stringify(data));
      const token = data.token || data.jwt || data.access_token || data.accessToken
        || data.session_token || data.sessionToken || data.auth_token || data.authToken
        || data.id_token || data.idToken || data.key || data.bearer
        || (data.data && (data.data.token || data.data.jwt || data.data.access_token))
        || (data.user && (data.user.token || data.user.jwt))
        || '';
      console.log('[Auth] extracted token:', token ? `${token.slice(0,16)}…` : '(empty — check response above)');
      if (!token) throw new Error('Login succeeded but no session token was returned.');
      authSave(token, (data.user && data.user.username) || username);
      localStorage.removeItem(AUTH_GUEST_KEY);  // exit guest mode on real login
      authStartLoading();
    } catch (err) {
      loginErr.textContent = err.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Login';
    }
  });

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      notesSaveImmediate();  // flush any unsaved note before session ends
      // hide notes panel
      const notesPanel = document.getElementById('notesPanel');
      if (notesPanel) notesPanel.classList.add('hidden');
      notesState.notes = [];
      notesState.activeId = null;
      notesState.dirty = false;
      notesState.loaded = false;
      authClear();
      if (window.EvalPresets && typeof window.EvalPresets.resetSession === 'function') {
        window.EvalPresets.resetSession();
      }
      authShowOverlay();
      loginForm.reset();
      loginErr.textContent = '';
    });
  }

  // Check existing session, guest mode, or dev bypass
  if (DEV_BYPASS_AUTH || authIsGuest()) {
    authStartLoading();
    return;
  }

  if (await authValidateStoredSession()) {
    authStartLoading();
  } else {
    authShowOverlay();
  }
}

document.addEventListener('DOMContentLoaded', authInit);

// --- Class wrapper (organizational) ---
class Auth {
  getToken(){ return authGetToken(); }
  getUser(){ return authGetUser(); }
  showDashboard(){ return authShowDashboard(); }
  showOverlay(){ return authShowOverlay(); }
  clear(){ return authClear(); }
}

window.Auth = new Auth();
