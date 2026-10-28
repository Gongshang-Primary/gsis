'use strict';
const assert=require('node:assert/strict'),{harness}=require('./roster-draft-cell-save-speed.cjs');
const make=h=>{const p=h.command();return {...p,operation:'reliefBatch',commands:[{operation:'assign',demandIds:p.demandIds,staffId:'teacher20'},{operation:'setNoRelief',demandIds:p.demandIds,noRelief:true,confirm:true}]};};
{
 const h=harness(),p=make(h),result=h.call(p),saved=h.state();assert.equal(h.stats.writes,1);assert.equal(saved.revision,1);assert.equal(saved.receipts.length,1);assert(saved.audit.some(a=>a.operation==='reliefBatch'));assert.equal(result.assignments.filter(a=>a.status==='draft').length,1);assert.equal(saved.outbox.length,0);const replay=h.call(p);assert.equal(replay.replayed,true);assert.equal(h.stats.writes,1);assert.equal(h.state().audit.length,saved.audit.length);assert.throws(()=>h.call({...p,commands:p.commands.slice(0,1)}),e=>e.status===409);assert.equal(h.stats.writes,1);
}
for(const invalid of ['missing','cross-date','authority','stale','source']){
 const h=harness(),p=make(h),before=JSON.stringify(h.state());if(invalid==='missing')p.commands[1].demandIds=['missing'];if(invalid==='cross-date')p.commands[1].date='2026-10-15';if(invalid==='authority'){h.contacts.user.rosterSMC=false;h.contacts.user.rosterAdmin=false;}if(invalid==='stale')p.revision=9;if(invalid==='source')p.expectedTimetableId='wrong';if(invalid==='started')h.setAfterRead(()=>h.setClock(Date.parse(h.date+'T08:00:00+08:00')));
 assert.throws(()=>h.call(p),e=>[403,409].includes(e.status),invalid);assert.equal(h.stats.writes,0,invalid+' cannot commit a prefix');assert.equal(JSON.stringify(h.state()),before);
}
console.log('PASS backend one-commit batches, exact receipts, rejection atomicity, fresh authority/source/revision/clock');
