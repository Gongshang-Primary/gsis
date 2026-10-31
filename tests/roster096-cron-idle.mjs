import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Exercise the real recovery entry with legacy dashboard flags. Critical Google
// lanes remain active while retained migration data is never hydrated or changed.
const root=path.resolve(process.env.GSIS_TEST_ROOT||fileURLToPath(new URL('..',import.meta.url)));
const moduleAt=name=>import(pathToFileURL(path.join(root,name)).href);
const [{default:worker},{GSiSEdgeStore},{GSISRosterOperations:O},gateway,{resolveRosterAuthorityEnvironment}]=await Promise.all([
 moduleAt('notification-worker/index.js'),moduleAt('roster-update/public/edge-store.js'),
 moduleAt('roster-update/public/edge-roster-domain.js'),moduleAt('roster-update/public/_worker.js'),moduleAt('shared/roster-recovery-profile.js')
]);

function database(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 let measuring=false,stats;
 const reset=()=>{stats={queries:0,rows:0,bytes:0,maxRows:0,broadRosterLoads:0,sessions:[],statements:[]};};reset();
 const record=(text,args,rows)=>{
  if(!measuring)return;
  stats.queries++;stats.rows+=rows.length;stats.bytes+=Buffer.byteLength(JSON.stringify(rows));stats.maxRows=Math.max(stats.maxRows,rows.length);stats.statements.push(text);
  if(/SELECT (?:r\.)?collection,(?:r\.)?record_id,(?:r\.)?position,(?:r\.)?record_date,(?:r\.)?value_json FROM gsis_edge_records/.test(text)&&args.includes('roster'))stats.broadRosterLoads++;
 };
 const prepare=text=>({text,args:[],bind(...args){return {...this,args};},async first(){const value=sql.prepare(this.text).get(...this.args)||null;record(this.text,this.args,value?[value]:[]);return value;},async all(){const rows=sql.prepare(this.text).all(...this.args);record(this.text,this.args,rows);return {success:true,results:rows,meta:{changes:0}};},async run(){const result=sql.prepare(this.text).run(...this.args);record(this.text,this.args,[]);return {success:true,results:[],meta:{changes:Number(result.changes)}};}});
 return {sql,prepare,withSession(mode){if(measuring)stats.sessions.push(mode);return this;},async batch(statements){
  sql.exec('BEGIN');try{const results=statements.map(statement=>{const q=sql.prepare(statement.text);if(/^\s*(SELECT|WITH|PRAGMA)\b/i.test(statement.text)||/\bRETURNING\b/i.test(statement.text)){const rows=q.all(...statement.args);record(statement.text,statement.args,rows);return {success:true,results:rows,meta:{changes:0}};}const result=q.run(...statement.args);record(statement.text,statement.args,[]);return {success:true,results:[],meta:{changes:Number(result.changes)}};});sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}
 },start(){reset();measuring=true;},stop(){measuring=false;return structuredClone(stats);}};
}
async function activate(db,scope,state){
 const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'fixture',requestId:crypto.randomUUID()});
 await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});
}

const today='2026-10-26',realNow=Date.now,realFetch=globalThis.fetch,realInfo=console.info,realWarn=console.warn,realError=console.error;
let now=Date.parse(today+'T07:01:00+08:00');Date.now=()=>now;
const db=database(),objectCalls={gets:0,puts:0},networkCalls=[],serviceCalls=[];
try{
 const state=O.initial();state.systemConfig.scheduledAllocationEnabled=true;
 // Handled delivery failures remain in the private history after their alerts
 // are archived. They must not turn every idle tick into an empty claim/write.
 state.outbox=[
  {id:'handled-failed',status:'failed',retryable:false,attempts:3,mobile:'6590000001',date:'2026-10-25',expiresAt:now-86400000,error:'META_132000',data:{}},
  {id:'handled-uncertain',status:'uncertain',attempts:1,mobile:'6590000001',date:'2026-10-25',expiresAt:now-86400000,preparedAt:now-2*86400000,data:{}}
 ];
 state.smcAlerts=state.outbox.map(row=>({id:'alert-'+row.id,key:'delivery:'+row.id,notificationId:row.id,status:'open',date:row.date,closedAt:'2026-10-25T00:00:00Z',reviewedAt:'2026-10-25T00:00:00Z',reviewReason:'Archived in the private daily report'}));
 state.peerMail=[{id:'handled-peer',requestId:'historical-request',recipientName:'Synthetic Staff',date:'2026-10-25',status:'uncertain',preparedAt:now-2*86400000,claimExpiresAt:now-86400000}];
 state.smcAlerts.push({id:'handled-peer-alert',key:'delivery:peer-mail:handled-peer',date:'2026-10-25',status:'open',summary:'Email delivery for the peer arrangement proposed to Synthetic Staff is unconfirmed. Check with the colleague before sending again. The absence remains recorded.'});
 // Large retained history makes a hidden full-document read observable even
 // when the cron catches the resulting downstream error and resolves normally.
 state.audit=Array.from({length:1600},(_,i)=>({id:'history-'+i,date:i%2?'2025-10-24':'2025-10-25',at:'2025-10-25T00:00:00.000Z',operation:'retained-audit',detail:'Historical evidence. '.repeat(70)}));
 state.staplerPlans=Array.from({length:20},(_,i)=>({date:'2025-09-'+String(i+1).padStart(2,'0'),revision:1,draft:{edgeObject:true,key:'unread-history-'+i,digest:'a'.repeat(64),encoding:'gzip-json-v1'}}));
 const calendarByDate={};for(let i=0;i<730;i++){const date=new Date(Date.parse('2026-01-01')+i*86400000).toISOString().slice(0,10);calendarByDate[date]={date,schoolDay:![0,6].includes(new Date(date).getUTCDay()),parity:'odd',available:true};}
 const person={id:'synthetic-staff',name:'Synthetic Staff',active:true,email:'fixture@gsps.edu.sg',emails:['fixture@gsps.edu.sg'],groups:['Teaching'],role:'Teacher',mobile:'6590000001',employment:'Permanent',mk:'',appointmentLevel:'',adhocEligible:true};
 const references={schema:1,contacts:{rosterPeople:[person],rosterSMCIds:[person.id],rosterAdminIds:[person.id],rosterUrgentSMCIds:[person.id]},contactsCheckedAt:now,calendarCheckedAt:now,calendarByDate};
 await activate(db,'roster',state);await activate(db,'roster-register',{revision:0,entries:[],receipts:[]});await activate(db,'roster-references',references);
 await activate(db,'deploy',{index:{versions:[],active:null,published:null,publicationSchema:1,revision:0,requests:[]},drafts:{},publications:{},receipts:{},deltas:{},leases:{},properties:{},jobs:{}});
 // Existing capture tables and completed audit checkpoints represent an
 // installed, idle service. These fixture writes never enter the measurements.
 db.sql.exec(gateway.WEBHOOK_SCHEMA_SQL);db.sql.exec(gateway.ABSENCE_TRANSPORT_SCHEMA_SQL);
 db.sql.exec('CREATE INDEX IF NOT EXISTS gsis_absence_transport_due ON gsis_absence_transport(namespace,state,available_at,accepted_at)');
 db.sql.exec('CREATE TABLE IF NOT EXISTS gsis_roster_audit_exports(date TEXT PRIMARY KEY,source_count INTEGER NOT NULL,source_revision INTEGER NOT NULL,reference_json TEXT NOT NULL,exported_at INTEGER NOT NULL)');
 db.sql.prepare("INSERT INTO gsis_roster_audit_exports(date,source_count,source_revision,reference_json,exported_at) SELECT record_date,COUNT(*),MAX(revision),'{}',? FROM gsis_edge_records WHERE scope='roster' AND collection='audit' AND record_id<>'$' GROUP BY record_date").run(now);
 db.sql.exec('CREATE TABLE IF NOT EXISTS gsis_roster_audit_scan(scope TEXT PRIMARY KEY,scanned_revision INTEGER NOT NULL)');
 db.sql.exec("INSERT INTO gsis_roster_audit_scan(scope,scanned_revision) SELECT scope,revision FROM gsis_edge_heads WHERE scope='roster'");
 const originalHeads=db.sql.prepare('SELECT scope,mode,revision FROM gsis_edge_heads ORDER BY scope').all();
 const historyBytes=db.sql.prepare("SELECT SUM(length(value_json)) n FROM gsis_edge_records WHERE scope='roster' AND collection='audit'").get().n;
 assert(historyBytes>2_000_000,'fixture must contain enough irrelevant retained history to detect hydration');
 const bucket={async get(){objectCalls.gets++;return null;},async put(){objectCalls.puts++;}};
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',DEPLOY_EDGE_AUTHORITY:'d1',ROSTER_AUTOMATION_ENABLED:'true',ROSTER_TIMETABLE_SNAPSHOTS:bucket,
  ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec',DEPLOY_APPS_SCRIPT_URL:'https://script.google.com/macros/s/deploy-fixture/exec',DEPLOY_BRIDGE_SECRET:'d'.repeat(40),
  ROSTER_SERVICE_SECRET:'s'.repeat(40),CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar-fixture/exec',CALENDAR_PROXY_SECRET:'c'.repeat(40),CALENDAR_BACKGROUND_SYNC:'false',
  WHATSAPP_ENABLED:'true',WHATSAPP_DURABLE_INGRESS:'true',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'123456789',WHATSAPP_TEMPLATE_ACCOUNT_ID:'123456789',WHATSAPP_API_VERSION:'v22.0',
  WHATSAPP_ACCESS_TOKEN:'a'.repeat(40),WHATSAPP_APP_SECRET:'b'.repeat(40),EXTERNAL_LINK_SECRET:'e'.repeat(40),WHATSAPP_VERIFY_TOKEN:'v'.repeat(40),CONTACTS_PUBLIC_URL:'https://contacts.gsps.edu.sg/',WHATSAPP_TEMPLATES_JSON:'{}'};
 // Generic historical Store fixtures do not prove a coordinated Roster cutover.
 // Reject that incomplete D1 selection, then measure explicitly selected Google recovery.
 await assert.rejects(resolveRosterAuthorityEnvironment(env),error=>error.code==='ROSTER_AUTHORITY_UNVERIFIED');
 const recoveryEnv={...env,ROSTER_EDGE_AUTHORITY:'legacy'};
 globalThis.fetch=async(input,init)=>{
  const url=String(input),request=JSON.parse(init.body);networkCalls.push(url);
  if(url===env.CALENDAR_APPS_SCRIPT_URL){const dates=request.payload.dates||[request.payload.date],values=dates.map(date=>({date,schoolDay:true,parity:'odd'}));return Response.json({ok:true,result:request.action==='rosterDates'?{dates:values}:values[0]});}
  assert.equal(url,env.APPS_SCRIPT_URL,'recovery calls only existing Google adapters');const command=JSON.parse(request.payload);assert.equal(command.action,'rosterService');serviceCalls.push(command.input.operation);
  const responses={nextAbsenceIntake:{job:null},claimNotifications:{transportVersion:2,notifications:[]},sendPeerMail:{sent:0},inboxPendingDispatch:{replies:[],alerts:[]},scheduledRoster:{idle:true,notificationsQueued:0}};
  assert(Object.hasOwn(responses,command.input.operation),'only critical jobs run');return Response.json({ok:true,data:responses[command.input.operation]});
 };
 const measurements=[];
 for(let pass=0;pass<2;pass++){
  now=Date.parse(today+'T07:01:00+08:00')+pass*60000;
  objectCalls.gets=0;objectCalls.puts=0;networkCalls.length=0;serviceCalls.length=0;
  const logs={info:[],warn:[],error:[]},pending=[];
  console.info=(...args)=>logs.info.push(args.join(' '));console.warn=(...args)=>logs.warn.push(args.join(' '));console.error=(...args)=>logs.error.push(args.join(' '));
  db.start();
  await worker.scheduled({cron:'* * * * *',scheduledTime:now},recoveryEnv,{waitUntil(promise){pending.push(promise);}});
  await Promise.all(pending);
  const measured=db.stop();console.info=realInfo;console.warn=realWarn;console.error=realError;
  const summary={pass:pass+1,historyBytes,queries:measured.queries,rows:measured.rows,bytes:measured.bytes,maxRows:measured.maxRows,broadRosterLoads:measured.broadRosterLoads,r2Gets:objectCalls.gets,r2Puts:objectCalls.puts,externalCalls:networkCalls.length,errors:logs.error,warnings:logs.warn};
  measurements.push(summary);console.log('Idle cron measurement '+JSON.stringify(summary));
  assert.equal(pending.length,1,'real scheduled handler must register its complete invocation');
  assert.deepEqual(logs.error,[],'caught failures must not masquerade as successful idle skips');
  assert.deepEqual(logs.warn,[],'idle gates must not hide refresh or cache failures');
  assert.deepEqual([...serviceCalls].sort(),['nextAbsenceIntake','claimNotifications','sendPeerMail','inboxPendingDispatch','scheduledRoster'].sort(),'recovery runs each critical Google lane once');assert.equal(networkCalls.length,serviceCalls.length+1,'Calendar is read once for allocation');
  assert.equal(objectCalls.gets,0,'idle scheduler must not fetch archived timetable objects');
  assert.equal(objectCalls.puts,0,'unchanged audit and timetable data must not be uploaded');
  assert.deepEqual(db.sql.prepare('SELECT scope,mode,revision FROM gsis_edge_heads ORDER BY scope').all(),originalHeads,'idle work must preserve business authority and revisions');
  assert.equal(measured.broadRosterLoads,0,'idle cron must not load the complete Roster collections');
  assert(measured.rows<200,'idle D1 probes must return a bounded set of metadata rows');
  assert(measured.bytes<65536,'idle D1 responses must stay below 64 KiB despite retained history');
  assert(measured.sessions.length>0&&measured.sessions.every(value=>value==='first-primary'),'idle decisions must use primary D1 reads');
  const events=logs.info.flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
  const dispatch=events.find(row=>row.event==='roster-notification-dispatch');
  assert(dispatch&&dispatch.enabled===true,'notification path must be enabled, not bypassed through missing configuration');
  assert.equal(dispatch.claimed,0);assert.equal(dispatch.prepareFailures,0);assert.equal(dispatch.resultFailures,0);assert.equal(dispatch.backendCalls,1);
  assert(events.some(row=>row.event==='roster-received-report-drain'&&row.hasMore===false),'received-report stage must finish cleanly');
  assert(events.some(row=>row.event==='roster-peer-mail-drain'&&row.sent===0),'peer-mail stage must finish cleanly');
 }
 assert.equal(measurements.length,2);
 console.log('PASS actual recovery cron: enabled Google services and clean repeated idle results, retained migration history untouched, no broad hydration or R2 work.');
}finally{
 Date.now=realNow;globalThis.fetch=realFetch;console.info=realInfo;console.warn=realWarn;console.error=realError;db.sql.close();
}
