import assert from 'node:assert/strict';
import {inspectCapacity, defaultPolicy, runEngine} from '../v1/allocator/index.mjs';
import {forecastCapacity} from '../v1/services/roster/capacity.mjs';
import {createDatabase} from './v1-product/helpers.mjs';
import {query} from '../v1/runtime/store.mjs';
import fixture from './roster701-fixture.cjs';
const now=Date.parse('2026-10-14T06:00:00+08:00');
const person={staffId:'bob',active:true,eo:true,hasBaseline:true,employment:'Full-time',available:[2,3,4],occupied:[],weekly:{quality:'verified',remaining:1}};
const snapshot={schemaVersion:1,schoolId:'s',runId:'capacity',date:'2026-10-14',observedAt:now,inputDigest:'synthetic',staff:[person],assignments:[],demands:[{id:'d2',period:2,subject:'EL',lessonId:'l2'},{id:'d3',period:3,subject:'EL',lessonId:'l3'}],absences:[],peerReservations:[],startedPeriods:[]};
const policy=defaultPolicy();
assert.equal(inspectCapacity(snapshot,policy,[2,3,4]).periods.filter(p=>p.green.length).length,3);
assert.equal(runEngine(snapshot,policy,{mode:'fill-only'}).assignments.length,1,'three choices share only one R');
const spent={...snapshot,assignments:[{id:'saved',demandId:'d2',staffId:'bob',period:2,subject:'EL',lessonId:'l2',status:'published',charge:1}]};
assert.equal(inspectCapacity(spent,policy,[3]).periods[0].green.length,0);
const limited=structuredClone(policy);limited.layers[2].maxRelief=1;
const higherR={...spent,staff:[{...person,weekly:{quality:'verified',remaining:4}}]};
assert.equal(inspectCapacity(higherR,limited,[3]).periods[0].green.length,0,'actual v1 daily layer applies');
assert.equal(runEngine(higherR,limited,{mode:'fill-only'}).assignments.length,0);
for(const [field,extra,reason] of [
 ['staff',[{...person,weekly:{quality:'unavailable',remaining:null}}],'quota-unverified'],
 ['absences',[{staffId:'bob',periods:[3]}],'absent'],
 ['peerReservations',[{staffId:'bob',periods:[3],status:'pending'}],'peer-reserved'],
 ['startedPeriods',[3],'started']]) {
 const result=inspectCapacity({...snapshot,[field]:extra},policy,[3]);
 assert.equal(result.periods[0].green.length,0);assert.equal(result.periods[0].exclusions[reason],1);
}
assert.equal(inspectCapacity({...snapshot,staff:[{...person,weekly:{quality:'unavailable',remaining:null}}]},policy,[3]).verified,false);
assert.throws(()=>inspectCapacity(snapshot,policy,[3,3]));
assert.deepEqual(snapshot.assignments,[]);
const h=await createDatabase('roster');
try {
 const f=fixture(), c=f.ctx, state=f.state, date=f.date, next='2026-10-15';
 c.now=now;c.iso=new Date(now).toISOString();c.days[next]=structuredClone(c.days[date]);
 c.people=c.people.slice(0,2).map(p=>({...p,staffId:p.id,eo:true,employment:'Full-time',employmentTags:[],adhocEligible:false,role:'Teacher'}));
 for(const day of Object.values(c.days)) day.teachers=day.teachers.filter(t=>c.people.some(p=>p.id===t.staffId));
 c.publication={publicationId:'pub',publicationSequence:1,calculationVersion:'v1',rows:c.people.map(p=>({staffId:p.id,quality:'verified',budget:1,Wi:0,factor:1}))};
 c.dependencies=[];c.effectiveCaps={};c.calendarByDate=Object.fromEntries([date,next].map(d=>[d,{schoolDay:true,available:true}]));
 for(const d of [date,next]) f.O.apply(state,c,{operation:'saveAbsence',date:d,staffId:'alice',typeId:'mc',periods:[2,3]});
 const original=structuredClone(state), loaded={state,accountingRevisions:{}}, ctx={env:{DB:h.db},principal:{schoolId:'s'},now};
 const before=await query(h.db,'SELECT COUNT(*) n FROM roster_weekly');
 const result=await forecastCapacity(ctx,loaded,c,[date,next],0);
 assert.equal(result.days[0].state,'projected');
 assert.equal(result.days.reduce((n,d)=>n+d.planned,0),1,'one R shared by all forecast dates');
 assert.equal(result.days[1].planned,0,'earlier simulation consumes later headroom');
 assert.deepEqual(state,original,'forecast never mutates saved assignments or ledgers');
 assert.deepEqual(await query(h.db,'SELECT COUNT(*) n FROM roster_weekly'),before,'forecast never captures quota writes');
 assert.equal(result.optimalityProven,false);
 const missing={...c,days:structuredClone(c.days)};delete missing.days[date];
 const unknown=await forecastCapacity(ctx,loaded,missing,[date,next],0);
 assert.equal(unknown.state,'incomplete');assert.equal(unknown.days[1].state,'not-verified');
 await assert.rejects(()=>forecastCapacity(ctx,loaded,c,[date,'2026-10-19'],0));
 console.log('PASS layered capacity, non-additive R, strict limits and negative eligibility; actual owner D1 scratch-week forecast, no persisted quota/assignment writes, unknown earlier-day propagation');
} finally {await h.close();}
