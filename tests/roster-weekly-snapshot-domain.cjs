'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../shared/roster-allocation.js'),fixture=require('./roster701-fixture.cjs');
const week='2026-11-02',cutoff=Date.parse('2026-11-01T16:00:00+08:00');
function setup(time='2026-11-01T16:00:00+08:00'){
 const f=fixture(),now=Date.parse(time),sg=new Date(now+28800000).toISOString();
 Object.assign(f.ctx,{now,iso:new Date(now).toISOString(),today:sg.slice(0,10),minute:Number(sg.slice(11,13))*60+Number(sg.slice(14,16)),quotaRequested:true,quotaCheckpointDue:true,service:true});
 f.teachers.forEach(t=>{t.R=99;t.cells=f.blank();});
 f.ctx.days=Object.fromEntries(Array.from({length:5},(_,n)=>[A.addDays(week,n),{id:'baseline',verified:true,schoolDay:true,parity:'odd',periods:[{period:0}],teachers:f.teachers,quotaSource:{weeklyCheckpoint:true,publishedAt:'2026-10-31T08:00:00Z'}}]));
 f.ctx.quotaCheckpointEvidence={week,cutoff,verified:true,source:{service:'deploy',versionId:'publication-one',revision:3,commit:'commit-one',calculationVersion:'relief-model-one',publishedAt:'2026-10-31T08:00:00Z'},rows:f.people.map(p=>({id:p.id,R:5}))};
 return f;
}
function previous(f){f.state.entitlements=f.people.map(p=>({id:'prior-'+p.id,staffId:p.id,week:'2026-10-26',year:'2026',quota:7,mode:'observed',source:{versionId:'previous'}}));}
test('weekly credit consumes verified snapshot rows, never the live R projection',()=>{
 const f=setup(),r=A.captureQuotaCheckpoint(f.state,f.ctx);
 assert.equal(r.status,'ready');assert.equal(f.state.entitlements.length,4);
 assert(f.state.entitlements.every(row=>row.quota===5&&row.source.commit==='commit-one'));
});
test('a missing or identity-invalid snapshot cannot substitute live Deploy R',()=>{
 for(const mutate of [f=>delete f.ctx.quotaCheckpointEvidence,f=>f.ctx.quotaCheckpointEvidence.verified=false,f=>f.ctx.quotaCheckpointEvidence.week='2026-11-09',f=>f.ctx.quotaCheckpointEvidence.cutoff++,f=>f.ctx.quotaCheckpointEvidence.source.revision=null,f=>f.ctx.quotaCheckpointEvidence.source.publishedAt='2026-11-01T16:01:00+08:00',f=>f.ctx.quotaCheckpointEvidence.rows.push({...f.ctx.quotaCheckpointEvidence.rows[0]})]){
  const f=setup();mutate(f);const r=A.captureQuotaCheckpoint(f.state,f.ctx);
  assert.equal(r.status,'pending');assert.equal(f.state.entitlements.length,0);assert.equal(A.weekQuota(f.state,f.ctx,'bob',week).quota,null);
 }
});
test('last verified R is frozen once during snapshot lag, while transfer recovery remains pending',()=>{
 const f=setup();previous(f);f.ctx.quotaCheckpointEvidence.verified=false;
 const first=A.captureQuotaCheckpoint(f.state,f.ctx);assert.equal(first.status,'pending');assert.equal(first.fallback,4);assert.equal(first.retryStopped,false);
 const frozen=JSON.stringify(f.state.entitlements.filter(row=>row.week===week));assert.equal(A.weekQuota(f.state,f.ctx,'bob',week).quota,7);
 f.ctx.now+=3600000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.quotaCheckpointEvidence.verified=true;
 const recovered=A.captureQuotaCheckpoint(f.state,f.ctx);assert.equal(recovered.status,'ready');assert.equal(recovered.fallback,4);
 assert.equal(JSON.stringify(f.state.entitlements.filter(row=>row.week===week)),frozen,'source recovery never rewrites captured fallback R');
});
test('snapshot lag produces one persistent SMC alert for the week',()=>{
 const f=setup();previous(f);f.ctx.quotaCheckpointEvidence.verified=false;f.ctx.skipScheduledAllocation=true;
 f.O.scheduledTick(f.state,f.ctx,f.ctx.now);f.ctx.now+=3600000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.minute+=60;
 f.O.scheduledTick(f.state,f.ctx,f.ctx.now);
 assert.equal(f.state.smcAlerts.filter(row=>row.key==='quota-checkpoint:'+week).length,1);
});

test('verified source recovery resolves its alert without changing frozen fallback R',()=>{
 const f=setup();previous(f);Object.assign(f.ctx,{service:true,quotaCheckpointDue:true,skipScheduledAllocation:true});f.ctx.quotaCheckpointEvidence.verified=false;
 f.O.scheduledTick(f.state,f.ctx,f.ctx.now);const frozen=JSON.stringify(f.state.entitlements),alert=f.state.smcAlerts.find(row=>row.key==='quota-checkpoint:'+week);assert.notEqual(alert.status,'resolved');
 f.ctx.now+=3600000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.quotaCheckpointEvidence.verified=true;
 f.O.scheduledTick(f.state,f.ctx,f.ctx.now);assert.equal(f.state.quotaCheckpoints[week].status,'ready');assert.equal(alert.status,'resolved');assert.equal(alert.resolvedAt,f.ctx.iso);assert.equal(JSON.stringify(f.state.entitlements),frozen);
});
test('a delayed pre-cutoff tick cannot freeze fallback R for the new checkpoint',()=>{
 const f=setup();previous(f);Object.assign(f.ctx,{quotaCheckpointDue:true});
 f.ctx.quotaCheckpointEvidence.week='2026-10-26';f.ctx.quotaCheckpointEvidence.cutoff-=7*86400000;
 const stale=A.captureQuotaCheckpoint(f.state,f.ctx);assert.equal(stale.status,'pending');assert(!f.state.entitlements.some(row=>row.week===week),'proof for the previous checkpoint cannot freeze the new week');assert.equal(A.quotaCheckpointDue(f.state,f.ctx),true,'the correct Sunday tick can retry immediately');
 f.ctx.quotaCheckpointEvidence.week=week;f.ctx.quotaCheckpointEvidence.cutoff=Date.parse('2026-11-01T16:00:00+08:00');
 const fresh=A.captureQuotaCheckpoint(f.state,f.ctx);assert.equal(fresh.status,'ready');assert(f.state.entitlements.filter(row=>row.week===week).every(row=>row.quota===5));
});
test('the first Monday allocation attempt stops hourly source retries without inventing quota',()=>{
 const f=setup('2026-11-02T05:30:00+08:00');f.ctx.quotaCheckpointEvidence.verified=false;
 const r=A.captureQuotaCheckpoint(f.state,f.ctx);assert.equal(r.status,'pending');assert.equal(r.retryStopped,true);assert.equal(f.state.entitlements.length,0);
 f.ctx.quotaCheckpointEvidence.verified=true;f.ctx.now+=3600000;f.ctx.iso=new Date(f.ctx.now).toISOString();
 const late=A.captureQuotaCheckpoint(f.state,f.ctx);assert.equal(late.retryStopped,true);assert.equal(f.state.entitlements.length,0,'a later source cannot backfill the stopped week');
});
test('a ready week never adopts a second publication, including a later matching row',()=>{
 const f=setup();A.captureQuotaCheckpoint(f.state,f.ctx);const frozen=JSON.stringify(f.state.entitlements);
 f.ctx.quotaCheckpointEvidence.source={...f.ctx.quotaCheckpointEvidence.source,revision:4,commit:'later'};f.ctx.quotaCheckpointEvidence.rows.forEach(row=>row.R=12);
 A.captureQuotaCheckpoint(f.state,f.ctx);assert.equal(JSON.stringify(f.state.entitlements),frozen);
});
test('new snapshot R cannot bypass current inactive status and workload caps',()=>{
 const f=setup();A.captureQuotaCheckpoint(f.state,f.ctx);f.people.find(p=>p.id==='bob').active=false;
 const charlie=f.teachers.find(t=>t.staffId==='charlie');Object.assign(charlie,{capConfigured:true,capVerified:true,periodCap:0,capBasis:'teaching',capHeadroom:0});
 const teachers=A.teacherContext(f.state,f.ctx,week);assert.equal(A.eligibility(teachers.get('bob'),0).autoEligible,false);assert.equal(A.eligibility(teachers.get('charlie'),0).autoEligible,false);
});
test('ordinary reads do not postpone the hourly retry by advancing its checkpoint time',()=>{
 const f=setup();f.ctx.quotaCheckpointEvidence.verified=false;A.captureQuotaCheckpoint(f.state,f.ctx);const at=f.state.quotaCheckpoints[week].at;
 f.ctx.quotaCheckpointDue=false;f.ctx.now+=600000;f.ctx.iso=new Date(f.ctx.now).toISOString();A.captureWeek(f.state,f.ctx,week);
 assert.equal(f.state.quotaCheckpoints[week].at,at);
});
test('null R for an excluded snapshot person does not invalidate the eligible cohort',()=>{
 const f=setup();f.people.find(p=>p.id==='bob').active=false;f.ctx.quotaCheckpointEvidence.rows.find(row=>row.id==='bob').R=null;
 const r=A.captureQuotaCheckpoint(f.state,f.ctx);assert.equal(r.status,'ready');assert.equal(f.state.entitlements.length,3);
});
