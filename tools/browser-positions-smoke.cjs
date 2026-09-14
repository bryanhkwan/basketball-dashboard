'use strict';
// Browser integration check: start an isolated Chromium/Edge with
// --headless=new --remote-debugging-port=9223 --user-data-dir=<temporary directory>.
// Run: node tools/browser-positions-smoke.cjs [dashboard URL]
// Uses only Node built-ins. The browser profile must be disposable (guest test session).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = process.argv[2] || 'http://127.0.0.1:8766/';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async()=>{
  const tabs=await fetch('http://127.0.0.1:9223/json/list').then(r=>r.json());
  const tab=tabs.find(t=>t.type==='page' && !t.url.startsWith('edge://'));
  if(!tab) throw new Error('No disposable browser test tab available');
  const ws=new WebSocket(tab.webSocketDebuggerUrl), pending=new Map(), exceptions=[];
  let id=0;
  ws.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){const item=pending.get(message.id);if(item){pending.delete(message.id);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}}
    if(message.method==='Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
  });
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  function call(method,params={}){return new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
  async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
  async function waitFor(expression,label){const start=Date.now();while(Date.now()-start<90000){if(await evaluate(expression))return;await delay(400);}throw new Error('Timed out: '+label+'; '+await evaluate('JSON.stringify({league:window.league,status:window._leagueDataStatus,warn:document.getElementById("warn")?.textContent})'));}
  try{
    await call('Runtime.enable');await call('Page.enable');
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await call('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.setItem("ncaa_guest_mode","1"); sessionStorage.setItem("ncaa_guest_demo_tour_seen","1");'});
    await call('Page.navigate',{url:base});
    await waitFor('typeof window.authEnterGuest === "function" && document.readyState === "complete"','dashboard scripts');
    await evaluate('if(!window._leagueDataStatus?.MBB?.loading && !window._leagueDataStatus?.MBB?.ready) authEnterGuest(); sessionStorage.setItem("ncaa_guest_demo_tour_seen","1");');
    const output=[];
    for(const league of ['MBB','WBB']){
      console.log('Checking '+league+' in browser...');
      if(league==='WBB') await evaluate('document.getElementById("tabWBB").click()');
      await waitFor('window.league==='+JSON.stringify(league)+' && ["Guards","Wings","Bigs"].every(group=>window.tbAllComputed?.['+JSON.stringify(league)+'+"_"+group]?.length>0)',league+' three pools');
      await evaluate('authShowDashboard(); document.getElementById("tabWings").click();');
      await waitFor('window.pos==="Wings" && window.computed.length>0 && window.computed.every(r=>r.Position==="Wings")','wing tab');
      const state=await evaluate('({league:league,pos:pos,pools:Object.fromEntries(["Guards","Wings","Bigs"].map(g=>[g,tbAllComputed[league+"_"+g].length])),rendered:document.getElementById("playersBody").textContent.includes("Wings"),inferred:computed.filter(r=>r.PositionSource==="Inferred").length,tab:document.getElementById("tabWings").classList.contains("active"),height:computed.filter(r=>r.Height).length})');
      assert.equal(state.rendered,true);assert.equal(state.tab,true);assert.ok(state.height>0);
      await evaluate('openProfile(computed.find(r=>r.PositionSource==="Inferred")||computed[0])');
      const profile=await evaluate('({subtitle:document.getElementById("mSub").textContent,reason:document.getElementById("mMeta").textContent})');
      assert.match(profile.subtitle,/Wings/);assert.match(profile.reason,/inferred|Listed|provisional/i);
      await evaluate('closeProfile()');
      const screenshot=await call('Page.captureScreenshot',{format:'png'});
      const filename=path.resolve(__dirname,'..','tmp_positions_'+league.toLowerCase()+'.png');
      fs.writeFileSync(filename,Buffer.from(screenshot.data,'base64'));
      output.push({...state,profile:profile.subtitle,screenshot:filename});
    }
    assert.deepEqual(exceptions,[],'Browser JavaScript errors');
    console.log(JSON.stringify({url:base,passed:true,leagues:output,exceptions},null,2));
  }finally{ws.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
