/* Shared viewport scrollbar. Only the visible table moves; the page/header never widens. */
(()=>{let bar,inner,active,scheduled=false,locked=false,disposed=false,frame=0;

 const compactPages=new WeakMap(),fitted=new WeakSet();
 const owner=t=>t.closest(".page,dialog")||document.querySelector("#content")||t.closest("main")||document.body;
 function pageState(p){let states=compactPages.get(p);if(!states)compactPages.set(p,states=new Map());const key=pageKey(p);if(!states.has(key))states.set(key,{manual:false});return states.get(key);}
 const pageKey=p=>p.dataset.view||p.id||"page";
 const measure=document.createElement('canvas').getContext('2d')||{font:'',measureText:text=>({width:String(text).length*8})};
 function fitTable(table,controlsOnly=false){
  table.classList.add('gsis-compact');if(!controlsOnly){table.classList.remove('gsis-compact-manual');table.style.removeProperty('width');table.querySelectorAll('col').forEach(c=>{c.style.removeProperty('width');c.removeAttribute('width')});}fitted.add(table);
  for(const e of table.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]),select,textarea')){
   if(e.classList.contains('full-cell-note'))continue;const css=getComputedStyle(e);measure.font=css.font||[css.fontSize,css.fontFamily].join(' ');
   const text=e.tagName==='SELECT'?(e.dataset.selectedUnit==='true'?(e.value||'Unassigned'):e.selectedOptions[0]?.textContent||''):e.value||e.placeholder||'';
   const width=Math.max(48,...String(text).split('\n').map(t=>measure.measureText(t).width))+parseFloat(css.paddingLeft||0)+parseFloat(css.paddingRight||0)+(e.tagName==='SELECT'?30:8);
   e.style.setProperty('--compact-control-width',Math.ceil(width)+'px');
   if(e.tagName==='TEXTAREA')e.rows=Math.max(1,String(text).split('\n').length);
  }
 }
 function compactControls(tables){
  const pages=new Set(tables.map(t=>owner(t)));
  for(const page of pages){
   let bar=page.id==='content'?document.querySelector('#viewActions'):page.querySelector('.data-toolbar,.column-picker,.page-head,.tools');
   if(!bar){bar=page.querySelector(':scope > .compact-toolbar');if(!bar){bar=document.createElement('div');bar.className='compact-toolbar';page.prepend(bar)}}
   let control=bar.querySelector('[data-compact]');
   if(!control){control=document.createElement('button');control.type='button';control.dataset.compact='true';control.className='compact-button';control.textContent='Compact';control.title='Fit table contents tightly; keep one teacher per line';bar.append(control);control.onclick=()=>{pageState(page).manual=false;[...page.querySelectorAll("table")].filter(t=>t.dataset.plainTable===undefined&&t.getClientRects().length).forEach(t=>fitTable(t));schedule()};}
   if(control!==bar.lastElementChild)bar.append(control);
   for(const t of tables.filter(t=>page.contains(t)))if(!fitted.has(t)){fitTable(t,pageState(page).manual);t.classList.toggle('gsis-compact-manual',pageState(page).manual);}
  }
  document.querySelectorAll('[data-compact]').forEach(b=>b.hidden=!tables.length);
 }
 const refitControl=e=>{const table=e.target.closest('table.gsis-compact');if(table&&!e.target.closest('.select-panel')){fitTable(table,true);schedule()}};
 document.addEventListener('input',refitControl);document.addEventListener('change',refitControl);document.addEventListener('click',schedule);

 document.addEventListener('pointerdown',e=>{if(e.target.closest('.resize-grip,.member-resize')){const t=e.target.closest('table');if(t){pageState(owner(t)).manual=true;t.classList.add('gsis-compact-manual');}}},true);
 document.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)&&e.target.closest('.member-resize')){const t=e.target.closest('table');pageState(owner(t)).manual=true;t.classList.add('gsis-compact-manual');}},true);
 document.fonts?.ready.then(()=>{document.querySelectorAll('table.gsis-compact').forEach(t=>fitTable(t,true));schedule();});
 function membershipControls(table){
  if(!table.closest('#membershipGrid')||table.dataset.memberWired)return;
  table.dataset.memberWired='true';const headers=[...table.tHead.rows[0].cells],body=table.tBodies[0],cg=document.createElement('colgroup');table.prepend(cg);
  let prefs={};try{prefs=JSON.parse(localStorage.getItem('gsis.membership.columns')||'{}')}catch{};
  const value=c=>{const i=c.querySelector('input,select,textarea');return i?.type==='checkbox'?(i.checked?'1':''):i?.value??c.textContent};
  const widths=headers.map((h,i)=>prefs[i]||Math.min(680,Math.max(i===1?380:64,h.textContent.length*8+35,...[...body.rows].map(row=>String(value(row.cells[i])).length*8+28))));
  function apply(){headers.forEach((h,i)=>{cg.children[i].style.width=widths[i]+'px'});table.style.setProperty('width',widths.reduce((a,b)=>a+b,0)+'px','important');schedule()}
  headers.forEach((h,i)=>{
   cg.append(document.createElement('col'));const label=h.textContent;h.textContent='';
   if(label==='Delete')h.textContent=label;else{const b=document.createElement('button');b.type='button';b.className='member-sort';b.textContent=label+' ↕';h.append(b);h.setAttribute('aria-sort','none');b.onclick=()=>{const desc=h.getAttribute('aria-sort')==='ascending';headers.forEach(x=>x.setAttribute('aria-sort','none'));h.setAttribute('aria-sort',desc?'descending':'ascending');[...body.rows].sort((a,b)=>String(value(a.cells[i])).localeCompare(String(value(b.cells[i])),undefined,{numeric:true,sensitivity:'base'})*(desc?-1:1)).forEach(row=>body.append(row));};}
   const grip=document.createElement('span');grip.className='member-resize';grip.tabIndex=0;grip.setAttribute('role','separator');grip.setAttribute('aria-orientation','vertical');grip.setAttribute('aria-label','Resize '+label);h.append(grip);
   const save=()=>{try{localStorage.setItem('gsis.membership.columns',JSON.stringify(Object.fromEntries(widths.map((w,j)=>[j,w]))))}catch{}};
   grip.onpointerdown=e=>{e.preventDefault();e.stopPropagation();const x=e.clientX,w=widths[i];grip.setPointerCapture?.(e.pointerId);grip.onpointermove=e=>{widths[i]=Math.max(60,Math.min(1000,w+e.clientX-x));apply()};grip.onpointerup=grip.onpointercancel=()=>{grip.onpointermove=null;save()}};
   grip.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();widths[i]=Math.max(60,widths[i]+(e.key==='ArrowRight'?16:-16));apply();save()}};
  });apply();
 }
 function refresh(){scheduled=false;if(disposed)return;const tables=[...document.querySelectorAll('table')].filter(t=>t.dataset.plainTable===undefined&&t.getClientRects().length);let best=null,singleOwner=false;
 for(const table of tables)membershipControls(table);compactControls(tables);
 for(const table of tables){const rows=[...table.rows];let occupied=[];for(const row of rows){let column=0;for(const cell of row.cells){while(occupied[column]>0)column++;if(cell.rowSpan>1)occupied[column]=cell.rowSpan;cell.dataset.gridColumn=column;column+=Number(cell.dataset.tableSpan)||cell.colSpan||1;}occupied=occupied.map(n=>Math.max(0,n-1));}const visible=[...table.querySelectorAll('th,td')].filter(c=>!c.hidden);const indexes=[...new Set(visible.map(c=>Number(c.dataset.gridColumn)))].sort((a,b)=>a-b),freezeCount=Number(table.dataset.freezeColumns||1),frozen=indexes.slice(0,freezeCount);const widths=new Map();for(const c of visible)if(!widths.has(Number(c.dataset.gridColumn))||c.colSpan===1)widths.set(Number(c.dataset.gridColumn),c.getBoundingClientRect().width/c.colSpan);for(const c of table.querySelectorAll('th,td')){const index=Number(c.dataset.gridColumn),freeze=!c.hidden&&frozen.includes(index);c.style.setProperty('--frozen-left',frozen.filter(i=>i<index).reduce((sum,i)=>sum+(widths.get(i)||0),0)+'px');if(c.classList.contains('frozen-col')!==freeze)c.classList.toggle('frozen-col',freeze);}
 let scroller=table.closest('#admin')||table.parentElement;if(!scroller.classList.contains('table-window'))scroller.classList.add('table-window');const rect=scroller.getBoundingClientRect();const flow=!!document.querySelector('#content > .publication-review')||!!table.closest('#content[data-view="Versions"],#content[data-view="Audit"],#content[data-view="Classes & TGs"],#content[data-view="Workload"],#content[data-view="ASC Export"],.inline-editor,#contactRecovery')||!!(document.querySelector('#contacts')&&(window.matchMedia?window.matchMedia('(max-width:640px), (max-width:900px) and (max-height:500px)').matches:innerWidth<=640));scroller.classList.toggle('audit-page-flow',flow);scroller.classList.toggle('single-scroll-owner',!flow);scroller.classList.toggle('freeze-header',!flow);if(flow)scroller.style.removeProperty('max-height');else singleOwner=true;
 const inSplit=!!scroller.closest('.assignment-split'),isDuty=!!scroller.closest('#content[data-view="Duty"]');
 if(!inSplit&&!flow){scroller.style.maxHeight=Math.max(100,innerHeight-Math.max(0,rect.top)-12)+'px';}
 let headerTop=0;for(const row of table.tHead?.rows||[]){for(const cell of row.cells)cell.style.top=headerTop+'px';headerTop+=row.getBoundingClientRect().height;}

 }
 document.body.classList.toggle('single-table-page',singleOwner);
 if(bar){bar.remove();bar=null;}

 }
 function schedule(){if(!disposed&&!scheduled){scheduled=true;frame=requestAnimationFrame(refresh)}}
 const observer=new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('.viewport-scrollbar')))schedule()});observer.observe(document.documentElement,{childList:true,subtree:true});addEventListener('resize',schedule);addEventListener('scroll',schedule,{passive:true});addEventListener('load',schedule);window.GSISTableRefresh=schedule;window.GSISTableFit=table=>{if(table&&!disposed){pageState(owner(table)).manual=false;fitTable(table);schedule();}};window.GSISTableDispose=()=>{disposed=true;observer.disconnect();cancelAnimationFrame(frame);removeEventListener('resize',schedule);removeEventListener('scroll',schedule);removeEventListener('load',schedule)};addEventListener('pagehide',window.GSISTableDispose);addEventListener('pageshow',e=>{if(e.persisted){disposed=false;observer.observe(document.documentElement,{childList:true,subtree:true});addEventListener('resize',schedule);addEventListener('scroll',schedule,{passive:true});schedule();}});
})();
