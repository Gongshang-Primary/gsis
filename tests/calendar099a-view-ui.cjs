'use strict';
const assert=require('node:assert/strict'),{fixture,settle}=require('./calendar/row9_ui_fixture.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 // A date-row anchor cannot keep the edited event fixed when its cell contents grow.
 {
  const f=fixture('weekly'),w=f.w,wrap=w.document.querySelector('.weekly-wrap');let growth=0;
  const box=(top,height=30)=>({top,bottom:top+height,height,left:0,right:100,width:100});
  const original=w.HTMLElement.prototype.getBoundingClientRect;
  w.HTMLElement.prototype.getBoundingClientRect=function(){
   if(this===wrap)return box(100,500);
   if(this.matches('.week-event[data-event-id="E1"]'))return box(200+growth-wrap.scrollTop);
   if(this.matches('[data-date]'))return box(130-wrap.scrollTop);
   return original.call(this);
  };
  f.app.openEventModal(f.data.events.find(e=>e.EventID==='E1'));
  const saved=f.app.captureEventViewPosition();assert.equal(saved.anchorEventId,'E1','Edit opening anchors the edited event, not the first row');
  growth=45;f.app.restoreEventViewPosition(saved);assert.equal(wrap.scrollTop,45,'Restore compensates growth inside the same date cell');
  f.app.closeModal(true);const current=f.app.captureEventViewPosition();assert.equal(current.anchorEventId,'E1','Receipt and subsequent save captures retain the same edited event');
  const node=wrap.querySelector('[data-event-id="E1"]');node.remove();f.app.restoreEventViewPosition(current);assert.equal(wrap.scrollTop,45,'Delete falls back to its saved date offset');f.close();
 }
 // A blocked storage getter cannot break startup or repeat the one-time jump.
 for(const cancel of [false,true]){
  const f=fixture('weekly',{storageBlocked:true,skipRender:true}),frames=[];f.w.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};f.app.renderAll();
  const wrap=f.w.document.querySelector('.weekly-wrap'),target=f.w.document.querySelector('.week-day.today').closest('tr');
  Object.defineProperty(target,'offsetTop',{value:350});Object.defineProperty(wrap,'clientHeight',{value:500});
  if(cancel)f.app.restoreEventViewPosition({...f.app.captureEventViewPosition(),wrapTop:123});
  while(frames.length)frames.shift()();assert.equal(wrap.scrollTop,cancel?123:290,cancel?'Restoring cancels a pending today jump':'First Weekly entry still lands on today');
  f.app.jumpViewToTodayOnce('weekly',f.node('weeklyHost'));assert.equal(frames.length,0,'In-memory once flag survives blocked storage');
  f.app.setPage('events');assert.equal(f.app.state.page,'events');f.close();
 }
 // Slow user year changes get feedback; cached and background loads do not flash.
 {
  const f=fixture();f.app.state.calendarJobsEnabled=false;let release;
  const makeYear=year=>({...JSON.parse(JSON.stringify(f.data)),selectedYear:year,years:[{Year:2026,Status:'ACTIVE'},{Year:2027,Status:'PLANNING'}],events:[],dayNotes:[],yearStructure:[]});
  f.w.fetch=async(url)=>new Promise(resolve=>{release=()=>resolve({ok:true,status:200,json:async()=>({ok:true,result:makeYear(Number(new URL(url,'https://calendar.synthetic.test').searchParams.get('year')))})});});
  let flight=f.app.loadBootstrap(2027,true,{yearSwitch:true});assert(f.node('yearLoadingOverlay').classList.contains('hidden'));await pause(330);assert(!f.node('yearLoadingOverlay').classList.contains('hidden'));assert.match(f.node('yearLoadingTitle').textContent,/Loading 2027 calendar/);release();await flight;assert(f.node('yearLoadingOverlay').classList.contains('hidden'));assert.equal(f.app.state.year,2027);
  flight=f.app.loadBootstrap(2027,true,{refresh:true});await pause(330);assert(f.node('yearLoadingOverlay').classList.contains('hidden'));release();await flight;
  flight=f.app.loadBootstrap(2026,true,{yearSwitch:true});release();await flight;
  flight=f.app.loadBootstrap(2027,true,{yearSwitch:true});await pause(330);assert(f.node('yearLoadingOverlay').classList.contains('hidden'),'Cached grid skips delayed overlay');release();await flight;
  f.w.fetch=async()=>{await pause(330);throw Error('Year source unavailable');};
  await assert.rejects(f.app.loadBootstrap(2026,true,{yearSwitch:true}),/unavailable/);assert(f.node('yearLoadingOverlay').classList.contains('hidden'));assert.equal(f.app.state.year,2027);assert.equal(f.app.state.readOnly,false,'Failed switch keeps the previously verified year usable');f.close();
 }
 // A superseded request cannot hide a newer switch overlay or install its year.
 {
  const f=fixture();f.app.state.calendarJobsEnabled=false;const releases={};
  f.w.fetch=async(url)=>{const year=Number(new URL(url,'https://calendar.synthetic.test').searchParams.get('year'));return new Promise(resolve=>{releases[year]=()=>resolve({ok:true,status:200,json:async()=>({ok:true,result:{...JSON.parse(JSON.stringify(f.data)),selectedYear:year,years:[{Year:2026},{Year:2027},{Year:2028}],events:[],dayNotes:[],yearStructure:[]}})});});};
  const older=f.app.loadBootstrap(2027,true,{yearSwitch:true});await pause(330);const newer=f.app.loadBootstrap(2028,true,{yearSwitch:true});await pause(330);releases[2027]();assert.equal(await older,false);assert(!f.node('yearLoadingOverlay').classList.contains('hidden'));assert.match(f.node('yearLoadingTitle').textContent,/2028/);releases[2028]();await newer;assert.equal(f.app.state.year,2028);assert(f.node('yearLoadingOverlay').classList.contains('hidden'));f.close();
 }
 // Superseding a pending switch retains the original verified fallback,
 // even when the intermediate target was installed from a read-only cache.
 for(const cached of [false,true]){
  const f=fixture();f.app.state.calendarJobsEnabled=false;
  const snapshot=year=>({...JSON.parse(JSON.stringify(f.data)),selectedYear:year,years:[{Year:2026},{Year:2027},{Year:2028}],events:[],dayNotes:[],yearStructure:[]});
  if(cached){f.w.fetch=async(url)=>({ok:true,status:200,json:async()=>({ok:true,result:snapshot(Number(new URL(url,'https://calendar.synthetic.test').searchParams.get('year')))})});await f.app.loadBootstrap(2027,true,{yearSwitch:true});await f.app.loadBootstrap(2026,true,{yearSwitch:true});}
  const pending={};f.w.fetch=async(url)=>{const year=Number(new URL(url,'https://calendar.synthetic.test').searchParams.get('year'));return new Promise((resolve,reject)=>{pending[year]={resolve:()=>resolve({ok:true,status:200,json:async()=>({ok:true,result:snapshot(year)})}),reject};});};
  const first=f.app.loadBootstrap(2027,true,{yearSwitch:true}),last=f.app.loadBootstrap(2028,true,{yearSwitch:true});pending[2028].reject(Error('Latest switch failed'));await assert.rejects(last,/Latest switch failed/);assert.equal(f.app.state.year,2026,'Failure returns to the original verified year');assert.equal(f.app.state.readOnly,false,'A pending request cannot replace verified editability');pending[2027].resolve();assert.equal(await first,false);assert.equal(f.app.state.year,2026);assert(f.node('yearLoadingOverlay').classList.contains('hidden'));f.close();
 }
 // Common date mistakes are stopped in the form before durable capture.
 {
  const f=fixture();f.app.openEventModal(f.data.events[0]);const form=f.node('eventForm');form.elements.EndDate.value='2026-01-01';form.dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await settle();assert.equal(f.calls.length,0);assert(f.node('eventForm'));assert(f.node('syncOverlay').classList.contains('hidden'));f.close();
 }
 console.log('PASS Calendar row 9 event/date anchor, canceled today jump, delayed/cached/background/error year overlay and local validation');
})().catch(error=>{console.error(error);process.exit(1);});
