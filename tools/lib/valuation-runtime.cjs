'use strict';
// Minimal browser surfaces for testing the actual no-build dashboard modules.
var fs = require('node:fs');
var path = require('node:path');
var vm = require('node:vm');
var root = path.resolve(__dirname, '../..');

function createRuntime(options) {
  options = options || {};
  var elements = new Map();
  var storage = new Map();
  if (options.enabled === false) storage.set('nba_valuation_enabled_v1', 'false');
  function element(id) {
    if (!elements.has(id)) elements.set(id, { value: '', checked: false, textContent: '', innerHTML: '', style: {},
      options: [{ text: 'Balanced' }], selectedIndex: 0, dataset: {},
      addEventListener: function () {}, querySelectorAll: function () { return []; },
      classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } } });
    return elements.get(id);
  }
  var ctx = vm.createContext({ console: console, fetch: options.fetch || fetch, AbortController: AbortController, URL: URL,
    setTimeout: setTimeout, clearTimeout: clearTimeout, requestAnimationFrame: function () {},
    localStorage: { getItem: function (key) { return storage.get(key) || null; }, setItem: function (key, value) { storage.set(key, String(value)); } },
    document: { getElementById: element, querySelectorAll: function () { return []; },
      createElement: function () { return element(Symbol()); }, createDocumentFragment: function () { return { appendChild: function () {} }; } }
  });
  ctx.window = ctx;
  function run(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file }); }
  run('modules/config.js');
  run('modules/player-bios.js');
  if (options.model) ctx.NBA_VALUATION_MODEL = options.model;
  else run('data/nba-valuation-model.js');
  run('modules/nba-valuation.js');
  run('modules/data.js');
  ctx.initDataDOMRefs();
  ctx.renderPlayers = function () {};
  ctx.renderWeights = function () {};
  ctx._dataRefreshScoredReferences = function () {};
  ctx.setLeague = function (league) {
    ctx.league = league;
    var settings = ctx.getValuationModelDefaults('recommended', league);
    Object.keys(settings).forEach(function (key) { element(key).value = String(settings[key]); });
    element('fitPreset').value = 'balanced';
    element('confMultToggle').checked = false;
    ctx.loadScoringWeight();
    vm.runInContext("confMultipliers = JSON.parse(JSON.stringify(league === 'WBB' ? WBB_DEFAULT_CONF_VALUES : DEFAULT_CONF_VALUES))", ctx);
  };
  ctx.setLeague('MBB');
  ctx.element = element;
  return ctx;
}
module.exports = { createRuntime: createRuntime, root: root };
