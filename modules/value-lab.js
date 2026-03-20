
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
  if (typeof fmtMoney === 'function') return fmtMoney(n);
  return '$' + Math.round(n).toLocaleString('en-US');
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
    var perf = valueLabNum(row.Score);
    var modelValue = valueLabNum(row.ActualValuation_calc);
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

function valueLabExpectedPerfAtSpend(row, peerPools) {
  var spendBasis = Number.isFinite(valueLabNum(row.actualSpend)) ? valueLabNum(row.actualSpend) : valueLabNum(row.ActualValuation_calc);
  if (!Number.isFinite(spendBasis)) return NaN;
  var posGroup = valueLabPosGroup(row);
  var peers = (peerPools[posGroup] && peerPools[posGroup].length ? peerPools[posGroup] : peerPools.all || []).filter(function (peer) {
    var peerVal = valueLabNum(peer.ActualValuation_calc);
    var peerScore = valueLabNum(peer.Score);
    return Number.isFinite(peerVal) && Number.isFinite(peerScore) && valueLabPlayerKey(peer) !== valueLabPlayerKey(row);
  });
  if (!peers.length) return NaN;
  peers.sort(function (a, b) {
    return Math.abs((valueLabNum(a.ActualValuation_calc) || 0) - spendBasis) - Math.abs((valueLabNum(b.ActualValuation_calc) || 0) - spendBasis);
  });
  return valueLabAverage(peers.slice(0, Math.min(60, peers.length)).map(function (peer) {
    return valueLabNum(peer.Score);
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

  var poolValSorted = currentPool.map(function (row) { return valueLabNum(row.ActualValuation_calc); }).filter(Number.isFinite).sort(function (a, b) { return a - b; });
  var poolScoreSorted = currentPool.map(function (row) { return valueLabNum(row.Score); }).filter(Number.isFinite).sort(function (a, b) { return a - b; });
  var richSpendCutoff = typeof percentileInc === 'function' ? percentileInc(poolValSorted, 0.8) : NaN;
  var budgetTotal = valueLabNum(bundle.valueCase && bundle.valueCase.payload ? bundle.valueCase.payload.budgetTotal : null);

  var detailed = players.map(function (row) {
    var valuation = valueLabNum(row.ActualValuation_calc);
    var actualSpend = valueLabNum(row.actualSpend);
    var spendBasis = Number.isFinite(actualSpend) ? actualSpend : valuation;
    var perf = valueLabNum(row.Score);
    var expectedPerf = valueLabExpectedPerfAtSpend(row, peerPools);
    var surplus = (Number.isFinite(perf) && Number.isFinite(expectedPerf)) ? (perf - expectedPerf) : NaN;
    var delta = (Number.isFinite(actualSpend) && Number.isFinite(valuation)) ? (actualSpend - valuation) : NaN;
    var roi = valueLabRoiCall({ surplus: surplus, ActualValuation_calc: valuation, actualSpend: actualSpend }, richSpendCutoff);
    return Object.assign({}, row, {
      valuation: valuation,
      actualSpend: actualSpend,
      spendBasis: spendBasis,
      delta: delta,
      deltaPct: (Number.isFinite(delta) && Number.isFinite(valuation) && valuation > 0) ? (delta / valuation) : NaN,
      perf: perf,
      expectedPerf: expectedPerf,
      surplus: surplus,
      roiLabel: roi.label,
      roiTone: roi.tone,
      classBucket: valueLabClassBucket(row),
      posLabel: valueLabPosLabel(row),
    });
  }).sort(function (a, b) {
    return (b.spendBasis || b.valuation || 0) - (a.spendBasis || a.valuation || 0);
  });

  var valuations = detailed.map(function (row) { return row.valuation; }).filter(Number.isFinite);
  var actualSpends = detailed.map(function (row) { return row.actualSpend; }).filter(Number.isFinite);
  var spendBasisValues = detailed.map(function (row) { return row.spendBasis; }).filter(Number.isFinite);
  var scores = detailed.map(function (row) { return row.perf; }).filter(Number.isFinite);
  var totalSpend = spendBasisValues.reduce(function (sum, value) { return sum + value; }, 0);
  var totalModelValue = valuations.reduce(function (sum, value) { return sum + value; }, 0);
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
    totalActualSpend: totalActualSpend,
    avgSpend: avgSpend,
    avgPerf: avgPerf,
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

  var scheduleProjection = valueLabProjectScheduleWins(games, teamName, projectedAdjEM, baselineAdjEM);
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
  if (teamCtx.ratio >= 0.7 && analysis.contractCoverage >= 0.65) confidence = 'High';
  else if (teamCtx.ratio >= 0.5 || analysis.contractCoverage >= 0.4) confidence = 'Medium';

  var note = [];
  if (Number.isFinite(scheduleProjection.caseFullWins) && Number.isFinite(scheduleProjection.baselineFullWins)) {
    note.push('Projection uses the detected team schedule and maps roster Perf onto team adjEM using current-season team/player trends.');
  } else {
    note.push('Schedule was found, but there was not enough rating coverage to project wins cleanly.');
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
    projectedAdjEM: projectedAdjEM,
    baselineFullWins: scheduleProjection.baselineFullWins,
    projectedFullWins: scheduleProjection.caseFullWins,
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
        ['Model value', '—'],
        ['Actual spend', '—'],
        ['Budget left', '—'],
        ['Contract coverage', '—'],
        ['Avg perf', '—'],
        ['Perf / $100k', '—']
      ]
    : [
        ['Players', String(analysis.rosterSize)],
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

  valueLabOutcomeEl.innerHTML =
    '<div class="kpis valueLabMiniKpis">' + pills.join('') + '</div>' +
    '<div class="valueLabOutcomeNote">' +
      '<div><strong>Roster share:</strong> ' + outcome.detectedShare + ' slots from ' + outcome.teamName + ' · confidence ' + outcome.confidence + '.</div>' +
      '<div><strong>Business read:</strong> This case currently spends ' + valueLabFmtMoney(outcome.spendBasis) + ' using actual contracts when entered, otherwise model value, so the spend-per-win view stays actionable even before every deal is filled in.</div>' +
      '<div><strong>Projection logic:</strong> ' + outcome.note + '</div>' +
    '</div>';
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
    var base = (typeof WORKER_URL !== 'undefined' && WORKER_URL) || 'https://hidden-salad-773b.bryanhkwan.workers.dev';
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
    var valuation = valueLabNum(player.ActualValuation_calc);
    var perf = valueLabNum(player.Score);
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
    var rankScore = valueScore + (Number.isFinite(surplus) ? (surplus * 4) : 0) + (fitsNeed ? 8 : 0) + (withinBudget ? 6 : -4);
    targets.push({
      key: key,
      name: player.Player || entry.playerName || '',
      fromTeam: entry.fromTeam || player.Team || '',
      position: player.Position || player.Pos || entry.position || '—',
      classLabel: player.Class || player.Yr || '—',
      perf: perf,
      valuation: valuation,
      expectedPerf: expectedPerf,
      surplus: surplus,
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
    var tone = target.withinBudget ? 'good' : 'warn';
    return '<span class="valueLabPortalPill valueLabPortalPill--' + tone + '">' +
      '<span><b>' + valueLabEsc(target.name) + '</b> <small>' + valueLabEsc(target.fromTeam || 'Portal') + ' · ' + valueLabEsc(target.position || '—') + '</small></span>' +
      '<span>' + valueLabFmtMoney(target.valuation) + ' · Perf ' + target.perf.toFixed(1) + (target.fitsNeed ? ' · fills ' + valueLabEsc(portalCtx.weakestLabel || 'need') : '') + '</span>' +
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
      '<text x="' + ((width + padL - padR) / 2).toFixed(1) + '" y="' + (height - 4) + '" class="valueLabAxisTitle" text-anchor="middle">Actual Spend (model fallback)</text>' +
      '<text x="12" y="' + ((height + padT - padB) / 2).toFixed(1) + '" class="valueLabAxisTitle" transform="rotate(-90 12 ' + ((height + padT - padB) / 2).toFixed(1) + ')" text-anchor="middle">Perf</text>' +
    '</svg>' +
    '<div class="valueLabScatterLegend">X-axis uses actual contract spend when entered, otherwise model value. Green = beating price, gold = fair/rich, red = overpay.</div>';
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
      '<td><span class="valueLabRoiTag valueLabRoiTag--' + row.roiTone + '">' + row.roiLabel + '</span></td>';
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

function valueLabRenderAll(analysis) {
  valueLabRenderSourceControls();
  valueLabRenderKpis(analysis);
  valueLabRenderInsights(analysis);
  valueLabRenderOutcome(analysis);
  valueLabRenderScatter(analysis);
  valueLabRenderBreakdowns(analysis);
  valueLabRenderRosterTable(analysis);
}

async function valueLabRunAIBrief() {
  if (!valueLabAIRunBtnEl || !valueLabAIOutputEl) return;
  await valueLabBootstrapV2(false);
  var bundle = valueLabBuildBundleFromCaseV2();
  var analysis = valueLabBuildAnalysis(bundle);
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
    var portalPack = await valueLabGetPortalPool().catch(function () {
      return { supported: false, items: [], note: 'Portal feed unavailable right now.' };
    });
    var portalCtx = valueLabBuildPortalTargets(analysis, portalPack);
    valueLabCaseState.lastAnalysis = analysis;
    valueLabCaseState.lastPortalTargets = portalCtx;
    valueLabRenderPortalWatch(portalCtx);

    var promptCtx = {
      caseName: bundle.label,
      league: valueLabCurrentLeague(),
      season: valueLabCurrentSeason(),
      sourceType: bundle.sourceType || 'manual',
      budgetTotal: analysis.budgetTotal,
      budgetRemaining: analysis.budgetRemaining,
      totalModelValue: analysis.totalModelValue,
      totalActualSpend: analysis.totalActualSpend,
      effectiveSpend: analysis.totalSpend,
      contractCoverage: analysis.contractCoverage,
      avgPerf: analysis.avgPerf,
      perfPer100kActual: analysis.perfPer100kActual,
      avgDelta: analysis.avgDelta,
      overMarketTotal: analysis.overMarketTotal,
      underMarketTotal: analysis.underMarketTotal,
      top3SpendShare: analysis.top3SpendShare,
      outcome: analysis.outcome,
      topValueWins: (analysis.steals || []).slice(0, 4).map(function (row) {
        return { player: row.Player, team: row.Team, perf: row.perf, surplus: row.surplus, modelValue: row.valuation, actualSpend: row.actualSpend };
      }),
      topRisks: (analysis.overpays || []).slice(0, 4).map(function (row) {
        return { player: row.Player, team: row.Team, perf: row.perf, surplus: row.surplus, modelValue: row.valuation, actualSpend: row.actualSpend };
      }),
      roster: analysis.players.map(function (row) {
        return {
          player: row.Player,
          team: row.Team,
          position: row.posLabel,
          classLabel: row.classBucket,
          perf: row.perf,
          expectedPerf: row.expectedPerf,
          modelValue: row.valuation,
          actualSpend: row.actualSpend,
          delta: row.delta,
          roiCall: row.roiLabel,
        };
      }),
      portalTargets: (portalCtx.targets || []).slice(0, 6).map(function (target) {
        return {
          player: target.name,
          fromTeam: target.fromTeam,
          position: target.position,
          classLabel: target.classLabel,
          perf: target.perf,
          modelValue: target.valuation,
          expectedPerf: target.expectedPerf,
          surplus: target.surplus,
          withinBudget: target.withinBudget,
          fitsNeed: target.fitsNeed,
        };
      }),
      portalNote: portalCtx.note || '',
    };

    var userPrompt =
      'Build a director-facing college basketball Value Lab brief using ONLY the structured JSON below.\n\n' +
      'Goals:\n' +
      '- Evaluate whether this roster investment is healthy on the business side.\n' +
      '- Explain if current contracts are under market, fair, or rich.\n' +
      '- Interpret projected wins and whether spend is justified.\n' +
      '- Point out budget flexibility and where the money is too concentrated.\n' +
      '- Use the provided transfer portal targets to suggest best bang-for-buck additions when relevant.\n' +
      '- If contract coverage is incomplete, say that clearly and lower confidence.\n\n' +
      'Return markdown with these sections:\n' +
      '## Executive Verdict\n' +
      '## Budget & Contract Health\n' +
      '## Outcome vs Spend\n' +
      '## Portal Value Targets\n' +
      '## Director Action Plan\n\n' +
      'JSON:\n```json\n' + JSON.stringify(promptCtx, null, 2) + '\n```';

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
    if (valueLabAIOutputEl.dataset) valueLabAIOutputEl.dataset.lastRaw = text;
    valueLabSetAIStatus('Director brief ready — grounded in case spend, projection, and portal value targets.');
  } catch (e) {
    valueLabAIOutputEl.innerHTML = '<div class="muted" style="padding:12px">Unable to run the director brief: ' + valueLabEsc(e && e.message ? e.message : String(e)) + '</div>';
    valueLabSetAIStatus('Director brief failed');
  } finally {
    valueLabAIRunBtnEl.disabled = false;
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
  dirty: false,
  refreshToken: 0,
  statusTimer: null,
  quickTimer: null,
  pendingTeamImport: '',
  lastAnalysis: null,
  lastPortalTargets: null,
  portalCache: { key: '', items: [], meta: null },
};

var valueLabCaseSelectEl2, valueLabCaseNameEl2, valueLabTeamImportSelectEl2;
var valueLabQuickAddInputEl2, valueLabQuickAddDropdownEl2;
var valueLabNewCaseBtnEl2, valueLabDuplicateBtnEl2, valueLabClearCaseBtnEl2;
var valueLabImportHubBtnEl2, valueLabImportBuilderBtnEl2, valueLabImportTeamBtnEl2;
var valueLabBudgetInputEl2;
var valueLabAIRunBtnEl, valueLabAIStatusEl, valueLabAIOutputEl, valueLabPortalWatchEl;

var VALUE_LAB_GEMINI_PROXY_URL = 'https://white-pine-7669.bryanhkwan.workers.dev';
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
  return fetch('https://hidden-salad-773b.bryanhkwan.workers.dev/value-cases' + path, Object.assign({ credentials: 'include', headers: headers }, opts)).then(async function (res) {
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
function valueLabRenderSourceControls() {
  if (!valueLabCaseSelectEl2 || !valueLabCaseNameEl2 || !valueLabTeamImportSelectEl2) return;
  var currentCase = valueLabEnsureCurrentCaseV2();
  var savedCases = valueLabCurrentCasesV2();
  var teams = valueLabCurrentTeams();
  var teamHubTeam = valueLabCanonicalTeamName(valueLabGetTeamHubTeam(), teams);
  var builderCount = Array.isArray(tbRoster) ? tbRoster.length : 0;

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
    tr.innerHTML = '<td><span class="link valueLabPlayerLink">' + (row.Player || '—') + '</span></td>' +
      '<td>' + (row.Team || '—') + '</td>' +
      '<td>' + (row.posLabel || '—') + '</td>' +
      '<td>' + (row.classBucket || '—') + '</td>' +
      '<td class="playersPerfCell">' + (Number.isFinite(row.perf) ? row.perf.toFixed(1) : '—') + '</td>' +
      '<td>' + valueLabFmtMoney(row.valuation) + '</td>' +
      '<td><input class="valueLabSpendInput" type="number" min="0" step="1000" placeholder="-" value="' + (Number.isFinite(row.actualSpend) ? Math.round(row.actualSpend) : '') + '"></td>' +
      '<td class="' + valueLabDeltaToneClass(row) + '">' + deltaText + '</td>' +
      '<td>' + (Number.isFinite(row.expectedPerf) ? row.expectedPerf.toFixed(1) : '—') + '</td>' +
      '<td style="font-weight:800;color:' + (row.roiTone === 'good' ? 'var(--good)' : row.roiTone === 'bad' ? 'var(--bad)' : row.roiTone === 'warn' ? 'var(--warn)' : 'var(--muted)') + '">' + surplusText + '</td>' +
      '<td><span class="valueLabRoiTag valueLabRoiTag--' + row.roiTone + '">' + row.roiLabel + '</span></td>' +
      '<td><button class="tbRemoveBtn valueLabRemoveBtn" type="button">✕</button></td>';
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
  valueLabCaseState.lastAnalysis = analysis;
  valueLabRenderAll(analysis);
  valueLabRenderPortalWatch({ loading: true });
  if (valueLabAIOutputEl && valueLabAIOutputEl.style.display !== 'none') {
    valueLabSetAIStatus('Case changed — rerun Director Brief to refresh the executive summary.');
  }
  var refreshToken = ++valueLabCaseState.refreshToken;
  if (valueLabOutcomeEl && !analysis.empty) valueLabOutcomeEl.innerHTML = '<div class="valueLabLoading">Projecting case outcome and spend efficiency...</div>';
  analysis.outcome = await valueLabBuildOutcome(analysis);
  if (refreshToken !== valueLabCaseState.refreshToken) return;
  valueLabCaseState.lastAnalysis = analysis;
  valueLabRenderOutcome(analysis);
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
  valueLabCaseState.dirty = false;
  valueLabCaseState.lastAnalysis = null;
  valueLabCaseState.lastPortalTargets = null;
  valueLabCaseState.portalCache = { key: '', items: [], meta: null };
  if (valueLabAIOutputEl) {
    valueLabAIOutputEl.style.display = 'none';
    valueLabAIOutputEl.innerHTML = '';
    if (valueLabAIOutputEl.dataset) delete valueLabAIOutputEl.dataset.lastRaw;
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
  valueLabAIStatusEl = document.getElementById('valueLabAIStatus');
  valueLabAIOutputEl = document.getElementById('valueLabAIOutput');
  valueLabPortalWatchEl = document.getElementById('valueLabPortalWatch');
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
    if (valueLabAIOutputEl.dataset) delete valueLabAIOutputEl.dataset.lastRaw;
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
