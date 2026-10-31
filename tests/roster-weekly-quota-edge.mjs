import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import fs from 'node:fs';
import vm from 'node:vm';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {GSiSEdgeNotifications} from '../roster-update/public/edge-roster-domain.js';
import {edgeRosterBackend,edgeRosterService,buildEdgeRosterContext,loadEdgeRoster,readEdgeRosterReferences,refreshEdgeRosterReferences} from '../roster-update/public/edge-roster.js';
import {createDeployDomain} from '../roster-update/public/edge-deploy-domain.js';
import {sha256Bytes,sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';

const transport=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('shared/roster-absence-transport.js','utf8')).toString('base64'));
const require=createRequire(import.meta.url),O=require('../shared/roster-operations.js'),A=require('../shared/roster-allocation.js'),database=require('./helpers/chunked-import-db.cjs');
const Fields=vm.runInNewContext(fs.readFileSync('shared/fields.js','utf8')+';GSISFields;');
const actualNow=Date.now,actualFetch=globalThis.fetch,today='2026-11-01',future='2026-11-02',who={email:'alice@gsps.edu.sg',subject:'alice'};
let now=Date.parse(today+'T06:00:00+08:00'),passed=0,failed=0;
Date.now=()=>now;
async function test(name,run){try{now=Date.parse(today+'T06:00:00+08:00');await run();passed++;console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,error.stack?.split('\n').map(line=>line.length>700?line.slice(0,700)+'…':line).join('\n'));}}
async function activate(db,scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'setup',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'setup',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}
async function currentContacts(f){const old=await f.referenceStore.load();await f.referenceStore.commit({before:old.state,after:{...old.state,contactsCheckedAt:now},expectedRevision:old.revision,actor:'setup',requestId:crypto.randomUUID(),digest:await GSiSEdgeStore.digest(now),result:{}});}
async function changeState(f,change){const old=await f.roster.load(),next=structuredClone(old.state);change(next);await f.roster.commit({before:old.state,after:next,expectedRevision:old.revision,actor:'setup',requestId:crypto.randomUUID(),digest:await GSiSEdgeStore.digest(next),result:{}});}
async function fixture({date=future,active=false,quota=true,calendar=true}={}){
 const db=database(),objects=new Map(),people=['Alice','Bob','Charlie','Dora'].map((name,i)=>({id:name.toLowerCase(),name,active:true,email:name.toLowerCase()+'@gsps.edu.sg',emails:[name.toLowerCase()+'@gsps.edu.sg'],mobile:String(91234567+i*1111111),role:'Teacher',groups:['Teaching'],employment:'Permanent',adhocEligible:true}));
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
// Reuse the production-sized dated context shape from the inactive-staff fixture.
// Every identity and timetable in this file is synthetic; no network is used.
async function checkpointFixture(){
 const f=await fixture({active:true});now=Date.parse(today+'T16:00:00+08:00');
 const previous=await f.referenceStore.load(),next=structuredClone(previous.state);next.contactsCheckedAt=now;
 for(let n=0;n<5;n++){const date=A.addDays(future,n);next.calendarByDate[date]={date,available:true,schoolDay:true,parity:null};}
 await f.referenceStore.commit({before:previous.state,after:next,expectedRevision:previous.revision,actor:'setup',requestId:crypto.randomUUID(),digest:await GSiSEdgeStore.digest(next),result:{}});
 const evidence={week:future,cutoff:now,verified:true,source:{service:'deploy',versionId:'published-weekly',revision:3,commit:'frozen-publication',calculationVersion:'verified-quota',publishedAt:'2026-10-30T08:00:00.000Z'},rows:f.people.map((person,i)=>({id:person.id,R:7+i}))};
 return {...f,evidence};
}
try{
 await test('D1 captures Sunday snapshot R while allocation is paused and mirrors the commit',async()=>{
  const f=await checkpointFixture(),before=await f.roster.head(),original=structuredClone(f.state.assignments);
  const context=await buildEdgeRosterContext(f.env,await f.stateNow(),{operation:'scheduledRoster',date:future,quotaCheckpointEvidence:f.evidence},{service:true,email:'roster-service'});
  for(let n=0;n<5;n++)assert.equal(context.days[A.addDays(future,n)]?.verified,true,'the entire checkpoint week is verified, including after a Monday holiday');
  const result=await edgeRosterService(f.env,{operation:'scheduledRoster',scheduledTime:now,quotaCheckpointEvidence:f.evidence});
  const saved=await f.stateNow();assert.equal(result.quotaCheckpoint.status,'ready');assert.equal(saved.quotaCheckpoints[future].status,'ready');
  assert.equal(saved.entitlements.find(row=>row.staffId==='alice'&&row.week===future).quota,7);
  const choices=rows=>rows.map(({reviewRequired,workloadReview,...row})=>row);
  assert.deepEqual(choices(saved.assignments),choices(original),'snapshot capture retains all existing manual cover; current safety checks may add advisory review metadata');
  assert((await f.roster.head()).revision>before.revision);
  assert(f.db.sql.prepare("SELECT COUNT(*) n FROM gsis_roster_mirror_outbox WHERE scope='roster'").get().n>0,'weekly ledger change enters the ordinary Google mirror');
  const revision=(await f.roster.head()).revision,again=await edgeRosterService(f.env,{operation:'scheduledRoster',scheduledTime:now,quotaCheckpointEvidence:f.evidence});
  assert.equal(again.replayed,true);assert.equal((await f.roster.head()).revision,revision,'repeated cron cannot credit twice');
 });
 await test('D1 pending source creates one alert and stops after the first Monday allocation attempt',async()=>{
  const f=await checkpointFixture(),evidence={...f.evidence,verified:false,reason:'QUOTA_SNAPSHOT_MISSING'};
  await edgeRosterService(f.env,{operation:'scheduledRoster',scheduledTime:now,quotaCheckpointEvidence:evidence});
  let saved=await f.stateNow();assert.equal(saved.quotaCheckpoints[future].status,'pending');assert(!saved.entitlements.some(row=>row.week===future),'no verified prior R remains unknown');
  assert.equal(saved.smcAlerts.filter(row=>row.key==='quota-checkpoint:'+future).length,1);
  now=Date.parse(future+'T05:30:00+08:00');await currentContacts(f);
  await edgeRosterService(f.env,{operation:'scheduledRoster',scheduledTime:now,quotaCheckpointEvidence:evidence});
  saved=await f.stateNow();assert.equal(saved.quotaCheckpoints[future].retryStopped,true);assert.equal(saved.smcAlerts.filter(row=>row.key==='quota-checkpoint:'+future).length,1);
 });
}finally{Date.now=actualNow;globalThis.fetch=actualFetch;}
console.log(`${passed}/${passed+failed} D1 weekly snapshot integration checks passed`);if(failed)process.exitCode=1;
