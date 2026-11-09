'use strict';
// Real ownership guard; no compatibility fixture is used in this isolation test.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function host(kind,enabled='true',owner='roster-project'){
 let writes=0,network=0;const values={ROSTER_WRITER_ENABLED:enabled,ROSTER_OWNER_SCRIPT_ID:owner,ROSTER_ROOT_FOLDER_ID:'root',ROSTER_ARCHIVE_FOLDER_ID:'archive',ROSTER_DATA_FOLDER_ID:'data'},props={getProperty:k=>values[k]??null,setProperty:()=>{writes++;},getProperties:()=>({...values})};
 const scope=vm.createContext({console:{log:()=>{}},PropertiesService:{getScriptProperties:()=>props},props_:()=>props,ScriptApp:{getScriptId:()=> 'roster-project',getOAuthToken:()=>{network++;throw Error('Unexpected network');}},MailApp:{sendEmail:()=>{network++;}},UrlFetchApp:{fetch:()=>{network++;}},error_:(status,message)=>{throw Object.assign(Error(message),{status});}});
 if(kind!==undefined)vm.runInContext('const GSIS_BACKEND_KIND='+JSON.stringify(kind),scope);
 vm.runInContext(fs.readFileSync('backend/BackendRole.gs','utf8'),scope);return {scope,values,counts:()=>({writes,network})};
}
const rejects=fn=>assert.throws(fn,e=>e.status===503);
for(const kind of [undefined,'combined','',null]){const h=host(kind);rejects(()=>h.scope.gsisRequireBackendRole_('roster'));rejects(()=>h.scope.gsisRequireBackendRole_('deploy'));}
for(const [enabled,owner] of [['false','roster-project'],['TRUE','roster-project'],['true','other-project'],['true','']]){const h=host('roster',enabled,owner);rejects(()=>h.scope.gsisRequireBackendRole_('roster'));assert.deepEqual(h.counts(),{writes:0,network:0});}
for(const kind of ['deploy','roster']){
 const h=host(kind),other=kind==='deploy'?'roster':'deploy';assert.equal(h.scope.gsisRequireBackendRole_(kind),kind);rejects(()=>h.scope.gsisRequireBackendRole_(other));
 for(const action of ['rosterProfile','rosterRead','rosterUpload','rosterUpdate','rosterOperations','rosterInbox','rosterService'])if(kind==='roster')assert.equal(h.scope.gsisRequireBackendAction_(action),'roster');else rejects(()=>h.scope.gsisRequireBackendAction_(action));
 for(const action of ['change','sync','lease','active','publicLayout','publicCampus'])if(kind==='deploy')assert.equal(h.scope.gsisRequireBackendAction_(action),'deploy');else rejects(()=>h.scope.gsisRequireBackendAction_(action));
 assert.throws(()=>h.scope.gsisRequireBackendAction_('unknown'),e=>e.status===404);
}
for(const kind of ['deploy','roster']){
 const h=host(kind,kind==='roster'?'false':'true');
 for(const file of ['Roster','RosterOperations','RosterInbox','RosterAuditExport','StaplerLeases'])vm.runInContext(fs.readFileSync('backend/'+file+'.gs','utf8'),h.scope);
 for(const name of ['rosterOperationsCommit_','rosterOperationsDispatch_','rosterOperationsPreparedDispatch_','rosterServiceDispatch_','rosterScheduledDispatch_','rosterDailyEmploymentMailDispatch_','rosterInboxCommit_','rosterInboxDispatch_','rosterInboxServiceDispatch_','rosterAllocationAuditExport_','rosterAllocationAuditFolder_','rosterAllocationAuditArchive_','rosterStaplerLeaseWrite_','rosterStaplerLeaseDispatch_','rosterCommit_','rosterDispatch_','rosterCreateFile_'])rejects(()=>h.scope[name]({}));
 rejects(()=>h.scope.rosterDriveRequest_('https://example.test',{method:'patch'},'guard-test'));assert.deepEqual(h.counts(),{writes:0,network:0},'wrong-role and paused direct calls fail before writes, provider calls or mail');
}
{
 const h=host('roster');for(const file of ['FieldStore','LayoutRepository','Planning','VersionNotes','NoticeAcknowledgement'])vm.runInContext(fs.readFileSync('backend/'+file+'.gs','utf8'),h.scope);
 for(const name of ['fieldPersist_','fieldRecover_','fieldApplyRows_','fieldIndexWrite_','fieldJournalWrite_','recoverFieldCommit','migrateFieldStore','preparePerformance404','preparePerformance418','prepareLegacyRollback','layoutStore_','layoutMirror_','prepareLayoutRepository501','saveLayoutAdmin501','repairLayoutTables501','syncLayoutPublication_','retryLayoutPublication501','syncPublishedCatalogues_','saveVersionNote_','acknowledgeNotices_'])rejects(()=>h.scope[name]({},{},{}));assert.deepEqual(h.counts(),{writes:0,network:0},'Roster cannot repair, migrate or publish Deploy/Layout state');
}
console.log('PASS v0.8.4 backend roles: fail-closed builds, explicit owner activation, route separation, direct cron/mail/audit/inbox/lease/baseline guards and Deploy recovery isolation.');
// Exercise the complete request envelope for both built roles. Only the terminal
// dispatches are replaced: signature freshness and role/owner gates stay real.
{
 const code=fs.readFileSync('backend/Code.gs','utf8');
 for(const kind of ['deploy','roster']){
  const properties={GSIS_SECRET:'x'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40),ROSTER_WRITER_ENABLED:'true',ROSTER_OWNER_SCRIPT_ID:'roster-project',ROSTER_ROOT_FOLDER_ID:'root',ROSTER_ARCHIVE_FOLDER_ID:'archive',ROSTER_DATA_FOLDER_ID:'data'};let routed=0;
  const scope=vm.createContext({console:{log:()=>{}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]||null,getProperties:()=>({...properties})})},ScriptApp:{getScriptId:()=> 'roster-project'},Utilities:{getUuid:()=> '00000000-0000-4000-8000-000000000000'},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})}});
  vm.runInContext(code.replace("const GSIS_BACKEND_KIND='deploy';","const GSIS_BACKEND_KIND='"+kind+"';"),scope);
  scope.signature_=()=> 'valid';scope.rosterDiagnostic_=()=>{};scope.contacts_=()=>({user:{roles:['Admin']}});scope.rosterDispatch_=scope.rosterServiceDispatch_=scope.dispatch_=()=>{routed++;return {routed:true};};
  const request=(action,signature='valid')=>JSON.parse(scope.doPost({postData:{contents:JSON.stringify({payload:JSON.stringify({action,...(action==='rosterService'?{service:'gsis-roster-notifier-v1'}:{}),timestamp:Date.now(),nonce:'00000000-0000-4000-8000-000000000000',identity:{email:'test@gsps.edu.sg',subject:'test'},input:{}}),signature})}}).text);
  assert.equal(request(kind==='roster'?'rosterProfile':'sync').ok,true);assert.equal(routed,1);
  assert.equal(request(kind==='roster'?'sync':'rosterProfile').ok,false);assert.equal(routed,1);
  assert.equal(request('rosterService').ok,kind==='roster');assert.equal(routed,kind==='roster'?2:1);
  assert.equal(request('rosterProfile','invalid').status,401,'role gate never substitutes for signature verification');
  if(kind==='roster'){properties.ROSTER_WRITER_ENABLED='false';assert.equal(request('rosterProfile').ok,false);assert.equal(request('rosterService').ok,false);assert.equal(routed,2,'pausing blocks both school and worker routes');}
 }
 console.log('PASS complete backend HTTP envelope: both build roles, signed school/service routing, paused owner, unchanged signature gate.');
}
{
 for(const kind of ['deploy','roster']){
  const h=host(kind),right='https://script.google.com/macros/s/'+kind+'-backend/exec';h.values.DEPLOY_WEB_APP_URL='https://script.google.com/macros/s/deploy-backend/exec';h.values.ROSTER_WEB_APP_URL='https://script.google.com/macros/s/roster-backend/exec';
  vm.runInContext(fs.readFileSync('backend/Roster.gs','utf8'),h.scope);assert.equal(h.scope.deployWebAppUrl_(),right);
  delete h.values[kind==='roster'?'ROSTER_WEB_APP_URL':'DEPLOY_WEB_APP_URL'];h.scope.ScriptApp.getService=()=>({getUrl:()=> 'https://script.google.com/macros/s/this-project/exec'});assert.equal(h.scope.deployWebAppUrl_(),'https://script.google.com/macros/s/this-project/exec','missing own URL never selects the other backend property');
 }
 console.log('PASS role-specific diagnostic self URLs and current-project fallback.');
}
