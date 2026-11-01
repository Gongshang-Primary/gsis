'use strict';
const assert=require('node:assert/strict'),adapter=require('./roster701-adapter.cjs');
function setup(){const h=adapter(),s=h.state();s.dailyEmploymentSnapshots=[{date:h.date,capturedAt:h.ctx.iso,health:{percentage:50},externalTeachers:[],absences:[{name:'Alice <unsafe>',reason:'MC',periods:[2]}],reliefTeachers:[]}];s.dailyEmploymentMail=[{id:'email1',date:h.date,key:'automatic:'+h.date,to:'alice@gsps.edu.sg',subject:'Daily staffing',status:'queued',createdAt:h.ctx.iso}];h.setState(s);h.scope.rosterServiceContacts_=()=>({c:{rosterPeople:[{id:'alice',active:true,emails:['alice@gsps.edu.sg']}]}});h.scope.props_=()=>({getProperty:key=>key==='ROSTER_PUBLIC_ORIGIN'?'https://roster.example.edu':'ops-file',setProperty(){}});return h;}
{
 const h=setup(),before=h.state();let quotaChecks=0;h.scope.MailApp={getRemainingDailyQuota:()=>{quotaChecks++;return 42;},sendEmail:()=>assert.fail('authorisation helper must never send')};h.scope.rosterDailyEmploymentMailDispatch_=()=>assert.fail('authorisation helper must never dispatch');
 const result=h.scope.authoriseRosterMail();assert.equal(result.ready,true);assert.equal(result.remainingDailyQuota,42);assert.equal(quotaChecks,1);assert.deepEqual(h.state(),before,'authorisation does not queue or mutate records');assert.equal(h.calls.writes,0);
 h.scope.MailApp.getRemainingDailyQuota=()=>{throw Error('Scope not authorised');};assert.throws(()=>h.scope.authoriseRosterMail(),/not authorised/,'failure must not report readiness');h.scope.MailApp.getRemainingDailyQuota=()=>NaN;assert.throws(()=>h.scope.authoriseRosterMail(),/could not be verified/);
}
{
 const h=setup();let sends=0;h.scope.MailApp={getRemainingDailyQuota:()=>5,sendEmail:mail=>{assert.equal(h.locked(),false,'network side effect runs outside operational lock');assert.equal(h.state().dailyEmploymentMail[0].status,'sending','durable claim exists before delivery');assert(mail.htmlBody.includes('Alice &lt;unsafe&gt;'));assert(mail.body.includes('https://roster.example.edu/'));assert(!mail.body.includes('utilisation'));sends++;}};
 assert.equal(h.scope.rosterDailyEmploymentMailDispatch_().sent,1);assert.equal(sends,1);assert.equal(h.scope.rosterDailyEmploymentMailDispatch_().sent,0);assert.equal(sends,1,'completed job is not resent');
}
{
 const h=setup();let sends=0;h.scope.MailApp={getRemainingDailyQuota:()=>5,sendEmail:()=>{sends++;throw Error('provider response lost');}};assert.equal(h.scope.rosterDailyEmploymentMailDispatch_().uncertain,1);assert.equal(h.state().dailyEmploymentMail[0].status,'uncertain');h.scope.rosterDailyEmploymentMailDispatch_();assert.equal(sends,1,'ambiguous external result is not blindly retried');
}
{
 const h=setup();let sends=0;h.scope.MailApp={getRemainingDailyQuota:()=>5,sendEmail:()=>{sends++;}};h.loseNextResponse();assert.throws(()=>h.scope.rosterDailyEmploymentMailDispatch_(),/Uncertain/);assert.equal(sends,0,'uncertain durable claim does not begin delivery');assert.equal(h.state().dailyEmploymentMail[0].status,'sending');h.scope.rosterDailyEmploymentMailDispatch_();assert.equal(sends,0,'in-progress claim cannot duplicate');
}
{
 const h=setup();h.scope.MailApp={getRemainingDailyQuota:()=>5,sendEmail:()=>assert.fail('must not deliver to removed address')};h.scope.rosterServiceContacts_=()=>({c:{rosterPeople:[{id:'alice',active:true,emails:['changed@gsps.edu.sg']}]}});assert.equal(h.scope.rosterDailyEmploymentMailDispatch_().blocked,1);assert.equal(h.state().dailyEmploymentMail[0].status,'blocked');
}
{
 const h=setup();h.scope.props_=()=>({getProperty:key=>key==='ROSTER_PUBLIC_ORIGIN'?null:'ops-file',setProperty(){}});h.scope.MailApp={getRemainingDailyQuota:()=>5,sendEmail:mail=>assert(mail.body.includes('https://other-school.example/'))};
 assert.equal(h.scope.rosterDailyEmploymentMailDispatch_().blocked,1);assert.equal(h.state().dailyEmploymentMail[0].status,'queued');assert.equal(h.calls.writes,0,'missing origin must not claim a report');
 assert.equal(h.scope.rosterServiceDispatch_({input:{operation:'dailyEmploymentMailDispatch',publicOrigin:'https://other-school.example'}}).sent,1,'authenticated service may supply its configured origin');
}
console.log('PASS v0.7.10 email durable claims, external-side-effect boundary, address refresh, escaped tables, and uncertain-result protection.');
