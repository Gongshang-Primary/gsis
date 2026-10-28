'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),adapter=require('./roster701-adapter.cjs');
const h=adapter();vm.runInContext(fs.readFileSync(__dirname+'/../backend/RosterDeliveryReview.gs','utf8'),h.scope);
const issueRow={id:'emailed-notice',name:'Teacher',kind:'stapler_timetable',date:h.date,status:'failed',error:'META_132018',deliveryStatus:'failed',attempts:3,claimId:'claim',messageId:'message',deliveryAt:h.ctx.iso,completedAt:h.ctx.iso,providerError:{code:132018}};
const fingerprint=row=>h.scope.rosterOperationsDigest_([row.id,row.status,row.error||'',row.deliveryStatus||'',row.attempts||0,row.claimId||'',row.messageId||'',row.deliveryAt||'',row.completedAt||'',row.providerError||null]);
const state=h.state();state.outbox=[{...issueRow,adminReviewReceipt:{schema:1,fingerprint:fingerprint(issueRow)}}];
const before=JSON.stringify(state),monitor={id:'monitor',group:'monitoring',status:'check_failed',occurrence:0};
const read=previous=>structuredClone(h.scope.rosterDeliveryReviewIssues_(state,[monitor],previous||[]));
assert.deepEqual(read(),[monitor],'matching email receipt closes only the reported delivery issue');
assert.deepEqual(read([{id:'notification:emailed-notice',group:'delivery',status:'failed'}]),[monitor],'refresh cannot resurrect the closed issue');
assert.equal(JSON.stringify(state),before,'receipt filtering preserves WhatsApp outcomes, history and all state');

for(const [key,value] of Object.entries({id:'new-notice',status:'uncertain',error:'META_132000',deliveryStatus:'retry-pending',attempts:4,claimId:'next-claim',messageId:'new-message',deliveryAt:'2026-10-15T00:00:00Z',completedAt:'2026-10-15T00:00:00Z',providerError:{code:132000}})){
 state.outbox[0]={...JSON.parse(before).outbox[0],[key]:value};
 const rowBefore=JSON.stringify(state.outbox[0]),out=read();
 assert.equal(out.filter(i=>i.group==='delivery').length,1,'changed '+key+' reopens the issue');
 assert.equal(JSON.stringify(state.outbox[0]),rowBefore,'reading changed '+key+' cannot modify delivery state');
}
for(const receipt of [undefined,{schema:2,fingerprint:fingerprint(issueRow)},{schema:1,fingerprint:'not-the-record'}]){
 state.outbox[0]={...issueRow,adminReviewReceipt:receipt};
 assert.equal(read().filter(i=>i.group==='delivery').length,1,'unrecognised or missing receipt cannot hide an issue');
}

state.outbox=[{...issueRow,adminReviewReceipt:{schema:1,fingerprint:fingerprint(issueRow)}}];
const writes=h.calls.writes;h.setState(state);
h.scope.rosterDeliveryReviewRefresh_(state,{state:'not_checked'},['admin@example.edu'],h.ctx.now);
assert.equal(state.deliveryReview.issues.length,0);assert.equal(state.deliveryReview.jobs.length,0,'a reported issue queues no replacement email');
assert.equal(h.calls.writes,writes,'pure refresh has no write or message side effects');
assert.equal(state.outbox[0].status,'failed');assert.equal(state.outbox[0].providerError.code,132018);
console.log('PASS v086a receipt suppression, exact fingerprint reopening, unchanged WhatsApp outcomes and no replacement email');
