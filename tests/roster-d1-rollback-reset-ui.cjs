const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(setImmediate);
async function setup(allowed){
 const dom=new JSDOM(fs.readFileSync('shared/edge-setup.html','utf8').replaceAll('__DOMAIN__','roster').replaceAll('__DOMAIN_LABEL__','Roster'),{url:'https://roster.gsps.edu.sg/edge-setup.html',runScripts:'outside-only'}),w=dom.window,calls=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.fetch=async(_,options)=>{const body=JSON.parse(options.body);calls.push(body);return {ok:true,status:200,json:async()=>({ok:true,data:body.operation==='status'?{canResetAfterRollback:allowed,scopes:[{scope:'roster',mode:'active'},{scope:'roster-register',mode:'active'}]}:{reset:true,canResetAfterRollback:false,scopes:[{scope:'roster',mode:'legacy'},{scope:'roster-register',mode:'legacy'}]}})};};
 vm.runInContext(fs.readFileSync('shared/edge-setup.js','utf8'),dom.getInternalVMContext());await tick();await tick();return {dom,w,calls,click:async id=>{w.document.getElementById(id).click();await tick();await tick();}};
}
(async()=>{
 const blocked=await setup(false);assert(blocked.w.document.getElementById('op-resetAfterRollback').disabled);await blocked.click('op-resetAfterRollback');assert.equal(blocked.calls.length,1);blocked.dom.window.close();
 const h=await setup(true),doc=h.w.document;assert.equal(doc.getElementById('op-resetAfterRollback').disabled,false);await h.click('op-resetAfterRollback');assert(doc.getElementById('confirmation').open);assert.match(doc.getElementById('confirm-description').textContent,/Google.*writable.*legacy/);assert.equal(h.calls.length,1);
 await h.click('confirm-action');assert.equal(h.calls.at(-1).operation,'resetAfterRollback');assert(h.calls.at(-1).requestId);assert.match(doc.getElementById('status-message').textContent,/Start a new import/);assert.equal(doc.getElementById('op-import').disabled,false);assert(doc.getElementById('op-resetAfterRollback').disabled);h.dom.window.close();console.log('PASS rollback reset UI: proof gate, explicit confirmation, stable request and fresh-import controls');
})().catch(error=>{console.error(error);process.exitCode=1});
