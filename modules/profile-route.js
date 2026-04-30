// ============ PROFILE ROUTE MODULE ============
// Supports standalone player links like:
//   index.html#player=Name&team=Team&view=report

(function () {
  'use strict';

  var routeTimer = null;
  var routeAttempts = 0;
  var lastOpenedKey = '';

  function parseParams() {
    var raw = location.hash && location.hash.length > 1 ? location.hash.slice(1) : '';
    var params = new URLSearchParams(raw);
    if (!params.get('player')) {
      var qs = new URLSearchParams(location.search || '');
      if (qs.get('player')) params = qs;
    }
    var player = params.get('player') || params.get('p') || '';
    var team = params.get('team') || params.get('t') || '';
    var view = params.get('view') || params.get('mode') || '';
    var targetLeague = (params.get('league') || params.get('lg') || '').toUpperCase();
    return {
      player: player.trim(),
      team: team.trim(),
      view: view.trim().toLowerCase(),
      league: targetLeague === 'WBB' ? 'WBB' : targetLeague === 'MBB' ? 'MBB' : ''
    };
  }

  function playerPoolReady() {
    try {
      return typeof tbGetAllPlayers === 'function' && tbGetAllPlayers().length > 0;
    } catch (_) {
      return false;
    }
  }

  function findPlayer(player, team, targetLeague) {
    if (window.ProfileDossier && typeof window.ProfileDossier.findPlayer === 'function') {
      return window.ProfileDossier.findPlayer(player, team, targetLeague);
    }
    if (typeof tbGetAllPlayers !== 'function') return null;
    var name = String(player || '').toLowerCase();
    var teamName = String(team || '').toLowerCase();
    return (tbGetAllPlayers(targetLeague || undefined) || []).find(function (row) {
      var rn = String(row.Player || '').toLowerCase();
      var rt = String(row.Team || '').toLowerCase();
      return rn === name && (!teamName || rt === teamName);
    }) || null;
  }

  function openRoute(params) {
    if (!params.player) return;
    if (params.league && typeof league !== 'undefined' && params.league !== league && typeof switchLeague === 'function') {
      switchLeague(params.league);
      routeAttempts += 1;
      routeTimer = setTimeout(function () { openRoute(params); }, 900);
      return;
    }
    var row = findPlayer(params.player, params.team, params.league);
    if (!row) {
      if (routeAttempts < 160) {
        routeAttempts += 1;
        routeTimer = setTimeout(function () { openRoute(params); }, playerPoolReady() ? 250 : 600);
      }
      return;
    }

    var openedKey = [row.Player || '', row.Team || '', params.league || '', params.view || 'modal', location.hash || location.search].join('|');
    if (openedKey === lastOpenedKey) return;
    lastOpenedKey = openedKey;

    if (params.view === 'report' && window.ProfileDossier && typeof window.ProfileDossier.open === 'function') {
      window.ProfileDossier.open(row, { skipHash: true });
    } else if (typeof openProfile === 'function') {
      openProfile(row);
    }
  }

  function handleRoute() {
    if (routeTimer) clearTimeout(routeTimer);
    routeAttempts = 0;
    var params = parseParams();
    if (!params.player) return;
    routeTimer = setTimeout(function () { openRoute(params); }, 80);
  }

  function setPlayerHash(row, view) {
    if (!row) return;
    var hash = window.ProfileDossier && typeof window.ProfileDossier.buildHash === 'function'
      ? window.ProfileDossier.buildHash(row, view)
      : '#player=' + encodeURIComponent(row.Player || '') + '&team=' + encodeURIComponent(row.Team || '') + '&league=' + encodeURIComponent(row._league || (typeof league !== 'undefined' ? league : 'MBB')) + (view ? '&view=' + encodeURIComponent(view) : '');
    if (location.hash !== hash) history.pushState(null, '', hash);
  }

  window.addEventListener('DOMContentLoaded', handleRoute);
  window.addEventListener('hashchange', handleRoute);

  window.ProfileRoute = {
    handle: handleRoute,
    setPlayerHash: setPlayerHash,
    parse: parseParams
  };
})();
