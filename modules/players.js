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
  {key:'ActualValuation_calc', label:'Toledo Max $'},
  {key:'MarketPressure_calc', label:'Pressure $', productionOnly:true},
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
    if(typeof demoIsGuestMode === 'function' && demoIsGuestMode()) return playerValueView === 'projection' ? 'Median band' : 'Toledo max band';
    return playerValueView === 'projection' ? 'Median $' : col.label;
  }
  return col.label;
}

// --- Sort ---
function sortData(data){
  var k = playerBoardSortKey(sort.key);
  var dir = sort.dir;
  var out = data.slice();
  var n = out.length;
  if(!n) return out;
  var isNumeric = Number.isFinite(Number(out[0][k]));
  if(isNumeric){
    var m = dir === 'asc' ? 1 : -1;
    out.sort(function(a,b){ return ((+a[k] || 0) - (+b[k] || 0)) * m; });
  } else {
    var m2 = dir === 'asc' ? 1 : -1;
    out.sort(function(a,b){ return ((a[k] ?? '').toString().localeCompare((b[k] ?? '').toString())) * m2; });
  }
  return out;
}

// --- Render ---
var _lastHeaderKey = '';
function renderPlayers(){
  const q = (searchInput.value || '').toLowerCase().trim();
  let data = computed;
  if(q){
    data = data.filter(r => {
      var hay = r._searchStr;
      if(typeof hay !== 'string'){
        hay = ((r.Player || '') + ' ' + (r.Team || '') + ' ' + (r.Conference || r.Conf || '') + ' ' + (r.Position || r.Pos || '') + ' ' + (r.Height || '')).toLowerCase();
        r._searchStr = hay;
      }
      return hay.includes(q);
    });
  }
  currentPage = 0;
  var playersPage = document.getElementById('pagePlayers');
  if(playersPage && playersPage.style.display === 'none'){
    filteredData = data;
    playersBody.innerHTML = '';
    return;
  }
  filteredData = sortData(data);
  // Only rebuild headers when the column set actually changes (league switch, etc.)
  var headerKey = (typeof league !== 'undefined' ? league : '') + '|' + (typeof oppAddPlayer !== 'undefined' ? '1' : '0') + '|' + (typeof draftBadgeHtml === 'function' ? '1' : '0') + '|' + playerValueView;
  if(headerKey !== _lastHeaderKey){
    playersHead.innerHTML = '';
    _lastHeaderKey = headerKey;
  }
  renderPlayersPage();
}

function renderPlayersPage(){
  const colsToShow = LIST_COLS.filter(c => {
    if(c.key === '_opp_add') return typeof oppAddPlayer !== 'undefined';
    if(c.key === '_draft_prob') return typeof league !== 'undefined' && league === 'MBB' && typeof draftBadgeHtml === 'function';
    if(c.productionOnly) return playerValueView !== 'projection';
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
        else { sort.key = c.key; sort.dir = (c.key === 'ActualValuation_calc' || c.key === 'MarketPressure_calc' || c.key === 'Score' || c.key === 'FitScore_calc') ? 'desc' : 'asc'; }
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

  var _html = [];
  var _isProjection = playerValueView === 'projection';
  var _hasDraft = typeof draftBadgeHtml === 'function';
  var _esc = function(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
  var _toneRe = /^(good|warn|bad|neutral)$/;

  for(var ri = 0; ri < pageData.length; ri++){
    var r = pageData[ri];
    var _rk = tbPlayerKey(r);
    _html.push('<tr data-ri="', ri, '">');
    for(var ci = 0; ci < colsToShow.length; ci++){
      var c = colsToShow[ci];
      var v = r[c.key];
      if(c.key === '_tb_add'){
        _html.push(_rosterKeySet.has(_rk)
          ? '<td><span class="tbAddBtn on-roster" title="Already on roster">&#10003;</span></td>'
          : '<td><span class="tbAddBtn" data-action="tb" title="Add to roster">&#65291;</span></td>');
      }else if(c.key === '_opp_add'){
        _html.push(_oppKeySet.has(_rk)
          ? '<td><span class="tbAddBtn on-roster" title="Already in opponent">&#10003;</span></td>'
          : '<td><span class="tbAddBtn" data-action="opp" title="Add to opponent" style="border-color:rgba(251,191,36,.4);color:var(--warn)">&#9876;</span></td>');
      }else if(c.key === 'Player'){
        var pn = _esc((v ?? '').toString());
        if(_isProjection){
          var pBadges = '';
          var pConf = safeNum(r.ProjectionConfidence_calc);
          var pRisk = (r.ProjectionMedicalRiskLabel_calc || '').toString();
          if(Number.isFinite(pConf)) pBadges += '<span class="playersProjectionBadge playersProjectionBadge--' + projectionConfidenceTone(pConf) + '">Conf ' + Math.round(pConf*100) + '%</span>';
          if(pRisk) pBadges += '<span class="playersProjectionBadge playersProjectionBadge--' + projectionMedicalRiskTone(pRisk) + '">Risk ' + _esc(pRisk) + '</span>';
          _html.push('<td title="', _esc(r.ProjectionReasonSummary_calc || ''), '"><div class="playersNameCell"><span class="link">', pn, '</span>', pBadges ? '<div class="playersProjectionBadges">' + pBadges + '</div>' : '', '</div></td>');
        } else {
          _html.push('<td><span class="link">', pn, '</span></td>');
        }
      }else if(c.key === 'ConfMult_calc'){
        var cm = safeNum(r.ConfMult_calc);
        if(Number.isFinite(cm) && cm !== 1){
          _html.push('<td style="color:', cm > 1 ? 'var(--good)' : 'var(--bad)', ';font-weight:700">', cm.toFixed(2), '</td>');
        } else {
          _html.push('<td>', Number.isFinite(cm) ? cm.toFixed(2) : '\u2014', '</td>');
        }
      }else if(c.key === 'Height'){
        var h = Number(r.Height);
        _html.push('<td style="color:var(--muted)">');
        if(Number.isFinite(h) && h > 0) _html.push(Math.floor(h/12), "'", (h%12), '"');
        else _html.push(_esc(r.Height || '\u2014'));
        _html.push('</td>');
      }else if(c.key === 'Score'){
        var sv = _isProjection ? safeNum(r.ProjectionPerf_calc) : Number(r.Score);
        _html.push('<td class="playersPerfCell">', Number.isFinite(sv) ? sv.toFixed(2) : '\u2014', '</td>');
      }else if(c.key === 'FitScore_calc'){
        _html.push('<td>', Number.isFinite(r.FitScore_calc) ? r.FitScore_calc.toFixed(0) : '\u2014', '</td>');
      }else if(c.key === 'ActualValuation_calc'){
        if(_isProjection){
          var mv = safeNum(r.ProjectionMedianValue_calc), fv = safeNum(r.ProjectionFloorValue_calc), cv2 = safeNum(r.ProjectionCeilingValue_calc);
          _html.push('<td class="playersProjectionValueCell" title="', _esc(r.ProjectionReasonSummary_calc || ''), '">');
          if(Number.isFinite(mv)){
            _html.push('<div class="playersProjectionValueMain">', playersDisplayMoney(mv), '</div>');
            if(Number.isFinite(fv) && Number.isFinite(cv2)) _html.push('<div class="playersProjectionValueSub">', playersDisplayMoney(fv), ' - ', playersDisplayMoney(cv2), '</div>');
          } else _html.push('\u2014');
          _html.push('</td>');
        } else {
          var mVal = safeNum(r.ActualValuation_calc);
          var bVal = safeNum(r.ActualValuationBase_calc);
          var cVal = safeNum(r.ActualValuationCurve_calc);
          var tLabel = (r.TranslationRiskLabel_calc || '').toString();
          var tTone = _toneRe.test((r.TranslationRiskTone_calc || '').toString()) ? (r.TranslationRiskTone_calc || 'neutral') : 'neutral';
          var tReasons = (r.TranslationRiskReasons_calc || '').toString().trim();
          var sLabel = (r.ScoutAdjustmentLabel_calc || '').toString();
          var sTone = _toneRe.test((r.ScoutAdjustmentTone_calc || '').toString()) ? (r.ScoutAdjustmentTone_calc || 'neutral') : 'neutral';
          var sNote = (r.ScoutAdjustmentNote_calc || '').toString().trim();
          if(Number.isFinite(mVal)){
            var vTitle = [tReasons, sNote].filter(Boolean).join(' | ');
            _html.push('<td class="playersProjectionValueCell" title="', _esc(vTitle), '">');
            _html.push('<div class="playersProjectionValueMain">', playersDisplayMoney(mVal), '</div>');
            if(tLabel || sLabel){
              _html.push('<div class="playersProjectionBadges">');
              if(tLabel) _html.push('<span class="playersProjectionBadge playersProjectionBadge--', tTone, '">', _esc(tLabel), '</span>');
              if(sLabel) _html.push('<span class="playersProjectionBadge playersProjectionBadge--', sTone, '">', _esc(sLabel), '</span>');
              _html.push('</div>');
            }
            var subBits = [];
            if(tLabel && Number.isFinite(cVal) && (!Number.isFinite(bVal) || Math.abs(cVal - bVal) > 1)) subBits.push('Curve ' + playersDisplayMoney(cVal));
            if(sLabel && Number.isFinite(bVal) && Math.abs(mVal - bVal) > 1) subBits.push('Pre-scout ' + playersDisplayMoney(bVal));
            if(subBits.length) _html.push('<div class="playersProjectionValueSub">', subBits.join(' \u2022 '), '</div>');
            _html.push('</td>');
          } else {
            _html.push('<td>\u2014</td>');
          }
        }
      }else if(c.key === 'MarketPressure_calc'){
        var pVal = safeNum(r.MarketPressure_calc);
        var lLabel = (r.MarketLaneLabel_calc || '').toString();
        var lTone = _toneRe.test((r.MarketLaneTone_calc || '').toString()) ? (r.MarketLaneTone_calc || 'neutral') : 'neutral';
        var gVal = safeNum(r.MarketGap_calc);
        _html.push('<td class="playersProjectionValueCell">');
        if(Number.isFinite(pVal)){
          _html.push('<div class="playersProjectionValueMain">', playersDisplayMoney(pVal), '</div>');
          if(lLabel) _html.push('<div class="playersProjectionBadges"><span class="playersProjectionBadge playersProjectionBadge--', lTone, '">', _esc(lLabel), '</span></div>');
          if(Number.isFinite(gVal) && gVal > 0) _html.push('<div class="playersProjectionValueSub">+', playersDisplayMoney(gVal), ' vs bid</div>');
        } else _html.push('\u2014');
        _html.push('</td>');
      }else if(c.key === '_draft_prob'){
        _html.push('<td style="text-align:center">', _hasDraft ? draftBadgeHtml(r) : '\u2014', '</td>');
      }else{
        _html.push('<td>', _esc((v ?? '').toString()), '</td>');
      }
    }
    _html.push('</tr>');
  }
  playersBody.innerHTML = _html.join('');

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
