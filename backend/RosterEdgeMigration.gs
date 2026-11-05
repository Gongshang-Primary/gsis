/* v0.9.4 migration adapter. Contains no operational fallback after D1 cutover. */
function rosterEdgeAssertLegacyWrite_(preparation=false){
 if(props_().getProperty('ROSTER_EDGE_AUTHORITY')==='d1')error_(409,'Roster writes have moved to the D1 authority. Use the current Roster viewport; do not re-enable legacy writers.');
 if(!preparation&&rosterCutoverStatus_().active)throw Object.assign(Error('Roster is being moved; try again shortly.'),{status:423,code:'ROSTER_CUTOVER_FROZEN'});
}
function rosterCutoverStatus_(row){
 if(row===undefined){const raw=props_().getProperty('ROSTER_CUTOVER_FREEZE');if(!raw)return {available:true,active:false,state:'idle',requestId:null,frozenAt:null,ageMs:0,overdue:false};try{row=JSON.parse(raw);}catch(_){error_(503,'The cutover freeze needs administrator review.');}}
 if(!row||row.schema!==1||!['frozen','cancelled','activated'].includes(row.state)||typeof row.requestId!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(row.requestId)||!Number.isSafeInteger(row.at)||row.at<0)error_(503,'The cutover freeze needs administrator review.');
 const active=row.state==='frozen',ageMs=active?Math.max(0,Date.now()-row.at):0;return {available:true,active,state:row.state,requestId:row.requestId,frozenAt:new Date(row.at).toISOString(),ageMs,overdue:active&&ageMs>=14400000};
}
function rosterCutoverId_(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{8,160}$/.test(value))error_(400,'Use the retained cutover request reference.');return value;}
function rosterCutoverReceiptKey_(id){return 'ROSTER_CUTOVER_HISTORY:'+rosterOperationsDigest_({requestId:id});}
function rosterCutoverLocked_(work){
 const script=LockService.getScriptLock();if(!deployLock_(script,8000))error_(503,'A Roster save is finishing. Retry the same freeze action.');let user;
 try{user=typeof rosterNotificationLock_==='function'?rosterNotificationLock_():LockService.getUserLock();if(!deployLock_(user,8000)){user=null;error_(503,'Notification delivery is finishing. Retry the same freeze action.');}return work();}
 finally{if(user)deployUnlock_(user);deployUnlock_(script);}
}
function rosterCutoverStore_(row){
 const raw=JSON.stringify(row);
 // Receipt first: a cancellation tombstone prevents a delayed freeze request
 // from restarting the freeze, including after an uncertain acknowledgement.
 props_().setProperty(rosterCutoverReceiptKey_(row.requestId),raw);props_().setProperty('ROSTER_CUTOVER_FREEZE',raw);return {cutoverFreeze:rosterCutoverStatus_(row)};
}
function rosterCutoverDispatch_(req){
 const p=req.input||{},id=rosterCutoverId_(p.requestId),actor=req.identity?.email;if(typeof actor!=='string'||!actor||actor.length>254)error_(403,'Current administrator identity is required.');
 return rosterCutoverLocked_(()=>{
  if(props_().getProperty('ROSTER_EDGE_AUTHORITY')==='d1')error_(409,'Google is already fenced for D1. Do not restore legacy writes.');
  const raw=props_().getProperty('ROSTER_CUTOVER_FREEZE'),current=raw?JSON.parse(raw):null,status=rosterCutoverStatus_(current||undefined);
  if(p.operation==='edgeFreeze'){
   if(current?.requestId===id)return {cutoverFreeze:status,replayed:true};
   if(status.active)error_(409,'Another cutover freeze is active. Reload its retained reference.');
   const receipt=props_().getProperty(rosterCutoverReceiptKey_(id));
   if(receipt){const old=JSON.parse(receipt);if(old.state!=='frozen')return {cutoverFreeze:rosterCutoverStatus_(old),replayed:true};return rosterCutoverStore_(old);}
   if(typeof rosterAbsenceIntakePending_==='function'&&rosterAbsenceIntakePending_().blockedDates?.length)error_(409,'Finish the captured Google absence queue before freezing. New Worker-side reports can remain queued.');
   return rosterCutoverStore_({schema:1,state:'frozen',requestId:id,actor,at:Date.now()});
  }
  const freezeId=rosterCutoverId_(p.freezeId);if(status.active&&current.requestId!==freezeId)error_(409,'The freeze changed. Reload before cancelling it.');
  const receipt=props_().getProperty(rosterCutoverReceiptKey_(freezeId)),original=current?.requestId===freezeId?current:receipt?JSON.parse(receipt):{schema:1,requestId:freezeId,at:Date.now(),actor};
  return rosterCutoverStore_({...original,state:'cancelled',cancelledAt:Date.now(),cancelledBy:actor,cancelRequestId:id});
 });
}
function rosterCutoverComplete_(p){
 return rosterCutoverLocked_(()=>{
  if(props_().getProperty('ROSTER_EDGE_AUTHORITY')!=='d1'||typeof p.sourceDigest!=='string'||p.sourceDigest!==props_().getProperty('ROSTER_EDGE_SOURCE_DIGEST'))error_(409,'Complete the verified D1 writer fence before finishing the freeze.');
  const id=rosterCutoverId_(p.freezeId),raw=props_().getProperty('ROSTER_CUTOVER_FREEZE'),row=raw?JSON.parse(raw):null;
  if(!row||row.requestId!==id)error_(409,'The cutover freeze changed. Reload the verified activation status.');
  if(row.state==='activated')return {cutoverFreeze:rosterCutoverStatus_(row),replayed:true};
  if(row.state!=='frozen')error_(409,'This freeze was cancelled; retain the current authority fence.');
  return rosterCutoverStore_({...row,state:'activated',activatedAt:Date.now(),sourceDigest:p.sourceDigest});
 });
}
function rosterEdgeSnapshot_(){
 const state=rosterOperationsState_(true),transport=typeof rosterNotificationState_==='function'?rosterNotificationState_():null,index=rosterIndex_();
 if(transport){rosterNotificationOverlayWith_(state,transport);state.notificationTransport={};for(const key of ['cooldownUntil','cooldowns','leases','readyBatches','unmatchedReceipts','senderPacing','providerBackoff','retryAfter'])if(transport[key]!==undefined)state.notificationTransport[key]=transport[key];state.peerMail=transport.peerMail||[];state.deliveryEvents=transport.deliveryEvents||state.deliveryEvents;}
 if(typeof rosterInboxState_==='function'){const inbox=rosterInboxState_();state.inbox={schema:inbox.schema,revision:inbox.revision};for(const key of ['threads','messages','audit','receipts','deliveryEvents','alerts'])state['inbox'+key.charAt(0).toUpperCase()+key.slice(1)]=inbox[key]||[];}
 const properties=props_().getProperties();state.edgeStaplerLeases={};// Sort: getProperties() order is not stable between executions; the digest must not depend on it.
 for(const key of Object.keys(properties).sort())if(key.startsWith('ROSTER_STAPLER_LEASE:')){const date=key.slice('ROSTER_STAPLER_LEASE:'.length);try{state.edgeStaplerLeases[date]=JSON.parse(properties[key]);}catch(error){error_(503,'A dated planning lease is malformed. Repair it before migration.');}}
 if(typeof rosterAbsenceIntakePending_==='function'){const pending=rosterAbsenceIntakePending_();if(pending?.blockedDates?.length)error_(409,'Finish the captured absence queue before exporting Roster authority. Unresolved report dates: '+pending.blockedDates.join(', ')+'. Resolve them in Manage school-wide absences.');}
 // Include all mutable writer domains, not merely the relief document counter.
 // Hash and freeze the stored view: serializing lazy facades expands every
 // historical plan and audit payload before the first upload can begin.
 const value={schema:1,state:typeof rosterOperationsStoredView_==='function'?rosterOperationsStoredView_(state):state,index};return {...value,sourceDigest:rosterOperationsDigest_(value)};
}
// Short-lived metadata (3-minute editor leases) that activation may tolerate when nothing else changed.
const ROSTER_EDGE_EPHEMERAL_PARTS_=['edgeStaplerLeases'];
function rosterEdgeSnapshotParts_(snapshot){
 const parts={};for(const key of Object.keys(snapshot.state))parts[key]=rosterOperationsDigest_(snapshot.state[key]).slice(0,16);parts.index=rosterOperationsDigest_(snapshot.index).slice(0,16);return parts;
}
function rosterEdgeRememberSnapshotParts_(snapshot){
 // Best-effort diagnostics must never stop an otherwise valid source capture.
 try{const marker={sourceDigest:snapshot.sourceDigest,at:new Date().toISOString()},value=JSON.stringify({...marker,parts:rosterEdgeSnapshotParts_(snapshot)});
  props_().setProperty('ROSTER_EDGE_SNAPSHOT_PARTS',value.length>8500?JSON.stringify({...marker,truncated:true}):value);
 }catch(_){}
}
function rosterEdgeChangedParts_(snapshot,sourceDigest){
 const raw=props_().getProperty('ROSTER_EDGE_SNAPSHOT_PARTS');if(!raw)return null;let stored;try{stored=JSON.parse(raw);}catch(_){return null;}
 if(!stored||typeof stored!=='object'||stored.sourceDigest!==sourceDigest||!stored.parts||typeof stored.parts!=='object'||Array.isArray(stored.parts))return null;
 const current=rosterEdgeSnapshotParts_(snapshot);return [...new Set([...Object.keys(stored.parts),...Object.keys(current)])].filter(key=>stored.parts[key]!==current[key]).sort();
}
function rosterEdgeAdmin_(c){if(c?.user?.rosterAdmin!==true)error_(403,'Contacts Admin access is required for Roster migration.');}
function rosterEdgeReferences_(c,adminVerified){
 const fields=['rosterPeople','rosterSMCIds','rosterAdminIds','rosterUrgentSMCIds'],contacts={};for(const field of fields)contacts[field]=c[field]||[];
 if(!Array.isArray(contacts.rosterPeople)||!Array.isArray(contacts.rosterSMCIds)||!Array.isArray(contacts.rosterAdminIds))error_(503,'Contacts did not supply complete reference authority.');
 return {contacts,adminVerified:adminVerified===true,contactsSource:rosterOperationsDigest_(contacts),checkedAt:new Date().toISOString(),cutoverFreeze:rosterCutoverStatus_(),legacyWritesDisabled:props_().getProperty('ROSTER_EDGE_AUTHORITY')==='d1'};
}
// Fresh-start evidence contains settings and file identities only. Historical
// arrays, baseline models and plans never enter this capture or its digest.
function rosterFreshStartJson_(value){
 const stable=item=>item===null||typeof item!=='object'?item:Array.isArray(item)?item.map(stable):Object.fromEntries(Object.keys(item).sort().map(key=>[key,stable(item[key])]));
 return JSON.stringify(stable(value));
}
function rosterFreshStartHash_(value){return rosterEdgeExportHash_(rosterFreshStartJson_(value));}
function rosterFreshStartPointers_(){
 const names={ROSTER_OPERATIONS_FILE:'Roster operations.json',ROSTER_INDEX_FILE:'Roster register.json',ROSTER_NOTIFICATION_TRANSPORT_FILE:'Roster notification transport.json',ROSTER_INBOX_FILE:'Roster WhatsApp Inbox.json',ROSTER_ABSENCE_INTAKE_FILE:'Roster absence intake.json',ROSTER_D1_RECEIPTS_FILE:'',ROSTER_D1_TRANSPORT_FILE:''};
 return Object.fromEntries(Object.entries(names).map(([key,name])=>[key,props_().getProperty(key)||(name?rosterFindFile_(ROSTER_DATA,name):'')||'']));
}
function rosterFreshStartSettings_(pointers,copyConfig){
 if(!copyConfig)return {};
 const stored=pointers.ROSTER_OPERATIONS_FILE?rosterSplitReadDocument_(pointers.ROSTER_OPERATIONS_FILE,false,false).value:GSISRosterOperations.initial(),defaults=GSISRosterOperations.initial(),settings={};
 for(const field of ['systemConfig','nameBridges','nameBridgesSeeded','dailyEmploymentSettings','types','typeDetailsVersion'])settings[field]=stored[field]===undefined?(field==='nameBridgesSeeded'?false:defaults[field]):stored[field];
 if(!settings.systemConfig||typeof settings.systemConfig!=='object'||Array.isArray(settings.systemConfig)||!Array.isArray(settings.nameBridges)||typeof settings.nameBridgesSeeded!=='boolean'||!settings.dailyEmploymentSettings||typeof settings.dailyEmploymentSettings!=='object'||Array.isArray(settings.dailyEmploymentSettings)||!Array.isArray(settings.types))error_(503,'The saved Roster settings need review before a fresh start.');
 const normalized=GSISRosterOperations.validateState(Object.assign(GSISRosterOperations.initial(),JSON.parse(rosterFreshStartJson_(settings))));
 return Object.fromEntries(Object.keys(settings).map(field=>[field,normalized[field]]));
}
function rosterFreshStartRecord_(archiveId){
 if(typeof archiveId!=='string'||!/^[a-f0-9]{64}$/.test(archiveId))error_(400,'Use the retained fresh-start archive identity.');
 const raw=props_().getProperty('ROSTER_FRESH_START_SOURCE:'+archiveId);if(!raw)return null;let record;
 try{const descriptor=JSON.parse(raw);record=descriptor.reference?JSON.parse(rosterEdgeExportPrivateText_(descriptor.reference,262144)):descriptor;}catch(error){if(error.status)throw error;error_(503,'The retained fresh-start source is unavailable.');}
 if(record?.source?.schema!=='gsis-roster-fresh-start-source-v1'||record.source.archiveId!==archiveId||record.sourceDigest!==rosterFreshStartHash_(record.source)||record.source.configDigest!==rosterFreshStartHash_(record.source.settings))error_(503,'The retained fresh-start source failed verification.');return record;
}
function rosterFreshStartFind_(sourceDigest){
 if(typeof sourceDigest!=='string'||!/^[a-f0-9]{64}$/.test(sourceDigest))return null;
 const archiveId=props_().getProperty('ROSTER_FRESH_START_DIGEST:'+sourceDigest);if(!archiveId)return null;const record=rosterFreshStartRecord_(archiveId);if(!record||record.sourceDigest!==sourceDigest)error_(503,'The retained fresh-start source failed verification.');return record;
}
function rosterFreshStartSource_(req){
 const p=req.input||{},actor=req.identity?.email,requestId=rosterCutoverId_(p.requestId);
 if(Object.keys(p).some(key=>!['operation','requestId','effectiveDate','copyConfig'].includes(key))||typeof p.copyConfig!=='boolean')error_(400,'Choose a start date and whether to copy the saved settings.');
 const effectiveDate=GSISRosterOperations.date(p.effectiveDate);if(effectiveDate>rosterToday_())error_(400,'The fresh-start date cannot be later than today.');if(typeof actor!=='string'||!actor||actor.length>254)error_(403,'Current administrator identity is required.');
 const archiveId=rosterFreshStartHash_(['fresh-start',actor,requestId]);
 return rosterCutoverLocked_(()=>{
  const freeze=rosterCutoverStatus_();if(!freeze.active||freeze.state!=='frozen'||props_().getProperty('ROSTER_EDGE_AUTHORITY')==='d1')error_(409,'Freeze Google before preparing a fresh D1 start.');
  const prior=rosterFreshStartRecord_(archiveId);if(prior){if(prior.source.actor!==actor||prior.source.requestId!==requestId||prior.source.effectiveDate!==effectiveDate||prior.source.copyConfig!==p.copyConfig)error_(409,'This fresh-start request was already used for different settings.');if(prior.source.freezeId!==freeze.requestId)error_(409,'The original fresh-start freeze is no longer current.');props_().setProperty('ROSTER_FRESH_START_DIGEST:'+prior.sourceDigest,archiveId);return {adminVerified:true,...prior,replayed:true};}
  if(Object.keys(props_().getProperties()).filter(key=>key.startsWith('ROSTER_FRESH_START_SOURCE:')).length>=24)error_(409,'Review the retained fresh-start sources before preparing another one.');
  const intentKey='ROSTER_FRESH_START_INTENT:'+archiveId,intentRaw=props_().getProperty(intentKey),intent=intentRaw?JSON.parse(intentRaw):null;
  if(intent&&(intent.actor!==actor||intent.requestId!==requestId||intent.effectiveDate!==effectiveDate||intent.copyConfig!==p.copyConfig||intent.freezeId!==freeze.requestId))error_(409,'This fresh-start request already captured another source.');
  const originalPointers=rosterFreshStartPointers_(),settings=rosterFreshStartSettings_(originalPointers,p.copyConfig),source={schema:'gsis-roster-fresh-start-source-v1',actor,requestId,effectiveDate,copyConfig:p.copyConfig,freezeId:freeze.requestId,archiveId,originalPointers,settings,configDigest:rosterFreshStartHash_(settings),capturedAt:intent?.capturedAt||new Date().toISOString()},record={source,sourceDigest:rosterFreshStartHash_(source)},encoded=rosterFreshStartJson_(record);
  if(rosterFreshStartJson_(rosterFreshStartPointers_())!==rosterFreshStartJson_(originalPointers))error_(409,'The original Google records changed during fresh-start capture.');
  const bytes=Utilities.newBlob(encoded).getBytes().length;if(bytes>262144)error_(413,'The saved settings exceed the fresh-start size limit.');
  if(intent&&intent.sourceDigest!==record.sourceDigest)error_(409,'The saved settings changed after this fresh-start capture began.');
  // Persist the tiny intent before uploading larger settings. An uncertain
  // upload then reconstructs the same timestamp and bytes on its next retry.
  if(!intent)props_().setProperty(intentKey,JSON.stringify({actor,requestId,effectiveDate,copyConfig:p.copyConfig,freezeId:freeze.requestId,capturedAt:source.capturedAt,sourceDigest:record.sourceDigest}));
  const descriptor=bytes<=7500?encoded:JSON.stringify({reference:rosterEdgeExportCreateImmutable_('Roster fresh start '+archiveId+'.json',encoded,'application/json',{verify:true})});
  props_().setProperties({['ROSTER_FRESH_START_SOURCE:'+archiveId]:descriptor,['ROSTER_FRESH_START_DIGEST:'+record.sourceDigest]:archiveId});return {adminVerified:true,...record};
 });
}
function rosterFreshStartVerify_(record,active=false){
 const source=record.source,freeze=rosterCutoverStatus_(),authority=props_().getProperty('ROSTER_EDGE_AUTHORITY');
 if(freeze.requestId!==source.freezeId||(active?!['frozen','activated'].includes(freeze.state):freeze.state!=='frozen'))error_(409,'The original fresh-start freeze is no longer current.');
 if(rosterFreshStartJson_(rosterFreshStartPointers_())!==rosterFreshStartJson_(source.originalPointers))error_(409,'The original Google records changed. Review the fresh-start source.');
 if(active){const marker=JSON.parse(props_().getProperty('ROSTER_FRESH_START_ACTIVE')||'null');if(authority!=='d1'||props_().getProperty('ROSTER_EDGE_SOURCE_DIGEST')!==record.sourceDigest||marker?.archiveId!==source.archiveId||marker?.sourceDigest!==record.sourceDigest)error_(409,'This archive does not belong to the active fresh D1 owner.');}
 else if(authority==='d1'&&props_().getProperty('ROSTER_EDGE_SOURCE_DIGEST')!==record.sourceDigest)error_(409,'A different D1 owner is already active.');
 return source;
}
function rosterFreshStartFence_(record){return rosterCutoverLocked_(()=>{
 const active=props_().getProperty('ROSTER_EDGE_AUTHORITY')==='d1',source=rosterFreshStartVerify_(record,active);
 if(rosterFreshStartHash_(rosterFreshStartSettings_(source.originalPointers,source.copyConfig))!==source.configDigest)error_(409,'The saved settings changed after fresh-start capture.');
 rosterFreshStartVerify_(record,active);
 if(!active)props_().setProperties({ROSTER_EDGE_AUTHORITY:'d1',ROSTER_EDGE_SOURCE_DIGEST:record.sourceDigest,ROSTER_EDGE_FENCED_AT:new Date().toISOString(),ROSTER_FRESH_START_ACTIVE:JSON.stringify({archiveId:source.archiveId,sourceDigest:record.sourceDigest})});
 return {legacyWritesDisabled:true,sourceDigest:record.sourceDigest,adminVerified:true,freshStart:true,cutoverFreeze:rosterCutoverStatus_()};
});}
function rosterFreshStartDrift_(p){
 if(Object.keys(p).some(key=>!['operation','sourceDigest'].includes(key))||typeof p.sourceDigest!=='string'||!/^[a-f0-9]{64}$/.test(p.sourceDigest))error_(400,'Use the retained fresh-start source digest.');
 const changed=new Set();let record;
 try{
  record=rosterFreshStartFind_(p.sourceDigest);if(!record)error_(409,'The retained fresh-start source is unavailable.');const source=record.source;
  const inspect=()=>{
   const freeze=rosterCutoverStatus_(),active=props_().getProperty('ROSTER_EDGE_AUTHORITY')==='d1',marker=active?JSON.parse(props_().getProperty('ROSTER_FRESH_START_ACTIVE')||'null'):null;
   if(freeze.requestId!==source.freezeId||(active?!['frozen','activated'].includes(freeze.state):freeze.state!=='frozen')||active&&(props_().getProperty('ROSTER_EDGE_SOURCE_DIGEST')!==record.sourceDigest||marker?.archiveId!==source.archiveId||marker?.sourceDigest!==record.sourceDigest))changed.add('freeze');
   if(rosterFreshStartJson_(rosterFreshStartPointers_())!==rosterFreshStartJson_(source.originalPointers))changed.add('pointers');
  };
  inspect();if(!changed.has('pointers')&&rosterFreshStartHash_(rosterFreshStartSettings_(source.originalPointers,source.copyConfig))!==source.configDigest)changed.add('settings');inspect();
 }catch(error){error_(409,'The retained fresh-start source could not be verified. Reload the source status before activation.');}
 return {current:changed.size===0,sourceDigest:p.sourceDigest,changed:[...changed].sort(),checkedAt:new Date().toISOString(),freshStart:true};
}
function rosterFreshStartArchive_(req,c){
 const p=req.input||{},allowed=['operation','archiveId','view','from','to','offset','limit','asOfDate'];if(Object.keys(p).some(key=>!allowed.includes(key))||!['history','statistics','calculations','openingBalances'].includes(p.view))error_(400,'Choose a supported read-only archive view.');
 const record=rosterFreshStartRecord_(p.archiveId);if(!record)error_(404,'The fresh-start archive is unavailable.');const source=rosterFreshStartVerify_(record,true),user=rosterOperationsAuthority_(c,req.identity),prior=new Date(Date.parse(source.effectiveDate)-86400000).toISOString().slice(0,10),throughDate=p.asOfDate===undefined?prior:GSISRosterOperations.date(p.asOfDate);
 if(throughDate>prior)error_(400,'Archive reads end before the fresh-start date.');if(p.view==='statistics'&&!user.smc&&!user.admin||p.view==='openingBalances'&&!user.admin)error_(403,'This archive view requires current administrator or SMC access.');if(['history','calculations'].includes(p.view)&&!user.staffId)error_(403,'Link this account to Contacts before opening personal history.');
 const state=GSISRosterOperations.validateState(source.originalPointers.ROSTER_OPERATIONS_FILE?rosterSplitReadDocument_(source.originalPointers.ROSTER_OPERATIONS_FILE,false,false).value:GSISRosterOperations.initial()),ctx={user,people:c.rosterPeople||[],today:throughDate,accountingYear:source.effectiveDate.slice(0,4),iso:throughDate+'T15:59:59.999Z',now:Date.parse(throughDate+'T15:59:59.999Z'),minute:1439,days:state.dailyPublicationStates||{}},archive={id:source.archiveId,throughDate,readOnly:true};let result;
 if(p.view==='history'){state.publicationSnapshots=state.publicationSnapshots.filter(row=>row.date<=throughDate);result=GSISRosterOperations.notificationHistory(state,ctx,{offset:p.offset,limit:p.limit});}
 else if(p.view==='statistics'){const from=GSISRosterOperations.date(p.from),to=p.to===undefined?throughDate:GSISRosterOperations.date(p.to);if(from>throughDate)error_(400,'Choose dates before the fresh-start date.');result=GSISRosterStatistics.project(state,ctx,{from,to:to<throughDate?to:throughDate});}
 else if(p.view==='openingBalances'){if(typeof GSISRosterAllocation.freshStartOpeningBalances!=='function')error_(503,'Opening-balance proposals are not available in this backend.');const rows=GSISRosterAllocation.freshStartOpeningBalances(state,ctx,throughDate);result=Array.isArray(rows)?{rows,proposed:true}:rows;}
 else result={completion:rosterPersonalCompletion_(state,user.staffId,throughDate,ctx.now)};
 rosterFreshStartVerify_(record,true);return {...result,archive};
}
function rosterFreshStartRelease_(p){
 if(Object.keys(p).some(key=>!['operation','requestId','sourceDigest','archiveId','proof'].includes(key)))error_(400,'Use the retained fresh-start release request.');const requestId=rosterCutoverId_(p.requestId);
 if(p.proof?.paused!==true)error_(409,'Pause D1 writes before restoring the original Google owner.');
 return rosterCutoverLocked_(()=>{
  const key='ROSTER_FRESH_START_RELEASE:'+requestId,raw=props_().getProperty(key),prior=raw?JSON.parse(raw):null;
  if(prior){if(prior.sourceDigest!==p.sourceDigest||prior.archiveId!==p.archiveId)error_(409,'This release request was already used for another fresh start.');if(props_().getProperty('ROSTER_EDGE_AUTHORITY')==='d1'&&(props_().getProperty('ROSTER_EDGE_SOURCE_DIGEST')!==prior.sourceDigest||props_().getProperty('ROSTER_EDGE_FENCED_AT')!==prior.fencedAt))error_(409,'A newer D1 owner superseded this release.');}
  const record=rosterFreshStartRecord_(p.archiveId);if(!record||record.sourceDigest!==p.sourceDigest)error_(409,'The fresh-start release source could not be verified.');
  const freeze=rosterCutoverStatus_();if(freeze.requestId!==record.source.freezeId)error_(409,'A newer cutover freeze superseded this release.');
  if(prior?.released&&!freeze.active)return prior;
  if(!prior)rosterFreshStartVerify_(record,true);else if(rosterFreshStartJson_(rosterFreshStartPointers_())!==rosterFreshStartJson_(record.source.originalPointers))error_(409,'The original Google records changed before release.');
  const result=prior||{released:false,requestId,sourceDigest:p.sourceDigest,archiveId:p.archiveId,googleWritable:false,fencedAt:props_().getProperty('ROSTER_EDGE_FENCED_AT')};props_().setProperty(key,JSON.stringify(result));
  // Activation can leave its freeze unfinished after D1 becomes active. Retire
  // that same freeze, receipt first, before making Google writable again.
  if(freeze.active){const row=JSON.parse(props_().getProperty('ROSTER_CUTOVER_FREEZE'));rosterCutoverStore_({...row,state:'cancelled',cancelledAt:Date.now(),cancelledBy:record.source.actor,cancelRequestId:requestId,reason:'fresh-start-release'});}
  props_().deleteProperty('ROSTER_EDGE_AUTHORITY');result.released=true;result.googleWritable=true;props_().setProperty(key,JSON.stringify(result));return result;
 });
}
function rosterEdgeMigrationDispatch_(req,c){
 const p=req.input||{},op=p.operation;if(op==='edgeHealthAuthority')return {handled:true,result:{user:rosterOperationsAuthority_(c,req.identity)}};if(op==='edgeArchiveRead')return {handled:true,result:rosterFreshStartArchive_(req,c)};if(!['edgeFreeze','edgeUnfreeze','edgeExport','edgeExportManifest','edgeExportCheckpoint','edgeExportPart','edgeModel','edgeFence','edgeDrift','edgeReferences','edgeContactCreate','edgeAudit','edgeExportAbandon','edgeFreshStartSource','edgeFreshStartDrift'].includes(op))return null;if(op==='edgeContactCreate'){if(!c?.user?.rosterSMC&&!c?.user?.rosterAdmin)error_(403,'SMC or Admin access is required.');}else rosterEdgeAdmin_(c);
 if(op==='edgeFreshStartSource')return {handled:true,result:rosterFreshStartSource_(req)};
 if(op==='edgeFreshStartDrift')return {handled:true,result:rosterFreshStartDrift_(p)};
 if(op==='edgeFence'){const fresh=rosterFreshStartFind_(p.sourceDigest);if(fresh)return {handled:true,result:rosterFreshStartFence_(fresh)};}
 if(['edgeFreeze','edgeUnfreeze'].includes(op))return {handled:true,result:rosterCutoverDispatch_(req)};
 if(op==='edgeExportCheckpoint')return {handled:true,result:rosterEdgeExportCheckpoint_(req)};
 if(op==='edgeExportManifest')return {handled:true,result:rosterEdgeExportManifest_(req)};
 if(op==='edgeExportPart')return {handled:true,result:rosterEdgeExportPart_(req)};
 if(op==='edgeExportAbandon')return {handled:true,result:rosterEdgeExportAbandon_(req)};
 if(op==='edgeReferences')return {handled:true,result:rosterEdgeReferences_(c,true)};
 if(op==='edgeDrift'){if(typeof p.sourceDigest!=='string'||!/^[a-f0-9]{64}$/.test(p.sourceDigest))error_(400,'Use the retained snapshot digest.');const snapshot=rosterEdgeSnapshot_();return {handled:true,result:{current:snapshot.sourceDigest===p.sourceDigest,sourceDigest:p.sourceDigest,changed:rosterEdgeChangedParts_(snapshot,p.sourceDigest),checkedAt:new Date().toISOString()}};}
 if(op==='edgeContactCreate'){const created=contacts_(req.identity,false,'rosterContactCreate',{name:p.name,mobile:p.mobile,employment:p.employment,modifier:p.modifier,requestId:p.requestId,confirmDistinct:p.confirmDistinct}),fresh=rosterServiceContacts_();return {handled:true,result:{...created,references:rosterEdgeReferences_(fresh.c,false)}};}
 if(op==='edgeAudit'){/* 0.9.9a: archives are written once; read the archive reference without re-fingerprinting the whole Roster. Activation still re-checks the exact source digest under the writer fence. */if(typeof p.archiveFileId!=='string'||!p.archiveFileId)error_(400,'Reload the Roster import page and import again.');const date=GSISRosterOperations.date(p.date),id=rosterOperationsState_(true).allocationAuditExports?.[date]?.archiveFileId;if(!id)error_(404,'Audit archive not found.');if(id!==p.archiveFileId)error_(409,'An audit archive changed during import. Import again.');const archive=JSON.parse(rosterReadFile_(id));if(archive.schema!==1||archive.date!==date||!Array.isArray(archive.audit))error_(503,'The allocation audit archive is invalid.');return {handled:true,result:archive};}
 if(op==='edgeModel'){/* 0.9.9a: uploaded model files are immutable and each upload has a new ID; read the register only. Activation still re-checks the exact source digest under the writer fence. */if(typeof p.modelFile!=='string'||!p.modelFile)error_(400,'Reload the Roster import page and import again.');const entry=rosterIndex_().entries.find(row=>row.id===p.id);if(!entry)error_(404,'Baseline model not found.');if(entry.modelFile!==p.modelFile)error_(409,'A timetable model changed during import. Import again.');return {handled:true,result:{id:entry.id,model:rosterModel_(entry)}};}
 const script=LockService.getScriptLock();if(!deployLock_(script,8000))error_(503,'A Roster save is finishing. Retry migration.');let user;
 try{user=typeof rosterNotificationLock_==='function'?rosterNotificationLock_():LockService.getUserLock();if(!deployLock_(user,8000))error_(503,'Notification delivery is finishing. Retry migration.');const snapshot=rosterEdgeSnapshot_();if(op==='edgeExport'){rosterEdgeRememberSnapshotParts_(snapshot);if(typeof rosterAllocationAuditUnpack_==='function')rosterAllocationAuditUnpack_(snapshot.state);if(typeof rosterOperationsUnpackPlans_==='function')rosterOperationsUnpackPlans_(snapshot.state);return {handled:true,result:{...snapshot,adminVerified:true}};}
  // Owner ruling 2 Nov 2026: only short-lived editing locks may differ. Every other part must
  // match the imported snapshot's stored per-part fingerprints; without them the full digest decides.
  let tolerated=[];
  if(typeof p.sourceDigest!=='string'||!/^[a-f0-9]{64}$/.test(p.sourceDigest))error_(409,'The imported snapshot is no longer current. Legacy writers remain enabled; migrate the latest source before cutover.');
  if(p.sourceDigest!==snapshot.sourceDigest){const changed=rosterEdgeChangedParts_(snapshot,p.sourceDigest);if(!(Array.isArray(changed)&&changed.length&&changed.every(part=>ROSTER_EDGE_EPHEMERAL_PARTS_.includes(part))))error_(409,'The imported snapshot is no longer current. Legacy writers remain enabled; migrate the latest source before cutover.'+(changed?.length?' Changed since the snapshot: '+changed.join(', ')+'.':''));tolerated=changed;}
  props_().setProperties({ROSTER_EDGE_AUTHORITY:'d1',ROSTER_EDGE_SOURCE_DIGEST:p.sourceDigest,ROSTER_EDGE_FENCED_AT:new Date().toISOString(),...(tolerated.length?{ROSTER_EDGE_FENCE_TOLERATED:JSON.stringify({parts:tolerated,currentDigest:snapshot.sourceDigest,at:new Date().toISOString()})}:{})});props_().deleteProperty('ROSTER_FRESH_START_ACTIVE');
  return {handled:true,result:{legacyWritesDisabled:true,sourceDigest:p.sourceDigest,toleratedParts:tolerated,adminVerified:true,cutoverFreeze:rosterCutoverStatus_()}};
 }finally{if(user)deployUnlock_(user);deployUnlock_(script);}
}
function rosterEdgeServiceMigrationDispatch_(req){
 if(req.input?.operation==='edgeFreshStartRelease')return {handled:true,result:rosterFreshStartRelease_(req.input)};
 if(req.input?.operation==='edgeDeployPublication')return {handled:true,result:deployEdgeRosterPublication_(req.input)};
 const op=req.input?.operation;if(op==='edgeReferences'){const fresh=rosterServiceContacts_();return {handled:true,result:rosterEdgeReferences_(fresh.c,false)};}
 if(op==='edgeFenceStatus')return {handled:true,result:{legacyWritesDisabled:props_().getProperty('ROSTER_EDGE_AUTHORITY')==='d1',sourceDigest:props_().getProperty('ROSTER_EDGE_SOURCE_DIGEST')||null,cutoverFreeze:rosterCutoverStatus_()}};
 if(op==='edgeCutoverComplete')return {handled:true,result:rosterCutoverComplete_(req.input)};
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
 if(Number(metadata.size)!==descriptor.totalBytes||metadata.trashed||!rosterEdgeExportPrivateParent_(metadata.parents))error_(503,'The immutable export container length or private folder changed.');
 const prefix=rosterEdgeExportRange_(fileId,0,9,descriptor.totalBytes);if(!/^\d{8}\n$/.test(prefix)||Number(prefix.slice(0,8))!==descriptor.headerBytes||descriptor.headerBytes>GSiSRosterImport.MAX_MANIFEST_BYTES+200)error_(503,'The immutable export header is invalid.');
 const header=JSON.parse(rosterEdgeExportRange_(fileId,9,descriptor.headerBytes,descriptor.totalBytes)),manifest=header.manifest;
 GSiSRosterImport.validateManifest(manifest);if(rosterEdgeExportHash_(JSON.stringify(manifest))!==descriptor.manifestDigest||header.manifestDigest!==descriptor.manifestDigest||manifest.sourceDigest!==descriptor.sourceDigest||manifest.sessionId!==descriptor.sessionId||manifest.actor!==descriptor.actor||manifest.requestId!==descriptor.requestId||9+descriptor.headerBytes+manifest.totalBytes!==descriptor.totalBytes)error_(503,'The immutable export header does not match the frozen source.');return header;
}
function rosterEdgeExportFind_(descriptor){
 const files=rosterEdgeExportFilesNamed_(descriptor.name);if(files.length>20)error_(503,'The immutable export recovery listing is incomplete.');const verified=[];
 for(const file of files){if(Number(file.size)!==descriptor.totalBytes)continue;try{const header=rosterEdgeExportHeader_(descriptor,file.id);verified.push({id:file.id,header});}catch(error){if(error.status!==503)throw error;}}
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

function rosterEdgeExportManifestLegacy_(req){
 const binding=rosterEdgeExportBinding_(req),script=LockService.getScriptLock();if(!deployLock_(script,8000))error_(503,'A Roster save is finishing. Retry the same import.');let user,snapshot,descriptor,created=false;
 try{
  descriptor=rosterEdgeExportDescriptor_(binding);if(!descriptor){
  if(Object.keys(props_().getProperties()).filter(key=>key.startsWith('ROSTER_EDGE_EXPORT:')).length>=GSiSRosterImport.MAX_RETAINED_SESSIONS)error_(409,'Preparation has 24 retained sessions. Reviewed archival and cleanup are required before a new capture; existing sessions remain resumable.');
  rosterEdgeAssertLegacyWrite_(true);user=typeof rosterNotificationLock_==='function'?rosterNotificationLock_():LockService.getUserLock();if(!deployLock_(user,8000))error_(503,'Notification delivery is finishing. Retry the same import.');
  descriptor={...binding,state:'preparing',sourceDigest:null,createdAt:Date.now(),leaseUntil:Date.now()+600000,name:'Roster immutable import '+binding.sessionId+'.bin'};rosterEdgeExportSave_(descriptor);created=true;
  snapshot=rosterEdgeSnapshot_();rosterEdgeRememberSnapshotParts_(snapshot);descriptor.sourceDigest=snapshot.sourceDigest;rosterEdgeExportSave_(descriptor);
  }
 }catch(error){if(created){descriptor.state='failed';rosterEdgeExportSave_(descriptor);}throw error;}finally{if(user)deployUnlock_(user);deployUnlock_(script);}
 if(!created)return rosterEdgeExportResume_(binding,descriptor);
 let uploadStarted=false;
 try{
  if(typeof rosterAllocationAuditUnpack_==='function')rosterAllocationAuditUnpack_(snapshot.state);if(typeof rosterOperationsUnpackPlans_==='function')rosterOperationsUnpackPlans_(snapshot.state);snapshot.state=GSISRosterOperations.validateState(snapshot.state);
  const frozen=GSiSRosterImport.freeze(snapshot,binding,{hash:rosterEdgeExportHash_,gzip:value=>Utilities.gzip(Utilities.newBlob(value,'application/json')).getBytes(),base64:bytes=>Utilities.base64Encode(bytes),readModel:entry=>GSISRoster.validate(rosterEdgeExportObject_(entry.modelFile)),readArchive:(date,id)=>{const archive=rosterEdgeExportObject_(id);if(archive.schema!==1||archive.date!==date||!Array.isArray(archive.audit))error_(503,'The captured allocation audit archive is invalid.');return archive;}}),header=JSON.stringify({manifest:frozen.manifest,manifestDigest:frozen.manifestDigest}),headerBytes=Utilities.newBlob(header).getBytes().length;
  Object.assign(descriptor,{manifestDigest:frozen.manifestDigest,headerBytes,totalBytes:9+headerBytes+frozen.manifest.totalBytes});rosterEdgeExportSave_(descriptor);
  const container=String(headerBytes).padStart(8,'0')+'\n'+header+frozen.parts.join('');uploadStarted=true;const fileId=rosterCreateFile_(rosterEdgeExportImportFolder_(true),descriptor.name,Utilities.newBlob(container,'application/octet-stream')),verified=rosterEdgeExportHeader_(descriptor,fileId);
  Object.assign(descriptor,{state:'ready',fileId});rosterEdgeExportSave_(descriptor);return rosterEdgeExportReply_(descriptor,verified);
 }catch(error){if(!uploadStarted){descriptor.state='failed';rosterEdgeExportSave_(descriptor);}throw error;}
}
function rosterEdgeExportPartLegacy_(req){const binding=rosterEdgeExportBinding_(req),descriptor=rosterEdgeExportDescriptor_(binding);if(!descriptor||descriptor.state!=='ready')error_(409,'The immutable export is not ready. Resume its manifest request.');const header=rosterEdgeExportHeader_(descriptor,descriptor.fileId),part=header.manifest.parts.find(row=>row.id===req.input.partId);if(!part)error_(404,'The immutable export part is not in this session.');const payload=rosterEdgeExportRange_(descriptor.fileId,9+descriptor.headerBytes+part.offset,part.bytes,descriptor.totalBytes);if(rosterEdgeExportHash_(payload)!==part.digest)error_(503,'The immutable export part failed its digest check.');return {adminVerified:true,sessionId:binding.sessionId,manifestDigest:descriptor.manifestDigest,partId:part.id,payload};}

/* Resumable preparation v2. Only capture holds production locks. Later writes
 * are immutable; the gateway's D1 step lease fences the accepted checkpoint. */
const ROSTER_EXPORT_V2='gsis-roster-export-v2',ROSTER_EXPORT_BATCH_BYTES=262157;
function rosterEdgeExportBindingV2_(req){
 const p=req.input||{};if(Object.keys(p).some(key=>!['operation','requestId','sessionId','partId','preparation','resetRequestId'].includes(key)))error_(400,'Export file IDs and byte ranges are selected only by the backend.');
 const input={operation:p.operation,requestId:p.requestId,...(p.sessionId!==undefined?{sessionId:p.sessionId}:{}),...(p.partId!==undefined?{partId:p.partId}:{})};return rosterEdgeExportBinding_({...req,input});
}
function rosterEdgeExportAbandoned_(binding){
 const raw=props_().getProperty('ROSTER_EDGE_EXPORT_ABANDONED:'+binding.sessionId);if(!raw)return null;const value=JSON.parse(raw);
 if(value.actor!==binding.actor||value.requestId!==binding.requestId||value.sessionId!==binding.sessionId)error_(409,'The retained export identity does not match.');return value;
}
function rosterEdgeExportPreparation_(p){
 const value=p.preparation;if(!value||!Number.isSafeInteger(value.ordinal)||value.ordinal<0||value.ordinal>8192||Object.keys(value).some(key=>!['ordinal','checkpoint'].includes(key)))error_(400,'A valid preparation step is required.');
 const ref=value.checkpoint;if(value.ordinal===0){if(ref!==null)error_(400,'The first preparation step cannot select a checkpoint.');}
 else if(!ref||typeof ref.fileId!=='string'||!ref.fileId||! /^[a-f0-9]{64}$/.test(ref.digest||'')||Object.keys(ref).some(key=>!['fileId','digest'].includes(key)))error_(400,'A verified preparation checkpoint is required.');return value;
}
var rosterEdgeExportImportFolderId_='';
function rosterEdgeExportImportFolder_(create=false){
 if(rosterEdgeExportImportFolderId_)return rosterEdgeExportImportFolderId_;
 let id=rosterFindFile_(ROSTER_DATA,'Roster import files');
 if(!id&&create){const response=rosterDriveRequest_('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id',{method:'post',contentType:'application/json; charset=UTF-8',payload:JSON.stringify({name:'Roster import files',mimeType:'application/vnd.google-apps.folder',parents:[ROSTER_DATA]})},'import-folder-create',true);id=rosterDriveJson_(response,'import-folder-create').id;if(typeof id!=='string'||!id)error_(503,'The import folder could not be confirmed.');}
 if(id){rosterFolder_(id);rosterEdgeExportImportFolderId_=id;}return id||'';
}
function rosterEdgeExportPrivateParent_(parents){return Array.isArray(parents)&&(parents.includes(ROSTER_DATA)||parents.includes(rosterEdgeExportImportFolder_(false)));}
function rosterEdgeExportPrivateMeta_(id){
 const metadata=rosterDriveJson_(rosterDriveRequest_('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?supportsAllDrives=true&fields=id,size,parents,trashed',{},'export-file-metadata'),'export-file-metadata');
 if(metadata.trashed||!rosterEdgeExportPrivateParent_(metadata.parents)||!Number.isSafeInteger(Number(metadata.size))||Number(metadata.size)<1||Number(metadata.size)>67108864)error_(503,'The private preparation file is unavailable or exceeds its size bound.');return metadata;
}
function rosterEdgeExportPrivateText_(ref,maxBytes=67108864){
 const meta=rosterEdgeExportPrivateMeta_(ref.fileId);if(Number(meta.size)>maxBytes)error_(413,'The preparation checkpoint exceeds its size bound.');
 const raw=rosterReadFile_(ref.fileId);if(Utilities.newBlob(raw).getBytes().length!==Number(meta.size)||rosterEdgeExportHash_(raw)!==ref.digest)error_(503,'The private preparation file failed verification.');return raw;
}
function rosterEdgeExportFilesNamed_(name){
 const folder=rosterFolder_(ROSTER_DATA),quote=value=>String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'"),child=rosterEdgeExportImportFolder_(false),parents=[ROSTER_DATA,...(child?[child]:[])],query='('+parents.map(id=>"'"+quote(id)+"' in parents").join(' or ')+") and name = '"+quote(name)+"' and trashed = false",url='https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100&fields='+encodeURIComponent('files(id,name,size),nextPageToken,incompleteSearch')+'&q='+encodeURIComponent(query)+(folder.driveId?'&corpora=drive&driveId='+encodeURIComponent(folder.driveId):'&corpora=user');
 const value=rosterDriveJson_(rosterDriveRequest_(url,{},'export-file-recovery'),'export-file-recovery');if(!Array.isArray(value.files)||value.nextPageToken||value.incompleteSearch)error_(503,'The preparation recovery listing is incomplete.');return value.files.filter(file=>!file.name||file.name===name).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
}
function rosterEdgeExportCreateImmutable_(name,raw,type='application/json',options={}){
 const digest=rosterEdgeExportHash_(raw),bytes=Utilities.newBlob(raw).getBytes().length;
 if(!options.knownMissing)for(const file of rosterEdgeExportFilesNamed_(name)){if(Number(file.size)!==bytes)continue;try{rosterEdgeExportPrivateText_({fileId:file.id,digest});return {fileId:file.id,digest};}catch(error){if(error.status!==503)throw error;}}
 const fileId=rosterCreateFile_(rosterEdgeExportImportFolder_(true),name,Utilities.newBlob(raw,type));
 if(options.verify){const saved=rosterReadFile_(fileId);if(Utilities.newBlob(saved).getBytes().length!==bytes||rosterEdgeExportHash_(saved)!==digest)error_(503,'The new immutable part failed readback verification.');}
 return {fileId,digest};
}
function rosterEdgeExportCheckpointName_(binding,ordinal){return 'Roster import '+binding.sessionId+' checkpoint '+String(ordinal).padStart(5,'0')+'.json';}
function rosterEdgeExportReadCheckpoint_(binding,ref){
 const checkpoint=JSON.parse(rosterEdgeExportPrivateText_(ref,2097152));
 if(checkpoint.schema!==ROSTER_EXPORT_V2||checkpoint.actor!==binding.actor||checkpoint.requestId!==binding.requestId||checkpoint.sessionId!==binding.sessionId||!Number.isSafeInteger(checkpoint.ordinal)||!Array.isArray(checkpoint.parts)||!Array.isArray(checkpoint.references)||!checkpoint.source||typeof checkpoint.source.fileId!=='string'||! /^[a-f0-9]{64}$/.test(checkpoint.source.digest||''))error_(409,'The preparation checkpoint belongs to another source or session.');return checkpoint;
}
function rosterEdgeExportAssertCheckpointV2_(binding,checkpoint,descriptor){
 if(!descriptor||descriptor.schema!==2||descriptor.actor!==binding.actor||descriptor.requestId!==binding.requestId||descriptor.sessionId!==binding.sessionId||checkpoint.actor!==binding.actor||checkpoint.requestId!==binding.requestId||checkpoint.sessionId!==binding.sessionId||checkpoint.sourceDigest!==descriptor.sourceDigest||checkpoint.source?.digest!==descriptor.sourceHash||descriptor.sourceFileId&&checkpoint.source?.fileId!==descriptor.sourceFileId)error_(409,'The checkpoint does not match the captured source.');
 if(!Array.isArray(checkpoint.parts)||checkpoint.parts.length>GSiSRosterImport.MAX_PARTS||!checkpoint.partFiles||typeof checkpoint.partFiles!=='object')error_(503,'The preparation part inventory is invalid.');
 for(const part of checkpoint.parts){const file=checkpoint.partFiles[part.id];if(!file||typeof file.fileId!=='string'||!file.fileId||file.digest!==part.digest||file.bytes!==part.bytes)error_(503,'The preparation part inventory does not match its files.');}
 if(checkpoint.stage==='ready'){
  const manifest=checkpoint.manifest;GSiSRosterImport.validateManifest(manifest);
  if(manifest.actor!==binding.actor||manifest.requestId!==binding.requestId||manifest.sessionId!==binding.sessionId||manifest.sourceDigest!==descriptor.sourceDigest||checkpoint.manifestDigest!==rosterEdgeExportHash_(JSON.stringify(manifest))||JSON.stringify(manifest.parts)!==JSON.stringify(checkpoint.parts)||JSON.stringify(manifest.scopes)!==JSON.stringify(checkpoint.scopes)||manifest.totalBytes!==checkpoint.totalBytes)error_(409,'The ready manifest does not match its captured source and parts.');
 }
}
function rosterEdgeExportRecoveredCheckpoint_(binding,step){
 let unreadable;
 for(const file of rosterEdgeExportFilesNamed_(rosterEdgeExportCheckpointName_(binding,step.ordinal))){
  if(Number(file.size)>2097152)continue;let raw,checkpoint;try{raw=rosterReadFile_(file.id);checkpoint=JSON.parse(raw);}catch(error){unreadable=error;continue;}
  if(checkpoint.schema===ROSTER_EXPORT_V2&&checkpoint.actor===binding.actor&&checkpoint.requestId===binding.requestId&&checkpoint.sessionId===binding.sessionId&&checkpoint.ordinal===step.ordinal&&JSON.stringify(checkpoint.previous||null)===JSON.stringify(step.checkpoint||null))return {checkpoint,ref:{fileId:file.id,digest:rosterEdgeExportHash_(raw)}};
 }if(unreadable)error_(503,'The retained preparation checkpoint could not be read. Retry its read before repeating work.');return null;
}
function rosterEdgeExportCheckpoint_(req){
 const binding=rosterEdgeExportBindingV2_(req),step=rosterEdgeExportPreparation_(req.input);
 if(rosterEdgeExportAbandoned_(binding))error_(409,'This preparation was abandoned.');
 const descriptor=rosterEdgeExportDescriptor_(binding),recovered=rosterEdgeExportRecoveredCheckpoint_(binding,step);
 if(!recovered)return {adminVerified:true,sessionId:binding.sessionId,completed:false};
 rosterEdgeExportAssertCheckpointV2_(binding,recovered.checkpoint,descriptor);
 return {...rosterEdgeExportReplyV2_(recovered.checkpoint,recovered.ref),completed:true};
}
function rosterEdgeExportReplyV2_(checkpoint,ref){
 const uploaded=checkpoint.parts.length,part=checkpoint.work?.header?.partMetadata[checkpoint.work.next],pending=checkpoint.batch?Math.max(0,checkpoint.batch.total-checkpoint.batch.next):0;
 const remaining=checkpoint.stage==='ready'?0:checkpoint.budgetVersion===1?(pending?pending*2-(checkpoint.work?1:0):0)+Math.max(0,checkpoint.jobs-checkpoint.jobIndex-(pending&&checkpoint.stage==='objects'?1:0))*4+(checkpoint.stage==='objects'?5:1):(checkpoint.work?Math.ceil((checkpoint.work.parts-checkpoint.work.next)/2):0)+Math.max(0,checkpoint.jobs-checkpoint.jobIndex)+(checkpoint.stage==='records'||checkpoint.stage==='objects'?2:1);
 const nextStep=part?{phase:'Freeze parts',bytes:part.bytes,records:part.records,partId:part.id}:{phase:checkpoint.stage==='finalize'?'Manifest':'Prepare source',bytes:checkpoint.sourceBytes??null,records:null};
 const checkpointInputDigest=rosterEdgeExportHash_(JSON.stringify({sessionId:checkpoint.sessionId,ordinal:checkpoint.ordinal,checkpoint:checkpoint.previous||null}));
 const value={adminVerified:true,sessionId:checkpoint.sessionId,requestId:checkpoint.requestId,sourceDigest:checkpoint.sourceDigest,preparation:{ordinal:checkpoint.ordinal+1,checkpoint:ref},checkpointInputDigest,step:checkpoint.ordinal+1,phase:checkpoint.lastStep,nextStep,stepSize:checkpoint.stepSize||null,done:checkpoint.ordinal+1,total:checkpoint.ordinal+1+remaining,elapsedMs:checkpoint.elapsedMs||checkpoint.timing?.elapsedMs||0,stepElapsedMs:checkpoint.timing?.elapsedMs||0,preparedParts:uploaded};
 return checkpoint.stage==='ready'?{...value,manifest:checkpoint.manifest,manifestDigest:checkpoint.manifestDigest}:{...value,preparing:true,retryAfterMs:2000};
}
function rosterEdgeExportReadCapturedAudit_(envelope,date,fileId){
 const captured=envelope.snapshot.state.allocationAuditExports?.[date];if(!captured||captured.archiveFileId!==fileId)error_(409,'The audit does not belong to the captured source.');
 const raw=rosterReadFile_(fileId);if(Utilities.newBlob(raw).getBytes().length>GSiSRosterImport.MAX_OBJECT_BYTES)error_(413,'The captured audit exceeds its object bound.');
 if(captured.archiveDigest&&rosterEdgeExportHash_(raw)!==captured.archiveDigest)error_(503,'The immutable captured audit failed its digest check.');
 const value=JSON.parse(raw);if(value.schema!==1||value.date!==date||!Array.isArray(value.audit)||captured.archiveVersion!==undefined&&value.version!==captured.archiveVersion||captured.archiveRevision!==undefined&&value.revision!==captured.archiveRevision)error_(503,'The captured audit content or version changed.');return value;
}
function rosterEdgeExportPhaseV2_(descriptor,phase){
 descriptor.lastPhase=phase;descriptor.phaseStartedAt=Date.now();rosterEdgeExportSave_(descriptor);
}
function rosterEdgeExportFailureV2_(descriptor,error){
 const now=Date.now(),status=Number(error?.status);descriptor.failureReason={status:Number.isInteger(status)&&status>=400&&status<=599?status:503,message:String(error?.message||'Preparation failed. Retry the same import.').slice(0,800),phase:String(error?.failurePhase||descriptor.lastPhase||'Preparation').slice(0,80),elapsed:Math.max(0,now-(descriptor.stepStartedAt||descriptor.createdAt||now))};
 if(descriptor.stepSize)Object.assign(descriptor.failureReason,descriptor.stepSize);
 descriptor.failedAt=now;rosterEdgeExportSave_(descriptor);return descriptor.failureReason;
}
function rosterEdgeExportDiagnostic_(error,trace){
 const reason=error?.failureReason||{},integer=value=>Number.isSafeInteger(value)&&value>=0?value:null;
 const supplied=reason.code||error?.code,timeout=error?.status===504||/timed?\s*out|timeout|deadline|maximum execution time/i.test(String(reason.message||error?.message||''));
 const code=typeof supplied==='string'&&/^(?:ROSTER_IMPORT_[A-Z0-9_]{1,50}|ROSTER_GOOGLE_(?:ERROR|TIMEOUT)|ROSTER_CUTOVER_FROZEN|EDGE_RECORD_TOO_LARGE)$/.test(supplied)?supplied:timeout?'ROSTER_GOOGLE_TIMEOUT':'ROSTER_GOOGLE_ERROR';
 const phase=reason.phase||error?.failurePhase||trace.phase,phases=['Preparation','Capture snapshot','Serialize packed source','Hash packed source','Upload packed source','Recover checkpoint','Freeze parts','Prepare baseline','Prepare audit','Prepare stapler','Prepare records','Snapshot checks','Recover cached job','Scope digests','Save checkpoint','Manifest'];
 const ordinal=integer(trace.preparationOrdinal),diagnostic={code,ordinal:ordinal!==null&&ordinal<=8192?ordinal:null,phase:phases.includes(phase)?phase:'Preparation',bytes:integer(reason.bytes),records:integer(reason.records),elapsed:integer(reason.elapsed)??Math.max(0,Date.now()-trace.started)};
 // Log one allowlisted record at the response boundary, never raw errors,
 // stack traces, staff records, private file identifiers or request payloads.
 rosterDiagnosticLog_(diagnostic);
 const status=reason.status??error?.status;
 return {status:Number.isSafeInteger(status)&&status>=400&&status<=599?status:503,message:'Preparation failed. Retry the same import.',...diagnostic,...(/^part-\d{5}$/.test(reason.partId||'')?{partId:reason.partId}:{})};
}
function rosterEdgeExportCaptureV2_(binding){
 let descriptor=rosterEdgeExportDescriptor_(binding);if(descriptor){
  if(descriptor.state==='failed')return descriptor;
  if(descriptor.sourceFileId)return descriptor;
  let verificationError;
  if(descriptor.sourceHash){for(const file of rosterEdgeExportFilesNamed_(descriptor.sourceName))if(Number(file.size)===descriptor.sourceBytes){try{rosterEdgeExportPrivateText_({fileId:file.id,digest:descriptor.sourceHash});return {...descriptor,sourceFileId:file.id};}catch(error){if(error.status!==503)throw error;verificationError=error;}}}
  // An unreadable candidate is not evidence that the captured source is absent.
  if(verificationError)throw verificationError;
  // A retry owns the next D1 step lease after the previous execution horizon.
  // With no recoverable source bytes, retain this identity and require restart.
  descriptor={...descriptor,state:'failed'};rosterEdgeExportFailureV2_(descriptor,{status:503,message:'The frozen source is incomplete. The prior execution stopped during '+(descriptor.lastPhase||'capture')+'. Restart with a new request ID.'});return descriptor;
 }
 const folderId=rosterEdgeExportImportFolder_(true),script=LockService.getScriptLock();if(!deployLock_(script,8000))error_(503,'A Roster save is finishing. Retry the same import.');let user,envelope,raw;
 try{
  descriptor=rosterEdgeExportDescriptor_(binding);if(descriptor)return descriptor;
  const retained=new Set(Object.keys(props_().getProperties()).filter(key=>key.startsWith('ROSTER_EDGE_EXPORT:')||key.startsWith('ROSTER_EDGE_EXPORT_ABANDONED:')).map(key=>key.slice(key.indexOf(':')+1)));
  if(retained.size>=GSiSRosterImport.MAX_RETAINED_SESSIONS)error_(409,'Preparation has 24 retained sessions. Reviewed archival and cleanup are required before a new capture; existing sessions remain resumable.');
  rosterEdgeAssertLegacyWrite_(true);user=typeof rosterNotificationLock_==='function'?rosterNotificationLock_():LockService.getUserLock();if(!deployLock_(user,8000))error_(503,'Notification delivery is finishing. Retry the same import.');
  descriptor={schema:2,...binding,state:'capturing',preparationOrdinal:0,createdAt:Date.now(),stepStartedAt:Date.now(),sourceName:'Roster import '+binding.sessionId+' source.json'};rosterEdgeExportPhaseV2_(descriptor,'Capture snapshot');
  const snapshot=rosterEdgeSnapshot_();envelope={schema:ROSTER_EXPORT_V2,...binding,sourceDigest:snapshot.sourceDigest,snapshot};
  rosterEdgeExportPhaseV2_(descriptor,'Serialize packed source');raw=JSON.stringify(envelope);
  rosterEdgeExportPhaseV2_(descriptor,'Hash packed source');Object.assign(descriptor,{sourceDigest:snapshot.sourceDigest,sourceHash:rosterEdgeExportHash_(raw),sourceBytes:Utilities.newBlob(raw).getBytes().length,jobs:GSiSRosterImport.objectJobs(snapshot).length});if(descriptor.sourceBytes>67108864)error_(413,'The frozen source exceeds its 64 MiB bound.');rosterEdgeExportSave_(descriptor);
 }catch(error){if(descriptor){descriptor.state='failed';rosterEdgeExportFailureV2_(descriptor,error);}throw error;}finally{if(user)deployUnlock_(user);deployUnlock_(script);}
 // All mutable records and pinned references are now plain stored values. No
 // production lock remains while Drive uploads these immutable source bytes.
 rosterEdgeExportPhaseV2_(descriptor,'Upload packed source');descriptor.sourceFileId=rosterCreateFile_(folderId,descriptor.sourceName,Utilities.newBlob(raw,'application/json'));if(rosterEdgeExportAbandoned_(binding))error_(409,'This preparation was abandoned. Its uploaded source remains retained.');descriptor.state='captured';delete descriptor.failureReason;rosterEdgeExportSave_(descriptor);return {...descriptor,catalogue:rosterEdgeExportCatalogueV2_(envelope)};
}
function rosterEdgeExportCatalogueV2_(envelope){
 return {jobs:GSiSRosterImport.objectJobs(envelope.snapshot),modelEntries:envelope.snapshot.index.entries||[],auditFiles:Object.fromEntries(Object.entries(envelope.snapshot.state.allocationAuditExports||{}).filter(([,value])=>value.archiveFileId).map(([date,value])=>[date,{archiveFileId:value.archiveFileId,...(value.archiveDigest?{archiveDigest:value.archiveDigest}:{}),...(value.archiveVersion!==undefined?{archiveVersion:value.archiveVersion}:{}),...(value.archiveRevision!==undefined?{archiveRevision:value.archiveRevision}:{})}]))};
}
function rosterEdgeExportSourceV2_(binding,source){
 const envelope=JSON.parse(rosterEdgeExportPrivateText_(source));if(envelope.schema!==ROSTER_EXPORT_V2||envelope.actor!==binding.actor||envelope.requestId!==binding.requestId||envelope.sessionId!==binding.sessionId||envelope.sourceDigest!==envelope.snapshot?.sourceDigest)error_(409,'The frozen source belongs to another session.');return envelope;
}
function rosterEdgeExportAdapterV2_(envelope){return {hash:rosterEdgeExportHash_,gzip:value=>Utilities.gzip(Utilities.newBlob(value,'application/json')).getBytes(),base64:bytes=>Utilities.base64Encode(bytes),readModel:entry=>GSISRoster.validate(rosterEdgeExportObject_(entry.modelFile)),readArchive:(date,id)=>rosterEdgeExportReadCapturedAudit_(envelope,date,id)};}
function rosterEdgeExportWorkV2_(binding,ordinal,prepared,kind,job,cached=false,next=0){
 const metadata=prepared.partMetadata,base=metadata[0]?.offset||0,chunks=[];let offset=0;
 const payloads=cached?prepared.parts.map(payload=>{const encoded=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(payload,'application/json')).getBytes());chunks.push({offset,bytes:encoded.length,digest:rosterEdgeExportHash_(encoded)});offset+=encoded.length;return encoded;}):prepared.parts;
 const header={schema:ROSTER_EXPORT_V2,...binding,ordinal,kind,job:job||null,partMetadata:metadata,reference:prepared.reference||null,scopes:prepared.scopes||null,position:prepared.position,base,...(cached?{encoding:'gzip-base64-parts-v1',chunks}:{})},json=JSON.stringify(header),headerBytes=Utilities.newBlob(json).getBytes().length;
 if(headerBytes>GSiSRosterImport.MAX_MANIFEST_BYTES+2000)error_(413,'The preparation work header exceeds its size bound.');
 const raw=String(headerBytes).padStart(8,'0')+'\n'+json+payloads.join(''),name='Roster import '+binding.sessionId+' work '+String(ordinal).padStart(5,'0')+'.bin',headerDigest=rosterEdgeExportHash_(json),totalBytes=Utilities.newBlob(raw).getBytes().length;
 const descriptor=cached?rosterEdgeExportDescriptor_(binding):null,prior=descriptor?.workIntent;
 if(descriptor){if(prior?.ordinal===ordinal&&prior.headerDigest!==headerDigest)error_(409,'The cached job plan changed.');descriptor.workIntent={ordinal,name,digest:rosterEdgeExportHash_(raw),headerDigest,headerBytes,totalBytes,parts:metadata.length,next};rosterEdgeExportSave_(descriptor);}
 const ref=rosterEdgeExportCreateImmutable_(name,raw,'application/octet-stream',{knownMissing:cached&&prior?.ordinal!==ordinal});
 return {...ref,header,headerDigest,headerBytes,totalBytes,parts:metadata.length,next};
}
function rosterEdgeExportRecoverWorkV2_(binding,ordinal,descriptor){
 const intent=descriptor?.workIntent;if(!intent||intent.ordinal!==ordinal)return null;
 for(const file of rosterEdgeExportFilesNamed_(intent.name)){
  if(Number(file.size)!==intent.totalBytes)continue;
  const work={...intent,fileId:file.id},header=rosterEdgeExportWorkHeaderV2_(binding,work);
  if(header.ordinal!==ordinal||header.encoding!=='gzip-base64-parts-v1'||header.chunks?.length!==intent.parts)error_(409,'The retained cached job plan is invalid.');
  return {...work,header};
 }
 return null;
}
function rosterEdgeExportCachedPayload_(header,index,encoded){
 const chunk=header.chunks[index];if(encoded.length!==chunk.bytes||rosterEdgeExportHash_(encoded)!==chunk.digest)error_(503,'The cached part failed its digest check.');
 const payload=Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(encoded),'application/x-gzip','roster-import-part.json.gz')).getDataAsString('UTF-8');if(Utilities.newBlob(payload).getBytes().length!==header.partMetadata[index].bytes)error_(503,'The cached part length changed.');return payload;
}
function rosterEdgeExportCachedScopes_(binding,work){
 const header=rosterEdgeExportWorkHeaderV2_(binding,work),raw=rosterEdgeExportPrivateText_(work),data=Utilities.newBlob(Utilities.newBlob(raw).getBytes().slice(9+work.headerBytes)).getDataAsString('UTF-8'),rows={roster:[],'roster-register':[]},segments={};
 for(let i=0;i<header.partMetadata.length;i++){
  const part=header.partMetadata[i],chunk=header.chunks[i],body=JSON.parse(rosterEdgeExportCachedPayload_(header,i,data.slice(chunk.offset,chunk.offset+chunk.bytes)));
  if(part.kind==='segment')segments[part.id]=Utilities.base64Decode(body.base64);
  else if(part.kind==='records')rows[part.scope].push(...body.rows);
  else if(part.kind==='record'){
   const bytes=body.segments.flatMap(id=>{if(!segments[id])error_(503,'A cached record segment is missing.');return segments[id];});
   if(bytes.length!==body.bytes||rosterEdgeExportHash_(bytes)!==body.digest)error_(503,'The cached record assembly changed.');rows[part.scope].push(...JSON.parse(Utilities.newBlob(bytes).getDataAsString('UTF-8')).rows);
  }else error_(503,'The cached record job has an invalid part kind.');
 }
 const scopes={};for(const scope of ['roster','roster-register']){if(rows[scope].length!==header.scopes[scope].records)error_(503,'The cached scope record count changed.');scopes[scope]={records:rows[scope].length,digest:rosterEdgeExportHash_(GSiSEdgeStore.canonicalJson(GSiSEdgeStore.decode(rows[scope])))};}return scopes;
}
function rosterEdgeExportWorkHeaderV2_(binding,work){
 // The immutable checkpoint authenticates this header. Avoid fetching it three
 // times for every part; old checkpoints still use the verified Drive path.
 if(work.header&&rosterEdgeExportHash_(JSON.stringify(work.header))===work.headerDigest)return work.header;
 const meta=rosterEdgeExportPrivateMeta_(work.fileId);if(Number(meta.size)!==work.totalBytes)error_(503,'The preparation work file length changed.');
 const prefix=rosterEdgeExportRange_(work.fileId,0,9,work.totalBytes);if(!/^\d{8}\n$/.test(prefix)||Number(prefix.slice(0,8))!==work.headerBytes)error_(503,'The preparation work header is invalid.');
 const raw=rosterEdgeExportRange_(work.fileId,9,work.headerBytes,work.totalBytes);if(rosterEdgeExportHash_(raw)!==work.headerDigest)error_(503,'The preparation work header failed verification.');const value=JSON.parse(raw);if(value.schema!==ROSTER_EXPORT_V2||value.actor!==binding.actor||value.requestId!==binding.requestId||value.sessionId!==binding.sessionId||!Array.isArray(value.partMetadata)||value.partMetadata.length!==work.parts)error_(409,'The work file belongs to another preparation.');return value;
}
function rosterEdgeExportManifestV2_(req){
 const binding=rosterEdgeExportBindingV2_(req),started=Date.now();if(rosterEdgeExportAbandoned_(binding))error_(409,'This preparation was abandoned. Start with a new request ID.');
 const existing=rosterEdgeExportDescriptor_(binding);if(existing&&existing.schema!==2){const input={...req.input};delete input.preparation;return rosterEdgeExportManifestLegacy_({...req,input});}
 const step=rosterEdgeExportPreparation_(req.input);
 if(existing?.schema===2&&step.ordinal>0){existing.stepStartedAt=started;existing.stepSize={bytes:null,records:null};rosterEdgeExportPhaseV2_(existing,'Recover checkpoint');}
 // A new ordinal has never uploaded its checkpoint. Retries still search and
 // verify the immutable checkpoint before doing any work.
 const recovering=existing&&(existing.preparationOrdinal===undefined||existing.preparationOrdinal>=step.ordinal);
 const recovered=recovering?rosterEdgeExportRecoveredCheckpoint_(binding,step):null;if(recovered){rosterEdgeExportAssertCheckpointV2_(binding,recovered.checkpoint,existing);return rosterEdgeExportReplyV2_(recovered.checkpoint,recovered.ref);}
 let checkpoint;
 if(step.ordinal===0){
  const descriptor=rosterEdgeExportCaptureV2_(binding);if(descriptor.state==='failed')return {adminVerified:true,sessionId:binding.sessionId,requestId:binding.requestId,preparationFailed:true,requiresRestart:true,failureReason:descriptor.failureReason,lastPhase:descriptor.lastPhase};
  const source={fileId:descriptor.sourceFileId,digest:descriptor.sourceHash},catalogue=descriptor.catalogue||rosterEdgeExportCatalogueV2_(rosterEdgeExportSourceV2_(binding,source));
  checkpoint={schema:ROSTER_EXPORT_V2,...binding,ordinal:0,previous:null,source,sourceBytes:descriptor.sourceBytes,budgetVersion:2,snapshotPartsPending:true,sourceDigest:descriptor.sourceDigest,stage:'objects',jobs:catalogue.jobs.length,catalogue,jobIndex:0,parts:[],partFiles:{},references:[],scopes:{},totalBytes:0,work:null,lastStep:'Snapshot'};
 }else{
  checkpoint=rosterEdgeExportReadCheckpoint_(binding,step.checkpoint);rosterEdgeExportAssertCheckpointV2_(binding,checkpoint,existing);if(checkpoint.ordinal!==step.ordinal-1)error_(409,'The preparation step does not follow its checkpoint.');
  if(checkpoint.stage==='ready')return rosterEdgeExportReplyV2_(checkpoint,step.checkpoint);
  checkpoint={...checkpoint,ordinal:step.ordinal,previous:step.checkpoint};
  existing.preparationOrdinal=step.ordinal;rosterEdgeExportSave_(existing);
  if(checkpoint.snapshotPartsPending){
   rosterEdgeExportPhaseV2_(existing,'Snapshot checks');const envelope=rosterEdgeExportSourceV2_(binding,checkpoint.source);rosterEdgeRememberSnapshotParts_(envelope.snapshot);delete checkpoint.snapshotPartsPending;checkpoint.lastStep='Snapshot checks';
  }else if(checkpoint.work){
   rosterEdgeExportPhaseV2_(existing,'Freeze parts');
   const work=checkpoint.work,header=rosterEdgeExportWorkHeaderV2_(binding,work),cached=header.encoding==='gzip-base64-parts-v1';let bytes=0;
   let count=1,encoded='';if(cached){let encodedBytes=header.chunks[work.next].bytes;while(count<2&&work.next+count<header.partMetadata.length&&encodedBytes+header.chunks[work.next+count].bytes<=262157&&header.partMetadata.slice(work.next,work.next+count+1).reduce((n,p)=>n+p.bytes,0)<=524314){encodedBytes+=header.chunks[work.next+count].bytes;count++;}encoded=rosterEdgeExportRange_(work.fileId,9+work.headerBytes+header.chunks[work.next].offset,encodedBytes,work.totalBytes);}
   const first=work.next,end=first+count;
   while(work.next<header.partMetadata.length&&work.next<end){const declared=header.partMetadata[work.next],part={...declared};if(bytes&&Date.now()-started>35000)break;
    checkpoint.stepSize=existing.stepSize={bytes:part.bytes,records:part.records,partId:part.id};rosterEdgeExportSave_(existing);
    if(checkpoint.budgetVersion>=1&&part.bytes>ROSTER_EXPORT_BATCH_BYTES)error_(413,'The prepared part exceeds the 262157-byte step budget.');
    let payload;if(cached){const chunk=header.chunks[work.next],value=encoded.slice(chunk.offset-header.chunks[first].offset,chunk.offset-header.chunks[first].offset+chunk.bytes);payload=rosterEdgeExportCachedPayload_(header,work.next,value);}
    else payload=rosterEdgeExportRange_(work.fileId,9+work.headerBytes+part.offset-header.base,part.bytes,work.totalBytes);
    const digest=rosterEdgeExportHash_(payload);if(Utilities.newBlob(payload).getBytes().length!==part.bytes||part.digest&&digest!==part.digest||!part.digest&&!cached)error_(503,'The prepared part failed its digest check.');part.digest=digest;
    const ref=rosterEdgeExportCreateImmutable_('Roster import '+binding.sessionId+' '+part.id+' '+part.digest+'.json',payload,'application/json',{verify:true});checkpoint.parts.push(part);checkpoint.partFiles[part.id]={fileId:ref.fileId,digest:part.digest,bytes:part.bytes};checkpoint.totalBytes+=part.bytes;work.next++;bytes+=part.bytes;
   }
   checkpoint.lastStep='Freeze parts';if(work.next===header.partMetadata.length){
    if(checkpoint.batch)checkpoint.batch.next+=header.partMetadata.length;
    if(!checkpoint.batch||checkpoint.batch.next===checkpoint.batch.total){
     if(header.kind==='object'){checkpoint.references.push({job:header.job,reference:header.reference});checkpoint.jobIndex++;}else if(cached&&!header.scopes.roster.digest){checkpoint.scopeWork=work;checkpoint.stage='record-scopes';}else{checkpoint.scopes=header.scopes;checkpoint.stage='finalize';}
     checkpoint.batch=null;
    }
    checkpoint.work=null;
   }
  }else if(checkpoint.stage==='objects'||checkpoint.stage==='records'){
   existing.stepSize={bytes:checkpoint.sourceBytes??null,records:null};
   const catalogue=checkpoint.catalogue,jobs=catalogue.jobs,position={ordinal:checkpoint.parts.length,offset:checkpoint.totalBytes};
   const retained=rosterEdgeExportRecoverWorkV2_(binding,step.ordinal,existing);
   if(retained){checkpoint.work=retained;checkpoint.batch=null;checkpoint.budgetVersion=2;checkpoint.lastStep='Recover cached job';}
   else{
   // Build and compress every part once. The cached index authenticates each
   // bounded range; later ordinals neither read the source nor rebuild the job.
   const batch=checkpoint.batch||{base:position,next:0},selection={start:0,limit:GSiSRosterImport.MAX_PARTS,deferDigests:true,deferScopes:true};let prepared,kind,job;
   if(checkpoint.jobIndex<jobs.length){
    job=jobs[checkpoint.jobIndex];kind='object';rosterEdgeExportPhaseV2_(existing,'Prepare '+job.kind);
    const envelope=job.kind==='stapler'?rosterEdgeExportSourceV2_(binding,checkpoint.source):{snapshot:{sourceDigest:checkpoint.sourceDigest,index:{entries:catalogue.modelEntries},state:{allocationAuditExports:catalogue.auditFiles}}};
    if(job.kind==='stapler'&&typeof rosterOperationsUnpackPlans_==='function'){const row=envelope.snapshot.state[job.path[1]][job.path[2]];rosterOperationsUnpackPlans_({[job.path[1]]:[row]});}
    prepared=GSiSRosterImport.prepareObject(envelope.snapshot,job,batch.base,rosterEdgeExportAdapterV2_(envelope),selection);checkpoint.lastStep='Prepare '+job.kind;
   }else{
    kind='records';rosterEdgeExportPhaseV2_(existing,'Prepare records');const envelope=rosterEdgeExportSourceV2_(binding,checkpoint.source);
    prepared=GSiSRosterImport.prepareRecords(envelope.snapshot,checkpoint.references,batch.base,rosterEdgeExportAdapterV2_(envelope),selection);checkpoint.stage='records';checkpoint.lastStep='Prepare records';
   }
   if(!prepared.partMetadata.length||prepared.totalParts<=batch.next)error_(503,'The cached preparation index is incomplete.');
   const part=prepared.partMetadata[batch.next];existing.stepSize={bytes:part.bytes,records:part.records,partId:part.id};rosterEdgeExportSave_(existing);
   checkpoint.work=rosterEdgeExportWorkV2_(binding,step.ordinal,prepared,kind,job,true,batch.next);checkpoint.batch=null;checkpoint.budgetVersion=2;
   }
  }else if(checkpoint.stage==='record-scopes'){
   existing.stepSize={bytes:checkpoint.scopeWork.totalBytes,records:checkpoint.parts.reduce((n,p)=>n+p.records,0)};rosterEdgeExportPhaseV2_(existing,'Scope digests');checkpoint.scopes=rosterEdgeExportCachedScopes_(binding,checkpoint.scopeWork);delete checkpoint.scopeWork;checkpoint.stage='finalize';checkpoint.lastStep='Scope digests';
  }else if(checkpoint.stage==='finalize'){
   rosterEdgeExportPhaseV2_(existing,'Manifest');
   const ready=GSiSRosterImport.finishFreeze({sourceDigest:checkpoint.sourceDigest},binding,checkpoint.parts,checkpoint.scopes,{hash:rosterEdgeExportHash_});checkpoint.manifest=ready.manifest;checkpoint.manifestDigest=ready.manifestDigest;checkpoint.stage='ready';checkpoint.lastStep='Manifest';
  }else error_(503,'The preparation checkpoint has an unknown step.');
 }
 if(rosterEdgeExportAbandoned_(binding))error_(409,'This preparation was abandoned. Its generated files remain retained.');
 checkpoint.timing={startedAt:started,finishedAt:Date.now(),elapsedMs:Date.now()-started};checkpoint.elapsedMs=(checkpoint.elapsedMs||0)+checkpoint.timing.elapsedMs;
 const current=rosterEdgeExportDescriptor_(binding);rosterEdgeExportPhaseV2_(current,'Save checkpoint');
 const ref=rosterEdgeExportCreateImmutable_(rosterEdgeExportCheckpointName_(binding,step.ordinal),JSON.stringify(checkpoint),'application/json',{knownMissing:true});return rosterEdgeExportReplyV2_(checkpoint,ref);
}
function rosterEdgeExportManifest_(req){const binding=rosterEdgeExportBindingV2_(req);if(rosterEdgeExportAbandoned_(binding))error_(409,'This preparation was abandoned. Start with a new request ID.');try{return req.input?.preparation!==undefined?rosterEdgeExportManifestV2_(req):rosterEdgeExportManifestLegacy_(req);}catch(error){const descriptor=rosterEdgeExportDescriptor_(binding);if(descriptor?.schema===2){error.failureReason=rosterEdgeExportFailureV2_(descriptor,error);error.failurePhase=error.failureReason.phase;}throw error;}}
function rosterEdgeExportPart_(req){
 const binding=rosterEdgeExportBindingV2_(req);if(rosterEdgeExportAbandoned_(binding))error_(409,'This preparation was abandoned.');if(req.input?.preparation===undefined)return rosterEdgeExportPartLegacy_(req);const descriptor=rosterEdgeExportDescriptor_(binding);
 if(descriptor&&descriptor.schema!==2){const input={...req.input};delete input.preparation;return rosterEdgeExportPartLegacy_({...req,input});}
 const step=rosterEdgeExportPreparation_(req.input),checkpoint=rosterEdgeExportReadCheckpoint_(binding,step.checkpoint);rosterEdgeExportAssertCheckpointV2_(binding,checkpoint,descriptor);if(checkpoint.ordinal!==step.ordinal-1||checkpoint.stage!=='ready')error_(409,'The accepted preparation checkpoint is not ready.');
 GSiSRosterImport.validateManifest(checkpoint.manifest);const part=checkpoint.manifest.parts.find(p=>p.id===req.input.partId),file=part&&checkpoint.partFiles[part.id];if(!part||!file||file.digest!==part.digest||file.bytes!==part.bytes)error_(404,'The immutable export part is not in this session.');const payload=rosterEdgeExportPrivateText_(file,GSiSRosterImport.MAX_PART_BYTES);if(Utilities.newBlob(payload).getBytes().length!==part.bytes)error_(503,'The immutable export part length changed.');return {adminVerified:true,sessionId:binding.sessionId,manifestDigest:checkpoint.manifestDigest,partId:part.id,payload};
}
function rosterEdgeExportAbandon_(req){
 // Migration dispatch verified the current Admin. An emergency rollback may
 // have been imported by another Admin; retain that original capture identity.
 const input={...req.input},importActor=input.importActor;delete input.importActor;
 if(importActor!==undefined&&(typeof importActor!=='string'||!/^\S+@\S+\.\S+$/.test(importActor)||importActor.length>320))error_(400,'Use the retained import actor.');
 const binding=rosterEdgeExportBindingV2_({...req,input,identity:importActor?{...req.identity,email:importActor}:req.identity}),resetRequestId=input.resetRequestId;if(typeof resetRequestId!=='string'||!resetRequestId||resetRequestId.length>200)error_(400,'A stable restart request ID is required.');
 const prior=rosterEdgeExportAbandoned_(binding);if(prior){if(prior.resetRequestId!==resetRequestId)error_(409,'This preparation was already abandoned by another restart.');return {adminVerified:true,sessionId:binding.sessionId,abandoned:true,resetRequestId};}
 const descriptor=rosterEdgeExportDescriptor_(binding);const tombstone={schema:2,...binding,resetRequestId,abandonedAt:Date.now(),descriptor:descriptor||null};const raw=JSON.stringify(tombstone);if(Utilities.newBlob(raw).getBytes().length>8500)error_(503,'The retained preparation evidence exceeds its property bound.');
 props_().setProperty('ROSTER_EDGE_EXPORT_ABANDONED:'+binding.sessionId,raw);props_().deleteProperty('ROSTER_EDGE_EXPORT:'+binding.sessionId);return {adminVerified:true,sessionId:binding.sessionId,abandoned:true,resetRequestId};
}
