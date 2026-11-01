/* The configured Roster project owns these files. Immutable data, one manifest commit. */
const rosterFolderSettings=rosterFolderSettings_();
const ROSTER_ROOT=rosterFolderSettings.ROSTER_ROOT_FOLDER_ID||'1YTYau20Nvkj3BS-IsE4CYaJW1nIdaD91';
const ROSTER_ARCHIVE=rosterFolderSettings.ROSTER_ARCHIVE_FOLDER_ID||'1_9CnZI2DggC0cJc1l6fU0kH0BaJr2eEl';
const ROSTER_DATA=rosterFolderSettings.ROSTER_DATA_FOLDER_ID||'14M4imcYdcrfiUax_LckvWwrqU83_9rlb';
function rosterFolderSettings_(){
 // Deploy-only builds must boot without any Roster installation settings.
 if(gsisBackendKind_()==='deploy')return {};
 if(typeof PropertiesService==='undefined')return {};
 const properties=PropertiesService.getScriptProperties(),keys=['ROSTER_ROOT_FOLDER_ID','ROSTER_ARCHIVE_FOLDER_ID','ROSTER_DATA_FOLDER_ID'],values=keys.map(name=>properties.getProperty(name)),deploy=properties.getProperty('DEPLOY_SHEET_ID');
 // Read once per execution; custom installations must never borrow legacy folders.
 if((deploy&&deploy!=='1gXyYNbb8tHKDsb3Q3yepLEuc3cjsbbAsfLl7_XACfls'||values.some(Boolean))&&values.some(value=>!value))throw Error('Set all three Roster folder IDs in Script Properties: ROSTER_ROOT_FOLDER_ID, ROSTER_ARCHIVE_FOLDER_ID and ROSTER_DATA_FOLDER_ID. Custom installations cannot use the legacy folders.');
 for(let i=0;i<keys.length;i++)if(values[i]&&!/^[A-Za-z0-9_-]+$/.test(values[i]))throw Error(keys[i]+' must contain a Drive folder ID, not a URL.');
 return Object.fromEntries(keys.map((key,i)=>[key,values[i]]));
}
// Drive v3 creates directly in the Shared Drive parent. Never retry an uncertain
// create here: the existing request ID and filename recover it on the next save.
const rosterFolderCache_={};
function rosterDriveFailure_(detail){
 const reasons=detail.reasons||[];
 let message='Roster Drive request failed. Check the Drive status and reason in diagnostics.';
 if(reasons.some(x=>['accessNotConfigured','SERVICE_DISABLED'].includes(x)))message='Enable Google Drive API for the Roster script project. In Apps Script, add the Drive API service.';
 else if(reasons.some(x=>['ACCESS_TOKEN_SCOPE_INSUFFICIENT','insufficientPermissions','authError','TOKEN_UNAVAILABLE'].includes(x))||detail.httpStatus===401)message='Authorise full Drive access using the account that deploys this web app, then redeploy the existing deployment.';
 else if(reasons.includes('insufficientFilePermissions'))message='The web app execution account cannot write to this Roster folder or file.';
 else if(reasons.includes('domainPolicy'))message='The Workspace policy blocks this Drive operation.';
 else if(reasons.some(x=>/quota|limit/i.test(x))||detail.httpStatus===429)message='A Drive quota or limit blocked this operation. See the diagnostic reason.';
 else if(detail.httpStatus===404)message='The Roster file or folder is missing or inaccessible to the web app execution account.';
 if(typeof deployTrace_!=='undefined'&&deployTrace_)deployTrace_.rosterDrive=detail;
 const error=Object.assign(new Error(message),{status:503,rosterDrive:detail});throw error;
}
function rosterDriveRequest_(url,options,operation,preparation=false){
 if(typeof rosterEdgeAssertLegacyWrite_==='function'&&String(options?.method||'get').toLowerCase()!=='get'&&!(typeof rosterMirrorWriteAllowed_==='function'&&rosterMirrorWriteAllowed_()))rosterEdgeAssertLegacyWrite_(preparation);
 if(!['get','head'].includes(String(options?.method||'get').toLowerCase()))gsisRequireBackendRole_('roster');
 const started=Date.now(),detail={operation,httpStatus:null,reasons:[]};
 let token,response;
 try{token=ScriptApp.getOAuthToken();}catch(e){rosterDriveFailure_({...detail,reasons:['TOKEN_UNAVAILABLE'],elapsedMs:Date.now()-started});}
 try{response=UrlFetchApp.fetch(url,{...options,headers:{...(options.headers||{}),Authorization:'Bearer '+token},muteHttpExceptions:true,followRedirects:false});}
 catch(e){rosterDriveFailure_({...detail,reasons:['NETWORK_ERROR'],elapsedMs:Date.now()-started});}
 detail.httpStatus=response.getResponseCode();detail.elapsedMs=Date.now()-started;
 if(detail.httpStatus<200||detail.httpStatus>=300){
  const known=['accessNotConfigured','SERVICE_DISABLED','ACCESS_TOKEN_SCOPE_INSUFFICIENT','insufficientPermissions','insufficientFilePermissions','authError','forbidden','domainPolicy','notFound','rateLimitExceeded','userRateLimitExceeded','dailyLimitExceeded','storageQuotaExceeded','teamDriveFileLimitExceeded','teamDriveHierarchyTooDeep','backendError','invalid','badRequest'];
  try{const e=JSON.parse(response.getContentText()).error;detail.reasons=[...new Set([...(e?.errors||[]),...(e?.details||[])].map(x=>x.reason).filter(x=>known.includes(x)))];}catch(ignore){}
  if(!detail.reasons.length)detail.reasons=['UNCLASSIFIED'];
  rosterDriveFailure_(detail);
 }
 if(typeof deployTrace_!=='undefined'&&deployTrace_)deployTrace_.rosterDrive=detail;
 return response;
}
function rosterDriveJson_(response,operation){
 try{const data=JSON.parse(response.getContentText());if(data&&typeof data==='object')return data;}catch(ignore){}
 rosterDriveFailure_({operation,httpStatus:response.getResponseCode(),reasons:['INVALID_RESPONSE']});
}
function rosterFolder_(id){
 if(rosterFolderCache_[id])return rosterFolderCache_[id];
 const url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?supportsAllDrives=true&fields='+encodeURIComponent('mimeType,driveId,capabilities(canAddChildren,canEdit)');
 const folder=rosterDriveJson_(rosterDriveRequest_(url,{},'folder-metadata'),'folder-metadata');
 if(folder.mimeType!=='application/vnd.google-apps.folder')rosterDriveFailure_({operation:'folder-metadata',httpStatus:200,reasons:['INVALID_FOLDER']});
 return rosterFolderCache_[id]=folder;
}
function rosterFindFile_(folderId,name){
 const folder=rosterFolder_(folderId),quote=value=>String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
 const query="'"+quote(folderId)+"' in parents and name = '"+quote(name)+"' and trashed = false";
 const base='https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100&fields='+encodeURIComponent('files(id),nextPageToken,incompleteSearch')+'&q='+encodeURIComponent(query)+(folder.driveId?'&corpora=drive&driveId='+encodeURIComponent(folder.driveId):'&corpora=user');
 let page='';
 do{
  const result=rosterDriveJson_(rosterDriveRequest_(base+(page?'&pageToken='+encodeURIComponent(page):''),{},'file-discovery'),'file-discovery');
  if(!Array.isArray(result.files)||result.incompleteSearch)rosterDriveFailure_({operation:'file-discovery',httpStatus:200,reasons:['INCOMPLETE_SEARCH']});
  if(result.files.length){if(typeof result.files[0].id!=='string'||!result.files[0].id)rosterDriveFailure_({operation:'file-discovery',httpStatus:200,reasons:['INVALID_RESPONSE']});return result.files[0].id;}
  page=result.nextPageToken||'';
 }while(page);
 return '';
}
function rosterReadFile_(id){return rosterDriveRequest_('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?supportsAllDrives=true&alt=media',{},'file-read').getContentText();}
function rosterCreateFile_(folderId,name,blob){const preparation=typeof rosterEdgeExportImportFolderId_==='string'&&!!rosterEdgeExportImportFolderId_&&folderId===rosterEdgeExportImportFolderId_;if(typeof rosterEdgeAssertLegacyWrite_==='function'&&!(typeof rosterMirrorWriteAllowed_==='function'&&rosterMirrorWriteAllowed_()))rosterEdgeAssertLegacyWrite_(preparation);gsisRequireBackendRole_('roster');
 const bytes=blob.getBytes(),mimeType=blob.getContentType()||'application/octet-stream';
 const start=rosterDriveRequest_('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id',{method:'post',contentType:'application/json; charset=UTF-8',headers:{'X-Upload-Content-Type':mimeType,'X-Upload-Content-Length':String(bytes.length)},payload:JSON.stringify({name,parents:[folderId],mimeType})},'upload-start',preparation);
 const headers=start.getAllHeaders(),key=Object.keys(headers).find(x=>x.toLowerCase()==='location'),location=key&&headers[key];
 if(typeof location!=='string'||!/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?/.test(location))rosterDriveFailure_({operation:'upload-start',httpStatus:start.getResponseCode(),reasons:['INVALID_UPLOAD_LOCATION']});
 const result=rosterDriveJson_(rosterDriveRequest_(location,{method:'put',contentType:mimeType,payload:bytes},'file-create',preparation),'file-create');
 if(typeof result.id!=='string'||!result.id)rosterDriveFailure_({operation:'file-create',httpStatus:200,reasons:['INVALID_RESPONSE']});
 return result.id;
}
// Both editor diagnostics use the existing deployment; an explicit property
// avoids ScriptApp returning no URL for a valid versioned deployment.
function deployWebAppUrl_(){
 const kind=gsisBackendKind_(),property=kind==='roster'?'ROSTER_WEB_APP_URL':'DEPLOY_WEB_APP_URL',configured=props_().getProperty(property);
 const valid=value=>typeof value==='string'&&/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(value);
 if(configured){if(valid(configured))return configured;throw Object.assign(Error(property+' must be this '+kind+' backend’s /exec URL.'),{code:'DEPLOY_URL_CONFIGURATION'});}
 let detected;try{detected=ScriptApp.getService().getUrl();}catch(ignore){}
 if(valid(detected))return detected;
 throw Object.assign(Error('Set '+property+' in this '+kind+' project’s Script Properties to its /exec URL. Automatic URL discovery was unavailable.'),{code:'DEPLOY_URL_CONFIGURATION'});
}
// Diagnostics are metadata only. No identity, timetable content, URLs or secrets.
function rosterDiagnosticBuild_(){return GSIS_DEPLOY_VERSION+'-roster-diag1';}
function rosterDiagnosticText_(value){
 let text=String(value||'');
 try{const p=props_();for(const key of ['GSIS_SECRET','BRIDGE_SECRET','CONTACTS_BRIDGE_SECRET']){const secret=p.getProperty(key);if(secret)text=text.split(secret).join('[secret]');}}catch(ignore){}
 return text.replace(/https?:\/\/\S+/gi,'[URL]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/[A-Za-z0-9_+/=-]{28,}/g,'[identifier]').slice(0,900);
}
function rosterDiagnosticError_(error){
 if(error?.code==='ROSTER_CUTOVER_FROZEN')return 'Roster is being moved; try again shortly.';
 if(error?.rosterDrive)return error.message;
 if(['DEPLOY_URL_CONFIGURATION','GSIS_SECRET_INVALID'].includes(error?.code))return error.message;
 const message=String(error?.message||error||'');
 const safe=['Relief records are full. Ask Admin to review storage capacity before retrying this same report.','Invalid request','Invalid signature','Expired request','Invalid identity','Request too large','Run setupDeploy.','Configure Contacts API connection in Deploy Script Properties.','Contacts returned an invalid response. Check its existing web-app deployment and access settings; your draft is retained.','Contacts did not return verified Roster authority. Update the existing Contacts web app deployment.','Roster register needs review.','Another save is running. Retry this save.','SMC membership is required to manage baseline timetables.','BRIDGE_SECRET is missing or too short.','CONTACTS_API_URL must be the existing Contacts /exec URL.','CONTACTS_BRIDGE_SECRET is missing or too short.','Run this check using the school account that owns the deployment.','Contacts did not return boolean rosterSMC. Check its deployed version.','No published /exec URL was found for this script.'];
 if(safe.includes(message))return message;
 if(error?.name==='SyntaxError')return 'Invalid JSON or script syntax. See the phase and source location.';
 if(/permission|access denied|authoriz|scope|not have access/i.test(message))return 'Google service access or authorisation failed. Check the deployment account and permissions.';
 if(/quota|too many times|rate limit/i.test(message))return 'A Google service quota or rate limit was reached.';
 if(/timed? ?out|timeout|too long/i.test(message))return 'A service request timed out.';
 if(/not found|no item|does not exist|cannot find/i.test(message))return 'A required resource was not found or is not accessible.';
 if(error?.name==='ReferenceError'||error?.name==='TypeError')return error.name+' in the backend. See the phase and source location.';
 return 'The operation failed. See the phase, service status and source location. Raw exception text is withheld because it can contain staff data.';
}
// Public failure metadata is a fixed stage name and release label, never exception text.
function rosterFailureDetail_(error){
 const phases=['bridge-signature','request-freshness','request-identity','contacts-config','contacts-fetch','contacts-json','contacts-result','operations-location','operations-read','operations-json','operations-schema','stapler-unpack','stapler-json','stapler-identity','stapler-proof','stapler-validation','stapler-ready','calculation-source','history-read','peer-mail-review'];
 const t=typeof deployTrace_==='undefined'?{}:deployTrace_||{},phase=String(error?.failurePhase||t.phase||'').replace(/^roster\./,'');
 const groups={'calculations-index':'calculation-source','calculations-source':'calculation-source','calculations-history-read':'history-read','calculations-history':'history-read','contacts-authority':'contacts','state-read':'operations-read',context:'timetable','register-read':'timetable','register-json':'timetable','register-schema':'timetable','timetable-read':'timetable','timetable-json':'timetable','timetable-validation':'timetable',quota:'calculation-source',projection:'plan-read',commit:'save','response-serialize':'response','response-create':'response'};
 const operations=['nextAbsenceIntake','deferAbsenceIntake','prepareNotification','requestMutual','saveSchoolAbsence','renameStapler','scheduledRoster','sendPeerMail','peerMailReview','reviewPeerMail','claimNotifications','prepareNotifications','notificationResult','notificationResults','inboxPendingDispatch','inboxReplyPrepare','inboxReplyResult','inboxAlertPrepare','inboxAlertResult','deliveryReviewMailDispatch','dailyEmploymentMailDispatch','processAbsenceIntake','flushAbsenceIntake','captureAbsenceIntake','retryAbsenceIntake','resolveAbsenceIntake','timetableBatch','timetableDay','timetableCacheManifest','read','saveAbsence','saveInstructions','saveStapler','confirmStapler','publishStapler','resetStapler','moveStapler','restoreStapler','deleteStapler','reliefBatch','publish','notifyDaily','autoAllocate','optimise','receiptStatus'];
 const codes=['ROSTER_CUTOVER_FROZEN','ROSTER_STORAGE_CAPACITY','GSIS_SECRET_INVALID','ABSENCE_PREPARATION_RETRY','ABSENCE_INTAKE_BUSY','ABSENCE_INTAKE_PENDING','CONTACTS_RECOVERY_REQUIRED','STAPLER_BASELINE_CONFLICT','STAPLER_CONFLICT','PEER_MAIL_REVIEW_CONFLICT','TIMETABLE_BATCH_CHANGED','TIMETABLE_BATCH_TOO_LARGE','CELL_CONFLICT','ABSENCE_CONFLICT','ALLOCATION_IN_PROGRESS','ALLOCATION_UNCONFIRMED','ALLOCATION_CANCELLED','ALLOCATION_ABANDONED','ALLOCATION_CUTOFF'];
 return {backendVersion:GSIS_DEPLOY_VERSION,failureStage:phases.includes(phase)?phase:groups[phase]||'backend',...(operations.includes(t.operation)?{operation:t.operation}:{}),...(codes.includes(error?.code)?{code:error.code}:{})};
}
function rosterDiagnosticLog_(record){
 const text=JSON.stringify(record);
 try{console.log(text);}catch(ignore){try{Logger.log(text);}catch(unavailable){}}
}
function rosterDiagnostic_(event,detail){
 if(typeof deployTrace_==='undefined'||!deployTrace_)return;
 const t=deployTrace_;
 const record={event,at:new Date().toISOString(),backendVersion:t.backendVersion,diagnosticBuild:t.diagnosticBuild,diagnosticId:t.requestId,action:t.action||'unidentified',...(t.operation?{operation:t.operation}:{}),...(t.commandId?{commandId:t.commandId}:{}),authenticated:t.authenticated===true,phase:t.phase,elapsedMs:Date.now()-t.started,...(t.contactsResponse?{contacts:t.contactsResponse}:{}),...(t.rosterSummary?{roster:t.rosterSummary}:{}),...(t.rosterDrive?{drive:t.rosterDrive}:{}),...(detail||{})};
 rosterDiagnosticLog_(record);
 // A small, temporary fallback for web-app executions whose logs are not visible.
 // Cache can expire early; absence is never evidence of success. No business writes.
 if(t.rosterDiagnostic||!t.action&&event==='roster-backend-failed')try{
  const cache=CacheService.getScriptCache();cache.put('gsis-roster-diagnostic:last',JSON.stringify(record),21600);
  if(event==='roster-backend-failed')cache.put('gsis-roster-diagnostic:failure',JSON.stringify(record),21600);
 }catch(ignore){}
}
function rosterStage_(phase){
 // Keep the current phase in memory. The final response or failure persists it once.
 if(typeof deployTrace_!=='undefined'&&deployTrace_?.rosterDiagnostic)deployTrace_.phase=phase;
}
// Run this from the editor immediately after reproducing the Roster failure.
function showRosterDiagnostics(){
 const report={backendVersion:GSIS_DEPLOY_VERSION,diagnosticBuild:rosterDiagnosticBuild_(),readOnly:true,historyOnly:true,capturedAt:new Date().toISOString(),latest:null,lastFailure:null,note:'Cached history only, retained for up to six hours. Timestamps identify earlier requests; an old failure does not fail the current diagnostic. Cache may expire early. No record does not prove success.'};
 try{const cache=CacheService.getScriptCache();report.latest=JSON.parse(cache.get('gsis-roster-diagnostic:last')||'null');report.lastFailure=JSON.parse(cache.get('gsis-roster-diagnostic:failure')||'null');}catch(e){report.cacheError=rosterDiagnosticError_(e);}
 if(report.lastFailure)report.lastFailure.historical=true;
 rosterDiagnosticLog_(report);return report;
}
// Editor-only reads. Tests the owner's Contacts authority and the published profile.
// The published URL may differ from Roster's configured URL; compare the build and reference.
function diagnoseRoster(){
 const previousTrace=typeof deployTrace_==='undefined'?null:deployTrace_;
 deployTrace_=null;
 const report={backendVersion:GSIS_DEPLOY_VERSION,diagnosticBuild:rosterDiagnosticBuild_(),readOnly:true,checks:[],recent:showRosterDiagnostics()};
 const check=(name,fn)=>{try{const value=fn();report.checks.push({name,ok:true,...value});return value;}catch(e){report.checks.push({name,ok:false,status:e.status||null,...(e.code==='DEPLOY_URL_CONFIGURATION'?{category:'configuration'}:{}),message:rosterDiagnosticError_(e),...(e.rosterDrive?{drive:e.rosterDrive}:{})});return null;}};
 try{
  check('Connection settings',()=>{const p=props_();if((gsisApiSecret_('BRIDGE_SECRET')||'').length<32)throw Error('BRIDGE_SECRET is missing or too short.');if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(p.getProperty('CONTACTS_API_URL')||''))throw Error('CONTACTS_API_URL must be the existing Contacts /exec URL.');if((gsisApiSecret_('CONTACTS_BRIDGE_SECRET')||'').length<32)throw Error('CONTACTS_BRIDGE_SECRET is missing or too short.');return {configured:true};});
  const identity=check('Editor school identity',()=>{const email=Session.getEffectiveUser().getEmail().toLowerCase();if(!/^[^@\s]+@gsps\.edu\.sg$/.test(email))throw Error('Run this check using the school account that owns the deployment.');return {identity:{email,subject:email}};});
  // Remove the identity immediately; it is used only in the signed read requests.
  const who=identity?.identity;if(identity)delete report.checks[report.checks.length-1].identity;
  if(who)check('Contacts Roster authority',()=>{const c=contacts_(who,false,'deploySnapshot',{authorityOnly:true,rosterAuthority:true});if(typeof c?.user?.rosterSMC!=='boolean')throw Error('Contacts did not return boolean rosterSMC. Check its deployed version.');return {accessVerified:true,smc:c.user.rosterSMC};});
  check('Roster folders and register',()=>{for(const id of [ROSTER_ROOT,ROSTER_ARCHIVE,ROSTER_DATA])rosterFolder_(id);const index=rosterIndex_();return {revision:index.revision,timetables:index.entries.length};});
  if(who)check('Published Roster profile',()=>{
   const url=deployWebAppUrl_(),secret=gsisApiSecret_('BRIDGE_SECRET');
   if(!secret||secret.length<32)throw Error('BRIDGE_SECRET is missing or too short.');
   const diagnosticId=Utilities.getUuid(),payload=JSON.stringify({action:'rosterProfile',input:{},identity:who,timestamp:Date.now(),nonce:diagnosticId,traceId:diagnosticId});
   const response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify({payload,signature:signature_(payload,secret)}),muteHttpExceptions:true,followRedirects:true}),raw=response.getContentText();
   let result;try{result=JSON.parse(raw);}catch(e){return {ok:false,diagnosticId,httpStatus:response.getResponseCode(),format:/^\s*</.test(raw)?'html':'invalid-json',message:'Published app returned no JSON envelope. Check its web app access and deployment.'};}
   const summary={diagnosticId,httpStatus:response.getResponseCode(),status:result?.ok?200:result?.status||503,backendVersion:result?.data?.timing?.backendVersion,diagnosticBuild:result?.data?.timing?.diagnosticBuild};
   if(!result?.ok)return {...summary,ok:false,message:'The published app returned an error or invalid envelope. Match diagnosticId to showRosterDiagnostics.'};
   if(result.data?.user?.accessVerified!==true||typeof result.data?.user?.smc!=='boolean')return {...summary,ok:false,message:'The published Roster profile is incomplete.'};
   if(summary.diagnosticBuild!==report.diagnosticBuild)return {...summary,ok:false,message:'The published web app does not contain this diagnostic build. Save and redeploy the existing web app.'};
   return {...summary,smc:result.data.user.smc,timetables:Array.isArray(result.data.entries)?result.data.entries.length:null};
  });
  report.ready=report.checks.length===5&&report.checks.every(x=>x.ok);report.note='Read checks only. This does not test Cloudflare settings, another user, or upload writes.';
  rosterDiagnosticLog_(report);return report;
 }finally{deployTrace_=previousTrace;}
}
// Run from the editor as the deployment owner to authorise and check Drive reads.
function checkRosterAccess(){
 const folders=[['Roster',ROSTER_ROOT],['Previous Timetables',ROSTER_ARCHIVE],['Operational Data',ROSTER_DATA]];
 const report={backendVersion:GSIS_DEPLOY_VERSION,diagnosticBuild:rosterDiagnosticBuild_(),readOnly:true,folders:[]};
 try{report.fullDriveAuthorisation=String(ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL,['https://www.googleapis.com/auth/drive']).getAuthorizationStatus());}catch(e){report.fullDriveAuthorisation='Check unavailable';}
 for(const [label,id] of folders){try{const f=rosterFolder_(id);report.folders.push({label,ok:true,sharedDrive:!!f.driveId,canAddChildren:f.capabilities?.canAddChildren??null,canEdit:f.capabilities?.canEdit??null});}catch(e){report.folders.push({label,ok:false,message:rosterDiagnosticError_(e),...(e.rosterDrive?{drive:e.rosterDrive}:{})});}}
 try{const index=rosterIndex_();report.register={ok:true,revision:index.revision,timetables:index.entries.length};}catch(e){report.register={ok:false,message:rosterDiagnosticError_(e),...(e.rosterDrive?{drive:e.rosterDrive}:{})};}
 rosterDiagnosticLog_(report);return report;
}
// Run once in the editor as the web app deployment account when Drive consent is required.
function authoriseRosterWrites(){
 ScriptApp.requireScopes(ScriptApp.AuthMode.FULL,['https://www.googleapis.com/auth/drive']);
 return checkRosterAccess();
}
function rosterToday_(){return Utilities.formatDate(new Date(),'Asia/Singapore','yyyy-MM-dd');}
function rosterIndex_(){
 rosterStage_('register-location');let id=props_().getProperty('ROSTER_INDEX_FILE');
 if(!id){rosterStage_('register-discovery');id=rosterFindFile_(ROSTER_DATA,'Roster register.json');}
 let x={schema:1,revision:0,entries:[],receipts:[]};
 if(id){rosterStage_('register-read');const raw=typeof rosterNativeRead_==='function'?rosterNativeRead_(id,{json:'register-json',parts:'register-parts'}):rosterReadFile_(id);rosterStage_('register-json');x=JSON.parse(raw);rosterStage_('register-schema');if(x.schema!==1||!Array.isArray(x.entries)||!Number.isInteger(x.revision))error_(503,'Roster register needs review.');}
 if(typeof deployTrace_!=='undefined'&&deployTrace_?.rosterDiagnostic)deployTrace_.rosterSummary={...(deployTrace_.rosterSummary||{}),registerFound:!!id,revision:x.revision,timetables:x.entries.length};
 rosterStage_('register-ready');return x;
}
function rosterCommit_(index){if(typeof rosterEdgeAssertLegacyWrite_==='function')rosterEdgeAssertLegacyWrite_();gsisRequireBackendRole_('roster');
 const data=JSON.stringify(index),storedId=props_().getProperty('ROSTER_INDEX_FILE');
 const venueTicket=typeof rosterVenuesBegin_==='function'?rosterVenuesBegin_('index',index):null;
 let id=storedId||rosterFindFile_(ROSTER_DATA,'Roster register.json');
 const root=id?JSON.parse(rosterReadFile_(id)):null,split=root?.format==='gsis-roster-operations-split-v1';
 if(split){const previousId=id,prepared=rosterSplitPrepareDocument_(index,{folderId:root.folderId,previousId});id=prepared.commit(()=>{if((props_().getProperty('ROSTER_INDEX_FILE')||previousId)!==previousId)throw Object.assign(Error('Roster register changed. Retry against the latest saved state.'),{status:409});});}
 else if(id)rosterDriveRequest_('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(id)+'?uploadType=media&supportsAllDrives=true&fields=id',{method:'patch',contentType:'application/json; charset=UTF-8',payload:data},'register-update');
 else id=rosterCreateFile_(ROSTER_DATA,'Roster register.json',Utilities.newBlob(data,'application/json'));
 if(split||!storedId)props_().setProperty('ROSTER_INDEX_FILE',id);
 if(typeof rosterVenuesEnd_==='function')rosterVenuesEnd_(venueTicket);
}
function rosterPublic_(entry){if(!entry)return null;const {id,name,from,to,priority,pruned,teacherCount,layoutMode,createdBy,createdAt}=entry;return {id,name,from,to,priority,pruned,teacherCount,layoutMode,createdBy,createdAt};}
function rosterStatus_(index,day,smc){const choice=GSISRoster.currentOrNext(index.entries,day),selected=rosterPublic_(choice.entry);return {revision:index.revision,active:choice.selection==='current'?selected:null,upcoming:choice.selection==='upcoming'?selected:null,selected,selection:choice.selection,...(smc?{entries:index.entries.map(rosterPublic_)}:{})};}
function rosterModel_(entry){
 if(!entry)return null;
 // Only uploaded model files are immutable. Register validity and Contacts authority
 // are still read fresh; each cache hit parses a new object for this request.
 const key='gsis-roster-model:v1:'+entry.id+':'+entry.modelFile;
 try{const cached=CacheService.getScriptCache().get(key);if(cached)return GSISRoster.validate(JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(cached),'application/x-gzip','roster-model.json.gz')).getDataAsString()));}catch(ignore){}
 rosterStage_('timetable-read');const raw=typeof rosterNativeRead_==='function'?rosterNativeRead_(entry.modelFile,{json:'timetable-json',parts:'timetable-parts'}):rosterReadFile_(entry.modelFile);
 rosterStage_('timetable-json');const parsed=JSON.parse(raw);rosterStage_('timetable-validation');const model=GSISRoster.validate(parsed);
 try{const packed=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(model),'application/json')).getBytes());if(packed.length<90000)CacheService.getScriptCache().put(key,packed,21600);}catch(ignore){}
 return model;
}
function rosterModelFile_(model){
 // One immutable file and the same register commit. Older readers ignore the
 // optional compressed field and continue validating the original model.
 try{if(typeof rosterTimetablePart_==='function')return JSON.stringify({...model,timetablePackage:rosterTimetablePart_(model)});}catch(_){}
 return JSON.stringify(model);
}
function rosterModelPart_(entry){
 const key='gsis-roster-prepared-model:v1:'+entry.id+':'+entry.modelFile;
 try{const hit=JSON.parse(CacheService.getScriptCache().get(key)||'null');if(rosterTimetablePartValid_(hit))return hit;}catch(_){}
 const raw=JSON.parse(typeof rosterNativeRead_==='function'?rosterNativeRead_(entry.modelFile):rosterReadFile_(entry.modelFile)),{timetablePackage,...primary}=raw,part=rosterTimetablePartValid_(timetablePackage)&&timetablePackage.key===rosterOperationsPlanDigest_(JSON.stringify(primary))?timetablePackage:rosterTimetablePart_(GSISRoster.validate(primary));
 try{const value=JSON.stringify(part);if(value.length<90000)CacheService.getScriptCache().put(key,value,21600);}catch(_){}
 return part;
}
function rosterNames_(entry){
 if(!entry)return {modelId:null,names:{teacher:[],class:[],tg:[]},timing:null,maxPeriod:null,layoutMode:null};
 const key='gsis-roster-names:v1:'+entry.id+':'+entry.modelFile;
 try{const cached=CacheService.getScriptCache().get(key);if(cached)return JSON.parse(cached);}catch(ignore){}
 const model=rosterModel_(entry),teacher=new Set(),classes=new Set(),groups=new Set(),collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'}),sort=values=>[...values].sort((a,b)=>collator.compare(a,b)||a.localeCompare(b,'en'));
 // Keep the export picker identity rules: parity is checked against RosterExport
 // by the backend regression test, including level-scoped language groups.
 const classNames=value=>[...new Set(value.split(/[\n,;]+/).map(s=>s.trim()).filter(Boolean))];
 for(const [,week] of GSISRoster.weeks(model))for(const block of week.blocks){teacher.add(block.name);for(const card of block.cells){
  const cs=classNames(card[1]);cs.forEach(name=>classes.add(name));const group=card[3].trim();
  if(!group||/^(?:Form|PD|Duty|BLK|IMP)$/i.test(card[0].trim())||/^(?:EL|MA|SC)$/i.test(group)||/^(?:whole class|all|entire class|hall,?\s*class|\.)$/i.test(group))continue;
  const levels=sort(new Set(cs.flatMap(name=>name.split('/')).map(name=>/^(?:(?:primary|pri|p)\s*)?([1-6])(?=$|[^0-9])/i.exec(name.trim())?.[1]).filter(Boolean))).map(n=>'P'+n).join('/'),namedLanguage=/^(?:CL|ML|TL)\d+(?:\s|$)/i.test(group),scope=namedLanguage&&levels?levels:(sort(cs).join('/')||levels||'Unspecified level');groups.add(scope+' · '+group);
 }}
 const value={modelId:entry.id,names:{teacher:sort(teacher),class:sort(classes),tg:sort(groups)},timing:model.timing,maxPeriod:model.maxPeriod,layoutMode:model.layoutMode};
 try{const raw=JSON.stringify(value);if(raw.length<30000)CacheService.getScriptCache().put(key,raw,21600);}catch(ignore){}
 return value;
}
function rosterModelResponse_(entry,p){const known=Array.isArray(p.knownModelIds)?p.knownModelIds.slice(0,8).filter(id=>typeof id==='string'&&/^[\w-]{36}$/.test(id)):[];return entry&&known.includes(entry.id)?{modelId:entry.id,modelUnchanged:true}:{modelId:entry?.id||null,model:rosterModel_(entry)};}
function rosterFile_(folderId,name,blob){return rosterFindFile_(folderId,name)||rosterCreateFile_(folderId,name,blob);}
function rosterInput_(fn){try{return fn()}catch(e){error_(400,e.message)}}
function rosterDispatch_(req,c){gsisRequireBackendRole_('roster');
 if(!['edgeFreeze','edgeUnfreeze','edgeExport','edgeExportManifest','edgeExportPart','edgeExportAbandon','edgeModel','edgeFence','edgeReferences','edgeContactCreate','edgeAudit'].includes(req.input?.operation)&&!(req.action==='rosterOperations'&&req.input?.operation==='edgeHealthAuthority')&&typeof rosterEdgeAssertLegacyWrite_==='function')rosterEdgeAssertLegacyWrite_();
 if(typeof c?.user?.rosterSMC!=='boolean'){
  if(typeof deployTrace_!=='undefined'&&deployTrace_)deployTrace_.phase='contacts-authority';
  error_(503,'Contacts did not return verified Roster authority. Update the existing Contacts web app deployment.');
 }
 if(typeof deployTrace_!=='undefined'&&deployTrace_?.rosterDiagnostic)deployTrace_.rosterSummary={smc:c.user.rosterSMC};
 rosterStage_('roster-input');
 if(req.action==='rosterInbox')return rosterInboxDispatch_(req,c);
 if(req.action==='rosterOperations')return rosterOperationsDispatch_(req,c);
 const p=req.input||{},smc=c.user.rosterSMC===true,admin=c.user.rosterAdmin===true,manager=smc||admin,action=req.action,day=rosterInput_(()=>GSISRoster.date(p.date||rosterToday_()));
 if(action==='rosterProfile'&&p.view==='reportForm'){
  const input={...p,operation:'read',view:'reportForm',date:day},state=rosterOperationsPhase_('state-read',()=>rosterOperationsState_(true)),ctx=rosterOperationsPhase_('context',()=>rosterOperationsContext_({...req,input},c,state));
  return {user:{...ctx.user,accessVerified:true},version:GSIS_DEPLOY_VERSION,reportForm:GSISRosterOperations.reportFormView(state,ctx,input)};
 }
 if(action==='rosterProfile'){
  const index=rosterIndex_(),status=rosterStatus_(index,day,manager);
  let reportData,reportError;if(p.view==='report')try{
   const input={...p,operation:'read',view:'report',compact:true,date:day},state=rosterOperationsPhase_('state-read',()=>rosterOperationsState_()),ctx=rosterOperationsPhase_('context',()=>rosterOperationsContext_({...req,input},c,state,index));
   reportData=rosterOperationsPhase_('projection',()=>GSISRosterOperations.read(state,ctx,input));
   reportData=rosterOperationsReportTransport_(reportData,input,ctx);
  }catch(e){
   reportError={status:503,error:'Absence records could not load. Retry loading.',...rosterFailureDetail_(e)};
   if(typeof deployTrace_!=='undefined'&&deployTrace_?.requestId){reportError.diagnosticId=deployTrace_.requestId;rosterDiagnostic_('roster-report-bootstrap-failed',{status:e.status||503});}
  }
  // The browser holds this immutable model in memory. Only the initial profile
  // requests it; permission checks and the register stay authoritative each call.
  return {user:{email:req.identity.email,staffId:c.user.rosterStaffId||null,admin:c.user.rosterAdmin===true,smc,accessVerified:true},version:GSIS_DEPLOY_VERSION,...status,...(reportData?{reportData}:reportError?{reportError}:{}),...(p.preload===true?rosterModelResponse_(index.entries.find(e=>e.id===status.selected?.id),p):{})};
 }
 if(action==='rosterRead'){
  const index=rosterIndex_(),status=rosterStatus_(index,day,false),entry=p.id&&manager?index.entries.find(e=>e.id===p.id):index.entries.find(e=>e.id===status.selected?.id);
  if(p.id&&!manager&&p.id!==status.active?.id)error_(403,'Only the timetable valid for this date is available.');
  // Keep the explicit SMC ID response compatible with saved workbook downloads.
  // Implicit selection always distinguishes a future timetable from one in force.
  return {...status,...(p.id&&manager?{active:rosterPublic_(entry),selected:rosterPublic_(entry),selection:entry?'selected':null}:{}),...(p.view==='names'?rosterNames_(entry):rosterModelResponse_(entry,p))};
 }
 if(!['rosterUpload','rosterUpdate'].includes(action))error_(404,'Unknown Roster action.');
 if(action==='rosterUpload'&&!admin)error_(403,'Admin access is required to upload baseline timetables.');
 if(action==='rosterUpdate'&&!smc)error_(403,'SMC membership is required to manage baseline timetables.');
 if(typeof p.requestId!=='string'||!/^[\w-]{36}$/.test(p.requestId))error_(400,'A save request ID is required.');
 let meta,model,bytes;
 if(action==='rosterUpload'){
  meta=rosterInput_(()=>GSISRoster.metadata(p));model=rosterInput_(()=>GSISRoster.validate(p.model));
  if(typeof p.workbook!=='string'||p.workbook.length>10666668||!/^[A-Za-z0-9+/]+={0,2}$/.test(p.workbook))error_(400,'The Excel workbook is missing or too large.');
  bytes=Utilities.base64Decode(p.workbook);if(bytes.length>8000000||bytes.length<4||bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)error_(400,'Upload a genuine Excel workbook.');
 }else if(p.operation==='metadata')meta=rosterInput_(()=>GSISRoster.metadata(p));
 else if(!['prune','restore','activate'].includes(p.operation))error_(400,'Unknown timetable edit.');
 rosterStage_('roster-save-lock');const lock=LockService.getScriptLock();if(!deployLock_(lock,5000))error_(503,'Another save is running. Retry this save.');
 try{
  const index=rosterIndex_(),digest=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(p)).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
  const receipt=(index.receipts||[]).find(r=>r.id===p.requestId);if(receipt){if(receipt.edgeDigest?(typeof rosterNativeReceiptMatches_!=='function'||!rosterNativeReceiptMatches_(receipt,p,req.identity.email)):(receipt.digest!==digest||receipt.actor!==req.identity.email))error_(409,'Request ID was already used. Refresh before editing.');return {...rosterStatus_(index,day,manager),savedId:receipt.savedId,replayed:true};}
  if(p.revision!==index.revision)error_(409,'Timetable list changed. Refresh before saving.');
  let entry;
  if(action==='rosterUpload'){
   if(index.entries.length>=500)error_(400,'The register has reached 500 timetables. Ask Admin to review storage.');
   const fileKey=p.requestId+'-'+digest.slice(0,16);
   rosterStage_('timetable-write');const modelFile=rosterFile_(ROSTER_DATA,fileKey+'.json',Utilities.newBlob(rosterModelFile_(model),'application/json'));
   rosterStage_('workbook-archive');
   const workbookFile=rosterFile_(ROSTER_ARCHIVE,meta.name.replace(/[\\/:*?"<>|]/g,'_')+' ('+fileKey+').xlsx',Utilities.newBlob(bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
   let preparedTimings;try{if(typeof rosterTimetableBatchPeriods_==='function')preparedTimings={modelFile,key:rosterOperationsPlanDigest_(JSON.stringify(rosterTimetableBatchPeriods_(model)))};}catch(_){}
   entry={id:p.requestId,...meta,modelFile,workbookFile,...(preparedTimings?{preparedTimings}:{}),teacherCount:model.teacherCount,layoutMode:model.layoutMode,createdAt:new Date().toISOString(),createdBy:req.identity.email,pruned:false};index.entries.push(entry);
  }else{
   entry=index.entries.find(e=>e.id===p.id);if(!entry)error_(404,'Timetable not found.');
   if(p.operation==='metadata')Object.assign(entry,meta);
   if(p.operation==='activate'){entry.from=rosterToday_();if(entry.to<entry.from)error_(400,'Set a future end date before reusing this timetable.');entry.pruned=false;}
   if(p.operation==='prune'){if(GSISRoster.active(index.entries,rosterToday_())?.id===entry.id)error_(409,'Activate another timetable or change validity before pruning the active timetable.');entry.pruned=true;}
   if(p.operation==='restore')entry.pruned=false;
  }
  index.revision++;entry.priority=index.revision;entry.updatedAt=new Date().toISOString();entry.updatedBy=req.identity.email;
  index.receipts=[...(index.receipts||[]),{id:p.requestId,digest,actor:req.identity.email,savedId:entry.id}].slice(-200);
  rosterStage_('register-commit');rosterCommit_(index);rosterStage_('register-committed');return {...rosterStatus_(index,day,manager),savedId:entry.id};
 }finally{deployUnlock_(lock);}
}
