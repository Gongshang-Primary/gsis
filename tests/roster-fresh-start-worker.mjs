import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import vm from 'node:vm';
import {createDeployDomain} from '../roster-update/public/edge-deploy-domain.js';
import {sha256Bytes,sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs');
// Bundle current canonical rules in memory. This test never rewrites release copies.
const root=process.cwd(),entries=[['GSISRoster','roster.js'],['GSISRosterOperations','roster-operations.js'],['GSISRosterAllocation','roster-allocation.js'],['GSISRosterStapler','roster-stapler.js'],['GSISRosterStatistics','roster-statistics.js'],['GSiSEdgeNotifications','edge-notification-model.js']];
function wrapper(items){return `function sharedRequire(id){switch(id){${items.map(([n,f])=>`case './${f}':return ${n};`).join('')}default:throw Error(id);}}`+items.map(([name,file])=>`const ${name}=(()=>{const module={exports:{}};const require=sharedRequire;\n${fs.readFileSync(path.join(root,'shared',file),'utf8')}\nreturn module.exports;})();`).join('\n')+`export {${items.map(([n])=>n).join(',')}};`;}
const bundled=await build({entryPoints:['roster-update/public/edge-roster.js'],bundle:true,format:'esm',platform:'node',write:false,logLevel:'silent',plugins:[{name:'canonical-rules',setup(b){b.onLoad({filter:/\/edge-roster-domain\.js$/},()=>({contents:wrapper(entries),loader:'js'}));b.onLoad({filter:/\/edge-store\.js$/},()=>({contents:wrapper([['GSiSEdgeStore','edge-store.js'],['GSiSRosterImport','roster-import.js'],['GSiSRosterMirror','roster-mirror.js']]),loader:'js'}));}}]});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'gsis-fresh-runtime-'));fs.writeFileSync(path.join(temporary,'runtime.mjs'),bundled.outputFiles[0].text);
const runtime=await import(pathToFileURL(path.join(temporary,'runtime.mjs')));
const Store=require('../shared/edge-store.js'),A=require('../shared/roster-allocation.js'),O=require('../shared/roster-operations.js');
const RealDate=Date,fixedNow=Date.parse('2026-11-04T06:00:00+08:00');globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[fixedNow]));}static now(){return fixedNow;}};
const who={email:'admin@gsps.edu.sg',subject:'admin'},today=runtime.edgeRosterClock().today,freezeId='frozen-synthetic-cutover';
const people=[{id:'admin',name:'Admin',active:true,email:who.email,emails:[who.email],role:'Teacher',groups:[],employment:'Permanent'},{id:'bob',name:'Bob',active:true,email:'bob@gsps.edu.sg',emails:['bob@gsps.edu.sg'],role:'Teacher',groups:[],employment:'Permanent'}].map((p,n)=>({...p,adhocEligible:true,mobile:n?'6598765432':'6512345678',appointmentLevel:'GEO3'}));
const contacts={rosterPeople:people,rosterAdminIds:['admin'],rosterSMCIds:['admin'],rosterUrgentSMCIds:[]};
const db=database(),objects=new Map(),calls=[];
const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'legacy',ROSTER_TIMETABLE_SNAPSHOTS:{put:async(k,v)=>objects.set(k,v),get:async k=>objects.has(k)?{body:new Blob([objects.get(k)]).stream(),arrayBuffer:async()=>new Blob([objects.get(k)]).arrayBuffer()}:null},APPS_SCRIPT_URL:'https://script.google.com/macros/s/fresh-test/exec',CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar-test/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',BRIDGE_SECRET:'b'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40),CALENDAR_PROXY_SECRET:'c'.repeat(40),WHATSAPP_ENABLED:'true'};
let frozen=true,admin=true,tamper=false,normalizeMismatch=false,source=null,releaseLost=true;
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 const envelope=JSON.parse(options.body);
 if(envelope.action==='rosterDates')return Response.json({ok:true,result:{dates:envelope.payload.dates.map(date=>({date,schoolDay:true,parity:'odd'}))}});
 if(envelope.action==='rosterStatisticsCalendar')return Response.json({ok:true,result:{terms:[],semesters:[]}});
 const req=JSON.parse(envelope.payload),p=req.input;calls.push(p);
 if(p.operation==='edgeReferences')return Response.json({ok:true,data:{adminVerified:admin,contacts,contactsSource:'synthetic',legacyWritesDisabled:false,cutoverFreeze:{available:true,active:frozen,state:frozen?'frozen':'cancelled',requestId:freezeId,frozenAt:new Date().toISOString()}}});
 if(p.operation==='edgeFreshStartSource'){
  const settings=p.copyConfig?{systemConfig:{...O.initial().systemConfig,verboseLogging:false},nameBridges:[{timetableName:'Alias',staffId:'bob'}],nameBridgesSeeded:true,dailyEmploymentSettings:{recipients:[],subject:'Copied',time:'08:00'}}:{};
  if(normalizeMismatch)delete settings.systemConfig.verboseLogging;
  source={schema:'gsis-roster-fresh-start-source-v1',actor:who.email,requestId:p.requestId,effectiveDate:p.effectiveDate,copyConfig:p.copyConfig,freezeId,archiveId:await Store.digest(['archive',p.requestId]),originalPointers:{ROSTER_OPERATIONS_FILE:'original-operations',ROSTER_INDEX_FILE:'original-register'},settings,configDigest:await Store.digest(settings)};
  return Response.json({ok:true,data:{adminVerified:true,source,sourceDigest:tamper?'0'.repeat(64):await Store.digest(source)}});
 }
 if(p.operation==='edgeFreshStartDrift')return Response.json({ok:true,data:{current:true,sourceDigest:p.sourceDigest,changed:[],checkedAt:new Date().toISOString(),freshStart:true}});
 if(p.operation==='edgeFence')return Response.json({ok:true,data:{adminVerified:true,legacyWritesDisabled:true,sourceDigest:p.sourceDigest}});
 if(p.operation==='edgeArchiveRead')return Response.json({ok:true,data:{history:[],archive:{id:p.archiveId,readOnly:true}}});
 if(p.operation==='edgeFreshStartRelease'){if(releaseLost){releaseLost=false;throw Error('release acknowledgement lost');}return Response.json({ok:true,data:{released:true,requestId:p.requestId,sourceDigest:p.sourceDigest,archiveId:p.archiveId,googleWritable:true}});}
 throw Error('Unexpected bridge '+p.operation);
};
const input={operation:'freshStart',requestId:'fresh-start-synthetic-01',effectiveDate:today,copyConfig:true,confirmation:'START FRESH'};
try{
 frozen=false;await assert.rejects(runtime.edgeRosterMigration(env,input,who),e=>e.code==='ROSTER_FRESH_START_FREEZE');frozen=true;
 admin=false;await assert.rejects(runtime.edgeRosterMigration(env,input,who),e=>e.status===403);admin=true;
 await assert.rejects(runtime.edgeRosterMigration(env,{...input,confirmation:'yes'},who),e=>e.status===400);
 tamper=true;await assert.rejects(runtime.edgeRosterMigration(env,input,who),e=>e.code==='ROSTER_FRESH_START_SOURCE');tamper=false;
 normalizeMismatch=true;await assert.rejects(runtime.edgeRosterMigration(env,input,who),e=>e.code==='ROSTER_FRESH_START_CONFIG');normalizeMismatch=false;
 await assert.rejects(runtime.edgeRosterMigration(env,{...input,effectiveDate:A.addDays(today,1)},who),e=>e.code==='ROSTER_FRESH_START_DATE');
 const batch=db.batch.bind(db);let failFinal=true;db.batch=async statements=>{if(failFinal&&statements.some(s=>s.text.startsWith("UPDATE gsis_roster_import_sessions SET state='imported'"))){failFinal=false;throw Error('synthetic final outage');}return batch(statements);};
 await assert.rejects(runtime.edgeRosterMigration(env,input,who),/synthetic final outage/);
 for(const scope of ['roster','roster-register'])assert.equal((await Store.open(db,scope).head()).mode,'legacy','failed finalization publishes neither scope');
 const first=await runtime.edgeRosterMigration(env,input,who);
 assert.equal(first.imported,true,'fresh setup imports both scopes');assert.equal(first.freshStart,true);assert.equal(first.importSession.sessionId,first.sessionId);assert.equal(first.importSession.requestId,input.requestId);assert.equal(first.importSession.sourceDigest,first.sourceDigest);
 const ops=await Store.open(db,'roster').load(),register=await Store.open(db,'roster-register').load();
 assert.equal(ops.mode,'imported');assert.equal(register.mode,'imported');assert.equal(ops.revision,1);assert.equal(register.revision,1);
 assert.equal(ops.state.revision,1);assert.equal(register.state.revision,1);assert.deepEqual(register.state.entries,[]);
 for(const key of ['absences','assignments','outbox','staplerPlans','publicationSnapshots','openingBalances'])assert.deepEqual(ops.state[key],[],key+' stays empty');
 assert.equal(ops.state.systemConfig.verboseLogging,false);assert.equal(ops.state.nameBridges[0].staffId,'bob');
 assert.equal(ops.state.freshStart.configDigest,source.configDigest);assert.equal(ops.state.freshStart.fairnessMode,'opening-balances');
 assert.equal(ops.metadata.freshStart.archiveId,source.archiveId);
 assert.equal((await runtime.edgeRosterMigration(env,input,who)).imported,true,'same identity replays');
 await assert.rejects(runtime.edgeRosterMigration(env,{...input,copyConfig:false},who),e=>e.status===409,'changed identity refuses');
 assert.equal(calls.filter(p=>p.operation==='edgeExportManifest').length,0,'fresh path never captures history');
 const exported=await runtime.edgeRosterMigration(env,{operation:'export'},who);assert.equal(exported.evidence.manifest.freshStart,true);assert.equal((await runtime.edgeRosterMigration(env,{operation:'drift'},who)).current,true);assert.equal(calls.filter(p=>p.operation==='edgeDrift').length,0,'fresh drift never captures history');
 const beforeActivationHeads=db.sql.prepare('SELECT * FROM gsis_edge_heads ORDER BY scope').all();
 const preactivationExport=await runtime.edgeRosterMigration({...env,ROSTER_EDGE_AUTHORITY:'d1'},{operation:'export'},who);
 assert.equal(preactivationExport.evidence.manifest.freshStart,true,'evidence remains downloadable before activation even if D1 routing is enabled');
 assert.equal(preactivationExport.reentryReport,undefined,'there is no rollback report before a release');
 assert.deepEqual(db.sql.prepare('SELECT * FROM gsis_edge_heads ORDER BY scope').all(),beforeActivationHeads,'export does not activate or change a prepared store');
 await runtime.edgeRosterMigration(env,{operation:'activate',sourceDigest:ops.state.freshStart.sourceDigest},who);
 const live={...env,ROSTER_EDGE_AUTHORITY:'d1'};
 const mirror=await runtime.mirrorEdgeRoster(live);assert.equal(mirror.archiveOnly,true);assert.equal(calls.some(p=>p.operation==='edgeMirror'),false);
 assert.equal((await runtime.readRosterMirrorStatus(live)).archiveOnly,true);
 const archive=await runtime.edgeRosterArchive(live,{view:'history'},who);assert.equal(archive.archive.id,source.archiveId);
 await assert.rejects(runtime.edgeRosterArchive(live,{view:'history',operation:'saveAbsence'},who),e=>e.status===400);
 await assert.rejects(runtime.edgeRosterMigration(live,{operation:'freshStart',...input,requestId:'other-fresh-start'},who),e=>e.status===409);
 const result=await runtime.edgeRosterBackend(live,'rosterProfile',{},who,'synthetic');assert.equal(result.result.data.historyCoverage.since,today);
 const emptyBatch=await runtime.edgeRosterBackend(live,'rosterOperations',{operation:'timetableBatch',stage:'baseline',encoding:'json-v1'},who,'synthetic');assert.equal(emptyBatch.result.ok,true,emptyBatch.result.error);assert.deepEqual(JSON.parse(emptyBatch.result.data.data).entries,[]);
 const R=require('../shared/roster.js'),cells=()=>Array.from({length:85},()=>['','','','']),adminCells=cells();for(let weekday=0;weekday<5;weekday++)adminCells[weekday*17+2]=['EL','4A','Room 1',''];
 const model=R.validate({layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:people.map(person=>({name:person.id==='bob'?'Alias':person.name,cells:person.id==='admin'?adminCells:cells()}))},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[]});
 const upload={requestId:'first-fresh-baseline-01',revision:1,name:'First D1 baseline',from:today,to:'2099-12-31',model,workbook:Buffer.from([80,75,3,4]).toString('base64')};
 const uploaded=await runtime.edgeRosterBackend(live,'rosterUpload',upload,who,'synthetic');assert.equal(uploaded.result.ok,true,uploaded.result.error);assert.equal(uploaded.result.data.active.id,upload.requestId);
 assert.equal((await runtime.edgeRosterBackend(live,'rosterUpload',upload,who,'synthetic')).result.data.replayed,true);
 const prepared=await runtime.edgeRosterBackend(live,'rosterOperations',{operation:'timetableBatch',stage:'baseline',encoding:'json-v1'},who,'synthetic');assert.equal(prepared.result.ok,true,prepared.result.error);assert.equal(JSON.parse(prepared.result.data.data).models[0].id,upload.requestId);assert.notEqual(prepared.result.data.sourceKey,emptyBatch.result.data.sourceKey);
 for(let n=0;n<2;n++){const read=await runtime.edgeRosterBackend(live,'rosterRead',{date:today},who,'synthetic');assert.equal(read.result.ok,true,read.result.error);assert.equal(read.result.data.modelId,upload.requestId);}
 const send=async command=>{const reply=(await runtime.edgeRosterBackend(live,'rosterOperations',command,who,'synthetic')).result;assert.equal(reply.ok,true,JSON.stringify(reply));return reply.data;};
 const Fields=vm.runInNewContext(fs.readFileSync('shared/fields.js','utf8')+';GSISFields;'),deployState={index:{versions:[],active:null,published:null,publicationSchema:1,revision:0,requests:[]},drafts:{},publications:{},receipts:{},deltas:{},leases:{},properties:{},jobs:{}},deployDomain=createDeployDomain({state:deployState,identity:who,sha256:sha256Bytes,calculations:new Map(),integration(){assert.fail('synthetic publication needs no integration');}});
 deployDomain.dispatch({action:'change',input:{operation:'create',name:'Fresh quota publication',requestId:crypto.randomUUID()},identity:who},{user:{email:who.email,roles:['Admin','KP']},people:[],sysFields:{},roleCatalogue:[],authoritative:true});
 const document=deployDomain.readDocument(deployState.index.versions[0]);document.from='2026-01-01';document.to='2099-12-31';document.teachers=people.map(person=>({id:person.id,name:person.name,active:true,role:'Teacher',groups:[],profile:{'Basic Name':person.name,Role:'Teacher',Active:'Y','EO Appt Level':'GEO3'}}));
 const publication={...deployState.index.versions[0],from:document.from,to:document.to,edgePublished:true,commit:crypto.randomUUID()};deployState.index.published=publication;deployState.index.venuePublications=[publication];deployState.publications=Object.fromEntries(Object.entries(Fields.flat(document)).map(([key,value])=>[publication.commit+'|'+key,value]));
 const deployStore=Store.open(db,'deploy'),deployImported=await deployStore.importState({state:deployState,actor:'synthetic',requestId:'fresh-deploy-publication'});await deployStore.transition({from:'imported',to:'active',expectedRevision:deployImported.revision,actor:'synthetic',proof:{legacyWritesDisabled:true,sourceDigest:deployImported.sourceDigest,verifiedRecords:deployImported.importedRecords}});
 const denied=(await runtime.edgeRosterBackend(live,'rosterOperations',{operation:'autoAllocate',date:today,view:'allocation',requestId:'fresh-before-opening'},who,'synthetic')).result;assert.equal(denied.ok,true);assert.equal(denied.data.paused,true);assert.match(denied.data.reason,/Opening balances/);assert.deepEqual((await Store.open(db,'roster').load()).state.assignments,[]);
 const grid=await send({operation:'openingBalances'});assert.equal(grid.canEdit,true);assert.equal(grid.confirmed,false);assert.equal(grid.rows.length,2);
 const opening={operation:'saveOpeningBalances',requestId:'fresh-opening-confirmed',revision:grid.revision,reason:'Admin reviewed starting totals',confirmInitial:true,rows:grid.rows.map(r=>({staffId:r.staffId,cumulativeQuota:0,cumulativeDone:0,asOfDate:A.addDays(today,-1),version:r.version}))};
 const savedOpening=await send(opening);assert.equal(savedOpening.confirmed,true);assert.equal((await send(opening)).replayed,true);
 const absence={operation:'saveAbsence',requestId:'fresh-first-absence',date:today,staffId:'admin',typeId:'mc',periods:[2],reliefRequired:true,revision:savedOpening.revision};assert.equal((await send(absence)).savedIds.length,1);assert.equal((await send(absence)).replayed,true);
 const allocated=await send({operation:'autoAllocate',date:today,view:'allocation',requestId:'fresh-first-allocate'});assert.equal(allocated.assignments.filter(r=>r.status==='draft'&&r.staffId==='bob').length,1,JSON.stringify({reason:allocated.reason,demands:allocated.demands,health:allocated.health,teachers:allocated.allocationModel?.teachers,assignments:allocated.assignments}));
 const baselineAssignmentIds=allocated.assignments.filter(r=>r.status==='draft').map(r=>r.id).sort();
 for(let n=0;n<2;n++){const allocation=await send({operation:'read',date:today,view:'allocation'});assert.equal(allocation.assignments.filter(r=>r.status==='draft'&&r.staffId==='bob').length,1);assert.deepEqual(allocation.assignments.filter(r=>r.status==='draft').map(r=>r.id).sort(),baselineAssignmentIds);assert.equal(allocation.historyCoverage?.since,today);}
 const published=await send({operation:'publish',date:today,view:'allocation',allocationRevision:allocated.allocationRevision,requestId:'fresh-first-publish'});assert.equal(published.publishedRevision,1);const notified=await send({operation:'notifyDaily',date:today,requestId:'fresh-first-notify',expectedPublicationRevision:1});assert.equal(notified.notificationsQueued>0,true,JSON.stringify(notified));
 const liveState=(await Store.open(db,'roster').load()).state;assert.equal(liveState.assignments.find(r=>r.staffId==='bob').status,'published');assert(liveState.outbox.some(row=>row.status==='queued'&&row.recipientId==='bob'),'WhatsApp intent remains queued without a provider send');assert.equal(calls.some(p=>p.operation==='edgeMirror'),false);
 // The new D1 plan owns its day from the first save, before confirmation or
 // origin pruning. A replacement baseline must not rewrite its relief work.
 const S=require('../shared/roster-stapler.js'),staplerDate=A.addDays(today,1),draft=await send({operation:'stapler',date:staplerDate});
 assert(S.hasDaySnapshot(draft.plan));assert.equal(draft.plan.id,'stapler:'+staplerDate);assert.equal(draft.plan.baselineId,upload.requestId);
 const savedPlan=await send({operation:'saveStapler',date:staplerDate,view:'stapler',requestId:'fresh-stapler-created',revision:draft.revision,staplerRevision:0,plan:draft.plan});
 const createdPlan=(await runtime.loadEdgeRoster(live,{hydrate:true,dates:[staplerDate]})).state.staplerPlans.find(row=>row.date===staplerDate);
 assert.notEqual(createdPlan.confirmed,true);assert(S.hasDaySnapshot(createdPlan.draft));assert.equal(createdPlan.draft.id,'stapler:'+staplerDate);
 const confirmedPlan=await send({operation:'confirmStapler',date:staplerDate,view:'stapler',requestId:'fresh-stapler-confirmed',revision:savedPlan.revision,staplerRevision:savedPlan.staplerRevision});
 await send({operation:'saveAbsence',requestId:'fresh-stapler-absence',date:staplerDate,staffId:'admin',typeId:'mc',periods:[2],reliefRequired:true,revision:confirmedPlan.revision});
 const staplerAllocation=await send({operation:'autoAllocate',date:staplerDate,view:'allocation',requestId:'fresh-stapler-allocate'}),staplerAssignmentIds=staplerAllocation.assignments.filter(row=>row.status==='draft').map(row=>row.id).sort();
 assert.equal(staplerAssignmentIds.length,1);assert(staplerAllocation.assignments.every(row=>row.timetableId==='stapler:'+staplerDate));
 const beforePrune=(await runtime.loadEdgeRoster(live,{hydrate:true,dates:[staplerDate]})).state.staplerPlans.find(row=>row.date===staplerDate),replacementModel=structuredClone(model);
 replacementModel.single.blocks[0].cells.forEach(cell=>{if(cell[0]==='EL'){cell[0]='MA';cell[2]='Replacement room';}});
 const replacement=await runtime.edgeRosterBackend(live,'rosterUpload',{...upload,requestId:'fresh-replacement-baseline',revision:uploaded.result.data.revision,name:'Replacement baseline',model:replacementModel},who,'synthetic');assert.equal(replacement.result.ok,true,replacement.result.error);
 const pruned=await runtime.edgeRosterBackend(live,'rosterUpdate',{operation:'prune',requestId:'fresh-prune-origin',revision:replacement.result.data.revision,id:upload.requestId},who,'synthetic');assert.equal(pruned.result.ok,true,pruned.result.error);assert.equal(pruned.result.data.entries.find(row=>row.id===upload.requestId).pruned,true);
 for(let n=0;n<2;n++){
  const allocation=await send({operation:'read',date:staplerDate,view:'allocation'});assert.equal(allocation.timetable.id,'stapler:'+staplerDate);assert.deepEqual(allocation.assignments.filter(row=>row.status==='draft').map(row=>row.id).sort(),staplerAssignmentIds);
  const retained=(await runtime.loadEdgeRoster(live,{hydrate:true,dates:[staplerDate]})).state.staplerPlans.find(row=>row.date===staplerDate);assert.deepEqual(retained.draft,beforePrune.draft);assert.deepEqual(retained.confirmedPlan,beforePrune.confirmedPlan);
 }
 const release={operation:'release',requestId:'fresh-release-synthetic'};
 await assert.rejects(runtime.edgeRosterMigration(live,release,who),/release acknowledgement lost/);
 const released=await runtime.edgeRosterMigration(live,release,who);assert.equal(released.released,true);assert.equal(released.reentry.sourceDigest,ops.state.freshStart.sourceDigest);
 assert.equal((await Store.open(db,'roster').head()).mode,'paused');
 assert.equal((await runtime.edgeRosterMigration(live,release,who)).released,true);
 const reentry=await runtime.edgeRosterMigration(live,{operation:'export'},who);assert.equal(reentry.reentryReport.register.state.entries[0].id,upload.requestId);assert.equal(reentry.reentryReport.changes.some(r=>r.requestId===upload.requestId),true);
 for(const requestId of ['fresh-opening-confirmed','fresh-first-absence','fresh-first-allocate','fresh-first-publish','fresh-first-notify','fresh-stapler-created','fresh-stapler-confirmed','fresh-stapler-absence','fresh-stapler-allocate','fresh-replacement-baseline','fresh-prune-origin'])assert(reentry.reentryReport.changes.some(row=>row.requestId===requestId),'rollback retains '+requestId+' for re-entry');
 assert.equal(calls.some(p=>p.operation==='edgeMirror'),false,'rollback never installs mirror pointers');
 console.log('PASS fresh Worker signed empty import, atomic retry, small config drift, activation, first baseline upload/replay, opening confirmation, absence/allocation/two reads/publish/WhatsApp queue, created Stapler snapshot and origin pruning, archive and complete retained rollback');
}finally{globalThis.fetch=realFetch;globalThis.Date=RealDate;db.sql.close();fs.rmSync(temporary,{recursive:true,force:true});}
