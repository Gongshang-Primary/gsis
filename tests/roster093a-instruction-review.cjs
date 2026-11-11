'use strict';
// Actual UI and domain with a held provider-free API boundary. No school records or notifications.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
async function setup(){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,$=q=>w.document.querySelector(q),controls={},calls=[];
 w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
 for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])vm.runInContext(fs.readFileSync(file,'utf8'),dom.getInternalVMContext());
 const f=w.__fixture;f.setClock(f.ctx.today+'T06:00:00+08:00');f.day.teachers.find(t=>t.staffId==='bob').R=5;
 const week={perDay:17,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>structuredClone(t.cells)).flat()}))};
 const ctx={profile:f.profile,today:()=>f.ctx.today,container:$('#content'),cachedTimetable:()=>({modelId:'baseline',model:{even:week,odd:week}}),status:()=>{},api:async(route,p)=>{
  calls.push(structuredClone(p));if(p.operation==='candidates'&&controls.candidates)await controls.candidates;
  const response=await w.fetch('/'+route,{body:JSON.stringify(p)}),result=await response.json();if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return structuredClone(result.data);
 }};
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out: '+w.document.body.textContent);};
 const idle=()=>wait(()=>$('#content').getAttribute('aria-busy')==='false'),state=await w.RosterOpsUI.render('Report Absence',ctx);
 const input=(selector,value,event='input')=>{const el=$(selector);el.value=value;el.dispatchEvent(new w.Event(event,{bubbles:true}));};
 const preview=()=>{$('[data-period="2"]').click();$('[data-period="3"]').click();$('[data-absence-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));};
 const writes=()=>calls.filter(p=>!w.GSISRosterOperations.READS.includes(p.operation)&&p.operation!=='receiptStatus');
 return {dom,w,$,f,controls,calls,ctx,state,wait,idle,input,preview,writes};
}
(async()=>{const t=await setup();try{
 t.preview();t.input('[data-instruction]','Retain this exact text');t.f.day.staplerRevision=1;
 t.$('[data-save-instructions]').click();await t.idle();
 assert.equal(t.f.state.absences.length,1,'changed timetable never blocks attendance');assert.equal(t.$('[data-review-draft-instructions]'),null,'there is no instruction review gate');assert.match(JSON.stringify(t.f.state.absences[0].instructions),/Retain this exact text/);console.log('PASS changed instruction source saves attendance and original text without a review task');
 }finally{t.dom.window.close();}})().catch(e=>{console.error(e);process.exitCode=1;});