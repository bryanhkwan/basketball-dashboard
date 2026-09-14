'use strict';

// Run with: node --test tools/position-rosters.test.cjs
// Real dashboard scripts run in an isolated VM; only browser surfaces are faked.
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var root = path.resolve(__dirname, '..');
var labels = { guard: 'Guards', wing: 'Wings', big: 'Bigs' };

function source(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function plain(value) { return JSON.parse(JSON.stringify(value)); }

class Element {
  constructor() {
    this.value = '';
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.events = {};
    this.classList = { toggle: function () {}, contains: function () { return false; }, add: function () {}, remove: function () {} };
    this._html = '';
  }
  set innerHTML(value) { this._html = value; this.children = []; }
  get innerHTML() { return this._html; }
  appendChild(value) { this.children.push(value); return value; }
  addEventListener(event, callback) { this.events[event] = callback; }
  querySelectorAll(selector) {
    var found = [];
    if (selector === '[data-rebal-drop]') {
      function visit(element) {
        for (var match of element.innerHTML.matchAll(/data-rebal-drop="([^"]+)" data-rebal-add="([^"]+)"/g)) {
          var button = new Element();
          button.dataset = { rebalDrop: match[1], rebalAdd: match[2] };
          found.push(button);
        }
        element.children.forEach(visit);
      }
      visit(this);
    }
    this.buttons = found;
    return found;
  }
}

function context() {
  var elements = new Map();
  var timers = new Map();
  var nextTimer = 0;
  function get(id) {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  }
  var c = vm.createContext({
    console: console,
    PlayerBios: require('../modules/player-bios.js'),
    setTimeout: function (callback) { timers.set(++nextTimer, callback); return nextTimer; },
    requestAnimationFrame: function (callback) { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: function (id) { timers.delete(id); },
    localStorage: { getItem: function () { return null; } },
    document: {
      getElementById: get,
      createElement: function () { return new Element(); },
      createDocumentFragment: function () { return new Element(); },
      querySelectorAll: function () { return []; }
    }
  });
  c.window = c;
  ['config', 'data', 'teambuilder'].forEach(function (name) {
    vm.runInContext(source('modules/' + name + '.js'), c, { filename: name + '.js' });
  });
  c.getElement = get;
  c.runTimer = function () {
    var entry = timers.entries().next().value;
    if (!entry) return false;
    timers.delete(entry[0]);
    entry[1]();
    return true;
  };
  c.initTeamBuilderDOMRefs();
  c.renderPlayersPage = function () {};
  c.showWarn = function (message) { c.lastWarning = message; };
  c.clearWarn = function () { c.lastWarning = ''; };
  return c;
}

function player(name, group, league, extra) {
  return Object.assign({
    Player: name, Team: 'Test Team', Position: labels[group], Pos: group === 'wing' ? 'G-F' : group === 'guard' ? 'PG' : 'C',
    _league: league || 'MBB', Score: 50, ActualValuation_calc: 10, PPG: 10, _pct_PPG: 0.8
  }, extra);
}

function installPools(c, league, players) {
  Object.keys(labels).forEach(function (group) {
    c.tbAllComputed[league + '_' + labels[group]] = players.filter(function (row) { return c.tbPosGroup(row) === group; });
  });
  c._cachedAllPlayers = null;
}

function loadChat(c) {
  c._app = {
    get league() { return c.league; },
    get pos() { return c.pos; },
    get tbRoster() { return c.tbRoster; },
    tbGetAllPlayers: c.tbGetAllPlayers
  };
  // Expose existing private functions only in the test VM, with production code unchanged.
  var chat = source('modules/chat.js').replace('  // Called by switchLeague()',
    '  window._rosterChatTest = {getTopPlayers, getDashboardContext, searchPlayers, sysPrompt};\n  // Called by switchLeague()');
  vm.runInContext(chat, c, { filename: 'chat.js' });
  return c._rosterChatTest;
}

test('legacy listed hybrids and SF stay Wings in every league and active tab', function () {
  var c = context();
  ['MBB', 'WBB'].forEach(function (league) {
    c.league = league;
    ['Guards', 'Wings', 'Bigs'].forEach(function (active) {
      c.pos = active;
      ['G-F', 'F-G', 'SF'].forEach(function (listed) {
        assert.equal(c.tbPosGroup({ Pos: listed, _league: league, _tbPosGroup: 'guard' }), 'wing');
      });
      assert.equal(c.tbPosGroup({ Position: 'Wings', Pos: 'G', _league: league }), 'wing');
      assert.equal(c.tbPosGroup({ _tbPosGroup: 'wing', _league: league }), 'wing');
      assert.equal(c.tbPosGroup({ Pos: 'PG', _league: league }), 'guard');
      assert.equal(c.tbPosGroup({ Pos: 'PF', _league: league }), 'big');
    });
  });
});

test('all three pools are included once and remain separated by league', function () {
  var c = context();
  ['MBB', 'WBB'].forEach(function (league) {
    installPools(c, league, Object.keys(labels).map(function (group) { return player(league + ' ' + group, group, league); }));
  });
  ['MBB', 'WBB'].forEach(function (league) {
    var rows = c.tbGetAllPlayers(league);
    assert.equal(rows.length, 3);
    assert.ok(rows.every(function (row) { return row._league === league; }));
    assert.deepEqual(plain(c.tbPositionCounts(rows)), { guard: 1, wing: 1, big: 1 });
  });
});

test('unavailable bio positions do not replace a specific listed guard, wing or big', function () {
  var c = context();
  ['NA', 'N/A', 'Unknown', 'ATH', 'Not Available', '-'].forEach(function (placeholder) {
    [['PG', 'guard'], ['SF', 'wing'], ['PF', 'big']].forEach(function (item) {
      assert.equal(c.tbPosGroup({ ListedPosition: placeholder, Pos: item[0], _league: 'MBB' }), item[1], placeholder + ' must preserve ' + item[0]);
    });
  });
  assert.equal(c.tbPosGroup({ ListedPosition: 'ATH', Pos: 'G', Height: 83, _league: 'MBB' }), 'big', 'a synthesized generic G must not hide unknown-position size evidence');
});

['MBB', 'WBB'].forEach(function (league) {
  Object.keys(labels).forEach(function (from) {
    Object.keys(labels).forEach(function (to) {
      if (from === to) return;
      test(league + ' rebalance ' + from + ' to ' + to + ' respects targets, budget and cap', function () {
        var c = context();
        c.league = league;
        c.tbRenderRoster = c.tbRenderGaps = c.tbRenderSuggestions = c.h2hRefresh = function () {};
        c.tbRoster = [player('Weak', from, league), player('Keep', from, league)];
        var candidate = player('Affordable ' + to, to, league, { ActualValuation_calc: 15 });
        var overBudget = player('Too expensive ' + to, to, league, { Score: 100, ActualValuation_calc: 95 });
        var overCap = player('Over cap ' + to, to, league, { Score: 200, ActualValuation_calc: 150 });
        installPools(c, league, c.tbRoster.concat([candidate, overBudget, overCap]));
        c.getElement('tbMaxRoster').value = '13';
        c.getElement('tbBudget').value = '100';
        c.getElement('tbPlayerCap').value = '100';
        Object.keys(labels).forEach(function (group) { c.getElement('tbTarget' + labels[group]).value = group === from || group === to ? '1' : '0'; });
        c.tbRefresh();
        var buttons = c.getElement('tbRebalanceInfo').buttons;
        assert.equal(buttons.length, 1);
        assert.equal(buttons[0].dataset.rebalAdd, c.tbPlayerKey(candidate));
        assert.equal(Number(c.getElement('tb' + from[0].toUpperCase() + from.slice(1) + 'Count').textContent), 2);
        buttons[0].events.click();
        assert.equal(c.tbRoster.length, 2);
        assert.equal(c.tbPositionCounts(c.tbRoster)[to], 1);
        assert.ok(c.tbRoster.includes(candidate));
      });
    });
  });
});

test('cached cohort percentiles and H2H do not change with active position or league', function () {
  var c = context();
  var wing = player('Wing', 'wing', 'MBB', { _pct_PPG: 0.9 });
  var other = player('Other wing', 'wing', 'MBB', { _pct_PPG: 0.3 });
  c.tbRoster = [wing];
  c.oppRoster = [other];
  var baseline;
  ['MBB', 'WBB'].forEach(function (league) {
    c.league = league;
    ['Guards', 'Wings', 'Bigs'].forEach(function (active) {
      c.pos = active;
      c.statDist = { PPG: { sorted: [0, 5, 10, 50], invert: true } };
      assert.equal(c.tbStatPercentile(wing, 'PPG'), 0.9);
      var comparison = plain(c.getHeadToHead());
      if (baseline) assert.deepEqual(comparison, baseline);
      baseline = comparison;
      if (league !== 'MBB' || active !== 'Wings') assert.ok(Number.isNaN(c.tbStatPercentile(player('Uncached', 'wing', 'MBB', { _pct_PPG: undefined }), 'PPG')));
    });
  });
  c.league = 'MBB';
  c.pos = 'Wings';
  c.oppRefresh();
  assert.equal(Number(c.getElement('oppWingCount').textContent), 1);
  assert.deepEqual(plain(c.getHeadToHead().opponentPositions), { guard: 0, wing: 1, big: 0 });
});

test('AI filters, aliases and context include Wings in both leagues', function () {
  var c = context();
  ['MBB', 'WBB'].forEach(function (league) {
    installPools(c, league, Object.keys(labels).map(function (group) { return player(league + ' ' + group, group, league); }));
  });
  var chat = loadChat(c);
  ['MBB', 'WBB'].forEach(function (league) {
    c.league = league;
    c._cachedAllPlayers = null;
    c.tbRoster = c.tbGetAllPlayers().slice();
    ['Guards', 'Wings', 'Bigs'].forEach(function (active) {
      c.pos = active;
      ['wing', 'wings', 'SF', 'G-F', 'F/G'].forEach(function (alias) {
        var result = chat.getTopPlayers({ position: alias });
        assert.equal(result.results.length, 1);
        assert.equal(result.results[0].pos, 'Wings');
        assert.equal(result.results[0].player, league + ' wing');
      });
      assert.equal(chat.getTopPlayers({ position: 'guard' }).results.length, 1);
      assert.equal(chat.getTopPlayers({ position: 'big' }).results.length, 1);
      assert.equal(chat.getTopPlayers({ position: 'forward' }).results.length, 2);
      assert.deepEqual(plain(chat.getDashboardContext().rosterPositions), { Guards: 1, Wings: 1, Bigs: 1 });
      assert.equal(chat.getDashboardContext().targetWings, '5');
    });
  });
});

test('sibling computations restore active rows, statistics and valuation context', function () {
  var c = context();
  var original = { rows: [player('Active', 'guard')], computed: [player('Scored active', 'guard')], statDist: { PPG: { sorted: [1, 2], invert: false } } };
  c.league = 'MBB';
  c.pos = 'Guards';
  c.rows = original.rows;
  c.computed = original.computed;
  c.statDist = original.statDist;
  c.lastPerfAvg = 40;
  c.lastPerfStar = 80;
  c.ensureWeightsCoverStats = function () {};
  c._scheduleTeamListRefresh = c._scheduleValueLabDataChange = function () {};
  var computedGroups = [];
  c.computeAll = function (options) {
    assert.equal(options.background, true);
    computedGroups.push(c.pos);
    c.tbAllComputed[c.league + '_' + c.pos] = c.rows.slice();
    c.computed = c.rows.slice();
    c.statDist = {};
    c.lastPerfAvg = 1;
    c.lastPerfStar = 2;
  };
  c._scheduleSiblingPoolCompute('MBB', 'Guards', { guards: original.rows, wings: [player('Sibling wing', 'wing')], bigs: [player('Sibling big', 'big')] });
  assert.equal(c.runTimer(), true);
  assert.equal(c.runTimer(), true);
  assert.deepEqual(computedGroups, ['Wings', 'Bigs']);
  assert.equal(c.pos, 'Guards');
  assert.equal(c.rows, original.rows);
  assert.equal(c.computed, original.computed);
  assert.equal(c.statDist, original.statDist);
  assert.equal(c.lastPerfAvg, 40);
  assert.equal(c.lastPerfStar, 80);
});

test('background scoring preserves a pending foreground recalculation and empty pools clear anchors', function () {
  var c = context();
  c.rows = [];
  c.kpiPlayers = c.getElement('kpiPlayers');
  c.kpiAvgPerf = c.getElement('kpiAvgPerf');
  c.kpiStarPerf = c.getElement('kpiStarPerf');
  c.renderPlayers = function () {};
  c.requestComputeAll(120);
  var pending = c._computeAllTimer;
  c.computeAll({ skipRender: true, background: true });
  assert.equal(c._computeAllTimer, pending);
  c.statDist = { PPG: { sorted: [1, 2], invert: false } };
  c.lastPerfAvg = 40;
  c.lastPerfStar = 80;
  assert.equal(c.runTimer(), true);
  assert.equal(c._computeAllTimer, null);
  assert.deepEqual(plain(c.statDist), {});
  assert.ok(Number.isNaN(c.lastPerfAvg));
  assert.ok(Number.isNaN(c.lastPerfStar));
  assert.equal(c.kpiPlayers.textContent, '0');
});

test('late measurements re-bucket forwards and refresh saved roster scores without crossing leagues', function () {
  var c = context();
  c.league = 'MBB';
  c.pos = 'Wings';
  var sourceRow = { Player: 'Forward', Team: 'Test Team', Pos: 'F', Height: null, PPG: 10 };
  var sources = [sourceRow];
  c._mbbActivePlayersRef = sources;
  c._dataCommitLeaguePlayers('MBB', sources);
  var first = c._dataGetLeagueRows('MBB');
  assert.equal(first.wings.length, 1);
  var rosterRow = Object.assign({}, first.wings[0], { Score: 7, ActualValuation_calc: 10, _pct_PPG: 0.1, _pct_Obsolete: 0.7 });
  var otherLeague = Object.assign({}, rosterRow, { _league: 'WBB' });
  c.rows = first.wings;
  c.computed = [rosterRow];
  c.tbAllComputed.MBB_Wings = [rosterRow];
  c.tbRoster = [rosterRow];
  c.leagueRosters.MBB.tb = [rosterRow];
  c.leagueRosters.WBB.tb = [otherLeague];
  c._currentProfilePlayer = rosterRow;
  c.renderPlayers = function () {};
  var reloaded = 0;
  c.reloadActiveSheet = function () { reloaded++; c.rows = c._dataGetLeagueRows('MBB').wings; c.computed = []; };
  sourceRow.Height = 83;
  assert.equal(c._dataSyncPlayerBios(sources, 'MBB', 2026), true);
  assert.equal(reloaded, 1);
  var regrouped = c._dataGetLeagueRows('MBB');
  assert.equal(regrouped.wings.length, 0);
  assert.equal(regrouped.bigs.length, 1);
  assert.equal(c.tbPosGroup(rosterRow), 'big');
  var fresh = Object.assign({}, regrouped.bigs[0], { Score: 99, ActualValuation_calc: 90, _pct_PPG: 0.8 });
  c.tbAllComputed.MBB_Bigs = [fresh];
  var opened;
  c.openProfile = function (row) { opened = row; };
  c._dataRefreshScoredReferences('MBB', 'Bigs');
  assert.equal(rosterRow.Score, 99);
  assert.equal(rosterRow.ActualValuation_calc, 90);
  assert.equal(c.tbStatPercentile(rosterRow, 'PPG'), 0.8);
  assert.equal(Object.hasOwn(rosterRow, '_pct_Obsolete'), false);
  assert.equal(otherLeague.Position, 'Wings');
  assert.equal(otherLeague.Score, 7);
  assert.equal(c.runTimer(), true);
  assert.equal(opened, fresh);
});
