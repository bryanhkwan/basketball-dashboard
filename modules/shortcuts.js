// ============ KEYBOARD SHORTCUTS MODULE ============
// Global keyboard shortcuts for power users.
// Dependencies: teambuilder.js (showDashboardPage, tbGetAllPlayers),
//               profile.js (openProfile), help.js (HelpPanel), data.js (switchLeague, league)

(function () {
  'use strict';

  var PAGE_KEYS = {
    '1': 'pagePlayers',
    '2': 'pagePortal',
    '3': 'pageTeams',
    '4': 'pageValueLab',
    '5': 'pageLab',
    '6': 'pageFavorites',
    '7': 'pageCollaborate',
  };

  var quickSearchOpen = false;
  var quickSearchOverlay, quickSearchInput, quickSearchResults;
  var qsAllPlayers = [];
  var qsFiltered = [];
  var qsActiveIdx = -1;

  function isInputFocused() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  }

  // --- Quick Search overlay ---

  function buildOverlay() {
    if (quickSearchOverlay) return;
    quickSearchOverlay = document.createElement('div');
    quickSearchOverlay.className = 'qs-overlay';
    quickSearchOverlay.innerHTML =
      '<div class="qs-box">' +
        '<input class="qs-input" type="text" placeholder="Search players, teams, conferences\u2026" autocomplete="off" spellcheck="false">' +
        '<div class="qs-results"></div>' +
        '<div class="qs-hint">&#8593;&#8595; navigate &middot; Enter select &middot; Esc close</div>' +
      '</div>';
    document.body.appendChild(quickSearchOverlay);

    quickSearchInput = quickSearchOverlay.querySelector('.qs-input');
    quickSearchResults = quickSearchOverlay.querySelector('.qs-results');

    quickSearchOverlay.addEventListener('mousedown', function (e) {
      if (e.target === quickSearchOverlay) closeQuickSearch();
    });

    quickSearchResults.addEventListener('mousedown', qsHandleClick);
    quickSearchResults.addEventListener('mouseover', qsHandleHover);

    quickSearchInput.addEventListener('input', function () {
      filterQuickSearch(quickSearchInput.value);
    });

    quickSearchInput.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        qsActiveIdx = Math.min(qsActiveIdx + 1, qsFiltered.length - 1);
        renderQSResults();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        qsActiveIdx = Math.max(qsActiveIdx - 1, 0);
        renderQSResults();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectQSResult(qsActiveIdx);
      }
    });
  }

  function openQuickSearch() {
    buildOverlay();
    qsAllPlayers = (typeof tbGetAllPlayers === 'function') ? tbGetAllPlayers() : [];
    qsFiltered = qsAllPlayers.slice(0, 12);
    qsActiveIdx = 0;
    quickSearchInput.value = '';
    renderQSResults();
    quickSearchOverlay.classList.add('qs-visible');
    quickSearchOpen = true;
    requestAnimationFrame(function () { quickSearchInput.focus(); });
  }

  function closeQuickSearch() {
    if (!quickSearchOverlay) return;
    quickSearchOverlay.classList.remove('qs-visible');
    quickSearchOpen = false;
  }

  function filterQuickSearch(q) {
    var term = (q || '').trim().toLowerCase();
    if (!term) {
      qsFiltered = qsAllPlayers.slice(0, 12);
    } else {
      qsFiltered = [];
      for (var i = 0; i < qsAllPlayers.length && qsFiltered.length < 12; i++) {
        var p = qsAllPlayers[i];
        var name = (p.Player || '').toLowerCase();
        var team = (p.Team || '').toLowerCase();
        var conf = (p.Conference || '').toLowerCase();
        if (name.indexOf(term) !== -1 || team.indexOf(term) !== -1 || conf.indexOf(term) !== -1) {
          qsFiltered.push(p);
        }
      }
    }
    qsActiveIdx = qsFiltered.length ? 0 : -1;
    renderQSResults();
  }

  function renderQSResults(highlightOnly) {
    if (!quickSearchResults) return;
    if (!qsFiltered.length) {
      quickSearchResults.innerHTML = '<div class="qs-empty">No results</div>';
      return;
    }

    if (highlightOnly) {
      var rows = quickSearchResults.querySelectorAll('.qs-row');
      for (var r = 0; r < rows.length; r++) {
        rows[r].classList.toggle('qs-active', r === qsActiveIdx);
      }
      var active = quickSearchResults.querySelector('.qs-active');
      if (active) active.scrollIntoView({ block: 'nearest' });
      return;
    }

    var html = '';
    for (var i = 0; i < qsFiltered.length; i++) {
      var p = qsFiltered[i];
      var cls = i === qsActiveIdx ? 'qs-row qs-active' : 'qs-row';
      var score = p.PerfScore_calc != null ? parseFloat(p.PerfScore_calc).toFixed(1) : '';
      html += '<div class="' + cls + '" data-idx="' + i + '">' +
        '<span class="qs-name">' + _escAttr(p.Player || '') + '</span>' +
        '<span class="qs-meta">' + _escAttr(p.Team || '') + (p.Conference ? ' &middot; ' + _escAttr(p.Conference) : '') + '</span>' +
        (score ? '<span class="qs-score">' + score + '</span>' : '') +
      '</div>';
    }
    quickSearchResults.innerHTML = html;

    var active = quickSearchResults.querySelector('.qs-active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function qsHandleClick(e) {
    var row = e.target.closest('.qs-row');
    if (!row) return;
    e.preventDefault();
    selectQSResult(parseInt(row.dataset.idx, 10));
  }

  function qsHandleHover(e) {
    var row = e.target.closest('.qs-row');
    if (!row) return;
    var idx = parseInt(row.dataset.idx, 10);
    if (idx !== qsActiveIdx) {
      qsActiveIdx = idx;
      renderQSResults(true);
    }
  }

  function _escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function selectQSResult(idx) {
    if (idx < 0 || idx >= qsFiltered.length) return;
    var player = qsFiltered[idx];
    closeQuickSearch();
    if (typeof openProfile === 'function') {
      openProfile(player);
    }
  }

  // --- Escape handler (closes topmost overlay) ---

  function closeTopmostOverlay() {
    if (quickSearchOpen) { closeQuickSearch(); return true; }
    if (window.HelpPanel && window.HelpPanel.isOpen && window.HelpPanel.isOpen()) {
      window.HelpPanel.close();
      return true;
    }
    var profileBack = document.getElementById('profileModalBack');
    if (profileBack && profileBack.style.display !== 'none') {
      if (typeof closeProfile === 'function') closeProfile();
      return true;
    }
    var aiPanel = document.getElementById('aiPanel');
    if (aiPanel && aiPanel.classList.contains('open')) {
      var aiToggle = document.getElementById('aiToggle');
      if (aiToggle) aiToggle.click();
      return true;
    }
    return false;
  }

  // --- Main keydown handler ---

  function onKeyDown(e) {
    // Escape always works
    if (e.key === 'Escape') {
      if (closeTopmostOverlay()) { e.preventDefault(); return; }
    }

    // Ctrl/Cmd+K: quick search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (quickSearchOpen) closeQuickSearch();
      else openQuickSearch();
      return;
    }

    // Everything below requires no input focused
    if (isInputFocused()) return;

    // Number keys 1-7: page nav
    if (PAGE_KEYS[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (typeof showDashboardPage === 'function') showDashboardPage(PAGE_KEYS[e.key]);
      return;
    }

    // ? : open help
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (window.HelpPanel && typeof window.HelpPanel.open === 'function') {
        window.HelpPanel.open();
      }
      return;
    }

    // L : toggle league
    if (e.key === 'l' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (typeof switchLeague === 'function' && typeof league !== 'undefined') {
        switchLeague(league === 'MBB' ? 'WBB' : 'MBB');
        var sw = document.getElementById('leagueSwitchInput');
        if (sw) sw.checked = (league === 'WBB');
      }
      return;
    }
  }

  document.addEventListener('keydown', onKeyDown);

  window.KeyboardShortcuts = {
    openQuickSearch: openQuickSearch,
    closeQuickSearch: closeQuickSearch
  };
})();
