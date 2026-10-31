/* Immutable D1 generations for the Google backup. No network or authority switch
 * occurs here; the caller verifies the signed Google proof before acknowledging. */
var GSiSRosterMirror=(()=>{
 const Store=typeof GSiSEdgeStore!=='undefined'?GSiSEdgeStore:typeof require==='function'?require('./edge-store.js'):null;
 const SCOPES="('roster','roster-register')",MAX_PAGE_BYTES=4000000;
 const fail=(code,message,status=409)=>{throw Object.assign(Error(message),{code,status});};
 const checked=rows=>{if(!Array.isArray(rows)||rows.some(r=>r?.success===false))fail('ROSTER_MIRROR_STORAGE','The backup transaction could not be confirmed.',503);return rows;};
 const connection=db=>typeof db.withSession==='function'?db.withSession('first-primary'):db;
 const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 const request=value=>{if(typeof value!=='string'||!value||value.length>200||/[\x00-\x1f]/.test(value))fail('ROSTER_MIRROR_REQUEST','A stable backup request identity is required.',400);return value;};
 const bytes=value=>new TextEncoder().encode(value).length;
 async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');}
 const transportInstalled=new WeakSet();
 async function ensure(db){
  if(!Store)fail('ROSTER_MIRROR_STORAGE','The D1 store is not loaded.',503);
  await Store.open(db,'roster').ensure();await Store.open(db,'roster-register').ensure();
  if(!transportInstalled.has(db)&&await connection(db).prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gsis_absence_transport'").first()){
   const bump="UPDATE gsis_roster_mirror_control SET transport_revision=transport_revision+1,updated_at=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=1; INSERT OR IGNORE INTO gsis_roster_mirror_outbox(scope,revision,created_at) SELECT 'roster-transport',transport_revision,updated_at FROM gsis_roster_mirror_control WHERE id=1;";
   const active="EXISTS(SELECT 1 FROM gsis_edge_heads WHERE scope='roster' AND mode IN ('active','paused')) AND NOT EXISTS(SELECT 1 FROM gsis_roster_mirror_control WHERE id=1 AND phase='released')";
   const statements=[];
   for(const event of ['INSERT','UPDATE','DELETE'])statements.push(db.prepare(`CREATE TRIGGER IF NOT EXISTS gsis_roster_mirror_transport_${event.toLowerCase()} AFTER ${event} ON gsis_absence_transport WHEN ${active} BEGIN ${bump} END`));
   for(const event of ['INSERT','UPDATE','DELETE'])statements.push(db.prepare(`CREATE TRIGGER IF NOT EXISTS gsis_roster_mirror_transport_guard_${event.toLowerCase()} BEFORE ${event} ON gsis_absence_transport WHEN EXISTS(SELECT 1 FROM gsis_roster_mirror_control WHERE id=1 AND phase IN (${event==='INSERT'?"'quiescing',":""}'paused')) BEGIN SELECT RAISE(ABORT,'ROSTER_MIRROR_WRITES_PAUSED'); END`));
   checked(await db.batch(statements));transportInstalled.add(db);
  }
 }
 function generation(row){if(!row)return null;return {id:row.id,epoch:row.epoch,revisions:{roster:row.roster_revision,register:row.register_revision},transportRevision:row.transport_revision,recordCount:row.record_count,receiptCount:row.receipt_count,transportCount:row.transport_count,totalCount:row.record_count+row.receipt_count+row.transport_count,createdAt:row.created_at,state:row.state,cursor:row.cursor,initialDigest:row.initial_digest,snapshotDigest:row.snapshot_digest,manifestDigest:row.manifest_digest,leaseToken:row.lease_token,leaseUntil:row.lease_until,mirroredAt:row.mirrored_at,proof:JSON.parse(row.proof_json||'{}')};}
 function publicGeneration(value){if(!value)return null;const {leaseToken,leaseUntil,...safe}=value;return safe;}
 async function state(db){
  const c=connection(db),rs=checked(await c.batch([c.prepare(`SELECT * FROM gsis_edge_heads WHERE scope IN ${SCOPES} ORDER BY scope`),c.prepare('SELECT * FROM gsis_roster_mirror_control WHERE id=1')]));
  const heads=rs[0].results,control=rs[1].results[0],roster=heads.find(h=>h.scope==='roster'),register=heads.find(h=>h.scope==='roster-register');
  return {control,heads,roster,register,revisions:{roster:roster?.revision||0,register:register?.revision||0},enabled:heads.length===2&&heads.every(h=>['active','paused'].includes(h.mode))&&control.phase!=='released'};
 }
 async function status(db,now=Date.now()){
  await ensure(db);const s=await state(db),c=connection(db),rs=checked(await c.batch([c.prepare("SELECT * FROM gsis_roster_mirror_generations WHERE state='mirrored' ORDER BY mirrored_at DESC,id DESC LIMIT 1"),c.prepare("SELECT * FROM gsis_roster_mirror_generations WHERE state='captured' LIMIT 1"),c.prepare('SELECT COUNT(*) count,MIN(created_at) oldest FROM gsis_roster_mirror_outbox WHERE generation_id IS NULL')])),pending=rs[2].results[0];
  const latest=generation(rs[0].results[0]),proof=latest&&latest.epoch===s.control.epoch&&latest.revisions.roster===s.revisions.roster&&latest.revisions.register===s.revisions.register&&latest.transportRevision===s.control.transport_revision?latest.proof:null;
  const pendingCount=s.enabled&&!proof?Math.max(1,pending.count):0,oldest=pending.oldest||Math.min(...s.heads.map(h=>h.updated_at||now));
  return {proof,lastVerified:proof,enabled:s.enabled,epoch:s.control.epoch,phase:s.control.phase,releaseRequestId:s.control.release_request,revisions:s.revisions,transportRevision:s.control.transport_revision,latest:publicGeneration(generation(rs[0].results[0])),pending:publicGeneration(generation(rs[1].results[0])),pendingCount,lagMs:pendingCount?Math.max(1,now-oldest):0};
 }
 function seed(value){return JSON.stringify({schema:'gsis-roster-mirror-v1',id:value.id,epoch:value.epoch,revisions:value.revisions,transportRevision:value.transportRevision,recordCount:value.recordCount,receiptCount:value.receiptCount,transportCount:value.transportCount});}
 async function capture(db,options={}){
  await ensure(db);const now=options.now??Date.now(),leaseMs=Math.min(600000,Math.max(1000,options.leaseMs??420000)),c=connection(db);
  for(let attempt=0;attempt<3;attempt++){
   const s=await state(db);if(!s.enabled)return {enabled:false,phase:s.control.phase};
   const existing=await c.prepare("SELECT * FROM gsis_roster_mirror_generations WHERE state='captured' LIMIT 1").first();
   if(existing){const token=options.leaseToken===existing.lease_token&&existing.lease_until>now?existing.lease_token:crypto.randomUUID();const rs=checked(await c.batch([c.prepare("UPDATE gsis_roster_mirror_generations SET lease_token=?,lease_until=? WHERE id=? AND state='captured' AND epoch=? AND (lease_until<=? OR lease_token=?)").bind(token,now+leaseMs,existing.id,s.control.epoch,now,options.leaseToken||''),c.prepare('SELECT * FROM gsis_roster_mirror_generations WHERE id=?').bind(existing.id)]));const row=rs[1].results[0];return row.lease_token===token?{enabled:true,...generation(row)}:{enabled:true,busy:true,id:row.id,leaseUntil:row.lease_until};}
   const mirrored=await c.prepare("SELECT * FROM gsis_roster_mirror_generations WHERE state='mirrored' AND epoch=? AND roster_revision=? AND register_revision=? AND transport_revision=? ORDER BY mirrored_at DESC LIMIT 1").bind(s.control.epoch,s.revisions.roster,s.revisions.register,s.control.transport_revision).first();if(mirrored)return {enabled:true,skipped:true,reason:'caught-up',...generation(mirrored)};
   const hasTransport=!!await c.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gsis_absence_transport'").first();
   const count=await c.prepare(`SELECT (SELECT COUNT(*) FROM gsis_edge_records WHERE scope IN ${SCOPES}) records,(SELECT COUNT(*) FROM gsis_edge_receipts WHERE scope IN ${SCOPES}) receipts,${hasTransport?'(SELECT COUNT(*) FROM gsis_absence_transport)':'0'} transport`).first();
   const id=crypto.randomUUID(),token=crypto.randomUUID(),meta={id,epoch:s.control.epoch,revisions:s.revisions,transportRevision:s.control.transport_revision,recordCount:count.records,receiptCount:count.receipts,transportCount:count.transport},initial=await hash(seed(meta));
   const live=`EXISTS(SELECT 1 FROM gsis_roster_mirror_control WHERE id=1 AND epoch=? AND phase IN ('normal','quiescing','paused') AND transport_revision=?) AND EXISTS(SELECT 1 FROM gsis_edge_heads WHERE scope='roster' AND revision=? AND mode IN ('active','paused')) AND EXISTS(SELECT 1 FROM gsis_edge_heads WHERE scope='roster-register' AND revision=? AND mode IN ('active','paused'))`;
   const statements=[c.prepare(`INSERT INTO gsis_roster_mirror_generations(id,epoch,roster_revision,register_revision,transport_revision,record_count,receipt_count,transport_count,created_at,initial_digest,snapshot_digest,lease_token,lease_until) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${live} AND NOT EXISTS(SELECT 1 FROM gsis_roster_mirror_generations WHERE state='captured')`).bind(id,meta.epoch,meta.revisions.roster,meta.revisions.register,meta.transportRevision,count.records,count.receipts,count.transport,now,initial,initial,token,now+leaseMs,s.control.epoch,s.control.transport_revision,s.revisions.roster,s.revisions.register),
    c.prepare(`INSERT INTO gsis_roster_mirror_items(generation_id,seq,kind,scope,payload) SELECT ?,ROW_NUMBER() OVER(ORDER BY scope,collection,position,record_id),'record',scope,json_object('scope',scope,'collection',collection,'record_id',record_id,'position',position,'record_date',record_date,'value_json',value_json,'revision',revision) FROM gsis_edge_records WHERE scope IN ${SCOPES} AND EXISTS(SELECT 1 FROM gsis_roster_mirror_generations WHERE id=?)`).bind(id,id),
    c.prepare(`INSERT INTO gsis_roster_mirror_items(generation_id,seq,kind,scope,payload) SELECT ?,?+ROW_NUMBER() OVER(ORDER BY scope,actor,request_id),'receipt',scope,json_object('scope',scope,'actor',actor,'request_id',request_id,'digest',digest,'revision',revision,'result_json',result_json,'created_at',created_at) FROM gsis_edge_receipts WHERE scope IN ${SCOPES} AND EXISTS(SELECT 1 FROM gsis_roster_mirror_generations WHERE id=?)`).bind(id,count.records,id)];
   if(hasTransport){const columns=(await c.prepare('PRAGMA table_info(gsis_absence_transport)').all()).results.map(x=>x.name);const json=columns.flatMap(name=>["'"+name.replaceAll("'","''")+"'",'"'+name.replaceAll('"','""')+'"']).join(',');statements.push(c.prepare(`INSERT INTO gsis_roster_mirror_items(generation_id,seq,kind,scope,payload) SELECT ?,?+ROW_NUMBER() OVER(ORDER BY namespace,actor,request_id),'transport','roster',json_object(${json}) FROM gsis_absence_transport WHERE EXISTS(SELECT 1 FROM gsis_roster_mirror_generations WHERE id=?)`).bind(id,count.records+count.receipts,id));}
   statements.push(c.prepare('SELECT * FROM gsis_roster_mirror_generations WHERE id=?').bind(id));const rs=checked(await c.batch(statements)),row=rs.at(-1).results[0];if(row)return {enabled:true,...generation(row)};
  }
  fail('ROSTER_MIRROR_BUSY','Roster changed while the backup was being captured. Retry.',503);
 }
 async function readGeneration(db,id){request(id);return generation(await connection(db).prepare('SELECT * FROM gsis_roster_mirror_generations WHERE id=?').bind(id).first());}
 function lease(g,token,now=Date.now()){if(!g||g.state!=='captured'||!token||g.leaseToken!==token||g.leaseUntil<=now)fail('ROSTER_MIRROR_LEASE','This backup step no longer owns its generation.');}
 async function page(db,id,options={}){
  await ensure(db);const g=await readGeneration(db,id);lease(g,options.leaseToken,options.now??Date.now());const cursor=options.cursor??g.cursor;
  if(!Number.isSafeInteger(cursor)||cursor!==g.cursor)fail('ROSTER_MIRROR_CURSOR','Resume from the accepted backup cursor.');
  const limit=Math.min(1000,Math.max(1,options.limit??100)),maxBytes=Math.min(MAX_PAGE_BYTES,Math.max(1000,options.maxBytes??500000)),result=await connection(db).prepare('WITH candidates AS (SELECT seq,kind,scope,payload FROM gsis_roster_mirror_items WHERE generation_id=? AND seq>? ORDER BY seq LIMIT ?), sized AS (SELECT *,ROW_NUMBER() OVER(ORDER BY seq) n,SUM(LENGTH(CAST(payload AS BLOB))+256) OVER(ORDER BY seq) total_bytes FROM candidates) SELECT seq,kind,scope,payload FROM sized WHERE total_bytes<=? OR n=1 ORDER BY seq').bind(id,cursor,limit,maxBytes).all();checked([result]);
  const items=[];let size=2,chain=g.snapshotDigest;
  for(const row of result.results){const item={seq:row.seq,kind:row.kind,scope:row.scope,payload:JSON.parse(row.payload)},json=JSON.stringify(item),length=bytes(json)+1;if(length>MAX_PAGE_BYTES)fail('ROSTER_MIRROR_ITEM_SIZE','A backup record exceeds the bounded transfer size.',413);if(items.length&&size+length>maxBytes)break;items.push(item);size+=length;chain=await hash(chain+'\n'+json);}
  const next=items.at(-1)?.seq??cursor;if(next<g.totalCount&&!items.length)fail('ROSTER_MIRROR_INCOMPLETE','The frozen backup is missing records.',503);
  return {id,generationId:id,epoch:g.epoch,cursor,next,done:next===g.totalCount,items,digest:await hash(JSON.stringify(items)),snapshotDigest:chain};
 }
 async function advance(db,id,input){
  await ensure(db);lease(await readGeneration(db,id),input.leaseToken);const accepted=await connection(db).prepare('SELECT * FROM gsis_roster_mirror_pages WHERE generation_id=? AND cursor=?').bind(id,input.cursor).first();if(accepted){if(accepted.next_cursor!==input.next||accepted.digest!==input.digest)fail('ROSTER_MIRROR_PAGE','A different page already owns this cursor.');return readGeneration(db,id);}
  const p=await page(db,id,{cursor:input.cursor,leaseToken:input.leaseToken,limit:1000,maxBytes:MAX_PAGE_BYTES});
  // The caller may have sent a smaller page; verify exactly its contiguous end.
  const items=p.items.filter(item=>item.seq<=input.next);if(!items.length||items.at(-1).seq!==input.next||await hash(JSON.stringify(items))!==input.digest)fail('ROSTER_MIRROR_PAGE','The backup page acknowledgement does not match.');
  const proof=input.proof;if(!proof||proof.generationId!==id||proof.cursor!==input.cursor||proof.next!==input.next||proof.digest!==input.digest)fail('ROSTER_MIRROR_PAGE','Google did not acknowledge this backup page.');
  const g=await readGeneration(db,id);let chain=g.snapshotDigest;for(const item of items)chain=await hash(chain+'\n'+JSON.stringify(item));const now=Date.now();
  const rs=checked(await connection(db).batch([connection(db).prepare("UPDATE gsis_roster_mirror_generations SET cursor=?,snapshot_digest=?,lease_until=? WHERE id=? AND state='captured' AND cursor=? AND lease_token=? AND lease_until>? AND epoch=(SELECT epoch FROM gsis_roster_mirror_control WHERE id=1)").bind(input.next,chain,now+420000,id,input.cursor,input.leaseToken,now),connection(db).prepare("INSERT INTO gsis_roster_mirror_pages(generation_id,cursor,next_cursor,digest,snapshot_digest,proof_json) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM gsis_roster_mirror_generations WHERE id=? AND cursor=? AND lease_token=?) ON CONFLICT(generation_id,cursor) DO NOTHING").bind(id,input.cursor,input.next,input.digest,chain,JSON.stringify(proof),id,input.next,input.leaseToken),connection(db).prepare('SELECT * FROM gsis_roster_mirror_generations WHERE id=?').bind(id)]));
  if(!rs[0].meta?.changes)fail('ROSTER_MIRROR_LEASE','A newer backup step superseded this acknowledgement.');return generation(rs.at(-1).results[0]);
 }
 async function releaseLease(db,id,leaseToken){
  await ensure(db);const result=await connection(db).prepare("UPDATE gsis_roster_mirror_generations SET lease_token='',lease_until=0 WHERE id=? AND state='captured' AND lease_token=?").bind(id,leaseToken).run();checked([result]);return {released:!!result.meta?.changes};
 }
 async function cleanup(db,limit=1000){
  await ensure(db);if(!Number.isSafeInteger(limit)||limit<1||limit>1000)fail('ROSTER_MIRROR_LIMIT','Choose a cleanup limit from1 to1000.',400);
  // Proof metadata remains. Only obsolete staging bytes may be retired, and
  // two verified generations plus every active capture stay intact.
  const eligible="SELECT id FROM gsis_roster_mirror_generations WHERE (state='mirrored' AND id NOT IN (SELECT id FROM gsis_roster_mirror_generations WHERE state='mirrored' ORDER BY mirrored_at DESC,rowid DESC LIMIT 2)) OR (state='superseded' AND rowid<(SELECT MAX(rowid) FROM gsis_roster_mirror_generations WHERE state='mirrored'))";
  const c=connection(db),rows=checked(await c.batch([c.prepare('DELETE FROM gsis_roster_mirror_items WHERE rowid IN (SELECT rowid FROM gsis_roster_mirror_items WHERE generation_id IN ('+eligible+') ORDER BY rowid LIMIT ?)').bind(limit),c.prepare('DELETE FROM gsis_roster_mirror_pages WHERE rowid IN (SELECT rowid FROM gsis_roster_mirror_pages WHERE generation_id IN ('+eligible+') ORDER BY rowid LIMIT MAX(0,?-changes()))').bind(limit)]));
  return {itemsRemoved:rows[0].meta?.changes||0,pageReceiptsRemoved:rows[1].meta?.changes||0};
 }
 async function acknowledge(db,id,input){
  await ensure(db);const g=await readGeneration(db,id),s=await state(db);
  if(g?.state==='mirrored'&&g.manifestDigest===input.manifestDigest&&g.snapshotDigest===input.snapshotDigest)return g;
  lease(g,input.leaseToken);if(g.cursor!==g.totalCount||g.epoch!==s.control.epoch||input.verified!==true||input.generationId!==id||input.epoch!==g.epoch||input.revisions?.roster!==g.revisions.roster||input.revisions?.register!==g.revisions.register||input.transportRevision!==g.transportRevision||input.snapshotDigest!==g.snapshotDigest||!validHash(input.manifestDigest))fail('ROSTER_MIRROR_PROOF','The complete Google backup proof does not match this generation.');
  const storedProof={verified:true,generationId:id,epoch:g.epoch,revisions:g.revisions,transportRevision:g.transportRevision,snapshotDigest:g.snapshotDigest,manifestDigest:input.manifestDigest,...(input.manifestFileId?{manifestFileId:input.manifestFileId}:{}),...(Number.isSafeInteger(input.largestPart)?{largestPart:input.largestPart}:{})};
  const c=connection(db),now=Date.now(),rs=checked(await c.batch([c.prepare("UPDATE gsis_roster_mirror_generations SET state='mirrored',manifest_digest=?,proof_json=?,mirrored_at=?,lease_token='',lease_until=0 WHERE id=? AND state='captured' AND cursor=record_count+receipt_count+transport_count AND lease_token=? AND lease_until>? AND epoch=(SELECT epoch FROM gsis_roster_mirror_control WHERE id=1)").bind(input.manifestDigest,JSON.stringify(storedProof),now,id,input.leaseToken,now),c.prepare("UPDATE gsis_roster_mirror_outbox SET generation_id=? WHERE generation_id IS NULL AND ((scope='roster' AND revision<=?) OR (scope='roster-register' AND revision<=?) OR (scope='roster-transport' AND revision<=?)) AND EXISTS(SELECT 1 FROM gsis_roster_mirror_generations WHERE id=? AND state='mirrored')").bind(id,g.revisions.roster,g.revisions.register,g.transportRevision,id),c.prepare('SELECT * FROM gsis_roster_mirror_generations WHERE id=?').bind(id)]));if(rs.at(-1).results[0]?.state!=='mirrored')fail('ROSTER_MIRROR_LEASE','The backup proof was superseded.');const saved=generation(rs.at(-1).results[0]);try{saved.cleanup=await cleanup(db);}catch{saved.cleanupPending=true;}return saved;
 }
 async function beginRelease(db,requestId){
  await ensure(db);request(requestId);const c=connection(db),s=await state(db);if(s.control.release_request===requestId&&s.control.phase!=='normal')return status(db);if(s.control.phase!=='normal'||!s.enabled)fail('ROSTER_RELEASE_STATE','Release requires both active D1 scopes and no other release.');
  const rs=checked(await c.batch([c.prepare("UPDATE gsis_roster_mirror_control SET phase='quiescing',epoch=epoch+1,release_request=?,updated_at=? WHERE id=1 AND phase='normal' AND epoch=?").bind(requestId,Date.now(),s.control.epoch),c.prepare("UPDATE gsis_roster_mirror_generations SET state='superseded',lease_token='',lease_until=0 WHERE state='captured' AND epoch<(SELECT epoch FROM gsis_roster_mirror_control WHERE id=1)")]));if(!rs[0].meta?.changes)fail('ROSTER_RELEASE_STATE','Another release started.');return status(db);
 }
 async function cancelRelease(db,requestId){
  await ensure(db);request(requestId);const c=connection(db),s=await state(db);if(s.control.phase==='normal')return {...await status(db),cancelled:true};
  if(s.control.phase!=='quiescing'||s.control.release_request!==requestId)fail('ROSTER_RELEASE_STATE','Only an unsealed release can be cancelled.');
  const rs=checked(await c.batch([c.prepare("UPDATE gsis_roster_mirror_control SET phase='normal',epoch=epoch+1,release_request='',updated_at=? WHERE id=1 AND phase='quiescing' AND release_request=?").bind(Date.now(),requestId),c.prepare("UPDATE gsis_roster_mirror_generations SET state='superseded',lease_token='',lease_until=0 WHERE state='captured' AND epoch<(SELECT epoch FROM gsis_roster_mirror_control WHERE id=1)")]));
  if(!rs[0].meta?.changes)fail('ROSTER_RELEASE_STATE','The release was sealed before cancellation.');return {...await status(db),cancelled:true};
 }
 const inFlightSQL="SELECT COUNT(*) n FROM gsis_edge_records WHERE scope='roster' AND record_id<>'$' AND ((collection IN ('outbox','inboxMessages','inboxAlerts','peerMail','dailyEmploymentMail') AND json_extract(value_json,'$.status') IN ('claimed','sending')) OR (collection IN ('notificationTransport','edgeAllocatorRuns') AND (json_extract(value_json,'$.state') IN ('running','committing') OR json_extract(value_json,'$.status') IN ('claimed','sending'))))";
 async function sealRelease(db,requestId){
  await ensure(db);request(requestId);const c=connection(db),s=await state(db);if(s.control.release_request!==requestId)fail('ROSTER_RELEASE_STATE','The release identity changed.');if(['paused','released'].includes(s.control.phase))return status(db);if(s.control.phase!=='quiescing')fail('ROSTER_RELEASE_STATE','Quiesce before pausing D1 writes.');
  const transport=!!await c.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='gsis_absence_transport'").first(),guard=`(SELECT n FROM (${inFlightSQL}))=0${transport?" AND NOT EXISTS(SELECT 1 FROM gsis_absence_transport WHERE state='claimed')":''}`;
  const rs=checked(await c.batch([c.prepare(`UPDATE gsis_roster_mirror_control SET phase='paused',updated_at=? WHERE id=1 AND release_request=? AND phase='quiescing' AND ${guard}`).bind(Date.now(),requestId),c.prepare(`UPDATE gsis_edge_heads SET mode='paused',revision=revision+1,updated_at=? WHERE scope IN ${SCOPES} AND mode='active' AND EXISTS(SELECT 1 FROM gsis_roster_mirror_control WHERE id=1 AND phase='paused' AND release_request=?)`).bind(Date.now(),requestId)]));if(!rs[0].meta?.changes)fail('ROSTER_RELEASE_INFLIGHT','Wait for in-flight operations to settle before release.');return status(db);
 }
 async function finishRelease(db,requestId,proof){
  await ensure(db);request(requestId);const c=connection(db),s=await state(db);if(s.control.release_request===requestId&&s.control.phase==='released')return status(db);
  const g=await readGeneration(db,proof?.generationId);if(s.control.phase!=='paused'||s.control.release_request!==requestId||!g||g.state!=='mirrored'||g.epoch!==s.control.epoch||g.revisions.roster!==s.revisions.roster||g.revisions.register!==s.revisions.register||g.transportRevision!==s.control.transport_revision||g.manifestDigest!==proof.manifestDigest)fail('ROSTER_RELEASE_LAG','The final Google backup has not caught up with paused D1.');
  const result=await c.prepare("UPDATE gsis_roster_mirror_control SET phase='released',updated_at=? WHERE id=1 AND phase='paused' AND release_request=? AND epoch=? AND transport_revision=? AND EXISTS(SELECT 1 FROM gsis_edge_heads WHERE scope='roster' AND mode='paused' AND revision=?) AND EXISTS(SELECT 1 FROM gsis_edge_heads WHERE scope='roster-register' AND mode='paused' AND revision=?)").bind(Date.now(),requestId,g.epoch,g.transportRevision,g.revisions.roster,g.revisions.register).run();checked([result]);if(!result.meta?.changes)fail('ROSTER_RELEASE_LAG','D1 changed before release could be confirmed.');return status(db);
 }
 return {ensure,status,capture,page,advance,releaseLease,cleanup,acknowledge,beginRelease,cancelRelease,sealRelease,finishRelease,hash,seed,writeGate:Store?.rosterWriteGuard,MAX_PAGE_BYTES};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSiSRosterMirror;
