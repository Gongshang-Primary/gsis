/* Immutable Roster preparation. Source capture stays in Google; D1 remains legacy
 * until the complete, verified session is committed in one transaction. */
var GSiSRosterImport=(()=>{
 const Store=typeof GSiSEdgeStore!=='undefined'?GSiSEdgeStore:require('./edge-store.js');
 const FORMAT='gsis-roster-import-v1',TARGET_BYTES=196608,SEGMENT_BYTES=196608,MAX_PART_BYTES=1900000,MAX_MANIFEST_BYTES=524288,MAX_PARTS=2048,MAX_TOTAL_BYTES=41943040,MAX_OBJECT_BYTES=33554432,MAX_RETAINED_SESSIONS=8;
 const SCOPES=['roster','roster-register'];
 const fail=(status,code,message)=>{throw Object.assign(Error(message),{status,code});};
 function utf8Length(value){let size=0;for(const char of value){const n=char.codePointAt(0);size+=n<128?1:n<2048?2:n<65536?3:4;}return size;}
 function digestValue(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
 function identity(value,name,max=200){if(typeof value!=='string'||!value||value.length>max||/[\u0000-\u001f]/.test(value))fail(400,'ROSTER_IMPORT_ID','Invalid '+name+'.');return value;}
 function freeze(snapshot,binding,adapter){
  const {actor,requestId,sessionId}=binding;identity(actor,'actor',320);identity(requestId,'request');if(!digestValue(sessionId)||!digestValue(snapshot.sourceDigest))fail(400,'ROSTER_IMPORT_DIGEST','Invalid import digest.');
  const state=JSON.parse(JSON.stringify(snapshot.state)),index=JSON.parse(JSON.stringify(snapshot.index)),parts=[],manifest={schema:FORMAT,sessionId,actor,requestId,sourceDigest:snapshot.sourceDigest,parts:[],scopes:{},totalBytes:0};
  function add(kind,body,scope='',records=0){const payload=JSON.stringify(body),bytes=utf8Length(payload);if(bytes>MAX_PART_BYTES||manifest.parts.length>=MAX_PARTS||manifest.totalBytes+bytes>MAX_TOTAL_BYTES)fail(413,'ROSTER_IMPORT_LIMIT','The immutable export exceeds a documented part/container limit.');const id='part-'+String(parts.length).padStart(5,'0');manifest.parts.push({id,kind,scope,records,offset:manifest.totalBytes,bytes,digest:adapter.hash(payload)});parts.push(payload);manifest.totalBytes+=bytes;return id;}
  function object(kind,id,value){
   const json=JSON.stringify(value);if(utf8Length(json)>MAX_OBJECT_BYTES)fail(413,'ROSTER_IMPORT_OBJECT_LIMIT','A captured object exceeds the supported 32 MiB source-object bound.');const digest=adapter.hash(json),reference={key:'gsis/roster/'+kind+'/'+encodeURIComponent(id)+'/'+digest+'.json.gz',digest,encoding:'gzip-json-v1'},gzip=adapter.gzip(json),segments=[];
   for(let n=0;n<gzip.length;n+=SEGMENT_BYTES)segments.push(add('segment',{base64:adapter.base64(gzip.slice(n,n+SEGMENT_BYTES))}));
   add('object',{reference,kind,gzipBytes:gzip.length,segments});return reference;
  }
  for(const entry of index.entries||[]){if(!entry.modelFile)fail(409,'ROSTER_IMPORT_MODEL','The captured model has no immutable file identity.');entry.modelObject=object('baseline',entry.id,adapter.readModel(entry));entry.modelObjectKey=entry.modelObject.key;entry.modelDigest=entry.modelObject.digest;delete entry.modelFile;}
  for(const [date,meta] of Object.entries(state.allocationAuditExports||{}))if(meta.archiveFileId){meta.archiveObject=object('audit',date,adapter.readArchive(date,meta.archiveFileId));delete meta.archiveFileId;}
  for(const row of [...(state.staplerPlans||[]),...(state.staplerArchives||[])])for(const field of ['draft','published','confirmedPlan'])if(row[field]&&!row[field].edgeObject)row[field]={edgeObject:true,...object('stapler',(row.id||row.date)+'/'+field,row[field])};
  for(const [scope,value]of [['roster',state],['roster-register',index]]){
   // Encode the entire collection once: natural-key multiplicity and positions
   // are global. Encoding arbitrary slices changes durable record identities.
   const records=Store.encode(value);manifest.scopes[scope]={records:records.size,digest:adapter.hash(Store.canonicalJson(value))};let rows=[],bytes=12;
   for(const row of records.values()){const size=utf8Length(JSON.stringify(row))+1;if(rows.length&&bytes+size>TARGET_BYTES){add('records',{rows},scope,rows.length);rows=[];bytes=12;}rows.push(row);bytes+=size;}
   if(rows.length)add('records',{rows},scope,rows.length);
  }
  validateManifest(manifest);return {manifest,manifestDigest:adapter.hash(JSON.stringify(manifest)),parts};
 }
 function validateManifest(manifest){
  if(!manifest||manifest.schema!==FORMAT||!digestValue(manifest.sessionId)||!digestValue(manifest.sourceDigest)||utf8Length(JSON.stringify(manifest))>MAX_MANIFEST_BYTES)fail(400,'ROSTER_IMPORT_MANIFEST','Invalid or oversized immutable manifest.');
  identity(manifest.actor,'actor',320);identity(manifest.requestId,'request');if(!Array.isArray(manifest.parts)||!manifest.parts.length||manifest.parts.length>MAX_PARTS||!manifest.scopes||Object.keys(manifest.scopes).sort().join(',')!==[...SCOPES].sort().join(','))fail(400,'ROSTER_IMPORT_MANIFEST','Invalid manifest scopes or parts.');
  let offset=0;const ids=new Set(),counts={roster:0,'roster-register':0};for(const part of manifest.parts){identity(part.id,'part',80);if(ids.has(part.id)||!['records','segment','object'].includes(part.kind)||part.offset!==offset||!Number.isSafeInteger(part.bytes)||part.bytes<1||part.bytes>MAX_PART_BYTES||!digestValue(part.digest)||!Number.isSafeInteger(part.records)||part.records<0||part.kind==='records'&&!SCOPES.includes(part.scope)||part.kind!=='records'&&(part.scope!==''||part.records!==0))fail(400,'ROSTER_IMPORT_MANIFEST','Duplicate, missing or invalid manifest part.');ids.add(part.id);offset+=part.bytes;if(part.kind==='records')counts[part.scope]+=part.records;}
  if(offset!==manifest.totalBytes||offset>MAX_TOTAL_BYTES||SCOPES.some(scope=>!digestValue(manifest.scopes[scope]?.digest)||manifest.scopes[scope]?.records!==counts[scope]||counts[scope]<1))fail(400,'ROSTER_IMPORT_MANIFEST','Manifest lengths or record counts do not match.');return manifest;
 }
 const SQL=`CREATE TABLE IF NOT EXISTS gsis_roster_import_sessions (
 session_id TEXT PRIMARY KEY, actor TEXT NOT NULL, request_id TEXT NOT NULL, state TEXT NOT NULL,
 manifest_json TEXT NOT NULL DEFAULT '', manifest_digest TEXT NOT NULL DEFAULT '', source_digest TEXT NOT NULL DEFAULT '',
 references_ready INTEGER NOT NULL DEFAULT 0, write_token TEXT NOT NULL DEFAULT '', reset_request TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(actor,request_id));
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
  async function reserve(){
   const prior=await read();if(prior){if(prior.state==='abandoned')fail(409,'ROSTER_IMPORT_RESTART','This retained session was restarted. Use a new request ID.');return progress();}
   const retained=await connection().prepare('SELECT COUNT(*) n FROM gsis_roster_import_sessions').first();if(retained.n>=MAX_RETAINED_SESSIONS)fail(409,'ROSTER_IMPORT_CAPACITY','Preparation has eight retained sessions. Reviewed archival and cleanup are required before a new capture; existing sessions remain resumable.');
   const c=connection(),now=Date.now(),stmt=[c.prepare(`INSERT INTO gsis_roster_import_sessions (session_id,actor,request_id,state,created_at,updated_at)
    SELECT ?,?,?,'preparing',?,? WHERE (SELECT COUNT(*) FROM gsis_edge_heads WHERE scope IN ('roster','roster-register') AND mode='legacy' AND revision=0)=2
    AND NOT EXISTS(SELECT 1 FROM gsis_edge_records WHERE scope IN ('roster','roster-register')) AND NOT EXISTS(SELECT 1 FROM gsis_roster_import_locks) AND (SELECT COUNT(*) FROM gsis_roster_import_sessions)<?`).bind(sessionId,actor,requestId,now,now,MAX_RETAINED_SESSIONS)];
   for(const scope of SCOPES)stmt.push(c.prepare('INSERT INTO gsis_roster_import_locks (scope,session_id,base_revision) SELECT scope,?,revision FROM gsis_edge_heads WHERE scope=? AND EXISTS(SELECT 1 FROM gsis_roster_import_sessions WHERE session_id=?)').bind(sessionId,scope,sessionId));
   try{checked(await c.batch(stmt));}catch(error){if(await read())return progress();throw error;}
   if(!await read())fail(409,'ROSTER_IMPORT_BUSY','Both scopes must be empty and legacy, with no other import in progress. Resume or explicitly restart the retained session.');return progress();
  }
  async function bind(manifest,manifestDigest){
   validateManifest(manifest);if(manifest.actor!==actor||manifest.requestId!==requestId||manifest.sessionId!==sessionId||await hashText(JSON.stringify(manifest))!==manifestDigest)fail(409,'ROSTER_IMPORT_ID','The manifest does not match this actor, request and session.');
   const row=await read();if(!row)fail(409,'ROSTER_IMPORT_SESSION','Reserve the import before binding its source.');if(row.manifest_digest){if(row.manifest_digest!==manifestDigest)fail(409,'ROSTER_IMPORT_SOURCE_CHANGED','This request already captured another immutable source.');return progress();}
   if(row.state!=='preparing')fail(409,'ROSTER_IMPORT_RESTART','This session requires an explicit restart.');const token=crypto.randomUUID(),c=connection();
   const statements=[c.prepare("UPDATE gsis_roster_import_sessions SET state='staging',manifest_json=?,manifest_digest=?,source_digest=?,write_token=?,updated_at=? WHERE session_id=? AND state='preparing' AND manifest_digest=''").bind(JSON.stringify(manifest),manifestDigest,manifest.sourceDigest,token,Date.now(),sessionId),c.prepare(`INSERT INTO gsis_roster_import_parts (session_id,part_id,ordinal,kind,scope,digest,bytes,records)
    SELECT ?,json_extract(value,'$.id'),CAST(key AS INTEGER),json_extract(value,'$.kind'),json_extract(value,'$.scope'),json_extract(value,'$.digest'),json_extract(value,'$.bytes'),json_extract(value,'$.records') FROM json_each(?) WHERE ${guard}`).bind(sessionId,JSON.stringify(manifest.parts),sessionId,token)];
   try{checked(await c.batch(statements));}catch(error){const saved=await read();if(saved?.manifest_digest===manifestDigest)return progress();throw error;}return progress();
  }
  async function progress(){const row=await read();if(!row)return null;const c=connection(),count=await c.prepare('SELECT COUNT(*) total,SUM(receipt_json IS NOT NULL) completed FROM gsis_roster_import_parts WHERE session_id=?').bind(sessionId).first(),next=await c.prepare('SELECT part_id id,kind,scope,digest,bytes,records FROM gsis_roster_import_parts WHERE session_id=? AND receipt_json IS NULL ORDER BY ordinal LIMIT 1').bind(sessionId).first();return {sessionId,requestId,actor,state:row.state,sourceDigest:row.source_digest||null,manifestDigest:row.manifest_digest||null,completedParts:count.completed||0,totalParts:count.total,imported:row.state==='imported',referencesReady:!!row.references_ready,nextPart:next||null,requiresRestart:['failed','abandoned'].includes(row.state),next:row.state==='preparing'?'prepare':next?'part':!row.references_ready?'references':row.state==='imported'?'complete':'finalize'};}
  async function manifest(){const row=await read();if(!row?.manifest_json)fail(409,'ROSTER_IMPORT_PREPARING','The immutable snapshot is not ready.');return JSON.parse(row.manifest_json);}
  async function partReceipt(partId){identity(partId,'part',80);await read();const row=await connection().prepare('SELECT receipt_json FROM gsis_roster_import_parts WHERE session_id=? AND part_id=?').bind(sessionId,partId).first();return row?.receipt_json?JSON.parse(row.receipt_json):null;}
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
   let rows=[];if(part.kind==='records'){
    rows=body.rows;if(!Array.isArray(rows)||rows.length!==part.records)fail(409,'ROSTER_IMPORT_PART','The export record count is invalid.');const ids=new Set();
    for(const r of rows){identity(r.collection,'collection',250);identity(r.record_id,'record',1024);if(!Number.isSafeInteger(r.position)||r.position<0||typeof r.record_date!=='string'||!/^$|^20\d\d-\d\d-\d\d$/.test(r.record_date)||typeof r.value_json!=='string'||utf8Length(r.value_json)>Store.MAX_RECORD_BYTES)fail(409,'ROSTER_IMPORT_PART','Invalid exported record.');try{JSON.parse(r.value_json);}catch{fail(409,'ROSTER_IMPORT_PART','Invalid exported record JSON.');}const id=JSON.stringify([r.collection,r.record_id]);if(ids.has(id))fail(409,'ROSTER_IMPORT_DUPLICATE','Duplicate record identity in import part.');ids.add(id);}
   }else{
    if(!objectReceipt||objectReceipt.verified!==true||typeof objectReceipt.key!=='string'||!Number.isSafeInteger(objectReceipt.bytes)||objectReceipt.bytes<1)fail(409,'ROSTER_IMPORT_OBJECT','The private object write has no verified receipt.');
    if(part.kind==='object'){
     if(!body.reference||body.reference.encoding!=='gzip-json-v1'||!digestValue(body.reference.digest)||!body.reference.key.startsWith('gsis/roster/')||!body.reference.key.endsWith('/'+body.reference.digest+'.json.gz')||objectReceipt.key!==body.reference.key||objectReceipt.bytes!==body.gzipBytes||!Array.isArray(body.segments)||!body.segments.length||new Set(body.segments).size!==body.segments.length)fail(409,'ROSTER_IMPORT_OBJECT','Invalid assembled private object.');
     const dependencies=await connection().prepare("SELECT part_id,receipt_json FROM gsis_roster_import_parts WHERE session_id=? AND kind='segment' AND part_id IN (SELECT value FROM json_each(?))").bind(sessionId,JSON.stringify(body.segments)).all();if(dependencies.results.length!==body.segments.length||dependencies.results.some(row=>!row.receipt_json)||dependencies.results.reduce((n,row)=>n+(JSON.parse(row.receipt_json).object?.bytes||0),0)!==body.gzipBytes)fail(409,'ROSTER_IMPORT_OBJECT','The object segments are incomplete.');
    }else if(objectReceipt.key!=='gsis/roster/import-staging/'+sessionId+'/'+partId||objectReceipt.bytes>SEGMENT_BYTES||!digestValue(objectReceipt.digest))fail(409,'ROSTER_IMPORT_OBJECT','Invalid private object segment.');
   }
   const receipt={partId,digest:part.digest,records:rows.length,...(objectReceipt?{object:objectReceipt}:{} )},c=connection(),token=crypto.randomUUID(),now=Date.now();
   const statements=[c.prepare("UPDATE gsis_roster_import_sessions SET write_token=?,updated_at=? WHERE session_id=? AND state='staging' AND EXISTS(SELECT 1 FROM gsis_roster_import_parts WHERE session_id=? AND part_id=? AND receipt_json IS NULL)").bind(token,now,sessionId,sessionId,partId)];
   if(rows.length)statements.push(c.prepare(`INSERT INTO gsis_roster_import_rows (session_id,scope,collection,record_id,position,record_date,value_json) SELECT ?,?,json_extract(value,'$.collection'),json_extract(value,'$.record_id'),json_extract(value,'$.position'),json_extract(value,'$.record_date'),json_extract(value,'$.value_json') FROM json_each(?) WHERE ${guard}`).bind(sessionId,part.scope,JSON.stringify(rows),sessionId,token));
   statements.push(c.prepare('UPDATE gsis_roster_import_parts SET receipt_json=? WHERE session_id=? AND part_id=? AND receipt_json IS NULL AND '+guard).bind(JSON.stringify(receipt),sessionId,partId,sessionId,token));
   try{checked(await c.batch(statements));}catch(error){const saved=await partReceipt(partId);if(saved)return saved;if(/UNIQUE constraint failed.*gsis_roster_import_rows/.test(error.message))fail(409,'ROSTER_IMPORT_DUPLICATE','An import record identity occurs in more than one part.');throw error;}
   const saved=await partReceipt(partId);if(!saved)fail(409,'ROSTER_IMPORT_SESSION','This import is no longer staging.');return saved;
  }
  async function referencesReady(){await read();checked([await connection().prepare("UPDATE gsis_roster_import_sessions SET references_ready=1,updated_at=? WHERE session_id=? AND state='staging' AND NOT EXISTS(SELECT 1 FROM gsis_roster_import_parts WHERE session_id=? AND receipt_json IS NULL)").bind(Date.now(),sessionId,sessionId).run()]);return progress();}
  async function failPreparation(){await read();checked([await connection().prepare("UPDATE gsis_roster_import_sessions SET state='failed',updated_at=? WHERE session_id=? AND state='preparing'").bind(Date.now(),sessionId).run()]);return progress();}
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
   identity(resetRequest,'restart request');const row=await read();if(!row)fail(404,'ROSTER_IMPORT_SESSION','No retained import session.');if(row.state==='abandoned'){if(row.reset_request!==resetRequest)fail(409,'ROSTER_IMPORT_RESTART','The session was already restarted by another request.');return {restarted:true,sessionId,retained:true};}
   const c=connection(),token=crypto.randomUUID(),statements=[c.prepare("UPDATE gsis_roster_import_sessions SET state='abandoned',reset_request=?,write_token=?,updated_at=? WHERE session_id=? AND state IN ('preparing','staging','failed','imported') AND (SELECT COUNT(*) FROM gsis_edge_heads h JOIN gsis_roster_import_locks l ON h.scope=l.scope WHERE l.session_id=? AND ((h.mode='legacy' AND h.revision=l.base_revision) OR (h.mode='imported' AND h.revision=l.base_revision+1 AND json_extract(h.metadata_json,'$.importSession')=?)))=2").bind(resetRequest,token,Date.now(),sessionId,sessionId,sessionId)];
   for(const table of ['gsis_edge_records','gsis_edge_receipts'])statements.push(c.prepare('DELETE FROM '+table+" WHERE scope IN ('roster','roster-register') AND "+guard).bind(sessionId,token));
   statements.push(c.prepare("UPDATE gsis_edge_heads SET revision=0,mode='legacy',source_digest='',imported_records=0,metadata_json='{}',write_token=?,updated_at=? WHERE scope IN ('roster','roster-register') AND "+guard).bind(token,Date.now(),sessionId,token),c.prepare('DELETE FROM gsis_roster_import_locks WHERE session_id=? AND '+guard).bind(sessionId,sessionId,token));
   try{checked(await c.batch(statements));}catch(error){if((await read())?.reset_request===resetRequest)return {restarted:true,sessionId,retained:true};throw error;}if((await read())?.reset_request!==resetRequest)fail(409,'ROSTER_RESTART_ACTIVE','An active, paused or changed authority cannot be reset.');return {restarted:true,sessionId,retained:true,evidence:{sessionId,manifestDigest:row.manifest_digest,sourceDigest:row.source_digest},next:'Use a new request ID to capture a new Google source.'};
  }
  return {reserve,bind,progress,manifest,validatePart,partReceipt,segmentReceipts,stage,referencesReady,failPreparation,finalize,evidence,restart};
 }
 async function hashBytes(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');}
 async function stageObject(bucket,store,sessionId,part,body){
  if(!bucket?.put||!bucket?.head||!bucket?.get)fail(503,'ROSTER_IMPORT_BUCKET','Private R2 storage with verified readback is required.');
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

 async function latest(db){await ensure(db);return (await (typeof db.withSession==='function'?db.withSession('first-primary'):db).prepare('SELECT s.session_id sessionId,s.actor,s.request_id requestId,s.state,s.source_digest sourceDigest,s.manifest_digest manifestDigest FROM gsis_roster_import_sessions s ORDER BY EXISTS(SELECT 1 FROM gsis_roster_import_locks l WHERE l.session_id=s.session_id) DESC,s.created_at DESC,s.rowid DESC LIMIT 1').first())||null;}

 return {freeze,validateManifest,utf8Length,open,ensure,latest,hashText,hashBytes,stageObject,FORMAT,SCOPES,TARGET_BYTES,SEGMENT_BYTES,MAX_PART_BYTES,MAX_PARTS,MAX_MANIFEST_BYTES,MAX_TOTAL_BYTES,MAX_OBJECT_BYTES,MAX_RETAINED_SESSIONS};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSiSRosterImport;
