# Skills (Claude) — basketball-dashboard

This repo is a GitHub-Pages-friendly NCAA scouting dashboard (MBB/WBB). It is split into multiple JS modules loaded via `<script defer>` from `index.html`. MBB data comes from the CBD API via a Cloudflare Worker proxy; WBB data comes from Google Sheets. All scoring/valuation is computed client-side.

Two Cloudflare Workers back the app:
- `hidden-salad-773b.bryanhkwan.workers.dev` — login, notes, CBD API proxy
- `white-pine-7669.bryanhkwan.workers.dev` — Gemini AI proxy (chat + Deep Analysis)

## How to work in this repo
- Keep it framework-free: **pure HTML/CSS/JS**, no build step.
- Prefer small, surgical edits; avoid large refactors unless requested.
- Add new code to the most relevant module file (see Structure map below).
- Don't add new dependencies unless absolutely necessary; if you must, use CDN scripts/styles that work on GitHub Pages.

## Local workflow
- Open `index.html` directly in a browser for basic UI work.
- For fetch/XHR quirks, use a simple static server (any of: VS Code Live Server, `python -m http.server`, etc.).

## Data sources
- **MBB**: CBD API, fetched via Cloudflare Worker at `hidden-salad-773b`. Returns players, ratings, team stats, shot data, game logs.
- **WBB**: Google Sheets API `values:batchGet` — expects sheets named `Men Data` and `Women Data`.
- Data is normalized into row-objects. If adding columns, keep headers stable and update any code that references header names.

## Core concepts (domain)
- **PerfScore**: weighted composite score computed from stat normalization (min/max bounds, directionality).
- **Valuation**: exponential curve anchored to an average pay and a "star" target; optional minutes multiplier to prevent low-minute inflation.
- **Archetypes**: tags based on percentiles across key stats.
- **Fit score**: preset profiles (Balanced/Shooting/Defense/etc.) scoring percentile performance across stat groups.
- **Scout Report (player)**: 5-section scouting card per player — Strengths (≥82nd pct), Weaknesses (≤22nd pct), Tendencies (usage/shooting/playmaking roles), Development areas (25–55th pct), and Matchup Notes (12+ tactical statements). Rendered in the player profile modal via `renderScoutReport(r)`.
- **Shot Chart (player)**: Interactive SVG shot chart in the player profile modal. Click-to-filter buttons (All / Makes / Misses) via CSS data-attribute toggle.
- **Teams Hub**: Full team-level module (`modules/teams.js`). Includes team DNA (adjusted efficiency, four factors), Team Scout Report, dual-team shot charts, matchup zone table, insight pills, and Deep Analysis.
- **Deep Analysis**: In-page AI panel powered by a direct Gemini call (no chat history, no tools, no web). Renders as `.thDeepSection` cards grouped by `## header` sections. Accessed via button in Team Hub Matchup Insights.

## Structure map (modules)
The app is split into module files loaded via `<script defer>` in this order:

| File | Purpose |
|---|---|
| `modules/config.js` | Constants, helpers, stat glossary, fit presets |
| `modules/auth.js` | Login/logout/guest mode, loading coordination |
| `modules/data.js` | State, scoring engine, CBD API + Google Sheets loader, team data loaders |
| `modules/players.js` | Player table rendering, pagination, search |
| `modules/profile.js` | Player profile modal (Scout Report, Shot Chart, career), stat info, compare |
| `modules/teambuilder.js` | Roster management, gap analysis, H2H, opponent roster, page nav |
| `modules/teams.js` | Teams Hub — DNA, scout reports, shot charts, matchup, Deep Analysis |
| `modules/notes.js` | Sticky notes (logged-in users only) |
| `modules/chat.js` | AI chatbot (Gemini), tool orchestration |
| `app.js` | DOMContentLoaded init, event listeners, `window._app` bridge |

When editing, find the relevant module file. All cross-module globals must use `var` (not `let`/`const`).

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

## Teams Hub module (`modules/teams.js`)

### Key globals
- `thCurrentTeam`, `thCurrentSeason` — currently loaded team + season
- `thCurrentCompareTeam` — opponent team name
- `_thCurrentStats`, `_thCompareStats` — fetched stats objects
- `_thLastMatchupCtx` — zone stat context captured from play-by-play shot data

### Key functions
- `thRefreshTeamList()` / `thPopulateTeams()` — rebuilds team dropdown from `tbGetAllPlayers()`. Called automatically by `loadAllData` (twice: after player data loads, and after ratings load).
- `thLoadTeam(name, season)` — fetches ratings + stats + shooting; calls `thRenderDNA` + `thRenderTeamScout`
- `thRenderDNA(teamName, teamData, statsData)` — renders adjusted efficiency, four factors, insight pills
- `thRenderTeamScout(teamName, teamData, statsData)` — renders 5-section team Scout Report into `#thScout`
- `thLoadMatchup(compareTeam, mode)` — loads play-by-play; builds dual shot charts + zone table + matchup insights
- `thRunDeepAnalysis()` — direct Gemini fetch (no chat, no tools); renders into `#thDeepOutput` via `_thFmtDeepText`
- `_thFmtDeepText(text)` — converts Gemini markdown to `.thDeepSection` cards grouped by `## header`
- `thInitShotChart(id)` — attaches tooltip and click-filter to a shot chart SVG container

### Shot filter pattern (CSS-only)
`thInitShotFilter` sets `data-filter="makes"|"misses"|""` on `<svg class="shot-chart-svg">`. CSS handles visibility:
```css
.shot-chart-svg[data-filter="makes"]  .shot-dot[data-made="0"] { opacity: 0.07; }
.shot-chart-svg[data-filter="misses"] .shot-dot[data-made="1"] { opacity: 0.07; }
```
Never manipulate shot-dot visibility via JS — always via the data-attribute + CSS.

### Auto-populate on load
`thRefreshTeamList()` is called at TWO points in `loadAllData`:
1. Immediately after `reloadActiveSheet()` — fills dropdown from player pool
2. Inside `loadTeamRatings().then()` — refills after ratings arrive

This ensures Teams Hub dropdowns are populated on first page load without pressing Refresh.

---

## AI Chat system — runtime enforcement (dashboard-first before web)

Enforced in code (not prompt-only) inside `modules/chat.js` (IIFE).

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

## Roster action confirmation — button system

### How it works
Roster-mutating actions (`add_players_to_roster`, `remove_player_from_roster`, `swap_roster_player`) are intercepted by `CONFIRM_ACTIONS` in `processResp`. When Gemini calls one of these tools, the call is paused and Yes/No buttons are rendered in the chat instead of executing immediately.

### Key components
- **CSS classes** (already in stylesheet): `.aiConfirm`, `.aiConfirmBtn`, `.yes`, `.no`
- **`executeConfirm(confirmed)`**: shared async function that executes or cancels the pending action. Disables both buttons immediately on click to prevent double-execution. Exposed globally as `window._aiConfirm` for button `onclick` handlers (needed because all AI code is inside an IIFE).
- **`pendingAction`**: holds `{call, modelMsg}` while waiting for user approval. Cleared on execution or cancel.

### Button rendering in `processResp`
```js
const confirmBtns = '<div class="aiConfirm">...</div>';
if (!hasText) {
  // Gemini was silent — show our own description + buttons
  addMsg('ai', 'I\'d like to: ' + desc + '.' + confirmBtns);
} else {
  // Gemini already wrote its recommendation — append buttons below it
  addMsg('ai', confirmBtns);
}
```
The `hasText` branch is critical: if Gemini produces a recommendation text AND a function call in the same response, `hasText` is `true` and we must still append buttons — not skip them.

### System prompt rule (rule 4) and tool descriptions
Gemini is instructed to call the action function **immediately** after its recommendation text, in the same response. It must NOT ask "Want me to do this?" and wait for a text reply — the button system handles user approval.

Tool descriptions for all three action tools say: *"Call this immediately after your recommendation — the UI shows Yes/No buttons to the user automatically."*

**Do not revert rule 4 or tool descriptions to "MUST ask user confirmation first"** — that causes Gemini to wait for a text "yes" before ever emitting the function call, so buttons never appear.

---

## `addPlayersToRoster` — constraint auto-expansion

When a bulk add is approved (e.g. "add all Toledo players"), the function **must not** be blocked by budget, per-player cap, or roster size limits. The approved intent overrides all three.

### Implementation
`addPlayersToRoster(names)` in the AI IIFE:
1. **Resolve all names first** into `valid[]` and `notFound[]` before touching any constraint — so the math is exact.
2. **Filter only** for duplicates and league violations (the only constraints that always hold).
3. **Auto-expand all three DOM inputs** to fit every valid player:
   - `tbMaxRoster` → `current roster size + valid.length`
   - `tbPlayerCap` → `ceil(maxPlayerVal / 1000) * 1000`
   - `tbBudget` → `ceil((usedCost + addCost) / 1000) * 1000`
   Inputs are only raised, never lowered.
4. **Push directly to `tbRoster`** — bypasses `tbAddPlayer` entirely, which re-enforces constraints per-player and would block players as accumulated cost grows. Direct push is safe because constraints were already expanded in step 3.
5. Call `tbRefresh()` once at the end.
6. Return `{added, failed, rosterSize, adjustments}` so Gemini can report what was changed.

### Critical rule
Do **not** call `tbAddPlayer` in a loop after expanding constraints. `tbAddPlayer` recalculates `used` from the live `tbRoster` on each call — by the time player N is added, the accumulated cost may exceed the old (or even newly set) budget, and players are silently dropped. Always push directly to `tbRoster` for approved bulk actions.

---

## Swap validation — player-must-exist-in-dashboard guard

Before confirmation buttons are shown for `swap_roster_player`, the runtime validates that the `addPlayer` name actually exists in `allPlayers()`. If not found, the bad recommendation is intercepted silently:

1. The invalid `swap_roster_player` call + an error `functionResponse` (containing the actual top candidates from `getTopPlayers`) are injected into `chatHistory`.
2. Gemini is re-queried immediately — it now has real dashboard players to pick from.
3. The user only ever sees the corrected recommendation with valid buttons.

This prevents the failure loop where Gemini keeps hallucinating player names from its training data.

**System prompt rules updated**:
- Rule 3: "NEVER recommend a player by name unless you have seen that player in a dashboard tool result in this conversation."
- Rule 4: "For swap requests, MUST call `get_top_players` first to find real candidates from the dashboard, then pick from those results."

**Position detection in guard**: Uses both `Position` (group label: "Guards"/"Bigs") and `Pos` (specific: G/F/C/PG/SG/PF/SF) to infer the right position filter for `getTopPlayers` when building the candidate list.

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

**Root cause 3**: When multiple players share the same name (e.g. two players named "Brandon Benjamin" at different schools), `matchLoadedPlayerName` always returned the first one in the pool, ignoring team context stated in the query (e.g. "Brandon Benjamin from Fairfield").

**Fix**: Added two new helpers:
- `extractTeamHint(text, pool)` — extracts a team name from patterns like `"from Fairfield"`, `"at Toledo"`, `"(San Diego)"`, then validates the candidate against actual team names in the player pool.
- `matchLoadedPlayer(text)` → returns the **full player row** (not just the name). When the query contains a team hint and multiple players share a name, it picks the one whose `Team` field matches. Falls back to longest-name match otherwise.

`matchLoadedPlayerName(text)` now delegates to `matchLoadedPlayer` and returns `p.Player`.

`getPlayerProfile(name, team)` — now accepts an optional `team` param. When provided, it first tries `player.name includes name AND player.team includes team` before falling back to name-only match.

`buildForcedWebQuery` now uses `matchLoadedPlayer` and appends `player.Team` to the search string (e.g. `"Brandon Benjamin Fairfield college basketball NIL..."`), so Google hits the right player.

**All call sites updated**: `runValuationComparePipeline` and the `processResp` deferral block both use `matchLoadedPlayer(text)` and pass `matchedPlayerObj?.Team` to `getPlayerProfile`.

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

---

## Opponent roster / Head-to-Head — AI tool intent rules

### Two separate rosters
- `tbRoster[]` — the user's own team (My Team sub-tab)
- `oppRoster[]` — the opponent roster (Opponent sub-tab)

These are **completely independent**. Never add players from one intent into the other.

### Tool selection rules
| Tool | Roster | Trigger phrases |
|---|---|---|
| `add_players_to_roster` | My team | "add X to my roster/team", "load X", "build my team with X" |
| `add_players_to_opponent` | Opponent | "add X to opponent", "X is the opponent", "scout X", "playing against X", "add X against Y" (X=my, Y=opp) |

### Compound command — "X against Y" pattern
Phrases like **"Add [team A] against [team B]"** or **"[A] vs [B]"** mean:
- **A (first/subject team) → `add_players_to_roster`** (my team)
- **B (second/opponent team) → `add_players_to_opponent`** (opponent)

**Critical execution order**: call `add_players_to_opponent` FIRST (executes immediately), then call `add_players_to_roster` (shows confirm buttons). This is necessary because `add_players_to_opponent` is NOT in `CONFIRM_ACTIONS` (instant) while `add_players_to_roster` IS (gated).

Example:
```
"Add all Toledo players against Bowling Green"
→ add_players_to_opponent({team: "Bowling Green"})   ← runs first, instant
→ add_players_to_roster({team: "Toledo"})            ← runs second, shows confirm
```

### `addPlayersToOpponent(names, team, conference, limit)` — filter exclusivity
`team` and `names` are **mutually exclusive** — `team` always wins:
```js
if (team) {
  // Only filter by team — ignore names entirely
  candidates = pool.filter(r => r.Team.toLowerCase().includes(tl));
} else if (names && names.length) {
  // Strict per-name lookup (exact match per player, no cross-team contamination)
  candidates = names.map(n => pool.find(r => r.Player.toLowerCase().includes(n.toLowerCase()))).filter(Boolean);
} else {
  candidates = pool;
}
```

**Why**: When Gemini passes `names` from prior chatHistory context (e.g. Toledo player names from a previous turn), combining with `team` filter would return wrong results. Making them exclusive prevents cross-team contamination.

**Rule**: When adding a full team, Gemini must ALWAYS pass `team:"TeamName"`, never `playerNames` for a bulk team add.

### `add_players_to_opponent` is NOT in `CONFIRM_ACTIONS`
This is intentional. `CONFIRM_ACTIONS` can only hold ONE pending action at a time. If `add_players_to_opponent` required confirmation, compound commands (opponent + my team in a single Gemini turn) would drop the second action.

Do NOT add `add_players_to_opponent` back to `CONFIRM_ACTIONS`.

### `executeConfirm` — chatHistory must be kept valid after bypass
When `executeConfirm(true)` runs the approved action and shows a success message without calling Gemini, it must still record the full exchange in `chatHistory` to prevent consecutive-user-turn errors on the next Gemini call:

```js
// After executing the action and building the success msg:
chatHistory.push(pa.modelMsg);  // the model's functionCall
chatHistory.push({role:'user', parts:[{functionResponse:{name:pa.call.name, response:{result}}}]});
chatHistory.push({role:'model', parts:[{text: msg.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}]});
```

Without this, the next user message sees two consecutive `user` turns in history, which Gemini rejects with "function call turn must come immediately after a user turn".

### `get_head_to_head` tool
Returns per-category stat comparison between `tbRoster` and `oppRoster`. After setting both rosters, the system prompt instructs Gemini to call this tool and mention the ⚔️ Head-to-Head tab.

### `getTeamContext(teamName)` — team-level AI tool
Added to chat.js as the `get_team_context` Gemini tool. Call flow:
1. Normalizes `teamName` to lowercase → looks up in `teamRatings` (global from data.js)
2. Falls back to `allRatingsData[]` fuzzy-includes search if exact key not found
3. Returns: `{requestedTeam, resolved, season, ratings: {adjO, adjD, adjEM, rank, srs, confRank, wins, losses, conference}, topContributors (5), playerCount, teamHubLoaded, teamHubCompare}`
4. Also reads `thCurrentTeam`/`thCurrentCompareTeam` globals from teams.js to report current Team Hub state

Tool is NOT in `CONFIRM_ACTIONS` — executes immediately.

System prompt (Rule 3): When user asks about team strength, ranking, or season performance → call `get_team_context`. adjEM is the primary quality signal.

### Common AI command patterns (reference)
```
Roster management:
  "Add all Toledo players"              → add_players_to_roster({team:"Toledo"})
  "Add [player name]"                   → add_players_to_roster({playerNames:[...]})
  "Remove [player]"                     → remove_player_from_roster
  "Swap [player] for a better guard"    → get_top_players first, then swap_roster_player

Game prep (opponent/H2H):
  "Add all Bowling Green to opponent"   → add_players_to_opponent({team:"Bowling Green"})
  "Add Toledo against Bowling Green"    → add_players_to_opponent({team:"BG"}), then add_players_to_roster({team:"Toledo"})
  "Scout Akron's roster"                → add_players_to_opponent({team:"Akron"})
  "Show head-to-head vs Bowling Green"  → get_head_to_head (after both rosters set)

Team queries:
  "How good is Duke this year?"         → get_team_context({teamName:"Duke"})
  "Compare Kentucky vs Louisville"      → get_team_context x2
  "What's their offensive efficiency?" → get_team_context (adjO/adjEM)

Scouting / search:
  "Find a shooter big under $80K"       → get_top_players({position:'big', sortBy:'3PT_Rating', maxValue:80000})
  "Compare Player A vs Player B"        → compare_players
  "Is Player X worth $200K?"            → runValuationComparePipeline (dual-source)
  "Any injury news on Player X?"        → runValuationComparePipeline (news trigger)
```
