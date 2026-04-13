// ── modules/shot-analytics.js — Hexbin shot chart visualization ───────────────
// Renders hexagonal-binned shot charts with relative efficiency coloring.
// Hex SIZE = shot volume, hex COLOR = FG% vs NCAA distance-based average.
// Depends on: teams.js (_thShotToSVG, _thNormalizeShotForCourt) at runtime.

// ── NCAA D1 baseline FG% by SVG distance from basket (200,415) ───────────────
// [maxDist, expectedFG%] — calibrated to NCAA 2024-25 averages
var SA_BASELINE = {
  MBB: [[35,0.63],[75,0.42],[115,0.38],[175,0.36],[250,0.345],[999,0.30]],
  WBB: [[35,0.58],[75,0.38],[115,0.34],[175,0.32],[250,0.31],[999,0.27]]
};

function _saDist(sx, sy) {
  var dx = sx - 200, dy = sy - 415;
  return Math.sqrt(dx * dx + dy * dy);
}

function _saExpected(dist, lg) {
  var t = SA_BASELINE[lg] || SA_BASELINE.MBB;
  for (var i = 0; i < t.length; i++) { if (dist <= t[i][0]) return t[i][1]; }
  return t[t.length - 1][1];
}

// ── Hex grid math (pointy-top) ───────────────────────────────────────────────
function _saP2H(px, py, sz) {
  var q = (Math.sqrt(3) / 3 * px - py / 3) / sz;
  var r = 2 / 3 * py / sz;
  var s = -q - r, rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  var dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

function _saH2P(q, r, sz) {
  return { x: sz * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r), y: sz * 1.5 * r };
}

function _saHexD(cx, cy, rad) {
  var p = [];
  for (var i = 0; i < 6; i++) {
    var a = Math.PI / 180 * (60 * i - 30);
    p.push((cx + rad * Math.cos(a)).toFixed(1) + ',' + (cy + rad * Math.sin(a)).toFixed(1));
  }
  return 'M' + p.join('L') + 'Z';
}

// ── Color scale: red (below avg) → gray (avg) → blue (above avg) ────────────
function _saColor(diff, op) {
  var c = Math.max(-0.18, Math.min(0.18, diff));
  var t = (c + 0.18) / 0.36; // 0..1, 0.5=avg
  var r, g, b;
  if (t < 0.5) {
    var s = t / 0.5;
    r = Math.round(210 - 100 * s);
    g = Math.round(50 + 70 * s);
    b = Math.round(45 + 75 * s);
  } else {
    var s = (t - 0.5) / 0.5;
    r = Math.round(110 - 75 * s);
    g = Math.round(120 + 40 * s);
    b = Math.round(120 + 120 * s);
  }
  return 'rgba(' + r + ',' + g + ',' + b + ',' + (op || 0.88) + ')';
}

// ── Bin shots into hex cells ─────────────────────────────────────────────────
var SA_HEX_SZ = 24;
var SA_MIN_R = 5;
var SA_MAX_R = 22;

function _saBin(svgPts, sz) {
  var bins = {};
  svgPts.forEach(function(s) {
    var h = _saP2H(s.sx - 200, s.sy - 230, sz);
    var k = h.q + ',' + h.r;
    if (!bins[k]) {
      var px = _saH2P(h.q, h.r, sz);
      bins[k] = { cx: px.x + 200, cy: px.y + 230, made: 0, att: 0, dSum: 0 };
    }
    bins[k].att++;
    if (s.made) bins[k].made++;
    bins[k].dSum += _saDist(s.sx, s.sy);
  });
  return bins;
}

// ── Normalize shots to SVG coordinates (reuses teams.js coord functions) ─────
function _saNormalize(shots) {
  var maxAX = shots.reduce(function(m, s) { return Math.max(m, Math.abs(Number(s && s.x) || 0)); }, 0);
  var maxAY = shots.reduce(function(m, s) { return Math.max(m, Math.abs(Number(s && s.y) || 0)); }, 0);
  var compact = (maxAX <= 60 && maxAY <= 120) ? 'espn-compact' : null;

  var norm = shots.map(function(s) {
    var c = _thNormalizeShotForCourt(s, compact);
    return Object.assign({}, s, { x: c.x, y: c.y });
  });

  var rim = norm.filter(function(s) { return s.range === 'rim'; });
  var avgX = rim.length ? rim.reduce(function(a, p) { return a + p.x; }, 0) / rim.length : 470;
  var left = avgX < 470;
  var aRim = rim.filter(function(s) { return left ? s.x < 470 : s.x >= 470; });
  var bktX = aRim.length
    ? Math.round(aRim.reduce(function(a, p) { return a + p.x; }, 0) / aRim.length)
    : (left ? 75 : 865);

  var pts = [];
  norm.forEach(function(s) {
    if (s.range === 'free_throw') return;
    var p = _thShotToSVG(s, left, bktX);
    if (p.x < 5 || p.x > 395 || p.y < 5 || p.y > 445) return;
    pts.push({ sx: p.x, sy: p.y, made: s.made, range: s.range });
  });
  return pts;
}

// ── Court outline SVG (shared half-court drawing) ────────────────────────────
function _saCourtSVG(tW) {
  var bX = 200, bY = 415, pL = 148, pR = 252, pT = 265, ftY = 265, ftR = 52;
  var a3L = bX - 167, a3R = bX + 167, a3T = bY - 213;
  return '<rect x="10" y="10" width="380" height="430" rx="3" fill="none" stroke="' + tW + '" stroke-width="1"/>'
    + '<rect x="' + pL + '" y="' + pT + '" width="' + (pR - pL) + '" height="' + (440 - pT) + '" fill="none" stroke="' + tW + '" stroke-width="1"/>'
    + '<path d="M ' + pL + ' ' + ftY + ' A ' + ftR + ' ' + ftR + ' 0 0 0 ' + pR + ' ' + ftY + '" fill="none" stroke="' + tW + '" stroke-width="1" stroke-dasharray="4 4"/>'
    + '<path d="M ' + pL + ' ' + ftY + ' A ' + ftR + ' ' + ftR + ' 0 0 1 ' + pR + ' ' + ftY + '" fill="none" stroke="' + tW + '" stroke-width="1"/>'
    + '<circle cx="' + bX + '" cy="' + bY + '" r="28" fill="none" stroke="' + tW + '" stroke-width="1"/>'
    + '<line x1="' + a3L + '" y1="440" x2="' + a3L + '" y2="' + bY + '" stroke="' + tW + '" stroke-width="1"/>'
    + '<line x1="' + a3R + '" y1="440" x2="' + a3R + '" y2="' + bY + '" stroke="' + tW + '" stroke-width="1"/>'
    + '<path d="M ' + a3L + ' ' + bY + ' A 167 213 0 0 1 ' + bX + ' ' + a3T + ' A 167 213 0 0 1 ' + a3R + ' ' + bY + '" fill="none" stroke="' + tW + '" stroke-width="1"/>'
    + '<line x1="' + (bX - 20) + '" y1="' + (bY - 28) + '" x2="' + (bX + 20) + '" y2="' + (bY - 28) + '" stroke="rgba(255,175,40,0.5)" stroke-width="2"/>'
    + '<circle cx="' + bX + '" cy="' + bY + '" r="12" fill="none" stroke="rgba(255,175,40,0.5)" stroke-width="2"/>';
}

// ── Build hexbin shot chart HTML ─────────────────────────────────────────────
function saBuildHexChart(shots, name, opts) {
  opts = opts || {};
  var color = opts.color || 'var(--accent)';
  var lg = opts.league || (typeof league !== 'undefined' ? league : 'MBB');
  var hexSz = opts.hexSize || SA_HEX_SZ;

  var pts = _saNormalize(shots);
  if (!pts.length) return '<div class="muted" style="font-size:12px">No location data for hex map.</div>';

  var bins = _saBin(pts, hexSz);
  var arr = Object.keys(bins).map(function(k) { return bins[k]; });
  var maxCt = arr.reduce(function(m, b) { return Math.max(m, b.att); }, 1);

  var W = 400, H = 455;
  var tW = 'rgba(255,255,255,0.22)';
  var totalFGA = pts.length;

  var hexEls = '';
  arr.forEach(function(bin) {
    if (!bin.att || bin.cx < 5 || bin.cx > 395 || bin.cy < 5 || bin.cy > 445) return;
    var fg = bin.made / bin.att;
    var dist = bin.dSum / bin.att;
    var exp = _saExpected(dist, lg);
    var diff = fg - exp;
    var t = Math.sqrt(bin.att / maxCt);
    var r = SA_MIN_R + (SA_MAX_R - SA_MIN_R) * t;
    var fill = _saColor(diff, 0.88);
    var strk = _saColor(diff, 0.35);
    var pct = Math.round(fg * 100);
    var expP = Math.round(exp * 100);
    var diffP = diff >= 0 ? '+' + Math.round(diff * 100) : '' + Math.round(diff * 100);
    var vol = Math.round(bin.att / totalFGA * 100);
    hexEls += '<path class="sa-hex" d="' + _saHexD(bin.cx, bin.cy, r) + '"'
      + ' fill="' + fill + '" stroke="' + strk + '" stroke-width="1"'
      + ' data-att="' + bin.att + '" data-made="' + bin.made + '" data-pct="' + pct + '"'
      + ' data-exp="' + expP + '" data-diff="' + diffP + '" data-vol="' + vol + '"/>';
  });

  // Zone stats for footer
  var zs = {};
  pts.forEach(function(s) {
    if (!zs[s.range]) zs[s.range] = { m: 0, a: 0 };
    zs[s.range].a++;
    if (s.made) zs[s.range].m++;
  });
  var ftS = shots.filter(function(s) { return s.range === 'free_throw'; });
  var ftM = ftS.filter(function(s) { return s.made; }).length;
  var ftA = ftS.length;
  var totM = pts.filter(function(s) { return s.made; }).length;
  var oPct = totalFGA ? Math.round(totM / totalFGA * 100) : 0;

  return '<div class="thShotWrap saHexWrap">'
    + '<div class="thShotTitle" style="color:' + color + '">' + (typeof _escAttr === 'function' ? _escAttr(name) : name) + '</div>'
    + '<div class="saHexHint">Size = volume · Color = FG% vs NCAA avg</div>'
    + '<svg class="sa-hex-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '"'
    + ' style="width:100%;max-width:370px;display:block;margin:0 auto;border-radius:10px">'
    + '<rect width="' + W + '" height="' + H + '" fill="#080f1e"/>'
    + '<rect x="10" y="10" width="380" height="430" rx="3" fill="#0d1b32"/>'
    + _saCourtSVG(tW)
    + hexEls
    + '</svg>'
    + '<div class="saLegend">'
    + '<span class="saLegLabel">Below avg</span>'
    + '<span class="saLegBar"></span>'
    + '<span class="saLegLabel">Above avg</span>'
    + '</div>'
    + '<div class="thShotStats">'
    + '<span class="thShotStat" style="color:rgba(34,197,94,.9)">Rim ' + (zs.rim ? Math.round(zs.rim.m / zs.rim.a * 100) + '%' : '—') + '</span>'
    + '<span class="thShotStat" style="color:rgba(99,179,237,.9)">Mid ' + (zs.jumper ? Math.round(zs.jumper.m / zs.jumper.a * 100) + '%' : '—') + '</span>'
    + '<span class="thShotStat" style="color:rgba(251,146,60,.9)">3PT ' + (zs.three_pointer ? Math.round(zs.three_pointer.m / zs.three_pointer.a * 100) + '%' : '—') + '</span>'
    + (ftA > 0 ? '<span class="thShotStat" style="color:rgba(200,180,255,.9)">FT ' + Math.round(ftM / ftA * 100) + '%</span>' : '')
    + '<span class="thShotStat" style="color:var(--text)">' + oPct + '% FG · ' + totalFGA + ' FGA</span>'
    + '</div>'
    + '</div>';
}

// ── Hex hover tooltips ───────────────────────────────────────────────────────
function saInitHexTooltips(containerId) {
  var ct = document.getElementById(containerId);
  var tip = document.getElementById('pShotTooltip');
  if (!ct || !tip) return;
  ct.addEventListener('mouseover', function(e) {
    var h = e.target.closest && e.target.closest('.sa-hex');
    if (!h) { tip.style.display = 'none'; return; }
    var att = h.getAttribute('data-att'), made = h.getAttribute('data-made');
    var pct = h.getAttribute('data-pct'), exp = h.getAttribute('data-exp');
    var diff = h.getAttribute('data-diff'), vol = h.getAttribute('data-vol');
    var dn = parseInt(diff);
    var dc = dn >= 0 ? 'rgba(34,197,94,.9)' : 'rgba(239,68,68,.85)';
    tip.innerHTML =
      '<div style="font-size:12px;font-weight:700;color:#e2e8f0">' + made + '/' + att + ' (' + pct + '%)</div>'
      + '<div style="font-size:11px;margin-top:3px;color:' + dc + '">' + (dn >= 0 ? '+' : '') + diff + 'pp vs avg (' + exp + '%)</div>'
      + '<div style="font-size:10px;color:rgba(150,170,200,.65);margin-top:2px">' + vol + '% of total FGA</div>';
    tip.style.display = 'block';
  });
  ct.addEventListener('mousemove', function(e) {
    var h = e.target.closest && e.target.closest('.sa-hex');
    if (!h) { tip.style.display = 'none'; return; }
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top = (e.clientY - 44) + 'px';
  });
  ct.addEventListener('mouseleave', function() { tip.style.display = 'none'; });
}

// ── Zone chart — 5-zone summary overlay ──────────────────────────────────────
// Zones: Restricted Area, Paint (non-RA), Mid-Range, Corner 3, Above-the-Break 3
// Each zone shows FG%, FGA count, and a background colored by efficiency vs NCAA avg.

var SA_ZONE_DEFS = {
  ra:      { label: 'Rim',     baselineDist: 17 },
  paint:   { label: 'Paint',   baselineDist: 75 },
  mid:     { label: 'Mid',     baselineDist: 145 },
  corner3: { label: 'Corner 3',baselineDist: 230 },
  atb3:    { label: 'Above 3', baselineDist: 230 }
};

function _saClassifyZone(sx, sy) {
  var bX = 200, bY = 415;
  var dist = _saDist(sx, sy);
  var pL = 148, pR = 252, pT = 265;
  var a3L = bX - 167, a3R = bX + 167;

  if (dist <= 35) return 'ra';

  // 3-point territory: outside 3pt arc or in corners
  var is3 = false;
  if (sx <= a3L || sx >= a3R) {
    is3 = true;
  } else {
    var dx = sx - bX, dy = sy - bY;
    var arcDist = Math.sqrt((dx / 167) * (dx / 167) + (dy / 213) * (dy / 213));
    if (arcDist >= 1) is3 = true;
  }

  if (is3) {
    if (sy >= 340 && (sx <= a3L + 10 || sx >= a3R - 10)) return 'corner3';
    return 'atb3';
  }

  if (sx >= pL && sx <= pR && sy >= pT) return 'paint';
  return 'mid';
}

function saBuildZoneChart(shots, name, opts) {
  opts = opts || {};
  var color = opts.color || 'var(--accent)';
  var lg = opts.league || (typeof league !== 'undefined' ? league : 'MBB');

  var pts = _saNormalize(shots);
  if (!pts.length) return '<div class="muted" style="font-size:12px">No location data for zone map.</div>';

  var zones = {};
  ['ra', 'paint', 'mid', 'corner3', 'atb3'].forEach(function(z) { zones[z] = { made: 0, att: 0 }; });

  pts.forEach(function(s) {
    var z = _saClassifyZone(s.sx, s.sy);
    zones[z].att++;
    if (s.made) zones[z].made++;
  });

  var W = 400, H = 455;
  var tW = 'rgba(255,255,255,0.22)';
  var bX = 200, bY = 415;
  var totalFGA = pts.length;

  function zoneOverlay(z, pathD, tx, ty) {
    var d = zones[z];
    if (!d || !d.att) {
      return '<path d="' + pathD + '" fill="rgba(30,40,60,0.5)" stroke="' + tW + '" stroke-width="1"/>';
    }
    var fg = d.made / d.att;
    var exp = _saExpected(SA_ZONE_DEFS[z].baselineDist, lg);
    var diff = fg - exp;
    var fill = _saColor(diff, 0.45);
    var pctStr = Math.round(fg * 100) + '%';
    var vol = d.att;
    return '<path d="' + pathD + '" fill="' + fill + '" stroke="' + tW + '" stroke-width="1"/>'
      + '<text x="' + tx + '" y="' + ty + '" text-anchor="middle" fill="#f0f4ff" font-size="18" font-weight="800" font-family="Plus Jakarta Sans,system-ui,sans-serif">' + pctStr + '</text>'
      + '<text x="' + tx + '" y="' + (ty + 16) + '" text-anchor="middle" fill="rgba(180,200,230,0.7)" font-size="10" font-family="Plus Jakarta Sans,system-ui,sans-serif">' + vol + ' FGA</text>';
  }

  // Zone SVG paths (approximate regions on 400x455 court)
  var raPath = 'M ' + bX + ' ' + (bY - 35) + ' A 35 35 0 1 1 ' + bX + ' ' + Math.min(bY + 35, 440) + ' A 35 35 0 1 1 ' + bX + ' ' + (bY - 35) + ' Z';

  var pL = 148, pR = 252, pT = 265;
  var paintPath = 'M ' + pL + ' ' + pT + ' L ' + pR + ' ' + pT + ' L ' + pR + ' 440 L ' + pL + ' 440 Z';

  var a3L = bX - 167, a3R = bX + 167, a3T = bY - 213;
  var midPath = 'M ' + a3L + ' 440 L ' + a3L + ' ' + bY
    + ' A 167 213 0 0 1 ' + bX + ' ' + a3T + ' A 167 213 0 0 1 ' + a3R + ' ' + bY
    + ' L ' + a3R + ' 440 Z';

  var cornerLPath = 'M 10 440 L 10 300 L ' + a3L + ' 300 L ' + a3L + ' 440 Z';
  var cornerRPath = 'M ' + a3R + ' 440 L ' + a3R + ' 300 L 390 300 L 390 440 Z';

  var atb3Path = 'M 10 300 L 10 10 L 390 10 L 390 300'
    + ' L ' + a3R + ' 300 L ' + a3R + ' ' + bY
    + ' A 167 213 0 0 0 ' + bX + ' ' + a3T + ' A 167 213 0 0 0 ' + a3L + ' ' + bY
    + ' L ' + a3L + ' 300 Z';

  var ftS = shots.filter(function(s) { return s.range === 'free_throw'; });
  var ftM = ftS.filter(function(s) { return s.made; }).length;
  var ftA = ftS.length;
  var totM = pts.filter(function(s) { return s.made; }).length;
  var oPct = totalFGA ? Math.round(totM / totalFGA * 100) : 0;

  return '<div class="thShotWrap saZoneWrap">'
    + '<div class="thShotTitle" style="color:' + color + '">' + (typeof _escAttr === 'function' ? _escAttr(name) : name) + '</div>'
    + '<div class="saHexHint">Zone efficiency vs NCAA avg &middot; FG% and FGA per zone</div>'
    + '<svg class="sa-zone-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '"'
    + ' style="width:100%;max-width:370px;display:block;margin:0 auto;border-radius:10px">'
    + '<rect width="' + W + '" height="' + H + '" fill="#080f1e"/>'
    + '<rect x="10" y="10" width="380" height="430" rx="3" fill="#0d1b32"/>'
    + zoneOverlay('atb3', atb3Path, 200, 160)
    + zoneOverlay('mid', midPath, 110, 340)
    + zoneOverlay('corner3', cornerLPath, (10 + a3L) / 2, 370)
    + zoneOverlay('corner3', cornerRPath, (a3R + 390) / 2, 370)
    + zoneOverlay('paint', paintPath, 200, 320)
    + zoneOverlay('ra', raPath, 200, 400)
    + _saCourtSVG(tW)
    + '</svg>'
    + '<div class="saLegend">'
    + '<span class="saLegLabel">Below avg</span>'
    + '<span class="saLegBar"></span>'
    + '<span class="saLegLabel">Above avg</span>'
    + '</div>'
    + '<div class="thShotStats">'
    + '<span class="thShotStat" style="color:rgba(34,197,94,.9)">Rim ' + (zones.ra.att ? Math.round(zones.ra.made / zones.ra.att * 100) + '%' : '—') + '</span>'
    + '<span class="thShotStat" style="color:rgba(99,179,237,.9)">Mid ' + (zones.mid.att ? Math.round(zones.mid.made / zones.mid.att * 100) + '%' : '—') + '</span>'
    + '<span class="thShotStat" style="color:rgba(251,146,60,.9)">3PT ' + ((zones.corner3.att + zones.atb3.att) ? Math.round((zones.corner3.made + zones.atb3.made) / (zones.corner3.att + zones.atb3.att) * 100) + '%' : '—') + '</span>'
    + (ftA > 0 ? '<span class="thShotStat" style="color:rgba(200,180,255,.9)">FT ' + Math.round(ftM / ftA * 100) + '%</span>' : '')
    + '<span class="thShotStat" style="color:var(--text)">' + oPct + '% FG &middot; ' + totalFGA + ' FGA</span>'
    + '</div>'
    + '</div>';
}

// ── Toggle handlers (profile + matchup) ──────────────────────────────────────
function saToggleProfileChart(btn, view) {
  var dots = document.getElementById('mShotChartDots');
  var hex = document.getElementById('mShotChartHex');
  var zones = document.getElementById('mShotChartZones');
  if (!dots || !hex) return;
  var btns = btn.parentElement.querySelectorAll('.saShotBtn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-view') === view);
  }
  dots.style.display = view === 'dots' ? '' : 'none';
  hex.style.display = view === 'hex' ? '' : 'none';
  if (zones) zones.style.display = view === 'zones' ? '' : 'none';
}

function saToggleMatchupCharts(btn, view) {
  var dots = document.getElementById('thMatchupDots');
  var hex = document.getElementById('thMatchupHex');
  var zones = document.getElementById('thMatchupZones');
  if (!dots || !hex) return;
  var btns = btn.parentElement.querySelectorAll('.saShotBtn');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].getAttribute('data-view') === view);
  }
  dots.style.display = view === 'dots' ? '' : 'none';
  hex.style.display = view === 'hex' ? '' : 'none';
  if (zones) zones.style.display = view === 'zones' ? '' : 'none';
}

// ── Expose ───────────────────────────────────────────────────────────────────
window.saBuildHexChart = saBuildHexChart;
window.saBuildZoneChart = saBuildZoneChart;
window.saInitHexTooltips = saInitHexTooltips;
window.saToggleProfileChart = saToggleProfileChart;
window.saToggleMatchupCharts = saToggleMatchupCharts;
window.ShotAnalytics = true;
