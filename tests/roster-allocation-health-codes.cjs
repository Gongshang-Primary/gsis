const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(setImmediate),now=Date.parse('2026-11-17T06:13:43+08:00');
(async()=>{
 const {safeHealthError}=await import('../shared/edge-health.js');
 for(const code of ['SKIPPED_BUSY','SKIPPED_BACKOFF','ALLOCATION_CYCLE_STORAGE','ROSTER_MEMORY_BUSY','PRIVATE_ERROR']){
  const expected=code==='PRIVATE_ERROR'?'UNKNOWN_ERROR':code;
  const snapshot={profile:'google-recovery',readOnly:true,checkedAt:now,storage:{configured:true,available:true},jobs:[{job:'allocation',status:'skipped',code:safeHealthError({code}).code,eventAt:now-300000,lastSuccessAt:null,counts:{timeoutStreak:2,backoff:1,backoffSeconds:300,leaseSeconds:42,leaseLost:1,privateValue:12345}}],recentFailures:[],backlog:{available:false,items:[]}};
  const dom=new JSDOM(fs.readFileSync('roster-update/public/system-health.html','utf8'),{url:'https://roster.test/system-health.html',runScripts:'outside-only'});
  try{
   dom.window.fetch=async()=>({ok:true,status:200,json:async()=>({ok:true,data:snapshot})});
   vm.runInContext(fs.readFileSync('roster-update/public/system-health.js','utf8'),dom.getInternalVMContext());await tick();await tick();
   const text=dom.window.document.querySelector('#jobs-body tr').textContent;
   assert(text.includes(expected),code+' must retain its safe reason through backend and UI');
   for(const [key,value] of Object.entries(snapshot.jobs[0].counts).filter(([key])=>key!=='privateValue'))assert(text.includes(key+': '+value),key+' must be visible');
   assert(!text.includes('privateValue'));assert(!text.includes('PRIVATE_ERROR'));assert.match(text,/No successful run recorded/);
  }finally{dom.window.close();}
 }
 console.log('PASS 5 allocation health cases: busy/backoff/storage/memory reasons, lease counters and unknown-field privacy');
})().catch(error=>{console.error(error);process.exitCode=1;});
