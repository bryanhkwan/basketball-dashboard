#!/usr/bin/env node
/**
 * train-draft-model.js
 * --------------------
 * Trains a logistic regression model on data/draft-history.json
 * and outputs updated coefficients for modules/draft.js.
 *
 * Usage:
 *   node tools/train-draft-model.js
 *
 * No npm dependencies — pure Node.js. Implements gradient descent
 * logistic regression from scratch.
 */

const fs   = require('fs');
const path = require('path');

// ── Load dataset ─────────────────────────────────────────────────────────────
const dataPath = path.join(__dirname, '..', 'data', 'draft-history.json');
if (!fs.existsSync(dataPath)) {
  console.error('❌ Dataset not found at', dataPath);
  console.error('   Create data/draft-history.json first.');
  process.exit(1);
}
const dataset = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const players = dataset.players;
console.log(`📊 Loaded ${players.length} players from dataset`);

// ── Feature definitions ──────────────────────────────────────────────────────
const POWER_CONFS = new Set(['ACC', 'Big 12', 'Big Ten', 'Big East', 'SEC', 'Pac-12', 'Big XII']);
const MID_CONFS   = new Set(['AAC', 'A-10', 'MWC', 'WCC', 'MVC', 'CAA', 'SoCon', 'Horizon', 'MAC']);

const STAT_FEATURES = ['PPG', 'BPM', 'WS/40', 'eFG%', 'USG%', 'APG', 'SPG', 'BPG', 'RPG'];

function classValue(c) {
  if (!c) return 0;
  const cl = c.toString().toLowerCase();
  if (cl.includes('fr')) return 3;
  if (cl.includes('so')) return 2;
  if (cl.includes('jr') || cl.includes('jun')) return 1;
  return 0;
}

function confTier(c) {
  if (!c) return -0.5;
  if (POWER_CONFS.has(c)) return 1;
  if (MID_CONFS.has(c)) return 0;
  return -1;
}

// ── Build feature matrix ─────────────────────────────────────────────────────
// Compute per-feature mean and std from dataset
const rawFeatures = {};
STAT_FEATURES.forEach(s => { rawFeatures[s] = []; });

players.forEach(p => {
  STAT_FEATURES.forEach(s => {
    const v = p[s];
    if (typeof v === 'number' && isFinite(v)) rawFeatures[s].push(v);
  });
});

const featureStats = {};
STAT_FEATURES.forEach(s => {
  const arr = rawFeatures[s];
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const std  = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length) || 1;
  featureStats[s] = { mean, std };
});

console.log('\n📐 Feature statistics (from dataset):');
STAT_FEATURES.forEach(s => {
  console.log(`   ${s.padEnd(8)} mean=${featureStats[s].mean.toFixed(3)}  std=${featureStats[s].std.toFixed(3)}`);
});

// Build X (features) and y (labels) arrays
const X = [];
const y = [];

players.forEach(p => {
  const row = [];
  // Stat features (z-scored)
  STAT_FEATURES.forEach(s => {
    const v = p[s];
    if (typeof v !== 'number' || !isFinite(v)) {
      row.push(0); // missing → mean
    } else {
      row.push((v - featureStats[s].mean) / featureStats[s].std);
    }
  });
  // Class value (not z-scored, categorical 0-3)
  row.push(classValue(p.Class));
  // Conference tier (-1, 0, 1)
  row.push(confTier(p.Conference));
  // Starter minutes (binary)
  row.push((p.MPG || 0) > 25 ? 1 : 0);

  X.push(row);
  y.push(p.Drafted ? 1 : 0);
});

const numFeatures = X[0].length;
const featureNames = [...STAT_FEATURES, 'Class', 'Conference', 'StarterMPG'];
console.log(`\n🔢 Feature matrix: ${X.length} samples × ${numFeatures} features`);
console.log(`   Drafted: ${y.filter(v => v === 1).length}  Undrafted: ${y.filter(v => v === 0).length}`);

// ── Logistic Regression (gradient descent) ───────────────────────────────────
function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

function predict(x, w, b) {
  let z = b;
  for (let j = 0; j < x.length; j++) z += w[j] * x[j];
  return sigmoid(z);
}

function logLoss(X, y, w, b) {
  let loss = 0;
  for (let i = 0; i < X.length; i++) {
    const p = predict(X[i], w, b);
    const pp = Math.max(1e-10, Math.min(1 - 1e-10, p));
    loss -= y[i] * Math.log(pp) + (1 - y[i]) * Math.log(1 - pp);
  }
  return loss / X.length;
}

// Initialize weights
const w = new Array(numFeatures).fill(0);
let b = 0;

// Hyperparameters
const lr     = 0.1;
const epochs = 2000;
const lambda = 0.01; // L2 regularization

console.log(`\n🏋️ Training logistic regression (lr=${lr}, epochs=${epochs}, λ=${lambda})...`);

for (let epoch = 0; epoch < epochs; epoch++) {
  const gradW = new Array(numFeatures).fill(0);
  let gradB = 0;

  for (let i = 0; i < X.length; i++) {
    const p = predict(X[i], w, b);
    const err = p - y[i];
    for (let j = 0; j < numFeatures; j++) {
      gradW[j] += err * X[i][j];
    }
    gradB += err;
  }

  // Update with L2 regularization on weights (not bias)
  for (let j = 0; j < numFeatures; j++) {
    w[j] -= lr * (gradW[j] / X.length + lambda * w[j]);
  }
  b -= lr * (gradB / X.length);

  if (epoch % 500 === 0 || epoch === epochs - 1) {
    const loss = logLoss(X, y, w, b);
    console.log(`   Epoch ${String(epoch).padStart(4)}: loss = ${loss.toFixed(6)}`);
  }
}

// ── Evaluate ─────────────────────────────────────────────────────────────────
let correct = 0;
let tp = 0, fp = 0, fn = 0, tn = 0;
const predictions = [];

for (let i = 0; i < X.length; i++) {
  const p = predict(X[i], w, b);
  const pred = p >= 0.5 ? 1 : 0;
  if (pred === y[i]) correct++;
  if (pred === 1 && y[i] === 1) tp++;
  if (pred === 1 && y[i] === 0) fp++;
  if (pred === 0 && y[i] === 1) fn++;
  if (pred === 0 && y[i] === 0) tn++;
  predictions.push({ player: players[i].Player, actual: y[i], predicted: p });
}

const accuracy  = correct / X.length;
const precision = tp / (tp + fp) || 0;
const recall    = tp / (tp + fn) || 0;
const f1        = 2 * precision * recall / (precision + recall) || 0;

console.log(`\n📈 Results:`);
console.log(`   Accuracy:  ${(accuracy * 100).toFixed(1)}%`);
console.log(`   Precision: ${(precision * 100).toFixed(1)}%`);
console.log(`   Recall:    ${(recall * 100).toFixed(1)}%`);
console.log(`   F1 Score:  ${(f1 * 100).toFixed(1)}%`);
console.log(`   Confusion: TP=${tp} FP=${fp} FN=${fn} TN=${tn}`);

// Show some predictions
console.log('\n🔮 Sample predictions:');
predictions
  .sort((a, b) => b.predicted - a.predicted)
  .slice(0, 10)
  .forEach(p => {
    const mark = p.actual ? '✅' : '❌';
    console.log(`   ${mark} ${p.player.padEnd(22)} prob=${(p.predicted * 100).toFixed(1)}%  actual=${p.actual ? 'DRAFTED' : 'UNDRAFTED'}`);
  });

console.log('\n   ... bottom 5:');
predictions
  .sort((a, b) => a.predicted - b.predicted)
  .slice(0, 5)
  .forEach(p => {
    const mark = p.actual ? '✅' : '❌';
    console.log(`   ${mark} ${p.player.padEnd(22)} prob=${(p.predicted * 100).toFixed(1)}%  actual=${p.actual ? 'DRAFTED' : 'UNDRAFTED'}`);
  });

// ── Output model coefficients ────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('📋 TRAINED MODEL COEFFICIENTS — paste into modules/draft.js');
console.log('='.repeat(70));
console.log();

console.log('var DRAFT_MODEL = {');
console.log(`  intercept: ${b.toFixed(6)},`);
console.log('  features: {');
STAT_FEATURES.forEach((s, i) => {
  const comma = i < STAT_FEATURES.length - 1 ? ',' : '';
  const key = s.includes('/') || s.includes('%') ? `'${s}'` : s;
  console.log(`    ${key.padEnd(10)}: { mean: ${featureStats[s].mean.toFixed(4)}, std: ${featureStats[s].std.toFixed(4)}, weight: ${w[i].toFixed(6)} }${comma}`);
});
console.log('  },');

const classIdx = STAT_FEATURES.length;
const confIdx  = classIdx + 1;
const mpgIdx   = confIdx + 1;

console.log(`  classWeight: ${w[classIdx].toFixed(6)},`);
console.log(`  confWeight: ${w[confIdx].toFixed(6)},`);
console.log(`  minutesWeight: ${w[mpgIdx].toFixed(6)},`);
console.log("  classMap: { 'Fr': 3, 'So': 2, 'Jr': 1, 'Sr': 0, 'Grad': 0, 'RS-Fr': 2.5, 'RS-So': 1.5, 'RS-Jr': 0.5, 'RS-Sr': 0 }");
console.log('};');
console.log();
console.log('// Copy the block above and replace DRAFT_MODEL in modules/draft.js');
console.log('// Then reload the dashboard to use the updated model.');
