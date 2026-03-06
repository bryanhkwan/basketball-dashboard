// ============ PROFILE MODULE ============
// Dependencies: config.js (safeNum, fmtMoney, clamp, ROLE_DESCRIPTIONS, STAT_GLOSSARY),
//   data.js (pos, statDist, currentWeights, statPercentile, getInvertForStat, archetypeTags,
//            lastPerfStar, lastPerfAvg, barColor, bucketPosition, fitPresetEl,
//            confMultToggleEl, avgPayEl, starValueEl, starPctEl),
//   players.js (tbGetAllPlayers, tbPlayerKey — actually in teambuilder.js)

// --- Module-level state (global) ---
var _currentProfilePlayer = null;
var _lastCompare = null;

// --- Profile modal functions ---

function openProfile(r){
  const player = (r['Player'] ?? 'Player').toString();
  const team = (r['Team'] ?? '').toString();
  const conf = (r['Conference'] ?? r['Conf'] ?? '').toString();
  const position = (r['Pos'] ?? r['Position'] ?? pos).toString();

  mTitle.textContent = player;
  mSub.textContent = [team, conf, position].filter(Boolean).join(' • ');
  document.getElementById('mLearnMore').href = 'https://www.google.com/search?q=' + encodeURIComponent(player + ' ' + team + ' basketball');
  mScore.textContent = Number.isFinite(r.Score) ? r.Score.toFixed(2) : '—';
  mFit.textContent = Number.isFinite(r.FitScore_calc) ? r.FitScore_calc.toFixed(0) : '—';
  mVal.textContent = fmtMoney(r.ActualValuation_calc);
  mMult.textContent = Number.isFinite(r.MinMultiplier_calc) ? r.MinMultiplier_calc.toFixed(2) : '—';

  const mConfMultRow = document.getElementById('mConfMultRow');
  const cm = safeNum(r.ConfMult_calc);
  if(Number.isFinite(cm) && cm !== 1 && confMultToggleEl && confMultToggleEl.checked){
    mConfMultRow.style.display = 'block';
    document.getElementById('mConfMult').textContent = cm.toFixed(2);
    document.getElementById('mConfName').textContent = conf || '—';
  } else {
    if(mConfMultRow) mConfMultRow.style.display = 'none';
  }

  const bossVal = safeNum(r.ActualValuation);
  const delta = safeNum(r.ValueDelta_calc);
  const deltaPct = safeNum(r.ValueDeltaPct_calc);
  let bossLine = '';
  if(Number.isFinite(bossVal)){
    const sign = Number.isFinite(delta) ? (delta>=0?'+':'') : '';
    const pctTxt = Number.isFinite(deltaPct) ? ` (${(deltaPct*100).toFixed(1)}%)` : '';
    bossLine = `Actual valuation: <b>${fmtMoney(bossVal)}</b> • Model vs Boss: <b>${sign}${fmtMoney(delta).replace('$','')}</b>${pctTxt}`;
  }

  if(bossLine){ mMeta.innerHTML = `<div class="muted">${bossLine}</div>`; }

  mTags.innerHTML = '';

  const roleDefsEl = document.getElementById('mRoleDefs');
  if(roleDefsEl){
    const labels = [...new Set(archetypeTags(r).map(x => x.t).filter(Boolean))];
    roleDefsEl.innerHTML = labels.map(lbl => {
      const desc = ROLE_DESCRIPTIONS[lbl] || "Definition not set.";
      return `<div style="display:flex; gap:10px; align-items:flex-start">
        <span class="pill" style="flex:0 0 auto">${lbl}</span>
        <div class="hint" style="margin:0; opacity:.95">${desc}</div>
      </div>`;
    }).join('') || `<div class="hint" style="margin:0">No role tags for this player.</div>`;
  }

  archetypeTags(r).forEach(tag=>{
    const div = document.createElement('div');
    div.className = 'chip';
    div.innerHTML = `<span class="dot" style="background:${tag.c}"></span>${tag.t}`;
    mTags.appendChild(div);
  });

  const usedStats = (currentWeights[pos] || []).filter(x => (Number(x.w)||0) !== 0).map(x=>x.stat);
  const fallback = ['PPG','eFG%','3P%','FT%','APG','A/TO','TOPG','SPG','BPG','DRtg','DR%','WS/40','BPM','PER'];
  const stats = Array.from(new Set([...usedStats, ...fallback])).filter(s => r[s] !== undefined).slice(0, 10);

  mBars.innerHTML = '';
  stats.forEach(stat=>{
    const x = safeNum(r[stat]);
    const pct = statPercentile(stat, x);
    const item = document.createElement('div');
    item.className = 'barItem';
    const pctLabel = Number.isFinite(pct) ? `${Math.round(pct*100)}th` : '—';
    item.innerHTML = `
      <div class="barTop"><div><b>${stat}</b> <span class="muted">${(r[stat] ?? '—')}</span></div><div>${pctLabel}</div></div>
      <div class="barTrack"><div class="barFill"></div></div>
      <div class="barMeta"><span>${getInvertForStat(stat) ? 'Lower is better' : 'Higher is better'}</span><span class="muted">${fitPresetEl.options[fitPresetEl.selectedIndex].text}</span></div>
    `;
    const fill = item.querySelector('.barFill');
    fill.style.width = Number.isFinite(pct) ? `${Math.round(pct*100)}%` : `0%`;
    fill.style.background = `linear-gradient(90deg, ${barColor(pct)}, var(--accent2))`;
    mBars.appendChild(item);
  });

  const avgPay = Number(avgPayEl.value);
  const starValue = Number(starValueEl.value);
  const starP = clamp(Number(starPctEl.value), 0.5, 0.999);
  mMeta.innerHTML = `
    <div class="muted">
      Star anchor: at PerfScore <b>${starP.toFixed(2)} percentile</b> (~<b>${Number.isFinite(lastPerfStar)?lastPerfStar.toFixed(2):'—'}</b>),
      predicted pay is pulled toward <b>${fmtMoney(starValue)}</b>, with average anchored at <b>${fmtMoney(avgPay)}</b>.
      More starValue → steeper curve (bigger top-end).
    </div>
  `;

  const exclude = new Set(['PerfScore_calc','PredictedValue_calc','ActualValuation_calc','MinMultiplier_calc','MP_num','FitScore_calc']);
  const all = Object.keys(r).filter(k => !exclude.has(k));
  const container = document.createElement('div');
  container.className = 'panel';
  container.style.border = 'none';
  container.style.borderRadius = '0';
  container.innerHTML = '';
  all.forEach(k => {
    const div = document.createElement('div');
    div.className = 'statRow';
    div.innerHTML = `<span class="k">${k}</span><span>${(r[k] ?? '—')}</span>`;
    container.appendChild(div);
  });
  mAllStats.innerHTML = '';
  mAllStats.appendChild(container);

  const mSimilar = document.getElementById('mSimilar');
  if(mSimilar){
    const allPlayers = tbGetAllPlayers();
    const curPos = bucketPosition(r.Pos || r.Position);
    const samePos = allPlayers.filter(x => bucketPosition(x.Pos || x.Position) === curPos && tbPlayerKey(x) !== tbPlayerKey(r));
    const keyStats = curPos === 'Guards'
      ? ['PPG','eFG%','3P%','APG','A/TO','SPG','BPM','DRtg']
      : ['PPG','eFG%','BPG','RPG','DRtg','BPM','FT%','A/TO'];
    function pctVec(p){
      return keyStats.map(s => { const v = safeNum(p[s]); const pct = statPercentile(s,v); return Number.isFinite(pct)?pct:0.5; });
    }
    const curVec = pctVec(r);
    const scored = samePos.map(x => {
      const xVec = pctVec(x);
      let dist = 0;
      for(let i=0;i<curVec.length;i++) dist += (curVec[i]-xVec[i])**2;
      return {r:x, dist: Math.sqrt(dist), upgrade: (x.Score||0) > (r.Score||0)};
    }).sort((a,b) => a.dist - b.dist).slice(0, 5);

    if(scored.length){
      mSimilar.innerHTML = scored.map(s => {
        const pp = s.r;
        const arrow = s.upgrade ? '<span style="color:var(--good)">↑</span>' : '<span style="color:var(--muted)">≈</span>';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--line)">
          <span>${arrow} <span class="link" style="cursor:pointer" onclick="window._app.openProfile(window._app.tbGetAllPlayers().find(x=>x.Player==='${(pp.Player||'').replace(/'/g,"\\'")}'));event.stopPropagation();">${pp.Player}</span>
          <span style="color:var(--muted);font-size:10px;margin-left:4px">${pp.Team||''}</span></span>
          <span style="font-size:11px"><b>${pp.Score?pp.Score.toFixed(1):'—'}</b> perf · ${pp.ActualValuation_calc?fmtMoney(pp.ActualValuation_calc):'—'}</span>
        </div>`;
      }).join('');
    } else { mSimilar.innerHTML = '<div class="muted">No similar players found.</div>'; }
  }

  _currentProfilePlayer = r;
  document.getElementById('mCompareBtn').onclick = () => {
    const name2 = prompt('Enter a player name to compare with ' + player + ':');
    if(name2 && name2.trim()){
      closeProfile();
      openCompare(player, name2.trim());
    }
  };

  renderCareerHistory(r);
  renderTeamContext(r);
  renderShootingZones(r);
  renderRecruitingBadge(r);
  renderScoutReport(r);

  // Player shot chart (uses play-by-play data via worker)
  const mShotChart = document.getElementById('mShotChart');
  if (mShotChart) {
    const yr = typeof thCurrentSeason !== 'undefined' ? thCurrentSeason : '2026';
    mShotChart.innerHTML = '<div class="muted" style="font-size:12px">Loading shot data…</div>';
    if (typeof loadPlayerShots === 'function') {
      loadPlayerShots(team, yr, player).then(function(shots) {
        if (!shots || !shots.length) {
          mShotChart.innerHTML = '<div class="muted" style="font-size:12px">No shot-location data available for ' + player + ' this season.</div>';
          return;
        }
        const svgHtml = typeof _th_buildShotChartSVG === 'function'
          ? _th_buildShotChartSVG(shots, player, 'var(--accent)')
          : '';
        mShotChart.innerHTML =
          '<div class="muted" style="font-size:10.5px;margin-bottom:6px">' + shots.length + ' shot attempts · ' + yr + ' season</div>' + svgHtml;
        if (typeof thInitShotChart === 'function') thInitShotChart('mShotChart');
        enrichScoutReportWithShots(shots);
      }).catch(function() {
        mShotChart.innerHTML = '<div class="muted" style="font-size:12px">Shot data unavailable.</div>';
      });
    }
  }

  modalBack.style.display = 'flex';
}

function closeProfile(){ modalBack.style.display = 'none'; }

// ── Scout Report ─────────────────────────────────────────────────────────────
function renderScoutReport(r) {
  const el = document.getElementById('mScoutReport');
  if (!el) return;

  const posGroup = bucketPosition(r.Pos || r.Position || '');
  function pct(stat) {
    const v = safeNum(r[stat]);
    if (!Number.isFinite(v)) return null;
    const p = statPercentile(stat, v);
    return Number.isFinite(p) ? p : null;
  }

  // raw values
  const ppg   = safeNum(r['PPG']),    efg   = safeNum(r['eFG%']),
        p3pct = safeNum(r['3P%']),    ft    = safeNum(r['FT%']),
        apg   = safeNum(r['APG']),    ato   = safeNum(r['A/TO']),
        topg  = safeNum(r['TOPG']),   spg   = safeNum(r['SPG']),
        bpg   = safeNum(r['BPG']),    rpg   = safeNum(r['RPG']),
        orPct = safeNum(r['OR%']),    usg   = safeNum(r['USG%']),
        bpm   = safeNum(r['BPM']),    drtg  = safeNum(r['DRtg']),
        ws40  = safeNum(r['WS/40']),  p3paG = safeNum(r['3PA/G']);

  // percentiles
  const ppgP  = pct('PPG'),   efgP  = pct('eFG%'), p3P   = pct('3P%'),
        ftP   = pct('FT%'),   apgP  = pct('APG'),  atoP  = pct('A/TO'),
        topgP = pct('TOPG'),  spgP  = pct('SPG'),  bpgP  = pct('BPG'),
        rpgP  = pct('RPG'),   orP   = pct('OR%'),  usgP  = pct('USG%'),
        bpmP  = pct('BPM'),   drtgP = pct('DRtg'), ws40P = pct('WS/40'),
        drP   = pct('DR%');

  const fPct = v => Number.isFinite(v) ? (v * 100).toFixed(1) + '%' : '—';
  const fN   = (v, d=1) => Number.isFinite(v) ? v.toFixed(d) : '—';
  const top  = p => p != null ? Math.round((1 - p) * 100) : null;

  const strengths = [], weaknesses = [], tendencies = [], development = [], matchup = [];

  // ── STRENGTHS ──────────────────────────────────────────────────────────────
  if (ppgP  >= 0.82) strengths.push(`Elite scorer — ${fN(ppg)} PPG (top ${top(ppgP)}% of position group)`);
  if (efgP  >= 0.82) strengths.push(`Highly efficient shooter — ${fPct(efg)} eFG%, creates quality looks and finishes`);
  if (p3P   >= 0.82 && p3paG >= 1.5) strengths.push(`Dangerous 3PT threat — ${fPct(p3pct)} on ${fN(p3paG)}/g volume; must be contested off screens and DHOs`);
  if (ftP   >= 0.82) strengths.push(`Reliable FT shooter — ${fPct(ft)} from the line; punishes defenders for reaching`);
  if (apgP  >= 0.82) strengths.push(`High-level playmaker — ${fN(apg)} APG, reads defenses and creates consistently for teammates`);
  if (atoP  >= 0.82) strengths.push(`Excellent decision-maker — ${fN(ato,2)} A/TO, protects possessions and limits live-ball turnovers`);
  if (spgP  >= 0.82) strengths.push(`Elite ball-hawk — ${fN(spg)} SPG, disrupts passing lanes and generates transition chances`);
  if (bpgP  >= 0.82) strengths.push(`Rim protector — ${fN(bpg)} BPG, deters drives and shifts opponent shot selection away from the paint`);
  if (rpgP  >= 0.82) strengths.push(`High-volume rebounder — ${fN(rpg)} RPG, controls both glass ends and limits second-chance points`);
  if (bpmP  >= 0.82) strengths.push(`Strong two-way impact — BPM places them among the most impactful players at this position`);
  if (drtgP >= 0.82) strengths.push(`Excellent individual defender — ${fN(drtg,0)} DRtg; opponents score inefficiently in these matchups`);
  if (ws40P >= 0.82) strengths.push(`Wins producer — elite WS/40 confirms genuine per-minute impact on team results`);
  if (orP   >= 0.82) strengths.push(`Elite offensive rebounder — OR% in the top tier; crashes the glass relentlessly for extra possessions`);
  if (drP   >= 0.82) strengths.push(`Elite defensive rebounder — stingy on the glass, routinely ends possessions`);
  if (usgP  >= 0.80 && ppgP != null && ppgP >= 0.55) strengths.push(`Handles heavy load — ${fN(usg,0)}% usage while staying efficient; trusted primary option`);

  // ── WEAKNESSES ─────────────────────────────────────────────────────────────
  if (ppgP  != null && ppgP  <= 0.22) weaknesses.push(`Limited scoring output — ${fN(ppg)} PPG; offense runs through others`);
  if (efgP  != null && efgP  <= 0.22) weaknesses.push(`Poor shooting efficiency — ${fPct(efg)} eFG%; misses erode possession quality`);
  if (p3P   != null && p3P   <= 0.22 && p3paG >= 1.5) weaknesses.push(`Unreliable 3PT shooter on volume — ${fPct(p3pct)} on ${fN(p3paG)}/g; defenders can sag off and clog the paint`);
  if (ftP   != null && ftP   <= 0.22) weaknesses.push(`Free throw liability — ${fPct(ft)} FT%; hack-a strategy is valid in crunch time`);
  if (atoP  != null && atoP  <= 0.22) weaknesses.push(`Decision-making concerns — ${fN(ato,2)} A/TO; passing-game issues limit playmaking ceiling`);
  if (topgP != null && topgP <= 0.22) weaknesses.push(`Ball security issues — ${fN(topg)} TOPG; careless with live ball, gifts transition chances`);
  if (spgP  != null && bpgP  != null && spgP <= 0.22 && bpgP <= 0.22) weaknesses.push(`Passive defender — low steal and block numbers; rarely creates defensive events`);
  if (drtgP != null && drtgP <= 0.22) weaknesses.push(`Below-average defender — ${fN(drtg,0)} DRtg; opponents score efficiently when they are the primary assignment`);
  if (rpgP  != null && rpgP  <= 0.22) weaknesses.push(`Soft on the glass — ${fN(rpg)} RPG; gives up extra possessions and second-chance opportunities`);
  if (apgP  != null && apgP  <= 0.22 && posGroup === 'Guards') weaknesses.push(`Limited playmaking — ${fN(apg)} APG; off-ball only, not a primary creator or initiator`);

  // ── TENDENCIES ─────────────────────────────────────────────────────────────
  if      (Number.isFinite(usg) && usg >= 26) tendencies.push(`Primary option (${fN(usg,0)}% USG) — initiates possessions, demands double-team attention in half-court sets`);
  else if (Number.isFinite(usg) && usg >= 18) tendencies.push(`Secondary option (${fN(usg,0)}% USG) — operates within the offense, accepts touches without demanding the ball`);
  else if (Number.isFinite(usg) && usg > 0)   tendencies.push(`Role player (${fN(usg,0)}% USG) — low-decision contributor, executes within structure`);

  if      (Number.isFinite(p3paG) && p3paG >= 5)   tendencies.push(`Volume 3PT gunner — ${fN(p3paG)}/g; attacks pull-ups and spot-ups relentlessly, spaces the floor wide`);
  else if (Number.isFinite(p3paG) && p3paG >= 2.5)  tendencies.push(`Perimeter-oriented — ${fN(p3paG)} 3PA/g; comfortable catch-and-shoot and off-dribble from beyond the arc`);
  else if (Number.isFinite(p3paG) && p3paG < 1 && posGroup === 'Guards') tendencies.push(`Drive-first guard — rarely attempts 3s (${fN(p3paG)}/g); attacks closeouts going to the basket and FT line`);

  if      (Number.isFinite(apg) && apg >= 5)   tendencies.push(`Floor general — runs every action; master of pick-and-roll, drive-and-kick, and secondary reads`);
  else if (Number.isFinite(apg) && apg >= 3)   tendencies.push(`Secondary ball-handler — comfortable in PnR as pull-up or pass-first on second-side actions`);

  if (Number.isFinite(orPct) && orPct >= 8)    tendencies.push(`Offensive glass crasher — OR% ${fN(orPct,1)}%; must be tracked and blocked out on every shot`);
  if (Number.isFinite(spg)  && spg   >= 1.5)   tendencies.push(`Active-hands gambler — digs in passing lanes; skip passes and DHOs can exploit this tendency`);
  if (Number.isFinite(bpg)  && bpg   >= 1.5)   tendencies.push(`Paint deterrent — active shot-blocker; use shot fakes to take them off their feet before attacking`);
  if (Number.isFinite(ft)   && ft    >= 0.80 && Number.isFinite(usg) && usg >= 18) tendencies.push(`Draws fouls intentionally — gets to the line and converts; defenders must stay disciplined`);

  // ── DEVELOPMENT AREAS ──────────────────────────────────────────────────────
  const devCandidates = [];
  function devCheck(stat, label, msg) {
    const p = pct(stat); if (p == null) return;
    if (p >= 0.25 && p < 0.56) devCandidates.push({ p, msg: msg + ` (~${Math.round(p*100)}th pct)` });
  }
  devCheck('3P%',  '', `3PT shooting — mechanics and shot-selection improvements could unlock genuine perimeter threat status`);
  devCheck('FT%',  '', `Free throw reliability — consistent FT% removes hack-a options and adds clutch-game production`);
  devCheck('APG',  '', `Playmaking volume — adding consistent passing reads would shift them from scorer to dual-threat initiator`);
  devCheck('A/TO', '', `Decision-making — cleaning up live-ball turnovers is the clearest efficiency floor-raiser`);
  devCheck('DRtg', '', `Defensive engagement — improved positioning and floor awareness would raise overall two-way value`);
  devCheck('BPG',  '', `Rim-deterrence — better shot-contest timing and verticality could develop them into a paint anchor`);
  devCheck('RPG',  '', `Rebounding discipline — box-out fundamentals improvement has a direct impact on team rebound rate`);
  devCheck('eFG%', '', `Shot quality — higher shot selectivity or finishing improvement pushes eFG% to league-average range`);
  devCandidates.sort((a, b) => b.p - a.p);
  development.push(...devCandidates.slice(0, 3).map(d => d.msg));

  // ── MATCHUP NOTES ──────────────────────────────────────────────────────────
  if (p3P   != null && p3P   >= 0.72 && p3paG >= 2) matchup.push(`🛡️ Guarding offense: Hard close-out — ${fPct(p3pct)} 3PT on volume. Force baseline, funnel to weak hand, stay attached through hand-offs and screens.`);
  if (usg   >= 26 && apgP   != null  && apgP  >= 0.60) matchup.push(`🛡️ Deny initiation: Primary creator (${fN(usg,0)}% USG) with passing vision — pressure the catch, fight over screens; remove the ball from their hands early in the shot clock.`);
  if (ftP   != null && ftP   <= 0.58 && usg >= 18) matchup.push(`📌 Hack consideration: ${fPct(ft)} FT% at ${fN(usg,0)}% usage — late-game intentional fouling is a legitimate tactical option.`);
  if (atoP  != null && atoP  <= 0.30) matchup.push(`⚡ Force live-ball situations: High turnover rate — PnR traps, full-court pressure, and deflection rotations will produce extra possessions.`);
  if (drtgP != null && drtgP <= 0.30) matchup.push(`🎯 Attack this matchup: Below-average defender (${fN(drtg,0)} DRtg) — target in isolation or PnR; especially attack away from their strong side.`);
  if (orPct >= 10) matchup.push(`💥 Hard box-outs critical: ${fN(orPct,1)}% OR rate — alert every shooter; nobody leaves the glass early.`);
  if (spg   >= 1.5) matchup.push(`🖐️ Protect the ball: Active in passing lanes — cut with purpose, avoid cross-court skips when they are in lane position.`);
  if (bpg   >= 1.5) matchup.push(`🚧 Avoid uncontested drives: ${fN(bpg)} BPG help presence — kick out or shot-fake to take them off their feet before attacking the rim.`);
  if (drtgP != null && drtgP >= 0.75) matchup.push(`ℹ️ Solid defender: Good DRtg indicates they hold their own — don't overcommit to a mismatch; respect help-side rotation.`);
  if (efgP  != null && efgP  >= 0.78) matchup.push(`🔥 Efficient scorer: ${fPct(efg)} eFG% — minimal wasted shots; contest every catch, avoid foul situations, don't let them set their feet.`);
  if (bpgP  != null && bpgP  >= 0.78) matchup.push(`🎯 Their defense — blocks at rim: Anchors weak side with aggressive rotations — skip passes and pop/pocket passes are the answer.`);
  if (spgP  != null && spgP  >= 0.78) matchup.push(`🎯 Their defense — pressure defense: Active lane presence — set screens early, keep ball moving before they can commit to the gamble.`);

  // ── RENDER ─────────────────────────────────────────────────────────────────
  function scoutSection(title, icon, items, cls) {
    if (!items.length) return '';
    return `<div class="scoutSection">
      <div class="scoutSectionHead">${icon} ${title}</div>
      <div class="scoutItems">${items.map(t => `<div class="scoutItem ${cls}">${t}</div>`).join('')}</div>
    </div>`;
  }

  const html =
    scoutSection('Strengths',        '✅', strengths,   'scoutItem--strength') +
    scoutSection('Weaknesses',       '⚠️', weaknesses,  'scoutItem--weakness') +
    scoutSection('Tendencies',       '🔄', tendencies,  'scoutItem--tendency') +
    scoutSection('Development Areas','📈', development, 'scoutItem--dev')      +
    scoutSection('Matchup Notes',    '🎯', matchup,     'scoutItem--matchup');

  el.innerHTML = html ||
    '<div class="muted" style="font-size:12px;padding:8px 0">Not enough stat data to generate a scout report for this player.</div>';
}

// ── Shot Chart Tendency Enrichment ───────────────────────────────────────────
// Called after shot data loads — appends shot-derived items to the Tendencies
// section of the already-rendered scout report.
function enrichScoutReportWithShots(shots) {
  const el = document.getElementById('mScoutReport');
  if (!el || !shots) return;

  // Only use field goal attempts (exclude free throws)
  const fga = shots.filter(function(s) { return s.range !== 'free_throw'; });
  const total = fga.length;
  if (total < 15) return;  // not enough data

  const rimShots   = fga.filter(function(s) { return s.range === 'rim'; });
  const midShots   = fga.filter(function(s) { return s.range === 'jumper'; });
  const threeShots = fga.filter(function(s) { return s.range === 'three_pointer'; });

  const rimPct   = rimShots.length   / total;
  const midPct   = midShots.length   / total;
  const threePct = threeShots.length / total;

  const fg = function(arr) {
    return arr.length ? arr.filter(function(s) { return s.made; }).length / arr.length : null;
  };
  const rimFG   = fg(rimShots);
  const midFG   = fg(midShots);
  const threeFG = fg(threeShots);

  // Corner 3s: |y - 250| > 165 (near sidelines in full-court 0–500 coordinate)
  const cornerThrees     = threeShots.filter(function(s) { return Math.abs(s.y - 250) > 165; });
  const aboveBreakThrees = threeShots.filter(function(s) { return Math.abs(s.y - 250) <= 165; });
  const cornerPct        = threeShots.length ? cornerThrees.length / threeShots.length : 0;

  // Determine which basket the player attacks (same logic as _thShotToSVG)
  const rimAll    = shots.filter(function(s) { return s.range === 'rim'; });
  const avgX      = rimAll.length ? rimAll.reduce(function(a, s) { return a + s.x; }, 0) / rimAll.length : 470;
  const attacksLeft = avgX < 470;

  // Left vs right side at the rim (dy = y - 250; positive = right side when attacking left)
  const rimSided = rimShots.filter(function(s) { return Math.abs(s.y - 250) > 20; });
  const rightRim = rimSided.filter(function(s) { return attacksLeft ? (s.y - 250) > 0 : (s.y - 250) < 0; }).length;
  const leftRim  = rimSided.filter(function(s) { return attacksLeft ? (s.y - 250) < 0 : (s.y - 250) > 0; }).length;

  var items = [];
  var pct = function(v, d) { return Math.round(v * 100) + '%'; };
  var fmtFG = function(v) { return v != null ? ' (' + Math.round(v * 100) + '% FG)' : ''; };

  // Paint-first vs perimeter-only profile
  if (rimPct >= 0.42) {
    items.push('Paint-first attacker — ' + pct(rimPct) + ' of shots at the rim' + fmtFG(rimFG) + '; draws contact and forces interior rotations');
  } else if (rimPct <= 0.18 && threePct >= 0.40) {
    items.push('Perimeter-exclusive — only ' + pct(rimPct) + ' of shots at the rim; rarely tests the paint, lives on the arc and mid-range');
  }

  // Mid-range tendency
  if (midPct >= 0.30 && midShots.length >= 20) {
    var midStr = midFG != null ? ', shooting ' + Math.round(midFG * 100) + '% there' : '';
    items.push('Mid-range dependent — ' + pct(midPct) + ' of FGA are pull-up and catch-and-shoot jumpers' + midStr + '; attackable on closeouts');
  } else if (midPct <= 0.10 && total >= 40) {
    items.push('Avoids mid-range — only ' + pct(midPct) + ' of shots from mid-range; strictly rim attacks or 3PT, no in-between game');
  }

  // 3PT location: corner specialist vs above-the-break
  if (threeShots.length >= 15) {
    if (cornerPct >= 0.35) {
      var cFG = cornerThrees.length ? Math.round(cornerThrees.filter(function(s) { return s.made; }).length / cornerThrees.length * 100) : null;
      items.push('Corner 3 specialist — ' + Math.round(cornerPct * 100) + '% of 3PT attempts from the corners' +
        (cFG != null ? ' (' + cFG + '% there)' : '') +
        '; attack with ball-screen coverage, not zone traps that open corners');
    } else if (cornerPct <= 0.12 && threeShots.length >= 25) {
      items.push('Above-the-break gunner — only ' + Math.round(cornerPct * 100) + '% of 3PTs from corners; prefers pull-ups and DHO 3s at wings and top of key');
    }
  }

  // Left vs right side rim finishing
  if ((rightRim + leftRim) >= 20) {
    var rightPct = rightRim / (rightRim + leftRim);
    if (rightPct >= 0.62) {
      items.push('Right-side finisher — ' + Math.round(rightPct * 100) + '% of rim attempts from the right side; shade left to force to weak hand');
    } else if (rightPct <= 0.38) {
      items.push('Left-side finisher — ' + Math.round((1 - rightPct) * 100) + '% of rim attempts from the left side; shade right to force to weak hand');
    }
  }

  // Rim finishing efficiency (when sample is big enough)
  if (rimShots.length >= 25 && rimFG != null) {
    if (rimFG < 0.50) {
      items.push('Struggles to convert at the rim — ' + Math.round(rimFG * 100) + '% at the basket; shot blockers and bump-at-gather rotation disrupts rhythm');
    } else if (rimFG >= 0.70) {
      items.push('Elite rim finisher — ' + Math.round(rimFG * 100) + '% at the basket; uses body control and both hands, absorbs contact well');
    }
  }

  if (!items.length) return;

  // Inject into the existing Tendencies section, or append a new one
  var sections = el.querySelectorAll('.scoutSection');
  var tendSec = null;
  sections.forEach(function(sec) {
    var head = sec.querySelector('.scoutSectionHead');
    if (head && head.textContent.indexOf('Tendencies') !== -1) tendSec = sec;
  });

  var newItems = items.map(function(t) {
    return '<div class="scoutItem scoutItem--tendency">' + t + '</div>';
  }).join('');

  if (tendSec) {
    var itemsEl = tendSec.querySelector('.scoutItems');
    if (itemsEl) itemsEl.insertAdjacentHTML('beforeend', newItems);
  } else {
    el.insertAdjacentHTML('beforeend',
      '<div class="scoutSection">'
      + '<div class="scoutSectionHead">🔄 Tendencies</div>'
      + '<div class="scoutItems">' + newItems + '</div>'
      + '</div>');
  }
}

// ── Career History ──────────────────────────────────────────
var CAREER_COLS = [
  { key: 'G',     label: 'G',     pct: false, dec: 0 },
  { key: 'PPG',   label: 'PPG',   pct: false, dec: 1 },
  { key: 'RPG',   label: 'RPG',   pct: false, dec: 1 },
  { key: 'APG',   label: 'APG',   pct: false, dec: 1 },
  { key: 'SPG',   label: 'SPG',   pct: false, dec: 1 },
  { key: 'BPG',   label: 'BPG',   pct: false, dec: 1 },
  { key: 'eFG%',  label: 'eFG%',  pct: true,  dec: 1 },
  { key: 'TS%',   label: 'TS%',   pct: true,  dec: 1 },
  { key: 'BPM',   label: 'BPM',   pct: false, dec: 2 },
  { key: 'WS/40', label: 'WS/40', pct: false, dec: 3 },
];

function _fmtC(col, val) {
  if (!Number.isFinite(val)) return '—';
  if (col.pct) return (val * 100).toFixed(col.dec) + '%';
  if (col.dec === 0) return Math.round(val);
  return val.toFixed(col.dec);
}

function renderCareerHistory(r) {
  const el = document.getElementById('mCareer');
  if (!el) return;

  const key = (r.Player || '').toLowerCase().trim();

  if (!_careerDataReady) {
    el.innerHTML = '<div class="muted" style="padding:14px 16px;font-size:12px">Loading career history…</div>';
    window._onCareerDataReady = () => renderCareerHistory(_currentProfilePlayer);
    return;
  }

  const history = careerData[key];
  if (!history || !history.length) {
    el.innerHTML = '<div class="muted" style="padding:14px 16px;font-size:12px">No multi-season data found.</div>';
    return;
  }

  // If only one season exists, note it is the first recorded year
  const currentYear = 2026;

  let html = '<div class="careerTable"><table><thead><tr>' +
    '<th>Season</th><th>Team</th><th>Pos</th>' +
    CAREER_COLS.map(c => '<th>' + c.label + '</th>').join('') +
    '</tr></thead><tbody>';

  history.forEach((row, i) => {
    const isCurrent = row._season === currentYear;
    const prev = i > 0 ? history[i - 1] : null;
    const isTransfer = prev && (row.Team || '') !== (prev.Team || '');

    html += '<tr' + (isCurrent ? ' class="career-current"' : '') + '>';
    html += '<td><b>' + row._season + '</b>' + (isCurrent ? ' ★' : '') + '</td>';
    html += '<td>' + (row.Team || '—') + (isTransfer ? ' <span class="career-transfer">↗ transfer</span>' : '') + '</td>';
    html += '<td>' + (row.Pos || '—') + '</td>';

    CAREER_COLS.forEach(col => {
      const val  = safeNum(row[col.key]);
      const pval = prev ? safeNum(prev[col.key]) : NaN;
      const diff = (Number.isFinite(val) && Number.isFinite(pval)) ? val - pval : NaN;
      const inv  = typeof getInvertForStat === 'function' ? getInvertForStat(col.key) : false;
      const improved = Number.isFinite(diff) && (inv ? diff < -0.005 : diff > 0.005);
      const declined = Number.isFinite(diff) && (inv ? diff > 0.005 : diff < -0.005);
      const arrow = improved ? ' <span class="career-up">▲</span>'
                  : declined ? ' <span class="career-down">▼</span>' : '';
      html += '<td>' + _fmtC(col, val) + arrow + '</td>';
    });
    html += '</tr>';
  });

  html += '</tbody></table>';

  // Footer — current vs most recent prior season
  const curr = history.find(h => h._season === currentYear);
  const prev = [...history].reverse().find(h => h._season !== currentYear);
  if (curr && prev) {
    const summaryCols = CAREER_COLS.filter(c => ['PPG','RPG','APG','eFG%','BPM'].includes(c.key));
    const parts = summaryCols.map(col => {
      const c = safeNum(curr[col.key]);
      const p = safeNum(prev[col.key]);
      if (!Number.isFinite(c) || !Number.isFinite(p)) return null;
      const diff = c - p;
      if (Math.abs(diff) < 0.005) return null;
      const sign = diff > 0 ? '+' : '';
      const color = diff > 0 ? 'var(--good)' : 'var(--bad)';
      const fmtDiff = col.pct ? (diff * 100).toFixed(1) + '%' : diff.toFixed(col.dec);
      return '<span style="color:' + color + '">' + sign + fmtDiff + ' ' + col.label + '</span>';
    }).filter(Boolean);

    if (parts.length) {
      html += '<div class="career-footer">Compared to ' + prev._season +
        ' (' + (prev.Team || '—') + '): ' + parts.join(' · ') + '</div>';
    }
  }

  html += '</div>';
  el.innerHTML = html;
}

// ── renderTeamContext — AdjO/AdjD/AdjEM/Rank card inside player profile ─────
function renderTeamContext(r) {
  const el = document.getElementById('mTeamContext');
  if (!el) return;
  if (typeof league !== 'undefined' && league !== 'MBB') {
    const panel = document.getElementById('mTeamContextPanel');
    if (panel) panel.style.display = 'none';
    return;
  }
  const panel = document.getElementById('mTeamContextPanel');
  if (panel) panel.style.display = '';

  if (!_ratingsReady) {
    el.innerHTML = '<div class="muted" style="font-size:12px;padding:8px 0">Loading team ratings…</div>';
    window._onRatingsReady = () => { if (_currentProfilePlayer) renderTeamContext(_currentProfilePlayer); };
    return;
  }
  const t = teamRatings[(r.Team || '').toLowerCase()];
  if (!t) {
    el.innerHTML = '<div class="muted" style="font-size:12px;padding:8px 0">No ratings found for ' + (r.Team || 'this team') + '.</div>';
    return;
  }
  const pctOf = (arr, v) => !arr.length || !Number.isFinite(v) ? null : Math.round(arr.filter(x => x <= v).length / arr.length * 100);
  const adjOs = allRatingsData.map(x => x.adjO).filter(Number.isFinite).sort((a,b)=>a-b);
  const adjDs = allRatingsData.map(x => x.adjD).filter(Number.isFinite).sort((a,b)=>a-b);
  const oPct  = pctOf(adjOs, t.adjO);
  const dPct  = t.adjD != null ? (100 - pctOf(adjDs, t.adjD)) : null;
  const fmt   = (v, d=1) => Number.isFinite(+v) ? (+v).toFixed(d) : '—';
  const gc    = p => !Number.isFinite(p) ? 'var(--muted)' : p >= 80 ? 'var(--good)' : p >= 55 ? 'var(--accent)' : p >= 35 ? 'var(--warn)' : 'var(--bad)';
  const emSign = Number.isFinite(t.adjEM) && t.adjEM >= 0 ? '+' : '';
  const rankStr  = t.rank ? '#' + t.rank : '—';
  const rankColor = t.rank <= 10 ? 'var(--good)' : t.rank <= 25 ? 'var(--accent)' : t.rank <= 50 ? 'var(--warn)' : 'var(--muted)';
  el.innerHTML = `
    <div class="teamContextGrid">
      <div class="tcStat" title="Adjusted Offensive Efficiency — points scored per 100 possessions, adjusted for opponent difficulty. National avg ~105. Higher is better.">
        <div class="tcVal" style="color:${gc(oPct)}">${fmt(t.adjO)}</div>
        <div class="tcLabel">Adj O</div>
        <div class="tcPct">${oPct != null ? oPct+'th %ile' : '—'}</div>
        <div class="tcTip">pts/100 poss (adj)</div>
      </div>
      <div class="tcStat" title="Adjusted Defensive Efficiency — points allowed per 100 possessions, adjusted for opponent difficulty. National avg ~105. Lower is better.">
        <div class="tcVal" style="color:${gc(dPct)}">${fmt(t.adjD)}</div>
        <div class="tcLabel">Adj D</div>
        <div class="tcPct">${dPct != null ? dPct+'th %ile' : '—'}</div>
        <div class="tcTip">pts allowed/100 (adj)</div>
      </div>
      <div class="tcStat" title="Net Efficiency = Adj Offense − Adj Defense. The team's efficiency margin per 100 possessions. Positive means they outscore opponents per possession.">
        <div class="tcVal" style="color:${Number.isFinite(t.adjEM)&&t.adjEM>=0?'var(--good)':'var(--bad)'}">${emSign}${fmt(t.adjEM)}</div>
        <div class="tcLabel">Net Eff</div>
        <div class="tcPct">AdjO − AdjD</div>
        <div class="tcTip">efficiency margin</div>
      </div>
      <div class="tcStat" title="National ranking by Net Efficiency. #1 = most efficient team in the country.">
        <div class="tcVal" style="color:${rankColor};font-size:18px">${rankStr}</div>
        <div class="tcLabel">Natl Rank</div>
        <div class="tcPct">${Number.isFinite(t.srs) ? 'SRS '+fmt(t.srs) : '—'}</div>
        <div class="tcTip">by net efficiency</div>
      </div>
    </div>
    <div class="hint" style="margin-top:6px;font-size:11px">${t.conference || '—'}</div>`;
}

// ── _buildCourtHeatmap — SVG half-court zone heatmap ──────────────────────────
function _buildCourtHeatmap(p) {
  const dunks  = p.dunks             || {};
  const layups = p.layups            || {};
  const tipIns = p.tipIns            || {};
  const mid    = p.twoPointJumpers   || {};
  const three  = p.threePointJumpers || {};
  const ft     = p.freeThrows        || {};
  const bd     = p.attemptsBreakdown || {};

  // Restricted area = dunks + tip-ins combined (at-rim)
  const raAtt  = (dunks.attempted||0) + (tipIns.attempted||0);
  const raMade = (dunks.made||0) + (tipIns.made||0);
  const raPct  = raAtt > 0 ? Math.round(raMade / raAtt * 100) : null;
  const raVol  = Math.round(((bd.dunks||0) + (bd.tipIns||0)) * 10) / 10;

  const layupPct = layups.pct != null ? Math.round(+layups.pct) : null;
  const layupVol = Math.round((bd.layups||0) * 10) / 10;
  const midPct   = mid.pct   != null ? Math.round(+mid.pct)    : null;
  const midVol   = Math.round((bd.twoPointJumpers||0) * 10) / 10;
  const threePct = three.pct != null ? Math.round(+three.pct)  : null;
  const threeVol = Math.round((bd.threePointJumpers||0) * 10) / 10;
  const ftPct    = ft.pct    != null ? Math.round(+ft.pct)     : null;

  const NONE = '#080f1e';
  function zc(pct, vol) {
    if (pct == null || !vol) return NONE;
    if (pct >= 65) return 'rgba(21,128,61,0.78)';
    if (pct >= 55) return 'rgba(101,163,13,0.78)';
    if (pct >= 45) return 'rgba(161,98,7,0.78)';
    if (pct >= 35) return 'rgba(194,65,12,0.78)';
    return 'rgba(185,28,28,0.78)';
  }

  const W=400, H=455;
  const bX=200, bY=415;
  const pL=148, pR=252, pT=265;
  const ftY=265, ftR=52;
  const cX1=50, cX2=350, cY=325;
  // 3PT arc: M 50 325 A 187 187 0 0 0 350 325 (sweep=0 → arcs UP over top of key)

  const c3   = zc(threePct, threeVol);
  const cMid = zc(midPct, midVol);
  const cLay = zc(layupPct, layupVol);
  const cRA  = zc(raPct, raVol);
  const tW   = 'rgba(255,255,255,0.38)';
  const tD   = 'rgba(255,255,255,0.22)';

  function lbl(pct, made, att, vol, cx, cy, fs=12) {
    const has = pct != null && !!vol;
    const c1  = has ? 'rgba(255,255,255,0.95)' : tD;
    const c2  = 'rgba(255,255,255,0.5)';
    const pStr = pct != null ? pct + '%' : '—';
    const sub  = att ? made+'/'+att+' · '+vol+'%' : '';
    return '<text x="'+cx+'" y="'+cy+'" text-anchor="middle" font-family="inherit" font-size="'+fs+'" font-weight="700" fill="'+c1+'">'+pStr+'</text>'
         + (sub ? '<text x="'+cx+'" y="'+(cy+13)+'" text-anchor="middle" font-family="inherit" font-size="9" fill="'+c2+'">'+sub+'</text>' : '');
  }

  const ftColor = ftPct == null ? 'var(--muted)' : ftPct >= 75 ? 'var(--good)' : ftPct >= 60 ? 'var(--accent)' : ftPct >= 45 ? 'var(--warn)' : 'var(--bad)';

  return '<div class="courtHeatmapWrap">'
  + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'"'
  + ' style="width:100%;max-width:420px;display:block;margin:0 auto;border-radius:10px;overflow:hidden">'
  + '<defs><clipPath id="courtClip"><rect x="10" y="10" width="380" height="430"/></clipPath></defs>'
  // Court base
  + '<rect width="'+W+'" height="'+H+'" fill="#080f1e"/>'
  + '<rect x="10" y="10" width="380" height="430" rx="3" fill="#0d1b32"/>'
  // 3PT zone (fills entire court — inner zones will paint over it)
  + '<rect x="10" y="10" width="380" height="430" fill="'+c3+'" clip-path="url(#courtClip)"/>'
  // Mid-range zone (inside 3PT arc from baseline to arc)
  + '<path d="M '+cX1+' 440 L '+cX1+' '+cY+' A 187 187 0 0 0 '+cX2+' '+cY+' L '+cX2+' 440 Z" fill="'+cMid+'" clip-path="url(#courtClip)"/>'
  // FT circle upper half (mid-range above FT line, inside lane)
  + '<path d="M '+pL+' '+ftY+' A '+ftR+' '+ftR+' 0 0 0 '+pR+' '+ftY+' Z" fill="'+cMid+'"  clip-path="url(#courtClip)"/>'
  // Paint (layups region)
  + '<rect x="'+pL+'" y="'+pT+'" width="'+(pR-pL)+'" height="'+(440-pT)+'" fill="'+cLay+'"/>'
  // Restricted area (at-rim)
  + '<circle cx="'+bX+'" cy="'+bY+'" r="28" fill="'+cRA+'"/>'
  // ── Court lines ──
  + '<rect x="10" y="10" width="380" height="430" rx="3" fill="none" stroke="'+tW+'" stroke-width="1.5"/>'
  + '<rect x="'+pL+'" y="'+pT+'" width="'+(pR-pL)+'" height="'+(440-pT)+'" fill="none" stroke="'+tW+'" stroke-width="1.5"/>'
  + '<path d="M '+pL+' '+ftY+' A '+ftR+' '+ftR+' 0 0 0 '+pR+' '+ftY+'" fill="none" stroke="'+tW+'" stroke-width="1.5" stroke-dasharray="4 4"/>'
  + '<path d="M '+pL+' '+ftY+' A '+ftR+' '+ftR+' 0 0 1 '+pR+' '+ftY+'" fill="none" stroke="'+tW+'" stroke-width="1.5"/>'
  + '<circle cx="'+bX+'" cy="'+bY+'" r="28" fill="none" stroke="'+tW+'" stroke-width="1.5"/>'
  + '<line x1="'+cX1+'" y1="440" x2="'+cX1+'" y2="'+cY+'" stroke="'+tW+'" stroke-width="1.5"/>'
  + '<line x1="'+cX2+'" y1="440" x2="'+cX2+'" y2="'+cY+'" stroke="'+tW+'" stroke-width="1.5"/>'
  + '<path d="M '+cX1+' '+cY+' A 187 187 0 0 0 '+cX2+' '+cY+'" fill="none" stroke="'+tW+'" stroke-width="1.5"/>'
  // Backboard + basket
  + '<line x1="'+(bX-20)+'" y1="'+(bY-28)+'" x2="'+(bX+20)+'" y2="'+(bY-28)+'" stroke="rgba(255,175,40,0.85)" stroke-width="2.5"/>'
  + '<circle cx="'+bX+'" cy="'+bY+'" r="12" fill="none" stroke="rgba(255,175,40,0.85)" stroke-width="2.5"/>'
  // ── Zone labels ──
  // 3PT zone label
  + '<text x="200" y="112" text-anchor="middle" font-family="inherit" font-size="8" fill="'+tD+'">3-POINTERS · '+threeVol+'% of shots</text>'
  + lbl(threePct, three.made||0, three.attempted||0, threeVol, 200, 130, 14)
  // Mid-range labels (left & right)
  + '<text x="95" y="289" text-anchor="middle" font-family="inherit" font-size="8" fill="'+tD+'">MID-RANGE</text>'
  + lbl(midPct, mid.made||0, mid.attempted||0, midVol, 95, 305, 12)
  + '<text x="305" y="289" text-anchor="middle" font-family="inherit" font-size="8" fill="'+tD+'">MID-RANGE</text>'
  + (midPct != null ? '<text x="305" y="305" text-anchor="middle" font-family="inherit" font-size="12" font-weight="700" fill="rgba(255,255,255,0.92)">'+midPct+'%</text>' : '')
  // Layup label
  + '<text x="200" y="337" text-anchor="middle" font-family="inherit" font-size="8" fill="'+tD+'">LAYUPS</text>'
  + lbl(layupPct, layups.made||0, layups.attempted||0, layupVol, 200, 353, 13)
  // Restricted area label
  + '<text x="'+bX+'" y="'+(bY+5)+'" text-anchor="middle" font-family="inherit" font-size="10" font-weight="700" fill="rgba(255,255,255,0.9)">'
  + (raPct != null ? raPct+'%' : '—') + '</text>'
  + '<text x="'+bX+'" y="'+(bY+16)+'" text-anchor="middle" font-family="inherit" font-size="7" fill="'+tD+'">AT RIM</text>'
  + '</svg>'
  // Footer summary row
  + '<div class="courtFooter">'
  + '<div class="cfStat"><div class="cfVal" style="color:'+ftColor+'">'+( ftPct != null ? ftPct+'%' : '—')+'</div><div class="cfLabel">Free Throw</div><div class="cfSub">'+(ft.made||0)+'/'+(ft.attempted||0)+' made</div></div>'
  + '<div class="cfStat"><div class="cfVal">'+(p.trackedShots||0)+'</div><div class="cfLabel">Tracked Shots</div><div class="cfSub">'+(p.assistedPct||0)+'% ast · FTR '+(p.freeThrowRate||0)+'%</div></div>'
  + '</div>'
  // Heat legend
  + '<div class="courtLegend">'
  + '<div class="clItem"><span class="clDot" style="background:rgba(21,128,61,0.85)"></span>65%+</div>'
  + '<div class="clItem"><span class="clDot" style="background:rgba(101,163,13,0.85)"></span>55–64%</div>'
  + '<div class="clItem"><span class="clDot" style="background:rgba(161,98,7,0.85)"></span>45–54%</div>'
  + '<div class="clItem"><span class="clDot" style="background:rgba(194,65,12,0.85)"></span>35–44%</div>'
  + '<div class="clItem"><span class="clDot" style="background:rgba(185,28,28,0.85)"></span>&lt;35%</div>'
  + '<div class="clItem"><span class="clDot nz"></span>No data</div>'
  + '</div>'
  + '</div>';
}

// ── renderShootingZones — SVG court heatmap ───────────────────────────────────
async function renderShootingZones(r) {
  const el = document.getElementById('mShootingZones');
  if (!el) return;
  const panel = document.getElementById('mShootingPanel');
  if (typeof league !== 'undefined' && league !== 'MBB') {
    if (panel) panel.style.display = 'none';
    return;
  }
  if (panel) panel.style.display = '';
  el.innerHTML = '<div class="muted" style="font-size:12px;padding:8px 0">Loading shot data…</div>';

  const team = r.Team || '';
  const seasonEl = document.getElementById('cbdSeason');
  const season = seasonEl ? (seasonEl.value || '2026') : '2026';
  const playerName = (r.Player || '').toLowerCase().trim();

  const players = await loadShootingForTeam(team, season);
  if (!players || !players.length) {
    el.innerHTML = '<div class="muted" style="font-size:12px;padding:8px 0">No shooting data available.</div>';
    return;
  }
  const norm = s => (s || '').toLowerCase().trim();
  const p = players.find(x => norm(x.athleteName) === playerName)
         || players.find(x => {
           const n = norm(x.athleteName);
           const parts = playerName.split(' ');
           return parts.length > 1 && n.includes(parts[0]) && n.includes(parts[parts.length-1]);
         });
  if (!p) {
    el.innerHTML = '<div class="muted" style="font-size:12px;padding:8px 0">Shot data not available for this player.</div>';
    return;
  }
  el.innerHTML = _buildCourtHeatmap(p);
}

// ── renderRecruitingBadge — star-rating badge in profile header ───────────────
async function renderRecruitingBadge(r) {
  const el = document.getElementById('mRecruitBadge');
  if (!el) return;
  if (typeof league !== 'undefined' && league !== 'MBB') { el.style.display = 'none'; return; }

  const pName = (r.Player || '').toLowerCase().trim();
  const recruits = await loadRecruitingData();
  if (!recruits.length) { el.style.display = 'none'; return; }

  const norm = s => (s || '').toLowerCase().trim();
  const parts = pName.split(' ');
  const match = recruits.find(p => norm(p.name) === pName)
             || recruits.find(p => {
               const n = norm(p.name);
               return parts.length > 1 && n.includes(parts[0]) && n.includes(parts[parts.length-1]) && parts[parts.length-1].length > 2;
             });

  if (!match || !match.stars) { el.style.display = 'none'; return; }

  const stars   = Math.min(5, Math.max(0, match.stars));
  const filled  = '★'.repeat(stars);
  const empty   = '☆'.repeat(5 - stars);
  const rankStr = match.ranking ? ` · #${match.ranking}` : '';
  const classStr = match.classYear ? ` · Class of ${match.classYear}` : '';

  el.style.display = 'inline-flex';
  el.innerHTML = `<span class="recruitStars">${filled}<span style="opacity:.3">${empty}</span></span>
    <span class="recruitLabel">${stars}★ recruit${rankStr}${classStr}</span>`;
}

function openStatInfo(stat){
  const statBack = document.getElementById('statBack');
  const sClose = document.getElementById('sClose');
  const sTitle = document.getElementById('sTitle');
  const sDir = document.getElementById('sDir');
  const sDesc = document.getElementById('sDesc');
  const sMin = document.getElementById('sMin');
  const sMax = document.getElementById('sMax');
  const sDir2 = document.getElementById('sDir2');
  const sTip = document.getElementById('sTip');

  if(!statBack) { showWarn('Stat glossary modal not found in DOM.'); return; }

  const rule = (currentWeights[pos] || []).find(x => x.stat === stat);
  const isLower = getInvertForStat(stat);
  const desc = STAT_GLOSSARY[stat] || 'No description yet for this metric.';

  if(sTitle) sTitle.textContent = stat;
  if(sDir) sDir.textContent = prettyDir(isLower);
  if(sDir2) sDir2.textContent = prettyDir(isLower);
  if(sDesc) sDesc.textContent = desc;
  if(sMin) sMin.textContent = (rule && Number.isFinite(Number(rule.min))) ? Number(rule.min) : '—';
  if(sMax) sMax.textContent = (rule && Number.isFinite(Number(rule.max))) ? Number(rule.max) : '—';
  if(sTip) sTip.textContent = 'Tip: Set Min/Max to realistic bounds (or percentiles) so normalization is stable.';

  if(sClose && !sClose._bound){
    sClose.addEventListener('click', ()=> closeStatInfo());
    sClose._bound = true;
  }
  if(!statBack._bound){
    statBack.addEventListener('click', (e)=>{ if(e.target === statBack) closeStatInfo(); });
    statBack._bound = true;
  }

  statBack.style.display = 'flex';
}

function closeStatInfo(){
  const statBack = document.getElementById('statBack');
  if(statBack) statBack.style.display = 'none';
}

function openCompare(name1, name2){
  const all = tbGetAllPlayers();
  const n1 = name1.toLowerCase(), n2 = name2.toLowerCase();
  const p1 = all.find(r => (r.Player||'').toLowerCase().includes(n1));
  const p2 = all.find(r => (r.Player||'').toLowerCase().includes(n2));
  if(!p1||!p2) return false;

  _lastCompare = {name1: p1.Player, name2: p2.Player};
  window._lastCompare = _lastCompare;
  const reopenBtn = document.getElementById('aiReopenCmp');
  if(reopenBtn) reopenBtn.style.display = '';

  const cmpBack = document.getElementById('compareBack');
  const cmpBody = document.getElementById('cmpBody');
  document.getElementById('cmpClose').onclick = () => { cmpBack.style.display = 'none'; };
  cmpBack.onclick = e => { if(e.target === cmpBack) cmpBack.style.display = 'none'; };

  const stats = ['PPG','eFG%','3P%','3PT_Rating','FT%','APG','A/TO','RPG','SPG','BPG','DRtg','WS/40','BPM','USG%','TOPG','PER','3PA/G'];
  const lowerBetter = new Set(['DRtg','TOPG']);

  function pct(r, stat){
    const x = safeNum(r[stat]);
    const p = statPercentile(stat, x);
    return Number.isFinite(p) ? Math.round(p * 100) : null;
  }

  function statColor(p){ return p >= 80 ? 'var(--good)' : p >= 55 ? 'var(--accent)' : p >= 35 ? 'var(--warn)' : 'var(--bad)'; }

  function renderCol(player, otherPlayer){
    const perf = player.Score != null ? player.Score.toFixed(1) : '—';
    const val = player.ActualValuation_calc != null ? fmtMoney(player.ActualValuation_calc) : '—';
    const perfColor = player.Score >= 60 ? 'var(--good)' : player.Score >= 35 ? 'var(--warn)' : 'var(--bad)';

    let rows = '';
    stats.forEach(s => {
      const v = safeNum(player[s]);
      const ov = safeNum(otherPlayer[s]);
      const p = pct(player, s);
      const op = pct(otherPlayer, s);
      if(p === null && v === null) return;
      const win = p !== null && op !== null && (lowerBetter.has(s) ? p > op : p > op);
      const color = p !== null ? statColor(p) : 'var(--muted)';
      const displayVal = v !== null ? (Math.abs(v) < 1 && v !== 0 ? Number(v).toFixed(3) : Number(v).toFixed(1)) : '—';
      rows += `<div class="cmpStatRow">
        <span class="cmpLabel">${s}</span>
        <div class="cmpTrack"><div class="cmpFill" style="width:${p||0}%;background:${color}"></div></div>
        <span class="cmpVal ${win?'win':''}">${displayVal}</span>
        <span style="font-size:10px;color:${color};width:30px">${p !== null ? p+'th' : ''}</span>
      </div>`;
    });
    return `<div class="cmpCol">
      <div class="cmpName">${player.Player||'—'}</div>
      <div class="cmpSub">${[player.Team, player.Conference, player.Position].filter(Boolean).join(' • ')}</div>
      <div class="cmpScore"><span class="big" style="color:${perfColor}">${perf}</span><span class="val">${val}</span></div>
      ${rows}
    </div>`;
  }

  const s1 = p1.Score || 0, s2 = p2.Score || 0;
  const diff = Math.abs(s1 - s2).toFixed(1);
  let verdict = '';
  if(Math.abs(s1 - s2) <= 5) verdict = `Very close matchup — only ${diff} points apart. Decision comes down to team needs and fit.`;
  else if(s1 > s2) verdict = `<b>${p1.Player}</b> scores ${diff} points higher overall.`;
  else verdict = `<b>${p2.Player}</b> scores ${diff} points higher overall.`;

  const p1wins = [], p2wins = [];
  stats.forEach(s => {
    const a = pct(p1, s), b = pct(p2, s);
    if(a !== null && b !== null){
      if(a > b + 8) p1wins.push(s);
      if(b > a + 8) p2wins.push(s);
    }
  });
  if(p1wins.length) verdict += ` ${p1.Player} leads in ${p1wins.join(', ')}.`;
  if(p2wins.length) verdict += ` ${p2.Player} leads in ${p2wins.join(', ')}.`;

  const v1 = safeNum(p1.ActualValuation_calc)||0, v2 = safeNum(p2.ActualValuation_calc)||0;
  if(v1 !== v2) verdict += ` Value gap: $${Math.abs(v1 - v2).toLocaleString()} (${v1 < v2 ? p1.Player : p2.Player} is cheaper).`;

  cmpBody.innerHTML = `<div class="cmpGrid">
    ${renderCol(p1, p2)}
    ${renderCol(p2, p1)}
    <div class="cmpVerdict"><h4>📊 Verdict</h4><p>${verdict}</p>
      <div style="margin-top:8px;display:flex;gap:8px">
        <button class="secondary" onclick="window._app.openProfile(window._app.tbGetAllPlayers().find(r=>r.Player==='${(p1.Player||'').replace(/'/g,"\\'")}'));document.getElementById('compareBack').style.display='none'"
          style="padding:6px 12px;font-size:11px">View ${(p1.Player||'').split(' ')[0]}'s Profile</button>
        <button class="secondary" onclick="window._app.openProfile(window._app.tbGetAllPlayers().find(r=>r.Player==='${(p2.Player||'').replace(/'/g,"\\'")}'));document.getElementById('compareBack').style.display='none'"
          style="padding:6px 12px;font-size:11px">View ${(p2.Player||'').split(' ')[0]}'s Profile</button>
      </div>
    </div>
  </div>`;

  cmpBack.style.display = 'flex';
  return true;
}

// --- Class wrapper (organizational) ---
class ProfileManager {
  get currentProfilePlayer(){ return _currentProfilePlayer; }
  get lastCompare(){ return _lastCompare; }
  openProfile(r){ return openProfile(r); }
  closeProfile(){ return closeProfile(); }
  openStatInfo(stat){ return openStatInfo(stat); }
  closeStatInfo(){ return closeStatInfo(); }
  openCompare(n1, n2){ return openCompare(n1, n2); }
}

window.ProfileManager = new ProfileManager();
