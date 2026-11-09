import Q from '../shared/edge-command-queue.js';
export class ProjectionCache {
 constructor(store,secret){this.store=store;this.secret=secret;}
 async put(envelope,data,grant,highWater){
  Q.safePayload(data);const now=this.store.clock(),m=await Q.verify(envelope,this.secret,'edge-command-google-projection-v1',now),text=Q.canonical(data);
  if(m.app!==this.store.app||m.document!=='workbook'||m.schemaVersion!==1||m.projection!=='snapshot'||m.audienceKey!==grant.actorSubject||m.authRevision!==grant.authRevision||!Number.isSafeInteger(m.generation)||m.observedAt>now+60000||now-m.observedAt>300000||m.manualEditProof!==true||m.payloadDigest!==await Q.digest(data)||m.sourceDigest!==m.payloadDigest)Q.fail(409,'QUEUE_CACHE_PROOF');
  if(Q.bytes(text)>Q.LIMITS.cacheEntry)Q.fail(413,'QUEUE_CACHE_SIZE');
  const s=this.store;
  const out=await s.db.batch([
   s.sql('DELETE FROM edge_cache WHERE app=? AND expires_at<=?',s.app,now),
   s.sql(`INSERT INTO edge_cache(app,document_key,projection,audience_key,auth_revision,schema_version,google_revision_json,source_digest,payload_digest,manifest_json,payload_json,fetched_at,verified_at,expires_at,high_water,generation)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM edge_scopes WHERE app=? AND document_key=? AND high_water=?)
    AND COALESCE((SELECT SUM(length(CAST(payload_json AS BLOB))) FROM edge_cache WHERE app=?),0)+?<=?
    ON CONFLICT(app,document_key,projection,audience_key,auth_revision,schema_version) DO UPDATE SET google_revision_json=excluded.google_revision_json,source_digest=excluded.source_digest,payload_digest=excluded.payload_digest,manifest_json=excluded.manifest_json,payload_json=excluded.payload_json,fetched_at=excluded.fetched_at,verified_at=excluded.verified_at,expires_at=excluded.expires_at,high_water=excluded.high_water,stale=0,generation=excluded.generation
    WHERE excluded.generation>edge_cache.generation AND excluded.fetched_at>=edge_cache.fetched_at RETURNING generation`,s.app,m.document,m.projection,m.audienceKey,m.authRevision,1,Q.canonical(m.googleRevision),m.sourceDigest,m.payloadDigest,Q.canonical(envelope),text,now,m.observedAt,m.observedAt+300000,highWater,m.generation,s.app,m.document,highWater,s.app,Q.bytes(text),Q.LIMITS.cacheTotal)
  ]);return !!out[1].results?.length;
 }
 async read(grant,currentManifest){
  const s=this.store,now=s.clock(),scope=await s.scope(),row=await s.first('SELECT * FROM edge_cache WHERE app=? AND document_key=? AND projection=? AND audience_key=? AND auth_revision=? AND schema_version=1',s.app,'workbook','snapshot',grant.actorSubject,grant.authRevision);
  if(!row)return {mode:'direct',reason:'CACHE_MISSING'};
  const stale=reason=>({mode:'stale-read-only',reason,asOf:row.verified_at,googleRevision:JSON.parse(row.google_revision_json),data:JSON.parse(row.payload_json)});
  if(row.stale||row.high_water<(scope?.high_water||0))return {mode:'direct',reason:'CACHE_INVALIDATED'};
  let historical,data;
  try{const signed=JSON.parse(row.manifest_json),at=Q.parse(signed.payload).timestamp;historical=await Q.verify(signed,this.secret,'edge-command-google-projection-v1',at);data=JSON.parse(row.payload_json);if(historical.app!==s.app||historical.document!==s.document||historical.schemaVersion!==1||historical.projection!=='snapshot'||historical.generation!==row.generation||historical.observedAt!==row.verified_at||Q.canonical(historical.googleRevision)!==row.google_revision_json||historical.audienceKey!==grant.actorSubject||historical.authRevision!==grant.authRevision||historical.payloadDigest!==row.payload_digest||historical.sourceDigest!==row.source_digest||await Q.digest(data)!==row.payload_digest)throw Error();}catch{return {mode:'direct',reason:'CACHE_UNVERIFIABLE'};}
  if(Math.min(row.expires_at,historical.observedAt+300000)<=now)return stale('CACHE_EXPIRED');
  // Out-of-band Sheet edits have no revision counter. Require a fresh Google
  // content observation before a private projection can serve from this cache.
  if(!currentManifest)return {mode:'direct',reason:'GOOGLE_CONTENT_OBSERVATION_REQUIRED'};
  let proof;
  try{proof=await Q.verify(currentManifest,this.secret,'edge-command-google-projection-v1',now);data=JSON.parse(row.payload_json);}catch{return {mode:'direct',reason:'CACHE_UNVERIFIABLE'};}
  if(proof.audienceKey!==grant.actorSubject||proof.authRevision!==grant.authRevision||proof.app!==s.app||proof.document!=='workbook'||proof.schemaVersion!==1||proof.projection!=='snapshot'||proof.manualEditProof!==true||now-proof.observedAt>60000||proof.payloadDigest!==row.payload_digest||proof.sourceDigest!==row.source_digest||await Q.digest(data)!==row.payload_digest||Q.canonical(proof.googleRevision)!==row.google_revision_json)return {mode:'direct',reason:'CACHE_CHANGED'};
  return {mode:'verified',asOf:row.verified_at,googleRevision:JSON.parse(row.google_revision_json),data};
 }
}
