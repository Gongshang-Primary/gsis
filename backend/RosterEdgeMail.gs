/* Google is a send-only email transport after D1 cutover. Claims and outcomes
 * belong to D1; a timeout here is ambiguous and must never trigger blind retry. */
function rosterEdgeMailDispatch_(req){
 if(req.input?.operation!=='sendEdgeMail')return null;
 gsisRequireBackendRole_('roster');
 const p=req.input,m=p.mail||{},id=String(p.id||''),claim=String(p.claimId||'');
 if(!id||id.length>300||!/^[a-f0-9-]{36}$/i.test(claim))error_(400,'Invalid email handoff identity.');
 const recipients=String(m.to||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(!recipients.length||recipients.length>5||new Set(recipients).size!==recipients.length||recipients.some(x=>! /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(x)))error_(400,'Invalid email recipients.');
 if(typeof m.subject!=='string'||!m.subject.trim()||m.subject.length>240||/[\r\n]/.test(m.subject)||typeof m.body!=='string'||m.body.length>120000||typeof m.htmlBody!=='undefined'&&(typeof m.htmlBody!=='string'||m.htmlBody.length>180000))error_(400,'Invalid email content.');
 // Only definite failures before MailApp.sendEmail may safely be retried.
 let quota;
 try{quota=MailApp.getRemainingDailyQuota();}catch(ignore){return {handled:true,result:{notSent:true,code:'EMAIL_PREFLIGHT_UNAVAILABLE'}};}
 if(quota<recipients.length)return {handled:true,result:{notSent:true,code:'EMAIL_QUOTA_EXHAUSTED'}};
 MailApp.sendEmail({to:recipients.join(','),subject:m.subject,body:m.body,...(m.htmlBody?{htmlBody:m.htmlBody}:{}),name:'GSiS Roster'});
 return {handled:true,result:{accepted:true}};
}
