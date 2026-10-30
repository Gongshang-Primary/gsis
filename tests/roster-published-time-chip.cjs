'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom'),fixture=require('./roster701-fixture.cjs');
const source=fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8');
new vm.Script(source);
assert(source.includes('data-publication-chip role="status" aria-live="polite"'));
const a=source.indexOf(' const dateFormat='),b=source.indexOf(' const singaporeToday=',a),c=source.indexOf(' function updatePublicationChip('),d=source.indexOf(' function updatePublish(',c);
assert(c>0&&d>c);
const dom=new JSDOM('<main><label><input type="date" data-ops-date><span class="hint"></span></label><span data-publication-chip></span></main>'),root=dom.window.document.querySelector('main');
const scope={Intl,Date,$:(s,q)=>s.root.querySelector(q)};
const {updatePublicationChip:update}=vm.runInNewContext(source.slice(a,b)+source.slice(c,d)+';({updatePublicationChip})',scope);
const chip=root.querySelector('[data-publication-chip]'),s={root,date:'2026-10-29',data:{date:'2026-10-29',publishedAt:null}};
update(s);assert.equal(chip.textContent,'Not published');
s.data={date:s.date,publishedAt:'2026-10-28T22:55:34.000Z',publishedRevision:3,allocationRevision:3,publicationPreview:{count:0},publishedBy:'private@example.invalid'};
update(s);assert.equal(root.querySelector('[data-publication-chip]'),chip);assert.equal(chip.textContent,'Published 06:55');assert.equal(chip.dataset.state,'published');assert.equal(chip.title,'29 Oct 2026, 06:55:34 SGT');assert(!root.innerHTML.includes('private@example.invalid'));
s.data.publicationPreview.count=1;update(s);assert.equal(chip.textContent,'Published 06:55 · changes not yet visible');assert.equal(chip.dataset.state,'changed');
s.date='2026-10-30';update(s);assert.equal(chip.textContent,'Checking publication…');assert.equal(chip.title,'');
s.data={date:s.date,publishedAt:null};update(s);assert.equal(chip.textContent,'Not published');
s.data.publishedAt='invalid';update(s);assert.equal(chip.textContent,'Publication time unavailable');

// Exercise production publication snapshots: the two counters are independent.
const f=fixture();
Object.assign(f.ctx,{minute:360,now:Date.parse(f.date+'T06:00:00+08:00')});
f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.baselineDays=structuredClone(f.ctx.days);
f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3]});
const assign=(staffId,period=2)=>f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[f.O.demand(f.ctx,f.state,f.date).find(d=>d.period===period).id],staffId});
const publish=()=>f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date]||0,notifyMode:'none',expectedPublicationRevision:f.state.dailyPublicationStates[f.date]?.revision||0});
const read=()=>f.O.read(f.state,f.ctx,{operation:'allocation',date:f.date});
assign('bob');assign('bob',3);assign('charlie');assign('bob');publish();
s.date=f.date;s.data=read();assert(s.data.allocationRevision>s.data.publishedRevision);update(s);assert.equal(chip.dataset.state,'published','many saved edits are fully visible after first publication');
for(let i=0;i<8;i++)publish();
assign('charlie');s.data=read();assert(s.data.allocationRevision<s.data.publishedRevision);update(s);assert.equal(chip.dataset.state,'changed','new edits remain pending after repeated publications');
publish();s.data=read();update(s);assert.equal(chip.dataset.state,'published');

// Run the actual date handler and loader with the cache read deliberately held.
(async()=>{
 let releaseCache,cacheStarted=false;
 Object.assign(scope,{
  refreshIntake(){},restoreDraft:()=>false,hideProgress(){},freshness(){},isLive:()=>true,
  viewCache:new Map(),cacheKey:state=>state.date,
  cachedAllocation:()=>{cacheStarted=true;return new Promise(resolve=>releaseCache=resolve);},
  pendingFor:()=>null,reload:async()=>false,dateText:value=>value,confirm:()=>true
 });
 const loadStart=source.indexOf(' async function loadDate('),loadEnd=source.indexOf(' async function verifyCachedAllocation(',loadStart);
 const bindStart=source.indexOf(' function bindDate('),bindEnd=source.indexOf(' function periodPicker(',bindStart);
 assert(loadStart>0&&loadEnd>loadStart&&bindStart>0&&bindEnd>bindStart);
 vm.runInNewContext(source.slice(loadStart,loadEnd)+source.slice(bindStart,bindEnd)+';this.bindDate=bindDate;',scope);
 Object.assign(s,{page:'Assign Relief',readTicket:0,table:{selected:new Set(),page:0},dirty:false,busy:false});
 const input=root.querySelector('[data-ops-date]');input.value=s.date;scope.bindDate(s);
 input.value='2026-10-30';const loading=input.onchange();
 assert(cacheStarted);assert.equal(s.date,'2026-10-30');
 assert.equal(chip.textContent,'Checking publication…','old publication clears before the date loader resolves');assert.equal(chip.title,'');
 releaseCache(null);await loading;
 dom.window.close();
 console.log('PASS publication chip: production publication changes, independent counters, delayed date switch, Singapore time and no publisher');
})().catch(error=>{console.error(error);process.exitCode=1;});
