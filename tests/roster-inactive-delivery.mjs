import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import fs from 'node:fs';
import vm from 'node:vm';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {GSiSEdgeNotifications} from '../roster-update/public/edge-roster-domain.js';
import {edgeRosterBackend,edgeRosterService,buildEdgeRosterContext,loadEdgeRoster,readEdgeRosterReferences,refreshEdgeRosterReferences} from '../roster-update/public/edge-roster.js';
import {dispatchEdgeEmploymentMail} from '../roster-update/public/edge-notifications.js';
import {createDeployDomain} from '../roster-update/public/edge-deploy-domain.js';
import {sha256Bytes,sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';

const transport=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('shared/roster-absence-transport.js','utf8')).toString('base64'));
const require=createRequire(import.meta.url),O=require('../shared/roster-operations.js'),A=require('../shared/roster-allocation.js'),database=require('./helpers/chunked-import-db.cjs');
const Fields=vm.runInNewContext(fs.readFileSync('shared/fields.js','utf8')+';GSISFields;');
const actualNow=Date.now,actualFetch=globalThis.fetch,today='2026-10-14',future='2026-10-15',who={email:'alice@gsps.edu.sg',subject:'alice'};
const databases=[];
let now=Date.parse(today+'T06:00:00+08:00'),passed=0,failed=0;
Date.now=()=>now;
async function test(name,run){try{now=Date.parse(today+'T06:00:00+08:00');await run();passed++;console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,error.stack?.split('\n').map(line=>line.length>700?line.slice(0,700)+'…':line).join('\n'));}}
async function activate(db,scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'setup',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'setup',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}
async function currentContacts(f){const old=await f.referenceStore.load();await f.referenceStore.commit({before:old.state,after:{...old.state,contactsCheckedAt:now},expectedRevision:old.revision,actor:'setup',requestId:crypto.randomUUID(),digest:await GSiSEdgeStore.digest(now),result:{}});}
async function changeState(f,change){const old=await f.roster.load(),next=structuredClone(old.state);change(next);await f.roster.commit({before:old.state,after:next,expectedRevision:old.revision,actor:'setup',requestId:crypto.randomUUID(),digest:await GSiSEdgeStore.digest(next),result:{}});}
async function fixture({date=future,active=false,quota=true,calendar=true}={}){
 const db=database();databases.push(db);const objects=new Map(),people=['Alice','Bob','Charlie','Dora'].map((name,i)=>({id:name.toLowerCase(),name,active:true,email:name.toLowerCase()+'@gsps.edu.sg',emails:[name.toLowerCase()+'@gsps.edu.sg'],mobile:String(91234567+i*1111111),role:'Teacher',groups:['Teaching'],employment:'Permanent',adhocEligible:true}));
 const blank=()=>Array.from({length:85},()=>['','','','']),blocks=people.map(person=>({name:person.name,cells:blank()}));for(let weekday=0;weekday<5;weekday++)for(const period of [2,3])blocks[0].cells[weekday*17+period]=['EL','4A','C1-01',''];
 const model={layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]},text=JSON.stringify(model),digest=sha256Hex(text),key='test/baseline-'+crypto.randomUUID()+'.json.gz';objects.set(key,gzipSync(text));
 const periods=Array.from({length:17},(_,period)=>{const startMinutes=420+period*30,fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');return {period,startMinutes,endMinutes:startMinutes+30,start:fmt(startMinutes),end:fmt(startMinutes+30)};});
 const days=Object.fromEntries([today,future].map(day=>[day,{id:'baseline',parity:'single',verified:true,schoolDay:true,periods,teachers:people.map((person,i)=>({staffId:person.id,name:person.name,R:4,cells:blocks[i].cells.slice(new Date(day).getUTCDay()*17-17,new Date(day).getUTCDay()*17)}))}]));
 const state=O.initial(),ctx={people,days,baselineDays:days,today,now,iso:new Date(now).toISOString(),minute:360,user:{staffId:'alice',email:who.email,smc:true,admin:true},smcIds:['alice'],notificationsConfigured:false,adminRecipients:[],uuid:()=>crypto.randomUUID()};
 O.apply(state,ctx,{operation:'saveAbsence',date,staffId:'alice',periods:[2,3],typeId:'mc',reliefRequired:true});const demands=O.demand(ctx,state,date);O.apply(state,ctx,{operation:'assign',date,staffId:'bob',demandIds:[demands.find(row=>row.period===2).id]});O.apply(state,ctx,{operation:'assign',date,staffId:'charlie',demandIds:[demands.find(row=>row.period===3).id]});
 state.accountingYears['2026']={verified:true};state.adhoc.push({id:'activated-bob',staffId:'bob',date,periods:[2]});people[1].active=active;
 const roster=await activate(db,'roster',state);await activate(db,'roster-register',{revision:0,entries:[{id:'baseline',name:'Baseline',from:'2026-01-01',to:'2026-12-31',priority:1,modelObject:{key,digest,encoding:'gzip-json-v1'}}],receipts:[]});
 const references={schema:1,contacts:{rosterPeople:people,rosterSMCIds:['alice'],rosterAdminIds:['alice'],rosterUrgentSMCIds:['alice']},contactsCheckedAt:now,calendarCheckedAt:now,statisticsCalendar:{terms:[],semesters:[]},calendarByDate:calendar?Object.fromEntries([today,future].map(day=>[day,{date:day,available:true,schoolDay:true,parity:null}])):{}};
 const referenceStore=await activate(db,'roster-references',references);
 if(quota){const deploy={index:{versions:[],active:null,published:null,publicationSchema:1,revision:0,requests:[]},drafts:{},publications:{},receipts:{},deltas:{},leases:{},properties:{},jobs:{}},identity={email:who.email},domain=createDeployDomain({state:deploy,identity,sha256:sha256Bytes,calculations:new Map(),integration(){assert.fail('No remote Deploy integration');}});domain.dispatch({action:'change',input:{operation:'create',name:'Quota',requestId:crypto.randomUUID()},identity},{user:{email:who.email,roles:['Admin','KP']},people:[],sysFields:{},roleCatalogue:[],authoritative:true});const document=domain.readDocument(deploy.index.versions[0]);document.from='2026-01-01';document.to='2026-12-31';document.teachers=people.map(person=>({id:person.id,name:person.name,active:true,role:'Teacher',groups:[],profile:{'Basic Name':person.name,Role:'Teacher',Active:'Y','EO Appt Level':'GEO3'}}));const publication={...deploy.index.versions[0],from:document.from,to:document.to,edgePublished:true,commit:crypto.randomUUID()};deploy.index.published=publication;deploy.index.venuePublications=[publication];deploy.publications=Object.fromEntries(Object.entries(Fields.flat(document)).map(([field,value])=>[publication.commit+'|'+field,value]));await activate(db,'deploy',deploy);}
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.test',ROSTER_SERVICE_SECRET:'s'.repeat(32),WHATSAPP_ENABLED:'false',ROSTER_TIMETABLE_SNAPSHOTS:{async get(path){const data=objects.get(path);return data?{body:new Blob([data]).stream()}:null;},async put(path,data){objects.set(path,new Uint8Array(data));}}};
 const read=async input=>{const response=await edgeRosterBackend(env,'rosterOperations',input,who,'inactive-test');if(!response.result.ok)throw Object.assign(Error(response.result.error),response.result);return response.result.data;};
 return {db,env,roster,referenceStore,references,people,state,ctx,date,read,stateNow:async()=>(await loadEdgeRoster(env)).state};
}
try{
 await test('D1 directory excludes an inactive teacher despite a dated ad hoc activation',async()=>{const f=await fixture();const result=await f.read({operation:'directory',date:future});assert(!result.people.some(person=>person.id==='bob'));});
 await test('D1 final notification preparation refuses inactive ad hoc recipients',async()=>{const f=await fixture(),state=await f.stateNow(),job={kind:'contact_review',recipientId:'bob',date:future,data:{templateKey:'contact_review'},status:'queued'},contacts={...f.references.contacts,rosterAdminIds:['alice','bob']};assert.match(GSiSEdgeNotifications.eligible(state,job,now,contacts,{},new Set(['contact_review'])),/inactive/i);});
 await test('retained employment email cannot send after its recipient becomes inactive',async()=>{
  const db=database(),state=O.initial(),email='inactive@gsps.edu.sg';state.dailyEmploymentMail=[{id:'queued-report',date:today,to:email,subject:'Report',status:'queued'}];state.dailyEmploymentSnapshots=[{date:today,capturedAt:new Date(now).toISOString(),health:{percentage:null},externalTeachers:[],absences:[],reliefTeachers:[]}];
  try{await activate(db,'roster',state);await activate(db,'roster-register',{entries:[],receipts:[],revision:0});await activate(db,'roster-references',{contacts:{rosterPeople:[{id:'inactive',name:'Inactive',active:false,email,emails:[email]}],rosterSMCIds:[],rosterAdminIds:[]},contactsCheckedAt:now});let sends=0;
   const result=await dispatchEdgeEmploymentMail({GSIS_JOBS:db,ROSTER_PUBLIC_ORIGIN:'https://roster.test'},async()=>{sends++;return {ok:true,data:{accepted:true}};});assert.equal(sends,0,'retained queued mail is fenced before the provider');assert.equal(result.sent,0);assert.equal(result.blocked,1);assert.equal((await GSiSEdgeStore.open(db,'roster').load()).state.dailyEmploymentMail[0].status,'blocked');
  }finally{db.sql.close();}
 });

 await test('D1 report-form read retains existing inactive duties and publication records',async()=>{const f=await fixture(),before=await f.stateNow();await f.read({operation:'read',view:'reportForm',date:today});const after=await f.stateNow();assert.deepEqual(after.assignments,before.assignments);assert.deepEqual(after.publicationSnapshots,before.publicationSnapshots);});
}finally{Date.now=actualNow;globalThis.fetch=actualFetch;for(const db of databases)db.sql.close();}
console.log(`${passed}/${passed+failed} inactive D1 boundary checks passed`);if(failed)process.exitCode=1;

