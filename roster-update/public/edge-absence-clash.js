import {GSISRosterOperations as O,GSISRosterAllocation as A} from './edge-roster-domain.js';
import {sha256Hex} from './edge-deploy-sha256.js';

const fail=(status,message,code)=>{throw Object.assign(Error(message),{status,code,reasonCode:code});};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])])):value;
function overlaps(a,b,day){
 const left=O.resubmissionIntervals([a],day),right=O.resubmissionIntervals([b],day);
 if(left.length&&right.length)return left.some(x=>right.some(y=>x.startMinutes<y.endMinutes&&x.endMinutes>y.startMinutes));
 return (a.periods||[]).some(period=>(b.periods||[]).includes(period))||!!(a.coverage&&b.periods?.length||b.coverage&&a.periods?.length);
}
export function previewAbsenceClash(state,ctx,p){
 const staffIds=O.absenceStaffIds(ctx,p),dates=O.absenceDates(p),coverage=p.fullDay===true?{kind:'fullDay'}:p.coverage||null,requested={periods:p.periods||[],coverage};
 if(p.id)fail(400,'Use the existing absence editor for an edited report.','ABSENCE_REPLACEMENT_INPUT');
 const captured=Date.parse(ctx.reportedAt||''),reportDay=Number.isFinite(captured)&&captured<=ctx.now?new Date(captured+28800000).toISOString().slice(0,10):ctx.today;
 if(dates.some(date=>date<reportDay))fail(403,'Past absence entries are view only.','ABSENCE_REPLACEMENT_PAST');
 const rows=state.absences.filter(a=>!a.deletedAt&&dates.includes(a.date)&&staffIds.some(id=>O.samePerson(ctx,id,a.staffId))&&overlaps(a,requested,ctx.days[a.date]||{periods:a.periodSnapshot||[]})).sort((a,b)=>a.id.localeCompare(b.id));
 if(rows.some(a=>!ctx.user.smc&&!ctx.user.admin&&a.staffId!==ctx.user.staffId))fail(403,'You can manage only your own absence records.','ABSENCE_REPLACEMENT_ACCESS');
 const request={staffIds,dates,periods:requested.periods,coverage,typeId:p.typeId,reasonDetail:p.reasonDetail||'',reliefRequired:p.reliefRequired!==false};
 return {absenceClash:true,token:sha256Hex(JSON.stringify(canonical({version:1,request,rows}))),overlaps:rows.map(a=>({id:a.id,staffId:a.staffId,name:a.name||ctx.people.find(p=>p.id===a.staffId)?.name,date:a.date,periods:structuredClone(a.periods||[]),coverage:structuredClone(a.coverage||null),typeLabel:a.typeLabel,reasonDetail:a.reasonDetail||''}))};
}
export function applyAbsenceClash(state,ctx,p){
 const preview=previewAbsenceClash(state,ctx,p);
 if(typeof p.absenceClashToken!=='string'||p.absenceClashToken!==preview.token)fail(409,'The saved absence changed. Review the current absence before replacing it.','ABSENCE_REPLACEMENT_CHANGED');
 if(preview.overlaps.length&&p.confirmAbsenceReplacement!==true)fail(409,'Confirm replacement of the current absence first.','ABSENCE_OVERLAP');
 // Retain lazy immutable plans; all mutable attendance/receipt collections are isolated.
 const next=structuredClone({...state,staplerPlans:[],staplerArchives:[]});
 for(const key of ['staplerPlans','staplerArchives'])next[key]=(state[key]||[]).map(row=>({...row}));
 const ids=preview.overlaps.map(a=>a.id),rows=next.absences.filter(a=>ids.includes(a.id)),command={...p};
 delete command.absenceClashToken;delete command.confirmAbsenceReplacement;
 for(const row of rows){row.deletedAt=ctx.iso;row.deletedBy=ctx.user.email;}
 // Match normal absence deletion: retire future cover, retain started work and history.
 const remaining=rows.length?Object.keys(ctx.days).flatMap(date=>O.demand(ctx,next,date)):[];
 for(const a of A.effectiveAssignments(next,true)){
  if(![a.absenceId,...(a.absenceIds||[])].some(id=>ids.includes(id))||remaining.some(d=>d.id===a.demandId||a.sharedLessonKey&&d.sharedLessonKey===a.sharedLessonKey)||A.periodStarted(ctx,a.date,a.period,a))continue;
  O.releaseAssignment(next,{...ctx,draftBatch:true,manualMutation:true},a,'Absence deleted; this lesson no longer requires cover.');
 }
 const result=O.apply(next,{...ctx,resubmission:false},command);
 for(const row of rows){row.replacedByRequestId=p.requestId;row.replacedByAbsenceIds=result.savedIds.slice();}
 if(rows.length)O.essentialDecisionAudit(next,ctx,'replaceAbsence',{date:p.date||rows[0].date,ids:result.savedIds,replacedIds:ids,requestId:p.requestId});
 Object.assign(state,next);return {...result,replacedIds:ids};
}
