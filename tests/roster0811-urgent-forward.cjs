'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const adapter=require('./roster701-adapter.cjs');

function fixture(){
 const h=adapter();
 h.ctx.now=Date.parse(h.date+'T10:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();
 h.ctx.people.find(p=>p.id==='bob').mobile='92345678';
 h.ctx.people.push({id:'missing-mobile',name:'No Mobile',active:true,role:'KP',mobile:''},{id:'inactive',name:'Inactive SMC',active:false,role:'KP',mobile:'6590000000'});
 const contacts={rosterPeople:h.ctx.people,rosterSMCIds:['alice','bob','charlie','missing-mobile','inactive'],rosterUrgentSMCIds:[],rosterAdminIds:['alice']};
 h.scope.rosterServiceContacts_=()=>({c:contacts});
 vm.runInContext(fs.readFileSync('backend/RosterInbox.gs','utf8'),h.scope);
 const s=h.state();s.smcDutyRoster=[{date:h.date,staffIds:['alice','charlie','charlie','ghost','missing-mobile','inactive']}];h.setState(s);
 const call=input=>h.scope.rosterServiceDispatch_({input}),sender=h.ctx.people.find(p=>p.id==='bob');
 const base={operation:'inboundMessage',inboxMode:true,from:sender.mobile,timestamp:h.ctx.now};
 call({...base,messageId:'wamid.urgent-prompt',type:'interactive',selection:'gsis_urgent'});
 const message={...base,messageId:'wamid.urgent-body',type:'text',text:'Please assist now.\nThe lift has stopped.'};
 return {...h,contacts,call,message};
}

// Real signed-service route: only today's verified duty roster receives forwards.
const h=fixture();h.loseNextResponse();assert.throws(()=>h.call(h.message),/Uncertain response/);
let state=h.state(),jobs=state.outbox;
assert.deepEqual(jobs.map(j=>j.recipientId),['alice','charlie','missing-mobile']);
assert.equal(state.absences.length,0);assert.equal(state.assignments.length,0);
assert.equal(h.call(h.message).duplicate,true);
assert.equal(h.state().outbox.length,3,'lost reply must not duplicate recipient jobs');
for(const j of jobs){
 assert.equal(j.kind,'urgent_forward');assert.equal(j.data.templateKey,'urgent_forward');
 assert.equal(j.data.audience,'duty-smc');assert.equal(j.data.originalMessage,h.message.text);
 assert.equal(j.data.senderName,'Bob');assert.equal(j.data.senderContact,'6592345678');
 assert.equal(j.key,'urgent-forward:'+h.message.messageId+':'+j.recipientId);
}

// The existing approved urgent route operates independently of generic Inbox alerts.
const claim=h.call({operation:'claimNotifications',allowedTemplateKeys:['urgent_forward']});
assert.deepEqual(Array.from(claim.notifications,j=>j.recipientId),['alice','charlie']);
assert.match(h.state().outbox.find(j=>j.recipientId==='missing-mobile').error,/mobile number/);
assert.equal(h.call({operation:'claimNotifications',allowedTemplateKeys:['urgent_forward']}).notifications.length,0);
for(const [i,j] of claim.notifications.entries()){
 const prepared=h.call({operation:'prepareNotification',id:j.id,claimId:j.claimId,allowedTemplateKeys:['urgent_forward']});
 assert.equal(prepared.notification.id,j.id);
 h.call({operation:'notificationResult',id:j.id,claimId:j.claimId,state:i?'uncertain':'sent',messageId:i?'':'wamid.sent'});
}
assert.equal(h.call({operation:'claimNotifications',allowedTemplateKeys:['urgent_forward']}).notifications.length,0,'sent and uncertain jobs are never blindly resent');

// Approval, current mobile and current duty are checked immediately before sending.
for(const change of ['duty','role','mobile','template']){
 const f=fixture();f.call(f.message);
 const j=f.call({operation:'claimNotifications',allowedTemplateKeys:['urgent_forward']}).notifications[0];
 if(change==='duty'){const s=f.state();s.smcDutyRoster[0].staffIds=['charlie'];f.setState(s);}
 if(change==='role')f.contacts.rosterSMCIds=['charlie'];
 if(change==='mobile')f.contacts.rosterPeople.find(p=>p.id===j.recipientId).mobile='';
 const result=f.call({operation:'prepareNotification',id:j.id,claimId:j.claimId,allowedTemplateKeys:change==='template'?[]:['urgent_forward']});
 assert.equal(result.notification,null,change);
}
const none=fixture(),s=none.state();s.smcDutyRoster=[];none.setState(s);
assert.equal(none.call(none.message).reply.action,'urgent-no-recipient');assert.equal(none.state().outbox.length,0);
for(const body of ['x'.repeat(4096),'🚨\n'.repeat(1365)+'x','x'.repeat(1100)+' \t\r\n'.repeat(500)+'y'.repeat(800)]){
 const f=fixture(),message={...f.message,text:body};f.call(message);
 const jobs=f.state().outbox,first=jobs.filter(j=>j.recipientId==='alice');
 assert(first.length>1);
 assert.equal(first.map(j=>j.data.originalMessage.replace(/^\[Part \d+ of \d+\] /,'')).join(''),body);
 assert.equal(new Set(jobs.map(j=>j.key)).size,jobs.length);
 assert.deepEqual(jobs.filter(j=>j.recipientId==='charlie').map(j=>j.data.originalMessage),first.map(j=>j.data.originalMessage));
 first.forEach((j,i)=>{assert.equal(j.data.partNumber,i+1);assert.equal(j.data.partCount,first.length);});
 assert(f.call(message).duplicate);assert.equal(f.state().outbox.length,jobs.length);
}
console.log('Urgent forwarding: all verified duty SMC, payload fidelity, missing contacts, current-duty preflight and duplicate-safe delivery passed; no live sends');
