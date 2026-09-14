# NCAA Basketball Scouting Dashboard

A comprehensive single-page scouting, valuation, and team-building tool for NCAA Men's (MBB) and Women's (WBB) Basketball. MBB data is fetched live from the College Basketball Data (CBD) API via a Cloudflare Worker proxy. WBB data comes from ESPN APIs. All scoring, valuation, analysis, and AI recommendations run client-side in the browser.

## Data Architecture

| Source | League | What it provides |
|--------|--------|-----------------|
| **CBD API** (via Worker proxy) | MBB | Player stats, team ratings, shot charts, play-by-play, draft data |
| **ESPN APIs** (via Worker proxy) | WBB | Player stats, rosters, schedules, game logs, play-by-play |
| **Google Sheets** (optional) | MBB/WBB | Secondary/override data source for custom datasets |
| **Cloudflare Worker** | Both | Authentication, notes, favorites, eval presets, value cases, portal data, Gemini AI proxy, trend snapshots |

## Core Features

### Guards, Wings and Bigs

Both leagues have three independent player pools, scoring weights and percentile distributions. G/PG/SG are Guards; SF and G-F/F-G are Wings; PF/C and F-C/C-F are Bigs. Native positions come from CBD season statistics for MBB and ESPN byathlete season statistics for WBB, and remain visible as `ListedPosition` with `ListedPositionSource`.

Generic forwards and unknown labels (`ATH`, `NA`) use the shared `classifyPlayerPosition` helper in `modules/config.js`. It uses league-specific height ranges, three-point attempt share, passing and interior activity. Low-sample or missing evidence produces a provisional group. These rules are heuristics; they do not establish the exact position played on court. The player board and profiles identify inferred groups and explain the rule. Detailed thresholds are in the dashboard's Methodology panel. No named-player overrides are used.

Wings have editable defaults totaling 100 in each league. WBB weights use available box-score statistics. Legacy evaluation presets preserve Guard/Big settings and receive the league's default Wing weights. Roster targets, comparisons, portal filters, Value Lab, development tools, profiles and AI tools all use the same groups. Background scoring restores the active group's percentile context; late biography updates reclassify and refresh affected scores and roster references.

```sh
node tools/refresh-player-bios.js --league ALL --seasons 2022,2023,2024,2025,2026 --positions-only
node --test tools/player-positions.test.cjs tools/position-rosters.test.cjs tools/position-consumers.test.cjs tools/player-bios.test.js tools/test-data-bios.cjs
node tools/audit-player-positions.cjs --season 2026
node tools/audit-player-positions.cjs --season 2026 --published
```

The Worker player response must retain native athlete IDs, `ListedPosition`, `ListedPositionSource` and `FGA/G`; its evaluation-preset sanitizer must retain `positionWeights.Wings`. The player cache uses `cbdata:players:v4`. The public snapshots include source positions for all five supported seasons and load alongside statistics before grouping.

### Player Height and Weight

MBB and WBB now load listed measurements from season-specific snapshots in `data/player-bios-*.json`. Height is stored/exported in **inches** and weight in **pounds**. The player board, profile, dossier, CSV export, and AI summaries include these fields. The board reports measurement coverage; missing values stay blank and display as a dash.

MBB uses the [CBD bulk roster endpoint](https://api.collegebasketballdata.com/api/teams) through the existing Worker proxy, with ESPN fallbacks. WBB uses [ESPN bulk athlete biographies](https://sports.core.api.espn.com/v3/sports/basketball/womens-college-basketball/seasons/2026/athletes?limit=1000&page=1), matched by ESPN ID to the selected season's statistics population. Some WBB weights are published, but most are unavailable. No height or weight is estimated. Historical ESPN bio endpoints may return updated measurements; the roster season is **not** a verified measurement date. `HeightSource`, `WeightSource`, `BioSeason`, and `BioUpdatedAt` preserve that distinction in exports.

Refresh the saved datasets with Node (no npm install or build step):

```sh
node tools/refresh-player-bios.js --league ALL --seasons 2022,2023,2024,2025,2026
```

For a smaller update use `--league MBB --seasons 2026` or `--league WBB --seasons 2026`. Browsers reuse the saved snapshots and a seven-day local cache, including known missing fields. The refresh script uses public JSON APIs; it does not need a new API key or Worker deployment.

```sh
node --test tools/test-data-bios.cjs tools/player-bios.test.js
node tools/audit-player-bios.cjs --seasons 2026 --sample 0
```

Measurement refreshes update existing player objects. A changed class/eligibility label or inferred position group triggers recalculation; other biography changes preserve scores. Biography fields and IDs are excluded from scoring weights. WBB statistics use 1,000-row pages with bounded concurrency, and a failed page causes a visible load failure instead of silently dropping players. Team Builder retains only the top displayed suggestions instead of sorting its full candidate pools.

### Player Scoring & Valuation
- **Weighted Composite Scoring**: Stats normalized between configurable Min/Max bounds, scaled by custom weights, adjusted for direction. Outputs a single Performance Score for ranking.
- **Dollar Valuation Model**: Exponential curve predicting player value anchored to average pay and star performer targets, with minutes-played multiplier.
- **Fit Scoring**: Presets (Balanced, Shooting, Defense, Playmaking, Rim Protection, Rebounding) weight percentiles across categories. Custom fits supported.
- **Archetype Tags**: Auto-labeled (Shooter, Playmaker, Rim Protector, Disruptor, Anchor Defender, Stretch Big, etc.) based on percentile thresholds.
- **Conference Multipliers**: League-strength adjustments with separate MBB and WBB multiplier tables (e.g., SEC leads WBB, Big 12 leads MBB). Toggle on/off; fully customizable.

### Player Profiles
- **Full Profile Modal**: Percentile bars, archetype tags, valuation breakdown, scout report, game logs.
- **Scout Report**: Auto-generated 5-section card — Strengths, Weaknesses, Tendencies, Development Areas, and Matchup Notes.
- **Shot Charts**: Three view modes — **Dots** (individual shots), **Hex Map** (hexbin efficiency), and **Zones** (5-zone summary with FG% and FGA per zone, colored by efficiency vs NCAA average).
- **Period Filtering**: Filter shot charts by All / 1st Half / 2nd Half / OT.
- **Draft Radar**: Logistic regression model predicting draft probability for both MBB (NBA) and WBB (WNBA), with factor analysis, development recommendations, and comparable picks.
- **Development Plan**: Deterministic priorities and checkpoints from percentiles; upside simulator (perf score + draft model packages); optional Gemini weekly plan from structured data; save locally or via Worker (`/api/development-plans` when deployed).
- **Performance Trend**: Historical sparklines and trend charts showing composite score and rank over time (when snapshot data available).

### Transfer Portal
- **Live Portal Feed**: Entries from On3 and 247Sports, merged and deduplicated.
- **Fit Lab**: Evaluate portal entries against your team's needs with customizable fit criteria.
- **AI Portal Analysis**: Gemini-powered deep analysis of portal entries with transfer fit grades.
- **Watch Alerts**: Get notified when favorited players enter the portal.

### Teams Hub
- **Team DNA**: Adjusted efficiency ratings (adjO/adjD/adjEM), four factors, scoring profile, and efficiency trend charts.
- **Matchup Analysis**: Dual interactive shot charts with zone comparison table, period filtering, and three chart modes (Dots/Hex/Zones).
- **Deep Analysis**: AI-structured breakdown — Overall Verdict, Offensive/Defensive Keys, Head-to-Head edges, Adjustments.
- **Conference Threats**: Conference standings and scouting notes for rival teams.
- **Tournament Bracket Simulation**: Monte Carlo bracket generation with AI analysis.

### Value Lab
- **Scenario Builder**: Build "what-if" roster scenarios with budget constraints.
- **Value Cases**: Save and compare roster configurations across seasons.
- **AI Valuation Analysis**: Gemini-powered evaluation of roster construction and value.

### Tournament Lab
- **Bracket Simulation**: Monte Carlo simulation engine for tournament bracket predictions.
- **War Room**: Real-time tournament tracking and adjustment dashboard.

### Team Builder
- **Roster Management**: Build 13-player rosters with budget and per-player cap enforcement.
- **Position Targets**: Guard/Big allocation with auto-suggestions for swaps.
- **Gap Analysis**: Per-category strength assessment with percentile breakdowns.
- **Head-to-Head**: Side-by-side roster comparison with category-by-category analysis.

### Collaborate
- **iMessage-style Chat**: DMs and group chats between dashboard users.
- **Player Picks**: Share player evaluations as messages.
- **Shared Scouting**: Collaborative note-taking and roster sharing.

### AI Assistant (Gemini-Powered)
- Natural language queries for player search, team lookups, matchup analysis.
- Tool-augmented responses using live dashboard data.
- Guest mode with 10 free messages.

### Favorites & Notes
- **Favorites**: Per-user player favorites with folder organization.
- **Scout Notes**: Per-player note drawer in the profile modal, synced to the backend.

### Evaluation Presets
- Save and load custom weight/valuation/conference multiplier configurations per league.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+K` / `Cmd+K` | Quick search (players, teams, conferences) |
| `1`–`7` | Switch page tabs |
| `?` | Open help panel |
| `L` | Toggle MBB / WBB |
| `Esc` | Close topmost modal or overlay |

## Tech Stack

- **Pure HTML/CSS/JS** — no frameworks, no build step, no npm
- **Cloudflare Workers** — backend API (D1 database, authentication, proxy)
- **CBD API** — primary MBB data source
- **ESPN APIs** — primary WBB data source
- **Gemini AI** — chatbot, deep analysis, portal analysis (via Worker proxy)
- **GitHub Pages** — hosting
- **Single-Page Architecture** — modular vanilla JS, no page reloads

## File Structure

```
index.html                    # SPA shell (auth overlay, loading screen, DOM)
styles.css                    # All styling + CSS variables (MBB gold / WBB pink theming)
app.js                        # Coordinator: DOMContentLoaded init, window._app bridge
modules/
  ├── config.js              # Constants, URLs, stat glossary, fit presets, conference multipliers
  ├── auth.js                # Login/logout/guest mode, loading orchestration
  ├── data.js                # Scoring engine, valuation model, CBD/ESPN/Sheets data loading
  ├── players.js             # Player table rendering, pagination, search
  ├── profile.js             # Player modal (profile, scout report, shot chart, draft radar, trend)
  ├── teambuilder.js         # Roster management, gap analysis, H2H, suggestions
  ├── teams.js               # Teams Hub (DNA, matchup, deep analysis, bracket, war room)
  ├── shot-analytics.js      # Hexbin + zone shot chart visualization
  ├── portal.js              # Transfer Portal (feed, fit lab, AI analysis)
  ├── lab.js                 # Tournament Lab (bracket sim, war room)
  ├── value-lab.js           # Value Lab (scenario builder, value cases, AI analysis)
  ├── draft.js               # Draft probability model (MBB + WBB), comparables, radar
  ├── player-development.js  # Development priorities, upside simulator, AI plan, persistence
  ├── trends.js              # Historical trend data, sparklines, trend charts
  ├── chat.js                # AI chatbot (Gemini), tool orchestration
  ├── notes.js               # Note-taking (logged-in users)
  ├── favorites.js           # Player favorites with folders
  ├── shares.js              # Collaborate (chat, player picks)
  ├── eval-presets.js        # Evaluation preset save/load
  ├── dashboard-prefs.js     # UI customization preferences
  ├── admin.js               # Admin panel (account management)
  ├── cbdata.js              # CBD API explorer
  ├── shortcuts.js           # Keyboard shortcut handler
  ├── help.js                # Help panel and page tours
  ├── help-content.js        # Help content per page
  └── tour.js                # Interactive tour system
tools/
  ├── build-draft-dataset.js      # MBB draft training data collection
  ├── build-wbb-draft-dataset.js  # WBB draft training data collection
  ├── train-draft-model-v2.js     # MBB draft model training
  └── train-wbb-draft-model.js    # WBB draft model training
data/
  ├── draft-history.json          # MBB draft training dataset
  └── wbb-draft-history.json      # WBB draft training dataset
```

## Performance Optimizations

- **Batch Mode**: Adding entire teams via quick-add in a single refresh
- **Player Pool Caching**: `tbGetAllPlayers()` cached per league
- **Lazy Rendering**: Player table only re-renders when visible
- **Promise Deduplication**: Concurrent identical API requests share a single fetch
- **Set-Based Lookups**: O(1) roster-key checks
- **RequestAnimationFrame**: Heavy computations staged for responsive UI
- **In-Memory Caches**: Team ratings, shooting zones, plays, player shots all cached

## Browser Compatibility

- Chrome, Firefox, Safari, Edge (all modern versions)
- JavaScript required
- HTTPS required (GitHub Pages + Cloudflare Workers)

## NBA salary reference for college valuation

The default valuation basis uses separate NBA salary regressions for Guards, Wings, and Bigs, trained on the supplied 2022–23 workbook with sourced ESPN heights. Open **Players → NBA salary model** for coefficients, bootstrap stability, and held-out regression/tree comparisons. Approved staff can inspect each player's input contributions and the subsequent college pay adjustments in the profile. **Model settings → Valuation basis** switches between the NBA reference and custom scouting weights. The selection is saved in this browser; evaluation presets still manage scouting weights and college pay anchors.

College inputs are standardized within their league and position. NBA age and salary levels are not transferred. The existing college pay anchors set the dollar scale; conference, translation, and scouting adjustments remain separate assumptions. Minutes are not discounted a second time. Production and fit scores remain independent of the learned valuation. These are experimental estimates, not reported NCAA compensation, and the men's NBA sample does not validate WBB pay.

Training and verification are offline Python/Node tools, with no frontend build step:

```powershell
python tools/enrich-nba-heights.py --validate-only
python tools/train-nba-valuation.py
node --test tools/nba-valuation.test.cjs tools/test-data-bios.cjs
node --use-system-ca --use-env-proxy tools/audit-nba-valuations.cjs --season 2026
```

Training requires the original workbook in the repository root and the dependencies in `tools/requirements-nba-valuation.txt`. The original workbook is never overwritten. The height tool can refresh the sourced height snapshot; recorded heights are current listed bios, not verified 2022–23 measurements. Reports, enriched NBA data, coefficient tables, and recalculated college CSVs are generated under `reports/nba-valuation/`. The browser uses the generated `data/nba-valuation-model.js`, with an identical JSON version retained for auditing.
