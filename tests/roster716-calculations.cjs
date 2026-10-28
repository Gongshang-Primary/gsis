'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const R=require('../shared/relief'),W=require('../shared/workload'),Rules=require('../shared/teaching-rules'),A=require('../shared/roster-allocation'),O=require('../shared/roster-operations');
const clone=x=>JSON.parse(JSON.stringify(x));
function harness(){
 const types=[['plain',{}],['hod',{Role:'HOD ICT','EO Appt Level':'HOD'}],['pt',{Role:'HOD ICT','EO Appt Level':'HOD','Employment Modifier':'4/5'}],['fajt',{'Employment Modifier':'FAJT'}],['ut',{'Employment Modifier':'UT'}]];
 const teachers=types.map(([id,p])=>({id,name:'Teacher '+id,active:true,profile:{Role:'Teacher',...p}}));
 const doc={id:'published',name:'2026 staffing',from:'2026-01-01',to:'2026-12-31',relief:R.defaults(),loads:{1:{EL:20,Assembly:1,FTGP:2,FTT:2}},classes:[{ref:'class1',level:'1',shortName:'A'}],groups:[],teachers,teacherDrafts:{},offload:Rules.migrate(null),workload:{categories:{},specialists:[]},assignments:teachers.flatMap(t=>['EL','FT'].map(subject=>({id:t.id+subject,teacher:t.id,target:'1A',targetRef:'class1',subject}))),organisations:{plt:[{id:'pd',slots:teachers.map(t=>t.id)}]},duties:teachers.map(t=>({id:'d'+t.id,days:['Mon'],teachers:{Mon:t.id}}))};
 const state=O.initial(),en={id:'published',revision:2,commit:'commit2',store:'version2'},idx={revision:2,published:en,versions:[]},contacts={user:{rosterSMC:false,rosterAdmin:false,rosterStaffId:'plain'},rosterPeople:teachers.map(t=>({id:t.id,name:t.name,active:true,email:t.id+'@gsps.edu.sg'}))};
 let today='2026-10-19';const scope=vm.createContext({GSISRelief:R,GSISWorkload:W,GSISTeachingRules:Rules,GSISRosterAllocation:A,GSISRosterOperations:O,rosterToday_:()=>today,book_:()=>({getId:()=> 'school'}),index_:()=>clone(idx),publishedEntry_:x=>x.published,error_:(status,message)=>{throw Object.assign(Error(message),{status});}});
 require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(fs.readFileSync('backend/Relief.gs','utf8')+'\n'+fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 scope.reliefDocument_=()=>clone(doc);scope.rosterOperationsState_=()=>O.validateState(clone(state));
 const read=(input={})=>clone(scope.rosterOperationsDispatch_({identity:{email:contacts.user.rosterStaffId+'@gsps.edu.sg'},input:{operation:'calculations',...input}},contacts));
 return {scope,doc,state,en,idx,contacts,read,setDate:d=>today=d};
}
function sample(){const h=harness();h.state.accountingYears['2026']={verified:true};h.state.entitlements=[{staffId:'plain',year:'2026',week:'2026-10-12',quota:4},{staffId:'plain',year:'2026',week:'2026-10-19',quota:4}];h.state.importedRelief=[{id:'history',staffId:'plain',date:'2026-10-12',status:'completed',rCost:12,origin:'imported'}];return h.read();}
if(require.main===module){
 const h=harness();const actual=h.scope.reliefAnalysis_(h.doc);
 for(const id of ['plain','hod','pt','fajt','ut']){h.contacts.user.rosterStaffId=id;const x=h.read(),r=actual.byTeacher[id];assert.equal(x.calculation.R,r.quota);assert.equal(x.calculation.breakdown.Wi,r.Wi);assert.equal(x.calculation.breakdown.employment,r.employment);assert.equal(x.calculation.breakdown.periodCap,r.periodCap);assert.equal(x.calculation.OF,r.OF);assert.equal(x.units,'periods/week');assert.equal(x.source.revision,2);assert(!JSON.stringify(x).includes('Teacher '+(id==='plain'?'hod':'plain')));assert(!('rows' in x));assert(!('teacherId' in x.calculation));}
 h.contacts.user.rosterStaffId='plain';const before=JSON.stringify(h.state);h.read();assert.equal(JSON.stringify(h.state),before,'read cannot fabricate or capture entitlements');
 for(const input of [{staffId:'hod'},{teacherId:'plain'},{date:'2026-01-01'},{versionId:'draft'},{year:'2025'}])assert.throws(()=>h.read(input),e=>e.status===400);
 h.contacts.user.rosterStaffId=null;assert.throws(()=>h.read(),e=>e.status===403);h.contacts.user.rosterStaffId='plain';h.contacts.rosterPeople.push({...h.contacts.rosterPeople[0]});assert.throws(()=>h.read(),e=>e.status===403);h.contacts.rosterPeople.pop();
 delete h.contacts.user.rosterSMC;assert.throws(()=>h.read(),e=>e.status===503);h.contacts.user.rosterSMC=false;
 h.idx.pendingFieldCommit={id:'pending'};assert.throws(()=>h.read(),e=>e.status===503);delete h.idx.pendingFieldCommit;
 h.doc.to='2026-10-18';assert.equal(h.read().calculation,null);h.doc.to='2026-12-31';delete h.idx.published;assert.equal(h.read().calculation,null);h.idx.published=h.en;
 h.doc.loads[1].EL=null;assert.equal(h.read().calculation.available,false);assert.equal(h.read().calculation.R,null);h.doc.loads[1].EL=20;
 h.state.accountingYears['2026']={verified:true};h.state.entitlements=[{staffId:'plain',year:'2026',week:'2026-10-12',quota:4},{staffId:'plain',year:'2026',week:'2026-10-19',quota:4},{staffId:'plain',year:'2026',week:'2026-10-05',quota:9,excluded:true},{staffId:'plain',year:'2026',week:'2026-10-26',quota:99},{staffId:'hod',year:'2026',week:'2026-10-19',quota:99}];
 const assignment=(id,status,extra={})=>({id,staffId:'plain',date:'2026-10-19',period:1,status,rCost:1,...extra});
 h.state.assignments=[assignment('a','completed'),assignment('pending','published'),assignment('draft','draft'),assignment('future','completed',{date:'2026-10-20',rCost:99}),assignment('cancel','cancelled'),assignment('superseded','completed'),assignment('replacement','completed',{replaces:'superseded'}),assignment('zero','completed',{combination:true}),assignment('corrected','completed'),assignment('other','completed',{staffId:'hod',rCost:99})];
 h.state.reliefCorrections=[{assignmentId:'corrected',sequence:1,actual:{completionStatus:'not-completed'}}];h.state.importedRelief=[assignment('history','completed',{rCost:10,origin:'imported',date:'2026-10-12'}),assignment('a','completed')];
 let completion=h.read().completion;assert.equal(completion.completed,12);assert.equal(completion.entitlement,8);assert.equal(completion.percentage,150);assert.equal(completion.recordedWeeks,3);assert.equal(completion.excludedWeeks,1);
 h.state.accountingYears['2026'].verified=false;assert.equal(h.read().completion.percentage,null);h.state.accountingYears['2026'].verified=true;
 h.state.entitlements=h.state.entitlements.filter(x=>x.week!=='2026-10-19');assert.equal(h.read().completion.percentage,null);assert.equal(h.read().completion.currentWeekRecorded,false);
 h.state.entitlements=[{staffId:'plain',year:'2026',week:'2026-10-19',quota:0}];completion=h.read().completion;assert.equal(completion.entitlement,0);assert.equal(completion.percentage,null);assert.equal(completion.completed,12);
 h.state.entitlements.push({...h.state.entitlements[0]});assert.match(h.read().completion.reason,/review/);
 const stored=h.scope.rosterOperationsState_;h.scope.rosterOperationsState_=()=>{throw Object.assign(Error('Unreadable'),{status:503});};const unreadable=h.read();assert.equal(unreadable.calculation.available,true);assert.equal(unreadable.completion.completed,null);assert.equal(unreadable.completion.percentage,null);h.scope.rosterOperationsState_=stored;
 h.scope.auth_=c=>{if(!c.user.roles.some(x=>['Admin','KP'].includes(x)))throw Object.assign(Error('Privileged export'),{status:403});};
 assert.throws(()=>h.scope.reliefExport_(null,null,{user:{roles:[]}},{}),e=>e.status===403,'existing privileged export has not been opened to teachers');
 console.log('PASS 716 personal calculations: authenticated dispatch, scoped own-record projection, actual Deploy formula across employment/offload/cap cases, source dates, unknown/zero, completed-only audited and deduplicated accounting, excluded weeks, missing/unverified history, >100%, no writes.');
}
module.exports={harness,sample};
