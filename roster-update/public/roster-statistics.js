/* Restricted statistics projections. Activity counts are not R charges. No I/O. */
var GSISRosterStatistics = (() => {
 'use strict';
 const DAY=86400000, MAX_DAYS=366, SCHEMA=1;
 const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
 const A=()=>typeof GSISRosterAllocation!=='undefined'?GSISRosterAllocation:require('./roster-allocation.js');
 function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T12:00:00Z'))||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)fail(400,'Choose valid start and end dates.');return value;}
 const addDays=(value,n)=>new Date(Date.parse(date(value)+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
 function range(from,to,max=MAX_DAYS){date(from);date(to);const days=Math.round((Date.parse(to)-Date.parse(from))/DAY)+1;if(days<1||days>max)fail(400,'Choose a range of 1 to '+max+' days.');return {from,to,days};}
 function dates(from,to){const r=range(from,to,3660);return Array.from({length:r.days},(_,i)=>addDays(from,i));}
 const inside=(d,r)=>d>=r.from&&d<=r.to;
 const teacherName=(row,names)=>String(row.name||row.staffName||names.get(row.staffId)||'Unknown teacher');
 function periodsForAbsence(a,state){
  const timing=a.periodSnapshot?.length?a.periodSnapshot:state.dailyPublicationStates?.[a.date]?.periods;
  if(a.coverage&&(!timing||!timing.length))return null;
  const values=A().absencePeriods(a,timing?{periods:timing}:undefined);
  if(a.timetablePending&&!values.length)return null;
  return [...new Set(values.filter(n=>Number.isInteger(n)&&n>=0))].sort((a,b)=>a-b);
 }
 function liveFacts(state,ctx,r){
  const names=new Map((ctx.people||[]).map(p=>[p.id,p.name]));
  const absenceRows=(state.absences||[]).filter(a=>!a.deletedAt&&inside(a.date,r)).map(a=>({id:String(a.id),date:a.date,staffId:String(a.staffId),name:teacherName(a,names),periods:periodsForAbsence(a,state),fullDay:a.coverage?.kind==='fullDay',coverageKind:a.coverage?.kind||'periods',reason:[a.typeLabel||'Unspecified',a.reasonDetail||''].filter(Boolean).join(' · '),createdAt:String(a.reportedAt||a.createdAt||''),updatedAt:String(a.updatedAt||''),source:'retained'}));
  // Draft replacements must not hide the still-published duty in a historical report.
  const model={...state,assignments:(state.assignments||[]).filter(a=>a.status!=='draft'),absences:state.absences||[],importedRelief:state.importedRelief||[]};
  const activityRows=[],importedWeekly=[];
  for(const a of A().accounted(model,{...ctx,days:{}})){
   if(!inside(a.date,r)&&!(a.origin==='imported'&&a.date<=r.to&&addDays(a.date,6)>=r.from))continue;
   if(!['published','completed'].includes(a.status)||a.noRelief||a.remove)continue;
   if(!Number.isInteger(a.period)){
    if(a.origin==='imported'&&Number.isFinite(a.rCost))importedWeekly.push({id:String(a.id),staffId:String(a.staffId),name:teacherName(a,names),week:a.date,to:addDays(a.date,6),periods:Math.max(0,a.rCost),source:String(a.source||'Imported weekly relief')});
    continue;
   }
   activityRows.push({id:String(a.id),staffId:String(a.staffId),name:teacherName(a,names),date:a.date,period:a.period,kind:a.combination?'combine':'relief',status:a.accountingUnconfirmed||a.actualReviewRequired?'unconfirmed':a.status==='completed'||a.completionStatus==='completed'?'completed':'published',className:String(a.className||''),subject:String(a.subject||''),groupName:String(a.groupName||''),venue:String(a.venue||''),origin:String(a.origin||''),source:'retained'});
  }
  return {absenceRows,activityRows,importedWeekly};
 }
 function mergeById(archive,live){const rows=new Map(archive.map(x=>[x.id,x]));for(const row of live)rows.set(row.id,row);return [...rows.values()];}
 function project(state,ctx,p){
  if(!ctx?.user?.smc&&!ctx?.user?.admin)fail(403,'Statistics is available to SMC and Admin only.');
  const r=range(p.from,p.to),facts=liveFacts(state,ctx,r),archived=Object.entries(state.statisticsArchive||{}).filter(([d])=>inside(d,r)),arch={absenceRows:[],activityRows:[],importedWeekly:[]};
  for(const [,value] of archived)for(const key of ['absenceRows','activityRows'])arch[key].push(...(value[key]||[]).map(row=>({...row,source:'preserved'})));
  for(const value of Object.values(state.statisticsArchive||{}))for(const row of value.importedWeekly||[])if(row.week<=r.to&&row.to>=r.from)arch.importedWeekly.push({...row,source:'preserved'});
  for(const key of Object.keys(arch))facts[key]=mergeById(arch[key],facts[key]);
  const deleted=new Set((state.absences||[]).filter(a=>a.deletedAt).map(a=>a.id));facts.absenceRows=facts.absenceRows.filter(a=>!deleted.has(a.id));
  const retainedDates=new Set([...facts.absenceRows,...facts.activityRows].map(a=>a.date)),trackingFrom=state.statisticsTrackingFrom||state.freshStart?.effectiveDate||null;
  const coverage=dates(r.from,r.to).map(d=>({date:d,status:d>ctx.today?'future':state.statisticsArchive?.[d]?(state.statisticsArchive[d].complete?'preserved':'partial-preserved'):trackingFrom&&d>=trackingFrom?'tracked':retainedDates.has(d)?'partial':'unknown'}));
  const warnings=[];
  if(coverage.some(d=>['partial','partial-preserved','unknown'].includes(d.status)))warnings.push('Older history may be incomplete or pruned. Missing records are not proof of zero activity.');
  if(facts.absenceRows.some(a=>a.periods===null))warnings.push('Some absences have no saved timetable periods. They count as absent teacher-days; their period totals are unknown.');
  if(facts.activityRows.some(a=>a.status==='unconfirmed'))warnings.push('Some replaced duties await completion confirmation. They are excluded from activity totals until confirmed.');
  if(facts.importedWeekly.length)warnings.push('Imported relief is a weekly total. It is shown separately and cannot be assigned to individual dates.');
  const seen=new Set([...facts.absenceRows,...facts.activityRows,...facts.importedWeekly].map(a=>a.staffId));
  const people=(ctx.people||[]).filter(p=>p.active||seen.has(p.id)).map(p=>({id:String(p.id),name:String(p.name||p.id)}));
  for(const row of [...facts.absenceRows,...facts.activityRows,...facts.importedWeekly])if(!people.some(p=>p.id===row.staffId))people.push({id:row.staffId,name:row.name});
  return {schema:SCHEMA,...(state.freshStart?.effectiveDate?{historyCoverage:{since:state.freshStart.effectiveDate,archiveUrl:'/archive.html'}}:{}),from:r.from,to:r.to,today:ctx.today,checkedAt:ctx.iso,revision:state.revision,trackingFrom,people,...facts,coverage,warnings};
 }
 function markTracking(state,ctx){if(!state.statisticsTrackingFrom){state.statisticsTrackingFrom=date(state.freshStart?.effectiveDate||ctx.today);return true;}return false;}
 function captureBeforePrune(state,selection,ctx){
  const removed=new Set();for(const key of ['absences','assignments','importedRelief'])for(const row of selection.lists?.[key]||[])if(row.date){removed.add(row.date);const corrected=key==='absences'?row:A().corrected(state,row);if(corrected.date)removed.add(corrected.date);}
  for(const d of selection.maps?.dailyPublicationStates||[])removed.add(d);
  if(!removed.size)return;
  const ordered=[...removed].sort(),facts=liveFacts(state,ctx,{from:ordered[0],to:ordered[ordered.length-1]}),buckets=new Map(ordered.map(d=>[d,{absenceRows:[],activityRows:[],importedWeekly:[]}]));
  for(const key of Object.keys(facts))for(const row of facts[key]){const bucket=buckets.get(row.date||row.week);if(bucket)bucket[key].push(row);}
  if(!state.statisticsArchive)state.statisticsArchive={};
  const deleted=new Set((state.absences||[]).filter(a=>a.deletedAt).map(a=>String(a.id)));
  for(const d of ordered){
   const prior=state.statisticsArchive[d],bucket=buckets.get(d),preserved={schema:SCHEMA,savedAt:ctx.iso,complete:prior?.complete===true||!!state.statisticsTrackingFrom&&d>=state.statisticsTrackingFrom&&d<=ctx.today};
   for(const key of Object.keys(bucket))preserved[key]=mergeById(prior?.[key]||[],bucket[key]);
   preserved.absenceRows=preserved.absenceRows.filter(a=>!deleted.has(a.id));
   state.statisticsArchive[d]=preserved;
  }
 }
 function aggregate(payload,options={}){
  const onlyCompleted=options.mode==='completed',byDate=new Map(dates(payload.from,payload.to).map(d=>[d,{date:d,absentDays:0,absentPeriods:0,unknownAbsencePeriods:0,relief:0,combine:0,completedRelief:0,completedCombine:0}])),byTeacher=new Map((payload.people||[]).map(p=>[p.id,{staffId:p.id,name:p.name,absentDays:0,absentPeriods:0,unknownAbsencePeriods:0,relief:0,combine:0,completedRelief:0,completedCombine:0,dates:{}}]));
  const teacher=row=>{if(!byTeacher.has(row.staffId))byTeacher.set(row.staffId,{staffId:row.staffId,name:row.name,absentDays:0,absentPeriods:0,unknownAbsencePeriods:0,relief:0,combine:0,completedRelief:0,completedCombine:0,dates:{}});return byTeacher.get(row.staffId);};
  const absences=new Map();for(const row of payload.absenceRows||[]){const key=row.staffId+'|'+row.date;if(!absences.has(key))absences.set(key,{row,periods:new Set(),unknown:false});const day=absences.get(key);if(row.periods===null)day.unknown=true;else for(const p of row.periods||[])day.periods.add(p);}
  for(const {row,periods,unknown} of absences.values())for(const target of [byDate.get(row.date),teacher(row)])if(target){target.absentDays++;target.absentPeriods+=periods.size;if(unknown)target.unknownAbsencePeriods++;}
  const slots=new Map();for(const row of payload.activityRows||[]){const key=row.staffId+'|'+row.date+'|'+row.period;if(!slots.has(key))slots.set(key,[]);slots.get(key).push(row);}
  const duties=[];for(const rows of slots.values()){
   const row=rows[0],unconfirmed=rows.some(a=>a.status==='unconfirmed'),completed=rows.every(a=>a.status==='completed'),kind=rows.some(a=>a.kind==='combine')?'combine':'relief',t=teacher(row),d=byDate.get(row.date);if(!d)continue;
   const slot={staffId:row.staffId,name:t.name,date:row.date,period:row.period,kind,status:unconfirmed?'unconfirmed':completed?'completed':'published',details:rows};duties.push(slot);
   if(unconfirmed)continue;
   if(completed){t[kind==='combine'?'completedCombine':'completedRelief']++;d[kind==='combine'?'completedCombine':'completedRelief']++;}
   if(onlyCompleted&&!completed)continue;
   for(const target of [t,d])target[kind]++;
   if(!t.dates[row.date])t.dates[row.date]={relief:0,combine:0};t.dates[row.date][kind]++;
  }
  const cumulative={absentDays:0,absentPeriods:0,unknownAbsencePeriods:0,relief:0,combine:0,completedRelief:0,completedCombine:0};
  const daily=[...byDate.values()];let runningAbsence=0,runningRelief=0,runningCombine=0;
  for(const d of daily){for(const k of Object.keys(cumulative))cumulative[k]+=d[k];runningAbsence+=d.absentDays;runningRelief+=d.relief;runningCombine+=d.combine;Object.assign(d,{runningAbsence,runningRelief,runningCombine});}
  return {cumulative,daily,teachers:[...byTeacher.values()].sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true})),duties,mode:onlyCompleted?'completed':'published'};
 }
 function preset(id,today,calendar={}){
  date(today);const dt=new Date(today+'T12:00:00Z'),monday=addDays(today,-((dt.getUTCDay()+6)%7));
  if(id==='week')return {from:monday,to:today};
  if(id==='pastWeek')return {from:addDays(monday,-7),to:addDays(monday,-1)};
  if(id==='fortnight')return {from:addDays(monday,-14),to:addDays(monday,-1)};
  if(id==='month'){const first=today.slice(0,7)+'-01',to=addDays(first,-1);return {from:to.slice(0,7)+'-01',to};}
  if(id==='year'){const y=dt.getUTCFullYear()-1;return {from:y+'-01-01',to:y+'-12-31'};}
  if(['term','semester'].includes(id)){const list=calendar[id==='term'?'terms':'semesters']||[],past=list.filter(x=>x.to<today).sort((a,b)=>b.to.localeCompare(a.to));if(!past.length)return null;return {from:date(past[0].from),to:date(past[0].to)};}
  return null;
 }
 return {schema:SCHEMA,maxDays:MAX_DAYS,date,range,dates,addDays,project,aggregate,preset,markTracking,captureBeforePrune};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISRosterStatistics;
