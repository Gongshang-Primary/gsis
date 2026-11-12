import Q from '../shared/edge-command-queue.js';
const OPEN="('QUEUED','RUNNING','CHECKING','UNCERTAIN')";
const results=r=>r?.results||[];
const identity=c=>{const value=Q.binding(c);delete value.payload;return Q.canonical(value);};
export class QueueStore {
 constructor(db,app='deploy',clock=()=>Date.now(),adapter=Q.DEPLOY){if(!db||app!==adapter.app||!adapter.document||!adapter.limits||typeof adapter.validate!=='function')Q.fail(503,'QUEUE_BINDING');this.db=db;this.app=app;this.adapter=adapter;this.document=adapter.document;this.limits=adapter.limits;this.clock=clock;}
 sql(text,...args){return this.db.prepare(text).bind(...args);}
 async first(text,...args){return this.sql(text,...args).first();}
 async rows(text,...args){return results(await this.sql(text,...args).all());}
 async nonce(purpose,nonce){
  const now=this.clock();const out=await this.db.batch([
   this.sql('DELETE FROM edge_nonces WHERE app=? AND expires_at<=?',this.app,now),
   this.sql('INSERT INTO edge_nonces(app,purpose,nonce,created_at,expires_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM edge_nonces WHERE app=?)<? ON CONFLICT DO NOTHING RETURNING nonce',this.app,purpose,nonce,now,now+180000,this.app,this.limits.nonces)
  ]);if(!results(out[1]).length)Q.fail(409,'QUEUE_NONCE_OR_CAPACITY');
 }
 async mirror(config){
  if(config.app!==this.app||config.document!=='workbook'||!Number.isSafeInteger(config.generation)||config.generation<1||!['direct','queued'].includes(config.mode))Q.fail(400,'QUEUE_CONFIG');
  await this.sql(`INSERT INTO edge_scopes(app,document_key,mode,config_generation,admission_paused,dispatch_paused) VALUES(?,?,?,?,?,?) ON CONFLICT(app,document_key) DO UPDATE SET mode=excluded.mode,config_generation=excluded.config_generation,admission_paused=excluded.admission_paused,dispatch_paused=excluded.dispatch_paused WHERE excluded.config_generation>edge_scopes.config_generation`,this.app,config.document,config.mode,config.generation,config.admissionPaused?1:0,config.dispatchPaused?1:0).run();
  const row=await this.scope();if(row.config_generation!==config.generation||row.mode!==config.mode||!!row.admission_paused!==!!config.admissionPaused||!!row.dispatch_paused!==!!config.dispatchPaused)Q.fail(409,'QUEUE_CONFIG_GENERATION');return row;
 }
 scope(){return this.first('SELECT * FROM edge_scopes WHERE app=? AND document_key=?',this.app,this.document);}
 async lookup(id){return await this.first('SELECT * FROM edge_jobs WHERE app=? AND request_id=?',this.app,id)||await this.first('SELECT * FROM edge_receipt_index WHERE app=? AND request_id=?',this.app,id);}
 exact(row,c,hash){if(row.binding_json!==identity(c)||row.payload_hash!==hash)Q.fail(409,'QUEUE_ID_MISMATCH');return row;}
 async enqueue(c,generation){
  Q.command(c,this.adapter);const now=this.clock(),hash=await Q.digest(Q.binding(c)),existing=await this.lookup(c.requestId);if(existing)return this.receipt(this.exact(existing,c,hash));
  if(c.issuedAt>now+60000||now-c.issuedAt>86400000)Q.fail(409,'QUEUE_ISSUANCE');
  const out=await this.db.batch([
   this.sql(`INSERT INTO edge_jobs(app,document_key,request_id,issued_at,actor_key,actor_json,action,schema_version,expected_revision_json,payload_json,payload_hash,binding_json,state,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,'QUEUED',?,? WHERE EXISTS(SELECT 1 FROM edge_scopes WHERE app=? AND document_key=? AND mode='queued' AND config_generation=? AND admission_paused=0)
    AND (SELECT COUNT(*) FROM edge_jobs WHERE app=?)<? AND (SELECT COUNT(*) FROM edge_jobs WHERE app=? AND state IN ${OPEN})<?
    AND (SELECT COUNT(*) FROM edge_jobs WHERE app=? AND actor_key=? AND state IN ${OPEN})<? AND (SELECT COUNT(*) FROM edge_receipt_index WHERE app=?)<?
    ON CONFLICT(app,request_id) DO NOTHING RETURNING sequence`,this.app,c.document,c.requestId,c.issuedAt,c.actor.subject,Q.canonical(c.actor),c.action,1,Q.canonical(c.expectedRevision),Q.canonical(c.payload),hash,identity(c),now,now,this.app,c.document,generation,this.app,this.limits.rows,this.app,this.limits.open,this.app,c.actor.subject,this.limits.actor,this.app,this.limits.receipts),
   this.sql("INSERT INTO edge_job_events(app,request_id,event_sequence,state,at,fence) SELECT app,request_id,1,'QUEUED',created_at,0 FROM edge_jobs WHERE app=? AND request_id=? ON CONFLICT DO NOTHING",this.app,c.requestId)
  ]);
  const row=await this.lookup(c.requestId);if(!row){const s=await this.scope();if(!s||s.mode!=='queued'||s.config_generation!==generation||s.admission_paused)Q.fail(409,'QUEUE_ADMISSION_PAUSED');Q.fail(429,'QUEUE_CAPACITY');}
  this.exact(row,c,hash);return this.receipt(row);
 }
 async receipt(row){
  if(!row)return null;if(!row.state)return JSON.parse(row.receipt_json);
  const events=await this.rows('SELECT state,at,error_code AS code,event_sequence AS version FROM edge_job_events WHERE app=? AND request_id=? ORDER BY event_sequence DESC LIMIT 12',this.app,row.request_id);
  const steps=await this.rows('SELECT step_key AS step,state,reason_code AS reason,child_request_id AS requestId,publication_json FROM edge_job_steps WHERE app=? AND parent_request_id=? ORDER BY step_key',this.app,row.request_id);
  for(const step of steps){step.publication=JSON.parse(step.publication_json);delete step.publication_json;}
  const decision=row.receipt_json?JSON.parse(row.receipt_json):null;
  return {app:this.app,requestId:row.request_id,action:row.action,state:row.state,resultKind:row.result_kind,sequence:row.sequence,submittedAt:row.created_at,updatedAt:row.updated_at,appliedAt:decision?.appliedAt||null,saved:row.state==='APPLIED',version:row.version,beforeRevision:JSON.parse(row.expected_revision_json),afterRevision:decision?.afterRevision,googleReference:decision?.reference,decisionDigest:decision?.primaryDigest||decision?.digest,code:row.error_code,steps,events:events.reverse(),recovery:row.state==='UNCERTAIN'?['checkStatus']:Q.OPEN.includes(row.state)?['status']:[]};
 }
 async privateReceipt(id,actor,admin=false){const row=await this.lookup(id);if(!row||!admin&&row.actor_key!==actor)Q.fail(404,'QUEUE_RECEIPT_NOT_FOUND');return this.receipt(row);}
 async list(actor,cursor=0){if(!Number.isSafeInteger(cursor)||cursor<0)Q.fail(400,'QUEUE_CURSOR');const rows=await this.rows('SELECT * FROM edge_jobs WHERE app=? AND actor_key=? AND sequence>? ORDER BY sequence LIMIT 51',this.app,actor,cursor);return {receipts:await Promise.all(rows.slice(0,50).map(r=>this.receipt(r))),cursor:rows.length>50?rows[49].sequence:null};}
 async check(id,actor,admin=false){const row=await this.lookup(id);if(!row||!admin&&row.actor_key!==actor)Q.fail(404,'QUEUE_RECEIPT_NOT_FOUND');const now=this.clock();await this.sql("UPDATE edge_jobs SET state='CHECKING',checks=0,next_at=?,version=version+1,updated_at=? WHERE app=? AND request_id=? AND state='UNCERTAIN'",now,now,this.app,id).run();return this.privateReceipt(id,actor,admin);}
 async claim(){
  const now=this.clock(),token=crypto.randomUUID();
  await this.db.batch([
   this.sql("UPDATE edge_jobs SET state=CASE WHEN checks+1>=5 THEN 'UNCERTAIN' ELSE 'CHECKING' END,checks=checks+1,lease_token=NULL,lease_until=0,next_at=?+CASE checks+1 WHEN 1 THEN 30000 WHEN 2 THEN 60000 WHEN 3 THEN 120000 ELSE 300000 END,error_code='CHECK_LEASE_EXPIRED',version=version+1,updated_at=? WHERE app=? AND state='CHECKING' AND lease_token IS NOT NULL AND lease_until<=?",now,now,this.app,now),
   this.sql("UPDATE edge_jobs SET state='CHECKING',lease_token=NULL,lease_until=0,next_at=?,error_code='EXECUTE_LEASE_EXPIRED',version=version+1,updated_at=? WHERE app=? AND state='RUNNING' AND lease_until<=?",now+Q.DELAYS[0],now,this.app,now),
   this.sql("INSERT INTO edge_job_events(app,request_id,event_sequence,state,at,fence,error_code) SELECT app,request_id,version,state,updated_at,fence,error_code FROM edge_jobs WHERE app=? AND updated_at=? AND error_code IN ('CHECK_LEASE_EXPIRED','EXECUTE_LEASE_EXPIRED') ON CONFLICT DO NOTHING",this.app,now),
   this.sql("UPDATE edge_scopes SET lease_token=NULL,lease_until=0 WHERE app=? AND lease_until<=?",this.app,now)
  ]);
  const out=await this.db.batch([
   this.sql(`UPDATE edge_scopes SET head_sequence=(SELECT MIN(sequence) FROM edge_jobs WHERE app=? AND document_key=edge_scopes.document_key AND state IN ${OPEN}),active_request_id=(SELECT request_id FROM edge_jobs WHERE app=? AND document_key=edge_scopes.document_key AND state IN ${OPEN} ORDER BY sequence LIMIT 1),lease_token=?,lease_until=?,fence=fence+1
    WHERE app=? AND document_key=? AND mode='queued' AND dispatch_paused=0 AND lease_until<=? AND EXISTS(SELECT 1 FROM edge_jobs j WHERE j.app=? AND j.document_key=edge_scopes.document_key AND j.sequence=(SELECT MIN(sequence) FROM edge_jobs WHERE app=? AND document_key=edge_scopes.document_key AND state IN ${OPEN}) AND j.state IN ('QUEUED','CHECKING') AND j.next_at<=?) RETURNING *`,this.app,this.app,token,now+120000,this.app,this.document,now,this.app,this.app,now),
   this.sql(`UPDATE edge_jobs SET state=CASE WHEN state='QUEUED' THEN 'RUNNING' ELSE 'CHECKING' END,lease_token=?,lease_until=?,fence=(SELECT fence FROM edge_scopes WHERE app=? AND document_key=?),version=version+1,updated_at=? WHERE app=? AND request_id=(SELECT active_request_id FROM edge_scopes WHERE app=? AND document_key=? AND lease_token=?) AND state IN ('QUEUED','CHECKING') RETURNING *`,token,now+120000,this.app,this.document,now,this.app,this.app,this.document,token),
   this.sql('INSERT INTO edge_job_events(app,request_id,event_sequence,state,at,fence) SELECT app,request_id,version,state,updated_at,fence FROM edge_jobs WHERE app=? AND lease_token=? ON CONFLICT DO NOTHING',this.app,token)
  ]);const row=results(out[1])[0];return row?{...row,config_generation:results(out[0])[0].config_generation}:null;
 }
 async settle(job,decision,transportFailed=false){
  const now=this.clock(),terminal=decision&&['APPLIED','REJECTED','CANCELLED'].includes(decision.decision);
  if(decision&&(decision.requestId!==job.request_id||decision.payloadHash!==job.payload_hash||decision.actorSubject!==job.actor_key||decision.document!==job.document_key))Q.fail(409,'QUEUE_DECISION_MISMATCH');
  const checks=job.checks+(job.state==='CHECKING'?1:0),state=terminal?(decision.decision==='APPLIED'?'APPLIED':'REJECTED'):checks>=5?'UNCERTAIN':'CHECKING';
  const conflict=decision?.resultKind==='conflict',failure=transportFailed||decision?.decision==='REJECTED'&&!conflict;
  const encoded=terminal?Q.canonical(decision):null;
  const batch=[this.sql(`UPDATE edge_jobs SET state=?,result_kind=?,receipt_json=?,error_code=?,checks=?,next_at=?,lease_token=NULL,lease_until=0,dispatch_failures=dispatch_failures+?,version=version+1,updated_at=?
   WHERE app=? AND request_id=? AND version=? AND lease_token=? AND fence=? AND lease_until>? AND EXISTS(SELECT 1 FROM edge_scopes WHERE app=? AND document_key=? AND lease_token=? AND fence=?) RETURNING *`,state,terminal?conflict?'conflict':decision.decision==='APPLIED'?'applied':'rejected':'pending',encoded,terminal?decision.code||null:transportFailed?'GOOGLE_UNCONFIRMED':'GOOGLE_UNKNOWN',checks,terminal?0:now+Q.DELAYS[Math.min(checks,4)],failure?1:0,now,this.app,job.request_id,job.version,job.lease_token,job.fence,now,this.app,job.document_key,job.lease_token,job.fence)];
  // Later statements are fenced by the new job version, including invalidation.
  const owned=`EXISTS(SELECT 1 FROM edge_jobs WHERE app=? AND request_id=? AND version=? AND updated_at=?)`;
  batch.push(this.sql(`UPDATE edge_scopes SET active_request_id=CASE WHEN ? THEN NULL ELSE active_request_id END,head_sequence=CASE WHEN ? THEN NULL ELSE head_sequence END,lease_token=NULL,lease_until=0,high_water=high_water+?,last_applied=CASE WHEN ? THEN ? ELSE last_applied END,last_revision_json=CASE WHEN ? THEN ? ELSE last_revision_json END,failures=CASE WHEN ? THEN failures+1 WHEN ? THEN 0 ELSE failures END WHERE app=? AND document_key=? AND lease_token=? AND fence=? AND ${owned}`,terminal?1:0,terminal?1:0,state==='APPLIED'?1:0,state==='APPLIED'?1:0,now,state==='APPLIED'?1:0,terminal?Q.canonical(decision.afterRevision||null):null,failure?1:0,terminal&&!failure?1:0,this.app,job.document_key,job.lease_token,job.fence,this.app,job.request_id,job.version+1,now));
  if(state==='APPLIED')batch.push(this.sql(`UPDATE edge_cache SET stale=1 WHERE app=? AND document_key=? AND ${owned}`,this.app,job.document_key,this.app,job.request_id,job.version+1,now));
  batch.push(this.sql('INSERT INTO edge_job_events(app,request_id,event_sequence,state,at,fence,error_code,evidence_digest) SELECT app,request_id,version,state,updated_at,fence,error_code,? FROM edge_jobs WHERE app=? AND request_id=? AND version=? AND updated_at=? ON CONFLICT DO NOTHING',decision?.digest||null,this.app,job.request_id,job.version+1,now));
  for(const step of terminal?decision.steps||[]:[])batch.push(this.sql(`INSERT INTO edge_job_steps(app,parent_request_id,step_key,child_request_id,target_app,publication_json,state,reason_code,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${owned} ON CONFLICT(app,parent_request_id,step_key) DO UPDATE SET state=excluded.state,reason_code=excluded.reason_code,updated_at=excluded.updated_at,version=edge_job_steps.version+1`,this.app,job.request_id,step.step,step.requestId||null,step.targetApp||this.app,Q.canonical(step.publication||null),step.state,step.reason||null,now,now,this.app,job.request_id,job.version+1,now));
  const out=await this.db.batch(batch);return results(out[0])[0]||null;
 }
 async reconcileTerminal(row,d){
  const old=await this.lookup(row.request_id);if(!old||old.payload_hash!==d.payloadHash||old.actor_key!==d.actorSubject)Q.fail(409,'QUEUE_RECONCILIATION_IDENTITY');if(!old.state||['APPLIED','REJECTED'].includes(old.state))return old;
  const scope=await this.scope();if(!scope.admission_paused||!scope.dispatch_paused)Q.fail(409,'QUEUE_RECONCILIATION_PAUSE');
  const state=d.decision==='APPLIED'?'APPLIED':'REJECTED',now=this.clock(),batch=[this.sql("UPDATE edge_jobs SET state=?,result_kind=?,receipt_json=?,error_code=?,lease_token=NULL,lease_until=0,updated_at=?,version=version+1 WHERE app=? AND request_id=? AND version=? RETURNING *",state,d.resultKind||state.toLowerCase(),Q.canonical(d),d.code||null,now,this.app,old.request_id,old.version)];
  batch.push(this.sql('UPDATE edge_scopes SET lease_token=NULL,lease_until=0,active_request_id=NULL,head_sequence=NULL,fence=fence+1 WHERE app=? AND document_key=? AND active_request_id=?',this.app,this.document,old.request_id));
  if(state==='APPLIED'){batch.push(this.sql('UPDATE edge_scopes SET high_water=high_water+1,last_applied=? WHERE app=? AND document_key=?',now,this.app,this.document));batch.push(this.sql('UPDATE edge_cache SET stale=1 WHERE app=? AND document_key=?',this.app,this.document));}
  batch.push(this.sql('INSERT INTO edge_job_events(app,request_id,event_sequence,state,at,fence,evidence_digest) SELECT app,request_id,version,state,updated_at,fence,? FROM edge_jobs WHERE app=? AND request_id=? AND version=? ON CONFLICT DO NOTHING',d.digest,this.app,old.request_id,old.version+1));await this.db.batch(batch);const updated=await this.lookup(old.request_id);if(state==='APPLIED')await this.refreshSteps(d);return this.lookup(old.request_id);
 }
 async refreshSteps(d){
  const row=await this.lookup(d.requestId);if(!row||row.actor_key!==d.actorSubject||row.payload_hash!==d.payloadHash||d.decision!=='APPLIED')Q.fail(409,'QUEUE_STEP_IDENTITY');
  const previous=JSON.parse(row.receipt_json);if((previous.primaryDigest||previous.decisionDigest)!==d.primaryDigest||(previous.reference||previous.googleReference)!==d.reference)Q.fail(409,'QUEUE_STEP_PRIMARY_DECISION');
  const now=this.clock();if(!row.state){const receipt={...previous,steps:d.steps,updatedAt:now};await this.sql('UPDATE edge_receipt_index SET receipt_json=? WHERE app=? AND request_id=? AND payload_hash=?',Q.canonical(receipt),this.app,d.requestId,d.payloadHash).run();return;}
  if(row.state!=='APPLIED')Q.fail(409,'QUEUE_STEP_PRIMARY_DECISION');
  const batch=[this.sql("UPDATE edge_jobs SET receipt_json=?,updated_at=?,version=version+1 WHERE app=? AND request_id=? AND version=? AND state='APPLIED'",Q.canonical(d),now,this.app,d.requestId,row.version)];
  for(const step of d.steps||[])batch.push(this.sql(`INSERT INTO edge_job_steps(app,parent_request_id,step_key,child_request_id,target_app,publication_json,state,reason_code,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM edge_jobs WHERE app=? AND request_id=? AND version=?) ON CONFLICT(app,parent_request_id,step_key) DO UPDATE SET state=excluded.state,child_request_id=excluded.child_request_id,reason_code=excluded.reason_code,publication_json=excluded.publication_json,updated_at=excluded.updated_at,version=edge_job_steps.version+1`,this.app,d.requestId,step.step,step.requestId||null,step.targetApp||this.app,Q.canonical(step.publication||null),step.state,step.reason||null,now,now,this.app,d.requestId,row.version+1));
  batch.push(this.sql('INSERT INTO edge_job_events(app,request_id,event_sequence,state,at,fence,evidence_digest) SELECT app,request_id,version,state,updated_at,fence,? FROM edge_jobs WHERE app=? AND request_id=? AND version=? ON CONFLICT DO NOTHING',d.digest,this.app,d.requestId,row.version+1));await this.db.batch(batch);
 }
 async health(){const now=this.clock(),scope=await this.scope(),counts=await this.rows('SELECT state,COUNT(*) AS count,MIN(created_at) AS oldest FROM edge_jobs WHERE app=? GROUP BY state',this.app),open=counts.filter(r=>Q.OPEN.includes(r.state)),oldest=open.length?Math.min(...open.map(r=>r.oldest)):null;const pendingSteps=await this.first("SELECT COUNT(*) AS count,MIN(created_at) AS oldest FROM edge_job_steps WHERE app=? AND state NOT IN ('complete','not_required','APPLIED','REJECTED','CANCELLED')",this.app);const cache=await this.first('SELECT MIN(verified_at) AS at FROM edge_cache WHERE app=? AND stale=0',this.app),receiptCount=(await this.first('SELECT COUNT(*) AS count FROM edge_receipt_index WHERE app=?',this.app)).count;return {app:this.app,mode:scope?.mode||'direct',generation:scope?.config_generation||0,admissionPaused:!!scope?.admission_paused||receiptCount>=this.limits.receipts,receiptIndexSize:receiptCount,dispatchPaused:!!scope?.dispatch_paused,queueDepth:counts.reduce((n,r)=>n+r.count,0),open:open.reduce((n,r)=>n+r.count,0),byState:Object.fromEntries(counts.map(r=>[r.state,r.count])),pendingSteps:pendingSteps.count,oldestPendingAge:oldest===null&&!pendingSteps.count?0:now-Math.min(oldest??Infinity,pendingSteps.count?pendingSteps.oldest:Infinity),headPinned:!!scope?.active_request_id,lastApplied:scope?.last_applied||null,lastAppliedRevision:scope?.last_revision_json?JSON.parse(scope.last_revision_json):null,failures:scope?.failures||0,cacheAge:cache?.at?now-cache.at:null,lastReconciled:scope?.last_reconciled||null,shadowAt:scope?.shadow_at||null,shadowResult:scope?.shadow_result||null};}
 async alert(){const h=await this.health(),bad=h.oldestPendingAge>600000||h.failures>=2,s=await this.scope();if(!s)return null;if(!bad){await this.sql('UPDATE edge_scopes SET alert_incident=NULL,alert_pending=0 WHERE app=? AND document_key=?',this.app,this.document).run();return null;}const id=crypto.randomUUID();const r=await this.sql('UPDATE edge_scopes SET alert_incident=?,alert_pending=1 WHERE app=? AND document_key=? AND alert_incident IS NULL RETURNING alert_incident',id,this.app,this.document).all();return results(r).length?{app:this.app,incident:id,oldestPendingAge:h.oldestPendingAge,count:h.open+h.pendingSteps,code:h.failures>=2?'QUEUE_DISPATCH_FAILURES':'QUEUE_PENDING_AGE'}:null;}
 async stale(){await this.db.batch([this.sql('UPDATE edge_scopes SET high_water=high_water+1 WHERE app=? AND document_key=?',this.app,this.document),this.sql('UPDATE edge_cache SET stale=1 WHERE app=?',this.app)]);}
}
