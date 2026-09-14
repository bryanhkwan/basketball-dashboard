#!/usr/bin/env python3
"""Reproduce NBA salary associations used as an experimental NCAA relative score.

Training only: Python, numpy, pandas, scipy, scikit-learn, matplotlib and openpyxl.
The frontend consumes generated plain JSON/JS, and has no Python/build dependency.
Run: python tools/train-nba-valuation.py
No source workbook cells are modified. See reports/nba-valuation/README.md.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import sklearn
from scipy.stats import spearmanr
from sklearn.base import clone
from sklearn.dummy import DummyRegressor
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GridSearchCV, KFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeRegressor, export_text, plot_tree

ROOT = Path(__file__).resolve().parents[1]
FEATURES = [
    ("Height", "Height", "inches", "Height"),
    ("MP", "Minutes per game", "minutes/game", "MP"),
    ("PPG", "Points per game", "points/game", "PTS"),
    ("RPG", "Rebounds per game", "rebounds/game", "TRB"),
    ("APG", "Assists per game", "assists/game", "AST"),
    ("SPG", "Steals per game", "steals/game", "STL"),
    ("BPG", "Blocks per game", "blocks/game", "BLK"),
    ("TOPG", "Turnovers per game", "turnovers/game", "TOV"),
    ("eFG%", "Effective field goal percentage", "fraction", "eFG%"),
    ("3P%", "Three-point percentage", "fraction", "3P%"),
    ("FT%", "Free throw percentage", "fraction", "FT%"),
    ("3PA/G", "Three-point attempts per game", "attempts/game", "3PA"),
]
KEYS = [f[0] for f in FEATURES]
GROUPS = ("Guards", "Wings", "Bigs")
ALPHAS = [0.1, 1.0, 10.0, 30.0, 100.0, 300.0]
SEED = 202623


def normalize_name(value):
    value = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", value.lower())


def position_group(value):
    """Use the first listed NBA position for a hybrid; never infer from height."""
    primary = re.split(r"[-/,; ]+", str(value).strip().upper())[0]
    return {"PG": "Guards", "SG": "Guards", "SF": "Wings", "PF": "Bigs", "C": "Bigs"}.get(primary)


def read_data(workbook, height_file):
    data = pd.read_excel(workbook, sheet_name="Data_Cleaned")
    input_rows = len(data)
    data["_name"] = data["Player Name"].map(normalize_name)
    duplicates = []
    keep = []
    for name, subset in data.groupby("_name", sort=False):
        if len(subset) == 1:
            keep.append(subset.index[0])
            continue
        aggregate = subset[subset.Team.astype(str).str.match(r"^(TOT|[2-9]TM)$")]
        if len(aggregate) != 1:
            raise ValueError(f"Ambiguous duplicate player {name}; require one aggregate row, not summed salaries.")
        keep.append(aggregate.index[0])
        duplicates.append({"name": name, "rows": len(subset), "keptTeam": str(aggregate.Team.iloc[0])})
    data = data.loc[keep].copy()
    data["PositionGroup"] = data.Position.map(position_group)
    if data.PositionGroup.isna().any():
        raise ValueError("Unmapped positions: " + str(data.loc[data.PositionGroup.isna(), "Position"].tolist()))
    heights = json.loads(height_file.read_text(encoding="utf-8"))
    records = heights["records"] if isinstance(heights, dict) else heights
    by_name = {}
    for record in records:
        key = normalize_name(record["playerName"])
        if key in by_name:
            raise ValueError(f"Duplicate height match: {record['playerName']}")
        by_name[key] = record
    data["Height"] = data["_name"].map(lambda key: by_name.get(key, {}).get("heightInches"))
    data["HeightSource"] = data["_name"].map(lambda key: by_name.get(key, {}).get("sourceUrl", ""))
    data["HeightSourceSeason"] = data["_name"].map(lambda key: by_name.get(key, {}).get("sourceSeason", ""))
    data["HeightMatchMethod"] = data["_name"].map(lambda key: by_name.get(key, {}).get("matchMethod", ""))
    data["HeightRetrievedAt"] = data["_name"].map(lambda key: by_name.get(key, {}).get("retrievedAt", ""))
    data["HeightObservationBasis"] = data["_name"].map(lambda key: by_name.get(key, {}).get("heightObservationBasis", ""))
    data["EspnId"] = data["_name"].map(lambda key: by_name.get(key, {}).get("espnId", ""))
    data["NbaId"] = data["_name"].map(lambda key: by_name.get(key, {}).get("nbaId", ""))
    for key, _, _, source in FEATURES:
        data[key] = pd.to_numeric(data[source], errors="coerce")
    # Workbook attempt volumes are rounded per-game figures, not exact totals.
    # A positive percentage proves some attempts even when its volume rounds to
    # 0.0 (e.g. Walker Kessler's 0.333 three-point percentage). Preserve it.
    rounded_zero_positive = []
    for key, attempts in [("3P%", "3PA/G"), ("FT%", "FTA"), ("eFG%", "FGA")]:
        positive = data[attempts].eq(0) & data[key].gt(0)
        rounded_zero_positive.extend({"player": row["Player Name"], "percentage": key, "value": float(row[key])}
                                     for _, row in data.loc[positive].iterrows())
        data.loc[data[attempts].eq(0) & ~data[key].gt(0), key] = np.nan
    for key in ["3P%", "FT%", "eFG%"]:
        maximum = 1.5 if key == "eFG%" else 1.0
        if (data[key].dropna().lt(0) | data[key].dropna().gt(maximum)).any():
            raise ValueError(f"Expected fractional percentage in {key}")
    invalid_height = data.Height.notna() & ~data.Height.between(60, 95)
    if invalid_height.any():
        raise ValueError("Invalid sourced NBA height")
    valid_target = data.Salary.gt(0) & np.isfinite(data.Salary) & data.GP.gt(0)
    excluded = data.loc[~valid_target, ["Player Name", "Salary", "GP"]].to_dict("records")
    data = data.loc[valid_target].reset_index(drop=True)
    data["LogSalary"] = np.log(data.Salary)
    data["PossiblePartialSeasonContract"] = data.Salary.lt(1_000_000)
    audit = {
        "inputRows": input_rows, "modeledRows": len(data), "duplicateResolutions": duplicates,
        "excludedInvalidSalaryOrNoGames": excluded,
        "heightMatched": int(data.Height.notna().sum()),
        "heightMissingPlayers": data.loc[data.Height.isna(), "Player Name"].tolist(),
        "missingByFeature": {key: int(data[key].isna().sum()) for key in KEYS},
        "positivePercentagesPreservedWithRoundedZeroAttempts": rounded_zero_positive,
        "groupCounts": {group: int(data.PositionGroup.eq(group).sum()) for group in GROUPS},
        "salarySummary": {key: float(value) for key, value in data.Salary.describe().items()},
        "salaryBelowMillion": int(data.PossiblePartialSeasonContract.sum()),
        "salaryAboveThirtyMillion": int(data.Salary.ge(30_000_000).sum()),
        "gamesBelowTwenty": int(data.GP.lt(20).sum()),
        "ageBelowTwentyThree": int(data.Age.lt(23).sum()),
        "heightMetadata": heights.get("metadata", {}) if isinstance(heights, dict) else {},
    }
    return data, audit


def make_ridge():
    return Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler()), ("model", Ridge())])


def fit_ridge(x, y, seed, folds=4):
    search = GridSearchCV(make_ridge(), {"model__alpha": ALPHAS}, scoring="neg_root_mean_squared_error",
                          cv=KFold(n_splits=folds, shuffle=True, random_state=seed), n_jobs=1)
    search.fit(x, y)
    return search.best_estimator_


def fit_tree(x, y, seed):
    tree = Pipeline([("imputer", SimpleImputer(strategy="median")),
                     ("model", DecisionTreeRegressor(random_state=seed))])
    search = GridSearchCV(tree, {"model__max_depth": [2, 3, 4], "model__min_samples_leaf": [8, 16]},
                          scoring="neg_root_mean_squared_error",
                          cv=KFold(n_splits=4, shuffle=True, random_state=seed), n_jobs=1)
    search.fit(x, y)
    return search.best_estimator_


def neutral_age(model, x):
    out = x.copy()
    # Last feature is Age; training mean -> standardized zero, not the test mean.
    out[:, -1] = model.named_steps["scaler"].mean_[-1]
    return out


def metrics(y, pred, smear_pred=None):
    return {
        "logR2": float(r2_score(y, pred)),
        "logRMSE": float(np.sqrt(mean_squared_error(y, pred))),
        "logMAE": float(mean_absolute_error(y, pred)),
        "salaryMedianMAE": float(mean_absolute_error(np.exp(y), np.exp(pred))),
        "salaryMeanMAE": float(mean_absolute_error(np.exp(y), smear_pred)) if smear_pred is not None else None,
        "spearman": float(spearmanr(y, pred).statistic) if np.ptp(pred) > 1e-12 else None,
        "medianMultiplicativeError": float(np.exp(np.median(np.abs(y - pred)))),
    }


def nested_validation(data, repeats, folds, seed):
    model_names = ["baseline", "unadjustedRidge", "ageAdjustedRidge", "deployedRidge", "noHeightRidge", "noHeightAgeAdjustedRidge", "portableTree"]
    prediction_rows, fold_rows, importance_rows = [], [], []
    x = data[KEYS].to_numpy(float)
    xa = data[KEYS + ["Age"]].to_numpy(float)
    xn = data[[key for key in KEYS if key != "Height"] + ["Age"]].to_numpy(float)
    y = data.LogSalary.to_numpy(float)
    for repeat in range(repeats):
        split = KFold(n_splits=folds, shuffle=True, random_state=seed + repeat)
        for fold, (train, test) in enumerate(split.split(x)):
            fold_seed = seed + 100 * repeat + fold
            ridge = fit_ridge(x[train], y[train], fold_seed)
            adjusted = fit_ridge(xa[train], y[train], fold_seed)
            without_height = fit_ridge(xn[train], y[train], fold_seed)
            tree = fit_tree(x[train], y[train], fold_seed)
            dummy = DummyRegressor(strategy="mean").fit(x[train], y[train])
            candidates = {
                "baseline": (dummy, x[train], x[test]),
                "unadjustedRidge": (ridge, x[train], x[test]),
                "ageAdjustedRidge": (adjusted, xa[train], xa[test]),
                "deployedRidge": (adjusted, neutral_age(adjusted, xa[train]), neutral_age(adjusted, xa[test])),
                "noHeightRidge": (without_height, neutral_age(without_height, xn[train]), neutral_age(without_height, xn[test])),
                "noHeightAgeAdjustedRidge": (without_height, xn[train], xn[test]),
                "portableTree": (tree, x[train], x[test]),
            }
            for name, (model, train_x, test_x) in candidates.items():
                predicted = model.predict(test_x)
                # Duan smearing estimated strictly from outer-training residuals.
                smear = float(np.mean(np.exp(y[train] - model.predict(train_x))))
                predicted_mean = np.exp(predicted) * smear
                fold_rows.append({"repeat": repeat, "fold": fold, "model": name, "trainN": len(train),
                                  "testN": len(test), **metrics(y[test], predicted, predicted_mean)})
                for j, index in enumerate(test):
                    prediction_rows.append({"repeat": repeat, "fold": fold, "model": name,
                                            "player": data["Player Name"].iloc[index], "observedSalary": float(np.exp(y[index])),
                                            "observedLogSalary": y[index], "predictedLogSalary": predicted[j],
                                            "predictedMedianSalary": float(np.exp(predicted[j])), "predictedMeanSalary": predicted_mean[j]})
            perm = permutation_importance(tree, x[test], y[test], scoring="neg_mean_squared_error", n_repeats=10,
                                          random_state=fold_seed)
            for j, key in enumerate(KEYS):
                importance_rows.append({"repeat": repeat, "fold": fold, "key": key,
                                        "increaseInHeldoutLogMSE": float(perm.importances_mean[j])})
        print(f"  validation repeat {repeat + 1}/{repeats}", flush=True)
    pred_frame = pd.DataFrame(prediction_rows)
    summary = {}
    for name in model_names:
        subset = pred_frame[pred_frame.model.eq(name)]
        by_repeat = []
        for _, sample in subset.groupby("repeat"):
            by_repeat.append(metrics(sample.observedLogSalary, sample.predictedLogSalary, sample.predictedMeanSalary))
        pooled = metrics(subset.observedLogSalary, subset.predictedLogSalary, subset.predictedMeanSalary)
        pooled["repeatLogR2"] = [m["logR2"] for m in by_repeat]
        pooled["repeatLogRMSE"] = [m["logRMSE"] for m in by_repeat]
        pooled["uniquePlayers"] = len(data)
        pooled["heldoutPredictions"] = len(subset)
        summary[name] = pooled
    importance_frame = pd.DataFrame(importance_rows)
    importance = []
    for key, subset in importance_frame.groupby("key", sort=False):
        values = subset.increaseInHeldoutLogMSE.to_numpy()
        importance.append({"key": key, "meanIncreaseInHeldoutLogMSE": float(values.mean()),
                           "foldSD": float(values.std(ddof=1)), "positiveFoldShare": float((values > 0).mean())})
    return summary, pred_frame, pd.DataFrame(fold_rows), importance, importance_frame


def bootstrap_coefficients(x, y, final_model, count, seed):
    rng = np.random.default_rng(seed)
    reference_scale = final_model.named_steps["scaler"].scale_
    coefficients = []
    for _ in range(count):
        sample = rng.integers(0, len(x), len(x))
        model = clone(final_model).fit(x[sample], y[sample])
        # Express every bootstrap coefficient on the original training SD scale.
        raw = model.named_steps["model"].coef_ / model.named_steps["scaler"].scale_
        coefficients.append(raw * reference_scale)
    return np.asarray(coefficients)


def feature_records(model, bootstrap, keys):
    coef = model.named_steps["model"].coef_
    scales = model.named_steps["scaler"].scale_
    means = model.named_steps["scaler"].mean_
    medians = model.named_steps["imputer"].statistics_
    total = float(np.abs(coef[:len(KEYS)]).sum())
    records = []
    by_key = {key: (label, unit) for key, label, unit, _ in FEATURES}
    for j, key in enumerate(keys):
        label, unit = by_key.get(key, ("Age (NBA control only)", "years"))
        lower, upper = np.quantile(bootstrap[:, j], [.025, .975])
        records.append({
            "key": key, "label": label, "unit": unit, "mean": float(means[j]), "scale": float(scales[j]),
            "median": float(medians[j]), "coefficient": float(coef[j]), "ciLow": float(lower), "ciHigh": float(upper),
            "positiveShare": float((bootstrap[:, j] > 0).mean()),
            "importanceShare": float(abs(coef[j]) / total) if key != "Age" else None,
            "associatedSalaryChangePctPerSD": float(100 * np.expm1(coef[j])),
            "rawCoefficient": float(coef[j] / scales[j]),
            "intervalCrossesZero": bool(lower <= 0 <= upper),
        })
    return records


def sensitivity(data, reference_model, seed):
    results = []
    reference_scale = reference_model.named_steps["scaler"].scale_
    for label, subset in [("atLeast20Games", data[data.GP.ge(20)]), ("ageAtLeast23", data[data.Age.ge(23)]),
                          ("salaryAtLeastOneMillion", data[data.Salary.ge(1_000_000)])]:
        model = fit_ridge(subset[KEYS + ["Age"]].to_numpy(float), subset.LogSalary.to_numpy(), seed)
        scaled = model.named_steps["model"].coef_ / model.named_steps["scaler"].scale_ * reference_scale
        results.append({"sample": label, "n": len(subset), "alpha": float(model.named_steps["model"].alpha),
                        "coefficientsOnPrimaryTrainingSD": {key: float(scaled[j]) for j, key in enumerate(KEYS + ["Age"])}})
    return results


def json_safe(value):
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, (float, np.floating)):
        return float(value) if math.isfinite(value) else None
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, np.bool_):
        return bool(value)
    return value


def write_plots(model, predictions, output):
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
    fig, axes = plt.subplots(1, 3, figsize=(15, 6), sharey=True, sharex=True)
    for ax, group in zip(axes, GROUPS):
        features = model["groups"][group]["features"]
        values = np.array([f["coefficient"] for f in features])
        low = np.array([f["ciLow"] for f in features])
        high = np.array([f["ciHigh"] for f in features])
        y = np.arange(len(features))
        ax.barh(y, values, color=["#1b7c80" if v >= 0 else "#bc4b51" for v in values], height=.65)
        ax.hlines(y, low, high, color="#273444", linewidth=1.4)
        ax.plot(low, y, "|", color="#273444")
        ax.plot(high, y, "|", color="#273444")
        ax.axvline(0, color="#67788a", linewidth=.8)
        ax.set_yticks(y, [f["key"] for f in features])
        ax.set_title(f"{group} (n={model['groups'][group]['n']})")
        ax.set_xlabel("Log-salary association per NBA feature SD")
        ax.grid(axis="x", alpha=.15)
    axes[0].invert_yaxis()
    fig.suptitle("NBA 2022–23 salary coefficients, controlling for age", fontsize=16, x=.5, y=.98)
    fig.text(.5, .018, "Lines: 95% conditional bootstrap intervals. Associations are not causal effects or NCAA pay estimates.", ha="center", fontsize=10)
    fig.tight_layout(rect=(0, .05, 1, .94))
    fig.savefig(output / "coefficients-by-position.png", dpi=170)
    plt.close(fig)

    fig, axes = plt.subplots(1, 3, figsize=(14, 4.7), sharex=True, sharey=True)
    for ax, group in zip(axes, GROUPS):
        subset = predictions[(predictions.group == group) & (predictions.model == "deployedRidge") & (predictions["repeat"] == 0)]
        ax.scatter(subset.observedSalary / 1e6, subset.predictedMedianSalary / 1e6, s=20, alpha=.55, color="#1b7c80")
        ax.plot([.003, 60], [.003, 60], "--", color="#6b7280", linewidth=1)
        ax.set_xscale("log")
        ax.set_yscale("log")
        ax.set_xlabel("Observed NBA salary ($M, log scale)")
        score = model["groups"][group]["metrics"]["deployedRidge"]["logR2"]
        ax.set_title(f"{group}: repeated held-out log R² {score:.2f}")
        ax.grid(alpha=.15)
    axes[0].set_ylabel("Held-out median prediction ($M, log scale)")
    fig.suptitle("Salary predictions with age held neutral", fontsize=15)
    fig.text(.5, .015, f"One held-out prediction per player shown (first repeat). Reported metrics use all {model['validation']['repeats']} repeats.", ha="center", fontsize=10)
    fig.tight_layout(rect=(0, .04, 1, .94))
    fig.savefig(output / "heldout-predictions.png", dpi=170)
    plt.close(fig)


def write_tree_plot(tree, group, output):
    fig, ax = plt.subplots(figsize=(18, 8))
    plot_tree(tree.named_steps["model"], feature_names=KEYS, filled=True, rounded=True,
              impurity=False, precision=2, fontsize=8, ax=ax)
    ax.set_title(f"{group}: illustrative log-salary decision tree (full-data fit)")
    fig.tight_layout()
    fig.savefig(output / f"tree-{group}.png", dpi=160)
    plt.close(fig)


def write_report(model, output):
    audit = model["audit"]
    lines = ["# NBA salary associations for NCAA valuation", "", "## What was fitted", "",
             f"The supplied 2022–23 workbook contains {audit['modeledRows']} unique modeled players. "
             f"Height was sourced for {audit['heightMatched']} players. The original workbook is unchanged. "
             "Only positive recorded salaries and at least one game qualify. No player is removed simply for being unusually paid.", "",
             "NBA positions map PG/SG → Guards, SF → Wings, PF/C → Bigs. A hybrid uses its first listed position. "
             "The workbook has one row per player, with season totals already combined for traded players; no salary is summed across teams. "
             "The Team field can name the last team even when the statistics cover the full season.", "",
             "Each position gets a ridge regression for natural log recorded salary, with 12 shared basketball features plus age. "
             "Features are median-imputed and standardized inside each training fold. Age is a diagnostic control for some contract/tenure "
             "confounding; it is not experience, rookie-contract status, draft slot, injury history, future potential, or past performance. "
             "No salary-derived predictors, team identity, player name, totals duplicating per-game statistics, or unavailable NCAA advanced metrics enter the models.", "",
             "Attempt volumes in this workbook are rounded per-game values. A positive percentage is retained even when its attempt "
             "volume rounds to 0.0; zero or missing percentages with zero rounded volume are treated as unavailable because exact "
             "attempt totals were not supplied. Effective field-goal percentage may legitimately reach 1.5 (150%). "
             "Missing values use training medians. Heights are current ESPN listed bios retrieved in September 2026, matched to "
             "the 2022–23 athlete population and teams; historical 2022–23 measurements were unavailable. Heights may have changed "
             "or been revised. This temporal mismatch means the validation is not a strict 2022–23 as-of backtest. "
             "Height is listed roster height, not a standardized combine measurement.", "",
             "## Validation", "",
             f"Outer validation uses {model['validation']['folds']} folds repeated {model['validation']['repeats']} times. "
             "The same outer splits compare a log-mean baseline, unadjusted portable ridge, age-adjusted ridge, age-neutral deployed ridge, "
             "paired no-height models, and a constrained decision tree. Ridge penalties and tree depth/leaf size are selected by four-fold "
             "inner CV on outer-training data only. Median imputation and scaling also stay inside the fitting pipeline. "
             "The deployed validation holds test age at that fold's training mean, matching the dashboard's deliberate omission of age. "
             "Ages are used normally only in the diagnostic full-model result.", "",
             "All metrics below come from held-out predictions, pooled across repeats; repeated observations are not independent extra players. "
             "Exponentiating a log prediction estimates a conditional median, not an arithmetic mean. Dollar mean predictions use a Duan "
             "smearing factor estimated from outer-training residuals only. Neither dollar prediction is used for NCAA pay.", ""]
    for group in GROUPS:
        item = model["groups"][group]
        lines.extend([f"### {group} (n={item['n']})", ""])
        for key, label in [("baseline", "Baseline"), ("unadjustedRidge", "Unadjusted ridge"), ("ageAdjustedRidge", "Ridge with observed age"),
                           ("deployedRidge", "Ridge with neutral age, exported coefficients"), ("portableTree", "Portable decision tree")]:
            m = item["metrics"][key]
            lines.append(f"- {label}: held-out log R² {m['logR2']:.3f}; log RMSE {m['logRMSE']:.3f}; log MAE {m['logMAE']:.3f}; "
                         f"median-salary MAE ${m['salaryMedianMAE']:,.0f}; smearing-adjusted mean-salary MAE ${m['salaryMeanMAE']:,.0f}.")
        lines.extend(["", f"Adding height changes neutral-age log RMSE by {item['heightAblation']['logRMSEImprovement']:+.4f} "
                      "(positive means improvement) and log R² by "
                      f"{item['heightAblation']['logR2Improvement']:+.4f}. This is a paired predictive comparison, not proof of a causal height premium.", ""])
        height = item["features"][0]
        lines.extend([f"Height coefficient: {height['coefficient']:+.4f} log points per NBA height SD, conditional bootstrap interval "
                      f"[{height['ciLow']:+.4f}, {height['ciHigh']:+.4f}]. Age coefficient (not transferred): "
                      f"{item['ageControl']['coefficient']:+.4f}.", ""])
    lines.extend(["## Reading coefficients and tree importance", "",
                  "The signed standardized ridge coefficient describes the fitted log-salary association for a one-NBA-standard-deviation "
                  "increase, holding other features fixed. exp(coefficient) − 1 converts that association to a relative percentage. "
                  "The absolute-coefficient share is a display summary that sums to 100% across portable features; it is not a share of "
                  "salary or variance explained. Correlated features share signal and can change signs, even with ridge regularization.", "",
                  f"Intervals use {model['validation']['bootstrapSamples']} player bootstraps with the chosen final ridge penalty fixed. "
                  "They are conditional stability intervals, not formal p-values, independent confidence claims, or a correction for "
                  "model selection and multiple comparisons. Coefficients are expressed on the original sample's SD scale across bootstraps. "
                  "Sensitivity fits keep players with at least 20 games, players aged at least 23, or salaries at least $1 million. "
                  "Age 23 is only a sensitivity screen and does not identify rookies.", "",
                  "Tree permutation importance is the mean increase in held-out log MSE when a feature is shuffled. "
                  "Negative values are retained and can indicate noise. Correlation makes individual permutation rankings imperfect. "
                  "The exported model stays a ridge regression for transparent additive contributions even if a tree wins a metric; "
                  "the tree is a comparison model, not a second blended dollar engine.", "",
                  "## NCAA application", "",
                  "Use the age-adjusted NBA coefficients on comparable NCAA features standardized within the current NCAA league and "
                  "position group. Each observed feature contributes coefficient × NCAA z-score, clipped to ±3 before multiplication. "
                  "An unavailable input contributes zero (peer-average neutral) and reduces completeness. Percentages without attempts "
                  "are unavailable when exact totals confirm zero attempts; positive percentages with rounded-zero attempt volumes are retained. "
                  "Age contributes zero. The NBA intercept and NBA salary dollars are never transferred. "
                  "This adaptation preserves relative feature associations but changes the data domain; NBA CV does not validate NCAA rankings or pay.", "",
                  "The reference pool is the dashboard's loaded college-player feed, not an independently verified Division I or all-NCAA "
                  "population. It can mix competition levels, and some college position groups are inferred. Changing the loaded population "
                  "changes peer means, standard deviations and valuation anchors. A conference multiplier is an explicit assumption; it "
                  "does not establish validated comparisons across divisions. Missing height is neutral, not a guessed measurement. "
                  "Input completeness measures availability rather than reliability: one-game percentages and small minute samples can "
                  "be complete but unstable. Clipping limits their numerical influence without making them reliable.", "",
                  "Map the resulting relative score to explicit NCAA valuation anchors already configured by the dashboard. "
                  "Those anchors determine the NCAA dollar level. Report the result as an experimental NBA-informed valuation estimate, "
                  "not reported compensation. Do not apply a second minutes multiplier: minutes already enters the learned score. "
                  "WBB transfer is especially unvalidated because the source consists entirely of men's professional basketball players.", "",
                  "The average-pay setting prices the mean-score player before conference adjustments and caps. Because the mapping is "
                  "exponential, it does not force the arithmetic average of all player quotes to equal that setting or reconcile a team budget. "
                  "The dashboard can subsequently apply its existing translation-risk and manual scout adjustments. These are additional "
                  "college scouting assumptions, not NBA regression coefficients. Per-feature contributions reconcile to the learned signal, "
                  "not by themselves to the final dollar quote. Projection floors and ceilings are scouting scenarios around the base quote, "
                  "not statistical prediction intervals learned from NBA or NCAA contracts.", "",
                  "## Limits of the supplied target", "",
                  f"Recorded salaries range from ${audit['salarySummary']['min']:,.0f} to ${audit['salarySummary']['max']:,.0f}; "
                  f"{audit['salaryBelowMillion']} records are below $1 million. The workbook has no contract term, annualized rate, "
                  "guarantee, endorsement, draft-slot or experience metadata. Short-term/prorated salaries and veteran contracts can "
                  "reflect very different pay-setting rules. Treat Salary as the supplied 2022–23 recorded compensation figure, without "
                  "silently annualizing it. The source's completeness and salary definitions were not independently audited.", "",
                  "This is a small, selected, single-season cross-section. Pay was negotiated before or during the measured performance "
                  "season and depends on past achievement, expected future performance, contracts, bargaining rules, injuries, market "
                  "conditions and opportunity. A positive coefficient is an association rather than evidence that improving that stat "
                  "causes a corresponding raise. NCAA revenue sharing, roster rules and commercial NIL have different mechanisms.", "",
                  "## Reproduction and files", "",
                  "Run `python tools/train-nba-valuation.py`. Training dependencies are listed in `tools/requirements-nba-valuation.txt`; "
                  "there is no frontend build step. The workbook and sourced height JSON hashes are embedded in the generated model. "
                  "Use the same source files, seed and dependency versions to reproduce results. The generated timestamp will change.", "",
                  "- `enriched-nba-2022-23.csv`: original fields plus source-linked height and modeled fields.",
                  "- `coefficients.csv`: standardized associations, stability intervals, age controls and display shares.",
                  "- `validation-predictions.csv`: every held-out prediction, model, fold and repeat.",
                  "- `validation-folds.csv`: held-out fold metrics.",
                  "- `tree-heldout-permutation.csv`: fold-level feature permutation results.",
                  "- `sensitivity-coefficients.csv`: restricted-sample coefficient comparisons.",
                  "- `feature-correlations.csv`: feature correlations exposing collinearity.",
                  "- `coefficients-by-position.png`, `heldout-predictions.png`: static research figures.",
                  "- `tree-Guards.txt`, `tree-Wings.txt`, `tree-Bigs.txt`: final illustrative tree rules.",
                  "- `../../data/nba-valuation-model.json` and `.js`: identical deployable model data.", ""])
    (output / "README.md").write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=ROOT / "nba_2022-23-all_stats_with_salary (1).xlsx")
    parser.add_argument("--heights", type=Path, default=ROOT / "data/nba-2022-23-heights.json")
    parser.add_argument("--output", type=Path, default=ROOT / "reports/nba-valuation")
    parser.add_argument("--bootstrap", type=int, default=500)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()
    if args.bootstrap < 100 or args.repeats < 2 or args.folds < 3:
        parser.error("Require at least100 bootstraps,2repeats,3folds to avoid publishing smoke-test metrics.")
    args.output.mkdir(parents=True, exist_ok=True)
    data, audit = read_data(args.workbook, args.heights)
    model = {
        "schemaVersion": 1, "id": "nba-2022-23-age-adjusted-ridge-v1", "generatedAt": datetime.now(timezone.utc).isoformat(),
        "season": "2022-23", "target": "natural log of workbook Salary (recorded season compensation, not verified annualized rate)",
        "modelType": "age-adjusted standardized ridge; age held neutral for NCAA", "experimental": True,
        "featureKeys": KEYS, "positionMapping": {"PG": "Guards", "SG": "Guards", "SF": "Wings", "PF": "Bigs", "C": "Bigs"},
        "sources": [{"type": "userWorkbook", "file": args.workbook.name, "sheet": "Data_Cleaned", "sha256": hashlib.sha256(args.workbook.read_bytes()).hexdigest()},
                    {"type": "heightData", "file": args.heights.name, "sha256": hashlib.sha256(args.heights.read_bytes()).hexdigest()}],
        "runtime": {"python": platform.python_version(), "numpy": np.__version__, "pandas": pd.__version__, "scikitLearn": sklearn.__version__},
        "validation": {"method": "nested repeated K-fold cross-validation", "folds": args.folds, "repeats": args.repeats,
                       "innerFolds": 4, "seed": args.seed, "bootstrapSamples": args.bootstrap, "bootstrapAlphaRetuned": False,
                       "selectionMetric": "log RMSE", "ridgeAlphaGrid": ALPHAS,
                       "dollarPrediction": "exp(logPrediction) is median; mean uses training-only Duan residual smearing",
                       "metricAggregation": "all outer-heldout predictions pooled across repeats; no in-sample scores"},
        "transfer": {"featureScaling": "within NCAA league and position: (value-mean)/populationSD", "zClip": 3,
                     "missingContribution": 0, "ageContribution": 0, "useNbaIntercept": False, "useNbaSalaryScale": False,
                     "dollarCalibration": "user-configured NCAA valuation anchors; not learned NCAA compensation",
                     "applyAdditionalMinutesMultiplier": False, "wbbValidated": False, "ncaaValidated": False},
        "limitations": ["Associations are not causal pay effects.", "NCAA and WBB salary transfer is unvalidated.",
                        "Recorded NBA salaries mix contract and tenure circumstances; no experience or contract terms are supplied.",
                        "One season, small position cohorts and correlated features limit coefficient stability.",
                        "Age is controlled in training and held neutral in the transferred score.",
                        "NCAA anchors determine dollars; this model supplies a relative basketball score."],
        "audit": audit, "groups": {},
    }
    all_predictions, all_folds, all_coefficients, all_importance, all_sensitivity, all_correlations = [], [], [], [], [], []
    for group_index, group in enumerate(GROUPS):
        subset = data[data.PositionGroup.eq(group)].copy().reset_index(drop=True)
        seed = args.seed + group_index * 1000
        print(f"Fitting {group}: {len(subset)} players", flush=True)
        validation, predictions, fold_metrics, importance, importance_folds = nested_validation(subset, args.repeats, args.folds, seed)
        x = subset[KEYS + ["Age"]].to_numpy(float)
        y = subset.LogSalary.to_numpy(float)
        final = fit_ridge(x, y, seed)
        boots = bootstrap_coefficients(x, y, final, args.bootstrap, seed + 500)
        features = feature_records(final, boots, KEYS + ["Age"])
        sensitivities = sensitivity(subset, final, seed)
        group_model = {
            "n": len(subset), "intercept": float(final.named_steps["model"].intercept_), "alpha": float(final.named_steps["model"].alpha),
            "features": features[:-1], "ageControl": features[-1], "metrics": validation,
            "treePermutationImportance": importance, "sensitivity": sensitivities,
            "heightAblation": {
                "logRMSEImprovement": validation["noHeightRidge"]["logRMSE"] - validation["deployedRidge"]["logRMSE"],
                "logR2Improvement": validation["deployedRidge"]["logR2"] - validation["noHeightRidge"]["logR2"],
                "ageAdjustedLogRMSEImprovement": validation["noHeightAgeAdjustedRidge"]["logRMSE"] - validation["ageAdjustedRidge"]["logRMSE"],
                "ageAdjustedLogR2Improvement": validation["ageAdjustedRidge"]["logR2"] - validation["noHeightAgeAdjustedRidge"]["logR2"],
            },
        }
        model["groups"][group] = group_model
        # Check the plain-data contract independently of sklearn's pipeline predict.
        reconstructed = np.full(len(subset), group_model["intercept"])
        for record in features:
            values = subset[record["key"]].fillna(record["median"]).to_numpy(float)
            reconstructed += record["coefficient"] * (values - record["mean"]) / record["scale"]
        if not np.allclose(reconstructed, final.predict(x), rtol=0, atol=1e-10):
            raise AssertionError("Exported coefficient algebra does not match the fitted pipeline")
        if not np.isclose(sum(record["importanceShare"] for record in features[:-1]), 1):
            raise AssertionError("Portable coefficient shares do not sum to one")
        for frame in [predictions, fold_metrics, importance_folds]:
            frame.insert(0, "group", group)
        all_predictions.append(predictions)
        all_folds.append(fold_metrics)
        all_importance.append(importance_folds)
        all_coefficients.extend({"group": group, **record} for record in features)
        for fit in sensitivities:
            for key, coefficient in fit["coefficientsOnPrimaryTrainingSD"].items():
                all_sensitivity.append({"group": group, "sample": fit["sample"], "n": fit["n"], "alpha": fit["alpha"], "key": key, "coefficient": coefficient})
        correlations = subset[KEYS + ["Age"]].corr()
        for i, key in enumerate(correlations.index):
            for other in correlations.columns[i + 1:]:
                all_correlations.append({"group": group, "featureA": key, "featureB": other, "pearsonR": correlations.loc[key, other]})
        final_tree = fit_tree(subset[KEYS].to_numpy(float), y, seed)
        (args.output / f"tree-{group}.txt").write_text(
            "Illustrative full-data tree; leaves are natural log NBA salary, not NCAA dollars.\n"
            "Predictive metrics in README use held-out trees fitted separately within each outer fold.\n\n" +
            export_text(final_tree.named_steps["model"], feature_names=KEYS), encoding="utf-8")
        write_tree_plot(final_tree, group, args.output)
        print(f"  held-out logR2: exported={validation['deployedRidge']['logR2']:.3f}, age-adjusted={validation['ageAdjustedRidge']['logR2']:.3f}, tree={validation['portableTree']['logR2']:.3f}", flush=True)
    predictions = pd.concat(all_predictions, ignore_index=True)
    data.drop(columns="_name").to_csv(args.output / "enriched-nba-2022-23.csv", index=False)
    predictions.to_csv(args.output / "validation-predictions.csv", index=False)
    pd.concat(all_folds, ignore_index=True).to_csv(args.output / "validation-folds.csv", index=False)
    pd.DataFrame(all_coefficients).to_csv(args.output / "coefficients.csv", index=False)
    pd.concat(all_importance, ignore_index=True).to_csv(args.output / "tree-heldout-permutation.csv", index=False)
    pd.DataFrame(all_sensitivity).to_csv(args.output / "sensitivity-coefficients.csv", index=False)
    pd.DataFrame(all_correlations).to_csv(args.output / "feature-correlations.csv", index=False)
    model = json_safe(model)
    encoded = json.dumps(model, indent=2, ensure_ascii=True, allow_nan=False)
    json_path = ROOT / "data/nba-valuation-model.json"
    json_path.write_text(encoded + "\n", encoding="utf-8")
    (ROOT / "data/nba-valuation-model.js").write_text(
        "// Generated by tools/train-nba-valuation.py. Do not edit coefficients by hand.\nvar NBA_VALUATION_MODEL = " + encoded + ";\n", encoding="utf-8")
    write_report(model, args.output)
    write_plots(model, predictions, args.output)
    print(f"Wrote {json_path} and {args.output}", flush=True)


if __name__ == "__main__":
    main()
