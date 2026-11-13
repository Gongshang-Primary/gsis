'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const fixture=require('./roster701-fixture.cjs'),adapter=require('./roster701-adapter.cjs');
const loadBackendRole=require('./load-backend-role.cjs');
const canonical=name=>fs.readFileSync('backend/'+name+'.gs','utf8');
const url='https://script.google.com/macros/s/existing-deploy-test/exec';
const build='test-roster-diag1';

function diagnostics(properties={},detected=url,role='roster'){
 const logs=[],fetches=[],cache=new Map(),secret='s'.repeat(64);
 const h=vm.createContext({GSIS_DEPLOY_VERSION:'test',console:{log:s=>logs.push(JSON.parse(s))},props_:()=>({getProperty:k=>properties[k]??(k==="GSIS_SECRET"||k==='CONTACTS_BRIDGE_SECRET'?secret:k==='CONTACTS_API_URL'?url:null)}),ScriptApp:{getService:()=>({getUrl:()=>{if(detected instanceof Error)throw detected;return detected;}})},Session:{getEffectiveUser:()=>({getEmail:()=> 'helper@gsps.edu.sg'})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null})},Utilities:{Charset:{UTF_8:'utf8'},getUuid:crypto.randomUUID},signature_:()=> 'signature',SpreadsheetApp:{openById:()=> ({})},GSISLayoutData:{publicView:()=> ({layoutRevision:2})},UrlFetchApp:{fetch:(endpoint,request)=>{
  fetches.push(endpoint);assert.equal(endpoint,url);const action=JSON.parse(JSON.parse(request.payload).payload).action;
  const data=action==='rosterProfile'?{user:{accessVerified:true,smc:false},timing:{backendVersion:'test',diagnosticBuild:build}}:{repository:'layout-current',layoutRevision:2,timing:{backendVersion:'test'}};
  return {getContentText:()=>JSON.stringify({ok:true,data}),getResponseCode:()=>200};
 }}});
 h.PropertiesService={getScriptProperties:h.props_};loadBackendRole(h,role);
 vm.runInContext(canonical('ApiSecret')+'\n'+canonical('Roster')+'\n'+canonical('LayoutDiagnostics'),h);
 Object.assign(h,{rosterFolder_:()=>({}),rosterIndex_:()=>({revision:1,entries:[]}),contacts_:()=>({user:{rosterSMC:false}}),layoutRepositoryId_:()=> 'layout-test',layoutRead_:()=>({snapshot:{}}),layoutCounts_:()=>({}),publicLayout_:()=>({layoutRevision:2}),out_:v=>({getContent:()=>JSON.stringify(v)})});
 return {h,logs,fetches,cache};
}

// Each fixed-role project resolves its own configured endpoint. Diagnostics do not
// infer the project role from the action sent to the published web app.
for(const role of ['roster','deploy']){
 const property=role==='roster'?'ROSTER_WEB_APP_URL':'DEPLOY_WEB_APP_URL',diagnose=h=>role==='roster'?h.diagnoseRoster():h.diagnoseLayout601();
 // An explicit URL wins even when automatic discovery is absent or throws.
 for(const detected of [null,'',new Error('Discovery unavailable'),'https://script.google.com/macros/s/wrong-deployment/exec']){
  const {h,fetches}=diagnostics({[property]:url},detected,role);
  assert.equal(diagnose(h).ready,true);assert.deepEqual(fetches,[url]);
 }
 assert.equal(diagnostics({},url,role).h.deployWebAppUrl_(),url,'a valid discovered URL remains a supported fallback');
 for(const value of ['http://script.google.com/macros/s/id/exec','https://evil.example/macros/s/id/exec',url+'?token=private',url+'#private',url+'/extra','https://script.google.com/macros/s/id/../exec','https://script.google.com/macros/s/../exec','https://script.google.com/macros/s/id%2Fother/exec',url+' ']){
  const {h,fetches,logs}=diagnostics({[property]:value},url,role),report=diagnose(h),check=report.checks.at(-1);
  assert.equal(report.ready,false);assert.equal(check.category,'configuration');assert.match(check.message,new RegExp(property));
  assert.equal(fetches.length,0);assert.doesNotMatch(JSON.stringify(logs),/private|evil\.example|existing-deploy-test/);
 }
 assert.throws(()=>diagnostics({},null,role).h.deployWebAppUrl_(),new RegExp('Set '+property));
}
{
 const good=diagnostics({ROSTER_WEB_APP_URL:url},null);good.cache.set('gsis-roster-diagnostic:failure',JSON.stringify({at:'2020-01-01T00:00:00Z',event:'roster-backend-failed'}));
 const report=good.h.diagnoseRoster();assert.equal(report.ready,true);assert.equal(report.recent.historyOnly,true);assert.equal(report.recent.lastFailure.historical,true);assert.equal(report.recent.lastFailure.at,'2020-01-01T00:00:00Z');
}

// Dated activation cannot override inactive Contacts status in the directory.
// It reads operational activations without register, timetable, quota or writes.
{
 const {O}=fixture(),date='2026-10-14',forbidden=()=>{throw Error('Directory performed a timetable read or write');};let reads=0;
 const h=vm.createContext({GSISRosterOperations:O,error_:(status,message)=>{throw Object.assign(Error(message),{status});}});
 loadBackendRole(h,'roster');
 vm.runInContext(canonical('RosterOperations'),h);
 Object.assign(h,{rosterToday_:()=>date,rosterOperationsState_:()=>{reads++;return {adhoc:[{staffId:'external',date},{staffId:'deleted',date,deletedAt:'2026-10-13T00:00:00Z'},{staffId:'other-day',date:'2026-10-15'}]};},rosterIndex_:forbidden,rosterModel_:forbidden,rosterOperationsQuota_:forbidden,rosterOperationsReadReconcile_:forbidden,rosterOperationsCommit_:forbidden,LockService:{getScriptLock:forbidden}});
 const c={user:{rosterSMC:false,rosterAdmin:false},rosterPeople:[{id:'alice',name:'Alice',active:true,mobile:'private',email:'private@example.test'},...['inactive','external','deleted','other-day'].map(id=>({id,name:id,active:false}))]};
 const result=h.rosterOperationsDispatch_({input:{operation:'directory',date},identity:{email:'helper@gsps.edu.sg'}},c);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{date,people:[{id:'alice',name:'Alice'}]});
 const later=h.rosterOperationsDispatch_({input:{operation:'directory',date:'2026-10-15'},identity:{email:'helper@gsps.edu.sg'}},c);
 assert.deepEqual(Array.from(later.people,p=>p.id),['alice']);assert.equal(reads,2);
 assert.throws(()=>h.rosterOperationsDispatch_({input:{operation:'directory',date:'invalid'},identity:{}},c),/date/i);assert.equal(reads,2,'invalid dates do not read operations');
 assert.throws(()=>h.rosterOperationsDispatch_({input:{operation:'directory'},identity:{}},{rosterPeople:[]}),/verified relief authority/);
}

// History and administrative snapshots do not reconcile unrelated current
// assignments; real timetable/absence invalidation reads retain that contract.
for(const input of [{operation:'history'},{operation:'audit'},{operation:'accounting'},{operation:'prunePreview',from:'2025-01-01',to:'2025-01-02'},{operation:'read',view:'prune'}]){
 const h=adapter();h.scope.rosterOperationsReadReconcile_=()=>{throw Error('A record snapshot attempted reconciliation');};
 assert.doesNotThrow(()=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:{...input,date:h.date}},{user:{rosterStaffId:h.ctx.user.staffId,rosterSMC:true,rosterAdmin:true},rosterPeople:h.ctx.people}));assert.equal(h.calls.writes,0);assert.equal(h.locked(),false);
 const strict=vm.createContext({GSISRosterOperations:h.O,Utilities:{formatDate:(_,tz,format)=>format==='yyyy-MM-dd'?h.date:format==='HH'?'08':'00',getUuid:crypto.randomUUID},rosterIndex_:()=>{throw Error('Snapshot read opened timetable register');}});
 loadBackendRole(strict,'roster');
 vm.runInContext(canonical('RosterOperations'),strict);
 const context=strict.rosterOperationsContext_({input,identity:h.ctx.user},{user:{rosterSMC:true,rosterAdmin:true},rosterPeople:h.ctx.people},h.state());assert.equal(Object.keys(context.days).length,0);
}
{
 const h=adapter();let reconciled=0;h.scope.rosterOperationsReadReconcile_=()=>{reconciled++;};h.call({operation:'read',view:'duties',date:h.date});assert.equal(reconciled,1,'live duties must still reconcile genuinely invalidated cover');
}

// Exercise the actual signed HTTP boundary, not only the service dispatcher.
{
 let source=fs.readFileSync('backend/Code.gs','utf8');
 for(const [marker,name] of [['GSIS_ROSTER_STORE','Roster'],['GSIS_ROSTER_OPERATIONS_STORE','RosterOperations']])source=source.replace(new RegExp('/\\* '+marker+'_BEGIN \\*/[\\s\\S]*?/\\* '+marker+'_END \\*/'),canonical(name));
 const secret='r'.repeat(64),properties={GSIS_SECRET:secret,CONTACTS_API_URL:'https://script.google.com/macros/s/contacts-test/exec'},calls={contacts:0,locks:0,writes:0};
 const h=vm.createContext({console:{log(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]||null})},Utilities:{Charset:{UTF_8:'utf8'},getUuid:crypto.randomUUID,computeHmacSha256Signature:(s,k,charset='utf8')=>[...crypto.createHmac('sha256',Buffer.from(k,charset)).update(s,charset).digest()]},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({setMimeType(){return this;},getContent:()=>text})},LockService:{getScriptLock:()=>{calls.locks++;throw Error('Diagnostic took a lock');}},UrlFetchApp:{fetch:(endpoint,request)=>{
  calls.contacts++;assert.equal(endpoint,properties.CONTACTS_API_URL);const envelope=JSON.parse(request.payload);assert.equal(envelope.signature,crypto.createHmac('sha256',secret).update(envelope.payload).digest('hex'));assert.equal(JSON.parse(envelope.payload).action,'rosterServiceDirectory');
  return {getContentText:()=>JSON.stringify({ok:true,data:{rosterPeople:[{id:'staff-private',mobile:'private',active:true}]}})};
 }}});
 vm.runInContext(loadBackendRole.sourceForRole(source,'roster'),h);loadBackendRole(h,'roster');h.rosterOperationsState_=()=>{calls.writes++;throw Error('Diagnostic opened mutable state');};
 function call(changes={},key=secret){const payload=JSON.stringify({action:'rosterService',service:'gsis-roster-notifier-v1',input:{operation:'connectionStatus'},timestamp:Date.now(),nonce:crypto.randomUUID(),...changes});return JSON.parse(h.doPost({postData:{contents:JSON.stringify({payload,signature:crypto.createHmac('sha256',key).update(payload).digest('hex')})}}).getContent());}
 const result=call();assert.equal(result.ok,true);assert.equal(result.data.readOnly,true);assert.equal(result.data.contactsReady,true);assert.doesNotMatch(JSON.stringify(result),/staff-private|mobile/);assert.equal(calls.contacts,1);assert.equal(calls.locks,0);assert.equal(calls.writes,0);
 assert.equal(call({},'wrong').status,401);assert.equal(call({timestamp:Date.now()-120000}).status,401);assert.equal(calls.contacts,1,'invalid signatures and stale requests cannot probe Contacts');
}

const manifest=JSON.parse(fs.readFileSync('backend/appsscript.json','utf8'));
assert(manifest.oauthScopes.includes('https://www.googleapis.com/auth/userinfo.email'));
assert(manifest.dependencies.enabledAdvancedServices.some(s=>s.userSymbol==='Drive'&&s.version==='v3'));
assert.equal(manifest.webapp.executeAs,'USER_DEPLOYING');assert.equal(manifest.webapp.access,'ANYONE_ANONYMOUS');
console.log('PASS v0.7.02 backend: configured/fallback diagnostics, historical logs, lightweight directory, record-only reads, signed non-sending service and owner manifest.');
