'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const adapter=require('./roster701-adapter.cjs');
for(const scenario of [{view:'mine'},{view:'mine',deferred:true},{view:'report'},{operation:'saveAdhoc'}]){
 const h=adapter(),state=h.state();
 h.ctx.minute=360;h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();state.accountingYears['2026']={verified:true};
 h.O.apply(state,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[2]});
 const demand=h.O.demand(h.ctx,state,h.date)[0];h.O.apply(state,h.ctx,{operation:'assign',date:h.date,staffId:'bob',demandIds:[demand.id]});
 const original=structuredClone(state.assignments.find(row=>row.staffId==='bob'));h.people.find(person=>person.id==='bob').active=false;h.setState(state);
 h.ctx.minute=479;h.ctx.now=Date.parse(h.date+'T07:59:59+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();if(scenario.deferred)h.ctx.quotaRequested=false;
 let crossed=false;h.scope.rosterTimetableBatchCommitBegin_=()=>{crossed=true;h.ctx.now=Date.parse(h.date+'T08:00:01+08:00');return null;};
 const input=scenario.operation?{operation:scenario.operation,date:h.date,staffId:'dora',periods:[4],revision:state.revision,requestId:crypto.randomUUID()}:{operation:'read',view:scenario.view,date:h.date};
 try{h.call(input);}catch(error){assert(['PREPARED_RETRY',undefined].includes(error.code)&&[409,503].includes(error.status),error.stack);}
 assert(crossed,'the real commit preparation crosses the period start');
 assert.deepEqual(h.state().assignments.find(row=>row.id===original.id),original,'a duty that starts during commit preparation stays exact history: '+JSON.stringify(scenario));
 assert(!h.state().assignments.some(row=>row.id!==original.id&&row.demandId===demand.id),'no replacement is committed for the started duty');
 assert(!h.state().audit.some(row=>row.operation==='inactive-teacher-release'),'failed preparation has no committed inactive-release audit');
 h.ctx.minute=480;h.call({operation:'read',view:'mine',date:h.date});assert.deepEqual(h.state().assignments.find(row=>row.id===original.id),original,'a fresh retry retains the now-started duty');
}
console.log('PASS real Google final commit clock: record-only, deferred removal, full read and mutation preserve a duty that starts during preparation');
