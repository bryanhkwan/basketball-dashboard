// ============ TEAM EXPLAINER MODULE ============
// Deterministic Team Hub explanation cards. No model changes, no extra network.

(function () {
  'use strict';

  function txEsc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function txNum(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function txFmt(value, dec) {
    var n = txNum(value);
    return Number.isFinite(n) ? n.toFixed(dec == null ? 1 : dec) : '--';
  }

  function txPctOf(values, value) {
    var v = txNum(value);
    if (!Number.isFinite(v) || !values.length) return null;
    var count = values.filter(function (x) { return x <= v; }).length;
    return Math.round(count / values.length * 100);
  }

  function txAvg(arr) {
    var vals = (arr || []).map(txNum).filter(Number.isFinite);
    return vals.length ? vals.reduce(function (s, v) { return s + v; }, 0) / vals.length : null;
  }

  function txRating(teamName) {
    var key = String(teamName || '').toLowerCase();
    return typeof teamRatings !== 'undefined' && teamRatings ? (teamRatings[key] || null) : null;
  }

  function txGameRows(teamName, gamesData) {
    var teamKey = String(teamName || '').toLowerCase();
    return ((gamesData && gamesData.games) || []).map(function (g) {
      var home = String(g.homeTeam || '').toLowerCase() === teamKey;
      var away = String(g.awayTeam || '').toLowerCase() === teamKey;
      if (!home && !away) return null;
      var teamPts = txNum(home ? g.homePoints : g.awayPoints);
      var oppPts = txNum(home ? g.awayPoints : g.homePoints);
      if (!Number.isFinite(teamPts) || !Number.isFinite(oppPts)) return null;
      var opp = home ? (g.awayTeam || '') : (g.homeTeam || '');
      var oppRat = txRating(opp);
      return {
        date: g.date || g.gameDate || '',
        opponent: opp,
        pointsFor: teamPts,
        pointsAgainst: oppPts,
        margin: teamPts - oppPts,
        win: teamPts > oppPts,
        oppRank: oppRat && Number.isFinite(txNum(oppRat.rank)) ? txNum(oppRat.rank) : null,
        oppAdjEM: oppRat && Number.isFinite(txNum(oppRat.adjEM)) ? txNum(oppRat.adjEM) : null
      };
    }).filter(Boolean);
  }

  function txBestWin(rows) {
    var wins = rows.filter(function (g) { return g.win; });
    if (!wins.length) return null;
    wins.sort(function (a, b) {
      if (a.oppRank && b.oppRank) return a.oppRank - b.oppRank;
      if (a.oppRank) return -1;
      if (b.oppRank) return 1;
      return b.margin - a.margin;
    });
    return wins[0];
  }

  function txToughLoss(rows) {
    var losses = rows.filter(function (g) { return !g.win; });
    if (!losses.length) return null;
    losses.sort(function (a, b) {
      if (a.oppRank && b.oppRank) return a.oppRank - b.oppRank;
      if (a.oppRank) return -1;
      if (b.oppRank) return 1;
      return Math.abs(a.margin) - Math.abs(b.margin);
    });
    return losses[0];
  }

  function txFourFactorValue(statsData, side, key) {
    var root = side === 'defense'
      ? statsData && statsData.opponentStats
      : statsData && statsData.teamStats;
    var ff = root && root.fourFactors;
    if (!ff) return null;
    return txNum(ff[key]);
  }

  function txCard(title, value, meta, body, tone) {
    return '<div class="txCard txCard--' + txEsc(tone || 'neutral') + '">'
      + '<div class="txCardTop"><span>' + txEsc(title) + '</span><b>' + value + '</b></div>'
      + '<div class="txMeta">' + txEsc(meta || '') + '</div>'
      + '<div class="txBody">' + body + '</div>'
      + '</div>';
  }

  function txRender(teamName, teamData, gamesData, statsData) {
    var el = document.getElementById('thExplainCards');
    if (!el) return;
    if (!teamName) {
      el.innerHTML = '<div class="muted" style="padding:24px;text-align:center">Load a team to see rating explanation cards.</div>';
      return;
    }

    var rating = teamData || txRating(teamName);
    var ratings = (typeof allRatingsData !== 'undefined' && Array.isArray(allRatingsData)) ? allRatingsData : [];
    var adjOs = ratings.map(function (x) { return txNum(x.adjO); }).filter(Number.isFinite).sort(function (a, b) { return a - b; });
    var adjDs = ratings.map(function (x) { return txNum(x.adjD); }).filter(Number.isFinite).sort(function (a, b) { return a - b; });
    var oPct = rating ? txPctOf(adjOs, rating.adjO) : null;
    var dPct = rating && Number.isFinite(txNum(rating.adjD)) ? 100 - txPctOf(adjDs, rating.adjD) : null;
    var rank = rating && rating.rank ? '#' + rating.rank : '--';
    var adjEM = rating && Number.isFinite(txNum(rating.adjEM)) ? (txNum(rating.adjEM) >= 0 ? '+' : '') + txFmt(rating.adjEM, 1) : '--';

    var rows = txGameRows(teamName, gamesData);
    var wins = rows.filter(function (g) { return g.win; }).length;
    var losses = rows.length - wins;
    var lastFive = rows.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).slice(0, 5);
    var lastFiveWins = lastFive.filter(function (g) { return g.win; }).length;
    var avgMargin = txAvg(rows.map(function (g) { return g.margin; }));
    var recentMargin = txAvg(lastFive.map(function (g) { return g.margin; }));
    var best = txBestWin(rows);
    var tough = txToughLoss(rows);

    var offEfg = txFourFactorValue(statsData, 'offense', 'effectiveFieldGoalPct');
    var offTov = txFourFactorValue(statsData, 'offense', 'turnoverRatio');
    var offOreb = txFourFactorValue(statsData, 'offense', 'offensiveReboundPct');
    var offFtr = txFourFactorValue(statsData, 'offense', 'freeThrowRate');
    var defEfg = txFourFactorValue(statsData, 'defense', 'effectiveFieldGoalPct');
    var defTov = txFourFactorValue(statsData, 'defense', 'turnoverRatio');
    var defOreb = txFourFactorValue(statsData, 'defense', 'offensiveReboundPct');
    var defFtr = txFourFactorValue(statsData, 'defense', 'freeThrowRate');

    var identity = [];
    if (Number.isFinite(offEfg)) identity.push('Offensive eFG: ' + txFmt(offEfg, 1) + '%');
    if (Number.isFinite(offTov)) identity.push('Offensive turnover pressure: ' + txFmt(offTov * 100, 1) + '%');
    if (Number.isFinite(offOreb)) identity.push('Offensive rebounding: ' + txFmt(offOreb, 1) + '%');
    if (Number.isFinite(defEfg)) identity.push('Opponent eFG allowed: ' + txFmt(defEfg, 1) + '%');

    var watch = [];
    if (Number.isFinite(oPct) && oPct < 40) watch.push('Offense is below the national midpoint.');
    if (Number.isFinite(dPct) && dPct < 40) watch.push('Defense is below the national midpoint.');
    if (Number.isFinite(offTov) && offTov >= 0.19) watch.push('Turnovers can drag down otherwise good possessions.');
    if (Number.isFinite(defEfg) && defEfg >= 53) watch.push('Opponents are getting too much shot quality.');
    if (Number.isFinite(defOreb) && defOreb >= 34) watch.push('Defensive glass can leak second chances.');
    if (Number.isFinite(defFtr) && defFtr >= 33) watch.push('Foul rate gives opponents free points.');
    if (!watch.length) watch.push('No major structural warning from the current rating and four-factor set.');

    var ratingBody = '<p>Rank is being driven by a net efficiency read of <b>' + txEsc(adjEM) + '</b>. '
      + 'Offense grades ' + (oPct == null ? 'without a percentile' : '<b>' + oPct + 'th percentile</b>')
      + ' and defense grades ' + (dPct == null ? 'without a percentile' : '<b>' + dPct + 'th percentile</b>') + '.</p>';

    var resumeBody = '<p>Current loaded record: <b>' + wins + '-' + losses + '</b>'
      + (Number.isFinite(avgMargin) ? ' with an average margin of <b>' + (avgMargin >= 0 ? '+' : '') + avgMargin.toFixed(1) + '</b>.' : '.')
      + '</p><p>Last five: <b>' + lastFiveWins + '-' + (lastFive.length - lastFiveWins) + '</b>'
      + (Number.isFinite(recentMargin) ? ', margin <b>' + (recentMargin >= 0 ? '+' : '') + recentMargin.toFixed(1) + '</b>.' : '.')
      + '</p>';
    if (best) resumeBody += '<p>Best win signal: <b>' + txEsc(best.opponent) + '</b>' + (best.oppRank ? ' (#' + best.oppRank + ')' : '') + ', margin +' + best.margin.toFixed(0) + '.</p>';
    if (tough) resumeBody += '<p>Toughest loss signal: <b>' + txEsc(tough.opponent) + '</b>' + (tough.oppRank ? ' (#' + tough.oppRank + ')' : '') + ', margin ' + tough.margin.toFixed(0) + '.</p>';

    var identityBody = identity.length
      ? '<ul>' + identity.slice(0, 5).map(function (line) { return '<li>' + txEsc(line) + '</li>'; }).join('') + '</ul>'
      : '<p>Team style data is not available yet for this team/season.</p>';

    var watchBody = '<ul>' + watch.slice(0, 5).map(function (line) { return '<li>' + txEsc(line) + '</li>'; }).join('') + '</ul>';

    el.innerHTML = '<div class="txGrid">'
      + txCard('Rating Driver', rank, 'Adjusted efficiency and national context', ratingBody, Number.isFinite(txNum(rating && rating.adjEM)) && txNum(rating.adjEM) >= 0 ? 'good' : 'neutral')
      + txCard('Resume Context', rows.length ? wins + '-' + losses : '--', 'Loaded season game log', resumeBody, wins >= losses ? 'good' : 'warn')
      + txCard('Identity Markers', identity.length ? identity.length + ' signals' : '--', 'Four factors and scoring profile', identityBody, 'accent')
      + txCard('Watch Items', watch.length + ' notes', 'Deterministic risk flags', watchBody, watch.length > 1 ? 'warn' : 'neutral')
      + '</div>';
  }

  window.TeamExplainer = {
    render: txRender
  };
})();
