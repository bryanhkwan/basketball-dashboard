# NCAA Scouting Dashboard — CLAUDE.md

> **Hierarchical context reduction**: Read top-to-bottom. Stop when you have enough context for your task.

---

## L1 — What Is This? (5 lines)

NCAA basketball scouting dashboard for MBB/WBB. Single HTML page + CSS + JS split into modules.
Data comes from Google Sheets (Men Data / Women Data tabs). Hosted on GitHub Pages.
**Key constraint: pure HTML/CSS/JS — no build step, no npm, no bundler.**
All functions and vars that need cross-module access are declared with `var` (not `let`/`const`) so they remain global.
AI chat (Gemini) is backed by a Cloudflare Worker proxy at `white-pine-7669.bryanhkwan.workers.dev`.

---

## L2 — Architecture Map (1 page)

### File list

| File | Purpose |
|---|---|
| `index.html` | Shell HTML — imports all scripts via `<script defer>` |
| `styles.css` | All CSS |
| `modules/config.js` | Utility functions + all constants (no deps) |
| `modules/data.js` | State vars, DOM refs, scoring engine, Google Sheets loader |
| `modules/players.js` | Player table rendering, pagination, search |
| `modules/profile.js` | Player profile modal, stat info modal, compare modal |
| `modules/teambuilder.js` | tbRoster/oppRoster, gap analysis, H2H, page nav |
| `modules/chat.js` | AI chat IIFE (Gemini), tool orchestration |
| `app.js` | Thin coordinator: DOMContentLoaded init, event listeners, `window._app` bridge |

### Script loading order (in index.html)
```
config.js → data.js → players.js → profile.js → teambuilder.js → chat.js → app.js
```

### Data flow
```
Google Sheets API
  → loadFromGoogleSheets() [data.js]
  → wb (workbook object) [data.js global]
  → reloadActiveSheet() → parseSheetToRows() → rows[]
  → computeAll() → computed[] + tbAllComputed{}
  → renderPlayers() [players.js]
  → openProfile() [profile.js]

window._app bridge [app.js]
  → used by chat.js (AI tools)
  → used by profile.js (tbGetAllPlayers, openCompare)
  → used by players.js (tbRoster, tbAddPlayer)
```

---

## L3 — Module Reference

### modules/config.js — Config

**Responsibility**: Pure constants and utility functions. No DOM access. No state.

**Key exports (globals)**:
- `clamp`, `clamp01`, `fmtMoney`, `safeNum` — numeric helpers
- `aoaToObjects`, `sheetToAoa`, `sheetToJson`, `scalePct` — sheet parsing
- `percentileInc`, `percentileRank`, `extractSpreadsheetId` — math
- `deepClone` — JSON deep copy
- `DEFAULT_GS_URL`, `DEFAULT_GS_API_KEY` — Google Sheets defaults
- `SHEET_MAP` — `{MBB:'Men Data', WBB:'Women Data'}`
- `PAGE_SIZE` — 200
- `FIT_PRESETS` — balanced/shooting/playmaking/defense/rim/rebounding
- `GUARD_DEFAULTS`, `BIG_DEFAULTS` — default scoring weight arrays
- `ROLE_DESCRIPTIONS`, `STAT_GLOSSARY` — display text
- `DEFAULT_DIR` — stat direction overrides
- `CONF_DISPLAY_ORDER`, `DEFAULT_CONF_VALUES`, `CONF_ALIASES` — conference multiplier data
- `GAP_CATEGORIES`, `GAP_EXPLANATIONS` — team builder gap analysis
- `window.Config` — class instance (organizational)

**Dependencies**: none

---

### modules/data.js — DataManager

**Responsibility**: All state variables, DOM refs, scoring/valuation engine, Google Sheets load, weights UI.

**Key globals (state)**:
- `wb` — loaded workbook (null until Google Sheets loads)
- `league` — `'MBB'` or `'WBB'`
- `pos` — `'Guards'` or `'Bigs'`
- `rows` — raw rows for current league+pos
- `computed` — scored+valued rows (source of truth for player table)
- `tbAllComputed` — `{MBB_Guards:[], MBB_Bigs:[], WBB_Guards:[], WBB_Bigs:[]}` — cache across tabs
- `statDist` — `{stat: {sorted:[], invert:bool}}` — percentile distributions
- `currentWeights`, `excelWeights` — `{Guards:[], Bigs:[]}` — scoring weights
- `confMultipliers` — live editable conference multipliers
- `sort` — `{key, dir}` — current table sort
- `leagueRosters` — `{MBB:{tb:[],opp:[]}, WBB:{tb:[],opp:[]}}` — per-league roster persistence
- `lastPerfAvg`, `lastPerfStar` — cached valuation anchors

**Key globals (DOM refs)**: All DOM refs used across modules are declared here (gsUrlInput, recalcBtn, weightsBody, searchInput, fitPresetEl, avgPayEl, etc.). Initialized in `initDataDOMRefs()` called from `app.js` DOMContentLoaded.

**Key functions**:
- `loadScoringWeight()` — initializes default weights from GUARD_DEFAULTS/BIG_DEFAULTS
- `computeAll()` — main scoring pipeline (scoreRow → valuation → buildStatDistributions → fitScore → rankAll → renderPlayers)
- `reloadActiveSheet()` — loads data for current league+pos, auto-caches sibling position
- `loadFromGoogleSheets(url, key)` — fetches MBB+WBB sheets via Sheets API
- `renderWeights()`, `updateWeightFooter()` — weights table UI
- `renderConfMultTable()`, `getConfMultiplier()` — conference multiplier UI
- `scoreRow(r)` — returns raw PerfScore for one row
- `statPercentile(stat, x)` — returns 0..1 percentile (uses `statDist`)
- `archetypeTags(r)` — returns array of `{t, c}` role tag objects
- `fitScoreForRow(r)` — returns 0..100 fit score
- `barColor(p)` — returns CSS color var for percentile p
- `getInvertForStat(stat)` — true if lower is better
- `guessDirForStat(stat)`, `normalizeDirValue(v)` — direction helpers
- `bucketPosition(posStr)` — maps raw Pos string to 'Guards'|'Bigs'
- `findSheetLike(target)` — fuzzy sheet name lookup in `wb`
- `showWarn(msg)`, `clearWarn()` — warning banner
- `applyLeagueDefaults(force)` — sets MBB/WBB salary anchors
- `exportCSV()` — downloads CSV of computed data
- `setActiveTab(el, groupSelector)` — CSS active tab helper

**Dependencies**: config.js

---

### modules/players.js — PlayerRenderer

**Responsibility**: Render the player table with sorting, pagination, and "+ Add to roster" / "⚔ Add to opponent" buttons.

**Key globals**:
- `currentPage`, `filteredData` — pagination state
- `LIST_COLS` — column definitions array (includes `_tb_add` and `_opp_add` special columns)
- `_searchTimer` — debounce handle

**Key functions**:
- `renderPlayers()` — filters `computed` by search, calls `renderPlayersPage()`
- `renderPlayersPage()` — renders current page of `filteredData` into DOM
- `sortData(data)` — sorts array using `sort.key` / `sort.dir` from data.js
- `debouncedSearch()` — 150ms debounce wrapper around renderPlayers

**Dependencies**: config.js (safeNum, fmtMoney, PAGE_SIZE), data.js (computed, pos, sort, statDist), teambuilder.js (tbRoster, tbAddPlayer, tbRefresh, tbPlayerKey, oppRoster, oppAddPlayer), profile.js (openProfile)

---

### modules/profile.js — ProfileManager

**Responsibility**: Player profile modal, stat glossary modal, comparison modal.

**Key globals**:
- `_currentProfilePlayer` — the player currently shown in the modal
- `_lastCompare` — `{name1, name2}` — last comparison pair (also `window._lastCompare`)

**Key functions**:
- `openProfile(r)` — opens player profile modal with stat bars, archetype tags, similar players, compare button
- `closeProfile()` — hides modalBack
- `openStatInfo(stat)` — opens stat glossary modal for a stat
- `closeStatInfo()` — hides statBack
- `openCompare(name1, name2)` — opens side-by-side comparison modal; returns `true` on success

**Dependencies**: config.js (safeNum, fmtMoney, clamp, ROLE_DESCRIPTIONS, STAT_GLOSSARY), data.js (pos, statDist, currentWeights, statPercentile, getInvertForStat, archetypeTags, lastPerfStar, barColor, bucketPosition, fitPresetEl, confMultToggleEl, avgPayEl, starValueEl, starPctEl, mTitle, mSub, etc.), teambuilder.js (tbGetAllPlayers, tbPlayerKey)

---

### modules/teambuilder.js — TeamBuilder

**Responsibility**: Team Builder section — roster management, gap analysis, H2H, opponent roster, page navigation, quick-add.

**Key globals**:
- `tbRoster` — `[]` array of player row objects (My Team)
- `oppRoster` — `[]` array of player row objects (Opponent)
- All TB DOM refs: tbBudgetEl, tbPlayerCapEl, tbMaxRosterEl, tbRosterBody, tbGapBars, h2hBars, oppRosterBody, etc.

**Key functions**:
- `tbPlayerKey(r)` — `"Player||Team"` string unique key
- `tbPlayerLeague(r)` — `'MBB'` or `'WBB'` for a player
- `tbPosGroup(r)` — `'guard'` or `'big'` (NEVER falls back to global `pos`)
- `tbGetAllPlayers(forLeague?)` — merge all `tbAllComputed` pools for current league (deduped)
- `tbPlayerAvgPct(r)` — avg percentile across gap categories for a player
- `tbAddPlayer(r)` — adds to tbRoster with budget/cap/league enforcement
- `tbRemovePlayer(idx)` — removes from tbRoster
- `tbRefresh()` — full refresh: stats → tbRenderRoster → tbRenderGaps → tbRenderSuggestions → renderPlayersPage
- `tbRenderGapBarsForRoster(roster, barsEl, emptyEl, tagsEl)` — shared gap bar renderer (used by both My Team and Opponent)
- `h2hRefresh()` — renders dual-track H2H bars
- `oppAddPlayer(r)` — bulk-pushes to oppRoster, calls oppRefresh (no per-player tbRefresh)
- `oppRemovePlayer(idx)` — removes from oppRoster, calls oppRefresh
- `oppRefresh()` — renders opponent roster + gap bars + quick scout + calls h2hRefresh
- `setupQuickAdd(inputId, dropdownId, addFn)` — dropdown player search widget
- `initPageNav()` — sets up Players | Team Builder | Methodology page tabs
- `initTbSubNav()` — sets up My Team | H2H | Opponent sub-tabs
- `pctToGrade(pct)` — A+/A/B+/… grade label
- `getHeadToHead()` — returns per-category comparison object for AI tool

**Dependencies**: config.js (safeNum, fmtMoney, GAP_CATEGORIES, GAP_EXPLANATIONS), data.js (league, pos, computed, statDist, statPercentile, tbAllComputed, clearWarn, showWarn), players.js (renderPlayersPage), profile.js (openProfile)

---

### modules/chat.js — ChatSystem

**Responsibility**: AI chat system. Gemini-backed chatbot with dashboard-first tool orchestration. Wrapped in an IIFE.

**Key orchestration functions** (all inside IIFE, local scope):
- `send()` — entry point; handles pending confirmations or starts new turn
- `doSend(text)` — runs `runValuationComparePipeline` first, else calls Gemini directly
- `runValuationComparePipeline(userText)` — deterministic dual-source pipeline for valuation/news queries
- `processResp(data, depth)` — recursive response processor; handles function calls, confirmations, text
- `callGemini(userText, fnResp?)` — sends to Gemini proxy via fetch
- `needsMandatoryWebReview(text)` — gates valuation+current-info queries
- `buildForcedWebQuery(text)` — tailors web search query to intent
- `pushFnResult(name, args, result)` — injects synthetic tool call/response into chatHistory
- `execCall(c)` — dispatcher for all tool implementations

**Tool implementations** (local to IIFE):
- `getDashboardContext()`, `searchPlayers()`, `getPlayerProfile()`, `getTopPlayers()`
- `addPlayersToRoster()`, `removeFromRoster()`, `swapPlayer()`, `comparePlayers()`
- `addPlayersToOpponent()` — executes immediately (NOT in CONFIRM_ACTIONS)
- `getHeadToHead()` — delegates to `window._app.getHeadToHead()`
- `doWebSearch(query)` — calls Cloudflare Worker proxy

**Key per-turn guards** (reset at start of each user message):
- `turnHasDashboardLookup` — true once any local tool ran
- `turnWebSearchDeferred` — prevents double-deferral of web_search
- `turnHasWebSearch` — true once web_search ran
- `turnForcedWebForValuation` — prevents forced-web loop

**Exposed to window**:
- `window._aiConfirm(confirmed)` — called by Yes/No confirm buttons
- `window.ChatSystem` — organizational class instance

**Dependencies**: all other modules via `window._app` bridge

---

## L4 — Critical Patterns & Gotchas

### window._app bridge
```js
window._app = {
  get tbRoster(){...}, set tbRoster(v){...},
  get oppRoster(){...}, set oppRoster(v){...},
  get computed(){...}, get pos(){...}, get league(){...},
  get statDist(){...}, get currentWeights(){...},
  tbAddPlayer, tbRefresh, tbGetAllPlayers, tbPlayerKey, tbPlayerLeague, tbPosGroup,
  tbPlayerAvgPct, oppAddPlayer, oppRemovePlayer, oppRefresh, getHeadToHead,
  openProfile, openCompare, safeNum, fmtMoney, statPercentile, barColor, getInvertForStat
};
```
Chat module accesses everything via `const app = () => window._app || {};`

### allPlayers() rule
AI chat functions that query players MUST use `allPlayers()` which calls `tbGetAllPlayers()`.
NEVER use `app().computed` — that's only the currently visible tab's dataset.

### leagueRosters per-league storage
`var leagueRosters = {MBB:{tb:[],opp:[]}, WBB:{tb:[],opp:[]}}` is declared in data.js.
Currently tbRoster/oppRoster are simple globals; leagueRosters is available for future per-league persistence.

### tbAllComputed cache
`tbAllComputed[league+'_'+pos]` is populated by `computeAll()` (called from `reloadActiveSheet`).
`reloadActiveSheet` auto-computes the sibling position (Guards↔Bigs) so both pools are always cached.

### Bulk add to oppRoster
Use direct push + single `oppRefresh()` — do NOT loop `oppAddPlayer()` (each call triggers oppRefresh + renderPlayers).
```js
const roster = a.oppRoster;
valid.forEach(r => roster.push(r));
if(a.oppRefresh) a.oppRefresh();
```

### CONFIRM_ACTIONS
`const CONFIRM_ACTIONS = new Set(['add_players_to_roster','remove_player_from_roster','swap_roster_player'])`
`add_players_to_opponent` and `get_head_to_head` are NOT in this set — they execute immediately.

### compound command parsing
When Gemini calls swap_roster_player with a player name that doesn't exist in the dashboard,
`processResp` self-corrects: injects real candidates and re-queries Gemini.

### statDist rebuild
`statDist` is rebuilt inside `computeAll()` by `buildStatDistributions()`.
It uses `computed` (current tab's rows). Profile + team builder modules always call `statPercentile(stat, x)` which reads `statDist`.

### MBB/WBB separation
League is enforced at:
1. `tbAddPlayer()` — blocks cross-league roster additions
2. `addPlayersToRoster()` in chat.js — same check via `leagueFn`
3. League tab click handlers in app.js — clears roster on switch with confirm

### tbPosGroup(r) never uses global pos
`tbPosGroup` inspects `r.Position`, `r.Pos`, and `r._tbPosGroup`. It does NOT fall back to the global `pos` variable. This is required for correct behavior when both Guards and Bigs are on the roster.

---

## L5 — File Index

### modules/config.js
`clamp`, `clamp01`, `fmtMoney`, `safeNum`, `aoaToObjects`, `sheetToAoa`, `sheetToJson`, `scalePct`,
`percentileInc`, `percentileRank`, `extractSpreadsheetId`, `deepClone`,
`DEFAULT_GS_URL`, `DEFAULT_GS_API_KEY`, `SHEET_MAP`, `PAGE_SIZE`,
`FIT_PRESETS`, `GUARD_DEFAULTS`, `BIG_DEFAULTS`,
`ROLE_DESCRIPTIONS`, `STAT_GLOSSARY`, `DEFAULT_DIR`,
`CONF_DISPLAY_ORDER`, `DEFAULT_CONF_VALUES`, `CONF_ALIASES`,
`GAP_CATEGORIES`, `GAP_EXPLANATIONS`,
`window.Config`

### modules/data.js
`wb`, `league`, `pos`, `excelWeights`, `currentWeights`, `rows`, `computed`, `tbAllComputed`,
`statDist`, `sort`, `baseStatsAll`, `lastPerfAvg`, `lastPerfStar`, `leagueRosters`, `confMultipliers`,
All DOM refs: `gsUrlInput`, `gsKeyInput`, `loadGsBtn`, `recalcBtn`, `exportBtn`, `resetWeightsBtn`,
`resetValBtn`, `searchInput`, `warn`, `fitPresetEl`, `weightsBody`, `showSelectedOnlyEl`,
`advancedDirEl`, `playersHead`, `playersBody`, `activeSheetEl`, `activeFitEl`,
`wTotalLocalEl`, `wRemainingEl`, `wOverBoxEl`, `wOverEl`,
`kpiPlayers`, `kpiStats`, `kpiTotalW`, `kpiAvgPerf`, `kpiStarPerf`,
`avgPayEl`, `minPayEl`, `maxPayEl`, `starValueEl`, `starPctEl`, `mpModeEl`, `mpPctEl`,
`modalBack`, `mClose`, `mTitle`, `mSub`, `mScore`, `mFit`, `mVal`, `mMult`, `mMeta`, `mBars`, `mAllStats`, `mTags`,
`confMultToggleEl`, `confMultBodyEl`, `confMultTableBody`, `confMultRangeEl`, `confMultLeagueNote`, `resetConfMultBtn`,
`initDataDOMRefs`, `showWarn`, `clearWarn`, `setActiveTab`, `normalizeName`, `findSheetLike`,
`bucketPosition`, `prettyDir`, `normalizeDirValue`, `guessDirForStat`, `directionLabel`,
`getInvertForStat`, `barColor`, `parseSheetToRows`, `isLikelyNumericColumn`,
`getNumericColumnsFromRows`, `minMaxForStat`, `ensureWeightsCoverStats`, `loadScoringWeight`,
`updateWeightFooter`, `renderWeights`, `renderConfMultTable`, `updateConfMultRange`,
`getConfMultiplier`, `sheetHasConference`, `scoreRow`, `getMpMultiplier`,
`buildStatDistributions`, `statPercentile`, `fitScoreForRow`, `archetypeTags`,
`computeAll`, `loadFromGoogleSheets`, `waitForXLSX`, `applyLeagueDefaults`,
`switchLeague`, `switchPos`, `reloadActiveSheet`, `exportCSV`,
`window.DataManager`

### modules/players.js
`currentPage`, `filteredData`, `_searchTimer`, `LIST_COLS`,
`sortData`, `renderPlayers`, `renderPlayersPage`, `debouncedSearch`,
`window.PlayerRenderer`

### modules/profile.js
`_currentProfilePlayer`, `_lastCompare`,
`openProfile`, `closeProfile`, `openStatInfo`, `closeStatInfo`, `openCompare`,
`window.ProfileManager`

### modules/teambuilder.js
`tbRoster`, `oppRoster`,
All TB DOM refs: `tbBudgetEl`, `tbPlayerCapEl`, `tbMaxRosterEl`, `tbCountEl`, `tbMaxLabelEl`,
`tbCostEl`, `tbRemainingEl`, `tbPosNoteEl`, `tbRosterBody`, `tbRosterEmpty`,
`tbGapBars`, `tbGapEmpty`, `tbGapTags`, `tbSuggestBody`, `tbSuggestEmpty`, `tbClearBtn`,
`tbWeakThreshEl`, `tbWeakThreshLabelEl`, `oppRosterBody`, `oppRosterEmpty`,
`oppGapBars`, `oppGapEmpty`, `oppGapTags`, `oppBudgetEl`, `oppCountEl`, `oppCostEl`, `h2hBars`,
`initTeamBuilderDOMRefs`, `tbPlayerKey`, `tbPlayerLeague`, `tbPosGroup`, `tbGetAllPlayers`,
`tbPlayerAvgPct`, `tbAddPlayer`, `tbRemovePlayer`, `tbRefresh`,
`tbRenderRoster`, `tbRenderGaps`, `tbRenderSuggestions`,
`tbRenderGapBarsForRoster`, `h2hRefresh`,
`oppAddPlayer`, `oppRemovePlayer`, `oppRefresh`,
`setupQuickAdd`, `initPageNav`, `initTbSubNav`,
`renderSwapRows`, `pctToGrade`, `getHeadToHead`,
`window.TeamBuilder`

### modules/chat.js
All functions local to IIFE:
`send`, `doSend`, `runValuationComparePipeline`, `processResp`, `callGemini`,
`needsMandatoryWebReview`, `buildForcedWebQuery`, `pushFnResult`, `execCall`,
`addMsg`, `showTyping`, `hideTyping`, `fmt`, `fmtText`, `escapeHtml`,
`normAIName`, `extractTeamHint`, `matchLoadedPlayer`, `matchLoadedPlayerName`,
`renderDashboardEvidence`, `renderWebEvidence`,
`getDashboardContext`, `searchPlayers`, `getPlayerProfile`, `getTopPlayers`,
`addPlayersToRoster`, `addPlayersToOpponent`, `removeFromRoster`, `swapPlayer`,
`comparePlayers`, `getHeadToHead`, `doWebSearch`,
`executeConfirm`, `statLine`, `app`, `allPlayers`,
`window._aiConfirm`, `window.ChatSystem`

### app.js
`window._app` bridge object, DOMContentLoaded init block, all top-level event listener registrations
