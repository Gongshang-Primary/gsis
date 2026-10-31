'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),O=require('../shared/roster-operations.js');
const now=Date.parse('2026-10-31T12:00:00+08:00'),old='2026-09-01T12:00:00+08:00',ctx={today:'2026-10-31',now};
function fixture(){
 return {...O.initial(),outbox:[{id:'sent',key:'notice:sent',kind:'stapler_timetable',recipientId:'teacher',date:'2026-09-01',status:'sent',createdAt:old,completedAt:old,deliveryStatus:'delivered',deliveryAt:old,data:{summary:'A'.repeat(9000)}}],receipts:[{id:'request',actor:'teacher@example.test',digest:'digest',at:old,revision:7,result:{savedIds:['absence'],data:'B'.repeat(9000)}}],scheduleReceipts:{'2026-09-01:16:00':{at:old,optimise:true,allocationStatus:'complete'}},optimisationRuns:[{id:'run',date:'2026-09-01',at:old,status:'complete',reason:'Covered',auditExportCaptured:true,decisionEvidence:{version:1,lessons:['C'.repeat(9000)]}}],audit:[{id:'system',date:'2026-09-01',at:old,operation:'workload-review',actor:'teacher@example.test',detail:'D'.repeat(9000)},{id:'human',date:'2026-09-01',at:old,operation:'assign',actor:'teacher@example.test',detail:'keep'}],smcAlerts:[{id:'alert',key:'delivery:sent',date:'2026-09-01',createdAt:old,resolvedAt:old,status:'resolved',summary:'E'.repeat(9000)}],absences:[{id:'absence',date:'2026-09-01',staffId:'teacher',periods:[1]}],assignments:[{id:'assignment',date:'2026-09-01',staffId:'teacher',status:'completed'}],acknowledgements:[{id:'ack',at:old}],entitlements:[{staffId:'teacher',quota:12}],importedRelief:[{id:'import'}],reliefCorrections:[{id:'correction'}],rotationEvents:[{id:'rotation'}],staplerPlans:[{date:'2026-09-01',draft:{keep:true}}],staplerArchives:[{date:'2026-09-01',draft:{keep:true}}],dailyPublicationStates:{'2026-09-01':{keep:true}},systemConfig:{keep:true}};
}
test('cold archive moves only machine payloads and preserves original JSON plus protected records',()=>{
 const state=fixture(),before=JSON.stringify(state),selection=O.archiveColdSelection(state,ctx);
 assert.deepEqual(selection.items.map(x=>x.id).sort(),['alert','request','run','sent','system','2026-09-01:16:00'].sort());
 const next=O.archiveApplySelection(state,selection);
 assert.equal(JSON.stringify(state),before);
 for(const item of selection.items){const source=item.collection==='scheduleReceipts'?state[item.collection][item.id]:state[item.collection].find(x=>x.id===item.id);assert.equal(item.json,JSON.stringify(source));assert.deepEqual(item.stub.archiveRef,{month:'2026-09',collection:item.collection,id:item.id});}
 for(const key of ['absences','assignments','acknowledgements','entitlements','importedRelief','reliefCorrections','rotationEvents','staplerPlans','staplerArchives','dailyPublicationStates','systemConfig'])assert.equal(JSON.stringify(next[key]),JSON.stringify(state[key]),key);
 assert.equal(next.audit.find(x=>x.id==='human').detail,'keep');assert.equal(next.outbox[0].key,'notice:sent');assert.equal(next.receipts[0].digest,'digest');
 assert(JSON.stringify(next).length<before.length-35000);
 assert.equal(O.archiveColdSelection(next,ctx).items.length,0);
});
test('active, uncertain, retrying, future, missing-time and recently completed items stay live',()=>{
 const state=fixture(),row=state.outbox[0];state.outbox=[];
 for(const [id,patch] of Object.entries({queued:{status:'queued'},uncertain:{status:'uncertain'},retrying:{status:'failed',retryable:true,nextAttemptAt:now+1000},prepared:{status:'failed',preparedAt:now,attemptHistory:[{state:'uncertain',at:old}]},recent:{completedAt:'2026-10-30T00:00:00Z'},recentAttempt:{attemptHistory:[{state:'sent',at:'2026-10-30T00:00:00Z'}]},today:{date:'2026-10-31'},future:{date:'2026-11-01'},invalid:{completedAt:'bad'},noTime:{createdAt:undefined,completedAt:undefined,deliveryAt:undefined}}))state.outbox.push({...row,id,...patch});
 assert.equal(O.archiveColdSelection(state,ctx).items.some(x=>x.collection==='outbox'),false);
});
test('exact 30-day boundary stays live and records must have both an old date and old completion',()=>{
 const state=fixture();state.outbox[0].completedAt=new Date(now-30*86400000).toISOString();state.receipts[0].at=new Date(now-30*86400000).toISOString();
 assert.equal(O.archiveColdSelection(state,ctx).items.some(x=>['outbox','receipts'].includes(x.collection)),false);
 state.outbox[0].completedAt=new Date(now-30*86400000-1).toISOString();assert(O.archiveColdSelection(state,ctx).items.some(x=>x.id==='sent'));
});
test('large selection stays bounded and application rejects a stale source instead of replacing new work',()=>{
 const state=fixture(),one=O.archiveColdSelection(state,{...ctx,maxCharacters:12000});assert(one.items.length>0);assert(one.characters<=12000);
 const selected=one.items[0],changed=JSON.parse(JSON.stringify(state));if(selected.collection==='scheduleReceipts')changed[selected.collection][selected.id].newValue=true;else changed[selected.collection].find(x=>x.id===selected.id).newValue=true;
 assert.throws(()=>O.archiveApplySelection(changed,one),/changed/i);
 assert.equal(O.archiveColdSelection(state,{...ctx,maxCharacters:1}).items.length,0);
});
test('human optimisations remain live and uncaptured runs remain live',()=>{
 const state=fixture();state.audit=[{id:'manual',date:'2026-09-01',at:old,actor:'teacher@example.test',operation:'optimise',detail:'keep'},{id:'automatic',date:'2026-09-01',at:old,actor:'system',operation:'optimise',detail:'archive'}];state.optimisationRuns[0].auditExportCaptured=false;
 const selected=O.archiveColdSelection(state,ctx);assert(selected.items.some(x=>x.id==='automatic'));assert(!selected.items.some(x=>x.id==='manual'||x.id==='run'));
});
test('invalid dates and dangerous inherited map keys are not archive identities',()=>{
 const state=fixture();state.outbox[0].date='2026-02-31';state.scheduleReceipts=JSON.parse('{"__proto__":{"at":"2026-09-01T00:00:00Z"}}');
 assert.equal(O.archiveColdSelection(state,ctx).items.some(x=>['outbox','scheduleReceipts'].includes(x.collection)),false);
});
test('archived scheduler receipts leave the live map and stale scheduler replay remains rejected',()=>{
 const state=fixture(),selection=O.archiveColdSelection(state,ctx),next=O.archiveApplySelection(state,selection);
 assert.equal(Object.keys(next.scheduleReceipts).length,0);
 assert.throws(()=>O.scheduledTick(next,{...ctx,service:true},now-121000),/stale/i);
});
test('failed notices need explicit finality and prepared sends need a resolved attempt',()=>{
 const state=fixture(),base=state.outbox[0];state.outbox=[
  {...base,id:'unknown-expiry',status:'failed',retryable:true,attempts:1},
  {...base,id:'prepared-unknown',preparedAt:Date.parse(old),status:'failed',retryable:false},
  {...base,id:'recent-attempt-completion',attemptHistory:[{at:old,completedAt:new Date(now-1000).toISOString(),state:'sent'}]},
  {...base,id:'resolved-failure',preparedAt:Date.parse(old),status:'failed',retryable:false,attemptHistory:[{at:old,completedAt:old,state:'failed'}]}
 ];
 assert.deepEqual(O.archiveColdSelection(state,ctx).items.filter(x=>x.collection==='outbox').map(x=>x.id),['resolved-failure']);
});
