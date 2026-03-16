// ── Tournament Lab ──────────────────────────────────────────────────────────
// Multi-team analysis: k-means clustering, logistic regression, shot zone
// integration, play-by-play tendencies, and Gemini-powered narrative.

var labSelectedTeams = [];
var _labTeamInput, _labDropdown, _labPills, _labRunBtn, _labResults, _labLoading, _labLoadingText;
var _labDeepBtn, _labDeepOutput;
var _labAnalysisData = null; // cached analysis results
var _labClusterData = null;  // k-means output
var _labRegressionData = null; // logistic regression output
var _labShotZoneData = null; // per-team shot zone cache
var _labPbpData = null;      // per-team play-by-play tendencies
var _labPastePanel, _labPasteInput, _labPasteStatus, _labPastePreview, _labPasteMatches = [];
var _labDeepUseHeavyModel = (localStorage.getItem('labDeepModel') === 'heavy');
var _labShootingCache = {};  // team → shooting zone data

function initLabDOMRefs() {
  _labTeamInput   = document.getElementById('labTeamInput');
  _labDropdown    = document.getElementById('labTeamDropdown');
  _labPills       = document.getElementById('labPills');
  _labRunBtn      = document.getElementById('labRunBtn');
  _labResults     = document.getElementById('labResults');
  _labLoading     = document.getElementById('labLoading');
  _labLoadingText = document.getElementById('labLoadingText');
  _labDeepBtn     = document.getElementById('labDeepBtn');
  _labDeepOutput  = document.getElementById('labDeepOutput');
  _labPastePanel  = document.getElementById('labPastePanel');
  _labPasteInput  = document.getElementById('labPasteInput');
  _labPasteStatus = document.getElementById('labPasteStatus');
  _labPastePreview= document.getElementById('labPastePreview');
}

function initLabPage() {
  initLabDOMRefs();
  if (!_labTeamInput) return;

  // Team search input
  var debounce = null;
  _labTeamInput.addEventListener('input', function() {
    clearTimeout(debounce);
    debounce = setTimeout(function() { labShowDropdown(_labTeamInput.value.trim()); }, 120);
  });
  _labTeamInput.addEventListener('focus', function() {
    if (_labTeamInput.value.trim().length >= 1) labShowDropdown(_labTeamInput.value.trim());
  });
  document.addEventListener('click', function(e) {
    if (!_labTeamInput.contains(e.target) && !_labDropdown.contains(e.target)) {
      _labDropdown.style.display = 'none';
    }
  });

  // Run button
  _labRunBtn.addEventListener('click', function() { labRunAnalysis(); });

  // Deep analysis button
  if (_labDeepBtn) {
    _labDeepBtn.addEventListener('click', function() { labRunDeepAnalysis(); });
  }

  // Model toggle
  var modelSwitch = document.getElementById('labModelSwitchInput');
  if (modelSwitch) {
    modelSwitch.checked = _labDeepUseHeavyModel;
    _labSyncModelLabels();
    modelSwitch.addEventListener('change', function() { labSetDeepModel(modelSwitch.checked); });
  }

  // Download PDF button
  var dlBtn = document.getElementById('labDownloadBtn');
  if (dlBtn) {
    dlBtn.addEventListener('click', function() { labDownloadPDF(); });
  }

  // Paste list toggle
  var pasteToggle = document.getElementById('labPasteToggle');
  if (pasteToggle && _labPastePanel) {
    pasteToggle.addEventListener('click', function() {
      var open = _labPastePanel.style.display !== 'none';
      _labPastePanel.style.display = open ? 'none' : '';
      pasteToggle.textContent = open ? '\u{1F4CB} Paste a list' : '\u2715 Close';
      if (!open && _labPasteInput) _labPasteInput.focus();
    });
  }

  // Live paste preview as user types/pastes
  if (_labPasteInput) {
    _labPasteInput.addEventListener('input', function() { labPastePreview(_labPasteInput.value); });
    _labPasteInput.addEventListener('paste', function() {
      setTimeout(function() { labPastePreview(_labPasteInput.value); }, 0);
    });
  }

  // Apply button — add all matched teams
  var applyBtn = document.getElementById('labPasteApplyBtn');
  if (applyBtn) {
    applyBtn.addEventListener('click', function() {
      var added = 0;
      _labPasteMatches.forEach(function(m) {
        if (m.matched && labSelectedTeams.indexOf(m.matched) === -1) {
          labSelectedTeams.push(m.matched);
          added++;
        }
      });
      if (added > 0) { labRenderPills(); labUpdateRunBtn(); }
      if (_labPasteStatus) _labPasteStatus.textContent = added + ' team' + (added === 1 ? '' : 's') + ' added.';
      if (_labPasteInput) _labPasteInput.value = '';
      if (_labPastePreview) _labPastePreview.innerHTML = '';
      _labPasteMatches = [];
    });
  }

  // Clear paste button
  var clearBtn = document.getElementById('labPasteClearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      if (_labPasteInput) _labPasteInput.value = '';
      if (_labPastePreview) _labPastePreview.innerHTML = '';
      if (_labPasteStatus) _labPasteStatus.textContent = '';
      _labPasteMatches = [];
    });
  }
}

// ── Model Toggle ─────────────────────────────────────────────────────────────

function labSetDeepModel(heavy) {
  if (heavy && typeof authIsGuest === 'function' && authIsGuest()) {
    if (typeof showWarn === 'function') showWarn('\u{1F512} Pro model requires login. Guest users can only use 2.5 Lite.');
    var cb = document.getElementById('labModelSwitchInput');
    if (cb) cb.checked = false;
    return;
  }
  _labDeepUseHeavyModel = !!heavy;
  localStorage.setItem('labDeepModel', _labDeepUseHeavyModel ? 'heavy' : 'lite');
  _labSyncModelLabels();
}

function _labSyncModelLabels() {
  var lblLite  = document.getElementById('labModelLblLite');
  var lblHeavy = document.getElementById('labModelLblHeavy');
  var cb       = document.getElementById('labModelSwitchInput');
  if (cb) cb.checked = _labDeepUseHeavyModel;
  if (lblLite)  lblLite.classList.toggle('active',  !_labDeepUseHeavyModel);
  if (lblHeavy) lblHeavy.classList.toggle('active',   _labDeepUseHeavyModel);
}

// ── PDF Download ──────────────────────────────────────────────────────────────

function labDownloadPDF() {
  var deepContent = _labDeepOutput ? _labDeepOutput.innerHTML : '';
  if (!deepContent || !_labAnalysisData) return;

  var teams = _labAnalysisData;
  var teamList = teams.map(function(t) { return t.team + (t.conference ? ' (' + t.conference + ')' : ''); }).join(', ');
  var now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Build profile table rows
  var profileRows = teams.slice().sort(function(a, b) { return (b.adjEM || 0) - (a.adjEM || 0); }).map(function(t) {
    return '<tr><td>' + t.team + '</td><td>' + t.wins + '-' + t.losses + '</td><td>' + (t.adjEM || '\u2014') + '</td>'
      + '<td>' + (t.adjO || '\u2014') + '</td><td>' + (t.adjD || '\u2014') + '</td><td>' + (t.eFG || '\u2014') + '%</td>'
      + '<td>' + (t.fg3Pct || '\u2014') + '%</td><td>' + (t.ftPct || '\u2014') + '%</td>'
      + '<td>' + (t.oppEFG || '\u2014') + '%</td><td>' + (t.dRtg || '\u2014') + '</td></tr>';
  }).join('');

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<title>Tournament Lab \u2014 ' + now + '</title>'
    + '<style>'
    + 'body{font-family:system-ui,sans-serif;color:#1a1a2e;background:#fff;margin:0;padding:0}'
    + '.cover{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);color:#fff;padding:60px 48px;min-height:240px}'
    + '.cover h1{font-size:32px;margin:0 0 8px;font-weight:800;letter-spacing:-0.5px}'
    + '.cover .sub{font-size:14px;opacity:0.7;margin:4px 0}'
    + '.cover .teams{font-size:12px;opacity:0.6;margin-top:16px;max-width:700px;line-height:1.6}'
    + '.section{padding:32px 48px;border-bottom:1px solid #eee}'
    + '.section h2{font-size:16px;font-weight:700;color:#1a1a2e;margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid #FFD200}'
    + 'table{width:100%;border-collapse:collapse;font-size:11px}'
    + 'th{background:#1a1a2e;color:#FFD200;padding:8px 10px;text-align:left;font-weight:600}'
    + 'td{padding:7px 10px;border-bottom:1px solid #f0f0f0}'
    + 'tr:nth-child(even) td{background:#fafafa}'
    + '.deepSection{margin-bottom:20px;padding:16px;background:#f8f8ff;border-radius:8px;border-left:3px solid #FFD200}'
    + '.deepSection h3{font-size:14px;font-weight:700;color:#1a1a2e;margin:0 0 10px}'
    + '.deepSection p,.deepSection li{font-size:12px;line-height:1.7;color:#333;margin:4px 0}'
    + '.footer{text-align:center;padding:24px;font-size:11px;color:#999}'
    + '@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
    + '</style></head><body>'
    + '<div class="cover">'
    + '<h1>\u{1F52C} Tournament Lab Analysis</h1>'
    + '<div class="sub">Generated ' + now + '</div>'
    + '<div class="sub">' + teams.length + ' teams analyzed</div>'
    + '<div class="teams">' + teamList + '</div>'
    + '</div>'
    + '<div class="section"><h2>Team Profiles</h2>'
    + '<table><thead><tr><th>Team</th><th>W-L</th><th>AdjEM</th><th>AdjO</th><th>AdjD</th>'
    + '<th>eFG%</th><th>3P%</th><th>FT%</th><th>Opp eFG%</th><th>DRtg</th></tr></thead>'
    + '<tbody>' + profileRows + '</tbody></table></div>'
    + '<div class="section"><h2>AI Deep Analysis</h2>'
    + '<div>' + deepContent.replace(/class="labDeepSection"/g, 'class="deepSection"').replace(/class="labDeepBody"/g, '') + '</div>'
    + '</div>'
    + '<div class="footer">NCAA Basketball Scouting Dashboard \u00B7 Tournament Lab</div>'
    + '</body></html>';

  var blob = new Blob([html], { type: 'text/html' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'tournament-lab-' + now.replace(/[, ]+/g, '-').toLowerCase() + '.html';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}

// ── Paste List Matching ─────────────────────────────────────────────────────

function _labNorm(s) {
  return (s || '').toLowerCase()
    .replace(/\b(university|college|of|the|at|a|st\.?|state)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function _labFuzzyMatch(query, teams) {
  var q = _labNorm(query);
  if (!q) return null;
  var best = null, bestScore = 0;
  teams.forEach(function(t) {
    var tn = _labNorm(t.team);
    var score = 0;
    if (tn === q) { score = 100; }
    else if (tn.includes(q) || q.includes(tn)) { score = 80 - Math.abs(tn.length - q.length); }
    else {
      var qWords = q.split(' ').filter(Boolean);
      var tWords = tn.split(' ').filter(Boolean);
      var overlap = qWords.filter(function(w) { return tWords.some(function(tw) { return tw.startsWith(w) || w.startsWith(tw); }); }).length;
      if (overlap > 0) score = Math.round(overlap / Math.max(qWords.length, tWords.length) * 70);
    }
    if (score > bestScore) { bestScore = score; best = t; }
  });
  return bestScore >= 35 ? { team: best.team, conference: best.conference, score: bestScore } : null;
}

function _labParseLines(text) {
  return text.split(/[\n\r,;]/)
    .map(function(line) {
      return line.replace(/^[\s\-\*\u2022\d\.]+/, '').replace(/\(.*?\)/g, '').trim();
    })
    .filter(function(line) { return line.length >= 2; });
}

function labPastePreview(text) {
  if (!_labPastePreview || !_labPasteStatus) return;
  var lines = _labParseLines(text);
  if (!lines.length) { _labPastePreview.innerHTML = ''; _labPasteStatus.textContent = ''; _labPasteMatches = []; return; }
  var teams = labGetAllTeamNames();
  _labPasteMatches = lines.map(function(line) {
    var match = _labFuzzyMatch(line, teams);
    return { input: line, matched: match ? match.team : null, conference: match ? match.conference : '' };
  });
  var matched = _labPasteMatches.filter(function(m) { return m.matched; });
  var alreadyAdded = matched.filter(function(m) { return labSelectedTeams.indexOf(m.matched) !== -1; });
  var newOnes = matched.length - alreadyAdded.length;
  _labPasteStatus.textContent = newOnes + ' new team' + (newOnes === 1 ? '' : 's') + ' found' + (alreadyAdded.length ? ', ' + alreadyAdded.length + ' already added' : '') + '.';

  _labPastePreview.innerHTML = '<div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;max-height:220px;overflow-y:auto">'
    + _labPasteMatches.map(function(m) {
      var already = m.matched && labSelectedTeams.indexOf(m.matched) !== -1;
      if (m.matched) {
        return '<div class="labPasteMatchRow">'
          + '<span class="labPasteMatchIcon">' + (already ? '\u2611' : '\u2705') + '</span>'
          + '<span class="labPasteMatchTeam' + (already ? ' labPasteAlready' : '') + '">' + m.matched + '</span>'
          + '<span class="labPasteMatchConf">' + (m.conference || '') + '</span>'
          + (m.input.toLowerCase() !== m.matched.toLowerCase() ? '<span class="labPasteMatchInput">\u2190 "' + m.input + '"</span>' : '')
          + '</div>';
      } else {
        return '<div class="labPasteMatchRow">'
          + '<span class="labPasteMatchIcon labPasteUnmatched">\u274C</span>'
          + '<span class="labPasteUnmatched" style="flex:1">"' + m.input + '" \u2014 no match</span>'
          + '</div>';
      }
    }).join('')
    + '</div>';
}

// ── Team Search Dropdown ────────────────────────────────────────────────────

function labShowDropdown(query) {
  if (!query || query.length < 1) { _labDropdown.style.display = 'none'; return; }
  var teams = labGetAllTeamNames();
  var q = query.toLowerCase();
  var matches = teams.filter(function(t) {
    if (labSelectedTeams.indexOf(t.team) !== -1) return false;
    return t.team.toLowerCase().includes(q) || (t.conference || '').toLowerCase().includes(q);
  }).slice(0, 15);

  if (!matches.length) { _labDropdown.style.display = 'none'; return; }
  _labDropdown.innerHTML = matches.map(function(t) {
    return '<div class="labDropItem" data-team="' + t.team.replace(/"/g, '&quot;') + '">'
      + '<span>' + t.team + '</span>'
      + '<span class="labDropConf">' + (t.conference || '') + '</span>'
      + '</div>';
  }).join('');
  _labDropdown.style.display = '';

  _labDropdown.querySelectorAll('.labDropItem').forEach(function(el) {
    el.addEventListener('click', function() {
      labAddTeam(el.dataset.team);
      _labTeamInput.value = '';
      _labDropdown.style.display = 'none';
      _labTeamInput.focus();
    });
  });
}

function labGetAllTeamNames() {
  if (typeof allRatingsData !== 'undefined' && allRatingsData.length > 0) {
    return allRatingsData.map(function(r) {
      return { team: r.team, conference: r.conference };
    }).sort(function(a, b) { return a.team.localeCompare(b.team); });
  }
  return [];
}

function labAddTeam(teamName) {
  if (labSelectedTeams.indexOf(teamName) !== -1) return;
  labSelectedTeams.push(teamName);
  labRenderPills();
  labUpdateRunBtn();
}

function labRemoveTeam(teamName) {
  labSelectedTeams = labSelectedTeams.filter(function(t) { return t !== teamName; });
  labRenderPills();
  labUpdateRunBtn();
}

function labRenderPills() {
  if (!_labPills) return;
  var ratingsMap = {};
  if (typeof allRatingsData !== 'undefined') {
    allRatingsData.forEach(function(r) { ratingsMap[r.team] = r; });
  }
  _labPills.innerHTML = labSelectedTeams.map(function(t) {
    var conf = ratingsMap[t] ? ratingsMap[t].conference : '';
    return '<span class="labPill">'
      + t
      + (conf ? ' <span class="labPillConf">' + conf + '</span>' : '')
      + '<span class="labPillX" data-team="' + t.replace(/"/g, '&quot;') + '">&times;</span>'
      + '</span>';
  }).join('');

  _labPills.querySelectorAll('.labPillX').forEach(function(el) {
    el.addEventListener('click', function() { labRemoveTeam(el.dataset.team); });
  });
}

function labUpdateRunBtn() {
  if (!_labRunBtn) return;
  _labRunBtn.disabled = labSelectedTeams.length < 2;
  var note = document.getElementById('labPickerNote');
  if (note) {
    note.textContent = labSelectedTeams.length < 2
      ? 'Add at least 2 teams to run analysis.'
      : labSelectedTeams.length + ' teams selected.';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── K-MEANS CLUSTERING ENGINE ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

var LAB_CLUSTER_DIMS = ['adjEM', 'eFG', 'toRatio', 'orbPct', 'oppEFG', 'pace', 'fg3Rate', 'ftr'];

// Compute z-scores for an array of team objects on given dimension keys
function _labZScores(teams, dims) {
  var stats = {};
  dims.forEach(function(d) {
    var vals = teams.map(function(t) { return t[d] || 0; });
    var n = vals.length;
    var mean = vals.reduce(function(a, b) { return a + b; }, 0) / n;
    var variance = vals.reduce(function(a, v) { return a + (v - mean) * (v - mean); }, 0) / n;
    var sd = Math.sqrt(variance) || 1;
    stats[d] = { mean: mean, sd: sd };
  });

  return {
    stats: stats,
    matrix: teams.map(function(t) {
      return dims.map(function(d) {
        return (( t[d] || 0) - stats[d].mean) / stats[d].sd;
      });
    })
  };
}

// Euclidean distance between two vectors
function _labDist(a, b) {
  var sum = 0;
  for (var i = 0; i < a.length; i++) {
    var d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// K-means++ initialization
function _labKMeansPP(matrix, k) {
  var centroids = [];
  var n = matrix.length;
  // Pick first centroid randomly
  var idx = Math.floor(Math.random() * n);
  centroids.push(matrix[idx].slice());

  for (var c = 1; c < k; c++) {
    var dists = matrix.map(function(row) {
      var minD = Infinity;
      centroids.forEach(function(cen) {
        var d = _labDist(row, cen);
        if (d < minD) minD = d;
      });
      return minD * minD;
    });
    var total = dists.reduce(function(a, b) { return a + b; }, 0);
    var r = Math.random() * total;
    var cumul = 0;
    for (var i = 0; i < n; i++) {
      cumul += dists[i];
      if (cumul >= r) { centroids.push(matrix[i].slice()); break; }
    }
  }
  return centroids;
}

// Run k-means for a given k, return {assignments, centroids, wcss}
function _labKMeansRun(matrix, k, maxIter) {
  maxIter = maxIter || 50;
  var n = matrix.length;
  var dims = matrix[0].length;
  var centroids = _labKMeansPP(matrix, k);
  var assignments = new Array(n);

  for (var iter = 0; iter < maxIter; iter++) {
    // Assign
    var changed = false;
    for (var i = 0; i < n; i++) {
      var bestC = 0, bestD = Infinity;
      for (var c = 0; c < k; c++) {
        var d = _labDist(matrix[i], centroids[c]);
        if (d < bestD) { bestD = d; bestC = c; }
      }
      if (assignments[i] !== bestC) { changed = true; assignments[i] = bestC; }
    }
    if (!changed) break;

    // Update centroids
    for (var c2 = 0; c2 < k; c2++) {
      var counts = 0;
      var sums = new Array(dims);
      for (var d2 = 0; d2 < dims; d2++) sums[d2] = 0;
      for (var j = 0; j < n; j++) {
        if (assignments[j] === c2) {
          counts++;
          for (var d3 = 0; d3 < dims; d3++) sums[d3] += matrix[j][d3];
        }
      }
      if (counts > 0) {
        for (var d4 = 0; d4 < dims; d4++) centroids[c2][d4] = sums[d4] / counts;
      }
    }
  }

  // Compute WCSS (within-cluster sum of squares)
  var wcss = 0;
  for (var i2 = 0; i2 < n; i2++) {
    var d5 = _labDist(matrix[i2], centroids[assignments[i2]]);
    wcss += d5 * d5;
  }

  return { assignments: assignments, centroids: centroids, wcss: wcss };
}

// Auto-elbow: try k=2..6, pick the k with largest WCSS drop ratio
function _labAutoElbow(matrix) {
  var results = [];
  for (var k = 2; k <= Math.min(6, matrix.length - 1); k++) {
    // Run 3 times, keep best WCSS
    var best = null;
    for (var trial = 0; trial < 3; trial++) {
      var res = _labKMeansRun(matrix, k);
      if (!best || res.wcss < best.wcss) best = res;
    }
    best.k = k;
    results.push(best);
  }
  if (results.length < 2) return results[0];

  // Find largest relative WCSS drop (elbow)
  var bestElbow = 0, bestRatio = 0;
  for (var i = 1; i < results.length; i++) {
    var drop = results[i - 1].wcss - results[i].wcss;
    var ratio = drop / (results[i - 1].wcss || 1);
    // Penalize going past k=4 slightly
    if (results[i].k > 4) ratio *= 0.85;
    if (ratio > bestRatio) { bestRatio = ratio; bestElbow = i; }
  }
  // Default to k=4 if no clear elbow or if best is k=2
  var chosen = results[bestElbow];
  if (chosen.k === 2 && results.length >= 3) chosen = results[2]; // prefer k=4
  return chosen;
}

// Label clusters by their centroid profile
function _labLabelCluster(centroid, dims) {
  // centroid values are z-scores; identify dominant traits
  var pairs = dims.map(function(d, i) { return { dim: d, z: centroid[i] }; });
  pairs.sort(function(a, b) { return Math.abs(b.z) - Math.abs(a.z); });

  var top = pairs.slice(0, 3);
  // Generate human-readable name from top 2 traits
  var labels = {
    adjEM:    { high: 'Elite',          low: 'Low-Rated' },
    eFG:     { high: 'Efficient Shooting', low: 'Low-eFG' },
    toRatio:  { high: 'Turnover-Prone',  low: 'Ball-Secure' },
    orbPct:   { high: 'Glass-Crashing',  low: 'Low-ORB' },
    oppEFG:   { high: 'Porous Defense',  low: 'Defensive' },
    pace:     { high: 'High-Tempo',      low: 'Slow-Grind' },
    fg3Rate:  { high: '3PT-Heavy',       low: 'Inside-Focused' },
    ftr:      { high: 'FT-Hunting',      low: 'Low-FTR' }
  };

  var name1 = (top[0].z >= 0 ? labels[top[0].dim].high : labels[top[0].dim].low);
  var name2 = (top[1].z >= 0 ? labels[top[1].dim].high : labels[top[1].dim].low);
  return name1 + ' ' + name2;
}

// Main clustering function — returns {clusters, elbowK, wcssHistory}
function labRunClustering(teams) {
  var zData = _labZScores(teams, LAB_CLUSTER_DIMS);
  var result = _labAutoElbow(zData.matrix);

  // Build cluster objects
  var clusters = [];
  for (var c = 0; c < result.k; c++) {
    var members = [];
    for (var i = 0; i < teams.length; i++) {
      if (result.assignments[i] === c) {
        members.push({
          team: teams[i].team,
          dist: +_labDist(zData.matrix[i], result.centroids[c]).toFixed(3)
        });
      }
    }
    members.sort(function(a, b) { return a.dist - b.dist; });

    // Centroid in original units
    var centroidOrig = {};
    LAB_CLUSTER_DIMS.forEach(function(d, di) {
      centroidOrig[d] = +(result.centroids[c][di] * zData.stats[d].sd + zData.stats[d].mean).toFixed(2);
    });

    clusters.push({
      id: c,
      label: _labLabelCluster(result.centroids[c], LAB_CLUSTER_DIMS),
      centroid: centroidOrig,
      centroidZ: result.centroids[c],
      members: members
    });
  }

  // Attach cluster assignment to each team object
  teams.forEach(function(t, i) {
    t._cluster = result.assignments[i];
    t._clusterLabel = clusters[result.assignments[i]].label;
    t._clusterDist = +_labDist(zData.matrix[i], result.centroids[result.assignments[i]]).toFixed(3);
  });

  return { clusters: clusters, k: result.k, wcss: result.wcss, zStats: zData.stats };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── LOGISTIC REGRESSION ENGINE ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

var LAB_LR_FEATURES = ['adjEM', 'eFG', 'oppEFG', 'toRatio', 'orbPct', 'pace'];

function _labSigmoid(z) {
  if (z > 500) return 1;
  if (z < -500) return 0;
  return 1.0 / (1.0 + Math.exp(-z));
}

// Fit logistic regression via gradient descent
// X: array of feature vectors (n x d), y: array of 0/1 labels
// Returns { weights: [], bias: number, iterations: number }
function _labLogRegFit(X, y, lr, maxIter, lambda) {
  lr = lr || 0.01;
  maxIter = maxIter || 500;
  lambda = lambda || 0.01; // L2 regularization
  var n = X.length;
  var d = X[0].length;
  var w = new Array(d);
  for (var i = 0; i < d; i++) w[i] = 0;
  var b = 0;

  for (var iter = 0; iter < maxIter; iter++) {
    var gradW = new Array(d);
    for (var j = 0; j < d; j++) gradW[j] = 0;
    var gradB = 0;

    for (var i2 = 0; i2 < n; i2++) {
      var z = b;
      for (var j2 = 0; j2 < d; j2++) z += w[j2] * X[i2][j2];
      var pred = _labSigmoid(z);
      var err = pred - y[i2];
      for (var j3 = 0; j3 < d; j3++) gradW[j3] += err * X[i2][j3];
      gradB += err;
    }

    for (var j4 = 0; j4 < d; j4++) {
      w[j4] -= lr * (gradW[j4] / n + lambda * w[j4]);
    }
    b -= lr * (gradB / n);
  }

  return { weights: w, bias: b };
}

// Run logistic regression: allRatingsData = full population, selectedTeams = positive class
function labRunLogisticRegression(teams) {
  if (typeof allRatingsData === 'undefined' || !allRatingsData.length) return null;

  // Build ratings lookup with team stats for the selected teams
  var selectedSet = {};
  teams.forEach(function(t) { selectedSet[t.team.toLowerCase()] = t; });

  // Build full population feature matrix from allRatingsData
  // We only have adjEM for all teams from ratings; for selected teams we have full stats
  // Strategy: use allRatingsData for the population, enrich selected teams with their stats
  var allTeamData = [];
  var ratMap = {};
  allRatingsData.forEach(function(r) { ratMap[r.team.toLowerCase()] = r; });

  // For the full population, we need all features. Teams not in our selected set
  // get population-average values for stats we don't have (eFG, etc.)
  // Better approach: only use features available for ALL teams from ratings
  // allRatingsData has: team, conference, adjO, adjD, adjEM, rank
  // We don't have eFG/oppEFG/toRatio/orbPct/pace for non-selected teams from ratings alone
  // So we use adjO, adjD, adjEM as proxies and add selected-team stats where available

  // Practical approach: use adjEM + adjO + adjD for the full population regression
  // Then do a secondary regression on the selected-only set for the full feature set
  var popFeatures = ['adjEM'];
  var selectedOnlyFeatures = LAB_LR_FEATURES;

  // Full population regression (adjEM only — still useful for ranking)
  var popX = [], popY = [];
  allRatingsData.forEach(function(r) {
    var isSelected = selectedSet[r.team.toLowerCase()] != null;
    popX.push([r.adjEM || 0]);
    popY.push(isSelected ? 1 : 0);
  });

  // Z-score normalize
  var popStats = [];
  for (var f = 0; f < popX[0].length; f++) {
    var vals = popX.map(function(row) { return row[f]; });
    var mean = vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
    var variance = vals.reduce(function(a, v) { return a + (v - mean) * (v - mean); }, 0) / vals.length;
    var sd = Math.sqrt(variance) || 1;
    popStats.push({ mean: mean, sd: sd });
  }
  var popXNorm = popX.map(function(row) {
    return row.map(function(v, fi) { return (v - popStats[fi].mean) / popStats[fi].sd; });
  });

  var popModel = _labLogRegFit(popXNorm, popY, 0.05, 300, 0.01);

  // Score all teams in the population
  var popScores = allRatingsData.map(function(r, idx) {
    var z = popModel.bias;
    for (var j = 0; j < popXNorm[idx].length; j++) z += popModel.weights[j] * popXNorm[idx][j];
    return { team: r.team, prob: +_labSigmoid(z).toFixed(4) };
  });

  // Selected-only regression (full features) — more informative coefficients
  var selX = [], selY = [];
  var selTeamNames = [];
  teams.forEach(function(t) {
    selX.push(selectedOnlyFeatures.map(function(f) { return t[f] || 0; }));
    selY.push(1); // all selected are positive
    selTeamNames.push(t.team);
  });

  // Add negative samples from allRatingsData (non-selected teams with available stats)
  // Since we only have adjEM for non-selected, approximate missing features
  var validNonSelected = allRatingsData.filter(function(r) {
    return !selectedSet[r.team.toLowerCase()];
  });

  // Compute population means from selected teams for missing features
  var featureMeans = {};
  selectedOnlyFeatures.forEach(function(f) {
    var vals = teams.map(function(t) { return t[f] || 0; }).filter(function(v) { return v !== 0; });
    featureMeans[f] = vals.length ? vals.reduce(function(a, b) { return a + b; }, 0) / vals.length : 0;
  });

  // Sample non-selected (max 3x selected count for balance)
  var negSample = validNonSelected.slice(0, teams.length * 3);
  negSample.forEach(function(r) {
    selX.push(selectedOnlyFeatures.map(function(f) {
      if (f === 'adjEM') return r.adjEM || 0;
      // For non-selected teams, use a degraded estimate
      // Scale feature means by the team's adjEM relative to selected mean
      var ratio = featureMeans.adjEM ? (r.adjEM || 0) / featureMeans.adjEM : 0.5;
      return featureMeans[f] * Math.max(0.3, Math.min(1.5, ratio));
    }));
    selY.push(0);
    selTeamNames.push(r.team);
  });

  // Z-score normalize selected regression
  var selStats = [];
  for (var f2 = 0; f2 < selectedOnlyFeatures.length; f2++) {
    var vals2 = selX.map(function(row) { return row[f2]; });
    var mean2 = vals2.reduce(function(a, b) { return a + b; }, 0) / vals2.length;
    var var2 = vals2.reduce(function(a, v) { return a + (v - mean2) * (v - mean2); }, 0) / vals2.length;
    var sd2 = Math.sqrt(var2) || 1;
    selStats.push({ mean: mean2, sd: sd2 });
  }
  var selXNorm = selX.map(function(row) {
    return row.map(function(v, fi) { return (v - selStats[fi].mean) / selStats[fi].sd; });
  });

  var selModel = _labLogRegFit(selXNorm, selY, 0.03, 500, 0.05);

  // Feature importances (abs coefficient, normalized)
  var coeffs = selectedOnlyFeatures.map(function(f, i) {
    return { feature: f, coeff: +selModel.weights[i].toFixed(4), absCoeff: Math.abs(selModel.weights[i]) };
  });
  coeffs.sort(function(a, b) { return b.absCoeff - a.absCoeff; });
  var maxAbs = coeffs[0].absCoeff || 1;
  coeffs.forEach(function(c) { c.importance = +(c.absCoeff / maxAbs * 100).toFixed(1); });

  // Score selected teams
  var selectedScores = teams.map(function(t, idx) {
    var xNorm = selectedOnlyFeatures.map(function(f, fi) {
      return ((t[f] || 0) - selStats[fi].mean) / selStats[fi].sd;
    });
    var z = selModel.bias;
    for (var j = 0; j < xNorm.length; j++) z += selModel.weights[j] * xNorm[j];
    return { team: t.team, prob: +_labSigmoid(z).toFixed(4) };
  });
  selectedScores.sort(function(a, b) { return b.prob - a.prob; });

  // Attach to team objects
  var scoreMap = {};
  selectedScores.forEach(function(s) { scoreMap[s.team] = s.prob; });
  teams.forEach(function(t) { t._tourneyProb = scoreMap[t.team] || 0; });

  return {
    coefficients: coeffs,
    selectedScores: selectedScores,
    popScores: popScores.sort(function(a, b) { return b.prob - a.prob; }),
    model: selModel,
    featureNames: selectedOnlyFeatures
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── SHOT ZONE INTEGRATION ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function labFetchShotZones(teamName, season) {
  season = season || 2026;
  var key = (teamName + ':' + season).toLowerCase();
  if (_labShootingCache[key]) return Promise.resolve(_labShootingCache[key]);

  var url = WORKER_URL + '/api/cbdata/teamshooting?team=' + encodeURIComponent(teamName) + '&season=' + season;
  return fetch(url).then(function(r) { return r.json(); }).then(function(d) {
    var s = d.shooting || null;
    _labShootingCache[key] = s;
    return s;
  }).catch(function() { return null; });
}

// Parse shooting zone data into a normalized profile
function _labParseShotZones(shooting) {
  if (!shooting) return null;
  var dunks = shooting.dunks || {};
  var tips = shooting.tipIns || {};
  var layups = shooting.layups || {};
  var mid = shooting.twoPointJumpers || {};
  var three = shooting.threePointJumpers || {};
  var ft = shooting.freeThrows || {};
  var breakdown = shooting.attemptsBreakdown || {};

  var paintAtt = (dunks.attempted || 0) + (tips.attempted || 0) + (layups.attempted || 0);
  var paintMade = (dunks.made || 0) + (tips.made || 0) + (layups.made || 0);
  var paintPct = paintAtt > 0 ? +(paintMade / paintAtt * 100).toFixed(1) : null;
  var midPct = mid.pct != null ? +mid.pct : null;
  var threePct = three.pct != null ? +three.pct : null;

  var totalAtt = paintAtt + (mid.attempted || 0) + (three.attempted || 0);
  var paintFreq = totalAtt > 0 ? +(paintAtt / totalAtt * 100).toFixed(1) : null;
  var midFreq = totalAtt > 0 ? +((mid.attempted || 0) / totalAtt * 100).toFixed(1) : null;
  var threeFreq = totalAtt > 0 ? +((three.attempted || 0) / totalAtt * 100).toFixed(1) : null;

  return {
    paintFreq: paintFreq, paintPct: paintPct,
    midFreq: midFreq, midPct: midPct,
    threeFreq: threeFreq, threePct: threePct,
    ftPct: ft.pct != null ? +ft.pct : null,
    ftr: shooting.freeThrowRate || null
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── PLAY-BY-PLAY ANALYSIS ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// Fetch game log, pick last 5 regular season + all postseason, fetch PBP
function labFetchPbpForTeam(teamName, season, onProgress) {
  season = season || 2026;
  var gamesUrl = WORKER_URL + '/api/cbdata/games?team=' + encodeURIComponent(teamName) + '&season=' + season;

  return fetch(gamesUrl).then(function(r) { return r.json(); }).then(function(data) {
    var games = (data && data.games) ? data.games : (Array.isArray(data) ? data : []);
    if (!games.length) return null;

    // Split into regular season and postseason
    var regular = [];
    var postseason = [];
    games.forEach(function(g) {
      if (!g || !g.id) return;
      if (g.postseason || g.type === 'postseason') {
        postseason.push(g);
      } else {
        regular.push(g);
      }
    });

    // Take last 5 regular season + all postseason
    var selected = regular.slice(-5).concat(postseason);
    if (!selected.length) return null;

    // Fetch PBP in parallel
    var gameIds = selected.map(function(g) { return g.id; });
    var promises = gameIds.map(function(gId) {
      var pbpUrl = WORKER_URL + '/api/cbdata/plays?gameId=' + gId;
      return fetch(pbpUrl).then(function(r) { return r.json(); }).then(function(d) {
        return { gameId: gId, plays: (d && d.plays) || [] };
      }).catch(function() { return { gameId: gId, plays: [] }; });
    });

    return Promise.all(promises).then(function(results) {
      if (onProgress) onProgress(teamName);
      return _labAggregatePbp(teamName, results, selected);
    });
  }).catch(function() { return null; });
}

// Aggregate play-by-play into tendencies
function _labAggregatePbp(teamName, pbpResults, games) {
  var totalShots = 0, totalMade = 0;
  var byZone = { rim: { att: 0, made: 0 }, mid: { att: 0, made: 0 }, three: { att: 0, made: 0 } };
  var byPeriod = {}; // period → {att, made}
  var clutchShots = 0, clutchMade = 0; // last 5 min, margin ≤5

  pbpResults.forEach(function(gr) {
    var plays = gr.plays || [];
    plays.forEach(function(p) {
      totalShots++;
      if (p.made) totalMade++;

      // Zone breakdown
      var range = p.range || 'unknown';
      if (range === 'rim' || range === 'at_rim' || range === 'layup' || range === 'dunk') {
        byZone.rim.att++; if (p.made) byZone.rim.made++;
      } else if (range === 'jumper' || range === 'mid_range' || range === 'two_pointer') {
        byZone.mid.att++; if (p.made) byZone.mid.made++;
      } else if (range === 'three_pointer' || range === 'three') {
        byZone.three.att++; if (p.made) byZone.three.made++;
      }

      // Period breakdown
      var period = p.period || 1;
      if (!byPeriod[period]) byPeriod[period] = { att: 0, made: 0 };
      byPeriod[period].att++;
      if (p.made) byPeriod[period].made++;

      // Clutch detection: period >= 2 (second half), clock indicates last 5 min
      if (period >= 2) {
        var clock = p.clock || '';
        var mins = _labParseClock(clock);
        if (mins !== null && mins <= 5) {
          clutchShots++;
          if (p.made) clutchMade++;
        }
      }
    });
  });

  if (totalShots === 0) return null;

  var zonePct = function(zone) { return zone.att > 0 ? +(zone.made / zone.att * 100).toFixed(1) : null; };
  var zoneFreq = function(zone) { return totalShots > 0 ? +(zone.att / totalShots * 100).toFixed(1) : null; };

  // Period efficiency
  var periodData = Object.keys(byPeriod).sort().map(function(p) {
    var pd = byPeriod[p];
    return {
      period: +p,
      shots: pd.att,
      pct: pd.att > 0 ? +(pd.made / pd.att * 100).toFixed(1) : null
    };
  });

  return {
    team: teamName,
    gamesAnalyzed: games.length,
    totalShots: totalShots,
    overallPct: +(totalMade / totalShots * 100).toFixed(1),
    zones: {
      rim:   { freq: zoneFreq(byZone.rim),   pct: zonePct(byZone.rim),   att: byZone.rim.att },
      mid:   { freq: zoneFreq(byZone.mid),   pct: zonePct(byZone.mid),   att: byZone.mid.att },
      three: { freq: zoneFreq(byZone.three), pct: zonePct(byZone.three), att: byZone.three.att }
    },
    periods: periodData,
    clutch: {
      shots: clutchShots,
      made: clutchMade,
      pct: clutchShots > 0 ? +(clutchMade / clutchShots * 100).toFixed(1) : null
    }
  };
}

function _labParseClock(clock) {
  if (!clock) return null;
  var parts = clock.split(':');
  if (parts.length >= 2) {
    var mins = parseInt(parts[0], 10);
    return isNaN(mins) ? null : mins;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── DATA FETCHING ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function labFetchTeamData(teamName) {
  var url = WORKER_URL + '/api/cbdata/teamstats?team=' + encodeURIComponent(teamName) + '&season=2026';
  return fetch(url).then(function(r) { return r.json(); }).then(function(d) {
    return d.stats || d;
  }).catch(function() { return null; });
}

// ══════════════════════════════════════════════════════════════════════════════
// ── RUN ANALYSIS (main pipeline) ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function labRunAnalysis() {
  if (labSelectedTeams.length < 2) return;
  _labResults.style.display = 'none';
  _labLoading.style.display = '';
  _labLoadingText.textContent = 'Fetching team stats for ' + labSelectedTeams.length + ' teams\u2026';
  _labRunBtn.disabled = true;

  // Build ratings lookup
  var ratingsMap = {};
  if (typeof allRatingsData !== 'undefined') {
    allRatingsData.forEach(function(r) { ratingsMap[r.team.toLowerCase()] = r; });
  }

  // Phase 1: Fetch team stats in parallel
  var teamStatPromises = labSelectedTeams.map(function(t) { return labFetchTeamData(t); });

  Promise.all(teamStatPromises).then(function(results) {
    var teams = [];
    results.forEach(function(s, i) {
      var teamName = labSelectedTeams[i];
      var rat = ratingsMap[teamName.toLowerCase()] || {};
      if (!s || !s.teamStats) {
        teams.push({
          team: teamName, conference: rat.conference || '', games: 0,
          wins: 0, losses: 0, pace: 0,
          adjO: rat.adjO || 0, adjD: rat.adjD || 0, adjEM: rat.adjEM || 0, rank: rat.rank || 0,
          eFG: 0, toRatio: 0, orbPct: 0, ftr: 0, ts: 0, oRtg: 0,
          fgPct: 0, fg3Pct: 0, ftPct: 0, fg3Rate: 0,
          paintPct: 0, toPtsRatio: 0,
          oppEFG: 0, oppTORatio: 0, oppORBPct: 0, oppFTR: 0, dRtg: 0, oppTS: 0,
          oppFGPct: 0, oppFG3Pct: 0, ast: 0, stl: 0, blk: 0, tovTotal: 0
        });
        return;
      }
      var ts = s.teamStats || {};
      var os = s.opponentStats || {};
      var fg = ts.fieldGoals || {};
      var fg3 = ts.threePointFieldGoals || {};
      var ft = ts.freeThrows || {};
      var tov = ts.turnovers || {};
      var pts = ts.points || {};
      var ff = ts.fourFactors || {};
      var ofg = os.fieldGoals || {};
      var ofg3 = os.threePointFieldGoals || {};
      var off = os.fourFactors || {};

      teams.push({
        team: teamName,
        conference: s.conference || rat.conference || '',
        games: s.games || 0, wins: s.wins || 0, losses: s.losses || 0,
        pace: s.pace || 0,
        adjO: rat.adjO || 0, adjD: rat.adjD || 0, adjEM: rat.adjEM || 0, rank: rat.rank || 0,
        eFG: ff.effectiveFieldGoalPct || 0,
        toRatio: ff.turnoverRatio || 0,
        orbPct: ff.offensiveReboundPct || 0,
        ftr: ff.freeThrowRate || 0,
        ts: ts.trueShooting || 0,
        oRtg: ts.rating || 0,
        fgPct: fg.pct || 0,
        fg3Pct: fg3.pct || 0,
        ftPct: ft.pct || 0,
        fg3Rate: fg.attempted ? +(fg3.attempted / fg.attempted * 100).toFixed(1) : 0,
        paintPct: pts.total ? +(pts.inPaint / pts.total * 100).toFixed(1) : 0,
        toPtsRatio: pts.total ? +(pts.offTurnovers / pts.total * 100).toFixed(1) : 0,
        oppEFG: off.effectiveFieldGoalPct || 0,
        oppTORatio: off.turnoverRatio || 0,
        oppORBPct: off.offensiveReboundPct || 0,
        oppFTR: off.freeThrowRate || 0,
        dRtg: os.rating || 0,
        oppTS: os.trueShooting || 0,
        oppFGPct: ofg.pct || 0,
        oppFG3Pct: ofg3.pct || 0,
        ast: ts.assists || 0,
        stl: ts.steals || 0,
        blk: ts.blocks || 0,
        tovTotal: tov.total || 0
      });
    });

    _labAnalysisData = teams;

    // Phase 2: Run clustering and regression (sync, fast)
    _labLoadingText.textContent = 'Running k-means clustering\u2026';
    try {
      _labClusterData = labRunClustering(teams);
    } catch (e) {
      _labClusterData = null;
    }

    _labLoadingText.textContent = 'Running logistic regression\u2026';
    try {
      _labRegressionData = labRunLogisticRegression(teams);
    } catch (e) {
      _labRegressionData = null;
    }

    // Phase 3: Fetch shot zones + play-by-play in parallel (async, show progress)
    _labLoadingText.textContent = 'Fetching shot zones & play-by-play (0/' + teams.length + ')\u2026';
    var doneCount = 0;
    var updateProgress = function() {
      doneCount++;
      if (_labLoadingText) {
        _labLoadingText.textContent = 'Fetching shot zones & play-by-play (' + doneCount + '/' + (teams.length * 2) + ')\u2026';
      }
    };

    var shotZonePromises = teams.map(function(t) {
      return labFetchShotZones(t.team, 2026).then(function(sz) {
        updateProgress();
        return { team: t.team, zones: _labParseShotZones(sz) };
      }).catch(function() { updateProgress(); return { team: t.team, zones: null }; });
    });

    var pbpPromises = teams.map(function(t) {
      return labFetchPbpForTeam(t.team, 2026, function() { updateProgress(); })
        .catch(function() { updateProgress(); return null; });
    });

    Promise.all([Promise.all(shotZonePromises), Promise.all(pbpPromises)]).then(function(phaseResults) {
      var szResults = phaseResults[0];
      var pbpResults = phaseResults[1];

      // Attach shot zone data to teams
      _labShotZoneData = {};
      szResults.forEach(function(sz) {
        _labShotZoneData[sz.team] = sz.zones;
        var t = teams.find(function(tt) { return tt.team === sz.team; });
        if (t && sz.zones) {
          t._zones = sz.zones;
        }
      });

      // Attach PBP data to teams
      _labPbpData = {};
      pbpResults.forEach(function(pbp) {
        if (pbp) {
          _labPbpData[pbp.team] = pbp;
          var t = teams.find(function(tt) { return tt.team === pbp.team; });
          if (t) t._pbp = pbp;
        }
      });

      // Derive archetypes from cluster + regression (replaces hardcoded tags)
      teams.forEach(function(t) {
        t._archetypeTags = _labDeriveArchetypes(t, _labClusterData, _labRegressionData);
      });

      // Render everything
      labRenderAllResults(teams);
      _labLoading.style.display = 'none';
      _labResults.style.display = '';
      _labRunBtn.disabled = false;
    }).catch(function() {
      // Even if zones/PBP fail, render what we have
      teams.forEach(function(t) {
        t._archetypeTags = _labDeriveArchetypes(t, _labClusterData, _labRegressionData);
      });
      labRenderAllResults(teams);
      _labLoading.style.display = 'none';
      _labResults.style.display = '';
      _labRunBtn.disabled = false;
    });

  }).catch(function(e) {
    _labLoadingText.textContent = 'Error: ' + e.message;
    _labRunBtn.disabled = false;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ── ARCHETYPE DERIVATION (replaces hardcoded tags) ──────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function _labDeriveArchetypes(team, clusterData, regressionData) {
  var tags = [];
  var COLORS = ['#16a34a', '#2563eb', '#7c3aed', '#d97706', '#dc2626', '#ea580c', '#0891b2', '#6b7280', '#059669', '#8b5cf6', '#b45309', '#be123c'];
  var ci = 0;
  var nextColor = function() { return COLORS[ci++ % COLORS.length]; };

  // 1) Cluster-derived primary archetype
  if (team._clusterLabel) {
    tags.push({ t: team._clusterLabel, c: nextColor() });
  }

  // 2) Feature-importance-derived tags — only add if the team is notably strong/weak
  //    on the most important regression features
  if (regressionData && regressionData.coefficients) {
    var topFeatures = regressionData.coefficients.slice(0, 4);
    topFeatures.forEach(function(feat) {
      var val = team[feat.feature] || 0;
      if (!val) return;
      // Use z-score from cluster stats to determine if team is outlier
      if (_labClusterData && _labClusterData.zStats && _labClusterData.zStats[feat.feature]) {
        var zs = _labClusterData.zStats[feat.feature];
        var z = (val - zs.mean) / zs.sd;
        var featureLabels = {
          adjEM:   { high: 'Elite Overall',  low: 'Below Average' },
          eFG:     { high: 'Sharp Shooting', low: 'Inefficient' },
          oppEFG:  { high: 'Porous D',       low: 'Lockdown D' },
          toRatio: { high: 'Turnover-Prone', low: 'Ball-Secure' },
          orbPct:  { high: 'Board Crashers', low: 'Low Rebounding' },
          pace:    { high: 'Up-Tempo',       low: 'Slow Grind' }
        };
        var labels = featureLabels[feat.feature];
        if (labels) {
          if (z >= 1.2)  tags.push({ t: labels.high, c: nextColor() });
          else if (z <= -1.2) tags.push({ t: labels.low, c: nextColor() });
        }
      }
    });
  }

  // 3) Shot zone derived tags
  if (team._zones) {
    if (team._zones.paintFreq != null && team._zones.paintFreq >= 45) tags.push({ t: 'Paint-Dominant', c: nextColor() });
    if (team._zones.threeFreq != null && team._zones.threeFreq >= 40) tags.push({ t: '3PT-Reliant', c: nextColor() });
    if (team._zones.paintPct != null && team._zones.paintPct >= 65) tags.push({ t: 'Elite at Rim', c: nextColor() });
  }

  // 4) PBP-derived clutch tag
  if (team._pbp && team._pbp.clutch && team._pbp.clutch.shots >= 10) {
    if (team._pbp.clutch.pct >= 50) tags.push({ t: 'Clutch', c: nextColor() });
    else if (team._pbp.clutch.pct <= 30) tags.push({ t: 'Clutch Struggles', c: '#f87171' });
  }

  // Deduplicate by label
  var seen = {};
  return tags.filter(function(tag) {
    if (seen[tag.t]) return false;
    seen[tag.t] = true;
    return true;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ── STATISTICAL HELPERS ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function labStats(arr) {
  var s = arr.filter(function(v) { return v != null && !isNaN(v) && v !== 0; }).sort(function(a, b) { return a - b; });
  if (!s.length) return { min: 0, max: 0, avg: 0, med: 0, p25: 0, p75: 0 };
  var avg = s.reduce(function(a, b) { return a + b; }, 0) / s.length;
  return {
    min: s[0], max: s[s.length - 1],
    avg: +avg.toFixed(1),
    med: s[Math.floor(s.length / 2)],
    p25: s[Math.floor(s.length * 0.25)],
    p75: s[Math.floor(s.length * 0.75)],
    n: s.length
  };
}

// Legacy archetype tags — kept as fallback, but primary path is _labDeriveArchetypes
function labArchetypeTags(t) {
  if (t._archetypeTags) return t._archetypeTags;
  // Fallback: old threshold-based tags
  var tags = [];
  if (t.eFG >= 55)       tags.push({ t: 'Elite Shooting', c: '#16a34a' });
  if (t.orbPct >= 33)    tags.push({ t: 'Glass Crasher', c: '#2563eb' });
  if (t.toRatio <= 0.15) tags.push({ t: 'Ball Secure', c: '#7c3aed' });
  if (t.ftr >= 40)       tags.push({ t: 'FT Hunter', c: '#d97706' });
  if (t.oppEFG <= 47)    tags.push({ t: 'Lock Defense', c: '#dc2626' });
  if (t.pace >= 70)      tags.push({ t: 'Up-Tempo', c: '#0891b2' });
  if (t.pace <= 63)      tags.push({ t: 'Slow Grind', c: '#6b7280' });
  if (t.fg3Rate >= 35)   tags.push({ t: '3PT Reliant', c: '#8b5cf6' });
  if (t.adjEM >= 15)     tags.push({ t: 'Elite Efficiency', c: '#b45309' });
  return tags;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── RENDER ALL RESULTS ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function labRenderAllResults(teams) {
  labRenderOverview(teams);
  labRenderTraits(teams);
  labRenderProfiles(teams);
  labRenderClusters(teams);
  labRenderRegression(teams);
  labRenderArchetypes(teams);
  labRenderShotZones(teams);
  labRenderTendencies(teams);
  labRenderDistributions(teams);
  if (_labDeepOutput) _labDeepOutput.innerHTML = '';
}

// ── Overview KPIs ───────────────────────────────────────────────────────────

function labRenderOverview(teams) {
  var el = document.getElementById('labOverview');
  if (!el) return;
  var valid = teams.filter(function(t) { return t.games > 0; });
  var avgEM = labStats(teams.map(function(t) { return t.adjEM; }));
  var avgWin = labStats(valid.map(function(t) { return t.wins / (t.wins + t.losses) * 100; }));
  var avgRank = labStats(teams.map(function(t) { return t.rank; }));
  var confs = {};
  teams.forEach(function(t) { confs[t.conference] = (confs[t.conference] || 0) + 1; });
  var confCount = Object.keys(confs).length;

  var clusterCount = _labClusterData ? _labClusterData.k : '\u2014';

  el.innerHTML = '<div class="labKpiGrid">'
    + '<div class="labKpi"><div class="labKpiVal">' + teams.length + '</div><div class="labKpiLabel">Teams</div></div>'
    + '<div class="labKpi"><div class="labKpiVal">' + confCount + '</div><div class="labKpiLabel">Conferences</div></div>'
    + '<div class="labKpi"><div class="labKpiVal">' + avgEM.avg + '</div><div class="labKpiLabel">Avg AdjEM</div></div>'
    + '<div class="labKpi"><div class="labKpiVal">' + avgWin.avg + '%</div><div class="labKpiLabel">Avg Win Rate</div></div>'
    + '<div class="labKpi"><div class="labKpiVal">' + avgRank.med + '</div><div class="labKpiLabel">Median Rank</div></div>'
    + '<div class="labKpi"><div class="labKpiVal">' + clusterCount + '</div><div class="labKpiLabel">Clusters Found</div></div>'
    + '</div>';
}

// ── Common Traits ───────────────────────────────────────────────────────────

function labRenderTraits(teams) {
  var el = document.getElementById('labTraits');
  if (!el) return;
  var valid = teams.filter(function(t) { return t.games > 0; });
  var n = valid.length;
  if (!n) { el.innerHTML = '<div class="muted" style="padding:16px">No team data available.</div>'; return; }

  var traits = [
    { label: 'Win Rate \u2265 65%',     count: valid.filter(function(t) { return t.wins / (t.wins + t.losses) >= 0.65; }).length },
    { label: 'AdjO \u2265 107',         count: valid.filter(function(t) { return t.adjO >= 107; }).length },
    { label: 'AdjD \u2264 110',         count: valid.filter(function(t) { return t.adjD <= 110; }).length },
    { label: 'eFG% \u2265 50%',         count: valid.filter(function(t) { return t.eFG >= 50; }).length },
    { label: 'True Shooting \u2265 55%', count: valid.filter(function(t) { return t.ts >= 55; }).length },
    { label: 'Opp eFG% \u2264 51%',     count: valid.filter(function(t) { return t.oppEFG <= 51; }).length },
    { label: 'TO Ratio \u2264 0.17',    count: valid.filter(function(t) { return t.toRatio <= 0.17; }).length },
    { label: 'ORB% \u2265 28%',         count: valid.filter(function(t) { return t.orbPct >= 28; }).length },
    { label: '3P% \u2265 33%',          count: valid.filter(function(t) { return t.fg3Pct >= 33; }).length },
    { label: 'FT% \u2265 70%',          count: valid.filter(function(t) { return t.ftPct >= 70; }).length },
    { label: 'Paint Pts \u2265 40%',    count: valid.filter(function(t) { return t.paintPct >= 40; }).length },
    { label: 'FTR \u2265 30',           count: valid.filter(function(t) { return t.ftr >= 30; }).length },
  ];

  traits.sort(function(a, b) { return b.count - a.count; });

  el.innerHTML = '<div class="labTraitGrid">'
    + traits.map(function(tr) {
      var pct = Math.round(tr.count / n * 100);
      var color = pct >= 80 ? 'var(--good)' : pct >= 60 ? 'var(--warn)' : 'var(--muted)';
      return '<div class="labTrait">'
        + '<span class="labTraitLabel">' + tr.label + '</span>'
        + '<div class="labTraitBarWrap"><div class="labTraitBar" style="width:' + pct + '%;background:' + color + '"></div></div>'
        + '<span class="labTraitPct" style="color:' + color + '">' + tr.count + '/' + n + ' (' + pct + '%)</span>'
        + '</div>';
    }).join('')
    + '</div>';
}

// ── Team Profiles Table ─────────────────────────────────────────────────────

function labRenderProfiles(teams) {
  var el = document.getElementById('labProfiles');
  if (!el) return;
  var sorted = teams.slice().sort(function(a, b) { return (b.adjEM || 0) - (a.adjEM || 0); });

  var cols = [
    { key: 'team', label: 'Team' },
    { key: 'record', label: 'W-L', fmt: function(t) { return t.wins + '-' + t.losses; } },
    { key: 'adjEM', label: 'AdjEM' },
    { key: 'rank', label: 'Rank' },
    { key: 'adjO', label: 'AdjO' },
    { key: 'adjD', label: 'AdjD' },
    { key: 'pace', label: 'Pace' },
    { key: 'eFG', label: 'eFG%' },
    { key: 'ts', label: 'TS%' },
    { key: 'fg3Pct', label: '3P%' },
    { key: 'ftPct', label: 'FT%' },
    { key: 'toRatio', label: 'TO%' },
    { key: 'orbPct', label: 'ORB%' },
    { key: 'ftr', label: 'FTR' },
    { key: 'oppEFG', label: 'Opp eFG%' },
    { key: 'dRtg', label: 'DRtg' },
    { key: '_tourneyProb', label: 'P(Tourney)', fmt: function(t) { return t._tourneyProb != null ? (t._tourneyProb * 100).toFixed(1) + '%' : '\u2014'; } },
    { key: '_clusterLabel', label: 'Cluster', fmt: function(t) { return t._clusterLabel || '\u2014'; } },
  ];

  var thead = '<tr>' + cols.map(function(c) { return '<th>' + c.label + '</th>'; }).join('') + '</tr>';
  var tbody = sorted.map(function(t) {
    return '<tr>' + cols.map(function(c) {
      if (c.fmt) return '<td>' + c.fmt(t) + '</td>';
      if (c.key === 'team') return '<td>' + t.team + '</td>';
      var v = t[c.key];
      return '<td>' + (v != null ? v : '\u2014') + '</td>';
    }).join('') + '</tr>';
  }).join('');

  el.innerHTML = '<table class="labProfileTable"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
}

// ══════════════════════════════════════════════════════════════════════════════
// ── RENDER: K-MEANS CLUSTERS ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function labRenderClusters(teams) {
  var el = document.getElementById('labClusters');
  if (!el) return;
  if (!_labClusterData || !_labClusterData.clusters) {
    el.innerHTML = '<div class="muted" style="padding:16px">Clustering unavailable.</div>';
    return;
  }

  var clusters = _labClusterData.clusters;
  var dimLabels = {
    adjEM: 'AdjEM', eFG: 'eFG%', toRatio: 'TO%', orbPct: 'ORB%',
    oppEFG: 'Opp eFG%', pace: 'Pace', fg3Rate: '3PT Rate', ftr: 'FTR'
  };

  var html = '<div class="labClusterGrid">';
  clusters.forEach(function(cl, idx) {
    var centroidPills = LAB_CLUSTER_DIMS.map(function(d) {
      var v = cl.centroid[d];
      var zVal = cl.centroidZ ? cl.centroidZ[LAB_CLUSTER_DIMS.indexOf(d)] : 0;
      var color = zVal >= 0.5 ? 'var(--good)' : zVal <= -0.5 ? 'var(--danger)' : 'var(--muted)';
      return '<span class="labClusterStat" style="color:' + color + '">'
        + (dimLabels[d] || d) + ': ' + v + '</span>';
    }).join('');

    var membersList = cl.members.map(function(m) {
      return '<span class="labClusterMember">' + m.team
        + ' <span class="labClusterDist">(' + m.dist.toFixed(2) + ')</span></span>';
    }).join('');

    html += '<div class="labClusterCard">'
      + '<div class="labClusterHead">'
      + '<span class="labClusterName">Cluster ' + (idx + 1) + ': ' + cl.label + '</span>'
      + '<span class="labClusterCount">' + cl.members.length + ' teams</span>'
      + '</div>'
      + '<div class="labClusterCentroid">' + centroidPills + '</div>'
      + '<div class="labClusterMembers">' + membersList + '</div>'
      + '</div>';
  });
  html += '</div>';

  el.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── RENDER: LOGISTIC REGRESSION ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function labRenderRegression(teams) {
  var el = document.getElementById('labRegression');
  if (!el) return;
  if (!_labRegressionData) {
    el.innerHTML = '<div class="muted" style="padding:16px">Regression unavailable.</div>';
    return;
  }

  var coeffs = _labRegressionData.coefficients;
  var scores = _labRegressionData.selectedScores;

  var featureLabels = {
    adjEM: 'Adj. Efficiency Margin', eFG: 'Effective FG%', oppEFG: 'Opp Effective FG%',
    toRatio: 'Turnover Ratio', orbPct: 'Off. Rebound %', pace: 'Pace'
  };

  // Feature importance bars
  var barsHtml = '<div class="labRegBars">'
    + coeffs.map(function(c) {
      var label = featureLabels[c.feature] || c.feature;
      var direction = c.coeff >= 0 ? '\u2191 positive' : '\u2193 negative';
      var color = c.coeff >= 0 ? 'var(--good)' : 'var(--danger)';
      return '<div class="labTrait">'
        + '<span class="labTraitLabel">' + label + '</span>'
        + '<div class="labTraitBarWrap"><div class="labTraitBar" style="width:' + c.importance + '%;background:' + color + '"></div></div>'
        + '<span class="labTraitPct" style="color:' + color + '">' + c.coeff.toFixed(3) + ' (' + direction + ')</span>'
        + '</div>';
    }).join('')
    + '</div>';

  // Team scores table
  var scoresHtml = '<div style="margin-top:16px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:8px">Tournament Probability by Team</div>'
    + '<table class="labProfileTable"><thead><tr><th>Team</th><th>P(Tournament)</th></tr></thead><tbody>'
    + scores.map(function(s) {
      var pct = (s.prob * 100).toFixed(1);
      var color = s.prob >= 0.7 ? 'var(--good)' : s.prob >= 0.4 ? 'var(--warn)' : 'var(--muted)';
      return '<tr><td>' + s.team + '</td><td style="color:' + color + ';font-weight:700">' + pct + '%</td></tr>';
    }).join('')
    + '</tbody></table></div>';

  el.innerHTML = '<div style="padding:16px">'
    + '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:12px">Feature Importance (coefficient magnitude)</div>'
    + barsHtml + scoresHtml + '</div>';
}

// ── Archetypes ──────────────────────────────────────────────────────────────

function labRenderArchetypes(teams) {
  var el = document.getElementById('labArchetypes');
  if (!el) return;
  var sorted = teams.slice().sort(function(a, b) { return (b.adjEM || 0) - (a.adjEM || 0); });

  // Count tag frequency
  var tagCounts = {};
  sorted.forEach(function(t) {
    labArchetypeTags(t).forEach(function(tag) {
      tagCounts[tag.t] = (tagCounts[tag.t] || 0) + 1;
    });
  });

  var tagSummary = Object.entries(tagCounts).sort(function(a, b) { return b[1] - a[1]; });
  var summaryHtml = '<div style="padding:12px 16px 4px;font-size:12px;color:var(--muted)">'
    + '<strong style="color:var(--text)">Most common:</strong> '
    + tagSummary.slice(0, 6).map(function(e) { return e[0] + ' (' + e[1] + ')'; }).join(' \u00B7 ')
    + '</div>';

  var rows = sorted.map(function(t) {
    var tags = labArchetypeTags(t);
    return '<div class="labArchRow">'
      + '<span class="labArchTeam">' + t.team + '</span>'
      + (tags.length
        ? tags.map(function(tag) {
            return '<span class="labArchTag" style="border-color:' + tag.c + ';color:' + tag.c + '">' + tag.t + '</span>';
          }).join('')
        : '<span style="font-size:11px;color:var(--muted)">No strong archetype signals</span>')
      + '</div>';
  }).join('');

  el.innerHTML = summaryHtml + '<div class="labArchGrid">' + rows + '</div>';
}

// ══════════════════════════════════════════════════════════════════════════════
// ── RENDER: SHOT ZONES ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function labRenderShotZones(teams) {
  var el = document.getElementById('labShotZones');
  if (!el) return;

  var hasZones = teams.some(function(t) { return t._zones; });
  if (!hasZones) {
    el.innerHTML = '<div class="muted" style="padding:16px">Shot zone data unavailable.</div>';
    return;
  }

  var sorted = teams.slice().sort(function(a, b) { return (b.adjEM || 0) - (a.adjEM || 0); });

  var thead = '<tr><th>Team</th><th>Paint Freq</th><th>Paint FG%</th><th>Mid Freq</th><th>Mid FG%</th><th>3PT Freq</th><th>3PT FG%</th><th>FT%</th></tr>';
  var tbody = sorted.map(function(t) {
    var z = t._zones || {};
    return '<tr>'
      + '<td>' + t.team + '</td>'
      + '<td>' + (z.paintFreq != null ? z.paintFreq + '%' : '\u2014') + '</td>'
      + '<td>' + (z.paintPct != null ? z.paintPct + '%' : '\u2014') + '</td>'
      + '<td>' + (z.midFreq != null ? z.midFreq + '%' : '\u2014') + '</td>'
      + '<td>' + (z.midPct != null ? z.midPct + '%' : '\u2014') + '</td>'
      + '<td>' + (z.threeFreq != null ? z.threeFreq + '%' : '\u2014') + '</td>'
      + '<td>' + (z.threePct != null ? z.threePct + '%' : '\u2014') + '</td>'
      + '<td>' + (z.ftPct != null ? z.ftPct + '%' : '\u2014') + '</td>'
      + '</tr>';
  }).join('');

  el.innerHTML = '<table class="labProfileTable"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
}

// ══════════════════════════════════════════════════════════════════════════════
// ── RENDER: PLAY-BY-PLAY TENDENCIES ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function labRenderTendencies(teams) {
  var el = document.getElementById('labTendencies');
  if (!el) return;

  var hasPbp = teams.some(function(t) { return t._pbp; });
  if (!hasPbp) {
    el.innerHTML = '<div class="muted" style="padding:16px">Play-by-play data unavailable.</div>';
    return;
  }

  var sorted = teams.filter(function(t) { return t._pbp; }).sort(function(a, b) { return (b.adjEM || 0) - (a.adjEM || 0); });

  var html = '<div class="labTendGrid">';
  sorted.forEach(function(t) {
    var p = t._pbp;
    var zones = p.zones || {};

    // Zone distribution mini-bars
    var zoneBars = '';
    ['rim', 'mid', 'three'].forEach(function(zone) {
      var z = zones[zone] || {};
      var freq = z.freq || 0;
      var pct = z.pct || 0;
      var label = zone === 'rim' ? 'Paint' : zone === 'mid' ? 'Mid' : '3PT';
      var color = zone === 'rim' ? '#16a34a' : zone === 'mid' ? '#d97706' : '#2563eb';
      zoneBars += '<div class="labTendZone">'
        + '<span class="labTendZoneLabel">' + label + '</span>'
        + '<div class="labTraitBarWrap" style="height:16px"><div class="labTraitBar" style="width:' + freq + '%;background:' + color + '"></div></div>'
        + '<span style="font-size:10px;color:var(--muted);white-space:nowrap">' + freq + '% / ' + pct + '%</span>'
        + '</div>';
    });

    // Period efficiency
    var periodHtml = (p.periods || []).map(function(pd) {
      return '<span class="labTendPeriod">' + (pd.period <= 2 ? 'H' + pd.period : 'OT' + (pd.period - 2))
        + ': ' + (pd.pct || 0) + '% (' + pd.shots + ')</span>';
    }).join('');

    // Clutch line
    var clutchHtml = '';
    if (p.clutch && p.clutch.shots > 0) {
      var clutchColor = p.clutch.pct >= 45 ? 'var(--good)' : p.clutch.pct <= 30 ? 'var(--danger)' : 'var(--warn)';
      clutchHtml = '<div class="labTendClutch">'
        + 'Clutch (last 5 min, close games): <strong style="color:' + clutchColor + '">'
        + p.clutch.pct + '%</strong> (' + p.clutch.made + '/' + p.clutch.shots + ')</div>';
    }

    html += '<div class="labTendCard">'
      + '<div class="labTendHead">'
      + '<span class="labTendTeam">' + t.team + '</span>'
      + '<span class="labTendMeta">' + p.gamesAnalyzed + ' games \u00B7 ' + p.totalShots + ' shots \u00B7 ' + p.overallPct + '% FG</span>'
      + '</div>'
      + '<div class="labTendZones">' + zoneBars + '</div>'
      + '<div class="labTendPeriods">' + periodHtml + '</div>'
      + clutchHtml
      + '</div>';
  });
  html += '</div>';

  el.innerHTML = html;
}

// ── Metric Distributions ────────────────────────────────────────────────────

function labRenderDistributions(teams) {
  var el = document.getElementById('labDistributions');
  if (!el) return;

  var metrics = [
    { key: 'adjEM', label: 'AdjEM' },
    { key: 'adjO', label: 'AdjO' },
    { key: 'adjD', label: 'AdjD' },
    { key: 'pace', label: 'Pace' },
    { key: 'eFG', label: 'eFG%' },
    { key: 'ts', label: 'TS%' },
    { key: 'fg3Pct', label: '3P%' },
    { key: 'ftPct', label: 'FT%' },
    { key: 'toRatio', label: 'TO Ratio' },
    { key: 'orbPct', label: 'ORB%' },
    { key: 'ftr', label: 'FTR' },
    { key: 'oppEFG', label: 'Opp eFG%' },
    { key: 'oppFG3Pct', label: 'Opp 3P%' },
    { key: 'dRtg', label: 'Def Rating' },
    { key: 'paintPct', label: 'Paint Pts%' },
    { key: 'toPtsRatio', label: 'Off TO Pts%' },
  ];

  var thead = '<tr><th>Metric</th><th>Min</th><th>P25</th><th>Median</th><th>Avg</th><th>P75</th><th>Max</th></tr>';
  var tbody = metrics.map(function(m) {
    var s = labStats(teams.map(function(t) { return t[m.key]; }));
    return '<tr><td>' + m.label + '</td>'
      + '<td>' + s.min + '</td><td>' + s.p25 + '</td><td>' + s.med + '</td>'
      + '<td>' + s.avg + '</td><td>' + s.p75 + '</td><td>' + s.max + '</td></tr>';
  }).join('');

  el.innerHTML = '<table class="labProfileTable"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
}

// ══════════════════════════════════════════════════════════════════════════════
// ── GEMINI DEEP ANALYSIS ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function labRunDeepAnalysis() {
  if (!_labAnalysisData || !_labAnalysisData.length) return;
  if (!_labDeepBtn || !_labDeepOutput) return;

  _labDeepBtn.disabled = true;
  _labDeepBtn.textContent = 'Analyzing\u2026';
  _labDeepOutput.innerHTML = '<div style="text-align:center;padding:24px"><div class="labSpinner"></div><div class="muted" style="margin-top:8px;font-size:12px">Running AI analysis on ' + _labAnalysisData.length + ' teams\u2026</div></div>';

  // Build the data payload for Gemini — now enriched with real statistical output
  var teamSummaries = _labAnalysisData.map(function(t) {
    var summary = {
      team: t.team, conference: t.conference,
      record: t.wins + '-' + t.losses, adjEM: t.adjEM, rank: t.rank,
      adjO: t.adjO, adjD: t.adjD, pace: t.pace,
      fourFactors: { eFG: t.eFG, toRatio: t.toRatio, orbPct: t.orbPct, ftr: t.ftr },
      shooting: { ts: t.ts, fgPct: t.fgPct, fg3Pct: t.fg3Pct, ftPct: t.ftPct, fg3Rate: t.fg3Rate },
      scoring: { paintPct: t.paintPct, toPtsRatio: t.toPtsRatio },
      defense: { oppEFG: t.oppEFG, dRtg: t.dRtg, oppTS: t.oppTS, oppFGPct: t.oppFGPct, oppFG3Pct: t.oppFG3Pct },
      cluster: t._clusterLabel || 'N/A',
      clusterDistance: t._clusterDist || 0,
      tourneyProb: t._tourneyProb || 0,
      archetypes: labArchetypeTags(t).map(function(tag) { return tag.t; })
    };

    // Add shot zones if available
    if (t._zones) {
      summary.shotZones = t._zones;
    }

    // Add PBP tendencies if available
    if (t._pbp) {
      summary.pbpTendencies = {
        gamesAnalyzed: t._pbp.gamesAnalyzed,
        overallFG: t._pbp.overallPct,
        zoneDistribution: t._pbp.zones,
        periodEfficiency: t._pbp.periods,
        clutch: t._pbp.clutch
      };
    }

    return summary;
  });

  // K-means cluster summary
  var clusterSummary = null;
  if (_labClusterData && _labClusterData.clusters) {
    clusterSummary = _labClusterData.clusters.map(function(cl) {
      return {
        label: cl.label,
        centroid: cl.centroid,
        teams: cl.members.map(function(m) { return m.team; })
      };
    });
  }

  // Regression summary
  var regressionSummary = null;
  if (_labRegressionData) {
    regressionSummary = {
      featureImportance: _labRegressionData.coefficients.map(function(c) {
        return { feature: c.feature, coefficient: c.coeff, importance: c.importance };
      }),
      teamScores: _labRegressionData.selectedScores
    };
  }

  var prompt = 'You are an NCAA basketball analytics expert. Analyze the following group of ' + _labAnalysisData.length + ' teams using the REAL STATISTICAL ENGINE OUTPUT below.\n\n'
    + 'TEAM DATA (with cluster assignments, tournament probability, shot zones, and play-by-play tendencies):\n'
    + JSON.stringify(teamSummaries, null, 2) + '\n\n';

  if (clusterSummary) {
    prompt += 'K-MEANS CLUSTERING RESULTS (k=' + _labClusterData.k + ', dimensions: ' + LAB_CLUSTER_DIMS.join(', ') + '):\n'
      + JSON.stringify(clusterSummary, null, 2) + '\n\n';
  }

  if (regressionSummary) {
    prompt += 'LOGISTIC REGRESSION (predicting tournament inclusion from full D1 population):\n'
      + JSON.stringify(regressionSummary, null, 2) + '\n\n';
  }

  prompt += 'Write a detailed analysis covering:\n'
    + '## Tournament DNA Profile\nWhat statistical profile defines this group? Use the regression coefficients to identify the most predictive features. Reference the cluster centroids for baseline thresholds.\n\n'
    + '## Archetype Clusters\nDescribe each k-means cluster: what playing style does it represent? Use centroid values to define the style. Which teams are prototypical (closest to centroid) vs. outliers (farthest)?\n\n'
    + '## Shot Zone & Tendency Analysis\nCompare shot zone distributions across clusters. Identify which teams are paint-dominant vs. perimeter-heavy. Reference play-by-play tendencies for period-by-period efficiency and clutch performance.\n\n'
    + '## Critical Success Factors\nRank the logistic regression features by predictive power. Explain what each coefficient means practically for tournament selection.\n\n'
    + '## Outliers & Matchup Implications\nWhich teams are statistical outliers within their cluster? What are the most dangerous matchup profiles for tournament opponents?\n\n'
    + '## Predictive Takeaways\nBased on regression coefficients and cluster profiles, what statistical benchmarks should scouts use to evaluate tournament viability?\n\n'
    + 'Use specific numbers from the data. Reference cluster assignments and regression probabilities. Be direct and analytical.';

  var isGuest = typeof authIsGuest === 'function' && authIsGuest();
  var useHeavy = _labDeepUseHeavyModel && !isGuest;
  var selectedModel = useHeavy ? 'gemini-3-flash-preview' : 'gemini-2.5-flash-lite';
  var maxTokens = useHeavy ? 8000 : 5000;
  var GEMINI_PROXY_URL = (typeof WORKER_URL !== 'undefined' ? WORKER_URL : 'https://hidden-salad-773b.bryanhkwan.workers.dev');

  fetch(GEMINI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: selectedModel,
      generationConfig: { maxOutputTokens: maxTokens },
      systemInstruction: { parts: [{ text: 'You are a college basketball analytics expert. You are given REAL statistical engine output including k-means clustering, logistic regression, shot zone breakdowns, and play-by-play analysis. Analyze only the structured data provided. Reference specific numbers, cluster assignments, and regression coefficients. Use markdown headers (##) and bullets. Be specific and analytical.' }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    var text = '';
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      text = data.candidates[0].content.parts.map(function(p) { return p.text || ''; }).join('');
    }
    if (!text) { _labDeepOutput.innerHTML = '<div class="muted" style="padding:16px">No response from AI.</div>'; return; }
    _labDeepOutput.innerHTML = labFmtDeepText(text);
    var dlBtn = document.getElementById('labDownloadBtn');
    if (dlBtn) dlBtn.style.display = '';
  })
  .catch(function(e) {
    _labDeepOutput.innerHTML = '<div class="muted" style="padding:16px">Error: ' + e.message + '</div>';
  })
  .finally(function() {
    _labDeepBtn.disabled = false;
    _labDeepBtn.textContent = 'Run AI Deep Analysis \u2192';
  });
}

// ── Format Deep Analysis text into section cards ────────────────────────────

function labFmtDeepText(text) {
  var lines = text.split('\n');
  var sections = [];
  var current = null;

  lines.forEach(function(line) {
    if (line.match(/^##\s+/)) {
      if (current) sections.push(current);
      current = { title: line.replace(/^##\s+/, '').trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      if (!sections.length && !current) {
        current = { title: 'Overview', lines: [line] };
      }
    }
  });
  if (current) sections.push(current);

  return sections.map(function(sec) {
    var body = sec.lines.join('\n')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^[-*]\s+/gm, '<li>')
      .replace(/^\d+\.\s+/gm, '<li>')
      .replace(/### (.+)/g, '<h4 style="margin:10px 0 4px;font-size:12px;font-weight:700">$1</h4>');

    body = body.replace(/((?:<li>.*\n?)+)/g, '<ul style="margin:4px 0 8px 16px;padding:0">$1</ul>');

    return '<div class="labDeepSection">'
      + '<h3>' + sec.title + '</h3>'
      + '<div class="labDeepBody">' + body + '</div>'
      + '</div>';
  }).join('');
}

// ── Class wrapper ───────────────────────────────────────────────────────────
var LabManager = function() {};
LabManager.prototype.init = function() { return initLabPage(); };
window.LabManager = new LabManager();
