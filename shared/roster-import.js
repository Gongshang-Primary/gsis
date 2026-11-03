/* Immutable Roster preparation. Source capture stays in Google; D1 remains legacy
 * until the complete, verified session is committed in one transaction. */
var GSiSRosterImport=(()=>{
 const Store=typeof GSiSEdgeStore!=='undefined'?GSiSEdgeStore:require('./edge-store.js');
 const FORMAT='gsis-roster-import-v1',TARGET_BYTES=196608,SEGMENT_BYTES=196608,MAX_PART_BYTES=1900000,MAX_MANIFEST_BYTES=524288,MAX_PARTS=2048,MAX_TOTAL_BYTES=41943040,MAX_OBJECT_BYTES=33554432,MAX_RETAINED_SESSIONS=24,PREPARATION_LEASE_MS=420000,MAX_PREPARATION_RESULT_BYTES=1048576;
 const SCOPES=['roster','roster-register'];
 const PENDING_CLEANUP="s.state='abandoned' AND s.reset_request<>'' AND NOT EXISTS(SELECT 1 FROM gsis_roster_import_preparation p WHERE p.session_id=s.session_id AND p.cleanup_request=s.reset_request)";
 const fail=(status,code,message)=>{throw Object.assign(Error(message),{status,code});};
 function utf8Length(value){let size=0;for(const char of value){const n=char.codePointAt(0);size+=n<128?1:n<2048?2:n<65536?3:4;}return size;}
 function utf8Bytes(value){const bytes=[];for(const char of value){const n=char.codePointAt(0);if(n<128)bytes.push(n);else if(n<2048)bytes.push(192|n>>6,128|n&63);else if(n<65536)bytes.push(224|n>>12,128|n>>6&63,128|n&63);else bytes.push(240|n>>18,128|n>>12&63,128|n>>6&63,128|n&63);}return bytes;}
 function digestValue(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
 function identity(value,name,max=200){if(typeof value!=='string'||!value||value.length>max||/[\u0000-\u001f]/.test(value))fail(400,'ROSTER_IMPORT_ID','Invalid '+name+'.');return value;}
 function validateFailureReason(reason){
  if(!reason||typeof reason!=='object'||Array.isArray(reason)||Object.keys(reason).some(key=>!['status','message','phase','elapsed','code','bytes','records','ordinal','partId'].includes(key))||!Number.isSafeInteger(reason.status)||reason.status<400||reason.status>599||typeof reason.message!=='string'||!reason.message||reason.message.length>800||typeof reason.phase!=='string'||!reason.phase||reason.phase.length>80||/[\u0000-\u001f]/.test(reason.phase)||!Number.isSafeInteger(reason.elapsed)||reason.elapsed<0)fail(400,'ROSTER_IMPORT_PREPARATION_RESULT','Invalid preparation failure reason.');
  for(const key of ['bytes','records','ordinal'])if(reason[key]!==undefined&&reason[key]!==null&&(!Number.isSafeInteger(reason[key])||reason[key]<0))fail(400,'ROSTER_IMPORT_PREPARATION_RESULT','Invalid preparation step size.');
  if(reason.code!==undefined&&!/^[A-Z][A-Z0-9_]{0,79}$/.test(reason.code)||reason.partId!==undefined&&(typeof reason.partId!=='string'||reason.partId.length>80))fail(400,'ROSTER_IMPORT_PREPARATION_RESULT','Invalid preparation error code or part.');return reason;
 }
 function freezeBinding(snapshot,binding){
  const {actor,requestId,sessionId}=binding;identity(actor,'actor',320);identity(requestId,'request');if(!digestValue(sessionId)||!digestValue(snapshot.sourceDigest))fail(400,'ROSTER_IMPORT_DIGEST','Invalid import digest.');
 }
 function partWriter(position,adapter){
  let {ordinal,offset}=position;if(!Number.isSafeInteger(ordinal)||ordinal<0||!Number.isSafeInteger(offset)||offset<0)fail(400,'ROSTER_IMPORT_POSITION','Invalid preparation position.');
  const parts=[],partMetadata=[];
  function add(kind,body,scope='',records=0){const payload=JSON.stringify(body),bytes=utf8Length(payload);if(bytes>MAX_PART_BYTES||ordinal>=MAX_PARTS||offset+bytes>MAX_TOTAL_BYTES)fail(413,'ROSTER_IMPORT_LIMIT','The immutable export exceeds a documented part/container limit.');const id='part-'+String(ordinal++).padStart(5,'0');partMetadata.push({id,kind,scope,records,offset,bytes,digest:adapter.hash(payload)});parts.push(payload);offset+=bytes;return id;}
  return {add,result:()=>({parts,partMetadata,position:{ordinal,offset}})};
 }
 function objectJobs(snapshot){
  const jobs=[];
  for(const [index,entry]of (snapshot.index.entries||[]).entries()){if(!entry.modelFile)fail(409,'ROSTER_IMPORT_MODEL','The captured model has no immutable file identity.');jobs.push({kind:'baseline',id:entry.id,path:['index','entries',index]});}
  for(const [date,meta]of Object.entries(snapshot.state.allocationAuditExports||{}))if(meta.archiveFileId)jobs.push({kind:'audit',id:date,path:['state','allocationAuditExports',date]});
  for(const collection of ['staplerPlans','staplerArchives'])for(const [index,row]of (snapshot.state[collection]||[]).entries())for(const field of ['draft','published','confirmedPlan'])if(row[field]&&!row[field].edgeObject)jobs.push({kind:'stapler',id:(row.id||row.date)+'/'+field,path:['state',collection,index,field]});
  return jobs;
 }
 function jobValue(snapshot,job){
  if(!job||!['baseline','audit','stapler'].includes(job.kind)||!Array.isArray(job.path)||!job.path.length)fail(400,'ROSTER_IMPORT_OBJECT','Invalid preparation object job.');
  let value=snapshot;for(const key of job.path){if(!value||!Object.prototype.hasOwnProperty.call(value,key))fail(409,'ROSTER_IMPORT_OBJECT','The captured object job is unavailable.');value=value[key];}return value;
 }
 function prepareObject(snapshot,job,position,adapter){
  const source=jobValue(snapshot,job),value=job.kind==='baseline'?adapter.readModel(JSON.parse(JSON.stringify(source))):job.kind==='audit'?adapter.readArchive(job.id,source.archiveFileId):source;
  const json=JSON.stringify(value);if(utf8Length(json)>MAX_OBJECT_BYTES)fail(413,'ROSTER_IMPORT_OBJECT_LIMIT','A captured object exceeds the supported 32 MiB source-object bound.');
  const digest=adapter.hash(json),reference={key:'gsis/roster/'+job.kind+'/'+encodeURIComponent(job.id)+'/'+digest+'.json.gz',digest,encoding:'gzip-json-v1'},gzip=adapter.gzip(json),writer=partWriter(position,adapter),segments=[];
  for(let n=0;n<gzip.length;n+=SEGMENT_BYTES)segments.push(writer.add('segment',{base64:adapter.base64(gzip.slice(n,n+SEGMENT_BYTES))}));
  writer.add('object',{reference,kind:job.kind,gzipBytes:gzip.length,segments});return {...writer.result(),reference};
 }
 function prepareRecords(snapshot,references,position,adapter){
  const jobs=objectJobs(snapshot);if(!Array.isArray(references)||references.length!==jobs.length)fail(409,'ROSTER_IMPORT_OBJECT','Captured object references are incomplete.');
  const transformed={state:JSON.parse(JSON.stringify(snapshot.state)),index:JSON.parse(JSON.stringify(snapshot.index))};
  for(let i=0;i<jobs.length;i++){
   const job=jobs[i],item=references[i],reference=item?.reference;if(JSON.stringify(item?.job)!==JSON.stringify(job)||!reference||reference.encoding!=='gzip-json-v1'||!digestValue(reference.digest)||reference.key!=='gsis/roster/'+job.kind+'/'+encodeURIComponent(job.id)+'/'+reference.digest+'.json.gz')fail(409,'ROSTER_IMPORT_OBJECT','A captured object reference does not match its job.');
   const value=jobValue(transformed,job);if(job.kind==='baseline'){value.modelObject={...reference};value.modelObjectKey=reference.key;value.modelDigest=reference.digest;delete value.modelFile;}else if(job.kind==='audit'){value.archiveObject={...reference};delete value.archiveFileId;}else{let parent=transformed;for(const key of job.path.slice(0,-1))parent=parent[key];parent[job.path.at(-1)]={edgeObject:true,...reference};}
  }
  const writer=partWriter(position,adapter),scopes={};
  for(const [scope,value]of [['roster',transformed.state],['roster-register',transformed.index]]){
   // Encode each complete scope once. Natural-key multiplicity and positions are
   // global; the prepared payloads are then persisted and uploaded in small batches.
   const records=Store.encode(value);scopes[scope]={records:records.size,digest:adapter.hash(Store.canonicalJson(value))};let rows=[],bytes=12;
   for(const row of records.values()){
    const size=utf8Length(JSON.stringify(row))+1;
    if(rows.length&&bytes+size>TARGET_BYTES){writer.add('records',{rows},scope,rows.length);rows=[];bytes=12;}
    if(size+12>TARGET_BYTES){
     // Split transport bytes, never the logical record or its natural key.
     const payload=JSON.stringify({rows:[row]}),data=utf8Bytes(payload),segments=[];
     if(data.length>MAX_PART_BYTES)fail(413,'ROSTER_IMPORT_LIMIT','The immutable record exceeds its documented limit.');
     for(let n=0;n<data.length;n+=SEGMENT_BYTES)segments.push(writer.add('segment',{base64:adapter.base64(data.slice(n,n+SEGMENT_BYTES))}));
     writer.add('record',{segments,bytes:data.length,digest:adapter.hash(payload)},scope,1);continue;
    }
    rows.push(row);bytes+=size;
   }
   if(rows.length)writer.add('records',{rows},scope,rows.length);
  }
  return {...writer.result(),scopes};
 }
 function finishFreeze(snapshot,binding,partMetadata,scopes,adapter){
  freezeBinding(snapshot,binding);const {sessionId,actor,requestId}=binding,manifest={schema:FORMAT,sessionId,actor,requestId,sourceDigest:snapshot.sourceDigest,parts:partMetadata,scopes,totalBytes:partMetadata.reduce((n,p)=>n+p.bytes,0)};
  validateManifest(manifest);return {manifest,manifestDigest:adapter.hash(JSON.stringify(manifest))};
 }
 function freeze(snapshot,binding,adapter){
  freezeBinding(snapshot,binding);let position={ordinal:0,offset:0};const parts=[],partMetadata=[],references=[];
  for(const job of objectJobs(snapshot)){const result=prepareObject(snapshot,job,position,adapter);parts.push(...result.parts);partMetadata.push(...result.partMetadata);references.push({job,reference:result.reference});position=result.position;}
  const records=prepareRecords(snapshot,references,position,adapter);parts.push(...records.parts);partMetadata.push(...records.partMetadata);return {...finishFreeze(snapshot,binding,partMetadata,records.scopes,adapter),parts};
 }
 function validateManifest(manifest){
  if(!manifest||manifest.schema!==FORMAT||!digestValue(manifest.sessionId)||!digestValue(manifest.sourceDigest)||utf8Length(JSON.stringify(manifest))>MAX_MANIFEST_BYTES)fail(400,'ROSTER_IMPORT_MANIFEST','Invalid or oversized immutable manifest.');
  identity(manifest.actor,'actor',320);identity(manifest.requestId,'request');if(!Array.isArray(manifest.parts)||!manifest.parts.length||manifest.parts.length>MAX_PARTS||!manifest.scopes||Object.keys(manifest.scopes).sort().join(',')!==[...SCOPES].sort().join(','))fail(400,'ROSTER_IMPORT_MANIFEST','Invalid manifest scopes or parts.');
  let offset=0;const ids=new Set(),counts={roster:0,'roster-register':0};for(const part of manifest.parts){identity(part.id,'part',80);const records=['records','record'].includes(part.kind);if(ids.has(part.id)||!['records','record','segment','object'].includes(part.kind)||part.offset!==offset||!Number.isSafeInteger(part.bytes)||part.bytes<1||part.bytes>MAX_PART_BYTES||!digestValue(part.digest)||!Number.isSafeInteger(part.records)||part.records<0||records&&!SCOPES.includes(part.scope)||!records&&(part.scope!==''||part.records!==0)||part.kind==='record'&&part.records!==1)fail(400,'ROSTER_IMPORT_MANIFEST','Duplicate, missing or invalid manifest part.');ids.add(part.id);offset+=part.bytes;if(records)counts[part.scope]+=part.records;}
  if(offset!==manifest.totalBytes||offset>MAX_TOTAL_BYTES||SCOPES.some(scope=>!digestValue(manifest.scopes[scope]?.digest)||manifest.scopes[scope]?.records!==counts[scope]||counts[scope]<1))fail(400,'ROSTER_IMPORT_MANIFEST','Manifest lengths or record counts do not match.');return manifest;
 }
 const SQL=`CREATE TABLE IF NOT EXISTS gsis_roster_import_sessions (
 session_id TEXT PRIMARY KEY, actor TEXT NOT NULL, request_id TEXT NOT NULL, state TEXT NOT NULL,
 manifest_json TEXT NOT NULL DEFAULT '', manifest_digest TEXT NOT NULL DEFAULT '', source_digest TEXT NOT NULL DEFAULT '',
 references_ready INTEGER NOT NULL DEFAULT 0, write_token TEXT NOT NULL DEFAULT '', reset_request TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(actor,request_id));
 CREATE TABLE IF NOT EXISTS gsis_roster_import_preparation (
 session_id TEXT PRIMARY KEY REFERENCES gsis_roster_import_sessions(session_id), ordinal INTEGER NOT NULL DEFAULT 0,
 checkpoint_json TEXT NOT NULL DEFAULT 'null', result_json TEXT NOT NULL DEFAULT '', claim_token TEXT NOT NULL DEFAULT '',
 accepted_token TEXT NOT NULL DEFAULT '', lease_until INTEGER NOT NULL DEFAULT 0, finished INTEGER NOT NULL DEFAULT 0,
 cleanup_request TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS gsis_roster_import_locks (scope TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES gsis_roster_import_sessions(session_id), base_revision INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS gsis_roster_import_parts (session_id TEXT NOT NULL REFERENCES gsis_roster_import_sessions(session_id), part_id TEXT NOT NULL,
 ordinal INTEGER NOT NULL, kind TEXT NOT NULL, scope TEXT NOT NULL, digest TEXT NOT NULL, bytes INTEGER NOT NULL, records INTEGER NOT NULL,
 receipt_json TEXT, PRIMARY KEY(session_id,part_id), UNIQUE(session_id,ordinal));
 CREATE TABLE IF NOT EXISTS gsis_roster_import_rows (session_id TEXT NOT NULL REFERENCES gsis_roster_import_sessions(session_id), scope TEXT NOT NULL,
 collection TEXT NOT NULL, record_id TEXT NOT NULL, position INTEGER NOT NULL, record_date TEXT NOT NULL, value_json TEXT NOT NULL,
 PRIMARY KEY(session_id,scope,collection,record_id));`;
 const schemas=new WeakMap();
 async function hashText(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');}
 function checked(results){if(!Array.isArray(results)||results.some(row=>row?.success===false))fail(503,'ROSTER_IMPORT_STORAGE','Import progress was not confirmed. Retry the same request.');return results;}
 async function ensure(db){await Promise.all(SCOPES.map(scope=>Store.open(db,scope).ensure()));if(!schemas.has(db))schemas.set(db,db.batch(SQL.split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s))).then(checked).catch(error=>{schemas.delete(db);throw error;}));await schemas.get(db);}
 function open(db,binding){
  const {actor,requestId,sessionId}=binding;identity(actor,'actor',320);identity(requestId,'request');if(!digestValue(sessionId))fail(400,'ROSTER_IMPORT_ID','Invalid session.');
  const connection=()=>typeof db.withSession==='function'?db.withSession('first-primary'):db;
  const read=async()=>{await ensure(db);const row=await connection().prepare('SELECT * FROM gsis_roster_import_sessions WHERE session_id=?').bind(sessionId).first();if(row&&(row.actor!==actor||row.request_id!==requestId))fail(409,'ROSTER_IMPORT_ID','The session belongs to another actor or request.');return row;};
  const guard="EXISTS (SELECT 1 FROM gsis_roster_import_sessions WHERE session_id=? AND write_token=?)";
  async function requireCleanupFinished(){const pending=await connection().prepare(`SELECT s.session_id FROM gsis_roster_import_sessions s WHERE ${PENDING_CLEANUP} ORDER BY s.created_at DESC,s.rowid DESC LIMIT 1`).first();if(pending)throw Object.assign(Error('A previous import still needs Google cleanup. Resume its retained session before starting a new capture.'),{status:409,code:'ROSTER_IMPORT_CLEANUP_PENDING',sessionId:pending.session_id});}
  async function reserve(){
   const prior=await read();if(prior){if(prior.state==='abandoned')fail(409,'ROSTER_IMPORT_RESTART','This retained session was restarted. Use a new request ID.');return progress();}
   await requireCleanupFinished();
   if(await connection().prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='gsis_roster_import_archives'").first())if(await connection().prepare('SELECT 1 FROM gsis_roster_import_archives WHERE session_id=?').bind(sessionId).first())fail(409,'ROSTER_IMPORT_ARCHIVED','This import identity is retained in an archive. Start with a new request ID.');
   const retained=await connection().prepare('SELECT COUNT(*) n FROM gsis_roster_import_sessions').first();if(retained.n>=MAX_RETAINED_SESSIONS)fail(409,'ROSTER_IMPORT_CAPACITY','Preparation has 24 retained sessions. Archive eligible abandoned sessions before a new capture; existing sessions remain resumable.');
   const c=connection(),now=Date.now(),stmt=[c.prepare(`INSERT INTO gsis_roster_import_sessions (session_id,actor,request_id,state,created_at,updated_at)
    SELECT ?,?,?,'preparing',?,? WHERE (SELECT COUNT(*) FROM gsis_edge_heads WHERE scope IN ('roster','roster-register') AND mode='legacy' AND revision=0)=2
    AND NOT EXISTS(SELECT 1 FROM gsis_edge_records WHERE scope IN ('roster','roster-register')) AND NOT EXISTS(SELECT 1 FROM gsis_roster_import_locks) AND NOT EXISTS(SELECT 1 FROM gsis_roster_import_sessions s WHERE ${PENDING_CLEANUP}) AND (SELECT COUNT(*) FROM gsis_roster_import_sessions)<?`).bind(sessionId,actor,requestId,now,now,MAX_RETAINED_SESSIONS)];
   for(const scope of SCOPES)stmt.push(c.prepare('INSERT INTO gsis_roster_import_locks (scope,session_id,base_revision) SELECT scope,?,revision FROM gsis_edge_heads WHERE scope=? AND EXISTS(SELECT 1 FROM gsis_roster_import_sessions WHERE session_id=?)').bind(sessionId,scope,sessionId));
   try{checked(await c.batch(stmt));}catch(error){if(await read())return progress();await requireCleanupFinished();throw error;}
   if(!await read()){await requireCleanupFinished();fail(409,'ROSTER_IMPORT_BUSY','Both scopes must be empty and legacy, with no other import in progress. Resume or explicitly restart the retained session.');}return progress();
  }
  function preparationValue(session,row){
   return {ordinal:row?.ordinal||0,checkpoint:row?JSON.parse(row.checkpoint_json):null,result:row?.result_json?JSON.parse(row.result_json):null,busy:session.state==='preparing'&&!!row?.claim_token&&row.lease_until>Date.now(),leaseUntil:row?.lease_until||0,finished:session.state!=='preparing'||row?.finished===1};
  }
  async function preparationStatus(){const session=await read();if(!session)return null;const row=await connection().prepare('SELECT * FROM gsis_roster_import_preparation WHERE session_id=?').bind(sessionId).first();return preparationValue(session,row);}
  async function claimPreparation(){
   const session=await read();if(!session)fail(409,'ROSTER_IMPORT_SESSION','Reserve the import before preparing its source.');
   if(session.state!=='preparing')return {...await preparationStatus(),owned:false,token:null};
   const c=connection(),token=crypto.randomUUID(),now=Date.now();
   const rows=checked(await c.batch([
    c.prepare("INSERT INTO gsis_roster_import_preparation (session_id,updated_at) SELECT ?,? WHERE EXISTS(SELECT 1 FROM gsis_roster_import_sessions WHERE session_id=? AND state='preparing') ON CONFLICT(session_id) DO NOTHING").bind(sessionId,now,sessionId),
    c.prepare("UPDATE gsis_roster_import_preparation SET claim_token=?,lease_until=?,updated_at=? WHERE session_id=? AND finished=0 AND (claim_token='' OR lease_until<=?) AND EXISTS(SELECT 1 FROM gsis_roster_import_sessions WHERE session_id=? AND state='preparing')").bind(token,now+PREPARATION_LEASE_MS,now,sessionId,now,sessionId),
    c.prepare('SELECT * FROM gsis_roster_import_preparation WHERE session_id=?').bind(sessionId)
   ])),row=rows.at(-1).results[0],owned=row?.claim_token===token;
   return {...preparationValue(session,row),owned,token:owned?token:null};
  }
  async function commitPreparation(claim,result){
   if(!claim||typeof claim.token!=='string'||!claim.token||!Number.isSafeInteger(claim.ordinal)||claim.ordinal<0)fail(409,'ROSTER_IMPORT_PREPARATION_STALE','The preparation step is no longer owned by this request.');
   const session=await read();if(!session||session.state!=='preparing')fail(409,'ROSTER_IMPORT_PREPARATION_STALE','The preparation session is no longer accepting steps.');
   if(!result||typeof result!=='object'||Array.isArray(result))fail(400,'ROSTER_IMPORT_PREPARATION_RESULT','A preparation result is required.');
   let payload;try{payload=JSON.stringify(result);}catch{fail(400,'ROSTER_IMPORT_PREPARATION_RESULT','The preparation result must contain JSON values.');}
   if(utf8Length(payload)>MAX_PREPARATION_RESULT_BYTES)fail(413,'ROSTER_IMPORT_LIMIT','The preparation result exceeds its 1 MiB bound.');
   if(result.sessionId!==undefined&&result.sessionId!==sessionId||result.requestId!==undefined&&result.requestId!==requestId)fail(409,'ROSTER_IMPORT_ID','The preparation result belongs to another request.');
   if(result.failureReason!==undefined)validateFailureReason(result.failureReason);
   if(result.lastPhase!==undefined&&(typeof result.lastPhase!=='string'||!result.lastPhase||result.lastPhase.length>80||/[\u0000-\u001f]/.test(result.lastPhase)))fail(400,'ROSTER_IMPORT_PREPARATION_RESULT','Invalid preparation phase.');
   const current=await connection().prepare('SELECT * FROM gsis_roster_import_preparation WHERE session_id=?').bind(sessionId).first();
   const preparation=result.preparation;
   if(preparation!==undefined&&(!preparation||typeof preparation!=='object'||Array.isArray(preparation)||preparation.ordinal!==claim.ordinal+1||Object.keys(preparation).some(k=>!['ordinal','checkpoint'].includes(k))))fail(409,'ROSTER_IMPORT_PREPARATION_STALE','The preparation result has a stale step ordinal.');
   const checkpoint=preparation!==undefined?preparation.checkpoint:result.checkpoint===undefined?(current?JSON.parse(current.checkpoint_json):null):result.checkpoint;
   for(const key of ['done','total','elapsedMs','retryAfterMs'])if(result[key]!==undefined&&(!Number.isSafeInteger(result[key])||result[key]<0))fail(400,'ROSTER_IMPORT_PREPARATION_RESULT','Invalid preparation progress.');
   if(result.step!==undefined&&!(Number.isSafeInteger(result.step)&&result.step>=0||typeof result.step==='string'&&result.step.length<=80)||result.preparing!==undefined&&typeof result.preparing!=='boolean'||Number.isSafeInteger(result.done)&&Number.isSafeInteger(result.total)&&result.done>result.total)fail(400,'ROSTER_IMPORT_PREPARATION_RESULT','Invalid preparation progress.');
   if(checkpoint!==null&&(!checkpoint||typeof checkpoint!=='object'||Array.isArray(checkpoint)||typeof checkpoint.fileId!=='string'||!checkpoint.fileId||checkpoint.fileId.length>1024||!digestValue(checkpoint.digest)||Object.keys(checkpoint).some(k=>!['fileId','digest'].includes(k))))fail(400,'ROSTER_IMPORT_PREPARATION_RESULT','Invalid private preparation checkpoint.');
   if(result.manifest){validateManifest(result.manifest);if(result.manifest.sessionId!==sessionId||result.manifest.actor!==actor||result.manifest.requestId!==requestId||await hashText(JSON.stringify(result.manifest))!==result.manifestDigest)fail(409,'ROSTER_IMPORT_ID','The prepared manifest does not match this request.');}
   const accepted=row=>row?.accepted_token===claim.token&&row.ordinal===claim.ordinal+1&&row.result_json===payload;
   const response=row=>({...preparationValue(session,row),accepted:true});if(accepted(current))return {...response(current),replayed:true};
   const now=Date.now(),c=connection(),finished=result.manifest&&result.manifestDigest||result.preparationFailed===true?1:0;
   let rows;try{rows=checked(await c.batch([
    c.prepare("UPDATE gsis_roster_import_preparation SET ordinal=ordinal+1,checkpoint_json=?,result_json=?,accepted_token=?,claim_token='',lease_until=0,finished=?,updated_at=? WHERE session_id=? AND ordinal=? AND claim_token=? AND lease_until>? AND EXISTS(SELECT 1 FROM gsis_roster_import_sessions WHERE session_id=? AND state='preparing')").bind(JSON.stringify(checkpoint),payload,claim.token,finished,now,sessionId,claim.ordinal,claim.token,now,sessionId),
    c.prepare('SELECT * FROM gsis_roster_import_preparation WHERE session_id=?').bind(sessionId)
   ]));}catch(error){const recovered=await connection().prepare('SELECT * FROM gsis_roster_import_preparation WHERE session_id=?').bind(sessionId).first();if(accepted(recovered)&&(await read())?.state==='preparing')return {...response(recovered),replayed:true};throw error;}
   const row=rows.at(-1).results[0];if(!accepted(row))fail(409,'ROSTER_IMPORT_PREPARATION_STALE','A newer preparation step or restart superseded this result.');return response(row);
  }
  async function recordPreparationFailure(claim,reason){
   validateFailureReason(reason);if(!claim?.token||!Number.isSafeInteger(claim.ordinal))return;
   await read();const now=Date.now();
   // Keep the active lease: a transport failure does not prove that Apps Script stopped.
   checked(await connection().batch([connection().prepare("UPDATE gsis_roster_import_preparation SET result_json=json_set(CASE WHEN result_json='' THEN '{}' ELSE result_json END,'$.failureReason',json(?),'$.lastPhase',?),updated_at=? WHERE session_id=? AND ordinal=? AND claim_token=? AND lease_until>? AND EXISTS(SELECT 1 FROM gsis_roster_import_sessions WHERE session_id=? AND state='preparing')").bind(JSON.stringify(reason),reason.phase,now,sessionId,claim.ordinal,claim.token,now,sessionId)]));
  }
  async function adoptPreparation(claim,result){
   const row=await connection().prepare('SELECT * FROM gsis_roster_import_preparation WHERE session_id=?').bind(sessionId).first();
   if(!row||row.ordinal!==claim.ordinal||row.checkpoint_json!==JSON.stringify(claim.checkpoint)||!row.claim_token)fail(409,'ROSTER_IMPORT_PREPARATION_STALE','The checkpoint changed before reconciliation.');
   return commitPreparation({...claim,token:row.claim_token},result);
  }
  async function restartCleanupStatus(resetRequest){
   const row=await connection().prepare('SELECT cleanup_request FROM gsis_roster_import_preparation WHERE session_id=?').bind(sessionId).first();return {resetRequestId:resetRequest,cleanupPending:row?.cleanup_request!==resetRequest};
  }
  async function recordRestartCleanup(resetRequest){
   identity(resetRequest,'restart request');const session=await read();if(!session||session.state!=='abandoned'||session.reset_request!==resetRequest)fail(409,'ROSTER_IMPORT_RESTART','The cleanup does not match this abandoned import.');
   const c=connection(),confirmed=async()=>{const current=await read();return current?.state==='abandoned'&&current.reset_request===resetRequest&&!(await restartCleanupStatus(resetRequest)).cleanupPending;};
   try{checked(await c.batch([c.prepare("INSERT INTO gsis_roster_import_preparation (session_id,cleanup_request,updated_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM gsis_roster_import_sessions WHERE session_id=? AND state='abandoned' AND reset_request=?) ON CONFLICT(session_id) DO UPDATE SET cleanup_request=excluded.cleanup_request WHERE gsis_roster_import_preparation.cleanup_request='' OR gsis_roster_import_preparation.cleanup_request=excluded.cleanup_request").bind(sessionId,resetRequest,Date.now(),sessionId,resetRequest)]));}
   catch(error){if(!await confirmed())throw error;}
   if(!await confirmed())fail(409,'ROSTER_IMPORT_RESTART','The cleanup completion could not be confirmed.');return {cleanupComplete:true,cleanupPending:false,resetRequestId:resetRequest,requestId,sessionId};
  }
  async function restartResult(resetRequest,details={}){return {restarted:true,sessionId,requestId,retained:true,...await restartCleanupStatus(resetRequest),...details};}
  async function assertRestartable(resetRequest){
   identity(resetRequest,'restart request');const session=await read();if(!session)fail(404,'ROSTER_IMPORT_SESSION','No retained import session.');
   if(session.state==='abandoned'){if(session.reset_request!==resetRequest)fail(409,'ROSTER_IMPORT_RESTART','The session was already restarted by another request.');return {restartable:true,replayed:true};}
   const row=await connection().prepare("SELECT COUNT(*) n FROM gsis_edge_heads h JOIN gsis_roster_import_locks l ON h.scope=l.scope WHERE l.session_id=? AND ((h.mode='legacy' AND h.revision=l.base_revision) OR (h.mode='imported' AND h.revision=l.base_revision+1 AND json_extract(h.metadata_json,'$.importSession')=?))").bind(sessionId,sessionId).first();
   if(!['preparing','staging','failed','imported'].includes(session.state)||row.n!==2)fail(409,'ROSTER_RESTART_ACTIVE','An active, paused or changed authority cannot be reset.');return {restartable:true};
  }
  async function bind(manifest,manifestDigest){
   validateManifest(manifest);if(manifest.actor!==actor||manifest.requestId!==requestId||manifest.sessionId!==sessionId||await hashText(JSON.stringify(manifest))!==manifestDigest)fail(409,'ROSTER_IMPORT_ID','The manifest does not match this actor, request and session.');
   const row=await read();if(!row)fail(409,'ROSTER_IMPORT_SESSION','Reserve the import before binding its source.');if(row.manifest_digest){if(row.manifest_digest!==manifestDigest)fail(409,'ROSTER_IMPORT_SOURCE_CHANGED','This request already captured another immutable source.');return progress();}
   if(row.state!=='preparing')fail(409,'ROSTER_IMPORT_RESTART','This session requires an explicit restart.');const token=crypto.randomUUID(),c=connection();
   const statements=[c.prepare("UPDATE gsis_roster_import_sessions SET state='staging',manifest_json=?,manifest_digest=?,source_digest=?,write_token=?,updated_at=? WHERE session_id=? AND state='preparing' AND manifest_digest=''").bind(JSON.stringify(manifest),manifestDigest,manifest.sourceDigest,token,Date.now(),sessionId),c.prepare(`INSERT INTO gsis_roster_import_parts (session_id,part_id,ordinal,kind,scope,digest,bytes,records)
    SELECT ?,json_extract(value,'$.id'),CAST(key AS INTEGER),json_extract(value,'$.kind'),json_extract(value,'$.scope'),json_extract(value,'$.digest'),json_extract(value,'$.bytes'),json_extract(value,'$.records') FROM json_each(?) WHERE ${guard}`).bind(sessionId,JSON.stringify(manifest.parts),sessionId,token)];
   try{checked(await c.batch(statements));}catch(error){const saved=await read();if(saved?.manifest_digest===manifestDigest)return progress();throw error;}return progress();
  }
  async function progress(){const row=await read();if(!row)return null;const c=connection(),count=await c.prepare('SELECT COUNT(*) total,SUM(receipt_json IS NOT NULL) completed FROM gsis_roster_import_parts WHERE session_id=?').bind(sessionId).first(),next=await c.prepare('SELECT part_id id,kind,scope,digest,bytes,records FROM gsis_roster_import_parts WHERE session_id=? AND receipt_json IS NULL ORDER BY ordinal LIMIT 1').bind(sessionId).first(),preparation=await preparationStatus(),detail={};
   if(row.state==='preparing')for(const key of ['step','done','total','elapsedMs','preparing','retryAfterMs','phase','stepSize','nextStep'])if(preparation?.result?.[key]!==undefined)detail[key]=preparation.result[key];
   for(const key of ['failureReason','lastPhase'])if(preparation?.result?.[key]!==undefined)detail[key]=preparation.result[key];
   if(row.state==='abandoned')Object.assign(detail,await restartCleanupStatus(row.reset_request));
   return {sessionId,requestId,actor,state:row.state,sourceDigest:row.source_digest||null,manifestDigest:row.manifest_digest||null,completedParts:count.completed||0,totalParts:count.total,imported:row.state==='imported',referencesReady:!!row.references_ready,nextPart:next||null,requiresRestart:['failed','abandoned'].includes(row.state),next:row.state==='preparing'?'prepare':next?'part':!row.references_ready?'references':row.state==='imported'?'complete':'finalize',...detail};}

  async function manifest(){const row=await read();if(!row?.manifest_json)fail(409,'ROSTER_IMPORT_PREPARING','The immutable snapshot is not ready.');return JSON.parse(row.manifest_json);}
  async function partReceipt(partId){identity(partId,'part',80);await read();const row=await connection().prepare('SELECT receipt_json FROM gsis_roster_import_parts WHERE session_id=? AND part_id=?').bind(sessionId,partId).first();return row?.receipt_json?JSON.parse(row.receipt_json):null;}
  async function pendingParts(limit=4){
   await read();const rows=(await connection().prepare('SELECT part_id id,kind,scope,digest,bytes,records FROM gsis_roster_import_parts WHERE session_id=? AND receipt_json IS NULL ORDER BY ordinal LIMIT ?').bind(sessionId,Math.max(1,Math.min(4,limit))).all()).results;
   // Object assembly consumes earlier segment receipts. Keep that dependency
   // barrier out of a parallel batch, even when it is the fourth selected part.
   const barrier=rows.findIndex(part=>['object','record'].includes(part.kind));return barrier===0?rows.slice(0,1):barrier>0?rows.slice(0,barrier):rows;
  }
  async function segmentReceipts(ids){
   if(!Array.isArray(ids)||!ids.length||ids.length>MAX_PARTS||new Set(ids).size!==ids.length)fail(409,'ROSTER_IMPORT_OBJECT','Invalid segment dependency list.');await read();const found=await connection().prepare("SELECT part_id,receipt_json FROM gsis_roster_import_parts WHERE session_id=? AND kind='segment' AND receipt_json IS NOT NULL AND part_id IN (SELECT value FROM json_each(?))").bind(sessionId,JSON.stringify(ids)).all(),byId=new Map(found.results.map(row=>[row.part_id,JSON.parse(row.receipt_json)]));if(found.results.length!==ids.length)fail(409,'ROSTER_IMPORT_OBJECT','Object segments are incomplete.');return ids.map(id=>byId.get(id));
  }
  async function validatePart(partId,payload){
   identity(partId,'part',80);if(typeof payload!=='string'||utf8Length(payload)>MAX_PART_BYTES)fail(413,'ROSTER_IMPORT_PART','The export part is too large.');const row=await read();if(!row)fail(409,'ROSTER_IMPORT_SESSION','Unknown import session.');
   const part=await connection().prepare('SELECT part_id id,kind,scope,digest,bytes,records,receipt_json FROM gsis_roster_import_parts WHERE session_id=? AND part_id=?').bind(sessionId,partId).first();if(!part||utf8Length(payload)!==part.bytes||await hashText(payload)!==part.digest)fail(409,'ROSTER_IMPORT_PART','The immutable export part failed its length or digest check.');
   let body;try{body=JSON.parse(payload);}catch{fail(409,'ROSTER_IMPORT_PART','The export part is not JSON.');}return {part,body};
  }
  async function stage(partId,payload,objectReceipt){
   const {part,body}=await validatePart(partId,payload);if(part.receipt_json)return JSON.parse(part.receipt_json);
   let rows=[];if(['records','record'].includes(part.kind)){
    rows=part.kind==='record'?objectReceipt?.rows:body.rows;
    if(part.kind==='record'){
     const raw=JSON.stringify({rows});
     if(objectReceipt?.verified!==true||utf8Length(raw)!==body.bytes||await hashText(raw)!==body.digest)fail(409,'ROSTER_IMPORT_PART','The assembled record failed its length or digest check.');
     await segmentReceipts(body.segments);
    }
    if(!Array.isArray(rows)||rows.length!==part.records)fail(409,'ROSTER_IMPORT_PART','The export record count is invalid.');const ids=new Set();
    for(const r of rows){identity(r.collection,'collection',250);identity(r.record_id,'record',1024);if(!Number.isSafeInteger(r.position)||r.position<0||typeof r.record_date!=='string'||!/^$|^20\d\d-\d\d-\d\d$/.test(r.record_date)||typeof r.value_json!=='string'||utf8Length(r.value_json)>Store.MAX_RECORD_BYTES)fail(409,'ROSTER_IMPORT_PART','Invalid exported record.');try{JSON.parse(r.value_json);}catch{fail(409,'ROSTER_IMPORT_PART','Invalid exported record JSON.');}const id=JSON.stringify([r.collection,r.record_id]);if(ids.has(id))fail(409,'ROSTER_IMPORT_DUPLICATE','Duplicate record identity in import part.');ids.add(id);}
   }else{
    if(!objectReceipt||objectReceipt.verified!==true||typeof objectReceipt.key!=='string'||!Number.isSafeInteger(objectReceipt.bytes)||objectReceipt.bytes<1)fail(409,'ROSTER_IMPORT_OBJECT','The private object write has no verified receipt.');
    if(part.kind==='object'){
     if(!body.reference||body.reference.encoding!=='gzip-json-v1'||!digestValue(body.reference.digest)||!body.reference.key.startsWith('gsis/roster/')||!body.reference.key.endsWith('/'+body.reference.digest+'.json.gz')||objectReceipt.key!==body.reference.key||objectReceipt.bytes!==body.gzipBytes||!Array.isArray(body.segments)||!body.segments.length||new Set(body.segments).size!==body.segments.length)fail(409,'ROSTER_IMPORT_OBJECT','Invalid assembled private object.');
     const dependencies=await connection().prepare("SELECT part_id,receipt_json FROM gsis_roster_import_parts WHERE session_id=? AND kind='segment' AND part_id IN (SELECT value FROM json_each(?))").bind(sessionId,JSON.stringify(body.segments)).all();if(dependencies.results.length!==body.segments.length||dependencies.results.some(row=>!row.receipt_json)||dependencies.results.reduce((n,row)=>n+(JSON.parse(row.receipt_json).object?.bytes||0),0)!==body.gzipBytes)fail(409,'ROSTER_IMPORT_OBJECT','The object segments are incomplete.');
    }else if(objectReceipt.key!=='gsis/roster/import-staging/'+sessionId+'/'+partId||objectReceipt.bytes>SEGMENT_BYTES||!digestValue(objectReceipt.digest))fail(409,'ROSTER_IMPORT_OBJECT','Invalid private object segment.');
   }
   const receipt={partId,digest:part.digest,records:rows.length,...(part.kind==='record'?{assembly:{digest:body.digest,bytes:body.bytes}}:objectReceipt?{object:objectReceipt}:{} )},c=connection(),token=crypto.randomUUID(),now=Date.now();
   const statements=[c.prepare("UPDATE gsis_roster_import_sessions SET write_token=?,updated_at=? WHERE session_id=? AND state='staging' AND EXISTS(SELECT 1 FROM gsis_roster_import_parts WHERE session_id=? AND part_id=? AND receipt_json IS NULL)").bind(token,now,sessionId,sessionId,partId)];
   if(rows.length)statements.push(c.prepare(`INSERT INTO gsis_roster_import_rows (session_id,scope,collection,record_id,position,record_date,value_json) SELECT ?,?,json_extract(value,'$.collection'),json_extract(value,'$.record_id'),json_extract(value,'$.position'),json_extract(value,'$.record_date'),json_extract(value,'$.value_json') FROM json_each(?) WHERE ${guard}`).bind(sessionId,part.scope,JSON.stringify(rows),sessionId,token));
   statements.push(c.prepare('UPDATE gsis_roster_import_parts SET receipt_json=? WHERE session_id=? AND part_id=? AND receipt_json IS NULL AND '+guard).bind(JSON.stringify(receipt),sessionId,partId,sessionId,token));
   try{checked(await c.batch(statements));}catch(error){const saved=await partReceipt(partId);if(saved)return saved;if(/UNIQUE constraint failed.*gsis_roster_import_rows/.test(error.message))fail(409,'ROSTER_IMPORT_DUPLICATE','An import record identity occurs in more than one part.');throw error;}
   const saved=await partReceipt(partId);if(!saved)fail(409,'ROSTER_IMPORT_SESSION','This import is no longer staging.');return saved;
  }
  async function referencesReady(){await read();checked([await connection().prepare("UPDATE gsis_roster_import_sessions SET references_ready=1,updated_at=? WHERE session_id=? AND state='staging' AND NOT EXISTS(SELECT 1 FROM gsis_roster_import_parts WHERE session_id=? AND receipt_json IS NULL)").bind(Date.now(),sessionId,sessionId).run()]);return progress();}
  async function failPreparation(){await read();const c=connection();checked(await c.batch([c.prepare("UPDATE gsis_roster_import_sessions SET state='failed',updated_at=? WHERE session_id=? AND state='preparing'").bind(Date.now(),sessionId),c.prepare("UPDATE gsis_roster_import_preparation SET claim_token='',lease_until=0 WHERE session_id=? AND EXISTS(SELECT 1 FROM gsis_roster_import_sessions WHERE session_id=? AND state='failed')").bind(sessionId,sessionId)]));return progress();}
  async function finalize(){
   const row=await read();if(row?.state==='imported')return progress();if(!row?.manifest_json)fail(409,'ROSTER_IMPORT_INCOMPLETE','The immutable export is incomplete.');const m=JSON.parse(row.manifest_json),c=connection(),token=crypto.randomUUID(),now=Date.now(),metadata=JSON.stringify({source:{kind:'apps-script',sourceDigest:m.sourceDigest,manifestDigest:row.manifest_digest},importedAt:now,importSession:sessionId,digestFormat:FORMAT});
   const conditions=SCOPES.map(()=>" AND EXISTS(SELECT 1 FROM gsis_edge_heads h JOIN gsis_roster_import_locks l ON l.scope=h.scope WHERE h.scope=? AND l.session_id=? AND h.revision=l.base_revision AND h.mode='legacy') AND (SELECT COUNT(*) FROM gsis_roster_import_rows WHERE session_id=? AND scope=?)=?").join('');
   const statements=[c.prepare(`UPDATE gsis_roster_import_sessions SET state='imported',write_token=?,updated_at=? WHERE session_id=? AND state='staging' AND references_ready=1
    AND (SELECT COUNT(*) FROM gsis_roster_import_parts WHERE session_id=?)=? AND NOT EXISTS(SELECT 1 FROM gsis_roster_import_parts WHERE session_id=? AND receipt_json IS NULL)
    AND NOT EXISTS(SELECT 1 FROM gsis_edge_records WHERE scope IN ('roster','roster-register'))${conditions}`).bind(token,now,sessionId,sessionId,m.parts.length,sessionId,...SCOPES.flatMap(scope=>[scope,sessionId,sessionId,scope,m.scopes[scope].records]))];
   for(const scope of SCOPES){statements.push(c.prepare("UPDATE gsis_edge_heads SET revision=revision+1,mode='imported',write_token=?,source_digest=?,imported_records=?,metadata_json=?,updated_at=? WHERE scope=? AND "+guard).bind(token,m.scopes[scope].digest,m.scopes[scope].records,metadata,now,scope,sessionId,token));}
   statements.push(c.prepare(`INSERT INTO gsis_edge_records (scope,collection,record_id,position,record_date,value_json,revision) SELECT r.scope,r.collection,r.record_id,r.position,r.record_date,r.value_json,h.revision FROM gsis_roster_import_rows r JOIN gsis_edge_heads h ON h.scope=r.scope WHERE r.session_id=? AND h.write_token=? AND ${guard}`).bind(sessionId,token,sessionId,token));
   for(const scope of SCOPES)statements.push(c.prepare(`INSERT INTO gsis_edge_receipts (scope,actor,request_id,digest,revision,result_json,created_at) SELECT scope,?,?,?,revision,?,? FROM gsis_edge_heads WHERE scope=? AND ${guard}`).bind(actor,requestId+(scope==='roster-register'?'-register':''),row.manifest_digest,JSON.stringify({imported:true,sourceDigest:m.sourceDigest,sessionId}),now,scope,sessionId,token));
   try{checked(await c.batch(statements));}catch(error){if((await read())?.state==='imported')return progress();throw error;}const result=await progress();if(!result.imported)fail(409,'ROSTER_IMPORT_INCOMPLETE','Parts, object receipts or scope guards are incomplete; neither head was imported.');return result;
  }
  async function evidence(){const session=await progress();if(!session)fail(404,'ROSTER_IMPORT_SESSION','No retained import session.');const m=session.manifestDigest?await manifest():null,rows=await connection().prepare('SELECT receipt_json FROM gsis_roster_import_parts WHERE session_id=? AND receipt_json IS NOT NULL ORDER BY ordinal').bind(sessionId).all();return {schema:FORMAT,session,manifest:m,receipts:rows.results.map(row=>JSON.parse(row.receipt_json)),retainedInD1:true};}
  async function restart(resetRequest){
   identity(resetRequest,'restart request');const row=await read();if(!row)fail(404,'ROSTER_IMPORT_SESSION','No retained import session.');if(row.state==='abandoned'){if(row.reset_request!==resetRequest)fail(409,'ROSTER_IMPORT_RESTART','The session was already restarted by another request.');return restartResult(resetRequest);}
   const c=connection(),token=crypto.randomUUID(),statements=[c.prepare("UPDATE gsis_roster_import_sessions SET state='abandoned',reset_request=?,write_token=?,updated_at=? WHERE session_id=? AND state IN ('preparing','staging','failed','imported') AND (SELECT COUNT(*) FROM gsis_edge_heads h JOIN gsis_roster_import_locks l ON h.scope=l.scope WHERE l.session_id=? AND ((h.mode='legacy' AND h.revision=l.base_revision) OR (h.mode='imported' AND h.revision=l.base_revision+1 AND json_extract(h.metadata_json,'$.importSession')=?)))=2").bind(resetRequest,token,Date.now(),sessionId,sessionId,sessionId)];
   statements.push(c.prepare("UPDATE gsis_roster_import_preparation SET claim_token='',lease_until=0 WHERE session_id=? AND "+guard).bind(sessionId,sessionId,token));
   for(const table of ['gsis_edge_records','gsis_edge_receipts'])statements.push(c.prepare('DELETE FROM '+table+" WHERE scope IN ('roster','roster-register') AND "+guard).bind(sessionId,token));
   statements.push(c.prepare("UPDATE gsis_edge_heads SET revision=0,mode='legacy',source_digest='',imported_records=0,metadata_json='{}',write_token=?,updated_at=? WHERE scope IN ('roster','roster-register') AND "+guard).bind(token,Date.now(),sessionId,token),c.prepare('DELETE FROM gsis_roster_import_locks WHERE session_id=? AND '+guard).bind(sessionId,sessionId,token));
   try{checked(await c.batch(statements));}catch(error){if((await read())?.reset_request===resetRequest)return restartResult(resetRequest);throw error;}if((await read())?.reset_request!==resetRequest)fail(409,'ROSTER_RESTART_ACTIVE','An active, paused or changed authority cannot be reset.');return restartResult(resetRequest,{evidence:{sessionId,manifestDigest:row.manifest_digest,sourceDigest:row.source_digest},next:'Use a new request ID to capture a new Google source.'});
  }
  return {reserve,preparationStatus,claimPreparation,commitPreparation,adoptPreparation,recordPreparationFailure,assertRestartable,recordRestartCleanup,bind,progress,manifest,validatePart,partReceipt,pendingParts,segmentReceipts,stage,referencesReady,failPreparation,finalize,evidence,restart};
 }
 async function hashBytes(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
 async function stageObject(bucket,store,sessionId,part,body){
  if(!bucket?.put||!bucket?.head||!bucket?.get)fail(503,'ROSTER_IMPORT_BUCKET','Private R2 storage with verified readback is required.');
  if(part.kind==='record'){
   if(!Number.isSafeInteger(body.bytes)||body.bytes<1||body.bytes>MAX_PART_BYTES||!digestValue(body.digest))fail(409,'ROSTER_IMPORT_PART','Invalid split record descriptor.');
   const receipts=await store.segmentReceipts(body.segments);
   if(receipts.reduce((n,row)=>n+row.object.bytes,0)!==body.bytes)fail(409,'ROSTER_IMPORT_PART','The record segments are incomplete.');
   const bytes=new Uint8Array(body.bytes);let offset=0;
   for(const receipt of receipts){const segment=receipt.object,file=await bucket.get(segment.key);if(!file||file.size!==segment.bytes||file.size>SEGMENT_BYTES)fail(503,'ROSTER_IMPORT_PART','A record segment is missing or altered.');const raw=new Uint8Array(await file.arrayBuffer());if(raw.length!==segment.bytes||await hashBytes(raw)!==segment.digest)fail(503,'ROSTER_IMPORT_PART','A record segment failed its digest check.');bytes.set(raw,offset);offset+=raw.length;}
   if(await hashBytes(bytes)!==body.digest)fail(409,'ROSTER_IMPORT_PART','The assembled record failed its digest check.');
   const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));return {verified:true,rows:value.rows};
  }
  if(part.kind==='segment'){
   if(typeof body.base64!=='string'||body.base64.length>4*Math.ceil(SEGMENT_BYTES/3)||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.base64))fail(409,'ROSTER_IMPORT_OBJECT','Invalid compressed object segment.');
   const bytes=Uint8Array.from(atob(body.base64),char=>char.charCodeAt(0));if(!bytes.length||bytes.length>SEGMENT_BYTES)fail(409,'ROSTER_IMPORT_OBJECT','Invalid compressed object segment size.');const digest=await hashBytes(bytes),key='gsis/roster/import-staging/'+sessionId+'/'+part.id;
   await bucket.put(key,bytes,{customMetadata:{digest,sessionId,partId:part.id}});const saved=await bucket.head(key);if(!saved||saved.size!==bytes.length||saved.customMetadata?.digest!==digest)fail(503,'ROSTER_IMPORT_OBJECT','The compressed segment write could not be verified.');return {verified:true,key,bytes:bytes.length,digest};
  }
  if(part.kind!=='object'||!body.reference||body.reference.encoding!=='gzip-json-v1'||!digestValue(body.reference.digest)||!['baseline','audit','stapler'].includes(body.kind)||!body.reference.key?.startsWith('gsis/roster/'+body.kind+'/')||!body.reference.key.endsWith('/'+body.reference.digest+'.json.gz')||!Number.isSafeInteger(body.gzipBytes)||body.gzipBytes<1||body.gzipBytes>MAX_TOTAL_BYTES||!Array.isArray(body.segments)||!body.segments.length||body.segments.length>MAX_PARTS||new Set(body.segments).size!==body.segments.length)fail(409,'ROSTER_IMPORT_OBJECT','Invalid immutable object assembly.');
  const receipts=await store.segmentReceipts(body.segments);if(receipts.length!==body.segments.length||receipts.reduce((n,r)=>n+r.object.bytes,0)!==body.gzipBytes)fail(409,'ROSTER_IMPORT_OBJECT','The compressed object segments are incomplete.');
  // workerd requires a known-length stream for R2.put. The TransformStream
  // fallback is only for compatible local runtimes; it never buffers the object.
  const stream=typeof FixedLengthStream==='function'?new FixedLengthStream(body.gzipBytes):new TransformStream(),writer=stream.writable.getWriter();
  const upload=bucket.put(body.reference.key,stream.readable,{httpMetadata:{contentType:'application/gzip'},customMetadata:{digest:body.reference.digest,kind:body.kind,schema:'1'}}).catch(error=>{writer.abort(error).catch(()=>{});throw error;});
  const pump=(async()=>{try{for(const receipt of receipts){const segment=receipt.object,stored=await bucket.get(segment.key);if(!stored||stored.size!==segment.bytes||stored.size>SEGMENT_BYTES)fail(503,'ROSTER_IMPORT_OBJECT','A retained object segment is missing or altered.');const bytes=await stored.arrayBuffer();if(bytes.byteLength!==segment.bytes||await hashBytes(bytes)!==segment.digest)fail(503,'ROSTER_IMPORT_OBJECT','A retained object segment failed its digest check.');await writer.write(new Uint8Array(bytes));}await writer.close();}catch(error){writer.abort(error).catch(()=>{});throw error;}})();
  await Promise.all([upload,pump]);const saved=await bucket.head(body.reference.key);if(!saved||saved.size!==body.gzipBytes||saved.customMetadata?.digest!==body.reference.digest)fail(503,'ROSTER_IMPORT_OBJECT','The immutable object assembly could not be verified.');return {verified:true,key:body.reference.key,bytes:body.gzipBytes,digest:body.reference.digest};
 }

 async function pendingRollbackReset(db,actor){
  await ensure(db);const c=typeof db.withSession==='function'?db.withSession('first-primary'):db;
  if(!await c.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gsis_roster_rollback_resets'").first())return null;
  const row=await c.prepare(`SELECT r.request_id FROM gsis_roster_rollback_resets r WHERE r.actor=? AND EXISTS(SELECT 1 FROM gsis_roster_import_sessions s WHERE s.reset_request=r.request_id AND ${PENDING_CLEANUP}) ORDER BY r.created_at DESC LIMIT 1`).bind(actor).first();return row?.request_id||null;
 }
 async function resetAfterRollback(db,{actor,requestId,legacyWritesDisabled}){
  identity(actor,'actor',320);identity(requestId,'rollback reset request');
  if(legacyWritesDisabled!==false)fail(409,'ROSTER_ROLLBACK_FENCED','Google must prove its D1 writer fence is lifted before reset.');
  await ensure(db);const c=typeof db.withSession==='function'?db.withSession('first-primary'):db;
  checked(await c.batch([
   c.prepare('CREATE TABLE IF NOT EXISTS gsis_roster_rollback_resets (actor TEXT NOT NULL,request_id TEXT NOT NULL,write_token TEXT NOT NULL,proof_json TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(actor,request_id))'),
   c.prepare('CREATE TABLE IF NOT EXISTS gsis_roster_rollback_evidence (actor TEXT NOT NULL,request_id TEXT NOT NULL,source_table TEXT NOT NULL,scope TEXT NOT NULL,record_key TEXT NOT NULL,row_json TEXT NOT NULL,PRIMARY KEY(actor,request_id,source_table,record_key))')
  ]));
  const prior=()=>c.prepare('SELECT * FROM gsis_roster_rollback_resets WHERE actor=? AND request_id=?').bind(actor,requestId).first();
  const result=async replayed=>({reset:true,recordsRetained:true,replayed,requestId,sessions:(await c.prepare("SELECT session_id sessionId,actor,request_id requestId FROM gsis_roster_import_sessions WHERE state='abandoned' AND reset_request=?").bind(requestId).all()).results});
  if(await prior())return result(true);
  const heads=(await c.prepare("SELECT scope,revision,mode FROM gsis_edge_heads WHERE scope IN ('roster','roster-register') ORDER BY scope").all()).results;
  if(heads.length!==2||heads.some(h=>!['active','paused'].includes(h.mode)))fail(409,'ROSTER_ROLLBACK_STATE','Reset requires both retained Roster heads to be active or paused after manual rollback.');
  const now=Date.now(),token=crypto.randomUUID(),guard='EXISTS(SELECT 1 FROM gsis_roster_rollback_resets WHERE actor=? AND request_id=? AND write_token=?)',args=[actor,requestId,token];
  const statements=[c.prepare('INSERT INTO gsis_roster_rollback_resets(actor,request_id,write_token,proof_json,created_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM gsis_edge_heads WHERE (scope=? AND revision=? AND mode=?) OR (scope=? AND revision=? AND mode=?))=2').bind(actor,requestId,token,JSON.stringify({operation:'resetAfterRollback',legacyWritesDisabled:false,authority:'legacy',heads}),now,...heads.flatMap(h=>[h.scope,h.revision,h.mode]))];
  // Copy rows inside the same transaction. Never materialize the school history
  // in Pages memory, and retain the exact stored JSON and provider uncertainty.
  for(const table of ['gsis_edge_heads','gsis_edge_records','gsis_edge_receipts','gsis_edge_transitions','gsis_roster_import_sessions','gsis_roster_mirror_control','gsis_roster_mirror_generations','gsis_roster_mirror_outbox']){
   const columns=(await c.prepare('PRAGMA table_info('+table+')').all()).results.map(row=>row.name),scoped=columns.includes('scope');
   const json=columns.flatMap(name=>["'"+name+"'",name]).join(',');
   statements.push(c.prepare('INSERT INTO gsis_roster_rollback_evidence(actor,request_id,source_table,scope,record_key,row_json) SELECT ?,?,?, '+(scoped?'scope':"''")+',CAST(rowid AS TEXT),json_object('+json+') FROM '+table+' WHERE '+(scoped?"scope IN ('roster','roster-register') AND ":'')+guard).bind(actor,requestId,table,...args));
  }
  statements.push(c.prepare("UPDATE gsis_roster_import_sessions SET state='abandoned',reset_request=?,write_token=?,updated_at=? WHERE session_id IN (SELECT session_id FROM gsis_roster_import_locks) AND "+guard).bind(requestId,token,now,...args),c.prepare("UPDATE gsis_roster_import_preparation SET claim_token='',lease_until=0 WHERE session_id IN (SELECT session_id FROM gsis_roster_import_sessions WHERE reset_request=?) AND "+guard).bind(requestId,...args));
  for(const table of ['gsis_edge_records','gsis_edge_receipts','gsis_edge_transitions','gsis_roster_import_locks'])statements.push(c.prepare('DELETE FROM '+table+" WHERE scope IN ('roster','roster-register') AND "+guard).bind(...args));
  statements.push(c.prepare("UPDATE gsis_edge_heads SET revision=0,mode='legacy',source_digest='',imported_records=0,metadata_json='{}',write_token=?,updated_at=? WHERE scope IN ('roster','roster-register') AND "+guard).bind(token,now,...args),c.prepare("UPDATE gsis_roster_mirror_generations SET state='superseded',lease_token='',lease_until=0 WHERE state='captured' AND "+guard).bind(...args),c.prepare('DELETE FROM gsis_roster_mirror_outbox WHERE '+guard).bind(...args),c.prepare("UPDATE gsis_roster_mirror_control SET epoch=epoch+1,phase='normal',release_request='',transport_revision=0,updated_at=? WHERE id=1 AND "+guard).bind(now,...args));
  try{checked(await c.batch(statements));}catch(error){if(await prior())return result(true);throw error;}
  if(!await prior())fail(409,'ROSTER_ROLLBACK_CHANGED','Roster changed before reset. Check the current authority and retry.');return result(false);
 }
 async function latest(db){await ensure(db);return (await (typeof db.withSession==='function'?db.withSession('first-primary'):db).prepare(`SELECT s.session_id sessionId,s.actor,s.request_id requestId,s.state,s.source_digest sourceDigest,s.manifest_digest manifestDigest FROM gsis_roster_import_sessions s ORDER BY EXISTS(SELECT 1 FROM gsis_roster_import_locks l WHERE l.session_id=s.session_id) DESC,(${PENDING_CLEANUP}) DESC,s.created_at DESC,s.rowid DESC LIMIT 1`).first())||null;}

 const ARCHIVES='gsis_roster_import_archives',ARCHIVE_PREFIX='gsis/roster/import-archives/v1/',ARCHIVE_FORMAT='gsis-roster-import-archive-v1',ARCHIVE_LEASE=90000;
 const archiveSchemas=new WeakMap(),archiveConnection=db=>typeof db.withSession==='function'?db.withSession('first-primary'):db;
 async function archiveSchema(db){
  await ensure(db);
  if(!archiveSchemas.has(db))archiveSchemas.set(db,(async()=>{
   const c=archiveConnection(db);
   checked([await c.prepare(`CREATE TABLE IF NOT EXISTS ${ARCHIVES}(session_id TEXT PRIMARY KEY,state TEXT NOT NULL,manifest_json TEXT NOT NULL,cursor_json TEXT NOT NULL,manifest_key TEXT NOT NULL DEFAULT '',manifest_digest TEXT NOT NULL DEFAULT '',lease_token TEXT NOT NULL DEFAULT '',lease_until INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)`).run()]);
   const tables=['gsis_roster_import_sessions','gsis_roster_import_preparation','gsis_roster_import_locks','gsis_roster_import_parts','gsis_roster_import_rows'];
   if(await c.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='gsis_roster_import_jobs'").first())tables.push('gsis_roster_import_jobs');
   const definitions=[];
   for(const table of tables){
    const columns=(await c.prepare('PRAGMA table_info('+table+')').all()).results.map(row=>row.name);
    if(columns.some(name=>!/^[a-z_]+$/.test(name)))fail(503,'ROSTER_IMPORT_ARCHIVE_SCHEMA','Import archive columns could not be verified.');
    const schema=await c.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").bind(table).first();definitions.push({name:table,columns,schema:schema.sql});
    // These session-scoped rows are immutable while copying spans requests.
    // The final guarded batch changes state before deleting any source row.
    for(const event of ['INSERT','UPDATE','DELETE']){
     const refs=event==='INSERT'?['NEW']:event==='DELETE'?['OLD']:['OLD','NEW'],condition=refs.map(ref=>`EXISTS(SELECT 1 FROM ${ARCHIVES} WHERE session_id=${ref}.session_id AND state='copying')`).join(' OR ');
     checked([await c.prepare(`CREATE TRIGGER IF NOT EXISTS ${table}_archive_${event.toLowerCase()} BEFORE ${event} ON ${table} WHEN ${condition} BEGIN SELECT RAISE(ABORT,'ROSTER_IMPORT_ARCHIVING'); END`).run()]);
    }
   }
   return definitions;
  })().catch(error=>{archiveSchemas.delete(db);throw error;}));
  const definitions=await archiveSchemas.get(db);
  // R7 can create its continuation table after this isolate first saw a session.
  if(!definitions.some(d=>d.name==='gsis_roster_import_jobs')&&await archiveConnection(db).prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='gsis_roster_import_jobs'").first()){archiveSchemas.delete(db);return archiveSchema(db);}
  return definitions;
 }
 function archiveEligible(definitions){
  return `s.state='abandoned' AND s.session_id NOT IN(SELECT session_id FROM gsis_roster_import_sessions ORDER BY created_at DESC,rowid DESC LIMIT 2)
   AND NOT EXISTS(SELECT 1 FROM gsis_roster_import_locks WHERE session_id=s.session_id)
   AND NOT (${PENDING_CLEANUP}) AND NOT EXISTS(SELECT 1 FROM gsis_roster_import_preparation WHERE session_id=s.session_id AND lease_until>${Date.now()})
   ${definitions.some(d=>d.name==='gsis_roster_import_jobs')?`AND NOT EXISTS(SELECT 1 FROM gsis_roster_import_jobs WHERE session_id=s.session_id AND (state IN ('waiting','running') OR lease_until>${Date.now()}))`:''}`;
 }
 async function archiveStatus(db){
  const definitions=await archiveSchema(db),c=archiveConnection(db),retained=await c.prepare('SELECT COUNT(*) n FROM gsis_roster_import_sessions').first(),eligible=await c.prepare(`SELECT COUNT(*) n FROM gsis_roster_import_sessions s WHERE ${archiveEligible(definitions)}`).first(),archives=(await c.prepare(`SELECT session_id sessionId,manifest_key key,manifest_digest digest,updated_at archivedAt FROM ${ARCHIVES} WHERE state='archived' ORDER BY updated_at DESC LIMIT 24`).all()).results;
  return {retained:retained.n,capacity:MAX_RETAINED_SESSIONS,pending:eligible.n,archives};
 }
 async function archiveRead(bucket,part){
  const stored=await bucket.get(part.key);if(!stored||stored.size!==part.gzipBytes)fail(503,'ROSTER_IMPORT_ARCHIVE_VERIFY','The import archive readback length did not match.');
  const zipped=await stored.arrayBuffer();if(zipped.byteLength!==part.gzipBytes||await hashBytes(zipped)!==part.gzipDigest)fail(503,'ROSTER_IMPORT_ARCHIVE_VERIFY','The compressed import archive failed checksum verification.');
  const raw=await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  if(utf8Length(raw)!==part.bytes||await hashText(raw)!==part.digest)fail(503,'ROSTER_IMPORT_ARCHIVE_VERIFY','The import archive JSON failed checksum verification.');return raw;
 }
 async function archiveWrite(bucket,sessionId,value){
  const raw=JSON.stringify(value),digest=await hashText(raw);if(utf8Length(raw)>8388608)fail(413,'ROSTER_IMPORT_ARCHIVE_SIZE','An import archive page exceeds its bounded size.');
  const zipped=await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(),part={key:ARCHIVE_PREFIX+sessionId+'/'+digest+'.json.gz',digest,bytes:utf8Length(raw),gzipBytes:zipped.byteLength,gzipDigest:await hashBytes(zipped)};
  await bucket.put(part.key,zipped,{httpMetadata:{contentType:'application/gzip'},customMetadata:{digest,schema:ARCHIVE_FORMAT}});
  if(await archiveRead(bucket,part)!==raw)fail(503,'ROSTER_IMPORT_ARCHIVE_VERIFY','The import archive readback differs from its source.');return part;
 }
 async function archiveRetained(db,bucket,{maxSteps=4,budgetMs=8000}={}){
  const definitions=await archiveSchema(db),c=archiveConnection(db),started=Date.now(),eligible=archiveEligible(definitions);
  let job=await c.prepare(`SELECT * FROM ${ARCHIVES} WHERE state='copying' ORDER BY updated_at,session_id LIMIT 1`).first();
  if(!job){
   const session=await c.prepare(`SELECT s.* FROM gsis_roster_import_sessions s WHERE ${eligible} AND NOT EXISTS(SELECT 1 FROM ${ARCHIVES} WHERE session_id=s.session_id) ORDER BY s.created_at,s.rowid LIMIT 1`).first();
   if(!session)return {archived:0,processed:0,...await archiveStatus(db)};
   const manifest={schema:ARCHIVE_FORMAT,sessionId:session.session_id,tables:[],parts:[]};
   for(const definition of definitions){const count=await c.prepare('SELECT COUNT(*) n FROM '+definition.name+' WHERE session_id=?').bind(session.session_id).first();manifest.tables.push({...definition,rows:count.n});}
   checked([await c.prepare(`INSERT INTO ${ARCHIVES}(session_id,state,manifest_json,cursor_json,updated_at) SELECT ?,'copying',?,?,? WHERE EXISTS(SELECT 1 FROM gsis_roster_import_sessions s WHERE s.session_id=? AND ${eligible}) AND NOT EXISTS(SELECT 1 FROM ${ARCHIVES} WHERE state='copying') ON CONFLICT(session_id) DO NOTHING`).bind(session.session_id,JSON.stringify(manifest),JSON.stringify({phase:'copy',table:0,after:0}),started,session.session_id).run()]);
   job=await c.prepare(`SELECT * FROM ${ARCHIVES} WHERE state='copying' ORDER BY updated_at,session_id LIMIT 1`).first();if(!job)return {archived:0,processed:0,...await archiveStatus(db)};
  }
  if(!bucket?.put||!bucket?.get)fail(503,'ROSTER_IMPORT_ARCHIVE_BUCKET','Private R2 storage with verified readback is required to archive import sessions.');
  const token=crypto.randomUUID(),claim=await c.prepare(`UPDATE ${ARCHIVES} SET lease_token=?,lease_until=? WHERE session_id=? AND state='copying' AND lease_until<=?`).bind(token,Date.now()+ARCHIVE_LEASE,job.session_id,Date.now()).run();checked([claim]);
  if(!claim.meta?.changes)return {archived:0,processed:0,busy:true,...await archiveStatus(db)};
  let cursor=JSON.parse(job.cursor_json),manifest=JSON.parse(job.manifest_json),processed=0,archived=0;
  const persist=async()=>{const result=await c.prepare(`UPDATE ${ARCHIVES} SET manifest_json=?,cursor_json=?,updated_at=? WHERE session_id=? AND state='copying' AND lease_token=? AND lease_until>?`).bind(JSON.stringify(manifest),JSON.stringify(cursor),Date.now(),job.session_id,token,Date.now()).run();checked([result]);if(!result.meta?.changes)fail(409,'ROSTER_IMPORT_ARCHIVE_LEASE','Archive ownership changed. Retry to resume its verified checkpoint.');};
  try{
   for(const definition of definitions)if(!manifest.tables.some(table=>table.name===definition.name)){const count=await c.prepare('SELECT COUNT(*) n FROM '+definition.name+' WHERE session_id=?').bind(job.session_id).first();const index=manifest.tables.length;manifest.tables.push({...definition,rows:count.n});if(cursor.phase==='verify')cursor={phase:'copy',table:index,after:0};await persist();}
   for(;processed<Math.max(1,Math.min(20,maxSteps))&&Date.now()-started<Math.max(1,Math.min(15000,budgetMs));processed++){
    if(cursor.phase==='copy'){
     const table=manifest.tables[cursor.table];
     if(!table){cursor={phase:'verify',part:0};await persist();continue;}
     const projection=table.columns.flatMap(name=>["'"+name+"'",name]).join(','),rows=(await c.prepare(`WITH candidates AS (SELECT rowid source_id,json_object(${projection}) row_json FROM ${table.name} WHERE session_id=? AND rowid>? ORDER BY rowid LIMIT 64), bounded AS (SELECT *,SUM(length(CAST(row_json AS BLOB))) OVER(ORDER BY source_id) bytes FROM candidates) SELECT source_id,row_json FROM bounded WHERE bytes<=262144 OR source_id=(SELECT MIN(source_id) FROM candidates) ORDER BY source_id`).bind(job.session_id,cursor.after).all()).results;
     if(!rows.length){cursor={phase:'copy',table:cursor.table+1,after:0};await persist();continue;}
     const part=await archiveWrite(bucket,job.session_id,{schema:ARCHIVE_FORMAT,sessionId:job.session_id,table:table.name,rows:rows.map(row=>JSON.parse(row.row_json))});manifest.parts.push({...part,table:table.name,rows:rows.length});cursor.after=rows.at(-1).source_id;await persist();continue;
    }
    const part=manifest.parts[cursor.part];if(part){await archiveRead(bucket,part);cursor.part++;await persist();continue;}
    for(const table of manifest.tables)if(manifest.parts.filter(p=>p.table===table.name).reduce((n,p)=>n+p.rows,0)!==table.rows)fail(503,'ROSTER_IMPORT_ARCHIVE_VERIFY','Import archive row counts did not match the frozen source.');
    const saved=await archiveWrite(bucket,job.session_id,manifest),guard=`EXISTS(SELECT 1 FROM ${ARCHIVES} WHERE session_id=? AND state='deleting' AND lease_token=?)`,args=[job.session_id,token];
    const statements=[c.prepare(`UPDATE ${ARCHIVES} SET state='deleting',manifest_key=?,manifest_digest=? WHERE session_id=? AND state='copying' AND lease_token=? AND lease_until>? AND EXISTS(SELECT 1 FROM gsis_roster_import_sessions s WHERE s.session_id=? AND ${archiveEligible(definitions)})`).bind(saved.key,saved.digest,job.session_id,token,Date.now(),job.session_id)];
    for(const table of [...manifest.tables].reverse())statements.push(c.prepare('DELETE FROM '+table.name+' WHERE session_id=? AND '+guard).bind(job.session_id,...args));
    statements.push(c.prepare(`UPDATE ${ARCHIVES} SET state='archived',lease_token='',lease_until=0,updated_at=? WHERE session_id=? AND ${guard}`).bind(Date.now(),job.session_id,...args));
    checked(await c.batch(statements));const final=await c.prepare(`SELECT state FROM ${ARCHIVES} WHERE session_id=?`).bind(job.session_id).first();if(final.state!=='archived')fail(409,'ROSTER_IMPORT_ARCHIVE_CHANGED','The retained-session protection changed; no source records were deleted.');archived=1;break;
   }
  }finally{checked([await c.prepare(`UPDATE ${ARCHIVES} SET lease_token='',lease_until=0 WHERE session_id=? AND lease_token=?`).bind(job.session_id,token).run()]);}
  return {archived,processed,...await archiveStatus(db)};
 }
 return {objectJobs,prepareObject,prepareRecords,finishFreeze,freeze,validateManifest,utf8Length,open,ensure,latest,resetAfterRollback,pendingRollbackReset,archiveRetained,archiveStatus,hashText,hashBytes,stageObject,FORMAT,SCOPES,TARGET_BYTES,SEGMENT_BYTES,MAX_PART_BYTES,MAX_PARTS,MAX_MANIFEST_BYTES,MAX_TOTAL_BYTES,MAX_OBJECT_BYTES,MAX_RETAINED_SESSIONS,PREPARATION_LEASE_MS,MAX_PREPARATION_RESULT_BYTES};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSiSRosterImport;
