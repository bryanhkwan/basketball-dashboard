// ============ AI CHAT SYSTEM MODULE ============
// Dependencies: all other modules (uses window._app bridge)
// Contains the Gemini-backed chatbot IIFE, wrapped in a class for organization.

(function(){
  const GEMINI_PROXY_URL = 'https://white-pine-7669.bryanhkwan.workers.dev';
  const GEMINI_MODEL = 'gemini-2.5-flash-lite';

  const toggle = document.getElementById('aiToggle');
  const panel = document.getElementById('aiPanel');
  const msgBox = document.getElementById('aiMessages');
  const input = document.getElementById('aiChatInput');
  const sendBtn = document.getElementById('aiSendBtn');

  let chatHistory = [];
  let pendingAction = null;
  let lastUserText = '';
  let turnHasDashboardLookup = false;
  let turnWebSearchDeferred = false;
  let turnHasWebSearch = false;
  let turnForcedWebForValuation = false;

  toggle.addEventListener('click', () => { panel.classList.toggle('hidden'); if(!panel.classList.contains('hidden')) input.focus(); });
  document.getElementById('aiClose').addEventListener('click', () => panel.classList.add('hidden'));
  document.getElementById('aiClearChat').addEventListener('click', () => {
    chatHistory = []; pendingAction = null; msgBox.innerHTML = '';
    lastUserText = '';
    turnHasDashboardLookup = false;
    turnWebSearchDeferred = false;
    turnHasWebSearch = false;
    turnForcedWebForValuation = false;
    addMsg('ai', "Chat cleared! 👋 What do you need, coach?");
  });
  input.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); }});
  sendBtn.addEventListener('click', send);
  document.querySelectorAll('.aiQuickBtn').forEach(b => b.addEventListener('click', () => {
    if(b.id === 'aiReopenCmp'){
      const a = app();
      if(a.openCompare && window._lastCompare) a.openCompare(window._lastCompare.name1, window._lastCompare.name2);
      return;
    }
    input.value = b.dataset.q; send();
  }));

  // ---- Helpers ----
  function addMsg(role, html){
    const d = document.createElement('div');
    d.className = 'aiMsg ' + role;
    d.innerHTML = html;
    msgBox.appendChild(d);
    msgBox.scrollTop = msgBox.scrollHeight;
    return d;
  }
  function showTyping(){
    const d = document.createElement('div'); d.className='aiTyping'; d.id='aiTypingIndicator';
    d.innerHTML='<span></span><span></span><span></span>'; msgBox.appendChild(d); msgBox.scrollTop=msgBox.scrollHeight;
  }
  function hideTyping(){ document.getElementById('aiTypingIndicator')?.remove(); }
  function fmt(v){ return v!=null ? (typeof v==='number' ? (Math.abs(v)<1&&v!==0 ? v.toFixed(3) : v.toFixed(1)) : v) : '—'; }

  function pushFnResult(name, args, result){
    const call = { name, args: args || {} };
    const modelMsg = { role:'model', parts:[{ functionCall: call }] };
    chatHistory.push(modelMsg);
    chatHistory.push({ role:'user', parts:[{ functionResponse:{ name, response:{ result } } }] });
  }

  function needsMandatoryWebReview(text){
    const t = (text || '').toLowerCase();
    if(!t) return false;

    const isSearchRequest = /\b(find|search|show|list|get|recommend|suggest)\b/.test(t);

    if(!isSearchRequest && /(\$[\d,.k]+|worth|valuat|invest|overpay|underpay|fair|steal|avoid|buy|sign|price|priced|pay)/.test(t)) return true;
    if(/(latest|recent|today|yesterday|this week|last week|news|injur|hurt|suspend|transfer|portal|available|availability|out for|return(ing)?|rumor|report|update|status|commit|nil\b|coaching|coach\b|minutes|role|lineup|start(er|ing)?)/.test(t)) return true;
    return false;
  }

  function buildForcedWebQuery(text){
    const raw = (text || '').trim();
    const ql = normAIName(raw);
    const isValuation = /(\$[\d,.]+|worth|value|valuat|invest|overpay|underpay|fair|steal|avoid|buy|sign|price|priced|pay)/.test(ql);
    const matchedPlayer = matchLoadedPlayer(raw);
    if(matchedPlayer){
      const nameAndTeam = matchedPlayer.Team ? `${matchedPlayer.Player} ${matchedPlayer.Team}` : matchedPlayer.Player;
      if(isValuation) return `${nameAndTeam} college basketball NIL salary contract value 2025`;
      return `${nameAndTeam} college basketball latest news injury transfer portal role minutes 2025`;
    }
    if(isValuation) return `${raw} college basketball NIL value market 2025`;
    return `${raw} college basketball latest news 2025`;
  }

  function escapeHtml(s){
    return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function fmtMoneyAI(n){
    if(n==null || !Number.isFinite(+n)) return '—';
    return '$' + Math.round(+n).toLocaleString();
  }

  function normAIName(s){
    return (s||'').toLowerCase().replace(/[.,]/g,'').replace(/\b(jr|sr|ii|iii|iv)\b/g,'').replace(/\s+/g,' ').trim();
  }

  function extractTeamHint(text, pool){
    const t = (text || '').trim();
    const patterns = [
      /\b(?:from|at|of|for)\s+([A-Za-z][A-Za-z\s\-']{1,40}?)(?=\s+(?:worth|is|was|will|can|should|playing|plays|player|basketball|\$|\d)|[,.]|$)/i,
      /\(([A-Za-z][A-Za-z\s\-']{1,40}?)\)/i,
    ];
    const candidates = [];
    for(const pat of patterns){ const m = t.match(pat); if(m) candidates.push(m[1].trim()); }
    if(!candidates.length) return null;
    const teams = [...new Set((pool||allPlayers()).map(r=>r.Team).filter(Boolean))];
    for(const hint of candidates){
      const hl = hint.toLowerCase();
      const best = teams.find(tm => tm.toLowerCase().includes(hl));
      if(best) return best;
    }
    return null;
  }

  function matchLoadedPlayer(text){
    const all = allPlayers();
    const ql = normAIName(text);
    const teamHint = extractTeamHint(text, all);
    const matches = all.filter(r => r.Player && ql.includes(normAIName(r.Player)));
    if(!matches.length) return null;
    if(teamHint && matches.length > 1){
      const specific = matches.find(r => (r.Team||'').toLowerCase().includes(teamHint.toLowerCase()));
      if(specific) return specific;
    }
    return matches.sort((a,b)=>(b.Player||'').length-(a.Player||'').length)[0];
  }

  function matchLoadedPlayerName(text){
    const p = matchLoadedPlayer(text);
    return p ? (p.Player || null) : null;
  }

  function renderDashboardEvidence(playerName, profile, matches){
    if(profile){
      const s = statLine(profile);
      const lines = [
        `<b>Dashboard data</b>`,
        `${escapeHtml(s.player||playerName||'Player')} (${escapeHtml(s.team||'')}${s.conf?`, ${escapeHtml(s.conf)}`:''})`,
        `PerfScore: <b>${escapeHtml(s.perf ?? '—')}</b> | Model value: <b>${escapeHtml(fmtMoneyAI(s.value))}</b> | Pos: ${escapeHtml(s.pos||'')}${s.cls?` | Class: ${escapeHtml(s.cls)}`:''}`,
        `PPG: ${escapeHtml(s.ppg ?? '—')} | APG: ${escapeHtml(s.apg ?? '—')} | RPG: ${escapeHtml(s.rpg ?? '—')} | BPG: ${escapeHtml(s.bpg ?? '—')} | DRtg: ${escapeHtml(s.drtg ?? '—')}`,
      ];
      addMsg('system', lines.join('<br>'));
      return;
    }
    const list = Array.isArray(matches) ? matches.slice(0,6) : [];
    const header = `<b>Dashboard matches</b> (top ${list.length})`;
    const rows = list.map(r => `${escapeHtml(r.player||'')} (${escapeHtml(r.team||'')}) | Perf: ${escapeHtml(r.perf ?? '—')} | Val: ${escapeHtml(fmtMoneyAI(r.value))}`);
    addMsg('system', [header].concat(rows.length ? rows : ['No matching players found in loaded data.']).join('<br>'));
  }

  function renderWebEvidence(webResult){
    const blob = (webResult && webResult.searchResults) ? String(webResult.searchResults) : '';
    let summary = blob;
    let sources = [];
    const parts = blob.split('\n\nSources:\n');
    if(parts.length > 1){
      summary = parts[0];
      sources = parts[1].split('\n').filter(Boolean).slice(0,3);
    }
    const out = [];
    out.push('<b>Web context</b>');
    out.push(escapeHtml(summary).slice(0,800).replace(/\n/g,'<br>'));
    if(sources.length){
      out.push('<br><b>Top sources</b><br>' + sources.map(s => escapeHtml(s)).join('<br>'));
    }
    addMsg('system', out.join('<br>'));
  }

  async function runValuationComparePipeline(userText){
    const text = (userText || '').trim();
    if(!text) return false;
    if(!needsMandatoryWebReview(text)) return false;

    const isValuation = /(\$[\d,.]+|worth|value|valuat|invest|overpay|underpay|fair|steal|avoid|buy|sign|price|priced|pay)/.test(text.toLowerCase());
    const hasPool = allPlayers().length > 0;

    const formatInstructions = isValuation
      ? `\n\nAfter reviewing the tool results, respond with this exact structure:\nDashboard evidence:\n- (1-3 bullets, cite PerfScore + model value)\nWeb evidence:\n- (1-3 bullets, include concrete dates if present)\nComparison:\n- (1-3 bullets explaining how web context changes confidence/upside/risk)\nVerdict: steal | fair | overpay | avoid (pick one)`
      : `\n\nAfter reviewing the tool results, respond with this exact structure:\nDashboard data:\n- (1-3 bullets from our loaded stats, or "No dashboard data loaded" if none available)\nWeb context:\n- (1-3 bullets with concrete dates from search results)\nSummary:\n- (direct answer combining both sources)`;
    chatHistory.push({role:'user', parts:[{text: text + formatInstructions}]});

    if(hasPool){
      const ctx = getDashboardContext();
      pushFnResult('get_dashboard_context', {}, ctx);
      turnHasDashboardLookup = true;

      const matchedPlayerObj = matchLoadedPlayer(text);
      const matched = matchedPlayerObj?.Player || null;
      let profile = null;
      if(matched){
        profile = getPlayerProfile(matched, matchedPlayerObj?.Team);
        pushFnResult('get_player_profile', {playerName: matched}, profile);
        renderDashboardEvidence(matched, profile, null);
      } else {
        const words = text.replace(/[^a-z\s]/gi,'').split(/\s+/).filter(w=>w.length>3);
        const shortQuery = words.slice(0,4).join(' ');
        const matches = shortQuery ? searchPlayers(shortQuery) : [];
        pushFnResult('search_players', {query: shortQuery||text}, matches);
        renderDashboardEvidence(null, null, matches);
      }
    }

    const q = buildForcedWebQuery(text);
    addMsg('system', 'Searching the web...');
    const webResult = await doWebSearch(q);
    pushFnResult('web_search', {query: q}, webResult);
    turnHasWebSearch = true;
    renderWebEvidence(webResult);

    const d = await callGemini(null);
    await processResp(d);
    return true;
  }

  // ---- App bridge ----
  const app = () => window._app || {};
  function allPlayers(){ const a=app(); return a.tbGetAllPlayers ? a.tbGetAllPlayers() : (a.computed||[]); }
  function statLine(r){
    return { player:r.Player, team:r.Team, pos:r.Position||r.Pos||'', conf:r.Conference||'',
      cls:r.Class||'', mpg:r.MPG!=null?+Number(r.MPG).toFixed(1):null,
      perf:r.Score?+r.Score.toFixed(1):null, value:r.ActualValuation_calc?Math.round(r.ActualValuation_calc):null,
      ppg:r.PPG!=null?+Number(r.PPG).toFixed(1):null, apg:r.APG!=null?+Number(r.APG).toFixed(1):null,
      rpg:r.RPG!=null?+Number(r.RPG).toFixed(1):null, spg:r.SPG!=null?+Number(r.SPG).toFixed(1):null,
      bpg:r.BPG!=null?+Number(r.BPG).toFixed(1):null, bpm:r.BPM!=null?+Number(r.BPM).toFixed(1):null,
      threePct:r['3P%']!=null?+Number(r['3P%']).toFixed(3):null, ftPct:r['FT%']!=null?+Number(r['FT%']).toFixed(3):null,
      efg:r['eFG%']!=null?+Number(r['eFG%']).toFixed(3):null, drtg:r.DRtg!=null?+Number(r.DRtg).toFixed(1):null,
      threePA:r['3PA']!=null?+Number(r['3PA']):null, threePAG:r['3PA/G']!=null?+Number(r['3PA/G']).toFixed(1):null,
      usg:r['USG%']!=null?+Number(r['USG%']).toFixed(1):null, per:r.PER!=null?+Number(r.PER).toFixed(1):null,
      ws40:r['WS/40']!=null?+Number(r['WS/40']).toFixed(3):null,
      threeRating:r['3PT_Rating']!=null?+Number(r['3PT_Rating']).toFixed(3):null,
    };
  }

  // ---- Tool implementations ----
  function getDashboardContext(){
    const a=app(), roster=a.tbRoster||[];
    return { league:a.league||'MBB', position:a.pos||'Guards', totalPlayers:allPlayers().length,
      rosterSize:roster.length, roster:roster.map(r=>({player:r.Player,team:r.Team,pos:r.Position||'',
      perf:r.Score?r.Score.toFixed(1):'—',value:r.ActualValuation_calc?'$'+Math.round(r.ActualValuation_calc).toLocaleString():'—'})),
      budget:document.getElementById('tbBudget')?.value||'500000',
      playerCap:document.getElementById('tbPlayerCap')?.value||'150000',
      maxRoster:document.getElementById('tbMaxRoster')?.value||'13',
      targetGuards:document.getElementById('tbTargetGuards')?.value||'8',
      targetBigs:document.getElementById('tbTargetBigs')?.value||'5' };
  }

  function searchPlayers(q){
    const pool=allPlayers(); if(!pool.length)return [];
    const lq=q.toLowerCase();
    return pool.filter(r=>['Player','Team','Conference','Position'].some(k=>(r[k]||'').toString().toLowerCase().includes(lq))).slice(0,20).map(statLine);
  }

  function getPlayerProfile(name, team){
    const all=allPlayers(), pn=name.toLowerCase();
    let m;
    if(team){ const tl=team.toLowerCase(); m=all.find(r=>(r.Player||'').toLowerCase().includes(pn)&&(r.Team||'').toLowerCase().includes(tl)); }
    m = m || all.find(r=>(r.Player||'').toLowerCase().includes(pn));
    if(!m) return null;
    const out={}; for(const[k,v]of Object.entries(m)){ if(v!=null&&v!==''&&!k.startsWith('_')) out[k]=typeof v==='number'?+v.toFixed(3):v; }
    return out;
  }

  function getTopPlayers(f){
    let pool=allPlayers().slice();
    const totalBefore = pool.length;
    if(f.position){ const fp=f.position.toLowerCase();
      pool=pool.filter(r=>{
        const pos=(r.Position||'').toString().toLowerCase();
        const rawPos=(r.Pos||'').toString().toLowerCase();
        if(fp==='guard'||fp==='guards') return pos==='guards'||pos.includes('guard')||rawPos==='g'||rawPos==='g-f'||rawPos==='f-g'||rawPos==='pg'||rawPos==='sg';
        if(fp==='big'||fp==='bigs'||fp==='forward'||fp==='center') return pos==='bigs'||pos.includes('forward')||pos.includes('center')||rawPos==='f'||rawPos==='c'||rawPos==='f-c'||rawPos==='c-f'||rawPos==='pf'||rawPos==='sf';
        return pos.includes(fp)||rawPos.includes(fp);
      }); }
    const afterPosFilter = pool.length;
    if(f.maxValue) pool=pool.filter(r=>(r.ActualValuation_calc||Infinity)<=+f.maxValue);
    if(f.minPerf) pool=pool.filter(r=>(r.Score||0)>=+f.minPerf);
    if(f.team){ const t=f.team.toLowerCase(); pool=pool.filter(r=>(r.Team||'').toLowerCase().includes(t)); }
    if(f.conference){ const c=f.conference.toLowerCase(); pool=pool.filter(r=>(r.Conference||'').toLowerCase().includes(c)); }
    if(f.sortBy) pool.sort((a,b)=>(+(b[f.sortBy])||0)-(+(a[f.sortBy])||0)); else pool.sort((a,b)=>(b.Score||0)-(a.Score||0));
    const results = pool.slice(0,f.limit||10).map(statLine);
    return {
      results,
      totalPool: totalBefore,
      afterPositionFilter: afterPosFilter,
      finalCount: pool.length,
      note: afterPosFilter === 0 && f.position ? `No ${f.position} players found in ${app().league || 'current league'} (pool had ${totalBefore} total). Both Guards and Bigs data should be auto-loaded.` : null
    };
  }

  function addPlayersToRoster(names, team, conference, limit){
    const a=app(); if(!a.tbRoster) return {error:'Team builder not loaded.'};
    const all=allPlayers();
    const safeNumLocal = a.safeNum || (v => isNaN(+v) ? 0 : +v);

    const toAdd=[], notFound=[];
    if(team || conference){
      let pool = all.filter(r=>{
        if(team && !(r.Team||'').toLowerCase().includes(team.toLowerCase())) return false;
        if(conference && !(r.Conference||'').toLowerCase().includes(conference.toLowerCase())) return false;
        return true;
      });
      if(limit) pool = pool.slice(0, limit);
      pool.forEach(r => toAdd.push(r));
      if(!toAdd.length) return {added:0, failed:[`No players found for team="${team||''}" conference="${conference||''}"`], rosterSize:a.tbRoster.length, adjustments:{}};
    } else {
      (names||[]).forEach(n=>{
        const m=all.find(r=>(r.Player||'').toLowerCase().includes(n.toLowerCase()));
        if(m) toAdd.push(m); else notFound.push(n);
      });
      if(!toAdd.length) return {added:0, failed:notFound, rosterSize:a.tbRoster.length, adjustments:{}};
    }

    const keyFn = a.tbPlayerKey || (r=>(r.Player||'')+'|'+(r.Team||''));
    const leagueFn = a.tbPlayerLeague || (()=>'MBB');
    const rosterKeys = new Set(a.tbRoster.map(keyFn));
    const rosterLeague = a.tbRoster.length > 0 ? leagueFn(a.tbRoster[0]) : null;
    const valid=[], skipped=[];
    toAdd.forEach(r=>{
      if(rosterKeys.has(keyFn(r))){ skipped.push(r.Player||'?'); return; }
      if(rosterLeague && leagueFn(r) !== rosterLeague){ skipped.push(r.Player||'?'); return; }
      valid.push(r);
    });

    const adjustments={};
    const maxREl=document.getElementById('tbMaxRoster');
    const capEl=document.getElementById('tbPlayerCap');
    const budgetEl=document.getElementById('tbBudget');

    const neededRoster = a.tbRoster.length + valid.length;
    const currentMax = Number(maxREl?.value) || 13;
    if(neededRoster > currentMax && maxREl){
      maxREl.value = neededRoster;
      adjustments.maxRoster = {from:currentMax, to:neededRoster};
    }

    const currentCap = Number(capEl?.value) || Infinity;
    const maxVal = Math.max(0, ...valid.map(r=>safeNumLocal(r.ActualValuation_calc)||0));
    if(Number.isFinite(currentCap) && maxVal > currentCap && capEl){
      const newCap = Math.ceil(maxVal/1000)*1000;
      capEl.value = newCap;
      adjustments.playerCap = {from:currentCap, to:newCap};
    }

    const currentBudget = Number(budgetEl?.value) || Infinity;
    const usedCost = a.tbRoster.reduce((s,x)=>s+(safeNumLocal(x.ActualValuation_calc)||0), 0);
    const addCost  = valid.reduce((s,r)=>s+(safeNumLocal(r.ActualValuation_calc)||0), 0);
    if(Number.isFinite(currentBudget) && usedCost+addCost > currentBudget && budgetEl){
      const newBudget = Math.ceil((usedCost+addCost)/1000)*1000;
      budgetEl.value = newBudget;
      adjustments.budget = {from:currentBudget, to:newBudget};
    }

    valid.forEach(r => a.tbRoster.push(r));
    if(a.tbRefresh) a.tbRefresh();

    const failed=[...notFound, ...skipped];
    return {added:valid.length, failed, rosterSize:a.tbRoster.length, adjustments};
  }

  function addPlayersToOpponent(names, team, conference, limit){
    const a=app();
    if(!a.oppRoster) return {error:'Opponent roster not available.'};
    const all=allPlayers();
    const toAdd=[], notFound=[];

    if(team || conference){
      let pool = all.filter(r=>{
        if(team && !(r.Team||'').toLowerCase().includes(team.toLowerCase())) return false;
        if(conference && !(r.Conference||'').toLowerCase().includes(conference.toLowerCase())) return false;
        return true;
      });
      if(limit) pool = pool.slice(0, limit);
      pool.forEach(r => toAdd.push(r));
      if(!toAdd.length) return {added:0, failed:[`No players found`], oppRosterSize:a.oppRoster.length};
    } else {
      (names||[]).forEach(n=>{
        const m=all.find(r=>(r.Player||'').toLowerCase().includes(n.toLowerCase()));
        if(m) toAdd.push(m); else notFound.push(n);
      });
    }

    const keyFn = a.tbPlayerKey || (r=>(r.Player||'')+'|'+(r.Team||''));
    const existingKeys = new Set(a.oppRoster.map(keyFn));
    const valid=[], skipped=[];
    toAdd.forEach(r=>{
      if(existingKeys.has(keyFn(r))){ skipped.push(r.Player||'?'); return; }
      valid.push(r);
    });

    // Bulk push to oppRoster directly (per MEMORY.md pattern)
    const roster = a.oppRoster;
    valid.forEach(r => roster.push(r));
    if(a.oppRefresh) a.oppRefresh();

    return {added:valid.length, failed:[...notFound,...skipped], oppRosterSize:a.oppRoster.length};
  }

  function removeFromRoster(name){
    const a=app(); if(!a.tbRoster) return {error:'Team builder not loaded.'};
    const idx=a.tbRoster.findIndex(r=>(r.Player||'').toLowerCase().includes(name.toLowerCase()));
    if(idx===-1) return {success:false,message:name+' not on roster.'};
    const removed=a.tbRoster[idx].Player; a.tbRoster.splice(idx,1);
    if(a.tbRefresh) a.tbRefresh();
    return {success:true,removed,rosterSize:a.tbRoster.length};
  }

  function swapPlayer(drop,add){
    const a=app(); if(!a.tbRoster) return {error:'Team builder not loaded.'};
    const all=allPlayers();
    const di=a.tbRoster.findIndex(r=>(r.Player||'').toLowerCase().includes(drop.toLowerCase()));
    if(di===-1) return {success:false,message:drop+' not on roster.'};
    const ap=all.find(r=>(r.Player||'').toLowerCase().includes(add.toLowerCase()));
    if(!ap) return {success:false,message:add+' not found.'};
    const dropped=a.tbRoster[di].Player; a.tbRoster.splice(di,1,ap);
    if(a.tbRefresh) a.tbRefresh();
    return {success:true,dropped,added:ap.Player,rosterSize:a.tbRoster.length};
  }

  function comparePlayers(n1,n2){
    const a = app();
    if(!a.openCompare) return {error:'Comparison not available.'};
    const result = a.openCompare(n1, n2);
    if(!result) return {error: 'One or both players not found. Make sure both tabs (Guards & Bigs) have been loaded.'};
    const p1 = getPlayerProfile(n1), p2 = getPlayerProfile(n2);
    return {opened: true, player1: p1 ? statLine(p1) : null, player2: p2 ? statLine(p2) : null};
  }

  function getHeadToHead(){
    const a = app();
    if(a.getHeadToHead) return a.getHeadToHead();
    return {error:'Head-to-head not available.'};
  }

  // ---- Gemini Tool Schema ----
  const tools=[
    {functionDeclarations:[
    {name:'search_players',description:'Search players in our database by name, team, conference, or position.',
      parameters:{type:'OBJECT',properties:{query:{type:'STRING',description:'Search query'}},required:['query']}},
    {name:'get_player_profile',description:'Get full stats for a player from our database.',
      parameters:{type:'OBJECT',properties:{playerName:{type:'STRING'}},required:['playerName']}},
    {name:'get_top_players',description:'Get top players filtered by position, budget, team, conference, sorted by stat. Use for finding shooters (sortBy 3PT_Rating), defenders (sortBy DRtg), scorers (sortBy PPG), etc.',
      parameters:{type:'OBJECT',properties:{
        position:{type:'STRING',description:'guard, big, forward, center'},
        maxValue:{type:'NUMBER',description:'Max valuation $'},
        minPerf:{type:'NUMBER',description:'Min PerfScore'},
        team:{type:'STRING'},conference:{type:'STRING'},
        sortBy:{type:'STRING',description:'Score, PPG, 3PT_Rating (ALWAYS use for shooters instead of 3P%), 3P%, eFG%, APG, BPG, RPG, BPM, SPG, FT%, DRtg, USG%, PER, WS/40, 3PA/G, ActualValuation_calc'},
        limit:{type:'NUMBER',description:'# results (default 10)'}}}},
    {name:'get_dashboard_context',description:'Get current roster, budget, settings.',
      parameters:{type:'OBJECT',properties:{}}},
    {name:'add_players_to_roster',description:'Add players to roster. Use playerNames for specific players. Use team or conference (without playerNames) to add ALL players from a team/conference. Call this immediately after your recommendation — the UI shows Yes/No buttons to the user automatically.',
      parameters:{type:'OBJECT',properties:{playerNames:{type:'ARRAY',items:{type:'STRING'},description:'Specific player names to add'},team:{type:'STRING',description:'Add ALL players from this team'},conference:{type:'STRING',description:'Add ALL players from this conference'},limit:{type:'NUMBER',description:'Max players when using team/conference (optional)'}}}},
    {name:'remove_player_from_roster',description:'Remove player from roster. Call this immediately after your recommendation — the UI shows Yes/No buttons to the user automatically.',
      parameters:{type:'OBJECT',properties:{playerName:{type:'STRING'}},required:['playerName']}},
    {name:'swap_roster_player',description:'Swap one roster player for another. Call this immediately after your recommendation — the UI shows Yes/No buttons to the user automatically.',
      parameters:{type:'OBJECT',properties:{dropPlayer:{type:'STRING'},addPlayer:{type:'STRING'}},required:['dropPlayer','addPlayer']}},
    {name:'compare_players',description:'Compare two players side-by-side with visual stats table. ALWAYS use this for comparisons.',
      parameters:{type:'OBJECT',properties:{player1:{type:'STRING'},player2:{type:'STRING'}},required:['player1','player2']}},
    {name:'add_players_to_opponent',description:'Add players to the opponent roster for head-to-head analysis. Executes immediately (no confirmation).',
      parameters:{type:'OBJECT',properties:{playerNames:{type:'ARRAY',items:{type:'STRING'}},team:{type:'STRING'},conference:{type:'STRING'},limit:{type:'NUMBER'}}}},
    {name:'get_head_to_head',description:'Get per-category stat comparison between my roster and opponent roster.',
      parameters:{type:'OBJECT',properties:{}}},
    {name:'web_search',description:'Search Google for external information about a player or topic (injury news, transfer portal, scouting reports, recruiting rankings, role/minutes updates, team news, recaps). IMPORTANT: always look up dashboard data first (get_dashboard_context + get_player_profile/search_players/get_top_players/compare_players). Only call web_search AFTER the dashboard pass when the question depends on current external context.',
      parameters:{type:'OBJECT',properties:{query:{type:'STRING',description:'Google search query'}},required:['query']}},
  ]}
  ];

  const CONFIRM_ACTIONS=new Set(['add_players_to_roster','remove_player_from_roster','swap_roster_player']);

  async function doWebSearch(query){
    try{
      const res = await fetch(GEMINI_PROXY_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'web_search', query})
      });
      const data = await res.json();
      if(data.error) return {error: typeof data.error === 'string' ? data.error : data.error.message || JSON.stringify(data.error)};
      let result = data.summary || 'No results found.';
      if(data.sources && data.sources.length){
        result += '\n\nSources:\n' + data.sources.map((s,i) => `${i+1}. ${s.title} — ${s.url}`).join('\n');
      }
      return {searchResults: result, query};
    }catch(e){
      return {error: 'Web search failed: ' + e.message};
    }
  }

  function execCall(c){
    const a=c.args||{};
    switch(c.name){
      case 'search_players': return searchPlayers(a.query||'');
      case 'get_player_profile': return getPlayerProfile(a.playerName||'');
      case 'get_top_players': return getTopPlayers(a);
      case 'get_dashboard_context': return getDashboardContext();
      case 'add_players_to_roster': return addPlayersToRoster(a.playerNames||[], a.team, a.conference, a.limit);
      case 'remove_player_from_roster': return removeFromRoster(a.playerName||'');
      case 'swap_roster_player': return swapPlayer(a.dropPlayer||'',a.addPlayer||'');
      case 'compare_players': return comparePlayers(a.player1||'',a.player2||'');
      case 'add_players_to_opponent': return addPlayersToOpponent(a.playerNames||[], a.team, a.conference, a.limit);
      case 'get_head_to_head': return getHeadToHead();
      case 'web_search': return doWebSearch(a.query||'');
      default: return {error:'Unknown: '+c.name};
    }
  }

  // ---- System prompt ----
  function sysPrompt(){
    const ctx=getDashboardContext();
    return {parts:[{text:`You are Scout AI, an expert basketball analytics and scouting assistant for the UToledo NCAA Basketball Dashboard. You are opinionated, knowledgeable, and proactive -- like a real assistant coach.

STATE: ${ctx.league}, ${ctx.position} tab, ${ctx.totalPlayers} players loaded
ROSTER: ${ctx.rosterSize}/${ctx.maxRoster} | Budget: $${(+ctx.budget).toLocaleString()} | Cap: $${(+ctx.playerCap).toLocaleString()} | Target: ${ctx.targetGuards}G/${ctx.targetBigs}B
${ctx.roster.length?'PLAYERS:\n'+ctx.roster.map((r,i)=>(i+1)+'. '+r.player+' ('+r.team+', '+r.pos+', Perf:'+r.perf+', Val:'+r.value+')').join('\n'):'ROSTER: empty'}

 RULES (strict):
 1) TOOL ORDER: Use dashboard tools first. Get constraints via get_dashboard_context when needed, then use search_players/get_top_players/get_player_profile/compare_players. Only use web_search AFTER the dashboard pass for anything the dashboard cannot know or that may have changed recently.
 2) COMPARE: For player vs player, ALWAYS call compare_players (do not hand-compare raw stats).
 3) FINDING PLAYERS: Use get_top_players with sortBy. For shooters ALWAYS sort by 3PT_Rating (never raw 3P%). For defenders use DRtg; for rim protection use BPG; scorers PPG; playmakers APG. Apply minPerf and maxValue when relevant. CRITICAL: NEVER recommend a player by name unless you have seen that player in a dashboard tool result (get_top_players, search_players, or get_player_profile) in this conversation. Do NOT use your training knowledge to invent player names.
 4) ROSTER ACTIONS: For swap requests, you MUST call get_top_players first to find real candidates from the dashboard, then pick your recommendation from those results. Give your recommendation with reasoning, then IMMEDIATELY call swap_roster_player in the same response — the system shows Yes/No buttons automatically. Do NOT ask "Want me to do this?" and wait.
  5) WEB_SEARCH REQUIRED: If the user says "latest/most recent/today/this week/yesterday/tomorrow", asks about injuries/suspensions/availability/transfer portal/role/minutes changes/NIL/coaching news, OR asks any valuation question (worth $, fair, overpay, steal, invest), you MUST call web_search after dashboard lookup.
 6) SOURCE OF TRUTH: Dashboard = stats, PerfScore, archetypes, fit score, model valuation, roster legality (MBB/WBB separation). Web = current context/status. If web context changes your recommendation, say so and reduce confidence.
 7) WEB REPORTING: When you use web_search, include concrete dates (not relative phrasing). If sources conflict, state the conflict and be conservative.
 8) OUTPUT FORMAT: (1) Recommendation: steal/fair/overpay/avoid (2) Dashboard evidence (3) Web evidence w/ dates (if used) (4) Risks/assumptions (5) Next action.
 9) EFFICIENCY: Minimize tool calls. Do at most 1 web_search unless the top option has a red-flag or the user explicitly asks for broader verification.
 10) LEAGUE SEPARATION: MBB and WBB cannot be mixed. Current league: ${ctx.league}.
 11) STYLE: Be concise. Use **bold** for emphasis. Format money like $125,000 (not 125000). Give a clear opinion; do not hedge unnecessarily.`}]};
  }

  // ---- API call ----
  async function callGemini(userText, fnResp){
    if(userText) chatHistory.push({role:'user',parts:[{text:userText}]});
    if(fnResp){
      chatHistory.push(fnResp.modelMsg);
      chatHistory.push({role:'user',parts:[{functionResponse:{name:fnResp.name,response:{result:fnResp.result}}}]});
    }
    const res=await fetch(GEMINI_PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:GEMINI_MODEL,contents:chatHistory,tools,systemInstruction:sysPrompt(),
        generationConfig:{temperature:0.7,maxOutputTokens:2048}})});
    const data=await res.json();
    if(data.error){ console.error('Gemini error:',data.error); throw new Error(data.error.message||data.error.status||JSON.stringify(data.error)); }
    return data;
  }

  // ---- Process response ----
  async function processResp(data, depth){
    depth = depth || 0;
    if(depth > 5){ addMsg('ai','I hit a loop limit. Here\'s what I have so far.'); return; }

    if(!data.candidates||!data.candidates.length){
      console.warn('No candidates in response:', JSON.stringify(data).slice(0,1000));
      const reason = data.promptFeedback?.blockReason || '';
      if(reason) addMsg('ai','My response was blocked: '+reason+'. Try rephrasing.');
      else addMsg('ai','I had trouble with that. Try a simpler question or rephrase it.');
      return;
    }

    const parts=data.candidates[0].content?.parts||[];
    if(!parts.length){ addMsg('ai','Empty response. Try rephrasing.'); return; }
    const hasFunctionCall = parts.some(p => !!p.functionCall);

    if(!hasFunctionCall && turnHasDashboardLookup && !turnHasWebSearch && !turnForcedWebForValuation && needsMandatoryWebReview(lastUserText)){
      turnForcedWebForValuation = true;
      const forcedQuery = buildForcedWebQuery(lastUserText);
      addMsg('system', 'Searching the web...');
      let forcedResult;
      try{ forcedResult = await doWebSearch(forcedQuery); }
      catch(e){ forcedResult = { error: e.message || String(e) }; }
      try{
        const modelMsg = { role:'model', parts:[{ functionCall:{ name:'web_search', args:{ query: forcedQuery } } }] };
        const d2 = await callGemini(null, { name:'web_search', result:forcedResult, modelMsg });
        await processResp(d2, depth+1);
      }catch(err){
        addMsg('ai','Error: '+err.message);
      }
      return;
    }

    let hasText=false;
    for(const part of parts){
      if(part.text){
        hasText=true;
        chatHistory.push({role:'model',parts:[{text:part.text}]});
        addMsg('ai', fmtText(part.text));
      }
      if(part.functionCall){
        const call=part.functionCall;
        const modelMsg={role:'model',parts:[{functionCall:call}]};

        if(CONFIRM_ACTIONS.has(call.name)){
          if(call.name === 'swap_roster_player'){
            const addName = (call.args?.addPlayer || '').trim().toLowerCase();
            const playerExists = addName && allPlayers().some(r=>(r.Player||'').toLowerCase().includes(addName));
            if(!playerExists && addName){
              const dropRow = app().tbRoster?.find(r=>(r.Player||'').toLowerCase().includes((call.args?.dropPlayer||'').toLowerCase()));
              const dropPosStr = ((dropRow?.Position||'')+(dropRow?.Pos||'')).toLowerCase();
              const isGuard = dropPosStr.includes('guard')||/\bg\b|pg|sg|g-f/.test(dropPosStr);
              const isBig = dropPosStr.includes('big')||dropPosStr.includes('forward')||dropPosStr.includes('center')||/\bf\b|\bc\b|pf|sf|f-c|c-f/.test(dropPosStr);
              const posHint = isGuard ? 'guard' : isBig ? 'big' : null;
              const ctx = getDashboardContext();
              const candidates = getTopPlayers({position: posHint||undefined, limit:10, maxValue: ctx.playerCap||undefined});
              chatHistory.push(modelMsg);
              chatHistory.push({role:'user',parts:[{functionResponse:{name:'swap_roster_player',response:{result:{
                success:false,
                error:`"${call.args.addPlayer}" is not in the dashboard database. You must only recommend players confirmed in the dashboard. Here are the top available ${posHint||'players'} — pick one of these:`,
                availablePlayers: candidates.results
              }}}}]});
              turnHasDashboardLookup = true;
              addMsg('system','⚠️ '+call.args.addPlayer+' not in database — finding real candidates...');
              try{ const d2=await callGemini(null,null); await processResp(d2,depth+1); }
              catch(e){ addMsg('ai','Error: '+e.message); }
              return;
            }
          }

          pendingAction={call,modelMsg};
          const confirmBtns='<div class="aiConfirm"><button class="aiConfirmBtn yes" onclick="window._aiConfirm(true)">✓ Yes, do it</button><button class="aiConfirmBtn no" onclick="window._aiConfirm(false)">✕ Cancel</button></div>';
          if(!hasText){
            const names=(call.args?.playerNames||[]).join(', ');
            const teamLabel=call.args?.team?'all <b>'+call.args.team+'</b> players':names?'<b>'+names+'</b>':'players';
            const desc=call.name==='add_players_to_roster'?'Add '+teamLabel+' to roster'
              :call.name==='remove_player_from_roster'?'Remove <b>'+call.args?.playerName+'</b> from roster'
              :'Swap <b>'+call.args?.dropPlayer+'</b> → <b>'+call.args?.addPlayer+'</b>';
            addMsg('ai','I\'d like to: '+desc+'.'+confirmBtns);
          } else {
            addMsg('ai',confirmBtns);
          }
          return;
        }

        if(call.name === 'web_search' && !turnHasDashboardLookup && !turnWebSearchDeferred){
          const q = (call.args?.query || lastUserText || '').trim();
          const hasPool = allPlayers().length > 0;
          if(q && hasPool){
            turnWebSearchDeferred = true;
            addMsg('system', '🔍 Looking up data...');
            try{
              pushFnResult('get_dashboard_context', {}, getDashboardContext());
              turnHasDashboardLookup = true;

              const matchedPlayerObj = matchLoadedPlayer(q);
              const matched = matchedPlayerObj?.Player || null;
              const profile = matched ? getPlayerProfile(matched, matchedPlayerObj?.Team) : null;
              if(profile) pushFnResult('get_player_profile', {playerName: matched}, profile);
              else pushFnResult('search_players', {query: q}, searchPlayers(q));

              const d2 = await callGemini(null, null);
              await processResp(d2, depth+1);
              return;
            }catch(e){
              // Fail-open: keep original web_search path
            }
          }
        }

        const isWebSearch = call.name === 'web_search';
        addMsg('system', isWebSearch ? '🌐 Searching the web...' : '🔍 Looking up data...');
        let result;
        try{
          const r = execCall(call);
          result = (r && typeof r.then === 'function') ? await r : r;
        }catch(e){ result={error:e.message}; }

        if(isWebSearch) turnHasWebSearch = true;
        else turnHasDashboardLookup = true;

        if(call.name === 'compare_players'){
          chatHistory.push(modelMsg);
          if(result && result.opened){
            const p1n = result.player1?.player || call.args?.player1 || '?';
            const p2n = result.player2?.player || call.args?.player2 || '?';
            chatHistory.push({role:'user',parts:[{functionResponse:{name:call.name,response:{result:{opened:true}}}}]});
            addMsg('ai', `⚔️ Opened side-by-side comparison of <b>${p1n}</b> vs <b>${p2n}</b>. Click the 🤖 button to see it behind this panel, or use <b>↩ Last compare</b> to reopen anytime.`);
          } else {
            addMsg('ai', result?.error || 'Could not find one or both players.');
          }
          return;
        }

        // add_players_to_opponent executes immediately (not in CONFIRM_ACTIONS)
        if(call.name === 'add_players_to_opponent'){
          chatHistory.push(modelMsg);
          chatHistory.push({role:'user',parts:[{functionResponse:{name:call.name,response:{result}}}]});
          const msg = result.error ? `Error: ${result.error}` : `Added ${result.added} player(s) to opponent roster.`;
          addMsg('ai', msg);
          try{ const d2=await callGemini(null,null); await processResp(d2,depth+1); }catch(e){}
          return;
        }

        try{
          const d2=await callGemini(null,{name:call.name,result,modelMsg});
          await processResp(d2, depth+1);
        }catch(err){
          if(result&&!result.error){
            const preview=Array.isArray(result)?'Found '+result.length+' players.':JSON.stringify(result).slice(0,300);
            addMsg('ai','Here\'s the data:<br><code>'+preview+'</code><br>(Analysis failed: '+err.message+')');
          } else addMsg('ai','Error: '+err.message);
        }
        return;
      }
    }
  }

  function fmtText(t){
    let html = t.replace(/\*\*(.*?)\*\*/g,'<b>$1</b>').replace(/\n- /g,'\n• ').replace(/\n/g,'<br>').replace(/`([^`]+)`/g,'<code>$1</code>');
    const all = allPlayers();
    if(all.length){
      const names = [...new Set(all.map(r=>r.Player).filter(Boolean))].sort((a,b)=>b.length-a.length);
      for(const name of names){
        if(name.length < 5) continue;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('(?<!<[^>]*)\\b(' + escaped + ')\\b', 'g');
        html = html.replace(re, `<span class="aiPlayerLink" onclick="(function(){const a=window._app;if(a&&a.openProfile){const p=a.tbGetAllPlayers().find(r=>r.Player==='${name.replace(/'/g,"\\'")}');if(p)a.openProfile(p);}})()">$1</span>`);
      }
    }
    return html;
  }

  async function executeConfirm(confirmed){
    if(!pendingAction) return;
    document.querySelectorAll('.aiConfirmBtn').forEach(b => { b.disabled=true; b.style.opacity='0.4'; });
    if(confirmed){
      addMsg('system','⚡ Executing...');
      let result; try{result=execCall(pendingAction.call);}catch(e){result={error:e.message};}
      const pa=pendingAction; pendingAction=null;
      sendBtn.disabled=true;
      try{ const d=await callGemini(null,{name:pa.call.name,result,modelMsg:pa.modelMsg}); await processResp(d); }
      catch(err){ addMsg('ai','Done! '+(result.error||result.added+' added'||JSON.stringify(result))); }
      sendBtn.disabled=false;
    } else {
      pendingAction=null;
      addMsg('ai','Cancelled. What else?');
    }
  }
  window._aiConfirm = executeConfirm;

  // ---- Compound command parser: "X against Y" / "X vs Y" ----
  // Returns {myTeam, oppTeam} or null. Client-side so we never rely on Gemini to split teams.
  function parseCompoundCmd(text) {
    // "add [all] TEAM1 [players] against TEAM2 [players]"
    let m = text.match(/^add\s+(?:all\s+)?(.+?)\s+(?:players?\s+)?against\s+(.+?)(?:\s+players?)?$/i);
    if (m) return { myTeam: m[1].trim(), oppTeam: m[2].trim() };
    // "add [all] TEAM1 [players] vs/versus TEAM2 [players]"
    m = text.match(/^add\s+(?:all\s+)?(.+?)\s+(?:players?\s+)?(?:vs\.?|versus)\s+(.+?)(?:\s+players?)?$/i);
    if (m) return { myTeam: m[1].trim(), oppTeam: m[2].trim() };
    // "TEAM1 vs/versus TEAM2" (short form without "add" — guard against question sentences)
    if (!text.includes('?') && text.length < 50) {
      m = text.match(/^(.+?)\s+(?:vs\.?|versus)\s+(.+?)$/i);
      if (m) return { myTeam: m[1].trim(), oppTeam: m[2].trim() };
    }
    return null;
  }

  async function send(){
    const text=input.value.trim(); if(!text) return; input.value='';

    if(pendingAction){
      const yes=/^(yes|yep|yea|yeah|sure|do it|go ahead|proceed|ok|confirm|absolutely|swap|add|remove)/i.test(text);
      const no=/^(no|nah|nope|cancel|never|don't|stop)/i.test(text);
      addMsg('user',text);
      if(yes){ await executeConfirm(true); }
      else if(no){ await executeConfirm(false); }
      else { pendingAction=null; await doSend(text); }
      return;
    }

    // Initialize per-turn orchestration state for dashboard-first enforcement.
    lastUserText = text;
    turnHasDashboardLookup = false;
    turnWebSearchDeferred = false;
    turnHasWebSearch = false;
    turnForcedWebForValuation = false;
    addMsg('user',text);

    // Compound command: "X against Y" / "X vs Y" — handle deterministically, never trust Gemini to split.
    const compound = parseCompoundCmd(text);
    if (compound) {
      const oppResult = addPlayersToOpponent([], compound.oppTeam);
      if (oppResult.error) {
        addMsg('system', `⚠️ Could not find opponent team "<b>${compound.oppTeam}</b>": ${oppResult.error}`);
      } else {
        addMsg('system', `✅ Added <b>${compound.oppTeam}</b> (${oppResult.added} players) to opponent roster.`);
      }
      // Let Gemini handle adding the first team to my roster with the normal confirm dialog
      lastUserText = `Add all ${compound.myTeam} players to my roster`;
      await doSend(lastUserText);
      return;
    }

    await doSend(text);
  }

  async function doSend(text){
    showTyping(); sendBtn.disabled=true;
    try{
      if(await runValuationComparePipeline(text)){
        hideTyping();
      } else {
        const d=await callGemini(text);
        hideTyping();
        await processResp(d);
      }
    }
    catch(err){ hideTyping(); console.error('Scout AI error:',err); addMsg('ai','Error: '+err.message+'<br><br>Check your Cloudflare Worker is running.'); }
    sendBtn.disabled=false;
  }
})();

// --- Class wrapper (organizational) ---
class ChatSystem {
  // The IIFE above runs on load. This class exposes nothing additional
  // but serves as documentation that this file owns the chat system.
}

window.ChatSystem = new ChatSystem();
