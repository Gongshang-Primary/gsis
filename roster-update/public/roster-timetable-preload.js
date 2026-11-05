/* Background, role-scoped timetable batches. A complete baseline stage is usable
   before the suspended stage arrives; writes and live authority stay online. */
(()=>{
 'use strict';
 const maxBytes=64*1024*1024,hash=/^[a-f0-9]{64}$/;
 const copy=value=>JSON.parse(JSON.stringify(value)),object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
 const failure=(message='The timetable preload is incomplete. Current records can still be loaded normally.',code='TIMETABLE_BATCH_INVALID')=>Object.assign(Error(message),{code});
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 const endDate=from=>new Date(Date.parse(from)+30*86400000).toISOString().slice(0,10);
 const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
 let gzipSupported;
 function supportsGzip(){if(gzipSupported!==undefined)return gzipSupported;try{return gzipSupported=typeof Blob==='function'&&typeof TextDecoder==='function'&&typeof DecompressionStream==='function';}catch{return gzipSupported=false;}}
 const supportsParts=()=>supportsGzip()&&typeof crypto==='object'&&!!crypto.subtle;
 async function sha256(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
 async function decodeParts(envelope){
  if(!supportsParts()||await sha256(envelope.data)!==envelope.key)throw Error('Invalid prepared envelope.');
  const wire=JSON.parse(envelope.data),payload=wire?.payload,parts=wire?.parts;
  if(wire?.schema!==1||!object(payload)||!object(parts)||Object.keys(parts).length>31)throw Error('Invalid prepared parts.');
  const rows=envelope.stage==='baseline'?payload.models:payload.plans;if(!Array.isArray(rows)||rows.length>31)throw Error('Invalid prepared rows.');
  const needed=new Set(rows.map(row=>row?.partKey));if(needed.size!==Object.keys(parts).length||[...needed].some(key=>!hash.test(key||'')||!Object.hasOwn(parts,key)))throw Error('Incomplete prepared parts.');
  let bytes=new TextEncoder().encode(JSON.stringify(payload)).byteLength;const decoded=new Map();
  for(const [key,part] of Object.entries(parts)){
   if(!object(part)||part.key!==key||!Number.isSafeInteger(part.bytes)||part.bytes<2||part.bytes>16000000||typeof part.data!=='string'||part.data.length>22000000)throw Error('Invalid prepared part.');
   bytes+=part.bytes;if(bytes>maxBytes||bytes>envelope.bytes)throw Error('Prepared size exceeds its bound.');
   const raw=atob(part.data),reader=new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),decoder=new TextDecoder('utf-8',{fatal:true}),chunks=[];let length=0,text;
   try{while(true){const next=await reader.read();if(next.done)break;length+=next.value.byteLength;if(length>part.bytes)throw Error('Prepared size mismatch.');chunks.push(decoder.decode(next.value,{stream:true}));}chunks.push(decoder.decode());text=chunks.join('');if(length!==part.bytes||await sha256(text)!==key)throw Error('Prepared checksum mismatch.');}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   decoded.set(key,JSON.parse(text));
  }
  if(bytes!==envelope.bytes)throw Error('Prepared envelope size mismatch.');
  if(envelope.stage==='baseline')payload.models=rows.map(({partKey,...row})=>({...row,model:decoded.get(partKey)}));
  else payload.plans=rows.map(({partKey,timetableSourceRevision,...row})=>{const value={...decoded.get(partKey),...row};if(value.timetableDay?.source==='confirmed'&&timetableSourceRevision!==undefined){if(!Number.isSafeInteger(timetableSourceRevision)||timetableSourceRevision<0)throw Error('Invalid source revision.');value.timetableDay={...value.timetableDay,sourceRevision:timetableSourceRevision};}return value;});
  return payload;
 }
 async function decode(envelope,stage,from){
  if(!object(envelope)||envelope.schema!==1||envelope.stage!==stage||envelope.from!==from||envelope.to!==endDate(from)||!hash.test(envelope.baselineKey||'')||!hash.test(envelope.key||'')||!Number.isSafeInteger(envelope.bytes)||envelope.bytes<2||envelope.bytes>maxBytes||!['gzip-base64-v1','gzip-parts-v1','json-v1'].includes(envelope.encoding)||typeof envelope.data!=='string'||!envelope.data.length||envelope.data.length>maxBytes*2)throw failure();
  let text,reader;
  try{
   let payload;if(envelope.encoding==='gzip-parts-v1')payload=await decodeParts(envelope);
   else if(envelope.encoding==='json-v1'){
    text=envelope.data;
    if(new TextEncoder().encode(text).byteLength!==envelope.bytes)throw failure();
   }else{
    const raw=atob(envelope.data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];let length=0;
    while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>maxBytes||length>envelope.bytes)throw failure();parts.push(decoder.decode(part.value,{stream:true}));}
    parts.push(decoder.decode());if(length!==envelope.bytes)throw failure();text=parts.join('');
   }
   if(!payload)payload=JSON.parse(text);
   if(!object(payload)||payload.schema!==1||payload.stage!==stage||payload.from!==envelope.from||payload.to!==envelope.to||payload.baselineKey!==envelope.baselineKey)throw failure();
   return {payload,bytes:envelope.bytes};
  }catch(error){if(error.code==='TIMETABLE_BATCH_INVALID')throw error;throw failure('The compressed timetable could not be restored.','TIMETABLE_BATCH_TRANSPORT');}
  finally{if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
 }
 async function baselineStage(payload,assertActive,reusable=new Map(),trusted=false){
  if(!Number.isSafeInteger(payload.registerRevision)||payload.registerRevision<0||!Array.isArray(payload.entries)||!Array.isArray(payload.models)||!Array.isArray(payload.dates)||payload.entries.length>31||payload.models.length!==payload.entries.length||payload.dates.length!==31)throw failure();
  const entries=new Map(),models=new Map(),days=new Map();
  for(const entry of payload.entries){if(!object(entry)||typeof entry.id!=='string'||!entry.id||entries.has(entry.id)||!date(entry.from)||!date(entry.to)||entry.from>entry.to||entry.pruned)throw failure();entries.set(entry.id,entry);}
  for(const row of payload.models){if(models.size)await new Promise(resolve=>setTimeout(resolve,0));assertActive();if(!object(row)||!entries.has(row.id)||models.has(row.id)||!object(row.model))throw failure();let model=reusable.get(payload.modelKeys?.[row.id]||row.contentKey);if(!model)try{model=trusted&&row.model.layoutMode&&row.model.timing?row.model:GSISRoster.validate(row.model);}catch{throw failure();}models.set(row.id,freeze(model));}
  for(let i=0;i<31;i++){
   const row=payload.dates[i],expected=new Date(Date.parse(payload.from)+i*86400000).toISOString().slice(0,10);
   if(!object(row)||row.date!==expected||days.has(row.date)||row.baselineId!==null&&!entries.has(row.baselineId))throw failure();
   const entry=entries.get(row.baselineId);if((GSISRoster.active(payload.entries,row.date)?.id||null)!==row.baselineId)throw failure();
   days.set(row.date,entry?freeze({entry:freeze(entry),model:models.get(entry.id),registerRevision:payload.registerRevision}):null);
  }
  if([...entries.keys()].some(id=>!payload.dates.some(row=>row.baselineId===id)))throw failure();
  // Retain only the validated model objects, not a second raw decoded copy.
  payload={...payload,models:payload.models.map(row=>({id:row.id,model:models.get(row.id)}))};
  return {payload:freeze(payload),days};
 }
 const nativePlan=plan=>plan?.schema===1&&Array.isArray(plan.tiles)&&Array.isArray(plan.baseline?.tiles)&&Array.isArray(plan.periods)&&Array.isArray(plan.teachers)&&Array.isArray(plan.classes);
 const independentPlan=row=>nativePlan(row?.plan)&&(!row.confirmedPlan||nativePlan(row.confirmedPlan));
 const planId=plan=>plan.id||'stapler:'+plan.date;
 function suspendedStage(payload,baseline,canReadDrafts){
  if(payload.baselineKey!==baseline.payload.baselineKey||!Number.isSafeInteger(payload.operationsRevision)||payload.operationsRevision<0||!Array.isArray(payload.plans)||payload.plans.length>31||!object(payload.datesView)||!Array.isArray(payload.datesView.dates)||payload.datesView.dates.length>31)throw failure();
  const plans=new Map(),listed=new Set(),inWindow=d=>date(d)&&d>=payload.from&&d<=payload.to;
  for(const row of payload.plans){
   if(!object(row)||!inWindow(row.date)||plans.has(row.date)||!['draft','confirmed'].includes(row.viewMode)||row.viewMode==='draft'&&!canReadDrafts||!Number.isSafeInteger(row.revision)||row.revision<1||typeof row.baselineId!=='string'||!row.baselineId||!object(row.plan)||row.plan.date!==row.date||row.plan.baselineId!==row.baselineId)throw failure();
   const active=baseline.days.get(row.date);
   if(!independentPlan(row)&&row.baselineChanged!==true&&active?.entry.id!==row.baselineId)throw failure();
   if(row.confirmedPlan!=null&&(!object(row.confirmedPlan)||row.confirmedPlan.date!==row.date||row.confirmedPlan.baselineId!==row.baselineId||!Number.isSafeInteger(row.confirmedRevision)||row.confirmedRevision<1))throw failure();
   if(row.timetableDay!=null&&(!object(row.timetableDay)||row.timetableDay.date!==row.date||![row.baselineId,...(independentPlan(row)?[planId(row.confirmedPlan||row.plan)]:[])].includes(row.timetableDay.baselineId)||!['baseline','published','confirmed'].includes(row.timetableDay.source)||!Array.isArray(row.timetableDay.teachers)||!Array.isArray(row.timetableDay.periods)))throw failure();
   plans.set(row.date,independentPlan(row)?{...row,baselineChanged:false}:row);
  }
  for(const row of payload.datesView.dates){if(!object(row)||!inWindow(row.date)||listed.has(row.date))throw failure();listed.add(row.date);}
  return {payload:freeze({...payload,plans:[...plans.values()],datesView:{...payload.datesView,dates:payload.datesView.dates.map(row=>independentPlan(plans.get(row.date))?{...row,baselineChanged:false}:row)}}),plans};
 }
 // Timetable checks are independent of operational refreshes. Before :20 the
 // current check slot is the preceding hour; local calendar days are Singapore.
 function checkSlot(now=Date.now()){
  const shifted=new Date(now+8*3600000),day=shifted.toISOString().slice(0,10);
  const slot=Math.floor((now-20*60000)/3600000);
  return {day,slot};
 }
 function create({api,scope,today,onBaseline=()=>{},onSuspended=()=>{},onStatus=()=>{},canReadDrafts=false}){
  const effectiveDays=new WeakMap(),reportDays=new WeakMap(),timetableStatuses=new WeakMap();
  let generation=0,identity=null,baseline=null,suspended=null,pending=null,complete=false,checkedAt=0,checkedDay="",restored=false,restoring=null;
  const allowsDrafts=()=>typeof canReadDrafts==='function'?canReadDrafts()===true:canReadDrafts===true;
  const current=()=>{const owner=typeof scope==='function'?scope():scope,from=typeof today==='function'?today():today;return owner&&date(from)?{owner,from,role:allowsDrafts(),key:JSON.stringify([owner,allowsDrafts()])}:null;};
  const store=()=>window.RosterBaselineCache;
  const reusableModels=()=>new Map((baseline?.payload.models||[]).map(row=>[baseline.payload.modelKeys?.[row.id]||row.contentKey,row.model]).filter(([key])=>key));
  function dayProjection(cache,key,d,build){
   const independent=independentPlan(key),source=independent?null:baseline?.days.get(d)||null,prior=cache.get(key);
   if(prior&&prior.source===source)return prior.value;
   const value=freeze(build(independent?planId(key.plan):source?.entry.id||null));cache.set(key,{source,value});return value;
  }
  function retainIndependentPlans(){if(!suspended)return;const plans=new Map([...suspended.plans].filter(([,row])=>independentPlan(row))),kept=new Set(plans.keys());suspended={...suspended,sourceKey:null,plans,payload:freeze({...suspended.payload,plans:[...plans.values()],planKeys:Object.fromEntries(Object.entries(suspended.payload.planKeys||{}).filter(([d])=>kept.has(d))),datesView:{...suspended.payload.datesView,dates:suspended.payload.datesView.dates.filter(row=>kept.has(row.date))}})};}
  function clear(){generation++;identity=null;baseline=null;suspended=null;pending=null;complete=false;checkedAt=0;checkedDay="";restored=false;restoring=null;}
  function check(){const value=current();if(identity&&value?.key!==identity.key)clear();if(identity&&value?.from!==identity.from){generation++;pending=null;complete=false;identity=value;}return value;}
  function isDue(now=Date.now()){const value=check(),last=checkSlot(checkedAt),slot=checkSlot(now);return !value||!complete||!checkedAt||checkedDay!==value.from||slot.slot>last.slot;}
  function invalidate(dates){
   check();generation++;pending=null;complete=false;checkedAt=0;
   if(!dates){baseline=null;suspended=null;restored=true;return;}
   if(suspended){const chosen=new Set(Array.isArray(dates)?dates:[dates]),plans=new Map([...suspended.plans].filter(([d])=>!chosen.has(d))),payload={...suspended.payload,plans:[...plans.values()],planKeys:Object.fromEntries(Object.entries(suspended.payload.planKeys||{}).filter(([d])=>!chosen.has(d))),datesView:{...suspended.payload.datesView,dates:suspended.payload.datesView.dates.filter(row=>!chosen.has(row.date))}};suspended={...suspended,sourceKey:null,plans,payload:freeze(payload)};}
  }
  function restoreLocal(){
   const owner=check();if(!owner)return Promise.resolve();if(restoring)return restoring;if(restored)return Promise.resolve();
   restored=true;identity=owner;const ticket=generation;
   const active=()=>{check();return ticket===generation&&identity?.key===owner.key&&identity?.from===owner.from;},assertActive=()=>{if(!active())throw Object.assign(failure(),{stale:true});};
   const task=(async()=>{
    let value;try{value=await store()?.getGeneration?.(owner.owner);}catch{}assertActive();
    if(!value||value.schema!==1||value.role!==owner.role||!value.baseline)return;
    try{
     const b=await baselineStage(value.baseline.payload,assertActive,new Map(),true);assertActive();
     const sp=value.suspended?suspendedStage(value.suspended.payload,b,allowsDrafts()):null;
     baseline={...b,bytes:value.baseline.bytes,sourceKey:value.baseline.sourceKey};suspended=sp?{...sp,bytes:value.suspended.bytes,sourceKey:value.suspended.sourceKey}:null;
     checkedAt=value.checkedAt||0;checkedDay=value.checkedDay||value.baseline.payload.from;complete=!!sp&&b.payload.from===owner.from;
     await onBaseline(baseline.payload);if(suspended)await onSuspended(suspended.payload);assertActive();try{onStatus({phase:'cached',from:owner.from,to:endDate(owner.from),checkedAt});}catch{}
    }catch(error){if(error.stale)throw error;try{await store()?.discardGeneration?.(owner.owner);}catch{}assertActive();baseline=null;suspended=null;complete=false;checkedAt=0;}
   })();restoring=task;const release=()=>{if(restoring===task)restoring=null;};task.then(release,release);return task;
  }
  function start({refresh=false}={}){
   const owner=check();if(!owner)return Promise.resolve({phase:'cancelled'});if(pending)return pending;
   if(complete&&!refresh&&!isDue())return Promise.resolve({phase:'ready'});
   identity=owner;const ticket=generation;
   const active=()=>{check();return ticket===generation&&identity?.key===owner.key&&identity?.from===owner.from;};
   const assertActive=()=>{if(!active())throw Object.assign(failure(),{stale:true});};
   const status=(phase,error)=>{if(active())try{onStatus({phase,...(error?{error,message:error.message}:{}),from:owner.from,to:endDate(owner.from),checkedAt});}catch{}};
   const request=async(stage,skipCache=false)=>{
    const prior=skipCache?null:stage==='baseline'?baseline:suspended;
    const input={operation:'timetableBatch',stage,encoding:supportsParts()?'gzip-parts-v1':supportsGzip()?'gzip-base64-v1':'json-v1',
     ...(stage==='suspended'?{baselineKey:baseline.payload.baselineKey,baselineSourceKey:baseline.sourceKey}:{}),
     ...(hash.test(prior?.sourceKey||'')&&prior.payload.from===owner.from?{knownSourceKey:prior.sourceKey}:{}),
     ...(stage==='baseline'&&object(prior?.payload.modelKeys)?{knownModelKeys:prior.payload.modelKeys}:{}),
     ...(stage==='suspended'&&object(prior?.payload.planKeys)?{knownPlanKeys:prior.payload.planKeys}:{})};
    const read=async()=>{
     assertActive();const value=await api('operations',input);assertActive();
     if(value?.unchanged===true){
      if(!prior||value.schema!==1||value.stage!==stage||value.from!==owner.from||value.to!==endDate(owner.from)||value.baselineKey!==prior.payload.baselineKey||value.sourceKey!==prior.sourceKey)throw failure();
      return {next:prior,unchanged:true};
     }
     const decoded=await decode(value,stage,owner.from);assertActive();let payload=decoded.payload;
     if(payload.delta===true){
      if(!prior)throw failure();
      if(stage==='baseline'){
       if(!object(payload.modelKeys))throw failure();
       const models=new Map((prior.payload.models||[]).map(row=>[row.id,row]));for(const row of payload.models||[])models.set(row.id,row);
       payload={...payload,models:(payload.entries||[]).map(entry=>{const row=models.get(entry.id),key=payload.modelKeys[entry.id];if(!row||!hash.test(key||'')||(row.contentKey||prior.payload.modelKeys?.[row.id])!==key)throw failure();return row;})};
      }else{
       if(!object(payload.planKeys)||!Array.isArray(payload.removedDates)||payload.removedDates.some(d=>!date(d)))throw failure();
       const supplied=new Set((payload.plans||[]).map(row=>row.date));
       if(Object.entries(payload.planKeys).some(([d,key])=>prior.payload.planKeys?.[d]!==key&&!supplied.has(d)))throw failure('The timetable update was incomplete. Reloading its current contents.','TIMETABLE_BATCH_DELTA_INVALID');
       const plans=new Map((prior.payload.plans||[]).map(row=>[row.date,row]));for(const d of payload.removedDates)plans.delete(d);for(const row of payload.plans||[])plans.set(row.date,row);
       payload={...payload,plans:[...plans.values()].filter(row=>row.date>=owner.from&&row.date<=endDate(owner.from)&&Object.hasOwn(payload.planKeys,row.date)).sort((a,b)=>a.date.localeCompare(b.date))};
       if(payload.plans.some(row=>!hash.test(payload.planKeys[row.date]||''))||Object.keys(payload.planKeys).some(d=>!payload.plans.some(row=>row.date===d)))throw failure();
      }
      delete payload.delta;delete payload.removedDates;
     }
     const next=stage==='baseline'?await baselineStage(payload,assertActive,reusableModels()):suspendedStage(payload,baseline,allowsDrafts());
     if(stage==='suspended')for(const row of next.plans.values())if(!independentPlan(row)&&row.baselineContentKey&&next.payload.planKeys&&row.baselineChanged!==true&&row.baselineContentKey!==baseline.payload.modelKeys?.[row.baselineId])throw failure();
     return {next:{...next,bytes:decoded.bytes,sourceKey:value.sourceKey},unchanged:false};
    };
    try{return await read();}catch(error){if(error.code==='TIMETABLE_BATCH_DELTA_INVALID'&&!skipCache)return request(stage,true);if(input.encoding==='gzip-parts-v1'&&error.status===400){input.encoding='gzip-base64-v1';try{return await read();}catch(fallback){error=fallback;}}if(error.code!=='TIMETABLE_BATCH_TRANSPORT'||input.encoding==='json-v1')throw error;input.encoding='json-v1';return read();}
   };
   let predecessor;
   const persist=async(changed)=>{
    if(!active())return;
    if(changed&&store()?.commitGeneration){const saved=await store().commitGeneration(owner.owner,{schema:1,role:owner.role,checkedAt,checkedDay,baseline:{payload:baseline.payload,bytes:baseline.bytes,sourceKey:baseline.sourceKey},suspended:suspended?{payload:suspended.payload,bytes:suspended.bytes,sourceKey:suspended.sourceKey}:null},predecessor);if(saved)store()?.pruneContents?.(owner.owner)?.catch(()=>{});}
    else await store()?.markChecked?.(owner.owner,checkedAt,{role:owner.role,from:owner.from,baselineSourceKey:baseline.sourceKey,suspendedSourceKey:suspended?.sourceKey});
   };
   const work=async()=>{
    try{
     await restoreLocal();assertActive();if(complete&&!refresh&&!isDue()){status('ready');return {phase:'ready',cached:true};}
     try{predecessor=await store()?.getGenerationInfo?.(owner.owner);}catch{}assertActive();
     for(let attempt=0;attempt<2;attempt++){
      try{
       status('baseline');const first=await request('baseline');assertActive();
       const oldBaseline=baseline;baseline=first.next;
       if(suspended&&!first.unchanged){
        // A date mapping can change without changing the set of model keys.
        // Fence only incompatible dates before exposing the new baseline stage.
        const removed=new Set([...suspended.plans.values()].filter(row=>!independentPlan(row)&&!row.baselineChanged&&(baseline.days.get(row.date)?.entry.id!==row.baselineId||row.baselineContentKey&&row.baselineContentKey!==baseline.payload.modelKeys?.[row.baselineId])).map(row=>row.date));
        if(removed.size){const plans=new Map([...suspended.plans].filter(([d])=>!removed.has(d)));suspended={...suspended,sourceKey:null,plans,payload:freeze({...suspended.payload,plans:[...plans.values()],planKeys:Object.fromEntries(Object.entries(suspended.payload.planKeys||{}).filter(([d])=>!removed.has(d))),datesView:{...suspended.payload.datesView,dates:suspended.payload.datesView.dates.filter(row=>!removed.has(row.date))}})};}
       }

       if(!first.unchanged){await onBaseline(baseline.payload);assertActive();}
       status('suspended');let second;
       try{second=await request('suspended');}catch(error){if(oldBaseline&&oldBaseline.payload.baselineKey!==baseline.payload.baselineKey)retainIndependentPlans();throw error;}
       assertActive();suspended=second.next;checkedAt=Date.now();checkedDay=owner.from;complete=true;
       if(!second.unchanged){await onSuspended(suspended.payload);assertActive();}
       try{await persist(!first.unchanged||!second.unchanged);}catch{}assertActive();status('ready');return {phase:'ready'};
      }catch(error){if(error.stale)throw error;if(attempt===0&&error.status===409&&error.code==='TIMETABLE_BATCH_CHANGED'){baseline=null;retainIndependentPlans();continue;}throw error;}
     }
    }catch(error){if(error.stale||!active())return {phase:'cancelled'};complete=false;status('failed',error);return {phase:'failed',error};}
   };
   // Browser locks coalesce tab checks only; server commits use server guards.
   const task=typeof navigator!=='undefined'&&navigator.locks?.request?navigator.locks.request('gsis-timetable:'+owner.key,async()=>{if(!refresh&&restored){const stamp=await store()?.getGenerationInfo?.(owner.owner);if(stamp?.checkedAt>checkedAt&&stamp.role===owner.role&&stamp.from===owner.from){if(stamp.baselineSourceKey===baseline?.sourceKey&&stamp.suspendedSourceKey===suspended?.sourceKey){checkedAt=stamp.checkedAt;checkedDay=owner.from;}else restored=false;}}return work();}):work();
   pending=task;const release=()=>{if(pending===task)pending=null;};task.then(release,release);return task;
  }
  return {
   start,clear,invalidate,isDue,restore:restoreLocal,
   getBaseline(d){const owner=check();return owner&&d>=owner.from&&d<=endDate(owner.from)?baseline?.days.get(d)||null:null;},
   getPlan(d){const owner=check();if(!owner||d<owner.from||d>endDate(owner.from))return null;const row=suspended?.plans.get(d);return row?copy(row):null;},
   // View-only consumers need a small immutable projection. Planner editing
   // still receives its own deep copy through getPlan().
   getTimetableStatus(d){const owner=check();if(!owner||d<owner.from||d>endDate(owner.from))return null;const row=suspended?.plans.get(d);if(!row)return null;return dayProjection(timetableStatuses,row,d,id=>({date:row.date,baselineId:id,staplerBaselineId:row.baselineId,baselineChanged:row.baselineChanged===true,allocationRevision:(row.confirmedPlan||['published','confirmed'].includes(row.timetableDay?.source))?row.revision:0,timetableDay:row.timetableDay||null}));},
   getEffectiveDay(d){const owner=check();if(!owner||d<owner.from||d>endDate(owner.from))return null;const row=suspended?.plans.get(d),plan=row?.confirmedPlan||(row?.viewMode==='confirmed'?row.plan:null);if(!plan||typeof GSISRosterStapler==='undefined')return null;try{return dayProjection(effectiveDays,row,d,()=>({...GSISRosterStapler.effectiveDay(plan),staplerBaselineId:row.baselineId,staplerRevision:row.confirmedRevision||row.revision}));}catch{return null;}},
   getReportDay(d){const owner=check();if(!owner||d<owner.from||d>endDate(owner.from))return null;const row=suspended?.plans.get(d);if(!row||!row.confirmedPlan&&!['published','confirmed'].includes(row.timetableDay?.source)||row.viewMode!=='draft'&&row.confirmedRevision!==row.revision||typeof GSISRosterStapler==='undefined')return null;try{return dayProjection(reportDays,row,d,()=>({...GSISRosterStapler.effectiveDay(row.plan),staplerBaselineId:row.baselineId,staplerRevision:row.revision}));}catch{return null;}},
   getDatesView(){check();return suspended?copy(suspended.payload.datesView):null;},
   snapshot(){check();return {phase:complete?'ready':baseline?'baseline':'empty',from:identity?.from||null,to:identity?endDate(identity.from):null,baselineKey:baseline?.payload.baselineKey||null,registerRevision:baseline?.payload.registerRevision??null,operationsRevision:suspended?.payload.operationsRevision??null,baselineBytes:baseline?.bytes||0,suspendedBytes:suspended?.bytes||0,checkedAt};}
  };
 }
 window.RosterTimetablePreload={create,checkSlot};
})();
