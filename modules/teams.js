// ============ TEAMS MODULE — Team Hub ============
// Dependencies: data.js (league, allRatingsData, teamRatings, _ratingsReady,
//               loadGamesForTeam, tbGetAllPlayers, showWarn, clearWarn),
//               teambuilder.js (oppRoster, oppRefresh)

// ── DOM refs ──────────────────────────────────────────────────────────────────
var thTeamSearch, thSeasonInput, thLoadBtn;
var thOverviewEl, thThreatsEl, thGameLogEl, thH2HEl;
var thLoadingEl;

// ── State (persisted across renders for compare feature) ──────────────────────
var thCurrentTeam   = '';
var thCurrentSeason = '2026';
var thMatchupMode   = 'season'; // 'season' | 'history'
var _thCurrentStats = null;

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
  const adjEM = Number.isFinite(teamData.adjEM) ? teamData.adjEM : null;
  const emStr = adjEM != null ? ((adjEM >= 0 ? '+' : '') + _thFmt(adjEM)) : '—';
  const rankStr  = teamData.rank ? '#' + teamData.rank : '—';
  const rankColor = teamData.rank ? (teamData.rank <= 10 ? 'var(--good)' : teamData.rank <= 25 ? 'var(--accent)' : teamData.rank <= 50 ? 'var(--warn)' : 'var(--muted)') : 'var(--muted)';

  // Style-of-play assessments (only O/D based — tempo unavailable)
  const styleLines = [];
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
  if (adjEM != null) {
    if (adjEM >= 20) styleLines.push('⭐ Elite net efficiency');
    else if (adjEM <= -10) styleLines.push('📉 Negative net efficiency');
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
          <div class="thRatVal" style="color:${adjEM!=null&&adjEM>=0?'var(--good)':adjEM!=null?'var(--bad)':'var(--muted)'}">${emStr}</div>
          <div class="thRatLabel">Net Efficiency</div>
          <div class="thRatPct">net rating</div>
        </div>
        <div class="thRatCard">
          <div class="thRatVal" style="color:${rankColor};font-size:20px">${rankStr}</div>
          <div class="thRatLabel">Natl Rank</div>
          <div class="thRatPct">by net efficiency</div>
        </div>
        <div class="thRatCard">
          <div class="thRatVal">${_thFmt(teamData.srs)}</div>
          <div class="thRatLabel">SRS Rating</div>
          <div class="thRatPct">simple rating</div>
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
  // Filter to the same season as teamData to avoid showing duplicate historical rows
  const targetSeason = teamData.season || +(thSeasonInput ? thSeasonInput.value : '2026');
  const confTeams = allRatingsData
    .filter(t => t.conference === conf && +t.season === +targetSeason)
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

// ── thRenderDNA — court heatmap + scoring profile + four factors + insights ────
function thRenderDNA(teamData, statsData, shootingData) {
  const el = document.getElementById('thDNA');
  if (!el) return;
  if (!statsData && !shootingData) {
    el.innerHTML = '<div class="muted" style="padding:24px;text-align:center">No team stats available for this team/season.</div>';
    return;
  }
  const s  = statsData;
  const ts = s ? s.teamStats    : null;
  const os = s ? s.opponentStats : null;
  const g  = (s && s.games) || 1;

  const ppg       = ts ? +(ts.points.total / g).toFixed(1)                                    : null;
  const oppg      = os ? +(os.points.total / g).toFixed(1)                                    : null;
  const paintPct  = ts ? Math.round(ts.points.inPaint / ts.points.total * 100)                : null;
  const fbPct     = ts ? Math.round(ts.points.fastBreak / ts.points.total * 100)              : null;
  const topPct    = ts ? Math.round(ts.points.offTurnovers / ts.points.total * 100)           : null;
  const threeTend = ts ? Math.round(ts.threePointFieldGoals.attempted / ts.fieldGoals.attempted * 100) : null;
  const astRate   = ts ? Math.round(ts.assists / ts.fieldGoals.made * 100)                    : null;
  const pace      = s  ? s.pace : null;

  const ff  = ts ? ts.fourFactors : null;
  const ofs = os ? os.fourFactors : null;
  const offEfg  = ff  ? ff.effectiveFieldGoalPct          : null;
  const offTov  = ff  ? Math.round(ff.turnoverRatio * 100) : null;
  const offOreb = ff  ? ff.offensiveReboundPct             : null;
  const offFtr  = ff  ? ff.freeThrowRate                   : null;
  const defEfg  = ofs ? ofs.effectiveFieldGoalPct          : null;
  const defTov  = ofs ? Math.round(ofs.turnoverRatio * 100) : null;
  const defOreb = ofs ? ofs.offensiveReboundPct             : null;
  const defFtr  = ofs ? ofs.freeThrowRate                   : null;

  // Auto-generate insights from the numbers
  const insights = [];
  if (offEfg != null) {
    if (offEfg >= 56) insights.push({ type: 'strength', text: `Elite shooting — eFG% of ${offEfg}% is well above the national avg (~50%). Creating high-quality looks consistently.` });
    else if (offEfg >= 52) insights.push({ type: 'strength', text: `Good shooting efficiency — eFG% of ${offEfg}% is above the national average.` });
    else if (offEfg <= 46) insights.push({ type: 'weakness', text: `Shooting struggles — eFG% of ${offEfg}% is below average. Needs better shot quality or improved shooting.` });
  }
  if (defEfg != null) {
    if (defEfg <= 44) insights.push({ type: 'strength', text: `Elite perimeter defense — holding opponents to just ${defEfg}% eFG. Significantly disrupts opponent offense.` });
    else if (defEfg <= 48) insights.push({ type: 'strength', text: `Good defensive shooting suppression — opponents at ${defEfg}% eFG.` });
    else if (defEfg >= 54) insights.push({ type: 'weakness', text: `Defensive concern — opponents shoot ${defEfg}% eFG. Giving up too many quality looks.` });
  }
  if (offTov != null) {
    if (offTov <= 13) insights.push({ type: 'strength', text: `Exceptional ball security — only ${offTov}% turnover rate. Rarely gives opponents easy transition buckets.` });
    else if (offTov >= 20) insights.push({ type: 'weakness', text: `Turnover issue — ${offTov}% TO rate hurts offensive possessions and creates transition opportunities for opponents.` });
  }
  if (defTov != null) {
    if (defTov >= 22) insights.push({ type: 'strength', text: `Disruptive defense — forcing ${defTov}% opponent turnover rate. Creates easy transition opportunities.` });
    else if (defTov <= 14) insights.push({ type: 'weakness', text: `Lacks defensive pressure — only forcing ${defTov}% opponent TO rate. Opponents handle the ball too freely.` });
  }
  if (offOreb != null) {
    if (offOreb >= 32) insights.push({ type: 'strength', text: `Dominant on the offensive glass — ${offOreb}% OReb rate means lots of extra possessions.` });
    else if (offOreb <= 22) insights.push({ type: 'weakness', text: `Weak offensive rebounding — only ${offOreb}% OReb rate. Rarely converts misses into second chances.` });
  }
  if (defOreb != null) {
    if (defOreb <= 24) insights.push({ type: 'strength', text: `Excellent defensive rebounding — holding opponents to ${defOreb}% OReb rate. Boxes out well.` });
    else if (defOreb >= 35) insights.push({ type: 'weakness', text: `Gets out-rebounded — opponents grab ${defOreb}% of their own misses, generating second-chance points.` });
  }
  if (paintPct != null) {
    if (paintPct >= 48) insights.push({ type: 'style', text: `Inside-out attack — ${paintPct}% of points in the paint. Forces opponents to commit to interior defense.` });
    else if (paintPct <= 34) insights.push({ type: 'style', text: `Perimeter-oriented offense — only ${paintPct}% of points come from the paint. Very jump-shot dependent.` });
  }
  if (threeTend != null) {
    if (threeTend >= 48) insights.push({ type: 'style', text: `Heavy three-point volume — ${threeTend}% of FGA are 3s. Live-or-die by the three style.` });
    else if (threeTend <= 26) insights.push({ type: 'style', text: `Post and mid-range focus — only ${threeTend}% of shots are 3-pointers.` });
  }
  if (fbPct != null && fbPct >= 15) insights.push({ type: 'style', text: `Transition threat — ${fbPct}% of points come in transition. Loves to push pace and score in the open court.` });
  if (pace != null) {
    if (pace >= 72) insights.push({ type: 'style', text: `Up-tempo identity — ${pace} possessions/game. Creates havoc through volume and pace.` });
    else if (pace <= 63) insights.push({ type: 'style', text: `Deliberate half-court team — only ${pace} possessions/game. Controls tempo and grinds out wins.` });
  }

  // Four factors rows: label | our offense val | what opp does vs us (defense)
  function ffRow(label, offVal, defVal, offIsGood, defIsGood, offTip, defTip) {
    const fmtV = v => v != null ? (+v).toFixed(1) + '%' : '—';
    const oc = offIsGood == null ? 'var(--muted)' : offIsGood ? 'var(--good)' : 'var(--bad)';
    const dc = defIsGood == null ? 'var(--muted)' : defIsGood ? 'var(--good)' : 'var(--bad)';
    return `<div class="thFFRow">
      <div class="thFFVal" style="color:${oc}" title="${offTip||''}">${fmtV(offVal)}</div>
      <div class="thFFLabel">${label}</div>
      <div class="thFFVal thFFVal--def" style="color:${dc}" title="${defTip||''}">${fmtV(defVal)}</div>
    </div>`;
  }
  function grade(v, goodThresh, badThresh) {
    if (v == null) return null;
    if (v >= goodThresh) return true;
    if (v <= badThresh)  return false;
    return null;
  }

  const ff4Html = ts ? `
    <div class="thFFCard">
      <div class="thFFHead">
        <div class="thFFHeadCol"><div class="thFFHeadTitle" style="color:var(--accent)">Our Offense</div><div class="thFFHeadSub">what we do</div></div>
        <div class="thFFTitle">Four Factors</div>
        <div class="thFFHeadCol"><div class="thFFHeadTitle" style="color:var(--muted)">Defense</div><div class="thFFHeadSub">what opp does vs us</div></div>
      </div>
      <div class="thFFBody">
        ${ffRow('Eff. FG%',  offEfg,  defEfg,  grade(offEfg,54,46),                       defEfg!=null?(defEfg<=48?true:defEfg>=54?false:null):null, 'Our shooting efficiency (higher=better)', 'Opp eFG% against us (lower=better defense)')}
        ${ffRow('TO Rate',   offTov,  defTov,  offTov!=null?(offTov<=15?true:offTov>=21?false:null):null, defTov!=null?(defTov>=21?true:defTov<=14?false:null):null, 'Our turnover rate (lower=better)', 'Opp TO rate we force (higher=better)')}
        ${ffRow('Off. Reb%', offOreb, defOreb, grade(offOreb,30,22),                       defOreb!=null?(defOreb<=26?true:defOreb>=35?false:null):null, 'Our offensive rebound rate (higher=better)', 'Opp OReb% we allow (lower=better)')}
        ${ffRow('FT Rate',   offFtr,  defFtr,  grade(offFtr,35,22),                        defFtr!=null?(defFtr<=20?true:defFtr>=35?false:null):null,   'Our FT attempt rate (higher=better)', 'Opp FT rate we give up (lower=better)')}
      </div>
      <div class="thFFNote">eFG% = (FGM + 0.5×3PM) / FGA &nbsp;|&nbsp; TO Rate = TO / Poss &nbsp;|&nbsp; FT Rate = FTA / FGA</div>
    </div>` : '';

  const profHtml = [
    ppg       != null ? `<div class="thProfRow"><span class="thProfLabel">Points / game</span><span class="thProfVal">${ppg}</span></div>` : '',
    oppg      != null ? `<div class="thProfRow"><span class="thProfLabel">Opp Pts / game</span><span class="thProfVal">${oppg}</span></div>` : '',
    pace      != null ? `<div class="thProfRow"><span class="thProfLabel" title="Estimated possessions per 40 min game">Pace</span><span class="thProfVal">${pace} poss/g</span></div>` : '',
    paintPct  != null ? `<div class="thProfRow"><span class="thProfLabel">Paint scoring</span><span class="thProfVal">${paintPct}% of pts</span></div>` : '',
    fbPct     != null ? `<div class="thProfRow"><span class="thProfLabel">Fast break pts</span><span class="thProfVal">${fbPct}% of pts</span></div>` : '',
    topPct    != null ? `<div class="thProfRow"><span class="thProfLabel">Pts off TOs</span><span class="thProfVal">${topPct}% of pts</span></div>` : '',
    threeTend != null ? `<div class="thProfRow"><span class="thProfLabel" title="3-point attempts as % of all FGA">3PT tendency</span><span class="thProfVal">${threeTend}% of FGA</span></div>` : '',
    astRate   != null ? `<div class="thProfRow"><span class="thProfLabel" title="Assists per made field goal">Assist rate</span><span class="thProfVal">${astRate}% of FGM</span></div>` : '',
    ts && ts.trueShooting != null ? `<div class="thProfRow"><span class="thProfLabel" title="Points per shot attempt including FTs. Best overall shooting efficiency measure.">True Shooting%</span><span class="thProfVal">${ts.trueShooting}%</span></div>` : '',
  ].filter(Boolean).join('');

  const insightsHtml = insights.length
    ? insights.map(i => `<div class="thInsight thInsight--${i.type}"><span class="thInsIcon">${i.type==='strength'?'✅':i.type==='weakness'?'⚠️':'💡'}</span><span>${i.text}</span></div>`).join('')
    : '<div class="muted" style="padding:8px 0">Load team to generate analysis.</div>';

  const heatmapHtml = shootingData
    ? _buildCourtHeatmap(shootingData)
    : '<div class="muted" style="padding:24px;text-align:center;font-size:12px">Shooting zone data unavailable</div>';

  el.innerHTML = `
    <div class="thDNAGrid">
      <div class="thDNALeft">
        <div class="thDNASectionLabel">🏀 Team Shooting Zones</div>
        ${heatmapHtml}
      </div>
      <div class="thDNARight">
        <div class="thDNASectionLabel">📊 Scoring Profile</div>
        <div class="thProfCard">${profHtml || '<div class="muted">Stats unavailable</div>'}</div>
        <div style="height:16px"></div>
        ${ff4Html}
      </div>
    </div>
    <div class="thDNAInsights">
      <div class="thDNASectionLabel">🔍 Strengths &amp; Weaknesses Analysis</div>
      <div class="thInsightsGrid">${insightsHtml}</div>
    </div>`;
}

// ── thRenderCompare — side-by-side team comparison ────────────────────────────
function thRenderCompare(teamA, ratA, statsA, teamB, ratB, statsB) {
  const el = document.getElementById('thCompare');
  if (!el) return;
  if (!teamA || !teamB) {
    el.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Load a primary team first, then pick a team to compare.</div>';
    return;
  }
  const tsA = statsA ? statsA.teamStats     : null;
  const osA = statsA ? statsA.opponentStats : null;
  const tsB = statsB ? statsB.teamStats     : null;
  const osB = statsB ? statsB.opponentStats : null;
  const ffA = tsA ? tsA.fourFactors : null;
  const ffB = tsB ? tsB.fourFactors : null;
  const gA  = (statsA && statsA.games) || 1;
  const gB  = (statsB && statsB.games) || 1;

  function cmpRow(label, vA, vB, higherBetter, fmtFn) {
    const a = parseFloat(vA), b = parseFloat(vB);
    const fmt = fmtFn || (v => Number.isFinite(+v) ? (+v).toFixed(1) : '—');
    const aWins = Number.isFinite(a) && Number.isFinite(b) && (higherBetter ? a > b : a < b);
    const bWins = Number.isFinite(a) && Number.isFinite(b) && (higherBetter ? b > a : b < a);
    const aColor = aWins ? 'color:var(--good)' : bWins ? 'color:var(--bad)' : '';
    const bColor = bWins ? 'color:var(--good)' : aWins ? 'color:var(--bad)' : '';
    return `<div class="thCmpRow">
      <div class="thCmpVal${aWins?' thCmpWin':''}" style="${aColor}">${Number.isFinite(a)?fmt(a):'—'}</div>
      <div class="thCmpLabel">${label}</div>
      <div class="thCmpVal${bWins?' thCmpWin':''}" style="${bColor}">${Number.isFinite(b)?fmt(b):'—'}</div>
    </div>`;
  }

  // Edge analysis
  const edges = [];
  function checkEdge(name, vA, vB, higherBetter) {
    const a = parseFloat(vA), b = parseFloat(vB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) < 1.5) return;
    const aWins = higherBetter ? a > b : a < b;
    edges.push({ winner: aWins ? teamA : teamB, name, vW: (aWins?a:b).toFixed(1), vL: (aWins?b:a).toFixed(1), higher: higherBetter });
  }
  if (ratA && ratB) {
    checkEdge('Net Efficiency (adjEM)', ratA.adjEM, ratB.adjEM, true);
    checkEdge('Adjusted Offense',       ratA.adjO,  ratB.adjO,  true);
    checkEdge('Adjusted Defense',       ratA.adjD,  ratB.adjD,  false);
  }
  if (ffA && ffB) {
    checkEdge('effective FG%',        ffA.effectiveFieldGoalPct, ffB.effectiveFieldGoalPct, true);
    checkEdge('turnover rate',        ffA.turnoverRatio*100,      ffB.turnoverRatio*100,      false);
    checkEdge('offensive rebounding', ffA.offensiveReboundPct,   ffB.offensiveReboundPct,   true);
    checkEdge('free-throw rate',      ffA.freeThrowRate,          ffB.freeThrowRate,          true);
  }
  if (tsA && tsB) {
    checkEdge('true shooting%', tsA.trueShooting,                  tsB.trueShooting,                  true);
    checkEdge('3-point%',       tsA.threePointFieldGoals.pct,      tsB.threePointFieldGoals.pct,      true);
    checkEdge('scoring',        tsA.points.total/gA,               tsB.points.total/gB,               true);
  }

  const edgeHtml = edges.length
    ? edges.slice(0, 6).map(e =>
        `<div class="thEdgeItem"><b style="color:var(--accent)">${e.winner}</b> has a clear edge in <b>${e.name}</b> · ${e.vW} vs ${e.vL}</div>`
      ).join('')
    : '<div class="muted" style="padding:8px 0">Teams are closely matched — no standout advantages found.</div>';

  const rankA = ratA && ratA.rank ? '#' + ratA.rank : '—';
  const rankB = ratB && ratB.rank ? '#' + ratB.rank : '—';

  el.innerHTML = `
    <div class="thCmpHeader">
      <div class="thCmpTeamBlock"><div class="thCmpTeamName" style="color:var(--accent)">${teamA}</div><div class="thCmpRank">${rankA}</div></div>
      <div class="thCmpVs">VS</div>
      <div class="thCmpTeamBlock"><div class="thCmpTeamName" style="color:var(--warn)">${teamB}</div><div class="thCmpRank">${rankB}</div></div>
    </div>
    <div class="thCmpGrid">
      <div class="thCmpSection">
        <div class="thCmpSectionLabel">Efficiency Ratings</div>
        <div class="thCmpColHeads"><span style="color:var(--accent)">${teamA}</span><span></span><span style="color:var(--warn)">${teamB}</span></div>
        ${cmpRow('Adj. Offense',   ratA&&ratA.adjO,  ratB&&ratB.adjO,  true)}
        ${cmpRow('Adj. Defense',   ratA&&ratA.adjD,  ratB&&ratB.adjD,  false, v=>(+v).toFixed(1)+'↓')}
        ${cmpRow('Net Efficiency', ratA&&ratA.adjEM, ratB&&ratB.adjEM, true)}
        ${cmpRow('Natl Rank',      ratA&&ratA.rank,  ratB&&ratB.rank,  false, v=>'#'+Math.round(+v))}
        ${cmpRow('SRS',            ratA&&ratA.srs,   ratB&&ratB.srs,   true)}
      </div>
      ${(ffA || ffB) ? `<div class="thCmpSection">
        <div class="thCmpSectionLabel">Four Factors (Offense)</div>
        <div class="thCmpColHeads"><span style="color:var(--accent)">${teamA}</span><span></span><span style="color:var(--warn)">${teamB}</span></div>
        ${cmpRow('Eff. FG%',  ffA&&ffA.effectiveFieldGoalPct,  ffB&&ffB.effectiveFieldGoalPct,  true,  v=>(+v).toFixed(1)+'%')}
        ${cmpRow('TO Rate',   ffA&&(ffA.turnoverRatio*100),     ffB&&(ffB.turnoverRatio*100),    false, v=>(+v).toFixed(1)+'%')}
        ${cmpRow('OReb%',     ffA&&ffA.offensiveReboundPct,     ffB&&ffB.offensiveReboundPct,    true,  v=>(+v).toFixed(1)+'%')}
        ${cmpRow('FT Rate',   ffA&&ffA.freeThrowRate,           ffB&&ffB.freeThrowRate,          true,  v=>(+v).toFixed(1)+'%')}
      </div>` : ''}
      ${(tsA || tsB) ? `<div class="thCmpSection">
        <div class="thCmpSectionLabel">Scoring Profile</div>
        <div class="thCmpColHeads"><span style="color:var(--accent)">${teamA}</span><span></span><span style="color:var(--warn)">${teamB}</span></div>
        ${cmpRow('Pts / game',   tsA&&(tsA.points.total/gA),            tsB&&(tsB.points.total/gB),            true)}
        ${cmpRow('True Shoot%', tsA&&tsA.trueShooting,                  tsB&&tsB.trueShooting,                  true,  v=>(+v).toFixed(1)+'%')}
        ${cmpRow('3P%',          tsA&&tsA.threePointFieldGoals.pct,     tsB&&tsB.threePointFieldGoals.pct,     true,  v=>(+v).toFixed(1)+'%')}
        ${cmpRow('Pace',         statsA&&statsA.pace,                   statsB&&statsB.pace,                   true,  v=>(+v).toFixed(1))}
        ${cmpRow('Opp Pts/g',   osA&&(osA.points.total/gA),            osB&&(osB.points.total/gB),            false)}
      </div>` : ''}
    </div>
    <div class="thEdgeSection">
      <div class="thDNASectionLabel">🏆 Edge Analysis</div>
      <div class="thEdgeList">${edgeHtml}</div>
    </div>`;
}

// ── thLoadCompare — load second team stats and render comparison ──────────────
async function thLoadCompare() {
  const compareTeamEl = document.getElementById('thCompareTeam');
  const compareTeam   = compareTeamEl ? compareTeamEl.value : '';
  if (!compareTeam) { if (typeof showWarn === 'function') showWarn('Please select a team to compare against.'); return; }
  if (!thCurrentTeam)  { if (typeof showWarn === 'function') showWarn('Please load a primary team first.'); return; }
  const elCmp = document.getElementById('thCompare');
  const elMxp = document.getElementById('thMatchup');
  if (elCmp) elCmp.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Loading comparison…</div>';
  if (elMxp) elMxp.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Loading matchup data…</div>';
  const [statsB] = await Promise.all([
    loadTeamStats(compareTeam, thCurrentSeason),
  ]);
  const ratA = teamRatings[(thCurrentTeam||'').toLowerCase()] || null;
  const ratB = teamRatings[(compareTeam||'').toLowerCase()] || null;
  thRenderCompare(thCurrentTeam, ratA, _thCurrentStats, compareTeam, ratB, statsB);
  // Also trigger the matchup shot chart
  await thLoadMatchup(compareTeam);
}

// ── _thShotToSVG — transform full-court coordinates to SVG half-court ─────────
// Full court origin: x=0–940, y=0–500. Left basket (75,250), right basket (875,250).
// SVG half court: viewBox 0 0 400 455. Basket at (200, 415).
function _thShotToSVG(shot, attacksLeft) {
  const dx = attacksLeft ? (shot.x - 75) : (875 - shot.x);  // depth from basket
  const dy = shot.y - 250;                                    // offset from lane center
  return {
    x: Math.round(200 + dy * 0.76),
    y: Math.round(415 - dx * 1.025),
  };
}

// ── _th_buildShotChartSVG — SVG court with dots for made/missed shots ─────────
function _escAttr(s) { return (s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }
function _th_buildShotChartSVG(shots, teamName, color) {
  // Detect which basket this team attacks (avg x of rim shots)
  const rimShots = shots.filter(s => s.range === 'rim');
  const avgX = rimShots.length
    ? rimShots.reduce((s, p) => s + p.x, 0) / rimShots.length
    : 470;
  const attacksLeft = avgX < 470;

  const W = 400, H = 455;
  const tW = 'rgba(255,255,255,0.35)';
  const tD = 'rgba(255,255,255,0.20)';
  const bX = 200, bY = 415, pL = 148, pR = 252, pT = 265, ftY = 265, ftR = 52;
  const cX1 = 50, cX2 = 350, cY = 325;

  // Range colors
  const rangeColor = { rim: 'rgba(34,197,94,0.9)', jumper: 'rgba(99,179,237,0.9)', three_pointer: 'rgba(251,146,60,0.9)' };
  const rangeMissColor = { rim: 'rgba(34,197,94,0.4)', jumper: 'rgba(99,179,237,0.4)', three_pointer: 'rgba(251,146,60,0.4)' };

  let dots = '';
  shots.forEach(shot => {
    if (shot.range === 'free_throw') return;
    const { x, y } = _thShotToSVG(shot, attacksLeft);
    if (x < 0 || x > W || y < -20 || y > H + 20) return; // outside visible area
    const c  = shot.made ? (rangeColor[shot.range] || 'rgba(200,200,200,0.8)') : (rangeMissColor[shot.range] || 'rgba(200,200,200,0.35)');
    const da = `class="shot-dot" data-player="${_escAttr(shot.shooter)}" data-zone="${shot.range}" data-made="${shot.made?'1':'0'}" data-period="${shot.period||''}" data-clock="${_escAttr(shot.clock||'')}"`;
    if (shot.made) {
      dots += `<g ${da}>`
             + `<circle cx="${x}" cy="${y}" r="7" fill="rgba(0,0,0,0)" stroke="none" pointer-events="all"/>`
             + `<circle cx="${x}" cy="${y}" r="4.5" fill="${c}" stroke="rgba(0,0,0,0.4)" stroke-width="0.8"/>`
             + `</g>`;
    } else {
      const d  = 4;
      dots += `<g ${da}>`
             + `<rect x="${x-8}" y="${y-8}" width="16" height="16" fill="rgba(0,0,0,0)" stroke="none" pointer-events="all"/>`
             + `<line x1="${x-d}" y1="${y-d}" x2="${x+d}" y2="${y+d}" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`
             + `<line x1="${x+d}" y1="${y-d}" x2="${x-d}" y2="${y+d}" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`
             + `</g>`;
    }
  });

  // Build zone stats for labels
  const zoneStats = {};
  shots.forEach(s => {
    if (s.range === 'free_throw') return;
    if (!zoneStats[s.range]) zoneStats[s.range] = { made: 0, att: 0 };
    zoneStats[s.range].att++;
    if (s.made) zoneStats[s.range].made++;
  });
  const totalFGA = Object.values(zoneStats).reduce((s, z) => s + z.att, 0) || 1;

  const zoneLbl = (range, cx, cy) => {
    const z = zoneStats[range];
    if (!z || z.att === 0) return '';
    const pct = Math.round(z.made / z.att * 100);
    const vol = Math.round(z.att / totalFGA * 100);
    return `<text x="${cx}" y="${cy}" text-anchor="middle" font-family="inherit" font-size="11" font-weight="700" fill="${rangeColor[range]||'#fff'}">${pct}% <tspan font-size="8.5" fill="${tD}" font-weight="400">${z.made}/${z.att} · ${vol}%</tspan></text>`;
  };

  const ftZ = zoneStats['free_throw'];
  const ftStats = shots.filter(s => s.range === 'free_throw');
  const ftMade = ftStats.filter(s => s.made).length;
  const ftAtt  = ftStats.length;

  return `<div class="thShotWrap">
    <div class="thShotTitle" style="color:${color}">${teamName}</div>
    <div class="thShotFilterHint">Click a make (●) or miss (✕) to filter · click court to reset</div>
    <svg class="shot-chart-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;max-width:340px;display:block;margin:0 auto;border-radius:10px;cursor:pointer">
      <rect width="${W}" height="${H}" fill="#080f1e"/>
      <rect x="10" y="10" width="380" height="430" rx="3" fill="#0d1b32"/>
      <rect x="10" y="10" width="380" height="430" rx="3" fill="none" stroke="${tW}" stroke-width="1.5"/>
      <rect x="${pL}" y="${pT}" width="${pR-pL}" height="${440-pT}" fill="none" stroke="${tW}" stroke-width="1.5"/>
      <path d="M ${pL} ${ftY} A ${ftR} ${ftR} 0 0 0 ${pR} ${ftY}" fill="none" stroke="${tW}" stroke-width="1.5" stroke-dasharray="4 4"/>
      <path d="M ${pL} ${ftY} A ${ftR} ${ftR} 0 0 1 ${pR} ${ftY}" fill="none" stroke="${tW}" stroke-width="1.5"/>
      <circle cx="${bX}" cy="${bY}" r="28" fill="none" stroke="${tW}" stroke-width="1.5"/>
      <line x1="${cX1}" y1="440" x2="${cX1}" y2="${cY}" stroke="${tW}" stroke-width="1.5"/>
      <line x1="${cX2}" y1="440" x2="${cX2}" y2="${cY}" stroke="${tW}" stroke-width="1.5"/>
      <path d="M ${cX1} ${cY} A 187 187 0 0 0 ${cX2} ${cY}" fill="none" stroke="${tW}" stroke-width="1.5"/>
      <line x1="${bX-20}" y1="${bY-28}" x2="${bX+20}" y2="${bY-28}" stroke="rgba(255,175,40,0.85)" stroke-width="2.5"/>
      <circle cx="${bX}" cy="${bY}" r="12" fill="none" stroke="rgba(255,175,40,0.85)" stroke-width="2.5"/>
      ${dots}
      ${zoneLbl('three_pointer', 200, 115)}
      ${zoneLbl('jumper', 110, 300)}
      ${zoneLbl('rim', 200, 395)}
    </svg>
    <div class="thShotStats">
      <span class="thShotStat" style="color:rgba(34,197,94,0.9)">● Rim ${zoneStats.rim ? Math.round(zoneStats.rim.made/zoneStats.rim.att*100)+'%' : '—'}</span>
      <span class="thShotStat" style="color:rgba(99,179,237,0.9)">● Mid ${zoneStats.jumper ? Math.round(zoneStats.jumper.made/zoneStats.jumper.att*100)+'%' : '—'}</span>
      <span class="thShotStat" style="color:rgba(251,146,60,0.9)">● 3PT ${zoneStats.three_pointer ? Math.round(zoneStats.three_pointer.made/zoneStats.three_pointer.att*100)+'%' : '—'}</span>
      ${ftAtt > 0 ? `<span class="thShotStat" style="color:rgba(200,180,255,0.9)">FT ${Math.round(ftMade/ftAtt*100)}%</span>` : ''}
    </div>
  </div>`;
}

// ── thInitShotTooltips — hover tooltip for shot chart dots ───────────────────
function thInitShotTooltips(containerId) {
  const container = document.getElementById(containerId);
  const tooltip   = document.getElementById('pShotTooltip');
  if (!container || !tooltip) return;
  const zl = { rim: 'At Rim', jumper: 'Mid-Range', three_pointer: '3-Pointer', free_throw: 'Free Throw' };

  container.addEventListener('mouseover', function(e) {
    const dot = e.target.closest && e.target.closest('.shot-dot');
    if (!dot) { tooltip.style.display = 'none'; return; }
    const pl  = dot.getAttribute('data-player') || 'Unknown';
    const zn  = zl[dot.getAttribute('data-zone')] || (dot.getAttribute('data-zone') || '');
    const mk  = dot.getAttribute('data-made') === '1';
    const per = dot.getAttribute('data-period');
    const clk = dot.getAttribute('data-clock');
    tooltip.innerHTML =
      `<div style="font-size:12px;font-weight:700;color:#e2e8f0">${pl}</div>` +
      `<div style="font-size:11px;margin-top:3px;color:${mk?'rgba(34,197,94,.9)':'rgba(239,68,68,.85)'}">${mk?'✓ Made':'✗ Missed'} · ${zn}</div>` +
      ((per || clk) ? `<div style="font-size:10px;color:rgba(150,170,200,.65);margin-top:2px">Period ${per||'—'} · ${clk||''}</div>` : '');
    tooltip.style.display = 'block';
  });
  container.addEventListener('mousemove', function(e) {
    const dot = e.target.closest && e.target.closest('.shot-dot');
    if (!dot) { tooltip.style.display = 'none'; return; }
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top  = (e.clientY - 44)  + 'px';
  });
  container.addEventListener('mouseleave', function() {
    tooltip.style.display = 'none';
  });
}

// ── thInitShotFilter — click makes/misses to dim the other group ─────────────
function thInitShotFilter(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('svg.shot-chart-svg').forEach(function(svgEl) {
    svgEl.addEventListener('click', function(e) {
      const dot = e.target.closest && e.target.closest('.shot-dot');
      if (!dot) {
        svgEl.removeAttribute('data-filter');
        return;
      }
      const want = dot.getAttribute('data-made') === '1' ? 'makes' : 'misses';
      if (svgEl.getAttribute('data-filter') === want) svgEl.removeAttribute('data-filter');
      else svgEl.setAttribute('data-filter', want);
    });
  });
}

// ── thInitShotChart — init both tooltip + filter for a container ─────────────
function thInitShotChart(containerId) {
  thInitShotTooltips(containerId);
  thInitShotFilter(containerId);
}

// ── thRenderMatchup — shot chart + zone breakdown for head-to-head games ──────
function thRenderMatchup(teamA, teamB, allShots, gamesPlayed, boxScores, mode) {
  mode = mode || 'season';
  const el = document.getElementById('thMatchup');
  if (!el) return;
  if (!teamA || !teamB) {
    el.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Load a primary team, then select an opponent and click Compare →</div>';
    return;
  }
  const shotsA = allShots.filter(s => (s.team||'').toLowerCase() === (teamA||'').toLowerCase());
  const shotsB = allShots.filter(s => (s.team||'').toLowerCase() === (teamB||'').toLowerCase());

  if (!allShots.length) {
    el.innerHTML = `<div class="muted" style="padding:24px;text-align:center">No play-by-play data found for ${teamA} vs ${teamB} this season.</div>`;
    return;
  }

  // Per-zone accuracy comparison
  const zones = ['rim', 'jumper', 'three_pointer'];
  const zoneLabel = { rim: 'At Rim', jumper: 'Mid-Range', three_pointer: '3-Pointers' };

  function zoneAgg(shots, range) {
    const z = shots.filter(s => s.range === range);
    const made = z.filter(s => s.made).length;
    const att  = z.length;
    const total = shots.filter(s => s.range !== 'free_throw').length || 1;
    return { made, att, pct: att ? Math.round(made/att*100) : null, vol: Math.round(att/total*100) };
  }

  // Box score aggregates across all matchup games
  let bsApts = 0, bsBpts = 0, bsAg = 0;
  (boxScores || []).forEach(g => {
    bsApts += (g.ptsA || 0);
    bsBpts += (g.ptsB || 0);
    bsAg++;
  });
  const avgPtsA = bsAg ? (bsApts/bsAg).toFixed(1) : null;
  const avgPtsB = bsAg ? (bsBpts/bsAg).toFixed(1) : null;

  // Auto-generate matchup insights
  const insights = [];
  const aRim = zoneAgg(shotsA, 'rim');
  const bRim = zoneAgg(shotsB, 'rim');
  const a3   = zoneAgg(shotsA, 'three_pointer');
  const b3   = zoneAgg(shotsB, 'three_pointer');
  const aMid = zoneAgg(shotsA, 'jumper');
  const bMid = zoneAgg(shotsB, 'jumper');
  const aFT  = shotsA.filter(s => s.range === 'free_throw');
  const bFT  = shotsB.filter(s => s.range === 'free_throw');

  if (bRim.vol >= 40 && bRim.pct != null) {
    if (bRim.pct >= 65) insights.push({ side: teamB, type: 'danger', text: `${teamB} attacks the rim aggressively (${bRim.vol}% of shots) and finishes well at ${bRim.pct}% — they exploit interior defense.` });
    else if (bRim.pct <= 50) insights.push({ side: teamA, type: 'strength', text: `${teamA} holds ${teamB} to only ${bRim.pct}% at the rim despite frequent attempts (${bRim.vol}% vol) — strong interior defense in this matchup.` });
  }
  if (b3.vol >= 40 && b3.pct != null) {
    if (b3.pct >= 38) insights.push({ side: teamB, type: 'danger', text: `${teamB} leans on the 3 (${b3.vol}% of FGA) and shoots it well at ${b3.pct}% in this matchup — close out early.` });
    else if (b3.pct <= 28) insights.push({ side: teamA, type: 'strength', text: `${teamA} forces ${teamB} into a lot of 3s (${b3.vol}% vol) and limits them to ${b3.pct}% — good perimeter pressure.` });
  }
  if (aRim.pct != null && aRim.vol >= 30) {
    if (aRim.pct >= 65) insights.push({ side: teamA, type: 'strength', text: `${teamA} is effective at the rim vs ${teamB} — ${aRim.pct}% on ${aRim.vol}% rim share. Attack the paint.` });
    else if (aRim.pct <= 45) insights.push({ side: teamB, type: 'danger', text: `${teamB} shuts down ${teamA} at the rim in this matchup — only ${aRim.pct}% despite ${aRim.vol}% rim attempts. May need to adjust.` });
  }
  if (a3.pct != null && a3.vol >= 30) {
    if (a3.pct >= 38) insights.push({ side: teamA, type: 'strength', text: `${teamA} shoots the 3 well vs ${teamB} — ${a3.pct}% on ${a3.vol}% three-point share. This is an exploitable matchup advantage.` });
    else if (a3.pct <= 25) insights.push({ side: teamB, type: 'danger', text: `${teamA} struggles from 3 vs ${teamB} — only ${a3.pct}% on heavy volume (${a3.vol}%). ${teamB} limits 3PT effectiveness.` });
  }
  if (aMid.pct != null && bMid.pct != null) {
    if (aMid.pct - bMid.pct >= 15) insights.push({ side: teamA, type: 'strength', text: `${teamA} shoots mid-range shots far better in this matchup (${aMid.pct}% vs ${teamB}'s ${bMid.pct}%) — a clear jump-shooting edge.` });
    else if (bMid.pct - aMid.pct >= 15) insights.push({ side: teamB, type: 'danger', text: `${teamB} outperforms ${teamA} in the mid-range (${bMid.pct}% vs ${aMid.pct}%) — watch for pull-up jumpers.` });
  }
  if (avgPtsA && avgPtsB) {
    const diff = parseFloat(avgPtsA) - parseFloat(avgPtsB);
    if (Math.abs(diff) >= 8) {
      if (diff > 0) insights.push({ side: teamA, type: 'strength', text: `${teamA} outscores ${teamB} by +${diff.toFixed(1)} pts/game in this head-to-head — a dominant offensive edge.` });
      else insights.push({ side: teamB, type: 'danger', text: `${teamB} outscores ${teamA} by +${Math.abs(diff).toFixed(1)} pts/game in this matchup.` });
    }
  }

  const insightHtml = insights.length
    ? insights.map(i => `<div class="thInsight thInsight--${i.type==='strength'?'strength':'weakness'}">
        <span class="thInsIcon">${i.type==='strength'?'✅':'⚠️'}</span>
        <span>${i.text}</span>
      </div>`).join('')
    : '<div class="muted" style="padding:8px 0">Limited data — play more games to see deeper analysis.</div>';

  // Zone table
  const zoneRowHtml = zones.map(z => {
    const zA = zoneAgg(shotsA, z);
    const zB = zoneAgg(shotsB, z);
    const fmtZ = (zs) => zs.att === 0 ? '—' : `${zs.pct}% · ${zs.made}/${zs.att} (${zs.vol}%)`;
    const aWins = zA.pct != null && zB.pct != null && zA.pct > zB.pct;
    const bWins = zA.pct != null && zB.pct != null && zB.pct > zA.pct;
    return `<div class="thZoneRow">
      <div class="thZoneVal${aWins?' thZoneWin':''}">${fmtZ(zA)}</div>
      <div class="thZoneLbl">${zoneLabel[z]}</div>
      <div class="thZoneVal${bWins?' thZoneWin':''}">${fmtZ(zB)}</div>
    </div>`;
  }).join('');

  const modeSubtitle = mode === 'history'
    ? `${gamesPlayed} most recent game${gamesPlayed!==1?'s':''} (multi-season)`
    : `${gamesPlayed} game${gamesPlayed!==1?'s':''} this season`;

  el.innerHTML = `
    <div class="thMatchupToggleRow">
      <button class="thMatchupToggleBtn${mode==='season'?' active':''}" onclick="thLoadMatchup('${teamB.replace(/'/g,"\\'")}','season')">This Season</button>
      <button class="thMatchupToggleBtn${mode==='history'?' active':''}" onclick="thLoadMatchup('${teamB.replace(/'/g,"\\'")}','history')">Last 5 Matchups</button>
    </div>
    <div class="thMatchupHeader">
      <div class="thMatchupTeam" style="color:var(--accent)">${teamA}</div>
      <div class="thMatchupVs">${modeSubtitle}</div>
      <div class="thMatchupTeam" style="color:var(--warn)">${teamB}</div>
    </div>
    ${avgPtsA ? `<div class="thMatchupScore"><span style="color:var(--accent)">${avgPtsA} ppg</span> <span class="muted" style="font-size:11px">avg score</span> <span style="color:var(--warn)">${avgPtsB} ppg</span></div>` : ''}
    <div class="thShotChartsRow">
      ${_th_buildShotChartSVG(shotsA, teamA + ' offense', 'var(--accent)')}
      ${_th_buildShotChartSVG(shotsB, teamB + ' offense', 'var(--warn)')}
    </div>
    <div class="thZoneTable">
      <div class="thZoneHead">
        <span style="color:var(--accent)">${teamA}</span>
        <span>Zone</span>
        <span style="color:var(--warn)">${teamB}</span>
      </div>
      ${zoneRowHtml}
      <div class="thZoneNote">pct · made/att · (% of FGA)</div>
    </div>
    <div class="thDNAInsights" style="margin-top:16px">
      <div class="thDNASectionLabel">🎯 Matchup Insights</div>
      <div class="thInsightsGrid">${insightHtml}</div>
    </div>`;
  setTimeout(() => thInitShotChart('thMatchup'), 50);
}

// ── thLoadMatchup — find games, load play-by-play, render; supports history ───
async function thLoadMatchup(compareTeam, mode) {
  mode = mode || thMatchupMode || 'season';
  thMatchupMode = mode;
  const el = document.getElementById('thMatchup');
  if (!el || !thCurrentTeam || !compareTeam) return;

  let matchupGames = [];

  if (mode === 'season') {
    // Use already-loaded game cache for current season
    const gamesDataCached = typeof teamGamesCache !== 'undefined'
      ? teamGamesCache[(thCurrentTeam + ':' + thCurrentSeason).toLowerCase()]
      : null;
    const allGames = gamesDataCached ? (gamesDataCached.games || []) : [];
    matchupGames = allGames.filter(g => {
      const hn = (g.homeTeam || '').toLowerCase();
      const an = (g.awayTeam || '').toLowerCase();
      const bn = (compareTeam || '').toLowerCase();
      return hn === bn || an === bn;
    });
  } else {
    // History mode: scan last 3 seasons, collect up to 5 most recent matchups
    el.innerHTML = `<div class="muted" style="padding:20px;text-align:center">Loading matchup history across seasons…</div>`;
    const curYear = parseInt(thCurrentSeason, 10) || 2026;
    const seasons = [curYear, curYear - 1, curYear - 2];
    const seasonData = await Promise.all(
      seasons.map(s => loadGamesForTeam(thCurrentTeam, String(s)).catch(() => null))
    );
    seasonData.forEach(data => {
      if (!data) return;
      const found = (data.games || []).filter(g => {
        const hn = (g.homeTeam || '').toLowerCase();
        const an = (g.awayTeam || '').toLowerCase();
        const bn = (compareTeam || '').toLowerCase();
        return hn === bn || an === bn;
      });
      matchupGames.push(...found);
    });
    // Most recent first, cap at 5
    matchupGames.sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));
    matchupGames = matchupGames.slice(0, 5);
  }

  if (!matchupGames.length) {
    el.innerHTML = `<div class="thMatchupToggleRow">
      <button class="thMatchupToggleBtn${mode==='season'?' active':''}" onclick="thLoadMatchup('${compareTeam.replace(/'/g,"\\'")}','season')">This Season</button>
      <button class="thMatchupToggleBtn${mode==='history'?' active':''}" onclick="thLoadMatchup('${compareTeam.replace(/'/g,"\\'")}','history')">Last 5 Matchups</button>
    </div><div class="muted" style="padding:24px;text-align:center">No games found between <b>${thCurrentTeam}</b> and <b>${compareTeam}</b>.</div>`;
    return;
  }

  el.innerHTML = `<div class="muted" style="padding:20px;text-align:center">Loading play-by-play for ${matchupGames.length} game${matchupGames.length!==1?'s':''}…</div>`;

  const playsArrays = await Promise.all(matchupGames.map(g => loadPlaysForGame(g.id)));
  const allShots = playsArrays.flat();

  const boxScores = matchupGames.map(g => {
    const tn = (thCurrentTeam || '').toLowerCase();
    const isHome = (g.homeTeam || '').toLowerCase() === tn;
    return {
      ptsA: isHome ? g.homePoints : g.awayPoints,
      ptsB: isHome ? g.awayPoints : g.homePoints,
    };
  });

  thRenderMatchup(thCurrentTeam, compareTeam, allShots, matchupGames.length, boxScores, mode);
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
  thCurrentTeam   = teamName;
  thCurrentSeason = season || '2026';
  _thCurrentStats = null;
  _thLoading('Loading team data…');

  const teamKey  = (teamName || '').toLowerCase();
  const teamData = teamRatings[teamKey] || null;

  // Show overview immediately while rest loads in parallel
  thRenderOverview(teamData, null);
  const loadingEls = [thThreatsEl, thGameLogEl, thH2HEl,
    document.getElementById('thDNA'), document.getElementById('thCompare'),
    document.getElementById('thMatchup')];
  loadingEls.forEach(el => { if (el) el.innerHTML = '<div class="muted" style="padding:16px;text-align:center">Loading…</div>'; });

  // Parallel fetch: games + team stats + team shooting zones
  const [gamesData, statsData, shootingData] = await Promise.all([
    loadGamesForTeam(teamName, thCurrentSeason),
    loadTeamStats(teamName, thCurrentSeason),
    loadTeamShootingZones(teamName, thCurrentSeason),
  ]);
  _thCurrentStats = statsData;
  _thLoading('');

  thRenderOverview(teamData, gamesData);
  thRenderThreats(teamData, gamesData);
  thRenderGameLog(teamData, gamesData);
  thRenderH2H(teamData, gamesData);
  thRenderDNA(teamData, statsData, shootingData);
  // Reset compare/matchup to prompt state
  const elCmp = document.getElementById('thCompare');
  const elMxp = document.getElementById('thMatchup');
  if (elCmp) elCmp.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Pick a team in the compare box above →</div>';
  if (elMxp) elMxp.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Load a primary team, then select an opponent and click Compare →</div>';
}

// ── Populate team dropdown ────────────────────────────────────────────────────
function thPopulateTeams() {
  if (!thTeamSearch) return;
  const teams = [...new Set(
    (typeof tbGetAllPlayers === 'function' ? tbGetAllPlayers() : [])
      .map(p => p.Team || '')
      .filter(Boolean)
  )].sort();
  const opts = '<option value="">— Select a team —</option>' +
    teams.map(t => `<option value="${t.replace(/"/g,'&quot;')}">${t}</option>`).join('');
  thTeamSearch.innerHTML = opts;
  // Also populate compare dropdown
  const cmpEl = document.getElementById('thCompareTeam');
  if (cmpEl) cmpEl.innerHTML = '<option value="">— Select opponent team —</option>' +
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

  // Compare button
  const thCompareBtn = document.getElementById('thCompareBtn');
  if (thCompareBtn) {
    thCompareBtn.addEventListener('click', () => thLoadCompare());
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
