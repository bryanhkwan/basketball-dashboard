"""Independent mathematical and semantic checks for the exploratory evidence pipeline."""
import importlib.util
import json
from pathlib import Path
import unittest

import numpy as np
import pandas as pd
from scipy.linalg import block_diag

SPEC = importlib.util.spec_from_file_location("nba_evidence", Path(__file__).with_name("analyze-nba-evidence.py"))
evidence = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evidence)


def sample_data(n=90, group="Guards", seed=5):
    rng = np.random.default_rng(seed)
    data = pd.DataFrame({key: rng.uniform(1, 6, n) for key in evidence.KEYS})
    data["Height"] = rng.normal(78, 3, n)
    data["Age"] = rng.uniform(20, 37, n)
    data["MP"] = rng.uniform(5, 38, n)
    for key in ["eFG%", "3P%", "FT%"]:
        data[key] = rng.uniform(.25, .8, n)
    data["GP"] = rng.integers(1, 82, n)
    data["Player Name"] = [group + str(i) for i in range(n)]
    data["PositionGroup"] = group
    data["LogSalary"] = 9 + .045 * data.Height + .06 * data.Age + .12 * data.PPG + rng.normal(0, .2 + .01 * data.MP, n)
    data["Salary"] = np.exp(data.LogSalary)
    return data


class RobustEvidenceTests(unittest.TestCase):
    def test_published_asset_contains_no_individual_salary_or_influence_records(self):
        asset = Path(__file__).resolve().parents[1] / "data/nba-salary-evidence.json"
        if not asset.exists():
            self.skipTest("Generate evidence assets before artifact privacy validation")
        def inspect(value):
            if isinstance(value, dict):
                self.assertFalse("player" in value and "salary" in value, "Individual salary row leaked into public aggregate evidence")
                self.assertNotIn("topInfluence", value, "Individual influence rows belong only in local reports")
                for item in value.values():
                    inspect(item)
            elif isinstance(value, list):
                for item in value:
                    inspect(item)
        inspect(json.loads(asset.read_text(encoding="utf-8")))

    def test_hc3_matches_independent_sandwich_formula(self):
        rng = np.random.default_rng(20)
        x = np.column_stack([np.ones(80), rng.normal(size=(80, 3))])
        y = x @ np.array([2, .3, -.2, .4]) + rng.normal(size=80) * (.2 + np.abs(x[:, 1]))
        _, robust = evidence.checked_fit(x, y)
        inverse = np.linalg.inv(x.T @ x)
        beta = inverse @ x.T @ y
        residual = y - x @ beta
        h = np.einsum("ij,jk,ik->i", x, inverse, x)
        meat = x.T @ np.diag(residual ** 2 / (1 - h) ** 2) @ x
        expected = inverse @ meat @ inverse
        np.testing.assert_allclose(robust.params, beta, rtol=1e-11, atol=1e-11)
        np.testing.assert_allclose(robust.cov_params(), expected, rtol=1e-10, atol=1e-11)
        self.assertEqual(robust.df_resid, 76)

    def test_missing_accuracy_retains_nonshooters_without_faking_observation(self):
        data = sample_data()
        data.loc[[2, 3, 4], "3P%"] = np.nan
        data.loc[[5, 6], "FT%"] = np.nan
        data.loc[0, "eFG%"] = np.nan
        sample, x, excluded = evidence.design_data(data)
        self.assertEqual(len(sample), 89)
        self.assertTrue(pd.isna(sample.loc[2, "3P%"]))
        self.assertEqual(x.loc[2, "3P%"], 0)
        self.assertEqual(x.loc[2, "Unavailable 3P%"], 1)
        self.assertEqual(excluded[0]["player"], "Guards0")
        complete, _, _ = evidence.design_data(data, "complete")
        self.assertEqual(len(complete), 84)
        result, _ = evidence.fit_group(data)
        three = next(row for row in result["estimates"] if row["key"] == "3P%")
        self.assertEqual(three["nObserved"], 86)

    def test_singleton_indicator_rejects_undefined_hc3(self):
        data = sample_data()
        data.loc[0, "3P%"] = np.nan
        with self.assertRaisesRegex(evidence.UnavailableFit, "Leverage reaches one"):
            evidence.fit_group(data)

    def test_collinear_design_is_reported_not_silently_repaired(self):
        data = sample_data()
        data["BPG"] = data["APG"]
        with self.assertRaisesRegex(evidence.UnavailableFit, "rank deficient"):
            evidence.fit_group(data)

    def test_raw_units_change_slope_not_inference_or_common_increment_effect(self):
        data = sample_data()
        first, _ = evidence.fit_group(data)
        converted = data.copy(); converted["Height"] *= 2.54
        second, _ = evidence.fit_group(converted)
        a = next(row for row in first["estimates"] if row["key"] == "Height")
        b = next(row for row in second["estimates"] if row["key"] == "Height")
        self.assertAlmostEqual(a["coefficientRaw"], b["coefficientRaw"] * 2.54, places=10)
        self.assertAlmostEqual(a["pRaw"], b["pRaw"], places=10)
        self.assertAlmostEqual(a["coefficientStd"], b["coefficientStd"], places=10)

    def test_holm_uses_entire_family_and_fixed_threshold(self):
        rows = [{"pRaw": p} for p in [.001, .01, .03] + [1.] * 33]
        evidence.adjust_rows(rows, family_size=36)
        self.assertAlmostEqual(rows[0]["pHolm"], .036)
        self.assertAlmostEqual(rows[1]["pHolm"], .35)
        self.assertEqual(rows[2]["pHolm"], 1)
        self.assertEqual(sum(row["status"] == "supported" for row in rows), 1)
        self.assertEqual(evidence.status(.05), "supported")
        self.assertEqual(evidence.status(.050001), "suggestive")
        self.assertEqual(evidence.status(.10), "suggestive")
        self.assertEqual(evidence.status(.100001), "uncertain")
        with self.assertRaises(AssertionError):
            evidence.adjust_rows(rows[:12], family_size=36)

    def test_interacted_covariance_and_contrasts_match_independent_groups(self):
        fits = {}
        for i, group in enumerate(evidence.GROUPS):
            _, fit = evidence.fit_group(sample_data(group=group, seed=10 + i))
            fits[group] = fit
        x = block_diag(*(fits[group]["x"].to_numpy() for group in evidence.GROUPS))
        y = np.concatenate([fits[group]["sample"].LogSalary.to_numpy() for group in evidence.GROUPS])
        _, pooled = evidence.checked_fit(x, y)
        expected_covariance = block_diag(*(fits[group]["robust"].cov_params() for group in evidence.GROUPS))
        np.testing.assert_allclose(pooled.cov_params(), expected_covariance, rtol=1e-8, atol=1e-8)
        result = evidence.position_comparisons(fits)
        self.assertEqual(len(result["omnibus"]), 12)
        self.assertEqual(len(result["pairwise"]), 36)
        height = next(row for row in result["pairwise"] if row["key"] == "Height" and row["groupA"] == "Guards" and row["groupB"] == "Wings")
        i = list(fits["Guards"]["x"].columns).index("Height")
        a, b = fits["Guards"]["robust"], fits["Wings"]["robust"]
        self.assertAlmostEqual(height["differenceRaw"], a.params[i] - b.params[i], places=10)
        self.assertAlmostEqual(height["seRaw"], np.sqrt(a.cov_params()[i, i] + b.cov_params()[i, i]), places=10)
        self.assertEqual(result["dfResidual"], 270 - 42)


if __name__ == "__main__":
    unittest.main(verbosity=2)
