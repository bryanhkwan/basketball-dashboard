#!/usr/bin/env node
'use strict';
// Usage: node tools/refresh-player-bios.js --league ALL --seasons 2022,2023,2024,2025,2026
// Append season-listed positions without refetching measurements: add --positions-only
// On machines with a managed certificate/proxy: node --use-system-ca --use-env-proxy tools/refresh-player-bios.js ...
// No API key is required; uses the dashboard's public CBD proxy and ESPN JSON.
var fs = require('node:fs');
var path = require('node:path');
var PlayerBios = require('../modules/player-bios.js');
var args = process.argv.slice(2);
function arg(name, fallback) { var index = args.indexOf(name); return index < 0 ? fallback : args[index + 1]; }
var league = arg('--league', 'ALL').toUpperCase();
var leagues = league === 'ALL' ? ['MBB', 'WBB'] : [league];
var seasons = arg('--seasons', '2026').split(',').map(Number);
var output = path.resolve(__dirname, '../data');
var concurrency = Math.max(1, Math.min(16, Number(arg('--concurrency', '8')) || 8));
var positionsOnly = args.includes('--positions-only');

async function main() {
  for (var season of seasons) {
    for (var item of leagues) {
      process.stdout.write('Refreshing ' + item + ' ' + season + '\n');
      var filename = path.join(output, 'player-bios-' + item.toLowerCase() + '-' + season + '.json');
      var options = {
        concurrency: concurrency, maxIndividualRequests: 20000, timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0 (NCAA dashboard public roster refresh)' },
        onProgress: function (progress) { if (progress.stage !== 'ESPN missing heights' || progress.completed % 250 === 0 || progress.completed === progress.total) process.stdout.write(JSON.stringify(progress) + '\n'); }
      };
      var snapshot = positionsOnly
        ? await PlayerBios.refreshPositions(JSON.parse(fs.readFileSync(filename, 'utf8')), options)
        : await PlayerBios.refresh(item, season, options);
      if (!snapshot.records.length) throw new Error(item + ' ' + season + ': no records; existing snapshot preserved');
      if (!snapshot.complete && fs.existsSync(filename)) {
        var previous = JSON.parse(fs.readFileSync(filename, 'utf8'));
        if (previous.complete) {
          process.stderr.write(item + ' ' + season + ': incomplete refresh; preserved existing complete snapshot. ' + JSON.stringify(snapshot.errors) + '\n');
          process.exitCode = 1;
          continue;
        }
      }
      fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(filename + '.tmp', JSON.stringify(snapshot) + '\n');
      fs.renameSync(filename + '.tmp', filename);
      process.stdout.write(JSON.stringify({ file: path.relative(process.cwd(), filename), coverage: snapshot.coverage, complete: snapshot.complete, errors: snapshot.errors }) + '\n');
    }
  }
}
main().catch(function (error) { console.error(error); process.exitCode = 1; });
