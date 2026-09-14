#!/usr/bin/env python3
"""Build one printable coefficient matrix from the published model snapshots."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

import fitz
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_PATH = ROOT / "data/nba-salary-evidence.json"
MODEL_PATH = ROOT / "data/nba-valuation-model.json"
OUTPUT = ROOT / "output/pdf/nba-salary-coach-brief.pdf"
METADATA = OUTPUT.with_suffix(".meta.json")
PREVIEW = ROOT / "tmp_coach_brief/preview.png"
GROUPS = ["Guards", "Wings", "Bigs"]
NAVY = colors.HexColor("#142A43")
MUTED = colors.HexColor("#536174")
LINE = colors.HexColor("#D9E0E7")
PALE = colors.HexColor("#F3F6F9")


def sha256(path):
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def read_facts(evidence_path=EVIDENCE_PATH, model_path=MODEL_PATH):
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    model = json.loads(model_path.read_text(encoding="utf-8"))
    if evidence["season"] != model["season"]:
        raise ValueError("Evidence and valuation snapshots must cover the same season.")
    inputs = {}
    for group in GROUPS:
        for item in evidence["groups"][group]["estimates"]:
            inputs.setdefault(item["key"], item)
    for group in GROUPS:
        for item in model["groups"][group]["features"]:
            inputs.setdefault(item["key"], item)
    if not inputs or len(inputs) > 12 or "Age" in inputs:
        raise ValueError("Review the basketball-input table design before rebuilding.")
    rows = []
    for key, item in inputs.items():
        row = {"key": key, "label": item.get("label", key), "incrementLabel": item.get("incrementLabel", "Not retained in OLS"), "groups": {}}
        for group in GROUPS:
            e = next((x for x in evidence["groups"][group]["estimates"] if x["key"] == key), None)
            w = next((x for x in model["groups"][group]["features"] if x["key"] == key), None)
            if e and e["incrementLabel"] != row["incrementLabel"]:
                raise ValueError("Position rows must use the same stated increment.")
            row["groups"][group] = {
                "weight": w["coefficient"] if w else None,
                "beta": e["logEffect"] if e else None,
                "ciLow": e["logEffectCiLow"] if e else None,
                "ciHigh": e["logEffectCiHigh"] if e else None,
                "pRaw": e["pRaw"] if e else None,
                "pHolm": e["pHolm"] if e else None,
            }
        rows.append(row)
    estimates = [e for group in GROUPS for e in evidence["groups"][group]["estimates"]]
    return evidence, model, {
        "rows": rows,
        "groupCounts": {g: {"ridge": model["groups"][g]["n"], "ols": evidence["groups"][g]["n"]} for g in GROUPS},
        "testedCount": len(estimates),
        "supportedCount": sum(e["pHolm"] <= evidence["policy"]["alpha"] for e in estimates),
        "familySize": evidence["policy"]["familySize"],
        "selectionByGroup": {g: {
            "ridge": {"retained": [f["key"] for f in model["groups"][g]["features"]], "excluded": model["groups"][g].get("selection", {}).get("excludedKeys", [])},
            "ols": {"retained": [f["key"] for f in evidence["groups"][g]["estimates"]], "excluded": evidence["groups"][g].get("selection", {}).get("excludedKeys", [])},
        } for g in GROUPS},
    }


def signed(value):
    return "Excluded" if value is None else f"{value:+.3f}"


def pvalue(value):
    return "Excluded" if value is None else f"{value:.3g}" if value < .001 else f"{value:.4f}"


def build():
    evidence, model, facts = read_facts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    width, height = landscape(letter)
    content_width = width - 60
    large = len(facts["rows"]) <= 8
    styles = {
        "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=21, leading=25, textColor=NAVY),
        "small": ParagraphStyle("small", fontName="Helvetica", fontSize=9, leading=12, textColor=MUTED),
        "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=9.5 if large else 8.5, leading=11.5 if large else 9.8, textColor=NAVY),
        "label": ParagraphStyle("label", fontName="Helvetica-Bold", fontSize=9.5 if large else 8.5, leading=11.5 if large else 10, textColor=NAVY),
        "header": ParagraphStyle("header", fontName="Helvetica-Bold", fontSize=10, leading=13, textColor=colors.white),
        "foot": ParagraphStyle("foot", fontName="Helvetica", fontSize=8, leading=10.5, textColor=MUTED),
    }

    def paragraph(text, style="small"):
        return Paragraph(text, styles[style])

    data = [[paragraph("Input / stated increase", "header")] + [paragraph(f"{g}<br/><font size=8>Ridge / OLS n: {facts['groupCounts'][g]['ridge']} / {facts['groupCounts'][g]['ols']}</font>", "header") for g in GROUPS]]
    for row in facts["rows"]:
        cells = [paragraph(escape(row["label"]) + "<br/><font name=Helvetica size=8>" + escape(row["incrementLabel"]) + "</font>", "label")]
        for group in GROUPS:
            c = row["groups"][group]
            text = f"<b>Weight</b> {signed(c['weight'])} | <b>OLS beta</b> {signed(c['beta'])}"
            if c["beta"] is not None:
                text += f"<br/>95% beta CI: [{signed(c['ciLow'])}, {signed(c['ciHigh'])}]<br/>p {pvalue(c['pRaw'])} | Holm p {pvalue(c['pHolm'])}"
            else:
                text += "<br/>OLS input not retained; no interval or p-value."
            cells.append(paragraph(text, "cell"))
        data.append(cells)
    table = Table(data, colWidths=[156, 192, 192, 192], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
        ("GRID", (0, 0), (-1, -1), .4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4 if large else 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4 if large else 2),
    ]))
    subtitle = escape(evidence["season"]) + " NBA salary sample | Three separate regressions; inputs selected independently within each position (VIF &lt;= 5)"
    story = [paragraph("NBA coefficients by position", "title"), Spacer(1, 4),
        paragraph(subtitle), Spacer(1, 7),
        paragraph("<b>Weight:</b> ridge prediction coefficient per 1 standard deviation (SD), used in the NCAA peer signal. <b>OLS beta:</b> separate log-salary coefficient for the stated increase. <b>Intervals and p-values apply only to OLS beta.</b> Neither number is a percentage of player value.", "small"),
        Spacer(1, 9), table, Spacer(1, 9),
        paragraph(f"<b>{facts['supportedCount']} of {facts['testedCount']} retained OLS associations meet Holm p &lt;= 0.05</b> using the original {facts['familySize']}-candidate correction family. Excluded means not retained, never a zero effect. Age and percentage-availability controls are outside this basketball-input table.", "foot"),
        Spacer(1, 4), paragraph("<b>Read within each position:</b> different retained inputs mean the columns have different adjustment sets; coefficient differences alone do not establish position priorities. Separate common-input tests are in Full statistical details. These exploratory NBA results do not validate NCAA or WBB pay.", "foot"),
        Spacer(1, 4), paragraph("<b>Sources:</b> supplied 2022-23 NBA salary workbook; ESPN heights retrieved September 2026, not verified 2022-23 measurements. Full selection policy, excluded inputs, and model checks are in the dashboard's Full statistical details.", "foot")]

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(LINE)
        canvas.line(30, 27, width - 30, 27)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        date = datetime.fromisoformat(evidence["generatedAt"]).strftime("%d %b %Y")
        canvas.drawString(30, 16, f"Analysis: {date} | NCAA Scouting Dashboard | Coefficients rounded for presentation; CSV contains full precision")
        canvas.drawRightString(width - 30, 16, str(doc.page))
        canvas.linkURL("https://bryanhkwan.github.io/basketball-dashboard/", (30, 11, width - 60, 25), relative=0)
        canvas.restoreState()

    document = SimpleDocTemplate(str(OUTPUT), pagesize=(width, height), leftMargin=30, rightMargin=30,
        topMargin=27, bottomMargin=35, title="NBA coefficients by position", author="NCAA Scouting Dashboard")
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    pdf = PdfReader(OUTPUT)
    if len(pdf.pages) != 1:
        raise ValueError(f"Coefficient table must fit one page; rendered {len(pdf.pages)}. Review layout.")
    with fitz.open(OUTPUT) as rendered:
        page = rendered[0]
        page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8), alpha=False).save(PREVIEW)
        if any(b[0] < 24 or b[1] < 24 or b[2] > width - 24 or b[3] > height - 8 for b in page.get_text("blocks")):
            raise ValueError("Text extends beyond the print area.")
    metadata = {
        "evidenceId": evidence["id"], "evidenceGeneratedAt": evidence["generatedAt"],
        "ridgeModelId": model["id"], "ridgeGeneratedAt": model["generatedAt"],
        "sourceSha256": sha256(EVIDENCE_PATH), "ridgeSourceSha256": sha256(MODEL_PATH),
        "sourceHashBasis": "utf8-lf", "pdfSha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
        "pages": len(pdf.pages), "pageSize": "US Letter landscape", "facts": facts,
    }
    METADATA.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"pdf": str(OUTPUT), "pages": len(pdf.pages), "rows": len(facts["rows"]), "preview": str(PREVIEW)}, indent=2))


if __name__ == "__main__":
    build()
