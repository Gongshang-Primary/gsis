const componentVersions=require('../../package.json').gsisComponentVersions;
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const baselineFile=file=>fs.readFileSync(path.join(__dirname,'baselines/v1.4',file),'utf8');
const {worker,browser,base,response,deferred,fresh,staff}=require('./frontend_harness.cjs');
const results=[];
const tick=()=>new Promise(setImmediate);
async function test(name,fn){try{await fn();results.push({name,ok:true});}catch(error){results.push({name,ok:false,error:error.stack});}}
function legacyCloudflare(handler){return async(url,init)=>{
  if(Object.hasOwn(init,'cache'))throw new Error("The 'cache' field on 'RequestInitializerDict' is not implemented.");
  return handler(url,init);
};}
function assertFreshOptions(init){
  assert.equal(Object.hasOwn(init,'cache'),false);
  assert.match(new Headers(init.headers).get('Cache-Control'),/no-store/);
  assert.equal(new Headers(init.headers).get('Pragma'),'no-cache');
  assert.equal(init.cf.cacheEverything,false);
  assert.equal(init.cf.cacheTtlByStatus['100-599'],-1);
  assert.equal(init.cf.cacheTtl,undefined);
  assert(init.signal instanceof AbortSignal);
}
const snapshot=tag=>({date:new Date().toLocaleDateString('en-CA'),resources:[],periods:[],bookings:[],movements:[],metrics:{},telegram:{},tag});
(async()=>{
  await test('Original v1.4 STARLORD fails before reaching backend on the documented legacy runtime',async()=>{
    let calls=0;
    const original=baselineFile('Source/starlord/_worker.js');
    const ctx=vm.createContext({...base(),fetch:legacyCloudflare(async()=>{calls++;return response({ok:true,bookings:[]});})});
    vm.runInContext(original.replace('export default {','globalThis.worker={'),ctx);
    const res=await ctx.worker.fetch(new Request('https://test.invalid/api/board?date=2026-10-09'),{});
    assert.equal(res.status,502);assert.equal(calls,0);
  });
  for(const force of [false])await test(`STARLORD ${force?'forced':'normal'} feed reaches backend without compatibility flags`,async()=>{
    const h=worker('starlord',legacyCloudflare(async(url,init)=>{assertFreshOptions(init);assert.equal(new Headers(init.headers).get('Accept'),'application/json');return response({ok:true,cacheReloaded:force,bookings:[]});}));
    const res=await h.call('/api/board?date=2026-10-09'+(force?'&forceRefresh=1':''));
    assert.equal(res.status,200);assert.equal((await res.json()).ok,true);assert.equal(h.requests.length,1);
    assert.equal(res.headers.get('X-LORD-Worker-Version'),componentVersions.starlordFrontend);
  });
  for(const app of ['lord','overlord'])for(const force of [false])await test(`${app} ${force?'forced':'ordinary'} reference request supports older Workers`,async()=>{
    const h=worker(app,legacyCloudflare(async(url,init)=>{assertFreshOptions(init);return response({ok:true,cacheReloaded:force,data:fresh});}),staff);
    const res=await h.call('/api/reference'+(force?'?forceRefresh=1':''));
    assert.equal(res.status,200);assert.equal(h.requests.length,1);assert.equal((await res.json()).ok,true);
    assert.equal(res.headers.get('X-LORD-Worker-Version'),componentVersions[app+'Frontend']);
    if(force)assert.equal(h.requests[0].url.searchParams.get('forceRefresh'),'1');
  });
  await test('OVERLORD forced dashboard stays fresh on older Workers and reports backend duration',async()=>{
    const h=worker('overlord',legacyCloudflare(async(url,init)=>{assertFreshOptions(init);return response({ok:true,cacheReloaded:true,data:snapshot('live'),reference:fresh});}),staff);
    const res=await h.call('/api/dashboard?date=2026-10-09&forceRefresh=1');
    assert.equal(res.status,200);assert.match(res.headers.get('Server-Timing'),/^backend;dur=\d+$/);assert.equal(h.requests.length,1);
  });
  await test('OVERLORD ordinary dashboard preserves its single request and reports backend duration',async()=>{
    const h=worker('overlord',legacyCloudflare(async(url,init)=>{assert.equal(init.cache,undefined);return response({ok:true,data:snapshot('live')});}),staff);
    const res=await h.call('/api/dashboard?date=2026-10-09');assert.equal(res.status,200);assert.match(res.headers.get('Server-Timing'),/^backend;dur=\d+$/);assert.equal(h.requests.length,1);
  });
  await test('Compatibility normalization preserves body, headers, nonce, method, and original options',async()=>{
    const h=worker('starlord',()=>response({ok:true,bookings:[]}));const original={cache:'no-store',method:'POST',body:'{"example":true}',headers:{'Content-Type':'application/json'},cf:{cacheTtl:30},redirect:'follow'};
    const controller=new AbortController();const out=h.ctx.compatibleFetchOptions(original,controller.signal);
    assert.equal(out.body,original.body);assert.equal(out.method,'POST');assert.equal(out.redirect,'follow');assert.equal(new Headers(out.headers).get('Content-Type'),'application/json');assertFreshOptions(out);
    assert.equal(original.cache,'no-store');assert.equal(original.cf.cacheTtl,30);assert.equal(original.headers['Cache-Control'],undefined);
  });
  const failures=[
    ['HTTP error',()=>new Response('unavailable',{status:503}),'BOARD_UPSTREAM_HTTP'],
    ['HTML page',()=>new Response('<html>sign in</html>'),'BOARD_INVALID_JSON'],
    ['backend rejection',()=>response({ok:false,error:'private failure with fake-secret'}),'BOARD_BACKEND_REJECTED'],
    ['wrong payload shape',()=>response({ok:true,data:[]}), 'BOARD_INVALID_FEED'],
    ['network failure',()=>{throw new Error('https://private.example?proxySecret=fake-secret');},'BOARD_NETWORK'],
    ['timeout',()=>{const e=new Error('private');e.name='AbortError';throw e;},'BOARD_TIMEOUT']
  ];
  for(const [name,handler,code] of failures)await test(`STARLORD classifies ${name} without exposing credentials or caching failure`,async()=>{
    const h=worker('starlord',handler);const res=await h.call('/api/board?date=2026-10-09');assert.equal(res.status,502);assert.equal(res.headers.get('X-LORD-Worker-Version'),componentVersions.starlordFrontend);
    const text=await res.text(),payload=JSON.parse(text);assert.equal(payload.code,code);assert.doesNotMatch(text,/fake-secret|private\.example/);assert.equal(h.cache.size,0);
  });
  await test('STARLORD displays safe diagnostic code on first-load failure',async()=>{
    const h=browser('starlord');h.ctx.fetch=async()=>new Response(JSON.stringify({ok:false,code:'BOARD_BACKEND_REJECTED',error:'private'}),{status:502});
    await h.api.loadBoard();assert.match(h.nodes.feedStatus.textContent,/BOARD_BACKEND_REJECTED/);assert.doesNotMatch(h.nodes.feedStatus.textContent,/private/);assert.match(h.nodes.activeGrid.innerHTML,/Retrying automatically/);
  });
  await test('STARLORD never displays arbitrary backend diagnostic text',async()=>{
    const h=browser('starlord');h.ctx.fetch=async()=>new Response(JSON.stringify({ok:false,code:'fake-secret',error:'private'}),{status:502});
    await h.api.loadBoard();assert.match(h.nodes.feedStatus.textContent,/HTTP_502/);assert.doesNotMatch(h.nodes.feedStatus.textContent,/fake-secret|private/);
  });
  await test('OVERLORD shows a 12-hour saved schedule immediately while the live response is pending',async()=>{
    const live=deferred(),calls=[];const h=browser('overlord',{start:true,fetch:async url=>{calls.push(url);return url==='/api/auth/session'?response({ok:true,authenticated:true,session:staff}):live.promise;}});
    const today=vm.runInContext('today()',h.ctx);h.local.setItem('OVERLORD_V1_3_DASHBOARD_'+today,JSON.stringify({savedAt:Date.now()-12*3600000,data:snapshot('saved')}));
    await h.ctx.started;assert.equal(h.api.snapshot().data.tag,'saved');assert.match(h.nodes.lastUpdated.textContent,/Saved schedule.*refreshing live/);
    assert.equal(calls.filter(url=>url.startsWith('/api/dashboard')).length,1);assert.equal(calls.includes('/api/reference'),false);
    live.resolve(response({ok:true,data:snapshot('live')}));await h.api.refresh();assert.equal(h.api.snapshot().data.tag,'live');assert.match(h.nodes.lastUpdated.textContent,/Updated/);
  });
  await test('OVERLORD waits for authentication before showing a stored schedule',async()=>{
    const auth=deferred(),live=deferred();const h=browser('overlord',{start:true,fetch:url=>url==='/api/auth/session'?auth.promise:live.promise});
    const today=vm.runInContext('today()',h.ctx);h.local.setItem('OVERLORD_V1_3_DASHBOARD_'+today,JSON.stringify({savedAt:Date.now(),data:snapshot('private')}));
    assert.equal(h.api.snapshot().data,null);auth.resolve(response({ok:true,authenticated:true,session:staff}));await h.ctx.started;assert.equal(h.api.snapshot().data.tag,'private');live.resolve(response({ok:true,data:snapshot('live')}));await h.api.refresh();
  });
  await test('OVERLORD does not restore yesterday or an expired dashboard on a fresh visit',async()=>{
    const live=deferred();const h=browser('overlord',{start:true,fetch:async url=>url==='/api/auth/session'?response({ok:true,authenticated:true,session:staff}):live.promise});
    const today=vm.runInContext('today()',h.ctx);h.local.setItem('OVERLORD_V1_3_DASHBOARD_'+today,JSON.stringify({savedAt:Date.now()-25*3600000,data:snapshot('expired')}));h.local.setItem('OVERLORD_V1_3_DASHBOARD_2001-01-01',JSON.stringify({savedAt:Date.now(),data:snapshot('wrong date')}));
    await h.ctx.started;assert.equal(h.api.snapshot().data,null);live.resolve(response({ok:true,data:snapshot('live')}));await h.api.refresh();
  });
  await test('OVERLORD loads complete editor reference lists on demand after startup',async()=>{
    const calls=[],timers=[];const h=browser('overlord',{start:true,fetch:async url=>{calls.push(url);if(url==='/api/auth/session')return response({ok:true,authenticated:true,session:staff});return response(url==='/api/reference'?{ok:true,data:fresh}:{ok:true,data:snapshot('live')});}});
    h.ctx.setTimeout=(fn,delay)=>{timers.push({fn,delay});return timers.length;};
    await h.ctx.started;await h.api.refresh();assert.equal(calls.includes('/api/reference'),false);assert.equal(timers.some(t=>t.delay===250),false);
    const refs=await h.ctx.loadReference();assert.equal(refs.teachers[0],'New');assert.equal(calls.filter(x=>x==='/api/reference').length,1);
  });
  await test('Backend retains v1.4 write behavior and configuration; read optimizations are checked against v1.5',async()=>{
    const root=path.resolve(__dirname,'..'),file='Source/backend/Code.gs';
    const settingsContract=require('./settings_contract_changes.cjs');
const propertyContract=require('./property_policy_contract_changes.cjs');
    const previous=settingsContract.context(baselineFile(file)),current=settingsContract.context(fs.readFileSync(path.join(root,file),'utf8'));
    for(const key of Object.keys(previous)){
      if(typeof previous[key]==='function'){
        if(['getOverlordBookings_','getOverlordMovements_','getOverlordTrolleyMap_','getStarlordBoardData_','getStarlordSessionMap_'].includes(key))continue;
        if(require('./evidence_contract_changes.cjs').changed.includes(key)||require('./booking_speed_contract_changes.cjs').changed.includes(key)||propertyContract.changed.includes(key)||settingsContract.changed.includes(key)||require('./v17_allowed_changes.cjs').includes(key)||require('./v18_contract_changes.cjs').changed.includes(key)||require('./gsis_contract_changes.cjs').changed.includes(key))continue;
        const actual=current[key].toString();
        const expected=require('./gsis_contract_changes.cjs').expectedBuildMetadata(key,previous[key].toString());
        assert.equal(key==='doGet'?actual.replace('LORD Suite Backend v1.7','LORD Suite Backend v1.4'):actual,expected,key+' behavior changed');
      }else{
        const old=settingsContract.value(previous,key),now=settingsContract.value(current,key);propertyContract.compareConfig(key,old,now);
        if(key==='LORD_CONFIG'){assert.equal(now.VERSION,componentVersions.lordBackend);now.VERSION=old.VERSION;now.RELEASE_CHANNEL=old.RELEASE_CHANNEL;}
        assert.deepEqual(now,old,key+' configuration changed');
      }
    }
    const additions=['LORD_WA_OPT_IN','adminContacts_','adminDirectory_','assertSetupHeaderV17_','createLORDV17Schema','deliverWhatsAppAlert_','flushWhatsAppAudit_','getAdminSettings_','grantAdmin_','inspectLORDV15Configuration','inspectLORDV16Configuration','inspectLORDV17Configuration','queueWhatsAppAlert_','queueWhatsAppForceClose_','queueWhatsAppOverdue_','readDayKey_','recoverWhatsAppForceClose_','refreshSuiteData_','requireLiveAdmin_','selfTestLORDV15','selfTestLORDV16','selfTestLORDV17','sendWhatsAppTemplate_','suiteCacheSuffix_','transactionSchemaV17_','whatsAppConfig_','whatsAppForceCloseIntent_','whatsAppPhone_','whatsAppText_'];
    // Already present in the supplied v1.8.1 package; independently covered by
    // run_school_agreement_checks.cjs, rather than introduced by GSiS integration.
    const v181Additions=['enableLORDSchoolWhatsAppAgreement','schoolWhatsAppAgreement_'];
    assert.deepEqual(Object.keys(current).filter(k=>!Object.hasOwn(previous,k)).sort(),additions.concat(require('./evidence_contract_changes.cjs').added,require('./booking_speed_contract_changes.cjs').added,propertyContract.added,settingsContract.added,v181Additions,require('./v18_contract_changes.cjs').added,require('./gsis_contract_changes.cjs').added).sort());
    current.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})};
    for(const name of ['jsonResponse_','referenceJsonResponse_'])for(const payload of [{ok:true,data:{saved:true,requestId:'retained'}},{ok:false,error:'Retain failure',code:'UNKNOWN_OUTCOME'}])assert.deepEqual(JSON.parse(current[name]({...payload}).text),{...payload,gsisBuildLabel:require('../../package.json').gsisBuildLabel},'only the required build metadata may change the original response');
    const marker={checked:true};current.selfTestLORDV1=()=>marker;current.inspectLORDV1Configuration=()=>marker;
    assert.equal(current.selfTestLORDV15(),marker);assert.equal(current.inspectLORDV15Configuration(),marker);assert.equal(current.selfTestLORDV16(),marker);assert.equal(current.inspectLORDV16Configuration(),marker);
    const services='Source/backend/appsscript.services.fragment.json';
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,services),'utf8')).dependencies.enabledAdvancedServices,[{userSymbol:'Sheets',version:'v4',serviceId:'sheets'},{userSymbol:'Drive',version:'v3',serviceId:'drive'}]);
  });
  const report={release:'0.9.7',passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,total:results.length,
    sourceSha256:require('./source_fingerprints.cjs')(),environment:'Node VM with simulated older Cloudflare fetch semantics, cache, network and DOM boundaries. No live deployment or rendered browser.',results};
  fs.writeFileSync(path.join(__dirname,'frontend_141_results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,total:report.total}));results.filter(x=>!x.ok).forEach(x=>console.error(x.name+'\n'+x.error));process.exitCode=report.failed?1:0;
})();
