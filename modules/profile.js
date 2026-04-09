// ============ PROFILE MODULE ============
// Dependencies: config.js (safeNum, fmtMoney, clamp, ROLE_DESCRIPTIONS, STAT_GLOSSARY),
//   data.js (pos, statDist, currentWeights, statPercentile, getInvertForStat, archetypeTags,
//            lastPerfStar, lastPerfAvg, barColor, bucketPosition, fitPresetEl,
//            confMultToggleEl, avgPayEl, starValueEl, starPctEl),
//   players.js (tbGetAllPlayers, tbPlayerKey — actually in teambuilder.js)

// --- Module-level state (global) ---
var _currentProfilePlayer = null;
var _lastCompare = null;
var _profileSimilarCacheRef = null;
var _profileSimilarCacheKey = '';
var _profileSimilarCacheRows = [];

function profileIsGuestDemo() {
  return typeof demoIsGuestMode === 'function' && demoIsGuestMode();
}

function profileDisplayMoney(value) {
  if (typeof demoFormatMoney === 'function') return demoFormatMoney(value);
  return fmtMoney(value);
}

function profilePctOrNull(player, stat) {
  var cached = player && player['_pct_' + stat];
  if (Number.isFinite(cached)) return cached;
  var value = safeNum(player && player[stat]);
  if (value === null) return null;
  var pct = statPercentile(stat, value);
  return Number.isFinite(pct) ? pct : null;
}

function profilePctOrMid(player, stat) {
  var pct = profilePctOrNull(player, stat);
  return pct == null ? 0.5 : pct;
}

function profileGetSimilarVectorRows(allPlayers, posGroup, keyStats) {
  var cacheKey = posGroup + '|' + keyStats.join('|');
  if (_profileSimilarCacheRef === allPlayers && _profileSimilarCacheKey === cacheKey) {
    return _profileSimilarCacheRows;
  }

  var rows = [];
  (allPlayers || []).forEach(function(player) {
    if (bucketPosition(player.Pos || player.Position) !== posGroup) return;
    rows.push({
      player: player,
      key: typeof tbPlayerKey === 'function' ? tbPlayerKey(player) : ((player.Player || '') + '||' + (player.Team || '')),
      vec: keyStats.map(function(stat) { return profilePctOrMid(player, stat); })
    });
  });

  _profileSimilarCacheRef = allPlayers;
  _profileSimilarCacheKey = cacheKey;
  _profileSimilarCacheRows = rows;
  return rows;
}

function profileProjectionCard(label, value, subtext, tone) {
  var toneClass = tone ? (' profileProjectionStat--' + tone) : '';
  return '<div class="profileProjectionStat' + toneClass + '">'
    + '<div class="profileProjectionStatLabel">' + label + '</div>'
    + '<div class="profileProjectionStatValue">' + value + '</div>'
    + '<div class="profileProjectionStatSub">' + subtext + '</div>'
    + '</div>';
}

function profileProjectionRangeCard(label, value, subtext, tone) {
  var toneClass = tone ? (' profileProjectionRangeCard--' + tone) : '';
  return '<div class="profileProjectionRangeCard' + toneClass + '">'
    + '<div class="profileProjectionRangeLabel">' + label + '</div>'
    + '<div class="profileProjectionRangeValue">' + value + '</div>'
    + '<div class="profileProjectionRangeSub">' + subtext + '</div>'
    + '</div>';
}

function renderProjectionDetails(r) {
  var summaryEl = document.getElementById('mProjectionSummary');
  var rangeEl = document.getElementById('mProjectionRange');
  if (!summaryEl && !rangeEl) return;

  var projectionPerf = safeNum(r.ProjectionPerf_calc);
  var confidence = safeNum(r.ProjectionConfidence_calc);
  var riskLabel = (r.ProjectionMedicalRiskLabel_calc || 'Low').toString();
  var talentLabel = (r.ProjectionHealthyTalentLabel_calc || 'Needs more data').toString();
  var reasonText = (r.ProjectionReasonSummary_calc || 'Projection range is still thin.').toString();
  var riskTone = projectionMedicalRiskTone(riskLabel);
  var confidenceTone = projectionConfidenceTone(confidence);

  if (summaryEl) {
    summaryEl.innerHTML = ''
      + profileProjectionCard('Projection', Number.isFinite(projectionPerf) ? projectionPerf.toFixed(2) : '—', 'blended healthy-talent score', 'neutral')
      + profileProjectionCard('Confidence', Number.isFinite(confidence) ? (Math.round(confidence * 100) + '%') : '—', (r.ProjectionConfidenceLabel_calc || 'Unknown').toString(), confidenceTone)
      + profileProjectionCard('Medical Risk', riskLabel, (r.ProjectionMedicalRiskSource_calc || 'model').toString(), riskTone)
      + profileProjectionCard('Healthy Talent', talentLabel, 'fully healthy role read', 'neutral');
  }

  if (rangeEl) {
    var floorValue = safeNum(r.ProjectionFloorValue_calc);
    var medianValue = safeNum(r.ProjectionMedianValue_calc);
    var ceilingValue = safeNum(r.ProjectionCeilingValue_calc);
    rangeEl.innerHTML = '<div class="profileProjectionRangeGrid">'
      + profileProjectionRangeCard('Floor', Number.isFinite(floorValue) ? profileDisplayMoney(floorValue) : '—', 'conservative outcome if risk wins', 'bad')
      + profileProjectionRangeCard('Median', Number.isFinite(medianValue) ? profileDisplayMoney(medianValue) : '—', 'fair operating expectation', 'warn')
      + profileProjectionRangeCard('Ceiling', Number.isFinite(ceilingValue) ? profileDisplayMoney(ceilingValue) : '—', 'fully healthy upside case', 'good')
      + '</div>'
      + '<div class="profileProjectionNote">Why the band is wide: ' + reasonText + '</div>';
  }
}

function profileShotTier(value, high, medium) {
  if (!Number.isFinite(value)) return 'Unknown';
  if (value >= high) return 'High';
  if (value >= medium) return 'Moderate';
  return 'Low';
}

function profileBuildGuestShotProfileHtml(p) {
  p = p || {};
  var bd = p.attemptsBreakdown || {};
  var layups = p.layups || {};
  var dunks = p.dunks || {};
  var tipIns = p.tipIns || {};
  var threes = p.threePointJumpers || {};
  var mids = p.twoPointJumpers || {};
  var ft = p.freeThrows || {};
  var rimShare = Number(bd.layups || 0) + Number(bd.dunks || 0) + Number(bd.tipIns || 0);
  var midShare = Number(bd.twoPointJumpers || 0);
  var threeShare = Number(bd.threePointJumpers || 0);
  var rimAttempts = Number(dunks.attempted || 0) + Number(tipIns.attempted || 0) + Number(layups.attempted || 0);
  var rimMade = Number(dunks.made || 0) + Number(tipIns.made || 0) + Number(layups.made || 0);
  var rimPct = rimAttempts ? (rimMade / rimAttempts) * 100 : null;
  var archetype = 'Balanced shot mix';
  if (rimShare >= 38 && threeShare >= 28) archetype = 'Rim + three pressure';
  else if (rimShare >= 42) archetype = 'Paint-first finisher';
  else if (threeShare >= 38) archetype = 'Perimeter-first shot diet';
  else if (midShare >= 28) archetype = 'Mid-range leaning scorer';

  function card(label, value, subtext) {
    return '<div class="miniStat"><div class="label">' + label + '</div><div class="value">' + value + '</div><div class="sub">' + subtext + '</div></div>';
  }

  return '' +
    '<div class="valueLabEmpty" style="display:block">' +
      '<div style="font-weight:700;color:var(--text);margin-bottom:6px">Shot profile preview</div>' +
      '<div class="muted" style="font-size:12px;line-height:1.55">Demo mode shows the broad shot tendencies and finishing profile without exposing the full internal chart or exact zone breakdown.</div>' +
    '</div>' +
    '<div class="miniStats" style="margin-top:10px">' +
      card('Rim pressure', profileShotTier(rimShare, 38, 22), 'based on at-rim share') +
      card('3PT volume', profileShotTier(threeShare, 34, 20), 'spacing + pull-up diet') +
      card('Mid-range', profileShotTier(midShare, 24, 12), 'in-between reliance') +
      card('At-rim finishing', profileShotTier(rimPct, 64, 52), 'conversion at the basket') +
      card('Free throws', profileShotTier(Number(ft.pct || 0), 75, 62), 'line reliability') +
      card('Archetype', archetype, 'summary label') +
    '</div>' +
    '<div class="hint" style="margin-top:10px">Full shot chart and exact zone percentages stay limited to approved staff accounts.</div>';
}

// --- Profile modal functions ---

function openProfile(r){
  const player = (r['Player'] ?? 'Player').toString();
  const team = (r['Team'] ?? '').toString();
  const conf = (r['Conference'] ?? r['Conf'] ?? '').toString();
  const position = (r['Pos'] ?? r['Position'] ?? pos).toString();

  mTitle.textContent = player;
  const _hin = Number(r['Height']);
  const height = (Number.isFinite(_hin) && _hin > 0) ? Math.floor(_hin/12) + "'" + (_hin%12) + '"' : (r['Height'] || '').toString().trim();
  mSub.textContent = [team, conf, position, height].filter(Boolean).join(' • ');
  document.getElementById('mLearnMore').href = 'https://www.google.com/search?q=' + encodeURIComponent(player + ' ' + team + ' basketball');
  var mScoreLabel = document.getElementById('mScoreLabel');
  var mValLabel = document.getElementById('mValLabel');
  var mMultLabel = document.getElementById('mMultLabel');
  var recommendedBid = safeNum(r.ActualValuation_calc);
  var baseBid = safeNum(r.ActualValuationBase_calc);
  var curveBid = safeNum(r.ActualValuationCurve_calc);
  var marketPressure = safeNum(r.MarketPressure_calc);
  var marketGap = safeNum(r.MarketGap_calc);
  var laneLabel = (r.MarketLaneLabel_calc || '').toString();
  var translationLabel = (r.TranslationRiskLabel_calc || '').toString();
  var translationLevel = (r.TranslationRiskLevel_calc || '').toString();
  var translationReasons = (r.TranslationRiskReasons_calc || '').toString().trim();
  var scoutAdjustLabel = (r.ScoutAdjustmentLabel_calc || '').toString();
  var scoutAdjustNote = (r.ScoutAdjustmentNote_calc || r.ProjectionScoutNote_calc || '').toString().trim();
  if (mScoreLabel) mScoreLabel.textContent = 'Production';
  if (mValLabel) mValLabel.textContent = 'Toledo max bid';
  if (mMultLabel) mMultLabel.textContent = 'Market pressure';
  mScore.textContent = Number.isFinite(r.Score) ? r.Score.toFixed(2) : '—';
  mFit.textContent = Number.isFinite(r.FitScore_calc) ? r.FitScore_calc.toFixed(0) : '—';
  mVal.textContent = Number.isFinite(recommendedBid) ? profileDisplayMoney(recommendedBid) : '—';
  mMult.textContent = Number.isFinite(marketPressure) ? profileDisplayMoney(marketPressure) : '—';

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
    bossLine = `Actual valuation: <b>${profileDisplayMoney(bossVal)}</b> • Model vs Boss: <b>${sign}${profileDisplayMoney(delta).replace('$','')}</b>${pctTxt}`;
  }

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
  var _barFrag = document.createDocumentFragment();
  var _fitText = fitPresetEl.options[fitPresetEl.selectedIndex].text;
  stats.forEach(stat=>{
    const x = safeNum(r[stat]);
    // Use cached percentile when available
    var cached = r['_pct_' + stat];
    const pct = Number.isFinite(cached) ? cached : statPercentile(stat, x);
    const item = document.createElement('div');
    item.className = 'barItem';
    const pctLabel = Number.isFinite(pct) ? `${Math.round(pct*100)}th` : '—';
    item.innerHTML = `
      <div class="barTop"><div><b>${stat}</b> <span class="muted">${(r[stat] ?? '—')}</span></div><div>${pctLabel}</div></div>
      <div class="barTrack"><div class="barFill" style="width:${Number.isFinite(pct) ? Math.round(pct*100) : 0}%;background:linear-gradient(90deg, ${barColor(pct)}, var(--accent2))"></div></div>
      <div class="barMeta"><span>${getInvertForStat(stat) ? 'Lower is better' : 'Higher is better'}</span><span class="muted">${_fitText}</span></div>
    `;
    _barFrag.appendChild(item);
  });
  mBars.appendChild(_barFrag);

  const avgPay = Number(avgPayEl.value);
  const starValue = Number(starValueEl.value);
  const starP = clamp(Number(starPctEl.value), 0.5, 0.999);
  const projectionNote = (r.ProjectionReasonSummary_calc || '').toString();
  const metaBlocks = [];
  if (translationLabel) {
    const translationBits = [`Auto translation: <b>${translationLevel || translationLabel}</b>`];
    if (Number.isFinite(curveBid) && Number.isFinite(baseBid) && Math.abs(curveBid - baseBid) > 1) {
      translationBits.push(`curve base <b>${profileDisplayMoney(curveBid)}</b>`);
      translationBits.push(`auto base <b>${profileDisplayMoney(baseBid)}</b>`);
    }
    metaBlocks.push(`<div class="muted">${translationBits.join(' • ')}</div>`);
  }
  if (scoutAdjustLabel) {
    const scoutBits = [`${scoutAdjustLabel}`];
    if (Number.isFinite(baseBid)) scoutBits.push(`pre-scout base <b>${profileDisplayMoney(baseBid)}</b>`);
    metaBlocks.push(`<div class="muted">${scoutBits.join(' • ')}</div>`);
  }
  if (Number.isFinite(marketPressure) && laneLabel) {
    const laneBits = [`Lane: <b>${laneLabel}</b>`];
    if (Number.isFinite(marketGap)) laneBits.push(`gap to pressure: <b>${profileDisplayMoney(marketGap)}</b>`);
    if (Number.isFinite(r.MinMultiplier_calc)) laneBits.push(`minutes multiplier: <b>${r.MinMultiplier_calc.toFixed(2)}x</b>`);
    metaBlocks.push(`<div class="muted">${laneBits.join(' • ')}</div>`);
  } else if (Number.isFinite(r.MinMultiplier_calc)) {
    metaBlocks.push(`<div class="muted">Minutes multiplier: <b>${r.MinMultiplier_calc.toFixed(2)}x</b></div>`);
  }
  if (bossLine) metaBlocks.push(`<div class="muted">${bossLine}</div>`);
  if (profileIsGuestDemo()) {
    metaBlocks.push(`
      <div class="muted">
        Demo mode keeps the player profile and decision outputs visible, but the exact valuation curves, weighting recipe, and shot-detail internals stay limited to approved staff accounts.
      </div>
    `);
  } else {
    metaBlocks.push(`
      <div class="muted">
        Toledo max bid uses your editable curve: at PerfScore <b>${starP.toFixed(2)} percentile</b> (~<b>${Number.isFinite(lastPerfStar)?lastPerfStar.toFixed(2):'N/A'}</b>),
        predicted pay is pulled toward <b>${fmtMoney(starValue)}</b>, with average anchored at <b>${fmtMoney(avgPay)}</b>.
        Market pressure is a separate fixed national curve for context.
      </div>
    `);
  }
  if (projectionNote) {
    metaBlocks.push(`<div class="muted">Projection note: <b>${projectionNote}</b>.</div>`);
  }
  if (translationReasons) {
    metaBlocks.push(`<div class="muted">Auto read: <b>${translationReasons}</b>.</div>`);
  }
  if (scoutAdjustNote) {
    metaBlocks.push(`<div class="muted">Scout note: <b>${scoutAdjustNote}</b>.</div>`);
  }
  mMeta.innerHTML = metaBlocks.join('');

  renderProjectionDetails(r);

  const exclude = new Set([
    'PerfScore_calc','PredictedValue_calc','ActualValuationCurve_calc','ActualValuationBase_calc','ActualValuation_calc','MinMultiplier_calc','MP_num','FitScore_calc',
    'MarketPressurePredicted_calc','MarketPressureMinMultiplier_calc','MarketPressure_calc','MarketGap_calc','MarketGapPct_calc','MarketLaneLabel_calc','MarketLaneTone_calc','BidToPressureRatio_calc',
    'TranslationRiskPct_calc','TranslationRiskMult_calc','TranslationRiskLabel_calc','TranslationRiskLevel_calc','TranslationRiskTone_calc','TranslationRiskReasons_calc','TranslationRiskSource_calc',
    'ScoutAdjustmentPct_calc','ScoutAdjustmentMult_calc','ScoutAdjustmentLabel_calc','ScoutAdjustmentTone_calc','ScoutAdjustmentNote_calc',
    'ProjectionGames_calc','ProjectionMinutesSample_calc','ProjectionPriorSeasons_calc','ProjectionPerf_calc',
    'ProjectionHealthyValue_calc','ProjectionMedianValue_calc','ProjectionFloorValue_calc','ProjectionCeilingValue_calc',
    'ProjectionConfidence_calc','ProjectionConfidenceLabel_calc','ProjectionConfidenceTone_calc',
    'ProjectionMedicalRisk_calc','ProjectionMedicalRiskLabel_calc','ProjectionMedicalRiskTone_calc','ProjectionMedicalRiskSource_calc',
    'ProjectionHealthyTalentLabel_calc','ProjectionReasonSummary_calc','ProjectionManualBoost_calc','ProjectionDelta_calc'
  ]);
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
    const keyStats = curPos === 'Guards'
      ? ['PPG','eFG%','3P%','APG','A/TO','SPG','BPM','DRtg']
      : ['PPG','eFG%','BPG','RPG','DRtg','BPM','FT%','A/TO'];
    const curVec = keyStats.map(function(stat) { return profilePctOrMid(r, stat); });
    const currentKey = tbPlayerKey(r);
    const samePos = profileGetSimilarVectorRows(allPlayers, curPos, keyStats).filter(function(entry) {
      return entry.key !== currentKey;
    });
    const scored = samePos.map(entry => {
      const x = entry.player;
      const xVec = entry.vec;
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
          <span style="font-size:11px"><b>${pp.Score?pp.Score.toFixed(1):'—'}</b> perf · ${pp.ActualValuation_calc?profileDisplayMoney(pp.ActualValuation_calc):'—'}</span>
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
  const scoutAdjustBtn = document.getElementById('mScoutAdjustBtn');
  if (scoutAdjustBtn) {
    scoutAdjustBtn.onclick = () => {
      if (typeof openProjectionScoutModal === 'function') openProjectionScoutModal(r);
    };
  }

  renderCareerHistory(r);
  renderGameLog(r);
  renderTeamContext(r);
  renderShootingZones(r);
  renderRecruitingBadge(r);
  renderScoutReport(r);
  if (typeof renderDraftRadar === 'function') renderDraftRadar(r);

  // Player shot chart (uses play-by-play data via worker)
  const mShotChart = document.getElementById('mShotChart');
  if (mShotChart) {
    if (profileIsGuestDemo()) {
      mShotChart.innerHTML = '<div class="valueLabEmpty" style="display:block"><div style="font-weight:700;color:var(--text);margin-bottom:6px">Full shot chart locked</div><div class="muted" style="font-size:12px;line-height:1.55">Demo mode shows the shot-profile preview and overall player evaluation, but the exact shot map, location counts, and zone percentages stay limited to approved staff accounts.</div></div>';
    } else {
      const yr = typeof thCurrentSeason !== 'undefined' ? thCurrentSeason : '2026';
      mShotChart.innerHTML = '<div class="muted" style="font-size:12px">Loading shot data...</div>';
      if (typeof loadPlayerShots === 'function') {
        loadPlayerShots(team, yr, player, r['EspnId'] || null).then(function(shots) {
          if (!shots || !shots.length) {
            mShotChart.innerHTML = '<div class="muted" style="font-size:12px">No shot-location data available for ' + player + ' this season.</div>';
            return;
          }
          var dotHtml = typeof _th_buildShotChartSVG === 'function'
            ? _th_buildShotChartSVG(shots, player, 'var(--accent)') : '';
          var hexHtml = typeof saBuildHexChart === 'function'
            ? saBuildHexChart(shots, player, {}) : '';
          var hasHex = !!hexHtml && typeof saBuildHexChart === 'function';
          var toggleBar = hasHex
            ? '<div class="saShotToggle">'
              + '<button class="saShotBtn active" data-view="dots" onclick="saToggleProfileChart(this,\'dots\')">Shots</button>'
              + '<button class="saShotBtn" data-view="hex" onclick="saToggleProfileChart(this,\'hex\')">Hex Map</button>'
              + '</div>'
            : '';
          mShotChart.innerHTML =
            '<div class="muted" style="font-size:10.5px;margin-bottom:6px">' + shots.length + ' shot attempts - ' + yr + ' season</div>'
            + toggleBar
            + '<div id="mShotChartDots">' + dotHtml + '</div>'
            + (hasHex ? '<div id="mShotChartHex" style="display:none">' + hexHtml + '</div>' : '');
          if (typeof thInitShotChart === 'function') thInitShotChart('mShotChartDots');
          if (hasHex && typeof saInitHexTooltips === 'function') saInitHexTooltips('mShotChartHex');
          enrichScoutReportWithShots(shots);
          if (typeof favsUpdateModalBtn === 'function') favsUpdateModalBtn(r);
        }).catch(function() {
          mShotChart.innerHTML = '<div class="muted" style="font-size:12px">Shot data unavailable.</div>';
        });
      }
    }
  }

  if (typeof favsUpdateModalBtn === 'function') favsUpdateModalBtn(r);
  var _shareBtn = document.getElementById('mShareBtn');
  if (_shareBtn) _shareBtn.onclick = function() { if (typeof sharesOpenSendModal === 'function') sharesOpenSendModal(r); };

  // ── 📝 Notes button: toggle per-player scout note drawer ─────────────────
  var _notesBtn    = document.getElementById('mNotesBtn');
  var _notesDrawer = document.getElementById('mNotesDrawer');
  var _scoutNotes  = document.getElementById('mScoutNotes');
  var _scoutStatus = document.getElementById('mScoutNoteStatus');
  if (_notesDrawer) _notesDrawer.style.display = 'none'; // hide on every new profile open
  if (_notesBtn && _notesDrawer) {
    _notesBtn.onclick = function() {
      var shown = _notesDrawer.style.display !== 'none';
      if (shown) {
        _notesDrawer.style.display = 'none';
      } else {
        _notesDrawer.style.display = 'flex';
        // Load existing [Scout] note for this player
        if (typeof notesState !== 'undefined') {
          var titleKey  = '[Scout] ' + player;
          var existing  = notesState.notes.find(function(n) { return String(n.title || '') === titleKey; });
          if (_scoutNotes) {
            _scoutNotes.value    = existing ? (existing.content || '') : '';
            _scoutNotes._noteId  = existing ? String(existing.id)      : null;
          }
          if (_scoutStatus) _scoutStatus.textContent = '';
        }
      }
    };
  }
  if (_scoutNotes) {
    var _scoutTimer = null;
    _scoutNotes.oninput = function() {
      if (_scoutStatus) _scoutStatus.textContent = 'Unsaved\u2026';
      clearTimeout(_scoutTimer);
      var _savedPlayer = player;
      _scoutTimer = setTimeout(async function() {
        if (typeof authIsGuest === 'function' && authIsGuest()) {
          if (_scoutStatus) _scoutStatus.textContent = 'Login to save';
          return;
        }
        if (typeof notesFetch !== 'function') return;
        var content   = _scoutNotes.value;
        var noteTitle = '[Scout] ' + _savedPlayer;
        try {
          if (_scoutNotes._noteId) {
            await notesFetch('/' + _scoutNotes._noteId, {
              method: 'PUT',
              body: JSON.stringify({ title: noteTitle, content: content }),
            });
            if (typeof notesState !== 'undefined') {
              var idx = notesState.notes.findIndex(function(n) { return String(n.id) === _scoutNotes._noteId; });
              if (idx !== -1) notesState.notes[idx] = Object.assign({}, notesState.notes[idx], { content: content });
            }
          } else {
            var newNote = await notesFetch('', {
              method: 'POST',
              body: JSON.stringify({ title: noteTitle, content: content }),
            });
            if (newNote && newNote.id) {
              var norm = Object.assign({}, newNote, { id: String(newNote.id) });
              if (typeof notesState !== 'undefined') notesState.notes.unshift(norm);
              _scoutNotes._noteId = norm.id;
            }
          }
          if (_scoutStatus) _scoutStatus.textContent = 'Saved \u2713';
          if (typeof notesRenderList === 'function') notesRenderList();
        } catch(e2) {
          if (_scoutStatus) _scoutStatus.textContent = 'Save failed';
        }
      }, 1500);
    };
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
    // Use pre-computed percentile if available (cached in computeAll)
    var cached = r['_pct_' + stat];
    if(Number.isFinite(cached)) return cached;
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

  // ── Scoring Consistency (requires game field — added to worker 2026-03) ────
  var shotsWithGame = shots.filter(function(s) { return s.game; });
  if (shotsWithGame.length >= 20) {
    var gamePoints = {};
    var pointFor = { rim: 2, jumper: 2, three_pointer: 3, free_throw: 1 };
    shotsWithGame.forEach(function(s) {
      if (!s.made) return;
      if (!gamePoints[s.game]) gamePoints[s.game] = 0;
      gamePoints[s.game] += (pointFor[s.range] || 2);
    });
    var gamePtsArr = Object.values(gamePoints);
    if (gamePtsArr.length >= 8) {
      var mean = gamePtsArr.reduce(function(a, v) { return a + v; }, 0) / gamePtsArr.length;
      var variance = gamePtsArr.reduce(function(a, v) { return a + (v - mean) * (v - mean); }, 0) / gamePtsArr.length;
      var stdDev = Math.sqrt(variance);
      var cv = mean > 0 ? stdDev / mean : 0;
      var minPts = Math.min.apply(null, gamePtsArr);
      var maxPts = Math.max.apply(null, gamePtsArr);

      // Consistency label
      var cLabel, cClass;
      if (cv < 0.28) {
        cLabel = 'Iron Man — exceptionally consistent scorer every night';
        cClass = 'scoutItem--strength';
      } else if (cv < 0.40) {
        cLabel = 'Reliable — steady output with limited game-to-game variance';
        cClass = '';
      } else if (cv < 0.55) {
        cLabel = 'Streaky — output varies significantly; big games mixed with quiet ones';
        cClass = '';
      } else {
        cLabel = 'Boom-or-bust scorer — extreme night-to-night variance';
        cClass = 'scoutItem--weakness';
      }

      // Inject ±σ badge next to PPG value in stat bars
      var barItems = document.querySelectorAll('#mBars .barItem');
      barItems.forEach(function(item) {
        var bEl = item.querySelector('.barTop b');
        if (bEl && bEl.textContent.trim() === 'PPG') {
          var muteEl = item.querySelector('.barTop .muted');
          if (muteEl && !muteEl.querySelector('.sigmaTag')) {
            var badge = document.createElement('span');
            badge.className = 'sigmaTag';
            badge.title = 'Std dev of per-game scoring (' + gamePtsArr.length + ' games)';
            badge.textContent = ' ±' + stdDev.toFixed(1);
            muteEl.appendChild(badge);
          }
        }
      });

      // Add Consistency scout section (game log data will replace this if available)
      el.insertAdjacentHTML('beforeend',
        '<div class="scoutSection scoutConsistency">'
        + '<div class="scoutSectionHead">📊 Consistency</div>'
        + '<div class="scoutItems">'
        + '<div class="scoutItem ' + cClass + '">' + cLabel + '</div>'
        + '<div class="scoutItem">' + mean.toFixed(1) + ' pts/game ± ' + stdDev.toFixed(1) + ' σ over ' + gamePtsArr.length + ' games · range ' + minPts + '–' + maxPts + ' pts</div>'
        + '</div>'
        + '</div>');
    }
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
    if (typeof loadCareerSeasons === 'function') loadCareerSeasons().catch(() => {});
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
    if (typeof loadTeamRatings === 'function') loadTeamRatings(_currentDataSeason).catch(() => {});
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
  const trackedShots = Number.isFinite(+p.trackedShots) ? Math.round(+p.trackedShots) : 0;
  const astText = Number.isFinite(+p.assistedPct) ? (Math.round(+p.assistedPct) + '%') : '—';
  const ftrText = Number.isFinite(+p.freeThrowRate) ? (Math.round(+p.freeThrowRate) + '%') : '—';

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
  + '<div class="cfStat"><div class="cfVal">'+trackedShots+'</div><div class="cfLabel">Tracked Shots</div><div class="cfSub">'+astText+' ast · FTR '+ftrText+'</div></div>'
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
  const season = typeof getDashboardSelectedSeason === 'function'
    ? getDashboardSelectedSeason('2026')
    : '2026';
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
  if (profileIsGuestDemo()) {
    el.innerHTML = profileBuildGuestShotProfileHtml(p);
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
    const p = profilePctOrNull(r, stat);
    return Number.isFinite(p) ? Math.round(p * 100) : null;
  }

  function statColor(p){ return p >= 80 ? 'var(--good)' : p >= 55 ? 'var(--accent)' : p >= 35 ? 'var(--warn)' : 'var(--bad)'; }

  function renderCol(player, otherPlayer){
    const perf = player.Score != null ? player.Score.toFixed(1) : '—';
    const val = player.ActualValuation_calc != null ? profileDisplayMoney(player.ActualValuation_calc) : '—';
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
  if(v1 !== v2) {
    if (profileIsGuestDemo()) verdict += ` Value band edge: ${v1 < v2 ? p1.Player : p2.Player} projects cheaper in demo mode.`;
    else verdict += ` Value gap: $${Math.abs(v1 - v2).toLocaleString()} (${v1 < v2 ? p1.Player : p2.Player} is cheaper).`;
  }

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

// ── Game Log ─────────────────────────────────────────────────────────────────
async function renderGameLog(r) {
  const el = document.getElementById('mGameLog');
  if (!el) return;
  el.innerHTML = '<div class="muted" style="font-size:12px">Loading game log…</div>';

  const yr     = (typeof thCurrentSeason !== 'undefined' ? thCurrentSeason : null) || '2026';
  const player = (r.Player || '').toString();
  const team   = (r.Team   || '').toString();
  const isWbb  = (typeof league !== 'undefined') && league === 'WBB';

  try {
    let games = [];
    if (isWbb) {
      games = await _fetchWbbGameLog(r, yr);
    } else {
      const url = WORKER_URL + '/api/cbdata/playergamelog?team=' + encodeURIComponent(team)
                + '&season=' + encodeURIComponent(yr)
                + '&playerName=' + encodeURIComponent(player);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      games = data.games || [];
    }

    if (!games.length) {
      el.innerHTML = '<div class="muted" style="font-size:12px">No game log available.</div>';
      return;
    }

    const rows = games.map(function(g) {
      const isPost  = g.isTournament === true || g.seasonType === 'postseason';
      const neutral = g.neutralSite;
      const loc     = g.homeAway === 'A' ? '@ ' : neutral ? 'vs ' : 'vs ';
      const opp     = (g.opponent || g.opponentTeam || '?');
      const dateStr = (g.date || '').slice(0, 10).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3');
      const res     = (g.result || '—');
      const won     = res.startsWith('W');
      const lost    = res.startsWith('L');
      const postBadge = isPost
        ? '<span class="pill" style="font-size:9px;padding:1px 4px;margin-left:5px;border-color:rgba(251,191,36,.5);color:var(--warn)">POST</span>'
        : '';
      const mins    = g.minutes !== null && g.minutes !== undefined ? g.minutes : '—';
      const fgStr   = (g.fga > 0) ? g.fgm + '/' + g.fga : '—';
      const rowBg    = isPost ? 'background:rgba(251,191,36,.04)' : '';
      const hasStats = g.statsAvailable !== false;
      const dash     = '<span style="color:var(--muted)">—</span>';
      const pts  = hasStats ? (g.points   !== null ? g.points   : '—') : dash;
      const reb  = hasStats ? (g.rebounds !== null ? g.rebounds : '—') : dash;
      const ast  = hasStats ? (g.assists  !== null ? g.assists  : '—') : dash;
      const stl  = hasStats ? (g.steals   !== null ? g.steals   : '—') : dash;
      const blk  = hasStats ? (g.blocks   !== null ? g.blocks   : '—') : dash;
      const fg   = hasStats && g.fga > 0 ? g.fgm + '/' + g.fga : dash;
      const mn   = hasStats && g.minutes !== null ? g.minutes : dash;
      return '<tr style="' + rowBg + '">'
        + '<td style="white-space:nowrap;color:var(--muted);padding:4px 8px 4px 0">' + dateStr + postBadge + '</td>'
        + '<td style="white-space:nowrap;padding:4px 8px">' + loc + opp + '</td>'
        + '<td style="font-weight:600;padding:4px 8px;color:' + (won ? 'var(--good)' : lost ? 'var(--bad)' : 'var(--muted)') + '">' + res + '</td>'
        + '<td style="font-weight:700;text-align:right;padding:4px 8px">' + pts + '</td>'
        + '<td style="text-align:right;padding:4px 8px">' + reb + '</td>'
        + '<td style="text-align:right;padding:4px 8px">' + ast + '</td>'
        + '<td style="text-align:right;padding:4px 8px;color:var(--muted)">' + stl + '</td>'
        + '<td style="text-align:right;padding:4px 8px;color:var(--muted)">' + blk + '</td>'
        + '<td style="text-align:right;padding:4px 8px;color:var(--muted)">' + fg + '</td>'
        + '<td style="text-align:right;padding:4px 8px;color:var(--muted)">' + mn + '</td>'
        + '</tr>';
    }).join('');

    const postCount = games.filter(function(g) { return g.isTournament || g.seasonType === 'postseason'; }).length;
    const postNote  = postCount > 0 ? ' · <span style="color:var(--warn)">' + postCount + ' postseason</span>' : '';

    el.innerHTML =
      '<div style="overflow-x:auto">'
      + '<table style="width:100%;font-size:11.5px;border-collapse:collapse">'
      + '<thead><tr style="color:var(--muted);font-size:10.5px;border-bottom:1px solid var(--line)">'
      + '<th style="text-align:left;padding:4px 8px 4px 0">Date</th>'
      + '<th style="text-align:left;padding:4px 8px">Opponent</th>'
      + '<th style="text-align:left;padding:4px 8px">Result</th>'
      + '<th style="text-align:right;padding:4px 8px">PTS</th>'
      + '<th style="text-align:right;padding:4px 8px">REB</th>'
      + '<th style="text-align:right;padding:4px 8px">AST</th>'
      + '<th style="text-align:right;padding:4px 8px">STL</th>'
      + '<th style="text-align:right;padding:4px 8px">BLK</th>'
      + '<th style="text-align:right;padding:4px 8px">FG</th>'
      + '<th style="text-align:right;padding:4px 8px">MIN</th>'
      + '</tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '</table></div>'
      + '<div style="font-size:10.5px;color:var(--muted);margin-top:6px">'
      + games.length + ' games · ' + yr + ' season' + postNote
      + '</div>';

    // Re-run scout report consistency section using live game log data
    var gamePts = games.map(function(g) { return Number(g.points) || 0; }).filter(function(v) { return v > 0; });
    if (gamePts.length >= 5) {
      enrichScoutReportWithGameLog(gamePts);
    }
  } catch(_) {
    el.innerHTML = '<div class="muted" style="font-size:12px">Game log unavailable.</div>';
  }
}

async function _fetchWbbGameLog(r, season) {
  var espnId = r.EspnId;
  if (!espnId) return [];
  var url = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/womens-college-basketball/athletes/'
          + espnId + '/gamelog?season=' + encodeURIComponent(season);
  var resp = await fetch(url);
  if (!resp.ok) return [];
  var data = await resp.json();

  var games   = [];
  var events  = data.events || {};
  var stypes  = data.seasonTypes || [];

  stypes.forEach(function(st) {
    var isPost = (st.type === 3 || Number(st.id) === 3 || (st.displayName || '').toLowerCase().includes('post'));
    (st.categories || []).forEach(function(cat) {
      var labels = cat.labels || data.labels || [];
      (cat.events || []).forEach(function(ev) {
        var stats   = ev.stats || [];
        var statMap = {};
        labels.forEach(function(lbl, i) { statMap[lbl] = stats[i]; });

        var evInfo  = events[String(ev.eventId)] || {};
        var opp     = (evInfo.opponent || {});
        var dateStr = ((evInfo.gameDate || evInfo.date || '').slice(0, 10));
        var homeAway = (evInfo.homeAway || 'home').toLowerCase() === 'home' ? 'H' : 'A';
        var evNote  = evInfo.eventNote || '';
        var isTournament = isPost || /quarterfinal|semifinal|\bfinal\b|championship|tournament.*round|\d+(st|nd|rd|th) round/i.test(evNote);
        var score   = (evInfo.score || '').split('-').map(Number);
        var result  = '—';
        if (score.length === 2 && !isNaN(score[0]) && !isNaN(score[1])) {
          var myS  = homeAway === 'H' ? score[0] : score[1];
          var oppS = homeAway === 'H' ? score[1] : score[0];
          var res  = evInfo.gameResult || (myS > oppS ? 'W' : 'L');
          result   = res + ' ' + myS + '-' + oppS;
        }
        var pts = parseInt(statMap['PTS'] || 0) || 0;
        var reb = parseInt(statMap['REB'] || 0) || 0;
        var ast = parseInt(statMap['AST'] || 0) || 0;
        var stl = parseInt(statMap['STL'] || 0) || 0;
        var blk = parseInt(statMap['BLK'] || 0) || 0;
        var min = statMap['MIN'] || null;
        var fgRaw = (statMap['FGM-FGA'] || statMap['FG'] || '').split('-');
        var fgm = parseInt(fgRaw[0]) || 0;
        var fga = parseInt(fgRaw[1]) || 0;
        games.push({
          date:         dateStr,
          opponent:     opp.displayName || opp.abbreviation || '',
          homeAway:     homeAway,
          neutralSite:  false,
          result:       result,
          seasonType:   isTournament ? 'postseason' : 'regular',
          isTournament: isTournament,
          gameNotes:    evNote || null,
          statsAvailable: true,
          points:       pts,
          rebounds:     reb,
          assists:      ast,
          steals:       stl,
          blocks:       blk,
          minutes:      min,
          fgm:          fgm,
          fga:          fga,
        });
      });
    });
  });

  return games.sort(function(a, b) { return a.date.localeCompare(b.date); });
}

function enrichScoutReportWithGameLog(gamePts) {
  var el = document.getElementById('mScoutReport');
  if (!el) return;
  // Remove prior consistency section if re-running
  var existing = el.querySelector('.scoutConsistency');
  if (existing) existing.remove();
  var n    = gamePts.length;
  var mean = gamePts.reduce(function(s, v) { return s + v; }, 0) / n;
  var variance = gamePts.reduce(function(s, v) { return s + (v - mean) * (v - mean); }, 0) / n;
  var stdDev   = Math.sqrt(variance);
  var cv       = mean > 0 ? stdDev / mean : 0;
  var cLabel, cClass;
  if      (cv < 0.28) { cLabel = 'Iron Man — exceptionally consistent scorer every night'; cClass = 'scoutItem--strength'; }
  else if (cv < 0.40) { cLabel = 'Reliable — steady output with limited game-to-game variance'; cClass = ''; }
  else if (cv < 0.55) { cLabel = 'Streaky — output varies significantly; big games mixed with quiet ones'; cClass = ''; }
  else                { cLabel = 'Boom-or-bust scorer — extreme night-to-night variance'; cClass = 'scoutItem--weakness'; }
  var minP = Math.min.apply(null, gamePts), maxP = Math.max.apply(null, gamePts);
  el.insertAdjacentHTML('beforeend',
    '<div class="scoutSection scoutConsistency">'
    + '<div class="scoutSectionHead">📊 Consistency</div>'
    + '<div class="scoutItems">'
    + '<div class="scoutItem ' + cClass + '">' + cLabel + '</div>'
    + '<div class="scoutItem">' + mean.toFixed(1) + ' pts/game ± ' + stdDev.toFixed(1) + ' σ over ' + n + ' games · range ' + minP + '–' + maxP + ' pts</div>'
    + '</div></div>');
}
