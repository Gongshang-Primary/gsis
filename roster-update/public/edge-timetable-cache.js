import {assertRecoveryWritable} from '../../shared/edge-recovery.js';
/* GSIS_API_SECRET_BEGIN */
// First-party API credentials share one operator-selected setting. Browser
// sessions, private relief links and third-party credentials stay independent.
function gsisApiSecret(env,legacyName){
 const value=env?.GSIS_SECRET;
 if(value!==undefined||Object.prototype.hasOwnProperty.call(env||{},'GSIS_SECRET')){
  if(typeof value!=='string'||!/^[!-~]{32,8000}$/.test(value))throw Object.assign(Error('GSIS_SECRET must contain 32 to 8000 printable ASCII characters without spaces.'),{status:503,code:'GSIS_SECRET_INVALID'});
  return value;
 }
 return env?.[legacyName];
}

/* GSIS_API_SECRET_END */
/* Private immutable timetable parts. D1 is the publication authority; R2 is not.
   No Apps Script request or cache age can certify a timetable after cutover. */
const enc=new TextEncoder(),MAX_PART=16000000,schemas=new WeakMap();
const fail=(code,message,status=503)=>{throw Object.assign(Error(message),{code,status});};
const copy=x=>JSON.parse(JSON.stringify(x));
export async function timetableHash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?enc.encode(value):value))].map(x=>x.toString(16).padStart(2,'0')).join('');}
const base64=bytes=>{let out='';for(let i=0;i<bytes.length;i+=32768)out+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(out);};
const dates=(from,n)=>Array.from({length:n},(_,i)=>new Date(Date.parse(from+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
const dateValid=d=>typeof d==='string'&&/^20\d\d-\d\d-\d\d$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
const knownKeys=(x,max)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length<=max&&Object.values(x).every(v=>/^[a-f0-9]{64}$/.test(v))?x:null;
const publicEntry=({id,name,from,to,priority,pruned,teacherCount,layoutMode,createdBy,createdAt})=>({id,name,from,to,priority,pruned,teacherCount,layoutMode,createdBy,createdAt});
const periods=model=>Array.from({length:model.maxPeriod+1},(_,period)=>{const startMinutes=model.timing.startMinutes+period*model.timing.periodMinutes,endMinutes=startMinutes+model.timing.periodMinutes,fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');return {period,start:fmt(startMinutes),end:fmt(endMinutes),startMinutes,endMinutes};});
export class TimetablePackageStore{
 constructor(db,bucket){if(!db?.prepare||!bucket?.get||!bucket?.put)fail('TIMETABLE_EDGE_SETUP','Bind GSIS_JOBS and the private ROSTER_TIMETABLE_SNAPSHOTS bucket.');this.db=db;this.bucket=bucket;}
 async ensure(){if(!schemas.has(this.db))schemas.set(this.db,this.db.batch([
  this.db.prepare('CREATE TABLE IF NOT EXISTS gsis_timetable_packages (scope TEXT NOT NULL, stage TEXT NOT NULL, authority_key TEXT NOT NULL, source_key TEXT NOT NULL, roster_revision INTEGER NOT NULL, register_revision INTEGER NOT NULL, manifest_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(scope,stage,authority_key))'),
  this.db.prepare('CREATE TABLE IF NOT EXISTS gsis_timetable_jobs (scope TEXT NOT NULL, stage TEXT NOT NULL, revision INTEGER NOT NULL, dates_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(scope,stage))'),
  this.db.prepare('CREATE TABLE IF NOT EXISTS gsis_timetable_refresh_state (scope TEXT NOT NULL, stage TEXT NOT NULL, signature TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(scope,stage))'),
  this.db.prepare('CREATE TABLE IF NOT EXISTS gsis_timetable_job_claims (scope TEXT NOT NULL, stage TEXT NOT NULL, token TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(scope,stage))'),
  this.db.prepare('CREATE TABLE IF NOT EXISTS gsis_timetable_part_tombstones (object_key TEXT PRIMARY KEY, marked_at INTEGER NOT NULL, deleted_at INTEGER, candidate_uploaded_at INTEGER NOT NULL)'),
  this.db.prepare('CREATE TABLE IF NOT EXISTS gsis_timetable_nonces (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)'),
  this.db.prepare("CREATE TABLE IF NOT EXISTS gsis_timetable_fences (source TEXT PRIMARY KEY, request_id TEXT NOT NULL, token TEXT NOT NULL, prior_revision TEXT NOT NULL, revision TEXT NOT NULL, phase TEXT NOT NULL, updated_at TEXT NOT NULL)")]).catch(error=>{schemas.delete(this.db);throw error;}));await schemas.get(this.db);return this;}
 async head(stage,authority){const row=await this.db.prepare('SELECT * FROM gsis_timetable_packages WHERE scope=? AND stage=? AND authority_key=?').bind('roster',stage,authority).first();return row?{...row,manifest:JSON.parse(row.manifest_json)}:null;}
 async putPart(value){const json=JSON.stringify(value),plain=enc.encode(json);if(plain.byteLength>MAX_PART)fail('TIMETABLE_PART_TOO_LARGE','This timetable part exceeds the supported size.',413);const key=await timetableHash(plain),db=this.db.withSession?this.db.withSession('first-primary'):this.db,originalKey='roster/timetables/v2/parts/'+key+'.json.gz',retired=await db.prepare('SELECT 1 AS retired FROM gsis_timetable_part_tombstones WHERE object_key=?').bind(originalKey).first(),objectKey=retired?'roster/timetables/v2/parts/'+key+'.'+crypto.randomUUID()+'.json.gz':originalKey;const compressed=new Uint8Array(await new Response(new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()),compressedKey=await timetableHash(compressed);await this.bucket.put(objectKey,compressed,{httpMetadata:{contentType:'application/gzip'},customMetadata:{sha256:key,compressedSha256:compressedKey,bytes:String(plain.byteLength)}});return {key,bytes:plain.byteLength,compressedKey,objectKey};}
 async part(meta){const path=meta?.objectKey?.match(/^roster\/timetables\/v2\/parts\/([a-f0-9]{64})(?:\.[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})?\.json\.gz$/);if(!path||path[1]!==meta.key)fail('TIMETABLE_PART_INVALID','The private timetable manifest is invalid.');const object=await this.bucket.get(meta.objectKey);if(!object)fail('TIMETABLE_PART_MISSING','A timetable package is rebuilding. Retry shortly.');const data=new Uint8Array(await object.arrayBuffer());if(await timetableHash(data)!==meta.compressedKey)fail('TIMETABLE_PART_CORRUPT','A timetable part failed verification.');return {key:meta.key,bytes:meta.bytes,data:base64(data),encodedKey:await timetableHash(base64(data))};}
 async promote({stage,authorityKey,sourceKey,rosterRevision,registerRevision,referenceRevision,manifest,claim}){
  // R2 writes finish before this statement. Source heads are checked in
  // the same SQLite write as promotion; a late builder cannot publish old data.
  // Cleanup marks unreferenced paths atomically in D1. A writer that raced the
  // mark must retry under a fresh path, never revive an object queued to delete.
  const db=this.db.withSession?this.db.withSession('first-primary'):this.db,json=JSON.stringify(manifest),retired="SELECT 1 FROM json_each(?,'$.parts') part JOIN gsis_timetable_part_tombstones t ON t.object_key=json_extract(part.value,'$.objectKey')";
  const result=await db.prepare("INSERT INTO gsis_timetable_packages(scope,stage,authority_key,source_key,roster_revision,register_revision,manifest_json,updated_at) SELECT 'roster',?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM gsis_edge_heads WHERE scope='roster' AND mode='active' AND revision=?) AND EXISTS(SELECT 1 FROM gsis_edge_heads WHERE scope='roster-register' AND mode='active' AND revision=?) AND (? IS NULL OR EXISTS(SELECT 1 FROM gsis_edge_heads WHERE scope='roster-references' AND mode='active' AND revision=?)) AND NOT EXISTS("+retired+") AND (? IS NULL OR EXISTS(SELECT 1 FROM gsis_timetable_job_claims WHERE scope='roster' AND stage=? AND token=?)) ON CONFLICT(scope,stage,authority_key) DO UPDATE SET source_key=excluded.source_key,roster_revision=excluded.roster_revision,register_revision=excluded.register_revision,manifest_json=excluded.manifest_json,updated_at=excluded.updated_at WHERE excluded.roster_revision>=gsis_timetable_packages.roster_revision AND excluded.register_revision>=gsis_timetable_packages.register_revision").bind(stage,authorityKey,sourceKey,rosterRevision,registerRevision,json,new Date().toISOString(),rosterRevision,registerRevision,referenceRevision??null,referenceRevision??null,json,claim?.token??null,claim?.stage??null,claim?.token??null).run();
  if(result.meta?.changes!==1){if(await db.prepare(retired+' LIMIT 1').bind(json).first())fail('TIMETABLE_PART_RETIRED','A timetable part was retired during preparation. Retry the package.');if(claim&&!await db.prepare("SELECT 1 FROM gsis_timetable_job_claims WHERE scope='roster' AND stage=? AND token=?").bind(claim.stage,claim.token).first())fail('TIMETABLE_CLAIM_LOST','Another worker owns this timetable refresh.');fail('TIMETABLE_BATCH_CHANGED','Timetables changed while preparing the package. Reload the baseline batch first.',409);}return manifest;
 }
}
export async function enqueueEdgeTimetableRefresh(env,{stage='suspended',dates:changedDates=[],revision=0}={}){
 assertRecoveryWritable(env);
 if(!['baseline','suspended'].includes(stage))fail('TIMETABLE_STAGE','Invalid timetable stage.',400);
 const cache=await new TimetablePackageStore(env.GSIS_JOBS,env.ROSTER_TIMETABLE_SNAPSHOTS).ensure(),stamp=new Date().toISOString();
 // updated_at is also the durable generation. Even two same-revision enqueues
 // in one millisecond must not be acknowledged by an older running builder.
 await cache.db.batch((stage==='baseline'?['baseline','suspended']:[stage]).map(kind=>cache.db.prepare("INSERT INTO gsis_timetable_jobs(scope,stage,revision,dates_json,updated_at) VALUES('roster',?,?,?,?) ON CONFLICT(scope,stage) DO UPDATE SET revision=MAX(revision,excluded.revision),dates_json=excluded.dates_json,updated_at=CASE WHEN excluded.updated_at>gsis_timetable_jobs.updated_at THEN excluded.updated_at ELSE strftime('%Y-%m-%dT%H:%M:%fZ',gsis_timetable_jobs.updated_at,'+0.001 seconds') END").bind(kind,revision,JSON.stringify(changedDates.filter(dateValid)),stamp)));
 return {queued:true};
}
async function runtime(){const [edge,domain]=await Promise.all([import('./edge-roster.js'),import('./edge-roster-domain.js')]);return {...edge,...domain};}
export async function edgeTimetableBatch(env,input,who,provided,options={}){assertRecoveryWritable(env);const r=provided||await runtime(),stage=input.stage,encoding=input.encoding||'gzip-base64-v1';if(!['baseline','suspended'].includes(stage)||!['gzip-parts-v1','gzip-base64-v1','json-v1'].includes(encoding))fail('TIMETABLE_INPUT','Choose a valid timetable stage and encoding.',400);
 const cache=await new TimetablePackageStore(env.GSIS_JOBS,env.ROSTER_TIMETABLE_SNAPSHOTS).ensure(),[ops,reg]=await Promise.all([r.loadEdgeRoster(env),r.readEdgeRosterRegister(env)]),state=ops.state,index=reg.state,ctx=await r.buildEdgeRosterContext(env,state,{operation:'timetableBatch',stage},who),user=ctx.user;
 if(!user?.staffId&&!(who?.service===true&&(user?.smc||user?.admin)))fail('STAFF_REQUIRED','An active staff identity is required.',403);
 const R=r.GSISRoster,O=r.GSISRosterOperations,from=ctx.today,to=dates(from,31)[30],mapping=dates(from,31).map(date=>({date,baselineId:R.active(index.entries,date)?.id||null})),ids=new Set(mapping.map(d=>d.baselineId)),entries=index.entries.filter(e=>!e.pruned&&ids.has(e.id));
 const modelKeys=Object.fromEntries(await Promise.all(entries.map(async e=>[e.id,await timetableHash(JSON.stringify([2,e.id,e.modelKey||e.modelDigest||e.modelObjectKey||e.modelFile]))]))),baselineKey=await timetableHash(JSON.stringify([2,Object.entries(modelKeys).sort(([a],[b])=>a.localeCompare(b))])),manifestKey=await timetableHash(JSON.stringify([2,baselineKey,entries.map(publicEntry),mapping])),baselineAuthority=await timetableHash(JSON.stringify([2,'baseline-authorised-view'])),authorityKey=stage==='baseline'?baselineAuthority:await timetableHash(JSON.stringify([2,user.email?.toLowerCase(),user.staffId,!!user.smc,!!user.admin])),baselineSourceKey=await timetableHash(JSON.stringify([3,manifestKey,baselineAuthority]));
 if(stage==='suspended'&&(input.baselineKey!==baselineKey||input.baselineSourceKey&&input.baselineSourceKey!==baselineSourceKey))fail('TIMETABLE_BATCH_CHANGED','Timetables changed. Reload the baseline batch first.',409);
 const privileged=user.smc||user.admin,records=(state.staplerPlans||[]).filter(row=>row.date>=from&&row.date<=to),identity=value=>value?.edgeObject===true?[value.key,value.digest]:value;
 const dependencies=records.map(row=>{const confirmed=O.confirmedStaplerSnapshot(row,state.audit);return [row.date,row.name,row.baselineId,privileged?row.revision:null,privileged?identity(row.draft):null,confirmed?.revision,identity(confirmed?.plan),row.publishedRevision,identity(row.published),state.dailyPublicationStates?.[row.date]||null];});
 const sourceKey=stage==='baseline'?baselineSourceKey:await timetableHash(JSON.stringify([6,manifestKey,authorityKey,dependencies,(state.staplerRequests||[]).filter(x=>x.date>=from&&x.date<=to&&(privileged||x.staffId===user.staffId)),ctx.people?.map(x=>[x.id,x.active,x.name,x.groups,x.role,x.mk,x.appointmentLevel]),ctx.smcIds]));
 if(input.expectedSourceKey&&input.expectedSourceKey!==sourceKey)fail('TIMETABLE_BATCH_CHANGED','Timetables changed. Reload the baseline batch first.',409);
 const header={schema:1,stage,from,to,baselineKey,manifestKey,registerRevision:reg.revision,authorityKey,sourceKey,checkedAt:new Date().toISOString()};if(input.manifestOnly)return {...header,manifestOnly:true};if(input.knownSourceKey===sourceKey)return {...header,unchanged:true};
 const repairParts=options.repairParts||new Set();let prior=await cache.head(stage,authorityKey),manifest=prior?.source_key===sourceKey&&!Object.keys(prior.manifest.parts).some(key=>repairParts.has(key))?prior.manifest:null;
 const buildKeyCache=new Map(),planBuildKey=async row=>{const value=JSON.stringify([2,dependencies.find(x=>x[0]===row.date),authorityKey]);if(!buildKeyCache.has(value))buildKeyCache.set(value,await timetableHash(value));return buildKeyCache.get(value);};
 if(!manifest){
  if(stage==='suspended'&&r.hydrateEdgeRosterPlans){const changed=[];for(const row of records)if(prior?.manifest.buildKeys?.[row.date]!==await planBuildKey(row)||repairParts.has(prior?.manifest.payload.plans.find(item=>item.date===row.date)?.partKey))changed.push(row.date);if(changed.length)await r.hydrateEdgeRosterPlans(env,state,[...new Set(changed)]);}
  const visible=stage==='suspended'?(state.staplerPlans||[]).filter(row=>row.date>=from&&row.date<=to).map(row=>({row,confirmed:O.confirmedStaplerSnapshot(row,state.audit)})).filter(({row,confirmed})=>(privileged?row.draft||confirmed?.plan:confirmed?.plan)&&(privileged||O.mayViewConfirmed(state,ctx,row))):[];const parts={},buildKeys={},payload={schema:1,stage,from,to,baselineKey,manifestKey,registerRevision:reg.revision};
  if(stage==='baseline'){payload.entries=entries.map(publicEntry);payload.dates=mapping;payload.modelKeys=modelKeys;payload.models=[];for(const entry of entries){const reused=prior?.manifest.payload.models.find(x=>x.id===entry.id&&x.contentKey===modelKeys[entry.id]&&!repairParts.has(x.partKey)),meta=reused&&prior.manifest.parts[reused.partKey]||await cache.putPart(await r.readEdgeRosterModel(env,entry));parts[meta.key]=meta;payload.models.push({id:entry.id,contentKey:modelKeys[entry.id],partKey:meta.key});}}
  else{payload.operationsRevision=state.revision;payload.plans=[];payload.planKeys={};for(const {row,confirmed}of visible){const buildKey=await planBuildKey(row);buildKeys[row.date]=buildKey;const reused=prior?.manifest.buildKeys?.[row.date]===buildKey&&prior.manifest.payload.plans.find(x=>x.date===row.date&&!repairParts.has(x.partKey));if(reused){payload.plans.push(copy(reused));payload.planKeys[row.date]=prior.manifest.payload.planKeys[row.date];parts[reused.partKey]=prior.manifest.parts[reused.partKey];continue;}const plan=privileged?(row.draft||confirmed.plan):confirmed.plan,timetableDay=row.published||confirmed?O.timetableDay(state,{...ctx,days:{},baselineDays:{}},{date:row.date}):null;const value={date:row.date,name:String(row.name||''),baselineId:row.baselineId,baselineContentKey:null,revision:privileged?row.revision:confirmed.revision,viewMode:privileged?'draft':'confirmed',baselineChanged:false,plan:O.confirmedStaplerProjection(plan),confirmedPlan:confirmed?O.confirmedStaplerProjection(confirmed.plan):null,confirmedRevision:confirmed?.revision||0,timetableDay};const key=await timetableHash(JSON.stringify(value)),old=prior?.manifest.payload.plans.find(x=>x.date===row.date&&prior.manifest.payload.planKeys[x.date]===key&&!repairParts.has(x.partKey)),meta=old&&prior.manifest.parts[old.partKey]||await cache.putPart(value);parts[meta.key]=meta;payload.planKeys[row.date]=key;payload.plans.push({date:row.date,partKey:meta.key});}payload.plans.sort((a,b)=>a.date.localeCompare(b.date));const view=O.staplerDatesView(state,ctx);payload.datesView={revision:state.revision,confirmedAccess:view.confirmedAccess,dates:view.dates.filter(x=>x.date>=from&&x.date<=to)};}
  manifest=await cache.promote({stage,authorityKey,sourceKey,rosterRevision:ops.revision,registerRevision:reg.revision,referenceRevision:ctx.edgeGuards?.find(guard=>guard.scope==='roster-references')?.revision,manifest:{payload,parts,buildKeys},claim:options.claim});
 }
 // Prewarm publishes private parts and a guarded manifest. Only a real reader
 // needs to download, base64-encode and serialize those parts into a response.
 if(options.prepareOnly)return {...header,ready:true,unchanged:prior?.source_key===sourceKey};
 const payload=copy(manifest.payload),known=knownKeys(stage==='baseline'?input.knownModelKeys:input.knownPlanKeys,stage==='baseline'?1000:31),field=stage==='baseline'?'models':'plans',id=stage==='baseline'?'id':'date',keys=stage==='baseline'?payload.modelKeys:payload.planKeys;if(known){payload.delta=true;payload[field]=payload[field].filter(x=>known[x[id]]!==keys[x[id]]);payload[stage==='baseline'?'removedModelIds':'removedDates']=Object.keys(known).filter(k=>!keys[k]);}
 const parts={},bytesExpected=enc.encode(JSON.stringify(payload)).length+payload[field].reduce((n,row)=>n+(manifest.parts[row.partKey]?.bytes||0),0);if(bytesExpected>64*1024*1024)fail('TIMETABLE_BATCH_TOO_LARGE','This timetable preload exceeds the supported size.',413);const damaged=new Set();for(const row of payload[field]){try{parts[row.partKey]=await cache.part(manifest.parts[row.partKey]);}catch(error){if(options.repairAttempt||!['TIMETABLE_PART_MISSING','TIMETABLE_PART_CORRUPT'].includes(error.code))throw error;damaged.add(row.partKey);}}
 // A restored manifest can outlive its derived R2 parts. Repair only failed
 // parts from current authorised sources, once per request; an unavailable R2
 // service must not become an unbounded retry loop. Publication still checks
 // the source revisions, claim and cleanup tombstones atomically.
 if(damaged.size)return edgeTimetableBatch(env,input,who,r,{...options,repairParts:damaged,repairAttempt:true});
 if(encoding==='gzip-parts-v1'){const data=JSON.stringify({schema:1,payload,parts}),bytes=enc.encode(JSON.stringify(payload)).length+Object.values(parts).reduce((n,p)=>n+p.bytes,0);return {...header,key:await timetableHash(data),bytes,encoding,data};}
 for(let i=0;i<payload[field].length;i++){const row=payload[field][i],part=parts[row.partKey],raw=Uint8Array.from(atob(part.data),x=>x.charCodeAt(0)),text=await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).text(),value=JSON.parse(text);payload[field][i]=stage==='baseline'?{id:row.id,contentKey:row.contentKey,model:value}:value;}
 const data=JSON.stringify(payload),bytes=enc.encode(data).length;if(encoding==='json-v1')return {...header,key:await timetableHash(data),bytes,encoding,data};const compressed=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());return {...header,key:await timetableHash(data),bytes,encoding,data:base64(compressed)};
}
async function timetableRefreshProbe(db,now,checkpoint){
 const from=new Date(now+28800000).toISOString().slice(0,10),to=dates(from,31)[30],heads=(await db.prepare("SELECT scope,revision,mode FROM gsis_edge_heads WHERE scope IN ('roster','roster-register','roster-references') ORDER BY scope").all()).results||[];
 if(['roster','roster-register','roster-references'].some(scope=>!heads.some(row=>row.scope===scope&&row.mode==='active')))fail('ROSTER_EDGE_NOT_ACTIVE','Roster migration is not active.');
 const headKey=JSON.stringify([1,from,heads]);let previous;try{previous=JSON.parse(checkpoint?.signature||'null');}catch{}
 if(previous?.headKey===headKey&&typeof previous.baseline==='string'&&typeof previous.suspended==='string')return {...previous,unchanged:true};
 // Return small revision/count summaries, never operational record bodies. The
 // count detects deletions too. Reference freshness timestamps and unrelated
 // history/inbox/delivery writes do not change a timetable package.
 const rows=(await db.prepare("SELECT scope,collection,MAX(revision) AS version,COUNT(*) AS count FROM gsis_edge_records WHERE (scope='roster' AND collection IN ('staplerPlans','staplerRequests','dailyPublicationStates','audit','publicationSnapshots','assignments','importedRelief','massPublications') AND (record_date='' OR record_date BETWEEN ? AND ?)) OR (scope='roster-references' AND collection='contacts' AND record_id IN ('key:rosterPeople','key:rosterSMCIds','key:rosterAdminIds')) GROUP BY scope,collection ORDER BY scope,collection").bind(from,to).all()).results||[];
 const baseline=JSON.stringify([1,from,heads.filter(row=>row.scope==='roster-register')]);
 return {headKey,baseline,suspended:JSON.stringify([1,baseline,rows])};
}
async function cacheTables(env){
 const db=env.GSIS_JOBS;if(!db?.prepare)return null;
 const primary=db.withSession?db.withSession('first-primary'):db;
 const rows=(await primary.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('gsis_timetable_packages','gsis_timetable_jobs','gsis_timetable_refresh_state')").all()).results||[];
 return {db:primary,tables:new Set(rows.map(row=>row.name))};
}
// Scheduler safety net for lost wakes. It reads compact version information,
// never the roster or R2. An irrelevant domain write advances only the small
// probe checkpoint so the next minute does not repeat the summary scan.
export async function isEdgeTimetableRefreshDue(env,{now=Date.now()}={}){
 assertRecoveryWritable(env);
 const context=await cacheTables(env);if(!context)return false;const {db,tables}=context;
 if(tables.has('gsis_timetable_jobs')&&await db.prepare("SELECT 1 present FROM gsis_timetable_jobs WHERE scope='roster' LIMIT 1").first())return true;
 if(!tables.has('gsis_timetable_packages')||!await db.prepare("SELECT 1 present FROM gsis_timetable_packages WHERE scope='roster' LIMIT 1").first())return false;
 if(!tables.has('gsis_timetable_refresh_state'))return true;
 const checkpoints=(await db.prepare("SELECT stage,signature FROM gsis_timetable_refresh_state WHERE scope='roster'").all()).results||[],probe=await timetableRefreshProbe(db,now,checkpoints.find(row=>row.stage==='$probe'));
 if(['baseline','suspended'].some(stage=>checkpoints.find(row=>row.stage===stage)?.signature!==probe[stage]))return true;
 if(!probe.unchanged)await db.prepare("INSERT INTO gsis_timetable_refresh_state(scope,stage,signature,updated_at) VALUES('roster','$probe',?,?) ON CONFLICT(scope,stage) DO UPDATE SET signature=excluded.signature,updated_at=excluded.updated_at").bind(JSON.stringify(probe),new Date(now).toISOString()).run();
 return false;
}
// Diagnostic timestamps describe preparation, not a promise that every private
// authority has the latest package. On-demand reads verify current source keys.
export async function readTimetableCacheHealth(env,_options={}){
 const context=await cacheTables(env);if(!context||!context.tables.has('gsis_timetable_packages'))return {available:false,stages:[]};const {db,tables}=context;
 const packages=(await db.prepare("SELECT stage,COUNT(*) packages,MAX(updated_at) lastPreparedAt FROM gsis_timetable_packages WHERE scope='roster' AND stage IN ('baseline','suspended') GROUP BY stage").all()).results||[];
 const pending=tables.has('gsis_timetable_jobs')?(await db.prepare("SELECT stage FROM gsis_timetable_jobs WHERE scope='roster' AND stage IN ('baseline','suspended')").all()).results||[]:[];
 const checkpoints=tables.has('gsis_timetable_refresh_state')?(await db.prepare("SELECT stage,updated_at FROM gsis_timetable_refresh_state WHERE scope='roster' AND stage IN ('baseline','suspended')").all()).results||[]:[];
 return {available:true,stages:['baseline','suspended'].map(stage=>{const prepared=packages.find(row=>row.stage===stage),queued=pending.some(row=>row.stage===stage);return {stage,status:queued?'pending':prepared?'prepared':'no-cache',packages:Number(prepared?.packages||0),lastPreparedAt:prepared?.lastPreparedAt||null,lastSourceCheckAt:checkpoints.find(row=>row.stage===stage)?.updated_at||null,pending:queued,freshness:'unverified'};})};
}
export async function drainEdgeTimetableJobs(env,who,options={},provided){
 assertRecoveryWritable(env);
 const cache=await new TimetablePackageStore(env.GSIS_JOBS,env.ROSTER_TIMETABLE_SNAPSHOTS).ensure(),db=cache.db.withSession?cache.db.withSession('first-primary'):cache.db,now=Number.isFinite(options.now)?options.now:Date.now(),stamp=new Date(now).toISOString(),limit=Math.min(2,Math.max(1,Math.floor(Number(options.limit)||2)));
 const checkpoints=(await db.prepare("SELECT stage,signature FROM gsis_timetable_refresh_state WHERE scope='roster'").all()).results||[],signatures=await timetableRefreshProbe(db,now,checkpoints.find(row=>row.stage==='$probe'));
 const observed=async()=>{if(!signatures.unchanged)await db.prepare("INSERT INTO gsis_timetable_refresh_state(scope,stage,signature,updated_at) VALUES('roster','$probe',?,?) ON CONFLICT(scope,stage) DO UPDATE SET signature=excluded.signature,updated_at=excluded.updated_at").bind(JSON.stringify(signatures),stamp).run();};
 for(const stage of ['baseline','suspended']){
  const checkpoint=checkpoints.find(row=>row.stage===stage);if(checkpoint?.signature===signatures[stage])continue;
  // An empty installation stays lazy. Existing packages receive one upgrade
  // repair; thereafter changed source summaries or the new day enqueue work.
  if(!checkpoint){const existing=await db.prepare("SELECT 1 AS present FROM gsis_timetable_packages WHERE scope='roster' AND stage=? UNION ALL SELECT 1 FROM gsis_timetable_jobs WHERE scope='roster' AND stage=? LIMIT 1").bind(stage,stage).first();if(!existing){await db.prepare("INSERT OR IGNORE INTO gsis_timetable_refresh_state(scope,stage,signature,updated_at) VALUES('roster',?,?,?)").bind(stage,signatures[stage],stamp).run();continue;}}
  // Do not replace an existing generation while another invocation owns it.
  await db.prepare("INSERT OR IGNORE INTO gsis_timetable_jobs(scope,stage,revision,dates_json,updated_at) VALUES('roster',?,0,'[]',?)").bind(stage,stamp).run();
 }
 const jobs=(await db.prepare("SELECT stage,revision,updated_at FROM gsis_timetable_jobs WHERE scope='roster' ORDER BY stage LIMIT ?").bind(limit).all()).results||[];
 if(!jobs.length){await observed();return {ready:true,idle:true,processed:0};}
 let processed=0,base;
 for(const job of jobs){
  const token=crypto.randomUUID(),claim=await db.prepare("INSERT INTO gsis_timetable_job_claims(scope,stage,token,expires_at) SELECT 'roster',?,?,? WHERE EXISTS(SELECT 1 FROM gsis_timetable_jobs WHERE scope='roster' AND stage=? AND revision=? AND updated_at=?) ON CONFLICT(scope,stage) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE gsis_timetable_job_claims.expires_at<=?").bind(job.stage,token,now+120000,job.stage,job.revision,job.updated_at,now).run();
  if(claim.meta?.changes!==1)continue;
  try{
   const prepare={prepareOnly:true,claim:{stage:job.stage,token}};
   if(job.stage==='baseline')base=await edgeTimetableBatch(env,{stage:'baseline'},who,provided,prepare);
   else{base=base||await edgeTimetableBatch(env,{stage:'baseline',manifestOnly:true},who,provided);await edgeTimetableBatch(env,{stage:'suspended',baselineKey:base.baselineKey,baselineSourceKey:base.sourceKey},who,provided,prepare);}
   // A claim lost to recovery or a newer job generation cannot acknowledge
   // work. Record the pre-build signature so a concurrent source write repairs
   // itself on the next tick even if its explicit enqueue failed.
   const owned="EXISTS(SELECT 1 FROM gsis_timetable_job_claims WHERE scope='roster' AND stage=? AND token=?)";
   await db.batch([
    db.prepare("INSERT INTO gsis_timetable_refresh_state(scope,stage,signature,updated_at) SELECT 'roster',?,?,? WHERE "+owned+" ON CONFLICT(scope,stage) DO UPDATE SET signature=excluded.signature,updated_at=excluded.updated_at").bind(job.stage,signatures[job.stage],stamp,job.stage,token),
    db.prepare("DELETE FROM gsis_timetable_jobs WHERE scope='roster' AND stage=? AND revision=? AND updated_at=? AND "+owned).bind(job.stage,job.revision,job.updated_at,job.stage,token),
    db.prepare("DELETE FROM gsis_timetable_job_claims WHERE scope='roster' AND stage=? AND token=?").bind(job.stage,token)
   ]);processed++;
  }catch(error){await db.prepare("DELETE FROM gsis_timetable_job_claims WHERE scope='roster' AND stage=? AND token=?").bind(job.stage,token).run();throw error;}
 }
 await observed();return {ready:true,idle:processed===0,processed};
}

// Service-only occupancy projection includes occupying staff display names.
// Contact details, class content and drafts stay private. Only baseline,
// confirmed and published lessons decide occupancy.
export function projectRosterVenueDay(model,entry,state,date,parity,r){
 const O=r.GSISRosterOperations,S=r.GSISRosterStapler,record=(state.staplerPlans||[]).find(x=>x.date===date),confirmed=O.confirmedStaplerSnapshot(record,state.audit),publication=state.dailyPublicationStates?.[date];
 if(record?.confirmed&&!confirmed)fail('VENUES_DAY_UNVERIFIED','The suspended plan requires reconfirmation.');
 const dow=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7,week=confirmed?null:model?.layoutMode==='single-week'?model.single:model?.[parity];if(!confirmed&&(dow>4||!week))fail('VENUES_DAY_UNVERIFIED','The school day has no verified timetable week.');
 const timing=(confirmed?confirmed.plan.periods:periods(model)).map(p=>({period:p.period,start:p.start,end:p.end,startMinutes:p.startMinutes,endMinutes:p.endMinutes})),normalize=x=>String(x||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' '),identities=new Map(),identify=(name,id)=>{if(!name||!id)return;const key=normalize(name),old=identities.get(key);if(old&&old!==id)fail('VENUES_IDENTITY_AMBIGUOUS','Timetable identities need review.');identities.set(key,id);};
 for(const bridge of state.nameBridges||[])identify(bridge.timetableName,bridge.staffId);for(const teacher of confirmed?.plan?.teachers||[])identify(teacher.timetableName||teacher.name,teacher.staffId);
 for(const match of O.matchTimetableNames({...state,nameBridgesSeeded:true},(publication?.teachers||[]).filter(t=>t.name).map(t=>({id:t.staffId,name:t.name})),week?.blocks||[]))identify(match.timetableName,match.person.id);
 let teachers=[],label='Timetable';
 if(confirmed){if(confirmed.plan.date!==date||confirmed.plan.baselineId!==record.baselineId)fail('VENUES_DAY_UNVERIFIED','The suspended plan identity needs review.');teachers=S.effectiveDay(confirmed.plan).teachers;label='Confirmed timetable';}
 else teachers=week.blocks.map((b,i)=>({staffId:identities.get(normalize(b.name))||'unmatched:'+i,name:b.name,timetableName:b.name,cells:b.cells.slice(dow*week.perDay,(dow+1)*week.perDay)}));
 const usePublication=publication&&(!confirmed||publication.staplerRevision===confirmed.revision);if(usePublication){const sourceIds=confirmed?[S.planId(confirmed.plan),confirmed.plan.baselineId]:[entry?.id];if(!sourceIds.includes(publication.baselineId)||JSON.stringify(publication.periods)!==JSON.stringify(timing))fail('VENUES_DAY_UNVERIFIED','Published identity or timings differ from the saved timetable.');const changes=new Map((publication.teachers||[]).map(t=>[t.staffId,t]));teachers=teachers.map(t=>changes.has(t.staffId)?{...t,cells:changes.get(t.staffId).cells}:t);for(const row of changes.values())if(!teachers.some(t=>t.staffId===row.staffId))teachers.push(row);}
 const intervals=[],seen=new Map(),add=(venue,p,name='')=>{venue=String(venue||'').trim();if(!venue)return;if(/[\n\r]/.test(venue))fail('VENUES_ALIAS_AMBIGUOUS','A multiline venue needs explicit mapping.');const period=timing[p];if(!period)fail('VENUES_DAY_UNVERIFIED','A lesson has invalid timing.');if(typeof name!=='string')fail('VENUES_DAY_UNVERIFIED','An occupying staff name is invalid.');name=name.trim().replace(/\s+/g,' ');if(name.length>200||/[\u0000-\u001f\u007f]/.test(name))fail('VENUES_DAY_UNVERIFIED','An occupying staff name is invalid.');for(const alias of venue.split(/\s+\+\s+/).map(x=>x.trim()).filter(Boolean)){const key=alias+'|'+p;let interval=seen.get(key);if(!interval){interval={venueAlias:alias,start:period.startMinutes,end:period.endMinutes,sourceId:'period:'+p,kind:'timetable',label,staffNames:[]};seen.set(key,interval);intervals.push(interval);}if(name&&!interval.staffNames.includes(name)){if(interval.staffNames.length>=200)fail('VENUES_DAY_UNVERIFIED','Too many occupying staff names.');interval.staffNames.push(name);}}};
 for(const teacher of teachers){if(!Array.isArray(teacher.cells)||teacher.cells.length!==timing.length)fail('VENUES_DAY_UNVERIFIED','A timetable row is incomplete.');teacher.cells.forEach((cell,p)=>{if(!Array.isArray(cell)||cell.length!==4)fail('VENUES_DAY_UNVERIFIED','A timetable cell is invalid.');if(cell.some(v=>String(v).trim())&&cell[2])add(cell[2],p,teacher.name||teacher.timetableName||'');else if(cell[0]&&!/^(?:absent|no relief required|free)$/i.test(cell[0].trim())&&(cell[1]||cell[3]))fail('VENUES_ALIAS_MISSING','A class lesson has no verified venue.');});}
 if(usePublication)for(const row of publication.publicReliefRows||[])if(['unassigned','no-relief'].includes(row.status))add(row.venue,row.period);for(const interval of intervals)interval.staffNames.sort();return intervals.sort((a,b)=>a.start-b.start||a.venueAlias.localeCompare(b.venueAlias));
}
export async function edgeVenueSourceKey(index,state,r){const identity=value=>value?.edgeObject===true?[value.key,value.digest]:value,confirmed=(state.staplerPlans||[]).map(row=>{const c=r.GSISRosterOperations.confirmedStaplerSnapshot(row,state.audit);return c?[row.date,row.baselineId,c.revision,identity(c.plan)]:row.confirmed?[row.date,'unproven']:null;}).filter(Boolean);return timetableHash(JSON.stringify([3,index.entries,confirmed,state.dailyPublicationStates||{},state.nameBridges||[]]));}
export async function edgeVenuesSource(env,input,r){
 const [ops,reg]=await Promise.all([r.loadEdgeRoster(env),r.readEdgeRosterRegister(env)]),state=ops.state,index=reg.state,key=await edgeVenueSourceKey(index,state,r);
 if(input.expectedKey&&input.expectedKey!==key)fail('VENUES_SOURCE_CHANGED','Roster changed while preparing occupancy.',409);const header={schema:1,source:'roster',authoritative:true,key,observedAt:new Date().toISOString(),updatedAt:ops.head?.updatedAt||ops.head?.updated_at||new Date().toISOString()};if(input.operation==='manifest')return {...header,unchanged:input.knownKey===key};if(input.operation!=='snapshot')fail('VENUES_SOURCE_INPUT','Choose a supported source read.',400);
 const {from,to,calendarDates}=input,count=(Date.parse(to)-Date.parse(from))/86400000+1;if(!dateValid(from)||!dateValid(to)||!Number.isInteger(count)||count<1||count>366||!Array.isArray(calendarDates)||calendarDates.length!==count)fail('VENUES_SOURCE_INPUT','Supply verified Calendar coverage for up to366 days.',400);const calendar=new Map(calendarDates.map(d=>[d.date,d]));if(calendar.size!==count)fail('VENUES_SOURCE_INPUT','Calendar dates must be unique.',400);
 if(r.hydrateEdgeRosterPlans)await r.hydrateEdgeRosterPlans(env,state,dates(from,count));const models=new Map(),patterns={},days=[],periodSets=new Map(),dayPatterns=new Map();
 for(const date of dates(from,count)){
  const context=calendar.get(date),entry=r.GSISRoster.active(index.entries,date),record=(state.staplerPlans||[]).find(x=>x.date===date),confirmed=r.GSISRosterOperations.confirmedStaplerSnapshot(record,state.audit);
  if(!context||typeof context.schoolDay!=='boolean'||context.code){days.push({date,covered:false,patternId:'',code:'CALENDAR_UNCOVERED'});continue;}
  if(!entry&&!confirmed){days.push({date,covered:false,patternId:'',code:'TIMETABLE_BASELINE_MISSING'});continue;}
  if(!confirmed&&!models.has(entry.id))models.set(entry.id,await r.readEdgeRosterModel(env,entry));const model=confirmed?null:models.get(entry.id),timing=confirmed?confirmed.plan.periods:periods(model),p=timing.map(x=>({id:'P'+x.period,label:'P'+x.period,start:x.startMinutes,end:x.endMinutes}));periodSets.set(JSON.stringify(p),p);
  let rows=[];try{if(context.schoolDay||confirmed){const dated=state.dailyPublicationStates?.[date]||record?.confirmed||record?.published||record?.confirmedPlan,stamp=JSON.stringify([confirmed?r.GSISRosterStapler.planId(confirmed.plan):entry.id,context.parity,new Date(date+'T12:00:00Z').getUTCDay(),dated?date:'']);if(!dayPatterns.has(stamp))dayPatterns.set(stamp,projectRosterVenueDay(model,entry,state,date,context.parity,r));rows=dayPatterns.get(stamp);}}catch(error){days.push({date,covered:false,patternId:'',code:error.code||'TIMETABLE_UNVERIFIED'});continue;}
  const patternId=await timetableHash(JSON.stringify(rows));patterns[patternId]=rows;days.push({date,covered:true,patternId});
 }
 if(periodSets.size>1)fail('VENUES_PERIODS_AMBIGUOUS','The selected year has different period timings. Review the baseline register.');const [oh,rh]=await Promise.all([ops.store.head(),reg.store.head()]);if(oh.revision!==ops.revision||rh.revision!==reg.revision)fail('VENUES_SOURCE_CHANGED','Roster changed during occupancy preparation.',409);return {...header,periods:[...periodSets.values()][0]||[],days,patterns};
}
export async function edgeVenuesSourceRoute(request,env,provided){const json=(v,status)=>Response.json(v,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});try{
 if(request.method!=='POST')fail('METHOD','POST required.',405);if(typeof gsisApiSecret(env,'VENUES_BRIDGE_SECRET')!=='string'||gsisApiSecret(env,'VENUES_BRIDGE_SECRET').length<32)fail('VENUES_SOURCE_SETUP','Configure the private Venues source bridge.');if(Number(request.headers.get('Content-Length'))>1000000)fail('BODY_TOO_LARGE','Source request is too large.',413);
 const raw=await request.text();if(enc.encode(raw).length>1000000)fail('BODY_TOO_LARGE','Source request is too large.',413);let envelope;try{envelope=JSON.parse(raw);}catch{fail('INVALID_SIGNATURE','A signed source request is required.',403);}if(typeof envelope.payload!=='string'||!/^[a-f0-9]{64}$/.test(envelope.signature||''))fail('INVALID_SIGNATURE','A signed source request is required.',403);
 const secret=await crypto.subtle.importKey('raw',enc.encode(gsisApiSecret(env,'VENUES_BRIDGE_SECRET')),{name:'HMAC',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('HMAC',secret,Uint8Array.from(envelope.signature.match(/../g),x=>parseInt(x,16)),enc.encode(envelope.payload)))fail('INVALID_SIGNATURE','The source signature is invalid.',403);const p=JSON.parse(envelope.payload);if(p.action!=='venuesSource'||p.service!=='gsis-venues-v1'||p.source!=='roster'||p.identity!==undefined||!Number.isFinite(p.timestamp)||Math.abs(Date.now()-p.timestamp)>60000||typeof p.nonce!=='string'||!p.nonce||p.nonce.length>200||!p.input||!['manifest','snapshot'].includes(p.input.operation))fail('INVALID_SIGNATURE','The signed source request is invalid.',403);
 assertRecoveryWritable(env);const cache=await new TimetablePackageStore(env.GSIS_JOBS,env.ROSTER_TIMETABLE_SNAPSHOTS).ensure();await cache.db.prepare('DELETE FROM gsis_timetable_nonces WHERE expires_at<?').bind(Date.now()).run();const inserted=await cache.db.prepare('INSERT OR IGNORE INTO gsis_timetable_nonces(nonce,expires_at) VALUES(?,?)').bind(p.nonce,Date.now()+120000).run();if(inserted.meta?.changes!==1)fail('REPLAY','The signed source request was already consumed.',409);const fence=await cache.db.prepare("SELECT phase FROM gsis_timetable_fences WHERE source='roster'").first();if(fence&&fence.phase!=='ready')fail('VENUES_FENCE_PENDING','A Roster occupancy change needs completion before refreshing Venues.',409);const data=await edgeVenuesSource(env,p.input,provided||await runtime());return json({ok:true,data},200);
 }catch(error){return json({ok:false,status:error.status||503,code:error.code||'VENUES_SOURCE_UNAVAILABLE',error:error.code?error.message:'The authoritative occupancy could not be read.'},error.status||503);}}
