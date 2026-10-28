'use strict';
// v0.8.10 replaces per-change Admin email with a daily Drive report. Retain the
// monitor ordering, material-change and concurrent allocation contract here.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),adapter=require('./roster701-adapter.cjs');
const scope=vm.createContext({Map,Set,JSON,Number,String,Array,Date,rosterOperationsDigest_:value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')});
vm.runInContext(fs.readFileSync('backend/RosterDeliveryReview.gs','utf8'),scope);
const refresh=(state,input)=>scope.rosterDeliveryReviewRefresh_(state,input,['unused-admin@example.test'],Date.parse('2026-10-23T00:00:00Z'));
{
 const state={outbox:[{id:'notice1',name:'Teacher One',status:'failed',error:'https://private.example/secret-token',providerError:{code:132000,message:'private-token'}}]};
 refresh(state);assert.equal(state.deliveryReview.issues.length,1);assert.equal(state.deliveryReview.jobs.length,0,'new email jobs are never created');assert(!JSON.stringify(state.deliveryReview).includes('secret-token'));assert(!JSON.stringify(state.deliveryReview).includes('private-token'));assert.equal(refresh(state),false,'unchanged refresh does not rewrite transport');
 const revision=state.deliveryReview.revision;state.outbox[0].providerError.code=131026;refresh(state);assert.equal(state.deliveryReview.revision,revision+1,'new provider evidence changes issue version');state.outbox[0].deliveryStatus='delivered';refresh(state);assert.equal(state.deliveryReview.issues.length,0);
}
{
 const state={outbox:[]};refresh(state,{state:'checked',checkedAt:100,routes:[]});refresh(state,{state:'checked',checkedAt:300,routes:[]});assert.equal(state.deliveryReview.monitorCheckedAt,300);
 refresh(state,{state:'failed',checkedAt:200});assert.equal(state.deliveryReview.issues.length,0,'late failure cannot reopen newer clean result');refresh(state,{state:'not_checked',checkedAt:500});assert.equal(state.deliveryReview.monitorCheckedAt,300);
 refresh(state,{state:'failed',checkedAt:400});assert.equal(state.deliveryReview.issues.length,1);const revision=state.deliveryReview.revision;refresh(state,{state:'failed',checkedAt:401});assert.equal(state.deliveryReview.revision,revision,'check timestamp alone is not material');
 refresh(state,{state:'checked',checkedAt:402,routes:[{key:'relief_assignment',status:'rejected'},{key:'private-token',status:'rejected'}]});assert.equal(state.deliveryReview.issues.length,1);assert.equal(state.deliveryReview.issues[0].field,'relief_assignment');assert(!JSON.stringify(state.deliveryReview).includes('private-token'));
 refresh(state,{state:'not_checked'});assert.equal(state.deliveryReview.issues.length,1,'unknown check does not resolve confirmed configuration');refresh(state,{state:'checked',checkedAt:403,routes:[]});assert.equal(state.deliveryReview.issues.length,0);
}
{
 const state={outbox:[{id:'n',status:'failed'}],deliveryReview:{revision:1,issues:[],monitor:[],jobs:[{id:'q',status:'queued',to:'admin@example.test'},{id:'s',status:'sending',claimedAt:'2026-10-22T23:00:00Z'},{id:'u',status:'uncertain',error:'Outcome not confirmed'},{id:'done',status:'sent',sentAt:'2026-10-22T22:00:00Z'}]}};
 refresh(state);assert.deepEqual(Array.from(state.deliveryReview.jobs,j=>j.status),['superseded','superseded','superseded','sent']);assert.equal(state.deliveryReview.jobs[1].claimedAt,'2026-10-22T23:00:00Z');assert.equal(state.deliveryReview.jobs[2].error,'Outcome not confirmed');assert.equal(state.deliveryReview.issues.length,1,'retiring emails does not clear unarchived issues');
}
{
 const h=adapter(),base=h.state(),next=structuredClone(base),current=structuredClone(base);current.deliveryReview={revision:1,reports:{'2026-10-23':{status:'pending',fileId:'reserved'}}};
 const dependencies=state=>h.scope.rosterOperationsDependencies_(state,{operation:'scheduledRoster'},h.ctx);assert.equal(dependencies(current),dependencies(base),'report writes cannot invalidate allocation preparation');next.assignments.push({id:'prepared-assignment',staffId:'teacher'});const merged=structuredClone(h.scope.rosterOperationsMergePrepared_(base,next,current));assert.deepEqual(merged.deliveryReview,current.deliveryReview);assert(merged.assignments.some(a=>a.id==='prepared-assignment'));
}
console.log('PASS delivery review material changes, ordered monitors, obsolete-email retirement, redaction and allocation isolation');
