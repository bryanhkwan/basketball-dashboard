# NBA salary evidence: analysis specification

This analysis describes attributes associated with recorded 2022–23 NBA compensation. It supports the dashboard's position-level evidence view. It does not estimate the causal return to improving a skill or determine what an NCAA player should be paid. Explanatory OLS estimates and the separate ridge weights used for college valuation remain distinct. Both models screen redundant inputs separately within each position; their preprocessing and retained inputs can differ. Direct position comparisons use a separate common-specification analysis.

## Analysis status and target

This is an exploratory follow-up. The workbook, earlier ridge results, full-model OLS results, and a previous shared-feature revision were inspected before this revision. The user requested position-specific screening, and the predictor-overlap rule below was fixed before fitting these revised salary models. It uses predictor values rather than salaries, coefficient signs, or p-values. This is not a preregistered or independently confirmed study. Reusing this dataset cannot supply independent replication.

The response is the natural logarithm of the workbook's positive recorded `Salary`, without annualizing or removing low salaries in the primary analysis. Short and partial-season contracts may differ from annual salary rates. NBA positions use the existing mapping: PG/SG to Guards, SF to Wings, and PF/C to Bigs. A hybrid uses its first listed position.

The original workbook and sourced height snapshot remain unchanged. NBA heights were retrieved from current ESPN bios in September 2026, not verified historical 2022–23 measurements. The generated evidence manifest records input hashes and the software environment. Archived inputs use raw-byte hashes; Python source hashes normalize line endings to LF so the same source verifies on Windows and Unix. Each manifest entry states its hash basis.

## Primary explanatory model

Fit a separate ordinary least squares regression in each position group. Begin with the same twelve basketball candidates: height, minutes, points, rebounds, assists, steals, blocks, turnovers, effective field-goal percentage, three-point percentage, free-throw percentage, and three-point attempts per game. Include age as an adjustment variable. Select each position's retained basketball set independently using the fixed rule below. No input is selected or removed because its p-value or coefficient sign is favorable or unfavorable.

Percentage availability requires basketball-specific handling. Dropping every player without three-point accuracy would exclude many traditional centers. An unavailable percentage is not an observed 0%. For each retained three-point or free-throw percentage, center usable values around their observed position-group mean, place zero in the unavailable rows of that centered design column, and include a separate availability indicator when needed. This prevents the numerical placeholder from creating artificial correlation with the indicator. Compared with an uncentered value-plus-indicator design, this is an algebraic reparameterization: fitted values and continuous-statistic slopes are unchanged, while intercept and indicator coefficients can change. It does not assign a real accuracy measurement. Accuracy slopes apply to rows where that accuracy is usable. Availability indicators remain while their parent percentage remains; this specification does not generally cure missing-data bias or recover latent shooting skill.

Require usable core statistics, age, and effective field-goal percentage. This retains 466 players: 197 Guards, 91 Wings, and 178 Bigs. One one-game guard, Alondes Williams, has no usable eFG%. Giving that single row its own missing-eFG indicator would fit it exactly, producing leverage one and undefined HC3 uncertainty. Its exclusion is reported explicitly. A separate core-statistics sensitivity retains all 467 players.

## Fixed predictor-overlap rule

Use variance inflation factors (VIF) to measure how well each design term can be explained by the other terms. A VIF of one represents no linear overlap; the target here is VIF at most five, not zero correlation. Five is a chosen diagnostic rule of thumb, not a theorem that makes coefficients causal or statistically significant.

Calculate VIF separately within each position for every non-intercept term in the full current design, including age and applicable availability controls. Include an intercept in the underlying diagnostic calculations, but do not screen or remove it. Protect height because it is a specified research question, and protect age and required availability controls because they define the adjustment model. Within one position, remove the eligible basketball candidate with the largest VIF, rebuild that position's design, and recalculate. Break exact ties by the original feature order. Stop when every retained non-intercept term in that position meets the threshold. Repeat independently for each position: another position's predictors cannot cause a primary input to be removed. If rank, constant protected terms, or the protected adjustment set makes the rule infeasible, report that explicitly rather than silently removing controls or inventing a coefficient.

The primary OLS designs retain:

- Guards: height, rebounds, assists, steals, blocks, eFG%, 3P%, FT%, and three-point attempts per game. Removal order: minutes, points, then turnovers.
- Wings: height, assists, steals, blocks, eFG%, 3P%, FT%, and three-point attempts per game. Removal order: minutes, turnovers, points, then rebounds.
- Bigs: height, rebounds, assists, steals, blocks, eFG%, 3P%, FT%, and three-point attempts per game. Removal order: minutes, turnovers, then points.

Age and applicable availability controls remain in every OLS design. Removed inputs overlap information in that position's retained set. This does not establish that points, rebounds, playing time, or ball security are unimportant. A removed input is reported as not retained; it has no fitted evidence coefficient or p-value in that model.

Ridge regression can accommodate correlated predictors for prediction, but this revision also applies the requested overlap screen to the prediction pipeline. Predictive validation reruns imputation, position-specific VIF selection, standardization, and penalty tuning using training data only within the nested, position-stratified validation procedure. Each selector sees only its own position's training rows. Neither the final full-data mask nor another position's feature selection is supplied to held-out-fold fitting. Report retained inputs and predictive performance separately from OLS evidence. Removing inputs changes the question each remaining coefficient answers and can change NCAA valuations.

The final ridge screen retains ten basketball inputs for Guards (only minutes and points removed), eight for Wings (minutes, points, rebounds, and turnovers removed), and nine for Bigs (minutes, points, and turnovers removed). Ridge and OLS use different missing-value handling and eligibility, so their selected sets can differ even within one position. In particular, Guards' turnovers remain in ridge but have no OLS estimate or p-value. A top-level union of feature keys in generated metadata supports table rendering; each group's actual feature list defines its model and valuation inputs.

Compare predictive performance with a separately tuned full-input reference on identical outer held-out folds. The overlap screen is not assumed to improve prediction; report measured costs or benefits without changing the fixed rule after seeing performance. The independent-position models have pooled held-out log-salary R² of 0.249 for Guards, 0.425 for Wings, and 0.297 for Bigs, versus 0.268, 0.457, and 0.315 for their full-input references. Limiting overlap comes at a measured prediction cost in all three positions. Ridge bootstrap intervals hold each position's final feature mask and penalty fixed and do not include feature-selection or penalty-selection uncertainty.

## Uncertainty and comparisons

Use HC3 heteroskedasticity-robust covariance. Position-specific coefficient tests use a two-sided Student t reference with residual degrees of freedom. These are approximate model-based inferences, not exact small-sample guarantees. They treat player observations as independent; team and contract-market dependencies, model misspecification, and omitted variables remain limitations.

These OLS intervals and tests condition on the selected adjustment model. They are not a correction for the full history of inspecting and revising this analysis, or uncertainty over alternative feature sets. The predictor-only screen and unchanged correction families avoid choosing results by their significance, but the revised analysis remains exploratory.

Preserve the original primary family of 36 candidate basketball associations: twelve inputs across three positions. Apply Holm adjustment at the fixed 0.05 threshold, using internal p-value-one placeholders for untested, removed slots so selection does not shrink the correction family. Export those slots as not retained, with no p-value or confidence interval; an internal placeholder is not a statistical test result. Age and availability indicators are adjustment variables, not extra discoveries. A secondary Benjamini–Hochberg result may be exported for transparency but does not replace the primary decision. Do not change the threshold or select a correction after seeing the results.

Show raw coefficients, explicit natural-unit increments, pointwise 95% confidence intervals, exact numerical p-values, Holm-adjusted p-values, and sample sizes. A pointwise interval can exclude zero while the adjusted test does not meet the threshold. A nonsignificant finding is inconclusive, not proof of no association. P-values are not effect sizes or probabilities that an interpretation is correct.

Exponentiating a log-salary coefficient times its stated increment gives a modeled salary ratio, expressed as a percentage difference. It compares fitted geometric salary levels conditional on the other model inputs. It is not a percentage of total salary explained, an arithmetic-mean salary premium, or a promised raise.

Primary position coefficients condition on potentially different basketball inputs. Even a feature retained in two positions can answer different conditional questions. Do not subtract those primary coefficients, compare their magnitudes as equivalent effects, or use their differing significance labels as a position-difference test.

Instead, use a separately labeled common-specification analysis for direct position comparisons. Select a shared basketball set using the same predictor-only VIF threshold, removing the eligible input with the largest worst-position VIF until all three designs meet the target. This separate set contains height, assists, steals, blocks, eFG%, 3P%, FT%, and three-point attempts per game. Fit all three positions again with these common basketball inputs, age, and applicable availability controls. Export the comparison fits' coefficients, actual retained inputs, and sample sizes separately from the primary fits.

Test equality using a fully interacted pooled model of those comparison fits on the same raw units. All intercepts, basketball slopes, age slopes, and applicable availability indicators may differ by position. Use HC3 Wald tests. Preserve twelve omnibus candidate slots as one Holm-adjusted family and 36 pairwise candidate slots as a separate Holm-adjusted family; omitted comparisons use internal p-value-one placeholders and have no displayed test result. These comparison families remain separate from the primary family and from each other; they do not jointly control a single global error rate. A significant primary association in one group and a nonsignificant one in another does not establish a difference between groups.

Pairwise tests use the comparison model's pooled residual degrees of freedom (430); two-restriction omnibus tests use an approximate F reference with 2 and 430 degrees of freedom. Primary position-specific residual degrees of freedom are 184 for Guards, 79 for Wings, and 165 for Bigs. The common-specification fits have their own degrees of freedom and do not replace the primary estimates.

## Diagnostics and fixed sensitivity checks

Report model rank, residual degrees of freedom, scaled condition numbers, predictor correlations, variance inflation factors, leverage, and influence. A sparse availability category can produce high leverage; exact leverage one makes HC3 unavailable. Do not hide non-estimable results or silently select a different inferential model.

Run these descriptive checks with each position's primary retained basketball mask fixed. For a core-only check, intersect that position's mask with the original nine non-percentage candidates. Do not reselect features within sensitivities or choose a sensitivity because it produces a smaller p-value:

- Retained core inputs plus age on all 467 eligible players.
- The same retained core inputs on the original full-twelve-input complete-case cohort.
- The primary retained inputs on that original complete-case cohort, with the players and position mix lost to missing percentages disclosed. The cohort requires all twelve original inputs, but the fitted model uses only retained inputs.
- Players with at least 20 games.
- Players aged at least 23; this is not a verified veteran-contract classification.
- Recorded salaries of at least $1 million; this changes the target population and does not establish annualized salary.
- A clearly identified influence-removal sensitivity, retaining the full-sample primary result.

Check the restricted design again. If it exceeds the fixed VIF threshold, loses rank, or has leverage one, mark that sensitivity unavailable with its reason rather than changing the feature set or silently publishing a redundant model. Report the actual retained columns and sample size. Sensitivity results assess dependence on specification or sample choices. They are not independent replication and do not upgrade a primary finding merely because one alternative produces a smaller p-value. Selection of influential observations is outcome-dependent and must remain explicitly diagnostic.

## Interpretation for coaches

Report supported, negative, and uncertain associations together. For example: “Among NBA players in this position, the stated increment was associated with the estimated salary difference after adjustment for the listed statistics, age, and percentage availability.” Add the interval, adjusted p-value, and any sample sensitivity.

The adjustment set matters for basketball interpretation. Each reduced model holds only its listed retained inputs fixed. For example, primary Bigs OLS adjusts for rebounds but Wings OLS does not, and Guards ridge includes turnovers while Guards OLS does not. Remaining inputs can carry information shared with omitted statistics, so their coefficients cannot be described as independent of removed inputs. Reducing VIF can improve numerical separation without resolving omitted-variable bias or identifying the total basketball value of shooting, height, or another skill. Supported or uncertain conditional coefficients do not establish a skill's importance for winning or recruiting.

Pay depends on contracts, bargaining rules, experience, previous performance, expected future performance, injuries, and other information absent from this workbook. Current-season statistics may follow a salary decision already made. Correlated inputs share information, and coefficients can change with the adjustment set. Neither this design nor robust standard errors identify causation. Transfer to NCAA players, especially WBB, remains unvalidated.

## References

- [NIST: significance thresholds and choosing them before testing](https://www.itl.nist.gov/div898/handbook/prc/section1/prc131.htm)
- [American Statistical Association: interpreting p-values](https://www.amstat.org/asa/files/pdfs/p-valuestatement.pdf)
- [statsmodels: robust covariance and test reference distributions](https://www.statsmodels.org/stable/generated/statsmodels.regression.linear_model.RegressionResults.get_robustcov_results.html)
- [statsmodels: multiple-testing adjustments](https://www.statsmodels.org/stable/generated/statsmodels.stats.multitest.multipletests.html)
- [statsmodels: variance inflation factors](https://www.statsmodels.org/stable/generated/statsmodels.stats.outliers_influence.variance_inflation_factor.html)
- [Penn State: multicollinearity and diagnostic thresholds](https://online.stat.psu.edu/stat501/Lesson12)
- [scikit-learn: training-only preprocessing and feature selection](https://scikit-learn.org/stable/common_pitfalls.html#data-leakage)
- [scikit-learn: interpreting correlated model inputs](https://scikit-learn.org/stable/auto_examples/inspection/plot_linear_model_coefficient_interpretation.html)
- [Gelman and Stern: testing differences between associations](https://sites.stat.columbia.edu/gelman/research/published/signif4.pdf)
