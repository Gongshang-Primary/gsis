/* Cold machine output stays in append-only monthly files. The primary commit
 * follows verified archive readback, so an interrupted run retains duplicates,
 * never a stub whose original record has not been saved. */
function rosterColdArchiveRef_(ref){
 if(!ref||typeof ref!=='object'||Array.isArray(ref)||!/^20\d\d-(0[1-9]|1[0-2])$/.test(ref.month)||!GSISRosterOperations.COLD_COLLECTIONS.includes(ref.collection)||typeof ref.id!=='string'||!ref.id||ref.id.length>300||typeof ref.digest!=='string'||!/^[a-f0-9]{64}$/.test(ref.digest))error_(400,'Choose a valid archived record.');
 return ref;
}
function rosterColdArchiveRead_(month,state){
 if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month))error_(400,'Choose a valid archive month.');
 const id=state.coldArchive?.months?.[month]?.fileId||rosterFindFile_(ROSTER_DATA,'Roster archive '+month+'.json');
 if(!id)return {id:null,value:{schema:1,month,items:[]}};
 let value;try{value=JSON.parse(rosterReadFile_(id));if(value?.schema!==1||value.month!==month||!Array.isArray(value.items)||value.digest!==rosterOperationsPlanDigest_(JSON.stringify(value.items)))throw Error('digest');}
 catch(error){error_(503,'The monthly Roster archive could not be verified. No records were removed.');}
 return {id,value};
}
function rosterColdArchiveItem_(reference,state){
 const ref=rosterColdArchiveRef_(reference),archive=rosterColdArchiveRead_(ref.month,state||rosterOperationsState_(true));
 return rosterColdArchiveEntry_(archive.value.items.find(row=>row.collection===ref.collection&&row.id===ref.id&&row.digest===ref.digest),ref);
}
function rosterColdArchiveEntry_(entry,ref){
 /* Each returned item is bound to the verified monthly envelope and its original bytes. */
 if(!entry||typeof entry.json!=='string'||rosterOperationsPlanDigest_(entry.json)!==entry.digest)error_(503,'The original archived Roster record could not be verified.');
 let item;try{item=JSON.parse(entry.json);}catch(error){error_(503,'The original archived Roster record could not be read.');}
 if(!item||typeof item!=='object'||Array.isArray(item)||item.id!==undefined&&item.id!==ref.id)error_(503,'The archived Roster record identity does not match.');
 return item;
}
function rosterColdReceiptsUnpack_(state){
 for(const row of state.receipts||[]){if(!row.archiveRef||Object.prototype.hasOwnProperty.call(row,'result'))continue;let original;
  // JSON serialisation and ordinary state reads retain the stub. Only a matched
  // request replay reads its old result from the verified archive.
  Object.defineProperty(row,'result',{configurable:true,enumerable:false,get(){if(!original)original=rosterColdArchiveItem_(row.archiveRef,state);return original.result;}});
 }
 return state;
}
function rosterColdArchiveDateView_(state,p){
 const date=p.date;
 if(typeof date!=='string'||!/^20\d\d-\d\d-\d\d$/.test(date))return state;
 const rows=state.outbox.filter(row=>row.date===date&&row.archiveRef);if(!rows.length)return state;
 const months=new Map(),originals=new Map();
 for(const row of rows){const ref=rosterColdArchiveRef_(row.archiveRef);let entries=months.get(ref.month);if(!entries){entries=rosterColdArchiveRead_(ref.month,state).value.items;months.set(ref.month,entries);}const original=rosterColdArchiveEntry_(entries.find(item=>item.collection===ref.collection&&item.id===ref.id&&item.digest===ref.digest),ref),current={...original,...row};
  // Archived bytes supply the old message body. Live compact fields supply the
  // latest delivery outcome, including cleared errors after a late callback.
  for(const key of ['status','completedAt','deliveryStatus','deliveryAt','readAt','transportUpdatedAt','error','failureCode'])if(!(key in row))delete current[key];
  delete current.providerError;originals.set(row.id,current);}
 return {...state,outbox:state.outbox.map(row=>originals.get(row.id)||row)};
}
function rosterColdArchiveSummary_(state){
 return {months:Object.entries(state.coldArchive?.months||{}).sort(([a],[b])=>b.localeCompare(a)).map(([month,row])=>({month,count:row.count,characters:row.characters})),lastRun:state.coldArchive?.lastRun||null};
}
function rosterColdArchiveWrite_(month,items,state){
 const archive=rosterColdArchiveRead_(month,state),rows=archive.value.items.slice(),keys=new Set(rows.map(row=>JSON.stringify([row.collection,row.id,row.digest])));
 for(const item of items){const digest=rosterOperationsPlanDigest_(item.json),key=JSON.stringify([item.collection,item.id,digest]);item.stub.archiveRef={...item.stub.archiveRef,digest};if(keys.has(key))continue;keys.add(key);rows.push({collection:item.collection,id:item.id,digest,json:item.json});}
 const value={schema:1,month,items:rows,digest:rosterOperationsPlanDigest_(JSON.stringify(rows))},json=JSON.stringify(value);
 const id=archive.id?(rosterDriveRequest_('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(archive.id)+'?uploadType=media&supportsAllDrives=true&fields=id',{method:'patch',contentType:'application/json; charset=UTF-8',payload:json},'roster-cold-archive'),archive.id):rosterCreateFile_(ROSTER_DATA,'Roster archive '+month+'.json',Utilities.newBlob(json,'application/json; charset=UTF-8'));
 const observed=rosterReadFile_(id);if(rosterOperationsPlanDigest_(observed)!==rosterOperationsPlanDigest_(json))error_(503,'The monthly Roster archive write could not be verified. No records were removed.');
 return {fileId:id,count:rows.length,characters:rows.reduce((sum,row)=>sum+row.json.length,0),digest:value.digest};
}
function rosterColdArchiveRun_(options){
 const now=options.now??Date.now(),at=new Date(now).toISOString(),today=new Date(now+8*3600000).toISOString().slice(0,10),minute=new Date(now+8*3600000).getUTCHours()*60+new Date(now+8*3600000).getUTCMinutes();
 if(!options.manual&&props_().getProperty('ROSTER_COLD_ARCHIVE_NIGHT')===today)return {skipped:true,reason:'already-checked'};
 if(!options.manual&&(minute<960||minute>=1440))return {skipped:true,reason:'outside-maintenance-hours'};
 const lock=LockService.getScriptLock();if(!deployLock_(lock,1000))return {busy:true};let deliveryLock=null,deliveryHeld=false;
 try{
  if(typeof rosterNotificationState_==='function'){
   deliveryLock=LockService.getUserLock();if(!deliveryLock.tryLock(1000))return {busy:true};deliveryHeld=true;
  }
  let state=rosterOperationsState_(true);
  if(typeof rosterNotificationState_==='function'){const delivery=rosterNotificationState_();if(delivery)state=rosterNotificationOverlayWith_(state,delivery);}
  if(!options.manual&&state.coldArchive?.lastNight===today)return {skipped:true,reason:'already-checked',archive:rosterColdArchiveSummary_(state)};
  const receipt=options.requestId&&state.receipts.find(row=>row.id===options.requestId);
  if(receipt){if(receipt.actor!==options.actor||receipt.digest!==(options.digest||'cold-archive-v1'))error_(409,'This request ID was used for a different save.');return {...receipt.result,replayed:true};}
  const selected=GSISRosterOperations.archiveColdSelection(state,{today,now,maxCharacters:2000000}),months={...(state.coldArchive?.months||{})};
  for(const month of [...new Set(selected.items.map(item=>item.month))].sort())months[month]=rosterColdArchiveWrite_(month,selected.items.filter(item=>item.month===month),state);
  const next=GSISRosterOperations.archiveApplySelection(state,selected);
  next.coldArchive={schema:1,months,lastNight:options.manual?state.coldArchive?.lastNight:today,lastRun:{at,moved:selected.items.length,characters:selected.characters}};
  next.revision++;
  const result={revision:next.revision,archive:rosterColdArchiveSummary_(next)};
  if(options.requestId)next.receipts.push({id:options.requestId,actor:options.actor,digest:options.digest||'cold-archive-v1',at,revision:next.revision,result});
  rosterOperationsCommit_(next);if(!options.manual)try{props_().setProperty('ROSTER_COLD_ARCHIVE_NIGHT',today);}catch(ignore){}return result;
 }finally{if(deliveryHeld)deliveryLock.releaseLock();deployUnlock_(lock);}
}
function rosterColdArchiveDispatch_(req,c){
 const user=rosterOperationsAuthority_(c,req.identity);if(!user.admin)error_(403,'Admin access is required to open or move archived Roster records.');
 const p=req.input||{};
 if(p.operation==='archiveColdOutput'){
  if(typeof p.requestId!=='string'||!/^[\w-]{36}$/.test(p.requestId))error_(400,'A save request ID is required.');
  const result=rosterColdArchiveRun_({manual:true,actor:req.identity.email,requestId:p.requestId,digest:rosterOperationsCommandDigest_(p)});if(result.busy)error_(503,'Another Roster save is finishing. Retry the same archive request.');return result;
 }
 const state=rosterOperationsState_(true);
 if(p.operation==='archivedItem')return {archiveRef:rosterColdArchiveRef_(p.archiveRef),item:rosterColdArchiveItem_(p.archiveRef,state)};
 const archive=rosterColdArchiveRead_(p.month,state),offset=p.offset===undefined?0:p.offset,limit=p.limit===undefined?50:p.limit;
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>50)error_(400,'Choose a valid archive page.');
 const items=archive.value.items.slice(offset,offset+limit).map(row=>{const ref={month:p.month,collection:row.collection,id:row.id,digest:row.digest},item=rosterColdArchiveEntry_(row,ref);return {id:row.id,collection:row.collection,date:item.date||String(item.at||item.createdAt||'').slice(0,10),kind:item.kind||'',operation:item.operation||'',status:item.status||'',archiveRef:ref};});
 return {month:p.month,items,nextOffset:offset+limit<archive.value.items.length?offset+limit:null};
}
