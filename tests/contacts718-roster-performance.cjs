// Real signed Contacts handlers against a synthetic workbook. No live services.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const fixture=require('./contacts503-fixture');
const current=fs.readFileSync('Contacts_Code.gs','utf8'),baseline=fs.readFileSync('Contacts_Backend_v0.7.17.gs','utf8');
const input={authorityOnly:true,rosterAuthority:true,rosterDirectory:true};
function setup(source=current){
 const f=fixture({source}),roles=f.sheets.get('roles'),people=f.sheets.get('contacts');
 for(const [role,groups] of [['Custom SMC',['SMC']],['Custom SL',['SMC','SL']],['Custom Support',['SMC','Support']]])roles.data.push(roles.data[0].map(k=>k==='Role Shortform'?role:groups.includes(k)?'1':''));
 for(const [i,role] of [[2,'Custom SMC'],[3,'Acting Custom SMC'],[4,'Custom SL'],[5,'Custom Support']])people.data[i][10]=role;
 people.data[2][3]='smc';people.data[6][3]='admin';
 const metadata={},book=f.ctx.SpreadsheetApp.openById('fixture');let insideAPI=false;
 function observe(object,name){const fn=object[name];object[name]=function(...args){if(!insideAPI)metadata[name]=(metadata[name]||0)+1;return fn.apply(this,args);};}
 for(const name of ['getSheetByName','getId'])observe(book,name);
 for(const sheet of f.sheets.values())for(const name of ['getLastRow','getLastColumn','getName'])observe(sheet,name);
 const batch=f.ctx.Sheets.Spreadsheets.Values.batchGet;
 f.ctx.Sheets.Spreadsheets.Values.batchGet=function(...args){insideAPI=true;try{return batch(...args)}finally{insideAPI=false}};
 f.run('var testDerivations=0;var originalDeriveContacts=deriveContacts_;deriveContacts_=function(...args){testDerivations++;return originalDeriveContacts(...args)}');
 const reset=f.reset;f.reset=()=>{reset();for(const key of Object.keys(metadata))delete metadata[key];f.run('testDerivations=0')};
 f.metadata=metadata;f.reset();return f;
}
function read(f,email='smc@gsps.edu.sg'){const out=f.post('deploySnapshot',input,email);assert.equal(out.ok,true,JSON.stringify(out));return out.data;}
function service(f){f.props.set('GSIS_SECRET','s'.repeat(32));f.props.set('ROSTER_SERVICE_SECRET','s'.repeat(32));const payload=JSON.stringify({action:'rosterServiceDirectory',service:'gsis-roster-notifier-v1',input:{},timestamp:Date.now(),nonce:crypto.randomUUID()});f.ctx.serviceRequest={postData:{contents:JSON.stringify({payload,signature:crypto.createHmac('sha256','s'.repeat(32)).update(payload).digest('hex')})}};const out=JSON.parse(f.run('doPost(serviceRequest).text'));assert.equal(out.ok,true,JSON.stringify(out));return out.data;}
const plain=data=>{const copy=JSON.parse(JSON.stringify(data));delete copy.timing;return copy};
const measurements={};
for(const [label,call]of [['signedRosterDirectory',read],['notificationServiceDirectory',service]]){
 const old=setup(baseline),next=setup(),before=call(old),after=call(next);
 assert.deepEqual(plain(after),plain(before),label+' retains complete person and custom role projection');
 assert.equal(after.timing.io.apiReads,1);assert.equal(before.timing.io.apiReads,1);
 assert.equal(next.stats.flush,0);assert.equal(next.stats.writes.length,0);assert.equal(next.stats.lockAttempts.length,0);
 const count=f=>Object.values(f.metadata).reduce((n,v)=>n+v,0);
 assert.ok(count(next)<count(old));assert.equal(next.metadata.getLastRow||0,0);assert.equal(next.metadata.getLastColumn||0,0);
 assert.ok(next.run('testDerivations')<old.run('testDerivations'));
 measurements[label]={before:{metadataMethods:count(old),methods:{...old.metadata},tableDerivations:old.run('testDerivations'),io:before.timing.io},after:{metadataMethods:count(next),methods:{...next.metadata},tableDerivations:next.run('testDerivations'),io:after.timing.io}};
}
// No authority cache: a later user request observes contact, role and Admin revocation.
{
 const f=setup();assert.equal(read(f).user.rosterSMC,true);
 f.sheets.get('roles').data.find(r=>r[0]==='Custom SMC')[f.sheets.get('roles').data[0].indexOf('SMC')]='';
 assert.equal(read(f).user.rosterSMC,false);assert.equal(read(f).rosterSMCIds.includes('staff-1'),false);
 f.sheets.get('contacts').data[2][15]='N';assert.equal(read(f).user.rosterStaffId,null);
 assert.equal(read(f,'admin@gsps.edu.sg').user.rosterAdmin,true);f.sheets.get('admin_users').data[1][2]='N';assert.equal(read(f,'admin@gsps.edu.sg').user.rosterAdmin,false);
 f.sheets.get('contacts').data[7][3]='admin';assert.deepEqual(read(f).rosterAdminIds,[],'Duplicate alias cannot select an Admin recipient');
}
// A writer publishing during a batch forces a new read; earlier Admin access is not accepted.
{
 const f=setup(),batch=f.ctx.Sheets.Spreadsheets.Values.batchGet;let calls=0;
 f.ctx.Sheets.Spreadsheets.Values.batchGet=(...args)=>{const result=batch(...args);if(++calls===1){f.props.set('CONTACTS_DATA_EPOCH','changed-during-read');f.sheets.get('admin_users').data[1][2]='N';}return result;};
 assert.equal(read(f,'admin@gsps.edu.sg').user.rosterAdmin,false);assert.equal(calls,2);
 f.seedSnapshot([{id:'staff-1',field:'Basic Name',expected:'Person 1',value:'Pending name'}]);assert.equal(f.post('deploySnapshot',input,'smc@gsps.edu.sg').status,503);
}
// Thirty independent identities still use thirty fresh reads and never queue on a writer lock.
{
 const f=setup();for(let i=0;i<30;i++)read(f,'person'+(i+20)+'@gsps.edu.sg');
 assert.equal(f.stats.reads.length,30);assert.equal(f.stats.lockAttempts.length,0);assert.equal(f.stats.writes.length,0);
 measurements.thirtyIndependentRequests={sheetsBatches:30,writerLocks:0,writes:0,note:'Sequential handler calls with independent signed identities; not a live concurrent load test.'};
}
// The established native fallback is used only when the Sheets service is unavailable.
{
 const f=setup(),api=read(f);f.ctx.Sheets=undefined;f.reset();const native=read(f);
 assert.deepEqual(plain(native),plain(api));assert.equal(native.timing.io.nativeReads,3);assert.equal(native.timing.io.apiReads,0);
}
// Failed or partial service reads cannot be converted into an empty/older directory.
for(const bad of [()=>{throw Error('Service unavailable')},()=>({valueRanges:[]})]){
 const f=setup();f.ctx.Sheets.Spreadsheets.Values.batchGet=bad;
 const result=f.post('deploySnapshot',input,'smc@gsps.edu.sg');assert.equal(result.ok,false);assert.equal(result.status,503);assert.equal(f.stats.writes.length,0);
}
// Strict Blob adapters reproduce the old missing-type failure; saved bytes remain identical.
{
 const f=setup(),blob=f.ctx.Utilities.newBlob,ungzip=f.ctx.Utilities.ungzip;
 f.ctx.Utilities.newBlob=(value,type,name)=>({...blob(value),getContentType:()=>type,getName:()=>name});
 f.ctx.Utilities.ungzip=value=>{assert.equal(value.getContentType(),'application/x-gzip');assert.equal(value.getName(),'contacts-view.json.gz');return ungzip(value)};
 const view=f.run("contactViewCapture_(SpreadsheetApp.openById(GSIS_SHEET))");f.ctx.testView=view;
 const recovered=f.run("contactViewUnpack_(contactViewPack_(testView,'proof'),'proof')");assert.deepEqual(JSON.parse(JSON.stringify(recovered)),JSON.parse(JSON.stringify(view)));
 const old=setup(baseline),oldBlob=old.ctx.Utilities.newBlob,oldUngzip=old.ctx.Utilities.ungzip;old.ctx.Utilities.newBlob=(value,type,name)=>({...oldBlob(value),getContentType:()=>type,getName:()=>name});old.ctx.Utilities.ungzip=value=>{if(value.getContentType()!=='application/x-gzip')throw Error('gzip type required');return oldUngzip(value)};old.ctx.testView=view;assert.throws(()=>old.run("contactViewUnpack_(contactViewPack_(testView,'proof'),'proof')"),/gzip type required/);
}
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/718-contacts-performance.json',JSON.stringify({scope:'Controlled source and metadata-method counts; no production latency claim',measurements},null,2)+'\n');
console.log('PASS Contacts 718: direct table reads reduce metadata calls, directory parity, custom roles, immediate revocation, concurrent-marker retry, native fallback, strict gzip and 30 independent identities.');
console.log(JSON.stringify(measurements,null,2));
