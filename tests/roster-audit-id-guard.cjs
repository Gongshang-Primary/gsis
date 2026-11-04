'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Operations=require('../shared/roster-operations.js'),Allocation=require('../shared/roster-allocation.js'),Store=require('../shared/edge-store.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const date='2026-11-06';
function context(){let serial=0;return {today:'2026-11-03',now:Date.parse('2026-11-03T00:00:00Z'),iso:'2026-11-03T00:00:00Z',minute:480,days:{},
 people:['requester','sponsor'].map(id=>({id,name:'Synthetic fixture',active:true,adhocEligible:true,role:'Teacher',groups:[],mobile:'91234567'})),
 smcIds:['sponsor'],user:{staffId:'requester',email:'fixture@example.test',smc:false,admin:false},uuid:()=> 'fixture-event-'+(++serial)};}
function event(id,operation='fixture',at='2026-11-03T00:00:00Z'){return {id,date,at,actor:'fixture@example.test',operation};}
const historical=[event('historical-pair','requestStapler'),event('historical-pair','decideStapler','2026-11-03T00:02:00Z')];
function google(audit,{split=false}={}){
 let saved={...Operations.initial(),audit:clone(audit)},writes=0,prepares=0;
 const manifest=()=>split?{format:'gsis-roster-operations-split-v1',folderId:'private-fixture'}:clone(saved);
 const properties=new Map([['ROSTER_OPERATIONS_FILE','operations']]);
 const scope={console,GSISRosterOperations:Operations,GSISRosterAllocation:Allocation,ROSTER_DATA:'private-fixture',
  props_:()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value)}),
  gsisRequireBackendRole_:()=>{},error_:(status,message)=>{throw Object.assign(Error(message),{status});}};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 Object.assign(scope,{
  rosterOperationsStoredRead_:()=>({id:'operations',manifest:manifest(),value:clone(saved)}),
  rosterOperationsUnpackPlans_:value=>value,rosterOperationsPackPlans_:value=>value,
  rosterReadFile_:()=>JSON.stringify(manifest()),rosterFindFile_:()=> 'operations',rosterOperationsVersionChanged_:()=>{},
  rosterDriveRequest_:(_url,options)=>{writes++;saved=JSON.parse(options.payload);return {};},
  rosterSplitPrepareDocument_:value=>{prepares++;return {commit(check){check();saved=clone(value);writes++;return 'operations';}};}
 });
 return {scope,state:()=>scope.rosterOperationsState_(true),commit:state=>scope.rosterOperationsCommit_(state),saved:()=>clone(saved),writes:()=>writes,prepares:()=>prepares};
}
let failures=0;
function check(name,run){try{run();console.log('PASS '+name);}catch(error){failures++;console.error('FAIL '+name+'\n'+error.stack);}}
check('Stapler request and decision retain one subject and two event identities',()=>{
 const state=Operations.initial(),ctx=context();
 const requested=Operations.apply(state,ctx,{operation:'requestStapler',date,sponsorId:'sponsor'}),requestId=requested.savedIds[0];
 const count=state.audit.length,retried=Operations.apply(state,ctx,{operation:'requestStapler',date,sponsorId:'sponsor'});
 assert.equal(retried.unchanged,true);assert.equal(state.audit.length,count,'pending request retry adds no event');
 Operations.apply(state,{...ctx,iso:'2026-11-03T00:02:00Z',now:ctx.now+120000,user:{staffId:'sponsor',email:'fixture-smc@example.test',smc:true,admin:false}},
  {operation:'decideStapler',date,id:requestId,decision:'approve',comment:''});
 assert.deepEqual(state.audit.map(row=>row.operation),['requestStapler','decideStapler']);
 assert.equal(new Set(state.audit.map(row=>row.id)).size,2,'each accepted lifecycle event needs its own audit ID');
 assert(state.audit.every(row=>row.planningRequestId===requestId),'both events keep the planning-request reference');
 assert(state.audit.every(row=>row.id!==requestId),'business identity must not replace audit identity');
 assert.deepEqual(Store.decode([...Store.encode(state).values()]),state,'the complete resulting state encodes and decodes without losing either event');
});
check('audit callers cannot replace reserved identity fields',()=>{
 for(const key of ['id','at','actor','operation']){
  const state=Operations.initial(),ctx=context(),before=clone(state.audit);
  assert.throws(()=>Allocation.addAudit(state,ctx,'fixture',{date,[key]:'reserved-override'}),'reserved '+key+' must be rejected');
  assert.deepEqual(state.audit,before,'rejected detail cannot append an event');
 }
 const state=Operations.initial(),ctx=context(),record=Allocation.addAudit(state,ctx,'fixture',{date,planningRequestId:'fixture-request'});
 assert.equal(record.planningRequestId,'fixture-request');assert.equal(record.at,ctx.iso);assert.equal(record.actor,ctx.user.email);assert.equal(record.operation,'fixture');
});
check('a repeated generated UUID cannot append another audit event',()=>{
 const state=Operations.initial(),ctx={...context(),uuid:()=> 'constant-id'};
 Allocation.addAudit(state,ctx,'first',{date});const before=clone(state.audit);
 assert.throws(()=>Allocation.addAudit(state,ctx,'second',{date}));assert.deepEqual(state.audit,before);
});
check('new audit creation preserves an unrelated historical duplicate pair',()=>{
 const state={...Operations.initial(),audit:clone(historical)},ctx=context();Allocation.addAudit(state,ctx,'unrelated',{date});
 assert.deepEqual(state.audit.slice(0,2),historical,'guard does not repair, remove or relabel old events');assert.equal(state.audit.length,3);
 assert.equal(state.audit[2].operation,'unrelated');assert(!historical.some(row=>row.id===state.audit[2].id));
});
check('delta validation allows old multiplicity and export enrichment but refuses new collisions',()=>{
 const before=clone(historical),after=clone(before);after[0].auditExportCaptured=true;after[1].auditExportVersion=7;after.push(event('new-id'));
 Allocation.assertNewAuditIds(before,after);assert.deepEqual(before,historical,'baseline is immutable');
 assert.throws(()=>Allocation.assertNewAuditIds(before,[...after,event('historical-pair','another')]));
 assert.throws(()=>Allocation.assertNewAuditIds([], [event('new-pair','first'),event('new-pair','second')]));
 const unique=[event('existing')];assert.throws(()=>Allocation.assertNewAuditIds(unique,[...unique,event('existing','later')]));
});
check('Google commit blocks a new duplicate before its durable write',()=>{
 const backend=google([event('existing')]),state=backend.state(),before=backend.saved();
 state.audit.push(event('existing','new-direct-append'));
 assert.throws(()=>backend.commit(state),'direct append must not bypass the Google persistence boundary');
 assert.equal(backend.writes(),0);assert.deepEqual(backend.saved(),before);
});
check('Google commit keeps historical duplicates and permits metadata enrichment plus an unrelated append',()=>{
 const backend=google(historical),state=backend.state();state.audit[0].auditExportCaptured=true;state.audit[1].auditExportVersion=7;
 state.audit.push(event('unrelated','new-direct-append'));backend.commit(state);
 assert.equal(backend.writes(),1);const after=backend.saved().audit;
 assert.deepEqual(after.slice(0,2),[{...historical[0],auditExportCaptured:true},{...historical[1],auditExportVersion:7}]);
 assert.equal(after[2].id,'unrelated');assert.equal(after.length,3);
});
check('cloned Google transactions validate against stored history before normal or split writes',()=>{
 for(const split of [false,true]){
  const backend=google(historical,{split}),state=clone(backend.state());state.audit[0].auditExportCaptured=true;
  state.audit.push(event('clone-unrelated'));backend.commit(state);assert.equal(backend.writes(),1);
  const before=backend.saved(),prepares=backend.prepares(),next=clone(backend.state());
  next.audit.push(event('historical-pair','new-direct-append'));
  assert.throws(()=>backend.commit(next));assert.equal(backend.writes(),1);assert.deepEqual(backend.saved(),before);
  assert.equal(backend.prepares(),prepares,'invalid identities must not prepare immutable split files');
 }
});
assert.equal(failures,0,failures+' audit identity guard checks failed');
