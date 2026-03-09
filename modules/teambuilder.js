// ============ TEAM BUILDER MODULE ============
// Dependencies: config.js (safeNum, fmtMoney, GAP_CATEGORIES, GAP_EXPLANATIONS),
//   data.js (league, pos, computed, statDist, statPercentile, tbAllComputed, clearWarn, showWarn),
//   players.js (renderPlayersPage),
//   profile.js (openProfile)

// --- Module-level state (global) ---
var tbRoster = [];
var oppRoster = [];

// --- DOM refs ---
var tbBudgetEl, tbPlayerCapEl, tbMaxRosterEl, tbCountEl, tbMaxLabelEl;
var tbCostEl, tbRemainingEl, tbPosNoteEl, tbRosterBody, tbRosterEmpty;
var tbGapBars, tbGapEmpty, tbGapTags, tbSuggestBody, tbSuggestEmpty, tbClearBtn;
var tbWeakThreshEl, tbWeakThreshLabelEl;
// Opponent DOM refs
var oppRosterBody, oppRosterEmpty, oppGapBars, oppGapEmpty, oppGapTags;
var oppBudgetEl, oppCountEl, oppCostEl;
// H2H DOM refs
var h2hBars;

// --- Performance: batch mode + player pool cache ---
var _tbBatchMode = false;
var _cachedAllPlayers = null;
var _cachedAllPlayersLg = '';

function initTeamBuilderDOMRefs(){
  tbBudgetEl = document.getElementById('tbBudget');
  tbPlayerCapEl = document.getElementById('tbPlayerCap');
  tbMaxRosterEl = document.getElementById('tbMaxRoster');
  tbCountEl = document.getElementById('tbCount');
  tbMaxLabelEl = document.getElementById('tbMaxLabel');
  tbCostEl = document.getElementById('tbCost');
  tbRemainingEl = document.getElementById('tbRemaining');
  tbPosNoteEl = document.getElementById('tbPosNote');
  tbRosterBody = document.getElementById('tbRosterBody');
  tbRosterEmpty = document.getElementById('tbRosterEmpty');
  tbGapBars = document.getElementById('tbGapBars');
  tbGapEmpty = document.getElementById('tbGapEmpty');
  tbGapTags = document.getElementById('tbGapTags');
  tbSuggestBody = document.getElementById('tbSuggestBody');
  tbSuggestEmpty = document.getElementById('tbSuggestEmpty');
  tbClearBtn = document.getElementById('tbClear');
  tbWeakThreshEl = document.getElementById('tbWeakThresh');
  tbWeakThreshLabelEl = document.getElementById('tbWeakThreshLabel');
  oppRosterBody = document.getElementById('oppRosterBody');
  oppRosterEmpty = document.getElementById('oppRosterEmpty');
  oppGapBars = document.getElementById('oppGapBars');
  oppGapEmpty = document.getElementById('oppGapEmpty');
  oppGapTags = document.getElementById('oppGapTags');
  oppBudgetEl = document.getElementById('oppBudget');
  oppCountEl = document.getElementById('oppCount');
  oppCostEl = document.getElementById('oppCost');
  h2hBars = document.getElementById('h2hBars');
}

// --- Core helpers ---

function tbPlayerKey(r){ return (r.Player||'') + '||' + (r.Team||''); }

function tbPlayerLeague(r){
  for(const [key, arr] of Object.entries(tbAllComputed)){
    if(arr.some(x => tbPlayerKey(x) === tbPlayerKey(r))){
      return key.startsWith('MBB') ? 'MBB' : 'WBB';
    }
  }
  return league;
}

function tbPosGroup(r){
  const p = (r.Position||r.Pos||'').toString().toLowerCase();
  if(p === 'guards' || p.includes('guard') || p === 'g' || p === 'g-f' || p === 'f-g' || p === 'pg' || p === 'sg') return 'guard';
  if(p === 'bigs' || p.includes('forward') || p.includes('center') || p === 'f' || p === 'c' || p === 'f-c' || p === 'c-f' || p === 'pf' || p === 'sf') return 'big';
  if(r._tbPosGroup) return r._tbPosGroup;
  return 'guard';
}

function tbGetAllPlayers(forLeague){
  const lg = forLeague || league;
  if(_cachedAllPlayers && _cachedAllPlayersLg === lg) return _cachedAllPlayers;
  const seen = new Set();
  const all = [];
  for(const [key, arr] of Object.entries(tbAllComputed)){
    if(!key.startsWith(lg + '_')) continue;
    const posLabel = key.includes('Guards') ? 'guard' : 'big';
    arr.forEach(r => {
      const pk = tbPlayerKey(r);
      if(seen.has(pk)) return;
      seen.add(pk);
      if(!(r.Position||r.Pos||'').toString().trim()){
        r._tbPosGroup = posLabel;
      }
      all.push(r);
    });
  }
  _cachedAllPlayers = all;
  _cachedAllPlayersLg = lg;
  return all;
}

function tbPlayerAvgPct(r){
  const pg = tbPosGroup(r);
  const cats = pg === 'guard' ? (GAP_CATEGORIES.Guards || []) : (GAP_CATEGORIES.Bigs || []);
  let sum = 0, cnt = 0;
  cats.forEach(cat => {
    cat.stats.forEach(stat => {
      if(!statDist[stat]) return;
      const x = safeNum(r[stat]);
      if(x === null) return;
      const p = statPercentile(stat, x);
      if(Number.isFinite(p)){ sum += p; cnt++; }
    });
  });
  return cnt > 0 ? sum / cnt : 0;
}

// --- Add/Remove ---

function tbAddPlayer(r){
  const maxR = Number(tbMaxRosterEl.value) || 13;
  if(tbRoster.length >= maxR){ showWarn(`Roster full (max ${maxR}).`); return; }
  if(tbRoster.some(x => tbPlayerKey(x) === tbPlayerKey(r))) return;
  const playerLg = tbPlayerLeague(r);
  if(tbRoster.length > 0){
    const rosterLg = tbPlayerLeague(tbRoster[0]);
    if(playerLg !== rosterLg){
      showWarn(`Cannot add ${playerLg} player to a ${rosterLg} roster. Clear roster first or switch leagues.`);
      return;
    }
  }
  if(playerLg !== league){
    showWarn(`${r.Player} is a ${playerLg} player but you're in ${league} mode. Switch to ${playerLg} first.`);
    return;
  }
  const cap = Number(tbPlayerCapEl.value) || Infinity;
  const val = safeNum(r.ActualValuation_calc) || 0;
  if(Number.isFinite(cap) && val > cap){ showWarn(`${r.Player} ($${val.toLocaleString()}) exceeds per-player cap ($${cap.toLocaleString()}).`); return; }
  const budget = Number(tbBudgetEl.value) || Infinity;
  const used = tbRoster.reduce((s,x) => s + (safeNum(x.ActualValuation_calc)||0), 0);
  if(Number.isFinite(budget) && used + val > budget){ showWarn(`Adding ${r.Player} would exceed budget.`); return; }
  tbRoster.push(r);
  clearWarn();
  if(!_tbBatchMode) tbRefresh();
}

function tbRemovePlayer(idx){
  tbRoster.splice(idx, 1);
  tbRefresh();
}

// --- Opponent ---

function oppAddPlayer(r){
  const roster = oppRoster;
  if(roster.some(x => tbPlayerKey(x) === tbPlayerKey(r))) return;
  roster.push(r);
  if(!_tbBatchMode){
    oppRefresh();
    var _pp = document.getElementById('pagePlayers');
    if(!_pp || _pp.style.display !== 'none') renderPlayersPage();
  }
}

function oppRemovePlayer(idx){
  oppRoster.splice(idx, 1);
  oppRefresh();
}

function oppRefresh(){
  if(!oppRosterBody) return;
  oppRosterBody.innerHTML = '';
  if(oppRosterEmpty) oppRosterEmpty.style.display = oppRoster.length ? 'none' : 'block';

  const totalCost = oppRoster.reduce((s,x) => s + (safeNum(x.ActualValuation_calc)||0), 0);
  if(oppCountEl) oppCountEl.textContent = oppRoster.length;
  if(oppCostEl) oppCostEl.textContent = fmtMoney(totalCost);

  oppRoster.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-size:11px;color:var(--muted)">${i+1}</td>
      <td><span class="link" style="font-size:11.5px">${r.Player||'—'}</span></td>
      <td style="font-size:11px">${r.Team||'—'}</td>
      <td style="font-size:11px">${r.Position||r.Pos||(tbPosGroup(r)==='guard'?'Guard':'Big')}</td>
      <td style="font-size:11.5px;font-weight:700">${Number.isFinite(r.Score)?r.Score.toFixed(1):'—'}</td>
      <td style="font-size:11.5px">${fmtMoney(safeNum(r.ActualValuation_calc))}</td>
      <td><button class="tbRemoveBtn">✕</button></td>
    `;
    tr.querySelector('.link').addEventListener('click', () => openProfile(r));
    tr.querySelector('.tbRemoveBtn').addEventListener('click', () => oppRemovePlayer(i));
    oppRosterBody.appendChild(tr);
  });

  if(oppGapBars && oppGapEmpty && oppGapTags){
    tbRenderGapBarsForRoster(oppRoster, oppGapBars, oppGapEmpty, oppGapTags);
  }

  // Quick scout for opponent
  const oppScoutEl = document.getElementById('oppQuickScout');
  if(oppScoutEl && oppRoster.length >= 2){
    const allCats = [...(GAP_CATEGORIES.Guards||[]),...(GAP_CATEGORIES.Bigs||[])];
    const seen = new Set();
    const cats = allCats.filter(c => { if(seen.has(c.label)) return false; seen.add(c.label); return true; });
    const weak = [], strong = [];
    cats.forEach(cat => {
      let sum = 0, count = 0;
      cat.stats.forEach(stat => {
        if(!statDist[stat]) return;
        oppRoster.forEach(r => {
          const x = safeNum(r[stat]);
          if(x === null) return;
          const p = statPercentile(stat, x);
          if(Number.isFinite(p)){ sum += p; count++; }
        });
      });
      const avgPct = count > 0 ? sum / count : 0.5;
      if(avgPct < 0.40) weak.push(cat.label);
      else if(avgPct >= 0.65) strong.push(cat.label);
    });
    let scoutHtml = '';
    if(strong.length) scoutHtml += `<div class="muted" style="font-size:11.5px">⚠ <b>Strong areas:</b> ${strong.join(', ')} — defend these!</div>`;
    if(weak.length) scoutHtml += `<div class="muted" style="font-size:11.5px">✅ <b>Weak areas:</b> ${weak.join(', ')} — exploit these!</div>`;
    if(!scoutHtml) scoutHtml = `<div class="muted" style="font-size:11.5px">Balanced opponent — no obvious weaknesses.</div>`;
    oppScoutEl.innerHTML = scoutHtml;
  }

  h2hRefresh();
}

// --- Gap bars shared renderer ---

function tbRenderGapBarsForRoster(roster, barsEl, emptyEl, tagsEl){
  barsEl.innerHTML = '';
  if(tagsEl) tagsEl.innerHTML = '';
  if(!roster.length){ if(emptyEl) emptyEl.style.display = 'block'; return; }
  if(emptyEl) emptyEl.style.display = 'none';

  const hasGuards = roster.some(r => tbPosGroup(r) === 'guard');
  const hasBigs = roster.some(r => tbPosGroup(r) !== 'guard');
  let cats = [];
  if(hasGuards && hasBigs){
    const all = [...(GAP_CATEGORIES.Guards||[]), ...(GAP_CATEGORIES.Bigs||[])];
    const seen = new Set();
    cats = all.filter(c => { if(seen.has(c.label)) return false; seen.add(c.label); return true; });
  } else if(hasBigs){
    cats = GAP_CATEGORIES.Bigs || [];
  } else {
    cats = GAP_CATEGORIES.Guards || [];
  }

  const gaps = [];
  cats.forEach(cat => {
    let sum = 0, count = 0;
    cat.stats.forEach(stat => {
      if(!statDist[stat]) return;
      roster.forEach(r => {
        const x = safeNum(r[stat]);
        if(x === null) return;
        const p = statPercentile(stat, x);
        if(Number.isFinite(p)){ sum += p; count++; }
      });
    });
    const avgPct = count > 0 ? sum / count : 0.5;
    const pct100 = Math.round(avgPct * 100);
    const level = avgPct < 0.35 ? 'weak' : avgPct < 0.55 ? 'ok' : 'strong';
    const color = level === 'weak' ? 'var(--bad)' : level === 'ok' ? 'var(--warn)' : 'var(--good)';

    gaps.push({label:cat.label, avgPct, level, stats:cat.stats});

    const div = document.createElement('div');
    div.className = 'gapBar';
    div.innerHTML = `
      <div class="gapBarLabel"><span>${cat.icon} ${cat.label}</span><span style="color:${color};font-weight:700">${pct100}th</span></div>
      <div class="gapBarTrack"><div class="gapBarFill" style="width:${pct100}%;background:${color}"></div></div>
    `;
    barsEl.appendChild(div);
  });

  if(tagsEl){
    gaps.forEach(g => {
      const tag = document.createElement('span');
      tag.className = `gapTag ${g.level}`;
      tag.textContent = g.level === 'weak' ? `Weak: ${g.label}` : g.level === 'ok' ? `Avg: ${g.label}` : `Strong: ${g.label}`;
      tag.title = 'Click for explanation';
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.gapExplain').forEach(el => el.remove());
        const expl = GAP_EXPLANATIONS[g.label] || 'No description available.';
        const levelText = g.level === 'weak' ? 'Your team is weak here.' : g.level === 'ok' ? 'Your team is average here.' : 'Your team is strong here.';
        const tip = document.createElement('div');
        tip.className = 'gapExplain';
        tip.innerHTML = `<span class="gapExplainClose" id="gapTipClose">✕</span><b>${g.label}</b> — ${expl}<br><br><em style="color:${g.level==='weak'?'var(--bad)':g.level==='ok'?'var(--warn)':'var(--good)'}">${levelText} (${Math.round(g.avgPct*100)}th percentile)</em>`;
        document.body.appendChild(tip);
        const rect = e.target.getBoundingClientRect();
        const tipHeight = tip.offsetHeight || 140;
        const spaceBelow = window.innerHeight - rect.bottom;
        const leftPos = Math.max(8, Math.min(rect.left, window.innerWidth - 340));
        tip.style.left = leftPos + 'px';
        if(spaceBelow < tipHeight + 16){
          tip.style.top = Math.max(8, rect.top - tipHeight - 8) + 'px';
        } else {
          tip.style.top = (rect.bottom + 8) + 'px';
        }
        const closeTip = () => { tip.remove(); };
        tip.querySelector('#gapTipClose').addEventListener('click', closeTip);
        setTimeout(() => {
          const dismiss = (ev) => { if(!tip.contains(ev.target) && ev.target !== e.target){ closeTip(); document.removeEventListener('click', dismiss); }};
          document.addEventListener('click', dismiss);
        }, 50);
      });
      tagsEl.appendChild(tag);
    });
  }
}

// --- H2H refresh ---

function h2hRefresh(){
  const barsEl = document.getElementById('h2hBars');
  const emptyEl = document.getElementById('h2hEmpty');
  if(!barsEl) return;

  barsEl.innerHTML = '';
  if(!tbRoster.length || !oppRoster.length){
    if(emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if(emptyEl) emptyEl.style.display = 'none';

  const hasGuards = tbRoster.some(r=>tbPosGroup(r)==='guard') || oppRoster.some(r=>tbPosGroup(r)==='guard');
  const hasBigs = tbRoster.some(r=>tbPosGroup(r)!=='guard') || oppRoster.some(r=>tbPosGroup(r)!=='guard');
  let cats = [];
  if(hasGuards && hasBigs){
    const all = [...(GAP_CATEGORIES.Guards||[]), ...(GAP_CATEGORIES.Bigs||[])];
    const seen = new Set(); cats = all.filter(c=>{if(seen.has(c.label))return false;seen.add(c.label);return true;});
  } else if(hasBigs){ cats = GAP_CATEGORIES.Bigs||[]; }
  else { cats = GAP_CATEGORIES.Guards||[]; }

  // Legend
  const legend = document.createElement('div');
  legend.className = 'h2hLegend';
  legend.innerHTML = `<span><span class="dot" style="background:#60a5fa"></span>My Team</span><span><span class="dot" style="background:#f87171"></span>Opponent</span>`;
  barsEl.appendChild(legend);

  const catResults = [];
  cats.forEach(cat => {
    let mySum=0, myCount=0, oppSum=0, oppCount=0;
    cat.stats.forEach(stat => {
      if(!statDist[stat]) return;
      tbRoster.forEach(r=>{ const x=safeNum(r[stat]); if(x===null)return; const p=statPercentile(stat,x); if(Number.isFinite(p)){mySum+=p;myCount++;} });
      oppRoster.forEach(r=>{ const x=safeNum(r[stat]); if(x===null)return; const p=statPercentile(stat,x); if(Number.isFinite(p)){oppSum+=p;oppCount++;} });
    });
    const myPct = Math.round((myCount>0?mySum/myCount:0.5)*100);
    const oppPct = Math.round((oppCount>0?oppSum/oppCount:0.5)*100);
    const myWins = myPct >= oppPct;
    const margin = Math.abs(myPct - oppPct);
    catResults.push({label:cat.label, icon:cat.icon, myPct, oppPct, myWins, margin});

    // Winner's number: brighter + highlight pill; loser's: dimmed
    const myNumStyle = myWins
      ? `font-weight:800;font-size:13px;color:#60a5fa;min-width:42px;text-align:right;background:rgba(96,165,250,0.15);border-radius:4px;padding:1px 6px`
      : `font-weight:500;font-size:11px;color:rgba(96,165,250,0.35);min-width:42px;text-align:right`;
    const oppNumStyle = !myWins
      ? `font-weight:800;font-size:13px;color:#f87171;min-width:42px;background:rgba(248,113,113,0.15);border-radius:4px;padding:1px 6px`
      : `font-weight:500;font-size:11px;color:rgba(248,113,113,0.35);min-width:42px`;

    const row = document.createElement('div');
    row.className = 'h2hRow';
    row.innerHTML = `
      <div class="h2hRowLabel">
        <span style="${myNumStyle}">${myPct}th</span>
        <span class="catLabel">${cat.icon} ${cat.label}</span>
        <span style="${oppNumStyle}">${oppPct}th</span>
      </div>
      <div class="h2hDualTrack">
        <div class="h2hTrackLeft"><div class="h2hFillLeft" style="width:${myPct}%;background:#60a5fa"></div></div>
        <div class="h2hDot"></div>
        <div class="h2hTrackRight"><div class="h2hFillRight" style="width:${oppPct}%;background:#f87171"></div></div>
      </div>
    `;
    barsEl.appendChild(row);
  });

  // Auto-analysis section
  const myTeamName = tbRoster[0]?.Team || 'My Team';
  const oppTeamName = oppRoster[0]?.Team || 'Opponent';
  const myAdvantages = catResults.filter(r => r.myWins && r.margin >= 10);
  const oppAdvantages = catResults.filter(r => !r.myWins && r.margin >= 10);
  const myWinCount = catResults.filter(r => r.myWins).length;

  const analysis = document.createElement('div');
  analysis.className = 'h2hAnalysis';

  const overallText = myWinCount > catResults.length/2
    ? `<b style="color:#60a5fa">${myTeamName}</b> leads in ${myWinCount}/${catResults.length} categories`
    : myWinCount < catResults.length/2
    ? `<b style="color:#f87171">${oppTeamName}</b> leads in ${catResults.length-myWinCount}/${catResults.length} categories`
    : `Even matchup — each team leads ${myWinCount} categories`;

  const strengthsHtml = myAdvantages.length
    ? myAdvantages.map(r=>`<span class="h2hTag h2hTagMy">${r.icon} ${r.label} <b>+${r.margin}</b></span>`).join('')
    : `<span style="color:var(--muted);font-size:11px">No significant advantages</span>`;

  const vulnsHtml = oppAdvantages.length
    ? oppAdvantages.map(r=>`<span class="h2hTag h2hTagOpp">${r.icon} ${r.label} <b>+${r.margin}</b></span>`).join('')
    : `<span style="color:var(--muted);font-size:11px">No significant vulnerabilities</span>`;

  analysis.innerHTML = `
    <div class="h2hAnalysisOverall">${overallText}</div>
    <div class="h2hAnalysisBlock">
      <div class="h2hAnalysisTitle" style="color:#60a5fa">✅ ${myTeamName}'s Strengths</div>
      <div class="h2hTagRow">${strengthsHtml}</div>
    </div>
    <div class="h2hAnalysisBlock">
      <div class="h2hAnalysisTitle" style="color:#f87171">⚠️ Vulnerabilities vs ${oppTeamName}</div>
      <div class="h2hTagRow">${vulnsHtml}</div>
    </div>
  `;
  barsEl.appendChild(analysis);
}

// --- Quick add widget ---
// getRoster: optional function returning the current roster array (used for on-roster highlighting)

function setupQuickAdd(inputId, dropdownId, addFn, getRoster){
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if(!input || !dropdown) return;
  if(!getRoster) getRoster = () => tbRoster;

  function closeDropdown(){ dropdown.innerHTML = ''; dropdown.style.display = 'none'; }

  function renderDropdown(q){
    const pool = tbGetAllPlayers();
    const roster = getRoster();
    const rosterKeys = new Set(roster.map(tbPlayerKey));

    // --- Team matches ---
    const allTeams = [...new Set(pool.map(r => r.Team).filter(Boolean))];
    const matchedTeams = allTeams.filter(t => t.toLowerCase().includes(q));

    // --- Player name matches (exclude players whose team is already shown as a team row) ---
    const teamRowSet = new Set(matchedTeams.map(t => t.toLowerCase()));
    const playerMatches = pool
      .filter(r => (r.Player||'').toLowerCase().includes(q) && !teamRowSet.has((r.Team||'').toLowerCase()))
      .slice(0, 8);

    if(!matchedTeams.length && !playerMatches.length){ closeDropdown(); return; }

    let html = '';

    // Team rows
    matchedTeams.slice(0, 4).forEach(team => {
      const teamPlayers = pool.filter(r => r.Team === team);
      const alreadyOnRoster = teamPlayers.filter(r => rosterKeys.has(tbPlayerKey(r))).length;
      const toAdd = teamPlayers.length - alreadyOnRoster;
      html += `
        <div class="tbQuickAddItem tbQuickTeamRow" data-team="${team}">
          <div>
            <div class="qName">🏀 ${team}</div>
            <div class="qMeta">${teamPlayers.length} players${alreadyOnRoster ? ` · ${alreadyOnRoster} already added` : ''}</div>
          </div>
          <button class="qAdd qAddAll" data-team="${team}" ${toAdd === 0 ? 'disabled' : ''}>
            ${toAdd === 0 ? '✓ All added' : `+ Add all ${toAdd}`}
          </button>
        </div>`;
    });

    // Player rows
    playerMatches.forEach(r => {
      const onRoster = rosterKeys.has(tbPlayerKey(r));
      html += `
        <div class="tbQuickAddItem" data-key="${tbPlayerKey(r)}">
          <div>
            <div class="qName">${r.Player}</div>
            <div class="qMeta">${r.Team||''} · ${r.Position||r.Pos||''} · ${r.Score?r.Score.toFixed(1):'—'} perf</div>
          </div>
          <button class="qAdd${onRoster ? ' on-roster' : ''}" ${onRoster ? 'disabled' : ''}>${onRoster ? '✓ Added' : '+ Add'}</button>
        </div>`;
    });

    dropdown.innerHTML = html;
    dropdown.style.display = 'block';

    // "Add all" for team rows
    dropdown.querySelectorAll('.qAddAll').forEach(btn => {
      if(btn.disabled) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const team = btn.dataset.team;
        const teamPlayers = pool.filter(r => r.Team === team);
        _tbBatchMode = true;
        teamPlayers.forEach(r => addFn(r));
        _tbBatchMode = false;
        if(addFn === tbAddPlayer) tbRefresh();
        else oppRefresh();
        input.value = '';
        closeDropdown();
      });
    });

    // Individual player rows
    dropdown.querySelectorAll('.tbQuickAddItem:not(.tbQuickTeamRow)').forEach(el => {
      const addBtn = el.querySelector('.qAdd:not(.on-roster)');
      const doAdd = () => {
        const key = el.dataset.key;
        const player = pool.find(r => tbPlayerKey(r) === key);
        if(player){ addFn(player); input.value = ''; closeDropdown(); }
      };
      el.addEventListener('click', (e) => { if(e.target.tagName !== 'BUTTON') doAdd(); });
      if(addBtn) addBtn.addEventListener('click', (e) => { e.stopPropagation(); doAdd(); });
    });
  }

  let _timer = null;
  input.addEventListener('input', () => {
    clearTimeout(_timer);
    const q = input.value.trim().toLowerCase();
    if(!q){ closeDropdown(); return; }
    _timer = setTimeout(() => renderDropdown(q), 120);
  });

  document.addEventListener('click', (e) => {
    if(!dropdown.contains(e.target) && e.target !== input) closeDropdown();
  });
}

// --- tbRefresh (main roster refresh) ---

function tbRefresh(){
  const maxR = Number(tbMaxRosterEl.value) || 13;
  const budget = Number(tbBudgetEl.value) || 0;
  const totalCost = tbRoster.reduce((s,x) => s + (safeNum(x.ActualValuation_calc)||0), 0);

  const badge = document.getElementById('tbLeagueBadge');
  if(badge){
    const rosterLg = tbRoster.length > 0 ? tbPlayerLeague(tbRoster[0]) : league;
    badge.textContent = rosterLg;
    badge.style.background = rosterLg === 'MBB' ? 'rgba(0,62,126,.4)' : 'rgba(147,51,234,.3)';
    badge.style.borderColor = rosterLg === 'MBB' ? 'rgba(0,62,126,.6)' : 'rgba(147,51,234,.5)';
  }

  tbMaxLabelEl.textContent = maxR;
  tbCountEl.textContent = tbRoster.length;
  tbCostEl.textContent = fmtMoney(totalCost);
  const rem = budget - totalCost;
  tbRemainingEl.textContent = fmtMoney(rem);
  tbRemainingEl.style.color = rem < 0 ? 'var(--bad)' : rem < budget * 0.1 ? 'var(--warn)' : 'var(--good)';

  let guards = 0, bigs = 0;
  tbRoster.forEach(r => {
    const pg = tbPosGroup(r);
    if(pg === 'guard') guards++;
    else bigs++;
  });

  const targetG = Number(document.getElementById('tbTargetGuards').value) || 0;
  const targetB = Number(document.getElementById('tbTargetBigs').value) || 0;
  document.getElementById('tbGuardCount').textContent = guards;
  document.getElementById('tbGuardTarget').textContent = targetG;
  document.getElementById('tbBigCount').textContent = bigs;
  document.getElementById('tbBigTarget').textContent = targetB;

  document.getElementById('tbGuardCount').style.color = guards > targetG ? 'var(--bad)' : guards < targetG ? 'var(--warn)' : 'var(--good)';
  document.getElementById('tbBigCount').style.color = bigs > targetB ? 'var(--bad)' : bigs < targetB ? 'var(--warn)' : 'var(--good)';

  const rebalanceSection = document.getElementById('tbRebalanceSection');
  const rebalanceInfo = document.getElementById('tbRebalanceInfo');
  const excessGuards = guards - targetG;
  const excessBigs = bigs - targetB;

  if(tbRoster.length >= 2 && (excessGuards > 0 || excessBigs > 0)){
    rebalanceSection.style.display = '';
    const allPool = tbGetAllPlayers();
    const rosterKeys = new Set(tbRoster.map(tbPlayerKey));
    const cap = Number(tbPlayerCapEl.value) || Infinity;
    rebalanceInfo.innerHTML = '';

    if(excessGuards > 0 && bigs < targetB){
      const neededBigs = targetB - bigs;
      const swapCount = Math.min(excessGuards, neededBigs);
      const rosterGuards = tbRoster.map((r,i)=>({r,i,pct:tbPlayerAvgPct(r)})).filter(x=>tbPosGroup(x.r)==='guard').sort((a,b)=>a.pct-b.pct);
      const toDrop = rosterGuards.slice(0, swapCount);

      const usedBigKeys = new Set();
      const allBigs = allPool.filter(c => !rosterKeys.has(tbPlayerKey(c)) && tbPosGroup(c)==='big' && (safeNum(c.ActualValuation_calc)||0) <= cap)
        .sort((a,b)=>(b.Score||0)-(a.Score||0));

      const header = document.createElement('div');
      header.style.cssText = 'margin-bottom:6px;font-size:11.5px';
      header.innerHTML = `You have <b style="color:var(--warn)">${excessGuards} extra guard${excessGuards>1?'s':''}</b> and need <b style="color:var(--warn)">${neededBigs} more big${neededBigs>1?'s':''}</b>. Click a swap to execute:`;
      rebalanceInfo.appendChild(header);

      toDrop.forEach(({r: grd, i: gIdx, pct}) => {
        const bigCand = allBigs.find(c => !usedBigKeys.has(tbPlayerKey(c)));
        if(bigCand) usedBigKeys.add(tbPlayerKey(bigCand));

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:5px 0;flex-wrap:wrap;font-size:11.5px';
        const gVal = safeNum(grd.ActualValuation_calc)||0;

        if(bigCand){
          const cVal = safeNum(bigCand.ActualValuation_calc)||0;
          row.innerHTML = `
            <span class="tbAddBtn" data-rebal-drop="${gIdx}" data-rebal-add="${tbPlayerKey(bigCand)}" style="font-size:10px;border-color:rgba(251,191,36,.4);color:var(--warn)">Swap</span>
            <b style="color:var(--bad)">${grd.Player}</b> <span class="muted">(${Math.round(pct*100)}th, ${fmtMoney(gVal)})</span>
            <span style="color:var(--muted)">→</span>
            <b style="color:var(--good)">${bigCand.Player}</b> <span class="muted">(${bigCand.Position||'Big'}, ${(bigCand.Score||0).toFixed(1)} perf, ${fmtMoney(cVal)})</span>
          `;
        } else {
          row.innerHTML = `<b style="color:var(--bad)">${grd.Player}</b> <span class="muted">(${Math.round(pct*100)}th, ${fmtMoney(gVal)}) — no big candidates in budget</span>`;
        }
        rebalanceInfo.appendChild(row);
      });
    }

    if(excessBigs > 0 && guards < targetG){
      const neededGuards = targetG - guards;
      const swapCount = Math.min(excessBigs, neededGuards);
      const rosterBigs = tbRoster.map((r,i)=>({r,i,pct:tbPlayerAvgPct(r)})).filter(x=>tbPosGroup(x.r)!=='guard').sort((a,b)=>a.pct-b.pct);
      const toDrop = rosterBigs.slice(0, swapCount);

      const usedGrdKeys = new Set();
      const allGrds = allPool.filter(c => !rosterKeys.has(tbPlayerKey(c)) && tbPosGroup(c)==='guard' && (safeNum(c.ActualValuation_calc)||0) <= cap)
        .sort((a,b)=>(b.Score||0)-(a.Score||0));

      const header = document.createElement('div');
      header.style.cssText = 'margin-bottom:6px;margin-top:8px;font-size:11.5px';
      header.innerHTML = `You have <b style="color:var(--warn)">${excessBigs} extra big${excessBigs>1?'s':''}</b> and need <b style="color:var(--warn)">${neededGuards} more guard${neededGuards>1?'s':''}</b>. Click a swap to execute:`;
      rebalanceInfo.appendChild(header);

      toDrop.forEach(({r: big, i: bIdx, pct}) => {
        const grdCand = allGrds.find(c => !usedGrdKeys.has(tbPlayerKey(c)));
        if(grdCand) usedGrdKeys.add(tbPlayerKey(grdCand));

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:5px 0;flex-wrap:wrap;font-size:11.5px';
        const bVal = safeNum(big.ActualValuation_calc)||0;

        if(grdCand){
          const cVal = safeNum(grdCand.ActualValuation_calc)||0;
          row.innerHTML = `
            <span class="tbAddBtn" data-rebal-drop="${bIdx}" data-rebal-add="${tbPlayerKey(grdCand)}" style="font-size:10px;border-color:rgba(251,191,36,.4);color:var(--warn)">Swap</span>
            <b style="color:var(--bad)">${big.Player}</b> <span class="muted">(${Math.round(pct*100)}th, ${fmtMoney(bVal)})</span>
            <span style="color:var(--muted)">→</span>
            <b style="color:var(--good)">${grdCand.Player}</b> <span class="muted">(${grdCand.Position||'Guard'}, ${(grdCand.Score||0).toFixed(1)} perf, ${fmtMoney(cVal)})</span>
          `;
        } else {
          row.innerHTML = `<b style="color:var(--bad)">${big.Player}</b> <span class="muted">(${Math.round(pct*100)}th, ${fmtMoney(bVal)}) — no guard candidates in budget</span>`;
        }
        rebalanceInfo.appendChild(row);
      });
    }

    if(excessGuards > 0 && bigs >= targetB){
      const note = document.createElement('div');
      note.style.cssText = 'margin-top:6px;font-size:11.5px';
      note.innerHTML = `You have <b style="color:var(--warn)">${excessGuards} extra guard${excessGuards>1?'s':''}</b> — consider removing your weakest guard(s) to hit target.`;
      rebalanceInfo.appendChild(note);
    }
    if(excessBigs > 0 && guards >= targetG){
      const note = document.createElement('div');
      note.style.cssText = 'margin-top:6px;font-size:11.5px';
      note.innerHTML = `You have <b style="color:var(--warn)">${excessBigs} extra big${excessBigs>1?'s':''}</b> — consider removing your weakest big(s) to hit target.`;
      rebalanceInfo.appendChild(note);
    }

    rebalanceInfo.querySelectorAll('[data-rebal-drop]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dropIdx = Number(btn.dataset.rebalDrop);
        const addKey = btn.dataset.rebalAdd;
        const replacement = tbGetAllPlayers().find(r => tbPlayerKey(r) === addKey);
        if(replacement && dropIdx >= 0 && dropIdx < tbRoster.length){
          tbRoster.splice(dropIdx, 1, replacement);
          clearWarn();
          tbRefresh();
        }
      });
    });

    tbPosNoteEl.style.display = 'none';
  } else {
    rebalanceSection.style.display = 'none';
    if(tbRoster.length >= 3){
      const ratio = guards / (tbRoster.length);
      if(ratio > 0.75){ tbPosNoteEl.style.display = ''; tbPosNoteEl.textContent = `⚠ Heavy on guards (${guards}G / ${bigs}B)`; }
      else if(ratio < 0.25){ tbPosNoteEl.style.display = ''; tbPosNoteEl.textContent = `⚠ Heavy on bigs (${guards}G / ${bigs}B)`; }
      else { tbPosNoteEl.style.display = 'none'; }
    } else { tbPosNoteEl.style.display = 'none'; }
  }

  tbRenderRoster();
  tbRenderGaps();
  tbRenderSuggestions();
  // Only re-render player table if Players page is visible
  var _pp = document.getElementById('pagePlayers');
  if(!_pp || _pp.style.display !== 'none') renderPlayersPage();
  h2hRefresh();
}

// --- Roster render ---

function tbRenderRoster(){
  tbRosterBody.innerHTML = '';
  tbRosterEmpty.style.display = tbRoster.length ? 'none' : 'block';
  const weakestSection = document.getElementById('tbWeakestSection');
  const weakestInfo = document.getElementById('tbWeakestInfo');
  const weakCountEl = document.getElementById('tbWeakCount');

  const threshold = (Number(tbWeakThreshEl.value) || 40) / 100;

  const rosterScored = tbRoster.map((r, i) => ({r, i, avgPct: tbPlayerAvgPct(r)}));
  const weakPlayers = rosterScored.filter(x => x.avgPct < threshold);
  const weakIdxSet = new Set(weakPlayers.map(x => x.i));

  tbRoster.forEach((r, i) => {
    const tr = document.createElement('tr');
    const isWeak = weakIdxSet.has(i);
    tr.className = 'tbRosterRow' + (isWeak ? ' tbWeakest' : '');
    const pctVal = rosterScored[i]?.avgPct ?? 0;
    const pctStr = Math.round(pctVal * 100) + 'th';
    tr.innerHTML = `
      <td style="font-size:11px;color:var(--muted)">${i+1}</td>
      <td><span class="link" style="font-size:11.5px">${r.Player||'—'}</span>${isWeak ? ' <span class="tbWeakestTag">weak</span>' : ''}</td>
      <td style="font-size:11px">${r.Team||'—'}</td>
      <td style="font-size:11px">${r.Position||r.Pos||(tbPosGroup(r)==='guard'?'Guard':'Big')}</td>
      <td style="font-size:11.5px;font-weight:700">${Number.isFinite(r.Score)?r.Score.toFixed(1):'—'} <span class="muted" style="font-size:10px;font-weight:500">(${pctStr})</span></td>
      <td style="font-size:11.5px">${fmtMoney(safeNum(r.ActualValuation_calc))}</td>
      <td><button class="tbRemoveBtn">✕</button></td>
    `;
    tr.querySelector('.link').addEventListener('click', () => openProfile(r));
    tr.querySelector('.tbRemoveBtn').addEventListener('click', () => tbRemovePlayer(i));
    tbRosterBody.appendChild(tr);
  });

  if(weakPlayers.length > 0 && computed.length){
    weakestSection.style.display = '';
    weakCountEl.textContent = `— ${weakPlayers.length} player${weakPlayers.length>1?'s':''} below ${Math.round(threshold*100)}th`;
    weakestInfo.innerHTML = '';

    const rosterKeys = new Set(tbRoster.map(tbPlayerKey));
    const cap = Number(tbPlayerCapEl.value) || Infinity;
    const budget = Number(tbBudgetEl.value) || Infinity;
    const totalCost = tbRoster.reduce((s,x) => s + (safeNum(x.ActualValuation_calc)||0), 0);
    const allPool = tbGetAllPlayers();

    weakPlayers.forEach(({r: weakPlayer, i: weakIdx, avgPct}) => {
      const weakVal = safeNum(weakPlayer.ActualValuation_calc) || 0;
      const weakPerf = weakPlayer.Score || 0;
      const weakPosGroup = tbPosGroup(weakPlayer);
      const remaining = budget - totalCost + weakVal;

      const candidates = allPool.filter(c => {
        if(rosterKeys.has(tbPlayerKey(c))) return false;
        if(tbPosGroup(c) !== weakPosGroup) return false;
        const val = safeNum(c.ActualValuation_calc) || 0;
        if(val > cap) return false;
        if(val > remaining) return false;
        if(!Number.isFinite(c.Score) || c.Score <= weakPerf) return false;
        return true;
      });

      const scored = candidates.map(c => {
        const cVal = safeNum(c.ActualValuation_calc) || 0;
        const perfGain = (c.Score - weakPerf);
        const costDelta = cVal - weakVal;
        const bfb = perfGain / Math.max(0.5, (costDelta / 10000) + 1);
        return {c, perfGain, costDelta, bfb, cVal};
      });

      scored.sort((a,b) => b.bfb - a.bfb);
      const top3 = scored.slice(0, 3);

      const card = document.createElement('div');
      card.className = 'tbSwapCard';

      let headerHtml = `<div class="swapHeader">
        <div><span style="color:var(--bad);font-weight:700">${weakPlayer.Player}</span>
          <span class="muted" style="font-size:10.5px"> · ${weakPlayer.Team||'—'} · ${weakPlayer.Position||weakPlayer.Pos||(tbPosGroup(weakPlayer)==='guard'?'Guard':'Big')} · ${Math.round(avgPct*100)}th avg · ${fmtMoney(weakVal)}</span></div>
      </div>`;

      let optsHtml = '';
      if(top3.length){
        optsHtml = '<div class="swapOpts">';
        top3.forEach(({c, perfGain, costDelta, bfb, cVal}) => {
          const bfbLevel = bfb >= 5 ? 'high' : bfb >= 2 ? 'mid' : 'low';
          const bfbLabel = bfb >= 5 ? '🔥 Great deal' : bfb >= 2 ? '👍 Solid' : '📊 Marginal';
          const costLabel = costDelta <= 0 ? `saves ${fmtMoney(Math.abs(costDelta))}` : `+${fmtMoney(costDelta)}`;
          const costColor = costDelta <= 0 ? 'var(--good)' : costDelta < 20000 ? 'var(--warn)' : 'var(--bad)';
          optsHtml += `<div class="tbSwapOpt">
            <span class="tbAddBtn" data-swap-weak="${weakIdx}" data-swap-key="${tbPlayerKey(c)}" style="font-size:10px">Swap</span>
            <b style="color:var(--good)">${c.Player}</b>
            <span class="muted">${c.Team} · ${c.Position||c.Pos||(tbPosGroup(c)==='guard'?'Guard':'Big')}</span>
            <span style="font-weight:700">${c.Score.toFixed(1)} perf</span>
            <span style="font-weight:600;font-size:10.5px;color:var(--good)">+${perfGain.toFixed(1)}</span>
            <span style="font-size:10.5px;color:${costColor}">${costLabel}</span>
            <span class="tbBfbPill ${bfbLevel}">${bfbLabel}</span>
          </div>`;
        });
        optsHtml += '</div>';
      } else {
        optsHtml = '<div class="muted" style="font-size:11px">No same-position upgrades found within budget.</div>';
      }

      card.innerHTML = headerHtml + optsHtml;

      card.querySelectorAll('[data-swap-key]').forEach(btn => {
        btn.addEventListener('click', () => {
          const wIdx = Number(btn.dataset.swapWeak);
          const key = btn.dataset.swapKey;
          const replacement = tbGetAllPlayers().find(r => tbPlayerKey(r) === key);
          if(replacement){
            tbRoster.splice(wIdx, 1, replacement);
            clearWarn();
            tbRefresh();
          }
        });
      });

      weakestInfo.appendChild(card);
    });
  } else {
    if(tbRoster.length >= 2){
      weakestSection.style.display = '';
      weakCountEl.textContent = '';
      weakestInfo.innerHTML = `<div class="muted" style="font-size:11.5px">✅ All players are above the ${Math.round(threshold*100)}th percentile threshold. Roster looks solid!</div>`;
    } else {
      weakestSection.style.display = 'none';
    }
  }
}

// --- Gap bars (My Team) ---

function tbRenderGaps(){
  tbRenderGapBarsForRoster(tbRoster, tbGapBars, tbGapEmpty, tbGapTags);
}

// --- Suggestions ---

function tbRenderSuggestions(){
  tbSuggestBody.innerHTML = '';
  const allPool = tbGetAllPlayers();
  if(!tbRoster.length || !allPool.length){ tbSuggestEmpty.style.display = 'block'; return; }
  tbSuggestEmpty.style.display = 'none';

  const allCats = [...(GAP_CATEGORIES.Guards || []), ...(GAP_CATEGORIES.Bigs || [])];
  const seenLabels = new Set();
  const cats = allCats.filter(c => { if(seenLabels.has(c.label)) return false; seenLabels.add(c.label); return true; });

  const budget = Number(tbBudgetEl.value) || Infinity;
  const cap = Number(tbPlayerCapEl.value) || Infinity;
  const maxR = Number(tbMaxRosterEl.value) || 13;
  const used = tbRoster.reduce((s,x) => s + (safeNum(x.ActualValuation_calc)||0), 0);
  const remaining = budget - used;
  const rosterKeys = new Set(tbRoster.map(tbPlayerKey));

  const weakCats = [];
  cats.forEach(cat => {
    let sum = 0, count = 0;
    cat.stats.forEach(stat => {
      if(!statDist[stat]) return;
      tbRoster.forEach(r => {
        const x = safeNum(r[stat]);
        if(x === null) return;
        const p = statPercentile(stat, x);
        if(Number.isFinite(p)){ sum += p; count++; }
      });
    });
    const avgPct = count > 0 ? sum / count : 0.5;
    if(avgPct < 0.45) weakCats.push(cat);
  });

  const targetCats = weakCats.length > 0 ? weakCats : cats;

  const candidates = allPool.filter(r => {
    if(rosterKeys.has(tbPlayerKey(r))) return false;
    const val = safeNum(r.ActualValuation_calc) || 0;
    if(val > cap) return false;
    if(tbRoster.length < maxR && val > remaining) return false;
    return true;
  });

  const scored = candidates.map(r => {
    let gapScore = 0, gapCount = 0;
    let bestGap = '';
    let bestGapScore = -1;
    targetCats.forEach(cat => {
      cat.stats.forEach(stat => {
        const x = safeNum(r[stat]);
        if(x === null) return;
        const p = statPercentile(stat, x);
        if(!Number.isFinite(p)) return;
        gapScore += p;
        gapCount++;
        if(p > bestGapScore){ bestGapScore = p; bestGap = cat.label; }
      });
    });
    const avg = gapCount > 0 ? gapScore / gapCount : 0;
    return {r, avg, bestGap};
  });

  scored.sort((a,b) => b.avg - a.avg);

  scored.slice(0, 30).forEach(({r, avg, bestGap}) => {
    const tr = document.createElement('tr');
    const pct = Math.round(avg * 100);
    const gapColor = avg >= 0.7 ? 'var(--good)' : avg >= 0.5 ? 'var(--warn)' : 'var(--muted)';
    const rPos = r.Position || r.Pos || (tbPosGroup(r)==='guard'?'Guard':'Big');
    tr.innerHTML = `
      <td><span class="link" style="font-size:11px">${r.Player||'—'}</span></td>
      <td style="font-size:11px">${r.Team||'—'}</td>
      <td style="font-size:11px">${rPos}</td>
      <td style="font-size:10.5px;color:${gapColor};font-weight:700">${bestGap} (${pct}th)</td>
      <td style="font-size:11px;font-weight:700">${Number.isFinite(r.Score)?r.Score.toFixed(1):'—'}</td>
      <td style="font-size:11px">${fmtMoney(safeNum(r.ActualValuation_calc))}</td>
      <td><span class="tbAddBtn" title="Add to roster">＋</span></td>
    `;
    tr.querySelector('.link').addEventListener('click', () => openProfile(r));
    tr.querySelector('.tbAddBtn').addEventListener('click', () => tbAddPlayer(r));
    tbSuggestBody.appendChild(tr);
  });
}

// --- Page navigation ---

function initPageNav(){
  // Buttons use data-page attribute (no IDs) — use querySelectorAll
  document.querySelectorAll('.pageNavBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.page;
      document.querySelectorAll('.pageNavBtn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#pagePlayers, #pageTeamBuilder, #pageMethodology, #pageTeams, #pageFavorites, #pageCollaborate').forEach(el => {
        el.style.display = 'none';
      });
      const target = document.getElementById(targetId);
      if(target) target.style.display = '';
      btn.classList.add('active');
      // Refresh player table when switching back (roster icons may be stale)
      if(targetId === 'pagePlayers') renderPlayersPage();
      // Re-render favorites cards every time that tab is opened
      if(targetId === 'pageFavorites') {
        if(typeof favsRenderFolderBar === 'function') favsRenderFolderBar();
        if(typeof favsRenderPage     === 'function') favsRenderPage();
      }
    });
  });
  // Initial state is already set correctly in HTML (pagePlayers visible, others hidden)
}

function initTbSubNav(){
  // Buttons use data-sub attribute (no IDs) — use querySelectorAll
  document.querySelectorAll('.tbSubBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.sub;
      document.querySelectorAll('.tbSubBtn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#tbSubMyTeam, #tbSubH2H, #tbSubOpponent').forEach(el => {
        el.style.display = 'none';
      });
      const target = document.getElementById(targetId);
      if(target) target.style.display = '';
      btn.classList.add('active');
    });
  });
  // Initial state is already set correctly in HTML (tbSubMyTeam visible, others hidden)
}

// --- Swap rows helper (for AI swap confirmations) ---

function renderSwapRows(roster, weakPlayers){
  // Used by AI chat module for display
  return weakPlayers.map(wp => ({
    player: wp.Player,
    score: wp.Score,
    value: wp.ActualValuation_calc
  }));
}

// --- pctToGrade helper ---

function pctToGrade(pct){
  if(pct >= 0.90) return 'A+';
  if(pct >= 0.80) return 'A';
  if(pct >= 0.70) return 'B+';
  if(pct >= 0.60) return 'B';
  if(pct >= 0.50) return 'C+';
  if(pct >= 0.40) return 'C';
  if(pct >= 0.30) return 'D';
  return 'F';
}

// --- get_head_to_head for AI ---

function getHeadToHead(){
  if(!tbRoster.length || !oppRoster.length) return {error:'Need players in both rosters.'};
  const allCats = [...(GAP_CATEGORIES.Guards||[]),...(GAP_CATEGORIES.Bigs||[])];
  const seen = new Set();
  const cats = allCats.filter(c => { if(seen.has(c.label)) return false; seen.add(c.label); return true; });

  function rosterAvgPct(roster, cat){
    let sum = 0, count = 0;
    cat.stats.forEach(stat => {
      if(!statDist[stat]) return;
      roster.forEach(r => {
        const x = safeNum(r[stat]);
        if(x === null) return;
        const p = statPercentile(stat, x);
        if(Number.isFinite(p)){ sum += p; count++; }
      });
    });
    return count > 0 ? sum / count : 0.5;
  }

  const comparison = cats.map(cat => {
    const myPct = rosterAvgPct(tbRoster, cat);
    const oppPct = rosterAvgPct(oppRoster, cat);
    return {
      category: cat.label,
      myTeam: Math.round(myPct * 100),
      opponent: Math.round(oppPct * 100),
      edge: myPct > oppPct ? 'my_team' : myPct < oppPct ? 'opponent' : 'even'
    };
  });

  return {comparison, myTeamSize: tbRoster.length, oppTeamSize: oppRoster.length};
}

// --- Class wrapper (organizational) ---
class TeamBuilder {
  get tbRoster(){ return tbRoster; }
  set tbRoster(v){ tbRoster = v; }
  get oppRoster(){ return oppRoster; }
  set oppRoster(v){ oppRoster = v; }
  initDOMRefs(){ return initTeamBuilderDOMRefs(); }
  tbPlayerKey(r){ return tbPlayerKey(r); }
  tbPlayerLeague(r){ return tbPlayerLeague(r); }
  tbPosGroup(r){ return tbPosGroup(r); }
  tbGetAllPlayers(lg){ return tbGetAllPlayers(lg); }
  tbPlayerAvgPct(r){ return tbPlayerAvgPct(r); }
  tbAddPlayer(r){ return tbAddPlayer(r); }
  tbRemovePlayer(idx){ return tbRemovePlayer(idx); }
  tbRefresh(){ return tbRefresh(); }
  tbRenderGapBarsForRoster(roster, barsEl, emptyEl, tagsEl){ return tbRenderGapBarsForRoster(roster, barsEl, emptyEl, tagsEl); }
  h2hRefresh(){ return h2hRefresh(); }
  oppAddPlayer(r){ return oppAddPlayer(r); }
  oppRemovePlayer(idx){ return oppRemovePlayer(idx); }
  oppRefresh(){ return oppRefresh(); }
  setupQuickAdd(inputId, dropdownId, addFn, getRoster){ return setupQuickAdd(inputId, dropdownId, addFn, getRoster); }
  initPageNav(){ return initPageNav(); }
  initTbSubNav(){ return initTbSubNav(); }
  pctToGrade(pct){ return pctToGrade(pct); }
  getHeadToHead(){ return getHeadToHead(); }
}

window.TeamBuilder = new TeamBuilder();
