import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {edgeRosterBackend,loadEdgeRoster,edgeRosterClock} from '../roster-update/public/edge-roster.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
import {GSISRosterOperations as O,GSISRoster as R} from '../roster-update/public/edge-roster-domain.js';
const S=createRequire(import.meta.url)('../shared/roster-stapler.js');
function database(){const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');let hook=null;const prepare=text=>({text,args:[],bind(...args){return {...this,args};},async first(){return sql.prepare(this.text).get(...this.args)||null;},async all(){return {success:true,results:sql.prepare(this.text).all(...this.args),meta:{changes:0}};},async run(){const result=sql.prepare(this.text).run(...this.args);return {success:true,results:[],meta:{changes:Number(result.changes)}};}});const db={sql,prepare,withSession(){return this;},async batch(statements){if(hook&&statements[0].text.startsWith('UPDATE gsis_edge_heads SET revision=revision+1,mode=')){const fn=hook;hook=null;await fn();}sql.exec('BEGIN');try{const values=statements.map(s=>{const q=sql.prepare(s.text);if(/^\s*(SELECT|WITH)/.test(s.text))return {success:true,results:q.all(...s.args),meta:{changes:0}};const result=q.run(...s.args);return {success:true,results:[],meta:{changes:Number(result.changes)}};});sql.exec('COMMIT');return values;}catch(error){sql.exec('ROLLBACK');throw error;}},onCommit(fn){hook=fn;}};return db;}
async function activate(db,scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'setup',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'setup',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}

const db=database(),objects=new Map(),reads=[];
const bucket={async put(key,value){objects.set(key,new Uint8Array(value));},async get(key){reads.push(key);const value=objects.get(key);return value?{body:new Blob([value]).stream(),text:async()=>new TextDecoder().decode(value)}:null;}};
let date=new Date(Date.parse(edgeRosterClock().today)+86400000).toISOString().slice(0,10);while([0,6].includes(new Date(date).getUTCDay()))date=new Date(Date.parse(date)+86400000).toISOString().slice(0,10);
const who={email:'alice@gsps.edu.sg',subject:'alice'},people=['Alice','Bob'].map((name,i)=>({id:name.toLowerCase(),name,active:true,email:name.toLowerCase()+'@gsps.edu.sg',emails:[name.toLowerCase()+'@gsps.edu.sg'],groups:['Teaching'],role:'Teacher',adhocEligible:true,mobile:'659123456'+i,employment:'Permanent'}));
const blank=()=>Array.from({length:85},()=>['','','','']),alice=blank();for(let i=0;i<5;i++)alice[i*17+2]=['EL','4A','Room 1',''];
const model=R.validate({layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:[{name:'Alice',cells:alice},{name:'Bob',cells:blank()}]},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[]});
const modelJson=JSON.stringify(model);await bucket.put('origin-model',await new Response(new Blob([modelJson]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const periods=Array.from({length:17},(_,period)=>({period,startMinutes:420+30*period,endMinutes:450+30*period})),teachers=people.map((p,i)=>({staffId:p.id,name:p.name,cells:(i?blank():alice).slice(0,17),R:4}));
const plan=S.create({id:'origin',date,parity:'single',schoolDay:true,verified:true,periods,teachers},{date});delete plan.daySnapshot;delete plan.id;
const planJson=JSON.stringify(plan);await bucket.put('old-plan',await new Response(new Blob([planJson]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const state=O.initial();state.staplerPlans.push({date,baselineId:'origin',revision:1,confirmed:true,draft:{edgeObject:true,key:'old-plan',digest:sha256Hex(planJson),encoding:'gzip-json-v1'}});
const roster=await activate(db,'roster',state),register=await activate(db,'roster-register',{revision:1,entries:[{id:'origin',from:date,to:date,priority:2,pruned:true,modelObject:{key:'origin-model',digest:sha256Hex(modelJson),encoding:'gzip-json-v1'}}],receipts:[]});
await activate(db,'roster-references',{schema:1,contacts:{rosterPeople:people,rosterSMCIds:['alice'],rosterAdminIds:['alice'],rosterUrgentSMCIds:['alice']},contactsCheckedAt:Date.now(),calendarCheckedAt:Date.now(),calendarByDate:{[date]:{date,schoolDay:true,parity:'single',available:true}}});
const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_TIMETABLE_SNAPSHOTS:bucket,ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',WHATSAPP_ENABLED:'false'};globalThis.fetch=()=>assert.fail('No Google call is allowed');
const send=async input=>{const reply=(await edgeRosterBackend(env,'rosterOperations',input,who,'test')).result;assert.equal(reply.ok,true,JSON.stringify(reply));return reply.data;};
const before=await roster.head(),preview=await send({operation:'previewStaplerMigration',date});assert.equal(preview.needed,1);assert.equal(preview.ready,true);assert.match(preview.digest,/^[a-f0-9]{64}$/);assert.equal((await roster.head()).revision,before.revision);assert(reads.includes('origin-model'));assert(reads.includes('old-plan'));
const command={operation:'migrateStaplerPlans',date,view:'timetableReview',requestId:crypto.randomUUID(),previewDigest:preview.digest},applied=await send(command);assert.equal(applied.migrated,1);assert(applied.affectedDomains.includes('suspended'));assert.deepEqual(applied.affectedDates,[date]);assert.equal((await send(command)).replayed,true);
const migrated=await loadEdgeRoster(env,{hydrate:true,dates:[date]});assert(S.hasDaySnapshot(migrated.state.staplerPlans[0].draft));assert.notEqual(migrated.state.staplerPlans[0].draft.id,'origin');
reads.length=0;const after=await roster.head(),again=await send({operation:'previewStaplerMigration',date});assert.equal(again.needed,0);assert.equal(reads.includes('origin-model'),false);assert.equal((await roster.head()).revision,after.revision);
const rerun=await send({...command,requestId:crypto.randomUUID(),previewDigest:again.digest});assert.equal(rerun.migrated,0);
objects.delete('origin-model');reads.length=0;
const saved=JSON.stringify((await loadEdgeRoster(env)).state.staplerPlans);
for(let n=0;n<20;n++){const result=await send({operation:'read',view:'report',compact:true,date});assert.equal(result.timetable.id,S.planId(plan));assert.equal(result.timetable.teachers.find(t=>t.staffId==='alice').cells[2][0],'EL');}
assert.equal(reads.includes('origin-model'),false);assert.equal(JSON.stringify((await loadEdgeRoster(env)).state.staplerPlans),saved);
console.log('PASS real D1/R2 dry-run purity, exact pruned origin, digest apply, receipt replay, migration no-op and twenty baseline-free reloads');
