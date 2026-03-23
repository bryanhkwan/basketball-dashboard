#!/usr/bin/env node
/**
 * train-draft-model-v2.js
 * -----------------------
 * Full pipeline: correlation matrix → VIF → feature selection →
 * interaction terms → elastic-net logistic regression → k-fold CV →
 * final model output.
 *
 * Usage:  node tools/train-draft-model-v2.js
 * No npm dependencies.
 */

const fs   = require('fs');
const path = require('path');

// ── Load dataset ─────────────────────────────────────────────────────────────
const dataPath = path.join(__dirname, '..', 'data', 'draft-history.json');
const dataset  = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const players  = dataset.players;
console.log(`📊 Loaded ${players.length} players\n`);

// ── Feature definitions ──────────────────────────────────────────────────────
const POWER = new Set(['ACC','Big 12','Big Ten','Big East','SEC','Pac-12','Big XII']);
const MID   = new Set(['AAC','A-10','MWC','WCC','MVC','CAA','SoCon','Horizon','MAC','American','Mountain West','West Coast']);

function classVal(c) {
  if (!c) return 0;
  const s = c.toString().toLowerCase();
  if (s.includes('fr')) return 3;
  if (s.includes('so')) return 2;
  if (s.includes('jr') || s.includes('jun')) return 1;
  return 0;
}
function confTier(c) {
  if (!c) return -0.5;
  if (POWER.has(c)) return 1;
  if (MID.has(c)) return 0;
  return -1;
}

const STAT_FEATURES = ['PPG','BPM','WS/40','eFG%','USG%','APG','SPG','BPG','RPG'];

// Reduced feature set: drop BPM (VIF=6.65, correlated with WS/40 0.74) and
// USG% (VIF=3.38, correlated with PPG 0.74).  This eliminates the two high-
// correlation pairs and prevents suppressor variable artifacts.
const REDUCED_FEATURES = ['PPG','WS/40','eFG%','APG','SPG','BPG','RPG'];

// ── 1. RAW FEATURE EXTRACTION ───────────────────────────────────────────────
function extractStatVec(p) {
  return STAT_FEATURES.map(s => {
    const v = p[s];
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  });
}

// ── 2. CORRELATION MATRIX ───────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log('  STEP 1: CORRELATION MATRIX');
console.log('═══════════════════════════════════════════════════════\n');

const rawCols = {};
STAT_FEATURES.forEach(s => { rawCols[s] = []; });
players.forEach(p => {
  STAT_FEATURES.forEach(s => {
    const v = p[s];
    if (typeof v === 'number' && isFinite(v)) rawCols[s].push(v);
    else rawCols[s].push(null);
  });
});

function mean(arr) { const f = arr.filter(v => v !== null); return f.reduce((a,b)=>a+b,0)/f.length; }
function std(arr) { const m = mean(arr); const f = arr.filter(v => v !== null); return Math.sqrt(f.reduce((a,b)=>a+(b-m)**2,0)/f.length)||1; }

function pearson(xs, ys) {
  let n=0, sx=0, sy=0, sxy=0, sx2=0, sy2=0;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i]===null || ys[i]===null) continue;
    n++; sx+=xs[i]; sy+=ys[i]; sxy+=xs[i]*ys[i]; sx2+=xs[i]**2; sy2+=ys[i]**2;
  }
  if (n<5) return 0;
  const num = n*sxy - sx*sy;
  const den = Math.sqrt((n*sx2-sx**2)*(n*sy2-sy**2));
  return den === 0 ? 0 : num/den;
}

// Print correlation matrix
const padH = 8;
process.stdout.write(''.padEnd(padH));
STAT_FEATURES.forEach(s => process.stdout.write(s.padStart(padH)));
console.log();

const corrMatrix = [];
STAT_FEATURES.forEach((s1, i) => {
  process.stdout.write(s1.padEnd(padH));
  const row = [];
  STAT_FEATURES.forEach((s2, j) => {
    const r = pearson(rawCols[s1], rawCols[s2]);
    row.push(r);
    const v = r.toFixed(2);
    const mark = (i !== j && Math.abs(r) >= 0.7) ? '*' : ' ';
    process.stdout.write((v + mark).padStart(padH));
  });
  corrMatrix.push(row);
  console.log();
});

// Identify high correlations
console.log('\n⚠️  Pairs with |r| ≥ 0.7:');
const highCorr = [];
for (let i = 0; i < STAT_FEATURES.length; i++) {
  for (let j = i+1; j < STAT_FEATURES.length; j++) {
    const r = corrMatrix[i][j];
    if (Math.abs(r) >= 0.7) {
      console.log(`   ${STAT_FEATURES[i]} ↔ ${STAT_FEATURES[j]} : r = ${r.toFixed(3)}`);
      highCorr.push([i, j, r]);
    }
  }
}
if (!highCorr.length) console.log('   None found.');

// ── 3. VIF ──────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════');
console.log('  STEP 2: VARIANCE INFLATION FACTOR (VIF)');
console.log('═══════════════════════════════════════════════════════\n');

// Simple OLS R² for computing VIF
function olsR2(y, Xm) {
  // y = n×1, Xm = n×p (with intercept already included)
  const n = y.length, p = Xm[0].length;
  // Normal equations: β = (X'X)^-1 X'y
  // Use gradient descent for simplicity (no matrix inversion needed)
  const beta = new Array(p).fill(0);
  const lr = 0.01;
  for (let iter = 0; iter < 500; iter++) {
    const grad = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      let pred = 0;
      for (let j = 0; j < p; j++) pred += beta[j] * Xm[i][j];
      const err = pred - y[i];
      for (let j = 0; j < p; j++) grad[j] += err * Xm[i][j];
    }
    for (let j = 0; j < p; j++) beta[j] -= lr * grad[j] / n;
  }
  // Compute R²
  let ssTot = 0, ssRes = 0;
  const yMean = y.reduce((a,b)=>a+b,0)/n;
  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let j = 0; j < p; j++) pred += beta[j] * Xm[i][j];
    ssRes += (y[i] - pred)**2;
    ssTot += (y[i] - yMean)**2;
  }
  return ssTot === 0 ? 0 : 1 - ssRes/ssTot;
}

// Z-score all stat features
const statMeans = {}, statStds = {};
STAT_FEATURES.forEach(s => {
  const vals = players.map(p => p[s]).filter(v => typeof v === 'number' && isFinite(v));
  statMeans[s] = vals.reduce((a,b)=>a+b,0)/vals.length;
  statStds[s]  = Math.sqrt(vals.reduce((a,b)=>a+(b-statMeans[s])**2,0)/vals.length)||1;
});

const zData = players.map(p => STAT_FEATURES.map(s => {
  const v = p[s];
  return (typeof v === 'number' && isFinite(v)) ? (v - statMeans[s])/statStds[s] : 0;
}));

const vifs = [];
STAT_FEATURES.forEach((s, idx) => {
  const y = zData.map(r => r[idx]);
  const Xm = zData.map(r => {
    const row = [1]; // intercept
    for (let j = 0; j < STAT_FEATURES.length; j++) { if (j !== idx) row.push(r[j]); }
    return row;
  });
  const r2 = olsR2(y, Xm);
  const vif = 1 / (1 - r2);
  vifs.push(vif);
  const flag = vif > 5 ? ' ⚠️  HIGH' : vif > 3 ? ' ⚡ moderate' : '';
  console.log(`   ${s.padEnd(8)} VIF = ${vif.toFixed(2)}${flag}`);
});

// ── 4. FEATURE SELECTION ────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════');
console.log('  STEP 3: FEATURE SELECTION + INTERACTIONS');
console.log('═══════════════════════════════════════════════════════\n');

// Strategy: Keep features with VIF < 10. For correlated pairs, prefer the more informative one.
// BPM and WS/40 are advanced metrics that partly subsume PPG/RPG/APG
// Decision: keep all raw stats but address via regularization + interactions

// Candidate interaction terms (domain-driven):
const INTERACTIONS = [
  { name: 'PPG×eFG%',    f: r => r[0] * r[3],  desc: 'Efficient scoring' },
  { name: 'PPG×USG%',    f: r => r[0] * r[4],  desc: 'Volume scoring' },
  { name: 'BPM×Class',   f: (r,p) => r[1] * classVal(p.Class), desc: 'Impact + youth' },
  { name: 'APG×SPG',     f: r => r[5] * r[6],  desc: 'Two-way playmaking' },
  { name: 'RPG×BPG',     f: r => r[8] * r[7],  desc: 'Interior presence' },
  { name: 'WS40×Conf',   f: (r,p) => r[2] * confTier(p.Conference), desc: 'Production quality' },
];

console.log('Candidate interactions:');
INTERACTIONS.forEach(ix => console.log(`   ${ix.name.padEnd(14)} — ${ix.desc}`));

// ── 5. BUILD FULL FEATURE MATRIX ────────────────────────────────────────────
// Features: 9 stat z-scores + Class + Conf + StarterMPG + 6 interactions = 18

function buildRow(p) {
  const statZ = STAT_FEATURES.map(s => {
    const v = p[s];
    return (typeof v === 'number' && isFinite(v)) ? (v - statMeans[s])/statStds[s] : 0;
  });
  const cls  = classVal(p.Class);
  const conf = confTier(p.Conference);
  const mpg  = (p.MPG || 0) > 25 ? 1 : 0;
  const ixVals = INTERACTIONS.map(ix => ix.f(statZ, p));
  return [...statZ, cls, conf, mpg, ...ixVals];
}

const allFeatureNames = [...STAT_FEATURES, 'Class', 'Conference', 'StarterMPG',
  ...INTERACTIONS.map(ix => ix.name)];

const X = players.map(buildRow);
const y = players.map(p => p.Drafted ? 1 : 0);
const nFeatures = X[0].length;

console.log(`\n🔢 Full feature matrix: ${X.length} × ${nFeatures}`);
console.log(`   Features: ${allFeatureNames.join(', ')}`);
console.log(`   Drafted: ${y.filter(v=>v===1).length}  Undrafted: ${y.filter(v=>v===0).length}\n`);

// ── 6. ELASTIC NET LOGISTIC REGRESSION + K-FOLD CV ──────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log('  STEP 4: ELASTIC-NET LOGISTIC REGRESSION + 5-FOLD CV');
console.log('═══════════════════════════════════════════════════════\n');

function sigmoid(z) { return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z)))); }

function predict(x, w, b) {
  let z = b;
  for (let j = 0; j < x.length; j++) z += w[j] * x[j];
  return sigmoid(z);
}

function trainElasticNet(Xt, yt, opts) {
  const { lr=0.05, epochs=3000, l1=0.005, l2=0.01, forcePositive=[], balancedClassWeights=false } = opts || {};
  const fpSet = new Set(forcePositive);
  const nf = Xt[0].length;
  const w = new Array(nf).fill(0);
  let b = 0;

  // Balanced class weights: weight_pos = n/(2*n_pos), weight_neg = n/(2*n_neg)
  // This makes the loss treat both classes equally regardless of sample count
  let sampleWeights = null;
  if (balancedClassWeights) {
    const nPos = yt.filter(v => v === 1).length;
    const nNeg = yt.length - nPos;
    const wPos = yt.length / (2 * nPos);
    const wNeg = yt.length / (2 * nNeg);
    sampleWeights = yt.map(v => v === 1 ? wPos : wNeg);
  }

  for (let ep = 0; ep < epochs; ep++) {
    const gradW = new Array(nf).fill(0);
    let gradB = 0;
    for (let i = 0; i < Xt.length; i++) {
      const p = predict(Xt[i], w, b);
      const err = p - yt[i];
      const sw = sampleWeights ? sampleWeights[i] : 1;
      for (let j = 0; j < nf; j++) gradW[j] += sw * err * Xt[i][j];
      gradB += sw * err;
    }
    for (let j = 0; j < nf; j++) {
      const g = gradW[j] / Xt.length;
      // Elastic net: L1 + L2
      w[j] -= lr * (g + l2 * w[j] + l1 * Math.sign(w[j]));
      // Projected gradient: force non-negative for specified features
      if (fpSet.has(j) && w[j] < 0) w[j] = 0;
    }
    b -= lr * (gradB / Xt.length);
  }
  return { w, b };
}

function evaluate(Xv, yv, w, b) {
  let tp=0, fp=0, fn=0, tn=0, loss=0;
  for (let i = 0; i < Xv.length; i++) {
    const p = predict(Xv[i], w, b);
    const pp = Math.max(1e-10, Math.min(1-1e-10, p));
    loss -= yv[i]*Math.log(pp) + (1-yv[i])*Math.log(1-pp);
    const pred = p >= 0.5 ? 1 : 0;
    if (pred===1 && yv[i]===1) tp++;
    if (pred===1 && yv[i]===0) fp++;
    if (pred===0 && yv[i]===1) fn++;
    if (pred===0 && yv[i]===0) tn++;
  }
  const acc = (tp+tn)/Xv.length;
  const prec = tp/(tp+fp)||0;
  const rec = tp/(tp+fn)||0;
  const f1 = 2*prec*rec/(prec+rec)||0;
  return { acc, prec, rec, f1, loss: loss/Xv.length, tp, fp, fn, tn };
}

// 5-fold CV
function kFoldCV(Xall, yall, k, opts) {
  const n = Xall.length;
  // Shuffle indices
  const idx = Array.from({length:n}, (_,i)=>i);
  // Deterministic shuffle (seeded)
  for (let i = n-1; i > 0; i--) {
    const j = Math.floor((Math.sin(i*9301+49297)%1+1)%1 * (i+1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const foldSize = Math.ceil(n/k);
  const results = [];

  for (let fold = 0; fold < k; fold++) {
    const valIdx = new Set(idx.slice(fold*foldSize, (fold+1)*foldSize));
    const Xt = [], yt = [], Xv = [], yv = [];
    for (let i = 0; i < n; i++) {
      if (valIdx.has(i)) { Xv.push(Xall[i]); yv.push(yall[i]); }
      else { Xt.push(Xall[i]); yt.push(yall[i]); }
    }
    const model = trainElasticNet(Xt, yt, opts);
    const ev = evaluate(Xv, yv, model.w, model.b);
    results.push(ev);
  }

  // Average metrics
  const avg = { acc:0, prec:0, rec:0, f1:0, loss:0 };
  results.forEach(r => { avg.acc+=r.acc; avg.prec+=r.prec; avg.rec+=r.rec; avg.f1+=r.f1; avg.loss+=r.loss; });
  Object.keys(avg).forEach(k => avg[k] /= results.length);
  return { folds: results, avg };
}

// Compare: base model (no interactions) vs full model (with interactions) vs reduced model
const X_base = players.map(p => {
  const statZ = STAT_FEATURES.map(s => {
    const v = p[s];
    return (typeof v === 'number' && isFinite(v)) ? (v - statMeans[s])/statStds[s] : 0;
  });
  return [...statZ, classVal(p.Class), confTier(p.Conference), (p.MPG||0)>25?1:0];
});

const baseNames = [...STAT_FEATURES, 'Class', 'Conference', 'StarterMPG'];

// Reduced feature set: z-score with reduced means/stds
const redMeans = {}, redStds = {};
REDUCED_FEATURES.forEach(s => { redMeans[s] = statMeans[s]; redStds[s] = statStds[s]; });

const X_reduced = players.map(p => {
  const statZ = REDUCED_FEATURES.map(s => {
    const v = p[s];
    return (typeof v === 'number' && isFinite(v)) ? (v - redMeans[s])/redStds[s] : 0;
  });
  return [...statZ, classVal(p.Class), confTier(p.Conference), (p.MPG||0)>25?1:0];
});

const reducedNames = [...REDUCED_FEATURES, 'Class', 'Conference', 'StarterMPG'];

// Force ALL stat weights non-negative (all stats should positively correlate with draft probability)
const FORCE_POS_BASE = [0,1,2,3,4,5,6,7,8]; // all 9 stat features
const FORCE_POS_FULL = [0,1,2,3,4,5,6,7,8]; // same for interactions model
const FORCE_POS_REDUCED = [0,1,2,3,4,5,6]; // all 7 reduced stat features

const trainOpts = { lr: 0.05, epochs: 5000, l1: 0.005, l2: 0.03, balancedClassWeights: true };

console.log('Model A: All 9 stats, no interactions, sign-constrained, balanced weights');
const cvBase = kFoldCV(X_base, y, 5, { ...trainOpts, forcePositive: FORCE_POS_BASE });
console.log(`   CV Accuracy:  ${(cvBase.avg.acc*100).toFixed(1)}%`);
console.log(`   CV Precision: ${(cvBase.avg.prec*100).toFixed(1)}%`);
console.log(`   CV Recall:    ${(cvBase.avg.rec*100).toFixed(1)}%`);
console.log(`   CV F1:        ${(cvBase.avg.f1*100).toFixed(1)}%`);
console.log(`   CV Loss:      ${cvBase.avg.loss.toFixed(4)}\n`);

console.log('Model B: All 9 stats + interactions, sign-constrained, balanced weights');
const cvFull = kFoldCV(X, y, 5, { ...trainOpts, forcePositive: FORCE_POS_FULL });
console.log(`   CV Accuracy:  ${(cvFull.avg.acc*100).toFixed(1)}%`);
console.log(`   CV Precision: ${(cvFull.avg.prec*100).toFixed(1)}%`);
console.log(`   CV Recall:    ${(cvFull.avg.rec*100).toFixed(1)}%`);
console.log(`   CV F1:        ${(cvFull.avg.f1*100).toFixed(1)}%`);
console.log(`   CV Loss:      ${cvFull.avg.loss.toFixed(4)}\n`);

console.log('Model C: Reduced 7 stats (no BPM, no USG%), no interactions, sign-constrained, balanced weights');
const cvReduced = kFoldCV(X_reduced, y, 5, { ...trainOpts, forcePositive: FORCE_POS_REDUCED });
console.log(`   CV Accuracy:  ${(cvReduced.avg.acc*100).toFixed(1)}%`);
console.log(`   CV Precision: ${(cvReduced.avg.prec*100).toFixed(1)}%`);
console.log(`   CV Recall:    ${(cvReduced.avg.rec*100).toFixed(1)}%`);
console.log(`   CV F1:        ${(cvReduced.avg.f1*100).toFixed(1)}%`);
console.log(`   CV Loss:      ${cvReduced.avg.loss.toFixed(4)}\n`);

// Pick winner: prefer reduced model (Model C) if competitive — it avoids multicollinearity
const allModels = [
  { name: 'A (full base)', f1: cvBase.avg.f1 },
  { name: 'B (interactions)', f1: cvFull.avg.f1 },
  { name: 'C (reduced)', f1: cvReduced.avg.f1 },
];
allModels.sort((a,b) => b.f1 - a.f1);
console.log('CV F1 ranking:');
allModels.forEach((m, i) => console.log(`   ${i+1}. ${m.name}: ${(m.f1*100).toFixed(1)}%`));

// Use Model C (reduced, no interactions) — it's the most robust against multicollinearity
// and avoids suppressor variable artifacts on out-of-distribution data
const bestIsInteraction = false;
const useReduced = true;
console.log(`\n   ➜ Using Model C (reduced features, no interactions) for robustness\n`);

// ── 7. TRAIN FINAL MODEL ON ALL DATA ────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log('  STEP 5: FINAL MODEL (all data, best config)');
console.log('═══════════════════════════════════════════════════════\n');

const finalX = useReduced ? X_reduced : (bestIsInteraction ? X : X_base);
const finalNames = useReduced ? reducedNames : (bestIsInteraction ? allFeatureNames : baseNames);
const finalForcePos = useReduced ? FORCE_POS_REDUCED : (bestIsInteraction ? FORCE_POS_FULL : FORCE_POS_BASE);
const finalStatFeatures = useReduced ? REDUCED_FEATURES : STAT_FEATURES;
const finalStatMeans = useReduced ? redMeans : statMeans;
const finalStatStds = useReduced ? redStds : statStds;
const final = trainElasticNet(finalX, y, { lr: 0.05, epochs: 8000, l1: 0.005, l2: 0.03, forcePositive: finalForcePos, balancedClassWeights: true });
const ev = evaluate(finalX, y, final.w, final.b);

console.log(`Final model (${finalNames.length} features):`);
console.log(`   Accuracy:  ${(ev.acc*100).toFixed(1)}%`);
console.log(`   Precision: ${(ev.prec*100).toFixed(1)}%`);
console.log(`   Recall:    ${(ev.rec*100).toFixed(1)}%`);
console.log(`   F1:        ${(ev.f1*100).toFixed(1)}%`);
console.log(`   TP=${ev.tp} FP=${ev.fp} FN=${ev.fn} TN=${ev.tn}\n`);

console.log('Feature weights:');
finalNames.forEach((name, i) => {
  const w = final.w[i];
  const bar = w > 0 ? '+'.repeat(Math.min(Math.round(Math.abs(w)*5), 20)) : '-'.repeat(Math.min(Math.round(Math.abs(w)*5), 20));
  console.log(`   ${name.padEnd(14)} ${w >= 0 ? '+' : ''}${w.toFixed(4)}  ${bar}`);
});
console.log(`   ${'intercept'.padEnd(14)} ${final.b >= 0 ? '+' : ''}${final.b.toFixed(4)}`);

// ── 8. FEATURE IMPORTANCE (by |weight × std(feature)|) ─────────────────────
console.log('\nFeature importance (|weight × feature_std|):');
const importances = finalNames.map((name, i) => {
  const vals = finalX.map(r => r[i]);
  const s = std(vals);
  return { name, importance: Math.abs(final.w[i]) * s, weight: final.w[i] };
});
importances.sort((a,b) => b.importance - a.importance);
importances.forEach(f => {
  console.log(`   ${f.name.padEnd(14)} imp=${f.importance.toFixed(4)}  w=${f.weight>=0?'+':''}${f.weight.toFixed(4)}`);
});

// ── 9. SAMPLE PREDICTIONS ───────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════');
console.log('  STEP 6: SAMPLE PREDICTIONS');
console.log('═══════════════════════════════════════════════════════\n');

const preds = players.map((p, i) => ({
  player: p.Player, actual: y[i],
  prob: predict(finalX[i], final.w, final.b)
})).sort((a,b) => b.prob - a.prob);

console.log('Top 15:');
preds.slice(0,15).forEach(p => {
  const mark = p.actual ? '✅' : '❌';
  console.log(`   ${mark} ${p.player.padEnd(22)} ${(p.prob*100).toFixed(1)}%  ${p.actual?'DRAFTED':'UNDRAFTED'}`);
});

console.log('\nBottom 10:');
preds.slice(-10).forEach(p => {
  const mark = p.actual ? '❌' : '✅';
  console.log(`   ${mark} ${p.player.padEnd(22)} ${(p.prob*100).toFixed(1)}%  ${p.actual?'DRAFTED':'UNDRAFTED'}`);
});

// ── 10. OUTPUT FOR modules/draft.js ─────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════');
console.log('  OUTPUT: DRAFT_MODEL for modules/draft.js');
console.log('═══════════════════════════════════════════════════════\n');

// Separate stat features from categorical and interaction features
const statWeights = {};
finalStatFeatures.forEach((s, i) => {
  statWeights[s] = { mean: finalStatMeans[s], std: finalStatStds[s], weight: final.w[i] };
});

const catStart = finalStatFeatures.length;
const classW = final.w[catStart];
const confW = final.w[catStart+1];
const mpgW = final.w[catStart+2];

const ixWeights = {};
if (bestIsInteraction && !useReduced) {
  INTERACTIONS.forEach((ix, i) => {
    ixWeights[ix.name] = final.w[catStart + 3 + i];
  });
}

console.log('var DRAFT_MODEL = {');
console.log(`  intercept: ${final.b.toFixed(6)},`);
console.log('  features: [');
finalStatFeatures.forEach((s, i) => {
  const comma = i < finalStatFeatures.length-1 ? ',' : '';
  console.log(`    { stat: '${s}', mean: ${finalStatMeans[s].toFixed(4)}, std: ${finalStatStds[s].toFixed(4)}, weight: ${final.w[i].toFixed(6)} }${comma}`);
});
console.log('  ],');
console.log(`  classWeight: ${classW.toFixed(6)},`);
console.log(`  confWeight: ${confW.toFixed(6)},`);
console.log(`  minutesWeight: ${mpgW.toFixed(6)},`);

if (bestIsInteraction && !useReduced) {
  console.log('  interactions: [');
  INTERACTIONS.forEach((ix, i) => {
    const w = final.w[catStart + 3 + i];
    const comma = i < INTERACTIONS.length-1 ? ',' : '';
    console.log(`    { name: '${ix.name}', weight: ${w.toFixed(6)}, desc: '${ix.desc}' }${comma}`);
  });
  console.log('  ],');
}

console.log("  classMap: { 'Fr': 3, 'So': 2, 'Jr': 1, 'Sr': 0, 'Grad': 0, 'RS-Fr': 2.5, 'RS-So': 1.5, 'RS-Jr': 0.5, 'RS-Sr': 0 }");
console.log('};\n');

// ── 11. COMPARISON SUMMARY ──────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════════════════════\n');
console.log(`  Dataset:        ${players.length} players (${y.filter(v=>v===1).length} drafted, ${y.filter(v=>v===0).length} undrafted)`);
console.log(`  Stats used:     ${finalStatFeatures.join(', ')}`);
console.log(`  Features:       ${finalNames.length} (${finalStatFeatures.length} stats + 3 categorical${bestIsInteraction && !useReduced ? ' + '+INTERACTIONS.length+' interactions' : ''})`);
console.log(`  Regularization: Elastic net (L1=${0.005}, L2=${0.03}), sign-constrained`);
console.log(`  5-fold CV F1:   A=${(cvBase.avg.f1*100).toFixed(1)}%  B=${(cvFull.avg.f1*100).toFixed(1)}%  C=${(cvReduced.avg.f1*100).toFixed(1)}%`);
console.log(`  Final F1:       ${(ev.f1*100).toFixed(1)}%`);
console.log(`  Model used:     ${useReduced ? 'C (reduced, no interactions)' : bestIsInteraction ? 'B (interactions)' : 'A (base)'}`);
console.log(`  Key VIF flags:  ${vifs.map((v,i)=>`${STAT_FEATURES[i]}=${v.toFixed(1)}`).filter((_,i)=>vifs[i]>3).join(', ') || 'none'}`);
