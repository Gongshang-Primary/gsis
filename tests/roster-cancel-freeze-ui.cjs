const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const until=async predicate=>{for(let n=0;n<100&&!predicate();n++)await new Promise(setImmediate);assert(predicate());};
const reason='Import stopped because the freeze was cancelled',sessionId='a'.repeat(64),requestId='fixture-import-request',freezeId='fixture-freeze-request';
async function check(mode){
 const dom=new JSDOM(fs.readFileSync('shared/edge-setup.html','utf8').replaceAll('__DOMAIN__','roster').replaceAll('__DOMAIN_LABEL__','Roster'),{url:'https://roster.gsps.edu.sg/edge-setup.html',runScripts:'outside-only'}),w=dom.window,calls=[];
 const scopes=[{scope:'roster',mode:'legacy'}],stopped={state:'failed',requiresRestart:true,sessionId,requestId,completedParts:0,totalParts:4,serverDriven:true,serverImport:{state:'stopped',code:'ROSTER_IMPORT_FREEZE_CANCELLED'}},freeze={supported:true,available:true,state:'frozen',active:true,requestId:freezeId};let statuses=0;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.setTimeout=callback=>{queueMicrotask(callback);return 1;};
 w.fetch=async(_,options)=>{const body=JSON.parse(options.body);calls.push(body);let data;
  if(body.operation==='status'){statuses++;data=mode==='status'||statuses>1?{scopes,canResume:true,importSession:stopped,cutoverFreeze:{...freeze,state:'cancelled',active:false}}:{scopes,cutoverFreeze:freeze};}
  else if(body.operation==='import')data={...stopped,state:'preparing',requiresRestart:false,serverImport:{state:'waiting'}};
  else{assert.equal(body.operation,'cancelFreeze');assert.equal(body.freezeId,freezeId);data={cutoverFreeze:{...freeze,state:'cancelled',active:false},importStopped:true};}
  return {ok:true,status:200,json:async()=>({ok:true,data})};
 };
 try{
  vm.runInContext(fs.readFileSync('shared/edge-setup.js','utf8'),dom.getInternalVMContext());await until(()=>!w.document.getElementById('op-import').disabled);
  if(mode==='poll')w.document.getElementById('op-import').click();
  if(mode==='cancel'){w.document.getElementById('op-cancelFreeze').click();w.document.getElementById('confirm-action').click();}
  await until(()=>w.document.getElementById('status-message').textContent.includes(reason));
  assert.equal(calls.filter(x=>x.operation==='import').length,mode==='poll'?1:0);assert.equal(statuses,mode==='poll'?2:1);
 }finally{dom.window.close();}
}
(async()=>{for(const mode of ['status','poll','cancel'])await check(mode);console.log('PASS cancelled-import reason on status, polling and confirmed cancellation; no automatic restart');})().catch(error=>{console.error(error);process.exitCode=1;});
