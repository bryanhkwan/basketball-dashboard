'use strict';
var test = require('node:test');
var assert = require('node:assert/strict');
var B = require('../modules/player-bios.js');

function snapshot(records, extra) {
  return Object.assign({ version: 1, league: 'MBB', season: 2026, generatedAt: '2026-09-14T00:00:00Z', complete: true,
    source: 'test roster', teams: [['150', 'Duke', 'Duke Blue Devils']], errors: [], records: records }, extra);
}
function row(extra) { return Object.assign({ espnId: '7', cbdId: '17', teamId: '150', team: 'Duke', name: 'John Smith Jr.', height: 79, weight: 211 }, extra); }
function response(body, status) { return { ok: (status || 200) === 200, status: status || 200, json: async function () { return body; } }; }

test('units and missing values never invent measurements', function () {
  assert.equal(B.normalizeHeight('6\' 7"'), 79);
  assert.equal(B.normalizeHeight('6-7'), 79);
  assert.equal(B.normalizeHeight('200.66 cm'), 79);
  assert.equal(B.normalizeWeight('95 kg'), 209.4);
  assert.equal(B.normalizeWeight('211 lbs'), 211);
  [null, '', 0, -4, NaN, Infinity, 'N/A', '6.7', '6-14', '200'].forEach(function (value) { assert.equal(B.normalizeHeight(value), null); });
  [null, '', 0, -1, NaN, Infinity, 'N/A', '600'].forEach(function (value) { assert.equal(B.normalizeWeight(value), null); });
});

test('safe exact IDs and team names populate fields with provenance', function () {
  var players = [{ EspnId: '7', Player: 'Different spelling', Team: 'Duke' }];
  var stats = B.apply(players, snapshot([row()]), 'MBB', 2026);
  assert.equal(stats.height, 1);
  assert.equal(stats.weight, 1);
  assert.equal(players[0].Height, 79);
  assert.equal(players[0].Weight, 211);
  assert.equal(players[0].CbdId, '17');
  assert.equal(players[0].BioSeason, 2026);
  assert.equal(players[0].BioUpdatedAt, '2026-09-14T00:00:00Z');
});

test('suffixes, homonyms, and conflicting identities cannot cross match', function () {
  var cases = [
    { Player: 'John Smith', Team: 'Duke' },
    { Player: 'John Smith Jr.', Team: 'Kansas' },
    { Player: 'John Smith Jr.', Team: 'Duke', EspnId: '99' },
    { Player: 'John Smith Jr.', Team: 'Duke', CbdId: '99' },
    { Player: 'John Smith Jr.', Team: 'Duke', EspnId: '7', CbdId: '99' }
  ];
  B.apply(cases, snapshot([row()]), 'MBB', 2026);
  cases.forEach(function (player) { assert.equal(player.Height, null); });
  var ambiguous = [{ Player: 'John Smith Jr.', Team: 'Duke' }];
  B.apply(ambiguous, snapshot([row(), row({ espnId: '8', cbdId: '18' })]), 'MBB', 2026);
  assert.equal(ambiguous[0].Height, null);
  var cbdOnly = [{ Player: 'John Smith Jr.', Team: 'Duke', EspnId: '7', CbdId: '17' }];
  B.apply(cbdOnly, snapshot([row({ espnId: null })]), 'MBB', 2026);
  assert.equal(cbdOnly[0].Height, 79);
});

test('scope isolation and existing valid measurements are preserved', function () {
  assert.throws(function () { B.apply([], snapshot([row()]), 'WBB', 2026); }, /mismatch/);
  assert.throws(function () { B.apply([], snapshot([row()]), 'MBB', 2025); }, /mismatch/);
  var players = [
    { EspnId: '7', _league: 'WBB' }, { EspnId: '7', _season: 2025 },
    { EspnId: '7', Height: 80, Weight: 205 }, { EspnId: '7', Height: 0, Weight: 0 }
  ];
  B.apply(players, snapshot([row({ weight: null })]), 'MBB', 2026);
  assert.equal(players[0].Height, undefined);
  assert.equal(players[1].Height, undefined);
  assert.equal(players[2].Height, 80);
  assert.equal(players[2].Weight, 205);
  assert.equal(players[3].Height, 79);
  assert.equal(players[3].Weight, null);
});

test('one snapshot fetch serves concurrent loads and persists null weight without refetch', async function () {
  B.clearMemory();
  var calls = 0;
  var values = {};
  var store = { getItem: function (key) { return values[key]; }, setItem: function (key, value) { values[key] = value; } };
  var options = { storage: store, fetch: async function () { calls++; return response(snapshot([row({ weight: null })])); } };
  var first = [{ EspnId: '7' }];
  var second = [{ EspnId: '7' }];
  await Promise.all([B.enrich(first, 'MBB', 2026, options), B.enrich(second, 'MBB', 2026, options)]);
  assert.equal(calls, 1);
  assert.equal(first[0].Height, 79);
  assert.equal(second[0].Weight, null);
  B.clearMemory();
  await B.enrich([{ EspnId: '7' }], 'MBB', 2026, options);
  assert.equal(calls, 1);
});

test('successful raw stats and ESPN remain usable when the CBD roster fails', async function () {
  var calls = [];
  var result = await B.refresh('MBB', 2026, { retries: 0, fetch: async function (url) {
    calls.push(url);
    if (url.includes('/teams/roster')) return response(null, 503);
    if (url.includes('/stats/player/season')) return response([{ season: 2026, teamId: 72, team: 'Duke', name: 'John Smith Jr.', athleteId: 17, athleteSourceId: '7' }]);
    if (url.includes('/v3/')) return response({ pageCount: 1, pageIndex: 1, items: [{ id: '7', height: 79, weight: 211 }] });
    throw new Error('Unexpected request: ' + url);
  } });
  assert.equal(result.coverage.height, 1);
  assert.equal(result.coverage.weight, 1);
  assert.equal(result.complete, false);
  assert.equal(result.errors.length, 1);
  assert.equal(calls.length, 3);
});

test('invalid source pages cannot be marked complete', async function () {
  var result = await B.refresh('WBB', 2026, { retries: 0, fetch: async function (url) {
    if (url.includes('statistics/byathlete')) return response({ pagination: { pages: 2 }, athletes: [{ athlete: { id: '7', displayName: 'John Smith Jr.', teamId: '150', teamName: 'Duke' } }] });
    if (url.includes('page=1')) return response({ pageCount: 2, items: [{ id: '7', height: 79 }] });
    return response({});
  } });
  assert.equal(result.complete, false);
  assert.ok(result.errors.some(function (error) { return error.includes('Invalid ESPN athlete bio page'); }));
});
