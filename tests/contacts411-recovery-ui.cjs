const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{JSDOM}=require('jsdom');
const dom=new JSDOM(fs.readFileSync('contacts-update/public/index.html','utf8'),{url:'https://contacts.example',runScripts:'outside-only'}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext());w.structuredClone=structuredClone;w.AbortController=AbortController;
const timeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>timeout(fn,[1000,2500].includes(ms)?0:ms);
run(fs.readFileSync('contacts-update/public/core.js','utf8').replace(/export /g,''));run(fs.readFileSync('contacts-update/public/app.js','utf8').replace(/^import[^\n]+\n/,'').replace(/start\(\);\s*$/,''));
const el=id=>w.document.getElementById(id),entry={requestId:'request-original',digest:'digest-original',actor:'admin@gsps.edu.sg',at:'2026-09-29',recoverable:true,changes:[{id:'s1',name:'<img src=x onerror=alert(1)>',field:'Active',expected:'Y',value:'N'}],additions:[]};
let blockNew=false,pending=true,writeCount=0,failOnce=true,canRecover=true,heldRead;const writes=[];
w.testAPI=async(path,body)=>{
 if(path==='save-data'&&blockNew)throw Object.assign(Error('Another saved request needs recovery'),{code:'CONTACTS_RECOVERY_REQUIRED',draftEditable:true});
 if(path==='bootstrap'){return {viewState:{pending,source:'saved'},user:{email:'admin@gsps.edu.sg',roles:['Admin']},people:[],access:[],groups:[]};}
 if(path==='recovery-status'){if(heldRead)return heldRead;return {canRecover,pending:canRecover?[entry]:[],user:{email:'admin@gsps.edu.sg'}};}
 if(path==='save-receipt')return {saved:!pending,pending,writing:false};
 if(path==='recover-save'){writeCount++;writes.push(JSON.parse(JSON.stringify(body)));if(failOnce){failOnce=false;throw Error('Connection interrupted')}pending=false;return {saved:true,requestId:entry.requestId};}
 throw Error('Unexpected '+path);
};run('api=testAPI;loadDeployment=()=>{}');
(async()=>{try{
 await run("authenticateContacts('session')");assert.equal(el('contactRecovery').hidden,false);assert.equal(el('app').classList.contains('hidden'),false);assert.equal(el('contactRecovery').parentElement,el('app').querySelector('main'));assert.equal(el('contactRecovery').open,false);assert.equal(w.document.querySelectorAll('#contactRecovery img').length,0);assert.match(el('recoveryRequests').textContent,/Active/);assert.equal(writeCount,0,'review must not mutate');
 let button=el('recoveryRequests').querySelector('button');await button.onclick();assert.equal(writeCount,1);assert.match(button.textContent,/Retry/);assert.equal(button.disabled,false);await button.onclick();assert.deepEqual(writes[1],writes[0]);assert.deepEqual(writes[0],{requestId:entry.requestId,digest:entry.digest});assert.equal(el('contactRecovery').hidden,true);assert.equal(el('app').classList.contains('hidden'),false);assert.equal(run('recoveryBusy'),false);
 // A different user's pending save must not lock a new draft that never reached the journal.
 blockNew=true;pending=true;run("contactData={editable:true,fields:['Basic Name','Active'],lists:{Active:['Y','N']},rows:[{id:'local',values:['Local','Y']}]};dataEdits.set('local|1',{id:'local',field:'Active',expected:'Y',value:'N'});renderData()");await el('saveData').onclick();assert.equal(run('dataRequest'),null);assert.equal(run('dataEdits.size'),1);assert.equal(el('contactRecovery').hidden,false);assert.equal(el('contactRecovery').parentElement,el('app').querySelector('main'));assert.equal(run('dataSaving'),false);
 // Non-admins receive no saved values or recovery action.
 canRecover=false;run("state.user.roles=['Teacher']");await run('showContactRecovery()');assert.equal(el('contactRecovery').hidden,true);assert.equal(el('recoveryRequests').children.length,0);
 // Results from an old account/recovery review must not return after session reset.
 canRecover=true;run("state.user.roles=['Admin']");let resolve;heldRead=new Promise(r=>resolve=r);const stale=run('showContactRecovery()');run('resetContactRecovery();token="another-account"');resolve({canRecover:true,pending:[entry]});await stale;assert.equal(el('contactRecovery').hidden,true);assert.equal(el('recoveryRequests').children.length,0);
 console.log('PASS workspace remains available during interrupted save, explicit review before write, escaped values, same-request timeout retry, successful re-entry, non-Admin privacy and stale-session isolation.');
}finally{w.close()}})().catch(e=>{console.error(e);process.exitCode=1});
