/* Table presentation and download only. No backend requests or stored staff data. */
(()=>{
 const states=new WeakMap(),spans=new WeakMap(),preferences=new Map();let scheduled=false;
 const ownRows=t=>[...t.rows],ignored='.resize-grip,.member-resize,.column-copy,.search-select,.search-picker,.inline-editor,.gsis-table-tools,[data-export-ignore]';
 function text(node,header=false){
  if(node.nodeType===3)return node.textContent;
  if(node.nodeType!==1||node.matches(ignored)||node.hidden||node.matches('script,style,svg,template'))return '';
  if(node.dataset.exportValue!==undefined)return node.dataset.exportValue;
  if(node.matches('[data-math-fallback]'))return node.dataset.mathFallback;
  if(node.tagName==='SELECT')return node.dataset.selectedUnit==='true'?(node.value||'Unassigned'):[...node.selectedOptions].map(x=>x.textContent).join(', ');
  if(node.tagName==='TEXTAREA')return node.value;
  if(node.tagName==='INPUT')return ['hidden','search','button','submit'].includes(node.type)?'':['checkbox','radio'].includes(node.type)?(node.checked?'Yes':'No'):node.value;
  if(node.tagName==='BUTTON'&&!header)return '';
  if(node.tagName==='BR')return '\n';
  if(node.classList.contains('katex'))return '';
  const content=[...node.childNodes].map(n=>text(n,header)).join('');
  if(!header&&content&&node.matches('.ability-badge,.role-badge,small.context,.workload-warning'))return '\n'+content+'\n';
  return content+(!header&&node.matches('.chip,small.context,.workload-warning,li,p,div,pre')&&content?'\n':'');
 }
 const clean=(n,h=false)=>text(n,h).replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim().replace(h?/\s*[↕▴▾▲▼]\s*$/:/\u0000/g,'');
 function grid(table){
  const rows=ownRows(table),matrix=[],cells=[];let width=0;
  rows.forEach((row,r)=>{matrix[r]||=[];let c=0;for(const cell of row.cells){while(matrix[r][c])c++;const saved=spans.get(cell),cs=saved?.cols||cell.colSpan||1,rs=saved?.rows||cell.rowSpan||1,entry={cell,row,r,c,cols:cs,rows:rs};cells.push(entry);for(let y=r;y<Math.min(rows.length,r+rs);y++){matrix[y]||=[];for(let x=c;x<c+cs;x++)matrix[y][x]=entry;}cell.dataset.gridColumn=c;c+=cs;width=Math.max(width,c);}});
  let head=rows.filter(r=>r.parentElement===table.tHead);
  for(const row of rows.slice(head.length)){if(row.cells.length&&[...row.cells].every(c=>c.tagName==='TH'))head.push(row);else break;}
  if(!head.length&&rows[0]?.querySelector('th'))head=[rows[0]];
  const headSet=new Set(head),labels=Array.from({length:width},(_,c)=>[...new Set(head.map(row=>matrix[rows.indexOf(row)]?.[c]?.cell).filter(Boolean))].map(n=>clean(n,true)).filter(Boolean).filter((s,i,a)=>!i||s!==a[i-1]).join(' / ')||'Column '+(c+1));
  return {rows,matrix,cells,width,headSet,labels};
 }
 function hidden(node){for(let p=node;p&&p!==document.documentElement;p=p.parentElement){if(p.hidden||p.classList.contains('hidden')||getComputedStyle(p).display==='none'||getComputedStyle(p).visibility==='hidden')return true;if(p.tagName==='DETAILS'&&!p.open&&p!==node&&!node.closest('summary'))return true;}return false;}
 function columnVisible(g,c){const heads=g.cells.filter(x=>g.headSet.has(x.row)&&c>=x.c&&c<x.c+x.cols);return heads.length?heads.every(x=>!hidden(x.cell)):g.cells.some(x=>x.c===c&&!hidden(x.cell));}
 function typed(value,label,cell){if(cell?.dataset.exportType==='text'||/name|alias|email|phone|mobile|ext\b|\bid\b|code|venue|class|TG|date|time|birthday/i.test(label))return value;const n=value.replace(/,/g,'');return /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(n)&&n.replace(/\D/g,'').length<=15?Number(n):value;}
 function snapshot(table){
  const g=grid(table),cols=Array.from({length:g.width},(_,i)=>i).filter(c=>columnVisible(g,c)&&!/(?:^|\/\s*)(?:actions?|delete|edit)$/i.test(g.labels[c]));
  // Blank action-only headers are not meaningful data columns.
  const selected=cols.filter(c=>!/^Column \d+$/.test(g.labels[c])||g.rows.some((r,i)=>!g.headSet.has(r)&&clean(g.matrix[i]?.[c]?.cell||document.createElement('span'))));
  const data=[];g.rows.forEach((row,r)=>{if(g.headSet.has(row)||hidden(row)||row.classList.contains('column-filters')||row.dataset.exportIgnore!==undefined)return;const entries=selected.map(c=>g.matrix[r]?.[c]);if(!entries.some(e=>e&&!hidden(e.cell)))return;data.push(entries.map((entry,j)=>entry&&!hidden(entry.cell)?typed(clean(entry.cell),g.labels[selected[j]],entry.cell):''));});
  return {headers:selected.map(c=>g.labels[c]),rows:data};
 }
 function title(table,index){
  if(table.dataset.exportTitle)return table.dataset.exportTitle;
  if(table.caption)return clean(table.caption);
  let node=table;while(node&&node!==document.body){let prev=node.previousElementSibling;while(prev){if(prev.matches('h1,h2,h3,h4'))return prev.textContent.trim();prev=prev.previousElementSibling;}if(node.matches('.page,dialog,#content'))break;node=node.parentElement;}
  const page=table.closest('dialog,.inline-editor,.page,#content'),nav=[...document.querySelectorAll('[data-page]')].find(b=>b.dataset.page===page?.id),local=page?[...page.querySelectorAll('table')].indexOf(table):index;return (page?.dataset.view||page?.querySelector('h1,h2,h3')?.textContent||nav?.textContent||page?.id||'Table')+(local>0?' '+(local+1):'');
 }
 function scope(table,label,index){const page=table.closest('dialog,.inline-editor,.page,#content')||document.body;return [document.body.dataset.viewport||location.pathname,page.dataset.view||page.id||page.querySelector('h2')?.textContent||'',label,index].join(':');}
 function apply(table,state){
  const g=grid(table);for(const e of g.cells){if(!spans.has(e.cell))spans.set(e.cell,{cols:e.cols,rows:e.rows,hidden:e.cell.hidden});const base=spans.get(e.cell),count=Array.from({length:e.cols},(_,j)=>e.c+j).filter(c=>!state.hidden.has(c)).length;e.cell.dataset.tableColumn=e.c;e.cell.dataset.tableSpan=e.cols;const off=base.hidden||!count;if(e.cell.hidden!==off)e.cell.hidden=off;if(e.cell.colSpan!==Math.max(1,count))e.cell.colSpan=Math.max(1,count);}
  let ci=0;for(const col of table.querySelectorAll(':scope > colgroup > col')){if(!spans.has(col))spans.set(col,{cols:col.span||1,hidden:col.hidden});const base=spans.get(col),count=Array.from({length:base.cols},(_,j)=>ci+j).filter(c=>!state.hidden.has(c)).length,off=base.hidden||!count;if(col.hidden!==off)col.hidden=off;if(col.span!==Math.max(1,count))col.span=Math.max(1,count);ci+=base.cols;}
  state.menu?.querySelectorAll('input[data-table-column-choice]').forEach(x=>{x.checked=!state.hidden.has(Number(x.dataset.tableColumnChoice));});window.GSISTableRefresh?.();
 }
 function enhance(root=document){
  const tables=[...root.querySelectorAll('table')];tables.forEach((table,index)=>{
   if(document.body.dataset.viewport==='deploy'||document.querySelector('#content'))for(const cell of table.querySelectorAll('td')){
    if(cell.querySelector('input,select,textarea,button,[contenteditable]'))continue;
    const numeric=/^[+−-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(clean(cell));
    cell.classList.toggle('gsis-numeric-value',numeric);cell.classList.toggle('gsis-text-value',!numeric);
   }
   if(table.dataset.nativeTableTools==='true'||table.dataset.noTableTools!==undefined||hidden(table)||!table.rows.length)return;
   const g=grid(table);if(!g.width)return;let state=states.get(table);if(state?.bar?.isConnected){if(state.generic)apply(table,state);return;}
   const label=title(table,index),key=scope(table,label,index)+'|'+g.labels.join('|');
   state={hidden:preferences.get(key)||new Set(),generic:!table.dataset.controlsWired};preferences.set(key,state.hidden);
   const bar=document.createElement('div');bar.className='gsis-table-tools';bar.setAttribute('role','group');bar.setAttribute('aria-label',label+' table controls');
   const caption=document.createElement('strong');caption.className='gsis-table-caption';caption.textContent=label;bar.append(caption);
   if(!state.generic&&table.dataset.tableControlsId){const picker=[...document.querySelectorAll('.column-picker[data-table-controls-id]')].find(p=>p.dataset.tableControlsId===table.dataset.tableControlsId);if(picker){const group=picker.closest('.toolbar-group');bar.append(picker);if(group&&group.children.length===1&&group.firstElementChild.classList.contains('toolbar-divider'))group.remove();}}
   if(state.generic){const picker=document.createElement('details'),summary=document.createElement('summary'),menu=document.createElement('div');picker.className='gsis-columns';summary.textContent='Columns';picker.append(summary,menu);menu.className='gsis-column-menu';
    g.labels.forEach((name,c)=>{const available=g.cells.filter(e=>g.headSet.has(e.row)&&c>=e.c&&c<e.c+e.cols).every(e=>!(spans.get(e.cell)?.hidden??e.cell.hidden));if(!available)return;const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.dataset.tableColumnChoice=c;check.checked=!state.hidden.has(c);label.append(check,document.createTextNode(name));menu.append(label);check.onchange=()=>{if(!check.checked&&[...menu.querySelectorAll('input')].filter(x=>x.checked).length===0){check.checked=true;return;}check.checked?state.hidden.delete(c):state.hidden.add(c);apply(table,state);};});
    const all=document.createElement('button');all.type='button';all.textContent='Show all';all.onclick=()=>{state.hidden.clear();apply(table,state);};menu.append(all);state.menu=menu;bar.append(picker);
   }
   const download=document.createElement('button');download.type='button';download.className='gsis-export-excel';download.textContent='Export to Excel';download.title='Visible columns and displayed rows, in their current order; includes rows outside the scroll area.';
   download.onclick=()=>{const data=snapshot(table);if(!data.headers.length){status.textContent='Show a data column before exporting.';return;}try{const blob=window.GSISExcel.workbook([data.headers,...data.rows],label),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=('GSiS-'+label).replace(/[^\w .-]/g,'_')+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Exported '+data.rows.length+' displayed row(s).';}catch{status.textContent='Export failed. Please retry.';}};
   const status=document.createElement('span');status.className='gsis-export-status';status.setAttribute('role','status');bar.append(download,status);
   if(table.closest('#content[data-view="Audit"]')){const scope=document.createElement('small');scope.textContent='Export includes loaded rows. Use Load older events for more.';bar.append(scope);}
   (table.closest('.assignment-split')||(table.parentElement.childElementCount===1?table.parentElement:table)).before(bar);state.bar=bar;states.set(table,state);if(state.generic)apply(table,state);
  });
  document.querySelectorAll('.gsis-table-tools').forEach(bar=>{if(![...document.querySelectorAll('table')].some(t=>states.get(t)?.bar===bar))bar.remove();});
 }
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance();});}
 const observer=new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('.gsis-table-tools')))schedule();});observer.observe(document.documentElement,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['hidden','open']});
 document.addEventListener('click',schedule);document.addEventListener('change',schedule);addEventListener('load',schedule);addEventListener('resize',schedule);
 window.GSISTableTools={enhance,snapshot,grid,text:clean};schedule();
})();
