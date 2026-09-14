"""Verify the published handout stays readable and tied to its evidence snapshot."""
import copy
import hashlib
import importlib.util
import json
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
    def test_published_pdf_matches_current_evidence(self):
        evidence, facts = brief.read_facts()
        metadata = json.loads(brief.METADATA.read_text(encoding="utf-8"))
        self.assertEqual(metadata["evidenceId"], evidence["id"])
        self.assertEqual(metadata["evidenceGeneratedAt"], evidence["generatedAt"])
        self.assertEqual(metadata["facts"], facts)
        self.assertEqual(metadata["sourceHashBasis"], "utf8-lf")
        self.assertEqual(metadata["sourceSha256"], hashlib.sha256(
            brief.EVIDENCE_PATH.read_bytes().replace(b"\r\n", b"\n")).hexdigest())
        self.assertEqual(metadata["pdfSha256"], hashlib.sha256(brief.OUTPUT.read_bytes()).hexdigest())

    def test_one_letter_page_with_text_inside_print_area(self):
        pdf = PdfReader(brief.OUTPUT)
        self.assertEqual(len(pdf.pages), 1)
        self.assertEqual(tuple(float(x) for x in pdf.pages[0].mediabox), (0, 0, 612, 792))
        with fitz.open(brief.OUTPUT) as document:
            blocks = document[0].get_text("blocks")
            self.assertGreater(len(blocks), 10)
            for block in blocks:
                x0, y0, x1, y1 = block[:4]
                self.assertGreaterEqual(x0, 36)
                self.assertGreaterEqual(y0, 30)
                self.assertLessEqual(x1, 576)
                self.assertLessEqual(y1, 780)

    def test_coaches_receive_findings_and_their_limits(self):
        _, facts = brief.read_facts()
        text = " ".join(PdfReader(brief.OUTPUT).pages[0].extract_text().split())
        for phrase in [
            f"{facts['n']} players",
            "Guards 197 / Wings 91 / Bigs 178",
            "No single statistic met our evidence threshold.",
            f"{facts['heightPct']:.1f}% higher NBA salary",
            f"{abs(facts['heightLowPct']):.1f}% lower to {facts['heightHighPct']:.1f}% higher salary",
            "The range includes no salary increase",
            "separate NBA prediction model plus college pay settings",
            "does not validate NCAA salaries or transfer to women's basketball",
            "not verified 2022-23 measurements",
        ]:
            self.assertIn(phrase, text)

    def test_changed_findings_require_editorial_review(self):
        evidence, _ = brief.read_facts()
        variants = []
        supported = copy.deepcopy(evidence)
        supported["groups"]["Guards"]["features"][0]["pAdjustedHolm"] = .01
        variants.append(supported)
        altered_design = copy.deepcopy(evidence)
        altered_design["policy"]["alpha"] = .1
        variants.append(altered_design)
        clear_height = copy.deepcopy(evidence)
        height = next(item for item in clear_height["groups"]["Bigs"]["features"] if item["key"] == "Height")
        height["effectCiLowPct"] = 1
        variants.append(clear_height)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "evidence.json"
            for variant in variants:
                with self.subTest():
                    path.write_text(json.dumps(variant), encoding="utf-8")
                    with self.assertRaisesRegex(ValueError, "review"):
                        brief.read_facts(path)


if __name__ == "__main__":
    unittest.main()
