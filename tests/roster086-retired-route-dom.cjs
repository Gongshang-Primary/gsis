'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
(async()=>{
 const html=fs.readFileSync('roster-update/public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>|<link\b[^>]*>/g,''),dom=new JSDOM(html,{url:'https://roster.test/#whatsappReadiness',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,q=s=>w.document.querySelector(s);
 try{
  w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-model.js','roster-update/public/roster-export.js','roster-update/public/roster-operations-ui.js','roster-update/public/roster.js'])w.eval(fs.readFileSync(file,'utf8'));
  const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('Timed out');};
  await wait(()=>q('.function-tile'));assert.equal(w.location.hash,'');assert.equal(q('[data-page="WhatsApp Readiness"]'),null);assert(q('[data-page="Custom Notifications"]'));assert(q('[data-page="Daily Notify"]'));
  q('[data-page="Report Absence"]').click();await wait(()=>q('[data-absence-form]'));w.location.hash='#whatsapp-readiness';await wait(()=>q('.function-tile'));assert.equal(w.location.hash,'');assert.equal(q('.ops-notification-readiness'),null);
  assert.equal(w.__fixture.calls.some(c=>c.p.view==='notificationReadiness'),false,'retired route never reads readiness data');
  console.log('PASS Readiness retirement: cold and active legacy links return Home, no readiness fetch, other notification functions retained.');
 }finally{dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
