/* D1 owns records, revisions and receipts together. Domain rules remain in callers. */
var GSiSEdgeStore=(()=>{
 const SCHEMA=`CREATE TABLE IF NOT EXISTS gsis_edge_heads (
 scope TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
 mode TEXT NOT NULL DEFAULT 'legacy' CHECK(mode IN ('legacy','imported','active','paused')),
 write_token TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
 source_digest TEXT NOT NULL DEFAULT '', imported_records INTEGER NOT NULL DEFAULT 0,
 metadata_json TEXT NOT NULL DEFAULT '{}', schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version = 1));
CREATE TABLE IF NOT EXISTS gsis_edge_records (
 scope TEXT NOT NULL REFERENCES gsis_edge_heads(scope) ON DELETE CASCADE, collection TEXT NOT NULL,
 record_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, record_date TEXT NOT NULL DEFAULT '',
 value_json TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(scope,collection,record_id));
CREATE INDEX IF NOT EXISTS gsis_edge_records_date ON gsis_edge_records(scope,collection,record_date,record_id);
CREATE INDEX IF NOT EXISTS gsis_edge_dispatch_outbox ON gsis_edge_records(scope,collection,record_id)
 WHERE collection='outbox' AND record_id<>'$' AND (COALESCE(json_extract(value_json,'$.status'),'') NOT IN ('sent','cancelled','superseded','expired') OR (json_extract(value_json,'$.deliveryStatus') IN ('delivered','read') AND json_extract(value_json,'$.status')<>'sent'));
CREATE INDEX IF NOT EXISTS gsis_edge_dispatch_inbox_messages ON gsis_edge_records(scope,collection,record_id)
 WHERE collection='inboxMessages' AND record_id<>'$' AND json_extract(value_json,'$.direction')='outbound' AND json_extract(value_json,'$.status') IN ('queued','sending');
CREATE INDEX IF NOT EXISTS gsis_edge_dispatch_inbox_alerts ON gsis_edge_records(scope,collection,record_id)
 WHERE collection='inboxAlerts' AND record_id<>'$' AND json_extract(value_json,'$.status') IN ('queued','sending');
CREATE INDEX IF NOT EXISTS gsis_edge_dispatch_peer_mail ON gsis_edge_records(scope,collection,record_id)
 WHERE collection='peerMail' AND record_id<>'$' AND COALESCE(json_extract(value_json,'$.status'),'') NOT IN ('sent','cancelled');
CREATE INDEX IF NOT EXISTS gsis_edge_dispatch_peer_requests ON gsis_edge_records(scope,collection,CAST(json_extract(value_json,'$.expiresAt') AS REAL),json_extract(value_json,'$.date'))
 WHERE collection='requests' AND record_id<>'$' AND json_extract(value_json,'$.status')='pending';
CREATE INDEX IF NOT EXISTS gsis_edge_dispatch_peer_alerts ON gsis_edge_records(scope,collection,json_extract(value_json,'$.key'))
 WHERE collection='smcAlerts' AND record_id<>'$' AND json_extract(value_json,'$.status')='open';
CREATE INDEX IF NOT EXISTS gsis_edge_dispatch_employment_mail ON gsis_edge_records(scope,collection,record_id)
 WHERE collection='dailyEmploymentMail' AND record_id<>'$' AND json_extract(value_json,'$.status') IN ('queued','sending');
CREATE INDEX IF NOT EXISTS gsis_edge_pending_service ON gsis_edge_records(scope,collection,position,record_id)
 WHERE record_id<>'$' AND json_extract(value_json,'$.status')='pending';
CREATE INDEX IF NOT EXISTS gsis_edge_pending_handoffs ON gsis_edge_records(scope,collection,record_id)
 WHERE collection='jobs' AND record_id<>'$' AND json_extract(value_json,'$.state') IN ('pending','running');
CREATE INDEX IF NOT EXISTS gsis_edge_ack_snapshot ON gsis_edge_records(scope,collection,json_extract(value_json,'$.snapshotId'))
 WHERE collection='acknowledgements' AND record_id<>'$';
CREATE INDEX IF NOT EXISTS gsis_edge_alert_key ON gsis_edge_records(scope,json_extract(value_json,'$.key'),collection)
 WHERE collection='smcAlerts' AND record_id<>'$';
CREATE TABLE IF NOT EXISTS gsis_edge_receipts (
 scope TEXT NOT NULL REFERENCES gsis_edge_heads(scope) ON DELETE CASCADE, actor TEXT NOT NULL,
 request_id TEXT NOT NULL, digest TEXT NOT NULL, revision INTEGER NOT NULL, result_json TEXT NOT NULL,
 created_at INTEGER NOT NULL, PRIMARY KEY(scope,actor,request_id));
CREATE INDEX IF NOT EXISTS gsis_edge_receipts_age ON gsis_edge_receipts(scope,created_at);
CREATE TABLE IF NOT EXISTS gsis_edge_transitions (
 scope TEXT NOT NULL REFERENCES gsis_edge_heads(scope) ON DELETE CASCADE, revision INTEGER NOT NULL,
 previous_mode TEXT NOT NULL, next_mode TEXT NOT NULL, actor TEXT NOT NULL,
 proof_json TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(scope,revision));
CREATE TABLE IF NOT EXISTS gsis_edge_import_resets (
 scope TEXT NOT NULL REFERENCES gsis_edge_heads(scope) ON DELETE CASCADE, actor TEXT NOT NULL,
 request_id TEXT NOT NULL, previous_revision INTEGER NOT NULL, source_digest TEXT NOT NULL,
 archive_digest TEXT NOT NULL, metadata_json TEXT NOT NULL, imported_records INTEGER NOT NULL,
 created_at INTEGER NOT NULL, PRIMARY KEY(scope,actor,request_id));`;
 // Dispatch indexes are additive and built once by SQLite from existing rows.
 // The first schema upgrade pays that scan; subsequent ticks probe only live
 // candidates. No roster history is deleted or copied into a second queue.
 const initialized=new WeakMap(),scopes=new WeakMap(),projections=new WeakMap(),ROOT='$root',MAX_RECORD_BYTES=1750000,MAX_BATCH_BYTES=1900000;
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 function fail(status,code,message){throw Object.assign(Error(message),{status,code});}
 function text(value,name,max=320){if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f]/.test(value))fail(400,'EDGE_INPUT','Invalid '+name+'.');return value;}
 function hash(value){if(typeof value!=='string'||!/^[a-f0-9]{64}$/i.test(value))fail(400,'EDGE_DIGEST','A SHA-256 command digest is required.');return value.toLowerCase();}
 function revision(value){if(!Number.isSafeInteger(value)||value<0)fail(400,'EDGE_REVISION','A valid expected revision is required.');return value;}
 function stable(value){if(value===null||typeof value!=='object')return value;if(Array.isArray(value))return value.map(stable);return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));}
 function canonicalJson(value){return JSON.stringify(stable(value));}
 async function digest(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(value)));return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');}
 function serialize(value){let result;try{result=JSON.stringify(value);}catch{fail(400,'EDGE_STATE','State must contain JSON values.');}if(result===undefined)fail(400,'EDGE_STATE','State must contain JSON values.');if((typeof TextEncoder!=='undefined'?new TextEncoder().encode(result).length:Utilities.newBlob(result).getBytes().length)>MAX_RECORD_BYTES)fail(413,'EDGE_RECORD_TOO_LARGE','Store large immutable content in R2 and retain its reference.');return result;}
 const key=(collection,id)=>JSON.stringify([collection,id]);
 const recordDate=(value,id)=>typeof value?.date==='string'&&/^20\d\d-\d\d-\d\d$/.test(value.date)?value.date:/^20\d\d-\d\d-\d\d$/.test(id)?id:'';
 function encode(state){
  if(!state||typeof state!=='object'||Array.isArray(state))fail(400,'EDGE_STATE','A state object is required.');
  const records=new Map(),put=(collection,id,value,position=0,date='')=>{
   text(collection,'collection',250);text(id,'record identity',1024);const k=key(collection,id);if(records.has(k))fail(409,'EDGE_RECORD_ID','Duplicate record identity.');records.set(k,{collection,record_id:id,position,record_date:date,value_json:serialize(value)});
  };
  const names=Object.keys(state);if(names.includes(ROOT))fail(400,'EDGE_STATE','Reserved state property.');put(ROOT,'$',{keys:names});
  for(const collection of names){const value=state[collection];
   if(Array.isArray(value)){
    put(collection,'$',{kind:'array'});
    const natural=entry=>entry&&typeof entry==='object'&&!Array.isArray(entry)?recordDate(entry,'')?'date:'+entry.date:typeof entry.timetableName==='string'?'name:'+entry.timetableName:typeof entry.teacher==='string'?'teacher:'+entry.teacher:null:null,counts=new Map();for(const entry of value){const id=natural(entry);if(id)counts.set(id,(counts.get(id)||0)+1);}
    value.forEach((entry,index)=>{const candidate=entry&&typeof entry==='object'&&!Array.isArray(entry)?entry.id??entry.ref:null,naturalId=natural(entry);const id=candidate!==null&&candidate!==undefined&&String(candidate)!==''?'id:'+String(candidate):naturalId&&counts.get(naturalId)===1?naturalId:'index:'+index;put(collection,id,entry,index,recordDate(entry,''));});
   }else if(value!==null&&typeof value==='object'){
    put(collection,'$',{kind:'map'});Object.keys(value).forEach(id=>put(collection,'key:'+id,value[id],0,recordDate(value[id],id)));
   }else put(collection,'$',{kind:'value',value:value===undefined?null:value});
  }
  return records;
 }
 function decode(rows){
  const root=rows.find(row=>row.collection===ROOT&&row.record_id==='$');if(!root)return null;
  const grouped=new Map();for(const row of rows){if(!grouped.has(row.collection))grouped.set(row.collection,[]);grouped.get(row.collection).push(row);}
  const state={};for(const name of JSON.parse(root.value_json).keys){const records=grouped.get(name)||[],meta=records.find(row=>row.record_id==='$');if(!meta)fail(503,'EDGE_CORRUPT','A stored collection is incomplete.');const shape=JSON.parse(meta.value_json),data=records.filter(row=>row.record_id!=='$').sort((a,b)=>a.position-b.position||a.record_id.localeCompare(b.record_id));let value;
   if(shape.kind==='value')value=shape.value;
   else if(shape.kind==='array')value=data.map(row=>JSON.parse(row.value_json));
   else if(shape.kind==='map'){value={};for(const row of data)Object.defineProperty(value,row.record_id.slice(4),{value:JSON.parse(row.value_json),enumerable:true,writable:true,configurable:true});}
   else fail(503,'EDGE_CORRUPT','A stored collection has an invalid shape.');
   Object.defineProperty(state,name,{value,enumerable:true,writable:true,configurable:true});
  }return state;
 }
 function same(a,b){return a?.value_json===b.value_json&&a?.position===b.position&&a?.record_date===b.record_date;}
 function headValue(row){return row?{scope:row.scope,revision:row.revision,mode:row.mode,updatedAt:row.updated_at,sourceDigest:row.source_digest,importedRecords:row.imported_records,metadata:JSON.parse(row.metadata_json),schemaVersion:row.schema_version}:null;}
 function receiptValue(row){return row?{saved:true,revision:row.revision,result:JSON.parse(row.result_json),digest:row.digest,actor:row.actor,requestId:row.request_id,createdAt:row.created_at}:null;}
 function checkResults(results){if(!Array.isArray(results)||results.some(r=>r?.success===false))fail(503,'EDGE_STORAGE','The database operation could not be confirmed. Retry the same request.');return results;}
 function chunks(records){const groups=[];let group=[],bytes=2;for(const record of records){const size=new TextEncoder().encode(JSON.stringify(record)).length+1;if(bytes+size>MAX_BATCH_BYTES&&group.length){groups.push(JSON.stringify(group));group=[];bytes=2;}if(size>MAX_BATCH_BYTES)fail(413,'EDGE_RECORD_TOO_LARGE','Store large immutable content in R2 and retain its reference.');group.push(record);bytes+=size;}if(group.length)groups.push(JSON.stringify(group));return groups;}
 function selection(options){
  if(options===undefined||!Object.keys(options).length)return null;
  const collections=options.collections??(options.prefixes?Object.keys(options.prefixes):null),prefixes=options.prefixes||{},excludeCollections=options.excludeCollections||[];
  if(collections!==null&&(!Array.isArray(collections)||collections.length>28)||!prefixes||typeof prefixes!=='object'||Array.isArray(prefixes)||!Array.isArray(excludeCollections)||excludeCollections.length>40)fail(400,'EDGE_PROJECTION','Invalid collection projection.');
  let count=0;for(const name of collections||[])text(name,'collection',250);for(const name of excludeCollections){text(name,'excluded collection',250);if(name===ROOT)fail(400,'EDGE_PROJECTION','Root metadata cannot be excluded.');}
  for(const [name,list]of Object.entries(prefixes)){if(!collections?.includes(name)||!Array.isArray(list)||!list.length)fail(400,'EDGE_PROJECTION','Prefixes need a selected collection.');for(const prefix of list){text(prefix,'record prefix',800);count++;}}if(count>20)fail(400,'EDGE_PROJECTION','Select no more than 20 map prefixes.');
  return {collections:collections===null?null:[...new Set(collections)],prefixes,excludeCollections:[...new Set(excludeCollections)]};
 }
 function upperBound(prefix){const points=Array.from(prefix);for(let i=points.length-1;i>=0;i--){const code=points[i].codePointAt(0);if(code<0x10ffff)return points.slice(0,i).join('')+String.fromCodePoint(code+1);}fail(400,'EDGE_PROJECTION','Invalid record prefix.');}
 function open(db,scope){
  if(!db?.prepare||!db?.batch)fail(503,'EDGE_NOT_CONFIGURED','The operational D1 binding is required.');text(scope,'scope',180);
  // Every operation starts at the primary. A previous request's session must not
  // certify a stale head, especially after a different user committed a write.
  const session=()=>typeof db.withSession==='function'?db.withSession('first-primary'):db;
  async function ensure(){
   if(!initialized.has(db))initialized.set(db,(async()=>{const statements=SCHEMA.split(';').map(s=>s.trim()).filter(Boolean);checkResults(await db.batch(statements.map(sql=>db.prepare(sql))));})().catch(error=>{initialized.delete(db);throw error;}));await initialized.get(db);
   if(!scopes.has(db))scopes.set(db,new Map());const known=scopes.get(db);if(!known.has(scope))known.set(scope,db.prepare('INSERT OR IGNORE INTO gsis_edge_heads (scope,updated_at) VALUES (?,?)').bind(scope,Date.now()).run().then(result=>{checkResults([result]);}).catch(error=>{known.delete(scope);throw error;}));await known.get(scope);
  }
  async function head(){await ensure();return headValue(await session().prepare('SELECT * FROM gsis_edge_heads WHERE scope=?').bind(scope).first());}
  async function load(options){
   await ensure();const selected=selection(options),connection=session();let query='SELECT collection,record_id,position,record_date,value_json FROM gsis_edge_records WHERE scope=?',args=[scope];
   if(selected){
    query="SELECT r.collection,r.record_id,r.position,r.record_date,r.value_json FROM gsis_edge_records r WHERE r.scope=? AND (r.collection='$root' OR r.record_id='$') UNION ALL SELECT r.collection,r.record_id,r.position,r.record_date,r.value_json FROM gsis_edge_records r JOIN gsis_edge_records m ON m.scope=r.scope AND m.collection=r.collection AND m.record_id='$' WHERE r.scope=? AND r.record_id<>'$'";args=[scope,scope];
    if(selected.collections!==null)query+=" AND json_extract(m.value_json,'$.kind')<>'map'";
    if(selected.excludeCollections.length){query+=' AND r.collection NOT IN ('+selected.excludeCollections.map(()=>'?').join(',')+')';args.push(...selected.excludeCollections);}
    for(const name of selected.collections||[]){if(selected.excludeCollections.includes(name))continue;query+=" UNION ALL SELECT collection,record_id,position,record_date,value_json FROM gsis_edge_records WHERE scope=? AND collection=? AND record_id<>'$'";args.push(scope,name);const prefixes=selected.prefixes[name];if(prefixes){query+=' AND ('+prefixes.map(prefix=>{const first='key:'+prefix;args.push(first,upperBound(first));return '(record_id>=? AND record_id<?)';}).join(' OR ')+')';}}
    if(args.length>100)fail(400,'EDGE_PROJECTION','Select fewer collections or prefixes in one request.');
   }
   const rs=checkResults(await connection.batch([connection.prepare('SELECT * FROM gsis_edge_heads WHERE scope=?').bind(scope),connection.prepare(query).bind(...args)])),h=headValue(rs[0].results[0]);
   const unique=[...new Map(rs[1].results.map(row=>[key(row.collection,row.record_id),row])).values()],state=decode(unique);if(h.mode!=='legacy'&&state===null)fail(503,'EDGE_CORRUPT','The operational state is incomplete.');
   let projection;if(selected){for(const name of selected.excludeCollections)if(state&&own(state,name)&&(state[name]===null||typeof state[name]!=='object'))fail(400,'EDGE_PROJECTION','Only array or map collections can be excluded.');projection={schema:1,scope,revision:h.revision,...selected,mapCollections:unique.filter(row=>row.collection!==ROOT&&row.record_id==='$'&&JSON.parse(row.value_json).kind==='map').map(row=>row.collection)};if(state)projections.set(state,projection);}
   return {...h,state,...(projection?{projection}:{})};
  }
  async function receipt(actor,requestId,expectedDigest){await ensure();text(actor,'actor');text(requestId,'request identity',200);const r=receiptValue(await session().prepare('SELECT * FROM gsis_edge_receipts WHERE scope=? AND actor=? AND request_id=?').bind(scope,actor,requestId).first());if(r&&expectedDigest!==undefined&&r.digest!==hash(expectedDigest))fail(409,'EDGE_REQUEST_REUSED','This request identity was already used for different content.');return r;}
  async function write(input,mode,nextMode,source){
   await ensure();const actor=text(input.actor,'actor'),requestId=text(input.requestId,'request identity',200),commandDigest=hash(input.digest),expected=revision(input.expectedRevision),prior=await receipt(actor,requestId,commandDigest);if(prior)return {...prior,duplicate:true};
   const before=input.before===null?new Map():encode(input.before),after=encode(input.after),changed=[...after].filter(([id,row])=>!same(before.get(id),row)).map(([,row])=>row),removed=[...before].filter(([id])=>!after.has(id)).map(([,row])=>({collection:row.collection,record_id:row.record_id}));
   const projection=input.projection||projections.get(input.before);if(projection){
    if(projection.scope!==scope||projection.revision!==expected||projection.schema!==1)fail(409,'EDGE_PROJECTION','The projected state revision does not match.');
    for(const row of [...changed,...removed]){
     if(projection.excludeCollections?.includes(row.collection))fail(409,'EDGE_PROJECTION','The change touches an excluded collection. Load that collection before editing it.');
     if(projection.collections!==null){const priorRow=before.get(key(row.collection,row.record_id)),nextRow=after.get(key(row.collection,row.record_id)),scalarChange=row.collection!==ROOT&&row.record_id==='$'&&priorRow&&nextRow&&JSON.parse(priorRow.value_json).kind==='value'&&JSON.parse(nextRow.value_json).kind==='value';if(row.collection===ROOT||row.record_id==='$'&&!scalarChange)fail(409,'EDGE_PROJECTION','Read the full state before changing a collection shape.');if(row.record_id!=='$'&&projection.mapCollections.includes(row.collection)&&(!projection.collections.includes(row.collection)||projection.prefixes[row.collection]&&!projection.prefixes[row.collection].some(prefix=>row.record_id.startsWith('key:'+prefix))))fail(409,'EDGE_PROJECTION','The change is outside the selected map records.');}
    }
   }
   const guards=input.guards||[];if(!Array.isArray(guards)||guards.length>20)fail(400,'EDGE_GUARD','Choose no more than 20 source guards.');for(const g of guards){if(!g||typeof g!=='object')fail(400,'EDGE_GUARD','Invalid source guard.');text(g.scope,'guard scope',180);revision(g.revision);if(!['legacy','imported','active','paused'].includes(g.mode))fail(400,'EDGE_GUARD','A source guard mode is required.');}
   const connection=session(),token=crypto.randomUUID(),now=Date.now(),resultJson=serialize(input.result??{}),guard='EXISTS (SELECT 1 FROM gsis_edge_heads WHERE scope=? AND write_token=?)';
   const statements=[connection.prepare('UPDATE gsis_edge_heads SET revision=revision+1,mode=?,write_token=?,updated_at=?'+(source?',source_digest=?,imported_records=?,metadata_json=?':'')+' WHERE scope=? AND revision=? AND mode=?'+(source?' AND NOT EXISTS (SELECT 1 FROM gsis_edge_records WHERE scope=?)':'')+guards.map(()=> ' AND EXISTS (SELECT 1 FROM gsis_edge_heads source WHERE source.scope=? AND source.revision=? AND source.mode=?)').join(''))
    .bind(nextMode,token,now,...(source?[source.digest,after.size,serialize(source.metadata)]:[]),scope,expected,mode,...(source?[scope]:[]),...guards.flatMap(g=>[g.scope,g.revision,g.mode]))];
   for(const group of chunks(removed))statements.push(connection.prepare('DELETE FROM gsis_edge_records WHERE scope=? AND '+guard+' AND (collection,record_id) IN (SELECT json_extract(value,\'$.collection\'),json_extract(value,\'$.record_id\') FROM json_each(?))').bind(scope,scope,token,group));
   for(const group of chunks(changed))statements.push(connection.prepare('INSERT INTO gsis_edge_records (scope,collection,record_id,position,record_date,value_json,revision) SELECT ?,json_extract(value,\'$.collection\'),json_extract(value,\'$.record_id\'),json_extract(value,\'$.position\'),json_extract(value,\'$.record_date\'),json_extract(value,\'$.value_json\'),? FROM json_each(?) WHERE '+guard+' ON CONFLICT(scope,collection,record_id) DO UPDATE SET position=excluded.position,record_date=excluded.record_date,value_json=excluded.value_json,revision=excluded.revision').bind(scope,expected+1,group,scope,token));
   statements.push(connection.prepare('INSERT INTO gsis_edge_receipts (scope,actor,request_id,digest,revision,result_json,created_at) SELECT ?,?,?,?,?,?,? WHERE '+guard).bind(scope,actor,requestId,commandDigest,expected+1,resultJson,now,scope,token));
   statements.push(connection.prepare('SELECT * FROM gsis_edge_receipts WHERE scope=? AND actor=? AND request_id=?').bind(scope,actor,requestId));
   statements.push(connection.prepare('SELECT * FROM gsis_edge_heads WHERE scope=?').bind(scope));
   // Callers can fence time-sensitive writes after every awaited storage read.
   // This synchronous callback is supplied by trusted runtime code, not serialized commands.
   if(input.beforeWrite)input.beforeWrite();
   let rs;try{rs=checkResults(await connection.batch(statements));}catch(error){const recovered=await receipt(actor,requestId,commandDigest).catch(()=>null);if(recovered)return {...recovered,duplicate:true,recovered:true};throw error;}
   const r=receiptValue(rs.at(-2).results[0]),h=headValue(rs.at(-1).results[0]);if(r){if(r.digest!==commandDigest)fail(409,'EDGE_REQUEST_REUSED','This request identity was already used for different content.');return {...r,duplicate:!rs[0].meta?.changes,changedRecords:rs[0].meta?.changes?changed.length+removed.length:0};}
   if(h.mode!==mode)fail(409,'EDGE_AUTHORITY','This operational store is not the active writer.');fail(409,'EDGE_CONFLICT','A newer change was saved. Reload the affected records before retrying.');
  }
  async function commit(input){return write(input,'active','active');}
  async function importState(input){const sourceDigest=await digest(input.state),h=await head(),prior=await receipt(input.actor,input.requestId,input.digest||sourceDigest);if(prior)return {...await head(),...prior,duplicate:true};if(h.mode!=='legacy'||h.revision!==0)fail(409,'EDGE_IMPORT_STATE','Import requires an empty legacy store.');const result=await write({before:null,after:input.state,expectedRevision:h.revision,actor:input.actor,requestId:input.requestId,digest:input.digest||sourceDigest,result:{imported:true,sourceDigest,records:encode(input.state).size}},'legacy','imported',{digest:sourceDigest,metadata:{source:input.source||null,importedAt:Date.now()}});return {...await head(),...result};}
  async function resetImport(input){
   await ensure();const actor=text(input.actor,'actor'),requestId=text(input.requestId,'request identity',200),expected=revision(input.expectedRevision),archiveDigest=hash(input.proof?.archiveDigest),sourceDigest=hash(input.proof?.sourceDigest),connection=session();
   const readReset=()=>session().prepare('SELECT * FROM gsis_edge_import_resets WHERE scope=? AND actor=? AND request_id=?').bind(scope,actor,requestId).first(),result=(row,duplicate=false)=>{if(row.archive_digest!==archiveDigest||row.source_digest!==sourceDigest||row.previous_revision!==expected)fail(409,'EDGE_REQUEST_REUSED','This reset identity was already used for different evidence.');return {reset:true,scope,mode:'legacy',revision:0,sourceDigest:'',previousSourceDigest:row.source_digest,archiveDigest:row.archive_digest,createdAt:row.created_at,requestId,duplicate};};
   const prior=await readReset();if(prior)return result(prior,true);const h=await head();if(h.mode!=='imported'||h.revision!==expected||h.sourceDigest!==sourceDigest)fail(409,'EDGE_IMPORT_RESET','Only the unchanged imported snapshot can be restarted; active or paused authority cannot be reset.');
   const token=crypto.randomUUID(),now=Date.now(),guard='EXISTS (SELECT 1 FROM gsis_edge_heads WHERE scope=? AND write_token=? AND mode=\'imported\')';
   const statements=[connection.prepare("UPDATE gsis_edge_heads SET write_token=?,updated_at=? WHERE scope=? AND revision=? AND mode='imported' AND source_digest=?").bind(token,now,scope,expected,sourceDigest),connection.prepare('INSERT INTO gsis_edge_import_resets (scope,actor,request_id,previous_revision,source_digest,archive_digest,metadata_json,imported_records,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE '+guard).bind(scope,actor,requestId,expected,sourceDigest,archiveDigest,serialize(h.metadata),h.importedRecords,now,scope,token),connection.prepare('DELETE FROM gsis_edge_records WHERE scope=? AND '+guard).bind(scope,scope,token),connection.prepare('DELETE FROM gsis_edge_receipts WHERE scope=? AND '+guard).bind(scope,scope,token),connection.prepare("UPDATE gsis_edge_heads SET revision=0,mode='legacy',source_digest='',imported_records=0,metadata_json='{}' WHERE scope=? AND write_token=? AND mode='imported'").bind(scope,token),connection.prepare('SELECT * FROM gsis_edge_import_resets WHERE scope=? AND actor=? AND request_id=?').bind(scope,actor,requestId)];
   let rs;try{rs=checkResults(await connection.batch(statements));}catch(error){const recovered=await readReset().catch(()=>null);if(recovered)return {...result(recovered,true),recovered:true};throw error;}const saved=rs.at(-1).results[0];if(!saved)fail(409,'EDGE_IMPORT_RESET','The imported snapshot changed before restart.');return result(saved,!rs[0].meta?.changes);
  }
  async function transition(input){
   await ensure();const actor=text(input.actor,'actor'),expected=revision(input.expectedRevision),h=await head(),proof=input.proof||{};
   if(h.revision!==expected||h.mode!==input.from)fail(409,'EDGE_CONFLICT','The authority state changed. Reload before proceeding.');
   const pair=input.from+'>'+input.to;if(!['imported>active','active>paused','paused>active'].includes(pair))fail(400,'EDGE_TRANSITION','Unsupported authority transition.');
   if(input.to==='active'&&(proof.legacyWritesDisabled!==true||pair==='imported>active'&&(proof.sourceDigest!==h.sourceDigest||proof.verifiedRecords!==h.importedRecords)))fail(409,'EDGE_CUTOVER_PROOF','Verify the imported records and disable legacy writers before activation.');
   if(input.to==='paused')text(proof.reason,'pause reason',500);
   const connection=session(),token=crypto.randomUUID(),now=Date.now(),safeProof={legacyWritesDisabled:proof.legacyWritesDisabled===true,...(typeof proof.sourceDigest==='string'?{sourceDigest:hash(proof.sourceDigest)}:{}),...(Number.isSafeInteger(proof.verifiedRecords)?{verifiedRecords:proof.verifiedRecords}:{}),...(typeof proof.reason==='string'?{reason:proof.reason}:{})};
   const rs=checkResults(await connection.batch([connection.prepare('UPDATE gsis_edge_heads SET revision=revision+1,mode=?,write_token=?,updated_at=? WHERE scope=? AND revision=? AND mode=?').bind(input.to,token,now,scope,expected,input.from),connection.prepare('INSERT INTO gsis_edge_transitions (scope,revision,previous_mode,next_mode,actor,proof_json,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM gsis_edge_heads WHERE scope=? AND write_token=?)').bind(scope,expected+1,input.from,input.to,actor,serialize(safeProof),now,scope,token),connection.prepare('SELECT * FROM gsis_edge_heads WHERE scope=?').bind(scope)]));if(!rs[0].meta?.changes)fail(409,'EDGE_CONFLICT','The authority state changed. Reload before proceeding.');return headValue(rs[2].results[0]);
  }
  async function rows(collection,options={}){
   await ensure();text(collection,'collection',250);if(collection===ROOT)fail(400,'EDGE_COLLECTION','Choose a data collection.');const where=['scope=?','collection=?',"record_id<>'$'"],values=[scope,collection];
   for(const [field,operator]of [['date','='],['from','>='],['to','<=']])if(options[field]!==undefined){if(!/^20\d\d-\d\d-\d\d$/.test(options[field]))fail(400,'EDGE_DATE','Invalid record date.');where.push('record_date'+operator+'?');values.push(options[field]);}
   if(options.after!==undefined){text(options.after,'record cursor',1024);where.push('record_id>?');values.push(options.after);}const limit=options.limit===undefined?200:options.limit;if(!Number.isSafeInteger(limit)||limit<1||limit>1000)fail(400,'EDGE_LIMIT','Choose a limit from 1 to 1000.');
   const connection=session(),rs=checkResults(await connection.batch([connection.prepare('SELECT * FROM gsis_edge_heads WHERE scope=?').bind(scope),connection.prepare('SELECT record_id,position,record_date,value_json,revision FROM gsis_edge_records WHERE '+where.join(' AND ')+' ORDER BY record_id LIMIT ?').bind(...values,limit+1)]));const data=rs[1].results,more=data.length>limit;return {...headValue(rs[0].results[0]),records:data.slice(0,limit).map(r=>({id:r.record_id,position:r.position,date:r.record_date,value:JSON.parse(r.value_json),revision:r.revision})),next:more?data[limit-1].record_id:null};
  }
  async function exportState(){const snapshot=await load();return {schema:'gsis-edge-state-v1',...snapshot,capturedAt:new Date().toISOString(),stateDigest:snapshot.state===null?null:await digest(snapshot.state)};}
  return {scope,ensure,head,load,receipt,commit,importState,resetImport,transition,rows,exportState};
 }
 return {open,encode,decode,digest,canonicalJson,SCHEMA,MAX_RECORD_BYTES};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSiSEdgeStore;
