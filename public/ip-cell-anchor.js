/* Restore a logical IP cell after a picker and its temporary geometry disappear. */
window.GSISIPCellAnchor=function({context,identify,locate}){
 let generation=0;
 const cancel=()=>{generation++};
 for(const event of ['pointerdown','wheel','touchstart','keydown'])document.addEventListener(event,cancel,{capture:true,passive:true});
 function capture(control,options={}){
  const key=identify(control),cell=control.closest('td');if(!key||!cell)return null;
  const r=cell.getBoundingClientRect(),owner=cell.closest('.table-window,.scroll'),table=cell.closest('table');return {key,context:context(),x:r.left,y:r.top,focus:options.focus!==false,...(options.viewport&&owner?{viewport:{windowX:window.scrollX||0,windowY:window.scrollY||0,left:owner.scrollLeft,top:owner.scrollTop,tableKey:table?.dataset.tableControlsId||'',owner,visible:r.bottom>0&&r.top<innerHeight}}:{})};
 }
 function captureView(root){
  const active=document.activeElement,focused=root.contains(active)&&active.closest('tbody td');
  const control=focused?active:root.querySelector('tbody td');
  return control?capture(control,{viewport:true,focus:!!focused}):null;
 }
 function restore(anchor){
  if(!anchor)return;const ticket=++generation;let previous='',stable=0,frames=0;
  const view=anchor.viewport;
  if(view&&context()===anchor.context){
   const cell=locate(anchor.key),table=view.tableKey?[...document.querySelectorAll('table')].find(t=>t.dataset.tableControlsId===view.tableKey):null,owner=cell?.closest('.table-window,.scroll')||table?.closest('.table-window,.scroll')||(view.owner.isConnected?view.owner:null);
   if(owner){owner.scrollLeft=view.left;owner.scrollTop=view.top;}window.scrollTo?.(view.windowX,view.windowY);
  }
  const settle=()=>{
   if(ticket!==generation||context()!==anchor.context)return;
   const cell=locate(anchor.key);if(!cell||!cell.isConnected||!cell.getClientRects().length)return;
   let r=cell.getBoundingClientRect();const signature=[r.x,r.y,r.width,r.height,cell.closest('table')?.getBoundingClientRect().width].join(',');
   stable=signature===previous?stable+1:0;previous=signature;
   if(++frames<12&&stable<3){requestAnimationFrame(settle);return;}
   const scroller=cell.closest('.table-window,.scroll');if(!scroller)return;
   // A replacement table is initially full-height. Restoring before the shared
   // viewport applies its height clamps scrollTop to zero, so restore after layout.
   if(view){scroller.scrollLeft=view.left;scroller.scrollTop=view.top;window.scrollTo?.(view.windowX,view.windowY);r=cell.getBoundingClientRect();}
   const box=scroller.getBoundingClientRect(),table=cell.closest('table');
   const header=table.tHead?.getBoundingClientRect(),top=Math.max(0,box.top)+(header?.height||0)+4,bottom=Math.min(innerHeight,box.bottom)-12;
   const frozen=cell.classList.contains('frozen-col'),frozenRight=Math.max(box.left,...[...table.querySelectorAll('thead .frozen-col:not([hidden])')].map(c=>c.getBoundingClientRect().right));
   const left=Math.max(0,frozen?box.left:frozenRight)+4,right=Math.min(innerWidth,box.right)-12;
   const desiredX=anchor.x>=left&&anchor.x+r.width<=right?anchor.x:Math.max(left,Math.min(right-r.width,innerWidth/2-r.width/2));
   const desiredY=view?anchor.y:anchor.y>=top&&anchor.y+r.height<=bottom?anchor.y:Math.max(top,Math.min(bottom-r.height,innerHeight/3));
   if(!view&&!frozen)scroller.scrollLeft+=r.left-desiredX;
   if(!view||view.visible)scroller.scrollTop+=r.top-desiredY;
   // Focus the replacement control, never the discarded SELECT or an unrelated row.
   const control=cell.querySelector('button:not([hidden]):not([disabled]),summary:not([aria-disabled="true"])')||cell;
   if(control===cell&&!cell.hasAttribute('tabindex'))cell.tabIndex=-1;
   if(anchor.focus!==false)control.focus({preventScroll:true});
  };
  requestAnimationFrame(settle);
 }
 return {capture,captureView,restore,cancel};
};
