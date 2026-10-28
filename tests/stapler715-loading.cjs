'use strict';
// Legacy lease metadata stays readable; current planner edits require permission, not an exclusive lease.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{performance}=require('node:perf_hooks'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),clone=value=>JSON.parse(JSON.stringify(value));
const baselineDir=process.argv[2],now=Date.parse('2026-10-19T04:00:00Z'),dateAt=i=>new Date(now+i*86400000).toISOString().slice(0,10),user={email:'admin@school.test',staffId:'admin',admin:true,smc:true},input={operation:'staplerDates',leaseSessionId:'this-session'};
function leases(source,delayMs=0){
 const properties={},counts={getProperties:0,getProperty:0};
 for(let i=0;i<56;i++)properties['ROSTER_STAPLER_LEASE:'+dateAt(i)]=JSON.stringify({fence:i,owner:i%2?user.email:'other@school.test',staffId:i%2?user.staffId:'other',session:'this-session',name:i%2?'Admin':'Other',until:i>=50&&i<55?now-1:now+180000});
 const wait=()=>{if(delayMs)Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,delayMs);},props={getProperties(){counts.getProperties++;wait();return {...properties};},getProperty(key){counts.getProperty++;wait();return properties[key]||null;}},box={Date:class extends Date{static now(){return now;}},console,props_:()=>props,error_:(status,message)=>{throw Object.assign(Error(message),{status});},GSISRosterOperations:{staplerPermission:(_,ctx,date)=>date!==dateAt(55)}};
 vm.createContext(box);vm.runInContext(source,box);
 const fresh=()=>({dates:Array.from({length:40},(_,i)=>({date:dateAt(i),status:'Draft',draftRevision:2}))});
 const start=performance.now(),value=clone(box.rosterStaplerLeaseAttach_(fresh(),user,input,{},{})),elapsedMs=performance.now()-start;
 return {box,properties,props,counts,value,elapsedMs,refresh:()=>clone(box.rosterStaplerLeaseAttach_(fresh(),user,input,{},{}))};
}
const current=leases(read('backend/StaplerLeases.gs'),10);
assert.equal(current.value.dates.length,50,'include active unsaved dates, exclude expired and unauthorised ones');
assert.deepEqual(current.counts,{getProperties:1,getProperty:0},'date list makes exactly one Properties service call');
assert.equal(current.value.dates.find(r=>r.date===dateAt(1)).lock.mine,true);
current.properties['ROSTER_STAPLER_LEASE:'+dateAt(1)]=JSON.stringify({fence:99,owner:'new@school.test',name:'New editor',until:now+10000});
assert.equal(current.refresh().dates.find(r=>r.date===dateAt(1)).lock.ownerName,'New editor','repeat loads use fresh metadata');
assert.equal(current.box.rosterStaplerLeaseRead_(dateAt(1)).fence,99,'write paths still read current ownership separately');
current.properties['ROSTER_STAPLER_LEASE:'+dateAt(1)]='broken';assert.throws(()=>current.refresh(),e=>e.status===503,'corrupt metadata remains an error');
const metrics={scope:'Local production-function benchmark, not live Google Apps Script latency',fixture:{savedDates:40,activeUnsavedDates:10,expiredUnsavedDates:5,unapprovedUnsavedDates:1,simulatedPropertyCallMs:10},after:{serviceCalls:1,elapsedMs:Number(current.elapsedMs.toFixed(1))}};
if(baselineDir){const before=leases(fs.readFileSync(path.join(baselineDir,'StaplerLeases.gs'),'utf8'),10);assert.deepEqual(before.value,current.value,'permission and ownership projection is unchanged');metrics.before={serviceCalls:before.counts.getProperties+before.counts.getProperty,elapsedMs:Number(before.elapsedMs.toFixed(1))};}

function deferred(){let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};}
const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,q=selector=>w.document.querySelector(selector),flush=()=>new Promise(resolve=>setImmediate(resolve));
w.eval(read('shared/roster-stapler.js'));w.eval(read('roster-update/public/roster-stapler-ui.js'));w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
const calls=[],requests=[];let savedSubject='EL';
const ctx={container:q('#content'),initialDate:dateAt(0),today:()=>dateAt(0),profile:{user},status(){},api:(_,p)=>{calls.push(clone(p));const d=deferred();requests.push({input:p,...d});return d.promise;}};
const take=operation=>{const index=requests.findIndex(r=>r.input.operation===operation);assert(index>=0,'expected '+operation);return requests.splice(index,1)[0];};
const plan=date=>w.GSISRosterStapler.create({date,id:'baseline',verified:true,schoolDay:true,periods:[{period:0,startMinutes:420,endMinutes:450}],teachers:[{staffId:'a',name:'Alice',cells:[[savedSubject,'1A','Room','']]}],formClasses:[{id:'c',name:'1A'}]});
const view=(date,confirmed=false)=>({date,plan:plan(date),revision:3,staplerRevision:2,planningAllowed:true,canEdit:false,canConfirm:false,confirmed:confirmed?{revision:2}:null,lock:{fence:1,mine:false,active:false},accessRequests:[],people:[{id:'a',name:'Alice',active:true}]});
const resolveRead=async(date,confirmed=false)=>{take('stapler').resolve(view(date,confirmed));await flush();};
(async()=>{
 try{
  let loading=w.RosterStaplerUI.render(ctx);await resolveRead(dateAt(0));await loading;
  assert(q('.planner-grid'),'fresh timetable is available after its initial read');assert.equal(q('[data-save]').disabled,false);assert.equal(q('[data-import]').disabled,false);assert.match(q('[data-editing-lock]').textContent,/Other planners can work at the same time/);assert.equal(w.RosterStaplerUI.isDirty(),false);assert.equal(requests.length,0,'opening a planner makes no lease write');
  q('[data-edit-tile]').click();const form=q('dialog form');form.elements.venue.value='Retained local hall';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(requests.length,0,'editing makes no request');assert.equal(w.RosterStaplerUI.isDirty(),true);q('[data-confirm]').onclick();await flush();assert.equal(requests.length,0,'Confirm cannot implicitly save the local plan');
  w.RosterStaplerUI.unmount();loading=w.RosterStaplerUI.render(ctx);await resolveRead(dateAt(0));await loading;assert.match(q('.planner-grid').textContent,/Retained local hall/,'reopening restores the durable local copy');assert.equal(q('[data-confirm]').disabled,true);
  q('[data-save]').click();await flush();const save=take('saveStapler');assert.equal(save.input.basePlan.tiles[0].venue,'Room');assert.equal(save.input.plan.tiles[0].venue,'Retained local hall');save.resolve({...view(dateAt(0)),plan:clone(save.input.plan),staplerRevision:3});await flush();assert.equal(w.RosterStaplerUI.isDirty(),false);assert.equal(q('[data-confirm]').disabled,false);
  q('[data-back-dates]').click();take('staplerDates').resolve({revision:4,dates:[{date:dateAt(0),status:'Draft',draftRevision:2}],sponsors:[]});await flush();
  savedSubject='SCI';q('[data-open-date]').click();await resolveRead(dateAt(0));assert(q('.planner-grid').textContent.includes('SCI'),'returning without local changes reloads the latest saved timetable');
  q('[data-plan-date]').value=dateAt(1);q('[data-plan-date]').dispatchEvent(new w.Event('change'));const oldRead=take('stapler');w.RosterStaplerUI.unmount();loading=w.RosterStaplerUI.render({...ctx,initialDate:dateAt(2)});await resolveRead(dateAt(2));await loading;oldRead.resolve(view(dateAt(1)));await flush();assert.equal(q('[data-plan-date]').value,dateAt(2),'late response for a previous date cannot replace the current date');assert.equal(q('[data-save]').disabled,false);
  q('[data-plan-date]').value=dateAt(3);q('[data-plan-date]').dispatchEvent(new w.Event('change'));const staleRead=take('stapler');w.RosterStaplerUI.unmount();loading=w.RosterStaplerUI.render({...ctx,initialDate:undefined});take('staplerDates').resolve({revision:5,dates:[],sponsors:[]});await flush();staleRead.resolve(view(dateAt(3)));await flush();assert(q('[data-date-entry]'),'late timetable response cannot replace the dates list');assert.equal(requests.length,0);
  loading=w.RosterStaplerUI.render(ctx);const previousSameDate=take('stapler'),newLoading=w.RosterStaplerUI.render(ctx),currentSameDate=take('stapler');savedSubject='NEWEST';currentSameDate.resolve(view(dateAt(0)));await newLoading;savedSubject='STALE';previousSameDate.resolve(view(dateAt(0)));await loading;assert.match(q('.planner-grid').textContent,/NEWEST/);assert.doesNotMatch(q('.planner-grid').textContent,/STALE/,'reopening the same date rejects an earlier runtime response');
  loading=w.RosterStaplerUI.render({...ctx,initialDate:dateAt(4)});await resolveRead(dateAt(4),true);await loading;assert.equal(q('[data-save]').disabled,false,'confirmed plans remain editable for authorised planners');assert.equal(requests.length,0);
  loading=w.RosterStaplerUI.render({...ctx,initialDate:dateAt(5)});take('stapler').resolve({...view(dateAt(5),true),planningAllowed:false,canEdit:false,canConfirm:false,viewMode:'confirmed'});await loading;assert.equal(q('[data-save]').disabled,true);assert.equal(q('[data-save]').hidden,true);assert.equal(q('[data-confirm]').hidden,true);assert.equal(q('[data-tile][draggable=true]'),null,'read-only confirmed views do not expose editing');
  assert.equal(calls.filter(p=>/StaplerLock$/.test(p.operation)).length,0,'no acquisition, renewal or release request is needed for concurrent editing');
  console.log('PASS Stapler loading: fresh metadata, immediate concurrent editing, durable local drafts, explicit Save before Confirm, latest reads, stale response isolation and read-only confirmed permissions');
  fs.mkdirSync(path.join(root,'verification'),{recursive:true});fs.writeFileSync(path.join(root,'verification/715-stapler-loading.json'),JSON.stringify(metrics,null,2));console.log(JSON.stringify(metrics));
 }finally{w.RosterStaplerUI.unmount();dom.window.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
