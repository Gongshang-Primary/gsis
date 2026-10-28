/* Peer proposals are durable domain intent. Email has its own per-address receipt
 * in the notification file: WhatsApp outcomes cannot consume it. A prepared email
 * with no confirmed MailApp result is NEVER automatically resent. Execute as owner.
 */
function rosterPeerMailAddresses_(person){
 if(!person||person.active!==true)return [];
 return [...new Set([person.email,person.cesEmail,...(Array.isArray(person.emails)?person.emails:[])].map(v=>String(v||'').trim().toLowerCase()).filter(v=>/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(gsps\.edu\.sg|schools\.gov\.sg)$/.test(v)))];
}
function rosterPeerMailPending_(request,now){return !!request&&request.status==='pending'&&Number(request.expiresAt)>now&&request.date>=new Date(now+8*3600000).toISOString().slice(0,10);}
function rosterPeerMailFingerprint_(request){return JSON.stringify([request.id,request.recipientId,request.absenceId,request.date,request.absentName,request.combination===true,request.demandIds,request.periods,request.lessons]);}
function rosterPeerMailAlert_(store,row,primary,now){
 const key='delivery:peer-mail:'+row.id,open=row.status==='blocked'||row.status==='uncertain'&&!rosterPeerMailReviewed_(row);let alert=store.smcAlerts.find(a=>a.key===key);
 if(!open){if(alert&&alert.status==='open'&&(['sent','cancelled'].includes(row.status)||rosterPeerMailReviewed_(row))){alert.status='resolved';alert.resolvedAt=new Date(now).toISOString();}return;}
 if(!alert){alert={id:Utilities.getUuid(),key,date:row.date,createdAt:new Date(now).toISOString(),recipients:(primary.smcDutyRoster||[]).find(d=>d.date===row.date)?.staffIds||[],origin:'peer-email'};store.smcAlerts.push(alert);}
 alert.status='open';alert.summary=row.status==='uncertain'?'Email delivery for the peer arrangement proposed to '+row.recipientName+' is unconfirmed. Check with the colleague before sending again. The absence remains recorded.':'The peer arrangement email to '+row.recipientName+' is waiting: '+row.error+' The absence remains recorded.';
}
function rosterPeerMailSync_(store,primary,people,now){
 store.peerMail=store.peerMail||[];const requests=new Map((primary.requests||[]).map(r=>[r.id,r])),persons=new Map(people.map(p=>[String(p.id),p]));
 for(const row of store.peerMail){
  if(row.status==='sending'&&row.claimExpiresAt<=now){row.status='uncertain';row.error='The prepared email has no confirmed provider outcome. Check with the recipient before sending again.';row.completedAt=new Date(now).toISOString();}
  const request=requests.get(row.requestId),addresses=rosterPeerMailAddresses_(persons.get(String(request?.recipientId)));
  if(['queued','blocked'].includes(row.status)&&(!rosterPeerMailPending_(request,now)||row.email&&!addresses.includes(row.email)||row.fingerprint!==rosterPeerMailFingerprint_(request))){row.status='cancelled';row.error='The proposal or its authorised recipient changed before sending.';row.completedAt=new Date(now).toISOString();}
 }
 const existing=new Map(store.peerMail.map(row=>[row.id,row]));
 for(const request of requests.values()){
  if(!rosterPeerMailPending_(request,now))continue;
  const person=persons.get(String(request.recipientId)),addresses=rosterPeerMailAddresses_(person),fingerprint=rosterPeerMailFingerprint_(request);
  for(const email of addresses.length?addresses:['']){
   const id=String(request.id)+':'+email;let row=existing.get(id);
   if(!row){row={id,requestId:request.id,recipientId:request.recipientId,recipientName:person?.name||request.recipientName||'the proposed colleague',date:request.date,email,fingerprint,createdAt:new Date(now).toISOString(),status:'queued',attempts:0};store.peerMail.push(row);existing.set(id,row);}
   // Contacts can be temporarily inactive or missing while its directory is
   // edited. Restore only a provably unsent, unchanged proposal when the same
   // address becomes authorised again. Prepared/uncertain/accepted rows stay put.
   if(email&&row.status==='blocked'||row.status==='cancelled'&&!row.preparedAt&&!row.acceptedAt&&row.fingerprint===fingerprint){row.status='queued';row.error='';delete row.completedAt;}
   if(!email&&['queued','blocked'].includes(row.status)){row.status='blocked';row.error='No active CES or GSPS email address is available in Contacts.';}
  }
  const missing=existing.get(String(request.id)+':');if(addresses.length&&missing?.status==='blocked'){missing.status='cancelled';missing.error='A current Contacts email address is now available.';}
 }
 for(const row of store.peerMail)rosterPeerMailAlert_(store,row,primary,now);
}
function rosterPeerMailMessage_(request,origin,email){
 const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const link=origin+'/?date='+encodeURIComponent(request.date)+'&peerRequest='+encodeURIComponent(request.id)+'#myReliefDuties',kind=request.combination?'combine classes':'provide relief';
 const lessons=(request.lessons||[]).map(l=>'P'+l.period+' '+[l.timeStart,l.timeEnd].filter(Boolean).join('–')+' · '+[l.className,l.subject,l.groupName,l.venue].filter(Boolean).join(' · '));
 const lines=[request.absentName+' has proposed that you '+kind+' on '+request.date+'.','This is a proposal, awaiting your explicit approval. It is not a confirmed duty.',...lessons,'Please approve or reject in GSiS → My Relief Duties. Sign in with your school account.',link,'If SMC has changed this arrangement, GSiS will show its current status.'];
 return {to:email,subject:'GSiS: peer relief request for '+request.date,body:lines.join('\n\n'),htmlBody:lines.map(line=>line===link?'<p><a href="'+escape(link)+'">Review and respond in GSiS</a></p>':'<p>'+escape(line)+'</p>').join(''),name:'GSiS Roster'};
}
function rosterPeerMailSettle_(job,status,error,primary){
 const lock=rosterNotificationLock_();if(!deployLock_(lock,1500))error_(503,'Peer email result is waiting to be recorded. Do not resend it manually.');
 try{const store=rosterNotificationState_(),row=(store.peerMail||[]).find(r=>r.id===job.id);if(!row||row.claimId!==job.claimId)return;
  // A late successful result may resolve an expired lease; a late error cannot
  // regress confirmed acceptance. MailApp acceptance is not delivery/read proof.
  if(row.status==='sent')return;if(!['sending','uncertain'].includes(row.status))return;
  row.status=status;row.error=error||'';row.completedAt=new Date().toISOString();if(status==='sent')row.acceptedAt=row.completedAt;
  if(status==='queued'){delete row.preparedAt;delete row.claimId;delete row.claimExpiresAt;}
  rosterPeerMailAlert_(store,row,primary,Date.now());rosterNotificationCommit_(store);
 }finally{deployUnlock_(lock);}
}
function rosterPeerMailDispatch_(input){
 gsisRequireBackendRole_('roster');const initial=rosterNotificationEnsure_(),origin=String(props_().getProperty('ROSTER_PUBLIC_ORIGIN')||input.publicOrigin||'').replace(/\/$/,''),limit=Math.min(10,Math.max(1,Math.floor(Number(input.limit)||6)));
 let primary=rosterOperationsState_(true);const people=(primary.requests||[]).some(r=>rosterPeerMailPending_(r,Date.now()))?rosterServiceContacts_().c.rosterPeople:[];let quota=0,reason='';
 if(!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/i.test(origin))reason='Configure ROSTER_PUBLIC_ORIGIN with the HTTPS Roster site origin.';
 else try{quota=Number(MailApp.getRemainingDailyQuota());if(!Number.isFinite(quota)||quota<1)reason='The email recipient quota is exhausted; the next worker run will retry.';}catch(e){reason='Authorise the Roster email service before sending.';}
 let sent=0,lastStore=initial;
 for(let count=0;count<limit;count++){
  // Domain reads happen outside UserLock: absence intake/allocator code may
  // acquire ScriptLock. Never invert the established ScriptLock -> UserLock order.
  if(count)primary=rosterOperationsState_(true);const lock=rosterNotificationLock_(lastStore);if(!deployLock_(lock,1500))return {sent,busy:true,pending:1,reason:'peer-mail-busy'};
  let job;
  try{const store=rosterNotificationState_(),before=JSON.stringify(store),now=Date.now();rosterPeerMailSync_(store,primary,people,now);
   const row=store.peerMail.find(r=>r.status==='queued');
   if(row&&(!quota||reason)){for(const queued of store.peerMail.filter(r=>r.status==='queued')){queued.status='blocked';queued.error=reason||'The email recipient quota is exhausted; the next worker run will retry.';rosterPeerMailAlert_(store,queued,primary,now);}}
   else if(row){row.status='sending';row.preparedAt=now;row.claimId=Utilities.getUuid();row.claimExpiresAt=now+600000;row.attempts++;row.error='';job=rosterNotificationCopy_(row);}
   if(JSON.stringify(store)!==before)rosterNotificationCommit_(store);lastStore=store;
  }finally{deployUnlock_(lock);}
  if(!job)break;
  let current;
  try{current=rosterOperationsState_(true);}catch(e){rosterPeerMailSettle_(job,'queued','Roster could not be rechecked. No email was sent.',primary);break;}
  const request=(current.requests||[]).find(r=>r.id===job.requestId),person=people.find(p=>String(p.id)===String(request?.recipientId));
  // Recheck immediately before provider submission. An approved, superseded or
  // cancelled proposal must not send a stale invitation after being claimed.
  if(!rosterPeerMailPending_(request,Date.now())||job.fingerprint!==rosterPeerMailFingerprint_(request)||!rosterPeerMailAddresses_(person).includes(job.email)){rosterPeerMailSettle_(job,'cancelled','The proposal changed before email submission.',current);continue;}
  let accepted=false;try{MailApp.sendEmail(rosterPeerMailMessage_(request,origin,job.email));accepted=true;sent++;}catch(e){/* MailApp provides no idempotency key or delivery receipt; preserve ambiguity. */}
  quota--;rosterPeerMailSettle_(job,accepted?'sent':'uncertain',accepted?'':'MailApp did not confirm acceptance. Check with the recipient before sending again.',current);
 }
 const store=rosterNotificationState_(),rows=store.peerMail||[];return {sent,...rosterPeerMailCounts_(rows),cancelled:rows.filter(r=>r.status==='cancelled').length,...(reason?{reason}:{})};
}

/* Review records an administrator's acknowledgement, never a delivery outcome.
 * The exact provider evidence remains intact and MailApp is never called here.
 * These operations receive freshly verified Contacts authority from the bridge.
 */
function rosterPeerMailReviewToken_(row){
 return rosterOperationsDigest_([1,row.id,row.requestId,row.recipientId,row.recipientName,row.date,row.email,row.fingerprint,row.status,row.claimId||'',row.claimExpiresAt||0,row.preparedAt||0,row.acceptedAt||'',row.completedAt||'',row.attempts||0,row.error||'']);
}
function rosterPeerMailReviewId_(row){return rosterOperationsDigest_(['peer-mail-review-id',row.id]);}
function rosterPeerMailReviewed_(row){return row.status==='uncertain'&&row.reviewReceipt?.schema===1&&row.reviewReceipt.fingerprint===rosterPeerMailReviewToken_(row);}
function rosterPeerMailCounts_(rows){return {uncertain:rows.filter(row=>row.status==='uncertain'&&!rosterPeerMailReviewed_(row)).length,reviewedUncertain:rows.filter(rosterPeerMailReviewed_).length,blocked:rows.filter(row=>row.status==='blocked').length,pending:rows.filter(row=>['queued','blocked','sending'].includes(row.status)).length};}
function rosterPeerMailReviewView_(state){
 if(!state)return {available:false,configured:false,checkedAt:new Date().toISOString(),issues:[],messagesSent:0};
 const rows=state?.peerMail||[],issues=rows.filter(row=>row.status==='uncertain'&&!rosterPeerMailReviewed_(row));
 return {available:true,checkedAt:new Date().toISOString(),issues:issues.slice(0,100).map(row=>({id:rosterPeerMailReviewId_(row),token:rosterPeerMailReviewToken_(row),recipientName:String(row.recipientName||'Colleague').slice(0,120),date:/^\d{4}-\d{2}-\d{2}$/.test(row.date)?row.date:'',status:'uncertain',preparedAt:row.preparedAt||null,completedAt:row.completedAt||null})),capped:issues.length>100,counts:rosterPeerMailCounts_(rows),messagesSent:0};
}
function rosterPeerMailReviewConflict_(message){throw Object.assign(new Error(message),{status:409,code:'PEER_MAIL_REVIEW_CONFLICT',failureStage:'peer-mail-review',operation:'reviewPeerMail'});}
function rosterPeerMailReviewDispatch_(req,c){
 gsisRequireBackendRole_('roster');const p=req.input||{},user=rosterOperationsAuthority_(c,req.identity),actor=String(req.identity?.email||'').trim().toLowerCase();
 if(!user.admin||! /^[^@\s]+@gsps\.edu\.sg$/.test(actor))error_(403,'Current school Admin access is required.');
 if(!['peerMailReview','reviewPeerMail'].includes(p.operation))error_(400,'Unknown peer email review action.');
 const write=p.operation==='reviewPeerMail';let digest;
 if(write){
  if(typeof p.requestId!=='string'||! /^[\w-]{36}$/.test(p.requestId)||typeof p.id!=='string'||!p.id||p.id.length>600||typeof p.expectedToken!=='string'||! /^[a-f0-9]{64}$/.test(p.expectedToken))error_(400,'A request ID and current review preview are required.');
  digest=rosterOperationsDigest_([p.operation,p.id,p.expectedToken]);
 }
 // Do not initialize or synchronize another domain while holding UserLock.
 // Read and mutation both serialize against claims, settlement and other reviews.
 const lock=rosterNotificationLock_();if(!deployLock_(lock,1500))error_(503,'Peer email records are updating. Retry this action.');
 try{
  const state=rosterNotificationState_();rosterNotificationCheckOwner_(state);
  if(!write)return rosterPeerMailReviewView_(state);
  if(!state)throw Object.assign(new Error('Peer email storage is unavailable. Retry this same review after storage is restored.'),{status:503,code:'UNAVAILABLE',failureStage:'peer-mail-review',operation:'reviewPeerMail'});
  const prior=(state.peerMailReviewActions||[]).find(row=>row.id===p.requestId);
  if(prior){if(prior.actor!==actor||prior.digest!==digest)rosterPeerMailReviewConflict_('This request ID was used for another action.');return {...rosterPeerMailReviewView_(state),...prior.result,replayed:true};}
  const row=(state.peerMail||[]).find(row=>rosterPeerMailReviewId_(row)===p.id);
  if(!row||row.status!=='uncertain'||rosterPeerMailReviewed_(row)||rosterPeerMailReviewToken_(row)!==p.expectedToken)rosterPeerMailReviewConflict_('Peer email evidence changed. Refresh and review its current state.');
  const iso=new Date().toISOString();row.reviewReceipt={schema:1,fingerprint:p.expectedToken,reviewedAt:iso,reviewedBy:actor,requestId:p.requestId,reason:'Checked with recipient; reviewed without confirming delivery or resending'};
  for(const alert of state.smcAlerts||[])if(alert.key==='delivery:peer-mail:'+row.id&&alert.status==='open'){alert.status='resolved';alert.resolvedAt=iso;alert.reviewedAt=iso;}
  const result={reviewed:true,requestId:p.requestId,messagesSent:0};
  // Retain receipts alongside provider evidence; no short rolling retention that
  // could turn a delayed retry into a second action or hide a lost acknowledgement.
  state.peerMailReviewActions=state.peerMailReviewActions||[];state.peerMailReviewActions.push({id:p.requestId,actor,digest,at:iso,rowId:row.id,result});
  rosterNotificationCommit_(state);return {...rosterPeerMailReviewView_(state),...result};
 }catch(error){if(!error.failurePhase)error.failurePhase='roster.peer-mail-review';throw error;}finally{deployUnlock_(lock);}
}
