const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(setImmediate),until=async predicate=>{for(let n=0;n<100&&!predicate();n++)await tick();assert(predicate());};
(async()=>{
 const dom=new JSDOM(fs.readFileSync('shared/edge-setup.html','utf8').replaceAll('__DOMAIN__','roster').replaceAll('__DOMAIN_LABEL__','Roster'),{url:'https://roster.gsps.edu.sg/edge-setup.html',runScripts:'outside-only'}),w=dom.window,calls=[],sessionId='a'.repeat(64);let statusCalls=0,releaseStatus;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.setTimeout=callback=>{queueMicrotask(callback);return 1;};
 w.fetch=async(_,options)=>{
  const body=JSON.parse(options.body);calls.push(body);let data;
  if(body.operation==='status'){
   statusCalls++;
   if(statusCalls===1)data={scopes:[{scope:'roster',mode:'legacy'}]};
   else data=await new Promise(resolve=>{releaseStatus=resolve;});
  }else{assert.equal(body.operation,'import');data={serverDriven:true,serverImport:{state:'waiting'},sessionId,completedParts:0,totalParts:4,imported:false};}
  return {ok:true,status:200,json:async()=>({ok:true,data})};
 };
 vm.runInContext(fs.readFileSync('shared/edge-setup.js','utf8'),dom.getInternalVMContext());await until(()=>!w.document.getElementById('op-import').disabled);w.document.getElementById('op-import').click();await until(()=>releaseStatus);
 assert.equal(calls.filter(body=>body.operation==='import').length,1);assert.match(w.document.getElementById('status-message').textContent,/You can close this page; the Worker continues/);
 // Leave a page status request stalled while server work finishes. Displaying
 // that eventual result must not submit another import or advance any part.
 releaseStatus({scopes:[{scope:'roster',mode:'imported'}],importSession:{serverDriven:true,sessionId,imported:true,completedParts:4,totalParts:4}});
 await until(()=>/Import confirmed/.test(w.document.getElementById('status-message').textContent));assert.equal(calls.filter(body=>body.operation==='import').length,1);assert.equal(statusCalls,2);dom.window.close();
 console.log('PASS server import UI: one start, status-only progress, stalled status response and no browser continuation');
})().catch(error=>{console.error(error);process.exitCode=1;});
