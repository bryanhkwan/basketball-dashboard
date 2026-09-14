#!/usr/bin/env node
'use strict';
// Read-only, dependency-free audit of the real dashboard loading/partition code.
// node --use-system-ca --use-env-proxy tools/audit-player-positions.cjs --season 2026
// Add --published [https://bryanhkwan.github.io/basketball-dashboard/] to audit
// the served scripts and snapshots instead of the working tree. No files written.
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var crypto = require('node:crypto');
var root = path.resolve(__dirname, '..');
var args = process.argv.slice(2);
function arg(name, fallback) {
  var index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}
var season = Number(arg('--season', '2026'));
var selected = arg('--league', 'ALL').toUpperCase();
var leagues = selected === 'ALL' ? ['MBB', 'WBB'] : [selected];
var publishedIndex = args.indexOf('--published');
var publishedArg = publishedIndex >= 0 ? args[publishedIndex + 1] : '';
var base = publishedIndex < 0 ? null : (publishedArg && !publishedArg.startsWith('--')
  ? publishedArg : 'https://bryanhkwan.github.io/basketball-dashboard/');
if (base) base = new URL(base.endsWith('/') ? base : base + '/').href;
var observations = { snapshots: {}, mappedMbb: null, espn: [], requests: [] };

function number(row, key) {
  var value = row[key];
  return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
}
function fieldAttempts(row) {
  var perGame = number(row, 'FGA/G');
  return perGame !== null ? perGame : number(row, 'G') > 0 && number(row, 'FGA') !== null ? number(row, 'FGA') / number(row, 'G') : null;
}
function identity(row) { return JSON.stringify([row.Player || '', row.Team || '', String(row.EspnId || ''), String(row.CbdId || row.CBDId || '')]); }
function increment(counts, key) { counts[key] = (counts[key] || 0) + 1; }
function distribution(rows, key) {
  var counts = {};
  rows.forEach(function (row) { increment(counts, typeof key === 'function' ? key(row) : row[key] || '(missing)'); });
  return counts;
}
function cleanPosition(value) {
  if (value && typeof value === 'object') value = value.abbreviation || value.name || value.displayName;
  return String(value || 'NA').trim();
}

async function request(url, options) {
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      var response = await fetch(url, Object.assign({}, options, {
        signal: options && options.signal || AbortSignal.timeout(30000),
        headers: { 'User-Agent': 'Mozilla/5.0 (NCAA dashboard read-only position audit)' },
        cache: 'no-store'
      }));
      if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + url);
      return response;
    } catch (error) {
      if (attempt === 2 || options && options.signal && options.signal.aborted) throw error;
      await new Promise(function (resolve) { setTimeout(resolve, 300 * (attempt + 1)); });
    }
  }
}

function observe(url, data) {
  if (/player-bios-(mbb|wbb)-\d{4}\.json/.test(url)) observations.snapshots[data.league] = data;
  if (/\/api\/cbdata\/players\?/.test(url) && Array.isArray(data.players)) {
    observations.mappedMbb = data.players.map(function (row) {
      return { Pos: row.Pos, ListedPosition: row.ListedPosition, G: row.G, FGA: row.FGA, 'FGA/G': row['FGA/G'] };
    });
  }
  if (/statistics\/byathlete\?/.test(url) && Array.isArray(data.athletes)) {
    if (data.requestedSeason && Number(data.requestedSeason.year) !== season) throw new Error('ESPN returned the wrong season');
    observations.espn.push({
      page: Number(new URL(url).searchParams.get('page')), count: data.pagination && data.pagination.count,
      players: data.athletes.map(function (entry) {
        var athlete = entry.athlete || {};
        var hasFga = (data.categories || []).some(function (category, index) {
          var field = (category.names || []).indexOf('fieldGoalsAttempted');
          return field >= 0 && entry.categories && entry.categories[index] && entry.categories[index].totals && entry.categories[index].totals[field] !== undefined;
        });
        return { id: String(athlete.id || ''), name: athlete.displayName, position: cleanPosition(athlete.position), nativeFga: hasFga };
      })
    });
  }
}

async function dashboardFetch(url, options) {
  var target = String(url);
  if (!/^https?:\/\//.test(target)) {
    if (base) target = new URL(target, base).href;
    else {
      var filename = path.resolve(root, target.split('?')[0]);
      if (!filename.startsWith(root + path.sep)) throw new Error('Unexpected relative fetch: ' + target);
      if (!fs.existsSync(filename)) return { ok: false, status: 404, json: async function () { return {}; } };
      var local = JSON.parse(fs.readFileSync(filename, 'utf8'));
      observations.requests.push(target);
      observe(target, local);
      return { ok: true, status: 200, json: async function () { return local; } };
    }
  }
  observations.requests.push(target);
  var response = await request(target, options);
  return { ok: response.ok, status: response.status, json: async function () {
    var data = await response.json();
    observe(target, data);
    return data;
  } };
}

async function context() {
  var scripts = ['modules/player-bios.js', 'modules/config.js', 'modules/data.js'];
  var loaded = await Promise.all(scripts.map(async function (file) {
    var text = base ? await (await request(new URL(file, base).href)).text() : fs.readFileSync(path.join(root, file), 'utf8');
    return { file: file, text: text, sha256: crypto.createHash('sha256').update(text).digest('hex') };
  }));
  var ctx = vm.createContext({ console: console, fetch: dashboardFetch, AbortController: AbortController, URL: URL,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
    document: { getElementById: function () { return null; } } });
  ctx.window = ctx;
  loaded.forEach(function (script) { vm.runInContext(script.text, ctx, { filename: script.file }); });
  if (typeof ctx.classifyPlayerPosition !== 'function' || !ctx.POSITION_GROUPS || ctx.POSITION_GROUPS.join(',') !== 'Guards,Wings,Bigs') {
    throw new Error((base ? 'Published' : 'Local') + ' scripts do not contain the three-group position classifier');
  }
  ctx._currentDataSeason = season;
  return { ctx: ctx, scripts: loaded.map(function (script) { return { file: script.file, sha256: script.sha256 }; }) };
}

function audit(ctx, loaded, league, upstream) {
  var players = loaded.players;
  if (!players || !players.length) throw new Error(league + ': ' + (loaded.warning || 'No players loaded'));
  var original = players.map(function (row) { return Object.assign({}, row); });
  ctx.league = league;
  ctx._dataCommitLeaguePlayers(league, players);
  var partition = ctx._dataGetLeagueRows(league);
  var rows = [];
  var seen = {};
  var expected = {};
  var failures = [];
  original.forEach(function (row) { increment(expected, identity(row)); });
  var groupCounts = {};
  ctx.POSITION_GROUPS.forEach(function (group) {
    var pool = partition[group.toLowerCase()];
    if (!Array.isArray(pool)) throw new Error(league + ': missing ' + group + ' pool');
    groupCounts[group] = pool.length;
    pool.forEach(function (row) {
      rows.push(row);
      increment(seen, identity(row));
      if (row.Position !== group || row._league !== league) failures.push('Wrong group or league: ' + row.Player);
      if (!row.PositionReason || !['Listed', 'Inferred'].includes(row.PositionSource) || !row.PositionConfidence) failures.push('Missing explanation/provenance: ' + row.Player);
    });
  });
  Object.keys(expected).forEach(function (key) { if (seen[key] !== expected[key]) failures.push('Source row not in exactly one group: ' + key); });
  Object.keys(seen).forEach(function (key) { if (!expected[key]) failures.push('Unexpected grouped row: ' + key); });
  var inputByIdentity = new Map(original.map(function (row) { return [identity(row), row]; }));
  rows.forEach(function (row) {
    var input = inputByIdentity.get(identity(row));
    if (input && ['Pos', 'ListedPosition', 'ListedPositionSource'].some(function (key) { return String(input[key] || '') !== String(row[key] || ''); })) {
      failures.push('Listed source metadata changed during grouping: ' + row.Player);
    }
  });
  var native = league === 'MBB' ? upstream.map(function (row) {
    return { id: String(row.athleteSourceId || ''), name: row.name, team: row.team, position: cleanPosition(row.position), nativeFga: row.fieldGoals && number(row.fieldGoals, 'attempted') !== null };
  }) : observations.espn.flatMap(function (page) { return page.players; });
  var nativeById = new Map();
  var nativeByName = new Map();
  native.forEach(function (row) {
    var list = nativeById.get(row.id) || []; list.push(row); nativeById.set(row.id, list);
    var names = nativeByName.get(row.name) || []; names.push(row); nativeByName.set(row.name, names);
  });
  var disagreements = [];
  var unverified = [];
  var compared = 0;
  rows.forEach(function (row) {
    var candidates = nativeById.get(String(row.EspnId || '')) || [];
    if (!candidates.length) candidates = (nativeByName.get(row.Player) || []).filter(function (candidate) { return !candidate.team || candidate.team === row.Team; });
    if (candidates.length > 1) candidates = candidates.filter(function (candidate) { return candidate.name === row.Player && (!candidate.team || candidate.team === row.Team); });
    var nativeLabels = Array.from(new Set(candidates.map(function (candidate) { return candidate.position; })));
    // Repeated upstream rows with one identical listed label still verify that
    // label; conflicting labels remain unverified rather than guessed.
    if (nativeLabels.length !== 1) { unverified.push({ player: row.Player, team: row.Team, espnId: row.EspnId || null }); return; }
    compared++;
    if (String(row.ListedPosition || '') !== nativeLabels[0]) {
      disagreements.push({ player: row.Player, team: row.Team, native: nativeLabels[0], retained: row.ListedPosition || null });
    }
  });
  if (league === 'WBB') {
    var first = observations.espn.find(function (page) { return page.page === 1; });
    if (first && Number(first.count) !== original.length) failures.push('ESPN pagination total differs from loaded population');
  }
  var examples = { MBB: ['AJ Dybantsa', 'Cameron Boozer'], WBB: ['Madison Booker', 'Sarah Strong'] };
  var inferred = rows.filter(function (row) { return row.PositionSource === 'Inferred'; });
  var snapshot = observations.snapshots[league];
  var mapped = observations.mappedMbb || [];
  var exactlyOneGroup = rows.length === original.length && Object.keys(expected).every(function (key) { return seen[key] === expected[key]; })
    && Object.keys(seen).every(function (key) { return !!expected[key]; });
  return { league: league, season: season, total: rows.length, groups: groupCounts,
    duplicateSourceIdentityRows: original.length - Object.keys(expected).length,
    classifications: { listed: rows.length - inferred.length, inferred: inferred.length,
      provisional: inferred.filter(function (row) { return /provisional/i.test(row.PositionReason); }).length,
      lowConfidence: inferred.filter(function (row) { return row.PositionConfidence === 'Low'; }).length },
    meaningfulSampleGroups: distribution(rows.filter(function (row) { return number(row, 'G') >= 5 && number(row, 'MP') >= 10; }), 'Position'),
    listedLabels: distribution(rows, 'ListedPosition'),
    snapshots: snapshot ? { generatedAt: snapshot.generatedAt, positionGeneratedAt: snapshot.positionGeneratedAt, complete: snapshot.complete, matched: loaded.bios && loaded.bios.matched } : null,
    fieldGoalAttempts: { nativeUpstreamAvailable: native.filter(function (row) { return row.nativeFga; }).length,
      mappedWorkerAvailable: league === 'MBB' ? mapped.filter(function (row) { return fieldAttempts(row) !== null; }).length : undefined,
      loadedClassifierInputAvailable: rows.filter(function (row) { return fieldAttempts(row) !== null; }).length,
      inferredWithoutFga: inferred.filter(function (row) { return fieldAttempts(row) === null; }).length,
      perimeterVolumeDecisionsWithoutFga: inferred.filter(function (row) { return /perimeter volume/i.test(row.PositionReason) && fieldAttempts(row) === null; }).length,
      note: 'Missing field-goal attempts cannot establish a three-point attempt share. This audit uses the served inputs unchanged and reports any volume-only fallback.' },
    mappedWorkerListedPositionAvailable: league === 'MBB' ? mapped.filter(function (row) { return !!row.ListedPosition; }).length : undefined,
    validation: { passed: failures.length === 0 && disagreements.length === 0, eachSourceRowInExactlyOneGroup: exactlyOneGroup,
      nativePositionsCompared: compared, nativePositionDisagreements: disagreements.length,
      nativePositionsUnverified: unverified.length, unverifiedSample: unverified.slice(0, 8),
      disagreementSample: disagreements.slice(0, 8), failures: failures.slice(0, 15) },
    examples: rows.filter(function (row) { return examples[league].includes(row.Player); }).map(function (row) {
      return { player: row.Player, team: row.Team, listed: row.ListedPosition || row.Pos, group: row.Position,
        source: row.PositionSource, confidence: row.PositionConfidence, height: row.Height,
        games: row.G, minutes: row.MP, assists: row.APG, rebounds: row.RPG, blocks: row.BPG,
        threeAttemptsPerGame: row['3PA/G'], fieldAttemptsPerGame: fieldAttempts(row), reason: row.PositionReason };
    }), warnings: loaded.warning ? [loaded.warning] : [] };
}

async function main() {
  if (!/^20\d\d$/.test(String(season)) || leagues.some(function (league) { return !['MBB', 'WBB'].includes(league); })) throw new Error('Use --season YYYY and --league ALL|MBB|WBB');
  var runtime = await context();
  var ctx = runtime.ctx;
  var audits = [];
  for (var league of leagues) {
    process.stderr.write('Auditing ' + league + ' ' + season + ' with ' + (base ? 'published' : 'local') + ' dashboard scripts...\n');
    var work = await Promise.all([
      league === 'MBB' ? ctx._loadMbbSheetData(season) : ctx._loadWbbSheetData(season),
      league === 'MBB' ? request(ctx.Config.URLS.WORKER + '/api/proxy/stats/player/season?season=' + season).then(function (response) { return response.json(); }) : Promise.resolve([])
    ]);
    if (league === 'MBB' && (!Array.isArray(work[1]) || !work[1].length)) throw new Error('Invalid raw CBD comparison population');
    audits.push(audit(ctx, work[0], league, work[1]));
  }
  console.log(JSON.stringify({ auditedAt: new Date().toISOString(), mode: base ? 'published' : 'local', base: base || root,
    scripts: runtime.scripts, audits: audits, dashboardRequestCount: observations.requests.length }, null, 2));
  if (audits.some(function (item) { return !item.validation.passed; })) process.exitCode = 1;
}
if (require.main === module) main().catch(function (error) { console.error(error); process.exitCode = 1; });
