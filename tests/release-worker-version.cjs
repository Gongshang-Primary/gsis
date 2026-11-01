'use strict';
// A version probe needs no configuration, auth, authority, schema, storage or provider.
const assert=require('node:assert/strict'),path=require('node:path'),vm=require('node:vm'),esbuild=require('esbuild');
const label=require('../package.json').gsisBuildLabel;
async function main(){
 let failures=0;
 for(const entry of ['notification-worker/index.js','operations-worker/index.js','calendar-job-worker/worker.mjs']){
  try{
   const built=esbuild.buildSync({absWorkingDir:path.resolve(__dirname,'..'),entryPoints:[entry],bundle:true,write:false,format:'cjs',platform:'node',target:'es2022',logLevel:'silent'}).outputFiles[0].text;
   const scope={module:{exports:{}},exports:{},Response,Request,Headers,URL,TextEncoder,TextDecoder,AbortSignal,Date,console,fetch(){assert.fail('health must not contact a provider');}};
   vm.createContext(scope);vm.runInContext(built,scope);
   const env=new Proxy({},{get(_target,key){assert.fail('health must not read configuration or authority: '+String(key));}});
   const response=await scope.module.exports.default.fetch(new Request('https://worker.test/health'),env);
   assert.equal(response.status,200);const result=await response.json();assert.equal(result.version,label);assert.equal(result.ok,true);assert.equal(response.headers.get('Cache-Control'),'no-store');
   console.log('PASS',entry,'version health reads no configuration/storage/provider');
  }catch(error){failures++;console.error('FAIL',entry,error.message);}
 }
 assert.equal(failures,0,failures+' version health checks failed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
