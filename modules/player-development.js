// ============ PLAYER DEVELOPMENT MODULE ============
// Shot-work and tendency analysis using real shot chart and shooting data.
// Dependencies: config.js (URLS, clamp), data.js (safeNum, statPercentile, pos, bucketPosition,
//   scoreRow, currentWeights), shot-analytics.js (_saClassifyZone, _saDist, SA_BASELINE),
//   draft.js (draftProbability, draftGrade, draftRangeLabel), auth.js (authGetToken)

(function () {
  'use strict';

  // ── Zone baselines (NCAA averages by zone, MBB/WBB) ────────────────────────
  var ZONE_BASELINE = {
    MBB: { ra: 0.63, paint: 0.38, mid: 0.36, corner3: 0.37, atb3: 0.345 },
    WBB: { ra: 0.58, paint: 0.34, mid: 0.32, corner3: 0.33, atb3: 0.31 }
  };

  var ZONE_LABELS = { ra: 'Restricted Area', paint: 'Paint (non-RA)', mid: 'Mid-Range', corner3: 'Corner 3', atb3: 'Above-Break 3' };

  // Ideal shot distribution by position archetype (volume share)
  var IDEAL_DISTRIBUTION = {
    guard:  { ra: 0.22, paint: 0.08, mid: 0.10, corner3: 0.14, atb3: 0.46 },
    wing:   { ra: 0.25, paint: 0.07, mid: 0.08, corner3: 0.16, atb3: 0.44 },
    big:    { ra: 0.40, paint: 0.18, mid: 0.12, corner3: 0.08, atb3: 0.22 },
    default:{ ra: 0.28, paint: 0.10, mid: 0.10, corner3: 0.13, atb3: 0.39 }
  };

  // ── Simulator packages (shot-work focused) ─────────────────────────────────
  var DEV_SIM_PACKAGES = {
    range_extension: {
      label: '+Range Extension',
      desc: 'Extend effective shooting range — more 3PA, better catch-and-shoot',
      deltas: { '3P%': 0.03, 'eFG%': 0.02, '3PM': 0.5 }
    },
    finishing: {
      label: '+Finishing Package',
      desc: 'Improve at-rim finishing, floaters, and contested layups',
      deltas: { 'eFG%': 0.018, '2P%': 0.03, 'PPG': 1.5 }
    },
    ft_drawing: {
      label: '+Free Throw Drawing',
      desc: 'Attack the basket aggressively to draw fouls and get to the line',
      deltas: { 'FT%': 0.04, 'PPG': 1.0, 'FTA': 1.2 }
    },
    catch_and_shoot: {
      label: '+Catch & Shoot',
      desc: 'Become a reliable spot-up threat off ball movement',
      deltas: { '3P%': 0.035, 'eFG%': 0.02 }
    },
    playmaking: {
      label: '+Playmaking Upgrade',
      desc: 'Improve passing reads, reduce turnovers, create for others',
      deltas: { 'APG': 1.2, 'A/TO': 0.35, 'TOPG': -0.5 }
    },
    defense: {
      label: '+Defensive Identity',
      desc: 'Active hands, better rotations, improved on-ball pressure',
      deltas: { 'SPG': 0.35, 'DRtg': -2.5, 'BPG': 0.15 }
    }
  };

  var DEV_CHECKPOINT_WEEKS = [2, 6, 12];

  // ── Zone efficiency analysis ───────────────────────────────────────────────
  function analyzeZones(shots, lg) {
    lg = lg || (typeof league !== 'undefined' ? league : 'MBB');
    var baselines = ZONE_BASELINE[lg] || ZONE_BASELINE.MBB;
    var zones = {};
    var keys = ['ra', 'paint', 'mid', 'corner3', 'atb3'];
    for (var i = 0; i < keys.length; i++) zones[keys[i]] = { made: 0, att: 0 };

    // Normalize through the same pipeline as the shot chart
    var pts = typeof _saNormalize === 'function' ? _saNormalize(shots) : shots;
    for (var j = 0; j < pts.length; j++) {
      var p = pts[j];
      var sx = p.sx != null ? p.sx : (Number(p.x || 0) + 200);
      var sy = p.sy != null ? p.sy : (415 - Number(p.y || 0));
      var z = typeof _saClassifyZone === 'function' ? _saClassifyZone(sx, sy) : 'mid';
      if (!zones[z]) zones[z] = { made: 0, att: 0 };
      zones[z].att++;
      if (p.made) zones[z].made++;
    }

    var total = pts.length || 1;
    var result = [];
    for (var k = 0; k < keys.length; k++) {
      var zk = keys[k];
      var z = zones[zk];
      var fg = z.att > 0 ? z.made / z.att : null;
      var volShare = z.att / total;
      var baseline = baselines[zk] || 0.35;
      var vsNcaa = fg !== null ? fg - baseline : null;
      result.push({
        zone: zk,
        label: ZONE_LABELS[zk],
        made: z.made,
        att: z.att,
        fg: fg,
        volShare: volShare,
        baseline: baseline,
        vsNcaa: vsNcaa
      });
    }
    return result;
  }

  // ── Shot type mix analysis (from loadShootingForTeam data) ─────────────────
  function analyzeShotMix(shootingRow) {
    if (!shootingRow) return null;
    var dunks = Number(shootingRow.dunks) || 0;
    var layups = Number(shootingRow.layups) || 0;
    var twoJ = Number(shootingRow.twoPointJumpers) || 0;
    var threeJ = Number(shootingRow.threePointJumpers) || 0;
    var fta = Number(shootingRow.freeThrowAttempts || shootingRow.fta) || 0;
    var totalShots = dunks + layups + twoJ + threeJ;
    if (totalShots === 0) return null;
    return {
      dunks: { count: dunks, share: dunks / totalShots },
      layups: { count: layups, share: layups / totalShots },
      midrange: { count: twoJ, share: twoJ / totalShots },
      threes: { count: threeJ, share: threeJ / totalShots },
      ftRate: fta > 0 ? fta / totalShots : 0,
      totalShots: totalShots
    };
  }

  // ── Tendency analysis ──────────────────────────────────────────────────────
  function analyzeTendencies(zoneData, shotMix, r, posGroup) {
    var flags = [];
    if (!zoneData || !zoneData.length) return flags;

    var zoneMap = {};
    for (var i = 0; i < zoneData.length; i++) zoneMap[zoneData[i].zone] = zoneData[i];

    var ideal = IDEAL_DISTRIBUTION[posGroup] || IDEAL_DISTRIBUTION.default;

    // High-volume low-efficiency zones (shot selection issue)
    for (var j = 0; j < zoneData.length; j++) {
      var z = zoneData[j];
      if (z.att < 5) continue;
      if (z.vsNcaa !== null && z.vsNcaa < -0.04 && z.volShare > 0.12) {
        flags.push({
          type: 'shot_selection',
          severity: 'high',
          zone: z.zone,
          label: z.label + ': high volume (' + (z.volShare * 100).toFixed(0) + '%) at below-average efficiency (' + (z.fg * 100).toFixed(1) + '% vs ' + (z.baseline * 100).toFixed(1) + '% NCAA avg)'
        });
      }
    }

    // Untapped range — low volume but efficient
    for (var k = 0; k < zoneData.length; k++) {
      var zz = zoneData[k];
      if (zz.att < 3) continue;
      var idealShare = ideal[zz.zone] || 0;
      if (zz.vsNcaa !== null && zz.vsNcaa > 0.02 && zz.volShare < idealShare * 0.5) {
        flags.push({
          type: 'untapped_range',
          severity: 'medium',
          zone: zz.zone,
          label: zz.label + ': shoots well (' + (zz.fg * 100).toFixed(1) + '%) but low volume (' + (zz.volShare * 100).toFixed(0) + '% vs ' + (idealShare * 100).toFixed(0) + '% ideal for position)'
        });
      }
    }

    // Spatial bias — left vs right
    // (would need raw x coords; skip if no shot data access at this point)

    // Mid-range heavy when league trends say convert to threes
    var midZ = zoneMap.mid;
    var atb = zoneMap.atb3;
    var corn = zoneMap.corner3;
    if (midZ && midZ.volShare > 0.18 && atb && corn) {
      var threeShare = (atb.volShare || 0) + (corn.volShare || 0);
      if (threeShare < 0.35) {
        flags.push({
          type: 'conversion_opportunity',
          severity: 'medium',
          zone: 'mid',
          label: 'Mid-range heavy (' + (midZ.volShare * 100).toFixed(0) + '% of shots) with limited 3PT volume (' + (threeShare * 100).toFixed(0) + '%) — consider converting mid-range to above-break threes'
        });
      }
    }

    // Strong at rim but rarely draws fouls
    var ra = zoneMap.ra;
    if (ra && ra.att > 10 && ra.vsNcaa > 0.03 && shotMix && shotMix.ftRate < 0.25) {
      flags.push({
        type: 'foul_drawing',
        severity: 'low',
        zone: 'ra',
        label: 'Efficient at the rim (' + (ra.fg * 100).toFixed(1) + '%) but low FT rate (' + (shotMix.ftRate * 100).toFixed(0) + '%) — could draw more fouls with aggressive finishes'
      });
    }

    // Corner 3 avoidance
    if (corn && corn.att < 5 && posGroup !== 'big') {
      flags.push({
        type: 'corner3_avoidance',
        severity: 'low',
        zone: 'corner3',
        label: 'Rarely shoots corner threes (' + corn.att + ' attempts) — one of the most efficient shots in basketball'
      });
    }

    return flags;
  }

  // ── Play-type recommendations based on analysis ────────────────────────────
  function generateRecommendations(zoneData, tendencies, shotMix, r, posGroup) {
    var recs = [];
    var zoneMap = {};
    for (var i = 0; i < zoneData.length; i++) zoneMap[zoneData[i].zone] = zoneData[i];

    for (var j = 0; j < tendencies.length; j++) {
      var t = tendencies[j];
      switch (t.type) {
        case 'shot_selection':
          if (t.zone === 'mid') {
            recs.push({ priority: 1, title: 'Convert mid-range to catch-and-shoot 3s', detail: 'Practice spotting up on the arc instead of settling for pull-up mid-range jumpers. Use shot fake + one dribble pull-up from behind the line.' });
          } else if (t.zone === 'atb3') {
            recs.push({ priority: 1, title: 'Improve 3PT shot mechanics', detail: 'Focus on shooting form, release point consistency, and footwork on catch-and-shoot reps. Add 200+ 3PT makes per practice week.' });
          } else if (t.zone === 'paint') {
            recs.push({ priority: 2, title: 'Develop floater/runner game in paint', detail: 'When rim is contested, use a floater or runner instead of forcing through contact. Practice off-hand finishing.' });
          }
          break;
        case 'untapped_range':
          if (t.zone === 'corner3' || t.zone === 'atb3') {
            recs.push({ priority: 1, title: 'Increase 3PT volume from ' + ZONE_LABELS[t.zone], detail: 'Already shooting well — need to seek these looks more aggressively. Run off screens, spot up in transition, relocate after drive-and-kick.' });
          } else if (t.zone === 'ra') {
            recs.push({ priority: 2, title: 'Attack the basket more', detail: 'Efficient at the rim but not getting there enough. Use ball screens, dribble penetration, and cuts to create rim attempts.' });
          }
          break;
        case 'conversion_opportunity':
          recs.push({ priority: 1, title: 'Extend range: mid-range to 3PT', detail: 'Take one step back on pull-up jumpers to get behind the arc. The expected value of a 33% three equals a 50% two.' });
          break;
        case 'foul_drawing':
          recs.push({ priority: 2, title: 'Draw more fouls at the rim', detail: 'Initiate contact on drives, use pump fakes to get defenders in the air, and finish through contact instead of avoiding it.' });
          break;
        case 'corner3_avoidance':
          recs.push({ priority: 2, title: 'Add corner 3 to shot diet', detail: 'The corner three is the shortest three-point shot. Practice catch-and-shoot from both corners in transition and half-court sets.' });
          break;
      }
    }

    // Percentile-based supplemental recs
    var fg3pct = safeNum(r['_pct_3P%']) || safeNum(r['_pct_3P_pct']);
    var fgEfg = safeNum(r['_pct_eFG%']) || safeNum(r['_pct_eFG_pct']);
    var apgPct = safeNum(r['_pct_APG']);
    var spgPct = safeNum(r['_pct_SPG']);
    var ftPct = safeNum(r['_pct_FT%']) || safeNum(r['_pct_FT_pct']);

    if (fg3pct !== null && fg3pct < 0.3 && !recs.find(function(x) { return x.title.indexOf('3PT') >= 0; })) {
      recs.push({ priority: 2, title: 'Address 3PT shooting (bottom 30th percentile)', detail: 'Shooting mechanics review — check balance, release point, and follow-through. Start with form shooting drills close to basket and work out.' });
    }
    if (ftPct !== null && ftPct < 0.35) {
      recs.push({ priority: 2, title: 'Free throw improvement program', detail: 'Below 35th percentile in FT%. Implement a daily routine: 50 makes before/after each practice with consistent pre-shot routine.' });
    }
    if (apgPct !== null && apgPct > 0.7 && posGroup === 'guard') {
      recs.push({ priority: 3, title: 'Leverage playmaking as a strength', detail: 'Top-tier passer — build plays that use drive-and-kick, pick-and-roll reads, and secondary break creation.' });
    }

    recs.sort(function(a, b) { return a.priority - b.priority; });
    return recs;
  }

  // ── Build full analysis (main entry point) ─────────────────────────────────
  function devBuildAnalysis(r, shots, shootingRow) {
    var lg = typeof league !== 'undefined' ? league : 'MBB';
    var posRaw = (r.Pos || r.Position || '').toString();
    var posGroup = 'default';
    if (/PG|SG|G/i.test(posRaw)) posGroup = 'guard';
    else if (/SF|SG|GF|F/i.test(posRaw)) posGroup = 'wing';
    else if (/PF|C|FC/i.test(posRaw)) posGroup = 'big';

    var zoneData = shots && shots.length > 0 ? analyzeZones(shots, lg) : [];
    var shotMix = analyzeShotMix(shootingRow);
    var tendencies = analyzeTendencies(zoneData, shotMix, r, posGroup);
    var recommendations = generateRecommendations(zoneData, tendencies, shotMix, r, posGroup);

    return {
      league: lg,
      posGroup: posGroup,
      zoneData: zoneData,
      shotMix: shotMix,
      tendencies: tendencies,
      recommendations: recommendations,
      totalShots: zoneData.reduce(function(sum, z) { return sum + z.att; }, 0),
      hasShotData: shots && shots.length > 5
    };
  }

  // ── Simulator ──────────────────────────────────────────────────────────────
  function _devPosGroup(r) {
    return typeof bucketPosition === 'function' && bucketPosition(r && (r.Pos || r.Position)) === 'Bigs' ? 'Bigs' : 'Guards';
  }

  function devScoreRowForPlayer(r) {
    var saved = pos;
    try {
      pos = _devPosGroup(r);
      return scoreRow(r);
    } finally {
      pos = saved;
    }
  }

  function devApplyDeltas(r, deltas) {
    var copy = Object.assign({}, r);
    for (var k in deltas) {
      if (!Object.prototype.hasOwnProperty.call(deltas, k)) continue;
      var base = safeNum(copy[k]);
      if (base === null) continue;
      copy[k] = base + deltas[k];
    }
    return copy;
  }

  function devSimulatePackage(r, packageId) {
    var pkg = DEV_SIM_PACKAGES[packageId];
    if (!pkg) return null;
    var beforeScore = devScoreRowForPlayer(r);
    var afterRow = devApplyDeltas(r, pkg.deltas);
    var afterScore = devScoreRowForPlayer(afterRow);
    var beforeDraft = typeof draftProbability === 'function' ? draftProbability(r) : null;
    var afterDraft = typeof draftProbability === 'function' ? draftProbability(afterRow) : null;
    var bid = safeNum(r.ActualValuation_calc);
    var scoreDelta = afterScore - beforeScore;
    var estBid = null;
    if (Number.isFinite(bid) && Number.isFinite(beforeScore) && Math.abs(beforeScore) > 1e-6) {
      estBid = bid * (1 + 0.4 * (scoreDelta / Math.max(0.01, Math.abs(beforeScore))));
    }
    return {
      packageId: packageId,
      packageLabel: pkg.label,
      packageDesc: pkg.desc,
      deltas: pkg.deltas,
      beforeScore: beforeScore,
      afterScore: afterScore,
      beforeDraft: beforeDraft,
      afterDraft: afterDraft,
      draftGradeBefore: typeof draftGrade === 'function' ? draftGrade(beforeDraft) : '—',
      draftGradeAfter: typeof draftGrade === 'function' ? draftGrade(afterDraft) : '—',
      rangeBefore: typeof draftRangeLabel === 'function' ? draftRangeLabel(beforeDraft) : '—',
      rangeAfter: typeof draftRangeLabel === 'function' ? draftRangeLabel(afterDraft) : '—',
      estimatedBidAfter: estBid
    };
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  var DEV_LS_PREFIX = 'dev_plan_v2_';

  function devPlanStorageKey(playerKey, league, season) {
    return DEV_LS_PREFIX + league + '_' + season + '_' + encodeURIComponent(playerKey);
  }

  function devPlanLoadLocal(playerKey, league, season) {
    try {
      var raw = localStorage.getItem(devPlanStorageKey(playerKey, league, season));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function devPlanSaveLocal(playerKey, league, season, payload) {
    try {
      localStorage.setItem(devPlanStorageKey(playerKey, league, season), JSON.stringify(payload));
      return true;
    } catch (e) { return false; }
  }

  async function devPlanFetchRemote(method, playerKey, league, season, body) {
    var token = typeof authGetToken === 'function' ? authGetToken() : null;
    var url = URLS.WORKER + '/api/development-plans?player_key=' + encodeURIComponent(playerKey)
      + '&league=' + encodeURIComponent(league) + '&season=' + encodeURIComponent(String(season));
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var res = await fetch(url, {
      method: method, credentials: 'include', headers: headers,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return method === 'DELETE' ? null : res.json();
  }

  async function devPlanLoad(playerKey, league, season) {
    try {
      var data = await devPlanFetchRemote('GET', playerKey, league, season);
      if (data && data.payload_json) {
        return typeof data.payload_json === 'string' ? JSON.parse(data.payload_json) : data.payload_json;
      }
      if (data && data.payload) return data.payload;
    } catch (e) {}
    return devPlanLoadLocal(playerKey, league, season);
  }

  async function devPlanSave(playerKey, league, season, payload) {
    devPlanSaveLocal(playerKey, league, season, payload);
    try {
      await devPlanFetchRemote('POST', playerKey, league, season, { payload_json: JSON.stringify(payload) });
    } catch (e) {}
  }

  // ── AI plan generation (shot/zone/tendency data) ───────────────────────────
  async function devGenerateAIPlan(r, analysis, simResult, coachNotes) {
    var payload = {
      player: { name: r.Player, team: r.Team, conference: r.Conference || r.Conf, pos: r.Pos || r.Position },
      league: analysis.league,
      positionGroup: analysis.posGroup,
      shotData: {
        totalShots: analysis.totalShots,
        zones: analysis.zoneData.map(function(z) {
          return { zone: z.label, attempts: z.att, fgPct: z.fg !== null ? +(z.fg * 100).toFixed(1) : null, volumeShare: +(z.volShare * 100).toFixed(1), ncaaAvg: +(z.baseline * 100).toFixed(1), vsNcaa: z.vsNcaa !== null ? +(z.vsNcaa * 100).toFixed(1) : null };
        }),
        shotMix: analysis.shotMix
      },
      tendencies: analysis.tendencies.map(function(t) { return { type: t.type, severity: t.severity, description: t.label }; }),
      recommendations: analysis.recommendations.map(function(r) { return { priority: r.priority, title: r.title, detail: r.detail }; }),
      simulator: simResult ? { package: simResult.packageLabel, perfBefore: simResult.beforeScore, perfAfter: simResult.afterScore, draftBefore: simResult.beforeDraft, draftAfter: simResult.afterDraft } : null,
      coachNotes: coachNotes || ''
    };

    var prompt = 'You are an NCAA basketball player development coach reviewing shot data for a real player. '
      + 'Use ONLY the structured data below. Do not invent statistics.\n\n'
      + JSON.stringify(payload, null, 2)
      + '\n\nProvide a development plan in markdown:\n'
      + '## Shot Work Focus (3-5 specific drills/exercises tied to the zone data)\n'
      + '## Shot Selection Adjustments ("instead of X, try Y" — reference zone %s)\n'
      + '## Play-Type Suggestions (based on tendencies and strengths)\n'
      + '## Checkpoints\n'
      + '- **2-week**: Measurable targets (e.g., "increase corner 3 attempts from X% to Y%")\n'
      + '- **6-week**: Intermediate goals with expected efficiency changes\n'
      + '- **12-week**: Season-end development targets\n'
      + '## Value Impact\n'
      + 'How these changes affect draft stock / pro upside.\n\n'
      + 'Be specific. Reference actual zone percentages and volume from the data. Use coaching language.';

    var res = await fetch(URLS.GEMINI_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-2.5-flash-lite',
        generationConfig: { maxOutputTokens: 4096, temperature: 0.45 },
        systemInstruction: {
          parts: [{ text: 'You are a college basketball player development specialist. Output structured markdown. Use the provided shot/zone/tendency JSON as ground truth. Every recommendation must reference specific data points from the analysis.' }]
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    });
    var data = await res.json();
    if (data.error) throw new Error((data.error && data.error.message) || 'AI error');
    var parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    var text = parts ? parts.map(function(p) { return p.text || ''; }).join('') : '';
    if (!text) throw new Error('Empty AI response');
    return text;
  }

  // ── UI rendering ───────────────────────────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _fgColor(vsNcaa) {
    if (vsNcaa === null) return 'var(--muted)';
    if (vsNcaa > 0.03) return '#4ade80';
    if (vsNcaa > -0.02) return 'var(--text)';
    if (vsNcaa > -0.06) return '#fbbf24';
    return '#f87171';
  }

  function _sevBadge(severity) {
    var colors = { high: '#f87171', medium: '#fbbf24', low: 'var(--muted)' };
    return '<span class="devSevBadge" style="color:' + (colors[severity] || 'var(--muted)') + '">' + _esc(severity) + '</span>';
  }

  function renderDevelopmentPanel(r, shots, shootingRow) {
    var el = document.getElementById('mDevelopmentPlan');
    if (!el) return;

    var analysis = devBuildAnalysis(r, shots, shootingRow);
    var playerKey = typeof tbPlayerKey === 'function' ? tbPlayerKey(r) : ((r.Player || '') + '||' + (r.Team || ''));
    var season = typeof _currentDataSeason !== 'undefined' ? String(_currentDataSeason) : '2026';
    var lg = analysis.league;

    // Zone efficiency table
    var zoneHtml = '';
    if (analysis.hasShotData) {
      zoneHtml = '<h4 class="devPlanSubhead">Zone Efficiency</h4>'
        + '<table class="devZoneTable"><thead><tr><th>Zone</th><th>FGA</th><th>FG%</th><th>Vol%</th><th>NCAA Avg</th><th>vs NCAA</th></tr></thead><tbody>';
      for (var i = 0; i < analysis.zoneData.length; i++) {
        var z = analysis.zoneData[i];
        zoneHtml += '<tr>'
          + '<td>' + _esc(z.label) + '</td>'
          + '<td>' + z.att + '</td>'
          + '<td>' + (z.fg !== null ? (z.fg * 100).toFixed(1) + '%' : '—') + '</td>'
          + '<td>' + (z.volShare * 100).toFixed(1) + '%</td>'
          + '<td>' + (z.baseline * 100).toFixed(1) + '%</td>'
          + '<td style="color:' + _fgColor(z.vsNcaa) + ';font-weight:700">' + (z.vsNcaa !== null ? (z.vsNcaa > 0 ? '+' : '') + (z.vsNcaa * 100).toFixed(1) + '%' : '—') + '</td>'
          + '</tr>';
      }
      zoneHtml += '</tbody></table>';
    } else {
      zoneHtml = '<div class="muted" style="font-size:12px;margin-bottom:12px">No shot location data available — recommendations are based on percentile stats only.</div>';
    }

    // Tendencies
    var tendHtml = '';
    if (analysis.tendencies.length) {
      tendHtml = '<h4 class="devPlanSubhead">Tendencies</h4><div class="devTendList">';
      for (var t = 0; t < analysis.tendencies.length; t++) {
        tendHtml += '<div class="devTendItem">' + _sevBadge(analysis.tendencies[t].severity) + ' ' + _esc(analysis.tendencies[t].label) + '</div>';
      }
      tendHtml += '</div>';
    }

    // Recommendations
    var recHtml = '';
    if (analysis.recommendations.length) {
      recHtml = '<h4 class="devPlanSubhead">Recommendations</h4>';
      for (var rr = 0; rr < analysis.recommendations.length; rr++) {
        var rec = analysis.recommendations[rr];
        recHtml += '<div class="devRecCard">'
          + '<div class="devRecTitle"><span class="devRecPriority">P' + rec.priority + '</span> ' + _esc(rec.title) + '</div>'
          + '<div class="devRecDetail">' + _esc(rec.detail) + '</div>'
          + '</div>';
      }
    }

    // Shot mix summary
    var mixHtml = '';
    if (analysis.shotMix) {
      var m = analysis.shotMix;
      mixHtml = '<h4 class="devPlanSubhead">Shot Type Mix</h4>'
        + '<div class="devMixRow">'
        + '<div class="devMixItem"><div class="devMixVal">' + (m.dunks.share * 100).toFixed(0) + '%</div><div class="devMixLabel">Dunks</div></div>'
        + '<div class="devMixItem"><div class="devMixVal">' + (m.layups.share * 100).toFixed(0) + '%</div><div class="devMixLabel">Layups</div></div>'
        + '<div class="devMixItem"><div class="devMixVal">' + (m.midrange.share * 100).toFixed(0) + '%</div><div class="devMixLabel">Mid-Range</div></div>'
        + '<div class="devMixItem"><div class="devMixVal">' + (m.threes.share * 100).toFixed(0) + '%</div><div class="devMixLabel">Threes</div></div>'
        + '<div class="devMixItem"><div class="devMixVal">' + (m.ftRate * 100).toFixed(0) + '%</div><div class="devMixLabel">FT Rate</div></div>'
        + '</div>';
    }

    // Simulator
    var simSelectId = 'devSimPackageSelect';
    var pkgOptions = Object.keys(DEV_SIM_PACKAGES).map(function(k) {
      return '<option value="' + k + '">' + _esc(DEV_SIM_PACKAGES[k].label) + '</option>';
    }).join('');

    el.innerHTML =
      '<div class="devPlanToolbar">'
      + '<span class="pill">' + analysis.totalShots + ' shots analyzed</span>'
      + '<button type="button" class="secondary" id="devPlanSaveBtn">Save plan</button>'
      + '<button type="button" class="secondary" id="devAiPlanBtn">Generate AI Plan</button>'
      + '</div>'
      + zoneHtml
      + mixHtml
      + tendHtml
      + recHtml
      + '<div class="devSimPanel">'
      + '<h4 class="devPlanSubhead">Upside Simulator</h4>'
      + '<div class="devSimRow">'
      + '<select id="' + simSelectId + '">' + pkgOptions + '</select>'
      + '<button type="button" class="primary" id="devSimRunBtn">Simulate</button>'
      + '</div>'
      + '<div id="devSimOut" class="devSimOut"></div>'
      + '</div>'
      + '<div class="devCoachNotes">'
      + '<label for="devCoachNotesInput">Coach notes</label>'
      + '<textarea id="devCoachNotesInput" rows="3" placeholder="Film notes, role context, practice emphasis…"></textarea>'
      + '</div>'
      + '<div id="devAiOut" class="devAiOut"></div>';

    // Wire simulator
    var currentSimWrap = { result: null };
    function runSim() {
      var sel = document.getElementById(simSelectId);
      var pid = sel ? sel.value : 'range_extension';
      var result = devSimulatePackage(r, pid);
      var out = document.getElementById('devSimOut');
      if (!out || !result) return;
      currentSimWrap.result = result;
      var bidLine = '';
      if (Number.isFinite(result.estimatedBidAfter) && Number.isFinite(safeNum(r.ActualValuation_calc))) {
        bidLine = '<div>Est. valuation: <b>' + (typeof fmtMoney === 'function' ? fmtMoney(result.estimatedBidAfter) : result.estimatedBidAfter) + '</b></div>';
      }
      out.innerHTML =
        '<div><b>' + _esc(result.packageLabel) + '</b> <span class="muted" style="font-size:11px">' + _esc(result.packageDesc) + '</span></div>'
        + '<div>Perf score: <b>' + result.beforeScore.toFixed(2) + '</b> → <b>' + result.afterScore.toFixed(2) + '</b></div>'
        + '<div>Draft model: <b>' + (result.beforeDraft != null ? (result.beforeDraft * 100).toFixed(1) + '%' : '—') + '</b> (' + _esc(result.rangeBefore) + ') → <b>' + (result.afterDraft != null ? (result.afterDraft * 100).toFixed(1) + '%' : '—') + '</b> (' + _esc(result.rangeAfter) + ')</div>'
        + bidLine;
    }

    var simBtn = document.getElementById('devSimRunBtn');
    if (simBtn) simBtn.addEventListener('click', runSim);
    runSim();

    // Wire save
    var saveBtn = document.getElementById('devPlanSaveBtn');
    if (saveBtn) saveBtn.addEventListener('click', function() {
      var notes = (document.getElementById('devCoachNotesInput') || {}).value || '';
      var payload = {
        savedAt: new Date().toISOString(),
        analysis: analysis,
        coachNotes: notes,
        lastSim: currentSimWrap.result
      };
      devPlanSave(playerKey, lg, season, payload).then(function() {
        saveBtn.textContent = 'Saved!';
        setTimeout(function() { saveBtn.textContent = 'Save plan'; }, 2000);
      }).catch(function() {
        saveBtn.textContent = 'Saved locally';
        setTimeout(function() { saveBtn.textContent = 'Save plan'; }, 2000);
      });
    });

    // Wire AI generation
    var aiBtn = document.getElementById('devAiPlanBtn');
    if (aiBtn) aiBtn.addEventListener('click', function() {
      var out = document.getElementById('devAiOut');
      var notes = (document.getElementById('devCoachNotesInput') || {}).value || '';
      var sim = currentSimWrap.result || devSimulatePackage(r, (document.getElementById(simSelectId) || {}).value || 'range_extension');
      aiBtn.disabled = true;
      aiBtn.textContent = 'Generating…';
      if (out) out.innerHTML = '<div class="muted">Generating practice plan…</div>';
      devGenerateAIPlan(r, analysis, sim, notes).then(function(md) {
        if (out) out.innerHTML = '<div class="devAiMarkdown">' + _esc(md).replace(/\n/g, '<br>') + '</div>';
      }).catch(function(e) {
        if (out) out.innerHTML = '<div class="muted">AI error: ' + _esc(e.message) + '</div>';
      }).finally(function() {
        aiBtn.disabled = false;
        aiBtn.textContent = 'Generate AI Plan';
      });
    });

    // Load saved notes
    devPlanLoad(playerKey, lg, season).then(function(saved) {
      if (!saved) return;
      var ta = document.getElementById('devCoachNotesInput');
      if (ta && saved.coachNotes) ta.value = saved.coachNotes;
    });
  }

  window.PlayerDevelopment = {
    DEV_SIM_PACKAGES: DEV_SIM_PACKAGES,
    DEV_CHECKPOINT_WEEKS: DEV_CHECKPOINT_WEEKS,
    ZONE_BASELINE: ZONE_BASELINE,
    analyzeZones: analyzeZones,
    analyzeShotMix: analyzeShotMix,
    analyzeTendencies: analyzeTendencies,
    buildAnalysis: devBuildAnalysis,
    simulatePackage: devSimulatePackage,
    scoreRowForPlayer: devScoreRowForPlayer,
    planLoad: devPlanLoad,
    planSave: devPlanSave,
    generateAIPlan: devGenerateAIPlan,
    renderPanel: renderDevelopmentPanel
  };
})();
