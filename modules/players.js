// ============ PLAYERS MODULE ============
// Dependencies: config.js (PAGE_SIZE, safeNum, fmtMoney), data.js (computed, pos, sort,
//   tbRoster, statDist, statPercentile, tbAddPlayer, tbRefresh, tbPlayerKey,
//   searchInput, playersHead, playersBody, fitPresetEl, tbMaxRosterEl, tbBudgetEl, tbPlayerCapEl)

// --- Module-level state (global) ---
var currentPage = 0;
var filteredData = [];

// --- Constants ---
const LIST_COLS = [
  {key:'_tb_add', label:''},
  {key:'_opp_add', label:''},
  {key:'CalcRank', label:'#'},
  {key:'Player', label:'Player'},
  {key:'Team', label:'Team'},
  {key:'Conference', label:'Conf'},
  {key:'ConfMult_calc', label:'CM'},
  {key:'MP', label:'MP'},
  {key:'Score', label:'Perf'},
  {key:'FitScore_calc', label:'Fit'},
  {key:'ActualValuation_calc', label:'Model $'},
  {key:'ActualValuation', label:'Actual $'},
  {key:'ValueDelta_calc', label:'Δ$'},
];

// --- Sort ---
function sortData(data){
  const k = sort.key;
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
      return ['Player','Team','Conference','Position'].some(k => (r[k] ?? '').toString().toLowerCase().includes(q));
    });
  }
  filteredData = sortData(data);
  currentPage = 0;
  playersHead.innerHTML = '';
  renderPlayersPage();
}

function renderPlayersPage(){
  const colsToShow = LIST_COLS.filter(c => {
    if(c.key === '_opp_add') return typeof oppAddPlayer !== 'undefined';
    return true;
  });

  if(!playersHead.children.length){
    const frag = document.createDocumentFragment();
    colsToShow.forEach(c => {
      const th = document.createElement('th');
      th.textContent = c.label;
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

  const frag = document.createDocumentFragment();
  pageData.forEach(r => {
    const tr = document.createElement('tr');
    const _rk = tbPlayerKey(r);
    colsToShow.forEach(c => {
      const td = document.createElement('td');
      let v = r[c.key];
      if(c.key === 'ActualValuation_calc' || c.key === 'ActualValuation' || c.key === 'ValueDelta_calc'){
        const n = safeNum(v);
        if(!Number.isFinite(n)) v = '—';
        else if(c.key === 'ValueDelta_calc') v = (n>=0?'+':'') + fmtMoney(n).replace('$','');
        else v = fmtMoney(n);
      }
      if(c.key === '_tb_add'){
        const onRoster = _rosterKeySet.has(_rk);
        if(onRoster){
          td.innerHTML = `<span class="tbAddBtn on-roster" title="Already on roster">✓</span>`;
        } else {
          td.innerHTML = `<span class="tbAddBtn" title="Add to roster">＋</span>`;
          td.querySelector('.tbAddBtn').addEventListener('click', (e)=>{ e.stopPropagation(); tbAddPlayer(r); });
        }
      }else if(c.key === '_opp_add'){
        const onOpp = _oppKeySet.has(_rk);
        if(onOpp){
          td.innerHTML = `<span class="tbAddBtn on-roster" title="Already in opponent">✓</span>`;
        } else {
          td.innerHTML = `<span class="tbAddBtn" title="Add to opponent" style="border-color:rgba(251,191,36,.4);color:var(--warn)">⚔</span>`;
          td.querySelector('.tbAddBtn').addEventListener('click', (e)=>{ e.stopPropagation(); if(typeof oppAddPlayer !== 'undefined') oppAddPlayer(r); });
        }
      }else if(c.key === 'Player'){
        td.innerHTML = `<span class="link">${(v ?? '').toString()}</span>`;
        td.querySelector('.link').addEventListener('click', ()=> openProfile(r));
      }else if(c.key === 'ConfMult_calc'){
        const cm = safeNum(r.ConfMult_calc);
        if(Number.isFinite(cm) && cm !== 1){
          td.textContent = cm.toFixed(2);
          td.style.color = cm > 1 ? 'var(--good)' : 'var(--bad)';
          td.style.fontWeight = '700';
        } else {
          td.textContent = Number.isFinite(cm) ? cm.toFixed(2) : '—';
        }
      }else if(c.key === 'Score' && Number.isFinite(Number(r.Score))){
        td.textContent = Number(r.Score).toFixed(2);
      }else if(c.key === 'FitScore_calc'){
        td.textContent = Number.isFinite(r.FitScore_calc) ? r.FitScore_calc.toFixed(0) : '—';
      }else if(c.key === 'ActualValuation_calc'){
        td.textContent = fmtMoney(r.ActualValuation_calc);
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
