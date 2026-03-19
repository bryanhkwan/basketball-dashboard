
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

function valueLabExpectedPerfAtSpend(row, peerPools) {
  var valuation = valueLabNum(row.ActualValuation_calc);
  if (!Number.isFinite(valuation)) return NaN;
  var posGroup = valueLabPosGroup(row);
  var peers = (peerPools[posGroup] && peerPools[posGroup].length ? peerPools[posGroup] : peerPools.all || []).filter(function (peer) {
    var peerVal = valueLabNum(peer.ActualValuation_calc);
    var peerScore = valueLabNum(peer.Score);
    return Number.isFinite(peerVal) && Number.isFinite(peerScore) && valueLabPlayerKey(peer) !== valueLabPlayerKey(row);
  });
  if (!peers.length) return NaN;
  peers.sort(function (a, b) {
    return Math.abs((valueLabNum(a.ActualValuation_calc) || 0) - valuation) - Math.abs((valueLabNum(b.ActualValuation_calc) || 0) - valuation);
  });
  return valueLabAverage(peers.slice(0, Math.min(60, peers.length)).map(function (peer) {
    return valueLabNum(peer.Score);
  }));
}

function valueLabRoiCall(player, richSpendCutoff) {
  var surplus = valueLabNum(player.surplus);
  var valuation = valueLabNum(player.ActualValuation_calc);
  if (!Number.isFinite(surplus)) return { label: 'Fair', tone: 'neutral' };
  if (surplus >= 6) {
    if (Number.isFinite(valuation) && Number.isFinite(richSpendCutoff) && valuation >= richSpendCutoff) {
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

  var detailed = players.map(function (row) {
    var valuation = valueLabNum(row.ActualValuation_calc);
    var perf = valueLabNum(row.Score);
    var expectedPerf = valueLabExpectedPerfAtSpend(row, peerPools);
    var surplus = (Number.isFinite(perf) && Number.isFinite(expectedPerf)) ? (perf - expectedPerf) : NaN;
    var roi = valueLabRoiCall({ surplus: surplus, ActualValuation_calc: valuation }, richSpendCutoff);
    return Object.assign({}, row, {
      valuation: valuation,
      perf: perf,
      expectedPerf: expectedPerf,
      surplus: surplus,
      roiLabel: roi.label,
      roiTone: roi.tone,
      classBucket: valueLabClassBucket(row),
      posLabel: valueLabPosLabel(row),
    });
  }).sort(function (a, b) {
    return (b.valuation || 0) - (a.valuation || 0);
  });

  var valuations = detailed.map(function (row) { return row.valuation; }).filter(Number.isFinite);
  var scores = detailed.map(function (row) { return row.perf; }).filter(Number.isFinite);
  var totalSpend = valuations.reduce(function (sum, value) { return sum + value; }, 0);
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
  var topPerf = scores.slice().sort(function (a, b) { return b - a; }).slice(0, Math.min(5, scores.length));
  var topValueCalls = detailed.filter(function (row) { return Number.isFinite(row.surplus); }).slice().sort(function (a, b) {
    return (b.surplus || 0) - (a.surplus || 0);
  });
  var teamContext = valueLabBuildTeamContext(detailed, bundle);

  return {
    empty: false,
    bundle: bundle,
    sourceMode: bundle.mode,
    sourceType: bundle.sourceType,
    players: detailed,
    rosterSize: detailed.length,
    totalSpend: totalSpend,
    avgSpend: avgSpend,
    avgPerf: avgPerf,
    corePerf: valueLabAverage(topPerf),
    perfPer100k: totalSpend > 0 ? (totalPerf / totalSpend) * 100000 : NaN,
    top3SpendShare: totalSpend > 0 ? (topSpend / totalSpend) : 0,
    spendPct: spendPct,
    perfPct: perfPct,
    roiGap: (Number.isFinite(spendPct) && Number.isFinite(perfPct)) ? (perfPct - spendPct) : NaN,
    avgSurplus: valueLabAverage(detailed.map(function (row) { return row.surplus; })),
    dominantTeam: teamContext,
    breakdowns: {
      position: valueLabAggregateBy(detailed, function (row) { return valueLabPosGroup(row) === 'guard' ? 'Guards' : 'Bigs'; }),
      classYear: valueLabAggregateBy(detailed, function (row) { return row.classBucket; }),
      team: valueLabAggregateBy(detailed, function (row) { return row.Team || 'Unknown'; }).slice(0, 6),
    },
    steals: topValueCalls.slice(0, 3),
    overpays: topValueCalls.slice().reverse().slice(0, 3),
  };
}

function valueLabBuildInsightList(analysis) {
  if (!analysis || analysis.empty) return [];
  var items = [];
  var teamCtx = analysis.dominantTeam;
  if (analysis.sourceMode === 'actualTeam' && teamCtx && teamCtx.team) {
    items.push('Loaded the actual-team view for ' + teamCtx.team + ', so Value Lab can tie spend back to real wins, losses, and team quality.');
  } else if (analysis.sourceMode === 'snapshot' && analysis.sourceType === 'actualTeam' && teamCtx && teamCtx.team) {
    items.push('This snapshot comes from the actual-team view for ' + teamCtx.team + ', so the business readout keeps a real team anchor.');
  } else if (analysis.sourceMode === 'scenarioRoster') {
    if (teamCtx && teamCtx.team) {
      items.push('Scenario roster still leans heavily toward ' + teamCtx.team + ' (' + teamCtx.count + '/' + analysis.rosterSize + ' players), so you can compare the what-if build against a real team baseline.');
    } else if (teamCtx && teamCtx.uniqueTeams > 1) {
      items.push('This is a cross-team scenario across ' + teamCtx.uniqueTeams + ' teams, so Value Lab leans on spend/perf efficiency instead of one schedule context.');
    }
  } else if (teamCtx && teamCtx.team) {
    items.push('Detected ' + teamCtx.team + ' as the base roster (' + teamCtx.count + '/' + analysis.rosterSize + ' players).');
  }
  if (Number.isFinite(analysis.spendPct) && Number.isFinite(analysis.perfPct)) {
    items.push('Spend sits around the ' + Math.round(analysis.spendPct) + 'th percentile, while average Perf sits around the ' + Math.round(analysis.perfPct) + 'th percentile (' + (analysis.roiGap >= 0 ? '+' : '') + Math.round(analysis.roiGap) + ' ROI gap).');
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

async function valueLabBuildOutcome(analysis) {
  var teamCtx = analysis && analysis.dominantTeam;
  if (!analysis || analysis.empty || !teamCtx || !teamCtx.team) {
    return {
      hasTeamContext: false,
      note: 'No single team schedule detected. Use the actual-team source if you want wins, losses, and schedule-based expectations here.',
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
  var record = valueLabRecordFromGames(games, teamName);
  var expectedWins = 0;
  var ratedGames = 0;

  if (rating && Number.isFinite(valueLabNum(rating.adjEM))) {
    games.forEach(function (game) {
      var homeName = valueLabNorm(game.homeTeam || '');
      var awayName = valueLabNorm(game.awayTeam || '');
      var isHome = homeName === valueLabNorm(teamName);
      var isAway = awayName === valueLabNorm(teamName);
      if (!isHome && !isAway) return;
      if (!game.completed) return;
      var oppName = isHome ? (game.awayTeam || '') : (game.homeTeam || '');
      var oppRating = (typeof teamRatings !== 'undefined' && teamRatings)
        ? (teamRatings[valueLabNorm(oppName)] || null)
        : null;
      if (!oppRating || !Number.isFinite(valueLabNum(oppRating.adjEM))) return;
      var prob = valueLabWinProb(valueLabNum(rating.adjEM), valueLabNum(oppRating.adjEM), isHome ? 2.8 : -2.8);
      if (!Number.isFinite(prob)) return;
      ratedGames += 1;
      expectedWins += prob;
    });
  }

  var note = ratedGames
    ? 'Expected wins are modeled from team adjEM vs opponent adjEM across completed games on that schedule.'
    : 'Schedule loaded, but not enough rating coverage was available to model expected wins cleanly.';
  if (analysis.sourceMode === 'scenarioRoster') note += ' Because this started as a scenario roster, use the actual-team mode when you want the cleanest business readout.';

  return {
    hasTeamContext: true,
    teamName: teamName,
    detectedShare: teamCtx.count + '/' + analysis.rosterSize,
    rating: rating,
    actualWins: record.wins,
    actualLosses: record.losses,
    gamesPlayed: record.played,
    expectedWins: ratedGames ? expectedWins : NaN,
    expectedLosses: ratedGames ? (record.played - expectedWins) : NaN,
    ratedGames: ratedGames,
    note: note,
  };
}
function valueLabRenderKpis(analysis) {
  if (!valueLabKpisEl) return;
  var items = (!analysis || analysis.empty)
    ? [
        ['Players', '—'],
        ['Total spend', '—'],
        ['Avg perf', '—'],
        ['Perf / $100k', '—'],
        ['ROI gap', '—'],
        ['Core perf', '—']
      ]
    : [
        ['Players', String(analysis.rosterSize)],
        ['Total spend', valueLabFmtMoney(analysis.totalSpend)],
        ['Avg perf', Number.isFinite(analysis.avgPerf) ? analysis.avgPerf.toFixed(1) : '—'],
        ['Perf / $100k', Number.isFinite(analysis.perfPer100k) ? analysis.perfPer100k.toFixed(1) : '—'],
        ['ROI gap', Number.isFinite(analysis.roiGap) ? ((analysis.roiGap >= 0 ? '+' : '') + analysis.roiGap.toFixed(0) + ' pts') : '—'],
        ['Core perf', Number.isFinite(analysis.corePerf) ? analysis.corePerf.toFixed(1) : '—']
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
    valueLabOutcomeEl.innerHTML = '<div class="valueLabEmpty">' + ((analysis && analysis.emptyMessage) || 'Use the actual-team source if you want schedule results and expected wins here.') + '</div>';
    return;
  }
  if (!analysis.outcome) {
    valueLabOutcomeEl.innerHTML = '<div class="valueLabLoading">Checking team context and schedule results...</div>';
    return;
  }
  var outcome = analysis.outcome;
  if (!outcome.hasTeamContext) {
    valueLabOutcomeEl.innerHTML = '<div class="valueLabEmpty">' + (outcome.note || 'No team context available.') + '</div>';
    return;
  }
  var rating = outcome.rating || null;
  var recordText = outcome.gamesPlayed ? (outcome.actualWins + '-' + outcome.actualLosses) : '—';
  var expectedText = Number.isFinite(outcome.expectedWins)
    ? (outcome.expectedWins.toFixed(1) + ' expected wins')
    : 'Expected wins unavailable';
  var delta = Number.isFinite(outcome.expectedWins)
    ? (outcome.actualWins - outcome.expectedWins)
    : NaN;

  var pills = [
    '<span class="pill"><span>Detected team</span><b>' + outcome.teamName + '</b></span>',
    '<span class="pill"><span>Actual record</span><b>' + recordText + '</b></span>',
    '<span class="pill"><span>Expected wins</span><b>' + expectedText + '</b></span>'
  ];
  if (rating && Number.isFinite(valueLabNum(rating.adjEM))) {
    pills.push('<span class="pill"><span>AdjEM</span><b>' + ((valueLabNum(rating.adjEM) >= 0 ? '+' : '') + valueLabNum(rating.adjEM).toFixed(1)) + '</b></span>');
  }
  if (rating && rating.rank) {
    pills.push('<span class="pill"><span>Rank</span><b>#' + rating.rank + '</b></span>');
  }
  if (Number.isFinite(delta)) {
    pills.push('<span class="pill"><span>Vs model</span><b>' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + '</b></span>');
  }

  valueLabOutcomeEl.innerHTML =
    '<div class="kpis valueLabMiniKpis">' + pills.join('') + '</div>' +
    '<div class="valueLabOutcomeNote">' +
      '<div><strong>Roster share:</strong> ' + outcome.detectedShare + ' slots from ' + outcome.teamName + '.</div>' +
      '<div><strong>Model note:</strong> ' + outcome.note + '</div>' +
    '</div>';
}

function valueLabRenderScatter(analysis) {
  if (!valueLabScatterEl) return;
  if (!analysis || analysis.empty || !analysis.players.length) {
    valueLabScatterEl.innerHTML = '<div class="valueLabEmpty">Spend/performance scatter will appear once the selected source has player valuations and Perf scores.</div>';
    return;
  }
  var points = analysis.players.filter(function (row) {
    return Number.isFinite(row.valuation) && Number.isFinite(row.perf);
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
  var maxX = Math.max.apply(null, points.map(function (row) { return row.valuation; }).concat([1]));
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
    var cx = xScale(row.valuation).toFixed(1);
    var cy = yScale(row.perf).toFixed(1);
    return '<circle cx="' + cx + '" cy="' + cy + '" r="5.5" fill="' + toneColor(row.roiTone) + '" fill-opacity="0.88" stroke="#08101d" stroke-width="1.5">' +
      '<title>' + (row.Player || 'Player') + ' - Perf ' + row.perf.toFixed(1) + ' - ' + valueLabFmtMoney(row.valuation) + ' - ' + row.roiLabel + '</title>' +
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
      '<text x="' + ((width + padL - padR) / 2).toFixed(1) + '" y="' + (height - 4) + '" class="valueLabAxisTitle" text-anchor="middle">Spend</text>' +
      '<text x="12" y="' + ((height + padT - padB) / 2).toFixed(1) + '" class="valueLabAxisTitle" transform="rotate(-90 12 ' + ((height + padT - padB) / 2).toFixed(1) + ')" text-anchor="middle">Perf</text>' +
    '</svg>' +
    '<div class="valueLabScatterLegend">Green = beating price, gold = fair/rich, red = overpay.</div>';
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
        '<div class="valueLabBarMeta">' + item.count + ' players - ' + share.toFixed(0) + '% of spend - avg perf ' + (Number.isFinite(item.avgPerf) ? item.avgPerf.toFixed(1) : '—') + '</div>' +
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
      if (typeof showDashboardPage === 'function') showDashboardPage('pageTeamBuilder');
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

