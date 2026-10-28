import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {createHmac,webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import bundleTools from '../scripts/bundle-worker.cjs';
globalThis.crypto??=webcrypto;
// Exercise the same self-contained entry graph as the dashboard/Pages package.
const load=entry=>import('data:text/javascript;base64,'+Buffer.from(bundleTools.bundle(entry)).toString('base64'));
const Pages=await load('roster-update/public/_worker.js'),Notifier=await load('notification-worker/dashboard-entry.js');
const contract=JSON.parse(fs.readFileSync('notification-worker/template-contracts.json')).templates.stapler_timetable;
const day='2026-10-27',scheduledTime=Date.parse('2026-10-26T20:00:00+08:00');
const base={APPS_SCRIPT_URL:'https://script.google.com/macros/s/roster-fixture/exec',CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar-fixture/exec',CALENDAR_PROXY_SECRET:'fixture-calendar-'.repeat(4),ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',BRIDGE_SECRET:'fixture-bridge-'.repeat(4),ROSTER_SERVICE_SECRET:'fixture-service-'.repeat(4),GOOGLE_CLIENT_ID:'fixture-client',ROSTER_AUTOMATION_ENABLED:'true',WHATSAPP_ENABLED:'true',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_TEMPLATE_ACCOUNT_ID:'323456789',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_ACCESS_TOKEN:'fixture-access-'.repeat(4),WHATSAPP_APP_SECRET:'fixture-app-'.repeat(4),WHATSAPP_VERIFY_TOKEN:'fixture-verify-'.repeat(4),EXTERNAL_LINK_SECRET:'fixture-link-'.repeat(4),CONTACTS_PUBLIC_URL:'https://contacts.example.test/',WHATSAPP_TEMPLATES_JSON:JSON.stringify({stapler_timetable:{...contract,enabled:true}})};
function database(){const sql=new DatabaseSync(':memory:');const db={sql,prepare(query){const statement=(args=[])=>({bind(...next){return statement(next);},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async first(){return sql.prepare(query).get(...args)||null;},async run(){const result=sql.prepare(query).run(...args);return {success:true,meta:{changes:result.changes}};}});return statement();},async batch(statements){return Promise.all(statements.map(statement=>statement.run()));}};return db;}
function oldSettings(extra={}){return {...base,GSIS_BACKEND_REQUIRED:'true',ROSTER_EDGE_AUTHORITY:'d1',DEPLOY_EDGE_AUTHORITY:'d1',GSIS_BACKGROUND_JOBS:'true',CALENDAR_BACKGROUND_SYNC:'true',GSIS_BACKEND:{fetch:async()=>assert.fail('Recovery must never call the private migration service')},GSIS_BACKGROUND_QUEUE:{send:async()=>assert.fail('Recovery must never enqueue migrated work')},...extra};}
function cookie(settings){const issued=Date.now(),payload=JSON.stringify({purpose:'gsis-session-v1',origin:settings.ROSTER_PUBLIC_ORIGIN,email:'fixture@gsps.edu.sg',subject:'fixture-subject',issued,expires:issued+3600000}),signature=createHmac('sha256',settings.BRIDGE_SECRET+'|gsis-browser-session-v1|'+settings.ROSTER_PUBLIC_ORIGIN).update(payload).digest('hex');return '__Host-gsis_session='+Buffer.from(payload).toString('base64url')+'.'+signature;}
async function operation(settings,input,path='/api/operations'){const response=await Pages.default.fetch(new Request(settings.ROSTER_PUBLIC_ORIGIN+path,{method:'POST',headers:{Origin:settings.ROSTER_PUBLIC_ORIGIN,'Content-Type':'application/json',Cookie:cookie(settings)},body:JSON.stringify(input)}),settings);return {status:response.status,body:await response.json()};}
async function cron(settings,cron='* * * * *'){const work=[];await Notifier.default.scheduled({scheduledTime,cron},settings,{waitUntil:value=>work.push(value)});await Promise.all(work);}
async function logs(work){const rows=[],oldInfo=console.info,oldError=console.error;console.info=console.error=value=>rows.push(JSON.parse(value));try{await work();return rows;}finally{console.info=oldInfo;console.error=oldError;}}
function upstream(calls,custom=()=>null){globalThis.fetch=async(url,init={})=>{
 const target=String(url);
 if(target.includes('message_templates'))return Response.json({data:[{...contract,status:'APPROVED',components:[{type:'BODY',text:contract.body}]}]});
 const raw=JSON.parse(init.body);
 if(target===base.CALENDAR_APPS_SCRIPT_URL){calls.push('calendar');const dates=raw.payload.dates||[raw.payload.date],rows=dates.map(date=>({date,schoolDay:true,parity:'odd'}));return Response.json({ok:true,result:raw.action==='rosterDates'?{dates:rows}:rows[0]});}
 assert.equal(target,base.APPS_SCRIPT_URL);const request=JSON.parse(raw.payload),secret=request.action==='rosterService'?base.ROSTER_SERVICE_SECRET:base.BRIDGE_SECRET;assert.equal(raw.signature,createHmac('sha256',secret).update(raw.payload).digest('hex'));
 calls.push(request.input.operation);const result=custom(request);if(result)return Response.json(result);
 const data={nextAbsenceIntake:{job:null},sendPeerMail:{sent:0},inboxPendingDispatch:{replies:[],alerts:[]},claimNotifications:{transportVersion:2,notifications:[]},scheduledRoster:{notificationsQueued:0}}[request.input.operation]||{saved:true};return Response.json({ok:true,data});
};}
await test('packaged Pages preserve Google reads and manual assignments despite stale migration settings',async()=>{
 const env=oldSettings(),calls=[];upstream(calls);
 let result=await operation(env,{operation:'read',view:'intakeReview',intakeRequestId:crypto.randomUUID()});assert.equal(result.status,200);assert.deepEqual(calls,['read'],'intake review does not require Calendar');
 calls.length=0;result=await operation(env,{operation:'assign',date:day,demandId:'demand',staffId:'teacher',requestId:crypto.randomUUID()});assert.equal(result.status,200);assert.deepEqual(calls,['calendar','assign']);assert.equal(env.ROSTER_EDGE_AUTHORITY,'d1','entry profile does not mutate dashboard environment');
 result=await operation(env,{operation:'activate'},'/api/edge/migration');assert.equal(result.status,404);assert.equal(result.body.code,'RECOVERY_MIGRATION_DISABLED');
 const config=await Pages.default.fetch(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/config'),env);assert.equal((await config.json()).version,JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8')).gsisComponentVersions.rosterFrontend);
});
await test('packaged venue export is explicitly suspended before any private service or D1 access',async()=>{
 const env=oldSettings({GSIS_JOBS:{prepare(){assert.fail('Suspended occupancy export must not read D1');}}});globalThis.fetch=async()=>assert.fail('Suspended occupancy export must not contact Google');
 const response=await Pages.default.fetch(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/venues-source',{method:'POST',body:JSON.stringify({payload:'signed-source-request',signature:'unchanged'})}),env);
 assert.equal(response.status,503);assert.equal((await response.json()).code,'RECOVERY_VENUES_SUSPENDED');
});
await test('packaged absence capture retains D1 receipt and cron forwards it before Google allocation',async()=>{
 const db=database(),env=oldSettings({GSIS_JOBS:db,WHATSAPP_DURABLE_INGRESS:'true'});db.sql.exec(Pages.WEBHOOK_SCHEMA_SQL);
 globalThis.fetch=async()=>assert.fail('Capture must not depend on remote services');const requestId=crypto.randomUUID();
 const captured=await operation(env,{operation:'saveAbsence',intake:true,requestId,date:day,staffId:'teacher',typeId:'mc',fullDay:true});assert.equal(captured.status,202);assert.equal(captured.body.data.absenceApplied,false);assert.equal(db.sql.prepare('SELECT state FROM gsis_absence_transport WHERE request_id=?').get(requestId).state,'queued');
 const calls=[];upstream(calls,request=>request.input.operation==='saveAbsence'?{ok:true,data:{accepted:true,intakeReceipt:true,receiptOnly:true,requestId,acceptedAt:captured.body.data.acceptedAt,intakeState:'pending',savedIds:[]}}:request.input.operation==='scheduledRoster'?{ok:true,data:{notificationsQueued:1}}:null);
 const rows=await logs(()=>cron(env));assert(calls.indexOf('saveAbsence')<calls.indexOf('nextAbsenceIntake'));assert(calls.indexOf('nextAbsenceIntake')<calls.indexOf('scheduledRoster'),JSON.stringify({calls,rows}));assert.equal(calls.filter(value=>value==='claimNotifications').length,2,'new planning notices drain in the same tick');
 for(const lane of ['received-report-drain','notification-dispatch','inbox-dispatch','webhook-drain','peer-mail-drain','scheduled-cycle'])assert(rows.some(row=>row.event==='roster-'+lane),lane+' remains active');
 for(const forbidden of ['edgeReferencesRefresh','prewarmTimetables','deployHandoffs','dailyEmploymentMailDispatch','deliveryReviewMailDispatch','allocationAuditExport'])assert(!calls.includes(forbidden));
 assert.equal(db.sql.prepare('SELECT state FROM gsis_absence_transport WHERE request_id=?').get(requestId).state,'forwarded');
 assert.equal(db.sql.prepare("SELECT name FROM sqlite_master WHERE name='gsis_edge_heads'").get(),undefined,'no migrated record authority is initialized');
});
await test('pending Google reports retain typed blocking status and safe counts without a success event',async()=>{
 const db=database(),calls=[];upstream(calls,request=>request.input.operation==='scheduledRoster'?{ok:false,status:409,code:'ABSENCE_INTAKE_PENDING',pendingCaptureCount:2,pendingPeerCount:0,error:'PRIVATE STAFF DETAILS'}:null);
 const rows=await logs(()=>cron(oldSettings({GSIS_JOBS:db}))),blocked=rows.find(row=>row.event==='roster-scheduled-cycle-blocked');assert(blocked);assert.equal(blocked.code,'ABSENCE_INTAKE_PENDING');assert.equal(blocked.httpStatus,409);assert.equal(blocked.pendingCaptureCount,2);assert(!rows.some(row=>row.event==='roster-scheduled-cycle'));assert(!JSON.stringify(rows).includes('PRIVATE STAFF'));
 const health=db.sql.prepare("SELECT status,code,http_status,counts_json FROM gsis_job_health WHERE job='allocation'").get();assert.equal(health.status,'failure');assert.equal(health.code,'ABSENCE_INTAKE_PENDING');assert.equal(health.http_status,409);assert.equal(JSON.parse(health.counts_json).pendingCaptureCount,2);
});
await test('unforwarded transport receipts block allocation before Calendar or Google scheduling',async()=>{
 const db=database(),env=oldSettings({GSIS_JOBS:db});globalThis.fetch=async()=>assert.fail('Capture is local');
 await operation(env,{operation:'saveAbsence',intake:true,requestId:crypto.randomUUID(),date:day,staffId:'teacher',typeId:'mc',fullDay:true});
 const calls=[];upstream(calls,request=>request.input.operation==='saveAbsence'?{ok:false,status:409,error:'Existing saved entry overlaps this report.'}:null);
 const rows=await logs(()=>cron(env)),blocked=rows.find(row=>row.event==='roster-scheduled-cycle-blocked');assert.equal(blocked.code,'ABSENCE_TRANSPORT_PENDING');assert.equal(blocked.pendingCaptureCount,1);assert(!calls.includes('scheduledRoster'));assert(!calls.includes('calendar'));assert.equal(db.sql.prepare('SELECT state FROM gsis_absence_transport').get().state,'needsReview');
});
await test('Google migration fence is respected; recovery never writes or clears a fence',async()=>{
 const calls=[];upstream(calls,()=>({ok:false,status:409,error:'Roster writes have moved to the D1 authority.'}));const result=await operation(oldSettings(),{operation:'read',view:'intakeReview',intakeRequestId:crypto.randomUUID()});assert.equal(result.status,409);assert.deepEqual(calls,['read']);
});
await test('explicit pause and automation controls remain effective, and daily cleanup never enters minute work',async()=>{
 globalThis.fetch=async()=>assert.fail('Paused or daily cleanup invocation must not contact services');const paused=oldSettings({GSIS_RECOVERY_MODE:'true'});assert.equal((await operation(paused,{operation:'assign',date:day})).status,503);const pauseLogs=await logs(()=>cron(paused));assert.equal(pauseLogs[0].event,'roster-scheduled-paused');
 const cleanupLogs=await logs(()=>cron(oldSettings(),'15 18 * * *'));assert.equal(cleanupLogs.length,1);assert.equal(cleanupLogs[0].event,'roster-r2-cleanup');assert.equal(cleanupLogs[0].deleted,0);
 const calls=[];upstream(calls);await logs(()=>cron(oldSettings({ROSTER_AUTOMATION_ENABLED:'false'})));assert(!calls.includes('scheduledRoster'));assert(calls.includes('nextAbsenceIntake'));assert(calls.includes('claimNotifications'));
});
await test('signed immediate wake uses original Queue and unsupported paid work is retained',async()=>{
 const sent=[],env=oldSettings({NOTIFICATION_QUEUE:{send:async body=>sent.push(body)}}),envelope=await Pages.sign({purpose:'gsis-notification-wake-v1',timestamp:Date.now(),nonce:crypto.randomUUID()},env.ROSTER_SERVICE_SECRET);
 const response=await Notifier.default.fetch(new Request('https://notifier.test/dispatch',{method:'POST',body:JSON.stringify(envelope)}),env);assert.equal(response.status,202);assert.equal(sent.length,1);
 const actions=[],batch={messages:[{body:{purpose:'gsis-background-work-v1',kind:'timetables'},ack:()=>actions.push('bad-ack'),retry:options=>actions.push(['retained',options.delaySeconds])},{body:sent[0],ack:()=>actions.push('notification-ack'),retry:()=>actions.push('notification-retry')}]};const calls=[];upstream(calls);
 const rows=await logs(()=>Notifier.default.queue(batch,env));assert.deepEqual(actions,[['retained',300],'notification-ack']);assert(rows.some(row=>row.code==='RECOVERY_UNSUPPORTED_WAKE'));assert.deepEqual(calls,['nextAbsenceIntake','claimNotifications','sendPeerMail']);
});
