// NBA salary-reference explanations. Native HTML; no plotting or runtime deps.
var NbaValuationUI = (function () {
  'use strict';
  var groups = ['Guards', 'Wings', 'Bigs'];
  var selectedGroup = 'Guards';
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
  function enabled() { var runtime = api(); return !!(runtime && runtime.isEnabled && runtime.isEnabled()); }
  function canView() {
    if (typeof demoCanViewSensitiveModeling === 'function') return demoCanViewSensitiveModeling();
    if (typeof authIsGuest === 'function') return !authIsGuest();
    return false;
  }
  function lockedHtml() {
    return '<div class="nbaModelLocked"><p class="nbaModelNote">NBA salary signals inform the college pay estimate. Coefficients, validation details, and player contributions are available to approved staff.</p>'
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

  function renderModel() {
    var runtime = api();
    var model = runtime && runtime.getModel ? runtime.getModel() : null;
    var controls = element('nbaModelControls');
    var content = element('nbaModelContent');
    var status = element('nbaModelStatus');
    if (!content) return;
    if (status) status.textContent = !model ? 'Model unavailable' : enabled() ? 'Active valuation basis' : 'Reference · custom weights active';
    if (!canView()) {
      if (controls) controls.hidden = true;
      content.innerHTML = lockedHtml();
      return;
    }
    if (controls) controls.hidden = !model;
    if (!model) {
      content.innerHTML = '<p class="nbaModelNote">The NBA salary model is not available yet. Its coefficients and validation results will appear here when loaded.</p>';
      return;
    }
    var group = model.groups && model.groups[selectedGroup];
    if (!group) { content.innerHTML = '<p class="nbaModelNote">This model snapshot has no ' + escape(selectedGroup.toLowerCase()) + ' fit.</p>'; return; }
    var total = groups.reduce(function (sum, name) { return sum + (number(model.groups && model.groups[name] && model.groups[name].n) || 0); }, 0);
    content.innerHTML = '<p class="nbaModelNote"><strong>' + escape(model.season || '2022–23') + ' NBA salary reference.</strong> Separate age-adjusted fits for Guards, Wings, and Bigs. Age is held neutral when applying these coefficients to college players.</p>'
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
    content.innerHTML = '<p class="nbaModelNote">Contributions explain this player’s salary-model signal relative to their NCAA peers. Positive and negative values raise or lower the signal; they are not dollar amounts.</p>'
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
    ['nbaValuationPanel', 'mNbaValuationPanel'].forEach(function (id) {
      var panel = element(id);
      if (panel && !panel._nbaBound) {
        panel._nbaBound = true;
        panel.addEventListener('click', function (event) {
          if (event.target.closest && event.target.closest('[data-nba-staff-login]') && typeof authPromptUpgrade === 'function') authPromptUpgrade('Log in with an approved staff account to inspect the NBA salary model and player contributions.');
        });
      }
    });
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

  return { render: render, renderProfile: renderProfile };
})();
