---
name: performance-optimization
description: 'Optimize performance of the basketball dashboard. Use when fixing lag, slow loading, scroll jank, heavy rendering, or runtime sluggishness. Covers JS computation, DOM rendering, CSS paint cost, event handling, and data pipeline optimization.'
argument-hint: 'Describe what feels slow (loading, scrolling, profile open, table render, etc.)'
---

# Performance Optimization — Basketball Dashboard

## When to Use
- User reports lag during loading, scrolling, or interaction
- Profiling reveals long tasks or layout thrashing
- Adding new features that touch rendering hot paths
- Optimizing data pipelines (computeAll, reloadActiveSheet)

## Architecture Context

This is a vanilla JS app (no framework) with ~20 script modules loaded via `<script defer>`. Key hot paths:

| Hot Path | File | Function | Impact |
|----------|------|----------|--------|
| Loading screen | `modules/auth.js` | `_checkLoadingComplete()` | Blocks dashboard entry until data is ready (min 1.5s) |
| Scoring pipeline | `modules/data.js` | `computeAll()` | Runs on every data load, league/pos switch, weight change |
| Player table render | `modules/players.js` | `renderPlayersPage()` | 200 rows × 12+ columns per page |
| Stat distributions | `modules/data.js` | `buildStatDistributions()` | Array sort per stat, called inside computeAll |
| Profile open | `modules/profile.js` | `openProfile()` | Scout report + similar players + shot chart |
| Team builder refresh | `modules/teambuilder.js` | `tbRefresh()` | Roster + gaps + suggestions + H2H + player table |
| Reload sheet | `modules/data.js` | `reloadActiveSheet()` | Parse + compute current + sibling position |

## Optimization Checklist

### 0. Loading Screen (`auth.js`)
- **Data-driven exit**: `_checkLoadingComplete()` exits on `_loadDataReady`, NOT on video end. Video is decorative — don't block on it.
- **Never add setTimeout for data load**: Call `loadAllData()` immediately from `authStartLoading()`. The old `setTimeout(..., 50)` added 50ms for no benefit.
- **Video preload**: Set `preload="none"` on the `<video>` element in HTML. The auth module loads the video when needed via `authPlayIntroVideo()`. This prevents the video from competing with API fetches for bandwidth.
- **Minimum display time**: 1.5s enforced via `_loadStartTime` + `MIN_DISPLAY` check, so loading screen isn't a visual flash.

### 1. Computation (`computeAll`)
- **Merge array passes**: Never chain `.map()` calls that create intermediate arrays. Use a single `for` loop with `Object.assign` or mutation.
- **Pre-compute percentile anchors**: Collect `perfArr`/`mpArr` in the scoring pass, not via a separate `.map().filter()`.
- **Use typed arrays** (`Float64Array`) for numeric intermediate buffers when array size is known.
- **Cache percentiles**: After `buildStatDistributions()`, compute `_pct_<stat>` on each player object so downstream code (profile, scout report) doesn't re-call `statPercentile()`.
- **`skipRender` option**: Always pass `{ skipRender: true }` when computing sibling positions or background data.

### 2. DOM Rendering
- **Event delegation**: NEVER attach event listeners per row. Use a single delegated handler on the table body:
  ```js
  // Set up ONCE
  if (!tableBody._delegated) {
    tableBody._delegated = true;
    tableBody.addEventListener('click', function(e) {
      var tr = e.target.closest('tr');
      if (!tr) return;
      var idx = Number(tr.dataset.ri);
      // ... handle clicks based on e.target class
    });
  }
  // Store row index as data-ri on each <tr>
  ```
- **DocumentFragment**: Build all rows into a fragment, then do a single `innerHTML = ''` + `appendChild(frag)`.
- **Avoid querySelector after innerHTML**: Inline styles in the template string instead of setting them via JS after DOM insertion.
- **Cache DOM element references**: Use a lazy-init cache object for elements looked up by `document.getElementById` repeatedly.
- **Batch DOM writes**: Group all `textContent`/`style` mutations; avoid interleaving reads and writes (causes forced synchronous layout).

### 3. CSS Performance
- **`backdrop-filter: blur()`**: Keep ≤10px on sticky/fixed elements. Higher values (20px+) cause GPU-heavy repaints on every scroll frame.
- **`contain: content`** on scroll containers and card grids — tells the browser the element's rendering is independent.
- **`contain: layout style`** on sticky headers and nav bars — prevents layout recalculation from propagating.
- **`will-change: transform`** on position:sticky elements — promotes to own compositor layer.
- **Avoid multi-layer box-shadows** on elements visible during scroll. Simplify to single shadow.
- **No `transition` on properties that trigger layout** (width, height, padding). Use `transform` and `opacity` only.

### 4. Data Loading
- **Stage critical vs non-critical**: Load the primary league first, render immediately, then load secondary league / ratings / career data via `requestIdleCallback` with staggered timeouts.
- **Stagger background work**: Never fire multiple heavy background tasks concurrently. Current stagger schedule:
  - Phase 1 (2s after load): Team ratings — lightweight API fetch + index build
  - Phase 2 (5s after load): Secondary league — API fetch + parse + sheet reload
  - Phase 3 (8s after load): Career data — 5 API fetches (heavyweight)
- **Career data should NOT trigger computeAll**: Class inference is display-only. Just call `renderPlayers()`, not `computeAll()`.
- **Deduplication**: Track loading state per-league with `_leagueDataStatus` to prevent duplicate fetches.
- **On-demand loading**: Career data and team ratings should load when first needed (profile open, Teams Hub), not eagerly on startup.
- **Cache with TTL**: Use object caches (`teamStatsCache`, `playerShotsCache`) keyed by `"team:season"`. Check before fetching.
- **Table header caching**: Track a `_lastHeaderKey` and only rebuild headers when columns actually change (league switch, etc.). Don't clear `playersHead.innerHTML` on every `renderPlayers()` call.

### 5. Search & Filter
- **Debounce search input**: 150ms minimum (`debouncedSearch`).
- **Pre-compute lowercase search fields**: If filtering is slow, cache `_searchStr` on each row during `computeAll`.

### 6. Profile Modal
- **Use cached percentiles**: Read `r['_pct_' + stat]` before falling back to `statPercentile(stat, x)`.
- **Similar players**: Use cached percentile vectors; avoid re-calling `statPercentile` for every player × every stat.
- **DocumentFragment for stat bars**: Build all bar items into a fragment, append once (not per-item appendChild).

## Anti-Patterns to Avoid

| Anti-Pattern | Why Bad | Fix |
|---|---|---|
| `array.map().map().map()` | Creates N intermediate arrays; O(kN) | Single for-loop |
| `el.addEventListener(...)` per row | 200+ closures per render; memory leak | Event delegation |
| `el.innerHTML = ''; el.appendChild(frag)` | Two reflows; clear is unnecessary with fragment | Just `el.innerHTML = ''; el.appendChild(frag)` (single batch) |
| `document.getElementById()` in hot loop | DOM lookup per iteration | Cache in variable |
| `backdrop-filter: blur(20px)` on any element | GPU-heavy repaints; ≤8px is safe | ≤6-8px or use solid background |
| `el.style.color = ...; el.textContent = ...` interleaved with reads | Layout thrashing | Group all writes together |
| Per-profile `statPercentile()` calls | Binary search per stat per open | Pre-cache in `_pct_` fields |
| `_checkLoadingComplete` waiting on video | Users wait for full video before seeing dashboard | Exit on `_loadDataReady` instead |
| `setTimeout(loadAllData, 50)` in auth | Delays data fetch by 50ms for no benefit | Call `loadAllData()` directly |
| `video preload="auto"` in HTML | Competes with API fetches for bandwidth | Use `preload="none"`; auth module loads when needed |
| Background `computeAll()` from career data | Full scoring pipeline re-run just for display-only class labels | Just call `renderPlayers()` |
| Multiple `scheduleNonCriticalWork` at same timing | Concurrent heavy tasks cause UI stalls | Stagger with 2s/5s/8s delays |
| `playersHead.innerHTML = ''` on every render | Forces header rebuild + re-attaches click listeners | Cache `_lastHeaderKey`; only clear when columns change |

## Diagnostic Steps

1. Open browser DevTools → Performance tab → Record page load
2. Look for long tasks (>50ms) in the flame chart
3. Check "Recalculate Style" / "Layout" events during scroll
4. Use `console.time('computeAll')` / `console.timeEnd('computeAll')` to measure hot functions
5. Check memory tab for detached DOM nodes (leaked event listeners)

## Reference: Key State Variables

| Variable | Module | Purpose |
|---|---|---|
| `_loadDataReady` | auth.js | True when primary league data is loaded and rendered |
| `_loadStartTime` | auth.js | Timestamp of loading screen display (for min display enforcement) |
| `_loadTransitionStarted` | auth.js | Guard against double-transition |
| `computed` | data.js | Current position's scored player array |
| `tbAllComputed` | data.js | Cache: `{MBB_Guards:[], MBB_Bigs:[], ...}` |
| `statDist` | data.js | `{stat: {sorted:[], invert:bool}}` for percentiles |
| `_playersPageData` | players.js | Current page's row array (for delegation) |
| `_lastHeaderKey` | players.js | Tracks column config to avoid unnecessary header rebuilds |
| `_cachedAllPlayers` | teambuilder.js | Merged player pool cache |
| `_tbCachedEls` | teambuilder.js | Cached DOM element references |
