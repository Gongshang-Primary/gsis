'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,q=s=>w.document.querySelector(s),flush=()=>new Promise(resolve=>setImmediate(resolve)),requests=[],calls=[],date='2026-10-21';
for(const file of ['shared/roster-stapler.js','roster-update/public/roster-stapler-ui.js'])w.eval(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'));
const ctx={container:q('#content'),today:()=> '2026-10-19',profile:{user:{email:'admin@school.test',admin:true,smc:true}},status(){},api:(_,input)=>{calls.push(input.operation);return new Promise((resolve,reject)=>requests.push({input,resolve,reject}));}},take=operation=>{const r=requests.shift();assert.equal(r.input.operation,operation);return r;},dates={revision:1,dates:[{date,status:'Draft',draftRevision:1,mayEdit:true}],sponsors:[]};
(async()=>{try{
 const initial=w.RosterStaplerUI.render(ctx);take('staplerDates').resolve(dates);await initial;
 q('[data-open-date]').click();take('stapler').reject(Object.assign(Error('The saved Stapler plan could not load. Keep the saved date.'),{status:503,diagnosticId:'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb',backendVersion:'0.7.17',failureStage:'stapler-unpack'}));await flush();
 take('staplerDates').reject(Object.assign(Error('Roster records could not load.'),{status:503,diagnosticId:'cccccccc-1111-2222-3333-dddddddddddd',backendVersion:'0.7.17',failureStage:'operations-read'}));await flush();
 const message=q('[data-stapler-message]').textContent;assert.match(message,/2026-10-21:/);assert.match(message,/Reference: aaaaaaaa/);assert.match(message,/Backend: 0\.7\.17/);assert.match(message,/Stage: stapler-unpack/);assert.match(message,/Dates refresh also failed/);assert.match(message,/Reference: cccccccc/);assert.match(message,/Stage: operations-read/);
 assert.match(q('.planner-dates').textContent,/Revision 1/);assert.equal(q('[data-restart-plan]'),null);assert.deepEqual(calls,['staplerDates','stapler','staplerDates'],'read failures cannot trigger writes, resets or lock acquisition');
 q('[data-refresh-dates]').click();take('staplerDates').resolve(dates);await flush();q('[data-open-date]').click();
 const plan=w.GSISRosterStapler.create({date,id:'base',verified:true,schoolDay:true,periods:[{period:0,startMinutes:420,endMinutes:450}],teachers:[{staffId:'a',name:'Alice',cells:[['SCI','1A','Hall','']]}],formClasses:[{id:'c',name:'1A'}]});
 take('stapler').resolve({date,plan,revision:1,staplerRevision:1,canEdit:false,canConfirm:false,accessRequests:[],people:[],confirmed:null});await flush();assert.match(q('.planner-grid').textContent,/SCI/);assert.match(q('[data-plan-meta]').textContent,/Draft saved/);assert.equal(requests.length,0);
 console.log('PASS failed saved-plan UI keeps its date and original diagnostic through failed list refresh; read-only retry reopens the same saved revision.');
}finally{w.RosterStaplerUI.unmount();dom.window.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
