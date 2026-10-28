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
 const prepared=new Set(['saveAbsence','saveInstructions','autoAllocate','optimise','publish','notifyDaily','reliefBatch']);
 class Clock extends Date{constructor(...v){super(...(v.length?v:[ctx.now]));}static now(){return ctx.now;}}
 const scope=vm.createContext({Date:Clock,GSISRosterOperations:O,GSISRosterAllocation:A,GSISRoster:R,ROSTER_DATA:'data',
  props_:()=>({getProperty:()=> 'operations',setProperty:()=>{}}),rosterFindFile_:()=> 'operations',
  rosterReadFile_:()=>{if(!prepared.has(operation))assert(locked,'new absence state is loaded inside the lock');reads++;return JSON.stringify(durable);},
  rosterDriveRequest_:(_,options)=>{assert(locked,'commit holds the lock');durable=JSON.parse(options.payload);writes++;if(lose){lose=false;throw Error('Lost commit response');}return {id:'operations'};},
  error_:(status,message)=>{throw Object.assign(Error(message),{status});},LockService:{getScriptLock:()=>({})},
  deployLock_:()=>{assert(!locked);if(beforeLock){const action=beforeLock;beforeLock=null;action();}locked=true;return true;},deployUnlock_:()=>{assert(locked);locked=false;},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(value).digest()],getUuid:()=>crypto.randomUUID()}
 });
 require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);require('./load-stapler-leases.cjs')(scope);
 scope.rosterOperationsReferenceStamp_=ctx=>scope.rosterOperationsReferenceKey_(ctx);
 scope.rosterOperationsContext_=req=>{assert.equal(locked,!prepared.has(req.input.operation),'new absence context is locked; daily proposal preparation is unlocked');contexts++;return {...ctx,user:{...ctx.user,...req.identity}};};
 const command=(staffId='alice',extra={})=>({operation:'saveAbsence',requestId:crypto.randomUUID(),revision:0,date:f.date,staffId,typeId:'mc',periods:[2],...extra});
 const identity=staffId=>({staffId,email:staffId+'@gsps.edu.sg',smc:false,admin:false});
 return {ctx,scope,date:f.date,command,identity,call:(p,who=identity(p.staffId))=>{const previous=operation;operation=p.operation;try{return scope.rosterOperationsDispatch_({input:p,identity:who},{});}finally{operation=previous;}},state:()=>clone(durable),counts:()=>({writes,reads,contexts,locked}),update:fn=>{fn(durable);},beforeLock:fn=>{beforeLock=fn;},lose:()=>{lose=true;}};
}
const reject=(fn,status,pattern)=>assert.throws(fn,error=>error.status===status&&(!pattern||pattern.test(error.message)));

// The shared Form rule and stale-new reporting must operate on the same locked
// document: the second co-teacher's absence removes cover and leaves one vacancy.
{
 const h=adapter();h.ctx.quotaRequested=false;h.ctx.notificationsConfigured=true;
 for(const teacher of h.ctx.days[h.date].teachers){teacher.cells=teacher.cells.map(()=>['','','','']);teacher.R=null;}
 for(const id of ['alice','bob'])h.ctx.days[h.date].teachers.find(t=>t.staffId===id).cells[2]=['Form','4A','C1-01',''];
 const first=h.command('alice',{view:'report'}),second=h.command('bob',{view:'report'});
 h.call(first);const afterFirst=h.state(),cover=A.effectiveAssignments(afterFirst);
 assert.equal(cover.length,1);assert.equal(cover[0].origin,'shared-subject');assert.equal(cover[0].status,'draft');assert.equal(cover[0].staffId,'bob');assert.equal(cover[0].combination,true);assert.equal(A.cost(cover[0]),0);
 assert.equal(afterFirst.outbox.length,0,'draft combination does not send a notice');
 h.call(second);const afterSecond=h.state(),vacancies=O.demand(h.ctx,afterSecond,h.date);
 assert.equal(afterSecond.revision,2);assert.equal(afterSecond.absences.length,2);assert.equal(afterSecond.receipts.length,2);assert.equal(h.counts().writes,2);
 assert.equal(A.effectiveAssignments(afterSecond).length,0,'absent co-teacher cannot retain the first draft cover');
 assert.equal(afterSecond.assignments.length,1,'second report does not create duplicate cover');assert.equal(afterSecond.assignments[0].status,'cancelled');
 assert.equal(vacancies.length,1);assert(vacancies[0].sharedLessonKey);assert.deepEqual(new Set(vacancies[0].absentIds),new Set(['alice','bob']));assert.equal(vacancies[0].members.length,2);assert.deepEqual(vacancies[0].sharedPresentIds,[]);
 assert.equal(afterSecond.outbox.length,0,'unpublished shared vacancy sends no notice');assert.equal(afterSecond.publicationSnapshots.length,0);
 for(const command of [first,second])assert.equal(h.call(command).replayed,true);
 assert.deepEqual(h.state(),afterSecond,'exact retries preserve the grouped vacancy and prior cancellation');assert.equal(h.counts().writes,2);
 console.log('PASS concurrent Form co-teachers: one draft combination becomes one grouped vacancy; exact retries add no writes or notices.');
}

// Thirty teachers all start from revision zero. Serialized writes validate the latest
// document, so independent new absences do not need refresh/retry after another teacher.
{
 const h=adapter(),commands=Array.from({length:30},(_,i)=>h.command('staff'+i));
 for(const p of commands)h.call(p);
 const state=h.state();assert.equal(state.revision,30);assert.equal(state.absences.length,30);assert.equal(new Set(state.absences.map(a=>a.staffId)).size,30);assert.equal(state.receipts.length,30);
 assert.equal(state.audit.filter(a=>a.operation==='saveAbsence').length,30);assert.deepEqual(h.counts(),{writes:30,reads:60,contexts:30,locked:false});
 for(const p of commands)assert.equal(h.call(p).replayed,true);
 assert.equal(h.counts().writes,30,'exact replays perform no durable writes');assert.equal(h.state().absences.length,30);
 console.log(JSON.stringify({case:'30 callers with revision 0',reports:30,writes:30,staleRevisionConflicts:0,oldGuardConflicts:29,replayWrites:0}));
}

// Both requests arrive before the first lock acquisition. The second finishes first;
// the first must append to that commit, never overwrite its independently saved report.
{
 const h=adapter(),a=h.command('alice'),b=h.command('bob');h.beforeLock(()=>h.call(b));h.call(a);
 assert.deepEqual(h.state().absences.map(a=>a.staffId),['bob','alice']);assert.equal(h.state().revision,2);
 reject(()=>h.call({...a,periods:[3]}),409,/different save/);reject(()=>h.call(a,h.identity('bob')),409,/different save/);
 const saved=h.state().absences.find(a=>a.staffId==='alice');
 for(const p of [{...h.command(),id:saved.id,periods:[3]},{operation:'saveInstructions',requestId:crypto.randomUUID(),revision:0,date:h.date,absenceId:saved.id,instructions:{}},{operation:'autoAllocate',requestId:crypto.randomUUID(),revision:0,date:h.date}])reject(()=>h.call(p,{...h.identity('alice'),smc:true}),409,/Refresh/);
 for(const revision of [-1,3,null,'0',1.5,Number.MAX_SAFE_INTEGER+1])reject(()=>h.call(h.command('charlie',{revision})),409);
 assert.equal(h.counts().writes,2);assert.equal(h.counts().locked,false);
}
{
 const h=adapter(),a=h.command();h.lose();assert.throws(()=>h.call(a),/Lost commit/);assert.equal(h.call(a).replayed,true);assert.equal(h.counts().writes,1);assert.equal(h.state().audit.filter(a=>a.operation==='saveAbsence').length,1);
 reject(()=>h.call(h.command('alice')),409,/overlaps/);
 h.ctx.people.find(p=>p.id==='bob').mobile=h.ctx.people.find(p=>p.id==='alice').mobile;reject(()=>h.call(h.command('bob')),409,/overlaps/);
 reject(()=>h.call(h.command('charlie'),h.identity('alice')),403);assert.equal(h.counts().writes,1);
}

// Validation uses the current policy, Contacts identity, and lesson source after locking.
{
 const h=adapter();h.call(h.command('bob'));
 h.update(s=>s.types=s.types.filter(t=>t.id!=='mc'));reject(()=>h.call(h.command()),400,/available absence type/);
 h.update(s=>s.types=O.defaults());h.ctx.people.find(p=>p.id==='alice').groups=['Support'];reject(()=>h.call(h.command()),403,/staff category/);
 h.ctx.people.find(p=>p.id==='alice').groups=[];const old=O.previewAbsence(h.ctx,{id:'preview',staffId:'alice',date:h.date,periods:[2],noReliefSubjects:[]})[0];
 h.ctx.days[h.date].teachers[0].cells[2]=['MA','4B','C2-02',''];
 reject(()=>h.call(h.command('alice',{instructionsByDate:{[h.date]:{[old.lessonKey]:'Old lesson'}}})),409,/Lessons changed/);
 assert.equal(h.counts().writes,1);const response=h.call(h.command());assert.equal(h.state().absences.find(a=>a.id===response.savedId).lessonSnapshot[0].subject,'MA');
 assert.equal(h.state().absences.find(a=>a.id===response.savedId).lessonSnapshot[0].className,'4B');
}
{
 const h=adapter(),tomorrow='2026-10-15';h.ctx.days[tomorrow]=clone(h.ctx.days[h.date]);h.call(h.command('alice',{date:tomorrow}));
 reject(()=>h.call(h.command('alice',{from:h.date,to:tomorrow})),409,/overlaps/);
 assert.equal(h.counts().writes,1);assert.equal(h.state().absences.length,1,'range failure never persists the earlier valid day');
}

// A report context deliberately has no Deploy quota. Do not calculate a capacity
// chart only to discard its unverified result, and return the existing compact view.
{
 const h=adapter();h.ctx.quotaRequested=false;h.ctx.days[h.date].teachers.forEach(t=>t.R=null);
 let healthCalls=0;const health=A.health;A.health=(...args)=>{healthCalls++;return health(...args);};
 try{
  const p=h.command('alice',{view:'report'}),result=h.call(p),savedState=h.state(),full=O.view(savedState,{...h.ctx,user:{...h.ctx.user,...h.identity('alice')}},p);
  assert.equal(healthCalls,0,'unknown current quota does not build a discarded health grid');assert.equal(result.compact,true);assert.equal(result.savedId,h.state().absences[0].id);
  const withRowTokens=rows=>clone(rows).map(row=>{
   const saved=savedState.absences.find(a=>a.id===row.id);
   assert(saved,'each projected absence has a durable source');assert.equal(saved.absenceToken,undefined,'transport tokens are not stored in absence records');
   return row.editable===true?{...row,absenceToken:crypto.createHash('sha256').update(JSON.stringify({schema:1,absence:saved})).digest('hex')}:row;
  });
  assert.deepEqual(clone(result.absences),withRowTokens(full.absences),'compact response preserves every field and adds the exact durable row token');
  assert.deepEqual(clone(result.ownAbsences),withRowTokens(full.ownAbsences),'own-record projection has the same exact token contract');
  const row=result.absences.find(a=>a.id===result.savedId);assert.equal(row.editable,true);assert.match(row.absenceToken,/^[a-f0-9]{64}$/);
  const beforeDenied=h.state(),writesBeforeDenied=h.counts().writes;
  reject(()=>h.call({...h.command('alice'),id:row.id,revision:result.revision,expectedAbsenceToken:row.absenceToken,periods:[3]},h.identity('bob')),403);
  assert.deepEqual(h.state(),beforeDenied,'a valid row token does not grant another teacher edit authority');assert.equal(h.counts().writes,writesBeforeDenied);
  assert.equal(result.timetable.teachers.filter(t=>Array.isArray(t.cells)).length,1);assert.equal(full.timetable.teachers.filter(t=>Array.isArray(t.cells)).length,34);
  assert.equal(result.timetable.teachers.find(t=>t.staffId==='alice').cells[2][0],'EL');
  const bytes=value=>Buffer.byteLength(JSON.stringify(value));assert(bytes(result)<bytes(full));
  console.log(JSON.stringify({case:'34-teacher no-quota save response',fullBytes:bytes(full),compactBytes:bytes(result),healthGridsBuilt:healthCalls,oldHealthGridsBuilt:1}));
  h.ctx.quotaRequested=true;h.ctx.days[h.date].teachers.forEach(t=>t.R=4);O.updateHealthWarnings(h.state(),h.ctx,[h.date]);assert.equal(healthCalls,1,'verified capacity still generates warnings');
 }finally{A.health=health;}
}

// The requested exclusion list is narrower than ad hoc eligibility. A role such as AM
// remains allowed unless authoritative Contacts membership places it in Support.
{
 const people=[...['SL','P','VP','VP (Admin)','Principal','Vice Principal','MK','MKE','Support','SAT','OSO','OSOs','AE','Acting AE'].map(role=>({role})),...['SL','MK','Support','SAT'].map(group=>({role:'Teacher',groups:[group]})),{role:'Teacher',mk:'MK'},{role:'Teacher',appointmentLevel:'SL'}];
 for(const person of people)assert.equal(O.absenceEligible(person),false,JSON.stringify(person));
 for(const role of ['Teacher','HOD','SH','LH','AM','OM','Counsellor','FAJT','SRE'])assert.equal(O.absenceEligible({role,adhocEligible:false}),true,role);
 const h=adapter(),saved=h.call(h.command()),person=h.ctx.people.find(p=>p.id==='alice');person.mk='MK';
 reject(()=>h.call(h.command('alice',{periods:[3]})),403);
 assert.equal(O.reportView(h.state(),h.ctx,{date:h.date}).people.find(p=>p.id==='alice').absenceEligible,false);
 assert.equal(O.view(h.state(),h.ctx,{date:h.date}).people.find(p=>p.id==='alice').absenceEligible,false);
 h.call(h.command('alice',{id:saved.savedId,revision:1,periods:[3]}));assert.deepEqual(h.state().absences[0].periods,[3],'existing record remains editable');
 h.call({operation:'saveInstructions',requestId:crypto.randomUUID(),revision:2,date:h.date,absenceId:saved.savedId,instructions:{},instructionsNA:true},h.identity('alice'));
 assert.equal(h.state().absences[0].instructionsNA,true,'existing instruction editor remains usable');
}

// Verify the added canonical Contacts fields, including MK when the Role still says Teacher.
{
 const f=require('./contacts503-fixture.js')({source:fs.readFileSync('Contacts_Code.gs','utf8')});
 const person=f.ctx.rosterContactPerson_({'Staff ID':'mk-person','TTb Name':'MK Person','Role':'Teacher','Active':'Y','MK Modifier':'MK','EO Appt Level':'EO'},{'Role Shortform':'Teacher'});
 assert.equal(person.mk,'MK');assert.equal(person.appointmentLevel,'EO');assert.equal(O.absenceEligible(person),false);
 const h=adapter(),scope=h.scope;scope.Utilities.formatDate=(_,tz,format)=>format==='yyyy-MM-dd'?h.date:format==='HH'?'06':'00';
 // Restore the production context builder, and choose its record-only System Config path.
 require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);require('./load-stapler-leases.cjs')(scope);scope.rosterIndex_=()=>({entries:[]});scope.rosterOperationsSubjectCatalogue_=()=>({teachingGroups:[]});
 const ctx=scope.rosterOperationsContext_({identity:{email:'admin@gsps.edu.sg'},input:{operation:'systemConfig',date:h.date}},{user:{rosterSMC:true,rosterAdmin:true,rosterStaffId:'mk-person'},rosterPeople:[person]},O.initial());
 assert.equal(ctx.people[0].mk,'MK');assert.equal(ctx.people[0].appointmentLevel,'EO');assert.equal(O.absenceEligible(ctx.people[0]),false);
}
console.log('PASS independent absence writes, exact replay, stale edit protection, current-state validation, exact category filtering and legacy edits.');

// All thirty requests finish their snapshot/context preparation before any gets
// the commit lock. Reverse-order settlement must retain every independent fact.
{
 const h=adapter(),commands=Array.from({length:30},(_,i)=>h.command('staff'+i));let next=1;
 function overlap(){if(next<commands.length){const command=commands[next++];h.beforeLock(overlap);h.call(command);}}
 h.beforeLock(overlap);const first=h.call(commands[0]),state=h.state();
 assert.equal(state.absences.length,30);assert.equal(state.receipts.length,30);assert.equal(new Set(state.absences.map(a=>a.staffId)).size,30);assert.equal(h.counts().writes,30);
 assert.deepEqual(Array.from(first.affectedDomains),['operations'],'absence cannot invalidate immutable timetables');assert.deepEqual(Array.from(first.affectedDates),[h.date]);
 for(const command of commands)assert.equal(h.call(command).replayed,true);
 assert.equal(h.counts().writes,30);assert.equal(h.state().absences.length,30);
 console.log('PASS 30 overlapping absence preparations, reversed commit order, one record/receipt each, and zero replay writes.');
}
