const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<div class="scroll"><table><thead><tr><th class="frozen-col">Venue</th></tr></thead><tbody><tr><td><button>Teacher</button></td></tr></tbody></table></div>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
try{
 let frame=[],context='v1|IP Deploy',found=true;w.requestAnimationFrame=f=>frame.push(f);Object.defineProperty(w,'innerWidth',{value:1200});Object.defineProperty(w,'innerHeight',{value:900});
 const box=(x,y,width,height)=>({x,y,left:x,top:y,right:x+width,bottom:y+height,width,height});
 const scroller=d.querySelector('.scroll'),cell=d.querySelector('td'),button=d.querySelector('button');let geometry=box(600,400,160,80);
 scroller.getBoundingClientRect=()=>box(10,100,1180,780);d.querySelector('thead').getBoundingClientRect=()=>box(10,100,1180,40);d.querySelector('th').getBoundingClientRect=()=>box(10,100,200,40);cell.getBoundingClientRect=()=>geometry;cell.getClientRects=()=>found?[geometry]:[];d.querySelector('table').getBoundingClientRect=()=>box(10,100,2000,3000);
 vm.runInContext(fs.readFileSync('public/ip-cell-anchor.js','utf8'),dom.getInternalVMContext());const api=w.GSISIPCellAnchor({context:()=>context,identify:()=>({ref:'stable-class',column:'EL'}),locate:()=>found?cell:null});
 const drain=()=>{for(let i=0;frame.length&&i<20;i++){const next=frame;frame=[];next.forEach(f=>f());}};
 const a=api.capture(button);geometry=box(800,550,160,80);api.restore(a);drain();assert.equal(scroller.scrollLeft,200);assert.equal(scroller.scrollTop,150);assert.equal(d.activeElement,button);
 scroller.scrollLeft=0;scroller.scrollTop=0;api.restore(a);d.dispatchEvent(new w.Event('wheel'));drain();assert.equal(scroller.scrollLeft,0,'user scroll cancels a pending restore');
 api.restore(a);context='v2|IP Deploy';drain();assert.equal(scroller.scrollLeft,0,'never restore another version');context='v1|IP Deploy';
 api.restore(a);found=false;drain();assert.equal(scroller.scrollLeft,0,'filtered row never targets another cell');found=true;
 geometry=box(-400,900,160,80);const hidden=api.capture(button);geometry=box(800,550,160,80);api.restore(hidden);drain();assert.equal(scroller.scrollLeft,280,'offscreen cell snaps to horizontal centre');assert.equal(scroller.scrollTop,250,'offscreen cell snaps to upper third');
 scroller.scrollLeft=0;scroller.scrollTop=0;api.restore(hidden);api.restore(a);drain();assert.equal(scroller.scrollLeft,200,'newest edit wins');assert.equal(scroller.scrollTop,150);
 cell.classList.add('frozen-col');scroller.scrollLeft=0;api.restore(a);drain();assert.equal(scroller.scrollLeft,0,'frozen venue never scrolls sideways');
 console.log('PASS stable-cell restoration, upper-third fallback, frozen columns, latest edit, wheel cancellation, version changes and filtered-out row.');
}finally{dom.window.close()}
