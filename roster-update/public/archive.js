/* Fixed read projections of the frozen Google records; no storage or mutation commands. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),views=new Set(['history','statistics','calculations']);
 let sequence=0,busy=false,view='history',nextOffset=null,history=[],throughDate=null;
 const element=(tag,value='',className='')=>{const node=document.createElement(tag);node.textContent=String(value??'');if(className)node.className=className;return node;};
 const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 const day=value=>validDate(value)?new Intl.DateTimeFormat('en-SG',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'Not recorded';
 const number=value=>Number.isFinite(value)?new Intl.NumberFormat('en-SG',{maximumFractionDigits:2}).format(value):'Unavailable';
 const stamp=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Singapore'}).format(new Date(value)):'Not recorded';
 function message(value,error=false){$('archive-status').textContent=value;$('archive-status').dataset.tone=error?'error':'info';}
 function controls(){
  $('archive-range').hidden=view!=='statistics';$('archive-load').disabled=busy;$('archive-more').disabled=busy;$('archive-more').hidden=view!=='history'||nextOffset===null;
 }
 function table(title,columns,rows){
  const section=element('section'),heading=element('h2',title),scroll=element('div','','table-scroll'),grid=element('table'),head=element('thead'),body=element('tbody'),labels=element('tr');
  scroll.tabIndex=0;scroll.setAttribute('aria-label',title+' table, scroll for more columns');grid.append(element('caption',title+' · '+rows.length+' record'+(rows.length===1?'':'s')));
  for(const [label] of columns){const th=element('th',label);th.scope='col';labels.append(th);}head.append(labels);
  for(const row of rows){const tr=element('tr');if(row.historyId)tr.dataset.historyId=row.historyId;for(const [,value] of columns)tr.append(element('td',value(row)));body.append(tr);}
  if(!rows.length){const tr=element('tr'),td=element('td','No records in this view.');td.colSpan=columns.length;tr.append(td);body.append(tr);}
  grid.append(head,body);scroll.append(grid);section.append(heading,scroll);return section;
 }
 function verifyArchive(data){
  const archive=data?.archive;if(archive?.readOnly!==true||!validDate(archive.throughDate)||typeof archive.id!=='string'||!archive.id)throw Error('The read-only archive could not be verified. Refresh the view.');
  const first=throughDate===null;throughDate=archive.throughDate;$('archive-coverage').hidden=false;$('archive-coverage').textContent='Google records through '+day(throughDate)+'. Read-only.';
  $('archive-from').max=throughDate;$('archive-to').max=throughDate;
  if(first){$('archive-from').value=throughDate.slice(0,4)+'-01-01';$('archive-to').value=throughDate;}
 }
 function drawHistory(data,append){
  if(!Array.isArray(data.history)||data.nextOffset!==null&&(!Number.isInteger(data.nextOffset)||data.nextOffset<0))throw Error('The history page could not be read. Refresh the view.');
  const rows=append?[...history]:[],ids=new Set(rows.map(row=>row.id));for(const row of data.history)if(row&&typeof row==='object'&&!ids.has(row.id)){rows.push(row);ids.add(row.id);}history=rows;nextOffset=data.nextOffset;
  const kinds={published:'Published',changed:'Changed',cancelled:'Cancelled'};
  $('archive-content').replaceChildren(table('My relief history',[
   ['Date',row=>day(row.date)],['Period',row=>row.period??''],['Update',row=>kinds[row.kind]||row.kind||'Recorded'],['Class / group',row=>row.assignment?.className||row.assignment?.groupName||''],['Subject',row=>row.assignment?.subject||''],['Venue',row=>row.assignment?.venue||''],['Absent teacher',row=>row.assignment?.absentName||''],['Instructions',row=>row.instructions||row.customInstructions||row.assignment?.instructions||''],['Published (Singapore)',row=>stamp(row.publishedAt)]
  ],history.map(row=>({...row,historyId:row.id}))));
  message(history.length+' earlier history record'+(history.length===1?'':'s')+' loaded.');
 }
 function drawStatistics(data){
  if(data.schema!==1||!validDate(data.from)||!validDate(data.to)||!['absenceRows','activityRows','importedWeekly','coverage'].every(key=>Array.isArray(data[key]))||!window.GSISRosterStatistics)throw Error('The statistics records could not be read. Refresh the view.');
  const aggregate=window.GSISRosterStatistics.aggregate(data),host=$('archive-content'),summary=element('section');summary.append(element('h2','Statistics · '+day(data.from)+' to '+day(data.to)));
  for(const warning of data.warnings||[])summary.append(element('p',warning,'muted'));
  const counts={};for(const item of data.coverage)counts[item.status]=(counts[item.status]||0)+1;summary.append(element('p','Coverage: '+(Object.entries(counts).map(([status,count])=>count+' '+status+' day'+(count===1?'':'s')).join('; ')||'No coverage records')+'. Missing records are not proof of zero activity.','muted'));
  const totals=aggregate.cumulative;host.replaceChildren(summary,table('Recorded totals',[
   ['Measure',row=>row[0]],['Total',row=>number(row[1])]
  ],[['Absent teacher-days',totals.absentDays],['Known absent periods',totals.absentPeriods],['Relief periods',totals.relief],['Combine periods',totals.combine],['Recorded completed relief',totals.completedRelief],['Recorded completed Combine',totals.completedCombine]]),table('Absences',[
   ['Date',row=>day(row.date)],['Teacher',row=>row.name],['Periods',row=>row.periods===null?'Unknown':(row.periods||[]).join(', ')],['Reason',row=>row.reason]
  ],data.absenceRows),table('Relief and Combine activity',[
   ['Date',row=>day(row.date)],['Teacher',row=>row.name],['Period',row=>row.period],['Activity',row=>row.kind==='combine'?'Combine':'Relief'],['Status',row=>row.status],['Class / group',row=>row.className||row.groupName||''],['Subject',row=>row.subject],['Venue',row=>row.venue]
  ],data.activityRows));
  if(data.importedWeekly.length)host.append(table('Imported weekly relief',[
   ['Teacher',row=>row.name],['Week starts',row=>day(row.week)],['Week ends',row=>day(row.to)],['Completed periods',row=>number(row.periods)]
  ],data.importedWeekly));
  message('Earlier statistics loaded. Draft allocations are excluded.');
 }
 function drawCalculations(data){
  const c=data.completion;if(!c||typeof c!=='object'||Array.isArray(c))throw Error('Your earlier calculations could not be read. Refresh the view.');
  const section=element('section');section.append(element('h2','My Calculations'),element('p','Earlier cumulative figures'+(validDate(c.from)&&validDate(c.to)?' · '+day(c.from)+' to '+day(c.to):'')+'.'));
  section.append(element('p','Completed relief: '+number(c.completed)+' periods.'),element('p','Accumulated quota: '+number(c.entitlement)+' periods.'),element('p','Cumulative relief done: '+(Number.isFinite(c.percentage)?number(c.percentage)+'%':'Unavailable')+'.'));
  if(c.reason)section.append(element('p',c.reason,'muted'));
  if(c.throughWeek)section.append(element('p','Quota recorded through the week of '+day(c.throughWeek)+'.','muted'));
  section.append(element('p','History '+(c.historyVerified===true?'verified':'not verified')+'. Unrecorded weekly quotas are not estimated.','muted'));
  $('archive-content').replaceChildren(section);message('Your earlier calculations loaded.');
 }
 async function load(append=false){
  if(!views.has(view)){message('Choose an available archive view.',true);return;}
  const body={view};
  if(view==='history')Object.assign(body,{offset:append?nextOffset:0,limit:30});
  if(view==='statistics'){
   const from=$('archive-from').value,to=$('archive-to').value;
   if(!validDate(from)||!validDate(to)||from>to){message('Choose valid start and end dates, with the start on or before the end.',true);return;}
   if((Date.parse(to)-Date.parse(from))/86400000>=366){message('Choose a range of up to 366 days.',true);return;}
   if(throughDate&&to>throughDate){message('Choose an end date on or before '+day(throughDate)+'.',true);return;}
   Object.assign(body,{from,to});
  }
  const ticket=++sequence;busy=true;controls();message('Loading earlier '+(view==='calculations'?'calculations':view)+'…');
  try{
   const response=await fetch('/api/edge/archive',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json();if(ticket!==sequence)return;
   if(!response.ok||result.ok!==true)throw Object.assign(Error(response.status===401?'Sign in to Roster with your school account to view the archive.':response.status===403?'Your account does not have access to this archive view.':result.error||'The archive could not load. Refresh the view.'),{status:response.status});
   verifyArchive(result.data);if(view==='history')drawHistory(result.data,append);else if(view==='statistics')drawStatistics(result.data);else drawCalculations(result.data);
   $('archive-signin').hidden=true;
  }catch(error){if(ticket!==sequence)return;message(error.message||'The archive could not load. Refresh the view.',true);if(!append){$('archive-content').replaceChildren();nextOffset=null;}if(error.status===401){$('archive-signin').hidden=false;$('archive-controls').hidden=true;nextOffset=null;}}
  finally{if(ticket===sequence){busy=false;controls();}}
 }
 $('archive-form').addEventListener('submit',event=>{event.preventDefault();void load();});
 $('archive-view').addEventListener('change',event=>{sequence++;busy=false;view=event.target.value;nextOffset=null;history=[];$('archive-content').replaceChildren();controls();void load();});
 $('archive-more').addEventListener('click',()=>{if(!busy&&nextOffset!==null)void load(true);});
 const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);$('archive-from').value=today.slice(0,4)+'-01-01';$('archive-to').value=today;
 controls();void load();
})();
