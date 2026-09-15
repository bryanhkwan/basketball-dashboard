"""Verify the one-page matrix against both model snapshots and printed output."""
import copy
import hashlib
import importlib.util
import json
import math
import tempfile
import unittest
from pathlib import Path

import fitz
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("coach_brief", ROOT / "tools/build-coach-brief.py")
brief = importlib.util.module_from_spec(spec)
spec.loader.exec_module(brief)


class CoachBriefTests(unittest.TestCase):
    def test_published_pdf_matches_both_current_models(self):
        evidence, model, facts = brief.read_facts()
        metadata = json.loads(brief.METADATA.read_text(encoding="utf-8"))
        self.assertEqual(metadata["evidenceId"], evidence["id"])
        self.assertEqual(metadata["ridgeModelId"], model["id"])
        self.assertEqual(metadata["evidenceGeneratedAt"], evidence["generatedAt"])
        self.assertEqual(metadata["ridgeGeneratedAt"], model["generatedAt"])
        self.assertEqual(metadata["facts"], facts)
        self.assertEqual(metadata["sourceHashBasis"], "utf8-lf")
        self.assertEqual(metadata["sourceSha256"], brief.sha256(brief.EVIDENCE_PATH))
        self.assertEqual(metadata["ridgeSourceSha256"], brief.sha256(brief.MODEL_PATH))
        self.assertEqual(metadata["pdfSha256"], hashlib.sha256(brief.OUTPUT.read_bytes()).hexdigest())

    def test_one_landscape_letter_page_inside_print_area(self):
        pdf = PdfReader(brief.OUTPUT)
        self.assertEqual(len(pdf.pages), 1)
        self.assertEqual(tuple(float(x) for x in pdf.pages[0].mediabox), (0, 0, 792, 612))
        with fitz.open(brief.OUTPUT) as document:
            blocks = document[0].get_text("blocks")
            self.assertGreater(len(blocks), 10)
            for block in blocks:
                x0, y0, x1, y1 = block[:4]
                self.assertGreaterEqual(x0, 24)
                self.assertGreaterEqual(y0, 24)
                self.assertLessEqual(x1, 768)
                self.assertLessEqual(y1, 604)

    def test_all_salary_explanations_and_ols_uncertainty_are_printed(self):
        evidence, model, facts = brief.read_facts()
        text = " ".join(PdfReader(brief.OUTPUT).pages[0].extract_text().split())
        for phrase in ["How player stats relate to NBA salary", "associations, not guaranteed raises", "not validate NCAA or WBB pay", "not verified 2022-23 measurements", "inputs selected independently within each position", "different adjustment factors", "not ridge prediction weights", "35% shooting becomes 40%"]:
            self.assertIn(phrase, text)
        for row in facts["rows"]:
            self.assertIn(row["label"], text)
            self.assertIn(row["incrementLabel"], text)
            for group, cell in row["groups"].items():
                raw_weight = next((x["coefficient"] for x in model["groups"][group]["features"] if x["key"] == row["key"]), None)
                self.assertEqual(cell["weight"], raw_weight)
                self.assertEqual(facts["selectionByGroup"][group]["ridge"]["retained"], [f["key"] for f in model["groups"][group]["features"]])
                self.assertEqual(facts["selectionByGroup"][group]["ols"]["retained"], [f["key"] for f in evidence["groups"][group]["estimates"]])
                e = next((x for x in evidence["groups"][group]["estimates"] if x["key"] == row["key"]), None)
                if e:
                    self.assertEqual(cell["beta"], e["coefficientRaw"] * e["increment"])
                    self.assertAlmostEqual(cell["salaryPct"], 100 * math.expm1(e["coefficientRaw"] * e["increment"]), places=10)
                    self.assertAlmostEqual(cell["salaryPctLow"], e["associationPctCiLow"], places=10)
                    self.assertAlmostEqual(cell["salaryPctHigh"], e["associationPctCiHigh"], places=10)
                    self.assertLessEqual(cell["salaryPctLow"], cell["salaryPct"])
                    self.assertGreaterEqual(cell["salaryPctHigh"], cell["salaryPct"])
                for line in brief.explanation(cell):
                    self.assertIn(line, text)

    def test_percentages_are_not_ridge_weights_and_decision_uses_adjusted_p(self):
        cell = {"weight": .353, "beta": .185, "salaryPct": 100 * math.expm1(.185),
                "salaryPctLow": 100 * math.expm1(.094), "salaryPctHigh": 100 * math.expm1(.277), "pHolm": .0035}
        self.assertEqual(brief.explanation(cell), ["20.3% higher modeled salary", "95% range: +9.9% to +31.9%", "Supported | adjusted p 0.0035"])
        cell.update(weight=99, pRaw=.001, pHolm=.08)
        self.assertEqual(brief.explanation(cell)[0], "20.3% higher modeled salary")
        self.assertEqual(brief.explanation(cell)[2], "Uncertain | adjusted p 0.0800")
        cell.update(beta=-.185, salaryPct=100 * math.expm1(-.185))
        self.assertEqual(brief.explanation(cell)[0], "16.9% lower modeled salary")
        cell.update(beta=None)
        self.assertEqual(brief.explanation(cell), ["Prediction input only", "No salary estimate", "No interval or p-value"])
        cell.update(weight=None)
        self.assertEqual(brief.explanation(cell)[0], "Not included in this model")

    def test_excluded_features_have_no_invented_coefficients(self):
        evidence, model, _ = brief.read_facts()
        key = evidence["groups"]["Guards"]["estimates"][0]["key"]
        e = copy.deepcopy(evidence)
        m = copy.deepcopy(model)
        e["groups"]["Bigs"]["estimates"] = [x for x in e["groups"]["Bigs"]["estimates"] if x["key"] != key]
        m["groups"]["Bigs"]["features"] = [x for x in m["groups"]["Bigs"]["features"] if x["key"] != key]
        with tempfile.TemporaryDirectory() as folder:
            ep, mp = Path(folder) / "evidence.json", Path(folder) / "model.json"
            ep.write_text(json.dumps(e), encoding="utf-8")
            mp.write_text(json.dumps(m), encoding="utf-8")
            _, _, facts = brief.read_facts(ep, mp)
            cell = next(x for x in facts["rows"] if x["key"] == key)["groups"]["Bigs"]
            self.assertTrue(all(value is None for value in cell.values()))
            self.assertEqual(brief.signed(cell["weight"]), "Excluded")
            m["season"] = "different"
            mp.write_text(json.dumps(m), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "same season"):
                brief.read_facts(ep, mp)


if __name__ == "__main__":
    unittest.main()
