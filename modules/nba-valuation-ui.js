// NBA salary-reference explanations. Native HTML; no plotting or runtime deps.
var NbaValuationUI = (function () {
  'use strict';
  var groups = ['Guards', 'Wings', 'Bigs'];
  var selectedGroup = 'Guards';
  var selectedView = 'evidence';
  var comparisonStat = 'Height';
  var lastBoardGroup = '';

  function element(id) { return document.getElementById(id); }
  function escape(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }
  function number(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null; }
  function fixed(value, digits) { var n = number(value); return n === null ? '\u2014' : n.toFixed(digits === undefined ? 3 : digits); }
  function signed(value, digits) { var n = number(value); return n === null ? '\u2014' : (n > 0 ? '+' : '') + fixed(n, digits); }
  function pct(value) { var n = number(value); return n === null ? '\u2014' : (n * 100).toFixed(0) + '%'; }
  function money(value) {
    var n = number(value);
    return n === null ? '\u2014' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  }
  function api() { return typeof NbaValuation !== 'undefined' ? NbaValuation : null; }
  function evidenceApi() { return typeof NBA_SALARY_EVIDENCE !== 'undefined' ? NBA_SALARY_EVIDENCE : null; }
  function enabled() { var runtime = api(); return !!(runtime && runtime.isEnabled && runtime.isEnabled()); }
  function canView() {
    if (typeof demoCanViewSensitiveModeling === 'function') return demoCanViewSensitiveModeling();
    if (typeof authIsGuest === 'function') return !authIsGuest();
    return false;
  }
  function lockedHtml() {
    return '<div class="nbaModelLocked"><p class="nbaModelNote">Salary evidence, prediction weights, validation details, and player contributions are available to approved staff.</p>'
      + '<button type="button" class="secondary" data-nba-staff-login>Staff login</button></div>';
  }
  function metric(label, value) { return '<div class="nbaModelMetric"><dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd></div>'; }
  function effect(value, maximum) {
    var n = number(value);
    var width = n === null || !maximum ? 0 : Math.min(100, Math.abs(n) / maximum * 100);
    return '<div class="nbaModelEffect" data-sign="' + (n < 0 ? 'negative' : 'positive') + '"><span class="nbaModelBar" aria-hidden="true"><span style="width:' + width.toFixed(1) + '%"></span></span><output>' + escape(signed(n)) + '</output></div>';
  }
  function interval(feature) {
    return number(feature.ciLow) === null || number(feature.ciHigh) === null ? '\u2014' : signed(feature.ciLow) + ' to ' + signed(feature.ciHigh);
  }
  function stat(value, key) {
    var n = number(value);
    if (n === null) return '\u2014';
    if (key === 'Height') return typeof formatPlayerHeight === 'function' ? formatPlayerHeight(n) : fixed(n, 1) + ' in';
    if (/%/.test(key)) return (Math.abs(n) <= (key === 'eFG%' ? 1.5 : 1) ? n * 100 : n).toFixed(1) + '%';
    return fixed(n, key === 'Age' ? 1 : 2);
  }

  function coefficientHtml(group) {
    var features = (group.features || []).slice().sort(function (a, b) { return Math.abs(number(b.coefficient) || 0) - Math.abs(number(a.coefficient) || 0); });
    if (!features.length) return '<p class="nbaModelNote">Coefficient details are unavailable for this group.</p>';
    var maximum = Math.max.apply(null, features.map(function (feature) { return Math.abs(number(feature.coefficient) || 0); }));
    return '<div class="nbaModelTableWrap" tabindex="0" role="region" aria-label="NBA salary coefficients"><table class="nbaModelTable">'
      + '<caption>Change in predicted NBA log salary per one NBA standard deviation, holding the other inputs and age fixed. Bars show absolute coefficient size; signed numbers show direction.</caption>'
      + '<thead><tr><th scope="col">Input</th><th scope="col">Coefficient / 1 SD</th><th scope="col">95% bootstrap interval</th><th scope="col">Positive bootstrap runs</th></tr></thead><tbody>'
      + features.map(function (feature) {
        var note = feature.key === 'Age' ? 'NBA age control; held neutral for college players' : feature.unit || '';
        return '<tr' + (feature.key === 'Height' ? ' class="nbaHeightRow"' : '') + '><td><strong>' + escape(feature.label || feature.key) + '</strong>'
          + (note ? '<span class="nbaModelFeatureNote">' + escape(note) + '</span>' : '') + '</td><td>' + effect(feature.coefficient, maximum) + '</td><td>'
          + escape(interval(feature)) + '</td><td>' + escape(pct(feature.positiveShare)) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="nbaModelNote" style="margin-top:9px">Player bootstrap intervals keep the final ridge penalty fixed. They describe coefficient stability in this NBA sample. Positive-run frequency is not a probability that an effect is causal or that a college valuation is correct. Age is a separate NBA control and is held neutral for college players.</p>';
  }

  function heightHtml(model, group) {
    var height = (group.features || []).find(function (feature) { return feature.key === 'Height'; });
    if (!height) return '';
    var low = number(height.ciLow), high = number(height.ciHigh);
    var description = low !== null && high !== null && low <= 0 && high >= 0
      ? 'The bootstrap interval spans zero, so the direction of the adjusted height association is uncertain in this sample.'
      : number(height.coefficient) === null ? 'A height coefficient is unavailable for this group.'
      : 'The fitted NBA association is ' + (height.coefficient >= 0 ? 'positive' : 'negative') + ' after accounting for the other model inputs.';
    var ablation = group.heightAblation || {};
    var improvement = number(ablation.ageAdjustedLogRMSEImprovement);
    var transferredImprovement = number(ablation.logRMSEImprovement);
    var treeHeight = (group.treePermutationImportance || []).find(function (feature) { return feature.key === 'Height'; });
    var checks = improvement === null ? '' : '<p class="nbaModelNote"><strong>Height ablation:</strong> including height '
      + (improvement >= 0 ? 'reduced' : 'increased') + ' age-adjusted held-out log-RMSE by ' + escape(fixed(Math.abs(improvement), 4)) + ' compared with the same fit without height.</p>';
    if (transferredImprovement !== null) checks += '<p class="nbaModelNote"><strong>With age held neutral:</strong> adding height '
      + (transferredImprovement >= 0 ? 'reduced' : 'increased') + ' held-out log-RMSE by ' + escape(fixed(Math.abs(transferredImprovement), 4))
      + '. This is the variant whose coefficients are transferred to college peers.</p>';
    if (treeHeight && number(treeHeight.meanIncreaseInHeldoutLogMSE) !== null) {
      checks += '<p class="nbaModelNote"><strong>Tree check:</strong> shuffling height changed held-out tree log-MSE by ' + escape(signed(treeHeight.meanIncreaseInHeldoutLogMSE, 4))
        + '. A positive increase means height helped the tree; zero or negative values provide no consistent benefit.</p>';
    }
    return '<section class="nbaModelHeight"><h3>What height contributes</h3><p class="nbaModelNote"><strong>' + escape(selectedGroup) + ': ' + escape(signed(height.coefficient))
      + ' per height SD</strong> · bootstrap interval ' + escape(interval(height)) + '. One NBA height SD is ' + escape(fixed(height.scale, 2)) + ' inches.</p><p class="nbaModelNote">' + escape(description)
      + ' Height is a salary association, not a causal pay premium. Its college contribution uses height relative to the selected league and position peers.</p>' + checks
      + '<p class="nbaModelNote">NBA heights were retrieved from athlete bios in September 2026; they are listed measurements, not verified 2022–23 measurements.</p></section>';
  }

  function validationHtml(model, group) {
    var metrics = group.metrics || {};
    var definitions = [['deployedRidge', 'Transferred ridge', 'Age held neutral, matching the college application'], ['portableTree', 'Regression tree', 'Portable basketball inputs'], ['baseline', 'Baseline', 'Salary reference without player inputs']];
    var rows = definitions.filter(function (definition) { return metrics[definition[0]] && number(metrics[definition[0]].logR2) !== null; });
    var table = rows.length ? '<div class="nbaModelTableWrap" tabindex="0" role="region" aria-label="Held-out NBA salary validation"><table class="nbaModelTable"><caption>Held-out NBA salary predictions. Higher R² is better; lower errors are better. Dollar errors apply to the NBA sample only. A negative R² is worse than a mean reference.</caption>'
      + '<thead><tr><th scope="col">Method</th><th scope="col">Log-salary R²</th><th scope="col">Log RMSE</th><th scope="col">NBA salary MAE</th></tr></thead><tbody>'
      + rows.map(function (definition) {
        var result = metrics[definition[0]];
        return '<tr><td><strong>' + escape(definition[1]) + '</strong><span class="nbaModelFeatureNote">' + escape(definition[2]) + '</span></td><td>' + escape(fixed(result.logR2)) + '</td><td>' + escape(fixed(result.logRMSE))
          + '</td><td>' + escape(money(result.salaryMedianMAE)) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="nbaModelNote">Validation metrics are not available in this model snapshot.</p>';
    var validation = model.validation || {};
    var design = number(validation.folds) !== null && number(validation.repeats) !== null ? '<p class="nbaModelNote" style="margin-bottom:10px">'
      + escape(validation.folds) + '-fold nested cross-validation, repeated ' + escape(validation.repeats) + ' times. All reported predictions are held out; model settings are selected inside the training folds.</p>' : '';
    return '<h3 class="nbaModelSectionTitle">Validation in the NBA sample</h3>' + design + table
      + '<p class="nbaModelNote" style="margin-top:9px">MAE uses median-salary predictions. NBA validation evaluates salary fit within this dataset; it does not validate NCAA pay, particularly for WBB. Salary also reflects contract timing and factors outside the supplied statistics.</p>';
  }

  function treeHtml(group) {
    var items = (group.treePermutationImportance || []).slice().sort(function (a, b) { return (number(b.meanIncreaseInHeldoutLogMSE) || 0) - (number(a.meanIncreaseInHeldoutLogMSE) || 0); });
    if (!items.length) return '';
    return '<details class="nbaModelSubdetails"><summary>Regression-tree feature check</summary><div class="nbaModelTableWrap" tabindex="0" role="region" aria-label="Regression-tree permutation importance"><table class="nbaModelTable">'
      + '<caption>Held-out permutation importance. A positive error increase means the tree used this input; it does not indicate a salary premium. Negative values suggest unstable benefit. The tree is a comparison model, not the deployed college pay formula.</caption>'
      + '<thead><tr><th scope="col">Input shuffled</th><th scope="col">Change in log-MSE</th><th scope="col">Across-fold SD</th><th scope="col">Folds with positive increase</th></tr></thead><tbody>'
      + items.map(function (item) { return '<tr' + (item.key === 'Height' ? ' class="nbaHeightRow"' : '') + '><td>' + escape(item.key) + '</td><td>' + escape(signed(item.meanIncreaseInHeldoutLogMSE, 4))
        + '</td><td>' + escape(fixed(item.foldSD, 4)) + '</td><td>' + escape(pct(item.positiveFoldShare)) + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
  }

  function pValue(value) {
    var n = number(value);
    if (n === null) return '\u2014';
    if (n === 0) return '<0.000001';
    return n < 0.001 ? n.toExponential(3) : n.toPrecision(4);
  }
  function pHtml(value) { return '<span title="Unrounded p-value: ' + escape(number(value) === null ? 'unavailable' : String(value)) + '">' + escape(pValue(value)) + '</span>'; }
  function association(value) { return number(value) === null ? '\u2014' : signed(value, 1) + '%'; }
  function associationInterval(estimate) { return association(estimate.associationPctCiLow) + ' to ' + association(estimate.associationPctCiHigh); }
  function evidenceEstimates(group) { return group && Array.isArray(group.estimates) ? group.estimates : []; }
  function evidenceDecision(estimate, comparison) {
    if (!['supported', 'suggestive', 'uncertain'].includes(estimate.status) || number(estimate.pHolm) === null || number(estimate.pRaw) === null) return 'Not estimable';
    if (estimate.status === 'supported') return comparison ? 'Supported difference' : number(estimate.logEffect) < 0 ? 'Supported · lower salary' : 'Supported · higher salary';
    return estimate.status === 'suggestive' ? 'Suggestive · not supported' : 'Uncertain';
  }
  function decisionBadge(estimate, comparison) {
    var decision = evidenceDecision(estimate, comparison);
    return '<span class="nbaEvidenceDecision" data-evidence-status="' + escape(estimate.status || 'unavailable') + '">' + escape(decision) + '</span>'
      + (decision === 'Not estimable' ? '<span class="nbaModelFeatureNote">' + escape(estimate.reason || estimate.failureReason || 'Valid inference is unavailable for this estimate.') + '</span>' : '');
  }
  function evidenceSummary(group) {
    var estimates = evidenceEstimates(group);
    var positive = estimates.filter(function (estimate) { return estimate.status === 'supported' && number(estimate.logEffect) > 0; });
    var negative = estimates.filter(function (estimate) { return estimate.status === 'supported' && number(estimate.logEffect) < 0; });
    var suggestive = estimates.filter(function (estimate) { return estimate.status === 'suggestive'; });
    var unclear = estimates.filter(function (estimate) { return estimate.status !== 'supported'; });
    function labels(items) { return items.map(function (item) { return escape(item.label || item.key); }).join(', ') || 'None'; }
    return '<section class="nbaEvidenceSummary" aria-label="Coach summary"><h3>What the salary sample supports for ' + escape(selectedGroup.toLowerCase()) + '</h3>'
      + (!positive.length && !negative.length ? '<p class="nbaEvidenceLead">No individual association in this position group met the 0.05 threshold after correcting the 36 tests. Estimates remain uncertain; this does not establish no association.</p>' : '')
      + '<div class="nbaEvidenceSummaryGrid"><div><h4>Higher salary association</h4><p>' + labels(positive) + '</p></div><div><h4>Lower salary association</h4><p>' + labels(negative) + '</p></div><div><h4>Not supported at adjusted p ≤ 0.05</h4><p>' + unclear.length + ' of ' + estimates.length + ' inputs. Lack of support does not establish no association.</p></div></div>'
      + (suggestive.length ? '<p class="nbaModelNote"><strong>Suggestive only:</strong> ' + labels(suggestive) + '. Adjusted p is above 0.05 and at most 0.10; these results do not meet the main decision rule.</p>' : '')
      + '<p class="nbaModelNote">These are conditional associations with 2022–23 NBA salary, holding the other included statistics, age, and shooting-availability controls fixed. They do not identify what causes pay or prove NCAA value.</p></section>';
  }
  function evidenceForest(evidence, estimates) {
    var all = groups.reduce(function (items, group) { return items.concat(evidenceEstimates(evidence.groups && evidence.groups[group])); }, []);
    var limits = all.reduce(function (items, estimate) { return items.concat([number(estimate.logEffectCiLow), number(estimate.logEffectCiHigh)].filter(function (v) { return v !== null; })); }, [0]);
    var minimum = Math.min.apply(null, limits), maximum = Math.max.apply(null, limits);
    var padding = Math.max(0.03, (maximum - minimum) * 0.07);
    minimum -= padding; maximum += padding;
    var left = 275, right = 775, top = 42, rowHeight = 42, bottom = top + estimates.length * rowHeight;
    function x(value) { return left + (value - minimum) / (maximum - minimum) * (right - left); }
    var ticks = [minimum, minimum / 2, 0, maximum / 2, maximum];
    var axis = ticks.map(function (tick) { return '<line class="nbaEvidenceGrid" x1="' + x(tick).toFixed(1) + '" x2="' + x(tick).toFixed(1) + '" y1="25" y2="' + bottom + '"/><text class="nbaEvidenceTick" x="' + x(tick).toFixed(1) + '" y="' + (bottom + 23) + '" text-anchor="middle">' + escape(association(Math.expm1(tick) * 100)) + '</text>'; }).join('');
    var marks = estimates.map(function (estimate, index) {
      var y = top + index * rowHeight, low = number(estimate.logEffectCiLow), high = number(estimate.logEffectCiHigh), effect = number(estimate.logEffect);
      var label = '<text class="nbaEvidenceStat" x="12" y="' + (y - 2) + '">' + escape(estimate.label || estimate.key) + '</text><text class="nbaEvidenceIncrement" x="12" y="' + (y + 13) + '">' + escape(estimate.incrementLabel || '') + '</text>';
      if (low === null || high === null || effect === null) return label;
      return '<g data-evidence-mark="' + escape(estimate.key) + '" data-evidence-status="' + escape(estimate.status || 'uncertain') + '">' + label
        + '<line class="nbaEvidenceInterval" x1="' + x(low).toFixed(1) + '" x2="' + x(high).toFixed(1) + '" y1="' + y + '" y2="' + y + '"/>'
        + '<line class="nbaEvidenceInterval" x1="' + x(low).toFixed(1) + '" x2="' + x(low).toFixed(1) + '" y1="' + (y - 4) + '" y2="' + (y + 4) + '"/>'
        + '<line class="nbaEvidenceInterval" x1="' + x(high).toFixed(1) + '" x2="' + x(high).toFixed(1) + '" y1="' + (y - 4) + '" y2="' + (y + 4) + '"/>'
        + '<circle class="nbaEvidencePoint" cx="' + x(effect).toFixed(1) + '" cy="' + y + '" r="4.5"/>'
        + '<text class="nbaEvidenceEstimate" x="795" y="' + (y + 4) + '">' + escape(association(estimate.associationPct)) + '</text></g>';
    }).join('');
    return '<h3 class="nbaModelSectionTitle">Estimated salary association per stated increment</h3><p class="nbaModelNote">Dots are estimates; whiskers are pointwise 95% intervals. Filled dots meet the fixed Holm-adjusted 0.05 rule. Open dots do not, even when an interval excludes zero. Each stat uses its stated increment, so this is not an importance ranking.</p>'
      + '<div class="nbaModelTableWrap nbaEvidenceForestWrap" tabindex="0" role="region" aria-label="Salary association interval chart"><svg class="nbaEvidenceForest" viewBox="0 0 905 ' + (bottom + 54) + '" role="img" aria-labelledby="nbaEvidenceForestTitle nbaEvidenceForestDescription"><title id="nbaEvidenceForestTitle">' + escape(selectedGroup) + ' salary associations and pointwise 95% intervals</title><desc id="nbaEvidenceForestDescription">All twelve statistics in natural increments. The complete estimates, intervals, sample sizes and adjusted decisions are in the table below. The vertical zero line means no salary association.</desc>'
      + axis + '<line class="nbaEvidenceZero" x1="' + x(0).toFixed(1) + '" x2="' + x(0).toFixed(1) + '" y1="25" y2="' + bottom + '"/>' + marks
      + '<text class="nbaEvidenceTick" x="525" y="' + (bottom + 47) + '" text-anchor="middle">Salary association · multiplicative scale</text></svg></div>'
      + '<p class="nbaModelNote">Positions share the same horizontal scale. Equal spacing represents equal changes in log salary; tick labels show percentage changes in the salary multiplier. Exact pointwise intervals follow.</p>';
  }
  function evidenceTable(estimates) {
    return '<div class="nbaModelTableWrap" tabindex="0" role="region" aria-label="Salary evidence estimates"><table class="nbaModelTable nbaEvidenceTable"><caption>Primary explanatory OLS regression with HC3 robust standard errors. β is the log-salary coefficient rescaled to the stated increment; salary association = 100 × (exp(β) − 1). The 36 stat-by-position tests share one Holm correction. Intervals are pointwise 95%, not adjusted simultaneous intervals. N is observed input values / players in that position model.</caption><thead><tr><th scope="col">Stat / increment</th><th scope="col">Salary association / coefficient</th><th scope="col">Pointwise 95% interval</th><th scope="col">Raw p</th><th scope="col">Holm p · 36 tests</th><th scope="col">Observed / model N</th><th scope="col">Fixed 0.05 decision</th></tr></thead><tbody>'
      + estimates.map(function (estimate) { return '<tr' + (estimate.key === 'Height' ? ' class="nbaHeightRow"' : '') + '><th scope="row">' + escape(estimate.label || estimate.key) + '<span class="nbaModelFeatureNote">' + escape(estimate.incrementLabel) + '</span></th><td><strong>' + escape(association(estimate.associationPct)) + '</strong><span class="nbaModelFeatureNote">β = ' + escape(signed(estimate.logEffect, 4)) + ' log salary</span></td><td>' + escape(associationInterval(estimate)) + '</td><td>' + pHtml(estimate.pRaw) + '</td><td>' + pHtml(estimate.pHolm) + '</td><td>' + escape(fixed(estimate.nObserved, 0)) + ' / ' + escape(fixed(estimate.n, 0)) + '</td><td>' + decisionBadge(estimate, false) + '</td></tr>'; }).join('')
      + '</tbody></table></div>';
  }
  function comparisonsHtml(evidence) {
    var comparisons = evidence.comparisons || {};
    var omnibus = comparisons.omnibus || [], pairs = comparisons.pairwise || [];
    if (!omnibus.length && !pairs.length) return '';
    var keys = omnibus.length ? omnibus : pairs.filter(function (item, index) { return pairs.findIndex(function (other) { return other.key === item.key; }) === index; });
    if (!keys.some(function (item) { return item.key === comparisonStat; })) comparisonStat = keys[0].key;
    var selectedPairs = pairs.filter(function (item) { return item.key === comparisonStat; });
    return '<details class="nbaModelSubdetails nbaEvidenceComparisons"><summary>Do salary associations differ by position?</summary><p class="nbaModelNote">A supported result in one position and an uncertain result in another does not establish a difference. These tests directly compare slopes in the same raw stat units.</p>'
      + '<div class="nbaModelTableWrap" tabindex="0" role="region" aria-label="Direct overall position comparisons"><table class="nbaModelTable"><caption>Overall tests ask whether the stat\u2019s salary association differs anywhere across the three positions. Holm correction covers these 12 overall tests as a separate family.</caption><thead><tr><th scope="col">Stat</th><th scope="col">Raw p</th><th scope="col">Holm p · 12 tests</th><th scope="col">Fixed 0.05 decision</th></tr></thead><tbody>'
      + omnibus.map(function (item) { return '<tr><th scope="row">' + escape(item.label || item.key) + '</th><td>' + pHtml(item.pRaw) + '</td><td>' + pHtml(item.pHolm) + '</td><td>' + decisionBadge(item, true) + '</td></tr>'; }).join('') + '</tbody></table></div>'
      + '<div class="nbaEvidenceComparisonControl"><label for="nbaEvidenceComparisonStat">Compare a stat directly</label><select id="nbaEvidenceComparisonStat">' + keys.map(function (item) { return '<option value="' + escape(item.key) + '"' + (item.key === comparisonStat ? ' selected' : '') + '>' + escape(item.label || item.key) + '</option>'; }).join('') + '</select></div>'
      + '<div class="nbaModelTableWrap" tabindex="0" role="region" aria-label="Direct pairwise position comparisons"><table class="nbaModelTable nbaEvidenceTable"><caption>For the stated increment, this compares the salary multiplier in the first position with the second: exp((slope A − slope B) × increment) − 1. It is not a difference in salary levels. All 36 pairwise tests share a separate Holm correction; intervals remain pointwise 95%.</caption><thead><tr><th scope="col">Position comparison / increment</th><th scope="col">Relative association</th><th scope="col">Pointwise 95% interval</th><th scope="col">Raw p</th><th scope="col">Holm p · 36 pairs</th><th scope="col">Fixed 0.05 decision</th></tr></thead><tbody>'
      + selectedPairs.map(function (item) { return '<tr><th scope="row">' + escape(item.groupA) + ' versus ' + escape(item.groupB) + '<span class="nbaModelFeatureNote">' + escape(item.incrementLabel) + '</span></th><td>' + escape(association(item.associationPct)) + '<span class="nbaModelFeatureNote">Δβ = ' + escape(signed(item.logEffect, 4)) + '</span></td><td>' + escape(associationInterval(item)) + '</td><td>' + pHtml(item.pRaw) + '</td><td>' + pHtml(item.pHolm) + '</td><td>' + decisionBadge(item, true) + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
  }
  function sensitivityChanges(primary, sensitivity) {
    var compared = 0, changed = 0;
    evidenceEstimates(sensitivity).forEach(function (item) {
      var original = primary.find(function (estimate) { return estimate.key === item.key; });
      var before = number(original && original.coefficientRaw), after = number(item.coefficientRaw);
      if (before === null || after === null) return;
      compared++; if (Math.sign(before) !== Math.sign(after)) changed++;
    });
    return { compared: compared, changed: changed };
  }
  function robustnessHtml(group) {
    var diagnostics = group.diagnostics || {}, sensitivities = group.sensitivities || [];
    var primary = evidenceEstimates(group);
    return '<details class="nbaModelSubdetails nbaEvidenceRobustness"><summary>Robustness checks and sample exclusions · ' + escape(selectedGroup) + '</summary><p class="nbaModelNote">These checks show how the fit changes under other samples or specifications. They are descriptive sensitivity analyses, not extra opportunities to declare a supported result. The main 36-test decision stays fixed.</p>'
      + '<dl class="nbaModelMetrics">' + metric('Largest VIF', fixed(diagnostics.maxVif, 1)) + metric('High leverage · primary', fixed(diagnostics.highLeverageCount, 0)) + metric('High Cook\u2019s distance · primary', fixed(diagnostics.highCooksCount, 0)) + metric('Excluded from primary', fixed(group.nExcluded, 0)) + '</dl>'
      + '<p class="nbaModelNote">VIF describes overlap among model inputs; larger values make individual associations harder to separate. Leverage and Cook\u2019s distance flag unusual inputs or influential records, not mistakes. Current cutoffs: leverage ' + escape(fixed(diagnostics.highLeverageThreshold, 4)) + '; Cook\u2019s distance ' + escape(fixed(diagnostics.cooksThreshold, 4)) + '. Maximum leverage: ' + escape(fixed(diagnostics.maxLeverage, 4)) + '. Standardized design condition number: ' + escape(fixed(diagnostics.standardizedConditionNumber, 1)) + '.</p>'
      + (sensitivities.length ? '<div class="nbaModelTableWrap" tabindex="0" role="region" aria-label="Salary evidence sensitivity checks"><table class="nbaModelTable nbaEvidenceSensitivity"><caption>Direction changes count signs of shared raw-unit coefficients versus the primary fit. They do not measure statistical support. Sample exclusions can change which basketball roles are represented, especially centers without observed three-point accuracy.</caption><thead><tr><th scope="col">Descriptive check</th><th scope="col">Model N / input N</th><th scope="col">Directions changed / compared</th><th scope="col">High leverage / high Cook\u2019s distance</th><th scope="col">Availability</th></tr></thead><tbody>'
        + sensitivities.map(function (item) { var changes = sensitivityChanges(primary, item), d = item.diagnostics || {}; return '<tr><th scope="row">' + escape(item.label || item.id) + '<span class="nbaModelFeatureNote">' + escape(typeof item.specification === 'string' ? item.specification : '') + '</span></th><td>' + escape(fixed(item.n, 0)) + ' / ' + escape(fixed(item.nInput, 0)) + '</td><td>' + (item.available === false ? '\u2014' : changes.changed + ' / ' + changes.compared) + '</td><td>' + escape(fixed(d.highLeverageCount, 0)) + ' / ' + escape(fixed(d.highCooksCount, 0)) + '</td><td>' + (item.available === false ? '<strong>Not estimable</strong><span class="nbaModelFeatureNote">' + escape(item.reason || 'Valid inference is unavailable.') + '</span>' : 'Descriptive only') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="nbaModelNote">Sensitivity fits are unavailable in this snapshot.</p>')
      + '<p class="nbaModelNote" style="margin-top:10px">The coefficient CSV includes each available sensitivity fit, with no Holm decision assigned to those descriptive results. The checks download includes model diagnostics and exclusion records, without individual salary amounts.</p><button type="button" class="secondary nbaEvidenceChecksDownload" data-nba-checks-download>Download checks and exclusion audit</button></details>';
  }
  function evidenceHtml(evidence) {
    if (!evidence || !evidence.groups) return '<p class="nbaModelNote">The coach summary is unavailable in this snapshot. Prediction weights remain available in the adjacent view.</p>';
    var total = groups.reduce(function (sum, name) { return sum + (number(evidence.groups[name] && evidence.groups[name].n) || 0); }, 0);
    var height = evidenceEstimates(evidence.groups.Bigs).find(function (item) { return item.key === 'Height'; });
    var example = height ? '<section class="nbaCoachExample"><h4>One example: height among bigs</h4><p>An extra inch was associated with an estimated <strong>' + escape(association(height.associationPct)) + '</strong> salary difference. The 95% uncertainty range was <strong>' + escape(associationInterval(height)) + '</strong>.</p><p>The range includes zero, so the direction remains uncertain. This does not justify a height premium on a college offer.</p></section>' : '';
    return '<section class="nbaCoachSummary" aria-label="Coach summary"><div class="nbaCoachHeading"><h3>The finding in plain language</h3><a class="nbaCoachBrief" href="output/pdf/nba-salary-coach-brief.pdf?v=coach-brief-20260914" download>Download 1-page brief (PDF)</a></div>'
      + '<p class="nbaCoachFinding">In this NBA sample, no single stat met our evidence threshold after accounting for the other recorded inputs and checking all 36 associations. This does not mean those skills lack basketball value.</p>'
      + '<p class="nbaCoachSample">' + escape(evidence.season || '2022–23') + ' NBA analysis · <strong>' + total + ' players</strong>: ' + groups.map(function (name) { return escape(fixed(evidence.groups[name] && evidence.groups[name].n, 0)) + ' ' + name.toLowerCase(); }).join(' · ') + '</p>'
      + '<div class="nbaCoachGuidance"><div><h4>Use it to start a scouting discussion</h4><p>Use model estimates alongside film, role, fit, availability, and market information. College dollar estimates come from the separate prediction model and your pay settings.</p></div><div><h4>Keep confidence in perspective</h4><p>Individual salary associations remain uncertain. The NBA-to-college application has not been validated for MBB or WBB. Check the full player and your budget before setting an offer.</p></div></div>'
      + example + '</section><details id="nbaEvidenceDetails" class="nbaModelSubdetails nbaFullStatisticalDetails"><summary>Full statistical details</summary><div class="nbaFullStatisticalBody">' + statisticalDetailsHtml(evidence) + '</div></details>';
  }
  function statisticalDetailsHtml(evidence) {
    if (!evidence || !evidence.groups) return '<p class="nbaModelNote">Salary evidence is unavailable in this snapshot. Prediction weights remain available in the adjacent view.</p>';
    var group = evidence.groups[selectedGroup];
    if (!group) return '<p class="nbaModelNote">Salary evidence is unavailable for this position.</p>';
    var estimates = evidenceEstimates(group), protocol = evidence.protocol || {};
    var total = groups.reduce(function (sum, name) { return sum + (number(evidence.groups[name] && evidence.groups[name].n) || 0); }, 0);
    var notes = [protocol.primarySample, protocol.missingPercentageHandling, protocol.excludedRowReason, protocol.pointwiseInterval, protocol.exploratoryDisclosure, protocol.positionComparison].filter(function (note) { return typeof note === 'string' && note; });
    return '<div class="nbaEvidenceHeading"><div><h3>Which statistics are associated with NBA salary?</h3><p class="nbaModelNote">Explanatory salary evidence · ' + escape(evidence.season || '2022–23') + '. This separate analysis does not change player dollar quotes.</p></div><button type="button" class="secondary" data-nba-evidence-download>Download evidence CSV</button></div>'
      + '<dl class="nbaModelMetrics">' + metric('NBA players · ' + selectedGroup, fixed(group.n, 0)) + metric('NBA analysis sample', String(total)) + metric('Main decision', 'Holm p ≤ 0.05') + '</dl>'
      + evidenceSummary(group)
      + '<div class="nbaModelNotice">Exploratory evidence: this workbook was inspected before this analysis was specified. Adjustment for 36 tests does not erase that prior exploration, omitted variables, or contract timing. Salary associations are not causal effects or proof of NCAA pay, including WBB.</div>'
      + evidenceForest(evidence, estimates) + evidenceTable(estimates)
      + '<p class="nbaModelNote" style="margin-top:10px">Shooting percentages with unavailable accuracy are handled by separate availability controls. Their slopes describe observed accuracy. A positive estimate means a higher salary association for the stated increase; a negative estimate means a lower association, conditional on the other inputs.</p>'
      + comparisonsHtml(evidence) + robustnessHtml(group)
      + '<details class="nbaModelSubdetails"><summary>How to read the evidence and prediction weights</summary><div class="nbaEvidenceDefinitions"><div><h4>Estimate versus contribution</h4><p>An evidence estimate describes the fitted salary association for a stated stat increment in an NBA position group. A player contribution uses a separate ridge prediction weight multiplied by that player\u2019s standardized NCAA stat. Neither number is an importance percentage.</p></div><div><h4>Interval versus decision</h4><p>A pointwise 95% interval shows uncertainty for one fitted association under this model. It is not a 95% probability that the true association lies inside. The supported label uses the Holm-adjusted p-value across the full 36-test primary family, so an interval may exclude zero while the adjusted result stays unsupported.</p></div><div><h4>What a p-value says</h4><p>A p-value measures how incompatible the observed estimate is with a zero-association model, under its assumptions. It does not measure the chance that a finding is true, the size of an effect, or its value to a college program. The 0.05 rule stays fixed; a Holm-adjusted p above 0.05 and at most 0.10 is suggestive only.</p></div><div><h4>Why the models differ</h4><p>Evidence uses an explanatory OLS model with HC3 robust standard errors. Prediction weights use ridge regression and held-out validation. Ridge shrinks correlated inputs to aid prediction; its bootstrap intervals and positive-run percentages are not these OLS p-values. College prices still use the prediction model and existing pay assumptions.</p></div></div>'
      + '<p class="nbaModelNote"><strong>Basketball interpretation:</strong> the three-point accuracy coefficient asks whether accuracy adds a salary association among players with otherwise comparable measured minutes, points, and other production. It does not capture all basketball value of shooting, which can work through points or minutes. Controlling those same inputs also holds part of height\u2019s role impact fixed. No supported individual coefficient does not mean those skills lack basketball value.</p>'
      + (notes.length ? '<ul class="nbaEvidenceNotes">' + notes.map(function (note) { return '<li>' + escape(note) + '</li>'; }).join('') + '</ul>' : '')
      + (Array.isArray(evidence.limitations) && evidence.limitations.length ? '<h4 class="nbaModelSectionTitle">Scope and limitations</h4><ul class="nbaEvidenceNotes">' + evidence.limitations.filter(function (item) { return typeof item === 'string'; }).map(function (item) { return '<li>' + escape(item) + '</li>'; }).join('') + '</ul>' : '') + '</details>'
      + '<p class="nbaModelNote" style="margin-top:14px">Aggregate analysis: ' + escape(evidence.id) + ' · generated ' + escape(evidence.generatedAt) + '. Download contains aggregate estimates and direct comparisons, not individual salary records. <a href="docs/nba-salary-evidence-method.md" download>Download full methodology</a>.</p>';
  }
  function evidenceCsv(evidence) {
    var header = ['Analysis ID', 'Season', 'Family', 'Group A', 'Group B', 'Stat', 'Raw unit', 'Coefficient per raw unit', 'HC3 SE per raw unit', 'Pointwise 95% raw CI low', 'Pointwise 95% raw CI high', 'Increment', 'Increment label', 'Model N', 'Observed N', 'Log effect', 'Pointwise 95% log CI low', 'Pointwise 95% log CI high', 'Salary association percent', 'Pointwise 95% percent CI low', 'Pointwise 95% percent CI high', 'Raw p', 'Holm adjusted p', 'Decision at 0.05', 'Correction family size', 'Interpretation'];
    var rows = [header];
    function push(item, family, a, b, size, meaning) { rows.push([evidence.id, evidence.season, family, a, b || '', item.key, item.unit, item.coefficientRaw === undefined ? item.differenceRaw : item.coefficientRaw, item.seRaw, item.ciLowRaw, item.ciHighRaw, item.increment, item.incrementLabel, item.n, item.nObserved, item.logEffect, item.logEffectCiLow, item.logEffectCiHigh, item.associationPct, item.associationPctCiLow, item.associationPctCiHigh, item.pRaw, item.pHolm, item.status, size, meaning]); }
    groups.forEach(function (name) {
      var group = evidence.groups && evidence.groups[name];
      evidenceEstimates(group).forEach(function (item) { push(item, 'Primary OLS HC3', name, '', 36, 'Conditional salary association; exploratory; not causal or NCAA pay evidence. Pointwise intervals; Holm decision.'); });
      (group && group.sensitivities || []).forEach(function (sensitivity) {
        if (sensitivity.available === false) return;
        evidenceEstimates(sensitivity).forEach(function (item) { push(item, 'Descriptive sensitivity: ' + (sensitivity.label || sensitivity.id), name, '', '', 'Sensitivity only; no adjusted primary decision. ' + (typeof sensitivity.specification === 'string' ? sensitivity.specification : '')); });
      });
    });
    ((evidence.comparisons || {}).omnibus || []).forEach(function (item) { push(item, 'Overall position comparison', 'All positions', '', 12, 'Direct test of equal slopes across all positions; separate Holm family.'); });
    ((evidence.comparisons || {}).pairwise || []).forEach(function (item) { push(item, 'Pairwise position comparison', item.groupA, item.groupB, 36, 'Ratio of multiplicative salary associations; not salary-level difference; separate Holm family.'); });
    return rows.map(function (row) { return row.map(function (value) { var str = value === null || value === undefined ? '' : String(value); if (typeof value === 'string' && /^[=+\-@]/.test(str)) str = "'" + str; return '"' + str.replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
  }
  function downloadEvidence() {
    var evidence = evidenceApi();
    if (!canView() || !evidence || !evidence.groups) return;
    var url = URL.createObjectURL(new Blob(['\ufeff' + evidenceCsv(evidence)], { type: 'text/csv;charset=utf-8' }));
    var link = document.createElement('a'); link.href = url; link.download = 'nba-salary-evidence-' + (evidence.season || '2022-23') + '.csv';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function downloadChecks() {
    var evidence = evidenceApi();
    if (!canView() || !evidence || !evidence.groups) return;
    function diagnosticsOnly(value) {
      var result = {};
      Object.keys(value || {}).forEach(function (key) { if (typeof value[key] === 'number' || typeof value[key] === 'string' || typeof value[key] === 'boolean' || value[key] === null) result[key] = value[key]; });
      return result;
    }
    function exclusionsOnly(items) { return (Array.isArray(items) ? items : []).map(function (item) { return { player: item.player, group: item.group, missing: item.missing || [], reason: item.reason }; }); }
    var report = { id: evidence.id, season: evidence.season, generatedAt: evidence.generatedAt, protocol: evidence.protocol, limitations: evidence.limitations, groups: {} };
    groups.forEach(function (name) {
      var group = evidence.groups[name] || {}, attrition = group.attrition || {};
      report.groups[name] = { nInput: group.nInput, n: group.n, nExcluded: group.nExcluded, diagnostics: diagnosticsOnly(group.diagnostics), excluded: exclusionsOnly(attrition.excluded), missingByFeatureInInput: attrition.missingByFeatureInInput, unavailablePercentageCountsInPrimary: attrition.unavailablePercentageCountsInPrimary, sensitivities: (group.sensitivities || []).map(function (item) { return { id: item.id, label: item.label, nInput: item.nInput, n: item.n, specification: item.specification, descriptiveOnly: true, available: item.available, reason: item.reason, directionChanges: sensitivityChanges(evidenceEstimates(group), item), diagnostics: diagnosticsOnly(item.diagnostics), excluded: exclusionsOnly(item.excluded) }; }) };
    });
    var url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    var link = document.createElement('a'); link.href = url; link.download = 'nba-salary-evidence-checks-' + (evidence.season || '2022-23') + '.json';
    document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function renderModel() {
    var runtime = api();
    var model = runtime && runtime.getModel ? runtime.getModel() : null;
    var evidence = evidenceApi();
    var controls = element('nbaModelControls');
    var content = element('nbaModelContent');
    var status = element('nbaModelStatus');
    if (!content) return;
    if (status) status.textContent = selectedView === 'evidence' ? 'Coach summary' : !model ? 'Model unavailable' : enabled() ? 'Active prediction weights' : 'Reference · custom weights active';
    if (!canView()) {
      if (controls) controls.hidden = true;
      content.innerHTML = lockedHtml();
      return;
    }
    if (controls) controls.hidden = !model && !evidence;
    document.querySelectorAll('[data-nba-view]').forEach(function (button) { button.setAttribute('aria-pressed', String(button.getAttribute('data-nba-view') === selectedView)); });
    if (selectedView === 'evidence') {
      var previousDetails = element('nbaEvidenceDetails');
      var detailsOpen = !!(previousDetails && previousDetails.open);
      content.innerHTML = evidenceHtml(evidence);
      var nextDetails = element('nbaEvidenceDetails');
      if (nextDetails) nextDetails.open = detailsOpen;
      return;
    }
    if (!model) {
      content.innerHTML = '<p class="nbaModelNote">The NBA salary model is not available yet. Its coefficients and validation results will appear here when loaded.</p>';
      return;
    }
    var group = model.groups && model.groups[selectedGroup];
    if (!group) { content.innerHTML = '<p class="nbaModelNote">This model snapshot has no ' + escape(selectedGroup.toLowerCase()) + ' fit.</p>'; return; }
    var total = groups.reduce(function (sum, name) { return sum + (number(model.groups && model.groups[name] && model.groups[name].n) || 0); }, 0);
    content.innerHTML = '<p class="nbaModelNote"><strong>Prediction weights · ridge regression.</strong> These weights drive the existing college valuation signal. Their bootstrap intervals describe prediction-weight stability; the Salary evidence view uses a separate explanatory regression and adjusted statistical tests.</p>'
      + '<p class="nbaModelNote"><strong>' + escape(model.season || '2022–23') + ' NBA salary reference.</strong> Separate age-adjusted fits for Guards, Wings, and Bigs. Age is held neutral when applying these coefficients to college players.</p>'
      + '<dl class="nbaModelMetrics">' + metric('NBA players · ' + selectedGroup, fixed(group.n, 0)) + metric('NBA reference sample', total ? String(total) : '\u2014')
      + metric('Model inputs', String((group.features || []).filter(function (feature) { return feature.key !== 'Age'; }).length)) + '</dl>'
      + '<div class="nbaModelNotice">College pay uses the learned associations and your editable NCAA pay anchors. The model does not assign NBA salaries to NCAA players; this transfer remains unvalidated.</div>'
      + heightHtml(model, group) + '<h3 class="nbaModelSectionTitle">Learned coefficients</h3>' + coefficientHtml(group)
      + validationHtml(model, group) + treeHtml(group)
      + '<h3 class="nbaModelSectionTitle">How college players are evaluated</h3><p class="nbaModelNote">Each input is standardized against the same NCAA league and position group, then capped at ±3 standard deviations. Missing inputs contribute zero. The weighted signal is calibrated to pay at the cohort mean signal and the star-pay anchor; conference context adjusts dollars separately. Pay at the mean signal is not the arithmetic average of all player quotes. Minutes are an input, so no additional minutes multiplier is applied. Existing translation-risk and manual scouting adjustments then affect the final bid as separate college assumptions.</p>'
      + '<code class="nbaModelEquation">College signal = Σ(NBA coefficient × college peer z-score)</code>'
      + '<p class="nbaModelNote">Source: ' + escape((model.sources || []).filter(function (source) { return source.type === 'userWorkbook'; }).map(function (source) { return source.file; }).join(', ') || 'Supplied NBA salary workbook')
      + '. Model: ' + escape(model.id || 'unversioned') + '.</p>';
  }

  function renderProfile(row) {
    var panel = element('mNbaValuationPanel');
    var content = element('mNbaValuationContent');
    if (!panel || !content) return;
    panel.hidden = !row || !row.NBAModel_calc || !enabled();
    var shortcut = element('mNbaCoachShortcut');
    if (shortcut) {
      shortcut.hidden = panel.hidden || !canView();
      shortcut.innerHTML = shortcut.hidden ? '' : '<p>What does the NBA model mean for scouting?</p><button type="button" data-nba-coach-summary="' + escape(row.NBAPosition_calc || row.Position || selectedGroup) + '">View coach summary</button>';
    }
    if (panel.hidden) { content.innerHTML = ''; return; }
    var status = element('mNbaValuationStatus');
    if (status) status.textContent = (row._league || '') + ' ' + (row.NBAPosition_calc || row.Position || '') + ' peers';
    if (!canView()) { content.innerHTML = lockedHtml(); return; }
    var contributions = Array.isArray(row.NBAContributions_calc) ? row.NBAContributions_calc.slice() : [];
    contributions.sort(function (a, b) { return Math.abs(number(b.contribution) || 0) - Math.abs(number(a.contribution) || 0); });
    var maximum = Math.max.apply(null, contributions.map(function (item) { return Math.abs(number(item.contribution) || 0); }).concat([0]));
    var calibration = row.NBACalibration_calc || {};
    var missing = Array.isArray(row.NBAMissing_calc) ? row.NBAMissing_calc : [];
    function adjustment(value, label) { return number(value) === null ? label || 'not recorded' : signed(number(value) * 100, 1) + '%'; }
    function step(label, value) { return '<div><dt>' + escape(label) + '</dt><dd>' + escape(money(value)) + '</dd></div>'; }
    content.innerHTML = '<p class="nbaModelNote">These factors raised or lowered this player’s model signal. They are not separate pay bonuses. Each contribution combines a prediction weight with the player’s stat relative to their NCAA peers.</p>'
      + (row.NBAStatus_calc && !['Calculated', 'Some inputs unavailable'].includes(row.NBAStatus_calc) ? '<div class="nbaModelNotice">' + escape(row.NBAStatus_calc) + ': no college pay quote is available from this model.</div>' : '')
      + '<dl class="nbaModelMetrics">' + metric('College peer signal', signed(row.NBAScore_calc)) + metric('Inputs available', pct(row.NBACoverage_calc))
      + metric('Before conference / bounds', money(row.NBABaseValue_calc)) + metric('Conference factor', fixed(row.NBAConferenceMultiplier_calc, 2) + '×') + '</dl>'
      + (contributions.length ? '<div class="nbaModelTableWrap" tabindex="0" role="region" aria-label="Player NBA model contributions"><table class="nbaModelTable"><caption>One row per input. Peer z-score is capped at ±3. Missing values contribute zero rather than an invented measurement.</caption><thead><tr><th scope="col">Input</th><th scope="col">Player value</th><th scope="col">Peer z-score</th><th scope="col">Contribution</th></tr></thead><tbody>'
        + contributions.map(function (item) {
          var note = item.missing ? 'Unavailable · neutral contribution' : item.clipped ? 'Peer deviation capped at ±3 SD' : '';
          return '<tr' + (item.key === 'Height' ? ' class="nbaHeightRow"' : '') + '><td><strong>' + escape(item.label || item.key) + '</strong>'
            + (note ? '<span class="nbaModelFeatureNote">' + escape(note) + '</span>' : '') + '</td><td>' + escape(item.missing ? '\u2014' : stat(item.value, item.key))
            + '</td><td>' + escape(item.missing ? 'Neutral (0)' : signed(item.z, 2)) + '</td><td>' + effect(item.contribution, maximum) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="nbaModelNote">Contribution details are unavailable for this player.</p>')
      + (missing.length ? '<p class="nbaModelNote" style="margin-top:10px"><strong>Missing inputs:</strong> ' + escape(missing.join(', ')) + '. These inputs were set to the peer mean for this estimate.</p>' : '')
      + '<h3 class="nbaModelSectionTitle">From model signal to final bid</h3><dl class="nbaReconciliation">'
      + step('Before conference / pay bounds', row.NBABaseValue_calc)
      + step('After conference factor and pay bounds', row.ActualValuationCurve_calc)
      + step('After translation adjustment (' + adjustment(row.TranslationRiskPct_calc, row.TranslationRiskLabel_calc) + ')', row.ActualValuationBase_calc)
      + step('Final bid · after manual scouting (' + adjustment(row.ScoutAdjustmentPct_calc, row.ScoutAdjustmentLabel_calc) + ')', row.ActualValuation_calc) + '</dl>'
      + '<p class="nbaModelNote">Translation risk and manual scouting are separate college assumptions; they are not NBA salary coefficients. Pay bounds can limit each adjustment.</p>'
      + '<p class="nbaModelNote" style="margin-top:10px">The cohort mean signal is priced at ' + escape(money(calibration.avgPay)) + ', with star pay anchored at ' + escape(money(calibration.starValue))
      + '. This mean-signal anchor is not the arithmetic average of all quotes. Age stays neutral, and minutes are not applied a second time. Production and fit scores remain separate. The NBA-to-NCAA transfer has not been validated, including for WBB.</p>';
  }

  function bind() {
    var selector = element('nbaModelGroup');
    if (selector && !selector._nbaBound) {
      selector._nbaBound = true;
      selector.addEventListener('change', function () { if (groups.includes(selector.value)) { selectedGroup = selector.value; renderModel(); } });
    }
    var basis = element('nbaValuationBasis');
    if (basis && !basis._nbaBound) {
      basis._nbaBound = true;
      basis.addEventListener('change', function () {
        if (!canView()) { render(); return; }
        var runtime = api();
        if (runtime && runtime.setEnabled) runtime.setEnabled(basis.value === 'nba');
        render();
      });
    }
    ['nbaValuationPanel', 'mNbaValuationPanel', 'mNbaCoachShortcut'].forEach(function (id) {
      var panel = element(id);
      if (panel && !panel._nbaBound) {
        panel._nbaBound = true;
        panel.addEventListener('click', function (event) {
          var coachButton = event.target.closest && event.target.closest('[data-nba-coach-summary]');
          if (coachButton) { openCoachSummary(coachButton.getAttribute('data-nba-coach-summary')); return; }
          var viewButton = event.target.closest && event.target.closest('[data-nba-view]');
          if (viewButton && canView()) {
            var view = viewButton.getAttribute('data-nba-view');
            if (view === 'evidence' || view === 'prediction') { selectedView = view; renderModel(); }
          }
          if (event.target.closest && event.target.closest('[data-nba-evidence-download]') && canView()) downloadEvidence();
          if (event.target.closest && event.target.closest('[data-nba-checks-download]') && canView()) downloadChecks();
          if (event.target.closest && event.target.closest('[data-nba-staff-login]') && typeof authPromptUpgrade === 'function') authPromptUpgrade('Log in with an approved staff account to inspect the NBA salary model and player contributions.');
        });
        panel.addEventListener('change', function (event) {
          if (event.target.id !== 'nbaEvidenceComparisonStat' || !canView()) return;
          comparisonStat = event.target.value;
          renderModel();
          var details = panel.querySelector('.nbaEvidenceComparisons');
          if (details) details.open = true;
          var field = element('nbaEvidenceComparisonStat');
          if (field) field.focus({ preventScroll: true });
        });
      }
    });
  }

  function openCoachSummary(group) {
    if (typeof closeProfile === 'function') closeProfile();
    if (typeof showDashboardPage === 'function') showDashboardPage('pagePlayers', 'pagePlayers', { forcePage: true, skipHeavyLoad: true });
    else {
      var navigation = document.querySelector('.pageNavBtn[data-page="pagePlayers"]');
      if (navigation) navigation.click();
    }
    selectedView = 'evidence';
    if (groups.includes(group)) selectedGroup = group;
    lastBoardGroup = typeof pos !== 'undefined' && groups.includes(pos) ? pos : '';
    var details = element('nbaEvidenceDetails');
    if (details) details.open = false;
    render();
    var panel = element('nbaValuationPanel');
    if (!panel) return false;
    panel.open = true;
    var summary = panel.querySelector('summary');
    if (summary) summary.focus({ preventScroll: true });
    panel.scrollIntoView({ block: 'start' });
    return true;
  }

  function render() {
    bind();
    var boardGroup = typeof pos !== 'undefined' && groups.includes(pos) ? pos : '';
    if (boardGroup && boardGroup !== lastBoardGroup) { selectedGroup = boardGroup; lastBoardGroup = boardGroup; }
    var selector = element('nbaModelGroup');
    if (selector) selector.value = selectedGroup;
    var basis = element('nbaValuationBasis');
    var active = enabled();
    if (basis) { basis.value = active ? 'nba' : 'custom'; basis.disabled = !api() || !canView(); }
    var hint = element('nbaValuationBasisHint');
    if (hint) hint.textContent = active ? 'NBA salary associations are calibrated to your college pay anchors. College transfer performance has not been validated.' : 'Custom stat weights drive the pay curve. The NBA reference remains available on the Players board.';
    ['mpMode', 'mpPct'].forEach(function (id) { var field = element(id); if (field) field.disabled = active; });
    var minutesHint = element('nbaMinutesHint');
    if (minutesHint) minutesHint.hidden = !active;
    renderModel();
    if (typeof _currentProfilePlayer !== 'undefined' && _currentProfilePlayer) renderProfile(_currentProfilePlayer);
  }

  return { render: render, renderProfile: renderProfile, openCoachSummary: openCoachSummary };
})();
