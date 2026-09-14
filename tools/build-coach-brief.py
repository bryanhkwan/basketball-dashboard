#!/usr/bin/env python3
"""Build the one-page coach handout from the checked NBA evidence snapshot.

No model is fitted or changed. Run after updating the salary evidence and review
the rendered PNG before publishing. Frontend downloads the static PDF directly.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

import fitz
from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_PATH = ROOT / "data/nba-salary-evidence.json"
OUTPUT = ROOT / "output/pdf/nba-salary-coach-brief.pdf"
METADATA = OUTPUT.with_suffix(".meta.json")
PREVIEW = ROOT / "tmp_coach_brief/preview.png"
NAVY = colors.HexColor("#142A43")
INK = colors.HexColor("#223247")
MUTED = colors.HexColor("#536174")
GOLD = colors.HexColor("#D6A800")
CREAM = colors.HexColor("#FBF7E8")
LINE = colors.HexColor("#D9E0E7")
PALE = colors.HexColor("#F3F6F9")


def read_facts(path=EVIDENCE_PATH):
    evidence = json.loads(path.read_text(encoding="utf-8"))
    groups = evidence["groups"]
    tests = [item for group in groups.values() for item in group["features"]]
    if len(tests) != 36 or evidence["policy"] != {"alpha": .05, "adjustment": "Holm", "familySize": 36}:
        raise ValueError("The evidence design changed; review the coach brief wording before rebuilding.")
    if any(item["pAdjustedHolm"] <= .05 for item in tests):
        raise ValueError("The findings changed; review the coach brief conclusion before rebuilding.")
    height = next(item for item in groups["Bigs"]["features"] if item["key"] == "Height")
    if height["increment"] != 1 or not height["effectCiLowPct"] < 0 < height["effectCiHighPct"]:
        raise ValueError("The height example changed; review its interpretation before rebuilding.")
    return evidence, {
        "n": sum(group["n"] for group in groups.values()),
        "groupCounts": {group: groups[group]["n"] for group in ["Guards", "Wings", "Bigs"]},
        "heightPct": height["effectPct"], "heightLowPct": height["effectCiLowPct"],
        "heightHighPct": height["effectCiHighPct"], "supportedCount": 0, "testCount": len(tests),
    }


def build():
    evidence, facts = read_facts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    width, height = letter
    content_width = width - 84
    styles = {
        "eyebrow": ParagraphStyle("eyebrow", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=MUTED),
        "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=24, leading=29, textColor=NAVY),
        "subtitle": ParagraphStyle("subtitle", fontName="Helvetica", fontSize=10.4, leading=15, textColor=MUTED),
        "heading": ParagraphStyle("heading", fontName="Helvetica-Bold", fontSize=13, leading=18, textColor=NAVY),
        "hero": ParagraphStyle("hero", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=NAVY),
        "body": ParagraphStyle("body", fontName="Helvetica", fontSize=11, leading=15.3, textColor=INK),
        "small": ParagraphStyle("small", fontName="Helvetica", fontSize=9.8, leading=13.5, textColor=MUTED),
        "foot": ParagraphStyle("foot", fontName="Helvetica", fontSize=8.1, leading=10.8, textColor=MUTED),
        "number": ParagraphStyle("number", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=NAVY),
    }

    def paragraph(text, style="body"):
        return Paragraph(text, styles[style])

    def box(flowables, background=PALE, padding=13):
        result = Table([[flowables]], colWidths=[content_width])
        result.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), background),
            ("LEFTPADDING", (0, 0), (-1, -1), padding),
            ("RIGHTPADDING", (0, 0), (-1, -1), padding),
            ("TOPPADDING", (0, 0), (-1, -1), padding - 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), padding),
            ("BOX", (0, 0), (-1, -1), .5, LINE),
        ]))
        return result

    counts = facts["groupCounts"]
    date = datetime.fromisoformat(evidence["generatedAt"]).strftime("%d %b %Y")
    story = [
        paragraph("RECRUITING RESEARCH / ONE-PAGE BRIEF", "eyebrow"), Spacer(1, 5),
        paragraph("NBA salary evidence for coaches", "title"), Spacer(1, 7),
        paragraph(f"2022-23 NBA salary data | <b>{facts['n']} players</b> | "
                  f"Guards {counts['Guards']} / Wings {counts['Wings']} / Bigs {counts['Bigs']}", "subtitle"),
        Spacer(1, 16),
        box([
            paragraph("What this study found", "eyebrow"), Spacer(1, 5),
            paragraph("No single statistic met our evidence threshold.", "hero"), Spacer(1, 7),
            paragraph("We accounted for the other recorded inputs and checked 12 statistics across three position groups. "
                      "The results do not establish that height, shooting, or other skills lack basketball value."),
        ], CREAM),
        Spacer(1, 16),
        paragraph("A practical example: height for bigs", "heading"), Spacer(1, 5),
        paragraph(f"One extra inch was associated with an estimated <b>{facts['heightPct']:.1f}% higher NBA salary</b>, "
                  "after adjusting for the other inputs."),
        Spacer(1, 9),
        box([
            paragraph(f"<b>95% uncertainty range:</b> {abs(facts['heightLowPct']):.1f}% lower to "
                      f"{facts['heightHighPct']:.1f}% higher salary."),
            Spacer(1, 4),
            paragraph("The range includes no salary increase, so the direction remains uncertain. "
                      f"This does not justify an {facts['heightPct']:.1f}% height premium on a college offer.", "small"),
        ], PALE, 11),
        Spacer(1, 16),
        paragraph("How to use this in recruiting", "heading"), Spacer(1, 7),
    ]
    takeaways = [
        ("Start a discussion.", "Use model estimates to identify players and questions for film review, interviews, and scouting. Keep the assumptions visible."),
        ("Evaluate the whole role.", "Points, minutes, shooting, and size overlap. An uncertain coefficient does not tell you a skill is unimportant for winning or for your roster."),
        ("Treat the dollars as rough estimates.", "Dashboard prices use a separate NBA prediction model plus college pay settings. Check them against role, competition, scouting, and budget."),
    ]
    for i, (title, description) in enumerate(takeaways, 1):
        row = Table([[paragraph(str(i), "number"), paragraph(f"<b>{title}</b> {description}")]], colWidths=[24, content_width - 24])
        row.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ]))
        story.append(row)
    story.extend([
        Spacer(1, 4),
        paragraph("What the data cannot establish", "heading"), Spacer(1, 5),
        paragraph("This study describes one NBA season. Contracts also reflect past performance, expected potential, "
                  "experience, and bargaining rules. It does not validate NCAA salaries or transfer to women's basketball.", "small"),
        Spacer(1, 13),
        paragraph("METHOD AND SOURCES", "eyebrow"), Spacer(1, 4),
        paragraph("Exploratory position-specific regression of log salary; 12 basketball inputs, age, and percentage availability. "
                  "HC3 uncertainty; pointwise 95% intervals; Holm adjustment across 36 tests at 0.05. "
                  "Source: supplied 2022-23 NBA salary workbook. Heights: current ESPN bios retrieved September 2026, "
                  "not verified 2022-23 measurements.", "foot"),
    ])

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(GOLD)
        canvas.setLineWidth(1.4)
        canvas.line(42, height - 28, width - 42, height - 28)
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(.5)
        canvas.line(42, 34, width - 42, 34)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(42, 21, f"Analysis: {date}  |  Full methods and coefficients: dashboard's Full statistical details")
        canvas.drawRightString(width - 42, 21, str(doc.page))
        canvas.linkURL("https://bryanhkwan.github.io/basketball-dashboard/", (42, 16, width - 62, 30), relative=0)
        canvas.restoreState()

    document = SimpleDocTemplate(str(OUTPUT), pagesize=letter, leftMargin=42, rightMargin=42,
                                 topMargin=41, bottomMargin=45, title="NBA salary evidence for coaches",
                                 author="NCAA Scouting Dashboard", subject="One-page interpretation of NBA salary associations")
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    pdf = PdfReader(OUTPUT)
    if len(pdf.pages) != 1:
        raise ValueError(f"Coach brief must be one page; rendered {len(pdf.pages)}. Adjust layout before publication.")
    with fitz.open(OUTPUT) as rendered:
        page = rendered[0]
        page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8), alpha=False).save(PREVIEW)
        if any(rect.y1 > height - 12 or rect.x1 > width - 12 for rect in [fitz.Rect(block[:4]) for block in page.get_text("blocks")]):
            raise ValueError("Text extends outside the print margins.")
    metadata = {
        "evidenceId": evidence["id"], "evidenceGeneratedAt": evidence["generatedAt"],
        "sourceSha256": hashlib.sha256(EVIDENCE_PATH.read_bytes().replace(b"\r\n", b"\n")).hexdigest(),
        "sourceHashBasis": "utf8-lf", "pdfSha256": hashlib.sha256(OUTPUT.read_bytes()).hexdigest(),
        "pages": len(pdf.pages), "pageSize": "US Letter", "facts": facts,
    }
    METADATA.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"pdf": str(OUTPUT), "pages": len(pdf.pages), "preview": str(PREVIEW), "facts": facts}, indent=2))


if __name__ == "__main__":
    build()
