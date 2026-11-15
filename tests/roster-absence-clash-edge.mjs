import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {GSISRosterOperations as O,GSISRoster as R} from '../roster-update/public/edge-roster-domain.js';
import {edgeRosterBackend,edgeRosterService,loadEdgeRoster,mutateEdgeRoster,edgeRosterClock} from '../roster-update/public/edge-roster.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';

import * as transport from '../shared/roster-absence-transport.js';
import {dispatchReceivedReports} from '../roster-update/public/_worker.js';
function database(){const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');let hook=null;const prepare=text=>({text,args:[],bind(...args){return {...this,args};},async first(){return sql.prepare(this.text).get(...this.args)||null;},async all(){return {success:true,results:sql.prepare(this.text).all(...this.args),meta:{changes:0}};},async run(){const result=sql.prepare(this.text).run(...this.args);return {success:true,results:[],meta:{changes:Number(result.changes)}};}});const db={sql,prepare,withSession(){return this;},async batch(statements){if(hook&&statements[0].text.startsWith('UPDATE gsis_edge_heads SET revision=revision+1,mode=')){const fn=hook;hook=null;await fn();}sql.exec('BEGIN');try{const values=statements.map(s=>{const q=sql.prepare(s.text);if(/^\s*(SELECT|WITH)/.test(s.text))return {success:true,results:q.all(...s.args),meta:{changes:0}};const result=q.run(...s.args);return {success:true,results:[],meta:{changes:Number(result.changes)}};});sql.exec('COMMIT');return values;}catch(error){sql.exec('ROLLBACK');throw error;}},onCommit(fn){hook=fn;}};return db;}
async function activate(db,scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'setup',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'setup',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}

const db=database(),objects=new Map(),bucket={async put(k,v){objects.set(k,new Uint8Array(v));},async get(k){const v=objects.get(k);return v?{body:new Blob([v]).stream(),text:async()=>new TextDecoder().decode(v)}:null;}};
const today=edgeRosterClock().today;let day=new Date(Date.parse(today)+86400000).toISOString().slice(0,10);while([0,6].includes(new Date(day).getUTCDay()))day=new Date(Date.parse(day)+86400000).toISOString().slice(0,10);
const people=['alice','bob','charlie'].map(id=>({id,name:id,active:true,email:id+'@gsps.edu.sg',emails:[id+'@gsps.edu.sg'],groups:['Teaching'],role:'Teacher',mobile:'65'+({alice:'91234567',bob:'92345678',charlie:'93456789'})[id],employment:'Permanent'})),who={email:people[0].email,subject:'alice'},smc={email:people[1].email,subject:'bob'};
const refs={schema:1,contacts:{rosterPeople:people,rosterSMCIds:['bob'],rosterAdminIds:['bob'],rosterUrgentSMCIds:[]},contactsCheckedAt:Date.now(),calendarCheckedAt:Date.now(),calendarByDate:{[day]:{date:day,schoolDay:true,parity:'single',available:true}}};
const model=R.validate({layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:people.map(p=>({name:p.name,cells:Array.from({length:85},()=>['','','',''])}))},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[]}),json=JSON.stringify(model),modelKey='baseline';await bucket.put(modelKey,await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_TIMETABLE_SNAPSHOTS:bucket,APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',WHATSAPP_ENABLED:'false'};
const store=await activate(db,'roster',O.initial());await activate(db,'roster-register',{revision:1,entries:[{id:'baseline',name:'test',from:today,to:'2099-12-31',priority:1,modelObject:{key:modelKey,digest:sha256Hex(json),encoding:'gzip-json-v1'}}],receipts:[]});await activate(db,'roster-references',refs);
globalThis.fetch=()=>assert.fail('D1 intake must not call Google');
async function send(input,actor=who){const response=(await edgeRosterBackend(env,'rosterOperations',input,actor,'test')).result;if(!response.ok)throw Object.assign(Error(response.error),response);return response.data;}
const command=extra=>({operation:'saveAbsence',intake:true,requestId:crypto.randomUUID(),date:day,staffId:'alice',typeId:'others',reasonDetail:'Work review',periods:[5,6],reliefRequired:false,receiptOnly:true,...extra});

const original=command();await send(original);
const input=command({periods:[6,7],reasonDetail:'Replacement'}),preview=await send({...input,operation:'read',view:'absenceClash'});
assert.equal(preview.overlaps.length,1);assert(preview.overlaps[0].reasonDetail==='Work review');
const before=(await loadEdgeRoster(env)).state;assert.equal(before.absences.filter(a=>!a.deletedAt).length,1);
const confirmed=transport.normalizeAbsenceTransportCommand(env,{...input,absenceClashToken:preview.token,confirmAbsenceReplacement:true});
assert.equal(confirmed.absenceClashToken,preview.token);assert.equal(confirmed.confirmAbsenceReplacement,true);
await transport.captureAbsenceTransport(env,who,confirmed);
const drained=await transport.dispatchAbsenceTransport(env,{limit:1,capture:async(command,identity,metadata)=>({ok:true,data:await send({...command,trustedIntakeAt:metadata.acceptedAt},identity)})});
assert.equal(drained.forwarded,1,JSON.stringify(drained));
const saved=(await loadEdgeRoster(env)).state,active=saved.absences.filter(a=>!a.deletedAt);assert.equal(active.length,1);assert.deepEqual(active[0].periods,[6,7]);assert(saved.absences.some(a=>a.deletedAt&&a.replacedByRequestId===input.requestId));
const snapshot=JSON.stringify(saved);const replay=await send(confirmed);assert(replay.replayed);assert.equal(JSON.stringify((await loadEdgeRoster(env)).state),snapshot);
const disjoint=command({periods:[8]}),disjointPreview=await send({...disjoint,operation:'read',view:'absenceClash'});assert.equal(disjointPreview.overlaps.length,0);await send({...disjoint,absenceClashToken:disjointPreview.token,confirmAbsenceReplacement:false});assert.equal((await loadEdgeRoster(env)).state.absences.filter(a=>!a.deletedAt).length,2);
const stale=command({periods:[7,8]}),oldPreview=await send({...stale,operation:'read',view:'absenceClash'});
await mutateEdgeRoster(env,{actor:smc.email,who:smc,requestId:crypto.randomUUID(),command:{operation:'currentDuty'},apply(state){state.absences.find(a=>!a.deletedAt).reasonDetail='Newer saved change';return {};}});
await assert.rejects(send({...stale,absenceClashToken:oldPreview.token,confirmAbsenceReplacement:true}),e=>e.status===409);
await assert.rejects(send({...input,operation:'read',view:'absenceClash'},{email:people[2].email,subject:'charlie'}),e=>e.status===403);
console.log('PASS actual D1 preview, durable transport, confirmed replacement, exact replay, disjoint save, stale decision and privacy; no Google calls');
const parked=transport.normalizeAbsenceTransportCommand(env,{...stale,absenceClashToken:oldPreview.token,confirmAbsenceReplacement:true});await transport.captureAbsenceTransport(env,who,parked);db.sql.prepare("UPDATE gsis_absence_transport SET state='needsReview',last_code='BACKEND_REJECTED_409',attempts=1 WHERE request_id=?").run(parked.requestId);
const ownReview=await send({operation:'read',view:'intakeReview',intakeRequestId:parked.requestId});assert.deepEqual(ownReview.resolutionOptions,['replace','keep']);assert(ownReview.replacementToken);
await assert.rejects(send({operation:'read',view:'intakeReview',intakeRequestId:parked.requestId},{email:people[2].email,subject:'charlie'}),e=>[403,404].includes(e.status));
const decision={operation:'resolveAbsenceIntake',requestId:crypto.randomUUID(),intakeRequestId:parked.requestId,resolution:'replace',overlapToken:ownReview.overlapToken,replacementToken:ownReview.replacementToken,confirm:true,reason:'Confirmed current overlapping absence'};
const resolved=await send(decision);assert.equal(resolved.absenceApplied,true);assert.equal(resolved.resolution.action,'replace');const final=JSON.stringify((await loadEdgeRoster(env)).state);assert((await send(decision)).replayed);assert.equal(JSON.stringify((await loadEdgeRoster(env)).state),final);
console.log('PASS reporter can refresh and confirm a queued stale replacement; other reporters denied; same decision replay is idempotent');
