'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');

function chatContext(evidence, allowed) {
  const source = fs.readFileSync(path.join(root, 'modules/chat.js'), 'utf8');
  const start = source.indexOf('  function getSalaryEvidenceContext(){');
  const end = source.indexOf('  function getDashboardContext(){', start);
  assert.ok(start >= 0 && end > start, 'Salary evidence context function exists');
  const context = vm.createContext({ NBA_SALARY_EVIDENCE: evidence,
    demoCanViewSensitiveModeling: () => allowed });
  vm.runInContext(source.slice(start, end), context);
  return JSON.parse(JSON.stringify(vm.runInContext('getSalaryEvidenceContext()', context)));
}

test('salary evidence details stay out of guest AI context', () => {
  const result = chatContext({ id: 'private', groups: { Guards: { n: 197,
    features: [{ key: 'Height', effectPct: 12, pValue: 0.001 }] } } }, false);
  assert.equal(result.available, false);
  assert.equal(result.groups, undefined);
  assert.equal(result.id, undefined);
});

test('staff context preserves exact p-values and distinguishes adjusted evidence', () => {
  const feature = { key: 'Height', incrementLabel: '+1 inch', coefficient: 0.1133, unit: 'inches', effectPct: 12,
    effectCiLowPct: 1, effectCiHighPct: 24, pValue: 0.004,
    pAdjustedHolm: 0.144, observedN: 197 };
  const result = chatContext({ id: 'test-ols', groups: { Guards: { n: 197, features: [feature] } } }, true);
  assert.equal(result.available, true);
  assert.deepEqual(result.groups.Guards.associations[0], {
    stat: 'Height', increment: '+1 inch', logSalaryCoefficientPerOriginalUnit: 0.1133,
    originalUnit: 'inches', salaryAssociationPct: 12,
    pointwise95IntervalPct: [1, 24], pValue: 0.004,
    holmAdjustedP: 0.144, observedInputs: 197
  });
  assert.match(result.uncertainty, /pointwise/);
  assert.match(result.interpretation, /Exploratory OLS/);
  assert.match(result.positionDifferences, /different adjustment sets/);
  assert.match(result.positionDifferences, /common-input comparison fits/);
  assert.equal(chatContext(null, true).available, false);
});

test('staff AI context preserves each position mask instead of the display union', () => {
  const result = chatContext({ id: 'independent-positions',
    selection: { scope: 'independent-position', threshold: 5,
      candidateKeys: ['Height', 'RPG', 'BPG'], retainedKeys: ['Height', 'RPG', 'BPG'], excludedKeys: [] },
    policy: { familySize: 36, testedCount: 5 },
    groups: {
      Guards: { n: 197, selection: { excludedKeys: ['BPG'] }, features: [{ key: 'Height' }, { key: 'RPG' }] },
      Wings: { n: 91, selection: { excludedKeys: ['RPG', 'BPG'] }, features: [{ key: 'Height' }] },
      Bigs: { n: 178, selection: { excludedKeys: ['RPG'] }, features: [{ key: 'Height' }, { key: 'BPG' }] }
    }
  }, true);
  assert.equal(result.selection.scope, 'independent-position');
  assert.equal(result.selection.retainedInputs, undefined, 'The display union must not be described as a shared model');
  assert.deepEqual(result.groups.Guards.retainedInputs, ['Height', 'RPG']);
  assert.deepEqual(result.groups.Wings.retainedInputs, ['Height']);
  assert.deepEqual(result.groups.Bigs.retainedInputs, ['Height', 'BPG']);
  assert.deepEqual(result.groups.Wings.excludedInputs, ['RPG', 'BPG']);
  assert.deepEqual(result.groups.Bigs.excludedInputs, ['RPG']);
  assert.deepEqual(result.groups.Wings.associations.map(row => row.stat), ['Height']);
  assert.equal(result.selection.plannedFamilySize, 36);
  assert.equal(result.selection.testedCount, 5);
});

test('published evidence JSON and browser global agree', () => {
  const evidence = JSON.parse(fs.readFileSync(path.join(root, 'data/nba-salary-evidence.json'), 'utf8'));
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, 'data/nba-salary-evidence.js'), 'utf8'), context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.NBA_SALARY_EVIDENCE)), evidence);
  assert.equal(evidence.policy.alpha, 0.05);
  assert.equal(evidence.policy.familySize, 36);
  assert.equal(evidence.policy.adjustment, 'Holm');
});

test('source fingerprints distinguish archived inputs from portable text hashes', () => {
  const evidence = JSON.parse(fs.readFileSync(path.join(root, 'data/nba-salary-evidence.json'), 'utf8'));
  assert.ok(evidence.sources.length >= 4);
  for (const source of evidence.sources) {
    assert.equal(source.file.includes('\\'), false, 'Source paths work across operating systems');
    assert.ok(['raw-bytes', 'utf8-lf'].includes(source.sha256Basis));
    let payload = fs.readFileSync(path.join(root, source.file));
    if (source.sha256Basis === 'utf8-lf') payload = Buffer.from(payload.toString('utf8').replace(/\r\n/g, '\n'));
    assert.equal(crypto.createHash('sha256').update(payload).digest('hex'), source.sha256);
  }
});

test('retained estimates keep the planned Holm family and natural-unit effects reconcile', () => {
  const evidence = JSON.parse(fs.readFileSync(path.join(root, 'data/nba-salary-evidence.json'), 'utf8'));
  assert.equal(evidence.selection.scope, 'independent-position');
  const rows = [];
  for (const group of ['Guards', 'Wings', 'Bigs']) {
    const population = evidence.groups[group];
    const selection = evidence.selection.perGroup[group];
    const retained = population.features.map(row => row.key);
    assert.ok(population.features.length > 0 && population.features.length <= 12);
    assert.equal(new Set(retained).size, population.features.length);
    assert.deepEqual(retained, selection.retainedKeys, group + ' uses its own selected adjustment set');
    assert.deepEqual(retained, population.selection.retainedKeys);
    assert.ok(retained.includes('Height'), 'The specified height question remains protected');
    assert.deepEqual(population.excludedFeatures.map(row => row.key), selection.excludedKeys);
    assert.deepEqual(selection.candidateKeys.filter(key => !retained.includes(key)), selection.excludedKeys);
    for (const value of Object.values(selection.afterVifs)) {
      assert.ok(Number.isFinite(value) && value <= selection.threshold + 1e-9, group + ': every retained design term meets the VIF rule');
    }
    for (const excluded of population.excludedFeatures) {
      assert.equal(excluded.status, 'excluded');
      assert.equal(excluded.coefficient, undefined, 'Exclusion is not a fitted zero effect');
      assert.equal(excluded.pValue, undefined, 'An untested slot has no displayed p-value');
      assert.equal(excluded.pAdjustedHolm, undefined);
    }
    assert.ok(population.n > 0);
    for (const row of population.features) {
      assert.ok(Number.isFinite(row.coefficient), group + ' ' + row.key + ' coefficient');
      assert.ok(row.ciLow <= row.coefficient && row.coefficient <= row.ciHigh);
      assert.ok(row.pValue >= 0 && row.pValue <= 1);
      assert.ok(row.pAdjustedHolm >= row.pValue && row.pAdjustedHolm <= 1);
      assert.ok(row.observedN > 0 && row.observedN <= population.n);
      assert.ok(row.increment > 0);
      const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)));
      close(row.effectPct, Math.expm1(row.coefficient * row.increment) * 100);
      close(row.effectCiLowPct, Math.expm1(row.ciLow * row.increment) * 100);
      close(row.effectCiHighPct, Math.expm1(row.ciHigh * row.increment) * 100);
      rows.push(row);
    }
  }
  assert.equal(evidence.policy.testedCount, rows.length);
  assert.deepEqual(evidence.selection.retainedKeys,
    evidence.selection.candidateKeys.filter(key => rows.some(row => row.key === key)),
    'Top-level retained keys are a display union, not a shared model mask');
  rows.sort((a, b) => a.pValue - b.pValue);
  let cumulative = 0;
  rows.forEach((row, index) => {
    cumulative = Math.min(1, Math.max(cumulative, row.pValue * (evidence.policy.familySize - index)));
    assert.ok(Math.abs(row.pAdjustedHolm - cumulative) < 1e-12, row.key + ': global Holm adjustment');
  });
});

test('position comparisons use separate common-specification fits and independent-group HC3 covariance', () => {
  const evidence = JSON.parse(fs.readFileSync(path.join(root, 'data/nba-salary-evidence.json'), 'utf8'));
  const comparisons = evidence.comparisons;
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)));
  assert.equal(comparisons.specification, 'separate-common-covariate-model');
  assert.equal(comparisons.primaryCoefficientsComparable, false);
  const commonKeys = comparisons.selection.retainedKeys;
  const row = (group, key) => comparisons.groups[group].estimates.find(item => item.key === key);
  for (const group of ['Guards', 'Wings', 'Bigs']) {
    assert.deepEqual(comparisons.groups[group].retainedKeys, commonKeys);
    assert.deepEqual(comparisons.groups[group].estimates.map(item => item.key), commonKeys);
    assert.equal(comparisons.groups[group].n, evidence.groups[group].n, 'Comparison eligibility stays aligned with primary eligibility');
    for (const estimate of comparisons.groups[group].estimates) {
      assert.equal(estimate.pValue, undefined, 'Common-fit slopes support contrasts, not a second primary significance family');
      assert.equal(estimate.pAdjustedHolm, undefined);
      assert.equal(estimate.status, undefined);
    }
  }
  assert.equal(comparisons.n, Object.values(comparisons.groups).reduce((sum, group) => sum + group.n, 0));
  assert.equal(comparisons.pairwise.length, commonKeys.length * 3);
  assert.equal(comparisons.omnibus.length, commonKeys.length);
  assert.equal(comparisons.pairwiseFamilySize, 36);
  assert.equal(comparisons.omnibusFamilySize, 12);
  for (const pair of comparisons.pairwise) {
    const a = row(pair.groupA, pair.key), b = row(pair.groupB, pair.key);
    close(pair.differenceRaw, a.coefficient - b.coefficient);
    close(pair.seRaw, Math.hypot(a.seRaw, b.seRaw));
    close(pair.logEffect, pair.differenceRaw * pair.increment);
    close(pair.associationPct, Math.expm1(pair.logEffect) * 100);
    assert.equal(pair.dfResidual, comparisons.dfResidual);
  }
  for (const overall of comparisons.omnibus) {
    const a = row('Guards', overall.key), b = row('Wings', overall.key), c = row('Bigs', overall.key);
    const d1 = a.coefficient - b.coefficient, d2 = a.coefficient - c.coefficient;
    const offDiagonal = a.seRaw ** 2;
    const v1 = offDiagonal + b.seRaw ** 2, v2 = offDiagonal + c.seRaw ** 2;
    const f = (d1 * d1 * v2 - 2 * d1 * d2 * offDiagonal + d2 * d2 * v1) /
      (v1 * v2 - offDiagonal * offDiagonal) / 2;
    close(overall.statisticF, f);
    assert.equal(overall.dfNum, 2);
    assert.equal(overall.dfDen, comparisons.dfResidual);
  }
  for (const family of [comparisons.omnibus, comparisons.pairwise]) {
    const plannedFamilySize = family === comparisons.omnibus ? 12 : 36;
    let cumulative = 0;
    [...family].sort((a, b) => a.pRaw - b.pRaw).forEach((item, index) => {
      cumulative = Math.min(1, Math.max(cumulative, item.pRaw * (plannedFamilySize - index)));
      close(item.pHolm, cumulative);
    });
  }
});
