'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function dashboard(){
  const elements = new Map(), timers = new Map();
  let id = 0;
  function element(){ return { value:'', textContent:'', style:{display:'none'}, dataset:{}, options:[], selectedIndex:-1,
    classList:{add(){},remove(){},contains(){return false;},toggle(){}}, addEventListener(){}, appendChild(){}, querySelectorAll(){return [];} }; }
  function get(key){ if(!elements.has(key)) elements.set(key,element()); return elements.get(key); }
  const c = vm.createContext({ console, PlayerBios:require('../modules/player-bios.js'),
    setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(key){timers.delete(key);},requestAnimationFrame(fn){timers.set(++id,fn);return id;},
    localStorage:{getItem(){return null;}}, document:{getElementById:get,createElement:element,querySelectorAll(){return [];}} });
  c.window=c;
  ['config','data'].forEach(name=>vm.runInContext(fs.readFileSync(path.join(root,'modules',name+'.js'),'utf8'),c));
  c.initDataDOMRefs();
  c.renderPlayers=()=>{};
  c.runTimers=()=>{let remaining=25;while(timers.size&&remaining--){const [key,fn]=timers.entries().next().value;timers.delete(key);fn();}assert.ok(remaining>0);};
  return c;
}

test('precise provider positions take priority over size and performance',()=>{
  const c=dashboard();
  const listed={PG:'Guards',SG:'Guards',G:'Guards',SF:'Wings','G-F':'Wings','F/G':'Wings','Guard / Forward':'Wings',PF:'Bigs',C:'Bigs','Center-Forward':'Bigs'};
  for(const league of ['MBB','WBB']) for(const [Pos,group] of Object.entries(listed)){
    const result=c.classifyPlayerPosition({Pos,Height:96,APG:8,BPG:3,RPG:10,G:30,MP:30},league);
    assert.equal(result.group,group,league+' '+Pos);assert.equal(result.source,'Listed');
  }
});

test('ambiguous forwards use league size and role evidence with a sample requirement',()=>{
  const c=dashboard();
  const forward={Pos:'F',G:30,MP:30,Height:81,APG:3.7,RPG:6.8,BPG:0.31,'3PA/G':4.2,'FGA/G':17.2};
  assert.equal(c.classifyPlayerPosition(forward,'MBB').group,'Wings');
  assert.equal(c.classifyPlayerPosition({...forward,APG:4,RPG:10.2,BPG:0.6,'FGA/G':13.7,'3PA/G':3.6},'MBB').group,'Bigs');
  assert.equal(c.classifyPlayerPosition({...forward,Height:73,APG:3.7,RPG:6.7,BPG:0.7,'3PA/G':2.1,'FGA/G':15},'WBB').group,'Wings');
  assert.equal(c.classifyPlayerPosition({...forward,Height:74,APG:3.8,RPG:7.7,BPG:1.6,'3PA/G':4,'FGA/G':12.7},'WBB').group,'Bigs');
  assert.equal(c.classifyPlayerPosition({...forward,G:1},'MBB').group,'Bigs','one game must not establish a wing role');
  assert.equal(c.classifyPlayerPosition({Pos:'F',Height:72},'WBB').group,'Wings');
  assert.equal(c.classifyPlayerPosition({Pos:'F',Height:75},'WBB').group,'Bigs');
});

test('missing height and position remain explicit provisional inferences',()=>{
  const c=dashboard();
  for(const league of ['MBB','WBB']) for(const Pos of ['', 'ATH','NA','F']){
    const r=c.classifyPlayerPosition({Pos,Height:null,G:0},league);
    assert.equal(r.source,'Inferred');assert.equal(r.confidence,'Low');assert.match(r.reason,/insufficient/);
  }
});

test('legacy two-group roster labels migrate from their original listed positions',()=>{
  const c=dashboard();
  assert.equal(c.bucketPosition({Position:'Guards',Pos:'G-F',_tbPosGroup:'guard'}),'Wings');
  assert.equal(c.bucketPosition({Position:'Bigs',Pos:'SF',_tbPosGroup:'big'}),'Wings');
  assert.equal(c.bucketPosition({Position:'Bigs',Pos:'F',Height:72,_league:'WBB'}),'Wings');
});

test('both leagues partition every row once and score three pools without changing active percentiles',()=>{
  const c=dashboard();
  for(const league of ['MBB','WBB']){
    c.league=league;c.pos='Guards';c.loadScoringWeight();c.applyLeagueDefaults(true);
    assert.equal(c.currentWeights.Wings.reduce((sum,r)=>sum+r.w,0),100);
    const source=[];
    for(const [j,Pos] of ['PG','SF','C'].entries()) for(let i=0;i<8;i++) source.push({
      Player:Pos+' '+i,Team:'Test',Pos,Height:Pos==='C'?82:77,Conference:'MAC',G:30,MP:20+i,
      PPG:6+j*4+i,'eFG%':0.45+i*.02,'3P%':0.3+i*.01,'FT%':0.7+i*.01,APG:j===0?2+i:1+i/3,
      RPG:2+j*2+i/2,BPG:j*.4+i/10,SPG:1+i/10,TOPG:1.5,'A/TO':1.3+i/10,'3PA/G':3,'FGA/G':9,
      BPM:i,'WS/40':.1+i*.01,DRtg:105-i,'OR%':10+i,'DR%':15+i,'USG%':20+i
    });
    c._dataCommitLeaguePlayers(league,source);
    c.reloadActiveSheet();
    const active=c.computed, distribution=c.statDist, average=c.lastPerfAvg;
    c.runTimers();
    assert.equal(c.computed,active);assert.equal(c.statDist,distribution);assert.equal(c.lastPerfAvg,average);
    const all=[];
    for(const group of ['Guards','Wings','Bigs']){
      const pool=c.tbAllComputed[league+'_'+group];assert.equal(pool.length,8);
      pool.forEach(r=>{assert.equal(r.Position,group);assert.equal(r._league,league);assert.ok(Number.isFinite(r.Score));assert.ok(Number.isFinite(r.ActualValuation_calc));assert.ok(Number.isFinite(r._pct_PPG));all.push(r.Player);});
    }
    assert.equal(new Set(all).size,source.length);
    assert.equal(c.kpiPlayers.textContent,'8');
  }
});
