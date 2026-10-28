/* One display for authenticated and private-recipient Roster links. No authority or mutations here. */
var GSISRosterTimetableView=(()=>{
 'use strict';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function renderDaily(value){
  const communicated=value.viewMode==='communication',label=communicated?'Communicated timetable':'Today’s published timetable',stamp=communicated&&Number.isFinite(Date.parse(value.communicatedAt))?new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'short'}).format(new Date(value.communicatedAt))+' SGT':'';
  if(!Array.isArray(value.periods)||!value.periods.length||!Array.isArray(value.baseline?.cells)||!Array.isArray(value.modified?.cells))return '<p>A verified daily timetable is not available. '+(communicated?'Communicated':'Published')+' duty details remain below.</p>';
  const cells=(row,p)=>Array.isArray(row.cells[p])?row.cells[p]:[],key=cell=>JSON.stringify(cell.map(v=>String(v||'').trim()));
  let html='<div class="table-scroll"><table class="ops-teacher-overlay ops-daily-overlay"><caption>'+esc(value.name||'Your timetable')+' · '+esc(value.date)+'</caption><thead><tr><th class="timetable-day">Timetable</th>'+value.periods.map(p=>'<th scope="col">P'+p.period+'<small>'+esc(p.start)+'<br>'+esc(p.end)+'</small></th>').join('')+'</tr></thead><tbody>';
  for(const updated of [true,false]){html+='<tr><th class="timetable-day" scope="row">'+(updated?label:'Usual baseline')+'</th>';for(const p of value.periods){const details=cells(updated?value.modified:value.baseline,p.period),changed=updated&&key(details)!==key(cells(value.baseline,p.period)),mats=updated?(value.mats||[]).filter(m=>p.period>=m.fromPeriod&&p.period<=m.toPeriod):[];html+='<td class="'+(changed?'published-overlay ':'')+(mats.length?'suspension-overlay':'')+'"'+(changed?' data-timetable-changed="true"':'')+'>'+details.filter(Boolean).map(esc).join('<br>')+(mats.length?'<small class="ops-suspension-reason">'+mats.map(m=>esc(m.reason)).join(' · ')+'</small>':'')+(changed?'<small class="ops-change-label">Changed</small>':'')+'</td>';}html+='</tr>';}
  return html+'</tbody></table></div><p class="hint">'+(communicated?'Communicated snapshot for '+esc(value.date)+(stamp?' · '+esc(stamp):'')+'. This link retains the arrangements communicated to you at that time. The baseline is shown for comparison.':'Today’s published timetable includes suspended timetable, absence and relief changes. The usual baseline is aligned below for comparison.')+'</p>';
 }
 function render(value){
  if(value?.daily)return renderDaily(value.daily);
  if(value?.date&&value?.modified)return renderDaily(value);
  if(!value||!Array.isArray(value.periods)||!Array.isArray(value.baseline)||!Number.isInteger(value.perDay)||!/^\d{4}-\d\d-\d\d$/.test(value.monday||''))return '<p>A verified baseline timetable is not available. Published duty details remain below.</p>';
  const ps=value.periods,days=['Monday','Tuesday','Wednesday','Thursday','Friday'],by=new Map();
  for(const a of value.duties||[]){if(!['published','completed'].includes(a.status)||a.noRelief||a.remove)continue;const k=a.date+'|'+a.period,old=by.get(k);if(!old||a.combination)by.set(k,a);}
  let html='<div class="table-scroll"><table class="ops-teacher-overlay"><caption>'+esc(value.name)+' · Published timetable and baseline</caption><thead><tr><th class="timetable-day">Day</th>'+ps.map(p=>'<th>P'+p.period+'<small>'+esc(p.start)+'<br>'+esc(p.end)+'</small></th>').join('')+'</tr></thead><tbody>';
  for(const updated of [true,false]){
   html+='<tr class="timetable-section"><th colspan="'+(ps.length+1)+'">'+(updated?'Latest published timetable':'Baseline timetable')+'</th></tr>';
   for(let wd=0;wd<5;wd++){
    const date=new Date(Date.parse(value.monday+'T12:00:00Z')+wd*86400000).toISOString().slice(0,10);
    html+='<tr><th class="timetable-day" scope="row">'+days[wd]+'<small>'+esc(date)+'</small></th>';
    for(const p of ps){const a=updated?by.get(date+'|'+p.period):null,c=value.baseline[wd*value.perDay+p.period]||[];
     const details=a?[a.subject,a.className,a.venue,a.groupName]:c;
     html+='<td'+(a?' class="published-overlay" data-duty-id="'+esc(a.id)+'"':'')+'>'+details.filter(Boolean).map(esc).join('<br>')+(a?'<small>'+esc(a.combination?'Combined class':a.repurposedDuty?'Repurposed recess duty':a.recessActivationId?'Recess supervision':'Relief')+'</small>':'')+'</td>';
    }html+='</tr>';
   }
  }return html+'</tbody></table></div><p class="hint">Only published changes appear above. The baseline remains unchanged. Cancellations restore the baseline cell immediately; their notices stay in the acknowledgement area.</p>';
 }
 return {render};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISRosterTimetableView;
