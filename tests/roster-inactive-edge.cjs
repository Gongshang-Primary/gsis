const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('roster-update/public/_worker.js','utf8');
const start=source.indexOf('export async function reconcileInactiveReplacements(');
assert(start>=0,'gateway must complete pending inactive replacements with trusted Calendar dates');
const end=source.indexOf('\nfunction configuredSecret(',start);
assert(end>start);
const calls=[],calendarCalls=[];
let response={ok:true,data:{refreshed:true}},calendarAvailable=true;
const scope=vm.createContext({
 Date,Array,Set,Object,Number,Error,
 validDate:value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value)),
 edgeRosterEnabled:()=>false,
 calendarDates:async(_env,dates,who)=>{calendarCalls.push({dates:[...dates],who});return Object.fromEntries(dates.map(date=>[date,{date,available:calendarAvailable,schoolDay:true,parity:'odd'}]));},
 backend:async(_env,action,input,who,traceId)=>{calls.push({action,input,who,traceId});return {result:response,backendMs:7};},
 serviceBackend:async(_env,input)=>{calls.push({input,service:true});return response;},
 console:{error(){}},
});
vm.runInContext(source.slice(start,end).replace('export async function','async function'),scope);
const trustedStart=source.indexOf('export async function trustedOperationsInput(');
scope.notificationStatus=()=>({ready:false});
vm.runInContext(source.slice(trustedStart,start).replace('export async function','async function'),scope);
const run=scope.reconcileInactiveReplacements;
const who={email:'teacher@gsps.edu.sg'},date='2026-11-02';
const result=()=>({ok:true,data:{saved:true,inactiveReplacementDates:[date]}});
(async()=>{
 let original={ok:true,data:{saved:true}};
 assert.equal(await run({}, {operation:'read',view:'reportForm'}, original,who,'trace'),original);
 assert.equal(calls.length,0);assert.equal(calendarCalls.length,0);
 const trusted=await scope.trustedOperationsInput({operation:'directory',inactiveReconcileDates:[date],calendarByDate:{forged:true}}, {},who);
 assert(!Object.hasOwn(trusted,'inactiveReconcileDates'),'browsers cannot request an internal maintenance continuation');
 assert.equal(Object.keys(trusted.calendarByDate).length,0,'the browser cannot supply Calendar proof');

 original=result();response={ok:true,data:{refreshed:true}};
 const refreshed=await run({}, {operation:'read',view:'allocation',date},original,who,'trace');
 assert.equal(refreshed,response);assert.equal(calls.length,1);assert.equal(calls[0].input.operation,'read');assert.equal(calls[0].input.view,'allocation');
 assert.deepEqual([...calls[0].input.inactiveReconcileDates],[date]);assert.equal(calls[0].input.calendarByDate[date].available,true);assert.equal(calls[0].who,who);
 assert(!Object.hasOwn(refreshed.data,'inactiveReplacementDates'));

 calls.length=0;calendarCalls.length=0;original=result();response={ok:true,data:{refreshed:true}};
 const saved=await run({}, {operation:'saveAbsence',requestId:'stable-command',date},original,who,'trace');
 assert.equal(saved,original,'a completed mutation retains its own receipt/result');
 assert.equal(calls[0].input.operation,'read','maintenance never repeats the mutation');assert.equal(calls[0].input.view,'reportForm');assert(!Object.hasOwn(calls[0].input,'requestId'));
 assert(!Object.hasOwn(saved.data,'inactiveReplacementDates'));

 calls.length=0;calendarCalls.length=0;original=result();response={ok:true,data:{reconciled:true}};
 const stamp=Date.parse('2026-11-01T16:00:00+08:00');
 await run({}, {operation:'scheduledRoster',scheduledTime:stamp,date:'2026-11-01'},original,null,'trace',true);
 assert.equal(calls[0].service,true);assert.equal(calls[0].input.operation,'scheduledRoster');assert.equal(calls[0].input.scheduledTime,stamp);
 assert.deepEqual([...calls[0].input.inactiveReconcileDates],[date]);

 calls.length=0;calendarCalls.length=0;original=result();
 await run({}, {operation:'read',calendarByDate:{[date]:{date,available:true,schoolDay:true}}},original,who,'trace');
 assert.equal(calls.length,0,'verified dates with no replacement must not start a maintenance loop');assert.equal(calendarCalls.length,0);

 calls.length=0;calendarCalls.length=0;calendarAvailable=false;original=result();
 await run({}, {operation:'read'},original,who,'trace');
 assert.equal(calls.length,0,'unavailable Calendar cannot authorize replacement');assert.equal(original.data.inactiveReconciliationPending,true);
 calendarAvailable=true;

 calls.length=0;calendarCalls.length=0;
 const many=Array.from({length:65},(_,i)=>new Date(Date.UTC(2026,10,1+i)).toISOString().slice(0,10));
 await run({}, {operation:'read'}, {ok:true,data:{inactiveReplacementDates:many}},who,'trace');
 assert.deepEqual(calendarCalls.map(x=>x.dates.length),[62,3]);assert.equal(calls.length,1);assert.equal(calls[0].input.inactiveReconcileDates.length,65);

 calls.length=0;calendarCalls.length=0;original=result();response={ok:false,error:'Private upstream text'};
 const retained=await run({}, {operation:'saveAbsence',requestId:'stable-command'},original,who,'trace');
 assert.equal(retained,original);assert.equal(retained.data.saved,true);assert.equal(retained.data.inactiveReconciliationPending,true,'follow-up failure does not relabel a saved command as failed');
 assert(!JSON.stringify(retained).includes('Private upstream text'));

 // Exercise the deployed notifier entry graph, not only the gateway helper.
 const bundle=require('../scripts/bundle-worker.cjs').bundle;
 const notifier=await import('data:text/javascript;base64,'+Buffer.from(bundle('notification-worker/dashboard-entry.js')).toString('base64'));
 const originalFetch=globalThis.fetch,originalInfo=console.info,originalError=console.error;
 const serviceCalls=[],calendarReads=[],background=[],later='2026-11-12';
 const env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/roster-fixture/exec',CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar-fixture/exec',CALENDAR_PROXY_SECRET:'calendar-fixture-'.repeat(3),ROSTER_SERVICE_SECRET:'service-fixture-'.repeat(3),ROSTER_AUTOMATION_ENABLED:'true',WHATSAPP_ENABLED:'false'};
 try{
  console.info=console.error=()=>{};
  globalThis.fetch=async(url,options)=>{
   const body=JSON.parse(options.body);
   if(String(url)===env.CALENDAR_APPS_SCRIPT_URL){const selected=body.payload.dates||[body.payload.date],rows=selected.map(date=>({date,schoolDay:true,parity:'odd'}));calendarReads.push([...selected]);return Response.json({ok:true,result:body.action==='rosterDates'?{dates:rows}:rows[0]});}
   assert.equal(String(url),env.APPS_SCRIPT_URL);
   const command=JSON.parse(body.payload).input;serviceCalls.push(command);
   if(command.operation==='scheduledRoster')return Response.json({ok:true,data:command.inactiveReconcileDates?{inactiveReconciled:true,notificationsQueued:0}:{inactiveReplacementDates:[later],notificationsQueued:0}});
   const data={nextAbsenceIntake:{job:null},sendPeerMail:{sent:0},claimNotifications:{transportVersion:2,notifications:[]},inboxPendingDispatch:{replies:[],alerts:[]}}[command.operation]||{};
   return Response.json({ok:true,data});
  };
  await notifier.default.scheduled({scheduledTime:stamp,cron:'* * * * *'},env,{waitUntil:promise=>background.push(promise)});
  await Promise.all(background);
 }finally{globalThis.fetch=originalFetch;console.info=originalInfo;console.error=originalError;}
 const scheduled=serviceCalls.filter(command=>command.operation==='scheduledRoster');
 assert.equal(scheduled.length,2,'real notifier follows the initial tick with one inactive-only reconciliation');
 assert.deepEqual(scheduled[1].inactiveReconcileDates,[later]);assert.equal(scheduled[1].scheduledTime,stamp);
 assert(calendarReads.some(dates=>dates.length===1&&dates[0]===later),'real notifier fetches the affected future date beyond the initial checkpoint week');
 console.log('PASS inactive replacement gateway: exact dates, bounded Calendar reads, read refresh, no mutation replay, scheduler continuation and retained saved result on failure');
})().catch(error=>{console.error(error);process.exitCode=1;});
