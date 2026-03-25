// ============ AUTH MODULE ============
// Handles login / logout / session token storage.
// Dependencies: notes.js (notesSaveImmediate, notesState) -- loaded after this file

// DEV ONLY -- flip to true to skip login screen during local testing
var DEV_BYPASS_AUTH = false;

var AUTH_KEY = 'ncaa_auth_token';
var AUTH_USER_KEY = 'ncaa_auth_user';
var AUTH_ROLE_KEY = 'ncaa_auth_role';
var AUTH_FORCE_PW_KEY = 'ncaa_auth_force_password_change';
var AUTH_GUEST_KEY = 'ncaa_guest_mode';
var GUEST_AI_KEY = 'ncaa_guest_ai_uses';
var AUTH_GUEST_TOUR_KEY = 'ncaa_guest_demo_tour_seen';

function authGetToken() { return localStorage.getItem(AUTH_KEY); }
function authGetUser() { return localStorage.getItem(AUTH_USER_KEY); }
function authGetRole() { return localStorage.getItem(AUTH_ROLE_KEY) || 'user'; }
function authMustChangePassword() { return localStorage.getItem(AUTH_FORCE_PW_KEY) === '1'; }
function authIsGuest() { return !authGetToken() && localStorage.getItem(AUTH_GUEST_KEY) === '1'; }
function authIsAdmin() {
  var username = (authGetUser() || '').toLowerCase();
  return !authIsGuest() && (authGetRole() === 'admin' || username === 'utdata');
}

var LOGIN_URL = 'https://hidden-salad-773b.bryanhkwan.workers.dev/login';
var REGISTER_URL = LOGIN_URL.replace(/\/login$/, '/register');
var ME_URL = LOGIN_URL.replace(/\/login$/, '/me');
var CHANGE_PASSWORD_URL = LOGIN_URL.replace(/\/login$/, '/account/change-password');

function authSave(token, username, role, mustChangePassword) {
  localStorage.setItem(AUTH_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, username || '');
  localStorage.setItem(AUTH_ROLE_KEY, role || 'user');
  localStorage.setItem(AUTH_FORCE_PW_KEY, mustChangePassword ? '1' : '0');
}

function authClear() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_ROLE_KEY);
  localStorage.removeItem(AUTH_FORCE_PW_KEY);
  localStorage.removeItem(AUTH_GUEST_KEY);
}

function authSetMode(mode) {
  var loginView = document.getElementById('authLoginView');
  var registerView = document.getElementById('authRegisterView');
  var showLogin = mode !== 'register';
  if (loginView) loginView.style.display = showLogin ? '' : 'none';
  if (registerView) registerView.style.display = showLogin ? 'none' : '';
}

function authClearFormMessages() {
  var loginErr = document.getElementById('loginError');
  var registerErr = document.getElementById('registerError');
  var registerSuccess = document.getElementById('registerSuccess');
  var pwChangeError = document.getElementById('pwChangeError');
  if (loginErr) loginErr.textContent = '';
  if (registerErr) registerErr.textContent = '';
  if (registerSuccess) registerSuccess.textContent = '';
  if (pwChangeError) pwChangeError.textContent = '';
}

function authHidePasswordChangeOverlay() {
  var overlay = document.getElementById('pwChangeOverlay');
  if (overlay) overlay.classList.add('hidden');
}

function authShowPasswordChangeOverlay() {
  var overlay = document.getElementById('pwChangeOverlay');
  if (!overlay) return;
  var err = document.getElementById('pwChangeError');
  var form = document.getElementById('pwChangeForm');
  if (err) err.textContent = '';
  if (form) form.reset();
  overlay.classList.remove('hidden');
}

async function authFetchMe() {
  var token = authGetToken();
  var headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  var res = await fetch(ME_URL, { credentials: 'include', headers: headers });
  if (!res.ok) throw new Error('Session check failed (' + res.status + ')');
  var data = await res.json().catch(function () { return {}; });
  return data && data.user ? data.user : null;
}

async function authValidateStoredSession() {
  if (DEV_BYPASS_AUTH || authIsGuest()) return true;
  var token = authGetToken();
  if (!token) return false;
  try {
    var user = await authFetchMe();
    if (!user || !user.username) {
      authClear();
      return false;
    }
    authSave(token, user.username, user.role, !!user.must_change_password);
    return true;
  } catch (_) {
    authClear();
    return false;
  }
}

function authHandleUnauthorized(message) {
  authClear();
  authHidePasswordChangeOverlay();
  if (window.EvalPresets && typeof window.EvalPresets.resetSession === 'function') {
    window.EvalPresets.resetSession();
  }
  if (window.DashboardPrefs && typeof window.DashboardPrefs.resetSession === 'function') {
    window.DashboardPrefs.resetSession();
  }
  if (window.AdminPanel && typeof window.AdminPanel.resetSession === 'function') {
    window.AdminPanel.resetSession();
  }
  if (window.ValueLab && typeof window.ValueLab.resetSession === 'function') {
    window.ValueLab.resetSession();
  }
  if (window.SharesManager && typeof window.SharesManager.resetSession === 'function') {
    window.SharesManager.resetSession();
  }
  var loadingOverlay = document.getElementById('loadingOverlay');
  var welcomeOverlay = document.getElementById('welcomeOverlay');
  if (loadingOverlay) loadingOverlay.classList.add('hidden');
  if (welcomeOverlay) welcomeOverlay.classList.add('hidden');
  authShowOverlay();
  var loginErr = document.getElementById('loginError');
  if (loginErr) loginErr.textContent = message || 'Your session expired. Please log in again.';
}

// Loading coordination -- loading screen exits as soon as the intro video ends
var _loadDataReady = false;
var _loadVideoEnded = false;

function authEnterGuest() {
  localStorage.removeItem(AUTH_ROLE_KEY);
  localStorage.removeItem(AUTH_FORCE_PW_KEY);
  authHidePasswordChangeOverlay();
  localStorage.setItem(AUTH_GUEST_KEY, '1');
  try { sessionStorage.removeItem(AUTH_GUEST_TOUR_KEY); } catch (_) {}
  if (window.SharesManager && typeof window.SharesManager.resetSession === 'function') {
    window.SharesManager.resetSession();
  }
  authStartLoading();
}

function authMaybeStartGuestTour() {
  if (!authIsGuest()) return;
  if (!_loadDataReady) return;
  try {
    if (sessionStorage.getItem(AUTH_GUEST_TOUR_KEY) === '1') return;
  } catch (_) {}
  if (!window._tour || typeof window._tour.startGuestDemo !== 'function') return;
  try { sessionStorage.setItem(AUTH_GUEST_TOUR_KEY, '1'); } catch (_) {}
  setTimeout(function () {
    if (window.HelpPanel && typeof window.HelpPanel.close === 'function') {
      window.HelpPanel.close();
    }
    if (window._tour && typeof window._tour.startGuestDemo === 'function') {
      window._tour.startGuestDemo();
    }
  }, 900);
}

/* Show loading screen and start video + data fetch in parallel */
function authStartLoading() {
  _loadDataReady = false;
  _loadVideoEnded = false;

  document.getElementById('authOverlay').classList.add('hidden');
  var loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');

  // Set up video -- mark ended when it finishes (or errors / can't autoplay)
  var video = document.getElementById('loadingVideo');
  if (video) {
    var onVideoEnd = function () { _loadVideoEnded = true; _checkLoadingComplete(); };
    video.addEventListener('ended', onVideoEnd, { once: true });
    video.addEventListener('error', onVideoEnd, { once: true });
    video.play().catch(onVideoEnd);
  } else {
    _loadVideoEnded = true;
  }

  // Trigger data load in parallel -- MBB from CBD API, WBB from ESPN/worker-backed sources
  if (typeof loadAllData === 'function') {
    var season = typeof getDashboardSelectedSeason === 'function'
      ? getDashboardSelectedSeason('2026')
      : '2026';
    setTimeout(function () { loadAllData(season); }, 50);
  } else if (typeof loadFromGoogleSheets === 'function') {
    setTimeout(function () { loadFromGoogleSheets(DEFAULT_GS_URL, DEFAULT_GS_API_KEY); }, 50);
  }
}

/* Called by data.js when data is fully loaded */
function authFinishLoading() {
  if (typeof favsLoad === 'function') favsLoad();
  if (typeof sharesLoad === 'function') sharesLoad();
  if (window.EvalPresets && typeof window.EvalPresets.bootstrap === 'function') {
    window.EvalPresets.bootstrap();
  }
  if (window.DashboardPrefs && typeof window.DashboardPrefs.bootstrap === 'function') {
    window.DashboardPrefs.bootstrap();
  }
  if (window.AdminPanel && typeof window.AdminPanel.bootstrap === 'function') {
    window.AdminPanel.bootstrap();
  }
  var loadingOverlay = document.getElementById('loadingOverlay');
  if (loadingOverlay && !loadingOverlay.classList.contains('hidden')) {
    _loadDataReady = true;
    _checkLoadingComplete();
  } else {
    _authSetupHeader();
  }
}

/* Show Welcome overlay once the intro video is done; data can continue loading in background */
function _checkLoadingComplete() {
  if (!_loadVideoEnded) return;

  var welcomeOverlay = document.getElementById('welcomeOverlay');
  var welcomeName = document.getElementById('welcomeName');
  var name = authIsGuest() ? 'Guest' : (authGetUser() || 'Coach');
  if (welcomeName) welcomeName.textContent = name;
  if (welcomeOverlay) welcomeOverlay.classList.remove('hidden');

  var overlay = document.getElementById('loadingOverlay');
  _authSetupHeader();
  setTimeout(function () {
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(function () {
        overlay.classList.add('hidden');
        overlay.classList.remove('fade-out');
      }, 500);
    }
  }, 650);
}

function authShowDashboard() {
  document.getElementById('authOverlay').classList.add('hidden');
  _authSetupHeader();
}

/* Internal: set header user/buttons after auth */
function _authSetupHeader() {
  var userEl = document.getElementById('authUser');
  var logoutBtn = document.getElementById('logoutBtn');
  var guestLoginBtn = document.getElementById('guestLoginBtn');
  var demoModeBanner = document.getElementById('demoModeBanner');
  var notesToggle = document.getElementById('notesToggle');
  var isGuest = authIsGuest();

  if (typeof window._apiUsageUpdateBadge === 'function') window._apiUsageUpdateBadge();

  if (isGuest) {
    if (userEl) userEl.textContent = 'Guest';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (guestLoginBtn) guestLoginBtn.style.display = '';
    if (notesToggle) notesToggle.style.display = 'none';
  } else {
    if (userEl) userEl.textContent = authGetUser() || '';
    if (logoutBtn) logoutBtn.style.display = '';
    if (guestLoginBtn) guestLoginBtn.style.display = 'none';
    if (notesToggle) notesToggle.style.display = '';
  }
  if (demoModeBanner) demoModeBanner.style.display = isGuest ? '' : 'none';
  if (isGuest && window._dashboardCurrentPageId === 'pageMethodology' && window.TeamBuilder && typeof window.TeamBuilder.showDashboardPage === 'function') {
    window.TeamBuilder.showDashboardPage('pagePlayers', 'pagePlayers');
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
  if (window.DashboardPrefs && typeof window.DashboardPrefs.refreshUI === 'function') {
    window.DashboardPrefs.refreshUI();
  }
  if (window.AdminPanel && typeof window.AdminPanel.refreshUI === 'function') {
    window.AdminPanel.refreshUI();
  }
  if (window.SharesManager && typeof window.SharesManager.refreshUI === 'function') {
    window.SharesManager.refreshUI();
  }
  if (window.HelpPanel && typeof window.HelpPanel.refreshCurrentPage === 'function') {
    window.HelpPanel.refreshCurrentPage();
  }
  if (window._app && typeof window._app.refreshGuestDemoUI === 'function') {
    window._app.refreshGuestDemoUI();
  }
  if (isGuest) authMaybeStartGuestTour();
  if (!isGuest && authMustChangePassword()) authShowPasswordChangeOverlay();
  else authHidePasswordChangeOverlay();
}

function authShowOverlay() {
  authSetMode('login');
  authClearFormMessages();
  authHidePasswordChangeOverlay();
  document.getElementById('authOverlay').classList.remove('hidden');
  var logoutBtn = document.getElementById('logoutBtn');
  var guestLoginBtn = document.getElementById('guestLoginBtn');
  var notesToggle = document.getElementById('notesToggle');
  if (logoutBtn) logoutBtn.style.display = 'none';
  if (guestLoginBtn) guestLoginBtn.style.display = 'none';
  if (notesToggle) notesToggle.style.display = 'none';
  var userEl = document.getElementById('authUser');
  if (userEl) userEl.textContent = '';
}

function authPromptUpgrade(message) {
  authShowOverlay();
  var loginErr = document.getElementById('loginError');
  if (loginErr) loginErr.textContent = message || 'Log in with an approved UToledo Athletics account to access this internal workflow.';
}

async function authPost(url, body) {
  var token = authGetToken();
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  var res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: headers,
    body: JSON.stringify(body)
  });
  var data;
  try { data = await res.json(); } catch (_) { data = {}; }
  if (!res.ok) throw new Error(data.message || data.error || ('Error ' + res.status));
  return data;
}

async function authInit() {
  var loginForm = document.getElementById('loginForm');
  var loginErr = document.getElementById('loginError');
  var registerForm = document.getElementById('registerForm');
  var registerErr = document.getElementById('registerError');
  var registerSuccess = document.getElementById('registerSuccess');
  var pwChangeForm = document.getElementById('pwChangeForm');
  var pwChangeError = document.getElementById('pwChangeError');
  var logoutBtn = document.getElementById('logoutBtn');
  var guestBtn = document.getElementById('guestBtn');
  var guestLoginBtn = document.getElementById('guestLoginBtn');
  var demoModeLoginBtn = document.getElementById('demoModeLoginBtn');
  var showCreateAccountBtn = document.getElementById('showCreateAccountBtn');
  var backToLoginBtn = document.getElementById('backToLoginBtn');

  authSetMode('login');

  if (guestBtn) {
    guestBtn.addEventListener('click', function () { authEnterGuest(); });
  }

  if (showCreateAccountBtn) {
    showCreateAccountBtn.addEventListener('click', function () {
      authClearFormMessages();
      authSetMode('register');
    });
  }

  if (backToLoginBtn) {
    backToLoginBtn.addEventListener('click', function () {
      authClearFormMessages();
      authSetMode('login');
    });
  }

  if (guestLoginBtn) {
    guestLoginBtn.addEventListener('click', function () {
      localStorage.removeItem(AUTH_GUEST_KEY);
      localStorage.removeItem(AUTH_ROLE_KEY);
      localStorage.removeItem(AUTH_FORCE_PW_KEY);
      var notesToggle = document.getElementById('notesToggle');
      if (notesToggle) notesToggle.style.display = 'none';
      authShowOverlay();
    });
  }

  if (demoModeLoginBtn) {
    demoModeLoginBtn.addEventListener('click', function () {
      authPromptUpgrade('Log in with an approved staff account to unlock internal methodology, model settings, and collaboration.');
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      loginErr.textContent = '';
      var username = (document.getElementById('loginUsername').value || '').trim();
      var password = document.getElementById('loginPassword').value;
      var btn = loginForm.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Logging in...';
      try {
        var data = await authPost(LOGIN_URL, { username: username, password: password });
        var token = data.token || data.jwt || data.access_token || data.accessToken
          || data.session_token || data.sessionToken || data.auth_token || data.authToken
          || data.id_token || data.idToken || data.key || data.bearer
          || (data.data && (data.data.token || data.data.jwt || data.data.access_token))
          || (data.user && (data.user.token || data.user.jwt))
          || '';
        if (!token) throw new Error('Login succeeded but no session token was returned.');
        authSave(
          token,
          (data.user && data.user.username) || username,
          data.user && data.user.role,
          !!(data.user && data.user.must_change_password)
        );
        localStorage.removeItem(AUTH_GUEST_KEY);
        authStartLoading();
      } catch (err) {
        loginErr.textContent = err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Login';
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (registerErr) registerErr.textContent = '';
      if (registerSuccess) registerSuccess.textContent = '';

      var username = (document.getElementById('registerUsername').value || '').trim();
      var email = (document.getElementById('registerEmail').value || '').trim();
      var password = document.getElementById('registerPassword').value || '';
      var confirm = document.getElementById('registerPasswordConfirm').value || '';
      var btn = registerForm.querySelector('button[type="submit"]');

      if (password !== confirm) {
        registerErr.textContent = 'Passwords do not match.';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Submitting...';
      try {
        var data = await authPost(REGISTER_URL, { username: username, email: email, password: password });
        registerForm.reset();
        if (registerSuccess) {
          registerSuccess.textContent = data.message || 'Account request submitted. An admin must approve it before you can log in.';
        }
      } catch (err) {
        registerErr.textContent = err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Request Account';
      }
    });
  }

  if (pwChangeForm) {
    pwChangeForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (pwChangeError) pwChangeError.textContent = '';

      var newPassword = document.getElementById('pwChangeNew').value || '';
      var confirmPassword = document.getElementById('pwChangeConfirm').value || '';
      var btn = pwChangeForm.querySelector('button[type="submit"]');

      if (newPassword.length < 8) {
        pwChangeError.textContent = 'New password must be at least 8 characters.';
        return;
      }
      if (newPassword !== confirmPassword) {
        pwChangeError.textContent = 'Passwords do not match.';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Saving...';
      try {
        await authPost(CHANGE_PASSWORD_URL, { new_password: newPassword });
        localStorage.setItem(AUTH_FORCE_PW_KEY, '0');
        authHidePasswordChangeOverlay();
        _authSetupHeader();
      } catch (err) {
        pwChangeError.textContent = err.message || 'Unable to change password.';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save New Password';
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      notesSaveImmediate();
      var notesPanel = document.getElementById('notesPanel');
      if (notesPanel) notesPanel.classList.add('hidden');
      notesState.notes = [];
      notesState.activeId = null;
      notesState.dirty = false;
      notesState.loaded = false;
      authClear();
      if (window.EvalPresets && typeof window.EvalPresets.resetSession === 'function') {
        window.EvalPresets.resetSession();
      }
      if (window.DashboardPrefs && typeof window.DashboardPrefs.resetSession === 'function') {
        window.DashboardPrefs.resetSession();
      }
      if (window.AdminPanel && typeof window.AdminPanel.resetSession === 'function') {
        window.AdminPanel.resetSession();
      }
      if (window.ValueLab && typeof window.ValueLab.resetSession === 'function') {
        window.ValueLab.resetSession();
      }
      if (window.SharesManager && typeof window.SharesManager.resetSession === 'function') {
        window.SharesManager.resetSession();
      }
      authShowOverlay();
      if (loginForm) loginForm.reset();
      if (registerForm) registerForm.reset();
      if (pwChangeForm) pwChangeForm.reset();
      authClearFormMessages();
    });
  }

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

class Auth {
  getToken() { return authGetToken(); }
  getUser() { return authGetUser(); }
  getRole() { return authGetRole(); }
  mustChangePassword() { return authMustChangePassword(); }
  isGuest() { return authIsGuest(); }
  isAdmin() { return authIsAdmin(); }
  showDashboard() { return authShowDashboard(); }
  showOverlay() { return authShowOverlay(); }
  promptUpgrade(message) { return authPromptUpgrade(message); }
  clear() { return authClear(); }
}

window.Auth = new Auth();
window.authPromptUpgrade = authPromptUpgrade;
