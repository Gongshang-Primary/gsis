import Operations from '../../../shared/roster-operations.js';
import Allocation from '../../../shared/roster-allocation.js';
import {layeredHealth,forecastCapacity} from './capacity.mjs';

export function capacityText(h,c,date=h.date){
  if(!h?.verified||h.incomplete)return 'Capacity not verified; check Roster. Unknown is not zero.';
  const future=h.periods.filter(p=>!p.started&&(!c||!Allocation.periodStarted(c,date,p.period))),low=future.filter(p=>p.green.length<=2);
  return 'Eligible choices by period: '+(low.map(p=>'P'+p.period+'='+p.green.length).join(', ')||'no low-capacity periods')+'. Choices overlap across periods; not additive R.';
}
export function outlookText(forecast){
  const rows=forecast.days.filter(d=>d.state!=='not-school-day');
  const text=rows.map(d=>d.state!=='projected'?d.date+': not verified':d.date+': '+d.unresolved.length+' uncovered after projected cover').join('; ');
  return 'Known-demand outlook: '+text+'. '+(rows.some(d=>d.state==='projected'&&d.unresolved.length)?'Consider external ad hoc relief; review Roster. ':'')+'Bounded projection, not a booking or minimum external headcount.';
}
export function replaceLegacyWarnings(before,next){
  const oldJobs=new Set(before.outbox.map(j=>j.id)),oldAlerts=new Set(before.smcAlerts.map(a=>a.id));
  next.outbox=next.outbox.filter(j=>oldJobs.has(j.id)||j.kind!=='capacity_warning');
  next.smcAlerts=next.smcAlerts.filter(a=>oldAlerts.has(a.id)||!a.key.startsWith('capacity:'));
  next.healthWarningState=structuredClone(before.healthWarningState||{});
}
export function queueCapacityWarnings(next,c,h){
  if(!h?.verified||h.incomplete)return;
  const events=Allocation.warningEvents(next,c,h),summary=capacityText(h,c);
  for(const e of events)Operations.smcAlert(next,c,h.date,e.key,summary,!e.quiet,'capacity_warning',{
    templateKey:'capacity_warning',healthSummary:summary,period:e.period,remaining:e.count,capacityEngine:'v1',observedAt:c.now,
  });
}
export async function updateCapacityWarnings(ctx,loaded,next,c,dates,revision){
  replaceLegacyWarnings(loaded.state,next);
  if(c.quotaRequested!==true)return;
  for(const date of [...new Set(dates)].slice(0,7)){
    if(c.days[date]?.schoolDay!==true||date<c.today)continue;
    const previous=Allocation.health(next,c,date,Operations.demand(c,next,date));
    const h=await layeredHealth(ctx,{...loaded,state:next},c,date,revision,previous);
    queueCapacityWarnings(next,c,h);
  }
}
export async function refreshCapacityMessage(ctx,loaded,c,payload,revision,cache=new Map()){
  if(payload.date<c.today)return false;
  if(payload.kind==='capacity_warning'){
    const old=Allocation.health(loaded.state,c,payload.date,Operations.demand(c,loaded.state,payload.date));
    const h=await layeredHealth(ctx,loaded,c,payload.date,revision,old);
    const p=h.periods.find(p=>p.period===payload.data.period);
    if(!h.verified||h.incomplete||!p||Allocation.periodStarted(c,payload.date,p.period)||p.green.length>payload.data.remaining)return false;
    payload.data={...payload.data,summary:capacityText(h,c),healthSummary:capacityText(h,c),observedAt:ctx.now};
  }else if(payload.kind==='smc_report'&&payload.data?.scheduledSummary){
    const dates=[];for(let d=payload.date;d<=Allocation.addDays(Allocation.monday(payload.date),6);d=Allocation.addDays(d,1))dates.push(d);
    if(!cache.has(payload.date))cache.set(payload.date,await forecastCapacity(ctx,loaded,c,dates,revision));
    const f=cache.get(payload.date),today=f.days.find(d=>d.date===payload.date);
    const absent=Operations.summaryAbsences(loaded.state,payload.date).length;
    payload.data={...payload.data,summary:(absent+' absent teachers. '+outlookText(f)).slice(0,1000),healthSummary:today?.state==='projected'?capacityText({verified:today.reserve.verified,periods:today.reserve.periods},c,payload.date):'Capacity not verified; check Roster.',capacityEngine:'v1',observedAt:ctx.now};
  }
  return true;
}
export function capacityTemplateData(env,payload,recipient){
  const d=payload.data||{};
  return {...d,duty_smc_name:recipient.name||recipient.id,duty_date:payload.date,
    capacity_details:d.summary,absence_allocation_uncovered_summary:d.summary,
    overnight_absence_allocation_summary:d.summary,relief_health_summary:d.healthSummary,
    roster_plan_url:env.PUBLIC_ORIGIN+'/roster/'};
}

export async function refreshNewSummaries(ctx,loaded,next,c,revision){
  const before=new Set(loaded.state.outbox.map(j=>j.id)),cache=new Map();
  for(const j of next.outbox)if(!before.has(j.id)&&j.kind==='smc_report'&&j.data?.scheduledSummary){
    await refreshCapacityMessage(ctx,{...loaded,state:next},c,j,revision,cache);
    const alert=next.smcAlerts.find(a=>j.key===a.key+':'+j.recipientId);
    if(alert)alert.summary=j.data.summary;
  }
}
