#!/usr/bin/env node
/**
 * build-draft-dataset.js
 * ──────────────────────
 * Builds a large training dataset for the draft probability model by:
 *   1. Fetching NBA draft picks (2019–2025) from the worker's /api/cbdata/draft
 *   2. Fetching all player stats (2018–2025) from /api/cbdata/players
 *   3. Matching drafted players by name to their college stats
 *   4. Inferring Class from multi-season appearances
 *   5. Building a large undrafted pool (high-stat players not drafted)
 *   6. Outputting data/draft-history.json
 *
 * Usage:  node tools/build-draft-dataset.js
 * No npm dependencies.
 */

const fs   = require('fs');
const path = require('path');

const WORKER = 'https://hidden-salad-773b.bryanhkwan.workers.dev';
const DRAFT_YEARS   = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const PLAYER_YEARS  = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]; // 2018 for class inference

// ── Helpers ──────────────────────────────────────────────────────────────────

function normName(n) {
  return (n || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Conference tier (same logic as draft.js)
const POWER = new Set(['ACC','Big 12','Big Ten','Big East','SEC','Pac-12','Big XII']);

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📊 Building draft training dataset from CBD API\n');

  // ── Step 1: Fetch draft picks ──────────────────────────────────────────────
  console.log('Step 1: Fetching draft picks for', DRAFT_YEARS.join(', '));
  const allPicks = {};
  for (const year of DRAFT_YEARS) {
    try {
      const data = await fetchJson(`${WORKER}/api/cbdata/draft?year=${year}`);
      allPicks[year] = data.picks || [];
      console.log(`   ${year}: ${allPicks[year].length} picks`);
    } catch (e) {
      console.log(`   ${year}: ERROR - ${e.message}`);
      allPicks[year] = [];
    }
    await sleep(500);
  }

  // Build normalized drafted-name lookup: name → { year, overall, round, pick, position }
  const draftedByName = {};
  for (const [year, picks] of Object.entries(allPicks)) {
    for (const pk of picks) {
      const nm = normName(pk.collegeName);
      if (nm) {
        draftedByName[nm] = {
          year:     parseInt(year),
          overall:  pk.overall,
          round:    pk.round,
          pick:     pk.pick || pk.overall,
          position: pk.position,
        };
      }
    }
  }
  console.log(`   Total draft entries: ${Object.keys(draftedByName).length}\n`);

  // ── Step 2: Fetch all player stats ─────────────────────────────────────────
  console.log('Step 2: Fetching player stats for', PLAYER_YEARS.join(', '));
  const allPlayersBySeason = {};
  for (const year of PLAYER_YEARS) {
    try {
      const data = await fetchJson(`${WORKER}/api/cbdata/players?season=${year}`);
      allPlayersBySeason[year] = data.players || [];
      console.log(`   ${year}: ${allPlayersBySeason[year].length} players`);
    } catch (e) {
      console.log(`   ${year}: ERROR - ${e.message}`);
      allPlayersBySeason[year] = [];
    }
    await sleep(800);
  }

  // ── Step 3: Build multi-season appearance index for class inference ────────
  console.log('\nStep 3: Building class inference from multi-season appearances');
  // Key: normalized name → sorted list of seasons they appeared in
  const playerSeasons = {};
  for (const [year, players] of Object.entries(allPlayersBySeason)) {
    const yr = parseInt(year);
    for (const p of players) {
      const nm = normName(p.Player);
      if (!nm) continue;
      if (!playerSeasons[nm]) playerSeasons[nm] = new Set();
      playerSeasons[nm].add(yr);
    }
  }

  function inferClass(name, season) {
    const nm = normName(name);
    const seasons = playerSeasons[nm];
    if (!seasons || seasons.size === 0) return '';
    const sorted = Array.from(seasons).sort((a, b) => a - b);
    const firstSeason = sorted[0];
    const yearsInCollege = season - firstSeason;
    // Infer based on how many years they've been at the college level
    if (yearsInCollege === 0) return 'Fr';
    if (yearsInCollege === 1) return 'So';
    if (yearsInCollege === 2) return 'Jr';
    return 'Sr';  // 3+ years
  }

  // ── Step 4: Match drafted players to their stats ───────────────────────────
  console.log('\nStep 4: Matching drafted players to college stats');
  const dataset = [];
  let matched = 0, unmatched = 0;

  for (const [name, draft] of Object.entries(draftedByName)) {
    const season = draft.year;
    const players = allPlayersBySeason[season] || [];
    
    // Try exact match first, then fuzzy
    let match = players.find(p => normName(p.Player) === name);
    if (!match) {
      // Fuzzy: try contains match
      match = players.find(p => {
        const pn = normName(p.Player);
        return pn.includes(name) || name.includes(pn);
      });
    }
    if (!match) {
      // Try previous season (some players declared mid-season or data is for prior year)
      const prevPlayers = allPlayersBySeason[season - 1] || [];
      match = prevPlayers.find(p => normName(p.Player) === name);
      if (!match) {
        match = prevPlayers.find(p => {
          const pn = normName(p.Player);
          return pn.length > 5 && (pn.includes(name) || name.includes(pn));
        });
      }
    }

    if (match) {
      matched++;
      const cls = inferClass(match.Player, season);
      dataset.push({
        Player:     match.Player,
        Team:       match.Team,
        Conference: match.Conference,
        Class:      cls,
        PPG:        match.PPG   || 0,
        RPG:        match.RPG   || 0,
        APG:        match.APG   || 0,
        SPG:        match.SPG   || 0,
        BPG:        match.BPG   || 0,
        'eFG%':     match['eFG%'] || 0,
        'FT%':      match['FT%'] || 0,
        '3P%':      match['3P%'] || 0,
        'USG%':     match['USG%'] || 0,
        BPM:        match.BPM   || 0,
        'WS/40':    match['WS/40'] || 0,
        MPG:        match.MP    || 0,
        DraftYear:  draft.year,
        DraftRound: draft.round,
        DraftPick:  draft.overall,
        Drafted:    true,
        _source:    'api'
      });
    } else {
      unmatched++;
    }
  }
  console.log(`   Matched:   ${matched} drafted players`);
  console.log(`   Unmatched: ${unmatched} (international/G-League players without college stats)`);

  // ── Step 5: Build undrafted pool ───────────────────────────────────────────
  console.log('\nStep 5: Building undrafted pool');

  // For each draft year, take players with good stats who weren't drafted
  const draftedNames = new Set(Object.keys(draftedByName));
  let totalUndrafted = 0;

  for (const year of DRAFT_YEARS) {
    const players = allPlayersBySeason[year] || [];
    const undraftedCandidates = [];

    for (const p of players) {
      const nm = normName(p.Player);
      if (draftedNames.has(nm)) continue;

      // Filter: meaningful production
      // PPG ≥ 5, MPG ≥ 20, Games ≥ 15
      const ppg = p.PPG || 0;
      const mpg = p.MP  || 0;
      const g   = p.G   || 0;
      if (ppg < 5 || mpg < 20 || g < 15) continue;

      const cls = inferClass(p.Player, year);
      undraftedCandidates.push({
        Player:     p.Player,
        Team:       p.Team,
        Conference: p.Conference,
        Class:      cls,
        PPG:        ppg,
        RPG:        p.RPG   || 0,
        APG:        p.APG   || 0,
        SPG:        p.SPG   || 0,
        BPG:        p.BPG   || 0,
        'eFG%':     p['eFG%'] || 0,
        'FT%':      p['FT%'] || 0,
        '3P%':      p['3P%'] || 0,
        'USG%':     p['USG%'] || 0,
        BPM:        p.BPM   || 0,
        'WS/40':    p['WS/40'] || 0,
        MPG:        mpg,
        DraftYear:  year,
        DraftRound: null,
        DraftPick:  null,
        Drafted:    false,
        _source:    'api'
      });
    }

    // Sort by total minutes (MPG × Games) to select most-involved players
    // WITHOUT biasing toward high scorers
    undraftedCandidates.sort((a, b) => (b.MPG * (b.G || 20)) - (a.MPG * (a.G || 20)));
    // Take ~5x the number of drafted players for that year (capped at 250)
    const draftedCount = (allPicks[year] || []).length;
    const takeN = Math.min(undraftedCandidates.length, Math.max(draftedCount * 5, 200));
    const selected = undraftedCandidates.slice(0, takeN);
    
    totalUndrafted += selected.length;
    dataset.push(...selected);
    console.log(`   ${year}: ${selected.length} undrafted (of ${undraftedCandidates.length} candidates)`);
  }

  // ── Step 6: Dedup and clean ────────────────────────────────────────────────
  console.log('\nStep 6: Dedup and quality check');
  
  // Dedup by Player+DraftYear
  const seen = new Set();
  const deduped = [];
  for (const p of dataset) {
    const key = normName(p.Player) + ':' + p.DraftYear;
    if (seen.has(key)) continue;
    seen.add(key);
    
    // Quality gate: must have at least PPG and BPM
    if (p.PPG === 0 && p.BPM === 0) continue;
    
    deduped.push(p);
  }
  
  // Remove _source field for clean output
  deduped.forEach(p => delete p._source);

  const draftedCount  = deduped.filter(p => p.Drafted).length;
  const undraftedCount = deduped.filter(p => !p.Drafted).length;
  
  console.log(`   Total:     ${deduped.length} players`);
  console.log(`   Drafted:   ${draftedCount}`);
  console.log(`   Undrafted: ${undraftedCount}`);
  console.log(`   Ratio:     1:${(undraftedCount/draftedCount).toFixed(1)}`);

  // ── Step 7: Class distribution ─────────────────────────────────────────────
  const classDist = {};
  deduped.forEach(p => {
    const c = p.Class || 'Unknown';
    classDist[c] = (classDist[c] || 0) + 1;
  });
  console.log('\n   Class distribution:', classDist);

  // Verify class inference with known players
  console.log('\n   Class spot checks:');
  const checks = ['Zion Williamson', 'Cade Cunningham', 'Zach Edey', 'Desmond Bane'];
  for (const name of checks) {
    const p = deduped.find(d => d.Player && d.Player.includes(name.split(' ').pop()));
    if (p) console.log(`      ${p.Player}: ${p.Class} (${p.DraftYear})`);
  }

  // ── Step 8: Output ─────────────────────────────────────────────────────────
  const output = {
    metadata: {
      description: 'NCAA → NBA draft outcomes for training the draft probability model',
      lastUpdated: new Date().toISOString().slice(0, 10),
      buildScript: 'tools/build-draft-dataset.js',
      source: 'College Basketball Data API via worker endpoint',
      stats: {
        total: deduped.length,
        drafted: draftedCount,
        undrafted: undraftedCount,
        seasons: DRAFT_YEARS.join('-'),
        classInference: 'Multi-season appearance tracking (first season in data = Fr, +1/yr)',
      },
      fields: {
        Player: 'Name', Team: 'College team', Conference: 'Conference',
        Class: 'Fr/So/Jr/Sr (inferred from multi-season appearances)',
        PPG: 'Points per game', RPG: 'Rebounds per game', APG: 'Assists per game',
        SPG: 'Steals per game', BPG: 'Blocks per game',
        'eFG%': 'Effective FG% (decimal 0-1)', 'FT%': 'Free throw % (decimal)',
        '3P%': 'Three-point % (decimal)', 'USG%': 'Usage rate (whole number)',
        BPM: 'Box Plus/Minus (PORPAG)', 'WS/40': 'Win Shares per 40 min',
        MPG: 'Minutes per game',
        DraftYear: 'Year drafted or eligible', DraftRound: '1 or 2 (null if undrafted)',
        DraftPick: 'Overall pick number (null if undrafted)', Drafted: 'true/false'
      },
    },
    players: deduped
  };

  const outPath = path.join(__dirname, '..', 'data', 'draft-history.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\n✅ Wrote ${deduped.length} players to data/draft-history.json`);
  console.log('\nNext: run  node tools/train-draft-model-v2.js  to retrain the model.');
}

main().catch(e => { console.error('💥 Error:', e.message); process.exit(1); });
