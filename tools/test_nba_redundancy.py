"""Checks for outcome-independent screening and selection inside held-out folds."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("nba_evidence_selection_test", ROOT / "tools/analyze-nba-evidence.py")
evidence = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(evidence)
trainer = evidence.loader


def synthetic_data(n=50):
    rng = np.random.default_rng(159)
    data = pd.DataFrame({key: rng.normal(size=n * 3) for key in trainer.KEYS})
    data["Age"] = rng.normal(27, 4, len(data))
    data["Height"] += 78
    data["PositionGroup"] = np.repeat(trainer.GROUPS, n)
    data["Player Name"] = ["Test" + str(i) for i in range(len(data))]
    data["LogSalary"] = 14 + rng.normal(size=len(data))
    data["Salary"] = np.exp(data.LogSalary)
    data["GP"] = 40
    return data


class RedundancyTests(unittest.TestCase):
    def test_selection_cannot_see_or_follow_salary(self):
        data = synthetic_data(90)
        data["MP"] = data["APG"] + .0001 * data["PPG"]
        selected = trainer.prediction_selection(data)
        changed = data.copy()
        changed["Salary"] = np.linspace(1, 1e15, len(data))
        changed["LogSalary"] = np.log(changed.Salary)
        self.assertEqual(selected, trainer.prediction_selection(changed))
        self.assertTrue(selected["excludedKeys"])
        self.assertIn("Height", selected["retainedKeys"])
        for values in selected["perGroupAfterVifs"].values():
            self.assertLessEqual(max(values.values()), 5 + 1e-9)
            self.assertIn("Age", values)

    def test_exact_redundancy_tie_follows_candidate_order(self):
        rng = np.random.default_rng(7)
        frame = pd.DataFrame(rng.normal(size=(100, 3)), columns=["Height", "Age", "A"])
        frame["B"] = frame["A"]
        result = trainer.redundancy.select_shared({"Guards": frame}, ["Height", "A", "B"])
        self.assertEqual(result["excludedKeys"], ["A"])
        self.assertEqual(result["retainedKeys"], ["Height", "B"])

    def test_unresolvable_protected_redundancy_fails_loudly(self):
        frame = pd.DataFrame({"Height": np.arange(30), "Age": np.arange(30)})
        with self.assertRaisesRegex(ValueError, "Protected predictors"):
            trainer.redundancy.select_shared({"Guards": frame}, ["Height"])

    def test_percentage_recentering_preserves_same_model_but_removes_flag_artifact(self):
        data = synthetic_data(60)
        data = data[data.PositionGroup.eq("Guards")].copy()
        data["3P%"] = np.linspace(.3, .4, len(data))
        data.loc[data.index[:10], "3P%"] = np.nan
        sample, centered, _ = evidence.design_data(data)
        placeholder = centered.copy()
        placeholder["3P%"] = sample["3P%"].fillna(0)
        _, a = evidence.checked_fit(centered.to_numpy(), sample.LogSalary.to_numpy())
        _, b = evidence.checked_fit(placeholder.to_numpy(), sample.LogSalary.to_numpy())
        np.testing.assert_allclose(centered.to_numpy() @ a.params, placeholder.to_numpy() @ b.params, atol=1e-10)
        i = list(centered).index("3P%")
        self.assertAlmostEqual(a.params[i], b.params[i], places=10)
        self.assertAlmostEqual(a.pvalues[i], b.pvalues[i], places=10)
        va = trainer.redundancy.vif_values(centered)["3P%"]
        vb = trainer.redundancy.vif_values(placeholder)["3P%"]
        self.assertLess(va, vb / 5)

    def test_every_nested_selector_sees_only_its_training_rows(self):
        data = synthetic_data()
        observed = []
        original = trainer.prediction_selection

        def record(rows):
            observed.append(tuple(sorted(rows.index)))
            return original(rows)

        seed = 32
        expected = []
        for outer, (train, test) in enumerate(StratifiedKFold(n_splits=3, shuffle=True, random_state=seed).split(data, data.PositionGroup)):
            training = data.iloc[train]
            for inner_train, inner_test in StratifiedKFold(n_splits=4, shuffle=True, random_state=seed + outer).split(training, training.PositionGroup):
                expected.append(tuple(sorted(training.iloc[inner_train].index)))
                self.assertFalse(set(training.iloc[inner_train].index) & set(data.iloc[test].index))
                self.assertFalse(set(training.iloc[inner_train].index) & set(training.iloc[inner_test].index))
            expected.append(tuple(sorted(training.index)))
        with patch.object(trainer, "prediction_selection", side_effect=record), patch.object(trainer, "ALPHAS", [30.]):
            _, log = trainer.joint_nested_validation(data, repeats=1, folds=3, seed=seed)
        self.assertEqual(observed, expected)
        self.assertEqual(sum(row["stage"] == "inner" for row in log), 12)
        self.assertEqual(sum(row["stage"] == "outer" for row in log), 3)
        self.assertTrue(all(len(indices) < len(data) for indices in observed))

    def test_published_masks_are_actual_coefficients_and_preserve_families(self):
        ridge = json.loads((ROOT / "data/nba-valuation-model.json").read_text(encoding="utf-8"))
        ols = json.loads((ROOT / "data/nba-salary-evidence.json").read_text(encoding="utf-8"))
        for asset, coefficient_key in [(ridge, "features"), (ols, "estimates")]:
            kept = asset["selection"]["retainedKeys"]
            removed = asset["selection"]["excludedKeys"]
            self.assertFalse(set(kept) & set(removed))
            self.assertEqual(set(kept) | set(removed), set(trainer.KEYS))
            for group in trainer.GROUPS:
                self.assertEqual([r["key"] for r in asset["groups"][group][coefficient_key]], kept)
                self.assertLessEqual(max(asset["selection"]["perGroupAfterVifs"][group].values()), 5 + 1e-9)
                for row in asset["groups"][group]["excludedFeatures"]:
                    self.assertNotIn("coefficient", row)
                    self.assertNotIn("pHolm", row)
        self.assertEqual(ols["policy"]["familySize"], 36)
        self.assertEqual(ols["policy"]["testedCount"], 3 * len(ols["selection"]["retainedKeys"]))
        self.assertTrue(all(ridge["groups"][g]["refinementComparison"]["sameFolds"] for g in trainer.GROUPS))


if __name__ == "__main__":
    unittest.main(verbosity=2)
