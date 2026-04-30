// ============ PROFILE DOSSIER MODULE ============
// Additive player report view: deep-linkable, lazy-rendered, and independent from
// the existing profile modal so the main player board stays fast.

(function () {
  'use strict';

  var pdState = {
    player: null,
    compares: [],
    logs: [],
    snapshots: [],
    trendPoints: [],
    trendKey: 'snap_perf',
    trendSelected: null,
    logFilter: 'all',
    logLimit: '8',
    logSortKey: 'date',
    logSortDir: 'desc',
    suggestions: [],
    wired: false,
    shell: null,
    body: null,
  };

  var pdLogCache = {};
  var pdColors = ['#63b3ed', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];

  function pdEsc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function pdNum(value) {
    if (typeof safeNum === 'function') return safeNum(value);
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function pdMoney(value) {
    if (typeof demoFormatMoney === 'function') return demoFormatMoney(value);
    if (typeof fmtMoney === 'function') return fmtMoney(value);
    var n = pdNum(value);
    return Number.isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : '--';
  }

  function pdSeason() {
    if (typeof getDashboardSelectedSeason === 'function') return getDashboardSelectedSeason('2026');
    return String(typeof _currentDataSeason !== 'undefined' ? _currentDataSeason : 2026);
  }

  function pdLeague() {
    return typeof league !== 'undefined' ? league : 'MBB';
  }

  function pdKey(row) {
    return String((row && row.Player) || '') + '||' + String((row && row.Team) || '');
  }

  function pdHeight(row) {
    var h = pdNum(row && row.Height);
    if (Number.isFinite(h) && h > 0) return Math.floor(h / 12) + "'" + (h % 12) + '"';
    return String((row && row.Height) || '').trim();
  }

  function pdAllPlayers(targetLeague) {
    try {
      if (typeof tbGetAllPlayers === 'function') return tbGetAllPlayers(targetLeague || pdLeague()) || [];
    } catch (_) {}
    return Array.isArray(computed) ? computed : [];
  }

  function pdPlayerLabel(row) {
    return [row && row.Team, row && (row.Conference || row.Conf), row && (row.Pos || row.Position), pdHeight(row)]
      .filter(Boolean).join(' - ');
  }

  function pdBuildHash(row, view) {
    var parts = [
      'player=' + encodeURIComponent((row && row.Player) || ''),
      'team=' + encodeURIComponent((row && row.Team) || ''),
      'league=' + encodeURIComponent((row && row._league) || pdLeague())
    ];
    if (view) parts.push('view=' + encodeURIComponent(view));
    return '#' + parts.join('&');
  }

  function pdBuildUrl(row, view) {
    return location.origin + location.pathname + location.search + pdBuildHash(row, view);
  }

  function pdSetHash(row, view) {
    var hash = pdBuildHash(row, view);
    if (location.hash !== hash) history.pushState(null, '', hash);
  }

  function pdFindPlayer(name, team, targetLeague) {
    var needle = String(name || '').trim().toLowerCase();
    var teamNeedle = String(team || '').trim().toLowerCase();
    if (!needle) return null;
    var all = pdAllPlayers(targetLeague);
    var exact = all.find(function (p) {
      var pn = String(p.Player || '').trim().toLowerCase();
      var tm = String(p.Team || '').trim().toLowerCase();
      return pn === needle && (!teamNeedle || tm === teamNeedle);
    });
    if (exact) return exact;
    return all.find(function (p) {
      var pn = String(p.Player || '').trim().toLowerCase();
      var tm = String(p.Team || '').trim().toLowerCase();
      return pn.indexOf(needle) >= 0 && (!teamNeedle || tm.indexOf(teamNeedle) >= 0);
    }) || null;
  }

  function pdPct(row, stat) {
    if (!row || !stat) return null;
    var cached = row['_pct_' + stat];
    if (Number.isFinite(cached)) return cached;
    if (typeof profilePctOrNull === 'function') {
      var pp = profilePctOrNull(row, stat);
      if (Number.isFinite(pp)) return pp;
    }
    var value = pdNum(row[stat]);
    if (!Number.isFinite(value) || typeof statPercentile !== 'function') return null;
    var pct = statPercentile(stat, value);
    return Number.isFinite(pct) ? pct : null;
  }

  function pdTone(pct) {
    if (!Number.isFinite(pct)) return 'var(--muted)';
    if (typeof barColor === 'function') return barColor(pct);
    if (pct >= 0.8) return 'var(--good)';
    if (pct >= 0.55) return 'var(--accent)';
    if (pct >= 0.35) return 'var(--warn)';
    return 'var(--bad)';
  }

  function pdFmtStatValue(value) {
    var n = pdNum(value);
    if (!Number.isFinite(n)) return value == null || value === '' ? '--' : String(value);
    if (Math.abs(n) < 1 && n !== 0) return n.toFixed(3);
    return n.toFixed(Math.abs(n) >= 100 ? 0 : 1);
  }

  function pdClamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function pdFirstNum(obj, keys) {
    if (!obj) return null;
    for (var i = 0; i < keys.length; i++) {
      var n = pdNum(obj[keys[i]]);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function pdGameDate(game) {
    return String((game && (game.date || game.gameDate || game.d || game.Date)) || '');
  }

  function pdGameOpp(game) {
    return String((game && (game.opponent || game.opponentTeam || game.opp || game.Opponent)) || '');
  }

  function pdGameRank(game) {
    return pdFirstNum(game, ['opponentRank', 'opponent_rank', 'oppRank', 'opp_rank', 'rank', 'rk', 'OpponentRank']);
  }

  function pdGameLoc(game) {
    if (!game) return '';
    var raw = String(game.location || game.homeAway || game.ha || game.site || '').trim();
    if (raw) return raw;
    var h = pdNum(game.home);
    if (h === 1) return 'H';
    if (h === -1) return '@';
    return '';
  }

  function pdPctText(value) {
    var n = pdNum(value);
    if (!Number.isFinite(n)) return '--';
    if (Math.abs(n) <= 1) return (n * 100).toFixed(1) + '%';
    return n.toFixed(1) + '%';
  }

  function pdPrimaryStats(row, limit) {
    var bucket = typeof bucketPosition === 'function'
      ? bucketPosition(row && (row.Pos || row.Position))
      : (String(row && (row.Pos || row.Position) || '').toLowerCase().indexOf('c') >= 0 ? 'Bigs' : 'Guards');
    var fromWeights = [];
    if (typeof currentWeights !== 'undefined' && currentWeights && currentWeights[bucket]) {
      fromWeights = currentWeights[bucket]
        .filter(function (item) { return item && Number(item.w || 0) !== 0; })
        .map(function (item) { return item.stat; });
    }
    var fallback = ['PPG', 'eFG%', '3P%', 'FT%', 'APG', 'A/TO', 'RPG', 'SPG', 'BPG', 'DRtg', 'WS/40', 'BPM', 'USG%'];
    var seen = {};
    return fromWeights.concat(fallback).filter(function (stat) {
      if (!stat || seen[stat]) return false;
      seen[stat] = true;
      return row && row[stat] !== undefined && row[stat] !== '';
    }).slice(0, limit || 10);
  }

  function pdMetricCard(label, value, sub, tone) {
    return '<div class="pdMetric pdMetric--' + pdEsc(tone || 'neutral') + '">'
      + '<div class="pdMetricLabel">' + pdEsc(label) + '</div>'
      + '<div class="pdMetricValue">' + value + '</div>'
      + '<div class="pdMetricSub">' + pdEsc(sub || '') + '</div>'
      + '</div>';
  }

  function pdBuildGlimpseHtml(row) {
    var items = [
      { label: 'production', type: 'dbl', value: pdNum(row.Score), fmt: function (v) { return v.toFixed(2); } },
      { label: 'projection', type: 'dbl', value: pdNum(row.ProjectionPerf_calc), fmt: function (v) { return v.toFixed(2); } },
      { label: 'fit', type: 'dbl', value: pdNum(row.FitScore_calc), fmt: function (v) { return v.toFixed(0); } },
      { label: 'ppg', type: 'dbl', value: pdNum(row.PPG), fmt: function (v) { return v.toFixed(1); } },
      { label: 'rpg', type: 'dbl', value: pdNum(row.RPG), fmt: function (v) { return v.toFixed(1); } },
      { label: 'apg', type: 'dbl', value: pdNum(row.APG), fmt: function (v) { return v.toFixed(1); } },
      { label: 'efg_pct', type: 'dbl', value: pdNum(row['eFG%']), fmt: pdPctText },
      { label: 'three_pct', type: 'dbl', value: pdNum(row['3P%']), fmt: pdPctText },
      { label: 'bpm', type: 'dbl', value: pdNum(row.BPM), fmt: function (v) { return (v >= 0 ? '+' : '') + v.toFixed(1); } },
      { label: 'minutes', type: 'dbl', value: pdNum(row.MP || row.MPG), fmt: function (v) { return v.toFixed(1); } }
    ];
    var rowsHtml = items.map(function (item) {
      var hasValue = Number.isFinite(item.value);
      return '<div class="pdGlimpseRow">'
        + '<span class="pdGlimpseVar">$ ' + pdEsc(item.label) + '</span>'
        + '<span class="pdGlimpseType">&lt;' + pdEsc(item.type) + '&gt;</span>'
        + '<span class="pdGlimpseVal">' + (hasValue ? pdEsc(item.fmt(item.value)) : '--') + '</span>'
        + '</div>';
    }).join('');
    var meta = [
      row.Team,
      row.Conference || row.Conf,
      row.Pos || row.Position,
      row.Class || row.Year || row.Yr,
      pdHeight(row)
    ].filter(Boolean).join(' - ');
    return '<div class="pdGlimpseMeta">' + pdEsc(meta || 'Loaded player row') + '</div>' + rowsHtml;
  }

  function pdRangeRow(label, low, mid, high, fmt, maxHint) {
    if (!Number.isFinite(low) || !Number.isFinite(mid) || !Number.isFinite(high)) return '';
    var max = Math.max(maxHint || 0, high, mid, low, 1);
    var lowPct = pdClamp((low / max) * 100, 0, 100);
    var highPct = pdClamp((high / max) * 100, 0, 100);
    var midPct = pdClamp((mid / max) * 100, 0, 100);
    var width = Math.max(2, highPct - lowPct);
    return '<div class="pdRangeRow">'
      + '<div class="pdRangeTop"><span>' + pdEsc(label) + '</span><b>' + pdEsc(fmt(mid)) + '</b></div>'
      + '<div class="pdRangeTrack">'
      + '<div class="pdRangeBand" style="left:' + lowPct.toFixed(2) + '%;width:' + width.toFixed(2) + '%"></div>'
      + '<div class="pdRangeMid" style="left:' + midPct.toFixed(2) + '%"></div>'
      + '</div>'
      + '<div class="pdRangeScale"><span>floor ' + pdEsc(fmt(low)) + '</span><span>ceiling ' + pdEsc(fmt(high)) + '</span></div>'
      + '</div>';
  }

  function pdBuildProjectionRangeHtml(row) {
    var perfLow = pdNum(row.ProjectionFloorPerf_calc);
    var perfMid = pdNum(row.ProjectionPerf_calc);
    var perfHigh = pdNum(row.ProjectionCeilingPerf_calc);
    var valueLow = pdNum(row.ProjectionFloorValue_calc);
    var valueMid = pdNum(row.ProjectionMedianValue_calc);
    var valueHigh = pdNum(row.ProjectionCeilingValue_calc);
    var production = pdNum(row.Score);
    var maxPerf = Math.max(100, perfHigh || 0, production || 0);
    var rowsHtml = ''
      + pdRangeRow('Projected Perf', perfLow, perfMid, perfHigh, function (v) { return v.toFixed(2); }, maxPerf)
      + pdRangeRow('Projected Value', valueLow, valueMid, valueHigh, pdMoney, Math.max(valueHigh || 0, pdNum(row.ActualValuation_calc) || 0, pdNum(row.MarketPressure_calc) || 0));
    if (!rowsHtml) return '<div class="muted">Projection range data is not available for this player.</div>';
    var confidence = pdNum(row.ProjectionConfidence_calc);
    var chips = [
      { label: 'Confidence', value: Number.isFinite(confidence) ? Math.round(confidence * 100) + '%' : (row.ProjectionConfidenceLabel_calc || '--') },
      { label: 'Medical', value: row.ProjectionMedicalRiskLabel_calc || 'Low' },
      { label: 'Talent', value: row.ProjectionHealthyTalentLabel_calc || '--' }
    ];
    return rowsHtml + '<div class="pdRangeChips">' + chips.map(function (chip) {
      return '<span><b>' + pdEsc(chip.label) + '</b>' + pdEsc(chip.value) + '</span>';
    }).join('') + '</div>';
  }

  function pdBuildPercentileBars(row) {
    var stats = pdPrimaryStats(row, 9);
    if (!stats.length) return '<div class="muted">No percentile data for this player.</div>';
    return stats.map(function (stat) {
      var pct = pdPct(row, stat);
      var raw = row[stat];
      var pctLabel = Number.isFinite(pct) ? Math.round(pct * 100) + 'th' : '--';
      var width = Number.isFinite(pct) ? Math.max(2, Math.round(pct * 100)) : 0;
      return '<div class="pdBar">'
        + '<div class="pdBarTop"><span><b>' + pdEsc(stat) + '</b> <em>' + pdEsc(pdFmtStatValue(raw)) + '</em></span><span>' + pctLabel + '</span></div>'
        + '<div class="pdBarTrack"><div class="pdBarFill" style="width:' + width + '%;background:' + pdTone(pct) + '"></div></div>'
        + '</div>';
    }).join('');
  }

  function pdBuildScoutRead(row) {
    var stats = pdPrimaryStats(row, 14);
    var strengths = [];
    var watches = [];
    stats.forEach(function (stat) {
      var pct = pdPct(row, stat);
      if (!Number.isFinite(pct)) return;
      var value = pdFmtStatValue(row[stat]);
      if (pct >= 0.82) strengths.push(stat + ' grades in the ' + Math.round(pct * 100) + 'th percentile (' + value + ').');
      if (pct <= 0.22) watches.push(stat + ' is a watch item at the ' + Math.round(pct * 100) + 'th percentile (' + value + ').');
    });
    if (!strengths.length) strengths.push('Balanced profile without one extreme outlier in the current weighted stat set.');
    if (!watches.length) watches.push('No major red flags from the primary percentile set.');
    return { strengths: strengths.slice(0, 5), watches: watches.slice(0, 5) };
  }

  function pdBuildScoutHtml(row) {
    var read = pdBuildScoutRead(row);
    var tags = [];
    try {
      if (typeof archetypeTags === 'function') tags = archetypeTags(row).map(function (x) { return x.t; }).filter(Boolean);
    } catch (_) {}
    return '<div class="pdScoutGrid">'
      + '<div class="pdScoutCol"><div class="pdMiniHead">Strengths</div>'
      + read.strengths.map(function (txt) { return '<div class="pdScoutItem pdScoutItem--good">' + pdEsc(txt) + '</div>'; }).join('')
      + '</div>'
      + '<div class="pdScoutCol"><div class="pdMiniHead">Watch Items</div>'
      + read.watches.map(function (txt) { return '<div class="pdScoutItem pdScoutItem--warn">' + pdEsc(txt) + '</div>'; }).join('')
      + '</div>'
      + '<div class="pdScoutCol"><div class="pdMiniHead">Role Tags</div>'
      + (tags.length ? tags.slice(0, 8).map(function (tag) { return '<span class="pdTag">' + pdEsc(tag) + '</span>'; }).join('') : '<div class="muted">No role tags currently assigned.</div>')
      + '</div>'
      + '</div>';
  }

  function pdSimilarPlayers(row) {
    var all = pdAllPlayers();
    var curBucket = typeof bucketPosition === 'function' ? bucketPosition(row.Pos || row.Position) : '';
    var stats = curBucket === 'Bigs'
      ? ['PPG', 'eFG%', 'RPG', 'BPG', 'DRtg', 'BPM', 'FT%', 'A/TO']
      : ['PPG', 'eFG%', '3P%', 'APG', 'A/TO', 'SPG', 'BPM', 'DRtg'];
    var curVec = stats.map(function (s) { var p = pdPct(row, s); return Number.isFinite(p) ? p : 0.5; });
    return all.filter(function (p) {
      if (pdKey(p) === pdKey(row)) return false;
      if (curBucket && typeof bucketPosition === 'function' && bucketPosition(p.Pos || p.Position) !== curBucket) return false;
      return true;
    }).map(function (p) {
      var dist = 0;
      stats.forEach(function (s, i) {
        var pct = pdPct(p, s);
        var v = Number.isFinite(pct) ? pct : 0.5;
        dist += Math.pow(curVec[i] - v, 2);
      });
      return { player: p, dist: Math.sqrt(dist) };
    }).sort(function (a, b) { return a.dist - b.dist; }).slice(0, 5);
  }

  function pdBuildSimilarHtml(row) {
    var items = pdSimilarPlayers(row);
    if (!items.length) return '<div class="muted">No similar players found in the loaded pool.</div>';
    return items.map(function (item) {
      var p = item.player;
      return '<button class="pdSimilar" type="button" data-pd-open="' + pdEsc(pdKey(p)) + '">'
        + '<span><b>' + pdEsc(p.Player || 'Player') + '</b><em>' + pdEsc(p.Team || '') + '</em></span>'
        + '<span>' + (Number.isFinite(p.Score) ? p.Score.toFixed(1) : '--') + ' perf</span>'
        + '</button>';
    }).join('');
  }

  function pdEnsureShell() {
    if (pdState.shell) return pdState.shell;
    var shell = document.createElement('div');
    shell.id = 'playerDossierBack';
    shell.className = 'pdBack';
    shell.innerHTML = '<div class="pdModal" role="dialog" aria-modal="true">'
      + '<div class="pdBody" id="playerDossierBody"></div>'
      + '</div>';
    document.body.appendChild(shell);
    pdState.shell = shell;
    pdState.body = document.getElementById('playerDossierBody');
    pdWireShell();
    return shell;
  }

  function pdOpen(row, opts) {
    if (!row) return;
    opts = opts || {};
    pdEnsureShell();
    pdState.player = row;
    pdState.compares = [];
    pdState.logs = [];
    pdState.snapshots = [];
    pdState.trendPoints = [];
    pdState.trendKey = 'snap_perf';
    pdState.trendSelected = null;
    pdState.logFilter = 'all';
    pdState.logLimit = '8';
    pdState.logSortKey = 'date';
    pdState.logSortDir = 'desc';
    pdState.shell.style.display = 'flex';
    document.body.classList.add('pdOpen');
    if (!opts.skipHash) pdSetHash(row, 'report');
    pdRender();
    pdLoadTrendData(row);
  }

  function pdClose() {
    if (pdState.shell) pdState.shell.style.display = 'none';
    document.body.classList.remove('pdOpen');
    if (location.hash && /(?:^|[&#])view=report(?:&|$)/.test(location.hash)) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function pdRender() {
    var r = pdState.player;
    if (!r || !pdState.body) return;
    var perf = Number.isFinite(r.Score) ? r.Score.toFixed(2) : '--';
    var fit = Number.isFinite(r.FitScore_calc) ? r.FitScore_calc.toFixed(0) : '--';
    var proj = pdNum(r.ProjectionPerf_calc);
    var confidence = pdNum(r.ProjectionConfidence_calc);
    var reason = String(r.ProjectionReasonSummary_calc || '').trim();
    var cards = ''
      + pdMetricCard('Production', perf, 'current weighted model', 'accent')
      + pdMetricCard('Fit', fit, 'active fit preset', 'neutral')
      + pdMetricCard('Toledo Max', pdEsc(pdMoney(r.ActualValuation_calc)), 'staff valuation output', 'good')
      + pdMetricCard('Market Pressure', pdEsc(pdMoney(r.MarketPressure_calc)), 'national curve context', 'warn')
      + pdMetricCard('Projection', Number.isFinite(proj) ? proj.toFixed(2) : '--', 'healthy-talent blend', 'neutral')
      + pdMetricCard('Confidence', Number.isFinite(confidence) ? Math.round(confidence * 100) + '%' : '--', String(r.ProjectionConfidenceLabel_calc || ''), 'neutral');

    pdState.body.innerHTML =
      '<div class="pdHeader">'
      + '<div class="pdHeaderMain">'
      + '<div class="pdEyebrow">Player dossier</div>'
      + '<h2>' + pdEsc(r.Player || 'Player') + '</h2>'
      + '<div class="pdSub">' + pdEsc(pdPlayerLabel(r)) + '</div>'
      + '</div>'
      + '<div class="pdActions">'
      + '<button class="secondary" type="button" data-pd-action="copy-link">Copy Link</button>'
      + '<button class="secondary" type="button" data-pd-action="open-modal">Open Modal</button>'
      + '<button class="primary" type="button" data-pd-action="card">Create Card</button>'
      + '<button class="close" type="button" data-pd-action="close">Close</button>'
      + '</div>'
      + '</div>'
      + '<div class="pdCardStatus" id="pdCardStatus"></div>'
      + '<section class="pdSection"><div class="pdMetrics">' + cards + '</div>'
      + (reason ? '<div class="pdNote">Projection note: <b>' + pdEsc(reason) + '</b></div>' : '')
      + '</section>'
      + '<section class="pdGrid2">'
      + '<div class="pdPanel"><div class="pdPanelHead"><span>Summary</span><span class="pdCodeLabel">glimpse(player$stats)</span></div><div class="pdPanelBody">' + pdBuildGlimpseHtml(r) + '</div></div>'
      + '<div class="pdPanel"><div class="pdPanelHead"><span>Projection Range</span><span class="pdCodeLabel">predict(player)</span></div><div class="pdPanelBody">' + pdBuildProjectionRangeHtml(r) + '</div></div>'
      + '</section>'
      + '<section class="pdGrid2">'
      + '<div class="pdPanel"><div class="pdPanelHead">Key Percentiles</div><div class="pdPanelBody">' + pdBuildPercentileBars(r) + '</div></div>'
      + '<div class="pdPanel"><div class="pdPanelHead">Scout Read</div><div class="pdPanelBody">' + pdBuildScoutHtml(r) + '</div></div>'
      + '</section>'
      + '<section class="pdPanel"><div class="pdPanelHead pdTrendHead"><span>Trend</span>'
      + '<select id="pdTrendSelect" class="pdSelect">'
      + '<option value="snap_perf">Snapshot: Production</option>'
      + '<option value="snap_rank">Snapshot: Rank</option>'
      + '<option value="points">Game Log: Points</option>'
      + '<option value="rebounds">Game Log: Rebounds</option>'
      + '<option value="assists">Game Log: Assists</option>'
      + '<option value="minutes">Game Log: Minutes</option>'
      + '<option value="fgPct">Game Log: FG%</option>'
      + '<option value="bpm">Game Log: BPM</option>'
      + '</select></div><div class="pdPanelBody"><div id="pdTrendMount" class="pdTrendMount"><div class="muted">Loading trend data...</div></div></div></section>'
      + '<section class="pdPanel"><div class="pdPanelHead">Inline Compare</div><div class="pdPanelBody">'
      + '<div class="pdCompareSearch"><input id="pdCompareSearch" type="text" placeholder="Add player to compare..." autocomplete="off"><div id="pdCompareSuggestions" class="pdSuggest"></div></div>'
      + '<div id="pdCompareMount">' + pdBuildCompareHtml() + '</div>'
      + '</div></section>'
      + '<section class="pdGrid2">'
      + '<div class="pdPanel"><div class="pdPanelHead pdLogHead"><span>Game Log</span><div class="pdInlineControls">'
      + '<select id="pdLogFilter" class="pdSelectSmall"><option value="all">All Games</option><option value="10">vs Top 10</option><option value="25">vs Top 25</option><option value="50">vs Top 50</option><option value="100">vs Top 100</option></select>'
      + '<select id="pdLogLimit" class="pdSelectSmall"><option value="8">Last 8</option><option value="15">Last 15</option><option value="all">All</option></select>'
      + '<select id="pdLogSort" class="pdSelectSmall"><option value="date:desc">Newest</option><option value="points:desc">PTS</option><option value="rebounds:desc">REB</option><option value="assists:desc">AST</option><option value="minutes:desc">MIN</option></select>'
      + '</div></div><div class="pdPanelBody"><div id="pdRecentGames" class="pdRecentGames"><div class="muted">Loading game log...</div></div></div></div>'
      + '<div class="pdPanel"><div class="pdPanelHead">Similar Profiles</div><div class="pdPanelBody">' + pdBuildSimilarHtml(r) + '</div></div>'
      + '</section>';

    pdRenderCompare();
  }

  function pdFetchGameLogs(row) {
    var season = pdSeason();
    var key = [pdLeague(), season, row.Team || '', row.Player || ''].join(':').toLowerCase();
    if (pdLogCache[key]) return Promise.resolve(pdLogCache[key]);
    if (!row || !row.Player || !row.Team) return Promise.resolve([]);

    if (pdLeague() === 'WBB' && typeof _fetchWbbGameLog === 'function') {
      return _fetchWbbGameLog(row, season).then(function (games) {
        pdLogCache[key] = Array.isArray(games) ? games : [];
        return pdLogCache[key];
      }).catch(function () { return []; });
    }

    var url = URLS.WORKER + '/api/cbdata/playergamelog?team=' + encodeURIComponent(row.Team)
      + '&season=' + encodeURIComponent(season)
      + '&playerName=' + encodeURIComponent(row.Player);
    return fetch(url).then(function (resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    }).then(function (data) {
      pdLogCache[key] = Array.isArray(data.games) ? data.games : [];
      return pdLogCache[key];
    }).catch(function () { return []; });
  }

  function pdLoadTrendData(row) {
    var trendPromise = window.TrendModule && typeof window.TrendModule.getTrendData === 'function'
      ? window.TrendModule.getTrendData(row.Player || '', 'player', pdLeague())
      : Promise.resolve([]);
    Promise.all([trendPromise.catch(function () { return []; }), pdFetchGameLogs(row)]).then(function (results) {
      if (pdKey(row) !== pdKey(pdState.player)) return;
      pdState.snapshots = Array.isArray(results[0]) ? results[0] : [];
      pdState.logs = Array.isArray(results[1]) ? results[1] : [];
      if (pdState.snapshots.length < 2) pdState.trendKey = 'points';
      var sel = document.getElementById('pdTrendSelect');
      if (sel) sel.value = pdState.trendKey;
      pdRenderTrend();
      pdRenderRecentGames();
    });
  }

  function pdLogValue(game, key) {
    if (!game) return null;
    if (key === 'points') return pdFirstNum(game, ['points', 'pts', 'PTS']);
    if (key === 'rebounds') return pdFirstNum(game, ['rebounds', 'reb', 'REB']);
    if (key === 'assists') return pdFirstNum(game, ['assists', 'ast', 'AST']);
    if (key === 'minutes') {
      var m = game.minutes || game.mp || game.MP || game.min;
      if (typeof m === 'string' && m.indexOf(':') >= 0) return pdNum(m.split(':')[0]);
      return pdNum(m);
    }
    if (key === 'fgPct') {
      var made = pdFirstNum(game, ['fgm', 'FGM']);
      var att = pdFirstNum(game, ['fga', 'FGA']);
      return Number.isFinite(made) && Number.isFinite(att) && att > 0 ? made / att * 100 : null;
    }
    if (key === 'bpm') return pdFirstNum(game, ['bpm', 'BPM']);
    return null;
  }

  function pdTrendName(key) {
    var map = {
      snap_perf: 'Snapshot Production',
      snap_rank: 'Snapshot Rank',
      points: 'Points',
      rebounds: 'Rebounds',
      assists: 'Assists',
      minutes: 'Minutes',
      fgPct: 'FG%',
      bpm: 'BPM'
    };
    return map[key] || String(key || 'Trend');
  }

  function pdFmtTrendValue(value, key) {
    if (!Number.isFinite(value)) return '--';
    if (key === 'fgPct') return value.toFixed(1) + '%';
    if (key === 'snap_rank') return '#' + Math.round(value);
    if (key === 'bpm') return (value >= 0 ? '+' : '') + value.toFixed(1);
    return value.toFixed(1);
  }

  function pdTrendPoints() {
    var key = pdState.trendKey;
    if (key === 'snap_perf' || key === 'snap_rank') {
      var field = key === 'snap_rank' ? 'rank' : 'perf';
      return (pdState.snapshots || []).map(function (snap, i) {
        var label = String(snap.week || snap.date || (i + 1));
        return {
          label: label,
          axisLabel: label.replace(/^20\d\d-W/, 'W'),
          value: pdNum(snap[field]),
          type: 'snapshot',
          meta: String(snap.date || snap.week || ''),
          raw: snap
        };
      }).filter(function (p) { return Number.isFinite(p.value); });
    }
    return (pdState.logs || []).slice().sort(function (a, b) {
      return pdGameDate(a).localeCompare(pdGameDate(b));
    }).map(function (game, i) {
      var opp = pdGameOpp(game);
      var date = pdGameDate(game);
      var rank = pdGameRank(game);
      var meta = [date, Number.isFinite(rank) ? '#' + rank : '', pdGameLoc(game)].filter(Boolean).join(' - ');
      return {
        label: opp || date || String(i + 1),
        axisLabel: date ? date.slice(5) : String(i + 1),
        value: pdLogValue(game, key),
        type: 'game',
        meta: meta,
        game: game
      };
    }).filter(function (p) { return Number.isFinite(p.value); });
  }

  function pdAvg(values) {
    var vals = (values || []).filter(Number.isFinite);
    return vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : null;
  }

  function pdTrendTooltipHtml(point) {
    if (!point) return '';
    var key = pdState.trendKey;
    var game = point.game;
    var statLine = '';
    if (game) {
      statLine = '<div class="pdTrendTipStats">'
        + '<span>PTS <b>' + pdEsc(pdFmtStatValue(pdLogValue(game, 'points'))) + '</b></span>'
        + '<span>REB <b>' + pdEsc(pdFmtStatValue(pdLogValue(game, 'rebounds'))) + '</b></span>'
        + '<span>AST <b>' + pdEsc(pdFmtStatValue(pdLogValue(game, 'assists'))) + '</b></span>'
        + '<span>MIN <b>' + pdEsc(pdFmtStatValue(pdLogValue(game, 'minutes'))) + '</b></span>'
        + '</div>';
    }
    return '<div class="pdTrendTipTitle">' + pdEsc(point.label || 'Point') + '</div>'
      + '<div class="pdTrendTipMeta">' + pdEsc(point.meta || '') + '</div>'
      + '<div class="pdTrendTipValue">' + pdEsc(pdTrendName(key)) + ': <b>' + pdEsc(pdFmtTrendValue(point.value, key)) + '</b></div>'
      + statLine;
  }

  function pdSvgLine(points) {
    if (!points || points.length < 2) return '<div class="muted">Not enough data for this trend yet.</div>';
    var w = 720, h = 240, padL = 48, padR = 22, padT = 18, padB = 38;
    var vals = points.map(function (p) { return p.value; });
    var avg = pdAvg(vals);
    var mn = Math.min.apply(null, vals.concat(Number.isFinite(avg) ? [avg] : []));
    var mx = Math.max.apply(null, vals.concat(Number.isFinite(avg) ? [avg] : []));
    if (mn === mx) { mn -= 1; mx += 1; }
    var range = mx - mn || 1;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;
    var selected = Number.isFinite(pdState.trendSelected) ? pdState.trendSelected : points.length - 1;
    var coords = points.map(function (p, i) {
      return {
        x: padL + (i / (points.length - 1)) * plotW,
        y: padT + (1 - (p.value - mn) / range) * plotH,
        value: p.value,
        label: p.axisLabel || p.label,
        point: p
      };
    });
    var line = coords.map(function (p) { return p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
    var svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="pdTrendSvg" role="img" aria-label="' + pdEsc(pdTrendName(pdState.trendKey)) + ' trend">';
    for (var i = 0; i <= 4; i++) {
      var y = padT + (i / 4) * plotH;
      var v = mx - (i / 4) * range;
      svg += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + y.toFixed(1) + '"></line>';
      svg += '<text x="' + (padL - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + pdEsc(pdFmtTrendValue(v, pdState.trendKey).replace('#', '')) + '</text>';
    }
    if (Number.isFinite(avg)) {
      var avgY = padT + (1 - (avg - mn) / range) * plotH;
      svg += '<line class="pdTrendAvgLine" x1="' + padL + '" y1="' + avgY.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + avgY.toFixed(1) + '"></line>';
      svg += '<text class="pdTrendAvgText" x="' + (w - padR) + '" y="' + (avgY - 5).toFixed(1) + '" text-anchor="end">avg ' + pdEsc(pdFmtTrendValue(avg, pdState.trendKey)) + '</text>';
    }
    svg += '<polyline class="pdTrendLine" points="' + line + '"></polyline>';
    coords.forEach(function (p, i) {
      var isSelected = i === selected;
      var cls = p.value >= avg ? 'isHigh' : 'isLow';
      if (isSelected) cls += ' isSelected';
      svg += '<g class="pdTrendPoint ' + cls + '" data-pd-trend-index="' + i + '" tabindex="0" role="button">'
        + '<title>' + pdEsc((p.point.label || 'Point') + ': ' + pdFmtTrendValue(p.value, pdState.trendKey)) + '</title>'
        + '<circle class="pdTrendHit" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="11"></circle>'
        + '<circle class="pdTrendDot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (isSelected ? '5' : '3.5') + '"></circle>'
        + '</g>';
    });
    var step = Math.max(1, Math.floor(points.length / 6));
    for (var xi = 0; xi < points.length; xi += step) {
      var c = coords[xi];
      svg += '<text x="' + c.x.toFixed(1) + '" y="' + (h - 10) + '" text-anchor="middle">' + pdEsc(String(c.label).slice(0, 10)) + '</text>';
    }
    svg += '</svg>';
    return svg;
  }

  function pdTrendDetailHtml(point) {
    if (!point) return '';
    var key = pdState.trendKey;
    return '<div class="pdTrendInspect">'
      + '<div><span>Selected</span><b>' + pdEsc(point.label || 'Point') + '</b><em>' + pdEsc(point.meta || '') + '</em></div>'
      + '<strong>' + pdEsc(pdFmtTrendValue(point.value, key)) + '</strong>'
      + '</div>';
  }

  function pdRenderTrend() {
    var mount = document.getElementById('pdTrendMount');
    if (!mount) return;
    var points = pdTrendPoints();
    pdState.trendPoints = points;
    if (points.length && (!Number.isFinite(pdState.trendSelected) || pdState.trendSelected >= points.length)) {
      pdState.trendSelected = points.length - 1;
    }
    var vals = points.map(function (p) { return p.value; });
    var latest = points.length ? points[points.length - 1].value : null;
    var first = points.length ? points[0].value : null;
    var avg = pdAvg(vals);
    var lastFive = pdAvg(vals.slice(Math.max(0, vals.length - 5)));
    var delta = Number.isFinite(latest) && Number.isFinite(first) ? latest - first : null;
    var selected = points[Number.isFinite(pdState.trendSelected) ? pdState.trendSelected : points.length - 1];
    var kpis = [
      ['Points', String(points.length)],
      ['Season Avg', Number.isFinite(avg) ? pdFmtTrendValue(avg, pdState.trendKey) : '--'],
      ['Latest', Number.isFinite(latest) ? pdFmtTrendValue(latest, pdState.trendKey) : '--'],
      ['Last 5', Number.isFinite(lastFive) ? pdFmtTrendValue(lastFive, pdState.trendKey) : '--']
    ];
    if (Number.isFinite(delta)) kpis.push(['Change', (delta >= 0 ? '+' : '') + delta.toFixed(1)]);
    mount.innerHTML = '<div class="pdTrendKpis">' + kpis.map(function (kpi) {
      return '<div><span>' + pdEsc(kpi[0]) + '</span><b>' + pdEsc(kpi[1]) + '</b></div>';
    }).join('') + '</div><div class="pdTrendFrame">'
      + pdSvgLine(points)
      + '<div id="pdTrendTooltip" class="pdTrendTooltip"></div>'
      + '</div>' + pdTrendDetailHtml(selected);
  }

  function pdSetLogControls() {
    var filter = document.getElementById('pdLogFilter');
    var limit = document.getElementById('pdLogLimit');
    var sort = document.getElementById('pdLogSort');
    if (filter) filter.value = pdState.logFilter;
    if (limit) limit.value = pdState.logLimit;
    if (sort) sort.value = pdState.logSortKey + ':' + pdState.logSortDir;
  }

  function pdSortLogValue(game, key) {
    if (key === 'date') {
      var date = Date.parse(pdGameDate(game));
      return Number.isFinite(date) ? date : 0;
    }
    if (key === 'rank') {
      var rank = pdGameRank(game);
      return Number.isFinite(rank) ? -rank : -9999;
    }
    return pdLogValue(game, key);
  }

  function pdRenderRecentGames() {
    var el = document.getElementById('pdRecentGames');
    if (!el) return;
    pdSetLogControls();
    var allLogs = (pdState.logs || []).slice();
    if (!allLogs.length) {
      el.innerHTML = '<div class="muted">No game log available.</div>';
      return;
    }
    var topN = pdState.logFilter === 'all' ? 0 : parseInt(pdState.logFilter, 10);
    var filtered = allLogs.filter(function (g) {
      if (!topN) return true;
      var rank = pdGameRank(g);
      return Number.isFinite(rank) && rank <= topN;
    });
    if (!filtered.length) {
      el.innerHTML = '<div class="muted">No games match this filter.</div>';
      return;
    }
    filtered.sort(function (a, b) {
      var av = pdSortLogValue(a, pdState.logSortKey);
      var bv = pdSortLogValue(b, pdState.logSortKey);
      if (!Number.isFinite(av)) return 1;
      if (!Number.isFinite(bv)) return -1;
      return pdState.logSortDir === 'asc' ? av - bv : bv - av;
    });
    var display = pdState.logLimit === 'all' ? filtered : filtered.slice(0, parseInt(pdState.logLimit, 10) || 8);
    function fmtGame(g, key) {
      var v = pdLogValue(g, key);
      if (!Number.isFinite(v)) return '--';
      if (key === 'fgPct') return v.toFixed(0) + '%';
      return key === 'minutes' ? v.toFixed(1) : String(Math.round(v * 10) / 10);
    }
    function avgGame(key) {
      return pdAvg(display.map(function (g) { return pdLogValue(g, key); }));
    }
    var avgRow = '<div class="pdGameRow pdGameAvg">'
      + '<span>Avg</span><span>' + display.length + ' games</span><span></span>'
      + '<span>' + pdEsc(pdFmtStatValue(avgGame('points'))) + '</span>'
      + '<span>' + pdEsc(pdFmtStatValue(avgGame('rebounds'))) + '</span>'
      + '<span>' + pdEsc(pdFmtStatValue(avgGame('assists'))) + '</span>'
      + '<span>' + pdEsc(pdFmtStatValue(avgGame('minutes'))) + '</span>'
      + '<span>' + pdEsc(pdFmtTrendValue(avgGame('fgPct'), 'fgPct')) + '</span>'
      + '</div>';
    el.innerHTML = '<div class="pdGameMeta">' + display.length + ' shown of ' + filtered.length + ' matching games</div>'
      + '<div class="pdGameTable">'
      + '<div class="pdGameHead"><span>Date</span><span>Opp</span><span>RK</span><span>PTS</span><span>REB</span><span>AST</span><span>MIN</span><span>FG</span></div>'
      + display.map(function (g) {
        var rank = pdGameRank(g);
        var opp = [pdGameLoc(g), pdGameOpp(g)].filter(Boolean).join(' ');
        return '<div class="pdGameRow">'
          + '<span>' + pdEsc(pdGameDate(g).slice(5, 10) || '--') + '</span>'
          + '<span>' + pdEsc(opp || '--') + '</span>'
          + '<span>' + (Number.isFinite(rank) ? '#' + pdEsc(rank) : '--') + '</span>'
          + '<span>' + pdEsc(fmtGame(g, 'points')) + '</span>'
          + '<span>' + pdEsc(fmtGame(g, 'rebounds')) + '</span>'
          + '<span>' + pdEsc(fmtGame(g, 'assists')) + '</span>'
          + '<span>' + pdEsc(fmtGame(g, 'minutes')) + '</span>'
          + '<span>' + pdEsc(fmtGame(g, 'fgPct')) + '</span>'
          + '</div>';
      }).join('')
      + avgRow
      + '</div>';
  }

  function pdBuildCompareHtml() {
    return '<div class="pdCompareEmpty">Add up to three players to compare against this dossier.</div>';
  }

  function pdComparePlayers() {
    return [pdState.player].concat(pdState.compares);
  }

  function pdRadar(players) {
    var axes = ['PPG', 'eFG%', '3P%', 'APG', 'RPG', 'SPG', 'BPG', 'BPM'].filter(function (s) {
      return players.some(function (p) { return p && p[s] !== undefined; });
    }).slice(0, 8);
    if (axes.length < 3) return '<div class="muted">Need at least three comparable stat axes for radar.</div>';
    var size = 240, cx = 120, cy = 120, radius = 86;
    var svg = '<svg class="pdRadar" viewBox="0 0 ' + size + ' ' + size + '">';
    for (var ring = 1; ring <= 4; ring++) {
      var r = radius * ring / 4;
      var pts = axes.map(function (_, i) {
        var a = -Math.PI / 2 + i * Math.PI * 2 / axes.length;
        return (cx + Math.cos(a) * r).toFixed(1) + ',' + (cy + Math.sin(a) * r).toFixed(1);
      }).join(' ');
      svg += '<polygon class="pdRadarRing" points="' + pts + '"></polygon>';
    }
    axes.forEach(function (axis, i) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / axes.length;
      var x = cx + Math.cos(a) * (radius + 20);
      var y = cy + Math.sin(a) * (radius + 20);
      svg += '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="middle">' + pdEsc(axis) + '</text>';
    });
    players.forEach(function (p, pi) {
      var pts = axes.map(function (axis, i) {
        var pct = pdPct(p, axis);
        var v = Number.isFinite(pct) ? pct : 0.5;
        var a = -Math.PI / 2 + i * Math.PI * 2 / axes.length;
        return (cx + Math.cos(a) * radius * v).toFixed(1) + ',' + (cy + Math.sin(a) * radius * v).toFixed(1);
      }).join(' ');
      svg += '<polygon class="pdRadarPoly" points="' + pts + '" style="--pd-color:' + pdColors[pi % pdColors.length] + '"></polygon>';
    });
    svg += '</svg>';
    return svg;
  }

  function pdRenderCompare() {
    var mount = document.getElementById('pdCompareMount');
    if (!mount || !pdState.player) return;
    var players = pdComparePlayers();
    var statRows = [
      { label: 'Production', key: 'Score' },
      { label: 'Fit', key: 'FitScore_calc' },
      { label: 'Value', key: 'ActualValuation_calc', money: true },
      { label: 'PPG', key: 'PPG' },
      { label: 'eFG%', key: 'eFG%' },
      { label: '3P%', key: '3P%' },
      { label: 'APG', key: 'APG' },
      { label: 'RPG', key: 'RPG' },
      { label: 'BPM', key: 'BPM' },
      { label: 'DRtg', key: 'DRtg', invert: true }
    ];
    var head = '<div class="pdCompareChips">' + players.map(function (p, i) {
      return '<span class="pdCompareChip" style="--pd-color:' + pdColors[i % pdColors.length] + '">'
        + pdEsc(p.Player || 'Player')
        + (i > 0 ? '<button type="button" data-pd-remove="' + (i - 1) + '">x</button>' : '')
        + '</span>';
    }).join('') + '</div>';
    if (players.length < 2) {
      mount.innerHTML = head + pdBuildCompareHtml();
      return;
    }
    var gridStyle = ' style="grid-template-columns:minmax(105px,1.2fr) repeat(' + players.length + ',minmax(70px,1fr))"';
    var table = '<div class="pdCompareTable"><div class="pdCompareTableHead"' + gridStyle + '><span>Metric</span>'
      + players.map(function (p) { return '<span>' + pdEsc((p.Player || '').split(' ').slice(-1)[0] || 'Player') + '</span>'; }).join('')
      + '</div>';
    statRows.forEach(function (row) {
      var vals = players.map(function (p) { return pdNum(p[row.key]); });
      var best = -1;
      vals.forEach(function (v, i) {
        if (!Number.isFinite(v)) return;
        if (best < 0) best = i;
        else {
          var bv = vals[best];
          if (row.invert ? v < bv : v > bv) best = i;
        }
      });
      table += '<div class="pdCompareTableRow"' + gridStyle + '><span>' + pdEsc(row.label) + '</span>'
        + players.map(function (p, i) {
          var value = row.money ? pdMoney(p[row.key]) : pdFmtStatValue(p[row.key]);
          return '<span class="' + (i === best && players.length > 1 ? 'isBest' : '') + '">' + pdEsc(value) + '</span>';
        }).join('')
        + '</div>';
    });
    table += '</div>';
    mount.innerHTML = head + '<div class="pdCompareGrid"><div>' + pdRadar(players) + '</div><div>' + table + '</div></div>';
  }

  function pdShowSuggestions(q) {
    var box = document.getElementById('pdCompareSuggestions');
    if (!box) return;
    q = String(q || '').trim().toLowerCase();
    if (q.length < 2) {
      box.innerHTML = '';
      box.style.display = 'none';
      return;
    }
    var used = new Set(pdComparePlayers().map(pdKey));
    pdState.suggestions = pdAllPlayers().filter(function (p) {
      if (!p || used.has(pdKey(p))) return false;
      return String(p.Player || '').toLowerCase().indexOf(q) >= 0
        || String(p.Team || '').toLowerCase().indexOf(q) >= 0;
    }).slice(0, 8);
    box.innerHTML = pdState.suggestions.map(function (p, i) {
      return '<button type="button" data-pd-suggest="' + i + '"><b>' + pdEsc(p.Player || '') + '</b><span>' + pdEsc(p.Team || '') + '</span></button>';
    }).join('');
    box.style.display = pdState.suggestions.length ? 'block' : 'none';
  }

  function pdExportCard() {
    var row = pdState.player;
    if (!row) return;
    var canvas = document.createElement('canvas');
    var scale = 2;
    var W = 1080, H = 1080;
    canvas.width = W * scale;
    canvas.height = H * scale;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#061323';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0d213a';
    ctx.fillRect(54, 54, W - 108, H - 108);
    ctx.strokeStyle = 'rgba(99,179,237,0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(54, 54, W - 108, H - 108);

    function fitText(text, x, y, maxW, size, weight, color) {
      ctx.font = (weight || 800) + ' ' + size + 'px Plus Jakarta Sans, Arial, sans-serif';
      while (ctx.measureText(text).width > maxW && size > 28) {
        size -= 2;
        ctx.font = (weight || 800) + ' ' + size + 'px Plus Jakarta Sans, Arial, sans-serif';
      }
      ctx.fillStyle = color || '#f8fbff';
      ctx.fillText(text, x, y);
    }

    ctx.fillStyle = '#63b3ed';
    ctx.font = '700 24px Plus Jakarta Sans, Arial, sans-serif';
    ctx.fillText('TOLEDO PLAYER DOSSIER', 90, 118);
    fitText(String(row.Player || 'Player'), 90, 205, 780, 70, 800, '#f8fbff');
    ctx.font = '500 28px Plus Jakarta Sans, Arial, sans-serif';
    ctx.fillStyle = 'rgba(219,234,254,0.82)';
    ctx.fillText(pdPlayerLabel(row), 92, 252);

    var metrics = [
      ['Production', Number.isFinite(row.Score) ? row.Score.toFixed(2) : '--'],
      ['Fit', Number.isFinite(row.FitScore_calc) ? row.FitScore_calc.toFixed(0) : '--'],
      ['Toledo Max', pdMoney(row.ActualValuation_calc)],
      ['Projection', Number.isFinite(pdNum(row.ProjectionPerf_calc)) ? pdNum(row.ProjectionPerf_calc).toFixed(2) : '--']
    ];
    metrics.forEach(function (m, i) {
      var x = 90 + (i % 2) * 455;
      var y = 320 + Math.floor(i / 2) * 150;
      ctx.fillStyle = 'rgba(255,255,255,0.055)';
      ctx.fillRect(x, y, 400, 110);
      ctx.fillStyle = 'rgba(219,234,254,0.66)';
      ctx.font = '700 20px Plus Jakarta Sans, Arial, sans-serif';
      ctx.fillText(m[0], x + 24, y + 35);
      fitText(String(m[1]), x + 24, y + 82, 340, 42, 800, '#ffffff');
    });

    var read = pdBuildScoutRead(row);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 28px Plus Jakarta Sans, Arial, sans-serif';
    ctx.fillText('Top Read', 90, 650);
    ctx.font = '500 23px Plus Jakarta Sans, Arial, sans-serif';
    ctx.fillStyle = 'rgba(240,247,255,0.86)';
    read.strengths.slice(0, 3).forEach(function (line, i) {
      ctx.fillText('- ' + line.slice(0, 78), 100, 700 + i * 42);
    });

    var stats = pdPrimaryStats(row, 5);
    var y0 = 855;
    stats.forEach(function (stat, i) {
      var pct = pdPct(row, stat);
      var y = y0 + i * 34;
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(245, y - 15, 560, 14);
      ctx.fillStyle = Number.isFinite(pct) && pct >= 0.75 ? '#34d399' : Number.isFinite(pct) && pct >= 0.5 ? '#63b3ed' : '#fbbf24';
      ctx.fillRect(245, y - 15, Math.max(4, 560 * (Number.isFinite(pct) ? pct : 0)), 14);
      ctx.fillStyle = 'rgba(219,234,254,0.86)';
      ctx.font = '700 20px Plus Jakarta Sans, Arial, sans-serif';
      ctx.fillText(stat, 90, y);
      ctx.fillText(Number.isFinite(pct) ? Math.round(pct * 100) + 'th' : '--', 830, y);
    });

    ctx.fillStyle = 'rgba(219,234,254,0.45)';
    ctx.font = '600 18px Plus Jakarta Sans, Arial, sans-serif';
    ctx.fillText('Generated from the basketball operations dashboard', 90, 1010);

    canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var base = String(row.Player || 'player').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'player';
      a.href = url;
      a.download = base + '-dossier-card.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      var status = document.getElementById('pdCardStatus');
      if (status) status.textContent = 'Player card created.';
    }, 'image/png');
  }

  function pdPositionTrendTooltip(event) {
    var tip = document.getElementById('pdTrendTooltip');
    if (!tip || tip.style.display !== 'block') return;
    var x = event.clientX + 14;
    var y = event.clientY + 14;
    var maxX = window.innerWidth - tip.offsetWidth - 12;
    var maxY = window.innerHeight - tip.offsetHeight - 12;
    tip.style.left = Math.max(8, Math.min(x, maxX)).toFixed(0) + 'px';
    tip.style.top = Math.max(8, Math.min(y, maxY)).toFixed(0) + 'px';
  }

  function pdShowTrendTooltip(index, event) {
    var tip = document.getElementById('pdTrendTooltip');
    var point = pdState.trendPoints[index];
    if (!tip || !point) return;
    tip.innerHTML = pdTrendTooltipHtml(point);
    tip.style.display = 'block';
    if (event && Number.isFinite(event.clientX)) pdPositionTrendTooltip(event);
  }

  function pdHideTrendTooltip() {
    var tip = document.getElementById('pdTrendTooltip');
    if (tip) tip.style.display = 'none';
  }

  function pdWireShell() {
    if (pdState.wired || !pdState.shell) return;
    pdState.wired = true;
    pdState.shell.addEventListener('click', function (event) {
      if (event.target === pdState.shell) {
        pdClose();
        return;
      }
      var actionBtn = event.target.closest('[data-pd-action]');
      if (actionBtn) {
        var action = actionBtn.getAttribute('data-pd-action');
        if (action === 'close') pdClose();
        if (action === 'open-modal' && pdState.player && typeof openProfile === 'function') {
          var row = pdState.player;
          pdClose();
          openProfile(row);
        }
        if (action === 'copy-link') {
          var url = pdBuildUrl(pdState.player, 'report');
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).catch(function () {});
          } else {
            window.prompt('Player report link', url);
          }
          var status = document.getElementById('pdCardStatus');
          if (status) status.textContent = 'Report link copied.';
        }
        if (action === 'card') pdExportCard();
        return;
      }
      var trendPoint = event.target.closest('[data-pd-trend-index]');
      if (trendPoint) {
        var ti = parseInt(trendPoint.getAttribute('data-pd-trend-index'), 10);
        if (Number.isFinite(ti)) {
          pdState.trendSelected = ti;
          pdRenderTrend();
        }
        return;
      }
      var removeBtn = event.target.closest('[data-pd-remove]');
      if (removeBtn) {
        var idx = parseInt(removeBtn.getAttribute('data-pd-remove'), 10);
        if (Number.isFinite(idx)) pdState.compares.splice(idx, 1);
        pdRenderCompare();
        return;
      }
      var suggestBtn = event.target.closest('[data-pd-suggest]');
      if (suggestBtn) {
        var si = parseInt(suggestBtn.getAttribute('data-pd-suggest'), 10);
        var player = pdState.suggestions[si];
        if (player && pdState.compares.length < 3) pdState.compares.push(player);
        var input = document.getElementById('pdCompareSearch');
        var box = document.getElementById('pdCompareSuggestions');
        if (input) input.value = '';
        if (box) { box.innerHTML = ''; box.style.display = 'none'; }
        pdRenderCompare();
        return;
      }
      var openBtn = event.target.closest('[data-pd-open]');
      if (openBtn) {
        var key = openBtn.getAttribute('data-pd-open');
        var found = pdAllPlayers().find(function (p) { return pdKey(p) === key; });
        if (found) pdOpen(found);
      }
    });
    pdState.shell.addEventListener('input', function (event) {
      if (event.target && event.target.id === 'pdCompareSearch') pdShowSuggestions(event.target.value);
    });
    pdState.shell.addEventListener('change', function (event) {
      if (event.target && event.target.id === 'pdTrendSelect') {
        pdState.trendKey = event.target.value;
        pdState.trendSelected = null;
        pdRenderTrend();
      }
      if (event.target && event.target.id === 'pdLogFilter') {
        pdState.logFilter = event.target.value || 'all';
        pdRenderRecentGames();
      }
      if (event.target && event.target.id === 'pdLogLimit') {
        pdState.logLimit = event.target.value || '8';
        pdRenderRecentGames();
      }
      if (event.target && event.target.id === 'pdLogSort') {
        var parts = String(event.target.value || 'date:desc').split(':');
        pdState.logSortKey = parts[0] || 'date';
        pdState.logSortDir = parts[1] || 'desc';
        pdRenderRecentGames();
      }
    });
    pdState.shell.addEventListener('pointerover', function (event) {
      var trendPoint = event.target.closest('[data-pd-trend-index]');
      if (!trendPoint) return;
      var idx = parseInt(trendPoint.getAttribute('data-pd-trend-index'), 10);
      if (Number.isFinite(idx)) pdShowTrendTooltip(idx, event);
    });
    pdState.shell.addEventListener('pointermove', function (event) {
      if (event.target.closest('[data-pd-trend-index]')) pdPositionTrendTooltip(event);
    });
    pdState.shell.addEventListener('pointerout', function (event) {
      if (event.target.closest('[data-pd-trend-index]')) pdHideTrendTooltip();
    });
    pdState.shell.addEventListener('focusin', function (event) {
      var trendPoint = event.target.closest('[data-pd-trend-index]');
      if (!trendPoint) return;
      var idx = parseInt(trendPoint.getAttribute('data-pd-trend-index'), 10);
      if (Number.isFinite(idx)) pdShowTrendTooltip(idx, { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
    });
    pdState.shell.addEventListener('focusout', function (event) {
      if (event.target.closest('[data-pd-trend-index]')) pdHideTrendTooltip();
    });
    pdState.shell.addEventListener('keydown', function (event) {
      var trendPoint = event.target.closest('[data-pd-trend-index]');
      if (trendPoint && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        var idx = parseInt(trendPoint.getAttribute('data-pd-trend-index'), 10);
        if (Number.isFinite(idx)) {
          pdState.trendSelected = idx;
          pdRenderTrend();
        }
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && pdState.shell && pdState.shell.style.display === 'flex') pdClose();
    });
  }

  function pdWireReportButton() {
    var btn = document.getElementById('mReportBtn');
    if (!btn || btn._pdWired) return;
    btn._pdWired = true;
    btn.addEventListener('click', function () {
      var row = pdState.player;
      if (window.ProfileManager && window.ProfileManager.currentProfilePlayer) row = window.ProfileManager.currentProfilePlayer;
      if (typeof _currentProfilePlayer !== 'undefined' && _currentProfilePlayer) row = _currentProfilePlayer;
      if (row) pdOpen(row);
    });
  }

  window.addEventListener('DOMContentLoaded', function () {
    pdEnsureShell();
    pdWireReportButton();
  });

  window.ProfileDossier = {
    open: pdOpen,
    close: pdClose,
    findPlayer: pdFindPlayer,
    buildUrl: pdBuildUrl,
    buildHash: pdBuildHash
  };
})();
