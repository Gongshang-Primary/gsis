/* GSIS_ROSTER_TIMETABLE_VIEW_BEGIN */
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

/* GSIS_ROSTER_TIMETABLE_VIEW_END */
/* Keep the private capability in the fragment so the same link can be reopened.
   It is never sent in an HTTP URL, analytics event, console message or referrer. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id),key='gsis-private-relief-link';
 let token=location.hash.slice(1),pendingDecision=null,currentRecord=null,focusAcknowledgement=new URLSearchParams(location.search).get('action')==='ack';
 if(token){try{sessionStorage.setItem(key,token)}catch{}}
 else try{token=sessionStorage.getItem(key)||''}catch{}
 // Recover the address for tabs opened by the previous fragment-stripping page.
 if(token&&!location.hash)history.replaceState(null,'',location.pathname+location.search+'#'+token);
 // A different teacher/date link gets a fresh document, including pending requests.
 window.addEventListener('hashchange',()=>location.reload());
 const message=(text,error=false)=>{$('status').textContent=text;$('status').className=error?'error':''};
 const isCommunication=data=>data?.viewMode==='communication';
 const recordLabel=data=>isCommunication(data)?'Communicated timetable':'Published timetable';
 const communicationStamp=data=>Number.isFinite(Date.parse(data?.communicatedAt))?new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.communicatedAt))+' SGT':'';
 const formatDate=value=>{const d=new Date(value+'T12:00:00+08:00');return new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',day:'numeric',month:'short',year:'numeric'}).format(d)+' ('+new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',weekday:'short'}).format(d)+')'};
 async function api(input){
  const response=await fetch('/api/external',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(input),cache:'no-store',referrerPolicy:'no-referrer'});
  window.GSISversionNotice?.(response);
  const result=await response.json();if(!response.ok||!result.ok)throw Object.assign(Error(result.error||'This request could not be confirmed. Refresh to check its current state.'),{status:response.status});return result.data;
 }
 // The signed read can run while HTML and styles finish loading. Keep its
 // rejection handled immediately; the DOM-ready load reports any failure.
 let firstRead=token?api({operation:'view'}):null;firstRead?.catch(()=>{});
 const confirmsRead=(input,data)=>input.timetableNoticeId?data?.timetableNotice?.id===input.timetableNoticeId&&data.timetableNotice.status==='acknowledged':(input.snapshotIds||[]).length>0&&input.snapshotIds.every(id=>data?.history?.some(row=>row.id===id&&row.acknowledgedAt));
 function instructions(container,text){
  // Preserve teacher instructions as text. Only turn explicit HTTPS/HTTP URLs
  // into links; do not interpret uploaded markup or script URLs.
  const parts=String(text||'No relief instructions supplied.').split(/(https?:\/\/[^\s<>]+)/g);
  for(const part of parts){if(/^https?:\/\//.test(part)){const a=document.createElement('a');a.textContent=part;a.href=part;a.rel='noopener noreferrer';a.target='_blank';container.append(a)}else container.append(document.createTextNode(part))}
 }
 function table(container,rows,withInstructions,context='duties'){
  container.replaceChildren();if(!rows.length){const p=document.createElement('p');p.textContent=isCommunication(currentRecord)?'No relief duties in this communicated snapshot.':'No published relief duties for this date.';container.append(p);return}
  const wrap=document.createElement('div');wrap.className='table-scroll';const t=document.createElement('table'),head=document.createElement('thead'),hr=document.createElement('tr');
  for(const label of ['Period and time','Lesson / class / venue',...(withInstructions?['Relief instructions']:[])]){const th=document.createElement('th');th.scope='col';th.textContent=label;hr.append(th)}head.append(hr);t.append(head);const body=document.createElement('tbody');
  for(const row of [...rows].sort((a,b)=>a.period-b.period)){
   const tr=document.createElement('tr'),period=document.createElement('td'),lesson=document.createElement('td');period.textContent='P'+row.period;
   const start=row.timeStart||row.start,end=row.timeEnd||row.end;if(start&&end){const time=document.createElement('small');time.textContent=start+' to '+end;period.append(time)}
   const strong=document.createElement('strong');strong.textContent=row.groupName||row.subject||'Duty';lesson.append(strong);
   for(const value of [row.className,row.venue,...(context==='arrangements'?['Cover: '+(row.relieverName||'Not assigned')]:[]),...(context==='changes'?['Status: '+row.status,row.invalidatedReason||row.cancelReason||'']:[])])if(value){const small=document.createElement('small');small.textContent=value;lesson.append(small)}
   tr.append(period,lesson);if(withInstructions){const cell=document.createElement('td');cell.className='instructions';instructions(cell,[row.instructions,row.customInstructions].filter(Boolean).join('\n\n'));tr.append(cell)}body.append(tr);
  }t.append(body);wrap.append(t);container.append(wrap);
 }
 async function acknowledge(input,data){
  busy(true);message('Saving your acknowledgement…');
  try{
   const result=await api(input),confirmed=result.acknowledged;
   const sameNotice=!input.timetableNoticeId||confirmed?.timetableNoticeId===input.timetableNoticeId;
   const sameSnapshots=!(input.snapshotIds||[]).length||Array.isArray(confirmed?.snapshotIds)&&input.snapshotIds.every(id=>confirmed.snapshotIds.includes(id));
   if(confirmed&&sameNotice&&sameSnapshots&&typeof confirmed.acknowledgedAt==='string'&&Number.isFinite(Date.parse(confirmed.acknowledgedAt))){
    if(input.timetableNoticeId&&data.timetableNotice?.id===input.timetableNoticeId)data.timetableNotice={...data.timetableNotice,status:'acknowledged',acknowledgedAt:confirmed.acknowledgedAt};
    data.pendingNotices=(data.pendingNotices||[]).filter(v=>!confirmed.snapshotIds?.includes(v.id));
    data.acknowledgementConfirmed=true;
    renderActions(data);renderNotices(data);message(recordLabel(data)+' and instructions acknowledged.');
   }else if(await load()){
    if(confirmsRead(input,currentRecord)){currentRecord.acknowledgementConfirmed=true;renderActions(currentRecord);message(recordLabel(data)+' and instructions acknowledged.');}
    else message('Your acknowledgement could not be confirmed. Review '+(isCommunication(data)?'this communicated snapshot':'the current timetable')+' and try again.',true);
   }
  }catch(error){
   if(error.status===409){await load();message(isCommunication(data)?'This communicated snapshot could not be acknowledged. Review it or ask SMC for a new link.':'The published timetable changed. Please review the current timetable before acknowledging.',true);}
   else handleError(error);
  }finally{busy(false);}
 }
 function renderActions(data){
  const area=$('private-actions');area.replaceChildren();area.setAttribute('aria-busy','false');
  const context=document.createElement('p');context.className='private-action-context';context.textContent=[data.name||data.timetable?.daily?.name||data.timetable?.name||recordLabel(data),formatDate(data.date)].join(' · ');area.append(context);
  const notice=data.timetableNotice,pending=(data.pendingNotices||[]).filter(v=>!notice?.snapshotIds?.includes(v.id));
  if(notice){
   const status=document.createElement('p'),done=notice.status==='acknowledged';status.dataset.timetableAckStatus='';status.className='private-ack-status '+(done?'acknowledged':'pending');status.textContent=done?'Acknowledged ✓':'Pending acknowledgement';area.append(status);
   const b=document.createElement('button');b.type='button';b.className='private-ack-button'+(done?' acknowledged':'');b.dataset.requiresRecord='true';
   if(done){b.dataset.timetableAckConfirmed='';b.dataset.unavailable='true';b.disabled=true;b.textContent='Acknowledged ✓';}
   else{b.dataset.timetableAck='';b.textContent='Acknowledge timetable';b.setAttribute('aria-label','Acknowledge timetable and instructions');b.onclick=()=>acknowledge({operation:'acknowledge',timetableNoticeId:notice.id,snapshotIds:[]},data);}area.append(b);
  }
  if(pending.length){const b=document.createElement('button');b.type='button';b.className='private-ack-button';b.dataset.requiresRecord='true';b.textContent=notice?'Acknowledge other duty updates':'Acknowledge All';b.onclick=()=>acknowledge({operation:'acknowledge',snapshotIds:pending.map(v=>v.id)},data);area.append(b);}
  else if(!notice){if(data.acknowledgementConfirmed||data.history?.length>0&&data.history.every(row=>row.acknowledgedAt)){const b=document.createElement('button');b.type='button';b.className='private-ack-button acknowledged';b.dataset.timetableAckConfirmed='';b.dataset.unavailable='true';b.disabled=true;b.textContent='Acknowledged ✓';area.append(b);}else{const p=document.createElement('p');p.textContent='No outstanding updates to acknowledge.';area.append(p);}}
 }
 function renderNotices(data){
  let area=$('private-notices');if(!area){area=document.createElement('section');area.id='private-notices';$('duties').before(area);}area.replaceChildren();
  const heading=document.createElement('h2');heading.textContent='Updates to acknowledge';area.append(heading);
  const notice=data.timetableNotice;
  if(notice){
   const explanation=document.createElement('p');explanation.textContent=isCommunication(data)?'Acknowledge the communicated timetable snapshot and instructions shown here. This records receipt of the arrangements sent to you at that time.':'Acknowledge the published timetable and instructions shown here, including cancelled duties and a return to your usual timetable.';area.append(explanation);
   for(const row of notice.publishedInstructions||[]){
    const text=[row.instructions,row.customInstructions,...(Array.isArray(row.conditionalInstructions)?row.conditionalInstructions:[row.conditionalInstructions])].filter(Boolean).join('\n\n');if(!text)continue;
    const title=document.createElement('h3');title.textContent='P'+row.period+' instructions';const content=document.createElement('div');content.className='instructions';instructions(content,text);area.append(title,content);
   }
  }
  const pending=(data.pendingNotices||[]).filter(v=>!notice?.snapshotIds?.includes(v.id));
  for(const v of pending){const p=document.createElement('p');p.textContent=(v.kind==='cancelled'?'Cancelled':v.kind==='instructions'?'Instructions revised':'New duty')+' · P'+v.period+' · '+(v.assignment.className||'');area.append(p);}
  if(!pending.length&&!notice){const p=document.createElement('p');p.textContent='No outstanding updates.';area.append(p);}
  const history=document.createElement('details'),label=document.createElement('summary');label.textContent='Notification history';history.append(label);
  for(const v of data.history||[]){const entry=document.createElement('details'),title=document.createElement('summary');title.textContent='P'+v.period+' · '+v.kind+' · '+(v.acknowledgedAt?'Acknowledged':'Not acknowledged');entry.append(title);const text=document.createElement('div');text.className='instructions';instructions(text,[v.instructions,v.customInstructions].filter(Boolean).join('\n\n'));entry.append(text);history.append(entry);}area.append(history);
 }
 function busy(value){for(const button of document.querySelectorAll('button'))button.disabled=value||button.dataset.unavailable==='true'||button.dataset.requiresRecord==='true'&&!currentRecord;$('private-actions').setAttribute('aria-busy',String(value))}
 function handleError(error){
  if(error.status===401||error.status===403){
   try{sessionStorage.removeItem(key)}catch{}
   currentRecord=null;$('private-actions').replaceChildren();
   for(const id of ['private-timetable','private-notices'])$(id)?.remove();
   for(const id of ['duties','arrangements','changes','request']){$(id).hidden=true;}
   for(const id of ['duty-list','arrangement-list','change-list','request-lessons'])$(id).replaceChildren();
   $('date').textContent='';$('private-expiry').textContent='';
  }
  message(error.message,true);
 }
 async function load(prefetched){
  if(!token){$('private-actions').hidden=true;message('This private link is missing or has expired. Ask SMC for a new link.',true);return}
  busy(true);message('Loading your private relief record…');
  try{
   const data=await (prefetched||api({operation:'view'}));currentRecord=data;document.title=(isCommunication(data)?'Communicated timetable':'My published timetable')+' | GSiS';document.querySelector('header h1').textContent=isCommunication(data)?'Communicated timetable':'My published timetable';document.querySelector('#duties h2').textContent=isCommunication(data)?'Communicated duties':'Published duties';document.querySelector('#arrangements h2').textContent=isCommunication(data)?'Communicated cover for my lessons':'Published cover for my lessons';$('private-actions').hidden=false;$('date').textContent=formatDate(data.date);renderActions(data);$('duties').hidden=false;table($('duty-list'),data.duties||[],true);
   $('private-expiry').textContent=Number.isFinite(data.linkExpiresAt)?'This link expires '+new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.linkExpiresAt))+' (Singapore time).':'';
   $('arrangements').hidden=!data.arrangements?.length;if(data.arrangements?.length)table($('arrangement-list'),data.arrangements,true,'arrangements');
   $('changes').hidden=!data.changes?.length;if(data.changes?.length)table($('change-list'),data.changes,false,'changes');
   let tt=$('private-timetable');if(!tt){tt=document.createElement('section');tt.id='private-timetable';$('duties').before(tt);}tt.innerHTML=GSISRosterTimetableView.render(data.timetable);
   renderNotices(data);
   const r=data.request;$('request').hidden=!r;$('decision-form').hidden=true;
   if(r){$('request-description').textContent=(r.absentName||'A colleague')+' requested relief. Status: '+r.status+(r.reason?' · '+r.reason:'');table($('request-lessons'),r.lessons||[],false);$('decision-form').hidden=r.status!=='pending'||r.expiresAt<=Date.now();if(r.status!=='pending')pendingDecision=null}
   message(isCommunication(data)?'Your communicated timetable snapshot for '+formatDate(data.date)+' is shown below.'+(communicationStamp(data)?' Communicated '+communicationStamp(data)+'.':''):'Your current published relief record is shown below.');return true;
  }catch(error){currentRecord=null;handleError(error);return false}finally{busy(false);if(focusAcknowledgement&&currentRecord){const action=document.querySelector('[data-timetable-ack]');if(action){action.focus({preventScroll:true});focusAcknowledgement=false;}}}
 }
 function start(){
 $('decision-form').addEventListener('submit',async event=>{
  event.preventDefault();const decision=event.submitter?.value,reason=$('reason').value.trim();
  if(decision==='reject'&&!reason){message('Enter a reason before rejecting.',true);$('reason').focus();return}
  if(!['approve','reject'].includes(decision))return;
  // Keep an identical request id for the same action after an uncertain save.
  if(!pendingDecision||pendingDecision.decision!==decision||pendingDecision.reason!==reason)pendingDecision={operation:'respond',decision,reason,requestId:crypto.randomUUID()};
  busy(true);message('Saving your response…');
  try{await api(pendingDecision);pendingDecision=null;if(await load())message(decision==='approve'?'Relief arrangement approved.':'Relief request rejected.')}catch(error){handleError(error);return false}finally{busy(false)}
 });
 $('refresh').addEventListener('click',()=>load());const initial=firstRead;firstRead=null;load(initial);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
