'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto').webcrypto;
function harness(app,payload){
 const source=fs.readFileSync('lord-suite/Source/'+app+'/_worker.js','utf8'),cache=new Map(),state={payload,time:1793424000000,calls:0,fail:false};
 class Clock extends Date {static now(){return state.time;}}
 const scope=vm.createContext({URL,Request,Response,Headers,AbortController,TextEncoder,TextDecoder,Uint8Array,Date:Clock,Intl,crypto,setTimeout,clearTimeout,console,
  fetch:async()=>{state.calls++;if(state.fail)throw Error('offline');return Response.json(state.payload);},
  caches:{default:{match:async key=>cache.get(key.url||key)?.clone(),put:async(key,value)=>{cache.set(key.url||key,value.clone());}}}});
 vm.runInContext(source.replace('export default','globalThis.worker ='),scope);
 return {scope,state,cache,env:{LORD_BACKEND_URL:'https://script.google.com/macros/s/FIXTURE/exec',LORD_PROXY_SECRET:'fixture-secret'}};
}
async function labelled(response,label){
 assert.equal(response.headers.get('X-GSiS-Build-Label'),label);
 const payload=await response.clone().json();
 assert.equal(payload.buildLabel,label||undefined);
 return payload;
}
(async()=>{
 for(const app of ['lord','overlord']){
  const h=harness(app,{ok:true,buildLabel:'0.9.9c',generatedAt:'fixture',data:{resources:[]},selectedDayBookings:[{private:true}]});
  let response=await h.scope.loadReferenceResponse(h.env);
  await labelled(response,'0.9.9c');assert.equal(h.state.calls,1);
  const stored=await [...h.cache.values()][0].clone().json();
  assert.equal(stored.buildLabel,'0.9.9c');
  if(app==='lord')assert(!('selectedDayBookings' in stored),'LORD shared reference does not retain dated bookings');
  response=await h.scope.loadReferenceResponse(h.env);
  await labelled(response,'0.9.9c');assert.equal(h.state.calls,1,'fresh cache needs no new fetch');
  h.state.time+=61000;h.state.fail=true;
  response=await h.scope.loadReferenceResponse(h.env);
  await labelled(response,'0.9.9c');assert.equal(h.state.calls,2);
  assert.equal(response.headers.get(app==='lord'?'X-LORD-Reference':'X-OVERLORD-Reference'),'edge-stale');
  for(const buildLabel of [undefined,'invalid\r\nheader']){
   const value={ok:true,data:{resources:[]},...(buildLabel===undefined?{}:{buildLabel})},m=harness(app,value);
   assert.equal((await m.scope.loadReferenceResponse(m.env)).headers.get('X-GSiS-Build-Label'),null);
   assert.equal((await m.scope.loadReferenceResponse(m.env)).headers.get('X-GSiS-Build-Label'),null);
   assert.equal(m.state.calls,1);
  }
 }
 const over=harness('overlord',{ok:true,buildLabel:'0.9.9d',cacheReloaded:true,reference:{resources:[]}});
 await over.scope.proxyTransaction(new Request('https://school.invalid/api/transaction?action=dashboard&forceRefresh=1'),{email:'admin@example.invalid',sub:'fixture',ttbName:'Admin',isAdmin:true},over.env);
 assert.equal(over.state.calls,1);
 await labelled(await over.scope.loadReferenceResponse(over.env),'0.9.9d');
 assert.equal(over.state.calls,1,'reload cache keeps its actual label without a new fetch');
 const star=harness('starlord',{ok:true,buildLabel:'0.9.9c',bookings:[]}),request=new Request('https://school.invalid/api/board?date=2026-10-30');
 await labelled(await star.scope.loadBoardResponse(request,star.env),'0.9.9c');
 await labelled(await star.scope.loadBoardResponse(request,star.env),'0.9.9c');
 assert.equal(star.state.calls,1,'STARLORD cache retains the live response label');
 console.log('PASS actual backend labels survive live, fresh, stale, reload and board caches');
})().catch(error=>{console.error(error);process.exitCode=1;});
