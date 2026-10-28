'use strict';
// Exercise the real durable adapter with separate request snapshots and one shared lock.
// This is a deterministic host simulation, not a claim about production Drive latency.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const O=require('../shared/roster-operations.js'),A=require('../shared/roster-allocation.js'),R=require('../shared/roster.js'),fixture=require('./roster701-fixture.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
function adapter(){
 const f=fixture(),ctx=f.ctx;ctx.minute=360;ctx.now=Date.parse(f.date+'T06:00:00+08:00');ctx.iso=new Date(ctx.now).toISOString();ctx.timetableEntries=[{id:'baseline',from:'2026-01-01',to:'2026-12-31',priority:1}];
 for(let n=0;n<30;n++){ctx.people.push({id:'staff'+n,name:'Teacher '+n,active:true,mobile:String(82000000+n)});ctx.days[f.date].teachers.push({staffId:'staff'+n,name:'Teacher '+n,cells:f.blank(),R:4});}
 let durable=clone(f.state),locked=false,writes=0,reads=0,contexts=0,lose=false,beforeLock=null,operation=null;
 const prepared=new Set(['autoAllocate','optimise','publish','notifyDaily','reliefBatch','saveAbsence','saveInstructions','receiptStatus']);
 const NativeDate=Date,ClockDate=class extends NativeDate{constructor(...args){super(...(args.length?args:[ctx.now]));}static now(){return ctx.now;}};
 const scope=vm.createContext({Date:ClockDate,GSISRosterOperations:O,GSISRosterAllocation:A,GSISRoster:R,ROSTER_DATA:'data',
  props_:()=>({getProperty:()=> 'operations',setProperty:()=>{}}),rosterFindFile_:()=> 'operations',
  rosterReadFile_:()=>{if(!prepared.has(operation))assert(locked,'new absence state is loaded inside the lock');reads++;return JSON.stringify(durable);},
  rosterDriveRequest_:(_,options)=>{assert(locked,'commit holds the lock');durable=JSON.parse(options.payload);writes++;if(lose){lose=false;throw Error('Lost commit response');}return {id:'operations'};},
  error_:(status,message)=>{throw Object.assign(Error(message),{status});},LockService:{getScriptLock:()=>({})},
  deployLock_:()=>{assert(!locked);if(beforeLock){const action=beforeLock;beforeLock=null;action();}locked=true;return true;},deployUnlock_:()=>{assert(locked);locked=false;},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(value).digest()],getUuid:()=>crypto.randomUUID()}
 });
 require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);require('./load-stapler-leases.cjs')(scope);
 scope.rosterOperationsContext_=req=>{assert.equal(locked,!prepared.has(req.input.operation),'absence and daily proposal contexts prepare outside the writer lock');contexts++;return {...ctx,user:{...ctx.user,...req.identity}};};
 scope.rosterOperationsReferenceStamp_=context=>scope.rosterOperationsReferenceKey_(context);
 const command=(staffId='alice',extra={})=>({operation:'saveAbsence',requestId:crypto.randomUUID(),revision:0,date:f.date,staffId,typeId:'mc',periods:[2],...extra});
 const identity=staffId=>({staffId,email:staffId+'@gsps.edu.sg',smc:false,admin:false});
 return {ctx,scope,date:f.date,command,identity,call:(p,who=identity(p.staffId))=>{const previous=operation;operation=p.operation;try{return scope.rosterOperationsDispatch_({input:p,identity:who},{rosterPeople:ctx.people,user:{rosterStaffId:who.staffId,rosterSMC:who.smc===true,rosterAdmin:who.admin===true}});}finally{operation=previous;}},state:()=>clone(durable),counts:()=>({writes,reads,contexts,locked}),update:fn=>{fn(durable);},beforeLock:fn=>{beforeLock=fn;},lose:()=>{lose=true;}};
}
const reject=(fn,status,pattern)=>assert.throws(fn,error=>error.status===status&&(!pattern||pattern.test(error.message)));


const h=adapter(),baseline=clone(h.ctx.days[h.date]);h.ctx.days[h.date]={id:null,periods:[],teachers:[],verified:true,schoolDay:false};
const first=h.command('alice',{fullDay:true,periods:undefined}),second=h.command('bob',{coverage:{kind:'timeRange',startMinutes:475,endMinutes:510},periods:undefined});
h.beforeLock(()=>h.call(second));h.lose();assert.throws(()=>h.call(first),/Lost commit/);assert.equal(h.call(second).replayed,true);const savedFirst=h.call(first);assert.equal(h.state().absences.length,2);assert.equal(h.counts().writes,2);assert.equal(h.call(first).replayed,true);assert.equal(h.counts().writes,2);const current=h.state(),a=current.absences.find(a=>a.staffId==='alice');assert.equal(a.coverage.kind,'fullDay');assert.deepEqual(a.periods,[]);assert.equal(a.timetablePending,true);assert.equal(a.reliefRequired,true);
reject(()=>h.call({...h.command('alice',{coverage:{kind:'timeRange',startMinutes:480,endMinutes:510}}),id:a.id}),409,/Refresh/);h.ctx.days[h.date]=baseline;const read=O.reportView(h.state(),{...h.ctx,user:h.identity('alice')},{date:h.date});assert.equal(read.absences[0].id,a.id);assert.equal(read.absences[0].timetablePending,false);assert.deepEqual(O.demand(h.ctx,h.state(),h.date).map(d=>d.period),[2,3]);
console.log('PASS deferred absence adapter: unlocked preparation, parallel stale new reports, lost-response exact retry, locked duplicate prevention, stale edit guard and later timetable resolution');
for(const count of [2,10,30]){
 const h=adapter(),commands=Array.from({length:count},(_,n)=>h.command('staff'+n)),responses=[];
 // All requests prepare against the same revision before any takes the lock.
 // Deepest request commits first, then each waiting request sees fresh facts.
 const run=n=>{if(n+1<count)h.beforeLock(()=>run(n+1));responses.push(h.call(commands[n]));};run(0);
 assert.equal(h.counts().contexts,count,'each teacher loads context once, despite concurrent commits');assert.equal(h.counts().writes,count);assert.equal(h.state().absences.length,count);assert.equal(h.state().revision,count);assert.equal(new Set(h.state().receipts.map(r=>r.id)).size,count);assert(responses.every(r=>r.savedIds.length===1));
 for(const p of commands)assert.equal(h.call(p).replayed,true);assert.equal(h.counts().writes,count);assert.equal(h.counts().locked,false);
 console.log('PASS',count,'simultaneously prepared absence reports: fresh-state commits, one context load per request and exact retries');
}
{
 const h=adapter(),first=h.command(),second=h.command();h.beforeLock(()=>h.call(second));reject(()=>h.call(first),409,/overlaps/);assert.equal(h.state().absences.length,1);assert.equal(h.counts().writes,1);assert.equal(h.counts().contexts,2,'same-teacher collision is checked without a model rebuild');
}
{
 const h=adapter(),p=h.command();h.lose();assert.throws(()=>h.call(p),/Lost commit/);const receipt=h.call({operation:'receiptStatus',command:p},h.identity('alice'));assert.equal(receipt.accepted,true);assert.equal(receipt.acceptedRevision,1);assert.equal(h.call(p).replayed,true);assert.equal(h.counts().writes,1);assert.equal(h.state().absences.length,1);
}
{
 const h=adapter(),p=h.command();h.beforeLock(()=>h.update(s=>{s.types.find(t=>t.id==='mc').allowedPeriods=[3];s.revision++;}));reject(()=>h.call(p),400,/not permitted/);assert.equal(h.counts().contexts,1,'fresh absence policies need no timetable rebuild');assert.equal(h.counts().writes,0);assert.equal(h.state().absences.length,0);
}
{
 const h=adapter(),p=h.command(),limit=h.state().systemConfig.maxDailyPeriods-1;h.beforeLock(()=>h.update(s=>{s.systemConfig.maxDailyPeriods=limit;s.revision++;}));h.call(p);assert.equal(h.counts().contexts,2,'a changed context policy triggers one safe rebuild outside the lock');assert.equal(h.counts().writes,1);assert.equal(h.state().systemConfig.maxDailyPeriods,limit);
}
{
 const h=adapter(),p=h.command();h.scope.rosterNotificationOverlay_=s=>{Object.defineProperty(s,'notificationTransportUnavailable',{value:true});return s;};h.call(p);assert.equal(h.state().absences.length,1);assert.equal(h.state().notificationTransportUnavailable,undefined,'transport diagnostics never become attendance state');
 assert.throws(()=>h.scope.rosterOperationsNotificationReady_({notificationTransportUnavailable:true},{operation:'notifyDaily'}),e=>e.status===503);assert.doesNotThrow(()=>h.scope.rosterOperationsNotificationReady_({notificationTransportUnavailable:true},{operation:'publish',notifyMode:'none'}));
}
console.log('PASS absence concurrent overlap, receipt recovery, fresh policy validation, relevant-source rebuild and transport outage isolation');
