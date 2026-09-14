// Player measurements and listed positions. Shared by browser and refresh CLI.
// Records are scoped to one league + season. Missing measurements remain null.
var PlayerBios = (function () {
  'use strict';
  var VERSION = 1;
  var TTL = 7 * 24 * 60 * 60 * 1000;
  var RETRY_TTL = 10 * 60 * 1000;
  var PREFIX = 'ncaa-player-bios-v2:';
  var memory = {};
  var pending = {};
  var columns = ['espnId', 'cbdId', 'teamId', 'team', 'name', 'height', 'weight', 'heightSource', 'weightSource', 'classYear', 'hometown', 'listedPosition', 'positionSource'];

  function listedPosition(value) {
    if (value && typeof value === 'object') value = value.abbreviation || value.name || value.displayName;
    var label = String(value || '').trim();
    return label || null;
  }

  function knownPosition(value) {
    var label = listedPosition(value);
    return label && !/^(?:ATH|Athlete|NA|N\/A|Not Available|Unknown|-)$/i.test(label);
  }

  function normalizeName(value) {
    var name = String(value || '').toLowerCase();
    if (name.normalize) name = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Keep suffixes: John Smith and John Smith Jr. are different identities.
    return name.replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function normalizeHeight(value) {
    if (value === null || value === undefined || value === '') return null;
    var text = String(value).trim().toLowerCase();
    var feet = text.match(/^(\d)\s*(?:'|′|ft\.?|feet|-)\s*(\d{1,2})\s*(?:"|″|in\.?|inches)?$/);
    var inches;
    if (feet) {
      if (Number(feet[2]) >= 12) return null;
      inches = Number(feet[1]) * 12 + Number(feet[2]);
    } else if (/^\d+(?:\.\d+)?\s*cm$/.test(text)) {
      inches = parseFloat(text) / 2.54;
    } else if (/^\d+(?:\.\d+)?\s*m$/.test(text)) {
      inches = parseFloat(text) * 100 / 2.54;
    } else if (/^\d+(?:\.\d+)?\s*(?:inches|inch|in\.?|"|″)?$/.test(text)) {
      inches = parseFloat(text);
    }
    return Number.isFinite(inches) && inches >= 48 && inches <= 100 ? Math.round(inches * 10) / 10 : null;
  }

  function normalizeWeight(value) {
    if (value === null || value === undefined || value === '') return null;
    var text = String(value).trim().toLowerCase();
    var lbs;
    if (/^\d+(?:\.\d+)?\s*(?:kg|kilograms?)$/.test(text)) lbs = parseFloat(text) * 2.2046226218;
    else if (/^\d+(?:\.\d+)?\s*(?:lbs?\.?|pounds?)?$/.test(text)) lbs = parseFloat(text);
    return Number.isFinite(lbs) && lbs >= 70 && lbs <= 500 ? Math.round(lbs * 10) / 10 : null;
  }

  function context(league, season) {
    if (league !== 'MBB' && league !== 'WBB') throw new Error('Unknown player bio league');
    if (!/^20\d\d$/.test(String(season))) throw new Error('Invalid player bio season');
    return { league: league, season: Number(season), key: league + ':' + season };
  }

  function decode(snapshot) {
    return snapshot.records.map(function (row) {
      if (!Array.isArray(row)) return Object.assign({}, row);
      var record = {};
      (snapshot.columns || columns).forEach(function (key, index) { record[key] = row[index] === undefined ? null : row[index]; });
      ['heightSource', 'weightSource', 'positionSource'].forEach(function (key) {
        if (typeof record[key] === 'number') record[key] = (snapshot.sourceLabels || [])[record[key] - 1] || null;
      });
      return record;
    });
  }

  function validSnapshot(snapshot, ctx) {
    return !!(snapshot && snapshot.version === VERSION && snapshot.league === ctx.league && Number(snapshot.season) === ctx.season && Array.isArray(snapshot.records));
  }

  function teamAliases(snapshot) {
    var aliases = Object.create(null);
    (snapshot.teams || []).forEach(function (team) {
      var id = String(team[0] || '');
      (team.slice(1)).forEach(function (name) {
        var key = normalizeName(name);
        if (!key || !id) return;
        if (aliases[key] === undefined) aliases[key] = id;
        else if (aliases[key] !== id) aliases[key] = null;
      });
    });
    return aliases;
  }

  function indexRecords(snapshot) {
    var index = { ids: Object.create(null), cbd: Object.create(null), names: Object.create(null), aliases: teamAliases(snapshot) };
    function add(map, key, record) {
      if (!key) return;
      (map[key] || (map[key] = [])).push(record);
    }
    decode(snapshot).forEach(function (record) {
      if (!record || !record.name) return;
      add(index.ids, record.espnId && String(record.espnId), record);
      add(index.cbd, record.cbdId && String(record.cbdId), record);
      var name = normalizeName(record.name);
      if (record.teamId) add(index.names, 'id:' + record.teamId + '|' + name, record);
      if (record.team) add(index.names, 'name:' + normalizeName(record.team) + '|' + name, record);
    });
    return index;
  }

  function resolveRecord(player, index) {
    var id = String(player.EspnId || '');
    var cbdId = String(player.CbdId || player.CBDId || '');
    var team = normalizeName(player.Team || player.School);
    var teamId = String(player.TeamId || index.aliases[team] || '');
    var name = normalizeName(player.Player || player.Name);
    var candidates = id ? index.ids[id] : null;
    if ((!candidates || !candidates.length) && cbdId) candidates = index.cbd[cbdId];
    if (candidates && candidates.length) {
      candidates = candidates.filter(function (r) {
        return !(id && r.espnId && String(r.espnId) !== id) && !(cbdId && r.cbdId && String(r.cbdId) !== cbdId);
      });
      if (candidates.length === 1) return candidates[0];
      var sameTeam = candidates.filter(function (r) { return (teamId && String(r.teamId) === teamId) || (team && normalizeName(r.team) === team); });
      if (sameTeam.length === 1) return sameTeam[0];
      return null;
    }
    candidates = teamId ? index.names['id:' + teamId + '|' + name] : null;
    if (!candidates || !candidates.length) candidates = team ? index.names['name:' + team + '|' + name] : null;
    if (!candidates || candidates.length !== 1) return null;
    // A conflicting existing ESPN ID must never be replaced by a name match.
    if (id && candidates[0].espnId && String(candidates[0].espnId) !== id) return null;
    if (cbdId && candidates[0].cbdId && String(candidates[0].cbdId) !== cbdId) return null;
    return candidates[0];
  }

  function apply(players, snapshot, league, season) {
    var ctx = context(league, season);
    if (!validSnapshot(snapshot, ctx)) throw new Error('Player bio snapshot league/season mismatch');
    var index = indexRecords(snapshot);
    var stats = { total: players.length, matched: 0, height: 0, weight: 0, listedPosition: 0, updated: 0, records: snapshot.records.length, source: snapshot.source || 'snapshot', errors: snapshot.errors || [] };
    players.forEach(function (player) {
      if (!player) return;
      var rowLeague = player._league || player.League;
      var rowSeason = player._season || player.Season;
      if ((rowLeague && rowLeague !== league) || (rowSeason && Number(rowSeason) !== ctx.season)) return;
      var existingHeight = normalizeHeight(player.Height);
      var existingWeight = normalizeWeight(player.Weight);
      if (player.Height !== existingHeight) { player.Height = existingHeight; stats.updated++; }
      if (player.Weight !== existingWeight) { player.Weight = existingWeight; stats.updated++; }
      var record = resolveRecord(player, index);
      if (record) {
        stats.matched++;
        var height = normalizeHeight(record.height);
        var weight = normalizeWeight(record.weight);
        if (height !== null && normalizeHeight(player.Height) === null) {
          player.Height = height;
          player.HeightSource = record.heightSource || snapshot.source;
          player.BioSeason = ctx.season;
          player.BioUpdatedAt = snapshot.generatedAt;
          stats.updated++;
        }
        if (weight !== null && normalizeWeight(player.Weight) === null) {
          player.Weight = weight;
          player.WeightSource = record.weightSource || snapshot.source;
          player.BioSeason = ctx.season;
          player.BioUpdatedAt = snapshot.generatedAt;
          stats.updated++;
        }
        if (!player.EspnId && record.espnId) { player.EspnId = String(record.espnId); stats.updated++; }
        if (!player.CbdId && !player.CBDId && record.cbdId) { player.CbdId = String(record.cbdId); stats.updated++; }
        if (!player.Class && record.classYear) { player.Class = record.classYear; stats.updated++; }
        if (!player.Hometown && record.hometown) { player.Hometown = record.hometown; stats.updated++; }
        var position = listedPosition(record.listedPosition);
        if (position && (player.ListedPosition !== position || player.ListedPositionSource !== record.positionSource)) {
          player.ListedPosition = position;
          player.ListedPositionSource = record.positionSource || snapshot.source;
          stats.updated++;
        }
      }
      if (normalizeHeight(player.Height) !== null) stats.height++;
      if (normalizeWeight(player.Weight) !== null) stats.weight++;
      if (knownPosition(player.ListedPosition)) stats.listedPosition++;
    });
    return stats;
  }

  async function request(url, options) {
    var retries = options.retries === undefined ? 2 : Number(options.retries);
    for (var attempt = 0; ; attempt++) {
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, options.timeout || 18000);
      try {
        var response = await (options.fetch || fetch)(url, { signal: controller.signal, headers: options.headers || undefined });
        if (!response.ok) { var error = new Error('HTTP ' + response.status); error.status = response.status; throw error; }
        return await response.json();
      } catch (error) {
        var retryable = !error.status || error.status === 429 || error.status >= 500;
        if (!retryable || attempt >= retries) throw error;
        await new Promise(function (resolve) { setTimeout(resolve, 250 * Math.pow(2, attempt)); });
      } finally { clearTimeout(timeout); }
    }
  }

  async function pool(items, concurrency, job) {
    var cursor = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async function () {
      while (cursor < items.length) { var index = cursor++; await job(items[index], index); }
    }));
  }

  function sport(league) { return league === 'WBB' ? 'womens-college-basketball' : 'mens-college-basketball'; }
  function siteBase(league) { return 'https://site.web.api.espn.com/apis/site/v2/sports/basketball/' + sport(league); }
  function workerBase(options) {
    return options.workerUrl || (typeof URLS !== 'undefined' && URLS.WORKER) || 'https://hidden-salad-773b.bryanhkwan.workers.dev';
  }

  function pack(ctx, records, teams, errors, source) {
    var sourceLabels = [];
    var compactRecords = records.map(function (record) {
      var row = columns.map(function (key) {
        var value = record[key] === undefined || record[key] === '' ? null : record[key];
        if (key === 'heightSource' || key === 'weightSource' || key === 'positionSource') {
          var field = key === 'heightSource' ? 'height' : key === 'weightSource' ? 'weight' : 'listedPosition';
          if (record[field] === null || record[field] === undefined) return null;
          if (value) {
            if (sourceLabels.indexOf(value) < 0) sourceLabels.push(value);
            value = sourceLabels.indexOf(value) + 1;
          }
        }
        return value;
      });
      while (row.length && row[row.length - 1] === null) row.pop();
      return row;
    });
    return {
      version: VERSION, league: ctx.league, season: ctx.season, generatedAt: new Date().toISOString(),
      source: source, sources: (ctx.league === 'MBB' ? ['https://api.collegebasketballdata.com/teams/roster?season=' + ctx.season, 'https://api.collegebasketballdata.com/stats/player/season?season=' + ctx.season, siteBase(ctx.league) + '/teams'] : ['https://site.web.api.espn.com/apis/common/v3/sports/basketball/' + sport(ctx.league) + '/statistics/byathlete?season=' + ctx.season]).concat(['https://sports.core.api.espn.com/v3/sports/basketball/' + sport(ctx.league) + '/seasons/' + ctx.season + '/athletes', 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/' + sport(ctx.league) + '/seasons/' + ctx.season + '/athletes/{id}']),
      measurementNote: 'Season identifies the roster/statistics population. ESPN historical endpoints may return an athlete\'s updated bio; dimensions are listed values retrieved on generatedAt, not measurements verified for that season.',
      units: { height: 'in', weight: 'lb' }, columns: columns, sourceLabels: sourceLabels,
      coverage: { records: records.length, height: records.filter(function (r) { return r.height !== null; }).length, weight: records.filter(function (r) { return r.weight !== null; }).length, listedPosition: records.filter(function (r) { return knownPosition(r.listedPosition); }).length },
      complete: errors.length === 0, errors: errors, teams: teams,
      records: compactRecords
    };
  }

  async function espnBulk(ctx, options, errors, targets) {
    var statsBase = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/' + sport(ctx.league) + '/statistics/byathlete?season=' + ctx.season + '&limit=1000&page=';
    var coreBase = 'https://sports.core.api.espn.com/v3/sports/basketball/' + sport(ctx.league) + '/seasons/' + ctx.season + '/athletes?limit=1000&page=';
    var records = targets || [];
    var byId = Object.create(null);
    records.forEach(function (record) { if (record.espnId) (byId[record.espnId] || (byId[record.espnId] = [])).push(record); });
    var identities;
    try { identities = targets ? { athletes: [], pagination: { pages: 1 } } : await request(statsBase + '1', options); }
    catch (error) { errors.push('ESPN player identities: ' + error.message); return records; }
    function addIdentities(data) {
      if (!data || !Array.isArray(data.athletes)) throw new Error('Invalid ESPN identity page');
      (data.athletes || []).forEach(function (entry) {
        var athlete = entry.athlete || {};
        if (!athlete.id || byId[String(athlete.id)]) return;
        var record = { espnId: String(athlete.id), cbdId: '', teamId: String(athlete.teamId || ''), team: athlete.teamName || '', name: athlete.displayName,
          height: normalizeHeight(athlete.height) || normalizeHeight(athlete.displayHeight), weight: normalizeWeight(athlete.weight) || normalizeWeight(athlete.displayWeight),
          heightSource: 'ESPN athlete bio', weightSource: 'ESPN athlete bio',
          listedPosition: listedPosition(athlete.position) || 'NA', positionSource: 'ESPN season statistics (' + ctx.season + ')' };
        byId[record.espnId] = [record];
        records.push(record);
      });
    }
    addIdentities(identities);
    var identityPages = Number(identities.pagination && identities.pagination.pages) || 1;
    await pool(Array.from({ length: Math.max(0, identityPages - 1) }, function (_, index) { return index + 2; }), options.concurrency || 8, async function (page) {
      try { addIdentities(await request(statsBase + page, options)); }
      catch (error) { errors.push('ESPN identity page ' + page + ': ' + error.message); }
    });
    var first;
    try { first = await request(coreBase + '1', options); }
    catch (error) { errors.push('ESPN athlete bios: ' + error.message); return records; }
    function addBios(data) {
      if (!data || !Array.isArray(data.items)) throw new Error('Invalid ESPN athlete bio page');
      (data.items || []).forEach(function (athlete) {
        var matches = byId[String(athlete.id || '')];
        if (!matches) return;
        matches.forEach(function (record) {
          var height = normalizeHeight(athlete.height) || normalizeHeight(athlete.displayHeight);
          var weight = normalizeWeight(athlete.weight) || normalizeWeight(athlete.displayWeight);
          if (record.height === null && height !== null) { record.height = height; record.heightSource = 'ESPN athlete bio'; }
          if (record.weight === null && weight !== null) { record.weight = weight; record.weightSource = 'ESPN athlete bio'; }
          var birthplace = athlete.birthPlace || {};
          record.hometown = [birthplace.city, birthplace.state || birthplace.country].filter(Boolean).join(', ');
        });
        // Core experience is mutable current data even for historic season URLs.
        // Do not use it as a historical eligibility/class value.
      });
    }
    addBios(first);
    var pages = Number(first.pageCount) || 1;
    var completed = 1;
    await pool(Array.from({ length: Math.max(0, pages - 1) }, function (_, index) { return index + 2; }), options.concurrency || 8, async function (page) {
      try { addBios(await request(coreBase + page, options)); }
      catch (error) { errors.push('ESPN bio page ' + page + ': ' + error.message); }
      completed++;
      if (options.onProgress) options.onProgress({ stage: 'ESPN bulk bios', completed: completed, total: pages, records: records.length, height: records.filter(function (r) { return r.height !== null; }).length, weight: records.filter(function (r) { return r.weight !== null; }).length });
    });
    // Newly added or inactive athletes can be absent from the v3 inventory while
    // their exact v2 JSON bio is already populated. Only fetch unresolved heights;
    // absent WBB weight alone must never trigger thousands of athlete requests.
    var unresolved = Object.keys(byId).filter(function (id) { return byId[id].some(function (record) { return record.height === null; }); });
    var limit = options.maxIndividualRequests === undefined ? 100 : Math.max(0, Number(options.maxIndividualRequests));
    if (unresolved.length > limit) {
      errors.push('Deferred ' + (unresolved.length - limit) + ' individual bios to the snapshot refresh CLI');
      unresolved = unresolved.slice(0, limit);
    }
    var resolved = 0;
    await pool(unresolved, options.concurrency || 8, async function (id) {
      try {
        var bio = await request('https://sports.core.api.espn.com/v2/sports/basketball/leagues/' + sport(ctx.league) + '/seasons/' + ctx.season + '/athletes/' + encodeURIComponent(id), options);
        if (String(bio.id || '') !== id) throw new Error('Athlete identity mismatch');
        addBios({ items: [bio] });
      } catch (error) { if (error.status !== 404) errors.push('ESPN athlete ' + id + ': ' + error.message); }
      resolved++;
      if (options.onProgress && (resolved % 25 === 0 || resolved === unresolved.length)) options.onProgress({ stage: 'ESPN missing heights', completed: resolved, total: unresolved.length });
    });
    return records;
  }

  async function refresh(league, season, options) {
    options = options || {};
    var ctx = context(league, season);
    var records = [];
    var teams = [];
    var errors = [];
    var cbdWorked = false;
    if (league === 'WBB') {
      records = await espnBulk(ctx, options, errors);
      records.sort(function (a, b) { return String(a.team).localeCompare(String(b.team)) || String(a.name).localeCompare(String(b.name)); });
      return pack(ctx, records, [], errors, 'ESPN athlete bio');
    }
    if (league === 'MBB') {
      try {
        var cbdResponses = await Promise.allSettled([
          request(workerBase(options) + '/api/proxy/teams/roster?season=' + ctx.season, options),
          request(workerBase(options) + '/api/proxy/stats/player/season?season=' + ctx.season, options)
        ]);
        var rosters = cbdResponses[0].status === 'fulfilled' ? cbdResponses[0].value : null;
        if (!Array.isArray(rosters) || !rosters.length) {
          errors.push('CBD roster: ' + (cbdResponses[0].reason ? cbdResponses[0].reason.message : 'Empty roster response'));
          rosters = [];
        }
        var rosterPlayers = Object.create(null);
        var rosterTeamIds = Object.create(null);
        rosters.forEach(function (roster) {
          if (Number(roster.season) !== ctx.season) return;
          var teamId = String(roster.teamSourceId || '');
          rosterTeamIds[String(roster.teamId)] = teamId;
          teams.push([teamId, roster.team]);
          (roster.players || []).forEach(function (athlete) {
            var record = { espnId: String(athlete.sourceId || ''), cbdId: String(athlete.id || ''), teamId: teamId, team: roster.team,
              name: athlete.name, height: normalizeHeight(athlete.height), weight: normalizeWeight(athlete.weight),
              heightSource: 'CBD roster (' + ctx.season + ')', weightSource: 'CBD roster (' + ctx.season + ')',
              listedPosition: listedPosition(athlete.position), positionSource: 'CBD roster (' + ctx.season + ')' };
            rosterPlayers[roster.teamId + ':' + athlete.id] = record;
            records.push(record);
          });
        });
        // The raw stats endpoint preserves ESPN/CBD IDs which the older public
        // mapped-player endpoint drops. It includes lower divisions even when
        // their current CBD roster is empty, so it defines the complete population.
        if (cbdResponses[1].status === 'fulfilled' && Array.isArray(cbdResponses[1].value) && cbdResponses[1].value.length) {
          var seen = Object.create(null);
          var population = [];
          cbdResponses[1].value.forEach(function (athlete) {
            if (Number(athlete.season) !== ctx.season) return;
            var key = athlete.teamId + ':' + athlete.athleteId + ':' + athlete.name;
            if (seen[key]) return;
            seen[key] = true;
            var roster = rosterPlayers[athlete.teamId + ':' + athlete.athleteId];
            var sameIdentity = roster && (!athlete.athleteSourceId || !roster.espnId || String(athlete.athleteSourceId) === roster.espnId);
            var statsPosition = listedPosition(athlete.position);
            var rosterPosition = sameIdentity ? listedPosition(roster.listedPosition) : null;
            population.push({ espnId: String(athlete.athleteSourceId || (sameIdentity && roster.espnId) || ''), cbdId: String(athlete.athleteId || ''),
              teamId: rosterTeamIds[String(athlete.teamId)] || '', team: athlete.team, name: athlete.name,
              height: sameIdentity ? roster.height : null, weight: sameIdentity ? roster.weight : null,
              heightSource: sameIdentity ? roster.heightSource : null, weightSource: sameIdentity ? roster.weightSource : null,
              listedPosition: statsPosition || rosterPosition || 'NA',
              positionSource: !statsPosition && rosterPosition ? roster.positionSource : 'CBD season statistics (' + ctx.season + ')' });
          });
          if (!population.length) throw new Error('CBD statistics season mismatch');
          records = population;
        } else errors.push('CBD statistics: ' + (cbdResponses[1].reason ? cbdResponses[1].reason.message : 'Invalid population response'));
        cbdWorked = records.length > 0;
        if (options.onProgress) options.onProgress({ stage: 'CBD roster', records: records.length });
      } catch (error) { errors.push('CBD roster: ' + error.message); }
    }

    if (cbdWorked) {
      var missingRecords = records.filter(function (record) { return record.espnId && (record.height === null || record.weight === null); });
      if (missingRecords.length) await espnBulk(ctx, options, errors, missingRecords);
    }

    // One bulk CBD response normally supplies MBB. ESPN is needed only for gaps.
    var needsEspn = !cbdWorked || options.espnFallback !== false && records.some(function (r) { return r.height === null || r.weight === null; });
    if (needsEspn) {
      var inventory;
      try {
        var teamResponse = await request(siteBase(league) + '/teams?limit=500', options);
        inventory = (((teamResponse.sports || [])[0] || {}).leagues || []).reduce(function (all, item) { return all.concat(item.teams || []); }, []).map(function (entry) { return entry.team; }).filter(Boolean);
        if (!inventory.length) throw new Error('Empty ESPN team inventory');
      } catch (error) { errors.push('ESPN teams: ' + error.message); inventory = []; }
      var missingTeamIds = Object.create(null);
      if (cbdWorked) records.forEach(function (r) { if (r.height === null || r.weight === null) missingTeamIds[r.teamId] = true; });
      inventory.forEach(function (team) { teams.push([String(team.id), team.displayName, team.shortDisplayName, team.location, team.abbreviation].filter(Boolean)); });
      var selectedTeams = inventory.filter(function (team) { return !cbdWorked || missingTeamIds[String(team.id)]; });
      var byId = Object.create(null);
      records.forEach(function (r) { if (r.espnId) byId[r.teamId + ':' + r.espnId] = r; });
      var completed = 0;
      await pool(selectedTeams, options.concurrency || 8, async function (team) {
        try {
          var data = await request(siteBase(league) + '/teams/' + encodeURIComponent(team.id) + '/roster?season=' + ctx.season, options);
          if (!data.season || Number(data.season.year) !== ctx.season) throw new Error('Roster season mismatch');
          (data.athletes || []).forEach(function (athlete) {
            var key = team.id + ':' + athlete.id;
            var record = byId[key];
            var height = normalizeHeight(athlete.height) || normalizeHeight(athlete.displayHeight);
            var weight = normalizeWeight(athlete.weight) || normalizeWeight(athlete.displayWeight);
            var source = 'ESPN roster (' + ctx.season + ')';
            if (!record) {
              if (cbdWorked) return; // Keep the raw-stat population; bench additions are unrelated to dashboard coverage.
              record = { espnId: String(athlete.id || ''), cbdId: '', teamId: String(team.id), team: team.location || team.displayName, name: athlete.displayName || athlete.fullName,
                height: null, weight: null };
              records.push(record);
              byId[key] = record;
            }
            if (record.height === null && height !== null) { record.height = height; record.heightSource = source; }
            if (record.weight === null && weight !== null) { record.weight = weight; record.weightSource = source; }
            if (!listedPosition(record.listedPosition) && listedPosition(athlete.position)) {
              record.listedPosition = listedPosition(athlete.position);
              record.positionSource = source;
            }
            // ESPN also updates experience on historical roster URLs. Keep the
            // dashboard's existing class rather than labeling it with today's class.
            var birthplace = athlete.birthPlace || {};
            record.hometown = [birthplace.city, birthplace.state || birthplace.country].filter(Boolean).join(', ');
          });
        } catch (error) { errors.push('ESPN team ' + team.id + ': ' + error.message); }
        completed++;
        if (options.onProgress && (completed % 25 === 0 || completed === selectedTeams.length)) options.onProgress({ stage: 'ESPN rosters', completed: completed, total: selectedTeams.length, records: records.length, errors: errors.length });
      });
    }
    records.sort(function (a, b) { return String(a.team).localeCompare(String(b.team)) || String(a.name).localeCompare(String(b.name)); });
    return pack(ctx, records, teams, errors, cbdWorked ? 'CBD + ESPN' : 'ESPN');
  }

  function storage(options) {
    if (options.storage !== undefined) return options.storage;
    try { return typeof localStorage === 'undefined' ? null : localStorage; } catch (_) { return null; }
  }

  // Refresh only season-listed positions in an existing snapshot. Measurements
  // and their original retrieval timestamp/provenance stay exactly as supplied.
  async function refreshPositions(snapshot, options) {
    options = options || {};
    var ctx = context(snapshot.league, snapshot.season);
    if (!validSnapshot(snapshot, ctx)) throw new Error('Invalid player bio snapshot');
    var records = decode(snapshot);
    var sourceRecords = [];
    var sourceUrl;
    var source = (ctx.league === 'MBB' ? 'CBD' : 'ESPN') + ' season statistics (' + ctx.season + ')';
    if (ctx.league === 'MBB') {
      sourceUrl = workerBase(options) + '/api/proxy/stats/player/season?season=' + ctx.season;
      var data = await request(sourceUrl, options);
      if (!Array.isArray(data) || !data.length) throw new Error('Invalid CBD position population');
      sourceRecords = data.filter(function (athlete) { return Number(athlete.season) === ctx.season; }).map(function (athlete) {
        return { espnId: String(athlete.athleteSourceId || ''), cbdId: String(athlete.athleteId || ''), team: athlete.team,
          name: athlete.name, listedPosition: listedPosition(athlete.position) || 'NA' };
      });
    } else {
      sourceUrl = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/' + sport(ctx.league) + '/statistics/byathlete?season=' + ctx.season + '&limit=1000';
      var first = await request(sourceUrl + '&page=1', options);
      function addPage(page) {
        if (!page || !Array.isArray(page.athletes)) throw new Error('Invalid ESPN position page');
        page.athletes.forEach(function (entry) {
          var athlete = entry.athlete || {};
          if (athlete.id) sourceRecords.push({ espnId: String(athlete.id), teamId: String(athlete.teamId || ''), team: athlete.teamName,
            name: athlete.displayName, listedPosition: listedPosition(athlete.position) || 'NA' });
        });
      }
      addPage(first);
      var pages = Number(first.pagination && first.pagination.pages) || 1;
      await pool(Array.from({ length: Math.max(0, pages - 1) }, function (_, index) { return index + 2; }), options.concurrency || 8, async function (page) {
        addPage(await request(sourceUrl + '&page=' + page, options));
      });
    }
    if (!sourceRecords.length) throw new Error('No positions found for snapshot season');
    var index = indexRecords({ records: sourceRecords, teams: snapshot.teams || [] });
    records.forEach(function (record) {
      var match = resolveRecord({ EspnId: record.espnId, CbdId: record.cbdId, TeamId: record.teamId, Team: record.team, Player: record.name }, index);
      if (match && match.listedPosition) {
        record.listedPosition = match.listedPosition;
        record.positionSource = source;
      }
    });
    var labels = (snapshot.sourceLabels || []).slice();
    var packed = records.map(function (record) {
      var row = columns.map(function (key) {
        var value = record[key] === undefined || record[key] === '' ? null : record[key];
        if ((key === 'heightSource' || key === 'weightSource' || key === 'positionSource') && value) {
          if (labels.indexOf(value) < 0) labels.push(value);
          value = labels.indexOf(value) + 1;
        }
        return value;
      });
      while (row.length && row[row.length - 1] === null) row.pop();
      return row;
    });
    return Object.assign({}, snapshot, { columns: columns.slice(), sourceLabels: labels, records: packed,
      positionGeneratedAt: new Date().toISOString(), positionSources: [sourceUrl],
      coverage: Object.assign({}, snapshot.coverage, { listedPosition: records.filter(function (record) { return knownPosition(record.listedPosition); }).length }) });
  }

  function readCache(ctx, options) {
    var store = storage(options);
    if (!store) return null;
    try {
      var entry = JSON.parse(store.getItem(PREFIX + ctx.key));
      if (entry && entry.expires > Date.now() && validSnapshot(entry.snapshot, ctx)) return entry.snapshot;
    } catch (_) { /* Private browsing, malformed entries, or quota errors do not block data. */ }
    return null;
  }

  function remember(ctx, snapshot, options) {
    var expires = Date.now() + (snapshot.complete ? TTL : RETRY_TTL);
    memory[ctx.key] = { snapshot: snapshot, expires: expires };
    var store = storage(options);
    if (!store) return;
    try { store.setItem(PREFIX + ctx.key, JSON.stringify({ expires: expires, snapshot: snapshot })); } catch (_) { /* Browser quota is optional cache, never a load failure. */ }
  }

  async function load(league, season, options) {
    options = options || {};
    var ctx = context(league, season);
    if (!options.force && memory[ctx.key] && memory[ctx.key].expires > Date.now()) return memory[ctx.key].snapshot;
    var pendingKey = ctx.key + (options.snapshotOnly ? ':snapshot' : '');
    if (pending[pendingKey]) return pending[pendingKey];
    var cached = !options.force && readCache(ctx, options);
    if (cached) { memory[ctx.key] = { snapshot: cached, expires: Date.now() + (cached.complete ? TTL : RETRY_TTL) }; return cached; }
    pending[pendingKey] = (async function () {
      var snapshot;
      if (!options.force && options.snapshot !== false) {
        try {
          snapshot = await request((options.snapshotBase || 'data/') + 'player-bios-' + league.toLowerCase() + '-' + ctx.season + '.json?v=positions-2', options);
          if (!validSnapshot(snapshot, ctx) || !snapshot.records.length) snapshot = null;
        } catch (_) { snapshot = null; }
      }
      // A committed snapshot deliberately caches unavailable fields as null, too.
      // Refreshing belongs to the CLI; opening a dashboard must not refetch every roster.
      if (!snapshot && options.snapshotOnly) return null;
      if (!snapshot) snapshot = await refresh(league, season, options);
      remember(ctx, snapshot, options);
      return snapshot;
    })();
    try { return await pending[pendingKey]; } finally { delete pending[pendingKey]; }
  }

  async function enrich(players, league, season, options) {
    var snapshot = await load(league, season, options);
    if (!snapshot) return { total: players.length, matched: 0, height: 0, weight: 0, listedPosition: 0, updated: 0, records: 0, source: 'unavailable', unavailable: true, errors: [] };
    return apply(players, snapshot, league, season);
  }

  return { version: VERSION, columns: columns, normalizeName: normalizeName, normalizeHeight: normalizeHeight, normalizeWeight: normalizeWeight,
    apply: apply, enrich: enrich, load: load, refresh: refresh, refreshPositions: refreshPositions, decode: decode,
    clearMemory: function () { memory = {}; pending = {}; } };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = PlayerBios;
