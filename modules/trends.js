// ============ TRENDS MODULE ============
// Fetches historical snapshot data and renders sparklines/charts.
// Dependencies: config.js (URLS), data.js (league), auth.js (authGetToken)

(function () {
  'use strict';

  var trendCache = {};
  var CACHE_TTL_MS = 300000; // 5 min

  function cacheKey(name, type, lg) {
    return lg + ':' + type + ':' + (name || '').toLowerCase();
  }

  function getTrendData(name, type, lg) {
    type = type || 'player';
    lg = lg || (typeof league !== 'undefined' ? league : 'MBB');
    var key = cacheKey(name, type, lg);
    var cached = trendCache[key];
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return Promise.resolve(cached.data);
    }

    var url = URLS.WORKER + '/api/snapshots?league=' + encodeURIComponent(lg)
      + '&entity=' + encodeURIComponent(type)
      + '&name=' + encodeURIComponent(name);

    return fetch(url, { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var snapshots = Array.isArray(d.snapshots) ? d.snapshots : [];
        trendCache[key] = { data: snapshots, ts: Date.now() };
        return snapshots;
      })
      .catch(function () { return []; });
  }

  // --- SVG Sparkline renderer ---

  function buildSparkline(points, opts) {
    opts = opts || {};
    var w = opts.width || 60;
    var h = opts.height || 20;
    var field = opts.field || 'perf';
    var upColor = opts.upColor || '#34d399';
    var downColor = opts.downColor || '#f87171';
    var neutralColor = opts.neutralColor || 'var(--muted)';

    var vals = points.map(function (p) { return Number(p[field]); }).filter(Number.isFinite);
    if (vals.length < 2) return '';

    var mn = Math.min.apply(null, vals);
    var mx = Math.max.apply(null, vals);
    var range = mx - mn || 1;

    var pts = vals.map(function (v, i) {
      var x = (i / (vals.length - 1)) * w;
      var y = h - ((v - mn) / range) * (h - 2) - 1;
      return x.toFixed(1) + ',' + y.toFixed(1);
    });

    var trending = vals[vals.length - 1] > vals[0] ? 'up' : vals[vals.length - 1] < vals[0] ? 'down' : 'flat';
    var color = trending === 'up' ? upColor : trending === 'down' ? downColor : neutralColor;

    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="vertical-align:middle">'
      + '<polyline fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" '
      + 'points="' + pts.join(' ') + '"/>'
      + '</svg>';
  }

  // --- Larger trend chart for profile/team hub ---

  function buildTrendChart(points, opts) {
    opts = opts || {};
    var w = opts.width || 320;
    var h = opts.height || 140;
    var fields = opts.fields || [{ key: 'perf', label: 'Score', color: 'var(--accent)' }];
    var showLabels = opts.showLabels !== false;

    if (!points || points.length < 2) {
      return '<div class="muted" style="font-size:12px">Not enough historical data for trend chart.</div>';
    }

    var allVals = [];
    fields.forEach(function (f) {
      points.forEach(function (p) {
        var v = Number(p[f.key]);
        if (Number.isFinite(v)) allVals.push(v);
      });
    });
    if (!allVals.length) return '';

    var mn = Math.min.apply(null, allVals);
    var mx = Math.max.apply(null, allVals);
    var range = mx - mn || 1;
    var padL = 32, padR = 8, padT = 8, padB = showLabels ? 22 : 8;
    var plotW = w - padL - padR;
    var plotH = h - padT - padB;

    var svg = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" '
      + 'style="width:100%;max-width:' + w + 'px;display:block;font-family:\'Plus Jakarta Sans\',system-ui,sans-serif">';

    // Y-axis guides
    var gridN = 4;
    for (var gi = 0; gi <= gridN; gi++) {
      var gy = padT + (gi / gridN) * plotH;
      var gv = mx - (gi / gridN) * range;
      svg += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + gy.toFixed(1) + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
      svg += '<text x="' + (padL - 4) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end" fill="rgba(160,180,210,0.5)" font-size="9">' + gv.toFixed(1) + '</text>';
    }

    // Lines per field
    fields.forEach(function (f) {
      var pts = [];
      points.forEach(function (p, i) {
        var v = Number(p[f.key]);
        if (!Number.isFinite(v)) return;
        var x = padL + (i / (points.length - 1)) * plotW;
        var y = padT + (1 - (v - mn) / range) * plotH;
        pts.push(x.toFixed(1) + ',' + y.toFixed(1));
      });
      if (pts.length >= 2) {
        svg += '<polyline fill="none" stroke="' + f.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
          + 'points="' + pts.join(' ') + '"/>';
      }
    });

    // X-axis week labels
    if (showLabels && points.length <= 16) {
      var step = Math.max(1, Math.floor(points.length / 6));
      for (var xi = 0; xi < points.length; xi += step) {
        var lx = padL + (xi / (points.length - 1)) * plotW;
        var label = (points[xi].week || '').replace(/^20\d\d-W/, 'W');
        svg += '<text x="' + lx.toFixed(1) + '" y="' + (h - 4) + '" text-anchor="middle" fill="rgba(160,180,210,0.4)" font-size="8">' + label + '</text>';
      }
    }

    svg += '</svg>';

    // Legend
    if (fields.length > 1) {
      svg += '<div style="display:flex;gap:12px;justify-content:center;margin-top:4px">';
      fields.forEach(function (f) {
        svg += '<span style="font-size:10px;color:' + f.color + '">● ' + f.label + '</span>';
      });
      svg += '</div>';
    }

    return svg;
  }

  // --- Inject sparkline into the player table (called from players.js or app.js) ---

  function injectSparklineColumn(tableHeadRow, rows) {
    if (!tableHeadRow || !rows || !rows.length) return;
    var existingTH = tableHeadRow.querySelector('[data-col="trend"]');
    if (existingTH) return;

    var th = document.createElement('th');
    th.dataset.col = 'trend';
    th.textContent = 'Trend';
    th.style.width = '70px';
    tableHeadRow.appendChild(th);

    rows.forEach(function (row) {
      var playerName = row.dataset.player || '';
      var td = document.createElement('td');
      td.className = 'trend-cell';
      td.innerHTML = '<span class="muted" style="font-size:10px">—</span>';
      row.appendChild(td);

      if (playerName) {
        getTrendData(playerName, 'player').then(function (snaps) {
          if (snaps && snaps.length >= 2) {
            td.innerHTML = buildSparkline(snaps.slice(-8), { field: 'perf' });
          }
        });
      }
    });
  }

  // --- Expose globally ---

  window.TrendModule = {
    getTrendData: getTrendData,
    buildSparkline: buildSparkline,
    buildTrendChart: buildTrendChart,
    injectSparklineColumn: injectSparklineColumn
  };
})();
