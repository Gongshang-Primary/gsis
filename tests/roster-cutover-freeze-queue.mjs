import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import worker from '../notification-worker/index.js';
import {beginRosterCutoverFreeze,syncRosterCutoverFreeze,readRosterCutoverFreeze} from '../shared/roster-cutover-freeze.js';
import {readSystemHealth} from '../shared/edge-health.js';
import {captureAbsenceTransport,dispatchAbsenceTransport} from '../shared/roster-absence-transport.js';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {GSISRosterOperations as O} from '../roster-update/public/edge-roster-domain.js';
import {edgeRosterBackend} from '../roster-update/public/edge-roster.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),db=database();
const env={GSIS_JOBS:db,APPS_SCRIPT_URL:'https://script.google.com/macros/s/freeze-fixture/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',ROSTER_SERVICE_SECRET:'s'.repeat(40),WHATSAPP_ENABLED:'false'},who={email:'alice@gsps.edu.sg',subject:'alice'},id=crypto.randomUUID(),date='2026-11-02';
const command={operation:'saveAbsence',requestId:crypto.randomUUID(),intake:true,revision:0,date,staffId:'alice',typeId:'mc',fullDay:true,reliefRequired:false,receiptOnly:true};
const realFetch=globalThis.fetch;let network=0;
try{
 globalThis.fetch=()=>{network++;throw Error('frozen jobs must not call Google or a provider');};
 const held=await beginRosterCutoverFreeze(env,{requestId:id});
 await captureAbsenceTransport(env,who,command);
 const before=db.sql.prepare('SELECT command,state,attempts,claim_id FROM gsis_absence_transport').get(),pending=[];
 await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()},env,{waitUntil:p=>pending.push(p)});await Promise.all(pending);
 assert.equal(network,0);assert.deepEqual(db.sql.prepare('SELECT command,state,attempts,claim_id FROM gsis_absence_transport').get(),before,'freeze preserves the exact pending report and claim state');
 const health=await readSystemHealth(env,{jobsOnly:true});assert.equal(health.cutoverFreeze.active,true);for(const name of ['allocation','notifications','received-reports','inbox','peer-mail'])assert(health.jobs.some(row=>row.job===name&&row.status==='skipped'&&row.code==='ROSTER_CUTOVER_FROZEN'),name+' records skipped cutover freeze');
 let retries=0,acks=0;await worker.queue({messages:[{body:{purpose:'gsis-notification-wake-v1'},retry:()=>retries++,ack:()=>acks++}]},env);assert.equal(retries,1);assert.equal(acks,0);assert.equal(network,0);
 const person={id:'alice',name:'Synthetic Alice',active:true,email:who.email,emails:[who.email],groups:['Teaching'],role:'Teacher',mobile:'6590000001',employment:'Permanent',mk:'',appointmentLevel:''};
 const refs={schema:1,contacts:{rosterPeople:[person],rosterSMCIds:['alice'],rosterAdminIds:['alice'],rosterUrgentSMCIds:['alice']},contactsCheckedAt:Date.now(),calendarCheckedAt:Date.now(),calendarByDate:{[date]:{date,schoolDay:true,parity:'odd',available:true}}};
 for(const [scope,state]of [['roster',O.initial()],['roster-register',{revision:0,entries:[],receipts:[]}],['roster-references',refs]]){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'setup',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'setup',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});}
 await syncRosterCutoverFreeze(env,{available:true,active:false,state:'activated',requestId:id,frozenAt:held.frozenAt},{expectedRevision:held.revision});
 const activeEnv={...env,ROSTER_EDGE_AUTHORITY:'d1'};let forwarded=0;
 const capture=async(input,identity)=>{forwarded++;return (await edgeRosterBackend(activeEnv,'rosterOperations',input,identity,crypto.randomUUID())).result;};
 const first=await dispatchAbsenceTransport(activeEnv,{capture}),second=await dispatchAbsenceTransport(activeEnv,{capture});assert.equal(first.forwarded,1);assert.equal(second.claimed,0);assert.equal(forwarded,1);
 assert.equal((await GSiSEdgeStore.open(db,'roster').load()).state.absences.length,1,'retained report applies to D1 exactly once');assert.equal(db.sql.prepare('SELECT state FROM gsis_absence_transport').get().state,'forwarded');
 assert.equal((await readRosterCutoverFreeze(env)).active,false);assert.equal(network,0);console.log('PASS frozen cron/queue skip, retained capture, retry wake and exactly-once D1 report drain after activation');
}finally{globalThis.fetch=realFetch;db.sql.close();}
