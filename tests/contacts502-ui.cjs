const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('contacts-update/public/app.js','utf8').replace(/^import[^\n]+\n/,'').replace(/start\(\);\s*$/,'');
function ui(){const dom=new JSDOM(fs.readFileSync('contacts-update/public/index.html','utf8'),{url:'https://contacts.example',runScripts:'outside-only'}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext());w.AbortController=AbortController;w.structuredClone=structuredClone;const timeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>timeout(fn,[1000,2500].includes(ms)?0:ms);run(fs.readFileSync('contacts-update/public/core.js','utf8').replace(/export /g,''));run(source);run("token='session';state={user:{email:'admin@gsps.edu.sg',roles:['Admin']},people:[],access:[],groups:[]};loadDeployment=()=>{}");return {w,run,el:id=>w.document.getElementById(id),close:()=>w.close()};}
const entry={requestId:'original-save',digest:'original-digest',actor:'another-admin@gsps.edu.sg',at:'2026-10-06',recoverable:true,changes:[],additions:[{id:'new-contact',values:{'Basic Name':'New AE',Role:'AE',Active:'Y'}}]};
const bootstrap=()=>({user:{email:'admin@gsps.edu.sg',roles:['Admin']},people:[],access:[],groups:[]});
(async()=>{
 for(const mode of ['already-applied','busy-late','write-late','conflict','uncertain']){
  const u=ui(),calls=[],writes=[];let saved=mode==='already-applied',receipts=0,retrying=false;
  try{
   u.w.mock=async(path,body)=>{calls.push(path);
    if(path==='recovery-status')return {canRecover:true,pending:[entry]};
    if(path==='save-receipt'){receipts++;if(mode==='busy-late'&&receipts>=3)saved=true;return {saved,pending:!saved,writing:mode==='busy-late'&&!saved};}
    if(path==='recover-save'){writes.push(structuredClone(body));if(mode==='conflict')throw Object.assign(Error('Another editor changed the value. Review the conflict.'),{status:409});if(mode==='uncertain'&&!retrying)throw Object.assign(Error('Response too slow'),{status:503});saved=true;if(mode==='write-late')throw Object.assign(Error('Acknowledgement lost'),{status:503});return {saved:true};}
    if(path==='bootstrap')return bootstrap();throw Error('Unexpected '+path);
   };u.run('api=mock');await u.run('showContactRecovery()');const button=u.el('recoveryRequests').querySelector('button');await button.onclick();
   if(mode==='conflict'){assert.match(u.el('recoveryStatus').textContent,/Review the conflict/);assert.equal(receipts,1,'confirmed conflict does not spend time polling');assert.equal(u.el('contactRecovery').hidden,false);assert.equal(button.disabled,false);}
   else if(mode==='uncertain'){assert.equal(u.el('contactRecovery').hidden,false);assert.equal(receipts,4,'one preflight plus three bounded confirmation checks');assert.equal(button.disabled,false);retrying=true;await button.onclick();assert.deepEqual(writes[1],writes[0]);assert.equal(u.el('contactRecovery').hidden,true);}
   else{assert.equal(u.el('contactRecovery').hidden,true);assert.equal(u.el('app').classList.contains('hidden'),false);assert.equal(writes.length,mode==='write-late'?1:0,'late/earlier completion and active writer never replay');}
   for(const body of writes)assert.deepEqual(body,{requestId:entry.requestId,digest:entry.digest});assert.equal(u.run('recoveryBusy'),false);
  }finally{u.close()}
 }
 // Ordinary Retry Save checks the existing receipt first and refreshes the
 // confirmed display without resending a save whose acknowledgement was lost.
 {
  const u=ui();let saved=false,saveWrites=0;
  try{
   u.run("contactData={editable:true,fields:['TTb Name','Basic Name','Active','EO Appt Level'],lists:{Active:['Y','N']},rows:[{id:'staff',values:['Old','Old','Y',''],computed:[true,false,false,true]}]};renderData();");
   u.w.mock=async path=>{if(path==='save-data'){saveWrites++;throw Object.assign(Error('Lost response'),{status:503});}if(path==='save-receipt')return {saved,pending:!saved};if(path==='data')return {editable:true,fields:['TTb Name','Basic Name','Active','EO Appt Level'],lists:{Active:['Y','N']},rows:[{id:'staff',values:['New','New','Y',''],computed:[true,false,false,true],formalRole:'Head of Department',groups:['KP']}]};throw Error(path)};u.run('api=mock');
   const input=u.w.document.querySelector('[aria-label="Basic Name"]');input.value='New';input.dispatchEvent(new u.w.Event('input'));await u.el('saveData').onclick();const original=u.run('dataRequest.payload');assert.equal(u.w.document.querySelector('[aria-label="Basic Name"]').readOnly,true);saved=true;await u.el('saveData').onclick();assert.equal(saveWrites,1);assert.equal(u.run('state.people.find(p=>p.id==="staff").name'),'New');assert.equal(u.run('state.people.find(p=>p.id==="staff").formalRole'),'Head of Department');assert.equal(u.run('state.people.find(p=>p.id==="staff").groups[0]'),'KP');assert.equal(u.run('dataRequest'),null);assert.equal(u.run('dataEdits.size'),0);assert.equal(u.w.document.querySelector('[aria-label="Basic Name"]').readOnly,false);assert.equal(u.el('dataStatus').textContent,'Saved');assert.match(original,/New/);
  }finally{u.close()}
 }
 // An old recovery receipt must not write or re-enter the app after a session
 // changes while the read is in flight.
 {
  const u=ui();let resolve,writes=0;
  try{u.w.mock=async path=>path==='recovery-status'?{canRecover:true,pending:[entry]}:path==='save-receipt'?new Promise(r=>resolve=r):(writes++,{saved:true});u.run('api=mock');await u.run('showContactRecovery()');const pending=u.el('recoveryRequests').querySelector('button').onclick();u.run("resetContactRecovery();token='different-session'");resolve({saved:false,pending:true});await pending;assert.equal(writes,0);assert.equal(u.el('contactRecovery').hidden,true);assert.equal(u.run('recoveryBusy'),false);}finally{u.close()}
 }
 console.log('PASS 502 Contacts UI: confirmation before replay, running writer and late receipts, lost acknowledgement, same-ID uncertainty retry, immediate conflicts, editable confirmed saves and stale-account isolation.');
})().catch(e=>{console.error(e);process.exitCode=1});
