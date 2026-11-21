import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {GSiSEdgeStore as Store} from '../roster-update/public/edge-store.js';
import {GSISRosterOperations as O,GSISRosterAllocation as A} from '../roster-update/public/edge-roster-domain.js';
import {mutateEdgeRoster} from '../roster-update/public/edge-roster.js';
import {rosterOperationsPreparedCheck_} from '../roster-update/public/edge-roster-policy.js';
const require=createRequire(import.meta.url),fixture=require('./roster701-fixture.cjs'),database=require('./helpers/chunked-import-db.cjs');
globalThis.fetch=()=>assert.fail('D1 Combine regression must not call school/provider services');
let passed=0;
for(const cell of [['Learning Event','','Hall',''],['MA','4B','Hall','']]){
 const f=fixture(),ctx=f.ctx;ctx.now=Date.parse(f.date+'T06:00:00+08:00');ctx.iso=new Date(ctx.now).toISOString();ctx.minute=360;f.teachers[1].cells[2]=structuredClone(cell);
 const initial=O.initial();O.apply(initial,ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2]});const demand=O.demand(ctx,initial,f.date)[0];
 const db=database(),store=Store.open(db,'roster'),head=await store.importState({state:initial,actor:'synthetic',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'synthetic',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});
 // Inject deterministic timetable/authority context while exercising the real
 // generated D1 domain, prepared policy, state loading, atomic commit and replay.
 const env={GSIS_JOBS:db};const send=(command,context=ctx)=>mutateEdgeRoster(env,{actor:context.user.email,requestId:command.requestId,command,needsContext:false,apply(state){rosterOperationsPreparedCheck_(state,context,command);return O.apply(state,context,command);}});
 try{
  const rank=A.manualRanks(A.manualModel(initial,ctx,f.date),demand).find(row=>row.staffId==='bob');assert.equal(rank.available,false);assert.equal(rank.combineAllowed,true,'generated D1 handler must recognize the occupied lesson');
  const input={operation:'reliefBatch',date:f.date,revision:initial.revision,requestId:crypto.randomUUID(),expectedTimetableId:ctx.days[f.date].id,expectedStaplerRevision:0,expectedParity:ctx.days[f.date].parity,expectedDemandSources:{[demand.id]:O.cellSourceKey(demand)},commands:[{operation:'combine',date:f.date,staffId:'bob',demandIds:[demand.id],reviewed:true,confirm:true}]};
  const before=await store.load();await assert.rejects(send({...input,requestId:crypto.randomUUID(),commands:[{...input.commands[0],operation:'assign'}]}),/Timetabled/);assert.deepEqual((await store.load()).state,before.state);
  const result=await send(input),saved=await store.load(),row=saved.state.assignments.find(a=>a.combination);assert(row);assert.equal(row.rCost,0);assert.equal(row.originalLesson.subject,cell[0]);assert.equal(row.originalLesson.className,cell[1]);assert.equal(row.originalLesson.venue,cell[2]);assert.deepEqual(f.teachers[1].cells[2],cell);
  assert.equal((await send(input)).replayed,true);assert.deepEqual((await store.load()).state,saved.state,'exact retry retains one combination and original receipt');assert(result.savedIds.length===1);
  await assert.rejects(send({...input,requestId:crypto.randomUUID(),revision:saved.state.revision-1}),e=>e.code==='DAY_CONFLICT');assert.deepEqual((await store.load()).state,saved.state);
  await assert.rejects(send({...input,requestId:crypto.randomUUID(),revision:saved.state.revision},{...ctx,user:{...ctx.user,smc:false,admin:false}}),e=>e.status===403);assert.deepEqual((await store.load()).state,saved.state);
  assert.equal(db.sql.prepare("SELECT count(*) n FROM gsis_edge_receipts WHERE scope='roster' AND actor=?").get(ctx.user.email).n,1);
  passed++;console.log('PASS D1 Combine class='+JSON.stringify(cell[1])+': occupied-relief rejection, batch save, original lesson, zero R, exact replay, stale revision and permissions');
 }finally{db.sql.close();}
}
console.log(passed+' generated D1/SQLite Combine groups passed');
