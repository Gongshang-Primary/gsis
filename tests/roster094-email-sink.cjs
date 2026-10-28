'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('backend/RosterEdgeMail.gs','utf8');
function host({quota=20,preflightError=false,sendError=false}={}){
 const sent=[];const scope=vm.createContext({gsisRequireBackendRole_:role=>assert.equal(role,'roster'),
  error_:(status,message)=>{throw Object.assign(Error(message),{status});},
  MailApp:{getRemainingDailyQuota(){if(preflightError)throw Error('private service detail');return quota;},sendEmail(mail){sent.push(mail);if(sendError)throw Error('ambiguous Google response');}}});
 vm.runInContext(source,scope);return {sent,run:p=>scope.rosterEdgeMailDispatch_({input:p})};
}
const input={operation:'sendEdgeMail',id:'job-1',claimId:'12345678-1234-1234-1234-123456789abc',mail:{to:'a@gsps.edu.sg,a@ces.edu.sg',subject:'Relief request',body:'Review your request',htmlBody:'<p>Review your request</p>',name:'Untrusted sender label'}};
const ok=host();assert.equal(ok.run(input).result.accepted,true);assert.equal(ok.sent.length,1);assert.equal(ok.sent[0].name,'GSiS Roster');
for(const config of [{quota:1},{preflightError:true}]){const h=host(config);assert.equal(h.run(input).result.notSent,true);assert.equal(h.sent.length,0);}
const uncertain=host({sendError:true});assert.throws(()=>uncertain.run(input),/ambiguous/);assert.equal(uncertain.sent.length,1,'ambiguous sends must escape without a safe retry claim');
for(const mail of [{...input.mail,to:'a@gsps.edu.sg\r\nBcc: other@example.test'},{...input.mail,subject:'x\ny'},{...input.mail,to:Array.from({length:6},(_,i)=>i+'@example.test').join(',')}]){const h=host();assert.throws(()=>h.run({...input,mail}),e=>e.status===400);assert.equal(h.sent.length,0);}
assert.equal(host().run({operation:'other'}),null);
console.log('PASS send-only mail transport: validated recipients, preflight-only retry, fixed sender and ambiguous-send preservation.');
