# Skills (Claude) — basketball-dashboard

This repo is a single-file, GitHub-Pages-friendly NCAA scouting dashboard (MBB/WBB). The entire app lives in `index.html` (HTML + CSS + JS), with live data pulled from Google Sheets and all scoring/valuation computed client-side.

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
- **Fit score**: preset profiles (Balanced/Shooting/Defense/etc.) scoring percentile performance across stat groups.

## Structure map (index.html)
When editing, locate the relevant labeled section:
- `// ---------- Helpers ----------` utility functions (percentiles, parsing, etc.)
- `// ---- Google Sheets defaults ----` default spreadsheet URL/API key and loader
- `// ---------- State + DOM ----------` global state + element lookups
- `// ---------- Excel parsing ----------` XLSX upload path
- `// ---------- Scoring + valuation ----------` scoring model + valuation math
- `// ---------- Conference multiplier ----------` strength-of-conference adjustments
- `// ---------- Table rendering ----------` grid, sorting, search, filters
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

---

## AI Chat system — runtime enforcement (dashboard-first before web)

Enforced in code (not prompt-only) inside `// ---------- Team builder / AI ----------`.

### Why this was added
- Prompt instructions alone were not reliable; Gemini sometimes called `web_search` immediately.
- The runtime guard ensures local NCAA dashboard context is always considered first, then web context is layered on top.

### Core per-turn state variables
- `lastUserText`: captures the current user prompt for tool-orchestration fallback matching.
- `turnHasDashboardLookup`: per-turn boolean; true after any non-web tool executes.
- `turnWebSearchDeferred`: one-shot latch; prevents infinite deferral loops in a single turn.
- `turnHasWebSearch`: per-turn boolean; true after any `web_search` executes.
- `turnForcedWebForValuation`: one-shot latch; forces a single post-dashboard web lookup for prompts that need live data.

All five are reset at the top of `send()` for each new user message, and also in `aiClearChat`.

### `pushFnResult(name, args, result)`
Injects synthetic `functionCall` + `functionResponse` entries into `chatHistory`. Used to preload dashboard tool outputs into the conversation before allowing a `web_search` call.

### `needsMandatoryWebReview(text)` — dual-trigger gate
Returns `true` for any prompt where web search is **required** before a final answer.

**Search/filter guard (checked first):** If the query contains `find`, `search`, `show`, `list`, `get`, `recommend`, or `suggest`, it is treated as a player-search/filter request. Dollar amounts in these queries are budget filters, **not** valuation judgments — the valuation trigger is suppressed and the query goes through the normal Gemini tool path instead (e.g. `get_top_players`).

Example: `"find a shooter big under $100k"` → `isSearchRequest=true` → pipeline skipped → Gemini calls `get_top_players({position:'big', sortBy:'3PT_Rating', maxValue:100000})`.

**Valuation trigger** (only when NOT a search request) — keywords: `$`, `worth`, `valuat`, `invest`, `overpay`, `underpay`, `fair`, `steal`, `avoid`, `buy`, `sign`, `price`, `priced`, `pay`

Example: `"Is Leroy Blyden Jr worth $200k"` → no search verb → pipeline runs.

**Current status / news trigger** (always, even in search-phrased queries) — keywords: `latest`, `recent`, `today`, `yesterday`, `this week`, `last week`, `news`, `injur`, `hurt`, `suspend`, `transfer`, `portal`, `available`, `availability`, `out for`, `return`, `rumor`, `report`, `update`, `status`, `commit`, `nil`, `coaching`, `coach`, `minutes`, `role`, `lineup`, `starter`, `starting`

Used in both `runValuationComparePipeline` and the forced-web fallback inside `processResp`.

### `buildForcedWebQuery(text)` — intent-aware query builder
Builds the Google search query for forced web passes. Tailors terms to the question type:
- **Valuation prompt + matched player name** → `"[name] college basketball NIL salary contract value 2025"`
- **News/status prompt + matched player name** → `"[name] college basketball latest news injury transfer portal role minutes 2025"`
- **Valuation, no name match** → `"[raw query] college basketball NIL value market 2025"`
- **News, no name match** → `"[raw query] college basketball latest news 2025"`

### `runValuationComparePipeline(userText)` — deterministic dual-source pipeline
Invoked from `doSend()` **before** the free-form `callGemini(text)` path. Runs for **both** valuation and current-info queries (any prompt where `needsMandatoryWebReview` is true).

Flow:
1. **Dashboard pass** (only when players are loaded):
   - Inject `get_dashboard_context` → set `turnHasDashboardLookup = true`.
   - If a player name from the loaded pool is found in the prompt → inject `get_player_profile`.
   - Otherwise → inject `search_players` results.
   - Render evidence to the chat UI (`renderDashboardEvidence`).
2. **Web pass** (always, regardless of whether players are loaded):
   - Call `buildForcedWebQuery` → run `doWebSearch` → inject `web_search` result → set `turnHasWebSearch = true`.
   - Render web evidence to the chat UI (`renderWebEvidence`).
3. **Combined verdict**: call Gemini with a fixed structured prompt. Format depends on query type:
   - **Valuation** → `Dashboard evidence / Web evidence / Comparison / Verdict: steal|fair|overpay|avoid`
   - **News/status** → `Dashboard data / Web context / Summary`

If no players are loaded, the dashboard pass is skipped entirely and only the web pass runs.

Fallback: if any step throws, logic fails open so the chat does not dead-end.

### Enforced flow in `processResp(...)`
When a `functionCall` arrives:
1. If call is `web_search` AND no dashboard tool has run this turn AND `turnWebSearchDeferred` is false:
   - Build query from `call.args.query` or `lastUserText`.
   - If players are loaded: inject `get_dashboard_context` + `get_player_profile` or `search_players`.
   - Re-call Gemini with injected local context; it can then call `web_search` next.
   - Set `turnWebSearchDeferred = true` to prevent recursive deferral.
2. After dashboard lookup: if Gemini returns text-only and `needsMandatoryWebReview(lastUserText)` is true and no web search has run yet → force one `web_search` pass before accepting the final answer (`turnForcedWebForValuation` latch).

### Maintenance rules
- Do **not** remove the `processResp` web-search deferral guard unless replaced by equivalent deterministic orchestration.
- If you add new dashboard read tools, set `turnHasDashboardLookup = true` when they execute.
- Keep the fail-open path for web search to preserve UX resilience on tool errors.
- If tool schema names change, update both the `tools` declarations and the guard logic in `processResp` and helper injection calls.

---

## Known bugs fixed

### Gemini API error: "function call turn must come immediately after a user turn"
**Root cause**: `runValuationComparePipeline` called `pushFnResult(...)` to inject model/user pairs into `chatHistory`, then ended with `callGemini(finalPrompt)` which appended *another* `user` text turn right after the last `user` functionResponse turn — two consecutive user turns, which Gemini rejects.

**Fix**: The original user message (with format instructions embedded) is now pushed to `chatHistory` *first*, before any `pushFnResult` calls. The final call is `callGemini(null)` which does not append any extra turn — Gemini continues from the last functionResponse.

Valid chatHistory structure:
```
user: text("Is X worth $200k? ...format instructions...")
model: functionCall(get_dashboard_context)
user: functionResponse(get_dashboard_context)
model: functionCall(get_player_profile)
user: functionResponse(get_player_profile)
model: functionCall(web_search)
user: functionResponse(web_search)
← callGemini(null) fires here, Gemini generates the model response
```

### Player not found / 0 results
**Root cause 1**: `searchPlayers(text)` was called with the full user sentence (e.g. `"Is Leroy Blyden Jr worth $200k"`). `searchPlayers` checks `player.name.includes(queryString)` — a player name never contains an entire sentence, so always 0 results.

**Fix**: In the pipeline, when no exact player name match is found, the full sentence is stripped to the first 4 meaningful words before passing to `searchPlayers`. This gives a useful keyword search rather than a guaranteed miss.

**Root cause 2**: `matchLoadedPlayerName` and `buildForcedWebQuery` did raw `.toLowerCase()` comparison. Names like `"Leroy Blyden Jr."` (with period) would not match `"leroy blyden jr"` from the query.

**Fix**: Added `normalizeName(s)` helper that strips `.,` punctuation and `Jr/Sr/II/III/IV` suffixes before comparison. Used consistently in `matchLoadedPlayerName`, `buildForcedWebQuery`, and the `processResp` deferral block.

---

## Critical data-layer rule — always use `allPlayers()`, never `app().computed`

`app().computed` is the **currently displayed tab's dataset only** (Guards OR Bigs, whichever tab is active in the UI). Any AI chat function that queries players must use `allPlayers()` instead, which calls `tbGetAllPlayers()` and merges **all cached pools** for the current league regardless of which tab is showing.

**Violating this rule causes 0-result searches** when a player is in the other position group.

Functions that must use `allPlayers()`:
- `searchPlayers` ✓ (was `app().computed` — fixed)
- `getDashboardContext` → `totalPlayers` field ✓ (was `app().computed.length` — fixed)
- `getPlayerProfile` ✓
- `getTopPlayers` ✓
- `matchLoadedPlayerName` ✓
- `buildForcedWebQuery` ✓

If you add a new AI tool function that reads the player pool, always start with `allPlayers()`.
