import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {runDeployHandoffs} from '../roster-update/public/edge-deploy.js';

const identity={email:'admin@school.test',subject:'handoff-test'};
const job=(id,overrides={})=>({id,kind:'contactsCatalogue',input:{revision:id,payload:'large-payload-'.repeat(10000)},identity,state:'pending',publicationRevision:1,createdAt:'2026-01-01T00:00:00Z',...overrides});
async function fixture(jobs={},properties={}){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 const events=[],sessions=[];let afterPreflight=null,failPreflight=false;
 const prepare=text=>({text,args:[],bind(...args){return {...this,args};},async first(){events.push({text:this.text,kind:'read'});return sql.prepare(this.text).get(...this.args)||null;},async run(){events.push({text:this.text,kind:'write'});const result=sql.prepare(this.text).run(...this.args);return {success:true,results:[],meta:{changes:Number(result.changes)}};}});
 const db={prepare,withSession(mode){sessions.push(mode);return this;},async batch(statements){
  const preflight=statements.some(s=>/handoff_schedule_json/.test(s.text));if(preflight&&failPreflight)return statements.map(()=>({success:false,results:[]}));
  sql.exec('BEGIN');try{const results=statements.map(s=>{const read=/^\s*(SELECT|WITH)/.test(s.text),query=sql.prepare(s.text);events.push({text:s.text,kind:read?'read':'write'});if(read){const results=query.all(...s.args);events.at(-1).bytes=JSON.stringify(results);return {success:true,results,meta:{changes:0}};}const result=query.run(...s.args);return {success:true,results:[],meta:{changes:Number(result.changes)}};});sql.exec('COMMIT');if(preflight&&afterPreflight){const hook=afterPreflight;afterPreflight=null;hook();}return results;}catch(error){sql.exec('ROLLBACK');throw error;}
 }};
 const store=GSiSEdgeStore.open(db,'deploy'),state={index:{versions:[],active:null,published:null,publicationSchema:1,revision:0,requests:[]},drafts:{},publications:{},receipts:{},deltas:{},leases:{},properties,jobs};
 const imported=await store.importState({state,actor:identity.email,requestId:crypto.randomUUID(),source:{test:true}});
 await store.transition({from:'imported',to:'active',expectedRevision:imported.revision,actor:identity.email,proof:{legacyWritesDisabled:true,sourceDigest:imported.sourceDigest,verifiedRecords:imported.importedRecords}});
 const env={GSIS_JOBS:db,DEPLOY_EDGE_AUTHORITY:'d1',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',BRIDGE_SECRET:'x'.repeat(32)};
 const reset=()=>{events.length=0;sessions.length=0;};reset();
 return {sql,db,store,env,events,sessions,reset,setAfterPreflight(fn){afterPreflight=fn;},setFailPreflight(){failPreflight=true;},close:()=>sql.close()};
}
const broadReads=f=>f.events.filter(e=>/SELECT (?:r\.)?collection,(?:r\.)?record_id/.test(e.text));
function assertIdle(f,label){assert.equal(broadReads(f).length,0,label+': no index/jobs/properties hydration');assert.equal(f.events.filter(e=>e.kind==='write').length,0,label+': no writes');assert(f.sessions.length>0&&f.sessions.every(s=>s==='first-primary'),label+': fresh primary read');assert(!f.events.some(e=>e.bytes?.includes('large-payload-')),label+': no job payload reaches Worker');}
const oldFetch=globalThis.fetch,delivered=[];globalThis.fetch=async(_,options)=>{const request=JSON.parse(JSON.parse(options.body).payload);assert.equal(request.input.operation,'contacts');assert.equal(request.input.contactAction,'applyDeployCatalogues');delivered.push(request.input.contactInput.revision);return Response.json({ok:true,data:{saved:true}});};
try{
 for(const [label,jobs,properties] of [
  ['empty',{},{}],
  ['completed',{done:job('done',{state:'complete'})},{}],
  ['future',{future:job('future',{nextAttemptAt:new Date(Date.now()+3600000).toISOString()})},{}],
  ['oldest backoff blocks newer',{old:job('old',{publicationRevision:1,nextAttemptAt:new Date(Date.now()+3600000).toISOString()}),new:job('new',{publicationRevision:2})},{}],
  ['running lease',{running:job('running',{state:'running',leaseUntil:Date.now()+3600000})},{}],
  ['global lease',{pending:job('pending')},{HANDOFF_LEASE:{claim:'another-run',until:Date.now()+3600000}}]
 ]){const f=await fixture(jobs,properties);try{await runDeployHandoffs(f.env,identity);assertIdle(f,label);}finally{f.close();}}
 assert.deepEqual(delivered,[],'idle ticks call no integration');
 const f=await fixture({new:job('new',{publicationRevision:2}),old:job('old',{publicationRevision:1,state:'running',leaseUntil:Date.now()-1}),later:job('later',{publicationRevision:3})});
 try{await runDeployHandoffs(f.env,identity);assert.deepEqual(delivered,['old','new','later'],'due jobs retain publication ordering and expired lease recovery');const state=(await f.store.load()).state;assert(Object.values(state.jobs).every(j=>j.state==='complete'));assert.equal(state.properties.HANDOFF_LEASE,undefined,'global lease is released');}finally{f.close();}
 const priority=await fixture({a:job('a'),b:job('b'),c:job('c'),d:job('d'),fence:job('fence',{kind:'venuesFence',publicationRevision:99,input:{requestId:'fence',revision:'test'}})});
 try{await runDeployHandoffs(priority.env,identity);const state=(await priority.store.load()).state;assert.equal(state.jobs.fence.state,'complete','venue fence keeps priority over older publications');assert.equal(state.jobs.d.state,'pending','existing batch bound stays at four jobs');}finally{priority.close();}
 const paused=await fixture({pending:job('pending')});try{paused.sql.prepare("UPDATE gsis_edge_heads SET mode='paused' WHERE scope='deploy'").run();await runDeployHandoffs(paused.env,identity);assertIdle(paused,'paused authority');}finally{paused.close();}
 const race=await fixture({pending:job('pending')});try{const count=delivered.length;race.setAfterPreflight(()=>race.sql.prepare("UPDATE gsis_edge_heads SET mode='paused' WHERE scope='deploy'").run());await runDeployHandoffs(race.env,identity);assert.equal(delivered.length,count,'authority is rechecked after the advisory preflight');assert.equal(race.events.filter(e=>e.kind==='write').length,0);}finally{race.close();}
 const failure=await fixture();try{failure.setFailPreflight();await assert.rejects(runDeployHandoffs(failure.env,identity),e=>e.status===503&&e.code==='EDGE_STORAGE','failed metadata reads are not treated as idle');}finally{failure.close();}
 console.log('PASS Deploy cron preflight: primary metadata-only idle checks, backoff ordering, both leases, due processing, fence priority, batch bound, authority recheck and storage errors.');
}finally{globalThis.fetch=oldFetch;}
