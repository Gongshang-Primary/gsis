'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const A=require('../shared/roster-allocation.js');
const root=path.resolve(__dirname,'..'),backend=fs.readFileSync(path.join(root,'backend/RosterOperations.gs'),'utf8');
const sunday='2026-11-01',week='2026-11-02',at=Date.parse(sunday+'T16:00:00+08:00');
function declaration(source,name){
 const start=source.indexOf('function '+name+'(');if(start<0)return '';
 const next=source.indexOf('\nfunction ',start+1);return source.slice(start,next<0?source.length:next);
}
function harness(now=at){
 const values={ROSTER_VERSION_HINT:'revision-1'};
 class Clock extends Date {static now(){return now;}}
 const context={Date:Clock,GSISRosterAllocation:A,GSISRosterOperations:{smcSummarySlot:()=>null},props_:()=>({getProperty:key=>values[key]||null,setProperty:(key,value)=>{values[key]=value;}})};
 vm.createContext(context);
 for(const name of ['rosterQuotaCheckpointDue_','rosterQuotaCheckpointHint_','rosterScheduledIdle_','rosterScheduledHintWrite_','rosterScheduledFastSkip_']){
  const source=declaration(backend,name);if(source)vm.runInContext(source,context);
 }
 return {context,values,clock:{today:sunday,minute:960,now},slot:{...A.schedule(now),stamp:now}};
}
function state(receipt){return {quotaCheckpoints:receipt?{[week]:receipt}:{},scheduleReceipts:{},systemConfig:{scheduledAllocationEnabled:false,smcSummaryTimes:{evening:[],morning:[]}},massPublications:{},staplerPlans:[],publicationSnapshots:[]};}

test('a missing Sunday checkpoint is due even when allocation is paused',()=>{
 const h=harness();assert.equal(typeof h.context.rosterQuotaCheckpointDue_,'function');
 assert.equal(h.context.rosterQuotaCheckpointDue_(state(),h.clock),true);
 assert.equal(h.context.rosterScheduledIdle_(state(),h.slot,sunday),null);
});

test('a verified checkpoint keeps the no-demand scheduler idle',()=>{
 const h=harness(),s=state({status:'ready',at:new Date(at).toISOString()});
 assert.equal(h.context.rosterQuotaCheckpointDue_(s,h.clock),false);
 assert.equal(h.context.rosterScheduledIdle_(s,h.slot,sunday).idle,true);
});

test('pending checkpoint retries once its one-hour retry interval has elapsed',()=>{
 const s=state({status:'pending',at:new Date(at).toISOString()}),early=harness(at+3599999),due=harness(at+3600000);
 assert.equal(early.context.rosterQuotaCheckpointDue_(s,{...early.clock,minute:1019}),false);
 assert.equal(due.context.rosterQuotaCheckpointDue_(s,{...due.clock,minute:1020}),true);
});

test('Monday first allocation gets one final retry even after a recent hourly attempt',()=>{
 const deadline=Date.parse(week+'T05:30:00+08:00'),h=harness(deadline),receipt={status:'pending',at:new Date(deadline-30*60000).toISOString(),retryUntil:new Date(deadline).toISOString()};
 assert.equal(h.context.rosterQuotaCheckpointDue_(state(receipt),{today:week,minute:330,now:deadline}),true);
 receipt.retryStopped=true;
 assert.equal(h.context.rosterQuotaCheckpointDue_(state(receipt),{today:week,minute:331,now:deadline+60000}),false);
});

test('a fast-skip hint cannot bypass a missing or due quota checkpoint',()=>{
 for(const receipt of [undefined,{status:'pending',at:new Date(at-3600000).toISOString()}]){
  const h=harness(),hint={schema:1,version:'revision-1',at,enabled:false,times:{evening:[],morning:[]},noticeDates:[],quotaCheckpoints:receipt?{[week]:receipt}:{}};
  h.values.ROSTER_SCHEDULE_HINT=JSON.stringify(hint);
  assert.equal(h.context.rosterScheduledFastSkip_(h.slot,{allocate:false},sunday),null);
 }
});

test('a ready checkpoint survives the bounded fast-skip hint',()=>{
 const h=harness(),s=state({status:'ready',at:new Date(at).toISOString()});
 h.context.rosterScheduledHintWrite_(s,'revision-1');
 const hint=JSON.parse(h.values.ROSTER_SCHEDULE_HINT);
 assert.equal(hint.quotaCheckpoints[week].status,'ready');
 assert.equal(h.context.rosterScheduledFastSkip_(h.slot,{allocate:false},sunday).idle,true);
});

test('Sunday 15:59 remains in the current accounting week',()=>{
 const h=harness(at-60000),previous='2026-10-26',s=state();s.quotaCheckpoints[previous]={status:'ready',at:new Date(at-3600000).toISOString()};
 assert.equal(h.context.rosterQuotaCheckpointDue_(s,{today:sunday,minute:959,now:at-60000}),false);
});

test('the scheduled Worker requests every weekday for the Sunday checkpoint',async()=>{
 const source=fs.readFileSync(path.join(root,'roster-update/public/_worker.js'),'utf8'),start=source.indexOf('export async function scheduledRoster('),end=source.indexOf('\n// Called only',start);
 assert(start>=0&&end>start,'scheduled entry point is available');let requested,command;
 const context={Date,Set,crypto:{randomUUID:()=> 'test-request'},GSISRosterAllocation:A,readQuotaCheckpointEvidence:async()=>({week,cutoff:at,verified:false,reason:'QUOTA_SNAPSHOT_MISSING'}),reconcileInactiveReplacements:async(_env,_input,result)=>result,pendingAbsenceTransport:async()=>({pendingCaptureCount:0,pendingPeerCount:0}),edgeRosterEnabled:()=>false,notificationStatus:()=>({ready:false}),calendarDates:async(_env,dates)=>{requested=dates;return Object.fromEntries(dates.map(date=>[date,{date,schoolDay:true,parity:'odd',available:true}]));},serviceBackend:async(_env,value)=>{command=value;return {ok:true,data:{idle:true}};},rosterScheduledFailure:r=>Error(JSON.stringify(r))};
 vm.createContext(context);vm.runInContext(source.slice(start,end).replace('export async function','async function'),context);
 await context.scheduledRoster({ROSTER_AUTOMATION_ENABLED:'true'},at);
 for(let n=0;n<5;n++)assert(requested.includes(A.addDays(week,n)),'missing weekday '+n);
 assert(requested.includes(sunday),'today remains available for notification work');
 assert.deepEqual([...command.dates].sort(),[...requested].sort());
 assert.equal(command.quotaCheckpointEvidence.week,week,'only the authenticated scheduler attaches snapshot evidence');
});

test('Google checkpoint records source lag while interactive allocation still fails closed',()=>{
 const f=require('./roster701-fixture.cjs')(),O=require('../shared/roster-operations.js'),R=require('../shared/roster.js'),crypto=require('node:crypto');
 class Clock extends Date{constructor(...args){super(...(args.length?args:[at]));}static now(){return at;}}
 const scope=vm.createContext({Date:Clock,GSISRosterOperations:O,GSISRosterAllocation:A,GSISRoster:R,Utilities:{getUuid:crypto.randomUUID,formatDate:(_d,_zone,format)=>format==='yyyy-MM-dd'?sunday:format==='HH'?'16':'00'},props_:()=>({getProperty:()=>null}),error_:(status,message)=>{throw Object.assign(Error(message),{status});}});
 vm.runInContext(backend,scope);
 const entry={id:'baseline',from:'2026-01-01',to:'2026-12-31',priority:1},single={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:f.people.map(p=>({name:p.name,cells:Array.from({length:85},()=>['','','',''])}))};
 const model=R.validate({layoutMode:'single-week',single,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]});
 scope.rosterIndex_=()=>({entries:[entry]});scope.rosterModel_=()=>model;scope.rosterOperationsQuota_=()=>{throw Object.assign(Error('Deploy unavailable'),{status:503});};
 f.people.forEach(person=>{person.adhocEligible=true;});
 const c={user:{rosterSMC:true,rosterAdmin:true,rosterStaffId:'alice'},rosterPeople:f.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']};
 const input={operation:'scheduledRoster',date:week,dates:Array.from({length:5},(_,n)=>A.addDays(week,n)),calendarByDate:Object.fromEntries(Array.from({length:5},(_,n)=>{const date=A.addDays(week,n);return [date,{date,schoolDay:true,parity:'single'}];}))};
 f.state.entitlements=f.people.map(p=>({id:'prior-'+p.id,staffId:p.id,week:'2026-10-26',year:'2026',quota:2,mode:'observed'}));
 const ctx=scope.rosterOperationsContext_({identity:{email:'roster-service'},input},c,f.state);
 assert.equal(ctx.quotaReferenceUnavailable,true);assert.equal(ctx.quotaRequested,false);
 Object.assign(ctx,{service:true,quotaCheckpointDue:true,quotaCheckpointEvidence:{week,cutoff:at,schoolDate:week,verified:false,rows:[]}});
 const before=JSON.stringify(f.state.assignments),result=O.scheduledTick(f.state,ctx,at);
 assert.equal(result.quotaCheckpoint.status,'pending');assert.equal(f.state.entitlements.filter(row=>row.week===week).length,4);assert.equal(f.state.smcAlerts.filter(row=>row.key==='quota-checkpoint:'+week).length,1);assert.equal(JSON.stringify(f.state.assignments),before);assert.deepEqual(f.state.scheduleReceipts,{},'unavailable allocation remains retryable');
 assert.throws(()=>scope.rosterOperationsContext_({identity:{email:'alice@school.test'},input:{...input,operation:'optimise'}},c,f.state),/Deploy unavailable/);
});
