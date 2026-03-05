// ============ TEAMS MODULE — Team Hub ============
// Dependencies: data.js (league, allRatingsData, teamRatings, _ratingsReady,
//               loadGamesForTeam, tbGetAllPlayers, showWarn, clearWarn),
//               teambuilder.js (oppRoster, oppRefresh)

// ── DOM refs ──────────────────────────────────────────────────────────────────
var thTeamSearch, thSeasonInput, thLoadBtn;
var thOverviewEl, thThreatsEl, thGameLogEl, thH2HEl;
var thLoadingEl;

function initTeamsDOMRefs() {
  thTeamSearch  = document.getElementById('thTeamSearch');
  thSeasonInput = document.getElementById('thSeason');
  thLoadBtn     = document.getElementById('thLoadBtn');
  thOverviewEl  = document.getElementById('thOverview');
  thThreatsEl   = document.getElementById('thThreats');
  thGameLogEl   = document.getElementById('thGameLog');
  thH2HEl       = document.getElementById('thH2H');
  thLoadingEl   = document.getElementById('thLoading');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _thFmt(v, d) {
  d = d == null ? 1 : d;
  return Number.isFinite(+v) ? (+v).toFixed(d) : '—';
}

function _thGrade(p) {
  if (!Number.isFinite(p)) return 'var(--muted)';
  if (p >= 80) return 'var(--good)';
  if (p >= 55) return 'var(--accent)';
  if (p >= 35) return 'var(--warn)';
  return 'var(--bad)';
}

function _thPctOf(arr, v) {
  if (!arr.length || !Number.isFinite(v)) return null;
  return Math.round(arr.filter(x => x <= v).length / arr.length * 100);
}

function _thLoading(msg) {
  if (thLoadingEl) {
    thLoadingEl.textContent = msg || '';
    thLoadingEl.style.display = msg ? 'block' : 'none';
  }
}

// ── Render: Program Overview ──────────────────────────────────────────────────
function thRenderOverview(teamData, gamesData) {
  if (!thOverviewEl) return;
  if (!teamData) {
    thOverviewEl.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Select a team to view program analysis.</div>';
    return;
  }

  // Derive W-L record from games
  const games = (gamesData && gamesData.games) ? gamesData.games : [];
  let wins = 0, losses = 0, confW = 0, confL = 0;
  games.forEach(g => {
    const hn = (g.homeTeam || '').toLowerCase();
    const an = (g.awayTeam || '').toLowerCase();
    const tn = (teamData.team || '').toLowerCase();
    const isHome = hn === tn;
    const isAway = an === tn;
    if (!isHome && !isAway) return;
    const ts = isHome ? g.homePoints : g.awayPoints;
    const os = isHome ? g.awayPoints : g.homePoints;
    if (ts == null || os == null) return;
    const won = ts > os;
    if (won) wins++; else losses++;
    if (g.conferenceGame) { if (won) confW++; else confL++; }
  });

  const hasRecord = (wins + losses) > 0;
  const recordStr = hasRecord ? `${wins}–${losses}` : '—';
  const confRecord = (confW + confL) > 0 ? `${confW}–${confL} conf` : '';

  const adjOs = allRatingsData.map(x => x.adjO).filter(Number.isFinite).sort((a,b)=>a-b);
  const adjDs = allRatingsData.map(x => x.adjD).filter(Number.isFinite).sort((a,b)=>a-b);
  const oPct  = _thPctOf(adjOs, teamData.adjO);
  const dPct  = teamData.adjD != null ? (100 - _thPctOf(adjDs, teamData.adjD)) : null;
  const emStr = Number.isFinite(teamData.adjEM) ? ((teamData.adjEM >= 0 ? '+' : '') + _thFmt(teamData.adjEM)) : '—';
  const tempoLabel = !Number.isFinite(teamData.adjT) ? '—' : teamData.adjT >= 72 ? 'Fast-paced' : teamData.adjT >= 68 ? 'Medium pace' : 'Slow-paced';

  // Style-of-play assessments
  const styleLines = [];
  if (Number.isFinite(teamData.adjT)) {
    const tP = _thPctOf(allRatingsData.map(x=>x.adjT).filter(Number.isFinite).sort((a,b)=>a-b), teamData.adjT);
    if (tP >= 70) styleLines.push('🏃 Up-tempo offense');
    else if (tP <= 30) styleLines.push('🐢 Deliberate, half-court offense');
    else styleLines.push('⚖️ Balanced pace');
  }
  if (oPct != null) {
    if (oPct >= 75) styleLines.push('🔥 Elite offensive efficiency');
    else if (oPct >= 55) styleLines.push('📈 Above-average offense');
    else if (oPct <= 30) styleLines.push('⬇️ Below-average offense');
  }
  if (dPct != null) {
    if (dPct >= 75) styleLines.push('🛡️ Elite defense');
    else if (dPct >= 55) styleLines.push('💪 Above-average defense');
    else if (dPct <= 30) styleLines.push('⚠️ Below-average defense');
  }

  thOverviewEl.innerHTML = `
    <div class="thHeroCard">
      <div class="thHeroLeft">
        <div class="thTeamName">${teamData.team}</div>
        <div class="thConf">${teamData.conference || '—'} · Season ${thSeasonInput ? thSeasonInput.value : '2026'}</div>
        <div class="thRecord">${recordStr}${confRecord ? ' · ' + confRecord : ''}</div>
        ${styleLines.length ? `<div class="thStyleLines">${styleLines.map(s=>`<span class="thStyleTag">${s}</span>`).join('')}</div>` : ''}
      </div>
      <div class="thRatingsGrid">
        <div class="thRatCard">
          <div class="thRatVal" style="color:${_thGrade(oPct)}">${_thFmt(teamData.adjO)}</div>
          <div class="thRatLabel">Adj. Offense</div>
          <div class="thRatPct">${oPct != null ? oPct+'th %ile' : ''}</div>
        </div>
        <div class="thRatCard">
          <div class="thRatVal" style="color:${_thGrade(dPct)}">${_thFmt(teamData.adjD)}</div>
          <div class="thRatLabel">Adj. Defense</div>
          <div class="thRatPct">${dPct != null ? dPct+'th %ile' : ''}</div>
        </div>
        <div class="thRatCard">
          <div class="thRatVal" style="color:${(teamData.adjEM||0)>=0?'var(--good)':'var(--bad)'}">${emStr}</div>
          <div class="thRatLabel">Net Efficiency</div>
          <div class="thRatPct">SRS: ${_thFmt(teamData.srs)}</div>
        </div>
        <div class="thRatCard">
          <div class="thRatVal">${_thFmt(teamData.adjT)}</div>
          <div class="thRatLabel">Tempo</div>
          <div class="thRatPct">${tempoLabel}</div>
        </div>
        <div class="thRatCard">
          <div class="thRatVal">${_thFmt(teamData.srs)}</div>
          <div class="thRatLabel">SRS</div>
          <div class="thRatPct">SOS: ${_thFmt(teamData.sos)}</div>
        </div>
      </div>
    </div>`;
}

// ── Render: Conference Threats ────────────────────────────────────────────────
function thRenderThreats(teamData, gamesData) {
  if (!thThreatsEl) return;
  if (!teamData) {
    thThreatsEl.innerHTML = '<div class="muted" style="padding:16px;text-align:center">Select a team to view threats.</div>';
    return;
  }

  const conf = teamData.conference;
  const confTeams = allRatingsData
    .filter(t => t.conference === conf)
    .sort((a, b) => (b.adjEM || 0) - (a.adjEM || 0));

  if (!confTeams.length) {
    thThreatsEl.innerHTML = `<div class="muted" style="padding:16px;text-align:center">No conference data for ${conf || 'unknown conference'}.</div>`;
    return;
  }

  // Build H2H record from games data
  const games = (gamesData && gamesData.games) ? gamesData.games : [];
  const h2hMap = {};
  games.forEach(g => {
    const hn = (g.homeTeam || '').toLowerCase();
    const an = (g.awayTeam || '').toLowerCase();
    const tn = (teamData.team || '').toLowerCase();
    const isHome = hn === tn;
    const isAway = an === tn;
    if (!isHome && !isAway) return;
    const opponent = isHome ? (g.awayTeam || '') : (g.homeTeam || '');
    const ts = isHome ? g.homePoints : g.awayPoints;
    const os = isHome ? g.awayPoints : g.homePoints;
    if (ts == null || os == null) return;
    if (!h2hMap[opponent]) h2hMap[opponent] = { w: 0, l: 0 };
    if (ts > os) h2hMap[opponent].w++; else h2hMap[opponent].l++;
  });

  let html = `<div class="thThreatsTable">
    <div class="thThreatHead">
      <span>#</span><span>Team</span><span>AdjEM</span><span>SRS</span><span>H2H</span><span></span>
    </div>`;

  confTeams.forEach((t, i) => {
    const isUs = (t.team || '').toLowerCase() === (teamData.team || '').toLowerCase();
    const rec = Object.entries(h2hMap).find(([k]) => k.toLowerCase() === (t.team||'').toLowerCase());
    const h2h = rec ? rec[1] : null;
    const h2hStr = h2h ? `${h2h.w}–${h2h.l}` : isUs ? '—' : '';
    const h2hColor = h2h ? (h2h.w > h2h.l ? 'var(--good)' : h2h.w < h2h.l ? 'var(--bad)' : 'var(--warn)') : 'var(--muted)';
    const emColor = (t.adjEM||0) >= 0 ? 'var(--good)' : 'var(--bad)';
    const isThreat = !isUs && (t.adjEM || 0) > (teamData.adjEM || 0) && (!h2h || h2h.l >= h2h.w);
    const escapedName = (t.team || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

    html += `<div class="thThreatRow${isUs ? ' thThreatUs' : isThreat ? ' thThreatDanger' : ''}">
      <span class="thThreatRank">${i + 1}</span>
      <span class="thThreatName">
        ${t.team || '—'}
        ${isUs ? '<span class="thYouBadge">you</span>' : ''}
        ${isThreat ? '<span class="thDangerBadge">⚠ threat</span>' : ''}
      </span>
      <span style="color:${emColor};font-weight:700">${(t.adjEM||0)>=0?'+':''}${_thFmt(t.adjEM)}</span>
      <span style="color:var(--muted)">${_thFmt(t.srs)}</span>
      <span style="color:${h2hColor};font-weight:700">${h2hStr}</span>
      <span>${!isUs ? `<button class="secondary thOppBtn" onclick="thLoadOpponent('${escapedName}')" title="Load ${t.team} as opponent">⚔</button>` : ''}</span>
    </div>`;
  });

  html += '</div>';
  thThreatsEl.innerHTML = html;
}

// ── Render: Season Game Log ───────────────────────────────────────────────────
function thRenderGameLog(teamData, gamesData) {
  if (!thGameLogEl) return;
  if (!gamesData || !gamesData.games || !gamesData.games.length) {
    thGameLogEl.innerHTML = '<div class="muted" style="padding:20px;text-align:center">No game log data available yet.</div>';
    return;
  }

  const tn = (teamData ? teamData.team : '').toLowerCase();
  const games = gamesData.games.slice().sort((a, b) =>
    new Date(a.startDate || a.date || 0) - new Date(b.startDate || b.date || 0)
  );

  let w = 0, l = 0;
  let html = `<div class="thGameLogTable">
    <div class="thGameLogHead">
      <span>Date</span><span>Opponent</span><span>H/A</span><span>Result</span><span>Score</span>
    </div>`;

  games.forEach(g => {
    const isHome = (g.homeTeam || '').toLowerCase() === tn;
    const opponent = isHome ? (g.awayTeam || '—') : (g.homeTeam || '—');
    const ts = isHome ? g.homePoints : g.awayPoints;
    const os = isHome ? g.awayPoints : g.homePoints;
    const hasScore = ts != null && os != null;
    const won = hasScore && ts > os;
    if (hasScore) { if (won) w++; else l++; }
    const dateRaw = g.startDate || g.date;
    const dateStr = dateRaw ? new Date(dateRaw).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '—';
    const scoreStr = hasScore ? `${ts}–${os}` : '—';
    const wl = hasScore ? (won ? 'W' : 'L') : '—';
    const wlColor = wl === 'W' ? 'var(--good)' : wl === 'L' ? 'var(--bad)' : 'var(--muted)';
    const ha = isHome ? 'H' : 'A';
    const streak = hasScore ? `(${w}–${l})` : '';

    html += `<div class="thGameRow">
      <span class="thGameDate">${dateStr}</span>
      <span class="thGameOpp">${opponent}</span>
      <span class="thGameHA">${ha}</span>
      <span class="thGameWL" style="color:${wlColor}">${wl} <span class="thGameStreak">${streak}</span></span>
      <span class="thGameScore">${scoreStr}</span>
    </div>`;
  });

  html += `</div>
    <div class="thGameLogFooter">Final record: <b style="color:var(--good)">${w}</b>–<b style="color:var(--bad)">${l}</b></div>`;
  thGameLogEl.innerHTML = html;
}

// ── Render: Head-to-Head Records ──────────────────────────────────────────────
function thRenderH2H(teamData, gamesData) {
  if (!thH2HEl) return;
  if (!gamesData || !gamesData.games || !gamesData.games.length) {
    thH2HEl.innerHTML = '<div class="muted" style="padding:20px;text-align:center">No head-to-head data available yet.</div>';
    return;
  }

  const tn = (teamData ? teamData.team : '').toLowerCase();
  const oppMap = {};

  gamesData.games.forEach(g => {
    const isHome = (g.homeTeam || '').toLowerCase() === tn;
    const isAway = (g.awayTeam || '').toLowerCase() === tn;
    if (!isHome && !isAway) return;
    const opp = isHome ? (g.awayTeam || '') : (g.homeTeam || '');
    const ts  = isHome ? g.homePoints : g.awayPoints;
    const os  = isHome ? g.awayPoints : g.homePoints;
    if (ts == null || os == null) return;
    if (!oppMap[opp]) oppMap[opp] = { w: 0, l: 0, ourPts: [], theirPts: [] };
    if (ts > os) oppMap[opp].w++; else oppMap[opp].l++;
    oppMap[opp].ourPts.push(ts);
    oppMap[opp].theirPts.push(os);
  });

  const opponents = Object.entries(oppMap).sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l));
  if (!opponents.length) {
    thH2HEl.innerHTML = '<div class="muted" style="padding:20px;text-align:center">No head-to-head records found.</div>';
    return;
  }

  const avg = arr => arr.length ? (arr.reduce((s,v)=>s+v,0)/arr.length).toFixed(1) : '—';

  let html = `<div class="thH2HTable">
    <div class="thH2HHead">
      <span>Opponent</span><span>W</span><span>L</span><span>Avg Pts</span><span>Avg Allow</span><span>Margin</span>
    </div>`;

  opponents.forEach(([opp, rec]) => {
    const avgUs   = parseFloat(avg(rec.ourPts));
    const avgThem = parseFloat(avg(rec.theirPts));
    const margin  = Number.isFinite(avgUs) && Number.isFinite(avgThem) ? (avgUs - avgThem).toFixed(1) : '—';
    const marginColor = parseFloat(margin) > 0 ? 'var(--good)' : parseFloat(margin) < 0 ? 'var(--bad)' : 'var(--muted)';
    const wlColor = rec.w > rec.l ? 'var(--good)' : rec.w < rec.l ? 'var(--bad)' : 'var(--warn)';
    const escapedOpp = (opp || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

    html += `<div class="thH2HRow">
      <span class="thH2HOpp">
        ${opp}
        <button class="secondary thOppBtn" onclick="thLoadOpponent('${escapedOpp}')" style="margin-left:6px" title="Load as opponent">⚔</button>
      </span>
      <span style="color:var(--good);font-weight:700">${rec.w}</span>
      <span style="color:var(--bad);font-weight:700">${rec.l}</span>
      <span>${avg(rec.ourPts)}</span>
      <span>${avg(rec.theirPts)}</span>
      <span style="color:${marginColor};font-weight:700">${parseFloat(margin)>0?'+':''}${margin}</span>
    </div>`;
  });

  html += '</div>';
  thH2HEl.innerHTML = html;
}

// ── thLoadOpponent — load a team's players into the opponent slot ─────────────
function thLoadOpponent(teamName) {
  if (typeof tbGetAllPlayers !== 'function') return;
  const all = tbGetAllPlayers(typeof league !== 'undefined' ? league : 'MBB');
  const teamPlayers = all.filter(p => (p.Team || '').toLowerCase() === (teamName || '').toLowerCase());
  if (!teamPlayers.length) {
    if (typeof showWarn === 'function') showWarn('No players found for ' + teamName + '. Make sure the dataset is loaded.');
    return;
  }
  // Bulk push to opponent roster + refresh once
  if (typeof oppRoster !== 'undefined') {
    oppRoster.length = 0;
    teamPlayers.forEach(p => oppRoster.push(p));
  }
  if (typeof oppRefresh === 'function') oppRefresh();
  if (typeof clearWarn === 'function') clearWarn();

  // Navigate to Team Builder → Opponent tab
  const tbNavBtn  = document.querySelector('.pageNavBtn[data-page="pageTeamBuilder"]');
  const oppSubBtn = document.querySelector('.tbSubBtn[data-sub="tbSubOpponent"]');
  if (tbNavBtn)  tbNavBtn.click();
  setTimeout(() => { if (oppSubBtn) oppSubBtn.click(); }, 80);
}

// ── thLoadTeam — main entry point when Load button clicked ───────────────────
async function thLoadTeam(teamName, season) {
  if (!teamName) return;
  _thLoading('Loading team data…');

  const teamKey  = (teamName || '').toLowerCase();
  const teamData = teamRatings[teamKey] || null;

  // Show overview immediately from cached ratings while games load
  thRenderOverview(teamData, null);
  if (thThreatsEl)  thThreatsEl.innerHTML = '<div class="muted" style="padding:16px;text-align:center">Loading…</div>';
  if (thGameLogEl)  thGameLogEl.innerHTML = '<div class="muted" style="padding:16px;text-align:center">Fetching game log…</div>';
  if (thH2HEl)      thH2HEl.innerHTML     = '<div class="muted" style="padding:16px;text-align:center">Loading…</div>';

  const gamesData = await loadGamesForTeam(teamName, season || '2026');
  _thLoading('');

  thRenderOverview(teamData, gamesData);
  thRenderThreats(teamData, gamesData);
  thRenderGameLog(teamData, gamesData);
  thRenderH2H(teamData, gamesData);
}

// ── Populate team dropdown ────────────────────────────────────────────────────
function thPopulateTeams() {
  if (!thTeamSearch) return;
  const teams = [...new Set(
    (typeof tbGetAllPlayers === 'function' ? tbGetAllPlayers() : [])
      .map(p => p.Team || '')
      .filter(Boolean)
  )].sort();
  thTeamSearch.innerHTML = '<option value="">— Select a team —</option>' +
    teams.map(t => `<option value="${t.replace(/"/g,'&quot;')}">${t}</option>`).join('');
}

// ── Refresh dropdown when player data changes (called from app.js) ────────────
function thRefreshTeamList() {
  thPopulateTeams();
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initTeamsPage() {
  initTeamsDOMRefs();
  thPopulateTeams();

  if (thLoadBtn) {
    thLoadBtn.addEventListener('click', () => {
      const team   = thTeamSearch ? thTeamSearch.value   : '';
      const season = thSeasonInput ? thSeasonInput.value : '2026';
      if (!team) { if (typeof showWarn === 'function') showWarn('Please select a team first.'); return; }
      thLoadTeam(team, season);
    });
  }

  // Allow pressing Enter in team search select (or hitting Enter in season input)
  if (thSeasonInput) {
    thSeasonInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && thLoadBtn) thLoadBtn.click();
    });
  }
}

// ── Class wrapper ─────────────────────────────────────────────────────────────
class TeamHub {
  init()                        { return initTeamsPage(); }
  refreshTeamList()             { return thRefreshTeamList(); }
  loadTeam(name, season)        { return thLoadTeam(name, season); }
  loadOpponent(teamName)        { return thLoadOpponent(teamName); }
}

window.TeamHub = new TeamHub();
