/** Manual, bounded cleanup of disposable scratch only. Evidence is never a
 * generic prune candidate. D1 confirmation and R2 completion are separate. */
import {requireValue, identifier} from './errors.mjs';
import {query, one, canonical, digest, prepareOperation, commitOperation} from './store.mjs';
import {admit, resolveAdmission} from './security.mjs';

const scratch = {calendar:'calendar_previews',layout:'layout_previews'};
const max = 100;
function cursor(value) {
  requireValue(value == null || typeof value==='string' && value.length<=4096,'STORAGE_CURSOR_INVALID',400);
  return value || undefined;
}
const inScope=(key,school,owner)=>key.startsWith(`backups/${school}/`)||key.startsWith(`${school}/`)||key.startsWith(`${owner}/${school}/`);
export async function storageInventory(ctx) {
  const {env,principal,body,now}=ctx,school=principal.schoolId;
  // Workers D1 rejects page_count/page_size PRAGMAs. Use supported result metadata;
  // do not invent a free-page estimate when the runtime does not expose one.
  const probe=await env.DB.prepare('SELECT 1 AS reachable').all();
  const allocatedBytes=Number.isSafeInteger(probe.meta?.size_after)?probe.meta.size_after:null;
  const list=await env.ARTIFACTS.list({limit:max,cursor:cursor(body.cursor)});
  const objects=list.objects.filter(o=>inScope(o.key,school,env.SERVICE_NAME));
  const groups={backups:{objects:0,bytes:0},artifacts:{objects:0,bytes:0}};
  for(const o of objects){const g=groups[o.key.startsWith('backups/')?'backups':'artifacts'];g.objects++;g.bytes+=o.size;}
  const table=scratch[env.SERVICE_NAME],expired=table?await one(env.DB,`SELECT COUNT(*) n FROM (SELECT 1 FROM ${table} WHERE school_id=? AND expires_at<=? LIMIT 1001)`,[school,now]):null;
  return {owner:env.SERVICE_NAME,observedAt:now,
    d1:{allocatedBytes,reusablePageBytes:null,expiredPreviews:expired?.n??0,expiredPreviewsAtLeast:expired?.n===1001,canPrunePreviews:!!table},
    r2:{page:groups,nextCursor:list.truncated?list.cursor:null,scope:'This listing page only; not an account billing total.',unscopedObjects:list.objects.length-objects.length},
    cleanups:await query(env.DB,'SELECT cleanup_id AS cleanupId,state,created_at AS createdAt,completed_at AS completedAt FROM storage_cleanup WHERE school_id=? ORDER BY created_at DESC LIMIT 50',[school]),
    automaticDeletion:false,note:'Deleted D1 rows create reusable space; allocated file bytes need not shrink. Valid backups, authority evidence, receipts, fencing history and operational artifacts are protected.'};
}
async function backupManifest(ctx,backupId) {
  identifier(backupId,'backupId');
  const school=ctx.principal.schoolId,prefix=`backups/${school}/${backupId}/`;
  const receipt=await one(ctx.env.DB,"SELECT receipt_json FROM product_operations WHERE school_id=? AND operation_id=? AND action='system.backup' AND state='committed'",[school,backupId]);
  requireValue(receipt,'BACKUP_NOT_CONFIRMED',409);
  const key=prefix+'manifest.json',object=await ctx.env.ARTIFACTS.get(key);
  requireValue(object && object.size<=2097152,'BACKUP_MANIFEST_UNAVAILABLE',409);
  const text=await object.text(),m=JSON.parse(text);
  requireValue(m.schoolId===school&&m.owner===ctx.env.SERVICE_NAME&&m.backupId===backupId&&m.state==='verified-owner-snapshot'&&Array.isArray(m.objects)&&m.data?.key,'BACKUP_SCOPE_MISMATCH',409);
  const protectedKeys=new Set([key,m.data.key,...m.objects.map(o=>o.backupKey)]);
  return {prefix,manifestDigest:await digest(text),protectedKeys};
}
function orphanKey(key,prefix) {
  if(!key.startsWith(prefix))return false;
  return /^(database-[a-f0-9]{64}\.json|objects\/[a-f0-9]{64}\/.+)$/.test(key.slice(prefix.length));
}
export async function storagePreview(ctx) {
  const {env,body,principal,now}=ctx,school=principal.schoolId;
  const cutoff=body.cutoff??now;
  requireValue(Number.isSafeInteger(cutoff)&&cutoff<=now&&now-cutoff<=300000,'PRUNE_PREVIEW_EXPIRED',409);
  let selection=[],manifestDigest=null,nextCursor=null;
  if(body.kind==='expired-previews') {
    const table=scratch[env.SERVICE_NAME];requireValue(table,'PRUNE_KIND_UNAVAILABLE',400);
    selection=await query(env.DB,`SELECT preview_id AS id,expires_at AS expiresAt FROM ${table} WHERE school_id=? AND expires_at<=? ORDER BY expires_at,preview_id LIMIT ${max}`,[school,cutoff]);
  } else {
    requireValue(body.kind==='backup-orphans','PRUNE_KIND_UNAVAILABLE',400);
    const manifest=await backupManifest(ctx,body.backupId);manifestDigest=manifest.manifestDigest;
    const list=await env.ARTIFACTS.list({prefix:manifest.prefix,limit:max,cursor:cursor(body.cursor)});
    selection=list.objects.filter(o=>orphanKey(o.key,manifest.prefix)&&!manifest.protectedKeys.has(o.key)).map(o=>({key:o.key,etag:o.etag,size:o.size}));
    nextCursor=list.truncated?list.cursor:null;
  }
  const plan={schemaVersion:1,owner:env.SERVICE_NAME,schoolId:school,kind:body.kind,cutoff,backupId:body.backupId||null,cursor:body.cursor||null,manifestDigest,selection};
  return {...plan,previewDigest:await digest(plan),nextCursor,confirmation:`PRUNE ${selection.length} ${env.SERVICE_NAME} SCRATCH ITEMS`,protected:'No valid backup, operational record, audit, authority snapshot or receipt is selected.'};
}
async function mutate(ctx,action,make) {
  const {env,principal,body,now}=ctx;
  const op=await prepareOperation(env.DB,{schoolId:principal.schoolId,actorId:principal.actorId,operationId:identifier(body.operationId),action,intent:body,now,validUntil:principal.validUntil,authorization:principal});
  if(op.receipt)return op.receipt;
  const admission=await admit(env,env.DB,op,principal,[],now);
  const change=await make(op);
  const receipt=await commitOperation(env.DB,op,{now:Date.now(),validUntil:principal.validUntil,...change,admission});
  await resolveAdmission(env,env.DB,op,admission,receipt,Date.now());
  return receipt;
}
export async function confirmStoragePrune(ctx) {
  return mutate(ctx,'system.storage.prune',async op=>{
    const p=await storagePreview(ctx),school=ctx.principal.schoolId;
    requireValue(p.previewDigest===ctx.body.previewDigest&&p.confirmation===ctx.body.confirmation,'PRUNE_PREVIEW_CHANGED',409);
    requireValue(p.selection.length>0,'PRUNE_EMPTY',409);
    const table=scratch[ctx.env.SERVICE_NAME],writes=[],guards=[{
      sql:"SELECT NOT EXISTS(SELECT 1 FROM product_operations WHERE school_id=? AND state='prepared' AND operation_id<>?) AS ok",args:[school,op.operationId]
    }];
    if(p.kind==='expired-previews')for(const row of p.selection){
      guards.push({sql:`SELECT expires_at=? AND expires_at<=? AS ok FROM ${table} WHERE school_id=? AND preview_id=?`,args:[row.expiresAt,p.cutoff,school,row.id]});
      writes.push({sql:`DELETE FROM ${table} WHERE school_id=? AND preview_id=? AND expires_at=?`,args:[school,row.id,row.expiresAt]});
    }
    const state=p.kind==='expired-previews'?'complete':'pending';
    writes.push({sql:'INSERT INTO storage_cleanup(school_id,cleanup_id,actor_id,state,revision,plan_json,created_at,completed_at) VALUES(?,?,?,?,1,?,?,?)',args:[school,op.operationId,ctx.principal.actorId,state,canonical(p),ctx.now,state==='complete'?ctx.now:null]});
    return {guards,writes,result:{cleanupId:op.operationId,state,count:p.selection.length},audit:{kind:p.kind,previewDigest:p.previewDigest,count:p.selection.length,automatic:false}};
  });
}
export async function finishStoragePrune(ctx) {
  return mutate(ctx,'system.storage.finish',async()=>{
    const school=ctx.principal.schoolId,id=identifier(ctx.body.cleanupId),row=await one(ctx.env.DB,'SELECT * FROM storage_cleanup WHERE school_id=? AND cleanup_id=?',[school,id]);
    requireValue(row,'PRUNE_PLAN_MISSING',404);
    if(row.state==='complete')return {result:{cleanupId:id,state:'complete'}};
    const plan=JSON.parse(row.plan_json);
    requireValue(plan.kind==='backup-orphans'&&plan.schoolId===school&&plan.owner===ctx.env.SERVICE_NAME&&plan.selection.length<=max,'PRUNE_PLAN_INVALID',409);
    const manifest=await backupManifest(ctx,plan.backupId);
    requireValue(manifest.manifestDigest===plan.manifestDigest,'PRUNE_MANIFEST_CHANGED',409);
    for(const item of plan.selection){
      requireValue(orphanKey(item.key,manifest.prefix)&&!manifest.protectedKeys.has(item.key),'PRUNE_OBJECT_PROTECTED',409);
      requireValue(Date.now()<ctx.principal.validUntil,'PRUNE_AUTHORITY_EXPIRED',503);
      const object=await ctx.env.ARTIFACTS.head(item.key);
      if(!object)continue; // Prior attempt deleted it; replay does not invent a new key.
      requireValue(object.etag===item.etag&&object.size===item.size,'PRUNE_OBJECT_CHANGED',409);
      await ctx.env.ARTIFACTS.delete(item.key);
      requireValue(!(await ctx.env.ARTIFACTS.head(item.key)),'PRUNE_DELETE_UNCONFIRMED',503);
    }
    return {guards:[{sql:"SELECT revision=? AND state='pending' AS ok FROM storage_cleanup WHERE school_id=? AND cleanup_id=?",args:[row.revision,school,id]}],
      writes:[{sql:"UPDATE storage_cleanup SET state='complete',revision=revision+1,completed_at=? WHERE school_id=? AND cleanup_id=?",args:[ctx.now,school,id]}],
      result:{cleanupId:id,state:'complete',objectsRemoved:plan.selection.length},audit:{cleanupId:id,previewDigest:plan.previewDigest,automatic:false}};
  });
}
