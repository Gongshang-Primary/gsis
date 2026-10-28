const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,'Source',f),'utf8');
const results=[];
async function test(name,fn){try{await fn();results.push({name,ok:true})}catch(e){results.push({name,ok:false,error:e.message});console.error(name+': '+e.stack)}}
const clone=x=>JSON.parse(JSON.stringify(x));
const response=p=>new Response(JSON.stringify(p),{headers:{'Content-Type':'application/json'}});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const base=()=>({Request,Response,Headers,URL,URLSearchParams,AbortController,TextEncoder,TextDecoder,crypto:require('crypto').webcrypto,atob,btoa,console:{log(){},warn(){},error(){}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
const workerEnv={LORD_BACKEND_URL:'https://script.google.com/macros/s/fixture_deployment/exec',LORD_PROXY_SECRET:'fixture-proxy-secret'};
function worker(app,handler,session){
 const cache=new Map(),requests=[];
 const ctx=vm.createContext({...base(),fetch:async(url,init)=>{requests.push({url:new URL(url),init});return handler(url,init)},caches:{default:{match:async req=>cache.get(req.url)?.clone(),put:async(req,res)=>cache.set(req.url,res.clone())}}});
 vm.runInContext(read(app+'/_worker.js').replace('export default {','globalThis.worker = {'),ctx);
 const fetch=ctx.worker.fetch;ctx.worker.fetch=(request,env={})=>fetch(request,{...workerEnv,...env});
 if(app!=='starlord')ctx.readSession=async()=>session||null;
 return {ctx,cache,requests,env:workerEnv,call:(route,method='GET')=>ctx.worker.fetch(new Request('https://test.invalid'+route,{method}),{ASSETS:{fetch:()=>response({asset:true})}})};
}
const staff={sub:'test',email:'staff@gsps.edu.sg',ttbName:'Test Staff',isAdmin:true};
const fresh={teachers:['New'],classes:['5A'],subjects:['SCI'],trolleys:[],bookingResources:[{resource:'Cart A',deviceType:'MacBook Neo',capacity:42}],periods:[]};
function element(){return {textContent:'',value:'',innerHTML:'',disabled:false,hidden:false,inert:false,classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){},style:{setProperty(){}},querySelectorAll:()=>[],remove(){}}}
function storage(){const map={};Object.defineProperties(map,{getItem:{value:key=>map[key]??null},setItem:{value:(key,val)=>map[key]=String(val)},removeItem:{value:key=>delete map[key]}});return map}
function browser(app,options={}){
 const ids=['draftStatus','main','resetAppBtn','reloadDataBtn','reloadDataStatus','networkState','openCount','overdueCount','trolleyCount','deviceCount','returnedTodayCount','timeline','timelineViewport','details','exceptions','dateInput','lastUpdated','countdown','refreshBtn','alertStrip','telegramStatusText','toast','editSelectedBooking','scheduleLoadingOverlay','scheduleLoadingText','currentDayLabel','currentDateTime','pastStrip','activeGrid','boardMain','feedStatus'];
 const nodes=Object.fromEntries(ids.map(id=>[id,element()])),local=storage(),session=storage(),renders=[];
 const document={getElementById:id=>nodes[id]||(options.start?(nodes[id]=element()):null),querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},body:{appendChild(){}},hidden:false};
 const ctx=vm.createContext({...base(),fetch:options.fetch,document,localStorage:local,sessionStorage:session,window:{addEventListener(){},matchMedia:()=>({matches:true})},navigator:{onLine:true},location:{pathname:'/',search:'',origin:'https://test.invalid'},history:{},requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
 let source=options.source || read(app+'/assets/app.js');
 if(app==='lord'){vm.runInContext(read('lord/assets/booking-rules.js'),ctx);vm.runInContext(read('lord/assets/drafts.js'),ctx);source=source.replace('\ninit();',options.start?'\nglobalThis.started=init();':'\n');}
 if(app==='overlord')source=source.replace('\nbootOverlord();',options.start?'\nglobalThis.started=bootOverlord();':'\n');
 if(app==='starlord')source=source.replace('  start();',`  globalThis.api={loadBoard, snapshot:()=>({boardData,lastSuccessfulAt,fetchInFlight,manualReload}),setRender:fn=>{renderBoard=fn;fitBoard=()=>{};}};`);
 if(app==='lord'||app==='overlord')vm.runInContext(read(app+'/assets/reference.js'),ctx);
 vm.runInContext(source,ctx);
 if(app==='lord'){
  vm.runInContext('globalThis.api={state,refreshReferenceInBackground}; state.auth.session={ttbName:"Test Staff"};',ctx);
  if(!options.preserveRender)ctx.renderBooking=ctx.renderBookingEdit=()=>renders.push('booking');
 }
 if(app==='overlord'){
  vm.runInContext('globalThis.api={reloadFromSheets,refresh,refreshReferenceV11,setData:x=>{data=x;},snapshot:()=>({data,reference,manualReload})};overlordSession={ttbName:"Test Staff"};',ctx);
  if(!options.preserveRender)ctx.render=()=>renders.push('dashboard');ctx.setOperationBusy=()=>{};ctx.toast=message=>nodes.toast.textContent=message;
 }
 if(app==='starlord')ctx.api.setRender(rows=>renders.push(clone(rows)));
 return {ctx,api:ctx.api,nodes,local,session,document,renders};
}
function backend(){
 const cache=new Map(),stats={reads:0,referenceReads:0,writes:0};
 const ctx=vm.createContext({...base(),CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,val)=>cache.set(key,val),remove:key=>cache.delete(key)})},ScriptApp:{getProjectTriggers:()=>[]}});
 vm.runInContext(read('backend/Code.gs'),ctx);
 ctx.jsonResponse_=x=>x;ctx.getErrorMessage_=e=>e.message;
 ctx.getReferenceSpreadsheet_=()=>{stats.referenceReads++;return {}};
 ctx.readReferenceTrolleys_=()=>[{name:'A1',defaultQuantity:42,group:'Cart A',deviceType:'MacBook Neo',stylusOption:false,headphoneOption:true}];
 ctx.readReferenceSingleColumn_=()=>['New'];ctx.readReferenceTimetable_=()=>[{code:'1',start:'08:00',end:'08:30'}];
 ctx.validateReferenceData_=()=>{};
 ctx.getTransactionSpreadsheet_=()=>({});
 ctx.getRequiredSheet_=()=>({getLastRow:()=>{stats.reads++;return 1}});
 vm.runInContext('globalThis.keys={reference:LORD_REFERENCE_CONFIG.CACHE_KEY,secret:LORD_CONFIG.PROXY_SECRET};',ctx);
 return {ctx,cache,stats,call:params=>ctx.doGet({parameter:{proxySecret:ctx.keys.secret,...params}})};
}

module.exports={worker,browser,base,element,storage,response,deferred,read,fresh,staff,workerEnv};
