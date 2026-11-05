'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(setImmediate),digest='a'.repeat(64);
async function setup(handler,retained={}){
 const dom=new JSDOM(fs.readFileSync('shared/edge-setup.html','utf8').replaceAll('__DOMAIN__','roster').replaceAll('__DOMAIN_LABEL__','Roster'),{url:'https://roster.test/edge-setup.html',runScripts:'outside-only'}),w=dom.window,calls=[],key='gsis-edge-setup-v094:roster';
 w.sessionStorage.setItem(key,JSON.stringify(retained));w.URL.createObjectURL=()=> 'blob:fixture';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const scopes=mode=>['roster','roster-register'].map(scope=>({scope,mode,revision:mode==='legacy'?0:1}));
 w.fetch=async(_,options)=>{const body=JSON.parse(options.body);calls.push(body);const result=body.operation==='status'?{data:{scopes:scopes('legacy'),canResetAfterRollback:true,cutoverFreeze:{supported:true,active:true,state:'frozen',requestId:'current-freeze'}}}:await handler(body,calls);return {ok:(result.status||200)<400,status:result.status||200,json:async()=>result.envelope||{ok:true,data:result.data||{}}};};
 vm.runInContext(fs.readFileSync('shared/edge-setup.js','utf8'),dom.getInternalVMContext());await tick();await tick();
 const click=async id=>{w.document.getElementById(id).click();await tick();await tick();};
 const confirm=async op=>{await click('op-'+op);if(op==='freshStart'){w.document.getElementById('fresh-confirmation').value='START FRESH';w.document.getElementById('fresh-confirmation').dispatchEvent(new w.Event('input'));}await click('confirm-action');};
 return {w,calls,key,click,confirm,close:()=>dom.window.close(),ids:()=>JSON.parse(w.sessionStorage.getItem(key))};
}
const prepared=body=>({data:{freshStart:true,imported:true,requestId:body.requestId,sessionId:digest,sourceDigest:digest,scopes:['roster','roster-register'].map(scope=>({scope,mode:'imported',revision:1}))}});
async function resetAllowsNewFreshStart(operation){
 const old='old-fresh-request',retained=operation==='resetAfterRollback'?{freshStart:old,freshStartInput:{effectiveDate:'2026-11-04',copyConfig:true},import:old,session:digest}:{};
 const h=await setup(body=>body.operation==='freshStart'?prepared(body):body.operation==='restart'?{data:{restarted:true,cleanupPending:false}}:body.operation==='resetAfterRollback'?{data:{reset:true}}:{data:{}},retained);
 try{
  if(operation==='restart'){await h.confirm('freshStart');await h.click('op-export');h.w.document.getElementById('reviewed').checked=true;h.w.document.getElementById('reviewed').dispatchEvent(new h.w.Event('change'));}
  const previous=h.ids().freshStart;assert(previous);await h.confirm(operation);
  assert(!h.w.document.getElementById('fresh-effective-date').disabled,'confirmed '+operation+' unlocks fresh date');assert(!h.w.document.getElementById('fresh-copy-config').disabled);assert(!Object.hasOwn(h.ids(),'freshStart'));assert(!Object.hasOwn(h.ids(),'freshStartInput'));
  await h.click('op-status');h.w.document.getElementById('fresh-effective-date').value='2026-11-03';h.w.document.getElementById('fresh-copy-config').checked=false;await h.confirm('freshStart');const next=h.calls.filter(body=>body.operation==='freshStart').at(-1);assert.notEqual(next.requestId,previous);assert.equal(next.effectiveDate,'2026-11-03');assert.equal(next.copyConfig,false);
 }finally{h.close();}
}
async function validationAllowsCorrection(code){
 let first=true;const h=await setup(body=>{if(body.operation==='freshStart'&&first){first=false;return {status:400,envelope:{ok:false,status:400,code,error:'Choose valid fresh-start options.'}};}return prepared(body);});
 try{await h.confirm('freshStart');const rejected=h.calls.find(body=>body.operation==='freshStart');assert(!h.w.document.getElementById('fresh-effective-date').disabled,code+' is a proven pre-capture rejection');assert(!Object.hasOwn(h.ids(),'freshStartInput'));h.w.document.getElementById('fresh-effective-date').value='2026-11-03';await h.confirm('freshStart');const accepted=h.calls.filter(body=>body.operation==='freshStart').at(-1);assert.notEqual(accepted.requestId,rejected.requestId);assert.equal(accepted.effectiveDate,'2026-11-03');}finally{h.close();}
}
async function uncertainRetainsIdentity(outcome){
 let first=true;const h=await setup(body=>{if(body.operation==='freshStart'&&first){first=false;if(outcome==='network')throw Error('Connection lost');return {status:outcome===400?400:outcome===409?409:503,envelope:{ok:false,status:outcome===400?400:outcome===409?409:503,code:outcome===400?'ROSTER_IMPORT_PREPARATION_RESULT':outcome===409?'ROSTER_FRESH_START_FREEZE':'ROSTER_BRIDGE_TIMEOUT',error:'Outcome not confirmed.'}};}return prepared(body);});
 try{await h.confirm('freshStart');const initial=h.calls.find(body=>body.operation==='freshStart');assert(h.w.document.getElementById('fresh-effective-date').disabled,'uncertain '+outcome+' retains options');assert.equal(h.ids().freshStart,initial.requestId);await h.confirm('freshStart');assert.deepEqual(h.calls.filter(body=>body.operation==='freshStart').at(-1),initial,'uncertain retry preserves exact request and options');}finally{h.close();}
}
async function incompleteResetRetainsIdentity(operation){
 const retained={freshStart:'retained-fresh-request',freshStartInput:{effectiveDate:'2026-11-04',copyConfig:true},import:'retained-fresh-request',session:digest},h=await setup(body=>body.operation==='restart'?{data:{restarted:false,cleanupPending:true}}:body.operation==='resetAfterRollback'?{data:{reset:false}}:{data:{}},retained);
 try{if(operation==='restart'){await h.click('op-export');h.w.document.getElementById('reviewed').checked=true;h.w.document.getElementById('reviewed').dispatchEvent(new h.w.Event('change'));}await h.confirm(operation);assert.equal(h.ids().freshStart,retained.freshStart);assert.deepEqual(h.ids().freshStartInput,retained.freshStartInput);assert(h.w.document.getElementById('fresh-effective-date').disabled,'incomplete reset keeps the captured input locked');}finally{h.close();}
}
(async()=>{for(const operation of ['restart','resetAfterRollback']){await resetAllowsNewFreshStart(operation);await incompleteResetRetainsIdentity(operation);}for(const code of ['ROSTER_FRESH_START_INPUT','ROSTER_FRESH_START_DATE'])await validationAllowsCorrection(code);for(const outcome of ['network',400,409,503])await uncertainRetainsIdentity(outcome);console.log('PASS fresh-start retries: confirmed reset/restart clears identity, pre-capture validation permits correction, uncertain outcomes retain exact request');})().catch(error=>{console.error(error);process.exitCode=1;});
