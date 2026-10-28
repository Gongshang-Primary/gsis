/* Small allocator control records. Every mutation uses the operational writer
   lock; computation never holds it. Durable command receipts own completion. */
function rosterAllocationRunKey_(date){return 'ROSTER_ALLOCATION_RUN:'+GSISRosterOperations.date(date);}
function rosterAllocationRunRead_(date){const text=props_().getProperty(rosterAllocationRunKey_(date));if(!text)return null;try{const row=JSON.parse(text);if(row.schema!==1||row.date!==date||typeof row.id!=='string'||!Array.isArray(row.log))throw Error('shape');return row;}catch(_){error_(503,'Allocation status could not be read. Refresh before starting another run.');}}
function rosterAllocationRunExpired_(row){return Date.now()-Date.parse(row.updatedAt)>10*60000;}
function rosterAllocationRunPublic_(row,state){
 if(!row)return null;let status=row.state;if(state&&rosterAllocationRunCancelled_(row,state))status='cancelled';else if(state&&rosterAllocationRunAccepted_(row,state))status='completed';
 else if(rosterAllocationRunExpired_(row)&&['running','cancelling','committing'].includes(status))status=status==='committing'?'uncertain':'abandoned';
 return {id:row.id,date:row.date,state:status,trigger:row.trigger,...(row.allocationMode?{allocationMode:row.allocationMode}:{}),requestId:row.trigger==='manual'?row.requestId:null,actorName:row.actorName,startedAt:row.startedAt,updatedAt:row.updatedAt,log:row.log,canCancel:['running','cancelling'].includes(status)};
}
function rosterAllocationRunReceipt_(row,state){return row.trigger==='scheduled'?state.scheduleReceipts?.[row.scheduleKey]:state.receipts?.find(r=>r.id===row.requestId&&r.actor===row.actor&&r.digest===row.digest);}
function rosterAllocationRunAccepted_(row,state){const receipt=rosterAllocationRunReceipt_(row,state);return !!receipt&&!receipt.cancelled;}
function rosterAllocationRunCancelled_(row,state){return rosterAllocationRunReceipt_(row,state)?.cancelled===true;}
function rosterAllocationRunCancellation_(){throw Object.assign(Error('This allocation was cancelled. Start a new run to allocate again.'),{status:409,code:'ALLOCATION_CANCELLED'});}
function rosterAllocationRunWrite_(row,message){if(typeof rosterEdgeAssertLegacyWrite_==='function')rosterEdgeAssertLegacyWrite_();
 const at=new Date().toISOString(),seq=(row.log.at(-1)?.seq||0)+1;row={...row,updatedAt:at,log:[...row.log,{seq,at,message:String(message).slice(0,180)}].slice(-12)};
 const json=JSON.stringify(row);if(json.length>7000)error_(503,'Allocation status is too large. Refresh before retrying.');props_().setProperty(rosterAllocationRunKey_(row.date),json);return row;
}
function rosterAllocationRunLocked_(work){const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Another save is finishing. Retry this action.');try{return work();}finally{deployUnlock_(lock);}}
function rosterAllocationRunStart_(req,c,descriptor){
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
function rosterAllocationRunStage_(run,message){if(run)rosterAllocationRunLocked_(()=>rosterAllocationRunWrite_(rosterAllocationRunCheck_(run),message));}
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
 try{const result=work(run);if(run)try{rosterAllocationRunLocked_(()=>{const row=rosterAllocationRunRead_(run.date);if(row?.fence!==run.fence||row.state==='completed')return;const state=rosterOperationsState_(true);if(rosterAllocationRunCancelled_(row,state))rosterAllocationRunWrite_({...row,state:'cancelled'},'Cancelled before saving the proposed allocation.');else if(rosterAllocationRunAccepted_(row,state))rosterAllocationRunComplete_(run,state);else if(['running','cancelling'].includes(row.state))rosterAllocationRunWrite_({...row,state:row.state==='cancelling'?'cancelled':'failed'},row.state==='cancelling'?'Cancelled before saving the proposed allocation.':'No allocation draft was saved by this run.');});}catch(_){}return result;}catch(error){
  if(run)try{rosterAllocationRunLocked_(()=>{
   const row=rosterAllocationRunRead_(run.date);if(row?.id!==run.id||row.fence!==run.fence)return;
   const state=rosterOperationsState_(true);if(rosterAllocationRunAccepted_(row,state)){rosterAllocationRunComplete_(run,state);return;}
   const status=rosterAllocationRunCancelled_(row,state)?'cancelled':row.state==='committing'?'uncertain':row.state==='cancelling'||error.code==='ALLOCATION_CANCELLED'?'cancelled':'failed';
   rosterAllocationRunWrite_({...row,state:status},status==='uncertain'?'Save confirmation is pending. Refresh current records.':status==='cancelled'?'Cancelled before saving the proposed allocation.':'Allocation stopped. Review current records before retrying.');
  });}catch(_){}
  throw error;
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
  if(row.state!=='running'||rosterAllocationRunExpired_(row))return {allocatorRun:rosterAllocationRunPublic_(row),cancellation:'not-found'};
  // Cancellation is a durable terminal receipt, not only a replaceable status.
  // A lost response or a later run cannot resurrect this exact command.
  const cancelled={cancelled:true,cancelledBy:req.identity.email,cancelRequestId:p.requestId,at:new Date().toISOString()};
  if(row.trigger==='scheduled')state.scheduleReceipts[row.scheduleKey]=cancelled;
  else state.receipts.push({...cancelled,id:row.requestId,actor:row.actor,digest:row.digest,result:{cancelled:true},revision:state.revision});
  rosterOperationsCommit_(state);
  row=rosterAllocationRunWrite_({...row,state:'cancelling'},'Cancellation requested by '+String(c.rosterPeople.find(person=>person.id===user.staffId)?.name||'SMC').slice(0,100)+'. Waiting for the current calculation to stop.');
  return {allocatorRun:rosterAllocationRunPublic_(row),cancellation:'accepted'};
 });
}
