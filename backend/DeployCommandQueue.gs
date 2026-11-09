/* Deploy Google decision boundary. The native field journal carries APPLIED evidence. */
var deployQueueContext_=null,deployQueueOwnsLock_=false;
function deployQueueConfig_(){
 const raw=props_().getProperty('DEPLOY_EDGE_QUEUE_CONFIG');if(!raw)return {app:'deploy',document:'workbook',mode:'direct',generation:1,admissionPaused:false,dispatchPaused:false,recoveryPageReady:false};
 let c;try{c=JSON.parse(raw);}catch(e){error_(503,'QUEUE_CONFIG_CORRUPT');}
 if(c.app!=='deploy'||c.document!=='workbook'||c.mode!=='direct'||!Number.isSafeInteger(c.generation)||c.generation<1)error_(503,'QUEUE_CONFIG_INVALID');return c;
}
function deployQueueCanonical_(value){return GSiSEdgeCommandQueue.canonical(value);}
function deployQueueDigest_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,deployQueueCanonical_(value),Utilities.Charset.UTF_8).map(x=>(x<0?x+256:x).toString(16).padStart(2,'0')).join('');}
function deployQueueSigned_(purpose,value){const data={...value,purpose,timestamp:Date.now(),nonce:Utilities.getUuid()},payload=deployQueueCanonical_(data);return {payload,signature:signature_(payload,gsisApiSecret_())};}
function deployQueueRevision_(idx,id){const en=idx.versions.find(x=>x.id===id);return {indexRevision:idx.revision,versionId:id,versionRevision:en?.revision||0,commit:en?.commit||''};}
function deployQueueSheet_(create){const b=book_(),s=b.getSheetByName('edge_operation_receipts');return s||create? s||fieldSheet_(b,'edge_operation_receipts',['App','Document','Request ID','Decision JSON','State']):null;}

function deployQueueFind_(id){const sheet=deployQueueSheet_(false);if(!sheet||sheet.getLastRow()<2)return null;const hits=sheet.getRange(2,3,sheet.getLastRow()-1,1).createTextFinder(id).matchEntireCell(true).matchCase(true).findAll();if(hits.length>1)error_(503,'QUEUE_LEDGER_DUPLICATE');if(!hits.length)return null;const row=hits[0].getRow(),values=fieldReadValues_(sheet,row,1,1,5)[0];let record;try{record=JSON.parse(values[3]);}catch(e){error_(503,'QUEUE_LEDGER_CORRUPT');}if(values[0]!=='deploy'||values[1]!=='workbook'||record.requestId!==id||record.app!=='deploy'||record.document!=='workbook'||record.decision!==values[4])error_(503,'QUEUE_LEDGER_CORRUPT');return {row,record};}
function deployQueueWrite_(record,row){const s=deployQueueSheet_(true),text=deployQueueCanonical_(record);if(text.length>45000)error_(503,'QUEUE_LEDGER_RECORD_CAPACITY');const at=row||s.getLastRow()+1;fieldCapacity_(s,at,1);s.getRange(at,1,1,5).setValues([['deploy','workbook',record.requestId,text,record.decision]]);deployFlush_();return at;}
function deployQueueAssertNoHold_(id){const sheet=deployQueueSheet_(false);if(!sheet||sheet.getLastRow()<2)return;const rows=sheet.getRange(2,5,sheet.getLastRow()-1,1).createTextFinder('PREPARED').matchEntireCell(true).matchCase(true).findAll();for(const hit of rows){const requestId=sheet.getRange(hit.getRow(),3).getValue();if(requestId!==id)error_(503,'QUEUE_GOOGLE_SCOPE_HELD');}}
function deployQueueStepReference_(parent){const sheet=book_().getSheetByName('edge_operation_steps');if(!sheet||sheet.getLastRow()<2)return null;const rows=sheet.getRange(2,3,sheet.getLastRow()-1,1).createTextFinder(parent).matchEntireCell(true).matchCase(true).findAll();if(rows.length>1)error_(503,'QUEUE_STEP_INDEX_CORRUPT');if(!rows.length)return null;const row=rows[0].getRow(),v=fieldReadValues_(sheet,row,1,1,6)[0];if(v[0]!=='deploy'||v[1]!=='workbook'||v[3]!=='contacts')error_(503,'QUEUE_STEP_INDEX_CORRUPT');return {row,child:v[4],commit:v[5]};}
function deployQueueBindRetry_(command,idx,validateOnly=false){if(command.action!=='retryContactsSync')return;const publication=idx.published;if(!publication||publication.commit!==command.payload.publicationCommit||command.requestId===publication.publishRequestId)error_(409,'QUEUE_PUBLICATION_RETRY_CONFLICT');const parent=deployQueueFind_(publication.publishRequestId);if(!parent)return;if(parent.record.action!=='publish'||parent.record.nativeCommit!==publication.commit)error_(409,'QUEUE_PUBLICATION_RETRY_CONFLICT');if(validateOnly)return;const current=deployQueueStepReference_(publication.publishRequestId),sheet=fieldSheet_(book_(),'edge_operation_steps',['App','Document','Parent request ID','Step','Child request ID','Publication commit']),row=current?.row||sheet.getLastRow()+1;fieldCapacity_(sheet,row,1);sheet.getRange(row,1,1,6).setValues([['deploy','workbook',publication.publishRequestId,'contacts',command.requestId,publication.commit]]);deployFlush_();}
function deployQueueDecision_(record){
 const idx=index_(book_());if(record.decision==='APPLIED'&&idx.pendingFieldCommit?.commit===record.nativeCommit)return {...record,decision:'PREPARED'};
 if(record.decision==='APPLIED'&&record.action==='publish'){const ref=deployQueueStepReference_(record.requestId);if(ref){if(ref.commit!==record.nativeCommit)error_(503,'QUEUE_STEP_PUBLICATION_MISMATCH');const child=deployQueueFind_(ref.child)?.record;if(!child||child.publicationCommit!==record.nativeCommit)error_(503,'QUEUE_STEP_INDEX_CORRUPT');const step={step:'contacts',targetApp:'contacts',state:child.decision==='APPLIED'&&child.result?.contactsSync?.status==='updated'?'complete':child.decision==='APPLIED'||child.decision==='REJECTED'?'failed':'pending',requestId:child.requestId,publication:{versionId:record.beforeRevision.versionId,commit:record.nativeCommit,revision:child.result?.contactsSync?.revision||null},reason:child.decision==='PREPARED'?'CONTACTS_OUTCOME_UNCONFIRMED':null};return {...record,steps:record.steps.map(s=>s.step==='contacts'?step:s),result:{...record.result,...(child.result?.contactsSync?{contactsSync:child.result.contactsSync}:{})}};}}
 return record;
}
function deployQueueSteps_(command,result,idx){
 if(command.action!=='publish'&&command.action!=='retryContactsSync')return [];
 const publication={versionId:command.payload.versionId,commit:result.contactsSync?.publicationCommit||idx.published?.commit||null,revision:result.contactsSync?.revision||idx.published?.catalogueRevision||null};
 return [{step:'deploy',targetApp:'deploy',state:'complete',publication,requestId:command.requestId},
  {step:'contacts',targetApp:'contacts',state:result.contactsSync?.status==='updated'?'complete':result.contactsSync?.status==='failed'?'failed':'pending',publication,requestId:command.requestId,reason:result.contactsSync?.status==='failed'?'CONTACTS_SYNC_UNCONFIRMED':null},
  {step:'layout',targetApp:'layout',state:result.layoutHandoff?.status==='complete'?'complete':!result.layoutHandoff||result.layoutHandoff.status==='not-requested'?'not_required':'pending',publication,reason:!result.layoutHandoff||result.layoutHandoff.status==='not-requested'?'NO_LAYOUT_HANDOFF_IN_THIS_PATH':result.layoutHandoff.status==='needs-year'?'LAYOUT_YEAR_REQUIRED':null},
  {step:'roster',targetApp:'roster',state:'not_required',publication,reason:'NO_ROSTER_HANDOFF_IN_THIS_PUBLICATION_PATH'}];
}
function deployQueueSafeResult_(value){
 const source=JSON.parse(JSON.stringify(value)),out={saved:source.saved===true};
 for(const key of ['duplicate','versionId','requestId','revision','protocol','notes','publication','publishedRevision','venueClear'])if(source[key]!==undefined)out[key]=source[key];
 if(source.contactsSync){const c=source.contactsSync;out.contactsSync={status:c.status||'failed',publicationCommit:c.publicationCommit||null,revision:c.revision||null,code:c.code||null,...(c.status==='updated'?{}:{reason:'Contacts update is unconfirmed. Use the fenced retry for this publication.'})};}
 if(source.layoutHandoff){const x=source.layoutHandoff;out.layoutHandoff={status:x.status||'pending',commit:x.commit||null,versionId:x.versionId||null,revision:x.revision||null,...(x.status==='complete'?{}:{message:'Layout handoff is pending. Review its separate status.'})};}
 for(const key of ['delta','conflicts'])if(source[key]!==undefined&&deployQueueCanonical_({...out,[key]:source[key]}).length<=24000)out[key]=source[key];return out;
}
function deployQueueRecord_(command,hash,config){return {app:'deploy',document:'workbook',requestId:command.requestId,actorSubject:command.actor.subject,actorEmail:command.actor.email,action:command.action,publicationCommit:command.action==='retryContactsSync'?command.payload.publicationCommit:null,schemaVersion:1,bindingDigest:hash,payloadHash:hash,issuedAt:command.issuedAt,configGeneration:config.generation,attemptFence:0,decision:'PREPARED',resultKind:'pending',beforeRevision:command.expectedRevision,afterRevision:null,nativeCommit:null,result:null,steps:[],code:null,preparedAt:Date.now(),updatedAt:Date.now(),reference:'deploy/workbook/'+command.requestId};}
function deployQueueAttest_(record){const safe={...record};delete safe.actorEmail;delete safe.bindingDigest;safe.primaryDigest=deployQueueDigest_(GSiSEdgeCommandQueue.primaryDecision(safe));safe.digest=deployQueueDigest_(safe);return safe;}
function deployQueueAttachJournal_(tx){
 if(!deployQueueContext_)return;
 const x=deployQueueContext_,record={...x.record,decision:'APPLIED',resultKind:'applied',appliedAt:Date.now(),nativeCommit:tx.commit,afterRevision:deployQueueRevision_(tx.index,x.command.payload.versionId),updatedAt:Date.now()};
 record.result={saved:true,versionId:x.command.payload.versionId,requestId:x.command.requestId,revision:x.command.action==='saveVersionNote'?record.afterRevision.versionRevision:tx.index.revision,protocol:500};
 record.steps=deployQueueSteps_(x.command,record.result,tx.index);
 const text=deployQueueCanonical_(record);if(text.length>45000)error_(503,'QUEUE_LEDGER_RECORD_CAPACITY');
 tx.blocks.push({sheet:'edge_operation_receipts',headers:['App','Document','Request ID','Decision JSON','State'],writes:[{row:x.row,col:1,values:[['deploy','workbook',record.requestId,text,record.decision]]}]});tx.edgeCommand={requestId:record.requestId,payloadHash:record.payloadHash,ledgerRow:x.row};x.journalStarted=true;for(let i=0;i<8;i++){const parts=Math.ceil(JSON.stringify(tx).length/30000),entries=[...tx.index.versions,...(tx.index.published?[tx.index.published]:[])].filter(en=>en.commit===tx.commit&&en.lastDelta);if(entries.every(en=>en.lastDelta.parts===parts))break;for(const en of entries)en.lastDelta.parts=parts;}
}
function deployQueueIdentity_(who,c){if(!who||typeof who.subject!=='string'||!who.subject||! /^[^@\s]+@gsps\.edu\.sg$/.test(who.email||''))error_(401,'QUEUE_IDENTITY');auth_(c,'either');}
function deployQueueExecute_(command,c,configGeneration,fence=0,delivery='direct'){
 gsisRequireBackendRole_('deploy');GSiSEdgeCommandQueue.command(command);deployQueueIdentity_(command.actor,c);GSiSEdgeCommandQueue.deployPermission(command,{admin:c.user.roles.includes('Admin'),kp:c.user.roles.includes('KP'),palEditor:c.user.palEditor===true});
 const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'QUEUE_GOOGLE_BUSY');
 try{
  const config=deployQueueConfig_(),hash=deployQueueDigest_(GSiSEdgeCommandQueue.binding(command)),found=deployQueueFind_(command.requestId);
  if(found){if(found.record.payloadHash!==hash||found.record.actorSubject!==command.actor.subject)error_(409,'QUEUE_ID_MISMATCH');return deployQueueAttest_(deployQueueDecision_(found.record));}
  if(Date.now()-command.issuedAt>86400000||command.issuedAt>Date.now()+60000)error_(409,'QUEUE_ISSUANCE');
  if(configGeneration!==config.generation)error_(409,'QUEUE_CONFIG_GENERATION');
  if(delivery==='queued'){const previous=Number(props_().getProperty('DEPLOY_QUEUE_SCOPE_FENCE')||0);if(!Number.isSafeInteger(fence)||fence<=previous)error_(409,'QUEUE_STALE_FENCE');props_().setProperty('DEPLOY_QUEUE_SCOPE_FENCE',String(fence));}
  deployQueueAssertNoHold_(command.requestId);
  // Explicit execution can recover the native journal; status never calls this writer.
  const b=book_();let idx=fieldRecover_(b),record={...deployQueueRecord_(command,hash,config),attemptFence:fence};
  if((deployQueueSheet_(false)?.getLastRow()||1)>100000)error_(503,'QUEUE_GOOGLE_LEDGER_CAPACITY');
  if(deployQueueCanonical_(deployQueueRevision_(idx,command.payload.versionId))!==deployQueueCanonical_(command.expectedRevision)){
   record={...record,decision:'REJECTED',resultKind:'conflict',code:'QUEUE_REVISION_CONFLICT',afterRevision:deployQueueRevision_(idx,command.payload.versionId),updatedAt:Date.now()};deployQueueWrite_(record);return deployQueueAttest_(record);
  }
  if(['publish','retryContactsSync'].includes(command.action))auth_(c,'Admin');
  deployQueueBindRetry_(command,idx,true);const row=deployQueueWrite_(record);deployQueueBindRetry_(command,idx);deployQueueContext_={record,command,row,journalStarted:false,externalStarted:false};deployQueueOwnsLock_=true;
  try{
   const result=dispatch_({action:'change',identity:command.actor,input:command.payload},c);idx=index_(b);
   const committed=deployQueueFind_(command.requestId)?.record;
   if(command.action!=='retryContactsSync'&&committed?.decision!=='APPLIED')error_(503,'QUEUE_PRIMARY_DECISION_PENDING');
   record={...record,decision:'APPLIED',resultKind:'applied',appliedAt:committed?.appliedAt||Date.now(),nativeCommit:committed?.nativeCommit||idx.published?.commit||null,afterRevision:deployQueueRevision_(idx,command.payload.versionId),result:deployQueueSafeResult_(result),steps:deployQueueSteps_(command,result,idx),updatedAt:Date.now()};
   // The journal already proves the primary write. This enriches its separate step report.
   if(deployQueueCanonical_(record).length<=45000)deployQueueWrite_(record,row);
   return deployQueueAttest_(deployQueueFind_(command.requestId).record);
  }catch(e){
   const current=deployQueueFind_(command.requestId)?.record;
   if(current?.decision==='APPLIED')return deployQueueAttest_(deployQueueDecision_(current));
   // A transport/provider error or a prepared journal is never non-application evidence.
   if(!deployQueueContext_.journalStarted&&!deployQueueContext_.externalStarted&&command.action!=='retryContactsSync'&&[400,403,404,409,423].includes(e.status)){
    record={...record,decision:'REJECTED',resultKind:e.status===409?'conflict':'rejected',code:e.status===409?'QUEUE_DOMAIN_CONFLICT':'QUEUE_DOMAIN_REJECTED',updatedAt:Date.now()};deployQueueWrite_(record,row);return deployQueueAttest_(record);
   }
   return deployQueueAttest_(current||record);
  }finally{deployQueueContext_=null;deployQueueOwnsLock_=false;}
 }finally{deployUnlock_(lock);}
}
function deployQueueStatus_(id,who,c){const found=deployQueueFind_(id);if(!found)return {app:'deploy',document:'workbook',requestId:id,decision:'UNKNOWN'};if(found.record.actorSubject!==who.subject&&!c.user.roles.includes('Admin'))error_(404,'QUEUE_RECEIPT_NOT_FOUND');if(found.record.actorSubject!==who.subject)console.log(JSON.stringify({app:'deploy',requestId:id,event:'QUEUE_ADMIN_RECEIPT_READ'}));return deployQueueAttest_(deployQueueDecision_(found.record));}
function deployQueueLegacyDirect_(req,c){
 const p=req.input,config=deployQueueConfig_();if(config.mode!=='direct')error_(409,'Reload Deploy before submitting a queued command.');
 const prior=deployQueueFind_(p.requestId),observed=prior?.record.beforeRevision||deployQueueRevision_(index_(book_()),p.versionId),expected={...observed};
 if(!prior&&p.expectedRevision!==undefined&&p.expectedRevision!==observed.versionRevision)expected.versionRevision=p.expectedRevision;
 const command={app:'deploy',document:'workbook',requestId:p.requestId,issuedAt:prior?.record.issuedAt||p.issuedAt||req.timestamp,actor:{email:req.identity.email,subject:req.identity.subject},action:p.operation,schemaVersion:1,expectedRevision:expected,payload:JSON.parse(JSON.stringify(p))};
 const d=deployQueueExecute_(command,c,config.generation);
 if(d.decision==='REJECTED'||d.decision==='CANCELLED')error_(409,'This command was rejected. Review the saved version and retained proposal before making a new decision.');
 if(d.decision!=='APPLIED')error_(503,'This command outcome needs review. Keep its original request ID; do not repeat it as a new save.');
 return {...d.result,saved:true,queueDecision:{requestId:d.requestId,reference:d.reference,digest:d.primaryDigest}};
}
function deployQueueEndpoint_(envelope){
 gsisRequireBackendRole_('deploy');const secret=gsisApiSecret_();
 if(typeof envelope.payload!=='string'||!same_(signature_(envelope.payload,secret),envelope.signature))error_(401,'QUEUE_SIGNATURE');
 const req=GSiSEdgeCommandQueue.parse(envelope.payload);if(req.purpose!=='edge-command-google-v1'||req.app!=='deploy'||req.document!=='workbook'||!Number.isFinite(req.timestamp)||Math.abs(Date.now()-req.timestamp)>60000||!GSiSEdgeCommandQueue.uuid(req.nonce))error_(401,'QUEUE_ENVELOPE');
 const who=req.actor;if(!who||! /^[^@\s]+@gsps\.edu\.sg$/.test(who.email||'')||!who.subject)error_(401,'QUEUE_IDENTITY');
 const c=contacts_(who,false,'deploySnapshot',{authorityOnly:!['execute','projection'].includes(req.kind),palAuthority:req.kind==='observe'});deployQueueIdentity_(who,c);const config=deployQueueConfig_();
 if(req.kind==='observe'){
  const idx=index_(book_());if(idx.pendingFieldCommit)error_(503,'QUEUE_NATIVE_PENDING');
  const authRevision=deployQueueDigest_({subject:who.subject,email:who.email,roles:c.user.roles.slice().sort(),palEditor:c.user.palEditor===true});
  return deployQueueSigned_('edge-command-google-role-v1',{app:'deploy',document:'workbook',actorSubject:who.subject,actorEmail:who.email,authRevision,admin:c.user.roles.includes('Admin'),kp:c.user.roles.includes('KP'),palEditor:c.user.palEditor===true,actions:GSiSEdgeCommandQueue.ACTIONS.filter(a=>!['publish','retryContactsSync'].includes(a)||c.user.roles.includes('Admin')),config,revision:deployQueueRevision_(idx,req.versionId||''),expiresAt:Date.now()+60000});
 }
 if(req.kind==='execute'){if(req.delivery==='queued'&&(config.mode!=='queued'||config.dispatchPaused))error_(409,'QUEUE_MODE_DIRECT');if(!['direct','queued'].includes(req.delivery))error_(400,'QUEUE_DELIVERY');if(req.command?.actor?.subject!==who.subject||req.command?.actor?.email!==who.email)error_(403,'QUEUE_ACTOR_MISMATCH');return deployQueueSigned_('edge-command-google-result-v1',deployQueueExecute_(req.command,c,req.configGeneration,req.fence||0,req.delivery));}
 if(req.kind==='statusBatch'){auth_(c,'Admin');if(!Array.isArray(req.requestIds)||req.requestIds.length>10||new Set(req.requestIds).size!==req.requestIds.length||req.requestIds.some(id=>!GSiSEdgeCommandQueue.uuid(id)))error_(400,'QUEUE_STATUS_BATCH');return deployQueueSigned_('edge-command-google-status-batch-v1',{app:'deploy',document:'workbook',generation:config.generation,decisions:req.requestIds.map(id=>deployQueueStatus_(id,who,c))});}
 if(req.kind==='status')return deployQueueSigned_('edge-command-google-result-v1',deployQueueStatus_(req.requestId,who,c));
 if(req.kind==='recover'){auth_(c,'Admin');recoverFieldCommit();return deployQueueSigned_('edge-command-google-result-v1',deployQueueStatus_(req.requestId,who,c));}
 if(req.kind==='cancel'){
  auth_(c,'Admin');GSiSEdgeCommandQueue.command(req.command);const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'QUEUE_GOOGLE_BUSY');try{const found=deployQueueFind_(req.command.requestId);if(found)return deployQueueSigned_('edge-command-google-result-v1',deployQueueStatus_(req.command.requestId,who,c));const hash=deployQueueDigest_(GSiSEdgeCommandQueue.binding(req.command)),record={...deployQueueRecord_(req.command,hash,config),decision:'CANCELLED',resultKind:'rejected',code:'QUEUE_ADMIN_CANCELLED'};deployQueueWrite_(record);return deployQueueSigned_('edge-command-google-result-v1',deployQueueAttest_(record));}finally{deployUnlock_(lock);}
 }
 if(req.kind==='configure'){
  auth_(c,'Admin');const p=req.configuration;if(!p||p.mode!=='direct'||p.generation!==config.generation||typeof p.admissionPaused!=='boolean'||typeof p.dispatchPaused!=='boolean'||Object.keys(p).some(k=>!['mode','generation','admissionPaused','dispatchPaused','requireResolved'].includes(k)))error_(409,'QUEUE_RECOVERY_PAGE_REQUIRED');
  const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'QUEUE_GOOGLE_BUSY');try{if(deployQueueConfig_().generation!==p.generation)error_(409,'QUEUE_CONFIG_GENERATION');if(p.requireResolved===true||!p.admissionPaused||!p.dispatchPaused){deployQueueAssertNoHold_(null);if(index_(book_()).pendingFieldCommit)error_(503,'QUEUE_NATIVE_PENDING');}const next={...config,...p,generation:config.generation+1,recoveryPageReady:false};props_().setProperty('DEPLOY_EDGE_QUEUE_CONFIG',deployQueueCanonical_(next));return deployQueueSigned_('edge-command-google-config-v1',next);}finally{deployUnlock_(lock);}
 }
 if(req.kind==='reconcileSummary'){auth_(c,'Admin');const sheet=deployQueueSheet_(false),holds=sheet&&sheet.getLastRow()>1?sheet.getRange(2,5,sheet.getLastRow()-1,1).createTextFinder('PREPARED').matchEntireCell(true).matchCase(true).findAll().length:0;return deployQueueSigned_('edge-command-google-reconciliation-v1',{app:'deploy',document:'workbook',generation:config.generation,allResolved:holds===0&&!index_(book_()).pendingFieldCommit,holds});}

 if(req.kind==='archive'){
  auth_(c,'Admin');const data=req.archive;if(!data||data.app!=='deploy'||!Array.isArray(data.jobs)||data.jobs.length!==1||!Number.isSafeInteger(data.jobs[0].version)||!GSiSEdgeCommandQueue.uuid(data.jobs[0].request_id))error_(400,'QUEUE_ARCHIVE_SCHEMA');
  const folderId=props_().getProperty('DEPLOY_QUEUE_ARCHIVE_FOLDER_ID');if(!folderId)error_(503,'QUEUE_ARCHIVE_NOT_CONFIGURED');const folder=DriveApp.getFolderById(folderId);if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE)error_(503,'QUEUE_ARCHIVE_NOT_PRIVATE');
  const text=deployQueueCanonical_(data),exportDigest=deployQueueDigest_(data),file=folder.createFile(Utilities.newBlob(text,'application/json','deploy-command-'+data.jobs[0].request_id+'-v'+data.jobs[0].version+'.json'));
  if(deployQueueDigest_(JSON.parse(file.getBlob().getDataAsString('UTF-8')))!==exportDigest)error_(503,'QUEUE_ARCHIVE_UNVERIFIED');
  const createdAt=Date.now(),retainedUntil=createdAt+365*86400000;file.setDescription('Private command evidence. Retain until at least '+new Date(retainedUntil).toISOString()+'. Do not delete unresolved evidence.');
  return deployQueueSigned_('edge-command-google-archive-v1',{app:'deploy',document:'workbook',fileId:file.getId(),exportDigest,createdAt,retainedUntil,records:data.jobs.map(row=>({requestId:row.request_id,version:row.version,digest:deployQueueDigest_(row)}))});
 }
 if(req.kind==='projection'){
  const idx=index_(book_());if(idx.pendingFieldCommit)error_(503,'QUEUE_NATIVE_PENDING');const before=deployQueueRevision_(idx,req.versionId||''),data=JSON.parse(JSON.stringify(snapshot_(book_(),idx,c,{versionId:req.versionId,full:true,auditPaged:true}))),afterIdx=index_(book_()),after=deployQueueRevision_(afterIdx,req.versionId||'');if(afterIdx.pendingFieldCommit||deployQueueCanonical_(before)!==deployQueueCanonical_(after))error_(503,'QUEUE_PROJECTION_CHANGED');
  const digest=deployQueueDigest_(data),manifest={app:'deploy',document:'workbook',schemaVersion:1,projection:'snapshot',audienceKey:who.subject,actor:who,authRevision:deployQueueDigest_({subject:who.subject,email:who.email,roles:c.user.roles.slice().sort(),palEditor:c.user.palEditor===true}),googleRevision:after,sourceDigest:digest,payloadDigest:digest,generation:req.refreshGeneration,observedAt:Date.now(),manualEditProof:true};return {manifest:deployQueueSigned_('edge-command-google-projection-v1',manifest),data};
 }
 error_(404,'QUEUE_OPERATION');
}
