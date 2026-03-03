// ============ AUTH MODULE ============
// Handles login / logout / session token storage.
// Dependencies: notes.js (notesSaveImmediate, notesState) — loaded after this file

// ⚠️  DEV ONLY — flip to true to skip login screen during local testing
var DEV_BYPASS_AUTH = false;

var AUTH_KEY = 'ncaa_auth_token';
var AUTH_USER_KEY = 'ncaa_auth_user';

var LOGIN_URL = 'https://hidden-salad-773b.bryanhkwan.workers.dev/login';

function authGetToken()    { return localStorage.getItem(AUTH_KEY); }
function authGetUser()     { return localStorage.getItem(AUTH_USER_KEY); }
function authSave(token, username) {
  localStorage.setItem(AUTH_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, username);
}
function authClear() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function authShowDashboard() {
  document.getElementById('authOverlay').classList.add('hidden');
  const userEl = document.getElementById('authUser');
  const logoutBtn = document.getElementById('logoutBtn');
  if (userEl) userEl.textContent = authGetUser() || '';
  if (logoutBtn) logoutBtn.style.display = '';
}

function authShowOverlay() {
  document.getElementById('authOverlay').classList.remove('hidden');
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = 'none';
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

function authInit() {
  const loginForm = document.getElementById('loginForm');
  const loginErr  = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');

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
      authSave(token, username);
      authShowDashboard();
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
      authShowOverlay();
      loginForm.reset();
      loginErr.textContent = '';
    });
  }

  // Check existing session (or dev bypass)
  if (DEV_BYPASS_AUTH || authGetToken()) {
    authShowDashboard();
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
