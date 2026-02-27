# Skills (Claude) -- basketball-dashboard

This repo is a single-file, GitHub-Pages-friendly NCAA scouting dashboard (MBB/WBB). The entire app lives in `index.html` (HTML + CSS + JS), with live data pulled from Google Sheets and all scoring/valuation computed client-side in the browser.

## How to work in this repo
- Keep it framework-free: **pure HTML/CSS/JS**, no build step.
- Prefer small, surgical edits; avoid large refactors unless requested.
- Maintain the existing section markers in `index.html` (e.g. `// ---------- Scoring + valuation ----------`) and add new code in the most relevant section.
- Don't add new dependencies unless absolutely necessary; if you must, use CDN scripts/styles that work on GitHub Pages.

## Local workflow
- Open `index.html` directly in a browser for basic UI work.
- For fetch/XHR quirks, use a simple static server (any of: VS Code Live Server, `python -m http.server`, etc.).

## Data source (Google Sheets)
- The dashboard expects **two sheets** in the configured spreadsheet:
  - `Men Data` (MBB)
  - `Women Data` (WBB)
- Data loads via the Google Sheets API `values:batchGet` and is normalized into array-of-arrays then row-objects.
- If adding columns, keep headers stable and update any code that references header names.

## Core concepts (domain)
- **PerfScore**: weighted composite score computed from stat normalization (min/max bounds, directionality).
- **Valuation**: exponential curve anchored to an average pay and a "star" target; optional minutes multiplier to prevent low-minute inflation.
- **Archetypes**: tags based on percentiles across key stats.
- **Fit score**: preset profiles (Balanced, Shooting, Defense, etc.) scoring percentile performance across stat categories.

## Structure map (index.html)
When editing, locate the relevant labeled section:
- `// ---------- Helpers ----------` utility functions (percentiles, parsing, etc.)
- `// ---- Google Sheets defaults ----` default spreadsheet URL/API key and loader
- `// ---------- State + DOM ----------` global state + element lookups
- `// ---------- Excel parsing ----------` XLSX upload path
- `// ---------- Scoring + valuation ----------` scoring model + valuation math
- `// ---------- Conference multiplier ----------` strength-of-conference adjustments
- `// ---------- Table rendering ----------` grid, sorting, search, filters
- `// ---------- Pagination ----------` paging controls
- `// ---------- Profile modal ----------` player detail modal
- `// ---------- Team builder / AI ----------` roster tools + Gemini chat tooling

## Guardrails
- Don't change public-facing stat semantics without updating labels/tooltips and README.
- Preserve MBB/WBB separation rules (no mixed rosters).
- Be careful with secrets: avoid hard-coding API keys or proxy endpoints in commits; prefer placeholders + user-provided inputs.

## When you need clarification
Ask before changing:
- the valuation curve parameters,
- scoring weights / min-max bounds defaults,
- sheet schema (header names, required columns),
- or anything that could invalidate historical comparisons.

## Strict rules for using the dashboard + the internet (for chatbots)
These rules are meant for Gemini/Claude/any AI agent integrated into this dashboard.

### Tool order (always)
1) Use dashboard tools first for anything the dashboard already knows:
   - `get_dashboard_context` (league, roster, budget, settings)
   - `search_players`, `get_top_players`, `get_player_profile`
   - `compare_players` for head-to-head comparisons (prefer this over manual stat comparisons)
2) Use internet search (`web_search`) only after the dashboard pass, to answer what the dashboard cannot know or what may have changed recently.

### When internet search is REQUIRED
Trigger `web_search` if the user asks about (or the answer depends on):
- "latest", "most recent", "today", "this week", "yesterday", "tomorrow"
- injuries, suspensions, availability, minutes/role changes, depth chart
- transfer portal, commitments/decommitments, redshirts
- NIL deal/salary rumors, off-court issues, coaching changes
- "is he worth investing in?" when it hinges on current real-world context (not just box-score performance)

### How to combine dashboard + web results
- Treat the dashboard as the source of truth for: stats, PerfScore, archetypes, fit score, model valuation, roster legality (MBB/WBB separation).
- Treat the internet as the source of truth for: current status/news/context (injury, portal, role, availability).
- If web context changes the recommendation, say so explicitly and reduce confidence if information is incomplete.
- If web sources conflict, state the conflict and default to conservative recommendations.
- When reporting web findings, include concrete dates (not relative phrasing).

### Response format (strict)
Output should be short and decision-oriented:
1) Recommendation: **steal / fair / overpay / avoid**
2) Dashboard evidence: valuation vs price, PerfScore, key archetypes, fit score
3) Web evidence (if used): 1-3 bullets with dates
4) Risks + assumptions: what could change the call
5) Next action: the single best follow-up (or next 2 targets if asked for options)

### Efficiency rules (Flash Lite friendly)
- Use the minimum tool calls needed; avoid repeated calls with overlapping filters.
- Do at most 1 `web_search` unless:
  - the top choice has a red-flag, or
  - the user explicitly requests broader verification.

### Copy/paste prompt template (recommended)
"Use dashboard tools first. Call `get_dashboard_context`, then find candidates with `get_top_players` (use `3PT_Rating` for shooters; use `DRtg`/`BPG` for defense). Use `compare_players` for comparisons. Only then use `web_search` if the question is about news/injuries/portal/role or uses words like 'latest/today'. If you use web results, include dates. End with a clear steal/fair/overpay/avoid recommendation."
