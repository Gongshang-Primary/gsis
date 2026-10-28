'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),test=require('node:test'),{JSDOM}=require('jsdom');
const A=require('../shared/roster-allocation.js');
function audit(policy,duplicate=false){
 const date='2026-10-28',scope=vm.createContext({GSISRosterAllocation:A});vm.runInContext(fs.readFileSync('backend/RosterAuditExport.gs','utf8'),scope);
 const state={revision:9,systemConfig:{verboseLogging:true},audit:[],outbox:[{mobile:'6599999999',data:{token:'PRIVATE_CAPABILITY',summary:'PRIVATE_MESSAGE'}}],optimisationRuns:[{id:'run-k',date,at:'2026-10-27T22:01:00Z',status:'complete',coverage:1,uncovered:0,coverageProven:true,preferencesProven:true,decisionEvidence:{version:1,inputs:{staplerRevision:5},policy,teachers:[],periods:[],lessons:[]}}]};
 if(duplicate)state.optimisationRuns.push({id:'run-k-copy',date,at:'2026-10-27T22:02:00Z',status:'complete',coverage:1,uncovered:0,decisionEvidenceRef:'run-k',decisionInputs:{staplerRevision:5,allocationRevision:12}});
 const before=JSON.stringify(state),text=scope.rosterAllocationAuditText_(state,date,'2026-10-27T22:02:00Z');assert.equal(JSON.stringify(state),before,'formatting never changes retained UTC evidence');assert.match(text,/2026-10-28 06:01 SGT/);assert.doesNotMatch(text,/6599999999|PRIVATE_CAPABILITY|PRIVATE_MESSAGE/);return text;
}
test('new suspended evidence distinguishes skipped workload formula from enforced business rules',()=>{
 const text=audit({preferences:['annualUtilisation','rotation'],workloadLimits:{dailyTotal:8,consecutive:6},effectiveWorkloadLimits:{dailyTotal:8,consecutive:6},workloadCalculationSkipped:true});
 assert.match(text,/Configured workload limits: 8 daily periods; 6 consecutive periods\./);assert.match(text,/Effective allocation limits: 8 daily periods; 6 consecutive periods\./);assert.match(text,/Workload formula calculation: skipped for this suspended timetable\. Allocation business rules remain active\./);assert.match(text,/Preference order: Lower annual R utilisation, Rotation order\./);
});
test('new ordinary-day and disabled-rule evidence prints actual effective policy without inventing limits',()=>{
 const text=audit({preferences:['rotation'],workloadLimits:{dailyTotal:null,consecutive:6},effectiveWorkloadLimits:{dailyTotal:null,consecutive:6},workloadCalculationSkipped:false});assert.match(text,/Effective allocation limits: disabled daily periods; 6 consecutive periods\./);assert.match(text,/Workload formula calculation: not skipped\./);assert.doesNotMatch(text,/skipped for this suspended timetable/);
});
test('legacy evidence does not claim its configured limits were enforced',()=>{
 const text=audit({preferences:['rotation'],workloadLimits:{dailyTotal:8,consecutive:6}});assert.match(text,/Configured workload limits: 8 daily periods; 6 consecutive periods\./);assert.match(text,/Effective allocation limits: not recorded for this historical run\./);assert.match(text,/Workload formula calculation: not recorded for this historical run\./);assert.doesNotMatch(text,/Effective allocation limits: 8|business rules remain active/);
});
test('partial effective metadata stays unknown and referenced runs retain their recorded policy',()=>{
 const partial=audit({preferences:['rotation'],workloadLimits:{dailyTotal:8,consecutive:6},effectiveWorkloadLimits:{dailyTotal:8}});assert.match(partial,/Effective allocation limits: not recorded for this historical run\./);
 const text=audit({preferences:['annualUtilisation','rotation'],workloadLimits:{dailyTotal:8,consecutive:6},effectiveWorkloadLimits:{dailyTotal:8,consecutive:6},workloadCalculationSkipped:true},true);assert.equal((text.match(/Effective allocation limits: 8 daily periods; 6 consecutive periods\./g)||[]).length,2);assert.equal((text.match(/Workload formula calculation: skipped for this suspended timetable\./g)||[]).length,2);assert.match(text,/Allocation revision: 12/);assert.doesNotMatch(text,/Effective allocation limits: not recorded/);
});
async function planner(accountingVerified){
 const dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];
 try{
  w.structuredClone=structuredClone;w.HTMLElement.prototype.scrollIntoView=function(){};
  for(const file of ['shared/roster-stapler.js','shared/roster-allocation.js','shared/roster-operations.js','tests/roster701-fixture.js','roster-update/public/roster-operations-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
  const f=w.__fixture,O=w.GSISRosterOperations;f.state.accountingYears['2026']={verified:true};O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.ctx.today,typeId:'mc',periods:[3]});
  const ctx={profile:f.profile,today:()=>f.ctx.today,container:w.document.getElementById('content'),status(){},api:async(route,p)=>{calls.push(p.operation);assert(O.READS.includes(p.operation),'opening the planner must not send or mutate');const data=O.read(f.state,f.ctx,p);if(data.allocationModel){data.allocationModel.workloadIgnored=true;data.accountingVerified=accountingVerified;}return data;}};
  await w.RosterOpsUI.render('Assign Relief',ctx);return {dom,calls};
 }catch(error){w.close();throw error;}
}
test('suspended planner still blocks automatic allocation without verified annual history',async()=>{
 const {dom}=await planner(false);try{const button=dom.window.document.querySelector('[data-auto-allocate]');assert(button);assert.equal(button.disabled,true);assert.match(button.title,/Annual R history could not be loaded/);}finally{dom.window.close();}
});
test('suspended planner explains that all business rules remain active',async()=>{
 const {dom}=await planner(true);try{const doc=dom.window.document;assert.equal(doc.querySelector('[data-auto-fill-blanks]').disabled,false);assert.equal(doc.body.textContent.includes('Workload limits do not apply'),false);assert.match(doc.querySelector('[data-candidate-scroll]').textContent,/Workload formula calculation is skipped for this suspended timetable\. All enabled allocation business rules still apply\./);}finally{dom.window.close();}
});
