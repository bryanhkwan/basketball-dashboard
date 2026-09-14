# NBA salary evidence: analysis specification

This analysis describes attributes associated with recorded 2022–23 NBA compensation. It supports the dashboard's position-level evidence view. It does not estimate the causal return to improving a skill, determine what an NCAA player should be paid, or replace the ridge model used for college valuation.

## Analysis status and target

This is an exploratory follow-up. The workbook and earlier ridge results were inspected before this specification was written. The explanatory model, testing families, and sensitivity checks below were fixed before inspecting the new explanatory p-values. They are not a preregistered or independently confirmed study. Reusing this dataset cannot supply independent replication.

The response is the natural logarithm of the workbook's positive recorded `Salary`, without annualizing or removing low salaries in the primary analysis. Short and partial-season contracts may differ from annual salary rates. NBA positions use the existing mapping: PG/SG to Guards, SF to Wings, and PF/C to Bigs. A hybrid uses its first listed position.

The original workbook and sourced height snapshot remain unchanged. NBA heights were retrieved from current ESPN bios in September 2026, not verified historical 2022–23 measurements. The generated evidence manifest records input hashes and the software environment. Archived inputs use raw-byte hashes; Python source hashes normalize line endings to LF so the same source verifies on Windows and Unix. Each manifest entry states its hash basis.

## Primary explanatory model

Fit a separate ordinary least squares regression in each position group. Retain all twelve existing basketball inputs: height, minutes, points, rebounds, assists, steals, blocks, turnovers, effective field-goal percentage, three-point percentage, free-throw percentage, and three-point attempts per game. Include age as an adjustment variable. No input is selected or removed because its p-value is favorable or unfavorable.

Percentage availability requires basketball-specific handling. Dropping every player without three-point accuracy would exclude many traditional centers. An unavailable percentage is not an observed 0%. The primary model uses a separate indicator for unavailable three-point accuracy and unavailable free-throw accuracy. Zero placeholders appear only in the corresponding regression design columns. The indicators allow these rows a different intercept; they do not assign a real accuracy measurement. Accuracy slopes apply to rows where that accuracy is usable. This specification models recorded availability and does not generally cure missing-data bias or recover latent shooting skill.

Require usable core statistics, age, and effective field-goal percentage. This retains 466 players: 197 Guards, 91 Wings, and 178 Bigs. One one-game guard, Alondes Williams, has no usable eFG%. Giving that single row its own missing-eFG indicator would fit it exactly, producing leverage one and undefined HC3 uncertainty. Its exclusion is reported explicitly. A separate core-statistics sensitivity retains all 467 players.

## Uncertainty and comparisons

Use HC3 heteroskedasticity-robust covariance. Position-specific coefficient tests use a two-sided Student t reference with residual degrees of freedom. These are approximate model-based inferences, not exact small-sample guarantees. They treat player observations as independent; team and contract-market dependencies, model misspecification, and omitted variables remain limitations.

The primary family is all 36 basketball associations: twelve inputs across three positions. Apply Holm adjustment across that whole family at a fixed 0.05 threshold. Age and availability indicators are adjustment variables, not extra discoveries. A secondary Benjamini–Hochberg result may be exported for transparency but does not replace the primary decision. Do not change the threshold or select a correction after seeing the results.

Show raw coefficients, explicit natural-unit increments, pointwise 95% confidence intervals, exact numerical p-values, Holm-adjusted p-values, and sample sizes. A pointwise interval can exclude zero while the adjusted test does not meet the threshold. A nonsignificant finding is inconclusive, not proof of no association. P-values are not effect sizes or probabilities that an interpretation is correct.

Exponentiating a log-salary coefficient times its stated increment gives a modeled salary ratio, expressed as a percentage difference. It compares fitted geometric salary levels conditional on the other model inputs. It is not a percentage of total salary explained, an arithmetic-mean salary premium, or a promised raise.

Test position differences directly using a fully interacted pooled model on the same raw units. All intercepts, basketball slopes, age slopes, and applicable availability indicators may differ by position. Use HC3 Wald tests. Report twelve omnibus tests as one Holm-adjusted family, and 36 pairwise tests as a separate Holm-adjusted family. The two families answer different questions and do not jointly control a single global error rate. A significant association in one group and a nonsignificant association in another does not establish a difference between groups.

## Diagnostics and fixed sensitivity checks

Report model rank, residual degrees of freedom, scaled condition numbers, predictor correlations, variance inflation factors, leverage, and influence. A sparse availability category can produce high leverage; exact leverage one makes HC3 unavailable. Do not hide non-estimable results or silently select a different inferential model.

Run these descriptive checks using the same feature rules wherever estimable:

- Core nine basketball inputs plus age, excluding percentage variables, retaining all 467 players.
- Full twelve-input complete cases, with the players and position mix lost to missing percentages disclosed.
- Players with at least 20 games.
- Players aged at least 23; this is not a verified veteran-contract classification.
- Recorded salaries of at least $1 million; this changes the target population and does not establish annualized salary.
- A clearly identified influence-removal sensitivity, retaining the full-sample primary result.

Sensitivity results assess dependence on specification or sample choices. They are not independent replication and do not upgrade a primary finding merely because one alternative produces a smaller p-value. Selection of influential observations is outcome-dependent and must remain explicitly diagnostic.

## Interpretation for coaches

Report supported, negative, and uncertain associations together. For example: “Among NBA players in this position, the stated increment was associated with the estimated salary difference after adjustment for the listed statistics, age, and percentage availability.” Add the interval, adjusted p-value, and any sample sensitivity.

The adjustment set matters for basketball interpretation. Holding points and minutes fixed asks whether three-point accuracy has an additional salary association beyond that measured production. It does not measure the total basketball value of shooting, which can operate through scoring, playing time, spacing, or roles absent from the data. Similarly, conditioning on blocks and rebounds can absorb part of the association related to height. Uncertain conditional coefficients do not establish that these skills are unimportant for winning or recruiting.

Pay depends on contracts, bargaining rules, experience, previous performance, expected future performance, injuries, and other information absent from this workbook. Current-season statistics may follow a salary decision already made. Correlated inputs share information, and coefficients can change with the adjustment set. Neither this design nor robust standard errors identify causation. Transfer to NCAA players, especially WBB, remains unvalidated.

## References

- [NIST: significance thresholds and choosing them before testing](https://www.itl.nist.gov/div898/handbook/prc/section1/prc131.htm)
- [American Statistical Association: interpreting p-values](https://www.amstat.org/asa/files/pdfs/p-valuestatement.pdf)
- [statsmodels: robust covariance and test reference distributions](https://www.statsmodels.org/stable/generated/statsmodels.regression.linear_model.RegressionResults.get_robustcov_results.html)
- [statsmodels: multiple-testing adjustments](https://www.statsmodels.org/stable/generated/statsmodels.stats.multitest.multipletests.html)
- [Gelman and Stern: testing differences between associations](https://sites.stat.columbia.edu/gelman/research/published/signif4.pdf)
