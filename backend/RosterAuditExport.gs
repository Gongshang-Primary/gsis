/* The text file is a derived view. Accepted structured evidence stays in the
   operations transaction; export failures never turn a saved allocation into failure. */
function rosterAllocationAuditCapture_(state,accepted){
 const relevant=new Set(['resolveAllocationConflict','assign','combine','unassign','setNoRelief','noRelief','returnAutomatic','undo','removeAssignment','reliefBatch','autoAllocate','optimise','publish','publishDaily','notifyDaily','correctRelief','confirmCompleted','saveStapler','confirmStapler','publishStapler','resetStapler','reconcile']);
 const dates=new Set(),captured=[],events=[...(state.audit||[]).filter(e=>relevant.has(e.operation)||e.decisionChanges?.length),...(state.optimisationRuns||[])];
 state.allocationAuditExports=state.allocationAuditExports||{};
 const acceptedIds=new Set(accepted?.eventIds||[]);
 for(const event of events){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(event.date||''))continue;
  if(acceptedIds.has(event.id)){event.acceptedRevision=state.revision;if(accepted.requestId)event.requestId=accepted.requestId;}
  if(event.auditExportCaptured)continue;
  if(event.essential===true)delete event.auditExportSuppressed;else if(state.systemConfig?.verboseLogging===false)event.auditExportSuppressed=true;
  if(event.auditExportSuppressed)continue;
  if(event.acceptedRevision===undefined){event.acceptedRevision=null;event.limitedHistoricalEvidence=true;}
  event.auditExportCaptured=true;captured.push(event);dates.add(event.date);
 }
 if(state.systemConfig?.verboseLogging!==false)for(const date of accepted?.schoolDates||[])if(!state.allocationAuditExports[date])dates.add(date);
 for(const date of dates){const row=state.allocationAuditExports[date]||(state.allocationAuditExports[date]={pendingVersion:0,exportedVersion:0,exportedRevision:0,fileId:null});row.pendingVersion=(row.pendingVersion||0)+1;row.pendingRevision=state.revision;row.lastEventId=events.filter(e=>e.date===date).at(-1)?.id||null;row.updatedAt=accepted?.at||new Date().toISOString();for(const event of captured.filter(event=>event.date===date))event.auditExportVersion=row.pendingVersion;}
}
function rosterAllocationAuditAccepted_(state,before,ctx,p){
 const old=new Set([...(before.audit||[]),...(before.optimisationRuns||[])].map(e=>e.id)),eventIds=[...(state.audit||[]),...(state.optimisationRuns||[])].filter(e=>!old.has(e.id)).map(e=>e.id),schoolDates=Object.entries(ctx?.days||{}).filter(([,day])=>day.verified===true&&day.schoolDay===true).map(([date])=>date);
 rosterAllocationAuditCapture_(state,{eventIds,schoolDates,requestId:p?.requestId||p?.scheduleKey||null,at:ctx?.iso});
}
function rosterAllocationAuditEnsureDay_(state,calendarByDate,today){
 if(state.systemConfig?.verboseLogging===false)return state;
 const calendar=calendarByDate?.[today];if(state.allocationAuditExports?.[today]||calendar?.date!==today||calendar.schoolDay!==true)return state;
 if(!GSISRoster.active(rosterIndex_().entries,today))return state;
 const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'The daily allocation audit intent is pending. Retry this scheduler tick.');
 try{const current=rosterOperationsState_();if(current.systemConfig?.verboseLogging!==false&&!current.allocationAuditExports?.[today]){rosterAllocationAuditCapture_(current,{schoolDates:[today]});rosterOperationsCommit_(current);}return current;}finally{deployUnlock_(lock);}
}
function rosterAllocationAuditEnabled_(state,date){return state.systemConfig?.verboseLogging!==false||(state.audit||[]).some(event=>event.essential===true&&(!date||event.date===date));}
function rosterAllocationAuditText_(state,date,generatedAt){
 if(!rosterAllocationAuditEnabled_(state,date))return '';
 const clean=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[\r\n\t]+/g,' ').trim(),clock=value=>{const n=Date.parse(value);return Number.isFinite(n)?new Date(n+8*3600000).toISOString().replace('T',' ').slice(0,16)+' SGT':clean(value);},field=(label,value)=>value===undefined||value===null?'':label+': '+clean(value),meta=state.allocationAuditExports?.[date]||{};
 const entries=[...(state.audit||[]).filter(e=>e.date===date&&e.auditExportCaptured&&!e.auditExportSuppressed).map(e=>({...e,type:'change'})),...(state.optimisationRuns||[]).filter(e=>e.date===date&&!e.auditExportSuppressed).map(e=>({...e,type:'run'}))].sort((a,b)=>String(a.at||'').localeCompare(String(b.at||''))||String(a.id).localeCompare(String(b.id)));
 const lines=['GSiS allocation decision and SMC change trail','School date: '+date,'Latest included online revision: '+(meta.pendingRevision??state.revision),'Latest event: '+(meta.lastEventId||'none'),'Generated: '+clock(generatedAt),'Times below are Singapore time. This readable export is not the authoritative data store.','Saving online, letting teachers see and sending WhatsApp are separate actions.',''];
 const labels={resolveAllocationConflict:'SMC reviewed conflicting allocation choices',assign:'SMC assigned relief',combine:'SMC combined lessons',unassign:'SMC cleared an allocation',setNoRelief:'SMC changed No Relief',noRelief:'SMC changed No Relief',returnAutomatic:'SMC returned a lesson to automatic allocation',undo:'SMC restored an allocation',reliefBatch:'Save to online',publish:'Let teachers see',publishDaily:'Let teachers see',notifyDaily:'Send WhatsApp requested',saveStapler:'Saved the suspended timetable online',confirmStapler:'Confirmed the suspended timetable for planning',publishStapler:'Let teachers see the suspended timetable',correctRelief:'Recorded actual relief correction',confirmCompleted:'Recorded actual completed relief',reconcile:'System reconciled planning inputs'};
 const decision=v=>{if(!v)return 'not recorded';const ownership=v.ownership==='smc'?'SMC choice':v.ownership||'automatic';return (['empty','unassigned'].includes(v.kind)?'Unassigned':v.kind==='noRelief'?'No Relief':clean(v.name||v.staffId||'Assigned teacher'))+' ('+ownership+')';};
 for(const entry of entries){
  lines.push(clock(entry.at)+' — '+(entry.type==='run'?'Automatic allocation run':labels[entry.operation]||clean(entry.operation)));
  lines.push([field('Actor',entry.actor|| (entry.type==='run'?'automatic allocator':null)),field('Online revision',entry.acceptedRevision),field('Request',entry.requestId),field('Event',entry.id)].filter(Boolean).join('; '));
  if(entry.deploySource)lines.push([field('Published Deploy version',entry.deploySource.versionId),field('Revision',entry.deploySource.revision),field('Commit',entry.deploySource.commit),field('Calculation model',entry.deploySource.calculationVersion)].filter(Boolean).join('; '));
  if(entry.limitedHistoricalEvidence||entry.type==='run'&&!entry.decisionEvidence&&!(state.optimisationRuns||[]).some(run=>run.id===entry.decisionEvidenceRef&&run.decisionEvidence))lines.push('Limited historical decision evidence. Missing original facts have not been reconstructed.');
  for(const change of entry.decisionChanges||[]){const lesson=change.lesson||{};lines.push('P'+clean(lesson.period)+' '+[lesson.className,lesson.subject,lesson.venue].filter(Boolean).map(clean).join(' · ')+': '+decision(change.before)+' → '+decision(change.after)+'.');if(change.after?.ownership==='smc')lines.push('Automatic allocation must retain this SMC choice until SMC changes it or returns it to automatic allocation.');for(const warning of change.warnings||[])lines.push('Warning: '+clean(warning));}
  for(const choice of entry.choices||[])lines.push('Lesson '+clean(choice.demandId)+': '+(choice.choice==='keepMine'?'Keep mine':'Keep online')+'; previous editor '+clean(choice.beforeProvenance?.actorName||choice.beforeProvenance?.actor||'not recorded')+' at '+clock(choice.beforeProvenance?.at)+'; choice by '+clean(choice.actorName||choice.actor)+'.');
  for(const change of entry.timetableChanges||[])lines.push('P'+clean(change.period)+' '+clean(change.name||change.staffId)+': '+(change.before||[]).filter(Boolean).map(clean).join(' · ')+' → '+(change.after||[]).filter(Boolean).map(clean).join(' · ')+'.');
  if(entry.type==='run'){
   const ref=(state.optimisationRuns||[]).find(run=>run.id===entry.decisionEvidenceRef),evidence=entry.decisionEvidence||(ref?.decisionEvidence?{...ref.decisionEvidence,inputs:entry.decisionInputs||ref.decisionEvidence.inputs}:null),byId=new Map((evidence?.teachers||[]).map(t=>[t.staffId,t])),name=id=>clean(byId.get(id)?.name||id),inputs=evidence?.inputs||{};
   lines.push([field('Baseline',inputs.baselineId),field('Suspended timetable revision',inputs.staplerRevision),field('Allocation revision',inputs.allocationRevision),field('Policy updated',inputs.configUpdatedAt),field('Accounting year',inputs.accountingYear)].filter(Boolean).join('; '));
   if(inputs.deploySource)lines.push([field('Published Deploy version',inputs.deploySource.versionId),field('Revision',inputs.deploySource.revision),field('Commit',inputs.deploySource.commit),field('Calculation model',inputs.deploySource.calculationVersion)].filter(Boolean).join('; '));
   lines.push('Run status: '+clean(entry.status||'recorded')+'. '+clean(entry.reason||''));
   if(entry.status==='complete'){lines.push('Covered lessons: '+clean(entry.coverage??'not recorded')+'. Uncovered lessons: '+clean(entry.uncovered??'not recorded')+'.');lines.push('Coverage '+(entry.coverageProven?'proved':'not proved')+'; preference optimality '+(entry.preferencesProven?'proved':'not proved')+'. '+(!entry.preferencesProven?'The search bound may have stopped before proving the best preference match.':''));if(entry.changed===false)lines.push('No change was made to the previous allocation.');}
   if(['paused','bounded'].includes(entry.status))lines.push('No new allocation was accepted from this run. The last valid plan was retained.');
   if(evidence?.policy){lines.push('The optimiser compares complete plans. It first maximises coverage, then applies the configured preferences in order.');lines.push('Preference order: '+(evidence.policy.preferences||[]).map(id=>clean(GSISRosterAllocation.preferenceRules.find(rule=>rule.id===id)?.label||id)).join(', ')+'.');const limits=evidence.policy.workloadLimits||{};lines.push('Configured workload limits: '+(limits.dailyTotal??'disabled')+' daily periods; '+(limits.consecutive??'disabled')+' consecutive periods.');
    const effective=evidence.policy.effectiveWorkloadLimits;
    if(effective&&Object.prototype.hasOwnProperty.call(effective,'dailyTotal')&&Object.prototype.hasOwnProperty.call(effective,'consecutive'))lines.push('Effective allocation limits: '+(effective.dailyTotal??'disabled')+' daily periods; '+(effective.consecutive??'disabled')+' consecutive periods.');
    else lines.push('Effective allocation limits: not recorded for this historical run.');
    if(typeof evidence.policy.workloadCalculationSkipped==='boolean')lines.push(evidence.policy.workloadCalculationSkipped?'Workload formula calculation: skipped for this suspended timetable. Allocation business rules remain active.':'Workload formula calculation: not skipped.');
    else lines.push('Workload formula calculation: not recorded for this historical run.');}
   for(const lesson of evidence?.lessons||[]){const prefix='P'+clean(lesson.period)+' '+[lesson.className,lesson.subject,lesson.groupName,lesson.venue].filter(Boolean).map(clean).join(' · ')+': ';const chosen=byId.get(lesson.selectedStaffId);let detail;
    if(lesson.disposition==='selected')detail=name(lesson.selectedStaffId)+' selected. '+clean(lesson.selectionExplanation||'Selected as part of the complete accepted plan.')+(chosen?' Available relief balance: '+clean(chosen.remaining??'unverified')+'; employment cap remaining: '+clean(chosen.capRemaining??'not applicable')+'.':'');
    else if(lesson.disposition==='smc-choice')detail=lesson.manual?.kind==='empty'?'Left unassigned by SMC. Automatic allocation must not fill this lesson.':lesson.manual?.kind==='noRelief'?'SMC selected No Relief. Automatic allocation must retain it.':'Preserved SMC choice'+(lesson.selectedStaffId?': '+name(lesson.selectedStaffId):'')+'.';
    else if(lesson.disposition==='exempt')detail='No relief required by the captured subject or teaching-group policy.';
    else if(lesson.disposition==='already-covered')detail='Already covered; retained.';
    else detail='Uncovered. '+clean(lesson.uncoveredReason||'No accepted eligible allocation was found.');
    lines.push(prefix+detail);if(chosen?.teachingProfile){lines.push('Captured teaching profile for '+name(lesson.selectedStaffId)+': levels '+(chosen.teachingProfile.levels||[]).map(clean).join(', ')+'; subject families '+(chosen.teachingProfile.subjects||[]).map(value=>clean(value).replace(/^family:/,'')).join(', ')+'.');}
   }
   for(const period of evidence?.periods||[]){lines.push('P'+clean(period.period)+' eligible teachers: '+(period.eligibleStaffIds||[]).map(name).join(', ')+'.');for(const value of period.comparisons||[])lines.push('P'+clean(period.period)+' comparison for '+name(value.staffId)+': recommendation rank '+clean(value.rank??'not recorded')+'; annual fairness band '+clean(value.fairnessBand??'unverified')+'; other eligible periods '+clean(value.alternatives??'not recorded')+'; rotation position '+clean(value.rotation??'not recorded')+'. This is a period-level comparison, not a proof of the complete-plan choice.');for(const exclusion of period.excluded||[])lines.push('P'+clean(period.period)+' excluded: '+(exclusion.staffIds||[]).map(name).join(', ')+'. Reason: '+clean(exclusion.reason)+'.');}
  }
  if(entry.operation==='notifyDaily')lines.push('This records the request to send WhatsApp; it does not claim delivery or acknowledgement.');
  if(['publish','publishDaily','publishStapler'].includes(entry.operation))lines.push('This records teacher-visible publication; it does not establish actual completion of relief.');
  lines.push('');
 }
 if(!entries.length)lines.push('No allocation activity recorded.');
 return lines.filter(line=>line!==undefined).join('\n')+'\n';
}
function rosterAllocationAuditFolder_(date){gsisRequireBackendRole_('roster');
 let parent=ROSTER_ROOT;
 for(const name of ['Allocation Audit',date.slice(0,4),date.slice(5,7)]){
  let id=rosterFindFile_(parent,name);
  if(!id){const response=rosterDriveRequest_('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id',{method:'post',contentType:'application/json; charset=UTF-8',payload:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parent]})},'allocation-audit-folder');id=rosterDriveJson_(response,'allocation-audit-folder').id;if(!id)error_(503,'The allocation audit folder could not be confirmed.');}
  rosterFolder_(id);parent=id;
 }
 return parent;
}
function rosterAllocationAuditDigest_(raw){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw).map(value=>(value&255).toString(16).padStart(2,'0')).join('');}
function rosterAllocationAuditArchive_(snapshot,date,monthFolder){gsisRequireBackendRole_('roster');
 if(!rosterAllocationAuditEnabled_(snapshot,date))return {disabled:true,state:snapshot};
 let folder=rosterFindFile_(monthFolder,'Evidence');
 if(!folder){const response=rosterDriveRequest_('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id',{method:'post',contentType:'application/json; charset=UTF-8',payload:JSON.stringify({name:'Evidence',mimeType:'application/vnd.google-apps.folder',parents:[monthFolder]})},'allocation-audit-evidence-folder');folder=rosterDriveJson_(response,'allocation-audit-evidence-folder').id;if(!folder)error_(503,'The allocation evidence folder could not be confirmed.');}
 const meta=snapshot.allocationAuditExports[date],id=meta.archiveFileId||rosterFindFile_(folder,date+'.json');let previous={audit:[],optimisationRuns:[]},previousRaw=null;
 if(id){try{previousRaw=rosterReadFile_(id);if(meta.archiveDigest&&rosterAllocationAuditDigest_(previousRaw)!==meta.archiveDigest)throw Error('digest');previous=JSON.parse(previousRaw);if(previous.schema!==1||previous.date!==date||!Array.isArray(previous.audit)||!Array.isArray(previous.optimisationRuns))throw Error('identity');}catch(error){error_(503,'The stored allocation evidence could not be read. It was not overwritten.');}}
 // Read each required month once for this selected day's derived export.
 // Ordinary Roster reads retain compact stubs and do not enter this path.
 const months=new Map(),hydrate=row=>{
  if(!row.archiveRef)return row;
  const ref=rosterColdArchiveRef_(row.archiveRef);let entries=months.get(ref.month);
  if(!entries){entries=new Map(rosterColdArchiveRead_(ref.month,snapshot).value.items.map(item=>[JSON.stringify([item.collection,item.id,item.digest]),item]));months.set(ref.month,entries);}
  return rosterColdArchiveEntry_(entries.get(JSON.stringify([ref.collection,ref.id,ref.digest])),ref);
 };
 const unique=(old,next)=>{const rows=new Map(old.map(row=>[row.id,hydrate(row)]));for(const source of next){const prior=rows.get(source.id);if(source.archiveRef&&prior)continue;const row=hydrate(source);rows.set(row.id,prior?{...prior,...row,...(!row.decisionEvidence&&prior.decisionEvidence?{decisionEvidence:prior.decisionEvidence}:{})}:row);}return [...rows.values()];};
 const evidence={schema:1,date,version:meta.pendingVersion,revision:meta.pendingRevision,audit:unique(previous.audit,snapshot.audit.filter(row=>row.date===date&&row.auditExportCaptured&&!row.auditExportSuppressed)),optimisationRuns:unique(previous.optimisationRuns,snapshot.optimisationRuns.filter(row=>row.date===date&&!row.auditExportSuppressed))};
 const json=JSON.stringify(evidence),digest=rosterAllocationAuditDigest_(json),name=date+'-'+digest+'.json';
 // Evidence IDs are immutable. A new export never rewrites a captured file.
 let saved=previousRaw===json?id:rosterFindFile_(folder,name);
 if(saved&&saved!==id&&rosterAllocationAuditDigest_(rosterReadFile_(saved))!==digest)error_(503,'The immutable allocation evidence failed verification.');
 if(!saved)saved=rosterCreateFile_(folder,name,Utilities.newBlob(json,'application/json; charset=UTF-8'));
 return {fileId:saved,digest,state:{...snapshot,audit:[...snapshot.audit.filter(row=>row.date!==date),...evidence.audit],optimisationRuns:[...snapshot.optimisationRuns.filter(row=>row.date!==date),...evidence.optimisationRuns]}};
}
function rosterAllocationAuditExport_(p){
 const result=rosterAllocationAuditExportCore_(p);
 if(typeof rosterColdArchiveRun_==='function'&&!result.busy&&!result.deferred)try{result.archive=rosterColdArchiveRun_({manual:false});}catch(error){result.failures.push({archive:true,error:'Cold Roster output archive is pending and will retry.'});}
 return result;
}
function rosterAllocationAuditExportCore_(p){gsisRequireBackendRole_('roster');
 const result={exported:[],pending:0,failures:[]};
 // Optional text exports yield to the live delivery queue. The same execution
 // owner supplies UserLock, so it is not an independent named exporter lock.
 let initial=rosterOperationsState_();
 const pending=state=>Object.values(state.allocationAuditExports||{}).filter(row=>(row.pendingVersion||0)>(row.exportedVersion||0)).length;
 result.pending=pending(initial);if(!rosterAllocationAuditEnabled_(initial))return {...result,disabled:true};
 // Recover retained original evidence without requiring a new allocation/save.
 // Capture preserves suppression and flags older evidence as historical; it
 // neither reconstructs decisions nor changes the allocation revision.
 const before=JSON.stringify(initial.allocationAuditExports||{});rosterAllocationAuditCapture_(initial);
 if(JSON.stringify(initial.allocationAuditExports||{})!==before){
  result.pending=pending(initial);const lock=LockService.getScriptLock();if(!deployLock_(lock,1000))return {...result,busy:true};
  try{initial=rosterOperationsState_();rosterAllocationAuditCapture_(initial);rosterOperationsCommit_(initial);}finally{deployUnlock_(lock);}
 }
 result.pending=pending(initial);if(!result.pending)return result;
 const transport=typeof rosterNotificationState_==='function'?rosterNotificationState_():null,rows=new Map((initial.outbox||[]).map(row=>[row.id,row]));
 for(const row of transport?.outbox||[])rows.set(row.id,row);
 const now=Date.now(),active=[...rows.values()].some(row=>!row.domainCancelled&&['queued','claimed','sending'].includes(row.status)&&(!row.expiresAt||Number(row.expiresAt)>now)&&(!row.nextEligibleAt||Number(row.nextEligibleAt)<=now)&&(!row.nextAttemptAt||Number(row.nextAttemptAt)<=now));
 if(active)return {...result,deferred:'notification-priority'};
 const exportLock=LockService.getUserLock();let exportHeld=false;
 // Serialize canonical daily file writes, then release before watermark commit.
 // No UserLock -> ScriptLock nesting: maintenance uses the opposite order.
 if(!exportLock.tryLock(1))return {...result,busy:true};exportHeld=true;
 try{
  const snapshot=rosterOperationsState_();if(!rosterAllocationAuditEnabled_(snapshot))return {...result,disabled:true};const dates=Object.entries(snapshot.allocationAuditExports||{}).filter(([date,row])=>rosterAllocationAuditEnabled_(snapshot,date)&&(row.pendingVersion||0)>(row.exportedVersion||0)).sort(([a],[b])=>a.localeCompare(b));result.pending=dates.length;
  for(const [date,watermark] of dates.slice(0,1)){
   try{
    if(!rosterAllocationAuditEnabled_(rosterOperationsState_(),date))return {...result,disabled:true};
    const folder=rosterAllocationAuditFolder_(date),name=date+'.txt',fileId=watermark.fileId||rosterFindFile_(folder,name),generatedAt=new Date().toISOString(),archive=rosterAllocationAuditArchive_(snapshot,date,folder),text=rosterAllocationAuditText_(archive.state,date,generatedAt);
    const saved=fileId?(rosterDriveRequest_('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(fileId)+'?uploadType=media&supportsAllDrives=true&fields=id',{method:'patch',contentType:'text/plain; charset=UTF-8',payload:text},'allocation-audit-export'),fileId):rosterCreateFile_(folder,name,Utilities.newBlob(text,'text/plain; charset=UTF-8'));
    exportLock.releaseLock();exportHeld=false;
    const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))throw Error('The text was written but its watermark is not yet confirmed.');
    try{const current=rosterOperationsState_(),row=current.allocationAuditExports?.[date];if(row&&(row.exportedVersion||0)<=watermark.pendingVersion){row.fileId=saved;row.archiveFileId=archive.fileId;if(archive.digest)row.archiveDigest=archive.digest;else delete row.archiveDigest;row.archiveVersion=watermark.pendingVersion;row.archiveRevision=watermark.pendingRevision;row.exportedVersion=Math.max(row.exportedVersion||0,watermark.pendingVersion);row.exportedRevision=watermark.pendingRevision;row.exportedAt=generatedAt;row.bytes=Utilities.newBlob(text).getBytes?.().length||text.length;delete row.error;// Verified cold-output archival is the only retention step; text export never deletes records.
 rosterOperationsCommit_(current);}}
    finally{deployUnlock_(lock);}
    result.exported.push({date,revision:watermark.pendingRevision});const latest=rosterOperationsState_().allocationAuditExports?.[date];if(latest&&latest.pendingVersion<=latest.exportedVersion)result.pending--;
   }catch(error){result.failures.push({date,error:'Allocation audit export is pending and will retry.'});}
  }
  return result;
 }finally{if(exportHeld)exportLock.releaseLock();}
}

var rosterAuditEvidencePacked_=new WeakMap();
function rosterAllocationAuditPack_(state){
 if(typeof Utilities.gzip!=='function')return state;
 const runs=(state.optimisationRuns||[]).map(run=>{const evidence=run.decisionEvidence;if(!evidence)return run;const stored=rosterAuditEvidencePacked_.get(evidence);if(stored)return {...run,decisionEvidence:stored};const json=JSON.stringify(evidence),blob=Utilities.newBlob(json,'application/json'),bytes=blob.getBytes().length;if(bytes>2000000)error_(507,'The allocation decision evidence exceeds its safe record size.');return {...run,decisionEvidence:{encoding:'gzip-audit-v1',bytes,digest:rosterOperationsPlanDigest_(json),data:Utilities.base64Encode(Utilities.gzip(blob).getBytes())}};});
 return {...state,optimisationRuns:runs};
}
function rosterAllocationAuditUnpack_(state){
 for(const run of state.optimisationRuns||[]){const value=run.decisionEvidence;if(value?.encoding!=='gzip-audit-v1')continue;if(!Number.isInteger(value.bytes)||value.bytes<2||value.bytes>2000000||typeof value.data!=='string'||value.data.length>2800000)error_(503,'The stored allocation decision evidence could not be verified.');let decoded;
  const load=()=>{if(decoded)return decoded;try{const blob=Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(value.data),'application/x-gzip','allocation-evidence.json.gz')),json=blob.getDataAsString('UTF-8');if(blob.getBytes().length!==value.bytes||rosterOperationsPlanDigest_(json)!==value.digest)throw Error('integrity');decoded=JSON.parse(json);if(decoded?.version!==1)throw Error('schema');const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const child of Object.values(v))freeze(child);Object.freeze(v);}};freeze(decoded);return decoded;}catch(error){error_(503,'The stored allocation decision evidence could not be verified.');}};
  const facade=new Proxy({}, {get:(_,key)=>Reflect.get(load(),key),ownKeys:()=>Reflect.ownKeys(load()),getOwnPropertyDescriptor:(_,key)=>{const d=Reflect.getOwnPropertyDescriptor(load(),key);return d?{...d,configurable:true}:undefined;},set:()=>{error_(503,'Captured allocation evidence cannot be modified.');}});rosterAuditEvidencePacked_.set(facade,value);run.decisionEvidence=facade;
 }
 return state;
}
