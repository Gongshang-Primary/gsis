// Build-time role plus an explicit, project-bound Roster activation gate.
// A role is never inferred from the request or automatically claimed from Drive.
function gsisBackendKind_(){
 const kind=typeof GSIS_BACKEND_KIND==='undefined'?null:GSIS_BACKEND_KIND;
 if(!['deploy','roster'].includes(kind))throw Object.assign(Error('This backend build has no valid ownership role. Install the matching complete backend.'),{status:503,code:'BACKEND_ROLE_INVALID'});
 return kind;
}
function gsisRequireBackendRole_(required){
 const kind=gsisBackendKind_();
 if(!['deploy','roster'].includes(required)||kind!==required)throw Object.assign(Error('This action belongs to the '+required+' backend. Check the configured endpoint.'),{status:503,code:'BACKEND_ROLE_MISMATCH'});
 if(kind==='roster'){
  const p=PropertiesService.getScriptProperties(),owner=p.getProperty('ROSTER_OWNER_SCRIPT_ID');
  if(p.getProperty('ROSTER_WRITER_ENABLED')!=='true'||!owner||owner!==ScriptApp.getScriptId())throw Object.assign(Error('The Roster backend is paused or is not the configured owner. Complete the single-owner cutover before enabling it.'),{status:503,code:'ROSTER_OWNER_INACTIVE'});
 }
 return kind;
}
function gsisRequireBackendAction_(action){
 const roster=['rosterProfile','rosterRead','rosterUpload','rosterUpdate','rosterOperations','rosterInbox','rosterService'];
 const deploy=['deployPowerUsers','deployEdge','bootstrap','sync','lease','change','active','access','receipt','delta','relief','auditPage','versionNote','publishReview','acknowledgeNotices','landmarkUnit','landmarkSearch','campusProfile','renameCampusUnit','publicLayout','publicCampus'];
 if(!roster.includes(action)&&!deploy.includes(action))throw Object.assign(Error('Unknown backend action.'),{status:404});
 return gsisRequireBackendRole_(roster.includes(action)?'roster':'deploy');
}
// Editor diagnostic only. This never changes ownership, installs triggers, or writes data.
function showBackendOwnership(){
 const kind=gsisBackendKind_(),p=PropertiesService.getScriptProperties(),scriptId=ScriptApp.getScriptId();
 const result={kind,scriptId,rosterEnabled:p.getProperty('ROSTER_WRITER_ENABLED')==='true',rosterOwnerMatches:p.getProperty('ROSTER_OWNER_SCRIPT_ID')===scriptId};
 console.log(JSON.stringify(result));return result;
}
