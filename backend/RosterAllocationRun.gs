/* Small allocator control records. Every mutation uses the operational writer
   lock; computation never holds it. Durable command receipts own completion. */
function rosterAllocationRunKey_(date){return 'ROSTER_ALLOCATION_RUN:'+GSISRosterOperations.date(date);}
function rosterAllocationRunRead_(date){const text=props_().getProperty(rosterAllocationRunKey_(date));if(!text)return null;try{const row=JSON.parse(text);if(row.schema!==1||row.date!==date||typeof row.id!=='string'||!Array.isArray(row.log))throw Error('shape');return row;}catch(_){error_(503,'Allocation status could not be read. Refresh before starting another run.');}}
function rosterAllocationRunExpired_(row){return Date.now()-Date.parse(row.trigger==='scheduled'?(row.leaseStartedAt||row.startedAt):row.updatedAt)>(row.trigger==='scheduled'?150000:10*60000);}
function rosterAllocationRunPublic_(row,state){
 if(!row)return null;let status=row.state;if(state&&rosterAllocationRunCancelled_(row,state))status='cancelled';else if(state&&rosterAllocationRunAccepted_(row,state))status='completed';
 else if(rosterAllocationRunExpired_(row)&&['running','cancelling','committing'].includes(status))status=status==='committing'?'uncertain':'abandoned';
 return {id:row.id,date:row.date,state:status,trigger:row.trigger,...(row.trigger==='scheduled'?{attempts:row.attempts||1,allocationStopped:row.state==='failed'&&(row.attempts>=2||row.slotStopped===true)}:{}),...(row.allocationMode?{allocationMode:row.allocationMode}:{}),requestId:row.trigger==='manual'?row.requestId:null,actorName:row.actorName,startedAt:row.startedAt,updatedAt:row.updatedAt,log:row.log,canCancel:['running','cancelling','yielded'].includes(status)};
}
function rosterAllocationRunReceipt_(row,state){return row.trigger==='scheduled'?state.scheduleReceipts?.[row.scheduleKey]:state.receipts?.find(r=>r.id===row.requestId&&r.actor===row.actor&&r.digest===row.digest);}
function rosterAllocationRunAccepted_(row,state){const receipt=rosterAllocationRunReceipt_(row,state);return !!receipt&&!receipt.cancelled&&(row.trigger!=='scheduled'||receipt.allocationStatus==='complete'||receipt.allocationStatus===undefined&&receipt.optimise!==false);}
function rosterAllocationRunCancelled_(row,state){return rosterAllocationRunReceipt_(row,state)?.cancelled===true;}
function rosterAllocationRunCancellation_(){throw Object.assign(Error('This allocation was cancelled. Start a new run to allocate again.'),{status:409,code:'ALLOCATION_CANCELLED'});}
function rosterAllocationRunWrite_(row,message){if(typeof rosterEdgeAssertLegacyWrite_==='function')rosterEdgeAssertLegacyWrite_();
 if(row.trigger==='scheduled'&&row.attempts){if(row.state==='failed'&&row.attempts>=2)message='Auto-allocation stopped after 2 attempts for '+row.scheduleKey.slice(-5)+'. Review the saved draft; SMC Auto-allocate remains available.';rosterScheduledAllocationRecord_(row);}
 const at=new Date().toISOString(),seq=(row.log.at(-1)?.seq||0)+1;row={...row,updatedAt:at,log:[...row.log,{seq,at,message:String(message).slice(0,180)}].slice(-12)};
 const json=JSON.stringify(row);if(json.length>7000)error_(503,'Allocation status is too large. Refresh before retrying.');props_().setProperty(rosterAllocationRunKey_(row.date),json);return row;
}
function rosterAllocationRunLocked_(work,wait=8000){const lock=LockService.getScriptLock();if(!deployLock_(lock,wait))throw Object.assign(Error('Another save is finishing. Retry this action.'),{status:503,code:'ALLOCATION_BUSY'});try{return work();}finally{deployUnlock_(lock);}}
// Separate dated attempt ledgers survive replacement of the visible run by an
// SMC command. A date has 32 scheduled slots; compact rows stay below 9 KB.
function rosterScheduledAllocationLedger_(date){
 const key='ROSTER_ALLOCATION_SLOTS:'+GSISRosterOperations.date(date),raw=props_().getProperty(key);if(!raw)return {schema:1,date,slots:{}};
 try{const value=JSON.parse(raw);if(value.schema!==1||value.date!==date||!value.slots||typeof value.slots!=='object'||Array.isArray(value.slots))throw Error('shape');for(const [slot,row] of Object.entries(value.slots))if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slot)||![1,2].includes(row.attempts)||!['running','committing','uncertain','failed','completed','stopped','yielded'].includes(row.state)||!Number.isFinite(row.started)||typeof row.fence!=='string')throw Error('row');return value;}catch(_){error_(503,'Scheduled allocation history could not be read. Ask Admin to review it before retrying.');}
}
function rosterScheduledAllocationSave_(ledger){
 if(typeof rosterEdgeAssertLegacyWrite_==='function')rosterEdgeAssertLegacyWrite_();
 const json=JSON.stringify(ledger);if(json.length>7500)error_(503,'Scheduled allocation history is full. Ask Admin to review unfinished slots.');props_().setProperty('ROSTER_ALLOCATION_SLOTS:'+ledger.date,json);
}
function rosterScheduledAllocationRecord_(run){
 const ledger=rosterScheduledAllocationLedger_(run.date),key=run.scheduleKey.slice(11),old=ledger.slots[key];if(!old||old.fence!==run.fence)return;
 const state=['cancelled','cancelling'].includes(run.state)||run.state==='failed'&&(run.attempts>=2||run.slotStopped===true)?'stopped':run.state;
 ledger.slots[key]={...old,state};rosterScheduledAllocationSave_(ledger);
}
function rosterScheduledAllocationGate_(slot){
 if(!slot.allocationKey)return {allocate:false};
 const row=rosterScheduledAllocationLedger_(slot.date).slots[slot.allocationKey.slice(11)];
 if(!row)return {allocate:slot.optimise};
 if(['completed','stopped'].includes(row.state))return {allocate:false,allocationSkipped:true,allocationStopped:row.state==='stopped'};
 if(row.state==='yielded')return {allocate:true,allocationPending:true};
 if(row.state==='failed'&&row.tick===slot.key.slice(11))return {allocate:false,allocationSkipped:true};
 if(['running','committing'].includes(row.state)&&Date.now()-row.started<=150000)return {allocate:false,allocationSkipped:true,allocationInProgress:true};
 return {allocate:true};
}
function rosterScheduledReceiptSource_(){
 const version=props_().getProperty('ROSTER_VERSION_HINT'),file=props_().getProperty('ROSTER_OPERATIONS_FILE');
 if(!version||!file||props_().getProperty('ROSTER_SCHEDULE_DIRTY'))throw Object.assign(Error('Scheduled receipt confirmation is waiting for a stable source.'),{status:409,code:'ALLOCATION_BUSY'});
 const source={version,file,state:rosterOperationsState_(true)};rosterScheduledReceiptSourceCheck_(source);return source;
}
function rosterScheduledReceiptSourceCheck_(source){
 if(!source||props_().getProperty('ROSTER_SCHEDULE_DIRTY')||source.version!==props_().getProperty('ROSTER_VERSION_HINT')||source.file!==props_().getProperty('ROSTER_OPERATIONS_FILE'))throw Object.assign(Error('Roster records changed while confirming the scheduled receipt.'),{status:409,code:'ALLOCATION_BUSY'});
}
function rosterScheduledAllocationRecover_(slot){
 const pending=row=>row?.trigger==='scheduled'&&(row.state==='yielded'&&row.scheduleKey!==slot.allocationKey||['running','cancelling','committing','uncertain'].includes(row.state)&&(row.state==='uncertain'||rosterAllocationRunExpired_(row)));
 const prior=rosterAllocationRunRead_(slot.date);if(!pending(prior))return;
 const source=rosterScheduledReceiptSource_(),token=JSON.stringify(prior);
 rosterAllocationRunLocked_(()=>{
  const row=rosterAllocationRunRead_(slot.date);if(!pending(row))return;
  if(JSON.stringify(row)!==token)throw Object.assign(Error('Scheduled allocation status changed during receipt confirmation.'),{status:409,code:'ALLOCATION_BUSY'});rosterScheduledReceiptSourceCheck_(source);const state=source.state;
  if(rosterAllocationRunAccepted_(row,state))rosterAllocationRunComplete_(row,state);
  else if(rosterAllocationRunCancelled_(row,state))rosterAllocationRunWrite_({...row,state:'cancelled'},'Cancelled scheduled allocation remains stopped.');
  else rosterAllocationRunWrite_({...row,state:'failed',slotStopped:row.scheduleKey!==slot.allocationKey},row.scheduleKey!==slot.allocationKey?'Auto-allocation stopped when its scheduled slot ended. SMC Auto-allocate remains available.':'The previous attempt ended without a saved allocation receipt.');
 },500);
}
// A small private work file retains useful preparation, never the full Roster.
function rosterScheduledWorkSave_(run,stage,payload){
 rosterAllocationRunCheck_(run);rosterScheduledAllocationBudget_(run,true);
 const body={schema:1,id:run.id,date:run.date,scheduleKey:run.scheduleKey,stage,payload},raw=JSON.stringify(body),compressed=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(raw,'application/json')).getBytes()),stored=JSON.stringify({schema:1,encoding:'gzip-base64-v1',data:compressed});
 if(stored.length>262144)throw Object.assign(Error('Scheduled preparation exceeds its bounded checkpoint size.'),{status:413,code:'ALLOCATION_PROGRESS_LIMIT'});
 const fileId=rosterCreateFile_(ROSTER_DATA,'Roster allocation '+run.id+' '+Utilities.getUuid()+'.json',Utilities.newBlob(stored,'application/json')),work={fileId,digest:rosterOperationsDigest_(body),stage,bytes:stored.length};
 rosterAllocationRunLocked_(()=>rosterAllocationRunWrite_({...rosterAllocationRunCheck_(run),state:'yielded',work},'Preparation saved; the next scheduler tick resumes this step.'),500);
 return {skipped:true,allocationYielded:true,pending:true,code:'ALLOCATION_YIELDED',phase:stage};
}
function rosterScheduledWorkRead_(run){
 if(!run.work)return null;const stored=rosterReadFile_(run.work.fileId);if(stored.length!==run.work.bytes||stored.length>262144)error_(503,'Scheduled preparation checkpoint length changed.');
 const envelope=JSON.parse(stored);if(envelope.schema!==1||envelope.encoding!=='gzip-base64-v1')error_(503,'Scheduled preparation checkpoint is invalid.');
 const body=JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(envelope.data),'application/x-gzip')).getDataAsString('UTF-8'));
 if(body.schema!==1||body.id!==run.id||body.date!==run.date||body.scheduleKey!==run.scheduleKey||body.stage!==run.work.stage||rosterOperationsDigest_(body)!==run.work.digest)error_(503,'Scheduled preparation checkpoint failed verification.');return body;
}
function rosterScheduledPreparedWork_(base,next,ctx,result,dependencies,references,contacts,stamp,domainChanged){
 const before={outbox:[]},after={outbox:[]},appends={},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),keyed=rows=>rows.every(row=>row&&typeof row.id==='string')&&new Set(rows.map(row=>row.id)).size===rows.length;
 for(const name of new Set([...Object.keys(base),...Object.keys(next)])){
  if(name==='revision'||same(base[name],next[name]))continue;const a=base[name],b=next[name];
  if(Array.isArray(a)&&Array.isArray(b)&&b.length>=a.length&&a.every((row,i)=>same(row,b[i]))){appends[name]=b.slice(a.length);continue;}
  if(Array.isArray(a)&&Array.isArray(b)&&keyed(a)&&keyed(b)){const old=new Map(a.map(row=>[row.id,row])),fresh=new Map(b.map(row=>[row.id,row])),ids=[...new Set([...old.keys(),...fresh.keys()])].filter(id=>!same(old.get(id),fresh.get(id)));before[name]=ids.filter(id=>old.has(id)).map(id=>old.get(id));after[name]=ids.filter(id=>fresh.has(id)).map(id=>fresh.get(id));}
  else{before[name]=a;after[name]=b;}
 }
 const metadata={today:ctx.today,iso:ctx.iso,now:ctx.now,minute:ctx.minute,timetableEntries:ctx.timetableEntries,quotaRequested:ctx.quotaRequested,days:Object.fromEntries(Object.entries(ctx.days||{}).map(([date,day])=>[date,{date,verified:day.verified,schoolDay:day.schoolDay,periods:day.periods,quotaSource:day.quotaSource}])),baselineDays:Object.fromEntries(Object.entries(ctx.baselineDays||ctx.days||{}).map(([date,day])=>[date,{quotaSource:day.quotaSource}]))};
 return {base:before,next:after,appends,ctx:metadata,result,dependencies,references,contacts,stamp,domainChanged,outboxDelta:next.outbox.length-base.outbox.length,allocating:!ctx.skipScheduledAllocation&&!result.allocationTimedOut};
}
function rosterScheduledPreparedMerge_(work,current){
 const merged=rosterOperationsMergePrepared_(work.base,work.next,current);
 for(const [name,rows]of Object.entries(work.appends||{})){
  if(!Array.isArray(current[name]))rosterOperationsConflict_('PREPARED_RETRY','A prepared collection changed shape.');
  const ids=new Map(current[name].filter(row=>row&&typeof row.id==='string').map(row=>[row.id,row])),keys=name==='outbox'?new Map(current[name].filter(row=>row.key).map(row=>[row.key,row.id])):null,append=[];
  for(const row of rows){if(row&&typeof row.id==='string'&&ids.has(row.id)){if(JSON.stringify(ids.get(row.id))!==JSON.stringify(row))rosterOperationsConflict_('PREPARED_RETRY','A prepared event identity changed.');continue;}if(keys&&row.key&&keys.has(row.key)&&keys.get(row.key)!==row.id)rosterOperationsConflict_('PREPARED_RETRY','A notification intent already exists.');append.push(row);}
  merged[name]=[...current[name],...append];
 }return merged;
}
function rosterScheduledAllocationStart_(req,descriptor){
 const date=GSISRosterOperations.date(descriptor.date),scheduleKey=descriptor.scheduleKey,tickKey=descriptor.tickKey||scheduleKey,id=rosterOperationsDigest_({date,actor:'roster-service',key:scheduleKey});
 const priorSlot=rosterScheduledAllocationLedger_(date).slots[scheduleKey.slice(11)],priorRun=rosterAllocationRunRead_(date),needsReceipt=priorSlot&&['running','committing','uncertain'].includes(priorSlot.state)||priorRun&&['committing','uncertain'].includes(priorRun.state),confirmation=needsReceipt?rosterScheduledReceiptSource_():null;
 return rosterAllocationRunLocked_(()=>{
  const ledger=rosterScheduledAllocationLedger_(date),key=scheduleKey.slice(11);let slot=ledger.slots[key],prior=rosterAllocationRunRead_(date),state;
  if(confirmation){rosterScheduledReceiptSourceCheck_(confirmation);if(JSON.stringify(prior)!==JSON.stringify(priorRun)||JSON.stringify(slot)!==JSON.stringify(priorSlot))throw Object.assign(Error('Scheduled allocation changed during receipt confirmation.'),{status:409,code:'ALLOCATION_BUSY'});}
  const read=()=>{if(!confirmation)throw Object.assign(Error('Scheduled receipt confirmation is pending.'),{status:409,code:'ALLOCATION_BUSY'});return state||(state=confirmation.state);},done=()=>{throw Object.assign(Error('This scheduled allocation slot is finished.'),{status:409,code:'ALLOCATION_SLOT_DONE'});};
  if(slot&&['completed','stopped'].includes(slot.state))done();
  if(prior&&['running','cancelling','committing','uncertain','yielded'].includes(prior.state)){
   if(['committing','uncertain'].includes(prior.state)&&rosterAllocationRunAccepted_(prior,read())){rosterAllocationRunComplete_(prior,state);prior={...prior,state:'completed'};}
   else if(prior.state==='yielded'&&prior.id!==id)rosterAllocationRunWrite_({...prior,state:'failed',slotStopped:true},'The saved preparation slot ended.');
   else if(!rosterAllocationRunExpired_(prior)&&!(prior.id===id&&['uncertain','yielded'].includes(prior.state)))throw Object.assign(Error('An allocator is already running for this date. Follow its status before starting another.'),{status:409,code:['committing','uncertain'].includes(prior.state)?'ALLOCATION_UNCONFIRMED':'ALLOCATION_IN_PROGRESS'});
  }
  if(slot&&['running','committing','uncertain'].includes(slot.state)){
   // Always resolve the durable receipt under the writer lock before treating
   // an expired attempt as failed. A timed-out response is not a failed write.
   const receipt=read().scheduleReceipts[scheduleKey];
   if(receipt&&!receipt.cancelled&&(receipt.allocationStatus==='complete'||receipt.allocationStatus===undefined&&receipt.optimise!==false)){
    ledger.slots[key]={...slot,state:'completed'};rosterScheduledAllocationSave_(ledger);if(prior?.id===id)rosterAllocationRunWrite_({...prior,state:'completed'},'Saved allocation confirmed from its durable receipt.');done();
   }
   if(receipt?.cancelled){ledger.slots[key]={...slot,state:'stopped'};rosterScheduledAllocationSave_(ledger);if(prior?.id===id)rosterAllocationRunWrite_({...prior,state:'cancelled'},'Cancelled scheduled allocation remains stopped.');done();}
   if(Date.now()-slot.started<=150000&&slot.state!=='uncertain'&&prior?.state!=='completed')throw Object.assign(Error('An allocator is already running for this date.'),{status:409,code:'ALLOCATION_IN_PROGRESS'});
   slot={...slot,state:slot.attempts>=2?'stopped':'failed'};ledger.slots[key]=slot;rosterScheduledAllocationSave_(ledger);
   if(prior?.id===id&&prior.fence===slot.fence)rosterAllocationRunWrite_({...prior,state:'failed'},'The previous attempt ended without a saved allocation receipt.');
   if(slot.state==='stopped')done();
  }
  if(slot?.attempts>=2&&slot.state!=='yielded')done();
  // Retain unresolved slots. Old terminal dates alone may be pruned; exhausting
  // the bound fails closed instead of forgetting an uncertain save.
  const prefix='ROSTER_ALLOCATION_SLOTS:',properties=props_().getProperties?.()||{},cutoff=new Date(Date.now()-7*86400000).toISOString().slice(0,10);let dates=0;
  for(const name of Object.keys(properties).filter(k=>k.startsWith(prefix))){let old;try{old=JSON.parse(properties[name]);}catch(_){}if(name!==prefix+date&&name.slice(prefix.length)<cutoff&&old?.slots&&Object.values(old.slots).every(row=>['completed','stopped','failed'].includes(row.state))){props_().deleteProperty(name);const visibleKey='ROSTER_ALLOCATION_RUN:'+name.slice(prefix.length);let visible;try{visible=JSON.parse(properties[visibleKey]||'null');}catch(_){}if(visible&&!['running','cancelling','committing','uncertain'].includes(visible.state))props_().deleteProperty(visibleKey);}else dates++;}
  if(dates>=14&&!properties[prefix+date])error_(503,'Scheduled allocation history is full. Ask Admin to review unfinished slots.');
  const continuation=slot?.state==='yielded'&&prior?.id===id&&prior.work,started=Date.now(),attempts=continuation?slot.attempts:(slot?.attempts||0)+1,fence=Utilities.getUuid(),base={schema:1,id,fence,date,trigger:'scheduled',allocationMode:'reoptimise',actor:'roster-service',actorName:'Scheduled allocator',requestId:null,scheduleKey,tickKey,digest:rosterOperationsDigest_({date,scheduleKey}),attempts,startedAt:continuation?prior.startedAt:new Date(started).toISOString(),leaseStartedAt:new Date(started).toISOString(),state:'running',log:prior?.id===id?prior.log:[],...(continuation?{work:prior.work}:{}),budgetDeadline:descriptor.budgetDeadline||started+14000,saveDeadline:descriptor.saveDeadline||started+24000};
  ledger.slots[key]={attempts,state:'running',started,fence,tick:tickKey.slice(11)};rosterScheduledAllocationSave_(ledger);
  return rosterAllocationRunWrite_(base,'Scheduled allocation attempt '+attempts+' of 2. Preparing current records.');
 },500);
}
function rosterScheduledAllocationBudget_(run,save=false){if(run&&Date.now()>=(save?run.saveDeadline:run.budgetDeadline))throw Object.assign(Error('Scheduled allocation time budget reached. The last saved draft is retained.'),{status:409,code:'ALLOCATION_BUDGET'});}
function rosterAllocationRunStart_(req,c,descriptor){
 if(descriptor?.trigger==='scheduled')return rosterScheduledAllocationStart_(req,descriptor);
 const p=req.input||{},scheduled=descriptor?.trigger==='scheduled',user=rosterOperationsAuthority_(c,req.identity);
 if(!scheduled&&!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');
 const date=GSISRosterOperations.date(descriptor?.date||p.date||rosterToday_()),actor=scheduled?'roster-service':req.identity.email,digest=rosterOperationsCommandDigest_(p),scheduleKey=scheduled?descriptor.scheduleKey:null;
 if(!scheduled&&(typeof p.requestId!=='string'||! /^[\w-]{36}$/.test(p.requestId)))error_(400,'A save request ID is required.');
 const mode=GSISRosterOperations.allocationMode(scheduled?{operation:'scheduledRoster'}:p),id=rosterOperationsDigest_({date,actor,key:scheduled?scheduleKey:p.requestId}),base={schema:1,id,allocationMode:mode,fence:Utilities.getUuid(),date,trigger:scheduled?'scheduled':'manual',actor,actorName:scheduled?'Scheduled allocator':String(c.rosterPeople.find(person=>person.id===user.staffId)?.name||'SMC').slice(0,100),digest,requestId:scheduled?null:p.requestId,scheduleKey,startedAt:new Date().toISOString(),state:'running',log:[]};
 return rosterAllocationRunLocked_(()=>{
  const state=rosterOperationsState_(true);if(rosterAllocationRunCancelled_(base,state))rosterAllocationRunCancellation_();if(rosterAllocationRunAccepted_(base,state))return null;
  const prior=rosterAllocationRunRead_(date);
  if(prior){
   if(rosterAllocationRunCancelled_(prior,state))prior.state='cancelled';
   if(prior.id===id)base.log=prior.log;
   if(prior.id===id&&prior.digest!==digest)error_(409,'This request ID was used for a different allocation.');
   if(rosterAllocationRunAccepted_(prior,state))rosterAllocationRunWrite_({...prior,state:'completed'},'Saved allocation confirmed.');
   // Acquiring the writer lock and reading the durable receipt resolves an
   // interrupted commit for this exact request. Fence its old attempt before
   // replaying; a different request must wait until the old execution expires.
   else if(['committing','uncertain'].includes(prior.state)&&prior.id!==id&&!rosterAllocationRunExpired_(prior))throw Object.assign(Error('The previous allocation save is awaiting confirmation. Retry the original request or refresh current records before starting another run.'),{status:409,code:'ALLOCATION_UNCONFIRMED'});
   else if(['running','cancelling'].includes(prior.state)&&!rosterAllocationRunExpired_(prior))throw Object.assign(Error('An allocator is already running for this date. Follow its status or cancel it before starting another.'),{status:409,code:'ALLOCATION_IN_PROGRESS'});
   else if(prior.id===id&&['cancelled','cancelling'].includes(prior.state))rosterAllocationRunCancellation_();
   // This locked read already resolved the superseded scheduled command. Close
   // its independent ledger before a manual row replaces the only visible run.
   if(prior.trigger==='scheduled'&&!rosterAllocationRunAccepted_(prior,state)){
    if(rosterAllocationRunCancelled_(prior,state))rosterAllocationRunWrite_({...prior,state:'cancelled'},'Cancelled scheduled allocation remains stopped.');
    else if(rosterAllocationRunExpired_(prior)&&['running','cancelling','committing','uncertain'].includes(prior.state))rosterAllocationRunWrite_({...prior,state:'failed',slotStopped:true},'Auto-allocation stopped after its interrupted run was replaced by an SMC command.');
   }
  }
  // Keep at most a bounded dated control history; no timetable payload lives here.
  const properties=props_().getProperties?.()||{},cutoff=new Date(Date.now()-7*86400000).toISOString().slice(0,10),keys=Object.keys(properties).filter(k=>k.startsWith('ROSTER_ALLOCATION_RUN:')).sort();
  let remaining=keys.length;for(const key of keys){let old;try{old=JSON.parse(properties[key]);}catch(_){old={state:'invalid'};}const terminal=!['running','cancelling','committing','uncertain'].includes(old.state)||rosterAllocationRunExpired_(old);if(key!==rosterAllocationRunKey_(date)&&terminal&&(key.slice('ROSTER_ALLOCATION_RUN:'.length)<cutoff||remaining>=60)){props_().deleteProperty(key);remaining--;}}
  if(remaining>=60&&!prior)error_(503,'Allocation status history is full. Ask Admin to review unfinished runs.');
  return rosterAllocationRunWrite_(base,mode==='fill-only'?'Preparing to fill unassigned periods; existing assignments stay in place.':'Preparing to reoptimise blanks and unpublished automatic assignments.');
 });
}
function rosterAllocationRunCheck_(run){
 if(!run)return null;const row=rosterAllocationRunRead_(run.date);
 if(!row||row.id!==run.id||row.fence!==run.fence||rosterAllocationRunExpired_(row))throw Object.assign(Error('This allocation run is no longer active. Refresh the current draft.'),{status:409,code:'ALLOCATION_ABANDONED'});
 if(['cancelling','cancelled'].includes(row.state))throw Object.assign(Error('Allocation cancelled before saving. The online draft was not changed by this run.'),{status:409,code:'ALLOCATION_CANCELLED'});
 if(row.state!=='running')throw Object.assign(Error('Allocation save confirmation is pending. Refresh the current draft.'),{status:409,code:'ALLOCATION_UNCONFIRMED'});
 return row;
}
function rosterAllocationRunStage_(run,message){if(run)rosterAllocationRunLocked_(()=>rosterAllocationRunWrite_(rosterAllocationRunCheck_(run),message),run.trigger==='scheduled'?500:8000);}
// Called only while the existing operational writer lock is held.
function rosterAllocationRunBeforeCommit_(run,checkBeforeWrite){
 if(!run){if(checkBeforeWrite)checkBeforeWrite();return;}
 const saving=rosterAllocationRunWrite_({...rosterAllocationRunCheck_(run),state:'committing'},'Saving the checked allocation draft.');
 try{if(checkBeforeWrite)checkBeforeWrite();}catch(error){
  // The source write has not been submitted. Only this final validation failure
  // may rearm the same fenced run; an actual Drive error never enters this path.
  const current=rosterAllocationRunRead_(run.date);if(current?.id===saving.id&&current.fence===saving.fence&&current.state==='committing')rosterAllocationRunWrite_({...current,state:'running'},'The clock changed before writing; checking current duties again.');
  throw error;
 }
}
function rosterAllocationRunComplete_(run,state){if(!run)return;try{const row=rosterAllocationRunRead_(run.date);if(row?.id===run.id&&row.fence===run.fence&&rosterAllocationRunAccepted_(row,state))rosterAllocationRunWrite_({...row,state:'completed'},'Allocation draft saved.');}catch(_){/* Durable receipt remains authoritative if status storage is unavailable. */}}
function rosterAllocationRunExecute_(req,c,work,descriptor){
 const run=rosterAllocationRunStart_(req,c,descriptor);
 const settle=(result,error)=>{
  if(!run)return;const prior=rosterAllocationRunRead_(run.date);if(prior?.fence!==run.fence||prior.state==='completed')return;
  const scheduled=run.trigger==='scheduled',source=scheduled?rosterScheduledReceiptSource_():null,token=JSON.stringify(prior);
  rosterAllocationRunLocked_(()=>{
   const row=rosterAllocationRunRead_(run.date);if(row?.fence!==run.fence||row.state==='completed')return;
   if(source){if(JSON.stringify(row)!==token)throw Object.assign(Error('Scheduled status changed during settlement.'),{status:409,code:'ALLOCATION_BUSY'});rosterScheduledReceiptSourceCheck_(source);}
   const state=source?source.state:rosterOperationsState_(true);
   if(rosterAllocationRunCancelled_(row,state)){rosterAllocationRunWrite_({...row,state:'cancelled'},'Cancelled before saving the proposed allocation.');return;}
   if(rosterAllocationRunAccepted_(row,state)){rosterAllocationRunComplete_(run,state);return;}
   if(error){const status=row.state==='committing'?'uncertain':row.state==='cancelling'||error.code==='ALLOCATION_CANCELLED'?'cancelled':'failed';rosterAllocationRunWrite_({...row,state:status},status==='uncertain'?'Save confirmation is pending. Refresh current records.':status==='cancelled'?'Cancelled before saving the proposed allocation.':'Allocation stopped. Review current records before retrying.');}
   else if(['running','cancelling'].includes(row.state)||result.allocationTimedOut&&rosterAllocationRunReceipt_(row,state)?.allocationStatus==='budget')rosterAllocationRunWrite_({...row,state:row.state==='cancelling'?'cancelled':'failed'},row.state==='cancelling'?'Cancelled before saving the proposed allocation.':result.allocationTimedOut?'Time budget reached; the last saved draft is retained.':'No allocation draft was saved by this run.');
  },scheduled?500:8000);
 };
 try{
  const result=work(run);if(result.skippedBusy||result.allocationYielded&&(!run||['yielded','failed'].includes(rosterAllocationRunRead_(run.date)?.state)))return result;
  try{settle(result,null);}catch(_){}return result;
 }catch(error){
  if(error.code==='ALLOCATION_BUSY')return {skipped:true,skippedBusy:true,code:'SKIPPED_BUSY'};
  try{settle(null,error);}catch(_){}throw error;
 }
}
function rosterAllocationRunCancel_(req,c){
 const user=rosterOperationsAuthority_(c,req.identity);if(!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');
 const p=req.input||{},date=GSISRosterOperations.date(p.date);if(typeof p.runId!=='string'||!/^[a-f0-9]{64}$/.test(p.runId)||typeof p.requestId!=='string'||!/^[\w-]{36}$/.test(p.requestId))error_(400,'Choose the allocation run to cancel.');
 return rosterAllocationRunLocked_(()=>{
  let row=rosterAllocationRunRead_(date);if(!row||row.id!==p.runId)return {allocatorRun:rosterAllocationRunPublic_(row),cancellation:'not-found'};
  const state=rosterOperationsState_(true);
  if(rosterAllocationRunCancelled_(row,state))return {allocatorRun:rosterAllocationRunPublic_(row,state),cancellation:'accepted'};
  if(rosterAllocationRunAccepted_(row,state)){rosterAllocationRunComplete_(row,state);return {allocatorRun:rosterAllocationRunPublic_(row,state),cancellation:'too-late'};}
  if(['committing','uncertain','completed'].includes(row.state))return {allocatorRun:rosterAllocationRunPublic_(row),cancellation:'too-late'};
  if(row.state==='cancelled'||row.state==='cancelling')return {allocatorRun:rosterAllocationRunPublic_(row),cancellation:'accepted'};
  if(!['running','yielded'].includes(row.state)||rosterAllocationRunExpired_(row))return {allocatorRun:rosterAllocationRunPublic_(row),cancellation:'not-found'};
  // Cancellation is a durable terminal receipt, not only a replaceable status.
  // A lost response or a later run cannot resurrect this exact command.
  const cancelled={cancelled:true,cancelledBy:req.identity.email,cancelRequestId:p.requestId,at:new Date().toISOString()};
  if(row.trigger==='scheduled')state.scheduleReceipts[row.scheduleKey]=cancelled;
  else state.receipts.push({...cancelled,id:row.requestId,actor:row.actor,digest:row.digest,result:{cancelled:true},revision:state.revision});
  rosterOperationsCommit_(state);
  row=rosterAllocationRunWrite_({...row,state:row.state==='yielded'?'cancelled':'cancelling'},'Cancellation requested by '+String(c.rosterPeople.find(person=>person.id===user.staffId)?.name||'SMC').slice(0,100)+'. Waiting for the current calculation to stop.');
  return {allocatorRun:rosterAllocationRunPublic_(row),cancellation:'accepted'};
 });
}
