'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var path = require('node:path');
var runtime = require('./lib/valuation-runtime.cjs');
function close(a, b, epsilon) { assert.ok(Math.abs(a - b) < (epsilon || 1e-9), a + ' != ' + b); }
function fixture() {
  var groups = {};
  ['Guards', 'Wings', 'Bigs'].forEach(function (group, i) {
    groups[group] = { n: 100, intercept: 20, features: [
      { key: 'Height', label: 'Height', coefficient: 0.1 * (i + 1) },
      { key: 'MP', label: 'Minutes', coefficient: 0.3 },
      { key: 'PPG', label: 'Points', coefficient: 0.5 }
    ] };
  });
  return { version: 'test', groups: groups };
}
function player(name, ppg, height, mp) {
  return { Player: name, Team: 'Test', Position: 'Guards', Pos: 'PG', _league: 'MBB', G: 25,
    Height: height, PPG: ppg, MP: mp, APG: 3, RPG: 4, TOPG: 2, SPG: 1, BPG: 0.3,
    '3P%': 0.35, 'FT%': 0.8, 'eFG%': 0.55, '3PA/G': 3 };
}
test('within-position transfer uses the same relative height for women and men', function () {
  var c = runtime.createRuntime({ model: fixture() });
  var men = [player('A', 10, 70, 20), player('B', 20, 78, 30)];
  var women = men.map(function (row) { return Object.assign({}, row, { Height: row.Height - 8, _league: 'WBB' }); });
  var m = c.NbaValuation.createContext(men, 'MBB', 'Guards');
  var w = c.NbaValuation.createContext(women, 'WBB', 'Guards');
  close(c.NbaValuation.score(men[1], m).score, 0.9);
  close(c.NbaValuation.score(women[1], w).score, 0.9);
});
test('negative coefficients retain direction and groups use distinct learned coefficients', function () {
  var model = fixture(); model.groups.Guards.features[0].coefficient = -0.2;
  var c = runtime.createRuntime({ model: model });
  var pool = [player('A', 10, 70, 20), player('B', 10, 78, 20)];
  close(c.NbaValuation.score(pool[1], c.NbaValuation.createContext(pool, 'MBB', 'Guards')).score, -0.2);
  close(c.NbaValuation.score(pool[1], c.NbaValuation.createContext(pool, 'MBB', 'Bigs')).score, 0.3);
});

test('excluded inputs cannot alter the learned signal or college bid', function () {
  var model = fixture();
  model.groups.Guards.features = model.groups.Guards.features.filter(function (feature) { return feature.key !== 'PPG' && feature.key !== 'MP'; });
  var c = runtime.createRuntime({ model: model });
  var pool = [player('A', 10, 70, 20), player('B', 20, 78, 30)];
  var context = c.NbaValuation.createContext(pool, 'MBB', 'Guards');
  var original = c.NbaValuation.score(pool[1], context);
  var edited = Object.assign({}, pool[1], { TOPG: 99, PPG: 100, MP: 1, RPG: 50 });
  var changed = c.NbaValuation.score(edited, context);
  close(changed.score, original.score);
  assert.deepEqual(Array.from(changed.contributions, function (item) { return item.key; }), ['Height']);
  var settings = { avgPay: 100000, minPay: 10000, maxPay: 500000, starValue: 200000, k: 0.5, perfAvg: 0, perfStar: 1 };
  close(c.NbaValuation.quote(original, pool[1], settings, 1).final, c.NbaValuation.quote(changed, edited, settings, 1).final);
  delete edited.MP;
  var withoutMinutes = c.NbaValuation.score(edited, context);
  assert.equal(withoutMinutes.coverage, 1);
  assert.ok(!withoutMinutes.missing.includes('MP'));
  close(c.NbaValuation.quote(original, pool[1], settings, 1).final, c.NbaValuation.quote(withoutMinutes, edited, settings, 1).final);
});
test('missing height is neutral and documented, percentage formats and zero attempts handled', function () {
  var c = runtime.createRuntime({ model: fixture() });
  var pool = [player('A', 10, 70, 20), player('B', 20, 78, 30)];
  var row = player('C', 15, null, 25);
  var result = c.NbaValuation.score(row, c.NbaValuation.createContext(pool, 'MBB', 'Guards'));
  close(result.score, 0); close(result.coverage, 2 / 3);
  assert.deepEqual(Array.from(result.missing), ['Height']);
  close(c.NbaValuation.featureValue({ '3P%': 35, '3PA/G': 4 }, '3P%'), 0.35);
  assert.equal(c.NbaValuation.featureValue({ '3P%': 0, '3PA/G': 0 }, '3P%'), null);
  assert.equal(c.NbaValuation.featureValue({ 'FT%': 0, FTA: 0 }, 'FT%'), null);
  assert.equal(c.NbaValuation.featureValue({ 'FT%': 0 }, 'FT%'), null);
  assert.equal(c.NbaValuation.featureValue({ 'eFG%': 0, 'FGA/G': 0 }, 'eFG%'), null);
  assert.equal(c.NbaValuation.featureValue({ '3P%': 0, '3PA/G': 0, ThreePointAttempts: 1 }, '3P%'), 0);
  close(c.NbaValuation.featureValue({ 'eFG%': 1.5, FieldGoalAttempts: 1 }, 'eFG%'), 1.5);
  close(c.NbaValuation.featureValue({ 'eFG%': 150, FieldGoalAttempts: 1 }, 'eFG%'), 1.5);
  close(c.NbaValuation.featureValue({ '3P%': 0.5, '3PA/G': 0 }, '3P%'), 0.5);
  assert.equal(c.NbaValuation.featureValue({ '3P%': 0.5, ThreePointAttempts: 0 }, '3P%'), null);
});
test('outliers are capped and constant columns do not create spurious effects', function () {
  var c = runtime.createRuntime({ model: fixture() });
  var pool = [player('A', 10, 72, 20), player('B', 20, 72, 30)];
  var result = c.NbaValuation.score(player('C', 10000, 90, 25), c.NbaValuation.createContext(pool, 'MBB', 'Guards'));
  close(result.score, 1.5);
  assert.equal(result.contributions[2].clipped, true);
  assert.equal(result.contributions[0].contribution, 0);
});
test('college dollars use college anchors, no NBA intercept, no repeated minutes discount', function () {
  var c = runtime.createRuntime({ model: fixture() });
  var settings = { avgPay: 100000, minPay: 10000, maxPay: 500000, starValue: 200000,
    k: Math.log(2), perfAvg: 0, perfStar: 1, mpPctl: 30, mpMode: 'on' };
  var r = { score: 1, coverage: 1 };
  close(c.NbaValuation.quote(r, { MP: 1 }, settings, 1).final, 200000);
  close(c.NbaValuation.quote(r, { MP: 1 }, settings, 1.2).final, 240000);
  assert.equal(c.NbaValuation.quote(r, { MP: 1 }, settings, 1).mult, 1);
  assert.ok(Number.isNaN(c.NbaValuation.quote({ score: 0, coverage: 0 }, {}, settings, 1).final));
  [NaN, 0, -1].forEach(function (invalid) {
    var quote = c.NbaValuation.quote(r, { MP: 20 }, Object.assign({}, settings, { avgPay: invalid }), 1);
    assert.equal(quote.sufficient, false);
    assert.equal(quote.validCalibration, false);
    assert.ok(Number.isNaN(quote.final));
  });
  assert.equal(c.NbaValuation.quote(r, { MP: 20 }, Object.assign({}, settings, { k: -0.1 }), 1).validCalibration, false);
});
test('computeAll recalculates bids from NBA coefficients while keeping production scores separate', function () {
  var c = runtime.createRuntime({ model: fixture() });
  c.rows = [player('A', 10, 70, 20), player('B', 20, 78, 30), player('C', 15, 74, 25)];
  c.computeAll({ skipRender: true, background: true });
  c.computed.forEach(function (row) {
    assert.equal(row.NBAModel_calc, true);
    assert.equal(row.MinMultiplier_calc, 1);
    assert.equal(row.MarketDemandPremium_calc, 1);
    close(row.NBAContributions_calc.reduce(function (sum, f) { return sum + f.contribution; }, 0), row.NBAScore_calc);
    assert.ok(row.ActualValuation_calc >= 15000 && row.ActualValuation_calc <= 500000);
    assert.ok(row.Score >= 0 && row.Score <= 100);
    var projection = c.projectionCalcMetrics(row, { avgPay: 90000, minPay: 15000, maxPay: 500000,
      k: 1e6, lastPerfAvg: -500, perfPool: [20, 50, 80] }, row._projectionMemo);
    assert.ok(projection.ProjectionHealthyValue_calc <= row.ActualValuationBase_calc * 1.25 + 1e-6);
  });
  var before = c.computed.find(function (r) { return r.Player === 'B'; });
  var bid = before.ActualValuation_calc;
  c.currentWeights.Guards = [{ stat: 'PPG', w: 10, min: 0, max: 100 }];
  c.computeAll({ skipRender: true, background: true });
  close(c.computed.find(function (r) { return r.Player === 'B'; }).ActualValuation_calc, bid);
  var unavailable = Object.assign({}, c.computed[0], { ActualValuationBase_calc: NaN, ActualValuation_calc: NaN });
  var unavailableProjection = c.projectionCalcMetrics(unavailable, { avgPay: 90000, minPay: 15000, maxPay: 500000,
    k: 0.1, lastPerfAvg: 0, perfPool: [20, 50, 80] });
  assert.ok(!Number.isFinite(unavailableProjection.ProjectionMedianValue_calc), 'Unavailable NBA quotes must not fall back to the custom score curve');
});
test('custom mode remains available and clears learned-model metadata', function () {
  var c = runtime.createRuntime({ model: fixture(), enabled: false });
  c.rows = [player('A', 10, 70, 20), player('B', 20, 78, 30)];
  c.rows[0].NBAScore_calc = 100; c.rows[0].NBAContributions_calc = [{ key: 'Height' }];
  c.computeAll({ skipRender: true, background: true });
  c.computed.forEach(function (row) {
    assert.equal(row.NBAModel_calc, false);
    assert.equal(row.NBAContributions_calc, undefined);
    assert.ok(row.MinMultiplier_calc <= 1);
  });
  assert.equal(c.isLikelyNumericColumn('NBAScore_calc'), false);
});
test('generated JSON and browser coefficients match exactly', function () {
  var filename = path.join(runtime.root, 'data/nba-valuation-model.json');
  if (!fs.existsSync(filename)) return;
  var c = runtime.createRuntime();
  assert.deepEqual(JSON.parse(JSON.stringify(c.NbaValuation.getModel())), JSON.parse(fs.readFileSync(filename, 'utf8')));
  ['Guards', 'Wings', 'Bigs'].forEach(function (group) {
    assert.ok(c.NbaValuation.getGroup(group).features.some(function (f) { return f.key === 'Height'; }));
    assert.ok(!c.NbaValuation.getGroup(group).features.some(function (f) { return f.key === 'Age'; }));
  });
});
