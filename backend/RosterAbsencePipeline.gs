// Durable attendance projection. Intake owns a separate UserLock; no journal
// lock is retained while the operational ScriptLock is acquired.
function rosterAbsenceIntakeChildId_(id,part){const h=rosterOperationsDigest_({id,part,version:1});return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32);}
function rosterAbsenceIntakeResult_(job,extra){return {accepted:true,intakeReceipt:true,receiptOnly:true,requestId:job.requestId||job.id,acceptedAt:job.acceptedAt,intakeState:job.state,absenceApplied:job.absenceApplied===true,savedIds:job.savedIds||[],peerState:job.peerState||'none',instructionState:job.instructionState||'none',mutualRequestIds:job.mutualRequestIds||[],reasonCode:job.reasonCode||null,failureCode:job.failureCode||null,affectedDates:job.dates,...extra};}
function rosterAbsenceIntakeFailureCode_(error){
 // Only exact, static domain messages become public codes. Never retain raw
 // exception messages, stacks, submitted notes or upstream responses.
 if(['ABSENCE_SHORTER_CONFIRMATION','ABSENCE_COVERAGE_REVIEW','ABSENCE_INSTRUCTIONS_CONFLICT'].includes(error?.code))return error.code;
 const known={
  'This absence overlaps an existing entry. Edit that entry or select different periods.':'ABSENCE_OVERLAP',
  'Period timings are required to verify this absence type. Retry when the timetable is available.':'ABSENCE_TIMETABLE_REQUIRED',
  'No timetable is available. Choose full day or start and end times.':'ABSENCE_TIMETABLE_REQUIRED',
  'Select an available absence type.':'ABSENCE_TYPE_CHANGED',
  'The absence type is not permitted in these periods.':'ABSENCE_PERIOD_POLICY',
  'Select All is not available for this absence type.':'ABSENCE_PERIOD_POLICY'
 };
 return Object.prototype.hasOwnProperty.call(known,error?.message)?known[error.message]:error?.status===403?'ABSENCE_ACCESS_CHANGED':null;
}
function rosterAbsenceIntakeGate_(dates,includePeers=false){
 if(typeof rosterAbsenceIntakePending_!=='function')return;
 const pending=rosterAbsenceIntakePending_(dates);
 if(pending.pendingCaptureCount||includePeers&&pending.pendingPeerCount)throw Object.assign(Error('A received absence or colleague proposal is still being applied. Retry after report processing finishes.'),{status:409,code:'ABSENCE_INTAKE_PENDING',pendingCaptureCount:pending.pendingCaptureCount,pendingPeerCount:includePeers?pending.pendingPeerCount||0:0});
}
function rosterAbsenceIntakeCommitFence_(dates,write,includePeers=false){
 // Called only with the operational ScriptLock already held, after packing.
 // Capture never acquires ScriptLock, so the lock ordering cannot invert.
 const lock=LockService.getUserLock();if(!deployLock_(lock,1500))throw Object.assign(Error('An absence report is being received. Retry this allocation or publication.'),{status:503,code:'ABSENCE_INTAKE_BUSY'});
 try{rosterAbsenceIntakeGate_(dates,includePeers);return write();}finally{deployUnlock_(lock);}
}
function rosterAbsenceIntakeDefer_(req){
 const p=req.input||{},job=rosterAbsenceIntakeGetClaim_(p.requestId,p.claimId);
 const settled=rosterAbsenceIntakeSettle_(job.requestId,job.claimId,{state:'pending',reasonCode:'CALENDAR_UNAVAILABLE',retryAfterMs:15000});
 return rosterAbsenceIntakeResult_({...job,...settled,state:'pending',reasonCode:'CALENDAR_UNAVAILABLE'});
}
function rosterAbsenceIntakeNotes_(command,a){return (command.instructionsByStaffDate?.[a.staffId]||command.instructionsByDate)?.[a.date];}
function rosterAbsenceIntakeInstructionCheck_(s,ctx,p,source){
 const a=s.absences.find(row=>row.id===p.absenceId&&!row.deletedAt),dd=ctx.days[p.date];
 if(!a||!dd||a.staffId!==source.staffId||a.date!==source.date)rosterOperationsConflict_('INSTRUCTION_SOURCE_CHANGED','The saved absence changed. Review its retained instructions.');
 if(source.scope&&(source.scope.timetableId!==dd.id||source.scope.parity!==dd.parity||source.scope.staplerRevision!==(dd.staplerRevision||0)))rosterOperationsConflict_('INSTRUCTION_SOURCE_CHANGED','The timetable changed. Review the retained instructions.');
 // Instruction authors and capture ordering are compared by the shared model.
 // Scope/identity are verified here before any note can be merged.
}
function rosterAbsenceIntakeProcess_(req){
 const p=req.input||{},job=rosterAbsenceIntakeGetClaim_(p.requestId,p.claimId),command=job.command;
 // Identity and payload are always reloaded from the durable claimed report.
 // Service input supplies only freshly verified Calendar/transport context.
 const trusted={calendarByDate:p.calendarByDate,notificationsReady:p.notificationsReady===true,schedulerAvailable:p.schedulerAvailable===true};
 let notificationsQueued=0,phase='absence',current={...job},review=job.instructionState==='needsReview'||job.peerState==='needsReview',steps=0,settlementError;
 const started=Date.now(),settle=outcome=>{try{const result=rosterAbsenceIntakeSettle_(job.requestId,job.claimId,outcome);current={...current,...outcome,...result};return current;}catch(error){settlementError=error;throw error;}};
 const budget=()=>steps>=4||Date.now()-started>=25000;
 const pause=()=>rosterAbsenceIntakeResult_(settle({state:'pending',instructionState:current.instructionState||'none',peerState:current.peerState||'none',retryAfterMs:1000}),{notificationsQueued});
 const execute=(input,extra={})=>rosterAbsenceDispatch_({identity:job.identity,input:{...input,...trusted,receiptOnly:true},intakeProjection:true,...extra},contacts);
 let contacts;
 try{
  contacts=contacts_(job.identity,false,'deploySnapshot',{authorityOnly:true,rosterAuthority:true,rosterDirectory:true});
  rosterOperationsAuthority_(contacts,job.identity);
  if(command.operation==='saveAbsence'&&!current.absenceApplied){
   const core={...command,requestId:rosterAbsenceIntakeChildId_(job.requestId,'attendance'+(job.overlapChoice?':'+job.overlapChoice.requestId:'')),revision:command.revision||0};
   for(const key of ['intake','ownArrangementsByStaffDate','instructionsByDate','instructionsByStaffDate','expectedInstructionScopes','includeMutualCandidates'])delete core[key];
   const result=execute(core,{intakeAcceptedAt:job.acceptedAt,intakeSequence:job.sequence,intakeOverlapChoice:job.overlapChoice});notificationsQueued+=result.notificationsQueued||0;
   settle({state:'pending',absenceApplied:true,savedIds:result.savedIds||[],retainClaim:true});
  }
  // An edit keeps its existing absence token during the attendance phase. Each
  // subsequent note/proposal uses an immutable child request ID of this report.
  const state=rosterOperationsState_(true),saved=state.absences.filter(a=>(current.savedIds||[]).includes(a.id));
  // An expired report can still record captured attendance. Its original
  // follow-on instructions/proposals remain in the journal, never re-sent.
  const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  if(job.dates.length&&job.dates.every(date=>date<today))return rosterAbsenceIntakeResult_(settle({state:'applied',absenceApplied:true,instructionState:'none',peerState:'none',reasonCode:'EXPIRED_FOLLOWUPS_RETAINED'}),{notificationsQueued});
  phase='instructions';const noteRows=command.operation==='saveAbsence'?saved.filter(a=>Object.values(rosterAbsenceIntakeNotes_(command,a)||{}).some(value=>String(value).trim())).sort((a,b)=>a.id.localeCompare(b.id)):[];
  if(noteRows.length&&current.instructionState!=='needsReview')current.instructionState='pending';
  for(let i=current.instructionCursor||0;i<noteRows.length;i++){
   if(budget())return pause();const a=noteRows[i],allNotes=rosterAbsenceIntakeNotes_(command,a),siblings=saved.filter(row=>row.staffId===a.staffId&&row.date===a.date),notes=siblings.length>1?Object.fromEntries(Object.entries(allNotes).filter(([key])=>(a.lessonSnapshot||[]).some(lesson=>lesson.lessonKey===key))):allNotes;steps++;
   if(a.date<today){settle({state:'pending',instructionCursor:i+1,instructionState:current.instructionState,retainClaim:true});continue;}
   try{
    const result=execute({operation:'saveInstructions',view:'report',revision:0,date:a.date,absenceId:a.id,instructions:notes,instructionsNA:command.instructionsNA===true,requestId:rosterAbsenceIntakeChildId_(job.requestId,'instructions:'+a.id)},{intakeAcceptedAt:job.acceptedAt,intakeSequence:job.sequence,intakeInstructionSource:{staffId:a.staffId,date:a.date,scope:command.expectedInstructionScopes?.[a.date]||null}});notificationsQueued+=result.notificationsQueued||0;
   }catch(error){if(!Number.isInteger(error.status)||error.status>=500||[408,429].includes(error.status))throw error;review=true;current.instructionState='needsReview';}
   settle({state:'pending',instructionCursor:i+1,instructionState:current.instructionState,retainClaim:true});
  }
  if(current.instructionState!=='needsReview')current.instructionState=noteRows.length?'applied':'none';
  phase='peer';let hasPeers=false;const mutualRequestIds=new Set(current.mutualRequestIds||[]),proposals=[];
  if(command.operation==='requestMutual')proposals.push({date:job.dates[0],absenceId:command.absenceId,requests:command.requests,requestId:rosterAbsenceIntakeChildId_(job.requestId,'peer')});
  else for(const [staffId,dated] of Object.entries(command.ownArrangementsByStaffDate||{}))for(const [date,picks] of Object.entries(dated)){
   if(!picks.length)continue;
   const groups=new Map();
   for(const pick of picks){
    const owners=saved.filter(row=>!row.deletedAt&&row.staffId===staffId&&row.date===date&&(row.periods||[]).includes(pick.period));
    if(owners.length!==1){if(date>=today){review=true;current.peerState='needsReview';}continue;}
    const a=owners[0];if(!groups.has(a.id))groups.set(a.id,[]);const id=a.id+':'+pick.period;
    groups.get(a.id).push({demandIds:[id],recipientId:pick.recipientId,combination:pick.combination===true,expectedLessons:{[id]:{lessonKey:pick.lessonKey,timetableId:pick.expectedTimetableId,parity:pick.expectedParity}},...(pick.combination===true?{expectedRecipientCell:pick.expectedRecipientCell}:{})});
   }
   for(const [absenceId,requests] of groups)proposals.push({date,absenceId,requests,requestId:rosterAbsenceIntakeChildId_(job.requestId,'peer:'+absenceId)});
  }
  proposals.sort((a,b)=>a.requestId.localeCompare(b.requestId));hasPeers=proposals.length>0;
  if(hasPeers&&current.peerState!=='needsReview')current.peerState='pending';
  for(let i=current.peerCursor||0;i<proposals.length;i++){if(budget())return pause();const proposal=proposals[i];steps++;if(proposal.date<today){settle({state:'pending',peerCursor:i+1,instructionState:current.instructionState,peerState:current.peerState,mutualRequestIds:[...mutualRequestIds],retainClaim:true});continue;}try{
   const result=execute({...proposal,operation:'requestMutual',view:'report',revision:0,proposalOnly:true});notificationsQueued+=result.notificationsQueued||0;(result.savedIds||[]).forEach(id=>mutualRequestIds.add(id));
  }catch(error){if(!Number.isInteger(error.status)||error.status>=500||[408,429].includes(error.status))throw error;review=true;current.peerState='needsReview';}
   settle({state:'pending',peerCursor:i+1,instructionState:current.instructionState,peerState:current.peerState,mutualRequestIds:[...mutualRequestIds],retainClaim:true});
  }
  if(current.peerState!=='needsReview')current.peerState=hasPeers?'applied':'none';
  const result=settle({state:review?'needsReview':'applied',absenceApplied:true,peerState:current.peerState,instructionState:current.instructionState,mutualRequestIds:[...mutualRequestIds],...(review?{reasonCode:current.peerState==='needsReview'?'PEER_REVIEW_REQUIRED':'INSTRUCTIONS_REVIEW_REQUIRED'}:job.dates.some(date=>date<today)?{reasonCode:'EXPIRED_FOLLOWUPS_RETAINED'}:{})});
  return rosterAbsenceIntakeResult_(result,{notificationsQueued});
 }catch(error){
  if(error===settlementError)throw error; // A lost/expired lease cannot settle a second time.
  const capacity=error.status===507,retry=!capacity&&(!Number.isInteger(error.status)||error.status>=500||[408,429].includes(error.status)),reasonCode=capacity?'STORAGE_CAPACITY_REQUIRED':retry?'PROCESSING_RETRY':phase==='absence'?'ABSENCE_REVIEW_REQUIRED':phase==='instructions'?'INSTRUCTIONS_REVIEW_REQUIRED':'PEER_REVIEW_REQUIRED';
  const result=settle({state:retry?'pending':'needsReview',absenceApplied:current.absenceApplied===true,savedIds:current.savedIds||[],peerState:!retry&&phase==='peer'?'needsReview':current.peerState,instructionState:!retry&&phase==='instructions'?'needsReview':current.instructionState||'none',reasonCode,failureCode:capacity?'ROSTER_STORAGE_CAPACITY':!retry&&phase==='absence'?rosterAbsenceIntakeFailureCode_(error):null,...(retry?{retryAfterMs:15000}:{})});
  return rosterAbsenceIntakeResult_(result,{notificationsQueued});
 }
}
