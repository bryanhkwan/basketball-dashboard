#!/usr/bin/env node
'use strict';
// Read-only coverage audit against the live dashboard player populations.
// node --use-system-ca --use-env-proxy tools/audit-player-bios.cjs --seasons 2026
var fs = require('node:fs');
var path = require('node:path');
var bios = require('../modules/player-bios.js');
var args = process.argv.slice(2);
function arg(name, fallback) { var index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; }
var seasons = arg('--seasons', '2026').split(',').map(Number);
var selected = arg('--league', 'ALL').toUpperCase();
var leagues = selected === 'ALL' ? ['MBB', 'WBB'] : [selected];
var sampleLimit = Math.max(0, Number(arg('--sample', '30')) || 0);
var worker = 'https://hidden-salad-773b.bryanhkwan.workers.dev';

async function request(url) {
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      var response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Mozilla/5.0 (NCAA dashboard read-only coverage audit)' } });
      if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + url);
      return await response.json();
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(function (resolve) { setTimeout(resolve, 400 * (attempt + 1)); });
    }
  }
}

async function playersFor(league, season) {
  if (league === 'MBB') {
    var data = await request(worker + '/api/cbdata/players?season=' + season);
    if (!Array.isArray(data.players)) throw new Error('MBB response is missing players');
    return data.players;
  }
  var base = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/womens-college-basketball/statistics/byathlete?season=' + season + '&limit=1000&page=';
  var first = await request(base + '1');
  var pages = [first];
  var count = Number(first.pagination && first.pagination.pages) || 1;
  for (var start = 2; start <= count; start += 4) {
    var numbers = Array.from({ length: Math.min(4, count - start + 1) }, function (_, index) { return start + index; });
    pages.push.apply(pages, await Promise.all(numbers.map(function (page) { return request(base + page); })));
  }
  var players = pages.flatMap(function (page) {
    if (!Array.isArray(page.athletes)) throw new Error('WBB response is missing athletes');
    if (page.requestedSeason && Number(page.requestedSeason.year) !== season) throw new Error('WBB response has the wrong season');
    return page.athletes.filter(function (entry) { return entry.athlete && entry.athlete.displayName; }).map(function (entry) {
      var athlete = entry.athlete;
      return { Player: athlete.displayName, Team: athlete.teamName || '', TeamId: athlete.teamId || '', EspnId: athlete.id || '',
        Height: bios.normalizeHeight(athlete.height || athlete.displayHeight), Weight: bios.normalizeWeight(athlete.weight || athlete.displayWeight) };
    });
  });
  if (first.pagination && Number(first.pagination.count) !== players.length) throw new Error('WBB player population count does not match pagination');
  return players;
}

function audit(players, snapshot, league, season) {
  var decoded = bios.decode(snapshot);
  var original = JSON.parse(JSON.stringify(players));
  var coverage = bios.apply(players, snapshot, league, season);
  // An in-memory marker identifies exact apply() matches without exporting its
  // private matcher or guessing whether a missing measurement means no match.
  var marked = Object.assign({}, snapshot, { records: decoded.map(function (record) { return Object.assign({}, record, { classYear: '__bio_audit_match__' }); }) });
  var markedPlayers = original.map(function (player) { return Object.assign({}, player, { Class: '' }); });
  bios.apply(markedPlayers, marked, league, season);
  var unmatched = [];
  var reasons = {};
  var nameMap = Object.create(null);
  var idMap = Object.create(null);
  decoded.forEach(function (record) {
    var name = bios.normalizeName(record.name);
    (nameMap[name] || (nameMap[name] = [])).push(record);
    if (record.espnId) (idMap[String(record.espnId)] || (idMap[String(record.espnId)] = [])).push(record);
  });
  markedPlayers.forEach(function (player, index) {
    if (player.Class === '__bio_audit_match__') return;
    var row = original[index];
    var names = nameMap[bios.normalizeName(row.Player)] || [];
    var ids = idMap[String(row.EspnId || '')] || [];
    var reason = ids.length ? 'ID candidates conflict or are ambiguous' : row.EspnId ? (names.length ? 'ID absent; name exists' : 'ID and name absent') : names.length ? 'No ID; team/name mismatch' : 'No ID; name absent';
    reasons[reason] = (reasons[reason] || 0) + 1;
    unmatched.push({ player: row.Player, team: row.Team, espnId: row.EspnId || null, reason: reason,
      candidates: names.map(function (record) { return { name: record.name, team: record.team, teamId: record.teamId, espnId: record.espnId, height: record.height, weight: record.weight }; }) });
  });
  var conferenceRows = players.filter(function (player) { return !!player.Conference; });
  return { league: league, season: season, snapshotGeneratedAt: snapshot.generatedAt, snapshotComplete: snapshot.complete, coverage: coverage,
    conferencePopulation: league === 'MBB' ? { total: conferenceRows.length,
      height: conferenceRows.filter(function (player) { return bios.normalizeHeight(player.Height) !== null; }).length,
      weight: conferenceRows.filter(function (player) { return bios.normalizeWeight(player.Weight) !== null; }).length } : undefined,
    inputWithEspnId: original.filter(function (p) { return !!p.EspnId; }).length,
    unmatchedCount: unmatched.length, reasons: reasons, unmatched: unmatched.slice(0, sampleLimit),
    missingHeightSample: players.filter(function (p) { return bios.normalizeHeight(p.Height) === null; }).slice(0, sampleLimit).map(function (p) { return { player: p.Player, team: p.Team, espnId: p.EspnId || null }; }) };
}

async function main() {
  for (var season of seasons) {
    for (var league of leagues) {
      if (league !== 'MBB' && league !== 'WBB') throw new Error('Unknown league: ' + league);
      var filename = path.resolve(__dirname, '../data/player-bios-' + league.toLowerCase() + '-' + season + '.json');
      if (!fs.existsSync(filename)) { console.log(JSON.stringify({ league: league, season: season, skipped: 'Snapshot does not exist yet' })); continue; }
      var snapshot = JSON.parse(fs.readFileSync(filename, 'utf8'));
      console.log(JSON.stringify(audit(await playersFor(league, season), snapshot, league, season)));
    }
  }
}
if (require.main === module) main().catch(function (error) { console.error(error); process.exitCode = 1; });
module.exports = { audit: audit, playersFor: playersFor };
