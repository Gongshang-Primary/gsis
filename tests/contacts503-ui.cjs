const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{JSDOM}=require('jsdom');
const source=fs.readFileSync('contacts-update/public/app.js','utf8').replace(/^import[^\n]+\n/,'').replace(/start\(\);\s*$/,'');
const pending={pending:true,source:'saved',asOf:'2026-10-06T03:00:00Z',hiddenRecords:0};
const person=(id,name)=>({id,name,basicName:name,statutoryName:name,active:'Y',role:'Teacher',mobile:'91234567',emails:{gsps:id+'@gsps.edu.sg',ces:id+'@schools.gov.sg',icon:''},groups:['Teaching']});
const boot=(roles=['Teacher'],viewState=pending)=>({user:{email:'viewer@gsps.edu.sg',roles},viewState,people:[person('one','Alpha'),person('two','Beta')],access:[],groups:['Teaching']});
const grid=(editable=false,viewState=pending)=>({editable,viewState,fields:['TTb Name','Basic Name','Statutory Name','Mobile No','Active'],lists:{Active:['Y','N']},rows:[{id:'one',values:['Alpha','Alpha','Alpha','91234567','Y'],computed:[true,false,false,false,false]}]});
const entry={requestId:'pending-id',digest:'fixed-digest',actor:'admin@gsps.edu.sg',at:'2026-10-06',recoverable:true,changes:[{id:'one',name:'Alpha',field:'Mobile No',expected:'91234567',value:'87654321'}],additions:[]};
function ui(mobile=false){const dom=new JSDOM(fs.readFileSync('contacts-update/public/index.html','utf8'),{url:'https://contacts.example',runScripts:'outside-only'}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext());w.AbortController=AbortController;w.structuredClone=structuredClone;w.matchMedia=()=>({matches:mobile});const copied=[],downloads=[];Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async value=>copied.push(value)}});w.URL.createObjectURL=()=> 'blob:contacts';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){downloads.push(this.download)};let fits=0;w.GSISTableFit=()=>fits++;run(fs.readFileSync('contacts-update/public/core.js','utf8').replace(/export /g,''));run(source);run('loadDeployment=()=>{}');return {w,run,el:id=>w.document.getElementById(id),copied,downloads,fits:()=>fits,close:()=>w.close()};}
(async()=>{
 // Every snapshot source opens for ordinary staff without touching the Admin journal.
 for(const source of ['saved','legacy','backup'])for(const mobile of [false,true]){
  const u=ui(mobile),calls=[];try{
   u.w.mock=async path=>{calls.push(path);if(path==='bootstrap')return boot(['Teacher'],{...pending,source,hiddenRecords:source==='legacy'?1:0});if(path==='diy')return grid(false,{...pending,source});throw Error('Unexpected '+path)};u.run('api=mock');await u.run("authenticateContacts('session')");
   assert.equal(u.el('app').classList.contains('hidden'),false);assert.equal(u.el('loginView').classList.contains('hidden'),true);assert.equal(u.el('contactRecovery').hidden,true);assert.equal(u.el('contactRecovery').closest('#loginView'),null);assert.equal(calls.includes('recovery-status'),false);assert.equal(u.el('contactRows').children.length,2);assert.equal(u.el('contactViewNotice').hidden,false);assert.match(u.el('contactViewNotice').textContent,/Editing is paused/);if(source==='legacy')assert.match(u.el('contactViewNotice').textContent,/1 affected contact is temporarily unavailable/);
   assert.deepEqual(JSON.parse(u.run('JSON.stringify(selectedColumns)')),mobile?['name','mobile','formTeacher']:['name','gsps','ces','mobile','formTeacher']);
   const filter=u.w.document.querySelector('[data-column-filter="name"]');filter.value='beta';filter.dispatchEvent(new u.w.Event('input',{bubbles:true}));assert.equal(u.el('contactRows').children.length,1);assert.match(u.el('contactRows').textContent,/Beta/);
   await u.el('contactHead').onclick({target:u.w.document.querySelector('[data-copy="name"]')});assert.deepEqual(u.copied,['Beta']);u.el('exportExcel').onclick();assert.deepEqual(u.downloads,['GSiS-contacts.xlsx']);assert.ok(u.fits()>=2,'compact widths reapplied after load/filter');
   await u.run("loadAux('diy')");assert.equal(u.el('diySave').disabled,true);assert.equal(u.w.document.querySelector('#diyGrid [aria-label="Mobile No"]').readOnly,true);await u.el('diySave').onclick();assert.equal(calls.some(x=>x.startsWith('save-')),false);
  }finally{u.close()}
 }
 // Corrupt legacy data with no trustworthy source must not claim a complete view.
 {
  const u=ui();try{
   u.w.mock=async path=>{if(path!=='bootstrap')throw Error(path);return {...boot(['Teacher'],{pending:true,source:'unavailable',asOf:'',hiddenRecords:0}),people:[]}};u.run('api=mock');await u.run("authenticateContacts('session')");assert.equal(u.el('app').classList.contains('hidden'),false);assert.equal(u.el('contactRows').children.length,0);assert.match(u.el('contactViewNotice').textContent,/needs administrator repair/);assert.equal(u.el('contactRecovery').hidden,true);assert.equal(u.el('exportExcel').disabled,true);
  }finally{u.close()}
 }
 // Admin recovery is a closed workspace panel. Read metadata disables every contact mutation.
 {
  const u=ui(),calls=[];try{
   u.w.mock=async path=>{calls.push(path);if(path==='bootstrap')return boot(['Admin']);if(path==='recovery-status')return {canRecover:true,pending:[entry]};if(path==='data')return grid();throw Error('Unexpected '+path)};u.run('api=mock');await u.run("authenticateContacts('session')");
   assert.equal(u.el('app').classList.contains('hidden'),false);assert.equal(u.el('contactRecovery').hidden,false);assert.equal(u.el('contactRecovery').open,false);assert.equal(u.el('contactRecovery').parentElement,u.el('app').querySelector('main'));assert.match(u.el('recoveryRequests').textContent,/Complete this saved change/);
   await u.run('loadContactData()');for(const id of ['saveData','addContactRow','recalculateData'])assert.equal(u.el(id).disabled,true,id);assert.equal(u.el('reloadData').disabled,false);assert.equal(u.w.document.querySelector('#dataGrid [aria-label="Basic Name"]').readOnly,true);
   u.run("dataEdits.set('one|1',{id:'one',field:'Basic Name',expected:'Alpha',value:'Local draft'})");await u.el('saveData').onclick();u.el('addContactRow').onclick();await u.el('recalculateData').onclick();assert.equal(u.run('newContactIds.size'),0);assert.equal(calls.some(x=>['save-data','recalculate-data'].includes(x)),false);assert.equal(u.run('dataEdits.size'),1);
   u.run('dataEdits.clear()');await u.run('loadContactData(true)');assert.equal(calls.filter(x=>x==='data').length,2,'read-only Reload stays usable');
  }finally{u.close()}
 }
 // Bootstrap can remain fast; a later data response independently advertises pending state.
 {
  const u=ui(),calls=[];try{
   u.w.mock=async path=>{calls.push(path);if(path==='bootstrap')return boot(['Admin'],{pending:false});if(path==='data')return grid(false);if(path==='recovery-status')return {canRecover:true,pending:[entry]};throw Error(path)};u.run('api=mock');await u.run("authenticateContacts('session')");assert.equal(u.el('contactViewNotice').hidden,true);await u.run('loadContactData()');assert.equal(u.el('contactViewNotice').hidden,false);assert.equal(u.el('saveData').disabled,true);assert.equal(u.el('addContactRow').disabled,true);assert.equal(u.el('recalculateData').disabled,true);assert.equal(u.el('reloadData').disabled,false);
   assert.equal(u.w.document.querySelector('#dataGrid [aria-label="Basic Name"]').readOnly,true);assert.ok(calls.includes('recovery-status'));
  }finally{u.close()}
 }
 // Refresh may update the visible directory without touching an immutable unconfirmed save.
 {
  const u=ui();try{
   u.w.mock=async path=>path==='bootstrap'?boot(['Admin']):path==='recovery-status'?{canRecover:true,pending:[entry]}:Promise.reject(Error(path));u.run('api=mock');u.w.initial=boot(['Admin'],{pending:false});u.w.table=grid(true,{pending:false});u.run("token='session';state=initial;contactData=table;dataEdits.set('one|1',{id:'one',field:'Basic Name',expected:'Alpha',value:'Local draft'});dataRequest=Object.freeze({requestId:'my-save',owner:state.user.email,payload:'immutable original'});show()");await u.run('refresh()');assert.equal(u.run('dataRequest.payload'),'immutable original');assert.equal(u.run('dataEdits.size'),1);assert.equal(u.w.document.querySelector('#dataGrid [aria-label="Basic Name"]').value,'Local draft');assert.equal(u.el('refresh').disabled,false);assert.equal(u.el('saveData').disabled,true);assert.equal(u.el('contactRows').children.length,2);
  }finally{u.close()}
 }
 // Once recovery completes, a cached read-only grid fetches fresh editable metadata.
 {
  const u=ui();let isPending=true,reads=0;try{
   u.w.mock=async path=>{if(path==='bootstrap')return boot(['Admin'],{...pending,pending:isPending});if(path==='recovery-status')return {canRecover:true,pending:isPending?[entry]:[]};if(path==='data'){reads++;return grid(!isPending,{...pending,pending:isPending})}throw Error(path)};u.run('api=mock');await u.run("authenticateContacts('session')");await u.run('loadContactData()');assert.equal(u.el('saveData').disabled,true);isPending=false;await u.run('refresh()');await u.run('loadContactData()');assert.equal(reads,2);assert.equal(u.el('contactRecovery').hidden,true);assert.equal(u.el('contactViewNotice').hidden,true);assert.equal(u.el('saveData').disabled,false);assert.equal(u.el('addContactRow').disabled,false);assert.equal(u.el('recalculateData').disabled,false);assert.equal(u.w.document.querySelector('#dataGrid [aria-label="Basic Name"]').readOnly,false);
  }finally{u.close()}
 }
 // An ordinary staff member's DIY draft survives a directory refresh too.
 {
  const u=ui();try{
   u.w.mock=async path=>path==='bootstrap'?boot(['Teacher']):Promise.reject(Error(path));u.run('api=mock');u.w.initial=boot(['Teacher'],{pending:false});u.w.table=grid(true,{pending:false});u.run("token='session';state=initial;auxTables.diy={data:table,rows:structuredClone(table.rows),edits:new Map([['one|3',{id:'one',field:'Mobile No',expected:'91234567',value:'87654321'}]]),dirty:false};show()");await u.run('refresh()');assert.equal(u.run('auxTables.diy.edits.size'),1);assert.equal(u.w.document.querySelector('#diyGrid [aria-label="Mobile No"]').value,'8765 4321');assert.equal(u.w.document.querySelector('#diyGrid [aria-label="Mobile No"]').readOnly,true);assert.equal(u.el('diySave').disabled,true);
  }finally{u.close()}
 }
 console.log('PASS 503 UI: pending saves preserve staff viewing/filter/copy/export, desktop/mobile defaults and compact fitting; Admin recovery stays in collapsed workspace panel; data metadata prevents writes; viewing Refresh retains Admin and DIY drafts.');
})().catch(e=>{console.error(e);process.exitCode=1});
