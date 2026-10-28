import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';import fs from 'node:fs';
const {default:worker}=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('layout-update/public/_worker.js')).toString('base64')));
const env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',BRIDGE_SECRET:'s'.repeat(64)},url='https://layout.example/api/public/campus?year=2026';
const good={schemaVersion:2,modelVersion:'1.1.0',repository:'layout-current',layoutYear:2026,layoutRevision:'2026-test',cursor:'2026-test',venues:[],classes:[],groups:[]};
const previous=fetch,oldError=console.error;let response,calls=0;console.error=()=>{};globalThis.fetch=async()=>{calls++;return response.clone();};
try{
 for(const [body,kind] of [['<!DOCTYPE html><html><body>Sign in to Google SECRET</body></html>','access'],['<html>ReferenceError: privateThing SECRET</html>','execution'],['<html>Page not found SECRET</html>','deployment'],['<html>Unknown SECRET</html>','html'],['{"unexpected":"SECRET"}','invalid-json']]){
  response=new Response(body);const before=calls,r=await worker.fetch(new Request(url),env),data=await r.json();assert.equal(r.status,503);assert.equal(data.responseInfo.kind,kind);assert.equal(data.code,'UPSTREAM_RESPONSE');assert.equal(calls,before+1,'No replay loop');assert.doesNotMatch(JSON.stringify(data),/SECRET|privateThing/);assert.ok(data.diagnosticId);assert.match(data.error,/Admin|Apps Script/);
 }
 response=Response.json({ok:true,data:{venues:[]}});assert.equal((await(await worker.fetch(new Request(url),env)).json()).code,'UPSTREAM_SCHEMA');
 response=Response.json({ok:true,data:good});const result=await(await worker.fetch(new Request(url),env)).json();assert.equal(result.ok,true);assert.equal(result.data.layoutYear,2026);
 const fresh=await(await worker.fetch(new Request(url+'&since=2026-test'),env)).json();assert.equal(fresh.data.unchanged,true);
 response=Response.json({ok:false,status:503,error:'Layout snapshot checksum differs.'});const invalid=await(await worker.fetch(new Request(url),env)).json();assert.equal(invalid.error,'Layout snapshot checksum differs.','Data faults are distinct from gateway faults');
 console.log('PASS 601 gateway: safe upstream diagnostics, schema enforcement, recovery on Refresh, cursor reads and preserved data faults');
}finally{globalThis.fetch=previous;console.error=oldError;}
