'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const fixture=require('./roster701-fixture.cjs'),clone=x=>JSON.parse(JSON.stringify(x)),root=path.resolve(__dirname,'..');
function harness(count){
 const f=fixture(),people=Array.from({length:count},(_,i)=>({id:'teacher-'+i,name:'Teacher '+i,active:true,mobile:String(91234567+i),email:'teacher'+i+'@gsps.edu.sg'}));
 const teachers=people.map(p=>({staffId:p.id,name:p.name,timetableName:p.name,R:4,cells:clone(f.teachers[0].cells)}));
 let state=clone(f.state),held=false,clock=f.ctx.now,lose=false,failBefore=false,contactsHook=null;
 const stats={reads:0,writes:0,locks:0,contexts:0,contacts:0,lockMs:0,propertyReads:0,propertyWrites:0},properties=new Map([['ROSTER_OPERATIONS_FILE','ops-file'],['ROSTER_VERSION_HINT','fixture-version-0']]);
 const advance=ms=>{clock+=ms;if(held)stats.lockMs+=ms;};
 class Clock extends Date{constructor(...v){super(...(v.length?v:[clock]));}static now(){return clock;}}
 const lock={tryLock(){stats.locks++;if(held)return false;held=true;return true;},releaseLock(){assert(held);held=false;}};
 const scope=vm.createContext({console,Date:Clock,GSISRoster:require('../shared/roster.js'),GSISRosterOperations:f.O,GSISRosterAllocation:require('../shared/roster-allocation.js'),GSISRosterStapler:require('../shared/roster-stapler.js'),Utilities:{getUuid:crypto.randomUUID,DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()]},props_:()=>({getProperty:k=>{stats.propertyReads++;return properties.get(k)||null;},getProperties:()=>Object.fromEntries(properties),setProperty:(k,v)=>{stats.propertyWrites++;properties.set(k,v);},deleteProperty:k=>properties.delete(k)}),rosterToday_:()=>f.date,LockService:{getScriptLock:()=>lock},deployLock_:l=>l.tryLock(),deployUnlock_:l=>l.releaseLock(),error_:(status,message)=>{throw Object.assign(Error(message),{status});}});
 require('./load-backend-role.cjs')(scope,'roster');for(const name of ['backend/RosterOperations.gs','backend/StaplerLeases.gs'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),scope);
 scope.rosterOperationsState_=()=>{stats.reads++;advance(5);return clone(state);};
 scope.rosterOperationsCommit_=s=>{assert(held);advance(10);if(failBefore){failBefore=false;throw Object.assign(Error('write failed'),{status:503});}state=clone(s);stats.writes++;scope.rosterOperationsVersionChanged_();if(lose){lose=false;throw Object.assign(Error('write acknowledgement lost'),{status:503});}};
 scope.rosterOperationsReferenceStamp_=ctx=>scope.rosterOperationsReferenceKey_(ctx);
 scope.rosterOperationsContext_=(req,c)=>{stats.contexts++;advance(15);const day={...clone(f.ctx.days[f.date]),teachers:clone(teachers)};return {...clone(f.ctx),user:scope.rosterOperationsAuthority_(c,req.identity),people,days:{[f.date]:day},baselineDays:{[f.date]:day},timetableEntries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}],now:clock,iso:new Date(clock).toISOString(),uuid:crypto.randomUUID};};
 scope.rosterServiceContacts_=()=>{assert.equal(held,false,'remote Contacts call must not hold the writer lock');stats.contacts++;advance(100);if(contactsHook){const fn=contactsHook;contactsHook=null;fn();}return {identity:{email:'service@gsps.edu.sg'},c:contacts(0,true)};};
 function contacts(i,manager=false){return {user:{rosterStaffId:people[i].id,rosterSMC:manager,rosterAdmin:manager},rosterPeople:people,rosterSMCIds:[people[0].id],rosterAdminIds:[people[0].id]};}
 const send=(i,input)=>scope.rosterOperationsDispatch_({identity:{email:people[i].email},input},contacts(i));
 const service=input=>scope.rosterServiceDispatch_({input});
 const command=i=>({operation:'saveAbsence',view:'report',date:f.date,staffId:people[i].id,typeId:'mc',periods:[2],instructionsNA:true,revision:0,requestId:crypto.randomUUID()});
 return {f,scope,send,service,command,stats,properties,state:()=>clone(state),setState:s=>{state=clone(s);scope.rosterOperationsVersionChanged_();},lose:()=>{lose=true;},fail:()=>{failBefore=true;},hook:fn=>{contactsHook=fn;},held:value=>{held=value;}};
}
const scenarios=[];
for(const users of [1,10,30]){
 const h=harness(users),commands=Array.from({length:users},(_,i)=>h.command(i));
 // Requests all start with revision zero; service work is deterministically
 // interleaved at the remote Contacts boundary and after each durable user save.
 h.hook(()=>{h.send(0,commands[0]);});h.service({operation:'claimNotifications'});
 for(let i=1;i<users;i++)h.send(i,commands[i]);
 for(let i=0;i<users;i++)h.service({operation:'notificationDelivery',eventId:'delivery-'+i,state:'delivered',messageId:'missing-'+i});
 assert.equal(h.state().absences.length,users);assert.equal(new Set(h.state().absences.map(x=>x.id)).size,users);assert.equal(h.state().receipts.length,users);assert.equal(h.state().deliveryEvents.length,users);
 const before={...h.stats};h.held(true);
 for(let i=0;i<users;i++){const result=h.send(i,{operation:'receiptStatus',command:commands[i]});assert.equal(result.accepted,true);assert.equal(result.confirmation,'accepted');assert.equal(result.savedIds.length,1);assert.equal(result.acceptedRevision,i+1);assert(!('people' in result));}
 h.held(false);assert.equal(h.stats.locks,before.locks);assert.equal(h.stats.contexts,before.contexts);assert.equal(h.stats.writes,before.writes);
 const snapshot=h.state();for(let i=0;i<users;i++)h.send(i,commands[i]);assert.deepEqual(h.state(),snapshot,'exact retry never duplicates accepted writes');
 scenarios.push({users,acceptedAbsences:users,backgroundDeliveryEvents:users,receiptQueries:users,receiptContextReads:0,receiptLockWaits:0,...h.stats});
}
{
 const h=harness(2),p=h.command(0);assert.equal(h.send(0,{operation:'receiptStatus',command:p}).confirmation,'unconfirmed');
 h.fail();assert.throws(()=>h.send(0,p),/write failed/);assert.equal(h.send(0,{operation:'receiptStatus',command:p}).accepted,false);assert.equal(h.state().absences.length,0);
 h.lose();assert.throws(()=>h.send(0,p),/acknowledgement lost/);const before={...h.stats},confirmed=h.send(0,{operation:'receiptStatus',command:p});assert.equal(confirmed.accepted,true);assert.equal(h.stats.writes,before.writes);assert.equal(h.stats.contexts,before.contexts);assert.equal(h.stats.locks,before.locks);assert.equal(h.state().absences.length,1);
 assert.throws(()=>h.send(1,{operation:'receiptStatus',command:p}),e=>e.status===409);assert.throws(()=>h.send(0,{operation:'receiptStatus',command:{...p,periods:[3]}}),e=>e.status===409);
 for(const operation of ['read','claimNotifications','receiptStatus','bogus'])assert.throws(()=>h.send(0,{operation:'receiptStatus',command:{...p,operation}}),e=>e.status===400);
 const id=confirmed.savedIds[0];h.send(1,h.command(1));assert.throws(()=>h.send(0,{...p,id,periods:[3],requestId:crypto.randomUUID(),revision:1}),e=>e.status===409);assert.deepEqual(h.state().absences.find(x=>x.id===id).periods,[2]);
 const replay=h.send(0,p);assert.equal(replay.replayed,true);assert.equal(h.state().absences.length,2);
}
{
 const h=harness(1),tick={operation:'scheduledRoster',scheduledTime:h.f.ctx.now};assert.equal(h.service(tick).idle,true);assert.equal(h.stats.contacts,0);assert.equal(h.stats.locks,0);
 const state=h.state();state.massPublications[h.f.date]={at:h.f.ctx.iso};h.setState(state);h.hook(()=>{const newer=h.state();delete newer.massPublications[h.f.date];h.setState(newer);});const before={...h.stats};assert.equal(h.service(tick).idle,true);assert.equal(h.stats.reads-before.reads,2);assert.equal(h.stats.contacts-before.contacts,1);assert.equal(h.stats.contexts,before.contexts,'latest locked state cancels obsolete scheduling work');const hint=JSON.parse(h.properties.get('ROSTER_SCHEDULE_HINT'));assert.equal(hint.version,h.properties.get('ROSTER_VERSION_HINT'),'verified reread refreshes the idle hint');assert.deepEqual(hint.noticeDates,[]);
 const current=h.state();current.massPublications[h.f.date]={at:h.f.ctx.iso};h.setState(current);h.hook(()=>{const newer=h.state(),slot=h.scope.GSISRosterAllocation.schedule(h.f.ctx.now);newer.scheduleReceipts[slot.key]={at:h.f.ctx.iso};h.setState(newer);});assert.equal(h.service(tick).replayed,true);assert.equal(h.stats.writes,0,'concurrent scheduler receipt prevents duplicate commit');
}
{
 const h=harness(1),date=h.f.date,session=crypto.randomUUID(),row={fence:3,owner:'teacher0@gsps.edu.sg',staffId:'teacher-0',session,authority:'sponsored',until:h.f.ctx.now+180000};h.properties.set('ROSTER_STAPLER_LEASE:'+date,JSON.stringify(row));
 const before={...h.stats};h.send(0,{operation:'renewStaplerLock',date,leaseSessionId:session,leaseFence:3});
 assert.equal(h.stats.propertyReads-before.propertyReads,1);assert.equal(h.stats.propertyWrites-before.propertyWrites,1);assert.equal(h.stats.reads-before.reads,0);assert.equal(h.stats.writes-before.writes,0);assert.equal(h.stats.contexts-before.contexts,0);
 assert.throws(()=>h.send(0,{operation:'renewStaplerLock',date,leaseSessionId:session,leaseFence:2}),e=>e.status===409);
}
const report={scope:'Deterministic single-process request interleavings with real backend dispatch/domain and in-memory Apps Script boundaries. Synthetic 100ms Contacts, 5ms state read, 15ms context and 10ms commit costs; not production latency or parallel runtime load.',scenarios,guarantees:['independent new absence reports survive old global revisions','background delivery state retained','lost acknowledgement confirmed without mutation or context','receipt actor and digest enforced','stale existing-record edit rejected','same request replay does not duplicate','lease renewal retains fence checks with one property read'],remaining:'User context/allocation computation and one durable document replacement still serialize under the shared writer lock.'};
fs.mkdirSync(path.join(root,'verification'),{recursive:true});fs.writeFileSync(path.join(root,'verification/718-concurrency.json'),JSON.stringify(report,null,2)+'\n');
console.log('PASS 718 concurrency: 1/10/30 deterministic users, background work, receipts, stale edits and one-read lease renewal.');
module.exports={harness};
