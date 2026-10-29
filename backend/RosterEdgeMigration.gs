/* v0.9.4 migration adapter. Contains no operational fallback after D1 cutover. */
function rosterEdgeAssertLegacyWrite_(){
 if(props_().getProperty('ROSTER_EDGE_AUTHORITY')==='d1')error_(409,'Roster writes have moved to the D1 authority. Use the current Roster viewport; do not re-enable legacy writers.');
}
function rosterEdgeSnapshot_(){
 const state=rosterOperationsState_(true),transport=typeof rosterNotificationState_==='function'?rosterNotificationState_():null,index=rosterIndex_();
 if(transport){rosterNotificationOverlayWith_(state,transport);state.notificationTransport={};for(const key of ['cooldownUntil','cooldowns','leases','readyBatches','unmatchedReceipts','senderPacing','providerBackoff','retryAfter'])if(transport[key]!==undefined)state.notificationTransport[key]=transport[key];state.peerMail=transport.peerMail||[];state.deliveryEvents=transport.deliveryEvents||state.deliveryEvents;}
 if(typeof rosterInboxState_==='function'){const inbox=rosterInboxState_();state.inbox={schema:inbox.schema,revision:inbox.revision};for(const key of ['threads','messages','audit','receipts','deliveryEvents','alerts'])state['inbox'+key.charAt(0).toUpperCase()+key.slice(1)]=inbox[key]||[];}
 const properties=props_().getProperties();state.edgeStaplerLeases={};for(const key of Object.keys(properties))if(key.startsWith('ROSTER_STAPLER_LEASE:')){const date=key.slice('ROSTER_STAPLER_LEASE:'.length);try{state.edgeStaplerLeases[date]=JSON.parse(properties[key]);}catch(error){error_(503,'A dated planning lease is malformed. Repair it before migration.');}}
 if(typeof rosterAbsenceIntakePending_==='function'){const pending=rosterAbsenceIntakePending_();if(pending?.blockedDates?.length)error_(409,'Finish the captured absence queue before exporting Roster authority. Unresolved report dates: '+pending.blockedDates.join(', ')+'. Resolve them in Manage school-wide absences.');}
 // Include all mutable writer domains, not merely the relief document counter.
 const value={schema:1,state,index};return {...value,sourceDigest:rosterOperationsDigest_(value)};
}
function rosterEdgeAdmin_(c){if(c?.user?.rosterAdmin!==true)error_(403,'Contacts Admin access is required for Roster migration.');}
function rosterEdgeReferences_(c,adminVerified){
 const fields=['rosterPeople','rosterSMCIds','rosterAdminIds','rosterUrgentSMCIds'],contacts={};for(const field of fields)contacts[field]=c[field]||[];
 if(!Array.isArray(contacts.rosterPeople)||!Array.isArray(contacts.rosterSMCIds)||!Array.isArray(contacts.rosterAdminIds))error_(503,'Contacts did not supply complete reference authority.');
 return {contacts,adminVerified:adminVerified===true,contactsSource:rosterOperationsDigest_(contacts),checkedAt:new Date().toISOString()};
}
function rosterEdgeMigrationDispatch_(req,c){
 const p=req.input||{},op=p.operation;if(!['edgeExport','edgeExportManifest','edgeExportPart','edgeModel','edgeFence','edgeReferences','edgeContactCreate','edgeAudit'].includes(op))return null;if(op==='edgeContactCreate'){if(!c?.user?.rosterSMC&&!c?.user?.rosterAdmin)error_(403,'SMC or Admin access is required.');}else rosterEdgeAdmin_(c);
 if(op==='edgeExportManifest')return {handled:true,result:rosterEdgeExportManifest_(req)};
 if(op==='edgeExportPart')return {handled:true,result:rosterEdgeExportPart_(req)};
 if(op==='edgeReferences')return {handled:true,result:rosterEdgeReferences_(c,true)};
 if(op==='edgeContactCreate'){const created=contacts_(req.identity,false,'rosterContactCreate',{name:p.name,mobile:p.mobile,employment:p.employment,modifier:p.modifier,requestId:p.requestId,confirmDistinct:p.confirmDistinct}),fresh=rosterServiceContacts_();return {handled:true,result:{...created,references:rosterEdgeReferences_(fresh.c,false)}};}
 if(op==='edgeAudit'){/* 0.9.9a: archives are written once; read the archive reference without re-fingerprinting the whole Roster. Activation still re-checks the exact source digest under the writer fence. */if(typeof p.archiveFileId!=='string'||!p.archiveFileId)error_(400,'Reload the Roster import page and import again.');const date=GSISRosterOperations.date(p.date),id=rosterOperationsState_(true).allocationAuditExports?.[date]?.archiveFileId;if(!id)error_(404,'Audit archive not found.');if(id!==p.archiveFileId)error_(409,'An audit archive changed during import. Import again.');const archive=JSON.parse(rosterReadFile_(id));if(archive.schema!==1||archive.date!==date||!Array.isArray(archive.audit))error_(503,'The allocation audit archive is invalid.');return {handled:true,result:archive};}
 if(op==='edgeModel'){/* 0.9.9a: uploaded model files are immutable and each upload has a new ID; read the register only. Activation still re-checks the exact source digest under the writer fence. */if(typeof p.modelFile!=='string'||!p.modelFile)error_(400,'Reload the Roster import page and import again.');const entry=rosterIndex_().entries.find(row=>row.id===p.id);if(!entry)error_(404,'Baseline model not found.');if(entry.modelFile!==p.modelFile)error_(409,'A timetable model changed during import. Import again.');return {handled:true,result:{id:entry.id,model:rosterModel_(entry)}};}
 const script=LockService.getScriptLock();if(!deployLock_(script,8000))error_(503,'A Roster save is finishing. Retry migration.');let user;
 try{user=typeof rosterNotificationLock_==='function'?rosterNotificationLock_():LockService.getUserLock();if(!deployLock_(user,8000))error_(503,'Notification delivery is finishing. Retry migration.');const snapshot=rosterEdgeSnapshot_();if(op==='edgeExport')return {handled:true,result:{...snapshot,adminVerified:true}};
  if(typeof p.sourceDigest!=='string'||p.sourceDigest!==snapshot.sourceDigest)error_(409,'The imported snapshot is no longer current. Legacy writers remain enabled; migrate the latest source before cutover.');
  props_().setProperties({ROSTER_EDGE_AUTHORITY:'d1',ROSTER_EDGE_SOURCE_DIGEST:snapshot.sourceDigest,ROSTER_EDGE_FENCED_AT:new Date().toISOString()});
  return {handled:true,result:{legacyWritesDisabled:true,sourceDigest:snapshot.sourceDigest,adminVerified:true}};
 }finally{if(user)deployUnlock_(user);deployUnlock_(script);}
}
function rosterEdgeServiceMigrationDispatch_(req){
 const op=req.input?.operation;if(op==='edgeReferences'){const fresh=rosterServiceContacts_();return {handled:true,result:rosterEdgeReferences_(fresh.c,false)};}
 if(op==='edgeFenceStatus')return {handled:true,result:{legacyWritesDisabled:props_().getProperty('ROSTER_EDGE_AUTHORITY')==='d1',sourceDigest:props_().getProperty('ROSTER_EDGE_SOURCE_DIGEST')||null}};
 return null;
}

/* One request owns one immutable snapshot. A failed upload cannot be recaptured
 * under the same identity: missing frozen bytes require an explicit restart. */
function rosterEdgeExportHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,typeof value==='string'?Utilities.newBlob(value).getBytes():value).map(n=>(n&255).toString(16).padStart(2,'0')).join('');}
function rosterEdgeExportBinding_(req){
 const p=req.input||{},actor=req.identity?.email,requestId=p.requestId;
 if(typeof actor!=='string'||!actor||typeof requestId!=='string'||!requestId||requestId.length>200||/[\u0000-\u001f]/.test(requestId))error_(400,'An actor and stable import request ID are required.');
 const sessionId=rosterEdgeExportHash_(JSON.stringify([actor,requestId]));if(p.sessionId!==undefined&&p.sessionId!==sessionId)error_(409,'The export session belongs to another actor or request.');
 if(Object.keys(p).some(key=>!['operation','requestId','sessionId','partId'].includes(key)))error_(400,'Export file IDs and byte ranges are selected only by the backend.');return {actor,requestId,sessionId};
}
function rosterEdgeExportSave_(descriptor){props_().setProperty('ROSTER_EDGE_EXPORT:'+descriptor.sessionId,JSON.stringify(descriptor));}
function rosterEdgeExportDescriptor_(binding){const raw=props_().getProperty('ROSTER_EDGE_EXPORT:'+binding.sessionId);if(!raw)return null;const descriptor=JSON.parse(raw);if(descriptor.actor!==binding.actor||descriptor.requestId!==binding.requestId||descriptor.sessionId!==binding.sessionId)error_(409,'The export session identity does not match.');return descriptor;}
function rosterEdgeExportRange_(id,offset,bytes,total){
 if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(bytes)||bytes<1||bytes>GSiSRosterImport.MAX_PART_BYTES||offset<0||offset+bytes>total)error_(503,'The immutable export range is invalid.');
 const response=rosterDriveRequest_('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?supportsAllDrives=true&alt=media',{headers:{Range:'bytes='+offset+'-'+(offset+bytes-1)}},'immutable-export-part'),headers=response.getAllHeaders(),key=Object.keys(headers).find(key=>key.toLowerCase()==='content-range'),value=response.getContent();
 if(response.getResponseCode()!==206||headers[key]!=='bytes '+offset+'-'+(offset+bytes-1)+'/'+total||value.length!==bytes)error_(503,'Drive did not return the exact bounded export range. No import progress was saved.');return Utilities.newBlob(value).getDataAsString('UTF-8');
}
function rosterEdgeExportHeader_(descriptor,fileId){
 const metadata=rosterDriveJson_(rosterDriveRequest_('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(fileId)+'?supportsAllDrives=true&fields=id,size,parents,trashed',{},'immutable-export-metadata'),'immutable-export-metadata');
 if(Number(metadata.size)!==descriptor.totalBytes||metadata.trashed||!metadata.parents?.includes(ROSTER_DATA))error_(503,'The immutable export container length or private folder changed.');
 const prefix=rosterEdgeExportRange_(fileId,0,9,descriptor.totalBytes);if(!/^\d{8}\n$/.test(prefix)||Number(prefix.slice(0,8))!==descriptor.headerBytes||descriptor.headerBytes>GSiSRosterImport.MAX_MANIFEST_BYTES+200)error_(503,'The immutable export header is invalid.');
 const header=JSON.parse(rosterEdgeExportRange_(fileId,9,descriptor.headerBytes,descriptor.totalBytes)),manifest=header.manifest;
 GSiSRosterImport.validateManifest(manifest);if(rosterEdgeExportHash_(JSON.stringify(manifest))!==descriptor.manifestDigest||header.manifestDigest!==descriptor.manifestDigest||manifest.sourceDigest!==descriptor.sourceDigest||manifest.sessionId!==descriptor.sessionId||manifest.actor!==descriptor.actor||manifest.requestId!==descriptor.requestId||9+descriptor.headerBytes+manifest.totalBytes!==descriptor.totalBytes)error_(503,'The immutable export header does not match the frozen source.');return header;
}
function rosterEdgeExportFind_(descriptor){
 const folder=rosterFolder_(ROSTER_DATA),quote=value=>String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'"),query="'"+quote(ROSTER_DATA)+"' in parents and name = '"+quote(descriptor.name)+"' and trashed = false",url='https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=20&fields='+encodeURIComponent('files(id,size),nextPageToken,incompleteSearch')+'&q='+encodeURIComponent(query)+(folder.driveId?'&corpora=drive&driveId='+encodeURIComponent(folder.driveId):'&corpora=user'),result=rosterDriveJson_(rosterDriveRequest_(url,{},'immutable-export-recovery'),'immutable-export-recovery');
 if(!Array.isArray(result.files)||result.nextPageToken||result.incompleteSearch||result.files.length>20)error_(503,'The immutable export recovery listing is incomplete.');const verified=[];
 for(const file of result.files){if(Number(file.size)!==descriptor.totalBytes)continue;try{const header=rosterEdgeExportHeader_(descriptor,file.id);verified.push({id:file.id,header});}catch(error){if(error.status!==503)throw error;}}
 if(verified.length>1)error_(409,'More than one verified export container exists. Retain this session for administrator review.');return verified[0]||null;
}
function rosterEdgeExportReply_(descriptor,header){return {adminVerified:true,sessionId:descriptor.sessionId,requestId:descriptor.requestId,sourceDigest:descriptor.sourceDigest,...(descriptor.state==='ready'?{manifest:header.manifest,manifestDigest:descriptor.manifestDigest}:descriptor.state==='failed'?{preparationFailed:true,requiresRestart:true,message:'The frozen bytes are incomplete or unavailable. Retain this session and restart with a new request ID.'}:{preparing:true,retryAfterMs:2000})};}
function rosterEdgeExportObject_(id){
 const metadata=rosterDriveJson_(rosterDriveRequest_('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?supportsAllDrives=true&fields=id,size,trashed',{},'immutable-object-metadata'),'immutable-object-metadata');
 if(metadata.trashed||!Number.isSafeInteger(Number(metadata.size))||Number(metadata.size)>GSiSRosterImport.MAX_OBJECT_BYTES)error_(413,'A captured object exceeds the supported 32 MiB source-object bound.');const raw=rosterReadFile_(id);if(Utilities.newBlob(raw).getBytes().length!==Number(metadata.size))error_(409,'A captured immutable object changed during preparation.');return JSON.parse(raw);
}
function rosterEdgeExportResume_(binding,descriptor){
 if(descriptor.state==='failed')return rosterEdgeExportReply_(descriptor);
 if(descriptor.state==='ready')return rosterEdgeExportReply_(descriptor,rosterEdgeExportHeader_(descriptor,descriptor.fileId));
 if(Date.now()<descriptor.leaseUntil)return rosterEdgeExportReply_(descriptor);
 // Immutable network reads can be slow. They must not hold the production
 // writer lock; the short commit below rechecks the exact descriptor instead.
 const recovered=descriptor.manifestDigest?rosterEdgeExportFind_(descriptor):null,script=LockService.getScriptLock();if(!deployLock_(script,8000))error_(503,'A Roster save is finishing. Retry the same import.');let current;
 try{
  current=rosterEdgeExportDescriptor_(binding);if(!current)error_(409,'The retained export descriptor is unavailable.');
  const same=['actor','requestId','sessionId','sourceDigest','manifestDigest','totalBytes','headerBytes','name','leaseUntil'].every(key=>current[key]===descriptor[key]);
  if(current.state==='preparing'&&same&&Date.now()>=current.leaseUntil){current={...current,state:recovered?'ready':'failed',...(recovered?{fileId:recovered.id}:{})};rosterEdgeExportSave_(current);}
 }finally{deployUnlock_(script);}
 // A concurrent verifier may have made the session ready while our listing was
 // stale. Its durable ready result wins; never downgrade it to failed.
 if(current.state==='ready'){const header=recovered?.id===current.fileId&&current.manifestDigest===descriptor.manifestDigest?recovered.header:rosterEdgeExportHeader_(current,current.fileId);return rosterEdgeExportReply_(current,header);}
 return rosterEdgeExportReply_(current);
}

function rosterEdgeExportManifest_(req){
 const binding=rosterEdgeExportBinding_(req),script=LockService.getScriptLock();if(!deployLock_(script,8000))error_(503,'A Roster save is finishing. Retry the same import.');let user,snapshot,descriptor,created=false;
 try{
  descriptor=rosterEdgeExportDescriptor_(binding);if(!descriptor){
  if(Object.keys(props_().getProperties()).filter(key=>key.startsWith('ROSTER_EDGE_EXPORT:')).length>=GSiSRosterImport.MAX_RETAINED_SESSIONS)error_(409,'Preparation has eight retained sessions. Reviewed archival and cleanup are required before a new capture; existing sessions remain resumable.');
  rosterEdgeAssertLegacyWrite_();user=typeof rosterNotificationLock_==='function'?rosterNotificationLock_():LockService.getUserLock();if(!deployLock_(user,8000))error_(503,'Notification delivery is finishing. Retry the same import.');
  descriptor={...binding,state:'preparing',sourceDigest:null,createdAt:Date.now(),leaseUntil:Date.now()+600000,name:'Roster immutable import '+binding.sessionId+'.bin'};rosterEdgeExportSave_(descriptor);created=true;
  snapshot=rosterEdgeSnapshot_();descriptor.sourceDigest=snapshot.sourceDigest;rosterEdgeExportSave_(descriptor);
  }
 }catch(error){if(created){descriptor.state='failed';rosterEdgeExportSave_(descriptor);}throw error;}finally{if(user)deployUnlock_(user);deployUnlock_(script);}
 if(!created)return rosterEdgeExportResume_(binding,descriptor);
 let uploadStarted=false;
 try{
  snapshot.state=GSISRosterOperations.validateState(snapshot.state);
  const frozen=GSiSRosterImport.freeze(snapshot,binding,{hash:rosterEdgeExportHash_,gzip:value=>Utilities.gzip(Utilities.newBlob(value,'application/json')).getBytes(),base64:bytes=>Utilities.base64Encode(bytes),readModel:entry=>GSISRoster.validate(rosterEdgeExportObject_(entry.modelFile)),readArchive:(date,id)=>{const archive=rosterEdgeExportObject_(id);if(archive.schema!==1||archive.date!==date||!Array.isArray(archive.audit))error_(503,'The captured allocation audit archive is invalid.');return archive;}}),header=JSON.stringify({manifest:frozen.manifest,manifestDigest:frozen.manifestDigest}),headerBytes=Utilities.newBlob(header).getBytes().length;
  Object.assign(descriptor,{manifestDigest:frozen.manifestDigest,headerBytes,totalBytes:9+headerBytes+frozen.manifest.totalBytes});rosterEdgeExportSave_(descriptor);
  const container=String(headerBytes).padStart(8,'0')+'\n'+header+frozen.parts.join('');uploadStarted=true;const fileId=rosterCreateFile_(ROSTER_DATA,descriptor.name,Utilities.newBlob(container,'application/octet-stream')),verified=rosterEdgeExportHeader_(descriptor,fileId);
  Object.assign(descriptor,{state:'ready',fileId});rosterEdgeExportSave_(descriptor);return rosterEdgeExportReply_(descriptor,verified);
 }catch(error){if(!uploadStarted){descriptor.state='failed';rosterEdgeExportSave_(descriptor);}throw error;}
}
function rosterEdgeExportPart_(req){const binding=rosterEdgeExportBinding_(req),descriptor=rosterEdgeExportDescriptor_(binding);if(!descriptor||descriptor.state!=='ready')error_(409,'The immutable export is not ready. Resume its manifest request.');const header=rosterEdgeExportHeader_(descriptor,descriptor.fileId),part=header.manifest.parts.find(row=>row.id===req.input.partId);if(!part)error_(404,'The immutable export part is not in this session.');const payload=rosterEdgeExportRange_(descriptor.fileId,9+descriptor.headerBytes+part.offset,part.bytes,descriptor.totalBytes);if(rosterEdgeExportHash_(payload)!==part.digest)error_(503,'The immutable export part failed its digest check.');return {adminVerified:true,sessionId:binding.sessionId,manifestDigest:descriptor.manifestDigest,partId:part.id,payload};}
