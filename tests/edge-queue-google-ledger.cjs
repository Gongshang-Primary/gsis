const assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
const {ctx,sheets}=require('./storage.cjs');
const run=s=>vm.runInContext(s,ctx);
// Real dispatch, field store, lock wrappers and journal; synthetic workbook only.
const id=run('id'),who=run('who'),c=run('c');
const command=()=>{const requestId=crypto.randomUUID(),expectedRevision=run('deployQueueRevision_(index_(book_()),id)');return {app:'deploy',document:'workbook',requestId,issuedAt:Date.now(),actor:who,action:'metadata',schemaVersion:1,expectedRevision,payload:{operation:'metadata',versionId:id,key:'meta',name:'Queue synthetic version',requestId,expectedRevision:expectedRevision.versionRevision,protocol:500}};};
ctx.testCommand=command();ctx.testC=c;
const execute=()=>run('deployQueueExecute_(testCommand,testC,1)');
let r=execute();assert.equal(r.decision,'APPLIED');const replay=execute();assert.equal(replay.digest,r.digest);assert.equal(run('index_(book_()).revision'),r.afterRevision.indexRevision);
ctx.testCommand={...ctx.testCommand,payload:{...ctx.testCommand.payload,name:'Different'}};assert.throws(execute,e=>e.status===409);ctx.testCommand=command();ctx.testCommand.expectedRevision.versionRevision--;r=execute();assert.equal(r.decision,'REJECTED');assert.equal(r.resultKind,'conflict');
ctx.testCommand=command();ctx.testCommand.issuedAt-=86400001;assert.throws(execute,e=>e.status===409);
assert.equal(run("deployQueueStatus_('no-row',who,c).decision"),'UNKNOWN');
// Crash after field/index commit but before the normal function returns is recovered
// from the ledger row written by the same native journal, without a second mutation.
ctx.testCommand=command();ctx.testCommand.payload.name='After commit crash';
run('var originalApplyRows=fieldApplyRows_;fieldApplyRows_=function(b,tx,recovery){originalApplyRows(b,tx,recovery);if(deployQueueContext_)throw Error("synthetic lost response after commit");}');
r=execute();assert.equal(r.decision,'APPLIED');const revision=run('index_(book_()).revision');assert.equal(execute().decision,'APPLIED');assert.equal(run('index_(book_()).revision'),revision);run('fieldApplyRows_=originalApplyRows');
// Crash before durable intent cannot change native data and remains UNKNOWN.
ctx.testCommand=command();const beforeIntent=run('index_(book_()).revision');run('var originalDecisionWrite=deployQueueWrite_;deployQueueWrite_=function(record,row){if(record.decision==="PREPARED")throw Error("synthetic crash before intent");return originalDecisionWrite(record,row)}');assert.throws(execute);assert.equal(run('index_(book_()).revision'),beforeIntent);assert.equal(run('deployQueueStatus_(testCommand.requestId,who,c).decision'),'UNKNOWN');run('deployQueueWrite_=originalDecisionWrite');
// The real native journal and pending index are durable before the first field mutation.
ctx.testCommand=command();run('fieldApplyRows_=function(){throw Error("synthetic crash after journal and before fields")}');r=execute();assert.equal(r.decision,'PREPARED');const prepared=ctx.testCommand;assert(run('!!index_(book_()).pendingFieldCommit'));ctx.testCommand=command();assert.throws(execute,e=>e.message==='QUEUE_GOOGLE_SCOPE_HELD');ctx.testCommand=prepared;
run('var originalRecover=fieldRecover_;fieldRecover_=function(){throw Error("status must remain read-only")};');assert.equal(run('deployQueueStatus_(testCommand.requestId,who,c).decision'),'PREPARED');run('fieldRecover_=originalRecover;fieldApplyRows_=originalApplyRows');assert.equal(execute().decision,'PREPARED','prepared intent never auto-executes');run('recoverFieldCommit()');assert.equal(run('deployQueueStatus_(testCommand.requestId,who,c).decision'),'APPLIED');
// Field rows, including the decision row, can precede the final index marker.
ctx.testCommand=command();run('var actualSheetsWrite=GSISSheets.write;GSISSheets.write=function(b,blocks,escaped,options){if(deployQueueContext_&&options?.final){actualSheetsWrite(b,blocks,escaped,{...options,final:undefined});throw Error("synthetic split before index commit")}return actualSheetsWrite(b,blocks,escaped,options)}');r=execute();assert.equal(r.decision,'PREPARED','an APPLIED row without its native commit marker is not applied evidence');assert.equal(run('deployQueueStatus_(testCommand.requestId,who,c).decision'),'PREPARED');run('GSISSheets.write=actualSheetsWrite;recoverFieldCommit()');assert.equal(run('deployQueueStatus_(testCommand.requestId,who,c).decision'),'APPLIED');
assert(sheets.has('edge_operation_receipts'));console.log('PASS actual Google ledger exact replay/mismatch/conflict/expiry; crashes before intent, after native journal, between fields/index, and after commit; explicit recovery and read-only UNKNOWN/status');
