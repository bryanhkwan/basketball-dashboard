# NCAA Scouting Dashboard — CLAUDE.md

> **Hierarchical context reduction**: Read top-to-bottom. Stop when you have enough context for your task.

---

## L1 — What Is This? (5 lines)

NCAA basketball scouting dashboard for MBB/WBB. Single HTML page + CSS + JS split into modules.
MBB data comes from the CBD API (via Cloudflare Worker). WBB data comes directly from ESPN's public byathlete API (fetched in-browser, CORS-friendly). Hosted on GitHub Pages.
**Key constraint: pure HTML/CSS/JS — no build step, no npm, no bundler.**
All functions and vars that need cross-module access are declared with `var` (not `let`/`const`) so they remain global.
AI chat (Gemini) is backed by a Cloudflare Worker proxy at `white-pine-7669.bryanhkwan.workers.dev`. Backend (login, notes, CBD proxy) lives at `hidden-salad-773b.bryanhkwan.workers.dev`.

---

## L2 — Architecture Map (1 page)

### File list

| File | Purpose |
|---|---|
| `index.html` | Shell HTML — imports all scripts via `<script defer>` |
| `styles.css` | All CSS |
| `modules/config.js` | Utility functions + all constants (no deps) |
| `modules/auth.js` | Login/logout/guest mode, loading coordination, `authStartLoading` |
| `modules/data.js` | State vars, DOM refs, scoring engine, CBD API (MBB) + ESPN byathlete API (WBB) loader, team data loaders |
| `modules/players.js` | Player table rendering, pagination, search |
| `modules/profile.js` | Player profile modal (Scout Report, Shot Chart, career history), stat info, compare modal |
| `modules/teambuilder.js` | tbRoster/oppRoster, gap analysis, H2H, page nav |
| `modules/teams.js` | Teams Hub — team DNA, ratings, shot charts, scout reports, Deep Analysis |
| `modules/notes.js` | Sticky notes (logged-in users only) |
| `modules/chat.js` | AI chat IIFE (Gemini), tool orchestration |
| `app.js` | Thin coordinator: DOMContentLoaded init, event listeners, `window._app` bridge |
| `backend/dashboard-api/hidden-salad-773b/src/index.js` | Cloudflare Worker: login, notes, CBD proxy endpoints |

### Script loading order (in index.html)
```
config.js → auth.js → data.js → players.js → profile.js → teambuilder.js → teams.js → notes.js → chat.js → app.js
```

### Data flow
```
Auth (login / guest) → authStartLoading()
  → loadAllData(season) [data.js]
    → CBD API /api/cbdata/players           → MBB player data
    → ESPN byathlete API (direct, in-browser) → WBB player data
    → /api/wbb/teams (Worker)               → WBB team names + conference mapping
    → wb workbook object [data.js global]
    → reloadActiveSheet() → parseSheetToRows() → rows[]
    → computeAll() → computed[] + tbAllComputed{}
    → thRefreshTeamList() [teams.js] ← auto-called on every data load
    → renderPlayers() [players.js]
    → authFinishLoading() → loading overlay dismissed
  → loadTeamRatings(season) [data.js, background]
    → CBD API /api/cbdata/ratings → teamRatings{} + allRatingsData[]
    → thRefreshTeamList() ← second call after ratings arrive

Teams Hub (teams.js)
  → thLoadTeam(name, season) → CBD API /api/cbdata/teamstats, /api/cbdata/teamshooting
    → thRenderDNA() → thRenderTeamScout()
  → thLoadCompare() → CBD API /api/cbdata/teamstats (opponent)
  → thLoadMatchup() → CBD API /api/cbdata/plays (play-by-play) → shot charts
  → thRunDeepAnalysis() → direct Gemini call → renders in-page into #thDeepOutput

Player Profile (profile.js)
  → openProfile(r) → renderScoutReport(r) + loadPlayerShots() → thInitShotChart('mShotChart')

window._app bridge [app.js]
  → used by chat.js (AI tools)
  → used by profile.js (tbGetAllPlayers, openCompare)
  → used by players.js (tbRoster, tbAddPlayer)
  → exposes teamRatings, allRatingsData, loadGamesForTeam, loadShootingForTeam, thLoadOpponent
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

### modules/auth.js — Auth

**Responsibility**: Login/logout flows, guest mode, loading screen coordination.

**Key functions**:
- `authStartLoading()` — hides auth overlay, shows loading video, fires `loadAllData`
- `authFinishLoading()` — called by data.js when data is ready; background data can continue, but the loading screen exits as soon as the intro video finishes
- `authIsGuest()` — returns `true` if guest session active
- `authGetToken()`, `authGetUser()`, `authSave()`, `authClear()` — token helpers

**Key flags**: `_loadDataReady`, `_loadVideoEnded` — the loading overlay now exits on `_loadVideoEnded`; `_loadDataReady` tracks background data readiness

**Dependencies**: data.js (loadAllData)

---

### modules/data.js — DataManager

**Responsibility**: All state variables, DOM refs, scoring/valuation engine, CBD API (MBB) + ESPN byathlete API (WBB) loader, team-level data loaders.

**Key globals (state)**:
- `wb` — loaded workbook (null until data loads)
- `league` — `'MBB'` or `'WBB'`
- `pos` — `'Guards'` or `'Bigs'`
- `rows` — raw rows for current league+pos
- `computed` — scored+valued rows (source of truth for player table)
- `tbAllComputed` — `{MBB_Guards:[], MBB_Bigs:[], WBB_Guards:[], WBB_Bigs:[]}` — cache
- `statDist` — `{stat: {sorted:[], invert:bool}}` — percentile distributions
- `currentWeights`, `excelWeights` — `{Guards:[], Bigs:[]}` — scoring weights
- `confMultipliers` — live editable conference multipliers
- `sort` — `{key, dir}` — current table sort
- `leagueRosters` — `{MBB:{tb:[],opp:[]}, WBB:{tb:[],opp:[]}}` — per-league roster persistence
- `lastPerfAvg`, `lastPerfStar` — cached valuation anchors
- `teamRatings` — `{teamNameLower: ratingObj}` — loaded from CBD ratings API
- `allRatingsData` — `[]` raw ratings objects
- `careerData` — `{playerNameLower: [{...stats, _season}]}` — multi-season career history
- `playerShotsCache` — `{"team:season:playerName": shots[]}` — shot chart cache

**Key functions**:
- `loadAllData(year)` — parallel CBD API (MBB) + ESPN byathlete (WBB) load; calls `thRefreshTeamList` after `reloadActiveSheet` and again after `loadTeamRatings`
- `loadTeamRatings(year)` — fetches adjusted efficiency ratings; calls `thRefreshTeamList` on completion
- `loadTeamStats(team, year)` — fetches full team season stats (four factors, points breakdown)
- `loadTeamShootingZones(team, year)` — team shooting zone data
- `loadGamesForTeam(team, year)` — team game log
- `loadPlayerShots(team, season, playerName)` — player-level shot chart from CBD API; cached 7 days in KV
- `computeAll()` — main scoring pipeline
- `reloadActiveSheet()` — loads data for current league+pos, auto-caches sibling
- `scoreRow(r)`, `statPercentile(stat, x)`, `archetypeTags(r)`, `fitScoreForRow(r)`
- `bucketPosition(posStr)`, `showWarn(msg)`, `clearWarn()`, `exportCSV()`

**Dependencies**: config.js

---

### modules/players.js — PlayerRenderer

**Responsibility**: Render the player table with sorting, pagination, and "+Add" / "⚔ Opp" buttons.

**Key globals**: `currentPage`, `filteredData`, `_searchTimer`, `LIST_COLS`

**Key functions**: `renderPlayers()`, `renderPlayersPage()`, `sortData(data)`, `debouncedSearch()`

**Dependencies**: config.js, data.js, teambuilder.js, profile.js

---

### modules/profile.js — ProfileManager

**Responsibility**: Player profile modal (percentile bars, Scout Report, Shot Chart, career history), stat glossary, comparison modal.

**Key globals**: `_currentProfilePlayer`, `_lastCompare`

**Key functions**:
- `openProfile(r)` — opens modal; calls `renderScoutReport(r)`, `loadPlayerShots()`, `thInitShotChart('mShotChart')`
- `renderScoutReport(r)` — 5-section scouting card using `statPercentile`; renders into `#mScoutReport`
  - **Strengths**: ≥82nd pct (PPG, eFG%, 3P%, FT%, APG, A/TO, SPG, BPG, RPG, BPM, DRtg, WS/40, OR%, DR%, USG%)
  - **Weaknesses**: ≤22nd pct
  - **Tendencies**: usage role, shooting style, playmaking level, crashing, gambling, paint presence, FT hunting
  - **Development**: 25–55th pct areas closest to breakthrough (up to 3)
  - **Matchup Notes**: 12+ tactical statements (both offense and defense)
- `closeProfile()`, `openStatInfo(stat)`, `closeStatInfo()`, `openCompare(n1, n2)`

**Shot Chart in profile**: `#mShotChart` container; built from `loadPlayerShots`; `thInitShotChart` enables tooltips + click-to-filter (makes/misses toggle).

**Dependencies**: config.js, data.js, teams.js (thInitShotChart), teambuilder.js

---

### modules/teambuilder.js — TeamBuilder

**Responsibility**: Team Builder section — roster management, gap analysis, H2H, opponent roster, page nav, quick-add.

**Key globals**: `tbRoster`, `oppRoster`, + all TB DOM refs

**Key functions**:
- `tbPlayerKey(r)` — `"Player||Team"` unique key
- `tbPlayerLeague(r)` — `'MBB'` or `'WBB'`
- `tbPosGroup(r)` — `'guard'` or `'big'` (NEVER falls back to global `pos`)
- `tbGetAllPlayers(forLeague?)` — merge all tbAllComputed pools (deduped)
- `tbAddPlayer(r)`, `tbRemovePlayer(idx)`, `tbRefresh()`
- `h2hRefresh()` — dual-track H2H bars
- `oppAddPlayer(r)`, `oppRemovePlayer(idx)`, `oppRefresh()`
- `setupQuickAdd()`, `initPageNav()`, `initTbSubNav()`
- `getHeadToHead()` — per-category comparison object for AI tool

**Dependencies**: config.js, data.js, players.js, profile.js

---

### modules/teams.js — TeamsHub

**Responsibility**: Teams Hub page — team DNA, scout reports, shot charts, matchup analysis, Deep Analysis.

**Key globals (state)**:
- `thCurrentTeam`, `thCurrentSeason`, `thMatchupMode` (`'season'|'history'`)
- `_thCurrentStats` — statsData for primary team
- `thCurrentCompareTeam`, `_thCompareStats` — opponent
- `_thLastMatchupCtx` — captured matchup shot context (zone stats from actual games)

**Key functions**:
- `thLoadTeam(teamName, season)` — fetches ratings + stats + shooting; renders DNA + Scout Report; auto-refreshes on data load
- `thRenderDNA(teamName, teamData, statsData)` — adjusted efficiency, four factors, scoring profile, insight pills
- `thRenderTeamScout(teamName, teamData, statsData)` — 5-section team Scout Report into `#thScout`
- `thLoadCompare()` / `thRenderCompare()` — opponent team stats side-by-side
- `thLoadMatchup(compareTeam, mode)` — play-by-play → shot charts + zone table + matchup insights
- `thRenderMatchup(...)` — dual SVG shot charts, zone comparison, insight pills, Deep Analysis button, `#thDeepOutput` placeholder
- `thRunDeepAnalysis()` — async; direct Gemini call (no chat, no web); renders section-card result in `#thDeepOutput`
- `_thFmtDeepText(text)` — groups Gemini markdown into `.thDeepSection` cards with icons per `## header`
- `_th_buildShotChartSVG(shots, name, color)` — SVG with `shot-dot` groups + hit-target overlays
- `thInitShotTooltips(id)`, `thInitShotFilter(id)`, `thInitShotChart(id)` — tooltip + click-filter
- `thRefreshTeamList()` → `thPopulateTeams()` — rebuilds team dropdowns from `tbGetAllPlayers()`; called automatically by `loadAllData`
- `thLoadOpponent(teamName)` — quick-load a team into opponent
- `initTeamsPage()` — DOM init + event listeners

**Shot filter**: CSS-only. `thInitShotFilter` sets `data-filter` attribute on `<svg class="shot-chart-svg">`.
CSS handles opacity: `svg[data-filter="makes"] .shot-dot[data-made="0"] { opacity: 0.07 }`.

**Deep Analysis**: Direct Gemini fetch. No tools array, no chat history, no web search possible. Renders into scrollable `#thDeepOutput` panel with `.thDeepSection` cards. Has spinner during load and `✕` close button.

**Dependencies**: config.js, data.js (all team loaders, statPercentile, teamRatings), teambuilder.js (tbGetAllPlayers), profile.js (openProfile)

---

### modules/chat.js — ChatSystem

**Responsibility**: AI chat system. Gemini-backed chatbot with dashboard-first tool orchestration. Wrapped in an IIFE.

**Key orchestration functions** (all inside IIFE):
- `send()`, `doSend(text)`, `runValuationComparePipeline(userText)`, `processResp(data, depth)`, `callGemini(userText, fnResp?)`
- `execCall(c)` — dispatcher for all tool implementations

**Tool implementations**:
- `getDashboardContext()`, `searchPlayers()`, `getPlayerProfile()`, `getTopPlayers(f)`
- `getTeamContext(teamName)` — looks up `teamRatings` + `allRatingsData` + top contributors; returns adjO/adjD/adjEM/rank/srs/record/conference + current Team Hub state
- `addPlayersToRoster()`, `removeFromRoster()`, `swapPlayer()`, `comparePlayers()`
- `addPlayersToOpponent()` — executes immediately (NOT in CONFIRM_ACTIONS)
- `getHeadToHead()`, `doWebSearch(query)`

**Registered tools**: `search_players`, `get_player_profile`, `get_top_players`, `get_dashboard_context`, `add_players_to_roster`, `remove_player_from_roster`, `swap_roster_player`, `compare_players`, `add_players_to_opponent`, `get_head_to_head`, `get_team_context`, `web_search`

**sysPrompt rules highlight**:
- Rule 3: Team strength/ranking → `get_team_context`; adjEM = primary quality signal
- Rule 13: Player scouting → remind user about profile Scout Report + Shot Chart
- Rule 14: Team matchups → remind user about Team Hub Deep Analysis button

**Exposed**: `window._aiConfirm`, `window.ChatSystem`

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
  openProfile, openCompare, safeNum, fmtMoney, statPercentile, barColor, getInvertForStat,
  get teamRatings(){...}, get allRatingsData(){...},
  loadGamesForTeam, loadShootingForTeam, thLoadOpponent
};
```

### Auto-load Teams Hub
`thRefreshTeamList()` is called TWICE in `loadAllData`:
1. Immediately after `reloadActiveSheet()` — from player pool
2. Inside `loadTeamRatings().then()` — after ratings arrive

Teams Hub dropdowns populate on page load without manual refresh.

### allPlayers() rule
AI chat MUST use `allPlayers()` → `tbGetAllPlayers()`. NEVER `app().computed`.

### Shot filter — CSS-only
```css
.shot-chart-svg[data-filter="makes"]  .shot-dot[data-made="0"] { opacity: 0.07; }
.shot-chart-svg[data-filter="misses"] .shot-dot[data-made="1"] { opacity: 0.07; }
```
`thInitShotFilter` sets/clears `data-filter` on `<svg>`. CSS handles the rest.

### Deep Analysis — direct Gemini call, NOT chatbot
`thRunDeepAnalysis()` is async. Calls `fetch(GEMINI_PROXY_URL)` with:
- Single user message, no chat history, no tools array, no web search
- System instruction: "analyze only the structured data provided"
- Renders result via `_thFmtDeepText` into `#thDeepOutput`

### _thFmtDeepText — section-card layout
Groups content under `## headers` into `.thDeepSection` cards with hex-icon prefix.
Handles bullets (`-`, `•`, `*`), numbered lists, `### subheads`, inline `**bold**`/`*italic*`.

### Bulk add to oppRoster
Direct push + single `oppRefresh()`. Never loop `oppAddPlayer()`.

### CONFIRM_ACTIONS
`add_players_to_roster`, `remove_player_from_roster`, `swap_roster_player` — need Yes/No confirm.
`add_players_to_opponent`, `get_head_to_head`, `get_team_context` — execute immediately.

### MBB/WBB separation
Enforced at `tbAddPlayer()`, `addPlayersToRoster()` in chat.js, and league tab handlers.

### tbPosGroup(r) never uses global pos
Inspects `r.Position`, `r.Pos`, `r._tbPosGroup`. No global `pos` fallback.

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

### modules/auth.js
`DEV_BYPASS_AUTH`, `AUTH_KEY`, `AUTH_USER_KEY`, `AUTH_GUEST_KEY`, `LOGIN_URL`,
`authIsGuest`, `authGetToken`, `authGetUser`, `authSave`, `authClear`,
`authEnterGuest`, `authStartLoading`, `authFinishLoading`, `authShowDashboard`,
`authShowOverlay`, `authInit`, `authPost`,
`_loadDataReady`, `_loadVideoEnded`, `_checkLoadingComplete`, `_authSetupHeader`

### modules/data.js
`wb`, `league`, `pos`, `excelWeights`, `currentWeights`, `rows`, `computed`, `tbAllComputed`,
`statDist`, `sort`, `baseStatsAll`, `lastPerfAvg`, `lastPerfStar`, `leagueRosters`, `confMultipliers`,
`teamRatings`, `allRatingsData`, `careerData`, `playerShotsCache`,
`teamStatsCache`, `teamShootingCache`, `teamShootingZonesCache`, `teamGamesCache`,
`_ratingsReady`, `_careerDataReady`,
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
`computeAll`, `loadAllData`, `loadFromGoogleSheets`, `loadTeamRatings`,
`loadTeamStats`, `loadTeamShootingZones`, `loadGamesForTeam`, `loadShootingForTeam`,
`loadPlayerShots`, `loadCareerSeasons`, `waitForXLSX`, `applyLeagueDefaults`,
`switchLeague`, `switchPos`, `reloadActiveSheet`, `exportCSV`,
`WORKER_URL`,
`window.DataManager`

### modules/players.js
`currentPage`, `filteredData`, `_searchTimer`, `LIST_COLS`,
`sortData`, `renderPlayers`, `renderPlayersPage`, `debouncedSearch`,
`window.PlayerRenderer`

### modules/profile.js
`_currentProfilePlayer`, `_lastCompare`,
`openProfile`, `renderScoutReport`, `closeProfile`, `openStatInfo`, `closeStatInfo`, `openCompare`,
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

### modules/teams.js
`thCurrentTeam`, `thCurrentSeason`, `thMatchupMode`,
`_thCurrentStats`, `thCurrentCompareTeam`, `_thCompareStats`, `_thLastMatchupCtx`,
All TH DOM refs (from `initTeamsDOMRefs`): `thTeamSearch`, `thSeasonInput`, `thLoadBtn`, `thDNAEl`, `thCompare`, `thMatchup`, `thScout`,
`_escAttr`, `_thFmtDeepText`,
`thPopulateTeams`, `thRefreshTeamList`,
`thLoadTeam`, `thRenderDNA`, `thRenderTeamScout`,
`thLoadCompare`, `thRenderCompare`,
`thLoadMatchup`, `thRenderMatchup`,
`thRunDeepAnalysis`,
`_th_buildShotChartSVG`, `thInitShotTooltips`, `thInitShotFilter`, `thInitShotChart`,
`thLoadOpponent`,
`initTeamsDOMRefs`, `initTeamsPage`,
`window.TeamsHub`

### modules/chat.js
All functions local to IIFE:
`send`, `doSend`, `runValuationComparePipeline`, `processResp`, `callGemini`,
`needsMandatoryWebReview`, `buildForcedWebQuery`, `pushFnResult`, `execCall`,
`addMsg`, `showTyping`, `hideTyping`, `fmt`, `fmtText`, `escapeHtml`,
`normAIName`, `extractTeamHint`, `matchLoadedPlayer`, `matchLoadedPlayerName`,
`renderDashboardEvidence`, `renderWebEvidence`,
`getDashboardContext`, `searchPlayers`, `getPlayerProfile`, `getTopPlayers`, `getTeamContext`,
`addPlayersToRoster`, `addPlayersToOpponent`, `removeFromRoster`, `swapPlayer`,
`comparePlayers`, `getHeadToHead`, `doWebSearch`,
`executeConfirm`, `statLine`, `app`, `allPlayers`,
`window._aiConfirm`, `window.ChatSystem`

### app.js
`window._app` bridge object, DOMContentLoaded init block, all top-level event listener registrations

### backend/dashboard-api/hidden-salad-773b/src/index.js
Cloudflare Worker endpoints:
- `POST /login` — auth → JWT
- `GET/POST/DELETE /api/notes` — note CRUD (auth required)
- `GET /api/cbdata/players?season=` — MBB player stats proxy
- `GET /api/cbdata/ratings?season=` — team adjusted efficiency ratings
- `GET /api/cbdata/teamstats?team=&season=` — full team season stats (four factors, points)
- `GET /api/cbdata/teamshooting?team=&season=` — team shot zone breakdown
- `GET /api/cbdata/shooting?team=&season=` — per-player shooting breakdown
- `GET /api/cbdata/games?team=&season=` — team game log
- `GET /api/cbdata/plays?gameId=` — play-by-play (KV v2 key: `cbdata:plays:v2:{gameId}`)
- `GET /api/cbdata/playershots?team=&season=&playerName=` — player shot chart (KV: `cbdata:playershots:v1:{team}:{season}:{playerName}`)
- `POST /` `{action:'web_search', query}` — Gemini web search proxy
- `POST /` `{model, contents, ...}` — Gemini chat proxy (model: `gemini-2.5-flash-lite`)

KV namespace: `PLAYER_CACHE`


---

## L2 — Architecture Map (1 page)

### File list

| File | Purpose |
|---|---|
| `index.html` | Shell HTML — imports all scripts via `<script defer>` |
| `styles.css` | All CSS |
| `modules/config.js` | Utility functions + all constants (no deps) |
| `modules/data.js` | State vars, DOM refs, scoring engine, CBD API (MBB) + ESPN byathlete (WBB) loader |
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
CBD API (MBB) + ESPN byathlete API (WBB, direct browser fetch)
  → loadAllData(season) [data.js]
  → wb (synthetic workbook object) [data.js global]
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

**Responsibility**: All state variables, DOM refs, scoring/valuation engine, CBD API (MBB) + ESPN byathlete (WBB) load, weights UI.

**Key globals (state)**:
- `wb` — loaded workbook (null until data loads)
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
