// ============ CBDATA MODULE ============
// Live college basketball data via Cloudflare Worker proxy
// All endpoints from api.collegebasketballdata.com
// Dependencies: none (standalone module)

var CB_PROXY_BASE = 'https://hidden-salad-773b.bryanhkwan.workers.dev/api/proxy';
var CB_WORKER_BASE = CB_PROXY_BASE.replace(/\/api\/proxy$/, '');

// ── Endpoint definitions ─────────────────────────────────────────────────────
// Each entry: { id, label, path, pathParams, queryParams, description }
// pathParams: parts of the URL that get substituted e.g. {gameId}
// queryParams: array of { key, label, type, required, placeholder }

var CB_ENDPOINT_GROUPS = [
  {
    group: '🎮 Games',
    endpoints: [
      {
        id: 'games',
        label: 'Games',
        path: '/games',
        description: 'Game results & metadata (up to 3000 per request)',
        queryParams: [
          { key: 'year',       label: 'Year',        type: 'number', placeholder: '2025' },
          { key: 'seasonType', label: 'Season Type', type: 'select', options: ['regular','postseason','both'] },
          { key: 'team',       label: 'Team',        type: 'text',   placeholder: 'Toledo' },
          { key: 'conference', label: 'Conference',  type: 'text',   placeholder: 'MAC' },
          { key: 'home',       label: 'Home Team',   type: 'text',   placeholder: 'Bowling Green' },
          { key: 'away',       label: 'Away Team',   type: 'text',   placeholder: 'Bowling Green' },
          { key: 'id',         label: 'Game ID',     type: 'number', placeholder: '' },
        ]
      },
      {
        id: 'games_teams',
        label: 'Game Team Stats',
        path: '/games/teams',
        description: 'Team box score stats per game',
        queryParams: [
          { key: 'year',       label: 'Year',        type: 'number', placeholder: '2025' },
          { key: 'seasonType', label: 'Season Type', type: 'select', options: ['regular','postseason','both'] },
          { key: 'team',       label: 'Team',        type: 'text',   placeholder: 'Toledo' },
          { key: 'conference', label: 'Conference',  type: 'text',   placeholder: 'MAC' },
          { key: 'gameId',     label: 'Game ID',     type: 'number', placeholder: '' },
        ]
      },
      {
        id: 'games_players',
        label: 'Game Player Stats',
        path: '/games/players',
        description: 'Player box score stats per game (up to 1000)',
        queryParams: [
          { key: 'year',       label: 'Year',        type: 'number', placeholder: '2025' },
          { key: 'seasonType', label: 'Season Type', type: 'select', options: ['regular','postseason','both'] },
          { key: 'team',       label: 'Team',        type: 'text',   placeholder: 'Toledo' },
          { key: 'conference', label: 'Conference',  type: 'text',   placeholder: 'MAC' },
          { key: 'gameId',     label: 'Game ID',     type: 'number', placeholder: '' },
        ]
      },
      {
        id: 'games_media',
        label: 'Game Broadcasts',
        path: '/games/media',
        description: 'TV/broadcast info per game',
        queryParams: [
          { key: 'year',       label: 'Year',        type: 'number', placeholder: '2025' },
          { key: 'seasonType', label: 'Season Type', type: 'select', options: ['regular','postseason','both'] },
          { key: 'team',       label: 'Team',        type: 'text',   placeholder: 'Toledo' },
          { key: 'conference', label: 'Conference',  type: 'text',   placeholder: 'MAC' },
        ]
      },
    ]
  },
  {
    group: '📊 Stats',
    endpoints: [
      {
        id: 'stats_player_season',
        label: 'Player Season Stats',
        path: '/stats/player/season',
        description: 'Full player season statistics',
        queryParams: [
          { key: 'year',       label: 'Year',        type: 'number', placeholder: '2025' },
          { key: 'team',       label: 'Team',        type: 'text',   placeholder: 'Toledo' },
          { key: 'conference', label: 'Conference',  type: 'text',   placeholder: 'MAC' },
          { key: 'playerId',   label: 'Player ID',   type: 'number', placeholder: '' },
        ]
      },
      {
        id: 'stats_player_shooting',
        label: 'Player Shooting Stats',
        path: '/stats/player/shooting/season',
        description: 'Shooting splits by season',
        queryParams: [
          { key: 'year',       label: 'Year',        type: 'number', placeholder: '2025' },
          { key: 'team',       label: 'Team',        type: 'text',   placeholder: 'Toledo' },
          { key: 'conference', label: 'Conference',  type: 'text',   placeholder: 'MAC' },
          { key: 'playerId',   label: 'Player ID',   type: 'number', placeholder: '' },
        ]
      },
      {
        id: 'stats_team_season',
        label: 'Team Season Stats',
        path: '/stats/team/season',
        description: 'Team aggregate season statistics',
        queryParams: [
          { key: 'year',       label: 'Year',        type: 'number', placeholder: '2025' },
          { key: 'team',       label: 'Team',        type: 'text',   placeholder: 'Toledo' },
          { key: 'conference', label: 'Conference',  type: 'text',   placeholder: 'MAC' },
        ]
      },
      {
        id: 'stats_team_shooting',
        label: 'Team Shooting Stats',
        path: '/stats/team/shooting/season',
        description: 'Team shooting splits by season',
        queryParams: [
          { key: 'year',       label: 'Year',        type: 'number', placeholder: '2025' },
          { key: 'team',       label: 'Team',        type: 'text',   placeholder: 'Toledo' },
          { key: 'conference', label: 'Conference',  type: 'text',   placeholder: 'MAC' },
        ]
      },
    ]
  },
  {
    group: '🏀 Teams',
    endpoints: [
      {
        id: 'teams',
        label: 'Teams',
        path: '/teams',
        description: 'Historical team information',
        queryParams: [
          { key: 'conference', label: 'Conference', type: 'text', placeholder: 'MAC' },
          { key: 'year',       label: 'Year',       type: 'number', placeholder: '2025' },
        ]
      },
      {
        id: 'teams_roster',
        label: 'Team Roster',
        path: '/teams/roster',
        description: 'Player roster for a given team & year',
        queryParams: [
          { key: 'team', label: 'Team', type: 'text',   placeholder: 'Toledo', required: true },
          { key: 'year', label: 'Year', type: 'number', placeholder: '2025' },
        ]
      },
    ]
  },
  {
    group: '⭐ Ratings',
    endpoints: [
      {
        id: 'ratings_srs',
        label: 'SRS Ratings',
        path: '/ratings/srs',
        description: 'Simple Rating System ratings',
        queryParams: [
          { key: 'year',       label: 'Year',       type: 'number', placeholder: '2025' },
          { key: 'team',       label: 'Team',       type: 'text',   placeholder: 'Toledo' },
          { key: 'conference', label: 'Conference', type: 'text',   placeholder: 'MAC' },
        ]
      },
      {
        id: 'ratings_adjusted',
        label: 'Adjusted Efficiency',
        path: '/ratings/adjusted',
        description: 'Adjusted offensive/defensive efficiency ratings',
        queryParams: [
          { key: 'year',       label: 'Year',       type: 'number', placeholder: '2025' },
          { key: 'team',       label: 'Team',       type: 'text',   placeholder: 'Toledo' },
          { key: 'conference', label: 'Conference', type: 'text',   placeholder: 'MAC' },
        ]
      },
      {
        id: 'ratings_elo',
        label: 'Elo Ratings',
        path: '/ratings/elo',
        description: 'Historical Elo ratings',
        queryParams: [
          { key: 'year',       label: 'Year',       type: 'number', placeholder: '2025' },
          { key: 'team',       label: 'Team',       type: 'text',   placeholder: 'Toledo' },
          { key: 'conference', label: 'Conference', type: 'text',   placeholder: 'MAC' },
        ]
      },
    ]
  },
  {
    group: '🏆 Rankings',
    endpoints: [
      {
        id: 'rankings',
        label: 'Poll Rankings',
        path: '/rankings',
        description: 'Historical AP/Coaches poll rankings',
        queryParams: [
          { key: 'year',       label: 'Year',        type: 'number', placeholder: '2025' },
          { key: 'seasonType', label: 'Season Type', type: 'select', options: ['regular','postseason'] },
        ]
      },
    ]
  },
  {
    group: '🎓 Recruiting',
    endpoints: [
      {
        id: 'recruiting_players',
        label: 'Recruiting Rankings',
        path: '/recruiting/players',
        description: 'Composite player recruiting rankings & ratings',
        queryParams: [
          { key: 'year',     label: 'Year',     type: 'number', placeholder: '2025' },
          { key: 'team',     label: 'Team',     type: 'text',   placeholder: 'Toledo' },
          { key: 'position', label: 'Position', type: 'text',   placeholder: 'G' },
        ]
      },
    ]
  },
  {
    group: '💰 Lines',
    endpoints: [
      {
        id: 'lines',
        label: 'Betting Lines',
        path: '/lines',
        description: 'Betting lines / spreads / totals (up to 3000)',
        queryParams: [
          { key: 'year',       label: 'Year',        type: 'number', placeholder: '2025' },
          { key: 'seasonType', label: 'Season Type', type: 'select', options: ['regular','postseason','both'] },
          { key: 'team',       label: 'Team',        type: 'text',   placeholder: 'Toledo' },
          { key: 'conference', label: 'Conference',  type: 'text',   placeholder: 'MAC' },
          { key: 'gameId',     label: 'Game ID',     type: 'number', placeholder: '' },
          { key: 'provider',   label: 'Provider',    type: 'text',   placeholder: 'ESPN Bet' },
        ]
      },
      {
        id: 'lines_providers',
        label: 'Line Providers',
        path: '/lines/providers',
        description: 'Available betting line providers',
        queryParams: []
      },
    ]
  },
  {
    group: '📋 Lineups',
    endpoints: [
      {
        id: 'lineups_team',
        label: 'Team Lineups',
        path: '/lineups/team',
        description: 'Lineup stats for a given team and season',
        queryParams: [
          { key: 'team', label: 'Team', type: 'text',   placeholder: 'Toledo', required: true },
          { key: 'year', label: 'Year', type: 'number', placeholder: '2025',   required: true },
        ]
      },
      {
        id: 'lineups_game',
        label: 'Game Lineups',
        path: '/lineups/game/{gameId}',
        description: 'Lineup stats for a specific game',
        pathParams: [{ key: 'gameId', label: 'Game ID', type: 'number', placeholder: '12345', required: true }],
        queryParams: []
      },
    ]
  },
  {
    group: '🎯 Plays',
    endpoints: [
      {
        id: 'plays_game',
        label: 'Game Play-by-Play',
        path: '/plays/game/{gameId}',
        description: 'All plays for a given game',
        pathParams: [{ key: 'gameId', label: 'Game ID', type: 'number', placeholder: '12345', required: true }],
        queryParams: []
      },
      {
        id: 'plays_player',
        label: 'Player Plays',
        path: '/plays/player/{playerId}',
        description: 'All plays for a player in a season',
        pathParams: [{ key: 'playerId', label: 'Player ID', type: 'number', placeholder: '', required: true }],
        queryParams: [
          { key: 'year', label: 'Year', type: 'number', placeholder: '2025', required: true },
        ]
      },
      {
        id: 'plays_team',
        label: 'Team Plays',
        path: '/plays/team',
        description: 'All plays for a team in a season',
        queryParams: [
          { key: 'team', label: 'Team', type: 'text',   placeholder: 'Toledo', required: true },
          { key: 'year', label: 'Year', type: 'number', placeholder: '2025',   required: true },
        ]
      },
      {
        id: 'plays_date',
        label: 'Plays by Date',
        path: '/plays/date',
        description: 'All plays on a given UTC date',
        queryParams: [
          { key: 'date', label: 'Date (YYYY-MM-DD)', type: 'text', placeholder: '2025-03-01', required: true },
        ]
      },
      {
        id: 'plays_tournament',
        label: 'Tournament Plays',
        path: '/plays/tournament',
        description: 'All plays for a given tournament and season',
        queryParams: [
          { key: 'year',       label: 'Year',       type: 'number', placeholder: '2025', required: true },
          { key: 'tournament', label: 'Tournament', type: 'text',   placeholder: 'ncaa' },
        ]
      },
      {
        id: 'plays_types',
        label: 'Play Types',
        path: '/plays/types',
        description: 'List of all play type identifiers',
        queryParams: []
      },
    ]
  },
  {
    group: '🔄 Substitutions',
    endpoints: [
      {
        id: 'subs_game',
        label: 'Game Substitutions',
        path: '/substitutions/game/{gameId}',
        description: 'All player substitutions in a game',
        pathParams: [{ key: 'gameId', label: 'Game ID', type: 'number', placeholder: '12345', required: true }],
        queryParams: []
      },
      {
        id: 'subs_player',
        label: 'Player Substitutions',
        path: '/substitutions/player/{playerId}',
        description: 'All substitutions for a player in a season',
        pathParams: [{ key: 'playerId', label: 'Player ID', type: 'number', placeholder: '', required: true }],
        queryParams: [
          { key: 'year', label: 'Year', type: 'number', placeholder: '2025', required: true },
        ]
      },
      {
        id: 'subs_team',
        label: 'Team Substitutions',
        path: '/substitutions/team',
        description: 'All substitutions for a team in a season',
        queryParams: [
          { key: 'team', label: 'Team', type: 'text',   placeholder: 'Toledo', required: true },
          { key: 'year', label: 'Year', type: 'number', placeholder: '2025',   required: true },
        ]
      },
    ]
  },
  {
    group: '🏈 Draft',
    endpoints: [
      {
        id: 'draft_picks',
        label: 'Draft Picks',
        path: '/draft/picks',
        description: 'NBA draft pick history',
        queryParams: [
          { key: 'year',     label: 'Year',     type: 'number', placeholder: '2025' },
          { key: 'team',     label: 'Team',     type: 'text',   placeholder: 'Toledo' },
          { key: 'position', label: 'Position', type: 'text',   placeholder: 'G' },
        ]
      },
      {
        id: 'draft_teams',
        label: 'NBA Teams',
        path: '/draft/teams',
        description: 'List of NBA teams',
        queryParams: []
      },
      {
        id: 'draft_positions',
        label: 'Draft Positions',
        path: '/draft/positions',
        description: 'List of draft position names',
        queryParams: []
      },
    ]
  },
  {
    group: '🏟 Venues',
    endpoints: [
      {
        id: 'venues',
        label: 'Venues',
        path: '/venues',
        description: 'All available venue information',
        queryParams: []
      },
    ]
  },
];

// ── Flat lookup map ──────────────────────────────────────────────────────────
var _cbEndpointMap = {};
CB_ENDPOINT_GROUPS.forEach(function(g){
  g.endpoints.forEach(function(ep){
    _cbEndpointMap[ep.id] = ep;
  });
});

// ── State ────────────────────────────────────────────────────────────────────
var _cbCurrentEndpoint = null;
var _cbResults = null;
var _cbLoading  = false;
var _cbPage = 0;
var CB_PAGE_SIZE = 50;

// ── Fetch helper ─────────────────────────────────────────────────────────────
function _cbBuildQuery(params) {
  var qs = '';
  if (params && Object.keys(params).length) {
    var parts = [];
    Object.keys(params).forEach(function(k) {
      if (params[k] !== '' && params[k] !== null && params[k] !== undefined) {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
    });
    if (parts.length) qs = '?' + parts.join('&');
  }
  return qs;
}

function _cbFilterRows(rows, predicate) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(predicate);
}

function _cbUseCachedRoute(path, params) {
  var year = params && params.year ? String(params.year).trim() : '';
  var team = params && params.team ? String(params.team).trim() : '';
  var gameId = params && params.gameId ? String(params.gameId).trim() : '';
  var pathGameMatch = String(path || '').match(/^\/plays\/game\/([^/?#]+)/);
  if (!gameId && pathGameMatch && pathGameMatch[1]) gameId = decodeURIComponent(pathGameMatch[1]);

  switch (path) {
    case '/stats/player/season':
      if (!year) return null;
      if (params.team || params.conference || params.playerId) {
        return {
          url: CB_WORKER_BASE + '/api/cbdata/players?season=' + encodeURIComponent(year),
          pick: function(data) {
            var rows = Array.isArray(data && data.players) ? data.players : [];
            return _cbFilterRows(rows, function(row) {
              if (params.team && String(row.Team || '').toLowerCase() !== String(params.team).toLowerCase()) return false;
              if (params.conference && String(row.Conference || '').toLowerCase() !== String(params.conference).toLowerCase()) return false;
              if (params.playerId) return false;
              return true;
            });
          }
        };
      }
      return {
        url: CB_WORKER_BASE + '/api/cbdata/players?season=' + encodeURIComponent(year),
        pick: function(data) { return Array.isArray(data && data.players) ? data.players : []; }
      };

    case '/stats/player/shooting/season':
      if (!year || !team || params.conference || params.playerId) return null;
      return {
        url: CB_WORKER_BASE + '/api/cbdata/shooting?season=' + encodeURIComponent(year) + '&team=' + encodeURIComponent(team),
        pick: function(data) { return Array.isArray(data && data.players) ? data.players : []; }
      };

    case '/stats/team/season':
      if (!year || !team || params.conference) return null;
      return {
        url: CB_WORKER_BASE + '/api/cbdata/teamstats?season=' + encodeURIComponent(year) + '&team=' + encodeURIComponent(team),
        pick: function(data) {
          return data && data.stats ? [data.stats] : [];
        }
      };

    case '/stats/team/shooting/season':
      if (!year || !team || params.conference) return null;
      return {
        url: CB_WORKER_BASE + '/api/cbdata/teamshooting?season=' + encodeURIComponent(year) + '&team=' + encodeURIComponent(team),
        pick: function(data) {
          return data && data.shooting ? [data.shooting] : [];
        }
      };

    case '/games':
      if (!year || !team || params.conference || params.home || params.away || params.id || params.seasonType) return null;
      return {
        url: CB_WORKER_BASE + '/api/cbdata/games?season=' + encodeURIComponent(year) + '&team=' + encodeURIComponent(team),
        pick: function(data) { return Array.isArray(data && data.games) ? data.games : []; }
      };

    case '/games/teams':
      if (!year || !team || params.conference || params.gameId || params.seasonType) return null;
      return {
        url: CB_WORKER_BASE + '/api/cbdata/games?season=' + encodeURIComponent(year) + '&team=' + encodeURIComponent(team),
        pick: function(data) { return Array.isArray(data && data.teamStats) ? data.teamStats : []; }
      };

    case '/ratings/srs':
    case '/ratings/adjusted':
      if (!year) return null;
      return {
        url: CB_WORKER_BASE + '/api/cbdata/ratings?season=' + encodeURIComponent(year),
        pick: function(data) {
          var rows = Array.isArray(data && data.teams) ? data.teams : [];
          return _cbFilterRows(rows, function(row) {
            if (params.team && String(row.team || '').toLowerCase() !== String(params.team).toLowerCase()) return false;
            if (params.conference && String(row.conference || '').toLowerCase() !== String(params.conference).toLowerCase()) return false;
            return true;
          });
        }
      };

    case '/recruiting/players':
      if (!year) return null;
      return {
        url: CB_WORKER_BASE + '/api/cbdata/recruiting?seasons=' + encodeURIComponent(year),
        pick: function(data) {
          var rows = Array.isArray(data && data.recruits) ? data.recruits : [];
          return _cbFilterRows(rows, function(row) {
            if (params.team && String(row.team || '').toLowerCase() !== String(params.team).toLowerCase()) return false;
            if (params.position && String(row.position || '').toLowerCase() !== String(params.position).toLowerCase()) return false;
            return true;
          });
        }
      };

    case '/draft/picks':
      if (!year) return null;
      return {
        url: CB_WORKER_BASE + '/api/cbdata/draft?year=' + encodeURIComponent(year),
        pick: function(data) {
          var rows = Array.isArray(data && data.picks) ? data.picks : [];
          return _cbFilterRows(rows, function(row) {
            if (params.team && String(row.collegeTeam || '').toLowerCase() !== String(params.team).toLowerCase()) return false;
            if (params.position && String(row.position || '').toLowerCase() !== String(params.position).toLowerCase()) return false;
            return true;
          });
        }
      };
  }

  if (gameId && String(path || '').indexOf('/plays/game/') === 0) {
    return {
      url: CB_WORKER_BASE + '/api/cbdata/plays?gameId=' + encodeURIComponent(gameId),
      pick: function(data) { return Array.isArray(data && data.plays) ? data.plays : []; }
    };
  }

  return null;
}

async function cbFetch(path, params) {
  var cached = _cbUseCachedRoute(path, params || {});
  if (cached && cached.url) {
    var cachedResp = await fetch(cached.url);
    if (!cachedResp.ok) {
      var cachedErrText = await cachedResp.text();
      throw new Error('HTTP ' + cachedResp.status + ': ' + cachedErrText.slice(0, 200));
    }
    var cachedData = await cachedResp.json();
    return typeof cached.pick === 'function' ? cached.pick(cachedData) : cachedData;
  }

  var qs = _cbBuildQuery(params);
  var url = CB_PROXY_BASE + path + qs;
  var resp = await fetch(url);
  if(!resp.ok){
    var errText = await resp.text();
    throw new Error('HTTP ' + resp.status + ': ' + errText.slice(0, 200));
  }
  return resp.json();
}

// ── DOM helpers ──────────────────────────────────────────────────────────────
function _cbEl(id){ return document.getElementById(id); }

function _renderGroupTabs() {
  var el = _cbEl('cbGroupTabs');
  if(!el) return;
  el.innerHTML = CB_ENDPOINT_GROUPS.map(function(g, gi){
    return '<button class="cbGroupBtn" data-gi="' + gi + '">' + g.group + '</button>';
  }).join('');
  el.querySelectorAll('.cbGroupBtn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var gi = parseInt(btn.dataset.gi);
      _renderEndpointList(gi);
      el.querySelectorAll('.cbGroupBtn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });
  // Auto-select first group
  var first = el.querySelector('.cbGroupBtn');
  if(first){ first.click(); }
}

function _renderEndpointList(gi) {
  var group = CB_ENDPOINT_GROUPS[gi];
  var el = _cbEl('cbEndpointList');
  if(!el || !group) return;
  el.innerHTML = group.endpoints.map(function(ep){
    return '<button class="cbEpBtn" data-id="' + ep.id + '">' + ep.label + '</button>';
  }).join('');
  el.querySelectorAll('.cbEpBtn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var ep = _cbEndpointMap[btn.dataset.id];
      if(!ep) return;
      el.querySelectorAll('.cbEpBtn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      _renderQueryForm(ep);
    });
  });
  // Auto-select first
  var first = el.querySelector('.cbEpBtn');
  if(first) first.click();
}

function _renderQueryForm(ep) {
  _cbCurrentEndpoint = ep;
  _cbResults = null;
  _cbPage = 0;

  var descEl = _cbEl('cbEpDesc');
  if(descEl){
    descEl.innerHTML = '<span style="font-weight:700;font-size:14px">' + ep.label + '</span>'
      + '<span class="cbPathBadge">' + ep.path + '</span>'
      + '<span class="muted" style="font-size:12px;margin-left:8px">' + ep.description + '</span>';
  }

  var formEl = _cbEl('cbQueryForm');
  if(!formEl) return;

  var allParams = (ep.pathParams || []).concat(ep.queryParams || []);
  if(!allParams.length){
    formEl.innerHTML = '<span class="muted" style="font-size:12px">No parameters required.</span>';
  } else {
    formEl.innerHTML = allParams.map(function(p){
      var req = p.required ? '<span style="color:#ff6b6b">*</span>' : '';
      var input = '';
      if(p.type === 'select'){
        input = '<select id="cbp_' + p.key + '" class="cbParamInput" style="width:140px">'
          + '<option value="">Any</option>'
          + p.options.map(function(o){ return '<option value="' + o + '">' + o + '</option>'; }).join('')
          + '</select>';
      } else {
        input = '<input id="cbp_' + p.key + '" class="cbParamInput" type="' + (p.type === 'number' ? 'number' : 'text') + '"'
          + ' placeholder="' + (p.placeholder || '') + '"'
          + ' style="width:140px">';
      }
      return '<div class="cbParam">'
        + '<label class="cbParamLabel">' + p.label + req + '</label>'
        + input
        + '</div>';
    }).join('');
  }

  // Reset results area
  _renderResultsArea(null, null);
}

function _gatherParams(ep) {
  var params = {};
  var path = ep.path;
  (ep.pathParams || []).forEach(function(p){
    var el = document.getElementById('cbp_' + p.key);
    var val = el ? el.value.trim() : '';
    if(val) path = path.replace('{' + p.key + '}', encodeURIComponent(val));
    else path = path.replace('{' + p.key + '}', '');
  });
  (ep.queryParams || []).forEach(function(p){
    var el = document.getElementById('cbp_' + p.key);
    var val = el ? el.value.trim() : '';
    if(val) params[p.key] = val;
  });
  return { path: path, params: params };
}

function _renderResultsArea(data, err) {
  var el = _cbEl('cbResults');
  if(!el) return;

  if(err){
    el.innerHTML = '<div style="color:#ff6b6b;padding:16px;font-size:13px">❌ ' + err + '</div>';
    return;
  }
  if(data === null){
    el.innerHTML = '<div class="hint" style="text-align:center;padding:24px;opacity:.6">Run a query to see results.</div>';
    return;
  }
  if(!Array.isArray(data)){
    // Single object or non-array — render as key-value
    el.innerHTML = '<pre style="font-size:11px;overflow:auto;max-height:400px;padding:12px;background:rgba(0,10,28,.6);border-radius:8px;border:1px solid var(--line)">'
      + JSON.stringify(data, null, 2) + '</pre>';
    return;
  }
  if(!data.length){
    el.innerHTML = '<div class="hint" style="text-align:center;padding:24px;opacity:.6">No results returned. Try different parameters.</div>';
    return;
  }

  _cbResults = data;
  _cbPage = 0;
  _renderResultsTable();
}

function _renderResultsTable() {
  var el = _cbEl('cbResults');
  if(!el || !_cbResults) return;

  var data = _cbResults;
  var start = _cbPage * CB_PAGE_SIZE;
  var end   = Math.min(start + CB_PAGE_SIZE, data.length);
  var page  = data.slice(start, end);

  // Collect all keys from first ~5 rows for headers
  var keys = [];
  var seen = {};
  var sample = data.slice(0, Math.min(5, data.length));
  sample.forEach(function(row){
    Object.keys(row).forEach(function(k){
      if(!seen[k]){ seen[k] = true; keys.push(k); }
    });
  });

  var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">'
    + '<span class="pill">Total: <b>' + data.length + '</b></span>'
    + '<span class="muted" style="font-size:12px">Showing ' + (start+1) + '–' + end + '</span>'
    + '<div style="display:flex;gap:6px">'
    + '<button class="secondary" style="padding:5px 10px;font-size:11px" onclick="window._cbPrev()" ' + (start === 0 ? 'disabled' : '') + '>← Prev</button>'
    + '<button class="secondary" style="padding:5px 10px;font-size:11px" onclick="window._cbNext()" ' + (end >= data.length ? 'disabled' : '') + '>Next →</button>'
    + '<button class="secondary" style="padding:5px 10px;font-size:11px" onclick="window._cbExport()">⬇ CSV</button>'
    + '</div>'
    + '</div>';

  html += '<div style="overflow-x:auto"><table class="cbTable"><thead><tr>'
    + keys.map(function(k){ return '<th>' + k + '</th>'; }).join('')
    + '</tr></thead><tbody>';

  page.forEach(function(row){
    html += '<tr>' + keys.map(function(k){
      var v = row[k];
      if(v === null || v === undefined) v = '—';
      if(typeof v === 'object') v = JSON.stringify(v);
      return '<td>' + String(v) + '</td>';
    }).join('') + '</tr>';
  });

  html += '</tbody></table></div>';
  el.innerHTML = html;
}

// ── Pagination & export (exposed to window for inline onclick) ───────────────
window._cbPrev = function(){
  if(!_cbResults || _cbPage === 0) return;
  _cbPage--;
  _renderResultsTable();
};
window._cbNext = function(){
  if(!_cbResults) return;
  if((_cbPage + 1) * CB_PAGE_SIZE >= _cbResults.length) return;
  _cbPage++;
  _renderResultsTable();
};
window._cbExport = function(){
  if(!_cbResults || !_cbResults.length) return;
  var keys = Object.keys(_cbResults[0]);
  var csv = [keys.join(',')].concat(_cbResults.map(function(r){
    return keys.map(function(k){
      var v = r[k];
      if(v === null || v === undefined) v = '';
      if(typeof v === 'object') v = JSON.stringify(v);
      if(String(v).includes(',') || String(v).includes('"')) v = '"' + String(v).replace(/"/g,'""') + '"';
      return v;
    }).join(',');
  })).join('\n');
  var blob = new Blob([csv], {type:'text/csv'});
  var a  = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (_cbCurrentEndpoint ? _cbCurrentEndpoint.id : 'data') + '.csv';
  a.click();
};

// ── Run query (triggered by Run button) ─────────────────────────────────────
async function cbRunQuery() {
  if(!_cbCurrentEndpoint || _cbLoading) return;
  var { path, params } = _gatherParams(_cbCurrentEndpoint);
  var statusEl = _cbEl('cbStatus');
  var runBtn   = _cbEl('cbRunBtn');

  _cbLoading = true;
  if(runBtn) runBtn.disabled = true;
  if(statusEl) statusEl.textContent = 'Fetching…';

  var el = _cbEl('cbResults');
  if(el) el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted)">⏳ Loading…</div>';

  try {
    var data = await cbFetch(path, params);
    if(statusEl) statusEl.textContent = Array.isArray(data) ? data.length + ' rows' : 'OK';
    _renderResultsArea(data, null);
  } catch(e){
    if(statusEl) statusEl.textContent = 'Error';
    _renderResultsArea(null, e.message);
  } finally {
    _cbLoading = false;
    if(runBtn) runBtn.disabled = false;
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
function initCBData() {
  _renderGroupTabs();

  var runBtn = _cbEl('cbRunBtn');
  if(runBtn) runBtn.addEventListener('click', cbRunQuery);

  // Allow Enter key in any param input to trigger query
  document.addEventListener('keydown', function(e){
    if(e.key === 'Enter' && document.getElementById('pageCBData') && document.getElementById('pageCBData').style.display !== 'none'){
      var active = document.activeElement;
      if(active && active.classList.contains('cbParamInput')) cbRunQuery();
    }
  });
}

window.CBData = { init: initCBData, fetch: cbFetch };
