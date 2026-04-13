
// ============ VALUE LAB MODULE ============
// Phase 1.5: source-driven ROI / investment analysis for actual teams, scenarios, and snapshots.
// Dependencies: data.js, teambuilder.js, profile.js, auth.js, teams.js

var valueLabState = {
  store: null,
  selection: null,
  refreshToken: 0,
  statusTimer: null,
};

var valueLabModeSelectEl, valueLabSourceSelectEl, valueLabActualTeamSelectEl, valueLabSnapshotNameEl,
    valueLabUseLiveBtnEl, valueLabUseTeamHubBtnEl, valueLabSaveBtnEl, valueLabDeleteBtnEl,
    valueLabSourceMetaEl, valueLabSourceStatusEl, valueLabKpisEl, valueLabInsightsEl,
    valueLabOutcomeEl, valueLabScatterEl, valueLabBreakdownsEl, valueLabRosterBodyEl,
    valueLabRosterEmptyEl, valueLabOpenTeamBuilderBtnEl, valueLabOpenTeamHubBtnEl;

function initValueLabDOMRefs() {
  valueLabModeSelectEl = document.getElementById('valueLabModeSelect');
  valueLabSourceSelectEl = document.getElementById('valueLabSourceSelect');
  valueLabActualTeamSelectEl = document.getElementById('valueLabActualTeamSelect');
  valueLabSnapshotNameEl = document.getElementById('valueLabSnapshotName');
  valueLabUseLiveBtnEl = document.getElementById('valueLabUseLiveBtn');
  valueLabUseTeamHubBtnEl = document.getElementById('valueLabUseTeamHubBtn');
  valueLabSaveBtnEl = document.getElementById('valueLabSaveBtn');
  valueLabDeleteBtnEl = document.getElementById('valueLabDeleteBtn');
  valueLabSourceMetaEl = document.getElementById('valueLabSourceMeta');
  valueLabSourceStatusEl = document.getElementById('valueLabSourceStatus');
  valueLabKpisEl = document.getElementById('valueLabKpis');
  valueLabInsightsEl = document.getElementById('valueLabInsights');
  valueLabOutcomeEl = document.getElementById('valueLabOutcome');
  valueLabScatterEl = document.getElementById('valueLabScatter');
  valueLabBreakdownsEl = document.getElementById('valueLabBreakdowns');
  valueLabRosterBodyEl = document.getElementById('valueLabRosterBody');
  valueLabRosterEmptyEl = document.getElementById('valueLabRosterEmpty');
  valueLabOpenTeamBuilderBtnEl = document.getElementById('valueLabOpenTeamBuilderBtn');
  valueLabOpenTeamHubBtnEl = document.getElementById('valueLabOpenTeamHubBtn');
}

function valueLabClone(value) {
  if (typeof deepClone === 'function') return deepClone(value);
  return JSON.parse(JSON.stringify(value));
}

function valueLabNum(value) {
  if (typeof safeNum === 'function') return safeNum(value);
  var n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function valueLabFmtMoney(value) {
  var n = valueLabNum(value);
  if (!Number.isFinite(n)) return '—';
  if (typeof demoFormatMoney === 'function') return demoFormatMoney(n);
  if (typeof fmtMoney === 'function') return fmtMoney(n);
  return '$' + Math.round(n).toLocaleString('en-US');
}

function valueLabMoneyForAI(value) {
  var n = valueLabNum(value);
  if (!Number.isFinite(n)) return null;
  if (typeof demoIsGuestMode === 'function' && demoIsGuestMode()) {
    return valueLabFmtMoney(n);
  }
  return n;
}

function valueLabNorm(text) {
  return String(text || '').trim().toLowerCase();
}

function valueLabPlayerKey(row) {
  return valueLabNorm(row && row.Player) + '||' + valueLabNorm(row && row.Team);
}

function valueLabCurrentLeague() {
  return (typeof league !== 'undefined' && league) ? league : 'MBB';
}

function valueLabCurrentSeason() {
  if (typeof getDashboardSelectedSeason === 'function') return String(getDashboardSelectedSeason('2026') || '2026');
  if (typeof _currentDataSeason !== 'undefined' && _currentDataSeason) return String(_currentDataSeason);
  var seasonEl = document.getElementById('cbdSeason');
  return String((seasonEl && seasonEl.value) || '2026');
}

function valueLabStorageKey() {
  var user = '';
  if (typeof authGetUser === 'function') user = authGetUser() || '';
  if (!user && typeof authIsGuest === 'function' && authIsGuest()) user = 'guest';
  if (!user) user = 'local';
  return 'ncaa_value_lab::' + valueLabNorm(user || 'local');
}

function valueLabSeasonStoreKey() {
  return valueLabCurrentLeague() + '::' + valueLabCurrentSeason();
}

function valueLabDefaultSelection() {
  return {
    mode: 'actualTeam',
    actualTeam: '',
    snapshotId: '',
  };
}

function valueLabDefaultStore() {
  return {
    version: 2,
    selectedBySeason: {},
    snapshots: [],
  };
}

function valueLabNormalizeSelection(raw) {
  if (typeof raw === 'string') {
    if (!raw || raw === '__live__' || raw === 'scenarioRoster') {
      return { mode: 'scenarioRoster', actualTeam: '', snapshotId: '' };
    }
    return { mode: 'snapshot', actualTeam: '', snapshotId: String(raw) };
  }
  raw = raw && typeof raw === 'object' ? raw : {};
  var mode = String(raw.mode || '').trim();
  if (mode !== 'actualTeam' && mode !== 'scenarioRoster' && mode !== 'snapshot') mode = 'actualTeam';
  return {
    mode: mode,
    actualTeam: String(raw.actualTeam || raw.team || '').trim(),
    snapshotId: String(raw.snapshotId || raw.selectedSourceId || '').trim(),
  };
}

function valueLabNormalizeSnapshotPlayer(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var fallback = raw.fallback && typeof raw.fallback === 'object' ? raw.fallback : {};
  return {
    key: String(raw.key || valueLabPlayerKey(fallback) || '').trim(),
    fallback: {
      Player: fallback.Player || '',
      Team: fallback.Team || '',
      Conference: fallback.Conference || '',
      Position: fallback.Position || fallback.Pos || '',
      Pos: fallback.Pos || fallback.Position || '',
      Class: fallback.Class || fallback.Yr || fallback.Year || '',
      Height: fallback.Height || '',
      MP: valueLabNum(fallback.MP),
      Score: valueLabNum(fallback.Score),
      ActualValuation_calc: valueLabNum(fallback.ActualValuation_calc),
      FitScore_calc: valueLabNum(fallback.FitScore_calc),
    }
  };
}

function valueLabNormalizeSnapshot(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var players = Array.isArray(raw.players) ? raw.players.map(valueLabNormalizeSnapshotPlayer).filter(function (item) {
    return item.key || (item.fallback && item.fallback.Player);
  }) : [];
  var sourceType = String(raw.sourceType || '').trim();
  if (sourceType !== 'actualTeam' && sourceType !== 'scenarioRoster') sourceType = 'scenarioRoster';
  return {
    id: String(raw.id || ('vl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8))),
    name: String(raw.name || 'Untitled Snapshot').trim() || 'Untitled Snapshot',
    league: raw.league === 'WBB' ? 'WBB' : 'MBB',
    season: String(raw.season || '2026'),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
    sourceType: sourceType,
    sourceLabel: String(raw.sourceLabel || '').trim(),
    actualTeam: String(raw.actualTeam || '').trim(),
    players: players,
  };
}

function valueLabNormalizeStore(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var out = valueLabDefaultStore();
  var selectedBySeason = raw.selectedBySeason && typeof raw.selectedBySeason === 'object' ? raw.selectedBySeason : {};
  Object.keys(selectedBySeason).forEach(function (key) {
    out.selectedBySeason[key] = valueLabNormalizeSelection(selectedBySeason[key]);
  });
  out.snapshots = Array.isArray(raw.snapshots) ? raw.snapshots.map(valueLabNormalizeSnapshot) : [];
  return out;
}

function valueLabReadStore() {
  try {
    return valueLabNormalizeStore(JSON.parse(localStorage.getItem(valueLabStorageKey()) || '{}'));
  } catch (_) {
    return valueLabDefaultStore();
  }
}

function valueLabWriteStore(store) {
  store = valueLabNormalizeStore(store || valueLabDefaultStore());
  valueLabState.store = store;
  localStorage.setItem(valueLabStorageKey(), JSON.stringify(store));
}

function valueLabLoadStore() {
  valueLabState.store = valueLabReadStore();
  return valueLabState.store;
}

function valueLabSnapshotsForCurrentSeason() {
  var store = valueLabState.store || valueLabLoadStore();
  return (store.snapshots || []).filter(function (snapshot) {
    return snapshot.league === valueLabCurrentLeague() && String(snapshot.season) === valueLabCurrentSeason();
  }).sort(function (a, b) {
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

function valueLabCurrentPool() {
  if (typeof tbGetAllPlayers !== 'function') return [];
  try {
    return tbGetAllPlayers(valueLabCurrentLeague()) || [];
  } catch (_) {
    return [];
  }
}

function valueLabCurrentTeams() {
  var byNorm = {};
  valueLabCurrentPool().forEach(function (row) {
    var team = String(row && row.Team || '').trim();
    if (!team) return;
    var key = valueLabNorm(team);
    if (!byNorm[key]) byNorm[key] = team;
  });
  return Object.keys(byNorm).map(function (key) { return byNorm[key]; }).sort(function (a, b) {
    return a.localeCompare(b);
  });
}

function valueLabCanonicalTeamName(teamName, teamList) {
  var name = String(teamName || '').trim();
  if (!name) return '';
  var target = valueLabNorm(name);
  var teams = Array.isArray(teamList) ? teamList : valueLabCurrentTeams();
  for (var i = 0; i < teams.length; i += 1) {
    if (valueLabNorm(teams[i]) === target) return teams[i];
  }
  return name;
}

function valueLabGetTeamHubTeam() {
  if (window.TeamHub && typeof window.TeamHub.getCurrentTeam === 'function') {
    return String(window.TeamHub.getCurrentTeam() || '').trim();
  }
  return '';
}

function valueLabSnapshotPayloadFromPlayers(players) {
  return (Array.isArray(players) ? players : []).map(function (row) {
    return {
      key: valueLabPlayerKey(row),
      fallback: {
        Player: row.Player || '',
        Team: row.Team || '',
        Conference: row.Conference || '',
        Position: row.Position || row.Pos || '',
        Pos: row.Pos || row.Position || '',
        Class: row.Class || row.Yr || row.Year || '',
        Height: row.Height || '',
        MP: valueLabNum(row.MP),
        Score: valueLabNum(row.Score),
        ActualValuation_calc: valueLabNum(row.ActualValuation_calc),
        FitScore_calc: valueLabNum(row.FitScore_calc),
      }
    };
  }).filter(function (item) {
    return item.key || (item.fallback && item.fallback.Player);
  });
}

function valueLabResolveSnapshotPlayers(snapshot) {
  var pool = valueLabCurrentPool();
  var byKey = {};
  pool.forEach(function (row) {
    var key = valueLabPlayerKey(row);
    if (key) byKey[key] = row;
  });
  return (snapshot && Array.isArray(snapshot.players) ? snapshot.players : []).map(function (item) {
    var match = byKey[item.key] || null;
    if (match) return valueLabClone(match);
    return valueLabClone(item.fallback || null);
  }).filter(Boolean);
}

function valueLabGetSelectedSnapshot(selection) {
  var selected = selection || valueLabGetSelection();
  if (!selected || selected.mode !== 'snapshot' || !selected.snapshotId) return null;
  return valueLabSnapshotsForCurrentSeason().find(function (snapshot) {
    return snapshot.id === selected.snapshotId;
  }) || null;
}

function valueLabSuggestedActualTeam(teamList) {
  var teams = Array.isArray(teamList) ? teamList : valueLabCurrentTeams();
  if (!teams.length) return '';
  var hubTeam = valueLabCanonicalTeamName(valueLabGetTeamHubTeam(), teams);
  if (hubTeam && teams.some(function (team) { return valueLabNorm(team) === valueLabNorm(hubTeam); })) return hubTeam;
  var rosterTeam = valueLabDetectBaseTeam(Array.isArray(tbRoster) ? tbRoster : []);
  if (rosterTeam && rosterTeam.team) {
    var canonical = valueLabCanonicalTeamName(rosterTeam.team, teams);
    if (canonical && teams.some(function (team) { return valueLabNorm(team) === valueLabNorm(canonical); })) return canonical;
  }
  return '';
}

function valueLabReconcileSelection(selection) {
  var next = valueLabNormalizeSelection(selection);
  var snapshots = valueLabSnapshotsForCurrentSeason();
  var teams = valueLabCurrentTeams();

  if (next.mode === 'scenarioRoster') {
    next.actualTeam = '';
    next.snapshotId = '';
    return next;
  }

  if (next.mode === 'snapshot') {
    var snapshot = snapshots.find(function (item) { return item.id === next.snapshotId; }) || null;
    if (!snapshot) {
      if (snapshots[0]) next.snapshotId = snapshots[0].id;
      else {
        next.mode = 'actualTeam';
        next.snapshotId = '';
      }
    }
    next.actualTeam = '';
    return next;
  }

  next.snapshotId = '';
  next.actualTeam = valueLabCanonicalTeamName(next.actualTeam, teams);
  var teamExists = next.actualTeam && teams.some(function (team) { return valueLabNorm(team) === valueLabNorm(next.actualTeam); });
  if (!teamExists) next.actualTeam = valueLabSuggestedActualTeam(teams);
  return next;
}

function valueLabGetSelection() {
  var store = valueLabState.store || valueLabLoadStore();
  var key = valueLabSeasonStoreKey();
  var raw = store.selectedBySeason && store.selectedBySeason[key] ? store.selectedBySeason[key] : valueLabDefaultSelection();
  var next = valueLabReconcileSelection(raw);
  var changed = JSON.stringify(valueLabNormalizeSelection(raw)) !== JSON.stringify(next);
  valueLabState.selection = next;
  if (changed) {
    store.selectedBySeason[key] = next;
    valueLabWriteStore(store);
  }
  return valueLabClone(next);
}

function valueLabSetSelection(selection) {
  var store = valueLabState.store || valueLabLoadStore();
  var next = valueLabReconcileSelection(selection);
  store.selectedBySeason[valueLabSeasonStoreKey()] = next;
  valueLabState.selection = next;
  valueLabWriteStore(store);
  return valueLabClone(next);
}

function valueLabAutoName(bundle) {
  bundle = bundle || valueLabGetSourceBundle();
  if (bundle && bundle.actualTeam) return bundle.actualTeam + ' Value View';
  var players = Array.isArray(bundle && bundle.players) ? bundle.players : [];
  if (!players.length) return valueLabCurrentLeague() + ' ' + valueLabCurrentSeason() + ' Snapshot';
  var detected = valueLabDetectBaseTeam(players);
  if (detected && detected.team) return detected.team + (bundle.sourceType === 'scenarioRoster' ? ' Scenario View' : ' Value View');
  var now = new Date();
  return valueLabCurrentLeague() + ' Custom ' + (now.getMonth() + 1) + '/' + now.getDate();
}

function valueLabSetStatus(message, tone) {
  if (!valueLabSourceStatusEl) return;
  if (valueLabState.statusTimer) {
    clearTimeout(valueLabState.statusTimer);
    valueLabState.statusTimer = null;
  }
  valueLabSourceStatusEl.textContent = message || '';
  valueLabSourceStatusEl.className = 'valueLabStatus' + (tone ? ' ' + tone : '');
  if (message) {
    valueLabState.statusTimer = setTimeout(function () {
      if (!valueLabSourceStatusEl) return;
      valueLabSourceStatusEl.textContent = '';
      valueLabSourceStatusEl.className = 'valueLabStatus';
    }, 2800);
  }
}
function valueLabBuildActualTeamBundle(teamName) {
  var canonical = valueLabCanonicalTeamName(teamName);
  var players = canonical
    ? valueLabCurrentPool().filter(function (row) {
        return valueLabNorm(row.Team) === valueLabNorm(canonical);
      }).map(function (row) {
        return valueLabClone(row);
      })
    : [];
  return {
    id: canonical ? ('actual::' + valueLabNorm(canonical)) : '__actual__',
    mode: 'actualTeam',
    sourceType: 'actualTeam',
    label: canonical ? (canonical + ' Actual Team') : 'Actual Team',
    actualTeam: canonical,
    players: players,
    snapshot: null,
  };
}

function valueLabGetSourceBundle() {
  var selection = valueLabGetSelection();
  if (selection.mode === 'scenarioRoster') {
    return {
      id: '__scenario__',
      mode: 'scenarioRoster',
      sourceType: 'scenarioRoster',
      label: 'Current Scenario Roster',
      actualTeam: '',
      players: valueLabClone(Array.isArray(tbRoster) ? tbRoster : []),
      snapshot: null,
    };
  }
  if (selection.mode === 'snapshot') {
    var selectedSnapshot = valueLabGetSelectedSnapshot(selection);
    if (!selectedSnapshot) {
      return {
        id: '__snapshot__',
        mode: 'snapshot',
        sourceType: 'snapshot',
        label: 'Saved Snapshot',
        actualTeam: '',
        players: [],
        snapshot: null,
      };
    }
    return {
      id: selectedSnapshot.id,
      mode: 'snapshot',
      sourceType: selectedSnapshot.sourceType || 'scenarioRoster',
      label: selectedSnapshot.name,
      actualTeam: selectedSnapshot.actualTeam || '',
      players: valueLabResolveSnapshotPlayers(selectedSnapshot),
      snapshot: selectedSnapshot,
    };
  }
  return valueLabBuildActualTeamBundle(selection.actualTeam);
}

function valueLabRenderSourceControls() {
  if (!valueLabModeSelectEl || !valueLabSourceSelectEl || !valueLabActualTeamSelectEl) return;
  valueLabLoadStore();
  var selection = valueLabGetSelection();
  var snapshots = valueLabSnapshotsForCurrentSeason();
  var teams = valueLabCurrentTeams();
  var teamHubTeam = valueLabCanonicalTeamName(valueLabGetTeamHubTeam(), teams);

  valueLabModeSelectEl.innerHTML = [
    '<option value="actualTeam">Actual Team</option>',
    '<option value="scenarioRoster">Scenario Roster</option>',
    '<option value="snapshot">Saved Snapshot</option>'
  ].join('');
  valueLabModeSelectEl.value = selection.mode;

  var teamHtml = '<option value="">— Select a team —</option>' + teams.map(function (team) {
    return '<option value="' + team.replace(/"/g, '&quot;') + '">' + team + '</option>';
  }).join('');
  valueLabActualTeamSelectEl.innerHTML = teamHtml;
  valueLabActualTeamSelectEl.value = selection.actualTeam || '';
  valueLabActualTeamSelectEl.disabled = selection.mode !== 'actualTeam';

  var snapshotHtml = '<option value="">— Select a snapshot —</option>';
  snapshots.forEach(function (snapshot) {
    var stamp = snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    snapshotHtml += '<option value="' + snapshot.id + '">' + snapshot.name + (stamp ? ' - ' + stamp : '') + '</option>';
  });
  valueLabSourceSelectEl.innerHTML = snapshotHtml;
  valueLabSourceSelectEl.value = selection.snapshotId || '';
  valueLabSourceSelectEl.disabled = selection.mode !== 'snapshot';

  var bundle = valueLabGetSourceBundle();
  if (valueLabSnapshotNameEl) {
    var selectedSnapshot = valueLabGetSelectedSnapshot(selection);
    valueLabSnapshotNameEl.value = selectedSnapshot ? selectedSnapshot.name : valueLabAutoName(bundle);
  }
  if (valueLabDeleteBtnEl) {
    valueLabDeleteBtnEl.disabled = !(selection.mode === 'snapshot' && !!valueLabGetSelectedSnapshot(selection));
  }
  if (valueLabUseTeamHubBtnEl) {
    valueLabUseTeamHubBtnEl.disabled = !teamHubTeam;
    valueLabUseTeamHubBtnEl.title = teamHubTeam ? ('Pull ' + teamHubTeam + ' into Value Lab') : 'Load a team in Team Hub first.';
  }
  if (valueLabSourceMetaEl) {
    var scenarioCount = Array.isArray(tbRoster) ? tbRoster.length : 0;
    var text = 'Actual-team options: ' + teams.length + '. ';
    text += 'Scenario roster: ' + scenarioCount + ' player' + (scenarioCount === 1 ? '' : 's') + '. ';
    text += 'Snapshots: ' + snapshots.length + ' for ' + valueLabCurrentLeague() + ' ' + valueLabCurrentSeason() + '. ';
    text += (typeof authIsGuest === 'function' && authIsGuest())
      ? 'Saved locally in this browser.'
      : 'Phase 1.5 saves locally for now.';
    if (teamHubTeam) text += ' Team Hub loaded: ' + teamHubTeam + '.';
    valueLabSourceMetaEl.textContent = text;
  }
}

function valueLabPosLabel(row) {
  var raw = String(row && (row.Position || row.Pos || '')).trim();
  if (raw) return raw;
  if (typeof tbPosGroup === 'function') return tbPosGroup(row) === 'guard' ? 'Guard' : 'Big';
  return '—';
}

function valueLabPosGroup(row) {
  if (typeof tbPosGroup === 'function') return tbPosGroup(row);
  var posText = String(row && (row.Position || row.Pos || '')).toLowerCase();
  return posText.indexOf('g') >= 0 ? 'guard' : 'big';
}

function valueLabClassBucket(row) {
  var raw = String(row && (row.Class || row.Yr || row.Year || '')).trim().toLowerCase();
  if (!raw) return 'Unknown';
  if (raw.indexOf('grad') >= 0) return 'Sr+';
  if (raw.startsWith('fr') || raw.indexOf('fresh') >= 0) return 'Fr';
  if (raw.startsWith('so') || raw.indexOf('soph') >= 0) return 'So';
  if (raw.startsWith('jr') || raw.indexOf('jun') >= 0) return 'Jr';
  if (raw.startsWith('sr') || raw.indexOf('sen') >= 0 || raw.startsWith('gr')) return 'Sr+';
  return String(row.Class || row.Yr || row.Year || 'Unknown');
}

function valueLabAggregateBy(players, keyFn) {
  var map = {};
  (players || []).forEach(function (row) {
    var label = keyFn(row) || 'Unknown';
    if (!map[label]) map[label] = { label: label, count: 0, spend: 0, perf: 0 };
    map[label].count += 1;
    map[label].spend += valueLabNum(row.ActualValuation_calc) || 0;
    map[label].perf += valueLabNum(row.Score) || 0;
  });
  return Object.keys(map).map(function (label) {
    var item = map[label];
    item.avgPerf = item.count ? (item.perf / item.count) : NaN;
    return item;
  }).sort(function (a, b) {
    return b.spend - a.spend;
  });
}

function valueLabDetectBaseTeam(players) {
  var grouped = valueLabAggregateBy(players, function (row) {
    return row.Team || 'Unknown';
  }).filter(function (item) {
    return item.label && item.label !== 'Unknown';
  });
  if (!grouped.length) return null;
  var top = grouped[0];
  var rosterSize = (players || []).length || 0;
  var ratio = rosterSize ? (top.count / rosterSize) : 0;
  if (top.count >= Math.max(5, Math.ceil(rosterSize * 0.45))) {
    return { team: top.label, count: top.count, ratio: ratio, uniqueTeams: grouped.length };
  }
  return { team: '', count: top.count, ratio: ratio, uniqueTeams: grouped.length };
}

function valueLabBuildTeamContext(players, bundle) {
  if (bundle && bundle.actualTeam) {
    var explicitTeam = bundle.actualTeam;
    var count = (players || []).filter(function (row) {
      return valueLabNorm(row.Team) === valueLabNorm(explicitTeam);
    }).length;
    var grouped = valueLabAggregateBy(players, function (row) { return row.Team || 'Unknown'; }).filter(function (item) {
      return item.label && item.label !== 'Unknown';
    });
    return {
      team: explicitTeam,
      count: count || (players || []).length,
      ratio: players && players.length ? ((count || players.length) / players.length) : 0,
      uniqueTeams: grouped.length || (explicitTeam ? 1 : 0),
      explicit: true,
    };
  }
  var detected = valueLabDetectBaseTeam(players) || { team: '', count: 0, ratio: 0, uniqueTeams: 0 };
  detected.explicit = false;
  return detected;
}

function valueLabAverage(list) {
  var nums = (list || []).filter(Number.isFinite);
  if (!nums.length) return NaN;
  return nums.reduce(function (sum, value) { return sum + value; }, 0) / nums.length;
}

function valueLabClamp(value, min, max) {
  if (!Number.isFinite(value)) return value;
  if (Number.isFinite(min) && value < min) return min;
  if (Number.isFinite(max) && value > max) return max;
  return value;
}

function valueLabEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function valueLabFitLine(rows, getX, getY) {
  var pts = (rows || []).map(function (row) {
    return { x: valueLabNum(getX(row)), y: valueLabNum(getY(row)) };
  }).filter(function (pt) {
    return Number.isFinite(pt.x) && Number.isFinite(pt.y);
  });
  if (pts.length < 2) return null;
  var meanX = pts.reduce(function (sum, pt) { return sum + pt.x; }, 0) / pts.length;
  var meanY = pts.reduce(function (sum, pt) { return sum + pt.y; }, 0) / pts.length;
  var num = 0;
  var den = 0;
  pts.forEach(function (pt) {
    num += (pt.x - meanX) * (pt.y - meanY);
    den += Math.pow(pt.x - meanX, 2);
  });
  var slope = den ? (num / den) : 0;
  var intercept = meanY - (slope * meanX);
  return {
    count: pts.length,
    slope: slope,
    intercept: intercept,
    predict: function (x) {
      x = valueLabNum(x);
      if (!Number.isFinite(x)) return NaN;
      return intercept + (slope * x);
    }
  };
}

function valueLabBuildTeamProjectionRows() {
  var rowsByTeam = {};
  valueLabCurrentPool().forEach(function (row) {
    var team = String(row && row.Team || '').trim();
    if (!team) return;
    var key = valueLabNorm(team);
    if (!rowsByTeam[key]) {
      rowsByTeam[key] = {
        team: team,
        count: 0,
        perfSum: 0,
        spendSum: 0,
        modelSum: 0,
      };
    }
    var bucket = rowsByTeam[key];
    var perf = valueLabDecisionPerf(row);
    var modelValue = valueLabDecisionMedianValue(row);
    bucket.count += 1;
    if (Number.isFinite(perf)) bucket.perfSum += perf;
    if (Number.isFinite(modelValue)) {
      bucket.spendSum += modelValue;
      bucket.modelSum += modelValue;
    }
  });
  return Object.keys(rowsByTeam).map(function (key) {
    var item = rowsByTeam[key];
    var rating = (typeof teamRatings !== 'undefined' && teamRatings) ? (teamRatings[key] || null) : null;
    item.avgPerf = item.count ? (item.perfSum / item.count) : NaN;
    item.avgSpend = item.count ? (item.spendSum / item.count) : NaN;
    item.adjEM = rating && Number.isFinite(valueLabNum(rating.adjEM)) ? valueLabNum(rating.adjEM) : NaN;
    item.rank = rating && Number.isFinite(valueLabNum(rating.rank)) ? valueLabNum(rating.rank) : null;
    return item;
  }).filter(function (item) {
    return item.count >= 5 && Number.isFinite(item.avgPerf);
  });
}

function valueLabFindProjectionRow(rows, teamName) {
  var target = valueLabNorm(teamName);
  return (rows || []).find(function (row) { return valueLabNorm(row.team) === target; }) || null;
}

function valueLabDecisionPerf(row) {
  var projection = valueLabNum(row && row.ProjectionPerf_calc);
  if (Number.isFinite(projection)) return projection;
  return valueLabNum(row && row.Score);
}

function valueLabDecisionFloorPerf(row) {
  var floorPerf = valueLabNum(row && row.ProjectionFloorPerf_calc);
  if (Number.isFinite(floorPerf)) return floorPerf;
  return valueLabDecisionPerf(row);
}

function valueLabDecisionCeilingPerf(row) {
  var ceilingPerf = valueLabNum(row && row.ProjectionCeilingPerf_calc);
  if (Number.isFinite(ceilingPerf)) return ceilingPerf;
  return valueLabDecisionPerf(row);
}

function valueLabDecisionMedianValue(row) {
  var medianValue = valueLabNum(row && row.ProjectionMedianValue_calc);
  if (Number.isFinite(medianValue)) return medianValue;
  return valueLabNum(row && row.ActualValuation_calc);
}

function valueLabDecisionFloorValue(row) {
  var floorValue = valueLabNum(row && row.ProjectionFloorValue_calc);
  if (Number.isFinite(floorValue)) return floorValue;
  return valueLabDecisionMedianValue(row);
}

function valueLabDecisionCeilingValue(row) {
  var ceilingValue = valueLabNum(row && row.ProjectionCeilingValue_calc);
  if (Number.isFinite(ceilingValue)) return ceilingValue;
  return valueLabDecisionMedianValue(row);
}

function valueLabConfidenceLabel(value) {
  if (typeof projectionConfidenceLabel === 'function') return projectionConfidenceLabel(value);
  value = valueLabNum(value);
  if (!Number.isFinite(value)) return 'Unknown';
  if (value >= 0.82) return 'High';
  if (value >= 0.64) return 'Moderate';
  return 'Low';
}

function valueLabConfidenceTone(value) {
  if (typeof projectionConfidenceTone === 'function') return projectionConfidenceTone(value);
  value = valueLabNum(value);
  if (!Number.isFinite(value)) return 'neutral';
  if (value >= 0.82) return 'good';
  if (value >= 0.64) return 'warn';
  return 'bad';
}

function valueLabRiskLabel(row) {
  return String((row && row.ProjectionMedicalRiskLabel_calc) || 'Low');
}

function valueLabRiskTone(label) {
  if (typeof projectionMedicalRiskTone === 'function') return projectionMedicalRiskTone(label);
  return label === 'High' ? 'bad' : (label === 'Moderate' ? 'warn' : 'good');
}

function valueLabRangeText(floorValue, medianValue, ceilingValue) {
  if (!Number.isFinite(valueLabNum(medianValue))) return '—';
  if (!Number.isFinite(valueLabNum(floorValue)) || !Number.isFinite(valueLabNum(ceilingValue))) return valueLabFmtMoney(medianValue);
  return valueLabFmtMoney(floorValue) + ' / ' + valueLabFmtMoney(medianValue) + ' / ' + valueLabFmtMoney(ceilingValue);
}

function valueLabExpectedPerfAtSpend(row, peerPools) {
  var spendBasis = Number.isFinite(valueLabNum(row.actualSpend)) ? valueLabNum(row.actualSpend) : valueLabDecisionMedianValue(row);
  if (!Number.isFinite(spendBasis)) return NaN;
  var posGroup = valueLabPosGroup(row);
  var peers = (peerPools[posGroup] && peerPools[posGroup].length ? peerPools[posGroup] : peerPools.all || []).filter(function (peer) {
    var peerVal = valueLabDecisionMedianValue(peer);
    var peerScore = valueLabDecisionPerf(peer);
    return Number.isFinite(peerVal) && Number.isFinite(peerScore) && valueLabPlayerKey(peer) !== valueLabPlayerKey(row);
  });
  if (!peers.length) return NaN;
  peers.sort(function (a, b) {
    return Math.abs((valueLabDecisionMedianValue(a) || 0) - spendBasis) - Math.abs((valueLabDecisionMedianValue(b) || 0) - spendBasis);
  });
  return valueLabAverage(peers.slice(0, Math.min(60, peers.length)).map(function (peer) {
    return valueLabDecisionPerf(peer);
  }));
}

function valueLabRoiCall(player, richSpendCutoff) {
  var surplus = valueLabNum(player.surplus);
  var spendBasis = Number.isFinite(valueLabNum(player.actualSpend)) ? valueLabNum(player.actualSpend) : valueLabNum(player.ActualValuation_calc);
  if (!Number.isFinite(surplus)) return { label: 'Fair', tone: 'neutral' };
  if (surplus >= 6) {
    if (Number.isFinite(spendBasis) && Number.isFinite(richSpendCutoff) && spendBasis >= richSpendCutoff) {
      return { label: 'Premium worth it', tone: 'good' };
    }
    return { label: 'Steal', tone: 'good' };
  }
  if (surplus >= 2.5) return { label: 'Value', tone: 'good' };
  if (surplus <= -6) return { label: 'Overpay', tone: 'bad' };
  if (surplus <= -2.5) return { label: 'Rich', tone: 'warn' };
  return { label: 'Fair', tone: 'neutral' };
}

function valueLabRoiTooltipText(row) {
  if (!row) return 'ROI Call: quick value verdict based on performance versus expected return at this price tier.';
  var surplus = valueLabNum(row.surplus);
  var suffix = Number.isFinite(surplus)
    ? (' Current surplus: ' + (surplus >= 0 ? '+' : '') + surplus.toFixed(1) + ' Perf versus expected return.')
    : '';
  switch (String(row.roiLabel || '')) {
    case 'Steal':
      return 'Steal: this player is outperforming the expected return for this spend tier by 6 or more Perf points.' + suffix;
    case 'Premium worth it':
      return 'Premium worth it: this is an expensive/top-tier spend, but the player is still outperforming that premium price by 6 or more Perf points.' + suffix;
    case 'Value':
      return 'Value: this player is beating the expected return for this spend tier by at least 2.5 Perf points.' + suffix;
    case 'Rich':
      return 'Rich: the contract looks a little expensive right now, with performance 2.5 to 5.9 Perf points below expected return.' + suffix;
    case 'Overpay':
      return 'Overpay: the contract is materially overpriced right now, with performance 6 or more Perf points below expected return.' + suffix;
    default:
      return 'Fair: this player is performing roughly in line with the expected return for this spend tier.' + suffix;
  }
}

function valueLabEmptyMessage(bundle) {
  bundle = bundle || valueLabGetSourceBundle();
  if (bundle.mode === 'actualTeam') {
    if (!bundle.actualTeam) return 'Choose an actual team or pull one in from Team Hub to start the executive view.';
    return 'No players were found for ' + bundle.actualTeam + ' in the current ' + valueLabCurrentLeague() + ' ' + valueLabCurrentSeason() + ' data.';
  }
  if (bundle.mode === 'snapshot') {
    return 'Select one of your saved snapshots to reload that roster investment view.';
  }
  return 'Build a scenario roster in Team Builder, then come here to evaluate how efficient that spend profile looks.';
}
function valueLabBuildAnalysis(bundle) {
  bundle = bundle || valueLabGetSourceBundle();
  var players = (bundle.players || []).map(function (row) { return valueLabClone(row); }).filter(Boolean);
  if (!players.length) {
    return {
      empty: true,
      emptyMessage: valueLabEmptyMessage(bundle),
      bundle: bundle,
      players: [],
    };
  }

  var currentPool = valueLabCurrentPool();
  var peerPools = {
    all: currentPool.slice(),
    guard: currentPool.filter(function (row) { return valueLabPosGroup(row) === 'guard'; }),
    big: currentPool.filter(function (row) { return valueLabPosGroup(row) !== 'guard'; }),
  };

  var poolValSorted = currentPool.map(function (row) { return valueLabDecisionMedianValue(row); }).filter(Number.isFinite).sort(function (a, b) { return a - b; });
  var poolScoreSorted = currentPool.map(function (row) { return valueLabDecisionPerf(row); }).filter(Number.isFinite).sort(function (a, b) { return a - b; });
  var richSpendCutoff = typeof percentileInc === 'function' ? percentileInc(poolValSorted, 0.8) : NaN;
  var budgetTotal = valueLabNum(bundle.valueCase && bundle.valueCase.payload ? bundle.valueCase.payload.budgetTotal : null);

  var detailed = players.map(function (row) {
    var valuation = valueLabDecisionMedianValue(row);
    var floorValue = valueLabDecisionFloorValue(row);
    var ceilingValue = valueLabDecisionCeilingValue(row);
    var actualSpend = valueLabNum(row.actualSpend);
    var spendBasis = Number.isFinite(actualSpend) ? actualSpend : valuation;
    var perf = valueLabDecisionPerf(row);
    var productionPerf = valueLabNum(row.Score);
    var floorPerf = valueLabDecisionFloorPerf(row);
    var ceilingPerf = valueLabDecisionCeilingPerf(row);
    var expectedPerf = valueLabExpectedPerfAtSpend(row, peerPools);
    var surplus = (Number.isFinite(perf) && Number.isFinite(expectedPerf)) ? (perf - expectedPerf) : NaN;
    var delta = (Number.isFinite(actualSpend) && Number.isFinite(valuation)) ? (actualSpend - valuation) : NaN;
    var roi = valueLabRoiCall({ surplus: surplus, ActualValuation_calc: valuation, actualSpend: actualSpend }, richSpendCutoff);
    var confidence = valueLabNum(row.ProjectionConfidence_calc);
    var riskLabel = valueLabRiskLabel(row);
    var projectionDelta = valueLabNum(row.ProjectionDelta_calc);
    var manualBoost = valueLabNum(row.ProjectionManualBoost_calc);
    var projectionLed = Number.isFinite(projectionDelta) && projectionDelta > 0 && (
      !Number.isFinite(confidence) || confidence < 0.82 || riskLabel !== 'Low' || (Number.isFinite(manualBoost) && manualBoost > 0)
    );
    return Object.assign({}, row, {
      valuation: valuation,
      floorValue: floorValue,
      ceilingValue: ceilingValue,
      actualSpend: actualSpend,
      spendBasis: spendBasis,
      delta: delta,
      deltaPct: (Number.isFinite(delta) && Number.isFinite(valuation) && valuation > 0) ? (delta / valuation) : NaN,
      perf: perf,
      productionPerf: productionPerf,
      floorPerf: floorPerf,
      ceilingPerf: ceilingPerf,
      expectedPerf: expectedPerf,
      surplus: surplus,
      roiLabel: roi.label,
      roiTone: roi.tone,
      classBucket: valueLabClassBucket(row),
      posLabel: valueLabPosLabel(row),
      confidence: confidence,
      confidenceLabel: valueLabConfidenceLabel(confidence),
      confidenceTone: valueLabConfidenceTone(confidence),
      riskLabel: riskLabel,
      riskTone: valueLabRiskTone(riskLabel),
      projectionDelta: projectionDelta,
      projectionLed: projectionLed,
      manualBoost: manualBoost,
      projectionNote: String(row.ProjectionReasonSummary_calc || ''),
      scoutNote: String(row.ProjectionScoutNote_calc || ''),
    });
  }).sort(function (a, b) {
    return (b.spendBasis || b.valuation || 0) - (a.spendBasis || a.valuation || 0);
  });

  var valuations = detailed.map(function (row) { return row.valuation; }).filter(Number.isFinite);
  var floorValues = detailed.map(function (row) { return row.floorValue; }).filter(Number.isFinite);
  var ceilingValues = detailed.map(function (row) { return row.ceilingValue; }).filter(Number.isFinite);
  var actualSpends = detailed.map(function (row) { return row.actualSpend; }).filter(Number.isFinite);
  var spendBasisValues = detailed.map(function (row) { return row.spendBasis; }).filter(Number.isFinite);
  var scores = detailed.map(function (row) { return row.perf; }).filter(Number.isFinite);
  var productionScores = detailed.map(function (row) { return row.productionPerf; }).filter(Number.isFinite);
  var floorScores = detailed.map(function (row) { return row.floorPerf; }).filter(Number.isFinite);
  var ceilingScores = detailed.map(function (row) { return row.ceilingPerf; }).filter(Number.isFinite);
  var totalSpend = spendBasisValues.reduce(function (sum, value) { return sum + value; }, 0);
  var totalModelValue = valuations.reduce(function (sum, value) { return sum + value; }, 0);
  var totalFloorValue = floorValues.reduce(function (sum, value) { return sum + value; }, 0);
  var totalCeilingValue = ceilingValues.reduce(function (sum, value) { return sum + value; }, 0);
  var totalActualSpend = actualSpends.reduce(function (sum, value) { return sum + value; }, 0);
  var totalPerf = scores.reduce(function (sum, value) { return sum + value; }, 0);
  var avgPerf = valueLabAverage(scores);
  var avgSpend = detailed.length ? (totalSpend / detailed.length) : NaN;
  var spendPct = (typeof percentileRank === 'function' && Number.isFinite(avgSpend) && poolValSorted.length)
    ? percentileRank(poolValSorted, avgSpend) * 100
    : NaN;
  var perfPct = (typeof percentileRank === 'function' && Number.isFinite(avgPerf) && poolScoreSorted.length)
    ? percentileRank(poolScoreSorted, avgPerf) * 100
    : NaN;
  var topSpend = valuations.slice().sort(function (a, b) { return b - a; }).slice(0, 3).reduce(function (sum, value) { return sum + value; }, 0);
  var topActualSpend = spendBasisValues.slice().sort(function (a, b) { return b - a; }).slice(0, 3).reduce(function (sum, value) { return sum + value; }, 0);
  var topPerf = scores.slice().sort(function (a, b) { return b - a; }).slice(0, Math.min(5, scores.length));
  var topValueCalls = detailed.filter(function (row) { return Number.isFinite(row.surplus); }).slice().sort(function (a, b) {
    return (b.surplus || 0) - (a.surplus || 0);
  });
  var teamContext = valueLabBuildTeamContext(detailed, bundle);
  var enteredContracts = detailed.filter(function (row) { return Number.isFinite(row.actualSpend); }).length;
  var avgDelta = valueLabAverage(detailed.map(function (row) { return row.delta; }));
  var overMarketCount = detailed.filter(function (row) { return Number.isFinite(row.delta) && row.delta > 0; }).length;
  var underMarketCount = detailed.filter(function (row) { return Number.isFinite(row.delta) && row.delta < 0; }).length;
  var overMarketTotal = detailed.reduce(function (sum, row) { return sum + (Number.isFinite(row.delta) && row.delta > 0 ? row.delta : 0); }, 0);
  var underMarketTotal = detailed.reduce(function (sum, row) { return sum + (Number.isFinite(row.delta) && row.delta < 0 ? Math.abs(row.delta) : 0); }, 0);
  var budgetRemaining = Number.isFinite(budgetTotal) ? (budgetTotal - totalActualSpend) : NaN;
  var confidenceNum = 0;
  var confidenceDen = 0;
  detailed.forEach(function (row) {
    if (!Number.isFinite(row.confidence)) return;
    var weight = Number.isFinite(row.spendBasis) && row.spendBasis > 0 ? row.spendBasis : (Number.isFinite(row.valuation) && row.valuation > 0 ? row.valuation : 1);
    confidenceNum += row.confidence * weight;
    confidenceDen += weight;
  });
  var caseConfidence = confidenceDen > 0 ? (confidenceNum / confidenceDen) : valueLabAverage(detailed.map(function (row) { return row.confidence; }));
  var projectionBetCount = detailed.filter(function (row) { return row.projectionLed; }).length;
  var elevatedMedicalCount = detailed.filter(function (row) { return row.riskLabel && row.riskLabel !== 'Low'; }).length;
  var highMedicalCount = detailed.filter(function (row) { return row.riskLabel === 'High'; }).length;

  return {
    empty: false,
    bundle: bundle,
    sourceMode: bundle.mode,
    sourceType: bundle.sourceType,
    players: detailed,
    rosterSize: detailed.length,
    budgetTotal: budgetTotal,
    totalSpend: totalSpend,
    totalModelValue: totalModelValue,
    totalFloorValue: totalFloorValue,
    totalCeilingValue: totalCeilingValue,
    totalActualSpend: totalActualSpend,
    avgSpend: avgSpend,
    avgPerf: avgPerf,
    avgProductionPerf: valueLabAverage(productionScores),
    avgFloorPerf: valueLabAverage(floorScores),
    avgCeilingPerf: valueLabAverage(ceilingScores),
    corePerf: valueLabAverage(topPerf),
    perfPer100k: totalSpend > 0 ? (totalPerf / totalSpend) * 100000 : NaN,
    perfPer100kActual: totalActualSpend > 0 ? (totalPerf / totalActualSpend) * 100000 : NaN,
    top3SpendShare: totalSpend > 0 ? (topActualSpend / totalSpend) : 0,
    spendPct: spendPct,
    perfPct: perfPct,
    roiGap: (Number.isFinite(spendPct) && Number.isFinite(perfPct)) ? (perfPct - spendPct) : NaN,
    avgSurplus: valueLabAverage(detailed.map(function (row) { return row.surplus; })),
    avgDelta: avgDelta,
    enteredContracts: enteredContracts,
    contractCoverage: detailed.length ? (enteredContracts / detailed.length) : 0,
    overMarketCount: overMarketCount,
    underMarketCount: underMarketCount,
    overMarketTotal: overMarketTotal,
    underMarketTotal: underMarketTotal,
    budgetRemaining: budgetRemaining,
    caseConfidence: caseConfidence,
    caseConfidenceLabel: valueLabConfidenceLabel(caseConfidence),
    caseConfidenceTone: valueLabConfidenceTone(caseConfidence),
    projectionBetCount: projectionBetCount,
    elevatedMedicalCount: elevatedMedicalCount,
    highMedicalCount: highMedicalCount,
    dominantTeam: teamContext,
    breakdowns: {
      position: valueLabAggregateBy(detailed.map(function (row) { return Object.assign({}, row, { ActualValuation_calc: row.spendBasis }); }), function (row) { return valueLabPosGroup(row) === 'guard' ? 'Guards' : 'Bigs'; }),
      classYear: valueLabAggregateBy(detailed.map(function (row) { return Object.assign({}, row, { ActualValuation_calc: row.spendBasis }); }), function (row) { return row.classBucket; }),
      team: valueLabAggregateBy(detailed.map(function (row) { return Object.assign({}, row, { ActualValuation_calc: row.spendBasis }); }), function (row) { return row.Team || 'Unknown'; }).slice(0, 6),
    },
    steals: topValueCalls.slice(0, 3),
    overpays: topValueCalls.slice().reverse().slice(0, 3),
  };
}

function valueLabBuildInsightList(analysis) {
  if (!analysis || analysis.empty) return [];
  var items = [];
  var teamCtx = analysis.dominantTeam;
  if (teamCtx && teamCtx.team) items.push('Team context is anchored to ' + teamCtx.team + ', so Value Lab can connect this case back to real outcomes instead of only roster theory.');
  items.push('Projection mode is locked to median for director decisions. Case confidence reads ' + analysis.caseConfidenceLabel + ' (' + Math.round((analysis.caseConfidence || 0) * 100) + '%), with ' + analysis.projectionBetCount + ' projection-led bet' + (analysis.projectionBetCount === 1 ? '' : 's') + ' and ' + analysis.elevatedMedicalCount + ' player' + (analysis.elevatedMedicalCount === 1 ? '' : 's') + ' carrying elevated medical risk.');
  items.push('Contract coverage is ' + analysis.enteredContracts + '/' + analysis.rosterSize + ' players (' + Math.round((analysis.contractCoverage || 0) * 100) + '%). Any player without actual spend still falls back to model value for planning math.');
  if (Number.isFinite(analysis.budgetTotal)) {
    items.push('Case budget is ' + valueLabFmtMoney(analysis.budgetTotal) + '. With ' + valueLabFmtMoney(analysis.totalActualSpend) + ' entered in real contracts, you are ' + (Number.isFinite(analysis.budgetRemaining) && analysis.budgetRemaining < 0 ? 'over budget by ' + valueLabFmtMoney(Math.abs(analysis.budgetRemaining)) : 'sitting on ' + valueLabFmtMoney(analysis.budgetRemaining) + ' in remaining room') + '.');
  } else {
    items.push('Set a case budget to track real leeway, overage risk, and how much room is left for open roster spots.');
  }
  if (Number.isFinite(analysis.spendPct) && Number.isFinite(analysis.perfPct)) {
    items.push('Spend sits around the ' + Math.round(analysis.spendPct) + 'th percentile, while average Perf sits around the ' + Math.round(analysis.perfPct) + 'th percentile (' + (analysis.roiGap >= 0 ? '+' : '') + Math.round(analysis.roiGap) + ' ROI gap).');
  }
  if (analysis.enteredContracts > 0) {
    var avgDeltaText = Number.isFinite(analysis.avgDelta)
      ? ((analysis.avgDelta >= 0 ? '+' : '-') + valueLabFmtMoney(Math.abs(analysis.avgDelta)))
      : 'n/a';
    items.push('Actual contracts are running ' + avgDeltaText + ' per player versus model on average. Over-market commitments total ' + valueLabFmtMoney(analysis.overMarketTotal) + ', while under-market wins total ' + valueLabFmtMoney(analysis.underMarketTotal) + '.');
  }
  items.push('Top 3 players account for ' + Math.round((analysis.top3SpendShare || 0) * 100) + '% of total spend, which reads as ' + (((analysis.top3SpendShare || 0) >= 0.5) ? 'top-heavy' : 'fairly balanced') + '.');
  if (analysis.highMedicalCount) {
    items.push('Medical exposure check: ' + analysis.highMedicalCount + ' player' + (analysis.highMedicalCount === 1 ? '' : 's') + ' sit in the high-risk tier, so the floor case needs to be respected in retention and portal planning.');
  }
  if (analysis.steals && analysis.steals[0]) {
    items.push('Best value signal: ' + analysis.steals[0].Player + ' is running ' + ((analysis.steals[0].surplus >= 0 ? '+' : '') + analysis.steals[0].surplus.toFixed(1)) + ' Perf vs peers at the same pay band.');
  }
  if (analysis.overpays && analysis.overpays[0]) {
    items.push('Biggest premium risk: ' + analysis.overpays[0].Player + ' is ' + analysis.overpays[0].surplus.toFixed(1) + ' Perf below the expected return for that valuation.');
  }
  return items;
}

function valueLabRecordFromGames(games, teamName) {
  var wins = 0;
  var losses = 0;
  var normalizedTeam = valueLabNorm(teamName);
  (games || []).forEach(function (game) {
    var homeName = valueLabNorm(game.homeTeam || '');
    var awayName = valueLabNorm(game.awayTeam || '');
    var isHome = homeName === normalizedTeam;
    var isAway = awayName === normalizedTeam;
    if (!isHome && !isAway) return;
    var teamScore = isHome ? valueLabNum(game.homePoints) : valueLabNum(game.awayPoints);
    var oppScore = isHome ? valueLabNum(game.awayPoints) : valueLabNum(game.homePoints);
    if (!Number.isFinite(teamScore) || !Number.isFinite(oppScore)) return;
    if (teamScore > oppScore) wins += 1;
    else losses += 1;
  });
  return { wins: wins, losses: losses, played: wins + losses };
}

function valueLabWinProb(teamAdjEm, oppAdjEm, locAdj) {
  if (!Number.isFinite(teamAdjEm) || !Number.isFinite(oppAdjEm)) return NaN;
  var diff = (teamAdjEm - oppAdjEm) + (Number.isFinite(locAdj) ? locAdj : 0);
  return 1 / (1 + Math.exp(-diff / 8.5));
}

function valueLabProjectScheduleWins(games, teamName, caseAdjEM, baselineAdjEM) {
  var out = {
    totalGames: 0,
    actualWins: 0,
    actualLosses: 0,
    completedGames: 0,
    ratedGames: 0,
    baselineFullWins: NaN,
    caseFullWins: NaN,
  };
  if (!Array.isArray(games) || !games.length || !teamName) return out;

  var tn = valueLabNorm(teamName);
  var baselineFull = 0;
  var caseFull = 0;
  var ratedGames = 0;

  games.forEach(function (game) {
    var homeName = valueLabNorm(game.homeTeam || '');
    var awayName = valueLabNorm(game.awayTeam || '');
    var isHome = homeName === tn;
    var isAway = awayName === tn;
    if (!isHome && !isAway) return;

    out.totalGames += 1;
    if (game.completed) {
      out.completedGames += 1;
      var teamScore = isHome ? valueLabNum(game.homePoints) : valueLabNum(game.awayPoints);
      var oppScore = isHome ? valueLabNum(game.awayPoints) : valueLabNum(game.homePoints);
      if (Number.isFinite(teamScore) && Number.isFinite(oppScore)) {
        if (teamScore > oppScore) out.actualWins += 1;
        else out.actualLosses += 1;
      }
    }

    var oppName = isHome ? (game.awayTeam || '') : (game.homeTeam || '');
    var oppRating = (typeof teamRatings !== 'undefined' && teamRatings) ? (teamRatings[valueLabNorm(oppName)] || null) : null;
    if (!oppRating || !Number.isFinite(valueLabNum(oppRating.adjEM))) return;
    var locAdj = isHome ? 2.8 : -2.8;
    var baseProb = valueLabWinProb(baselineAdjEM, valueLabNum(oppRating.adjEM), locAdj);
    var caseProb = valueLabWinProb(caseAdjEM, valueLabNum(oppRating.adjEM), locAdj);
    if (!Number.isFinite(baseProb) || !Number.isFinite(caseProb)) return;
    ratedGames += 1;
    baselineFull += baseProb;
    caseFull += caseProb;
  });

  out.ratedGames = ratedGames;
  out.baselineFullWins = ratedGames ? baselineFull : NaN;
  out.caseFullWins = ratedGames ? caseFull : NaN;
  return out;
}

function valueLabFmtWins(value) {
  value = valueLabNum(value);
  return Number.isFinite(value) ? value.toFixed(1) : '—';
}

async function valueLabBuildOutcome(analysis) {
  var teamCtx = analysis && analysis.dominantTeam;
  if (!analysis || analysis.empty || !teamCtx || !teamCtx.team) {
    return {
      hasTeamContext: false,
      note: 'No single team context was detected, so Value Lab cannot replay a real schedule yet. Import an actual team or keep most of one real roster together if you want projected wins and spend-per-win.',
    };
  }

  var season = valueLabCurrentSeason();
  var teamName = teamCtx.team;
  if (typeof loadTeamRatings === 'function') {
    try { await loadTeamRatings(season); } catch (_) {}
  }
  var rating = (typeof teamRatings !== 'undefined' && teamRatings)
    ? (teamRatings[valueLabNorm(teamName)] || null)
    : null;

  var gamesData = null;
  if (typeof loadGamesForTeam === 'function') {
    try { gamesData = await loadGamesForTeam(teamName, season); } catch (_) { gamesData = null; }
  }

  var games = gamesData && Array.isArray(gamesData.games) ? gamesData.games : [];
  var actualRecord = valueLabRecordFromGames(games, teamName);
  var teamRows = valueLabBuildTeamProjectionRows();
  var perfModel = valueLabFitLine(
    teamRows.filter(function (row) { return Number.isFinite(row.adjEM); }),
    function (row) { return row.avgPerf; },
    function (row) { return row.adjEM; }
  );
  var baselineRow = valueLabFindProjectionRow(teamRows, teamName);
  var baselineAdjEM = rating && Number.isFinite(valueLabNum(rating.adjEM))
    ? valueLabNum(rating.adjEM)
    : (baselineRow && perfModel ? perfModel.predict(baselineRow.avgPerf) : NaN);
  var projectedAdjEM = NaN;
  if (Number.isFinite(baselineAdjEM) && baselineRow && perfModel && Number.isFinite(analysis.avgPerf)) {
    projectedAdjEM = baselineAdjEM + ((analysis.avgPerf - baselineRow.avgPerf) * perfModel.slope);
  } else if (perfModel && Number.isFinite(analysis.avgPerf)) {
    projectedAdjEM = perfModel.predict(analysis.avgPerf);
  }
  projectedAdjEM = valueLabClamp(projectedAdjEM, -25, 35);

  var floorAdjEM = NaN;
  if (Number.isFinite(baselineAdjEM) && baselineRow && perfModel && Number.isFinite(analysis.avgFloorPerf)) {
    floorAdjEM = baselineAdjEM + ((analysis.avgFloorPerf - baselineRow.avgPerf) * perfModel.slope);
  } else if (perfModel && Number.isFinite(analysis.avgFloorPerf)) {
    floorAdjEM = perfModel.predict(analysis.avgFloorPerf);
  }
  floorAdjEM = valueLabClamp(floorAdjEM, -25, 35);

  var ceilingAdjEM = NaN;
  if (Number.isFinite(baselineAdjEM) && baselineRow && perfModel && Number.isFinite(analysis.avgCeilingPerf)) {
    ceilingAdjEM = baselineAdjEM + ((analysis.avgCeilingPerf - baselineRow.avgPerf) * perfModel.slope);
  } else if (perfModel && Number.isFinite(analysis.avgCeilingPerf)) {
    ceilingAdjEM = perfModel.predict(analysis.avgCeilingPerf);
  }
  ceilingAdjEM = valueLabClamp(ceilingAdjEM, -25, 35);

  var scheduleProjection = valueLabProjectScheduleWins(games, teamName, projectedAdjEM, baselineAdjEM);
  var floorScheduleProjection = valueLabProjectScheduleWins(games, teamName, floorAdjEM, baselineAdjEM);
  var ceilingScheduleProjection = valueLabProjectScheduleWins(games, teamName, ceilingAdjEM, baselineAdjEM);
  var projectedWinDelta = (Number.isFinite(scheduleProjection.caseFullWins) && Number.isFinite(scheduleProjection.baselineFullWins))
    ? (scheduleProjection.caseFullWins - scheduleProjection.baselineFullWins)
    : NaN;
  var spendBasis = Number.isFinite(analysis.totalActualSpend) && analysis.totalActualSpend > 0 ? analysis.totalActualSpend : analysis.totalSpend;
  var spendPerProjectedWin = (Number.isFinite(spendBasis) && Number.isFinite(scheduleProjection.caseFullWins) && scheduleProjection.caseFullWins > 0)
    ? (spendBasis / scheduleProjection.caseFullWins)
    : NaN;
  var spendPerActualWin = (Number.isFinite(spendBasis) && actualRecord.wins > 0)
    ? (spendBasis / actualRecord.wins)
    : NaN;
  var confidence = 'Low';
  if (analysis.caseConfidence >= 0.82 && teamCtx.ratio >= 0.7 && analysis.contractCoverage >= 0.65) confidence = 'High';
  else if (analysis.caseConfidence >= 0.64 || teamCtx.ratio >= 0.5 || analysis.contractCoverage >= 0.4) confidence = 'Medium';

  var note = [];
  if (Number.isFinite(scheduleProjection.caseFullWins) && Number.isFinite(scheduleProjection.baselineFullWins)) {
    note.push('Projection uses the detected team schedule and maps roster projection performance onto team adjEM using current-season team/player trends.');
  } else {
    note.push('Schedule was found, but there was not enough rating coverage to project wins cleanly.');
  }
  if (Number.isFinite(floorScheduleProjection.caseFullWins) || Number.isFinite(ceilingScheduleProjection.caseFullWins)) {
    note.push('Floor and ceiling outcomes are driven by player-level projection confidence and medical-risk bands rather than a single-point estimate.');
  }
  if (analysis.sourceType === 'teamImport' || analysis.sourceType === 'teamHub') note.push('Because this case mirrors one real team, the outcome view is closer to a true executive review.');
  if (analysis.sourceType === 'teamBuilder' || analysis.sourceType === 'manual') note.push('Because this case is custom, projected wins should be treated as directional planning rather than a literal forecast.');

  return {
    hasTeamContext: true,
    teamName: teamName,
    detectedShare: teamCtx.count + '/' + analysis.rosterSize,
    rating: rating,
    actualWins: actualRecord.wins,
    actualLosses: actualRecord.losses,
    gamesPlayed: actualRecord.played,
    baselineAdjEM: baselineAdjEM,
    floorAdjEM: floorAdjEM,
    projectedAdjEM: projectedAdjEM,
    ceilingAdjEM: ceilingAdjEM,
    baselineFullWins: scheduleProjection.baselineFullWins,
    floorProjectedWins: floorScheduleProjection.caseFullWins,
    projectedFullWins: scheduleProjection.caseFullWins,
    ceilingProjectedWins: ceilingScheduleProjection.caseFullWins,
    projectedWinDelta: projectedWinDelta,
    ratedGames: scheduleProjection.ratedGames,
    totalGames: scheduleProjection.totalGames,
    spendPerProjectedWin: spendPerProjectedWin,
    spendPerActualWin: spendPerActualWin,
    spendBasis: spendBasis,
    confidence: confidence,
    note: note.join(' '),
  };
}
function valueLabRenderKpis(analysis) {
  if (!valueLabKpisEl) return;
  var items = (!analysis || analysis.empty)
    ? [
        ['Players', '—'],
        ['Projection Mode', '—'],
        ['Case Confidence', '—'],
        ['Model value', '—'],
        ['Actual spend', '—'],
        ['Budget left', '—'],
        ['Contract coverage', '—'],
        ['Avg perf', '—'],
        ['Perf / $100k', '—']
      ]
    : [
        ['Players', String(analysis.rosterSize)],
      ['Projection Mode', 'Median'],
      ['Case Confidence', analysis.caseConfidenceLabel + (Number.isFinite(analysis.caseConfidence) ? (' (' + Math.round(analysis.caseConfidence * 100) + '%)') : '')],
        ['Model value', valueLabFmtMoney(analysis.totalModelValue)],
        ['Actual spend', analysis.enteredContracts ? valueLabFmtMoney(analysis.totalActualSpend) : '—'],
        ['Budget left', Number.isFinite(analysis.budgetRemaining) ? valueLabFmtMoney(analysis.budgetRemaining) : '—'],
        ['Contract coverage', analysis.enteredContracts + '/' + analysis.rosterSize],
        ['Avg perf', Number.isFinite(analysis.avgPerf) ? analysis.avgPerf.toFixed(1) : '—'],
        ['Perf / $100k', Number.isFinite(analysis.perfPer100kActual) ? analysis.perfPer100kActual.toFixed(1) : (Number.isFinite(analysis.perfPer100k) ? analysis.perfPer100k.toFixed(1) + '*' : '—')]
      ];
  valueLabKpisEl.innerHTML = items.map(function (item) {
    return '<span class="pill"><span>' + item[0] + '</span><b>' + item[1] + '</b></span>';
  }).join('');
}

function valueLabRenderInsights(analysis) {
  if (!valueLabInsightsEl) return;
  if (!analysis || analysis.empty) {
    valueLabInsightsEl.innerHTML = '<div class="valueLabEmpty">' + ((analysis && analysis.emptyMessage) || 'Choose a Value Lab source to get spend, value, and efficiency takeaways.') + '</div>';
    return;
  }
  var items = valueLabBuildInsightList(analysis);
  valueLabInsightsEl.innerHTML = items.map(function (item) {
    return '<div class="valueLabInsightItem"><span class="valueLabInsightDot"></span><div>' + item + '</div></div>';
  }).join('');
}

function valueLabRenderOutcome(analysis) {
  if (!valueLabOutcomeEl) return;
  if (!analysis || analysis.empty) {
    valueLabOutcomeEl.innerHTML = '<div class="valueLabEmpty">' + ((analysis && analysis.emptyMessage) || 'Import a real team or build a case to see projected wins, efficiency, and spend-per-win here.') + '</div>';
    return;
  }
  if (!analysis.outcome) {
    valueLabOutcomeEl.innerHTML = '<div class="valueLabLoading">Projecting case outcome and spend efficiency...</div>';
    return;
  }
  var outcome = analysis.outcome;
  if (!outcome.hasTeamContext) {
    valueLabOutcomeEl.innerHTML = '<div class="valueLabEmpty">' + (outcome.note || 'No team context available.') + '</div>';
    return;
  }
  var recordText = outcome.gamesPlayed ? (outcome.actualWins + '-' + outcome.actualLosses) : '—';

  var pills = [
    '<span class="pill"><span>Detected team</span><b>' + outcome.teamName + '</b></span>',
    '<span class="pill"><span>Actual record</span><b>' + recordText + '</b></span>',
    '<span class="pill"><span>Baseline wins</span><b>' + valueLabFmtWins(outcome.baselineFullWins) + '</b></span>',
    '<span class="pill"><span>Case projected wins</span><b>' + valueLabFmtWins(outcome.projectedFullWins) + '</b></span>',
    '<span class="pill"><span>Delta vs baseline</span><b>' + (Number.isFinite(outcome.projectedWinDelta) ? ((outcome.projectedWinDelta >= 0 ? '+' : '') + outcome.projectedWinDelta.toFixed(1)) : '—') + '</b></span>'
  ];
  if (Number.isFinite(outcome.spendPerProjectedWin)) {
    pills.push('<span class="pill"><span>Spend / projected win</span><b>' + valueLabFmtMoney(outcome.spendPerProjectedWin) + '</b></span>');
  }
  if (Number.isFinite(outcome.spendPerActualWin)) {
    pills.push('<span class="pill"><span>Spend / actual win</span><b>' + valueLabFmtMoney(outcome.spendPerActualWin) + '</b></span>');
  }
  if (Number.isFinite(outcome.projectedAdjEM)) {
    pills.push('<span class="pill"><span>Projected AdjEM</span><b>' + ((outcome.projectedAdjEM >= 0 ? '+' : '') + outcome.projectedAdjEM.toFixed(1)) + '</b></span>');
  }

  var outcomeBand = '';
  if (Number.isFinite(outcome.floorProjectedWins) || Number.isFinite(outcome.projectedFullWins) || Number.isFinite(outcome.ceilingProjectedWins)) {
    outcomeBand = '<div class="valueLabOutcomeBand">' +
      '<div class="valueLabOutcomeRangeCard valueLabOutcomeRangeCard--bad"><small>Floor Outcome</small><strong>' + valueLabFmtWins(outcome.floorProjectedWins) + '</strong><span>risk case</span></div>' +
      '<div class="valueLabOutcomeRangeCard valueLabOutcomeRangeCard--warn"><small>Median Outcome</small><strong>' + valueLabFmtWins(outcome.projectedFullWins) + '</strong><span>operating case</span></div>' +
      '<div class="valueLabOutcomeRangeCard valueLabOutcomeRangeCard--good"><small>Ceiling Outcome</small><strong>' + valueLabFmtWins(outcome.ceilingProjectedWins) + '</strong><span>fully healthy case</span></div>' +
    '</div>';
  }

  valueLabOutcomeEl.innerHTML =
    '<div class="kpis valueLabMiniKpis">' + pills.join('') + '</div>' +
    outcomeBand +
    '<div class="valueLabOutcomeNote">' +
      '<div><strong>Roster share:</strong> ' + outcome.detectedShare + ' slots from ' + outcome.teamName + ' · confidence ' + outcome.confidence + '.</div>' +
      '<div><strong>Business read:</strong> This case currently spends ' + valueLabFmtMoney(outcome.spendBasis) + ' using actual contracts when entered, otherwise projection median value, so the spend-per-win view stays actionable even before every deal is filled in.</div>' +
      '<div><strong>Projection logic:</strong> ' + outcome.note + '</div>' +
     '</div>';
}

function valueLabGetComparisonMetrics(currentAnalysis, compareAnalysis) {
  var currentOutcome = currentAnalysis && currentAnalysis.outcome ? currentAnalysis.outcome : {};
  var compareOutcome = compareAnalysis && compareAnalysis.outcome ? compareAnalysis.outcome : {};
  return [
    {
      label: 'Effective spend',
      current: currentAnalysis ? currentAnalysis.totalSpend : NaN,
      compare: compareAnalysis ? compareAnalysis.totalSpend : NaN,
      format: valueLabFmtMoney,
      deltaFormat: valueLabFmtMoney,
      preferLower: true,
    },
    {
      label: 'Budget left',
      current: currentAnalysis ? currentAnalysis.budgetRemaining : NaN,
      compare: compareAnalysis ? compareAnalysis.budgetRemaining : NaN,
      format: valueLabFmtMoney,
      deltaFormat: valueLabFmtMoney,
      preferLower: false,
    },
    {
      label: 'Avg perf',
      current: currentAnalysis ? currentAnalysis.avgPerf : NaN,
      compare: compareAnalysis ? compareAnalysis.avgPerf : NaN,
      format: function (value) { return Number.isFinite(valueLabNum(value)) ? valueLabNum(value).toFixed(1) : '—'; },
      deltaFormat: function (value) { return Number.isFinite(valueLabNum(value)) ? valueLabNum(value).toFixed(1) + ' perf' : '—'; },
      preferLower: false,
    },
    {
      label: 'Perf / $100k',
      current: currentAnalysis ? (Number.isFinite(currentAnalysis.perfPer100kActual) ? currentAnalysis.perfPer100kActual : currentAnalysis.perfPer100k) : NaN,
      compare: compareAnalysis ? (Number.isFinite(compareAnalysis.perfPer100kActual) ? compareAnalysis.perfPer100kActual : compareAnalysis.perfPer100k) : NaN,
      format: function (value) { return Number.isFinite(valueLabNum(value)) ? valueLabNum(value).toFixed(1) : '—'; },
      deltaFormat: function (value) { return Number.isFinite(valueLabNum(value)) ? valueLabNum(value).toFixed(1) + ' perf/$100k' : '—'; },
      preferLower: false,
    },
    {
      label: 'ROI gap',
      current: currentAnalysis ? currentAnalysis.roiGap : NaN,
      compare: compareAnalysis ? compareAnalysis.roiGap : NaN,
      format: function (value) { return Number.isFinite(valueLabNum(value)) ? valueLabFmtSigned(Math.round(valueLabNum(value)), null, ' pts') : '—'; },
      deltaFormat: function (value) { return Number.isFinite(valueLabNum(value)) ? Math.round(valueLabNum(value)) + ' pts' : '—'; },
      preferLower: false,
    },
    {
      label: 'Projected wins',
      current: currentOutcome.projectedFullWins,
      compare: compareOutcome.projectedFullWins,
      format: valueLabFmtWins,
      deltaFormat: function (value) { return Number.isFinite(valueLabNum(value)) ? valueLabNum(value).toFixed(1) + ' wins' : '—'; },
      preferLower: false,
    },
    {
      label: 'Floor wins',
      current: currentOutcome.floorProjectedWins,
      compare: compareOutcome.floorProjectedWins,
      format: valueLabFmtWins,
      deltaFormat: function (value) { return Number.isFinite(valueLabNum(value)) ? valueLabNum(value).toFixed(1) + ' wins' : '—'; },
      preferLower: false,
    },
    {
      label: 'Spend / projected win',
      current: currentOutcome.spendPerProjectedWin,
      compare: compareOutcome.spendPerProjectedWin,
      format: valueLabFmtMoney,
      deltaFormat: valueLabFmtMoney,
      preferLower: true,
    },
    {
      label: 'Case confidence',
      current: currentAnalysis ? (currentAnalysis.caseConfidence || NaN) * 100 : NaN,
      compare: compareAnalysis ? (compareAnalysis.caseConfidence || NaN) * 100 : NaN,
      format: function (value) { return Number.isFinite(valueLabNum(value)) ? Math.round(valueLabNum(value)) + '%' : '—'; },
      deltaFormat: function (value) { return Number.isFinite(valueLabNum(value)) ? Math.round(valueLabNum(value)) + ' pts' : '—'; },
      preferLower: false,
    },
    {
      label: 'Top-3 spend share',
      current: currentAnalysis ? ((currentAnalysis.top3SpendShare || 0) * 100) : NaN,
      compare: compareAnalysis ? ((compareAnalysis.top3SpendShare || 0) * 100) : NaN,
      format: function (value) { return Number.isFinite(valueLabNum(value)) ? valueLabNum(value).toFixed(0) + '%' : '—'; },
      deltaFormat: function (value) { return Number.isFinite(valueLabNum(value)) ? valueLabNum(value).toFixed(0) + '%' : '—'; },
      preferLower: true,
    },
  ].filter(function (metric) {
    return Number.isFinite(valueLabNum(metric.current)) || Number.isFinite(valueLabNum(metric.compare));
  });
}

function valueLabBuildCompareRecommendation(currentAnalysis, compareAnalysis) {
  currentAnalysis = currentAnalysis && !currentAnalysis.empty ? currentAnalysis : null;
  compareAnalysis = compareAnalysis && !compareAnalysis.empty ? compareAnalysis : null;
  if (!currentAnalysis || !compareAnalysis) return null;

  var currentName = (currentAnalysis.bundle && currentAnalysis.bundle.label) || 'Active Case';
  var compareName = (compareAnalysis.bundle && compareAnalysis.bundle.label) || 'Compare Case';
  var scores = { active: 0, compare: 0 };
  var reasons = [];

  function addSignal(opts) {
    var currentValue = valueLabNum(opts.current);
    var compareValue = valueLabNum(opts.compare);
    if (!Number.isFinite(currentValue) || !Number.isFinite(compareValue)) return;
    var diff = currentValue - compareValue;
    if (!Number.isFinite(diff) || Math.abs(diff) < (opts.threshold || 0)) return;
    var winner = opts.preferLower ? (diff < 0 ? 'active' : 'compare') : (diff > 0 ? 'active' : 'compare');
    scores[winner] += opts.weight || 1;
    reasons.push({
      winner: winner,
      weight: opts.weight || 1,
      text: typeof opts.text === 'function' ? opts.text(Math.abs(diff), winner) : String(opts.text || ''),
    });
  }

  addSignal({
    current: currentAnalysis.outcome && currentAnalysis.outcome.projectedFullWins,
    compare: compareAnalysis.outcome && compareAnalysis.outcome.projectedFullWins,
    threshold: 0.4,
    weight: 4,
    preferLower: false,
    text: function (diff, winner) {
      return (winner === 'active' ? currentName : compareName) + ' projects ' + diff.toFixed(1) + ' more wins on the same schedule context.';
    }
  });
  addSignal({
    current: currentAnalysis.outcome && currentAnalysis.outcome.floorProjectedWins,
    compare: compareAnalysis.outcome && compareAnalysis.outcome.floorProjectedWins,
    threshold: 0.35,
    weight: 3,
    preferLower: false,
    text: function (diff, winner) {
      return (winner === 'active' ? currentName : compareName) + ' holds the stronger downside case by about ' + diff.toFixed(1) + ' floor wins.';
    }
  });
  addSignal({
    current: currentAnalysis.outcome && currentAnalysis.outcome.spendPerProjectedWin,
    compare: compareAnalysis.outcome && compareAnalysis.outcome.spendPerProjectedWin,
    threshold: 15000,
    weight: 3,
    preferLower: true,
    text: function (diff, winner) {
      return (winner === 'active' ? currentName : compareName) + ' buys each projected win about ' + valueLabFmtMoney(diff) + ' cheaper.';
    }
  });
  addSignal({
    current: Number.isFinite(currentAnalysis.perfPer100kActual) ? currentAnalysis.perfPer100kActual : currentAnalysis.perfPer100k,
    compare: Number.isFinite(compareAnalysis.perfPer100kActual) ? compareAnalysis.perfPer100kActual : compareAnalysis.perfPer100k,
    threshold: 0.8,
    weight: 3,
    preferLower: false,
    text: function (diff, winner) {
      return (winner === 'active' ? currentName : compareName) + ' is returning ' + diff.toFixed(1) + ' more perf per $100k.';
    }
  });
  addSignal({
    current: currentAnalysis.budgetRemaining,
    compare: compareAnalysis.budgetRemaining,
    threshold: 25000,
    weight: 2,
    preferLower: false,
    text: function (diff, winner) {
      return (winner === 'active' ? currentName : compareName) + ' keeps ' + valueLabFmtMoney(diff) + ' more budget room for retention or portal moves.';
    }
  });
  addSignal({
    current: currentAnalysis.roiGap,
    compare: compareAnalysis.roiGap,
    threshold: 4,
    weight: 2,
    preferLower: false,
    text: function (diff, winner) {
      return (winner === 'active' ? currentName : compareName) + ' is outperforming its spend tier by ' + Math.round(diff) + ' more ROI-gap points.';
    }
  });
  addSignal({
    current: (currentAnalysis.top3SpendShare || 0) * 100,
    compare: (compareAnalysis.top3SpendShare || 0) * 100,
    threshold: 5,
    weight: 1,
    preferLower: true,
    text: function (diff, winner) {
      return (winner === 'active' ? currentName : compareName) + ' spreads spend more evenly with a top-3 concentration gap of ' + diff.toFixed(0) + ' points.';
    }
  });
  addSignal({
    current: currentAnalysis.caseConfidence,
    compare: compareAnalysis.caseConfidence,
    threshold: 0.06,
    weight: 2,
    preferLower: false,
    text: function (diff, winner) {
      return (winner === 'active' ? currentName : compareName) + ' carries about ' + Math.round(diff * 100) + ' points more case confidence across its rotation bets.';
    }
  });
  addSignal({
    current: currentAnalysis.contractCoverage,
    compare: compareAnalysis.contractCoverage,
    threshold: 0.15,
    weight: 1,
    preferLower: false,
    text: function (diff, winner) {
      return (winner === 'active' ? currentName : compareName) + ' has more real-contract coverage locked in (' + Math.round(diff * 100) + ' pts more coverage).';
    }
  });

  if (Number.isFinite(currentAnalysis.budgetRemaining) && Number.isFinite(compareAnalysis.budgetRemaining) &&
      currentAnalysis.budgetRemaining >= 0 && compareAnalysis.budgetRemaining < 0) {
    scores.active += 2;
    reasons.push({
      winner: 'active',
      weight: 2,
      text: currentName + ' stays under budget while ' + compareName + ' is over by ' + valueLabFmtMoney(Math.abs(compareAnalysis.budgetRemaining)) + '.',
    });
  } else if (Number.isFinite(currentAnalysis.budgetRemaining) && Number.isFinite(compareAnalysis.budgetRemaining) &&
      compareAnalysis.budgetRemaining >= 0 && currentAnalysis.budgetRemaining < 0) {
    scores.compare += 2;
    reasons.push({
      winner: 'compare',
      weight: 2,
      text: compareName + ' stays under budget while ' + currentName + ' is over by ' + valueLabFmtMoney(Math.abs(currentAnalysis.budgetRemaining)) + '.',
    });
  }

  var winner = 'tie';
  if (scores.active > scores.compare) winner = 'active';
  else if (scores.compare > scores.active) winner = 'compare';

  if (!reasons.length || Math.abs(scores.active - scores.compare) <= 1) {
    winner = 'tie';
  }

  var winnerName = winner === 'active' ? currentName : compareName;
  var winnerReasons = reasons.filter(function (item) { return item.winner === winner; }).sort(function (a, b) {
    return (b.weight || 0) - (a.weight || 0);
  });
  var counterReason = reasons.filter(function (item) { return item.winner !== winner; }).sort(function (a, b) {
    return (b.weight || 0) - (a.weight || 0);
  })[0];

  if (winner === 'tie') {
    return {
      winner: 'tie',
      tone: 'neutral',
      pillLabel: 'Too close to call',
      title: 'Both cases are reading close enough that the decision is still open.',
      summary: 'Neither build has built a decisive enough edge yet. Use staff fit preference, negotiation confidence, or one more roster move to break the tie.',
      reasons: reasons.slice(0, 3),
      score: scores,
    };
  }

  var summaryParts = winnerReasons.slice(0, 2).map(function (item) { return item.text; });
  if (counterReason) summaryParts.push('Main caution: ' + counterReason.text);
  return {
    winner: winner,
    tone: winner === 'active' ? 'good' : 'warn',
    pillLabel: winner === 'active' ? 'Favor active case' : 'Favor compare case',
    title: winnerName + ' is the cleaner director-side bet right now.',
    summary: summaryParts.join(' '),
    reasons: winnerReasons.slice(0, 3),
    score: scores,
  };
}

function valueLabRenderComparison(currentAnalysis, compareAnalysis) {
  if (!valueLabCompareSummaryEl) return;
  if (!currentAnalysis || currentAnalysis.empty) {
    valueLabCompareSummaryEl.innerHTML = '<div class="valueLabEmpty">Build or load a case first, then choose another saved case to compare against.</div>';
    return;
  }
  if (!compareAnalysis || compareAnalysis.empty) {
    valueLabCompareSummaryEl.innerHTML = '<div class="valueLabEmpty">Choose a saved case in <b>Compare against</b> to see side-by-side spend, outcome, and roster tradeoffs.</div>';
    return;
  }

  var rosterDiff = valueLabBuildCompareRosterDiff(currentAnalysis, compareAnalysis);
  var metrics = valueLabGetComparisonMetrics(currentAnalysis, compareAnalysis);
  var recommendation = valueLabBuildCompareRecommendation(currentAnalysis, compareAnalysis);

  var metricsHtml = metrics.map(function (metric) {
    var currentVal = valueLabNum(metric.current);
    var compareVal = valueLabNum(metric.compare);
    var delta = (Number.isFinite(currentVal) && Number.isFinite(compareVal)) ? (currentVal - compareVal) : NaN;
    var tone = valueLabCompareMetricTone(delta, !!metric.preferLower);
    var direction = Number.isFinite(delta)
      ? (delta === 0 ? 'No gap' : (delta > 0 ? 'Active case +' : 'Compare case +') + (metric.deltaFormat ? metric.deltaFormat(Math.abs(delta)) : metric.format(Math.abs(delta))))
      : 'Awaiting full data';
    return '<div class="valueLabCompareMetric valueLabCompareMetric--' + tone + '">' +
      '<div class="valueLabCompareMetricLabel">' + metric.label + '</div>' +
      '<div class="valueLabCompareMetricValues">' +
        '<div class="valueLabCompareMetricCase"><span>Active</span><strong>' + metric.format(metric.current) + '</strong></div>' +
        '<div class="valueLabCompareMetricCase"><span>Compare</span><strong>' + metric.format(metric.compare) + '</strong></div>' +
      '</div>' +
      '<div class="valueLabCompareMetricDelta">' + direction + '</div>' +
    '</div>';
  }).join('');

  function nameChips(rows) {
    rows = Array.isArray(rows) ? rows : [];
    if (!rows.length) return '<div class="valueLabEmpty" style="min-height:auto">No unique players.</div>';
    return '<div class="valueLabCompareChipRow">' + rows.slice(0, 6).map(function (row) {
      var spend = Number.isFinite(row.actualSpend) ? row.actualSpend : row.valuation;
      return '<span class="valueLabCompareChip"><b>' + valueLabEsc(row.Player || 'Player') + '</b><small>' +
        valueLabEsc(row.Team || '—') + ' · ' + valueLabFmtMoney(spend) + '</small></span>';
    }).join('') + '</div>';
  }

  var takeaways = valueLabBuildCompareTakeaways(currentAnalysis, compareAnalysis, rosterDiff);
  var recommendationHtml = recommendation
    ? '<div class="valueLabCompareRecommendation valueLabCompareRecommendation--' + recommendation.tone + '">' +
        '<div>' +
          '<div class="valueLabCompareRecommendationEyebrow">Recommendation</div>' +
          '<div class="valueLabCompareRecommendationTitle">' + valueLabEsc(recommendation.title) + '</div>' +
          '<div class="valueLabCompareRecommendationText">' + valueLabEsc(recommendation.summary) + '</div>' +
        '</div>' +
        '<div class="valueLabCompareRecommendationPill valueLabCompareRecommendationPill--' + recommendation.tone + '">' + valueLabEsc(recommendation.pillLabel) + '</div>' +
      '</div>'
    : '';

  valueLabCompareSummaryEl.innerHTML =
    recommendationHtml +
    '<div class="valueLabCompareTop">' +
      '<div class="valueLabCompareCase valueLabCompareCase--active"><small>Active case</small><strong>' + valueLabEsc(currentAnalysis.bundle.label || 'Active Case') + '</strong><span>' + currentAnalysis.rosterSize + ' players · ' + valueLabFmtMoney(currentAnalysis.totalSpend) + ' effective spend</span></div>' +
      '<div class="valueLabCompareVs">vs</div>' +
      '<div class="valueLabCompareCase"><small>Compare case</small><strong>' + valueLabEsc(compareAnalysis.bundle.label || 'Compare Case') + '</strong><span>' + compareAnalysis.rosterSize + ' players · ' + valueLabFmtMoney(compareAnalysis.totalSpend) + ' effective spend</span></div>' +
    '</div>' +
    '<div class="valueLabCompareMetricGrid">' + metricsHtml + '</div>' +
    '<div class="valueLabCompareRosterMeta">' +
      '<span class="pill"><span>Shared players</span><b>' + (rosterDiff ? rosterDiff.sharedCount : 0) + '</b></span>' +
      '<span class="pill"><span>Only in active</span><b>' + (rosterDiff ? rosterDiff.onlyCurrent.length : 0) + '</b></span>' +
      '<span class="pill"><span>Only in compare</span><b>' + (rosterDiff ? rosterDiff.onlyCompare.length : 0) + '</b></span>' +
    '</div>' +
    '<div class="valueLabCompareSplit">' +
      '<div class="valueLabCompareBlock"><div class="valueLabMiniTitle">Only in active case</div>' + nameChips(rosterDiff ? rosterDiff.onlyCurrent : []) + '</div>' +
      '<div class="valueLabCompareBlock"><div class="valueLabMiniTitle">Only in compare case</div>' + nameChips(rosterDiff ? rosterDiff.onlyCompare : []) + '</div>' +
    '</div>' +
    '<div class="valueLabCompareTakeaways">' + takeaways.map(function (note) {
      return '<div class="valueLabInsightItem"><span class="valueLabInsightDot"></span><div>' + note + '</div></div>';
    }).join('') + '</div>';
}

function valueLabAIMarkdownToHtml(text) {
  text = String(text || '').trim();
  if (!text) return '<div class="valueLabEmpty">No AI brief returned.</div>';
  if (typeof _thFmtDeepText === 'function') return _thFmtDeepText(text);
  return '<div class="portalAIMarkdown">' +
    valueLabEsc(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/^##\s+(.*)$/gm, '<h4>$1</h4>')
      .replace(/^###\s+(.*)$/gm, '<h5 style="margin:8px 0 4px;font-size:12px;color:var(--accent)">$1</h5>')
      .replace(/^[-*]\s+(.*)$/gm, '<div class="portalAIBullet">• $1</div>')
      .replace(/^(\d+)\.\s+(.*)$/gm, '<div class="portalAIBullet"><b>$1.</b> $2</div>')
      .replace(/\n{2,}/g, '<br><br>') +
    '</div>';
}

function valueLabSetAIStatus(message) {
  if (valueLabAIStatusEl) valueLabAIStatusEl.textContent = message || '';
}

function valueLabBuildBriefSignature() {
  var currentCase = valueLabEnsureCurrentCaseV2();
  return [
    valueLabCurrentLeague(),
    valueLabCurrentSeason(),
    currentCase && currentCase.id ? String(currentCase.id) : '__draft__',
    String(valueLabCaseState.compareCaseId || '')
  ].join('::');
}

function valueLabGetFreshBriefRaw() {
  if (!valueLabAIOutputEl || !valueLabAIOutputEl.dataset) return '';
  if ((valueLabAIOutputEl.dataset.lastSignature || '') !== valueLabBuildBriefSignature()) return '';
  return String(valueLabAIOutputEl.dataset.lastRaw || '').trim();
}

function valueLabBuildAICaseContext(analysis, portalCtx) {
  analysis = analysis && !analysis.empty ? analysis : null;
  if (!analysis) return null;
  portalCtx = portalCtx || { targets: [], note: '' };
  var outcome = analysis.outcome ? Object.assign({}, analysis.outcome) : null;
  if (outcome) {
    outcome.spendBasis = valueLabMoneyForAI(outcome.spendBasis);
    outcome.spendPerProjectedWin = valueLabMoneyForAI(outcome.spendPerProjectedWin);
    outcome.spendPerActualWin = valueLabMoneyForAI(outcome.spendPerActualWin);
    outcome.floorProjectedWins = valueLabNum(outcome.floorProjectedWins);
    outcome.projectedFullWins = valueLabNum(outcome.projectedFullWins);
    outcome.ceilingProjectedWins = valueLabNum(outcome.ceilingProjectedWins);
  }
  return {
    caseName: analysis.bundle && analysis.bundle.label ? analysis.bundle.label : 'Value Lab Case',
    league: valueLabCurrentLeague(),
    season: valueLabCurrentSeason(),
    sourceType: analysis.bundle && analysis.bundle.sourceType ? analysis.bundle.sourceType : 'manual',
    budgetTotal: valueLabMoneyForAI(analysis.budgetTotal),
    budgetRemaining: valueLabMoneyForAI(analysis.budgetRemaining),
    totalModelValue: valueLabMoneyForAI(analysis.totalModelValue),
    totalActualSpend: valueLabMoneyForAI(analysis.totalActualSpend),
    effectiveSpend: valueLabMoneyForAI(analysis.totalSpend),
    contractCoverage: analysis.contractCoverage,
    projectionMode: 'Median',
    caseConfidence: {
      pct: Number.isFinite(analysis.caseConfidence) ? Math.round(analysis.caseConfidence * 100) : null,
      label: analysis.caseConfidenceLabel,
    },
    projectionBetCount: analysis.projectionBetCount,
    elevatedMedicalCount: analysis.elevatedMedicalCount,
    avgPerf: analysis.avgPerf,
    perfPer100kActual: analysis.perfPer100kActual,
    perfPer100k: analysis.perfPer100k,
    avgDelta: valueLabMoneyForAI(analysis.avgDelta),
    overMarketTotal: valueLabMoneyForAI(analysis.overMarketTotal),
    underMarketTotal: valueLabMoneyForAI(analysis.underMarketTotal),
    top3SpendShare: analysis.top3SpendShare,
    outcome: outcome,
    topValueWins: (analysis.steals || []).slice(0, 4).map(function (row) {
      return {
        player: row.Player,
        team: row.Team,
        perf: row.perf,
        productionPerf: row.productionPerf,
        surplus: row.surplus,
        modelValue: valueLabMoneyForAI(row.valuation),
        floorValue: valueLabMoneyForAI(row.floorValue),
        ceilingValue: valueLabMoneyForAI(row.ceilingValue),
        actualSpend: valueLabMoneyForAI(row.actualSpend),
        confidence: row.confidenceLabel,
        medicalRisk: row.riskLabel,
      };
    }),
    topRisks: (analysis.overpays || []).slice(0, 4).map(function (row) {
      return {
        player: row.Player,
        team: row.Team,
        perf: row.perf,
        productionPerf: row.productionPerf,
        surplus: row.surplus,
        modelValue: valueLabMoneyForAI(row.valuation),
        floorValue: valueLabMoneyForAI(row.floorValue),
        ceilingValue: valueLabMoneyForAI(row.ceilingValue),
        actualSpend: valueLabMoneyForAI(row.actualSpend),
        confidence: row.confidenceLabel,
        medicalRisk: row.riskLabel,
      };
    }),
    roster: analysis.players.map(function (row) {
      return {
        player: row.Player,
        team: row.Team,
        position: row.posLabel,
        classLabel: row.classBucket,
        production: row.productionPerf,
        projection: row.perf,
        expectedPerf: row.expectedPerf,
        floorValue: valueLabMoneyForAI(row.floorValue),
        medianValue: valueLabMoneyForAI(row.valuation),
        ceilingValue: valueLabMoneyForAI(row.ceilingValue),
        actualSpend: valueLabMoneyForAI(row.actualSpend),
        delta: valueLabMoneyForAI(row.delta),
        confidence: row.confidenceLabel,
        confidencePct: Number.isFinite(row.confidence) ? Math.round(row.confidence * 100) : null,
        medicalRisk: row.riskLabel,
        projectionBet: !!row.projectionLed,
        scoutBoost: row.manualBoost,
        scoutNote: row.scoutNote || '',
        projectionNote: row.projectionNote || '',
        roiCall: row.roiLabel,
      };
    }),
    portalTargets: (portalCtx.targets || []).slice(0, 6).map(function (target) {
      return {
        player: target.name,
        fromTeam: target.fromTeam,
        position: target.position,
        classLabel: target.classLabel,
        projection: target.perf,
        floorValue: valueLabMoneyForAI(target.floorValue),
        medianValue: valueLabMoneyForAI(target.valuation),
        ceilingValue: valueLabMoneyForAI(target.ceilingValue),
        expectedPerf: target.expectedPerf,
        surplus: target.surplus,
        confidence: target.confidenceLabel,
        medicalRisk: target.riskLabel,
        withinBudget: target.withinBudget,
        fitsNeed: target.fitsNeed,
      };
    }),
    portalNote: portalCtx.note || '',
  };
}

function valueLabEnsureJsPdf() {
  if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!valueLabJsPdfPromise) {
    valueLabJsPdfPromise = loadScriptOnce(
      'jspdf',
      URLS.JSPDF_CDN,
      {
        timeoutMs: 12000,
        test: function () { return window.jspdf && window.jspdf.jsPDF; },
        errorMessage: 'jsPDF failed to load.'
      }
    );
  }
  return valueLabJsPdfPromise;
}

function valueLabPdfFileName(name) {
  return String(name || 'value-lab-director-brief')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') + '.pdf';
}

function valueLabPdfMarkdownLines(raw) {
  return String(raw || '')
    .split(/\r?\n/)
    .map(function (line) {
      return String(line || '')
        .replace(/^#{1,6}\s*/, '')
        .replace(/^[-*]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .trim();
    })
    .filter(Boolean);
}

async function valueLabGetPortalPool() {
  if (valueLabCurrentLeague() !== 'MBB') {
    return { items: [], supported: false, note: 'Transfer portal value watch is currently MBB only.' };
  }
  var cacheKey = valueLabCurrentLeague() + '::' + valueLabCurrentSeason();
  if (valueLabCaseState.portalCache && valueLabCaseState.portalCache.key === cacheKey && Array.isArray(valueLabCaseState.portalCache.items) && valueLabCaseState.portalCache.items.length) {
    return { items: valueLabCaseState.portalCache.items, supported: true, meta: valueLabCaseState.portalCache.meta || null };
  }

  var items = (typeof portalItems !== 'undefined' && Array.isArray(portalItems) && portalItems.length) ? portalItems.slice() : [];
  var meta = null;
  if (!items.length) {
    var base = (typeof WORKER_URL !== 'undefined' && WORKER_URL) || URLS.WORKER;
    var url = base + '/api/portal/entries?sport=mbb&source=both&status=entries&onlyEntries=1&limit=180&page=1&year=' + encodeURIComponent(valueLabCurrentSeason());
    var res = await fetch(url, { credentials: 'include' });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error((data && data.message) || ('Portal fetch failed (' + res.status + ')'));
    items = Array.isArray(data.items) ? data.items : [];
    meta = { source: data.source || 'both', note: data.note || '' };
  }
  valueLabCaseState.portalCache = { key: cacheKey, items: items.slice(), meta: meta };
  return { items: items, supported: true, meta: meta };
}

function valueLabBuildPortalTargets(analysis, portalPack) {
  portalPack = portalPack && typeof portalPack === 'object' ? portalPack : { items: [] };
  if (!analysis || analysis.empty) return { supported: true, targets: [], note: 'Load a case first.' };
  if (valueLabCurrentLeague() !== 'MBB') return { supported: false, targets: [], note: 'Transfer portal value watch is currently MBB only.' };

  var pool = valueLabCurrentPool();
  var peerPools = {
    all: pool.slice(),
    guard: pool.filter(function (row) { return valueLabPosGroup(row) === 'guard'; }),
    big: pool.filter(function (row) { return valueLabPosGroup(row) !== 'guard'; }),
  };
  var groupRows = valueLabAggregateBy(analysis.players.map(function (row) {
    return Object.assign({}, row, { ActualValuation_calc: row.spendBasis });
  }), function (row) {
    return valueLabPosGroup(row) === 'guard' ? 'Guards' : 'Bigs';
  });
  var weakestGroup = groupRows.slice().sort(function (a, b) { return (a.avgPerf || 0) - (b.avgPerf || 0); })[0];
  var weakestLabel = weakestGroup ? weakestGroup.label : '';
  var budgetLeft = Number.isFinite(analysis.budgetRemaining) ? analysis.budgetRemaining : NaN;
  var seen = Object.create(null);
  var targets = [];

  (portalPack.items || []).forEach(function (entry) {
    var player = typeof portalFindPlayerMatch === 'function' ? portalFindPlayerMatch(entry.playerName || '') : null;
    if (!player) return;
    var valuation = valueLabDecisionMedianValue(player);
    var floorValue = valueLabDecisionFloorValue(player);
    var ceilingValue = valueLabDecisionCeilingValue(player);
    var perf = valueLabDecisionPerf(player);
    if (!Number.isFinite(valuation) || !Number.isFinite(perf)) return;
    var key = valueLabPlayerKey(player);
    if (!key || seen[key]) return;
    seen[key] = true;
    var expectedPerf = valueLabExpectedPerfAtSpend(player, peerPools);
    var surplus = (Number.isFinite(perf) && Number.isFinite(expectedPerf)) ? (perf - expectedPerf) : NaN;
    var posLabel = valueLabPosGroup(player) === 'guard' ? 'Guards' : 'Bigs';
    var fitsNeed = weakestLabel && posLabel === weakestLabel;
    var withinBudget = !Number.isFinite(budgetLeft) || budgetLeft <= 0 ? true : valuation <= budgetLeft;
    var valueScore = (perf / Math.max(1, valuation)) * 100000;
    var confidence = valueLabNum(player.ProjectionConfidence_calc);
    var riskLabel = valueLabRiskLabel(player);
    var rankScore = valueScore + (Number.isFinite(surplus) ? (surplus * 4) : 0) + (fitsNeed ? 8 : 0) + (withinBudget ? 6 : -4) + (Number.isFinite(confidence) ? confidence * 6 : 0) - (riskLabel === 'High' ? 5 : (riskLabel === 'Moderate' ? 2 : 0));
    targets.push({
      key: key,
      name: player.Player || entry.playerName || '',
      fromTeam: entry.fromTeam || player.Team || '',
      position: player.Position || player.Pos || entry.position || '—',
      classLabel: player.Class || player.Yr || '—',
      perf: perf,
      valuation: valuation,
      floorValue: floorValue,
      ceilingValue: ceilingValue,
      expectedPerf: expectedPerf,
      surplus: surplus,
      confidence: confidence,
      confidenceLabel: valueLabConfidenceLabel(confidence),
      riskLabel: riskLabel,
      withinBudget: withinBudget,
      fitsNeed: fitsNeed,
      source: entry.source || 'portal',
      score: rankScore,
    });
  });

  targets.sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
  return {
    supported: true,
    weakestLabel: weakestLabel || 'Needs',
    budgetLeft: budgetLeft,
    targets: targets.slice(0, 8),
    note: targets.length ? '' : 'No matched portal value targets were available in the current MBB portal feed.'
  };
}

function valueLabRenderPortalWatch(portalCtx) {
  if (!valueLabPortalWatchEl) return;
  if (!portalCtx || portalCtx.loading) {
    valueLabPortalWatchEl.innerHTML = '<span class="valueLabPortalPill"><small>Scanning portal value targets…</small></span>';
    return;
  }
  if (portalCtx.supported === false) {
    valueLabPortalWatchEl.innerHTML = '<span class="valueLabPortalPill"><small>' + valueLabEsc(portalCtx.note || 'Portal value watch unavailable.') + '</small></span>';
    return;
  }
  if (!portalCtx.targets || !portalCtx.targets.length) {
    valueLabPortalWatchEl.innerHTML = '<span class="valueLabPortalPill"><small>' + valueLabEsc(portalCtx.note || 'No portal value targets surfaced.') + '</small></span>';
    return;
  }
  valueLabPortalWatchEl.innerHTML = portalCtx.targets.slice(0, 4).map(function (target) {
    var tone = target.riskLabel === 'High' ? 'warn' : (target.withinBudget ? 'good' : 'warn');
    return '<span class="valueLabPortalPill valueLabPortalPill--' + tone + '">' +
      '<span><b>' + valueLabEsc(target.name) + '</b> <small>' + valueLabEsc(target.fromTeam || 'Portal') + ' · ' + valueLabEsc(target.position || '—') + '</small></span>' +
      '<span>' + valueLabFmtMoney(target.floorValue) + ' / ' + valueLabFmtMoney(target.valuation) + ' / ' + valueLabFmtMoney(target.ceilingValue) + ' · Conf ' + valueLabEsc(target.confidenceLabel) + ' · Risk ' + valueLabEsc(target.riskLabel) + (target.fitsNeed ? ' · fills ' + valueLabEsc(portalCtx.weakestLabel || 'need') : '') + '</span>' +
    '</span>';
  }).join('');
}

function valueLabRenderScatter(analysis) {
  if (!valueLabScatterEl) return;
  if (!analysis || analysis.empty || !analysis.players.length) {
    valueLabScatterEl.innerHTML = '<div class="valueLabEmpty">Spend/performance scatter will appear once the selected source has player valuations and Perf scores.</div>';
    return;
  }
  var points = analysis.players.filter(function (row) {
    return Number.isFinite(row.spendBasis) && Number.isFinite(row.perf);
  });
  if (!points.length) {
    valueLabScatterEl.innerHTML = '<div class="valueLabEmpty">No spend/perf data available for this roster yet.</div>';
    return;
  }

  var width = 520;
  var height = 290;
  var padL = 54;
  var padR = 18;
  var padT = 18;
  var padB = 42;
  var maxX = Math.max.apply(null, points.map(function (row) { return row.spendBasis; }).concat([1]));
  var minY = Math.min.apply(null, points.map(function (row) { return row.perf; }).concat([0]));
  var maxY = Math.max.apply(null, points.map(function (row) { return row.perf; }).concat([1]));
  minY = Math.floor(Math.max(0, minY - 5));
  maxY = Math.ceil(maxY + 5);

  function xScale(value) {
    return padL + (value / maxX) * (width - padL - padR);
  }
  function yScale(value) {
    return height - padB - ((value - minY) / Math.max(1, (maxY - minY))) * (height - padT - padB);
  }
  function toneColor(tone) {
    if (tone === 'good') return '#34d399';
    if (tone === 'warn') return '#fbbf24';
    if (tone === 'bad') return '#f87171';
    return '#60a5fa';
  }

  var avgX = xScale(analysis.avgSpend || 0);
  var avgY = yScale(analysis.avgPerf || minY);
  var xTicks = [0.25, 0.5, 0.75, 1].map(function (ratio) {
    var value = maxX * ratio;
    return '<text x="' + xScale(value).toFixed(1) + '" y="' + (height - 14) + '" class="valueLabAxisText" text-anchor="middle">' + valueLabFmtMoney(value) + '</text>';
  }).join('');
  var yTicks = [0, 0.25, 0.5, 0.75, 1].map(function (ratio) {
    var value = minY + (maxY - minY) * ratio;
    return '<text x="18" y="' + (yScale(value) + 4).toFixed(1) + '" class="valueLabAxisText">' + value.toFixed(0) + '</text>';
  }).join('');
  var circles = points.map(function (row) {
    var cx = xScale(row.spendBasis).toFixed(1);
    var cy = yScale(row.perf).toFixed(1);
    return '<circle cx="' + cx + '" cy="' + cy + '" r="5.5" fill="' + toneColor(row.roiTone) + '" fill-opacity="0.88" stroke="#08101d" stroke-width="1.5">' +
      '<title>' + (row.Player || 'Player') + ' - Perf ' + row.perf.toFixed(1) + ' - ' + valueLabFmtMoney(row.spendBasis) + ' - ' + row.roiLabel + '</title>' +
    '</circle>';
  }).join('');

  valueLabScatterEl.innerHTML =
    '<svg viewBox="0 0 ' + width + ' ' + height + '" class="valueLabScatterSvg" role="img" aria-label="Spend versus performance scatter plot">' +
      '<rect x="0" y="0" width="' + width + '" height="' + height + '" rx="14" fill="rgba(255,255,255,0.01)"></rect>' +
      '<line x1="' + padL + '" y1="' + (height - padB) + '" x2="' + (width - padR) + '" y2="' + (height - padB) + '" class="valueLabAxis"></line>' +
      '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (height - padB) + '" class="valueLabAxis"></line>' +
      '<line x1="' + avgX.toFixed(1) + '" y1="' + padT + '" x2="' + avgX.toFixed(1) + '" y2="' + (height - padB) + '" class="valueLabAvgLine"></line>' +
      '<line x1="' + padL + '" y1="' + avgY.toFixed(1) + '" x2="' + (width - padR) + '" y2="' + avgY.toFixed(1) + '" class="valueLabAvgLine"></line>' +
      xTicks + yTicks + circles +
      '<text x="' + ((width + padL - padR) / 2).toFixed(1) + '" y="' + (height - 4) + '" class="valueLabAxisTitle" text-anchor="middle">Actual Spend (median model fallback)</text>' +
      '<text x="12" y="' + ((height + padT - padB) / 2).toFixed(1) + '" class="valueLabAxisTitle" transform="rotate(-90 12 ' + ((height + padT - padB) / 2).toFixed(1) + ')" text-anchor="middle">Projection</text>' +
    '</svg>' +
    '<div class="valueLabScatterLegend">X-axis uses actual contract spend when entered, otherwise projection median value. Y-axis uses projection performance. Green = beating price, gold = fair/rich, red = overpay.</div>';
}

function valueLabBreakdownBlock(title, items, totalSpend) {
  if (!items.length) return '<div class="valueLabBreakdownBlock"><div class="valueLabMiniTitle">' + title + '</div><div class="valueLabEmpty" style="min-height:auto">No data.</div></div>';
  return '<div class="valueLabBreakdownBlock">' +
    '<div class="valueLabMiniTitle">' + title + '</div>' +
    items.map(function (item) {
      var share = totalSpend > 0 ? (item.spend / totalSpend) * 100 : 0;
      return '<div class="valueLabBarRow">' +
        '<div class="valueLabBarTop"><span>' + item.label + '</span><strong>' + valueLabFmtMoney(item.spend) + '</strong></div>' +
        '<div class="valueLabBarTrack"><span class="valueLabBarFill" style="width:' + share.toFixed(1) + '%"></span></div>' +
        '<div class="valueLabBarMeta">' + item.count + ' players - ' + share.toFixed(0) + '% of effective spend - avg perf ' + (Number.isFinite(item.avgPerf) ? item.avgPerf.toFixed(1) : '—') + '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

function valueLabRenderBreakdowns(analysis) {
  if (!valueLabBreakdownsEl) return;
  if (!analysis || analysis.empty) {
    valueLabBreakdownsEl.innerHTML = '<div class="valueLabEmpty">Spend breakdowns by position, class, and team mix will show here.</div>';
    return;
  }
  valueLabBreakdownsEl.innerHTML =
    '<div class="valueLabBreakdownGrid">' +
      valueLabBreakdownBlock('By position', analysis.breakdowns.position, analysis.totalSpend) +
      valueLabBreakdownBlock('By class', analysis.breakdowns.classYear, analysis.totalSpend) +
      valueLabBreakdownBlock('By team', analysis.breakdowns.team, analysis.totalSpend) +
    '</div>';
}

function valueLabRenderRosterTable(analysis) {
  if (!valueLabRosterBodyEl || !valueLabRosterEmptyEl) return;
  valueLabRosterBodyEl.innerHTML = '';
  if (!analysis || analysis.empty || !analysis.players.length) {
    valueLabRosterEmptyEl.textContent = (analysis && analysis.emptyMessage) || 'Choose a Value Lab source to load the roster table.';
    valueLabRosterEmptyEl.style.display = '';
    return;
  }
  valueLabRosterEmptyEl.style.display = 'none';
  var fragment = document.createDocumentFragment();
  analysis.players.forEach(function (row) {
    var tr = document.createElement('tr');
    var surplusText = Number.isFinite(row.surplus) ? ((row.surplus >= 0 ? '+' : '') + row.surplus.toFixed(1)) : '—';
    var surplusTone = row.roiTone === 'good' ? 'var(--good)' : row.roiTone === 'bad' ? 'var(--bad)' : row.roiTone === 'warn' ? 'var(--warn)' : 'var(--muted)';
    tr.innerHTML =
      '<td><span class="link valueLabPlayerLink">' + (row.Player || '—') + '</span></td>' +
      '<td>' + (row.Team || '—') + '</td>' +
      '<td>' + (row.posLabel || '—') + '</td>' +
      '<td>' + (row.classBucket || '—') + '</td>' +
      '<td class="playersPerfCell">' + (Number.isFinite(row.perf) ? row.perf.toFixed(1) : '—') + '</td>' +
      '<td>' + valueLabFmtMoney(row.valuation) + '</td>' +
      '<td>' + (Number.isFinite(row.expectedPerf) ? row.expectedPerf.toFixed(1) : '—') + '</td>' +
      '<td style="color:' + surplusTone + ';font-weight:800">' + surplusText + '</td>' +
      '<td><span class="valueLabRoiTag valueLabRoiTag--' + row.roiTone + '" title="' + valueLabEsc(valueLabRoiTooltipText(row)) + '" aria-label="' + valueLabEsc(valueLabRoiTooltipText(row)) + '">' + row.roiLabel + '</span></td>';
    var link = tr.querySelector('.valueLabPlayerLink');
    if (link) {
      link.addEventListener('click', function () {
        if (typeof openProfile === 'function') openProfile(row);
      });
    }
    fragment.appendChild(tr);
  });
  valueLabRosterBodyEl.appendChild(fragment);
}

function valueLabRenderAll(analysis, compareAnalysis) {
  valueLabRenderSourceControls();
  valueLabRenderKpis(analysis);
  valueLabRenderInsights(analysis);
  valueLabRenderOutcome(analysis);
  valueLabRenderComparison(analysis, compareAnalysis);
  valueLabRenderScatter(analysis);
  valueLabRenderBreakdowns(analysis);
  valueLabRenderRosterTable(analysis);
}

async function valueLabRunAIBrief() {
  if (!valueLabAIRunBtnEl || !valueLabAIOutputEl) return;
  await valueLabBootstrapV2(false);
  var bundle = valueLabBuildBundleFromCaseV2();
  var analysis = valueLabBuildAnalysis(bundle);
  var compareBundle = valueLabBuildCompareBundleV2();
  var compareAnalysis = compareBundle ? valueLabBuildAnalysis(compareBundle) : null;
  if (analysis.empty) {
    valueLabSetAIStatus((analysis && analysis.emptyMessage) || 'Load a Value Lab case first.');
    return;
  }

  valueLabAIRunBtnEl.disabled = true;
  valueLabAIOutputEl.style.display = 'block';
  valueLabAIOutputEl.innerHTML = '<div class="thDeepLoading"><span class="thDeepSpinner"></span> Building director brief…</div>';
  valueLabSetAIStatus('Projecting outcome, checking portal value targets, and preparing the business brief...');

  try {
    analysis.outcome = await valueLabBuildOutcome(analysis);
    if (compareAnalysis && !compareAnalysis.empty) {
      compareAnalysis.outcome = await valueLabBuildOutcome(compareAnalysis);
    }
    var portalPack = await valueLabGetPortalPool().catch(function () {
      return { supported: false, items: [], note: 'Portal feed unavailable right now.' };
    });
    var portalCtx = valueLabBuildPortalTargets(analysis, portalPack);
    var comparePortalCtx = (compareAnalysis && !compareAnalysis.empty)
      ? valueLabBuildPortalTargets(compareAnalysis, portalPack)
      : { targets: [], note: '' };
    valueLabCaseState.lastAnalysis = analysis;
    valueLabCaseState.lastCompareAnalysis = compareAnalysis;
    valueLabCaseState.lastPortalTargets = portalCtx;
    valueLabRenderPortalWatch(portalCtx);

    var promptCtx;
    var userPrompt;
    if (compareAnalysis && !compareAnalysis.empty) {
      var rosterDiff = valueLabBuildCompareRosterDiff(analysis, compareAnalysis);
      var recommendation = valueLabBuildCompareRecommendation(analysis, compareAnalysis);
      promptCtx = {
        mode: 'compare',
        activeCase: valueLabBuildAICaseContext(analysis, portalCtx),
        compareCase: valueLabBuildAICaseContext(compareAnalysis, comparePortalCtx),
        comparison: {
          recommendation: recommendation,
          takeaways: valueLabBuildCompareTakeaways(analysis, compareAnalysis, rosterDiff),
          rosterDiff: {
            sharedCount: rosterDiff ? rosterDiff.sharedCount : 0,
            onlyActive: (rosterDiff && rosterDiff.onlyCurrent ? rosterDiff.onlyCurrent : []).slice(0, 8).map(function (row) {
              return {
                player: row.Player,
                team: row.Team,
                perf: row.perf,
                spendBasis: valueLabMoneyForAI(row.spendBasis),
                roiCall: row.roiLabel
              };
            }),
            onlyCompare: (rosterDiff && rosterDiff.onlyCompare ? rosterDiff.onlyCompare : []).slice(0, 8).map(function (row) {
              return {
                player: row.Player,
                team: row.Team,
                perf: row.perf,
                spendBasis: valueLabMoneyForAI(row.spendBasis),
                roiCall: row.roiLabel
              };
            }),
          }
        }
      };
      userPrompt =
        'Build a director-facing college basketball Value Lab comparison brief using ONLY the structured JSON below.\n\n' +
        'Goals:\n' +
        '- Pick which case is the better director-side choice right now and explain why.\n' +
        '- Compare contract health, budget flexibility, projected wins, floor/median/ceiling range, and spend efficiency.\n' +
        '- Call out where the active case is stronger, where the compare case is stronger, and what would change the recommendation.\n' +
        '- Use the exact labels Projection, Confidence, Medical Risk, Floor, Median, and Ceiling whenever you discuss flagged uncertainty players or risky bets.\n' +
        '- Use the transfer portal targets as business-side suggestions for whichever case looks most actionable.\n' +
        '- If contract coverage is incomplete, say that clearly and lower confidence.\n\n' +
        'Return markdown with these sections:\n' +
        '## Executive Verdict\n' +
        '## Head-to-Head Decision\n' +
        '## Budget & Contract Health\n' +
        '## Outcome vs Spend\n' +
        '## Projection Bets\n' +
        '## Portal Value Targets\n' +
        '## Director Action Plan\n\n' +
        'JSON:\n```json\n' + JSON.stringify(promptCtx, null, 2) + '\n```';
    } else {
      promptCtx = {
        mode: 'single',
        activeCase: valueLabBuildAICaseContext(analysis, portalCtx),
      };
      userPrompt =
        'Build a director-facing college basketball Value Lab brief using ONLY the structured JSON below.\n\n' +
        'Goals:\n' +
        '- Evaluate whether this roster investment is healthy on the business side.\n' +
        '- Explain if current contracts are under market, fair, or rich.\n' +
        '- Interpret projected wins, floor/median/ceiling range, and whether spend is justified.\n' +
        '- Use the exact labels Projection, Confidence, Medical Risk, Floor, Median, and Ceiling whenever you discuss flagged uncertainty players or risky bets.\n' +
        '- Point out budget flexibility and where the money is too concentrated.\n' +
        '- Use the provided transfer portal targets to suggest best bang-for-buck additions when relevant.\n' +
        '- If contract coverage is incomplete, say that clearly and lower confidence.\n\n' +
        'Return markdown with these sections:\n' +
        '## Executive Verdict\n' +
        '## Budget & Contract Health\n' +
        '## Outcome vs Spend\n' +
        '## Projection Bets\n' +
        '## Portal Value Targets\n' +
        '## Director Action Plan\n\n' +
        'JSON:\n```json\n' + JSON.stringify(promptCtx, null, 2) + '\n```';
    }

    var res = await fetch(VALUE_LAB_GEMINI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VALUE_LAB_GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: {
          parts: [{
            text: 'You are an elite deputy-athletic-director and basketball roster strategy analyst. Be business-first, concrete, and honest. Only use the provided numbers. Do not invent contracts, portal intel, or wins. Call out uncertainty when coverage is incomplete. Give practical recommendations a director can act on immediately.'
          }]
        },
        generationConfig: { temperature: 0.35, maxOutputTokens: 3200 }
      })
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.error) throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
    var text = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
      .map(function (part) { return part.text || ''; })
      .join('')
      .trim();
    if (!text) throw new Error('Empty AI response');

    valueLabAIOutputEl.innerHTML = valueLabAIMarkdownToHtml(text);
    if (valueLabAIOutputEl.dataset) {
      valueLabAIOutputEl.dataset.lastRaw = text;
      valueLabAIOutputEl.dataset.lastSignature = valueLabBuildBriefSignature();
      valueLabAIOutputEl.dataset.lastGeneratedAt = new Date().toISOString();
    }
    valueLabSetAIStatus(compareAnalysis && !compareAnalysis.empty
      ? 'Director comparison brief ready — grounded in spend, projection, and portal options for both cases.'
      : 'Director brief ready — grounded in case spend, projection, and portal value targets.');
  } catch (e) {
    valueLabAIOutputEl.innerHTML = '<div class="muted" style="padding:12px">Unable to run the director brief: ' + valueLabEsc(e && e.message ? e.message : String(e)) + '</div>';
    valueLabSetAIStatus('Director brief failed');
  } finally {
    valueLabAIRunBtnEl.disabled = false;
  }
}

async function valueLabExportBriefPdf() {
  await valueLabBootstrapV2(false);
  var bundle = valueLabBuildBundleFromCaseV2();
  var analysis = valueLabBuildAnalysis(bundle);
  var compareBundle = valueLabBuildCompareBundleV2();
  var compareAnalysis = compareBundle ? valueLabBuildAnalysis(compareBundle) : null;
  if (!analysis || analysis.empty) {
    valueLabSetAIStatus((analysis && analysis.emptyMessage) || 'Load a Value Lab case first.');
    return;
  }

  valueLabSetAIStatus('Building Value Lab PDF...');
  if (valueLabAIPdfBtnEl) valueLabAIPdfBtnEl.disabled = true;
  try {
    await valueLabEnsureJsPdf();
  } catch (e) {
    valueLabSetAIStatus('PDF export unavailable right now.');
    if (typeof showWarn === 'function') showWarn('Value Lab PDF export failed: ' + (e && e.message ? e.message : e));
    if (valueLabAIPdfBtnEl) valueLabAIPdfBtnEl.disabled = false;
    return;
  }

  try {
    analysis.outcome = await valueLabBuildOutcome(analysis);
    if (compareAnalysis && !compareAnalysis.empty) {
      compareAnalysis.outcome = await valueLabBuildOutcome(compareAnalysis);
    }
    valueLabCaseState.lastAnalysis = analysis;
    valueLabCaseState.lastCompareAnalysis = compareAnalysis;

    var portalPack = await valueLabGetPortalPool().catch(function () {
      return { supported: false, items: [], note: 'Portal feed unavailable right now.' };
    });
    var portalCtx = valueLabBuildPortalTargets(analysis, portalPack);
    valueLabCaseState.lastPortalTargets = portalCtx;
    var recommendation = (compareAnalysis && !compareAnalysis.empty) ? valueLabBuildCompareRecommendation(analysis, compareAnalysis) : null;
    var rosterDiff = (compareAnalysis && !compareAnalysis.empty) ? valueLabBuildCompareRosterDiff(analysis, compareAnalysis) : null;
    var rawBrief = valueLabGetFreshBriefRaw();
    var generatedAt = (valueLabAIOutputEl && valueLabAIOutputEl.dataset && valueLabAIOutputEl.dataset.lastGeneratedAt) || '';

    var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var margin = 42;
    var y = margin;
    var pageNum = 1;

    function ensureSpace(height) {
      if (y + height <= pageH - margin) return;
      addFooter();
      doc.addPage();
      pageNum += 1;
      y = margin;
    }
    function addFooter() {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(145, 155, 170);
      doc.text('Toledo Basketball Ops Platform - Value Lab Director Brief', margin, pageH - 22);
      doc.text('Page ' + pageNum, pageW - margin, pageH - 22, { align: 'right' });
      doc.setDrawColor(210, 215, 228);
      doc.setLineWidth(0.4);
      doc.line(margin, pageH - 32, pageW - margin, pageH - 32);
      doc.setTextColor(0, 0, 0);
    }
    function addTitle(text, size) {
      size = size || 18;
      ensureSpace(size + 16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(size);
      doc.text(String(text || ''), margin, y);
      y += size + 10;
    }
    function addBody(text, opts) {
      opts = opts || {};
      var fontSize = opts.fontSize || 10;
      var lineHeight = opts.lineHeight || 13;
      var indent = opts.indent || 0;
      var maxWidth = pageW - (margin * 2) - indent;
      var raw = Array.isArray(text) ? text.join('\n') : String(text || '');
      var lines = doc.splitTextToSize(raw, maxWidth);
      ensureSpace(lines.length * lineHeight + 4);
      doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      doc.setFontSize(fontSize);
      doc.text(lines, margin + indent, y);
      y += lines.length * lineHeight + (opts.gap != null ? opts.gap : 6);
    }
    function addSection(title, lines) {
      addTitle(title, 13);
      (lines || []).forEach(function (line) {
        addBody(line, { fontSize: 10, lineHeight: 13 });
      });
      y += 4;
    }

    var exportedAt = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });
    var currentName = (analysis.bundle && analysis.bundle.label) || 'Active Case';
    var compareName = compareAnalysis && compareAnalysis.bundle ? (compareAnalysis.bundle.label || 'Compare Case') : '';
    var metrics = compareAnalysis && !compareAnalysis.empty ? valueLabGetComparisonMetrics(analysis, compareAnalysis) : [];

    doc.setProperties({
      title: currentName + (compareName ? ' vs ' + compareName : '') + ' Value Lab Brief',
      subject: 'Value Lab director brief',
      author: 'Toledo Basketball Ops Platform'
    });

    addTitle('Value Lab Director Brief', 20);
    addBody('League: ' + valueLabCurrentLeague() + '   -   Season: ' + valueLabCurrentSeason(), { fontSize: 11, lineHeight: 14 });
    addBody('Active case: ' + currentName + (compareName ? '   -   Compare case: ' + compareName : ''), { fontSize: 11, lineHeight: 14 });
    addBody('Exported: ' + exportedAt, { fontSize: 9, lineHeight: 12, gap: 10 });

    if (recommendation) {
      addSection('Recommendation', [
        recommendation.pillLabel + ' - ' + recommendation.title,
        recommendation.summary
      ]);
    }

    addSection('Executive Snapshot', [
      'Roster size: ' + analysis.rosterSize,
      'Effective spend: ' + valueLabFmtMoney(analysis.totalSpend),
      'Model value: ' + valueLabFmtMoney(analysis.totalModelValue),
      'Actual spend entered: ' + (analysis.enteredContracts ? valueLabFmtMoney(analysis.totalActualSpend) : '—'),
      'Budget remaining: ' + (Number.isFinite(analysis.budgetRemaining) ? valueLabFmtMoney(analysis.budgetRemaining) : '—'),
      'Average Perf: ' + (Number.isFinite(analysis.avgPerf) ? analysis.avgPerf.toFixed(1) : '—'),
      'Perf / $100k: ' + (Number.isFinite(analysis.perfPer100kActual) ? analysis.perfPer100kActual.toFixed(1) : (Number.isFinite(analysis.perfPer100k) ? analysis.perfPer100k.toFixed(1) : '—')),
      'ROI gap: ' + (Number.isFinite(analysis.roiGap) ? valueLabFmtSigned(Math.round(analysis.roiGap), null, ' pts') : '—'),
      'Contract coverage: ' + Math.round((analysis.contractCoverage || 0) * 100) + '%'
    ]);

    addSection('Outcome vs Spend', analysis.outcome && analysis.outcome.hasTeamContext ? [
      'Detected team: ' + analysis.outcome.teamName,
      'Actual record: ' + (analysis.outcome.gamesPlayed ? (analysis.outcome.actualWins + '-' + analysis.outcome.actualLosses) : '—'),
      'Baseline wins: ' + valueLabFmtWins(analysis.outcome.baselineFullWins),
      'Case projected wins: ' + valueLabFmtWins(analysis.outcome.projectedFullWins),
      'Delta vs baseline: ' + (Number.isFinite(analysis.outcome.projectedWinDelta) ? valueLabFmtSigned(analysis.outcome.projectedWinDelta, 1, ' wins') : '—'),
      'Spend / projected win: ' + (Number.isFinite(analysis.outcome.spendPerProjectedWin) ? valueLabFmtMoney(analysis.outcome.spendPerProjectedWin) : '—'),
      'Projection note: ' + (analysis.outcome.note || 'No note available.')
    ] : [
      (analysis.outcome && analysis.outcome.note) || 'No real team context was detected for outcome replay.'
    ]);

    if (compareAnalysis && !compareAnalysis.empty) {
      addSection('Case Comparison Snapshot', metrics.map(function (metric) {
        var currentVal = valueLabNum(metric.current);
        var compareVal = valueLabNum(metric.compare);
        var delta = (Number.isFinite(currentVal) && Number.isFinite(compareVal)) ? (currentVal - compareVal) : NaN;
        var deltaText = Number.isFinite(delta)
          ? (delta === 0 ? 'No gap' : ((delta > 0 ? 'Active case +' : 'Compare case +') + (metric.deltaFormat ? metric.deltaFormat(Math.abs(delta)) : metric.format(Math.abs(delta)))))
          : 'Awaiting full data';
        return metric.label + ': Active ' + metric.format(metric.current) + ' | Compare ' + metric.format(metric.compare) + ' | ' + deltaText;
      }).concat([
        'Shared players: ' + (rosterDiff ? rosterDiff.sharedCount : 0),
        'Only in active case: ' + (rosterDiff && rosterDiff.onlyCurrent.length ? rosterDiff.onlyCurrent.slice(0, 5).map(function (row) { return row.Player; }).join(', ') : 'None'),
        'Only in compare case: ' + (rosterDiff && rosterDiff.onlyCompare.length ? rosterDiff.onlyCompare.slice(0, 5).map(function (row) { return row.Player; }).join(', ') : 'None')
      ]));
    }

    addSection('Portal Value Watch', (portalCtx.targets || []).length
      ? portalCtx.targets.slice(0, 5).map(function (target, idx) {
          return (idx + 1) + '. ' + target.name + ' - ' + (target.fromTeam || 'Portal') + ' - ' + (target.position || '—') + ' - Perf ' + target.perf.toFixed(1) + ' - ' + valueLabFmtMoney(target.valuation) + (target.fitsNeed ? ' - fills ' + (portalCtx.weakestLabel || 'need') : '');
        })
      : [portalCtx.note || 'No portal value targets surfaced for this case right now.']);

    addSection('Director AI Brief', rawBrief
      ? valueLabPdfMarkdownLines(rawBrief)
      : ['Run Director Brief before exporting if you want the Gemini narrative included. The PDF still captures the current Value Lab numbers and comparison view.']);

    if (rawBrief && generatedAt) {
      addBody('AI brief generated: ' + new Date(generatedAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }), { fontSize: 8.5, lineHeight: 11, gap: 0 });
    }

    var blobUrl = doc.output('bloburl');
    var preview = window.open(blobUrl, '_blank');
    if (!preview) {
      doc.save(valueLabPdfFileName((currentName || 'value-lab') + (compareName ? '-vs-' + compareName : '') + '-brief'));
      valueLabSetAIStatus('PDF downloaded');
      return;
    }
    valueLabSetAIStatus('PDF preview opened in a new tab');
  } catch (e) {
    valueLabSetAIStatus('PDF export failed');
    if (typeof showWarn === 'function') showWarn('Value Lab PDF export failed: ' + (e && e.message ? e.message : e));
  } finally {
    if (valueLabAIPdfBtnEl) valueLabAIPdfBtnEl.disabled = false;
  }
}

async function valueLabRefresh() {
  if (!valueLabModeSelectEl) return;
  valueLabRenderSourceControls();
  var bundle = valueLabGetSourceBundle();
  var analysis = valueLabBuildAnalysis(bundle);
  valueLabRenderAll(analysis);
  if (analysis.empty) return;
  var refreshToken = ++valueLabState.refreshToken;
  if (valueLabOutcomeEl) valueLabOutcomeEl.innerHTML = '<div class="valueLabLoading">Checking team context and schedule results...</div>';
  analysis.outcome = await valueLabBuildOutcome(analysis);
  if (refreshToken !== valueLabState.refreshToken) return;
  valueLabRenderOutcome(analysis);
}

function valueLabUseScenarioRoster() {
  valueLabSetSelection({ mode: 'scenarioRoster', actualTeam: '', snapshotId: '' });
  valueLabRefresh();
}

function valueLabUseTeamHubTeam() {
  var teamName = valueLabCanonicalTeamName(valueLabGetTeamHubTeam());
  if (!teamName) {
    valueLabSetStatus('Load a team in Team Hub first, then try again.', 'warn');
    return;
  }
  valueLabSetSelection({ mode: 'actualTeam', actualTeam: teamName, snapshotId: '' });
  valueLabRefresh();
}

function valueLabSaveSnapshot() {
  var bundle = valueLabGetSourceBundle();
  var players = Array.isArray(bundle.players) ? bundle.players.slice() : [];
  if (!players.length) {
    valueLabSetStatus(valueLabEmptyMessage(bundle), 'warn');
    return;
  }
  var name = valueLabSnapshotNameEl ? String(valueLabSnapshotNameEl.value || '').trim() : '';
  if (!name) name = valueLabAutoName(bundle);

  var store = valueLabState.store || valueLabLoadStore();
  var selectedSnapshot = valueLabGetSelectedSnapshot();
  var updateExisting = !!(bundle.mode === 'snapshot' && selectedSnapshot);
  var snapshot = updateExisting ? valueLabClone(selectedSnapshot) : valueLabNormalizeSnapshot({
    id: 'vl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    createdAt: Date.now(),
  });

  snapshot.name = name;
  snapshot.league = valueLabCurrentLeague();
  snapshot.season = valueLabCurrentSeason();
  snapshot.updatedAt = Date.now();
  snapshot.sourceType = bundle.sourceType === 'actualTeam' ? 'actualTeam' : 'scenarioRoster';
  snapshot.sourceLabel = bundle.label || '';
  snapshot.actualTeam = bundle.actualTeam || '';
  snapshot.players = valueLabSnapshotPayloadFromPlayers(players);

  var existingIdx = (store.snapshots || []).findIndex(function (row) { return row.id === snapshot.id; });
  if (existingIdx >= 0) store.snapshots.splice(existingIdx, 1, snapshot);
  else store.snapshots.push(snapshot);
  valueLabWriteStore(store);
  valueLabSetSelection({ mode: 'snapshot', snapshotId: snapshot.id, actualTeam: '' });
  valueLabRefresh();
  valueLabSetStatus((updateExisting ? 'Updated ' : 'Saved ') + 'snapshot "' + name + '".', 'good');
}

function valueLabDeleteSnapshot() {
  var selectedSnapshot = valueLabGetSelectedSnapshot();
  if (!selectedSnapshot) {
    valueLabSetStatus('Select a saved snapshot first.', 'warn');
    return;
  }
  if (!confirm('Delete snapshot "' + selectedSnapshot.name + '"?')) return;
  var store = valueLabState.store || valueLabLoadStore();
  store.snapshots = (store.snapshots || []).filter(function (snapshot) { return snapshot.id !== selectedSnapshot.id; });
  valueLabWriteStore(store);
  valueLabSetSelection({ mode: 'actualTeam', actualTeam: valueLabSuggestedActualTeam(), snapshotId: '' });
  valueLabRefresh();
  valueLabSetStatus('Deleted snapshot "' + selectedSnapshot.name + '".', 'good');
}

function valueLabHandleModeChange() {
  var nextMode = valueLabModeSelectEl ? valueLabModeSelectEl.value : 'actualTeam';
  if (nextMode === 'snapshot') {
    valueLabSetSelection({ mode: 'snapshot', snapshotId: valueLabGetSelection().snapshotId, actualTeam: '' });
  } else if (nextMode === 'scenarioRoster') {
    valueLabSetSelection({ mode: 'scenarioRoster', snapshotId: '', actualTeam: '' });
  } else {
    var selection = valueLabGetSelection();
    valueLabSetSelection({ mode: 'actualTeam', actualTeam: selection.actualTeam || valueLabSuggestedActualTeam(), snapshotId: '' });
  }
  valueLabRefresh();
}

function valueLabHandleActualTeamChange() {
  var teamName = valueLabActualTeamSelectEl ? valueLabActualTeamSelectEl.value : '';
  valueLabSetSelection({ mode: 'actualTeam', actualTeam: teamName, snapshotId: '' });
  valueLabRefresh();
}

function valueLabHandleSnapshotChange() {
  var snapshotId = valueLabSourceSelectEl ? valueLabSourceSelectEl.value : '';
  valueLabSetSelection({ mode: 'snapshot', snapshotId: snapshotId, actualTeam: '' });
  valueLabRefresh();
}

function valueLabHandleRosterChange() {
  if (!valueLabModeSelectEl) return;
  valueLabRenderSourceControls();
  if (window._dashboardCurrentPageId === 'pageValueLab') {
    valueLabRefresh();
  }
}

function valueLabHandleDataChange() {
  if (!valueLabModeSelectEl) return;
  valueLabRenderSourceControls();
  if (window._dashboardCurrentPageId === 'pageValueLab') valueLabRefresh();
}

function valueLabOpenActualTeam(teamName) {
  var nextTeam = valueLabCanonicalTeamName(teamName) || valueLabSuggestedActualTeam();
  valueLabSetSelection({ mode: 'actualTeam', actualTeam: nextTeam, snapshotId: '' });
  if (typeof showDashboardPage === 'function') showDashboardPage('pageValueLab');
  else valueLabRefresh();
}

function valueLabOpenScenario() {
  valueLabSetSelection({ mode: 'scenarioRoster', actualTeam: '', snapshotId: '' });
  if (typeof showDashboardPage === 'function') showDashboardPage('pageValueLab');
  else valueLabRefresh();
}

function initValueLabPage() {
  initValueLabDOMRefs();
  if (!valueLabModeSelectEl) return;
  valueLabLoadStore();
  valueLabGetSelection();

  if (!valueLabModeSelectEl._bound) {
    valueLabModeSelectEl.addEventListener('change', valueLabHandleModeChange);
    valueLabModeSelectEl._bound = true;
  }
  if (!valueLabActualTeamSelectEl._bound) {
    valueLabActualTeamSelectEl.addEventListener('change', valueLabHandleActualTeamChange);
    valueLabActualTeamSelectEl._bound = true;
  }
  if (!valueLabSourceSelectEl._bound) {
    valueLabSourceSelectEl.addEventListener('change', valueLabHandleSnapshotChange);
    valueLabSourceSelectEl._bound = true;
  }
  if (valueLabUseLiveBtnEl && !valueLabUseLiveBtnEl._bound) {
    valueLabUseLiveBtnEl.addEventListener('click', valueLabUseScenarioRoster);
    valueLabUseLiveBtnEl._bound = true;
  }
  if (valueLabUseTeamHubBtnEl && !valueLabUseTeamHubBtnEl._bound) {
    valueLabUseTeamHubBtnEl.addEventListener('click', valueLabUseTeamHubTeam);
    valueLabUseTeamHubBtnEl._bound = true;
  }
  if (valueLabSaveBtnEl && !valueLabSaveBtnEl._bound) {
    valueLabSaveBtnEl.addEventListener('click', valueLabSaveSnapshot);
    valueLabSaveBtnEl._bound = true;
  }
  if (valueLabDeleteBtnEl && !valueLabDeleteBtnEl._bound) {
    valueLabDeleteBtnEl.addEventListener('click', valueLabDeleteSnapshot);
    valueLabDeleteBtnEl._bound = true;
  }
  if (valueLabOpenTeamBuilderBtnEl && !valueLabOpenTeamBuilderBtnEl._bound) {
    valueLabOpenTeamBuilderBtnEl.addEventListener('click', function () {
      if (typeof showDashboardPage === 'function') showDashboardPage('pageTeamBuilder', 'pageTeams');
    });
    valueLabOpenTeamBuilderBtnEl._bound = true;
  }
  if (valueLabOpenTeamHubBtnEl && !valueLabOpenTeamHubBtnEl._bound) {
    valueLabOpenTeamHubBtnEl.addEventListener('click', function () {
      if (typeof showDashboardPage === 'function') showDashboardPage('pageTeams');
    });
    valueLabOpenTeamHubBtnEl._bound = true;
  }

  valueLabRenderAll({
    empty: true,
    emptyMessage: 'Choose an actual team, pull in your current scenario, or load a snapshot to start Value Lab.',
  });
}

window.ValueLab = {
  refresh: valueLabRefresh,
  handleRosterChange: valueLabHandleRosterChange,
  handleDataChange: valueLabHandleDataChange,
  openActualTeam: valueLabOpenActualTeam,
  openScenario: valueLabOpenScenario,
};


// -------- Value Lab Pass 2 overrides --------
var valueLabCaseState = {
  loadedKey: '',
  loading: false,
  cases: [],
  currentCase: null,
  compareCaseId: '',
  dirty: false,
  refreshToken: 0,
  statusTimer: null,
  quickTimer: null,
  pendingTeamImport: '',
  lastAnalysis: null,
  lastCompareAnalysis: null,
  lastPortalTargets: null,
  portalCache: { key: '', items: [], meta: null },
};

var valueLabCaseSelectEl2, valueLabCaseNameEl2, valueLabTeamImportSelectEl2, valueLabCompareSelectEl2;
var valueLabQuickAddInputEl2, valueLabQuickAddDropdownEl2;
var valueLabNewCaseBtnEl2, valueLabDuplicateBtnEl2, valueLabClearCaseBtnEl2;
var valueLabImportHubBtnEl2, valueLabImportBuilderBtnEl2, valueLabImportTeamBtnEl2;
var valueLabBudgetInputEl2;
var valueLabAIRunBtnEl, valueLabAIPdfBtnEl, valueLabAIStatusEl, valueLabAIOutputEl, valueLabPortalWatchEl, valueLabCompareSummaryEl;
var valueLabJsPdfPromise = null;

var VALUE_LAB_GEMINI_PROXY_URL = URLS.GEMINI_PROXY;
var VALUE_LAB_GEMINI_MODEL = 'gemini-2.5-flash-lite';

function valueLabUseLocalModeV2() {
  return !(typeof authGetToken === 'function' && authGetToken());
}

function valueLabStoreKeyV2() {
  var user = '';
  if (typeof authGetUser === 'function') user = authGetUser() || '';
  if (!user && typeof authIsGuest === 'function' && authIsGuest()) user = 'guest';
  if (!user) user = 'local';
  return 'ncaa_value_lab_cases::' + valueLabNorm(user || 'local');
}

function valueLabLegacyStoreKeyV2() {
  var user = '';
  if (typeof authGetUser === 'function') user = authGetUser() || '';
  if (!user && typeof authIsGuest === 'function' && authIsGuest()) user = 'guest';
  if (!user) user = 'local';
  return 'ncaa_value_lab::' + valueLabNorm(user || 'local');
}

function valueLabSeasonKeyV2() {
  return valueLabCurrentLeague() + '::' + valueLabCurrentSeason();
}

function valueLabReadLocalV2() {
  try {
    var raw = JSON.parse(localStorage.getItem(valueLabStoreKeyV2()) || '{}');
    var legacy = JSON.parse(localStorage.getItem(valueLabLegacyStoreKeyV2()) || '{}');
    var nextCases = Array.isArray(raw && raw.cases) ? raw.cases.map(valueLabNormalizeCaseV2) : [];
    if (!nextCases.length && Array.isArray(legacy && legacy.snapshots)) {
      nextCases = legacy.snapshots.map(valueLabLegacySnapshotToCaseV2);
    }
    return {
      selectedCaseBySeason: raw && typeof raw.selectedCaseBySeason === 'object' ? raw.selectedCaseBySeason : {},
      cases: nextCases,
    };
  } catch (_) {
    return { selectedCaseBySeason: {}, cases: [] };
  }
}

function valueLabWriteLocalV2(store) {
  localStorage.setItem(valueLabStoreKeyV2(), JSON.stringify(store || { selectedCaseBySeason: {}, cases: [] }));
}

function valueLabGetSelectedCaseIdV2() {
  var store = valueLabReadLocalV2();
  return String((store.selectedCaseBySeason && store.selectedCaseBySeason[valueLabSeasonKeyV2()]) || '__draft__');
}

function valueLabSetSelectedCaseIdV2(idValue) {
  var store = valueLabReadLocalV2();
  store.selectedCaseBySeason[valueLabSeasonKeyV2()] = String(idValue || '__draft__');
  valueLabWriteLocalV2(store);
}

function valueLabNormalizeCasePlayerV2(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var item = {
    key: String(raw.key || '').trim(),
    Player: String(raw.Player || '').trim(),
    Team: String(raw.Team || '').trim(),
    Conference: String(raw.Conference || '').trim(),
    Position: String(raw.Position || '').trim(),
    Pos: String(raw.Pos || raw.Position || '').trim(),
    Class: String(raw.Class || raw.Yr || raw.Year || '').trim(),
    Height: String(raw.Height || '').trim(),
    MP: valueLabNum(raw.MP),
    Score: valueLabNum(raw.Score),
    ActualValuation_calc: valueLabNum(raw.ActualValuation_calc),
    actualSpend: valueLabNum(raw.actualSpend),
    FitScore_calc: valueLabNum(raw.FitScore_calc),
  };
  if (!item.key) item.key = valueLabPlayerKey(item);
  return item;
}

function valueLabNormalizeCaseV2(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : raw;
  return {
    id: raw.id == null ? '' : String(raw.id),
    league: raw.league === 'WBB' ? 'WBB' : 'MBB',
    season: String(raw.season || valueLabCurrentSeason()),
    name: String(raw.name || '').trim() || (valueLabCurrentLeague() + ' ' + valueLabCurrentSeason() + ' Case'),
    payload: {
      sourceType: String(payload.sourceType || 'manual').trim() || 'manual',
      actualTeam: String(payload.actualTeam || '').trim(),
      budgetTotal: valueLabNum(payload.budgetTotal),
      players: Array.isArray(payload.players) ? payload.players.map(valueLabNormalizeCasePlayerV2).filter(function (item) {
        return item.Player || item.key;
      }) : [],
    },
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at || new Date().toISOString(),
  };
}

function valueLabLegacySnapshotToCaseV2(raw) {
  raw = raw && typeof raw === 'object' ? raw : {};
  return valueLabNormalizeCaseV2({
    id: raw.id || '',
    league: raw.league || valueLabCurrentLeague(),
    season: raw.season || valueLabCurrentSeason(),
    name: raw.name || (raw.actualTeam ? raw.actualTeam + ' Value Case' : (valueLabCurrentLeague() + ' ' + valueLabCurrentSeason() + ' Case')),
    payload: {
      sourceType: raw.sourceType || 'legacy',
      actualTeam: raw.actualTeam || '',
      players: Array.isArray(raw.players) ? raw.players.map(function (item) {
        var fallback = item && item.fallback ? item.fallback : item;
        return valueLabNormalizeCasePlayerV2(Object.assign({}, fallback || {}, { key: item && item.key ? item.key : '' }));
      }) : [],
    },
    created_at: raw.createdAt ? new Date(raw.createdAt).toISOString() : new Date().toISOString(),
    updated_at: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString(),
  });
}

function valueLabCreateDraftV2(overrides) {
  overrides = overrides && typeof overrides === 'object' ? overrides : {};
  return valueLabNormalizeCaseV2({
    id: overrides.id || '',
    league: overrides.league || valueLabCurrentLeague(),
    season: overrides.season || valueLabCurrentSeason(),
    name: overrides.name || (overrides.actualTeam ? overrides.actualTeam + ' Value Case' : (valueLabCurrentLeague() + ' ' + valueLabCurrentSeason() + ' Case')),
    payload: {
      sourceType: overrides.sourceType || 'manual',
      actualTeam: overrides.actualTeam || '',
      budgetTotal: valueLabNum(overrides.budgetTotal),
      players: Array.isArray(overrides.players) ? overrides.players : [],
    },
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at || new Date().toISOString(),
  });
}

function valueLabFetchV2(path, opts) {
  path = path || '';
  opts = opts || {};
  var token = typeof authGetToken === 'function' ? authGetToken() : null;
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  return fetch(URLS.WORKER + '/value-cases' + path, Object.assign({ credentials: 'include', headers: headers }, opts)).then(async function (res) {
    if (res.status === 401) {
      if (typeof authHandleUnauthorized === 'function') authHandleUnauthorized('Your Value Lab session expired. Please log in again.');
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
  });
}

function valueLabSortCasesV2(list) {
  return (Array.isArray(list) ? list : []).slice().sort(function (a, b) {
    var timeA = Date.parse(a.updated_at || a.created_at || 0) || 0;
    var timeB = Date.parse(b.updated_at || b.created_at || 0) || 0;
    if (timeA !== timeB) return timeB - timeA;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function valueLabCurrentCasesV2() {
  return valueLabSortCasesV2((valueLabCaseState.cases || []).filter(function (caseItem) {
    return caseItem.league === valueLabCurrentLeague() && String(caseItem.season) === valueLabCurrentSeason();
  }));
}

function valueLabFindCaseV2(idValue) {
  var target = String(idValue || '');
  return valueLabCurrentCasesV2().find(function (caseItem) { return String(caseItem.id) === target; }) || null;
}

function valueLabResolveCasePlayersV2(caseItem) {
  var pool = valueLabCurrentPool();
  var byKey = {};
  pool.forEach(function (row) {
    var key = valueLabPlayerKey(row);
    if (key) byKey[key] = row;
  });
  return ((caseItem && caseItem.payload && caseItem.payload.players) || []).map(function (item) {
    var key = item.key || valueLabPlayerKey(item);
    var match = key ? byKey[key] : null;
    if (!match) return valueLabClone(item);
    return valueLabClone(Object.assign({}, match, {
      key: item.key || valueLabPlayerKey(match),
      actualSpend: Number.isFinite(valueLabNum(item.actualSpend)) ? valueLabNum(item.actualSpend) : null,
    }));
  }).filter(Boolean);
}

function valueLabEnsureCurrentCaseV2() {
  var current = valueLabCaseState.currentCase;
  var savedCases = valueLabCurrentCasesV2();
  if (current && current.league === valueLabCurrentLeague() && String(current.season) === valueLabCurrentSeason()) {
    if (!current.id) {
      valueLabSetSelectedCaseIdV2('__draft__');
      return current;
    }
    var refreshed = valueLabFindCaseV2(current.id);
    if (refreshed) {
      if (!valueLabCaseState.dirty) valueLabCaseState.currentCase = valueLabClone(refreshed);
      valueLabSetSelectedCaseIdV2(String(current.id));
      return valueLabCaseState.currentCase;
    }
  }
  var selectedId = valueLabGetSelectedCaseIdV2();
  if (selectedId && selectedId !== '__draft__') {
    var selectedCase = valueLabFindCaseV2(selectedId);
    if (selectedCase) {
      valueLabCaseState.currentCase = valueLabClone(selectedCase);
      valueLabCaseState.dirty = false;
      return valueLabCaseState.currentCase;
    }
  }
  if (savedCases[0]) {
    valueLabCaseState.currentCase = valueLabClone(savedCases[0]);
    valueLabCaseState.dirty = false;
    valueLabSetSelectedCaseIdV2(String(savedCases[0].id));
    return valueLabCaseState.currentCase;
  }
  valueLabCaseState.currentCase = valueLabCreateDraftV2();
  valueLabCaseState.dirty = false;
  valueLabSetSelectedCaseIdV2('__draft__');
  return valueLabCaseState.currentCase;
}

function valueLabSetStatus(message, tone) {
  if (!valueLabSourceStatusEl) return;
  if (valueLabCaseState.statusTimer) {
    clearTimeout(valueLabCaseState.statusTimer);
    valueLabCaseState.statusTimer = null;
  }
  valueLabSourceStatusEl.textContent = message || '';
  valueLabSourceStatusEl.className = 'valueLabStatus' + (tone ? ' ' + tone : '');
  if (message) {
    valueLabCaseState.statusTimer = setTimeout(function () {
      if (!valueLabSourceStatusEl) return;
      valueLabSourceStatusEl.textContent = '';
      valueLabSourceStatusEl.className = 'valueLabStatus';
    }, 3200);
  }
}

function valueLabConfirmDiscardV2(message) {
  return !valueLabCaseState.dirty || window.confirm(message || 'You have unsaved Value Lab changes. Discard them?');
}

async function valueLabBootstrapV2(force) {
  var nextKey = [valueLabStoreKeyV2(), valueLabCurrentLeague(), valueLabCurrentSeason(), valueLabUseLocalModeV2() ? 'local' : 'remote'].join('::');
  if (valueLabCaseState.loading) return;
  if (!force && valueLabCaseState.loadedKey === nextKey) {
    valueLabEnsureCurrentCaseV2();
    return;
  }
  valueLabCaseState.loading = true;
  try {
    if (valueLabUseLocalModeV2()) {
      valueLabCaseState.cases = valueLabCurrentCasesFromLocalV2();
    } else {
      var migrated = await valueLabSyncLocalCasesToBackendV2();
      var data = await valueLabFetchV2('?league=' + encodeURIComponent(valueLabCurrentLeague()) + '&season=' + encodeURIComponent(valueLabCurrentSeason()), { method: 'GET' });
      valueLabCaseState.cases = valueLabSortCasesV2(Array.isArray(data && data.cases) ? data.cases.map(valueLabNormalizeCaseV2) : []);
      if (migrated && valueLabCaseState.cases.length) valueLabSetStatus('Imported your older local Value Lab cases into your account.', 'good');
    }
    valueLabCaseState.loadedKey = nextKey;
    valueLabEnsureCurrentCaseV2();
  } finally {
    valueLabCaseState.loading = false;
  }
}

function valueLabCurrentCasesFromLocalV2() {
  return valueLabSortCasesV2(valueLabReadLocalV2().cases.filter(function (caseItem) {
    caseItem = valueLabNormalizeCaseV2(caseItem);
    return caseItem.league === valueLabCurrentLeague() && String(caseItem.season) === valueLabCurrentSeason();
  }));
}

function valueLabWriteCurrentCasesToLocalV2(cases) {
  var store = valueLabReadLocalV2();
  var seasonKey = valueLabSeasonKeyV2();
  var keepOther = store.cases.filter(function (caseItem) {
    caseItem = valueLabNormalizeCaseV2(caseItem);
    return (caseItem.league + '::' + caseItem.season) !== seasonKey;
  });
  store.cases = keepOther.concat((cases || []).map(valueLabNormalizeCaseV2));
  valueLabWriteLocalV2(store);
}

async function valueLabSyncLocalCasesToBackendV2() {
  if (valueLabUseLocalModeV2()) return false;
  var store = valueLabReadLocalV2();
  var pending = Array.isArray(store.cases) ? store.cases.map(valueLabNormalizeCaseV2) : [];
  if (!pending.length) return false;
  var remaining = [];
  var syncedAny = false;
  for (var i = 0; i < pending.length; i += 1) {
    var caseItem = pending[i];
    try {
      await valueLabFetchV2('', {
        method: 'POST',
        body: JSON.stringify({ league: caseItem.league, season: caseItem.season, name: caseItem.name, payload: caseItem.payload }),
      });
      syncedAny = true;
    } catch (e) {
      if (e && e.status === 409) syncedAny = true;
      else remaining.push(caseItem);
    }
  }
  if (syncedAny || remaining.length !== pending.length) {
    store.cases = remaining;
    valueLabWriteLocalV2(store);
  }
  return syncedAny;
}

function valueLabBuildBundleFromCaseV2() {
  var currentCase = valueLabEnsureCurrentCaseV2();
  return {
    id: currentCase.id || '__draft__',
    mode: 'case',
    sourceType: currentCase.payload.sourceType || 'manual',
    label: currentCase.name || 'Value Lab Case',
    actualTeam: currentCase.payload.actualTeam || '',
    players: valueLabResolveCasePlayersV2(currentCase),
    valueCase: currentCase,
  };
}

function valueLabGetCompareCaseV2() {
  var currentCase = valueLabEnsureCurrentCaseV2();
  var targetId = String(valueLabCaseState.compareCaseId || '').trim();
  if (!targetId) return null;
  var compareCase = valueLabFindCaseV2(targetId);
  if (!compareCase) return null;
  if (currentCase.id && String(compareCase.id) === String(currentCase.id)) return null;
  return compareCase;
}

function valueLabBuildCompareBundleV2(compareCase) {
  compareCase = compareCase ? valueLabNormalizeCaseV2(compareCase) : valueLabGetCompareCaseV2();
  if (!compareCase) return null;
  return {
    id: compareCase.id || '',
    mode: 'caseCompare',
    sourceType: compareCase.payload.sourceType || 'manual',
    label: compareCase.name || 'Compare Case',
    actualTeam: compareCase.payload.actualTeam || '',
    players: valueLabResolveCasePlayersV2(compareCase),
    valueCase: compareCase,
  };
}

function valueLabBuildCompareRosterDiff(currentAnalysis, compareAnalysis) {
  currentAnalysis = currentAnalysis && !currentAnalysis.empty ? currentAnalysis : null;
  compareAnalysis = compareAnalysis && !compareAnalysis.empty ? compareAnalysis : null;
  if (!currentAnalysis || !compareAnalysis) return null;
  var compareKeys = new Set(compareAnalysis.players.map(function (row) { return row.key || valueLabPlayerKey(row); }));
  var currentKeys = new Set(currentAnalysis.players.map(function (row) { return row.key || valueLabPlayerKey(row); }));
  var onlyCurrent = currentAnalysis.players.filter(function (row) {
    return !compareKeys.has(row.key || valueLabPlayerKey(row));
  }).sort(function (a, b) {
    return (b.spendBasis || b.valuation || 0) - (a.spendBasis || a.valuation || 0);
  });
  var onlyCompare = compareAnalysis.players.filter(function (row) {
    return !currentKeys.has(row.key || valueLabPlayerKey(row));
  }).sort(function (a, b) {
    return (b.spendBasis || b.valuation || 0) - (a.spendBasis || a.valuation || 0);
  });
  return {
    sharedCount: currentAnalysis.players.length - onlyCurrent.length,
    onlyCurrent: onlyCurrent,
    onlyCompare: onlyCompare,
  };
}

function valueLabFmtSigned(value, digits, suffix) {
  var n = valueLabNum(value);
  if (!Number.isFinite(n)) return '—';
  var fixed = Number.isFinite(digits) ? n.toFixed(digits) : String(Math.round(n));
  return (n >= 0 ? '+' : '') + fixed + (suffix || '');
}

function valueLabCompareMetricTone(delta, preferLower) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0001) return 'neutral';
  var currentBetter = preferLower ? delta < 0 : delta > 0;
  return currentBetter ? 'good' : 'warn';
}

function valueLabBuildCompareTakeaways(currentAnalysis, compareAnalysis, rosterDiff) {
  var notes = [];
  if (currentAnalysis && currentAnalysis.outcome && compareAnalysis && compareAnalysis.outcome &&
      Number.isFinite(currentAnalysis.outcome.projectedFullWins) && Number.isFinite(compareAnalysis.outcome.projectedFullWins)) {
    var winDelta = currentAnalysis.outcome.projectedFullWins - compareAnalysis.outcome.projectedFullWins;
    if (Math.abs(winDelta) >= 0.4) {
      notes.push((winDelta > 0 ? currentAnalysis.bundle.label : compareAnalysis.bundle.label) +
        ' projects ' + Math.abs(winDelta).toFixed(1) + ' more wins on the same schedule context.');
    }
  }
  if (Number.isFinite(currentAnalysis.perfPer100kActual || currentAnalysis.perfPer100k) &&
      Number.isFinite(compareAnalysis.perfPer100kActual || compareAnalysis.perfPer100k)) {
    var efficiencyDelta = (currentAnalysis.perfPer100kActual || currentAnalysis.perfPer100k) - (compareAnalysis.perfPer100kActual || compareAnalysis.perfPer100k);
    if (Math.abs(efficiencyDelta) >= 0.8) {
      notes.push((efficiencyDelta > 0 ? currentAnalysis.bundle.label : compareAnalysis.bundle.label) +
        ' is returning better performance per $100k, which is the cleaner bang-for-buck build right now.');
    }
  }
  if (Number.isFinite(currentAnalysis.budgetRemaining) && Number.isFinite(compareAnalysis.budgetRemaining)) {
    var budgetDelta = currentAnalysis.budgetRemaining - compareAnalysis.budgetRemaining;
    if (Math.abs(budgetDelta) >= 25000) {
      notes.push((budgetDelta > 0 ? currentAnalysis.bundle.label : compareAnalysis.bundle.label) +
        ' keeps ' + valueLabFmtMoney(Math.abs(budgetDelta)) + ' more budget room for late portal or retention moves.');
    }
  }
  if (Number.isFinite(currentAnalysis.roiGap) && Number.isFinite(compareAnalysis.roiGap)) {
    var roiDelta = currentAnalysis.roiGap - compareAnalysis.roiGap;
    if (Math.abs(roiDelta) >= 4) {
      notes.push((roiDelta > 0 ? currentAnalysis.bundle.label : compareAnalysis.bundle.label) +
        ' is outperforming its spend tier more convincingly on the current player model.');
    }
  }
  if (rosterDiff && (rosterDiff.onlyCurrent.length || rosterDiff.onlyCompare.length)) {
    notes.push('Roster overlap is ' + rosterDiff.sharedCount + ' shared players, with ' + rosterDiff.onlyCurrent.length +
      ' unique to the active case and ' + rosterDiff.onlyCompare.length + ' unique to the comparison case.');
  }
  if (!notes.length) {
    notes.push('The two cases are reading pretty close right now, so the choice may come down to fit preference or which contracts you trust more.');
  }
  return notes.slice(0, 4);
}
function valueLabRenderSourceControls() {
  if (!valueLabCaseSelectEl2 || !valueLabCaseNameEl2 || !valueLabTeamImportSelectEl2) return;
  var currentCase = valueLabEnsureCurrentCaseV2();
  var savedCases = valueLabCurrentCasesV2();
  var teams = valueLabCurrentTeams();
  var teamHubTeam = valueLabCanonicalTeamName(valueLabGetTeamHubTeam(), teams);
  var builderCount = Array.isArray(tbRoster) ? tbRoster.length : 0;
  var compareableCases = savedCases.filter(function (caseItem) {
    return !currentCase.id || String(caseItem.id) !== String(currentCase.id);
  });

  valueLabCaseSelectEl2.innerHTML = '';
  if (!currentCase.id) {
    var draftOpt = document.createElement('option');
    draftOpt.value = '__draft__';
    draftOpt.textContent = 'Unsaved draft';
    valueLabCaseSelectEl2.appendChild(draftOpt);
  }
  savedCases.forEach(function (caseItem) {
    var opt = document.createElement('option');
    opt.value = String(caseItem.id);
    var stamp = caseItem.updated_at ? new Date(caseItem.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    opt.textContent = caseItem.name + (stamp ? ' - ' + stamp : '');
    valueLabCaseSelectEl2.appendChild(opt);
  });
  valueLabCaseSelectEl2.value = currentCase.id ? String(currentCase.id) : '__draft__';
  valueLabCaseNameEl2.value = currentCase.name || '';
  if (valueLabBudgetInputEl2) valueLabBudgetInputEl2.value = Number.isFinite(valueLabNum(currentCase.payload.budgetTotal)) ? String(valueLabNum(currentCase.payload.budgetTotal)) : '';

  valueLabTeamImportSelectEl2.innerHTML = '<option value="">- Select team to import -</option>' + teams.map(function (team) {
    return '<option value="' + team.replace(/"/g, '&quot;') + '">' + team + '</option>';
  }).join('');
  var selectedImportTeam = currentCase.payload.actualTeam || valueLabCaseState.pendingTeamImport || '';
  valueLabTeamImportSelectEl2.value = teams.some(function (team) {
    return valueLabNorm(team) === valueLabNorm(selectedImportTeam);
  }) ? selectedImportTeam : '';
  valueLabCaseState.pendingTeamImport = valueLabTeamImportSelectEl2.value || '';

  if (valueLabCompareSelectEl2) {
    var compareId = String(valueLabCaseState.compareCaseId || '');
    if (!compareableCases.some(function (caseItem) { return String(caseItem.id) === compareId; })) {
      valueLabCaseState.compareCaseId = '';
      compareId = '';
    }
    valueLabCompareSelectEl2.innerHTML = '<option value="">— No comparison —</option>' + compareableCases.map(function (caseItem) {
      var stamp = caseItem.updated_at ? new Date(caseItem.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      return '<option value="' + String(caseItem.id).replace(/"/g, '&quot;') + '">' + valueLabEsc(caseItem.name) + (stamp ? ' - ' + stamp : '') + '</option>';
    }).join('');
    valueLabCompareSelectEl2.value = compareId;
    valueLabCompareSelectEl2.disabled = !compareableCases.length;
  }

  if (valueLabSaveBtnEl) valueLabSaveBtnEl.textContent = valueLabUseLocalModeV2() ? 'Save Locally' : 'Save Case';
  if (valueLabDeleteBtnEl) valueLabDeleteBtnEl.disabled = !(currentCase.id || (currentCase.payload.players && currentCase.payload.players.length));
  if (valueLabDuplicateBtnEl2) valueLabDuplicateBtnEl2.disabled = !(currentCase.payload.players && currentCase.payload.players.length);
  if (valueLabImportHubBtnEl2) valueLabImportHubBtnEl2.disabled = !teamHubTeam;
  if (valueLabImportBuilderBtnEl2) valueLabImportBuilderBtnEl2.disabled = !builderCount;
  if (valueLabImportTeamBtnEl2) valueLabImportTeamBtnEl2.disabled = !valueLabTeamImportSelectEl2.value;

  if (valueLabSourceMetaEl) {
    var meta = [];
    meta.push(valueLabCurrentLeague() + ' ' + valueLabCurrentSeason());
    meta.push(savedCases.length + ' saved case' + (savedCases.length === 1 ? '' : 's'));
    meta.push(valueLabUseLocalModeV2() ? 'guest/local save mode' : 'account-backed save mode');
    meta.push('current source: ' + (currentCase.payload.sourceType || 'manual'));
    if (currentCase.payload.actualTeam) meta.push('team context: ' + currentCase.payload.actualTeam);
    if (Number.isFinite(valueLabNum(currentCase.payload.budgetTotal))) meta.push('budget: ' + valueLabFmtMoney(currentCase.payload.budgetTotal));
    if (teamHubTeam) meta.push('Team Hub ready: ' + teamHubTeam);
    if (builderCount) meta.push('Team Builder ready: ' + builderCount + ' players');
    if (valueLabCaseState.compareCaseId) {
      var compareCase = valueLabGetCompareCaseV2();
      if (compareCase) meta.push('comparing vs: ' + compareCase.name);
    }
    if (valueLabCaseState.dirty) meta.push('unsaved changes');
    valueLabSourceMetaEl.textContent = meta.join(' · ');
  }
}

function valueLabEmptyMessage(bundle) {
  bundle = bundle || valueLabBuildBundleFromCaseV2();
  if (bundle.actualTeam) {
    return 'No players were found for ' + bundle.actualTeam + ' in the current ' + valueLabCurrentLeague() + ' ' + valueLabCurrentSeason() + ' data.';
  }
  return 'Create a Value Lab case, then add players manually or import a roster to start the investment view.';
}

function valueLabGetSourceBundle() {
  return valueLabBuildBundleFromCaseV2();
}

function valueLabAddPlayerToCaseV2(row) {
  if (!row) return;
  var currentCase = valueLabClone(valueLabEnsureCurrentCaseV2());
  var players = Array.isArray(currentCase.payload.players) ? currentCase.payload.players.slice() : [];
  var key = valueLabPlayerKey(row);
  if (players.some(function (item) { return (item.key || valueLabPlayerKey(item)) === key; })) {
    valueLabSetStatus((row.Player || 'Player') + ' is already in this case.', 'warn');
    return;
  }
  players.push(valueLabNormalizeCasePlayerV2(row));
  currentCase.payload.players = players;
  if (currentCase.payload.actualTeam && valueLabNorm(row.Team) !== valueLabNorm(currentCase.payload.actualTeam)) {
    currentCase.payload.actualTeam = '';
    currentCase.payload.sourceType = 'manual';
  }
  valueLabCaseState.currentCase = currentCase;
  valueLabCaseState.dirty = true;
  valueLabSetStatus('Added ' + (row.Player || 'player') + ' to this case.', 'good');
  valueLabRefresh(false);
}

function valueLabRenderQuickAddV2(query) {
  if (!valueLabQuickAddDropdownEl2) return;
  var q = valueLabNorm(query);
  if (!q) {
    valueLabQuickAddDropdownEl2.innerHTML = '';
    valueLabQuickAddDropdownEl2.style.display = 'none';
    return;
  }
  var rosterKeys = new Set(((valueLabCaseState.currentCase && valueLabCaseState.currentCase.payload && valueLabCaseState.currentCase.payload.players) || []).map(function (item) {
    return item.key || valueLabPlayerKey(item);
  }));
  var matches = valueLabCurrentPool().filter(function (row) {
    return !rosterKeys.has(valueLabPlayerKey(row)) && ((row.Player || '').toLowerCase().indexOf(q) >= 0 || (row.Team || '').toLowerCase().indexOf(q) >= 0);
  }).slice(0, 10);
  if (!matches.length) {
    valueLabQuickAddDropdownEl2.innerHTML = '';
    valueLabQuickAddDropdownEl2.style.display = 'none';
    return;
  }
  valueLabQuickAddDropdownEl2.innerHTML = matches.map(function (row) {
    return '<div class="tbQuickAddItem" data-key="' + valueLabPlayerKey(row) + '"><div><div class="qName">' + (row.Player || 'Player') + '</div><div class="qMeta">' + (row.Team || 'Unknown team') + ' · ' + (row.Position || row.Pos || '—') + ' · ' + (Number.isFinite(valueLabNum(row.Score)) ? valueLabNum(row.Score).toFixed(1) : '—') + ' perf</div></div><button class="qAdd">+ Add</button></div>';
  }).join('');
  valueLabQuickAddDropdownEl2.style.display = 'block';
  valueLabQuickAddDropdownEl2.querySelectorAll('.tbQuickAddItem').forEach(function (el) {
    var add = function () {
      var key = el.getAttribute('data-key');
      var player = valueLabCurrentPool().find(function (row) { return valueLabPlayerKey(row) === key; });
      if (!player) return;
      valueLabAddPlayerToCaseV2(player);
      if (valueLabQuickAddInputEl2) valueLabQuickAddInputEl2.value = '';
      valueLabQuickAddDropdownEl2.innerHTML = '';
      valueLabQuickAddDropdownEl2.style.display = 'none';
    };
    el.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'BUTTON') e.stopPropagation();
      add();
    });
  });
}

function valueLabImportTeamByNameV2(teamName, options) {
  options = options && typeof options === 'object' ? options : {};
  var canonical = valueLabCanonicalTeamName(teamName);
  var previousCase = valueLabClone(valueLabEnsureCurrentCaseV2());
  if (!canonical) {
    valueLabSetStatus('Choose a team to import first.', 'warn');
    return;
  }
  var players = valueLabCurrentPool().filter(function (row) {
    return valueLabNorm(row.Team) === valueLabNorm(canonical);
  });
  if (!players.length) {
    valueLabSetStatus('No players found for ' + canonical + ' in ' + valueLabCurrentLeague() + ' ' + valueLabCurrentSeason() + '.', 'warn');
    return;
  }
  if ((valueLabCaseState.currentCase && valueLabCaseState.currentCase.payload && valueLabCaseState.currentCase.payload.players.length) && options.confirm !== false && !window.confirm('Replace the current Value Lab roster with ' + canonical + '?')) return;
  valueLabCaseState.currentCase = valueLabCreateDraftV2({
    id: previousCase && previousCase.id ? previousCase.id : '',
    name: canonical + ' Value Case',
    sourceType: options.sourceType || 'teamImport',
    actualTeam: canonical,
    budgetTotal: previousCase && previousCase.payload ? previousCase.payload.budgetTotal : null,
    players: players,
  });
  if (valueLabCaseState.currentCase.id) valueLabCaseState.currentCase.id = String(valueLabCaseState.currentCase.id);
  valueLabCaseState.pendingTeamImport = canonical;
  valueLabCaseState.dirty = true;
  valueLabSetStatus('Imported ' + canonical + ' into this Value Lab case.', 'good');
  valueLabRefresh(false);
}

function valueLabImportBuilderV2(options) {
  options = options && typeof options === 'object' ? options : {};
  var roster = valueLabClone(Array.isArray(tbRoster) ? tbRoster : []);
  var previousCase = valueLabClone(valueLabEnsureCurrentCaseV2());
  if (!roster.length) {
    valueLabSetStatus('Build a Team Builder roster first.', 'warn');
    return;
  }
  if ((valueLabCaseState.currentCase && valueLabCaseState.currentCase.payload && valueLabCaseState.currentCase.payload.players.length) && options.confirm !== false && !window.confirm('Replace the current Value Lab roster with the Team Builder scenario?')) return;
  valueLabCaseState.currentCase = valueLabCreateDraftV2({
    id: previousCase && previousCase.id ? previousCase.id : '',
    name: (previousCase && previousCase.name) || (valueLabCurrentLeague() + ' Scenario Case'),
    sourceType: 'teamBuilder',
    actualTeam: '',
    budgetTotal: previousCase && previousCase.payload ? previousCase.payload.budgetTotal : null,
    players: roster,
  });
  valueLabCaseState.dirty = true;
  valueLabSetStatus('Copied the current Team Builder roster into this case.', 'good');
  valueLabRefresh(false);
}

function valueLabFindCasePlayerIndexV2(currentCase, row) {
  currentCase = currentCase && typeof currentCase === 'object' ? currentCase : {};
  var players = currentCase.payload && Array.isArray(currentCase.payload.players) ? currentCase.payload.players : [];
  var targetKey = String(row && row.key || '').trim() || valueLabPlayerKey(row);
  for (var i = 0; i < players.length; i += 1) {
    var candidate = players[i];
    var candidateKey = String(candidate && candidate.key || '').trim() || valueLabPlayerKey(candidate);
    if (targetKey && candidateKey === targetKey) return i;
  }
  return -1;
}

function valueLabDeltaToneClass(row) {
  if (!row || !Number.isFinite(row.delta)) return '';
  if (row.delta <= 0) return 'valueLabDeltaGood';
  if (Number.isFinite(row.deltaPct) && row.deltaPct >= 0.15) return 'valueLabDeltaBad';
  return 'valueLabDeltaWarn';
}

function valueLabRenderRosterTable(analysis) {
  if (!valueLabRosterBodyEl || !valueLabRosterEmptyEl) return;
  valueLabRosterBodyEl.innerHTML = '';
  if (!analysis || analysis.empty) {
    valueLabRosterEmptyEl.textContent = (analysis && analysis.emptyMessage) || 'Create a Value Lab case to load the roster table.';
    valueLabRosterEmptyEl.style.display = '';
    return;
  }
  valueLabRosterEmptyEl.style.display = 'none';
  var fragment = document.createDocumentFragment();
  analysis.players.forEach(function (row) {
    var tr = document.createElement('tr');
    var deltaText = Number.isFinite(row.delta) ? ((row.delta >= 0 ? '+' : '-') + valueLabFmtMoney(Math.abs(row.delta))) : '—';
    var surplusText = Number.isFinite(row.surplus) ? ((row.surplus >= 0 ? '+' : '') + row.surplus.toFixed(1)) : '—';
    var playerBadges = [];
    if (row.riskLabel && row.riskLabel !== 'Low') {
      playerBadges.push('<span class="playersProjectionBadge playersProjectionBadge--' + row.riskTone + '">Risk ' + valueLabEsc(row.riskLabel) + '</span>');
    }
    if (row.projectionLed) {
      playerBadges.push('<span class="playersProjectionBadge playersProjectionBadge--' + row.confidenceTone + '">Projection bet</span>');
    }
    tr.innerHTML = '<td><div class="valueLabPlayerCell"><span class="link valueLabPlayerLink">' + (row.Player || '—') + '</span>' +
      (playerBadges.length ? '<div class="playersProjectionBadges valueLabPlayerBadges">' + playerBadges.join('') + '</div>' : '') +
      (row.projectionNote ? '<div class="valueLabPlayerMeta">' + valueLabEsc(row.projectionNote) + '</div>' : '') +
      '</div></td>' +
      '<td>' + (row.Team || '—') + '</td>' +
      '<td>' + (row.posLabel || '—') + '</td>' +
      '<td>' + (row.classBucket || '—') + '</td>' +
      '<td class="playersPerfCell"><div>' + (Number.isFinite(row.productionPerf) ? row.productionPerf.toFixed(1) : '—') + '</div><div class="valueLabCellSub">Projection ' + (Number.isFinite(row.perf) ? row.perf.toFixed(1) : '—') + '</div></td>' +
      '<td>' + valueLabFmtMoney(row.valuation) + '</td>' +
      '<td><input class="valueLabSpendInput" type="number" min="0" step="1000" placeholder="-" value="' + (Number.isFinite(row.actualSpend) ? Math.round(row.actualSpend) : '') + '"></td>' +
      '<td class="' + valueLabDeltaToneClass(row) + '">' + deltaText + '</td>' +
      '<td class="valueLabProjectionCell" title="' + valueLabEsc(row.projectionNote || 'Projection range') + '"><div class="valueLabProjectionMain">' + valueLabFmtMoney(row.floorValue) + ' / ' + valueLabFmtMoney(row.valuation) + ' / ' + valueLabFmtMoney(row.ceilingValue) + '</div><div class="valueLabCellSub">Floor / Median / Ceiling</div></td>' +
      '<td style="font-weight:800;color:' + (row.roiTone === 'good' ? 'var(--good)' : row.roiTone === 'bad' ? 'var(--bad)' : row.roiTone === 'warn' ? 'var(--warn)' : 'var(--muted)') + '">' + surplusText + '</td>' +
      '<td><span class="playersProjectionBadge playersProjectionBadge--' + row.confidenceTone + '">' + valueLabEsc(row.confidenceLabel) + '</span><div class="valueLabCellSub">' + (Number.isFinite(row.confidence) ? Math.round(row.confidence * 100) + '%' : '—') + '</div></td>' +
      '<td><span class="valueLabRoiTag valueLabRoiTag--' + row.roiTone + '" title="' + valueLabEsc(valueLabRoiTooltipText(row)) + '" aria-label="' + valueLabEsc(valueLabRoiTooltipText(row)) + '">' + row.roiLabel + '</span></td>' +
      '<td><div class="valueLabActionStack"><button class="secondary valueLabScoutBtn" type="button">Scout</button><button class="tbRemoveBtn valueLabRemoveBtn" type="button">✕</button></div></td>';
    var link = tr.querySelector('.valueLabPlayerLink');
    if (link) link.addEventListener('click', function () { if (typeof openProfile === 'function') openProfile(row); });
    var spendInput = tr.querySelector('.valueLabSpendInput');
    if (spendInput) spendInput.addEventListener('change', function () {
      var currentCase = valueLabClone(valueLabEnsureCurrentCaseV2());
      var playerIndex = valueLabFindCasePlayerIndexV2(currentCase, row);
      if (playerIndex < 0) return;
      var nextSpend = valueLabNum(spendInput.value);
      currentCase.payload.players[playerIndex].actualSpend = Number.isFinite(nextSpend) ? nextSpend : null;
      valueLabCaseState.currentCase = currentCase;
      valueLabCaseState.dirty = true;
      valueLabSetStatus((row.Player || 'Player') + ' contract updated.', 'good');
      valueLabRefresh(false);
    });
    var scoutBtn = tr.querySelector('.valueLabScoutBtn');
    if (scoutBtn) scoutBtn.addEventListener('click', function () {
      if (typeof openProjectionScoutModal === 'function') openProjectionScoutModal(row);
    });
    var removeBtn = tr.querySelector('.valueLabRemoveBtn');
    if (removeBtn) removeBtn.addEventListener('click', function () {
      var currentCase = valueLabClone(valueLabEnsureCurrentCaseV2());
      var playerIndex = valueLabFindCasePlayerIndexV2(currentCase, row);
      if (!currentCase.payload.players || playerIndex < 0 || playerIndex >= currentCase.payload.players.length) return;
      currentCase.payload.players.splice(playerIndex, 1);
      valueLabCaseState.currentCase = currentCase;
      valueLabCaseState.dirty = true;
      valueLabRefresh(false);
    });
    fragment.appendChild(tr);
  });
  valueLabRosterBodyEl.appendChild(fragment);
}
async function valueLabRefresh(forceBootstrap) {
  if (!valueLabCaseSelectEl2) return;
  await valueLabBootstrapV2(!!forceBootstrap);
  var bundle = valueLabBuildBundleFromCaseV2();
  var analysis = valueLabBuildAnalysis(bundle);
  var compareBundle = valueLabBuildCompareBundleV2();
  var compareAnalysis = compareBundle ? valueLabBuildAnalysis(compareBundle) : null;
  valueLabCaseState.lastAnalysis = analysis;
  valueLabCaseState.lastCompareAnalysis = compareAnalysis;
  valueLabRenderAll(analysis, compareAnalysis);
  valueLabRenderPortalWatch({ loading: true });
  if (valueLabAIOutputEl && valueLabAIOutputEl.style.display !== 'none') {
    valueLabSetAIStatus('Case changed — rerun Director Brief to refresh the executive summary.');
  }
  var refreshToken = ++valueLabCaseState.refreshToken;
  if (valueLabOutcomeEl && !analysis.empty) valueLabOutcomeEl.innerHTML = '<div class="valueLabLoading">Projecting case outcome and spend efficiency...</div>';
  if (valueLabCompareSummaryEl && compareAnalysis && !compareAnalysis.empty) {
    valueLabRenderComparison(analysis, compareAnalysis);
  }
  var outcomes = await Promise.all([
    analysis.empty ? Promise.resolve(null) : valueLabBuildOutcome(analysis),
    (!compareAnalysis || compareAnalysis.empty) ? Promise.resolve(null) : valueLabBuildOutcome(compareAnalysis)
  ]);
  if (refreshToken !== valueLabCaseState.refreshToken) return;
  analysis.outcome = outcomes[0];
  if (compareAnalysis) compareAnalysis.outcome = outcomes[1];
  valueLabCaseState.lastAnalysis = analysis;
  valueLabCaseState.lastCompareAnalysis = compareAnalysis;
  valueLabRenderOutcome(analysis);
  valueLabRenderComparison(analysis, compareAnalysis);
  var portalCtx = await valueLabGetPortalPool()
    .then(function (portalPack) { return valueLabBuildPortalTargets(analysis, portalPack); })
    .catch(function (e) { return { supported: false, targets: [], note: e && e.message ? e.message : 'Portal value watch unavailable right now.' }; });
  if (refreshToken !== valueLabCaseState.refreshToken) return;
  valueLabCaseState.lastPortalTargets = portalCtx;
  valueLabRenderPortalWatch(portalCtx);
}

async function valueLabSaveCaseV2() {
  await valueLabBootstrapV2(false);
  var currentCase = valueLabClone(valueLabEnsureCurrentCaseV2());
  currentCase.name = String(valueLabCaseNameEl2 && valueLabCaseNameEl2.value || currentCase.name || '').trim() || (valueLabCurrentLeague() + ' ' + valueLabCurrentSeason() + ' Case');
  currentCase.payload.players = (currentCase.payload.players || []).map(valueLabNormalizeCasePlayerV2);
  try {
    if (valueLabUseLocalModeV2()) {
      var cases = valueLabCurrentCasesFromLocalV2();
      var nowIso = new Date().toISOString();
      if (!currentCase.id) {
        currentCase.id = 'vl_local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        currentCase.created_at = nowIso;
      }
      currentCase.updated_at = nowIso;
      cases = cases.filter(function (caseItem) { return String(caseItem.id) !== String(currentCase.id); });
      cases.unshift(currentCase);
      valueLabWriteCurrentCasesToLocalV2(cases);
      valueLabCaseState.cases = valueLabCurrentCasesFromLocalV2();
      valueLabCaseState.currentCase = valueLabClone(currentCase);
      valueLabCaseState.dirty = false;
      valueLabSetSelectedCaseIdV2(String(currentCase.id));
      valueLabSetStatus('Saved Value Lab case locally in this browser.', 'good');
    } else {
      var data = await valueLabFetchV2(currentCase.id ? ('/' + encodeURIComponent(currentCase.id)) : '', {
        method: currentCase.id ? 'PATCH' : 'POST',
        body: JSON.stringify({ league: currentCase.league, season: currentCase.season, name: currentCase.name, payload: currentCase.payload }),
      });
      var savedCase = valueLabNormalizeCaseV2(data && data.case ? data.case : currentCase);
      valueLabCaseState.cases = valueLabSortCasesV2((valueLabCaseState.cases || []).filter(function (caseItem) {
        return String(caseItem.id) !== String(savedCase.id);
      }).concat([savedCase]));
      valueLabCaseState.currentCase = valueLabClone(savedCase);
      valueLabCaseState.dirty = false;
      valueLabSetSelectedCaseIdV2(String(savedCase.id));
      valueLabSetStatus('Saved Value Lab case to your account.', 'good');
    }
    valueLabRefresh(false);
  } catch (e) {
    valueLabSetStatus(e && e.message ? e.message : 'Unable to save Value Lab case.', 'bad');
  }
}

async function valueLabDeleteCaseV2() {
  await valueLabBootstrapV2(false);
  var currentCase = valueLabEnsureCurrentCaseV2();
  if (!currentCase.id) {
    if (!(currentCase.payload.players && currentCase.payload.players.length)) {
      valueLabSetStatus('This draft is already empty.', 'warn');
      return;
    }
    if (!window.confirm('Clear this unsaved Value Lab draft?')) return;
    valueLabCaseState.currentCase = valueLabCreateDraftV2();
    valueLabCaseState.dirty = false;
    valueLabSetSelectedCaseIdV2('__draft__');
    valueLabRefresh(false);
    return;
  }
  if (!window.confirm('Delete Value Lab case "' + currentCase.name + '"?')) return;
  try {
    if (valueLabUseLocalModeV2()) {
      var localCases = valueLabCurrentCasesFromLocalV2().filter(function (caseItem) { return String(caseItem.id) !== String(currentCase.id); });
      valueLabWriteCurrentCasesToLocalV2(localCases);
      valueLabCaseState.cases = valueLabCurrentCasesFromLocalV2();
    } else {
      await valueLabFetchV2('/' + encodeURIComponent(currentCase.id), { method: 'DELETE' });
      valueLabCaseState.cases = (valueLabCaseState.cases || []).filter(function (caseItem) { return String(caseItem.id) !== String(currentCase.id); });
    }
    valueLabCaseState.currentCase = null;
    valueLabCaseState.dirty = false;
    valueLabEnsureCurrentCaseV2();
    valueLabSetStatus('Deleted Value Lab case "' + currentCase.name + '".', 'good');
    valueLabRefresh(false);
  } catch (e) {
    valueLabSetStatus(e && e.message ? e.message : 'Unable to delete Value Lab case.', 'bad');
  }
}

function valueLabHandleRosterChange() {
  if (window._dashboardCurrentPageId === 'pageValueLab') valueLabRefresh(false);
  else valueLabRenderSourceControls();
}

function valueLabHandleDataChange() {
  valueLabCaseState.loadedKey = '';
  valueLabCaseState.cases = [];
  valueLabCaseState.currentCase = null;
  valueLabCaseState.compareCaseId = '';
  valueLabCaseState.dirty = false;
  valueLabCaseState.lastAnalysis = null;
  valueLabCaseState.lastCompareAnalysis = null;
  valueLabCaseState.lastPortalTargets = null;
  valueLabCaseState.portalCache = { key: '', items: [], meta: null };
  if (valueLabAIOutputEl) {
    valueLabAIOutputEl.style.display = 'none';
    valueLabAIOutputEl.innerHTML = '';
    if (valueLabAIOutputEl.dataset) {
      delete valueLabAIOutputEl.dataset.lastRaw;
      delete valueLabAIOutputEl.dataset.lastSignature;
      delete valueLabAIOutputEl.dataset.lastGeneratedAt;
    }
  }
  valueLabSetAIStatus('');
  if (window._dashboardCurrentPageId === 'pageValueLab') valueLabRefresh(true);
}

async function valueLabOpenActualTeam(teamName) {
  if (typeof showDashboardPage === 'function') showDashboardPage('pageValueLab');
  await valueLabRefresh(false);
  if (!valueLabConfirmDiscardV2('Discard the current unsaved Value Lab changes and import the Team Hub team?')) return;
  valueLabImportTeamByNameV2(teamName || valueLabGetTeamHubTeam(), { sourceType: 'teamHub', confirm: false });
}

async function valueLabOpenScenario() {
  if (typeof showDashboardPage === 'function') showDashboardPage('pageValueLab');
  await valueLabRefresh(false);
  if (!valueLabConfirmDiscardV2('Discard the current unsaved Value Lab changes and import the Team Builder roster?')) return;
  valueLabImportBuilderV2({ confirm: false });
}

function initValueLabPage() {
  valueLabCaseSelectEl2 = document.getElementById('valueLabCaseSelect');
  valueLabCaseNameEl2 = document.getElementById('valueLabCaseName');
  valueLabTeamImportSelectEl2 = document.getElementById('valueLabTeamImportSelect');
  valueLabCompareSelectEl2 = document.getElementById('valueLabCompareSelect');
  valueLabQuickAddInputEl2 = document.getElementById('valueLabQuickAddInput');
  valueLabQuickAddDropdownEl2 = document.getElementById('valueLabQuickAddDropdown');
  valueLabNewCaseBtnEl2 = document.getElementById('valueLabNewCaseBtn');
  valueLabDuplicateBtnEl2 = document.getElementById('valueLabDuplicateBtn');
  valueLabClearCaseBtnEl2 = document.getElementById('valueLabClearCaseBtn');
  valueLabImportHubBtnEl2 = document.getElementById('valueLabImportHubBtn');
  valueLabImportBuilderBtnEl2 = document.getElementById('valueLabImportBuilderBtn');
  valueLabImportTeamBtnEl2 = document.getElementById('valueLabImportTeamBtn');
  valueLabBudgetInputEl2 = document.getElementById('valueLabBudgetInput');
  valueLabSaveBtnEl = document.getElementById('valueLabSaveBtn');
  valueLabDeleteBtnEl = document.getElementById('valueLabDeleteBtn');
  valueLabSourceMetaEl = document.getElementById('valueLabSourceMeta');
  valueLabSourceStatusEl = document.getElementById('valueLabSourceStatus');
  valueLabKpisEl = document.getElementById('valueLabKpis');
  valueLabInsightsEl = document.getElementById('valueLabInsights');
  valueLabOutcomeEl = document.getElementById('valueLabOutcome');
  valueLabScatterEl = document.getElementById('valueLabScatter');
  valueLabBreakdownsEl = document.getElementById('valueLabBreakdowns');
  valueLabRosterBodyEl = document.getElementById('valueLabRosterBody');
  valueLabRosterEmptyEl = document.getElementById('valueLabRosterEmpty');
  valueLabOpenTeamBuilderBtnEl = document.getElementById('valueLabOpenTeamBuilderBtn');
  valueLabOpenTeamHubBtnEl = document.getElementById('valueLabOpenTeamHubBtn');
  valueLabAIRunBtnEl = document.getElementById('valueLabAIRunBtn');
  valueLabAIPdfBtnEl = document.getElementById('valueLabAIPdfBtn');
  valueLabAIStatusEl = document.getElementById('valueLabAIStatus');
  valueLabAIOutputEl = document.getElementById('valueLabAIOutput');
  valueLabPortalWatchEl = document.getElementById('valueLabPortalWatch');
  valueLabCompareSummaryEl = document.getElementById('valueLabCompareSummary');
  if (!valueLabCaseSelectEl2) return;

  if (!valueLabCaseSelectEl2._bound) {
    valueLabCaseSelectEl2.addEventListener('change', function () {
      var nextId = String(valueLabCaseSelectEl2.value || '__draft__');
      if (!valueLabConfirmDiscardV2('Discard the current unsaved Value Lab changes and switch cases?')) {
        valueLabRenderSourceControls();
        return;
      }
      if (nextId === '__draft__') valueLabCaseState.currentCase = valueLabCreateDraftV2();
      else valueLabCaseState.currentCase = valueLabClone(valueLabFindCaseV2(nextId) || valueLabCreateDraftV2());
      valueLabCaseState.pendingTeamImport = '';
      valueLabCaseState.dirty = false;
      valueLabSetSelectedCaseIdV2(nextId);
      valueLabRefresh(false);
    });
    valueLabCaseSelectEl2._bound = true;
  }
  if (valueLabCaseNameEl2 && !valueLabCaseNameEl2._bound) {
    valueLabCaseNameEl2.addEventListener('input', function () {
      var currentCase = valueLabClone(valueLabEnsureCurrentCaseV2());
      currentCase.name = String(valueLabCaseNameEl2.value || '').trim();
      valueLabCaseState.currentCase = currentCase;
      valueLabCaseState.dirty = true;
      valueLabRenderSourceControls();
    });
    valueLabCaseNameEl2._bound = true;
  }
  if (valueLabBudgetInputEl2 && !valueLabBudgetInputEl2._bound) {
    valueLabBudgetInputEl2.addEventListener('input', function () {
      var currentCase = valueLabClone(valueLabEnsureCurrentCaseV2());
      currentCase.payload.budgetTotal = valueLabNum(valueLabBudgetInputEl2.value);
      valueLabCaseState.currentCase = currentCase;
      valueLabCaseState.dirty = true;
      valueLabRenderSourceControls();
    });
    valueLabBudgetInputEl2._bound = true;
  }
  if (valueLabCompareSelectEl2 && !valueLabCompareSelectEl2._bound) {
    valueLabCompareSelectEl2.addEventListener('change', function () {
      valueLabCaseState.compareCaseId = String(valueLabCompareSelectEl2.value || '');
      valueLabRefresh(false);
    });
    valueLabCompareSelectEl2._bound = true;
  }
  if (valueLabQuickAddInputEl2 && !valueLabQuickAddInputEl2._bound) {
    valueLabQuickAddInputEl2.addEventListener('input', function () {
      if (valueLabCaseState.quickTimer) clearTimeout(valueLabCaseState.quickTimer);
      var q = String(valueLabQuickAddInputEl2.value || '').trim();
      if (!q) {
        valueLabQuickAddDropdownEl2.innerHTML = '';
        valueLabQuickAddDropdownEl2.style.display = 'none';
        return;
      }
      valueLabCaseState.quickTimer = setTimeout(function () { valueLabRenderQuickAddV2(q); }, 120);
    });
    valueLabQuickAddInputEl2._bound = true;
  }
  if (valueLabQuickAddDropdownEl2 && !valueLabQuickAddDropdownEl2._docBound) {
    document.addEventListener('click', function (e) {
      if (!valueLabQuickAddDropdownEl2.contains(e.target) && e.target !== valueLabQuickAddInputEl2) {
        valueLabQuickAddDropdownEl2.innerHTML = '';
        valueLabQuickAddDropdownEl2.style.display = 'none';
      }
    });
    valueLabQuickAddDropdownEl2._docBound = true;
  }
  if (valueLabNewCaseBtnEl2 && !valueLabNewCaseBtnEl2._bound) {
    valueLabNewCaseBtnEl2.addEventListener('click', function () {
      if (!valueLabConfirmDiscardV2('Discard the current unsaved Value Lab changes and start a new case?')) return;
      valueLabCaseState.currentCase = valueLabCreateDraftV2();
      valueLabCaseState.pendingTeamImport = '';
      valueLabCaseState.dirty = false;
      valueLabSetSelectedCaseIdV2('__draft__');
      valueLabRefresh(false);
    });
    valueLabNewCaseBtnEl2._bound = true;
  }
  if (valueLabDuplicateBtnEl2 && !valueLabDuplicateBtnEl2._bound) {
    valueLabDuplicateBtnEl2.addEventListener('click', function () {
      var currentCase = valueLabClone(valueLabEnsureCurrentCaseV2());
      if (!(currentCase.payload.players && currentCase.payload.players.length)) {
        valueLabSetStatus('Load or build a case first, then duplicate it.', 'warn');
        return;
      }
      if (!valueLabConfirmDiscardV2('Discard the current unsaved changes and create a duplicated draft instead?')) return;
      currentCase.id = '';
      currentCase.name = (currentCase.name || 'Value Lab Case') + ' Copy';
      valueLabCaseState.currentCase = currentCase;
      valueLabCaseState.pendingTeamImport = currentCase.payload.actualTeam || '';
      valueLabCaseState.dirty = true;
      valueLabSetSelectedCaseIdV2('__draft__');
      valueLabRefresh(false);
    });
    valueLabDuplicateBtnEl2._bound = true;
  }
  if (valueLabSaveBtnEl && !valueLabSaveBtnEl._boundV2) {
    valueLabSaveBtnEl.addEventListener('click', valueLabSaveCaseV2);
    valueLabSaveBtnEl._boundV2 = true;
  }
  if (valueLabDeleteBtnEl && !valueLabDeleteBtnEl._boundV2) {
    valueLabDeleteBtnEl.addEventListener('click', valueLabDeleteCaseV2);
    valueLabDeleteBtnEl._boundV2 = true;
  }
  if (valueLabClearCaseBtnEl2 && !valueLabClearCaseBtnEl2._bound) {
    valueLabClearCaseBtnEl2.addEventListener('click', function () {
      var currentCase = valueLabClone(valueLabEnsureCurrentCaseV2());
      if (!(currentCase.payload.players && currentCase.payload.players.length)) {
        valueLabSetStatus('This case is already empty.', 'warn');
        return;
      }
      if (!window.confirm('Remove all players from this Value Lab case?')) return;
      currentCase.payload.players = [];
      currentCase.payload.actualTeam = '';
      currentCase.payload.sourceType = 'manual';
      valueLabCaseState.currentCase = currentCase;
      valueLabCaseState.pendingTeamImport = '';
      valueLabCaseState.dirty = true;
      valueLabRefresh(false);
    });
    valueLabClearCaseBtnEl2._bound = true;
  }
  if (valueLabImportHubBtnEl2 && !valueLabImportHubBtnEl2._bound) {
    valueLabImportHubBtnEl2.addEventListener('click', function () {
      if (!valueLabConfirmDiscardV2('Discard the current unsaved Value Lab changes and import the Team Hub team?')) return;
      valueLabImportTeamByNameV2(valueLabGetTeamHubTeam(), { sourceType: 'teamHub', confirm: false });
    });
    valueLabImportHubBtnEl2._bound = true;
  }
  if (valueLabImportBuilderBtnEl2 && !valueLabImportBuilderBtnEl2._bound) {
    valueLabImportBuilderBtnEl2.addEventListener('click', function () {
      if (!valueLabConfirmDiscardV2('Discard the current unsaved Value Lab changes and import the Team Builder roster?')) return;
      valueLabImportBuilderV2({ confirm: false });
    });
    valueLabImportBuilderBtnEl2._bound = true;
  }
  if (valueLabImportTeamBtnEl2 && !valueLabImportTeamBtnEl2._bound) {
    valueLabImportTeamBtnEl2.addEventListener('click', function () {
      if (!valueLabConfirmDiscardV2('Discard the current unsaved Value Lab changes and import this full team?')) return;
      valueLabImportTeamByNameV2(valueLabTeamImportSelectEl2 ? valueLabTeamImportSelectEl2.value : '', { sourceType: 'teamImport', confirm: false });
    });
    valueLabImportTeamBtnEl2._bound = true;
  }
  if (valueLabTeamImportSelectEl2 && !valueLabTeamImportSelectEl2._bound) {
    valueLabTeamImportSelectEl2.addEventListener('change', function () {
      valueLabCaseState.pendingTeamImport = valueLabTeamImportSelectEl2.value || '';
      if (valueLabImportTeamBtnEl2) valueLabImportTeamBtnEl2.disabled = !valueLabCaseState.pendingTeamImport;
    });
    valueLabTeamImportSelectEl2._bound = true;
  }
  if (valueLabOpenTeamBuilderBtnEl && !valueLabOpenTeamBuilderBtnEl._boundV2) {
    valueLabOpenTeamBuilderBtnEl.addEventListener('click', function () {
      if (typeof showDashboardPage === 'function') showDashboardPage('pageTeamBuilder', 'pageTeams');
    });
    valueLabOpenTeamBuilderBtnEl._boundV2 = true;
  }
  if (valueLabOpenTeamHubBtnEl && !valueLabOpenTeamHubBtnEl._boundV2) {
    valueLabOpenTeamHubBtnEl.addEventListener('click', function () {
      if (typeof showDashboardPage === 'function') showDashboardPage('pageTeams', 'pageTeams');
    });
    valueLabOpenTeamHubBtnEl._boundV2 = true;
  }
  if (valueLabAIRunBtnEl && !valueLabAIRunBtnEl._boundV2) {
    valueLabAIRunBtnEl.addEventListener('click', function () {
      valueLabRunAIBrief();
    });
    valueLabAIRunBtnEl._boundV2 = true;
  }
  if (valueLabAIPdfBtnEl && !valueLabAIPdfBtnEl._boundV2) {
    valueLabAIPdfBtnEl.addEventListener('click', function () {
      valueLabExportBriefPdf();
    });
    valueLabAIPdfBtnEl._boundV2 = true;
  }
  if (valueLabPortalWatchEl) valueLabRenderPortalWatch({ loading: true });
  valueLabRenderAll({ empty: true, emptyMessage: 'Create a Value Lab case, then add players or import a roster to start the investment view.' });
}

function valueLabResetSessionV2() {
  valueLabCaseState.loadedKey = '';
  valueLabCaseState.cases = [];
  valueLabCaseState.currentCase = null;
  valueLabCaseState.dirty = false;
  valueLabCaseState.lastAnalysis = null;
  valueLabCaseState.lastPortalTargets = null;
  valueLabCaseState.portalCache = { key: '', items: [], meta: null };
  if (valueLabAIOutputEl) {
    valueLabAIOutputEl.style.display = 'none';
    valueLabAIOutputEl.innerHTML = '';
    if (valueLabAIOutputEl.dataset) {
      delete valueLabAIOutputEl.dataset.lastRaw;
      delete valueLabAIOutputEl.dataset.lastSignature;
      delete valueLabAIOutputEl.dataset.lastGeneratedAt;
    }
  }
  valueLabSetAIStatus('');
  if (window._dashboardCurrentPageId === 'pageValueLab') valueLabRefresh(true);
}

window.ValueLab = {
  refresh: valueLabRefresh,
  handleRosterChange: valueLabHandleRosterChange,
  handleDataChange: valueLabHandleDataChange,
  openActualTeam: valueLabOpenActualTeam,
  openScenario: valueLabOpenScenario,
  resetSession: valueLabResetSessionV2,
};
