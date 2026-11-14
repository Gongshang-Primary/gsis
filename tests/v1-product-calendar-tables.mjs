import assert from 'node:assert/strict';
import { createDatabase, syntheticAdmission } from './v1-product/helpers.mjs';
import { prepareOperation, query, one } from '../v1/runtime/store.mjs';
import { handle, policy } from '../v1/services/calendar/service.mjs';
const runtime=await createDatabase('calendar');
const principal={schoolId:'table-school',actorId:'table-admin',staffId:'table-staff',sessionId:'table-session',capabilities:['calendar.admin'],decisionId:'calendar-tables-test',validUntil:Date.now()+3600000};
const ctx=(action,p,who=principal,db=runtime.db)=>({env:{DB:db,ARTIFACTS:runtime.bucket,GSIS_SECRET:'synthetic-table-secret-only',SCHOOL_ID:who.schoolId,SERVICE_NAME:'calendar'},request:new Request('https://example.invalid/calendar/action'),path:'/action',method:'POST',body:{action,payload:p},principal:who,now:Date.now()});
const read=(action,p,who)=>handle(ctx(action,p,who));
async function mutate(action,p,db=runtime.db,who=principal){
 const input={...p,operationId:p.operationId||crypto.randomUUID()},c=ctx(action,input,who,db);
 const op=await prepareOperation(runtime.db,{schoolId:who.schoolId,actorId:who.actorId,operationId:input.operationId,action:'calendar.'+action,intent:{action,payload:input},now:c.now,validUntil:who.validUntil,authorization:who});
 await syntheticAdmission(runtime.db,op,{decisionId:who.decisionId});
 return handle(c);
}
const getBook=kind=>read('tableWorkbook',{kind});
const review=workbook=>read('tableImportPreview',{workbook});
const apply=(workbook,preview,extra={})=>({workbook,previewToken:preview.previewToken,expiresAt:preview.expiresAt,...extra});
try{
 await mutate('saveYear',{Year:2026,Status:'ACTIVE',ReleasedToTeachers:'Yes',expectedMetadataRevision:'missing'});
 const book=await getBook('tags'),meaning=book.sheets.Records.columns.indexOf('Meaning');
 const changed=structuredClone(book);changed.sheets.Records.rows.slice(0,12).forEach((row,i)=>row[meaning]='Reviewed tag '+i);
 const preview=await review(changed);assert.equal(preview.valid,true);assert.equal(preview.changedRecords,12);
 const request=apply(changed,preview,{operationId:'tags-max-batch'}),result=await mutate('tableImportApply',request);
 assert.equal(result.changedRecords,12);
 assert.deepEqual(await mutate('tableImportApply',request),result,'matching retry uses original result');
 const over=await getBook('tags');over.sheets.Records.rows.slice(0,13).forEach(row=>row[meaning]+=' extra');
 assert((await review(over)).errors.some(e=>e.message.includes('12')));
 const duplicate=await getBook('tags');duplicate.sheets.Records.rows[1][0]=duplicate.sheets.Records.rows[0][0].toUpperCase();
 assert((await review(duplicate)).errors.some(e=>e.column===0),'normalized duplicate/changed identity rejects');
 const foreign=await getBook('tags');foreign.schoolId='other-school';await assert.rejects(()=>review(foreign),e=>e.code==='WORKBOOK_SCOPE');
 const oversized=await getBook('tags');oversized.sheets.Records.rows[0][meaning]='学'.repeat(100000);
 await assert.rejects(()=>review(oversized),e=>e.code==='WORKBOOK_BOUNDS','UTF-8 bytes enforce the payload bound');
 await assert.rejects(()=>read('tableWorkbook',{kind:'tags'},{...principal,capabilities:['calendar.read']}),e=>e.code==='CAPABILITY_DENIED');
 await assert.rejects(()=>mutate('tableImportApply',request,runtime.db,{...principal,impersonating:true}),e=>e.code==='IMPERSONATION_DENIED');
 const actorBook=await getBook('tags');actorBook.sheets.Records.rows[0][meaning]='Actor-bound change';const actorPreview=await review(actorBook);
 await assert.rejects(()=>mutate('tableImportApply',apply(actorBook,actorPreview),runtime.db,{...principal,actorId:'other-admin',staffId:'other-staff'}),e=>e.code==='PREVIEW_CHANGED');
 await assert.rejects(()=>mutate('tableImportApply',apply(actorBook,actorPreview,{expiresAt:Date.now()-1})),e=>e.code==='PREVIEW_EXPIRED');
 const altered=await getBook('tags');altered.sheets.Records.rows[0][meaning]='Previewed';const alteredPreview=await review(altered);altered.sheets.Records.rows[0][meaning]='After preview';
 await assert.rejects(()=>mutate('tableImportApply',apply(altered,alteredPreview)),e=>e.code==='PREVIEW_CHANGED');
 const stale=await getBook('tags');stale.sheets.Records.rows[0][meaning]='Stale proposed';const stalePreview=await review(stale);
 await mutate('saveTag',{Tag:stale.sheets.Records.rows[1][2],revision:stale.sheets.Records.rows[1][1],Meaning:'Other owner edit'});
 await assert.rejects(()=>mutate('tableImportApply',apply(stale,stalePreview)),e=>e.code==='METADATA_CONFLICT');
 // Full-source guard catches a write in the actual check-to-commit interval.
 const racing=await getBook('tags');racing.sheets.Records.rows[0][meaning]='Must not partially apply';const racingPreview=await review(racing);
 const before=await query(runtime.db,"SELECT record_id,revision,data_json FROM calendar_metadata WHERE kind='tags' ORDER BY record_id");
 let injected=false;
 const raceDb=new Proxy(runtime.db,{get(target,key){if(key==='batch')return async statements=>{if(!injected&&statements.length>8){injected=true;await runtime.db.prepare("UPDATE calendar_metadata SET revision=revision+1 WHERE school_id=? AND kind='tags' AND record_id=?").bind(principal.schoolId,before[1].record_id).run();}return target.batch(statements);};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 await assert.rejects(()=>mutate('tableImportApply',apply(racing,racingPreview),raceDb),e=>e.code==='REVISION_CONFLICT');
 assert.equal(injected,true);const after=await query(runtime.db,"SELECT record_id,revision,data_json FROM calendar_metadata WHERE kind='tags' ORDER BY record_id");
 assert.equal(after[0].data_json,before[0].data_json,'losing batch changes no target row');
 assert.equal(after[1].revision,before[1].revision+1,'independent writer survives');
 // At maximum lane batch size and eight released years, reuse each predicate,
 // deduplicate whole-year sync jobs and stay under the free-tier query budget.
 for(let y=2027;y<=2033;y++)await mutate('saveYear',{Year:y,Status:'ACTIVE',ReleasedToTeachers:'Yes',expectedMetadataRevision:'missing'});
 for(let i=0;i<12;i++)await mutate('saveLane',{LaneID:'batch_'+i,Header:'Batch '+i,Active:'Yes',revision:0});
 const lanes=await getBook('lanes'),header=lanes.sheets.Records.columns.indexOf('Header');
 lanes.sheets.Records.rows=lanes.sheets.Records.rows.filter(row=>row[0].startsWith('batch_'));lanes.sheets.Records.rows.forEach(row=>row[header]+=' changed');
 const lanePreview=await review(lanes);assert.equal(lanePreview.valid,true);
 let statements=0,maxBatch=0;
 const counted=new Proxy(runtime.db,{get(target,key){if(key==='prepare')return sql=>{statements++;return target.prepare(sql);};if(key==='batch')return batch=>{maxBatch=Math.max(maxBatch,batch.length);return target.batch(batch);};const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 const cold=ctx('tableImportApply',apply(lanes,lanePreview,{operationId:'lane-max-batch'}),{...principal,dependencies:[{owner:'core',scope:'account:table-admin',revision:1}]},counted);
 cold.env.CORE={async fetch(request){const p=await request.json(),path=new URL(request.url).pathname;return Response.json({ok:true,data:path.endsWith('/release')?{state:'released'}:path.endsWith('/receipt')?{recorded:true}:{pinId:p.pinId,owner:'core',scope:p.scope,revision:p.revision,validUntil:principal.validUntil}});}};
 const laneResult=await handle(cold);
 assert.equal(laneResult.changedRecords,12);assert(maxBatch<=28,'commit transaction <=28 statements');assert(statements<=50,'including local planning/admission reads <=50 statements');
 assert.equal((await one(runtime.db,"SELECT COUNT(*) n FROM product_outbox WHERE operation_id='lane-max-batch'")).n,8,'one sync job per released year');
 // A different owner operation releases a year after the lane job list was
 // read but before its transaction. Neither native edits nor bulk imports may
 // commit a lane change with an incomplete sync-year outbox.
 async function releaseDuringCommit(action,payload,targetYear,operationId,replaceYear=null){
  const unreleased=await mutate('saveYear',{Year:targetYear,Status:'ACTIVE',ReleasedToTeachers:'No',expectedMetadataRevision:'missing'});
  const unchanged=await getBook('lanes');let released, withheld, raced=false;
  const competing=new Proxy(runtime.db,{get(target,key){if(key==='batch')return async batch=>{
   if(!raced&&batch.length>8){
    raced=true;
    if(replaceYear){const row=await one(runtime.db,'SELECT revision FROM calendar_years WHERE school_id=? AND year=?',[principal.schoolId,replaceYear]);withheld=await mutate('saveYear',{Year:replaceYear,Status:'ACTIVE',ReleasedToTeachers:'No',revision:row.revision});}
    released=await mutate('saveYear',{Year:targetYear,Status:'ACTIVE',ReleasedToTeachers:'Yes',expectedMetadataRevision:unreleased.metadataRevision});
   }
   return target.batch(batch);
  };const value=target[key];return typeof value==='function'?value.bind(target):value;}});
  await assert.rejects(()=>mutate(action,{...payload,operationId},competing),e=>e.code==='REVISION_CONFLICT');
  assert.equal(raced,true,'release occurred in the check-to-commit interval');
  assert.deepEqual(await getBook('lanes'),unchanged,'no lane write commits after the released-year set changes');
  assert.equal((await one(runtime.db,'SELECT COUNT(*) n FROM product_outbox WHERE operation_id=?',[operationId])).n,0,'no partial sync-year job list commits');
  assert.equal((await one(runtime.db,'SELECT released FROM calendar_years WHERE school_id=? AND year=?',[principal.schoolId,targetYear])).released,1,'independent year release survives');
  if(replaceYear)assert.equal((await one(runtime.db,"SELECT COUNT(*) n FROM calendar_years WHERE school_id=? AND released=1 AND status<>'ARCHIVED'",[principal.schoolId])).n,8,'same-size changed year set also rejects');
  await mutate('saveYear',{Year:targetYear,Status:'ACTIVE',ReleasedToTeachers:'No',expectedMetadataRevision:released.metadataRevision});
  if(replaceYear)await mutate('saveYear',{Year:replaceYear,Status:'ACTIVE',ReleasedToTeachers:'Yes',expectedMetadataRevision:withheld.metadataRevision});
 }
 const releaseBook=await getBook('lanes');releaseBook.sheets.Records.rows=releaseBook.sheets.Records.rows.filter(row=>row[0]==='batch_2');releaseBook.sheets.Records.rows[0][header]+=' release-race';
 await releaseDuringCommit('tableImportApply',apply(releaseBook,await review(releaseBook)),2034,'bulk-release-race');
 const nativeLane=(await getBook('lanes')).sheets.Records.rows.find(row=>row[0]==='batch_3');
 await releaseDuringCommit('saveLane',{LaneID:'batch_3',revision:nativeLane[1],Header:'Native release race'},2035,'native-release-race',2033);
 const invalid=await getBook('lanes'),active=invalid.sheets.Records.columns.indexOf('Active');invalid.sheets.Records.rows[0][active]='maybe';assert((await review(invalid)).errors.some(e=>e.column===active));
 const blocked=await getBook('lanes');blocked.sheets.Records.rows=blocked.sheets.Records.rows.filter(row=>['batch_0','batch_1'].includes(row[0]));blocked.sheets.Records.rows.forEach(row=>row[header]+=' blocked');
 const blockedPreview=await review(blocked);
 await runtime.db.prepare("INSERT INTO calendar_events(school_id,event_id,year,revision,status,start_date,end_date,data_json) VALUES(?, 'dispatch-event',2026,1,'PUBLISHED','2026-11-16','2026-11-16',?)").bind(principal.schoolId,JSON.stringify({LaneID:'batch_1'})).run();
 await runtime.db.prepare("INSERT INTO calendar_dispatch_locks VALUES(?,'staff','dispatch-event','intent','sending',0,0)").bind(principal.schoolId).run();
 const blockedBefore=await getBook('lanes');
 await assert.rejects(()=>mutate('tableImportApply',apply(blocked,blockedPreview)),e=>e.code==='REVISION_CONFLICT');
 assert.deepEqual(await getBook('lanes'),blockedBefore,'dispatch lock blocks the whole batch');
 await runtime.restart();
 assert.deepEqual(await mutate('tableImportApply',request),result,'durable original receipt survives runtime restart');
 assert.equal(policy('POST','/action',{action:'tableImportApply'}).action,'calendar.admin');
 console.log(`PASS Calendar atomic table imports: 12-row limits, full-source/actor/school/preview binding, real D1 race rollback, native/bulk released-year CAS, dispatch locks, deduplicated outbox, ${statements} local statements (maximum batch ${maxBatch}), and durable retry after restart`);
}finally{await runtime.close();}
