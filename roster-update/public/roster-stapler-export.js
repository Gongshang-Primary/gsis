/* Offline Stapler Plan colours on the canonical GSiS workbook.
   Imported workbook bytes are not retained by GSiS, so arbitrary source formatting is unavailable. */
window.RosterStaplerExport=(()=>{
 'use strict';
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 const days=['Monday','Tuesday','Wednesday','Thursday','Friday'];
 const norm=value=>String(value??'').trim().normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
 const clone=value=>JSON.parse(JSON.stringify(value));
 const nodes=(root,name)=>Array.from(root.getElementsByTagNameNS('*',name));
 const cellText=cell=>nodes(cell,'t').map(t=>t.textContent||'').join('');
 const key=(teacher,period)=>teacher+'|'+period;
 function fail(message){throw Error(message);}
 function column(number){let label='';for(let n=number;n;n=Math.floor((n-1)/26))label=String.fromCharCode(65+(n-1)%26)+label;return label;}
 function xml(text){const doc=new DOMParser().parseFromString(text,'application/xml');if(nodes(doc,'parsererror').length)fail('The timetable workbook could not be read.');return doc;}
 function filename(date,eventName,now){
  const safe=String(eventName||'').replace(/[<>:"/\\|?*\u0000-\u001F]/g,' ').replace(/[^\p{L}\p{N}() _.-]+/gu,' ').replace(/\s+/g,' ').replace(/^[. ]+|[. ]+$/g,'').slice(0,120).replace(/[. ]+$/g,'').trim()||'Stapler';
  const saved=new Date(now??Date.now());if(!Number.isFinite(saved.getTime()))fail('Choose a valid export time.');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(saved).map(p=>[p.type,p.value]));
  return date.slice(0,4)+' '+months[Number(date.slice(5,7))-1]+' '+date.slice(8,10)+' '+safe+' - Teachers TTb saved '+parts.year+' '+months[Number(parts.month)-1]+' '+parts.day+' '+parts.hour+parts.minute+'h.xlsx';
 }
 function prepare(plan,result){
  window.GSISRosterStapler.validate(plan);
  if(!result?.model||result.modelId!==plan.baselineId)fail('Load the exact baseline used by this suspended plan before exporting.');
  const model=window.RosterConverter.resolveClashes(clone(result.model));
  if(!['single-week','odd-even'].includes(model.layoutMode))fail('The timetable layout is unsupported.');
  const weekKeys=model.layoutMode==='single-week'?['single']:['odd','even'];
  if(!weekKeys.includes(plan.parity))fail('The suspended plan week does not match the baseline timetable.');
  const week=model[plan.parity],dayIndex=(new Date(plan.date+'T12:00:00Z').getUTCDay()+6)%7;
  if(dayIndex>4)fail('Export requires a weekday timetable.');
  const timing=model.timing,perDay=week.perDay;
  if(!timing||!Number.isInteger(timing.startMinutes)||!Number.isInteger(timing.periodMinutes)||timing.periodMinutes<=0||!Number.isInteger(perDay)||perDay<1||perDay>40||model.maxPeriod!==perDay-1||plan.periods.length!==perDay||weekKeys.some(k=>JSON.stringify(model[k].days)!==JSON.stringify(days)||model[k].maxPeriod!==perDay-1)||plan.periods.some((p,i)=>p.period!==i||p.startMinutes!==timing.startMinutes+i*timing.periodMinutes||p.endMinutes!==timing.startMinutes+(i+1)*timing.periodMinutes))fail('The suspended plan period timings do not match this baseline.');
  const rawNames=new Map();week.blocks.forEach((block,index)=>{const name=norm(block.name);if(rawNames.has(name))fail('Timetable teacher names are ambiguous: '+block.name+'.');rawNames.set(name,index);});
  const originals=new Set(plan.baseline.teachers.map(t=>t.staffId)),teacherRows=new Map(),blocks=new Map();
  for(const teacher of plan.teachers){
   const name=norm(teacher.timetableName),existing=rawNames.get(name);
   if(originals.has(teacher.staffId)){
    if(existing===undefined)fail('Baseline teacher is missing from the workbook: '+teacher.timetableName+'.');
    teacherRows.set(teacher.staffId,6+existing*4);blocks.set(teacher.staffId,week.blocks[existing]);
   }else{
    if(existing!==undefined)fail('Added teacher matches an existing workbook name: '+teacher.timetableName+'.');
    const index=week.blocks.length;rawNames.set(name,index);
    for(const weekKey of weekKeys)model[weekKey].blocks.push({name:teacher.timetableName,cells:Array.from({length:5*perDay},()=>['','','',''])});
    teacherRows.set(teacher.staffId,6+index*4);blocks.set(teacher.staffId,week.blocks[index]);
   }
  }
  model.teacherCount=week.blocks.length;
  return {model,week,dayIndex,perDay,teacherRows,blocks};
 }
 function canUseBaseline(plan,result){try{prepare(clone(plan),result);return true;}catch{return false;}}
 async function standaloneWorkbook(plan){
  window.GSISRosterStapler.validate(plan);
  const teacherRows=new Map(plan.teachers.map((teacher,i)=>[teacher.staffId,5+i*4]));
  const page={name:'Teacher Summary',sheetName:'Teacher Summary',periodColumnWidth:26,periods:plan.periods,
   title:'Teacher Summary · '+plan.date+' · Current Stapler plan',
   subtitle:'Selected date only · Subject / Class / Venue / Group · Grey: vacated · Green: changed lesson · Pink: extra lesson · Blue: teacher suspension.',
   columns:['Teacher',...plan.periods.map(p=>'P'+p.period)],
   rows:plan.teachers.flatMap(teacher=>Array.from({length:4},(_,i)=>({day:i?'':teacher.timetableName||teacher.name,cells:plan.periods.map(()=>'')})))};
  const output=await window.RosterExport.makeWorkbook([page]);
  return {output,dayIndex:0,perDay:plan.periods.length,teacherRows,blocks:new Map()};
 }
 function styleWriter(doc){
  const fills=nodes(doc,'fills')[0],xfs=nodes(doc,'cellXfs')[0],cache=new Map();
  if(!fills||!xfs)fail('The workbook style table is incomplete.');
  const colours={clear:0};
  for(const [name,rgb] of Object.entries({grey:'FFD9D9D9',green:'FFDFF3DF',pink:'FFFFDCE3',blue:'FFDDEBF7',orange:'FFFFC000'})){
   const fill=doc.createElementNS(ns,'fill'),pattern=doc.createElementNS(ns,'patternFill'),fg=doc.createElementNS(ns,'fgColor'),bg=doc.createElementNS(ns,'bgColor');
   pattern.setAttribute('patternType','solid');fg.setAttribute('rgb',rgb);bg.setAttribute('indexed','64');pattern.append(fg,bg);fill.append(pattern);colours[name]=fills.children.length;fills.append(fill);
  }
  fills.setAttribute('count',fills.children.length);
  return (base,colour)=>{
   const id=base+'|'+colour;if(cache.has(id))return cache.get(id);
   const original=xfs.children[base];if(!original)fail('A timetable cell has an invalid style.');
   const xf=original.cloneNode(true);xf.setAttribute('fillId',colours[colour]);xf.setAttribute('applyFill','1');xf.setAttribute('applyAlignment','1');
   let alignment=nodes(xf,'alignment')[0];if(!alignment){alignment=doc.createElementNS(ns,'alignment');xf.insertBefore(alignment,[...xf.children].find(n=>['protection','extLst'].includes(n.localName))||null);}alignment.setAttribute('wrapText','1');
   const index=xfs.children.length;xfs.append(xf);xfs.setAttribute('count',xfs.children.length);cache.set(id,index);return index;
  };
 }
 async function makeWorkbook(input,baselineResult,options={}){
  const plan=clone(input),summary=options.reliefSummary;
  if(summary)for(const teacher of summary.addedTeachers||[])if(!plan.teachers.some(t=>t.staffId===teacher.staffId))plan.teachers.push(clone(teacher));
  const standalone=baselineResult==null,prepared=standalone?await standaloneWorkbook(plan):prepare(plan,baselineResult),{model,dayIndex,perDay,teacherRows,blocks}=prepared;
  const outputName=filename(plan.date,options.eventName,options.now),output=prepared.output||await window.RosterConverter.makeWorkbook(model,{preserveWeeks:true});
  const sheetName=standalone?'Teacher Summary':plan.parity==='single'?'Teachers':plan.parity==='odd'?'Odd Week':'Even Week',sheetIndex=output.sheetNames.indexOf(sheetName);
  if(sheetIndex<0)fail('The selected timetable week is missing from the workbook.');
  const zip=await JSZip.loadAsync(await output.blob.arrayBuffer()),sheetPath='xl/worksheets/sheet'+(sheetIndex+1)+'.xml';
  const [sheetText,stylesText]=await Promise.all([zip.file(sheetPath).async('string'),zip.file('xl/styles.xml').async('string')]);
  const doc=xml(sheetText),styles=xml(stylesText),style=styleWriter(styles),cells=new Map(nodes(doc,'c').map(c=>[c.getAttribute('r'),c])),baseStyles=new Map([...cells].map(([ref,c])=>[ref,Number(c.getAttribute('s')||0)]));
  if(standalone)for(const row of nodes(doc,'row')){const r=Number(row.getAttribute('r'));if(r>=5)row.setAttribute('ht','18');else if(r===2)row.setAttribute('ht','48');}
  const startColumn=2+dayIndex*perDay;
  function write(teacher,period,values,colour){
   const start=teacherRows.get(teacher);if(start===undefined)fail('A planned teacher is missing from the workbook.');
   for(let offset=0;offset<4;offset++){
    const ref=column(startColumn+period)+(start+offset),cell=cells.get(ref);if(!cell)fail('A timetable cell is missing from the workbook.');
    cell.replaceChildren();cell.setAttribute('s',style(baseStyles.get(ref),colour));cell.removeAttribute('t');
    const value=String(values[offset]??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'\uFFFD');
    if(value!==''){cell.setAttribute('t','inlineStr');const inline=doc.createElementNS(ns,'is'),text=doc.createElementNS(ns,'t');text.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');text.textContent=value;inline.append(text);cell.append(inline);}
   }
  }
  // Only teachers owned by this plan are cleared; unmatched imported teacher rows stay intact.
  for(const teacher of plan.teachers)for(let p=0;p<perDay;p++)write(teacher.staffId,p,['','','',''],'clear');
  const active=plan.tiles.filter(t=>t.kind==='lesson'&&t.location==='grid'),occupied=new Set(active.map(t=>key(t.teacherId,t.period))),current=new Map(plan.tiles.map(t=>[t.id,t]));
  for(const original of plan.baseline.tiles){const tile=current.get(original.id),source=original.source;if((tile.location!=='grid'||tile.teacherId!==source.teacherId||tile.period!==source.period)&&!occupied.has(key(source.teacherId,source.period)))write(source.teacherId,source.period,['','','',''],'grey');}
  const classes=new Map(plan.classes.map(c=>[c.id,c.name]));
  for(const tile of active){
   const source=tile.source,original=tile.baselineId?blocks.get(source.teacherId)?.cells[dayIndex*perDay+source.period]:null;
   const values=[tile.subject,tile.classIds.map(id=>classes.get(id)).join(', '),tile.venue,tile.group];
   if(original){if(tile.subject===source.subject)values[0]=original[0];if(JSON.stringify(tile.classIds)===JSON.stringify(source.classIds))values[1]=original[1];if(tile.venue===source.venue)values[2]=original[2];if(tile.group===source.group)values[3]=original[3];}
   const colour=window.GSISRosterStapler.tileState(plan,tile)==='original'?'clear':!tile.baselineId?'pink':'green';write(tile.teacherId,tile.period,values,colour);
  }
  for(const mat of plan.mats.filter(m=>m.target==='teacher'))for(let p=mat.fromPeriod;p<=mat.toPeriod;p++){
   const row=teacherRows.get(mat.targetId);write(mat.targetId,p,Array.from({length:4},(_,i)=>cellText(cells.get(column(startColumn+p)+(row+i)))),'blue');
  }
  if(summary){
   const read=(id,p)=>{const row=teacherRows.get(id);if(row===undefined)fail('An operational teacher is missing from the workbook. Refresh Name Bridge and retry.');return Array.from({length:4},(_,i)=>cellText(cells.get(column(startColumn+p)+(row+i))));};
   const period=p=>{if(!Number.isInteger(p)||p<0||p>=perDay)fail('An operational period does not match this timetable.');};
   const byDemand=new Map(summary.assignments.map(a=>[a.demandId,a])),absent=new Set(),covered=new Set();
   const demands=new Map();for(const group of summary.demands)for(const dem of group.members||[group]){const slot=key(dem.staffId,dem.period);if(!demands.has(slot))demands.set(slot,[]);demands.get(slot).push({dem,assignment:byDemand.get(group.id)});}
   for(const absence of summary.absences)for(const p of absence.periods){
    period(p);const values=read(absence.staffId,p),reason=absence.reason||'Unspecified',checks=demands.get(key(absence.staffId,p))||[];
    const unresolved=checks.some(({assignment:a})=>!a||a.remove),noRelief=checks.length&&checks.every(({assignment:a})=>a?.noRelief);
    values[0]=(values.some(Boolean)?(values[0]||'Lesson')+' (absent — '+reason+')':'Absent — '+reason)+(unresolved?' [UNASSIGNED]':noRelief?' [No Relief Needed]':'');
    write(absence.staffId,p,values,'grey');absent.add(key(absence.staffId,p));
   }
   // Ordinary cover must still be free; approved combinations and repurposed duties keep their explicit meaning.
   const assignments=summary.assignments.filter(a=>!a.noRelief&&!a.remove).sort((a,b)=>Number(!!a.combination)-Number(!!b.combination));
   for(const a of assignments){
    period(a.period);const slot=key(a.staffId,a.period),current=read(a.staffId,a.period),combined=a.combination===true;
    if(absent.has(slot)||covered.has(slot)&&!combined||current.some(Boolean)&&!combined&&!a.repurposedDuty)fail('Relief clashes detected: '+(a.relieverName||a.staffId)+', period '+a.period+'. Review this allocation before exporting.');
    const absentName=a.absentName||[...new Set((a.members||[]).map(m=>m.name).filter(Boolean))].join(', ');
    const label=(a.subject||'Relief')+(absentName?' (for '+absentName+')':'')+(combined?' [Combined]':'')+(a.repurposedDuty?' [Repurposed recess duty]':'')+(a.status==='completed'?' [Completed]':a.status==='draft'?'':' [Published]')+(a.assignedBy?'\nAssigned by: '+a.assignedBy:'');
    const next=[label,a.className||'',a.venue||'',a.groupName||''];
    write(a.staffId,a.period,combined?current.map((v,i)=>[v,next[i]].filter(Boolean).join(' + ')):next,'orange');covered.add(slot);
   }
   const setHeader=(address,text)=>{const cell=cells.get(address);cell.replaceChildren();cell.setAttribute('t','inlineStr');cell.setAttribute('s',style(Number(cell.getAttribute('s')||0),'clear'));const is=doc.createElementNS(ns,'is'),t=doc.createElementNS(ns,'t');t.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');t.textContent=text;is.append(t);cell.append(is);};
   const planStatus=({confirmed:'Confirmed suspended timetable, not yet published',published:'Published suspended timetable',baseline:'Baseline timetable'})[summary.staplerStatus]||'Baseline timetable';
   setHeader('A1','All teachers · '+plan.date+' · '+(options.snapshotLabel||'Current saved plan and allocations')+' · '+planStatus);
   setHeader('A2','Subject / Class / Venue / Group · Orange: relief · Grey: absent / vacated · Green: changed lesson · Pink: extra lesson · Blue: teacher suspension. '+(standalone?'Selected date only.':'Other days show baseline.')+' Revision '+options.revision+'; allocation '+options.allocationRevision+'.');
   const merges=nodes(doc,'mergeCells')[0];for(const r of [1,2]){if(!standalone){const merge=doc.createElementNS(ns,'mergeCell');merge.setAttribute('ref','A'+r+':'+column(1+5*perDay)+r);merges.append(merge);}nodes(doc,'row').find(row=>row.getAttribute('r')===String(r)).setAttribute('ht',r===1?'30':standalone?'48':'36');}merges.setAttribute('count',merges.children.length);
   if(!standalone){const setup=doc.createElementNS(ns,'pageSetup');setup.setAttribute('orientation','landscape');setup.setAttribute('paperSize','9');setup.setAttribute('fitToWidth','1');setup.setAttribute('fitToHeight','0');doc.documentElement.append(setup);}
  }
  const serialize=doc=>new XMLSerializer().serializeToString(doc).replace(/(<(?:\w+:)?t(?:\s[^>]*)?>)([\s\S]*?)(<\/(?:\w+:)?t>)/g,(_,open,text,close)=>open+text.replace(/\r/g,'&#13;').replace(/\n/g,'&#10;')+close);
  zip.file(sheetPath,serialize(doc));zip.file('xl/styles.xml',serialize(styles));
  if(options.includeClassPov===true)return plannerWorkbook(zip,sheetPath,plan,{...options,standalone},outputName);
  await window.RosterExport.fitWorkbookRows(zip);
  return {blob:await zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),filename:outputName,sheetNames:output.sheetNames};
 }
 async function plannerWorkbook(zip,teacherPath,plan,options,outputName){
  const snapshotLabel=options.snapshotLabel||'Current Stapler plan · '+plan.date+' · '+(options.standalone?'Selected date only.':'Other weekdays in Teacher Summary show baseline.'),data={date:plan.date,revision:options.revision??'local',allocationRevision:options.allocationRevision??'local',exportedAt:options.now??new Date().toISOString(),snapshotLabel,teacherSummary:options.reliefSummary||{plan,absences:[],assignments:[],demands:[]}};
  const classOutput=await makeClassWorkbook(data),classZip=await JSZip.loadAsync(await classOutput.blob.arrayBuffer());
  const [teacherText,classText,teacherStyleText,classStyleText]=await Promise.all([zip.file(teacherPath).async('string'),classZip.file('xl/worksheets/sheet1.xml').async('string'),zip.file('xl/styles.xml').async('string'),classZip.file('xl/styles.xml').async('string')]);
  const teacher=xml(teacherText),classes=xml(classText),styles=xml(teacherStyleText),classStyles=xml(classStyleText),offsets={};
  for(const name of ['fonts','fills','borders']){const target=nodes(styles,name)[0],source=nodes(classStyles,name)[0];offsets[name]=target.children.length;for(const entry of [...source.children])target.append(styles.importNode(entry,true));target.setAttribute('count',target.children.length);}
  const targetXfs=nodes(styles,'cellXfs')[0],styleOffset=targetXfs.children.length;
  for(const original of [...nodes(classStyles,'cellXfs')[0].children]){const xf=styles.importNode(original,true);for(const [attribute,name] of [['fontId','fonts'],['fillId','fills'],['borderId','borders']])xf.setAttribute(attribute,Number(xf.getAttribute(attribute)||0)+offsets[name]);targetXfs.append(xf);}targetXfs.setAttribute('count',targetXfs.children.length);
  for(const cell of nodes(classes,'c'))cell.setAttribute('s',Number(cell.getAttribute('s')||0)+styleOffset);
  if(!options.reliefSummary){const title=nodes(teacher,'c').find(c=>c.getAttribute('r')==='A1');nodes(title,'t')[0].textContent='Teacher Summary · '+plan.date+' · Current Stapler plan';}
  const workbook=xml(await zip.file('xl/workbook.xml').async('string')),sheets=nodes(workbook,'sheets')[0];sheets.replaceChildren();
  for(const [i,name] of ['Teacher Summary','Class POV'].entries()){const sheet=workbook.createElementNS(ns,'sheet');sheet.setAttribute('name',name);sheet.setAttribute('sheetId',i+1);sheet.setAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','r:id','rId'+(i+1));sheets.append(sheet);}
  nodes(workbook,'definedNames')[0]?.remove();const defined=workbook.createElementNS(ns,'definedNames');
  for(const [i,name] of ['Teacher Summary','Class POV'].entries()){
   const doc=i?classes:teacher,lastRow=Math.max(...nodes(doc,'row').map(r=>Number(r.getAttribute('r')))),lastColumn=i||options.standalone?column(plan.periods.length+1):column(1+5*plan.periods.length);
   for(const [kind,value] of [['_xlnm.Print_Titles',"'"+name+"'!$1:$"+(i||options.standalone?4:5)],['_xlnm.Print_Area',"'"+name+"'!$A$1:$"+lastColumn+'$'+lastRow]]){const item=workbook.createElementNS(ns,'definedName');item.setAttribute('name',kind);item.setAttribute('localSheetId',i);item.textContent=value;defined.append(item);}
  }workbook.documentElement.append(defined);
  for(const file of Object.keys(zip.files))if(/^xl\/worksheets\/sheet\d+\.xml$/.test(file))zip.remove(file);
  const serializer=new XMLSerializer();zip.file('xl/workbook.xml',serializer.serializeToString(workbook));zip.file('xl/styles.xml',serializer.serializeToString(styles));zip.file('xl/worksheets/sheet1.xml',serializer.serializeToString(teacher));zip.file('xl/worksheets/sheet2.xml',serializer.serializeToString(classes));
  const relationships='http://schemas.openxmlformats.org/package/2006/relationships',office='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  zip.file('xl/_rels/workbook.xml.rels','<Relationships xmlns="'+relationships+'">'+[1,2].map(i=>'<Relationship Id="rId'+i+'" Type="'+office+'/worksheet" Target="worksheets/sheet'+i+'.xml"/>').join('')+'<Relationship Id="rId3" Type="'+office+'/styles" Target="styles.xml"/></Relationships>');
  const types=xml(await zip.file('[Content_Types].xml').async('string'));for(const item of nodes(types,'Override').filter(n=>/^\/xl\/worksheets\//.test(n.getAttribute('PartName'))))item.remove();for(const i of [1,2]){const item=types.createElementNS(types.documentElement.namespaceURI,'Override');item.setAttribute('PartName','/xl/worksheets/sheet'+i+'.xml');item.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml');types.documentElement.append(item);}zip.file('[Content_Types].xml',serializer.serializeToString(types));
  await window.RosterExport.fitWorkbookRows(zip);
  return {blob:await zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),filename:outputName,sheetNames:['Teacher Summary','Class POV']};
 }
 async function makeReliefWorkbook(data,baselineResult){
  const summary=data?.teacherSummary;if(!summary?.plan||!Array.isArray(summary.absences)||!Array.isArray(summary.assignments)||!Array.isArray(summary.demands)||summary.plan.date!==data.date)fail('The full teacher summary is unavailable. Refresh and retry.');
  return makeWorkbook(summary.plan,baselineResult,{reliefSummary:summary,eventName:data.localSnapshot?'Relief local snapshot':'Relief current saved',snapshotLabel:data.snapshotLabel,now:data.exportedAt,revision:data.revision,allocationRevision:data.allocationRevision});
 }
 // Class POV uses the selected day's effective plan, never the baseline workbook.
 async function makeClassWorkbook(data){
  const summary=data?.teacherSummary,plan=summary?.plan;
  if(!plan||plan.date!==data.date||!Array.isArray(summary.absences)||!Array.isArray(summary.assignments)||!Array.isArray(summary.demands))fail('The class summary is unavailable. Refresh and retry.');
  const teachers=new Map([...plan.teachers,...(summary.addedTeachers||[])].map(t=>[t.staffId,t.name||t.timetableName||t.staffId]));
  const assignments=new Map(summary.assignments.filter(a=>!a.remove&&!['cancelled','invalidated'].includes(a.status)).map(a=>[a.demandId,a]));
  const absences=new Map();for(const a of summary.absences)for(const p of a.periods)absences.set(key(a.staffId,p),a);
  const demands=new Map(),recess=[];
  for(const group of summary.demands)for(const d of group.members||[group]){
   const entry={d,a:assignments.get(group.id)};
   if(d.recessActivationId)recess.push(entry);
   else {const slot=key(d.staffId,d.period);if(!demands.has(slot))demands.set(slot,[]);demands.get(slot).push(entry);}
  }
  const classes=plan.classes.slice().sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true})),cards=new Map(),colourRank={clear:0,green:1,pink:2,orange:3};
  const add=(id,p,text,colour)=>{const slot=key(id,p);if(!cards.has(slot))cards.set(slot,[]);cards.get(slot).push({text,colour});};
  const status=a=>a?.status==='completed'?' [Completed]':a&&a.status!=='draft'?' [Published]':'';
  const cover=(name,a)=>a&&!a.noRelief?(a.relieverName||teachers.get(a.staffId)||a.staffId)+' (for '+name+')'+(a.combination?' [Combined]':'')+(a.repurposedDuty?' [Repurposed recess duty]':'')+status(a)+(a.assignedBy?'\nAssigned by: '+a.assignedBy:''):null;
  for(const tile of plan.tiles.filter(t=>t.location==='grid')){
   if(tile.kind==='recess'){
    for(const p of window.GSISRosterStapler.tilePeriods(plan,tile))for(const id of tile.classIds){const cls=classes.find(c=>c.id===id);if(!recess.some(({d})=>d.period===p&&norm(d.className)===norm(cls?.name)))add(id,p,['Recess',tile.venue].filter(Boolean).join('\n'),'clear');}
    continue;
   }
   if(tile.kind!=='lesson')continue;
   const name=teachers.get(tile.teacherId)||tile.teacherId,absence=absences.get(key(tile.teacherId,tile.period));
   const checks=demands.get(key(tile.teacherId,tile.period))||[];
   const className=tile.classIds.map(id=>classes.find(c=>c.id===id)?.name||'').join(', ');
   const matched=checks.find(({d})=>norm(d.subject)===norm(tile.subject)&&norm(d.className)===norm(className)&&norm(d.venue)===norm(tile.venue)&&norm(d.groupName)===norm(tile.group))||(checks.length===1?checks[0]:null);
   const a=matched?.a,substitute=absence?cover(name,a):null;
   const label=substitute||(absence?name+' (absent — '+(absence.reason||'Unspecified')+' — '+(matched&&!a?'unresolved':'no relief')+')'+status(a):name);
   const colour=substitute?'orange':window.GSISRosterStapler.tileState(plan,tile)==='original'?'clear':!tile.baselineId?'pink':'green';
   const text=[label,tile.subject,tile.venue,tile.group].filter(Boolean).join('\n');
   for(const id of tile.classIds)add(id,tile.period,text,colour);
  }
  for(const {d,a} of recess){
   const cls=classes.find(c=>norm(c.name)===norm(d.className));if(!cls)continue;
   const text=[cover('Recess supervision',a)||(a?.noRelief?'No relief needed':'UNASSIGNED')+status(a),d.subject||'Recess',d.venue,d.groupName].filter(Boolean).join('\n');
   add(cls.id,d.period,text,a&&!a.noRelief?'orange':'clear');
  }
  const planStatus=({confirmed:'Confirmed suspended timetable, not yet published',published:'Published suspended timetable',baseline:'Baseline timetable'})[summary.staplerStatus]||'Baseline timetable';
  const page={name:'Class POV',sheetName:'Class POV',weekLabel:'',periodColumnWidth:26,periods:plan.periods,
   title:'Class POV · '+data.date,
   subtitle:(data.snapshotLabel||planStatus+' · Current saved allocations')+'. Orange: relief · Pink: extra lesson · Green: changed lesson. Revision '+data.revision+'; allocation '+data.allocationRevision+'.',
   columns:['Class',...plan.periods.map(p=>'P'+p.period+'\n'+p.start+'\n'+p.end)],
   rows:classes.map(c=>({day:c.name,cells:plan.periods.map(p=>(cards.get(key(c.id,p.period))||[]).map(v=>v.text).join('\n\n'))}))};
  const output=await window.RosterExport.makeWorkbook([page]),zip=await JSZip.loadAsync(await output.blob.arrayBuffer());
  const doc=xml(await zip.file('xl/worksheets/sheet1.xml').async('string')),styles=xml(await zip.file('xl/styles.xml').async('string')),style=styleWriter(styles);
  const cells=new Map(nodes(doc,'c').map(c=>[c.getAttribute('r'),c]));
  classes.forEach((c,i)=>plan.periods.forEach((p,j)=>{const entries=cards.get(key(c.id,p.period))||[],colour=entries.reduce((best,v)=>colourRank[v.colour]>colourRank[best]?v.colour:best,'clear'),cell=cells.get(column(j+2)+(i+5));cell.setAttribute('s',style(Number(cell.getAttribute('s')||0),colour));}));
  // Match the offline class workbook's readable 11pt stacked cards.
  nodes(nodes(styles,'fonts')[0],'font').slice(0,2).forEach(font=>nodes(font,'sz')[0].setAttribute('val','11'));
  nodes(doc,'col')[0].setAttribute('width','17');
  for(const row of nodes(doc,'row')){const r=Number(row.getAttribute('r'));if(r>=5){const entries=page.rows[r-5],lines=Math.max(...entries.cells.map(text=>text.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/24)),0)));row.setAttribute('ht',Math.min(409,Math.max(45,lines*14.25+8)));}else if(r===2)row.setAttribute('ht','44');}
  const serializer=new XMLSerializer();zip.file('xl/worksheets/sheet1.xml',serializer.serializeToString(doc));zip.file('xl/styles.xml',serializer.serializeToString(styles));
  await window.RosterExport.fitWorkbookRows(zip);
  return {blob:await zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),filename:filename(data.date,plan.importSource?.eventName||'Relief current saved',data.exportedAt).replace(' - Teachers TTb saved ',' - Class POV saved '),sheetNames:output.sheetNames};
 }
 return {makeWorkbook,makeReliefWorkbook,makeClassWorkbook,canUseBaseline};
})();
