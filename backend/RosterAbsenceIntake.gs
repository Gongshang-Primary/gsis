/* Durable report intake is independent of the allocator ScriptLock.
 * Deploy as the script owner, as required by the notification transport. UserLock
 * has that one owner and is shared only with short transport/intake writes.
 * Never wait for ScriptLock while holding this lock. Processing uses the primary
 * command receipts after this journal has acknowledged receipt of the report.
 */
function rosterAbsenceIntakeCopy_(value){return JSON.parse(JSON.stringify(value));}
function rosterAbsenceIntakeOwner_(){
 const email=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase(),scriptId=ScriptApp.getScriptId();
 if(!email||!scriptId)error_(503,'Absence intake requires an execute-as-owner deployment.');return {email,scriptId};
}
function rosterAbsenceIntakeCheckOwner_(state){const owner=rosterAbsenceIntakeOwner_();if(state&&(state.owner?.email!==owner.email||state.owner?.scriptId!==owner.scriptId))error_(503,'Absence intake owner changed. Restore the execute-as-owner deployment.');return owner;}
function rosterAbsenceIntakeFile_(){return props_().getProperty('ROSTER_ABSENCE_INTAKE_FILE')||rosterFindFile_(ROSTER_DATA,'Roster absence intake.json');}
function rosterAbsenceIntakeState_(){
 const id=rosterAbsenceIntakeFile_();if(!id)return {schema:1,owner:rosterAbsenceIntakeOwner_(),revision:0,sequence:0,entries:[]};
 let state;try{state=JSON.parse(typeof rosterNativeRead_==='function'?rosterNativeRead_(id):rosterReadFile_(id));}catch(_){error_(503,'Absence intake could not be read. Retry the same report.');}
 if(state?.schema!==1||!Number.isSafeInteger(state.revision)||!Number.isSafeInteger(state.sequence)||!Array.isArray(state.entries)||state.entries.length>12000)error_(503,'Absence intake records need administrator review.');
 const ids=new Set();for(const row of state.entries){if(!row||typeof row.id!=='string'||ids.has(row.id)||!Number.isSafeInteger(row.sequence)||row.sequence<1||row.sequence>state.sequence||typeof row.actor!=='string'||typeof row.digest!=='string'||!Array.isArray(row.dates)||!['pending','applied','needsReview','withdrawn'].includes(row.state))error_(503,'Absence intake records need administrator review.');ids.add(row.id);}
 rosterAbsenceIntakeCheckOwner_(state);return state;
}
function rosterAbsenceIntakeCommit_(state){if(typeof rosterEdgeAssertLegacyWrite_==='function')rosterEdgeAssertLegacyWrite_();
 gsisRequireBackendRole_('roster');rosterAbsenceIntakeCheckOwner_(state);state.revision++;
 // Keep unresolved commands. Old terminal entries retain their receipt identity
 // after their private recovery payload is compacted; a late retry stays safe.
 const cutoff=Date.now()-180*86400000;for(const row of state.entries)if(row.state==='applied'&&Date.parse(row.completedAt||row.acceptedAt)<cutoff){delete row.command;delete row.identity;delete row.claimId;delete row.claimExpiresAt;}
 const stored=props_().getProperty('ROSTER_ABSENCE_INTAKE_FILE'),id=stored||rosterAbsenceIntakeFile_();
 if(typeof rosterNativeSplitWrite_==='function'&&rosterNativeSplitWrite_(id,state,'ROSTER_ABSENCE_INTAKE_FILE'))return;
 const text=JSON.stringify(state);if(text.length>10000000||state.entries.length>12000)error_(507,'Absence intake is full. Ask Admin to archive completed reports.');
 const saved=id?(rosterDriveRequest_('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(id)+'?uploadType=media&supportsAllDrives=true&fields=id',{method:'patch',contentType:'application/json; charset=UTF-8',payload:text},'absence-intake-commit'),id):rosterCreateFile_(ROSTER_DATA,'Roster absence intake.json',Utilities.newBlob(text,'application/json'));
 if(!stored)props_().setProperty('ROSTER_ABSENCE_INTAKE_FILE',saved);
}
function rosterAbsenceIntakeLocked_(work){
 gsisRequireBackendRole_('roster');rosterAbsenceIntakeOwner_();const lock=LockService.getUserLock();if(!deployLock_(lock,8000))error_(503,'Absence intake is receiving another report. Retry this same report.');
 try{return work(rosterAbsenceIntakeState_());}finally{deployUnlock_(lock);}
}
function rosterAbsenceIntakeCommand_(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!['saveAbsence','requestMutual'].includes(input.operation)||typeof input.requestId!=='string'||!/^[-\w]{36}$/.test(input.requestId)||input.intake!==true)error_(400,'Supply the original absence or peer request.');
 const command=rosterAbsenceIntakeCopy_(input);for(const key of ['calendarByDate','trustedNow','trustedIntakeAt','pendingTransportDates','notificationsReady','schedulerAvailable'])delete command[key];
 if(JSON.stringify(command).length>220000)error_(413,'The absence report is too large. Shorten the instructions.');return command;
}
function rosterAbsenceIntakeMatch_(row,identity,digest){if(row.actor!==identity.email)error_(403,'This absence receipt belongs to another reporter.');if(row.digest!==digest)error_(409,'This request ID was used for a different report.');return row;}
function rosterAbsenceIntakeSafeFailure_(code){return ['ABSENCE_SHORTER_CONFIRMATION','ABSENCE_COVERAGE_REVIEW','ABSENCE_INSTRUCTIONS_CONFLICT','ABSENCE_OVERLAP','ABSENCE_TIMETABLE_REQUIRED','ABSENCE_TYPE_CHANGED','ABSENCE_PERIOD_POLICY','ABSENCE_ACCESS_CHANGED','ROSTER_STORAGE_CAPACITY'].includes(code)?code:null;}
function rosterAbsenceIntakeReceiptValue_(row){return {accepted:true,intakeReceipt:true,receiptOnly:true,requestId:row.id,acceptedAt:row.acceptedAt,intakeState:row.state,absenceApplied:row.absenceApplied===true,savedIds:(row.savedIds||[]).slice(),peerState:row.peerState||'none',instructionState:row.instructionState||'none',mutualRequestIds:(row.mutualRequestIds||[]).slice(),reasonCode:row.reasonCode||null,failureCode:rosterAbsenceIntakeSafeFailure_(row.failureCode),affectedDates:row.dates.slice(),...(row.resolution?{resolution:{action:row.resolution.action,reason:row.resolution.reason,at:row.resolution.at,actorName:row.resolution.actorName}}:{})};}
function rosterAbsenceIntakeValidate_(command,user,c,capturedAt){
 const state=rosterOperationsState_(true),people=rosterOperationsPeople_(c),ctx={user,people},now=new Date(capturedAt+8*3600000),today=now.toISOString().slice(0,10),minute=now.getUTCHours()*60+now.getUTCMinutes();
 const object=value=>value&&typeof value==='object'&&!Array.isArray(value),short=(value,n)=>typeof value==='string'&&value.length<=n,periods=value=>Array.isArray(value)&&value.length>0&&value.length<=40&&value.every(p=>Number.isInteger(p)&&p>=0&&p<40)&&new Set(value).size===value.length;
 const owned=record=>{if(!record||record.deletedAt)error_(404,'The absence entry is unavailable.');if(!(user.smc||user.admin)&&record.staffId!==user.staffId)error_(403,'You can manage only your own absence records.');if(record.date<today)error_(403,'Past absence entries are view only.');};
 if(command.operation==='requestMutual'){
  const absence=state.absences.find(a=>a.id===command.absenceId);owned(absence);if(!Array.isArray(command.requests)||!command.requests.length||command.requests.length>40)error_(400,'Select colleagues for at least one lesson.');
  const demands=new Set();for(const request of command.requests){if(!object(request)||!Array.isArray(request.demandIds)||!request.demandIds.length||request.demandIds.length>40||request.demandIds.some(id=>!short(id,240)||!id.startsWith(absence.id+':')||demands.has(id))||!people.some(p=>p.id===request.recipientId)||request.recipientId===absence.staffId||request.combination!==undefined&&typeof request.combination!=='boolean')error_(400,'Supply valid colleague proposals for this absence.');request.demandIds.forEach(id=>demands.add(id));}
  return {dates:[absence.date],staffIds:[absence.staffId],absenceApplied:true,savedIds:[absence.id],peerState:'pending',instructionState:'none'};
 }
 const staffIds=GSISRosterOperations.absenceStaffIds(ctx,command),existing=command.id?state.absences.find(a=>a.id===command.id):null;
 if(command.id){owned(existing);if(staffIds.length!==1||existing.staffId!==staffIds[0])error_(400,'The absent teacher cannot change on an existing entry.');}
 else if(staffIds.some(id=>!GSISRosterOperations.absenceEligible(people.find(p=>p.id===id))))error_(403,'This staff category is not included in Report Absence.');
 const dates=existing?[existing.date]:GSISRosterOperations.absenceDates(command);if(dates.some(date=>date<today))error_(403,'Past absence entries are view only.');
 const type=state.types.find(t=>t.id===command.typeId);if(!type)error_(400,'Select an available absence type.');
 if(!short(command.reasonDetail||'',500)||(type.requiresDetail||type.id==='others')&&!String(command.reasonDetail||'').trim())error_(400,'Please specify the absence reason.');
 if(type.afterMinutes!==null&&type.afterMinutes!==undefined&&minute<type.afterMinutes)error_(400,'This absence type is not available at this time.');if(type.todayOnly&&dates.some(date=>date!==today))error_(400,'This absence type is for today only.');
 const coverage=command.fullDay===true?{kind:'fullDay'}:command.coverage;
 if(coverage!==undefined&&coverage!==null){if(!object(coverage)||coverage.kind!=='fullDay'&&(coverage.kind!=='timeRange'||!Number.isInteger(coverage.startMinutes)||!Number.isInteger(coverage.endMinutes)||coverage.startMinutes<0||coverage.endMinutes>1440||coverage.startMinutes>=coverage.endMinutes))error_(400,'Choose full day or a valid start and end time.');if(coverage.kind==='fullDay'&&type.allowSelectAll===false)error_(400,'Select periods for this absence type.');}
 else if(!periods(command.periods))error_(400,'Select valid absent periods.');
 if(command.reliefRequired!==undefined&&typeof command.reliefRequired!=='boolean'||command.instructionsNA!==undefined&&typeof command.instructionsNA!=='boolean'||command.remarks!==undefined&&!short(command.remarks,2000))error_(400,'Supply valid absence details.');
 const notes=value=>object(value)&&Object.keys(value).length<=100&&Object.entries(value).every(([key,text])=>short(key,2000)&&short(text,8000)),dated=value=>object(value)&&Object.entries(value).every(([date,value])=>dates.includes(date)&&notes(value));
 if(command.instructionsByDate!==undefined&&(!dated(command.instructionsByDate)||staffIds.length>1||command.instructionsByStaffDate!==undefined))error_(400,'Supply dated instructions for each absent teacher.');
 if(command.instructionsByStaffDate!==undefined&&(!object(command.instructionsByStaffDate)||Object.entries(command.instructionsByStaffDate).some(([id,value])=>!staffIds.includes(id)||!dated(value))))error_(400,'Supply valid dated relief instructions.');
 let hasPeers=false;const map=command.ownArrangementsByStaffDate;
 if(map!==undefined){if(!object(map))error_(400,'Supply valid colleague proposals.');for(const [staffId,datedPicks] of Object.entries(map)){if(!staffIds.includes(staffId)||!object(datedPicks))error_(400,'Choose a selected absent teacher for each proposal.');for(const [date,picks] of Object.entries(datedPicks)){if(!dates.includes(date)||!Array.isArray(picks)||picks.length>40)error_(400,'Supply valid dated colleague proposals.');const selected=new Set();for(const pick of picks){if(!object(pick)||!Number.isInteger(pick.period)||pick.period<0||pick.period>39||selected.has(pick.period)||!people.some(person=>person.id===pick.recipientId)||pick.recipientId===staffId||!short(pick.lessonKey,2000)||!short(pick.expectedTimetableId,240)||!['odd','even','single'].includes(pick.expectedParity)||!Number.isInteger(pick.expectedStaplerRevision)||pick.expectedStaplerRevision<0||pick.combination!==undefined&&typeof pick.combination!=='boolean')error_(400,'Supply a valid colleague and lesson for each proposal.');if(pick.combination===true&&(!Array.isArray(pick.expectedRecipientCell)||pick.expectedRecipientCell.length!==4||pick.expectedRecipientCell.some(cell=>!short(cell,2000))))error_(400,'Review the colleague class for this combination.');selected.add(pick.period);hasPeers=true;}}}}
 const datedNotes=command.instructionsByStaffDate?Object.values(command.instructionsByStaffDate):[command.instructionsByDate||{}],hasInstructions=datedNotes.some(dated=>Object.values(dated).some(notes=>Object.values(notes).some(text=>String(text).trim())));
 return {dates,staffIds,absenceApplied:false,savedIds:[],peerState:hasPeers?'pending':'none',instructionState:hasInstructions?'pending':'none'};
}
function rosterAbsenceIntakeCapture_(req,c){
 gsisRequireBackendRole_('roster');const receivedAt=Date.now(),user=rosterOperationsAuthority_(c,req.identity),command=rosterAbsenceIntakeCommand_(req.input),digest=rosterOperationsCommandDigest_(command);
 if(!user.smc&&!user.admin&&!c.rosterPeople.some(person=>person.id===user.staffId))error_(403,'Current Roster access is required.');
 const initial=rosterAbsenceIntakeState_(),prior=initial.entries.find(row=>row.id===command.requestId);if(prior)return {...rosterAbsenceIntakeReceiptValue_(rosterAbsenceIntakeMatch_(prior,req.identity,digest)),replayed:true};
 // Primary facts are read before taking the independent journal lock. These are
 // intake checks, not a claim that lesson or allocation validation has completed.
 // The authenticated bridge supplies trustedIntakeAt only from a durable D1
 // receipt; browser inputs cannot set it. Keep one clock for validation and the
 // journal even when forwarding or a lock wait crosses Singapore midnight.
 const suppliedAt=req.input.trustedIntakeAt,capturedAt=suppliedAt===undefined?receivedAt:Date.parse(suppliedAt);
 if(suppliedAt!==undefined&&(typeof suppliedAt!=='string'||!Number.isFinite(capturedAt)||new Date(capturedAt).toISOString()!==suppliedAt))error_(400,'The durable report timestamp is invalid.');
 if(capturedAt>receivedAt)error_(503,'The durable report timestamp is ahead of the Roster clock. Retry the same report.');
 const details=rosterAbsenceIntakeValidate_(command,user,c,capturedAt);
 return rosterAbsenceIntakeLocked_(state=>{
  const old=state.entries.find(row=>row.id===command.requestId);if(old)return {...rosterAbsenceIntakeReceiptValue_(rosterAbsenceIntakeMatch_(old,req.identity,digest)),replayed:true};
  const row={id:command.requestId,sequence:++state.sequence,digest,actor:req.identity.email,identity:{email:req.identity.email,subject:req.identity.subject},command,acceptedAt:new Date(capturedAt).toISOString(),state:'pending',...details,mutualRequestIds:[],instructionCursor:0,peerCursor:0,attempts:0};state.entries.push(row);rosterAbsenceIntakeCommit_(state);return rosterAbsenceIntakeReceiptValue_(row);
 });
}
function rosterAbsenceIntakeReceipt_(req,c){
 rosterOperationsAuthority_(c,req.identity);const command=rosterAbsenceIntakeCommand_(req.input?.command),state=rosterAbsenceIntakeState_(),row=state.entries.find(row=>row.id===command.requestId);
 return row?rosterAbsenceIntakeReceiptValue_(rosterAbsenceIntakeMatch_(row,req.identity,rosterOperationsCommandDigest_(command))):{accepted:false,intakeReceipt:true,requestId:command.requestId,intakeState:'unconfirmed'};
}
function rosterAbsenceIntakeJob_(row){return rosterAbsenceIntakeCopy_({...row,requestId:row.id});}
function rosterAbsenceIntakeClaim_(limit=1,dates=null){
 if(!Number.isInteger(limit)||limit<1||limit>5)error_(400,'Choose one to five intake jobs.');if(dates!==null&&(!Array.isArray(dates)||dates.some(date=>typeof date!=='string'||!/^\d{4}-\d\d-\d\d$/.test(date))))error_(400,'Choose valid intake dates.');
 return rosterAbsenceIntakeLocked_(state=>{
  const now=Date.now(),recoveryKind=row=>{
   if(row.state!=='needsReview'||row.absenceApplied||row.command?.operation!=='saveAbsence'||row.resolution)return null;
   if(row.failureCode==='ABSENCE_OVERLAP'&&row.mergeRecoveryVersion!=='098d')return 'overlap';
   if(row.failureCode==='ABSENCE_SHORTER_CONFIRMATION'&&row.shorterRecoveryVersion!=='098n')return 'shorter';
   return null;
  },rank=row=>row.absenceApplied?2:row.state==='pending'?0:1,rows=state.entries.filter(row=>(row.state==='pending'||recoveryKind(row))&&row.command&&(!row.claimExpiresAt||row.claimExpiresAt<=now)&&(!row.nextAttemptAt||row.nextAttemptAt<=now)&&(!dates||row.dates.some(date=>dates.includes(date)))).sort((a,b)=>rank(a)-rank(b)||a.sequence-b.sequence).slice(0,limit);
  for(const row of rows){const recovery=recoveryKind(row);if(recovery){if(recovery==='shorter')row.shorterRecoveryVersion='098n';else row.mergeRecoveryVersion='098d';row.state='pending';delete row.failureCode;delete row.reasonCode;}row.claimId=Utilities.getUuid();row.claimExpiresAt=now+90000;row.attempts=(row.attempts||0)+1;}
  if(rows.length)rosterAbsenceIntakeCommit_(state);return rows.map(rosterAbsenceIntakeJob_);
 });
}
function rosterAbsenceIntakeGetClaim_(requestId,claimId){
 const row=rosterAbsenceIntakeState_().entries.find(row=>row.id===requestId);if(!row||row.state!=='pending'||row.claimId!==claimId||row.claimExpiresAt<=Date.now())error_(409,'Absence intake processing lease changed.');return rosterAbsenceIntakeJob_(row);
}
function rosterAbsenceIntakeSettle_(requestId,claimId,outcome){
 if(!outcome||!['pending','applied','needsReview'].includes(outcome.state)||['peerState','instructionState'].some(key=>outcome[key]!==undefined&&!['pending','applied','needsReview','none'].includes(outcome[key]))||outcome.reasonCode!==undefined&&!/^[A-Z][A-Z0-9_]{0,79}$/.test(outcome.reasonCode))error_(400,'Supply a valid intake result.');
 if(outcome.failureCode!==undefined&&outcome.failureCode!==null&&!rosterAbsenceIntakeSafeFailure_(outcome.failureCode))error_(400,'Supply a recognised intake failure code.');
 for(const key of ['savedIds','mutualRequestIds'])if(outcome[key]!==undefined&&(!Array.isArray(outcome[key])||outcome[key].some(id=>typeof id!=='string'||!id||id.length>240)))error_(400,'Supply valid saved references.');
 for(const key of ['instructionCursor','peerCursor'])if(outcome[key]!==undefined&&(!Number.isSafeInteger(outcome[key])||outcome[key]<0||outcome[key]>1000000))error_(400,'Supply valid intake progress.');
 return rosterAbsenceIntakeLocked_(state=>{
  const row=state.entries.find(row=>row.id===requestId);if(!row||row.state!=='pending'||row.claimId!==claimId||row.claimExpiresAt<=Date.now())error_(409,'Absence intake processing lease changed.');
  row.absenceApplied=row.absenceApplied===true||outcome.absenceApplied===true;for(const key of ['savedIds','mutualRequestIds'])if(outcome[key])row[key]=[...new Set([...(row[key]||[]),...outcome[key]])];
  for(const key of ['instructionCursor','peerCursor'])if(outcome[key]!==undefined)row[key]=Math.max(row[key]||0,outcome[key]);
  if(outcome.state==='applied'&&(!row.absenceApplied||['peerState','instructionState'].some(key=>!['none','applied'].includes(outcome[key]??row[key]??'none'))))error_(400,'Confirm the saved absence, instructions and peer result before completing intake.');
  row.state=outcome.state;for(const key of ['peerState','instructionState'])if(outcome[key]!==undefined)row[key]=outcome[key];if(outcome.reasonCode)row.reasonCode=outcome.reasonCode;else delete row.reasonCode;
  if(outcome.failureCode)row.failureCode=outcome.failureCode;else delete row.failureCode;
  if(row.state==='applied')row.completedAt=new Date().toISOString();if(row.state==='pending'&&outcome.retryAfterMs!==undefined)row.nextAttemptAt=Date.now()+Math.max(1000,Math.min(300000,Number(outcome.retryAfterMs)||1000));else delete row.nextAttemptAt;
  if(outcome.retainClaim===true&&row.state==='pending')row.claimExpiresAt=Date.now()+90000;else{delete row.claimId;delete row.claimExpiresAt;}rosterAbsenceIntakeCommit_(state);return rosterAbsenceIntakeReceiptValue_(row);
 });
}
function rosterAbsenceIntakePending_(dates=null){
 const state=rosterAbsenceIntakeState_(),rows=state.entries.filter(row=>!['applied','withdrawn'].includes(row.state)&&(!dates||row.dates.some(date=>dates.includes(date)))),pending=rows.filter(row=>!row.absenceApplied&&row.command?.operation==='saveAbsence'),peers=rows.filter(row=>row.state==='pending'&&row.absenceApplied===true&&row.peerState==='pending');
 return {revision:state.revision,pendingCaptureCount:pending.length,pendingPeerCount:peers.length,peerReviewCount:rows.filter(row=>row.absenceApplied&&row.peerState==='needsReview').length,blockedDates:[...new Set(pending.flatMap(row=>row.dates))].sort(),peerBlockedDates:[...new Set(peers.flatMap(row=>row.dates))].sort(),requestIds:pending.map(row=>row.id)};
}
function rosterAbsenceIntakeVisible_(req,c){
 const user=rosterOperationsAuthority_(c,req.identity),state=rosterAbsenceIntakeState_(),date=req.input?.date?GSISRosterOperations.date(req.input.date):null,school=(user.smc||user.admin)&&req.input?.scope!=='mine',all=state.entries.filter(row=>(school||row.actor===req.identity.email)&&row.command&&(!date||row.dates.includes(date)));
 // Old unresolved reports must stay visible ahead of newer completed reports.
 const terminal=row=>['applied','withdrawn'].includes(row.state),rows=all.sort((a,b)=>terminal(a)-terminal(b)||(terminal(a)?b.sequence-a.sequence:a.sequence-b.sequence)).slice(0,150);
 return {revision:state.revision,entries:rows.map(row=>({...rosterAbsenceIntakeReceiptValue_(row),command:rosterAbsenceIntakeCopy_(row.command),dates:row.dates.slice()})),total:all.length,hasMore:all.length>rows.length,pendingCaptureCount:all.filter(row=>!terminal(row)&&!row.absenceApplied).length,peerReviewCount:all.filter(row=>!terminal(row)&&row.absenceApplied&&row.peerState==='needsReview').length};
}
function rosterAbsenceIntakeCoverage_(coverage){
 if(coverage?.kind==='fullDay')return {kind:'fullDay'};
 if(coverage?.kind==='timeRange')return {kind:'timeRange',startMinutes:coverage.startMinutes,endMinutes:coverage.endMinutes};
 if(coverage?.kind==='timeRanges')return {kind:'timeRanges',ranges:coverage.ranges.map(({startMinutes,endMinutes})=>({startMinutes,endMinutes}))};
 return null;
}
function rosterAbsenceIntakeReview_(req,c){
 // Current Contacts authority is checked before either private store is read.
 const user=rosterOperationsAuthority_(c,req.identity);
 const id=req.input?.intakeRequestId;if(typeof id!=='string'||!/^[-\w]{36}$/.test(id))error_(400,'Identify the received report to review.');
 const row=rosterAbsenceIntakeState_().entries.find(row=>row.id===id);if(!row?.command||row.command.operation!=='saveAbsence')error_(404,'The original absence report is unavailable for review.');
 if(!user.smc&&!user.admin&&!(row.actor===req.identity.email&&row.failureCode==='ABSENCE_SHORTER_CONFIRMATION'))error_(403,'Only the reporter or SMC can review this shorter report.');
 const state=rosterOperationsState_(true),people=rosterOperationsPeople_(c),command=row.command,dates=row.dates.slice().sort(),wanted=new Set(dates),byDate=new Map();
 for(const record of state.absences)if(!record.deletedAt&&wanted.has(record.date)){if(!byDate.has(record.date))byDate.set(record.date,[]);byDate.get(record.date).push(record);}
 const mobile=id=>GSISRosterOperations.mobile(people.find(person=>person.id===id)?.mobile),same=(a,b)=>a===b||!!mobile(a)&&mobile(a)===mobile(b),type=state.types.find(type=>type.id===command.typeId);
 const teachers=row.staffIds.map(staffId=>{
  const rows=dates.map(date=>({date,savedEntries:(byDate.get(date)||[]).filter(record=>same(record.staffId,staffId)).map(record=>({id:record.id,staffId:record.staffId,coverage:rosterAbsenceIntakeCoverage_(record.coverage),periods:(record.periods||[]).slice(),periodTimes:(record.periodSnapshot||[]).filter(period=>(record.periods||[]).includes(period.period)).map(({period,startMinutes,endMinutes})=>({period,startMinutes,endMinutes})),typeId:record.typeId,typeLabel:record.typeLabel||record.typeId,reliefRequired:record.reliefRequired===true}))}));
  return {staffId,name:people.find(person=>person.id===staffId)?.name||staffId,dates:rows,missingDates:rows.filter(day=>!day.savedEntries.length).map(day=>day.date)};
 });
 // The presence of an entry does not prove matching coverage, type or relief.
 // This snapshot never applies, retries, withdraws or clears a pending gate.
 return {...rosterAbsenceIntakeReceiptValue_(row),readOnly:true,checkedAt:new Date().toISOString(),registerRevision:state.revision,overlapToken:rosterAbsenceOverlapKey_(state,command),requested:{coverage:rosterAbsenceIntakeCoverage_(command.fullDay===true?{kind:'fullDay'}:command.coverage),periods:(command.periods||[]).slice(),typeId:command.typeId,typeLabel:type?.label||command.typeId,reliefRequired:command.reliefRequired!==false},teachers};
}
// Token binds a coverage decision to all absence facts on its requested dates.
// A concurrent save forces a new preview; no blind overwrite or second lock.
function rosterAbsenceOverlapKey_(state,command){
 const dates=new Set(GSISRosterOperations.absenceDates(command));
 return rosterOperationsDigest_([state.revision,state.absences.filter(a=>dates.has(a.date)).sort((a,b)=>a.id.localeCompare(b.id)),(state.assignments||[]).filter(a=>dates.has(a.date)),(state.requests||[]).filter(a=>dates.has(a.date))]);
}
function rosterAbsenceIntakeRetry_(req,c){
 const user=rosterOperationsAuthority_(c,req.identity),p=req.input||{};
 return rosterAbsenceIntakeLocked_(state=>{
  const row=state.entries.find(row=>row.id===p.requestId);
  if(!row||!(user.smc||user.admin||row.actor===req.identity.email))error_(403,'This report is not available for retry.');
  if(p.overlapChoice!==undefined){
   if(!['keep','replace'].includes(p.overlapChoice)||typeof p.overlapToken!=='string'||!/^[a-f0-9]{64}$/.test(p.overlapToken)||typeof p.decisionId!=='string'||!/^[-\w]{36}$/.test(p.decisionId))error_(400,'Review the saved coverage before choosing.');
   if(row.overlapChoice?.requestId===p.decisionId){if(row.overlapChoice.value!==p.overlapChoice||row.overlapChoice.token!==p.overlapToken||row.overlapChoice.actor!==req.identity.email)error_(409,'This decision ID was used for another choice.');return rosterAbsenceIntakeReceiptValue_(row);}
   if(row.failureCode!=='ABSENCE_SHORTER_CONFIRMATION'||row.absenceApplied||row.state!=='needsReview')error_(409,'This report changed. Check its current status before choosing.');
  }
  if(row.state==='applied')return rosterAbsenceIntakeReceiptValue_(row);
  if(row.state==='withdrawn')error_(409,'SMC withdrew this report. Submit a new report if an absence still needs recording.');
  if(row.claimExpiresAt>Date.now())error_(409,'This report is already being processed.');
  if(!row.command)error_(409,'This report no longer has a recoverable command.');
  if(p.overlapChoice!==undefined)row.overlapChoice={value:p.overlapChoice,token:p.overlapToken,requestId:p.decisionId,actor:req.identity.email,at:new Date().toISOString()};
  row.state='pending';for(const [key,cursor] of [['peerState','peerCursor'],['instructionState','instructionCursor']])if(row[key]==='needsReview'){row[key]='pending';row[cursor]=0;}
  delete row.nextAttemptAt;delete row.claimId;delete row.claimExpiresAt;delete row.reasonCode;delete row.failureCode;rosterAbsenceIntakeCommit_(state);return rosterAbsenceIntakeReceiptValue_(row);
 });
}
function rosterAbsenceIntakeResolve_(req,c){
 const user=rosterOperationsAuthority_(c,req.identity),p=req.input||{};if(!user.smc&&!user.admin)error_(403,'Only SMC or Admin can resolve a captured report.');
 if(p.resolution!=='withdraw'||typeof p.requestId!=='string'||!/^[-\w]{36}$/.test(p.requestId)||typeof p.intakeRequestId!=='string'||!/^[-\w]{36}$/.test(p.intakeRequestId)||typeof p.reason!=='string'||!p.reason.trim()||p.reason.length>1000)error_(400,'Identify the captured report and give a reason for withdrawing it.');
 const digest=rosterOperationsDigest_([p.intakeRequestId,p.resolution,p.reason]),actor=req.identity.email,actorName=String(c.rosterPeople.find(person=>String(person.id)===user.staffId)?.name||'SMC / Admin').slice(0,160);
 return rosterAbsenceIntakeLocked_(state=>{
  const prior=state.entries.find(row=>row.resolution?.requestId===p.requestId);if(prior){if(prior.resolution.actor!==actor)error_(403,'This resolution receipt belongs to another SMC member.');if(prior.resolution.digest!==digest)error_(409,'This resolution request ID was used for a different decision.');return rosterAbsenceIntakeReceiptValue_(prior);}
  const row=state.entries.find(row=>row.id===p.intakeRequestId);if(!row)error_(404,'The captured report is unavailable.');
  if(row.state!=='needsReview'||row.absenceApplied||row.claimExpiresAt>Date.now())error_(409,'Only an unclaimed report needing review, with no saved absence, can be withdrawn.');
  const at=new Date().toISOString();row.state='withdrawn';row.completedAt=at;row.reasonCode='SMC_WITHDRAWN';delete row.failureCode;row.resolution={requestId:p.requestId,digest,action:'withdraw',reason:p.reason.trim(),actor,actorName,at};delete row.claimId;delete row.claimExpiresAt;delete row.nextAttemptAt;
  rosterAbsenceIntakeCommit_(state);return rosterAbsenceIntakeReceiptValue_(row);
 });
}
