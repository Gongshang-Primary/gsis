/* Optional durable Worker commands reuse the ordinary event journal. The
 * trusted gateway verifies Access; the service cannot choose another action,
 * ignore a revision, or substitute its own service identity for the actor. */
function calendarCommandService_(request){
  const priorCommand=calendarNativeCommandReads_,priorNative=calendarNativeSourceReads_;
  calendarNativeCommandReads_=true;calendarNativeSourceReads_=true;
  try{return calendarCommandServiceCore_(request);}
  finally{calendarNativeCommandReads_=priorCommand;calendarNativeSourceReads_=priorNative;}
}
function calendarCommandServiceCore_(request){
  const allowed=['proxySecret','service','purpose','action','mode','actor','commandId','operation','requestId'];
  const deny=()=>{throw mutationError_('COMMAND_SERVICE_INVALID','Invalid Calendar command service request.',400,true);};
  if(request.service!=='gsis-calendar-command-v1'||request.purpose!=='calendar-mutation-job-v1'||request.action!=='calendarCommand'||!['authorize','execute','status'].includes(request.mode)||Object.keys(request).some(k=>!allowed.includes(k))||JSON.stringify(request).length>200000)deny();
  const operation=request.operation,actor=normaliseActor_(request.actor);
  if(!operation||typeof operation!=='object'||Array.isArray(operation)||Object.keys(operation).some(k=>!['action','payload'].includes(k))||!['saveEvent','deleteEvent','saveParentSide','relocateEvent'].includes(operation.action)||!operation.payload||typeof operation.payload!=='object'||Array.isArray(operation.payload))deny();
  // Actor aliases are derived from the verified account, never a role selector.
  if(actor.userAlias!==normAlias_(actor.email.split('@')[0]))throw mutationError_('COMMAND_ACTOR_INVALID','Calendar command actor does not match the verified account.',403,true);
  if(typeof request.commandId!=='string'||request.commandId!==operation.payload.operationId)deny();
  // Server-derived receipt binding. A caller-supplied field is overwritten;
  // another Google subject cannot replay a former account's accepted command.
  const payload=Object.assign({},operation.payload,{__calendarActorIdentity:sha256_(JSON.stringify([actor.email,actor.sub]))});
  mutationIdentity_(actor,operation.action,payload);
  const requestId=String(request.requestId||request.commandId);
  if(request.mode==='status')return dispatch_('eventMutationStatus',actor,{action:operation.action,payload:payload},requestId);
  if(request.mode==='execute')return dispatch_(operation.action,actor,payload,requestId);
  return calendarCommandAuthorize_(actor,operation.action,payload,requestId);
}
function calendarCommandAuthorize_(actor,action,payload,requestId){
  rc18ResetIO_();
  if(action==='saveEvent'&&payload.event&&payload.event.VenueID||action==='relocateEvent')rc18IO_().venueCatalogue=calendarVenueCatalogue_(actor);
  const prior=calendarRequestAuthority_;calendarRequestAuthority_={alias:actor.userAlias,parent:action==='saveParentSide'};
  try{return withRC17WriteLock_(()=>{
    const identity=mutationIdentity_(actor,action,payload),log=mutationSheet_(),receipt=mutationLookup_(log,identity.operationId);
    if(receipt){mutationCheckIdentity_(receipt.object,actor,action,identity.hash);return {authorized:true,actor:actor,commandId:identity.operationId,action:action};}
    const id=String(action==='saveEvent'?(payload.event||{}).EventID||'':payload.eventId||'');
    const before=id?findRowByKey_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.EVENTS),'EventID',id):null;
    const isNew=action==='saveEvent'&&!id;
    rc18AssertNoPendingEvent_(id,identity.operationId,before?before.object.Year:(payload.event||{}).Year);
    if(!isNew){
      if(!before||before.object.DeletedAt)throw mutationError_('EVENT_GONE','This event was deleted or no longer exists.',409,true);
      if(!payload.expectedRevision||String(payload.expectedRevision)!==eventForClient_(before.object)._revision)throw mutationError_('CONFLICT','A colleague changed this event. Review the latest version before queuing it.',409,true,before.object);
      const year=yearsCached_().find(y=>Number(y.Year)===Number(before.object.Year));
      if(!year||String(year.Status).toUpperCase()==='ARCHIVED')throw mutationError_('ARCHIVED','This year is archived and cannot be edited.',409,true);
    }
    if(action==='saveEvent')validateEvent_(payload.event,before&&before.object);
    if(action==='relocateEvent'&&!['move','copy'].includes(payload.mode))throw mutationError_('VALIDATION','Choose Move or Copy.',400,true);
    return {authorized:true,actor:actor,commandId:identity.operationId,action:action};
  });}finally{calendarRequestAuthority_=prior;}
}
