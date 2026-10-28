import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {createHmac,webcrypto} from 'node:crypto';
import roster from '../roster-update/public/_worker.js';
import {recordJobHealth,readSystemHealth,safeHealthError} from '../shared/edge-health.js';
globalThis.crypto??=webcrypto;
const origin='https://roster.gsps.edu.sg',now=Date.now(),diagnosticId=crypto.randomUUID();
const env={BRIDGE_SECRET:'fixture-secret-'.repeat(4),GOOGLE_CLIENT_ID:'fixture',APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec',GSIS_BACKEND:{fetch(){assert.fail('Recovery cannot use private backend');}},ROSTER_EDGE_AUTHORITY:'d1'};
const payload=JSON.stringify({purpose:'gsis-session-v1',origin,email:'manager@gsps.edu.sg',subject:'fixture',issued:now,expires:now+3600000}),cookie='__Host-gsis_session='+Buffer.from(payload).toString('base64url')+'.'+createHmac('sha256',env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin).update(payload).digest('hex');
function database(){const sql=new DatabaseSync(':memory:'),queries=[];return {sql,queries,prepare(query){const statement=(args=[])=>({bind(...next){return statement(next);},async all(){queries.push(query);return {success:true,results:sql.prepare(query).all(...args)};},async first(){queries.push(query);return sql.prepare(query).get(...args)||null;},async run(){queries.push(query);return {success:true,meta:{changes:sql.prepare(query).run(...args).changes}};}});return statement();},async batch(statements){return Promise.all(statements.map(statement=>statement.run()));}};}
const post=(body={operation:'read'},headers={})=>new Request(origin+'/api/system-health',{method:'POST',headers:{Origin:origin,Cookie:cookie,...headers},body:JSON.stringify(body)});
let passed=0,failed=0;async function test(name,fn){try{await fn();passed++;console.log('PASS',name);}catch(error){failed++;console.error('FAIL',name,error.stack);}}
const originalFetch=globalThis.fetch;let user={smc:true,admin:false},calls=[],reply;
globalThis.fetch=async(url,init)=>{assert.equal(String(url),env.APPS_SCRIPT_URL);const request=JSON.parse(JSON.parse(init.body).payload);calls.push(request);assert.equal(request.action,'rosterOperations');assert.deepEqual(request.input,request.input.scope==='mine'?{operation:'read',view:'intake',scope:'mine'}:{operation:'read',view:'intake'});return Response.json((typeof reply==='function'?reply(request):reply)||{ok:true,data:{user,pendingCaptureCount:3,peerReviewCount:2,entries:[{staffName:'PRIVATE_STAFF',command:{notes:'PRIVATE_REPORT'}}]}});};
await test('recovery health is current Google-authorized, compact and SELECT-only',async()=>{
 const db=database();await recordJobHealth({GSIS_JOBS:db},{job:'allocation',status:'success',now,finishedAt:now,counts:{processed:2}});db.queries.length=0;calls=[];
 const response=await roster.fetch(post({operation:'read',identity:{admin:true},scope:'school'}),{...env,GSIS_JOBS:db});assert.equal(response.status,200);const body=await response.json();assert.equal(body.data.readOnly,true);assert.equal(body.data.profile,'google-recovery');assert.equal(body.data.jobs[0].lastSuccessAt,now);assert.equal(body.data.jobs[0].counts.processed,2);assert.equal(body.data.reports.href,'/');assert.equal(body.data.reports.available,true);assert.equal(body.data.reports.pendingCaptureCount,3);assert.equal(body.data.reports.peerReviewCount,2);assert.equal(body.data.reports.transportAvailable,false);assert.equal(calls.length,2);assert.equal(calls[0].identity.email,'manager@gsps.edu.sg');assert(!JSON.stringify(body).includes('PRIVATE'));assert(db.queries.every(query=>/^SELECT /i.test(query)));assert(!db.queries.some(query=>/gsis_edge_records|gsis_roster_r2_cleanup/.test(query)),'stale D1 authority is not recovery status');
 user={smc:false,admin:false};db.queries.length=0;const denied=await roster.fetch(post(),{...env,GSIS_JOBS:db});assert.equal(denied.status,403);assert.equal(calls.length,3,'authority is checked again on refresh');assert.equal(db.queries.length,0);user={smc:false,admin:true};assert.equal((await roster.fetch(post(),env)).status,200);user={smc:true,admin:false};
});
await test('health denies unauthenticated, foreign-origin, mutations and unavailable authority without metadata reads',async()=>{
 const db={prepare(){assert.fail('No storage read without fresh authority');}};
 for(const [request,status] of [[post({}, {Cookie:''}),401],[post({}, {Origin:'https://evil.test'}),403],[post({operation:'retryBackgroundJob'}),400],[post({operation:'recordRecoveryCheckpoint'}),400]])assert.equal((await roster.fetch(request,{...env,GSIS_JOBS:db})).status,status);
 reply={ok:false,status:503,error:'PRIVATE_AUTH_FAILURE',diagnosticId,backendVersion:'0.9.8',failureStage:'contacts-fetch'};const response=await roster.fetch(post(),{...env,GSIS_JOBS:db});assert.equal(response.status,503);assert(!JSON.stringify(await response.json()).includes('PRIVATE'));reply=undefined;
});
await test('role revocation during the school-wide read clears the entire earlier health snapshot',async()=>{
 for(const status of [401,403]){
  reply=request=>request.input.scope==='mine'?{ok:true,data:{user:{smc:true,admin:false}}}:{ok:false,status,error:'PRIVATE_REVOKED'};
  const response=await roster.fetch(post(),env),body=await response.json();assert.equal(response.status,403);assert.equal(body.data,undefined);assert(!JSON.stringify(body).includes('PRIVATE'));
 }
 reply=request=>({ok:true,data:{user:{smc:request.input.scope==='mine',admin:false},pendingCaptureCount:9,peerReviewCount:8}});
 const response=await roster.fetch(post(),env);assert.equal(response.status,403);assert.equal((await response.json()).data,undefined);reply=undefined;
});
await test('absent health schema is unknown, not healthy or an empty authoritative backlog',async()=>{
 const db=database(),response=await roster.fetch(post(),{...env,GSIS_JOBS:db}),data=(await response.json()).data;assert.equal(response.status,200);assert.equal(data.storage.available,true);assert.equal(data.storage.healthAvailable,false);assert.deepEqual(data.jobs,[]);assert.equal(data.backlog.available,false);assert(db.queries.every(query=>/^SELECT /i.test(query)));
});
await test('Google recovery health includes audit pending, completion and retained failures',async()=>{
 const db=database();await recordJobHealth({GSIS_JOBS:db},{job:'audit-export',status:'success',now:now-100,finishedAt:now-100,counts:{exported:1,pending:3}});await recordJobHealth({GSIS_JOBS:db},{job:'audit-export',status:'failure',code:'AUDIT_EXPORT_PENDING',operation:'allocationAuditExport',now,finishedAt:now,counts:{exported:0,pending:3,failed:1}});const response=await roster.fetch(post(),{...env,GSIS_JOBS:db}),data=(await response.json()).data;assert.equal(response.status,200);const row=data.jobs.find(row=>row.job==='audit-export');assert.equal(row.counts.pending,3);assert.equal(row.lastSuccessAt,now-100);assert.equal(row.code,'AUDIT_EXPORT_PENDING');assert.equal(data.recentFailures[0].job,'audit-export');assert.equal(data.recentFailures[0].operation,'allocationAuditExport');
});
await test('safe diagnostic projection preserves bounded backend reference and known stages only',()=>{
 const diagnostic={code:'ABSENCE_INTAKE_PENDING',status:409,diagnosticId,backendVersion:'0.9.8',failureStage:'contacts-fetch'};assert.deepEqual(safeHealthError({...diagnostic,message:'PRIVATE',staff:'PRIVATE'}),{code:diagnostic.code,httpStatus:409,diagnosticId,backendVersion:'0.9.8',failureStage:'contacts-fetch'});
 assert.deepEqual(safeHealthError({code:'PRIVATE',diagnosticId:'private@gsps.edu.sg',backendVersion:'private',failureStage:'private',error:'PRIVATE'}),{code:'UNKNOWN_ERROR'});
});
await test('scheduled failure and stage logs retain backend diagnostics without raw error text',async()=>{
 const source=readFileSync('roster-update/public/_worker.js','utf8'),start=source.indexOf('function rosterScheduledFailure('),end=source.indexOf('\nexport async function scheduledRoster',start),scope=vm.createContext({safeHealthError});vm.runInContext(source.slice(start,end),scope);
 const error=scope.rosterScheduledFailure({status:503,code:'ABSENCE_PREPARATION_RETRY',diagnosticId,backendVersion:'0.9.8',failureStage:'operations-read',error:'PRIVATE_REPORT'});assert.equal(error.diagnosticId,diagnosticId);assert.equal(error.backendVersion,'0.9.8');assert.equal(error.failureStage,'operations-read');assert.equal(error.code,'ABSENCE_PREPARATION_RETRY');
 const rows=[],records=[],stageScope=vm.createContext({crypto,Date,safeHealthError,assertRecoveryWritable(){},recordJobHealth:async(_,row)=>records.push(row),console:{info:value=>rows.push(JSON.parse(value)),error:value=>rows.push(JSON.parse(value))}});
 const worker=readFileSync('notification-worker/index.js','utf8');vm.runInContext(worker.slice(worker.indexOf('function writable'),worker.indexOf('function settleMessages')),stageScope);await stageScope.stage({GSIS_JOBS:{prepare(){}}},'allocation','roster-scheduled-cycle',async()=>{throw error;});assert.equal(rows[0].diagnosticId,diagnosticId);assert.equal(rows[0].failureStage,'operations-read');assert.equal(rows[0].backendVersion,'0.9.8');assert.equal(rows[0].code,'ABSENCE_PREPARATION_RETRY');assert.match(rows[0].traceId,/^[a-f0-9-]{36}$/);assert(!JSON.stringify(rows).includes('PRIVATE'));
 await stageScope.stage({GSIS_JOBS:{prepare(){}}},'allocation','roster-scheduled-cycle',async()=>({ok:false,status:503,code:'ABSENCE_PREPARATION_RETRY',diagnosticId,backendVersion:'0.9.8',failureStage:'operations-read',error:'PRIVATE_REPORT'}));assert.equal(rows[1].diagnosticId,diagnosticId);
 await stageScope.stage({GSIS_JOBS:{prepare(){}}},'notifications',null,async()=>({sent:0,pending:0}));assert.equal(records.at(-1).status,'idle');
 await stageScope.stage({GSIS_JOBS:{prepare(){}}},'notifications',null,async()=>({enabled:true,claimed:0,sent:0,failed:0,uncertain:0,cancelled:0,prepareFailures:0,resultFailures:0,batches:0,backendCalls:1}));assert.equal(records.at(-1).status,'idle','A successful empty claim is not successful notification processing');
 for(const [job,result,status,count] of [['inbox',{replies:1,alerts:0,unconfirmed:0},'success','replies'],['webhook',{claimed:1,completed:0,retrying:1},'failure','retrying'],['peer-mail',{configured:false},'skipped',null],['received-reports',{intake:{claimed:1,applied:0,deferred:1}},'failure','deferred']]){await stageScope.stage({GSIS_JOBS:{prepare(){}}},job,null,async()=>result);assert.equal(records.at(-1).status,status,job);if(count)assert.equal(records.at(-1).counts[count],1);}
 await stageScope.stage({GSIS_JOBS:{prepare(){}}},'allocation',null,async()=>({idle:true,notificationsQueued:0}));assert.equal(records.at(-1).status,'idle');assert.equal(records.at(-1).counts.notificationsQueued,0);
 await stageScope.stage({GSIS_JOBS:{prepare(){}}},'received-reports',null,async()=>({transport:{claimed:0,forwarded:0,pending:0},intake:{claimed:0,applied:0,deferred:0}}));assert.equal(records.at(-1).status,'idle');
 await stageScope.stage({GSIS_JOBS:{prepare(){}}},'received-reports',null,async()=>({transport:{claimed:1,forwarded:0,pending:0,needsReview:1},intake:{claimed:0,applied:0,deferred:0}}));assert.equal(records.at(-1).status,'failure');assert.equal(records.at(-1).counts.needsReview,1);
});
globalThis.fetch=originalFetch;console.log(`${passed}/${passed+failed} recovery health checks passed`);if(failed)process.exitCode=1;
