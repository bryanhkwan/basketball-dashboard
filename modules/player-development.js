// ============ PLAYER DEVELOPMENT MODULE ============
// Deterministic development priorities, upside simulator, persistence, AI weekly plan.
// Dependencies: config.js (URLS, clamp), data.js (scoreRow, pos, bucketPosition, currentWeights,
//   safeNum, statPercentile), draft.js (draftProbability, draftGrade, draftRangeLabel, DRAFT_IMPORTANCE),
//   auth.js (authGetToken), profile.js calls renderDevelopmentPanel

(function () {
  'use strict';

  // ── Taxonomy: categories, benchmark percentiles, stat groups ─────────────
  var DEV_CHECKPOINT_WEEKS = [2, 6, 12];

  var DEV_CATEGORIES = [
    {
      id: 'shooting',
      label: 'Perimeter shooting',
      stats: ['3P%', 'eFG%', 'FT%'],
      targetPct: 0.72,
      leverage: 1.15,
      draftStats: ['eFG%']
    },
    {
      id: 'finishing',
      label: 'Finishing & shot quality',
      stats: ['eFG%', '2P%', 'PPG'],
      targetPct: 0.68,
      leverage: 1.0,
      draftStats: ['eFG%', 'PPG']
    },
    {
      id: 'playmaking',
      label: 'Playmaking & decisions',
      stats: ['APG', 'A/TO', 'TOPG'],
      targetPct: 0.7,
      leverage: 1.1,
      draftStats: ['APG']
    },
    {
      id: 'defense_perimeter',
      label: 'Perimeter defense',
      stats: ['SPG', 'DRtg', 'DR%'],
      targetPct: 0.65,
      leverage: 0.95,
      draftStats: ['SPG']
    },
    {
      id: 'interior',
      label: 'Interior / rim',
      stats: ['BPG', 'RPG', 'OR%'],
      targetPct: 0.65,
      leverage: 1.0,
      draftStats: ['BPG', 'RPG']
    },
    {
      id: 'efficiency',
      label: 'Overall efficiency',
      stats: ['WS/40', 'BPM', 'PER'],
      targetPct: 0.75,
      leverage: 1.2,
      draftStats: ['WS/40']
    }
  ];

  var DEV_SIM_PACKAGES = {
    shooting: { label: '+Shooting package', deltas: { '3P%': 0.025, 'eFG%': 0.02, 'FT%': 0.04 } },
    playmaking: { label: '+Playmaking package', deltas: { 'APG': 1.2, 'A/TO': 0.35 } },
    defense: { label: '+Defense package', deltas: { 'SPG': 0.35, 'DRtg': -2.5 } },
    big: { label: '+Big-man package', deltas: { 'BPG': 0.4, 'RPG': 1.0, 'eFG%': 0.015 } },
    efficiency: { label: '+Efficiency package', deltas: { 'WS/40': 0.035, 'BPM': 0.8, 'eFG%': 0.015 } }
  };

  function _devPlayerPosGroup(r) {
    return bucketPosition(r && (r.Pos || r.Position)) === 'Bigs' ? 'Bigs' : 'Guards';
  }

  function devScoreRowForPlayer(r) {
    var saved = pos;
    try {
      pos = _devPlayerPosGroup(r);
      return scoreRow(r);
    } finally {
      pos = saved;
    }
  }

  function _avgPercentile(r, stats) {
    var sum = 0;
    var n = 0;
    for (var i = 0; i < stats.length; i++) {
      var st = stats[i];
      var cached = r['_pct_' + st];
      var p = Number.isFinite(cached) ? cached : null;
      if (p == null) {
        var v = safeNum(r[st]);
        if (v !== null && typeof statPercentile === 'function') {
          p = statPercentile(st, v);
        }
      }
      if (Number.isFinite(p)) {
        sum += p;
        n++;
      }
    }
    return n ? sum / n : null;
  }

  function _draftLeverageForCategory(cat) {
    var imp = (typeof _getImportance === 'function' ? _getImportance() : (typeof DRAFT_IMPORTANCE !== 'undefined' ? DRAFT_IMPORTANCE : {}));
    var w = 0.1;
    for (var i = 0; i < cat.draftStats.length; i++) {
      var k = cat.draftStats[i];
      if (imp[k] != null) w = Math.max(w, imp[k]);
    }
    return w;
  }

  function devBuildDevelopmentPlan(r) {
    var priorities = [];
    for (var c = 0; c < DEV_CATEGORIES.length; c++) {
      var cat = DEV_CATEGORIES[c];
      var avgP = _avgPercentile(r, cat.stats);
      if (avgP == null) continue;
      var gap = Math.max(0, cat.targetPct - avgP);
      var urgency = avgP < 0.35 ? 1.25 : avgP < 0.5 ? 1.1 : 1;
      var dLev = _draftLeverageForCategory(cat);
      var score = gap * cat.leverage * dLev * urgency * 100;
      priorities.push({
        id: cat.id,
        label: cat.label,
        avgPercentile: avgP,
        targetPercentile: cat.targetPct,
        gap: gap,
        score: score,
        stats: cat.stats.slice(),
        evidence: cat.stats.map(function (st) {
          var pc = r['_pct_' + st];
          var p = Number.isFinite(pc) ? pc : _avgPercentile(r, [st]);
          return { stat: st, raw: r[st], percentile: p };
        })
      });
    }
    priorities.sort(function (a, b) { return b.score - a.score; });

    var top3 = priorities.slice(0, 3);
    var measurableTargets = [];
    for (var t = 0; t < top3.length; t++) {
      var p = top3[t];
      measurableTargets.push({
        categoryId: p.id,
        label: 'Move ' + p.label + ' toward ~' + Math.round(p.targetPercentile * 100) + 'th percentile profile',
        kpis: p.evidence.slice(0, 3).map(function (e) {
          return e.stat + (e.percentile != null ? ' (' + Math.round(e.percentile * 100) + 'th pct)' : '');
        })
      });
    }

    var checkpoints = DEV_CHECKPOINT_WEEKS.map(function (w) {
      return {
        weeks: w,
        label: w === 2 ? '2-week check-in' : w === 6 ? '6-week review' : '12-week roadmap',
        focus: top3.map(function (x) { return x.label; })
      };
    });

    var confidence = 'medium';
    if (priorities.length >= 4 && top3[0] && top3[0].gap > 0.12) confidence = 'high';
    if (priorities.length < 2) confidence = 'low';

    return {
      version: 1,
      priorities: top3,
      allRanked: priorities,
      measurableTargets: measurableTargets,
      checkpoints: checkpoints,
      confidence: confidence,
      projectedDraftImpact: 'See simulator — based on draft model sensitivity to key stats.',
      projectedValueImpact: 'See simulator — uses perf score + bid heuristic.'
    };
  }

  function devApplyDeltas(r, deltas) {
    var copy = Object.assign({}, r);
    for (var k in deltas) {
      if (!Object.prototype.hasOwnProperty.call(deltas, k)) continue;
      var base = safeNum(copy[k]);
      if (base === null) continue;
      var d = deltas[k];
      if (k === 'DRtg') copy[k] = base + d;
      else copy[k] = base + d;
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

  // ── Persistence (Worker API + localStorage fallback) ───────────────────────
  var DEV_LS_PREFIX = 'dev_plan_v1_';

  function devPlanStorageKey(playerKey, league, season) {
    return DEV_LS_PREFIX + league + '_' + season + '_' + encodeURIComponent(playerKey);
  }

  function devPlanLoadLocal(playerKey, league, season) {
    try {
      var raw = localStorage.getItem(devPlanStorageKey(playerKey, league, season));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function devPlanSaveLocal(playerKey, league, season, payload) {
    try {
      localStorage.setItem(devPlanStorageKey(playerKey, league, season), JSON.stringify(payload));
      return true;
    } catch (e) {
      return false;
    }
  }

  async function devPlanFetchRemote(method, playerKey, league, season, body) {
    var token = typeof authGetToken === 'function' ? authGetToken() : null;
    var url = URLS.WORKER + '/api/development-plans?player_key=' + encodeURIComponent(playerKey)
      + '&league=' + encodeURIComponent(league) + '&season=' + encodeURIComponent(String(season));
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var res = await fetch(url, {
      method: method,
      credentials: 'include',
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    if (method === 'DELETE') return null;
    return res.json();
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

  // ── AI weekly plan (structured prompt, Gemini proxy) ───────────────────────
  function devBuildAiPayload(r, plan, simResult, coachNotes) {
    return {
      player: { name: r.Player, team: r.Team, conference: r.Conference || r.Conf, pos: r.Pos || r.Position },
      league: typeof league !== 'undefined' ? league : 'MBB',
      deterministicPlan: plan,
      simulator: simResult,
      coachNotes: coachNotes || ''
    };
  }

  async function devGenerateWeeklyPlan(r, plan, simResult, coachNotes) {
    var payload = devBuildAiPayload(r, plan, simResult, coachNotes);
    var prompt = 'You are an NCAA basketball player development coach. You MUST base recommendations on the structured JSON below. Do not invent statistics not present.\n\n'
      + JSON.stringify(payload, null, 2)
      + '\n\nRespond in markdown with these sections:\n'
      + '## Weekly focus (3-5 bullets)\n'
      + '## Checkpoints (2-week, 6-week, 12-week)\n'
      + '## Why this matters for pro upside\n'
      + '## Conversation starters for staff/player meetings\n'
      + 'Keep tone practical and specific. Reference percentile gaps and package simulator when relevant.';

    var res = await fetch(URLS.GEMINI_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-2.5-flash-lite',
        generationConfig: { maxOutputTokens: 4096, temperature: 0.45 },
        systemInstruction: {
          parts: [{
            text: 'You are a college basketball player development specialist. Output only structured markdown. Use the provided JSON as ground truth. Do not fabricate stats.'
          }]
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    });
    var data = await res.json();
    if (data.error) throw new Error((data.error && data.error.message) || 'AI error');
    var parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    var text = parts ? parts.map(function (p) { return p.text || ''; }).join('') : '';
    if (!text) throw new Error('Empty AI response');
    return text;
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderDevelopmentPanel(r) {
    var el = document.getElementById('mDevelopmentPlan');
    if (!el) return;

    var plan = devBuildDevelopmentPlan(r);
    var playerKey = typeof tbPlayerKey === 'function' ? tbPlayerKey(r) : ((r.Player || '') + '||' + (r.Team || ''));
    var season = typeof _currentDataSeason !== 'undefined' ? String(_currentDataSeason) : '2026';
    var lg = typeof league !== 'undefined' ? league : 'MBB';

    var simSelectId = 'devSimPackageSelect';
    var persistedSim = null;
    try {
      persistedSim = JSON.parse(sessionStorage.getItem('dev_last_sim') || 'null');
    } catch (e) {}
    var currentSimWrap = { result: null, packageId: persistedSim && persistedSim.packageId };

    var pkgOptions = Object.keys(DEV_SIM_PACKAGES).map(function (k) {
      return '<option value="' + k + '"' + (currentSimWrap.packageId === k || (!currentSimWrap.packageId && k === 'shooting') ? ' selected' : '') + '>' + _esc(DEV_SIM_PACKAGES[k].label) + '</option>';
    }).join('');

    var priHtml = plan.priorities.map(function (p, idx) {
      return '<div class="devPriorityCard">'
        + '<div class="devPriorityRank">' + (idx + 1) + '</div>'
        + '<div><div class="devPriorityTitle">' + _esc(p.label) + '</div>'
        + '<div class="muted" style="font-size:11px">Gap vs target ~' + (p.gap * 100).toFixed(0) + ' percentile points · avg ~' + Math.round(p.avgPercentile * 100) + 'th percentile</div>'
        + '<div class="devPriorityStats">' + p.evidence.map(function (e) {
          return '<span class="pill">' + _esc(e.stat) + '</span>';
        }).join(' ') + '</div></div></div>';
    }).join('');

    var cpHtml = plan.checkpoints.map(function (c) {
      return '<div class="devCheckpoint"><b>' + _esc(c.label) + '</b><div class="muted" style="font-size:11px">Focus: ' + _esc(c.focus.join(' · ')) + '</div></div>';
    }).join('');

    el.innerHTML =
      '<div class="devPlanToolbar">'
      + '<span class="pill">Confidence: ' + _esc(plan.confidence) + '</span>'
      + '<button type="button" class="secondary" id="devPlanSaveBtn">Save plan</button>'
      + '<button type="button" class="secondary" id="devAiPlanBtn">Generate AI weekly plan</button>'
      + '</div>'
      + '<div class="devPlanGrid">'
      + '<div><h4 class="devPlanSubhead">Top priorities</h4>' + (priHtml || '<div class="muted">Not enough percentile coverage for priorities.</div>') + '</div>'
      + '<div><h4 class="devPlanSubhead">Checkpoints</h4>' + cpHtml + '</div>'
      + '</div>'
      + '<div class="devSimPanel">'
      + '<h4 class="devPlanSubhead">Upside simulator</h4>'
      + '<div class="devSimRow">'
      + '<label for="' + simSelectId + '">Package</label>'
      + '<select id="' + simSelectId + '">' + pkgOptions + '</select>'
      + '<button type="button" class="primary" id="devSimRunBtn">Simulate</button>'
      + '</div>'
      + '<div id="devSimOut" class="devSimOut"></div>'
      + '</div>'
      + '<div class="devCoachNotes">'
      + '<label for="devCoachNotesInput">Coach notes / manual context</label>'
      + '<textarea id="devCoachNotesInput" rows="3" placeholder="Film notes, role, medical, practice emphasis…"></textarea>'
      + '</div>'
      + '<div id="devAiOut" class="devAiOut"></div>';

    function runSim() {
      var sel = document.getElementById(simSelectId);
      var pid = sel ? sel.value : 'shooting';
      var result = devSimulatePackage(r, pid);
      var out = document.getElementById('devSimOut');
      if (!out || !result) return;
      sessionStorage.setItem('dev_last_sim', JSON.stringify({ packageId: pid, result: result }));
      var bidLine = '';
      if (Number.isFinite(result.estimatedBidAfter) && Number.isFinite(safeNum(r.ActualValuation_calc))) {
        bidLine = '<div>Est. Toledo max bid: <b>' + (typeof fmtMoney === 'function' ? fmtMoney(result.estimatedBidAfter) : result.estimatedBidAfter) + '</b> <span class="muted">(heuristic from perf score delta)</span></div>';
      }
      out.innerHTML =
        '<div><b>' + _esc(result.packageLabel) + '</b></div>'
        + '<div>Perf score (model): <b>' + result.beforeScore.toFixed(2) + '</b> → <b>' + result.afterScore.toFixed(2) + '</b></div>'
        + '<div>Draft model: <b>' + (result.beforeDraft != null ? (result.beforeDraft * 100).toFixed(1) + '%' : '—') + '</b> (' + _esc(result.rangeBefore) + ') → <b>' + (result.afterDraft != null ? (result.afterDraft * 100).toFixed(1) + '%' : '—') + '</b> (' + _esc(result.rangeAfter) + ')</div>'
        + bidLine;
      currentSimWrap.result = result;
      currentSimWrap.packageId = pid;
    }

    document.getElementById('devSimRunBtn').addEventListener('click', runSim);
    runSim();

    document.getElementById('devPlanSaveBtn').addEventListener('click', function () {
      var notes = (document.getElementById('devCoachNotesInput') || {}).value || '';
      var payload = {
        savedAt: new Date().toISOString(),
        plan: plan,
        coachNotes: notes,
        lastSim: currentSimWrap.result ? { packageId: currentSimWrap.packageId, result: currentSimWrap.result } : null
      };
      devPlanSave(playerKey, lg, season, payload).then(function () {
        alert('Development plan saved.');
      }).catch(function () {
        alert('Saved locally. API sync may be unavailable.');
      });
    });

    document.getElementById('devAiPlanBtn').addEventListener('click', function () {
      var btn = document.getElementById('devAiPlanBtn');
      var out = document.getElementById('devAiOut');
      var notes = (document.getElementById('devCoachNotesInput') || {}).value || '';
      var sim = currentSimWrap.result || devSimulatePackage(r, (document.getElementById(simSelectId) || {}).value || 'shooting');
      btn.disabled = true;
      out.innerHTML = '<div class="muted">Generating…</div>';
      devGenerateWeeklyPlan(r, plan, sim, notes).then(function (md) {
        out.innerHTML = '<div class="devAiMarkdown">' + _esc(md).replace(/\n/g, '<br>') + '</div>';
      }).catch(function (e) {
        out.innerHTML = '<div class="muted">AI error: ' + _esc(e.message) + '</div>';
      }).finally(function () {
        btn.disabled = false;
      });
    });

    devPlanLoad(playerKey, lg, season).then(function (saved) {
      if (!saved) return;
      var ta = document.getElementById('devCoachNotesInput');
      if (ta && saved.coachNotes) ta.value = saved.coachNotes;
    });
  }

  window.PlayerDevelopment = {
    DEV_CATEGORIES: DEV_CATEGORIES,
    DEV_SIM_PACKAGES: DEV_SIM_PACKAGES,
    DEV_CHECKPOINT_WEEKS: DEV_CHECKPOINT_WEEKS,
    buildPlan: devBuildDevelopmentPlan,
    simulatePackage: devSimulatePackage,
    scoreRowForPlayer: devScoreRowForPlayer,
    planLoad: devPlanLoad,
    planSave: devPlanSave,
    generateWeeklyPlan: devGenerateWeeklyPlan,
    renderPanel: renderDevelopmentPanel
  };
})();
