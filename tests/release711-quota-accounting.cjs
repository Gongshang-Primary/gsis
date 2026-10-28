const assert=require('node:assert/strict'),W=require('../shared/workload'),R=require('../shared/relief'),Rules=require('../shared/teaching-rules'),A=require('../shared/roster-allocation'),fixture=require('./roster701-fixture.cjs');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const test=(name,run)=>{run();console.log('PASS '+name);};
test('Malformed existing accounting stops reads and writes before any records are discarded',()=>{
 const adapter=require('./roster701-adapter.cjs'),crypto=require('node:crypto');
 const corrupt=[...['entitlements','importedRelief','reliefCorrections'].flatMap(key=>[null,{},'unreadable'].map(value=>({[key]:value}))),... [null,[],{'2026':null},{'2026':{}},{'2026':{verified:'true'}}].map(accountingYears=>({accountingYears}))];
 for(const patch of corrupt){
  const f=fixture();Object.assign(f.state,patch);const before=JSON.stringify(f.state);
  for(const call of [()=>A.ensure(f.state),()=>A.initialiseHistory(f.state,f.ctx,f.date),()=>f.O.read(f.state,f.ctx,{operation:'accounting'}),()=>f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2]}),()=>f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date})]){assert.throws(call,e=>e.status===503&&/accounting/.test(e.message));assert.equal(JSON.stringify(f.state),before);}
  const h=adapter();h.setState(f.state);assert.throws(()=>h.call({operation:'autoAllocate',date:f.date,revision:0,requestId:crypto.randomUUID()}),e=>e.status===503);assert.equal(h.calls.writes,0);assert.deepEqual(h.state(),f.state);assert.equal(h.locked(),false);
 }
 const legacy=fixture();for(const key of ['entitlements','importedRelief','reliefCorrections','accountingYears'])delete legacy.state[key];A.ensure(legacy.state);assert.equal(A.initialiseHistory(legacy.state,legacy.ctx,legacy.date),true);assert.equal(legacy.state.accountingYears['2026'].mode,'zero-start');
});
test('Deploy includes each captured period once and weights only teaching plus offload allowance',()=>{
 const doc={relief:R.defaults(),teachers:[{id:'a',name:'Alpha',active:true,profile:{Role:'HOD ICT','EO Appt Level':'HOD'}},{id:'b',name:'Beta',active:true}],classes:[{ref:'ca',level:'1',shortName:'A'}],groups:[],loads:{1:{Assembly:1,FTGP:2,FTT:2,EL:10,Mentoring:3}},offload:Rules.migrate(null),workload:{categories:{Mentoring:'Non-teaching'},specialists:[],nonTeachingActivities:[{id:'imp',code:'IMP',name:'Instructional mentoring',weeklyPeriods:4,teachers:['a']}]},assignments:[['a','EL'],['a','EL'],['a','FT'],['a','FTT'],['a','Mentoring'],['a','Mentoring'],['b','EL']].map(([teacher,subject])=>({teacher,subject,target:'1A',targetRef:'ca'})),organisations:{plt:[{id:'pd',name:'PLT',slots:['a','a']}]},duties:[{id:'d',days:['Mon','Tue','Tue'],teachers:{Mon:'a',Tue:'a'}}]};
 doc.assignments.push({teacher:'a',subject:'TTT',target:'pd'});
 const calculate=()=>R.analyse(doc,W.analyse(doc,t=>Rules.calculate(t,doc.offload)));
 const before=JSON.stringify(doc),result=calculate(),a=result.byTeacher.a;
 assert.equal(JSON.stringify(doc),before);assert.equal(result.reference.T_avg,10);
 assert.deepEqual([a.actualTeaching,a.FTT,a.pd,a.duties,a.otherNonTeaching],[10,5,2,2,7]);
 near(a.Wi,5+2+2+7+2.5*(10+.3*10));near(a.rawQuota,(84-a.Wi)*5/7);assert.equal(a.quota,25);
 doc.workload.nonTeachingActivities[0].weeklyPeriods=5;near(calculate().byTeacher.a.Wi,a.Wi+1);
 doc.relief.blocks.a=99;const blocked=calculate().byTeacher.a;assert.equal(blocked.remaining,blocked.quota,'legacy block values never deduct quota');
 doc.workload.categories.Mentoring='Unclassified';assert.equal(calculate().byTeacher.a.quota,null,'unknown classification remains unavailable');
});
test('Fresh annual accounting starts at zero without erasing current drafts or observed quota',()=>{
 const f=fixture();assert.equal(A.annual(f.state,f.ctx,'bob').utilisation,0);
 f.state.assignments.push({id:'draft',staffId:'bob',date:f.date,period:1,status:'draft',rCost:1});
 f.state.entitlements.push({staffId:'bob',week:A.monday(f.date),year:'2026',quota:4,mode:'observed'});
 const drafts=JSON.stringify(f.state.assignments),ledger=JSON.stringify(f.state.entitlements);
 assert.equal(A.initialiseHistory(f.state,f.ctx,f.date),true);assert.equal(A.initialiseHistory(f.state,f.ctx,f.date),false);
 assert.equal(f.state.accountingYears['2026'].mode,'zero-start');assert.equal(JSON.stringify(f.state.assignments),drafts);assert.equal(JSON.stringify(f.state.entitlements),ledger);
 const annual=A.annual(f.state,f.ctx,'bob');assert.equal(annual.committed,1);assert.equal(annual.entitlement,4);assert.equal(annual.utilisation,25);
});
test('Current Stapler reservations and cancelled entries cannot recreate the historical verification gate',()=>{
 const f=fixture();f.state.importedRelief=[{id:'stapler-now',staffId:'bob',date:f.date,period:5,status:'published',origin:'stapler',rCost:1},{id:'stapler-future',staffId:'bob',date:A.addDays(f.date,1),period:6,status:'draft',origin:'stapler',rCost:1},{id:'cancelled',staffId:'bob',date:'2026-09-01',status:'cancelled',origin:'imported',rCost:2}];
 assert.equal(A.initialiseHistory(f.state,f.ctx,f.date),true);assert.equal(A.annual(f.state,f.ctx,'bob').committed,2);assert.equal(f.state.importedRelief.length,3);
});
test('Automatic allocation proceeds from an empty annual ledger and records its new commitments',()=>{
 const f=fixture();f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3]});
 const result=f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});
 assert.equal(result.savedIds.length,2);assert.equal(result.paused,undefined);assert.equal(f.state.accountingYears['2026'].mode,'zero-start');
 assert.equal(f.people.reduce((n,p)=>n+A.annual(f.state,f.ctx,p.id).committed,0),2);
});
test('Existing historical records are preserved and unavailable quota is never replaced by zero',()=>{
 const f=fixture();f.state.importedRelief.push({id:'import',staffId:'bob',date:'2026-10-01',status:'completed',rCost:3});
 const history=JSON.stringify(f.state.importedRelief);assert.equal(A.initialiseHistory(f.state,f.ctx,f.date),false);assert.equal(JSON.stringify(f.state.importedRelief),history);
 assert.equal(A.annual(f.state,f.ctx,'bob').completed,3);f.ctx.quotaRequested=true;f.teachers[1].R=null;assert.equal(A.balances(f.state,f.ctx,f.date).get('bob').R,null);
});
test('Roster preserves Deploy R while blocks and employment caps constrain available slots',()=>{
 const f=fixture();f.ctx.quotaRequested=true;Object.assign(f.teachers[1],{R:6,periodCap:26,capConfigured:true,capVerified:true,capHeadroom:1,capWorkload:25});
 f.teachers[1].cells[1]=['BLK','','','Personal'];
 let person=A.teacherContext(f.state,f.ctx,f.date).get('bob');assert.equal(person.balance.R,6);assert.equal(person.balance.remaining,6);
 assert.equal(A.eligibility(person,1).available,false);assert.equal(A.eligibility(person,5).autoEligible,true);
 f.state.assignments.push({id:'allocated',staffId:'bob',date:f.date,period:5,status:'draft',rCost:1});
 person=A.teacherContext(f.state,f.ctx,f.date).get('bob');assert.equal(person.balance.R,6);assert.equal(person.balance.remaining,5);assert.equal(person.balance.capRemaining,0);assert.equal(A.eligibility(person,6).autoEligible,false);
});
test('Indexed accounting respects latest corrections, absences and published relief over Stapler',()=>{
 const f=fixture();f.state.assignments=[{id:'a',staffId:'bob',date:f.date,period:2,status:'completed',rCost:1},{id:'b',staffId:'bob',date:f.date,period:3,status:'cancelled',rCost:1},{id:'cover',staffId:'dora',date:f.date,period:4,status:'published',rCost:1}];
 f.state.reliefCorrections=[{assignmentId:'a',sequence:2,actual:{completionStatus:'not-completed'}},{assignmentId:'a',sequence:1,actual:{completionStatus:'completed'}},{assignmentId:'b',sequence:3,actual:{staffId:'charlie',completionStatus:'completed'}}];
 f.state.importedRelief=[{id:'stapler-absent',origin:'stapler',staffId:'alice',date:f.date,period:5,status:'published',rCost:1},{id:'stapler-covered',origin:'stapler',staffId:'dora',date:f.date,period:4,status:'published',rCost:1},{id:'stapler-retained',origin:'stapler',staffId:'alice',date:f.date,period:6,status:'published',rCost:1}];
 f.state.absences=[{staffId:'alice',date:f.date,periods:[5]}];
 const rows=A.accounted(f.state);assert.deepEqual(rows.map(a=>a.id),['cover','b','stapler-retained']);assert.equal(rows.find(a=>a.id==='b').staffId,'charlie');assert.equal(A.annual(f.state,f.ctx,'bob').spent,0);
});
