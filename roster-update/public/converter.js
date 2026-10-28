/* Extracted from the supplied Edupage to Roster Convertor v3.2. */
window.RosterConverter=(()=>{
function decodeQP(bytes){let s=new TextDecoder('utf-8').decode(bytes);const cut=s.search(/\r?\n\r?\n/);if(cut>=0)s=s.slice(cut).replace(/^\r?\n\r?\n/,'');s=s.replace(/=\r?\n/g,'');let out=[];for(let i=0;i<s.length;i++){if(s[i]==='='&&/^[0-9A-Fa-f]{2}$/.test(s.slice(i+1,i+3))){out.push(parseInt(s.slice(i+1,i+3),16));i+=2}else{const b=new TextEncoder().encode(s[i]);out.push(...b)}}return new TextDecoder('utf-8').decode(new Uint8Array(out))}
function rawCellLines(td){if(!td||!td.textContent.trim())return [''];const copy=td.cloneNode(true);for(const br of copy.querySelectorAll('br'))br.replaceWith('\n');return (copy.textContent||'').replace(/\r\n?/g,'\n').split('\n').map(v=>v.trim());}
function looksLikeTimeLine(v){return /^\s*\d{1,2}:\d{2}\s*(?:am|pm)?\s*[-–—]\s*\d{1,2}:\d{2}\s*(?:am|pm)?\s*$/i.test(String(v||''))}
function extractWeekdayName(v){const m=String(v||'').match(/\b(Monday|Tuesday|Wednesday|Thursday|Friday)\s*$/i);return m?m[1].charAt(0).toUpperCase()+m[1].slice(1).toLowerCase():''}
function importTiming(maxPeriod){return {startMinutes:420,periodMinutes:30,endOfDayMinutes:810,normalLastPeriod:maxPeriod};}
// Spans belong to a single table. Repeated logical cells retain the same source
// object, so a rowspan cannot create a second lesson or leak into another teacher.
function htmlRows(table){
 const physical=[...table.rows],grid=[];let occupied=0;
 if(physical.length>12000)throw Error('The timetable contains too many rows.');
 physical.forEach((row,r)=>{
  grid[r]??=[];let col=0;
  for(const td of row.cells){
   while(grid[r][col])col++;
   const across=td.colSpan||1,down=td.rowSpan===0?[...row.parentElement.rows].length-[...row.parentElement.rows].indexOf(row):td.rowSpan||1;
   if(col+across>401||r+down>physical.length||(occupied+=across*down)>2000000)throw Error('Invalid or oversized merged timetable cells.');
   const cell={td,row:r,col,across,down};
   for(let y=r;y<r+down;y++)for(let x=col;x<col+across;x++){
    grid[y]??=[];if(grid[y][x])throw Error('Overlapping merged timetable cells.');grid[y][x]=cell;
   }
   col+=across;
  }
 });return grid;
}
function parseSource(buf){
 let text=new TextDecoder('utf-8').decode(buf);if(/Content-Transfer-Encoding:\s*quoted-printable/i.test(text))text=decodeQP(buf);
 const doc=new DOMParser().parseFromString(text,'text/html'),tables=[...doc.querySelectorAll('table')];
 if(!tables.length)throw Error('No timetable table was found. Use the original Teachers Summary export.');
 if(tables.some(t=>t.querySelector('table')))throw Error('Nested timetable tables are not supported. Use the original Teachers Summary export.');
 const rows=tables.flatMap(htmlRows);if(rows.length<3)throw Error('The timetable does not contain the expected header and teacher rows.');
 const header1=rows[0],header2=rows[1],label=c=>(c?.td.textContent||'').trim(),expandedHead=header1.map((c,i)=>c.col===i?label(c):'');
 const periods=header2.slice(1).map(label).filter(v=>/^\d+$/.test(v)).map(Number);
 if(!periods.length)throw Error('No numeric periods were found in the timetable header.');
 const maxPeriod=Math.max(...periods),perDay=maxPeriod+1,weekCols=5*perDay,doubleNeeded=1+2*weekCols,singleNeeded=1+weekCols;
 if(!Number.isInteger(perDay)||perDay<1||perDay>40)throw Error('Expected between 1 and 40 periods per day.');
 const oddHeads=expandedHead.slice(1,1+weekCols).filter(Boolean),evenHeads=expandedHead.slice(1+weekCols,1+2*weekCols).filter(Boolean),expectedDays=['Monday','Tuesday','Wednesday','Thursday','Friday'];
 const hasOddEven=header2.length===doubleNeeded&&oddHeads.length===5&&evenHeads.length===5&&oddHeads.every((x,i)=>/^Odd\s*-\s*/i.test(x)&&extractWeekdayName(x)===expectedDays[i])&&evenHeads.every((x,i)=>/^Even\s*-\s*/i.test(x)&&extractWeekdayName(x)===expectedDays[i]);
 const singleDays=expandedHead.slice(1,singleNeeded).filter(Boolean).map(extractWeekdayName),hasSingleWeek=header2.length===singleNeeded&&singleDays.length===5&&singleDays.every((d,i)=>d===expectedDays[i]);
 let layoutMode,totalNeeded;if(hasOddEven){layoutMode='odd-even';totalNeeded=doubleNeeded;}else if(hasSingleWeek){layoutMode='single-week';totalNeeded=singleNeeded;}else throw Error('Could not recognise the timetable layout. Expected five Monday–Friday headings, or five Odd and five Even headings.');
 for(let i=1;i<totalNeeded;i++)if(label(header2[i])!==String((i-1)%perDay))throw Error('Period numbers must start at 0 and be consecutive for each day.');
 const teachers=[],names=new Map(),owners=new Map(),fieldCache=new Map();let hasTimeRow=false;
 const read=cell=>{if(!fieldCache.has(cell)){const lines=rawCellLines(cell.td);if(lines.length===5&&looksLikeTimeLine(lines[4]))hasTimeRow=true;fieldCache.set(cell,lessonFields(lines,'Timetable cell'));}return fieldCache.get(cell);};
 for(const cells of rows.slice(2)){
  if(!cells.length)continue;
  const name=label(cells[0]);
  if(!name){if(cells.slice(1).some(label))throw Error('Lesson data is missing its teacher name.');continue;}
  const nameCell=cells[0];if(nameCell.col!==0||nameCell.across!==1)throw Error('The teacher name must occupy its own column.');
  if(cells.length<totalNeeded||Array.from({length:totalNeeded},(_,c)=>cells[c]).some(c=>!c))throw Error('Incomplete teacher row: '+name);
  if(cells.slice(totalNeeded).some(label))throw Error('Unexpected data after teacher row: '+name);
  let teacher=names.get(nameCell);
  if(!teacher){teacher={name,shade:/xl2/.test(nameCell.td.className)?'light':'dark',vals:Array.from({length:totalNeeded},()=>[])};names.set(nameCell,teacher);teachers.push(teacher);}
  for(let c=1;c<totalNeeded;c++){
   const cell=cells[c];
   if(cell.col<1||Math.floor((cell.col-1)/perDay)!==Math.floor((cell.col+cell.across-2)/perDay))throw Error('A merged lesson crosses a day boundary: '+name);
   if(owners.has(cell)&&owners.get(cell)!==teacher)throw Error('A merged lesson crosses teacher rows: '+name);owners.set(cell,teacher);
   const fields=read(cell);if(fields.some(Boolean)&&!teacher.vals[c].some(v=>v.every((s,i)=>s===fields[i])))teacher.vals[c].push(fields);
  }
 }
 if(!teachers.length)throw Error('No teacher rows were found.');
 const makeWeek=start=>({days:expectedDays.slice(),maxPeriod,perDay,blocks:teachers.map(t=>({name:t.name,shade:t.shade,cells:t.vals.slice(start,start+weekCols)}))});
 const model=layoutMode==='single-week'?{layoutMode,single:makeWeek(1)}:{layoutMode,odd:makeWeek(1),even:makeWeek(1+weekCols)};
 return finishImport({...model,teacherCount:teachers.length,maxPeriod,timing:importTiming(maxPeriod),sourceMode:hasTimeRow?'five-line-time':'legacy-four-line'});
}
// Parser candidates are not an accepted baseline. Conflicting slots stay blank
// until the user explicitly resolves them; only resolveClashes returns save data.
function finishImport(model){
 const clashes=[];
 for(const key of model.layoutMode==='single-week'?['single']:['odd','even'])model[key].blocks.forEach((b,teacherIndex)=>{
  b.cells=b.cells.map((options,cellIndex)=>{
   if(options.length>1)clashes.push({id:key+':'+teacherIndex+':'+cellIndex,week:key,teacherIndex,cellIndex,teacher:b.name,day:model[key].days[Math.floor(cellIndex/model[key].perDay)],period:cellIndex%model[key].perDay,options:options.map(f=>f.slice())});
   return options.length===1?options[0].slice():['','','',''];
  });
 });
 if(clashes.length)model.importClashes=clashes;return validateParsed(model);
}
function resolveClashes(model,choices={}){
 const clashes=model.importClashes||[],missing=clashes.filter(c=>!Number.isInteger(choices[c.id])||!c.options[choices[c.id]]);
 if(missing.length){const c=missing[0];throw Error('Resolve '+missing.length+' lesson clash'+(missing.length===1?'':'es')+' before saving. '+c.teacher+', '+c.week+' week, '+c.day+', P'+c.period+'.');}
 if(!clashes.length)return validateParsed(model);
 const resolved=JSON.parse(JSON.stringify(model));delete resolved.importClashes;
 for(const c of clashes)resolved[c.week].blocks[c.teacherIndex].cells[c.cellIndex]=c.options[choices[c.id]].slice();
 return validateParsed(resolved);
}
// Import a workbook by its bytes, never by its filename. Keep parseSource's synchronous
// HTML contract for older callers; the file picker awaits this common entry point.
async function parseFile(buf){
 const bytes=buf instanceof Uint8Array?buf:new Uint8Array(buf);
 if(!bytes.length||bytes.length>8000000)throw Error('Choose a timetable file smaller than 8 MB.');
 if(bytes[0]===0x50&&bytes[1]===0x4b)return parseWorkbook(buf);
 if(bytes[0]===0xd0&&bytes[1]===0xcf)throw Error('This is an older binary Excel workbook. Save it as Excel Workbook (.xlsx), then import it again.');
 return parseSource(bytes);
}
const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const elements=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name));
function xmlDocument(text,label){
 if(/<!DOCTYPE/i.test(text))throw Error(label+': document declarations are not supported.');
 const doc=new DOMParser().parseFromString(text,'application/xml');
 if(elements(doc,'parsererror').length)throw Error(label+': invalid workbook XML.');
 return doc;
}
function cellPosition(ref){const m=/^([A-Z]{1,3})([1-9]\d*)$/.exec(ref||'');if(!m)throw Error('Invalid workbook cell reference.');let col=0;for(const c of m[1])col=col*26+c.charCodeAt(0)-64;const row=Number(m[2]);if(col>401||row>12000)throw Error('The timetable exceeds the supported row or period range.');return {row,col};}
function workbookPath(target){
 if(!target||/^[a-z]+:|\\/i.test(target))throw Error('External workbook sheets are not supported.');
 const parts=(target.startsWith('/')?target.slice(1):'xl/'+target).split('/'),out=[];
 for(const part of parts){if(part==='..'){if(!out.length)throw Error('Invalid workbook sheet path.');out.pop();}else if(part&&part!=='.')out.push(part);}
 if(out[0]!=='xl')throw Error('Invalid workbook sheet path.');return out.join('/');
}
function lessonFields(lines,where){
 let values=lines.map(v=>String(v??'').trim());
 while(values.length>4&&!values.at(-1))values.pop();
 if(values.length===5&&looksLikeTimeLine(values[4]))values.pop();
 if(values.length>4)throw Error(where+': ambiguous lesson rows. Use Subject, Class, Venue, Group, with an optional final timing row.');
 while(values.length<4)values.push('');return values;
}
function validateParsed(model){
 const weeks=model.layoutMode==='single-week'?[model.single]:[model.odd,model.even];let first=null;
 for(const week of weeks){
  const names=week.blocks.map(b=>b.name.trim().toLowerCase());
  if(!names.length||names.length>400||new Set(names).size!==names.length)throw Error('Duplicate or invalid teacher names. Correct the source before uploading.');
  if(first&&(week.perDay!==first.perDay||names.length!==first.names.length||names.some((n,i)=>n!==first.names[i])))throw Error('Odd and Even weeks must contain matching teachers and periods.');
  for(const b of week.blocks)if(!b.name.trim()||b.name.length>160||b.cells.length!==5*week.perDay||b.cells.some(c=>c.length!==4||c.some(v=>typeof v!=='string'||v.length>500)))throw Error('Incomplete or oversized teacher timetable.');
  first={perDay:week.perDay,names};
 }
 return model;
}
async function parseWorkbook(bytes){
 let zip;try{zip=await JSZip.loadAsync(bytes);}catch{throw Error('The Excel workbook could not be read. Save it as .xlsx and try again.');}
 const files=Object.values(zip.files);if(files.length>500||files.reduce((n,f)=>n+(f._data?.uncompressedSize||0),0)>80000000)throw Error('The expanded workbook is too large. Export only the teacher timetable.');
 async function xml(path){const f=zip.file(path);if(!f)throw Error('Missing workbook part: '+path);if(f._data?.uncompressedSize>40000000)throw Error('The timetable worksheet is too large.');const text=await f.async('string');if(text.length>40000000)throw Error('The timetable worksheet is too large.');return xmlDocument(text,path);}
 const [book,rels]=await Promise.all([xml('xl/workbook.xml'),xml('xl/_rels/workbook.xml.rels')]);
 const links=new Map(elements(rels,'Relationship').map(r=>[r.getAttribute('Id'),r]));
 const sharedFile=zip.file('xl/sharedStrings.xml'),strings=sharedFile?elements(await xml('xl/sharedStrings.xml'),'si').map(si=>elements(si,'t').map(t=>t.textContent).join('')):[];
 const sheets=elements(book,'sheet');if(!sheets.length||sheets.length>12)throw Error('Expected one timetable sheet or an Odd Week and Even Week pair.');
 const parsed=[];
 for(const sheet of sheets){
  const name=sheet.getAttribute('name')||'Worksheet',rid=sheet.getAttribute('r:id')||sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),rel=links.get(rid);
  if(!rel||rel.getAttribute('TargetMode')==='External')throw Error(name+': invalid worksheet relationship.');
  const doc=await xml(workbookPath(rel.getAttribute('Target'))),cells=new Map(),merges=[];let lastRow=0;
  for(const c of elements(doc,'c')){
   const ref=c.getAttribute('r'),pos=cellPosition(ref),type=c.getAttribute('t'),v=elements(c,'v')[0];let value='';
   if(elements(c,'f').length)throw Error(name+' '+ref+': formulas are not supported in baseline imports. Paste their values first.');
   if(type==='inlineStr')value=elements(c,'t').map(t=>t.textContent).join('');
   else if(type==='s'){if(!v||!/^\d+$/.test(v.textContent)||strings[Number(v.textContent)]===undefined)throw Error(name+' '+ref+': invalid shared text.');value=strings[Number(v.textContent)];}
   else if(type==='e')throw Error(name+' '+ref+': an Excel cell contains an error.');
   else value=v?.textContent||'';
   cells.set(pos.row+':'+pos.col,value.replace(/\r\n?/g,'\n').split('\n').map(v=>v.trim()).join('\n'));lastRow=Math.max(lastRow,pos.row);
  }
  for(const m of elements(doc,'mergeCell')){const [a,b]=String(m.getAttribute('ref')).split(':').map(cellPosition);if(!b||a.row>b.row||a.col>b.col)throw Error(name+': invalid merged cells.');merges.push({a,b});lastRow=Math.max(lastRow,b.row);}
  const get=(r,c)=>{const value=cells.get(r+':'+c)||'';return value.trim()?value:'';};
  const headerRows=[];for(let r=1;r<Math.min(lastRow,60);r++)if(Array.from({length:400},(_,i)=>get(r,i+2)).filter(v=>extractWeekdayName(v)).length>=5)headerRows.push(r);
  if(!headerRows.length)continue; // A cover/notes sheet cannot become a teacher sheet.
  if(headerRows.length!==1)throw Error(name+': more than one timetable header was found.');
  const head=headerRows[0],headings=[];let periodRow=head+1;
  for(let c=2;c<=401;c++)if(extractWeekdayName(get(head,c)))headings.push({col:c,text:get(head,c),day:extractWeekdayName(get(head,c))});
  if(![5,10].includes(headings.length)||headings[0].col!==2)throw Error(name+': expected five weekday headings or Odd/Even weekday headings.');
  const perDay=headings[1].col-2,count=headings.length,total=count*perDay;
  if(perDay<1||perDay>40||headings.some((h,i)=>h.col!==2+i*perDay||h.day!==weekdays[i%5]))throw Error(name+': weekday columns do not form a complete Monday–Friday timetable.');
  if(count===10&&headings.some((h,i)=>!(i<5?/^Odd\s*[-–:]?\s*/i:/^Even\s*[-–:]?\s*/i).test(h.text)))throw Error(name+': label the two sets of weekdays Odd and Even.');
  if(get(periodRow,1)==='Start / End'&&Array.from({length:total},(_,c)=>get(periodRow,c+2)).every(value=>value==='Time unavailable'||/^\d{2}:\d{2}\n\d{2}:\d{2}$/.test(value)))periodRow++;
  for(let c=0;c<total;c++)if(get(periodRow,c+2)!==String(c%perDay))throw Error(name+': period numbers must start at 0 and be consecutive for each day.');
  // Horizontal lesson merges represent the same field in consecutive periods.
  // A vertical merge across lesson fields is ambiguous, so never silently drop it.
  for(const m of merges.filter(m=>m.a.row>periodRow&&m.a.col>1)){
   if((m.a.row!==m.b.row&&!get(m.a.row,m.a.col).includes('\n'))||m.b.col>total+1||Math.floor((m.a.col-2)/perDay)!==Math.floor((m.b.col-2)/perDay))throw Error(name+': ambiguous merged lesson cells. Unmerge them while retaining their values.');
   const value=get(m.a.row,m.a.col);for(let r=m.a.row;r<=m.b.row;r++)for(let c=m.a.col;c<=m.b.col;c++){if(get(r,c)&&get(r,c)!==value)throw Error(name+': conflicting merged lesson values.');cells.set(r+':'+c,value);}
  }
  const starts=[];for(let r=periodRow+1;r<=lastRow;r++)if(get(r,1))starts.push(r);
  if(!starts.length||starts.length>400)throw Error(name+': no valid teacher blocks were found.');for(let r=periodRow+1;r<starts[0];r++)if(Array.from({length:total},(_,c)=>get(r,c+2)).some(Boolean))throw Error(name+': lesson data is missing its teacher name.');
  const blocks=[];let variable=false;
  for(let i=0;i<starts.length;i++){
   const start=starts[i],teacher=get(start,1),next=starts[i+1]||lastRow+1,merge=merges.find(m=>m.a.col===1&&m.a.row===start&&m.b.col===1);
   let end=merge?merge.b.row:next-1;
   if(end>=next)throw Error(name+': overlapping teacher rows for '+teacher+'.');
   if(!merge)while(end>start&&!Array.from({length:total},(_,c)=>get(end,c+2)).some(Boolean))end--;
   const height=end-start+1;if(height>12)throw Error(name+': ambiguous row block for '+teacher+'.');
   if(merges.some(m=>m.a.col>1&&m.a.row<=end&&m.b.row>=start&&(m.a.row<start||m.b.row>end)))throw Error(name+': a merged lesson crosses teacher rows.');
   const rowCells=[];
   for(let c=0;c<total;c++){
    const values=Array.from({length:height},(_,k)=>get(start+k,c+2));
    const where=name+', '+teacher+', '+colName(c+2),nonempty=values.filter(Boolean),multiline=nonempty.some(v=>v.includes('\n'));
    if(multiline&&nonempty.some(v=>!v.includes('\n')))throw Error(where+': ambiguous mixed lesson fields.');
    const options=multiline?[...new Set(nonempty)].map(v=>lessonFields(v.split('\n'),where)):[lessonFields(values,where)];
    rowCells.push(options.filter(f=>f.some(Boolean)));
   }
   // Empty spacer rows are harmless; data outside the declared name block is not.
   for(let r=end+1;r<next;r++)if(Array.from({length:total},(_,c)=>get(r,c+2)).some(Boolean))throw Error(name+': unnamed lesson data after '+teacher+'.');
   if(height!==4)variable=true;
   blocks.push({name:teacher,shade:i%2?'light':'dark',cells:rowCells});
  }
  for(const [key,value] of cells){if(!value.trim())continue;const [r,c]=key.split(':').map(Number);if(r>=periodRow&&c>total+1)throw Error(name+': unexpected data beyond the timetable period columns.');}
  const week=offset=>({days:weekdays.slice(),perDay,maxPeriod:perDay-1,blocks:blocks.map(b=>({...b,cells:b.cells.slice(offset,offset+5*perDay)}))});
  parsed.push({name,variable,count,single:week(0),...(count===10?{odd:week(0),even:week(5*perDay)}:{})});
 }
 if(!parsed.length)throw Error('No teacher timetable was found. Expected weekday headings, a period row and teacher names in column A.');
 let model;
 if(parsed.length===1){const p=parsed[0];if(p.count===5&&/^(?:odd|even)(?:\s+week)?$/i.test(p.name.trim()))throw Error('Both Odd Week and Even Week sheets are required.');model=p.count===10?{layoutMode:'odd-even',odd:p.odd,even:p.even}:{layoutMode:'single-week',single:p.single};}
 else if(parsed.length===2){const odd=parsed.find(p=>/^odd(?:\s+week)?$/i.test(p.name.trim())),even=parsed.find(p=>/^even(?:\s+week)?$/i.test(p.name.trim()));if(!odd||!even||parsed.some(p=>p.count!==5))throw Error('Use one timetable sheet, or sheets named Odd Week and Even Week.');
  const byName=new Map(even.single.blocks.map(b=>[b.name.trim().toLowerCase(),b]));if(byName.size!==even.single.blocks.length||odd.single.blocks.length!==even.single.blocks.length||odd.single.blocks.some(b=>!byName.has(b.name.trim().toLowerCase())))throw Error('Odd and Even weeks must contain matching teachers.');
  even.single.blocks=odd.single.blocks.map(b=>({...byName.get(b.name.trim().toLowerCase()),name:b.name}));model={layoutMode:'odd-even',odd:odd.single,even:even.single};
 }else throw Error('Use one timetable sheet, or an Odd Week and Even Week pair.');
 const week=model.single||model.odd;return finishImport({...model,teacherCount:week.blocks.length,maxPeriod:week.maxPeriod,timing:importTiming(week.maxPeriod),sourceMode:parsed.some(p=>p.variable)?'xlsx-variable-row':'xlsx-four-row'});
}
function sameWeeks(a,b){if(a.maxPeriod!==b.maxPeriod||a.days.join('\u0001')!==b.days.join('\u0001')||a.blocks.length!==b.blocks.length)return false;for(let i=0;i<a.blocks.length;i++){if(a.blocks[i].name!==b.blocks[i].name)return false;for(let c=0;c<a.blocks[i].cells.length;c++)if(a.blocks[i].cells[c].join('\u0002')!==b.blocks[i].cells[c].join('\u0002'))return false}return true}
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');function colName(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
function buildSheetXml(week,timing){const cols=1+5*week.perDay;let rows=[],merges=[];function cell(r,c,v,style,type='inlineStr'){if(v===''||v==null)return `<c r="${colName(c)}${r}" s="${style}"/>`;return `<c r="${colName(c)}${r}" s="${style}" t="${type}"><is><t${/^\s|\s$/.test(String(v))?' xml:space="preserve"':''}>${esc(v)}</t></is></c>`}
rows.push(`<row r="1" ht="22" customHeight="1">${cell(1,1,'Summary timetable of teachers',1)}</row>`);rows.push(`<row r="2" ht="8" customHeight="1">${cell(2,1,'',2)}</row>`);let r3=cell(3,1,'',3);for(let d=0;d<5;d++){const c=2+d*week.perDay;r3+=cell(3,c,week.days[d]||'',3);merges.push(`${colName(c)}3:${colName(c+week.perDay-1)}3`)}rows.push(`<row r="3" ht="20" customHeight="1">${r3}</row>`);const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'),validTiming=Number.isInteger(timing?.startMinutes)&&timing.startMinutes>=0&&Number.isInteger(timing?.periodMinutes)&&timing.periodMinutes>0&&timing.startMinutes+week.perDay*timing.periodMinutes<=1440;
let times=cell(4,1,'Start / End',24);for(let d=0;d<5;d++)for(let p=0;p<week.perDay;p++)times+=cell(4,2+d*week.perDay+p,validTiming?clock(timing.startMinutes+p*timing.periodMinutes)+'\n'+clock(timing.startMinutes+(p+1)*timing.periodMinutes):'Time unavailable',24);rows.push(`<row r="4" ht="32" customHeight="1">${times}</row>`);
let r5=cell(5,1,'Teacher',3);for(let d=0;d<5;d++)for(let p=0;p<week.perDay;p++)r5+=cell(5,2+d*week.perDay+p,p,3);rows.push(`<row r="5" ht="18" customHeight="1">${r5}</row>`);
let rr=6;week.blocks.forEach((b,teacherIndex)=>{const grey=teacherIndex%2===1;for(let line=0;line<4;line++){let xml='';const teacherStyle=(grey?8:12)+line;xml+=cell(rr+line,1,line===0?b.name:'',teacherStyle);for(let c=0;c<b.cells.length;c++){const v=b.cells[c][line]||'';const tileStyle=(grey?16:20)+line;xml+=cell(rr+line,c+2,v,tileStyle)}rows.push(`<row r="${rr+line}" ht="14.25" customHeight="1">${xml}</row>`)}merges.push(`A${rr}:A${rr+3}`);rr+=4});
const widths=[];const weekCols=5*week.perDay;for(let c=0;c<weekCols;c++){let longest=String(c%week.perDay).length;for(const b of week.blocks){for(const line of b.cells[c])longest=Math.max(longest,String(line||'').length)}widths.push(Math.max(10.5,Math.min(20.5,4.8+longest*.72)))}let colsXml='<cols><col min="1" max="1" width="20.5" customWidth="1"/>'+widths.map((w,i)=>`<col min="${i+2}" max="${i+2}" width="${w.toFixed(2)}" customWidth="1"/>`).join('')+'</cols>';return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="5" xSplit="1" topLeftCell="B6" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${colsXml}<sheetData>${rows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map(x=>`<mergeCell ref="${x}"/>`).join('')}</mergeCells><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`}
function stylesXml(){const noBorder='<border><left/><right/><top/><bottom/><diagonal/></border>',fullBorder='<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>',tileTop='<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom/><diagonal/></border>',tileMiddle='<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top/><bottom/><diagonal/></border>',tileBottom='<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top/><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>';let xfs=[];const add=(fill,align='left',bold=0,borderId=0,vertical='center')=>xfs.push(`<xf numFmtId="0" fontId="${bold?1:0}" fillId="${fill}" borderId="${borderId}" xfId="0" applyAlignment="1" applyFill="1" applyBorder="1" applyFont="1"><alignment horizontal="${align}" vertical="${vertical}" wrapText="0"/></xf>`);
add(0,'left');add(0,'left',1);add(0,'left');add(0,'center',1,1);add(0,'center',1,1);add(0,'left');add(0,'left');add(0,'center',1,1);
for(const fill of [2,0]){add(fill,'center',1,2);add(fill,'center',1,3);add(fill,'center',1,3);add(fill,'center',1,4)}
for(const fill of [2,0]){add(fill,'left',0,2);add(fill,'left',0,3);add(fill,'left',0,3);add(fill,'left',0,4)}
add(0,'center',1,1);xfs[xfs.length-1]=xfs[xfs.length-1].replace('wrapText="0"','wrapText="1"');
return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE0E0E0"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="5">${noBorder}${fullBorder}${tileTop}${tileMiddle}${tileBottom}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`}
async function makeWorkbook(parsed,options={}){parsed=resolveClashes(parsed);let sheets,identical=false,singleWeek=parsed.layoutMode==='single-week';if(singleWeek){sheets=[['Teachers',parsed.single]]}else{identical=sameWeeks(parsed.odd,parsed.even);sheets=identical&&!options.preserveWeeks?[['Teachers',parsed.odd]]:[['Odd Week',parsed.odd],['Even Week',parsed.even]]}const zip=new JSZip();zip.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);zip.folder('_rels').file('.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);zip.folder('xl').file('workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${esc(s[0])}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><definedNames>${sheets.map((s,i)=>`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${esc("'"+s[0].replace(/'/g,"''")+"'!$1:$5")}</definedName>`).join('')}</definedNames></workbook>`).file('styles.xml',stylesXml()).folder('_rels').file('workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);const ws=zip.folder('xl').folder('worksheets');sheets.forEach((s,i)=>ws.file(`sheet${i+1}.xml`,buildSheetXml(s[1],parsed.timing)));return {blob:await zip.generateAsync({type:'blob',compression:'DEFLATE'}),identical,singleWeek,sheetNames:sheets.map(x=>x[0])}}

return {parseSource,parseFile,makeWorkbook,sameWeeks,resolveClashes};})();
