'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),vm=require('node:vm');
const Rules=require('../shared/teaching-rules'),W=require('../shared/workload'),R=require('../shared/relief'),S=require('../shared/roster-stapler'),A=require('../shared/roster-allocation'),Roster=require('../shared/roster'),fixture=require('./roster701-fixture.cjs');
function document(tag='UT',cap=26){
 const teacher={id:'ut',name:'Kavitha',active:true,profile:{Role:'Teacher','Employment Modifier':tag}},offload=Rules.migrate(null);
 offload.tags.find(r=>r.match===tag).periods=cap;
 return {id:'published',from:'2026-01-01',to:'2026-12-31',teachers:[teacher],offload,relief:{...R.defaults(),siuePercent:0},loads:{1:{EL:18,Assembly:1,FTGP:1,FTT:2}},classes:[{ref:'c1',level:'1',shortName:'A'}],groups:[],assignments:['EL','FT'].map(subject=>({id:subject,teacher:'ut',target:'1A',targetRef:'c1',subject})),organisations:{plt:[{id:'pd',slots:['ut']}]},duties:[{id:'duty',days:['Mon'],teachers:{Mon:'ut'}}],workload:{categories:{},specialists:[],nonTeachingActivities:[{id:'imp',code:'IMP',name:'Programme',weeklyPeriods:1,teachers:['ut']}]} };
}
function calculate(d){const w=W.analyse(d,t=>Rules.calculate(t,d.offload));return {workload:w.rows[0],relief:R.analyse(d,w).rows[0]};}
const cells=(n,subject='EL')=>Array.from({length:n},()=>[subject,subject==='EL'?'1A':'','','']);
function backend(){const scope=vm.createContext({GSISRosterStapler:S,GSISTeachingRules:Rules,GSISWorkload:W,GSISRelief:R,GSISRosterAllocation:A,GSISRoster:Roster});for(const name of ['RosterOperations','Relief'])vm.runInContext(fs.readFileSync('backend/'+name+'.gs','utf8'),scope);return scope;}

test('UT actual 26 consumes the saved cap of 26 and exports zero relief',()=>{
 const d=document(),before=JSON.stringify(d),{workload:w,relief:r}=calculate(d);
 assert.equal(w.total,26);assert.equal(r.quota,0);assert.equal(w.capUsed,26);assert.equal(w.capBasis,'total');assert.equal(r.capBasis,'total');assert.equal(r.capWorkload,26);assert.equal(r.capHeadroom,0);assert.deepEqual(r.capNonTeachingPeriods,{IMP:1,PD:2,DUTY:1});
 const b=backend(),exported=b.reliefResultRows_({rows:[r],calculationVersion:R.model},true)[0];assert.equal(exported.R,0);assert.equal(exported.breakdown.capWorkload,26);assert.equal(exported.breakdown.capBasis,'total');
 const entry={id:d.id,revision:1,commit:'saved'},idx={revision:1,versions:[entry]};b.hash_=JSON.stringify;b.index_=()=>idx;b.reliefConfirmed_=()=>({source:d,result:b.reliefAnalysis_(d)});
 const wire=b.reliefRosterQuota_({getId:()=> 'test'},idx,entry).rows[0];assert.equal(wire.R,0);assert.equal(wire.capWorkload,26);assert.equal(wire.capBasis,'total');assert.deepEqual(JSON.parse(JSON.stringify(wire.capNonTeachingPeriods)),r.capNonTeachingPeriods);assert.equal(JSON.stringify(d),before);
 b.reliefConfirmed_=()=>({source:d,result:{...b.reliefAnalysis_(d),rows:[{...r,quota:null,reason:'Workload data is incomplete.'}]}});const unverified=b.reliefRosterQuota_({getId:()=> 'test'},idx,entry).rows[0];assert.equal(unverified.periodCap,26);assert.equal(unverified.capVerified,false);assert.equal(unverified.capVerificationReason,'Workload data is incomplete.');
});
test('UT uses the saved numeric cap and includes every workload component once',()=>{
 const d=document('UT',28);let {relief:r}=calculate(d);assert.equal(r.quota,2);assert.equal(r.capWorkload,26);
 d.offload.tags.find(r=>r.match==='UT').periods=24;assert.equal(calculate(d).relief.quota,0);
 d.loads[1].EL=17.5;d.offload.tags.find(r=>r.match==='UT').periods=26;assert.equal(calculate(d).relief.capHeadroom,.5);assert.equal(calculate(d).relief.quota,0);
 d.workload.nonTeachingActivities[0].weeklyPeriods=60;r=calculate(d).relief;assert.equal(r.quota,0);assert.equal(r.capWorkload,84.5);
});
test('BT and custom non-UT caps retain their teaching basis',()=>{
 const {workload:w,relief:r}=calculate(document('BT'));assert.equal(w.total,26);assert.equal(w.capUsed,22);assert.equal(r.capBasis,'teaching');assert.equal(r.capWorkload,22);assert.equal(r.quota,4);
 const d=document();d.offload.tags=d.offload.tags.filter(r=>r.match!=='UT');assert.equal(calculate(d).relief.periodCap,null);assert.equal(calculate(d).relief.capBasis,'teaching');
});
test('Selected week preserves Deploy-only duties and counts the same printed activity once',()=>{
 const reservations={PD:2,DUTY:1,IMP:1},categories={IMP:'Non-teaching'};
 assert.equal(S.capWorkload(cells(22),categories,'total',reservations),26,'unprinted weekly duties remain reserved');
 assert.equal(S.capWorkload([...cells(22),...cells(2,'PD (P5 EL)'),...cells(1,'DUTY'),...cells(1,'IMP')],categories,'total',reservations),26,'same duties printed in baseline are not counted twice');
 assert.equal(S.capWorkload([...cells(22),...cells(3,'TTT')],categories,'total',reservations),27,'extra printed PD counts above the reservation');
 assert.equal(S.capWorkload([...cells(22),...cells(2,'PD'),...cells(3,'BLK')],categories,'teaching',reservations),22);
 assert.equal(S.capWorkload(cells(22),categories,'total',{PD:NaN}),null);assert.equal(S.capWorkload(cells(22),categories,'total',{PD:-1}),null);
});
test('Roster preserves published R while validating Odd/Even weeks and old wire data',()=>{
 const b=backend(),r=calculate(document('UT',30)).relief,row={R:r.quota,periodCap:r.periodCap,capConfigured:true,capVerified:true,capBasis:r.capBasis,capNonTeachingPeriods:r.capNonTeachingPeriods};
 const teacher=c=>b.rosterOperationsQuotaTeacher_({staffId:'ut'},row,c,{IMP:'Non-teaching'},{});
 const week=n=>({days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:[{name:'Kavitha',cells:[...cells(n),...Array.from({length:85-n},()=>['','','',''])]}]}),model=Roster.validate({layoutMode:'odd-even',odd:week(20),even:week(28),timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]}),entries=[{id:'baseline',from:'2026-01-01',to:'2026-12-31',priority:1}];b.rosterModel_=()=>model;
 const selected=parity=>teacher(b.rosterOperationsWeekCells_('2026-10-14','Kavitha',entries,{},parity));assert.equal(selected('odd').capWorkload,24);assert.equal(selected('odd').capHeadroom,6);assert.equal(selected('even').capWorkload,32);assert.equal(selected('even').capHeadroom,0);assert.equal(selected('even').R,4);
 delete row.capBasis;assert.equal(teacher(cells(20)).capVerified,false,'old cap semantics cannot silently bypass a UT cap');row.capBasis='total';delete row.capNonTeachingPeriods;assert.equal(teacher(cells(20)).capVerified,false);
});
function suspended(subject,transfer=false){
 const f=fixture();f.ctx.baselineDays=f.ctx.days;f.teachers[0].cells[2]=['PD','','',''];
 Object.assign(f.teachers[0],{periodCap:30,capConfigured:true,capBasis:'total',capWorkload:26,capHeadroom:4,capVerified:true});Object.assign(f.teachers[1],{periodCap:30,capConfigured:true,capBasis:'total',capWorkload:24,capHeadroom:6,capVerified:true});
 let p=S.create({...f.ctx.days[f.date],date:f.date});const tile=p.tiles.find(t=>t.teacherId==='alice'&&t.period===2);
 p=S.apply(p,transfer?{type:'move',tileId:tile.id,teacherId:'bob',period:2}:subject?{type:'edit',tileId:tile.id,patch:{subject}}:{type:'pit',tileId:tile.id});
 f.state.staplerPlans.push({date:f.date,baselineId:p.baselineId,revision:1,confirmed:true,confirmedAt:f.ctx.iso,updatedAt:f.ctx.iso,draft:p});return {...f,plan:p};
}
test('Confirmed suspended UT needs verified weekly evidence while transferred relief history is charged only once',()=>{
 const removed=suspended(),out=removed.O.composeStaplerContext(removed.state,removed.ctx);assert.equal(out.days[removed.date].teachers[0].capWorkload,26);assert.equal(out.days[removed.date].workloadIgnored,true);
 const moved=suspended('',true),account=S.accounting(moved.plan).find(t=>t.staffId==='bob');assert.equal(account.totalWorkloadDelta,0);assert.equal(account.reliefCount,1);const effective=moved.O.composeStaplerContext(moved.state,moved.ctx);assert.equal(effective.days[moved.date].teachers[1].capWorkload,24);
 moved.state.importedRelief.push({id:'transfer',staffId:'bob',date:moved.date,period:2,status:'published',rCost:1});const balance=A.balances(moved.state,effective,moved.date).get('bob');assert.equal(balance.weeklyUsed,1);assert.equal(balance.capRemaining,null);assert.equal(balance.capVerified,false,'missing effective weekly evidence excludes automatic UT selection');
 const changed=suspended('DUTY');assert.equal(changed.plan.tiles.find(t=>t.period===2).subject,'DUTY');assert.equal(changed.O.composeStaplerContext(changed.state,changed.ctx).days[changed.date].teachers[0].capWorkload,26);
});
test('An extra confirmed suspended duty does not alter workload limits',()=>{
 const f=suspended('PD'),p=S.apply(f.plan,{type:'addTile',tile:{teacherId:'alice',period:5,subject:'DUTY'}});f.state.staplerPlans[0].draft=p;
 const day=f.O.composeStaplerContext(f.state,f.ctx).days[f.date];assert.equal(day.teachers[0].capWorkload,26);assert.equal(day.workloadIgnored,true);
});
test('Unconfirmed suspended plans do not change the cap',()=>{const f=suspended();f.state.staplerPlans[0].confirmed=false;assert.equal(f.O.composeStaplerContext(f.state,f.ctx).days[f.date].teachers[0].capWorkload,26);});

