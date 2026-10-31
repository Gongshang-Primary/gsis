'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),A=require('../shared/roster-allocation'),fixture=require('./roster701-fixture.cjs');
const week='2026-11-02',publishedAt='2026-10-30T08:00:00Z';
function setup(time='2026-11-01T16:00:00+08:00'){
 const f=fixture(),now=Date.parse(time),sg=new Date(now+8*3600000).toISOString();
 Object.assign(f.ctx,{now,iso:new Date(now).toISOString(),today:sg.slice(0,10),minute:Number(sg.slice(11,13))*60+Number(sg.slice(14,16)),quotaRequested:true});
 f.ctx.days={};f.teachers.forEach(t=>{t.R=5;t.cells=f.blank();});
 for(let n=0;n<5;n++)f.ctx.days[A.addDays(week,n)]={id:'baseline',parity:'odd',schoolDay:true,verified:true,periods:[{period:0}],teachers:f.teachers,quotaSource:{weeklyCheckpoint:true,publishedAt,versionId:'v1',commit:'one'}};
 return f;
}
test('Sunday checkpoint advances at 16:00 Singapore and never during Saturday',()=>{
 assert.equal(A.quotaCheckpoint(setup('2026-11-01T15:59:59+08:00').ctx).week,'2026-10-26');
 assert.equal(A.quotaCheckpoint(setup().ctx).week,week);
 assert.equal(A.quotaCheckpoint(setup('2026-10-31T17:00:00+08:00').ctx).week,'2026-10-26');
 assert.equal(A.quotaCheckpoint(setup().ctx).cutoff,Date.parse('2026-11-01T16:00:00+08:00'));
});
test('checkpoint credits one week once and freezes allocation R after a later publication',()=>{
 const f=setup();assert.equal(A.captureQuotaCheckpoint(f.state,f.ctx).status,'ready');assert.equal(f.state.entitlements.length,4);
 const before=JSON.stringify(f.state.entitlements);assert.equal(A.captureQuotaCheckpoint(f.state,f.ctx).captured,0);assert.equal(JSON.stringify(f.state.entitlements),before);
 const w=setup('2026-11-04T09:00:00+08:00');f.ctx={...w.ctx,people:f.people};f.teachers.forEach(t=>t.R=3);
 assert.equal(A.weekQuota(f.state,f.ctx,'bob','2026-11-04').quota,5);
 A.captureWeek(f.state,f.ctx,'2026-11-04');assert.equal(JSON.stringify(f.state.entitlements),before);
});
test('holiday Monday uses a verified Tuesday, while an entirely closed week earns no quota',()=>{
 const f=setup();f.ctx.days[week].schoolDay=false;assert.equal(A.captureQuotaCheckpoint(f.state,f.ctx).captured,4);
 const g=setup();for(const day of Object.values(g.ctx.days))day.schoolDay=false;
 const result=A.captureQuotaCheckpoint(g.state,g.ctx);assert.equal(result.status,'ready');assert.equal(result.excluded,true);assert.equal(g.state.entitlements.length,0);
});
test('missing Calendar proof stays pending and is retried',()=>{
 const f=setup();for(const day of Object.values(f.ctx.days))day.verified=false;
 assert.equal(A.captureQuotaCheckpoint(f.state,f.ctx).status,'pending');assert.equal(f.state.entitlements.length,0);
 f.ctx.days['2026-11-03'].verified=true;assert.equal(A.captureQuotaCheckpoint(f.state,f.ctx).status,'ready');assert.equal(f.state.entitlements.length,4);
});
test('post-cutoff source retains each prior verified R and reports the fallback',()=>{
 const f=setup();f.state.entitlements=f.people.map(p=>({staffId:p.id,week:'2026-10-26',year:'2026',quota:7,mode:'observed',source:{versionId:'old'}}));
 for(const day of Object.values(f.ctx.days))day.quotaSource.publishedAt='2026-11-01T16:01:00+08:00';
 const r=A.captureQuotaCheckpoint(f.state,f.ctx);assert.equal(r.status,'ready');assert.equal(r.fallback,4);
 assert.equal(A.weekQuota(f.state,f.ctx,'bob',week).quota,7);assert.match(f.state.entitlements.find(x=>x.staffId==='bob'&&x.week===week).fallbackReason,/cutoff|publication/i);
});
test('no pre-cutoff source or prior R remains unknown instead of silently using new R',()=>{
 const f=setup();for(const day of Object.values(f.ctx.days))day.quotaSource.publishedAt='2026-11-01T16:01:00+08:00';
 assert.equal(A.captureQuotaCheckpoint(f.state,f.ctx).status,'pending');assert.equal(f.state.entitlements.length,0);
 assert.equal(A.weekQuota(f.state,f.ctx,'bob',week).quota,null);
});
test('Sunday credit changes cumulative totals and FAJT cohort arithmetic together',()=>{
 const f=setup();f.people[1].employment='FAJT';f.state.accountingYears['2026']={verified:true};
 f.state.entitlements=f.people.map(p=>({staffId:p.id,week:'2026-10-26',year:'2026',quota:5,mode:'observed'}));
 f.state.importedRelief=[{id:'completed',staffId:'bob',date:'2026-10-26',period:1,status:'completed',rCost:4}];
 A.captureQuotaCheckpoint(f.state,f.ctx);const balances=A.balances(f.state,f.ctx,week);
 assert.equal(A.annual(f.state,f.ctx,'bob').entitlement,10);assert.equal(balances.get('bob').entitlement,10);assert.equal(balances.get('bob').utilisation,40);
 const teachers=f.teachers.map(t=>({id:t.staffId,person:f.people.find(p=>p.id===t.staffId),t,balance:balances.get(t.staffId)}));
 assert.equal(A.fajtStatus(teachers,{allocationRuleEnabled:{fajtLevelling:true}}).fajtMean,40);
});
test('checkpoint preserves extended leave, service dates and daily SRE exclusions',()=>{
 const f=setup();f.people[1].employment='SRE';
 for(const day of Object.values(f.ctx.days))day.deployTeachingEvidence={verified:true,rows:[]};
 f.state.accountingProfiles.charlie={from:'2026-11-09'};
 f.state.absences=Array.from({length:5},(_,n)=>({id:'leave'+n,staffId:'alice',date:A.addDays(week,n),typeId:'npl',coverage:{kind:'fullDay'}}));
 A.captureQuotaCheckpoint(f.state,f.ctx);assert.equal(f.state.entitlements.some(x=>x.staffId==='bob'),false);assert.equal(f.state.entitlements.some(x=>x.staffId==='charlie'),false);
 assert.equal(f.state.entitlements.find(x=>x.staffId==='alice').excluded,true);assert.equal(f.state.entitlements.find(x=>x.staffId==='dora').quota,5);
});
test('legacy fixtures retain live planning R and ordinary capture cannot backfill',()=>{
 const f=fixture();f.ctx.quotaRequested=true;f.state.entitlements=[{staffId:'bob',week:A.monday(f.date),year:'2026',quota:9,mode:'observed'}];
 assert.equal(A.weekQuota(f.state,f.ctx,'bob',f.date).quota,4);
 assert.equal(A.captureWeek(f.state,f.ctx,'2026-10-07'),false);
});
test('existing observed quota becomes the frozen planning R under checkpoint semantics',()=>{
 const f=setup('2026-11-04T09:00:00+08:00');f.state.entitlements=[{staffId:'bob',week,year:'2026',quota:9,mode:'observed'}];
 assert.equal(A.weekQuota(f.state,f.ctx,'bob','2026-11-04').quota,9);
 A.captureQuotaCheckpoint(f.state,f.ctx);assert.equal(f.state.entitlements.find(r=>r.staffId==='bob').quota,9);
});
test('the following Sunday captures the newer R without changing the previous week',()=>{
 const f=setup();A.captureQuotaCheckpoint(f.state,f.ctx);
 const g=setup('2026-11-08T16:00:00+08:00');g.ctx.days=Object.fromEntries(Object.entries(g.ctx.days).map(([d,day])=>[A.addDays(d,7),{...day,quotaSource:{...day.quotaSource,publishedAt:'2026-11-04T10:00:00+08:00'}}]));
 g.teachers.forEach(t=>t.R=3);A.captureQuotaCheckpoint(f.state,g.ctx);
 assert.equal(A.weekQuota(f.state,g.ctx,'bob','2026-11-09').quota,3);
 assert.equal(f.state.entitlements.find(r=>r.staffId==='bob'&&r.week===week).quota,5);
});
test('empty verified timetable remains pending, rather than claiming the week is captured',()=>{
 const f=setup();for(const day of Object.values(f.ctx.days))day.teachers=[];
 assert.equal(A.captureQuotaCheckpoint(f.state,f.ctx).status,'pending');assert.equal(f.state.entitlements.length,0);
});
test('ready checkpoint updates current-week leave applicability without changing R or adding later teachers',()=>{
 const f=setup();A.captureQuotaCheckpoint(f.state,f.ctx);const count=f.state.entitlements.length;
 const g=setup('2026-11-03T09:00:00+08:00');f.ctx=g.ctx;f.people=f.ctx.people;
 f.state.absences=Array.from({length:5},(_,n)=>({id:'later-leave'+n,staffId:'alice',date:A.addDays(week,n),typeId:'npl',coverage:{kind:'fullDay'}}));
 f.ctx.days[week].teachers.find(t=>t.staffId==='alice').R=null;
 f.ctx.people.push({id:'later',name:'Later',active:true});for(const day of Object.values(f.ctx.days))day.teachers.push({staffId:'later',cells:[],R:8});
 const r=A.captureQuotaCheckpoint(f.state,f.ctx);assert.equal(r.captured,0);assert.equal(f.state.entitlements.length,count);
 const row=f.state.entitlements.find(r=>r.staffId==='alice');assert.equal(row.quota,5);assert.equal(row.excluded,true);
 f.state.absences=[];A.captureQuotaCheckpoint(f.state,f.ctx);assert.equal(row.excluded,false);
});
test('malformed checkpoint records fail closed instead of erasing durable checkpoint state',()=>{
 for(const value of [[],null,'bad',{bad:{status:'ready'}}]){
  const f=setup();f.state.quotaCheckpoints=value;assert.throws(()=>A.ensure(f.state),e=>e.status===503);
 }
});
test('a school week across New Year captures and freezes both accounting years under one receipt',()=>{
 const f=setup('2026-12-27T16:00:00+08:00'),cross='2026-12-28';
 f.ctx.days=Object.fromEntries(Array.from({length:5},(_,n)=>[A.addDays(cross,n),{id:'baseline',parity:'odd',verified:true,schoolDay:true,periods:[{period:0}],teachers:f.teachers,quotaSource:{weeklyCheckpoint:true,publishedAt:'2026-12-01T00:00:00Z'}}]));
 const result=A.captureQuotaCheckpoint(f.state,f.ctx);assert.equal(result.status,'ready');assert.equal(Object.keys(f.state.quotaCheckpoints).length,1);
 assert.equal(f.state.entitlements.filter(r=>r.year==='2026').length,4);assert.equal(f.state.entitlements.filter(r=>r.year==='2027').length,4);
 assert.equal(f.state.accountingYears['2027'].verified,true);
 f.ctx.today='2027-01-01';f.ctx.now=Date.parse('2027-01-01T08:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.teachers.forEach(t=>t.R=3);
 assert.equal(A.weekQuota(f.state,f.ctx,'bob','2027-01-01').quota,5);assert.equal(A.balances(f.state,f.ctx,'2027-01-01').get('bob').entitlement,5);
});
test('a cross-year week stays pending until Calendar resolves the next year',()=>{
 const f=setup('2026-12-27T16:00:00+08:00'),cross='2026-12-28';
 f.ctx.days=Object.fromEntries(Array.from({length:4},(_,n)=>[A.addDays(cross,n),{id:'baseline',parity:'odd',verified:true,schoolDay:true,periods:[{period:0}],teachers:f.teachers,quotaSource:{weeklyCheckpoint:true,publishedAt:'2026-12-01T00:00:00Z'}}]));
 assert.equal(A.captureQuotaCheckpoint(f.state,f.ctx).status,'pending');
 assert.equal(f.state.entitlements.length,0);
});
test('frozen positive R does not revive an inactive teacher or bypass a stricter current cap',()=>{
 const f=setup();A.captureQuotaCheckpoint(f.state,f.ctx);f.people[1].active=false;
 const charlie=f.teachers.find(t=>t.staffId==='charlie');Object.assign(charlie,{periodCap:0,capConfigured:true,capBasis:'teaching',capVerified:true,capHeadroom:0});
 const teachers=A.teacherContext(f.state,f.ctx,week),bob=teachers.get('bob'),c=teachers.get('charlie');
 assert.equal(bob.balance.R,5);assert.equal(A.eligibility(bob,0).autoEligible,false);
 assert.equal(c.balance.R,5);assert.equal(c.balance.capRemaining,0);assert.equal(A.eligibility(c,0).autoEligible,false);
});
