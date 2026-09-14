#!/usr/bin/env python3
"""Exploratory, coach-facing NBA salary associations; does not change prediction weights.

Run python tools/analyze-nba-evidence.py; test with python tools/test_nba_evidence.py.
The analysis protocol was fixed before this inferential analysis was fitted, after
the dataset and predictive results had already been inspected. This is exploratory.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import platform
from datetime import datetime, timezone
from itertools import combinations
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import scipy
from scipy.linalg import block_diag
from scipy.stats import t
import statsmodels
import statsmodels.api as sm
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.outliers_influence import variance_inflation_factor

ROOT = Path(__file__).resolve().parents[1]
loader_spec = importlib.util.spec_from_file_location("nba_training_inputs", ROOT / "tools/train-nba-valuation.py")
loader = importlib.util.module_from_spec(loader_spec)
loader_spec.loader.exec_module(loader)
KEYS = loader.KEYS
GROUPS = loader.GROUPS
CORE_KEYS = [key for key in KEYS if key not in ("eFG%", "3P%", "FT%")]
INCREMENTS = {"Height": (1, "+1 inch"), "MP": (5, "+5 minutes/game"), "PPG": (5, "+5 points/game"),
              "RPG": (1, "+1 rebound/game"), "APG": (1, "+1 assist/game"), "SPG": (.5, "+0.5 steals/game"),
              "BPG": (.5, "+0.5 blocks/game"), "TOPG": (1, "+1 turnover/game"),
              "eFG%": (.05, "+5 percentage points"), "3P%": (.05, "+5 percentage points"),
              "FT%": (.05, "+5 percentage points"), "3PA/G": (1, "+1 three-point attempt/game"), "Age": (1, "+1 year")}
LABELS = {key: (label, unit) for key, label, unit, _ in loader.FEATURES}
LABELS["Age"] = ("Age (control)", "years")
ALPHA = .05
PROTOCOL = {
    "alpha": ALPHA, "primaryFamilySize": 36, "primaryCorrection": "Holm",
    "primarySample": "Complete core nine basketball features, age and eFG%; observed-accuracy controls for undefined 3P% and FT%.",
    "missingPercentageHandling": "Observed 3P%/FT% are centered around their observed group mean; unavailable rows use a zero centered-design placeholder plus a separate unavailable-percentage indicator. It is not an observed 0% or an estimated missing accuracy. Centering changes only nuisance offsets, not accuracy slopes, and avoids artificial coding-induced VIF.",
    "excludedRowReason": "Alondes Williams has the sole unavailable eFG% (one game, no field-goal attempts). A separate singleton eFG% indicator would give leverage 1 and undefined HC3 variance. Require observed eFG% instead; do not drop nonshooting centers for missing 3P%.",
    "pointwiseInterval": "95% pointwise HC3 robust intervals using approximate Student t with residual df=n-design rank; intervals are not multiplicity-adjusted.",
    "exploratoryDisclosure": "Earlier full-model outcomes and p-values were inspected before the user requested redundant-input removal. The shared VIF<=5 policy was then fixed using predictors only, before revised fits; no salary, sign or p-value selects inputs. This remains exploratory and is not preregistered or independently confirmed.",
    "positionComparison": "Fully interacted pooled OLS with separate group intercepts, all slopes and applicable availability indicators; HC3 covariance. Raw-unit linear contrasts use approximate robust t/F with pooled residual df. Omnibus 12-feature and pairwise 36-contrast Holm corrections are separate families.",
    "statusDefinitions": {"supported": "Holm-adjusted p <= 0.05", "suggestive": "0.05 < Holm-adjusted p <= 0.10; not statistically significant", "uncertain": "Holm-adjusted p > 0.10"},
    "fixedSensitivities": ["At least 20 games", "Age at least 23 (not a rookie identifier)", "Recorded salary at least $1 million", "Exclude primary Cook's distance >4/n", "Core nine plus age, all eligible players", "Core nine plus age on full complete cases", "Full 12 plus age, complete cases"],
    "noSelection": "A shared X-only VIF<=5 policy removes redundant inputs, protects height/age and retains percentage-availability controls with their parent statistic. No salary, sign, p-value, threshold switching or sensitivity winner determines selection. Excluded tests are unavailable; the original planned 36 Holm slots are retained by internally padding untested slots, not by reporting fabricated p-values.",
    "redundancyPolicy": "Shared retained basketball set across all positions, repeatedly excluding the unprotected stat with the worst per-position VIF until every retained predictor/control meets VIF<=5. Natural candidate order breaks ties. This heuristic reduces redundant linear information; it does not imply zero correlation or that excluded stats have no basketball value.",
}


class UnavailableFit(ValueError):
    pass


def source_fingerprint(path):
    """Archive input bytes; canonicalize Python text across Git line endings."""
    path = Path(path)
    payload = path.read_bytes()
    text_source = path.suffix.lower() == ".py"
    if text_source:
        payload = payload.replace(b"\r\n", b"\n")
    return {"file": path.relative_to(ROOT).as_posix(),
            "sha256": hashlib.sha256(payload).hexdigest(),
            "sha256Basis": "utf8-lf" if text_source else "raw-bytes"}


def design_data(data, specification="observed", selected_keys=None):
    """Return eligible rows, raw design, and exclusions without changing source values."""
    required = (CORE_KEYS + ["Age", "eFG%"]) if specification == "observed" else (CORE_KEYS + ["Age"] if specification == "core" else KEYS + ["Age"])
    complete = data[required].notna().all(axis=1)
    sample = data.loc[complete].copy()
    columns = (CORE_KEYS if specification == "core" else KEYS) + ["Age"]
    if selected_keys is not None:
        columns = [key for key in columns if key == "Age" or key in selected_keys]
    x = sample[columns].copy()
    centers = {}
    if specification == "observed":
        for key in ["3P%", "FT%"]:
            if key not in x:
                continue
            missing = x[key].isna()
            centers[key] = float(x[key].mean())
            if missing.any():
                x["Unavailable " + key] = missing.astype(float)
            x[key] = (x[key] - centers[key]).fillna(0.0)
    x.insert(0, "Intercept", 1.0)
    excluded = []
    for _, row in data.loc[~complete].iterrows():
        excluded.append({"player": row["Player Name"], "group": row.PositionGroup,
                         "missing": [key for key in required if pd.isna(row[key])]})
    x = x.astype(float)
    x.attrs["percentageCenters"] = centers
    return sample, x, excluded


def checked_fit(x, y):
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    rank = int(np.linalg.matrix_rank(x))
    if rank != x.shape[1]:
        raise UnavailableFit(f"Design is rank deficient: rank {rank}, columns {x.shape[1]}")
    if len(y) <= rank + 2:
        raise UnavailableFit(f"Too few residual degrees of freedom: n {len(y)}, rank {rank}")
    ordinary = sm.OLS(y, x).fit()
    leverage = ordinary.get_influence().hat_matrix_diag
    if np.max(leverage) >= 1 - 1e-10:
        raise UnavailableFit("Leverage reaches one; HC3 divides by (1-h)^2 and is undefined")
    robust = ordinary.get_robustcov_results(cov_type="HC3", use_t=True)
    if not np.isfinite(robust.cov_params()).all():
        raise UnavailableFit("Nonfinite HC3 covariance")
    return ordinary, robust


def status(p):
    return "supported" if p <= .05 else "suggestive" if p <= .10 else "uncertain"


def adjust_rows(rows, field="pRaw", family_size=None, pad_excluded=False):
    if family_size is not None and (len(rows) > family_size or len(rows) != family_size and not pad_excluded):
        raise AssertionError(f"Correction family expected {family_size}, got {len(rows)}")
    p_values = np.array([row[field] for row in rows], dtype=float)
    if pad_excluded and family_size is not None:
        p_values = np.concatenate([p_values, np.ones(family_size - len(rows))])
    holm = multipletests(p_values, alpha=ALPHA, method="holm")[1]
    bh = multipletests(p_values, alpha=ALPHA, method="fdr_bh")[1]
    for row, hp, qp in zip(rows, holm, bh):
        row.update(pHolm=float(hp), pAdjustedHolm=float(hp), qBh=float(qp), status=status(float(hp)))


def coefficient_record(key, index, sample, x, robust):
    raw = float(robust.params[index])
    se = float(robust.bse[index])
    low, high = map(float, robust.conf_int(alpha=ALPHA)[index])
    increment, increment_label = INCREMENTS.get(key, (1, "indicator present vs absent"))
    label, unit = LABELS.get(key, (key, "indicator"))
    original = sample[key] if key in sample else x.iloc[:, index]
    # Standardized slope uses observed feature SD, never a zero-filled accuracy SD.
    scale = float(original.std(ddof=0))
    log_effect, log_low, log_high = raw * increment, low * increment, high * increment
    record = {"key": key, "label": label, "unit": unit, "increment": increment, "incrementLabel": increment_label,
              "n": len(sample), "nObserved": int(original.notna().sum()), "observedN": int(original.notna().sum()),
              "coefficientRaw": raw, "coefficient": raw, "seRaw": se, "ciLowRaw": low, "ciHighRaw": high,
              "ciLow": low, "ciHigh": high, "coefficientStd": raw * scale, "ciLowStd": low * scale, "ciHighStd": high * scale,
              "observedSD": scale, "logEffect": log_effect, "logEffectCiLow": log_low, "logEffectCiHigh": log_high,
              "associationPct": float(100 * np.expm1(log_effect)), "associationPctCiLow": float(100 * np.expm1(log_low)),
              "associationPctCiHigh": float(100 * np.expm1(log_high)), "tStatistic": float(robust.tvalues[index]),
              "pRaw": float(robust.pvalues[index]), "pValue": float(robust.pvalues[index]), "dfResidual": float(robust.df_resid),
              "vif": float(variance_inflation_factor(x.to_numpy(), index)), "pointwiseInterval": True}
    record.update(effectPct=record["associationPct"], effectCiLowPct=record["associationPctCiLow"], effectCiHighPct=record["associationPctCiHigh"])
    return record


def fit_group(data, specification="observed", selected_keys=None, enforce_vif=False):
    sample, x, excluded = design_data(data, specification, selected_keys)
    vifs = loader.redundancy.vif_values(x)
    if enforce_vif and max(vifs.values()) > loader.redundancy.THRESHOLD + 1e-9:
        raise UnavailableFit("Fixed retained subset exceeds VIF 5 in this restricted sample")
    ordinary, robust = checked_fit(x, sample.LogSalary)
    influence = ordinary.get_influence()
    h = influence.hat_matrix_diag
    cooks = influence.cooks_distance[0]
    parameter_count = x.shape[1]
    records = [coefficient_record(key, i, sample, x, robust) for i, key in enumerate(x.columns) if key != "Intercept"]
    effects = [record for record in records if record["key"] in KEYS]
    rank_order = {record["key"]: i + 1 for i, record in enumerate(sorted(effects, key=lambda row: abs(row["coefficientStd"]), reverse=True))}
    for record in effects:
        record["rankByAbsStd"] = rank_order[record["key"]]
    standardized_x = x.iloc[:, 1:].to_numpy()
    standardized_x = (standardized_x - standardized_x.mean(axis=0)) / standardized_x.std(axis=0)
    standardized_x = np.column_stack([np.ones(len(sample)), standardized_x])
    diagnostic_rows = []
    for i, (_, row) in enumerate(sample.iterrows()):
        diagnostic_rows.append({"player": row["Player Name"], "group": row.PositionGroup, "salary": float(row.Salary),
                                "leverage": float(h[i]), "cooksDistance": float(cooks[i]),
                                "studentizedResidual": float(influence.resid_studentized_internal[i]),
                                "highLeverage": bool(h[i] > 2 * parameter_count / len(sample)),
                                "highCooksDistance": bool(cooks[i] > 4 / len(sample))})
    output = {"nInput": len(data), "n": len(sample), "nExcluded": len(excluded), "dfResidual": float(robust.df_resid),
              "rank": parameter_count, "designColumns": list(x.columns), "intercept": float(robust.params[0]),
              "percentageCenters": x.attrs.get("percentageCenters", {}),
              "estimates": effects, "features": effects, "ageControl": next(record for record in records if record["key"] == "Age"),
              "availabilityControls": [record for record in records if record["key"].startswith("Unavailable ")],
              "attrition": {"excluded": excluded, "missingByFeatureInInput": {key: int(data[key].isna().sum()) for key in KEYS},
                            "unavailablePercentageCountsInPrimary": {key: int(sample[key].isna().sum()) for key in ["3P%", "FT%"]},
                            "retainedSalaryMedian": float(sample.Salary.median()),
                            "excludedSalaryMedian": float(data.loc[~data.index.isin(sample.index), "Salary"].median()) if excluded else None},
              "diagnostics": {"inSampleR2": float(ordinary.rsquared), "inSampleAdjustedR2": float(ordinary.rsquared_adj),
                              "residualSD": float(np.sqrt(ordinary.mse_resid)), "rawConditionNumber": float(np.linalg.cond(x)),
                              "standardizedConditionNumber": float(np.linalg.cond(standardized_x)), "maxLeverage": float(np.max(h)),
                              "highLeverageThreshold": 2 * parameter_count / len(sample), "highLeverageCount": int(np.sum(h > 2 * parameter_count / len(sample))),
                              "cooksThreshold": 4 / len(sample), "highCooksCount": int(np.sum(cooks > 4 / len(sample))),
                              "maxVif": max(record["vif"] for record in effects),
                              "topInfluence": sorted(diagnostic_rows, key=lambda row: row["cooksDistance"], reverse=True)[:8]}}
    return output, {"sample": sample, "x": x, "ordinary": ordinary, "robust": robust, "influence": diagnostic_rows}


def position_comparisons(fits):
    xs = [fits[group]["x"].to_numpy() for group in GROUPS]
    x = block_diag(*xs)
    y = np.concatenate([fits[group]["sample"].LogSalary.to_numpy() for group in GROUPS])
    _, robust = checked_fit(x, y)
    offsets, cursor = {}, 0
    for group in GROUPS:
        offsets[group] = cursor
        cursor += len(fits[group]["x"].columns)
    def column(group, key):
        return offsets[group] + list(fits[group]["x"].columns).index(key)
    omnibus, pairwise = [], []
    selected_keys = [key for key in KEYS if all(key in fits[group]["x"] for group in GROUPS)]
    if any({key for key in KEYS if key in fits[group]["x"]} != set(selected_keys) for group in GROUPS):
        raise ValueError("Position comparisons require the same retained basketball adjustment set")
    for key in selected_keys:
        r = np.zeros((2, x.shape[1]))
        for i, group in enumerate(GROUPS[1:]):
            r[i, column(GROUPS[0], key)] = 1
            r[i, column(group, key)] = -1
        test = robust.f_test(r)
        omnibus.append({"key": key, "label": LABELS[key][0], "statisticF": float(test.fvalue), "dfNum": float(test.df_num),
                        "dfDen": float(test.df_denom), "pRaw": float(test.pvalue), "pValue": float(test.pvalue),
                        "hypothesis": "All three raw-unit position slopes are equal"})
        for a, b in combinations(GROUPS, 2):
            contrast = np.zeros(x.shape[1]); contrast[column(a, key)] = 1; contrast[column(b, key)] = -1
            result = robust.t_test(contrast)
            difference = float(np.asarray(result.effect).item()); se = float(np.asarray(result.sd).item())
            low, high = map(float, result.conf_int(alpha=ALPHA)[0])
            inc, label = INCREMENTS[key]
            pairwise.append({"key": key, "label": LABELS[key][0], "groupA": a, "groupB": b,
                             "increment": inc, "incrementLabel": label, "differenceRaw": difference, "seRaw": se,
                             "ciLowRaw": low, "ciHighRaw": high, "logEffect": difference * inc,
                             "logEffectCiLow": low * inc, "logEffectCiHigh": high * inc,
                             "associationPct": float(100 * np.expm1(difference * inc)),
                             "associationPctCiLow": float(100 * np.expm1(low * inc)), "associationPctCiHigh": float(100 * np.expm1(high * inc)),
                             "pRaw": float(result.pvalue), "pValue": float(result.pvalue), "dfResidual": float(robust.df_resid),
                             "interpretation": "Difference in slopes: group A minus group B. Exponentiation compares multiplicative salary associations, not salary levels."})
    adjust_rows(omnibus, family_size=12, pad_excluded=True)
    adjust_rows(pairwise, family_size=36, pad_excluded=True)
    return {"method": PROTOCOL["positionComparison"], "n": len(y), "rank": int(np.linalg.matrix_rank(x)),
            "dfResidual": float(robust.df_resid), "omnibusFamilySize": 12, "pairwiseFamilySize": 36,
            "omnibusTestedCount": len(omnibus), "pairwiseTestedCount": len(pairwise),
            "excludedKeys": [key for key in KEYS if key not in selected_keys],
            "omnibus": omnibus, "pairwise": pairwise}


def sensitivities(data, primary, selected_keys):
    complete, _, _ = design_data(data, "complete")
    influential = {row["player"] for row in primary["influence"] if row["highCooksDistance"]}
    definitions = [("games20", "At least 20 games", data[data.GP.ge(20)], "observed"),
                   ("age23", "Age at least 23", data[data.Age.ge(23)], "observed"),
                   ("salary1m", "Recorded salary at least $1 million", data[data.Salary.ge(1_000_000)], "observed"),
                   ("influence", "Exclude primary Cook's distance above 4/n", data[~data["Player Name"].isin(influential)], "observed"),
                   ("coreAll", "Retained core inputs plus age, all eligible players", data, "core"),
                   ("coreComplete", "Retained core inputs plus age on original full complete cases", complete, "core"),
                   ("fullComplete", "Retained inputs plus age on original full complete cases", data, "complete")]
    result = []
    for identifier, label, sample, spec in definitions:
        eligible, x, excluded = design_data(sample, spec, selected_keys)
        item = {"id": identifier, "label": label, "nInput": len(sample), "n": len(eligible), "specification": spec,
                "rank": int(np.linalg.matrix_rank(x)), "designColumnCount": x.shape[1], "descriptiveOnly": True,
                "excludedMissingCount": len(excluded), "restrictedOutCount": len(data) - len(sample),
                "missingCountsBeforeEligibility": {key: int(sample[key].isna().sum()) for key in KEYS},
                "excluded": excluded}
        try:
            fitted, _ = fit_group(sample, spec, selected_keys, enforce_vif=True)
            primary_coefficients = dict(zip(primary["x"].columns, primary["robust"].params))
            for record in fitted["estimates"]:
                record["signChangedFromPrimary"] = bool(record["coefficientRaw"] * primary_coefficients[record["key"]] < 0)
            item.update(available=True, dfResidual=fitted["dfResidual"], estimates=fitted["estimates"], diagnostics=fitted["diagnostics"])
        except UnavailableFit as error:
            item.update(available=False, reason=str(error), estimates=[])
        result.append(item)
    return result


def coach_summary(groups, comparisons):
    all_effects = [(group, row) for group in GROUPS for row in groups[group]["estimates"]]
    supported = [(group, row) for group, row in all_effects if row["status"] == "supported"]
    suggestive = [(group, row) for group, row in all_effects if row["status"] == "suggestive"]
    statements = [f"{len(supported)} of {len(all_effects)} retained salary associations meet the fixed 5% Holm-adjusted threshold using the original 36 planned slots."]
    if not supported:
        statements.append("This sample does not isolate a portable stat with sufficient adjusted evidence to present as an established pay driver. It does not establish that every association is zero.")
    for group, row in supported:
        statements.append(f"{group}: {row['label']} has a {'positive' if row['coefficientRaw'] > 0 else 'negative'} conditional association (Holm p={row['pHolm']:.4g}); this is not a causal training or pay recommendation.")
    supported_differences = [row for row in comparisons["omnibus"] if row["status"] == "supported"]
    statements.append(f"{len(supported_differences)} of {len(comparisons['omnibus'])} retained direct position-difference tests meet their separate Holm-adjusted 5% threshold using 12 planned slots. A significant result in one position and a nonsignificant result in another is not itself evidence of a difference.")
    statements.append("Minutes, points, rebounds and turnovers were removed for overlapping information, not because they lack basketball value. Remaining associations no longer control those inputs and can absorb their role or scoring information. Do not convert an association into a guaranteed pay change.")
    return {"supportedCount": len(supported), "suggestiveCount": len(suggestive), "testedCount": len(all_effects), "familySize": 36, "statements": statements,
            "supported": [{"group": group, "key": row["key"], "pHolm": row["pHolm"]} for group, row in supported]}


def write_forest(evidence, output):
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
    fig, axes = plt.subplots(1, 3, figsize=(17, 7.5), sharex=True, sharey=True)
    for ax, group in zip(axes, GROUPS):
        rows = evidence["groups"][group]["estimates"]
        for i, row in enumerate(rows):
            color = "#076f70" if row["status"] == "supported" else "#66788a"
            ax.plot([row["logEffectCiLow"], row["logEffectCiHigh"]], [i, i], color=color, linewidth=1.7)
            ax.plot(row["logEffect"], i, "o" if row["status"] == "supported" else "o", color=color,
                    markerfacecolor=color if row["status"] == "supported" else "white", markersize=6)
        ax.axvline(0, color="#303e4e", linewidth=.8)
        ax.set_yticks(range(len(rows)), [row["key"] + " · " + row["incrementLabel"] for row in rows])
        ax.set_title(f"{group} (n={evidence['groups'][group]['n']})")
        ax.set_xlabel("Log-salary association for the stated increment")
        ax.grid(axis="x", alpha=.15)
    axes[0].invert_yaxis()
    fig.suptitle("NBA 2022–23 salary evidence by position", fontsize=17, y=.98)
    fig.text(.5, .055, f"95% pointwise HC3 intervals. Filled teal points meet Holm p ≤ .05; {evidence['policy']['testedCount']} tested associations, 36 planned slots.", ha="center")
    fig.text(.5, .028, "Exploratory conditional associations; age and percentage availability controlled. Not causal effects or NCAA pay estimates.", ha="center", fontsize=10)
    fig.tight_layout(rect=(0, .085, 1, .94))
    for extension in ["png", "pdf"]:
        fig.savefig(output / f"salary-evidence-by-position.{extension}", dpi=190, bbox_inches="tight")
    plt.close(fig)


def write_report(evidence, output):
    lines = ["# NBA salary evidence for coaches", "", *evidence["coachSummary"]["statements"], "", "## Scope and frozen analysis protocol", ""]
    lines.extend(PROTOCOL[key] for key in ["primarySample", "missingPercentageHandling", "excludedRowReason", "pointwiseInterval", "exploratoryDisclosure", "positionComparison", "noSelection"])
    lines.extend(["", "The primary model is ordinary least squares for natural log recorded 2022–23 NBA salary, separately by position. "
                  "A frozen predictor-only overlap rule screens the original 12 portable candidates with age and applicable availability "
                  "controls. Each position then uses the same retained inputs. OLS supplies associations and uncertainty; ridge separately "
                  "supplies prediction weights and has its own training-fold selection. OLS p-values do not test ridge weights.", "",
                  "The shared rule removes the eligible basketball input with the largest VIF in any group, recomputing until all "
                  "VIFs are at most 5. Height and age are protected and availability controls follow their parent percentage. Exact ties "
                  "follow the original candidate order; salary, coefficient signs and p-values never enter selection. The removal order "
                  "is " + " → ".join(step["excludedKey"] for step in evidence["selection"]["trace"]) + "; retained inputs are "
                  + ", ".join(evidence["selection"]["retainedKeys"]) + ". VIF 5 is a heuristic, not proof of zero correlation or a repair "
                  "for omitted-variable bias. The earlier outcomes were already inspected, so this revised evidence remains exploratory.", "",
                  "Observed 3P% and FT% are centered around their position's observed mean before unavailable rows receive a zero design "
                  "placeholder and their own intercept offset. This removes placeholder-induced correlation with the availability flag "
                  "without changing a same-mask continuous slope or fitted value. The estimated accuracy slope "
                  "therefore concerns observed percentages. The placeholder is not an imputed player ability or an observed 0%. This "
                  "parameterization retains nonshooting centers but does not generally solve missing-data bias. Very rare availability "
                  "categories can create high leverage. Current listed heights and all other input processing match the prediction dataset.", "",
                  f"There are {evidence['policy']['testedCount']} tested portable associations ({len(evidence['selection']['retainedKeys'])} retained features × three groups), within the original 36 planned "
                  "slots (12 candidates × three groups). Unfitted slots are padded with p=1 internally for correction only; excluded inputs "
                  "have no exported coefficient, interval or p-value and must not be displayed as zero effects. Holm-adjusted p ≤ .05 is the fixed evidence "
                  "criterion. Values above .05 through .10 are only suggestive, not significant. Raw p-values and optional BH q-values "
                  "are also exported, but do not determine the primary decision. Age and availability controls are nuisance parameters "
                  "and are reported separately. A 95% pointwise interval may exclude zero while Holm p exceeds .05; that is expected "
                  "because the interval has no familywise correction. Nonsignificance is not proof of no association.", "",
                  "HC3 adjusts heteroskedastic standard errors using leverage-corrected residuals. Group tests use approximate Student "
                  "t with n minus design-rank degrees of freedom. These are not exact finite-sample guarantees. The player-independence "
                  "assumption may fail through shared team/contract environments; HC3 is not a team-cluster adjustment.", "",
                  "## Samples and diagnostics", ""])
    for group in GROUPS:
        item = evidence["groups"][group]
        lines.extend([f"### {group}", "", f"Input {item['nInput']}; primary {item['n']}; excluded {item['nExcluded']}; "
                      f"design rank {item['rank']}; residual df {item['dfResidual']:.0f}. Observed 3P% {next(r['nObserved'] for r in item['estimates'] if r['key']=='3P%')}; "
                      f"observed FT% {next(r['nObserved'] for r in item['estimates'] if r['key']=='FT%')}.", "",
                      f"Maximum VIF {item['diagnostics']['maxVif']:.2f}; standardized design condition number "
                      f"{item['diagnostics']['standardizedConditionNumber']:.2f}; maximum leverage {item['diagnostics']['maxLeverage']:.3f}. "
                      f"{item['diagnostics']['highCooksCount']} observations exceed the descriptive Cook's-distance threshold 4/n. "
                      "In-sample R² is a descriptive fit statistic, not a prediction-validation result.", ""])
        if item["attrition"]["excluded"]:
            lines.extend(f"- Excluded {row['player']}: unavailable {', '.join(row['missing'])}." for row in item["attrition"]["excluded"])
            lines.append("")
        for sensitivity in item["sensitivities"]:
            note = "available" if sensitivity["available"] else "unavailable: " + sensitivity["reason"]
            lines.append(f"- Sensitivity {sensitivity['label']}: n={sensitivity['n']}, {note}.")
        lines.append("")
    lines.extend(["## How to interpret the associations", "",
                  "The retained natural increments are: height one inch, assists one per game, steals/blocks half per game, "
                  "shooting percentages five percentage points, and three-point attempts one "
                  "per game. The percentage salary association is 100 × [exp(raw slope × increment) − 1], with the same transformation "
                  "applied to interval endpoints. It concerns a conditional multiplicative salary association, not a guaranteed raise. "
                  "This is a ratio of fitted conditional geometric salary levels, not an arithmetic-mean premium or a guaranteed median. "
                  "Raw slopes use original units; standardized slopes use the SD of observed values in that primary position sample.", "",
                  "Direct position comparisons use a fully interacted pooled design: every group's intercept, stat slopes, age slope "
                  "and applicable missing-percentage indicators are separate. Raw-unit slope contrasts avoid comparing coefficients "
                  "whose group SDs differ. All groups condition on the same retained basketball inputs. There are "
                  f"{len(evidence['comparisons']['omnibus'])} tested two-degree-of-freedom omnibus F tests and {len(evidence['comparisons']['pairwise'])} pairwise t tests, preserving their original planned families of 12 "
                  "and 36 respectively with internal p=1 padding. Their approximate HC3 inference uses pooled residual df=N−rank. A pairwise exponentiated contrast "
                  "is a ratio of salary associations for a common increment, not a difference in salary levels.", "",
                  "The remaining associations do not hold minutes, scoring, rebounds or turnovers fixed. For example, a three-point "
                  "attempt coefficient may now absorb some of the scoring volume and role previously carried by those predictors. "
                  "A positive turnover coefficient in the earlier model did not establish that turnovers help winning; usage and "
                  "context matter. Removal means overlap, not no value. The fixed "
                  "sensitivities are descriptive: games ≥20, age ≥23, salary ≥$1 million, removal of primary Cook's-distance flags, a "
                  "model using only the retained core inputs without percentages on all 467 and on the original full complete cases, "
                  "and a model using the retained inputs on the original full-12 complete-case cohort. Primary eligibility remains "
                  "unchanged from the original design so the primary refinement does not also change its sample. The complete-case "
                  "cohort excludes many nonshooting centers. Comparing the two retained-core models separates part of the sample-selection "
                  "change from the specification change. No sensitivity replaces the primary result. Cook's-distance removal is "
                  "data-dependent and is not evidence that those valid observations should be deleted. Rank-deficient or leverage-one "
                  "sensitivity fits are marked unavailable rather than silently repaired. Sensitivities keep the primary retained mask "
                  "(intersected with core inputs where applicable), never reselect by significance, and are also unavailable if the "
                  "restricted design exceeds VIF 5.", "",
                  "## Limits for coaching and college pay", "", *evidence["limitations"], "",
                  "The college feed is a loaded set of records, not a verified all-NCAA or Division I population. Names/teams can repeat "
                  "with different source fragments. College records were not automatically summed or deduplicated; before/after audit "
                  "matching must retain source identifiers and statistical fingerprints. This inferential report fits only the unique "
                  "NBA players in the supplied workbook.", "",
                  "## Reproduction and sources", "",
                  "Run `python tools/analyze-nba-evidence.py` and `python tools/test_nba_evidence.py`. Dependencies are pinned in "
                  "`tools/requirements-nba-valuation.txt`. Exact workbook, height, input-loader and analysis-script hashes and package "
                  "versions are stored in the evidence JSON. Python source hashes normalize UTF-8 text to LF; data hashes use raw bytes. "
                  "The source workbook is unchanged. The separate trainer regenerates ridge assets; this OLS script never modifies them.", "",
                  "The corresponding project specification is `docs/nba-salary-evidence-method.md`. Published evidence assets contain "
                  "aggregate coefficients, diagnostics, test results and sample-coverage metadata. Player-level influence, design and salary source rows stay in "
                  "the local report outputs.", "",
                  "Source URLs and references:", "",
                  "- HC3 and t-based robust inference: https://www.statsmodels.org/stable/generated/statsmodels.regression.linear_model.RegressionResults.get_robustcov_results.html",
                  "- Holm/BH implementation: https://www.statsmodels.org/stable/generated/statsmodels.stats.multitest.multipletests.html",
                  "- Player height source URLs: `data/nba-2022-23-heights.json` (ESPN athlete bios retrieved September 2026).", "",
                  "Files: `associations.csv`, `position-omnibus.csv`, `position-pairwise.csv`, `sensitivity-associations.csv`, "
                  "`attrition.csv`, `influence.csv`, `correlations.csv`, `primary-design-rows.csv`, and the PNG/PDF forest plot. "
                  "`data/nba-salary-evidence.json` and `.js` contain the same generated evidence object.", ""])
    # Keep normal Markdown paragraph spacing, including the intentional blanks.
    import re
    report = re.sub(r"\n{3,}", "\n\n", "\n".join(lines))
    (output / "README.md").write_text(report, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=ROOT / "nba_2022-23-all_stats_with_salary (1).xlsx")
    parser.add_argument("--heights", type=Path, default=ROOT / "data/nba-2022-23-heights.json")
    parser.add_argument("--output", type=Path, default=ROOT / "reports/nba-evidence")
    parser.add_argument("--skip-plots", action="store_true", help="Keep already reviewed plots when only report/metadata formatting changes.")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    protocol_path = args.output / "protocol-v2-vif5.json"
    if not protocol_path.exists():
        protocol_path.write_text(json.dumps({"recordedBeforeOlsFitAt": datetime.now(timezone.utc).isoformat(), **PROTOCOL}, indent=2), encoding="utf-8")
    else:
        recorded = json.loads(protocol_path.read_text(encoding="utf-8"))
        if any(recorded.get(key) != value for key, value in PROTOCOL.items()):
            raise ValueError("Recorded protocol differs from this analysis; do not silently relabel a changed specification.")
    data, input_audit = loader.read_data(args.workbook, args.heights)
    selection_designs = {group: design_data(data[data.PositionGroup.eq(group)])[1] for group in GROUPS}
    selection = loader.redundancy.select_shared(selection_designs, KEYS)
    selected_keys = selection["retainedKeys"]
    evidence = {"schemaVersion": 2, "id": "nba-2022-23-hc3-salary-evidence-v2-vif5", "season": "2022-23", "selection": selection,
                "generatedAt": datetime.now(timezone.utc).isoformat(), "protocol": PROTOCOL,
                "sensitivityFeaturePolicy": "Keep the primary retained mask, intersected with core candidates for core sensitivities. Full/core labels in the archived fixed protocol specify the original candidate-pool eligibility; no excluded basketball input is restored. Restricted fits above VIF 5, rank deficient or with leverage one are unavailable.",
                "policy": {"alpha": .05, "adjustment": "Holm", "familySize": 36, "testedCount": 3 * len(selected_keys), "excludedSlotHandling": "Internal padding only; excluded tests have no displayed p-value"}, "exploratory": True,
                "sources": [source_fingerprint(path)
                            for path in [args.workbook, args.heights, ROOT / "tools/train-nba-valuation.py", ROOT / "tools/nba_redundancy.py", Path(__file__).resolve()]],
                "runtime": {"python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__,
                            "scipy": scipy.__version__, "statsmodels": statsmodels.__version__},
                "inputAudit": {key: input_audit[key] for key in ["inputRows", "modeledRows", "heightMatched", "missingByFeature", "groupCounts", "salarySummary", "salaryBelowMillion", "gamesBelowTwenty", "ageBelowTwentyThree"]}, "groups": {},
                "limitations": ["These are exploratory salary associations, not causal effects or evidence that coaching a statistic upward increases pay.",
                                "NBA pay reflects age, contract timing, tenure, draft position, injuries, bargaining rules, past performance and anticipated future performance. Age alone does not control all of them.",
                                "Recorded salaries include possible partial-season contracts; no annualization, contract-duration or guarantee data were supplied.",
                                "Current ESPN listed heights were retrieved in September 2026; they are not verified 2022–23 measurements or a strict historical backtest.",
                                "The source is one selected NBA season. Multiple testing correction does not fix omitted variables, selection, correlated features, rare missingness categories or model misspecification.",
                                "Minutes, points, rebounds and turnovers were excluded for overlapping predictor information. Remaining conditional associations do not adjust for them and may absorb their role or scoring information; exclusion does not imply no basketball value.",
                                "Percentages with observed accuracy and unavailable-accuracy indicators retain more roles but do not provide a general missing-data bias correction.",
                                "NBA results do not validate NCAA compensation or the NBA-to-WBB transfer. College dollar anchors, conference factors and scouting adjustments remain assumptions.",
                                "Prediction weights, salary evidence, and existing college scouting scores answer different questions. This evidence analysis does not replace prediction weights or attach significance to ridge coefficients."]}
    fits = {}
    for group in GROUPS:
        item, fit = fit_group(data[data.PositionGroup.eq(group)], selected_keys=selected_keys, enforce_vif=True)
        item["selection"] = {"threshold": selection["threshold"], "retainedKeys": selected_keys, "excludedKeys": selection["excludedKeys"],
                             "beforeVifs": selection["perGroupBeforeVifs"][group], "afterVifs": selection["perGroupAfterVifs"][group], "modelN": item["n"]}
        item["excludedFeatures"] = [{"key": key, "label": LABELS[key][0], "status": "excluded", "reason": "Excluded for redundant linear information by shared X-only VIF<=5 policy"} for key in selection["excludedKeys"]]
        evidence["groups"][group] = item
        fits[group] = fit
    effects = [row for group in GROUPS for row in evidence["groups"][group]["estimates"]]
    adjust_rows(effects, family_size=36, pad_excluded=True)
    evidence["comparisons"] = position_comparisons(fits)
    for group in GROUPS:
        evidence["groups"][group]["sensitivities"] = sensitivities(data[data.PositionGroup.eq(group)], fits[group], selected_keys)
    evidence["coachSummary"] = coach_summary(evidence["groups"], evidence["comparisons"])
    association_rows, sensitivity_rows, attrition_rows, influence_rows, correlation_rows, design_rows = [], [], [], [], [], []
    for group in GROUPS:
        item = evidence["groups"][group]
        association_rows.extend({"group": group, "role": "portable", **row} for row in item["estimates"])
        association_rows.append({"group": group, "role": "ageControl", **item["ageControl"]})
        association_rows.extend({"group": group, "role": "availabilityControl", **row} for row in item["availabilityControls"])
        for result in item["sensitivities"]:
            sensitivity_rows.extend({"group": group, "sensitivity": result["id"], **row} for row in result["estimates"])
        _, _, complete_excluded = design_data(data[data.PositionGroup.eq(group)], "complete")
        attrition_rows.extend({"sample": "primary", **row} for row in item["attrition"]["excluded"])
        attrition_rows.extend({"sample": "fullCompleteSensitivity", **row} for row in complete_excluded)
        influence_rows.extend(fits[group]["influence"])
        corr = fits[group]["sample"][KEYS + ["Age"]].corr()
        for i, first in enumerate(corr.columns):
            for second in corr.columns[i + 1:]:
                correlation_rows.append({"group": group, "featureA": first, "featureB": second,
                                         "pearsonR": float(corr.loc[first, second]), "pairwiseObservedN": int(fits[group]["sample"][[first, second]].dropna().shape[0])})
        exported = fits[group]["x"].copy()
        exported.insert(0, "Player", fits[group]["sample"]["Player Name"])
        exported.insert(0, "Group", group)
        exported["LogSalary"] = fits[group]["sample"].LogSalary
        design_rows.append(exported)
    for name, rows in [("associations", association_rows), ("position-omnibus", evidence["comparisons"]["omnibus"]),
                       ("position-pairwise", evidence["comparisons"]["pairwise"]), ("sensitivity-associations", sensitivity_rows),
                       ("attrition", attrition_rows), ("influence", influence_rows), ("correlations", correlation_rows)]:
        pd.DataFrame(rows).to_csv(args.output / (name + ".csv"), index=False)
    pd.concat(design_rows, ignore_index=True).to_csv(args.output / "primary-design-rows.csv", index=False)
    # Browser assets contain aggregate evidence, not source salary or influence rows.
    for group in GROUPS:
        item = evidence["groups"][group]
        item["diagnostics"].pop("topInfluence", None)
        for sensitivity in item["sensitivities"]:
            sensitivity.get("diagnostics", {}).pop("topInfluence", None)
    evidence = loader.json_safe(evidence)
    encoded = json.dumps(evidence, indent=2, allow_nan=False)
    (ROOT / "data/nba-salary-evidence.json").write_text(encoded + "\n", encoding="utf-8")
    (ROOT / "data/nba-salary-evidence.js").write_text("// Generated by tools/analyze-nba-evidence.py. Exploratory evidence, not prediction weights.\nvar NBA_SALARY_EVIDENCE = " + encoded + ";\n", encoding="utf-8")
    write_report(evidence, args.output)
    if not args.skip_plots:
        write_forest(evidence, args.output)
    print(json.dumps({"n": {group: evidence["groups"][group]["n"] for group in GROUPS}, "summary": evidence["coachSummary"]}, indent=2))


if __name__ == "__main__":
    main()
