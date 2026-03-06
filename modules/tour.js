// modules/tour.js — Interactive Guided Tour
// Spotlight tour with no external dependencies. Uses position:fixed + box-shadow trick.
(function () {
  'use strict';

  // ── Tour Step Definitions ───────────────────────────────────────────────────
  var STEPS = [
    {
      target: '#leagueSwitch',
      title: '🏀 League Toggle',
      body: 'Switch between <b>Men\'s Basketball (MBB)</b> and <b>Women\'s Basketball (WBB)</b>. All player data, percentiles, valuations, rosters, and team scouting update instantly.',
      position: 'bottom'
    },
    {
      target: '.pageNav',
      title: '📌 Navigation Tabs',
      body: 'Four main sections:<br>• <b>Players</b> — explore and rank all players<br>• <b>Team Builder</b> — assemble rosters and scout opponents<br>• <b>Teams</b> — deep-dive team scouting and matchup analysis<br>• <b>Methodology</b> — learn how scores are calculated',
      position: 'bottom'
    },
    {
      target: '#loadGs',
      title: '🔄 Refresh Data',
      body: 'Reload the latest player data. MBB data comes from the CBD API and WBB from Google Sheets — both refresh at once. Data also loads automatically when you first open the dashboard.',
      position: 'bottom',
      page: 'pagePlayers'
    },
    {
      target: '#tabGuards',
      title: '📍 Position Groups',
      body: 'Toggle between <b>Guards</b> (G, G-F) and <b>Bigs</b> (F, C, F-C, C-F). All percentile rankings are calculated within the same group — Guards are never compared to Bigs.',
      position: 'bottom',
      page: 'pagePlayers'
    },
    {
      target: '#fitPreset',
      title: '🎯 Fit Preset',
      body: 'Instantly apply a recruiting philosophy template: <b>Balanced</b>, <b>Shooting</b>, <b>Playmaking</b>, <b>Defense</b>, <b>Rim Presence</b>, or <b>Rebounding</b>. Each preset re-weights the scoring formula automatically.',
      position: 'bottom',
      page: 'pagePlayers'
    },
    {
      target: '#search',
      title: '🔍 Player Search',
      body: 'Filter the player table in real time by player name or team. Works alongside sorting and position group filters.',
      position: 'bottom',
      page: 'pagePlayers'
    },
    {
      target: '#playersBody',
      title: '📊 Player Table + Profile',
      body: 'Browse all players ranked by your scoring weights. <b>Click any row</b> to open a full player profile — percentile bars, archetype tags, NIL valuation, career history, an auto-generated <b>Scout Report</b> (Strengths, Weaknesses, Tendencies, Development, Matchup Notes), and an interactive <b>Shot Chart</b> you can filter by makes or misses.',
      position: 'top',
      page: 'pagePlayers'
    },
    {
      target: '#weightsCard',
      title: '⚖️ Scoring Weights',
      body: 'Customize how each stat contributes to PerfScore. Adjust weights (W), Min, and Max ranges, or toggle stats on/off. The table re-ranks every player instantly. Click any stat name to see its glossary definition.',
      position: 'left',
      page: 'pagePlayers'
    },
    {
      target: '#confMultCard',
      title: '🏛 Conference Multiplier',
      body: 'Optionally adjust player valuations by conference strength. Enable this to give players from stronger conferences a boost — useful when comparing players across vastly different competition levels.',
      position: 'left',
      page: 'pagePlayers'
    },
    {
      target: '#valuationCard',
      title: '💰 Valuation Settings',
      body: 'Configure your NIL market anchors. Set <b>Average Pay</b>, <b>Min/Max</b> bounds, and a <b>Star Value</b> target. The exponential valuation curve updates immediately, recalibrating every player\'s estimated NIL value.',
      position: 'left',
      page: 'pagePlayers'
    },
    {
      target: '.pageNavBtn[data-page="pageTeamBuilder"]',
      title: '📋 Team Builder',
      body: 'Build and manage rosters, analyze stat gaps, compare teams head-to-head, and scout opponents — all in one place. Click <b>Next</b> to explore its features.',
      position: 'bottom'
    },
    {
      target: '#tbQuickAddInput',
      title: '➕ Quick Add',
      body: 'Search any player and add them to your roster. You can also use the <b>+</b> button in the Players tab. Set <b>Budget</b>, <b>Player Cap</b>, and <b>Max Roster</b> constraints at the top.',
      position: 'bottom',
      page: 'pageTeamBuilder',
      pageSection: 'tbSubMyTeam'
    },
    {
      target: '#tbStatProfile',
      title: '📈 Team Stat Profile',
      body: 'After adding players, see your roster\'s average percentile across key stat categories. <b>Red bars</b> signal weak areas that need recruiting attention. The <b>Recommended Fits</b> panel surfaces players who fill those gaps within budget.',
      position: 'right',
      page: 'pageTeamBuilder',
      pageSection: 'tbSubMyTeam'
    },
    {
      target: '#tbSubH2H',
      title: '⚔️ Head-to-Head',
      body: 'Compare your team against an opponent category-by-category. <b>Green</b> means your team leads; <b>red</b> means the opponent has the edge. Build an opponent roster in the Opponent tab first, then come here.',
      position: 'bottom',
      page: 'pageTeamBuilder',
      pageSection: 'tbSubH2H'
    },
    {
      target: '#tbSubOpponent',
      title: '🎯 Opponent Builder',
      body: 'Build any opponent\'s roster for gap analysis and head-to-head comparison. Use the quick-add search, the <b>⚔</b> button in the Players tab, or ask Scout AI: <i>"Add all Bowling Green players to opponent."</i>',
      position: 'bottom',
      page: 'pageTeamBuilder',
      pageSection: 'tbSubOpponent'
    },
    {
      target: '.pageNavBtn[data-page="pageTeams"]',
      title: '🏟️ Teams Hub',
      body: 'Brand-new team scouting section. Select any team and season to see adjusted efficiency ratings, four-factor breakdowns, scoring profiles, and an auto-generated <b>Team Scout Report</b>. Click <b>Next</b> to explore.',
      position: 'bottom'
    },
    {
      target: '#thDNA',
      title: '🧬 Team DNA',
      body: 'See a team\'s full identity at a glance — <b>adjusted offensive/defensive efficiency (adjEM)</b>, four factors (eFG%, TO%, OR%, FT Rate), scoring distribution by zone, and insight pills summarizing their tendencies and style.',
      position: 'right',
      page: 'pageTeams'
    },
    {
      target: '#thScout',
      title: '📋 Team Scout Report',
      body: 'A 5-section scouting card generated automatically for every loaded team: <b>Offensive Weapons</b>, <b>Defensive Identity</b>, <b>Style Tendencies</b>, <b>Vulnerabilities</b>, and <b>Matchup Keys</b>. No button needed — appears the moment a team loads.',
      position: 'right',
      page: 'pageTeams'
    },
    {
      target: '#thCompare',
      title: '📊 Team Comparison',
      body: 'Load a second team to compare ratings and stats side by side. Adjusted efficiency, four factors, and scoring profiles appear in parallel columns so you can instantly spot which team has the edge and where.',
      position: 'top',
      page: 'pageTeams'
    },
    {
      target: '#thMatchup',
      title: '🎯 Matchup Analysis + Deep Analysis',
      body: 'Load both teams to unlock <b>dual interactive shot charts</b> (click Makes or Misses to filter), a zone-by-zone shooting comparison table, and matchup insight pills.<br><br>Hit <b>Deep Analysis</b> for a full in-page AI breakdown — Overall Verdict, Offensive &amp; Defensive Keys, Head-to-Head edges, and Tactical Adjustments — rendered right here with no web search, powered entirely by the loaded data.',
      position: 'top',
      page: 'pageTeams'
    },
    {
      target: '#aiToggle',
      title: '🤖 Scout AI',
      body: 'Ask Scout AI anything — it has full access to your dashboard data and can search the web. Try:<br><i>"How good is Duke this season?"</i> — get team ratings + top contributors<br><i>"Find a shooter under $80K"</i><br><i>"Is Player X worth $200K?"</i><br>It\'ll also point you to Scout Reports, Shot Charts, and the Teams Hub Deep Analysis when relevant.',
      position: 'left'
    }
  ];

  // ── State ───────────────────────────────────────────────────────────────────
  var _step = 0;
  var _active = false;
  var _hlEl = null;
  var _ttEl = null;
  var _scrollTimer = null;
  var _resizeTimer = null;

  // ── DOM Construction ────────────────────────────────────────────────────────
  function _buildDOM() {
    _hlEl = document.createElement('div');
    _hlEl.className = 'tourHL';
    document.body.appendChild(_hlEl);

    _ttEl = document.createElement('div');
    _ttEl.className = 'tourTT';
    document.body.appendChild(_ttEl);
  }

  function _teardown() {
    _active = false;
    if (_scrollTimer) clearTimeout(_scrollTimer);
    if (_resizeTimer) clearTimeout(_resizeTimer);
    if (_hlEl) { _hlEl.remove(); _hlEl = null; }
    if (_ttEl) { _ttEl.remove(); _ttEl = null; }
    window.removeEventListener('resize', _onResize);
    window.removeEventListener('scroll', _onScroll, true);
  }

  // ── Page / Sub-section Navigation ──────────────────────────────────────────
  function _switchPage(step) {
    if (!step.page) return;

    // Hide all pages, show the right one
    ['pagePlayers', 'pageTeamBuilder', 'pageTeams', 'pageMethodology'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = id === step.page ? '' : 'none';
    });
    document.querySelectorAll('.pageNavBtn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.page === step.page);
    });

    // Team Builder sub-nav
    if (step.page === 'pageTeamBuilder') {
      var sub = step.pageSection || 'tbSubMyTeam';
      ['tbSubMyTeam', 'tbSubH2H', 'tbSubOpponent'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = id === sub ? '' : 'none';
      });
      document.querySelectorAll('.tbSubBtn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.sub === sub);
      });
    }
  }

  // ── Positioning ─────────────────────────────────────────────────────────────
  function _positionElements() {
    if (!_active || !_hlEl || !_ttEl) return;
    var step = STEPS[_step];
    var target = document.querySelector(step.target);
    if (!target) return;

    var PAD = 8;
    var r = target.getBoundingClientRect();

    // Skip if rect has no size (element invisible/collapsed)
    if (r.width === 0 && r.height === 0) return;

    // ── Highlight box (fixed, outline with box-shadow spotlight)
    _hlEl.style.top    = (r.top  - PAD) + 'px';
    _hlEl.style.left   = (r.left - PAD) + 'px';
    _hlEl.style.width  = (r.width  + PAD * 2) + 'px';
    _hlEl.style.height = (r.height + PAD * 2) + 'px';
    _hlEl.style.opacity = '1';

    // ── Tooltip position
    var GAP  = 14;
    var TTW  = 320;
    var vw   = window.innerWidth;
    var vh   = window.innerHeight;
    var pos  = step.position || 'bottom';
    var tx, ty;

    // Rough tooltip height estimate (will clamp below)
    var TTH = _ttEl.offsetHeight || 200;

    if (pos === 'bottom') {
      tx = r.left + r.width  / 2 - TTW / 2;
      ty = r.bottom + PAD + GAP;
    } else if (pos === 'top') {
      tx = r.left + r.width  / 2 - TTW / 2;
      ty = r.top  - PAD - GAP - TTH;
    } else if (pos === 'left') {
      tx = r.left - PAD - GAP - TTW;
      ty = r.top + r.height / 2 - TTH / 2;
    } else { // right
      tx = r.right + PAD + GAP;
      ty = r.top  + r.height / 2 - TTH / 2;
    }

    // Clamp within viewport with some padding
    tx = Math.max(10, Math.min(tx, vw - TTW - 10));
    ty = Math.max(10, Math.min(ty, vh - TTH - 10));

    _ttEl.style.left = tx + 'px';
    _ttEl.style.top  = ty + 'px';
  }

  // ── Show a step ─────────────────────────────────────────────────────────────
  function _show(idx) {
    _step = idx;
    var step = STEPS[idx];

    // Navigate to the correct page / sub-section
    _switchPage(step);

    var target = document.querySelector(step.target);
    if (!target) {
      // Element not found — skip silently
      if (idx + 1 < STEPS.length) { _show(idx + 1); return; }
      _teardown(); return;
    }

    // Scroll target into view, then position after animation settles
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Render tooltip content immediately (so offsetHeight is measurable)
    _renderTooltip(step, idx);

    if (_scrollTimer) clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(_positionElements, 380);
  }

  // ── Render tooltip HTML ─────────────────────────────────────────────────────
  function _renderTooltip(step, idx) {
    var prog   = (idx + 1) + ' / ' + STEPS.length;
    var isLast = idx === STEPS.length - 1;

    _ttEl.innerHTML =
      '<div class="tourTT-prog">' + prog + '</div>' +
      '<div class="tourTT-title">' + step.title + '</div>' +
      '<div class="tourTT-body">' + step.body + '</div>' +
      '<div class="tourTT-btns">' +
        '<button class="tourTT-skip" onclick="window._tour.end()">Skip tour</button>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          (idx > 0
            ? '<button class="tourTT-prev" onclick="window._tour.prev()">← Back</button>'
            : '') +
          '<button class="tourTT-next" onclick="window._tour.' + (isLast ? 'end' : 'next') + '()">' +
            (isLast ? 'Finish ✓' : 'Next →') +
          '</button>' +
        '</div>' +
      '</div>';

    // Progress pip bar
    var pips = '';
    for (var i = 0; i < STEPS.length; i++) {
      pips += '<span class="tourPip' + (i === idx ? ' active' : '') + '"></span>';
    }
    _ttEl.insertAdjacentHTML('afterbegin', '<div class="tourPips">' + pips + '</div>');
  }

  // ── Event Listeners for live re-positioning ─────────────────────────────────
  function _onResize() {
    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(_positionElements, 100);
  }

  function _onScroll() {
    if (_scrollTimer) clearTimeout(_scrollTimer);
    _scrollTimer = setTimeout(_positionElements, 60);
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  window._tour = {
    start: function () {
      if (_active) return;
      _active = true;
      _buildDOM();
      window.addEventListener('resize', _onResize);
      window.addEventListener('scroll', _onScroll, true);
      _show(0);
    },
    next: function () {
      if (!_active) return;
      if (_step + 1 < STEPS.length) _show(_step + 1);
      else _teardown();
    },
    prev: function () {
      if (!_active) return;
      if (_step > 0) _show(_step - 1);
    },
    end: _teardown
  };

  // Convenience alias used by the tour button
  window.startTour = window._tour.start;

  // Wire up tour button once DOM is ready
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('tourBtn');
    if (btn) btn.addEventListener('click', window._tour.start);
  });
})();
