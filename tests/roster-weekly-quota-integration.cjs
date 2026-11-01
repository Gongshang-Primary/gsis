'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation');
function setup(){
 const f=fixture(),week='2026-11-02';Object.assign(f.ctx,{today:'2026-11-01',minute:960,now:Date.parse('2026-11-01T16:00:00+08:00'),iso:'2026-11-01T08:00:00.000Z',quotaRequested:true,quotaCheckpointDue:true,service:true});
 f.ctx.days=Object.fromEntries(Array.from({length:5},(_,i)=>[A.addDays(week,i),{id:'baseline',schoolDay:true,verified:true,parity:'odd',periods:f.ctx.days[f.date].periods,teachers:f.teachers,quotaSource:{service:'deploy',from:'2026-01-01',to:'2027-12-31',weeklyCheckpoint:true,publishedAt:'2026-10-31T08:00:00Z',versionId:'v1',revision:1,commit:'one',calculationVersion:'model-one'}}]));f.ctx.quotaCheckpointEvidence={...A.quotaCheckpoint(f.ctx),schoolDate:week,verified:true,source:f.ctx.days[week].quotaSource,rows:f.teachers.map(t=>({id:t.staffId,R:t.R}))};return {...f,week};
}
test('allocation and health projections cannot record a checkpoint in live state',()=>{
 for(const operation of ['allocation','health']){const f=setup(),before=JSON.stringify(f.state.quotaCheckpoints);f.O.read(f.state,f.ctx,{operation,date:f.week});assert.equal(f.state.entitlements.length,0);assert.equal(JSON.stringify(f.state.quotaCheckpoints),before);}
});
test('signed scheduler credits an empty week while automatic allocation is paused',()=>{
 const f=setup();f.state.systemConfig.scheduledAllocationEnabled=false;f.ctx.skipScheduledAllocation=true;
 const result=f.O.scheduledTick(f.state,f.ctx,f.ctx.now);assert.equal(result.quotaCheckpoint.status,'ready');assert.equal(f.state.entitlements.length,4);assert.equal(f.state.quotaCheckpoints[f.week].status,'ready');
 const count=f.state.entitlements.length;f.O.scheduledTick(f.state,f.ctx,f.ctx.now);assert.equal(f.state.entitlements.length,count);
});

test('a pending cutoff reports a health diagnostic without inventing quota',()=>{
 const f=setup();for(const day of Object.values(f.ctx.days))day.quotaSource.publishedAt='2026-11-01T09:00:00Z';f.ctx.skipScheduledAllocation=true;
 const result=f.O.scheduledTick(f.state,f.ctx,f.ctx.now);assert.equal(result.quotaPending,true);assert.equal(result.code,'QUOTA_CHECKPOINT_PENDING');assert.equal(f.state.entitlements.length,0);
});
