import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),GSiSEdgeStore=require('../shared/edge-store.js');
import {GSISRosterOperations as O} from '../roster-update/public/edge-roster-domain.js';
import {edgeRosterService} from '../roster-update/public/edge-roster.js';
import {runDeployHandoffs} from '../roster-update/public/edge-deploy.js';

// Exercise production probes against real SQLite, then inspect their actual plans.
const sql=new DatabaseSync(':memory:'),trace=[];sql.exec(GSiSEdgeStore.SCHEMA);
const prepare=text=>({text,args:[],bind(...args){return {...this,args};},async first(){trace.push(this);return sql.prepare(this.text).get(...this.args)||null;},async run(){trace.push(this);return {success:true,results:[],meta:{changes:Number(sql.prepare(this.text).run(...this.args).changes)}};}});
const db={prepare,withSession(mode){assert.equal(mode,'first-primary');return this;},async batch(statements){sql.exec('BEGIN');try{const results=statements.map(statement=>{trace.push(statement);const query=sql.prepare(statement.text);return /^\s*(SELECT|WITH)/.test(statement.text)?{success:true,results:query.all(...statement.args),meta:{changes:0}}:{success:true,results:[],meta:{changes:Number(query.run(...statement.args).changes)}};});sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
async function activate(scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'fixture',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});}
const today='2026-10-26',now=Date.parse(today+'T11:01:00+08:00'),realNow=Date.now;Date.now=()=>now;
const insert=sql.prepare('INSERT OR REPLACE INTO gsis_edge_records(scope,collection,record_id,position,record_date,value_json,revision) VALUES(?,?,?,?,?,?,1)');
function row(scope,collection,id,value,position=0){insert.run(scope,collection,'id:'+id,position,value.date||'',JSON.stringify({id,...value}));}
const plan=probe=>sql.prepare('EXPLAIN QUERY PLAN '+probe.text).all(...probe.args).map(row=>row.detail);
function uses(probe,index){const details=plan(probe);assert(details.some(detail=>detail.includes('USING INDEX '+index)),details.join('\n'));return details;}
try{
 const state=O.initial(),checkpoint=require('../shared/roster-allocation.js').quotaCheckpoint({now});state.quotaCheckpoints={[checkpoint.week]:{...checkpoint,status:'ready',captured:0,at:new Date(now).toISOString()}};await activate('roster',state);await activate('deploy',{jobs:{},properties:{}});
 for(let i=0;i<2000;i++){
  row('roster','audit','audit-'+i,{date:today});
  row('roster','edgePeerProposals','peer-'+i,{status:'applied'},i);
  row('roster','edgeInstructionDrafts','instruction-'+i,{status:'needsReview'},i);
  row('roster','acknowledgements','ack-'+i,{snapshotId:'historic-'+i});
  row('deploy','jobs','job-'+i,{state:'complete',input:{payload:'retained payload'}});
 }
 const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',DEPLOY_EDGE_AUTHORITY:'d1'};
 trace.length=0;assert.equal((await edgeRosterService(env,{operation:'scheduledRoster',scheduledTime:now})).idle,true);
 const config=trace.find(probe=>probe.text.includes("collection='systemConfig'"));assert(config,'production config probe is captured');
 const configPlan=plan(config);assert(!configPlan.some(detail=>/\(scope=\?\)$/.test(detail)),configPlan.join('\n'));assert(configPlan.filter(detail=>detail.includes('(scope=? AND collection=? AND record_id=?)')).length>=4,configPlan.join('\n'));
 const scheduled=trace.find(probe=>probe.text.includes(' reminders,'));assert(scheduled,'production reminder probe is captured');uses(scheduled,'gsis_edge_ack_snapshot');
 row('roster','publicationSnapshots','upcoming',{date:today,kind:'assigned',assignment:{date:today,timeStart:'11:10'}});assert.equal(sql.prepare(scheduled.text).get(...scheduled.args).reminders,1);
 row('roster','acknowledgements','current-ack',{snapshotId:'upcoming'});assert.equal(sql.prepare(scheduled.text).get(...scheduled.args).reminders,0,'current acknowledgement remains visible');
 trace.length=0;const proposals=await edgeRosterService(env,{operation:'processEdgePeerProposals'});assert.equal(proposals.pending,0);assert.equal(proposals.instructions.pending,0);
 const pending=trace.filter(probe=>probe.text.includes("json_extract(value_json,'$.status')='pending'"));assert.equal(pending.length,2);
 for(const probe of pending){const details=uses(probe,'gsis_edge_pending_service');assert(!details.some(detail=>detail.includes('TEMP B-TREE')),details.join('\n'));const collection=probe.args[0];for(const position of [9,3,7,1])row('roster',collection,'pending-'+position,{status:'pending'},position);assert.deepEqual(sql.prepare(probe.text).all(...probe.args).map(result=>JSON.parse(result.value_json).id),['pending-1','pending-3','pending-7'],'pending order and bound are unchanged');}
 trace.length=0;await runDeployHandoffs(env,{email:'fixture@example.test'});
 const deploy=trace.find(probe=>probe.text.includes('handoff_schedule_json'));uses(deploy,'gsis_edge_pending_handoffs');assert.equal(sql.prepare(deploy.text).all(...deploy.args).length,0);
 row('deploy','jobs','new',{state:'pending',input:{privatePayload:'must stay in D1'}});row('deploy','jobs','expired',{state:'running',leaseUntil:now-1});
 const active=sql.prepare(deploy.text).all(...deploy.args).map(result=>JSON.parse(result.handoff_schedule_json));assert.deepEqual(active.map(item=>item.id).sort(),['expired','new']);assert(active.every(item=>!('input' in item)),'payload projection remains small');
 console.log('PASS production idle probe plans: exact config keys, indexed pending proposals/drafts/handoffs and acknowledgement lookup with 10,000 retained rows; active recovery and ordering preserved.');
}finally{Date.now=realNow;sql.close();}
