/* One timetable projection for screen, PDF and Excel. The saved model stays intact. */
var RosterExport=(()=>{
 const cache=new WeakMap(),collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
 const sorted=values=>[...values].sort((a,b)=>collator.compare(a,b)||a.localeCompare(b,'en'));
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const xml=value=>escape(String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'\uFFFD'));
 const classNames=value=>[...new Set(value.split(/[\n,;]+/).map(s=>s.trim()).filter(Boolean))];
 function classLevel(name){const m=/^(?:(?:primary|pri|p)\s*)?([1-6])(?=$|[^0-9])/i.exec(name.trim());return m?Number(m[1]):null;}
 // A source group is scoped to its pupil level, never joined across levels by label alone.
 function groupName(card){
  const group=card[3].trim();
  if(/^(?:Form|PD|Duty|BLK|IMP)$/i.test(card[0].trim())||/^(?:EL|MA|SC)$/i.test(group))return '';
  if(!group||/^(?:whole class|all|entire class|hall,?\s*class|\.)$/i.test(group))return '';
  const classes=classNames(card[1]),levels=sorted(new Set(classes.flatMap(name=>name.split('/')).map(classLevel).filter(Boolean)));
  // Numbered language groups retain their identity as their source class list varies.
  // Other labels remain class-scoped so unrelated intervention groups do not merge.
  const levelScope=levels.map(n=>'P'+n).join('/'),namedLanguage=/^(?:CL|ML|TL)\d+(?:\s|$)/i.test(group);
  const scope=namedLanguage&&levelScope?levelScope:(sorted(classes).join('/')||levelScope||'Unspecified level');
  return scope+' · '+group;
 }
 function fields(type,provided={}){return {subject:true,class:true,venue:true,group:true,teachers:true,tgTeachers:type!=='class',...provided};}
 function index(model){
  if(cache.has(model))return cache.get(model);
  const weeks=GSISRoster.weeks(model).map(([label,week])=>{
   const teachers=new Map(),classes=new Map(),tgs=new Map();
   for(const block of week.blocks){
    teachers.set(block.name,block);
    block.cells.forEach((card,i)=>{
     const tg=groupName(card);
     for(const [map,name] of [...classNames(card[1]).map(name=>[classes,name]),...(tg?[[tgs,tg]]:[])]){
      if(!map.has(name))map.set(name,new Map());
      const slots=map.get(name);if(!slots.has(i))slots.set(i,new Map());
      const cell=slots.get(i),key=JSON.stringify(card);
      if(!cell.has(key))cell.set(key,{card,teachers:new Set()});
      cell.get(key).teachers.add(block.name);
     }
    });
   }
   for(const name of model.datedClasses||[])if(!classes.has(name))classes.set(name,new Map());
   return {label,week,teachers,classes,tgs};
  });
  const result={weeks,teacherNames:sorted(new Set(weeks.flatMap(w=>[...w.teachers.keys()]))),classNames:sorted(new Set(weeks.flatMap(w=>[...w.classes.keys()]))),tgNames:sorted(new Set(weeks.flatMap(w=>[...w.tgs.keys()])))};
  cache.set(model,result);return result;
 }
 function checkType(type){if(!['teacher','class','tg'].includes(type))throw Error('Choose teacher or class or TG timetables.');}
 function names(model,type='teacher'){checkType(type);return index(model)[type+'Names'].slice();}
 function time(model,p){const n=model.timing.startMinutes+p*model.timing.periodMinutes;return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
 function cardText(card,teachers,type,show){
  if(card.every(s=>!s.trim()))return '';
  const parts=[];
  if(show.subject)parts.push(card[0]);
  if(type==='teacher'){if(show.class)parts.push(card[1]);}
  else {
   if(show.teachers&&(type!=='class'||!groupName(card)||show.tgTeachers))parts.push(sorted(teachers).join(', '));
   if(type==='tg'&&show.class)parts.push(card[1]);
  }
  if(show.venue)parts.push(card[2]);
  if(show.group)parts.push(card[3]);
  if(type==='class'&&show.class&&classNames(card[1]).length>1)parts.push('Classes: '+card[1]);
  return parts.filter(Boolean).join('\n');
 }
 function pages(model,options={}){
  const type=options.type||'teacher';checkType(type);const show=fields(type,options.fields);
  const source=index(model),available=names(model,type),chosen=options.names===undefined?available:[...new Set(options.names)];
  if(chosen.some(name=>!available.includes(name)))throw Error('Select names from this timetable.');
  const requested=options.lastPeriod===undefined?model.timing.normalLastPeriod:Number(options.lastPeriod);
  if(!Number.isInteger(requested)||requested<0)throw Error('Choose a valid last period.');
  const lastPeriod=Math.min(requested,model.maxPeriod),result=[];
  for(const name of chosen)for(const {label,week,teachers,classes,tgs} of source.weeks){
   const recess=type==='class'?(model.recesses||[]).find(r=>r.level===classLevel(name)):null;
   const block=teachers.get(name),classCells=(type==='tg'?tgs:classes).get(name);
   const periods=Array.from({length:lastPeriod+1},(_,period)=>({period,start:time(model,period),end:time(model,period+1)}));
   const rows=week.days.map((day,d)=>({day,cells:periods.map(({period})=>{
    const i=d*week.perDay+period;
    if(type==='teacher')return block?cardText(block.cells[i],null,type,show):'';
    const lessons=Array.from(classCells?.get(i)?.values()||[]).map(lesson=>cardText(lesson.card,lesson.teachers,type,show));
    if(recess?.period===period)lessons.unshift('Recess (P'+recess.level+')');
    if(type==='class'&&model.datedRecesses?.some(r=>r.className===name&&r.periods.includes(period)))lessons.unshift('Recess');
    return lessons.join('\n\n');
   })}));
   result.push({type,name,weekLabel:label,title:(type==='teacher'?'Teacher: ':type==='class'?'Class: ':'TG: ')+name+' · '+label,subtitle:[options.timetableName,options.dateLabel,'Fields: '+[['subject','Subject'],['teachers','Teacher'],['class','Class'],['venue','Venue'],['group','Group']].filter(([key])=>show[key]&&(key!=='teachers'||type!=='teacher')).map(([,label])=>label).join(' / ')+(type==='class'&&show.teachers&&!show.tgTeachers?' · Teachers hidden for TG lessons':'')].filter(Boolean).join(' · '),columns:['Day',...periods.map(p=>'P'+p.period+'\n'+p.start+'\n'+p.end)],periods,rows,lastPeriod});
  }
  return result;
 }
 // A transient one-row model reuses the exact screen/PDF/Excel projection.
 function dayModel(day){
  const first=day.periods[0],minutes=first.endMinutes-first.startMinutes;
  return {layoutMode:'single-week',maxPeriod:day.periods.length-1,timing:{startMinutes:first.startMinutes,periodMinutes:minutes,normalLastPeriod:day.periods.length-1},single:{days:[day.date],perDay:day.periods.length,blocks:day.teachers.map(t=>({name:t.timetableName||t.name,cells:t.cells}))},recesses:[],datedClasses:day.classes||[],datedRecesses:day.recesses||[]};
 }
 function dayPages(day,options={}){
  return pages(dayModel(day),options).map(page=>({...page,weekLabel:day.date,title:page.title.replace('School week',day.date),periods:day.periods.slice(0,page.lastPeriod+1),sheetName:page.name+' '+day.date}));
 }
 function datedBaseline(model,date,parity){
  const week=model.layoutMode==='single-week'?model.single:['odd','even'].includes(parity)?model[parity]:null,weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
  if(!week||weekday>4)return null;
  const periods=Array.from({length:week.perDay},(_,period)=>({period,startMinutes:model.timing.startMinutes+period*model.timing.periodMinutes,endMinutes:model.timing.startMinutes+(period+1)*model.timing.periodMinutes,start:time(model,period),end:time(model,period+1)}));
  return {date,source:'baseline',periods,teachers:week.blocks.map(block=>({name:block.name,timetableName:block.name,cells:block.cells.slice(weekday*week.perDay,(weekday+1)*week.perDay).map(cell=>cell.slice())})),recesses:(model.recesses||[]).flatMap(row=>week.blocks.flatMap(block=>block.cells.slice(weekday*week.perDay,(weekday+1)*week.perDay).flatMap(cell=>classNames(cell[1]).filter(name=>classLevel(name)===row.level).map(className=>({className,periods:[row.period]})))))};
 }
 function reliefPages(day,options={}){
  const relief=day.relief?.rows||[];if(!relief.length)return dayPages(day,options);
  const plain={...day,teachers:day.teachers.map(t=>({...t,cells:t.cells.map(c=>c.slice())}))},label=row=>row.timetableName||row.name;
  const find=row=>plain.teachers.find(t=>t.staffId&&t.staffId===row.staffId||label(row)&&(t.timetableName||t.name)===label(row));
  for(const row of relief){
   let teacher=find(row);if(!teacher&&label(row)&&!plain.teachers.some(t=>(t.timetableName||t.name)===label(row))){teacher={staffId:row.staffId,name:row.name,timetableName:label(row),cells:plain.periods.map(()=>['','','',''])};plain.teachers.push(teacher);}
   if(teacher)teacher.cells[row.period]=row.combination&&row.originalLesson?row.originalLesson.slice():['','','',''];
   for(const absent of plain.teachers)if(row.absentIds?.includes(absent.staffId)||row.absentTimetableNames?.includes(absent.timetableName||absent.name))absent.cells[row.period]=['Absent','','',''];
  }
  const type=options.type||'teacher',show=fields(type,options.fields),existing=dayPages(plain,{...options,names:undefined}),byName=new Map(existing.map(page=>[page.name,page])),overlayNames=relief.flatMap(row=>type==='teacher'?[label(row)]:type==='class'?classNames(row.className):[groupName([row.subject,row.className,row.venue,row.groupName])]).filter(Boolean),available=sorted(new Set([...byName.keys(),...overlayNames])),wanted=options.names||available,template=existing[0]||dayPages({...plain,teachers:[{name:'Timetable',cells:plain.periods.map(()=>['','','',''])}]},{...options,type:'teacher',names:['Timetable']})[0],result=wanted.map(name=>{if(!available.includes(name))throw Error('Select names from this timetable.');return byName.get(name)||{...template,type,name,sheetName:name+' '+day.date,title:(type==='teacher'?'Teacher: ':type==='class'?'Class: ':'TG: ')+name+' · '+day.date,rows:[{day:day.date,cells:template.periods.map(()=>'')}]};});
  for(const page of result){const cells=page.rows[0].cells,styles=page.rows[0].styles=page.periods.map(()=>5),flags=page.rows[0].relief=page.periods.map(()=>false);
   for(const row of relief){
    const matches=type==='teacher'?page.name===label(row):type==='class'?classNames(row.className).includes(page.name):groupName([row.subject,row.className,row.venue,row.groupName])===page.name;
    const at=page.periods.findIndex(p=>p.period===row.period);if(!matches||at<0)continue;
    const text=cardText([row.subject,row.className,row.venue,row.groupName],[row.name],type,show),note='Relief for '+(row.absentNames?.join(', ')||'absent teacher')+(row.unpublished?' · Not yet published':'');
    cells[at]=[cells[at],note+'\n'+text].filter(Boolean).join('\n\n');styles[at]=9;flags[at]=true;
   }
   if(day.relief.publishedAt&&Number.isFinite(Date.parse(day.relief.publishedAt)))page.subtitle+=' · Includes relief published '+new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(day.relief.publishedAt))+' SGT';
  }
  return result;
 }
 function comparisonPages(day,options={}){
  if(!day.baseline?.periods?.length||!Array.isArray(day.baseline.teachers))return reliefPages(day,options);
  const align=day.baseline,unmatched=day.periods.map(p=>!align.periods.some(q=>q.startMinutes===p.startMinutes&&q.endMinutes===p.endMinutes)),baseline={...align,date:day.date,periods:day.periods,teachers:align.teachers.map(t=>({...t,cells:day.periods.map(p=>{const q=align.periods.find(q=>q.startMinutes===p.startMinutes&&q.endMinutes===p.endMinutes);return q?t.cells[q.period]||['','','','']:['','','',''];})}))};
  const type=options.type||'teacher',currentPages=new Map(reliefPages(day,{...options,names:undefined}).map(page=>[page.name,page])),baselinePages=new Map(dayPages(baseline,{...options,names:undefined}).map(page=>[page.name,page])),currentNames=[...currentPages.keys()],baselineNames=[...baselinePages.keys()],chosen=options.names||sorted(new Set([...currentNames,...baselineNames]));
  return chosen.map(name=>{
   const current=currentPages.get(name),original=baselinePages.get(name),shape=current||original;
   if(!shape)throw Error('Select names from this timetable.');
   const published=current?.rows[0]?.cells||shape.periods.map(()=>''),usual=(original?.rows[0]?.cells||shape.periods.map(()=>'')).map((cell,i)=>unmatched[i]?'Baseline timing unavailable':cell),changed=published.map((cell,i)=>!unmatched[i]&&cell!==usual[i]);
   return {...shape,rows:[{day:day.source==='confirmed'?'Confirmed (suspended)':'Published (suspended)',cells:published,changed,relief:current?.rows[0]?.relief,styles:changed.map((value,i)=>current?.rows[0]?.styles?.[i]===9?9:value?8:5)},{day:'Usual baseline',cells:usual}],subtitle:shape.subtitle+' · Changed cells are highlighted.'};
  });
 }
 function tableHtml(page){
  return '<div class="table-scroll"><table class="timetable timetable-grid" aria-label="'+escape(page.title)+'"><thead><tr class="timetable-print-title"><th colspan="'+page.columns.length+'">'+escape(page.title)+'<small>'+escape(page.subtitle)+'</small></th></tr><tr class="period-time-row"><th scope="col">Time</th>'+page.periods.map(p=>'<th scope="col"><small>'+escape(periodTime(p)).replace(/\n/g,'<br>')+'</small></th>').join('')+'</tr><tr><th scope="col">Day</th>'+page.periods.map(p=>'<th scope="col">P'+p.period+'</th>').join('')+'</tr></thead><tbody>'+page.rows.map(row=>'<tr><th scope="row">'+escape(row.day)+'</th>'+row.cells.map((text,i)=>'<td'+(row.relief?.[i]?' class="relief-overlay" data-relief="true"':row.changed?.[i]?' class="published-overlay" data-timetable-changed="true"':text?'':' class="blank"')+'>'+text.split('\n\n').map(card=>{const at=card.indexOf('\n');return '<strong>'+escape(at<0?card:card.slice(0,at))+'</strong>'+escape(at<0?'':card.slice(at));}).join('\n\n')+(row.changed?.[i]?'<small class="ops-change-label">Changed</small>':'')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 }
 const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 function cell(ref,value,style){
  const text=style===5&&value?value.split('\n\n').map((part,i)=>{const at=part.indexOf('\n'),top=at<0?part:part.slice(0,at),rest=at<0?'':part.slice(at);return (i?'<r><t xml:space="preserve">\n\n</t></r>':'')+'<r><rPr><b/></rPr><t xml:space="preserve">'+xml(top)+'</t></r>'+(rest?'<r><t xml:space="preserve">'+xml(rest)+'</t></r>':'');}).join(''):'<t xml:space="preserve">'+xml(value)+'</t>';
  return '<c r="'+ref+'" s="'+style+'" t="inlineStr"><is>'+text+'</is></c>';
 }
 function column(index){let name='';for(let n=index+1;n;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name;}
 function periodHeaderRows(page){return Array.isArray(page.periods)&&page.periods.length===page.columns.length-1&&page.periods.length?4:3;}
 function periodTime(p){
  const clock=n=>Number.isInteger(n)&&n>=0&&n<=1440?String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'):'';
  const start=p.start||clock(p.startMinutes),end=p.end||clock(p.endMinutes);
  return start&&end?start+'\n'+end:'Time unavailable';
 }
 function sheetXml(page){
  const lastColumn=column(page.columns.length-1),width=page.periodColumnWidth||Math.max(8,Math.min(28,140/(page.columns.length-1)));
  const headers=periodHeaderRows(page),labels=headers===4?[page.columns[0],...page.periods.map(p=>'P'+p.period)]:page.columns;
  const rows=['<row r="1" ht="24" customHeight="1">'+cell('A1',page.title,1)+'</row>','<row r="2" ht="30" customHeight="1">'+cell('A2',page.subtitle,2)+'</row>'];
  if(headers===4)rows.push('<row r="3" ht="32" customHeight="1">'+['Time',...page.periods.map(periodTime)].map((s,i)=>cell(column(i)+'3',s,3)).join('')+'</row>');
  rows.push('<row r="'+headers+'" ht="'+(headers===4?24:42)+'" customHeight="1">'+labels.map((s,i)=>cell(column(i)+headers,s,3)).join('')+'</row>');
  page.rows.forEach((row,i)=>{
   const r=i+headers+1,text=[row.day,...row.cells];
   // Estimate wrapped lines so Excel displays every card field without manual row resizing.
   const lines=Math.max(...text.map((s,c)=>s.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/(c?width:13))),0)));
   const height=Math.min(409,Math.max(45,lines*11.5+8));
   rows.push('<row r="'+r+'" ht="'+height+'" customHeight="1">'+text.map((s,c)=>cell(column(c)+r,s,c?(row.styles?.[c-1]??5):4)).join('')+'</row>');
  });
  const end=page.rows.length+headers;
  return declaration+'<worksheet xmlns="'+ns+'"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:'+lastColumn+end+'"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane xSplit="1" ySplit="'+headers+'" topLeftCell="B'+(headers+1)+'" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="15" customWidth="1"/><col min="2" max="'+page.columns.length+'" width="'+width.toFixed(2)+'" customWidth="1"/></cols><sheetData>'+rows.join('')+'</sheetData><mergeCells count="2"><mergeCell ref="A1:'+lastColumn+'1"/><mergeCell ref="A2:'+lastColumn+'2"/></mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
 }
 function stylesXml(){return declaration+'<styleSheet xmlns="'+ns+'"><fonts count="3"><font><sz val="9"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF255F8C"/><name val="Calibri"/></font></fonts><fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF255F8C"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE9F2FB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4D6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE3BE"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCCD7DF"/></left><right style="thin"><color rgb="FFCCD7DF"/></right><top style="thin"><color rgb="FFCCD7DF"/></top><bottom style="thin"><color rgb="FFCCD7DF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';}
 function sheetNames(pages){
  const used=new Set(),truncate=(s,n)=>s.slice(0,n).replace(/[\uD800-\uDBFF]$/,'');
  return pages.map(page=>{
   const week=page.weekLabel==='Odd week'?'Odd':page.weekLabel==='Even week'?'Even':'Week';
   const base=(page.sheetName||(page.name+' '+week)).replace(/[\[\]:*?/\\\u0000-\u001F]/g,' ').replace(/^'+|'+$/g,'').trim()||'Timetable';
   let name=truncate(base,31),suffix=1;
   while(used.has(name.toLowerCase())){const tail=' ('+(++suffix)+')';name=truncate(base,31-tail.length)+tail;}
   used.add(name.toLowerCase());return name;
  });
 }
 // OOXML has no reliable consumer-side AutoFit for wrapped or merged cells.
 // Fit the final serialized content against its actual column widths and font sizes.
 function fitWorksheetRows(doc,styles,wrapStyles=new Map()){
  const nodes=(root,name)=>Array.from(root.getElementsByTagNameNS('*',name)),cols=nodes(doc,'col'),format=nodes(doc,'sheetFormatPr')[0],defaultWidth=Number(format?.getAttribute('defaultColWidth')||8.43),rows=new Map(nodes(doc,'row').map(row=>[Number(row.getAttribute('r')),row])),fonts=nodes(styles,'fonts')[0]?.children||[],xfsNode=nodes(styles,'cellXfs')[0],xfs=xfsNode?.children||[];
  const address=ref=>{const match=/^([A-Z]+)(\d+)$/.exec(ref||'');if(!match)return null;return {col:[...match[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0),row:Number(match[2])};};
  const merges=new Map(nodes(doc,'mergeCell').map(node=>{const [a,b]=node.getAttribute('ref').split(':').map(address);return a&&b?[a.col+'|'+a.row,{a,b}]:null;}).filter(Boolean)),widthCache=new Map();
  const width=col=>{if(!widthCache.has(col))widthCache.set(col,Number(cols.find(entry=>col>=Number(entry.getAttribute('min'))&&col<=Number(entry.getAttribute('max')))?.getAttribute('width')||defaultWidth));return widthCache.get(col);};
  const visual=text=>[...text].reduce((n,ch)=>n+(/[\u2E80-\u9FFF\uAC00-\uD7AF]/.test(ch)?2:/[MW@#%&]/.test(ch)?1.4:/[ilI1 .,;:'`|!]/.test(ch)?.6:1),0);
  const heights=new Map([...rows].map(([n,row])=>[n,Number(row.getAttribute('ht')||format?.getAttribute('defaultRowHeight')||15)]));
  const enableWrap=(cell,styleId,xf)=>{
   if(!xf||!xfsNode||['1','true'].includes(nodes(xf,'alignment')[0]?.getAttribute('wrapText')))return;
   if(!wrapStyles.has(styleId)){
    const wrapped=xf.cloneNode(true);wrapped.setAttribute('applyAlignment','1');let alignment=nodes(wrapped,'alignment')[0];
    if(!alignment){alignment=styles.createElementNS(ns,'alignment');wrapped.insertBefore(alignment,[...wrapped.children].find(node=>['protection','extLst'].includes(node.localName))||null);}
    alignment.setAttribute('wrapText','1');alignment.removeAttribute('shrinkToFit');const id=xfs.length;xfsNode.append(wrapped);xfsNode.setAttribute('count',String(xfs.length));wrapStyles.set(styleId,id);
   }
   cell.setAttribute('s',String(wrapStyles.get(styleId)));
  };
  for(const cell of nodes(doc,'c')){
   const text=nodes(cell,'t').map(t=>t.textContent||'').join('');if(!text)continue;
   const at=address(cell.getAttribute('r'));if(!at)continue;const merge=merges.get(at.col+'|'+at.row),end=merge?.b||at,styleId=Number(cell.getAttribute('s')||0),xf=xfs[styleId],font=fonts[Number(xf?.getAttribute('fontId')||0)],size=Math.max(Number(nodes(font||styles,'sz')[0]?.getAttribute('val')||11),...nodes(cell,'sz').map(node=>Number(node.getAttribute('val')||11)));
   let characters=0;for(let col=at.col;col<=end.col;col++)characters+=width(col);characters=Math.max(3,(characters-1.5)*11/size*.9);
   const lines=text.split(/\r?\n/).reduce((n,line)=>n+Math.max(1,Math.ceil(visual(line)/characters)),0),required=Math.ceil((lines*Math.max(12,size*1.35)+5)/(end.row-at.row+1));
   if(lines>1)enableWrap(cell,styleId,xf);
   for(let row=at.row;row<=end.row;row++)if(rows.has(row))heights.set(row,Math.min(409,Math.max(heights.get(row),required)));
  }
  for(const [n,height] of heights){rows.get(n).setAttribute('ht',String(height));rows.get(n).setAttribute('customHeight','1');}
 }
 async function fitWorkbookRows(zip){
  if(typeof DOMParser==='undefined'||typeof XMLSerializer==='undefined')return;
  const parse=text=>new DOMParser().parseFromString(text,'application/xml'),styles=parse(await zip.file('xl/styles.xml').async('string')),serializer=new XMLSerializer(),wrapStyles=new Map();
  for(const path of Object.keys(zip.files).filter(path=>/^xl\/worksheets\/sheet\d+\.xml$/.test(path))){const doc=parse(await zip.file(path).async('string'));fitWorksheetRows(doc,styles,wrapStyles);zip.file(path,serializer.serializeToString(doc));}
  zip.file('xl/styles.xml',serializer.serializeToString(styles));
 }
 async function fitWorkbook(output){
  const zip=await JSZip.loadAsync(await output.blob.arrayBuffer());await fitWorkbookRows(zip);return {...output,blob:await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',compression:'DEFLATE'})};
 }
 async function makeWorkbook(pages){
  if(!Array.isArray(pages)||!pages.length)throw Error('There are no timetables to export.');
  const names=sheetNames(pages),zip=new JSZip(),relationships='http://schemas.openxmlformats.org/package/2006/relationships';
  zip.file('[Content_Types].xml',declaration+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+pages.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>');
  zip.file('_rels/.rels',declaration+'<Relationships xmlns="'+relationships+'"><Relationship Id="rId1" Type="'+rel+'/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml',declaration+'<workbook xmlns="'+ns+'" xmlns:r="'+rel+'"><bookViews><workbookView activeTab="0"/></bookViews><sheets>'+names.map((name,i)=>'<sheet name="'+xml(name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets><definedNames>'+names.map((name,i)=>{
   const sheet="'"+name.replace(/'/g,"''")+"'!";
   const headers=periodHeaderRows(pages[i]);
   return '<definedName name="_xlnm.Print_Area" localSheetId="'+i+'">'+xml(sheet+'$A$1:$'+column(pages[i].columns.length-1)+'$'+(pages[i].rows.length+headers))+'</definedName><definedName name="_xlnm.Print_Titles" localSheetId="'+i+'">'+xml(sheet+'$1:$'+headers)+'</definedName>';
  }).join('')+'</definedNames></workbook>');
  zip.file('xl/_rels/workbook.xml.rels',declaration+'<Relationships xmlns="'+relationships+'">'+pages.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+rel+'/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+'<Relationship Id="rId'+(pages.length+1)+'" Type="'+rel+'/styles" Target="styles.xml"/></Relationships>');
  zip.file('xl/styles.xml',stylesXml());
  pages.forEach((page,i)=>zip.file('xl/worksheets/sheet'+(i+1)+'.xml',sheetXml(page)));
  await fitWorkbookRows(zip);
  return {blob:await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',compression:'DEFLATE'}),sheetNames:names};
 }
 function dailyRelief(data){
  if(!data||!Array.isArray(data.periods)||!Array.isArray(data.rows))throw Error('The relief export is unavailable.');
  return {name:'Relief '+data.date,sheetName:'Relief '+data.date,periodColumnWidth:12,weekLabel:'',title:'GSiS Daily Relief · '+data.date,subtitle:data.legend+' Allocation revision '+data.allocationRevision+'. Exported '+data.exportedAt,columns:['Absent teacher / activity',...data.periods.map(p=>'P'+p.period+'\n'+p.start+'\n'+p.end)],periods:data.periods,rows:data.rows.map(row=>({day:row.name,cells:data.periods.map((p,i)=>String(row.cells[i]?.text||'')),styles:data.periods.map((p,i)=>['draft','no-relief'].includes(row.cells[i]?.status)?6:row.cells[i]?.status==='unassigned'?7:5)}))};
 }
 return {datedBaseline,reliefPages,comparisonPages,dailyRelief,dayModel,dayPages,names,pages,tableHtml,makeWorkbook,fitWorkbook,fitWorkbookRows,fitWorksheetRows,fields,groupName};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=RosterExport;
