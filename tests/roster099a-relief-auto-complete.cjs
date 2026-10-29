'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const A=require('../shared/roster-allocation.js'),O=require('../shared/roster-operations.js'),fixture=require('./roster701-fixture.cjs');
const today='2026-10-30',now=Date.parse(today+'T09:00:00+08:00');
function setup(){
 const f=fixture(),day=f.ctx.days[f.date];
 Object.assign(f.ctx,{today,now,iso:new Date(now).toISOString(),minute:540,days:{[today]:day}});
 f.state.accountingYears['2026']={verified:true,mode:'zero-start',at:'2026-10-18T00:00:00+08:00'};
 f.state.entitlements=f.people.map(p=>({staffId:p.id,year:'2026',week:'2026-10-26',quota:4}));
 f.state.dailyPublicationStates={[today]:{periods:day.periods}};
 return f;
}
const row=(id,extra={})=>({id,date:today,period:3,timeEnd:'09:00',staffId:'bob',status:'published',origin:'smc',rCost:1,...extra});
test('ended published relief moves from committed to completed without changing spent or stored records',()=>{
 const f=setup();f.state.assignments=[row('ended'),row('next',{period:4,timeEnd:'09:30'}),row('draft',{period:2,status:'draft'})];
 const stored=JSON.stringify(f.state),before=A.annual(f.state,{...f.ctx,minute:539},'bob'),after=A.annual(f.state,f.ctx,'bob');
 assert.equal(before.completed,0);assert.equal(before.committed,3);
 assert.equal(after.completed,1);assert.equal(after.committed,2);assert.equal(after.spent,3);assert.equal(after.utilisation,75);
 const balance=A.balances(f.state,f.ctx,today).get('bob');
 assert.equal(balance.completed,1);assert.equal(balance.committed,2);assert.equal(balance.spent,3);assert.equal(balance.weeklyUsed,3);assert.equal(balance.remaining,1);
 assert.equal(JSON.stringify(f.state),stored,'classification is a read, not a record or notification mutation');
});
test('SMC corrections and exclusions override inferred completion',()=>{
 const f=setup();f.state.assignments=[row('not-done'),row('in-progress'),row('transferred'),row('cancelled',{status:'cancelled'}),row('removed',{remove:true}),row('none',{noRelief:true}),row('combine',{combination:true}),row('duty',{repurposedDuty:true}),row('replaced'),row('replacement',{staffId:'dora',replaces:'replaced'}),row('duplicate')];
 f.state.importedRelief=[row('duplicate'),row('imported',{date:'2026-10-29',status:'completed',origin:'imported',rCost:2})];
 f.state.reliefCorrections=[{assignmentId:'not-done',sequence:1,actual:{completionStatus:'not-completed'}},{assignmentId:'in-progress',sequence:2,actual:{completionStatus:'in-progress'}},{assignmentId:'transferred',sequence:3,actual:{staffId:'dora',date:today,period:2,completionStatus:'completed'}}];
 const bob=A.annual(f.state,f.ctx,'bob'),dora=A.annual(f.state,f.ctx,'dora');
 assert.equal(bob.completed,3);assert.equal(bob.committed,1);assert.equal(bob.spent,4);
 assert.equal(dora.completed,2);assert.equal(dora.spent,2);
});
test('automatic completion uses trusted date and period end, and retains unknown or future work as committed',()=>{
 const f=setup();f.state.assignments=[row('past',{date:'2026-10-29',timeEnd:''}),row('future',{date:'2026-11-02'}),row('unknown',{period:39,timeEnd:''})];
 const before=A.annual(f.state,f.ctx,'bob');assert.equal(before.completed,1);assert.equal(before.committed,2);
 const late={...f.ctx,today:'2026-10-31',minute:0,days:{}};
 assert.equal(A.annual(f.state,late,'bob').completed,2);
});
test('the existing SMC correction operation reverses and transfers inferred completion without rewriting publication',()=>{
 const f=setup();f.state.assignments=[row('actual')];
 assert.equal(A.annual(f.state,f.ctx,'bob').completed,1);
 O.apply(f.state,f.ctx,{operation:'correctRelief',id:'actual',completionStatus:'not-completed'});
 assert.equal(A.annual(f.state,f.ctx,'bob').spent,0);
 O.apply(f.state,f.ctx,{operation:'correctRelief',id:'actual',staffId:'dora',completionStatus:'completed'});
 assert.equal(A.annual(f.state,f.ctx,'dora').completed,1);assert.equal(A.annual(f.state,f.ctx,'bob').spent,0);
 assert.equal(f.state.assignments[0].staffId,'bob');assert.equal(f.state.assignments[0].status,'published');assert.equal(f.state.outbox.length,0);
});
test('Google and edge personal calculations count the same ended published duties and preserve zero-quota uncertainty',()=>{
 const f=setup();f.state.assignments=[row('ended'),row('future',{period:4,timeEnd:'09:30'}),row('held')];
 f.state.reliefCorrections=[{assignmentId:'held',sequence:1,actual:{completionStatus:'in-progress'}}];
 const google=vm.createContext({GSISRosterAllocation:A,Date});
 vm.runInContext(fs.readFileSync('backend/Relief.gs','utf8'),google);
 const edge=vm.createContext({GSISRosterAllocation:A,Date});
 const source=fs.readFileSync('roster-update/public/edge-roster.js','utf8'),start=source.indexOf('function personalCompletion('),end=source.indexOf('\nfunction hasInstructionDraft',start);
 vm.runInContext(source.slice(start,end),edge);
 const read=()=>[google.rosterPersonalCompletion_(f.state,'bob',today,now),edge.personalCompletion(f.state,'bob',today,now)];
 const [g,e]=read();assert.equal(g.completed,1);assert.equal(g.percentage,25);assert.deepEqual(JSON.parse(JSON.stringify(g)),JSON.parse(JSON.stringify(e)));assert.equal(g.startedAt,'2026-10-18T00:00:00+08:00');
 f.state.entitlements.find(r=>r.staffId==='bob').quota=0;
 for(const value of read()){assert.equal(value.completed,1);assert.equal(value.percentage,null);assert.match(value.reason,/No relief quota/);}
});
