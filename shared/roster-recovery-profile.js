// v0.9.8 restores the existing Google Roster authority at the deployed entry
// points. This is a release profile, not another dashboard switch to configure.
// Keep transport receipts, queues, secrets and explicit pause/send controls.
// Never remove an Apps Script migration fence or modify persisted D1 authority.
export function rosterRecoveryEnvironment(env){
 return {...env,
  GSIS_BACKEND:undefined,
  GSIS_BACKEND_REQUIRED:'false',
  ROSTER_EDGE_AUTHORITY:'legacy',
  DEPLOY_EDGE_AUTHORITY:'legacy',
  GSIS_BACKGROUND_JOBS:'false'
 };
}

// A stale dashboard flag alone never selects D1. Read existing primary metadata
// without creating tables, and admit only a completed, source-bound cutover.
// Paused heads retain this route so backup/release retries remain reachable.
export async function resolveRosterAuthorityEnvironment(env){
 const recovery=rosterRecoveryEnvironment(env);
 if(env.ROSTER_EDGE_AUTHORITY!=='d1'||!env.GSIS_JOBS?.prepare)return recovery;
 const unavailable=()=>Object.assign(Error('Verified Roster ownership is unavailable. Retry without changing authority settings.'),{status:503,code:'ROSTER_AUTHORITY_UNVERIFIED'});
 let rows;
 try{
  const db=env.GSIS_JOBS.withSession?.('first-primary')||env.GSIS_JOBS;
  const result=await db.prepare(`SELECT h.scope,h.mode,h.source_digest,h.imported_records,h.metadata_json,
   EXISTS(SELECT 1 FROM gsis_edge_records r WHERE r.scope=h.scope AND r.collection='$root' AND r.record_id='$') has_state,
   EXISTS(SELECT 1 FROM gsis_edge_transitions t WHERE t.scope=h.scope AND t.previous_mode='imported' AND t.next_mode='active'
    AND CASE WHEN json_valid(t.proof_json) THEN json_extract(t.proof_json,'$.legacyWritesDisabled')=1
     AND json_extract(t.proof_json,'$.sourceDigest')=h.source_digest
     AND json_extract(t.proof_json,'$.verifiedRecords')=h.imported_records ELSE 0 END) activation_proved
   FROM gsis_edge_heads h WHERE h.scope IN ('roster','roster-register')`).all();
  if(result?.success===false)throw Error(result.error||'D1 ownership read failed');
  if(!Array.isArray(result?.results))throw unavailable();rows=result.results;
 }catch(error){
  if(/no such table:\s*(?:main\.)?(?:gsis_edge_heads|gsis_edge_records|gsis_edge_transitions)\b/i.test(String(error?.message||'')))return recovery;
  throw unavailable();
 }
 if(!rows.length||rows.every(row=>['legacy','imported'].includes(row.mode)))return recovery;
 const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 if(rows.length!==2||new Set(rows.map(row=>row.scope)).size!==2||rows.some(row=>!['active','paused'].includes(row.mode)||row.has_state!==1||row.activation_proved!==1||!hash(row.source_digest)||!Number.isSafeInteger(row.imported_records)||row.imported_records<1))throw unavailable();
 let metadata;try{metadata=rows.map(row=>JSON.parse(row.metadata_json));}catch{throw unavailable();}
 const first=metadata[0];
 if(!hash(first?.source?.sourceDigest)||!hash(first?.source?.manifestDigest)||!hash(first?.importSession)||metadata.some(value=>value?.source?.sourceDigest!==first.source.sourceDigest||value?.source?.manifestDigest!==first.source.manifestDigest||value?.importSession!==first.importSession))throw unavailable();
 return {...recovery,ROSTER_EDGE_AUTHORITY:'d1'};
}
