// ============ EVAL PRESETS MODULE ============
// Per-user evaluation presets for weights, valuation settings, and conference multipliers.
// Dependencies: auth.js, config.js, data.js

var EVAL_PRESETS_BASE = 'https://hidden-salad-773b.bryanhkwan.workers.dev/eval-presets';
var evalPresetState = {
  loaded: false,
  loading: false,
  applying: false,
  presetsByLeague: { MBB: [], WBB: [] },
  activeByLeague: { MBB: null, WBB: null },
  selectedByLeague: { MBB: '__default__', WBB: '__default__' },
  dirtyByLeague: { MBB: false, WBB: false },
  statusText: '',
  statusTone: '',
};

var evalPresetSelectEl, evalPresetApplyBtn, evalPresetSaveBtn, evalPresetUpdateBtn;
var evalPresetRenameBtn, evalPresetDeleteBtn, evalPresetDefaultBtn, evalPresetStatusEl;

function _devEvalPresetRows() {
  try { return JSON.parse(localStorage.getItem('_devEvalPresets') || '[]'); } catch (_) { return []; }
}
function _devEvalPresetWrite(rows) {
  localStorage.setItem('_devEvalPresets', JSON.stringify(Array.isArray(rows) ? rows : []));
}
function _devEvalPreferenceStore() {
  try { return JSON.parse(localStorage.getItem('_devEvalPrefs') || '{}'); } catch (_) { return {}; }
}
function _devEvalPreferenceWrite(obj) {
  localStorage.setItem('_devEvalPrefs', JSON.stringify(obj || {}));
}

async function _evalPresetsFetchDev(path, opts) {
  path = path || '';
  opts = opts || {};
  var method = ((opts.method || 'GET') + '').toUpperCase();
  var prefs = _devEvalPreferenceStore();
  var rows = _devEvalPresetRows();
  var now = new Date().toISOString();
  var idMatch = path.match(/^\/(\d+)$/);

  function activeMap() {
    return {
      MBB: prefs.active_mbb_preset_id == null ? null : Number(prefs.active_mbb_preset_id),
      WBB: prefs.active_wbb_preset_id == null ? null : Number(prefs.active_wbb_preset_id),
    };
  }

  if (method === 'GET' && path === '') {
    return {
      activePresetByLeague: activeMap(),
      presets: rows.slice(),
    };
  }

  if (method === 'POST' && path === '/activate') {
    var activateBody = JSON.parse(opts.body || '{}');
    var activateLeague = String(activateBody.league || 'MBB').toUpperCase() === 'WBB' ? 'WBB' : 'MBB';
    var presetId = activateBody.preset_id == null || activateBody.preset_id === '' ? null : Number(activateBody.preset_id);
    if (activateLeague === 'WBB') prefs.active_wbb_preset_id = Number.isFinite(presetId) ? presetId : null;
    else prefs.active_mbb_preset_id = Number.isFinite(presetId) ? presetId : null;
    _devEvalPreferenceWrite(prefs);
    return { success: true, activePresetByLeague: activeMap() };
  }

  if (method === 'POST' && path === '') {
    var createBody = JSON.parse(opts.body || '{}');
    var leagueName = String(createBody.league || 'MBB').toUpperCase() === 'WBB' ? 'WBB' : 'MBB';
    var name = String(createBody.name || '').trim();
    if (!name) throw new Error('name required');
    if (rows.some(function (row) { return row.league === leagueName && row.name.toLowerCase() === name.toLowerCase(); })) {
      var createConflict = new Error('A preset with that name already exists for this league.');
      createConflict.status = 409;
      throw createConflict;
    }
    var nextId = rows.reduce(function (mx, row) { return Math.max(mx, Number(row.id) || 0); }, 0) + 1;
    var preset = {
      id: nextId,
      user_id: 0,
      league: leagueName,
      name: name,
      payload: createBody.payload || {},
      created_at: now,
      updated_at: now,
    };
    rows.unshift(preset);
    _devEvalPresetWrite(rows);
    if (createBody.activate !== false) {
      if (leagueName === 'WBB') prefs.active_wbb_preset_id = nextId;
      else prefs.active_mbb_preset_id = nextId;
      _devEvalPreferenceWrite(prefs);
    }
    return { preset: preset, activePresetByLeague: activeMap() };
  }

  if (method === 'PATCH' && idMatch) {
    var updateBody = JSON.parse(opts.body || '{}');
    var presetIdNum = Number(idMatch[1]);
    var idx = rows.findIndex(function (row) { return Number(row.id) === presetIdNum; });
    if (idx < 0) {
      var notFound = new Error('Preset not found');
      notFound.status = 404;
      throw notFound;
    }
    var existing = rows[idx];
    var nextName = updateBody.name == null ? existing.name : String(updateBody.name || '').trim();
    if (!nextName) throw new Error('name required');
    if (rows.some(function (row) {
      return Number(row.id) !== presetIdNum && row.league === existing.league && row.name.toLowerCase() === nextName.toLowerCase();
    })) {
      var renameConflict = new Error('A preset with that name already exists for this league.');
      renameConflict.status = 409;
      throw renameConflict;
    }
    rows[idx] = {
      id: existing.id,
      user_id: existing.user_id,
      league: existing.league,
      name: nextName,
      payload: updateBody.payload === undefined ? existing.payload : updateBody.payload,
      created_at: existing.created_at,
      updated_at: now,
    };
    _devEvalPresetWrite(rows);
    if (updateBody.activate === true) {
      if (existing.league === 'WBB') prefs.active_wbb_preset_id = presetIdNum;
      else prefs.active_mbb_preset_id = presetIdNum;
      _devEvalPreferenceWrite(prefs);
    }
    return { preset: rows[idx], activePresetByLeague: activeMap() };
  }

  if (method === 'DELETE' && idMatch) {
    var deleteId = Number(idMatch[1]);
    var row = rows.find(function (item) { return Number(item.id) === deleteId; });
    if (!row) {
      var missing = new Error('Preset not found');
      missing.status = 404;
      throw missing;
    }
    rows = rows.filter(function (item) { return Number(item.id) !== deleteId; });
    _devEvalPresetWrite(rows);
    if (prefs.active_mbb_preset_id === deleteId) prefs.active_mbb_preset_id = null;
    if (prefs.active_wbb_preset_id === deleteId) prefs.active_wbb_preset_id = null;
    _devEvalPreferenceWrite(prefs);
    return { success: true, activePresetByLeague: activeMap() };
  }

  return null;
}

async function evalPresetsFetch(path, opts) {
  path = path || '';
  opts = opts || {};
  if (typeof DEV_BYPASS_AUTH !== 'undefined' && DEV_BYPASS_AUTH) {
    return _evalPresetsFetchDev(path, opts);
  }
  var token = typeof authGetToken === 'function' ? authGetToken() : null;
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  var res = await fetch(EVAL_PRESETS_BASE + path, Object.assign({ credentials: 'include', headers: headers }, opts));
  if (res.status === 401) {
    var unauthorized = new Error('Unauthorized');
    unauthorized.code = 'UNAUTHORIZED';
    throw unauthorized;
  }
  var data = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    var err = new Error(data.message || data.error || ('Error ' + res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

function evalPresetClone(value) {
  if (typeof deepClone === 'function') return deepClone(value);
  return JSON.parse(JSON.stringify(value));
}

function evalPresetCurrentLeague() {
  return league === 'WBB' ? 'WBB' : 'MBB';
}

function evalPresetDefaultsForLeague(leagueName) {
  var guardDefaults = (leagueName === 'WBB' && typeof WBB_GUARD_DEFAULTS !== 'undefined') ? WBB_GUARD_DEFAULTS : GUARD_DEFAULTS;
  var bigDefaults = (leagueName === 'WBB' && typeof WBB_BIG_DEFAULTS !== 'undefined') ? WBB_BIG_DEFAULTS : BIG_DEFAULTS;
  return {
    Guards: evalPresetClone(guardDefaults),
    Bigs: evalPresetClone(bigDefaults),
  };
}

function evalPresetSanitizeWeights(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(function (row) {
    if (!row) return null;
    var stat = String(row.stat || '').trim();
    if (!stat) return null;
    return {
      stat: stat,
      w: Number.isFinite(Number(row.w)) ? Number(row.w) : 0,
      min: Number.isFinite(Number(row.min)) ? Number(row.min) : 0,
      max: Number.isFinite(Number(row.max)) ? Number(row.max) : 0,
      dir: String(row.dir || '').trim().toLowerCase() === 'lower' ? 'lower' : 'higher',
    };
  }).filter(Boolean);
}

function evalPresetSerializeCurrent() {
  return {
    version: 1,
    positionWeights: {
      Guards: evalPresetSanitizeWeights(currentWeights.Guards || []),
      Bigs: evalPresetSanitizeWeights(currentWeights.Bigs || []),
    },
    valuation: {
      avgPay: Number(avgPayEl && avgPayEl.value),
      minPay: Number(minPayEl && minPayEl.value),
      maxPay: Number(maxPayEl && maxPayEl.value),
      starValue: Number(starValueEl && starValueEl.value),
      starPct: Number(starPctEl && starPctEl.value),
      mpMode: mpModeEl ? mpModeEl.value : 'on',
      mpPct: Number(mpPctEl && mpPctEl.value),
    },
    conferenceMultiplier: {
      enabled: !!(confMultToggleEl && confMultToggleEl.checked),
      values: evalPresetClone(confMultipliers || {}),
    },
  };
}

function evalPresetComparableWeights(rows) {
  return evalPresetSanitizeWeights(rows).filter(function (row) {
    return Number(row.w) !== 0;
  }).sort(function (a, b) {
    return String(a.stat || '').localeCompare(String(b.stat || ''));
  });
}

function evalPresetDefaultValuationForLeague(leagueName) {
  if (leagueName === 'WBB') {
    return {
      avgPay: 35000,
      minPay: 5000,
      maxPay: 100000,
      starValue: 70000,
      starPct: 0.95,
      mpMode: 'on',
      mpPct: 0.95,
    };
  }
  return {
    avgPay: 90000,
    minPay: 15000,
    maxPay: 500000,
    starValue: 325000,
    starPct: 0.97,
    mpMode: 'on',
    mpPct: 0.92,
  };
}

function evalPresetNormalizeComparablePayload(payload, leagueName) {
  var cleanPayload = payload && typeof payload === 'object' ? payload : {};
  var defaults = evalPresetDefaultsForLeague(leagueName);
  var valuationDefaults = evalPresetDefaultValuationForLeague(leagueName);
  var valuation = cleanPayload.valuation || {};
  var savedConf = cleanPayload.conferenceMultiplier && cleanPayload.conferenceMultiplier.values;
  var confValues = evalPresetClone(DEFAULT_CONF_VALUES);

  if (savedConf && typeof savedConf === 'object') {
    Object.keys(savedConf).forEach(function (key) {
      var num = Number(savedConf[key]);
      if (Number.isFinite(num)) confValues[key] = num;
    });
  }

  return {
    version: 1,
    positionWeights: {
      Guards: evalPresetComparableWeights((cleanPayload.positionWeights && cleanPayload.positionWeights.Guards) || defaults.Guards),
      Bigs: evalPresetComparableWeights((cleanPayload.positionWeights && cleanPayload.positionWeights.Bigs) || defaults.Bigs),
    },
    valuation: {
      avgPay: Number.isFinite(Number(valuation.avgPay)) ? Number(valuation.avgPay) : valuationDefaults.avgPay,
      minPay: Number.isFinite(Number(valuation.minPay)) ? Number(valuation.minPay) : valuationDefaults.minPay,
      maxPay: Number.isFinite(Number(valuation.maxPay)) ? Number(valuation.maxPay) : valuationDefaults.maxPay,
      starValue: Number.isFinite(Number(valuation.starValue)) ? Number(valuation.starValue) : valuationDefaults.starValue,
      starPct: Number.isFinite(Number(valuation.starPct)) ? Number(valuation.starPct) : valuationDefaults.starPct,
      mpMode: String(valuation.mpMode || valuationDefaults.mpMode).toLowerCase() === 'off' ? 'off' : 'on',
      mpPct: Number.isFinite(Number(valuation.mpPct)) ? Number(valuation.mpPct) : valuationDefaults.mpPct,
    },
    conferenceMultiplier: {
      enabled: !(cleanPayload.conferenceMultiplier && cleanPayload.conferenceMultiplier.enabled === false),
      values: confValues,
    },
  };
}

function evalPresetCurrentComparableSignature(leagueName) {
  return JSON.stringify(evalPresetNormalizeComparablePayload(evalPresetSerializeCurrent(), leagueName));
}

function evalPresetTargetComparableSignature(payload, leagueName) {
  return JSON.stringify(evalPresetNormalizeComparablePayload(payload, leagueName));
}

function evalPresetRenderConfTableDeferred() {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(function () { renderConfMultTable(); });
  } else {
    renderConfMultTable();
  }
}

function evalPresetApplySystemDefault(opts) {
  opts = opts || {};
  var leagueName = opts.league || evalPresetCurrentLeague();
  if (evalPresetCurrentComparableSignature(leagueName) === evalPresetTargetComparableSignature(null, leagueName)) {
    evalPresetState.selectedByLeague[leagueName] = '__default__';
    evalPresetState.dirtyByLeague[leagueName] = false;
    return false;
  }
  evalPresetState.applying = true;
  try {
    var valuationDefaults = evalPresetDefaultValuationForLeague(leagueName);
    loadScoringWeight();
    applyLeagueDefaults(true);
    if (starPctEl) starPctEl.value = valuationDefaults.starPct;
    if (mpModeEl) mpModeEl.value = valuationDefaults.mpMode;
    if (mpPctEl) mpPctEl.value = valuationDefaults.mpPct;
    confMultipliers = evalPresetClone(DEFAULT_CONF_VALUES);
    if (confMultToggleEl) confMultToggleEl.checked = true;
    renderWeights();
    evalPresetRenderConfTableDeferred();
    if (wb) reloadActiveSheet();
    else updateWeightFooter();
  } finally {
    evalPresetState.applying = false;
  }

  evalPresetState.selectedByLeague[leagueName] = '__default__';
  evalPresetState.dirtyByLeague[leagueName] = false;
  return true;
}

function evalPresetApplyPayload(payload, opts) {
  opts = opts || {};
  var leagueName = opts.league || evalPresetCurrentLeague();
  var cleanPayload = payload && typeof payload === 'object' ? payload : {};
  if (evalPresetCurrentComparableSignature(leagueName) === evalPresetTargetComparableSignature(cleanPayload, leagueName)) {
    evalPresetState.dirtyByLeague[leagueName] = false;
    return false;
  }
  var defaults = evalPresetDefaultsForLeague(leagueName);

  evalPresetState.applying = true;
  try {
    loadScoringWeight();
    currentWeights = {
      Guards: evalPresetSanitizeWeights((cleanPayload.positionWeights && cleanPayload.positionWeights.Guards) || defaults.Guards),
      Bigs: evalPresetSanitizeWeights((cleanPayload.positionWeights && cleanPayload.positionWeights.Bigs) || defaults.Bigs),
    };

    applyLeagueDefaults(true);
    var valuation = cleanPayload.valuation || {};
    if (avgPayEl && Number.isFinite(Number(valuation.avgPay))) avgPayEl.value = Number(valuation.avgPay);
    if (minPayEl && Number.isFinite(Number(valuation.minPay))) minPayEl.value = Number(valuation.minPay);
    if (maxPayEl && Number.isFinite(Number(valuation.maxPay))) maxPayEl.value = Number(valuation.maxPay);
    if (starValueEl && Number.isFinite(Number(valuation.starValue))) starValueEl.value = Number(valuation.starValue);
    if (starPctEl && Number.isFinite(Number(valuation.starPct))) starPctEl.value = Number(valuation.starPct);
    if (mpModeEl) mpModeEl.value = String(valuation.mpMode || 'on').toLowerCase() === 'off' ? 'off' : 'on';
    if (mpPctEl && Number.isFinite(Number(valuation.mpPct))) mpPctEl.value = Number(valuation.mpPct);

    confMultipliers = evalPresetClone(DEFAULT_CONF_VALUES);
    var savedConf = cleanPayload.conferenceMultiplier && cleanPayload.conferenceMultiplier.values;
    if (savedConf && typeof savedConf === 'object') {
      Object.keys(savedConf).forEach(function (key) {
        var num = Number(savedConf[key]);
        if (Number.isFinite(num)) confMultipliers[key] = num;
      });
    }
    if (confMultToggleEl) {
      confMultToggleEl.checked = !(cleanPayload.conferenceMultiplier && cleanPayload.conferenceMultiplier.enabled === false);
    }

    renderWeights();
    evalPresetRenderConfTableDeferred();
    if (wb) reloadActiveSheet();
    else updateWeightFooter();
  } finally {
    evalPresetState.applying = false;
  }

  evalPresetState.dirtyByLeague[leagueName] = false;
  return true;
}

function evalPresetFindById(leagueName, idValue) {
  var target = String(idValue);
  return (evalPresetState.presetsByLeague[leagueName] || []).find(function (preset) {
    return String(preset.id) === target;
  }) || null;
}

function evalPresetSetStatus(msg, tone) {
  evalPresetState.statusText = msg || '';
  evalPresetState.statusTone = tone || '';
  evalPresetRender();
}

function evalPresetMarkDirty() {
  if (evalPresetState.applying) return;
  var leagueName = evalPresetCurrentLeague();
  evalPresetState.dirtyByLeague[leagueName] = true;
  evalPresetRender();
}

function evalPresetUpsert(preset) {
  if (!preset || !preset.league) return;
  var leagueName = preset.league === 'WBB' ? 'WBB' : 'MBB';
  var list = evalPresetState.presetsByLeague[leagueName] || [];
  var idx = list.findIndex(function (item) { return String(item.id) === String(preset.id); });
  if (idx >= 0) list[idx] = preset;
  else list.unshift(preset);
  list.sort(function (a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
  evalPresetState.presetsByLeague[leagueName] = list;
}

function evalPresetRemove(leagueName, idValue) {
  evalPresetState.presetsByLeague[leagueName] = (evalPresetState.presetsByLeague[leagueName] || []).filter(function (preset) {
    return String(preset.id) !== String(idValue);
  });
}

function evalPresetGuestMode() {
  return typeof authIsGuest === 'function' && authIsGuest();
}

function evalPresetRender() {
  if (!evalPresetSelectEl) return;
  var leagueName = evalPresetCurrentLeague();
  var presets = evalPresetState.presetsByLeague[leagueName] || [];
  var selected = evalPresetState.selectedByLeague[leagueName];
  if (selected === null || selected === undefined) selected = '__default__';
  if (selected !== '__default__' && !evalPresetFindById(leagueName, selected)) selected = '__default__';
  evalPresetState.selectedByLeague[leagueName] = selected;

  evalPresetSelectEl.innerHTML = '';
  var defaultOpt = document.createElement('option');
  defaultOpt.value = '__default__';
  defaultOpt.textContent = 'System Default (' + leagueName + ')';
  evalPresetSelectEl.appendChild(defaultOpt);
  presets.forEach(function (preset) {
    var opt = document.createElement('option');
    opt.value = String(preset.id);
    opt.textContent = preset.name;
    evalPresetSelectEl.appendChild(opt);
  });
  evalPresetSelectEl.value = String(selected);

  var isGuest = evalPresetGuestMode();
  var isDefault = selected === '__default__';
  var hasPresets = presets.length > 0;
  if (evalPresetApplyBtn) evalPresetApplyBtn.disabled = isGuest;
  if (evalPresetSaveBtn) evalPresetSaveBtn.disabled = isGuest;
  if (evalPresetUpdateBtn) evalPresetUpdateBtn.disabled = isGuest || isDefault || !hasPresets;
  if (evalPresetRenameBtn) evalPresetRenameBtn.disabled = isGuest || isDefault || !hasPresets;
  if (evalPresetDeleteBtn) evalPresetDeleteBtn.disabled = isGuest || isDefault || !hasPresets;
  if (evalPresetDefaultBtn) evalPresetDefaultBtn.disabled = isGuest && isDefault;

  if (evalPresetStatusEl) {
    var statusText = evalPresetState.statusText;
    if (!statusText) {
      if (isGuest) {
        statusText = 'Log in to save personal evaluation presets for weights, valuation, and conference multipliers.';
      } else if (evalPresetState.dirtyByLeague[leagueName]) {
        statusText = 'Current ' + leagueName + ' settings changed locally. Save New or Update to keep them.';
      } else if (selected === '__default__') {
        statusText = 'Using the built-in ' + leagueName + ' default model.';
      } else {
        var activePreset = evalPresetFindById(leagueName, selected);
        statusText = activePreset ? ('Using preset "' + activePreset.name + '" for ' + leagueName + '.') : ('Ready to manage ' + leagueName + ' presets.');
      }
    }
    evalPresetStatusEl.textContent = statusText;
    evalPresetStatusEl.style.color = evalPresetState.statusTone === 'warn'
      ? 'var(--warn)'
      : evalPresetState.statusTone === 'bad'
        ? 'var(--bad)'
        : 'var(--muted)';
  }
}

async function evalPresetBootstrap(force) {
  if (evalPresetGuestMode()) {
    evalPresetState.loaded = true;
    evalPresetState.presetsByLeague = { MBB: [], WBB: [] };
    evalPresetState.activeByLeague = { MBB: null, WBB: null };
    evalPresetState.selectedByLeague = { MBB: '__default__', WBB: '__default__' };
    evalPresetState.dirtyByLeague = { MBB: false, WBB: false };
    evalPresetState.statusText = '';
    evalPresetState.statusTone = '';
    evalPresetRender();
    return;
  }
  if (evalPresetState.loading) return;
  if (evalPresetState.loaded && !force) {
    evalPresetRender();
    return;
  }

  evalPresetState.loading = true;
  try {
    var data = await evalPresetsFetch('', { method: 'GET' });
    var presets = Array.isArray(data && data.presets) ? data.presets : [];
    evalPresetState.presetsByLeague = {
      MBB: presets.filter(function (preset) { return preset.league !== 'WBB'; }),
      WBB: presets.filter(function (preset) { return preset.league === 'WBB'; }),
    };
    evalPresetState.activeByLeague = {
      MBB: data && data.activePresetByLeague ? data.activePresetByLeague.MBB : null,
      WBB: data && data.activePresetByLeague ? data.activePresetByLeague.WBB : null,
    };
    evalPresetState.selectedByLeague = {
      MBB: evalPresetState.activeByLeague.MBB == null ? '__default__' : String(evalPresetState.activeByLeague.MBB),
      WBB: evalPresetState.activeByLeague.WBB == null ? '__default__' : String(evalPresetState.activeByLeague.WBB),
    };
    evalPresetState.loaded = true;
    evalPresetState.statusText = '';
    evalPresetState.statusTone = '';
    evalPresetRender();
    await evalPresetApplyActiveForCurrentLeague();
  } catch (e) {
    if (e && e.code === 'UNAUTHORIZED' && typeof authHandleUnauthorized === 'function') {
      authHandleUnauthorized('Your session expired. Please log in again to load evaluation presets.');
      return;
    }
    console.warn('[EvalPresets] bootstrap error:', e);
    evalPresetSetStatus('Could not load saved presets right now.', 'warn');
  } finally {
    evalPresetState.loading = false;
  }
}

function evalPresetApplyActiveForCurrentLeague(force) {
  var leagueName = evalPresetCurrentLeague();
  if (!evalPresetState.loaded && !force) return;
  var activeId = evalPresetState.activeByLeague[leagueName];
  if (activeId == null) {
    var changedDefault = evalPresetApplySystemDefault({ league: leagueName });
    evalPresetRender();
    return changedDefault;
  }
  var preset = evalPresetFindById(leagueName, activeId);
  if (!preset) {
    var changed = evalPresetApplySystemDefault({ league: leagueName });
    evalPresetState.activeByLeague[leagueName] = null;
    evalPresetRender();
    return changed;
  }
  var changed = evalPresetApplyPayload(preset.payload, { league: leagueName });
  evalPresetState.selectedByLeague[leagueName] = String(preset.id);
  evalPresetRender();
  return changed;
}

async function evalPresetApplySelection() {
  if (evalPresetGuestMode()) {
    evalPresetSetStatus('Log in to apply and save account-level presets.', 'warn');
    return;
  }
  var leagueName = evalPresetCurrentLeague();
  var selected = evalPresetSelectEl ? evalPresetSelectEl.value : '__default__';
  try {
    if (selected === '__default__') {
      await evalPresetsFetch('/activate', {
        method: 'POST',
        body: JSON.stringify({ league: leagueName, preset_id: null }),
      });
      evalPresetState.activeByLeague[leagueName] = null;
      evalPresetState.selectedByLeague[leagueName] = '__default__';
      evalPresetApplySystemDefault({ league: leagueName });
      evalPresetSetStatus('System default is now active for ' + leagueName + '.', '');
      return;
    }

    var preset = evalPresetFindById(leagueName, selected);
    if (!preset) {
      evalPresetSetStatus('That preset could not be found. Try refreshing presets.', 'warn');
      return;
    }

    await evalPresetsFetch('/activate', {
      method: 'POST',
      body: JSON.stringify({ league: leagueName, preset_id: Number(preset.id) }),
    });
    evalPresetState.activeByLeague[leagueName] = Number(preset.id);
    evalPresetState.selectedByLeague[leagueName] = String(preset.id);
    evalPresetApplyPayload(preset.payload, { league: leagueName });
    evalPresetSetStatus('Applied "' + preset.name + '" for ' + leagueName + '.', '');
  } catch (e) {
    if (e && e.code === 'UNAUTHORIZED' && typeof authHandleUnauthorized === 'function') {
      authHandleUnauthorized('Your session expired. Please log in again to use evaluation presets.');
      return;
    }
    console.warn('[EvalPresets] apply error:', e);
    evalPresetSetStatus(e.message || 'Could not apply preset.', 'warn');
  }
}

async function evalPresetSaveNew() {
  if (evalPresetGuestMode()) {
    evalPresetSetStatus('Log in to save personal presets.', 'warn');
    return;
  }
  var leagueName = evalPresetCurrentLeague();
  var name = prompt('Save current ' + leagueName + ' settings as preset:', '');
  if (!name) return;
  name = String(name).trim();
  if (!name) return;
  try {
    var data = await evalPresetsFetch('', {
      method: 'POST',
      body: JSON.stringify({
        league: leagueName,
        name: name,
        payload: evalPresetSerializeCurrent(),
        activate: true,
      }),
    });
    if (data && data.preset) evalPresetUpsert(data.preset);
    if (data && data.activePresetByLeague) evalPresetState.activeByLeague = data.activePresetByLeague;
    if (data && data.preset) evalPresetState.selectedByLeague[leagueName] = String(data.preset.id);
    evalPresetState.dirtyByLeague[leagueName] = false;
    evalPresetSetStatus('Saved "' + name + '" for ' + leagueName + '.', '');
  } catch (e) {
    if (e && e.code === 'UNAUTHORIZED' && typeof authHandleUnauthorized === 'function') {
      authHandleUnauthorized('Your session expired. Please log in again to save presets.');
      return;
    }
    console.warn('[EvalPresets] save error:', e);
    evalPresetSetStatus(e.message || 'Could not save preset.', 'warn');
  }
}

async function evalPresetUpdateCurrent() {
  if (evalPresetGuestMode()) {
    evalPresetSetStatus('Log in to update saved presets.', 'warn');
    return;
  }
  var leagueName = evalPresetCurrentLeague();
  var selected = evalPresetSelectEl ? evalPresetSelectEl.value : '__default__';
  if (selected === '__default__') {
    evalPresetSetStatus('Choose a saved preset before updating it.', 'warn');
    return;
  }
  var preset = evalPresetFindById(leagueName, selected);
  if (!preset) {
    evalPresetSetStatus('That preset could not be found. Try refreshing presets.', 'warn');
    return;
  }
  try {
    var data = await evalPresetsFetch('/' + encodeURIComponent(preset.id), {
      method: 'PATCH',
      body: JSON.stringify({
        payload: evalPresetSerializeCurrent(),
        activate: true,
      }),
    });
    if (data && data.preset) evalPresetUpsert(data.preset);
    if (data && data.activePresetByLeague) evalPresetState.activeByLeague = data.activePresetByLeague;
    evalPresetState.selectedByLeague[leagueName] = String(preset.id);
    evalPresetState.dirtyByLeague[leagueName] = false;
    evalPresetSetStatus('Updated "' + preset.name + '" for ' + leagueName + '.', '');
  } catch (e) {
    if (e && e.code === 'UNAUTHORIZED' && typeof authHandleUnauthorized === 'function') {
      authHandleUnauthorized('Your session expired. Please log in again to update presets.');
      return;
    }
    console.warn('[EvalPresets] update error:', e);
    evalPresetSetStatus(e.message || 'Could not update preset.', 'warn');
  }
}

async function evalPresetRenameCurrent() {
  if (evalPresetGuestMode()) {
    evalPresetSetStatus('Log in to rename saved presets.', 'warn');
    return;
  }
  var leagueName = evalPresetCurrentLeague();
  var selected = evalPresetSelectEl ? evalPresetSelectEl.value : '__default__';
  if (selected === '__default__') {
    evalPresetSetStatus('System default cannot be renamed.', 'warn');
    return;
  }
  var preset = evalPresetFindById(leagueName, selected);
  if (!preset) {
    evalPresetSetStatus('That preset could not be found. Try refreshing presets.', 'warn');
    return;
  }
  var nextName = prompt('Rename preset:', preset.name || '');
  if (!nextName) return;
  nextName = String(nextName).trim();
  if (!nextName || nextName === preset.name) return;
  try {
    var data = await evalPresetsFetch('/' + encodeURIComponent(preset.id), {
      method: 'PATCH',
      body: JSON.stringify({ name: nextName }),
    });
    if (data && data.preset) evalPresetUpsert(data.preset);
    evalPresetState.selectedByLeague[leagueName] = String(preset.id);
    evalPresetSetStatus('Renamed preset to "' + nextName + '".', '');
  } catch (e) {
    if (e && e.code === 'UNAUTHORIZED' && typeof authHandleUnauthorized === 'function') {
      authHandleUnauthorized('Your session expired. Please log in again to rename presets.');
      return;
    }
    console.warn('[EvalPresets] rename error:', e);
    evalPresetSetStatus(e.message || 'Could not rename preset.', 'warn');
  }
}

async function evalPresetDeleteCurrent() {
  if (evalPresetGuestMode()) {
    evalPresetSetStatus('Log in to delete saved presets.', 'warn');
    return;
  }
  var leagueName = evalPresetCurrentLeague();
  var selected = evalPresetSelectEl ? evalPresetSelectEl.value : '__default__';
  if (selected === '__default__') {
    evalPresetSetStatus('System default cannot be deleted.', 'warn');
    return;
  }
  var preset = evalPresetFindById(leagueName, selected);
  if (!preset) {
    evalPresetSetStatus('That preset could not be found. Try refreshing presets.', 'warn');
    return;
  }
  if (!confirm('Delete preset "' + preset.name + '" for ' + leagueName + '?')) return;
  try {
    var data = await evalPresetsFetch('/' + encodeURIComponent(preset.id), {
      method: 'DELETE',
    });
    evalPresetRemove(leagueName, preset.id);
    if (data && data.activePresetByLeague) evalPresetState.activeByLeague = data.activePresetByLeague;
    evalPresetState.selectedByLeague[leagueName] = '__default__';
    evalPresetApplySystemDefault({ league: leagueName });
    evalPresetSetStatus('Deleted "' + preset.name + '". System default is active again.', '');
  } catch (e) {
    if (e && e.code === 'UNAUTHORIZED' && typeof authHandleUnauthorized === 'function') {
      authHandleUnauthorized('Your session expired. Please log in again to delete presets.');
      return;
    }
    console.warn('[EvalPresets] delete error:', e);
    evalPresetSetStatus(e.message || 'Could not delete preset.', 'warn');
  }
}

function evalPresetResetSession() {
  evalPresetState.loaded = false;
  evalPresetState.loading = false;
  evalPresetState.presetsByLeague = { MBB: [], WBB: [] };
  evalPresetState.activeByLeague = { MBB: null, WBB: null };
  evalPresetState.selectedByLeague = { MBB: '__default__', WBB: '__default__' };
  evalPresetState.dirtyByLeague = { MBB: false, WBB: false };
  evalPresetState.statusText = '';
  evalPresetState.statusTone = '';
  evalPresetRender();
}

function initEvalPresetDOM() {
  evalPresetSelectEl = document.getElementById('evalPresetSelect');
  evalPresetApplyBtn = document.getElementById('evalPresetApplyBtn');
  evalPresetSaveBtn = document.getElementById('evalPresetSaveBtn');
  evalPresetUpdateBtn = document.getElementById('evalPresetUpdateBtn');
  evalPresetRenameBtn = document.getElementById('evalPresetRenameBtn');
  evalPresetDeleteBtn = document.getElementById('evalPresetDeleteBtn');
  evalPresetDefaultBtn = document.getElementById('evalPresetDefaultBtn');
  evalPresetStatusEl = document.getElementById('evalPresetStatus');

  if (evalPresetSelectEl && !evalPresetSelectEl._bound) {
    evalPresetSelectEl.addEventListener('change', function () {
      evalPresetState.selectedByLeague[evalPresetCurrentLeague()] = evalPresetSelectEl.value || '__default__';
      evalPresetRender();
    });
    evalPresetSelectEl._bound = true;
  }
  if (evalPresetApplyBtn && !evalPresetApplyBtn._bound) {
    evalPresetApplyBtn.addEventListener('click', evalPresetApplySelection);
    evalPresetApplyBtn._bound = true;
  }
  if (evalPresetSaveBtn && !evalPresetSaveBtn._bound) {
    evalPresetSaveBtn.addEventListener('click', evalPresetSaveNew);
    evalPresetSaveBtn._bound = true;
  }
  if (evalPresetUpdateBtn && !evalPresetUpdateBtn._bound) {
    evalPresetUpdateBtn.addEventListener('click', evalPresetUpdateCurrent);
    evalPresetUpdateBtn._bound = true;
  }
  if (evalPresetRenameBtn && !evalPresetRenameBtn._bound) {
    evalPresetRenameBtn.addEventListener('click', evalPresetRenameCurrent);
    evalPresetRenameBtn._bound = true;
  }
  if (evalPresetDeleteBtn && !evalPresetDeleteBtn._bound) {
    evalPresetDeleteBtn.addEventListener('click', evalPresetDeleteCurrent);
    evalPresetDeleteBtn._bound = true;
  }
  if (evalPresetDefaultBtn && !evalPresetDefaultBtn._bound) {
    evalPresetDefaultBtn.addEventListener('click', function () {
      evalPresetState.selectedByLeague[evalPresetCurrentLeague()] = '__default__';
      evalPresetApplySelection();
    });
    evalPresetDefaultBtn._bound = true;
  }

  if (weightsBody && !weightsBody._evalPresetDirtyBound) {
    weightsBody.addEventListener('input', evalPresetMarkDirty);
    weightsBody.addEventListener('change', evalPresetMarkDirty);
    weightsBody._evalPresetDirtyBound = true;
  }
  [avgPayEl, minPayEl, maxPayEl, starValueEl, starPctEl, mpModeEl, mpPctEl].forEach(function (el) {
    if (!el || el._evalPresetDirtyBound) return;
    el.addEventListener('input', evalPresetMarkDirty);
    el.addEventListener('change', evalPresetMarkDirty);
    el._evalPresetDirtyBound = true;
  });
  if (confMultToggleEl && !confMultToggleEl._evalPresetDirtyBound) {
    confMultToggleEl.addEventListener('change', evalPresetMarkDirty);
    confMultToggleEl._evalPresetDirtyBound = true;
  }
  if (confMultTableBody && !confMultTableBody._evalPresetDirtyBound) {
    confMultTableBody.addEventListener('input', evalPresetMarkDirty);
    confMultTableBody.addEventListener('change', evalPresetMarkDirty);
    confMultTableBody._evalPresetDirtyBound = true;
  }
  [resetWeightsBtn, resetValBtn, resetConfMultBtn].forEach(function (btn) {
    if (!btn || btn._evalPresetDirtyBound) return;
    btn.addEventListener('click', function () {
      setTimeout(evalPresetMarkDirty, 0);
    });
    btn._evalPresetDirtyBound = true;
  });

  evalPresetRender();
}

window.EvalPresets = {
  bootstrap: evalPresetBootstrap,
  applyActiveForCurrentLeague: evalPresetApplyActiveForCurrentLeague,
  isLoaded: function () { return !!evalPresetState.loaded; },
  refreshUI: evalPresetRender,
  markDirty: evalPresetMarkDirty,
  resetSession: evalPresetResetSession,
};

document.addEventListener('DOMContentLoaded', initEvalPresetDOM);
