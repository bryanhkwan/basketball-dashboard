'use strict';
// Uses only Node built-ins and a disposable Edge/Chromium profile on CDP 9223.
// node tools/browser-nba-evidence-smoke.cjs [http://127.0.0.1:8766/]
// Staff presentation is locally overridden for UI tests; backend auth is untouched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const base = process.argv[2] || 'http://127.0.0.1:8766/';
const groups = ['Guards', 'Wings', 'Bigs'];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function csvRecords(text) {
  text = text.replace(/^\ufeff/, '');
  const rows = [], row = []; let cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\r' || char === '\n') && !quoted) { if (char === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row.splice(0)); cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
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
  let initialization, csvRows = 0, checksSummary, mobile, keyboard, model, downloaded, coach, matrix, matrixCsvRows = 0, pdf, profileShortcut, evidenceGroups = [], screenshots = [];
  try {
    await call('Runtime.enable'); await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1300, deviceScaleFactor: 1, mobile: false });
    initialization = await call('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.setItem("ncaa_guest_mode","1");localStorage.setItem("nba_valuation_enabled_v1","true");sessionStorage.setItem("ncaa_guest_demo_tour_seen","1");' });
    await call('Page.navigate', { url: base });
    await waitFor('document.readyState!=="loading" && typeof NBA_SALARY_EVIDENCE!=="undefined" && typeof NbaValuationUI!=="undefined" && typeof refreshGuestDemoUI==="function" && typeof showDashboardPage==="function"', 'salary evidence assets and dashboard navigation');
    const expected = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/nba-salary-evidence.json'), 'utf8'));
    const expectedPrediction = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/nba-valuation-model.json'), 'utf8'));
    model = await evaluate('({id:NBA_SALARY_EVIDENCE.id,generatedAt:NBA_SALARY_EVIDENCE.generatedAt})');
    assert.deepEqual(model, { id: expected.id, generatedAt: expected.generatedAt }, 'Stale evidence asset');
    assert.deepEqual(await evaluate('({id:NbaValuation.getModel().id,generatedAt:NbaValuation.getModel().generatedAt})'), {id:expectedPrediction.id,generatedAt:expectedPrediction.generatedAt}, 'Stale prediction asset');
    await evaluate('window.__nbaEvidenceGate=demoIsGuestMode;demoIsGuestMode=function(){return false;};authShowDashboard();refreshGuestDemoUI();document.getElementById("nbaValuationPanel").open=true;window.__nbaEvidenceSetter=NbaValuation.setEnabled;window.__nbaEvidenceBasisChanges=0;NbaValuation.setEnabled=function(v){__nbaEvidenceBasisChanges++;return __nbaEvidenceSetter(v);};window.__nbaEvidenceBlobs=[];window.__nbaEvidenceUrl=URL.createObjectURL;URL.createObjectURL=function(blob){__nbaEvidenceBlobs.push(blob);return __nbaEvidenceUrl.call(URL,blob);};');
    assert.equal(await evaluate('document.querySelector(\'[data-nba-view="evidence"]\').getAttribute("aria-pressed")'), 'true');
    coach = await evaluate(`(()=>{var p=document.getElementById('nbaModelContent');return {label:document.querySelector('[data-nba-view="evidence"]').textContent,detailsOpen:document.getElementById('nbaEvidenceDetails').open,visibleTables:Array.from(p.querySelectorAll('table')).filter(t=>t.checkVisibility()).length,visibleCharts:Array.from(p.querySelectorAll('svg')).filter(t=>t.checkVisibility()).length,text:p.querySelector('.nbaCoachSummary').textContent,pdf:p.querySelector('.nbaCoachBrief').getAttribute('href'),download:p.querySelector('.nbaCoachBrief').hasAttribute('download')};})()`);
    assert.equal(coach.label, 'Coach summary'); assert.equal(coach.detailsOpen, false); assert.equal(coach.visibleTables, 1); assert.equal(coach.visibleCharts, 0);
    const ctaColors = await evaluate('(()=>{var s=getComputedStyle(document.querySelector(".nbaCoachBrief"));return {foreground:s.color,background:s.backgroundColor};})()');
    const luminance = color => color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
    const fg = luminance(ctaColors.foreground), bg = luminance(ctaColors.background); coach.pdfContrast = (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05); assert.ok(coach.pdfContrast >= 4.5, 'PDF CTA text contrast');
    assert.match(coach.text, /Coefficients by position/); assert.match(coach.text, /OLS/); assert.match(coach.text, /ridge/i); assert.match(coach.text, /p-values/); assert.equal(coach.download, true);
    assert.match(coach.pdf, /coefficients-table-20260914/);
    matrix = await evaluate(`(()=>{var p=document.querySelector('[aria-label="Cross-position coefficient table"]');return {headings:Array.from(p.querySelectorAll('thead th')).map(th=>th.textContent),rows:Array.from(p.querySelectorAll('[data-nba-coefficient-key]')).map(r=>({key:r.getAttribute('data-nba-coefficient-key'),label:r.querySelector('th').textContent,cells:Array.from(r.querySelectorAll('[data-nba-coefficient-group]')).map(c=>({group:c.getAttribute('data-nba-coefficient-group'),text:c.textContent,values:Object.fromEntries(Array.from(c.querySelectorAll('[data-nba-value]')).map(v=>[v.getAttribute('data-nba-value'),{text:v.textContent,title:v.getAttribute('title')||v.querySelector('[title]')?.title}]))}))})),accessible:p.tabIndex===0&&p.getAttribute('role')==='region'};})()`);
    const matrixKeys = [...new Set(groups.flatMap(group=>[...expectedPrediction.groups[group].features.map(item=>item.key),...expected.groups[group].estimates.map(item=>item.key)]))];
    assert.equal(matrix.rows.length, matrixKeys.length); assert.equal(matrix.headings.length, groups.length + 1); assert.equal(matrix.accessible, true);
    assert.deepEqual(matrix.rows.map(row=>row.key).sort(), [...matrixKeys].sort());
    matrix.rows.forEach(row => {
      assert.deepEqual(row.cells.map(cell=>cell.group), groups);
      row.cells.forEach(cell => {
        const estimate=expected.groups[cell.group].estimates.find(e=>e.key===row.key), ridge=expectedPrediction.groups[cell.group].features.find(f=>f.key===row.key);
        if(!ridge||!estimate)assert.match(cell.text,/Excluded/);
        if(estimate)assert.ok(row.label.includes(estimate.incrementLabel));
        const values={...(ridge?{ridge:ridge.coefficient}:{}),...(estimate?{ols:estimate.logEffect,ciLow:estimate.logEffectCiLow,ciHigh:estimate.logEffectCiHigh,pRaw:estimate.pRaw,pHolm:estimate.pHolm}:{})};
        assert.deepEqual(Object.keys(cell.values).sort(),Object.keys(values).sort(),cell.group+' '+row.key+' selected fields only');
        Object.entries(values).forEach(([field,value])=>{
          assert.ok(cell.values[field].title==='Unrounded value: '+value||(field.startsWith('p')&&cell.values[field].title==='Unrounded p-value: '+value), cell.group+' '+row.key+' '+field);
          assert.ok(Number.isFinite(Number(cell.values[field].text)), 'Readable numeric value: '+cell.group+' '+row.key+' '+field);
          if(field.startsWith('p'))assert.notEqual(cell.values[field].text,'0.000');
          else assert.ok(Math.abs(Number(cell.values[field].text)-value)<=.000500001,'Displayed coefficient precision: '+cell.group+' '+row.key+' '+field);
        });
      });
    });
    pdf = await evaluate(`(async()=>{var r=await fetch(document.querySelector('.nbaCoachBrief').href);var b=await r.arrayBuffer();return {status:r.status,bytes:b.byteLength,magic:String.fromCharCode(...new Uint8Array(b).slice(0,5)),sha256:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(v=>v.toString(16).padStart(2,'0')).join('')};})()`);
    assert.equal(pdf.status, 200); assert.equal(pdf.magic, '%PDF-'); assert.equal(pdf.sha256, crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../output/pdf/nba-salary-coach-brief.pdf'))).digest('hex'));
    const downloadPath = path.resolve(__dirname, '../tmp_nba_evidence_downloads'); fs.mkdirSync(downloadPath, { recursive: true });
    await call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath });
    await evaluate('document.querySelector("[data-nba-coefficient-download]").click();');
    const matrixCsv = await evaluate('__nbaEvidenceBlobs[0].text()'), tableRecords = csvRecords(matrixCsv);
    matrixCsvRows = tableRecords.length - 1;
    const suffixes = ['ridge weight per 1 SD','OLS beta per stated increment','OLS 95% CI low','OLS 95% CI high','OLS raw p','OLS Holm p'];
    assert.deepEqual(tableRecords[0],['Input','OLS increment',...groups.flatMap(group=>suffixes.map(suffix=>group+' '+suffix))]);
    assert.equal(matrixCsvRows,matrixKeys.length); assert.ok(tableRecords.every(row=>row.length===2+groups.length*6));
    matrix.rows.forEach((matrixRow,index)=>{
      const source=groups.flatMap(group=>expected.groups[group].estimates).find(item=>item.key===matrixRow.key)||groups.flatMap(group=>expectedPrediction.groups[group].features).find(item=>item.key===matrixRow.key);
      const row=tableRecords[index+1]; assert.equal(row[0],source.label||source.key); assert.equal(row[1],/^[=+\-@]/.test(source.incrementLabel)?"'"+source.incrementLabel:source.incrementLabel||'');
      groups.forEach((group,groupIndex)=>{const e=expected.groups[group].estimates.find(item=>item.key===source.key),r=expectedPrediction.groups[group].features.find(item=>item.key===source.key),values=row.slice(2+groupIndex*6,8+groupIndex*6),sourceValues=[r&&r.coefficient,e&&e.logEffect,e&&e.logEffectCiLow,e&&e.logEffectCiHigh,e&&e.pRaw,e&&e.pHolm].map(value=>value===undefined||value===null?'':String(value));assert.deepEqual(values,sourceValues);});
    });
    assert.doesNotMatch(matrixCsv,/Descriptive sensitivity|Pairwise|Player|salary records/);
    await evaluate('__nbaEvidenceBlobs.length=0;');
    await evaluate('document.querySelector("#nbaEvidenceDetails>summary").click();');
    assert.equal(await evaluate('document.getElementById("nbaEvidenceDetails").open'), true);
    console.log('Checking evidence groups, coefficients, intervals and direct comparisons...');
    for (const group of groups) {
      await evaluate('document.getElementById("nbaModelGroup").value=' + JSON.stringify(group) + ';document.getElementById("nbaModelGroup").dispatchEvent(new Event("change",{bubbles:true}));');
      const state = await evaluate(`(()=>{var content=document.getElementById('nbaModelContent');var rows=Array.from(content.querySelectorAll('[aria-label="Salary evidence estimates"] tbody tr'));return {rows:rows.map(r=>Array.from(r.cells).map(c=>c.textContent)),pTitles:rows.map(r=>[r.cells[3].querySelector('[title]').title,r.cells[4].querySelector('[title]').title]),marks:content.querySelectorAll('[data-evidence-mark]').length,zero:!!content.querySelector('.nbaEvidenceZero'),supported:content.querySelectorAll('[aria-label="Salary evidence estimates"] [data-evidence-status="supported"]').length,summary:content.querySelector('.nbaEvidenceSummary').textContent,forestLabel:content.querySelector('svg').getAttribute('aria-labelledby'),sensitivityRows:content.querySelectorAll('[aria-label="Salary evidence sensitivity checks"] tbody tr').length,invalid:content.textContent.includes('[object Object]')||Array.from(content.querySelectorAll('td')).some(c=>/^(undefined|NaN)$/.test(c.textContent.trim()))};})()`);
      assert.equal(state.rows.length, expected.groups[group].estimates.length); assert.equal(state.marks, expected.groups[group].estimates.length); assert.equal(state.invalid, false); assert.ok(state.forestLabel);
      assert.equal(state.supported, expected.groups[group].estimates.filter(e => e.status === 'supported').length);
      assert.equal(state.zero,true, 'Forest chart retains its zero-association reference');
      if (!state.supported) assert.match(state.summary, /No individual association.*0\.05 threshold/);
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
    const comparisonKey = expected.comparisons.pairwise[0]?.key || expected.comparisons.omnibus[0]?.key;
    assert.ok(comparisonKey, 'At least one directly estimated position comparison');
    await evaluate('document.querySelector(".nbaEvidenceComparisons").open=true;document.getElementById("nbaEvidenceComparisonStat").value='+JSON.stringify(comparisonKey)+';document.getElementById("nbaEvidenceComparisonStat").dispatchEvent(new Event("change",{bubbles:true}));');
    const comparison = await evaluate(`({open:document.querySelector('.nbaEvidenceComparisons').open,focused:document.activeElement.id,overall:document.querySelectorAll('[aria-label="Direct overall position comparisons"] tbody tr').length,pairs:Array.from(document.querySelectorAll('[aria-label="Direct pairwise position comparisons"] tbody tr')).map(r=>r.textContent),caption:document.querySelector('[aria-label="Direct pairwise position comparisons"] caption').textContent})`);
    const expectedPairs = expected.comparisons.pairwise.filter(item=>item.key===comparisonKey);
    assert.equal(comparison.open, true); assert.equal(comparison.focused, 'nbaEvidenceComparisonStat'); assert.equal(comparison.overall, expected.comparisons.omnibus.length); assert.equal(comparison.pairs.length, expectedPairs.length);
    comparison.pairs.forEach((text,index)=>assert.ok(text.includes(expectedPairs[index].incrementLabel))); assert.match(comparison.caption, /not a difference in salary levels/);
    await evaluate('document.querySelector(".nbaEvidenceComparisons").scrollIntoView({block:"start"});');
    screenshots.push(await screenshot('tmp_nba_evidence_comparisons.png'));
    await evaluate('document.querySelector(".nbaEvidenceRobustness").open=true;document.querySelector("[data-nba-evidence-download]").click();document.querySelector("[data-nba-checks-download]").click();');
    downloaded = await evaluate('Promise.all(__nbaEvidenceBlobs.map(b=>b.text()))');
    assert.equal(downloaded.length, 2);
    csvRows = downloaded[0].split('\r\n').length;
    const sensitivityCount = groups.reduce((sum, g) => sum + expected.groups[g].sensitivities.filter(s => s.available).reduce((n, s) => n + s.estimates.length, 0), 0);
    assert.equal(csvRows, 1 + groups.reduce((n,g)=>n+expected.groups[g].estimates.length,0) + expected.comparisons.omnibus.length + expected.comparisons.pairwise.length + sensitivityCount);
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
      assert.equal(await evaluate(`document.querySelectorAll('[aria-label="NBA salary coefficients"] tbody tr').length`), expectedPrediction.groups[group].features.length);
      const validationKeys = ['deployedRidge','fullReferenceRidge','portableTree','baseline'].filter(key=>Number.isFinite(expectedPrediction.groups[group].metrics[key]?.logR2));
      const validationRows = await evaluate(`Array.from(document.querySelectorAll('[aria-label="Held-out NBA salary validation"] tbody tr')).map(row=>Array.from(row.cells).map(cell=>cell.textContent))`);
      assert.equal(validationRows.length, validationKeys.length);
      validationKeys.forEach((key,index)=>{const metric=expectedPrediction.groups[group].metrics[key];assert.equal(validationRows[index][1],metric.logR2.toFixed(3));assert.equal(validationRows[index][2],metric.logRMSE.toFixed(3));});
    }
    assert.equal(await evaluate('__nbaEvidenceBasisChanges'), 0);
    await waitFor('typeof tbAllComputed!=="undefined" && tbAllComputed[league+"_Wings"]?.some(r=>r.NBAModel_calc)', 'an actual NBA-valued player profile');
    await evaluate('showDashboardPage("pageTeams","pageTeams",{skipHeavyLoad:true,forcePage:true});openProfile(tbAllComputed[league+"_Wings"].find(r=>r.NBAModel_calc));document.getElementById("mNbaValuationPanel").open=false;');
    assert.equal(await evaluate('!document.getElementById("mNbaCoachShortcut").hidden && document.getElementById("mNbaCoachShortcut").getBoundingClientRect().height>0'), true);
    screenshots.push(await screenshot('tmp_nba_coefficient_profile.png'));
    await evaluate('_dataRefreshScoredReferences(league,"Wings");document.querySelector("#mNbaCoachShortcut [data-nba-coach-summary]").click();');
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await delay(350);
    profileShortcut = await evaluate('({page:window._dashboardCurrentPageId,profileClosed:document.getElementById("modalBack").style.display==="none",profileCleared:_currentProfilePlayer===null,group:document.getElementById("nbaModelGroup").value,open:document.getElementById("nbaValuationPanel").open,detailsOpen:document.getElementById("nbaEvidenceDetails").open,focused:document.activeElement===document.querySelector("#nbaValuationPanel>summary"),coach:document.querySelector(\'[data-nba-view="evidence"]\').getAttribute("aria-pressed")==="true"})');
    assert.deepEqual(profileShortcut, {page:'pagePlayers',profileClosed:true,profileCleared:true,group:'Wings',open:true,detailsOpen:false,focused:true,coach:true});
    assert.equal(await evaluate('__nbaEvidenceBasisChanges'), 0);
    screenshots.push(await screenshot('tmp_nba_evidence.png'));
    await call('Emulation.setDeviceMetricsOverride', { width: 375, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate('document.getElementById("nbaValuationPanel").scrollIntoView({block:"start"});');
    mobile = await evaluate('(()=>{var p=document.getElementById("nbaValuationPanel"),r=p.getBoundingClientRect();return {viewport:innerWidth,left:r.left,right:r.right,client:p.clientWidth,scroll:p.scrollWidth,buttons:Array.from(p.querySelectorAll("[data-nba-view]")).map(b=>({height:b.getBoundingClientRect().height,width:b.getBoundingClientRect().width})),tables:Array.from(p.querySelectorAll(".nbaModelTableWrap")).map(t=>({client:t.clientWidth,scroll:t.scrollWidth}))};})()');
    assert.ok(mobile.left >= -1 && mobile.right <= mobile.viewport + 1); assert.ok(mobile.scroll <= mobile.client + 1); assert.ok(mobile.buttons.every(b => b.height >= 44));
    mobile.matrix = await evaluate('(()=>{var t=document.querySelector(\'[aria-label="Cross-position coefficient table"]\'),s=getComputedStyle(t);t.scrollLeft=t.scrollWidth;var moved=t.scrollLeft;t.scrollLeft=0;return {client:t.clientWidth,scroll:t.scrollWidth,moved,overflow:s.overflowX,visible:t.checkVisibility()};})()');
    assert.equal(mobile.matrix.visible,true); assert.ok(mobile.matrix.scroll>mobile.matrix.client); assert.ok(mobile.matrix.moved>0); assert.match(mobile.matrix.overflow,/auto|scroll/);
    mobile.matrix.clippedFields = await evaluate('Array.from(document.querySelectorAll(".nbaCoefficientMatrix .nbaMatrixCI,.nbaCoefficientMatrix .nbaMatrixP,.nbaCoefficientMatrix .nbaMatrixPair>div")).filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>({text:el.textContent,client:el.clientWidth,scroll:el.scrollWidth}))');
    assert.deepEqual(mobile.matrix.clippedFields, [], 'Horizontal scrolling must expose complete values, intervals and p-values inside each cell');
    assert.equal(await evaluate('document.getElementById("modalBack").style.display==="none"&&_currentProfilePlayer===null'),true,'Background updates must not reopen a closed profile');
    screenshots.push(await screenshot('tmp_nba_evidence_mobile.png'));
    await evaluate('document.querySelector(".nbaCoefficientMatrixWrap").scrollIntoView({block:"start"});');
    screenshots.push(await screenshot('tmp_nba_coefficient_mobile_table.png'));
    await evaluate('document.querySelector(".nbaCoefficientMatrixWrap").scrollLeft=10000;');
    screenshots.push(await screenshot('tmp_nba_coefficient_mobile_table_right.png'));
    await evaluate('demoIsGuestMode=__nbaEvidenceGate;refreshGuestDemoUI();');
    const guest = await evaluate('({tables:document.querySelectorAll("#nbaModelContent table").length,charts:document.querySelectorAll("#nbaModelContent svg").length,controlsHidden:document.getElementById("nbaModelControls").hidden,downloads:document.querySelectorAll("#nbaModelContent [data-nba-evidence-download],#nbaModelContent [data-nba-checks-download],#nbaModelContent [data-nba-coefficient-download],#nbaModelContent .nbaCoachBrief").length,profileShortcutHidden:document.getElementById("mNbaCoachShortcut").hidden})');
    assert.deepEqual(guest, { tables: 0, charts: 0, controlsHidden: true, downloads: 0, profileShortcutHidden: true }); assert.deepEqual(exceptions, []);
    console.log(JSON.stringify({ passed: true, url: base, model, coach, matrix:{rows:matrix.rows.length,groups:groups.length,coefficientAndEvidenceValues:matrix.rows.reduce((total,row)=>total+row.cells.reduce((n,cell)=>n+Object.keys(cell.values).length,0),0),excludedCells:matrix.rows.reduce((total,row)=>total+row.cells.filter(cell=>Object.keys(cell.values).length===0).length,0),sourceValuesMatch:true,csvRows:matrixCsvRows}, pdf, profileShortcut, evidenceGroups, comparison: { overall: comparison.overall, pairs: comparison.pairs.length, focusPreserved: true }, csvRows, checksSummary, keyboard, predictionBasisChanges: 0, mobile, guest, screenshots, exceptions }, null, 2));
  } finally {
    try { await evaluate('if(window.__nbaEvidenceGate)demoIsGuestMode=__nbaEvidenceGate;if(window.__nbaEvidenceSetter)NbaValuation.setEnabled=__nbaEvidenceSetter;if(window.__nbaEvidenceUrl)URL.createObjectURL=__nbaEvidenceUrl;if(typeof closeProfile==="function")closeProfile();if(typeof refreshGuestDemoUI==="function")refreshGuestDemoUI();'); if (initialization) await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: initialization.identifier }); await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }); } catch (_) {}
    pending.forEach(p => clearTimeout(p.timer)); ws.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
