'use strict';
// Node built-ins only. Requires a disposable Edge/Chromium profile on CDP 9223
// and an HTTP server for the dashboard. Never run against a personal profile.
// node tools/browser-nba-valuation-smoke.cjs [http://127.0.0.1:8766/]
// The temporary guest session overrides presentation gates locally for staff
// UI checks; it never fabricates a token or calls a staff-authentication endpoint.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.argv[2] || 'http://127.0.0.1:8766/';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const tabs = await fetch('http://127.0.0.1:9223/json/list').then(response => response.json());
  const tab = tabs.find(item => item.type === 'page' && !item.url.startsWith('edge://'));
  if (!tab) throw new Error('No disposable browser test tab available');
  const ws = new WebSocket(tab.webSocketDebuggerUrl), pending = new Map(), exceptions = [];
  let id = 0;
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = pending.get(message.id);
      if (item) { pending.delete(message.id); clearTimeout(item.timeout); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); }
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  });
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const messageId = ++id;
      const timeout = setTimeout(() => { pending.delete(messageId); reject(new Error('CDP timed out: ' + method)); }, 120000);
      pending.set(messageId, { resolve, reject, timeout }); ws.send(JSON.stringify({ id: messageId, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression, label) {
    const start = Date.now();
    while (Date.now() - start < 90000) { if (await evaluate(expression)) return; await delay(400); }
    throw new Error('Timed out: ' + label + '; ' + await evaluate('JSON.stringify({league:window.league,pos:window.pos,loading:window._leagueDataStatus,warn:document.getElementById("warn")?.textContent})'));
  }
  async function screenshot(filename) {
    const captured = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const target = path.resolve(__dirname, '..', filename);
    fs.writeFileSync(target, Buffer.from(captured.data, 'base64'));
    return target;
  }
  const ready = league => 'window.league===' + JSON.stringify(league) + ' && ["Guards","Wings","Bigs"].every(g=>tbAllComputed[league+"_"+g]?.length>0)';
  const summaries = [], panels = [];
  let modelScreenshot, profileScreenshot;
  try {
    await call('Runtime.enable'); await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await call('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.setItem("ncaa_guest_mode","1");localStorage.setItem("nba_valuation_enabled_v1","true");sessionStorage.setItem("ncaa_guest_demo_tour_seen","1");' });
    await call('Page.navigate', { url: base });
    await waitFor('typeof window.authEnterGuest==="function" && typeof window.NbaValuationUI!=="undefined" && document.readyState==="complete"', 'dashboard scripts');
    const expectedModel = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/nba-valuation-model.json'), 'utf8'));
    const servedModel = await evaluate('({id:NbaValuation.getModel().id,generatedAt:NbaValuation.getModel().generatedAt})');
    assert.deepEqual(servedModel, { id: expectedModel.id, generatedAt: expectedModel.generatedAt }, 'Browser loaded an outdated model asset');
    await evaluate('if(!window._leagueDataStatus?.MBB?.loading && !window._leagueDataStatus?.MBB?.ready) authEnterGuest(); window.__nbaSmokeBaseline={}; window.__nbaSmokeDemoGate=demoIsGuestMode; demoIsGuestMode=function(){return false;}; refreshGuestDemoUI();');
    for (const league of ['MBB', 'WBB']) {
      console.log('Checking ' + league + ' NBA values and custom-mode round trip...');
      if (league === 'WBB') await evaluate('document.getElementById("tabWBB").click()');
      await waitFor(ready(league), league + ' three populated groups');
      await evaluate('authShowDashboard(); document.getElementById("tabWings").click(); NbaValuationUI.render();');
      await waitFor(ready(league) + ' && ["Guards","Wings","Bigs"].every(g=>tbAllComputed[league+"_"+g].every(r=>r.NBAModel_calc&&Number.isFinite(r.ActualValuation_calc)))', league + ' finite NBA bids');
      const initial = await evaluate('(()=>{var result={}; __nbaSmokeBaseline[league]={}; ["Guards","Wings","Bigs"].forEach(g=>{var a=tbAllComputed[league+"_"+g]; __nbaSmokeBaseline[league][g]=a.map(r=>({player:r.Player,team:r.Team,bid:r.ActualValuation_calc,curve:r.ActualValuationCurve_calc,signal:r.NBAScore_calc})); result[g]={count:a.length,nba:a.filter(r=>r.NBAModel_calc).length,finite:a.filter(r=>Number.isFinite(r.ActualValuation_calc)).length};}); return result;})()');
      await evaluate('document.getElementById("nbaValuationBasis").value="custom";document.getElementById("nbaValuationBasis").dispatchEvent(new Event("change",{bubbles:true}));');
      await waitFor(ready(league) + ' && !NbaValuation.isEnabled() && ["Guards","Wings","Bigs"].every(g=>tbAllComputed[league+"_"+g].every(r=>!r.NBAModel_calc))', league + ' custom mode');
      const changes = await evaluate('Object.fromEntries(["Guards","Wings","Bigs"].map(g=>[g,tbAllComputed[league+"_"+g].filter((r,i)=>Math.abs(r.ActualValuationCurve_calc-__nbaSmokeBaseline[league][g][i].curve)>0.01).length]))');
      Object.entries(changes).forEach(([group, count]) => assert.ok(count > 0, league + ' ' + group + ': custom mode must change bids'));
      await evaluate('document.getElementById("nbaValuationBasis").value="nba";document.getElementById("nbaValuationBasis").dispatchEvent(new Event("change",{bubbles:true}));');
      await waitFor(ready(league) + ' && NbaValuation.isEnabled() && ["Guards","Wings","Bigs"].every(g=>tbAllComputed[league+"_"+g].every(r=>r.NBAModel_calc))', league + ' restored NBA mode');
      const restored = await evaluate('Object.fromEntries(["Guards","Wings","Bigs"].map(g=>[g,tbAllComputed[league+"_"+g].filter((r,i)=>{var old=__nbaSmokeBaseline[league][g][i];return !old||old.player!==r.Player||old.team!==r.Team||Math.abs(r.ActualValuationCurve_calc-old.curve)>0.00001||Math.abs(r.NBAScore_calc-old.signal)>0.00001;}).length]))');
      Object.entries(restored).forEach(([group, count]) => assert.equal(count, 0, league + ' ' + group + ': restored NBA signal/curve differ'));
      // Final bids can change while pre-existing translation inputs load. Keep
      // that distinct from deterministic NBA basis restoration and verify the
      // current final quote against the current separate adjustments instead.
      const reconciliation = await evaluate('Object.fromEntries(["Guards","Wings","Bigs"].map(g=>{var a=tbAllComputed[league+"_"+g];return [g,{finalBidChanges:a.filter((r,i)=>Math.abs(r.ActualValuation_calc-__nbaSmokeBaseline[league][g][i].bid)>.00001).length,invalid:a.filter(r=>{var c=r.NBACalibration_calc,b=applyScoutAdjustment(r.ActualValuationCurve_calc,r.TranslationRiskPct_calc,c.minPay,c.maxPay),v=applyScoutAdjustment(b,r.ScoutAdjustmentPct_calc,c.minPay,c.maxPay);return Math.abs(b-r.ActualValuationBase_calc)>.00001||Math.abs(v-r.ActualValuation_calc)>.00001;}).length}]}))');
      Object.entries(reconciliation).forEach(([group, result]) => assert.equal(result.invalid, 0, league + ' ' + group + ': final bid reconciliation failed'));
      const name = league === 'MBB' ? 'AJ Dybantsa' : 'Madison Booker';
      await evaluate('openProfile(tbAllComputed[league+"_Wings"].find(r=>r.Player===' + JSON.stringify(name) + ')||tbAllComputed[league+"_Wings"][0]);document.getElementById("mNbaValuationPanel").open=true;');
      const profile = await evaluate('({name:document.getElementById("mTitle").textContent,visible:!document.getElementById("mNbaValuationPanel").hidden,contributions:document.querySelectorAll("#mNbaValuationContent tbody tr").length,reconciliationSteps:document.querySelectorAll("#mNbaValuationContent .nbaReconciliation>div").length,internalLeak:["[object Object]","NBAContributions_calc"].some(s=>document.getElementById("mAllStats").textContent.includes(s)),prose:document.getElementById("mMeta").textContent.includes("NBA salary coefficients")})');
      assert.equal(profile.visible, true); assert.equal(profile.contributions, 12); assert.equal(profile.internalLeak, false); assert.equal(profile.prose, true);
      assert.equal(profile.reconciliationSteps, 4);
      const efgEdge = await evaluate('(()=>{var sample=JSON.parse(JSON.stringify(_currentProfilePlayer));var contribution=sample.NBAContributions_calc.find(c=>c.key==="eFG%");contribution.value=1.5;contribution.missing=false;NbaValuationUI.renderProfile(sample);var valid=document.getElementById("mNbaValuationContent").textContent.includes("150.0%");NbaValuationUI.renderProfile(_currentProfilePlayer);return valid;})()');
      assert.equal(efgEdge, true, 'eFG fraction 1.5 must render 150%');
      if (league === 'WBB') {
        await evaluate('document.getElementById("mNbaValuationPanel").scrollIntoView({block:"start"});');
        await delay(350); profileScreenshot = await screenshot('tmp_nba_profile.png');
      }
      await evaluate('closeProfile()');
      summaries.push({ league, groups: initial, customChangedCurves: changes, restoredNbaDifferences: restored, reconciliation, profile, efgEdge });
    }
    console.log('Checking all coefficient groups, guest gating, and narrow layout...');
    await evaluate('document.getElementById("nbaValuationPanel").open=true;document.querySelector(\'[data-nba-view="prediction"]\').click();');
    for (const group of ['Guards', 'Wings', 'Bigs']) {
      await evaluate('document.getElementById("nbaModelGroup").value=' + JSON.stringify(group) + ';document.getElementById("nbaModelGroup").dispatchEvent(new Event("change",{bubbles:true}));');
      const panel = await evaluate(`({selected:document.getElementById('nbaModelGroup').value,coefficients:document.querySelectorAll('#nbaModelContent [aria-label="NBA salary coefficients"] tbody tr').length,validation:document.querySelectorAll('#nbaModelContent [aria-label="Held-out NBA salary validation"] tbody tr').length,text:document.getElementById('nbaModelContent').textContent,invalid:['undefined','NaN','[object Object]'].some(s=>document.getElementById('nbaModelContent').textContent.includes(s))})`);
      assert.equal(panel.selected, group); assert.equal(panel.coefficients, 12); assert.equal(panel.validation, 3); assert.equal(panel.invalid, false); assert.match(panel.text, /NBA height SD/);
      panels.push({ group, coefficients: panel.coefficients, validationMethods: panel.validation });
    }
    await evaluate('document.getElementById("nbaModelGroup").value="Wings";document.getElementById("nbaModelGroup").dispatchEvent(new Event("change",{bubbles:true}));document.getElementById("nbaValuationPanel").scrollIntoView({block:"start"});');
    await delay(350); modelScreenshot = await screenshot('tmp_nba_model.png');
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate('document.getElementById("nbaValuationPanel").scrollIntoView({block:"start"});');
    const mobile = await evaluate('(()=>{var p=document.getElementById("nbaValuationPanel"),r=p.getBoundingClientRect();return {viewport:innerWidth,left:r.left,right:r.right,client:p.clientWidth,scroll:p.scrollWidth,tables:Array.from(p.querySelectorAll(".nbaModelTableWrap")).map(t=>({client:t.clientWidth,scroll:t.scrollWidth}))};})()');
    assert.ok(mobile.left >= -1 && mobile.right <= mobile.viewport + 1, 'Mobile model panel exceeds viewport');
    assert.ok(mobile.scroll <= mobile.client + 1, 'Mobile model panel overflows horizontally');
    await evaluate('openProfile(tbAllComputed[league+"_Wings"].find(r=>r.Player==="Madison Booker")||computed[0]);document.getElementById("mNbaValuationPanel").open=true;');
    const mobileProfile = await evaluate('(()=>{var p=document.getElementById("mNbaValuationPanel");return {client:p.clientWidth,scroll:p.scrollWidth};})()');
    assert.ok(mobileProfile.scroll <= mobileProfile.client + 1, 'Mobile profile panel overflows horizontally');
    await evaluate('demoIsGuestMode=__nbaSmokeDemoGate;refreshGuestDemoUI();');
    const guest = await evaluate('({modelTables:document.querySelectorAll("#nbaModelContent table").length,profileTables:document.querySelectorAll("#mNbaValuationContent table").length,controlsHidden:document.getElementById("nbaModelControls").hidden,loginVisible:!!document.querySelector("#nbaModelContent [data-nba-staff-login]")})');
    assert.equal(guest.modelTables, 0); assert.equal(guest.profileTables, 0); assert.equal(guest.controlsHidden, true); assert.equal(guest.loginVisible, true);
    assert.deepEqual(exceptions, [], 'Browser JavaScript errors');
    console.log(JSON.stringify({ url: base, passed: true, model: servedModel, leagues: summaries, modelGroups: panels, mobile, mobileProfile, guest, screenshots: [modelScreenshot, profileScreenshot], exceptions }, null, 2));
  } finally {
    try { await evaluate('if(window.__nbaSmokeDemoGate)demoIsGuestMode=__nbaSmokeDemoGate; if(typeof closeProfile==="function")closeProfile();if(typeof refreshGuestDemoUI==="function")refreshGuestDemoUI();'); } catch (_) {}
    pending.forEach(item => clearTimeout(item.timeout)); ws.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
