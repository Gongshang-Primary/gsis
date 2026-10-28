/* Isolated rehearsal service. Only fetch is exported: no scheduled/queue/activation capability. */
import {RELEASE,LIMITS,fail,exact,requestId,stable,advance,replay,validateSnapshot,validateDay,projection} from './domain.mjs';
import {configuration,authenticate} from './auth.mjs';
import {loginPage,adminControls} from './ui.mjs';
const encoder=new TextEncoder(),SCHEMA='gsis.rehearsal.ledger';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cross-Origin-Opener-Policy':'same-origin-allow-popups','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}});
export async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function bounded(stream,max){
 const chunks=[];let length=0;const reader=stream.getReader();try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>max){await reader.cancel();fail(413,'SIZE_LIMIT','Input exceeds its supported size limit.');}chunks.push(value);}}finally{reader.releaseLock();}
 const result=new Uint8Array(length);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength;}return result;
}
async function parseBody(request){
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||'')||!request.body)fail(415,'JSON_REQUIRED','Send application/json.');
 if(Number(request.headers.get('Content-Length'))>LIMITS.body)fail(413,'SIZE_LIMIT','Request exceeds 512 KiB.');
 try{return JSON.parse(new TextDecoder().decode(await bounded(request.body,LIMITS.body)));}catch(e){if(e.status)throw e;fail(400,'INVALID_JSON','Invalid JSON request.');}
}
function db(env){return env.REHEARSAL_LEDGER.withSession?env.REHEARSAL_LEDGER.withSession('first-primary'):env.REHEARSAL_LEDGER;}
async function bindings(env,config){
 let meta,marker;try{meta=await db(env).prepare('SELECT * FROM rehearsal_meta WHERE singleton=1').first();marker=await env.REHEARSAL_TIMETABLES.get('rehearsal/'+config.instance+'/marker.json');}catch{fail(503,'BINDING_CHECK_FAILED','The dedicated rehearsal storage schema or private bucket is unavailable.');}
 if(!meta||meta.schema_name!==SCHEMA||meta.schema_version!==1||meta.instance_id!==config.instance||meta.mode!=='simulation-only'||!marker||marker.size>2048)fail(503,'BINDING_CHECK_FAILED','Rehearsal storage markers do not match this instance.');
 let value;try{value=JSON.parse(new TextDecoder().decode(await bounded(marker.body,2048)));}catch{fail(503,'BINDING_CHECK_FAILED','The private rehearsal bucket marker is invalid.');}
 if(value.schema!=='gsis.rehearsal.bucket'||value.version!==1||value.instanceId!==config.instance||value.mode!=='simulation-only'||Object.keys(value).sort().join(',')!=='instanceId,mode,schema,version')fail(503,'BINDING_CHECK_FAILED','The private rehearsal bucket marker does not match this instance.');
}
async function load(connection,config){
 const row=await connection.prepare('SELECT * FROM rehearsal_ledger WHERE singleton=1').first();
 if(!row||row.instance_id!==config.instance||!Number.isSafeInteger(row.revision)||row.revision<0)fail(503,'LEDGER_INVALID','The rehearsal ledger is not initialized for this instance.');
 let current;try{current=JSON.parse(row.document);if(current){exact(current,['schema','version','dataset','state','day','importSource'],'Stored ledger');if(current.schema!==SCHEMA||current.version!==1)throw Error();if(!current.state||current.state.schema!==1)throw Error();validateDay(current.day);}}catch{fail(503,'LEDGER_INVALID','The stored rehearsal ledger needs review.');}
 return {row,current};
}
async function receipt(connection,config,id,digest){
 const row=await connection.prepare('SELECT * FROM rehearsal_receipts WHERE request_id=? AND instance_id=?').bind(id,config.instance).first();
 if(!row)return null;if(row.digest!==digest)fail(409,'REQUEST_ID_CONFLICT','This request ID already represents a different command or revision.');return {...JSON.parse(row.response_json),replayed:true};
}
async function saveTimetable(env,config,day){
 const plain=encoder.encode(stable({schema:'gsis.rehearsal.timetable',version:1,instanceId:config.instance,day:validateDay(day)}));
 if(plain.byteLength>LIMITS.timetable)fail(413,'SIZE_LIMIT','Timetable exceeds 64 KiB.');
 const sha=await hash(plain),key='rehearsal/'+config.instance+'/timetables/v1/'+sha+'.json.gz',gzip=await bounded(new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip')),LIMITS.gzip);
 const object=await env.REHEARSAL_TIMETABLES.put(key,gzip,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json',contentEncoding:'gzip'},customMetadata:{schema:'gsis.rehearsal.timetable',version:'1',instanceId:config.instance,sha256:sha}});
 if(!object){const existing=await env.REHEARSAL_TIMETABLES.head(key);if(!existing||existing.customMetadata?.instanceId!==config.instance||existing.customMetadata?.sha256!==sha||existing.customMetadata?.schema!=='gsis.rehearsal.timetable')fail(503,'TIMETABLE_INVALID','The immutable timetable object could not be verified.');}
 return {key,sha};
}
async function readTimetable(env,config,row){
 if(!row.timetable_key)return null;
 if(!/^([a-f0-9]{64})$/.test(row.timetable_sha256||'')||row.timetable_key!=='rehearsal/'+config.instance+'/timetables/v1/'+row.timetable_sha256+'.json.gz')fail(503,'TIMETABLE_INVALID','The timetable pointer is invalid.');
 const object=await env.REHEARSAL_TIMETABLES.get(row.timetable_key);
 if(!object||object.size>LIMITS.gzip||object.customMetadata?.sha256!==row.timetable_sha256||object.customMetadata?.instanceId!==config.instance||object.customMetadata?.schema!=='gsis.rehearsal.timetable'||object.customMetadata?.version!=='1')fail(503,'TIMETABLE_INVALID','The private timetable object is missing or has mismatched metadata.');
 let plain,value;try{plain=await bounded(object.body.pipeThrough(new DecompressionStream('gzip')),LIMITS.timetable);if(await hash(plain)!==row.timetable_sha256)throw Error();value=JSON.parse(new TextDecoder().decode(plain));exact(value,['schema','version','instanceId','day'],'Timetable object');if(value.schema!=='gsis.rehearsal.timetable'||value.version!==1||value.instanceId!==config.instance)throw Error();validateDay(value.day);}catch{fail(503,'TIMETABLE_INVALID','Timetable gzip, schema or SHA256 verification failed.');}
 return {schema:value.schema,version:1,revision:row.revision,sha256:row.timetable_sha256,day:value.day};
}
async function mutate(env,config,who,input,importing=false){
 exact(input,['requestId','expectedRevision',importing?'snapshot':'command'],importing?'Import request':'Write request');
 const id=requestId(input.requestId),expected=input.expectedRevision;if(!Number.isSafeInteger(expected)||expected<0)fail(400,'INVALID_REVISION','Supply the revision that was read before editing.');
 const digest=await hash(stable(input)),connection=db(env),prior=await receipt(connection,config,id,digest);if(prior)return prior;
 const {row,current}=await load(connection,config);if(expected!==row.revision)fail(409,'STALE_REVISION','The rehearsal changed. Refresh and review before making a new request.');
 const counts=await connection.prepare('SELECT (SELECT count(*) FROM rehearsal_receipts) AS receipts, (SELECT count(*) FROM rehearsal_outbox) AS intents').first();
 if(counts.receipts>=LIMITS.receipts||counts.intents>=LIMITS.intents)fail(409,'COUNT_LIMIT','This bounded rehearsal has reached its receipt or simulated intent limit. Export it and provision a fresh isolated instance.');
 const next=importing?validateSnapshot(input.snapshot):advance(current,input.command,id),revision=row.revision+1,now=new Date().toISOString();
 const document={schema:SCHEMA,version:1,dataset:next.dataset,state:next.state,day:next.day,importSource:next.importSource||current?.importSource||null};document.state.revision=revision;
 const serialized=JSON.stringify(document);if(encoder.encode(serialized).byteLength>LIMITS.document)fail(413,'SIZE_LIMIT','Ledger exceeds 512 KiB. Export and create a fresh rehearsal instance.');
 const timetable=await saveTimetable(env,config,next.day),kind=importing?'snapshot-import':input.command.operation;
 const response={ok:true,simulation:true,release:RELEASE,requestId:id,revision,replayed:false,result:next.result||{saved:true},projection:projection(document),timetable:{version:1,sha256:timetable.sha},notification:{status:'simulated',delivery:'never-sent',intentId:id+':intent'}};
 const statements=[
  connection.prepare('UPDATE rehearsal_ledger SET revision=?,document=?,timetable_key=?,timetable_sha256=?,last_request_id=?,updated_at=? WHERE singleton=1 AND instance_id=? AND revision=?').bind(revision,serialized,timetable.key,timetable.sha,id,now,config.instance,expected),
  connection.prepare('INSERT INTO rehearsal_receipts (request_id,instance_id,digest,revision,actor_email,response_json,created_at) SELECT ?,?,?,?,?,?,? FROM rehearsal_ledger WHERE singleton=1 AND instance_id=? AND revision=? AND last_request_id=?').bind(id,config.instance,digest,revision,who.email,JSON.stringify(response),now,config.instance,revision,id),
  connection.prepare("INSERT INTO rehearsal_outbox (id,revision,request_id,kind,status,detail_json,created_at) SELECT ?,?,?,?,'simulated',?,? FROM rehearsal_ledger WHERE singleton=1 AND instance_id=? AND revision=? AND last_request_id=?").bind(id+':intent',revision,id,kind,JSON.stringify({simulation:true,delivery:'never-sent',syntheticRecipients:document.state.assignments.filter(a=>a.status==='draft').map(a=>a.staffId).slice(0,32)}),now,config.instance,revision,id),
  connection.prepare('INSERT INTO rehearsal_timetable_versions (revision,object_key,sha256,created_at) SELECT ?,?,?,? FROM rehearsal_ledger WHERE singleton=1 AND instance_id=? AND revision=? AND last_request_id=?').bind(revision,timetable.key,timetable.sha,now,config.instance,revision,id)
 ];
 try{const results=await connection.batch(statements);if(results.some(r=>r.success===false))throw Error();}catch(e){const recovered=await receipt(connection,config,id,digest);if(recovered)return recovered;fail(503,'WRITE_UNCERTAIN','Storage did not confirm this write. Retry the exact same request ID, revision and body.');}
 const saved=await receipt(connection,config,id,digest);if(!saved)fail(409,'STALE_REVISION','Another write won the revision. Refresh and review before making a new request.');
 return {...saved,replayed:false};
}
const ROUTES=new Set(['/api/ui','/api/health','/api/state','/api/command','/api/timetable/read','/api/snapshot/export','/api/snapshot/import']);
export default {
 async fetch(request,env){
  try{
   const config=configuration(env),url=new URL(request.url);if(url.origin!==config.origin)fail(403,'ORIGIN_REQUIRED','Use the configured dedicated rehearsal origin.');
   if(url.pathname==='/'&&request.method==='GET'){
    const nonce=crypto.randomUUID().replaceAll('-','');return new Response(loginPage(config,nonce),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"' https://accounts.google.com; connect-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; style-src 'nonce-"+nonce+"' https://accounts.google.com; img-src https://accounts.google.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
   }
   if(!ROUTES.has(url.pathname)||request.method!=='POST')fail(404,'NOT_FOUND','Rehearsal route not found.');
   if(url.search)fail(400,'INVALID_ROUTE','Storage selectors and query parameters are unsupported.');
   const who=await authenticate(request,config);await bindings(env,config);const input=await parseBody(request),connection=db(env);
   if(url.pathname==='/api/command')return json(await mutate(env,config,who,input));
   if(url.pathname==='/api/snapshot/import')return json(await mutate(env,config,who,input,true));
   exact(input,[],'Read request');const {row,current}=await load(connection,config);
   if(url.pathname==='/api/ui')return json({html:adminControls,identity:who.email});
   if(url.pathname==='/api/health'){
    const timetable=await readTimetable(env,config,row);let persistenceProof={verified:false,reason:'Create a synthetic day, then run this readback check.'};
    if(row.revision>0){
     const proof=await connection.prepare("SELECT r.request_id,r.revision,v.object_key,v.sha256,o.status FROM rehearsal_receipts r JOIN rehearsal_timetable_versions v ON v.revision=r.revision JOIN rehearsal_outbox o ON o.request_id=r.request_id WHERE r.revision=? AND r.instance_id=? AND o.status='simulated'").bind(row.revision,config.instance).first();
     if(!proof||!timetable||proof.request_id!==row.last_request_id||proof.object_key!==row.timetable_key||proof.sha256!==timetable.sha256)fail(503,'PERSISTENCE_PROOF_FAILED','Current revision, receipt, simulated outbox and verified gzip pointer do not agree.');
     persistenceProof={verified:true,revision:row.revision,requestId:proof.request_id,sha256:timetable.sha256,checks:['D1 revision/receipt/outbox/version agree','private R2 gzip bounded decompression','SHA256 and timetable schema verified']};
    }
    return json({simulation:true,release:RELEASE,instanceId:config.instance,bindings:{d1:'verified-rehearsal-schema-v1',r2:'verified-rehearsal-marker-v1'},revision:row.revision,timetable:!!timetable,persistenceProof,capabilities:['synthetic-operations','snapshot-v1','simulated-notification-intents'],limits:LIMITS});
   }
   if(url.pathname==='/api/timetable/read')return json({simulation:true,timetable:await readTimetable(env,config,row)});
   if(url.pathname==='/api/snapshot/export'){
    if(!current)fail(409,'SEED_REQUIRED','Create the synthetic school day first.');
    // Replay before export verifies the entire supported journal, never truncates it.
    replay(current.dataset);return json({schema:'gsis.rehearsal.snapshot',version:1,release:RELEASE,mode:'simulation-only',source:{system:'gsis-roster-rehearsal',instanceId:config.instance,snapshotId:crypto.randomUUID(),exportedAt:new Date().toISOString()},dataset:current.dataset});
   }
   const intents=await connection.prepare('SELECT id,revision,kind,status,detail_json,created_at FROM rehearsal_outbox ORDER BY revision DESC LIMIT 100').all();
   return json({simulation:true,release:RELEASE,revision:row.revision,projection:projection(current),intents:intents.results.map(r=>({...r,detail:JSON.parse(r.detail_json),detail_json:undefined})),intentsShownLimit:100});
  }catch(error){return json({ok:false,error:error.code||'REHEARSAL_UNAVAILABLE',message:error.status?error.message:'Rehearsal storage is unavailable. Retry reads; retry uncertain writes with the exact request identity.'},error.status||503);}
 }
};
