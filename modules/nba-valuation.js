// NBA salary associations transferred to NCAA relative production. No NBA dollar
// intercept, age premium, or absolute NBA height is used for college valuation.
// The generated model asset must precede this module. No network/build dependency.
var NbaValuation = (function () {
  'use strict';
  var preferenceKey = 'nba_valuation_enabled_v1';
  var enabled = true;
  try { enabled = localStorage.getItem(preferenceKey) !== 'false'; } catch (_) {}

  function model() {
    return typeof NBA_VALUATION_MODEL !== 'undefined' && NBA_VALUATION_MODEL && NBA_VALUATION_MODEL.groups
      ? NBA_VALUATION_MODEL : null;
  }
  function groupModel(group) {
    var data = model();
    var result = data && data.groups[group];
    return result && Array.isArray(result.features) && result.features.length &&
      result.features.every(function (feature) { return Number.isFinite(feature.coefficient); }) ? result : null;
  }
  function isEnabled() { return enabled && !!model(); }
  function setEnabled(value) {
    enabled = !!value;
    try { localStorage.setItem(preferenceKey, String(enabled)); } catch (_) {}
    if (typeof tbAllComputed !== 'undefined') tbAllComputed = {};
    if (typeof _cachedAllPlayers !== 'undefined') _cachedAllPlayers = null;
    if (typeof wb !== 'undefined' && wb && typeof reloadActiveSheet === 'function') reloadActiveSheet();
    if (typeof NbaValuationUI !== 'undefined') NbaValuationUI.render();
  }
  function number(value) {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
    var result = Number(value);
    return Number.isFinite(result) ? result : null;
  }
  function bound(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function featureValue(row, key) {
    row = row || {};
    if (key === 'Height') {
      if (typeof PlayerBios !== 'undefined') return PlayerBios.normalizeHeight(row.Height);
      var inches = number(row.Height);
      return inches !== null && inches >= 48 && inches <= 100 ? inches : null;
    }
    var result = number(row[key]);
    // Prefer exact attempt totals; rounded per-game volumes can turn one
    // attempt over a season into 0.0. Unknown 0% is not evidence of 0-for-N.
    var attempts = null, exactAttempts = false;
    var attemptKeys = key === '3P%' ? ['ThreePointAttempts', '3PA', '3PA/G']
      : key === 'FT%' ? ['FreeThrowAttempts', 'FTA', 'FTA/G']
      : key === 'eFG%' ? ['FieldGoalAttempts', 'FGA', 'FGA/G'] : [];
    for (var a = 0; a < attemptKeys.length; a++) {
      attempts = number(row[attemptKeys[a]]);
      if (attempts !== null) { exactAttempts = a === 0; break; }
    }
    if (attemptKeys.length && ((attempts === 0 && (exactAttempts || result === 0)) || (attempts === null && result === 0))) return null;
    if (/%$/.test(key) && result !== null) {
      // Effective FG% credits a three as 1.5 field goals, so 150% is valid.
      var maximum = key === 'eFG%' ? 1.5 : 1;
      if (result > maximum && result <= maximum * 100) result /= 100;
      if (result < 0 || result > maximum) return null;
    }
    if (result !== null && result < 0) return null;
    return result;
  }

  function createContext(pool, leagueName, group) {
    var fitted = groupModel(group);
    if (!isEnabled() || !fitted || !Array.isArray(pool) || !pool.length) return null;
    var features = fitted.features.map(function (feature) {
      var n = 0, mean = 0, m2 = 0;
      pool.forEach(function (row) {
        var value = featureValue(row, feature.key);
        if (value === null) return;
        n++;
        var delta = value - mean;
        mean += delta / n;
        m2 += delta * (value - mean);
      });
      return { key: feature.key, label: feature.label || feature.key, coefficient: feature.coefficient,
        mean: n ? mean : null, scale: n ? Math.sqrt(Math.max(0, m2 / n)) : 0, n: n };
    });
    return { league: leagueName, group: group, n: pool.length, features: features,
      version: String(model().version || model().id || 'nba-2022-23') };
  }

  function score(row, context) {
    if (!context) return null;
    var missing = [], total = 0;
    var contributions = context.features.map(function (feature) {
      var value = featureValue(row, feature.key);
      var absent = value === null || feature.mean === null;
      var rawZ = !absent && feature.scale > 1e-9 ? (value - feature.mean) / feature.scale : 0;
      var z = bound(rawZ, -3, 3);
      var contribution = feature.coefficient * z;
      if (absent) missing.push(feature.key);
      total += contribution;
      return { key: feature.key, label: feature.label, value: value, mean: feature.mean,
        scale: feature.scale, z: z, coefficient: feature.coefficient, contribution: contribution,
        missing: absent, clipped: Math.abs(rawZ) > 3 };
    });
    return { score: total, coverage: (context.features.length - missing.length) / context.features.length,
      missing: missing, contributions: contributions, group: context.group, version: context.version };
  }

  function quote(result, row, context, conferenceMultiplier) {
    context = context || {};
    var cm = number(conferenceMultiplier);
    if (cm === null || cm <= 0) cm = 1;
    var validCalibration = context && ['avgPay', 'minPay', 'maxPay', 'starValue', 'k', 'perfAvg', 'perfStar']
      .every(function (key) { return Number.isFinite(context[key]); }) && context.avgPay > 0 && context.starValue > 0 &&
      context.minPay >= 0 && context.maxPay >= context.minPay && context.k >= 0 && context.starValue >= context.avgPay &&
      (context.starValue === context.avgPay || context.perfStar >= context.perfAvg);
    var sufficient = !!(validCalibration && result && Number.isFinite(result.score) && result.coverage >= 0.5 && featureValue(row, 'MP') !== null);
    var value = sufficient ? context.avgPay * Math.exp(bound(context.k * (result.score - context.perfAvg), -50, 50)) : NaN;
    // Minutes are already a learned feature. Do not apply the legacy MP haircut.
    // Conference strength is a separate college assumption, applied to dollars.
    var final = sufficient ? bound(value * cm, context.minPay, context.maxPay) : NaN;
    return { pred: final, final: final, mult: 1, sufficient: sufficient, validCalibration: !!validCalibration,
      calibration: { avgPay: context.avgPay, minPay: context.minPay, maxPay: context.maxPay,
        starValue: context.starValue, k: context.k, meanScore: context.perfAvg, starScore: context.perfStar,
        conferenceMultiplier: cm, unclampedValue: value * cm,
        baseValue: sufficient ? value : NaN } };
  }

  function annotate(row, result, quoteResult) {
    if (!result) {
      row.NBAModel_calc = false;
      // A cached calculated row can be reused as input by integrations.
      Object.keys(row).forEach(function (key) { if (/^NBA/.test(key) && key !== 'NBAModel_calc') delete row[key]; });
      return row;
    }
    row.NBAModel_calc = true;
    row.NBAModelVersion_calc = result.version;
    row.NBAPosition_calc = result.group;
    row.NBAScore_calc = result.score;
    row.NBACoverage_calc = result.coverage;
    row.NBAMissing_calc = result.missing;
    row.NBAContributions_calc = result.contributions;
    row.NBACalibration_calc = quoteResult.calibration;
    row.NBABaseValue_calc = quoteResult.calibration.baseValue;
    row.NBAConferenceMultiplier_calc = quoteResult.calibration.conferenceMultiplier;
    row.NBAStatus_calc = !quoteResult.validCalibration ? 'Invalid college pay settings' : quoteResult.sufficient
      ? (result.missing.length ? 'Some inputs unavailable' : 'Calculated') : 'Insufficient inputs';
    return row;
  }

  return { getModel: model, getGroup: groupModel, isEnabled: isEnabled, setEnabled: setEnabled,
    featureValue: featureValue, createContext: createContext, score: score, quote: quote, annotate: annotate };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = NbaValuation;
