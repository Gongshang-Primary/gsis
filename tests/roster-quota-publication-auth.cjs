'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync('backend/Code.gs','utf8').replace(/\/\* GSIS_DEPLOY_EDGE_BEGIN \*\/[\s\S]*?\/\* GSIS_DEPLOY_EDGE_END \*\//,()=> '/* GSIS_DEPLOY_EDGE_BEGIN */\n'+fs.readFileSync('backend/DeployEdge.gs','utf8')+'\n/* GSIS_DEPLOY_EDGE_END */');
for(const kind of ['deploy','roster']){
 const secret='quota-auth-test-'.repeat(3),properties={GSIS_SECRET:secret,ROSTER_WRITER_ENABLED:'true',ROSTER_OWNER_SCRIPT_ID:'roster-project'},scope=vm.createContext({console:{log(){},warn(){},error(){}},ScriptApp:{getScriptId:()=> 'roster-project'},PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key]??null,getProperties:()=>({...properties})})},Utilities:{getUuid:crypto.randomUUID,Charset:{UTF_8:'utf8'},computeHmacSha256Signature:(payload,key)=>[...crypto.createHmac('sha256',key).update(payload).digest()]},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})}});
 vm.runInContext(source.replace("const GSIS_BACKEND_KIND='deploy';","const GSIS_BACKEND_KIND='"+kind+"';"),scope);let reads=0;
 scope.rosterDiagnostic_=()=>{};scope.reliefQuotaSource_=()=>{reads++;return {schema:'gsis-roster-quota-source-v1',publications:[],expectedSource:null};};scope.book_=()=>({});scope.index_=()=>({});
 const request=({operation='quotaSnapshot',service='gsis-roster-quota-v1',timestamp=Date.now(),badSignature=false}={})=>{
  const payload=JSON.stringify({action:'deployEdge',service,timestamp,nonce:crypto.randomUUID(),input:{operation,manifest:true}}),signature=crypto.createHmac('sha256',badSignature?'wrong-key':secret).update(payload).digest('hex');
  return JSON.parse(scope.doPost({postData:{contents:JSON.stringify({payload,signature})}}).text);
 };
 const valid=request();assert.equal(valid.ok,kind==='deploy',JSON.stringify(valid));if(kind==='roster'){assert.equal(valid.status,503);assert.match(valid.error,/deploy backend/);}
 const expected=kind==='deploy'?1:0;assert.equal(reads,expected);
 assert.equal(request({badSignature:true}).status,401,'service purpose cannot replace signature verification');
 assert.equal(request({timestamp:Date.now()-61000}).status,401,'stale signed requests are rejected');
 const wrongService=request({service:'other-service'});assert.equal(wrongService.ok,false);if(kind==='deploy')assert.equal(wrongService.status,403);
 const write=request({operation:'fence'});assert.equal(write.ok,false);if(kind==='deploy')assert.equal(write.status,401,'quota service does not bypass school identity for a write');
 assert.equal(reads,expected,'only the valid signed read on the correct backend reaches the producer');
}
console.log('PASS quota source HTTP authentication: real HMAC, freshness, service purpose, read-only identity exception and build role boundaries.');
