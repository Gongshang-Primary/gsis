'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),adapter=require('./roster701-adapter.cjs'),S=require('../shared/roster-stapler.js');
let checks=0;const test=(name,run)=>{run();checks++;console.log('PASS',name);};
function setup(){
 const h=adapter(),scope=h.scope,reads={index:0,model:0,catalogue:0},source={id:'baseline',subjects:['PAL','EL']};let expectLock=false;
 // Restore the real context builder instead of the adapter's supplied context.
 vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 scope.Utilities.formatDate=(_,tz,format)=>format==='yyyy-MM-dd'?h.date:format==='HH'?'06':'00';
 scope.rosterIndex_=()=>{reads.index++;assert.equal(h.locked(),expectLock);return {entries:[{id:source.id,name:'Current',from:'2026-01-01',to:'2026-12-31',priority:1}]};};
 scope.rosterModel_=()=>{reads.model++;assert.equal(h.locked(),expectLock);return {layoutMode:'single-week',maxPeriod:16,single:{blocks:[{name:'Alice',cells:source.subjects.map(subject=>[subject,'','',''])}]}};};
 scope.rosterOperationsSubjectCatalogue_=()=>{reads.catalogue++;return {teachingGroups:[]};};
 scope.rosterOperationsQuota_=()=>{throw Error('Settings must not reconstruct quotas');};
 const c={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:h.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']};
 const call=input=>{expectLock=input.operation==='saveSystemConfig';try{return scope.rosterOperationsDispatch_({identity:{email:'alice@gsps.edu.sg'},input},c);}finally{expectLock=false;}};
 const state=h.state(),date='2026-10-15',plan=subject=>S.create({date,id:'baseline',parity:'single',periods:[{period:0,startMinutes:450,endMinutes:480}],teachers:[{staffId:'alice',name:'Alice',cells:[[subject,'','','']]}]});state.staplerPlans=[{date,baselineId:'baseline',revision:2,confirmed:true,confirmedRevision:1,confirmedPlan:plan('MUSIC'),draft:plan('DRAFT ONLY')}];h.setState(state);
 const command=(view,rules)=>({operation:'saveSystemConfig',...view.config,consecutiveSubjectRules:rules,revision:view.revision,requestId:crypto.randomUUID()});
 return {...h,call,reads,source,command};
}
test('real config context adds confirmed subjects using the same index and one active baseline read',()=>{
 const h=setup(),result=h.call({operation:'systemConfig'});
 assert.deepEqual(result.consecutiveSubjects,['EL','MUSIC','PAL']);assert.deepEqual(Array.from(result.subjects),['EL','PAL']);
 assert.deepEqual(h.reads,{index:1,model:1,catalogue:1});assert.equal(h.calls.writes,0);assert.equal(h.locked(),false);
});
test('forged client catalogue is rejected without a durable write, receipt, audit or notification',()=>{
 const h=setup(),view=h.call({operation:'systemConfig'}),before=h.state();
 const command={...h.command(view,[{subject:'CUSTOM',periods:3}]),consecutiveSubjects:['CUSTOM'],subjects:['CUSTOM'],timetableEntries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]};
 assert.throws(()=>h.call(command),e=>e.status===400&&/Choose consecutive subjects/.test(e.message));
 assert.deepEqual(h.state(),before);assert.equal(h.calls.writes,0);assert.equal(h.locked(),false);
 assert.deepEqual(h.reads,{index:2,model:2,catalogue:2});
});
test('fresh locked subject and confirmation changes reject choices shown before the change',()=>{
 for(const mode of ['subject','confirmation']){
  const h=setup(),view=h.call({operation:'systemConfig'}),subject=mode==='subject'?'PAL':'MUSIC';
  if(mode==='subject')h.source.subjects=['EL'];
  if(mode==='confirmation'){const changed=h.state();changed.staplerPlans=[];h.setState(changed);}
  const before=h.state();assert.throws(()=>h.call(h.command(view,[{subject,periods:3}])),e=>e.status===400);
  assert.deepEqual(h.state(),before);assert.equal(h.calls.writes,0);assert.equal(h.locked(),false);
 }
});
test('confirmed subject choices survive a comparison baseline replacement',()=>{const h=setup(),view=h.call({operation:'systemConfig'});h.source.id='replacement-baseline';const result=h.call(h.command(view,[{subject:'MUSIC',periods:3}]));assert.equal(h.calls.writes,1);assert(result.consecutiveSubjects.includes('MUSIC'));assert.deepEqual(h.state().systemConfig.consecutiveSubjectRules,[{subject:'MUSIC',periods:3}]);});
test('baseline and confirmed subjects commit once and an exact lost-response retry remains successful',()=>{
 const h=setup(),view=h.call({operation:'systemConfig'}),rules=[{subject:'PAL',periods:3},{subject:'MUSIC',periods:2}],command=h.command(view,rules);
 h.loseNextResponse();assert.throws(()=>h.call(command),/Uncertain response/);
 assert.equal(h.calls.writes,1);assert.equal(h.state().receipts.length,1);assert.equal(h.state().audit.length,1);assert.deepEqual(h.state().systemConfig.consecutiveSubjectRules,rules);
 // A receipt acknowledges the original commit even if today's catalogue changes.
 h.source.subjects=['EL'];const replay=h.call(command);assert.equal(replay.replayed,true);
 assert.equal(h.calls.writes,1);assert.equal(h.state().receipts.length,1);assert.equal(h.state().audit.length,1);assert.deepEqual(h.state().systemConfig.consecutiveSubjectRules,rules);assert.equal(h.state().outbox.length,0);assert.equal(h.locked(),false);
});
console.log(checks+' consecutive subject backend checks passed');
