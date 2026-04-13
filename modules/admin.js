// ============ ADMIN MODULE ============
// Account approval + user management for the utdata admin account.
// Dependencies: auth.js, teambuilder.js

var ADMIN_BASE_URL = URLS.WORKER;
var ADMIN_REQUESTS_URL = ADMIN_BASE_URL + '/admin/account-requests';
var ADMIN_USERS_URL = ADMIN_BASE_URL + '/admin/users';

var adminState = {
  loading: false,
  loaded: false,
  requests: [],
  users: [],
  feedback: null,
  tempPassword: null,
};

var adminNavBtnEl;
var adminRefreshBtnEl;
var adminAccessDeniedEl;
var adminPanelWrapEl;
var adminFeedbackEl;
var adminTempPasswordCardEl;
var adminTempPasswordTextEl;
var adminRequestCountEl;
var adminUserCountEl;
var adminRequestBodyEl;
var adminUsersBodyEl;
var adminRequestEmptyEl;
var adminUsersEmptyEl;

function adminInitRefs() {
  adminNavBtnEl = document.getElementById('adminNavBtn');
  adminRefreshBtnEl = document.getElementById('adminRefreshBtn');
  adminAccessDeniedEl = document.getElementById('adminAccessDenied');
  adminPanelWrapEl = document.getElementById('adminPanelWrap');
  adminFeedbackEl = document.getElementById('adminFeedback');
  adminTempPasswordCardEl = document.getElementById('adminTempPasswordCard');
  adminTempPasswordTextEl = document.getElementById('adminTempPasswordText');
  adminRequestCountEl = document.getElementById('adminRequestCount');
  adminUserCountEl = document.getElementById('adminUserCount');
  adminRequestBodyEl = document.getElementById('adminRequestBody');
  adminUsersBodyEl = document.getElementById('adminUsersBody');
  adminRequestEmptyEl = document.getElementById('adminRequestEmpty');
  adminUsersEmptyEl = document.getElementById('adminUsersEmpty');
}

function adminCanAccess() {
  return typeof authIsAdmin === 'function' && authIsAdmin();
}

function adminResetSession() {
  adminState.loading = false;
  adminState.loaded = false;
  adminState.requests = [];
  adminState.users = [];
  adminState.feedback = null;
  adminState.tempPassword = null;
  adminRender();
}

function adminFormatDate(value) {
  if (!value) return '-';
  var dt = new Date(value);
  if (!Number.isFinite(dt.getTime())) return value;
  return dt.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function adminSetFeedback(message, tone) {
  adminState.feedback = message ? { message: message, tone: tone || 'info' } : null;
  if (!adminFeedbackEl) return;
  if (!adminState.feedback) {
    adminFeedbackEl.style.display = 'none';
    adminFeedbackEl.textContent = '';
    adminFeedbackEl.className = 'adminFeedback';
    return;
  }
  adminFeedbackEl.style.display = '';
  adminFeedbackEl.textContent = adminState.feedback.message;
  adminFeedbackEl.className = 'adminFeedback ' + (adminState.feedback.tone || 'info');
}

function adminSetTempPassword(username, password) {
  adminState.tempPassword = password ? {
    username: username || '',
    password: password
  } : null;
}

async function adminFetch(url, opts) {
  opts = opts || {};
  var token = typeof authGetToken === 'function' ? authGetToken() : null;
  var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (token) headers.Authorization = 'Bearer ' + token;
  var res = await fetch(url, Object.assign({ credentials: 'include', headers: headers }, opts));
  var data = await res.json().catch(function () { return {}; });
  if (res.status === 401) {
    if (typeof authHandleUnauthorized === 'function') {
      authHandleUnauthorized('Your session expired. Please log in again.');
    }
    var unauthorized = new Error('Unauthorized');
    unauthorized.code = 'UNAUTHORIZED';
    throw unauthorized;
  }
  if (res.status === 403) {
    var forbidden = new Error(data.message || data.error || 'Admin access required.');
    forbidden.code = 'FORBIDDEN';
    throw forbidden;
  }
  if (!res.ok) {
    throw new Error(data.message || data.error || ('Error ' + res.status));
  }
  return data;
}

function adminRenderRequests() {
  if (!adminRequestBodyEl) return;
  adminRequestBodyEl.innerHTML = '';
  var requests = Array.isArray(adminState.requests) ? adminState.requests : [];
  if (adminRequestCountEl) adminRequestCountEl.textContent = String(requests.length);
  if (adminRequestEmptyEl) adminRequestEmptyEl.style.display = requests.length ? 'none' : '';

  requests.forEach(function (item) {
    var tr = document.createElement('tr');
    tr.innerHTML = '' +
      '<td><b>' + (item.username || '-') + '</b></td>' +
      '<td>' + (item.email || '-') + '</td>' +
      '<td>' + adminFormatDate(item.requested_at) + '</td>' +
      '<td style="text-align:right">' +
        '<div class="adminActions">' +
          '<button type="button" class="primary adminApproveBtn">Approve</button>' +
          '<button type="button" class="secondary adminRejectBtn">Reject</button>' +
        '</div>' +
      '</td>';
    tr.querySelector('.adminApproveBtn').addEventListener('click', function () {
      adminApproveRequest(item.id, item.username);
    });
    tr.querySelector('.adminRejectBtn').addEventListener('click', function () {
      adminRejectRequest(item.id, item.username);
    });
    adminRequestBodyEl.appendChild(tr);
  });
}

function adminRenderUsers() {
  if (!adminUsersBodyEl) return;
  adminUsersBodyEl.innerHTML = '';
  var users = Array.isArray(adminState.users) ? adminState.users : [];
  if (adminUserCountEl) adminUserCountEl.textContent = String(users.length);
  if (adminUsersEmptyEl) adminUsersEmptyEl.style.display = users.length ? 'none' : '';

  users.forEach(function (item) {
    var tr = document.createElement('tr');
    var roleClass = (item.role || 'user') === 'admin' ? 'adminRolePill admin' : 'adminRolePill';
    var passwordStatus = item.must_change_password
      ? '<span class="adminRolePill warn">Reset Required</span>'
      : '<span class="adminProtectedPill">Up to date</span>';
    var deleteCell = item.is_protected
      ? '<span class="adminProtectedPill">Protected</span>'
      : '<button type="button" class="secondary adminDeleteBtn">Delete</button>';
    tr.innerHTML = '' +
      '<td><b>' + (item.username || '-') + '</b></td>' +
      '<td>' + (item.email || '-') + '</td>' +
      '<td><span class="' + roleClass + '">' + ((item.role || 'user').toUpperCase()) + '</span></td>' +
      '<td>' + passwordStatus + '</td>' +
      '<td>' + adminFormatDate(item.created_at) + '</td>' +
      '<td style="text-align:right"><div class="adminActions"><button type="button" class="secondary adminResetBtn">Reset Password</button>' + deleteCell + '</div></td>';
    var resetBtn = tr.querySelector('.adminResetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        adminResetPassword(item.id, item.username);
      });
    }
    var deleteBtn = tr.querySelector('.adminDeleteBtn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', function () {
        adminDeleteUser(item.id, item.username);
      });
    }
    adminUsersBodyEl.appendChild(tr);
  });
}

function adminRender() {
  if (!adminNavBtnEl) adminInitRefs();

  if (adminNavBtnEl) {
    var visible = adminCanAccess();
    adminNavBtnEl.dataset.adminHidden = visible ? '0' : '1';
    adminNavBtnEl.style.display = visible ? '' : 'none';
  }

  if (adminFeedbackEl) adminSetFeedback(adminState.feedback && adminState.feedback.message, adminState.feedback && adminState.feedback.tone);
  if (adminTempPasswordCardEl) {
    if (adminState.tempPassword && adminState.tempPassword.password) {
      adminTempPasswordCardEl.style.display = '';
      if (adminTempPasswordTextEl) {
        adminTempPasswordTextEl.textContent = (adminState.tempPassword.username ? (adminState.tempPassword.username + ': ') : '') + adminState.tempPassword.password;
      }
    } else {
      adminTempPasswordCardEl.style.display = 'none';
      if (adminTempPasswordTextEl) adminTempPasswordTextEl.textContent = '';
    }
  }

  if (!adminCanAccess()) {
    if (adminAccessDeniedEl) adminAccessDeniedEl.style.display = '';
    if (adminPanelWrapEl) adminPanelWrapEl.style.display = 'none';
    return;
  }

  if (adminAccessDeniedEl) adminAccessDeniedEl.style.display = 'none';
  if (adminPanelWrapEl) adminPanelWrapEl.style.display = '';
  adminRenderRequests();
  adminRenderUsers();
}

async function adminLoad(force) {
  if (!adminCanAccess()) {
    adminRender();
    return;
  }
  if (adminState.loading) return;
  if (adminState.loaded && !force) {
    adminRender();
    return;
  }

  adminState.loading = true;
  adminSetFeedback('Refreshing admin data...', 'info');
  try {
    var result = await Promise.all([
      adminFetch(ADMIN_REQUESTS_URL),
      adminFetch(ADMIN_USERS_URL)
    ]);
    adminState.requests = result[0] && Array.isArray(result[0].requests) ? result[0].requests : [];
    adminState.users = result[1] && Array.isArray(result[1].users) ? result[1].users : [];
    adminState.loaded = true;
    adminSetFeedback('', 'info');
  } catch (err) {
    if (err.code !== 'UNAUTHORIZED') {
      adminSetFeedback(err.message || 'Unable to load admin data.', 'error');
    }
  } finally {
    adminState.loading = false;
    adminRender();
  }
}

async function adminApproveRequest(id, username) {
  adminSetFeedback('Approving ' + username + '...', 'info');
  adminSetTempPassword('', '');
  try {
    await adminFetch(ADMIN_REQUESTS_URL + '/' + encodeURIComponent(id) + '/approve', { method: 'POST' });
    adminSetFeedback('Approved ' + username + '.', 'success');
    adminState.loaded = false;
    await adminLoad(true);
  } catch (err) {
    adminSetFeedback(err.message || 'Unable to approve account request.', 'error');
    adminRender();
  }
}

async function adminRejectRequest(id, username) {
  if (!window.confirm('Reject the pending account request for ' + username + '?')) return;
  adminSetFeedback('Rejecting ' + username + '...', 'info');
  adminSetTempPassword('', '');
  try {
    await adminFetch(ADMIN_REQUESTS_URL + '/' + encodeURIComponent(id) + '/reject', { method: 'POST' });
    adminSetFeedback('Rejected ' + username + '.', 'success');
    adminState.loaded = false;
    await adminLoad(true);
  } catch (err) {
    adminSetFeedback(err.message || 'Unable to reject account request.', 'error');
    adminRender();
  }
}

async function adminDeleteUser(id, username) {
  if (!window.confirm('Delete the account for ' + username + '? This cannot be undone.')) return;
  adminSetFeedback('Deleting ' + username + '...', 'info');
  adminSetTempPassword('', '');
  try {
    await adminFetch(ADMIN_USERS_URL + '/' + encodeURIComponent(id), { method: 'DELETE' });
    adminSetFeedback('Deleted ' + username + '.', 'success');
    adminState.loaded = false;
    await adminLoad(true);
  } catch (err) {
    adminSetFeedback(err.message || 'Unable to delete that account.', 'error');
    adminRender();
  }
}

async function adminResetPassword(id, username) {
  if (!window.confirm('Reset the password for ' + username + '? This will sign them out and force them to set a new password on next login.')) return;
  adminSetFeedback('Resetting password for ' + username + '...', 'info');
  adminSetTempPassword('', '');
  try {
    var data = await adminFetch(ADMIN_USERS_URL + '/' + encodeURIComponent(id) + '/reset-password', { method: 'POST' });
    adminSetTempPassword(username, data.temporary_password || '');
    adminSetFeedback('Password reset for ' + username + '. Share the temporary password securely.', 'success');
    adminState.loaded = false;
    await adminLoad(true);
  } catch (err) {
    adminSetFeedback(err.message || 'Unable to reset that password.', 'error');
    adminRender();
  }
}

function adminRefreshUI() {
  adminRender();
  if (!adminCanAccess() && window._dashboardCurrentPageId === 'pageAdmin' && typeof showDashboardPage === 'function') {
    showDashboardPage('pagePlayers');
  }
}

function adminBootstrap() {
  adminRefreshUI();
  if (window._dashboardCurrentPageId === 'pageAdmin') {
    adminLoad();
  }
}

function adminInit() {
  adminInitRefs();
  if (adminRefreshBtnEl && !adminRefreshBtnEl._adminBound) {
    adminRefreshBtnEl.addEventListener('click', function () {
      adminState.loaded = false;
      adminLoad(true);
    });
    adminRefreshBtnEl._adminBound = true;
  }
  adminRender();
}

document.addEventListener('DOMContentLoaded', adminInit);

window.AdminPanel = {
  bootstrap: adminBootstrap,
  load: adminLoad,
  refreshUI: adminRefreshUI,
  resetSession: adminResetSession,
};
