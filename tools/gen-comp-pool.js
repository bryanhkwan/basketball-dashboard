// Generate DRAFT_COMP_POOL entries from draft-history.json
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('data/draft-history.json', 'utf8'));
const drafted = d.players.filter(p => p.Drafted).sort((a, b) => a.DraftPick - b.DraftPick);

const selected = [];
const byYear = {};
drafted.forEach(p => {
  if (!byYear[p.DraftYear]) byYear[p.DraftYear] = [];
  byYear[p.DraftYear].push(p);
});

for (const [yr, ps] of Object.entries(byYear)) {
  const lotto = ps.filter(p => p.DraftPick <= 14);
  const notables = ps.filter(p => p.DraftPick > 14).slice(0, 6);
  selected.push(...lotto, ...notables);
  console.log(`${yr}: ${lotto.length} lottery + ${notables.length} later = ${lotto.length + notables.length}`);
}
console.log('Total:', selected.length);

const lines = selected.map(p => {
  const n = p.Player.replace(/'/g, "\\'");
  const t = p.Team.replace(/'/g, "\\'");
  return `  {n:'${n}',t:'${t}',y:${p.DraftYear},pk:${p.DraftPick},s:[${p.PPG},${p.BPM},${p['WS/40']},${p['eFG%']},${p['USG%']},${p.APG},${p.SPG},${p.BPG},${p.RPG}]}`;
});

fs.writeFileSync('data/comp-pool-lines.txt', lines.join(',\n'));
console.log('Wrote data/comp-pool-lines.txt');
