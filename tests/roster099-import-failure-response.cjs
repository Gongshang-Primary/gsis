'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),acorn=require('acorn');
const source=fs.readFileSync('backend/Code.gs','utf8'),tree=acorn.parse(source,{ecmaVersion:'latest'});
const declaration=tree.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='doPost');
function run(operation,signature=true){
 const reason={status:507,message:'The frozen source exceeds its limit.',phase:'Hash packed source',elapsed:41000};
 const context={GSIS_DEPLOY_VERSION:'test',Date,JSON,Math,Number,String,RegExp,Utilities:{getUuid:()=> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'},GSISSheets:{resetStats(){}},rosterDiagnosticBuild_:()=> 'test',rosterDiagnostic_:()=>{},gsisApiSecret_:()=> 'a'.repeat(32),same_:()=>signature,signature_:()=>'',gsisBackendKind_:()=> 'roster',gsisRequireBackendAction_:()=>{},rosterStage_:()=>{},contacts_:()=>({}),rosterDispatch_:()=>{throw Object.assign(Error(reason.message),{status:507,failureReason:reason});},rosterDiagnosticError_:e=>e.message,rosterDiagnosticText_:v=>v,rosterAbsenceFailureDetail_:()=>({}),rosterFailureDetail_:()=>({}),out_:v=>v,error_:(status,message)=>{throw Object.assign(Error(message),{status,failureReason:reason});}};
 context.rosterDiagnosticLog_=()=>{};
 const migration=fs.readFileSync('backend/RosterEdgeMigration.gs','utf8'),diagnostic=acorn.parse(migration,{ecmaVersion:'latest'}).body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='rosterEdgeExportDiagnostic_');
 vm.createContext(context);vm.runInContext(migration.slice(diagnostic.start,diagnostic.end),context);vm.runInContext(source.slice(declaration.start,declaration.end),context);
 const request={action:'rosterOperations',timestamp:Date.now(),nonce:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',identity:{email:'admin@gsps.edu.sg',subject:'test'},input:{operation}};
 return JSON.parse(JSON.stringify(context.doPost({postData:{contents:JSON.stringify({payload:JSON.stringify(request),signature:'test'})}})));
}
const result=run('edgeExportManifest');
assert.deepEqual(result.failureReason,{status:507,message:'Preparation failed. Retry the same import.',phase:'Hash packed source',elapsed:41000,code:'ROSTER_GOOGLE_ERROR',ordinal:null,bytes:null,records:null});
assert.equal(run('read').failureReason,undefined,'ordinary Roster failures do not expose import details');
assert.equal(run('edgeExportManifest',false).failureReason,undefined,'unsigned requests do not expose import details');
console.log('PASS authenticated import errors carry failure details without widening other responses');
