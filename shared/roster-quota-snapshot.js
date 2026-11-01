// Immutable published Deploy quotas. The caller authenticates the producer;
// this store never reads drafts, changes authority or replaces a captured week.
const MAX_BYTES=750000,MAX_ROWS=2000,encoder=new TextEncoder(),installed=new WeakSet();
const fail=(code,message,status=503)=>{throw Object.assign(Error(message),{code,status});};
const invalid=message=>fail('QUOTA_SNAPSHOT_INVALID',message,400);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\x00-\x1f]/.test(value)&&value.trim()===value;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function date(value){return typeof value==='string'&&/^20\d\d-\d\d-\d\d$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}
function time(value){return Number.isSafeInteger(value)&&value>=0;}
function timestamp(value){return typeof value==='string'&&/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)&&date(value.slice(0,10))&&Number.isFinite(Date.parse(value))?Date.parse(value):null;}
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
// Sorting avoids treating JSON key order or a reordered staff list as a new
// publication. Reject non-JSON and unbounded inputs before serializing them.
function canonical(value,depth=0){
 if(depth>20)invalid('The published quota payload is too deeply nested.');
 if(value===null||typeof value==='boolean'||typeof value==='string')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))invalid('Published quota numbers must be finite.');return value;}
 if(Array.isArray(value)){if(value.length>10000)invalid('The published quota payload is too large.');return value.map(item=>canonical(item,depth+1));}
 if(!object(value))invalid('Use a JSON publication quota payload.');
 return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key],depth+1)]));
}
function normalized(value,now){
 if(!object(value)||!object(value.source)||!Array.isArray(value.rows)||!value.rows.length||value.rows.length>MAX_ROWS)invalid('A bounded published staff quota list is required.');
 const source=value.source,published=timestamp(source.publishedAt);
 if(value.published===false||source.published===false||source.service!=='deploy'||!text(value.versionId)||value.versionId!==source.versionId||!text(source.commit)||!text(source.calculationVersion)||!Number.isSafeInteger(source.revision)||source.revision<0||source.publicationRevision!==undefined&&(!Number.isSafeInteger(source.publicationRevision)||source.publicationRevision<0)||published===null||published>now+60000)invalid('A verified Deploy publication identity and timestamp are required.');
 if(!date(value.from)||!date(value.to)||value.from>value.to||source.from!==value.from||source.to!==value.to)invalid('Published quota effective dates must match their source.');
 const ids=new Set();for(const row of value.rows){
  if(!object(row)||!text(row.id)||ids.has(row.id)||!(row.R===null||typeof row.R==='number'&&Number.isFinite(row.R)&&row.R>=0&&row.R<=1000))invalid('Each staff quota needs a unique stable ID and a finite non-negative R or null.');
  ids.add(row.id);
 }
 const {checkedAt,cacheDay,...frozenSource}=source;
 const {snapshot,...body}=value;
 const out=canonical({...body,source:{...frozenSource,publishedAt:new Date(published).toISOString()},rows:value.rows.toSorted((a,b)=>a.id.localeCompare(b.id))});
 const json=JSON.stringify(out);if(encoder.encode(json).length>MAX_BYTES)invalid('The published quota snapshot exceeds its storage bound.');
 return {value:out,json,published};
}
function database(env){const db=env?.GSIS_JOBS;if(!db?.prepare||!db?.batch)fail('QUOTA_SNAPSHOT_STORAGE','Published R snapshot storage is unavailable.');return typeof db.withSession==='function'?db.withSession('first-primary'):db;}
function checked(results){if(!Array.isArray(results)||results.some(row=>row?.success===false))fail('QUOTA_SNAPSHOT_STORAGE','The published R snapshot transaction could not be confirmed.');return results;}
async function storage(work){try{return await work();}catch(error){if(/^QUOTA_SNAPSHOT_/.test(error?.code||''))throw error;throw Object.assign(Error('Published R snapshot storage could not be read or written.'),{code:'QUOTA_SNAPSHOT_STORAGE',status:503,cause:error});}}
async function ensure(db){
 if(installed.has(db))return;
 checked(await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS gsis_roster_quota_snapshots (snapshot_id TEXT PRIMARY KEY, version_id TEXT NOT NULL, revision INTEGER NOT NULL, publication_order INTEGER NOT NULL, publication_commit TEXT NOT NULL, calculation_version TEXT NOT NULL, published_at INTEGER NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT NOT NULL, created_at INTEGER NOT NULL, written_at INTEGER NOT NULL, digest TEXT NOT NULL, body_json TEXT NOT NULL)'),
  db.prepare('CREATE INDEX IF NOT EXISTS gsis_roster_quota_publications ON gsis_roster_quota_snapshots(published_at DESC,publication_order DESC,revision DESC,publication_commit DESC)')
 ]));installed.add(db);
}
async function identity(source){return digest(JSON.stringify([source.versionId,source.revision,source.commit]));}
function sameSource(source,expected){return ['versionId','revision','commit','calculationVersion'].every(key=>source[key]===expected?.[key])&&(expected?.publishedAt===undefined||timestamp(source.publishedAt)===timestamp(expected.publishedAt));}
async function verified(row){
 try{
  if(!row||!hash(row.snapshot_id)||!hash(row.digest)||typeof row.body_json!=='string'||encoder.encode(row.body_json).length>MAX_BYTES||!time(row.created_at)||!time(row.written_at)||row.created_at>row.written_at)throw Error('metadata');
  const value=JSON.parse(row.body_json),body=normalized(value,row.written_at),source=body.value.source;
  if(body.json!==row.body_json||await digest(row.body_json)!==row.digest||await identity(source)!==row.snapshot_id||row.version_id!==source.versionId||row.revision!==source.revision||row.publication_order!==(source.publicationRevision||0)||row.publication_commit!==source.commit||row.calculation_version!==source.calculationVersion||row.published_at!==body.published||row.effective_from!==value.from||row.effective_to!==value.to)throw Error('digest');
  return {...body.value,snapshot:{schema:1,id:row.snapshot_id,digest:row.digest,publishedAt:row.published_at,createdAt:row.created_at,writtenAt:row.written_at}};
 }catch(error){fail('QUOTA_SNAPSHOT_CORRUPT','The stored published R snapshot failed its integrity checks.');}
}
function metadata(value){return {snapshotId:value.snapshot.id,digest:value.snapshot.digest,versionId:value.source.versionId,revision:value.source.revision,commit:value.source.commit,calculationVersion:value.source.calculationVersion,publishedAt:value.source.publishedAt,createdAt:value.snapshot.createdAt,writtenAt:value.snapshot.writtenAt};}

export async function writeQuotaSnapshot(env,value,{now=Date.now()}={}){
 if(!time(now))invalid('Use a valid snapshot write time.');
 const body=normalized(value,now),source=body.value.source,id=await identity(source),bodyDigest=await digest(body.json);
 return storage(async()=>{
  const db=database(env);await ensure(db);
  const rows=checked(await db.batch([
   db.prepare('INSERT OR IGNORE INTO gsis_roster_quota_snapshots(snapshot_id,version_id,revision,publication_order,publication_commit,calculation_version,published_at,effective_from,effective_to,created_at,written_at,digest,body_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,source.versionId,source.revision,source.publicationRevision||0,source.commit,source.calculationVersion,body.published,body.value.from,body.value.to,now,now,bodyDigest,body.json),
   db.prepare('SELECT * FROM gsis_roster_quota_snapshots WHERE snapshot_id=?').bind(id)
  ]));
  const row=rows[1]?.results?.[0];if(!row)fail('QUOTA_SNAPSHOT_STORAGE','The published R snapshot write was not confirmed.');
  const saved=await verified(row);if(row.digest!==bodyDigest||row.body_json!==body.json)fail('QUOTA_SNAPSHOT_CONFLICT','This publication already has different frozen R values.',409);
  return {...metadata(saved),replayed:rows[0]?.meta?.changes===0};
 });
}

export async function readQuotaSnapshot(env,{date:schoolDate,asOf,expectedSource}={}){
 if(!date(schoolDate)||!time(asOf))invalid('Choose a school date and a fixed publication cutoff.');
 return storage(async()=>{
  const db=database(env);let row;
  try{row=await db.prepare('SELECT * FROM gsis_roster_quota_snapshots WHERE effective_from<=? AND effective_to>=? AND published_at<=? ORDER BY published_at DESC,publication_order DESC,revision DESC,publication_commit DESC LIMIT 1').bind(schoolDate,schoolDate,asOf).first();}
  catch(error){if(!/no such table:\s*(?:main\.)?gsis_roster_quota_snapshots\b/i.test(String(error?.message||'')))throw error;}
  if(!row)fail('QUOTA_SNAPSHOT_MISSING','No verified published R snapshot covers this weekly checkpoint.');
  const value=await verified(row);if(expectedSource&&!sameSource(value.source,expectedSource))fail('QUOTA_SNAPSHOT_STALE','The R snapshot does not match the verified Deploy publication.');
  return value;
 });
}

export async function quotaSnapshotHealth(env,{now=Date.now(),expectedSource}={}){
 if(!time(now))invalid('Use a valid snapshot health time.');
 return storage(async()=>{
  const db=database(env);let row;
  try{row=await db.prepare('SELECT * FROM gsis_roster_quota_snapshots WHERE published_at<=? ORDER BY published_at DESC,publication_order DESC,revision DESC,publication_commit DESC LIMIT 1').bind(now).first();}
  catch(error){if(!/no such table:\s*(?:main\.)?gsis_roster_quota_snapshots\b/i.test(String(error?.message||'')))throw error;}
  if(!row)return {configured:true,available:false,status:'missing'};
  const value=await verified(row);return {configured:true,available:true,status:expectedSource&&!sameSource(value.source,expectedSource)?'behind':'ready',...metadata(value),ageMs:Math.max(0,now-value.snapshot.writtenAt)};
 });
}
