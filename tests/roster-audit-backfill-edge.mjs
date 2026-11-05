import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const scenario=process.argv[2]||'base';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {createHmac} from 'node:crypto';
import {ensureDailyOutputs} from '../roster-update/public/edge-roster-daily-outputs.js';
import {dailyOutputsEdgeRoster,mutateEdgeRoster,loadEdgeRoster} from '../roster-update/public/edge-roster.js';
import {rosterAllocationAuditAccepted_,rosterAllocationAuditCapture_} from '../roster-update/public/edge-roster-output-renderers.js';
import {createDeployDomain} from '../roster-update/public/edge-deploy-domain.js';
import {sha256Bytes,sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),Store=require('../shared/edge-store.js'),database=require('./helpers/chunked-import-db.cjs'),fixture=require('./roster701-fixture.cjs'),drive=require('./helpers/roster-daily-drive.cjs'),legacyText=require('./helpers/roster-pre82-audit.cjs');
const actualNow=Date.now,actualFetch=globalThis.fetch,f=fixture(),date=f.date;let now=Date.parse(date+'T06:00:00+08:00');Date.now=()=>now;
const db=database(),google=drive(now),objects=new Map(),calls=[],bucket={async put(k,v){objects.set(k,new Uint8Array(v));},async get(k){const v=objects.get(k);return v?{body:new Blob([v]).stream(),text:async()=>new TextDecoder().decode(v),arrayBuffer:async()=>v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength)}:null;}};
async function activate(scope,state){const store=Store.open(db,scope),head=await store.importState({state,actor:'test',requestId:crypto.randomUUID(),source:{sourceDigest:'a'.repeat(64),manifestDigest:'b'.repeat(64)}});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'test',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});await db.prepare("UPDATE gsis_edge_heads SET metadata_json=json_set(metadata_json,'$.importSession',?) WHERE scope=?").bind('c'.repeat(64),scope).run();return store;}
try{
 f.ctx.now=now;f.ctx.iso=new Date(now).toISOString();f.ctx.minute=360;f.state.accountingYears['2026']={verified:true};f.state.systemConfig.driveBackup={enabled:false,homeBaseFolderId:'home'};f.state.systemConfig.driveDaily={enabled:true,folderId:'daily',auditFolderId:'audit'};f.state.freshStart={effectiveDate:'2026-10-12'};if(scenario==='suppressed')f.state.systemConfig.verboseLogging=false;
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date,typeId:'mc',periods:[2,3]});const before=structuredClone(f.state);f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date});rosterAllocationAuditAccepted_(f.state,before,f.ctx,{requestId:'initial-allocation'});f.state.absences[0].typeLabel='SECRET MEDICAL TYPE';f.state.absences[0].reason='SECRET DIAGNOSIS';f.state.privateLinks=[{token:'NEVER_EXPORT'}];
 const auditEvent=d=>({id:'audit-'+d,date:d,at:f.ctx.iso,operation:'assign',actorName:'Fixture SMC',auditExportCaptured:true,decisionChanges:[{lesson:{period:2,className:'4A',subject:'EL'},after:{staffId:'bob',name:'Bob',ownership:'smc'}}]});
 f.state.audit.push(...['2026-10-11','2026-10-13','2026-10-16'].map(auditEvent));
 const store=await activate('roster',f.state),model={layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:f.people.map((p,i)=>({name:p.name,cells:Array.from({length:85},(_,n)=>i===0&&[36,37].includes(n)?['EL','4A','C1-01','']:['','','',''])}))},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[]},json=JSON.stringify(model),key='daily-baseline';objects.set(key,new Uint8Array(gzipSync(json)));
 await activate('roster-register',{revision:1,entries:[{id:'baseline',name:'October baseline',from:scenario==='missing-timetable'?'2026-10-14':'2026-01-01',to:'2026-12-31',priority:1,modelObject:{key,digest:sha256Hex(json),encoding:'gzip-json-v1'}}],receipts:[]});
 const people=f.people.map(p=>({...p,email:p.id+'@gsps.edu.sg',emails:[p.id+'@gsps.edu.sg'],employment:'Permanent',groups:['Teaching'],role:'Teacher'})),refs=await activate('roster-references',{schema:1,contacts:{rosterPeople:people,rosterSMCIds:['alice'],rosterAdminIds:['alice']},contactsCheckedAt:now,calendarByDate:Object.fromEntries(['2026-10-12','2026-10-13',date,'2026-10-15','2026-10-16'].map(d=>[d,{date:d,available:true,schoolDay:scenario!=='non-school'||d!=='2026-10-13',parity:'single'}]))});
 const Fields=vm.runInNewContext(fs.readFileSync('shared/fields.js','utf8')+';GSISFields;'),deploy={index:{versions:[],active:null,published:null,publicationSchema:1,revision:0,requests:[]},drafts:{},publications:{},receipts:{},deltas:{},leases:{},properties:{},jobs:{}},identity={email:'alice@gsps.edu.sg'},domain=createDeployDomain({state:deploy,identity,sha256:sha256Bytes,calculations:new Map(),integration(){assert.fail('no live service');}});
 domain.dispatch({action:'change',input:{operation:'create',name:'Fixture quota',requestId:crypto.randomUUID()},identity},{user:{email:identity.email,roles:['Admin','KP']},people:[],sysFields:{},roleCatalogue:[],authoritative:true});const document=domain.readDocument(deploy.index.versions[0]);document.from='2026-01-01';document.to='2026-12-31';document.teachers=people.map(p=>({id:p.id,name:p.name,active:true,role:'Teacher',groups:[],profile:{'Basic Name':p.name,Role:'Teacher',Active:'Y','EO Appt Level':'GEO3'}}));const publication={...deploy.index.versions[0],from:document.from,to:document.to,edgePublished:true,commit:crypto.randomUUID()};deploy.index.published=publication;deploy.index.venuePublications=[publication];deploy.publications=Object.fromEntries(Object.entries(Fields.flat(document)).map(([k,v])=>[publication.commit+'|'+k,v]));await activate('deploy',deploy);
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_TIMETABLE_SNAPSHOTS:bucket,APPS_SCRIPT_URL:'https://script.google.com/macros/s/daily-fixture/exec',ROSTER_SERVICE_SECRET:'s'.repeat(40),ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',WHATSAPP_ENABLED:'false'};
 let release=null,entered=null;globalThis.fetch=async(url,options)=>{assert.equal(String(url),env.APPS_SCRIPT_URL);const body=JSON.parse(options.body);assert.equal(body.signature,createHmac('sha256',env.ROSTER_SERVICE_SECRET).update(body.payload).digest('hex'));const p=JSON.parse(body.payload).input;assert.equal(p.operation,'edgeDriveOutput','fresh-start never invokes a legacy mirror or writer');assert.equal(p.step,'daily');calls.push(p);if(entered){entered();entered=null;await new Promise(r=>release=r);}try{return Response.json({ok:true,data:google.call(p)});}catch(error){return Response.json({ok:false,error:error.message,code:error.code});}};
 // Before deployment, m archived one date to R2 only; another date has only audit rows.
 await ensureDailyOutputs(db,{now});
 const archivedDate='2026-10-15',archivedEvent=auditEvent(archivedDate),archive=JSON.stringify({schema:1,date:archivedDate,revision:1,audit:[archivedEvent]});
 const archiveKey='gsis/roster/audit/'+archivedDate+'/fixture.json.gz';objects.set(archiveKey,new Uint8Array(gzipSync(archive)));
 await db.prepare('CREATE TABLE gsis_roster_audit_exports(date TEXT PRIMARY KEY,source_count INTEGER NOT NULL,source_revision INTEGER NOT NULL,reference_json TEXT NOT NULL,exported_at INTEGER NOT NULL)').run();
 await db.prepare('INSERT INTO gsis_roster_audit_exports VALUES(?,?,?,?,?)').bind(archivedDate,1,1,JSON.stringify({key:archiveKey,digest:sha256Hex(archive),encoding:'gzip-json-v1'}),now).run();
 await db.prepare("INSERT INTO gsis_backup_ledger(id,started_at,finished_at,kind,date,status,drive_file_id) VALUES('already-written',?,?,'log','2026-10-16','verified','prior-txt')").bind(now,now).run();
 const initial=await dailyOutputsEdgeRoster(env,{now,limit:5});
 if(scenario!=='base'){
  if(scenario==='suppressed'){
   assert.equal(calls.filter(p=>p.kind==='log').length,0);assert(!db.sql.prepare('SELECT 1 FROM gsis_roster_daily_outputs WHERE date=?').get('2026-10-13'),'suppressed audit-only dates do not become backfill work');
   now=Date.parse('2026-10-15T00:01:00+08:00');google.clock(now);const previous=await refs.load();await refs.commit({before:previous.state,after:{...previous.state,contactsCheckedAt:now},expectedRevision:previous.revision,actor:'test',requestId:'refresh-suppressed',digest:'e'.repeat(64)});
   await dailyOutputsEdgeRoster(env,{now,selected:date});assert.equal(db.sql.prepare('SELECT finalized FROM gsis_roster_daily_outputs WHERE date=?').get(date).finalized,1);
   const closedCalls=calls.length;for(let i=0;i<3;i++){now+=120000;await dailyOutputsEdgeRoster(env,{now,selected:date});}assert.equal(calls.length,closedCalls,'suppressed TXT does not reopen a FINAL workbook');
  }else{
   const txt=[...google.files.values()].find(file=>file.name==='2026-10-13.txt');assert(txt,'audit TXT survives '+scenario);const expected=structuredClone(f.state);rosterAllocationAuditCapture_(expected);assert.deepEqual(txt.bytes,Buffer.from(legacyText(expected,'2026-10-13',new Date(now).toISOString())));
   assert.equal(calls.filter(p=>p.date==='2026-10-13'&&p.kind==='excel').length,0);
   const logCount=calls.filter(p=>p.kind==='log').length;now+=120000;await dailyOutputsEdgeRoster(env,{now,selected:'2026-10-13'});assert.equal(calls.filter(p=>p.kind==='log').length,logCount,'no duplicate audit backfill on workbook retry');
   const queue=db.sql.prepare('SELECT * FROM gsis_roster_daily_outputs WHERE date=?').get('2026-10-13');if(scenario==='missing-timetable'){assert.equal(queue.finalized,0);assert(queue.failure_count>0);assert(queue.last_error);}else assert.equal(queue.finalized,1);
  }
  console.log('audit backfill scenario passes: '+scenario);
 }else{
 assert.equal(initial.failed,0);
 assert.deepEqual(calls.filter(p=>p.kind==='log').map(p=>p.date).sort(),['2026-10-13',date,archivedDate],'first timer backfills live audit-only and R2-only dates, not before fresh start or already verified');
 for(const d of ['2026-10-13',date,archivedDate]){
  const state=structuredClone(f.state);if(d===archivedDate)state.audit.push(archivedEvent);rosterAllocationAuditCapture_(state);
  const txt=[...google.files.values()].find(f=>f.name===d+'.txt');assert(txt,'Drive TXT exists for '+d);
  assert.deepEqual(txt.bytes,Buffer.from(legacyText(state,d,new Date(now).toISOString())),'backfilled TXT bytes match pre-#82 on '+d);
  const month=google.files.get(txt.parents[0]),year=google.files.get(month.parents[0]);assert.equal(month.name,'10');assert.equal(year.name,'2026');assert.equal(year.parents[0],'audit');
  assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM gsis_backup_ledger WHERE date=? AND kind='log' AND status='verified'").get(d).n,1);
 }
 const count=calls.length;now+=120000;await dailyOutputsEdgeRoster(env,{now,limit:5});assert.equal(calls.length,count,'successful backfill is idempotent');
 // A new allocation goes through the actual D1 commit coordinator, then the queue/writer.
 await mutateEdgeRoster(env,{actor:identity.email,requestId:'committed-allocation',command:{operation:'autoAllocate',date},needsContext:false,apply(s){return f.O.apply(s,f.ctx,{operation:'autoAllocate',date});}});
 assert.equal(calls.length,count,'saving allocation never calls Drive');now+=120000;google.clock(now);await dailyOutputsEdgeRoster(env,{now,selected:date});
 const committed=(await loadEdgeRoster(env)).state;rosterAllocationAuditCapture_(committed);
 const saved=[...google.files.values()].find(f=>f.name===date+'.txt');assert.deepEqual(saved.bytes,Buffer.from(legacyText(committed,date,new Date(now).toISOString())));
 assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM gsis_backup_ledger WHERE date=? AND kind='log' AND status='verified'").get(date).n,2);
 assert.equal(google.files.get('frozen').bytes.toString(),'{}');
 console.log('fresh-start backfill, archived/live audit-only dates, original TXT bytes, per-file ledger, repeat safety and committed D1 allocation pass');
 }
}finally{Date.now=actualNow;globalThis.fetch=actualFetch;db.sql.close();}

if(scenario==='base')for(const name of ['non-school','missing-timetable','suppressed']){const run=spawnSync(process.execPath,[fileURLToPath(import.meta.url),name],{encoding:'utf8',env:process.env});assert.equal(run.status,0,name+'\n'+run.stdout+run.stderr);console.log(run.stdout.trim());}
