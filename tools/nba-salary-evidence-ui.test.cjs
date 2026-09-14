'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const groups = ['Guards', 'Wings', 'Bigs'];
const keys = ['Height', 'MP', 'PPG', 'RPG', 'APG', 'SPG', 'BPG', 'TOPG', 'eFG%', '3P%', 'FT%', '3PA/G'];
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
function harness(evidence = fixture()) {
  const elements = new Map(), blobs = [], timers = [], actions = { enabledChanges: 0, downloads: 0 };
  function make(id, attrs = {}) { return { id, innerHTML: '', hidden: false, open: false, value: '', attrs, listeners: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, addEventListener(type, handler) { this.listeners[type] = handler; }, querySelector() { return make('summary'); }, focus() { actions.focused = id; }, scrollIntoView() { actions.scrolled = id; }, click() { actions.downloads++; }, remove() {} }; }
  ['nbaModelContent', 'nbaModelControls', 'nbaModelStatus', 'nbaModelGroup', 'nbaValuationPanel', 'nbaEvidenceDetails', 'mNbaValuationPanel', 'mNbaValuationContent', 'mNbaCoachShortcut', 'nbaValuationBasis', 'nbaValuationBasisHint', 'nbaMinutesHint', 'mpMode', 'mpPct', 'nbaEvidenceComparisonStat'].forEach(id => elements.set(id, make(id)));
  const buttons = ['evidence', 'prediction'].map(view => make(view, { 'data-nba-view': view }));
  const document = { getElementById: id => elements.get(id), querySelectorAll: selector => selector === '[data-nba-view]' ? buttons : [], createElement: tag => make(tag), body: { appendChild() {} } };
  const model = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nba-valuation-model.json'), 'utf8'));
  const c = { document, Blob, URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:test'; }, revokeObjectURL() {} }, setTimeout(fn) { timers.push(fn); }, pos: 'Guards', NBA_SALARY_EVIDENCE: evidence, allowed: true, closeProfile() { actions.profileClosed = true; }, showDashboardPage(target, nav, opts) { actions.navigation = { target, nav, opts }; }, demoCanViewSensitiveModeling() { return c.allowed; }, NbaValuation: { getModel: () => model, isEnabled: () => true, setEnabled() { actions.enabledChanges++; } } };
  vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(__dirname, '../modules/nba-valuation-ui.js'), 'utf8'), c);
  c.NbaValuationUI.render();
  function click(selector, value) { const target = { closest: query => query === selector ? { getAttribute: () => value } : null }; elements.get('nbaValuationPanel').listeners.click({ target }); }
  function group(name) { elements.get('nbaModelGroup').value = name; elements.get('nbaModelGroup').listeners.change(); }
  return { c, elements, buttons, blobs, actions, click, group, html: () => elements.get('nbaModelContent').innerHTML };
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
test('CSV includes all 36 estimates, 12 overall tests and 36 pairwise tests with exact values and raw units', async () => {
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
});
test('invalid inference is distinguished from valid uncertain evidence', () => {
  const e = fixture(); Object.assign(e.groups.Guards.estimates[0], { status: 'unavailable', pRaw: null, pHolm: null, reason: 'Singular fit' });
  const h = harness(e); assert.match(h.html(), /Not estimable/); assert.match(h.html(), /Singular fit/);
});
test('actual aggregate checks retain complete-case exclusions and omit individual salary/influence rows', async () => {
  const e = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nba-salary-evidence.json'), 'utf8'));
  const h = harness(e);
  groups.forEach(group => {
    h.group(group); assert.equal((h.html().match(/data-evidence-mark=/g) || []).length, 12);
    assert.match(h.html(), /No individual association in this position group met the 0.05 threshold/);
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
  assert.equal(csv.split('\r\n').length, 85 + sensitivities);
  assert.match(csv, /Descriptive sensitivity:/);
});
test('coach summary leads with the finding and PDF; all statistical detail is initially collapsed', () => {
  const e = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nba-salary-evidence.json'), 'utf8'));
  const h = harness(e), top = h.html().split('<details id="nbaEvidenceDetails"')[0];
  assert.match(top, /no single stat met our evidence threshold/);
  assert.match(top, /466 players/); assert.match(top, /197 guards · 91 wings · 178 bigs/);
  assert.match(top, /Download 1-page brief \(PDF\)/); assert.match(top, /output\/pdf\/nba-salary-coach-brief\.pdf\?v=coach-brief-20260914/);
  assert.match(top, /\+8\.1%/); assert.match(top, /-4\.6% to \+22\.4%/);
  assert.doesNotMatch(top, /<table|<svg|Holm|p-value|data-nba-evidence-download|data-nba-checks-download/);
  assert.equal(h.elements.get('nbaEvidenceDetails').open, false);
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
