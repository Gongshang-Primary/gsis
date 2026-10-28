/* Editable spatial layout, based on the supplied Layout Example workbook. */
(()=>{
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 let templateFlight;
 const parse=s=>new DOMParser().parseFromString(s,'application/xml');
 const serialize=d=>new XMLSerializer().serializeToString(d);
 const children=(p,tag)=>[...p.getElementsByTagNameNS(ns,tag)];
 const range=ref=>{const [a,b=a]=ref.split(':');const cell=s=>{const m=s.match(/^([A-Z]+)(\d+)$/);return [m[1].split('').reduce((v,c)=>v*26+c.charCodeAt(0)-64,0),+m[2]]};return [...cell(a),...cell(b)]};
 const name=c=>{let s='';for(;c;c=Math.floor((c-1)/26))s=String.fromCharCode(65+(c-1)%26)+s;return s};
 function build(template,snapshot){
  const {rooms=[],colors={},title='',date='',version}=snapshot;
  const ids=new Map();for(const r of rooms)ids.set(r.id,(ids.get(r.id)||0)+1);
  const files=Object.fromEntries(Object.entries(template.files).map(([k,v])=>[k,typeof v==='string'?v:Uint8Array.from(atob(v.base64),c=>c.charCodeAt(0))]));
  const sheet=parse(files['xl/worksheets/sheet1.xml']),styles=parse(files['xl/styles.xml']),book=parse(files['xl/workbook.xml']);
  for(const f of children(sheet,'f'))f.remove(); // Discard empty legacy shared-formula placeholders too.
  const data=children(sheet,'sheetData')[0],merges=children(sheet,'mergeCells')[0],fills=children(styles,'fills')[0],xfs=children(styles,'cellXfs')[0];
  const create=(doc,tag,attrs={})=>{const prefix=doc.documentElement.prefix,n=doc.createElementNS(ns,prefix?prefix+':'+tag:tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n};
  const rowMap=new Map(children(data,'row').map(r=>[+r.getAttribute('r'),r]));
  const row=r=>{if(!rowMap.has(r)){const n=create(sheet,'row',{r,ht:15,customHeight:1});data.append(n);rowMap.set(r,n);}return rowMap.get(r)};
  const cellMap=new Map(children(data,'c').map(c=>[c.getAttribute('r'),c]));
  const cell=address=>{if(!cellMap.has(address)){const c=create(sheet,'c',{r:address});row(range(address)[1]).append(c);cellMap.set(address,c);}return cellMap.get(address)};
  const text=(address,value,boldFirstLine=false)=>{const c=cell(address);c.replaceChildren();c.setAttribute('t','inlineStr');const is=create(sheet,'is'),clean=String(value).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
   const append=(parent,value)=>{const t=create(sheet,'t');t.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');t.textContent=value;parent.append(t);};
   if(boldFirstLine){const end=clean.indexOf('\n'),first=end<0?clean:clean.slice(0,end),rest=end<0?'':clean.slice(end);for(const [value,bold] of [[first,true],[rest,false]])if(value){const run=create(sheet,'r'),props=create(sheet,'rPr');props.append(create(sheet,'b',{val:bold?'1':'0'}));run.append(props);append(run,value);is.append(run);}}
   else append(is,clean);c.append(is);
  };
  const styleCache=new Map(),fillCache=new Map();
  function paint(c,color){
   const candidate=String(color||'#ffffff').replace('#','').toUpperCase(),rgb=/^[0-9A-F]{6}$/.test(candidate)?candidate:'FFFFFF';
   if(!fillCache.has(rgb)){const f=create(styles,'fill'),p=create(styles,'patternFill',{patternType:'solid'});p.append(create(styles,'fgColor',{rgb:'FF'+rgb}),create(styles,'bgColor',{indexed:64}));f.append(p);fillCache.set(rgb,fills.children.length);fills.append(f);}
   const base=Number(c.getAttribute('s')||0),key=base+'|'+rgb;if(!styleCache.has(key)){const xf=xfs.children[base].cloneNode(true);xf.setAttribute('fillId',fillCache.get(rgb));xf.setAttribute('applyFill','1');styleCache.set(key,xfs.children.length);xfs.append(xf);}c.setAttribute('s',styleCache.get(key));
  }
  const canvas=document.createElement('canvas'),measure=canvas.getContext('2d');if(measure)measure.font='10pt Arial';
  const width=t=>measure?measure.measureText(t).width:String(t).length*7;
  const wrap=(value,pixels)=>String(value).split('\n').flatMap(line=>{const lines=[];while(width(line)>pixels&&line.length>1){let cut=line.length;while(cut>1&&width(line.slice(0,cut))>pixels)cut--;const space=line.lastIndexOf(' ',cut);if(space>0)cut=space;lines.push(line.slice(0,cut));line=line.slice(cut).trimStart();}return [...lines,line]});
  const height=r=>Number(row(r).getAttribute('ht')||15),setHeight=(r,h)=>{row(r).setAttribute('ht',Math.min(409,h));row(r).setAttribute('customHeight','1')};
  function put(ref,labels,color){
   const [c1,r1,c2,r2]=range(ref),lines=labels.flatMap(v=>wrap(v,(c2-c1+1)*70-8));
   text(name(c1)+r1,labels.join('\n'),labels.length>1);
   for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++)paint(cell(name(c)+r),color);
   const actual=Array.from({length:r2-r1+1},(_,i)=>height(r1+i)).reduce((a,b)=>a+b,0),needed=lines.length*13+8;
   if(needed>actual)for(let r=r1;r<=r2;r++)setHeight(r,height(r)+(needed-actual)/(r2-r1+1));
  }
  const roomColors=Object.fromEntries(Object.entries(template.placements).map(([id,ref])=>{const style=xfs.children[Number(cell(ref.split(':')[0]).getAttribute('s')||0)],fill=fills.children[Number(style.getAttribute('fillId')||0)],rgb=children(fill,'fgColor')[0]?.getAttribute('rgb');return [id,rgb&&rgb.length===8?'#'+rgb.slice(2):'#ffffff'];}));
  paint(cell('I64'),'#ffffff');
  for(const ref of Object.values(template.placements)){const [c1,r1,c2,r2]=range(ref);for(let r=r1;r<=r2;r++)for(let c=c1;c<=c2;c++)paint(cell(name(c)+r),'#ffffff');}
  const roomName=r=>r.name==='Classroom'?r.shortName||r.short||'':r.name||'';
  const labels=r=>[...(roomName(r)?[roomName(r)]:[]),...String(r.form||'').split(/,\s*/).filter(Boolean),...(r.groups||[]),r.id||'Venue number missing'];
  const placed=[],unmapped=[],counts=new Map();for(const r of rooms){const g=r.geometry||r.id;counts.set(g,(counts.get(g)||0)+1);}
  for(const r of rooms){const geometry=r.geometry||r.id,ref=template.placements[geometry];if(!r.id||ids.get(r.id)>1||!ref||counts.get(geometry)>1){unmapped.push(r);continue;}put(ref,labels(r),colors[r.level]||(!(r.name==='Classroom'||r.form||r.groups?.length)?roomColors[geometry]:'#ffffff'));placed.push({id:r.id,range:ref});}
  // Unknown/ambiguous geometry remains visible on this same sheet, never discarded or guessed.
  let lastRow=72;
  if(unmapped.length){text('B73','Venues without a unique map boundary');merges.append(create(sheet,'mergeCell',{ref:'B73:Q73'}));cell('B73').setAttribute('s',cell('A1').getAttribute('s'));lastRow=74;
   for(const r of unmapped){const ref='B'+lastRow+':Q'+(lastRow+1);merges.append(create(sheet,'mergeCell',{ref}));cell('B'+lastRow).setAttribute('s',cell('G4').getAttribute('s'));put(ref,labels(r),colors[r.level]||'#ffffff');lastRow+=2;}
  }
  text('A1',title+(version?' · '+version:''));text('O1','Updated '+date);
  // Export literal strings consistently; discard cached formula-string types
  // and unnecessary numeric types on styled blank template cells.
  const strings=files['xl/sharedStrings.xml']?children(parse(files['xl/sharedStrings.xml']),'si'):[];
  for(const c of children(data,'c')){
   const type=c.getAttribute('t'),value=children(c,'v')[0];
   if(type==='str')text(c.getAttribute('r'),value?.textContent||'');
   else if(type==='s'){const item=strings[Number(value?.textContent)];text(c.getAttribute('r'),item?children(item,'t').map(t=>t.textContent).join(''):value?.textContent||'');}
   else if(type==='n'&&!value)c.removeAttribute('t');
   else if(type==='inlineStr'&&value)value.remove();
  }
  for(const r of children(data,'row'))[...r.children].sort((a,b)=>range(a.getAttribute('r'))[0]-range(b.getAttribute('r'))[0]).forEach(c=>r.append(c));
  [...data.children].sort((a,b)=>Number(a.getAttribute('r'))-Number(b.getAttribute('r'))).forEach(r=>data.append(r));
  for(const n of children(sheet,'dimension'))n.remove();
  const end=Math.max(unmapped.length?lastRow-1:lastRow,...[...data.children].map(r=>Number(r.getAttribute('r'))));
  sheet.documentElement.prepend(create(sheet,'dimension',{ref:'A1:R'+end}));
  setHeight(1,Math.max(30,wrap(title+(version?' · '+version:''),860).length*14+6));
  // Fit one page across while allowing more pages down for dense allocations.
  for(const tag of ['pageSetup','pageMargins','printOptions','sheetPr'])for(const n of children(sheet,tag))n.remove();
  const props=create(sheet,'sheetPr');props.append(create(sheet,'pageSetUpPr',{fitToPage:1}));sheet.documentElement.prepend(props);
  sheet.documentElement.append(create(sheet,'printOptions',{horizontalCentered:1}),create(sheet,'pageMargins',{left:.25,right:.25,top:.25,bottom:.25,header:0,footer:0}),create(sheet,'pageSetup',{paperSize:8,orientation:'portrait',fitToWidth:1,fitToHeight:0}));
  // Page settings precede drawings in the worksheet schema.
  for(const drawing of children(sheet,'drawing'))sheet.documentElement.append(drawing);
  let names=children(book,'definedNames')[0];if(!names){names=create(book,'definedNames');book.documentElement.append(names);}const printArea=create(book,'definedName',{name:'_xlnm.Print_Area',localSheetId:0});printArea.textContent="'Layout'!$A$1:$R$"+end;names.append(printArea);
  for(const n of [fills,xfs,merges])n.setAttribute('count',n.children.length);
  files['xl/worksheets/sheet1.xml']=serialize(sheet);files['xl/styles.xml']=serialize(styles);files['xl/workbook.xml']=serialize(book);
  return {blob:window.GSISExcel.packageFiles(files),placed,unmapped:unmapped.map(r=>r.id)};
 }
 async function download(svg){
  const snapshot=svg?._gsisLayoutSnapshot;if(!snapshot)throw Error('Wait for the layout to finish loading.');
  if(!templateFlight)templateFlight=fetch('layout-excel-template.json?v=0.5.01').then(r=>{if(!r.ok)throw Error('Excel template could not load. Try again.');return r.json()}).catch(e=>{templateFlight=null;throw e});
  const result=build(await templateFlight,snapshot),url=URL.createObjectURL(result.blob),a=document.createElement('a');a.href=url;a.download=('GSiS Layout '+(snapshot.version||snapshot.title)).replace(/[\\/:*?"<>|]/g,'-')+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return result;
 }
 window.GSISLayoutExcel={build,download};
})();
