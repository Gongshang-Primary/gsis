import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import worker from '../notification-worker/index.js';
import {dispatchAllocationAudit} from '../roster-update/public/_worker.js';
import {mutateEdgeRoster} from '../roster-update/public/edge-roster.js';
import {startQuietMode,endQuietMode,endQuietModeSession} from '../shared/roster-quiet-mode.js';

const require=createRequire(import.meta.url),adapter=require('./roster701-adapter.cjs'),database=require('./helpers/chunked-import-db.cjs'),Store=require('../shared/edge-store.js');
const NativeDate=Date,originalFetch=globalThis.fetch,originalInfo=console.info,originalError=console.error,logs=[];
let now=NativeDate.parse('2026-10-14T06:30:00+08:00'),failed=0;
globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
console.info=value=>logs.push(value);console.error=value=>logs.push(value);
const at=time=>NativeDate.parse('2026-10-14T'+time+':00+08:00');

async function test(name,run){try{await run();console.log('PASS '+name);}catch(error){failed++;originalError(name,error);}}
async function activate(db,scope,state){const store=Store.open(db,scope),head=await store.importState({state,actor:'fixture',requestId:crypto.randomUUID(),source:{sourceDigest:'a'.repeat(64),manifestDigest:'b'.repeat(64)}});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});await db.prepare("UPDATE gsis_edge_heads SET metadata_json=json_set(metadata_json,'$.importSession',?) WHERE scope=?").bind('c'.repeat(64),scope).run();return store;}

async function fixture(authority='legacy'){
 now=at('06:30');const h=adapter(),db=database(),files=new Map(),objects=new Map(),textWrites=[],serviceCalls=[];
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:authority,ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',APPS_SCRIPT_URL:'https://script.google.com/macros/s/audit-fixture/exec',GSIS_SECRET:'s'.repeat(40),ROSTER_TIMETABLE_SNAPSHOTS:{async put(key,value){objects.set(key,new Uint8Array(value));if(afterExport){const hook=afterExport;afterExport=null;await hook();}},async get(key){const value=objects.get(key);return value?{body:new Blob([value]).stream(),text:async()=>new TextDecoder().decode(value)}:null;}}};
 let afterExport=null,failText=false,busy=false;
 function clock(value){now=value;h.ctx.now=now;h.ctx.iso=new NativeDate(now).toISOString();h.ctx.minute=new NativeDate(now+28800000).getUTCHours()*60+new NativeDate(now+28800000).getUTCMinutes();}
 clock(now);vm.runInContext(fs.readFileSync('backend/RosterAuditExport.gs','utf8'),h.scope);
 const read=h.scope.rosterReadFile_,write=h.scope.rosterDriveRequest_;
 h.scope.LockService.getUserLock=()=>({tryLock:()=>!busy,releaseLock(){}});
 h.scope.Utilities.newBlob=text=>({text,getBytes:()=>Buffer.from(text)});
 h.scope.rosterAllocationAuditFolder_=date=>'month/'+date;
 h.scope.rosterFindFile_=(parent,name)=>name==='Evidence'?'evidence/'+parent:[...files].find(([,file])=>file.parent===parent&&file.name===name)?.[0]||'';
 h.scope.rosterCreateFile_=(parent,name,blob)=>{const id='file/'+parent+'/'+name;files.set(id,{parent,name,text:blob.text});if(name.endsWith('.txt'))textWrites.push(id);return id;};
 h.scope.rosterReadFile_=id=>files.has(id)?files.get(id).text:read(id);
 h.scope.rosterDriveRequest_=(url,options)=>{
  if(String(url).includes('ops-file'))return write(url,options);
  const id=decodeURIComponent(new URL(url).pathname.split('/files/')[1]);assert(files.has(id),'only an existing derived file is replaced');files.get(id).text=options.payload;textWrites.push(id);
  if(failText){failText=false;throw Error('Lost derived-file response');}return {};
 };
 h.call({operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[2,3],revision:0,requestId:crypto.randomUUID()});
 const initial=h.state();
 for(const date of ['2026-10-08','2026-10-09','2026-10-10','2026-10-11','2026-10-12'])initial.audit.push({id:'old/'+date,date,at:date+'T00:00:00Z',operation:'assign',actor:'fixture-smc',essential:true,decisionChanges:[]});
 initial.outbox.push({id:'already-delivered',status:'sent',data:{token:'PRIVATE_OUTBOX_TOKEN',summary:'PRIVATE_OUTBOX_BODY'}});
 h.setState(initial);
 let store;
 if(authority==='d1'){
  store=await activate(db,'roster',initial);await activate(db,'roster-register',{revision:0,entries:[],receipts:[]});await activate(db,'roster-references',{schema:1,contacts:{rosterPeople:[],rosterSMCIds:[],rosterAdminIds:[]},contactsCheckedAt:now,calendarByDate:{}});
 }else await Store.open(db,'roster').ensure();
 const state=async()=>store?(await store.load()).state:h.state();
 async function save(command){const input={...command,revision:(await state()).revision,requestId:crypto.randomUUID()};return store?mutateEdgeRoster(env,{actor:h.ctx.user.email,requestId:input.requestId,command:input,needsContext:false,apply(s){return h.O.apply(s,h.ctx,input);}}):h.call(input);}
 async function update(change){if(store)return mutateEdgeRoster(env,{actor:'fixture-smc',requestId:crypto.randomUUID(),command:{operation:'currentDuty',date:h.date},needsContext:false,apply(state){change(state);return {saved:true};}});const value=await state();change(value);h.setState(value);}
 globalThis.fetch=async(url,options)=>{
  assert.equal(authority,'legacy','D1 audit work never calls Google');assert.equal(String(url),env.APPS_SCRIPT_URL);
  const input=JSON.parse(JSON.parse(options.body).payload).input;assert.equal(input.operation,'allocationAuditExport','audit lane never sends or plans');assert.equal(input.limit,1);
  serviceCalls.push(input);const result=h.scope.rosterAllocationAuditExport_(input);if(afterExport){const hook=afterExport;afterExport=null;await hook();}return Response.json({ok:true,data:result});
 };
 const quiet=await startQuietMode(db,'fixture-smc',now);
 const demand=h.O.demand(h.ctx,initial,h.date)[0];
 for(const [i,staffId] of ['bob','charlie','dora'].entries()){clock(at('06:'+String(31+i)));await save({operation:'assign',date:h.date,staffId,demandIds:[demand.id]});}
 const decisions=(await state()).audit.filter(row=>row.essential&&row.decisionChanges?.length);
 assert.deepEqual(decisions.map(row=>row.at),['2026-10-13T22:31:00.000Z','2026-10-13T22:32:00.000Z','2026-10-13T22:33:00.000Z']);
 assert.deepEqual(decisions.map(row=>row.decisionChanges[0].after.name),['Bob','Charlie','Dora']);
 async function end(reason='publish-accepted'){
  clock(at('06:40'));
  if(reason==='expired'){clock(quiet.expiresAt);return;}
  if(reason==='publish-accepted'){const current=await state();await save({operation:'publish',date:h.date,allocationRevision:current.dayRevisions[h.date]});await endQuietModeSession(db,'fixture-smc',reason,quiet.startedAt,now);}
  else await endQuietMode(db,'fixture-smc',reason,now);
 }
 async function tick(){const tasks=[];await worker.scheduled({cron:'2-57/5 * * * *',scheduledTime:now},env,{waitUntil:p=>tasks.push(p)});await Promise.all(tasks);}
 function exportedDates(){return authority==='d1'?(db.sql.prepare("SELECT 1 FROM sqlite_master WHERE name='gsis_roster_audit_exports'").get()?db.sql.prepare('SELECT date FROM gsis_roster_audit_exports ORDER BY date').all().map(row=>row.date):[]):[...files.values()].filter(file=>file.name.endsWith('.txt')).map(file=>file.name.slice(0,10)).sort();}
 async function evidence(){if(authority==='legacy'){const meta=(await state()).allocationAuditExports[h.date];return JSON.parse(files.get(meta.archiveFileId).text);}const row=db.sql.prepare('SELECT reference_json FROM gsis_roster_audit_exports WHERE date=?').get(h.date),ref=JSON.parse(row.reference_json);return JSON.parse(gunzipSync(objects.get(ref.key)).toString());}
 return {h,db,env,files,objects,textWrites,serviceCalls,decisions,state,save,update,end,tick,clock,exportedDates,evidence,setBusy:value=>{busy=value;},loseTextResponse:()=>{failText=true;},afterExport:fn=>{afterExport=fn;},close:()=>db.sql.close()};
}

try{
 for(const authority of ['legacy','d1'])await test(authority+' saved decisions survive quiet mode and drain three oldest dates per audit invocation',async()=>{
  const f=await fixture(authority);try{
   await f.tick();assert.deepEqual(f.exportedDates(),[],'no heavy export while quiet');
   await f.end();await f.tick();assert.deepEqual(f.exportedDates(),['2026-10-08','2026-10-09','2026-10-10'],'first bounded catch-up batch must export three oldest dates');
   await f.tick();assert.deepEqual(f.exportedDates(),['2026-10-08','2026-10-09','2026-10-10','2026-10-11','2026-10-12','2026-10-14']);
   const evidence=await f.evidence(),decisions=evidence.audit.filter(row=>row.essential&&row.decisionChanges?.length);
   assert.deepEqual(decisions.map(row=>[row.id,row.at,row.decisionChanges]),f.decisions.map(row=>[row.id,row.at,row.decisionChanges]));assert.equal(new Set(decisions.map(row=>row.id)).size,3);
   if(authority==='legacy'){const meta=(await f.state()).allocationAuditExports[f.h.date],text=f.files.get(meta.fileId).text;assert(text.indexOf('06:31')<text.indexOf('06:32')&&text.indexOf('06:32')<text.indexOf('06:33'));assert.doesNotMatch(text,/PRIVATE_OUTBOX/);}
   const writes=f.textWrites.length,objects=f.objects.size;await f.tick();assert.equal(f.textWrites.length,writes);assert.equal(f.objects.size,objects,'completed retry writes no new archive');
   assert.doesNotMatch(JSON.stringify(f.db.sql.prepare('SELECT * FROM gsis_job_health').all()),/Bob|Charlie|Dora|PRIVATE_OUTBOX/);
  }finally{f.close();}
 });

 await test('D1 audit response is accepted by the actual shared dispatcher',async()=>{const f=await fixture('d1');try{await f.end('manual');const result=await dispatchAllocationAudit(f.env);assert.equal(result.exported,1);assert.equal(result.pending,5);assert.equal(result.failed,0);}finally{f.close();}});

 await test('D1 rejects an archive checkpoint when the same day changes during upload',async()=>{const f=await fixture('d1');try{
  await f.end('manual');f.afterExport(()=>mutateEdgeRoster(f.env,{actor:'fixture-smc',requestId:crypto.randomUUID(),command:{operation:'currentDuty',date:'2026-10-08'},needsContext:false,apply(state){state.audit.push({id:'concurrent-correction',date:'2026-10-08',at:'2026-10-08T00:01:00Z',operation:'assign',essential:true});return {saved:true};}}));
  const first=await dispatchAllocationAudit(f.env);assert.equal(first.exported,0);assert.equal(first.pending,6);assert.equal(first.skipped,true);assert.deepEqual(f.exportedDates(),[]);
  const retry=await dispatchAllocationAudit(f.env);assert.equal(retry.exported,1);assert.equal(retry.pending,5);
  const reference=JSON.parse(f.db.sql.prepare("SELECT reference_json FROM gsis_roster_audit_exports WHERE date='2026-10-08'").get().reference_json),evidence=JSON.parse(gunzipSync(f.objects.get(reference.key)).toString());
  assert.deepEqual(evidence.audit.map(row=>row.id),['old/2026-10-08','concurrent-correction']);
 }finally{f.close();}});

 await test('D1 keeps another day pending when it arrives before the final scan checkpoint',async()=>{const f=await fixture('d1');try{
  await f.end('manual');await f.tick();await f.tick();
  await mutateEdgeRoster(f.env,{actor:'fixture-smc',requestId:crypto.randomUUID(),command:{operation:'currentDuty',date:'2026-10-08'},needsContext:false,apply(state){state.audit.push({id:'late-first-day',date:'2026-10-08',at:'2026-10-08T00:02:00Z',operation:'assign',essential:true});return {saved:true};}});
  f.afterExport(()=>mutateEdgeRoster(f.env,{actor:'fixture-smc',requestId:crypto.randomUUID(),command:{operation:'currentDuty',date:'2026-10-06'},needsContext:false,apply(state){state.audit.push({id:'new-oldest-day',date:'2026-10-06',at:'2026-10-06T00:00:00Z',operation:'assign',essential:true});return {saved:true};}}));
  const first=await dispatchAllocationAudit(f.env);assert.equal(first.exported,1);assert.equal(first.pending,1,'an unverified final scan cannot report caught up');
  const next=await dispatchAllocationAudit(f.env);assert.equal(next.exported,1);assert.equal(next.pending,0);assert.equal(f.exportedDates()[0],'2026-10-06');
 }finally{f.close();}});

 for(const reason of ['manual','whatsapp-queued','expired'])await test(reason+' quiet end resumes the retained backlog',async()=>{const f=await fixture();try{await f.end(reason);await f.tick();assert.equal(f.exportedDates().length,3);}finally{f.close();}});

 await test('a renewed quiet session stops before the next export and later resumes',async()=>{const f=await fixture();try{await f.end('manual');f.afterExport(async()=>{f.clock(now+1);await startQuietMode(f.db,'second-smc',now);});await f.tick();assert.equal(f.exportedDates().length,1);await f.tick();assert.equal(f.exportedDates().length,1);await endQuietMode(f.db,'second-smc','manual',now+1);await f.tick();assert.equal(f.exportedDates().length,4);}finally{f.close();}});

 await test('the elapsed-time budget preserves remaining dates for a later batch',async()=>{const f=await fixture();try{await f.end('manual');f.afterExport(()=>f.clock(now+21000));await f.tick();assert.equal(f.exportedDates().length,1);await f.tick();assert.equal(f.exportedDates().length,4);}finally{f.close();}});

 await test('a slow quiet-mode read cannot admit an export after the time budget',async()=>{const f=await fixture();try{
  await f.end('manual');const prepare=f.db.prepare;let reads=0;
  f.db.prepare=sql=>{const statement=prepare(sql);if(!/^SELECT \* FROM gsis_quiet_mode/.test(sql))return statement;const wrap=value=>({...value,bind:(...args)=>wrap(value.bind(...args)),async first(){if(++reads===2)f.clock(now+21000);return value.first();}});return wrap(statement);};
  await f.tick();assert.deepEqual(f.exportedDates(),[],'no backend request starts after the admission budget');
 }finally{f.close();}});

 await test('lock contention yields without repeated attempts or lost backlog',async()=>{const f=await fixture();try{await f.end('manual');f.setBusy(true);await f.tick();assert.equal(f.serviceCalls.length,1);assert.deepEqual(f.exportedDates(),[]);f.setBusy(false);await f.tick();assert.equal(f.exportedDates().length,3);}finally{f.close();}});

 for(const authority of ['legacy','d1'])await test(authority+' notification priority yields before heavy export and later resumes',async()=>{const f=await fixture(authority);try{
  await f.end('manual');await f.update(state=>state.outbox.push({id:'pending-notice',status:'queued'}));await f.tick();assert.deepEqual(f.exportedDates(),[]);
  await f.update(state=>{state.outbox.find(row=>row.id==='pending-notice').status='sent';});await f.tick();assert.equal(f.exportedDates().length,3);
 }finally{f.close();}});

 for(const authority of ['legacy','d1'])await test(authority+' future notification retries do not block the audit',async()=>{const f=await fixture(authority);try{
  await f.end('manual');await f.update(state=>state.outbox.push({id:'future-notice',status:'queued',nextEligibleAt:now+60000}));await f.tick();assert.equal(f.exportedDates().length,3);
 }finally{f.close();}});

 for(const authority of ['legacy','d1'])await test(authority+' disabled optional logging keeps essential SMC facts and omits suppressed records',async()=>{const f=await fixture(authority);try{
  await f.end('manual');await f.update(state=>{state.systemConfig.verboseLogging=false;state.audit.push({id:'suppressed',date:f.h.date,at:'2026-10-13T22:34:00.000Z',operation:'assign',actor:'SUPPRESSED_PRIVATE',auditExportSuppressed:true});});
  await f.tick();await f.tick();const evidence=await f.evidence();assert.deepEqual(evidence.audit.filter(row=>row.decisionChanges?.length).map(row=>row.id),f.decisions.map(row=>row.id));assert(!evidence.audit.some(row=>row.id==='suppressed'));
 }finally{f.close();}});

 for(const authority of ['legacy','d1'])await test(authority+' disabled logging does not export or later resurrect suppressed intervals',async()=>{const f=await fixture(authority);try{
  await f.end('manual');await f.update(state=>{state.systemConfig.verboseLogging=false;for(const row of state.audit){delete row.essential;row.auditExportSuppressed=true;}});
  await f.tick();assert.deepEqual(f.exportedDates(),[]);const disabled=await dispatchAllocationAudit(f.env);assert.equal(disabled.enabled,false);assert.equal(disabled.code,'AUDIT_LOGGING_DISABLED');
  await f.update(state=>{state.systemConfig.verboseLogging=true;});f.clock(at('06:45'));const demand=f.h.O.demand(f.h.ctx,await f.state(),f.h.date)[0];await f.save({operation:'assign',date:f.h.date,staffId:'bob',demandIds:[demand.id]});
  for(let i=0;i<4&&!f.exportedDates().includes(f.h.date);i++)await f.tick();const evidence=await f.evidence();const decisions=evidence.audit.filter(row=>row.decisionChanges?.length);assert.equal(decisions.length,1);assert.equal(decisions[0].at,'2026-10-13T22:45:00.000Z');assert(!evidence.audit.some(row=>f.decisions.some(old=>old.id===row.id)));
 }finally{f.close();}});

 await test('an unconfirmed text write retries the same immutable facts once',async()=>{const f=await fixture();try{
  await f.end('manual');for(let i=0;i<6&&f.exportedDates().length<6;i++)await f.tick();assert.equal(f.exportedDates().length,6);
  const state=await f.state();state.audit.push({id:'late-correction',date:f.h.date,at:'2026-10-13T22:45:00.000Z',operation:'assign',essential:true});f.h.scope.rosterAllocationAuditCapture_(state);f.h.setState(state);
  f.loseTextResponse();await f.tick();assert.equal((await f.state()).allocationAuditExports[f.h.date].pendingVersion>(await f.state()).allocationAuditExports[f.h.date].exportedVersion,true);
  await f.tick();const evidence=await f.evidence();assert.equal(evidence.audit.filter(row=>row.id==='late-correction').length,1);assert.equal(new Set(evidence.audit.map(row=>row.id)).size,evidence.audit.length);
 }finally{f.close();}});
 assert.doesNotMatch(logs.join('\n'),/PRIVATE_OUTBOX|Bob|Charlie|Dora/,'operational logs never contain audit payloads');
}finally{globalThis.Date=NativeDate;globalThis.fetch=originalFetch;console.info=originalInfo;console.error=originalError;}
if(failed)process.exitCode=1;
