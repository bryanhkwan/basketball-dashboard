(function () {
  'use strict';

  var state = {
    open: false,
    currentPageId: 'pagePlayers'
  };

  var refs = {
    backdrop: null,
    drawer: null,
    title: null,
    overview: null,
    badge: null,
    note: null,
    tourBtn: null,
    tourMeta: null,
    methodology: null,
    methodologyBtn: null,
    closeBtn: null
  };

  function getCurrentPageId() {
    return window._dashboardCurrentPageId || 'pagePlayers';
  }

  function getContent(pageId) {
    var all = window.DashboardHelpContent || {};
    return all[pageId] || all.fallback || {
      title: 'Dashboard Help',
      overview: 'Use the page tour for a quick walkthrough.',
      methodology: [],
      tourSteps: []
    };
  }

  function getGuestMethodologyCards(pageId, content) {
    if (pageId === 'pagePlayers') {
      return [
        {
          title: 'Scouting board',
          body: 'Players is the live ranking board for the selected league and position bucket, with profile access, Perf outputs, and valuation outputs still visible in demo mode.'
        },
        {
          title: 'Protected model controls',
          body: 'Guest mode keeps the public-facing results available, but the internal tuning controls for presets, weights, valuation, and conference multipliers stay behind approved staff access.'
        },
        {
          title: 'Best use',
          body: 'Use this page to understand the core scouting workflow, then branch into Transfer Portal, Team Hub, and Value Lab to see how those outputs feed the rest of the dashboard.'
        }
      ];
    }
    if (pageId === 'pageMethodology') {
      return [
        {
          title: 'Staff-only methodology',
          body: 'Full formulas, thresholds, and internal modeling notes are limited to approved staff accounts. Guest mode keeps the workflow tour and high-level page summaries available instead.'
        }
      ];
    }
    return Array.isArray(content.methodology) ? content.methodology.slice() : [];
  }

  function getTourStepsForPage(pageId, content) {
    var steps = Array.isArray(content && content.tourSteps) ? content.tourSteps.slice() : [];
    var isGuest = typeof authIsGuest === 'function' && authIsGuest();
    if (!isGuest) return steps;

    return steps.reduce(function (nextSteps, step) {
      if (!step) return nextSteps;
      var target = step.target ? String(step.target) : '';
      if (target === '#playersSettingsToggleBtn' && pageId === 'pagePlayers') {
        var guestStep = {};
        Object.keys(step).forEach(function (key) { guestStep[key] = step[key]; });
        guestStep.playersSettings = 'closed';
        guestStep.body = 'Model settings houses the internal presets, weights, valuation anchors, and conference multipliers. In guest demo mode, that tuning workspace stays locked to approved staff accounts.';
        nextSteps.push(guestStep);
        return nextSteps;
      }
      if (['#weightsCard', '#valuationCard', '#confMultCard', '#evalPresetsCard', '#pageMethodology'].indexOf(target) !== -1) {
        return nextSteps;
      }
      if (step.playersSettings === 'open') return nextSteps;
      nextSteps.push(step);
      return nextSteps;
    }, []);
  }

  function buildDom() {
    if (refs.drawer) return;

    refs.backdrop = document.createElement('div');
    refs.backdrop.className = 'helpPanelBackdrop';

    refs.drawer = document.createElement('aside');
    refs.drawer.className = 'helpPanelDrawer';
    refs.drawer.setAttribute('role', 'dialog');
    refs.drawer.setAttribute('aria-modal', 'true');
    refs.drawer.setAttribute('aria-labelledby', 'helpPanelTitle');
    refs.drawer.innerHTML = [
      '<div class="helpPanelHeader">',
      '  <div>',
      '    <div id="helpPanelBadge" class="helpPanelBadge">Page Help</div>',
      '    <div id="helpPanelTitle" class="helpPanelTitle"></div>',
      '    <div id="helpPanelOverview" class="helpPanelOverview"></div>',
      '  </div>',
      '  <button type="button" id="helpPanelCloseBtn" class="helpPanelClose" aria-label="Close help">x</button>',
      '</div>',
      '<div class="helpPanelBody">',
      '  <section class="helpPanelSection">',
      '    <div class="helpPanelSectionTitle">Tour This Page</div>',
      '    <div class="helpPanelTourRow">',
      '      <div>',
      '        <div class="helpPanelTourTitle">Short, page-only walkthrough</div>',
      '        <div id="helpPanelTourMeta" class="helpPanelTourMeta"></div>',
      '      </div>',
      '      <button type="button" id="helpPanelStartTourBtn" class="primary">Start Tour</button>',
      '    </div>',
      '    <div id="helpPanelTourNote" class="helpPanelTourNote"></div>',
      '  </section>',
      '  <section class="helpPanelSection">',
      '    <div class="helpPanelSectionHead">',
      '      <div class="helpPanelSectionTitle">How This Page Works</div>',
      '      <button type="button" id="helpPanelMethodologyBtn" class="secondary helpPanelMethodologyBtn">Open Full Methodology</button>',
      '    </div>',
      '    <div id="helpPanelMethodology" class="helpPanelMethodology"></div>',
      '  </section>',
      '</div>'
    ].join('');

    document.body.appendChild(refs.backdrop);
    document.body.appendChild(refs.drawer);

    refs.title = document.getElementById('helpPanelTitle');
    refs.overview = document.getElementById('helpPanelOverview');
    refs.badge = document.getElementById('helpPanelBadge');
    refs.note = document.getElementById('helpPanelTourNote');
    refs.tourBtn = document.getElementById('helpPanelStartTourBtn');
    refs.tourMeta = document.getElementById('helpPanelTourMeta');
    refs.methodology = document.getElementById('helpPanelMethodology');
    refs.methodologyBtn = document.getElementById('helpPanelMethodologyBtn');
    refs.closeBtn = document.getElementById('helpPanelCloseBtn');

    refs.backdrop.addEventListener('click', close);
    refs.closeBtn.addEventListener('click', close);
    refs.tourBtn.addEventListener('click', startCurrentPageTour);
    refs.methodologyBtn.addEventListener('click', openFullMethodology);
    document.addEventListener('keydown', onKeyDown);
  }

  function renderMethodology(cards) {
    if (!refs.methodology) return;
    if (!cards || !cards.length) {
      refs.methodology.innerHTML = '<div class="helpPanelMethodCard"><div class="helpPanelMethodTitle">No page-specific notes yet</div><div class="helpPanelMethodBody">Open the full Methodology page for the deeper reference in the meantime.</div></div>';
      return;
    }
    refs.methodology.innerHTML = cards.map(function (card) {
      return [
        '<div class="helpPanelMethodCard">',
        '  <div class="helpPanelMethodTitle">', card.title || 'Note', '</div>',
        '  <div class="helpPanelMethodBody">', card.body || '', '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  function render(pageId) {
    buildDom();
    state.currentPageId = pageId || getCurrentPageId();

    var content = getContent(state.currentPageId);
    var steps = getTourStepsForPage(state.currentPageId, content);
    var isMethodologyPage = state.currentPageId === 'pageMethodology';
    var isGuest = typeof authIsGuest === 'function' && authIsGuest();
    var methodologyCards = isGuest
      ? getGuestMethodologyCards(state.currentPageId, content)
      : (Array.isArray(content.methodology) ? content.methodology.slice() : []);
    if (isGuest) {
      methodologyCards.push({
        title: 'Internal model details',
        body: 'Guest mode keeps the page guide high-level. Exact methodology, tuning logic, and internal decision rules stay limited to approved staff accounts.'
      });
    }

    refs.badge.textContent = 'Help - ' + (content.title || 'Current Page');
    refs.title.textContent = content.title || 'Dashboard Help';
    refs.overview.textContent = content.overview || '';
    refs.tourMeta.textContent = steps.length
      ? steps.length + ' short stop' + (steps.length === 1 ? '' : 's') + ' focused only on this page.'
      : 'No tour stops are set up for this page yet.';
    refs.note.textContent = isGuest
      ? 'Guest mode keeps the tour contextual while protecting deeper methodology and model-tuning internals.'
      : 'The drawer stays contextual so you do not have to sit through one giant dashboard tour.';
    refs.tourBtn.disabled = !steps.length;
    refs.tourBtn.classList.toggle('secondary', !steps.length);
    refs.tourBtn.classList.toggle('primary', !!steps.length);
    refs.tourBtn.textContent = steps.length ? 'Start Tour' : 'Tour Coming Soon';
    refs.methodologyBtn.disabled = isGuest;
    refs.methodologyBtn.title = isGuest ? 'Full methodology is reserved for approved staff accounts.' : '';
    refs.methodologyBtn.textContent = isGuest
      ? 'Staff methodology only'
      : (isMethodologyPage ? 'Scroll to Top of Methodology' : 'Open Full Methodology');

    renderMethodology(methodologyCards);
  }

  function open() {
    render(getCurrentPageId());
    state.open = true;
    refs.backdrop.classList.add('isOpen');
    refs.drawer.classList.add('isOpen');
    document.body.classList.add('helpPanelOpen');
  }

  function close() {
    if (!refs.drawer) return;
    state.open = false;
    refs.backdrop.classList.remove('isOpen');
    refs.drawer.classList.remove('isOpen');
    document.body.classList.remove('helpPanelOpen');
  }

  function startCurrentPageTour() {
    var content = getContent(state.currentPageId);
    var steps = getTourStepsForPage(state.currentPageId, content);
    if (!steps.length || !window._tour || typeof window._tour.start !== 'function') return;
    close();
    window._tour.start(steps);
  }

  function openFullMethodology() {
    close();
    if (typeof authIsGuest === 'function' && authIsGuest()) {
      if (typeof authPromptUpgrade === 'function') {
        authPromptUpgrade('Full methodology is limited to approved staff accounts. Guest mode keeps the workflow tour and high-level page notes available.');
      }
      return;
    }
    if (state.currentPageId === 'pageMethodology') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (window.TeamBuilder && typeof window.TeamBuilder.showDashboardPage === 'function') {
      window.TeamBuilder.showDashboardPage('pageMethodology', 'pageMethodology');
    } else {
      var methodPage = document.getElementById('pageMethodology');
      if (methodPage) methodPage.style.display = '';
      window._dashboardCurrentPageId = 'pageMethodology';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function refreshCurrentPage() {
    state.currentPageId = getCurrentPageId();
    if (state.open) render(state.currentPageId);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && state.open) close();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var trigger = document.getElementById('tourBtn');
    if (trigger) {
      trigger.addEventListener('click', open);
      trigger.setAttribute('title', 'Open help for this page');
      trigger.setAttribute('aria-label', 'Open help for this page');
    }
  });

  window.HelpPanel = {
    open: open,
    close: close,
    refreshCurrentPage: refreshCurrentPage,
    isOpen: function () { return state.open; }
  };
})();
