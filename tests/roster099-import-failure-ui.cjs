const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require(process.env.GSIS_TEST_JSDOM||'jsdom'),tick=()=>new Promise(resolve=>setTimeout(resolve,0));
(async()=>{
 const dom=new JSDOM(fs.readFileSync('roster-update/public/edge-setup.html','utf8'),{url:'https://roster.gsps.edu.sg/edge-setup.html',runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 const failureReason={status:503,message:'The stored source exceeds its size limit. <img src=x>',phase:'capture-serialize',elapsed:41335};
 const retained={state:'failed',sessionId:'a'.repeat(64),requestId:'failed-import-request',failureReason,lastPhase:'capture-serialize'};
 w.fetch=async(_url,options)=>({ok:true,status:200,json:async()=>({ok:true,data:JSON.parse(options.body).operation==='status'?{scopes:[{scope:'roster',mode:'legacy',revision:0}],canResume:true,importSession:retained}:{...retained,requiresRestart:true,imported:false,completedParts:0,totalParts:0}})});
 vm.runInContext(fs.readFileSync('shared/edge-setup.js','utf8'),dom.getInternalVMContext());await tick();await tick();
 let message=w.document.getElementById('status-message');assert.match(message.textContent,/capture-serialize/);assert.match(message.textContent,/41 s/);assert.match(message.textContent,/503/);assert.match(message.textContent,/stored source exceeds/);assert.equal(message.dataset.tone,'error');assert.equal(message.querySelector('img'),null,'diagnostics remain text');
 w.document.getElementById('op-import').click();await tick();await tick();assert.match(message.textContent,/capture-serialize/);assert.match(message.textContent,/explicitly restart/);assert.equal(JSON.parse(w.sessionStorage.getItem('gsis-edge-setup-v094:roster')).import,retained.requestId,'failure display preserves the original import identity');
 delete retained.failureReason;w.document.getElementById('op-status').click();await tick();await tick();assert.match(message.textContent,/Last phase: capture-serialize/,'killed execution shows its last durable phase');
 dom.window.close();console.log('PASS import failure UI: status reload, bounded text, phase/timing, restart guidance and retained identity.');
})().catch(e=>{console.error(e);process.exitCode=1;});
