'use strict';
// Signed Contacts and Roster handlers with synthetic Sheets/Drive; no live services.
const assert=require('node:assert/strict'),fs=require('node:fs');
const contactsFixture=require('./contacts503-fixture'),{harness,fixture}=require('./stapler715-persistence.cjs'),O=require('../shared/roster-operations.js');
const plain=x=>JSON.parse(JSON.stringify(x)),input={authorityOnly:true,rosterAuthority:true,rosterDirectory:true},projected={...input,rosterProjection:'staplerDates'};
function setup(){
 const f=contactsFixture({source:fs.readFileSync('Contacts_Code.gs','utf8')}),roles=f.sheets.get('roles'),people=f.sheets.get('contacts');
 for(const [role,groups] of [['Custom SMC',['SMC']],['Custom SL',['SMC','SL']],['Custom Support',['SMC','Support']]])roles.data.push(roles.data[0].map(k=>k==='Role Shortform'?role:groups.includes(k)?'1':''));
 for(const [i,role] of [[2,'Custom SMC'],[3,'Acting Custom SMC'],[4,'Custom SL'],[5,'Custom Support']])people.data[i][10]=role;
 people.data[2][3]='smc';people.data[6][3]='admin';return f;
}
function read(f,request=projected,email='smc@gsps.edu.sg'){const out=f.post('deploySnapshot',request,email);assert.equal(out.ok,true,JSON.stringify(out));return out.data;}
const f=setup(),full=read(f,input),compact=read(f);
assert.equal(compact.rosterProjection,'staplerDates','explicit trusted projection is acknowledged');
assert.deepEqual(compact.user,full.user);
assert.equal(compact.rosterPeople,undefined,'unrelated staff are absent');assert.equal(compact.rosterAdminIds,undefined,'no notification recipient selection');assert.equal(compact.rosterSMCIds,undefined);
assert.deepEqual(Object.keys(compact.rosterDates).sort(),['caller','sponsors']);
const fullCaller=full.rosterPeople.find(p=>p.id===full.user.rosterStaffId);
assert.deepEqual(compact.rosterDates.caller,{id:full.user.rosterStaffId,name:fullCaller.name,active:true,role:fullCaller.role,groups:fullCaller.groups,mk:fullCaller.mk,appointmentLevel:fullCaller.appointmentLevel});
const sponsors=data=>data.rosterDates?data.rosterDates.sponsors:data.rosterPeople.filter(p=>data.rosterSMCIds.includes(p.id)&&O.teacherSponsor(p)).map(({id,name})=>({id,name}));
assert.deepEqual(sponsors(compact),sponsors(full));assert(sponsors(compact).length>0);for(const person of sponsors(compact))assert.deepEqual(Object.keys(person).sort(),['id','name']);
assert(Buffer.byteLength(JSON.stringify(compact))<Buffer.byteLength(JSON.stringify(full)));
assert.equal(compact.timing.io.apiReads,1);assert.equal(f.stats.writes.length,0);assert.equal(f.stats.lockAttempts.length,0);
// Every new projection request must observe current role, contact and Admin access.
f.sheets.get('roles').data.find(r=>r[0]==='Custom SMC')[f.sheets.get('roles').data[0].indexOf('SMC')]='';assert.equal(read(f).user.rosterSMC,false);assert.equal(sponsors(read(f)).some(p=>p.id==='staff-1'),false);
f.sheets.get('contacts').data[2][15]='N';assert.equal(read(f).user.rosterStaffId,null);
assert.equal(read(f,projected,'admin@gsps.edu.sg').user.rosterAdmin,true);f.sheets.get('admin_users').data[1][2]='N';assert.equal(read(f,projected,'admin@gsps.edu.sg').user.rosterAdmin,false);
{
 const g=setup(),batch=g.ctx.Sheets.Spreadsheets.Values.batchGet;let calls=0;
 g.ctx.Sheets.Spreadsheets.Values.batchGet=(...args)=>{const result=batch(...args);if(++calls===1){g.props.set('CONTACTS_DATA_EPOCH','changed');g.sheets.get('admin_users').data[1][2]='N';}return result;};
 assert.equal(read(g,projected,'admin@gsps.edu.sg').user.rosterAdmin,false);assert.equal(calls,2);
 g.seedSnapshot([{id:'staff-1',field:'Basic Name',expected:'Person 1',value:'Pending'}]);assert.equal(g.post('deploySnapshot',projected,'smc@gsps.edu.sg').status,503);
}
for(const mutate of [g=>g.sheets.get('contacts').data[3][17]='staff-1',g=>g.sheets.get('roles').data.push([...g.sheets.get('roles').data[1]])]){const g=setup();mutate(g);assert.equal(g.post('deploySnapshot',projected,'smc@gsps.edu.sg').status,503,'canonical duplicate validation is retained');}
{
 const g=setup(),api=read(g);g.ctx.Sheets=undefined;const native=read(g);for(const key of ['user','rosterDates'])assert.deepEqual(native[key],api[key]);assert.equal(native.timing.io.nativeReads,3);
}
for(const bad of [()=>{throw Error('unavailable')},()=>({valueRanges:[]})]){const g=setup();g.ctx.Sheets.Spreadsheets.Values.batchGet=bad;assert.equal(g.post('deploySnapshot',projected,'smc@gsps.edu.sg').status,503);}
// Full and compact Contacts responses produce the same list, lease and baseline metadata.
// Published history tables are traversed once for the whole date-list projection.
{
 const state=O.initial(),ctx={today:'2026-10-21',user:{smc:true,admin:false},people:[],smcIds:[],timetableEntries:[]};
 state.staplerPlans=Array.from({length:8},(_,i)=>({date:'2026-10-'+(21+i),baselineId:'a',revision:1,draft:{}}));
 state.publicationSnapshots.push({date:'2026-10-21'});state.assignments.push({date:'2026-10-22',status:'completed'});
 let scans=0;for(const key of ['publicationSnapshots','assignments','importedRelief']){const original=state[key].some;state[key].some=function(...args){scans++;return original.apply(this,args)};}
 const view=O.staplerDatesView(state,ctx);assert.equal(view.dates.filter(r=>r.lifecycleIssue==='Published history must stay on its original date.').length,2);assert(scans<=3,'history is indexed once instead of rescanned per date');
}
const {day,people}=fixture(),h=harness(day,people),state=O.initial();
state.staplerPlans.push({date:day.date,name:'Saved date',baselineId:day.id,revision:3,draft:{encoding:'gzip-base64-v1',bytes:100,data:'must-not-decompress'}});
state.staplerRequests.push({id:'approved',date:day.date,staffId:'staff-1',sponsorId:'staff-2',status:'approved'});
state.staplerArchives.push({id:'archived',date:'2026-10-22',name:'Deleted',baselineId:day.id,revision:1,archiveReason:'deleted',archivedAt:'2026-10-20T00:00:00Z'});h.replace(state);
function call(p,data,{early=false,baselineId=day.id}={}){
 return h.call(p,{actualContext:true,inspect:scope=>{
  scope.contacts_=(identity,review,action,request)=>{assert.equal(request.rosterProjection,p.operation==='staplerDates'?'staplerDates':undefined,'only explicit dates reads select reduced Contacts');return data;};
  scope.Utilities.formatDate=(value,tz,format)=>format==='yyyy-MM-dd'?day.date:format==='HH'?'06':'00';
  scope.rosterIndex_=()=>({entries:[{id:baselineId,from:'2026-01-01',to:'2026-12-31'}]});
  scope.rosterModel_=scope.rosterOperationsQuota_=()=>{throw Error('dates read cannot build model/quota')};
  if(early){scope.GSISRosterOperations.seedNameBridges=()=>{throw Error('dates read cannot seed name bridges')};scope.GSISRosterOperations.dutyEligible=()=>{throw Error('dates read cannot prepare duty/notification context')};}
 }}).result;
}
try{
 const old=call({operation:'staplerDates'},full),next=call({operation:'staplerDates'},compact,{early:true});assert.equal(old.ok,true,JSON.stringify(old));assert.equal(next.ok,true,JSON.stringify(next));assert.deepEqual(next.data,old.data);assert.equal(next.data.dates[0].draftRevision,3);assert.equal(next.data.dates[0].baselineChanged,false);assert.equal(h.writes(),0);
 const changed=call({operation:'staplerDates'},compact,{early:true,baselineId:'replacement'});assert.equal(changed.ok,true,JSON.stringify(changed));assert.equal(changed.data.dates[0].baselineChanged,true);
 const teacher=plain(compact);Object.assign(teacher.user,{rosterSMC:false,rosterAdmin:false,rosterStaffId:'staff-1'});const ordinary=call({operation:'staplerDates'},teacher,{early:true});assert.equal(ordinary.ok,true);assert.equal(ordinary.data.dates[0].mayEdit,true);assert.deepEqual(ordinary.data.deletedArchives,[]);
 teacher.rosterDates.caller=null;teacher.user.rosterStaffId=null;assert.deepEqual(call({operation:'staplerDates'},teacher,{early:true}).data.dates,[]);
 for(const bad of [{...compact,rosterDates:{...compact.rosterDates,sponsors:[null]}},{...compact,rosterDates:{}},{...compact,rosterDates:{...compact.rosterDates,caller:{id:'wrong',name:'Wrong',active:true}}}])assert.equal(call({operation:'staplerDates'},bad).ok,false,'malformed projection fails closed');
 for(const operation of ['read','calculations','receiptStatus','acquireStaplerLock','requestStapler','renameStapler','moveStapler','deleteStapler','restoreStapler']){const denied=call({operation,view:'staplerDates',date:day.date,revision:0,requestId:require('node:crypto').randomUUID()},compact);assert.equal(denied.ok,false,'reduced projection cannot be reused by '+operation);}
}finally{h.close();}
console.log(JSON.stringify({fullContactBytes:Buffer.byteLength(JSON.stringify(full)),datesContactBytes:Buffer.byteLength(JSON.stringify(compact)),fullPeople:full.rosterPeople.length,sponsors:compact.rosterDates.sponsors.length,caller:!!compact.rosterDates.caller}));
console.log('PASS dates Contacts: compact identity projection, live revocation, canonical validation, coherent retry, fallback/errors, early context, baseline/ordinary permissions and no plan unpack/write.');
