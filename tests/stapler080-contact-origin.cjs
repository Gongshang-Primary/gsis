'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
async function fixture(){
 const dom=new JSDOM('<main></main>',{url:'https://roster.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,doc=w.document;
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 for(const f of ['shared/roster-stapler.js','roster-update/public/roster-operations-ui.js','roster-update/public/roster-stapler-ui.js','tests/fixtures/stapler-lease-api.js'])w.eval(fs.readFileSync(f,'utf8'));
 const date='2026-10-22',day={date,id:'baseline',verified:true,schoolDay:true,parity:'even',periods:[{period:0,startMinutes:420,endMinutes:450}],teachers:[{staffId:'alice',name:'Alice',cells:[['EL','4A','Room','']]}],formClasses:[]};
 const payload={app:'Stapler',version:'4.3',stateType:'plan',selectedDate:date,selectedDay:'Thursday',selectedSheet:'Even Week',startTime:'07:00',periodMinutes:30,addedTeachers:['First New','Second New'],tiles:['First New','Second New'].map((teacher,i)=>({id:'tile'+i,teacher,assignedPeriod:0,subject:'SCI',className:'',venue:'Lab',group:'',sheet:'Even Week',day:'Thursday',location:'teacher'}))};
 const f={w,doc,date,calls:[],respond:async()=>{throw Object.assign(Error('Lost response'),{status:503});}},q=s=>doc.querySelector(s);
 f.ctx={container:q('main'),verifiedSession:1,initialDate:date,today:()=>date,profile:{user:{admin:true,smc:true,email:'owner@test'}},status(){},api:async(_,p)=>{f.calls.push(structuredClone(p));if(p.operation==='stapler')return {date:p.date,plan:w.GSISRosterStapler.create({...day,date:p.date}),revision:1,staplerRevision:0,canEdit:true,canConfirm:true,people:[{id:'alice',name:'Alice',active:true}],nameBridges:[],accessRequests:[]};if(p.operation==='contactCreate')return f.respond(p);throw Error(p.operation);}};
 f.flush=()=>new Promise(r=>setImmediate(r));f.q=q;f.start=async()=>{await w.RosterStaplerUI.render(f.ctx);const input=q('[data-legacy-file]');Object.defineProperty(input,'files',{configurable:true,value:[{size:100,text:async()=>JSON.stringify(payload)}]});input.dispatchEvent(new w.Event('change'));await f.flush();};
 f.submit=async()=>{q('[name=mobile]').value='91234567';q('dialog form').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));await f.flush();};f.close=()=>{w.RosterStaplerUI.unmount();dom.window.close();};return f;
}
(async()=>{
 let f=await fixture();try{
  await f.start();f.q('[data-import-name="0"] [data-import-new-contact]').click();await f.submit();f.q('[data-dialog-close]').click();
  assert(f.q('[data-import-name="1"] [data-import-new-contact]').disabled,'a different row cannot claim a pending request');
  f.q('[data-import-name="0"] [data-import-new-contact]').click();assert.equal(f.q('[name=basicName]').value,'First New');
  f.respond=async()=>({saved:true,person:{id:'first-id',name:'First New (SRE)',active:false},revision:2});await f.submit();
  assert.equal(f.q('[data-import-name="0"] [data-teacher-select]').value,'first-id');assert.equal(f.q('[data-import-name="1"] [data-teacher-select]').value,'');assert.equal(f.doc.activeElement,f.q('[data-import-name="0"] [data-teacher-search]'),'completion returns focus to source row');
  f.q('[data-import-name="1"] [data-import-new-contact]').click();assert.equal(f.q('[name=basicName]').value,'Second New');
  f.respond=async()=>({saved:false,blocked:true,message:'Duplicate contact',duplicates:[{name:'Already present',active:true}]});await f.submit();assert.match(f.q('[data-dialog-message]').textContent,/Duplicate contact/);assert.equal(f.q('[data-contact-confirm]').hidden,true);
  f.q('[data-dialog-close]').click();assert.equal(f.q('[data-import-name="0"] [data-teacher-select]').value,'first-id','duplicate rejection preserves other mappings');assert.equal(f.doc.activeElement,f.q('[data-import-name="1"] [data-teacher-search]'));
  assert(!f.calls.some(p=>/saveStapler|confirmStapler|NameBridge/.test(p.operation)));assert.deepEqual(f.calls.filter(p=>p.operation==='contactCreate')[0],f.calls.filter(p=>p.operation==='contactCreate')[1]);
 }finally{f.close();}
 f=await fixture();try{
  await f.start();f.q('[data-import-name="1"] [data-import-new-contact]').click();await f.submit();const original=f.calls.find(p=>p.operation==='contactCreate');
  f.w.RosterStaplerUI.unmount();await f.w.RosterStaplerUI.render({...f.ctx,initialDate:'2026-10-23'});
  assert.equal(f.q('[name=basicName]').value,'Second New','reload resumes the original request');
  f.respond=async()=>({saved:true,person:{id:'second-id',name:'Second New (SRE)',active:false},revision:9});await f.submit();
  assert.deepEqual(f.calls.filter(p=>p.operation==='contactCreate')[1],original,'reload keeps the original date, request ID and input');
  assert.equal(f.q('[data-import-name]'),null);assert(!f.q('[data-scroll="teacher"]').textContent.includes('Second New'),'an import retry cannot fall through to Add teacher in a new draft');assert.match(f.q('[data-stapler-message]').textContent,/original import or draft changed/);assert.equal(f.w.RosterStaplerUI.isDirty(),false);
 }finally{f.close();}
 console.log('PASS Stapler contact origin: row ownership, exact retry, duplicate/cancel preservation, focus and reload reconciliation without Add teacher.');
})().catch(e=>{console.error(e);process.exitCode=1;});
