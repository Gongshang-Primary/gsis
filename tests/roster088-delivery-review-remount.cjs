'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),tick=()=>new Promise(resolve=>setTimeout(resolve,0));
(async()=>{
 for(const outcome of ['success','definitive','uncertain','other-owner']){
  const dom=new JSDOM('<main><div id="one"></div><div id="two"></div><button id="other">Other task</button></main>',{url:'https://roster.school.test',runScripts:'outside-only'}),w=dom.window,calls=[],held=[];
  const issue={id:'notification:n1',token:'a'.repeat(64),name:'First owner private name',status:'uncertain',cause:'Unknown'},data={issues:[issue],pending:[],canCancel:true,checkedAt:'2026-10-22T05:30:00Z'};
  const api=async(route,p)=>{calls.push(structuredClone(p));if(p.operation==='deliveryReview')return structuredClone(data);return new Promise((resolve,reject)=>held.push({resolve,reject}));};
  w.eval(fs.readFileSync('roster-update/public/roster-delivery-review-ui.js','utf8'));
  const mount=(id,owner='first')=>w.RosterDeliveryReviewUI.mount({container:w.document.getElementById(id),api:owner==='first'?api:async()=>({...data,issues:[]}),user:{smc:true,admin:true},owner});
  mount('one');await tick();w.document.querySelector('[data-review-open]').click();w.document.querySelector('[data-review-clear]').click();await tick();
  const command=calls.at(-1);w.RosterDeliveryReviewUI.unmount();mount('two',outcome==='other-owner'?'second':'first');await tick();
  if(outcome==='success'||outcome==='other-owner')held[0].resolve({...data,issues:[],changed:1});else held[0].reject(Object.assign(Error(outcome==='definitive'?'Preview changed':'Outcome unknown'),outcome==='definitive'?{status:409}:{}));
  await tick();
  if(outcome==='other-owner'){assert(!w.document.querySelector('#two').textContent.includes('First owner private name'));assert(!w.document.querySelector('#two').textContent.includes('alerts cleared'));}
  else if(outcome==='uncertain'){
   const retry=w.document.querySelector('#two [data-review-retry]');assert(retry&&!retry.disabled);retry.click();await tick();assert.deepEqual(calls.at(-1),command,'uncertain retry preserves exact original request');assert.equal(held.length,2);held[1].resolve({...data,issues:[],changed:1});await tick();assert(!w.document.querySelector('#two [data-review-retry]'));
  }else{assert(!w.document.querySelector('#two [data-review-retry]'),'finished action must not leave dead Retry');assert.equal(w.document.querySelector('#two [data-review-refresh]').disabled,false,'finished action must unlock remounted view');}
  assert.equal(w.document.querySelector('#other').disabled,false);dom.window.close();
 }
 console.log('PASS delivery review action settlement across remount, definitive error, uncertainty and owner change');
})().catch(error=>{console.error(error);process.exitCode=1;});
