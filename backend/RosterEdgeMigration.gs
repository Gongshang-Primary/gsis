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
 const p=req.input||{},op=p.operation;if(!['edgeExport','edgeModel','edgeFence','edgeReferences','edgeContactCreate','edgeAudit'].includes(op))return null;if(op==='edgeContactCreate'){if(!c?.user?.rosterSMC&&!c?.user?.rosterAdmin)error_(403,'SMC or Admin access is required.');}else rosterEdgeAdmin_(c);
 if(op==='edgeReferences')return {handled:true,result:rosterEdgeReferences_(c,true)};
 if(op==='edgeContactCreate'){const created=contacts_(req.identity,false,'rosterContactCreate',{name:p.name,mobile:p.mobile,employment:p.employment,modifier:p.modifier,requestId:p.requestId,confirmDistinct:p.confirmDistinct}),fresh=rosterServiceContacts_();return {handled:true,result:{...created,references:rosterEdgeReferences_(fresh.c,false)}};}
 if(op==='edgeAudit'){const snapshot=rosterEdgeSnapshot_();if(snapshot.sourceDigest!==p.expectedSourceDigest)error_(409,'Roster changed during export. Re-export the migration source.');const date=GSISRosterOperations.date(p.date),id=snapshot.state.allocationAuditExports?.[date]?.archiveFileId;if(!id)error_(404,'Audit archive not found.');const archive=JSON.parse(rosterReadFile_(id));if(archive.schema!==1||archive.date!==date||!Array.isArray(archive.audit))error_(503,'The allocation audit archive is invalid.');return {handled:true,result:archive};}
 if(op==='edgeModel'){const snapshot=rosterEdgeSnapshot_();if(snapshot.sourceDigest!==p.expectedSourceDigest)error_(409,'Roster changed during export. Re-export and verify the migration source.');const entry=snapshot.index.entries.find(row=>row.id===p.id);if(!entry)error_(404,'Baseline model not found.');return {handled:true,result:{id:entry.id,model:rosterModel_(entry)}};}
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
