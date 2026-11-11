import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {edgeRosterBackend,mutateEdgeRoster} from '../roster-update/public/edge-roster.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),fixture=require('./roster701-fixture.cjs');
const f=fixture(),db=database(),who={email:'alice@gsps.edu.sg',subject:'synthetic-alice'},other={email:'bob@gsps.edu.sg',subject:'synthetic-bob'},realNow=Date.now,realFetch=globalThis.fetch;
Date.now=()=>Date.parse(f.date+'T06:00:00+08:00');
Object.assign(f.ctx,{minute:360,now:Date.now(),iso:new Date(Date.now()).toISOString()});
f.state.absences.push({id:'synthetic-absence',date:f.date,staffId:'alice',name:'Alice',typeId:'mc',periods:[2,3],reliefRequired:true,instructions:{}});
const people=f.people.map(p=>({...p,email:p.id+'@gsps.edu.sg',emails:[p.id+'@gsps.edu.sg'],groups:['Teaching'],role:'Teacher',employment:'Permanent'}));
const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_PUBLIC_ORIGIN:'https://roster.test',WHATSAPP_ENABLED:'false'};
globalThis.fetch=()=>assert.fail('Receipt recovery must not call Google or a provider');
async function activate(scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'fixture',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}
const send=async(command,identity=who)=>(await edgeRosterBackend(env,'rosterOperations',{operation:'receiptStatus',command},identity,crypto.randomUUID())).result;
let failed=0;
async function test(name,run){try{await run();console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.stack);}}
try{
 const store=await activate('roster',f.state);
 await activate('roster-register',{revision:0,entries:[],receipts:[]});
 await activate('roster-references',{schema:1,contacts:{rosterPeople:people,rosterSMCIds:['alice','bob'],rosterAdminIds:['alice'],rosterUrgentSMCIds:[]},contactsCheckedAt:Date.now(),calendarByDate:{}});
 const command={operation:'reliefBatch',requestId:crypto.randomUUID(),date:f.date,view:'allocation',compact:true,revision:f.state.revision,expectedTimetableId:'baseline',expectedStaplerRevision:0,expectedParity:'even',expectedDemandSources:Object.fromEntries(f.O.demand(f.ctx,f.state,f.date).map(d=>[d.id,f.O.cellSourceKey(d)])),commands:[{operation:'setNoRelief',demandIds:['synthetic-absence:2'],noRelief:true,confirm:true}]};
 // The actual domain batch and native D1 mutation boundary create the allocation
 // response/receipt. Only quota/context setup uses the existing pure fixture.
 const saved=await mutateEdgeRoster(env,{actor:who.email,who,requestId:command.requestId,command,needsContext:false,apply(state){f.O.apply(state,f.ctx,command);return f.O.view(state,f.ctx,command);}});
 assert(saved.allocationModel);assert.equal(saved.requestId,command.requestId);
 const stored=await store.receipt(who.email,command.requestId);
 assert(stored);assert(stored.result.allocationModel);assert.equal(stored.result.accepted,undefined,'recording is unchanged; the lookup supplies the contract field');
 const before=await store.load();
 await test('stored reliefBatch receipt satisfies the unchanged frontend boolean check',async()=>{
  const reply=await send(command);assert.equal(reply.ok,true);const receipt=reply.data;
  assert.equal(receipt.requestId,command.requestId);assert.equal(typeof receipt.accepted,'boolean');assert.equal(receipt.accepted,true);assert.equal(receipt.found,true);assert.equal(receipt.replayed,true);
  assert.deepEqual(receipt.allocationModel,stored.result.allocationModel);assert.equal(receipt.acceptedAt,saved.acceptedAt);assert.equal(receipt.acceptedRevision,saved.acceptedRevision);
  const replay=await mutateEdgeRoster(env,{actor:who.email,who,requestId:command.requestId,command,needsContext:false,apply(){assert.fail('the same saved batch must not apply twice after receipt recovery');}});assert.equal(replay.replayed,true);
 });
 await test('missing reliefBatch receipt is explicitly unconfirmed and can be resent',async()=>{
  const missing={...command,requestId:crypto.randomUUID()},reply=await send(missing);assert.equal(reply.ok,true);
  assert.deepEqual(reply.data,{accepted:false,confirmation:'unconfirmed',found:false,requestId:missing.requestId});
  assert.equal(typeof reply.data.accepted,'boolean');assert.equal(await store.receipt(who.email,missing.requestId),null);
 });
 await test('receipt identity remains bound to the original actor and command',async()=>{
  const changed=structuredClone(command);changed.commands[0].noRelief=false;
  const mismatch=await send(changed);assert.equal(mismatch.ok,false);assert.equal(mismatch.status,409);assert.equal(mismatch.code,'EDGE_REQUEST_REUSED');
  const foreign=await send(command,other);assert.equal(foreign.ok,true);assert.equal(foreign.data.accepted,false);assert.equal(foreign.data.allocationModel,undefined);
 });
 const after=await store.load();assert.deepEqual(after.state,before.state);assert.equal(after.revision,before.revision,'lookups cannot create a receipt or modify the saved batch');
 const legacyCommand={...command,requestId:crypto.randomUUID()},absenceCommand={operation:'saveAbsence',requestId:crypto.randomUUID(),date:f.date,staffId:'alice',typeId:'mc',fullDay:true};
 // Retained pre-cutover evidence exists without a native D1 receipt for either ID.
 await mutateEdgeRoster(env,{actor:'fixture',requestId:crypto.randomUUID(),command:{operation:'fixtureReceiptEvidence'},needsContext:false,apply(state){
  state.receipts.push({id:legacyCommand.requestId,actor:who.email,digest:sha256Hex(JSON.stringify(legacyCommand)),result:{savedIds:['synthetic-legacy']},at:f.ctx.iso,revision:state.revision});
  state.edgeAbsenceReceipts||=[];state.edgeAbsenceReceipts.push({id:absenceCommand.requestId,actor:who.email,identity:who,command:absenceCommand,savedIds:['synthetic-absence'],date:f.date,createdAt:f.ctx.iso});
  return {retained:true};
 }});
 assert.equal(await store.receipt(who.email,legacyCommand.requestId),null);assert.equal(await store.receipt(who.email,absenceCommand.requestId),null);
 const evidence=await store.load();
 await test('legacy receipt still reports accepted true',async()=>{
  const reply=await send(legacyCommand);assert.equal(reply.ok,true);assert.equal(reply.data.accepted,true);assert.equal(typeof reply.data.accepted,'boolean');assert.equal(reply.data.found,true);assert.equal(reply.data.requestId,legacyCommand.requestId);assert.deepEqual(reply.data.savedIds,['synthetic-legacy']);
 });
 await test('retained absence receipt already supplies accepted true through receiptResult',async()=>{
  const reply=await send(absenceCommand);assert.equal(reply.ok,true);assert.equal(reply.data.accepted,true);assert.equal(typeof reply.data.accepted,'boolean');assert.equal(reply.data.found,true);assert.equal(reply.data.absenceApplied,true);assert.equal(reply.data.requestId,absenceCommand.requestId);assert.deepEqual(reply.data.savedIds,['synthetic-absence']);
  const mismatch=await send({...absenceCommand,fullDay:false});assert.equal(mismatch.ok,false);assert.equal(mismatch.status,409);assert.equal(mismatch.code,'ROSTER_RECEIPT_CONFLICT');
 });
 assert.deepEqual((await store.load()).state,evidence.state);assert.equal((await store.head()).revision,evidence.revision);
 console.log('Receipt checks are read-only: saved assignments, notification collections, audit and revisions are unchanged.');
}finally{Date.now=realNow;globalThis.fetch=realFetch;db.sql.close();}
if(failed)process.exitCode=1;
