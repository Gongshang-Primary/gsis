/* OVERLORD v0.9.7 — explicit reload from Sheets */
"use strict";
const API={dashboard:'/api/dashboard',reference:'/api/reference',transaction:'/api/transaction'},REFRESH=60;let data=null,reference=null,remaining=REFRESH,selected=null;let initialTimelinePositioned=false;
let dashboardGeneration=0,referenceGeneration=0,manualReload=false;
let dashboardInFlight=null,dashboardRequestDate="",dashboardPending=false;
const $=id=>document.getElementById(id),els={open:$('openCount'),overdue:$('overdueCount'),trolleys:$('trolleyCount'),devices:$('deviceCount'),returned:$('returnedTodayCount'),timeline:$('timeline'),viewport:$('timelineViewport'),details:$('details'),exceptions:$('exceptions'),date:$('dateInput'),last:$('lastUpdated'),count:$('countdown'),refresh:$('refreshBtn'),alert:$('alertStrip'),telegram:$('telegramStatusText'),toast:$('toast'),edit:$('editSelectedBooking'),scheduleOverlay:$('scheduleLoadingOverlay'),scheduleLoadingText:$('scheduleLoadingText')};
const V1_RETRYABLE_STATUS=new Set([408,425,429,500,502,503,504]);
const V1_REFERENCE_CACHE_KEY='OVERLORD_V1_3_REFERENCE';
const V1_REFERENCE_CACHE_MS=12*60*60*1000;
const V1_REFERENCE_STALE_MS=7*24*60*60*1000;
const V11_DASHBOARD_CACHE_PREFIX='OVERLORD_V1_3_DASHBOARD_';
const V11_DASHBOARD_STALE_MS=24*60*60*1000;
const V1_BOOKING_CACHE_PREFIX='OVERLORD_V1_BOOKING_';
const v1Sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function v1LooksHtml(text){return /^\s*<!doctype\s+html/i.test(String(text||''))||/^\s*<html[\s>]/i.test(String(text||''))}
function v1ApiError(message,{retryable=false,status=0,code='API_ERROR',cause=null}={}){const error=new Error(message);error.retryable=Boolean(retryable);error.status=Number(status)||0;error.code=code;if(cause)error.cause=cause;return error}
function v1FriendlyApiMessage(payload,status,text){
  if(payload&&payload.error)return String(payload.error);
  if(v1LooksHtml(text))return 'The service returned a temporary HTML error page instead of data.';
  if(status===429)return 'The service is busy. Please try again.';
  if(status>=500)return 'The service is temporarily unavailable.';
  return 'The server returned an invalid response.';
}
async function apiJsonV1(path,options={},policy={}){
  const init={cache:'no-store',credentials:'same-origin',...options};
  const method=String(init.method||'GET').toUpperCase();
  const retries=Number.isFinite(policy.retries)?Math.max(0,policy.retries):(method==='GET'?1:0);
  const retryDelays=policy.retryDelays||[650,1600,3200];
  let lastError=null;
  for(let attempt=0;attempt<=retries;attempt++){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),policy.timeoutMs || (method==='GET'?55000:75000));
    try{
      const response=await fetch(path,controller?{...init,signal:controller.signal}:init);
      const text=await response.text();
      let payload=null;
      if(text.trim()){
        try{payload=JSON.parse(text)}
        catch(parseError){
          const retryable=V1_RETRYABLE_STATUS.has(response.status)||response.status===0||v1LooksHtml(text)||response.ok;
          throw v1ApiError(v1FriendlyApiMessage(null,response.status,text),{retryable,status:response.status,code:v1LooksHtml(text)?'HTML_INSTEAD_OF_JSON':'INVALID_JSON',cause:parseError});
        }
      }
      if(!payload||typeof payload!=='object')throw v1ApiError('The server returned an empty or invalid response.',{retryable:true,status:response.status,code:'EMPTY_RESPONSE'});
      if(!response.ok||payload.ok===false){
        const retryable=Boolean(payload.retryable)||V1_RETRYABLE_STATUS.has(response.status);
        throw v1ApiError(v1FriendlyApiMessage(payload,response.status,text),{retryable,status:response.status,code:payload.code||'API_ERROR'});
      }
      return payload;
    }catch(error){
      const normal=error&&typeof error.retryable==='boolean'?error:v1ApiError(error&&error.message?error.message:'Network request failed.',{retryable:true,code:'NETWORK_ERROR',cause:error});
      lastError=normal;
      if(!normal.retryable||attempt>=retries||(method==='GET'&&document.hidden))break;
      if(typeof policy.onRetry==='function')policy.onRetry({attempt:attempt+1,totalRetries:retries,error:normal});
      await v1Sleep(retryDelays[Math.min(attempt,retryDelays.length-1)]||1600);
    }finally{if(timeout)clearTimeout(timeout)}
  }
  throw lastError||v1ApiError('Request failed.',{retryable:true});
}
function v1ReadSessionCache(key,maxAgeMs){try{const raw=sessionStorage.getItem(key);if(!raw)return null;const parsed=JSON.parse(raw);if(!parsed||!parsed.savedAt||Date.now()-parsed.savedAt>maxAgeMs)return null;return parsed.data}catch{return null}}
function v1WriteSessionCache(key,value){try{sessionStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data:value}))}catch{}}
function v11ReadLocalCache(key,maxAgeMs){try{const raw=localStorage.getItem(key);if(!raw)return null;const parsed=JSON.parse(raw);if(!parsed||!parsed.savedAt||Date.now()-parsed.savedAt>maxAgeMs)return null;return parsed}catch{return null}}
function v11WriteLocalCache(key,value){try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data:value}))}catch{}}
function v11DashboardCacheKey(date){return V11_DASHBOARD_CACHE_PREFIX+String(date||'')}
function v1BookingCacheKey(id){return V1_BOOKING_CACHE_PREFIX+String(id||'')}
function v1DashboardReferenceFallback(){return {teachers:[],classes:[],subjects:[],bookingResources:(data&&data.resources||[]).slice(),periods:(data&&data.periods||[]).slice()}}
function setScheduleLoading(isLoading,message){if(!els.scheduleOverlay)return;els.scheduleOverlay.classList.toggle('hidden',!isLoading);if(els.scheduleLoadingText)els.scheduleLoadingText.textContent=message||'Loading schedule…';els.viewport.setAttribute('aria-busy',isLoading?'true':'false')}
function resourceDisplayClass(resource){const deviceType=String(resource&&resource.deviceType||'').toLowerCase(),resourceName=String(resource&&resource.resource||'').toLowerCase();if(deviceType.includes('ipad')||resourceName.includes('ipad'))return 1;if(deviceType.includes('laptop')||deviceType.includes('windows')||deviceType.includes('notebook')||deviceType.includes('chromebook')||deviceType.includes('macbook')||resourceName.includes('laptop'))return 2;return 0}
function compareResourcesForDisplay(a,b){const d=resourceDisplayClass(a)-resourceDisplayClass(b);return d||String(a.resource||'').localeCompare(String(b.resource||''),'en',{numeric:true,sensitivity:'base'})}
function refresh(options={}){
  if(manualReload || document.hidden)return Promise.resolve();
  if(dashboardInFlight){
    if(options.afterWrite || dashboardRequestDate!==els.date.value)dashboardPending=true;
    return dashboardInFlight;
  }
  dashboardRequestDate=els.date.value;
  dashboardInFlight=refreshDashboard().finally(()=>{
    dashboardInFlight=null;
    if(dashboardPending){dashboardPending=false;return refresh();}
  });
  return dashboardInFlight;
}
async function refreshDashboard(){
  const generation=++dashboardGeneration,date=els.date.value;
  els.refresh.disabled=true;
  const hadData=Boolean(data);
  if(!hadData)setScheduleLoading(true,'Loading schedule…');
  try{
    const p=await apiJsonV1(`${API.dashboard}?date=${encodeURIComponent(els.date.value)}`,{}, {retries:1,onRetry:({attempt,totalRetries})=>{if(generation===dashboardGeneration&&!hadData)setScheduleLoading(true,`Live service busy · retrying ${attempt}/${totalRetries}…`)}});
    if(generation!==dashboardGeneration||date!==els.date.value)return;
    data=p.data;
    v11WriteLocalCache(v11DashboardCacheKey(els.date.value),data);
    render();
    refreshComplianceIndicator();
    setScheduleLoading(false);
    els.last.textContent=`Updated ${new Intl.DateTimeFormat('en-SG',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date())}`;
    remaining=REFRESH;
    // Refresh shared lists without replacing any open editor's form values.
    if(reference)refreshReferenceV11().catch(()=>{});
  }catch(e){
    if(generation!==dashboardGeneration||date!==els.date.value)return;
    if(hadData){
      setScheduleLoading(false);
      els.last.textContent='Live refresh delayed · showing last loaded schedule';
      toast(`Live refresh delayed. ${e.message}`);
    }else{
      const stale=v11ReadLocalCache(v11DashboardCacheKey(els.date.value),V11_DASHBOARD_STALE_MS);
      if(stale&&stale.data){
        data=stale.data;
        render();
        setScheduleLoading(false);
        els.last.textContent='Live service delayed · showing last-good schedule';
        toast(`Live schedule refresh delayed. Showing the last successful copy while you retry. ${e.message}`);
      }else{
        setScheduleLoading(true,'Schedule could not be loaded. Use Refresh to try again.');
        toast(e.message);
      }
    }
  }finally{if(generation===dashboardGeneration)els.refresh.disabled=false}
}
function showManagedDialog(modal){
  const opener=document.activeElement;
  const heading=modal.querySelector('h2');
  if(heading){heading.id=modal.id+'Title';modal.setAttribute('aria-labelledby',heading.id);}
  const close=modal.querySelector('.editor-heading button');
  if(close){close.setAttribute('aria-label','Close dialog');close.setAttribute('autofocus','');}
  modal.addEventListener('cancel',event=>{event.preventDefault();if(!modal.querySelector('.is-busy')&&!modal.dataset.busy)closeManagedDialog(modal);});
  modal.addEventListener('click',event=>{
    if((modal.querySelector('.is-busy')||modal.dataset.busy)&&(event.target===modal||event.target===close)){event.stopImmediatePropagation();event.preventDefault();}
  },true);
  modal.addEventListener('close',()=>{modal.remove();if(opener&&opener.isConnected&&!document.querySelector('dialog[open]'))opener.focus({preventScroll:true});},{once:true});
  document.body.appendChild(modal);
  modal.showModal();
}
function closeManagedDialog(modal){if(modal&&modal.open){modal.close();modal.remove();}}

const BACKGROUND_COMMAND_KEY='OVERLORD_BACKGROUND_COMMAND';
let backgroundRows=[],backgroundPreviewCommand=null,backgroundWarning=null;
const backgroundLabels={waiting:'Waiting',failed:'Confirmed failure',unknown:'Outcome unknown',expired:'Expired',active:'Sending',accepted:'Accepted, delivery unverified',reviewed:'Reviewed',completed:'Completed, no delivery evidence',repair:'Record repair',audit_pending:'Review audit pending'};
function backgroundTime(value){const date=new Date(value);return value&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(date)+' SGT':'Time unavailable';}
async function backgroundPost(command){const payload=await apiJsonV1(API.transaction,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)},{retries:0});if(!payload.ok)throw Error(payload.error||'Background action could not be verified.');return payload.result;}
async function openBackgroundWork(){
  if($('backgroundWorkModal'))return;
  const modal=document.createElement('dialog');modal.id='backgroundWorkModal';modal.className='modal-backdrop';modal.setAttribute('aria-labelledby','backgroundHeading');
  modal.innerHTML=`<section class="editor-card background-card"><div class="editor-heading"><h2 id="backgroundHeading">Background work</h2><button id="closeBackground" aria-label="Close background work">×</button></div><p>Review notification recipients individually. Acceptance is not delivery. Retiring stops future attempts; it cannot recall a submitted message.</p><div class="background-toolbar"><label for="backgroundView">Show<select id="backgroundView"><option value="attention">Needs attention</option><option value="all">All work and reviewed receipts</option></select></label><button id="refreshBackground" type="button">Refresh list</button><button id="selectPastBookings" type="button">Select past bookings</button></div><p id="backgroundStatus" role="status" aria-live="polite">Loading background work…</p><div id="backgroundRows"></div><section class="settings-section"><div class="background-toolbar"><label for="backgroundOperation">Selected recipient action<select id="backgroundOperation"><option value="retry">Retry recoverable work</option><option value="cancel">Cancel unsent notification</option><option value="retire">Review and retire without resend</option></select></label><button id="previewBackground" type="button">Preview selected</button></div><p>Select up to 20 recipients. Record repairs cannot be cancelled here.</p><div id="backgroundPreview" aria-live="polite"></div><button id="recoverBackground" type="button" hidden>Recover last command</button></section><section id="backgroundHistory" class="settings-section"></section></section>`;
  showManagedDialog(modal);$('closeBackground').onclick=()=>closeManagedDialog(modal);
  $('backgroundView').onchange=$('refreshBackground').onclick=loadBackgroundWork;
  $('previewBackground').onclick=previewBackgroundWork;$('selectPastBookings').onclick=selectPastBookings;
  $('backgroundOperation').onchange=()=>{$('backgroundPreview').textContent='';backgroundPreviewCommand=null;};
  $('recoverBackground').onclick=async()=>{try{const saved=JSON.parse(sessionStorage.getItem(BACKGROUND_COMMAND_KEY)||'null');if(saved)await applyBackgroundWork(saved);}catch(error){$('backgroundStatus').textContent=error.message;}};
  try{$('recoverBackground').hidden=!sessionStorage.getItem(BACKGROUND_COMMAND_KEY);}catch(ignore){}
  await loadBackgroundWork();
}
async function loadBackgroundWork(){
  const status=$('backgroundStatus');if(!status)return;
  status.textContent='Loading background work…';$('backgroundPreview').textContent='';backgroundPreviewCommand=null;
  try{
    const response=await apiJsonV1(`${API.transaction}?action=backgroundwork&view=${encodeURIComponent($('backgroundView').value)}`,{},{retries:0});
    if(!response.ok)throw Error(response.error||'Could not read background work.');
    if(!$('backgroundWorkModal'))return;
    backgroundRows=response.data.items||[];backgroundWarning=response.data.warning;
    $('backgroundRows').innerHTML=backgroundRows.length?`<ul class="background-list">${backgroundRows.map((item,i)=>`<li><div class="background-recipient"><label><input type="checkbox" data-background-index="${i}" ${item.actions.length?'':'disabled'} aria-label="Select ${h(item.recipient||item.kind)}">${h(item.recipient||'No recipient')}</label><strong>${h(backgroundLabels[item.state]||item.state)}</strong></div><p>${h(item.kind==='booking_email'?'Booking email':item.kind==='whatsapp_alert'?'WhatsApp notification':'Record repair')}${item.bookingId?' · '+h(item.bookingId):''} · ${h(backgroundTime(item.createdAt))}</p><details><summary>Inspect evidence and actions</summary><p>${h(item.evidence)}</p>${item.error?`<p>${h(item.error)}</p>`:''}${item.reviewedAt?`<p>${h(item.reviewAction)} · ${h(backgroundTime(item.reviewedAt))}</p>`:''}<p>${item.actions.length?'Available actions: '+item.actions.map(h).join(', '):'No notification action available.'}</p></details></li>`).join('')}</ul>`:'<p>No background work in this view.</p>';
    document.querySelectorAll('[data-background-index]').forEach(input=>input.onchange=()=>{const selected=document.querySelectorAll('[data-background-index]:checked');if(selected.length>20){input.checked=false;status.textContent='Choose no more than 20 recipients.';return;}$('backgroundPreview').textContent='';backgroundPreviewCommand=null;});
    $('backgroundHistory').innerHTML=backgroundWarning?`<h3>Historical warning</h3><p>${h(backgroundWarning.detail.task)} · ${h(backgroundTime(backgroundWarning.detail.at))}</p><p>${h(backgroundWarning.detail.detail)}</p><p>Acknowledging records your review of this warning. It does not retry or clear queued work.</p><label class="background-ack"><input id="backgroundReviewed" type="checkbox">I have reviewed the earlier failure and its outcome.</label><button id="acknowledgeBackground" disabled>Acknowledge historical warning</button>`:'<h3>Historical warning</h3><p>No unacknowledged warning.</p>';
    if(backgroundWarning){$('backgroundReviewed').onchange=()=>{$('acknowledgeBackground').disabled=!$('backgroundReviewed').checked;};$('acknowledgeBackground').onclick=acknowledgeBackgroundHistory;}
    status.textContent=`${backgroundRows.length} recipient${backgroundRows.length===1?'':'s'} shown.${response.data.unreadable?' '+response.data.unreadable+' unreadable records require maintainer review.':''}`;
  }catch(error){status.textContent=error.message;}
}

function backgroundDateString(value){if(!value)return '';const match=String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);return match?match[0]:'';}
function backgroundBookingDateString(item){return item?backgroundDateString(item.bookingDate||item.booking_date||item.date):'';}
function backgroundTodaySgt(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
async function backgroundBookingDateFor(item){const direct=backgroundBookingDateString(item);if(direct)return direct;if(!item||!item.bookingId)return '';try{const payload=await apiJsonV1(`${API.transaction}?action=bookingGet&bookingId=${encodeURIComponent(item.bookingId)}&admin=true`,{},{retries:0});if(payload&&payload.booking&&payload.booking.date)return backgroundDateString(payload.booking.date);}catch(ignore){}return '';}
async function selectPastBookings(){
  const status=$('backgroundStatus');if(!status||!$('backgroundWorkModal'))return;
  const button=$('selectPastBookings');if(button)button.disabled=true;
  status.textContent='Checking booking dates…';$('backgroundPreview').textContent='';backgroundPreviewCommand=null;
  try{
    const today=backgroundTodaySgt();
    const inputs=Array.from(document.querySelectorAll('[data-background-index]'));
    let selectedCount=0,pastUnknown=0,pastExpired=0,pastFailed=0,overflow=0;
    for(const input of inputs){
      const item=backgroundRows[Number(input.dataset.backgroundIndex)];
      if(!item||input.disabled){input.checked=false;continue;}
      const date=await backgroundBookingDateFor(item);
      const past=Boolean(date)&&date<today;
      if(!past){input.checked=false;continue;}
      if(item.state==='failed'){pastFailed++;input.checked=false;continue;}
      if(!(item.actions||[]).includes('retire')){input.checked=false;continue;}
      if(selectedCount>=20){overflow++;input.checked=false;continue;}
      if(item.state==='unknown')pastUnknown++;else if(item.state==='expired')pastExpired++;
      input.checked=true;selectedCount++;
    }
    const plural=n=>n===1?'':'s';
    if($('backgroundOperation')&&selectedCount>0)$('backgroundOperation').value='retire';
    if(selectedCount>0){
      $('backgroundPreview').innerHTML=`<h3>Mark ${selectedCount} past-booking item${plural(selectedCount)} as reviewed? This sends nothing.</h3><p>${pastUnknown} Outcome unknown${plural(pastUnknown)} and ${pastExpired} expired item${plural(pastExpired)} selected. Evidence is kept. No resend.</p>${pastFailed?`<p>Confirmed failure: ${pastFailed} past item${plural(pastFailed)} shown separately and not selected by this control. They need a different action.</p>`:''}${overflow?`<p>${overflow} further past item${plural(overflow)} not selected because the 20-recipient limit was reached.</p>`:''}<p>Use Preview selected, then Apply reviewed action, to mark the selected items reviewed through the existing review path.</p>`;
      status.textContent=`${selectedCount} past booking${plural(selectedCount)} selected.`;
    }else{
      $('backgroundPreview').innerHTML=`<h3>No past bookings to review.</h3><p>This sends nothing. Future and undated items were not selected.${pastFailed?` Confirmed failure: ${pastFailed} past item${plural(pastFailed)} shown separately and not selected by this control.`:''}</p>`;
      status.textContent='No past bookings selected.';
    }
  }catch(error){status.textContent=error.message||'Could not check booking dates.';}
  finally{if(button)button.disabled=false;}
}

async function previewBackgroundWork(){
  const status=$('backgroundStatus'),indices=Array.from(document.querySelectorAll('[data-background-index]:checked')).map(input=>Number(input.dataset.backgroundIndex));
  if(!indices.length||indices.length>20){status.textContent='Select between 1 and 20 recipients.';return;}
  const command={action:'backgroundpreview',commandId:crypto.randomUUID(),operation:$('backgroundOperation').value,items:indices.map(i=>{const r=backgroundRows[i];return {taskId:r.taskId,recipient:r.recipient,expectedHash:r.expectedHash};})};
  $('previewBackground').disabled=true;status.textContent='Checking the selected recipients…';
  try{
    const preview=await backgroundPost(command);if(!$('backgroundWorkModal'))return;
    backgroundPreviewCommand={...command,action:'backgroundapply'};
    $('backgroundPreview').innerHTML=`<h3>Review ${h(command.operation)}</h3><ul>${preview.items.map(item=>`<li>${h(item.recipient||item.taskId)}: ${h(item.status)}${item.remainingResume!==undefined?`. ${h(item.remainingResume)} other remaining recipient(s) will resume on the queue.`:''}</li>`).join('')}</ul><p>${h(preview.notice||'The current state will be checked again before applying.')}</p><button id="applyBackground" type="button" class="primary" ${preview.items.some(item=>item.status==='ready')?'':'disabled'}>Apply reviewed action</button>`;
    $('applyBackground').onclick=()=>applyBackgroundWork(backgroundPreviewCommand);status.textContent='Preview ready. Check the recipients and remaining work before applying.';
  }catch(error){status.textContent=error.message;}finally{if($('previewBackground'))$('previewBackground').disabled=false;}
}
async function applyBackgroundWork(command){
  if(!command)return;
  const modal=$('backgroundWorkModal');if(modal.dataset.busy)return;modal.dataset.busy='true';
  const controls=Array.from(modal.querySelectorAll('button,input,select')).map(control=>({control,disabled:control.disabled}));controls.forEach(({control})=>control.disabled=true);$('closeBackground').disabled=true;if($('applyBackground'))$('applyBackground').disabled=true;$('recoverBackground').disabled=true;
  try{
    // Save exact reviewed identity before submission; a lost response recovers
    // this command and cannot turn into a new retry or a refreshed selection.
    sessionStorage.setItem(BACKGROUND_COMMAND_KEY,JSON.stringify(command));$('recoverBackground').hidden=false;
    const result=await backgroundPost(command);
    const unsettled=result.items.some(item=>['unknown_outcome','audit_pending'].includes(item.status));
    if(!unsettled){sessionStorage.removeItem(BACKGROUND_COMMAND_KEY);$('recoverBackground').hidden=true;}
    const summary=result.items.map(item=>`${item.recipient||item.taskId}: ${item.status}`).join(' · ');
    await loadBackgroundWork();$('backgroundStatus').textContent=summary+(unsettled?' Recover the same command to verify its result.':'');
  }catch(error){$('backgroundStatus').textContent=error.message+' Recover the same command to verify its result.';}
  finally{delete modal.dataset.busy;controls.forEach(({control,disabled})=>{if(control.isConnected)control.disabled=disabled;});$('closeBackground').disabled=false;$('recoverBackground').disabled=false;}
}
async function acknowledgeBackgroundHistory(){
  const command={action:'backgroundack',commandId:crypto.randomUUID(),expectedHash:backgroundWarning.expectedHash};
  $('acknowledgeBackground').disabled=true;
  try{const result=await backgroundPost(command);await loadBackgroundWork();$('backgroundStatus').textContent=`Historical warning: ${result.status}. Queued work is unchanged.`;}catch(error){$('backgroundStatus').textContent=error.message;}
}

async function openSystemSettings(){
  if($('systemSettingsModal'))return;
  const modal=document.createElement('dialog');modal.id='systemSettingsModal';modal.className='modal-backdrop';
  modal.innerHTML='<section class="editor-card settings-card"><div class="editor-heading"><h2>System settings</h2><button id="closeSettings">×</button></div><div id="settingsBody" role="status">Loading administrators…</div></section>';
  showManagedDialog(modal);$('closeSettings').onclick=()=>closeManagedDialog(modal);
  try{
    const [p]=await Promise.all([apiJsonV1(`${API.transaction}?action=adminSettings`,{}, {retries:0}),loadReference(true).catch(()=>null)]);
    if(!modal.open)return;
    renderSystemSettings(p.data);
  }catch(error){if(modal.open)$('settingsBody').textContent=error.message;}
}
function renderSystemSettings(settings){
  const admins=settings.admins||[],contacts=settings.contacts||[],wa=settings.whatsapp||{};
  $('settingsBody').removeAttribute('role');
  $('settingsBody').innerHTML=`<section class="settings-section"><h3>Administrators</h3><p>Administrators can manage bookings, grant access and close logging periods with REIGN.</p><ul class="admin-list">${admins.map(a=>`<li><strong>${h(a.name||a.email)}</strong><span>${h(a.email)}</span><small>${!a.active?'Inactive':!a.mobile?'Active · mobile missing in Contacts':wa.ready?'Active · operational alerts enabled':'Active · alerts awaiting setup'}</small></li>`).join('')||'<li>No administrators listed.</li>'}</ul><div class="admin-grant-form"><label for="adminCandidate">Staff member</label><select id="adminCandidate" aria-describedby="adminMobile"><option value="">Choose by name and school email</option>${contacts.map(c=>`<option value="${h(c.email)}">${h(c.name)} · ${h(c.email)}</option>`).join('')}</select><p id="adminMobile">Contact details are maintained in Contacts.</p><button id="grantAdminBtn" class="primary" disabled>Grant admin access</button><p id="adminSettingsStatus" role="status" aria-live="polite"></p></div></section><section class="settings-section"><h3>Background work</h3><p>Review failed notifications, unknown send outcomes and historical warnings.</p><button id="openBackgroundSettings" type="button">Manage background work</button></section><section class="settings-section"><h3>Operational alerts</h3><p>WhatsApp alerts use the school’s staff agreement. No individual approval is required. ${h(wa.status||'Service status unavailable')}. Telegram continues independently.</p></section><section class="settings-section"><h3>Shared data</h3>${LordReference.statusHtml(reference)}<p>Refresh the local GSiS copy and LORD lists after source changes. Online LORD, OVERLORD and STARLORD screens pick up the changes within about two minutes. Existing forms keep their displayed values until reopened.</p><button id="reloadDataBtn" type="button">Read latest from Sheets</button><p id="suiteRefreshStatus" role="status" aria-live="polite"></p></section>`;
  $('openBackgroundSettings').onclick=openBackgroundWork;
  const candidate=$('adminCandidate'),grant=$('grantAdminBtn');
  const update=()=>{
    const contact=contacts.find(c=>c.email===candidate.value);
    $('adminMobile').textContent=contact?(contact.mobile?'Operational alerts use the mobile number in Contacts.':'This staff member has no valid mobile in Contacts. Access can be granted; WhatsApp delivery needs a valid number.'):'Contact details are maintained in Contacts.';
    grant.disabled=!contact;
  };
  candidate.onchange=update;
  grant.onclick=async()=>{
    const target=contacts.find(c=>c.email===candidate.value);
    if(!target)return;
    const modal=$('systemSettingsModal');if(modal.dataset.busy)return;modal.dataset.busy='true';
    modal.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
    $('adminSettingsStatus').textContent='Saving administrator access…';
    try{
      await post({action:'adminGrant',targetEmail:target.email});
      const latest=await apiJsonV1(`${API.transaction}?action=adminSettings`,{}, {retries:0});
      renderSystemSettings(latest.data);
      $('adminSettingsStatus').textContent=`Access saved for ${target.name}. They should sign out and sign in again. ${!target.mobile?'Add their mobile number in Contacts for WhatsApp delivery.':latest.data.whatsapp.ready?'Operational WhatsApp alerts are enabled.':'Operational alerts await service setup.'}`;
    }catch(error){$('adminSettingsStatus').textContent=error.message;candidate.disabled=false;update();}
    finally{delete modal.dataset.busy;$('closeSettings').disabled=false;$('reloadDataBtn').disabled=false;}
  };
  $('reloadDataBtn').onclick=reloadFromSheets;
}
async function reloadFromSheets(){
  if(manualReload||!overlordSession)return;
  if(dashboardInFlight){$('suiteRefreshStatus').textContent='The current schedule refresh is finishing. Please try again in a moment.';return;}
  const modal=$('systemSettingsModal'),button=$('reloadDataBtn');
  if(!modal||modal.dataset.busy)return;
  const disabledBefore=Array.from(modal.querySelectorAll('button,input,select'),el=>[el,el.disabled]);
  disabledBefore.forEach(([el])=>el.disabled=true);
  manualReload=true;dashboardGeneration++;referenceGeneration++;
  modal.dataset.busy='true';button.disabled=true;$('closeSettings').disabled=true;
  $('suiteRefreshStatus').textContent='Checking GSiS and shared lists…';
  try{
    const result=await post({action:'suiteRefresh'});
    reference=result.reference;v11WriteLocalCache(V1_REFERENCE_CACHE_KEY,reference);
    try{Object.keys(sessionStorage).filter(key=>key.startsWith(V1_BOOKING_CACHE_PREFIX)).forEach(key=>sessionStorage.removeItem(key));}catch{}
    $('suiteRefreshStatus').textContent='Shared lists reloaded. '+LordReference.status(reference)+'. Reopen an existing form to use these choices.';
    const status=modal.querySelector('.shared-reference-status');if(status)status.textContent=LordReference.status(reference);
  }catch(error){$('suiteRefreshStatus').textContent='Refresh failed. Current data kept. '+error.message;}
  finally{manualReload=false;delete modal.dataset.busy;disabledBefore.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled;});}
  await refresh();
}

function renderMaintenanceWarning(){
  let notice=$('maintenanceStatus');
  if(!notice){notice=document.createElement('div');notice.id='maintenanceStatus';notice.className='alert-strip hidden';notice.setAttribute('role','alert');els.alert.insertAdjacentElement('beforebegin',notice);}
  const status=data.maintenanceWarning;
  notice.classList.toggle('hidden',!status);
  notice.classList.toggle('maintenance-history',status?.state==='history');
  notice.setAttribute('role',status?.state==='attention'?'alert':'status');
  if(!status){notice.textContent='';return;}
  const failures=status.failures||(status.lastFailure?[status.lastFailure]:[]),counts=status.counts||{};
  const time=value=>{const date=new Date(value);return value&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(date):'Time unavailable';};
  const facts=[['Queued',counts.pendingTasks],['Running',counts.activeTasks],['Failed tasks',counts.failedTasks],['Failures to review',counts.manualFailures],['Uncertain tasks',counts.uncertainTasks],['Uncertain edits',counts.uncertainRequests],['Unreadable records',counts.unreadableRecords],['Older than 7 days',counts.stalePendingTasks]].filter(([,count])=>count>0).map(([label,count])=>`${label}: ${count}`);
  if(counts.estimatedPropertyBytes)facts.push(`Property storage: ${Math.ceil(counts.estimatedPropertyBytes/1024)} KB`);
  notice.innerHTML=`<strong>${h(status.summary||'A background failure was recorded.')}</strong><details><summary>Background task details</summary>${failures.map(failure=>`<p><strong>${h(failure.task)}</strong> · ${h(time(failure.at))}<br>${h(failure.detail)}</p>`).join('')}${status.moreFailures?`<p>${h(status.moreFailures)} further affected tasks or failure categories.</p>`:''}${facts.length?`<p>${facts.map(h).join(' · ')}</p>`:''}<p>${h(status.action||'Ask the Apps Script maintainer to check the execution logs.')}</p>${status.checkedAt?`<small>Checked ${h(time(status.checkedAt))} SGT</small>`:''}</details><button id="openBackgroundNotice" type="button">Manage background work</button>`;
  $('openBackgroundNotice').onclick=openBackgroundWork;
}
function renderTimeline(){const periods=data.periods||[],resources=(data.resources||[]).slice().sort(compareResourcesForDisplay);els.timeline.style.setProperty('--period-count',periods.length);els.timeline.innerHTML=`<div class="timeline-header"><div class="corner"></div>${periods.map(p=>`<div class="period-head"><strong>P${h(p.code)}</strong><span>${h(p.start)}</span><span>${h(p.end)}</span></div>`).join('')}</div>${resources.map(r=>resourceHtml(r,periods)).join('')}`;renderCurrentTimeLine(periods);document.querySelectorAll('.bar').forEach(b=>b.onclick=(event)=>{event.preventDefault();event.stopPropagation();showDetails(JSON.parse(decodeURIComponent(b.dataset.item)),false)});document.querySelectorAll('.booking-slot').forEach(slot=>slot.onclick=(event)=>{event.preventDefault();event.stopPropagation();const resource=slot.dataset.resource,period=String(slot.dataset.period);const existing=(data.bookings||[]).find(booking=>String(booking.resource)===String(resource)&&periodCodeFallsWithinBooking(period,booking));if(existing){showDetails({type:'booking',item:existing},true);return}openCreateBooking(resource,period)});requestAnimationFrame(()=>scrollDefault(periods))}
function periodCodeFallsWithinBooking(periodCode,booking){const periods=data&&data.periods||[];const clickedIndex=periods.findIndex(p=>String(p.code)===String(periodCode));if(clickedIndex<0)return false;const start=Number.isFinite(Number(booking.startIndex))?Number(booking.startIndex):periods.findIndex(p=>String(p.code)===String(booking.startPeriod));const end=Number.isFinite(Number(booking.endIndex))?Number(booking.endIndex):periods.findIndex(p=>String(p.code)===String(booking.endPeriod));return clickedIndex>=start&&clickedIndex<=end}
function resourceHtml(r,periods){const bs=(data.bookings||[]).filter(b=>b.resource===r.resource),ms=(data.movements||[]).filter(m=>(m.resource||(m.booking&&m.booking.resource))===r.resource);return`<div class="resource-block"><div class="resource-row booking-row"><div class="resource-label"><strong>${h(r.resource)}</strong><span>${h(r.deviceType||'')} · ${h(r.capacity||0)}</span></div><div class="row-name">Booking</div>${periods.map(p=>`<button type="button" class="slot booking-slot" data-resource="${h(r.resource)}" data-period="${h(p.code)}" aria-label="Add booking for ${h(r.resource)}, period ${h(p.code)}" title="Add booking"></button>`).join('')}<div class="bar-layer">${bs.map(bookingBarHtml).join('')}</div></div><div class="resource-row movement-row"><div class="row-name">Movement</div>${periods.map(()=>'<div class="slot"></div>').join('')}<div class="bar-layer">${ms.map(m=>movementBar(m,periods)).join('')}</div></div></div>`}

function bookingAccessories(b){const out=[];if(b&&((b.headphones===true)||String(b.headphones).toLowerCase()==='yes'||String(b.headphones).toLowerCase()==='true'))out.push('HEADPHONES');if(b&&((b.styluses===true)||String(b.styluses).toLowerCase()==='yes'||String(b.styluses).toLowerCase()==='true'))out.push('STYLUSES');return out}
function bookingBarHtml(b){const acc=bookingAccessories(b),width=(b.endIndex-b.startIndex+1)*62-8,left=b.startIndex*62+4,label=`${b.teacher||b.bookedFor||''} · ${b.requestedQuantity||0}`,badge=acc.length?`<span class="accessory-flag">${acc.map(x=>x==='HEADPHONES'?'HP':'ST').join(' + ')}</span>`:'';return`<div class="bar booking ${acc.length?'accessory-booking':''}" style="left:${left}px;width:${width}px" data-item="${encodeURIComponent(JSON.stringify({type:'booking',item:b}))}" title="${h(label+(acc.length?' · PREPARE '+acc.join(' + '):''))}"><span class="booking-label">${h(label)}</span>${badge}</div>`}
function bookingAccessoryBanner(b){const acc=bookingAccessories(b);return acc.length?`<div class="accessory-banner"><strong>PREPARATION REQUIRED</strong><span>${acc.map(h).join(' · ')}</span></div>`:''}

function barHtml(cls,start,end,item,label){const width=(end-start+1)*62-8,left=start*62+4;return`<div class="bar ${cls}" style="left:${left}px;width:${width}px" data-item="${encodeURIComponent(JSON.stringify({type:cls,item}))}" title="${h(label)}">${h(label)}</div>`}
function movementBar(m,periods){const b=m.booking;if(!b)return'';const state=movementState(m),actualStart=timeToPeriodIndex(m.loanMs,periods),start=Math.max(0,Number.isFinite(actualStart)?actualStart:b.startIndex),end=m.isOpen?Math.max(start,currentPeriodIndex(periods)):Math.max(start,timeToPeriodIndex(m.returnMs,periods));return barHtml(`${state} ${m.isOpen?'open':''}`,start,Math.min(periods.length-1,end),m,`${m.collector} · ${m.deviceTotal}`)}
function movementState(m){if(!m.isOpen)return'returned';if(!m.expectedEndMs)return'active';const now=Date.now();if(now<=m.expectedEndMs)return'active';if(now<=m.expectedEndMs+(data.graceMinutes||30)*60000)return'grace';return'overdue'}
function restoreSelected(){if(!selected)return;const prior=selected;const bookingId=(prior.item.booking||prior.item).bookingId;if(prior.type==='booking'){const found=(data.bookings||[]).find(b=>b.bookingId===bookingId);if(found)showDetails({type:'booking',item:found},true);return}const sessionId=prior.item.sessionId;const movement=(data.movements||[]).find(m=>m.sessionId===sessionId);if(movement)showDetails({type:prior.type,item:movement},true)}
function countMovementPhotos(items){let count=0;(items||[]).forEach(x=>{if(x.loanPhotoFileId||x.loanPhotoUrl)count++;if(x.returnPhotoFileId||x.returnPhotoUrl)count++});return count}
function driveThumbnail(fileId,url){if(fileId)return`https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200`;return url||''}
function photoTimestampLabel(value){if(!value)return'';const ms=Number(value);const date=Number.isFinite(ms)&&ms>0?new Date(ms):new Date(value);if(!isNaN(date.getTime()))return new Intl.DateTimeFormat('en-SG',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);return String(value)}
function closePhotoViewer(){const modal=$('photoViewerModal');if(modal)closeManagedDialog(modal)}
function renderCurrentTimeLine(periods){if(els.date.value!==today()||!periods.length)return;const now=new Date(),minutes=now.getHours()*60+now.getMinutes();const first=toMin(periods[0].start),last=toMin(periods[periods.length-1].end);if(minutes<first||minutes>last)return;let offset=0;for(let i=0;i<periods.length;i++){const start=toMin(periods[i].start),end=toMin(periods[i].end);if(minutes>=start&&minutes<=end){offset=i*62+((minutes-start)/Math.max(1,end-start))*62;break}}const line=document.createElement('div');line.className='current-time-line';line.style.left=`calc(var(--label) + var(--rowlabel) + ${offset}px)`;line.innerHTML='<span>Now</span>';els.timeline.appendChild(line)}
async function loadReference(current=false){
  if(current){
    try{const p=await apiJsonV1(API.reference+'?latest=1',{}, {retries:0});reference=p.data;v11WriteLocalCache(V1_REFERENCE_CACHE_KEY,reference);return reference;}
    catch(error){const saved=reference||v11ReadLocalCache(V1_REFERENCE_CACHE_KEY,V1_REFERENCE_STALE_MS)?.data;if(!saved)throw error;return {...saved,referenceReadDelayed:true};}
  }
  if(manualReload)return reference||v1DashboardReferenceFallback();
  const generation=referenceGeneration;
  if(reference)return reference;
  const fresh=v11ReadLocalCache(V1_REFERENCE_CACHE_KEY,V1_REFERENCE_CACHE_MS);
  if(fresh&&fresh.data){reference=fresh.data;setTimeout(()=>refreshReferenceV11().catch(()=>{}),0);return reference}
  try{
    const p=await apiJsonV1(API.reference,{}, {retries:1});
    if(generation!==referenceGeneration)return reference||p.data;
    reference=p.data;
    v11WriteLocalCache(V1_REFERENCE_CACHE_KEY,reference);
    return reference;
  }catch(error){
    if(generation!==referenceGeneration){if(reference)return reference;throw error}
    const stale=v11ReadLocalCache(V1_REFERENCE_CACHE_KEY,V1_REFERENCE_STALE_MS);
    if(stale&&stale.data){reference=stale.data;toast('Reference data refresh delayed. Using the last successful copy.');return reference}
    throw error;
  }
}
async function refreshReferenceV11(){
  if(manualReload || document.hidden)return;
  const generation=referenceGeneration;
  try{
    const p=await apiJsonV1(API.reference,{}, {retries:0});
    if(generation===referenceGeneration&&!manualReload&&p&&p.data){reference=p.data;v11WriteLocalCache(V1_REFERENCE_CACHE_KEY,reference)}
  }catch(error){/* last-good reference remains authoritative for display until live refresh succeeds */}
}
function renderEditor(b,key,ref){closeEditor();const modal=document.createElement('dialog');modal.id='editorModal';modal.className='modal-backdrop';const opts=(arr,val)=>arr.map(x=>`<option ${String(x)===String(val)?'selected':''}>${h(x)}</option>`).join('');const resources=(ref.bookingResources||[]).slice().sort(compareResourcesForDisplay);modal.innerHTML=`<section class="editor-card"><div class="editor-heading"><h2>Edit booking</h2><button id="closeEditor">×</button></div><div class="editor-grid"><label>Teacher<input id="edTeacher" list="teacherList" value="${h(b.teacher)}"><datalist id="teacherList">${(ref.teachers||[]).map(x=>`<option value="${h(x)}">`).join('')}</datalist></label><label>Class or group<input id="edClass" list="classList" value="${h(b.classOrActivity)}"><datalist id="classList">${(ref.classes||[]).map(x=>`<option value="${h(x)}">`).join('')}</datalist></label><label>Subject<input id="edSubject" list="subjectList" value="${h(b.subject)}"><datalist id="subjectList">${(ref.subjects||[]).map(x=>`<option value="${h(x)}">`).join('')}</datalist></label><label>Date<input id="edDate" type="date" value="${h(b.date)}"></label><label>Resource<select id="edResource">${resources.map(x=>`<option value="${h(x.resource)}" ${x.resource===b.resource?'selected':''}>${h(x.resource)} · ${h(x.deviceType)}</option>`).join('')}</select></label><label>Quantity<input id="edQty" type="number" min="1" max="200" value="${h(b.requestedQuantity)}"></label><label>Start period<select id="edStart">${opts((ref.periods||[]).map(x=>x.code),b.startPeriod)}</select></label><label>End period<select id="edEnd">${opts((ref.periods||[]).map(x=>x.code),b.endPeriod)}</select></label></div><div class="editor-checks"><label><input id="edHeadphones" type="checkbox" ${b.headphones?'checked':''}> Headphones</label><label><input id="edStyluses" type="checkbox" ${b.styluses?'checked':''}> Styluses</label></div><label>Other remarks<textarea id="edRemarks">${h(b.remarks||'')}</textarea></label><label>Administrative reason<input id="edReason" placeholder="Required for audit"></label><div class="editor-actions"><button id="deleteBooking" class="danger">Cancel booking</button><button id="saveBooking" class="primary">Save changes</button></div></section>`;showManagedDialog(modal);$('closeEditor').onclick=closeEditor;modal.onclick=e=>{if(e.target===modal)closeEditor()};$('saveBooking').onclick=()=>saveAdminEdit(b,key,ref);$('deleteBooking').onclick=()=>adminCancel(b,key);bindSharedBookingFields(ref,'ed',b);const card=modal.querySelector('.editor-card');card.insertAdjacentHTML('beforeend',LordReference.statusHtml(ref));modal.referenceData=ref;}
const overlordPendingIds=new Map();
function canonicalOverlordWrite(value){if(Array.isArray(value))return value.map(canonicalOverlordWrite);if(!value||typeof value!=='object')return value;const out={};Object.keys(value).sort().forEach(k=>{if(k!=='clientRequestId')out[k]=canonicalOverlordWrite(value[k]);});return out;}
async function overlordRequestKey(body){
  const input=JSON.stringify([overlordSession&&overlordSession.email||'',canonicalOverlordWrite(body)]);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
  return 'overlord:req:v1.4:'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
}
async function stableOverlordRequestId(body,key){
  let id=overlordPendingIds.get(key);
  try{const saved=JSON.parse(sessionStorage.getItem(key)||'null');if(saved&&Date.now()-saved.at<24*60*60*1000)id=saved.id;}catch{}
  if(!id)id=body.clientRequestId||crypto.randomUUID();
  overlordPendingIds.set(key,id);
  try{sessionStorage.setItem(key,JSON.stringify({id,at:Date.now()}));}catch{}
  body.clientRequestId=id;return id;
}
async function post(body){
  const key=await overlordRequestKey(body);
  await stableOverlordRequestId(body,key);
  try{
    const p=await apiJsonV1(API.transaction,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},{retries:0});
    overlordPendingIds.delete(key);try{sessionStorage.removeItem(key);}catch{}
    if(p.result&&p.result.maintenanceWarnings)toast(p.result.maintenanceWarnings.join(' '));
    return p.result||p;
  }catch(error){
    if(!error.retryable){overlordPendingIds.delete(key);try{sessionStorage.removeItem(key);}catch{}}
    throw error;
  }
}

function bindSharedBookingFields(ref, prefix, saved){
  if(!LordReference.enabled(ref))return;
  for(const [type,suffix,property,label] of [['teacher','Teacher','teacher',saved?'Teacher':'Book for'],['class','Class','classOrActivity','Class, teaching group or activity'],['subject','Subject','subject','Subject']]){
    const old=$(prefix+suffix);if(!old)continue;
    const entry=LordReference.read(prefix+suffix);
    const selected=old.tagName==='SELECT'||old.dataset.referenceValue!==undefined?entry.value:'';
    const custom=entry.custom;
    const wrap=old.closest('label');
    wrap.innerHTML=LordReference.field(prefix+suffix,label,ref,type,{value:selected,custom,text:old.value,saved:saved&&saved[property],self:type==='teacher'&&!saved,bare:true});
    LordReference.bindField(prefix+suffix,type);
  }
}
function sharedBookingPayload(ref,prefix,saved){
  if(!LordReference.enabled(ref))return {};
  const classEntry=LordReference.read(prefix+'Class'),subjectEntry=LordReference.read(prefix+'Subject');
  return LordReference.payload(ref,{teacher:$(prefix+'Teacher').value,class:classEntry.value,subject:subjectEntry.value},saved,{class:classEntry.custom,subject:subjectEntry.custom});
}
function showReferenceRetry(error,ref,prefix,saved,onRefresh){
  if(!LordReference.isReferenceError(error))return;
  const modal=$('editorModal');if(!modal)return;
  let status=modal.querySelector('.shared-reference-status');
  if(!status){status=document.createElement('p');status.className='help shared-reference-status';modal.querySelector('.editor-card').appendChild(status);}
  status.textContent=error.message+' ';
  const button=document.createElement('button');button.type='button';button.textContent='Reload shared choices';
  button.onclick=async()=>{button.disabled=true;try{const current=await loadReference(true);bindSharedBookingFields(current,prefix,saved);onRefresh(current);status.textContent=LordReference.status(current)+'. Review your choices before saving.';}catch(failure){status.textContent=failure.message;status.appendChild(button);button.disabled=false;}};
  status.appendChild(button);
}
function closeEditor(){const m=$('editorModal');if(m)closeManagedDialog(m)}

async function openCreateBooking(resourceName, periodCode){
  try{
    const ref=await loadReference(true);
    renderCreateBooking(resourceName,periodCode,ref);
  }catch(e){toast(e.message)}
}
function renderCreateBooking(resourceName,periodCode,ref){
  closeEditor();
  const resource=(ref.bookingResources||[]).find(x=>String(x.resource)===String(resourceName))||{};
  const periods=ref.periods||[];
  const teachers=ref.teachers||[];
  const modal=document.createElement('dialog');
  modal.id='editorModal';
  modal.className='modal-backdrop';
  const periodOptions=periods.map(x=>`<option value="${h(x.code)}" ${String(x.code)===String(periodCode)?'selected':''}>P${h(x.code)} · ${h(x.start)}–${h(x.end)}</option>`).join('');
  modal.innerHTML=`<section class="editor-card create-booking-card"><div class="editor-heading"><div><span class="editor-kicker">ADMIN BOOKING</span><h2>Add booking</h2></div><button id="closeEditor" aria-label="Close">×</button></div><div class="editor-grid"><label>Book for<input id="newTeacher" list="newTeacherList" value="${h(overlordSession&&overlordSession.ttbName||'')}"><datalist id="newTeacherList">${teachers.map(x=>`<option value="${h(x)}">`).join('')}</datalist></label><label>Class or student group<input id="newClass" list="newClassList"><datalist id="newClassList">${(ref.classes||[]).map(x=>`<option value="${h(x)}">`).join('')}</datalist></label><label>Subject or student activity<input id="newSubject" list="newSubjectList"><datalist id="newSubjectList">${(ref.subjects||[]).map(x=>`<option value="${h(x)}">`).join('')}</datalist></label><label>Date<input id="newDate" type="date" value="${h(els.date.value)}"></label><label>Resource<select id="newResource">${(ref.bookingResources||[]).slice().sort(compareResourcesForDisplay).map(x=>`<option value="${h(x.resource)}" ${String(x.resource)===String(resourceName)?'selected':''}>${h(x.resource)} · ${h(x.deviceType)}</option>`).join('')}</select></label><label>Quantity<input id="newQty" type="number" min="1" max="200" value="${h(resource.capacity||1)}"></label><label>Start period<select id="newStart">${periodOptions}</select></label><label>End period<select id="newEnd">${periodOptions}</select></label></div><div class="editor-checks"><label><input id="newHeadphones" type="checkbox"> Headphones</label><label><input id="newStyluses" type="checkbox"> Styluses</label></div><label>Other remarks<textarea id="newRemarks"></textarea></label><label>Administrative reason<input id="newReason" placeholder="Required for audit"></label><div class="editor-actions"><button id="cancelCreate" class="ghost">Cancel</button><button id="createBooking" class="primary">Create booking</button></div><p class="editor-note">OVERLORD creates bookings only. Actual collection and return movements must be recorded by device users through LORD.</p></section>`;
  showManagedDialog(modal);
  $('closeEditor').onclick=closeEditor;
  $('cancelCreate').onclick=closeEditor;
  modal.onclick=e=>{if(e.target===modal)closeEditor()};
  $('newResource').onchange=function(){const r=(ref.bookingResources||[]).find(x=>x.resource===this.value);if(r)$('newQty').value=r.capacity||1};
  bindSharedBookingFields(ref,'new');
  modal.querySelector('.editor-card').insertAdjacentHTML('beforeend',LordReference.statusHtml(ref));
  modal.referenceData=ref;
  $('createBooking').onclick=()=>createAdminBooking(modal.referenceData);
}
async function createAdminBooking(ref){
  const modal=$('editorModal');
  if(!modal||modal.querySelector('.is-busy'))return;
  const teacher=$('newTeacher').value.trim(),classOrActivity=$('newClass').value.trim(),subject=$('newSubject').value.trim(),date=$('newDate').value,resourceName=$('newResource').value,start=$('newStart').value,end=$('newEnd').value,reason=$('newReason').value.trim();
  if((!teacher&&!LordReference.enabled(ref))||!classOrActivity||!subject||!date||!resourceName||!start||!end)return toast('Complete all required booking fields.');
  if(!reason)return toast('Enter an administrative reason.');
  const resource=(ref.bookingResources||[]).find(x=>x.resource===resourceName)||{};
  try{
    const refs=sharedBookingPayload(ref,'new');
    setEditorBusy(true,'Creating booking…');
    await post({action:'bookingCreate',bookingForTtbName:teacher,teacher:overlordSession.ttbName,classOrActivity,subject,date,resource:resourceName,deviceType:resource.deviceType||'',requestedQuantity:Number($('newQty').value),startPeriod:start,endPeriod:end,headphones:$('newHeadphones').checked,styluses:Boolean(resource.stylusOption&&$('newStyluses').checked),remarks:$('newRemarks').value,overrideReason:reason,editBaseUrl:location.origin+'/',...refs});
    closeManagedDialog(modal);await refresh({afterWrite:true});toast('Booking created.');
  }catch(e){toast(e.message);if(modal.isConnected&&$('editorModal')===modal){setEditorBusy(false);showReferenceRetry(e,ref,'new',null,current=>modal.referenceData=current);}}
}

function currentPeriodIndex(periods){const now=new Date(),mins=now.getHours()*60+now.getMinutes();let idx=0;periods.forEach((p,i)=>{if(toMin(p.start)<=mins)idx=i});return idx}function timeToPeriodIndex(ms,periods){const d=new Date(ms),mins=d.getHours()*60+d.getMinutes();let idx=0;periods.forEach((p,i)=>{if(toMin(p.start)<=mins)idx=i});return idx}function scrollDefault(periods){if(initialTimelinePositioned||!periods.length)return;initialTimelinePositioned=true;let targetIndex=periods.findIndex(function(p){return p.start>='07:00'});if(els.date.value===today()){const now=new Date(),mins=now.getHours()*60+now.getMinutes();for(let i=0;i<periods.length;i++){if(mins>=toMin(periods[i].start)&&mins<=toMin(periods[i].end)){targetIndex=i;break}}}if(targetIndex<0)targetIndex=0;const periodWidth=62,visibleWidth=els.viewport.clientWidth||0,fixedWidth=228;const targetCenter=fixedWidth+(targetIndex+.5)*periodWidth;els.viewport.scrollLeft=Math.max(0,targetCenter-visibleWidth/2)}function toMin(s){const[a,b]=String(s).split(':').map(Number);return a*60+b}function today(){const d=new Date(),z=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`}function h(v){return String(v==null?'':v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}function toast(s){els.toast.textContent=s;els.toast.classList.remove('hidden');setTimeout(()=>els.toast.classList.add('hidden'),5000)}

/* OVERLORD v0.2 authenticated administrator flow */
let overlordSession = null;
const overlordAuthState={signInInFlight:false,googleLibraryPromise:null};

async function overlordAuthJson(path,options){
  const opts=options||{cache:'no-store'};
  const method=String(opts.method||'GET').toUpperCase();
  return apiJsonV1(path,opts,{retries:method==='GET'?1:0});
}
function loadOverlordGoogleLibrary(){
  if(window.google&&google.accounts&&google.accounts.id)return Promise.resolve();
  if(overlordAuthState.googleLibraryPromise)return overlordAuthState.googleLibraryPromise;
  overlordAuthState.googleLibraryPromise=new Promise((resolve,reject)=>{
    if(window.google&&google.accounts&&google.accounts.id)return resolve();
    let s=document.querySelector('script[data-overlord-gsi]');
    if(s){s.addEventListener('load',resolve,{once:true});s.addEventListener('error',()=>reject(new Error('Google sign in could not be loaded.')),{once:true});return}
    s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.dataset.overlordGsi='true';s.onload=resolve;s.onerror=()=>reject(new Error('Google sign in could not be loaded.'));document.head.appendChild(s)
  }).catch(error=>{overlordAuthState.googleLibraryPromise=null;throw error});
  return overlordAuthState.googleLibraryPromise;
}
function showOverlordServiceUnavailable(error){
  document.body.innerHTML=`<main class="auth-shell"><section class="auth-panel"><img src="assets/gsps-wordmark.webp" alt="Gongshang Primary School"><h1>OVERLORD</h1><p>OVERLORD could not reach its live service after automatic retries.</p><div id="authMessage">${h(error&&error.message||'Service temporarily unavailable.')}</div><button id="retryOverlord" class="primary" type="button">Retry</button></section></main>`;
  const retry=document.getElementById('retryOverlord');if(retry)retry.onclick=()=>location.reload();
}
async function bootOverlord(){
  try{
    // Fast path: check the HttpOnly OVERLORD session before loading Google Identity Services.
    const p=await overlordAuthJson('/api/auth/session');
    if(!p.authenticated){showOverlordAuth();return}
    overlordSession=p.session;
    const subtitle=document.querySelector('.subtitle');if(subtitle)subtitle.textContent=`${subtitle.textContent} · ${overlordSession.ttbName}`;
    els.date.value=today();
    els.refresh.onclick=refresh;
    $('systemSettingsBtn').disabled=false;
    $('systemSettingsBtn').onclick=openSystemSettings;
    const reignBtn=$('reignBtn');if(reignBtn)reignBtn.onclick=openReign;
    els.edit.onclick=()=>{if(selected&&selected.type==='booking'&&selected.item.bookingId)openAdminEditor(selected.item)};
    els.date.onchange=()=>{data=null;initialTimelinePositioned=false;refresh()};
    setInterval(()=>{if(document.hidden || dashboardInFlight || manualReload)return;remaining--;if(remaining<=0){remaining=REFRESH;refresh()}els.count.textContent=`Refresh in ${remaining}s`},1000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){remaining=REFRESH;refresh();}});
    const cached=v11ReadLocalCache(v11DashboardCacheKey(els.date.value),V11_DASHBOARD_STALE_MS);
    if(cached&&cached.data){
      data=cached.data;
      render();
      setScheduleLoading(false);
      els.last.textContent=`Saved schedule from ${new Date(cached.savedAt).toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit'})} · refreshing live`;
    }
    // Do not block entry on a fresh dashboard read if a last-good view exists.
    refresh();
    // Editor reference lists load on demand. A second backend request during
    // startup competes with the schedule that the administrator is waiting for.
  }catch(e){showOverlordServiceUnavailable(e)}
}

/* v1 booking editor implementation is installed later after UI helpers load. */


/* The original file starts refresh immediately. Authentication now owns startup. */


/* RC1.7 Monday-first calendar picker. Native date pickers follow device locale,
   so LORD and OVERLORD use this controlled picker for consistent Monday-first display. */
(function(){
  var activeCalendar = null;
  function pad(n){ return String(n).padStart(2,'0'); }
  function isoDate(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function parseIso(value){
    var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    return m ? new Date(Number(m[1]),Number(m[2])-1,Number(m[3])) : new Date();
  }
  function closeMondayCalendar(){
    if(activeCalendar){ activeCalendar.remove(); activeCalendar=null; }
  }
  function openMondayCalendar(input){
    closeMondayCalendar();
    var selected=parseIso(input.value);
    var view=new Date(selected.getFullYear(),selected.getMonth(),1);
    var panel=document.createElement('div');
    panel.className='monday-calendar-popup';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label','Choose date');
    document.body.appendChild(panel);
    activeCalendar=panel;
    function render(){
      var year=view.getFullYear(), month=view.getMonth();
      var first=new Date(year,month,1);
      var mondayOffset=(first.getDay()+6)%7;
      var gridStart=new Date(year,month,1-mondayOffset);
      var monthName=new Intl.DateTimeFormat('en-SG',{month:'long',year:'numeric'}).format(view);
      var days=['Mo','Tu','We','Th','Fr','Sa','Su'];
      var cells='';
      for(var i=0;i<42;i++){
        var d=new Date(gridStart.getFullYear(),gridStart.getMonth(),gridStart.getDate()+i);
        var other=d.getMonth()!==month;
        var selectedClass=isoDate(d)===input.value?' selected':'';
        var todayClass=isoDate(d)===isoDate(new Date())?' today':'';
        cells+='<button type="button" class="monday-calendar-day'+(other?' other-month':'')+selectedClass+todayClass+'" data-date="'+isoDate(d)+'">'+d.getDate()+'</button>';
      }
      panel.innerHTML='<div class="monday-calendar-head"><button type="button" data-cal-nav="prev" aria-label="Previous month">‹</button><strong>'+monthName+'</strong><button type="button" data-cal-nav="next" aria-label="Next month">›</button></div><div class="monday-calendar-weekdays">'+days.map(function(x){return '<span>'+x+'</span>';}).join('')+'</div><div class="monday-calendar-grid">'+cells+'</div><div class="monday-calendar-foot"><button type="button" data-cal-action="today">Today</button><button type="button" data-cal-action="clear">Clear</button></div>';
      panel.querySelector('[data-cal-nav="prev"]').onclick=function(e){e.stopPropagation();view=new Date(year,month-1,1);render();position();};
      panel.querySelector('[data-cal-nav="next"]').onclick=function(e){e.stopPropagation();view=new Date(year,month+1,1);render();position();};
      panel.querySelectorAll('.monday-calendar-day').forEach(function(btn){btn.onclick=function(e){e.stopPropagation();input.value=btn.dataset.date;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));closeMondayCalendar();};});
      panel.querySelector('[data-cal-action="today"]').onclick=function(e){e.stopPropagation();input.value=isoDate(new Date());input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));closeMondayCalendar();};
      panel.querySelector('[data-cal-action="clear"]').onclick=function(e){e.stopPropagation();input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));closeMondayCalendar();};
    }
    function position(){
      var r=input.getBoundingClientRect();
      var width=Math.min(320,window.innerWidth-20);
      panel.style.width=width+'px';
      var left=Math.max(10,Math.min(r.left,window.innerWidth-width-10));
      var top=r.bottom+8;
      if(top+panel.offsetHeight>window.innerHeight-10) top=Math.max(10,r.top-panel.offsetHeight-8);
      panel.style.left=left+'px';panel.style.top=top+'px';
    }
    render();position();
  }
  document.addEventListener('pointerdown',function(e){
    var input=e.target.closest&&e.target.closest('input[data-monday-picker]');
    if(input){e.preventDefault();openMondayCalendar(input);return;}
    if(activeCalendar&&!activeCalendar.contains(e.target)) closeMondayCalendar();
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeMondayCalendar();});
  window.addEventListener('resize',closeMondayCalendar);
  window.addEventListener('scroll',closeMondayCalendar,true);
})();


/* v1 authentication alignment, return issue visibility and resilient operation feedback */
let actionRequiredMode='default';
function boolish(value){return value===true||value===1||String(value||'').trim().toLowerCase()==='true'||String(value||'').trim().toLowerCase()==='yes'||String(value||'').trim()==='1'}
function movementHasReturnIssue(movement){
  if(!movement)return false;
  const status=String(movement.status||movement.movementStatus||'').trim().toUpperCase();
  if(/^RETURNED WITH ISSUES?$/.test(status))return true;
  if(boolish(movement.returnIssue)||boolish(movement.issue)||boolish(movement.returnedWithIssues)||boolish(movement.hasReturnIssue))return true;
  return (movement.trolleyPhotos||movement.trolleys||[]).some(item=>boolish(item.returnIssue)||boolish(item.issue)||boolish(item.returnedWithIssues)||boolish(item.hasReturnIssue));
}
function returnsWithIssues(){return (data&&data.movements||[]).filter(movementHasReturnIssue)}
function setOperationBusy(active,message){
  let overlay=$('operationOverlay');
  if(active){
    if(!overlay){overlay=document.createElement('div');overlay.id='operationOverlay';overlay.className='operation-overlay';overlay.innerHTML='<div class="operation-card"><span class="operation-spinner" aria-hidden="true"></span><span id="operationMessage"></span></div>';document.body.appendChild(overlay)}
    $('operationMessage').textContent=message||'Working…';
  }else if(overlay)overlay.remove();
}
function setEditorBusy(active,message){
  const card=document.querySelector('#editorModal .editor-card');
  if(!card)return;
  card.classList.toggle('is-busy',active);
  card.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=active);
  let status=$('editorStatus');
  if(!status){status=document.createElement('div');status.id='editorStatus';status.className='editor-status';card.appendChild(status)}
  status.textContent=message||'';
}

/* v1 movement loan/return comments visibility */
function movementOperationalComments(movement){
  const clean=value=>{
    if(value===null||value===undefined)return'';
    const text=String(value).trim();
    return /^(null|undefined|none|nil|n\/a)$/i.test(text)?'':text;
  };
  const first=(...values)=>{
    for(const value of values){const text=clean(value);if(text)return text}
    return'';
  };
  const session=movement&&movement.session&&typeof movement.session==='object'?movement.session:{};
  return{
    loan:first(movement&&movement.loanComments,movement&&movement.loanComment,movement&&movement.collectionComments,movement&&movement.collectComments,session.loanComments,session.loanComment),
    returned:first(movement&&movement.returnComments,movement&&movement.returnComment,movement&&movement.returnNotes,movement&&movement.returnRemarks,session.returnComments,session.returnComment,session.returnNotes)
  };
}

/* v1 operational comments final placement patch */
function findMovementCommentByMeaning(movement, kind){
  if(!movement||typeof movement!=='object')return'';
  const wanted=kind==='loan'?'loan':'return';
  const values=[];
  const seen=new Set();
  const add=value=>{
    if(value===null||value===undefined||typeof value==='object'||typeof value==='boolean')return;
    const text=String(value).trim();
    if(!text||/^(null|undefined|none|nil|n\/a)$/i.test(text))return;
    const key=text.toLowerCase();
    if(!seen.has(key)){seen.add(key);values.push(text)}
  };
  const walk=(obj,path=[],depth=0)=>{
    if(!obj||typeof obj!=='object'||depth>5)return;
    if(Array.isArray(obj)){obj.forEach(v=>walk(v,path,depth+1));return}
    Object.entries(obj).forEach(([key,value])=>{
      const joined=path.concat(key).join(' ').toLowerCase();
      const isComment=/(comment|comments|remark|remarks|note|notes)/.test(joined);
      const isLoan=/(loan|collect|collection|checkout|sign.?out)/.test(joined);
      const isReturn=/(return|returned|checkin|sign.?in)/.test(joined);
      if(typeof value!=='object'&&isComment&&((wanted==='loan'&&isLoan&&!isReturn)||(wanted==='return'&&isReturn))){add(value)}
      else if(value&&typeof value==='object')walk(value,path.concat(key),depth+1);
    });
  };
  walk(movement);
  return values.join('\n');
}

const rc18OriginalMovementOperationalComments=movementOperationalComments;
movementOperationalComments=function(movement){
  const base=rc18OriginalMovementOperationalComments(movement);
  return{
    loan:base.loan||findMovementCommentByMeaning(movement,'loan'),
    returned:base.returned||findMovementCommentByMeaning(movement,'return')
  };
};

/* v1 canonical movement notes rendering and de-duplication */
function rc19NormaliseLines(value){
  if(value===null||value===undefined)return[];
  const raw=String(value).replace(/\r\n?/g,'\n');
  const output=[],seen=new Set();
  raw.split('\n').forEach(line=>{
    const text=line.trim();
    if(!text||/^(null|undefined|none|nil|n\/a)$/i.test(text))return;
    const key=text.toLowerCase().replace(/\s+/g,' ');
    if(!seen.has(key)){seen.add(key);output.push(text)}
  });
  return output;
}
function rc19UniqueText(values){
  const output=[],seen=new Set();
  (values||[]).forEach(value=>rc19NormaliseLines(value).forEach(line=>{
    const key=line.toLowerCase().replace(/\s+/g,' ');
    if(!seen.has(key)){seen.add(key);output.push(line)}
  }));
  return output.join('\n');
}
function rc19MovementComments(movement){
  const session=movement&&movement.session&&typeof movement.session==='object'?movement.session:{};
  return{
    loan:rc19UniqueText([movement&&movement.loanComments,movement&&movement.loanComment,session.loanComments]),
    returned:rc19UniqueText([movement&&movement.returnComments,movement&&movement.returnComment,session.returnComments])
  };
}
function rc19ExplicitIssueDetails(movement){
  if(!movement)return'';
  const values=[];
  // v1 backend supplies this as already de-duplicated explicit issue text.
  values.push(movement.returnIssueDetails,movement.returnIssueNotes,movement.returnIssueDescription);
  (movement.trolleyPhotos||movement.trolleys||movement.sessionTrolleys||[]).forEach(item=>{
    if(!item||typeof item!=='object')return;
    values.push(item.returnNotes,item.returnIssueDetails,item.returnIssueNotes);
  });
  const returnComment=rc19MovementComments(movement).returned.toLowerCase().replace(/\s+/g,' ').trim();
  const lines=rc19UniqueText(values).split('\n').filter(Boolean);
  const output=[],seen=new Set();
  lines.forEach(line=>{
    // Strip legacy "Trolley name: " prefixes for semantic duplicate matching.
    const semantic=line.replace(/^[^:]{1,80}:\s*/, '').trim();
    const key=semantic.toLowerCase().replace(/\s+/g,' ');
    if(!key||key===returnComment||seen.has(key))return;
    seen.add(key);output.push(semantic);
  });
  return output.join('\n');
}
function rc19DeclarationSummary(movement){
  const supplied=rc19UniqueText([movement&&movement.returnDeclarationIssues,movement&&movement.declarationIssueSummary]);
  if(supplied)return supplied;
  const failed=[];
  (movement&&movement.trolleyPhotos||[]).forEach(item=>{
    if(!item||typeof item!=='object')return;
    if(item.stylusDeclaration===false)failed.push('Stylus declaration not confirmed');
    if(item.correctTrolleyDeclaration===false)failed.push('Correct-trolley declaration not confirmed');
    if(item.sameOrientationDeclaration===false)failed.push('Same-orientation declaration not confirmed');
  });
  return rc19UniqueText(failed);
}
function rc19IssueText(movement){
  return rc19ExplicitIssueDetails(movement)||rc19DeclarationSummary(movement)||'An issue was recorded, but no issue description was supplied.';
}
function rc19CommentCards(movement,extraClass=''){
  const comments=rc19MovementComments(movement),cards=[];
  if(comments.loan)cards.push(`<section class="movement-comment loan-comment ${h(extraClass)}"><strong>LOAN COMMENTS</strong><p>${h(comments.loan)}</p></section>`);
  if(comments.returned)cards.push(`<section class="movement-comment return-comment ${h(extraClass)}"><strong>RETURN COMMENTS</strong><p>${h(comments.returned)}</p></section>`);
  return cards.join('');
}
function rc19IssueBanner(movement,extraClass=''){
  if(!movementHasReturnIssue(movement))return'';
  return `<section class="return-issue-banner ${h(extraClass)}"><strong>RETURNED WITH ISSUES</strong><p>${h(rc19IssueText(movement))}</p></section>`;
}
function rc19ActionComments(movement){
  const comments=rc19MovementComments(movement),parts=[];
  if(comments.loan)parts.push(`<span class="action-comment action-loan-comment"><b>Loan:</b> ${h(comments.loan)}</span>`);
  if(comments.returned)parts.push(`<span class="action-comment action-return-comment"><b>Return:</b> ${h(comments.returned)}</span>`);
  return parts.join('');
}

function rc24AccessorySummaryHtml(movement){
  const evidence=movement&&movement.accessoryEvidence||{};
  const rows=[];
  [['Styluses','styluses'],['Headphones','headphones']].forEach(([label,key])=>{
    const item=evidence[key];
    if(!item||!item.booked)return;
    const returned=movement.returnTimestamp?`${Number(item.returnQuantity)||0} returned${item.bagReturned===false?' · bag not confirmed':''}`:'Not returned';
    rows.push(`<div class="accessory-audit-row"><strong>${h(label)}</strong><span>${Number(item.loanQuantity)||0} collected · ${h(returned)}</span></div>`);
  });
  return rows.length?`<section class="accessory-audit-summary"><strong>ACCESSORIES</strong>${rows.join('')}</section>`:'';
}
function rc24AccessoryPhotoCards(movement){
  const evidence=movement&&movement.accessoryEvidence||{};
  const cards=[];
  [['Stylus bag','styluses'],['Headphone bag','headphones']].forEach(([label,key])=>{
    const item=evidence[key];
    if(!item||!item.booked)return;
    const loan=driveThumbnail(item.loanPhotoFileId,item.loanPhotoUrl);
    const returned=driveThumbnail(item.returnPhotoFileId,item.returnPhotoUrl);
    cards.push(`<article class="photo-trolley-card accessory-photo-card"><h3>${h(label)}</h3><div class="photo-pair"><figure><figcaption>Collection · ${Number(item.loanQuantity)||0}</figcaption>${loan?`<a href="${h(item.loanPhotoUrl||loan)}" target="_blank" rel="noopener"><img src="${h(loan)}" alt="Collection photo for ${h(label)}"></a>`:'<div class="photo-missing">No collection photo</div>'}</figure><figure><figcaption>Return · ${Number(item.returnQuantity)||0}${item.bagReturned===false?' · bag not confirmed':''}</figcaption>${returned?`<a href="${h(item.returnPhotoUrl||returned)}" target="_blank" rel="noopener"><img src="${h(returned)}" alt="Return photo for ${h(label)}"></a>`:'<div class="photo-missing">Not returned or no photo</div>'}</figure></div></article>`);
  });
  return cards.join('');
}

// Keep operational comments, issue text and accessory evidence in one canonical rendering layer.


/* v1 REIGN — guarded logging-period close */
async function openReign(){
  if($('reignModal'))return;
  const modal=document.createElement('dialog');modal.className='modal-backdrop';modal.id='reignModal';
  modal.innerHTML=`<section class="editor-card reign-card"><div class="editor-heading"><div><span class="reign-kicker">REIGN</span><h2>Close Logging Period</h2><p>Archive records through today, preserve future bookings and their dependent records, then compact the transactional sheets without altering backend structure.</p></div><button id="closeReign">×</button></div><div id="reignBody"><div class="reign-loading">Reviewing the current logging period…</div></div></section>`;
  showManagedDialog(modal);$('closeReign').onclick=()=>closeManagedDialog(modal);modal.onclick=e=>{if(e.target===modal)closeManagedDialog(modal)};
  try{
    const p=await apiJsonV1(`${API.transaction}?action=reignPreview`,{}, {retries:1});if(modal.open)renderReignPreview(p.data);
  }catch(e){if(modal.open)$('reignBody').innerHTML=`<div class="reign-error">${h(e.message)}</div>`}
}
function renderReignPreview(x){
  const rows=Object.entries(x.rowCounts||{}).map(([k,v])=>`<div><span>${h(k)}</span><strong>${Number(v||0).toLocaleString()}</strong></div>`).join('');
  const st=x.statistics||{},top=st.topBorrower||{},cart=st.mostHardworkingCart||{};
  $('reignBody').innerHTML=`<div class="reign-warning"><strong>REIGN closes only through today.</strong> Archive files are created and verified before eligible rows are cleared. Future and unclassifiable records stay live; reference/config sheets and Photos are untouched.</div><div class="reign-period"><span>Logging period to close</span><strong>${h(x.periodStart||'No data')} → ${h(x.periodEnd||'No data')}</strong><small>Cutoff: ${h(x.cutoffDate||x.periodEnd||'')}</small></div><div class="reign-counts">${rows}</div><div class="reign-preserved"><strong>${Number(x.totalPreservedRows||0).toLocaleString()}</strong> future/unclassifiable rows preserved live</div><div class="reign-preview-stats"><div><span>Bookings</span><strong>${Number(st.bookings||0).toLocaleString()}</strong></div><div><span>Movement sessions</span><strong>${Number(st.movementSessions||0).toLocaleString()}</strong></div><div><span>Most frequent borrower</span><strong>${h(top.name||'—')}</strong></div><div><span>Most hardworking cart</span><strong>${h(cart.name||'—')}</strong></div></div><div class="reign-files"><strong>Files created in the backend Drive folder</strong><code>LORD_Statistics_${h(x.periodStart)}_to_${h(x.periodEnd)}.md</code><code>LORD_Wrapped_${h(x.periodStart)}_to_${h(x.periodEnd)}.html</code><code>LORD_Archive_${h(x.periodStart)}_to_${h(x.periodEnd)}.json</code></div><label class="reign-confirm">Type exactly to confirm<input id="reignConfirmation" autocomplete="off" placeholder="${h(x.confirmationText)}"><small>${h(x.confirmationText)}</small></label><div class="editor-actions"><button class="ghost" id="cancelReign">Cancel</button><button class="danger" id="executeReign" disabled>Archive and close period</button></div><div id="reignStatus" class="editor-status"></div>`;
  $('cancelReign').onclick=()=>{if(!$('reignModal').dataset.busy)closeManagedDialog($('reignModal'));};const input=$('reignConfirmation'),go=$('executeReign');input.oninput=()=>go.disabled=Boolean($('reignModal').dataset.busy)||input.value!==x.confirmationText;go.onclick=()=>executeReign(x.confirmationText);
}
async function executeReign(confirmation){
  const modal=$('reignModal');if(!modal||modal.dataset.busy)return;modal.dataset.busy='true';
  const disabledBefore=Array.from(modal.querySelectorAll('button,input'),el=>[el,el.disabled]);
  disabledBefore.forEach(([el])=>el.disabled=true);
  const go=$('executeReign'),status=$('reignStatus');go.disabled=true;status.textContent='Creating and verifying archive files…';
  try{const result=await post({action:'reignClose',confirmation});status.textContent='Logging period closed.';const links=(result.files||[]).map(f=>`<a href="${h(f.url)}" target="_blank" rel="noopener">${h(f.name)}</a>`).join('');$('reignBody').innerHTML=`<div class="reign-success"><strong>Logging period closed successfully.</strong><span>${h(result.periodStart)} → ${h(result.periodEnd)}</span><div class="reign-output-links">${links}</div><p>Backend structures remain intact. A new REIGN boundary event starts the next logging period.</p><button id="finishReign" class="primary">Done</button></div>`;$('finishReign').onclick=async()=>{closeManagedDialog($('reignModal'));await refresh({afterWrite:true})};}
  catch(e){go.disabled=false;status.textContent='';toast(e.message)}
  finally{delete modal.dataset.busy;disabledBefore.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled;});}
}

function showOverlordAuth(){
  overlordAuthState.signInInFlight=false;
  document.body.innerHTML=`<main class="auth-shell"><section class="auth-panel"><img src="assets/gsps-wordmark.webp" alt="Gongshang Primary School"><h1>OVERLORD</h1><p>Administrator access only</p><div id="googleSignInButton"></div><div id="authMessage"></div></section></main>`;
  Promise.all([overlordAuthJson('/api/auth/config'),loadOverlordGoogleLibrary()]).then(([cfg])=>{
    google.accounts.id.initialize({client_id:cfg.clientId,hd:'gsps.edu.sg',auto_select:false,callback:async response=>{
      if(overlordAuthState.signInInFlight)return;
      overlordAuthState.signInInFlight=true;
      const message=$('authMessage');
      const host=$('googleSignInButton');
      if(host){host.style.pointerEvents='none';host.style.opacity='0.65'}
      message.textContent='Verifying your GSPS administrator account…';
      try{
        const payload=await overlordAuthJson('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:response.credential})});
        overlordSession=payload.session;
        message.textContent='Signed in. Opening OVERLORD…';
        location.reload();
      }catch(error){
        overlordAuthState.signInInFlight=false;
        if(host){host.style.pointerEvents='';host.style.opacity=''}
        message.textContent=error.message;
      }
    }});
    google.accounts.id.renderButton($('googleSignInButton'),{theme:'outline',size:'large',width:320,text:'signin_with',shape:'rectangular'});
  }).catch(error=>{$('authMessage').textContent=error.message});
}

async function openAdminEditor(booking){
  if(els.edit){els.edit.disabled=true;els.edit.textContent='Loading…'}
  setOperationBusy(true,'Loading booking editor…');
  const referencePromise=loadReference(true);
  const bookingPromise=apiJsonV1(`${API.transaction}?action=bookingGet&bookingId=${encodeURIComponent(booking.bookingId)}&admin=true`,{}, {
    retries:1,
    onRetry:({attempt,totalRetries})=>setOperationBusy(true,`Booking service busy · retrying ${attempt}/${totalRetries}…`)
  });
  try{
    const [refResult,bookingResult]=await Promise.allSettled([referencePromise,bookingPromise]);
    const referenceDegraded=refResult.status!=='fulfilled';
    const ref=refResult.status==='fulfilled'?refResult.value:v1DashboardReferenceFallback();
    if(bookingResult.status==='fulfilled'){
      const payload=bookingResult.value;
      v1WriteSessionCache(v1BookingCacheKey(booking.bookingId),payload.booking);
      renderEditor(payload.booking,'',ref);
      if(referenceDegraded)setEditorBusy(false,'Reference lists are temporarily unavailable. Current dashboard resources/periods are loaded; teacher, class and subject remain editable as text.');
      return;
    }
    const cached=v1ReadSessionCache(v1BookingCacheKey(booking.bookingId),2*60*60*1000);
    const fallback=cached||booking;
    if(fallback&&fallback.bookingId){
      renderEditor(fallback,'',ref);
      const note=referenceDegraded
        ? 'Live booking and reference refresh are delayed. Showing dashboard/last-good details; Save will be revalidated by the backend.'
        : 'Live booking refresh is delayed. Showing the last available booking details; Save will be revalidated by the backend.';
      setEditorBusy(false,note);
      toast('Booking service temporarily unavailable. Editor opened with the last available details.');
      return;
    }
    const failure=bookingResult.status==='rejected'?bookingResult.reason:(refResult.status==='rejected'?refResult.reason:null);
    toast(`Booking could not be loaded. ${failure&&failure.message?failure.message:'Please retry.'}`);
  }finally{
    setOperationBusy(false);
    if(els.edit){els.edit.textContent='Edit';els.edit.disabled=!(selected&&selected.type==='booking'&&selected.item.bookingId)}
  }
}

async function saveAdminEdit(b,key,ref){
  const modal=$('editorModal');ref=modal&&modal.referenceData||ref;
  let refs;try{refs=sharedBookingPayload(ref,'ed',b);}catch(error){return toast(error.message);}
  const resource=(ref.bookingResources||[]).find(x=>x.resource===$('edResource').value),reason=$('edReason').value.trim();
  if(!reason)return toast('Enter an administrative reason.');
  setEditorBusy(true,'Saving changes…');const save=$('saveBooking');if(save)save.innerHTML='<span class="button-spinner"></span>Saving…';
  try{await post({action:'bookingUpdate',bookingId:b.bookingId,admin:true,teacher:$('edTeacher').value.trim(),classOrActivity:$('edClass').value.trim(),subject:$('edSubject').value.trim(),date:$('edDate').value,resource:$('edResource').value,deviceType:resource?resource.deviceType:b.deviceType,requestedQuantity:Number($('edQty').value),startPeriod:$('edStart').value,endPeriod:$('edEnd').value,headphones:$('edHeadphones').checked,styluses:$('edStyluses').checked,remarks:$('edRemarks').value,overrideReason:reason,...refs});setEditorBusy(true,'Saved. Refreshing dashboard…');await refresh({afterWrite:true});closeEditor();toast('Booking updated.')}
  catch(error){setEditorBusy(false,'');const button=$('saveBooking');if(button)button.textContent='Save changes';toast(error.message);showReferenceRetry(error,ref,'ed',b,current=>modal.referenceData=current)}
}

async function adminCancel(b,key){
  const reason=$('edReason').value.trim();if(!reason)return toast('Enter an administrative reason.');if(!confirm('Cancel this booking?'))return;
  setEditorBusy(true,'Cancelling booking…');const button=$('deleteBooking');if(button)button.innerHTML='<span class="button-spinner"></span>Cancelling…';
  try{await post({action:'bookingCancel',bookingId:b.bookingId,admin:true,overrideReason:reason});setEditorBusy(true,'Cancelled. Refreshing dashboard…');await refresh({afterWrite:true});closeEditor();toast('Booking cancelled.')}
  catch(error){setEditorBusy(false,'');const retry=$('deleteBooking');if(retry)retry.textContent='Cancel booking';toast(error.message)}
}

function renderExceptions(overdue,prep){
  if(actionRequiredMode==='issues'){showReturnIssuesInActionRequired(false);return}
  const subtitle=$('actionRequiredSubtitle');if(subtitle)subtitle.textContent='Accessory preparation and overdue movements.';
  const prepHtml=(prep||[]).map(b=>`<button class="prep-exception" data-booking-id="${h(b.bookingId||'')}"><span class="prep-kicker">PREPARE ACCESSORIES</span><strong>${h(b.resource||'')} · P${h(b.startPeriod)}–P${h(b.endPeriod)}</strong><span>${h((b.bookedFor||b.teacher||''))} · ${bookingAccessories(b).map(h).join(' + ')}</span></button>`).join('');
  const overdueHtml=(overdue||[]).map(m=>`<button class="exception movement-exception" data-session-id="${h(m.sessionId||'')}"><strong>${h(m.resource)} · ${h(m.collector)}</strong><span>Expected back ${h(m.booking&&m.booking.endTime||'')}. ${Math.floor((Date.now()-m.expectedEndMs)/60000)} minutes overdue.</span>${rc19ActionComments(m)}${m.whatsappLink?`<a href="${h(m.whatsappLink)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">WhatsApp collector</a>`:''}</button>`).join('');
  els.exceptions.innerHTML=prepHtml+overdueHtml||'<div class="empty-state">No accessory preparation or overdue movements.</div>';
  els.exceptions.querySelectorAll('.prep-exception').forEach(btn=>btn.onclick=()=>{const b=(data.bookings||[]).find(x=>String(x.bookingId)===String(btn.dataset.bookingId));if(b)showDetails({type:'booking',item:b},true)});
  els.exceptions.querySelectorAll('.movement-exception').forEach(btn=>btn.onclick=()=>{const m=(data.movements||[]).find(x=>String(x.sessionId)===String(btn.dataset.sessionId));if(m)showDetails({type:movementState(m),item:m},false)});
}

function showReturnIssuesInActionRequired(setMode=true){
  if(setMode)actionRequiredMode='issues';
  const issues=returnsWithIssues();
  const subtitle=$('actionRequiredSubtitle');
  if(subtitle)subtitle.textContent='Completed returns reported with issues for the selected date.';
  els.exceptions.innerHTML=`<div class="action-list-toolbar"><strong>Returns with Issues (${issues.length})</strong><button id="showAllActions" type="button">Back to all actions</button></div>`+(issues.map(m=>`<button class="issue-exception" data-session-id="${h(m.sessionId||'')}"><span class="issue-kicker">RETURNED WITH ISSUES</span><strong>${h(m.resource||(m.booking&&m.booking.resource)||'Unknown resource')} · ${h(m.returnTeacher||'Unknown returner')}</strong><span>${h(m.returnTimestamp||'Return time unavailable')}</span>${rc19ActionComments(m)}<span class="action-issue-detail"><b>Issue:</b> ${h(rc19IssueText(m))}</span></button>`).join('')||'<div class="empty-state">No returns with issues for this date.</div>');
  const back=$('showAllActions');
  if(back)back.onclick=()=>{actionRequiredMode='default';const subtitle=$('actionRequiredSubtitle');if(subtitle)subtitle.textContent='Accessory preparation and overdue movements.';const overdue=(data.movements||[]).filter(x=>movementState(x)==='overdue');const prep=(data.bookings||[]).filter(b=>bookingAccessories(b).length&&String(b.status||'BOOKED').toUpperCase()!=='CANCELLED').sort((a,b)=>(a.startIndex||0)-(b.startIndex||0));renderExceptions(overdue,prep)};
  els.exceptions.querySelectorAll('.issue-exception').forEach(btn=>btn.onclick=()=>{const movement=(data.movements||[]).find(m=>String(m.sessionId)===String(btn.dataset.sessionId));if(movement)showDetails({type:'returned',item:movement},false)});
}

function showDetails(x,suppressPhotoViewer){
  renderBaseDetails(x,true);
  if(x&&x.type!=='booking'){
    const blocks=rc19CommentCards(x.item)+rc19IssueBanner(x.item)+rc24AccessorySummaryHtml(x.item);
    if(blocks)els.details.insertAdjacentHTML('afterbegin',blocks);
    const button=$('viewMovementPhotos');
    if(button){
      const ev=x.item.accessoryEvidence||{};
      let extra=0;
      ['styluses','headphones'].forEach(k=>{const a=ev[k];if(a&&a.booked){if(a.loanPhotoFileId||a.loanPhotoUrl)extra++;if(a.returnPhotoFileId||a.returnPhotoUrl)extra++;}});
      button.textContent=`View photos (${countMovementPhotos(x.item.trolleyPhotos||[])+extra})`;
    }
  }
  if(x&&x.type!=='booking'&&!suppressPhotoViewer)openMovementPhotos(x.item);
}

function renderBaseDetails(x,suppressPhotoViewer){selected=x;const i=x.item,isBooking=x.type==='booking';els.details.classList.remove('empty-state');els.edit.disabled=!isBooking||!i.bookingId;if(isBooking){const bookedFor=i.bookedFor||i.teacher||'';const createdBy=i.createdBy||bookedFor;const onBehalf=createdBy&&bookedFor&&createdBy!==bookedFor;els.details.innerHTML=`${bookingAccessoryBanner(i)}<dl><dt>Type</dt><dd>Booking</dd><dt>Resource</dt><dd>${h(i.resource||'')}</dd><dt>Booked by</dt><dd>${h(createdBy)}</dd>${onBehalf?`<dt>Booked for</dt><dd>${h(bookedFor)}</dd>`:''}<dt>Class/group</dt><dd>${h(i.classOrActivity||'')}</dd><dt>Subject/activity</dt><dd>${h(i.subject||'')}</dd><dt>Date</dt><dd>${h(i.date||data.date||'')}</dd><dt>Periods</dt><dd>P${h(i.startPeriod)} to P${h(i.endPeriod)} · ${h(i.startTime)}–${h(i.endTime)}</dd><dt>Requested</dt><dd>${i.requestedQuantity||0}</dd><dt>Headphones</dt><dd>${i.headphones?`${i.requestedQuantity||0} requested`:'No'}</dd><dt>Styluses</dt><dd>${i.styluses?`${i.requestedQuantity||0} requested`:'No'}</dd><dt>Remarks</dt><dd>${h(i.remarks||'None')}</dd><dt>Status</dt><dd>${h(i.status||'')}</dd><dt>Booking ID</dt><dd>${h(i.bookingId||'')}</dd></dl>`;return}const photoButton=Array.isArray(i.trolleyPhotos)&&i.trolleyPhotos.length?`<button class="photo-button" id="viewMovementPhotos">View photos (${countMovementPhotos(i.trolleyPhotos)})</button>`:'';els.details.innerHTML=`<dl><dt>Type</dt><dd>Actual movement</dd><dt>Resource</dt><dd>${h(i.resource||'')}</dd><dt>Status</dt><dd>${h(i.status||'')}</dd><dt>Collected by</dt><dd>${h(i.collector||'Unknown')}</dd><dt>Collection time</dt><dd>${h(i.loanTimestamp||'')}</dd><dt>Actual out</dt><dd>${i.deviceTotal||0}</dd><dt>Trolleys out</dt><dd>${h((i.trolleyNames||[]).join(', ')||'None recorded')}</dd><dt>Returned by</dt><dd>${h(i.returnTeacher||'Not returned')}</dd><dt>Return time</dt><dd>${h(i.returnTimestamp||'Not returned')}</dd><dt>Returned quantity</dt><dd>${i.returnTimestamp?(i.returnDeviceTotal||0):'Not returned'}</dd><dt>Session ID</dt><dd>${h(i.sessionId||'')}</dd></dl><div class="detail-actions">${photoButton}${i.whatsappLink?`<a class="whatsapp-button" href="${h(i.whatsappLink)}" target="_blank" rel="noopener">WhatsApp collector</a>`:''}</div>`;const photoControl=$('viewMovementPhotos');if(photoControl)photoControl.onclick=()=>openMovementPhotos(i);if(!suppressPhotoViewer)openMovementPhotos(i)}

function openMovementPhotos(movement){
  renderBaseMovementPhotos(movement);
  const gallery=document.querySelector('#photoViewerModal .photo-gallery');
  if(!gallery)return;
  const accessoryCards=rc24AccessoryPhotoCards(movement);
  if(accessoryCards)gallery.insertAdjacentHTML('beforeend',accessoryCards);
  const blocks=rc19IssueBanner(movement,'photo-return-issue')+rc19CommentCards(movement,'photo-movement-comment');
  if(blocks)gallery.insertAdjacentHTML('beforebegin',`<div class="rc19-movement-summary">${blocks}</div>`);
}

function renderBaseMovementPhotos(movement){closePhotoViewer();const items=movement.trolleyPhotos||[];const modal=document.createElement('dialog');modal.id='photoViewerModal';modal.className='modal-backdrop';const cards=[];items.forEach((item,index)=>{const loan=driveThumbnail(item.loanPhotoFileId,item.loanPhotoUrl),returned=driveThumbnail(item.returnPhotoFileId,item.returnPhotoUrl);const loanTime=photoTimestampLabel(item.loanPhotoTimestamp||item.loanTimestamp||movement.loanTimestamp||(movement.loanMs||0)),returnTime=returned?photoTimestampLabel(item.returnPhotoTimestamp||item.returnTimestamp||movement.returnTimestamp||(movement.returnMs||0)):'';cards.push(`<article class="photo-trolley-card"><h3>${h(item.name||`Trolley ${index+1}`)}</h3><div class="photo-pair"><figure><figcaption>Loan out · ${h(item.loanQuantity||0)} devices${loan&&loanTime?` · <span class="photo-time">${h(loanTime)}</span>`:''}</figcaption>${loan?`<a href="${h(item.loanPhotoUrl||loan)}" target="_blank" rel="noopener"><img src="${h(loan)}" alt="Loan out photo for ${h(item.name)}"></a>`:'<div class="photo-missing">No loan photo</div>'}</figure><figure><figcaption>Return · ${h(item.returnQuantity||0)} devices${returnTime?` · <span class="photo-time">${h(returnTime)}</span>`:''}</figcaption>${returned?`<a href="${h(item.returnPhotoUrl||returned)}" target="_blank" rel="noopener"><img src="${h(returned)}" alt="Return photo for ${h(item.name)}"></a>`:'<div class="photo-missing">Not returned or no photo</div>'}</figure></div></article>`)});modal.innerHTML=`<section class="photo-viewer-card"><div class="editor-heading"><div><h2>Movement photos</h2><p>${h((movement.booking&&movement.booking.resource)||movement.resource||'')} · ${h(movement.sessionId||'')}</p></div><button id="closePhotoViewer">×</button></div><div class="photo-gallery">${cards.length?cards.join(''):'<div class="empty-state">No photographs are recorded for this movement.</div>'}</div></section>`;showManagedDialog(modal);$('closePhotoViewer').onclick=closePhotoViewer;modal.onclick=e=>{if(e.target===modal)closePhotoViewer()}}

function render(){
  renderMaintenanceWarning();const m=data.metrics||{};els.open.textContent=m.openLoans||0;els.overdue.textContent=m.overdueLoans||0;els.trolleys.textContent=m.trolleysOut||0;els.devices.textContent=m.devicesOut||0;els.returned.textContent=m.returnedToday||0;els.telegram.textContent=data.telegram&&data.telegram.triggerInstalled?`Telegram active · ${data.telegram.checkEveryMinutes} min`:'Telegram trigger off';const overdue=(data.movements||[]).filter(x=>movementState(x)==='overdue');const prep=(data.bookings||[]).filter(b=>bookingAccessories(b).length&&String(b.status||'BOOKED').toUpperCase()!=='CANCELLED').sort((a,b)=>(a.startIndex||0)-(b.startIndex||0));els.alert.classList.toggle('hidden',!overdue.length);if(overdue.length)els.alert.textContent=`${overdue.length} cart movement${overdue.length===1?'':'s'} more than ${data.graceMinutes} minutes beyond booking end.`;renderTimeline();renderExceptions(overdue,prep);if(selected)restoreSelected()
  const issues=returnsWithIssues();
  const count=$('returnIssuesCount'),metric=$('returnIssuesMetric');
  if(count)count.textContent=issues.length;
  if(metric){metric.classList.toggle('has-issues',issues.length>0);metric.onclick=()=>showReturnIssuesInActionRequired();metric.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showReturnIssuesInActionRequired()}}}
  if(actionRequiredMode==='issues')showReturnIssuesInActionRequired(false);
}

bootOverlord();

// Independent of schedule loading: incident reads cannot block the live board.
let complianceData=null,complianceLoading=false;
async function refreshComplianceIndicator(){
  const button=$('complianceBtn');if(!button||complianceLoading)return;
  button.onclick=openComplianceIncidents;complianceLoading=true;
  try{
    const p=await apiJsonV1(`${API.transaction}?action=complianceIncidents&summary=1`,{}, {retries:0});complianceData=p.data;
    button.innerHTML=`<strong>Logging incidents</strong><span>Collection <b>${h(p.data.collection)}</b></span><span>Return <b>${h(p.data.return)}</b></span><span>Total <b>${h(p.data.total)}</b></span><span>Bookings <b>${h(p.data.affectedBookings)}</b></span>`;
    $('complianceStatus').textContent=p.data.period.label;
  }catch(error){$('complianceStatus').textContent='Incident refresh delayed. Open to retry.';}
  finally{complianceLoading=false;}
}
async function openComplianceIncidents(){
  if($('complianceModal'))return;
  const modal=document.createElement('dialog');modal.id='complianceModal';modal.className='modal-backdrop';
  modal.innerHTML='<section class="editor-card"><div class="editor-heading"><h2>Logging incidents</h2><button type="button" id="closeCompliance" aria-label="Close incident log">×</button></div><div id="complianceBody" role="status">Loading current period…</div></section>';
  showManagedDialog(modal);$('closeCompliance').onclick=()=>closeManagedDialog(modal);
  async function load(){
    try{
      const p=await apiJsonV1(`${API.transaction}?action=complianceIncidents`,{}, {retries:0});if(!modal.open)return;
      complianceData=p.data;const c=p.data;
      $('complianceBody').innerHTML=`<p>${h(c.period.label)}${c.period.startedAt?' · '+h(new Date(c.period.startedAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'})):''}. ${c.total} confirmed omissions across ${c.affectedBookings} bookings. Reviewed incidents remain counted.</p><div class="incident-list">${c.incidents.map(i=>`<article class="incident-row"><strong>${h(i.teacher)} · ${h(i.resource)}</strong><span>${h(i.date)} ${h(i.start)} to ${h(i.end)} · ${h(i.classOrActivity)} · ${h(i.subject)}</span><span>${h(i.phase==='collection'?'Collection photos missing':'Returned by declaration, photos missing')} · ${h(i.status)}</span><small>Recorded ${h(new Date(i.recordedAt).toLocaleString('en-SG',{timeZone:'Asia/Singapore'}))} · ${h(i.collector||i.actor)} · ${h(i.collectedQuantity)} devices collected</small>${i.resolution?`<small>Review: ${h(i.resolution.note)}</small>`:`<form novalidate data-incident="${h(i.incidentId)}"><label>Review note<input type="text" maxlength="500" required aria-label="Review note for ${h(i.teacher)}"></label><button type="submit">Record review</button><span role="status"></span></form>`}</article>`).join('')||'<p>No confirmed logging omissions in this period.</p>'}</div><p>History is retained in the REIGN archive. Silence, late collection and cancellations are not counted as omissions.</p><form id="archivedIncidentReview" novalidate><label>Archived incident ID<input name="incident" required></label><label>Review note<input name="note" maxlength="500" required></label><button type="submit">Record archived review</button><span role="status"></span></form>${(c.historicalReviews||[]).map(r=>`<p>Historical review: ${h(r.incidentId)} · ${h(r.note)} · archive ${h(r.archivePeriod)}</p>`).join('')}`;
      $('archivedIncidentReview').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),status=form.querySelector('[role=status]'),id=form.elements.incident.value.trim(),note=form.elements.note.value.trim();if(!id||!note){status.textContent='Enter an incident ID and review note.';return;}button.disabled=true;try{await post({action:'incidentResolve',incidentId:id,note});await load();}catch(error){status.textContent=error.message;button.disabled=false;}};
      $('complianceBody').querySelectorAll('form[data-incident]').forEach(form=>form.onsubmit=async event=>{
        event.preventDefault();const input=form.querySelector('input'),status=form.querySelector('[role=status]'),button=form.querySelector('button');
        if(!input.value.trim()){status.textContent='Enter a review note.';input.focus();return;}button.disabled=true;
        try{await post({action:'incidentResolve',incidentId:form.dataset.incident,note:input.value.trim()});await load();}
        catch(error){status.textContent=error.message;button.disabled=false;}
      });
    }catch(error){if(modal.open){$('complianceBody').textContent=error.message;const retry=document.createElement('button');retry.textContent='Retry';retry.onclick=load;$('complianceBody').append(retry);}}
  }
  await load();
}
