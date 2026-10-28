'use strict';
const assert=require('node:assert/strict'),{harness,decode}=require('./roster097-batch-backend.cjs');
const mark=h=>h.scope.rosterTimetableBatchCommitEnd_(h.scope.rosterTimetableBatchCommitBegin_(h.state));
{
 const h=harness();h.record(h.today,{confirmed:true});const distant=h.record('2026-11-21',{confirmed:true});mark(h);
 const base=h.call({stage:'baseline'}),first=h.call({stage:'suspended',baselineKey:base.baselineKey});
 distant.revision++;h.state.revision++;const pending=h.scope.rosterTimetableBatchCommitBegin_(h.state),reads=h.operationReads(),models=h.modelReads.length;
 for(let i=0;i<30;i++)assert(h.call({stage:'suspended',baselineKey:base.baselineKey,knownSourceKey:first.sourceKey}).unchanged,'an out-of-window pending write must not invalidate the trusted 31-day window');
 h.scope.rosterTimetableBatchCommitEnd_(pending);
 assert(h.call({stage:'suspended',baselineKey:base.baselineKey,knownSourceKey:first.sourceKey}).unchanged);
 assert.equal(h.operationReads(),reads);assert.equal(h.modelReads.length,models);
 console.log('PASS 30 concurrent-user-equivalent unchanged reads after an out-of-window write add zero model/operations reads');
 h.setDate('2026-10-22');const nextBase=h.call({stage:'baseline'}),next=h.call({stage:'suspended',baselineKey:nextBase.baselineKey});
 assert.notEqual(next.sourceKey,first.sourceKey);assert(decode(next).plans.some(p=>p.date==='2026-11-21'&&p.revision===distant.revision));
 console.log('PASS day rollover includes the newly in-window date without requiring another write');
}
{
 const h=harness(),record=h.record(h.to,{confirmed:true});mark(h);const base=h.call({stage:'baseline'}),first=h.call({stage:'suspended',baselineKey:base.baselineKey});
 record.revision++;const pending=h.scope.rosterTimetableBatchCommitBegin_(h.state);
 const fresh=h.call({stage:'suspended',baselineKey:base.baselineKey,knownSourceKey:first.sourceKey});assert(!fresh.unchanged);assert.equal(fresh.sourceKey,null);
 h.scope.rosterTimetableBatchCommitEnd_(pending);assert.notEqual(h.call({stage:'suspended',baselineKey:base.baselineKey}).sourceKey,first.sourceKey);
 console.log('PASS boundary-date edits remain pending until the owning document commits');
}
