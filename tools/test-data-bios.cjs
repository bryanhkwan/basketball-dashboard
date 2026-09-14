// Run with: node --test tools/test-data-bios.cjs (no dependencies).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const PlayerBios = require('../modules/player-bios.js');

function dashboard(){
  const timers = [];
  const elements = new Map();
  const ctx = vm.createContext({ console, PlayerBios, AbortController, Blob,
    localStorage: { getItem(){ return null; } },
    document: { getElementById(id){ return elements.get(id) || null; } },
    setTimeout(fn, delay){ timers.push({ fn, delay }); return timers.length; }, clearTimeout(){},
    requestAnimationFrame(fn){ fn(); },
  });
  ctx.window = ctx;
  for(const file of ['config', 'data', 'players']){
    vm.runInContext(fs.readFileSync(path.join(root, 'modules', file + '.js'), 'utf8'), ctx, { filename: file + '.js' });
  }
  ctx.elements = elements;
  ctx.timers = timers;
  return ctx;
}

test('bio fields and identity numbers never enter scoring weights', () => {
  const ctx = dashboard();
  const fields = ['Height', 'Weight', 'BioSeason', 'BioUpdatedAt', 'TeamId', 'EspnId', 'CbdId'];
  fields.forEach(key => assert.equal(ctx.isLikelyNumericColumn(key), false, key));
  ctx.baseStatsAll = ['PPG', ...fields];
  ctx.currentWeights.Guards = [{ stat: 'Height', w: 100, min: 60, max: 90 }];
  assert.equal(ctx.scoreRow({ Height: 75 }), 0, 'Saved metadata rules must not affect scores');
  const row = { PPG: 12, Height: 72, Weight: 180, BioSeason: 2026, TeamId: 41, EspnId: 100 };
  ctx.ensureWeightsCoverStats('Guards', [row]);
  assert.deepEqual(Array.from(ctx.currentWeights.Guards, item => item.stat), ['PPG']);
});

test('metadata reaches both position pools and rosters without scoring or class loss', () => {
  const ctx = dashboard();
  const source = [{ Player: 'Taylor Smith', Team: 'Example', Height: 73, Weight: 190, Class: '', HeightSource: 'CBD', WeightSource: 'CBD', BioSeason: 2026 }];
  function row(){ return { Player: 'Taylor Smith', Team: 'Example', Class: 'Jr', Score: 8.2, ActualValuation_calc: 40000 }; }
  ctx._mbbActivePlayersRef = source;
  ctx.wb = { SheetNames: [], Sheets: {} };
  const guard = row(), big = row(), roster = row(), opponent = row();
  ctx.rows = [guard]; ctx.computed = [guard];
  ctx.tbAllComputed = { MBB_Guards: [guard], MBB_Bigs: [big], WBB_Guards: [row()] };
  ctx.tbRoster = [roster]; ctx.oppRoster = [opponent];
  ctx._leagueRowsCache.MBB = { season: '2026', guards: [guard], bigs: [big] };
  ctx.renderPlayers = () => {};
  ctx.reloadActiveSheet = () => assert.fail('Measurement update must not recompute scores');
  assert.equal(ctx._dataSyncPlayerBios(source, 'MBB', 2026), true);
  [guard, big, roster, opponent].forEach(p => {
    assert.equal(p.Height, 73); assert.equal(p.Weight, 190); assert.equal(p.Class, 'Jr');
    assert.equal(p.Score, 8.2); assert.equal(p.ActualValuation_calc, 40000);
    assert.ok(p._searchStr.includes("6'1\""));
  });
  assert.equal(ctx.tbAllComputed.WBB_Guards[0].Height, undefined);
  const sheet = Object.values(ctx.wb.Sheets)[0];
  assert.ok(sheet.__aoa[0].includes('Weight'));
  assert.equal(ctx._leagueRowsCache.MBB.wsRef, sheet);
});

function learnedDashboard(){
  const ctx = dashboard();
  ctx.NBA_VALUATION_MODEL = { version: 'bio-refresh-fixture', groups: {} };
  ['Guards', 'Wings', 'Bigs'].forEach(group => {
    ctx.NBA_VALUATION_MODEL.groups[group] = { features: [
      { key: 'Height', coefficient: 1 }, { key: 'MP', coefficient: 0.2 }, { key: 'PPG', coefficient: 0.1 },
    ] };
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/nba-valuation.js'), 'utf8'), ctx);
  // Keep the real valuation engine, computeAll, workbook parsing, sibling
  // scheduling and reference refresh. Unrelated scouting/rendering is stubbed.
  ctx.ensureWeightsCoverStats = () => {};
  ctx.renderWeights = () => {};
  ctx.renderPlayers = () => {};
  ctx.clearWarn = () => {};
  ctx.scoreRow = row => row.PPG;
  ctx.fitScoreForRow = () => 50;
  ctx.buildStatDistributions = () => { ctx.statDist = {}; };
  ctx.projectionGetManualBoost = () => 0;
  ctx.projectionGetManualScoutNote = () => '';
  ctx.projectionBuildInputs = () => ({});
  ctx.applyResolvedTranslationRiskToRow = row => row;
  ctx._applyInferredClassToPool = () => {};
  ctx._scheduleTeamListRefresh = () => {};
  ctx._scheduleValueLabDataChange = () => {};
  ctx.getRecommendedBidSettings = () => ({ avgPay: 35000, minPay: 5000, maxPay: 100000, starValue: 70000, starPct: 0.95, mpMode: 'on', mpPct: 0.95 });
  ctx.activeSheetEl = {};
  ctx.kpiPlayers = {}; ctx.kpiAvgPerf = {}; ctx.kpiStarPerf = {};
  ctx.confMultToggleEl = { checked: false };
  ctx.tbRoster = []; ctx.oppRoster = [];
  ctx.flushTimers = () => {
    let count = 0;
    while(ctx.timers.length){
      assert.ok(++count < 30, 'Bio refresh must not recursively schedule work');
      ctx.timers.shift().fn();
    }
  };
  return ctx;
}

test('late heights update NBA bids, all position pools and saved roster/profile references', () => {
  const ctx = learnedDashboard();
  const groups = ['Guards', 'Wings', 'Bigs'];
  const sources = [];
  groups.forEach((group, index) => {
    const pos = ['G', 'SF', 'C'][index], baseHeight = [70, 76, 82][index];
    [null, baseHeight, baseHeight + 2].forEach((height, offset) => sources.push({
      Player: group + offset, Team: 'Example', Pos: pos, ListedPosition: pos,
      Class: 'Jr', Height: height, MP: [20, 22, 18][offset], PPG: [10, 12, 8][offset], G: 30,
    }));
  });
  ctx._mbbActivePlayersRef = sources;
  ctx._dataCommitLeaguePlayers('MBB', sources);
  ctx.reloadActiveSheet();
  ctx.flushTimers();
  const before = groups.map(group => ctx.tbAllComputed['MBB_' + group].find(row => row.Player === group + '0'));
  const oldBids = before.map(row => row.ActualValuation_calc);
  before.forEach(row => assert.ok(row.NBAMissing_calc.includes('Height')));
  ctx.tbRoster = before.map(row => ({ ...row }));
  ctx.oppRoster = before.map(row => ({ ...row }));
  ctx.leagueRosters.MBB.tb = before.map(row => ({ ...row }));
  ctx._currentProfilePlayer = { ...before[0] };
  ctx.openProfile = row => { ctx._currentProfilePlayer = row; };
  const oldCache = ctx._leagueRowsCache.MBB;
  const otherLeaguePool = [{ Player: 'Other league', Height: 64 }];
  ctx.tbAllComputed.WBB_Guards = otherLeaguePool;
  groups.forEach((group, index) => { sources[index * 3].Height = [76, 82, 88][index]; });

  assert.equal(ctx._dataSyncPlayerBios(sources, 'MBB', 2026), true);
  assert.notEqual(ctx._leagueRowsCache.MBB, oldCache, 'The full league normalization context must be rebuilt');
  ctx.flushTimers();
  groups.forEach((group, index) => {
    const fresh = ctx.tbAllComputed['MBB_' + group].find(row => row.Player === group + '0');
    assert.equal(fresh.Position, group, 'Listed position remains unchanged');
    assert.equal(fresh.Class, 'Jr');
    assert.equal(fresh.Height, [76, 82, 88][index]);
    assert.equal(fresh.NBAMissing_calc.includes('Height'), false);
    assert.ok(fresh.NBAContributions_calc.find(item => item.key === 'Height').contribution > 0);
    assert.ok(fresh.ActualValuation_calc > oldBids[index], 'The newly observed tall height must affect the learned bid');
    [ctx.tbRoster[index], ctx.oppRoster[index], ctx.leagueRosters.MBB.tb[index]].forEach(row => {
      assert.equal(row.ActualValuation_calc, fresh.ActualValuation_calc);
      assert.equal(row.NBAScore_calc, fresh.NBAScore_calc);
    });
  });
  assert.equal(ctx._currentProfilePlayer.ActualValuation_calc, ctx.tbRoster[0].ActualValuation_calc);
  assert.equal(ctx.tbAllComputed.WBB_Guards, otherLeaguePool);

  const stableCache = ctx._leagueRowsCache.MBB;
  sources[0].Height = "6'4\"";
  ctx._dataSyncPlayerBios(sources, 'MBB', 2026);
  assert.equal(ctx._leagueRowsCache.MBB, stableCache, 'Equivalent normalized units must not cause another recalculation');
  assert.equal(ctx.timers.length, 0, 'Repeated identical bios must not create a refresh loop');
});

test('disabled NBA mode preserves height-only metadata updates without recalculation', () => {
  const ctx = dashboard();
  ctx.NbaValuation = { isEnabled: () => false };
  const source = [{ Player: 'Listed guard', Team: 'Example', Pos: 'G', Class: 'Jr', Height: 76 }];
  const row = { ...source[0], Position: 'Guards', Height: null, ActualValuation_calc: 40000 };
  ctx._mbbActivePlayersRef = source;
  ctx.wb = { Sheets: {} };
  ctx.rows = [row]; ctx.computed = [row];
  ctx.tbAllComputed = { MBB_Guards: [row] };
  ctx.renderPlayers = () => {};
  ctx.reloadActiveSheet = () => assert.fail('Manual scoring does not depend on height');
  assert.equal(ctx._dataSyncPlayerBios(source, 'MBB', 2026), true);
  assert.equal(row.Height, 76);
  assert.equal(row.ActualValuation_calc, 40000);
});

test('stale season and stale player-array completions cannot modify current data', () => {
  const ctx = dashboard();
  const stale = [{ Player: 'Old', Team: 'Team', Height: 72 }];
  ctx.wb = { Sheets: {} };
  ctx._mbbActivePlayersRef = stale;
  assert.equal(ctx._dataSyncPlayerBios(stale, 'MBB', 2025), false);
  ctx._mbbActivePlayersRef = [];
  assert.equal(ctx._dataSyncPlayerBios(stale, 'MBB', 2026), false);
  assert.equal(Object.keys(ctx.wb.Sheets).length, 0);
});

test('a delayed old-season loader cannot reset the current league state', async () => {
  const ctx = dashboard();
  const status = ctx._leagueDataStatus.WBB;
  ctx.fetch = () => assert.fail('No stale request should start');
  assert.equal((await ctx.ensureLeagueDataLoaded('WBB', 2025)).loaded, false);
  assert.equal(ctx._leagueDataStatus.WBB, status);
});

test('background work waits for its stagger and cancels stale season jobs', () => {
  const ctx = dashboard();
  let ran = 0;
  ctx.requestIdleCallback = fn => fn();
  ctx.scheduleNonCriticalWork(() => ran++, 5000);
  assert.equal(ran, 0);
  assert.equal(ctx.timers[0].delay, 5000);
  ctx.timers[0].fn();
  assert.equal(ran, 1);
  ctx.scheduleNonCriticalWork(() => ran++, 2000);
  ctx._currentDataSeason = 2025;
  ctx.timers[1].fn();
  assert.equal(ran, 1);
});

test('measurement sorting handles mixed units and keeps absent values last both ways', () => {
  const ctx = dashboard();
  const players = [{ Height: null }, { Height: "6'2\"" }, { Height: 68 }, { Height: '' }];
  ctx.sort = { key: 'Height', dir: 'asc' };
  assert.deepEqual(Array.from(ctx.sortData(players), p => p.Height), [68, "6'2\"", null, '']);
  ctx.sort.dir = 'desc';
  assert.deepEqual(Array.from(ctx.sortData(players), p => p.Height), ["6'2\"", 68, null, '']);
});

test('a late ratings response warms its cache without overwriting the active league', async () => {
  const ctx = dashboard();
  let finish;
  ctx.fetch = () => new Promise(resolve => { finish = resolve; });
  const loading = ctx.loadTeamRatings(2026, 'MBB');
  ctx.league = 'WBB';
  finish({ ok: true, json: async () => ({ teams: [{ team: 'Example', season: 2026 }] }) });
  await loading;
  assert.equal(ctx.allRatingsData.length, 0);
  assert.equal(ctx._ratingsCache['MBB:2026'].length, 1);
});

test('WBB bulk stats consumes all pages and retains zero-stat participants', async () => {
  const ctx = dashboard();
  const urls = [];
  ctx.fetch = async url => {
    urls.push(url);
    const page = Number(new URL(url).searchParams.get('page'));
    return { ok: true, json: async () => ({ pagination: { pages: 3 }, categories: [], athletes: [{ athlete: { id: page, displayName: 'Player ' + page, teamId: 1 } }] }) };
  };
  const players = await ctx._wbbLoadAllPlayerPages(2026);
  assert.equal(players.length, 3);
  assert.equal(players[0].G, 0);
  assert.equal(urls.length, 3);
  urls.forEach(url => assert.equal(new URL(url).searchParams.get('limit'), '1000'));
});

test('WBB missing pages retry then reject instead of reporting partial population', async () => {
  const ctx = dashboard();
  let failedPageCalls = 0;
  ctx.fetch = async url => {
    if(new URL(url).searchParams.get('page') === '2'){
      failedPageCalls++;
      return { ok: false, status: 503 };
    }
    return { ok: true, json: async () => ({ pagination: { pages: 2 }, categories: [], athletes: [] }) };
  };
  await assert.rejects(ctx._wbbLoadAllPlayerPages(2026), /page 2: HTTP 503/);
  assert.equal(failedPageCalls, 2);
});

test('CSV carries numeric measurements and their provenance', async () => {
  const ctx = dashboard();
  let blob;
  ctx.URL = { createObjectURL(value){ blob = value; return 'blob:test'; }, revokeObjectURL(){} };
  ctx.document.createElement = () => ({ click(){} });
  ctx.computed = [{ Player: 'Example', Height: 72, Weight: 185, HeightSource: 'CBD', WeightSource: 'CBD', BioSeason: 2026 }];
  ctx.exportCSV();
  const csv = await blob.text();
  assert.match(csv, /"Height","Weight","HeightSource","WeightSource","BioSeason","BioUpdatedAt"/);
  assert.match(csv, /"72","185","CBD","CBD","2026"/);
});
