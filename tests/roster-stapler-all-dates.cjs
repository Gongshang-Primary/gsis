'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js');
const f=fixture(),date='2026-10-22',draft=S.create({...f.ctx.days[f.date],date});
f.ctx.people[0].adhocEligible=true;
f.state.staplerPlans.push({date,name:'PRIVATE draft name',baselineId:'baseline',revision:19,draft});
const teacher={...f.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false}};
let result=f.O.read(f.state,teacher,{operation:'staplerDates'}),row=result.dates.find(r=>r.date===date);
assert(row);assert.equal(row.canListUpcoming,true);assert.equal(row.mayEdit,false);assert.equal(row.mayPublish,false);assert.equal(row.draftRevision,0);assert.doesNotMatch(JSON.stringify(result),/PRIVATE draft name|"tiles"|"baselineId"/);
assert.equal(f.O.read(f.state,teacher,{operation:'stapler',date}).plan,null,'listing cannot disclose or open an unconfirmed plan');
assert.equal(f.O.staplerPermission(f.state,teacher,date),false);
let request=f.O.apply(f.state,teacher,{operation:'requestStapler',date,sponsorId:'alice'});assert.equal(f.state.staplerRequests.length,1);assert.equal(f.O.apply(f.state,teacher,{operation:'requestStapler',date,sponsorId:'alice'}).unchanged,true);assert.equal(f.state.staplerRequests.length,1);
f.O.apply(f.state,f.ctx,{operation:'decideStapler',date,id:request.savedIds[0],decision:'approve'});assert.equal(f.O.staplerPermission(f.state,teacher,date),true);
const inactive=fixture();inactive.state.staplerPlans=f.state.staplerPlans;inactive.ctx.people[1].active=false;assert.equal(inactive.O.read(inactive.state,{...inactive.ctx,user:teacher.user},{operation:'staplerDates'}).dates.length,0);
const unmapped={...inactive.ctx,user:{staffId:'missing',email:'missing@gsps.edu.sg',smc:false,admin:false}};assert.equal(inactive.O.read(inactive.state,unmapped,{operation:'staplerDates'}).dates.length,0);
console.log('PASS upcoming Stapler date metadata, private draft boundary, sponsor request idempotency and approved access');

