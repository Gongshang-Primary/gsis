/* Prepared timetable snapshots only. Each read still verifies authority and returns fresh operational records. */
(()=>{
 'use strict';
 const encoding='gzip-base64-v1',maxSnapshotBytes=4*1024*1024,maxCacheBytes=8*1024*1024,maxEntries=24;
 const snapshots=new Map(),queries=new Map(),decodes=new Map();let generation=0,cacheBytes=0;
 const copy=value=>JSON.parse(JSON.stringify(value));
 const eligible=(route,input)=>route==='profile'&&input.view==='report'||route==='operations'&&input.operation==='read'&&input.compact===true&&['report','entry'].includes(input.view);
 const queryKey=(scope,input)=>JSON.stringify([scope,input.date||'',input.view||'report',input.staffId||'']);
 const snapshotKey=(scope,key)=>scope+'|'+key;
 const failure=()=>Object.assign(Error('The timetable snapshot could not be restored. Reloading current records is required.'),{code:'TIMETABLE_SNAPSHOT'});
 function supported(){try{return typeof DecompressionStream==='function'&&typeof Blob==='function'&&typeof TextDecoder==='function'&&!!new DecompressionStream('gzip');}catch{return false;}}
 function prepare(scope,route,input){
  if(!eligible(route,input)||!supported())return input;
  const known=scope&&queries.get(queryKey(scope,input)),entry=known&&snapshots.get(snapshotKey(scope,known));
  return {...input,timetableTransport:encoding,...(entry?{timetableSnapshotKey:known}:{})};
 }
 function remove(key){
  const entry=snapshots.get(key);if(!entry)return;cacheBytes-=entry.bytes;snapshots.delete(key);
  for(const [query,value] of queries)if(snapshotKey(entry.scope,value)===key&&JSON.parse(query)[0]===entry.scope)queries.delete(query);
 }
 function clear(dates){
  if(!dates){generation++;snapshots.clear();queries.clear();decodes.clear();cacheBytes=0;return;}
  const chosen=new Set(Array.isArray(dates)?dates:[dates]);for(const [key,entry] of snapshots)if(chosen.has(entry.date))remove(key);
  for(const [key,pending] of decodes)if(chosen.has(pending.date)){pending.invalidated=true;decodes.delete(key);}
 }
 function forget(scope,route,input){const key=queries.get(queryKey(scope,input));if(key)remove(snapshotKey(scope,key));}
 async function decode(snapshot){
  if(typeof snapshot.data!=='string'||snapshot.data.length>maxSnapshotBytes*2||!snapshot.data.length)throw failure();
  let reader;
  try{
   const binary=atob(snapshot.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
   reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
   const decoder=new TextDecoder('utf-8',{fatal:true}),text=[];let length=0;
   while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>maxSnapshotBytes||length>snapshot.bytes)throw failure();text.push(decoder.decode(part.value,{stream:true}));}
   text.push(decoder.decode());if(length!==snapshot.bytes)throw failure();
   const value=JSON.parse(text.join(''));
   if(!value||typeof value!=='object'||Array.isArray(value)||!['timetable','baselineTimetable'].every(k=>value[k]&&typeof value[k]==='object'&&!Array.isArray(value[k])&&Array.isArray(value[k].teachers)))throw failure();
   return {timetable:value.timetable,baselineTimetable:value.baselineTimetable};
  }catch{throw failure();}finally{if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
 }
 async function hydrate(scope,route,input,data){
  const response=route==='profile'?data?.reportData:data,snapshot=response?.timetableSnapshot;
  if(!snapshot)return data;
  if(!scope||!eligible(route,input)||snapshot.schema!==1||snapshot.encoding!==encoding||!/^[a-f0-9]{64}$/.test(snapshot.key||'')||!Number.isSafeInteger(snapshot.bytes)||snapshot.bytes<2||snapshot.bytes>maxSnapshotBytes)throw failure();
  const key=snapshotKey(scope,snapshot.key),ticket=generation;
  let entry=snapshots.get(key);
  if(entry&&entry.bytes!==snapshot.bytes)throw failure();
  if(snapshot.unchanged===true){if(!entry||snapshot.data!==undefined)throw failure();}
  else{
   let pending=decodes.get(key);if(pending&&pending.bytes!==snapshot.bytes)throw failure();if(!pending){pending={date:response.date||input.date,bytes:snapshot.bytes,promise:decode(snapshot)};decodes.set(key,pending);}let value;
   try{value=await pending.promise;}finally{if(decodes.get(key)===pending)decodes.delete(key);}
   if(ticket!==generation)throw Object.assign(failure(),{stale:true});
   if(pending.invalidated)throw failure();
   entry=snapshots.get(key);if(entry&&entry.bytes!==snapshot.bytes)throw failure();
   if(!entry){entry={scope,date:response.date||input.date,bytes:snapshot.bytes,value};snapshots.set(key,entry);cacheBytes+=entry.bytes;
    while(snapshots.size>maxEntries||cacheBytes>maxCacheBytes)remove(snapshots.keys().next().value);
   }
  }
  snapshots.delete(key);snapshots.set(key,entry);queries.set(queryKey(scope,input),snapshot.key);
  if(route==='profile'&&data.user?.staffId)queries.set(queryKey(scope,{...input,staffId:data.user.staffId}),snapshot.key);
  const restored={...response,...copy(entry.value)};delete restored.timetableSnapshot;
  return route==='profile'?{...data,reportData:restored}:restored;
 }
 // A local preview combines only independently verified, matching sources.
 // Operational records and save authority remain with the normal server read.
 function project({date,baseline,ready,status,effectiveDay,calendar,calendarCheckedAt,sourceVerifiedUntil,form}){
  const model=baseline?.model,id=baseline?.entry?.id||null,now=Date.now(),activeRevision=status?.allocationRevision||0;
  if((!id||!model)&&!activeRevision||!ready||form?.schema!==1||!Array.isArray(form.timetablePeople)||!Array.isArray(form.nameBridges)||calendar?.date!==date||calendar.available!==true||typeof calendar.schoolDay!=='boolean'||!Number.isFinite(calendarCheckedAt)||calendarCheckedAt>now||now-calendarCheckedAt>=300000||!activeRevision&&(status?.baselineChanged||status&&status.baselineId!==id))return null;
  const parity=model?.layoutMode==='single-week'?'single':calendar.parity,week=model?.[parity],weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
  if((!week||!Array.isArray(week.blocks))&&!activeRevision||typeof GSISRosterOperations==='undefined')return null;
  if(activeRevision&&(!effectiveDay||effectiveDay.id!==status.baselineId||effectiveDay.date!==date||effectiveDay.staplerRevision!==activeRevision))return null;
  const periods=Array.from({length:model?model.maxPeriod+1:0},(_,period)=>{const startMinutes=model.timing.startMinutes+period*model.timing.periodMinutes,endMinutes=startMinutes+model.timing.periodMinutes,fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');return {period,start:fmt(startMinutes),end:fmt(endMinutes),startMinutes,endMinutes};});
  const matched=GSISRosterOperations.matchTimetableNames({nameBridges:copy(form.nameBridges),nameBridgesSeeded:true},form.timetablePeople,week?.blocks||[]),schoolDay=calendar.schoolDay&&weekday<5;
  const teachers=matched.map(({person,timetableName,index})=>({staffId:person.id,name:person.name,timetableName,cells:weekday<5?copy(week.blocks[index].cells.slice(weekday*week.perDay,(weekday+1)*week.perDay)):[]}));
  const baselineTimetable={id,parity,perDay:periods.length,schoolDay,staplerRevision:0,teachers},timetable=activeRevision?{...baselineTimetable,...copy(effectiveDay),staplerRevision:activeRevision}:copy(baselineTimetable);
  return {date,sourceKey:JSON.stringify([date,timetable.id,activeRevision,timetable.parity,timetable.schoolDay,matched.map(({person,timetableName})=>[person.id,person.name,timetableName]),form.noReliefSubjects||[]]),reportVerifiedUntil:Math.min(calendarCheckedAt+300000,Number.isFinite(sourceVerifiedUntil)?sourceVerifiedUntil:Infinity),periods:copy(activeRevision?effectiveDay.periods:periods),timetable,baselineTimetable,noReliefSubjects:copy(form.noReliefSubjects||[])};
 }
 window.RosterReportCache={prepare,hydrate,forget,clear,project};
})();
