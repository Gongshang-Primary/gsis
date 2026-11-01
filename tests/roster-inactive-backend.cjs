'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const realO=require('../shared/roster-operations.js'),A=require('../shared/roster-allocation.js'),R=require('../shared/roster.js');
const fixture=require('./roster701-fixture.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
function harness(){
 const f=fixture(),stats={reads:0,writes:0,locks:0,quota:0},contacts={user:{rosterSMC:true,rosterAdmin:true,rosterStaffId:'alice'},rosterPeople:f.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']};let saved=copy(f.state),locked=false;
 const DateClock=class extends Date{constructor(...args){super(...(args.length?args:[f.ctx.now]));}static now(){return f.ctx.now;}};
 const scope=vm.createContext({Date:DateClock,GSISRosterOperations:realO,GSISRosterAllocation:A,GSISRoster:R,Utilities:{getUuid:crypto.randomUUID,formatDate:(_,zone,format)=>format==='yyyy-MM-dd'?f.date:format==='HH'?'08':'00',DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(value).digest()]},props_:()=>({getProperty:()=>null}),LockService:{getScriptLock:()=>({})},deployLock_:()=>{assert(!locked);locked=true;stats.locks++;return true;},deployUnlock_:()=>{assert(locked);locked=false;},error_:(status,message)=>{throw Object.assign(Error(message),{status});}});
 require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 scope.rosterOperationsState_=()=>{stats.reads++;return copy(saved);};scope.rosterOperationsCommit_=s=>{assert(locked);stats.writes++;saved=copy(s);};
 return {...f,scope,contacts,stats,setState:s=>saved=copy(s),state:()=>copy(saved)};
}
{
 const h=harness();h.contacts.rosterPeople.find(p=>p.id==='bob').active=false;const state=h.state();state.adhoc.push({id:'adhoc-bob',staffId:'bob',date:h.date});h.setState(state);
 const value=h.scope.rosterOperationsDispatch_({identity:{email:'alice@school.test'},input:{operation:'directory',date:h.date}},h.contacts);
 assert(!value.people.some(p=>p.id==='bob'),'an ad hoc engagement cannot restore an inactive Contacts person');
 assert(value.people.some(p=>p.id==='alice'));
}
{
 const h=harness(),person={id:'bob',name:'Bob',active:false,mobile:'91234567'},fresh={rosterPeople:[person],rosterAdminIds:['bob']},s=h.state();s.adhoc.push({id:'engagement',staffId:'bob',date:h.date});
 h.scope.GSISRosterOperations={...realO,notificationCurrent:()=>null};
 const job={kind:'contact_review',recipientId:'bob',date:h.date,data:{templateKey:'contact_review'}};
 assert.equal(h.scope.rosterNotificationEligible_(s,job,h.ctx.now,fresh,{},new Set(['contact_review'])),'Recipient is inactive in Contacts.');
}
{
 const h=harness();let reconciles=0;h.scope.GSISRosterOperations={...realO,inactiveAssignmentDates:s=>s.assignments.some(a=>a.staffId==='bob')?[h.date]:[],reconcileInactiveTeachers:s=>{reconciles++;if(s.assignments[0].status==='cancelled')return false;s.assignments[0].status='cancelled';return true;}};
 const state=h.state();state.assignments.push({id:'future-bob',date:h.date,staffId:'bob',status:'draft'});h.setState(state);
 h.scope.rosterOperationsReadInactive_(state,h.ctx);
 assert.equal(h.stats.writes,1,'inactive cleanup is committed under the existing script lock');assert.equal(h.state().revision,1);assert.equal(h.state().assignments[0].status,'cancelled');assert.equal(reconciles,2,'recheck the latest state under the lock');
 h.scope.rosterOperationsReadInactive_(h.state(),h.ctx);assert.equal(h.stats.writes,1,'repeat cleanup does not write again');
}
{
 const h=harness(),next='2026-10-15',entry={id:'baseline',from:'2026-01-01',to:'2026-12-31',priority:1},week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:h.people.map(p=>({name:p.name,cells:Array.from({length:85},()=>['','','',''])}))};
 const model=R.validate({layoutMode:'odd-even',odd:week,even:week,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]}),state=h.state();
 state.assignments.push({id:'future',date:next,period:2,status:'draft',staffId:'bob',demandId:'absent:2',timeStart:'08:00',timeEnd:'08:30'});h.contacts.rosterPeople.find(p=>p.id==='bob').active=false;
 h.scope.rosterIndex_=()=>({entries:[entry]});h.scope.rosterModel_=()=>model;h.scope.rosterOperationsQuota_=()=>{h.stats.quota++;return {from:'2026-01-01',to:'2026-12-31',rows:h.people.map(p=>({id:p.id,R:4}))};};
 const ctx=h.scope.rosterOperationsContext_({identity:{email:'alice@school.test'},input:{operation:'read',view:'report',compact:true,date:h.date,calendarByDate:Object.fromEntries([h.date,next].map(date=>[date,{date,schoolDay:true,parity:'even'}]))}},h.contacts,state);
 assert.deepEqual(Object.keys(ctx.days).sort(),[h.date,next]);assert.equal(ctx.days[next].teachers.length,4,'replacement preparation includes all timetable candidates');assert.equal(ctx.quotaRequested,true);assert.equal(h.stats.quota,1);assert.equal(ctx.people.find(p=>p.id==='bob').active,false,'keep inactive identity available to history');
}
{
 const h=harness(),week=A.monday(h.date),hint={schema:1,version:'current',at:h.ctx.now-299999,enabled:false,times:{morning:[],evening:[]},noticeDates:[],quotaCheckpoints:{[week]:{week,status:'ready',cutoff:A.quotaCheckpoint(h.ctx).cutoff,at:h.ctx.iso}}};
 h.scope.props_=()=>({getProperty:key=>key==='ROSTER_SCHEDULE_HINT'?JSON.stringify(hint):key==='ROSTER_VERSION_HINT'?'current':null});
 const slot={minute:800};assert(h.scope.rosterScheduledFastSkip_(slot,{allocate:false},h.date));hint.at--;
 assert.equal(h.scope.rosterScheduledFastSkip_(slot,{allocate:false},h.date),null,'recheck Contacts after at most five minutes');
}
{
 const h=harness(),state=h.state(),next='2026-10-15';state.assignments.push({id:'pending',date:next,period:2,status:'cancelled',staffId:'bob',inactiveReplacementPending:true,timeStart:'08:00'});
 const pending=h.scope.rosterOperationsInactiveResult_({saved:true},state,{...h.ctx,days:{}});
 assert.deepEqual(Array.from(pending.inactiveReplacementDates),[next]);assert.deepEqual(Object.keys(pending).sort(),['inactiveReplacementDates','saved'],'retry metadata contains only dates');
 assert.equal(h.scope.rosterOperationsInactiveResult_({saved:true},state,{...h.ctx,days:{[next]:{verified:true,periods:[]}}}).inactiveReplacementDates,undefined,'verified Calendar does not request another gateway pass');
}
{
 const h=harness();let called=0;h.scope.rosterServiceContacts_=()=>({identity:{email:'roster-service'},c:h.contacts});h.scope.rosterScheduledAllocationGate_=()=>{throw Error('Reconciliation must not replay the normal scheduler tick');};
 h.scope.rosterOperationsInactiveContext_=(req,c,s,ctx)=>{assert.equal(req.input.inactiveReconcileDates[0],h.date);return ctx;};
 h.scope.rosterOperationsReadInactive_=(s,ctx)=>{called++;assert.equal(ctx.service,true);s.revision++;};
 const result=h.scope.rosterScheduledDispatch_({input:{scheduledTime:h.ctx.now,inactiveReconcileDates:[h.date]}});
 assert.equal(called,1);assert.equal(result.inactiveReconciled,true);assert.equal(result.revision,1);
}
// A peer reservation needs cleanup even before it creates an assigned duty.
{
 const h=harness(),state=h.state();h.people.find(p=>p.id==='bob').active=false;
 state.requests.push({id:'peer-only',date:h.date,recipientId:'bob',status:'pending',peerApproved:false,periods:[3],lessons:[{period:3,timeStart:'08:30'}],expiresAt:h.ctx.now+3600000});h.setState(state);
 h.scope.rosterOperationsReadInactive_(state,h.ctx);
 assert.equal(h.state().requests[0].status,'cancelled');assert.equal(h.stats.writes,1,'record-only cleanup persists a peer-only inactive reservation');
 h.scope.rosterOperationsReadInactive_(h.state(),h.ctx);assert.equal(h.stats.writes,1,'repeating the read does not repeat cancellation');
}
// The preview starts at 07:59, but the authoritative read under lock is 08:00.
// The period has started and must remain recorded, even after Contacts inactivation.
{
 const h=harness(),state=h.state(),early={...h.ctx,minute:360,now:Date.parse(h.date+'T06:00:00+08:00')};early.iso=new Date(early.now).toISOString();
 realO.apply(state,early,{operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[2]});
 const demand=realO.demand(early,state,h.date)[0];realO.apply(state,early,{operation:'assign',date:h.date,staffId:'bob',demandIds:[demand.id]});
 h.people.find(person=>person.id==='bob').active=false;h.setState(state);const original=copy(state.assignments);
 const stale={...h.ctx,minute:479,now:Date.parse(h.date+'T07:59:00+08:00'),iso:h.date+'T07:59:00+08:00',timetableEntries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31',priority:1}]};
 h.scope.rosterOperationsReadReconcile_(copy(state),stale);
 assert.deepEqual(h.state().assignments,original,'a duty that starts before the write lock must remain history');
 assert.equal(h.stats.writes,0,'the expired preview must not be committed');assert.equal(stale.minute,480);
}
// Slow context preparation crosses a period start before any planning mutation.
{
 const h=require('./roster701-adapter.cjs')(),state=h.state();h.ctx.minute=360;h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();
 realO.apply(state,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[2]});
 const demand=realO.demand(h.ctx,state,h.date)[0];realO.apply(state,h.ctx,{operation:'assign',date:h.date,staffId:'bob',demandIds:[demand.id]});h.people.find(p=>p.id==='bob').active=false;h.setState(state);const original=copy(state.assignments);
 h.ctx.minute=479;h.ctx.now=Date.parse(h.date+'T07:59:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();
 const context=h.scope.rosterOperationsContext_;h.scope.rosterOperationsContext_=req=>{const prepared=context(req);h.ctx.now=Date.parse(h.date+'T08:00:00+08:00');return prepared;};
 h.scope.rosterOperationsPreparedCore_({identity:h.ctx.user,input:{operation:'autoAllocate',date:h.date,revision:state.revision,requestId:crypto.randomUUID()}},{});
 assert.deepEqual(h.state().assignments,original,'context I/O crossing start cannot cancel or replace a started duty');
}
// A normal signed tick examines actual inactive duties before its idle shortcut.
{
 const h=require('./roster701-adapter.cjs')(),state=h.state();h.ctx.minute=360;h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();
 realO.apply(state,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[3]});const demand=realO.demand(h.ctx,state,h.date)[0];realO.apply(state,h.ctx,{operation:'assign',date:h.date,staffId:'bob',demandIds:[demand.id]});h.people.find(p=>p.id==='bob').active=false;h.setState(state);
 h.ctx.minute=480;h.ctx.now=Date.parse(h.date+'T08:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();
 const result=h.scope.rosterScheduledDispatch_({input:{scheduledTime:h.ctx.now}}),saved=h.state();
 assert.equal(saved.assignments.find(a=>a.staffId==='bob').status,'cancelled');assert(saved.assignments.some(a=>a.staffId!=='bob'&&a.status==='draft'&&a.demandId===demand.id),'an otherwise idle scheduler replaces the unstarted inactive duty');
 assert.equal(result.revision,saved.revision);assert.equal(result.notificationsQueued,0,'replacement awaits ordinary publication');
}
// The ordinary locked mutation route also refreshes after slow context reads.
{
 const h=require('./roster701-adapter.cjs')(),state=h.state();h.ctx.minute=360;h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();
 realO.apply(state,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[2]});const demand=realO.demand(h.ctx,state,h.date)[0];realO.apply(state,h.ctx,{operation:'assign',date:h.date,staffId:'bob',demandIds:[demand.id]});h.people.find(p=>p.id==='bob').active=false;h.setState(state);const original=copy(state.assignments);
 h.ctx.minute=479;h.ctx.now=Date.parse(h.date+'T07:59:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();const context=h.scope.rosterOperationsContext_;
 h.scope.rosterOperationsContext_=req=>{const prepared=context(req);h.ctx.now=Date.parse(h.date+'T08:00:00+08:00');return prepared;};
 h.call({operation:'saveAdhoc',date:h.date,staffId:'dora',periods:[3],revision:state.revision,requestId:crypto.randomUUID()});
 assert.deepEqual(h.state().assignments,original,'a separate locked mutation must not retire a now-started duty');assert(h.state().adhoc.some(a=>a.staffId==='dora'&&a.periods.includes(3)),'the requested valid mutation still completes');
}
// A private peer response cannot reconcile another duty with a stale clock.
{
 const h=require('./roster701-adapter.cjs')(),state=h.state();h.ctx.minute=360;h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();
 realO.apply(state,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[2,3]});const demands=realO.demand(h.ctx,state,h.date);
 realO.apply(state,h.ctx,{operation:'assign',date:h.date,staffId:'bob',demandIds:[demands.find(d=>d.period===2).id]});
 realO.apply(state,h.ctx,{operation:'requestMutual',date:h.date,absenceId:state.absences[0].id,requests:[{recipientId:'dora',demandIds:[demands.find(d=>d.period===3).id]}]});
 h.people.find(p=>p.id==='bob').active=false;h.setState(state);const original=copy(state.assignments);
 h.ctx.minute=479;h.ctx.now=Date.parse(h.date+'T07:59:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();const context=h.scope.rosterOperationsContext_;
 h.scope.rosterOperationsContext_=req=>{const prepared=context(req);h.ctx.now=Date.parse(h.date+'T08:00:00+08:00');return prepared;};
 const response=h.scope.rosterServiceDispatch_({input:{operation:'externalRespond',decision:'reject',reason:'Cannot cover',capability:{purpose:'mutual',staffId:'dora',date:h.date,requestId:state.requests[0].id,expiresAt:Date.parse(h.date+'T12:00:00+08:00')}}});
 assert.deepEqual(h.state().assignments,original,'a private peer reply preserves unrelated duties that started during context loading');assert.equal(response.status,'rejected');assert.equal(h.state().requests[0].status,'rejected');
}
console.log('PASS inactive backend: picker, final dispatch fence and locked cleanup, complete replacement context and five-minute refresh.');

{
 const h=harness(),state=h.state(),email='inactive@gsps.edu.sg';state.dailyEmploymentMail=[{id:'queued-report',date:h.date,to:email,subject:'Report',status:'queued'}];state.dailyEmploymentSnapshots=[{date:h.date,capturedAt:h.ctx.iso,health:{percentage:null},externalTeachers:[],absences:[],reliefTeachers:[]}];h.setState(state);h.contacts.rosterPeople=[{id:'inactive',active:false,email,emails:[email]}];h.scope.rosterServiceContacts_=()=>({c:h.contacts});let sends=0;h.scope.MailApp={getRemainingDailyQuota:()=>5,sendEmail:()=>{sends++;}};
 const result=h.scope.rosterDailyEmploymentMailDispatch_({publicOrigin:'https://roster.test'});assert.equal(sends,0,'Google retained employment mail must recheck active status before sending');assert.equal(result.sent,0);assert.equal(result.blocked,1);assert.equal(h.state().dailyEmploymentMail[0].status,'blocked');
 console.log('PASS Google retained employment mail blocks an inactive recipient before the provider');
}
