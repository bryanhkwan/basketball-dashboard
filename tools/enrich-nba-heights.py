#!/usr/bin/env python3
"""Attach observed ESPN NBA bios to the user-supplied 2022-23 salary workbook.

The source workbook is read only. The 2022-23 statistics endpoint identifies the
correct athletes; ESPN's bio endpoint supplies CURRENT listed heights. A season
parameter does not make ESPN's bios historical, so dates and that limitation are
preserved explicitly. Heights are never guessed, averaged, or filled from peers.

Requirements: Python 3.10+, pandas and openpyxl (read only).
Run from any directory: python tools/enrich-nba-heights.py
Validate the saved snapshot without network: add --validate-only
"""

import argparse
import collections
import concurrent.futures
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKBOOK = ROOT / "nba_2022-23-all_stats_with_salary (1).xlsx"
DEFAULT_OUTPUT = ROOT / "data/nba-2022-23-heights.json"
SHEET = "Data_Cleaned"
STAT_BASE = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete"
BIO_BASE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/"
# This is an explicitly documented first-name change, not fuzzy matching.
NAME_ALIASES = {
    "Jeenathan Williams": {
        "name": "Nate Williams",
        "espnId": "4397821",
        "nbaId": "1631466",
        "sourceUrl": "https://www.nba.com/rockets/news/rockets-sign-five-players",
        "reason": "Houston's official signing announcement states that Nate Williams' full first name is Jeenathan.",
    }
}
TEAM_ALIASES = {"BRK": "BKN", "CHO": "CHA", "GSW": "GS", "NOP": "NO", "NYK": "NY", "PHO": "PHX", "SAS": "SA", "UTA": "UTAH", "WAS": "WSH"}


def normalize_name(value):
    ascii_name = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", ascii_name.lower())


def without_suffix(value):
    value = re.sub(r"\s+(?:jr\.?|sr\.?|ii|iii|iv)$", "", str(value).strip(), flags=re.I)
    return normalize_name(value)


def utc_now():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def fetch_json(url, attempts=3):
    """Use the system trust store; retain normal TLS certificate validation."""
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                return json.load(response)
        except (OSError, urllib.error.HTTPError, ValueError):
            if attempt + 1 == attempts:
                raise
            time.sleep(attempt + 1)


def load_population():
    pages, urls, players = 1, [], []
    page = 1
    while page <= pages:
        url = STAT_BASE + "?" + urllib.parse.urlencode({"limit": 1000, "page": page, "season": 2023, "seasontype": 2, "isqualified": "false"})
        result = fetch_json(url)
        if not isinstance(result.get("athletes"), list):
            raise ValueError("ESPN population response is missing athletes")
        pages = int(result.get("pagination", {}).get("pages", 1))
        players.extend(result["athletes"])
        urls.append(url)
        page += 1
    # One ID may appear only once in the season statistics population.
    ids = [str(row["athlete"]["id"]) for row in players]
    if len(set(ids)) != len(ids):
        raise ValueError("Duplicate ESPN IDs in season population; review before matching")
    return players, urls


def match_players(frame, population):
    exact = collections.defaultdict(dict)
    suffix = collections.defaultdict(dict)
    for item in population:
        athlete = item["athlete"]
        for field in ["displayName", "fullName"]:
            if athlete.get(field):
                exact[normalize_name(athlete[field])][str(athlete["id"])] = athlete
                suffix[without_suffix(athlete[field])][str(athlete["id"])] = athlete
    matches, unmatched, ambiguous = [], [], []
    for index, row in frame.iterrows():
        name = str(row["Player Name"])
        alias = NAME_ALIASES.get(name)
        lookup = alias["name"] if alias else name
        candidates = exact.get(normalize_name(lookup), {})
        method = "documented_name_alias" if alias else "normalized_exact"
        if not candidates and not alias:
            candidates = suffix.get(without_suffix(name), {})
            method = "unique_suffix_variant"
        if alias:
            candidates = {key: value for key, value in candidates.items() if key == alias["espnId"]}
        if not candidates:
            unmatched.append(name)
            continue
        if len(candidates) != 1:
            ambiguous.append({"playerName": name, "candidateIds": sorted(candidates)})
            continue
        athlete = next(iter(candidates.values()))
        matches.append({"row": row, "worksheetRow": int(index) + 2, "athlete": athlete, "method": method, "alias": alias})
    if unmatched or ambiguous:
        raise ValueError(json.dumps({"unmatchedPlayers": unmatched, "ambiguousMatches": ambiguous}, ensure_ascii=False))
    return matches


def enrich_match(match):
    row, athlete = match["row"], match["athlete"]
    athlete_id = str(athlete["id"])
    url = BIO_BASE + athlete_id
    bio = fetch_json(url)
    if str(bio.get("id")) != athlete_id:
        raise ValueError("Bio athlete ID differs from matched season athlete ID: " + athlete_id)
    if without_suffix(bio.get("displayName", "")) != without_suffix(athlete["displayName"]):
        raise ValueError("Bio name changed since population retrieval: " + str(row["Player Name"]))
    height = bio.get("height")
    if not isinstance(height, (int, float)) or not math.isfinite(height) or not 60 <= height <= 96:
        raise ValueError("Missing or invalid observed height for " + str(row["Player Name"]))
    display_match = re.fullmatch(r"(\d+)'\s*(\d+(?:\.\d+)?)\"", bio.get("displayHeight", ""))
    if not display_match or abs(float(display_match[1]) * 12 + float(display_match[2]) - height) > 0.01:
        raise ValueError("Numeric and display heights disagree for " + str(row["Player Name"]))
    teams = [team.get("abbreviation") for team in athlete.get("teams", []) if team.get("abbreviation")]
    workbook_team = str(row["Team"])
    team_match = TEAM_ALIASES.get(workbook_team, workbook_team) in teams
    bio_url = next((link["href"] for link in bio.get("links", []) if "bio" in link.get("rel", []) and "desktop" in link.get("rel", [])), "https://www.espn.com/nba/player/bio/_/id/" + athlete_id)
    alias = match["alias"]
    record = {
        "playerName": str(row["Player Name"]),
        "worksheetRow": match["worksheetRow"],
        "heightInches": float(height),
        "heightCm": round(float(height) * 2.54, 2),
        "displayHeight": bio["displayHeight"],
        "weightLbs": bio.get("weight"),
        "espnId": athlete_id,
        "nbaId": alias.get("nbaId") if alias else None,
        "sourcePlayerName": bio["displayName"],
        "sourceUrl": url,
        "sourceBioPage": bio_url,
        "sourceSeason": None,
        "heightObservationBasis": "current_listed_bio_not_historical_2022_23_measurement",
        "retrievedAt": utc_now(),
        "matchMethod": match["method"],
        "matchedPopulationSeason": "2022-23",
        "sourceDateOfBirth": bio.get("dateOfBirth"),
        "sourcePosition": bio.get("position", {}).get("abbreviation"),
        "workbookPosition": str(row["Position"]),
        "workbookTeam": workbook_team,
        "sourceSeasonTeams": teams,
        "seasonTeamMatchesWorkbook": team_match,
        "aliasEvidence": alias,
    }
    return record


def validate_snapshot(frame, output, workbook_path):
    data = json.loads(output.read_text(encoding="utf-8"))
    records = data["records"]
    if data["metadata"]["workbookSha256"] != hashlib.sha256(workbook_path.read_bytes()).hexdigest():
        raise ValueError("Workbook content changed since the enrichment snapshot")
    if [row["playerName"] for row in records] != frame["Player Name"].astype(str).tolist():
        raise ValueError("Snapshot names or ordering differ from the workbook")
    if len(set(row["espnId"] for row in records)) != len(records):
        raise ValueError("Duplicate matched ESPN IDs")
    for row in records:
        if not 60 <= row["heightInches"] <= 96 or row["sourceSeason"] is not None:
            raise ValueError("Invalid height or unsupported historical source season")
        if not row["sourceUrl"].startswith(BIO_BASE) or not row["retrievedAt"]:
            raise ValueError("Missing height provenance")
        if not row["seasonTeamMatchesWorkbook"]:
            raise ValueError("Unresolved season-team mismatch: " + row["playerName"])
    print(json.dumps(data["audit"], ensure_ascii=False, indent=2))
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    frame = pd.read_excel(args.workbook, sheet_name=SHEET)
    if frame["Player Name"].duplicated().any():
        raise ValueError("Duplicate workbook names require manual identity review")
    if args.validate_only:
        validate_snapshot(frame, args.output, args.workbook)
        return
    population, population_urls = load_population()
    matches = match_players(frame, population)
    print(f"Matched {len(matches)} workbook players to the 2022-23 ESPN population; fetching current bios.", flush=True)
    records = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 12))) as executor:
        futures = [executor.submit(enrich_match, match) for match in matches]
        for future in concurrent.futures.as_completed(futures):
            records.append(future.result())
            if len(records) % 50 == 0:
                print(f"Retrieved {len(records)}/{len(matches)} observed heights.", flush=True)
    records.sort(key=lambda row: row["worksheetRow"])
    audit = {
        "workbookRows": len(frame),
        "uniquePlayers": len(records),
        "seasonPopulationPlayers": len(population),
        "matchedWithObservedHeight": len(records),
        "unmatchedPlayers": [],
        "ambiguousMatches": [],
        "matchMethodCounts": dict(collections.Counter(row["matchMethod"] for row in records)),
        "seasonTeamMismatches": [row["playerName"] for row in records if not row["seasonTeamMatchesWorkbook"]],
        "heightMinInches": min(row["heightInches"] for row in records),
        "heightMaxInches": max(row["heightInches"] for row in records),
        "historicalHeightObservations": 0,
        "currentListedHeightObservations": len(records),
        "imputedHeights": 0,
    }
    result = {
        "metadata": {
            "schemaVersion": 1,
            "createdAt": utc_now(),
            "workbook": args.workbook.name,
            "sheet": SHEET,
            "workbookSha256": hashlib.sha256(args.workbook.read_bytes()).hexdigest(),
            "salaryAndStatsSeason": "2022-23",
            "sourceProvider": "ESPN",
            "populationSourceUrls": population_urls,
            "heightSourceEndpoint": BIO_BASE + "{espnId}",
            "heightUnit": "inches",
            "limitations": [
                "Heights are ESPN's current listed bios at retrieval, not verified historical 2022-23 measurements. Even season-specific ESPN bio URLs return current values.",
                "Listed heights can be revised and may differ across providers or measurement conventions; they are not independently measured heights.",
                "ESPN IDs are retained for every player. NBA IDs are null unless separately verified; ESPN alternateIds.sdr is not an NBA ID.",
                "No fuzzy name matching or height imputation is used. Suffix variations are accepted only when the normalized season-population match is unique.",
            ],
        },
        "records": records,
        "audit": audit,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Write only after every requested player has a valid sourced height.
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    validate_snapshot(frame, args.output, args.workbook)


if __name__ == "__main__":
    main()
