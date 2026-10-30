/* Exercise the actual installation files, not only their source module graph. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url'),JSZip=require('jszip'),acorn=require('acorn');
const root=path.resolve(__dirname,'..'),settings=require('../package.json'),version=settings.gsisRelease,patch=settings.gsisPackageKind==='component-patch';
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gsis-bundles-'));
 const deployment=await JSZip.loadAsync(fs.readFileSync(version==='0.9.8q'?require('./helpers/calendar098q-package.cjs')(root):patch?path.resolve(root,'../deliverables',`GSiS_v${version}_Updated_Deployments.zip`):path.join(root,`GSiS_v${version}_Deployment.zip`)));
 let effects=0;const fetchBefore=globalThis.fetch;
 globalThis.fetch=async()=>{effects++;throw Error('No network expected in packaged boundary checks');};
 async function load(name,source){
  assert(!/(?:import\s+(?:[^;]*?\s+from\s*)?|export\s+[^;]*?from\s*)["']\./.test(source),name+' unresolved relative import');
  acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const file=path.join(directory,name+'.mjs');fs.writeFileSync(file,source);return (await import(pathToFileURL(file).href)).default;
 }
 try{
  for(const app of ['Roster','Deploy']){
   if(patch&&!settings.gsisPatchComponents.includes(app.toLowerCase()+'Frontend')){assert.equal(deployment.file(`${app}_Frontend_v${version}.zip`),null,'unchanged component is not shipped');continue;}
   const frontend=await JSZip.loadAsync(await deployment.file(`${app}_Frontend_v${version}.zip`).async('nodebuffer'));
   const worker=await load(app,await frontend.file('_worker.js').async('string'));
   const response=await worker.fetch(new Request('https://'+app.toLowerCase()+'.gsps.edu.sg/api/config'),{},{});
   assert.equal(response.status,200);assert.equal((await response.json()).version,version);
  }
  if(!patch||settings.gsisPatchComponents.includes('operationsWorker')){
   const operations=await load('operations',await deployment.file(`GSiS_Operations_Worker_v${version}.txt`).async('string'));
   const rejected=await operations.fetch(new Request('https://private/v1/roster',{method:'POST',body:'{}'}),{GSIS_BACKEND_SECRET:'s'.repeat(40)},{});
   assert.equal(rejected.status,401,'unsigned calls must not reach private operational data');
  }else assert.equal(deployment.file(`GSiS_Operations_Worker_v${version}.txt`),null,'recovery package requires no private Worker deployment');
  if(!patch||settings.gsisPatchComponents.includes('notificationWorker')){
   const notification=await load('notifications',await deployment.file(`Roster_Notification_Worker_v${version}.txt`).async('string'));
   assert.equal(typeof notification.queue,'function');
   const waiting=[],oldError=console.error;console.error=()=>{};
   try{await notification.scheduled({cron:'* * * * *',scheduledTime:Date.now()},{GSIS_RECOVERY_MODE:'true',GSIS_JOBS:{prepare(){effects++;throw Error('Paused worker touched D1');}}},{waitUntil:promise=>waiting.push(promise)});await Promise.all(waiting);}finally{console.error=oldError;}
  }else assert.equal(deployment.file(`Roster_Notification_Worker_v${version}.txt`),null,'frontend patch does not replace the notification Worker');
  if(version==='0.9.8q'||/^0[.]9[.]9[a-z]?$/.test(version)){
   const frontend=await JSZip.loadAsync(await deployment.file(`Calendar_Frontend_v${version}.zip`).async('nodebuffer'));
   const calendar=await load('Calendar',await frontend.file('_worker.js').async('string'));
   const config=await calendar.fetch(new Request('https://calendar.example.test/api/client-config'),{GOOGLE_CLIENT_ID:'offline-client'},{});
   assert.equal(config.status,200);assert.equal((await config.json()).frontendVersion,version);
   const denied=await calendar.fetch(new Request('https://calendar.example.test/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'calendarSyncStatus',payload:{syncRunId:'unknown'}})}),{CALENDAR_SESSION_SECRET:'offline-packaging-session-secret'},{});
   assert.equal(denied.status,401);assert.equal((await denied.json()).code,'AUTH_REQUIRED');
   if(version==='0.9.8q')assert.equal(deployment.file(`GSiS_Calendar_Job_Worker_v${version}.txt`),null,'Q does not replace background jobs Worker');
   else {
    const jobs=await load('CalendarJobs',await deployment.file(`GSiS_Calendar_Job_Worker_v${version}.txt`).async('string'));
    assert.equal(typeof jobs.fetch,'function');assert.equal(typeof jobs.scheduled,'function');
   }
  }
  assert.equal(effects,0,'packaged unauthorized/paused boundaries must have no external side effects');
  console.log('PASS actual packaged Pages and standalone Workers: declared component scope, parse, self-contained imports, release labels and authentication/recovery gates');
 }finally{globalThis.fetch=fetchBefore;fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
