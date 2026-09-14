'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var root = path.resolve(__dirname, '..');

function plain(value) { return JSON.parse(JSON.stringify(value)); }
function source(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function context() {
  var saved = new Map();
  var c = vm.createContext({
    console: console,
    setTimeout: function () { return 1; },
    clearTimeout: function () {},
    addEventListener: function () {},
    PlayerBios: require('../modules/player-bios.js'),
    localStorage: {
      getItem: function (key) { return saved.get(key) || null; },
      setItem: function (key, value) { saved.set(key, String(value)); }
    },
    document: { getElementById: function () { return null; }, addEventListener: function () {} }
  });
  c.window = c;
  ['config', 'data', 'teambuilder', 'profile', 'portal', 'value-lab', 'player-development', 'eval-presets'].forEach(function (name) {
    vm.runInContext(source('modules/' + name + '.js'), c, { filename: name + '.js' });
  });
  // Expose the dossier's private recommendation calculation only in this test VM.
  vm.runInContext(source('modules/profile-dossier.js').replace('window.ProfileDossier = {',
    'window._testDossierSimilar = pdSimilarPlayers; window.ProfileDossier = {'), c);
  c.currentWeights = c.evalPresetDefaultsForLeague('MBB');
  return c;
}

function player(name, listed, extra) {
  return Object.assign({ Player: name, Team: 'Test Team', Pos: listed, _league: 'MBB', Score: 50,
    ActualValuation_calc: 100000, 'PPG': 12, 'eFG%': 0.5, '3P%': 0.35, '3PA/G': 3,
    'APG': 2, 'RPG': 4, 'BPG': 0.4, 'SPG': 1, 'A/TO': 1.4, 'FT%': 0.75, G: 25, MP: 25 }, extra);
}

test('profile, portal, value and development preserve three groups regardless of active tab', function () {
  var c = context();
  var cases = [
    ['PG', {}, 'guard'], ['SG', {}, 'guard'],
    ['G-F', {}, 'wing'], ['F-G', {}, 'wing'], ['SF', {}, 'wing'],
    ['F', { Height: 78 }, 'wing'], ['PF', {}, 'big'], ['C', {}, 'big'],
    ['F', { Height: 82 }, 'big'], ['F', { Height: 72, _league: 'WBB' }, 'wing']
  ];
  ['Guards', 'Wings', 'Bigs'].forEach(function (active) {
    c.pos = active;
    cases.forEach(function (item) {
      var p = player(item[0], item[0], item[1]);
      assert.equal(c.portalPlayerPosGroup(p), item[2]);
      assert.equal(c.valueLabPosGroup(p), item[2]);
      assert.equal(c.PlayerDevelopment.buildAnalysis(p, [], null).posGroup, item[2]);
    });
  });
  assert.equal(c.portalEntryPosGroup({ position: 'G-F' }, null), 'wing');
  assert.equal(c.portalEntryPosGroup({ position: 'PF' }, null), 'big');
});

test('wing needs persist and use wing gap categories and wing-only archetype percentiles', function () {
  var c = context();
  c.portalNeedFilterEl = { value: 'wing' };
  c.portalSaveNeedFilterPref();
  c.portalNeedFilterEl.value = 'all';
  c.portalLoadNeedFilterPref();
  assert.equal(c.portalGetSelectedNeedGroup(), 'wing');
  assert.equal(c.portalNeedGroupLabel('wing'), 'Wings');
  var labels = c.portalCategoryDefsForRoster([player('Wing', 'SF')]).map(function (row) { return row.label; });
  assert.ok(labels.includes('Rebounding'));
  assert.ok(!labels.includes('Rim protection'));
  assert.ok(c.portalCategoryDefsForRoster([player('Big', 'C')], 'wing').some(function (row) { return row.label === 'Shooting'; }));
  c.portalAllPlayers = [];
  for (var i = 0; i < 15; i++) {
    c.portalAllPlayers.push(player('Wing ' + i, 'SF', { 'PPG': i }));
    c.portalAllPlayers.push(player('Big ' + i, 'C', { 'PPG': 100 + i }));
  }
  var distribution = c.portalBuildArchetypeDist('wing');
  assert.equal(distribution.PPG.sorted.length, 15);
  assert.equal(distribution.PPG.sorted[14], 14);
  var tags = c.portalArchetypeTagsFor(c.portalAllPlayers[28]).map(function (tag) { return tag.t; });
  assert.ok(tags.includes('Scorer'));
  assert.ok(!tags.includes('Stretch Big'));
});

test('value analysis prices wings against wings and keeps positional spend separate', function () {
  var c = context();
  var wing = player('Wing', 'SF', { Score: 50 });
  var wingPeer = player('Wing peer', 'G-F', { Score: 60 });
  var guard = player('Guard', 'PG', { Score: 90 });
  var big = player('Big', 'C', { Score: 20 });
  c.tbGetAllPlayers = function () { return [wing, wingPeer, guard, big]; };
  var analysis = c.valueLabBuildAnalysis({ players: [wing, guard, big], mode: 'scenario', sourceType: 'manual' });
  assert.equal(analysis.players.find(function (p) { return p.Player === 'Wing'; }).expectedPerf, 60);
  assert.deepEqual(plain(analysis.breakdowns.position.map(function (p) { return p.label; }).sort()), ['Bigs', 'Guards', 'Wings']);
});

test('profile similarity excludes guards and bigs while the wing simulator restores the active tab', function () {
  var c = context();
  var current = player('Current wing', 'G-F');
  var peer = player('Wing peer', 'SF');
  var pool = [current, peer, player('Guard', 'SG'), player('Big', 'PF')];
  c.tbGetAllPlayers = function () { return pool; };
  var vectors = c.profileGetSimilarVectorRows(pool, 'Wings', ['PPG', 'RPG']);
  assert.deepEqual(plain(vectors.map(function (entry) { return entry.player.Player; })), ['Current wing', 'Wing peer']);
  assert.deepEqual(plain(c._testDossierSimilar(current).map(function (entry) { return entry.player.Player; })), ['Wing peer']);
  c.pos = 'Bigs';
  c.scoreRow = function () { assert.equal(c.pos, 'Wings'); return 42; };
  assert.equal(c.PlayerDevelopment.scoreRowForPlayer(current), 42);
  assert.equal(c.pos, 'Bigs');
});

test('profile position labels retain provider listings and visibly identify inferred groups', function () {
  var c = context();
  var wing = player('Inferred wing', 'F', { ListedPosition: 'F', Height: 78 });
  c.applyPlayerPosition(wing, 'MBB');
  assert.equal(c.profilePositionLabel(wing), 'Listed F · Wings (inferred)');
  assert.match(c.playerPositionExplanation(wing), /Inferred group/);
  var big = player('Listed big', 'PF');
  c.applyPlayerPosition(big, 'MBB');
  assert.equal(c.profilePositionLabel(big), 'Listed PF · Bigs');
});

test('legacy presets with missing, empty or invalid Wings restore league defaults', function () {
  ['MBB', 'WBB'].forEach(function (league) {
    var c = context();
    c.league = league;
    c.renderWeights = c.renderConfMultTable = c.updateWeightFooter = function () {};
    c.applyLeagueDefaults = function () {};
    [undefined, [], [{}]].forEach(function (weights) {
      c.currentWeights.Wings = [{ stat: 'PPG', w: 1, min: 0, max: 20, dir: 'higher' }];
      var legacy = { positionWeights: { Guards: [{ stat: 'APG', w: 100 }], Bigs: [{ stat: 'RPG', w: 100 }], Wings: weights } };
      c.evalPresetApplyPayload(legacy, { league: league });
      assert.deepEqual(plain(c.currentWeights.Wings), plain(c.evalPresetDefaultsForLeague(league).Wings));
      assert.equal(c.currentWeights.Guards[0].stat, 'APG');
      assert.equal(c.currentWeights.Bigs[0].stat, 'RPG');
      var normalized = c.evalPresetNormalizeComparablePayload(legacy, league);
      assert.deepEqual(plain(normalized.positionWeights.Wings), plain(c.evalPresetComparableWeights(c.currentWeights.Wings)));
    });
  });
});

test('custom Wings weights serialize, reload and affect dirty signatures', function () {
  var c = context();
  var before = c.evalPresetCurrentComparableSignature('MBB');
  c.currentWeights.Wings = [{ stat: 'RPG', w: 100, min: 1, max: 10, dir: 'higher' }];
  assert.notEqual(c.evalPresetCurrentComparableSignature('MBB'), before);
  var clean = c.evalPresetSerializeCurrent();
  assert.deepEqual(plain(clean.positionWeights.Wings), plain(c.currentWeights.Wings));
  assert.deepEqual(plain(c.evalPresetNormalizeComparablePayload(clean, 'MBB').positionWeights.Wings), plain(c.currentWeights.Wings));
});

test('Worker sanitizer preserves custom Wings weights', {
  skip: !fs.existsSync(path.join(root, 'backend/dashboard-api/hidden-salad-773b/src/index.js'))
}, function () {
  // The Worker is a separate, optional nested checkout excluded from the frontend repository.
  var worker = source('backend/dashboard-api/hidden-salad-773b/src/index.js');
  var workerContext = vm.createContext({});
  vm.runInContext(worker.slice(worker.indexOf('function normalizeDirValue(value)'), worker.indexOf('function cleanStringArray(')), workerContext);
  var weights = [{ stat: 'RPG', w: 100, min: 1, max: 10, dir: 'higher' }];
  assert.deepEqual(plain(workerContext.cleanEvalPresetPayload({ positionWeights: { Wings: weights } }).positionWeights.Wings), weights);
  assert.equal(workerContext.cleanEvalPresetPayload({ positionWeights: { Wings: [{}, null, { stat: 'PPG', w: '12', dir: 'invalid' }] } }).positionWeights.Wings.length, 1);
});
