'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<main></main>',{url:'https://roster.test/',runScripts:'outside-only'}),w=dom.window,q=s=>w.document.querySelector(s),flush=()=>new Promise(r=>setImmediate(r)),date='2026-10-22';
w.eval(fs.readFileSync('roster-update/public/roster-stapler-ui.js','utf8'));
const writes=[],data={revision:7,dates:[{date,name:'Retained date',mayManage:true,mayEdit:true}],sponsors:[{id:'sponsor',name:'SMC sponsor'}],sponsorships:[]};
let failDates=false;
const ctx={container:q('main'),verifiedSession:1,profile:{user:{email:'teacher@test',admin:false,smc:false}},today:()=>date,status(){},api:async(_,input)=>{
 if(input.operation==='staplerDates'){if(failDates)throw Object.assign(Error('Date refresh offline'),{status:503});return structuredClone(data);}
 if(input.operation==='requestStapler'){writes.push(structuredClone(input));if(writes.length===1)throw Object.assign(Error('Request response lost'),{status:503});return structuredClone({...data,revision:8});}
 throw Error(input.operation);
}};
(async()=>{try{
 await w.RosterStaplerUI.render(ctx);q('[name=sponsorId]').value='sponsor';q('[data-date-entry] button').click();await flush();
 assert.equal(writes.length,1);assert.match(q('[data-stapler-message]').textContent,/outcome is unconfirmed/);
 w.RosterStaplerUI.unmount();failDates=true;await w.RosterStaplerUI.render(ctx);
 const retry=q('[data-date-entry] button');assert.equal(retry.textContent,'Retry the same request');assert.equal(retry.disabled,false,'uncertain request retry remains usable when the reopening date refresh fails');
 assert(q('[name=date]').disabled);assert(q('[name=sponsorId]').disabled);assert(q('[data-plan-action]').disabled,'stale lifecycle controls remain disabled');
 assert.match(q('[data-stapler-message]').textContent,/Date refresh offline/);
 q('[name=date]').value='2026-10-23';q('[name=sponsorId]').value='';retry.click();await flush();
 assert.equal(writes.length,2,'the real enabled button submits the recovery request');assert.deepEqual(writes[1],writes[0],'retry preserves the original request ID, date, sponsor and revision despite stale form changes');assert.equal(w.RosterStaplerUI.isDirty(),false);
 console.log('PASS Stapler pending planning request retry survives unmount and failed dates refresh, with immutable input and other stale controls disabled.');
}finally{w.RosterStaplerUI.unmount();dom.window.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
