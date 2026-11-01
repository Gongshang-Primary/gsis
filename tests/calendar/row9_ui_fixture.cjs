'use strict';
const fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom'),{makeHarness}=require('./backend_harness.cjs');
const html=fs.readFileSync('calendar-update/public/index.html','utf8');
const source=fs.readFileSync('calendar-update/public/app.js','utf8').replace("document.addEventListener('DOMContentLoaded', init);",'').replace(/\}\)\(\);\s*$/,`window.row9={state,renderAll,setPage,loadBootstrap,openEventModal,openParentModal,openRelocation,closeModal,loadCalendarJobs,captureEventViewPosition,restoreEventViewPosition,refreshEventViewLocally,jumpViewToTodayOnce,bindStaticEvents};})();`);
function fixture(page='events',options={}){
 const h=makeHarness(),data=h.call('bootstrap',{year:2026});data.version=source.match(/const FRONTEND_VERSION = '([^']+)'/)[1];
 data.venues=Array.from({length:7},(_,i)=>({id:'room-'+i,unit:'B2-0'+i,name:'Room '+i,aliases:['alias-'+i],active:true}));data.venueSource={status:'ready'};
 const dom=new JSDOM(html,{url:'https://calendar.synthetic.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[],jobs=[];
 w.confirm=()=>true;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLCanvasElement.prototype.getContext=()=>({measureText:text=>({width:String(text).length*7})});
 vm.runInContext(fs.readFileSync('calendar-update/public/calendar-core.js','utf8'),dom.getInternalVMContext());
 w.fetch=async(url,options={})=>{
  if(String(url).startsWith('/api/bootstrap')){const result=JSON.parse(JSON.stringify(data)),year=Number(new URL(url,'https://calendar.synthetic.test').searchParams.get('year')||2026);result.year=year;result.selectedYear=year;return {ok:true,status:200,json:async()=>({ok:true,result})};}
  if(url==='/api/calendar-jobs'){
   if(!options.method)return {ok:true,status:200,json:async()=>({ok:true,result:{jobs:JSON.parse(JSON.stringify(jobs))}})};
   const input=JSON.parse(options.body);calls.push(input);const job={jobId:input.payload.operationId,action:input.action,payload:input.payload,state:'QUEUED',blocked:true,attemptOperationId:input.payload.operationId,attempts:0,checks:0};jobs.push(job);return {ok:true,status:202,json:async()=>({ok:true,result:JSON.parse(JSON.stringify(job))})};
  }
  throw Error('Unexpected synthetic request '+url);
 };
 if(options.storageBlocked)Object.defineProperty(w,'sessionStorage',{get(){throw Error('Storage blocked');}});
 vm.runInContext(source,dom.getInternalVMContext());const app=w.row9;Object.assign(app.state,{data,year:2026,page,readOnly:false,calendarJobsEnabled:true});if(!options.skipRender)app.renderAll();
 return {h,data,dom,w,app,calls,jobs,node:id=>w.document.getElementById(id),close:()=>w.close()};
}
module.exports={fixture,settle:()=>new Promise(resolve=>setTimeout(resolve,25))};
