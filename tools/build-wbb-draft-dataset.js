#!/usr/bin/env node
/**
 * build-wbb-draft-dataset.js
 * ──────────────────────────
 * Builds a training dataset for the WBB (WNBA) draft probability model by:
 *   1. Fetching WNBA draft picks (2019–2025) from ESPN
 *   2. Fetching NCAA WBB player stats from ESPN byathlete API
 *   3. Matching drafted players by name to their college stats
 *   4. Building an undrafted pool (high-stat WBB players not drafted)
 *   5. Outputting data/wbb-draft-history.json
 *
 * Usage:  node tools/build-wbb-draft-dataset.js
 * No npm dependencies (uses Node 18+ fetch).
 */

const fs   = require('fs');
const path = require('path');

const DRAFT_YEARS  = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const PLAYER_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];

// ESPN WNBA draft API (public, no auth)
const ESPN_DRAFT_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/draft';
// ESPN WBB byathlete stats
const ESPN_WBB_STATS  = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/womens-college-basketball/statistics/byathlete';

function normName(n) {
  return (n || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const POWER = new Set(['ACC', 'Big 12', 'Big Ten', 'Big East', 'SEC', 'Pac-12']);
const MID   = new Set(['American', 'AAC', 'Atlantic 10', 'Mountain West', 'WCC', 'MAC', 'Sun Belt', 'CUSA', 'Missouri Valley']);

function confTier(conf) {
  if (!conf) return 'low';
  if (POWER.has(conf)) return 'power';
  if (MID.has(conf))   return 'mid';
  return 'low';
}

async function fetchDraftPicks(year) {
  try {
    const data = await fetchJson(`${ESPN_DRAFT_BASE}?year=${year}`);
    const picks = [];
    if (data.rounds) {
      for (const round of data.rounds) {
        for (const pick of (round.picks || [])) {
          const athlete = pick.athlete || {};
          picks.push({
            name: athlete.displayName || athlete.fullName || '',
            college: (athlete.college || {}).name || '',
            year: year,
            pick: pick.overall || pick.number || 0,
            round: round.number || 1,
          });
        }
      }
    }
    return picks;
  } catch (e) {
    console.error(`  Draft ${year}: ${e.message}`);
    return [];
  }
}

async function fetchWbbStats(year, page) {
  const params = new URLSearchParams({
    region: 'us', lang: 'en', contentorigin: 'espn',
    isQualified: 'false',
    sort: 'offensive.avgPoints:desc',
    limit: '200',
    page: String(page),
    season: String(year),
    seasontype: '2'
  });
  try {
    const data = await fetchJson(`${ESPN_WBB_STATS}?${params}`);
    return data;
  } catch (e) {
    console.error(`  WBB stats ${year} p${page}: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('Building WBB draft training dataset\n');

  // Step 1: Fetch draft picks
  console.log('Step 1: Fetching WNBA draft picks');
  const allPicks = {};
  for (const year of DRAFT_YEARS) {
    allPicks[year] = await fetchDraftPicks(year);
    console.log(`  ${year}: ${allPicks[year].length} picks`);
    await sleep(500);
  }

  const flatPicks = Object.values(allPicks).flat();
  const draftedNames = new Set(flatPicks.map(p => normName(p.name)));
  console.log(`\nTotal drafted: ${flatPicks.length}\n`);

  // Step 2: Fetch WBB player stats
  console.log('Step 2: Fetching NCAA WBB player stats');
  const statsByYear = {};
  for (const year of PLAYER_YEARS) {
    const players = [];
    for (let page = 1; page <= 5; page++) {
      const data = await fetchWbbStats(year, page);
      if (!data || !data.athletes || !data.athletes.length) break;
      for (const ath of data.athletes) {
        const cats = {};
        for (const cat of (ath.categories || [])) {
          for (const stat of (cat.statistics || [])) {
            cats[stat.abbreviation || stat.name] = stat.displayValue || stat.value;
          }
        }
        players.push({
          name: (ath.athlete || {}).displayName || '',
          team: (ath.team || {}).displayName || '',
          conference: (ath.team || {}).conference || '',
          year: year,
          stats: cats
        });
      }
      await sleep(300);
    }
    statsByYear[year] = players;
    console.log(`  ${year}: ${players.length} players`);
  }

  // Step 3: Match drafted players to college stats
  console.log('\nStep 3: Matching draft picks to stats');
  const dataset = [];
  let matched = 0, unmatched = 0;

  for (const pick of flatPicks) {
    const pName = normName(pick.name);
    const draftYear = pick.year;
    const statsYear = draftYear; // their final college season
    const pool = statsByYear[statsYear] || [];
    const match = pool.find(p => normName(p.name) === pName)
      || pool.find(p => normName(p.name).includes(pName) || pName.includes(normName(p.name)));

    if (match) {
      matched++;
      dataset.push({
        Player: pick.name,
        Team: match.team,
        Conference: match.conference,
        DraftYear: draftYear,
        Pick: pick.pick,
        Round: pick.round,
        drafted: true,
        PPG: parseFloat(match.stats.PTS) || 0,
        'eFG%': parseFloat(match.stats['eFG%']) || 0,
        RPG: parseFloat(match.stats.REB) || 0,
        APG: parseFloat(match.stats.AST) || 0,
        SPG: parseFloat(match.stats.STL) || 0,
        BPG: parseFloat(match.stats.BLK) || 0,
        '3P%': parseFloat(match.stats['3P%']) || 0,
        FT: parseFloat(match.stats['FT%']) || 0,
        MPG: parseFloat(match.stats.MIN) || 0,
        G: parseInt(match.stats.GP) || 0,
        confTier: confTier(match.conference)
      });
    } else {
      unmatched++;
    }
  }
  console.log(`  Matched: ${matched}, Unmatched: ${unmatched}`);

  // Step 4: Build undrafted pool (high-stat players not drafted)
  console.log('\nStep 4: Building undrafted pool');
  let undraftedCount = 0;
  for (const year of PLAYER_YEARS) {
    for (const p of (statsByYear[year] || [])) {
      if (draftedNames.has(normName(p.name))) continue;
      const ppg = parseFloat(p.stats.PTS) || 0;
      const mpg = parseFloat(p.stats.MIN) || 0;
      const gp  = parseInt(p.stats.GP) || 0;
      if (ppg < 8 || mpg < 18 || gp < 10) continue;
      undraftedCount++;
      dataset.push({
        Player: p.name,
        Team: p.team,
        Conference: p.conference,
        DraftYear: year,
        Pick: 0,
        Round: 0,
        drafted: false,
        PPG: ppg,
        'eFG%': parseFloat(p.stats['eFG%']) || 0,
        RPG: parseFloat(p.stats.REB) || 0,
        APG: parseFloat(p.stats.AST) || 0,
        SPG: parseFloat(p.stats.STL) || 0,
        BPG: parseFloat(p.stats.BLK) || 0,
        '3P%': parseFloat(p.stats['3P%']) || 0,
        FT: parseFloat(p.stats['FT%']) || 0,
        MPG: mpg,
        G: gp,
        confTier: confTier(p.conference)
      });
    }
  }
  console.log(`  Undrafted pool: ${undraftedCount} players`);
  console.log(`  Total dataset: ${dataset.length}\n`);

  // Step 5: Write output
  const outPath = path.join(__dirname, '..', 'data', 'wbb-draft-history.json');
  fs.writeFileSync(outPath, JSON.stringify(dataset, null, 2));
  console.log(`Written to ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
