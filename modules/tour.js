(function () {
  'use strict';

  var DEFAULT_STEPS = [
    {
      target: '#leagueSwitch',
      title: 'League Toggle',
      body: 'Switch between MBB and WBB before you read rankings, valuations, or team context.',
      position: 'bottom'
    },
    {
      target: '.pageNav',
      title: 'Navigation',
      body: 'Use the top navigation to move between the core scouting, portal, team, value, and tournament workflows.',
      position: 'bottom'
    },
    {
      target: '#playersBody',
      title: 'Player Table',
      body: 'Players is the fastest place to sort the board and jump into a profile.',
      position: 'top',
      page: 'pagePlayers'
    },
    {
      target: '#aiToggle',
      title: 'Scout AI',
      body: 'Scout AI can search dashboard data, run tools, and help connect the pages together.',
      position: 'left'
    }
  ];

  var steps = DEFAULT_STEPS.slice();
  var stepIndex = 0;
  var active = false;
  var highlightEl = null;
  var tooltipEl = null;
  var scrollTimer = null;
  var resizeTimer = null;
  var lastRouteKey = '';
  var keyListenerBound = false;

  var GUEST_DEMO_STEPS = [
    {
      target: '#leagueSwitch',
      title: 'Welcome to the Demo',
      body: 'This guest tour walks the full platform so recruiters can see the major workflows quickly. Use Right Arrow for next, Left Arrow for back, and Esc to skip anytime.',
      position: 'bottom',
      page: 'pagePlayers',
      activeNavId: 'pagePlayers'
    },
    {
      target: '.pageNav',
      title: 'Core Navigation',
      body: 'The top navigation moves between scouting, portal, team, value, tournament, favorites, and collaboration workflows without leaving the same internal platform.',
      position: 'bottom',
      page: 'pagePlayers',
      activeNavId: 'pagePlayers'
    },
    {
      target: '#playersSettingsToggleBtn',
      title: 'Model Settings',
      body: 'Approved staff can open Model settings to tune presets, weights, valuation anchors, and conference multipliers. In guest demo mode, that internal tuning workspace stays locked while the outputs remain visible.',
      position: 'bottom',
      page: 'pagePlayers',
      activeNavId: 'pagePlayers',
      playersSettings: 'closed'
    },
    {
      target: '#playersBody',
      title: 'Player Board',
      body: 'Players is the core scouting board. Sort the rankings, open profiles, and understand how the rest of the dashboard builds off this player pool.',
      position: 'top',
      page: 'pagePlayers',
      activeNavId: 'pagePlayers',
      playersSettings: 'closed'
    },
    {
      target: '#portalBoardSection',
      title: 'Transfer Portal',
      body: 'Portal tracks live entries, merges matched dashboard context, and helps staff move quickly from market scan to evaluation.',
      position: 'top',
      page: 'pagePortal',
      activeNavId: 'pagePortal'
    },
    {
      target: '#portalFitLabSection',
      title: 'Portal Fit Lab',
      body: 'Fit Lab ranks replacements for a departing slot so the portal workflow becomes more than just a list of names.',
      position: 'top',
      page: 'pagePortal',
      activeNavId: 'pagePortal'
    },
    {
      target: '#thOpenBuilderBtn',
      title: 'Team Hub',
      body: 'Team Hub is the real-team scouting workspace. From here staff can launch Team Builder for scenarios or Value Lab for the business side.',
      position: 'bottom',
      page: 'pageTeams',
      activeNavId: 'pageTeams'
    },
    {
      target: '#tbQuickAddInput',
      title: 'Team Builder',
      body: 'Team Builder handles hypothetical roster construction and what-if scenario work without changing the real-team analysis page.',
      position: 'bottom',
      page: 'pageTeamBuilder',
      activeNavId: 'pageTeams',
      pageSection: 'tbSubMyTeam'
    },
    {
      target: '#valueLabCompareSection',
      title: 'Value Lab',
      body: 'Value Lab is the roster investment workspace. Compare cases, judge budget efficiency, and turn roster ideas into business-side decisions.',
      position: 'top',
      page: 'pageValueLab',
      activeNavId: 'pageValueLab'
    },
    {
      target: '#valueLabAISection',
      title: 'Director Brief',
      body: 'The Director AI Brief translates roster spend, value, and projected outcomes into a leadership-ready summary and export flow.',
      position: 'top',
      page: 'pageValueLab',
      activeNavId: 'pageValueLab'
    },
    {
      target: '#labWarRoomLauncherSection',
      title: 'Tournament Lab',
      body: 'Tournament Lab studies field-level patterns and launches the bracket simulation flow once staff are ready to pressure-test March outcomes.',
      position: 'top',
      page: 'pageLab',
      activeNavId: 'pageLab'
    },
    {
      target: '#favsHeaderSection',
      title: 'Favorites',
      body: 'Favorites keeps saved target boards, portal watch lists, and staff shortlists organized in one place.',
      position: 'bottom',
      page: 'pageFavorites',
      activeNavId: 'pageFavorites'
    },
    {
      target: '#chatGuestBanner',
      title: 'Collaborate Preview',
      body: 'Collaborate is visible in demo mode as a preview of the internal messaging workspace. Live staff threads and sending actions stay locked to approved accounts.',
      position: 'bottom',
      page: 'pageCollaborate',
      activeNavId: 'pageCollaborate'
    },
    {
      target: '#tourBtn',
      title: 'Need Help Later?',
      body: 'Use the ? button anytime to reopen help for the current page, rerun that page tour, or learn more about how that specific workflow works.',
      position: 'left',
      page: 'pagePlayers',
      activeNavId: 'pagePlayers'
    }
  ];

  function getActiveSteps() {
    return steps && steps.length ? steps : DEFAULT_STEPS;
  }

  function buildDom() {
    highlightEl = document.createElement('div');
    highlightEl.className = 'tourHL';
    document.body.appendChild(highlightEl);

    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tourTT';
    document.body.appendChild(tooltipEl);
  }

  function teardown() {
    active = false;
    steps = DEFAULT_STEPS.slice();
    lastRouteKey = '';
    if (scrollTimer) clearTimeout(scrollTimer);
    if (resizeTimer) clearTimeout(resizeTimer);
    if (highlightEl) { highlightEl.remove(); highlightEl = null; }
    if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll, true);
    if (keyListenerBound) {
      document.removeEventListener('keydown', onKeyDown, true);
      keyListenerBound = false;
    }
  }

  function showTeamBuilderSection(sectionId) {
    var nextSectionId = sectionId || 'tbSubMyTeam';
    ['tbSubMyTeam', 'tbSubH2H', 'tbSubOpponent'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = id === nextSectionId ? '' : 'none';
    });
    document.querySelectorAll('.tbSubBtn').forEach(function (button) {
      button.classList.toggle('active', button.dataset.sub === nextSectionId);
    });
  }

  function fallbackSwitchPage(step) {
    if (!step.page) return;
    ['pagePlayers', 'pagePortal', 'pageTeamBuilder', 'pageTeams', 'pageValueLab', 'pageMethodology', 'pageLab', 'pageWarRoom', 'pageFavorites', 'pageCollaborate', 'pageAdmin'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.display = id === step.page ? '' : 'none';
    });
    document.querySelectorAll('.pageNavBtn').forEach(function (button) {
      button.classList.toggle('active', button.dataset.page === (step.activeNavId || step.page));
    });
    if (step.page === 'pageTeamBuilder') showTeamBuilderSection(step.pageSection);
  }

  function switchPage(step) {
    if (!step.page) return;
    var nextRouteKey = [
      step.page || '',
      step.activeNavId || '',
      step.pageSection || ''
    ].join('|');
    if (nextRouteKey === lastRouteKey) return;

    var currentPageId = window._dashboardCurrentPageId || '';
    var pageChanged = currentPageId !== step.page;

    if (pageChanged) {
      if (window.TeamBuilder && typeof window.TeamBuilder.showDashboardPage === 'function') {
        window.TeamBuilder.showDashboardPage(step.page, step.activeNavId);
      } else {
        fallbackSwitchPage(step);
      }
    }
    if (step.page === 'pageTeamBuilder') showTeamBuilderSection(step.pageSection);
    lastRouteKey = nextRouteKey;
  }

  function ensureStepWorkspace(step) {
    if (!step) return;
    var isGuest = typeof authIsGuest === 'function' && authIsGuest();
    if (window._app && typeof window._app.setPlayersSettingsOpen === 'function') {
      if (step.playersSettings === 'open' && !isGuest) {
        window._app.setPlayersSettingsOpen(true);
      } else if (step.playersSettings === 'closed') {
        window._app.setPlayersSettingsOpen(false);
      }
    }
    if (!step.target) return;
    var target = document.querySelector(step.target);
    if (!target) return;
    if (target.closest && target.closest('#playersRightstack')) {
      if (!isGuest && window._app && typeof window._app.setPlayersSettingsOpen === 'function' && step.playersSettings !== 'closed') {
        window._app.setPlayersSettingsOpen(true);
      }
    }
  }

  function positionElements() {
    if (!active || !highlightEl || !tooltipEl) return;
    var currentSteps = getActiveSteps();
    var step = currentSteps[stepIndex];
    var target = document.querySelector(step.target);
    if (!target) return;

    var pad = 8;
    var rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    highlightEl.style.top = (rect.top - pad) + 'px';
    highlightEl.style.left = (rect.left - pad) + 'px';
    highlightEl.style.width = (rect.width + pad * 2) + 'px';
    highlightEl.style.height = (rect.height + pad * 2) + 'px';
    highlightEl.style.opacity = '1';

    var gap = 14;
    var tooltipWidth = 320;
    var viewportWidth = window.innerWidth;
    var viewportHeight = window.innerHeight;
    var position = step.position || 'bottom';
    var tooltipHeight = tooltipEl.offsetHeight || 200;
    var left;
    var top;

    if (position === 'bottom') {
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      top = rect.bottom + pad + gap;
    } else if (position === 'top') {
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
      top = rect.top - pad - gap - tooltipHeight;
    } else if (position === 'left') {
      left = rect.left - pad - gap - tooltipWidth;
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
    } else {
      left = rect.right + pad + gap;
      top = rect.top + rect.height / 2 - tooltipHeight / 2;
    }

    left = Math.max(10, Math.min(left, viewportWidth - tooltipWidth - 10));
    top = Math.max(10, Math.min(top, viewportHeight - tooltipHeight - 10));

    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
  }

  function renderTooltip(step, index) {
    var currentSteps = getActiveSteps();
    var progress = (index + 1) + ' / ' + currentSteps.length;
    var isLast = index === currentSteps.length - 1;

    tooltipEl.innerHTML =
      '<div class="tourTT-prog">' + progress + '</div>' +
      '<div class="tourTT-title">' + step.title + '</div>' +
      '<div class="tourTT-body">' + step.body + '</div>' +
      '<div class="tourTT-btns">' +
        '<button class="tourTT-skip" onclick="window._tour.end()">Skip tour</button>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          (index > 0 ? '<button class="tourTT-prev" onclick="window._tour.prev()">Back</button>' : '') +
          '<button class="tourTT-next" onclick="window._tour.' + (isLast ? 'end' : 'next') + '()">' + (isLast ? 'Finish' : 'Next') + '</button>' +
        '</div>' +
      '</div>';

    var pips = '';
    for (var i = 0; i < currentSteps.length; i++) {
      pips += '<span class="tourPip' + (i === index ? ' active' : '') + '"></span>';
    }
    tooltipEl.insertAdjacentHTML('afterbegin', '<div class="tourPips">' + pips + '</div>');
  }

  function show(index) {
    stepIndex = index;
    var currentSteps = getActiveSteps();
    var step = currentSteps[index];

    switchPage(step);
    ensureStepWorkspace(step);

    var target = document.querySelector(step.target);
    if (!target) {
      if (index + 1 < currentSteps.length) {
        show(index + 1);
        return;
      }
      teardown();
      return;
    }

    var rect = target.getBoundingClientRect();
    var mostlyVisible = rect.top >= 24 && rect.bottom <= (window.innerHeight - 24);
    target.scrollIntoView({ behavior: mostlyVisible ? 'auto' : 'smooth', block: 'center' });
    renderTooltip(step, index);

    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(positionElements, 380);
  }

  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(positionElements, 100);
  }

  function onScroll() {
    if (scrollTimer) clearTimeout(scrollTimer);
    scrollTimer = setTimeout(positionElements, 60);
  }

  function onKeyDown(event) {
    if (!active) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      window._tour.next();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      window._tour.prev();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      window._tour.end();
    }
  }

  window._tour = {
    start: function (customSteps) {
      if (active) return;
      steps = Array.isArray(customSteps) && customSteps.length ? customSteps.slice() : DEFAULT_STEPS.slice();
      active = true;
      buildDom();
      window.addEventListener('resize', onResize);
      window.addEventListener('scroll', onScroll, true);
      if (!keyListenerBound) {
        document.addEventListener('keydown', onKeyDown, true);
        keyListenerBound = true;
      }
      show(0);
    },
    startGuestDemo: function () {
      this.start(GUEST_DEMO_STEPS);
    },
    next: function () {
      if (!active) return;
      var currentSteps = getActiveSteps();
      if (stepIndex + 1 < currentSteps.length) show(stepIndex + 1);
      else teardown();
    },
    prev: function () {
      if (!active) return;
      if (stepIndex > 0) show(stepIndex - 1);
    },
    end: teardown,
    isActive: function () { return active; }
  };

  window.startTour = function (customSteps) {
    window._tour.start(customSteps);
  };
})();
