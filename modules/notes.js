// ============ NOTES MODULE ============
// Handles the in-app notes panel — create, edit, delete, auto-save.
// Dependencies: auth.js (authGetToken, DEV_BYPASS_AUTH)

// Local escape helper
function _esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

var NOTES_BASE = 'https://hidden-salad-773b.bryanhkwan.workers.dev/notes';

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

var notesState = {
  notes: [],
  activeId: null,
  dirty: false,
  saveTimer: null,
  loaded: false,   // true after first successful server fetch
  playersOpen: true, // folder expansion state for [Scout] notes
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
    const raw = Array.isArray(data) ? data : (data?.notes || []);
    // Normalize all IDs to strings to avoid integer vs string === mismatches
    notesState.notes = raw.map(n => ({ ...n, id: String(n.id) }));
    notesState.loaded = true;
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
      body: JSON.stringify({ title: 'Untitled', content: ' ' }),
    });
    if (!note || !note.id) throw new Error('Unexpected server response');
    const normalized = { ...note, id: String(note.id) };
    notesState.notes.unshift(normalized);
    notesState.activeId = normalized.id;
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
    const idx = notesState.notes.findIndex(n => String(n.id) === String(id));
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

  const generalNotes = notesState.notes.filter(n => !String(n.title || '').startsWith('[Scout]'));
  const playerNotes  = notesState.notes.filter(n =>  String(n.title || '').startsWith('[Scout]'));

  if (!notesState.notes.length) {
    list.innerHTML = '<div class="notesEmpty">No notes yet.<br>Click <b>+ New</b> to start.</div>';
    return;
  }

  const makeItem = (n, displayTitle) => `
    <div class="notesItem${String(n.id) === String(notesState.activeId) ? ' active' : ''}" data-id="${_esc(n.id)}">
      <div class="notesItemTitle">${_esc(displayTitle || 'Untitled')}</div>
      <div class="notesItemDate">${notesFormatDate(n.updated_at || n.created_at)}</div>
    </div>`;

  let html = generalNotes.map(n => makeItem(n, n.title)).join('');

  if (playerNotes.length) {
    const isOpen = notesState.playersOpen !== false;
    html += `
    <div class="notesFolderRow${isOpen ? ' open' : ''}" id="notesFolderPlayers">
      <span class="notesFolderArrow">${isOpen ? '▾' : '▸'}</span>
      <span>📁 Players</span>
      <span class="notesFolderCount">${playerNotes.length}</span>
    </div>
    <div class="notesFolderItems${isOpen ? '' : ' hidden'}" id="notesFolderItems">
      ${playerNotes.map(n => makeItem(n, String(n.title).replace(/^\[Scout\]\s*/, ''))).join('')}
    </div>`;
  }

  list.innerHTML = html;

  list.querySelectorAll('.notesItem').forEach(el => {
    el.addEventListener('click', () => notesSelectNote(el.dataset.id));
  });

  const folderRow = document.getElementById('notesFolderPlayers');
  if (folderRow) {
    folderRow.addEventListener('click', () => {
      notesState.playersOpen = !notesState.playersOpen;
      notesRenderList();
    });
  }
}

function notesRenderEditor() {
  const wrap = document.getElementById('notesEditorWrap');
  if (!wrap) return;
  const note = notesState.notes.find(n => String(n.id) === String(notesState.activeId));
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
  notesState.activeId = String(id);
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

// --- Class wrapper (organizational) ---
class Notes {
  load(){ return notesLoad(); }
  create(){ return notesCreate(); }
  saveImmediate(keepalive){ return notesSaveImmediate(keepalive); }
}

window.Notes = new Notes();
