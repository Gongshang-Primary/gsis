/* Statistics reads once per range; sorting, filtering, charts and Excel stay local. */
window.RosterStatisticsUI=(()=>{
 'use strict';
 const S=()=>window.GSISRosterStatistics,esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let active=null;
 const dayLabel=d=>new Intl.DateTimeFormat('en-SG',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
 const dateCell=d=>d?new Date(d+'T00:00:00Z'):'';
 const presets=[['week','This week'],['pastWeek','Past week'],['fortnight','Past Fortnight'],['month','Past Month'],['term','Past Term'],['semester','Past Semester'],['year','Past Year']];
 const columns=(pairs)=>pairs.map(([key,label,type])=>({key,label,type:type||'text'}));
 function mergeSnapshots(parts,from,to){
  const merged={...parts[0],from,to,absenceRows:[],activityRows:[],importedWeekly:[],people:[],coverage:[],warnings:[]};
  for(const field of ['absenceRows','activityRows','importedWeekly','people']){const rows=new Map();for(const p of parts)for(const r of p[field]||[])rows.set(r.id,r);merged[field]=[...rows.values()];}
  merged.coverage=parts.flatMap(p=>p.coverage||[]);merged.warnings=[...new Set(parts.flatMap(p=>p.warnings||[]))];merged.checkedAt=parts.map(p=>p.checkedAt).sort().at(-1);return merged;
 }
 async function decode(wire){
  if(wire.schema!==1)throw Error('Statistics format changed. Refresh Roster to load this version.');
  if(wire.unchanged)return null;
  if(!Number.isSafeInteger(wire.bytes)||wire.bytes<0||wire.bytes>12000000)throw Error('Statistics response is too large or invalid. Choose a shorter range.');
  let text;
  if(wire.encoding==='json-v1')text=wire.data;
  else if(wire.encoding==='gzip-base64-v1'){
   if(typeof DecompressionStream!=='function')throw Error('This browser cannot decompress Statistics. Refresh to request the plain format.');
   const bytes=Uint8Array.from(atob(wire.data),c=>c.charCodeAt(0)),stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),reader=stream.getReader(),chunks=[];let size=0;
   try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>wire.bytes||size>12000000)throw Error('Statistics response exceeded its expected size.');chunks.push(next.value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
   text=await new Blob(chunks).text();
  }else throw Error('Statistics response format is not supported.');
  if(typeof text!=='string'||new TextEncoder().encode(text).length!==wire.bytes)throw Error('Statistics response was incomplete. Retry loading.');
  const value=JSON.parse(text);if(value.schema!==1||!Array.isArray(value.absenceRows)||!Array.isArray(value.activityRows)||!Array.isArray(value.coverage))throw Error('Statistics records could not be read. Retry loading.');return {...value,...(wire.checkedAt?{checkedAt:wire.checkedAt}:{}),...(Number.isSafeInteger(wire.revision)?{revision:wire.revision}:{}),...(wire.today?{today:wire.today}:{})};
 }
 function unmount(){if(active){active.destroyed=true;active.sequence++;for(const [target,type,handler] of active.listeners||[])target.removeEventListener(type,handler);active.cache.clear();active.payload=null;active.tables.clear();active=null;}}
 async function render(ctx){
  unmount();const host=ctx.container,user=ctx.profile?.user||ctx.user||{};
  if(!user.smc&&!user.admin){host.innerHTML='<h2>Statistics</h2><p class="error">Statistics is available to SMC and Admin only.</p>';return;}
  if(!S()){host.innerHTML='<h2>Statistics</h2><p class="error">Statistics could not load. Refresh Roster.</p>';return;}
  const today=typeof ctx.today==='function'?ctx.today():ctx.today,initial=S().preset('week',today),st={ctx,host,today,sequence:0,destroyed:false,cache:new Map(),tables:new Map(),views:new Map(),calendar:{},payload:null,mode:'published',matrixOffset:0,charts:{},selected:null};active=st;
  host.innerHTML=`<div class="roster-stats"><h2>Statistics</h2><p>Absences and published relief activity. Draft allocations are excluded. Combine counts teaching activity even when it has zero R cost.</p><div class="stats-presets" aria-label="Date range presets">${presets.map(([id,label])=>`<button type="button" data-stats-preset="${id}" ${['term','semester'].includes(id)?'disabled':''}>${label}</button>`).join('')}</div><p class="stats-calendar-note" data-stats-calendar>Loading school term dates…</p><form class="stats-controls" data-stats-form><label>Start Date<input type="date" name="from" required value="${initial.from}"></label><label>End Date<input type="date" name="to" required value="${initial.to}"></label><button type="submit">Load statistics</button><button type="button" data-stats-refresh>Refresh records</button><label>Relief figures<select name="mode"><option value="published">Scheduled + recorded completed</option><option value="completed">Recorded completed only</option></select></label></form><p data-stats-status class="stats-status" role="status" aria-live="polite"></p><div data-stats-report></div></div>`;
  st.form=host.querySelector('[data-stats-form]');st.status=host.querySelector('[data-stats-status]');st.report=host.querySelector('[data-stats-report]');
  st.listeners=[[st.form,'submit',e=>{e.preventDefault();load(st);}], [host,'click',e=>click(st,e)], [host,'input',e=>input(st,e)], [host,'change',e=>{if(e.target.name==='mode'){st.mode=e.target.value;if(st.payload)draw(st);}}]];
  for(const [target,type,handler] of st.listeners)target.addEventListener(type,handler);
  loadCalendar(st);await load(st);
 }
 async function loadCalendar(st){
  try{
   const data=await st.ctx.api('operations',{operation:'statisticsCalendar',year:Number(st.today.slice(0,4))});if(st.destroyed)return;st.calendar=data||{};
   for(const id of ['term','semester'])st.host.querySelector(`[data-stats-preset="${id}"]`).disabled=!S().preset(id,st.today,st.calendar);
   const note=st.host.querySelector('[data-stats-calendar]');note.textContent='Past ranges use complete periods. Term and semester presets use released school calendar dates.'+(data.basis?' '+data.basis:'');
  }catch(e){if(st.destroyed)return;st.host.querySelector('[data-stats-calendar]').textContent='School term dates are unavailable. Use Start Date and End Date; no term dates have been guessed.';}
 }
 function status(st,message,loading=false,error=false){st.status.classList.toggle('stats-error',error);st.status.innerHTML=(loading?'<span class="stats-spinner" aria-hidden="true"></span> ':'')+esc(message);}
 async function load(st){
  const from=st.form.elements.from.value,to=st.form.elements.to.value;try{S().range(from,to,3660);}catch(e){status(st,e.message,false,true);return;}
  const seq=++st.sequence,segments=[];for(let d=from;d<=to;){const end=S().addDays(d,365);segments.push({from:d,to:end<to?end:to});d=S().addDays(segments.at(-1).to,1);}
  const current=()=>!st.destroyed&&seq===st.sequence;status(st,'Loading statistics… Other Roster functions remain available.',true);
  try{
   let parts=[];
   // A multi-year range is bounded per request and accepted only at one state revision.
   for(let attempt=0;attempt<2;attempt++){
    parts=[];for(let i=0;i<segments.length;i++){
     const r=segments[i],cacheKey=r.from+'|'+r.to,cached=st.cache.get(cacheKey);if(!current())return;
     status(st,`Loading statistics${segments.length>1?' '+(i+1)+' of '+segments.length:''}…`,true);
     const wire=await st.ctx.api('operations',{operation:'statistics',...r,encoding:typeof DecompressionStream==='function'?'gzip-base64-v1':'json-v1',...(cached?{knownKey:cached.key}:{})});if(!current())return;
     let value=await decode(wire);if(wire.unchanged){if(!cached)throw Error('The cached range is no longer available. Refresh records.');value={...cached.value,checkedAt:wire.checkedAt,revision:wire.revision,today:wire.today};}
     if(value.from!==r.from||value.to!==r.to)throw Error('The server returned a different date range. Retry loading.');
     st.cache.set(cacheKey,{key:wire.key,value});while(st.cache.size>12)st.cache.delete(st.cache.keys().next().value);parts.push(value);
    }
    if(new Set(parts.map(p=>p.revision+'|'+p.today)).size<=1)break;
    if(attempt===1)throw Error('Roster changed while this long range was loading. Retry, or load a shorter range. The previous report is retained.');
   }
   if(!current())return;st.payload=mergeSnapshots(parts,from,to);st.matrixOffset=0;st.charts={};st.selected=null;draw(st);status(st,'Loaded '+dayLabel(from)+' to '+dayLabel(to)+'. Filters, charts and Excel exports now work locally.');
  }catch(e){if(current())status(st,(e.message||'Statistics could not load.')+(st.payload?' The displayed report is still '+dayLabel(st.payload.from)+' to '+dayLabel(st.payload.to)+'.':''),false,true);}
 }
 function describeCoverage(p){const counts={};for(const d of p.coverage)counts[d.status]=(counts[d.status]||0)+1;return Object.entries(counts).map(([key,n])=>`${n} ${key} day${n===1?'':'s'}`).join('; ');}
 function draw(st){
  const p=st.payload,a=S().aggregate(p,{mode:st.mode});st.aggregate=a;st.tables.clear();const mode=st.mode==='completed'?'Recorded completed activity':'Scheduled and recorded completed activity';
  st.report.innerHTML=`<header class="stats-report-header"><h3>${esc(dayLabel(p.from))} – ${esc(dayLabel(p.to))}</h3><p>${esc(mode)} · Last checked ${esc(p.checkedAt?new Date(p.checkedAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'}):'unknown')} (Singapore)</p></header><aside class="stats-coverage" aria-label="Data coverage"><strong>Data coverage</strong><p>${esc(describeCoverage(p))}.</p><p>Tracked and preserved dates have retained records since statistics tracking began${p.trackingFrom?' on '+esc(dayLabel(p.trackingFrom)):''}. Partial or unknown dates must not be treated as complete zeroes. Future dates are scheduled.</p>${p.warnings.map(w=>`<p>${esc(w)}</p>`).join('')}</aside><p>One absent teacher on one date counts as one absent teacher-day, including partial absence. Period totals use recorded timetable periods. Relief and Combine count each teacher/date/period once. “Recorded completed” follows the completion records; elapsed time alone is not proof of work performed.</p><div data-stats-tables></div><section data-stats-detail class="stats-detail" hidden aria-live="polite"></section>`;
  st.tablesHost=st.report.querySelector('[data-stats-tables]');
  const c=a.cumulative;
  addTable(st,'totals','Total Absences and Relief — cumulative',columns([['metric','Measure'],['value','Total','number']]),[{metric:'Absent teacher-days',value:c.absentDays},{metric:'Known absent periods',value:c.absentPeriods},{metric:'Teacher-days with unknown period totals',value:c.unknownAbsencePeriods},{metric:'Relief periods — '+mode.toLowerCase(),value:c.relief},{metric:'Combine periods — '+mode.toLowerCase(),value:c.combine},{metric:'Recorded completed relief periods',value:c.completedRelief},{metric:'Recorded completed Combine periods',value:c.completedCombine}]);
  const cov=new Map(p.coverage.map(x=>[x.date,x.status]));
  addTable(st,'daily','Total Absences and Relief — by Date',columns([['date','Date','date'],['absentDays','Absent teachers','number'],['absentPeriods','Known absent periods','number'],['unknownAbsencePeriods','Unknown period totals','number'],['relief','Relief periods','number'],['combine','Combine periods','number'],['completedRelief','Recorded completed relief','number'],['completedCombine','Recorded completed Combine','number'],['runningAbsence','Cumulative teacher-days','number'],['runningRelief','Cumulative relief','number'],['runningCombine','Cumulative Combine','number'],['coverage','Coverage']]),a.daily.map(d=>({...d,coverage:cov.get(d.date)})),{chart:'daily'});
  addTable(st,'absTeacher','Total Absences — by Teacher',columns([['name','Teacher'],['absentDays','Absent teacher-days','number'],['absentPeriods','Known absent periods','number'],['unknownAbsencePeriods','Unknown period totals','number']]),[...a.teachers].sort((x,y)=>y.absentDays-x.absentDays||x.name.localeCompare(y.name)),{chart:'absence',defaultSort:'absentDays',descending:true});
  addTable(st,'reliefTeacher','Total Relief Duties — by Teacher',columns([['name','Teacher'],['relief','Relief periods','number'],['combine','Combine periods','number'],['completedRelief','Recorded completed relief','number'],['completedCombine','Recorded completed Combine','number']]),[...a.teachers].sort((x,y)=>(y.relief+y.combine)-(x.relief+x.combine)||x.name.localeCompare(y.name)),{chart:'relief'});
  const absenceRows=p.absenceRows.map((r,i)=>({...r,no:i+1,day:new Intl.DateTimeFormat('en-SG',{weekday:'short',timeZone:'UTC'}).format(new Date(r.date+'T12:00:00Z')),periodLabel:r.periods===null?'Unknown (no timetable snapshot)':r.periods.length?r.periods.join(', '):'None in recorded timetable',createdAt:r.createdAt||'Unknown'}));
  addTable(st,'absenceSummary','Absence Summary',columns([['no','No.','number'],['date','Date','date'],['day','Day'],['name','Absentee'],['periodLabel','Absent Periods'],['reason','Reason'],['createdAt','Created At','timestamp']]),absenceRows,{defaultSort:'date',descending:true});
  const allDates=a.daily.map(d=>d.date),visible=allDates.slice(st.matrixOffset,st.matrixOffset+7),matrixCols=columns([['name','Teacher'],['relief','Range relief','number'],['combine','Range Combine','number']]),matrixRows=a.teachers.map(t=>({...t}));
  for(const d of visible)for(const kind of ['relief','combine'])matrixCols.push({key:d+'|'+kind,label:dayLabel(d)+' '+(kind==='combine'?'Combine':'Relief'),type:'number'});
  const allCols=columns([['name','Teacher'],['relief','Range relief','number'],['combine','Range Combine','number']]);for(const d of allDates)for(const kind of ['relief','combine'])allCols.push({key:d+'|'+kind,label:d+' '+(kind==='combine'?'Combine':'Relief'),type:'number'});
  addTable(st,'matrix','Relief Statistics — by Teacher and Date',matrixCols,matrixRows,{exportCols:allCols,matrix:true});
  if(p.importedWeekly.length)addTable(st,'weekly','Imported weekly relief — separate from daily activity',columns([['name','Teacher'],['week','Week starts','date'],['to','Week ends','date'],['periods','Imported completed R periods','number'],['rangeNote','Range coverage']]),p.importedWeekly.map(r=>({...r,rangeNote:r.week<p.from||r.to>p.to?'Part of this week is outside the selected range; not apportioned':'Whole week within range'})));
 }
 function addTable(st,id,title,cols,rows,options={}){
  const section=document.createElement('section');section.className='stats-section';section.dataset.statsTable=id;
  const t={id,title,cols,rows,options,section};st.tables.set(id,t);if(!st.views.has(id))st.views.set(id,{sort:options.defaultSort||null,descending:!!options.descending,filters:{},page:0});
  st.tablesHost.append(section);drawTable(st,t);
 }
 const display=(value,c)=>c.type==='date'&&value?dayLabel(value):c.type==='timestamp'&&value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('en-SG',{timeZone:'Asia/Singapore'}):String(value??'');
 function cellValue(t,row,key){if(t.options.matrix&&/^\d{4}-\d{2}-\d{2}\|(relief|combine)$/.test(key)){const [date,kind]=key.split('|');return row.dates[date]?.[kind]||0;}return row[key];}
 function filtered(st,t){
  const view=st.views.get(t.id);let rows=t.rows.filter(row=>Object.entries(view.filters).every(([key,value])=>!value||String(cellValue(t,row,key)??'').toLocaleLowerCase().includes(value.toLocaleLowerCase())));
  if(view.sort){const c=t.cols.find(c=>c.key===view.sort)||t.options.exportCols?.find(c=>c.key===view.sort);rows=[...rows].sort((a,b)=>{const x=cellValue(t,a,view.sort),y=cellValue(t,b,view.sort),n=c?.type==='number'?Number(x)-Number(y):String(x??'').localeCompare(String(y??''),'en',{numeric:true});return view.descending?-n:n;});}return rows;
 }
 function drawTable(st,t){
  const v=st.views.get(t.id),rows=filtered(st,t),pages=Math.max(1,Math.ceil(rows.length/40));v.page=Math.min(v.page,pages-1);const visible=rows.slice(v.page*40,(v.page+1)*40);
  t.section.innerHTML=`<div class="stats-table-heading"><h3>${esc(t.title)}</h3><button type="button" data-stats-export="${t.id}">Export Excel</button><button type="button" data-stats-clear="${t.id}">Clear filters</button></div>${t.options.matrix?`<div class="stats-pagination"><button type="button" data-stats-matrix="-7" ${st.matrixOffset===0?'disabled':''}>Earlier dates</button><span>Showing ${esc(dayLabel(st.aggregate.daily[st.matrixOffset].date))} to ${esc(dayLabel(st.aggregate.daily[Math.min(st.matrixOffset+6,st.aggregate.daily.length-1)].date))}. Export includes every selected date.</span><button type="button" data-stats-matrix="7" ${st.matrixOffset+7>=st.aggregate.daily.length?'disabled':''}>Later dates</button></div>`:''}<div class="stats-table-scroll" tabindex="0" aria-label="${esc(t.title)} table, scroll for more columns"><table><caption>${esc(t.title)} — ${rows.length} matching row${rows.length===1?'':'s'}</caption><thead><tr>${t.cols.map(c=>`<th scope="col" aria-sort="${v.sort===c.key?(v.descending?'descending':'ascending'):'none'}"><button type="button" data-stats-sort="${esc(c.key)}" data-table="${t.id}">${esc(c.label)}${v.sort===c.key?(v.descending?' ↓':' ↑'):''}</button></th>`).join('')}</tr><tr>${t.cols.map(c=>`<th><input type="search" data-stats-filter="${esc(c.key)}" data-table="${t.id}" aria-label="Filter ${esc(c.label)} in ${esc(t.title)}" value="${esc(v.filters[c.key]||'')}"></th>`).join('')}</tr></thead><tbody>${visible.length?visible.map(row=>`<tr>${t.cols.map(c=>`<td class="${c.type==='number'?'stats-number':''}">${esc(display(cellValue(t,row,c.key),c))}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${t.cols.length}">No matching records.</td></tr>`}</tbody></table></div><div class="stats-pagination"><button type="button" data-stats-page="-1" data-table="${t.id}" ${v.page===0?'disabled':''}>Previous rows</button><span>Page ${v.page+1} of ${pages} · ${rows.length} matching rows</span><button type="button" data-stats-page="1" data-table="${t.id}" ${v.page+1>=pages?'disabled':''}>Next rows</button></div>${t.options.chart?'<div data-stats-chart></div>':''}`;
  if(t.options.chart)drawChart(st,t,rows);
 }
 function drawChart(st,t,filteredRows){
  const kind=t.options.chart,rows=kind==='daily'?filteredRows:[...filteredRows].sort((a,b)=>(kind==='absence'?b.absentDays-a.absentDays:(b.relief+b.combine)-(a.relief+a.combine))||a.name.localeCompare(b.name)),offset=Math.max(0,Math.min(st.charts[t.id]||0,Math.max(0,rows.length-1))),page=rows.slice(offset,offset+20);st.charts[t.id]=offset;
  const metric=r=>kind==='absence'?r.absentDays:kind==='daily'?Math.max(r.absentDays,r.relief,r.combine):r.relief+r.combine,max=Math.max(1,...rows.map(metric)),host=t.section.querySelector('[data-stats-chart]'),width=n=>Math.round(n/max*10000)/100;
  const bars=page.map(r=>{
   const label=kind==='daily'?dayLabel(r.date):r.name,summary=kind==='absence'?r.absentDays+' teacher-days':(kind==='daily'?r.absentDays+' absent teachers, ':'')+r.relief+' relief, '+r.combine+' Combine',attrs=`data-stats-detail="${kind==='daily'?'date':'teacher'}" data-value="${esc(kind==='daily'?r.date:r.staffId)}" aria-label="${esc(label+': '+summary)}" title="${esc(label+': '+summary)}"`;
   if(kind==='daily')return `<button type="button" class="stats-daily-bar" ${attrs}><strong>${esc(label)}</strong>${[['absentDays','Absent teachers'],['relief','Relief periods'],['combine','Combine periods']].map(([key,title])=>`<span class="stats-series"><span>${title}</span><span class="stats-series-track"><span class="stats-series-fill" style="width:${width(r[key])}%"></span></span><b>${r[key]}</b></span>`).join('')}</button>`;
   return `<button type="button" class="stats-bar" ${attrs}><span class="stats-bar-fill" style="width:${width(metric(r))}%" aria-hidden="true"></span><span class="stats-bar-label">${esc(label)}</span><strong>${esc(summary)}</strong></button>`;
  }).join('');
  host.innerHTML=`<div class="stats-chart" aria-label="Interactive ${kind==='daily'?'daily':'teacher'} bar graph"><p>${kind==='absence'?'Absent teacher-days':kind==='daily'?'Absent teachers, Relief periods and Combine periods are separate bars.':'Relief periods · Combine periods'}. Select a bar for details.${kind==='daily'?'':' Teacher bars are ranked highest first.'}</p>${bars||'<p>No matching data to chart.</p>'}</div><div class="stats-pagination"><button type="button" data-stats-chart-page="-20" data-table="${t.id}" ${offset===0?'disabled':''}>Previous bars</button><span>${rows.length?'Bars '+(offset+1)+'–'+Math.min(offset+20,rows.length)+' of '+rows.length:'0 bars'}</span><button type="button" data-stats-chart-page="20" data-table="${t.id}" ${offset+20>=rows.length?'disabled':''}>Next bars</button></div>`;
 }
 function showDetails(st,type,value){
  const p=st.payload,match=r=>type==='date'?r.date===value:r.staffId===value,absences=p.absenceRows.filter(match),duties=st.aggregate.duties.filter(r=>match(r)&&(st.mode!=='completed'||r.status==='completed')),host=st.report.querySelector('.stats-detail');host.hidden=false;
  const name=type==='date'?dayLabel(value):p.people.find(p=>p.id===value)?.name||'Teacher';
  host.innerHTML=`<h3>${esc(name)}</h3><p>${absences.length} absence record${absences.length===1?'':'s'} · ${duties.length} unique relief / Combine period${duties.length===1?'':'s'}.</p><p>The tables above contain the full filterable and exportable report.</p><ul>${absences.slice(0,100).map(r=>`<li>${esc(dayLabel(r.date)+' · '+r.name+' · '+r.reason+' · '+(r.periods===null?'Periods unknown':'Periods '+r.periods.join(', ')))}</li>`).join('')}${duties.slice(0,100).map(r=>`<li>${esc(dayLabel(r.date)+' · '+r.name+' · Period '+r.period+' · '+r.kind+' · '+(r.status==='completed'?'Recorded completed':r.status==='unconfirmed'?'Completion unconfirmed':'Scheduled')+' · '+r.details.map(d=>[d.className,d.subject,d.venue].filter(Boolean).join(' / ')).join('; '))}</li>`).join('')}</ul>${absences.length>100||duties.length>100?'<p>Showing the first 100 records of each type. Use the tables to filter the full range.</p>':''}`;
  host.tabIndex=-1;host.focus({preventScroll:true});host.scrollIntoView?.({behavior:'auto',block:'nearest'});
 }
 function exportTable(st,t){
  if(!window.GSISExcel?.workbook){status(st,'Excel export could not load. Refresh Roster and retry.',false,true);return;}
  const rows=filtered(st,t),cols=t.options.exportCols||t.cols,p=st.payload,view=st.views.get(t.id);
  const output=[cols.map(c=>c.label+(c.type==='timestamp'?' (UTC)':'')),...rows.map(row=>cols.map(c=>{const cell=cellValue(t,row,c.key);return c.type==='date'?dateCell(cell):c.type==='timestamp'&&Number.isFinite(Date.parse(cell))?new Date(cell):cell??'';})),[],['Report',t.title],['Start date',dateCell(p.from)],['End date',dateCell(p.to)],['Relief figures',st.mode==='completed'?'Recorded completed only':'Scheduled + recorded completed'],['Checked at (UTC)',p.checkedAt],['Coverage',describeCoverage(p)],['Column filters',Object.entries(view.filters).filter(([,v])=>v).map(([k,v])=>k+': '+v).join('; ')||'None'],...p.warnings.map(w=>['Coverage note',w])];
  try{const blob=window.GSISExcel.workbook(output,t.title),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='GSiS-'+t.id+'-'+p.from+'-to-'+p.to+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status(st,'Exported '+rows.length+' matching rows from '+t.title+'.');}catch(e){status(st,'Excel export failed: '+(e.message||'Try a shorter range.'),false,true);}
 }
 function click(st,event){
  if(st.destroyed)return;const b=event.target.closest('button');if(!b||!st.host.contains(b))return;const d=b.dataset;
  if(d.statsPreset){const range=S().preset(d.statsPreset,st.today,st.calendar);if(!range){status(st,'This school calendar range is unavailable. Set the dates manually.',false,true);return;}st.form.elements.from.value=range.from;st.form.elements.to.value=range.to;load(st);}
  else if('statsRefresh'in d)load(st);
  else if(d.statsExport){const t=st.tables.get(d.statsExport);if(t)exportTable(st,t);}
  else if(d.statsClear){const v=st.views.get(d.statsClear);v.filters={};v.page=0;drawTable(st,st.tables.get(d.statsClear));}
  else if('statsSort'in d){const v=st.views.get(d.table);v.descending=v.sort===d.statsSort?!v.descending:false;v.sort=d.statsSort;v.page=0;drawTable(st,st.tables.get(d.table));}
  else if(d.statsPage){const v=st.views.get(d.table);v.page=Math.max(0,v.page+Number(d.statsPage));drawTable(st,st.tables.get(d.table));}
  else if(d.statsChartPage){st.charts[d.table]=Math.max(0,(st.charts[d.table]||0)+Number(d.statsChartPage));const t=st.tables.get(d.table);drawChart(st,t,filtered(st,t));}
  else if(d.statsMatrix){st.matrixOffset=Math.max(0,st.matrixOffset+Number(d.statsMatrix));draw(st);}
  else if(d.statsDetail)showDetails(st,d.statsDetail,d.value);
 }
 function input(st,event){
  const el=event.target;if(st.destroyed||!el.matches('[data-stats-filter]'))return;const id=el.dataset.table,key=el.dataset.statsFilter,start=el.selectionStart,end=el.selectionEnd,view=st.views.get(id);view.filters[key]=el.value;view.page=0;st.charts[id]=0;drawTable(st,st.tables.get(id));
  const replacement=[...st.tables.get(id).section.querySelectorAll('[data-stats-filter]')].find(e=>e.dataset.statsFilter===key);replacement?.focus({preventScroll:true});if(replacement&&start!==null)replacement.setSelectionRange(start,end);
 }
 return {render,unmount};
})();
