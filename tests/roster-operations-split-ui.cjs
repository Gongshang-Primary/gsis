'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom'),crypto=require('node:crypto');
(async()=>{
 const source=fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8'),dom=new JSDOM('<div id="root"></div>'),root=dom.window.document.querySelector('#root'),calls=[];
 const scope=vm.createContext({crypto,esc:s=>String(s),isLive:()=>true,say:()=>{}});vm.runInContext(source.slice(source.indexOf('function storageHtml('),source.indexOf('function drawPrune(')),scope);
 const storage={layout:'single',parts:1,total:100,limit:16000000,revision:7,storageToken:'token',largestPart:{name:'Roster operations.json',chars:100}};
 root.innerHTML=scope.storageHtml(storage);const s={data:{},ctx:{api:async(route,command)=>{calls.push({...command});if(calls.length===1)throw Error('Response lost');return {...storage,layout:'split',parts:3,storageToken:'new-token'};}}};scope.bindStorage(s,root,storage);let button=root.querySelector('[data-storage-convert]');await button.onclick();assert.equal(button.disabled,false);await button.onclick();assert.equal(calls.length,2);assert.equal(calls[0].requestId,calls[1].requestId);assert.deepEqual(calls[0],calls[1]);assert.equal(root.querySelector('[data-storage-convert]').dataset.storageConvert,'joinOperations');assert.match(root.textContent,/split/);console.log('PASS conversion UI retains request after uncertain response and displays current layout');
 const worker=await import('../roster-update/public/_worker.js');for(const operation of ['storageReport','splitOperations','joinOperations']){const value=await worker.trustedOperationsInput({operation},{},{email:'admin@example.test'});assert.deepEqual(value.calendarByDate,{});}console.log('PASS storage operations do not depend on Calendar');
 dom.window.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
