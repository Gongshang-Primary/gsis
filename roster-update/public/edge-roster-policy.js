// Shared optimistic conflict behavior, including explicit human choice audit.
import {GSISRoster,GSISRosterOperations,GSISRosterAllocation} from './edge-roster-domain.js';
import {sha256Hex as sha256} from './edge-deploy-sha256.js';
const error_=(status,message)=>{throw Object.assign(Error(message),{status});};
const rosterOperationsDigest_=value=>sha256(JSON.stringify(value));
const rosterOperationsPackPlans_=value=>value;
function rosterOperationsConflict_(code,message){throw Object.assign(Error(message),{status:409,code});}

// Notes describe duties; they do not change absence coverage or allocation.
function rosterOperationsAllocationRow_(collection,row){
 if(!['absences','assignments'].includes(collection))return row;
 const {instructions,instructionsNA,instructionAuthors,instructionsUpdatedBy,instructionsUpdatedAt,instructionNotes,...allocation}=row;
 return allocation;
}
function rosterOperationsDayToken_(s,ctx,d){
 d=GSISRosterOperations.date(d);const packed=rosterOperationsPackPlans_(s),excluded=new Set(['edgeInstructionDrafts','edgeAbsenceReceipts','outbox','audit','receipts','deliveryEvents','smcAlerts','acknowledgements','publicationSnapshots','optimisationRuns','inboundEvents','dailyEmploymentMail','dailyEmploymentSnapshots']);
 const rows={};for(const [key,value] of Object.entries(packed))if(Array.isArray(value)&&!excluded.has(key))rows[key]=value.filter(r=>r&&typeof r==='object'&&(r.date===d||r.actual?.date===d)).map(row=>rosterOperationsAllocationRow_(key,row));
 const active=GSISRoster.active(ctx.timetableEntries||[],d),bridges={...s,nameBridges:s.nameBridges.slice()};GSISRosterOperations.seedNameBridges(bridges,ctx.people||[]);
 return rosterOperationsDigest_({schema:1,date:d,rows,dayRevision:s.dayRevisions[d]||0,publication:s.dailyPublicationStates?.[d]?.revision||0,baseline:active||ctx.days[d]?.id||null,customInstructions:s.customInstructions.filter(r=>!r.deletedAt),systemConfig:s.systemConfig,nameBridges:bridges.nameBridges,types:s.types,recessSettings:s.recessSettings});
}

function rosterOperationsSettingsToken_(s){return rosterOperationsDigest_({schema:1,dailyEmploymentSettings:s.dailyEmploymentSettings});}
// Row tokens provide optimistic concurrency for edits to one recorded absence.
// They cover the durable record, not its date-dependent display projection.

function rosterOperationsAbsenceToken_(row){return rosterOperationsDigest_({schema:1,absence:rosterOperationsAllocationRow_('absences',row)});}

function rosterOperationsDeletionCheck_(s,p){
 const tokens=p.expectedAbsenceTokens;if(!Array.isArray(p.ids)||!p.ids.length||p.ids.some(id=>typeof id!=='string')||new Set(p.ids).size!==p.ids.length||!tokens||typeof tokens!=='object'||Array.isArray(tokens))error_(400,'Reload the selected absence records before deleting.');
 const rows=new Map(s.absences.map(row=>[row.id,row]));
 for(const id of p.ids){const row=rows.get(id),token=tokens[id];if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token)||!row||row.deletedAt||token!==rosterOperationsAbsenceToken_(row))rosterOperationsConflict_('ABSENCE_CONFLICT','A selected absence changed. Refresh and review the selection before deleting.');}
}

function rosterOperationsAttachDayToken_(response,s,ctx,p){
 if(response&&ctx.allocationReferenceKey)Object.assign(response,{allocationReferenceKey:ctx.allocationReferenceKey,cacheReused:ctx.cacheReused===true,allocationClock:ctx.today+':'+ctx.minute});
 if(response&&(Array.isArray(response.absences)||Array.isArray(response.ownAbsences))){
  const records=new Map(s.absences.map(row=>[row.id,row])),tokens=new Map();
  for(const row of [...(response.absences||[]),...(response.ownAbsences||[])]){const saved=records.get(row.id);if(!saved||row.editable!==true)continue;if(!tokens.has(row.id))tokens.set(row.id,rosterOperationsAbsenceToken_(saved));row.absenceToken=tokens.get(row.id);}
 }
 if(response?.canEdit===true&&(['dailyEmployment','saveDailyEmploymentSettings','sendDailyEmploymentReport'].includes(p.operation)||p.operation==='read'&&p.view==='dailyEmployment'))response.settingsToken=rosterOperationsSettingsToken_(s);
 if(response&&(['allocation','smc','dailyNotify'].includes(p.view)||['allocation','dailyNotify'].includes(p.operation)))response.dayToken=rosterOperationsDayToken_(s,ctx,p.date||ctx.today);
 if(response&&(['allocation','smc'].includes(p.view)||p.operation==='allocation')){
  const date=p.date||ctx.today;
  response.allocatorRun=s.edgeAllocatorRuns?.[date]||null;
  response.pendingPeerProposals=(s.edgePeerProposals||[]).filter(proposal=>proposal.status==='pending').flatMap(proposal=>Object.entries(proposal.command?.ownArrangementsByStaffDate||{}).flatMap(([staffId,dated])=>(dated[date]||[]).map(pick=>({proposalId:proposal.id,date,absenceId:s.absences.find(row=>proposal.savedIds.includes(row.id)&&row.staffId===staffId&&row.date===date)?.id||null,period:pick.period,recipientId:pick.recipientId,recipientName:ctx.people.find(person=>person.id===pick.recipientId)?.name||'',status:'processing'}))));
  if(!response.cellStates){const demands=[...GSISRosterOperations.demand(ctx,s,date),...(response.manualRecoveryDemands||GSISRosterOperations.manualRecoveryDemands(s,ctx,date))];response.cellStates=GSISRosterOperations.cellDecisions(s,date,demands.map(d=>d.id));}
  if(response.allocationPatch){const selected=new Set(p.demandIds||[]);response.cellStates=Object.fromEntries(Object.entries(response.cellStates).filter(([id])=>selected.has(id)));}
  response.cellProvenance=GSISRosterOperations.cellProvenance(s,ctx,date,Object.keys(response.cellStates||{}));
  if(!response.allocationPatch)response.exportContext=GSISRosterOperations.dailyExport(s,ctx,{date,fullTeachers:true,dailyDrive:true});
  response.auditExport=s.allocationAuditExports?.[date]?{pendingRevision:s.allocationAuditExports[date].pendingRevision||0,exportedRevision:s.allocationAuditExports[date].exportedRevision||0}:null;
 }
 return response;
}

function rosterOperationsBatchMerge_(s,ctx,p){
 if(p.operation!=='reliefBatch'||p.baseCells===undefined)return {command:p,changes:null};
 if(!p.baseCells||typeof p.baseCells!=='object'||Array.isArray(p.baseCells)||!Array.isArray(p.commands)||!p.commands.length||p.commands.length>100)error_(400,'A complete cell comparison is required.');
 // Older clients cannot prove which human decision they reviewed. Require a
 // current day/document fence before accepting their value-only comparison.
 if(p.baseCellTokens===undefined){const current=typeof p.expectedDayToken==='string'?p.expectedDayToken===rosterOperationsDayToken_(s,ctx,p.date):p.revision===s.revision;if(!current)rosterOperationsConflict_('DAY_CONFLICT','Allocation decisions changed. Refresh before saving your retained choices.');}
 const ids=[...new Set(p.commands.flatMap(c=>Array.isArray(c.demandIds)?c.demandIds:[]))],normal=v=>({staffId:v?.staffId||null,noRelief:v?.noRelief===true,combination:v?.combination===true,manual:v?.manual===true,cleared:v?.cleared===true}),same=(a,b)=>JSON.stringify(normal(a))===JSON.stringify(normal(b)),local={};
 for(const id of ids){const b=p.baseCells[id];if(!b||typeof b!=='object'||!Object.hasOwn(b,'staffId')||!['noRelief','combination','manual','cleared'].every(k=>typeof b[k]==='boolean')||b.staffId!==null&&typeof b.staffId!=='string')error_(400,'The original value for every changed cell is required.');local[id]=normal(b);}
 const dd=ctx.days[p.date],sources=new Map(GSISRosterOperations.demand(ctx,s,p.date).map(d=>[d.id,GSISRosterOperations.cellSourceKey(d)])),assignedHere=new Set(),existing=new Map(GSISRosterAllocation.effectiveAssignments(s,true).filter(a=>a.date===p.date).map(a=>[a.demandId,a]));
 for(const c of p.commands)for(const id of c.demandIds||[]){
  if(['assign','combine'].includes(c.operation)){local[id]={staffId:c.staffId,noRelief:false,combination:c.operation==='combine',manual:true,cleared:false};assignedHere.add(id);}
  else if(c.operation==='unassign'||c.operation==='setNoRelief'&&c.noRelief!==true)local[id]={staffId:null,noRelief:false,combination:false,manual:true,cleared:true};
  else if(c.operation==='setNoRelief')local[id]={staffId:null,noRelief:true,combination:false,manual:true,cleared:false};
  else if(c.operation==='returnAutomatic'){const old=existing.get(id),empty=local[id].noRelief||!local[id].staffId||!sources.has(id)||!assignedHere.has(id)&&(!old||old.invalidCover||old.noRelief);local[id]=empty?{staffId:null,noRelief:false,combination:false,manual:false,cleared:false}:{...local[id],manual:false,cleared:false};}
  else error_(400,'Unsupported cell change.');
 }
 if(ids.some(id=>!sources.has(id)))for(const recovery of GSISRosterOperations.manualRecoveryDemands(s,ctx,p.date)){if(!sources.has(recovery.id)&&p.commands.filter(command=>command.demandIds?.includes(recovery.id)).every(command=>['unassign','returnAutomatic'].includes(command.operation)))sources.set(recovery.id,recovery.recoverySourceKey);}
 if(dd?.verified!==true||dd.schoolDay!==true||dd.id!==p.expectedTimetableId||(dd.staplerRevision||0)!==p.expectedStaplerRevision||dd.parity!==p.expectedParity||ids.some(id=>!sources.has(id)||sources.get(id)!==p.expectedDemandSources?.[id]))rosterOperationsConflict_('DAY_CONFLICT','The timetable or selected lesson changed. Review your retained choices.');
 const conflicts=[],apply=new Set(),changes=[],currentCells=GSISRosterOperations.cellDecisions(s,p.date,ids),provenance=GSISRosterOperations.cellProvenance(s,ctx,p.date,ids);
 if(p.baseCellTokens!==undefined&&(!p.baseCellTokens||typeof p.baseCellTokens!=='object'||Array.isArray(p.baseCellTokens)||ids.some(id=>typeof p.baseCellTokens[id]!=='string')))error_(400,'The original decision token for each changed lesson is required.');
 if(p.cellResolutions!==undefined&&(!p.cellResolutions||typeof p.cellResolutions!=='object'||Array.isArray(p.cellResolutions)||Object.keys(p.cellResolutions).some(id=>!ids.includes(id))))error_(400,'Choose a resolution for a changed lesson.');
 for(const id of ids){const base=normal(p.baseCells[id]),current=normal(currentCells[id]),next=normal(local[id]),currentProvenance=provenance[id],resolution=p.cellResolutions?.[id];let outcome;
  if(resolution&&(!['keepMine','keepOnline'].includes(resolution.choice)||typeof resolution.expectedToken!=='string'))error_(400,'Choose Keep mine or Keep online using the latest comparison.');
  const tokenChanged=p.baseCellTokens!==undefined&&p.baseCellTokens[id]!==currentProvenance.token,reviewChanged=resolution&&resolution.expectedToken!==currentProvenance.token;
  if(reviewChanged||!resolution&&tokenChanged&&!same(next,current)&&!same(next,base)){conflicts.push({demandId:id,base,current,local:next,currentProvenance,baseToken:p.baseCellTokens?.[id]||null});continue;}
  if(resolution?.choice==='keepOnline')outcome='kept-online';
  else if(same(next,current))outcome='already-current';
  else if(resolution?.choice==='keepMine'){outcome='updated';apply.add(id);}
  else if(same(next,base))outcome='kept-online';else if(same(base,current)){outcome='updated';apply.add(id);}else{conflicts.push({demandId:id,base,current,local:next,currentProvenance,baseToken:p.baseCellTokens?.[id]||null});continue;}
  changes.push({demandId:id,before:current,after:outcome==='updated'?next:current,outcome,beforeProvenance:currentProvenance,choice:resolution?.choice||null,actor:ctx.user.email,actorName:ctx.people.find(person=>person.id===ctx.user.staffId)?.name||ctx.user.email,at:ctx.iso});
 }

 if(conflicts.length)throw Object.assign(Error('Some lessons were changed by another user. Compare your changes with the current online values.'),{status:409,code:'CELL_CONFLICT',conflicts});
 return {command:{...p,commands:p.commands.map(c=>({...c,demandIds:c.demandIds.filter(id=>apply.has(id))})).filter(c=>c.demandIds.length)},changes};
}

function rosterOperationsBatchAudit_(s,ctx,p,changes){
 const reviewed=changes.filter(change=>change.choice);if(!reviewed.length)return;
 GSISRosterOperations.essentialDecisionAudit(s,ctx,'resolveAllocationConflict',{date:p.date,requestId:p.requestId,choices:reviewed.map(({demandId,choice,before,after,beforeProvenance,actor,actorName,at,outcome})=>({demandId,choice,before,after,beforeProvenance,actor,actorName,at,outcome}))});
}

function rosterOperationsNotificationReady_(s,p){
 if(s.notificationTransportUnavailable===true&&(p.operation==='notifyDaily'||p.operation==='publish'&&p.notifyMode!=='none'||p.operation==='publishStapler'))error_(503,'WhatsApp delivery records are temporarily unavailable. You can keep saving allocations or let teachers see the timetable without sending. Retry Send WhatsApp when delivery records recover.');
}

function rosterOperationsPreparedCheck_(s,ctx,p,intakeProjection=false){
 rosterOperationsNotificationReady_(s,p);
 if(!Number.isSafeInteger(p.revision)||p.revision<0||p.revision>s.revision)rosterOperationsConflict_('DAY_CONFLICT','Relief records changed. Refresh before saving.');
 if(p.operation==='notifyDaily'&&p.expectedPublicationRevision!==undefined){
  if(!Number.isSafeInteger(p.expectedPublicationRevision)||p.expectedPublicationRevision<1||p.expectedPublicationRevision!==s.dailyPublicationStates?.[p.date||ctx.today]?.revision)rosterOperationsConflict_('PUBLICATION_CONFLICT','The published timetable for this date changed. Refresh and review it before notifying.');
 }else if(p.operation==='saveAbsence'&&p.id&&p.expectedAbsenceToken!==undefined){
  const row=s.absences.find(a=>a.id===p.id);
  if(typeof p.expectedAbsenceToken!=='string'||!/^[a-f0-9]{64}$/.test(p.expectedAbsenceToken)||!row||row.deletedAt||p.expectedAbsenceToken!==rosterOperationsAbsenceToken_(row))rosterOperationsConflict_('ABSENCE_CONFLICT','This absence changed. Refresh and review the entry before saving.');
 }else if(p.operation==='reliefBatch'&&p.baseCells!==undefined){
  rosterOperationsBatchMerge_(s,ctx,p);
 }else if(['publish','reliefBatch','autoAllocate','optimise'].includes(p.operation)&&p.expectedDayToken!==undefined){
  if(typeof p.expectedDayToken!=='string'||!/^[a-f0-9]{64}$/.test(p.expectedDayToken)||p.expectedDayToken!==rosterOperationsDayToken_(s,ctx,p.date||ctx.today))rosterOperationsConflict_('DAY_CONFLICT','The selected day changed. Refresh and review this date before saving.');
 }else if(p.revision!==s.revision&&!(p.operation==='saveAbsence'&&!p.id)&&!(p.operation==='saveInstructions'&&p.instructionChanges!==undefined)&&!(intakeProjection&&['requestMutual','saveInstructions'].includes(p.operation)))rosterOperationsConflict_('DAY_CONFLICT','Relief records changed. Refresh before saving.');
}

export {rosterOperationsConflict_, rosterOperationsDayToken_, rosterOperationsSettingsToken_, rosterOperationsAbsenceToken_, rosterOperationsDeletionCheck_, rosterOperationsAttachDayToken_, rosterOperationsBatchMerge_, rosterOperationsBatchAudit_, rosterOperationsNotificationReady_, rosterOperationsPreparedCheck_};
