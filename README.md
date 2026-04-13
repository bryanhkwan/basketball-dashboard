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
