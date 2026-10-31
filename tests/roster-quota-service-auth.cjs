'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync('backend/Code.gs','utf8'),start=source.indexOf('function doPost('),end=source.indexOf('\nfunction ',start+1),secret='quota-fixture-secret-'.repeat(3),now=Date.now();
function harness(role='deploy'){
 let reads=0;
 const scope={console,GSIS_DEPLOY_VERSION:'0.9.9',GSIS_BACKEND_KIND:role,Date,Utilities:{getUuid:()=> '00000000-0000-4000-8000-000000000001'},GSISSheets:{resetStats(){}},rosterDiagnosticBuild_:()=> 'test',rosterDiagnostic_(){},rosterAbsenceFailureDetail_:()=>({}),rosterDiagnosticError_:()=> '',rosterDiagnosticText_:()=> '',gsisApiSecret_:()=>secret,signature_:(payload,key)=>crypto.createHmac('sha256',key).update(payload).digest('hex'),same_:(a,b)=>a===b,out_:value=>value,error_:(status,message)=>{throw Object.assign(Error(message),{status});},props_:()=>({getProperty:()=>null}),book_:()=>({}),index_:()=>({}),reliefQuotaSource_:()=>{reads++;return {readOnly:true};}};
 vm.createContext(scope);vm.runInContext(fs.readFileSync('backend/BackendRole.gs','utf8'),scope);vm.runInContext(fs.readFileSync('backend/DeployEdge.gs','utf8'),scope);vm.runInContext(source.slice(start,end),scope);
 const post=(change={},badSignature=false)=>{const request={action:'deployEdge',service:'gsis-roster-quota-v1',input:{operation:'quotaSnapshot',manifest:true},timestamp:now,nonce:'00000000-0000-4000-8000-000000000001',...change},payload=JSON.stringify(request),signature=badSignature?'0'.repeat(64):scope.signature_(payload,secret);return scope.doPost({postData:{contents:JSON.stringify({payload,signature})}});};
 return {post,reads:()=>reads};
}
const good=harness();assert.equal(good.post().ok,true,'the signed quota service reads publications without impersonating a staff account');assert.equal(good.reads(),1);
for(const request of [{service:'another-service'},{timestamp:now-120000},{input:{operation:'export'}}]){
 const h=harness(),result=h.post(request);assert.equal(result.ok,false);assert([401,403].includes(result.status));assert.equal(h.reads(),0);
}
const bad=harness();assert.equal(bad.post({},true).status,401);assert.equal(bad.reads(),0);
const roster=harness('roster');assert.equal(roster.post().ok,false,'the Roster backend cannot serve Deploy publication evidence');assert.equal(roster.reads(),0);
console.log('PASS quota source authentication: signature, freshness, service, backend role and read-only operation gates.');
