'use strict';
// Uses only Node built-ins and a disposable Edge/Chromium profile on CDP 9223.
// node tools/browser-nba-evidence-smoke.cjs [http://127.0.0.1:8766/]
// Staff presentation is locally overridden for UI tests; backend auth is untouched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.argv[2] || 'http://127.0.0.1:8766/';
const groups = ['Guards', 'Wings', 'Bigs'];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const tabs = await fetch('http://127.0.0.1:9223/json/list').then(r => r.json());
  const tab = tabs.find(t => t.type === 'page' && !t.url.startsWith('edge://'));
  if (!tab) throw new Error('No disposable browser tab on CDP 9223');
  const ws = new WebSocket(tab.webSocketDebuggerUrl), pending = new Map(), exceptions = [];
  let id = 0;
  ws.addEventListener('message', event => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
    if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  function call(method, params = {}) { return new Promise((resolve, reject) => { const n = ++id, timer = setTimeout(() => reject(new Error('CDP timeout: ' + method)), 60000); pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params })); }); }
  async function evaluate(expression) { const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; }
  async function waitFor(expression, label) { const start = Date.now(); while (Date.now() - start < 90000) { if (await evaluate(expression)) return; await delay(500); } throw new Error('Timed out: ' + label); }
  async function screenshot(file) { await delay(250); const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); const target = path.resolve(__dirname, '..', file); fs.writeFileSync(target, Buffer.from(r.data, 'base64')); return target; }
  let initialization, csvRows = 0, checksSummary, mobile, keyboard, model, downloaded, evidenceGroups = [], screenshots = [];
  try {
    await call('Runtime.enable'); await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1300, deviceScaleFactor: 1, mobile: false });
    initialization = await call('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.setItem("ncaa_guest_mode","1");localStorage.setItem("nba_valuation_enabled_v1","true");sessionStorage.setItem("ncaa_guest_demo_tour_seen","1");' });
    await call('Page.navigate', { url: base });
    await waitFor('document.readyState==="complete" && typeof NBA_SALARY_EVIDENCE!=="undefined" && typeof NbaValuationUI!=="undefined"', 'salary evidence assets');
    const expected = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/nba-salary-evidence.json'), 'utf8'));
    model = await evaluate('({id:NBA_SALARY_EVIDENCE.id,generatedAt:NBA_SALARY_EVIDENCE.generatedAt})');
    assert.deepEqual(model, { id: expected.id, generatedAt: expected.generatedAt }, 'Stale evidence asset');
    await evaluate('window.__nbaEvidenceGate=demoIsGuestMode;demoIsGuestMode=function(){return false;};authShowDashboard();refreshGuestDemoUI();document.getElementById("nbaValuationPanel").open=true;window.__nbaEvidenceSetter=NbaValuation.setEnabled;window.__nbaEvidenceBasisChanges=0;NbaValuation.setEnabled=function(v){__nbaEvidenceBasisChanges++;return __nbaEvidenceSetter(v);};window.__nbaEvidenceBlobs=[];window.__nbaEvidenceUrl=URL.createObjectURL;URL.createObjectURL=function(blob){__nbaEvidenceBlobs.push(blob);return __nbaEvidenceUrl.call(URL,blob);};');
    assert.equal(await evaluate('document.querySelector(\'[data-nba-view="evidence"]\').getAttribute("aria-pressed")'), 'true');
    console.log('Checking evidence groups, coefficients, intervals and direct comparisons...');
    for (const group of groups) {
      await evaluate('document.getElementById("nbaModelGroup").value=' + JSON.stringify(group) + ';document.getElementById("nbaModelGroup").dispatchEvent(new Event("change",{bubbles:true}));');
      const state = await evaluate(`(()=>{var content=document.getElementById('nbaModelContent');var rows=Array.from(content.querySelectorAll('[aria-label="Salary evidence estimates"] tbody tr'));return {rows:rows.map(r=>Array.from(r.cells).map(c=>c.textContent)),pTitles:rows.map(r=>[r.cells[3].querySelector('[title]').title,r.cells[4].querySelector('[title]').title]),marks:content.querySelectorAll('[data-evidence-mark]').length,zero:!!content.querySelector('.nbaEvidenceZero'),supported:content.querySelectorAll('[aria-label="Salary evidence estimates"] [data-evidence-status="supported"]').length,summary:content.querySelector('.nbaEvidenceSummary').textContent,forestLabel:content.querySelector('svg').getAttribute('aria-labelledby'),sensitivityRows:content.querySelectorAll('[aria-label="Salary evidence sensitivity checks"] tbody tr').length,invalid:content.textContent.includes('[object Object]')||Array.from(content.querySelectorAll('td')).some(c=>/^(undefined|NaN)$/.test(c.textContent.trim()))};})()`);
      assert.equal(state.rows.length, 12); assert.equal(state.marks, 12); assert.equal(state.zero, true); assert.equal(state.invalid, false); assert.ok(state.forestLabel);
      assert.equal(state.supported, expected.groups[group].estimates.filter(e => e.status === 'supported').length);
      if (!state.supported) assert.match(state.summary, /No individual association.*0\.05 threshold.*36 tests/);
      assert.equal(state.sensitivityRows, expected.groups[group].sensitivities.length);
      expected.groups[group].estimates.forEach((estimate, i) => {
        assert.ok(state.rows[i][0].includes(estimate.incrementLabel));
        assert.ok(state.rows[i][1].includes('β = ' + (estimate.logEffect > 0 ? '+' : '') + estimate.logEffect.toFixed(4)));
        assert.equal(state.pTitles[i][0], 'Unrounded p-value: ' + estimate.pRaw);
        assert.equal(state.pTitles[i][1], 'Unrounded p-value: ' + estimate.pHolm);
        assert.notEqual(state.rows[i][3], '0.000'); assert.notEqual(state.rows[i][4], '0.000');
        assert.ok(state.rows[i][5].includes(estimate.nObserved + ' / ' + estimate.n));
      });
      evidenceGroups.push({ group, n: expected.groups[group].n, rows: state.rows.length, chartIntervals: state.marks, supported: state.supported, sensitivityChecks: state.sensitivityRows });
    }
    await evaluate('document.querySelector(".nbaEvidenceComparisons").open=true;document.getElementById("nbaEvidenceComparisonStat").value="3P%";document.getElementById("nbaEvidenceComparisonStat").dispatchEvent(new Event("change",{bubbles:true}));');
    const comparison = await evaluate(`({open:document.querySelector('.nbaEvidenceComparisons').open,focused:document.activeElement.id,overall:document.querySelectorAll('[aria-label="Direct overall position comparisons"] tbody tr').length,pairs:Array.from(document.querySelectorAll('[aria-label="Direct pairwise position comparisons"] tbody tr')).map(r=>r.textContent),caption:document.querySelector('[aria-label="Direct pairwise position comparisons"] caption').textContent})`);
    assert.equal(comparison.open, true); assert.equal(comparison.focused, 'nbaEvidenceComparisonStat'); assert.equal(comparison.overall, 12); assert.equal(comparison.pairs.length, 3);
    assert.ok(comparison.pairs.every(text => text.includes('+5 percentage points'))); assert.match(comparison.caption, /not a difference in salary levels/);
    await evaluate('document.querySelector(".nbaEvidenceComparisons").scrollIntoView({block:"start"});');
    screenshots.push(await screenshot('tmp_nba_evidence_comparisons.png'));
    const downloadPath = path.resolve(__dirname, '../tmp_nba_evidence_downloads'); fs.mkdirSync(downloadPath, { recursive: true });
    await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath });
    await evaluate('document.querySelector("[data-nba-evidence-download]").click();document.querySelector("[data-nba-checks-download]").click();');
    downloaded = await evaluate('Promise.all(__nbaEvidenceBlobs.map(b=>b.text()))');
    assert.equal(downloaded.length, 2);
    csvRows = downloaded[0].split('\r\n').length;
    const sensitivityCount = groups.reduce((sum, g) => sum + expected.groups[g].sensitivities.filter(s => s.available).reduce((n, s) => n + s.estimates.length, 0), 0);
    assert.equal(csvRows, 1 + 36 + 12 + 36 + sensitivityCount);
    assert.ok(downloaded[0].includes('Coefficient per raw unit')); assert.ok(downloaded[0].includes('Descriptive sensitivity:'));
    const checks = JSON.parse(downloaded[1]); assert.equal(checks.id, expected.id); assert.ok(!downloaded[1].includes('"salary":')); assert.ok(!downloaded[1].includes('topInfluence'));
    checksSummary = groups.map(group => { const item=checks.groups[group], complete=item.sensitivities.find(s=>s.id==='fullComplete'); const expectedComplete=expected.groups[group].sensitivities.find(s=>s.id==='fullComplete'); assert.equal(complete.excluded.length,(expectedComplete.excluded||[]).length); return {group, sensitivities:item.sensitivities.length,completeCaseExclusions:complete.excluded.length,primaryExclusions:item.excluded.length}; });
    await evaluate('document.querySelector(".nbaEvidenceRobustness").open=true;document.querySelector(".nbaEvidenceRobustness").scrollIntoView({block:"start"});');
    screenshots.push(await screenshot('tmp_nba_evidence_checks.png'));
    await evaluate('document.querySelector(".nbaEvidenceForestWrap").scrollIntoView({block:"start"});');
    screenshots.push(await screenshot('tmp_nba_evidence_intervals.png'));
    await evaluate('document.querySelector(\'[data-nba-view="evidence"]\').focus();');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    keyboard = await evaluate('document.activeElement.getAttribute("data-nba-view")'); assert.equal(keyboard, 'prediction');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    assert.equal(await evaluate('document.querySelector(\'[data-nba-view="prediction"]\').getAttribute("aria-pressed")'), 'true');
    for (const group of groups) {
      await evaluate('document.getElementById("nbaModelGroup").value=' + JSON.stringify(group) + ';document.getElementById("nbaModelGroup").dispatchEvent(new Event("change",{bubbles:true}));');
      assert.equal(await evaluate(`document.querySelectorAll('[aria-label="NBA salary coefficients"] tbody tr').length`), 12);
      assert.equal(await evaluate(`document.querySelectorAll('[aria-label="Held-out NBA salary validation"] tbody tr').length`), 3);
    }
    assert.equal(await evaluate('__nbaEvidenceBasisChanges'), 0);
    await evaluate('document.querySelector(\'[data-nba-view="evidence"]\').click();document.getElementById("nbaValuationPanel").scrollIntoView({block:"start"});');
    screenshots.push(await screenshot('tmp_nba_evidence.png'));
    await call('Emulation.setDeviceMetricsOverride', { width: 375, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate('document.getElementById("nbaValuationPanel").scrollIntoView({block:"start"});');
    mobile = await evaluate('(()=>{var p=document.getElementById("nbaValuationPanel"),r=p.getBoundingClientRect();return {viewport:innerWidth,left:r.left,right:r.right,client:p.clientWidth,scroll:p.scrollWidth,buttons:Array.from(p.querySelectorAll("[data-nba-view]")).map(b=>({height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width})),tables:Array.from(p.querySelectorAll(".nbaModelTableWrap")).map(t=>({client:t.clientWidth,scroll:t.scrollWidth}))};})()');
    assert.ok(mobile.left >= -1 && mobile.right <= mobile.viewport + 1); assert.ok(mobile.scroll <= mobile.client + 1); assert.ok(mobile.buttons.every(b => b.height >= 44));
    screenshots.push(await screenshot('tmp_nba_evidence_mobile.png'));
    await evaluate('demoIsGuestMode=__nbaEvidenceGate;refreshGuestDemoUI();');
    const guest = await evaluate('({tables:document.querySelectorAll("#nbaModelContent table").length,charts:document.querySelectorAll("#nbaModelContent svg").length,controlsHidden:document.getElementById("nbaModelControls").hidden,downloads:document.querySelectorAll("#nbaModelContent [data-nba-evidence-download],#nbaModelContent [data-nba-checks-download]").length})');
    assert.deepEqual(guest, { tables: 0, charts: 0, controlsHidden: true, downloads: 0 }); assert.deepEqual(exceptions, []);
    console.log(JSON.stringify({ passed: true, url: base, model, evidenceGroups, comparison: { overall: comparison.overall, pairs: comparison.pairs.length, focusPreserved: true }, csvRows, checksSummary, keyboard, predictionBasisChanges: 0, mobile, guest, screenshots, exceptions }, null, 2));
  } finally {
    try { await evaluate('if(window.__nbaEvidenceGate)demoIsGuestMode=__nbaEvidenceGate;if(window.__nbaEvidenceSetter)NbaValuation.setEnabled=__nbaEvidenceSetter;if(window.__nbaEvidenceUrl)URL.createObjectURL=__nbaEvidenceUrl;if(typeof closeProfile==="function")closeProfile();if(typeof refreshGuestDemoUI==="function")refreshGuestDemoUI();'); if (initialization) await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: initialization.identifier }); await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }); } catch (_) {}
    pending.forEach(p => clearTimeout(p.timer)); ws.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
