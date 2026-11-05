import {GSiSEdgeStore as Store,GSiSRosterImport as Import} from './edge-store.js';
import {GSISRosterOperations as Operations} from './edge-roster-domain.js';
import {sha256Hex} from './edge-deploy-sha256.js';
import {BACKUP_FORMAT,base64,unbase64,boundedText,gzip,sanitizeBackup,validateBackupPayload} from './edge-roster-backup.js';

const fail=(code,message)=>{throw Object.assign(Error(message),{code,status:409});};
const key=row=>JSON.stringify([row.scope,row.collection,row.record_id]);
const bytes=text=>new TextEncoder().encode(text).length;
export async function readBackupChain({manifestFileId,config,bridge}){
 const manifests=[],seen=new Set();let id=manifestFileId,total=0;
 for(let n=0;id&&n<72;n++){
  if(seen.has(id))fail('BACKUP_CHAIN','The backup manifest chain contains a cycle.');seen.add(id);
  const file=await bridge({operation:'edgeDriveOutput',step:'readBackup',config,fileId:id}),raw=file.text,expected=/-([a-f0-9]{64})\.manifest\.json$/.exec(file.name||'')?.[1];
  if(typeof raw!=='string'||bytes(raw)>1048576||!expected||sha256Hex(raw)!==expected)fail('BACKUP_DIGEST','The backup manifest digest failed verification.');
  const manifest=JSON.parse(raw);if(manifest.schema!==BACKUP_FORMAT||!['full','increment'].includes(manifest.kind)||!Array.isArray(manifest.files)||manifest.files.length!==(manifest.kind==='full'?2:1)||manifest.files.some((f,i)=>f.tier!==i+1))fail('BACKUP_MANIFEST','Invalid backup manifest.');
  manifests.push({...manifest,fileId:id,digest:expected});if(manifest.kind==='full')break;id=manifest.previousManifestId;
 }
 if(manifests.at(-1)?.kind!=='full')fail('BACKUP_CHAIN','A verified full backup is required before its increments.');
 manifests.reverse();const records=new Map(),objects=new Map();let previous;
 for(const manifest of manifests){
  if(previous&&(['roster','register'].some(s=>manifest.fromRevisions?.[s]!==previous.revisions?.[s]||manifest.revisions[s]<manifest.fromRevisions[s])||manifest.previousManifestId!==previous.fileId))fail('BACKUP_CHAIN','The revision chain has a gap.');
  for(const descriptor of manifest.files){
   const file=await bridge({operation:'edgeDriveOutput',step:'readBackup',config,fileId:descriptor.fileId}),compressed=unbase64(file.data),raw=await boundedText(compressed);total+=bytes(raw);
   if(total>128*1024*1024)fail('BACKUP_SIZE','This restore exceeds the 128 MiB chain limit.');
   if(compressed.length!==descriptor.bytesCompressed||bytes(raw)!==descriptor.bytesRaw||sha256Hex(raw)!==descriptor.digest)fail('BACKUP_DIGEST','A backup tier failed its digest or byte-count check.');
   const payload=validateBackupPayload(JSON.parse(raw));
   if(payload.runId!==manifest.runId||payload.kind!==manifest.kind||payload.tier!==descriptor.tier||Store.canonicalJson(payload.revisions)!==Store.canonicalJson(manifest.revisions)||Store.canonicalJson(payload.fromRevisions)!==Store.canonicalJson(manifest.fromRevisions)||payload.rows.length!==descriptor.records||Store.canonicalJson(payload.counts)!==Store.canonicalJson(descriptor.counts))fail('BACKUP_MANIFEST','A backup tier does not match its manifest.');
   // Treat Drive as an untrusted input too: restore cannot reintroduce tokens.
   for(const row of payload.rows)if(JSON.stringify(await sanitizeBackup(JSON.parse(row.value_json)))!==row.value_json)fail('BACKUP_PRIVACY','The backup contains a forbidden private capability.');
   if(payload.replaceCache===true)for(const [id,row] of records)if(row.scope==='cache')records.delete(id);
   for(const row of payload.deleted)records.delete(key(row));
   for(const row of payload.rows)records.set(key(row),row);
   for(const object of payload.objects)objects.set(object.key,object);
  }
  previous=manifest;
 }
 const decode=scope=>{const rows=[...records.values()].filter(row=>row.scope===scope);return Store.decode([{collection:'$root',record_id:'$',position:0,record_date:'',value_json:JSON.stringify({keys:[...new Set(rows.map(r=>r.collection))]})},...rows]);};
 const state=decode('roster'),index=decode('roster-register');if(state?.schema!==1||!Array.isArray(index?.entries))fail('BACKUP_SCHEMA','The restored Roster and timetable register are incomplete.');
 // Verify all immutable references before the target can receive a single row.
 const required=new Set(),visit=value=>{if(typeof value==='string'&&/^[\s]*[\[{]/.test(value)){let parsed;try{parsed=JSON.parse(value);}catch{}if(parsed)visit(parsed);return;}if(!value||typeof value!=='object')return;if(value.encoding==='gzip-json-v1'&&value.key){const object=objects.get(value.key);if(!object||object.digest!==value.digest)fail('BACKUP_OBJECT','A referenced restore object is missing.');if(!required.has(value.key)){required.add(value.key);visit(JSON.parse(object.json));}}for(const child of Object.values(value))visit(child);};
 visit(state);visit(index);for(const row of records.values())if(row.scope==='evidence')visit(JSON.parse(row.value_json));
 for(const key of objects.keys())if(!required.has(key))objects.delete(key);

 return {state,index,objects:[...objects.values()],evidence:[...records.values()].filter(r=>['evidence','cache'].includes(r.scope)),manifests,sourceDigest:sha256Hex(JSON.stringify(manifests.map(m=>[m.fileId,m.digest])))};
}
export async function restoreBackupChain({sourceDb,targetDb,targetBucket,chain,actor,requestId,maxSteps=40}){
 if(!targetDb?.prepare||targetDb===sourceDb)fail('BACKUP_RESTORE_TARGET','Use a separate empty D1 target, never the production source.');
 const sourceIdentity=await sourceDb.prepare('SELECT identity FROM gsis_backup_identity WHERE id=1').first();
 if(await targetDb.prepare("SELECT 1 present FROM sqlite_master WHERE type='table' AND name='gsis_backup_identity'").first()){
  const identity=await targetDb.prepare('SELECT identity FROM gsis_backup_identity WHERE id=1').first();if(identity?.identity===sourceIdentity?.identity)fail('BACKUP_RESTORE_TARGET','The target is the production source database.');
 }
 const sessionId=sha256Hex(JSON.stringify(['drive-restore',actor,requestId,chain.sourceDigest])),binding={actor,requestId,sessionId};
 await Import.ensure(targetDb);
 const heads=(await targetDb.prepare('SELECT scope,mode,metadata_json FROM gsis_edge_heads').all()).results,existing=await targetDb.prepare('SELECT COUNT(*) n FROM gsis_edge_records').first();
 const replayed=heads.length===2&&heads.every(h=>h.mode==='imported'&&JSON.parse(h.metadata_json).importSession===sessionId);
 if((existing.n||heads.some(h=>h.mode!=='legacy'))&&!replayed)fail('BACKUP_RESTORE_TARGET','Restore requires empty D1 scopes. Existing or active records are never overwritten.');
 // Delivery rows remain evidence. Nonterminal sends are archived on the target,
 // so activation never replays an old WhatsApp/email attempt or uncertainty.
 const restoredState=Operations.validateState({...Operations.initial(),...structuredClone(chain.state),receipts:[]});chain={...chain,index:{...chain.index,receipts:[]}};for(const collection of ['outbox','peerMail','dailyEmploymentMail'])for(const row of restoredState[collection]||[])if(!['sent','cancelled','superseded','expired','archived'].includes(row.status)){row.restoreOriginalStatus=row.status||'';row.status='archived';row.restoreSourceDigest=chain.sourceDigest;}
 for(const row of restoredState.inboxMessages||[])if(row.direction==='outbound'&&['queued','sending','uncertain','blocked'].includes(row.status)){row.restoreOriginalStatus=row.status;row.status='archived';}
 for(const row of restoredState.requests||[])if(row.status==='pending'){row.restoreOriginalStatus=row.status;row.status='expired';row.restoreSourceDigest=chain.sourceDigest;}
 const parts=[],metadata=[];let offset=0;
 const add=(kind,body,scope='',records=0)=>{const raw=JSON.stringify(body),id='part-'+String(parts.length).padStart(5,'0');metadata.push({id,kind,scope,records,offset,bytes:bytes(raw),digest:sha256Hex(raw)});parts.push(raw);offset+=bytes(raw);return id;};
 for(const object of chain.objects){
  const kind=/^gsis\/roster\/(baseline|stapler|audit)\//.exec(object.key)?.[1];if(!kind)fail('BACKUP_OBJECT','Unsupported restore object kind.');
  const compressed=await gzip(object.json),segments=[];for(let at=0;at<compressed.length;at+=196608)segments.push(add('segment',{base64:base64(compressed.subarray(at,at+196608))}));
  add('object',{reference:{key:object.key,digest:object.digest,encoding:'gzip-json-v1'},kind,gzipBytes:compressed.length,segments});
 }
 const prepared=Import.prepareStoredRecords(restoredState,chain.index,{ordinal:parts.length,offset},{hash:sha256Hex,base64:values=>base64(Uint8Array.from(values,x=>x&255))});parts.push(...prepared.parts);metadata.push(...prepared.partMetadata);
 const {manifest,manifestDigest}=Import.finishFreeze({sourceDigest:chain.sourceDigest,...(chain.state.freshStart?{freshStart:chain.state.freshStart}:{}),backupRestore:{sourceDigest:chain.sourceDigest,manifestFileId:chain.manifests.at(-1).fileId,verified:false}},binding,metadata,prepared.scopes,{hash:sha256Hex}),store=Import.open(targetDb,binding);
 await store.reserve();await store.bind(manifest,manifestDigest);
 let steps=0;const pending=phase=>({pending:true,verified:false,phase,sessionId,sourceDigest:chain.sourceDigest,activationRequired:true});
 const receipts=new Set((await targetDb.prepare('SELECT part_id FROM gsis_roster_import_parts WHERE session_id=? AND receipt_json IS NOT NULL').bind(sessionId).all()).results.map(r=>r.part_id));
 for(let i=0;i<parts.length;i++){
  if(receipts.has(metadata[i].id))continue;if(steps++>=maxSteps)return pending('staging');
  const body=JSON.parse(parts[i]),receipt=metadata[i].kind==='records'?undefined:await Import.stageObject(targetBucket,store,sessionId,metadata[i],body);await store.stage(metadata[i].id,parts[i],receipt);
 }
 if(!replayed)await store.referencesReady();const result=await store.finalize();
 for(const [scope,expected] of [['roster',restoredState],['roster-register',chain.index]]){const loaded=await Store.open(targetDb,scope).load();if(loaded.mode!=='imported'||await Store.digest(loaded.state)!==await Store.digest(expected))fail('BACKUP_RESTORE_VERIFY','Restored D1 records failed readback verification.');}
 // Keep operational evidence which lives outside the two import scopes. This
 // table is included in later full backups; source records remain untouched.
 await targetDb.prepare('CREATE TABLE IF NOT EXISTS gsis_backup_restored_evidence(id TEXT PRIMARY KEY,collection TEXT NOT NULL,value_json TEXT NOT NULL,source_digest TEXT NOT NULL)').run();
 const savedEvidence=new Map((await targetDb.prepare('SELECT id,source_digest FROM gsis_backup_restored_evidence').all()).results.map(r=>[r.id,r.source_digest]));
 for(const row of chain.evidence){if(savedEvidence.get(key(row))===chain.sourceDigest)continue;if(steps++>=maxSteps)return pending('evidence');let value=row.value_json;
  if(bytes(value)>262144){if(!targetBucket?.put||!targetBucket?.get)fail('BACKUP_RESTORE_TARGET','Bind a separate restore R2 bucket for large evidence.');const digest=sha256Hex(value),path='gsis/roster/audit/backup-evidence/'+digest+'.json.gz';await targetBucket.put(path,await gzip(value),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/gzip'}});const stored=await targetBucket.get(path);if(!stored||sha256Hex(await boundedText(await stored.arrayBuffer()))!==digest)fail('BACKUP_RESTORE_VERIFY','Retained evidence failed R2 readback.');value=JSON.stringify({encoding:'gzip-json-v1',key:path,digest});}
  await targetDb.prepare('INSERT OR IGNORE INTO gsis_backup_restored_evidence VALUES(?,?,?,?)').bind(key(row),row.collection,value,chain.sourceDigest).run();const saved=await targetDb.prepare('SELECT value_json,source_digest FROM gsis_backup_restored_evidence WHERE id=?').bind(key(row)).first();if(saved?.value_json!==value||saved?.source_digest!==chain.sourceDigest)fail('BACKUP_RESTORE_VERIFY','Restored evidence did not match its backup.');
 }
 await targetDb.prepare('CREATE TABLE IF NOT EXISTS gsis_backup_restore_checks(session_id TEXT NOT NULL,object_key TEXT NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(session_id,object_key))').run();
 const verifiedObjects=new Map((await targetDb.prepare('SELECT object_key,digest FROM gsis_backup_restore_checks WHERE session_id=?').bind(sessionId).all()).results.map(r=>[r.object_key,r.digest]));
 for(const object of chain.objects){if(verifiedObjects.get(object.key)===object.digest)continue;if(steps++>=maxSteps)return pending('object-verification');const saved=await targetBucket.get(object.key);if(!saved||sha256Hex(await boundedText(await saved.arrayBuffer()))!==object.digest)fail('BACKUP_RESTORE_VERIFY','A restored timetable object failed readback.');await targetDb.prepare('INSERT OR REPLACE INTO gsis_backup_restore_checks VALUES(?,?,?)').bind(sessionId,object.key,object.digest).run();}
 await targetDb.prepare("UPDATE gsis_edge_heads SET metadata_json=json_set(metadata_json,'$.backupRestore.verified',json('true')) WHERE scope IN ('roster','roster-register') AND mode='imported' AND json_extract(metadata_json,'$.importSession')=?").bind(sessionId).run();
 return {...result,replayed,verified:true,sourceDigest:chain.sourceDigest,records:prepared.scopes.roster.records+prepared.scopes['roster-register'].records,activationRequired:true};
}
