/* All staff interactions remain in this frontend. */
(()=>{
 const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const displayDate=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return String(value||'');const date=new Date(value+'T12:00:00Z');return new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',day:'numeric',month:'short',year:'numeric'}).format(date)+' ('+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',weekday:'short'}).format(date)+')';};
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let profile=null,page='Home',day=today(),current=null,selected=[],pending=null,busy=false,sequence=0,followingToday=true,uploadDraft=null,importSequence=0;
 let baselinePage='saved',timetablePage='teacher',chosenNames={teacher:'',class:'',tg:''},ownTimetableDate=null,lastPeriod=null,profileDay='',cacheGeneration=0,checkingFreshness=false,profileCheckedAt=0,loadingProfile=false,queuedProfileLoad=false,sessionEpoch=0;
 const apiReads=new Map();let apiReadGeneration=0,assignDateRead=null;
 const loadingReads=new Set();let loadClock=null,loadStarted=0;
 function resetLoadCounter(){loadingReads.clear();clearInterval(loadClock);loadClock=null;const host=$('loadCounter');if(host){host.hidden=true;host.textContent='';}}
 async function timedRead(request){
  const host=$('loadCounter');if(!host)return request();
  const ticket=Symbol();loadingReads.add(ticket);
  if(loadingReads.size===1){
   loadStarted=performance.now();host.hidden=false;
   const tick=()=>{host.textContent='Loading… · '+Math.floor((performance.now()-loadStarted)/1000)+'s';};tick();loadClock=setInterval(tick,1000);
  }
  try{return await request();}finally{if(loadingReads.delete(ticket)&&!loadingReads.size)resetLoadCounter();}
 }
 const timetableDays=new Map();let homeDutyTicket=0,homeDutyDay='',homeAcknowledgementDispose=null,homeReliefTicket=0,homeReliefDay='',homeReliefCache=null;
 let preloadSchedule=0,preloadCheckedAt=0,preloadStatus=null,preloadPlanKeys={};
 const timetablePreload=window.RosterTimetablePreload?.create({api:(route,input,method,token)=>api(route,input,method,token,{background:true}),scope:()=>cacheOwner(),today,canReadDrafts:()=>!!(profile?.user.smc||profile?.user.admin),onBaseline:()=>window.RosterOpsUI?.referencesChanged?.(),onSuspended:installSuspendedPreview,onStatus:value=>{preloadStatus=value;showPreloadStatus();}});
 function installSuspendedPreview(payload){
  preloadCheckedAt=Date.now();const next=payload.planKeys||Object.fromEntries((payload.plans||[]).map(row=>[row.date,String(row.revision)+':'+String(row.confirmedRevision)])),changed=new Set([...Object.keys(preloadPlanKeys),...Object.keys(next)].filter(date=>preloadPlanKeys[date]!==next[date]));preloadPlanKeys=next;
  for(const [key,row] of timetableDays)if(changed.has(row.date))timetableDays.delete(key);
  if(page==='Timetable'&&(current?.model||current?.dayModel)&&changed.has(day)){current.dayCheck='checking';checkTimetableDay(sequence);}
  window.RosterOpsUI?.referencesChanged?.();
 }
 function showPreloadStatus(){
  showHomeTimetable();
  const host=$('content').querySelector('[data-timetable-preload]');if(!host||!preloadStatus)return;
  const phase=preloadStatus.phase,loading=['baseline','suspended'].includes(phase);host.classList.toggle('ops-status-pending',loading);
  host.replaceChildren();if(loading){const spinner=document.createElement('span');spinner.className='timetable-day-spinner';spinner.setAttribute('aria-hidden','true');host.append(spinner);}
  host.append(document.createTextNode(phase==='cached'?'Ready on this device. Checking timetable update tags…':phase==='ready'?'Timetables ready through '+displayDate(preloadStatus.to)+'.':phase==='baseline'?'Loading baseline timetables in the background…':phase==='suspended'?'Baselines ready. Loading suspended timetables…':'Timetable preload unavailable. You can still open each timetable normally.'));
 }
 function scheduleTimetablePreload(refresh=false){
  if(!timetablePreload||!profile||!refresh&&timetablePreload.isDue?.()===false)return;const ticket=++preloadSchedule;
  // Let the home icons paint before transfer or decompression work begins.
  requestAnimationFrame(()=>setTimeout(()=>{if(ticket!==preloadSchedule||!profile)return;timetablePreload.start({refresh});},0));
 }
 function clearTimetablePreload(){preloadSchedule++;preloadCheckedAt=0;preloadStatus=null;preloadPlanKeys={};timetablePreload?.clear();}
 const reads=new Map(),models=new Map(),modelReads=new Map(),availabilityReads=new Map();let availability=null,availabilitySequence=0,viewFields={};
 const functions=[
  {name:'Baseline Timetable',icon:'baseline',description:'Manage saved timetables; Admin can upload',baseline:true},
  {name:'Timetable',icon:'timetable',description:'View and export teacher, class or TG timetables'},
  {name:'Check Availability',icon:'availability',description:'Find common periods to meet'},
  {name:'Stapler',icon:'stapler',description:'Suspended Timetable Advance PLannER'},
  {name:'SMC Duty Roster',icon:'smc-duty',description:'Choose duty members and duty dates',smc:true},
  {name:'WhatsApp Inbox',icon:'whatsapp-inbox',description:'Read and reply from the school number',smc:true},
  {name:'Daily Updates',icon:'daily-employment',description:'View original daily absence and relief reports',smc:true},
  {name:'Statistics',icon:'statistics',description:'Explore and export absence and relief statistics',smc:true,accessLabel:'SMC / Admin'},
  {name:'Learn about Auto Allocation',icon:'allocation-learning',description:'Your calculations, current business rules and allocation log guide'},
  {name:'System Config',icon:'system-config',description:'View subject rules and automatic allocation; Admin can change',smc:true,accessLabel:'SMC / Admin'}
 ];
 const operations=()=>window.RosterOpsUI?.pages(profile)||[];
 const homeOrder=['Report Absence','Manage reported absences','Assign Relief','Daily Notify','Absences by Date','Manage Ad-hoc relief','Stapler','WhatsApp Inbox','Check Availability','Timetable','Daily Updates','Statistics','Baseline Timetable','My Relief Duties','Learn about Auto Allocation','Recess Regression','SMC Duty Roster','Custom Notifications','Manage Absence Type','System Config','Opening balances','Prune records'];
 const allowedFunctions=()=>[...operations(),...functions].filter(f=>(!f.smc||profile?.user.smc||profile?.user.admin)&&(!f.admin||profile?.user.admin)&&(!f.baseline||profile?.user.smc||profile?.user.admin)).sort((a,b)=>homeOrder.indexOf(a.name)-homeOrder.indexOf(b.name));
 const isOperations=()=>operations().some(f=>(f.name||f.id)===page);
 const activePlanner=()=>page==='Stapler'&&window.RosterStaplerUI?.isPlanning?.()===true;
 const operationsDirty=()=>[window.RosterOpsUI,window.RosterStaplerUI,window.RosterDutyUI,window.RosterSettingsUI,window.RosterInboxUI].some(ui=>ui?.isDirty?.()===true);
 const operationsLeaveWarning=()=>[window.RosterOpsUI,window.RosterStaplerUI,window.RosterDutyUI,window.RosterSettingsUI,window.RosterInboxUI].some(ui=>ui?.needsLeaveWarning?ui.needsLeaveWarning():ui?.isDirty?.()===true);
 const unmount=()=>{homeAcknowledgementDispose?.();homeAcknowledgementDispose=null;window.RosterStatisticsUI?.unmount?.();window.RosterOpsUI?.unmount();window.RosterStaplerUI?.unmount();window.RosterDutyUI?.unmount();window.RosterSettingsUI?.unmount();window.RosterInboxUI?.unmount();window.RosterCalculationsUI?.unmount();window.RosterLearningUI?.unmount();};
 function status(text,error=false){const warning=!text&&!error?window.RosterOpsUI?.persistentWarning?.()||'':'';$('status').textContent=text||warning;$('status').classList.toggle('error',error);$('status').classList.toggle('ops-status-pending',!!text&&!error);$('status').classList.toggle('ops-warning-text',!!warning);}
 // Share only identical in-flight reads. A write creates a new generation, so
 // a later refresh cannot attach to a response started before that write.
 function api(route,input={},method='POST',token,options={}){
  const readonly=route==='profile'||route==='read'||route==='operations'&&['openingBalances','currentDuty','nextSchoolDay','calculations','allocationVersion','teacherDailyUpdate','read','directory','candidates','availability','audit','archiveItems','archivedItem','prunePreview','accounting','allocation','history','exportDaily','stapler','dutyRoster','dailyTimetable','timetableBatch','timetableDay','previewRestoreStapler','staplerDates','systemConfig','dailyEmployment','dailyNotify','nameBridges','inboxList','inboxThread','inboxTemplates','receiptStatus','statistics','statisticsCalendar','acknowledgementStatus'].includes(input.operation);
  if(!readonly){
   // Absence, Inbox and delivery writes do not change immutable timetable content.
   const baselineWrite=['upload','update','remove'].includes(route),timetableWrite=['saveStapler','confirmStapler','resetStapler','publishStapler','renameStapler','moveStapler','deleteStapler','restoreStapler','publish'].includes(input.operation);
   if(baselineWrite||timetableWrite){preloadSchedule++;preloadCheckedAt=0;timetablePreload?.invalidate(!baselineWrite&&input.date?[input.date,...(input.newDate?[input.newDate]:[])]:undefined);if(baselineWrite)timetableDays.clear();else for(const [key,row] of timetableDays)if([input.date,input.newDate].includes(row.date))timetableDays.delete(key);}
   apiReadGeneration++;apiReads.clear();invalidateHomeRelief();return route==='session'?timedRead(()=>requestApi(route,input,method,token)):requestApi(route,input,method,token);
  }
  const key=JSON.stringify([sessionEpoch,apiReadGeneration,route,method,input,...(input.operation==='currentDuty'?[today()]:[])]);
  let entry=apiReads.get(key);
  if(entry)entry.shared=true;else{entry={shared:false};entry.promise=requestApi(route,input,method,token).finally(()=>{if(apiReads.get(key)===entry)apiReads.delete(key);});apiReads.set(key,entry);}
  const ownDutyRead=route==='operations'&&input.operation==='read'&&input.view==='duties',context=ownDutyRead?{owner:cacheOwner(),epoch:sessionEpoch,generation:apiReadGeneration,date:today(),revision:profile?.revision}:null;
  const result=entry.promise.then(data=>{if(context)rememberHomeRelief(data,context);return entry.shared?JSON.parse(JSON.stringify(data)):data;});return options.background?result:timedRead(()=>result);
 }
 const calendarProofs=new Map(),calendarContexts=new Map();let reportFormRead=null;
 const calendarProofId=()=> 'calendar:proof:'+(document.querySelector('script[src*="roster.js"]')?.getAttribute('src')||'1');
 const calendarProofValid=value=>value&&typeof value.payload==='string'&&value.payload.length>0&&value.payload.length<=65536&&/^[a-f0-9]{64}$/i.test(value.signature||'');
 const calendarProofRead=(route,input)=>route==='operations'&&(input.operation==='nextSchoolDay'||input.operation==='allocationVersion'&&!input.statusOnly||input.operation==='read'&&['allocation','report','entry'].includes(input.view));
 async function getCalendarProof(owner){
  if(!owner)return null;let entry=calendarProofs.get(owner);if(!entry){entry={};calendarProofs.set(owner,entry);entry.promise=(async()=>{try{const saved=await window.RosterBaselineCache?.getSnapshot(owner,calendarProofId()),value=saved&&JSON.parse(saved.data);if(calendarProofs.get(owner)===entry&&calendarProofValid(value))entry.value=value;}catch{}return entry.value||null;})();}return entry.value||entry.promise;
 }
 function rememberCalendarProof(owner,value){
  if(!owner||!calendarProofValid(value))return;const previous=calendarProofs.get(owner)?.value;if(previous?.payload===value.payload&&previous.signature===value.signature)return;calendarProofs.set(owner,{value});try{window.RosterBaselineCache?.putSnapshot(owner,calendarProofId(),{data:JSON.stringify(value)});}catch{}
 }
 const calendarContextId=()=>calendarProofId()+':dates';
 function validCalendarContext(value){return value&&Number.isFinite(value.checkedAt)&&value.checkedAt<=Date.now()&&value.dates&&typeof value.dates==='object'&&!Array.isArray(value.dates)&&Object.keys(value.dates).length<=62&&Object.entries(value.dates).every(([date,row])=>/^\d{4}-\d{2}-\d{2}$/.test(date)&&row?.date===date&&typeof row.available==='boolean');}
 async function restoreCalendarContext(owner){
  if(!owner)return null;let entry=calendarContexts.get(owner);if(!entry){entry={};calendarContexts.set(owner,entry);entry.promise=(async()=>{try{const saved=await window.RosterBaselineCache?.getSnapshot?.(owner,calendarContextId()),value=saved&&JSON.parse(saved.data);if(calendarContexts.get(owner)===entry&&validCalendarContext(value))entry.value=value;}catch{}return entry.value||null;})();}return entry.value||entry.promise;
 }
 function rememberCalendarContext(owner,data){
  if(!owner||!data?.calendarByDate)return;const value={checkedAt:data.calendarCheckedAt,dates:data.calendarByDate};
  if(!validCalendarContext(value)){calendarContexts.delete(owner);window.RosterBaselineCache?.removeSnapshot?.(owner,calendarContextId());return;}
  if(JSON.stringify(calendarContexts.get(owner)?.value)===JSON.stringify(value))return;
  calendarContexts.set(owner,{value});try{window.RosterBaselineCache?.putSnapshot?.(owner,calendarContextId(),{data:JSON.stringify(value)});}catch{}window.RosterOpsUI?.referencesChanged?.();
 }
 function forgetCalendarProof(owner){calendarProofs.delete(owner);calendarContexts.delete(owner);if(owner){window.RosterBaselineCache?.removeSnapshot?.(owner,calendarProofId());window.RosterBaselineCache?.removeSnapshot?.(owner,calendarContextId());}}
 async function requestApi(route,input={},method='POST',token,plainTimetable=false){
  const epoch=sessionEpoch,requestView=sequence,requestPlanner=window.RosterStaplerUI?.planningToken?.(),connectionMessage=route==='operations'&&!['currentDuty','nextSchoolDay','calculations','allocationVersion','teacherDailyUpdate','read','directory','candidates','availability','audit','archiveItems','archivedItem','prunePreview','externalLink','health','accounting','allocation','history','exportDaily','dailyTimetable','timetableBatch','timetableDay','stapler','dutyRoster','staplerDates','systemConfig','dailyEmployment','dailyNotify','nameBridges','inboxList','inboxThread','inboxTemplates','receiptStatus','statistics','statisticsCalendar','acknowledgementStatus'].includes(input.operation)?'The Roster save could not be confirmed. Retry the same save.':['upload','update'].includes(route)?'The timetable save could not be confirmed. Retry the same save.':'Roster is temporarily unavailable. Use Retry or Refresh to try again.';
  const snapshotCache=window.RosterReportCache,scope=reportCacheScope(),calendarOwner=cacheOwner(),calendarEligible=calendarProofRead(route,input);let wireInput=plainTimetable?input:snapshotCache?.prepare(scope,route,input)||input;
  if(calendarEligible){const proof=await getCalendarProof(calendarOwner);if(epoch!==sessionEpoch)throw Object.assign(Error('The signed-in account changed while loading.'),{stale:true});if(proof)wireInput={...wireInput,calendarCache:proof};}
  let r,x;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),route==='upload'?65000:route==='operations'?45000:35000);
  try{r=await fetch('/api/'+route,{method,credentials:'same-origin',signal:controller.signal,headers:{...(method==='POST'?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(method==='POST'?{body:JSON.stringify(wireInput)}:{})});x=await r.json();}catch{throw Error(connectionMessage);}finally{clearTimeout(timer);}
  if(!r.ok||!x.ok){const stale=epoch!==sessionEpoch||(route==='profile'||['staplerDates','stapler'].includes(input.operation))&&(requestView!==sequence||requestPlanner!==window.RosterStaplerUI?.planningToken?.()),e=Error(x.error||'Request failed.');e.stale=stale;e.status=r.status;if(Array.isArray(x.conflicts))e.conflicts=x.conflicts;if(x.currentPlan&&typeof x.currentPlan==='object')e.currentPlan=x.currentPlan;if(x.details&&typeof x.details==='object')e.details=x.details;e.code=/^[A-Z][A-Z0-9_]{1,63}$/.test(x.code||'')?x.code:'';e.diagnosticId=/^[a-f0-9-]{8,36}$/i.test(x.diagnosticId||'')?x.diagnosticId:'';e.backendVersion=/^\d+\.\d+\.\d+[a-z]?$/.test(x.backendVersion||'')?x.backendVersion:'';e.failureStage=/^[a-z][a-z-]{1,40}$/.test(x.failureStage||'')?x.failureStage:'';e.operation=/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(x.operation||'')?x.operation:'';if(r.status===401&&!stale){if(activePlanner()){window.RosterStaplerUI.blockAccess('Your session expired. Download recovery JSON, then use Refresh to sign in again.');if($('systemHealthLink'))$('systemHealthLink').hidden=true;}else{clear();if(route!=='session')failure(e);}}if(r.status===403&&!stale){forgetCalendarProof(calendarOwner);invalidateOperations();if(route==='read'||['availability','timetableBatch','timetableDay'].includes(input.operation)){window.RosterBaselineCache?.removeOwner(cacheOwner());models.clear();invalidateReads();if(availability){availability={people:[],date:day};selected=[];}}if(activePlanner())window.RosterStaplerUI.blockAccess('Planning access could not be verified. Download recovery JSON or use Refresh to verify access.');else if(input.operation==='timetableBatch'&&['Timetable','Stapler'].includes(page)){unmount();sequence++;$('content').innerHTML='<h2>'+esc(page)+'</h2><p class="error">Roster access could not be verified. Refresh to verify your access.</p>';}}throw e;}
  if(calendarEligible&&epoch===sessionEpoch){rememberCalendarProof(calendarOwner,x.data?.calendarCache);rememberCalendarContext(calendarOwner,x.data);}
  if(snapshotCache&&(route==='profile'&&input.view==='report'||route==='operations'&&input.operation==='read'&&input.compact===true&&['report','entry'].includes(input.view))){
   try{if(epoch!==sessionEpoch)throw Object.assign(Error('The signed-in account changed while loading.'),{stale:true});return await snapshotCache.hydrate(route==='profile'?reportCacheScope(x.data?.user,x.data?.revision):scope,route,input,x.data);}
   catch(error){
    if(epoch!==sessionEpoch||error.stale)throw Object.assign(error,{stale:true});
    if(error.code!=='TIMETABLE_SNAPSHOT'||plainTimetable)throw error;
    snapshotCache.forget(scope,route,input);
    // Only read requests use this recovery. Never replay an accepted save because decoding failed.
    return requestApi(route,input,method,token,true);
   }
  }
  return x.data;
 }
 function errorText(e){return e.message+([e.code,e.operation,e.failureStage,e.backendVersion].filter(Boolean).length?' ['+[e.code,e.operation,e.failureStage,e.backendVersion].filter(Boolean).join(' · ')+']':'')+(e.diagnosticId?' Reference: '+e.diagnosticId:'');}
 function failure(e){
  if(e.stale)return;
  status(profile?errorText(e):'',true);
  if(!profile){
   $('content').innerHTML='<section class="recovery"><h2>Roster could not load</h2><p>'+esc(errorText(e))+'</p><button id="retryLoad" class="primary">Retry</button></section>';
   $('retryLoad').onclick=()=>start();
  }
 }
 function cacheOwner(user=profile?.user){return user?.accessVerified===true?JSON.stringify([user.email.toLowerCase(),user.staffId||'',user.smc,user.admin]):'';}
 function reportCacheScope(user=profile?.user,revision=profile?.revision){const owner=cacheOwner(user);return owner?JSON.stringify([location.origin,owner,revision??'']):'';}
 function reportFormMatches(form){const user=profile?.user;return form?.schema===1&&Array.isArray(form.people)&&Array.isArray(form.types)&&form.user?.email===user?.email&&form.user?.staffId===user?.staffId&&form.user?.smc===user?.smc&&form.user?.admin===user?.admin;}
 function getReportForm(){
  const owner=cacheOwner(),date=today();if(!owner)return Promise.resolve(null);
  if(reportFormMatches(profile.reportForm)&&profile.reportForm.today===date)return Promise.resolve(profile.reportForm);
  const key=JSON.stringify([owner,date]);if(reportFormRead?.key===key)return reportFormRead.promise;
  const epoch=sessionEpoch,entry={key};entry.promise=api('operations',{operation:'read',view:'reportForm',date},'POST',undefined,{background:true}).then(value=>{if(epoch!==sessionEpoch||cacheOwner()!==owner||!reportFormMatches(value))return null;profile.reportForm=value;window.RosterOpsUI?.referencesChanged?.();return value;}).finally(()=>{if(reportFormRead===entry)reportFormRead=null;});reportFormRead=entry;return entry.promise;
 }
 async function reportTimetable(date){
  const owner=cacheOwner(),epoch=sessionEpoch;if(!owner||!reportFormMatches(profile.reportForm))return null;
  try{await Promise.all([timetablePreload?.restore?.(),restoreCalendarContext(owner)]);}catch{return null;}
  if(epoch!==sessionEpoch||owner!==cacheOwner())return null;
  const snapshot=timetablePreload?.snapshot?.(),context=calendarContexts.get(owner)?.value,baseline=timetablePreload?.getBaseline?.(date);
  if(!context||!baseline&&!timetablePreload?.getReportDay?.(date))return null;
  const sourceVerifiedUntil=snapshot?.checkedAt?(Math.floor((snapshot.checkedAt-20*60000)/3600000)+1)*3600000+20*60000:0;
  return window.RosterReportCache?.project?.({date,baseline,ready:snapshot.phase==='ready',status:timetablePreload.getTimetableStatus?.(date),effectiveDay:timetablePreload.getReportDay?.(date),calendar:context.dates[date],calendarCheckedAt:context.checkedAt,sourceVerifiedUntil,form:profile.reportForm})||null;
 }
 async function warmHomeReport(tile,prepare){
  const owner=cacheOwner(),epoch=sessionEpoch,mount=sequence,date=today();if(!owner)return;
  const [form,context]=await Promise.all([getReportForm(),restoreCalendarContext(owner)]);
  if(!form||epoch!==sessionEpoch||owner!==cacheOwner()||mount!==sequence||page!=='Home'||!tile.isConnected||today()!==date)return;
  const tomorrow=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10),current=context&&Date.now()-context.checkedAt>=0&&Date.now()-context.checkedAt<300000&&[date,tomorrow].every(day=>context.dates[day]?.date===day&&context.dates[day].available===true&&typeof context.dates[day].schoolDay==='boolean');
  if(!current)await prepare();
 }
 function clear(){calendarProofs.clear();calendarContexts.clear();reportFormRead=null;resetLoadCounter();window.RosterAcknowledgements?.clear();homeDutyTicket++;homeDutyDay='';invalidateHomeRelief();homeReliefDay='';apiReads.clear();window.RosterReportCache?.clear();profileCheckedAt=0;unmount();window.RosterStaplerUI?.reset();window.RosterDutyUI?.reset();window.RosterInboxUI?.reset();window.RosterOpsUI?.resetPreloads();clearPrint();window.RosterBaselineCache?.removeOwner(cacheOwner());models.clear();modelReads.clear();availabilityReads.clear();viewFields={};availability=null;availabilitySequence++;sessionEpoch++;sequence++;importSequence++;invalidateReads();uploadDraft=null;profile=null;current=null;selected=[];chosenNames={teacher:'',class:'',tg:''};lastPeriod=null;baselinePage='saved';timetablePage='teacher';page='Home';$('content').replaceChildren();$('nav').hidden=true;$('navToggle').hidden=true;$('logout').hidden=true;if($('systemHealthLink'))$('systemHealthLink').hidden=true;$('account').textContent='';}
 function baselineDirty(exceptRow){
  if(page!=='Baseline Timetable')return false;
  const area=$(baselinePage==='saved'?'savedTimetables':'uploadForm');
  return !!area&&[...area.querySelectorAll('input,select')].filter(x=>!exceptRow?.contains(x)).some(x=>x.type==='file'?x.files.length>0:x.type==='checkbox'?false:x.tagName==='SELECT'?x.value!==([...x.options].find(o=>o.defaultSelected)||x.options[0])?.value:x.value!==x.defaultValue);
 }
 function discardDraft(exceptRow){
  if(operationsLeaveWarning()&&!confirm('Leave your unsaved Roster changes?'))return false;
  if((uploadDraft||baselineDirty(exceptRow))&&!pending&&!confirm(exceptRow?'Discard unsaved changes in other timetable rows?':'Discard your unsaved timetable changes?'))return false;
  uploadDraft=null;importSequence++;return true;
 }
 function nav(){
  const allowed=['Home',...allowedFunctions().map(f=>f.name)];if(!allowed.includes(page))page='Home';
  const section=['Report Absence','Manage reported absences','Absences by Date'].includes(page)?'Absences':['Assign Relief','Daily Notify','My Relief Duties','Manage Ad-hoc relief','Custom Notifications','Recess Regression','SMC Duty Roster','Daily Updates','Statistics','WhatsApp Inbox'].includes(page)?'Relief':['Manage Absence Type','Prune records','System Config','Opening balances'].includes(page)?'Admin':'';
  const detail=page==='Timetable'?{teacher:'Teacher timetables',class:'Class timetables',tg:'TG timetables',export:'Export'}[timetablePage]:page==='Baseline Timetable'?{saved:'Saved timetables',upload:'Baseline upload'}[baselinePage]:'';
  const crumbs=[{label:'Home',target:page==='Home'?'':'Home'},...(section?[{label:section}]:[]),...(page==='Home'?[]:[{label:allowedFunctions().find(f=>f.name===page)?.label||page}]),...(detail?[{label:detail}]:[])];
  $('nav').hidden=false;$('navToggle').hidden=true;$('nav').innerHTML='<ol class="breadcrumbs">'+crumbs.map((c,i)=>'<li>'+(c.target?'<button data-page="'+c.target+'">'+esc(c.label)+'</button>':'<span'+(i===crumbs.length-1?' aria-current="page"':'')+'>'+esc(c.label)+'</span>')+'</li>').join('')+'</ol>';
  $('nav').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));
 }
 function operationsLinkDate(hash){const value=new URLSearchParams(location.search).get('date');return location.hash===hash&&/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:null;}
 function dailyNotifyLinkDate(){return operationsLinkDate('#dailyNotify');}
 function peerRequestLink(){const date=operationsLinkDate('#myReliefDuties'),requestId=new URLSearchParams(location.search).get('peerRequest');return date&&/^[A-Za-z0-9_-]{1,160}$/.test(requestId||'')?{date,requestId}:null;}
 const retiredReadinessRoute=value=>String(value||'').replace(/[^a-z]/gi,'').toLowerCase()==='whatsappreadiness';
 function clearRetiredRoute(){if(!retiredReadinessRoute(location.hash))return false;history.replaceState(null,'',location.pathname+location.search);return true;}
 async function go(name,date,ownTimetable=false){
  if(retiredReadinessRoute(name)){name='Home';clearRetiredRoute();}
  if(busy||loadingProfile||name===page&&!date)return;if(window.RosterOpsUI?.isDirty?.()&&!await window.RosterOpsUI.flushPending({page:name,date}))return;if(!discardDraft())return;
  if(name==='Timetable'&&date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)){status('Choose a valid timetable date.');return;}
  sequence++;page=name;if(name==='Daily Notify'&&date)history.replaceState(null,'',location.pathname+'?date='+encodeURIComponent(date)+'#dailyNotify');else if(location.hash==='#dailyNotify')history.replaceState(null,'',location.pathname+location.search);if(name==='Report Absence')history.replaceState(null,'',location.pathname+location.search+'#reportAbsence');else if(location.hash==='#reportAbsence')history.replaceState(null,'',location.pathname+location.search);if(name!=='My Relief Duties'&&location.hash==='#myReliefDuties'){const url=new URL(location.href);url.hash='';url.searchParams.delete('peerRequest');history.replaceState(null,'',url.pathname+url.search);} if(name==='Baseline Timetable')baselinePage='saved';if(name==='Timetable'){if(date){day=date;followingToday=day===today();}timetablePage='teacher';chosenNames={teacher:'',class:'',tg:''};ownTimetableDate=ownTimetable?day:null;}else ownTimetableDate=null;nav();status(isOperations()?'':'Loading…');
  try{await render(date,true);if(page!==name)return;status(pending?'A save is awaiting confirmation. Return to Baseline Timetable to retry it.':'');const title=$('content').querySelector('h2');if(title&&!(page==='My Relief Duties'&&peerRequestLink())){title.tabIndex=-1;title.focus();}}catch(e){failure(e);}
 }
 function home(){
  const list=allowedFunctions(),tile=f=>'<button class="function-tile'+(f.name==='Report Absence'?' absence-entry':'')+'" data-page="'+esc(f.name)+'"><img src="icons/'+esc(f.icon)+'.svg" alt="" width="56" height="56"><span class="function-title">'+esc(f.label||f.name)+'</span><span class="function-description">'+esc(f.description)+'</span>'+(f.name==='WhatsApp Inbox'?'<span data-inbox-alert hidden role="status"></span>':'')+(f.admin?'<span class="access-label">Admin</span>':f.smc?'<span class="access-label">'+esc(f.accessLabel||'SMC')+'</span>':'')+'</button>';
  const primary=list.filter(f=>homeOrder.slice(0,8).includes(f.name)),rest=list.filter(f=>!primary.includes(f));
  $('content').innerHTML='<div class="home"><div class="home-heading"><h2>Roster</h2><p class="home-note home-timetable" data-home-timetable role="status" aria-live="polite"></p></div><p class="home-note" data-home-own-relief role="status" aria-live="polite"></p><p class="home-duty" data-current-duty role="status" aria-live="polite"></p><div data-home-acknowledgement></div>'+(primary.length?'<div class="function-grid priority-functions" aria-label="Primary Roster functions">'+primary.map(tile).join('')+'</div><hr class="function-divider">':'')+'<div class="function-grid" aria-label="Other Roster functions">'+rest.map(tile).join('')+'</div></div>';
  showHomeTimetable();const relief=currentHomeRelief();showHomeRelief($('content').querySelector('[data-home-own-relief]'),relief?(relief.periods?'ready':'error'):'loading',relief?.periods||[]);
  $('content').querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>go(b.dataset.page));
  if(timetablePreload){const notice=document.createElement('p');notice.className='hint';notice.dataset.timetablePreload='';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');$('content').querySelector('.home').append(notice);showPreloadStatus();scheduleTimetablePreload();}
  const dutyHost=$('content').querySelector('[data-current-duty]');showHomeDuty(dutyHost,'loading');const dutyMount=sequence;requestAnimationFrame(()=>setTimeout(async()=>{if(page==='Home'&&sequence===dutyMount&&dutyHost.isConnected){await refreshHomeDuty();if(page==='Home'&&sequence===dutyMount&&dutyHost.isConnected)refreshHomeRelief();}},0));
  const ackHost=$('content').querySelector('[data-home-acknowledgement]');requestAnimationFrame(()=>{if(page==='Home'&&sequence===dutyMount&&ackHost?.isConnected)homeAcknowledgementDispose=window.RosterAcknowledgements?.mount(ackHost,{api,owner:cacheOwner(),today,onView:date=>go('My Relief Duties',date)});});
  refreshInboxBadge();
  const report=$('content').querySelector('[data-page="Report Absence"]');
  if(report){const prepare=()=>window.RosterOpsUI?.preload({api:(route,input,method,token)=>api(route,input,method,token,{background:true}),profile,today,cachedTimetable,localTimetable,readDate,invalidateOperations}).catch(()=>{});for(const event of ['pointerenter','focus','pointerdown'])report.addEventListener(event,prepare);void warmHomeReport(report,prepare).catch(()=>{});}
 }
 function showHomeTimetable(){
  const host=$('content').querySelector('[data-home-timetable]');if(page!=='Home'||!profile||!host)return;
  const date=today(),label=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',weekday:'short',day:'numeric',month:'short',year:'numeric'}).format(new Date(date+'T12:00:00Z'));
  const snapshot=timetablePreload?.snapshot?.(),baseline=timetablePreload?.getBaseline?.(date),plan=timetablePreload?.getTimetableStatus?timetablePreload.getTimetableStatus(date):timetablePreload?.getPlan?.(date);
  let text="Checking today's timetable… "+label;
  if(snapshot?.phase==='ready'){
   const source=plan?.timetableDay?.source;
   if(plan&&source!=null&&!['baseline','confirmed','published'].includes(source))text="Today's timetable could not be verified. Refresh to retry. "+label;
   else text=(['confirmed','published'].includes(source)?'Suspended timetable in effect today ':baseline?'No suspended timetable today ':'No timetable active today ')+label;
  }else if(preloadStatus?.phase==='failed')text="Today's timetable could not be verified. Refresh to retry. "+label;
  if(host.textContent!==text)host.textContent=text;
 }
 function homeReliefKey(){return 'gsis.roster.home-relief.v1.'+JSON.stringify([cacheOwner(),today(),profile?.revision??null]);}
 function invalidateHomeRelief(){
  try{sessionStorage.removeItem(homeReliefKey());if(homeReliefCache)sessionStorage.removeItem(homeReliefCache.key);}catch{}
  homeReliefCache=null;homeReliefTicket++;
 }
 function saveHomeRelief(periods){
  homeReliefCache={key:homeReliefKey(),checkedAt:Date.now(),periods};
  try{sessionStorage.setItem(homeReliefCache.key,JSON.stringify(homeReliefCache));}catch{}
 }
 function rememberHomeRelief(data,{owner,epoch,generation,date,revision}){
  if(!owner||owner!==cacheOwner()||epoch!==sessionEpoch||generation!==apiReadGeneration||revision!==profile?.revision||date!==today()||data?.today!==date||data?.user?.staffId!==profile?.user.staffId||String(data?.user?.email||'').toLowerCase()!==String(profile?.user.email||'').toLowerCase()||!Array.isArray(data.myDuties))return;
  // The duties view includes every own duty, even when another date is selected.
  const rows=data.myDuties.filter(a=>a.staffId===profile.user.staffId&&a.date===date&&['published','completed'].includes(a.status)&&!a.noRelief&&!a.remove&&!a.invalidCover&&!a.publicationWithheldAt);
  if(rows.some(a=>!Number.isInteger(a.period)||a.period<0||a.period>16))return;
  saveHomeRelief([...new Set(rows.map(a=>a.period))].sort((a,b)=>a-b));
 }
 function currentHomeRelief(){
  const key=homeReliefKey();let c=homeReliefCache;
  if(c?.key!==key)try{c=JSON.parse(sessionStorage.getItem(key));}catch{c=null;}
  if(!cacheOwner()||c?.key!==key||!Number.isFinite(c.checkedAt)||Date.now()-c.checkedAt<0||Date.now()-c.checkedAt>=600000||!(c.periods===null||Array.isArray(c.periods)&&c.periods.length<=17&&c.periods.every(p=>Number.isInteger(p)&&p>=0&&p<=16)))return null;
  return homeReliefCache=c;
 }
 function showHomeRelief(host,state,periods=[]){
  if(!host)return;host.replaceChildren();
  if(state==='ready'&&periods.length){const link=document.createElement('a');link.href='#myReliefDuties';link.textContent='Your relief duty today: '+periods.map(p=>'P'+p).join(', ')+'.';link.onclick=e=>{e.preventDefault();go('My Relief Duties',today());};host.append(link);}
  else host.textContent=state==='ready'?'You have no relief duty today.':state==='loading'?'Checking your relief duty…':'Your relief duty could not be checked. Refresh to retry.';
 }
 async function refreshHomeRelief(){
  const host=$('content').querySelector('[data-home-own-relief]');if(page!=='Home'||!profile||!host)return;
  const ticket=++homeReliefTicket,owner=cacheOwner(),epoch=sessionEpoch,generation=apiReadGeneration,key=homeReliefKey(),mount=sequence,date=today();homeReliefDay=date;
  const active=()=>ticket===homeReliefTicket&&owner===cacheOwner()&&epoch===sessionEpoch&&mount===sequence&&date===today()&&page==='Home'&&host.isConnected;
  const cached=currentHomeRelief();if(cached){showHomeRelief(host,cached.periods?'ready':'error',cached.periods||[]);return;}showHomeRelief(host,'loading');
  try{await api('operations',{operation:'read',view:'duties',date},'POST',undefined,{background:true});if(!active())return;const current=currentHomeRelief();if(!current)throw Error('Own duties were not verified.');showHomeRelief(host,'ready',current.periods);}
  catch{if(owner===cacheOwner()&&epoch===sessionEpoch&&generation===apiReadGeneration&&key===homeReliefKey())saveHomeRelief(null);if(active())showHomeRelief(host,'error');}
 }
 function showHomeDuty(host,state,names=[]){
  if(!host)return;
  const text=state==='ready'?(names.length?'SMC doing Relief Allocation: '+esc(names.join(', '))+'.':'No SMC assigned to Relief Allocation today.'):state==='loading'?'SMC doing Relief Allocation: <span class="home-duty-loading"><span class="ops-spinner" aria-hidden="true"></span>Checking…</span>':'SMC doing Relief Allocation: Unavailable. <button type="button" data-duty-retry>Retry</button>';
  host.innerHTML=text+' Visit <a href="https://contacts.gsps.edu.sg">contacts.gsps.edu.sg</a> for '+(state==='ready'&&names.length?'their':'staff')+' contact numbers.';
  host.querySelector('[data-duty-retry]')?.addEventListener('click',()=>refreshHomeDuty());
 }

 function resetHomeDuty(){homeDutyTicket++;homeDutyDay='';if(page==='Home')showHomeDuty($('content').querySelector('[data-current-duty]'),'loading');}
 async function refreshHomeDuty(){
  const host=$('content').querySelector('[data-current-duty]');if(page!=='Home'||!profile||!host)return;
  const ticket=++homeDutyTicket,owner=profile,epoch=sessionEpoch,date=today();homeDutyDay=date;showHomeDuty(host,'loading');
  const active=()=>ticket===homeDutyTicket&&owner===profile&&epoch===sessionEpoch&&page==='Home'&&host.isConnected;
  try{
   const data=await api('operations',{operation:'currentDuty'});if(!active())return;
   const checked=new Date(data?.checkedAt),checkedDay=Number.isFinite(checked.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(checked):'';
   if(date!==today()||data?.date!==today()||data.date!==checkedDay||data.available!==true||!Array.isArray(data.people)||data.people.some(p=>typeof p?.name!=='string'||!p.name.trim()))throw Error('Current duty could not be verified.');
   showHomeDuty(host,'ready',data.people.map(p=>p.name.trim()));
  }catch{if(active())showHomeDuty(host,'error');}
 }
 async function refreshInboxBadge(){
  if(page!=='Home'||!profile||!profile.user.smc&&!profile.user.admin)return;
  const owner=profile,host=$('content').querySelector('[data-inbox-alert]');if(!host)return;
  try{const data=await api('operations',{operation:'inboxList',filter:'open',limit:1});if(profile!==owner||page!=='Home'||!host.isConnected)return;const count=Number(data.alertCount)||0;host.hidden=count===0;host.textContent=count?count+' new conversation'+(count===1?'':'s')+' for duty SMC':'';}catch{}
 }
 async function load(verifiedProfile){
  if(loadingProfile){queuedProfileLoad=true;return;}resetHomeDuty();loadingProfile=true;availabilitySequence++;unmount();window.RosterOpsUI?.resetPreloads();lockUI(true);
  const epoch=sessionEpoch,ticket=++sequence;homeReliefTicket++;invalidateReads(true);availabilityReads.clear();profileDay=today();if(followingToday)day=profileDay;status('Loading Roster…');if(!profile)$('content').innerHTML='<section><h2>Loading Roster…</h2></section>';
  try{
   let x;try{x=verifiedProfile||await api('profile',{date:profileDay,...(page==='Report Absence'||location.hash==='#reportAbsence'?{view:'reportForm'}:{})});}catch(e){if(e.stale||(epoch!==sessionEpoch&&e.status!==401)||(ticket!==sequence&&profile))return;clear();throw e;}if(epoch!==sessionEpoch||ticket!==sequence)return;
   if(x?.user?.accessVerified!==true||typeof x.user.smc!=='boolean'){clear();throw Error('Roster access could not be verified. Ask an Admin to check the Roster connection, then retry.');}
   if(x.reportForm&&!Object.hasOwn(x,'revision')&&profile&&cacheOwner()===cacheOwner(x.user))x={...profile,...x};
   if(profile&&profile.revision!==x.revision)scheduleTimetablePreload(true);
   if(cacheOwner()!==cacheOwner(x.user)){if(profile)invalidateHomeRelief();calendarProofs.clear();calendarContexts.clear();reportFormRead=null;clearTimetablePreload();window.RosterAcknowledgements?.clear();sessionEpoch++;if(profile){window.RosterReportCache?.clear();window.RosterBaselineCache?.removeOwner(cacheOwner());models.clear();viewFields={};}chosenNames={teacher:'',class:'',tg:''};selected=[];if(pending&&pending.owner!==x.user.email)pending=null;}
   profile=x;window.RosterBaselineCache?.retainOwner?.(cacheOwner());profile=x=hydrate(x);profileCheckedAt=Date.now();if(clearRetiredRoute())page='Home';if(location.hash==='#reportAbsence')page='Report Absence';const notifyDate=dailyNotifyLinkDate();if(notifyDate&&(profile.user.smc||profile.user.admin))page='Daily Notify';const peerLink=peerRequestLink();if(peerLink)page='My Relief Duties';if(location.hash==='#whatsappInbox'&&(profile.user.smc||profile.user.admin)){page='WhatsApp Inbox';history.replaceState(null,'',location.pathname+location.search);}
   try{viewFields=JSON.parse(localStorage.getItem(fieldsKey())||'{}')||{};}catch{viewFields={};}try{const stored=localStorage.getItem(periodKey());lastPeriod=stored!==null&&/^\d+$/.test(stored)&&Number(stored)<=39?Number(stored):null;}catch{lastPeriod=null;}
   if(Object.prototype.hasOwnProperty.call(x,'model')&&x.calendar)reads.set(profileDay,{promise:Promise.resolve(x),result:x,until:Date.now()+60000});
   $('signin').replaceChildren();$('account').textContent=x.user.email;$('logout').hidden=false;if($('systemHealthLink'))$('systemHealthLink').hidden=x.user.accessVerified!==true||x.user.admin!==true;nav();if(page==='Report Absence'&&(x.reportData||x.reportError))window.RosterOpsUI?.seedReport({profile,today,cachedTimetable},x.reportData,x.reportError);await render(page==='Daily Notify'?notifyDate:page==='My Relief Duties'?peerLink?.date:undefined);if(profile)status('');
  }finally{loadingProfile=false;lockUI(busy);if(queuedProfileLoad){queuedProfileLoad=false;await load();}else scheduleTimetablePreload();}
 }
 function time(model,p){const n=model.timing.startMinutes+p*model.timing.periodMinutes;return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
 function invalidateReads(preservePreload=false){if(!preservePreload)clearTimetablePreload();cacheGeneration++;timetableDays.clear();reads.clear();modelReads.clear();current=null;}
 function periodKey(){return 'gsis.roster.lastPeriod.'+profile.user.email.toLowerCase();}
 function cutoff(model){return Math.min(model.maxPeriod,lastPeriod??model.timing.normalLastPeriod);}
 function fieldsKey(){return 'gsis.roster.fields.'+profile.user.email.toLowerCase();}
 function rememberModel(result,persist=true){
  const id=result?.modelId||(result?.selected||result?.active)?.id;
  if(id&&result.model){
   const existing=models.get(id),model=existing||result.model;models.delete(id);models.set(id,model);
   if(persist&&!existing)window.RosterBaselineCache?.put(cacheOwner(),id,model);
   RosterExport.names(model); // Warm the shared teacher/class/TG index with the background model read.
   while(models.size>8){const expired=models.keys().next().value;models.delete(expired);for(const [date,read] of reads)if((read.result?.modelId||read.result?.selected?.id)===expired)reads.delete(date);}
   return {...result,model};
  }
  return result;
 }
 function hydrate(result){
  if(result?.modelUnchanged){const model=models.get(result.modelId);if(!model)throw Error('The timetable changed while loading. Refresh to reload it.');result={...result,model};}
  return rememberModel(result);
 }
 function readDate(date,options={}){
  const cached=cachedTimetable(date);if(cached)rememberModel(cached,false);
  const loading=modelReads.get(selectedTimetable(date).entry?.id||date);if(loading)return loading.then(()=>readDate(date,options));
  if(reads.get(date)?.until<=Date.now())reads.delete(date);
  if(!reads.has(date)){const generation=cacheGeneration,epoch=sessionEpoch,read={};read.promise=api('read',{date,knownModelIds:[...models.keys()]},'POST',undefined,options).then(async result=>{
   if(epoch!==sessionEpoch||generation!==cacheGeneration){const e=Error('Timetable read was superseded.');e.stale=true;throw e;}
   if(result?.modelUnchanged&&!models.has(result.modelId))result=await api('read',{date},'POST',undefined,options);
   if(epoch!==sessionEpoch||generation!==cacheGeneration){const e=Error('Timetable read was superseded.');e.stale=true;throw e;}
   result=hydrate(result);read.result=result;read.until=Date.now()+60000;reads.set(date,read);while(reads.size>32)reads.delete(reads.keys().next().value);return result;
  }).catch(e=>{if(reads.get(date)===read)reads.delete(date);throw e;});reads.set(date,read);}
  return reads.get(date).promise;
 }
 function selectedTimetable(date){
  const known=reads.get(date)?.result,preloaded=timetablePreload?.getBaseline(date);
  if(preloaded&&(!known||preloaded.registerRevision>=(known.revision??-1)))return {entry:preloaded.entry,selection:'current'};
  if(known)return {entry:known.selected||known.active,selection:known.selection};
  if(profile?.entries)return GSISRoster.currentOrNext(profile.entries,date);
  const entry=profile?.selected||profile?.active;
  return entry&&(entry.from<=date&&entry.to>=date||date===profileDay)?{entry,selection:entry.from>date?'upcoming':'current'}:{entry:null,selection:null};
 }
 function cachedTimetable(date){
  const {entry,selection}=selectedTimetable(date),preloaded=timetablePreload?.getBaseline(date),model=entry&&(models.get(entry.id)||(preloaded?.entry.id===entry.id?preloaded.model:null));if(!model)return null;
  const dated=reads.get(date),calendar=dated?.until>Date.now()&&dated.result?.modelId===entry.id?dated.result.calendar:null;
  return {revision:profile.revision,selected:entry,active:selection==='current'?entry:null,selection,modelId:entry.id,model,calendar,names:Object.fromEntries(['teacher','class','tg'].map(type=>[type,RosterExport.names(model,type)])),timing:model.timing,maxPeriod:model.maxPeriod,layoutMode:model.layoutMode};
 }
 function localTimetable(date,force=false,cacheOnly=false){
  const cached=cachedTimetable(date);if(cached&&!force)return Promise.resolve(cached);
  const entry=selectedTimetable(date).entry,key=(cacheOnly?'local:':'')+(entry?.id||date);
  if(force&&modelReads.has(key))modelReads.get(key).forceOnline=true;
  if(!modelReads.has(key)){const generation=cacheGeneration,epoch=sessionEpoch,owner=cacheOwner();const request=(async()=>{
   if(!force&&timetablePreload?.restore){
    await timetablePreload.restore();
    if(epoch!==sessionEpoch||generation!==cacheGeneration)throw Object.assign(Error('Timetable read was superseded.'),{stale:true});
    const local=cachedTimetable(date);if(local&&!request.forceOnline)return local;
   }
   if(!force&&entry?.id&&window.RosterBaselineCache){
    const saved=await window.RosterBaselineCache.get(owner,entry.id);
    if(epoch!==sessionEpoch||generation!==cacheGeneration||selectedTimetable(date).entry?.id!==entry.id){const e=Error('Timetable read was superseded.');e.stale=true;throw e;}
    if(saved&&!request.forceOnline){let model;try{model=GSISRoster.validate(saved);}catch{}if(model){rememberModel({modelId:entry.id,model},false);return cachedTimetable(date);}}
   }
   if(cacheOnly)return null;
   if(!force&&reads.get(date)?.promise&&!reads.get(date)?.result)return reads.get(date).promise;
   let result=await api('read',{date,calendar:false,knownModelIds:[...models.keys()]});
   if(epoch!==sessionEpoch||generation!==cacheGeneration){const e=Error('Timetable read was superseded.');e.stale=true;throw e;}
   if(result?.modelUnchanged&&!models.has(result.modelId))result=await api('read',{date,calendar:false});
   if(epoch!==sessionEpoch||generation!==cacheGeneration){const e=Error('Timetable read was superseded.');e.stale=true;throw e;}
   result=hydrate(result);reads.set(date,{result,until:result.calendar?Date.now()+60000:0,promise:Promise.resolve(result)});while(reads.size>32)reads.delete(reads.keys().next().value);return result;
  })().finally(()=>{if(modelReads.get(key)===request)modelReads.delete(key);});request.forceOnline=force;modelReads.set(key,request);}
  return modelReads.get(key).then(result=>result&&cachedTimetable(date)||result);
 }
 function invalidateOperations(dates,options={}){
  if(!dates||(Array.isArray(dates)?dates:[dates]).includes(today())){apiReadGeneration++;apiReads.clear();invalidateHomeRelief();}
  if(options.timetables===true){preloadSchedule++;preloadCheckedAt=0;timetablePreload?.invalidate(dates);}
  window.RosterReportCache?.clear(dates);
  window.RosterOpsUI?.invalidateDates?.(dates,cacheOwner());
  window.RosterStaplerUI?.invalidateDates?.(dates);
  if(!dates)timetableDays.clear();else for(const [key,entry] of timetableDays)if((Array.isArray(dates)?dates:[dates]).includes(entry.date))timetableDays.delete(key);
  if(!dates){availabilityReads.clear();return;}
  for(const date of Array.isArray(dates)?dates:[dates])availabilityReads.delete(date);
 }
 function changeDate(e){if(e.target.value){day=e.target.value;ownTimetableDate=null;followingToday=day===today();status('Loading…');const changedDay=day;render().then(()=>{if(day===changedDay)status('');}).catch(failure);}}
 function resolveAssignDate(){
  const date=today(),epoch=sessionEpoch,key=epoch+'|'+cacheOwner()+'|'+date;
  if(assignDateRead?.key===key&&assignDateRead.until>Date.now())return assignDateRead.promise;
  const entry={key,until:Date.now()+60000};entry.promise=api('operations',{operation:'nextSchoolDay'}).then(value=>{
   if(epoch!==sessionEpoch||date!==today())throw Object.assign(Error('The date check was superseded. Retry.'),{stale:true});
   if(value?.available!==true||value.today!==date||!/^\d{4}-\d{2}-\d{2}$/.test(value.date||'')||value.date<=date||Date.parse(value.date)-Date.parse(date)>62*86400000)throw Error(value?.message||'The next school day could not be verified. Choose a date manually or retry.');
   return value.date;
  }).catch(error=>{if(assignDateRead===entry)assignDateRead=null;throw error;});assignDateRead=entry;return entry.promise;
 }
 async function render(date,entering=false){
  if(profile&&(page==='System Config'||page==='Daily Updates'&&(profile.user.smc||profile.user.admin))){unmount();await window.RosterSettingsUI.render(page,{api,profile,container:$('content'),status,today,cachedTimetable,localTimetable,invalidateOperations,go,initialDate:date});return;}
  if(!profile)return;unmount();availabilitySequence++;if(page==='Statistics'&&(profile.user.smc||profile.user.admin)){await window.RosterStatisticsUI.render({container:$('content'),api,profile,today,go});return;}if(page==='Learn about Auto Allocation'){await window.RosterLearningUI.render({api,container:$('content')});return;}if(page==='WhatsApp Inbox'){await window.RosterInboxUI.render({api,profile,container:$('content'),status,today,go});return;}if(page==='Stapler'||page==='SMC Duty Roster'){await (page==='Stapler'?window.RosterStaplerUI:window.RosterDutyUI).render({api,profile,verifiedSession:sessionEpoch,container:$('content'),status,today,readDate,cachedTimetable,localTimetable,timetablePreload,invalidateOperations,go,initialDate:date});return;}if(isOperations()){await window.RosterOpsUI.render(page,{peerRequestId:page==='My Relief Duties'?peerRequestLink()?.requestId:undefined,quickAbsence:page==='Report Absence',acknowledgementOwner:cacheOwner(),api,profile,container:$('content'),status,today,readDate,cachedTimetable,localTimetable,reportTimetable,getReportForm,timetablePreload,invalidateOperations,go,initialDate:date,resolveAssignDate:entering&&page==='Assign Relief'&&new Date(Date.now()+8*3600000).getUTCHours()>=14?resolveAssignDate:undefined});return;}if(page==='Home'){home();return;}if(page==='Baseline Timetable'){baseline();return;}if(page==='Check Availability'){availabilityView();loadAvailabilityDirectory();return;}
  const ticket=++sequence;current=null;$('content').innerHTML='<h2>'+esc(page)+'</h2><div class="tools"><label>Date<input id="viewDate" type="date" value="'+day+'"></label></div><section><p>Loading timetable names…</p></section>';$('viewDate').onchange=changeDate;
  let result;try{result=await localTimetable(day);}catch(e){if(ticket===sequence||(!profile&&!e.stale))throw e;return;}if(ticket!==sequence)return;current={...result,dayCheck:'checking'};viewer();checkTimetableDay(ticket);
 }
 function timetableDayLabel(){
  if(current?.selection==='upcoming')return 'Upcoming timetable preview. It starts on '+displayDate(current.selected.from)+'.'+(current.model?.layoutMode==='odd-even'?' Both week patterns are shown.':'')+' Choose a date within its validity to check for a suspended timetable.';
  const published=current?.effectiveDay?(current.effectiveDay.source==='confirmed'?'Confirmed suspended timetable':'Published suspended timetable')+' · '+displayDate(day)+' · revision '+(current.effectiveDay.source==='confirmed'?current.effectiveDay.confirmedRevision:current.effectiveDay.publicationRevision)+(current.effectiveDay.source==='confirmed'?'. WhatsApp uses the published timetable.':''):'';
  if(current?.dayCheck==='checking')return (published||'Baseline shown.')+' Checking for a suspended timetable…';
  if(current?.dayCheck==='failed')return (published||'Baseline shown.')+' Could not check for timetable changes';
  if(!published&&current?.suspension?.status==='needs-reconfirmation')return 'Baseline shown. The suspended timetable for '+displayDate(day)+' needs reconfirmation. Ask SMC to review and confirm it in Stapler.';
  return published||'Baseline weekly timetable · No confirmed or published suspended timetable for '+displayDate(day);
 }
 function timetableDayStatus(){return '<p id="timetableDayStatus" class="banner timetable-day-status" role="status" aria-live="polite">'+(current.dayCheck==='checking'?'<span class="timetable-day-spinner" aria-hidden="true"></span>':'')+'<span>'+esc(timetableDayLabel())+'</span>'+(current.dayCheck==='failed'?' <button id="retryTimetableDay">Retry</button>':'')+'</p>';}
 function refreshTimetableDay(redraw=false){
  const focused=document.activeElement,id=focused?.id,start=focused?.selectionStart,end=focused?.selectionEnd,x=window.scrollX,y=window.scrollY;
  const notice=$('timetableDayStatus');if(notice){notice.outerHTML=timetableDayStatus();if($('retryTimetableDay'))$('retryTimetableDay').onclick=()=>checkTimetableDay(sequence,true);}
  const calendar=$('timetableCalendar');if(calendar)calendar.innerHTML=current.effectiveDay||current.selection==='upcoming'?'':calendarNotice(current.calendar,current.model);
  if(redraw)drawTimetable();const next=id&&$(id);if(next){next.focus({preventScroll:true});if(next.setSelectionRange&&typeof start==='number')next.setSelectionRange(start,end);}
  if(window.scrollX!==x||window.scrollY!==y)window.scrollTo(x,y);
 }
 async function checkTimetableDay(ticket,force=false){
  const date=day,epoch=sessionEpoch,generation=cacheGeneration,base=current,baselineId=current?.modelId;
  if(!force&&base&&['none','confirmed','published'].includes(base.dayCheck)&&timetablePreload?.isDue?.()===false)return;
  const active=()=>epoch===sessionEpoch&&generation===cacheGeneration&&ticket===sequence&&page==='Timetable'&&day===date&&current===base&&timetableDays.get(entry?.sourceKey||key)===entry;
  if(!base){base.dayCheck='none';refreshTimetableDay();return;}
  base.dayCheck='checking';refreshTimetableDay();
  const key=JSON.stringify([cacheOwner(),epoch,date,baselineId,profile.revision]);let entry=[...timetableDays.values()].find(row=>row.scopeKey===key);
  if(force||entry?.until<=Date.now()){timetableDays.delete(entry?.sourceKey||key);entry=null;}
  if(!entry){
   const snapshot=timetablePreload?.snapshot(),plan=!force&&snapshot?.phase==='ready'?(timetablePreload.getTimetableStatus?timetablePreload.getTimetableStatus(date):timetablePreload.getPlan(date)):null;
   const cachedDay=plan?plan.timetableDay:!force&&snapshot?.phase==='ready'&&!plan&&timetablePreload.getBaseline(date)?{date,baselineId,source:'baseline'}:null;
   entry={date,until:0,scopeKey:key};const owned=entry;
   entry.promise=(cachedDay?Promise.resolve(cachedDay):api('operations',{operation:'timetableDay',date},'POST',undefined,{background:true})).then(result=>{if(result.date!==date||result.source==='baseline'&&result.baselineId!==baselineId||!['published','confirmed','baseline'].includes(result.source))throw Error('The timetable source changed. Refresh to check this date.');owned.result=result;owned.until=cachedDay?Infinity:Date.now()+60000;owned.sourceKey=JSON.stringify([key,result.baselineId,result.sourceRevision,result.publicationRevision,result.confirmedRevision]);if(timetableDays.get(key)===owned){timetableDays.delete(key);timetableDays.set(owned.sourceKey,owned);}return result;}).catch(error=>{owned.until=0;throw error;});timetableDays.set(key,entry);while(timetableDays.size>16)timetableDays.delete(timetableDays.keys().next().value);
  }
  try{
   const result=await entry.promise;if(!active())return;
   base.suspension=result.source==='baseline'&&result.suspension?.status==='needs-reconfirmation'?result.suspension:null;
   if(['published','confirmed'].includes(result.source)){if(!result.periods?.length||!Array.isArray(result.teachers))throw Error('The suspended timetable is incomplete.');const changed=base.effectiveDay!==result;base.effectiveDay=result;if(changed)base.dayModel=RosterExport.dayModel(result);base.dayCheck=result.source;if(!base.model)viewer();else refreshTimetableDay(changed);return;}
   const changed=!!base.effectiveDay;delete base.effectiveDay;delete base.dayModel;base.dayCheck='none';base.calendar={status:'checking'};refreshTimetableDay(changed);
   try{const checked=await readDate(date,{background:true});if(!active())return;if(checked.modelId!==baselineId)throw Error('The baseline changed. Refresh to check this date.');base.calendar=checked.calendar;refreshTimetableDay();}catch(e){if(e.status===403)throw e;if(active()){base.calendar={available:false,message:'Calendar could not be checked.'};refreshTimetableDay();}}
  }catch(e){
   if(e.status===403&&epoch===sessionEpoch&&day===date&&page==='Timetable'){$('content').innerHTML='<h2>Timetable</h2><p class="error">'+esc(errorText(e))+' Refresh to verify your access.</p>';return;}
   if(!active()||e.stale)return;base.dayCheck='failed';refreshTimetableDay();
  }
 }
 function subnav(items,active,attribute){return '<div class="subnav" aria-label="'+(attribute==='baseline'?'Baseline timetable pages':'Timetable pages')+'">'+items.map(([value,label])=>'<button data-'+attribute+'="'+value+'"'+(value===active?' aria-current="page"':'')+'>'+label+'</button>').join('')+'</div>';}

 function baseline(){
  if(baselinePage==='upload'&&!profile.user.admin)baselinePage='saved';
  nav();const list=profile.entries||[];
  $('content').innerHTML=`<div class="page-heading"><h2>Baseline Timetable</h2><span class="access-label">${profile.user.admin?'Admin':'SMC'}</span></div>
   <p class="banner">${profile.active?'Current: '+esc(profile.active.name):profile.upcoming?'Upcoming: '+esc(profile.upcoming.name)+' from '+esc(displayDate(profile.upcoming.from)):'No current or upcoming timetable'}</p>
   ${subnav([['saved','Saved timetables'],...(profile.user.admin?[['upload','Baseline upload']]:[])],baselinePage,'baseline')}
   <form id="uploadForm" ${baselinePage==='upload'?'':'hidden'}>
    <h3>Upload a timetable</h3><p class="hint">Choose the original aSc / Edupage Teachers Summary export. Review it here, then save it online.</p>
    <fieldset id="uploadFields">
     <div class="upload-source"><label for="source">1. Choose the export</label><input id="source" name="source" type="file" accept=".xlsx,.xls,.html,.htm" required aria-describedby="fileHelp importStatus"><p id="fileHelp" class="hint">Excel workbook or original Teachers Summary export, up to 8 MB. Single week and odd/even timetables are accepted.</p><p id="importStatus" role="status">No file selected.</p></div>
     <div id="uploadGuide"></div>
     <h4>2. Name and validity</h4><div class="fields"><label class="wide">Timetable name<input name="name" maxlength="160" placeholder="GSPS 2026 T4 Teachers Summary" required></label><label>Valid from<input name="from" type="date" value="${today()}" required></label><label>Valid to<input name="to" type="date" required></label></div>
     <h4>3. Period timing</h4><div class="fields"><label>Period 0 start time<input name="start" type="time" value="07:00" required></label><label>Minutes per period<input name="minutes" type="number" value="30" min="5" max="120" required></label><label>End of day time<input name="end" type="time" value="13:30" required></label><label>Imported last period<output id="importLastPeriod">Choose a timetable file</output></label></div>
     <p class="hint">Defaults: Period 0 starts at 07:00, periods last 30 minutes, and the school day ends at 13:30. The last period is read from the uploaded timetable. Every imported period is kept.</p>
     <h4>4. Recess periods</h4><p class="hint">Set one recess period for each level. Times follow the period timing above. Choose None if a level has no recess in this timetable.</p><div id="recessFields" class="fields"></div>
     <section id="importClashes" class="import-clash-review" hidden></section>
     <div id="importPreview" hidden></div>
     <div class="save-row"><button id="saveUpload" class="primary" disabled>Save timetable</button><p id="activationNotice" class="hint">The timetable takes effect during its validity dates. Only one timetable is active at a time.</p><p data-baseline-feedback role="status"></p></div>
    </fieldset>
   </form>
   <section id="pendingSave" class="pending-save" hidden><h3>Confirm the previous save</h3><p>Retry the same save before making another change. It will not create a duplicate timetable.</p><button id="retrySave" class="primary">Retry the same save</button></section>
   <div id="savedTimetables" ${baselinePage==='saved'?'':'hidden'}><div class="list-heading"><h3>Saved timetables</h3><label class="check"><input id="showPruned" type="checkbox">Show pruned timetables</label></div><p data-baseline-feedback role="status"></p>
   <p class="hint">Edit validity at any time, or use Activate today to switch immediately. Pruning hides an entry and keeps its files.</p>
   ${list.length?'<div class="table-scroll"><table class="baseline-list"><thead><tr><th>Name</th><th>From</th><th>To</th><th>Teachers</th><th>Actions</th></tr></thead><tbody>'+list.map(e=>'<tr data-id="'+esc(e.id)+'" '+(e.pruned?'data-pruned hidden':'')+'><td><input aria-label="Timetable name" data-field="name" value="'+esc(e.name)+'" maxlength="160"></td><td><input type="date" aria-label="Valid from" data-field="from" value="'+esc(e.from)+'"></td><td><input type="date" aria-label="Valid to" data-field="to" value="'+esc(e.to)+'"></td><td class="number">'+e.teacherCount+'</td><td class="actions"><button data-action="metadata">Save dates/name</button> <button data-action="activate">Activate today</button> <button data-action="excel">Excel</button> <button data-action="'+(e.pruned?'restore':'prune')+'">'+(e.pruned?'Restore':'Prune')+'</button></td></tr>').join('')+'</tbody></table></div>':'<p class="empty-state">No saved timetables yet. Choose Baseline upload to save the first timetable.</p>'}</div>`;
  document.querySelectorAll('[data-baseline]').forEach(b=>b.onclick=()=>{if(busy||b.dataset.baseline===baselinePage||!discardDraft())return;baselinePage=b.dataset.baseline;baseline();});
  $('uploadGuide').append($('guide').content.cloneNode(true));
  $('showPruned').onchange=e=>document.querySelectorAll('[data-pruned]').forEach(r=>r.hidden=!e.target.checked);
  const form=$('uploadForm');recessFields(form);
  form.elements.source.onchange=()=>inspectSource(form);
  for(const name of ['start','minutes','end'])form.elements[name].oninput=()=>{recessFields(form);renderImportClashes(form);previewImport(form);};
  for(const name of ['from','to'])form.elements[name].oninput=()=>activationNotice(form);
  form.onsubmit=saveUpload;
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{
   if(busy||(!profile.user.smc&&b.dataset.action!=='excel'))return;
   const row=b.closest('tr'),id=row.dataset.id,operation=b.dataset.action;
   if(operation==='excel'){await run(async()=>{const entry=profile.entries.find(e=>e.id===id),model=models.get(id),x=model?{model,active:entry}:hydrate(await api('read',{id,date:day,calendar:false})),out=await RosterExport.fitWorkbook(await RosterConverter.makeWorkbook(x.model));download(out.blob,x.active.name+'.xlsx');});return;}
   if(pending)return;
   if(operation==='prune'&&!confirm('Remove this timetable from the list? Its files will be kept.'))return;
   if(operation==='activate'&&!confirm('Make this timetable active today?'))return;
   if(!discardDraft(operation==='metadata'?row:null))return;
   await run(async()=>{const meta=Object.fromEntries([...row.querySelectorAll('[data-field]')].map(x=>[x.dataset.field,x.value]));pending={owner:profile.user.email,route:'update',payload:{id,operation,...(operation==='metadata'?GSISRoster.metadata(meta):{}),revision:profile.revision,requestId:crypto.randomUUID()}};await savePending();});
  });
  if(!profile.user.admin)$('uploadForm').remove();
  if(!profile.user.smc)document.querySelectorAll('#savedTimetables [data-field],#savedTimetables [data-action]:not([data-action="excel"])').forEach(el=>el.disabled=true);
  showRetry();
 }
 async function inspectSource(form){
  if(busy||!profile.user.admin)return;
  const ticket=++importSequence,source=form.elements.source.files[0];uploadDraft=null;$('importLastPeriod').textContent='Choose a timetable file';
  $('importPreview').hidden=true;$('importClashes').hidden=true;$('importClashes').replaceChildren();$('saveUpload').disabled=true;$('importStatus').classList.remove('error');
  if(!source){$('importStatus').textContent='No file selected.';return;}
  $('importStatus').textContent='Reading '+source.name+'…';
  busy=true;lockUI(true);baselineProgress('Reading timetable…');
  try{
   await new Promise(requestAnimationFrame);
   if(source.size>8000000)throw Error('Choose an aSc export smaller than 8 MB.');
   const parsed=await RosterConverter.parseFile(await source.arrayBuffer());
   if(ticket!==importSequence)return;
   // The imported axis is authoritative; school end time never trims its periods.
   $('importLastPeriod').textContent='P'+parsed.maxPeriod;
   uploadDraft={source,parsed,choices:{}};recessFields(form);renderImportClashes(form);
   $('importStatus').textContent=source.name+' is ready to review.';
   previewImport(form);
  }catch(e){if(ticket!==importSequence)return;uploadDraft=null;$('importStatus').textContent=e.message;$('importStatus').classList.add('error');}
  finally{busy=false;lockUI(false);baselineProgress();}
 }
 function renderImportClashes(form){
  const area=$('importClashes'),clashes=uploadDraft?.parsed.importClashes||[];
  area.hidden=!clashes.length;if(!clashes.length){area.replaceChildren();return;}
  const [h,m]=form.elements.start.value.split(':').map(Number),minutes=Number(form.elements.minutes.value),clock=p=>{const t=h*60+m+p*minutes;return Number.isFinite(t)?String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0'):'Time not set';};
  area.innerHTML='<h4>Resolve lesson clashes</h4><p>Keep one lesson for each slot below. The other lessons in that slot will be discarded from this import. Each choice applies only to its labelled slot.</p><p class="banner">This choice corrects this import only. Resolve the lesson clash in EduPage before exporting future timetables.</p><p id="importClashStatus" role="status"></p>'+clashes.map(c=>'<fieldset class="import-clash"><legend>'+esc(c.teacher)+' · '+(c.week==='single'?'Single week':c.week==='odd'?'Odd week':'Even week')+' · '+esc(c.day)+' · P'+c.period+' ('+clock(c.period)+' to '+clock(c.period+1)+')</legend>'+c.options.map((fields,i)=>'<label class="import-clash-option"><input type="radio" name="clash-'+esc(c.id)+'" data-clash="'+esc(c.id)+'" value="'+i+'"'+(uploadDraft.choices[c.id]===i?' checked':'')+'><span>Keep this lesson'+['Subject','Class','Venue','Group'].map((label,n)=>'<span><strong>'+label+':</strong> '+esc(fields[n]||'None')+'</span>').join('')+'</span></label>').join('')+'</fieldset>').join('')+'<button type="button" id="cancelImport">Cancel import</button>';
  area.querySelectorAll('[data-clash]').forEach(input=>input.onchange=()=>{uploadDraft.choices[input.dataset.clash]=Number(input.value);updateClashStatus();previewImport(form);});
  $('cancelImport').onclick=()=>{form.elements.source.value='';inspectSource(form);};updateClashStatus();
 }
 function updateClashStatus(){
  const element=$('importClashStatus');if(!element||!uploadDraft)return;
  const clashes=uploadDraft.parsed.importClashes||[],remaining=clashes.filter(c=>!Number.isInteger(uploadDraft.choices[c.id])).length;
  element.textContent=remaining?remaining+' of '+clashes.length+' lesson clashes still need a choice.':'All '+clashes.length+' lesson clashes have a choice. Review the resolved timetable below.';
 }
 function importModel(form){
  const [h,m]=form.elements.start.value.split(':').map(Number),[endH,endM]=form.elements.end.value.split(':').map(Number);
  const timing={startMinutes:h*60+m,periodMinutes:Number(form.elements.minutes.value),normalLastPeriod:uploadDraft.parsed.maxPeriod,endOfDayMinutes:endH*60+endM},recesses=Array.from({length:6},(_,i)=>({level:i+1,period:form.elements['recess'+(i+1)].value})).filter(r=>r.period!=='').map(r=>({...r,period:Number(r.period)})),key=JSON.stringify([uploadDraft.choices,timing,recesses]);
  if(uploadDraft.reviewKey===key)return uploadDraft.reviewModel;
  const model=GSISRoster.validate({...RosterConverter.resolveClashes(uploadDraft.parsed,uploadDraft.choices),timing,recesses});
  uploadDraft.reviewKey=key;uploadDraft.reviewModel=model;return model;
 }
 function activationNotice(form){
  const from=form.elements.from.value,to=form.elements.to.value,now=today();
  let text='Choose the full validity period. Only one timetable is active at a time.';
  if(from&&to&&from<=to){
   const candidate={id:'new',name:form.elements.name.value,from,to,priority:profile.revision+1};
   if(GSISRoster.active([...(profile.entries||[]),candidate],now)?.id==='new')text='Saving will make this the active timetable immediately.';
   else if(from>now)text='Scheduled from '+displayDate(from)+'. It will be used automatically during its validity unless a timetable with a later start takes precedence.';
   else if(to<now)text='This timetable is for past dates. It will not replace today’s active timetable.';
   else text='A timetable with a later start is active today. Save this timetable, then use Activate today if you want to switch.';
  }
  $('activationNotice').textContent=text;
 }
 function previewImport(form){
  const preview=$('importPreview');if(!uploadDraft||!preview)return;
  preview.hidden=false;$('saveUpload').disabled=true;
  const chosen=$('previewTeacher')?.value,opened=$('previewDetails')?.open;
  try{
   const model=importModel(form),weeks=GSISRoster.weeks(model),names=[...new Set(weeks.flatMap(([,week])=>week.blocks.map(b=>b.name)))],identical=model.layoutMode==='odd-even'&&RosterConverter.sameWeeks(model.odd,model.even),selected=names.includes(chosen)?chosen:names[0]||'';
   preview.innerHTML=`<h4>5. Review the import</h4><dl class="import-facts"><div><dt>Teachers</dt><dd>${model.teacherCount}</dd></div><div><dt>Week pattern</dt><dd>${model.layoutMode==='single-week'?'Single week':'Odd and even weeks'}</dd></div><div><dt>Periods each day</dt><dd>P0 to P${model.maxPeriod}</dd></div><div><dt>Imported periods end</dt><dd>${time(model,model.maxPeriod+1)}</dd></div><div><dt>School day ends</dt><dd>${esc(form.elements.end.value)}</dd></div></dl>
    <p class="hint">${model.sourceMode==='five-line-time'?'Five card fields detected. Subject, Class, Classroom and Group are kept; the source Time field is replaced by your period timing.':'Four card fields detected: Subject, Class, Classroom and Group.'} ${identical?'Both weeks match; the Excel archive will contain one Teachers sheet.':''}</p>
    <details id="previewDetails" ${opened?'open':''}><summary>Preview a teacher’s timetable</summary><div class="preview-teacher"><span id="previewTeacherLabel">Teacher</span><input id="previewTeacher" type="hidden" value="${esc(selected)}"><details id="previewTeacherPicker" class="baseline-picker"><summary aria-labelledby="previewTeacherLabel previewTeacherName"><span id="previewTeacherName">${esc(selected||'Choose a teacher')}</span></summary><div class="baseline-picker-panel"><input id="previewTeacherSearch" type="search" role="combobox" aria-label="Find a teacher" aria-autocomplete="list" aria-expanded="true" aria-controls="previewTeacherOptions" autocomplete="off" placeholder="Type part of a name"><div id="previewTeacherOptions" role="listbox" aria-label="Matching teachers"></div><p id="previewTeacherCount" class="hint" role="status"></p></div></details></div><div id="previewTimetable"></div></details>`;
   const drawPreview=()=>{$('previewTimetable').innerHTML=pageHtml(RosterExport.pages(model,{type:'teacher',names:[$('previewTeacher').value],lastPeriod:model.timing.normalLastPeriod}));};
   bindPreviewPicker(names,drawPreview);drawPreview();$('saveUpload').disabled=!!pending;activationNotice(form);
  }catch(e){preview.innerHTML='<p class="error" role="alert">'+esc(e.message)+'</p>';}
 }
 function bindPreviewPicker(names,drawPreview){
  const picker=$('previewTeacherPicker'),input=$('previewTeacherSearch'),options=$('previewTeacherOptions');let matches=names,active=-1;
  const setActive=i=>{active=i;const rows=[...options.children];rows.forEach((row,n)=>row.classList.toggle('active',n===active));if(rows[active]){input.setAttribute('aria-activedescendant',rows[active].id);rows[active].scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');};
  const choose=i=>{if(!matches[i])return;$('previewTeacher').value=matches[i];$('previewTeacherName').textContent=matches[i];picker.open=false;drawPreview();picker.querySelector('summary').focus();};
  const filter=()=>{const q=input.value.normalize('NFKC').toLocaleLowerCase();matches=names.filter(n=>n.normalize('NFKC').toLocaleLowerCase().includes(q));options.innerHTML=matches.map((n,i)=>'<button type="button" role="option" tabindex="-1" id="previewTeacherOption'+i+'" aria-selected="'+(n===$('previewTeacher').value)+'">'+esc(n)+'</button>').join('');[...options.children].forEach((button,i)=>button.onclick=()=>choose(i));$('previewTeacherCount').textContent=matches.length?matches.length+' matching teachers':'No teachers match. Try another name.';setActive(-1);};
  input.oninput=filter;input.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const delta=e.key==='ArrowDown'?1:-1;setActive(matches.length?(active<0?(delta===1?0:matches.length-1):(active+delta+matches.length)%matches.length):-1);}else if(e.key==='Enter'){e.preventDefault();choose(active<0?0:active);}else if(e.key==='Escape'){e.preventDefault();picker.open=false;picker.querySelector('summary').focus();}};
  picker.ontoggle=()=>{input.setAttribute('aria-expanded',String(picker.open));if(picker.open){filter();input.focus();}};filter();
 }
 async function saveUpload(e){
  e.preventDefault();if(busy||pending||!profile.user.admin)return;
  const form=e.target;if(!form.reportValidity())return;
  if(!uploadDraft||form.elements.source.files[0]!==uploadDraft.source){status('Choose an export and review it before saving.',true);return;}
  await run(async()=>{
   const model=importModel(form),meta=GSISRoster.metadata({name:form.elements.name.value,from:form.elements.from.value,to:form.elements.to.value});
   baselineProgress('Creating the Excel archive for '+model.teacherCount+' teachers…');
   const workbook=await RosterConverter.makeWorkbook(model),bytes=new Uint8Array(await workbook.blob.arrayBuffer());
   let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
   pending={owner:profile.user.email,route:'upload',payload:{...meta,model,workbook:btoa(binary),revision:profile.revision,requestId:crypto.randomUUID()}};
   await savePending();
  });
 }
 function lockUI(value){$('content').inert=value;$('content').setAttribute('aria-busy',String(value));$('nav').inert=value;$('refresh').disabled=value;$('logout').disabled=value;}
 function baselineProgress(message){
  let overlay=$('baselineBusy');
  if(!message){overlay?.remove();return;}
  status('');if(!overlay){overlay=document.createElement('div');overlay.id='baselineBusy';overlay.className='baseline-busy';overlay.setAttribute('role','status');overlay.setAttribute('aria-live','polite');overlay.innerHTML='<span class="baseline-spinner" aria-hidden="true"></span><span data-baseline-progress></span>';document.body.append(overlay);}overlay.querySelector('[data-baseline-progress]').textContent=message;
 }
 function baselineFeedback(message,error=false){const area=$(baselinePage==='upload'?'uploadForm':'savedTimetables'),el=area?.querySelector('[data-baseline-feedback]');if(el){el.textContent=message;el.classList.toggle('error',error);el.setAttribute('role',error?'alert':'status');status('');}else status(message,error);}
 function showRetry(){
  if(!$('retrySave'))return;
  $('pendingSave').hidden=!pending;$('retrySave').hidden=!pending;$('retrySave').onclick=()=>run(savePending);
  if($('uploadFields'))$('uploadFields').disabled=!!pending;
  if(!uploadDraft&&$('saveUpload'))$('saveUpload').disabled=true;
  document.querySelectorAll('[data-action]').forEach(b=>{b.disabled=(!!pending||!profile.user.smc)&&b.dataset.action!=='excel';});
 }
 async function run(fn){if(busy)return;busy=true;const baselineWork=page==='Baseline Timetable',focus=document.activeElement;lockUI(true);if(baselineWork)baselineProgress('Working…');try{await new Promise(requestAnimationFrame);await fn()}catch(e){if(baselineWork&&e.status!==401)baselineFeedback(errorText(e)+(pending?' Retry the same save to confirm its result.':''),true);else failure(e)}finally{busy=false;lockUI(false);if(baselineWork)baselineProgress();showRetry();if(focus?.isConnected&&!focus.disabled)focus.focus({preventScroll:true});}}
 async function savePending(){
  if(!pending)return;if(pending.owner!==profile?.user.email)throw Error('This save belongs to a different account. Sign in with the original account to retry.');baselineProgress('Saving online. Keep this page open…');
  const request=pending;let result;
  try{result=await api(request.route,request.payload);}catch(e){if(e.status&&e.status<500)pending=null;throw e;}
  if(!Number.isInteger(result?.revision)||!Array.isArray(result.entries))throw Error('The save response was incomplete. Retry the same save to confirm its result.');
  if(request.route==='upload')rememberModel({modelId:result.savedId,model:request.payload.model});
  pending=null;uploadDraft=null;importSequence++;baselinePage='saved';
  profile={...profile,...result};invalidateReads();availabilityReads.clear();availability=null;invalidateOperations();baseline();baselineFeedback('Saved online.');
 }
 function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.replace(/[\\/:*?"<>|]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function calendarNotice(c,m){
  if(current?.selection==='upcoming')return '<p class="banner">Upcoming timetable preview. It starts on '+esc(displayDate(current.selected.from))+'.'+(m.layoutMode==='odd-even'?' Both week patterns are shown.':'')+' Choose a date within its validity to check availability.</p>';
  let message=!c?'Calendar not requested.':c.status==='checking'?'Checking Calendar…':c?.available?(c.schoolDay===false?'No-school day: '+c.reason+'. Showing the school timetable.':c.warning||('Term '+c.term+', week '+c.schoolWeek+' ('+c.parity+').')):(c?.message||'Calendar unavailable.');
  if(m.layoutMode==='odd-even'&&!c?.parity)message+=' Both week patterns are shown; no parity is assumed.';
  return '<p class="banner">'+esc(message)+'</p>';
 }
 function recessFields(form){
  const defaults=GSISRoster.defaultRecesses(),max=uploadDraft?.parsed.maxPeriod??39,[h,m]=form.elements.start.value.split(':').map(Number),minutes=Number(form.elements.minutes.value),previous={};
  $('recessFields').querySelectorAll('select').forEach(x=>previous[x.name]=x.value);
  $('recessFields').innerHTML=defaults.map(r=>{const name='recess'+r.level,value=Object.prototype.hasOwnProperty.call(previous,name)?previous[name]:String(r.period),selected=value!==''&&Number(value)<=max?value:'';return '<label>P'+r.level+' recess<select name="'+name+'"><option value=""'+(selected===''?' selected':'')+'>None</option>'+Array.from({length:max+1},(_,p)=>{const from=h*60+m+p*minutes,to=from+minutes,clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');return '<option value="'+p+'"'+(selected===String(p)?' selected':'')+'>P'+p+' ('+clock(from)+' to '+clock(to)+')</option>';}).join('')+'</select></label>';}).join('');
  $('recessFields').querySelectorAll('select').forEach(x=>x.onchange=()=>previewImport(form));
 }
 function selectionLabel(){const e=current.selected||current.active;return e?'<p class="timetable-caption">'+(current.selection==='upcoming'?'Upcoming: ':'')+esc(e.name)+' · '+esc(displayDate(e.from))+' to '+esc(displayDate(e.to))+'</p>':'';}
 function viewer(){
  nav();const model=current.dayModel||current.model||(current.names&&current.timing?current:null);
  $('content').innerHTML='<h2>'+esc(page)+'</h2>'+subnav([['teacher','Teacher timetables'],['class','Class timetables'],['tg','TG timetables'],['export','Export']],timetablePage,'timetable')+'<div class="tools"><label>Date<input id="viewDate" type="date" value="'+day+'"></label>'+(model?'<label>Last period to show<select id="lastPeriod">'+Array.from({length:model.maxPeriod+1},(_,p)=>'<option value="'+p+'"'+(p===cutoff(model)?' selected':'')+'>P'+p+' ('+time(model,p+1)+')</option>').join('')+'</select></label><div id="fieldToggles" class="field-toggles"></div>':'')+'</div>'+(model?selectionLabel()+(current.model||current.dayModel?timetableDayStatus()+'<div id="timetableCalendar">'+(current.effectiveDay||current.selection==='upcoming'?'':calendarNotice(current.calendar,model))+'</div>':'')+'<div id="timetableView"></div>':'<section><h3>No current or upcoming timetable for this date</h3></section>');
  $('viewDate').onchange=changeDate;if($('retryTimetableDay'))$('retryTimetableDay').onclick=()=>checkTimetableDay(sequence,true);
  document.querySelectorAll('[data-timetable]').forEach(b=>b.onclick=()=>{if(busy)return;timetablePage=b.dataset.timetable;viewer();});
  if(!model)return;
  $('lastPeriod').onchange=e=>{lastPeriod=Number(e.target.value);try{localStorage.setItem(periodKey(),String(lastPeriod));}catch{}if(timetablePage!=='export')drawTimetable();};fieldToggles();drawTimetable();
 }
 function availabilityView(){
  const previous=availability;current=null;availability={people:(previous?.people||[]).filter(p=>selected.includes(p.id)),date:day};
  $('content').innerHTML='<h2>Check Availability</h2><div class="tools"><label>Date<input id="viewDate" type="date" value="'+day+'"></label><div class="availability-picker"><label for="teacherSearch">Teachers</label><div class="teacher-multiselect"><span id="teacherChips" class="teacher-chips" aria-label="Selected teachers"></span><input type="search" role="combobox" aria-autocomplete="list" id="teacherSearch" autocomplete="off" placeholder="Loading teacher names…" aria-controls="teacherChoices" aria-expanded="false" disabled></div><div id="teacherChoices" class="teacher-options" role="listbox" aria-multiselectable="true" hidden></div></div></div><div id="timetables" aria-live="polite"></div>';
  $('viewDate').onchange=changeDate;mergeAvailability();
 }
 function mergeAvailability(){
  if(page!=='Check Availability'||!availability)return;
  const base=cachedTimetable(day),read=availabilityReads.get(day),result=read?.result,matching=!!result&&(!base||result.timetableId===base.modelId),people=[],before=availability.people||[];
  const verified=matching?result.people||[]:[],mapped=new Map();
  // Only the server's unique timetable mapping can join a baseline label to a staff ID.
  for(const person of verified)if(person.timetableName){const matches=verified.filter(p=>p.timetableName===person.timetableName);if(matches.length===1)mapped.set(person.timetableName,person);}
  for(const name of base?RosterExport.names(base.model):[]){const localKey='timetable:'+base.modelId+':'+name,person=mapped.get(name);people.push({...person,id:person?.id||localKey,name,baselineName:name,localKey,modelId:base.modelId});}
  for(const person of verified)if(!people.some(p=>p.id===person.id))people.push({...person,baselineName:null});
  selected=selected.map(id=>{const prior=before.find(p=>p.id===id);return people.find(p=>p.id===id||prior?.localKey&&p.localKey===prior.localKey)?.id||id;});
  for(const id of selected)if(!people.some(p=>p.id===id)){const prior=before.find(p=>p.id===id);if(prior)people.push({...prior,baselineName:null});}
  availability={...availability,people,base,result:matching?result:null,until:matching?read.until:0};
  availabilityPicker();drawAvailability();
 }
 async function loadAvailabilityDirectory(){
  const epoch=sessionEpoch,date=day,ticket=availabilitySequence;
  const active=()=>epoch===sessionEpoch&&ticket===availabilitySequence&&date===day&&page==='Check Availability';
  mergeAvailability();
  localTimetable(date).then(()=>{if(active())mergeAvailability();}).catch(e=>{if(active()&&!e.stale){availability.baselineError=errorText(e);drawAvailability();}});
  await loadAvailability();
 }
 function fieldToggles(){
  const holder=$('fieldToggles');if(!holder)return;
  const type=timetablePage;if(type==='export'){holder.innerHTML='<p class="hint">Uses the saved field settings for each timetable view.</p>';return;}
  const show=RosterExport.fields(type,viewFields[type]);
  const choices=[['subject','Subject'],['class',type==='class'?'Shared classes':'Class'],['venue','Venue'],['group','TG / Group'],...(type!=='teacher'?[['teachers','Teachers']]:[]),...(type==='class'?[['tgTeachers','Teachers in TG lessons']]:[])];
  holder.innerHTML='<fieldset><legend>Fields to show</legend>'+choices.map(([key,label])=>'<label class="check"><input type="checkbox" data-display-field="'+key+'" '+(show[key]?'checked':'')+'>'+label+'</label>').join('')+'</fieldset>';
  holder.querySelectorAll('[data-display-field]').forEach(input=>input.onchange=()=>{viewFields[type]={...show,[input.dataset.displayField]:input.checked};try{localStorage.setItem(fieldsKey(),JSON.stringify(viewFields));}catch{}fieldToggles();drawTimetable();});
 }
 async function loadAvailability(){
  const epoch=sessionEpoch,date=day,ticket=availabilitySequence;
  const active=()=>epoch===sessionEpoch&&ticket===availabilitySequence&&date===day&&page==='Check Availability';
  let read=availabilityReads.get(date);
  if(read?.result&&read.until>Date.now()){mergeAvailability();return;}
  if(!read?.promise){read={result:read?.result,until:0};const owned=read;read.promise=api('operations',{operation:'availability',date,complete:true}).then(result=>{
   if(epoch!==sessionEpoch||availabilityReads.get(date)!==owned)return;
   owned.result=result;owned.until=result.complete===true&&result.date===date?Date.now()+60000:0;
   if(owned.until)setTimeout(()=>{if(epoch===sessionEpoch&&availabilityReads.get(date)===owned&&day===date&&page==='Check Availability')mergeAvailability();},60010);
  }).finally(()=>{owned.promise=null;});availabilityReads.set(date,read);while(availabilityReads.size>16)availabilityReads.delete(availabilityReads.keys().next().value);}
  availability.checking=true;availability.error='';mergeAvailability();
  try{await read.promise;if(!active())return;availability.checking=false;mergeAvailability();const base=cachedTimetable(date);if(read.result?.timetableId&&base&&read.result.timetableId!==base.modelId){await localTimetable(date,true);if(active())mergeAvailability();}}
  catch(e){if(!active()||e.stale)return;availability.checking=false;availability.error=errorText(e);mergeAvailability();}
 }
 function availabilityPicker(){
  const root=$('teacherSearch')?.closest('.availability-picker');if(!root)return;
  window.RosterOpsUI.teacherMultiPicker(root,availability.people||[],selected,ids=>{selected=ids;drawAvailability();},{id:'teacher',label:'Teachers'});
 }
 function combobox(names,value,onChoose){
  const input=$('nameSearch'),list=$('nameOptions'),toggle=$('nameToggle');let matches=[],position=-1;
  function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
  function open(all=false){const q=all?'':input.value.toLowerCase();matches=names.filter(n=>n.toLowerCase().includes(q));position=-1;list.innerHTML=matches.length?matches.map((n,i)=>'<li id="nameOption'+i+'" role="option" aria-selected="'+(n===value)+'" data-index="'+i+'">'+esc(n)+'</li>').join(''):'<li class="no-match" role="presentation">No matches</li>';list.hidden=false;input.setAttribute('aria-expanded','true');input.removeAttribute('aria-activedescendant');list.querySelectorAll('[data-index]').forEach(item=>item.onmousedown=e=>{e.preventDefault();choose(Number(item.dataset.index));});}
  function choose(i){if(!matches[i])return;value=matches[i];input.value=value;close();onChoose(value);}
  input.value=value;input.onfocus=()=>{input.select();open(true);};input.oninput=()=>open();input.onblur=()=>{input.value=value;close();};
  toggle.onmousedown=e=>e.preventDefault();toggle.onclick=()=>{if(!list.hidden){close();return;}input.focus();open(true);};
  input.onkeydown=e=>{if(e.key==='Escape'){close();input.value=value;return;}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(list.hidden)open(true);if(!matches.length)return;position=position<0?(e.key==='ArrowDown'?0:matches.length-1):(position+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length;list.querySelectorAll('[role=option]').forEach((x,i)=>x.classList.toggle('highlighted',i===position));input.setAttribute('aria-activedescendant','nameOption'+position);list.children[position].scrollIntoView?.({block:'nearest'});}else if(e.key==='Enter'&&!list.hidden){e.preventDefault();choose(position<0?0:position);}};
 }
 function exportPages(type,names,source='current'){
  const baseline=source==='baseline'||!current.effectiveDay,model=baseline?current.model:current.dayModel;if(!model)return [];const available=RosterExport.names(model,type),chosen=names?.filter(name=>available.includes(name));
  if(chosen&&!chosen.length)return [];
  const options={type,fields:viewFields[type],...(chosen?{names:chosen}:{}),lastPeriod:cutoff(model),timetableName:(current.selected||current.active)?.name||'',dateLabel:source==='baseline'?'Baseline weekly timetable · '+displayDate(day):timetableDayLabel()};
  return baseline?RosterExport.pages(current.model,options):RosterExport.dayPages(current.effectiveDay,options);
 }
 function pageHtml(pages){return pages.map(p=>'<section class="week-sheet"><h3>'+esc(p.title)+'</h3>'+(p.subtitle?'<p class="sheet-subtitle">'+esc(p.subtitle)+'</p>':'')+RosterExport.tableHtml(p)+'</section>').join('');}
 async function timetableModel(){
  if(current?.model||current?.dayModel)return current;
  const before=current,date=day,result=await localTimetable(date);
  if(page!=='Timetable'||current!==before||day!==date)return null;
  current=result;viewer();return result;
 }
 function drawTimetable(){
  const holder=$('timetableView');if(!holder)return;
  const source=current.effectiveDay?.source==='confirmed'?'confirmed':'published',sourceTitle=source==='confirmed'?'Confirmed':'Published';
  const namesFor=type=>[...new Set([...(current.names?.[type]||(current.model?RosterExport.names(current.model,type):[])),...(current.dayModel?RosterExport.names(current.dayModel,type):[])])].sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
  if(timetablePage==='teacher'&&ownTimetableDate===day&&current.effectiveDay){
   const own=current.effectiveDay.teachers.filter(t=>t.staffId===profile.user.staffId);chosenNames.teacher=own.length===1?(own[0].timetableName||own[0].name):'';ownTimetableDate=null;
  }
  if(timetablePage==='export'){
   holder.innerHTML='<section class="export-panel"><h3>Export all timetables</h3><p>'+(current.effectiveDay?'Exports use the '+source+' arrangements for '+esc(displayDate(day))+'.':'Baseline weekly exports keep each week pattern separately.')+' The last period above applies to both exports.</p><div class="tools"><label>File format<select id="exportFormat"><option value="pdf">PDF / Print</option><option value="excel">Excel</option></select></label><button id="allTeachers" class="primary">All teachers</button><button id="allClasses" class="primary">All classes</button></div></section>';
   for(const [id,type] of [['allTeachers','teacher'],['allClasses','class']]){$(id).disabled=!(current.dayModel?RosterExport.names(current.dayModel,type):namesFor(type)).length;$(id).onclick=()=>{const format=$('exportFormat').value;run(async()=>{if(await timetableModel())await exportTimetables(type,null,format);});};}return;
  }
  const type=timetablePage,names=namesFor(type),label=type==='teacher'?'Teacher':type==='class'?'Class':'TG';
  if(!names.includes(chosenNames[type]))chosenNames[type]='';
  holder.innerHTML=names.length?'<div class="tools selection-tools"><div class="name-picker"><label for="nameSearch">'+label+'</label><div class="combo-input"><input id="nameSearch" type="text" role="combobox" aria-autocomplete="list" aria-controls="nameOptions" aria-expanded="false" autocomplete="off" placeholder="Type part of a name"><button id="nameToggle" type="button" aria-label="Show '+label.toLowerCase()+' names" tabindex="-1">▾</button></div><ul id="nameOptions" class="name-options" role="listbox" aria-label="'+label+' names" hidden></ul></div><button id="print" disabled>'+ (current.effectiveDay?'Save '+source+' PDF / Print':'Save PDF / Print')+'</button><button id="exportExcel" disabled>'+ (current.effectiveDay?'Export '+source+' Excel':'Export Excel')+'</button></div><div id="timetables" aria-live="polite"></div>':'<p class="empty-state">No '+label.toLowerCase()+' names were found in this timetable.</p>';
  if(!names.length)return;
  const draw=()=>{
   const name=chosenNames[type];$('print').disabled=!name;$('exportExcel').disabled=!name;
   if(!name){$('timetables').innerHTML='<p class="hint">Select a '+label.toLowerCase()+' to show a timetable.</p>';return;}
   if(!current.model&&!current.dayModel){const before=current,date=day;$('timetables').textContent='Loading timetable…';$('print').disabled=true;$('exportExcel').disabled=true;timetableModel().catch(e=>{if(!e.stale&&page==='Timetable'&&current===before&&day===date&&timetablePage===type&&chosenNames[type]===name){$('timetables').innerHTML='<p class="error">'+esc(errorText(e))+'</p><button id="retryTimetable">Retry</button>';$('retryTimetable').onclick=draw;}});return;}
   const shown=exportPages(type,[name]);$('print').disabled=!shown.length;$('exportExcel').disabled=!shown.length;
   if(!current.effectiveDay){$('timetables').innerHTML=pageHtml(shown);return;}
   const baseline=exportPages(type,[name],'baseline');
   $('timetables').innerHTML='<div class="timetable-source" data-timetable-source="'+source+'" role="region" aria-labelledby="'+source+'TimetableTitle"><h3 id="'+source+'TimetableTitle">'+sourceTitle+' suspended timetable · '+esc(displayDate(day))+'</h3>'+ (shown.length?pageHtml(shown):'<p class="empty-state">No '+source+' timetable rows for '+esc(name)+' on this date.</p>')+'</div><div class="timetable-source" data-timetable-source="baseline" role="region" aria-labelledby="baselineTimetableTitle"><h3 id="baselineTimetableTitle">Baseline weekly timetable</h3><p class="hint">The recurring timetable is shown below for comparison.</p>'+ (baseline.length?'<div class="tools"><button id="baselinePrint">Save baseline PDF / Print</button><button id="baselineExcel">Export baseline Excel</button></div>'+pageHtml(baseline):'<p class="empty-state">No baseline timetable rows for '+esc(name)+'. This name appears only in the '+source+' day.</p>')+'</div>';
   if($('baselinePrint'))$('baselinePrint').onclick=()=>run(()=>exportTimetables(type,[name],'pdf','baseline'));
   if($('baselineExcel'))$('baselineExcel').onclick=()=>run(()=>exportTimetables(type,[name],'excel','baseline'));
  };
  combobox(names,chosenNames[type],name=>{ownTimetableDate=null;chosenNames[type]=name;draw();});draw();
  $('print').onclick=()=>run(()=>exportTimetables(type,[chosenNames[type]],'pdf'));
  $('exportExcel').onclick=()=>run(()=>exportTimetables(type,[chosenNames[type]],'excel'));
 }
 function clearPrint(){document.getElementById('rosterPrint')?.remove();document.body.classList.remove('printing-roster');}
 window.addEventListener('afterprint',clearPrint);
 async function exportTimetables(type,names,format,source='current'){
  const pages=exportPages(type,names,source),filename=((current.selected||current.active)?.name||'Timetable')+(source==='baseline'?' baseline':'')+' '+(names?names[0]:type==='teacher'?'All teachers':'All classes')+'.xlsx';if(!pages.length)throw Error('There are no timetables to export.');
  if(format==='excel'){status('Creating Excel…');const out=await RosterExport.makeWorkbook(pages);download(out.blob,filename);status('Excel is ready.');return;}
  clearPrint();const target=document.createElement('div');target.id='rosterPrint';target.innerHTML=pageHtml(pages);document.body.append(target);document.body.classList.add('printing-roster');try{window.print();}catch(e){clearPrint();throw e;}
 }
 function baselineAvailability(){
  const base=availability.base,people=availability.people.filter(p=>selected.includes(p.id));if(!base?.model||!people.length)return '';
  const weekday=(new Date(day+'T12:00:00Z').getUTCDay()+6)%7;if(weekday>4)return '<p class="hint">There are no baseline weekday periods for this date.</p>';
  const overlay=availability.result,parity=availability.until>Date.now()?overlay?.parity:base.calendar?.parity;
  const weeks=GSISRoster.weeks(base.model).filter(([label])=>base.model.layoutMode!=='odd-even'||!['odd','even'].includes(parity)||label.toLowerCase().startsWith(parity));
  return '<p class="banner">Baseline preview only. Blank periods do not confirm current availability.'+(base.selection==='upcoming'?' This timetable is upcoming.':'')+'</p>'+weeks.map(([label,week])=>{
   const valid=people.filter(p=>p.baselineName&&p.modelId===base.modelId&&week.blocks.filter(b=>b.name===p.baselineName).length===1),unknown=people.filter(p=>!valid.includes(p));
   return '<h3>'+esc(label)+'</h3>'+(unknown.length?'<p class="hint">No matched baseline timetable: '+unknown.map(p=>esc(p.name)).join(', ')+'.</p>':'')+'<div class="table-scroll"><table class="availability-table"><thead><tr><th>Period and time</th><th>No baseline lesson</th></tr></thead><tbody>'+Array.from({length:week.perDay},(_,period)=>{const free=valid.filter(p=>GSISRoster.available(week,[p.baselineName],weekday).includes(period)),common=valid.length===people.length&&free.length===people.length;return '<tr'+(common?' class="baseline-common-free"':'')+'><th scope="row">P'+period+'<small>'+time(base.model,period)+'–'+time(base.model,period+1)+'</small></th><td>'+free.map(p=>'<span class="available-teacher">'+esc(p.name)+'</span>').join(' ')+(free.length?'':'<span class="hint">None</span>')+(common?'<span class="common-label">No baseline lessons for all selected teachers</span>':'')+'</td></tr>';}).join('')+'</tbody></table></div>';
  }).join('');
 }
 function drawAvailability(){
  const out=$('timetables'),data=availability;if(!out||!data)return;
  const notice=data.checking?'<p role="status">Checking current availability…</p>':data.error?'<p class="error">'+esc(data.error)+'</p><button id="retryAvailability">Retry current availability</button>':data.until<=Date.now()?'<button id="retryAvailability">Refresh current availability</button>':'';
  if(!selected.length){out.innerHTML=notice+'<p class="hint">Select teachers to check their availability.</p>';}
  else{const live=data.result,verifiedIds=new Set((live?.people||[]).map(p=>p.id)),confirmed=live?.confirmed===true&&live.complete===true&&data.base?.selection!=='upcoming'&&data.until>Date.now()&&selected.every(id=>verifiedIds.has(id));
   if(!confirmed)out.innerHTML=notice+(live?.warning?'<p class="banner">'+esc(live.warning)+'</p>':'')+baselineAvailability()+(data.base?'':'<p class="hint">'+esc(data.baselineError||'Loading the baseline timetable. Current availability is not confirmed.')+'</p>');
   else{const selectedSet=new Set(selected);out.innerHTML=notice+(live.warning?'<p class="banner">'+esc(live.warning)+'</p>':'')+'<p class="hint">Teal rows show periods when every selected teacher is available.</p><div class="table-scroll"><table class="availability-table"><thead><tr><th>Period and time</th><th>Available teachers</th></tr></thead><tbody>'+(live.periods||[]).map(p=>{const free=(p.available||[]).filter(t=>selectedSet.has(t.id)),common=selected.every(id=>free.some(t=>t.id===id));return '<tr'+(common?' class="common-free"':'')+'><th scope="row">P'+Number(p.period)+'<small>'+esc(p.start)+'–'+esc(p.end)+'</small></th><td>'+free.map(t=>'<span class="available-teacher">'+esc(t.name)+'</span>').join(' ')+(free.length?'':'<span class="hint">None</span>')+(common?'<span class="common-label">All selected teachers are free</span>':'')+'</td></tr>';}).join('')+'</tbody></table></div>';}
  }
  if($('retryAvailability'))$('retryAvailability').onclick=loadAvailabilityDirectory;
 }
 async function start(){sessionEpoch++;if(!profile)$('content').innerHTML='<section><h2>Roster</h2><p role="status" class="ops-status-pending"><span class="timetable-day-spinner" aria-hidden="true"></span>Checking school sign-in…</p></section>';try{const [cfg,session]=await Promise.all([fetch('/api/config').then(async r=>{const x=await r.json();if(!r.ok||x?.ok===false||x?.error){const e=Error(x?.error||'Roster configuration could not be loaded.');e.status=r.status;e.code=/^[A-Z][A-Z0-9_]{1,63}$/.test(x?.code||'')?x.code:'';e.diagnosticId=/^[a-f0-9-]{8,36}$/i.test(x?.diagnosticId||'')?x.diagnosticId:'';e.backendVersion=/^\d+\.\d+\.\d+[a-z]?$/.test(x?.backendVersion||'')?x.backendVersion:'';e.failureStage=/^[a-z][a-z-]{1,40}$/.test(x?.failureStage||'')?x.failureStage:'';e.operation=/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(x?.operation||'')?x.operation:'';throw e;}return x;}),api('session',{},'GET').then(()=>({signedIn:true}),e=>e.status===401?{signedIn:false}:{error:e})]);if(!cfg?.clientId)throw Error('School sign-in is not configured.');if(session.error)throw session.error;if(session.signedIn){await load();return;}
  $('content').innerHTML='<section><h2>Roster</h2><p>Sign in to open your school timetable and relief duties.</p></section>';status('Sign in with your @gsps.edu.sg account.');let attempts=0;const bind=()=>{if(!window.google?.accounts?.id){if(++attempts>30){status('Google sign-in did not load. Use Refresh to retry.',true);return;}setTimeout(bind,200);return;}google.accounts.id.initialize({client_id:cfg.clientId,hd:'gsps.edu.sg',callback:async x=>{try{await api('session',{},'POST',x.credential);sessionEpoch++;await load();}catch(e){failure(e);}}});google.accounts.id.renderButton($('signin'),{theme:'outline',size:'large'});};bind();
 }catch(e){failure(e);}}
 $('refresh').onclick=async()=>{if(!busy&&!loadingProfile&&(!window.RosterOpsUI?.isDirty?.()||await window.RosterOpsUI.flushPending())&&discardDraft()){apiReadGeneration++;apiReads.clear();invalidateHomeRelief();(profile?load().then(()=>scheduleTimetablePreload(true)):start()).catch(failure);}};
 if($('rosterHome'))$('rosterHome').onclick=()=>go('Home');
 $('logout').onclick=async()=>{if(busy||loadingProfile)return;if(window.RosterOpsUI?.isDirty?.()&&!await window.RosterOpsUI.flushPending()||!discardDraft())return;if(pending&&!confirm('A save is awaiting confirmation. Sign out anyway?'))return;try{await api('logout');pending=null;clear();await start();}catch(e){failure(e);}};
 async function checkFreshness(){
  if(page==='Home')showHomeTimetable();
  if(page==='Home'&&homeDutyDay&&homeDutyDay!==today())resetHomeDuty();
  if(page==='Home'&&homeReliefDay&&homeReliefDay!==today())invalidateHomeRelief();
  const planning=activePlanner();
  if(!profile||busy||loadingProfile||pending||uploadDraft||baselineDirty()||!planning&&operationsDirty()&&!window.RosterOpsUI?.canRefreshLocal?.()||document.hidden||checkingFreshness||profileDay===today()&&Date.now()-profileCheckedAt<60000)return;
  checkingFreshness=true;const previous=profile,view=page,ticket=sequence,planner=window.RosterStaplerUI?.planningToken?.();
  try{const fresh=await api('profile',{date:today()},'POST',undefined,{background:true});if(profile!==previous||view!==page||ticket!==sequence||planner!==window.RosterStaplerUI?.planningToken?.()||loadingProfile||busy||pending||uploadDraft||baselineDirty())return;
   // Verify authority even while editing; an active saved planner is equally
   // protected. Neither a timer nor a delayed response may replace its DOM/state.
   if(activePlanner()){
    profileCheckedAt=Date.now();profileDay=today();
    if($('systemHealthLink'))$('systemHealthLink').hidden=fresh?.user?.accessVerified!==true||fresh.user.admin!==true||fresh.user.email!==previous.user.email;
    if(fresh?.user?.accessVerified===true&&typeof fresh.user.smc==='boolean'&&fresh.user.email===previous.user.email&&fresh.user.staffId===previous.user.staffId){
     const rolesChanged=fresh.user.admin!==profile.user.admin||fresh.user.smc!==profile.user.smc;
     if(rolesChanged){window.RosterBaselineCache?.removeOwner(cacheOwner());window.RosterReportCache?.clear();clearTimetablePreload();models.clear();}
     profile.user={...fresh.user};nav();
    }
    await window.RosterStaplerUI.checkAccess(fresh);
    return;
   }
   if(operationsDirty()&&!window.RosterOpsUI?.canRefreshLocal?.())return;
   if(fresh?.user?.accessVerified!==true||typeof fresh.user.smc!=='boolean'){clear();throw Error('Roster access could not be verified. Use Refresh to retry.');}
   profileCheckedAt=Date.now();
   if(profileDay!==today()||fresh.revision!==profile.revision||fresh.user.email!==profile.user.email||fresh.user.smc!==profile.user.smc||fresh.user.admin!==profile.user.admin||fresh.user.staffId!==profile.user.staffId||(fresh.selected||fresh.active)?.id!==(profile.selected||profile.active)?.id)await load(fresh);else if(page==='Home'){await Promise.all([refreshInboxBadge(),refreshHomeDuty(),window.RosterAcknowledgements?.refresh(cacheOwner(),today())]);if(profile===previous&&view===page&&ticket===sequence)await refreshHomeRelief();}else if(page==='Check Availability')await loadAvailabilityDirectory();else if(isOperations())await window.RosterOpsUI?.refreshCurrent?.();else if(page==='Timetable'&&(current?.model||current?.dayModel))await checkTimetableDay(sequence);if(profile===previous)scheduleTimetablePreload();
  }catch(e){if(!e.stale&&activePlanner()){if(e.status===401||e.status===403)window.RosterStaplerUI.blockAccess('Planning access could not be verified. Download recovery JSON, then use Refresh to sign in or check access.');else status('Online check unavailable. Your open planner is retained. '+errorText(e),true);}else if(profile===previous||!profile)failure(e);}finally{checkingFreshness=false;}
 }
 setInterval(checkFreshness,60000);
 function nextTimetableCheck(){
  const next=(Math.floor((Date.now()-20*60000)/3600000)+1)*3600000+20*60000;
  setTimeout(()=>{if(!document.hidden)scheduleTimetablePreload();nextTimetableCheck();},Math.max(1000,next-Date.now()));
 }
 nextTimetableCheck();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){scheduleTimetablePreload();checkFreshness();}});
 window.addEventListener('hashchange',async()=>{if(clearRetiredRoute()){if(profile)await go('Home');return;}if(location.hash==='#reportAbsence'&&profile)await go('Report Absence');const notifyDate=dailyNotifyLinkDate();if(notifyDate&&profile&&(profile.user.smc||profile.user.admin))await go('Daily Notify',notifyDate);const peerLink=peerRequestLink();if(peerLink&&profile)await go('My Relief Duties',peerLink.date);if(location.hash==='#whatsappInbox'&&profile&&(profile.user.smc||profile.user.admin)){await go('WhatsApp Inbox');if(page==='WhatsApp Inbox'&&location.hash==='#whatsappInbox')history.replaceState(null,'',location.pathname+location.search);}});
 window.addEventListener('beforeunload',e=>{if(busy||pending||uploadDraft||baselineDirty()||operationsLeaveWarning()){e.preventDefault();e.returnValue='';}});start();
})();
