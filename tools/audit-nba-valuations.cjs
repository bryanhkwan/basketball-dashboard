#!/usr/bin/env node
'use strict';
// Runs real NBA-enabled and legacy scoring on every loaded NCAA player.
// node --use-system-ca --use-env-proxy tools/audit-nba-valuations.cjs --season 2026
var fs = require('node:fs');
var path = require('node:path');
var assert = require('node:assert/strict');
var runtime = require('./lib/valuation-runtime.cjs');
var args = process.argv.slice(2);
var season = Number(args.includes('--season') ? args[args.indexOf('--season') + 1] : 2026);
var output = path.join(runtime.root, 'reports/nba-valuation');
function numeric(value) { return typeof value === 'number' && Number.isFinite(value); }
function identity(row) {
  // Providers can retain multiple season fragments under the same name/team.
  // Compare the same statistical record across models rather than overwriting it.
  return JSON.stringify([row.CbdId || '', row.EspnId || '', row.Player, row.Team, row.G, row.MP, row.PPG, row.RPG, row.APG]);
}
function csv(value) { return '"' + (value == null ? '' : String(value)).replaceAll('"', '""') + '"'; }
async function dashboardFetch(url, options) {
  var target = String(url);
  if (!/^https?:\/\//.test(target)) {
    var filename = path.resolve(runtime.root, target.split('?')[0]);
    if (!filename.startsWith(runtime.root + path.sep)) throw new Error('Unexpected relative data URL');
    if (!fs.existsSync(filename)) return { ok: false, status: 404, json: async function () { return {}; } };
    var data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    return { ok: true, status: 200, json: async function () { return data; } };
  }
  return fetch(target, Object.assign({ signal: AbortSignal.timeout(60000) }, options));
}
async function main() {
  assert.ok(/^20\d\d$/.test(String(season)), 'Use a four-digit season');
  var ctx = runtime.createRuntime({ fetch: dashboardFetch });
  var legacy = runtime.createRuntime({ enabled: false });
  ctx._currentDataSeason = legacy._currentDataSeason = season;
  var groups = [], exports = [];
  var featureKeys = ctx.NbaValuation.getModel().featureKeys;
  var headers = ['League', 'Season', 'Position', 'Player', 'Team', 'CbdId', 'EspnId', 'Conference', 'Games', 'MinutesPerGame', 'HeightInches', 'ProductionScore', 'NBASignal', 'InputCoverage',
    'LegacyBid', 'NBAUnboundedBase', 'AfterConferenceAndBounds', 'TranslationAdjustment', 'AfterTranslation', 'ScoutAdjustment',
    'NBABasedBid', 'Change', 'MarketContext', 'ConferenceMultiplier', 'MissingInputs'].concat(featureKeys.map(function (key) { return key + ' contribution'; }));
  for (var league of ['MBB', 'WBB']) {
    process.stderr.write('Loading and recalculating ' + league + ' ' + season + '\n');
    var loaded = league === 'MBB' ? await ctx._loadMbbSheetData(season) : await ctx._loadWbbSheetData(season);
    assert.ok(loaded.players && loaded.players.length, loaded.warning || 'No player data');
    ctx.setLeague(league); legacy.setLeague(league);
    ctx._dataCommitLeaguePlayers(league, loaded.players);
    legacy._dataCommitLeaguePlayers(league, JSON.parse(JSON.stringify(loaded.players)));
    // Match published default college assumptions (conference strength enabled).
    ctx.element('confMultToggle').checked = legacy.element('confMultToggle').checked = true;
    var partition = ctx._dataGetLeagueRows(league);
    var oldPartition = legacy._dataGetLeagueRows(league);
    var count = 0;
    for (var group of ['Guards', 'Wings', 'Bigs']) {
      ctx.pos = legacy.pos = group;
      ctx.rows = partition[group.toLowerCase()]; legacy.rows = oldPartition[group.toLowerCase()];
      ctx.computeAll({ skipRender: true, background: true });
      legacy.computeAll({ skipRender: true, background: true });
      var previous = new Map(legacy.computed.map(function (row) { return [identity(row), row.ActualValuation_calc]; }));
      var settings = ctx.getValuationModelDefaults('recommended', league);
      var finite = 0, changed = 0, heights = 0, clipped = 0, covered = 0, lightSample = 0;
      var positionKeys = ctx.NbaValuation.getModel().groups[group].features.map(function (feature) { return feature.key; });
      var featureCoverage = Object.fromEntries(positionKeys.map(function (key) { return [key, 0]; }));
      ctx.computed.forEach(function (row) {
        count++;
        assert.equal(row.NBAModel_calc, true);
        assert.equal(row.NBAPosition_calc, group);
        assert.equal(row.MinMultiplier_calc, 1);
        assert.equal(row.MarketDemandPremium_calc, 1);
        assert.deepEqual(Array.from(row.NBAContributions_calc, function (feature) { return feature.key; }), Array.from(positionKeys), 'Contributions use only this position\'s retained prediction inputs');
        assert.ok(Math.abs(row.NBACoverage_calc - (positionKeys.length - row.NBAMissing_calc.length) / positionKeys.length) < 1e-12, 'Coverage denominator uses this position\'s input count');
        var sum = row.NBAContributions_calc.reduce(function (value, feature) { return value + feature.contribution; }, 0);
        assert.ok(Math.abs(sum - row.NBAScore_calc) < 1e-9, 'Contributions must sum to score');
        row.NBAContributions_calc.forEach(function (feature) { if (!feature.missing) featureCoverage[feature.key]++; });
        if (numeric(row.Height)) heights++;
        if (row.G < 5 || row.MP < 10) lightSample++;
        covered += row.NBACoverage_calc;
        if (row.NBAContributions_calc.some(function (feature) { return feature.clipped; })) clipped++;
        var old = previous.get(identity(row));
        if (numeric(row.ActualValuation_calc)) {
          finite++;
          assert.ok(row.ActualValuation_calc >= settings.minPay && row.ActualValuation_calc <= settings.maxPay);
          if (Math.abs(old - row.ActualValuation_calc) > 1) changed++;
        }
        var contributions = new Map(row.NBAContributions_calc.map(function (feature) { return [feature.key, feature.contribution]; }));
        exports.push([league, season, group, row.Player, row.Team, row.CbdId, row.EspnId, row.Conference, row.G, row.MP, row.Height, row.Score, row.NBAScore_calc, row.NBACoverage_calc,
          old, row.NBABaseValue_calc, row.ActualValuationCurve_calc, row.TranslationRiskPct_calc, row.ActualValuationBase_calc, row.ScoutAdjustmentPct_calc,
          row.ActualValuation_calc, row.ActualValuation_calc - old, row.MarketPressure_calc, row.NBAConferenceMultiplier_calc,
          row.NBAMissing_calc.join('; ')].concat(featureKeys.map(function (key) { return contributions.get(key); })));
      });
      var top = ctx.computed.slice().sort(function (a, b) { return b.ActualValuation_calc - a.ActualValuation_calc; }).slice(0, 5);
      groups.push({ league: league, position: group, players: ctx.computed.length, calculated: finite, changedFromLegacy: changed,
        heights: heights, averageInputCoverage: covered / ctx.computed.length, fewerThan5GamesOr10Minutes: lightSample,
        cappedOutlierPlayers: clipped, retainedInputs: positionKeys, featureCoverage: featureCoverage,
        top: top.map(function (row) { return { player: row.Player, team: row.Team, value: row.ActualValuation_calc, score: row.NBAScore_calc }; }) });
      assert.equal(finite, ctx.computed.length, league + ' ' + group + ' has unavailable valuations');
    }
    assert.equal(count, loaded.players.length, 'Every source player is valued exactly once');
  }
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'ncaa-valuations-' + season + '.csv'), [headers].concat(exports).map(function (row) { return row.map(csv).join(','); }).join('\n') + '\n');
  var audit = { auditedAt: new Date().toISOString(), season: season, model: ctx.NbaValuation.getModel().id,
    note: 'Experimental NBA association transfer. Counts describe loaded college records, including mixed competition levels and provider fragments with repeated names/teams. College pay anchors, conference factors, translation and scouting adjustments are assumptions, not observed NCAA compensation.', groups: groups };
  fs.writeFileSync(path.join(output, 'ncaa-valuation-audit-' + season + '.json'), JSON.stringify(audit, null, 2) + '\n');
  console.log(JSON.stringify(audit, null, 2));
}
main().catch(function (error) { console.error(error); process.exitCode = 1; });
