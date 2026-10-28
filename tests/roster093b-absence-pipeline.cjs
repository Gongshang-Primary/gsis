'use strict';
// Real operations/domain with a small journal boundary. No school records or sends.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const adapter=require('./roster701-adapter.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const h=adapter(),contacts={rosterPeople:h.ctx.people,rosterSMCIds:['alice'],rosterAdminIds:['alice'],user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true}};
 h.scope.contacts_=()=>contacts;
 const jobs=new Map(),settles=[];let pending=0,pendingPeers=0;
 h.scope.rosterAbsenceIntakeGetClaim_=(id,claim)=>{const job=jobs.get(id);if(!job||job.claimId!==claim)throw Object.assign(Error('Wrong lease'),{status:409});return clone(job);};
 h.scope.rosterAbsenceIntakeClaim_=()=>[...jobs.values()].filter(j=>j.state==='pending').slice(0,1).map(clone);
 h.scope.rosterAbsenceIntakeSettle_=(id,claim,value)=>{const job=jobs.get(id);assert.equal(job.claimId,claim);settles.push(clone(value));Object.assign(job,clone(value));return clone(job);};
 h.scope.rosterAbsenceIntakePending_=()=>({revision:pending,pendingCaptureCount:pending,pendingPeerCount:pendingPeers,peerBlockedDates:pendingPeers?[h.date]:[],peerReviewCount:0,blockedDates:pending?[h.date]:[],requestIds:[]});
 h.scope.rosterAbsenceIntakeCapture_=(req,c)=>({accepted:true,intakeReceipt:true,requestId:req.input.requestId,savedIds:[],intakeState:'pending'});
 h.scope.rosterAbsenceIntakeReceipt_=req=>({accepted:true,intakeReceipt:true,requestId:req.input.command.requestId,savedIds:[]});
 h.scope.rosterAbsenceIntakeVisible_=()=>({entries:[]});
 h.scope.rosterAbsenceIntakeRetry_=()=>({queued:true});
 if(fs.existsSync('backend/RosterAbsencePipeline.gs'))vm.runInContext(fs.readFileSync('backend/RosterAbsencePipeline.gs','utf8'),h.scope);
 const make=(extra={})=>{const id=crypto.randomUUID(),command={operation:'saveAbsence',view:'report',requestId:id,revision:0,date:h.date,staffId:'alice',typeId:'mc',periods:[2],instructionsNA:true,intake:true,...extra},job={id,requestId:id,claimId:crypto.randomUUID(),sequence:1,identity:{...h.ctx.user},command,dates:[h.date],acceptedAt:h.ctx.iso,state:'pending',absenceApplied:false,savedIds:[],peerState:'none',mutualRequestIds:[]};jobs.set(id,job);return job;};
 const process=job=>h.scope.rosterAbsenceIntakeProcess_({input:{operation:'processAbsenceIntake',requestId:job.requestId,claimId:job.claimId,calendarByDate:{[h.date]:{date:h.date,schoolDay:true,parity:'even'}},notificationsReady:true}});
 return {...h,contacts,jobs,settles,make,process,setPending:n=>pending=n,setPendingPeers:n=>pendingPeers=n};
}
module.exports=setup;
if(require.main===module){
{
 const h=setup(),job=h.make();const received=h.scope.rosterOperationsDispatch_({identity:job.identity,input:job.command},h.contacts);
 assert.equal(received.intakeReceipt,true,'intake routes before expensive absence preparation');assert.equal(h.calls.writes,0);assert.equal(h.calls.contexts.length,0);
 const receipt=h.scope.rosterOperationsDispatch_({identity:job.identity,input:{operation:'receiptStatus',command:job.command}},h.contacts);assert.equal(receipt.intakeReceipt,true);assert.equal(h.calls.reads,0,'capture retry needs no primary operations receipt');
}
{
 const h=setup(),job=h.make();h.scope.rosterOperationsReconcile_=()=>{throw Error('Core attendance must not reconcile unrelated allocation records');};h.scope.GSISRosterAllocation={...h.scope.GSISRosterAllocation,initialiseHistory:()=>{throw Error('Core attendance must not read accounting');},captureWeek:()=>{throw Error('Core attendance must not capture accounting');}};const result=h.process(job);
 assert.equal(result.absenceApplied,true);assert.equal(result.intakeState,'applied');assert.equal(h.state().absences.length,1);assert.equal(h.calls.writes,1);assert.equal(job.savedIds.length,1);
 // Replay after the durable primary write but before journal settlement.
 job.state='pending';job.absenceApplied=false;job.savedIds=[];const replay=h.process(job);assert.equal(replay.absenceApplied,true);assert.equal(h.calls.writes,1,'one captured command never creates a second absence');
}
{
 const h=setup(),lesson=h.O.previewAbsence(h.ctx,{id:'preview',staffId:'alice',date:h.date,periods:[2],reliefRequired:true})[0],job=h.make({ownArrangementsByStaffDate:{alice:{[h.date]:[{period:2,recipientId:'bob',combination:false,lessonKey:lesson.lessonKey,expectedTimetableId:'baseline',expectedParity:'even',expectedStaplerRevision:0}]}}});
 const result=h.process(job);assert.equal(result.absenceApplied,true);assert.equal(result.peerState,'applied');assert.equal(h.state().absences.length,1);assert.equal(h.state().requests.length,1);assert.equal(result.mutualRequestIds.length,1);assert.equal(h.calls.writes,2,'core attendance and proposal have separate durable receipts');
 job.state='pending';job.absenceApplied=false;job.savedIds=[];job.mutualRequestIds=[];h.process(job);assert.equal(h.calls.writes,2);assert.equal(h.state().requests.length,1,'a resumed pipeline does not invite the peer twice');
}
{
 const h=setup(),job=h.make({ownArrangementsByStaffDate:{alice:{[h.date]:[{period:2,recipientId:'bob',combination:false,lessonKey:'stale',expectedTimetableId:'baseline',expectedParity:'even',expectedStaplerRevision:0}]}}});
 const result=h.process(job);assert.equal(result.absenceApplied,true);assert.equal(result.intakeState,'needsReview');assert.equal(result.peerState,'needsReview');assert.equal(h.state().absences.length,1);assert.equal(h.state().requests.length,0,'bad peer selection must not remove the recorded absence');assert.equal(h.calls.writes,1);
}
{
 const h=setup(),job=h.make();h.loseNextResponse();const result=h.process(job);assert.equal(result.intakeState,'pending');assert.equal(h.state().absences.length,1,'uncertain journal checkpoint leaves primary committed receipt');const replay=h.process(job);assert.equal(replay.absenceApplied,true);assert.equal(h.calls.writes,1);
}
for(const stale of [false,true]){
 const h=setup(),lesson=h.O.previewAbsence(h.ctx,{id:'preview',staffId:'alice',date:h.date,periods:[2],reliefRequired:true})[0],job=h.make({instructionsNA:false,instructionsByDate:{[h.date]:{[lesson.lessonKey]:'Complete the worksheet.'}},expectedInstructionScopes:{[h.date]:{timetableId:stale?'replaced-baseline':'baseline',parity:'even',staplerRevision:0}}});
 const result=h.process(job);assert.equal(result.absenceApplied,true);assert.equal(h.state().absences.length,1);assert.equal(result.instructionState,stale?'needsReview':'applied');assert.equal(result.intakeState,stale?'needsReview':'applied');assert.equal(h.state().absences[0].instructions[lesson.lessonKey],stale?undefined:'Complete the worksheet.');assert.equal(h.calls.writes,stale?1:2);
 if(!stale){job.state='pending';job.absenceApplied=false;job.savedIds=[];h.process(job);assert.equal(h.calls.writes,2,'instruction receipt retries must not rewrite later human edits');}
}
{
 const h=setup(),job=h.make();h.process(job);const absence=h.state().absences[0],id=crypto.randomUUID(),peer={...job,id,requestId:id,claimId:crypto.randomUUID(),command:{operation:'requestMutual',intake:true,requestId:id,date:h.date,absenceId:absence.id,requests:[{demandIds:[absence.id+':2'],recipientId:'bob',combination:false}]},state:'pending',absenceApplied:true,savedIds:[absence.id],peerState:'pending'};h.jobs.set(id,peer);
 h.scope.rosterOperationsReconcile_=()=>{throw Error('A tentative proposal does not reconcile allocation accounting');};h.scope.GSISRosterAllocation={...h.scope.GSISRosterAllocation,initialiseHistory:()=>{throw Error('A tentative proposal does not initialise accounting');},captureWeek:()=>{throw Error('A tentative proposal does not capture accounting');}};
 const result=h.process(peer);assert.equal(result.peerState,'applied');assert.equal(h.state().absences.length,1);assert.equal(h.state().requests.length,1);assert.equal(h.calls.writes,2,'existing absence proposal needs only its independent proposal commit');
}
{
 const h=setup(),job=h.make();assert.throws(()=>h.scope.rosterAbsenceIntakeProcess_({input:{requestId:job.requestId,claimId:'wrong',command:{operation:'deleteAbsences'}}}),e=>e.status===409);assert.equal(h.calls.writes,0);
 const deferred=h.scope.rosterAbsenceIntakeDefer_({input:{requestId:job.requestId,claimId:job.claimId,reasonCode:'CALENDAR_UNAVAILABLE'}});assert.equal(deferred.intakeState,'pending');assert.equal(job.reasonCode,'CALENDAR_UNAVAILABLE');assert.equal(h.calls.writes,0);
}
{
 const h=setup();h.setPending(1);assert.throws(()=>h.scope.rosterAbsenceIntakeGate_([h.date]),e=>e.code==='ABSENCE_INTAKE_PENDING');h.setPending(0);assert.doesNotThrow(()=>h.scope.rosterAbsenceIntakeGate_([h.date]));
 h.setPending(1);assert.throws(()=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:{operation:'autoAllocate',date:h.date,requestId:crypto.randomUUID(),revision:0}},h.contacts),e=>e.code==='ABSENCE_INTAKE_PENDING');assert.equal(h.calls.writes,0);assert.equal(h.calls.contexts.length,0,'pending captured attendance stops allocation before recomputing');
}
{
 const h=setup();h.setPendingPeers(1);assert.throws(()=>h.scope.rosterAbsenceIntakeGate_([h.date],true),e=>e.code==='ABSENCE_INTAKE_PENDING');assert.doesNotThrow(()=>h.scope.rosterAbsenceIntakeGate_([h.date],false),'peer-only capture does not block publication');
 assert.throws(()=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:{operation:'autoAllocate',date:h.date,requestId:crypto.randomUUID(),revision:0}},h.contacts),e=>e.code==='ABSENCE_INTAKE_PENDING');assert.equal(h.calls.contexts.length,0);
}
{
 const h=setup(),lock=h.scope.LockService.getScriptLock();let userLocked=false,deny=false;
 const enter=h.scope.deployLock_,leave=h.scope.deployUnlock_;
 h.scope.LockService.getUserLock=()=>({intake:true});h.scope.deployLock_=(lock,ms)=>{if(!lock.intake)return enter(lock,ms);assert(h.locked(),'final attendance fence acquires UserLock inside ScriptLock');assert(!userLocked);if(deny)return false;userLocked=true;return true;};h.scope.deployUnlock_=lock=>{if(!lock.intake)return leave(lock);assert(userLocked);userLocked=false;};
 // A capture arrives after allocation's first check, during precommit packing.
 const pack=h.scope.rosterOperationsPackPlans_;h.scope.rosterOperationsPackPlans_=state=>{h.setPending(1);return pack(state);};
 enter(lock);try{assert.throws(()=>h.scope.rosterOperationsCommit_(h.state(),[h.date]),e=>e.code==='ABSENCE_INTAKE_PENDING');assert.equal(h.calls.writes,0);assert.equal(userLocked,false,'error releases final fence');}finally{leave(lock);}
 h.scope.rosterOperationsPackPlans_=pack;h.setPending(0);deny=true;enter(lock);try{assert.throws(()=>h.scope.rosterOperationsCommit_(h.state(),[h.date]),e=>e.code==='ABSENCE_INTAKE_BUSY');assert.equal(h.calls.writes,0);}finally{leave(lock);}
 deny=false;enter(lock);try{h.scope.rosterOperationsCommit_(h.state(),[h.date]);assert.equal(h.calls.writes,1);assert.equal(userLocked,false);}finally{leave(lock);}
}
{
 const h=setup(),job=h.make({instructionsNA:false,instructionsByDate:{[h.date]:{lesson:'Retained notes'}}}),state=h.state();
 state.absences=Array.from({length:6},(_,i)=>({id:'saved-'+i,staffId:'alice',date:h.date}));h.setState(state);job.absenceApplied=true;job.savedIds=state.absences.map(a=>a.id);job.instructionState='pending';let notes=0;
 h.scope.rosterAbsenceDispatch_=req=>{assert.equal(req.input.operation,'saveInstructions');notes++;return {savedIds:[req.input.absenceId],notificationsQueued:0};};
 const first=h.process(job);assert.equal(first.intakeState,'pending');assert.equal(notes,4,'one processor turn has bounded child writes');assert.equal(job.instructionCursor,4);
 const second=h.process(job);assert.equal(second.intakeState,'applied');assert.equal(notes,6,'next claim resumes after completed instructions');assert.equal(second.instructionState,'applied');
}
{
 // Exercise real journal + real primary adapter, including the different locks.
 const h=setup(),scope=h.scope,files=new Map(),props=new Map([['ROSTER_OPERATIONS_FILE','ops-file']]);let userLocked=false,nextFile=0;
 const primaryRead=scope.rosterReadFile_,primaryWrite=scope.rosterDriveRequest_,enter=scope.deployLock_,leave=scope.deployUnlock_;
 scope.LockService.getUserLock=()=>({kind:'user'});scope.deployLock_=(lock,ms)=>{if(lock.kind!=='user')return enter(lock,ms);assert(!userLocked);userLocked=true;return true;};scope.deployUnlock_=lock=>{if(lock.kind!=='user')return leave(lock);assert(userLocked);userLocked=false;};
 scope.props_=()=>({getProperty:key=>props.get(key)||null,setProperty:(key,value)=>props.set(key,value)});scope.Session={getEffectiveUser:()=>({getEmail:()=> 'execution-owner@gsps.edu.sg'})};
 scope.Utilities.newBlob=text=>({getDataAsString:()=>text});scope.rosterFindFile_=(folder,name)=>[...files].find(([,file])=>file.name===name)?.[0]||'';scope.rosterReadFile_=id=>files.has(id)?files.get(id).text:primaryRead(id);
 scope.rosterCreateFile_=(folder,name,blob)=>{assert(userLocked);const id='journal-'+(++nextFile);files.set(id,{name,text:blob.getDataAsString()});return id;};scope.rosterDriveRequest_=(url,options,operation)=>{if(operation!=='absence-intake-commit')return primaryWrite(url,options,operation);assert(userLocked);const id=url.match(/\/files\/([^?]+)/)[1];files.get(id).text=options.payload;return {};};
 vm.runInContext(fs.readFileSync('backend/RosterAbsenceIntake.gs','utf8'),scope);
 const lesson=h.O.previewAbsence(h.ctx,{id:'preview',staffId:'alice',date:h.date,periods:[2],reliefRequired:true})[0],command=h.make({instructionsNA:false,instructionsByDate:{[h.date]:{[lesson.lessonKey]:'Read chapter 1.'}},expectedInstructionScopes:{[h.date]:{timetableId:'baseline',parity:'even',staplerRevision:0}},ownArrangementsByStaffDate:{alice:{[h.date]:[{period:2,recipientId:'bob',combination:false,lessonKey:lesson.lessonKey,expectedTimetableId:'baseline',expectedParity:'even',expectedStaplerRevision:0}]}}}).command,req={identity:h.ctx.user,input:command},script=scope.LockService.getScriptLock();enter(script);let received;
 try{received=scope.rosterOperationsDispatch_(req,h.contacts);assert.equal(received.intakeState,'pending');assert.equal(h.calls.writes,0,'capture commits while allocator owns ScriptLock');}finally{leave(script);}
 const claimed=scope.rosterServiceDispatch_({input:{operation:'nextAbsenceIntake'}}).job;assert.equal(claimed.requestId,command.requestId);
 const applied=scope.rosterServiceDispatch_({input:{operation:'processAbsenceIntake',requestId:claimed.requestId,claimId:claimed.claimId,calendarByDate:{[h.date]:{date:h.date,schoolDay:true,parity:'even'}},notificationsReady:true}});
 assert.equal(applied.intakeState,'applied');assert.equal(applied.absenceApplied,true);assert.equal(applied.instructionState,'applied');assert.equal(applied.peerState,'applied');assert.equal(h.state().absences.length,1);assert.equal(h.state().requests.length,1);assert.equal(h.calls.writes,3);assert.equal(scope.rosterServiceDispatch_({input:{operation:'nextAbsenceIntake'}}).job,null);
 const receipt=scope.rosterOperationsDispatch_({identity:h.ctx.user,input:{operation:'receiptStatus',command}},h.contacts);assert.equal(receipt.absenceApplied,true);assert.equal(receipt.requestId,command.requestId);assert.equal(scope.rosterAbsenceIntakePending_([h.date]).pendingCaptureCount,0);assert.equal(userLocked,false);
 const duplicate={...command,requestId:crypto.randomUUID()};scope.rosterOperationsDispatch_({identity:h.ctx.user,input:duplicate},h.contacts);const second=scope.rosterServiceDispatch_({input:{operation:'nextAbsenceIntake'}}).job;
 const review=scope.rosterServiceDispatch_({input:{operation:'processAbsenceIntake',requestId:second.requestId,claimId:second.claimId,calendarByDate:{[h.date]:{date:h.date,schoolDay:true,parity:'even'}},notificationsReady:true}});assert.equal(review.intakeState,'applied');assert.equal(review.absenceApplied,true);assert.equal(scope.rosterAbsenceIntakePending_([h.date]).pendingCaptureCount,0);assert.equal(h.state().absences.length,1);assert.equal(h.state().requests.length,1,'repeat report does not invite the colleague again');
}
console.log('PASS durable intake pipeline: independent capture dispatch, exact projection replay, absence survives peer failure, lost commit recovery, lease validation and pending-publication fence.');

}
