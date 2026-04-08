// ============ PLAYERS MODULE ============
// Dependencies: config.js (PAGE_SIZE, safeNum, fmtMoney), data.js (computed, pos, sort,
//   tbRoster, statDist, statPercentile, tbAddPlayer, tbRefresh, tbPlayerKey,
//   searchInput, playersHead, playersBody, fitPresetEl, tbMaxRosterEl, tbBudgetEl, tbPlayerCapEl)

// --- Module-level state (global) ---
var currentPage = 0;
var filteredData = [];
var _playersPageData = [];

// --- Constants ---
const LIST_COLS = [
  {key:'_tb_add', label:''},
  {key:'_opp_add', label:''},
  {key:'CalcRank', label:'#'},
  {key:'Player', label:'Player'},
  {key:'Team', label:'Team'},
  {key:'Conference', label:'Conf'},
  {key:'Height', label:'Ht'},
  {key:'ConfMult_calc', label:'CM'},
  {key:'MP', label:'MP'},
  {key:'Score', label:'Perf'},
  {key:'FitScore_calc', label:'Fit'},
  {key:'ActualValuation_calc', label:'Model $'},
  {key:'_draft_prob', label:'Draft'},
];

function playersDisplayMoney(value){
  return typeof demoFormatMoney === 'function' ? demoFormatMoney(value) : fmtMoney(value);
}

function playerBoardSortKey(key){
  if(playerValueView === 'projection'){
    if(key === 'Score') return 'ProjectionPerf_calc';
    if(key === 'ActualValuation_calc') return 'ProjectionMedianValue_calc';
  }
  return key;
}

function playerBoardColLabel(col){
  if(col.key === 'Score') return playerValueView === 'projection' ? 'Projection' : 'Production';
  if(col.key === 'ActualValuation_calc'){
    if(typeof demoIsGuestMode === 'function' && demoIsGuestMode()) return playerValueView === 'projection' ? 'Median band' : 'Value band';
    return playerValueView === 'projection' ? 'Median $' : col.label;
  }
  return col.label;
}

// --- Sort ---
function sortData(data){
  const k = playerBoardSortKey(sort.key);
  const dir = sort.dir;
  return data.slice().sort((a,b)=>{
    const av = a[k]; const bv = b[k];
    const an = Number(av); const bn = Number(bv);
    let cmp;
    if(Number.isFinite(an) && Number.isFinite(bn)) cmp = an - bn;
    else cmp = (av ?? '').toString().localeCompare((bv ?? '').toString());
    return dir === 'asc' ? cmp : -cmp;
  });
}

// --- Render ---
function renderPlayers(){
  const q = (searchInput.value || '').toLowerCase().trim();
  let data = computed;
  if(q){
    data = data.filter(r => {
      return ['Player','Team','Conference','Position','Height'].some(k => (r[k] ?? '').toString().toLowerCase().includes(q));
    });
  }
  filteredData = sortData(data);
  currentPage = 0;
  playersHead.innerHTML = '';
  const playersPage = document.getElementById('pagePlayers');
  if(playersPage && playersPage.style.display === 'none'){
    playersBody.innerHTML = '';
    return;
  }
  renderPlayersPage();
}

function renderPlayersPage(){
  const colsToShow = LIST_COLS.filter(c => {
    if(c.key === '_opp_add') return typeof oppAddPlayer !== 'undefined';
    if(c.key === '_draft_prob') return typeof league !== 'undefined' && league === 'MBB' && typeof draftBadgeHtml === 'function';
    if(c.wbbOnly) return typeof league !== 'undefined' && league === 'WBB';
    return true;
  });

  if(!playersHead.children.length){
    const frag = document.createDocumentFragment();
    colsToShow.forEach(c => {
      const th = document.createElement('th');
      th.textContent = playerBoardColLabel(c);
      if(c.key === 'Score') th.classList.add('playersPerfHead');
      th.addEventListener('click', ()=>{
        if(sort.key === c.key) sort.dir = (sort.dir === 'asc' ? 'desc' : 'asc');
        else { sort.key = c.key; sort.dir = (c.key === 'ActualValuation_calc' || c.key === 'Score' || c.key === 'FitScore_calc') ? 'desc' : 'asc'; }
        filteredData = sortData(filteredData);
        currentPage = 0;
        renderPlayersPage();
      });
      frag.appendChild(th);
    });
    playersHead.innerHTML = '';
    playersHead.appendChild(frag);
  }

  const start = currentPage * PAGE_SIZE;
  const pageData = filteredData.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);

  // Pre-compute roster key sets for O(1) lookups instead of O(n) per row
  const _rosterKeySet = new Set(tbRoster.map(tbPlayerKey));
  const _oppKeySet = (typeof oppRoster !== 'undefined') ? new Set(oppRoster.map(tbPlayerKey)) : new Set();

  // Store pageData ref for event delegation
  _playersPageData = pageData;

  // Set up event delegation ONCE on the table body
  if(!playersBody._delegated){
    playersBody._delegated = true;
    playersBody.addEventListener('click', function(e){
      var btn = e.target.closest('.tbAddBtn');
      var link = e.target.closest('.link');
      var tr = e.target.closest('tr');
      if(!tr) return;
      var idx = Number(tr.dataset.ri);
      var pd = _playersPageData;
      if(!pd || !Number.isFinite(idx) || idx < 0 || idx >= pd.length) return;
      var r = pd[idx];
      if(btn){
        e.stopPropagation();
        if(btn.classList.contains('on-roster')) return;
        if(btn.dataset.action === 'tb'){ tbAddPlayer(r); }
        else if(btn.dataset.action === 'opp' && typeof oppAddPlayer !== 'undefined'){ oppAddPlayer(r); }
      } else if(link){
        openProfile(r);
      }
    });
  }

  const frag = document.createDocumentFragment();
  pageData.forEach((r, ri) => {
    const tr = document.createElement('tr');
    tr.dataset.ri = ri;
    const _rk = tbPlayerKey(r);
    colsToShow.forEach(c => {
      const td = document.createElement('td');
      if(c.key === 'Score') td.classList.add('playersPerfCell');
      let v = r[c.key];
      if(c.key === '_tb_add'){
        const onRoster = _rosterKeySet.has(_rk);
        if(onRoster){
          td.innerHTML = `<span class="tbAddBtn on-roster" title="Already on roster">&#10003;</span>`;
        } else {
          td.innerHTML = `<span class="tbAddBtn" data-action="tb" title="Add to roster">&#65291;</span>`;
        }
      }else if(c.key === '_opp_add'){
        const onOpp = _oppKeySet.has(_rk);
        if(onOpp){
          td.innerHTML = `<span class="tbAddBtn on-roster" title="Already in opponent">&#10003;</span>`;
        } else {
          td.innerHTML = `<span class="tbAddBtn" data-action="opp" title="Add to opponent" style="border-color:rgba(251,191,36,.4);color:var(--warn)">&#9876;</span>`;
        }
      }else if(c.key === 'Player'){
        const playerName = (v ?? '').toString();
        if(playerValueView === 'projection'){
          const badges = [];
          const conf = safeNum(r.ProjectionConfidence_calc);
          const riskLabel = (r.ProjectionMedicalRiskLabel_calc || '').toString();
          if(Number.isFinite(conf)){
            badges.push(`<span class="playersProjectionBadge playersProjectionBadge--${projectionConfidenceTone(conf)}">Conf ${Math.round(conf*100)}%</span>`);
          }
          if(riskLabel){
            badges.push(`<span class="playersProjectionBadge playersProjectionBadge--${projectionMedicalRiskTone(riskLabel)}">Risk ${riskLabel}</span>`);
          }
          td.innerHTML = `<div class="playersNameCell"><span class="link">${playerName}</span>${badges.length ? `<div class="playersProjectionBadges">${badges.join('')}</div>` : ''}</div>`;
          td.title = (r.ProjectionReasonSummary_calc || '').toString();
        } else {
          td.innerHTML = `<span class="link">${playerName}</span>`;
        }
      }else if(c.key === 'ConfMult_calc'){
        const cm = safeNum(r.ConfMult_calc);
        if(Number.isFinite(cm) && cm !== 1){
          td.textContent = cm.toFixed(2);
          td.style.color = cm > 1 ? 'var(--good)' : 'var(--bad)';
          td.style.fontWeight = '700';
        } else {
          td.textContent = Number.isFinite(cm) ? cm.toFixed(2) : '\u2014';
        }
      }else if(c.key === 'Height'){
        const h = Number(r.Height);
        if(Number.isFinite(h) && h > 0) td.textContent = Math.floor(h/12) + "'" + (h%12) + '"';
        else td.textContent = r.Height || '\u2014';
        td.style.color = 'var(--muted)';
      }else if(c.key === 'Score'){
        const scoreValue = playerValueView === 'projection' ? safeNum(r.ProjectionPerf_calc) : Number(r.Score);
        td.textContent = Number.isFinite(scoreValue) ? scoreValue.toFixed(2) : '\u2014';
      }else if(c.key === 'FitScore_calc'){
        td.textContent = Number.isFinite(r.FitScore_calc) ? r.FitScore_calc.toFixed(0) : '\u2014';
      }else if(c.key === 'ActualValuation_calc'){
        if(playerValueView === 'projection'){
          const medianValue = safeNum(r.ProjectionMedianValue_calc);
          const floorValue = safeNum(r.ProjectionFloorValue_calc);
          const ceilingValue = safeNum(r.ProjectionCeilingValue_calc);
          td.classList.add('playersProjectionValueCell');
          td.innerHTML = Number.isFinite(medianValue)
            ? `<div class="playersProjectionValueMain">${playersDisplayMoney(medianValue)}</div>${(Number.isFinite(floorValue) && Number.isFinite(ceilingValue)) ? `<div class="playersProjectionValueSub">${playersDisplayMoney(floorValue)} - ${playersDisplayMoney(ceilingValue)}</div>` : ''}`
            : '\u2014';
          td.title = (r.ProjectionReasonSummary_calc || '').toString();
        } else {
          const modelValue = safeNum(r.ActualValuation_calc);
          td.textContent = Number.isFinite(modelValue)
            ? playersDisplayMoney(modelValue)
            : '\u2014';
        }
      }else if(c.key === '_draft_prob'){
        if(typeof draftBadgeHtml === 'function'){
          td.innerHTML = draftBadgeHtml(r);
          td.style.textAlign = 'center';
        } else {
          td.textContent = '—';
        }
      }else{
        td.textContent = (v ?? '').toString();
      }
      tr.appendChild(td);
    });
    frag.appendChild(tr);
  });
  playersBody.innerHTML = '';
  playersBody.appendChild(frag);

  // Pagination controls
  let pag = document.getElementById('pagControls');
  if(!pag){
    pag = document.createElement('div');
    pag.id = 'pagControls';
    pag.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;flex-wrap:wrap';
    playersBody.closest('.card').insertBefore(pag, playersBody.closest('.scrollY').nextSibling);
  }
  if(totalPages <= 1){
    pag.innerHTML = `
      <span class="pill" style="font-size:11px">${filteredData.length} players</span>
      <button class="secondary" id="tbAddAllBtn" style="padding:5px 12px;font-size:10.5px;border-color:rgba(52,211,153,.3);color:var(--good)">＋ Add all ${filteredData.length} to roster</button>`;
  } else {
    pag.innerHTML = `
      <span class="pill" style="font-size:11px">Showing ${start+1}–${Math.min(start+PAGE_SIZE, filteredData.length)} of ${filteredData.length}</span>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="secondary" id="tbAddAllBtn" style="padding:5px 10px;font-size:10.5px;border-color:rgba(52,211,153,.3);color:var(--good)">＋ Add all ${filteredData.length}</button>
        <button class="secondary" id="pagPrev" style="padding:6px 12px;font-size:11px" ${currentPage===0?'disabled':''}>← Prev</button>
        <span style="font-size:11px;color:var(--muted)">Page ${currentPage+1} / ${totalPages}</span>
        <button class="secondary" id="pagNext" style="padding:6px 12px;font-size:11px" ${currentPage>=totalPages-1?'disabled':''}>Next →</button>
      </div>`;
    document.getElementById('pagPrev')?.addEventListener('click',()=>{if(currentPage>0){currentPage--;renderPlayersPage();}});
    document.getElementById('pagNext')?.addEventListener('click',()=>{if(currentPage<totalPages-1){currentPage++;renderPlayersPage();}});
  }
  document.getElementById('tbAddAllBtn')?.addEventListener('click',()=>{
    const maxR = Number(tbMaxRosterEl.value) || 13;
    const budget = Number(tbBudgetEl.value) || Infinity;
    const cap = Number(tbPlayerCapEl.value) || Infinity;
    let added = 0;
    filteredData.forEach(r => {
      if(tbRoster.length >= maxR) return;
      if(tbRoster.some(x => tbPlayerKey(x) === tbPlayerKey(r))) return;
      const val = safeNum(r.ActualValuation_calc) || 0;
      if(val > cap) return;
      const used = tbRoster.reduce((s,x) => s + (safeNum(x.ActualValuation_calc)||0), 0);
      if(used + val > budget) return;
      tbRoster.push(r);
      added++;
    });
    if(added > 0) tbRefresh();
  });
}

// Debounced search (150ms)
var _searchTimer = null;
function debouncedSearch(){
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(renderPlayers, 150);
}

// --- Class wrapper (organizational) ---
class PlayerRenderer {
  get LIST_COLS(){ return LIST_COLS; }
  get currentPage(){ return currentPage; }
  get filteredData(){ return filteredData; }
  sortData(data){ return sortData(data); }
  renderPlayers(){ return renderPlayers(); }
  renderPlayersPage(){ return renderPlayersPage(); }
  debouncedSearch(){ return debouncedSearch(); }
}

window.PlayerRenderer = new PlayerRenderer();
