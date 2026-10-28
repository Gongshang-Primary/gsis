const assert=require('node:assert/strict'),test=require('node:test'),adapter=require('./roster701-adapter.cjs');

function setup(){
 const h=adapter(),s=h.state();
 s.outbox.push({id:'notice',kind:'stapler_timetable',recipientId:'bob',name:'Bob',mobile:'6591234567',date:h.date,status:'sending',claimId:'claim',attempts:1,firstAttemptAt:h.ctx.now,expiresAt:h.ctx.now+3600000,attemptHistory:[{number:1,claimId:'claim',at:h.ctx.iso,state:'sending'}]});
 h.setState(s);return h;
}
const call=(h,operation,p={})=>h.scope.rosterServiceDispatch_({input:{operation,...p}});
const result=(h,p={})=>call(h,'notificationResult',{id:'notice',claimId:'claim',state:'failed',error:'META_132018',...p});
const diagnostic={code:132018,subcode:2494073,traceId:'Trace_safe-123',details:'Template parameters cannot contain line breaks, tabs or more than four consecutive spaces.',templateName:'gsis_timetable_updated_v1',fields:[{field:'change_details',index:3,characters:187,normalized:true}]};

test('permanent Meta parameter failure is retained and escalated without an unchanged retry',()=>{
 const h=setup();result(h,{providerError:diagnostic});const s=h.state(),j=s.outbox[0];
 assert.equal(j.status,'failed');assert.equal(j.retryable,false);assert.deepEqual(j.providerError,diagnostic);assert.deepEqual(j.attemptHistory[0].providerError,diagnostic);assert.equal(s.smcAlerts.length,1);assert.equal(j.nextAttemptAt,undefined);
});

test('known permanent errors do not require diagnostic metadata to stop retries',()=>{
 for(const code of [100,131008,131009,132000,132001,132005,132007,132012,132015,132016,132018]){
  const h=setup();result(h,{error:'META_'+code});assert.equal(h.state().outbox[0].status,'failed','Meta '+code);assert.equal(h.state().outbox[0].retryable,false);
 }
});

test('transient failures still retry and uncertain sends remain unretried',()=>{
 const transient=setup();result(transient,{error:'META_130429',providerError:{code:130429,traceId:'rate-limit'}});assert.equal(transient.state().outbox[0].status,'queued');assert.equal(transient.state().outbox[0].nextAttemptAt,transient.ctx.now+60000);
 const uncertain=setup();result(uncertain,{state:'uncertain',error:'SEND_RESULT_UNCONFIRMED'});assert.equal(uncertain.state().outbox[0].status,'uncertain');assert.equal(uncertain.state().smcAlerts.length,1);
});

test('delivery failure retains provider metadata and does not retry permanent parameter errors',()=>{
 const h=setup();result(h,{state:'sent',messageId:'wamid.example',error:''});
 call(h,'notificationDelivery',{eventId:'delivery-failed',messageId:'wamid.example',recipientId:'6591234567',state:'failed',timestamp:h.ctx.now+1000,providerError:diagnostic});
 const s=h.state(),j=s.outbox[0];assert.equal(j.status,'failed');assert.equal(j.error,'META_132018');assert.equal(j.retryable,false);assert.deepEqual(j.providerError,diagnostic);assert.deepEqual(j.attemptHistory[0].providerError,diagnostic);
 const writes=h.calls.writes;call(h,'notificationDelivery',{eventId:'delivery-failed',messageId:'wamid.example',state:'failed',providerError:diagnostic});assert.equal(h.calls.writes,writes,'duplicate delivery is idempotent');
});

test('diagnostics retain only bounded safe metadata',()=>{
 const h=setup();result(h,{providerError:{...diagnostic,details:'Rejected https://roster.example.test/external.html#private-secret user@example.test Bearer secret-token 6591234567\nend',secret:'access-token',fields:[...diagnostic.fields,{field:'bad field',index:0,characters:-1,normalized:'yes',text:'private summary'}]}});
 const saved=h.state().outbox[0].providerError;assert(saved,'diagnostic metadata must survive persistence');assert.equal(saved.code,132018);assert.equal(saved.secret,undefined);assert.equal(saved.fields.length,1);assert.equal(saved.details,'Provider details withheld; use the Meta trace ID for investigation.');assert(!JSON.stringify(saved).includes('private summary'));
});

test('an existing permanent retry is stopped before it can be claimed again',()=>{
 const h=setup(),s=h.state(),j=s.outbox[0];Object.assign(j,{status:'queued',deliveryStatus:'retry-pending',error:'META_132018',retryable:true,nextAttemptAt:h.ctx.now});
 h.scope.rosterNotificationRetries_(s,h.ctx.now);assert.equal(j.status,'failed');assert.equal(j.retryable,false);assert.equal(s.smcAlerts.length,1);
});
