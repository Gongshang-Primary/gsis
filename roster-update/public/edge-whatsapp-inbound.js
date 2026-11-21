import {GSISRosterOperations as RosterOps} from './edge-roster-domain.js';

// Public service navigation does not require a staff identity. Only the urgent
// flow resolves the current Contacts roster, including inactive records.
const mobile=RosterOps.mobile,allocation=()=>RosterOps.allocation(),queue=(...args)=>RosterOps.queue(...args);
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
 function urgentMessageParts(message){
  const encoded=message.split(/\r\n|[\r\n\u0085\u2028\u2029]/u).map(line=>line.replace(/[\t\p{Zs}]+/gu,' ').trim()).filter(Boolean).join('; ');
  if([...encoded].length<=1024)return [message];
  // Keep source characters intact. Count line breaks twice for the outbound
  // '; ' encoding, leaving 24 characters for the numbered part prefix.
  const parts=[];let value='',length=0;
  for(const character of message){const size=/[\r\n\u0085\u2028\u2029]/u.test(character)?2:1;
   if(length+size>1000){parts.push(value);value='';length=0;}
   value+=character;length+=size;
  }
  if(value)parts.push(value);
  return parts.map((part,i)=>'[Part '+(i+1)+' of '+parts.length+'] '+part);
 }

export function edgeInboundMessage(s,ctx,p){
  if(!ctx.service)fail(403,'Only the signed WhatsApp webhook may submit messages.');
  if(typeof p.messageId!=='string'||!/^wamid\.[\w=.+/-]{1,500}$/.test(p.messageId)||!/^\d{8,15}$/.test(mobile(p.from)))fail(400,'Invalid incoming message.');
  s.inboundEvents=s.inboundEvents||[];s.inboundSessions=s.inboundSessions||{};
  const prior=s.inboundEvents.find(e=>e.id===p.messageId);if(prior)return {duplicate:true,receiptId:prior.id,reply:null};
  if(!Number.isFinite(p.timestamp)||p.timestamp>ctx.now+60000||p.timestamp<ctx.now-86400000)fail(400,'Incoming message is outside the reply window.');
  const number=mobile(p.from),needsIdentity=p.selection==='gsis_urgent'||!p.selection&&s.inboundSessions[number]?.expiresAt>ctx.now;
  const matches=needsIdentity?ctx.people.filter(x=>typeof x.id==='string'&&x.id&&mobile(x.mobile)===number):[],person=matches.length===1?matches[0]:null;
  const recent=s.inboundEvents.filter(e=>e.from===number&&ctx.now-e.receivedAt<60000),entry={id:p.messageId,from:number,receivedAt:ctx.now,providerTimestamp:p.timestamp,staffId:person?.id||null,replyStatus:'sending',replyClaimId:ctx.uuid()};s.inboundEvents.push(entry);
  let action='menu',text='';
  if(recent.length>=6)action='rate-limited';
  else if(p.selection){
   const choices={gsis_report_absence:'report-absence',gsis_urgent:'urgent-prompt',gsis_layout:'layout',gsis_devices:'devices',gsis_office:'office'};
   action=choices[p.selection]||'menu';delete s.inboundSessions[number];
   if(action==='urgent-prompt'){if(!person)action='unknown';else s.inboundSessions[number]={staffId:person.id,expiresAt:ctx.now+15*60000,requestedAt:ctx.iso};}
  }else if(s.inboundSessions[number]?.expiresAt>ctx.now){
   if(!person||s.inboundSessions[number].staffId!==person.id){delete s.inboundSessions[number];action='unknown';}
   else if(p.type!=='text')action='unsupported';
   else{
    if(typeof p.text!=='string'||!p.text.trim()||p.text.length>4096)fail(400,'Type a non-empty urgent message of at most 4096 characters.');
    const recipients=[...new Set(ctx.urgentSMCIds||[])].filter(id=>ctx.people.some(x=>x.id===id&&x.active));
    const alert={id:ctx.uuid(),key:'urgent-inbound:'+p.messageId,date:ctx.today,createdAt:ctx.iso,recipients,status:recipients.length?'open':'no-urgent-recipient',summary:p.text,senderName:person.name,senderContact:number,origin:'whatsapp-urgent',inboundId:p.messageId};s.smcAlerts.push(alert);
    const parts=urgentMessageParts(p.text);
    for(const recipient of recipients)parts.forEach((part,i)=>queue(s,ctx,'urgent_forward',recipient,ctx.today,{templateKey:'urgent_forward',audience:ctx.inboxMode?'duty-smc':'urgent-smc',originalMessage:part,senderName:person.name,senderContact:number,summary:part,inboundId:p.messageId,...(parts.length>1?{partNumber:i+1,partCount:parts.length}:{})},null,'urgent-forward:'+p.messageId+':'+recipient+(parts.length>1?':part:'+(i+1):'')));
    allocation().addAudit(s,ctx,'urgent-message-recorded',{date:ctx.today,inboundId:p.messageId,staffId:person.id,recipientIds:recipients});delete s.inboundSessions[number];action=recipients.length?'urgent-confirm':'urgent-no-recipient';
   }
  }
  entry.action=action;return {receiptId:entry.id,replyClaimId:entry.replyClaimId,reply:{action,to:number,text},queued:s.outbox.filter(j=>j.data?.inboundId===p.messageId).length};
 }
