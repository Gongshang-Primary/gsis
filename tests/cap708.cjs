'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const Relief=require('../shared/relief.js'),Rules=require('../shared/teaching-rules.js'),A=require('../shared/roster-allocation.js'),S=require('../shared/roster-stapler.js'),Roster=require('../shared/roster.js'),fixture=require('./roster701-fixture.cjs');
const test=(name,run)=>{run();console.log('PASS',name);};
function calculation({cap=null,teaching=18,ftt=4,pd=1,duties=1,other=1,siue=0}={}){
 const teacher={id:'capped',name:'Custom teaching cap',active:true,profile:{}},doc={teachers:[teacher],relief:{...Relief.defaults(),siuePercent:siue},offload:{tags:[]}},row={teacher,active:true,rules:{eligible:true,cap,capBasis:'teaching',matched:[],pending:[]},Teaching:teaching,FTT:ftt,pd,duties,otherNonTeaching:other};
 return Relief.analyse(doc,{rows:[row],totals:{Teaching:teaching},ledger:[]}).byTeacher.capped;
}
test('Configured cap is the lower of normal R and actual FTT plus teaching headroom',()=>{
 assert.equal(calculation().quota,42);const row=calculation({cap:26});assert.equal(row.quota,4);assert.equal(row.normalQuota,42);assert.equal(row.capWorkload,22);assert.equal(row.capHeadroom,4);assert.equal(row.capApplied,true);
 assert.equal(calculation({cap:26,teaching:21}).quota,1);assert.equal(calculation({cap:26,teaching:22}).quota,0);assert.equal(calculation({cap:26,teaching:23}).quota,0);assert.equal(calculation({cap:26.9}).quota,4);
 const normalBinds=calculation({cap:26,pd:50});assert.equal(normalBinds.quota,4);assert.equal(calculation({cap:26,pd:58}).quota,1);
 for(const cap of [NaN,-1,'26',Infinity])assert.equal(calculation({cap}).quota,null);
 assert.equal(calculation({cap:26,teaching:null}).quota,null);assert.equal(calculation({cap:0}).quota,0);
});
test('Normal R includes PD, duties and SIUE while a non-UT teaching cap does not',()=>{
 const a=calculation({cap:26}),b=calculation({cap:26,pd:2,duties:2,other:2,siue:100});assert.equal(a.capWorkload,b.capWorkload);assert.equal(a.capHeadroom,b.capHeadroom);assert(b.rawQuota<a.rawQuota);
 const rules=Rules.migrate(null);rules.tags.push({id:'second-cap',source:'Employment Modifier',match:'UT',periods:24,name:'Lower cap',percent:''});assert.equal(Rules.calculate({id:'ut',active:true,profile:{Role:'Teacher','Employment Modifier':'UT'}},rules).cap,24);
 const old={...Relief.defaults(),calculationVersion:'whole-week-v4'};assert.equal(Relief.settingsFor({relief:old}).calculationVersion,'whole-week-v7');assert.equal(old.calculationVersion,'whole-week-v4');
});
test('Selected week workload classifies FTT and teaching, rejects unknown data',()=>{
 assert.equal(S.capWorkload([['FT','','',''],['EL','1A','',''],['PD (P5 EL)','','',''],['DUTY','','',''],['BLK','','',''],['IMP','','','']],{IMP:'Non-teaching'}),2);
 assert.equal(S.capWorkload([['Unlisted','1A','','']],{}),null);assert.equal(S.capWorkload([['EL','1A','','']],{EL:'Unclassified'}),null);
});
function backend(){
 const f=fixture(),source={versionId:'dep',calculationVersion:'whole-week-v5'},q={from:'2026-01-01',to:'2026-12-31',source,rows:f.people.map(p=>({id:p.id,R:10,rawR:40,timetableFactor:1,teachingWeight:1,offloadFactor:0,fullTimeTeacherCount:4,periodCap:p.id==='bob'?26:null,capConfigured:p.id==='bob',capBasis:'teaching',capVerified:true})),subjectCategories:{EL:'Teaching'},formClasses:[],teachingGroups:[]};
 const week=count=>({days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:f.teachers.map(t=>({name:t.name,cells:Array.from({length:85},(_,i)=>t.staffId==='bob'&&i<count?['EL','GroupX','','']:['','','',''])}))});
 const model=Roster.validate({layoutMode:'odd-even',odd:week(20),even:week(30),timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]}),entries=[{id:'baseline',from:'2026-01-01',to:'2026-12-31',priority:1}],scope=vm.createContext({GSISRosterOperations:f.O,GSISRosterAllocation:A,GSISRoster:Roster,GSISRosterStapler:S,props_:()=>({getProperty:()=>null}),Utilities:{getUuid:crypto.randomUUID,formatDate:(_d,_tz,fmt)=>fmt==='yyyy-MM-dd'?f.date:fmt==='HH'?'06':'00'}});
 vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);scope.rosterIndex_=()=>({entries});scope.rosterModel_=()=>model;scope.rosterOperationsQuota_=()=>q;
 // The signed Contacts directory includes teaching eligibility for every person.
 const contacts={user:{rosterSMC:true,rosterAdmin:true,rosterStaffId:'alice'},rosterPeople:f.people.map(p=>({...p,adhocEligible:true}))};
 return {...f,q,scope,model,entries,context:parity=>scope.rosterOperationsContext_({identity:{email:'alice@gsps.edu.sg'},input:{operation:'read',view:'allocation',date:f.date,calendarByDate:{[f.date]:{date:f.date,schoolDay:true,parity}}}},contacts,f.state)};
}
test('Real backend preserves Deploy R while Odd and Even cap availability is checked independently',()=>{
 const h=backend(),odd=h.context('odd').days[h.date].teachers.find(t=>t.staffId==='bob'),even=h.context('even').days[h.date].teachers.find(t=>t.staffId==='bob');assert.equal(odd.R,10);assert.equal(odd.capWorkload,20);assert.equal(odd.capHeadroom,6);assert.equal(even.R,10);assert.equal(even.capWorkload,30);assert.equal(even.capHeadroom,0);
 h.q.rows.find(t=>t.id==='bob').periodCap=null;const bad=h.context('odd').days[h.date].teachers.find(t=>t.staffId==='bob');assert.equal(bad.R,10);assert.equal(bad.capConfigured,true);assert.equal(bad.capVerified,false);
});
function ready(){const f=fixture();f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.quotaRequested=true;for(const t of f.teachers){Object.assign(t,{rawR:10,R:10,timetableFactor:1,teachingWeight:1,offloadFactor:0,fullTimeTeacherCount:4});for(const cell of t.cells)if(cell[1])cell[1]='GroupX';}f.ctx.baselineDays=f.ctx.days;return f;}
function capTeacher(f,id,used=25){const t=f.teachers.find(t=>t.staffId===id);Object.assign(t,{periodCap:26,capConfigured:true,capWorkload:used,capHeadroom:Math.max(0,26-used),capVerified:true,R:Math.max(0,26-used)});return t;}
function plan(f,changes){let plan=S.create({...f.ctx.days[f.date],date:f.date});plan=changes(plan);f.O.apply(f.state,f.ctx,{operation:'saveStapler',plan,staplerRevision:0});return plan;}
test('Manual assignment cannot override contractual headroom; ordinary R remains overridable',()=>{
 const f=ready();capTeacher(f,'bob');f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3]});const ds=f.O.demand(f.ctx,f.state,f.date);f.O.apply(f.state,f.ctx,{operation:'assign',demandIds:[ds[0].id],staffId:'bob'});
 assert.equal(A.balances(f.state,f.ctx,f.date).get('bob').capRemaining,0);assert.throws(()=>f.O.apply(f.state,f.ctx,{operation:'assign',demandIds:[ds[1].id],staffId:'bob',reason:'override'}),/employment cap/);assert.equal(f.state.assignments.length,1);
 const saved=f.state.assignments[0];saved.status='published';capTeacher(f,'bob',26);f.O.reconcile(f.state,f.ctx);assert.equal(saved.status,'published');assert.equal(saved.reviewRequired,true);
});
test('Stapler transfers retain one history charge while suspended publication ignores headroom',()=>{
 const f=ready();capTeacher(f,'bob');plan(f,p=>S.apply(p,{type:'move',tileId:p.tiles[0].id,teacherId:'bob',period:2}));f.O.apply(f.state,f.ctx,{operation:'publishStapler',staplerRevision:1});const effective=f.O.composeStaplerContext(f.state,f.ctx),b=A.balances(f.state,effective,f.date).get('bob');assert.equal(b.R,1);assert.equal(b.weeklyUsed,1);assert.equal(b.remaining,0);assert.equal(b.capRemaining,0);
 const blocked=ready();capTeacher(blocked,'bob',26);plan(blocked,p=>S.apply(p,{type:'move',tileId:p.tiles[0].id,teacherId:'bob',period:2}));blocked.O.apply(blocked.state,blocked.ctx,{operation:'publishStapler',staplerRevision:1});assert(blocked.state.staplerPlans[0].confirmed);assert.equal(blocked.state.importedRelief.length,1);assert.equal(blocked.O.composeStaplerContext(blocked.state,blocked.ctx).days[blocked.date].workloadIgnored,true);
});
test('Suspending FTT or PD retains baseline cap data without enforcing it on suspended dates',()=>{
 for(const subject of ['FTT','PD']){const f=ready();capTeacher(f,'alice',26);f.teachers[0].cells[2]=[subject,'GroupX','',''];plan(f,p=>S.apply(p,{type:'pit',tileId:p.tiles.find(t=>t.subject===subject).id}));f.O.apply(f.state,f.ctx,{operation:'publishStapler',staplerRevision:1});const t=f.O.composeStaplerContext(f.state,f.ctx).days[f.date].teachers.find(t=>t.staffId==='alice');assert.equal(t.capHeadroom,0);assert.equal(f.O.composeStaplerContext(f.state,f.ctx).days[f.date].workloadIgnored,true);assert.equal(t.R,0,'Stapler availability changes do not recalculate Deploy R');}
});
test('Private cap inputs do not leak into public teacher timetable rows',()=>{
 const f=ready();capTeacher(f,'bob');const view=f.O.view(f.state,{...f.ctx,user:{...f.ctx.user,smc:false,admin:false}},{view:'report'});assert(!Object.hasOwn(view.timetable.teachers[1],'periodCap'));assert(!Object.hasOwn(view.timetable.teachers[1],'capWorkload'));
});

test('Suspended planner can restore placements without contractual workload checks',()=>{
 const f=ready();capTeacher(f,'alice',26);const p=plan(f,p=>S.apply(p,{type:'pit',tileId:p.tiles[0].id}));f.O.apply(f.state,f.ctx,{operation:'publishStapler',staplerRevision:1});f.state.importedRelief.push({id:'extra',staffId:'alice',date:f.date,period:6,status:'published',rCost:1});const confirmed=structuredClone(f.state.staplerPlans[0]),restored=S.apply(p,{type:'move',tileId:p.tiles[0].id,teacherId:'alice',period:2});f.O.apply(f.state,f.ctx,{operation:'saveStapler',plan:restored,staplerRevision:1});assert.notDeepEqual(f.state.staplerPlans[0],confirmed);assert.equal(confirmed.confirmed,true);assert.equal(confirmed.revision,1);
});
test('Historical or special-holiday quota does not lift the current contractual cap',()=>{
 const f=ready();capTeacher(f,'bob');f.state.entitlements.push({staffId:'bob',week:A.monday(f.date),year:f.date.slice(0,4),quota:20,mode:'special-holiday'});const b=A.balances(f.state,f.ctx,f.date).get('bob');assert.equal(b.R,20);assert.equal(b.remaining,20);assert.equal(b.capRemaining,1);const teacher=A.teacherContext(f.state,f.ctx,f.date).get('bob');assert.equal(A.eligibility(teacher,6,[5]).autoEligible,false,'Historical R never bypasses the independent cap guard');
});

test('A midweek baseline replacement counts each dated baseline instead of one whole-week average',()=>{
 const h=backend(),replacement=structuredClone(h.model);for(const b of replacement.odd.blocks)if(b.name==='Bob')b.cells=Array.from({length:85},()=>['','','','']);h.entries.push({id:'replacement',from:h.date,to:'2026-12-31',priority:2});h.scope.rosterModel_=entry=>entry.id==='replacement'?replacement:h.model;const t=h.context('odd').days[h.date].teachers.find(t=>t.staffId==='bob');assert.equal(t.capWorkload,20);assert.equal(t.R,10);h.entries[0].from=h.date;const unknown=h.context('odd').days[h.date].teachers.find(t=>t.staffId==='bob');assert.equal(unknown.capVerified,false);assert.equal(unknown.R,10);
});

test('Published cover preservation uses structured cap state, never wording',()=>{
 const f=ready();capTeacher(f,'bob');f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2]});const dem=f.O.demand(f.ctx,f.state,f.date)[0];f.O.apply(f.state,f.ctx,{operation:'assign',demandIds:[dem.id],staffId:'bob'});const saved=f.state.assignments[0];saved.status='published';capTeacher(f,'bob',26);const eligibility=A.eligibility;A.eligibility=(...args)=>{const row=eligibility(...args);if(row.capOnlyViolation)row.reasons=['A revised human-readable cap message'];return row;};try{f.O.reconcile(f.state,f.ctx);assert.equal(saved.status,'published');assert.equal(saved.reviewRequired,true);}finally{A.eligibility=eligibility;}
});
test('Configured workload classifications override fallback subject labels',()=>{
 assert.equal(S.capWorkload([['FTT','','','']],{FTT:'Non-teaching'}),0);assert.equal(S.capWorkload([['FTT','','','']],{FTT:'Unclassified'}),null);
});

test('Saved own-arrangement candidates retain the same weekly cap as a full read',()=>{
 const h=backend();h.model.odd.blocks[0].cells[36]=['EL','GroupX','',''];const ctx=h.context('odd');h.state.absences.push({id:'abs',staffId:'alice',date:h.date,periods:[2],reliefRequired:true});const response=h.scope.rosterOperationsSavedCandidates_({},h.state,ctx,{operation:'saveAbsence',date:h.date,includeMutualCandidates:true},{savedIds:['abs']});assert.equal(response.mutualCandidatesUnavailable,undefined);const bob=response.mutualCandidates.candidatesByPeriod[2].find(t=>t.staffId==='bob');assert.equal(bob.available,true);h.q.rows.find(r=>r.id==='bob').periodCap=20;const capped=h.scope.rosterOperationsSavedCandidates_({},h.state,ctx,{operation:'saveAbsence',date:h.date,includeMutualCandidates:true},{savedIds:['abs']}).mutualCandidates.candidatesByPeriod[2].find(t=>t.staffId==='bob');assert.equal(capped.available,false);assert(capped.reasons.some(r=>/employment cap/.test(r)));
 let reads=0;h.scope.rosterModel_=()=>{reads++;return h.model;};for(const row of h.q.rows){row.capConfigured=false;row.periodCap=null;}h.scope.rosterOperationsSavedCandidates_({},h.state,ctx,{operation:'saveAbsence',date:h.date,includeMutualCandidates:true},{savedIds:['abs']});assert.equal(reads,0,'Uncapped post-save candidates perform no extra model lookup.');
});

test('Publishing exposes a saved capped manual choice and retains its warning without sending',()=>{
 for(const unverified of [false,true]){const f=ready();capTeacher(f,'bob');f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2]});const dem=f.O.demand(f.ctx,f.state,f.date)[0];f.O.apply(f.state,f.ctx,{operation:'assign',demandIds:[dem.id],staffId:'bob'});const t=capTeacher(f,'bob',26);if(unverified)t.capVerified=false;f.O.reconcile(f.state,f.ctx);const before=JSON.stringify(f.state.publicationSnapshots);const result=f.O.apply(f.state,f.ctx,{operation:'publish',date:f.date,allocationRevision:f.state.dayRevisions[f.date],notifyMode:'none'});assert.equal(result.skippedChoiceCount,0);assert.equal(result.published,1);assert.equal(f.state.assignments[0].status,'published');assert.equal(f.state.assignments[0].invalidCover,true);assert.equal(f.state.assignments[0].reviewRequired,true);assert.notEqual(JSON.stringify(f.state.publicationSnapshots),before);assert.equal(f.state.dailyPublicationStates[f.date].teachers.find(t=>t.staffId==='bob').cells[2][0],'EL');assert.equal(f.state.outbox.length,0);}
});
