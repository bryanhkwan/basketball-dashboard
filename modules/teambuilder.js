// ============ TEAM BUILDER MODULE ============
// Dependencies: config.js (safeNum, fmtMoney, GAP_CATEGORIES, GAP_EXPLANATIONS),
//   data.js (league, pos, computed, statPercentile, bucketPosition, tbAllComputed, clearWarn, showWarn),
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
var _tbRefreshTimer = null;
var _tbSuggestRows = [];

function tbDisplayMoney(value) {
  if (typeof demoFormatMoney === 'function') return demoFormatMoney(value);
  return fmtMoney(value);
}

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

// Keep only the displayed results; equal scores retain their original pool order.
function tbInsertTopScore(top, item, scoreKey, limit){
  var score = item[scoreKey];
  if(top.length === limit && score <= top[top.length - 1][scoreKey]) return;
  var lo = 0, hi = top.length;
  while(lo < hi){
    var mid = (lo + hi) >> 1;
    if(top[mid][scoreKey] >= score) lo = mid + 1;
    else hi = mid;
  }
  top.splice(lo, 0, item);
  if(top.length > limit) top.pop();
}

function tbPlayerLeague(r){
  if(r && r._league) return r._league;
  for(const [key, arr] of Object.entries(tbAllComputed)){
    if(arr.some(x => tbPlayerKey(x) === tbPlayerKey(r))){
      return key.startsWith('MBB') ? 'MBB' : 'WBB';
    }
  }
  return league;
}

function tbPosGroup(r){
  return {Guards:'guard', Wings:'wing', Bigs:'big'}[tbPositionLabel(r)];
}

function tbPositionLabel(r){
  r = r || {};
  if(!(r.Position || r.ListedPosition || r.Pos || '').toString().trim()){
    var cachedLabel = {guard:'Guards', wing:'Wings', big:'Bigs'}[r._tbPosGroup];
    if(cachedLabel) return cachedLabel;
  }
  return bucketPosition(r, r._league || league);
}

function tbPositionCounts(roster){
  var counts = {guard:0, wing:0, big:0};
  (roster || []).forEach(function(r){ counts[tbPosGroup(r)]++; });
  return counts;
}

// A saved player's own cohort percentile stays valid when another position tab is active.
function tbStatPercentile(r, stat){
  var cached = r['_pct_' + stat];
  if(Number.isFinite(cached)) return cached;
  var value = safeNum(r[stat]);
  if(value === null || (r._league || league) !== league || tbPositionLabel(r) !== pos) return NaN;
  return statPercentile(stat, value);
}

function tbGapCategories(roster){
  var groups = roster ? new Set(roster.map(tbPositionLabel)) : new Set(['Guards', 'Wings', 'Bigs']);
  var categories = [];
  var byLabel = new Map();
  ['Guards', 'Wings', 'Bigs'].forEach(function(group){
    if(!groups.has(group)) return;
    (GAP_CATEGORIES[group] || []).forEach(function(category){
      var existing = byLabel.get(category.label);
      if(existing){
        existing.stats = Array.from(new Set(existing.stats.concat(category.stats)));
      } else {
        var copy = Object.assign({}, category, {stats:category.stats.slice()});
        byLabel.set(category.label, copy);
        categories.push(copy);
      }
    });
  });
  return categories;
}

function tbGetAllPlayers(forLeague){
  const lg = forLeague || league;
  if(_cachedAllPlayers && _cachedAllPlayersLg === lg) return _cachedAllPlayers;
  const seen = new Set();
  const all = [];
  for(const [key, arr] of Object.entries(tbAllComputed)){
    if(!key.startsWith(lg + '_')) continue;
    const posLabel = {Guards:'guard', Wings:'wing', Bigs:'big'}[key.slice(lg.length + 1)];
    if(!posLabel) continue;
    arr.forEach(r => {
      const pk = tbPlayerKey(r);
      if(seen.has(pk)) return;
      seen.add(pk);
      r._league = lg;
      if(!(r.Position||r.ListedPosition||r.Pos||'').toString().trim()){
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
  const cats = GAP_CATEGORIES[tbPositionLabel(r)] || [];
  let sum = 0, cnt = 0;
  cats.forEach(cat => {
    cat.stats.forEach(stat => {
      const x = safeNum(r[stat]);
      if(x === null) return;
      const p = tbStatPercentile(r, stat);
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
  if(Number.isFinite(cap) && val > cap){ showWarn(`${r.Player} (${tbDisplayMoney(val)}) exceeds the per-player cap (${tbDisplayMoney(cap)}).`); return; }
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
  if(oppRosterEmpty) oppRosterEmpty.style.display = oppRoster.length ? 'none' : 'block';

  const totalCost = oppRoster.reduce((s,x) => s + (safeNum(x.ActualValuation_calc)||0), 0);
  if(oppCountEl) oppCountEl.textContent = oppRoster.length;
  if(oppCostEl) oppCostEl.textContent = tbDisplayMoney(totalCost);
  var positionCounts = tbPositionCounts(oppRoster);
  ['guard', 'wing', 'big'].forEach(function(group){
    var el = document.getElementById('opp' + group.charAt(0).toUpperCase() + group.slice(1) + 'Count');
    if(el) el.textContent = positionCounts[group];
  });

  const frag = document.createDocumentFragment();
  oppRoster.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.dataset.ri = i;
    tr.innerHTML = `
      <td style="font-size:11px;color:var(--muted)">${i+1}</td>
      <td><span class="link" style="font-size:11.5px">${r.Player||'—'}</span></td>
      <td style="font-size:11px">${r.Team||'—'}</td>
      <td style="font-size:11px">${tbPositionLabel(r)}</td>
      <td style="font-size:11.5px;font-weight:700">${Number.isFinite(r.Score)?r.Score.toFixed(1):'—'}</td>
      <td style="font-size:11.5px">${tbDisplayMoney(safeNum(r.ActualValuation_calc))}</td>
      <td><button class="tbRemoveBtn">✕</button></td>
    `;
    frag.appendChild(tr);
  });
  oppRosterBody.innerHTML = '';
  oppRosterBody.appendChild(frag);

  if(!oppRosterBody._delegated){
    oppRosterBody._delegated = true;
    oppRosterBody.addEventListener('click', function(e){
      var tr = e.target.closest('tr');
      if(!tr) return;
      var idx = Number(tr.dataset.ri);
      if(!Number.isFinite(idx) || idx < 0 || idx >= oppRoster.length) return;
      if(e.target.closest('.tbRemoveBtn')){ oppRemovePlayer(idx); return; }
      if(e.target.closest('.link')) openProfile(oppRoster[idx]);
    });
  }

  if(oppGapBars && oppGapEmpty && oppGapTags){
    tbRenderGapBarsForRoster(oppRoster, oppGapBars, oppGapEmpty, oppGapTags);
  }

  // Quick scout for opponent
  const oppScoutEl = document.getElementById('oppQuickScout');
  if(oppScoutEl && oppRoster.length >= 2){
    const cats = tbGapCategories(oppRoster);
    const weak = [], strong = [];
    cats.forEach(cat => {
      let sum = 0, count = 0;
      cat.stats.forEach(stat => {
        oppRoster.forEach(r => {
          const x = safeNum(r[stat]);
          if(x === null) return;
          const p = tbStatPercentile(r, stat);
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

  const cats = tbGapCategories(roster);

  const gaps = [];
  cats.forEach(cat => {
    let sum = 0, count = 0;
    cat.stats.forEach(stat => {
      roster.forEach(r => {
        const x = safeNum(r[stat]);
        if(x === null) return;
        const p = tbStatPercentile(r, stat);
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

  const cats = tbGapCategories(tbRoster.concat(oppRoster));

  // Legend
  const legend = document.createElement('div');
  legend.className = 'h2hLegend';
  legend.innerHTML = `<span><span class="dot" style="background:#60a5fa"></span>My Team</span><span><span class="dot" style="background:#f87171"></span>Opponent</span>`;
  barsEl.appendChild(legend);

  const catResults = [];
  cats.forEach(cat => {
    let mySum=0, myCount=0, oppSum=0, oppCount=0;
    cat.stats.forEach(stat => {
      tbRoster.forEach(r=>{ const x=safeNum(r[stat]); if(x===null)return; const p=tbStatPercentile(r,stat); if(Number.isFinite(p)){mySum+=p;myCount++;} });
      oppRoster.forEach(r=>{ const x=safeNum(r[stat]); if(x===null)return; const p=tbStatPercentile(r,stat); if(Number.isFinite(p)){oppSum+=p;oppCount++;} });
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
            <div class="qMeta">${r.Team||''} · ${tbPositionLabel(r)} · ${r.Score?r.Score.toFixed(1):'—'} perf</div>
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

// Cache DOM lookups that tbRefresh reads every call
var _tbCachedEls = null;
function _tbGetCachedEls(){
  if(!_tbCachedEls){
    _tbCachedEls = {
      badge: document.getElementById('tbLeagueBadge'),
      guardCount: document.getElementById('tbGuardCount'),
      guardTarget: document.getElementById('tbGuardTarget'),
      wingCount: document.getElementById('tbWingCount'),
      wingTarget: document.getElementById('tbWingTarget'),
      bigCount: document.getElementById('tbBigCount'),
      bigTarget: document.getElementById('tbBigTarget'),
      targetGuards: document.getElementById('tbTargetGuards'),
      targetWings: document.getElementById('tbTargetWings'),
      targetBigs: document.getElementById('tbTargetBigs'),
      rebalSection: document.getElementById('tbRebalanceSection'),
      rebalInfo: document.getElementById('tbRebalanceInfo'),
    };
  }
  return _tbCachedEls;
}

function tbRefresh(){
  if(_tbRefreshTimer){
    clearTimeout(_tbRefreshTimer);
    _tbRefreshTimer = null;
  }
  const maxR = Number(tbMaxRosterEl.value) || 13;
  const budget = Number(tbBudgetEl.value) || 0;
  const totalCost = tbRoster.reduce((s,x) => s + (safeNum(x.ActualValuation_calc)||0), 0);

  const badge = _tbGetCachedEls().badge;
  if(badge){
    const rosterLg = tbRoster.length > 0 ? tbPlayerLeague(tbRoster[0]) : league;
    badge.textContent = rosterLg;
    badge.style.background = rosterLg === 'MBB' ? 'rgba(0,62,126,.4)' : 'rgba(147,51,234,.3)';
    badge.style.borderColor = rosterLg === 'MBB' ? 'rgba(0,62,126,.6)' : 'rgba(147,51,234,.5)';
  }

  tbMaxLabelEl.textContent = maxR;
  tbCountEl.textContent = tbRoster.length;
  tbCostEl.textContent = tbDisplayMoney(totalCost);
  const rem = budget - totalCost;
  tbRemainingEl.textContent = tbDisplayMoney(rem);
  tbRemainingEl.style.color = rem < 0 ? 'var(--bad)' : rem < budget * 0.1 ? 'var(--warn)' : 'var(--good)';

  const counts = tbPositionCounts(tbRoster);
  const _ce = _tbGetCachedEls();
  const groups = ['guard', 'wing', 'big'];
  const inputNames = {guard:'targetGuards', wing:'targetWings', big:'targetBigs'};
  const defaults = {guard:5, wing:5, big:3};
  const targets = {};
  groups.forEach(function(group){
    const input = _ce[inputNames[group]];
    targets[group] = input ? Math.max(0, Number(input.value) || 0) : defaults[group];
    const countEl = _ce[group + 'Count'];
    const targetEl = _ce[group + 'Target'];
    if(countEl){
      countEl.textContent = counts[group];
      countEl.style.color = counts[group] > targets[group] ? 'var(--bad)' : counts[group] < targets[group] ? 'var(--warn)' : 'var(--good)';
    }
    if(targetEl) targetEl.textContent = targets[group];
  });

  const rebalanceSection = _ce.rebalSection;
  const rebalanceInfo = _ce.rebalInfo;
  const excessGroups = groups.filter(function(group){ return counts[group] > targets[group]; });

  if(rebalanceSection && rebalanceInfo && tbRoster.length >= 2 && excessGroups.length){
    rebalanceSection.style.display = '';
    rebalanceInfo.innerHTML = '';
    const allPool = tbGetAllPlayers();
    const rosterKeys = new Set(tbRoster.map(tbPlayerKey));
    const cap = Number(tbPlayerCapEl.value) || Infinity;
    const rosterBudget = Number(tbBudgetEl.value) || Infinity;
    const usedCandidateKeys = new Set();
    const remainingNeed = {};
    groups.forEach(function(group){ remainingNeed[group] = Math.max(0, targets[group] - counts[group]); });

    excessGroups.forEach(function(dropGroup){
      const excess = counts[dropGroup] - targets[dropGroup];
      const header = document.createElement('div');
      header.style.cssText = 'margin-bottom:6px;margin-top:8px;font-size:11.5px';
      header.innerHTML = `You have <b style="color:var(--warn)">${excess} extra ${dropGroup}${excess > 1 ? 's' : ''}</b>. Swap into an open position target or remove your weakest players:`;
      rebalanceInfo.appendChild(header);
      const toDrop = tbRoster.map(function(r, i){ return {r:r, i:i, pct:tbPlayerAvgPct(r)}; })
        .filter(function(item){ return tbPosGroup(item.r) === dropGroup; })
        .sort(function(a, b){ return a.pct - b.pct; }).slice(0, excess);

      toDrop.forEach(function(item){
        const neededGroups = groups.filter(function(group){ return remainingNeed[group] > 0; });
        const dropValue = safeNum(item.r.ActualValuation_calc) || 0;
        const available = rosterBudget - totalCost + dropValue;
        const candidates = allPool.filter(function(candidate){
          const key = tbPlayerKey(candidate);
          const value = safeNum(candidate.ActualValuation_calc) || 0;
          return !rosterKeys.has(key) && !usedCandidateKeys.has(key) && neededGroups.includes(tbPosGroup(candidate)) && value <= cap && value <= available;
        }).sort(function(a, b){ return (b.Score || 0) - (a.Score || 0); });
        const candidate = candidates[0];
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;margin:5px 0;flex-wrap:wrap;font-size:11.5px';
        if(candidate){
          usedCandidateKeys.add(tbPlayerKey(candidate));
          remainingNeed[tbPosGroup(candidate)]--;
          row.innerHTML = `
            <span class="tbAddBtn" data-rebal-drop="${item.i}" data-rebal-add="${tbPlayerKey(candidate)}" style="font-size:10px;border-color:rgba(251,191,36,.4);color:var(--warn)">Swap</span>
            <b style="color:var(--bad)">${item.r.Player}</b> <span class="muted">(${Math.round(item.pct * 100)}th, ${tbDisplayMoney(dropValue)})</span>
            <span style="color:var(--muted)">&rarr;</span>
            <b style="color:var(--good)">${candidate.Player}</b> <span class="muted">(${tbPositionLabel(candidate)}, ${(candidate.Score || 0).toFixed(1)} perf, ${tbDisplayMoney(safeNum(candidate.ActualValuation_calc) || 0)})</span>
          `;
        } else {
          row.textContent = item.r.Player + ' (' + Math.round(item.pct * 100) + 'th, ' + tbDisplayMoney(dropValue) + ') — ' + (neededGroups.length ? 'no ' + neededGroups.join(' / ') + ' candidates within budget and cap' : 'consider removing to hit target');
        }
        rebalanceInfo.appendChild(row);
      });
    });

    rebalanceInfo.querySelectorAll('[data-rebal-drop]').forEach(function(btn){
      btn.addEventListener('click', function(){
        const dropIdx = Number(btn.dataset.rebalDrop);
        const replacement = tbGetAllPlayers().find(function(r){ return tbPlayerKey(r) === btn.dataset.rebalAdd; });
        if(!replacement || dropIdx < 0 || dropIdx >= tbRoster.length) return;
        const currentCost = tbRoster.reduce(function(sum, r){ return sum + (safeNum(r.ActualValuation_calc) || 0); }, 0);
        const value = safeNum(replacement.ActualValuation_calc) || 0;
        const currentCap = Number(tbPlayerCapEl.value) || Infinity;
        const currentBudget = Number(tbBudgetEl.value) || Infinity;
        if(tbRoster.some(function(r){ return tbPlayerKey(r) === tbPlayerKey(replacement); })) return;
        if(tbPlayerLeague(replacement) !== league || value > currentCap || currentCost - (safeNum(tbRoster[dropIdx].ActualValuation_calc) || 0) + value > currentBudget){
          showWarn('This swap no longer fits your league, budget, or player cap.');
          return;
        }
        tbRoster.splice(dropIdx, 1, replacement);
        clearWarn();
        tbRefresh();
      });
    });
  } else if(rebalanceSection){
    rebalanceSection.style.display = 'none';
  }

  if(tbPosNoteEl){
    const heavyGroup = tbRoster.length >= 3 ? groups.find(function(group){ return counts[group] / tbRoster.length > 0.75; }) : null;
    tbPosNoteEl.style.display = heavyGroup && !excessGroups.length ? '' : 'none';
    if(heavyGroup) tbPosNoteEl.textContent = `⚠ Heavy on ${heavyGroup}s (${counts.guard}G / ${counts.wing}W / ${counts.big}B)`;
  }

  tbRenderRoster();
  tbRenderGaps();
  tbRenderSuggestions();
  // Only re-render player table if Players page is visible
  var _pp = document.getElementById('pagePlayers');
  if(!_pp || _pp.style.display !== 'none') renderPlayersPage();
  h2hRefresh();
  if(window.ValueLab && typeof window.ValueLab.handleRosterChange === 'function') {
    window.ValueLab.handleRosterChange();
  }
}

function tbScheduleRefresh(delayMs){
  if(_tbRefreshTimer) clearTimeout(_tbRefreshTimer);
  _tbRefreshTimer = setTimeout(function(){
    _tbRefreshTimer = null;
    tbRefresh();
  }, Number.isFinite(delayMs) ? Math.max(0, delayMs) : 90);
}

// --- Roster render ---

function tbRenderRoster(){
  tbRosterEmpty.style.display = tbRoster.length ? 'none' : 'block';
  if(!_tbCachedEls) _tbGetCachedEls();
  var _weakSection = _tbCachedEls._weakSection || (
    _tbCachedEls._weakSection = document.getElementById('tbWeakestSection'));
  var _weakInfo = _tbCachedEls._weakInfo || (
    _tbCachedEls._weakInfo = document.getElementById('tbWeakestInfo'));
  var _weakCount = _tbCachedEls._weakCount || (
    _tbCachedEls._weakCount = document.getElementById('tbWeakCount'));
  const weakestSection = _weakSection;
  const weakestInfo = _weakInfo;
  const weakCountEl = _weakCount;

  const threshold = (Number(tbWeakThreshEl.value) || 40) / 100;

  const rosterScored = tbRoster.map((r, i) => ({r, i, avgPct: tbPlayerAvgPct(r)}));
  const weakPlayers = rosterScored.filter(x => x.avgPct < threshold);
  const weakIdxSet = new Set(weakPlayers.map(x => x.i));

  var _rosterFrag = document.createDocumentFragment();
  tbRoster.forEach((r, i) => {
    const tr = document.createElement('tr');
    const isWeak = weakIdxSet.has(i);
    tr.className = 'tbRosterRow' + (isWeak ? ' tbWeakest' : '');
    tr.dataset.ri = i;
    const pctVal = rosterScored[i]?.avgPct ?? 0;
    const pctStr = Math.round(pctVal * 100) + 'th';
    tr.innerHTML = `
      <td style="font-size:11px;color:var(--muted)">${i+1}</td>
      <td><span class="link" style="font-size:11.5px">${r.Player||'—'}</span>${isWeak ? ' <span class="tbWeakestTag">weak</span>' : ''}</td>
      <td style="font-size:11px">${r.Team||'—'}</td>
      <td style="font-size:11px">${tbPositionLabel(r)}</td>
      <td style="font-size:11.5px;font-weight:700">${Number.isFinite(r.Score)?r.Score.toFixed(1):'—'} <span class="muted" style="font-size:10px;font-weight:500">(${pctStr})</span></td>
      <td style="font-size:11.5px">${tbDisplayMoney(safeNum(r.ActualValuation_calc))}</td>
      <td><button class="tbRemoveBtn">✕</button></td>
    `;
    _rosterFrag.appendChild(tr);
  });
  tbRosterBody.innerHTML = '';
  tbRosterBody.appendChild(_rosterFrag);

  // Event delegation for roster table (set up once)
  if(!tbRosterBody._delegated){
    tbRosterBody._delegated = true;
    tbRosterBody.addEventListener('click', function(e){
      var tr = e.target.closest('tr');
      if(!tr) return;
      var idx = Number(tr.dataset.ri);
      if(!Number.isFinite(idx) || idx < 0 || idx >= tbRoster.length) return;
      if(e.target.closest('.tbRemoveBtn')){ tbRemovePlayer(idx); return; }
      if(e.target.closest('.link')){ openProfile(tbRoster[idx]); }
    });
  }

  if(weakPlayers.length > 0 && tbGetAllPlayers().length){
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

      const top3 = [];
      allPool.forEach(c => {
        if(rosterKeys.has(tbPlayerKey(c))) return;
        if(tbPosGroup(c) !== weakPosGroup) return;
        const cVal = safeNum(c.ActualValuation_calc) || 0;
        if(cVal > cap || cVal > remaining) return;
        if(!Number.isFinite(c.Score) || c.Score <= weakPerf) return;
        const perfGain = (c.Score - weakPerf);
        const costDelta = cVal - weakVal;
        const bfb = perfGain / Math.max(0.5, (costDelta / 10000) + 1);
        tbInsertTopScore(top3, {c, perfGain, costDelta, bfb, cVal}, 'bfb', 3);
      });

      const card = document.createElement('div');
      card.className = 'tbSwapCard';

      let headerHtml = `<div class="swapHeader">
        <div><span style="color:var(--bad);font-weight:700">${weakPlayer.Player}</span>
          <span class="muted" style="font-size:10.5px"> · ${weakPlayer.Team||'—'} · ${tbPositionLabel(weakPlayer)} · ${Math.round(avgPct*100)}th avg · ${tbDisplayMoney(weakVal)}</span></div>
      </div>`;

      let optsHtml = '';
      if(top3.length){
        optsHtml = '<div class="swapOpts">';
        top3.forEach(({c, perfGain, costDelta, bfb, cVal}) => {
          const bfbLevel = bfb >= 5 ? 'high' : bfb >= 2 ? 'mid' : 'low';
          const bfbLabel = bfb >= 5 ? '🔥 Great deal' : bfb >= 2 ? '👍 Solid' : '📊 Marginal';
          const costLabel = costDelta <= 0 ? `saves ${tbDisplayMoney(Math.abs(costDelta))}` : `+${tbDisplayMoney(costDelta)}`;
          const costColor = costDelta <= 0 ? 'var(--good)' : costDelta < 20000 ? 'var(--warn)' : 'var(--bad)';
          optsHtml += `<div class="tbSwapOpt">
            <span class="tbAddBtn" data-swap-weak="${weakIdx}" data-swap-key="${tbPlayerKey(c)}" style="font-size:10px">Swap</span>
            <b style="color:var(--good)">${c.Player}</b>
            <span class="muted">${c.Team} · ${tbPositionLabel(c)}</span>
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
  _tbSuggestRows = [];
  const allPool = tbGetAllPlayers();
  if(!tbRoster.length || !allPool.length){ tbSuggestEmpty.style.display = 'block'; return; }
  tbSuggestEmpty.style.display = 'none';

  const cats = tbGapCategories();

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
      tbRoster.forEach(r => {
        const x = safeNum(r[stat]);
        if(x === null) return;
        const p = tbStatPercentile(r, stat);
        if(Number.isFinite(p)){ sum += p; count++; }
      });
    });
    const avgPct = count > 0 ? sum / count : 0.5;
    if(avgPct < 0.45) weakCats.push(cat);
  });

  const targetCats = weakCats.length > 0 ? weakCats : cats;

  const topSuggestions = [];
  allPool.forEach(r => {
    if(rosterKeys.has(tbPlayerKey(r))) return;
    const val = safeNum(r.ActualValuation_calc) || 0;
    if(val > cap) return;
    if(tbRoster.length < maxR && val > remaining) return;

    let gapScore = 0, gapCount = 0;
    let bestGap = '';
    let bestGapScore = -1;
    targetCats.forEach(cat => {
      cat.stats.forEach(stat => {
        const x = safeNum(r[stat]);
        if(x === null) return;
        const p = tbStatPercentile(r, stat);
        if(!Number.isFinite(p)) return;
        gapScore += p;
        gapCount++;
        if(p > bestGapScore){ bestGapScore = p; bestGap = cat.label; }
      });
    });
    const avg = gapCount > 0 ? gapScore / gapCount : 0;
    tbInsertTopScore(topSuggestions, {r, avg, bestGap}, 'avg', 30);
  });

  _tbSuggestRows = topSuggestions.map(item => item.r);
  const frag = document.createDocumentFragment();
  topSuggestions.forEach(({r, avg, bestGap}, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.ri = idx;
    const pct = Math.round(avg * 100);
    const gapColor = avg >= 0.7 ? 'var(--good)' : avg >= 0.5 ? 'var(--warn)' : 'var(--muted)';
    const rPos = tbPositionLabel(r);
    tr.innerHTML = `
      <td><span class="link" style="font-size:11px">${r.Player||'—'}</span></td>
      <td style="font-size:11px">${r.Team||'—'}</td>
      <td style="font-size:11px">${rPos}</td>
      <td style="font-size:10.5px;color:${gapColor};font-weight:700">${bestGap} (${pct}th)</td>
      <td style="font-size:11px;font-weight:700">${Number.isFinite(r.Score)?r.Score.toFixed(1):'—'}</td>
      <td style="font-size:11px">${tbDisplayMoney(safeNum(r.ActualValuation_calc))}</td>
      <td><span class="tbAddBtn" title="Add to roster">＋</span></td>
    `;
    frag.appendChild(tr);
  });
  tbSuggestBody.appendChild(frag);

  if(!tbSuggestBody._delegated){
    tbSuggestBody._delegated = true;
    tbSuggestBody.addEventListener('click', function(e){
      var tr = e.target.closest('tr');
      if(!tr) return;
      var idx = Number(tr.dataset.ri);
      if(!Number.isFinite(idx) || idx < 0 || idx >= _tbSuggestRows.length) return;
      var player = _tbSuggestRows[idx];
      if(e.target.closest('.tbAddBtn')){ tbAddPlayer(player); return; }
      if(e.target.closest('.link')) openProfile(player);
    });
  }
}

// --- Page navigation ---

function showDashboardPage(targetId, activeNavId, opts){
  opts = opts && typeof opts === 'object' ? opts : {};
  if (targetId === 'pageMethodology' && typeof authIsGuest === 'function' && authIsGuest()) {
    if (typeof authPromptUpgrade === 'function') {
      authPromptUpgrade('Full methodology is reserved for approved staff accounts. Guest mode keeps the dashboard outputs visible without exposing the internal model recipe.');
    }
    targetId = 'pagePlayers';
    activeNavId = 'pagePlayers';
  }
  var prefsIsCustomizing = !!(window.DashboardPrefs && typeof window.DashboardPrefs.isCustomizing === 'function' && window.DashboardPrefs.isCustomizing());
  if (!opts.forcePage && !prefsIsCustomizing && window.DashboardPrefs && typeof window.DashboardPrefs.isPageVisible === 'function' && !window.DashboardPrefs.isPageVisible(targetId)) {
    targetId = (window.DashboardPrefs.getFirstVisiblePage && window.DashboardPrefs.getFirstVisiblePage()) || 'pagePlayers';
    activeNavId = targetId;
  }
  var activeId = activeNavId || targetId;
  var skipHeavyLoad = !!opts.skipHeavyLoad;
  window._dashboardCurrentPageId = targetId;
  document.querySelectorAll('.pageNavBtn').forEach(function(b){
    b.classList.toggle('active', b.dataset.page === activeId);
  });
  document.querySelectorAll('#pagePlayers, #pagePortal, #pageTeamBuilder, #pageTeams, #pageValueLab, #pageMethodology, #pageLab, #pageWarRoom, #pageFavorites, #pageCollaborate, #pageAdmin').forEach(function(el) {
    el.style.display = 'none';
  });
  var target = document.getElementById(targetId);
  if(target) target.style.display = '';
  if (targetId !== 'pagePlayers' && window._app && typeof window._app.setPlayersSettingsOpen === 'function') {
    window._app.setPlayersSettingsOpen(false);
  }

  if(targetId === 'pagePlayers') renderPlayersPage();
  if(targetId === 'pagePortal' && typeof loadPortalEntries === 'function') loadPortalEntries(skipHeavyLoad ? { preview: true } : undefined);
  if(targetId === 'pageValueLab' && !skipHeavyLoad && window.ValueLab && typeof window.ValueLab.refresh === 'function') {
    window.ValueLab.refresh();
  }
  if(targetId === 'pageLab' && window.TeamHub && typeof window.TeamHub.refreshTournamentLauncher === 'function') {
    window.TeamHub.refreshTournamentLauncher();
  }
  if(targetId === 'pageWarRoom' && !skipHeavyLoad && window.TeamHub && typeof window.TeamHub.refreshTournamentHub === 'function') {
    requestAnimationFrame(function(){ window.TeamHub.refreshTournamentHub(); });
  }
  if(targetId === 'pageFavorites') {
    if(!skipHeavyLoad && typeof favsEnsureFresh === 'function') favsEnsureFresh(true);
    if(typeof favsRenderFolderBar === 'function') favsRenderFolderBar();
    if(typeof favsRenderPage === 'function') favsRenderPage();
  }
  if(targetId === 'pageCollaborate' && window.SharesManager && typeof window.SharesManager.refreshUI === 'function') {
    window.SharesManager.refreshUI();
  }
  if(targetId === 'pageAdmin' && !skipHeavyLoad && window.AdminPanel && typeof window.AdminPanel.load === 'function') {
    window.AdminPanel.load();
  }
  if(window.HelpPanel && typeof window.HelpPanel.refreshCurrentPage === 'function') {
    window.HelpPanel.refreshCurrentPage();
  }
}

window._dashboardCurrentPageId = window._dashboardCurrentPageId || 'pagePlayers';

function initPageNav(){
  // Buttons use data-page attribute (no IDs) — use querySelectorAll
  document.querySelectorAll('.pageNavBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.page;
      showDashboardPage(targetId);
    });
  });

  var tbValueLabBtn = document.getElementById('tbValueLabBtn');
  if (tbValueLabBtn && !tbValueLabBtn._navBound) {
    tbValueLabBtn.addEventListener('click', function () {
      if (window.ValueLab && typeof window.ValueLab.openScenario === 'function') {
        window.ValueLab.openScenario();
      } else {
        showDashboardPage('pageValueLab');
      }
    });
    tbValueLabBtn._navBound = true;
  }

  var thOpenBuilderBtn = document.getElementById('thOpenBuilderBtn');
  if (thOpenBuilderBtn && !thOpenBuilderBtn._navBound) {
    thOpenBuilderBtn.addEventListener('click', function () {
      showDashboardPage('pageTeamBuilder', 'pageTeams');
    });
    thOpenBuilderBtn._navBound = true;
  }

  var tbBackToTeamsBtn = document.getElementById('tbBackToTeamsBtn');
  if (tbBackToTeamsBtn && !tbBackToTeamsBtn._navBound) {
    tbBackToTeamsBtn.addEventListener('click', function () {
      showDashboardPage('pageTeams', 'pageTeams');
    });
    tbBackToTeamsBtn._navBound = true;
  }

  var warRoomBtn = document.getElementById('labWarRoomBtn');
  if (warRoomBtn && !warRoomBtn._navBound) {
    warRoomBtn.addEventListener('click', function () {
      if (typeof authIsGuest === 'function' && authIsGuest()) {
        var guestLoginBtn = document.getElementById('guestLoginBtn');
        if (guestLoginBtn) guestLoginBtn.click();
        return;
      }
      showDashboardPage('pageWarRoom', 'pageLab');
    });
    warRoomBtn._navBound = true;
  }

  var warRoomBackBtn = document.getElementById('warRoomBackBtn');
  if (warRoomBackBtn && !warRoomBackBtn._navBound) {
    warRoomBackBtn.addEventListener('click', function () {
      showDashboardPage('pageLab', 'pageLab');
    });
    warRoomBackBtn._navBound = true;
  }
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
  const cats = tbGapCategories(tbRoster.concat(oppRoster));

  function rosterAvgPct(roster, cat){
    let sum = 0, count = 0;
    cat.stats.forEach(stat => {
      roster.forEach(r => {
        const x = safeNum(r[stat]);
        if(x === null) return;
        const p = tbStatPercentile(r, stat);
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

  return {comparison, myTeamSize: tbRoster.length, oppTeamSize: oppRoster.length, myTeamPositions:tbPositionCounts(tbRoster), opponentPositions:tbPositionCounts(oppRoster)};
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
  tbScheduleRefresh(delayMs){ return tbScheduleRefresh(delayMs); }
  tbRenderGapBarsForRoster(roster, barsEl, emptyEl, tagsEl){ return tbRenderGapBarsForRoster(roster, barsEl, emptyEl, tagsEl); }
  h2hRefresh(){ return h2hRefresh(); }
  oppAddPlayer(r){ return oppAddPlayer(r); }
  oppRemovePlayer(idx){ return oppRemovePlayer(idx); }
  oppRefresh(){ return oppRefresh(); }
  setupQuickAdd(inputId, dropdownId, addFn, getRoster){ return setupQuickAdd(inputId, dropdownId, addFn, getRoster); }
  initPageNav(){ return initPageNav(); }
  showDashboardPage(targetId, activeNavId, opts){ return showDashboardPage(targetId, activeNavId, opts); }
  initTbSubNav(){ return initTbSubNav(); }
  pctToGrade(pct){ return pctToGrade(pct); }
  getHeadToHead(){ return getHeadToHead(); }
}

window.TeamBuilder = new TeamBuilder();
