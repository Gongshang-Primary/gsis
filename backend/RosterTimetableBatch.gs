/* A ready marker is written only after the owning roster document commits.
   Pending/missing markers force a fresh snapshot. Never cache a read that raced
   a write, and never decompress stored plans just to maintain the marker. */
function rosterTimetableBatchStamp_(state,from,to){
 const inWindow=d=>!from||d>=from&&d<=to,records=(state.staplerPlans||[]).filter(r=>inWindow(r.date));
 const legacy=new Set(records.filter(r=>r.confirmed&&!r.confirmedPlan).map(r=>r.date));
 const plans=records.map(r=>[r.date,r.id,r.name,r.baselineId,r.revision,r.confirmed,r.confirmedRevision,r.confirmedAt,r.confirmedBy,r.updatedAt,!!r.draft,!!r.confirmedPlan,!!r.published,r.publishedRevision,r.publishedAt]);
 const publications=Object.entries(state.dailyPublicationStates||{}).filter(([d])=>inWindow(d)).map(([d,r])=>[d,r.revision,r.sourceRevision,r.baselineId,r.staplerRevision]);
 const histories=[...new Set([...(state.publicationSnapshots||[]).map(r=>r.date),...(state.assignments||[]).filter(r=>r.publishedAt||['published','completed'].includes(r.status)).map(r=>r.date),...(state.importedRelief||[]).filter(r=>['published','completed'].includes(r.status)).map(r=>r.date)])].filter(inWindow).sort();
 const proof=(state.audit||[]).filter(r=>legacy.has(r.date)&&['confirmStapler','renameStapler'].includes(r.operation));
 const requests=(state.staplerRequests||[]).filter(r=>inWindow(r.date)),mass=Object.fromEntries(Object.entries(state.massPublications||{}).filter(([d])=>inWindow(d)));
 return rosterOperationsPlanDigest_(JSON.stringify([2,plans,publications,requests,histories,mass,proof]));
}
function rosterTimetableBatchMarker_(){
 try{
  const value=JSON.parse(props_().getProperty('ROSTER_TIMETABLE_CACHE')||'null');if(value?.schema!==2)return null;
  // Window identity is produced under the same pending/ready commit protocol.
  // After midnight, fall back to the all-date source until the next commit.
  if(value.windowFrom===rosterToday_()&&value.windowReady===true&&/^[a-f0-9]{64}$/.test(value.windowSource))return {...value,ready:true,source:value.windowSource};
  return value.ready===true&&/^[a-f0-9]{64}$/.test(value.source)?value:null;
 }catch(_){return null;}
}
function rosterTimetableBatchCommitBegin_(state){
 const source=rosterTimetableBatchStamp_(state),windowFrom=rosterToday_(),windowTo=new Date(Date.parse(windowFrom+'T00:00:00Z')+30*86400000).toISOString().slice(0,10),windowSource=rosterTimetableBatchStamp_(state,windowFrom,windowTo),statisticsSource=typeof rosterStatisticsStamp_==='function'?rosterStatisticsStamp_(state):null;
 let prior=null;try{prior=JSON.parse(props_().getProperty('ROSTER_TIMETABLE_CACHE')||'null');}catch(_){}
 const sameTimetable=prior?.schema===2&&prior.ready===true&&prior.source===source,sameWindow=prior?.schema===2&&prior.windowReady===true&&prior.windowFrom===windowFrom&&prior.windowSource===windowSource,sameStatistics=!!statisticsSource&&prior?.schema===2&&prior.statisticsReady===true&&prior.statisticsSource===statisticsSource;
 if(sameTimetable&&sameWindow&&(!statisticsSource||sameStatistics))return null;
 // A change outside the preload window leaves that domain ready. An in-window
 // change marks it pending before writing; a crash cannot certify new content.
 const ticket={schema:2,source,ready:sameTimetable,windowFrom,windowSource,windowReady:sameWindow,...(statisticsSource?{statisticsSource,statisticsReady:sameStatistics,statisticsRevision:sameStatistics?prior.statisticsRevision:state.revision}:{statisticsReady:false})};
 props_().setProperty('ROSTER_TIMETABLE_CACHE',JSON.stringify(ticket));return ticket;
}
function rosterTimetableBatchCommitEnd_(ticket){if(ticket)props_().setProperty('ROSTER_TIMETABLE_CACHE',JSON.stringify({...ticket,ready:true,windowReady:true,...(ticket.statisticsSource?{statisticsReady:true}:{})}));}
function rosterTimetableBatchSource_(manifestKey,marker,c,authorityKey){
 if(!marker)return null;
 const authority=(c.rosterPeople||[]).map(p=>[p.id,p.name,p.active,p.groups,p.role,p.adhocEligible,p.mk,p.appointmentLevel]);
 return rosterOperationsPlanDigest_(JSON.stringify([4,manifestKey,marker.source,authority,c.rosterSMCIds||[],authorityKey]));
}
function rosterTimetableBatchCached_(source,encoding,value){
 if(!source)return null;try{const cache=CacheService.getScriptCache(),key='roster-batch-source-v4:'+rosterOperationsPlanDigest_(JSON.stringify([source,encoding]));if(value){const json=JSON.stringify(value);if(json.length<90000)cache.put(key,json,21600);return value;}const stored=cache.get(key);return stored?JSON.parse(stored):null;}catch(_){return null;}
}
function rosterTimetableBatchPlanKey_(row){const value={...row};delete value.timetableSourceRevision;if(value.timetableDay){value.timetableDay={...value.timetableDay};delete value.timetableDay.sourceRevision;}return rosterOperationsPlanDigest_(JSON.stringify(value));}
/* Two read-only batches: immutable baselines first, then authorised suspended
   previews from one operations snapshot. Neither stage holds the writer lock. */
function rosterTimetableBatchChanged_(){
 throw Object.assign(Error('Timetables changed while preparing the preload. Reload the baseline batch first.'),{status:409,code:'TIMETABLE_BATCH_CHANGED'});
}
function rosterTimetableBatchManifest_(index,user,from){
 const dates=Array.from({length:31},(_,n)=>{
  const date=new Date(Date.parse(from+'T00:00:00Z')+n*86400000).toISOString().slice(0,10),entry=GSISRoster.active(index.entries,date);
  return {date,baselineId:entry?.id||null};
 }),ids=new Set(dates.map(d=>d.baselineId).filter(Boolean)),entries=index.entries.filter(e=>!e.pruned&&ids.has(e.id));
 // Uploads create immutable model files. Metadata edits and day rollover change
 // the manifest, never the content identity of an unchanged uploaded model.
 const modelKeys=Object.fromEntries(entries.map(e=>[e.id,rosterOperationsPlanDigest_(JSON.stringify([2,e.id,e.modelFile]))]));
 const baselineKey=rosterOperationsPlanDigest_(JSON.stringify([2,Object.entries(modelKeys).sort(([a],[b])=>a.localeCompare(b))]));
 const manifestKey=rosterOperationsPlanDigest_(JSON.stringify([2,baselineKey,entries.map(rosterPublic_),dates]));
 return {from,to:dates[30].date,baselineKey,manifestKey,modelKeys,registerRevision:index.revision,entries,dates};
}
function rosterTimetableBatchKnownKeys_(value,max){
 return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length<=max&&Object.values(value).every(k=>typeof k==='string'&&/^[a-f0-9]{64}$/.test(k))?value:null;
}
function rosterTimetableBatchAuthorityKey_(user,stage){
 // All authenticated Roster users have the same baseline viewer. Suspended
 // date permissions include personal requests, so that projection is scoped.
 return rosterOperationsPlanDigest_(JSON.stringify(stage==='baseline'?[2,'baseline-authorised-view']:[2,user.email.toLowerCase(),user.staffId,!!user.smc,!!user.admin]));
}
function rosterTimetableBatchPeriods_(model){
 return Array.from({length:model.maxPeriod+1},(_,period)=>{
  const startMinutes=model.timing.startMinutes+period*model.timing.periodMinutes,endMinutes=startMinutes+model.timing.periodMinutes,fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  return {period,start:fmt(startMinutes),end:fmt(endMinutes),startMinutes,endMinutes};
 });
}
function rosterTimetableBatchEnvelope_(payload,encoding){
 const json=JSON.stringify(payload),blob=Utilities.newBlob(json,'application/json'),bytes=blob.getBytes().length;
 if(bytes>64*1024*1024)throw Object.assign(Error('This timetable preload is too large. Open individual dates while Admin reviews the saved timetable size.'),{status:413,code:'TIMETABLE_BATCH_TOO_LARGE'});
 const key=rosterOperationsPlanDigest_(json),header={schema:1,stage:payload.stage,from:payload.from,to:payload.to,baselineKey:payload.baselineKey,key,bytes};
 if(encoding==='json-v1'||typeof Utilities.gzip!=='function')return {...header,encoding:'json-v1',data:json};
 const cacheKey='roster-batch-v1:'+key;let cache,packed;
 try{cache=CacheService.getScriptCache();packed=cache.get(cacheKey);}catch(_){}
 if(!packed){packed=Utilities.base64Encode(Utilities.gzip(blob).getBytes());if(cache&&packed.length<90000)try{cache.put(cacheKey,packed,21600);}catch(_){} }
 return {...header,encoding:'gzip-base64-v1',data:packed};
}
// Prepared pieces live inside the same durable source write. They are optional
// acceleration, never an independent publication head or permission grant.
function rosterTimetablePart_(value){
 const json=JSON.stringify(value),blob=Utilities.newBlob(json,'application/json'),bytes=blob.getBytes().length;
 if(bytes>16000000)throw Error('Prepared timetable part exceeds its bound.');
 const data=Utilities.base64Encode(Utilities.gzip(blob).getBytes());return {key:rosterOperationsPlanDigest_(json),bytes,data,encodedKey:rosterOperationsPlanDigest_(data)};
}
function rosterTimetablePartValid_(part){return !!part&&/^[a-f0-9]{64}$/.test(part.key||'')&&Number.isSafeInteger(part.bytes)&&part.bytes>1&&part.bytes<=16000000&&typeof part.data==='string'&&part.data.length>0&&part.data.length<=22000000&&part.encodedKey===rosterOperationsPlanDigest_(part.data);}
function rosterTimetablePackedIdentity_(row,field){
 let value=row[field],stored=typeof rosterPlanPacked_!=='undefined'?rosterPlanPacked_.get(value):null;
 for(let i=0;!stored&&i<3;i++){if(value?.encoding==='gzip-base64-v1'){stored=value;break;}if(value?.encoding==='same-as-draft-v1')value=row.draft;else if(value?.encoding==='same-as-published-v1')value=row.published;else break;stored=typeof rosterPlanPacked_!=='undefined'?rosterPlanPacked_.get(value):null;}
 return stored?[stored.encoding,stored.bytes,stored.validation||null,rosterOperationsPlanDigest_(stored.data)]:null;
}
function rosterTimetablePreparedSource_(state,row){
 return rosterOperationsPlanDigest_(JSON.stringify([3,GSISRosterStapler.validationVersion,rosterTimetableBatchStamp_({staplerPlans:[row],dailyPublicationStates:state.dailyPublicationStates?.[row.date]?{[row.date]:state.dailyPublicationStates[row.date]}:{},audit:state.audit||[]}),['draft','published','confirmedPlan'].map(field=>rosterTimetablePackedIdentity_(row,field)),state.dailyPublicationStates?.[row.date]||null]));
}
function rosterTimetableConfirmedSource_(state,row){
 const confirmed=GSISRosterOperations.confirmedStaplerSnapshot(row,state.audit);if(!confirmed)return null;
 const field=row.confirmedPlan===confirmed.plan?'confirmedPlan':row.published===confirmed.plan?'published':'draft';
 // Draft revisions do not alter the teacher's confirmed preview. Bind reuse to
 // all content used by that preview, including an older daily publication.
 return rosterOperationsPlanDigest_(JSON.stringify([2,GSISRosterStapler.validationVersion,row.date,String(row.name||''),row.baselineId,confirmed.revision,rosterTimetablePackedIdentity_(row,field),row.publishedRevision,rosterTimetablePackedIdentity_(row,'published'),state.dailyPublicationStates?.[row.date]||null]));
}
function rosterTimetablePreparePlan_(state,row,packed){
 if(row.date<rosterToday_())return null;
 const sourceKey=rosterTimetablePreparedSource_(state,packed),prior=row.timetablePackage;
 if(prior?.schema===1&&/^[a-f0-9]{64}$/.test(prior.periodsKey||'')&&prior.sourceKey===sourceKey&&rosterTimetablePartValid_(prior.draft)&&(!prior.confirmed||rosterTimetablePartValid_(prior.confirmed)))return prior;
 // Do not inflate every legacy date during an unrelated operational write.
 if(!prior&&state.dailyPublicationStates?.[row.date]?.sourceRevision!==state.revision&&[['draft',row.revision],['published',row.publishedRevision??row.revision],['confirmedPlan',row.confirmedRevision??row.revision]].every(([field,revision])=>!row[field]||rosterPlanPacked_.get(row[field])?.validation?.revision===revision))return null;
 const confirmed=GSISRosterOperations.confirmedStaplerSnapshot(row,state.audit),draft=row.draft||confirmed?.plan;if(!draft)return null;
 const ctx={user:{smc:true},people:[],today:rosterToday_(),days:{},baselineDays:{}};
 const timetableDay=row.published||confirmed?GSISRosterOperations.timetableDay(state,ctx,{date:row.date}):null;
 const projections=new Map(),safe=plan=>{if(!projections.has(plan))projections.set(plan,GSISRosterOperations.confirmedStaplerProjection(plan));return projections.get(plan);};
 const project=(plan,mode,revision)=>({date:row.date,name:String(row.name||''),baselineId:plan.baselineId,revision,viewMode:mode,plan:safe(plan),confirmedPlan:confirmed?safe(confirmed.plan):null,confirmedRevision:confirmed?.revision||0,timetableDay});
 const confirmedSourceKey=rosterTimetableConfirmedSource_(state,packed),reuseConfirmed=confirmed&&prior?.schema===1&&prior.confirmedSourceKey===confirmedSourceKey&&rosterTimetablePartValid_(prior.confirmed);
 return {schema:1,sourceKey,confirmedSourceKey,periodsKey:rosterOperationsPlanDigest_(JSON.stringify(draft.periods)),preparedAt:new Date().toISOString(),draft:rosterTimetablePart_(project(draft,'draft',row.revision)),confirmed:confirmed?(reuseConfirmed?prior.confirmed:rosterTimetablePart_(project(confirmed.plan,'confirmed',confirmed.revision))):null};
}
function rosterTimetablePartsEnvelope_(payload,parts){
 const data=JSON.stringify({schema:1,payload,parts}),bytes=Utilities.newBlob(JSON.stringify(payload),'application/json').getBytes().length+Object.values(parts).reduce((n,p)=>n+p.bytes,0);
 if(bytes>64*1024*1024||data.length>90*1024*1024)throw Object.assign(Error('This timetable preload is too large.'),{status:413,code:'TIMETABLE_BATCH_TOO_LARGE'});
 return {schema:1,stage:payload.stage,from:payload.from,to:payload.to,baselineKey:payload.baselineKey,key:rosterOperationsPlanDigest_(data),bytes,encoding:'gzip-parts-v1',data};
}
function rosterTimetableBatch_(req,c){
 const p=req.input||{},user=rosterOperationsAuthority_(c,req.identity),stage=p.stage,encoding=p.encoding||'gzip-base64-v1';
 if(!['baseline','suspended'].includes(stage)||!['gzip-base64-v1','gzip-parts-v1','json-v1'].includes(encoding))error_(400,'Choose a valid timetable batch stage and encoding.');
 const from=GSISRoster.date(rosterToday_()),index=rosterIndex_(),manifest=rosterTimetableBatchManifest_(index,user,from),{to,baselineKey,manifestKey,modelKeys,registerRevision,entries,dates}=manifest;
 const authorityKey=rosterTimetableBatchAuthorityKey_(user,stage),baselineSourceKey=rosterOperationsPlanDigest_(JSON.stringify([3,manifestKey,rosterTimetableBatchAuthorityKey_(user,'baseline')]));
 if(stage==='suspended'&&(p.baselineKey!==baselineKey||p.baselineSourceKey&&p.baselineSourceKey!==baselineSourceKey))rosterTimetableBatchChanged_();
 const marker=stage==='suspended'?rosterTimetableBatchMarker_():null,sourceKey=stage==='baseline'?baselineSourceKey:rosterTimetableBatchSource_(manifestKey,marker,c,authorityKey);
 if(p.expectedSourceKey&&p.expectedSourceKey!==sourceKey)rosterTimetableBatchChanged_();
 const header={schema:1,stage,from,to,baselineKey,manifestKey,registerRevision,authorityKey,sourceKey,checkedAt:new Date().toISOString()};
 // A fresh authority check always precedes this manifest. Gateways may reuse an
 // immutable, private object only for this exact source and authority key.
 if(p.manifestOnly===true)return {...header,manifestOnly:true};
 if(sourceKey&&p.knownSourceKey===sourceKey)return {...header,unchanged:true};
 const knownModels=rosterTimetableBatchKnownKeys_(p.knownModelKeys,1000),knownPlans=rosterTimetableBatchKnownKeys_(p.knownPlanKeys,31),deltaKeys=stage==='baseline'?knownModels:knownPlans;
 const cached=rosterTimetableBatchCached_(sourceKey,encoding);if(cached&&!deltaKeys)return {...cached,...header};
 const parts={},multipart=encoding==='gzip-parts-v1',payload={schema:1,stage,from,to,baselineKey,manifestKey,registerRevision},models=new Map(),getModel=entry=>{
  if(!models.has(entry.modelFile))models.set(entry.modelFile,rosterModel_(entry));
  return models.get(entry.modelFile);
 };
 if(stage==='baseline'){
  payload.entries=entries.map(rosterPublic_);payload.modelKeys=modelKeys;payload.dates=dates;
  payload.models=entries.filter(entry=>!knownModels||knownModels[entry.id]!==modelKeys[entry.id]).map(entry=>{
   if(!multipart)return {id:entry.id,contentKey:modelKeys[entry.id],model:getModel(entry)};
   const part=typeof rosterModelPart_==='function'?rosterModelPart_(entry):rosterTimetablePart_(getModel(entry));parts[part.key]=part;return {id:entry.id,contentKey:modelKeys[entry.id],partKey:part.key};
  });
  if(knownModels){payload.delta=true;payload.removedModelIds=Object.keys(knownModels).filter(id=>!modelKeys[id]);}
 }else{
  const state=rosterOperationsState_(true),privileged=user.smc||user.admin,ctx={user,people:c.rosterPeople,today:from,timetableEntries:index.entries,smcIds:c.rosterSMCIds||[],days:{}},seen=new Set(),plans=[];
  for(const record of state.staplerPlans){
   if(record.date<from||record.date>to||seen.has(record.date))continue;seen.add(record.date);
   const confirmed=GSISRosterOperations.confirmedStaplerSnapshot(record,state.audit),allowed=privileged||GSISRosterOperations.mayViewConfirmed(state,ctx,record),source=privileged?(record.draft||confirmed?.plan):confirmed?.plan;
   if(!allowed||!source)continue;
   const prepared=multipart&&record.timetablePackage?.schema===1&&record.timetablePackage.sourceKey===rosterTimetablePreparedSource_(state,record)?record.timetablePackage:null,part=prepared&&(privileged?prepared.draft:prepared.confirmed);
   if(rosterTimetablePartValid_(part)){
    parts[part.key]=part;plans.push({date:record.date,partKey:part.key,timetableSourceRevision:confirmed?.revision??state.revision,baselineContentKey:null,baselineChanged:false});continue;
   }
   const timetableDay=record.published||confirmed?GSISRosterOperations.timetableDay(state,ctx,{date:record.date}):null;
   plans.push({date:record.date,name:String(record.name||''),baselineId:source.baselineId,baselineContentKey:null,revision:privileged?record.revision:confirmed.revision,viewMode:privileged?'draft':'confirmed',baselineChanged:false,plan:GSISRosterOperations.confirmedStaplerProjection(source),confirmedPlan:confirmed?GSISRosterOperations.confirmedStaplerProjection(confirmed.plan):null,confirmedRevision:confirmed?.revision||0,timetableDay});
  }
  const view=GSISRosterOperations.staplerDatesView(state,ctx);
  payload.operationsRevision=state.revision;payload.plans=plans.sort((a,b)=>a.date.localeCompare(b.date));payload.planKeys=Object.fromEntries(payload.plans.map(row=>[row.date,rosterTimetableBatchPlanKey_(row)]));payload.datesView={revision:state.revision,confirmedAccess:view.confirmedAccess,dates:view.dates.filter(row=>row.date>=from&&row.date<=to)};
  if(knownPlans){payload.delta=true;payload.plans=payload.plans.filter(row=>knownPlans[row.date]!==payload.planKeys[row.date]);payload.removedDates=Object.keys(knownPlans).filter(d=>!payload.planKeys[d]);}
  if(multipart){for(const row of payload.plans){if(row.partKey)continue;const part=rosterTimetablePart_(row);parts[part.key]=part;for(const key of Object.keys(row))if(key!=='date')delete row[key];row.partKey=part.key;}const used=new Set(payload.plans.map(row=>row.partKey));for(const key of Object.keys(parts))if(!used.has(key))delete parts[key];}
 }
 // Only dependencies relevant to this 31-day mapping bracket preparation.
 // A register edit outside the window cannot invalidate immutable local models.
 if(rosterToday_()!==from||rosterTimetableBatchManifest_(rosterIndex_(),user,from).manifestKey!==manifestKey)rosterTimetableBatchChanged_();
 const after=stage==='suspended'?rosterTimetableBatchMarker_():null,stable=stage==='baseline'||!!marker&&!!after&&marker.source===after.source;
 if(stage==='suspended'&&marker&&!stable)rosterTimetableBatchChanged_();
 const full={...(multipart?rosterTimetablePartsEnvelope_(payload,parts):rosterTimetableBatchEnvelope_(payload,encoding)),...header,sourceKey:stable?sourceKey:null};
 if(stable&&!deltaKeys)rosterTimetableBatchCached_(sourceKey,encoding,full);
 return full;
}
