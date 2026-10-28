'use strict';
// 0.9.9a: D1 import model/audit fetches must not depend on an unchanged whole-Roster fingerprint.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../backend/RosterEdgeMigration.gs'),'utf8');
function load(){
 const calls={snapshot:0},error_=(status,message)=>{throw Object.assign(Error(message),{status});};
 const context={
  error_,
  props_:()=>({getProperty:()=>null}),
  rosterEdgeSnapshot_:()=>{calls.snapshot++;return {sourceDigest:'changed',state:{},index:{entries:[]}};},
  rosterIndex_:()=>({entries:[{id:'model-1',modelFile:'file-1'}]}),
  rosterModel_:entry=>({id:entry.id,periods:[]}),
  rosterOperationsState_:()=>({allocationAuditExports:{'2026-10-28':{archiveFileId:'archive-1'}}}),
  rosterReadFile_:id=>{assert.equal(id,'archive-1');return JSON.stringify({schema:1,date:'2026-10-28',audit:[]});},
  GSISRosterOperations:{date:value=>value},
  LockService:{getScriptLock:()=>({})}
 };
 vm.createContext(context);vm.runInContext(source,context);return {context,calls};
}
const admin={user:{rosterAdmin:true}};
{
 const {context,calls}=load();
 const model=context.rosterEdgeMigrationDispatch_({input:{operation:'edgeModel',id:'model-1',expectedSourceDigest:'stale'}},admin);
 assert.equal(model.result.id,'model-1','a model is returned although the Roster fingerprint changed');
 const archive=context.rosterEdgeMigrationDispatch_({input:{operation:'edgeAudit',date:'2026-10-28',expectedSourceDigest:'stale'}},admin);
 assert.equal(archive.result.date,'2026-10-28');
 assert.equal(calls.snapshot,0,'model and audit fetches no longer re-fingerprint the whole Roster');
}
{
 const {context}=load();
 assert.throws(()=>context.rosterEdgeMigrationDispatch_({input:{operation:'edgeModel',id:'missing'}},admin),/Baseline model not found/);
 assert.throws(()=>context.rosterEdgeMigrationDispatch_({input:{operation:'edgeAudit',date:'2026-10-01'}},admin),/Audit archive not found/);
 assert.throws(()=>context.rosterEdgeMigrationDispatch_({input:{operation:'edgeModel',id:'model-1'}},{user:{rosterAdmin:false}}),/Admin access/);
}
console.log('PASS 0.9.9a D1 import fetches immutable models and archives without whole-Roster re-check');
