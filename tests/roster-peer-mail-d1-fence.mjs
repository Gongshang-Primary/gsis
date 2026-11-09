import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dispatchPeerMail} from '../roster-update/public/_worker.js';
import {GSISRosterOperations as O} from '../roster-update/public/edge-roster-domain.js';
const require=createRequire(import.meta.url),Store=require('../shared/edge-store.js'),database=require('./helpers/chunked-import-db.cjs'),db=database(),previousFetch=globalThis.fetch;
const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',APPS_SCRIPT_URL:'https://script.google.com/macros/s/fenced-fixture/exec',GSIS_SECRET:'s'.repeat(40)};
let googleCalls=0;
async function activate(scope,state){const store=Store.open(db,scope),head=await store.importState({state,actor:'setup',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'setup',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}
try{
 // Any mistaken Google health save or send reaches a fenced adapter and fails.
 globalThis.fetch=async()=>{googleCalls++;return Response.json({ok:false,status:409,code:'ROSTER_LEGACY_WRITER',error:'Google writes are fenced for D1.'},{status:409});};
 const state=O.initial(),mail={id:'retained-mail',requestId:'old-request',recipientId:'one',recipientName:'One',date:'2026-11-02',email:'one@school.test',status:'uncertain',fingerprint:'proposal',claimId:'previous-claim',preparedAt:100,completedAt:'2026-11-01T00:00:00Z',attempts:1,error:'Unknown provider outcome'};state.peerMail=[mail];
 const store=await activate('roster',state);await activate('roster-register',{entries:[],revision:0});await activate('roster-references',{schema:1,contacts:{rosterPeople:[],rosterSMCIds:[],rosterAdminIds:[]},contactsCheckedAt:Date.now(),calendarByDate:{}});
 const first=await dispatchPeerMail(env);assert.equal(first.newUncertain,1);assert.equal(first.uncertain,1);
 const saved=JSON.parse(db.sql.prepare("SELECT value_json FROM gsis_edge_records WHERE scope='roster' AND collection='peerMail' AND record_id='id:retained-mail'").get().value_json);
 assert.equal(saved.healthReceipt.schema,1,'the authoritative D1 mail row owns the health receipt');assert.equal(saved.status,'uncertain');assert.equal(saved.attempts,1);assert.equal(saved.claimId,mail.claimId);
 const revision=(await store.head()).revision;
 for(let n=0;n<10;n++){const repeated=await dispatchPeerMail(env);assert.equal(repeated.newUncertain,0);assert.equal(repeated.sent,0);}
 assert.equal((await store.head()).revision,revision,'unchanged evidence stays idle instead of repeatedly writing or failing');assert.equal(googleCalls,0,'D1 health and repeated uncertainty never call fenced Google or MailApp');
 const retained=(await store.load()).state;assert.equal(retained.smcAlerts.length,1);assert.deepEqual(retained.peerMail[0],saved,'provider uncertainty remains unchanged');
 console.log('PASS actual Worker dispatch under D1 and a fenced Google adapter: D1 health receipt, one observation, ten idle ticks, no Google writes and no resend');
}finally{globalThis.fetch=previousFetch;db.sql.close();}
