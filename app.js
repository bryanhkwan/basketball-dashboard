  // ---------- Auth ----------

  // ⚠️  DEV ONLY — flip to true to skip login screen during local testing
  const DEV_BYPASS_AUTH = false;

  const AUTH_KEY = 'ncaa_auth_token';
  const AUTH_USER_KEY = 'ncaa_auth_user';

  const LOGIN_URL = 'https://hidden-salad-773b.bryanhkwan.workers.dev/login';

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

  // ---------- Runtime error display ----------
  // Surface runtime errors in the UI (so you don't need DevTools)
  window.addEventListener('error', (e) => {
    const box = document.getElementById('warn');
    if(!box) return;
    box.style.display = 'block';
    box.textContent = `JS Error: ${e.message}`;
  });

  window.addEventListener('DOMContentLoaded', () => {
    const sheetEl = document.getElementById('activeSheet');
    if(sheetEl && (sheetEl.textContent||'').trim() === '—') sheetEl.textContent = 'Ready (upload workbook)';
  });

  // ---------- Notes ----------

  // Local escape helper (escapeHtml lives in a different scope)
  function _esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  const NOTES_BASE = 'https://hidden-salad-773b.bryanhkwan.workers.dev/notes';

  // localStorage-backed mock used when DEV_BYPASS_AUTH = true
  function _devNotesStore()      { try { return JSON.parse(localStorage.getItem('_devNotes') || '[]'); } catch { return []; } }
  function _devNotesWrite(arr)   { localStorage.setItem('_devNotes', JSON.stringify(arr)); }
  async function _notesFetchDev(path, opts) {
    const method = (opts?.method || 'GET').toUpperCase();
    let notes = _devNotesStore();
    if (method === 'GET') return notes;
    if (method === 'POST') {
      const body = JSON.parse(opts.body || '{}');
      const note = { id: Date.now().toString(), title: body.title || 'Untitled', content: body.content || '',
                     created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      notes.unshift(note);
      _devNotesWrite(notes);
      return note;
    }
    const id = path.replace(/^\//, '');
    if (method === 'PUT') {
      const body = JSON.parse(opts.body || '{}');
      const idx = notes.findIndex(n => n.id === id);
      if (idx !== -1) notes[idx] = { ...notes[idx], ...body, updated_at: new Date().toISOString() };
      _devNotesWrite(notes);
      return notes[idx] || null;
    }
    if (method === 'DELETE') {
      _devNotesWrite(notes.filter(n => n.id !== id));
      return null;
    }
  }

  const notesState = {
    notes: [],
    activeId: null,
    dirty: false,
    saveTimer: null,
  };

  async function notesFetch(path = '', opts = {}) {
    if (DEV_BYPASS_AUTH) return _notesFetchDev(path, opts);
    const token = authGetToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(NOTES_BASE + path, {
      credentials: 'include',
      headers,
      ...opts,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `Error ${res.status}`);
    }
    return res.json().catch(() => null);
  }

  async function notesLoad() {
    try {
      const data = await notesFetch();
      notesState.notes = Array.isArray(data) ? data : (data?.notes || []);
      if (!notesState.activeId && notesState.notes.length) {
        notesState.activeId = notesState.notes[0].id;
      }
      notesRender();
    } catch (e) {
      const list = document.getElementById('notesList');
      if (list) list.innerHTML = `<div class="notesEmpty">Failed to load notes.</div>`;
    }
  }

  async function notesCreate() {
    const newBtn = document.getElementById('notesNew');
    if (newBtn) { newBtn.disabled = true; newBtn.textContent = '…'; }
    try {
      const note = await notesFetch('', {
        method: 'POST',
        body: JSON.stringify({ title: 'Untitled', content: '' }),
      });
      if (!note || !note.id) throw new Error('Unexpected server response');
      notesState.notes.unshift(note);
      notesState.activeId = note.id;
      notesRender();
    } catch (e) {
      const list = document.getElementById('notesList');
      if (list) list.innerHTML = `<div class="notesEmpty" style="color:var(--bad)">Failed: ${e.message}</div>`;
    } finally {
      if (newBtn) { newBtn.disabled = false; newBtn.textContent = '+ New'; }
    }
  }

  async function notesSaveToServer(id, title, content, keepalive = false) {
    try {
      const updated = await notesFetch(`/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title, content }),
        keepalive,
      });
      const idx = notesState.notes.findIndex(n => n.id === id);
      if (idx !== -1) notesState.notes[idx] = { ...notesState.notes[idx], title, content, ...(updated || {}) };
      notesState.dirty = false;
      notesSetSaveStatus('saved', 'Saved');
      notesRenderList();
    } catch (e) {
      notesSetSaveStatus('', 'Save failed');
    }
  }

  async function notesDelete(id) {
    try {
      await notesFetch(`/${id}`, { method: 'DELETE' });
      notesState.notes = notesState.notes.filter(n => n.id !== id);
      if (notesState.activeId === id) {
        notesState.activeId = notesState.notes[0]?.id || null;
      }
      notesRender();
    } catch (e) {
      console.warn('Note delete failed:', e.message);
    }
  }

  function notesCurrentValues() {
    const titleEl   = document.getElementById('noteTitle');
    const contentEl = document.getElementById('noteContent');
    return titleEl && contentEl ? { title: titleEl.value, content: contentEl.value } : null;
  }

  function notesSaveImmediate(keepalive = false) {
    if (!notesState.dirty || !notesState.activeId) return;
    clearTimeout(notesState.saveTimer);
    const vals = notesCurrentValues();
    if (vals) notesSaveToServer(notesState.activeId, vals.title, vals.content, keepalive);
  }

  function notesScheduleSave() {
    notesState.dirty = true;
    notesSetSaveStatus('unsaved', 'Unsaved…');
    clearTimeout(notesState.saveTimer);
    notesState.saveTimer = setTimeout(() => {
      const vals = notesCurrentValues();
      if (vals && notesState.activeId) {
        notesSaveToServer(notesState.activeId, vals.title, vals.content);
      }
    }, 1500);
  }

  function notesSetSaveStatus(cls, text) {
    const el = document.getElementById('notesSaveStatus');
    if (!el) return;
    el.className = 'notesSaveStatus' + (cls ? ` ${cls}` : '');
    el.textContent = text;
  }

  function notesRender() {
    notesRenderList();
    notesRenderEditor();
  }

  function notesRenderList() {
    const list = document.getElementById('notesList');
    if (!list) return;
    if (!notesState.notes.length) {
      list.innerHTML = '<div class="notesEmpty">No notes yet.<br>Click <b>+ New</b> to start.</div>';
      return;
    }
    list.innerHTML = notesState.notes.map(n => `
      <div class="notesItem${n.id === notesState.activeId ? ' active' : ''}" data-id="${n.id}">
        <div class="notesItemTitle">${_esc(n.title || 'Untitled')}</div>
        <div class="notesItemDate">${notesFormatDate(n.updated_at || n.created_at)}</div>
      </div>
    `).join('');
    list.querySelectorAll('.notesItem').forEach(el => {
      el.addEventListener('click', () => notesSelectNote(el.dataset.id));
    });
  }

  function notesRenderEditor() {
    const wrap = document.getElementById('notesEditorWrap');
    if (!wrap) return;
    const note = notesState.notes.find(n => n.id === notesState.activeId);
    if (!note) {
      wrap.innerHTML = '<div class="notesPickHint">Select or create a note.</div>';
      return;
    }
    wrap.innerHTML = `
      <div class="notesEditorInner">
        <div class="notesEditorTop">
          <input id="noteTitle" class="notesTitleInput" value="${_esc(note.title || '')}" placeholder="Note title…">
        </div>
        <textarea id="noteContent" class="notesTextarea" placeholder="Start writing…">${_esc(note.content || '')}</textarea>
        <div class="notesEditorFooter">
          <button type="button" class="secondary" id="notesDeleteBtn" style="padding:4px 12px;font-size:11px;color:var(--bad);border-color:rgba(248,113,113,.25);box-shadow:none">Delete</button>
          <span id="notesSaveStatus" class="notesSaveStatus"></span>
        </div>
      </div>
    `;
    document.getElementById('noteTitle').addEventListener('input', notesScheduleSave);
    document.getElementById('noteContent').addEventListener('input', notesScheduleSave);
    document.getElementById('notesDeleteBtn').addEventListener('click', () => {
      if (confirm('Delete this note?')) notesDelete(note.id);
    });
  }

  function notesSelectNote(id) {
    notesSaveImmediate();
    notesState.activeId = id;
    notesState.dirty = false;
    notesRender();
  }

  function notesFormatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch { return ''; }
  }

  function notesInit() {
    const toggleBtn = document.getElementById('notesToggle');
    const panel     = document.getElementById('notesPanel');
    const closeBtn  = document.getElementById('notesClose');
    const newBtn    = document.getElementById('notesNew');

    toggleBtn.addEventListener('click', () => {
      if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        notesLoad();
      } else {
        notesSaveImmediate();
        panel.classList.add('hidden');
      }
    });

    closeBtn.addEventListener('click', () => {
      notesSaveImmediate();
      panel.classList.add('hidden');
    });

    newBtn.addEventListener('click', notesCreate);

    // Auto-save on tab/window close
    window.addEventListener('beforeunload', () => notesSaveImmediate(true));

    // Auto-save when tab goes to background
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) notesSaveImmediate();
    });
  }

  document.addEventListener('DOMContentLoaded', notesInit);

  // ---------- Helpers ----------

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const clamp01 = (x) => clamp(x, 0, 1);
  const fmtMoney = (n) => Number.isFinite(n) ? n.toLocaleString(undefined, {style:'currency', currency:'USD', maximumFractionDigits:0}) : '—';
  const deepClone = obj => JSON.parse(JSON.stringify(obj));
  const safeNum = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
  // Convert Google Sheets AOA (array-of-arrays) into row objects using header row.
  function aoaToObjects(aoa){
    if(!aoa || !aoa.length) return [];
    const headers = (aoa[0]||[]).map(h => String(h||'').trim());
    const rows = [];
    for(let i=1;i<aoa.length;i++){
      const obj = {};
      const row = aoa[i]||[];
      for(let j=0;j<headers.length;j++){
        const key = headers[j];
        if(!key) continue;
        obj[key] = row[j];
      }
      if(Object.keys(obj).length) rows.push(obj);
    }
    return rows;
  }

  // Unified sheet->AOA for both XLSX worksheets and Google AOA sheets
  // ALWAYS returns array-of-arrays (AOA) so callers can use consistent indexing.
  function sheetToAoa(ws){
    if(!ws) return [];
    if(ws.__aoa) return ws.__aoa;                         // Google Sheets data
    if(typeof XLSX !== 'undefined' && XLSX?.utils?.sheet_to_json){
      return XLSX.utils.sheet_to_json(ws, {header:1});    // XLSX worksheet → AOA
    }
    return [];
  }

  // Returns array of row-objects (header-keyed) for either source
  function sheetToJson(ws){
    if(!ws) return [];
    if(ws.__aoa) return aoaToObjects(ws.__aoa);
    if(typeof XLSX !== 'undefined' && XLSX?.utils?.sheet_to_json){
      return XLSX.utils.sheet_to_json(ws);                // XLSX → objects
    }
    return [];
  }

  // Percent stats are already stored as decimals (e.g., 0.38 for 38%) in the spreadsheet.
  // No conversion needed.
  function scalePct(stat, x){ return x; }


  // percentile (inclusive) like Excel PERCENTILE.INC
  function percentileInc(arr, p){
    const a = arr.filter(Number.isFinite).slice().sort((x,y)=>x-y);
    if(a.length === 0) return NaN;
    const n = a.length;
    const r = (n - 1) * p + 1;
    const k = Math.floor(r);
    const d = r - k;
    if(k <= 1) return a[0];
    if(k >= n) return a[n-1];
    return a[k-1] + d * (a[k] - a[k-1]);
  }

  // percentile rank (0..1): fraction <= x
  function percentileRank(sortedAsc, x){
    if(!sortedAsc?.length || !Number.isFinite(x)) return NaN;
    // binary search upper bound
    let lo = 0, hi = sortedAsc.length;
    while(lo < hi){
      const mid = (lo + hi) >> 1;
      if(sortedAsc[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo / sortedAsc.length;
  }

  
  function extractSpreadsheetId(url){
    if(!url) return null;
    const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : null;
  }

  
  // ---- Google Sheets defaults (edit once; used for auto-load on GitHub Pages) ----
  const DEFAULT_GS_URL = 'https://docs.google.com/spreadsheets/d/1dDphHKY2lIs1T88TKo6f3n7oUccc4dVYmMlF2Rk1mFk/edit?usp=sharing';
  const DEFAULT_GS_API_KEY = 'AIzaSyAfcKSySow-TBS1uZNHrQX4oc_uiUWwvq8';

  async function loadFromGoogleSheets(url = DEFAULT_GS_URL, apiKey = DEFAULT_GS_API_KEY){
    try{
      const sid = extractSpreadsheetId(url);
      if(!sid) { showWarn('Could not parse spreadsheet ID from the link.'); return; }
      if(!apiKey) { showWarn('Missing API key.'); return; }

      const ranges = [
        `${SHEET_MAP.MBB}!A1:ZZ`,
        `${SHEET_MAP.WBB}!A1:ZZ`,
      ];

      const qs = ranges.map(r => 'ranges=' + encodeURIComponent(r)).join('&');
      const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${sid}/values:batchGet?key=${encodeURIComponent(apiKey)}&valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS&${qs}`;

      showWarn('Loading from Google Sheets…');
      const res = await fetch(endpoint);
      const data = await res.json();

      if(!res.ok){
        const msg = data?.error?.message || ('Google Sheets API error ('+res.status+')');
        showWarn(msg);
        return;
      }
      if(!data.valueRanges || !data.valueRanges.length){
        showWarn('No data returned from Google Sheets API. Check permissions + sheet names.');
        return;
      }

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

      // No ScoringWeight sheet needed — we use built-in defaults
      resetWeightsBtn.disabled = false;
      recalcBtn.disabled = false;
      exportBtn.disabled = false;

      applyLeagueDefaults(true);
      renderWeights();
      activeFitEl.textContent = fitPresetEl.options[fitPresetEl.selectedIndex].text;
      reloadActiveSheet();
    }catch(err){
      showWarn(String(err?.message || err));
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

  // ---------- State + DOM ----------
const gsUrlInput = document.getElementById('gsUrl');
  const gsKeyInput = document.getElementById('gsKey');
  const loadGsBtn = document.getElementById('loadGs');
  const recalcBtn = document.getElementById('recalc');
  const exportBtn = document.getElementById('export');
  const resetWeightsBtn = document.getElementById('resetWeights');
  const resetValBtn = document.getElementById('resetVal');
  const searchInput = document.getElementById('search');
  const warn = document.getElementById('warn');
  const fitPresetEl = document.getElementById('fitPreset');

  const weightsBody = document.getElementById('weightsBody');
  const showSelectedOnlyEl = document.getElementById('showSelectedOnly');
  const advancedDirEl = document.getElementById('advancedDir');

  const playersHead = document.getElementById('playersHead');
  const playersBody = document.getElementById('playersBody');
  const activeSheetEl = document.getElementById('activeSheet');
  const activeFitEl = document.getElementById('activeFit');

  const wTotalLocalEl = document.getElementById('wTotalLocal');
  const wRemainingEl = document.getElementById('wRemaining');
  const wOverBoxEl = document.getElementById('wOverBox');
  const wOverEl = document.getElementById('wOver');

  // Click a stat name in the weights table to open its glossary
  weightsBody.addEventListener('click', (e)=>{
    const el = e.target.closest('.statLink');
    if(!el) return;
    const stat = el.getAttribute('data-stat') || el.dataset.stat || el.textContent;
    if(stat) openStatInfo(stat.trim());
  });


  const kpiPlayers = document.getElementById('kpiPlayers');
  const kpiStats = document.getElementById('kpiStats');
  const kpiTotalW = document.getElementById('kpiTotalW');
  const kpiAvgPerf = document.getElementById('kpiAvgPerf');
  const kpiStarPerf = document.getElementById('kpiStarPerf');

  const avgPayEl = document.getElementById('avgPay');
  const minPayEl = document.getElementById('minPay');
  const maxPayEl = document.getElementById('maxPay');
  const starValueEl = document.getElementById('starValue');
  const starPctEl = document.getElementById('starPct');
  const mpModeEl = document.getElementById('mpMode');
  const mpPctEl = document.getElementById('mpPct');

  const modalBack = document.getElementById('modalBack');
  const mClose = document.getElementById('mClose');
  const mTitle = document.getElementById('mTitle');
  const mSub = document.getElementById('mSub');
  const mScore = document.getElementById('mScore');
  const mFit = document.getElementById('mFit');
  const mVal = document.getElementById('mVal');
  const mMult = document.getElementById('mMult');
  const mMeta = document.getElementById('mMeta');
  const mBars = document.getElementById('mBars');
  const mAllStats = document.getElementById('mAllStats');
  const mTags = document.getElementById('mTags');
  // Stat glossary modal elements are queried lazily (modal is appended after the script)


  let wb = null;
  let league = 'MBB';
  let pos = 'Guards';
  let excelWeights = {Guards:[], Bigs:[]};
  let currentWeights = {Guards:[], Bigs:[]};

  let rows = [];
  let computed = [];
  var tbAllComputed = {}; // cache: {'MBB_Guards': [...], 'MBB_Bigs': [...], ...}
  let sort = { key:'ActualValuation_calc', dir:'desc' };

  // All allowable scoring metrics (from ScoringWeight column A)
  let baseStatsAll = [];

  // precomputed stat distributions for percentiles
  let statDist = {};  // {stat: {sorted:[...], invert:boolean}}
  let lastPerfAvg = NaN, lastPerfStar = NaN;

  function normalizeName(s){ return (s||'').toString().trim().toLowerCase().replace(/\s+/g,' '); }
  function findSheetLike(target){
    if(!wb) return null;
    const t = normalizeName(target);
    // exact (case-insensitive, whitespace-normalized)
    for(const name of wb.SheetNames){
      if(normalizeName(name) === t) return name;
    }
    // contains all tokens
    const tokens = t.split(' ').filter(Boolean);
    let best = null, bestScore = -1;
    for(const name of wb.SheetNames){
      const nn = normalizeName(name);
      let score = 0;
      tokens.forEach(tok => { if(nn.includes(tok)) score += 1; });
      // small bonus for prefix match
      if(nn.startsWith(tokens[0]||'')) score += 0.5;
      if(score > bestScore){
        bestScore = score; best = name;
      }
    }
    // require at least half the tokens matched
    if(bestScore >= Math.max(1, tokens.length/2)) return best;
    return null;
  }

  const SHEET_MAP = {
    MBB: 'Men Data',
    WBB: 'Women Data'
  };

  // Position bucketing: G, G-F, F-G → Guards; F, C, F-C, C-F → Bigs; blank → Guards
  function bucketPosition(posStr){
    const p = (posStr||'').toString().trim().toUpperCase();
    if(!p || p === 'G' || p === 'G-F' || p === 'F-G') return 'Guards';
    return 'Bigs'; // F, C, F-C, C-F
  }

  // Fit presets: each is weights on percentile metrics (0..1)
  const FIT_PRESETS = {
    balanced: { 'PPG':1, 'eFG%':1, '3P%':0.7, 'FT%':0.6, 'APG':0.9, 'A/TO':0.8, 'SPG':0.7, 'BPG':0.5, 'RPG':0.6, 'DRtg':0.8, 'BPM':1, 'USG%':0.4, 'WS/40':0.8 },
    shooting: { 'eFG%':1.3, '3P%':1.3, 'FT%':0.9, 'PPG':0.8, 'TS%':1.0 },
    playmaking: { 'APG':1.3, 'A/TO':1.2, 'AST%':1.0, 'PPG':0.6 },
    defense: { 'DRtg':1.3, 'SPG':1.0, 'BPG':1.0, 'STL%':0.8, 'BLK%':0.8 },
    rim: { 'BPG':1.5, 'BLK%':1.2, 'DRtg':1.0, 'RPG':0.8 },
    rebounding: { 'RPG':1.3, 'ORB/G':1.0, 'DRB/G':1.0, 'TRB%':0.9 }
  };

  function showWarn(msg){
    warn.style.display = 'block';
    warn.textContent = msg;
  }
  function clearWarn(){
    warn.style.display = 'none';
    warn.textContent = '';
  }

  function setActiveTab(el, groupSelector){
    document.querySelectorAll(groupSelector).forEach(x=>x.classList.remove('active'));
    el.classList.add('active');
  }

  // ---------- Excel parsing ----------
  function parseSheetToRows(ws){
    // sheetToJson returns an array of row-objects for both Google and XLSX sources
    const objRows = sheetToJson(ws);
    if(!objRows || !objRows.length) return [];
    // Filter out completely blank rows
    return objRows.filter(obj => {
      return Object.values(obj).some(v => v !== undefined && v !== null && v !== '');
    });
  }

  
  function isLikelyNumericColumn(key){
    const k = (key||'').toString().trim();
    if(!k) return false;
    // exclude obvious text/id columns
    const bad = new Set([
      'Player','Name','Team','School','Conference','Conf','Position','Pos','Class','Yr','Year','ID','URL','Link',
      'Rank','Score','PerfScore','PerfScore_calc','FitScore','FitScore_calc','PredictedValue','PredictedValue_calc',
      'ActualValuation','ActualValuation_calc','MinMultiplier','MinMultiplier_calc','MP_num'
    ]);
    if(k.startsWith('Norm_')) return false; // normalized helper columns from Excel shouldn't be scoring metrics here

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
      // keep columns that are mostly numeric (>=30% numeric among non-empty)
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
    // If min==max, widen slightly to avoid divide-by-zero normalization.
    if(mn === mx){
      const eps = (Math.abs(mn) || 1) * 0.01;
      mn -= eps; mx += eps;
    }
    return {min: mn, max: mx, ok:true};
  }

  function ensureWeightsCoverStats(forPos, rowArr){
    // Start with base stats from defaults, then add any numeric stats found in data
    const allowed = new Set((baseStatsAll || []).slice());
    // Non-scoring columns to exclude
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
    // Built-in defaults — no ScoringWeight sheet needed
    // Guards: multicollinearity-free stat selection emphasizing perimeter skills
    const GUARD_DEFAULTS = [
      {stat:'PPG', w:10, min:0, max:30, dir:'higher'},
      {stat:'eFG%', w:10, min:0.35, max:0.60, dir:'higher'},
      {stat:'3P%', w:8, min:0.25, max:0.42, dir:'higher'},
      {stat:'FT%', w:5, min:0.60, max:0.90, dir:'higher'},
      {stat:'APG', w:10, min:0.5, max:7, dir:'higher'},
      {stat:'A/TO', w:8, min:0.5, max:2.5, dir:'higher'},
      {stat:'SPG', w:7, min:0.3, max:2.0, dir:'higher'},
      {stat:'BPM', w:10, min:-3, max:8, dir:'higher'},
      {stat:'WS/40', w:8, min:0.05, max:0.25, dir:'higher'},
      {stat:'DRtg', w:7, min:115, max:90, dir:'lower'},
      {stat:'USG%', w:5, min:12, max:32, dir:'higher'},
      {stat:'RPG', w:5, min:1, max:7, dir:'higher'},
      {stat:'TOPG', w:7, min:3.5, max:0.5, dir:'lower'},
    ];
    // Bigs: multicollinearity-free emphasizing interior skills
    const BIG_DEFAULTS = [
      {stat:'PPG', w:10, min:0, max:25, dir:'higher'},
      {stat:'eFG%', w:10, min:0.40, max:0.65, dir:'higher'},
      {stat:'FT%', w:5, min:0.55, max:0.85, dir:'higher'},
      {stat:'BPG', w:9, min:0.2, max:2.5, dir:'higher'},
      {stat:'RPG', w:10, min:2, max:12, dir:'higher'},
      {stat:'OR%', w:7, min:3, max:15, dir:'higher'},
      {stat:'DR%', w:7, min:10, max:25, dir:'higher'},
      {stat:'DRtg', w:8, min:115, max:90, dir:'lower'},
      {stat:'BPM', w:10, min:-3, max:8, dir:'higher'},
      {stat:'WS/40', w:8, min:0.05, max:0.25, dir:'higher'},
      {stat:'A/TO', w:6, min:0.3, max:2.0, dir:'higher'},
      {stat:'USG%', w:5, min:12, max:32, dir:'higher'},
      {stat:'TOPG', w:5, min:3.5, max:0.5, dir:'lower'},
    ];

    excelWeights = {Guards: deepClone(GUARD_DEFAULTS), Bigs: deepClone(BIG_DEFAULTS)};
    currentWeights = {Guards: deepClone(GUARD_DEFAULTS), Bigs: deepClone(BIG_DEFAULTS)};
    baseStatsAll = [...new Set([...GUARD_DEFAULTS.map(x=>x.stat), ...BIG_DEFAULTS.map(x=>x.stat)])];
    return true;
  }
  // Initialize defaults immediately
  loadScoringWeight();

  
  // Default direction rules (can be overridden in UI)
  // "lower" means lower is better (percentiles + scoring invert automatically)
  
  // Short glossary for your 19 scoring metrics
  const ROLE_DESCRIPTIONS = {
  // Guards / general
  "Shooter": "Elite perimeter threat. Strong 3P% that bends the defense and creates spacing.",
  "Efficient": "Scores with high efficiency (shot quality + finishing). Converts possessions into points at an above-average rate.",
  "Scorer": "Primary offensive producer. Creates points through shot volume and/or shot creation ability.",
  "Playmaker": "Creates offense for teammates through assists, decision-making, and ball movement.",
  "Low TO": "Protects possessions and makes smart decisions with the ball. Minimizes turnovers relative to usage.",
  "Disruptor": "Creates defensive events — steals/deflections/pressure that disrupts actions and generates transition chances.",
  "Defender": "Reliable defensive contributor. Strong defensive impact indicators (e.g., DR% / on-ball pressure proxies).",
  "Impact": "Overall positive influence on winning across efficiency and impact metrics (e.g., BPM / two-way value).",
  "Role Player": "Dependable contributor who supports team structure with effort and situational strengths.",

  // Bigs / frontcourt
  "Rim Protector": "Protects the paint. Deterrs shots at the rim and blocks/contests effectively (high BPG percentile).",
  "Rebounder": "Controls the glass on defense (and sometimes overall). Ends possessions and creates second-chance chances.",
  "Anchor Defender": "Backline defensive organizer. Strong team-defense impact indicators (e.g., elite DRtg percentile).",
  "Efficient Finisher": "High-efficiency scorer around the rim (and on limited touches). Converts looks into points (high eFG% percentile).",
  "Extra Possessions": "Creates additional chances via offensive rebounding and hustle plays (high OR% percentile).",
  "Stretch Big": "Big who spaces the floor. Credible 3PT threat that pulls rim protection away from the paint.",
  "Frontcourt Role": "Role-oriented big. Provides minutes/physicality/screens/rebounding/defense without a standout single elite tag."
};

const STAT_GLOSSARY = {
    'PPG': 'Points per game. Overall scoring volume (pace/role dependent).',
    'FG%': 'Field Goal Percentage. Share of all 2PT+3PT shots made. Doesn’t account for 3PT value.',
    '3P%': 'Three-Point Percentage. Share of 3PT shots made. Indicates spacing / shooting skill.',
    'FT%': 'Free Throw Percentage. Share of free throws made. Proxy for touch/shooting.',
    'APG': 'Assists per game. Passing/playmaking volume (role dependent).',
    'TOPG': 'Turnovers per game. Ball security; lower is better.',
    'A/TO': 'Assist-to-turnover ratio. Passing efficiency & decision-making; higher is better.',
    'ORB/G': 'Offensive rebounds per game. Extra possessions created; higher is better.',
    'DRB/G': 'Defensive rebounds per game. Ends opponent possessions; higher is better.',
    'BPG': 'Blocks per game. Rim protection / deterrence; higher is better.',
    'SPG': 'Steals per game. Disruption / forcing turnovers; higher is better.',
    'eFG%': 'Effective FG%. Adjusts FG% by giving 3PT extra value: (FGM + 0.5×3PM)/FGA.',
    'OR%': 'Offensive Rebound %. Percent of available offensive rebounds a player gets while on court.',
    'DR%': 'Defensive Rebound %. Percent of available defensive rebounds a player gets while on court.',
    'WS': 'Win Shares. Estimated wins contributed (context/team dependent).',
    'Ortg': 'Offensive Rating. Points produced per 100 possessions (higher is better).',
    'DRtg': 'Defensive Rating. Points allowed per 100 possessions while on court; lower is better.',
    'BPM': 'Box Plus/Minus. Overall impact per 100 possessions vs average player (higher is better).',
    'PER': 'Player Efficiency Rating. Box-score efficiency measure (higher is better).'
  };

  function prettyDir(isLower){
    return isLower ? 'Lower is better (↓)' : 'Higher is better (↑)';
  }

const DEFAULT_DIR = {
    'TOPG':'lower', 'TOV/G':'lower',
    'DRtg':'lower', 'DRTG':'lower', 'DRTG.':'lower', 'DRTg':'lower',
    'TOV':'lower', 'TOV%':'lower', 'TO':'lower',
    'Fouls':'lower', 'PF':'lower', 'PF/G':'lower',
    'Opp PPG':'lower',
    '+/-':'higher',
    'USG%':'higher', // higher usage = more involved
  };

  function normalizeDirValue(v){
    const s = (v||'').toString().trim().toLowerCase();
    if(s.startsWith('low')) return 'lower';
    if(s.startsWith('high')) return 'higher';
    return '';
  }

  function guessDirForStat(stat){
    const key = (stat||'').toString().trim();
    if(DEFAULT_DIR[key]) return DEFAULT_DIR[key];
    // heuristic: anything ending with 'tg' (ratings) where lower is better for defense
    const k = key.toLowerCase();
    if(k.includes('drtg') || k.includes('def rtg') || k.includes('defrating')) return 'lower';
    if(k.includes('tov') || k.includes('turn')) return 'lower';
    // default
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

    // Only show scoring metrics defined in ScoringWeight (column A)
    const selectedOnly = !!showSelectedOnlyEl?.checked;
    let w = wAll.slice();
    if(selectedOnly) w = w.filter(it => (Number(it.w)||0) !== 0);

    // Keep selected metrics at the top
    w = w.slice().sort((a,b)=>{
      const aw = (Number(a.w)||0) !== 0 ? 0 : 1;
      const bw = (Number(b.w)||0) !== 0 ? 0 : 1;
      if(aw !== bw) return aw - bw;
      return a.stat.localeCompare(b.stat);
    });

    weightsBody.innerHTML = '';
    w.forEach((it) => {
      const idx = wAll.findIndex(x => x.stat === it.stat); // stable index into master list
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
        const it = currentWeights[pos][i];
                // keep list order stable (no reordering). Just update highlight + totals.
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


  // ---------- Scoring + valuation ----------
  function scoreRow(r){
    const w = currentWeights[pos] || [];
    const used = w.filter(x => (Number(x.w)||0) !== 0);
    let score = 0;

    used.forEach(rule => {
      const raw = r[rule.stat];
      if(raw === undefined || raw === null || raw === '') return;
      let x = safeNum(raw);
      if(x === null) return;

      // Percent scaling (whole-number % -> decimal) to match your Excel conventions
      x = scalePct(rule.stat, x);

      // Ensure we have a valid range
      let mn = Number(rule.min);
      let mx = Number(rule.max);

      mn = scalePct(rule.stat, mn);
      mx = scalePct(rule.stat, mx);

      if(!Number.isFinite(mn) || !Number.isFinite(mx) || mn === mx){
        return;
      }
      // Always treat range as [lo, hi]
      const lo = Math.min(mn, mx);
      const hi = Math.max(mn, mx);
      let val = (x - lo) / (hi - lo); // higher-is-better normalized

      // If lower-is-better, invert
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
    // Use union of stats in the current weights plus common ones used in fit presets
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
    let p = percentileRank(d.sorted, x); // 0..1 (higher value => higher percentile)
    if(d.invert) p = 1 - p;              // lower is better => invert
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
    // Use percentiles for tagging
    const p = (stat) => {
      const x = safeNum(r[stat]);
      if(x === null) return NaN;
      return statPercentile(stat, x);
    };

    const tags = [];
    const chk = (pv, thr) => Number.isFinite(pv) && pv >= thr;
    if(pos === 'Guards'){
      [
        [chk(p('3P%'),       0.80), 'Shooter',   'var(--accent2)'],
        [chk(p('eFG%'),      0.80), 'Efficient', 'var(--good)'],
        [chk(p('PPG'),       0.80), 'Scorer',    'var(--accent)'],
        [chk(p('APG'),       0.80), 'Playmaker', 'var(--accent2)'],
        [chk(p('A/TO'),      0.75), 'Low TO',    'var(--good)'],
        [chk(p('SPG'),       0.80), 'Disruptor', 'var(--warn)'],
        [chk(p('DR%'),       0.75), 'Defender',  'var(--warn)'],
        [chk(p('BPM'),       0.75), 'Impact',    'var(--accent)'],
      ].forEach(([test, t, c]) => { if(test) tags.push({t, c}); });
      if(!tags.length) tags.push({t:'Role Player', c:'var(--muted)'});
    } else {
      [
        [chk(p('BPG'),   0.80),                          'Rim Protector',     'var(--warn)'],
        [chk(p('DR%'),   0.80) || chk(p('DRB/G'), 0.80), 'Rebounder',         'var(--accent2)'],
        [chk(p('DRtg'),  0.75),                          'Anchor Defender',   'var(--warn)'],
        [chk(p('eFG%'),  0.80),                          'Efficient Finisher','var(--good)'],
        [chk(p('OR%'),   0.75),                          'Extra Possessions', 'var(--accent)'],
        [chk(p('3P%'),   0.75),                          'Stretch Big',       'var(--accent2)'],
      ].forEach(([test, t, c]) => { if(test) tags.push({t, c}); });
      if(!tags.length) tags.push({t:'Frontcourt Role', c:'var(--muted)'});
    }
    return tags.slice(0, 6);
  }

  // ---------- Conference multiplier ----------
  // Canonical display list (one entry per conference, in order)
  const CONF_DISPLAY_ORDER = [
    'Big 12','SEC','Big Ten','ACC','Big East',
    'American','Mountain West','Atlantic 10','WCC',
    'Missouri Valley','CUSA','MAC','Sun Belt',
    'CAA','Ivy League','Big West','Summit League',
    'Horizon League','America East','Southern',
    'ASUN','MAAC','OVC','WAC','Patriot League',
    'Big Sky','Southland','NEC','SWAC','MEAC',
    'Big South','Independent','NE10'
  ];

  const DEFAULT_CONF_VALUES = {
    'Big 12':1.08,'SEC':1.07,'Big Ten':1.07,'ACC':1.06,'Big East':1.06,
    'American':1.05,'Mountain West':1.05,'Atlantic 10':1.04,'WCC':1.04,
    'Missouri Valley':1.03,'CUSA':1.03,'MAC':1.00,'Sun Belt':1.01,
    'CAA':1.00,'Ivy League':1.00,'Big West':0.99,'Summit League':0.99,
    'Horizon League':0.99,'America East':0.98,'Southern':0.98,
    'ASUN':0.97,'MAAC':0.97,'OVC':0.96,'WAC':0.96,'Patriot League':0.96,
    'Big Sky':0.96,'Southland':0.95,'NEC':0.94,'SWAC':0.93,'MEAC':0.93,
    'Big South':0.94,'Independent':1.00,'NE10':0.90
  };

  // Alias map: maps alternate spellings → canonical name
  const CONF_ALIASES = {
    'Mountain We':'Mountain West','A-10':'Atlantic 10',
    'Missouri Vall':'Missouri Valley','MVC':'Missouri Valley',
    'C-USA':'CUSA','Conference USA':'CUSA',
    'Ivy':'Ivy League','Summit Leag':'Summit League',
    'Horizon Leag':'Horizon League','America Eas':'America East',
    'SoCon':'Southern','A-Sun':'ASUN',
    'Ohio Valley':'OVC','Patriot Leag':'Patriot League','Patriot':'Patriot League',
    'Northeast':'NEC','NE-10':'NE10','Northeast-10':'NE10'
  };

  // Live working copy (user-editable) — keyed by canonical name only
  let confMultipliers = deepClone(DEFAULT_CONF_VALUES);
  const confMultToggleEl = document.getElementById('confMultToggle');
  const confMultBodyEl = document.getElementById('confMultBody');
  const confMultTableBody = document.getElementById('confMultTableBody');
  const confMultRangeEl = document.getElementById('confMultRange');
  const confMultLeagueNote = document.getElementById('confMultLeagueNote');
  const resetConfMultBtn = document.getElementById('resetConfMult');

  function renderConfMultTable(){
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
    const vals = CONF_DISPLAY_ORDER.map(c => confMultipliers[c] ?? 1);
    const mn = Math.min(...vals), mx = Math.max(...vals);
    confMultRangeEl.textContent = `${mn.toFixed(2)} – ${mx.toFixed(2)}`;
  }

  confMultToggleEl.addEventListener('change', ()=>{
    renderConfMultTable();
    if(wb) computeAll();
  });

  resetConfMultBtn.addEventListener('click', ()=>{
    confMultipliers = deepClone(DEFAULT_CONF_VALUES);
    renderConfMultTable();
    if(wb) computeAll();
  });

  // Lookup: resolve a conference string to its canonical name, then get multiplier
  function getConfMultiplier(confStr){
    if(!confStr) return 1;
    const c = confStr.toString().trim();
    // Direct match on canonical name
    if(confMultipliers[c] !== undefined) return confMultipliers[c];
    // Check alias map
    const alias = CONF_ALIASES[c];
    if(alias && confMultipliers[alias] !== undefined) return confMultipliers[alias];
    // Case-insensitive match on canonical names
    const cl = c.toLowerCase();
    for(const name of CONF_DISPLAY_ORDER){
      if(name.toLowerCase() === cl) return confMultipliers[name] ?? 1;
    }
    // Case-insensitive alias
    for(const [ak, av] of Object.entries(CONF_ALIASES)){
      if(ak.toLowerCase() === cl) return confMultipliers[av] ?? 1;
    }
    // Partial/contains match as last resort
    for(const name of CONF_DISPLAY_ORDER){
      if(cl.includes(name.toLowerCase()) || name.toLowerCase().includes(cl)) return confMultipliers[name] ?? 1;
    }
    return 1;
  }

  // Determine if current sheet has conference data
  function sheetHasConference(){
    if(!rows || !rows.length) return false;
    return rows.some(r => {
      const c = (r['Conference'] ?? r['Conf'] ?? '').toString().trim();
      return c.length > 0;
    });
  }

  // Init render
  renderConfMultTable();

  function computeAll(){
    // Make sure weight table includes every numeric stat in the current sheet
    ensureWeightsCoverStats(pos, rows);

    if(!rows.length) { computed = []; renderPlayers(); return; }

    // Determine if conference multiplier should be applied
    const confMultOn = confMultToggleEl.checked && sheetHasConference();

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

    // Build percentile distributions and fit scores
    buildStatDistributions();
    computed = computed.map(r => ({...r, FitScore_calc: fitScoreForRow(r)}));

    // --- Boss fields (optional) + our ranking ---
    function pickActualValuation(row){
      // Try a few likely columns from the workbook (your boss's valuation)
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

    // Rank by PerfScore (desc), tie-break by FitScore (desc)
    const ranked = computed.slice().sort((a,b)=>{
      const pa = a.PerfScore_calc, pb = b.PerfScore_calc;
      const fa = a.FitScore_calc, fb = b.FitScore_calc;
      if(Number.isFinite(pa) && Number.isFinite(pb) && pa !== pb) return pb - pa;
      if(Number.isFinite(fa) && Number.isFinite(fb) && fa !== fb) return fb - fa;
      return String(a.Player||'').localeCompare(String(b.Player||''));
    });
    ranked.forEach((r,i)=>{ r.CalcRank = i + 1; });

    // KPIs
    kpiPlayers.textContent = String(computed.length);
    kpiAvgPerf.textContent = Number.isFinite(lastPerfAvg) ? lastPerfAvg.toFixed(2) : '—';
    kpiStarPerf.textContent = Number.isFinite(lastPerfStar) ? lastPerfStar.toFixed(2) : '—';

    // Cache for Team Builder (so swaps can search across all loaded pools)
    tbAllComputed[league + '_' + pos] = computed.slice();

    renderPlayers();
  }

  // ---------- Table rendering ----------
  const LIST_COLS = [
    {key:'_tb_add', label:''},
    {key:'CalcRank', label:'#'},
    {key:'Player', label:'Player'},
    {key:'Team', label:'Team'},
    {key:'Conference', label:'Conf'},
    {key:'ConfMult_calc', label:'CM'},
    {key:'MP', label:'MP'},
    {key:'Score', label:'Perf'},
    {key:'FitScore_calc', label:'Fit'},
    {key:'ActualValuation_calc', label:'Model $'},
    {key:'ActualValuation', label:'Actual $'},
    {key:'ValueDelta_calc', label:'Δ$'},
  ];

  function sortData(data){
    const k = sort.key;
    const dir = sort.dir;
    return data.slice().sort((a,b)=>{
      const av = a[k]; const bv = b[k];
      const an = Number(av); const bn = Number(bv);
      let cmp;
      if(Number.isFinite(an) && Number.isFinite(bn)) cmp = an - bn;
      else cmp = (av ?? '').toString().localeCompare((bv ?? '').toString());
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  // ---------- Pagination ----------
  const PAGE_SIZE = 200;
  let currentPage = 0;
  let filteredData = [];

  function renderPlayers(){
    const q = (searchInput.value || '').toLowerCase().trim();
    let data = computed;
    if(q){
      data = data.filter(r => {
        return ['Player','Team','Conference','Position'].some(k => (r[k] ?? '').toString().toLowerCase().includes(q));
      });
    }
    filteredData = sortData(data);
    currentPage = 0;
    playersHead.innerHTML = ''; // force header rebuild
    renderPlayersPage();
  }

  function renderPlayersPage(){
    // Header (only rebuild if empty)
    if(!playersHead.children.length){
      const frag = document.createDocumentFragment();
      LIST_COLS.forEach(c => {
        const th = document.createElement('th');
        th.textContent = c.label;
        th.addEventListener('click', ()=>{
          if(sort.key === c.key) sort.dir = (sort.dir === 'asc' ? 'desc' : 'asc');
          else { sort.key = c.key; sort.dir = (c.key === 'ActualValuation_calc' || c.key === 'Score' || c.key === 'FitScore_calc') ? 'desc' : 'asc'; }
          filteredData = sortData(filteredData);
          currentPage = 0;
          renderPlayersPage();
        });
        frag.appendChild(th);
      });
      playersHead.innerHTML = '';
      playersHead.appendChild(frag);
    }

    const start = currentPage * PAGE_SIZE;
    const pageData = filteredData.slice(start, start + PAGE_SIZE);
    const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);

    // Build rows with DocumentFragment (single DOM write)
    const frag = document.createDocumentFragment();
    pageData.forEach(r => {
      const tr = document.createElement('tr');
      LIST_COLS.forEach(c => {
        const td = document.createElement('td');
        let v = r[c.key];
        if(c.key === 'ActualValuation_calc' || c.key === 'ActualValuation' || c.key === 'ValueDelta_calc'){
          const n = safeNum(v);
          if(!Number.isFinite(n)) v = '—';
          else if(c.key === 'ValueDelta_calc') v = (n>=0?'+':'') + fmtMoney(n).replace('$','');
          else v = fmtMoney(n);
        }
        if(c.key === '_tb_add'){
          const onRoster = tbRoster.some(x => x.Player === r.Player && x.Team === r.Team);
          if(onRoster){
            td.innerHTML = `<span class="tbAddBtn on-roster" title="Already on roster">✓</span>`;
          } else {
            td.innerHTML = `<span class="tbAddBtn" title="Add to roster">＋</span>`;
            td.querySelector('.tbAddBtn').addEventListener('click', (e)=>{ e.stopPropagation(); tbAddPlayer(r); });
          }
        }else if(c.key === 'Player'){
          td.innerHTML = `<span class="link">${(v ?? '').toString()}</span>`;
          td.querySelector('.link').addEventListener('click', ()=> openProfile(r));
        }else if(c.key === 'ConfMult_calc'){
          const cm = safeNum(r.ConfMult_calc);
          if(Number.isFinite(cm) && cm !== 1){
            td.textContent = cm.toFixed(2);
            td.style.color = cm > 1 ? 'var(--good)' : 'var(--bad)';
            td.style.fontWeight = '700';
          } else {
            td.textContent = Number.isFinite(cm) ? cm.toFixed(2) : '—';
          }
        }else if(c.key === 'Score' && Number.isFinite(Number(r.Score))){
          td.textContent = Number(r.Score).toFixed(2);
        }else if(c.key === 'FitScore_calc'){
          td.textContent = Number.isFinite(r.FitScore_calc) ? r.FitScore_calc.toFixed(0) : '—';
        }else if(c.key === 'ActualValuation_calc'){
          td.textContent = fmtMoney(r.ActualValuation_calc);
        }else{
          td.textContent = (v ?? '').toString();
        }
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    });
    playersBody.innerHTML = '';
    playersBody.appendChild(frag);

    // Pagination controls
    let pag = document.getElementById('pagControls');
    if(!pag){
      pag = document.createElement('div');
      pag.id = 'pagControls';
      pag.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;flex-wrap:wrap';
      playersBody.closest('.card').insertBefore(pag, playersBody.closest('.scrollY').nextSibling);
    }
    if(totalPages <= 1){
      pag.innerHTML = `
        <span class="pill" style="font-size:11px">${filteredData.length} players</span>
        <button class="secondary" id="tbAddAllBtn" style="padding:5px 12px;font-size:10.5px;border-color:rgba(52,211,153,.3);color:var(--good)">＋ Add all ${filteredData.length} to roster</button>`;
    } else {
      pag.innerHTML = `
        <span class="pill" style="font-size:11px">Showing ${start+1}–${Math.min(start+PAGE_SIZE, filteredData.length)} of ${filteredData.length}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="secondary" id="tbAddAllBtn" style="padding:5px 10px;font-size:10.5px;border-color:rgba(52,211,153,.3);color:var(--good)">＋ Add all ${filteredData.length}</button>
          <button class="secondary" id="pagPrev" style="padding:6px 12px;font-size:11px" ${currentPage===0?'disabled':''}>← Prev</button>
          <span style="font-size:11px;color:var(--muted)">Page ${currentPage+1} / ${totalPages}</span>
          <button class="secondary" id="pagNext" style="padding:6px 12px;font-size:11px" ${currentPage>=totalPages-1?'disabled':''}>Next →</button>
        </div>`;
      document.getElementById('pagPrev')?.addEventListener('click',()=>{if(currentPage>0){currentPage--;renderPlayersPage();}});
      document.getElementById('pagNext')?.addEventListener('click',()=>{if(currentPage<totalPages-1){currentPage++;renderPlayersPage();}});
    }
    // Add All button (present in both single and multi page)
    document.getElementById('tbAddAllBtn')?.addEventListener('click',()=>{
      const maxR = Number(tbMaxRosterEl.value) || 13;
      const budget = Number(tbBudgetEl.value) || Infinity;
      const cap = Number(tbPlayerCapEl.value) || Infinity;
      let added = 0;
      filteredData.forEach(r => {
        if(tbRoster.length >= maxR) return;
        if(tbRoster.some(x => tbPlayerKey(x) === tbPlayerKey(r))) return;
        const val = safeNum(r.ActualValuation_calc) || 0;
        if(val > cap) return;
        const used = tbRoster.reduce((s,x) => s + (safeNum(x.ActualValuation_calc)||0), 0);
        if(used + val > budget) return;
        tbRoster.push(r);
        added++;
      });
      if(added > 0) tbRefresh();
    });
  }

  // Debounced search (150ms)
  let _searchTimer = null;
  function debouncedSearch(){
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(renderPlayers, 150);
  }

  // ---------- Profile modal ----------
  function barColor(p){
    if(!Number.isFinite(p)) return 'var(--muted)';
    if(p >= 0.80) return 'var(--good)';
    if(p >= 0.60) return 'var(--accent2)';
    if(p >= 0.40) return 'var(--accent)';
    return 'var(--bad)';
  }

  function openProfile(r){
    const player = (r['Player'] ?? 'Player').toString();
    const team = (r['Team'] ?? '').toString();
    const conf = (r['Conference'] ?? r['Conf'] ?? '').toString();
    const position = (r['Pos'] ?? r['Position'] ?? pos).toString();

    mTitle.textContent = player;
    mSub.textContent = [team, conf, position].filter(Boolean).join(' • ');
    document.getElementById('mLearnMore').href = 'https://www.google.com/search?q=' + encodeURIComponent(player + ' ' + team + ' basketball');
    mScore.textContent = Number.isFinite(r.Score) ? r.Score.toFixed(2) : '—';
    mFit.textContent = Number.isFinite(r.FitScore_calc) ? r.FitScore_calc.toFixed(0) : '—';
    mVal.textContent = fmtMoney(r.ActualValuation_calc);
    mMult.textContent = Number.isFinite(r.MinMultiplier_calc) ? r.MinMultiplier_calc.toFixed(2) : '—';

    // Conference multiplier row in modal
    const mConfMultRow = document.getElementById('mConfMultRow');
    const cm = safeNum(r.ConfMult_calc);
    if(Number.isFinite(cm) && cm !== 1 && confMultToggleEl.checked){
      mConfMultRow.style.display = 'block';
      document.getElementById('mConfMult').textContent = cm.toFixed(2);
      document.getElementById('mConfName').textContent = conf || '—';
    } else {
      mConfMultRow.style.display = 'none';
    }

    const bossVal = safeNum(r.ActualValuation);
    const delta = safeNum(r.ValueDelta_calc);
    const deltaPct = safeNum(r.ValueDeltaPct_calc);
    let bossLine = '';
    if(Number.isFinite(bossVal)){
      const sign = Number.isFinite(delta) ? (delta>=0?'+':'') : '';
      const pctTxt = Number.isFinite(deltaPct) ? ` (${(deltaPct*100).toFixed(1)}%)` : '';
      bossLine = `Actual valuation: <b>${fmtMoney(bossVal)}</b> • Model vs Boss: <b>${sign}${fmtMoney(delta).replace('$','')}</b>${pctTxt}`;
    }


    if(bossLine){ mMeta.innerHTML = `<div class="muted">${bossLine}</div>`; }

    // tags
    mTags.innerHTML = '';
    

    // Fill role definitions list (under valuation)
    const roleDefsEl = document.getElementById('mRoleDefs');
    if(roleDefsEl){
      const labels = [...new Set(archetypeTags(r).map(x => x.t).filter(Boolean))];
      roleDefsEl.innerHTML = labels.map(lbl => {
        const desc = ROLE_DESCRIPTIONS[lbl] || "Definition not set.";
        return `<div style="display:flex; gap:10px; align-items:flex-start">
          <span class="pill" style="flex:0 0 auto">${lbl}</span>
          <div class="hint" style="margin:0; opacity:.95">${desc}</div>
        </div>`;
      }).join('') || `<div class="hint" style="margin:0">No role tags for this player.</div>`;
    }
archetypeTags(r).forEach(tag=>{
      const div = document.createElement('div');
      div.className = 'chip';
      div.innerHTML = `<span class="dot" style="background:${tag.c}"></span>${tag.t}`;
      mTags.appendChild(div);
    });

    // key bars (show the stats from your weights with weight>0, capped)
    const usedStats = (currentWeights[pos] || []).filter(x => (Number(x.w)||0) !== 0).map(x=>x.stat);
    const fallback = ['PPG','eFG%','3P%','FT%','APG','A/TO','TOPG','SPG','BPG','DRtg','DR%','WS/40','BPM','PER'];
    const stats = Array.from(new Set([...usedStats, ...fallback])).filter(s => r[s] !== undefined).slice(0, 10);

    mBars.innerHTML = '';
    stats.forEach(stat=>{
      const x = safeNum(r[stat]);
      const pct = statPercentile(stat, x);
      const item = document.createElement('div');
      item.className = 'barItem';
      const pctLabel = Number.isFinite(pct) ? `${Math.round(pct*100)}th` : '—';
      item.innerHTML = `
        <div class="barTop"><div><b>${stat}</b> <span class="muted">${(r[stat] ?? '—')}</span></div><div>${pctLabel}</div></div>
        <div class="barTrack"><div class="barFill"></div></div>
        <div class="barMeta"><span>${getInvertForStat(stat) ? 'Lower is better' : 'Higher is better'}</span><span class="muted">${fitPresetEl.options[fitPresetEl.selectedIndex].text}</span></div>
      `;
      const fill = item.querySelector('.barFill');
      fill.style.width = Number.isFinite(pct) ? `${Math.round(pct*100)}%` : `0%`;
      fill.style.background = `linear-gradient(90deg, ${barColor(pct)}, var(--accent2))`;
      mBars.appendChild(item);
    });

    // valuation meta + star anchor explanation
    const avgPay = Number(avgPayEl.value);
    const starValue = Number(starValueEl.value);
    const starP = clamp(Number(starPctEl.value), 0.5, 0.999);
    mMeta.innerHTML = `
      <div class="muted">
        Star anchor: at PerfScore <b>${starP.toFixed(2)} percentile</b> (~<b>${Number.isFinite(lastPerfStar)?lastPerfStar.toFixed(2):'—'}</b>),
        predicted pay is pulled toward <b>${fmtMoney(starValue)}</b>, with average anchored at <b>${fmtMoney(avgPay)}</b>.
        More starValue → steeper curve (bigger top-end).
      </div>
    `;

    // All stats
    const exclude = new Set(['PerfScore_calc','PredictedValue_calc','ActualValuation_calc','MinMultiplier_calc','MP_num','FitScore_calc']);
    const all = Object.keys(r).filter(k => !exclude.has(k));
    const container = document.createElement('div');
    container.className = 'panel';
    container.style.border = 'none';
    container.style.borderRadius = '0';
    container.innerHTML = '';
    all.forEach(k => {
      const div = document.createElement('div');
      div.className = 'statRow';
      div.innerHTML = `<span class="k">${k}</span><span>${(r[k] ?? '—')}</span>`;
      container.appendChild(div);
    });
    mAllStats.innerHTML = '';
    mAllStats.appendChild(container);

    // Similar Players — find players with closest stat profile in same position
    const mSimilar = document.getElementById('mSimilar');
    if(mSimilar){
      const all = tbGetAllPlayers();
      const curPos = bucketPosition(r.Pos || r.Position);
      const samePos = all.filter(x => bucketPosition(x.Pos || x.Position) === curPos && tbPlayerKey(x) !== tbPlayerKey(r));
      // Compute euclidean distance on key percentiles
      const keyStats = curPos === 'Guards'
        ? ['PPG','eFG%','3P%','APG','A/TO','SPG','BPM','DRtg']
        : ['PPG','eFG%','BPG','RPG','DRtg','BPM','FT%','A/TO'];
      function pctVec(p){
        return keyStats.map(s => { const v = safeNum(p[s]); const pct = statPercentile(s,v); return Number.isFinite(pct)?pct:0.5; });
      }
      const curVec = pctVec(r);
      const scored = samePos.map(x => {
        const xVec = pctVec(x);
        let dist = 0;
        for(let i=0;i<curVec.length;i++) dist += (curVec[i]-xVec[i])**2;
        return {r:x, dist: Math.sqrt(dist), upgrade: (x.Score||0) > (r.Score||0)};
      }).sort((a,b) => a.dist - b.dist).slice(0, 5);

      if(scored.length){
        mSimilar.innerHTML = scored.map(s => {
          const pp = s.r;
          const arrow = s.upgrade ? '<span style="color:var(--good)">↑</span>' : '<span style="color:var(--muted)">≈</span>';
          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--line)">
            <span>${arrow} <span class="link" style="cursor:pointer" onclick="window._app.openProfile(window._app.tbGetAllPlayers().find(x=>x.Player==='${(pp.Player||'').replace(/'/g,"\\'")}')); event.stopPropagation();">${pp.Player}</span>
            <span style="color:var(--muted);font-size:10px;margin-left:4px">${pp.Team||''}</span></span>
            <span style="font-size:11px"><b>${pp.Score?pp.Score.toFixed(1):'—'}</b> perf · ${pp.ActualValuation_calc?fmtMoney(pp.ActualValuation_calc):'—'}</span>
          </div>`;
        }).join('');
      } else { mSimilar.innerHTML = '<div class="muted">No similar players found.</div>'; }
    }

    // Compare button — opens a search to pick second player
    let _currentProfilePlayer = r;
    document.getElementById('mCompareBtn').onclick = () => {
      const name2 = prompt('Enter a player name to compare with ' + player + ':');
      if(name2 && name2.trim()){
        closeProfile();
        openCompare(player, name2.trim());
      }
    };

    // Scout Notes drawer — per-player, stored in localStorage
    const _noteKey    = `scoutNote_${player}_${team}`;
    const _drawer     = document.getElementById('mNotesDrawer');
    const _notesBtn   = document.getElementById('mNotesBtn');
    const _noteTa     = document.getElementById('mScoutNotes');
    const _noteStatus = document.getElementById('mScoutNoteStatus');

    // Reset drawer state for new player
    if (_drawer)   { _drawer.style.display = 'none'; _drawer.style.flexDirection = 'column'; }
    if (_notesBtn) {
      // Remove previous listener by replacing the node clone
      const freshBtn = _notesBtn.cloneNode(true);
      _notesBtn.parentNode.replaceChild(freshBtn, _notesBtn);
      freshBtn.addEventListener('click', () => {
        const open = _drawer.style.display === 'flex';
        _drawer.style.display = open ? 'none' : 'flex';
        freshBtn.style.borderColor = open ? '' : 'rgba(255,210,0,.5)';
        freshBtn.style.color       = open ? '' : 'var(--accent)';
        if (!open) _noteTa.focus();
      });
    }
    if (_noteTa) {
      _noteTa.value = localStorage.getItem(_noteKey) || '';
      _noteStatus.textContent = '';
      clearTimeout(_noteTa._saveTimer);
      _noteTa.oninput = function () {
        _noteStatus.textContent = 'Unsaved…';
        _noteStatus.style.color = 'var(--warn)';
        clearTimeout(_noteTa._saveTimer);
        _noteTa._saveTimer = setTimeout(() => {
          localStorage.setItem(_noteKey, _noteTa.value);
          _noteStatus.textContent = 'Saved';
          _noteStatus.style.color = 'var(--good)';
        }, 1000);
      };
      _noteTa._flushNote = () => {
        clearTimeout(_noteTa._saveTimer);
        localStorage.setItem(_noteKey, _noteTa.value);
      };
    }

    modalBack.style.display = 'flex';
  }

  // Store last comparison for re-opening
  let _lastCompare = null;

  function closeProfile(){
    const ta = document.getElementById('mScoutNotes');
    if (ta?._flushNote) ta._flushNote();
    modalBack.style.display = 'none';
  }

  function openStatInfo(stat){
    const statBack = document.getElementById('statBack');
    const sClose = document.getElementById('sClose');
    const sTitle = document.getElementById('sTitle');
    const sDir = document.getElementById('sDir');
    const sDesc = document.getElementById('sDesc');
    const sMin = document.getElementById('sMin');
    const sMax = document.getElementById('sMax');
    const sDir2 = document.getElementById('sDir2');
    const sTip = document.getElementById('sTip');

    if(!statBack) { showWarn('Stat glossary modal not found in DOM.'); return; }

    const rule = (currentWeights[pos] || []).find(x => x.stat === stat);
    const isLower = getInvertForStat(stat);
    const desc = STAT_GLOSSARY[stat] || 'No description yet for this metric.';

    if(sTitle) sTitle.textContent = stat;
    if(sDir) sDir.textContent = prettyDir(isLower);
    if(sDir2) sDir2.textContent = prettyDir(isLower);
    if(sDesc) sDesc.textContent = desc;
    if(sMin) sMin.textContent = (rule && Number.isFinite(Number(rule.min))) ? Number(rule.min) : '—';
    if(sMax) sMax.textContent = (rule && Number.isFinite(Number(rule.max))) ? Number(rule.max) : '—';
    if(sTip) sTip.textContent = 'Tip: Set Min/Max to realistic bounds (or percentiles) so normalization is stable.';

    // attach close handlers once
    if(sClose && !sClose._bound){
      sClose.addEventListener('click', ()=> closeStatInfo());
      sClose._bound = true;
    }
    if(!statBack._bound){
      statBack.addEventListener('click', (e)=>{ if(e.target === statBack) closeStatInfo(); });
      statBack._bound = true;
    }

    statBack.style.display = 'flex';
  }

  function closeStatInfo(){
    const statBack = document.getElementById('statBack');
    if(statBack) statBack.style.display = 'none';
  }

  mClose.addEventListener('click', closeProfile);
  modalBack.addEventListener('click', (e)=>{ if(e.target === modalBack) closeProfile(); });
  window.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ closeProfile(); closeStatInfo(); } });

  // ---------- League/pos tabs ----------
  function switchLeague(newLeague){
    if(league === newLeague) return;
    const other = newLeague === 'MBB' ? 'WBB' : 'MBB';
    if(tbRoster.length > 0 && tbPlayerLeague(tbRoster[0]) !== newLeague){
      if(!confirm(`Your roster has ${tbRoster.length} ${other} players. Switching to ${newLeague} will clear your roster. Continue?`)) return;
      tbRoster.length = 0;
    }
    league = newLeague;
    setActiveTab(document.getElementById(`tab${newLeague}`), '.tab[data-league]');
    applyLeagueDefaults(false);
    renderConfMultTable();
    reloadActiveSheet();
  }
  document.getElementById('tabMBB').addEventListener('click', ()=> switchLeague('MBB'));
  document.getElementById('tabWBB').addEventListener('click', ()=> switchLeague('WBB'));

  function switchPos(newPos){
    pos = newPos;
    setActiveTab(document.getElementById(`tab${newPos}`), '.tab[data-pos]');
    renderWeights();
    reloadActiveSheet();
  }
  document.getElementById('tabGuards').addEventListener('click', ()=> switchPos('Guards'));
  document.getElementById('tabBigs').addEventListener('click', ()=> switchPos('Bigs'));

  fitPresetEl.addEventListener('change', ()=>{
    activeFitEl.textContent = fitPresetEl.options[fitPresetEl.selectedIndex].text;
    if(wb) { computed = computed.map(r => ({...r, FitScore_calc: fitScoreForRow(r)})); renderPlayers(); }
  });

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

  // ---------- Sheet selection ----------
  function reloadActiveSheet(){
    if(!wb) return;
    clearWarn();
    // Single sheet per league, bucket by position
    const sheetName = findSheetLike(SHEET_MAP[league]) || SHEET_MAP[league];
    activeSheetEl.textContent = league + ' ' + pos;

    const ws = wb.Sheets[sheetName];
    if(!ws){
      showWarn(`Could not find sheet "${sheetName}" in the workbook. Check sheet names.`);
      rows = []; computed = []; renderPlayers(); return;
    }
    const allRows = parseSheetToRows(ws);

    // Normalize stat names between Men/Women data
    const normalized = allRows.map(r => {
      const out = {...r};
      // Position bucketing
      out.Position = bucketPosition(r.Pos);
      // Normalize TOPG: Men has TOPG, Women has TOV/G
      if(out['TOV/G'] != null && out['TOPG'] == null) out['TOPG'] = out['TOV/G'];
      // Normalize rebounding rate stats: Men has OR%/DR%, Women has ORB%/DRB%
      if(out['ORB%'] != null && out['OR%'] == null) out['OR%'] = out['ORB%'];
      if(out['DRB%'] != null && out['DR%'] == null) out['DR%'] = out['DRB%'];
      // Ensure Conference column (Women may not have it)
      if(!out.Conference) out.Conference = '';
      // Compute 3PA/G if not present (Men Data)
      if(out['3PA/G'] == null && out['3PA'] != null && out['G'] != null && +out['G'] > 0){
        out['3PA/G'] = +(+out['3PA'] / +out['G']).toFixed(2);
      }
      // Compute 3PT Rating: combines 3P accuracy + volume (penalizes tiny sample sizes)
      // Formula: 3P% * min(1, 3PA/G / 2.0) * min(1, totalGames / 10)
      // - Requires ~2+ 3PA/G to get full credit
      // - Requires 10+ games played for full credit
      // - A player shooting 40% on 3 3PA/G gets: 0.40 * 1.0 * 1.0 = 0.40
      // - A player shooting 100% on 0.1 3PA/G gets: 1.0 * 0.05 * 1.0 = 0.05
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

    // Bucket into Guards and Bigs
    const guards = normalized.filter(r => r.Position === 'Guards');
    const bigs = normalized.filter(r => r.Position === 'Bigs');

    // Use the selected position tab
    rows = pos === 'Guards' ? guards : bigs;
    ensureWeightsCoverStats(pos, rows);
    renderWeights();
    computeAll();

    // Also compute the sibling position and cache it
    const sibPos = pos === 'Guards' ? 'Bigs' : 'Guards';
    const sibRows = pos === 'Guards' ? bigs : guards;
    if(sibRows.length){
      try{
        const savedPos = pos, savedRows = rows, savedComputed = computed;
        pos = sibPos;
        rows = sibRows;
        ensureWeightsCoverStats(pos, rows);
        computeAll(); // caches into tbAllComputed[league+'_'+sibPos]
        console.log(`Auto-cached ${league}_${sibPos}: ${tbAllComputed[league+'_'+sibPos]?.length || 0} players`);
        pos = savedPos; rows = savedRows; computed = savedComputed;
        ensureWeightsCoverStats(pos, rows);
        renderWeights();
        renderPlayers();
      }catch(e){
        console.error('Sibling computation failed:', e);
        // Restore state
        pos = pos === sibPos ? (sibPos === 'Guards' ? 'Bigs' : 'Guards') : pos;
      }
    } else {
      console.warn(`No ${sibPos} rows found for ${league}`);
    }
    console.log('tbAllComputed keys:', Object.keys(tbAllComputed), 'sizes:', Object.fromEntries(Object.entries(tbAllComputed).map(([k,v])=>[k,v.length])));
  }

  // ---------- File load ----------
  
  if(loadGsBtn){
    loadGsBtn.addEventListener('click', async ()=>{
      const key = gsKeyInput?.value?.trim() || DEFAULT_GS_API_KEY;
      await loadFromGoogleSheets(DEFAULT_GS_URL, key);
    });
  }
  // (File upload handler removed — data loads from Google Sheets only)
  // ---------- Buttons + live updates ----------
  recalcBtn.addEventListener('click', ()=>{ if(wb) computeAll(); });

  resetWeightsBtn.addEventListener('click', ()=>{
    // Reset to your Excel defaults, but keep any extra stats (with W=0) available in this sheet.
    const base = deepClone(excelWeights);
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
  exportBtn.addEventListener('click', exportCSV);

  searchInput.addEventListener('input', debouncedSearch);
  showSelectedOnlyEl.addEventListener('change', renderWeights);
  advancedDirEl.addEventListener('change', renderWeights);


  [avgPayEl,minPayEl,maxPayEl,starValueEl,starPctEl,mpModeEl,mpPctEl].forEach(el=>{
    el.addEventListener('input', ()=>{ if(wb) computeAll(); });
    el.addEventListener('change', ()=>{ if(wb) computeAll(); });
  });

  // ========== TEAM BUILDER ==========
  var tbRoster = [];
  const tbBudgetEl = document.getElementById('tbBudget');
  const tbPlayerCapEl = document.getElementById('tbPlayerCap');
  const tbMaxRosterEl = document.getElementById('tbMaxRoster');
  const tbCountEl = document.getElementById('tbCount');
  const tbMaxLabelEl = document.getElementById('tbMaxLabel');
  const tbCostEl = document.getElementById('tbCost');
  const tbRemainingEl = document.getElementById('tbRemaining');
  const tbPosNoteEl = document.getElementById('tbPosNote');
  const tbRosterBody = document.getElementById('tbRosterBody');
  const tbRosterEmpty = document.getElementById('tbRosterEmpty');
  const tbGapBars = document.getElementById('tbGapBars');
  const tbGapEmpty = document.getElementById('tbGapEmpty');
  const tbGapTags = document.getElementById('tbGapTags');
  const tbSuggestBody = document.getElementById('tbSuggestBody');
  const tbSuggestEmpty = document.getElementById('tbSuggestEmpty');
  const tbClearBtn = document.getElementById('tbClear');

  // Gap analysis stat categories
  const GAP_CATEGORIES = {
    Guards: [
      {label:'Scoring', stats:['PPG'], icon:'🏀'},
      {label:'Shooting', stats:['3P%','eFG%'], icon:'🎯'},
      {label:'Free throws', stats:['FT%'], icon:'📏'},
      {label:'Playmaking', stats:['APG','A/TO'], icon:'🎯'},
      {label:'Ball security', stats:['TOPG'], icon:'🔒'},
      {label:'Steals', stats:['SPG'], icon:'🖐️'},
      {label:'Defense', stats:['DRtg','DR%'], icon:'🛡️'},
      {label:'Impact', stats:['BPM','WS/40'], icon:'📈'},
    ],
    Bigs: [
      {label:'Scoring', stats:['PPG'], icon:'🏀'},
      {label:'Efficiency', stats:['eFG%','FG%'], icon:'🎯'},
      {label:'Free throws', stats:['FT%'], icon:'📏'},
      {label:'Rim protection', stats:['BPG'], icon:'🚫'},
      {label:'Off. rebounding', stats:['OR%'], icon:'💪'},
      {label:'Def. rebounding', stats:['DR%'], icon:'🛡️'},
      {label:'Steals', stats:['SPG'], icon:'🖐️'},
      {label:'Defense', stats:['DRtg'], icon:'🛡️'},
      {label:'Impact', stats:['BPM','WS/40'], icon:'📈'},
    ]
  };

  // Plain-English explanations for each stat category
  const GAP_EXPLANATIONS = {
    'Scoring': 'Points per game (PPG). How many points your players put up on average. A weak score here means your team may struggle to keep up on the scoreboard.',
    'Shooting': 'Three-point percentage (3P%) and effective field goal percentage (eFG%). Measures how efficiently your team shoots from the field, especially from beyond the arc. Weak shooting means missed open looks and lower offensive output.',
    'Free throws': 'Free throw percentage (FT%). How reliable your team is at the foul line. Weak free throw shooting loses you easy points, especially in close games.',
    'Playmaking': 'Assists per game (APG) and assist-to-turnover ratio (A/TO). How well your guards create scoring opportunities for teammates. Weak playmaking means too much iso ball and predictable offense.',
    'Ball security': 'Turnovers per game (TOPG — lower is better). How often your team gives the ball away. Weak ball security means your opponents get free possessions and easy fast-break points.',
    'Steals': 'Steals per game (SPG). Your team\'s ability to force turnovers and create extra possessions. More steals = more transition scoring opportunities.',
    'Defense': 'Defensive rating (DRtg — lower is better) and defensive rebound percentage (DR%). How many points your team allows per 100 possessions. Weak defense means opponents score easily against you.',
    'Impact': 'Box Plus/Minus (BPM) and Win Shares per 40 minutes (WS/40). Overall player impact — combines offense and defense into one number. Weak impact means your players aren\'t moving the needle in games.',
    'Efficiency': 'Effective field goal % (eFG%) and field goal % (FG%). How well your bigs convert their shot attempts. Weak efficiency means wasted possessions around the rim.',
    'Rim protection': 'Blocks per game (BPG). Your bigs\' ability to protect the paint and deter drives. Weak rim protection means opponents get easy layups and dunks.',
    'Off. rebounding': 'Offensive rebound percentage (OR%). How often your team grabs their own misses for second-chance points. Weak offensive rebounding means one-and-done possessions.',
    'Def. rebounding': 'Defensive rebound percentage (DR%). How well your team secures boards after opponent misses. Weak defensive rebounding gives opponents extra shots at the basket.',
  };

  function tbPlayerKey(r){ return (r.Player||'') + '||' + (r.Team||''); }

  // Determine which league a player belongs to
  function tbPlayerLeague(r){
    for(const [key, arr] of Object.entries(tbAllComputed)){
      if(arr.some(x => tbPlayerKey(x) === tbPlayerKey(r))){
        return key.startsWith('MBB') ? 'MBB' : 'WBB';
      }
    }
    return league; // fallback to current
  }

  function tbAddPlayer(r){
    const maxR = Number(tbMaxRosterEl.value) || 13;
    if(tbRoster.length >= maxR){ showWarn(`Roster full (max ${maxR}).`); return; }
    if(tbRoster.some(x => tbPlayerKey(x) === tbPlayerKey(r))) return;
    // League enforcement: cannot mix MBB and WBB
    const playerLg = tbPlayerLeague(r);
    if(tbRoster.length > 0){
      const rosterLg = tbPlayerLeague(tbRoster[0]);
      if(playerLg !== rosterLg){
        showWarn(`Cannot add ${playerLg} player to a ${rosterLg} roster. Clear roster first or switch leagues.`);
        return;
      }
    }
    if(playerLg !== league){
      showWarn(`${r.Player} is a ${playerLg} player but you're in ${league} mode. Switch to ${playerLg} first.`);
      return;
    }
    const cap = Number(tbPlayerCapEl.value) || Infinity;
    const val = safeNum(r.ActualValuation_calc) || 0;
    if(Number.isFinite(cap) && val > cap){ showWarn(`${r.Player} ($${val.toLocaleString()}) exceeds per-player cap ($${cap.toLocaleString()}).`); return; }
    const budget = Number(tbBudgetEl.value) || Infinity;
    const used = tbRoster.reduce((s,x) => s + (safeNum(x.ActualValuation_calc)||0), 0);
    if(Number.isFinite(budget) && used + val > budget){ showWarn(`Adding ${r.Player} would exceed budget.`); return; }
    tbRoster.push(r);
    clearWarn();
    tbRefresh();
  }

  function tbRemovePlayer(idx){
    tbRoster.splice(idx, 1);
    tbRefresh();
  }

  // Render a list of swap suggestion rows into rebalanceInfo.
  // toDrop: [{r, i, pct}], candidates: player pool, fallbackLabel: position name, usedKeys: Set
  function renderSwapRows(toDrop, candidates, fallbackLabel, usedKeys){
    toDrop.forEach(({r: dropPlayer, i: dropIdx, pct}) => {
      const candidate = candidates.find(c => !usedKeys.has(tbPlayerKey(c)));
      if(candidate) usedKeys.add(tbPlayerKey(candidate));
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:5px 0;flex-wrap:wrap;font-size:11.5px';
      const dropVal = safeNum(dropPlayer.ActualValuation_calc)||0;
      if(candidate){
        const cVal = safeNum(candidate.ActualValuation_calc)||0;
        row.innerHTML = `
          <span class="tbAddBtn" data-rebal-drop="${dropIdx}" data-rebal-add="${tbPlayerKey(candidate)}" style="font-size:10px;border-color:rgba(251,191,36,.4);color:var(--warn)">Swap</span>
          <b style="color:var(--bad)">${dropPlayer.Player}</b> <span class="muted">(${Math.round(pct*100)}th, ${fmtMoney(dropVal)})</span>
          <span style="color:var(--muted)">→</span>
          <b style="color:var(--good)">${candidate.Player}</b> <span class="muted">(${candidate.Position||fallbackLabel}, ${(candidate.Score||0).toFixed(1)} perf, ${fmtMoney(cVal)})</span>
        `;
      } else {
        row.innerHTML = `<b style="color:var(--bad)">${dropPlayer.Player}</b> <span class="muted">(${Math.round(pct*100)}th, ${fmtMoney(dropVal)}) — no ${fallbackLabel.toLowerCase()} candidates in budget</span>`;
      }
      rebalanceInfo.appendChild(row);
    });
  }

  function tbRefresh(){
    const maxR = Number(tbMaxRosterEl.value) || 13;
    const budget = Number(tbBudgetEl.value) || 0;
    const totalCost = tbRoster.reduce((s,x) => s + (safeNum(x.ActualValuation_calc)||0), 0);

    // League badge
    const badge = document.getElementById('tbLeagueBadge');
    if(badge){
      const rosterLg = tbRoster.length > 0 ? tbPlayerLeague(tbRoster[0]) : league;
      badge.textContent = rosterLg;
      badge.style.background = rosterLg === 'MBB' ? 'rgba(0,62,126,.4)' : 'rgba(147,51,234,.3)';
      badge.style.borderColor = rosterLg === 'MBB' ? 'rgba(0,62,126,.6)' : 'rgba(147,51,234,.5)';
    }

    tbMaxLabelEl.textContent = maxR;
    tbCountEl.textContent = tbRoster.length;
    tbCostEl.textContent = fmtMoney(totalCost);
    const rem = budget - totalCost;
    tbRemainingEl.textContent = fmtMoney(rem);
    tbRemainingEl.style.color = rem < 0 ? 'var(--bad)' : rem < budget * 0.1 ? 'var(--warn)' : 'var(--good)';

    // Position balance with targets
    let guards = 0, bigs = 0;
    tbRoster.forEach(r => {
      const pg = tbPosGroup(r);
      if(pg === 'guard') guards++;
      else bigs++;
    });

    const targetG = Number(document.getElementById('tbTargetGuards').value) || 0;
    const targetB = Number(document.getElementById('tbTargetBigs').value) || 0;
    document.getElementById('tbGuardCount').textContent = guards;
    document.getElementById('tbGuardTarget').textContent = targetG;
    document.getElementById('tbBigCount').textContent = bigs;
    document.getElementById('tbBigTarget').textContent = targetB;

    // Color the count pills
    document.getElementById('tbGuardCount').style.color = guards > targetG ? 'var(--bad)' : guards < targetG ? 'var(--warn)' : 'var(--good)';
    document.getElementById('tbBigCount').style.color = bigs > targetB ? 'var(--bad)' : bigs < targetB ? 'var(--warn)' : 'var(--good)';

    // Rebalance suggestion
    const rebalanceSection = document.getElementById('tbRebalanceSection');
    const rebalanceInfo = document.getElementById('tbRebalanceInfo');
    const excessGuards = guards - targetG;
    const excessBigs = bigs - targetB;

    if(tbRoster.length >= 2 && (excessGuards > 0 || excessBigs > 0)){
      rebalanceSection.style.display = '';
      const allPool = tbGetAllPlayers();
      const rosterKeys = new Set(tbRoster.map(tbPlayerKey));
      const cap = Number(tbPlayerCapEl.value) || Infinity;
      rebalanceInfo.innerHTML = '';

      if(excessGuards > 0 && bigs < targetB){
        const neededBigs = targetB - bigs;
        const swapCount = Math.min(excessGuards, neededBigs);
        const rosterGuards = tbRoster.map((r,i)=>({r,i,pct:tbPlayerAvgPct(r)})).filter(x=>tbPosGroup(x.r)==='guard').sort((a,b)=>a.pct-b.pct);
        const toDrop = rosterGuards.slice(0, swapCount);

        // Get a unique big candidate for each swap (don't reuse)
        const usedBigKeys = new Set();
        const allBigs = allPool.filter(c => !rosterKeys.has(tbPlayerKey(c)) && tbPosGroup(c)==='big' && (safeNum(c.ActualValuation_calc)||0) <= cap)
          .sort((a,b)=>(b.Score||0)-(a.Score||0));

        const header = document.createElement('div');
        header.style.cssText = 'margin-bottom:6px;font-size:11.5px';
        header.innerHTML = `You have <b style="color:var(--warn)">${excessGuards} extra guard${excessGuards>1?'s':''}</b> and need <b style="color:var(--warn)">${neededBigs} more big${neededBigs>1?'s':''}</b>. Click a swap to execute:`;
        rebalanceInfo.appendChild(header);

        renderSwapRows(toDrop, allBigs, 'Big', usedBigKeys);
      }

      if(excessBigs > 0 && guards < targetG){
        const neededGuards = targetG - guards;
        const swapCount = Math.min(excessBigs, neededGuards);
        const rosterBigs = tbRoster.map((r,i)=>({r,i,pct:tbPlayerAvgPct(r)})).filter(x=>tbPosGroup(x.r)!=='guard').sort((a,b)=>a.pct-b.pct);
        const toDrop = rosterBigs.slice(0, swapCount);

        const usedGrdKeys = new Set();
        const allGrds = allPool.filter(c => !rosterKeys.has(tbPlayerKey(c)) && tbPosGroup(c)==='guard' && (safeNum(c.ActualValuation_calc)||0) <= cap)
          .sort((a,b)=>(b.Score||0)-(a.Score||0));

        const header = document.createElement('div');
        header.style.cssText = 'margin-bottom:6px;margin-top:8px;font-size:11.5px';
        header.innerHTML = `You have <b style="color:var(--warn)">${excessBigs} extra big${excessBigs>1?'s':''}</b> and need <b style="color:var(--warn)">${neededGuards} more guard${neededGuards>1?'s':''}</b>. Click a swap to execute:`;
        rebalanceInfo.appendChild(header);

        renderSwapRows(toDrop, allGrds, 'Guard', usedGrdKeys);
      }

      if(excessGuards > 0 && bigs >= targetB){
        const note = document.createElement('div');
        note.style.cssText = 'margin-top:6px;font-size:11.5px';
        note.innerHTML = `You have <b style="color:var(--warn)">${excessGuards} extra guard${excessGuards>1?'s':''}</b> — consider removing your weakest guard(s) to hit target.`;
        rebalanceInfo.appendChild(note);
      }
      if(excessBigs > 0 && guards >= targetG){
        const note = document.createElement('div');
        note.style.cssText = 'margin-top:6px;font-size:11.5px';
        note.innerHTML = `You have <b style="color:var(--warn)">${excessBigs} extra big${excessBigs>1?'s':''}</b> — consider removing your weakest big(s) to hit target.`;
        rebalanceInfo.appendChild(note);
      }

      // Attach swap click handlers for rebalance
      rebalanceInfo.querySelectorAll('[data-rebal-drop]').forEach(btn => {
        btn.addEventListener('click', () => {
          const dropIdx = Number(btn.dataset.rebalDrop);
          const addKey = btn.dataset.rebalAdd;
          const replacement = tbGetAllPlayers().find(r => tbPlayerKey(r) === addKey);
          if(replacement && dropIdx >= 0 && dropIdx < tbRoster.length){
            tbRoster.splice(dropIdx, 1, replacement);
            clearWarn();
            tbRefresh();
          }
        });
      });

      tbPosNoteEl.style.display = 'none';
    } else {
      rebalanceSection.style.display = 'none';
      if(tbRoster.length >= 3){
        const ratio = guards / (tbRoster.length);
        if(ratio > 0.75){ tbPosNoteEl.style.display = ''; tbPosNoteEl.textContent = `⚠ Heavy on guards (${guards}G / ${bigs}B)`; }
        else if(ratio < 0.25){ tbPosNoteEl.style.display = ''; tbPosNoteEl.textContent = `⚠ Heavy on bigs (${guards}G / ${bigs}B)`; }
        else { tbPosNoteEl.style.display = 'none'; }
      } else { tbPosNoteEl.style.display = 'none'; }
    }

    tbRenderRoster();
    tbRenderGaps();
    tbRenderSuggestions();
    // re-render table so + buttons update to ✓
    renderPlayersPage();
  }

  const tbWeakThreshEl = document.getElementById('tbWeakThresh');
  const tbWeakThreshLabelEl = document.getElementById('tbWeakThreshLabel');
  tbWeakThreshEl.addEventListener('input', () => {
    tbWeakThreshLabelEl.textContent = tbWeakThreshEl.value + 'th';
    tbRefresh();
  });

  // Compute a player's avg percentile across gap categories (using their position)
  function tbPlayerAvgPct(r){
    const pg = tbPosGroup(r);
    const cats = pg === 'guard' ? (GAP_CATEGORIES.Guards || []) : (GAP_CATEGORIES.Bigs || []);
    let sum = 0, cnt = 0;
    cats.forEach(cat => {
      cat.stats.forEach(stat => {
        if(!statDist[stat]) return;
        const x = safeNum(r[stat]);
        if(x === null) return;
        const p = statPercentile(stat, x);
        if(Number.isFinite(p)){ sum += p; cnt++; }
      });
    });
    return cnt > 0 ? sum / cnt : 0;
  }

  // Get simplified position bucket — NEVER falls back to global pos variable
  function tbPosGroup(r){
    const p = (r.Position||r.Pos||'').toString().toLowerCase();
    if(p === 'guards' || p.includes('guard') || p === 'g' || p === 'g-f' || p === 'f-g' || p === 'pg' || p === 'sg') return 'guard';
    if(p === 'bigs' || p.includes('forward') || p.includes('center') || p === 'f' || p === 'c' || p === 'f-c' || p === 'c-f' || p === 'pf' || p === 'sf') return 'big';
    if(r._tbPosGroup) return r._tbPosGroup;
    return 'guard'; // default to guard for blanks
  }

  // Merge all cached computed pools for the CURRENT LEAGUE into one array (deduplicated)
  function tbGetAllPlayers(forLeague){
    const lg = forLeague || league;
    const seen = new Set();
    const all = [];
    for(const [key, arr] of Object.entries(tbAllComputed)){
      // Only include pools from the current league
      if(!key.startsWith(lg + '_')) continue;
      const posLabel = key.includes('Guards') ? 'guard' : 'big';
      arr.forEach(r => {
        const pk = tbPlayerKey(r);
        if(seen.has(pk)) return;
        seen.add(pk);
        if(!(r.Position||r.Pos||'').toString().trim()){
          r._tbPosGroup = posLabel;
        }
        all.push(r);
      });
    }
    return all;
  }

  function tbRenderRoster(){
    tbRosterBody.innerHTML = '';
    tbRosterEmpty.style.display = tbRoster.length ? 'none' : 'block';
    const weakestSection = document.getElementById('tbWeakestSection');
    const weakestInfo = document.getElementById('tbWeakestInfo');
    const weakCountEl = document.getElementById('tbWeakCount');

    const threshold = (Number(tbWeakThreshEl.value) || 40) / 100;

    // Score each roster player
    const rosterScored = tbRoster.map((r, i) => ({r, i, avgPct: tbPlayerAvgPct(r)}));
    const weakPlayers = rosterScored.filter(x => x.avgPct < threshold);
    const weakIdxSet = new Set(weakPlayers.map(x => x.i));

    tbRoster.forEach((r, i) => {
      const tr = document.createElement('tr');
      const isWeak = weakIdxSet.has(i);
      tr.className = 'tbRosterRow' + (isWeak ? ' tbWeakest' : '');
      const pctVal = rosterScored[i]?.avgPct ?? 0;
      const pctStr = Math.round(pctVal * 100) + 'th';
      tr.innerHTML = `
        <td style="font-size:11px;color:var(--muted)">${i+1}</td>
        <td><span class="link" style="font-size:11.5px">${r.Player||'—'}</span>${isWeak ? ' <span class="tbWeakestTag">weak</span>' : ''}</td>
        <td style="font-size:11px">${r.Team||'—'}</td>
        <td style="font-size:11px">${r.Position||r.Pos||(tbPosGroup(r)==='guard'?'Guard':'Big')}</td>
        <td style="font-size:11.5px;font-weight:700">${Number.isFinite(r.Score)?r.Score.toFixed(1):'—'} <span class="muted" style="font-size:10px;font-weight:500">(${pctStr})</span></td>
        <td style="font-size:11.5px">${fmtMoney(safeNum(r.ActualValuation_calc))}</td>
        <td><button class="tbRemoveBtn">✕</button></td>
      `;
      tr.querySelector('.link').addEventListener('click', () => openProfile(r));
      tr.querySelector('.tbRemoveBtn').addEventListener('click', () => tbRemovePlayer(i));
      tbRosterBody.appendChild(tr);
    });

    // Swap suggestions for ALL weak players
    if(weakPlayers.length > 0 && computed.length){
      weakestSection.style.display = '';
      weakCountEl.textContent = `— ${weakPlayers.length} player${weakPlayers.length>1?'s':''} below ${Math.round(threshold*100)}th`;
      weakestInfo.innerHTML = '';

      const rosterKeys = new Set(tbRoster.map(tbPlayerKey));
      const cap = Number(tbPlayerCapEl.value) || Infinity;
      const budget = Number(tbBudgetEl.value) || Infinity;
      const totalCost = tbRoster.reduce((s,x) => s + (safeNum(x.ActualValuation_calc)||0), 0);
      const allPool = tbGetAllPlayers(); // search across ALL loaded data, not just current tab

      weakPlayers.forEach(({r: weakPlayer, i: weakIdx, avgPct}) => {
        const weakVal = safeNum(weakPlayer.ActualValuation_calc) || 0;
        const weakPerf = weakPlayer.Score || 0;
        const weakPosGroup = tbPosGroup(weakPlayer);
        const remaining = budget - totalCost + weakVal; // budget freed if we drop this player

        // Find same-position candidates with higher perf
        const candidates = allPool.filter(c => {
          if(rosterKeys.has(tbPlayerKey(c))) return false;
          if(tbPosGroup(c) !== weakPosGroup) return false;
          const val = safeNum(c.ActualValuation_calc) || 0;
          if(val > cap) return false;
          if(val > remaining) return false;
          if(!Number.isFinite(c.Score) || c.Score <= weakPerf) return false;
          return true;
        });

        // Bang-for-buck: (perfGain / max($1, costIncrease))
        // Normalize: perfGain is meaningful (0-1 scale), cost in $1000s
        const scored = candidates.map(c => {
          const cVal = safeNum(c.ActualValuation_calc) || 0;
          const perfGain = (c.Score - weakPerf);
          const costDelta = cVal - weakVal; // can be negative (cheaper AND better = jackpot)
          // BFB formula: weight perf gain heavily, penalize cost increase, reward cost savings
          // Higher = better. If costDelta is negative, the denominator shrinks → score goes up
          const bfb = perfGain / Math.max(0.5, (costDelta / 10000) + 1);
          return {c, perfGain, costDelta, bfb, cVal};
        });

        scored.sort((a,b) => b.bfb - a.bfb);
        const top3 = scored.slice(0, 3);

        const card = document.createElement('div');
        card.className = 'tbSwapCard';

        let headerHtml = `<div class="swapHeader">
          <div><span style="color:var(--bad);font-weight:700">${weakPlayer.Player}</span>
            <span class="muted" style="font-size:10.5px"> · ${weakPlayer.Team||'—'} · ${weakPlayer.Position||weakPlayer.Pos||(tbPosGroup(weakPlayer)==='guard'?'Guard':'Big')} · ${Math.round(avgPct*100)}th avg · ${fmtMoney(weakVal)}</span></div>
        </div>`;

        let optsHtml = '';
        if(top3.length){
          optsHtml = '<div class="swapOpts">';
          top3.forEach(({c, perfGain, costDelta, bfb, cVal}) => {
            const bfbLevel = bfb >= 5 ? 'high' : bfb >= 2 ? 'mid' : 'low';
            const bfbLabel = bfb >= 5 ? '🔥 Great deal' : bfb >= 2 ? '👍 Solid' : '📊 Marginal';
            const costLabel = costDelta <= 0 ? `saves ${fmtMoney(Math.abs(costDelta))}` : `+${fmtMoney(costDelta)}`;
            const costColor = costDelta <= 0 ? 'var(--good)' : costDelta < 20000 ? 'var(--warn)' : 'var(--bad)';
            optsHtml += `<div class="tbSwapOpt">
              <span class="tbAddBtn" data-swap-weak="${weakIdx}" data-swap-key="${tbPlayerKey(c)}" style="font-size:10px">Swap</span>
              <b style="color:var(--good)">${c.Player}</b>
              <span class="muted">${c.Team} · ${c.Position||c.Pos||(tbPosGroup(c)==='guard'?'Guard':'Big')}</span>
              <span style="font-weight:700">${c.Score.toFixed(1)} perf</span>
              <span style="font-weight:600;font-size:10.5px;color:var(--good)">+${perfGain.toFixed(1)}</span>
              <span style="font-size:10.5px;color:${costColor}">${costLabel}</span>
              <span class="tbBfbPill ${bfbLevel}">${bfbLabel}</span>
            </div>`;
          });
          optsHtml += '</div>';
        } else {
          optsHtml = '<div class="muted" style="font-size:11px">No same-position upgrades found within budget.</div>';
        }

        card.innerHTML = headerHtml + optsHtml;

        // Attach swap click handlers
        card.querySelectorAll('[data-swap-key]').forEach(btn => {
          btn.addEventListener('click', () => {
            const wIdx = Number(btn.dataset.swapWeak);
            const key = btn.dataset.swapKey;
            const replacement = tbGetAllPlayers().find(r => tbPlayerKey(r) === key);
            if(replacement){
              tbRoster.splice(wIdx, 1, replacement);
              clearWarn();
              tbRefresh();
            }
          });
        });

        weakestInfo.appendChild(card);
      });
    } else {
      if(tbRoster.length >= 2){
        weakestSection.style.display = '';
        weakCountEl.textContent = '';
        weakestInfo.innerHTML = `<div class="muted" style="font-size:11.5px">✅ All players are above the ${Math.round(threshold*100)}th percentile threshold. Roster looks solid!</div>`;
      } else {
        weakestSection.style.display = 'none';
      }
    }
  }

  function tbRenderGaps(){
    tbGapBars.innerHTML = '';
    tbGapTags.innerHTML = '';
    if(!tbRoster.length){ tbGapEmpty.style.display = 'block'; return; }
    tbGapEmpty.style.display = 'none';

    // Pick categories based on who's on the roster
    const hasGuards = tbRoster.some(r => tbPosGroup(r) === 'guard');
    const hasBigs = tbRoster.some(r => tbPosGroup(r) !== 'guard');
    let cats = [];
    if(hasGuards && hasBigs){
      // Merge both, dedup by label
      const all = [...(GAP_CATEGORIES.Guards||[]), ...(GAP_CATEGORIES.Bigs||[])];
      const seen = new Set();
      cats = all.filter(c => { if(seen.has(c.label)) return false; seen.add(c.label); return true; });
    } else if(hasBigs){
      cats = GAP_CATEGORIES.Bigs || [];
    } else {
      cats = GAP_CATEGORIES.Guards || [];
    }
    const gaps = []; // {label, avgPct, level}

    cats.forEach(cat => {
      // Average percentile of roster players in these stats
      let sum = 0, count = 0;
      cat.stats.forEach(stat => {
        if(!statDist[stat]) return;
        tbRoster.forEach(r => {
          const x = safeNum(r[stat]);
          if(x === null) return;
          const p = statPercentile(stat, x);
          if(Number.isFinite(p)){ sum += p; count++; }
        });
      });
      const avgPct = count > 0 ? sum / count : 0.5;
      const pct100 = Math.round(avgPct * 100);
      const level = avgPct < 0.35 ? 'weak' : avgPct < 0.55 ? 'ok' : 'strong';
      const color = level === 'weak' ? 'var(--bad)' : level === 'ok' ? 'var(--warn)' : 'var(--good)';

      gaps.push({label:cat.label, avgPct, level, stats:cat.stats});

      const div = document.createElement('div');
      div.className = 'gapBar';
      div.innerHTML = `
        <div class="gapBarLabel"><span>${cat.icon} ${cat.label}</span><span style="color:${color};font-weight:700">${pct100}th</span></div>
        <div class="gapBarTrack"><div class="gapBarFill" style="width:${pct100}%;background:${color}"></div></div>
      `;
      tbGapBars.appendChild(div);
    });

    // Gap tags with click-to-explain
    gaps.forEach(g => {
      const tag = document.createElement('span');
      tag.className = `gapTag ${g.level}`;
      tag.textContent = g.level === 'weak' ? `Weak: ${g.label}` : g.level === 'ok' ? `Avg: ${g.label}` : `Strong: ${g.label}`;
      tag.title = 'Click for explanation';
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        // Remove any existing explanation tooltip
        document.querySelectorAll('.gapExplain').forEach(el => el.remove());
        const expl = GAP_EXPLANATIONS[g.label] || 'No description available.';
        const levelText = g.level === 'weak' ? 'Your team is weak here.' : g.level === 'ok' ? 'Your team is average here.' : 'Your team is strong here.';
        const tip = document.createElement('div');
        tip.className = 'gapExplain';
        tip.innerHTML = `<span class="gapExplainClose" id="gapTipClose">✕</span><b>${g.label}</b> — ${expl}<br><br><em style="color:${g.level==='weak'?'var(--bad)':g.level==='ok'?'var(--warn)':'var(--good)'}">${levelText} (${Math.round(g.avgPct*100)}th percentile)</em>`;
        document.body.appendChild(tip);
        const rect = e.target.getBoundingClientRect();
        const tipHeight = tip.offsetHeight || 140;
        const spaceBelow = window.innerHeight - rect.bottom;
        const leftPos = Math.max(8, Math.min(rect.left, window.innerWidth - 340));
        tip.style.left = leftPos + 'px';
        // Show above if not enough space below
        if(spaceBelow < tipHeight + 16){
          tip.style.top = Math.max(8, rect.top - tipHeight - 8) + 'px';
        } else {
          tip.style.top = (rect.bottom + 8) + 'px';
        }
        const closeTip = () => { tip.remove(); };
        tip.querySelector('#gapTipClose').addEventListener('click', closeTip);
        setTimeout(() => {
          const dismiss = (ev) => { if(!tip.contains(ev.target) && ev.target !== e.target){ closeTip(); document.removeEventListener('click', dismiss); }};
          document.addEventListener('click', dismiss);
        }, 50);
      });
      tbGapTags.appendChild(tag);
    });
  }

  function tbRenderSuggestions(){
    tbSuggestBody.innerHTML = '';
    const allPool = tbGetAllPlayers();
    if(!tbRoster.length || !allPool.length){ tbSuggestEmpty.style.display = 'block'; return; }
    tbSuggestEmpty.style.display = 'none';

    // Use BOTH guard and big categories to evaluate all roster players
    const allCats = [...(GAP_CATEGORIES.Guards || []), ...(GAP_CATEGORIES.Bigs || [])];
    // Deduplicate by label
    const seenLabels = new Set();
    const cats = allCats.filter(c => { if(seenLabels.has(c.label)) return false; seenLabels.add(c.label); return true; });

    const budget = Number(tbBudgetEl.value) || Infinity;
    const cap = Number(tbPlayerCapEl.value) || Infinity;
    const maxR = Number(tbMaxRosterEl.value) || 13;
    const used = tbRoster.reduce((s,x) => s + (safeNum(x.ActualValuation_calc)||0), 0);
    const remaining = budget - used;
    const rosterKeys = new Set(tbRoster.map(tbPlayerKey));

    // Find weak categories (avg pct < 0.45)
    const weakCats = [];
    cats.forEach(cat => {
      let sum = 0, count = 0;
      cat.stats.forEach(stat => {
        if(!statDist[stat]) return;
        tbRoster.forEach(r => {
          const x = safeNum(r[stat]);
          if(x === null) return;
          const p = statPercentile(stat, x);
          if(Number.isFinite(p)){ sum += p; count++; }
        });
      });
      const avgPct = count > 0 ? sum / count : 0.5;
      if(avgPct < 0.45) weakCats.push(cat);
    });

    // If no weak categories, suggest best overall fits
    const targetCats = weakCats.length > 0 ? weakCats : cats;

    // Score every non-roster player from ALL pools
    const candidates = allPool.filter(r => {
      if(rosterKeys.has(tbPlayerKey(r))) return false;
      const val = safeNum(r.ActualValuation_calc) || 0;
      if(val > cap) return false;
      if(tbRoster.length < maxR && val > remaining) return false;
      return true;
    });

    const scored = candidates.map(r => {
      let gapScore = 0, gapCount = 0;
      let bestGap = '';
      let bestGapScore = -1;
      targetCats.forEach(cat => {
        cat.stats.forEach(stat => {
          const x = safeNum(r[stat]);
          if(x === null) return;
          const p = statPercentile(stat, x);
          if(!Number.isFinite(p)) return;
          gapScore += p;
          gapCount++;
          if(p > bestGapScore){ bestGapScore = p; bestGap = cat.label; }
        });
      });
      const avg = gapCount > 0 ? gapScore / gapCount : 0;
      return {r, avg, bestGap};
    });

    scored.sort((a,b) => b.avg - a.avg);

    scored.slice(0, 30).forEach(({r, avg, bestGap}) => {
      const tr = document.createElement('tr');
      const pct = Math.round(avg * 100);
      const gapColor = avg >= 0.7 ? 'var(--good)' : avg >= 0.5 ? 'var(--warn)' : 'var(--muted)';
      const rPos = r.Position || r.Pos || (tbPosGroup(r)==='guard'?'Guard':'Big');
      tr.innerHTML = `
        <td><span class="link" style="font-size:11px">${r.Player||'—'}</span></td>
        <td style="font-size:11px">${r.Team||'—'}</td>
        <td style="font-size:11px">${rPos}</td>
        <td style="font-size:10.5px;color:${gapColor};font-weight:700">${bestGap} (${pct}th)</td>
        <td style="font-size:11px;font-weight:700">${Number.isFinite(r.Score)?r.Score.toFixed(1):'—'}</td>
        <td style="font-size:11px">${fmtMoney(safeNum(r.ActualValuation_calc))}</td>
        <td><span class="tbAddBtn" title="Add to roster">＋</span></td>
      `;
      tr.querySelector('.link').addEventListener('click', () => openProfile(r));
      tr.querySelector('.tbAddBtn').addEventListener('click', () => tbAddPlayer(r));
      tbSuggestBody.appendChild(tr);
    });
  }

  tbClearBtn.addEventListener('click', ()=>{ tbRoster = []; clearWarn(); tbRefresh(); });
  tbMaxRosterEl.addEventListener('input', ()=>{ tbMaxLabelEl.textContent = tbMaxRosterEl.value; });
  [tbBudgetEl, tbPlayerCapEl, tbMaxRosterEl, tbWeakThreshEl, document.getElementById('tbTargetGuards'), document.getElementById('tbTargetBigs')].forEach(el => {
    el.addEventListener('change', ()=> tbRefresh());
  });

  // Auto-load default Google Sheet on startup
  window.addEventListener('DOMContentLoaded', () => {
    if(gsKeyInput) gsKeyInput.value = DEFAULT_GS_API_KEY;
    setTimeout(() => loadFromGoogleSheets(DEFAULT_GS_URL, DEFAULT_GS_API_KEY), 80);
  });

  // --- Comparison modal ---
  function openCompare(name1, name2){
    const all = tbGetAllPlayers();
    const n1 = name1.toLowerCase(), n2 = name2.toLowerCase();
    const p1 = all.find(r => (r.Player||'').toLowerCase().includes(n1));
    const p2 = all.find(r => (r.Player||'').toLowerCase().includes(n2));
    if(!p1||!p2) return false;

    // Store for re-opening
    _lastCompare = {name1: p1.Player, name2: p2.Player};
    window._lastCompare = _lastCompare;
    // Show reopen button in AI chat
    const reopenBtn = document.getElementById('aiReopenCmp');
    if(reopenBtn) reopenBtn.style.display = '';

    const cmpBack = document.getElementById('compareBack');
    const cmpBody = document.getElementById('cmpBody');
    document.getElementById('cmpClose').onclick = () => { cmpBack.style.display = 'none'; };
    cmpBack.onclick = e => { if(e.target === cmpBack) cmpBack.style.display = 'none'; };

    const stats = ['PPG','eFG%','3P%','3PT_Rating','FT%','APG','A/TO','RPG','SPG','BPG','DRtg','WS/40','BPM','USG%','TOPG','PER','3PA/G'];
    const lowerBetter = new Set(['DRtg','TOPG']);

    function pct(r, stat){
      const x = safeNum(r[stat]);
      const p = statPercentile(stat, x);
      return Number.isFinite(p) ? Math.round(p * 100) : null;
    }

    function statColor(p){ return p >= 80 ? 'var(--good)' : p >= 55 ? 'var(--accent)' : p >= 35 ? 'var(--warn)' : 'var(--bad)'; }

    function renderCol(player, otherPlayer){
      const perf = player.Score != null ? player.Score.toFixed(1) : '—';
      const val = player.ActualValuation_calc != null ? fmtMoney(player.ActualValuation_calc) : '—';
      const perfColor = player.Score >= 60 ? 'var(--good)' : player.Score >= 35 ? 'var(--warn)' : 'var(--bad)';

      let rows = '';
      stats.forEach(s => {
        const v = safeNum(player[s]);
        const ov = safeNum(otherPlayer[s]);
        const p = pct(player, s);
        const op = pct(otherPlayer, s);
        if(p === null && v === null) return;
        const win = p !== null && op !== null && (lowerBetter.has(s) ? p > op : p > op);
        const color = p !== null ? statColor(p) : 'var(--muted)';
        const displayVal = v !== null ? (Math.abs(v) < 1 && v !== 0 ? Number(v).toFixed(3) : Number(v).toFixed(1)) : '—';
        rows += `<div class="cmpStatRow">
          <span class="cmpLabel">${s}</span>
          <div class="cmpTrack"><div class="cmpFill" style="width:${p||0}%;background:${color}"></div></div>
          <span class="cmpVal ${win?'win':''}">${displayVal}</span>
          <span style="font-size:10px;color:${color};width:30px">${p !== null ? p+'th' : ''}</span>
        </div>`;
      });
      return `<div class="cmpCol">
        <div class="cmpName">${player.Player||'—'}</div>
        <div class="cmpSub">${[player.Team, player.Conference, player.Position].filter(Boolean).join(' • ')}</div>
        <div class="cmpScore"><span class="big" style="color:${perfColor}">${perf}</span><span class="val">${val}</span></div>
        ${rows}
      </div>`;
    }

    // Verdict
    const s1 = p1.Score || 0, s2 = p2.Score || 0;
    const diff = Math.abs(s1 - s2).toFixed(1);
    let verdict = '';
    if(Math.abs(s1 - s2) <= 5) verdict = `Very close matchup — only ${diff} points apart. Decision comes down to team needs and fit.`;
    else if(s1 > s2) verdict = `<b>${p1.Player}</b> scores ${diff} points higher overall.`;
    else verdict = `<b>${p2.Player}</b> scores ${diff} points higher overall.`;

    // Find stat wins
    const p1wins = [], p2wins = [];
    stats.forEach(s => {
      const a = pct(p1, s), b = pct(p2, s);
      if(a !== null && b !== null){
        if(a > b + 8) p1wins.push(s);
        if(b > a + 8) p2wins.push(s);
      }
    });
    if(p1wins.length) verdict += ` ${p1.Player} leads in ${p1wins.join(', ')}.`;
    if(p2wins.length) verdict += ` ${p2.Player} leads in ${p2wins.join(', ')}.`;

    const v1 = safeNum(p1.ActualValuation_calc)||0, v2 = safeNum(p2.ActualValuation_calc)||0;
    if(v1 !== v2) verdict += ` Value gap: $${Math.abs(v1 - v2).toLocaleString()} (${v1 < v2 ? p1.Player : p2.Player} is cheaper).`;

    cmpBody.innerHTML = `<div class="cmpGrid">
      ${renderCol(p1, p2)}
      ${renderCol(p2, p1)}
      <div class="cmpVerdict"><h4>📊 Verdict</h4><p>${verdict}</p>
        <div style="margin-top:8px;display:flex;gap:8px">
          <button class="secondary" onclick="window._app.openProfile(window._app.tbGetAllPlayers().find(r=>r.Player==='${(p1.Player||'').replace(/'/g,"\\'")}'));document.getElementById('compareBack').style.display='none'"
            style="padding:6px 12px;font-size:11px">View ${(p1.Player||'').split(' ')[0]}'s Profile</button>
          <button class="secondary" onclick="window._app.openProfile(window._app.tbGetAllPlayers().find(r=>r.Player==='${(p2.Player||'').replace(/'/g,"\\'")}'));document.getElementById('compareBack').style.display='none'"
            style="padding:6px 12px;font-size:11px">View ${(p2.Player||'').split(' ')[0]}'s Profile</button>
        </div>
      </div>
    </div>`;

    cmpBack.style.display = 'flex';
    return true;
  }

  // Expose functions for AI chat integration
  window._app = {
    get tbRoster(){ return tbRoster; },
    set tbRoster(v){ tbRoster = v; },
    get computed(){ return computed; },
    get pos(){ return pos; },
    get league(){ return league; },
    get statDist(){ return statDist; },
    get currentWeights(){ return currentWeights; },
    tbAddPlayer, tbRefresh, tbGetAllPlayers, openProfile, openCompare, tbPlayerLeague,
    safeNum, fmtMoney, tbPlayerKey, tbPosGroup, tbPlayerAvgPct, statPercentile,
    barColor, getInvertForStat
  };


// ============ AI CHAT SYSTEM ============
(function(){
  const GEMINI_PROXY_URL = 'https://white-pine-7669.bryanhkwan.workers.dev';
  const GEMINI_MODEL = 'gemini-2.5-flash-lite';

  const toggle = document.getElementById('aiToggle');
  const panel = document.getElementById('aiPanel');
  const msgBox = document.getElementById('aiMessages');
  const input = document.getElementById('aiChatInput');
  const sendBtn = document.getElementById('aiSendBtn');

  let chatHistory = [];
  let pendingAction = null;
  // Stores the latest user message so deferred tool orchestration can reuse the original intent.
  let lastUserText = '';
  // Per-turn guard that tracks whether any local dashboard tool has executed before web search.
  let turnHasDashboardLookup = false;
  // Prevents repeated deferral if the model keeps trying web_search before dashboard tools.
  let turnWebSearchDeferred = false;
  // Tracks whether any web_search has executed in the current user turn.
  let turnHasWebSearch = false;
  // One-shot latch for forced post-dashboard web lookup on valuation/judgment prompts.
  let turnForcedWebForValuation = false;

  toggle.addEventListener('click', () => { panel.classList.toggle('hidden'); if(!panel.classList.contains('hidden')) input.focus(); });
  document.getElementById('aiClose').addEventListener('click', () => panel.classList.add('hidden'));
  document.getElementById('aiClearChat').addEventListener('click', () => {
    // Also reset dashboard-first orchestration state to avoid stale guard behavior.
    chatHistory = []; pendingAction = null; msgBox.innerHTML = '';
    lastUserText = '';
    turnHasDashboardLookup = false;
    turnWebSearchDeferred = false;
    turnHasWebSearch = false;
    turnForcedWebForValuation = false;
    addMsg('ai', "Chat cleared! 👋 What do you need, coach?");
  });
  input.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); }});
  sendBtn.addEventListener('click', send);
  document.querySelectorAll('.aiQuickBtn').forEach(b => b.addEventListener('click', () => {
    if(b.id === 'aiReopenCmp'){
      const a = app();
      if(a.openCompare && window._lastCompare) a.openCompare(window._lastCompare.name1, window._lastCompare.name2);
      return;
    }
    input.value = b.dataset.q; send();
  }));

  // ---- Helpers ----
  function addMsg(role, html){
    const d = document.createElement('div');
    d.className = 'aiMsg ' + role;
    d.innerHTML = html;
    msgBox.appendChild(d);
    msgBox.scrollTop = msgBox.scrollHeight;
    return d;
  }
  function showTyping(){
    const d = document.createElement('div'); d.className='aiTyping'; d.id='aiTypingIndicator';
    d.innerHTML='<span></span><span></span><span></span>'; msgBox.appendChild(d); msgBox.scrollTop=msgBox.scrollHeight;
  }
  function hideTyping(){ document.getElementById('aiTypingIndicator')?.remove(); }
  function fmt(v){ return v!=null ? (typeof v==='number' ? (Math.abs(v)<1&&v!==0 ? v.toFixed(3) : v.toFixed(1)) : v) : '—'; }

  // Injects a synthetic function call/response pair into chatHistory.
  // This is used to seed Gemini with dashboard context before allowing web_search.
  function pushFnResult(name, args, result){
    const call = { name, args: args || {} };
    const modelMsg = { role:'model', parts:[{ functionCall: call }] };
    chatHistory.push(modelMsg);
    chatHistory.push({ role:'user', parts:[{ functionResponse:{ name, response:{ result } } }] });
  }

  // Returns true for prompts where web search is required before a final answer.
  // Covers valuation/contract decisions AND any query needing current live context.
  function needsMandatoryWebReview(text){
    const t = (text || '').toLowerCase();
    if(!t) return false;

    // Queries that are player search/filter requests should go through the normal
    // Gemini tool path (get_top_players etc.) — NOT the comparison pipeline.
    // Dollar amounts in these are budget filters, not valuation judgments.
    // e.g. "find a shooter big under $100k" → get_top_players, not compare pipeline.
    const isSearchRequest = /\b(find|search|show|list|get|recommend|suggest)\b/.test(t);

    // Valuation / contract judgment questions (only when NOT a search/filter request)
    if(!isSearchRequest && /(\$[\d,.k]+|worth|valuat|invest|overpay|underpay|fair|steal|avoid|buy|sign|price|priced|pay)/.test(t)) return true;
    // Current status / news queries always need web context (even if phrased as a search)
    if(/(latest|recent|today|yesterday|this week|last week|news|injur|hurt|suspend|transfer|portal|available|availability|out for|return(ing)?|rumor|report|update|status|commit|nil\b|coaching|coach\b|minutes|role|lineup|start(er|ing)?)/.test(t)) return true;
    return false;
  }

  // Build a focused web query tailored to the question type (valuation vs. current-info).
  function buildForcedWebQuery(text){
    const raw = (text || '').trim();
    const ql = normalizeName(raw);
    const isValuation = /(\$[\d,.]+|worth|value|valuat|invest|overpay|underpay|fair|steal|avoid|buy|sign|price|priced|pay)/.test(ql);
    const matchedPlayer = matchLoadedPlayer(raw);
    if(matchedPlayer){
      // Include team name so web search targets the correct player when names are shared.
      const nameAndTeam = matchedPlayer.Team ? `${matchedPlayer.Player} ${matchedPlayer.Team}` : matchedPlayer.Player;
      if(isValuation) return `${nameAndTeam} college basketball NIL salary contract value 2025`;
      return `${nameAndTeam} college basketball latest news injury transfer portal role minutes 2025`;
    }
    if(isValuation) return `${raw} college basketball NIL value market 2025`;
    return `${raw} college basketball latest news 2025`;
  }

  function escapeHtml(s){
    return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function fmtMoney(n){
    if(n==null || !Number.isFinite(+n)) return '—';
    return '$' + Math.round(+n).toLocaleString();
  }

  // Normalize a name for fuzzy matching: strip punctuation and common suffixes so
  // "Leroy Blyden Jr." matches "Leroy Blyden Jr" and vice versa.
  function normalizeName(s){
    return (s||'').toLowerCase().replace(/[.,]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/\s+/g,' ').trim();
  }

  // Extract a team name from phrases like "from Fairfield", "at Toledo", "(San Diego)".
  // Returns the matching team string from the loaded player pool, or null.
  function extractTeamHint(text, pool){
    const t = (text || '').trim();
    const patterns = [
      /\b(?:from|at|of|for)\s+([A-Za-z][A-Za-z\s\-']{1,40}?)(?=\s+(?:worth|is|was|will|can|should|playing|plays|player|basketball|\$|\d)|[,.]|$)/i,
      /\(([A-Za-z][A-Za-z\s\-']{1,40}?)\)/i,
    ];
    const candidates = [];
    for(const pat of patterns){ const m = t.match(pat); if(m) candidates.push(m[1].trim()); }
    if(!candidates.length) return null;
    const teams = [...new Set((pool||allPlayers()).map(r=>r.Team).filter(Boolean))];
    for(const hint of candidates){
      const hl = hint.toLowerCase();
      const best = teams.find(tm => tm.toLowerCase().includes(hl));
      if(best) return best;
    }
    return null;
  }

  // Team-aware player row lookup. Returns the full player object (not just name) so callers
  // can pass team to getPlayerProfile and build more accurate web queries.
  // When the query contains "from X" / "at X" and multiple players share a name, picks the
  // one whose team matches the hint.
  function matchLoadedPlayer(text){
    const all = allPlayers();
    const ql = normalizeName(text);
    const teamHint = extractTeamHint(text, all);
    // All players whose name appears inside the normalized query string
    const matches = all.filter(r => r.Player && ql.includes(normalizeName(r.Player)));
    if(!matches.length) return null;
    // With a team hint, prefer the player whose team matches
    if(teamHint && matches.length > 1){
      const specific = matches.find(r => (r.Team||'').toLowerCase().includes(teamHint.toLowerCase()));
      if(specific) return specific;
    }
    // Fall back to the player with the longest name (most specific match)
    return matches.sort((a,b)=>(b.Player||'').length-(a.Player||'').length)[0];
  }

  function matchLoadedPlayerName(text){
    const p = matchLoadedPlayer(text);
    return p ? (p.Player || null) : null;
  }

  function renderDashboardEvidence(playerName, profile, matches){
    if(profile){
      const s = statLine(profile);
      const lines = [
        `<b>Dashboard data</b>`,
        `${escapeHtml(s.player||playerName||'Player')} (${escapeHtml(s.team||'')}${s.conf?`, ${escapeHtml(s.conf)}`:''})`,
        `PerfScore: <b>${escapeHtml(s.perf ?? '—')}</b> | Model value: <b>${escapeHtml(fmtMoney(s.value))}</b> | Pos: ${escapeHtml(s.pos||'')}${s.cls?` | Class: ${escapeHtml(s.cls)}`:''}`,
        `PPG: ${escapeHtml(s.ppg ?? '—')} | APG: ${escapeHtml(s.apg ?? '—')} | RPG: ${escapeHtml(s.rpg ?? '—')} | BPG: ${escapeHtml(s.bpg ?? '—')} | DRtg: ${escapeHtml(s.drtg ?? '—')}`,
      ];
      addMsg('system', lines.join('<br>'));
      return;
    }
    const list = Array.isArray(matches) ? matches.slice(0,6) : [];
    const header = `<b>Dashboard matches</b> (top ${list.length})`;
    const rows = list.map(r => `${escapeHtml(r.player||'')} (${escapeHtml(r.team||'')}) | Perf: ${escapeHtml(r.perf ?? '—')} | Val: ${escapeHtml(fmtMoney(r.value))}`);
    addMsg('system', [header].concat(rows.length ? rows : ['No matching players found in loaded data.']).join('<br>'));
  }

  function renderWebEvidence(webResult){
    const blob = (webResult && webResult.searchResults) ? String(webResult.searchResults) : '';
    let summary = blob;
    let sources = [];
    const parts = blob.split('\n\nSources:\n');
    if(parts.length > 1){
      summary = parts[0];
      sources = parts[1].split('\n').filter(Boolean).slice(0,3);
    }
    const out = [];
    out.push('<b>Web context</b>');
    out.push(escapeHtml(summary).slice(0,800).replace(/\n/g,'<br>'));
    if(sources.length){
      out.push('<br><b>Top sources</b><br>' + sources.map(s => escapeHtml(s)).join('<br>'));
    }
    addMsg('system', out.join('<br>'));
  }

  // Deterministic dual-source pipeline:
  // 1) Print dashboard evidence (if players loaded), 2) print web evidence, 3) ask Gemini to combine.
  // Runs for valuation/contract queries AND current-status/news queries.
  async function runValuationComparePipeline(userText){
    const text = (userText || '').trim();
    if(!text) return false;
    if(!needsMandatoryWebReview(text)) return false;

    const isValuation = /(\$[\d,.]+|worth|value|valuat|invest|overpay|underpay|fair|steal|avoid|buy|sign|price|priced|pay)/.test(text.toLowerCase());
    const hasPool = allPlayers().length > 0;

    // IMPORTANT: push the user message FIRST so chatHistory starts with a user turn.
    // Format instructions are embedded here so Gemini sees them at turn-start.
    // Calling callGemini(finalPrompt) at the end would append a second consecutive
    // user turn after the functionResponse entries, which Gemini rejects.
    const formatInstructions = isValuation
      ? `\n\nAfter reviewing the tool results, respond with this exact structure:\nDashboard evidence:\n- (1-3 bullets, cite PerfScore + model value)\nWeb evidence:\n- (1-3 bullets, include concrete dates if present)\nComparison:\n- (1-3 bullets explaining how web context changes confidence/upside/risk)\nVerdict: steal | fair | overpay | avoid (pick one)`
      : `\n\nAfter reviewing the tool results, respond with this exact structure:\nDashboard data:\n- (1-3 bullets from our loaded stats, or "No dashboard data loaded" if none available)\nWeb context:\n- (1-3 bullets with concrete dates from search results)\nSummary:\n- (direct answer combining both sources)`;
    chatHistory.push({role:'user', parts:[{text: text + formatInstructions}]});

    // Dashboard pass: inject context and show evidence when players are loaded.
    if(hasPool){
      const ctx = getDashboardContext();
      pushFnResult('get_dashboard_context', {}, ctx);
      turnHasDashboardLookup = true;

      const matchedPlayerObj = matchLoadedPlayer(text);
      const matched = matchedPlayerObj?.Player || null;
      let profile = null;
      if(matched){
        profile = getPlayerProfile(matched, matchedPlayerObj?.Team);
        pushFnResult('get_player_profile', {playerName: matched}, profile);
        renderDashboardEvidence(matched, profile, null);
      } else {
        // Pass only the player-name portion (if guessable) or omit player search
        // entirely. Passing the full sentence to searchPlayers always returns 0
        // because searchPlayers checks player.name.includes(fullSentence).
        const words = text.replace(/[^a-z\s]/gi,'').split(/\s+/).filter(w=>w.length>3);
        const shortQuery = words.slice(0,4).join(' ');
        const matches = shortQuery ? searchPlayers(shortQuery) : [];
        pushFnResult('search_players', {query: shortQuery||text}, matches);
        renderDashboardEvidence(null, null, matches);
      }
    }

    // Web pass is always required.
    const q = buildForcedWebQuery(text);
    addMsg('system', 'Searching the web...');
    const webResult = await doWebSearch(q);
    pushFnResult('web_search', {query: q}, webResult);
    turnHasWebSearch = true;
    renderWebEvidence(webResult);

    // chatHistory now ends with user:functionResponse(web_search).
    // Call Gemini with null so NO additional user turn is appended — the format
    // instructions were already embedded in the first user message above.
    const d = await callGemini(null);
    await processResp(d);
    return true;
  }

  // ---- App bridge ----
  const app = () => window._app || {};
  function allPlayers(){ const a=app(); return a.tbGetAllPlayers ? a.tbGetAllPlayers() : (a.computed||[]); }
  function statLine(r){
    return { player:r.Player, team:r.Team, pos:r.Position||r.Pos||'', conf:r.Conference||'',
      cls:r.Class||'', mpg:r.MPG!=null?+Number(r.MPG).toFixed(1):null,
      perf:r.Score?+r.Score.toFixed(1):null, value:r.ActualValuation_calc?Math.round(r.ActualValuation_calc):null,
      ppg:r.PPG!=null?+Number(r.PPG).toFixed(1):null, apg:r.APG!=null?+Number(r.APG).toFixed(1):null,
      rpg:r.RPG!=null?+Number(r.RPG).toFixed(1):null, spg:r.SPG!=null?+Number(r.SPG).toFixed(1):null,
      bpg:r.BPG!=null?+Number(r.BPG).toFixed(1):null, bpm:r.BPM!=null?+Number(r.BPM).toFixed(1):null,
      threePct:r['3P%']!=null?+Number(r['3P%']).toFixed(3):null, ftPct:r['FT%']!=null?+Number(r['FT%']).toFixed(3):null,
      efg:r['eFG%']!=null?+Number(r['eFG%']).toFixed(3):null, drtg:r.DRtg!=null?+Number(r.DRtg).toFixed(1):null,
      threePA:r['3PA']!=null?+Number(r['3PA']):null, threePAG:r['3PA/G']!=null?+Number(r['3PA/G']).toFixed(1):null,
      usg:r['USG%']!=null?+Number(r['USG%']).toFixed(1):null, per:r.PER!=null?+Number(r.PER).toFixed(1):null,
      ws40:r['WS/40']!=null?+Number(r['WS/40']).toFixed(3):null,
      threeRating:r['3PT_Rating']!=null?+Number(r['3PT_Rating']).toFixed(3):null,
    };
  }

  // ---- Tool implementations ----
  function getDashboardContext(){
    const a=app(), roster=a.tbRoster||[];
    return { league:a.league||'MBB', position:a.pos||'Guards', totalPlayers:allPlayers().length,
      rosterSize:roster.length, roster:roster.map(r=>({player:r.Player,team:r.Team,pos:r.Position||'',
      perf:r.Score?r.Score.toFixed(1):'—',value:r.ActualValuation_calc?'$'+Math.round(r.ActualValuation_calc).toLocaleString():'—'})),
      budget:document.getElementById('tbBudget')?.value||'500000',
      playerCap:document.getElementById('tbPlayerCap')?.value||'150000',
      maxRoster:document.getElementById('tbMaxRoster')?.value||'13',
      targetGuards:document.getElementById('tbTargetGuards')?.value||'8',
      targetBigs:document.getElementById('tbTargetBigs')?.value||'5' };
  }

  function searchPlayers(q){
    // Must use allPlayers() (tbGetAllPlayers) so both Guards and Bigs pools are searched.
    // app().computed is only the currently-visible tab's dataset and misses the other position group.
    const pool=allPlayers(); if(!pool.length)return [];
    const lq=q.toLowerCase();
    return pool.filter(r=>['Player','Team','Conference','Position'].some(k=>(r[k]||'').toString().toLowerCase().includes(lq))).slice(0,20).map(statLine);
  }

  function getPlayerProfile(name, team){
    const all=allPlayers(), pn=name.toLowerCase();
    let m;
    // When a team is provided, prefer the player whose team also matches (disambiguates same-name players).
    if(team){ const tl=team.toLowerCase(); m=all.find(r=>(r.Player||'').toLowerCase().includes(pn)&&(r.Team||'').toLowerCase().includes(tl)); }
    m = m || all.find(r=>(r.Player||'').toLowerCase().includes(pn));
    if(!m) return null;
    const out={}; for(const[k,v]of Object.entries(m)){ if(v!=null&&v!==''&&!k.startsWith('_')) out[k]=typeof v==='number'?+v.toFixed(3):v; }
    return out;
  }

  function getTopPlayers(f){
    let pool=allPlayers().slice();
    const totalBefore = pool.length;
    if(f.position){ const fp=f.position.toLowerCase();
      pool=pool.filter(r=>{
        const pos=(r.Position||'').toString().toLowerCase();
        const rawPos=(r.Pos||'').toString().toLowerCase();
        if(fp==='guard'||fp==='guards') return pos==='guards'||pos.includes('guard')||rawPos==='g'||rawPos==='g-f'||rawPos==='f-g'||rawPos==='pg'||rawPos==='sg';
        if(fp==='big'||fp==='bigs'||fp==='forward'||fp==='center') return pos==='bigs'||pos.includes('forward')||pos.includes('center')||rawPos==='f'||rawPos==='c'||rawPos==='f-c'||rawPos==='c-f'||rawPos==='pf'||rawPos==='sf';
        return pos.includes(fp)||rawPos.includes(fp);
      }); }
    const afterPosFilter = pool.length;
    if(f.maxValue) pool=pool.filter(r=>(r.ActualValuation_calc||Infinity)<=+f.maxValue);
    if(f.minPerf) pool=pool.filter(r=>(r.Score||0)>=+f.minPerf);
    if(f.team){ const t=f.team.toLowerCase(); pool=pool.filter(r=>(r.Team||'').toLowerCase().includes(t)); }
    if(f.conference){ const c=f.conference.toLowerCase(); pool=pool.filter(r=>(r.Conference||'').toLowerCase().includes(c)); }
    if(f.sortBy) pool.sort((a,b)=>(+(b[f.sortBy])||0)-(+(a[f.sortBy])||0)); else pool.sort((a,b)=>(b.Score||0)-(a.Score||0));
    const results = pool.slice(0,f.limit||10).map(statLine);
    return {
      results,
      totalPool: totalBefore,
      afterPositionFilter: afterPosFilter,
      finalCount: pool.length,
      note: afterPosFilter === 0 && f.position ? `No ${f.position} players found in ${app().league || 'current league'} (pool had ${totalBefore} total). Both Guards and Bigs data should be auto-loaded.` : null
    };
  }

  function addPlayersToRoster(names, team, conference, limit){
    const a=app(); if(!a.tbRoster) return {error:'Team builder not loaded.'};
    const all=allPlayers();
    const safeNum = a.safeNum || (v => isNaN(+v) ? 0 : +v);

    // 1. Resolve candidates. When team/conference is provided, pull from the pool directly
    //    instead of requiring an explicit name list. This lets Gemini call
    //    add_players_to_roster({team:"Toledo"}) in one turn rather than doing
    //    get_top_players first (which can cause empty-response failures on large result sets).
    const toAdd=[], notFound=[];
    if(team || conference){
      let pool = all.filter(r=>{
        if(team && !(r.Team||'').toLowerCase().includes(team.toLowerCase())) return false;
        if(conference && !(r.Conference||'').toLowerCase().includes(conference.toLowerCase())) return false;
        return true;
      });
      if(limit) pool = pool.slice(0, limit);
      pool.forEach(r => toAdd.push(r));
      if(!toAdd.length) return {added:0, failed:[`No players found for team="${team||''}" conference="${conference||''}"`], rosterSize:a.tbRoster.length, adjustments:{}};
    } else {
      // Name-based lookup (original path)
      (names||[]).forEach(n=>{
        const m=all.find(r=>(r.Player||'').toLowerCase().includes(n.toLowerCase()));
        if(m) toAdd.push(m); else notFound.push(n);
      });
      if(!toAdd.length) return {added:0, failed:notFound, rosterSize:a.tbRoster.length, adjustments:{}};
    }

    // 2. Drop duplicates and league-violating players (the only constraints we keep).
    const keyFn = a.tbPlayerKey || (r=>(r.Player||'')+'|'+(r.Team||''));
    const leagueFn = a.tbPlayerLeague || (()=>'MBB');
    const rosterKeys = new Set(a.tbRoster.map(keyFn));
    const rosterLeague = a.tbRoster.length > 0 ? leagueFn(a.tbRoster[0]) : null;
    const valid=[], skipped=[];
    toAdd.forEach(r=>{
      if(rosterKeys.has(keyFn(r))){ skipped.push(r.Player||'?'); return; }
      if(rosterLeague && leagueFn(r) !== rosterLeague){ skipped.push(r.Player||'?'); return; }
      valid.push(r);
    });

    // 3. Auto-expand all three constraints to fit every valid player.
    //    We update the DOM inputs (which tbAddPlayer/tbRefresh read) so the UI
    //    reflects the new settings after the action completes.
    const adjustments={};
    const maxREl=document.getElementById('tbMaxRoster');
    const capEl=document.getElementById('tbPlayerCap');
    const budgetEl=document.getElementById('tbBudget');

    // Roster size
    const neededRoster = a.tbRoster.length + valid.length;
    const currentMax = Number(maxREl?.value) || 13;
    if(neededRoster > currentMax && maxREl){
      maxREl.value = neededRoster;
      adjustments.maxRoster = {from:currentMax, to:neededRoster};
    }

    // Per-player cap — raise to fit the single most expensive player being added
    const currentCap = Number(capEl?.value) || Infinity;
    const maxVal = Math.max(0, ...valid.map(r=>safeNum(r.ActualValuation_calc)||0));
    if(Number.isFinite(currentCap) && maxVal > currentCap && capEl){
      const newCap = Math.ceil(maxVal/1000)*1000;
      capEl.value = newCap;
      adjustments.playerCap = {from:currentCap, to:newCap};
    }

    // Total budget — raise to cover existing roster cost + all new players
    const currentBudget = Number(budgetEl?.value) || Infinity;
    const usedCost = a.tbRoster.reduce((s,x)=>s+(safeNum(x.ActualValuation_calc)||0), 0);
    const addCost  = valid.reduce((s,r)=>s+(safeNum(r.ActualValuation_calc)||0), 0);
    if(Number.isFinite(currentBudget) && usedCost+addCost > currentBudget && budgetEl){
      const newBudget = Math.ceil((usedCost+addCost)/1000)*1000;
      budgetEl.value = newBudget;
      adjustments.budget = {from:currentBudget, to:newBudget};
    }

    // 4. Push directly to tbRoster — bypasses tbAddPlayer so constraints
    //    cannot block players that were just approved and accommodated above.
    valid.forEach(r => a.tbRoster.push(r));
    if(a.tbRefresh) a.tbRefresh();

    const failed=[...notFound, ...skipped];
    return {added:valid.length, failed, rosterSize:a.tbRoster.length, adjustments};
  }

  function removeFromRoster(name){
    const a=app(); if(!a.tbRoster) return {error:'Team builder not loaded.'};
    const idx=a.tbRoster.findIndex(r=>(r.Player||'').toLowerCase().includes(name.toLowerCase()));
    if(idx===-1) return {success:false,message:name+' not on roster.'};
    const removed=a.tbRoster[idx].Player; a.tbRoster.splice(idx,1);
    if(a.tbRefresh) a.tbRefresh();
    return {success:true,removed,rosterSize:a.tbRoster.length};
  }

  function swapPlayer(drop,add){
    const a=app(); if(!a.tbRoster) return {error:'Team builder not loaded.'};
    const all=allPlayers();
    const di=a.tbRoster.findIndex(r=>(r.Player||'').toLowerCase().includes(drop.toLowerCase()));
    if(di===-1) return {success:false,message:drop+' not on roster.'};
    const ap=all.find(r=>(r.Player||'').toLowerCase().includes(add.toLowerCase()));
    if(!ap) return {success:false,message:add+' not found.'};
    const dropped=a.tbRoster[di].Player; a.tbRoster.splice(di,1,ap);
    if(a.tbRefresh) a.tbRefresh();
    return {success:true,dropped,added:ap.Player,rosterSize:a.tbRoster.length};
  }

  function comparePlayers(n1,n2){
    const a = app();
    if(!a.openCompare) return {error:'Comparison not available.'};
    const result = a.openCompare(n1, n2);
    if(!result) return {error: 'One or both players not found. Make sure both tabs (Guards & Bigs) have been loaded.'};
    // Return summary data for Gemini to analyze
    const p1 = getPlayerProfile(n1), p2 = getPlayerProfile(n2);
    return {opened: true, player1: p1 ? statLine(p1) : null, player2: p2 ? statLine(p2) : null};
  }

  // ---- Gemini Tool Schema ----
  const tools=[
    {functionDeclarations:[
    {name:'search_players',description:'Search players in our database by name, team, conference, or position.',
      parameters:{type:'OBJECT',properties:{query:{type:'STRING',description:'Search query'}},required:['query']}},
    {name:'get_player_profile',description:'Get full stats for a player from our database.',
      parameters:{type:'OBJECT',properties:{playerName:{type:'STRING'}},required:['playerName']}},
    {name:'get_top_players',description:'Get top players filtered by position, budget, team, conference, sorted by stat. Use for finding shooters (sortBy 3PT_Rating), defenders (sortBy DRtg), scorers (sortBy PPG), etc.',
      parameters:{type:'OBJECT',properties:{
        position:{type:'STRING',description:'guard, big, forward, center'},
        maxValue:{type:'NUMBER',description:'Max valuation $'},
        minPerf:{type:'NUMBER',description:'Min PerfScore'},
        team:{type:'STRING'},conference:{type:'STRING'},
        sortBy:{type:'STRING',description:'Score, PPG, 3PT_Rating (ALWAYS use for shooters instead of 3P%), 3P%, eFG%, APG, BPG, RPG, BPM, SPG, FT%, DRtg, USG%, PER, WS/40, 3PA/G, ActualValuation_calc'},
        limit:{type:'NUMBER',description:'# results (default 10)'}}}},
    {name:'get_dashboard_context',description:'Get current roster, budget, settings.',
      parameters:{type:'OBJECT',properties:{}}},
    {name:'add_players_to_roster',description:'Add players to roster. Use playerNames for specific players. Use team or conference (without playerNames) to add ALL players from a team/conference — e.g. when user says "add all Toledo players" call with {team:"Toledo"}. Call this immediately after your recommendation — the UI shows Yes/No buttons to the user automatically.',
      parameters:{type:'OBJECT',properties:{playerNames:{type:'ARRAY',items:{type:'STRING'},description:'Specific player names to add'},team:{type:'STRING',description:'Add ALL players from this team (use instead of playerNames for bulk team adds)'},conference:{type:'STRING',description:'Add ALL players from this conference'},limit:{type:'NUMBER',description:'Max players when using team/conference (optional)'}}}},
    {name:'remove_player_from_roster',description:'Remove player from roster. Call this immediately after your recommendation — the UI shows Yes/No buttons to the user automatically.',
      parameters:{type:'OBJECT',properties:{playerName:{type:'STRING'}},required:['playerName']}},
    {name:'swap_roster_player',description:'Swap one roster player for another. Call this immediately after your recommendation — the UI shows Yes/No buttons to the user automatically.',
      parameters:{type:'OBJECT',properties:{dropPlayer:{type:'STRING'},addPlayer:{type:'STRING'}},required:['dropPlayer','addPlayer']}},
    {name:'compare_players',description:'Compare two players side-by-side with visual stats table. ALWAYS use this for comparisons.',
      parameters:{type:'OBJECT',properties:{player1:{type:'STRING'},player2:{type:'STRING'}},required:['player1','player2']}},
    // Keep this description aligned with runtime enforcement: dashboard tools first, then web context.
    {name:'web_search',description:'Search Google for external information about a player or topic (injury news, transfer portal, scouting reports, recruiting rankings, role/minutes updates, team news, recaps). IMPORTANT: always look up dashboard data first (get_dashboard_context + get_player_profile/search_players/get_top_players/compare_players). Only call web_search AFTER the dashboard pass when the question depends on current external context (news/injuries/portal/availability/rumors).',
      parameters:{type:'OBJECT',properties:{query:{type:'STRING',description:'Google search query, e.g. "Brandon Benjamin Fairfield basketball 2025 scouting report"'}},required:['query']}},
  ]}
  ];

  const CONFIRM_ACTIONS=new Set(['add_players_to_roster','remove_player_from_roster','swap_roster_player']);

  // Web search via Cloudflare Worker proxy
  async function doWebSearch(query){
    try{
      const res = await fetch(GEMINI_PROXY_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'web_search', query})
      });
      const data = await res.json();
      if(data.error) return {error: typeof data.error === 'string' ? data.error : data.error.message || JSON.stringify(data.error)};
      // Format for Gemini to use
      let result = data.summary || 'No results found.';
      if(data.sources && data.sources.length){
        result += '\n\nSources:\n' + data.sources.map((s,i) => `${i+1}. ${s.title} — ${s.url}`).join('\n');
      }
      return {searchResults: result, query};
    }catch(e){
      return {error: 'Web search failed: ' + e.message};
    }
  }

  function execCall(c){
    const a=c.args||{};
    switch(c.name){
      case 'search_players': return searchPlayers(a.query||'');
      case 'get_player_profile': return getPlayerProfile(a.playerName||'');
      case 'get_top_players': return getTopPlayers(a);
      case 'get_dashboard_context': return getDashboardContext();
      case 'add_players_to_roster': return addPlayersToRoster(a.playerNames||[], a.team, a.conference, a.limit);
      case 'remove_player_from_roster': return removeFromRoster(a.playerName||'');
      case 'swap_roster_player': return swapPlayer(a.dropPlayer||'',a.addPlayer||'');
      case 'compare_players': return comparePlayers(a.player1||'',a.player2||'');
      case 'web_search': return doWebSearch(a.query||'');
      default: return {error:'Unknown: '+c.name};
    }
  }

  // ---- System prompt ----
  function sysPrompt(){
    const ctx=getDashboardContext();
    return {parts:[{text:`You are Scout AI, an expert basketball analytics and scouting assistant for the UToledo NCAA Basketball Dashboard. You are opinionated, knowledgeable, and proactive -- like a real assistant coach.

STATE: ${ctx.league}, ${ctx.position} tab, ${ctx.totalPlayers} players loaded
ROSTER: ${ctx.rosterSize}/${ctx.maxRoster} | Budget: $${(+ctx.budget).toLocaleString()} | Cap: $${(+ctx.playerCap).toLocaleString()} | Target: ${ctx.targetGuards}G/${ctx.targetBigs}B
${ctx.roster.length?'PLAYERS:\n'+ctx.roster.map((r,i)=>(i+1)+'. '+r.player+' ('+r.team+', '+r.pos+', Perf:'+r.perf+', Val:'+r.value+')').join('\n'):'ROSTER: empty'}

 RULES (strict):
 1) TOOL ORDER: Use dashboard tools first. Get constraints via get_dashboard_context when needed, then use search_players/get_top_players/get_player_profile/compare_players. Only use web_search AFTER the dashboard pass for anything the dashboard cannot know or that may have changed recently.
 2) COMPARE: For player vs player, ALWAYS call compare_players (do not hand-compare raw stats).
 3) FINDING PLAYERS: Use get_top_players with sortBy. For shooters ALWAYS sort by 3PT_Rating (never raw 3P%). For defenders use DRtg; for rim protection use BPG; scorers PPG; playmakers APG. Apply minPerf and maxValue when relevant. CRITICAL: NEVER recommend a player by name unless you have seen that player in a dashboard tool result (get_top_players, search_players, or get_player_profile) in this conversation. Do NOT use your training knowledge to invent player names.
 4) ROSTER ACTIONS: For swap requests, you MUST call get_top_players first to find real candidates from the dashboard, then pick your recommendation from those results. Give your recommendation with reasoning, then IMMEDIATELY call swap_roster_player in the same response — the system shows Yes/No buttons automatically. Do NOT ask "Want me to do this?" and wait.
  5) WEB_SEARCH REQUIRED: If the user says "latest/most recent/today/this week/yesterday/tomorrow", asks about injuries/suspensions/availability/transfer portal/role/minutes changes/NIL/coaching news, OR asks any valuation question (worth $, fair, overpay, steal, invest), you MUST call web_search after dashboard lookup.
 6) SOURCE OF TRUTH: Dashboard = stats, PerfScore, archetypes, fit score, model valuation, roster legality (MBB/WBB separation). Web = current context/status. If web context changes your recommendation, say so and reduce confidence.
 7) WEB REPORTING: When you use web_search, include concrete dates (not relative phrasing). If sources conflict, state the conflict and be conservative.
 8) OUTPUT FORMAT: (1) Recommendation: steal/fair/overpay/avoid (2) Dashboard evidence (3) Web evidence w/ dates (if used) (4) Risks/assumptions (5) Next action.
 9) EFFICIENCY: Minimize tool calls. Do at most 1 web_search unless the top option has a red-flag or the user explicitly asks for broader verification.
 10) LEAGUE SEPARATION: MBB and WBB cannot be mixed. Current league: ${ctx.league}.
 11) STYLE: Be concise. Use **bold** for emphasis. Format money like $125,000 (not 125000). Give a clear opinion; do not hedge unnecessarily.`}]};
  }

  // ---- API call ----
  async function callGemini(userText, fnResp){
    if(userText) chatHistory.push({role:'user',parts:[{text:userText}]});
    if(fnResp){
      chatHistory.push(fnResp.modelMsg);
      chatHistory.push({role:'user',parts:[{functionResponse:{name:fnResp.name,response:{result:fnResp.result}}}]});
    }
    const res=await fetch(GEMINI_PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:GEMINI_MODEL,contents:chatHistory,tools,systemInstruction:sysPrompt(),
        generationConfig:{temperature:0.7,maxOutputTokens:2048}})});
    const data=await res.json();
    if(data.error){ console.error('Gemini error:',data.error); throw new Error(data.error.message||data.error.status||JSON.stringify(data.error)); }
    return data;
  }

  // ---- Process response ----
  async function processResp(data, depth){
    depth = depth || 0;
    if(depth > 5){ addMsg('ai','I hit a loop limit. Here\'s what I have so far.'); return; }

    if(!data.candidates||!data.candidates.length){
      // Log the full response for debugging
      console.warn('No candidates in response:', JSON.stringify(data).slice(0,1000));
      const reason = data.promptFeedback?.blockReason || '';
      if(reason) addMsg('ai','My response was blocked: '+reason+'. Try rephrasing.');
      else addMsg('ai','I had trouble with that. Try a simpler question or rephrase it.');
      return;
    }

    const parts=data.candidates[0].content?.parts||[];
    if(!parts.length){ addMsg('ai','Empty response. Try rephrasing.'); return; }
    const hasFunctionCall = parts.some(p => !!p.functionCall);

    // For valuation/judgment prompts, force one web pass after dashboard lookup and before
    // accepting a text-only answer.
    if(!hasFunctionCall && turnHasDashboardLookup && !turnHasWebSearch && !turnForcedWebForValuation && needsMandatoryWebReview(lastUserText)){
      turnForcedWebForValuation = true;
      const forcedQuery = buildForcedWebQuery(lastUserText);
      addMsg('system', 'Searching the web...');
      let forcedResult;
      try{ forcedResult = await doWebSearch(forcedQuery); }
      catch(e){ forcedResult = { error: e.message || String(e) }; }
      try{
        const modelMsg = { role:'model', parts:[{ functionCall:{ name:'web_search', args:{ query: forcedQuery } } }] };
        const d2 = await callGemini(null, { name:'web_search', result:forcedResult, modelMsg });
        await processResp(d2, depth+1);
      }catch(err){
        addMsg('ai','Error: '+err.message);
      }
      return;
    }

    let hasText=false;
    for(const part of parts){
      if(part.text){
        hasText=true;
        chatHistory.push({role:'model',parts:[{text:part.text}]});
        addMsg('ai', fmtText(part.text));
      }
      if(part.functionCall){
        const call=part.functionCall;
        const modelMsg={role:'model',parts:[{functionCall:call}]};

        if(CONFIRM_ACTIONS.has(call.name)){
          // For swap actions, validate the replacement player actually exists in the dashboard
          // before showing confirmation buttons. If not found, self-correct: inject real
          // candidates and re-query Gemini so the user never sees a bad recommendation.
          if(call.name === 'swap_roster_player'){
            const addName = (call.args?.addPlayer || '').trim().toLowerCase();
            const playerExists = addName && allPlayers().some(r=>(r.Player||'').toLowerCase().includes(addName));
            if(!playerExists && addName){
              // Determine the position of the player being dropped for a tighter candidate filter.
              // Check both Position (group label: "Guards"/"Bigs") and Pos (specific: G/F/C).
              const dropRow = app().tbRoster?.find(r=>(r.Player||'').toLowerCase().includes((call.args?.dropPlayer||'').toLowerCase()));
              const dropPosStr = ((dropRow?.Position||'')+(dropRow?.Pos||'')).toLowerCase();
              const isGuard = dropPosStr.includes('guard')||/\bg\b|pg|sg|g-f/.test(dropPosStr);
              const isBig = dropPosStr.includes('big')||dropPosStr.includes('forward')||dropPosStr.includes('center')||/\bf\b|\bc\b|pf|sf|f-c|c-f/.test(dropPosStr);
              const posHint = isGuard ? 'guard' : isBig ? 'big' : null;
              const ctx = getDashboardContext();
              const candidates = getTopPlayers({position: posHint||undefined, limit:10, maxValue: ctx.playerCap||undefined});
              // Inject the bad call + a correction so Gemini has real data to pick from
              chatHistory.push(modelMsg);
              chatHistory.push({role:'user',parts:[{functionResponse:{name:'swap_roster_player',response:{result:{
                success:false,
                error:`"${call.args.addPlayer}" is not in the dashboard database. You must only recommend players confirmed in the dashboard. Here are the top available ${posHint||'players'} — pick one of these:`,
                availablePlayers: candidates.results
              }}}}]});
              turnHasDashboardLookup = true;
              addMsg('system','⚠️ '+call.args.addPlayer+' not in database — finding real candidates...');
              try{ const d2=await callGemini(null,null); await processResp(d2,depth+1); }
              catch(e){ addMsg('ai','Error: '+e.message); }
              return;
            }
          }

          pendingAction={call,modelMsg};
          const confirmBtns='<div class="aiConfirm"><button class="aiConfirmBtn yes" onclick="window._aiConfirm(true)">✓ Yes, do it</button><button class="aiConfirmBtn no" onclick="window._aiConfirm(false)">✕ Cancel</button></div>';
          if(!hasText){
            const names=(call.args?.playerNames||[]).join(', ');
            const teamLabel=call.args?.team?'all <b>'+call.args.team+'</b> players':names?'<b>'+names+'</b>':'players';
            const desc=call.name==='add_players_to_roster'?'Add '+teamLabel+' to roster'
              :call.name==='remove_player_from_roster'?'Remove <b>'+call.args?.playerName+'</b> from roster'
              :'Swap <b>'+call.args?.dropPlayer+'</b> → <b>'+call.args?.addPlayer+'</b>';
            addMsg('ai','I\'d like to: '+desc+'.'+confirmBtns);
          } else {
            addMsg('ai',confirmBtns);
          }
          return;
        }

        // Execute read-only calls immediately

        // Enforce dashboard-first order at runtime. If the model calls web_search before any
        // local tool in this turn, we inject local dashboard context first and re-query Gemini.
        if(call.name === 'web_search' && !turnHasDashboardLookup && !turnWebSearchDeferred){
          const q = (call.args?.query || lastUserText || '').trim();
          const hasPool = allPlayers().length > 0;
          if(q && hasPool){
            // One-shot defer flag: avoids recursion if the model still asks web_search next.
            turnWebSearchDeferred = true;
            addMsg('system', '🔍 Looking up data...');
            try{
              // Seed current roster/league/budget context so recommendation logic starts from local data.
              pushFnResult('get_dashboard_context', {}, getDashboardContext());
              turnHasDashboardLookup = true;

              // If query mentions a loaded player name, pass the full profile; otherwise provide
              // candidate matches so Gemini can anchor analysis to dashboard records first.
              const matchedPlayerObj = matchLoadedPlayer(q);
              const matched = matchedPlayerObj?.Player || null;
              const profile = matched ? getPlayerProfile(matched, matchedPlayerObj?.Team) : null;
              if(profile) pushFnResult('get_player_profile', {playerName: matched}, profile);
              else pushFnResult('search_players', {query: q}, searchPlayers(q));

              // Re-run model with injected local tool results; it can decide to call web_search next.
              const d2 = await callGemini(null, null);
              await processResp(d2, depth+1);
              return;
            }catch(e){
              // Fail-open behavior: if prefetch fails, keep original web_search path working.
            }
          }
        }

        const isWebSearch = call.name === 'web_search';
        addMsg('system', isWebSearch ? '🌐 Searching the web...' : '🔍 Looking up data...');
        let result;
        try{
          const r = execCall(call);
          result = (r && typeof r.then === 'function') ? await r : r; // await if Promise
        }catch(e){ result={error:e.message}; }

        // Track per-turn source coverage: local data first, then web context.
        if(isWebSearch) turnHasWebSearch = true;
        else turnHasDashboardLookup = true;

        // For compare_players, don't send back to Gemini — the modal is already open
        if(call.name === 'compare_players'){
          chatHistory.push(modelMsg);
          if(result && result.opened){
            const p1n = result.player1?.player || call.args?.player1 || '?';
            const p2n = result.player2?.player || call.args?.player2 || '?';
            chatHistory.push({role:'user',parts:[{functionResponse:{name:call.name,response:{result:{opened:true}}}}]});
            addMsg('ai', `⚔️ Opened side-by-side comparison of <b>${p1n}</b> vs <b>${p2n}</b>. Click the 🤖 button to see it behind this panel, or use <b>↩ Last compare</b> to reopen anytime.`);
          } else {
            addMsg('ai', result?.error || 'Could not find one or both players.');
          }
          return;
        }

        // Send result back for interpretation
        try{
          const d2=await callGemini(null,{name:call.name,result,modelMsg});
          await processResp(d2, depth+1);
        }catch(err){
          // Fallback: show raw result
          if(result&&!result.error){
            const preview=Array.isArray(result)?'Found '+result.length+' players.':JSON.stringify(result).slice(0,300);
            addMsg('ai','Here\'s the data:<br><code>'+preview+'</code><br>(Analysis failed: '+err.message+')');
          } else addMsg('ai','Error: '+err.message);
        }
        return; // Only process first function call per turn
      }
    }
  }

  function fmtText(t){
    let html = t.replace(/\*\*(.*?)\*\*/g,'<b>$1</b>').replace(/\n- /g,'\n• ').replace(/\n/g,'<br>').replace(/`([^`]+)`/g,'<code>$1</code>');
    // Make player names clickable — search for names that match loaded players
    const all = allPlayers();
    if(all.length){
      // Build a set of player names sorted longest first (to match "De'Angelo Smith" before "Smith")
      const names = [...new Set(all.map(r=>r.Player).filter(Boolean))].sort((a,b)=>b.length-a.length);
      for(const name of names){
        if(name.length < 5) continue; // skip very short names to avoid false matches
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('(?<!<[^>]*)\\b(' + escaped + ')\\b', 'g');
        html = html.replace(re, `<span class="aiPlayerLink" onclick="(function(){const a=window._app;if(a&&a.openProfile){const p=a.tbGetAllPlayers().find(r=>r.Player==='${name.replace(/'/g,"\\'")}');if(p)a.openProfile(p);}})()">$1</span>`);
      }
    }
    return html;
  }

  // ---- Confirm action (called by Yes/No buttons AND text fallback) ----
  async function executeConfirm(confirmed){
    if(!pendingAction) return;
    // Disable buttons immediately to prevent double-execution
    document.querySelectorAll('.aiConfirmBtn').forEach(b => { b.disabled=true; b.style.opacity='0.4'; });
    if(confirmed){
      addMsg('system','⚡ Executing...');
      let result; try{result=execCall(pendingAction.call);}catch(e){result={error:e.message};}
      const pa=pendingAction; pendingAction=null;
      sendBtn.disabled=true;
      try{ const d=await callGemini(null,{name:pa.call.name,result,modelMsg:pa.modelMsg}); await processResp(d); }
      catch(err){ addMsg('ai','Done! '+(result.error||result.added+' added'||JSON.stringify(result))); }
      sendBtn.disabled=false;
    } else {
      pendingAction=null;
      addMsg('ai','Cancelled. What else?');
    }
  }
  // Expose for button onclick handlers (defined inside IIFE so needs window bridge)
  window._aiConfirm = executeConfirm;

  // ---- Send ----
  async function send(){
    const text=input.value.trim(); if(!text) return; input.value='';

    if(pendingAction){
      const yes=/^(yes|yep|yea|yeah|sure|do it|go ahead|proceed|ok|confirm|absolutely|swap|add|remove)/i.test(text);
      const no=/^(no|nah|nope|cancel|never|don't|stop)/i.test(text);
      addMsg('user',text);
      if(yes){ await executeConfirm(true); }
      else if(no){ await executeConfirm(false); }
      else { pendingAction=null; await doSend(text); }
      return;
    }
    // Initialize per-turn orchestration state for dashboard-first enforcement.
    lastUserText = text;
    turnHasDashboardLookup = false;
    turnWebSearchDeferred = false;
    turnHasWebSearch = false;
    turnForcedWebForValuation = false;
    addMsg('user',text);
    await doSend(text);
  }

  async function doSend(text){
    showTyping(); sendBtn.disabled=true;
    try{
      // For valuation/judgment prompts, run a deterministic pipeline so the UI always shows:
      // dashboard evidence -> web evidence -> comparison verdict.
      if(await runValuationComparePipeline(text)){
        hideTyping();
      } else {
        const d=await callGemini(text);
        hideTyping();
        await processResp(d);
      }
    }
    catch(err){ hideTyping(); console.error('Scout AI error:',err); addMsg('ai','Error: '+err.message+'<br><br>Check your Cloudflare Worker is running.'); }
    sendBtn.disabled=false;
  }
})();
