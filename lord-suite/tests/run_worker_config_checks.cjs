// Configuration comes only from Pages bindings; all service traffic is mocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const env={LORD_BACKEND_URL:'https://script.google.com/macros/s/fixture_deployment/exec',LORD_PROXY_SECRET:' fixture-proxy-secret-preserve-spaces ',LORD_SESSION_SECRET:'fixture-session-secret',GOOGLE_CLIENT_ID:'fixture-client'};
const session={email:'teacher@gsps.edu.sg',sub:'fixture-staff',ttbName:'Teacher',isAdmin:true,identityType:'GSPS',exp:Math.floor(Date.now()/1000)+3600};
function fixture(app){
 const calls=[],cache=new Map(),ctx={Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,Date,Intl,console,setTimeout,clearTimeout,crypto:webcrypto,atob,btoa};
 ctx.caches={default:{async match(key){return cache.get(key.url||key)?.clone();},async put(key,response){cache.set(key.url||key,response.clone());}}};
 let handler=async()=>Response.json({ok:true,data:{teachers:['Teacher']},bookings:[]});
 ctx.fetch=async(input,init)=>{calls.push({url:new URL(input),init});return handler(input,init);};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(ROOT,'Source',app,'_worker.js'),'utf8').replace('export default {','globalThis.worker = {'),ctx);
 if(app!=='starlord')vm.runInContext('readSession=async()=>('+JSON.stringify(session)+');',ctx);
 const bindings={...env,ASSETS:{fetch:async()=>new Response('asset')}};
 return {ctx,calls,cache,bindings,setHandler(next){handler=next;},call(route,overrides={},options={}){return ctx.worker.fetch(new Request('https://fixture.invalid'+route,options),{...bindings,...overrides});}};
}
let passed=0;
async function check(name,fn){await fn();passed++;console.log('PASS '+name);}
(async()=>{
 for(const app of ['lord','overlord','starlord']){
  const route=app==='starlord'?'/api/board?date=2026-10-24':'/api/reference?latest=1';
  await check(app+' reads the configured endpoint and exact proxy secret',async()=>{
   const h=fixture(app),response=await h.call(route);assert.equal(response.status,200);assert.equal(h.calls.length,1);
   assert.equal(h.calls[0].url.origin,'https://script.google.com');assert.equal(h.calls[0].url.pathname,'/macros/s/fixture_deployment/exec');
   assert.equal(h.calls[0].url.searchParams.get('proxySecret'),env.LORD_PROXY_SECRET);
   const body=await response.text();assert(!body.includes(env.LORD_PROXY_SECRET));assert(!body.includes(env.LORD_BACKEND_URL));
  });
  await check(app+' fails closed before network or cached data when bindings are invalid',async()=>{
   for(const invalid of [{LORD_PROXY_SECRET:undefined},{LORD_PROXY_SECRET:''},{LORD_PROXY_SECRET:'   '},{LORD_PROXY_SECRET:'REPLACE_PROXY_SECRET'},{LORD_PROXY_SECRET:'bad\nsecret'},
    {LORD_BACKEND_URL:undefined},{LORD_BACKEND_URL:'http://script.google.com/macros/s/fixture/exec'},
    {LORD_BACKEND_URL:'https://evil.invalid/macros/s/fixture/exec'},{LORD_BACKEND_URL:'https://script.google.com/macros/s/REPLACE_DEPLOYMENT_ID/exec'},
    {LORD_BACKEND_URL:'https://script.google.com/macros/s/fixture/dev'},{LORD_BACKEND_URL:'https://script.google.com/macros/s/fixture/exec?private=value'},
    {LORD_BACKEND_URL:'https://user@script.google.com/macros/s/fixture/exec'},{LORD_BACKEND_URL:'https://script.google.com/macros/s/fixture/exec#fragment'}]){
    const h=fixture(app);await h.call(route);h.calls.length=0;
    const out=await h.call(route.replace('?latest=1',''),invalid);assert.equal(out.status,503);assert.equal(h.calls.length,0);
    const body=await out.text();assert(body.includes('LORD_BACKEND_URL'));assert(body.includes('LORD_PROXY_SECRET'));
    for(const value of Object.values(invalid))if(value&&value.length>10)assert(!body.includes(value));
   }
  });
  await check(app+' keeps static assets available without service bindings',async()=>{
   const h=fixture(app);const out=await h.call('/index.html',{LORD_BACKEND_URL:undefined,LORD_PROXY_SECRET:undefined});assert.equal(await out.text(),'asset');assert.equal(h.calls.length,0);
  });
  await check(app+' cannot join a valid in-flight read with missing configuration',async()=>{
   const h=fixture(app);let finish;h.setHandler(()=>new Promise(resolve=>{finish=resolve;}));
   const first=h.call(route);while(!finish)await new Promise(resolve=>setTimeout(resolve,0));
   const denied=await h.call(route,{LORD_PROXY_SECRET:undefined});assert.equal(denied.status,503);assert.equal(h.calls.length,1);
   finish(Response.json({ok:true,data:{teachers:[]},bookings:[]}));assert.equal((await first).status,200);
  });
  if(app!=='starlord')await check(app+' uses binding credentials on both transaction transports',async()=>{
   const h=fixture(app);
   assert.equal((await h.call('/api/transaction?action=bookingGet&proxySecret=caller-value')).status,200);
   assert.equal(h.calls[0].url.searchParams.get('proxySecret'),env.LORD_PROXY_SECRET);
   assert.equal((await h.call('/api/transaction',{}, {method:'POST',body:JSON.stringify({action:'bookingCancel',proxySecret:'caller-value'})})).status,200);
   assert.equal(JSON.parse(h.calls[1].init.body).proxySecret,env.LORD_PROXY_SECRET);
  });
 }
 await check('LORD does not turn missing configuration into a fallback identity',async()=>{
  const h=fixture('lord');await assert.rejects(()=>h.ctx.identityLookup('teacher@gsps.edu.sg','fixture',{}),error=>error.status===503);assert.equal(h.calls.length,0);
 });
 console.log('PASS '+passed+' Worker environment configuration checks');
})().catch(error=>{console.error(error);process.exitCode=1;});
