import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {GSISRoster as R} from '../roster-update/public/edge-roster-domain.js';
import {edgeRosterBackend,loadEdgeRoster,buildEdgeRosterContext,edgeRosterService} from '../roster-update/public/edge-roster.js';
import {createDeployDomain} from '../roster-update/public/edge-deploy-domain.js';
import {sha256Bytes,sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),h=require('./roster701-adapter.cjs')(),A=require('../shared/roster-allocation.js'),db=require('./helpers/chunked-import-db.cjs')();
const NativeDate=Date,clock=Date.parse(h.date+'T06:00:00+08:00'),fetchBefore=globalThis.fetch;
const genericAdhoc=process.env.GSIS_PRIORITY_PARITY_CASE==='generic-adhoc';
globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
const objects=new Map(),bucket={async put(key,value){objects.set(key,new Uint8Array(value));},async get(key){const bytes=objects.get(key);return bytes?{body:new Blob([bytes]).stream(),text:async()=>new TextDecoder().decode(bytes)}:null;}};
async function activate(scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'fixture',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}
try{
 for(const p of h.people)Object.assign(p,{email:p.id+'@gsps.edu.sg',emails:[p.id+'@gsps.edu.sg'],employment:p.id==='bob'?(genericAdhoc?'TEMP':'SRE'):'',role:'Teacher',groups:['Teaching'],adhocEligible:true});h.people[1].active=process.env.GSIS_ADHOC_INACTIVE!=='1';
 const initial=h.O.initial();initial.accountingYears['2026']={verified:true};initial.systemConfig.consecutiveSubjectRules=[];initial.systemConfig.scheduledAllocationEnabled=true;
 h.setState(initial);const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_TIMETABLE_SNAPSHOTS:bucket,APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.test',WHATSAPP_ENABLED:'false'},who={email:h.ctx.user.email,subject:'alice'};
 const model=R.validate({layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:h.teachers.filter(t=>!genericAdhoc||t.staffId!=='bob').map(t=>({name:t.name,cells:Array.from({length:5},()=>t.cells).flat()}))},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]}),modelJson=JSON.stringify(model),modelKey='baseline-model';
 await bucket.put(modelKey,await new Response(new Blob([modelJson]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 await activate('roster',initial);await activate('roster-register',{revision:1,entries:[{id:'baseline',name:'Fixture',from:'2026-01-01',to:'2026-12-31',priority:1,modelObject:{key:modelKey,digest:sha256Hex(modelJson),encoding:'gzip-json-v1'}}],receipts:[]});
 await activate('roster-references',{schema:1,contacts:{rosterPeople:h.people,rosterSMCIds:['alice'],rosterAdminIds:['alice'],rosterUrgentSMCIds:[]},contactsCheckedAt:clock,calendarCheckedAt:clock,calendarByDate:{[h.date]:{date:h.date,schoolDay:true,parity:'single',available:true}}});
 // Use the real Deploy calculation and real D1 context, with one verified
 // immutable publication already cached. No HTTP or live provider is involved.
 const deploy={index:{versions:[],active:null,published:null,publicationSchema:1,revision:0,requests:[]},drafts:{},publications:{},receipts:{},deltas:{},leases:{},properties:{},jobs:{}},domain=createDeployDomain({state:deploy,identity:who,sha256:sha256Bytes,calculations:new Map(),integration(){assert.fail('Unexpected integration');}});
 domain.dispatch({action:'change',input:{operation:'create',name:'Fixture',requestId:crypto.randomUUID()},identity:who},{user:{email:who.email,roles:['Admin','KP']},people:[],sysFields:{},roleCatalogue:[],authoritative:true});
 const doc=domain.readDocument(deploy.index.versions[0]);doc.from='2026-01-01';doc.to='2026-12-31';doc.teachers=h.people.map(p=>({id:p.id,name:p.name,active:p.active&&!(genericAdhoc&&p.id==='bob'),role:'Teacher',groups:[],profile:{'Basic Name':p.name,Role:'Teacher',Active:p.active&&!(genericAdhoc&&p.id==='bob')?'Y':'N','EO Appt Level':'GEO3','Employment Modifier':p.employment}}));
 // An active Contacts ad hoc teacher need not be in the earlier published Deploy roster.
 const entry={...deploy.index.versions[0],from:doc.from,to:doc.to,commit:crypto.randomUUID(),revision:1},ref={entry,document:doc};
 db.sql.exec('CREATE TABLE gsis_roster_deploy_publications (source_key TEXT PRIMARY KEY,publication_key TEXT NOT NULL,checked_at INTEGER NOT NULL,reference_json TEXT NOT NULL)');
 db.sql.prepare('INSERT INTO gsis_roster_deploy_publications VALUES (?,?,?,?)').run(sha256Hex(env.APPS_SCRIPT_URL),JSON.stringify([entry.id,entry.commit,entry.revision]),clock,JSON.stringify(ref));
 globalThis.fetch=()=>assert.fail('Parity test must not contact any provider');
 const edgeContext=await buildEdgeRosterContext(env,initial,{operation:'autoAllocate',date:h.date},who);Object.assign(h.ctx,edgeContext);assert.equal(A.teacherContext(initial,h.ctx,h.date).get('bob').dailyRoster,!genericAdhoc);
 const properties=new Map([['ROSTER_OPERATIONS_FILE','ops-file']]);h.scope.props_=()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v),deleteProperty:k=>properties.delete(k),getProperties:()=>Object.fromEntries(properties)});vm.runInContext(fs.readFileSync('backend/RosterAllocationRun.gs','utf8'),h.scope);
 const c={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:h.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']};
 const google=p=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:p},c),edge=async p=>{const reply=(await edgeRosterBackend(env,'rosterOperations',p,who,crypto.randomUUID())).result;assert.equal(reply.ok,true,reply.error);return reply.data;};
 const read=()=>loadEdgeRoster(env),both=async(operation,extra={})=>{
  const input={operation,date:h.date,view:'allocation',requestId:crypto.randomUUID(),...extra},g=google({...input,revision:h.state().revision}),e=await edge({...input,revision:(await read()).state.revision});return {g,e,input};
 };
 await both('saveAbsence',{staffId:'alice',typeId:'mc',periods:[2,3]});await both('autoAllocate',{allocationMode:'reoptimise'});
 const cover=s=>A.effectiveAssignments(s).map(a=>[a.period,a.staffId]).sort();assert.equal(cover(h.state()).length,2,JSON.stringify({teachers:h.ctx.days[h.date].teachers.map(t=>({id:t.staffId,R:t.R})),last:h.state().optimisationRuns.at(-1)}));assert.deepEqual(cover((await read()).state),cover(h.state()));
 await both('saveAdhoc',{staffId:'bob',periods:[2,3]});assert(h.O.view(h.state(),h.ctx,{view:'allocation',date:h.date}).replanSuggested);assert.equal((await edge({operation:'read',view:'allocation',date:h.date})).replanSuggested,true);
 const allocated=await both('autoAllocate',{allocationMode:'reoptimise'});assert.deepEqual(cover(h.state()),[[2,'bob'],[3,'bob']]);assert.deepEqual(cover((await read()).state),cover(h.state()));assert.deepEqual(allocated.e.run.priority1,JSON.parse(JSON.stringify(allocated.g.run.priority1)));
 assert.equal((await edge({operation:'read',view:'allocation',date:h.date})).replanSuggested,false);
 const before=await read();assert.equal((await edge({...allocated.input,revision:before.state.revision-1})).replayed,true);assert.equal((await read()).revision,before.revision,'same request never commits twice');
 await both('saveAdhoc',{staffId:'bob',periods:[1]});const idle=await both('autoAllocate',{allocationMode:'reoptimise'}),edgeState=(await read()).state;
 assert.deepEqual(cover(edgeState),cover(h.state()));assert(!cover(edgeState).some(([,id])=>id==='bob'));
 const gLog=google({operation:'read',view:'allocation',date:h.date}).priority1Run.messages,eLog=idle.e.allocatorRun.log.map(r=>r.message);
 for(const log of [gLog,eLog])assert(log.some(line=>/Priority-1 Bob.*activation window/.test(line)),JSON.stringify(log));
 assert.deepEqual(edgeState.optimisationRuns.at(-1).priority1Idle,h.state().optimisationRuns.at(-1).priority1Idle);
 assert.equal(edgeState.outbox.length,0);assert.equal(h.state().outbox.length,0);
 const scheduled=await edgeRosterService(env,{operation:'scheduledRoster',scheduledTime:clock}),scheduledState=(await read()).state;
 assert(scheduled.allocatorRun.log.some(row=>/Priority-1 Bob.*activation window/.test(row.message)),JSON.stringify(scheduled.allocatorRun));assert.equal(scheduled.allocatorRun.scheduleKey,scheduledState.optimisationRuns.at(-1).key);assert(h.O.allocationPriorityLog(scheduledState,scheduled.allocatorRun).some(line=>/activation window/.test(line)));
 console.log('PASS actual Google adapter and D1 SQLite/context path: '+(genericAdhoc?'non-SRE absent from baseline':'daily SRE')+'; complete draft, activation, priority allocation, durable notice, idle UI logs, exact retry and no provider sends');
}finally{globalThis.Date=NativeDate;globalThis.fetch=fetchBefore;db.sql.close();}
if(!genericAdhoc)execFileSync(process.execPath,[fileURLToPath(import.meta.url)],{stdio:'inherit',env:{...process.env,GSIS_PRIORITY_PARITY_CASE:'generic-adhoc'}});
