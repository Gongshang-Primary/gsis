'use strict';
// 0.9.9a: D1 import fetches models and audit archives without re-fingerprinting
// the whole Roster, but only the exact model file and archive captured by the
// export are accepted. A changed pointer or malformed archive is refused.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../backend/RosterEdgeMigration.gs'),'utf8');
function load({entries=[{id:'model-1',modelFile:'file-1'}],pointer='archive-1',archive={schema:1,date:'2026-10-28',audit:[]}}={}){
 const calls={snapshot:0,reads:[]},error_=(status,message)=>{throw Object.assign(Error(message),{status});};
 const context={
  error_,props_:()=>({getProperty:()=>null}),LockService:{getScriptLock:()=>({})},GSISRosterOperations:{date:value=>value},
  rosterEdgeSnapshot_:()=>{calls.snapshot++;return {sourceDigest:'changed',state:{},index:{entries:[]}};},
  rosterIndex_:()=>({entries}),
  rosterModel_:entry=>({id:entry.id,file:entry.modelFile}),
  rosterOperationsState_:()=>({allocationAuditExports:{'2026-10-28':{archiveFileId:pointer}}}),
  rosterReadFile_:id=>{calls.reads.push(id);return typeof archive==='string'?archive:JSON.stringify(archive);}
 };
 vm.createContext(context);vm.runInContext(source,context);return {dispatch:(input,c={user:{rosterAdmin:true}})=>context.rosterEdgeMigrationDispatch_({input},c),calls};
}
const model={operation:'edgeModel',id:'model-1',modelFile:'file-1',expectedSourceDigest:'stale'};
const audit={operation:'edgeAudit',date:'2026-10-28',archiveFileId:'archive-1',expectedSourceDigest:'stale'};
{
 const {dispatch,calls}=load();
 assert.equal(dispatch(model).result.model.file,'file-1','the exported model is returned although the whole-Roster fingerprint changed');
 assert.equal(dispatch(audit).result.date,'2026-10-28');
 assert.equal(calls.snapshot,0,'no whole-Roster re-fingerprint');assert.deepEqual(calls.reads,['archive-1']);
}
{
 // Export captured archive A; the date's pointer now names archive B.
 const {dispatch,calls}=load({pointer:'archive-B'});
 assert.throws(()=>dispatch(audit),e=>e.status===409&&/changed during import/.test(e.message),'a changed archive pointer is refused');
 assert.deepEqual(calls.reads,[],'the replacement archive is never read');
}
{
 // Export captured model file 1; the register now maps the ID to another file.
 const {dispatch}=load({entries:[{id:'model-1',modelFile:'file-2'}]});
 assert.throws(()=>dispatch(model),e=>e.status===409&&/changed during import/.test(e.message),'changed model content behind the same ID is refused');
}
{
 const {dispatch}=load();
 assert.throws(()=>dispatch({...model,modelFile:undefined}),e=>e.status===400,'the exported model identity is required');
 assert.throws(()=>dispatch({...audit,archiveFileId:''}),e=>e.status===400,'the exported archive identity is required');
 assert.throws(()=>dispatch({...model,id:'missing'}),/Baseline model not found/);
 assert.throws(()=>dispatch({...audit,date:'2026-10-01'}),/Audit archive not found/);
 assert.throws(()=>dispatch(model,{user:{rosterAdmin:false}}),/Admin access/);
}
for(const archive of [{schema:2,date:'2026-10-28',audit:[]},{schema:1,date:'2026-10-27',audit:[]},{schema:1,date:'2026-10-28',audit:'x'}]){
 const {dispatch}=load({archive});
 assert.throws(()=>dispatch(audit),e=>e.status===503&&/archive is invalid/.test(e.message),'a malformed archive is refused');
}
{
 const {dispatch}=load({archive:'{not json'});
 assert.throws(()=>dispatch(audit),e=>e.name==='SyntaxError','an unreadable archive is refused');
}
// The Worker sends the identities captured by its own export.
const worker=fs.readFileSync(path.join(__dirname,'../roster-update/public/edge-roster.js'),'utf8');
assert.match(worker,/operation:'edgeModel',id:entry\.id,modelFile:entry\.modelFile/);
assert.match(worker,/operation:'edgeAudit',date,archiveFileId:meta\.archiveFileId/);
console.log('PASS 0.9.9a D1 import accepts only the exported model files and audit archives');
