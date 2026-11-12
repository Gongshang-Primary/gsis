import Q from '../shared/edge-command-queue.js';
import {QueueStore} from './store.js';
import {ProjectionCache} from './cache.js';
import {deployAdapter} from './deploy-adapter.js';
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function boundedJSON(request){
 const reader=request.body?.getReader();if(!reader)Q.fail(400,'QUEUE_BODY');const chunks=[];let bytes=0;
 try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;if(bytes>Q.LIMITS.payload+Q.LIMITS.envelope)Q.fail(413,'COMMAND_SIZE');chunks.push(r.value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
 const all=new Uint8Array(bytes);let at=0;for(const x of chunks){all.set(x,at);at+=x.byteLength;}return Q.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
}
export class CommandService {
 constructor(env,{clock=()=>Date.now(),google,adapter=deployAdapter}={}){this.env=env;this.clock=clock;this.adapter=adapter;this.google=google||(input=>adapter.google(env,input));this.store=new QueueStore(env[adapter.binding],adapter.app,clock,adapter);this.cache=new ProjectionCache(this.store,env.GSIS_SECRET);}
 async grant(signed,actor,action){const g=await Q.verify(signed,this.env.GSIS_SECRET,'edge-command-google-role-v1',this.clock());if(g.app!==this.adapter.app||g.document!==this.adapter.document||g.actorSubject!==actor?.subject||g.actorEmail!==actor?.email||!Number.isFinite(g.expiresAt)||g.expiresAt<=this.clock()||g.expiresAt<=g.timestamp||g.expiresAt-g.timestamp>60000||typeof g.admin!=='boolean'||!Array.isArray(g.actions)||g.actions.some(a=>!this.adapter.actions.includes(a))||typeof g.authRevision!=='string'||!g.authRevision||g.authRevision.length>256||action&&!g.actions?.includes(action))Q.fail(403,'QUEUE_ROLE_OBSERVATION');return g;}
 async authenticate(request){
  if(request.method!=='POST'||new URL(request.url).pathname!=='/commands')Q.fail(404,'QUEUE_ROUTE');
  const envelope=await boundedJSON(request),r=await Q.verify(envelope,this.env.GSIS_SECRET,Q.GATEWAY,this.clock());
  if(r.app!==this.adapter.app||r.document!==this.adapter.document||!r.actor||Object.keys(r).some(k=>!['purpose','timestamp','nonce','app','document','kind','actor','grant','command','configGeneration','requestId','cursor','configuration','projection','currentManifest','cancelQueued','decision','shadowObservation'].includes(k)))Q.fail(400,'QUEUE_ENVELOPE_SCHEMA');
  const grant=await this.grant(r.grant,r.actor,r.kind==='enqueue'?r.command?.action:null);if(typeof r.actor.subject!=='string'||r.actor.subject.length>240||! /^[^@\s]+@gsps\.edu\.sg$/.test(r.actor.email||'')||Object.keys(r.actor).some(k=>!['email','subject'].includes(k)))Q.fail(403,'QUEUE_ACTOR');await this.store.nonce(Q.GATEWAY,r.nonce);if(['health','export','switchBack','archive'].includes(r.kind)){if(!grant.admin)Q.fail(403,'QUEUE_ADMIN');const audit=await this.store.sql('INSERT INTO edge_admin_audit(app,request_id,actor_key,action,at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM edge_admin_audit WHERE app=?)<100000 RETURNING request_id',this.adapter.app,r.nonce,r.actor.subject,r.kind,this.clock(),this.adapter.app).all();if(!audit.results?.length)Q.fail(503,'QUEUE_ADMIN_AUDIT_CAPACITY');}return {r,grant};
 }
 async googleDecision(job,kind){
  const command={app:this.adapter.app,document:job.document_key,requestId:job.request_id,issuedAt:job.issued_at,actor:JSON.parse(job.actor_json),action:job.action,schemaVersion:job.schema_version,expectedRevision:JSON.parse(job.expected_revision_json),payload:JSON.parse(job.payload_json)};
  const signed=await this.google({kind,actor:command.actor,requestId:command.requestId,command,configGeneration:job.config_generation,fence:job.fence,delivery:'queued'}),d=await Q.verify(signed,this.env.GSIS_SECRET,'edge-command-google-result-v1',this.clock());
  if(d.app!==this.adapter.app||d.document!==job.document_key||d.requestId!==job.request_id)Q.fail(503,'QUEUE_GOOGLE_RESULT');
  return ['APPLIED','REJECTED','CANCELLED'].includes(d.decision)?await Q.decisionProof(d):null;
 }
 async drain(){
  const job=await this.store.claim();if(!job){await this.store.alert();return {claimed:false};}
  let decision=null,failed=false;try{decision=await this.googleDecision(job,job.state==='RUNNING'?'execute':'status');}catch{failed=true;}
  const settled=await this.store.settle(job,decision,failed);await this.store.alert();
  if(settled?.state==='APPLIED')try{const actor=JSON.parse(job.actor_json),versionId=JSON.parse(job.payload_json).versionId,signed=await this.google({kind:'observe',actor,versionId}),grant=await this.grant(signed,actor);await this.projection(actor,grant,versionId);}catch{/* Primary receipt remains applied and cache stays invalidated. */}
  // Invalidation happens atomically with APPLIED. A refresh failure cannot undo it.
  return {claimed:true,state:settled?.state||'CHECKING',requestId:job.request_id};
 }
 async projection(actor,grant,versionId){
  await this.store.mirror(grant.config);const token=crypto.randomUUID(),now=this.clock();
  const lease=await this.store.sql('UPDATE edge_scopes SET refresh_token=?,refresh_until=?,refresh_generation=refresh_generation+1,last_used=? WHERE app=? AND document_key=? AND refresh_until<=? RETURNING high_water,refresh_generation',token,now+35000,now,this.adapter.app,this.adapter.document,now).first();
  if(!lease)Q.fail(503,'QUEUE_REFRESH_IN_PROGRESS');
  try{
   const projection=await this.google({kind:'projection',actor,versionId,refreshGeneration:lease.refresh_generation});
   await this.cache.put(projection.manifest,projection.data,grant,lease.high_water);
   const cached=await this.cache.read(grant,projection.manifest);return cached.mode==='verified'?cached:{mode:'direct',data:projection.data,asOf:this.clock(),googleRevision:(await Q.verify(projection.manifest,this.env.GSIS_SECRET,'edge-command-google-projection-v1',this.clock())).googleRevision};
  }finally{await this.store.sql('UPDATE edge_scopes SET refresh_token=NULL,refresh_until=0 WHERE app=? AND document_key=? AND refresh_token=?',this.adapter.app,this.adapter.document,token).run();}
 }
 async refreshDue(){
  const scope=await this.store.scope();if(!scope||this.clock()-scope.last_used>900000)return {refreshed:0};
  const rows=await this.store.rows('SELECT manifest_json FROM edge_cache WHERE app=? AND (stale=1 OR verified_at<=?) LIMIT 20',this.adapter.app,this.clock()-300000);let refreshed=0;
  for(const row of rows)try{const m=await Q.verify(JSON.parse(row.manifest_json),this.env.GSIS_SECRET,'edge-command-google-projection-v1',JSON.parse(JSON.parse(row.manifest_json).payload).timestamp);const signed=await this.google({kind:'observe',actor:m.actor,versionId:m.googleRevision.versionId}),grant=await this.grant(signed,m.actor);await this.projection(m.actor,grant,m.googleRevision.versionId);refreshed++;}catch{/* Keep stale evidence and direct reads; never erase on refresh error. */}
  return {refreshed};
 }
 async archive(actor,grant){
  if(!grant.admin)Q.fail(403,'QUEUE_ADMIN');
  const row=await this.store.first("SELECT * FROM edge_jobs j WHERE app=? AND state IN ('APPLIED','REJECTED') AND created_at<=? AND NOT EXISTS(SELECT 1 FROM edge_job_steps s WHERE s.app=j.app AND s.parent_request_id=j.request_id AND s.state NOT IN ('complete','not_required','APPLIED','REJECTED','CANCELLED')) ORDER BY sequence LIMIT 1",this.adapter.app,this.clock()-30*86400000);if(!row)return {archived:0};
  const events=await this.store.rows('SELECT * FROM edge_job_events WHERE app=? AND request_id=?',this.adapter.app,row.request_id),steps=await this.store.rows('SELECT * FROM edge_job_steps WHERE app=? AND parent_request_id=?',this.adapter.app,row.request_id),archive={schema:1,app:this.adapter.app,jobs:[row],events,steps,scope:await this.store.scope()},signed=await this.google({kind:'archive',actor,archive}),ack=await Q.verify(signed,this.env.GSIS_SECRET,'edge-command-google-archive-v1',this.clock());
  if(ack.app!==this.adapter.app||ack.document!==this.adapter.document||!ack.fileId||ack.exportDigest!==await Q.digest(archive)||!Number.isFinite(ack.createdAt)||Math.abs(ack.createdAt-ack.timestamp)>60000||ack.retainedUntil<ack.createdAt+365*86400000||ack.records?.length!==1||ack.records[0].requestId!==row.request_id||ack.records[0].version!==row.version||ack.records[0].digest!==await Q.digest(row))Q.fail(409,'QUEUE_EXPORT_ACK');
  const receipt=await this.store.receipt(row),binding=JSON.parse(row.binding_json);delete binding.payload;const decision=JSON.parse(row.receipt_json);
  const out=await this.store.db.batch([
   this.store.sql("UPDATE edge_jobs SET exported_version=version WHERE app=? AND request_id=? AND version=? AND state IN ('APPLIED','REJECTED')",this.adapter.app,row.request_id,row.version),
   this.store.sql(`INSERT INTO edge_receipt_index(app,request_id,document_key,actor_key,action,schema_version,binding_json,payload_hash,receipt_json,decision_digest,google_reference,export_version,export_digest,created_at) SELECT app,request_id,document_key,actor_key,action,schema_version,?,payload_hash,?,?,?,?,?,created_at FROM edge_jobs WHERE app=? AND request_id=? AND version=? AND exported_version=version AND (SELECT COUNT(*) FROM edge_receipt_index WHERE app=?)<? ON CONFLICT DO NOTHING`,Q.canonical(binding),Q.canonical(JSON.parse(JSON.stringify(receipt))),decision.primaryDigest||decision.digest,decision.reference,row.version,ack.exportDigest,this.adapter.app,row.request_id,row.version,this.adapter.app,Q.LIMITS.receipts),
   this.store.sql('DELETE FROM edge_jobs WHERE app=? AND request_id=? AND version=? AND exported_version=version AND EXISTS(SELECT 1 FROM edge_receipt_index i WHERE i.app=edge_jobs.app AND i.request_id=edge_jobs.request_id AND i.export_version=edge_jobs.version AND i.payload_hash=edge_jobs.payload_hash) RETURNING request_id',this.adapter.app,row.request_id,row.version),
   this.store.sql('DELETE FROM edge_job_events WHERE app=? AND request_id=? AND NOT EXISTS(SELECT 1 FROM edge_jobs WHERE app=? AND request_id=?)',this.adapter.app,row.request_id,this.adapter.app,row.request_id),
   this.store.sql('DELETE FROM edge_job_steps WHERE app=? AND parent_request_id=? AND NOT EXISTS(SELECT 1 FROM edge_jobs WHERE app=? AND request_id=?)',this.adapter.app,row.request_id,this.adapter.app,row.request_id)
  ]);return {archived:out[2].results?.length||0,reference:ack.fileId,digest:ack.exportDigest};
 }
 async switchBack(actor,grant,cancelQueued=false){
  if(!grant.admin)Q.fail(403,'QUEUE_ADMIN');let config=grant.config;
  if(!config.admissionPaused||!config.dispatchPaused){const signed=await this.google({kind:'configure',actor,configuration:{mode:config.mode,generation:config.generation,admissionPaused:true,dispatchPaused:true}});config=await Q.verify(signed,this.env.GSIS_SECRET,'edge-command-google-config-v1',this.clock());}
  await this.store.mirror(config);
  const identities=`WITH identities AS (
   SELECT app,document_key,request_id,actor_key,payload_hash,receipt_json,version AS row_version,state,issued_at,actor_json,action,schema_version,expected_revision_json,payload_json FROM edge_jobs WHERE app=?
   UNION ALL SELECT app,document_key,request_id,actor_key,payload_hash,receipt_json,export_version AS row_version,NULL,NULL,NULL,action,schema_version,NULL,NULL FROM edge_receipt_index WHERE app=? ) `;
  const rows=await this.store.rows(identities+`SELECT i.* FROM identities i LEFT JOIN edge_reconciliation r ON r.app=i.app AND r.document_key=i.document_key AND r.request_id=i.request_id
   WHERE r.config_generation IS NULL OR r.config_generation!=? OR r.row_version!=i.row_version OR r.status!='VERIFIED'
   ORDER BY CASE WHEN r.config_generation IS NULL OR r.config_generation!=? OR r.row_version!=i.row_version THEN 0 ELSE 1 END,COALESCE(r.checked_at,0),i.request_id LIMIT ${cancelQueued?1:10}`,this.adapter.app,this.adapter.app,config.generation,config.generation);
  const evidence=[],held=[];let statusBatch=null;try{if(rows.length){const signed=await this.google({kind:'statusBatch',actor,requestIds:rows.map(r=>r.request_id)});statusBatch=await Q.verify(signed,this.env.GSIS_SECRET,'edge-command-google-status-batch-v1',this.clock());if(statusBatch.app!==this.adapter.app||statusBatch.document!==this.adapter.document||statusBatch.generation!==config.generation||!Array.isArray(statusBatch.decisions)||statusBatch.decisions.length!==rows.length)statusBatch=null;}}catch{/* This bounded page remains held; no missing response authorizes execution. */}
  for(const row of rows){let status='HELD',record;
   try{
    let signed,d=statusBatch?.decisions.find(d=>d.requestId===row.request_id);if(!d)Q.fail(503,'QUEUE_RECONCILIATION_STATUS');
    if(d.decision==='UNKNOWN'&&cancelQueued&&row.state==='QUEUED'){const command={app:this.adapter.app,document:row.document_key,requestId:row.request_id,issuedAt:row.issued_at,actor:JSON.parse(row.actor_json),action:row.action,schemaVersion:row.schema_version,expectedRevision:JSON.parse(row.expected_revision_json),payload:JSON.parse(row.payload_json)};signed=await this.google({kind:'cancel',actor,command});d=await Q.verify(signed,this.env.GSIS_SECRET,'edge-command-google-result-v1',this.clock());}
    await Q.decisionProof(d);const previous=row.receipt_json?JSON.parse(row.receipt_json):null;
    if(d.app!==this.adapter.app||d.document!==row.document_key||d.requestId!==row.request_id||d.payloadHash!==row.payload_hash||d.actorSubject!==row.actor_key||previous?.primaryDigest&&previous.primaryDigest!==d.primaryDigest||previous?.decisionDigest&&previous.decisionDigest!==d.primaryDigest||previous?.reference&&previous.reference!==d.reference)Q.fail(409,'QUEUE_RECONCILIATION_IDENTITY');
    const updated=await this.store.reconcileTerminal(row,d);row.row_version=updated.state?updated.version:updated.export_version;
    record={requestId:row.request_id,decision:d.decision,reference:d.reference,digest:d.primaryDigest,revision:d.afterRevision||null};evidence.push(record);status='VERIFIED';
   }catch{record={requestId:row.request_id,code:'GOOGLE_EVIDENCE_REQUIRED'};held.push(record);}
   await this.store.sql('INSERT INTO edge_reconciliation(app,document_key,request_id,config_generation,row_version,status,checked_at,evidence_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(app,document_key,request_id) DO UPDATE SET config_generation=excluded.config_generation,row_version=excluded.row_version,status=excluded.status,checked_at=excluded.checked_at,evidence_json=excluded.evidence_json',this.adapter.app,row.document_key,row.request_id,config.generation,row.row_version,status,this.clock(),Q.canonical(record)).run();
  }
  const counts=await this.store.first(identities+`SELECT COUNT(*) AS total,SUM(CASE WHEN r.config_generation=? AND r.row_version=i.row_version AND r.status='VERIFIED' THEN 1 ELSE 0 END) AS verified FROM identities i LEFT JOIN edge_reconciliation r ON r.app=i.app AND r.document_key=i.document_key AND r.request_id=i.request_id`,this.adapter.app,this.adapter.app,config.generation);
  const manifest={app:this.adapter.app,generation:config.generation,evidence,held,total:counts.total,verified:counts.verified||0,allClear:counts.total===(counts.verified||0),paused:true};
  if(manifest.allClear){const signed=await this.google({kind:'configure',actor,configuration:{mode:'direct',generation:config.generation,admissionPaused:true,dispatchPaused:true,requireResolved:true}}),direct=await Q.verify(signed,this.env.GSIS_SECRET,'edge-command-google-config-v1',this.clock());await this.store.mirror(direct);manifest.generation=direct.generation;await this.store.sql('UPDATE edge_scopes SET last_reconciled=? WHERE app=? AND document_key=?',this.clock(),this.adapter.app,this.adapter.document).run();}
  return {...manifest,digest:await Q.digest(manifest)};
 }
 async fetch(request){
  try{
   const {r,grant}=await this.authenticate(request);let data;
   if(r.kind==='enqueue'){
    if(r.command?.actor?.subject!==r.actor.subject||r.command?.actor?.email!==r.actor.email)Q.fail(403,'QUEUE_ACTOR');Q.command(r.command,this.adapter);this.adapter.authorize(r.command,grant);const existing=await this.store.lookup(r.command.requestId);if(existing){const receipt=await this.store.enqueue(r.command,r.configGeneration);return response({ok:true,data:receipt},receipt.state==='QUEUED'?202:200);}await this.store.mirror(grant.config);
    if(r.configGeneration!==grant.config.generation)Q.fail(409,'QUEUE_CONFIG_GENERATION');data=await this.store.enqueue(r.command,r.configGeneration);return response({ok:true,data},data.state==='QUEUED'?202:200);
   }
   if(r.kind==='status')data=await this.store.privateReceipt(r.requestId,r.actor.subject);
   else if(r.kind==='list')data=await this.store.list(r.actor.subject,r.cursor||0);
   else if(r.kind==='check')data=await this.store.check(r.requestId,r.actor.subject);
   else if(r.kind==='steps'){const d=await Q.verify(r.decision,this.env.GSIS_SECRET,'edge-command-google-result-v1',this.clock());await Q.decisionProof(d);if(d.actorSubject!==r.actor.subject)Q.fail(403,'QUEUE_ACTOR');await this.store.refreshSteps(d);data={refreshed:true};}
   else if(r.kind==='directApplied'){const d=await Q.verify(r.decision,this.env.GSIS_SECRET,'edge-command-google-result-v1',this.clock());await Q.decisionProof(d);if(d.decision!=='APPLIED'||d.app!==this.adapter.app||d.document!==this.adapter.document||d.actorSubject!==r.actor.subject||d.requestId!==r.requestId)Q.fail(403,'QUEUE_DECISION_MISMATCH');await this.store.mirror(grant.config);await this.store.stale();data={invalidated:true};}
   else if(r.kind==='health'){if(!grant.admin)Q.fail(403,'QUEUE_ADMIN');await this.store.mirror(grant.config);await this.store.alert();data={...await this.store.health(),alert:(await this.store.scope())?.alert_incident?{code:'QUEUE_ADMIN_REVIEW',incident:(await this.store.scope()).alert_incident}:null};}
   else if(r.kind==='shadow'){const projected=await this.projection(r.actor,grant,r.projection?.versionId||''),digest=await Q.digest(Q.shadowProjection(projected.data)),observed=r.shadowObservation;if(!observed||!Number.isSafeInteger(observed.revision)||! /^[a-f0-9]{64}$/.test(observed.digest||''))Q.fail(400,'QUEUE_SHADOW_SCHEMA');const result=observed.revision!==projected.data.revision?'different_revision':digest===observed.digest?'equal':'different_content';await this.store.sql('UPDATE edge_scopes SET shadow_at=?,shadow_result=? WHERE app=? AND document_key=?',this.clock(),result,this.adapter.app,this.adapter.document).run();data={compared:true,result};}
   else if(r.kind==='projection')data=await this.projection(r.actor,grant,r.projection?.versionId||'');
   else if(r.kind==='archive')data=await this.archive(r.actor,grant);
   else if(r.kind==='switchBack')data=await this.switchBack(r.actor,grant,r.cancelQueued===true);
   else if(r.kind==='export'){if(!grant.admin)Q.fail(403,'QUEUE_ADMIN');const rows=await this.store.rows('SELECT * FROM edge_jobs WHERE app=? AND sequence>? ORDER BY sequence LIMIT 10',this.adapter.app,r.cursor||0),events=[],steps=[];for(const row of rows){events.push(...await this.store.rows('SELECT * FROM edge_job_events WHERE app=? AND request_id=?',this.adapter.app,row.request_id));steps.push(...await this.store.rows('SELECT * FROM edge_job_steps WHERE app=? AND parent_request_id=?',this.adapter.app,row.request_id));}data={schema:1,app:this.adapter.app,at:this.clock(),scope:await this.store.scope(),jobs:rows,events,steps,cursor:rows.length===10?rows.at(-1).sequence:null};data.digest=await Q.digest(data);}
   else Q.fail(404,'QUEUE_OPERATION');
   return response({ok:true,data});
  }catch(e){return response({ok:false,code:e.code||'QUEUE_UNAVAILABLE',saved:false},[400,401,403,404,409,413,429,503].includes(e.status)?e.status:503);}
 }
}
export default {
 async fetch(request,env,context){try{Q.secret(env.GSIS_SECRET);const service=new CommandService(env),res=await service.fetch(request);if(res.status===202&&context?.waitUntil)context.waitUntil(service.drain());return res;}catch(e){return response({ok:false,saved:false,code:e.code||'QUEUE_UNAVAILABLE'},503);}},
 async scheduled(event,env,context){const service=new CommandService(env);context.waitUntil((async()=>{await service.drain();await service.refreshDue();})());}
};
