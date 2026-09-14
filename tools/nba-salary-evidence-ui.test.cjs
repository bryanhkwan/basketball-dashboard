'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const groups = ['Guards', 'Wings', 'Bigs'];
const keys = ['Height', 'MP', 'PPG', 'RPG', 'APG', 'SPG', 'BPG', 'TOPG', 'eFG%', '3P%', 'FT%', '3PA/G'];
function csvRecords(text) {
  text = text.replace(/^\ufeff/, '');
  const rows = [], row = []; let cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\r' || char === '\n') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row.splice(0)); cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function matrixCell(html, key, group) {
  const row = [...html.matchAll(/<tr\b[^>]*data-nba-coefficient-key="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)].find(match => match[1] === key);
  assert.ok(row, 'Matrix row ' + key);
  const cell = [...row[2].matchAll(/<td\b[^>]*data-nba-coefficient-group="([^"]+)"[^>]*>([\s\S]*?)<\/td>/g)].find(match => match[1] === group);
  assert.ok(cell, key + ' / ' + group);
  return cell[2];
}
function matrixKeys(evidence, model) {
  return [...new Set(groups.flatMap(group => [...(model.groups[group].features || []).map(item => item.key), ...(evidence.groups[group].estimates || []).map(item => item.key)]))];
}
function fixture() {
  const evidence = { id: 'test-evidence', season: '2022-23', generatedAt: 'test-date', protocol: { alpha: .05, primaryFamilySize: 36 }, groups: {}, comparisons: { omnibus: [], pairwise: [] } };
  groups.forEach((group, groupIndex) => {
    const estimates = keys.map((key, index) => ({ key, label: key, unit: key.includes('%') ? 'fraction' : 'per game', increment: key.includes('%') ? .05 : 1, incrementLabel: key.includes('%') ? '+5 percentage points' : '+1 unit', n: 100 + groupIndex, nObserved: 90 + groupIndex, coefficientRaw: .01 * (index + 1), seRaw: .02, ciLowRaw: -.04, ciHighRaw: .06, logEffect: .01 * (index + 1), logEffectCiLow: -.04, logEffectCiHigh: .18, associationPct: Math.expm1(.01 * (index + 1)) * 100, associationPctCiLow: Math.expm1(-.04) * 100, associationPctCiHigh: Math.expm1(.18) * 100, pRaw: .0001 + index * .01, pHolm: .11 + index * .02, status: 'uncertain' }));
    evidence.groups[group] = { nInput: 101 + groupIndex, n: 100 + groupIndex, nExcluded: 1, estimates };
  });
  keys.forEach(key => {
    evidence.comparisons.omnibus.push({ key, label: key, pRaw: .0499, pHolm: .0501, status: 'suggestive' });
    [['Guards', 'Wings'], ['Guards', 'Bigs'], ['Wings', 'Bigs']].forEach(([groupA, groupB]) => evidence.comparisons.pairwise.push({ ...evidence.groups.Guards.estimates.find(e => e.key === key), groupA, groupB, differenceRaw: .01 }));
  });
  return evidence;
}
function harness(evidence = fixture(), modelOverride) {
  const elements = new Map(), blobs = [], timers = [], actions = { enabledChanges: 0, downloads: 0 };
  function make(id, attrs = {}) { return { id, innerHTML: '', hidden: false, open: false, value: '', attrs, listeners: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, addEventListener(type, handler) { this.listeners[type] = handler; }, querySelector() { return make('summary'); }, focus() { actions.focused = id; }, scrollIntoView() { actions.scrolled = id; }, click() { actions.downloads++; }, remove() {} }; }
  ['nbaModelContent', 'nbaModelControls', 'nbaModelStatus', 'nbaModelGroup', 'nbaValuationPanel', 'nbaEvidenceDetails', 'mNbaValuationPanel', 'mNbaValuationContent', 'mNbaCoachShortcut', 'nbaValuationBasis', 'nbaValuationBasisHint', 'nbaMinutesHint', 'mpMode', 'mpPct', 'nbaEvidenceComparisonStat'].forEach(id => elements.set(id, make(id)));
  const buttons = ['evidence', 'prediction'].map(view => make(view, { 'data-nba-view': view }));
  const document = { getElementById: id => elements.get(id), querySelectorAll: selector => selector === '[data-nba-view]' ? buttons : [], createElement: tag => make(tag), body: { appendChild() {} } };
  const model = modelOverride || JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nba-valuation-model.json'), 'utf8'));
  const c = { document, Blob, URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:test'; }, revokeObjectURL() {} }, setTimeout(fn) { timers.push(fn); }, pos: 'Guards', NBA_SALARY_EVIDENCE: evidence, allowed: true, closeProfile() { actions.profileClosed = true; }, showDashboardPage(target, nav, opts) { actions.navigation = { target, nav, opts }; }, demoCanViewSensitiveModeling() { return c.allowed; }, NbaValuation: { getModel: () => model, isEnabled: () => true, setEnabled() { actions.enabledChanges++; } } };
  vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(__dirname, '../modules/nba-valuation-ui.js'), 'utf8'), c);
  c.NbaValuationUI.render();
  function click(selector, value) { const target = { closest: query => query === selector ? { getAttribute: () => value } : null }; elements.get('nbaValuationPanel').listeners.click({ target }); }
  function group(name) { elements.get('nbaModelGroup').value = name; elements.get('nbaModelGroup').listeners.change(); }
  return { c, elements, buttons, blobs, actions, click, group, model, html: () => elements.get('nbaModelContent').innerHTML };
}
test('default evidence includes every natural-unit estimate, robust intervals, coefficients and separate corrected decisions', () => {
  const h = harness();
  groups.forEach(group => {
    h.group(group);
    assert.equal((h.html().match(/data-evidence-mark=/g) || []).length, 12);
    assert.match(h.html(), /No individual association in this position group met the 0.05 threshold/);
    assert.match(h.html(), /β = \+0\.0100 log salary/);
    assert.match(h.html(), /Holm p · 36 tests/);
    assert.match(h.html(), /pointwise 95%/i);
    assert.match(h.html(), /1\.000e-4/);
    assert.doesNotMatch(h.html(), /undefined|NaN|\[object Object\]/);
  });
  assert.equal(h.actions.enabledChanges, 0);
});
test('raw p or a pointwise interval excluding zero does not override an unsupported Holm decision', () => {
  const e = fixture(); e.groups.Guards.estimates[0].logEffectCiLow = .001; e.groups.Guards.estimates[0].associationPctCiLow = .1;
  const h = harness(e);
  assert.match(h.html(), /data-evidence-mark="Height" data-evidence-status="uncertain"/);
  assert.match(h.html(), /4\.990e-2|0\.04990/);
  assert.match(h.html(), /0\.05010/);
  assert.match(h.html(), /Unrounded p-value: 0\.0501/);
  assert.doesNotMatch(h.html(), />0\.000</);
});
test('switching evidence and ridge views never changes the valuation basis', () => {
  const h = harness(); h.click('[data-nba-view]', 'prediction');
  assert.match(h.html(), /Prediction weights · ridge regression/);
  assert.match(h.html(), /Held-out NBA salary validation/);
  assert.doesNotMatch(h.html(), /Salary evidence estimates/);
  h.click('[data-nba-view]', 'evidence');
  assert.match(h.html(), /Salary evidence estimates/);
  assert.equal(h.actions.enabledChanges, 0);
});
test('direct comparisons use raw stat increments and separate omnibus and pairwise families', () => {
  const h = harness();
  h.elements.get('nbaValuationPanel').listeners.change({ target: { id: 'nbaEvidenceComparisonStat', value: '3P%' } });
  assert.match(h.html(), /option value="3P%" selected/);
  assert.match(h.html(), /Holm p · 12 tests/);
  assert.match(h.html(), /Holm p · 36 pairs/);
  assert.match(h.html(), /not a difference in salary levels/);
  assert.equal((h.html().match(/<th scope="row">(?:Guards|Wings) versus /g) || []).length, 3);
});
test('CSV includes every synthetic primary and comparison estimate with exact values and raw units', async () => {
  const h = harness(); h.click('[data-nba-evidence-download]');
  assert.equal(h.blobs.length, 1); assert.equal(h.actions.downloads, 1);
  const csv = await h.blobs[0].text();
  assert.equal(csv.split('\r\n').length, 85);
  assert.match(csv, /Coefficient per raw unit/); assert.match(csv, /HC3 SE per raw unit/);
  assert.match(csv, /"0.0001"/); assert.match(csv, /"fraction"/);
  assert.doesNotMatch(csv, /Player|salary records/);
});
test('logout clears evidence, hides controls and prevents downloads through stale controls', () => {
  const h = harness(); h.c.allowed = false; h.c.NbaValuationUI.render();
  assert.doesNotMatch(h.html(), /<table|<svg|test-evidence/);
  assert.match(h.html(), /Staff login/); assert.equal(h.elements.get('nbaModelControls').hidden, true);
  h.click('[data-nba-evidence-download]'); assert.equal(h.blobs.length, 0);
  h.click('[data-nba-coefficient-download]'); assert.equal(h.blobs.length, 0);
});
test('invalid inference is distinguished from valid uncertain evidence', () => {
  const e = fixture(); Object.assign(e.groups.Guards.estimates[0], { status: 'unavailable', pRaw: null, pHolm: null, reason: 'Singular fit' });
  const h = harness(e); assert.match(h.html(), /Not estimable/); assert.match(h.html(), /Singular fit/);
});
test('actual aggregate checks retain complete-case exclusions and omit individual salary/influence rows', async () => {
  const e = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nba-salary-evidence.json'), 'utf8'));
  const h = harness(e);
  groups.forEach(group => {
    h.group(group); assert.equal((h.html().match(/data-evidence-mark=/g) || []).length, e.groups[group].estimates.length);
    if (e.groups[group].estimates.every(item => item.status !== 'supported')) assert.match(h.html(), /No individual association in this position group met the 0.05 threshold/);
    assert.match(h.html(), new RegExp('NBA players · ' + group));
  });
  h.click('[data-nba-checks-download]');
  const text = await h.blobs[0].text(), report = JSON.parse(text);
  assert.doesNotMatch(text, /"salary":|"topInfluence":/);
  groups.forEach(group => {
    const actual = report.groups[group].sensitivities.find(s => s.id === 'fullComplete');
    const expected = e.groups[group].sensitivities.find(s => s.id === 'fullComplete');
    assert.equal(actual.excluded.length, expected.nInput - expected.n);
    assert.equal(report.groups[group].sensitivities.length, 7);
  });
  h.click('[data-nba-evidence-download]');
  const csv = await h.blobs[1].text();
  const sensitivities = groups.reduce((n, group) => n + e.groups[group].sensitivities.filter(s => s.available).reduce((total, s) => total + s.estimates.length, 0), 0);
  const primary = groups.reduce((n, group) => n + e.groups[group].estimates.length, 0);
  assert.equal(csv.split('\r\n').length, 1 + primary + e.comparisons.omnibus.length + e.comparisons.pairwise.length + sensitivities);
  assert.match(csv, /Descriptive sensitivity:/);
});
test('coach summary leads with one cross-position coefficient table and downloads; advanced details start collapsed', () => {
  const e = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nba-salary-evidence.json'), 'utf8'));
  const h = harness(e), top = h.html().split('<details id="nbaEvidenceDetails"')[0];
  assert.match(top, /Coefficients by position/);
  assert.match(top, /Download 1-page table \(PDF\)/); assert.match(top, /output\/pdf\/nba-salary-coach-brief\.pdf\?v=coefficients-table-20260914/);
  assert.match(top, /Download table CSV/);
  assert.match(top, /aria-label="Cross-position coefficient table"/);
  assert.equal((top.match(/<table\b/g) || []).length, 1);
  const retained = matrixKeys(e, h.model);
  assert.equal((top.match(/data-nba-coefficient-key=/g) || []).length, retained.length);
  assert.equal((top.match(/data-nba-coefficient-group=/g) || []).length, retained.length * groups.length);
  assert.doesNotMatch(top, /<svg|data-nba-evidence-download|data-nba-checks-download/);
  assert.match(top, /OLS/); assert.match(top, /ridge/i); assert.match(top, /p-values/);
  assert.equal(h.elements.get('nbaEvidenceDetails').open, false);
});

test('all matrix cells retain the actual ridge weight and separate OLS coefficient, interval and p-values', () => {
  const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nba-salary-evidence.json'), 'utf8'));
  const model = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nba-valuation-model.json'), 'utf8'));
  const h = harness(evidence), top = h.html().split('<details id="nbaEvidenceDetails"')[0];
  for (const group of groups) for (const key of matrixKeys(evidence, model)) {
    const estimate = evidence.groups[group].estimates.find(item => item.key === key);
    const ridge = model.groups[group].features.find(feature => feature.key === key);
    const cell = matrixCell(top, key, group);
    const expected = { ...(ridge ? {ridge:ridge.coefficient} : {}), ...(estimate ? {ols:estimate.logEffect,ciLow:estimate.logEffectCiLow,ciHigh:estimate.logEffectCiHigh,pRaw:estimate.pRaw,pHolm:estimate.pHolm} : {}) };
    if (!ridge || !estimate) assert.match(cell, /Excluded/);
    assert.deepEqual([...cell.matchAll(/data-nba-value="([^"]+)"/g)].map(match => match[1]).sort(), Object.keys(expected).sort(), group + ' ' + key + ' selected fields only');
    for (const [field, value] of Object.entries(expected)) {
      const match = [...cell.matchAll(/<([a-z]+)\b([^>]*data-nba-value="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g)].find(item => item[3] === field);
      assert.ok(match, group + ' ' + key + ' ' + field);
      assert.ok((match[2] + match[4]).includes('Unrounded value: ' + value) || (field.startsWith('p') && (match[2] + match[4]).includes('Unrounded p-value: ' + value)), group + ' ' + key + ' ' + field + ' unrounded value');
      assert.doesNotMatch(match[4], /undefined|NaN/);
    }
  }
  h.group('Bigs');
  assert.equal(h.html().split('<details id="nbaEvidenceDetails"')[0], top, 'Detailed group selector does not filter the all-position matrix');
  assert.equal(h.actions.enabledChanges, 0);
});

test('table CSV has one wide row per input with source-exact ridge and OLS values, excluding sensitivities', async () => {
  const evidence = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nba-salary-evidence.json'), 'utf8'));
  const model = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nba-valuation-model.json'), 'utf8'));
  const h = harness(evidence); h.click('[data-nba-coefficient-download]');
  assert.equal(h.blobs.length, 1); assert.equal(h.actions.downloads, 1);
  const csv = await h.blobs[0].text(), records = csvRecords(csv);
  const suffixes = ['ridge weight per 1 SD', 'OLS beta per stated increment', 'OLS 95% CI low', 'OLS 95% CI high', 'OLS raw p', 'OLS Holm p'];
  assert.deepEqual(records[0], ['Input', 'OLS increment', ...groups.flatMap(group => suffixes.map(suffix => group + ' ' + suffix))]);
  const retained = matrixKeys(evidence, model), orderedKeys = [...h.html().matchAll(/data-nba-coefficient-key="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual([...orderedKeys].sort(), [...retained].sort());
  assert.equal(records.length, retained.length + 1); assert.ok(records.every(row => row.length === 2 + groups.length * 6));
  orderedKeys.forEach((key, index) => {
    const source = groups.flatMap(group => evidence.groups[group].estimates).find(item => item.key === key) || groups.flatMap(group => model.groups[group].features).find(item => item.key === key);
    const row = records[index + 1]; assert.equal(row[0], source.label || source.key); assert.equal(row[1], /^[=+\-@]/.test(source.incrementLabel) ? "'" + source.incrementLabel : source.incrementLabel || '');
    groups.forEach((group, groupIndex) => {
      const estimate = evidence.groups[group].estimates.find(item => item.key === source.key), ridge = model.groups[group].features.find(item => item.key === source.key);
      const expected = [ridge && ridge.coefficient, estimate && estimate.logEffect, estimate && estimate.logEffectCiLow, estimate && estimate.logEffectCiHigh, estimate && estimate.pRaw, estimate && estimate.pHolm].map(value => value === undefined || value === null ? '' : String(value));
      assert.deepEqual(row.slice(2 + groupIndex * 6, 8 + groupIndex * 6), expected);
    });
  });
  assert.doesNotMatch(csv, /Descriptive sensitivity|Pairwise|Player|salary records/);
  assert.equal(h.actions.enabledChanges, 0);
});

test('ridge and OLS exclusions are independent, remain explicit and are never shown as zero coefficients', async () => {
  const evidence = fixture(), model = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nba-valuation-model.json'), 'utf8'));
  groups.forEach(group => { model.groups[group].features = keys.map(key => ({key,label:key,coefficient:.25})); });
  evidence.groups.Guards.estimates = evidence.groups.Guards.estimates.filter(item => item.key !== 'Height');
  model.groups.Guards.features = model.groups.Guards.features.filter(item => item.key !== 'Height');
  model.groups.Wings.features = model.groups.Wings.features.filter(item => item.key !== 'Height');
  evidence.groups.Bigs.estimates = evidence.groups.Bigs.estimates.filter(item => item.key !== 'Height');
  const h = harness(evidence, model), excluded = matrixCell(h.html(), 'Height', 'Guards');
  assert.match(excluded, /Excluded/); assert.doesNotMatch(excluded, /data-nba-value=/);
  const wings = matrixCell(h.html(), 'Height', 'Wings'), bigs = matrixCell(h.html(), 'Height', 'Bigs');
  assert.match(wings, /Excluded/); assert.match(wings, /data-nba-value="ols"/); assert.doesNotMatch(wings, /data-nba-value="ridge"/);
  assert.match(bigs, /Excluded/); assert.match(bigs, /data-nba-value="ridge"/); assert.doesNotMatch(bigs, /data-nba-value="(?:ols|ciLow|ciHigh|pRaw|pHolm)"/);
  h.click('[data-nba-coefficient-download]');
  const records = csvRecords(await h.blobs[0].text()), row = records.find(item => item[0] === 'Height');
  assert.deepEqual(row.slice(2, 8), ['', '', '', '', '', '']); assert.equal(row[8], ''); assert.equal(Number(row[9]), .01);
  assert.equal(Number(row[14]), .25); assert.deepEqual(row.slice(15, 20), ['', '', '', '', '']);
});
test('reduced-model explanations do not describe excluded minutes as an active prediction input', () => {
  const h = harness(); h.click('[data-nba-view]', 'prediction');
  groups.forEach(group => {
    h.group(group);
    if (h.model.groups[group].features.some(feature => feature.key === 'MP')) return;
    assert.doesNotMatch(h.html(), /Minutes are (?:already )?an input|minutes are not applied a second time/);
    h.c.NbaValuationUI.renderProfile({NBAModel_calc:true,NBAPosition_calc:group,_league:'MBB',NBAContributions_calc:[]});
    assert.doesNotMatch(h.elements.get('mNbaValuationContent').innerHTML, /Minutes are (?:already )?an input|minutes are not applied a second time/);
  });
});

test('profile shortcut opens the requested group on Players, collapses details, focuses the model panel and preserves price basis', () => {
  const h = harness();
  h.elements.get('nbaEvidenceDetails').open = true;
  h.c.NbaValuationUI.openCoachSummary('Wings');
  assert.equal(h.actions.profileClosed, true); assert.equal(h.actions.navigation.target, 'pagePlayers'); assert.equal(h.actions.navigation.opts.forcePage, true);
  assert.equal(h.elements.get('nbaModelGroup').value, 'Wings'); assert.equal(h.elements.get('nbaValuationPanel').open, true);
  assert.equal(h.elements.get('nbaEvidenceDetails').open, false); assert.equal(h.actions.focused, 'summary'); assert.equal(h.actions.scrolled, 'nbaValuationPanel');
  assert.equal(h.actions.enabledChanges, 0);
  h.c._currentProfilePlayer = { NBAModel_calc: true, NBAPosition_calc: 'Wings', _league: 'WBB', NBAContributions_calc: [] };
  h.c.NbaValuationUI.renderProfile(h.c._currentProfilePlayer);
  assert.equal(h.elements.get('mNbaCoachShortcut').hidden, false); assert.match(h.elements.get('mNbaCoachShortcut').innerHTML, /View coach summary/);
  h.c.allowed = false; h.c.NbaValuationUI.render();
  assert.equal(h.elements.get('mNbaCoachShortcut').hidden, true); assert.equal(h.elements.get('mNbaCoachShortcut').innerHTML, '');
  assert.doesNotMatch(h.html(), /nba-salary-coach-brief/);
});
