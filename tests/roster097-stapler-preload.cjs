'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const date='2026-10-22',today='2026-10-21',copy=x=>JSON.parse(JSON.stringify(x));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function harness({manager=false,initialDate,preload=true}={}){
 const dom=new JSDOM('<main></main>',{url:'https://roster.test',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,q=s=>w.document.querySelector(s);
 for(const file of ['shared/roster-stapler.js','roster-update/public/roster-stapler-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
 const plan=w.GSISRosterStapler.create({date,id:'baseline',verified:true,schoolDay:true,periods:[{period:0,startMinutes:420,endMinutes:450}],teachers:[{staffId:'a',name:'Alice',cells:[['EL','1A','Preloaded room','']]}],formClasses:[{id:'c',name:'1A'}]}),calls=[],pending=[],reads={dates:0,plan:0};
 const dates={revision:4,confirmedAccess:'available',dates:[{date,name:'Preloaded suspension',status:'Confirmed',canListConfirmed:true,canViewConfirmed:true,confirmedRevision:2}]};
 const cache={getDatesView(){reads.dates++;return copy(dates);},getPlan(day){reads.plan++;return day===date?{date,baselineId:plan.baselineId,revision:4,viewMode:'confirmed',plan:copy(plan),confirmedPlan:copy(plan),confirmedRevision:2,baselineChanged:false}:null;}};
 const ctx={container:q('main'),today:()=>today,initialDate,profile:{user:{email:'teacher@school.test',staffId:'a',smc:manager,admin:false}},status(){},...(preload?{timetablePreload:cache}:{}),api:(_,input)=>{calls.push(input);const d=deferred();pending.push(d);return d.promise;}};
 const freshList=()=>({...copy(dates),dates:[{...dates.dates[0],name:'Fresh suspension'},{date:'2026-12-01',name:'Beyond preload window',canListConfirmed:true,canViewConfirmed:true}],sponsors:[{id:'s',name:'Sponsor'}],sponsorships:[]});
 const freshPlan=()=>({date,plan:copy(plan),revision:5,staplerRevision:3,planningAllowed:false,canEdit:false,canConfirm:false,viewMode:'confirmed',confirmed:{revision:3},people:[],accessRequests:[]});
 return {dom,w,q,ctx,cache,dates,plan,calls,pending,reads,freshList,freshPlan,close(){w.RosterStaplerUI.unmount();dom.window.close();}};
}
(async()=>{
 let h=harness();try{
  const rendering=h.w.RosterStaplerUI.render(h.ctx);
  assert.match(h.q('[data-confirmed-suspensions]').textContent,/Preloaded suspension/,'preloaded confirmed dates render before the network response');
  assert.match(h.q('[data-stapler-message]').textContent,/preloaded.*checking|checking.*latest/i);
  assert.equal(h.q('[data-date-entry] button').disabled,true,'cached dates never grant request permission');
  assert.deepEqual(h.calls.map(x=>x.operation),['staplerDates']);
  h.pending[0].resolve(h.freshList());await rendering;
  assert.match(h.q('[data-confirmed-suspensions]').textContent,/Fresh suspension/);assert.match(h.q('[data-confirmed-suspensions]').textContent,/Beyond preload window/,'authoritative full list replaces bounded preload');
  assert.equal(h.q('[data-date-entry] button').disabled,false);assert.match(h.q('[data-confirmed-suspensions]').textContent,/confirmed suspended timetable.*Timetable from the main screen/);
 }finally{h.close();}
 h=harness({manager:true});try{const rendering=h.w.RosterStaplerUI.render(h.ctx);assert.equal(h.reads.dates,0,'bounded teacher preload cannot replace manager list');assert.doesNotMatch(h.q('main').textContent,/Preloaded suspension/);h.pending[0].resolve(h.freshList());await rendering;}finally{h.close();}
 h=harness();try{const rendering=h.w.RosterStaplerUI.render(h.ctx);h.pending[0].reject(Object.assign(Error('Access denied'),{status:403}));await rendering;assert.doesNotMatch(h.q('main').textContent,/Preloaded suspension/,'permission denial clears cached teacher date data');h.q('[data-refresh-dates]').click();assert.doesNotMatch(h.q('main').textContent,/Preloaded suspension/,'refresh cannot reseed denied preload');h.pending[1].resolve(h.freshList());await new Promise(r=>setTimeout(r,0));}finally{h.close();}
 h=harness({initialDate:date});try{
  const rendering=h.w.RosterStaplerUI.render(h.ctx);
  assert.match(h.q('.planner-grid').textContent,/Preloaded room/,'confirmed plan renders before verification returns');
  assert.match(h.q('[data-stapler-message]').textContent,/Ready on this device/i);
  for(const selector of ['[data-save]','[data-confirm]','[data-import]','[data-add-teacher]'])assert(h.q(selector).hidden,selector+' remains hidden');
  assert.equal(h.q('[data-tile][draggable=true]'),null);assert.deepEqual(h.calls.map(x=>x.operation),['stapler']);
  const fresh=h.freshPlan();fresh.plan.tiles[0].venue='Fresh room';h.pending[0].resolve(fresh);await rendering;assert.match(h.q('.planner-grid').textContent,/Fresh room/);assert.match(h.q('[data-plan-meta]').textContent,/revision 3/);
 }finally{h.close();}
 h=harness({manager:true,initialDate:date});try{const rendering=h.w.RosterStaplerUI.render(h.ctx);assert.equal(h.reads.plan,0,'manager must load authoritative planner');assert.equal(h.q('.planner-grid'),null);h.pending[0].resolve(h.freshPlan());await rendering;}finally{h.close();}
 h=harness({initialDate:date});try{const rendering=h.w.RosterStaplerUI.render(h.ctx);h.pending[0].reject(Object.assign(Error('Sign in again'),{status:401}));await new Promise(r=>setTimeout(r,0));assert.equal(h.q('.planner-grid'),null,'authorization failure removes cached plan');assert.doesNotMatch(h.q('main').textContent,/Preloaded suspension/);h.pending[1].reject(Object.assign(Error('Sign in again'),{status:401}));await rendering;}finally{h.close();}
 h=harness({initialDate:date});try{h.cache.getPlan=()=>({date,baselineId:'baseline',viewMode:'planner',plan:copy(h.plan),confirmedRevision:2});const rendering=h.w.RosterStaplerUI.render(h.ctx);assert.equal(h.q('.planner-grid'),null,'draft or editor snapshots cannot warm teacher preview');h.pending[0].resolve(h.freshPlan());await rendering;}finally{h.close();}
 h=harness({initialDate:date});try{const rendering=h.w.RosterStaplerUI.render(h.ctx);h.pending[0].reject(Object.assign(Error('Service unavailable'),{status:503}));await rendering;assert.match(h.q('.planner-grid').textContent,/Preloaded room/,'a temporary read failure retains explicitly labelled confirmed preview');assert.match(h.q('[data-stapler-message]').textContent,/preloaded confirmed timetable/);assert(h.q('[data-save]').hidden);assert.deepEqual(h.calls.map(x=>x.operation),['stapler']);}finally{h.close();}
 h=harness({preload:false});try{const rendering=h.w.RosterStaplerUI.render(h.ctx);assert.doesNotMatch(h.q('main').textContent,/Preloaded suspension/);h.pending[0].resolve(h.freshList());await rendering;assert.match(h.q('[data-confirmed-suspensions]').textContent,/Fresh suspension/);}finally{h.close();}
 console.log('PASS Stapler preload: immediate bounded teacher dates and confirmed read-only plan; authoritative refresh, manager isolation, authorization purge and no-preload compatibility.');
})().catch(e=>{console.error(e);process.exitCode=1;});
