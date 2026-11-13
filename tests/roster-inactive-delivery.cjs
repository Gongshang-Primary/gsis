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
 const h=harness(),state=h.state(),email='inactive@gsps.edu.sg';state.dailyEmploymentMail=[{id:'queued-report',date:h.date,to:email,subject:'Report',status:'queued'}];state.dailyEmploymentSnapshots=[{date:h.date,capturedAt:h.ctx.iso,health:{percentage:null},externalTeachers:[],absences:[],reliefTeachers:[]}];h.setState(state);h.contacts.rosterPeople=[{id:'inactive',active:false,email,emails:[email]}];h.scope.rosterServiceContacts_=()=>({c:h.contacts});let sends=0;h.scope.MailApp={getRemainingDailyQuota:()=>5,sendEmail:()=>{sends++;}};
 const result=h.scope.rosterDailyEmploymentMailDispatch_({publicOrigin:'https://roster.test'});assert.equal(sends,0,'Google retained employment mail must recheck active status before sending');assert.equal(result.sent,0);assert.equal(result.blocked,1);assert.equal(h.state().dailyEmploymentMail[0].status,'blocked');
 console.log('PASS Google retained employment mail blocks an inactive recipient before the provider');
}
console.log('PASS Google directory and final notification/email inactive guards');

