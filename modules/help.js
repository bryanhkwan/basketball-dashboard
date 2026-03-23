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
    var steps = Array.isArray(content.tourSteps) ? content.tourSteps : [];
    var isMethodologyPage = state.currentPageId === 'pageMethodology';

    refs.badge.textContent = 'Help - ' + (content.title || 'Current Page');
    refs.title.textContent = content.title || 'Dashboard Help';
    refs.overview.textContent = content.overview || '';
    refs.tourMeta.textContent = steps.length
      ? steps.length + ' short stop' + (steps.length === 1 ? '' : 's') + ' focused only on this page.'
      : 'No tour stops are set up for this page yet.';
    refs.note.textContent = 'The drawer stays contextual so you do not have to sit through one giant dashboard tour.';
    refs.tourBtn.disabled = !steps.length;
    refs.tourBtn.classList.toggle('secondary', !steps.length);
    refs.tourBtn.classList.toggle('primary', !!steps.length);
    refs.tourBtn.textContent = steps.length ? 'Start Tour' : 'Tour Coming Soon';
    refs.methodologyBtn.disabled = false;
    refs.methodologyBtn.textContent = isMethodologyPage ? 'Scroll to Top of Methodology' : 'Open Full Methodology';

    renderMethodology(content.methodology || []);
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
    var steps = Array.isArray(content.tourSteps) ? content.tourSteps : [];
    if (!steps.length || !window._tour || typeof window._tour.start !== 'function') return;
    close();
    window._tour.start(steps);
  }

  function openFullMethodology() {
    close();
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
