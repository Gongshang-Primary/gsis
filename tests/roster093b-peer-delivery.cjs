'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(){
 let now=Date.parse('2026-10-26T00:00:00Z'),id=0,locks=[],sent=[],reads=0,writes=0,onRead=null,onSend=null,sendError=false,quota=100,settleFail=false;
 const date='2026-10-26',request={id:'peer-1',staffId:'alice',absentName:'Alice <A>',absenceId:'absence-1',date,periods:[2,3],demandIds:['d2','d3'],lessons:[{period:2,timeStart:'08:00',timeEnd:'08:30',className:'1A',subject:'Math',venue:'Room 1'},{period:3,timeStart:'08:30',timeEnd:'09:00',className:'1A',subject:'Math'}],recipientId:'bob',recipientName:'Bob',status:'pending',createdAt:new Date(now).toISOString(),expiresAt:now+86400000,combination:false};
 let primary={requests:[request],outbox:[],smcDutyRoster:[{date,staffIds:['smc']}]},people=[{id:'bob',name:'Bob',active:true,email:'bob@gsps.edu.sg',emails:['bob@gsps.edu.sg','BOB@schools.gov.sg','bob@moe.edu.sg','bob@example.test','bob@gsps.edu.sg']}];
 let stored=JSON.stringify({schema:1,owner:{email:'owner@gsps.edu.sg',scriptId:'roster'},revision:1,migrationComplete:true,outbox:[],deliveryEvents:[],smcAlerts:[],deliveryReview:{revision:0,issues:[],monitor:[],jobs:[]}});
 const scope={Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},console,Set,Map,gsisRequireBackendRole_:()=>{},Session:{getEffectiveUser:()=>({getEmail:()=> 'owner@gsps.edu.sg'})},ScriptApp:{getScriptId:()=> 'roster'},props_:()=>({getProperty:key=>key==='ROSTER_NOTIFICATION_TRANSPORT_FILE'?'transport':null,setProperty:()=>{}}),rosterFindFile_:()=>null,rosterReadFile_:()=>stored,
  rosterOperationsState_:()=>{assert.deepEqual(locks,[],'Never read the allocation document while holding the notification lock');if(onRead)onRead(++reads,primary);return structuredClone(primary);},rosterOperationsCommit_:()=>assert.fail('Mail transport must never write allocations'),rosterServiceContacts_:()=>({c:{rosterPeople:structuredClone(people)}}),
  LockService:{getUserLock:()=>({kind:'user'}),getScriptLock:()=>assert.fail('Existing transport never acquires allocator ScriptLock')},deployLock_:lock=>{assert.deepEqual(locks,[]);locks.push(lock.kind);return true;},deployUnlock_:lock=>assert.equal(locks.pop(),lock.kind),
  rosterDriveRequest_:(url,opt)=>{assert.deepEqual(locks,['user']);if(settleFail&&sent.length)throw Error('receipt save interrupted');stored=opt.payload;writes++;return {};},Utilities:{getUuid:()=> 'claim-'+ ++id},error_:(status,message)=>{const e=Error(message);e.status=status;throw e;},
  MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:message=>{assert.deepEqual(locks,[],'No lock across MailApp');sent.push(structuredClone(message));if(onSend)onSend();if(sendError)throw Error('ambiguous network timeout');}}};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('backend/RosterNotificationStore.gs','utf8'),scope);
 if(fs.existsSync('backend/RosterPeerMail.gs'))vm.runInContext(fs.readFileSync('backend/RosterPeerMail.gs','utf8'),scope);
 return {call:(input={})=>scope.rosterNotificationTransportDispatch_({input:{operation:'sendPeerMail',publicOrigin:'https://roster.gsps.edu.sg',...input}}),scope,sent,writes:()=>writes,state:()=>JSON.parse(stored),primary:()=>primary,people:value=>people=value,onRead:fn=>onRead=fn,onSend:fn=>onSend=fn,error:value=>sendError=value,quota:value=>quota=value,failSettlement:value=>settleFail=value,advance:ms=>now+=ms,setState:value=>stored=JSON.stringify(value)};
}
{
 const h=harness(),result=h.call();assert.equal(result.handled,true,'sendPeerMail service operation must be routed');assert.equal(result.result.sent,2);assert.deepEqual(h.sent.map(m=>m.to).sort(),['bob@gsps.edu.sg','bob@schools.gov.sg']);
 for(const mail of h.sent){assert.match(mail.body,/Please approve or reject/);assert.match(mail.body,/This is a proposal/);assert.match(mail.body,/P2/);assert.match(mail.body,/08:00/);assert.match(mail.body,/https:\/\/roster\.gsps\.edu\.sg\/\?date=2026-10-26&peerRequest=peer-1#myReliefDuties/);assert.match(mail.htmlBody,/Alice &lt;A&gt;/);assert(!mail.htmlBody.includes('Alice <A>'));}
 const written=h.writes();h.call();assert.equal(h.writes(),written,'Idle replay performs no transport write');assert.equal(h.sent.length,2,'Accepted addresses are never sent twice');assert.equal(h.state().peerMail.filter(j=>j.status==='sent').length,2);assert.equal(h.primary().requests[0].status,'pending','Email cannot approve relief');
}
{
 const h=harness();h.onRead((n,p)=>{if(n===2)p.requests[0].status='approved';});h.call();assert.equal(h.sent.length,0,'Approval between durable claim and provider call suppresses the invitation');assert(h.state().peerMail.every(j=>j.status==='cancelled'));
}
{
 const h=harness();h.error(true);h.call();assert.equal(h.sent.length,2);assert.equal(h.state().peerMail.filter(j=>j.status==='uncertain').length,2);assert(h.state().smcAlerts.some(a=>a.key.startsWith('delivery:peer-mail:')&&a.status==='open'));h.advance(900000);h.error(false);h.call();assert.equal(h.sent.length,2,'An ambiguous MailApp outcome is never blindly retried');
}
{
 const h=harness();h.failSettlement(true);assert.throws(()=>h.call(),/receipt save interrupted/);assert.equal(h.sent.length,1);h.failSettlement(false);h.advance(900000);h.call();assert.equal(h.sent.length,2,'Crash after sending never resends its first address; remaining address may send');assert.equal(h.state().peerMail.filter(j=>j.status==='uncertain').length,1);
}
{
 const h=harness();h.quota(0);const result=h.call().result;assert.equal(h.sent.length,0);assert(result.pending>0);const written=h.writes();h.call();assert.equal(h.writes(),written,'Repeated exhausted quota does not rewrite identical blocked rows');h.quota(10);h.call();assert.equal(h.sent.length,2,'Quota exhaustion preserves independently retryable email intent');
}
{
 const h=harness();h.people([{id:'bob',name:'Bob',active:true,emails:['not-an-email','bob@example.test']}]);h.call();assert.equal(h.sent.length,0);assert.equal(h.state().peerMail.filter(j=>j.status==='blocked').length,1);h.people([{id:'bob',name:'Bob',active:true,emails:['bob@schools.gov.sg']}]);h.call();assert.equal(h.sent.length,1,'Corrected authoritative contact recovers without re-submitting absence');
}
{
 const h=harness();h.primary().requests[0].status='cancelled';h.call();assert.equal(h.sent.length,0,'SMC-superseded requests are not invited');
}
{
 const h=harness();h.primary().outbox=[{id:'wa-1',status:'failed',kind:'mutual_request',refId:'peer-1'}];h.call();assert.equal(h.sent.length,2,'WhatsApp failure does not block email');
}
{
 const h=harness();let reentered=false;h.onSend(()=>{if(!reentered){reentered=true;h.call();}});h.call();assert.equal(h.sent.length,2,'A concurrent drain sees prepared receipts and cannot duplicate either address');assert.equal(new Set(h.sent.map(m=>m.to)).size,2);
}
{
 const h=harness();h.people([{id:'bob',name:'Bob',active:false,emails:['bob@gsps.edu.sg']}]);h.call();assert.equal(h.sent.length,0,'Inactive Contacts records cannot receive peer email');assert.equal(h.state().peerMail[0].status,'blocked');
}
{
 const h=harness();h.onRead((n,p)=>{if(n===2)p.requests[0].lessons[0].subject='Changed after preparation';});h.call();assert.equal(h.sent.length,0,'A changed proposal is not sent using its earlier preparation');
}
{
 const h=harness();h.quota(0);h.call();h.people([{id:'bob',name:'Bob',active:true,emails:[]}]);h.call();h.people([{id:'bob',name:'Bob',active:true,emails:['bob@gsps.edu.sg','bob@schools.gov.sg']}]);h.quota(10);h.call();assert.equal(h.sent.length,2,'Temporarily unavailable Contacts addresses recover never-prepared intent when restored');h.call();assert.equal(h.sent.length,2);
}
{
 const h=harness();h.people([{id:'bob',name:'Bob',active:true,emails:[]}]);h.call();h.quota(0);h.people([{id:'bob',name:'Bob',active:true,emails:['bob@gsps.edu.sg']}]);h.call();h.people([{id:'bob',name:'Bob',active:true,emails:[]}]);h.call();assert(h.state().peerMail.some(j=>j.status==='blocked'&&!j.email),'A repeated missing Contacts address remains visible as blocked intent');
}
function whatsappHarness(){
 const h=require('./roster701-adapter.cjs')(),scope=h.scope;let primary=h.state(),stored=null,locks=[],blocked=false,unreadable=false;
 scope.gsisRequireBackendRole_=()=>{};scope.Session={getEffectiveUser:()=>({getEmail:()=> 'owner@gsps.edu.sg'})};scope.ScriptApp={getScriptId:()=> 'roster'};
 scope.props_=()=>({getProperty:()=>stored?'transport':null,setProperty:()=>{}});scope.rosterFindFile_=()=>null;scope.rosterReadFile_=()=>stored;scope.rosterOperationsState_=()=>structuredClone(primary);scope.rosterOperationsCommit_=()=>assert.fail('Transport must not write allocations');scope.Utilities.newBlob=data=>({data});scope.rosterCreateFile_=(folder,name,blob)=>{stored=blob.data;return 'transport';};scope.rosterDriveRequest_=(url,options)=>{stored=options.payload;return {};};
 scope.LockService={getScriptLock:()=>({kind:'script'}),getUserLock:()=>({kind:'user'})};scope.deployLock_=lock=>{assert(!locks.includes(lock.kind));if(lock.kind==='script')assert(!locks.includes('user'));locks.push(lock.kind);return true;};scope.deployUnlock_=lock=>assert.equal(locks.pop(),lock.kind);scope.rosterIndex_=()=>({entries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]});
 scope.rosterAbsenceIntakePending_=()=>{assert(locks.includes('user'),'Pending intake read and preparation share the capture lock');if(unreadable)throw Error('journal unavailable');return {blockedDates:blocked?[h.date]:[]};};
 vm.runInContext(fs.readFileSync('backend/RosterNotificationStore.gs','utf8'),scope);
 h.O.apply(primary,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',periods:[2,3],typeId:'mc'});h.O.apply(primary,h.ctx,{operation:'assign',date:h.date,demandIds:[h.O.demand(h.ctx,primary,h.date).find(row=>row.period===2).id],staffId:'bob'});h.O.apply(primary,h.ctx,{operation:'publish',date:h.date,allocationRevision:primary.dayRevisions[h.date],notifyMode:'all'});assert.equal(primary.outbox.length,0,'Publish changes visibility without sending');h.O.apply(primary,h.ctx,{operation:'notifyDaily',date:h.date,staffId:'bob'});
 // This compatibility fixture models a pre-H durable job, whose pending-intake eligibility stays live.
 for(const job of primary.outbox)delete job.data.communicationSnapshot;
 scope.rosterNotificationEnsure_();h.ctx.now+=360001;scope.rosterNotificationEnsure_();
 return {date:h.date,call:(operation,input={})=>scope.rosterServiceDispatch_({input:{operation,dispatchId:'dispatcher',allowedTemplateKeys:['stapler_timetable'],...input}}),state:()=>JSON.parse(stored),block:value=>blocked=value,unreadable:value=>unreadable=value};
}
{
 const h=whatsappHarness();h.block(true);assert.equal(h.call('claimNotifications').notifications.length,0);assert.equal(h.state().outbox[0].status,'queued');assert.equal(h.state().outbox[0].holdReason,'pending-absence');
 h.block(false);const claim=h.call('claimNotifications').notifications[0];assert(claim);h.block(true);assert.equal(h.call('prepareNotifications',{claims:[claim]}).notifications.length,0,'Capture after claim prevents stale timetable preparation');assert.equal(h.state().outbox[0].status,'queued');
 h.unreadable(true);assert.equal(h.call('claimNotifications').notifications.length,0,'Unreadable intake holds timetable delivery without cancelling intent');h.unreadable(false);h.block(false);const fresh=h.call('claimNotifications').notifications[0];assert(h.call('prepareNotifications',{claims:[fresh]}).notifications[0]);
}
{
 const h=whatsappHarness(),row=h.call('claimNotifications',{claimProtocol:2,batchId:'first'}).notifications[0];assert(row?.preparedAt);h.unreadable(true);h.call('claimNotifications',{claimProtocol:2,batchId:'settle',previousResults:[{id:row.id,claimId:row.claimId,state:'sent',messageId:'accepted-before-intake-error'}]});assert.equal(h.state().outbox.find(r=>r.id===row.id).status,'sent','Unreadable intake does not discard an accepted provider result in the same handoff');
}
{
 const h=whatsappHarness();assert.equal(h.call('claimNotifications',{pendingTransportDates:[h.date]}).notifications.length,0,'Signed D1 dates hold timetable delivery before GAS capture');assert.equal(h.state().outbox[0].holdReason,'pending-absence');
 h.block(true);assert.equal(h.call('claimNotifications',{pendingTransportDates:['2026-11-01']}).notifications.length,0,'D1 dates supplement the GAS journal rather than replace it');h.block(false);assert.equal(h.call('claimNotifications',{pendingTransportDates:['2026-11-01']}).notifications.length,1,'An unrelated D1 date does not hold today');
}
{
 for(const pendingTransportDates of [['2026-02-30'],['not-a-date'],'2026-10-14',Array(367).fill('2026-10-14')])assert.throws(()=>whatsappHarness().call('claimNotifications',{pendingTransportDates}),error=>error.status===400,'Malformed service dates must fail validation');
}
console.log('PASS durable peer email intents, CES/GSPS routing, explicit approval links, stale cancellation, quota recovery and uncertain send safety.');
