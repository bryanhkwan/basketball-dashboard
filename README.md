# NCAA Basketball Scouting Dashboard
A web-based scouting, valuation, and team-building tool for NCAA Men's and Women's Basketball (MBB/WBB). Built as a single-page dashboard that pulls live data from Google Sheets and runs all scoring, valuation, analysis, and AI recommendations client-side in the browser.

## Core Features

### Player Scoring & Valuation
- **Weighted Composite Scoring**: Each player's raw stats are normalized between your configured Min/Max bounds, scaled by custom weights, and adjusted for direction (higher-is-better vs. lower-is-better). The result: a single "Performance Score" suitable for ranking or filtering.
- **Dollar Valuation Model**: An exponential curve predicts what each player should be worth based on their performance score. Anchored to an "average pay" and a "star performer" target, with optional minutes-played multiplier to avoid inflating bench players.
- **Actual $ Comparison**: Compare model predictions against real-world salary/NIL data. The "Δ$" column highlights over/undervalued players—your edge.
- **Fit Scoring**: Presets (Balanced, Shooting, Defense, Playmaking, Rim Protection, Rebounding) weight percentiles across stat categories to find role-specific matches. Custom fit can also be built.
- **Archetype Tags**: Players are auto-labeled (Shooter, Playmaker, Rim Protector, Disruptor, Anchor Defender, Stretch Big, etc.) based on percentile thresholds across key stats.

### Player Search & Profiles
- **Team-Based Quick Add**: Search by team name to see all players and "Add all N" from that team at once.
- **Full Player Profile Modal**: Click any player name to see percentile bars across all stats, archetype tags with definitions, role descriptions, valuation breakdown, and full stat line.
- **Stat Glossary**: 30+ professional stat definitions built-in. Click any stat name in the Weights table to learn its composite formula and why it matters.
- **Pagination**: Browse 200 players at a time; filter by search term (player, team, conference).

### Team Builder
- **My Team Roster**: Drag-and-drop interface (or use search) to build a 13-man roster. Real-time budget & per-player cap enforcement.
- **Opponent Roster**: Build the opposing team separately for comparison & scouting.
- **Position Targets**: Set Guard/Big allocation targets. Auto-suggestions for swaps when out of balance.
- **Weak Player Flagging**: Highlights roster members below a percentile threshold. Shows upgrade candidates ranked by "bang-for-buck" (performance gain vs. salary delta).
- **Gap Analysis**: Per-category strength assessment (Scoring, Shooting, Ball Security, Playmaking, Rim Protection, etc.) for both rosters with percentile breakdowns.
- **Head-to-Head Comp**: Side-by-side category comparison + legend. Auto-analysis showing which team has edges where + vulnerabilities.
- **Quick Scout**: Opponent roster analysis highlighting strong areas (defend these!) and weak areas (exploit these!).

### Data Management
- **Google Sheets Integration**: Auto-loads "Men Data" and "Women Data" sheets on app open. Manual refresh available.
- **Conference Multipliers**: Apply league-strength adjustments (Big 12 @ 1.08x, lower conferences @ 0.90x–0.95x). Toggle on/off; customize per league.
- **Weights Table**: Full control — set which stats matter (weight), their Min/Max normalization bounds, and direction (higher/lower is better). Save/reset to defaults instantly. Shows what's selected vs. unused.
- **Export CSV**: Download current player rankings with all computed metrics.

### AI Assistant (Gemini-Powered)
- **Natural Language Queries**: "Find a shooter big under $100k" → tool automatically queries the dashboard and returns top matches.
- **Role-Specific Lookups**: Find scorers, playmakers, defenders, rim protectors by natural language.
- **Head-to-Head Summaries**: "How does my team matchup against [opponent]?" → returns category-by-category analysis.
- **Roster Swaps**: "Swap my weakest guard for a better 3-point shooter in budget." → tool suggests & executes.
- **Player Comparisons**: "Compare [Player A] vs [Player B]" → side-by-side stats & percentiles.
- **Conversations persist**: Full history within session; context-aware follow-ups.
- **Guest Mode** (10 free messages): Try the dashboard without signing in. Full feature access minus notes/saves.

### UX Polish
- **Video Loading Screen**: Branded intro video plays during initial data load. "Welcome, [Name]" overlay after load completes.
- **League Toggle**: Switch MBB ↔ WBB with one click. Theme updates (gold vs. pink). Rosters persist per league.
- **Methodology Page**: Explanation of scoring, valuation, archetypes, and fit presets in plain English.
- **Authentication**: Login with username/password (backend: Cloudflare Workers) or continue as guest.
- **Responsive Design**: Works on desktop, tablet, and mobile browsers.

## Stats Included

### 30+ Metrics with Built-In Descriptions:
**Offensive**: PPG, FG%, 3P%, 2P%, FT%, eFG%, TS%, APG, A/TO, AST%, 3PA/G, 3PT_Rating, ORtg, OWS, USG%  
**Defensive**: DRtg, SPG, BPG, STL%, BLK%, ORB/G, DRB/G, OR%, DR%, ORB%, TRB%, WS, WS/40, TOPG, TOV%  
**Advanced**: BPM, OBPM, DBPM, PER, MPG, DWS

Click any stat name in the Weights sidebar to see a full explanation, the direction it's scored (higher/lower is better), and Min/Max bounds.

## How to Use

### 1. Load Data
- The dashboard auto-pulls from Google Sheets on page load
- Or click **Refresh Data** to manually reload
- **Note**: Requires a Google Sheets API key and "Men Data" + "Women Data" sheet names

### 2. Configure Scoring
- Click the **Weights** section
- Adjust weights for stats that matter to your scouting
- Set Min/Max bounds (normalization range) per stat
- Toggle "Advanced Direction" to override higher/lower logic
- Click **Reset to Defaults** to restore baseline

### 3. Browse & Search
- Sort table by any column
- Search by player name, team, or conference
- Click a player to open their full profile & stat breakdown

### 4. Build Rosters
- Switch to **Team Builder** tab
- Add players via search or "Add all [Team]" bulk add
- Set budget & per-player cap
- Assign position targets (Guards/Bigs); get rebalancing suggestions
- Review gap analysis & H2H matchup

### 5. Scout & Compare
- View opponent roster gap analysis
- Run Head-to-Head for category breakdown
- Use AI assistant for quick queries: "Find a playmaker PG under $80k"

### 6. Export & Share
- **Export CSV** downloads all ranked players with scores & valuations
- Share rosters via team screenshots

## Performance Optimizations

- **Batch Mode**: Adding entire teams via quick-add happens in a single refresh (not per-player cascades)
- **Player Pool Caching**: `tbGetAllPlayers()` result cached per league to avoid redundant rebuilds
- **Lazy Rendering**: Player table only re-renders when visible (not hidden behind Team Builder tab)
- **Set-Based Lookups**: O(1) roster-key checks instead of linear scans per column
- **RequestAnimationFrame**: Heavy computations (scoring, gap analysis) staged to keep UI responsive

## Tech Stack

- **Pure HTML/CSS/JS** — no frameworks, no build step, no npm
- **Google Sheets API** — auto-loads player data on demand
- **Cloudflare Workers** — backend for login, notes, and Gemini AI proxy
- **GitHub Pages** — free hosting
- **Single-Page Architecture** — all logic modular, no page reloads

## File Structure

```
index.html                    # Shell (auth overlay, loading screen, DOM)
styles.css                    # All styling + CSS variables (theming)
app.js                        # Coordinator: DOMContentLoaded init, window._app bridge
modules/
  ├── config.js              # Constants, stat glossary, fit presets, default weights
  ├── auth.js                # Login/logout/guest mode, loading orchestration
  ├── data.js                # Scoring engine, valuation model, Google Sheets loader
  ├── players.js             # Player table rendering, pagination, search
  ├── profile.js             # Player modals (profile, stat info, comparison)
  ├── teambuilder.js         # Roster management, gap analysis, H2H, suggestions
  ├── chat.js                # AI chatbot (Gemini), tool orchestration
  └── notes.js               # Note-taking (logged-in users only)
```

## Browser Compatibility

- Chrome, Firefox, Safari, Edge (all modern versions)
- Requires JavaScript enabled
- HTTPS required for Google Sheets API (GitHub Pages + Cloudflare Workers)

## Future Ideas

- **Video replay integration**: Embed clips alongside player profiles
- **Live box scores**: Auto-update player stats in real-time during games
- **Predictive models**: Game outcome predictions, trading recommendations
- **Historical snapshots**: Track player value evolution across seasons

## About the Demo Data

The "Actual $" column shows fictional placeholder values for demonstration. They showcase what the model can do — surfacing over/undervalued players by comparing predictions against real-world data. In production, plug in actual NIL figures or salary data to find real market mispricings.

