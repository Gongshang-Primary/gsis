// Context rules retained from backend/RosterOperations.gs; I/O is injected once by the edge adapter.
import {GSISRoster,GSISRosterOperations,GSISRosterAllocation,GSISRosterStapler} from './edge-roster-domain.js';
export function edgeRosterContextFromReferences({state,input,who,contacts,index,models,quota,referenceKey,clock,env}) {
 const error_=(status,message)=>{throw Object.assign(Error(message),{status});};
 const memoryCache={get:()=>null,put:()=>{}};
 const rosterIndex_=()=>index,rosterModel_=entry=>{const value=models.get(entry.id);if(!value)error_(503,'The immutable baseline model is unavailable.');return value;};
 const rosterToday_=()=>clock.today,rosterOperationsPhase_=(_name,fn)=>fn();
 const rosterOperationsQuota_=()=>quota,rosterOperationsSubjectCatalogue_=()=>quota;
 const rosterOperationsQuotaSource_=()=>({entry:quota.source?{id:quota.source.versionId}:null,book:null,index:null});
 const rosterOperationsAllocationReference_=()=>referenceKey,rosterOperationsAllocationBaseline_=()=>null,reliefGuard_=()=>{};
 const props_=()=>({getProperty:key=>key==='ROSTER_NOTIFICATION_ADMIN_IDS'?env.ROSTER_NOTIFICATION_ADMIN_IDS||'':null});
function rosterOperationsAuthority_(c,identity,datesOnly=false){
 const projected=c?.rosterProjection==='staplerDates';
 if(projected){
  const dates=c.rosterDates,person=p=>p&&typeof p.id==='string'&&!!p.id&&typeof p.name==='string'&&!!p.name;
  if(!datesOnly||!Array.isArray(dates?.sponsors)||dates.sponsors.some(p=>!person(p))||dates.caller!==null&&(!person(dates.caller)||dates.caller.id!==c.user?.rosterStaffId||dates.caller.active!==true||typeof dates.caller.role!=='string'||!Array.isArray(dates.caller.groups)||typeof dates.caller.mk!=='string'||typeof dates.caller.appointmentLevel!=='string'))error_(503,'Contacts dates authority is unavailable for this operation.');
 }
 if((!projected&&!Array.isArray(c?.rosterPeople))||typeof c?.user?.rosterSMC!=='boolean'||typeof c?.user?.rosterAdmin!=='boolean')error_(503,'Update Contacts to supply verified relief authority and staff directory.');
 return {staffId:c.user.rosterStaffId||null,email:identity.email,smc:c.user.rosterSMC===true,admin:c.user.rosterAdmin===true};
}

function rosterOperationsNames_(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/^(mr|mrs|ms|mdm|miss|dr)\.?\s+/,'').replace(/\s*\((?:sre|fajt|bt|ut|rt|4\/5)\)\s*/g,' ').replace(/[^a-z0-9]/g,'');}
// Only explicit form-class labels in the imported class column create supervision demand.
// The immutable catalogue is cached separately from current Deploy venues and quotas.

function rosterOperationsFormClasses_(entry,model,known){
 const parse=value=>{const m=/^(?:(?:primary|pri|p)\s*)?([1-6])\s*[-.]?\s*([a-z]+(?:[ '-][a-z]+)*)$/i.exec(String(value||'').trim());return m?{level:Number(m[1]),suffix:m[2].trim(),name:m[1]+m[2].trim(),key:(m[1]+m[2]).toLowerCase().replace(/[^a-z0-9]/g,'')}:null;};
 const key='gsis-roster-classes:v1:'+entry.id+':'+entry.modelFile;let classes;
 try{const raw=memoryCache.get(key);if(raw)classes=JSON.parse(raw);}catch(ignore){}
 if(!Array.isArray(classes)){
  const rows=new Map();for(const [,week] of GSISRoster.weeks(model))for(const block of week.blocks)for(const cell of block.cells)for(const text of cell[1].split(/[\n,;\/]+/)){
   const cls=parse(text);if(!cls)continue;let row=rows.get(cls.key);if(!row){row={...cls,venues:new Set(),formVenues:new Set()};rows.set(cls.key,row);}const venue=cell[2].trim();if(venue){row.venues.add(venue);if(/^form(?:\s|$)/i.test(cell[0].trim()))row.formVenues.add(venue);}
  }
  classes=[...rows.values()].map(({venues,formVenues,...row})=>({...row,venue:formVenues.size===1?[...formVenues][0]:venues.size===1?[...venues][0]:''})).sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name,'en',{numeric:true}));
  try{const raw=JSON.stringify(classes);if(raw.length<30000)memoryCache.put(key,raw,21600);}catch(ignore){}
 }
 const published=new Map();for(const cls of known||[]){const parsed=parse(cls.name);if(parsed){const rows=published.get(parsed.key)||[];rows.push(cls);published.set(parsed.key,rows);}}
 return classes.map(({key,...row})=>{const matches=published.get(key)||[],current=matches.length===1?matches[0]:null;return {...row,id:current?.id||'tt:'+key,timetableClassId:'tt:'+key,deployClassId:current?.id||null,venue:current?.venue||row.venue};});
}

function rosterOperationsPeople_(c){return c.rosterPeople.map(p=>({id:String(p.id),name:String(p.name||''),active:p.active===true,mobile:String(p.mobile||''),email:String(p.email||''),emails:Array.isArray(p.emails)?p.emails:[],employment:String(p.employment||''),mk:String(p.mk||''),appointmentLevel:String(p.appointmentLevel||''),adhocEligible:p.adhocEligible===true,role:String(p.role||''),groups:Array.isArray(p.groups)?p.groups:[]}));}

function rosterOperationsCustom_(p){return ['saveCustomInstruction','deleteCustomInstruction','setCustomInstructionEnabled'].includes(p.operation)||(!p.operation||p.operation==='read')&&p.view==='custom';}

function rosterOperationsNeedsQuota_(p){
 if(p.operation==='requestMutual'&&p.proposalOnly===true)return false;
 const op=p.operation||'read';if(op==='saveAbsence'&&p.ownArrangementsByStaffDate&&Object.values(p.ownArrangementsByStaffDate).some(dated=>dated&&typeof dated==='object'&&Object.values(dated).some(picks=>Array.isArray(picks)&&picks.length)))return true;if(op==='currentDuty'||op==='read'&&p.view==='currentDuty')return false;if(rosterOperationsCustom_(p))return false;if(op==='exportDaily'&&p.fullTeachers===true)return true;if(['systemConfig','saveSystemConfig','nameBridges','saveNameBridge','deleteNameBridge','dailyEmployment','saveDailyEmploymentSettings','dutyRoster','setDutySMC','staplerDates','requestStapler','decideStapler'].includes(op)||op==='read'&&['systemConfig','nameBridges','dailyEmployment','staplerDates','dutyRoster'].includes(p.view))return false;if(['stapler','saveStapler','confirmStapler','publishStapler','resetStapler','moveStapler','restoreStapler'].includes(op)||p.view==='stapler')return true;if(op==='saveRecessSettings'||op==='read'&&p.view==='notificationReadiness')return false;if(['history','acknowledge','exportDaily','dailyNotify','notifyDaily'].includes(op))return false;if(['smc','allocation'].includes(p.view)&&!['setDutySMC','importRHistory','verifyRYear'].includes(op))return true;
 if(op==='read')return !['reportForm','report','entry','mine','duties','adhoc','types','prune','custom'].includes(p.view);
 return ['reliefBatch','assign','candidates','availability','publish','dailyNotify','notifyDaily','requestMutual','respondMutual','allocation','health','accounting','optimise','autoAllocate','scheduledRoster','combine','undo','unassign','setNoRelief','saveRecess','deleteRecess','sendDailyEmploymentReport'].includes(op);
}
// Ordinary draft removals are atomic cell edits. Published/replacement/corrected cover retains the full pipeline.

function rosterOperationsCellMutation_(p,s){
 if(!['setNoRelief','noRelief','unassign'].includes(p.operation)||p.view!=='allocation'||p.compact!==true||typeof p.expectedTimetableId!=='string'||!Number.isInteger(p.expectedStaplerRevision)||typeof p.expectedParity!=='string'||!p.expectedDemandSources||typeof p.expectedDemandSources!=='object'||!Array.isArray(p.demandIds)||!p.demandIds.length)return false;
 const ids=new Set(p.demandIds);
 // Recess demand also joins mutable Deploy venues; retain its normal authoritative context.
 if(p.demandIds.some(id=>!s.absences.some(a=>a.date===p.date&&a.periods.some(period=>a.id+':'+period===id))))return false;
 const rows=s.assignments.filter(a=>ids.has(a.demandId)&&['draft','published','completed'].includes(a.status));
 // A recorded capacity warning must observe recovery before its next shortage episode.
 if(rows.some(a=>!a.noRelief)&&Object.entries(s.healthWarningState||{}).some(([key,value])=>key.startsWith(p.date+':')&&value?.seen?.length))return false;
 return rows.every(a=>a.noRelief===true||a.status==='draft'&&['smc','automatic'].includes(a.origin)&&!a.replaces&&!a.combination&&!a.repurposedDuty&&!a.remove&&!a.publishedAt&&!(s.reliefCorrections||[]).some(c=>c.assignmentId===a.id));
}

function rosterOperationsRecordOnly_(p){return p.operation==='currentDuty'||p.operation==='read'&&p.view==='currentDuty'||rosterOperationsCustom_(p)||['teacherDailyUpdate','dailyNotify','notifyDaily','acknowledge','history','audit','prunePreview','accounting','saveRecessSettings','dutyRoster','setDutySMC','systemConfig','saveSystemConfig','nameBridges','saveNameBridge','deleteNameBridge','dailyEmployment','saveDailyEmploymentSettings','sendDailyEmploymentReport','staplerDates','requestStapler','decideStapler','renameStapler','deleteStapler'].includes(p.operation)||p.operation==='read'&&(['reportForm','schoolAbsences','teacherDailyUpdate','dailyNotify','mine','prune','notificationReadiness','dutyRoster','systemConfig','nameBridges','dailyEmployment','staplerDates'].includes(p.view)||p.compact===true&&['report','entry'].includes(p.view));}

function rosterOperationsWeekCells_(date,timetableName,entries,models,parity){
 const monday=GSISRosterAllocation.monday(date),name=rosterOperationsNames_(timetableName),cells=[];
 for(let weekday=0;weekday<5;weekday++){const d=GSISRosterAllocation.addDays(monday,weekday),entry=GSISRoster.active(entries,d);if(!entry)return {capVerificationReason:'No baseline timetable is active on '+d+'.'};const model=models[entry.id]||(models[entry.id]=rosterModel_(entry)),week=model[model.layoutMode==='single-week'?'single':parity],matches=(week?.blocks||[]).filter(b=>rosterOperationsNames_(b.name)===name);if(matches.length!==1)return {capVerificationReason:'Found '+matches.length+' timetable matches for '+timetableName+' on '+d+'. Exactly one is required.'};cells.push(...matches[0].cells.slice(weekday*week.perDay,(weekday+1)*week.perDay));}return cells;
}

function rosterOperationsQuotaTeacher_(teacher,row,cells,categories,source){
 const cap=row?.periodCap??null,capped=row?.capConfigured===true||cap!==null,capBasis=row?.capBasis,diagnostics={},capWorkload=!capped?null:GSISRosterStapler.capWorkload(cells,categories,capBasis,row?.capNonTeachingPeriods,diagnostics),capVerified=!capped||['teaching','total'].includes(capBasis)&&row?.capVerified===true&&Number.isFinite(cap)&&cap>=0&&Array.isArray(cells)&&Number.isFinite(capWorkload),headroom=capped&&capVerified?Math.max(0,cap-capWorkload):null;
 const capVerificationReason=capVerified?null:!Number.isFinite(cap)||cap<0?'The configured weekly cap is invalid.':!['teaching','total'].includes(capBasis)?'The weekly cap basis is missing or unsupported.':row?.capVerified!==true?row?.capVerificationReason||'Published Deploy workload is unverified.':cells?.capVerificationReason||diagnostics.reason||'The calculated weekly workload is invalid.';
 const R=row?.R??null;
 return {...teacher,R,rawR:row?.rawR,timetableFactor:row?.timetableFactor,teachingWeight:row?.teachingWeight,offloadFactor:row?.offloadFactor,fullTimeTeacherCount:row?.fullTimeTeacherCount,periodCap:cap,capConfigured:capped,capBasis,capWorkload,capHeadroom:headroom,capVerified,capVerificationReason,quotaSource:source||null};
}

function rosterOperationsContext_(req,c,state,providedIndex){
 const p=req.input||{},user=rosterOperationsAuthority_(c,req.identity,p.operation==='staplerDates'),now=new Date(clock.now),today=clock.today,minute=clock.minute;
 const allocationRead=(p.operation||'read')==='read'&&p.view==='allocation'&&p.compact===true;
 if(allocationRead&&!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');
 // Home's duty names use the server clock and current Contacts authority only.
 // Keep this before date parsing, name-bridge seeding and timetable preparation.
 if(p.operation==='currentDuty'||p.operation==='read'&&p.view==='currentDuty'){
  const people=c.rosterPeople.map(p=>({id:String(p.id),name:String(p.name||''),active:p.active===true,role:String(p.role||''),groups:Array.isArray(p.groups)?p.groups:[],mk:String(p.mk||''),appointmentLevel:String(p.appointmentLevel||'')})),smcIds=c.rosterSMCIds;
  return {user,people,days:{},timetableEntries:[],quotaRequested:false,dutySources:{[today]:{available:Array.isArray(smcIds),staffIds:smcIds||[]}},smcIds,today,minute,now:now.getTime(),iso:now.toISOString()};
 }
 if((p.view==='notificationReadiness'||p.operation==='saveRecessSettings')&&!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');
 // Only the literal dates read may use the reduced signed Contacts contract.
 if(p.operation==='staplerDates'){
  const projected=c.rosterProjection==='staplerDates',people=projected?(c.rosterDates.caller?[c.rosterDates.caller]:[]):c.rosterPeople;
  return {user,people,days:{},timetableEntries:(providedIndex||rosterIndex_()).entries,today,minute,now:now.getTime(),iso:now.toISOString(),uuid:()=>crypto.randomUUID(),smcIds:c.rosterSMCIds||[],...(projected?{staplerSponsors:c.rosterDates.sponsors}:{})};
 }
 const requested=GSISRosterOperations.date(p.date||today),dates=[requested,...(Array.isArray(p.dates)?p.dates:[])];if(p.actualDate)dates.push(GSISRosterOperations.date(p.actualDate));
 const people=rosterOperationsPeople_(c),contactsDuty={available:Array.isArray(c.rosterSMCIds),staffIds:(c.rosterSMCIds||[]).filter(id=>people.some(t=>t.id===id&&GSISRosterOperations.dutyEligible(t))),source:{kind:'Contacts'}};
 GSISRosterOperations.seedNameBridges(state,people);const recordContext={calendarDatesVerified:Object.entries(p.calendarByDate||{}).filter(([date,value])=>value?.date===date&&value.available===true).map(([date])=>date),user,people,days:{},timetableEntries:[],dutySources:{[requested]:contactsDuty},today,minute,now:now.getTime(),iso:now.toISOString(),uuid:()=>crypto.randomUUID(),notificationsConfigured:p.notificationsReady===true,adminRecipients:[],smcIds:c.rosterSMCIds||[]};
 if(p.view==='reportForm'&&(p.operation||'read')==='read')return recordContext;
 if(p.view==='schoolAbsences'&&(p.operation||'read')==='read'){if(!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');GSISRosterOperations.schoolAbsencesRange(recordContext,p);return recordContext;}
 // Ongoing directions are policy records. Their editor does not need Calendar,
 // daily teacher rows, R quotas or allocation reconciliation.
 if(rosterOperationsCustom_(p)){
  if(!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');
  const index=rosterIndex_(),entry=GSISRoster.active(index.entries,today),model=entry?rosterModel_(entry):null,catalogue=rosterOperationsSubjectCatalogue_(),periods=new Set(Array.from({length:model?model.maxPeriod+1:17},(_,i)=>i));
  for(const row of state.customInstructions||[])if(!row.deletedAt)for(const period of row.periods||[])if(Number.isInteger(period)&&period>=0&&period<40)periods.add(period);
  return {...recordContext,customPeriods:[...periods].sort((a,b)=>a-b).map(period=>({period})),teachingGroups:catalogue.teachingGroups||[]};
 }
 if(['systemConfig','saveSystemConfig','nameBridges','saveNameBridge','deleteNameBridge'].includes(p.operation)||['systemConfig','nameBridges'].includes(p.view)){
  const configRead=p.operation==='systemConfig'||p.operation==='read'&&p.view==='systemConfig';if(!user.admin&&!(configRead&&user.smc))error_(403,'Contacts Admin access is required.');const index=rosterIndex_(),entry=GSISRoster.active(index.entries,today),subjects=new Set(),unmatchedTimetableNames=[],timetableNames=[],availablePeriods=[];if(entry){const model=rosterModel_(entry),blocks=(model.layoutMode==='single-week'?model.single:model.odd).blocks,matched=new Set(GSISRosterOperations.matchTimetableNames(state,people,blocks).map(r=>r.index));availablePeriods.push(...Array.from({length:model.maxPeriod+1},(_,i)=>i));blocks.forEach((r,i)=>{if(!timetableNames.includes(r.name))timetableNames.push(r.name);if(!matched.has(i))unmatchedTimetableNames.push(r.name);});for(const [,week] of GSISRoster.weeks(model))for(const block of week.blocks)for(const cell of block.cells){const subject=String(cell[0]||'').trim().replace(/\s+/g,' ');if(subject)subjects.add(subject);}}
  const subjectConfig=configRead||p.operation==='saveSystemConfig',catalogue=subjectConfig?rosterOperationsSubjectCatalogue_():null;
  return {...recordContext,timetableEntries:index.entries,teachingGroups:catalogue?.teachingGroups||[],timetableNames:timetableNames.sort((a,b)=>a.localeCompare(b)),availablePeriods:entry?availablePeriods:Array.from({length:17},(_,i)=>i),unmatchedTimetableNames,subjects:[...subjects].sort((a,b)=>a.localeCompare(b)),subjectBaseline:entry?{id:entry.id,name:entry.name,from:entry.from,to:entry.to}:null,schedulerAvailable:p.schedulerAvailable===true};
 }
 if(['dutyRoster','setDutySMC'].includes(p.operation)||p.view==='dutyRoster'){if(!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');return recordContext;}
 if(['dailyNotify','notifyDaily'].includes(p.operation)||p.operation==='read'&&p.view==='dailyNotify'){if(!user.smc&&!user.admin)error_(403,'SMC or Admin access is required.');const index=rosterIndex_(),entry=GSISRoster.active(index.entries,requested),calendar=p.calendarByDate?.[requested],verified=calendar?.date===requested&&typeof calendar.schoolDay==='boolean';return {...recordContext,snapshotContext:true,timetableEntries:index.entries,days:{[requested]:{id:entry?.id||null,verified,schoolDay:!!entry&&verified&&calendar.schoolDay,teachers:[],periods:[]}}};}
 if(p.operation==='teacherDailyUpdate'||p.operation==='read'&&p.view==='teacherDailyUpdate')return recordContext;
 if(['dailyEmployment','saveDailyEmploymentSettings'].includes(p.operation)||p.operation==='read'&&p.view==='dailyEmployment')return recordContext;
 if(['staplerDates','requestStapler','decideStapler','renameStapler','deleteStapler'].includes(p.operation)||p.view==='staplerDates'&&!['moveStapler','restoreStapler'].includes(p.operation)||p.operation==='stapler'&&requested<today&&state.staplerPlans.some(r=>r.date===requested))return {...recordContext,timetableEntries:rosterIndex_().entries};
 if(p.operation==='stapler'&&!GSISRosterOperations.staplerPermission(state,recordContext,requested)&&GSISRosterOperations.mayViewConfirmed(state,recordContext,state.staplerPlans.find(r=>r.date===requested)))return {...recordContext,timetableEntries:rosterIndex_().entries};
 if(p.operation==='sendDailyEmploymentReport'&&state.dailyEmploymentSnapshots?.some(r=>r.date===requested))return recordContext;
 if(p.operation==='scheduledRoster'&&(state.massPublications?.[today]||state.staplerPlans.some(r=>r.date===today&&r.published))&&minute>=GSISRosterOperations.clock(state.dailyEmploymentSettings.time)&&!state.dailyEmploymentAutomatic?.[today])dates.push(today);
 // These views use durable records, not a rebuilt school-wide timetable or quota.
 if(['history','acknowledge','audit','prunePreview','accounting','saveRecessSettings'].includes(p.operation)||p.operation==='read'&&['duties','mine','prune','notificationReadiness'].includes(p.view))return {user,people:c.rosterPeople.map(p=>({id:String(p.id),name:String(p.name||''),active:p.active===true,mobile:String(p.mobile||'')})),days:{},timetableEntries:rosterOperationsRecordOnly_(p)?[]:rosterIndex_().entries,today,minute,now:now.getTime(),iso:now.toISOString(),uuid:()=>crypto.randomUUID(),notificationsConfigured:p.notificationsReady===true,adminRecipients:[],smcIds:c.rosterSMCIds||[]};
 if(p.operation==='saveRecess')dates.push(...GSISRosterOperations.dates(p));
 if(p.operation==='moveStapler')dates.push(GSISRosterOperations.date(p.newDate));
 if(p.operation==='saveAbsence'&&!p.id)dates.push(...GSISRosterOperations.absenceDates({...p,date:requested},recordContext));
 for(const id of [p.absenceId,p.id,...(p.absenceIds||[]),...(p.ids||[])]){const a=state.absences.find(a=>a.id===id)||state.requests.find(a=>a.id===id)||state.adhoc.find(a=>a.id===id);if(a)dates.push(a.date);}
 // Existing saved plans supply their own editor data. Reopening needs current
 // baseline identity/timing and authority; Save and Confirm still rebuild quotas.
 const savedRead=p.operation==='stapler'&&GSISRosterOperations.staplerPermission(state,recordContext,requested)?state.staplerPlans.find(r=>r.date===requested):null,savedReadPlan=savedRead?.draft||savedRead?.published;
 const inactiveDates=GSISRosterOperations.inactiveAssignmentDates(state,recordContext);dates.push(...inactiveDates);
 const unique=[...new Set(dates)],index=providedIndex||rosterIndex_(),models={},modelIdentities={},cellMutation=rosterOperationsCellMutation_(p,state),quotaRequested=!savedReadPlan&&!cellMutation&&(rosterOperationsNeedsQuota_(p)||inactiveDates.length>0),quotaSource=allocationRead?rosterOperationsQuotaSource_():null,allocationReferenceKey=allocationRead?rosterOperationsAllocationReference_(state,people,index,p,quotaSource,today,unique):null,cached=allocationRead?rosterOperationsAllocationBaseline_(allocationReferenceKey):null;
 if(cached&&quotaSource.entry)reliefGuard_(quotaSource.book,quotaSource.index,quotaSource.entry);
 const quota=quotaRequested&&!cached?rosterOperationsPhase_('quota',()=>rosterOperationsQuota_(unique,quotaSource)):{from:'',to:'',rows:[]};
 let subjectCatalogueLoaded=false;
 const compact=!inactiveDates.length&&p.operation==='read'&&p.compact===true&&['report','entry'].includes(p.view),targetId=(user.smc||user.admin)?(p.staffId||state.absences.find(a=>a.id===(p.absenceId||p.id))?.staffId||user.staffId):user.staffId,targetIds=new Set(compact&&p.staffIds!==undefined?GSISRosterOperations.absenceStaffIds(recordContext,p):[targetId]);

 const quotaById=new Map(quota.rows.map(r=>[r.id,r]));
 const classCatalogues={},days=cached?cached.days:{};for(const d of cached?[]:unique){const entry=GSISRoster.active(index.entries,d);if(!entry){days[d]={id:null,parity:null,verified:true,schoolDay:false,warning:'No timetable is in force on this date.',periods:[],teachers:[]};continue;}
  const model=models[entry.id]||(models[entry.id]=rosterModel_(entry)),calendar=p.calendarByDate?.[d],verified=calendar&&calendar.date===d&&typeof calendar.schoolDay==='boolean',parity=model.layoutMode==='single-week'?'single':verified&&['odd','even'].includes(calendar.parity)?calendar.parity:null;
  const week=parity?model[parity]:null,weekday=(new Date(d+'T12:00:00Z').getUTCDay()+6)%7,schoolDay=verified&&calendar.schoolDay===true&&weekday<5&&!!week;
  const periods=Array.from({length:model.maxPeriod+1},(_,period)=>{const startMinutes=model.timing.startMinutes+period*model.timing.periodMinutes,endMinutes=startMinutes+model.timing.periodMinutes,fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');return {period,start:fmt(startMinutes),end:fmt(endMinutes),startMinutes,endMinutes};});
  if(savedReadPlan){days[d]={id:entry.id,parity,verified:!!verified,schoolDay,periods,teachers:[],endOfDayMinutes:model.timing.endOfDayMinutes??810};continue;}
  if(!quotaRequested&&!cellMutation&&!subjectCatalogueLoaded&&GSISRoster.weeks(model).some(([,w])=>w.blocks.some(b=>b.cells.some(cell=>String(cell[3]||'').trim())))){Object.assign(quota,rosterOperationsSubjectCatalogue_());subjectCatalogueLoaded=true;}
  const teachers=[],identityWeek=model.layoutMode==='single-week'?model.single:model.odd,matched=modelIdentities[entry.id]||(modelIdentities[entry.id]=GSISRosterOperations.matchTimetableNames(state,people,identityWeek.blocks)),teacherIdentities=matched.map(({person,timetableName})=>({staffId:person.id,name:person.name,timetableName}));
  if(week&&weekday<5)for(const {index:blockIndex,person,timetableName} of matched){if(compact&&!targetIds.has(person.id))continue;const block=week.blocks[blockIndex],r=d>=quota.from&&d<=quota.to?quotaById.get(person.id):null;teachers.push(rosterOperationsQuotaTeacher_({staffId:person.id,name:person.name,timetableName,teachingProfile:quotaRequested?GSISRosterAllocation.teachingProfile((model.layoutMode==='single-week'?[model.single]:[model.odd,model.even]).flatMap(w=>w.blocks[blockIndex]?.cells||[]),quota.formClasses||[],quota.teachingGroups||[],quota.subjectCategories||{},state.systemConfig):undefined,cells:block.cells.slice(weekday*week.perDay,(weekday+1)*week.perDay),...(p.operation==='externalDuties'?{weekCells:block.cells,perDay:week.perDay}: {})},r,r?.capConfigured||r?.periodCap!=null?rosterOperationsWeekCells_(d,timetableName,index.entries,models,parity):block.cells,quota.subjectCategories,quota.source));}
  days[d]={id:entry.id,modelId:entry.id,modelReference:{id:entry.id,name:entry.name,from:entry.from,to:entry.to,priority:entry.priority},teacherIdentities,compact,targetId:compact?targetId:null,...(compact&&p.staffIds!==undefined?{targetIds:[...targetIds]}:{}),parity,verified:!!verified,schoolDay,warning:!verified?'Calendar date is unverified. Assignment planning is unavailable.':!schoolDay?(calendar.reason||calendar.warning||'This is not a confirmed school day.'):teacherIdentities.length!==identityWeek.blocks.length?'Some timetable names could not be matched uniquely to Contacts; these teachers are unavailable for automatic selection.':'',periods,teachers,endOfDayMinutes:model.timing.endOfDayMinutes??810,deployTeachingEvidence:GSISRosterAllocation.deploymentTeachingEvidence(quota,d),quotaSource:quota.source||null,recesses:model.recesses||[],subjectCategories:quota.subjectCategories||{},teachingGroups:d>=quota.from&&d<=quota.to?quota.teachingGroups||[]:[],formClasses:compact?[]:(classCatalogues[entry.id+':'+(d>=quota.from&&d<=quota.to)]||(classCatalogues[entry.id+':'+(d>=quota.from&&d<=quota.to)]=rosterOperationsFormClasses_(entry,model,d>=quota.from&&d<=quota.to?quota.formClasses||[]:[])))};
 }
 if(savedReadPlan)return {...recordContext,days,baselineDays:days,timetableEntries:index.entries,venues:{[requested]:savedReadPlan.venues||[]}};
 const dutySources=Object.fromEntries(unique.map(d=>[d,contactsDuty])),venues=cached?cached.venues:Object.fromEntries(unique.map(d=>[d,d>=quota.from&&d<=quota.to?quota.venues||[]:[]]));
 if(allocationRead&&!cached)rosterOperationsAllocationBaseline_(allocationReferenceKey,{days,venues});
 const configured=p.notificationsReady===true,adminRecipients=(props_().getProperty('ROSTER_NOTIFICATION_ADMIN_IDS')||'').split(',').map(s=>s.trim()).filter(id=>people.some(p=>p.id===id)&&(c.rosterAdminIds||[]).includes(id));
 return GSISRosterOperations.composeStaplerContext(state,{calendarDatesVerified:recordContext.calendarDatesVerified,user,people,days,baselineDays:days,...(allocationRead?{allocationReferenceKey,cacheReused:!!cached}:{}),staplerEditor:['stapler','saveStapler','confirmStapler','publishStapler','resetStapler','moveStapler','restoreStapler'].includes(p.operation),dutySources,venues,quotaRequested,cellMutation,timetableEntries:index.entries,today,minute,now:now.getTime(),iso:now.toISOString(),uuid:()=>crypto.randomUUID(),notificationsConfigured:configured,adminRecipients,smcIds:c.rosterSMCIds||[]});
}

 const result=rosterOperationsContext_({input,identity:who},contacts,state,index);
 return {...result,contacts,adminIds:contacts.rosterAdminIds||[],urgentSMCIds:contacts.rosterUrgentSMCIds||[],edgeReferenceKey:referenceKey};
}

function rosterOperationsCustom_(p){return ['saveCustomInstruction','deleteCustomInstruction','setCustomInstructionEnabled'].includes(p.operation)||(!p.operation||p.operation==='read')&&p.view==='custom';}

export function edgeRosterNeedsQuota(p){
 if(p.operation==='requestMutual'&&p.proposalOnly===true)return false;
 const op=p.operation||'read';if(op==='saveAbsence'&&p.ownArrangementsByStaffDate&&Object.values(p.ownArrangementsByStaffDate).some(dated=>dated&&typeof dated==='object'&&Object.values(dated).some(picks=>Array.isArray(picks)&&picks.length)))return true;if(op==='currentDuty'||op==='read'&&p.view==='currentDuty')return false;if(rosterOperationsCustom_(p))return false;if(op==='exportDaily'&&p.fullTeachers===true)return true;if(['systemConfig','saveSystemConfig','nameBridges','saveNameBridge','deleteNameBridge','dailyEmployment','saveDailyEmploymentSettings','dutyRoster','setDutySMC','staplerDates','requestStapler','decideStapler'].includes(op)||op==='read'&&['systemConfig','nameBridges','dailyEmployment','staplerDates','dutyRoster'].includes(p.view))return false;if(['stapler','saveStapler','confirmStapler','publishStapler','resetStapler','moveStapler','restoreStapler'].includes(op)||p.view==='stapler')return true;if(op==='saveRecessSettings'||op==='read'&&p.view==='notificationReadiness')return false;if(['history','acknowledge','exportDaily','dailyNotify','notifyDaily'].includes(op))return false;if(['smc','allocation'].includes(p.view)&&!['setDutySMC','importRHistory','verifyRYear'].includes(op))return true;
 if(op==='read')return !['reportForm','report','entry','mine','duties','adhoc','types','prune','custom'].includes(p.view);
 return ['reliefBatch','assign','candidates','availability','publish','dailyNotify','notifyDaily','requestMutual','respondMutual','allocation','health','accounting','optimise','autoAllocate','scheduledRoster','combine','undo','unassign','setNoRelief','saveRecess','deleteRecess','sendDailyEmploymentReport'].includes(op);
}
// Ordinary draft removals are atomic cell edits. Published/replacement/corrected cover retains the full pipeline.
