'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),acorn=require('acorn');
const {createHash,randomUUID}=require('node:crypto');
const source=fs.readFileSync('backend/Code.gs','utf8'),roster=fs.readFileSync('backend/Roster.gs','utf8');
function declaration(text,name){const node=acorn.parse(text,{ecmaVersion:'latest'}).body.find(node=>node.type==='FunctionDeclaration'&&node.id.name===name);assert(node,name+' must exist');return text.slice(node.start,node.end);}
const now=Date.now(),privateText='PRIVATE_STAFF_RECORD https://private.example/token?secret=do-not-log';
function response({operation='edgeExportManifest',ordinal=140,signed=true,reason,code='unsafe '+privateText,failedResult=false}={}){
 const logs=[],descriptor={schema:2,createdAt:now-80000,stepStartedAt:now-69972,lastPhase:'Freeze parts',stepSize:{bytes:262157,records:1}};
 const error=Object.assign(Error(privateText),{status:503,code});
 const context={Date:class extends Date{static now(){return now;}},JSON,Math,Number,String,RegExp,GSIS_DEPLOY_VERSION:'test',
  console:{log:text=>logs.push(JSON.parse(text))},Utilities:{getUuid:randomUUID},GSISSheets:{resetStats(){}},
  rosterDiagnosticBuild_:()=> 'test',gsisApiSecret_:()=> 'a'.repeat(32),same_:()=>signed,signature_:()=>'',
  gsisBackendKind_:()=> 'roster',gsisRequireBackendAction_:()=>{},rosterStage_:()=>{},contacts_:()=>({}),
  rosterDiagnosticError_:e=>e.message,rosterDiagnosticText_:value=>value,rosterAbsenceFailureDetail_:()=>({}),rosterFailureDetail_:()=>({}),out_:value=>value,
  error_:(status,message)=>{throw Object.assign(Error(message),{status});},
  rosterEdgeExportBindingV2_:()=>({}),rosterEdgeExportAbandoned_:()=>null,rosterEdgeExportDescriptor_:()=>descriptor,
  rosterEdgeExportSave_:()=>{},rosterEdgeExportManifestV2_:()=>{throw error;}};
 vm.createContext(context);vm.runInContext(fs.readFileSync('backend/RosterEdgeMigration.gs','utf8'),context);
 Object.assign(context,{rosterEdgeExportBindingV2_:()=>({}),rosterEdgeExportAbandoned_:()=>null,rosterEdgeExportDescriptor_:()=>descriptor,
  rosterEdgeExportSave_:()=>{},rosterEdgeExportManifestV2_:()=>{throw error;}});
 vm.runInContext(declaration(roster,'rosterDiagnosticLog_'),context);
 context.rosterDiagnostic_=(event,detail)=>{if(event==='roster-backend-failed')context.rosterDiagnosticLog_({event,...detail});};
 context.rosterDispatch_=req=>{if(failedResult)return {preparationFailed:true,failureReason:{status:503,message:privateText,phase:'Freeze parts',bytes:262157,records:1,elapsed:69972}};if(reason){error.failureReason=reason;throw error;}return context.rosterEdgeExportManifest_(req);};
 vm.runInContext(declaration(source,'doPost'),context);
 const request={action:'rosterOperations',timestamp:now,nonce:randomUUID(),identity:{email:'admin@gsps.edu.sg',subject:'test'},input:{operation,preparation:{ordinal}}};
 const result=JSON.parse(JSON.stringify(context.doPost({postData:{contents:JSON.stringify({payload:JSON.stringify(request),signature:'test'})}})));
 return {result,logs};
}
const expected={code:'ROSTER_GOOGLE_ERROR',ordinal:140,phase:'Freeze parts',bytes:262157,records:1,elapsed:69972};
const handled=response();
assert.equal(handled.result.ok,false);
assert.deepEqual(handled.logs,[expected],'a handled preparation error emits exactly one bounded diagnostic, without raw errors or stack');
for(const [key,value] of Object.entries(expected))assert.equal(handled.result.failureReason[key],value,'the response retains diagnostic '+key);
assert(!JSON.stringify(handled.logs).includes('PRIVATE'));
assert(!JSON.stringify(handled.result.failureReason).includes('PRIVATE'),'the diagnostic returned to D1 contains no raw error');
const completedFailure=response({failedResult:true});
assert.deepEqual(completedFailure.logs,[expected],'a terminal preparation failure in an ok response is also logged once');
assert(!JSON.stringify(completedFailure.result.data.failureReason).includes('PRIVATE'));
const malformed=response({ordinal:-1,reason:{status:503,code:privateText,phase:privateText,bytes:-1,records:NaN,elapsed:-1,message:privateText}});
assert.deepEqual(malformed.logs,[{code:'ROSTER_GOOGLE_ERROR',ordinal:null,phase:'Preparation',bytes:null,records:null,elapsed:0}]);
assert.equal(response({operation:'read'}).result.failureReason,undefined,'ordinary failures retain their existing response');
assert.equal(response({signed:false}).result.failureReason,undefined,'unverified requests cannot publish import metadata');

(async()=>{
 const {edgeRosterMigration}=await import('../roster-update/public/edge-roster.js');
 const {queueRosterImport,drainRosterImports}=await import('../roster-update/public/edge-roster-import-runner.js');
 const Import=require('../shared/roster-import.js'),db=require('./helpers/chunked-import-db.cjs')();
 const who={email:'admin@gsps.edu.sg',subject:'test'},requestId=randomUUID();
 const sessionId=createHash('sha256').update(JSON.stringify([who.email,requestId])).digest('hex'),binding={actor:who.email,requestId,sessionId};
 const env={GSIS_JOBS:db,APPS_SCRIPT_URL:'https://script.google.com/macros/s/diagnostic-fixture/exec',BRIDGE_SECRET:'b'.repeat(32),ROSTER_SERVICE_SECRET:'s'.repeat(32)};
 const failed=response({ordinal:0,code:'ROSTER_IMPORT_LIMIT'}),originalFetch=globalThis.fetch;
 globalThis.fetch=async(_url,options)=>{
  const input=JSON.parse(JSON.parse(options.body).payload).input;
  if(input.operation==='edgeReferences')return Response.json({ok:true,data:{adminVerified:true}});
  if(input.operation==='edgeExportManifest')return Response.json(failed.result);
  assert.equal(input.operation,'edgeExportCheckpoint');return Response.json({ok:true,data:{adminVerified:true,sessionId,completed:false}});
 };
 try{
  const store=Import.open(db,binding);await store.reserve();await queueRosterImport(db,binding,who);
  const outcome=await drainRosterImports(db,(input,identity,guard)=>edgeRosterMigration(env,input,identity,{guard}),{maxSteps:1});
  const row=db.sql.prepare('SELECT result_json FROM gsis_roster_import_preparation WHERE session_id=?').get(sessionId);
  assert(row,'the runner reaches preparation: '+JSON.stringify(outcome));
  const saved=JSON.parse(row.result_json).failureReason;
  for(const [key,value] of Object.entries(failed.logs[0]))assert.equal(saved[key],value,'D1 retains the logged '+key);
  assert(!JSON.stringify(saved).includes('PRIVATE'),'D1 job failure contains no raw error or record payload');
  assert.equal(db.sql.prepare('SELECT error_code FROM gsis_roster_import_jobs WHERE session_id=?').get(sessionId).error_code,failed.logs[0].code);
 }finally{globalThis.fetch=originalFetch;db.sql.close();}
 console.log('PASS handled import error: one safe log, bounded fields, unchanged auth boundary, same diagnostic retained by the D1 runner');
})().catch(error=>{console.error(error);process.exitCode=1;});
