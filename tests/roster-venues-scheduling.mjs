import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import worker from '../notification-worker/index.js';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {startQuietMode,endQuietMode} from '../shared/roster-quiet-mode.js';

const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),originalFetch=globalThis.fetch,originalNow=Date.now,originalInfo=console.info,originalError=console.error;
let now=Date.parse('2026-10-14T06:50:00+08:00'),failed=0;
Date.now=()=>now;
async function test(name,run){try{await run();originalInfo('PASS '+name);}catch(error){failed++;originalError(name,error);}}
async function fixture(){
 const db=database();await GSiSEdgeStore.open(db,'roster').ensure();
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'legacy',APPS_SCRIPT_URL:'https://script.google.com/macros/s/venues-fixture/exec',GSIS_SECRET:'synthetic-venues-service-'.repeat(3),ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',ROSTER_AUTOMATION_ENABLED:'false',WHATSAPP_ENABLED:'false'},calls=[],logs=[];
 let onService=null;
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),env.APPS_SCRIPT_URL);const input=JSON.parse(JSON.parse(options.body).payload).input;calls.push(input.operation);if(onService)await onService(input.operation);const results={nextAbsenceIntake:{job:null},sendPeerMail:{sent:0},venuesSyncCheck:{enabled:true,state:'ready',marker:'PRIVATE_MARKER'},allocationAuditExport:{exported:[],pending:0,failures:[]}};assert(Object.hasOwn(results,input.operation),'unexpected Google call '+input.operation);return Response.json({ok:true,data:results[input.operation]});};
 console.info=console.error=value=>logs.push(JSON.parse(value));
 return {db,calls,logs,onService(fn){onService=fn;},async tick(cron='* * * * *'){const pending=[];await worker.scheduled({cron,scheduledTime:now},env,{waitUntil:p=>pending.push(p)});await Promise.all(pending);},async close(){db.sql.close();}};
}
try{
 await test('audit trigger retains exactly one audit job and log, with no Venues call',async()=>{
  const f=await fixture();try{await f.tick('2-57/5 * * * *');assert.deepEqual(f.calls,['allocationAuditExport']);assert.equal(f.logs.length,1);assert.equal(f.logs[0].event,'roster-allocation-audit');}finally{await f.close();}
 });
 await test('quiet audit trigger makes no Google call or job log',async()=>{
  const f=await fixture();try{await startQuietMode(f.db,'fixture-smc',now);await f.tick('2-57/5 * * * *');assert.deepEqual(f.calls,[]);assert.deepEqual(f.logs,[]);}finally{await f.close();}
 });
 await test('Venues owns a minute-lane job admitted once every five minutes',async()=>{
  const started=now,f=await fixture();try{await f.tick();assert.equal(f.calls.filter(op=>op==='venuesSyncCheck').length,1);assert.equal(f.logs.filter(row=>row.event==='roster-venues-sync').length,1);assert(!JSON.stringify(f.logs).includes('PRIVATE_MARKER'));f.calls.length=0;f.logs.length=0;now+=60000;await f.tick();assert(!f.calls.includes('venuesSyncCheck'));assert(!f.logs.some(row=>row.event==='roster-venues-sync'));}finally{now=started;await f.close();}
 });
 await test('quiet minute trigger skips the due Venues Google call',async()=>{
  const f=await fixture();try{await startQuietMode(f.db,'fixture-smc',now);await f.tick();assert(!f.calls.includes('venuesSyncCheck'));}finally{await f.close();}
 });
 await test('quiet mode renewed by earlier minute work prevents the later Venues Google call',async()=>{
  const f=await fixture();try{await startQuietMode(f.db,'fixture-smc',now);await endQuietMode(f.db,'fixture-smc','manual',now);f.onService(async operation=>{if(operation==='sendPeerMail')await startQuietMode(f.db,'fixture-smc',now);});await f.tick();assert(f.calls.includes('sendPeerMail'),'the later deferrable job ran after the initial quiet check');assert(!f.calls.includes('venuesSyncCheck'),'renewed quiet wins before Venues admission');}finally{await f.close();}
 });
}finally{globalThis.fetch=originalFetch;Date.now=originalNow;console.info=originalInfo;console.error=originalError;}
if(failed)process.exitCode=1;
