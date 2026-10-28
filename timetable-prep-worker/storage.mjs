import {LIMITS,fail,exact,stable,encoder,hash,manifest,nativePart,part,sourceCheck,requestId,sha,baselineProjection,baselineMapping,suspendedProjection} from './domain.mjs';

export async function bounded(stream,max){
 if(!stream)fail(503,'OBJECT_INVALID','A stored object body is unavailable.');
 const reader=stream.getReader(),chunks=[];let length=0;
 try{while(true){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>max){await reader.cancel();fail(413,'SIZE_LIMIT','The input exceeds its supported size limit.');}chunks.push(next.value);}}finally{reader.releaseLock();}
 const output=new Uint8Array(length);let at=0;for(const chunk of chunks){output.set(chunk,at);at+=chunk.byteLength;}return output;
}
export function database(env){return env.REHEARSAL_LEDGER.withSession?env.REHEARSAL_LEDGER.withSession('first-primary'):env.REHEARSAL_LEDGER;}
const prefix=config=>'rehearsal/'+config.instance+'/timetable-preparation/v1/';
export async function checkBindings(env,config){
 let marker,meta;try{meta=await database(env).prepare('SELECT * FROM rehearsal_meta WHERE singleton=1').first();marker=await env.REHEARSAL_TIMETABLES.get('rehearsal/'+config.instance+'/marker.json');}catch{fail(503,'BINDING_CHECK_FAILED','The existing rehearsal storage is unavailable.');}
 if(!meta||meta.schema_name!=='gsis.rehearsal.ledger'||meta.schema_version!==1||meta.instance_id!==config.instance||meta.mode!=='simulation-only'||!marker||marker.size>2048)fail(503,'BINDING_CHECK_FAILED','The existing rehearsal markers do not match.');
 let value;try{value=JSON.parse(new TextDecoder().decode(await bounded(marker.body,2048)));}catch{fail(503,'BINDING_CHECK_FAILED','The private rehearsal marker is invalid.');}
 exact(value,['schema','version','instanceId','mode'],'Bucket marker');if(value.schema!=='gsis.rehearsal.bucket'||value.version!==1||value.instanceId!==config.instance||value.mode!=='simulation-only')fail(503,'BINDING_CHECK_FAILED','The private rehearsal marker does not match.');
 await head(database(env),config);
}
export async function head(db,config){
 let row;try{row=await db.prepare('SELECT * FROM gsis_ttprep_heads WHERE singleton=1').first();}catch{fail(503,'PREPARATION_SCHEMA_REQUIRED','Run the additive timetable preparation schema in the existing rehearsal D1 database.');}
 if(!row||row.instance_id!==config.instance||row.schema_version!==1||row.mode!=='shadow-only'||!Number.isSafeInteger(row.revision)||row.revision<0)fail(503,'PREPARATION_SCHEMA_REQUIRED','Timetable preparation markers do not match this rehearsal.');
 return row;
}
export async function putObject(env,config,kind,plain){
 const bytes=encoder.encode(plain);if(bytes.length>LIMITS.part)fail(413,'SIZE_LIMIT','An uncompressed timetable object exceeds 4 MiB.');
 const digest=await hash(bytes),key=prefix(config)+kind+'/'+digest+'.json.gz';
 const compressed=await bounded(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),LIMITS.gzip);
 await env.REHEARSAL_TIMETABLES.put(key,compressed,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',contentEncoding:'gzip'},customMetadata:{schema:'gsis.timetable.preparation.object',version:'1',instanceId:config.instance,kind,sha256:digest,bytes:String(bytes.length)}});
 const ref={key,sha256:digest,bytes:bytes.length,kind};
 // Existing content-addressed objects are verified too; a HEAD/metadata match is not proof.
 if(await getObject(env,config,ref)!==plain)fail(503,'OBJECT_INVALID','Stored timetable readback differs from the supplied source.');return ref;
}
export async function getObject(env,config,ref){
 exact(ref,['key','sha256','bytes','kind'],'Object reference');sha(ref.sha256);if(!['native','baseline-day','suspended-day'].includes(ref.kind)||ref.key!==prefix(config)+ref.kind+'/'+ref.sha256+'.json.gz'||!Number.isSafeInteger(ref.bytes)||ref.bytes<1||ref.bytes>LIMITS.part)fail(503,'OBJECT_INVALID','A timetable object pointer is invalid.');
 const object=await env.REHEARSAL_TIMETABLES.get(ref.key);
 if(!object||object.size>LIMITS.gzip||object.customMetadata?.schema!=='gsis.timetable.preparation.object'||object.customMetadata?.version!=='1'||object.customMetadata?.instanceId!==config.instance||object.customMetadata?.kind!==ref.kind||object.customMetadata?.sha256!==ref.sha256||object.customMetadata?.bytes!==String(ref.bytes))fail(503,'OBJECT_INVALID','A private timetable object is missing or has invalid metadata.');
 let bytes;try{bytes=await bounded(object.body.pipeThrough(new DecompressionStream('gzip')),LIMITS.part);}catch{fail(503,'OBJECT_INVALID','Timetable gzip readback failed.');}
 if(bytes.length!==ref.bytes||await hash(bytes)!==ref.sha256)fail(503,'OBJECT_INVALID','Timetable SHA256 or byte-length verification failed.');
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export async function upload(env,config,input){
 exact(input,['part'],'Part upload');const parsed=await part(input.part);
 const ref=await putObject(env,config,'native',parsed.data);
 return {ok:true,mode:'shadow-only',sourceKey:input.part.sourceKey,id:parsed.id,sha256:ref.sha256,bytes:ref.bytes};
}
async function prior(db,config,id,digest){const row=await db.prepare('SELECT * FROM gsis_ttprep_receipts WHERE instance_id=? AND request_id=?').bind(config.instance,id).first();if(!row)return null;if(row.digest!==digest)fail(409,'REQUEST_ID_CONFLICT','This request ID already represents different content or a different expected revision.');let response;try{response=JSON.parse(row.response_json);}catch{fail(503,'RECEIPT_INVALID','The stored preparation receipt is invalid.');}return {...response,replayed:true};}
function reference(config,descriptor){return {key:prefix(config)+'native/'+descriptor.sha256+'.json.gz',sha256:descriptor.sha256,bytes:descriptor.bytes,kind:'native'};}
async function buildSnapshot(env,config,m,check){
 const required=new Set(m.baselineMap.map(row=>row.baselineId).filter(id=>id!==null));
 const supplied=m.parts.filter(p=>p.kind==='baseline').map(p=>p.id);
 if(required.size!==supplied.length||supplied.some(id=>!required.has(id.slice('baseline:'.length))||!id.startsWith('baseline:')))fail(400,'MANIFEST_PART_MISMATCH','Baseline date mappings and supplied baseline parts differ.');
 // Keep only 31 small pointers and baseline metadata. Parse one native part at a
 // time; retaining all models/plans would exceed the Worker memory budget.
 const dates=m.baselineMap.map(row=>({date:row.date,baselineId:row.baselineId,baseline:null,suspended:null})),nativeParts=[],entries=[];let projections=0;
 for(const descriptor of m.parts){
  const ref=reference(config,descriptor),raw=await getObject(env,config,ref);let value;try{value=JSON.parse(raw);}catch{fail(503,'OBJECT_INVALID','The stored native part is invalid JSON.');}
  if(stable(value)!==raw)fail(503,'OBJECT_INVALID','The stored native part is not canonical.');const parsed=await nativePart(value);
  if(parsed.id!==descriptor.id||parsed.kind!==descriptor.kind)fail(400,'MANIFEST_PART_MISMATCH','The manifest does not match its native source part.');
  if(parsed.kind==='baseline'){
   entries.push(value.entry);projections+=value.model.layoutMode==='single-week'?5:10;
   const keys=value.model.layoutMode==='single-week'?['single']:['odd','even'];
   for(const row of dates.filter(row=>row.baselineId===value.id)){
    if(row.date<value.entry.from||row.date>value.entry.to)fail(400,'INVALID_WINDOW','A baseline mapping falls outside its validity dates.');
    const weekday=(new Date(row.date+'T00:00:00Z').getUTCDay()+6)%7;
    const object={schema:'gsis.timetable.preparation.baseline-day',version:1,date:row.date,baselineId:row.baselineId,sourcePartSha256:ref.sha256,calendarVerified:false,schoolDayVerified:false,weekday:weekday<5?weekday:null,candidates:weekday<5?keys.map(parity=>({parity,projection:baselineProjection(value.model,parity,weekday)})):[]};
    row.baseline=await putObject(env,config,'baseline-day',stable(object));
   }
  }
  else{
   const row=dates.find(row=>row.date===value.date);if(!row)fail(400,'INVALID_WINDOW','A confirmed plan lies outside the preparation window.');
   const object={schema:'gsis.timetable.preparation.suspended-day',version:1,date:row.date,sourcePartSha256:ref.sha256,confirmedAt:value.confirmedAt,revision:value.revision,independentBaseline:true,projection:suspendedProjection(value.plan)};
   row.suspended=await putObject(env,config,'suspended-day',stable(object));projections++;
  }
  nativeParts.push({id:descriptor.id,...ref});
 }
 for(const row of dates)if(baselineMapping(entries,row.date)!==row.baselineId)fail(400,'MANIFEST_PART_MISMATCH','A date mapping differs from the supplied baseline validity and priority rules.');
 return {schema:'gsis.timetable.preparation.snapshot',version:1,mode:'shadow-only',productionAuthority:'google',sourceFreshness:'not-independently-verified',manifest:m,sourceCheck:check,nativeParts,dates,comparison:{nativeParts: nativeParts.length,projectionHashesVerified:projections,dateMappings:31,calendarVerified:false}};
}
export async function commit(env,config,who,input){
 exact(input,['requestId','expectedRevision','manifest','sourceCheck'],'Commit');const id=requestId(input.requestId),expected=input.expectedRevision;if(!Number.isSafeInteger(expected)||expected<0)fail(400,'INVALID_REVISION','Supply the current preparation revision.');
 const m=await manifest(input.manifest),check=sourceCheck(input.sourceCheck,m),digest=await hash(stable(input)),db=database(env),existing=await prior(db,config,id,digest);if(existing)return existing;
 const row=await head(db,config);if(row.revision!==expected)fail(409,'STALE_REVISION','Another preparation import changed the revision. Refresh and review before trying a new request.');
 const document=await buildSnapshot(env,config,m,check),noChange=row.source_key===m.sourceKey,revision=expected+(noChange?0:1),now=new Date().toISOString();
 if(noChange){
  let priorDocument;try{priorDocument=JSON.parse(row.document);}catch{fail(503,'SNAPSHOT_INVALID','The current preparation snapshot is invalid.');}
  if(priorDocument?.schema!==document.schema||priorDocument?.version!==1||priorDocument?.manifest?.sourceKey!==m.sourceKey||!Array.isArray(priorDocument?.nativeParts)||!Array.isArray(priorDocument?.dates)||stable(priorDocument.nativeParts)!==stable(document.nativeParts)||stable(priorDocument.dates)!==stable(document.dates))fail(503,'SNAPSHOT_INVALID','The unchanged source does not match its stored native and dated timetable pointers.');
 }
 const response={ok:true,mode:'shadow-only',requestId:id,revision,replayed:false,noChange,sourceKey:m.sourceKey,comparison:document.comparison,productionAuthority:'google',sourceFreshness:'not-independently-verified',message:'Imported snapshot verified against supplied files; current Google freshness is not independently verified.'};
 const receiptValues=[config.instance,id,digest,revision,who.email,JSON.stringify(response),now,config.instance,revision];
 let statements;
 if(noChange){statements=[db.prepare('INSERT INTO gsis_ttprep_receipts(instance_id,request_id,digest,revision,actor_email,response_json,created_at) SELECT ?,?,?,?,?,?,? FROM gsis_ttprep_heads WHERE singleton=1 AND instance_id=? AND revision=? AND source_key=?').bind(...receiptValues,m.sourceKey)];}
 else{
  const serialized=stable(document);
  statements=[db.prepare('UPDATE gsis_ttprep_heads SET revision=?,source_key=?,document=?,last_request_id=?,updated_at=? WHERE singleton=1 AND instance_id=? AND revision=?').bind(revision,m.sourceKey,serialized,id,now,config.instance,expected),
   db.prepare('INSERT INTO gsis_ttprep_receipts(instance_id,request_id,digest,revision,actor_email,response_json,created_at) SELECT ?,?,?,?,?,?,? FROM gsis_ttprep_heads WHERE singleton=1 AND instance_id=? AND revision=? AND last_request_id=?').bind(...receiptValues,id),
   db.prepare('INSERT INTO gsis_ttprep_versions(instance_id,revision,request_id,source_key,document,created_at) SELECT ?,?,?,?,?,? FROM gsis_ttprep_heads WHERE singleton=1 AND instance_id=? AND revision=? AND last_request_id=?').bind(config.instance,revision,id,m.sourceKey,serialized,now,config.instance,revision,id)];
 }
 try{const results=await db.batch(statements);if(results.some(result=>result.success===false))throw Error();}
 catch{const recovered=await prior(database(env),config,id,digest);if(recovered)return recovered;fail(503,'WRITE_UNCERTAIN','D1 did not confirm this preparation commit. Retry the exact same request ID, revision and body.');}
 const saved=await prior(database(env),config,id,digest);if(!saved)fail(409,'STALE_REVISION','Another preparation commit won the revision. Refresh and review the snapshot.');return {...saved,replayed:false};
}
export async function state(env,config){
 const row=await head(database(env),config);let current=null;try{current=JSON.parse(row.document);}catch{fail(503,'SNAPSHOT_INVALID','The stored preparation snapshot is invalid.');}
 if(row.revision>0&&(!current||current.schema!=='gsis.timetable.preparation.snapshot'||current.version!==1||current.mode!=='shadow-only'||current.manifest?.sourceKey!==row.source_key))fail(503,'SNAPSHOT_INVALID','The stored preparation revision and source pointer differ.');
 if(row.revision>0){
  const version=await database(env).prepare('SELECT document,request_id,source_key FROM gsis_ttprep_versions WHERE instance_id=? AND revision=?').bind(config.instance,row.revision).first();
  if(!version||version.document!==row.document||version.request_id!==row.last_request_id||version.source_key!==row.source_key)fail(503,'SNAPSHOT_INVALID','The current preparation pointer and committed version evidence differ.');
 }
 return {ok:true,mode:'shadow-only',revision:row.revision,sourceKey:row.source_key,sourceFreshness:'not-independently-verified',productionAuthority:'google',snapshot:current};
}
export async function read(env,config,input){
 exact(input,['date','kind'],'Read');if(!['baseline','suspended'].includes(input.kind))fail(400,'INVALID_KIND','Choose baseline or suspended.');
 const current=await state(env,config),row=current.snapshot?.dates.find(row=>row.date===input.date);if(!row)fail(404,'DATE_UNAVAILABLE','No imported timetable exists for this date.');const ref=row[input.kind];
 return {ok:true,mode:'shadow-only',revision:current.revision,date:input.date,kind:input.kind,timetable:ref?JSON.parse(await getObject(env,config,ref)):null,sourceFreshness:'not-independently-verified',productionAuthority:'google'};
}
