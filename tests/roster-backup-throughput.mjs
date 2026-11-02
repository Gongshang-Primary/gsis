import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {runRosterMirror} from '../roster-update/public/edge-roster-mirror.js';
const require=createRequire(import.meta.url),Store=require('../shared/edge-store.js'),Mirror=require('../shared/roster-mirror.js'),db=require('./helpers/chunked-import-db.cjs')(),google=require('./helpers/roster-mirror-backend.cjs')();
const state={schema:1,revision:1,audit:Array.from({length:13500},(_,n)=>({id:'synthetic-'+n,date:'2026-11-'+String(n%5+1).padStart(2,'0'),text:('fixture '+n+' ').padEnd(850,'x')})),receipts:[],outbox:[{id:'uncertain',status:'uncertain',messageId:'retained-provider-evidence'}]},index={schema:1,revision:1,entries:[],receipts:[]},oldNow=Date.now;
let time=oldNow(),calls=0,runs=0,largestPage=0;const started=time,realStarted=oldNow();
try{
 Date.now=()=>time;
 for(const [scope,value]of [['roster',state],['roster-register',index]]){const store=Store.open(db,scope),head=await store.importState({state:value,actor:'fixture-admin',requestId:'fixture-'+scope});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'fixture-admin',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});}
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1'},bridge=async input=>{calls++;time+=20000;if(input.step==='page')largestPage=Math.max(largestPage,input.items.length);return google.call(input);};
 let result;
 while(time-started<1800000){runs++;result=await runRosterMirror(env,{core:Mirror,bridge,clock:()=>time});if(result.mirrored)break;time+=60000;}
 assert.equal(result.mirrored,true,'13.5k-item full copy must complete within 30 minutes including 20 s per Google call and 60 s between Worker runs');assert(time-started<=1800000);assert(largestPage>128&&largestPage<=500);
 const head=JSON.parse(google.properties.get('ROSTER_GOOGLE_BACKUP')),manifest=JSON.parse(google.scope.rosterMirrorRead_(head.manifest)),backed=google.scope.rosterSplitReadDocument_(manifest.documents.operations.fileId,true,true).value,notification=google.scope.rosterSplitReadDocument_(manifest.documents.notifications.fileId,true,true).value;
 assert.equal(backed.audit.length,13500);assert.equal(backed.audit[13499].text,state.audit[13499].text);assert.equal(notification.outbox[0].messageId,state.outbox[0].messageId);assert((await Mirror.status(db)).proof.verified);
 console.log(JSON.stringify({check:'13.5k-item full copy, real core and Apps Script adapter',sourceBytes:Buffer.byteLength(JSON.stringify(state)),items:13500,googleCalls:calls,workerRuns:runs,largestPage,simulatedElapsedMinutes:(time-started)/60000,googleRoundTripSeconds:20,betweenRunSeconds:60,localRuntimeSeconds:(oldNow()-realStarted)/1000,liveCalls:0}));
}finally{Date.now=oldNow;db.sql.close();}
