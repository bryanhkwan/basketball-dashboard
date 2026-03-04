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

  modalBack.style.display = 'flex';
}

function closeProfile(){ modalBack.style.display = 'none'; }

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
