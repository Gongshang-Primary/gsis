/* v0.9.4 Deploy Google adapters. D1 remains the only operational writer after fencing. */
function deployEdgeRosterPublication_(input){
 const {book:b,index:idx,entry}=rosterOperationsQuotaSource_();
 if(!entry?.id||!entry.commit||!Number.isSafeInteger(entry.revision))error_(503,'No verified published Deploy document is available.');
 const result=input.knownCommit===entry.commit&&input.knownRevision===entry.revision?{unchanged:true,entry}:{entry,document:document_(b,entry)};
 const after=index_(b),current=publishedEntry_(after);if(after.pendingFieldCommit||current?.id!==entry.id||current?.commit!==entry.commit||current?.revision!==entry.revision)error_(503,'Deploy publication changed during the read. Retry.');
 return result;
}
function deployEdgeFenced_(){return props_().getProperty('DEPLOY_EDGE_MODE')==='fenced';}
function deployEdgeFence_(req){
 if(!deployEdgeFenced_())return;
 if(['change','lease','acknowledgeNotices','renameCampusUnit'].includes(req?.action))error_(409,'Deploy writes have moved to the Worker. Use the v0.9.4 Deploy viewport.');
}
function deployEdgeForward_(action,input,identity){
 const p=props_(),url=p.getProperty('DEPLOY_EDGE_URL'),secret=gsisApiSecret_();
 if(!/^https:\/\/[^/]+\/api\/edge\/service$/.test(url||'')||!secret||secret.length<32)error_(503,'Configure the Deploy Worker service bridge.');
 const payload=JSON.stringify({service:'gsis-deploy-edge-v1',action,input:input||{},identity:identity||null,timestamp:Date.now(),nonce:Utilities.getUuid()}),response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify({payload,signature:signature_(payload,secret)}),muteHttpExceptions:true});let body;
 try{body=JSON.parse(response.getContentText());}catch(ignore){error_(503,'Deploy Worker returned an invalid service response.');}if(!body.ok){const codes=['VENUES_SOURCE_AUTH','VENUES_SOURCE_SETUP','VENUES_SOURCE_INPUT','VENUES_SOURCE_PENDING','VENUES_SOURCE_CHANGED','VENUES_SOURCE_INVALID','VENUES_FENCE_PENDING','SOURCE_CHANGED','SOURCE_INVALID','SOURCE_UNAVAILABLE'];throw Object.assign(Error(body.error||'Deploy Worker is unavailable.'),{status:body.status||503,...(codes.includes(body.code)?{code:body.code}:{})});}return body.data;
}
function deployEdgeAdapter_(req){
 gsisRequireBackendRole_('deploy');const p=req.input||{},allowed=['export','fence','contacts','layoutRead','layoutHandoff'];if(!allowed.includes(p.operation))error_(400,'Unknown Deploy Google adapter operation.');
 if(p.operation==='contacts'){
  if(!['deploySnapshot','deployPublishReview','approveDeployTeachers','applyDeployCatalogues','roleTruthTable','saveRoleTruthTable'].includes(p.contactAction))error_(400,'Unsupported Contacts adapter action');
  return contacts_(req.identity,false,p.contactAction,p.contactInput||{});
 }
 const c=contacts_(req.identity,false,'deploySnapshot',{authorityOnly:true});auth_(c,p.operation==='layoutRead'?'either':'Admin');
 if(p.operation==='layoutRead'){
  if(p.layoutAction==='registry')return readLandmarkRegistry_();
  if(!['landmarkUnit','landmarkSearch'].includes(p.layoutAction))error_(400,'Unknown Layout read');return landmarkRead_({action:p.layoutAction,input:p.layoutInput||{}},book_(),index_(book_()),c);
 }
 if(p.operation==='layoutHandoff')return deployEdgeLayoutHandoff_(p);
 const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'A Deploy save is finishing. Retry migration.');
 try{
  const b=book_(),idx=index_(b);if(idx.pendingFieldCommit)error_(409,'Recover the pending Deploy save before migration.');
  if(p.operation==='fence'){
   if(!Number.isInteger(p.expectedRevision)||idx.revision!==p.expectedRevision)error_(409,'Deploy changed after export. Import the current data before fencing.');
   if(!/^[a-f0-9]{64}$/.test(p.sourceDigest||'')||!Number.isInteger(p.verifiedRecords)||p.verifiedRecords<1)error_(400,'Verified import proof required.');
   const properties=props_();if(!properties.getProperty('DEPLOY_EDGE_URL')||!gsisApiSecret_())error_(503,'Configure DEPLOY_EDGE_URL and GSIS_SECRET before fencing.');
   properties.setProperty('DEPLOY_EDGE_MODE','fenced');properties.setProperty('DEPLOY_EDGE_FENCE',JSON.stringify({at:new Date().toISOString(),revision:idx.revision,sourceDigest:p.sourceDigest,actor:req.identity.email}));
   return {legacyWritesDisabled:true,sourceDigest:p.sourceDigest,verifiedRecords:p.verifiedRecords,revision:idx.revision};
  }
  const documents=[],seen=new Set();for(const entry of idx.versions)documents.push({entry,published:false,fields:GSISFields.flat(document_(b,entry))});
  for(const entry of [...(idx.venuePublications||[]),...(publishedEntry_(idx)?[publishedEntry_(idx)]:[])])if(!seen.has(entry.commit)){seen.add(entry.commit);const d=document_(b,entry);documents.push({entry:{...entry,from:d.from||'',to:d.to||''},published:true,fields:GSISFields.flat(d)});}
  const receipts={},sheet=b.getSheetByName('deploy_save_receipts');if(sheet&&sheet.getLastRow()>1){const rows=sheet.getRange(2,1,sheet.getLastRow()-1,5).getValues();for(let i=0;i<rows.length;){const row=rows[i],parts=Number(row[3]);if(!row[0]||!Number.isInteger(parts)||parts<1||i+parts>rows.length)error_(503,'Deploy receipt export is incomplete.');receipts[row[1]+'|'+row[0]]=JSON.parse(rows.slice(i,i+parts).map(r=>r[4]).join(''));i+=parts;}}
  for(const item of documents)if(!item.published){const d=GSISFields.inflate(item.fields);for(const receipt of d.saveReceipts||[])if(!receipts[d.id+'|'+receipt.id])receipts[d.id+'|'+receipt.id]=receipt;}
  const properties=Object.fromEntries(Object.entries(props_().getProperties()).filter(([key])=>/^NOTICE_ACK_/.test(key)));
  const exported=JSON.parse(JSON.stringify(idx));exported.published=publishedEntry_(idx)||null;exported.venuePublications=documents.filter(x=>x.published).map(x=>x.entry);if(exported.published){const matching=documents.find(x=>x.published&&x.entry.commit===exported.published.commit);if(matching)exported.published=matching.entry;}
  return {schema:'gsis-deploy-edge-v1',capturedAt:new Date().toISOString(),index:exported,documents,receipts,properties};
 }finally{deployUnlock_(lock);}
}
function deployEdgeLayoutHandoff_(p){
 if(!deployEdgeFenced_())error_(409,'Activate the Deploy Worker before its Layout handoffs.');
 const d=p.document,en=p.entry;if(!d||d.id!==en?.id||!en.edgePublished||!en.commit||p.requestId!=='layoutPublication:'+en.commit)error_(400,'Invalid immutable publication handoff.');
 if(!Number.isInteger(p.publicationRevision)||p.publicationRevision<0)error_(400,'A durable publication revision is required.');
 const year=GSISLayoutData.year(d),lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Layout handoff is busy.');
 try{
  const properties=props_(),revisionKey='DEPLOY_EDGE_LAYOUT_REVISION_'+year,prior=JSON.parse(properties.getProperty(revisionKey)||'null');if(prior&&(prior.revision>p.publicationRevision||prior.revision===p.publicationRevision&&prior.commit!==en.commit))error_(409,'A newer Layout publication has already been applied.');
  const repository=SpreadsheetApp.openById(layoutRepositoryId_(year,true)),pointer=layoutHead_(repository,year,true);
  if(pointer.head?.publication?.commit===en.commit&&pointer.handoff?.status==='complete'){properties.setProperty(revisionKey,JSON.stringify({revision:p.publicationRevision,commit:en.commit}));return pointer.handoff;}
  if(year===2026&&!pointer.head)error_(503,'Prepare the 2026 Layout seed before transferring a publication.');
  const old=pointer.head?layoutRead_(repository,year).snapshot:GSISLayoutData.empty(year),next=GSISLayoutData.publication(old,d,en,(kind,key)=>'layout-'+hash_([year,kind,key]).slice(0,32));layoutStore_(repository,next);
  const done={status:'complete',year,versionId:en.id,commit:en.commit,revision:en.revision,layoutRevision:next.revision};pointer.sheet.getRange(pointer.row,3).setValue(JSON.stringify(done));deployFlush_();properties.setProperty(revisionKey,JSON.stringify({revision:p.publicationRevision,commit:en.commit}));return done;
 }finally{deployUnlock_(lock);}
}
