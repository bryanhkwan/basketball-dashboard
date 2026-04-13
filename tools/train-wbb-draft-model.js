#!/usr/bin/env node
/**
 * train-wbb-draft-model.js
 * ────────────────────────
 * Trains a WBB draft probability model using elastic-net logistic regression.
 * Same approach as train-draft-model-v2.js but for WBB-available stats.
 *
 * Features: PPG, eFG%, RPG, APG, SPG, BPG (no BPM/WS/40 for WBB)
 * + Class categorical + Conference tier + minutes flag
 *
 * Input:  data/wbb-draft-history.json (built by build-wbb-draft-dataset.js)
 * Output: Console — paste WBB_DRAFT_MODEL coefficients into modules/draft.js
 *
 * Usage:  node tools/train-wbb-draft-model.js
 */

const fs   = require('fs');
const path = require('path');

const FEATURES = ['PPG', 'eFG%', 'RPG', 'APG', 'SPG', 'BPG'];
const L1 = 0.005;
const L2 = 0.03;
const EPOCHS = 8000;
const LR = 0.005;

function sigmoid(z) { return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z)))); }

function main() {
  const dataPath = path.join(__dirname, '..', 'data', 'wbb-draft-history.json');
  if (!fs.existsSync(dataPath)) {
    console.error('Missing data/wbb-draft-history.json — run build-wbb-draft-dataset.js first');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`Loaded ${raw.length} records (${raw.filter(r => r.drafted).length} drafted)\n`);

  // Compute feature stats
  const stats = {};
  for (const f of FEATURES) {
    const vals = raw.map(r => r[f]).filter(Number.isFinite);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std  = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length) || 1;
    stats[f] = { mean, std };
  }

  // Z-score features
  const X = raw.map(r => {
    const row = FEATURES.map(f => {
      const v = Number(r[f]) || 0;
      return Math.max(-3, Math.min(4, (v - stats[f].mean) / stats[f].std));
    });
    // Conference tier
    row.push(r.confTier === 'power' ? 1.0 : r.confTier === 'mid' ? 0.5 : 0.0);
    // Minutes flag
    row.push(r.MPG > 25 ? 1 : 0);
    return row;
  });
  const y = raw.map(r => r.drafted ? 1 : 0);

  const nDrafted   = y.filter(v => v === 1).length;
  const nUndrafted = y.length - nDrafted;
  const draftedWeight   = y.length / (2 * nDrafted);
  const undraftedWeight = y.length / (2 * nUndrafted);
  console.log(`Balanced weights: drafted=${draftedWeight.toFixed(2)}, undrafted=${undraftedWeight.toFixed(2)}\n`);

  // Initialize weights
  const nFeats = X[0].length;
  const w = new Float64Array(nFeats);
  let bias = 0;

  // Training loop (projected gradient descent, sign-constrained for stat features)
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const grad = new Float64Array(nFeats);
    let biasGrad = 0;

    for (let i = 0; i < X.length; i++) {
      const z = X[i].reduce((s, x, j) => s + x * w[j], 0) + bias;
      const p = sigmoid(z);
      const sampleWeight = y[i] === 1 ? draftedWeight : undraftedWeight;
      const err = (p - y[i]) * sampleWeight;
      for (let j = 0; j < nFeats; j++) grad[j] += err * X[i][j];
      biasGrad += err;
    }

    for (let j = 0; j < nFeats; j++) {
      grad[j] /= X.length;
      grad[j] += L2 * w[j] + L1 * Math.sign(w[j]);
      w[j] -= LR * grad[j];
      // Sign constraint: stat features (0..5) must be >= 0
      if (j < FEATURES.length && w[j] < 0) w[j] = 0;
    }
    bias -= LR * (biasGrad / X.length);
  }

  // Evaluate
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let i = 0; i < X.length; i++) {
    const z = X[i].reduce((s, x, j) => s + x * w[j], 0) + bias;
    const pred = sigmoid(z) >= 0.5 ? 1 : 0;
    if (pred === 1 && y[i] === 1) tp++;
    if (pred === 1 && y[i] === 0) fp++;
    if (pred === 0 && y[i] === 1) fn++;
    if (pred === 0 && y[i] === 0) tn++;
  }
  const precision = tp / (tp + fp) || 0;
  const recall    = tp / (tp + fn) || 0;
  const f1        = 2 * precision * recall / (precision + recall) || 0;
  console.log(`Results: Precision=${(precision*100).toFixed(1)}% Recall=${(recall*100).toFixed(1)}% F1=${(f1*100).toFixed(1)}%`);
  console.log(`  TP=${tp} FP=${fp} FN=${fn} TN=${tn}\n`);

  // Output model
  console.log('var WBB_DRAFT_MODEL = {');
  console.log(`  intercept: ${bias.toFixed(6)},`);
  console.log('  features: [');
  for (let j = 0; j < FEATURES.length; j++) {
    const f = FEATURES[j];
    console.log(`    { stat: '${f}', mean: ${stats[f].mean.toFixed(4)}, std: ${stats[f].std.toFixed(4)}, weight: ${w[j].toFixed(6)} },`);
  }
  console.log('  ],');
  console.log(`  confWeight: ${w[FEATURES.length].toFixed(6)},`);
  console.log(`  minutesWeight: ${w[FEATURES.length + 1].toFixed(6)},`);
  console.log(`  classWeight: 0.45,`);
  console.log(`  classMap: { 'Fr':3, 'So':2, 'Jr':1, 'Sr':0, 'Grad':0, 'RS-Fr':2.5, 'RS-So':1.5, 'RS-Jr':0.5, 'RS-Sr':0 }`);
  console.log('};');
}

main();
