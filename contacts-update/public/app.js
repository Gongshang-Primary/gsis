import {filterPeople,emailList,whatsapp,tokens,excelWorkbook,staffRank,compareStaff} from './core.js';
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={groups:'Group',role:'Appointment',employment:'Employment',subject:'Specialism',mk:'School',teaching:'Teaching',formTeacher:'Form Teacher'};
let state=null,token='',preview=false,filters=[],visible=[],sortAscending=true,editingFilter=-1,editingRole=null,loading=false,noticeTimer;
function notice(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('toast').classList.add('hidden'),5000);}
async function api(path,body,signal,onReadStatus){
 const authAttempt=loginAttempt,credential=token,started=performance.now();
 const options={method:body?'POST':'GET',headers:token==='session'?{}:{Authorization:'Bearer '+token},cache:'no-store',signal,gsisNoRetryCodes:['CONTACTS_RECOVERY_REQUIRED','CONTACTS_BUSY'],gsisTimeoutMs:body?(path==='save-receipt'?12000:75000):50000,...(!body?{gsisTotalTimeoutMs:52000}:{}),...(onReadStatus?{gsisOnReadStatus:onReadStatus}:{})};
 if(body){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
 const r=await (window.GSISfetch||fetch)('/api/'+path,options);let data;
 try{data=await r.json()}catch{throw Error('Contacts returned an invalid response. Check the Contacts frontend APPS_SCRIPT_URL and published backend version.');}
 if(data.timing||data.data?.timing||data.gatewayTiming)console.debug('Contacts request timing',{path,transportMs:Math.round(performance.now()-started),backend:data.timing||data.data?.timing,gateway:data.gatewayTiming,traceId:r.gsisTraceId,attempts:r.gsisAttempts});
 if(!r.ok||data.ok===false){if(r.status===401&&authAttempt===loginAttempt&&credential===token)expireContactsAuth();const message=/Unknown action/i.test(data.error||'')?'The connected Contacts backend does not support '+path+'. Check APPS_SCRIPT_URL and publish the supplied Contacts backend as a new version.':data.error||'Unable to complete request';throw Object.assign(new Error(message),{status:data.status||r.status,code:data.code,diagnosticId:data.diagnosticId||data.gatewayTiming?.diagnosticId||data.reference?.requestId,diagnostics:r.gsisDiagnostics||[],draftEditable:data.draftEditable===true});}
 return data.data;
}

let contactVCardDownload=null;
const contactVCardURLs=new Map();
function releaseContactVCardURL(url,delay=0){
 if(!contactVCardURLs.has(url))return;
 clearTimeout(contactVCardURLs.get(url));
 if(delay){contactVCardURLs.set(url,setTimeout(()=>releaseContactVCardURL(url),delay));return;}
 URL.revokeObjectURL(url);contactVCardURLs.delete(url);
}
function clearContactVCard(){
 for(const url of contactVCardURLs.keys())releaseContactVCardURL(url);
 contactVCardDownload=null;const status=$('contactVCardStatus');if(status){status.replaceChildren();status.hidden=true;status.classList.remove('error');}
}
function contactVCardStatus(message,error=false){
 let status=$('contactVCardStatus');
 if(!status){status=document.createElement('p');status.id='contactVCardStatus';status.className='contact-vcard-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');$('contacts').prepend(status);}
 status.replaceChildren();status.textContent=message;status.classList.toggle('error',error);status.hidden=!message;
 if(!contactVCardDownload)return null;
 const link=document.createElement('a');link.href=contactVCardDownload.url;link.download=contactVCardDownload.filename;link.dataset.contactVcardDownload='';link.textContent='Download contact file';status.append(' ',link);
 const help=document.createElement('small');help.textContent='Android: Contacts → Organize → Import from file. iPhone: if the browser does not offer import, open the .vcf as an email or message attachment. Imported contacts are copies; repeated imports may create duplicates.';status.append(help);return link;
}
function contactVCardButton(person){return `<button type="button" class="contact-add-button" data-contact-vcard="${esc(person.id)}" aria-label="Add to contacts: ${esc(person.name)}" title="Download contact file for ${esc(person.name)}">+</button>`;}
$('contactRows').addEventListener('click',event=>{
 const button=event.target.closest('[data-contact-vcard]');if(!button||!state)return;
 const person=state.people.find(person=>String(person.id)===button.dataset.contactVcard);if(!person)return;
 if(preview){clearContactVCard();contactVCardStatus('Preview only. No contact file was exported.');return;}
 if(!token||!state.user?.email){clearContactVCard();contactVCardStatus('Sign in to view and export a contact.',true);return;}
 try{
  if(typeof window.GSISContactVCard?.buildContactVCard!=='function')throw Error('Contact download is unavailable because this page did not load all required files. Reload Contacts and try again.');
  const file=window.GSISContactVCard.buildContactVCard(person),url=URL.createObjectURL(new Blob([file.text],{type:'text/vcard;charset=utf-8'}));
  if(contactVCardDownload)releaseContactVCardURL(contactVCardDownload.url,60000);
  contactVCardURLs.set(url,null);contactVCardDownload={url,filename:file.filename};
  const link=contactVCardStatus('Contact file ready. Open it in Contacts to review and save.');
  try{link.click();}catch{contactVCardStatus('The download did not start. Use Download contact file to try again.',true);}
 }catch(error){clearContactVCard();contactVCardStatus(error.message||'The contact file could not be prepared. Try again.',true);}
});
window.addEventListener('pagehide',clearContactVCard);

const columns=[['name','TTb Name'],['statutoryName','Statutory Name'],['gsps','GSPS Email'],['icon','iCON Email'],['ces','CES Email'],['mobile','Mobile'],['ext','Ext'],['role','Roles'],['formTeacher','FT'],['birthday','Birthday'],['groups','Groups'],['employment','Employment'],['mk','School'],['levels','Levels'],['subjects','Subjects'],['dept','Dept'],['comm','Committees'],['cca','CCAs'],['plt','PLT'],['events','Events']];
const pendingColumns=[];const deploymentFilters={levels:'Levels',subjects:'Subjects',dept:'Dept',comm:'Committees',cca:'CCAs',plt:'PLT',events:'Events'};
const defaultContactColumns=()=>window.matchMedia?.('(max-width:640px), (max-width:900px) and (max-height:500px)').matches?['name','mobile','formTeacher']:['name','gsps','ces','mobile','formTeacher'];
let selectedColumns=defaultContactColumns(),columnFilters={},sortColumn=null;
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function assignmentValue(p,key){
 if(!state?.deploymentAvailable)return state?.deploymentPending?'Loading…':'Unavailable';
 const ordered=values=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).join(', ');
 if(key==='levels')return ordered((p.teachingAssignments||[]).map(a=>'P'+a.level));
 if(key==='subjects')return ordered((p.teachingAssignments||[]).map(a=>a.subject==='Sci'?'Science':a.subject));
 return ordered((state.organisations?.[key]||[]).filter(g=>(p.memberships?.[key]||[]).includes(g.id)).map(g=>g.name));
}
const valueFor=(p,key)=>deploymentFilters[key]?assignmentValue(p,key):key==='mobile'?String(p.mobile||'').replace(/\s/g,'').replace(/^(\d{4})(\d{4})$/,'$1 $2'):key==='birthday'?[p.dayOfBirth,MONTHS[Number(p.monthOfBirth)-1]].filter(Boolean).join(' '):key==='groups'?(p.groups||[]).join(', '):['teachingLoad','formTeacher','deploymentAssignments'].includes(key)&&!state?.deploymentAvailable?(state?.deploymentPending?'Loading…':'Unavailable'):key==='teachingLoad'?(state?.deploymentAvailable?String(p.teachingLoad??0):'Unavailable'):String(['gsps','icon','ces'].includes(key)?p.emails[key]||'':p[key]||'');
function deploymentFilterBlocked(){const keys=[...Object.keys(deploymentFilters),'formTeacher','teaching','deploymentAssignments'];return !state?.deploymentAvailable&&(keys.some(k=>dropdownFilters[k]?.length||String(columnFilters[k]||'').trim())||filters.some(f=>keys.includes(f.category)));}
function renderContacts(){if(!state)return;
 const activeColumns=columns.filter(([key])=>selectedColumns.includes(key));
 const scroller=$('contactRows').closest('.table-viewport'),left=scroller?.scrollLeft,top=scroller?.scrollTop;
 visible=filterPeople(deploymentFilterBlocked()?[]:state.people,{inactive:$('inactive').checked,filters}).filter(matchesDropdowns).filter(p=>activeColumns.every(([key])=>valueFor(p,key).toLowerCase().includes((columnFilters[key]||'').trim().toLowerCase()))).sort((a,b)=>(sortColumn?(sortAscending?1:-1)*valueFor(a,sortColumn).localeCompare(valueFor(b,sortColumn),undefined,{numeric:true}):0)||compareStaff(a,b));
 renderColumnChoices();
 const head=$('contactHead'),headKey=JSON.stringify([activeColumns.map(([key])=>key),sortColumn,sortAscending]);
 if(head.gsisRenderKey!==headKey){head.innerHTML='<tr><th class="contact-add-column" rowspan="2" scope="col">add</th>'+activeColumns.map(([key,label])=>`<th aria-sort="${sortColumn===key?(sortAscending?'ascending':'descending'):'none'}"><button class="sort" data-sort="${key}">${label} ${sortColumn===key?(sortAscending?'▲':'▼'):'↕'}</button> <button class="column-copy" data-copy="${key}" aria-label="Copy shown ${label}" title="Copy shown ${label}">📋</button></th>`).join('')+'</tr><tr class="column-filters">'+activeColumns.map(([key,label])=>key==='birthday'?'<th></th>':`<th><input type="search" data-column-filter="${key}" aria-label="Filter ${label}" placeholder="Filter…"></th>`).join('')+'</tr>';head.gsisRenderKey=headKey;}
 head.querySelectorAll('[data-column-filter]').forEach(input=>{const value=columnFilters[input.dataset.columnFilter]||'';if(input.value!==value)input.value=value;});
 head.querySelectorAll('[data-copy]').forEach(button=>button.disabled=!visible.length);
 $('contactRows').innerHTML=visible.map(p=>`<tr class="${p.active==='N'?'inactive':''}"><td class="contact-add-column">${contactVCardButton(p)}</td>`+activeColumns.map(([key])=>{const value=valueFor(p,key),wa=key==='mobile'?whatsapp(value):'';let content=esc(value);if(['gsps','icon','ces'].includes(key)&&value)content=`<a href="mailto:${esc(value)}">${content}</a>`;else if(wa)content=`<a href="${wa}" target="_blank" rel="noopener" aria-label="WhatsApp ${esc(p.name)}">${content}</a>`;if(key==='name')content+=p.active==='N'?' <span class="role-badge">Inactive</span>':!['Y','N'].includes(p.active)?'<span class="unknown">Status not recorded</span>':'';return `<td>${content}</td>`;}).join('')+'</tr>').join('');
 $('count').textContent=`Showing ${visible.length} of ${state.people.length} results`+(deploymentFilterBlocked()?' · selected teaching filters awaiting data':'');$('exportExcel').disabled=!visible.length||deploymentFilterBlocked();$('empty').classList.toggle('hidden',visible.length>0);
 $('pills').classList.toggle('has-filters',filters.length>0);$('pills').innerHTML=filters.map((f,i)=>`<span class="pill"><button data-edit-filter="${i}" aria-label="Edit ${esc(labels[f.category])} ${esc(f.value)}">${esc(labels[f.category])}: ${esc(f.value)}</button><button data-remove-filter="${i}" aria-label="Remove ${esc(labels[f.category])} ${esc(f.value)}">×</button></span>`).join('');$('clear').disabled=!filters.length&&!Object.values(columnFilters).some(Boolean)&&!Object.values(dropdownFilters).some(x=>x.length);window.GSISContactsMobile?.render();
 window.GSISTableFit?.($('contactRows').closest('table'));if(scroller){scroller.scrollLeft=left;scroller.scrollTop=top;}
}
$('columnChoices').onclick=columnChoiceClick;
$('defaultColumns').onclick=()=>{selectedColumns=defaultContactColumns();columnFilters={};sortColumn=null;sortAscending=true;renderContacts();};
$('exportExcel').onclick=()=>{if(deploymentFilterBlocked()){notice('Teaching information is unavailable. Clear its filters or reload teaching data before exporting.');return;}const cols=columns.filter(([key])=>selectedColumns.includes(key));const blob=excelWorkbook([cols.map(([,label])=>label),...visible.map(p=>cols.map(([key])=>valueFor(p,key)))]);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='GSiS-contacts.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('allColumns').onclick=()=>{selectedColumns=columns.map(([key])=>key);renderContacts();};
$('contactHead').oninput=e=>{const key=e.target.dataset.columnFilter;if(!key)return;columnFilters[key]=e.target.value;renderContacts();};
$('contactHead').onclick=async e=>{const sort=e.target.closest('[data-sort]'),copy=e.target.closest('[data-copy]');if(sort){const key=sort.dataset.sort;sortAscending=key===sortColumn?!sortAscending:true;sortColumn=key;renderContacts();}if(copy){const key=copy.dataset.copy,text=['gsps','icon','ces'].includes(key)?emailList(visible,key):visible.map(p=>valueFor(p,key)).filter(Boolean).join('\n');if(!text){notice('No values to copy.');return;}try{await navigator.clipboard.writeText(text);notice('Shown values copied.');}catch{notice('Clipboard access was blocked. Please allow it and try again.');}}};

function renderAccess(){const admin=state.user.roles.includes('Admin');$('addRole').classList.toggle('hidden',!admin);$('editHead').classList.toggle('hidden',!admin);
 const people=state.access.filter(p=>p.active==='Y'&&p.roles.some(r=>r==='Admin'||r==='KP'));
 $('accessRows').innerHTML=people.sort((a,b)=>{const contact=email=>state.people.find(p=>p.emails.gsps.toLowerCase()===email.toLowerCase());const left=contact(a.email),right=contact(b.email);return staffRank(left)-staffRank(right)||compareStaff(left||a,right||b);}).map(p=>`<tr><td>${esc(p.email.split('@')[0])}</td><td>${esc(p.name)}</td><td>${p.roles.filter(r=>r==='Admin'||r==='KP').map(r=>`<span class="role-badge">${esc(r==='KP'?'SMC':r)}</span>`).join('')}</td>${admin?`<td><button class="text-link" data-role-email="${esc(p.email)}">Edit</button></td>`:''}</tr>`).join('')||`<tr><td colspan="${admin?4:3}">No SMC or Admin users to show.</td></tr>`;
}
function privileged(){return state?.user.roles.some(r=>r==='Admin'||r==='KP')}
function contactViewPending(){return state?.viewState?.pending===true;}
function contactDataEditable(){return !!contactData?.editable&&!!state?.user.roles.includes('Admin')&&!contactViewPending();}
function syncContactDataControls(){
 const editable=contactDataEditable(),busy=dataLoading||dataSaving;
 $('saveData').disabled=busy||!editable;$('addContactRow').disabled=busy||!editable||!!dataRequest;$('recalculateData').disabled=busy||!editable||!!dataRequest;
 $('reloadData').disabled=busy||!!dataRequest;
}
function renderContactViewState(){
 const view=state?.viewState||{},pending=view.pending===true,notice=$('contactViewNotice');notice.hidden=!pending;
 if(pending){const asOf=view.asOf?new Date(view.asOf):null,dated=asOf&&!Number.isNaN(asOf.getTime())?' Saved '+asOf.toLocaleString()+'.':'';
  notice.textContent=(view.source==='saved'?'Showing the last complete Contacts list.':view.source==='backup'?'Showing the saved Contacts backup.':view.source==='unavailable'?'The saved Contacts list needs administrator repair. Sign-in remains available.':'Contacts are available to view.')+dated+' Editing is paused while a save is completed.'+(view.hiddenRecords?' '+view.hiddenRecords+' affected contact'+(view.hiddenRecords===1?' is':'s are')+' temporarily unavailable.':'');
 }
 if(!state?.user.roles.includes('Admin')||!pending)resetContactRecovery();
 syncContactDataControls();
}
function acceptContactViewState(result){
 if(!state||!result)return;
 state.viewState=result.viewState;renderContactViewState();
 if(contactData)renderData();for(const kind of Object.keys(auxTables))if(auxTables[kind]?.data)renderAux(kind);
 if(contactViewPending()&&state.user.roles.includes('Admin')&&$('contactRecovery').hidden)void showContactRecovery();
}
function show(){window.setGSISViewport?.('contacts',state?.user?.roles||[]);
 const canView=privileged(),canEdit=state.user.roles.includes('Admin');
 for(const id of ['dataTab'])$(id).classList.toggle('hidden',!canView);
 document.querySelector('[data-page="admin"]').classList.toggle('hidden',!canView);document.querySelector('[data-page="signatureSettings"]').classList.toggle('hidden',!canEdit);if(!canEdit)$('signatureSettings').classList.remove('active');
 if(!canView){for(const id of ['data','admin'])$(id).classList.remove('active');contactData=null;dataEdits.clear();if(!document.querySelector('.page.active')){$('contacts').classList.add('active');document.querySelector('[data-page="contacts"]').classList.add('active')}}
 $('saveData').hidden=!canEdit;$('addContactRow').hidden=!canEdit;$('recalculateData').hidden=!canEdit;
 $('loginView').classList.add('hidden');$('loadingView').classList.add('hidden');$('app').classList.remove('hidden');$('identity').textContent=state.user.email.split('@')[0];renderContactViewState();renderContacts();renderAccess();if(contactData)renderData();for(const kind of Object.keys(auxTables))if(auxTables[kind]?.data)renderAux(kind);if($('signature').classList.contains('active'))renderSignature();if($('signatureSettings').classList.contains('active'))renderSignatureSettings();
}
async function refresh(){if(loading||dataSaving)return;loading=true;$('refresh').disabled=true;const owner=state?.user.email,credential=token;try{const next=await api('bootstrap');if(token!==credential||state?.user.email!==owner)return;if(next.user.email!==owner){expireContactsAuth();return;}state=next;$('refresh').title='Refresh';show();loadDeployment(state);if(contactViewPending()&&state.user.roles.includes('Admin'))await showContactRecovery();if(hasContactDrafts())notice('Contact list refreshed. Your unsaved draft is retained.');}catch(e){notice(e.message);if(state)$('refresh').title='Refresh failed · showing earlier data';else $('loginMessage').textContent=e.message;if(e.code==='CONTACTS_RECOVERY_REQUIRED')await showContactRecovery();}finally{loading=false;$('refresh').disabled=false;}}
function populateValues(){const category=$('filterCategory').value;const values=category==='groups'?state.groups:[...new Set(state.people.flatMap(p=>tokens(p[category])))].sort();$('filterValue').innerHTML=values.map(v=>`<option>${esc(v)}</option>`).join('');}
function openFilter(index=-1){editingFilter=index;$('filterCategory').value=index>=0?filters[index].category:'groups';populateValues();if(index>=0)$('filterValue').value=filters[index].value;$('filterDialog').showModal();}
function roleTarget(){const email=$('roleAlias').value.trim().toLowerCase()+'@gsps.edu.sg';editingRole=state.access.find(p=>p.email===email)||null;$('roleName').value=state.people.find(p=>p.emails.gsps.toLowerCase()===email)?.name||'';$('roleKP').checked=!!editingRole?.roles.includes('KP');$('roleAdmin').checked=!!editingRole?.roles.includes('Admin');$('roleAdmin').disabled=$('roleAdmin').checked;}
function openRole(email=''){$('roleAlias').value=email.split('@')[0];$('roleAlias').readOnly=!!email;roleTarget();$('roleError').textContent='';$('roleDialog').showModal();}
function clearContactsPersonalState(){clearContactVCard();deploymentAttempt++;auxTables={};contactData=null;dataEdits.clear();newContactIds.clear();dataRequest=null;signatureRenderEpoch++;signatureReady=null;signatureSettingsDraft=null;filters=[];columnFilters={};dropdownFilters={};for(const id of ['diyGrid','dataGrid','signatureIdentity','signatureSubjectChoices'])$(id).replaceChildren();$('signatureCanvas').width=$('signatureCanvas').width;$('signatureCanvas').hidden=true;$('signatureDownload').disabled=true;}
function expireContactsAuth(){clearContactVCard();window.GSISContactsMobile?.close();resetContactRecovery();token='';$('app').classList.add('hidden');$('loginView').classList.remove('hidden');$('loadingView').classList.add('hidden');$('loginMessage').textContent='Session expired. Sign in again with the same account. Your draft is retained.';$('retryLogin').hidden=false;$('signInAgain').hidden=false;}
async function signout(){if(recoveryBusy){notice('Wait for save recovery to finish before signing out.');return;}if(signatureSettingsSaving){notice('Wait for signature settings to finish saving.');return;}if(dataSaving||dataRequest){notice('Confirm the pending save with Retry Save changes before signing out.');return;}if(hasContactDrafts()&&!confirm('Discard unsaved Contacts changes and sign out?'))return;try{const r=await fetch('/api/logout',{method:'POST',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Could not sign out')}catch(e){notice('Sign-out failed. Please retry.');return}loginAttempt++;window.GSISContactsMobile?.close();resetContactRecovery();clearContactsPersonalState();dataEdits.clear();newContactIds.clear();auxTables={};contactData=null;$('dataGrid').replaceChildren();token='';state=null;visible=[];filters=[];$('contactRows').replaceChildren();$('accessRows').replaceChildren();$('app').classList.add('hidden');$('loginView').classList.remove('hidden');$('loginMessage').textContent='Sign in with your school Google account.';window.google?.accounts.id.disableAutoSelect();start();}
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{
 const page=b.dataset.page;if(['data','admin'].includes(page)&&!privileged())return;if(page==='signatureSettings'&&!state?.user.roles.includes('Admin'))return;
 document.querySelectorAll('.page,.nav-button').forEach(e=>e.classList.remove('active'));$(page).classList.add('active');b.classList.add('active');if(page==='data')loadContactData();else if(['diy'].includes(page))loadAux(page);else if(page==='signature')renderSignature();else if(page==='signatureSettings')renderSignatureSettings();window.GSISContactsMobile?.render();
});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('inactive').onchange=renderContacts;$('clear').onclick=()=>{filters=[];columnFilters={};dropdownFilters={};renderContacts();};$('addFilter').onclick=()=>openFilter();$('filterCategory').onchange=populateValues;
$('filterForm').onsubmit=e=>{e.preventDefault();const f={category:$('filterCategory').value,value:$('filterValue').value};if(!f.value)return;if(editingFilter>=0)filters.splice(editingFilter,1);if(!filters.some(x=>x.category===f.category&&x.value===f.value))filters.push(f);$('filterDialog').close();renderContacts();};
$('pills').onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.editFilter!==undefined)openFilter(Number(b.dataset.editFilter));if(b.dataset.removeFilter!==undefined){filters.splice(Number(b.dataset.removeFilter),1);renderContacts();}};

$('refresh').onclick=()=>preview?notice('Preview uses sample data only.'):refresh();$('signout').onclick=()=>preview?notice('Preview only — no account is signed in.'):signout();$('addRole').onclick=()=>openRole();$('accessRows').onclick=e=>{const b=e.target.closest('[data-role-email]');if(b)openRole(b.dataset.roleEmail);};
$('roleAlias').oninput=roleTarget;
$('roleForm').onsubmit=async e=>{e.preventDefault();if(preview){$('roleError').textContent='Preview only — role changes are not saved.';return;}const email=$('roleAlias').value.trim().toLowerCase()+'@gsps.edu.sg';const existing=state.access.find(p=>p.email===email);$('saveRole').disabled=true;$('roleError').textContent='';try{const saved=await api('kp',{email,enabled:$('roleKP').checked,grantAdmin:$('roleAdmin').checked&&!existing?.roles.includes('Admin'),version:existing?.version||'new'});const row={...(existing||{}),...saved,name:existing?.name||state.people.find(p=>p.emails.gsps.toLowerCase()===email)?.name||''};state.access=state.access.filter(p=>p.email!==email).concat(row);if(state.user.email===email)state.user.roles=saved.roles;$('roleDialog').close();notice('Role saved');renderAccess();window.setGSISViewport?.('contacts',state.user.roles);}catch(err){$('roleError').textContent=err.message;if(err.status===409)await refresh();}finally{$('saveRole').disabled=false;}};
async function start(forceSignIn=false){
 $('retryLogin').hidden=true;$('signInAgain').hidden=true;$('loginMessage').textContent='Connecting to school sign-in…';
 try{const sessionRead=forceSignIn?null:(window.GSISfetch||fetch)('/api/session',{cache:'no-store',gsisTotalTimeoutMs:12000}).then(async response=>({response,session:await response.json()})).catch(error=>({error}));const config=await (window.GSISfetch||fetch)('/api/config',{cache:'no-store',gsisTotalTimeoutMs:12000}).then(r=>r.json());if(config.preview){preview=true;state=config.data;$('previewLabel').classList.remove('hidden');show();return}if(!config.configured)throw Error('School sign-in is not configured. Contact an Admin.');
 if(sessionRead){const checked=await sessionRead;if(checked.error)throw checked.error;const {response,session}=checked;if(response.status>=500)throw Error(session.error||'School sign-in is unavailable');if(session.ok){await authenticateContacts('session');return}}
 const initialise=()=>{google.accounts.id.initialize({client_id:config.clientId,hd:'gsps.edu.sg',callback:r=>authenticateContacts(r.credential)});$('googleButton').replaceChildren();google.accounts.id.renderButton($('googleButton'),{theme:'outline',size:'large',text:'signin_with'});$('loginMessage').textContent='Sign in with your school account.'};
 if(window.google?.accounts?.id){initialise();return}let script=document.querySelector('script[data-google-login]');if(!script){script=document.createElement('script');script.dataset.googleLogin='true';script.src='https://accounts.google.com/gsi/client';}const timer=setTimeout(()=>{$('loginMessage').textContent='Google sign-in is taking too long. Retry connection.';$('retryLogin').hidden=false},12000);script.onload=()=>{clearTimeout(timer);initialise()};script.onerror=()=>{clearTimeout(timer);$('loginMessage').textContent='Google sign-in could not load.';$('retryLogin').hidden=false};document.head.append(script);
 }catch(e){$('loadingView').classList.add('hidden');$('loginView').classList.remove('hidden');$('loginMessage').textContent=friendlyFailure(e);$('retryLogin').hidden=false;$('signInAgain').hidden=false}
}




let contactData=null,dataEdits=new Map(),dataSaving=false,dataRequest=null;
function sortContactData(data){if(data?.rows){const i=data.fields.indexOf('Active');if(i>=0)data.rows.sort((a,b)=>Number(a.values[i]==='N')-Number(b.values[i]==='N'));}return data;}
const newContactIds=new Set();
$('addContactRow').onclick=()=>{if(!contactDataEditable()||dataLoading||dataSaving||dataRequest)return;const id='contact-'+crypto.randomUUID(),row={id,values:contactData.fields.map(()=>''),computed:contactData.fields.map(f=>['TTb Name','EO Appt Level'].includes(f))};contactData.rows.unshift(row);newContactIds.add(id);const i=contactData.fields.indexOf('Active');dataEdits.set(id+'|'+i,{id,field:'Active',expected:'',value:'Y'});if($('ttbFilter'))$('ttbFilter').value='';renderData();$('dataGrid').querySelector('[data-person="'+id+'"][data-field="'+contactData.fields.indexOf('Basic Name')+'"]')?.focus();};
function renderData(){
 if(!contactData||!privileged())return;
 const filterText=($('ttbFilter')?.value||'').trim().toLowerCase();
 let visibleRows=contactData.rows;
 if(filterText){const ttbIndex=contactData.fields.indexOf('TTb Name');if(ttbIndex>=0)visibleRows=contactData.rows.filter(r=>{const val=dataEdits.get(r.id+'|'+ttbIndex)?.value??r.values[ttbIndex];return String(val||'').toLowerCase().includes(filterText)});}
 const renderDataData={...contactData,rows:visibleRows};
 renderStaffGrid('dataGrid',renderDataData,dataEdits,()=>{renderDataStatus()},dataLoading||dataSaving||!!dataRequest||!contactDataEditable());syncContactDataControls();
 renderDataStatus();
}
function renderDataStatus(){
 const filterText=($('ttbFilter')?.value||'').trim();
 const visibleCount=$('dataGrid').querySelectorAll('tbody tr').length;
 const countText=filterText?`Showing ${visibleCount} of ${contactData.rows.length} staff`:'';
 $('dataStatus').textContent=contactViewPending()?'Viewing saved Contacts. Editing is paused until the interrupted save is completed.'+(hasContactDrafts()?' Your draft is retained.':''):dataRequest?'Save unconfirmed. Draft locked. Retry Save changes to confirm the same save.':dataEdits.size?dataEdits.size+' unsaved cell(s)'+(countText?' · '+countText:''):!contactData.editable?'View only':(countText?countText:'Up to date')+(contactData.rows.some(r=>r.values.some((v,i)=>outsideHRChoices(contactData.fields[i],v,contactData.lists||{})))?' · Amber cells: outside published HR choices; existing values retained':'');
}
let dataFlight=null,dataLoading=false;
const yieldGrid=()=>document.hidden?Promise.resolve():new Promise(resolve=>setTimeout(resolve,0));
async function loadContactData(force=false){
 if(!privileged()||dataSaving||dataRequest||dataEdits.size)return;
 if(dataFlight)return dataFlight;
 if(contactData&&!force&&!!contactData.viewState?.pending===contactViewPending()){renderData();return;}
 const owner=state.user.email,credential=token,started=Date.now();
 const valid=()=>token===credential&&state?.user.email===owner&&privileged()&&!dataEdits.size;
 const progress=$('dataProgress');let stage='Fetching current contacts and validation choices',attempt=1;
 const status=()=>{if(valid())$('dataStatus').textContent=stage+' · '+Math.floor((Date.now()-started)/1000)+'s'+(attempt>1?' · attempt '+attempt+' of 2':'')+' · read-only until ready';};
 dataLoading=true;progress.hidden=false;progress.removeAttribute('value');$('dataGrid').setAttribute('aria-busy','true');
 for(const id of ['saveData','reloadData','recalculateData'])$(id).disabled=true;
 // Display the current directory immediately, explicitly as a read-only preview.
 const gridFields=['TTb Name','Basic Name','Statutory Name','iCON Alias (@moe.edu.sg)','CES Alias (@schools.gov.sg)','GSPS Alias (@gsps.edu.sg)','Mobile No','EXT','Day of Birth','Month of birth','Role','EO Appt Level','Appointment Status','Employment Modifier','Subject Modifier','Active','MK Modifier'];
 const shown=contactData||{editable:false,fields:gridFields,rows:Array.from({length:Math.max(12,state.people?.length||0)},(_,i)=>({id:'loading-'+i,values:gridFields.map(()=>''),computed:gridFields.map(()=>true)}))};
 renderStaffGrid('dataGrid',shown,new Map(),()=>{},true);
 stage='Grid ready; fetching contact data and validation choices';status();
 const timer=setInterval(status,1000);
 dataFlight=(async()=>{try{
  const result=await api('data',undefined,undefined,event=>{attempt=event.attempt;status()});sortContactData(result);
  if(!valid())return;
  clearInterval(timer);progress.max=Math.max(1,result.rows.length);progress.value=0;
  const changed=()=>{renderDataStatus();};
  renderStaffGrid('dataGrid',{...result,rows:[]},dataEdits,changed,true);
  for(let start=0;start<result.rows.length;start+=15){
   if(!valid())return;
   renderStaffGrid('dataGrid',{...result,rows:result.rows.slice(start,start+15)},dataEdits,changed,true,true);
   progress.value=Math.min(start+15,result.rows.length);
   $('dataStatus').textContent='Displaying '+progress.value+' of '+result.rows.length+' contacts · validation choices received · read-only until ready';
   await yieldGrid();
  }
  if(!valid())return;
  contactData=result;acceptContactViewState(result);
  if(contactDataEditable())$('dataGrid').querySelectorAll('[data-can-edit="true"]').forEach(input=>{if(input.tagName==='SELECT')input.disabled=false;else input.readOnly=false});
  progress.value=progress.max;
  renderData();
  $('dataStatus').textContent='Ready · '+result.rows.length+' contacts · loaded in '+((Date.now()-started)/1000).toFixed(1)+'s'+(result.editable?'':' · read-only access');
 }catch(e){if(valid()){contactData=null;$('dataStatus').textContent=friendlyFailure(e)+' Showing read-only data. Use Reload to retry.';if(e.code==='CONTACTS_RECOVERY_REQUIRED')await showContactRecovery();}}
 finally{clearInterval(timer);dataFlight=null;dataLoading=false;if(token===credential&&state?.user.email===owner){progress.hidden=true;$('dataGrid').setAttribute('aria-busy','false');syncContactDataControls();}window.GSISTableRefresh?.();}})();
 return dataFlight;
}

if($('ttbFilter')){
 $('ttbFilter').addEventListener('input',()=>renderData());
 $('ttbFilter').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();$('ttbFilter').value='';renderData();}});
}
$('reloadData').onclick=()=>{if(dataSaving||dataRequest){notice('Confirm the pending save with Retry Save changes before reloading.');return;}if(hasContactDrafts()&&!confirm('Discard unsaved data cells and load saved values?'))return;dataEdits.clear();if(contactData)contactData.rows=contactData.rows.filter(r=>!newContactIds.has(r.id));newContactIds.clear();dataRequest=null;loadContactData(true)};
function applyContactSavedRows(changed){for(const row of changed||[]){const local=contactData.rows.find(x=>x.id===row.id);if(local)local.values=row.values;let p=state.people.find(x=>x.id===row.id);if(!p){p={id:row.id,emails:{},groups:[]};state.people.push(p);}if(p){if(row.groups)p.groups=row.groups;if(row.formalRole!==undefined)p.formalRole=row.formalRole;const get=k=>row.values[contactData.fields.indexOf(k)]||'';p.name=get('TTb Name');p.basicName=get('Basic Name');p.statutoryName=get('Statutory Name');p.mobile=get('Mobile No');p.ext=get('EXT');p.role=get('Role');p.appointmentLevel=get('EO Appt Level');p.appointmentStatus=get('Appointment Status');p.active=get('Active');p.employment=get('Employment Modifier');p.subject=get('Subject Modifier');p.mk=get('MK Modifier');p.dayOfBirth=get('Day of Birth');p.monthOfBirth=get('Month of birth');for(const [key,field,domain] of [['gsps','GSPS Alias (@gsps.edu.sg)','gsps.edu.sg'],['icon','iCON Alias (@moe.edu.sg)','moe.edu.sg'],['ces','CES Alias (@schools.gov.sg)','schools.gov.sg']]){const value=get(field);p.emails[key]=value?(value.includes('@')?value:value+'@'+domain):'';}}}}
// A retry always uses the original serialized payload and ID, never the live grid.
function contactSaveAttempt(){
 const requestId=crypto.randomUUID(),changes=[...dataEdits.values()].filter(x=>!newContactIds.has(x.id));
 const additions=[...newContactIds].map(id=>({id,values:Object.fromEntries(contactData.fields.flatMap((f,i)=>['TTb Name','EO Appt Level'].includes(f)?[]:[[f,dataEdits.get(id+'|'+i)?.value??contactData.rows.find(r=>r.id===id).values[i]]]))}));
 return Object.freeze({requestId,owner:state.user.email,payload:JSON.stringify({requestId,changes,additions})});
}
async function confirmContactSave(attempt,{digest,credential=token,owner=attempt.owner,diagnostics={}}={}){
 const budget=12000,deadline=Date.now()+27000,authAttempt=loginAttempt;let latest=null;
 for(const delay of [0,1000,2500]){
  if(Date.now()+delay+budget>deadline||authAttempt!==loginAttempt||!token||token!==credential||owner&&state?.user.email!==owner)break;
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),budget);
  try{const result=await api('save-receipt',{requestId:attempt.requestId,...(digest?{digest}:{})},controller.signal);if(token!==credential||owner&&state?.user.email!==owner)return null;latest=result;if(result.saved)return result;}
  catch(e){diagnostics.confirmationError=friendlyFailure(e);if(e.status===401||e.status===403)break;}
  finally{clearTimeout(timer);}
 }
 return latest;
}
$('saveData').onclick=async()=>{
 if(!contactDataEditable()||dataLoading||dataSaving||(!dataEdits.size&&!newContactIds.size&&!dataRequest))return;
 if(!dataRequest&&dataEdits.size+newContactIds.size*17>300){notice('Save up to 300 changed cells at a time.');return;}
 const retry=!!dataRequest;dataRequest||=contactSaveAttempt();const attempt=dataRequest;
 if(attempt.owner!==state.user.email){notice('Use the same account to confirm this save.');return;}
 dataSaving=true;for(const id of ['saveData','reloadData','recalculateData','addContactRow'])$(id).disabled=true;
 renderData();$('dataGrid').inert=true;$('dataStatus').textContent='Saving…';let result,committed=false,message='';const confirmationDiagnostics={};
 try{
  try{
   if(retry){$('dataStatus').textContent='Checking the original save…';result=await api('save-receipt',{requestId:attempt.requestId});if(result.writing&&!result.saved){result=await confirmContactSave(attempt,{diagnostics:confirmationDiagnostics});if(!result?.saved){message='The original save is still unconfirmed. Your draft is retained. Check again with Retry Save changes.'+(confirmationDiagnostics.confirmationError?' Confirmation: '+confirmationDiagnostics.confirmationError:'');return;}}}
   if(!result?.saved)result=await api('save-data',JSON.parse(attempt.payload));if(!result.saved)throw Error('Save confirmation pending');committed=true;
  }
  catch(e){
   if(e.draftEditable){dataRequest=null;message=e.message+' Your unsaved draft is retained.';if(e.code==='CONTACTS_RECOVERY_REQUIRED'){if(state)state.viewState={...(state.viewState||{}),pending:true};renderContactViewState();await showContactRecovery();}}
   else{$('dataStatus').textContent='Checking whether your save completed…';result=await confirmContactSave(attempt,{diagnostics:confirmationDiagnostics});committed=!!result?.saved;if(!committed)message=friendlyFailure(e)+(confirmationDiagnostics.confirmationError?' Confirmation: '+confirmationDiagnostics.confirmationError:'')+' Draft locked. Retry Save changes uses the same save ID.';}
  }
  if(committed){
   dataEdits.clear();newContactIds.clear();dataRequest=null;
   try{if(result.data){contactData=sortContactData(result.data);applyContactSavedRows(contactData.rows);}else if(result.changed)applyContactSavedRows(result.changed);else{contactData=sortContactData(await api('data'));applyContactSavedRows(contactData.rows);}
    renderContacts();message='Saved';notice('Contacts saved');
   }catch(e){contactData=null;message='Saved · reload the display. Your save is confirmed.';}
  }
 }finally{
  dataSaving=false;renderData();$('dataStatus').textContent=message||'Save unconfirmed. Retry Save changes uses the same save ID.';
  syncContactDataControls();
  $('dataGrid').inert=false;
 }
};

window.addEventListener('beforeunload',e=>{if(hasContactDrafts()||dataSaving){e.preventDefault();e.returnValue=''}});
let recalculateAttempt=null;
$('recalculateData').onclick=async()=>{if(!contactDataEditable()||dataLoading||dataSaving||dataRequest)return;if(dataEdits.size){notice('Save or discard your draft before recalculating.');return}dataSaving=true;$('dataGrid').inert=true;$('recalculateData').disabled=true;try{recalculateAttempt||={requestId:crypto.randomUUID()};const result=await api('recalculate-data',recalculateAttempt);recalculateAttempt=null;contactData=sortContactData(result.data);acceptContactViewState(result.data);dataSaving=false;renderData();notice('Recalculated '+result.recalculated+' staff records');dataSaving=false;if(result.directory){state=result.directory;show();}else await refresh()}catch(e){notice(e.message)}finally{dataSaving=false;$('dataGrid').inert=false;syncContactDataControls()}};
let recoveryEpoch=0,recoveryBusy=false;
function resetContactRecovery(){recoveryEpoch++;$('contactRecovery').hidden=true;$('contactRecovery').open=false;$('recoveryRequests').replaceChildren();$('recoveryStatus').textContent='';}
async function showContactRecovery(){
 if(!state?.user.roles.includes('Admin')||!token){resetContactRecovery();return;}
 if(recoveryBusy)return;const epoch=++recoveryEpoch,credential=token;
 $('contactRecovery').hidden=false;$('recoveryRequests').replaceChildren();$('recoveryStatus').textContent='Checking the saved request…';$('refreshRecovery').disabled=true;
 try{const result=await api('recovery-status');if(epoch!==recoveryEpoch||credential!==token)return;
  if(!result.canRecover){resetContactRecovery();return;}
  $('recoveryStatus').textContent=result.pending.length?'Review the original saved changes below. Completing a request keeps its original save ID and checks for conflicting edits.':result.cataloguePending?'A publication is being recovered. Retry connection shortly.':'No interrupted Contacts saves remain. Refresh the contact list.';
  for(const entry of result.pending){const card=document.createElement('article'),title=document.createElement('h3');title.textContent='Saved by '+entry.actor+' · '+entry.at;card.append(title);
   if(!entry.recoverable){const info=document.createElement('p');info.textContent=entry.message;card.append(info);}
   else{const rows=entry.changes.map(c=>[c.name||c.id,c.field,c.expected,c.value]);for(const a of entry.additions||[])for(const [field,value]of Object.entries(a.values||{}))if(value)rows.push([a.values['Basic Name']||a.id,field,'New contact',value]);
    const table=document.createElement('table');table.dataset.exportTitle='Saved Contacts changes';table.innerHTML='<thead><tr><th>Contact</th><th>Field</th><th>Before</th><th>Saved change</th></tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>').join('')+'</tbody>';card.append(table);
    const button=document.createElement('button');button.textContent='Complete this saved change';button.onclick=()=>recoverInterruptedContact(entry,button,epoch,credential);card.append(button);}
   $('recoveryRequests').append(card);
  }
 }catch(e){if(epoch===recoveryEpoch&&credential===token)$('recoveryStatus').textContent=friendlyFailure(e);}
 finally{if(epoch===recoveryEpoch)$('refreshRecovery').disabled=false;}
}
async function recoverInterruptedContact(entry,button,epoch,credential){
 if(recoveryBusy||dataSaving||epoch!==recoveryEpoch||credential!==token)return;
 recoveryBusy=true;button.disabled=true;$('refreshRecovery').disabled=true;$('recoveryStatus').textContent='Completing the original save…';const confirmationDiagnostics={};
 try{const request={requestId:entry.requestId,digest:entry.digest};let result,confirmationChecked=false;
  try{
   result=await api('save-receipt',request);if(epoch!==recoveryEpoch||credential!==token)return;
   if(result.writing&&!result.saved){$('recoveryStatus').textContent='The original save is still running. Checking its confirmation…';confirmationChecked=true;result=await confirmContactSave(entry,{digest:entry.digest,credential,diagnostics:confirmationDiagnostics});if(!result?.saved)throw Error('The original save is still unconfirmed. Keep this request and check again shortly.');}
   if(!result?.saved)result=await api('recover-save',request);
  }catch(e){
   if(confirmationChecked||[400,401,403,409].includes(e.status))throw e;
   $('recoveryStatus').textContent='Checking whether the original save completed…';result=await confirmContactSave(entry,{digest:entry.digest,credential,diagnostics:confirmationDiagnostics});if(!result?.saved)throw e;
  }
  if(epoch!==recoveryEpoch||credential!==token)return;
  if(!result.saved)throw Error('Recovery is unconfirmed. Retry this same recovery.');
  if(dataRequest?.requestId===entry.requestId){dataRequest=null;dataEdits.clear();newContactIds.clear();contactData=null;}
  $('recoveryStatus').textContent='Save recovered. Reloading Contacts…';resetContactRecovery();await authenticateContacts(credential);if($('data').classList.contains('active')&&!hasContactDrafts())await loadContactData(true);
 }catch(e){if(epoch===recoveryEpoch&&credential===token){$('recoveryStatus').textContent=friendlyFailure(e)+(confirmationDiagnostics.confirmationError?' Confirmation: '+confirmationDiagnostics.confirmationError:'')+' The original request is retained. Retry recovery or ask an administrator to inspect the conflict.';button.textContent='Retry this recovery';}}
 finally{recoveryBusy=false;if(epoch===recoveryEpoch){button.disabled=false;$('refreshRecovery').disabled=false;}}
}
$('refreshRecovery').onclick=()=>showContactRecovery();

let loginAttempt=0,loginAbort=null,loginCredential='',deploymentAttempt=0;
async function authenticateContacts(credential){
 if(!credential)return;resetContactRecovery();loginCredential=credential;const attempt=++loginAttempt,priorEmail=state?.user.email,loadStarted=performance.now();loginAbort?.abort();loginAbort=new AbortController();token=credential;
 $('loginView').classList.add('hidden');$('app').classList.add('hidden');$('loadingView').classList.remove('hidden');$('loginStage').textContent='Checking your school account and loading contacts…';$('retryContactsLogin').classList.add('hidden');
 const slow=setTimeout(()=>{if(attempt===loginAttempt){$('loginStage').textContent='Still connecting to the school service…';$('retryContactsLogin').classList.remove('hidden')}},6000);
 try{
  if(credential!=='session'){await api('session',{} ,loginAbort.signal);token='session';loginCredential='session';}
  const next=await api('bootstrap',undefined,loginAbort.signal);if(attempt!==loginAttempt)return;
  if(hasContactDrafts()&&priorEmail&&next.user.email!==priorEmail){token='';throw Error('Use the same account to recover your Contacts draft.')}
  if(priorEmail&&next.user.email!==priorEmail)clearContactsPersonalState();state=next;show();console.debug('Contacts directory ready',{ms:Math.round(performance.now()-loadStarted),people:next.people.length});loadDeployment(next);if(contactViewPending()&&next.user.roles.includes('Admin'))await showContactRecovery();if(dataEdits.size)notice(contactViewPending()?'Signed in. Your draft is retained while the interrupted save is completed.':'Signed in. Draft retained; review and press Save changes.');
 }catch(e){if(attempt!==loginAttempt)return;$('loginView').classList.remove('hidden');$('loginMessage').textContent=friendlyFailure(e);$('retryLogin').hidden=false;$('signInAgain').hidden=false;if(e.code==='CONTACTS_RECOVERY_REQUIRED')await showContactRecovery();}
 finally{clearTimeout(slow);if(attempt===loginAttempt)$('loadingView').classList.add('hidden')}
}
$('retryContactsLogin').onclick=()=>authenticateContacts(loginCredential);
async function loadDeployment(snapshot){
 if(!token||preview)return;const attempt=++deploymentAttempt;snapshot.deploymentPending=true;snapshot.deploymentAvailable=false;
 $('deploymentStatus').innerHTML='<span class="contacts-spinner" aria-hidden="true"></span> Loading teaching information… Contacts are ready.';
 try{
  const dep=await api('deployment');if(attempt!==deploymentAttempt||state!==snapshot||!token)return;
  state.deploymentPending=false;state.deploymentAvailable=!!dep.available;
  if(!dep.available)throw Error(dep.error||'Teaching information is unavailable');
  state.deploymentRevision=dep.revision;state.subjectHeaders=dep.subjectHeaders||[];state.organisations=dep.organisations||{};
  const byStaff=new Map(),workloads=new Map((dep.workloads||[]).map(x=>[x.staffId,x.total]));for(const a of dep.assignments){if(!byStaff.has(a.staffId))byStaff.set(a.staffId,[]);byStaff.get(a.staffId).push(a);}state.people.forEach(person=>{const a=byStaff.get(person.id)||[];person.teachingAssignments=a;person.ftLevels=a.filter(x=>x.subject==='FT').map(x=>'P'+String(x.level));person.memberships=Object.fromEntries(Object.keys(deploymentFilters).filter(k=>!['levels','subjects'].includes(k)).map(k=>[k,(dep.organisations?.[k]||[]).filter(g=>g.slots.includes(person.id)).map(g=>g.id)]));person.formTeacher=a.filter(x=>x.subject==='FT').map(x=>x.groupName).join(', ');person.teaching=[...new Set(a.filter(x=>x.subject!=='FT').flatMap(x=>[x.subject,'P'+x.level,x.subject+' · P'+x.level]))].join(', ');person.deploymentAssignments=a.filter(x=>x.subject!=='FT').map(x=>x.subject+': '+x.groupName).join('; ');person.teachingLoad=workloads.get(person.id)??0});
  $('deploymentStatus').replaceChildren();renderAfterDeployment();
 }catch(e){if(attempt!==deploymentAttempt||state!==snapshot||!token)return;state.deploymentPending=false;state.deploymentAvailable=false;$('deploymentStatus').textContent='Contacts are ready. '+(/Unknown action/i.test(e.message)?'The published Contacts Apps Script does not support teaching information. Publish the supplied Contacts backend as a new version.':e.message)+' ';const retry=document.createElement('button');retry.textContent='Retry teaching information';retry.onclick=()=>loadDeployment(state);$('deploymentStatus').append(retry);renderAfterDeployment();}
}
function renderAfterDeployment(){renderContacts();if($('signature').classList.contains('active'))renderSignature();}

let dropdownFilters={},auxTables={};
function friendlyFailure(e){const earlier=e?.diagnostics?.length?' Earlier reference: '+e.diagnostics.join(', '):'';return (!e?.diagnosticId&&(['AbortError','TimeoutError'].includes(e?.name)||/aborted|timeout/i.test(e?.message||''))?'The school service took too long to respond. Retry connection.':e?.message||'Connection failed. Retry connection.')+earlier;}
function hasContactDrafts(){return !!dataRequest||!!signatureSettingsDraft||signatureSettingsSaving||newContactIds.size||dataEdits.size||Object.values(auxTables).some(x=>x.dirty||x.edits?.size||x.saving)}
function matchesDropdowns(p){if(deploymentFilterBlocked())return false;
 const levels=dropdownFilters.levels||[],subjects=dropdownFilters.subjects||[];
 if(state.deploymentAvailable&&(levels.length||subjects.length)&&!(p.teachingAssignments||[]).some(a=>(a.subject!=='FT'||subjects.includes('FT'))&&(!levels.length||levels.includes('P'+a.level))&&(!subjects.length||subjects.includes(a.subject))))return false;
 return Object.entries(dropdownFilters).every(([k,selected])=>{
  if(!selected.length||['levels','subjects'].includes(k))return true;
  if(k==='birthday')return selected.includes(String(Number(p.monthOfBirth)));
  if(k==='formTeacher')return !state.deploymentAvailable||selected.some(x=>(p.ftLevels||[]).includes(x));
  if(deploymentFilters[k])return !state.deploymentAvailable||selected.some(x=>(p.memberships?.[k]||[]).includes(x));
  return selected.some(value=>(k==='groups'?p.groups||[]:tokens(valueFor(p,k))).includes(value));
 });
}
function deploymentFilterOptions(key){if(key==='levels'||key==='formTeacher')return ['P1','P2','P3','P4','P5','P6'].map(x=>[x,x]);if(key==='subjects')return (state.subjectHeaders||[]).map(x=>[x,x==='Sci'?'Science':x]);return (state.organisations?.[key]||[]).map(g=>[g.id,g.name]);}

function renderColumnChoices(){
 const choices=$('columnChoices'),key=JSON.stringify([selectedColumns,Object.entries(dropdownFilters).map(([name,values])=>[name,values.length]),!!state.deploymentAvailable]);
 if(choices.gsisRenderKey===key&&!choices.querySelector('.column-menu'))return;choices.gsisRenderKey=key;
 $('columnChoices').innerHTML=columns.map(([key,label])=>'<span class="split-column"><button class="column-choice" data-column="'+key+'" aria-pressed="'+selectedColumns.includes(key)+'">'+label+'</button><button class="column-arrow '+(dropdownFilters[key]?.length?'filtered':'')+'" data-filter-menu="'+key+'" '+((deploymentFilters[key]||key==='formTeacher')&&!state.deploymentAvailable?'disabled':'')+' aria-label="Filter '+label+'" aria-expanded="false">▾'+(dropdownFilters[key]?.length?' '+dropdownFilters[key].length:'')+'</button></span>').join('');
}
function columnChoiceClick(e){
 const menu=e.target.closest('[data-filter-menu]');if(menu){openColumnDropdown(menu);return}const key=e.target.closest('[data-column]')?.dataset.column;if(!key)return;
 if(selectedColumns.includes(key)){if(selectedColumns.length===1){notice('Keep at least one column visible.');return}selectedColumns=selectedColumns.filter(k=>k!==key);}else selectedColumns.push(key);renderContacts();
}
function columnFilterOptions(key){return deploymentFilters[key]||key==='formTeacher'?deploymentFilterOptions(key):key==='birthday'?MONTHS.map((label,i)=>[String(i+1),label]):[...new Set(state.people.flatMap(p=>key==='groups'?p.groups||[]:tokens(valueFor(p,key))))].filter(Boolean).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(v=>[v,v]);}
function openColumnDropdown(button){
 const key=button.dataset.filterMenu,prior=document.querySelector('.column-menu');if(prior){const same=prior.dataset.key===key;prior.remove();if(same)return}
 const values=columnFilterOptions(key);
 const menu=document.createElement('div');menu.className='column-menu';menu.dataset.key=key;menu.innerHTML='<input type="search" placeholder="Find a value…" aria-label="Find filter value"><button type="button" data-reset>Clear selection</button><div class="filter-values">'+values.map(([v,label])=>'<label><input type="checkbox" value="'+esc(v)+'" '+(dropdownFilters[key]?.includes(v)?'checked':'')+'>'+esc(label)+'</label>').join('')+'</div>';button.parentElement.append(menu);button.setAttribute('aria-expanded','true');
 menu.querySelector('input[type=search]').oninput=e=>menu.querySelectorAll('label').forEach(l=>l.hidden=!l.textContent.toLowerCase().includes(e.target.value.toLowerCase()));
 const apply=()=>{const selected=[...menu.querySelectorAll('input[type=checkbox]:checked')].map(i=>i.value);dropdownFilters[key]=selected;const needle=menu.querySelector('input[type=search]').value;renderContacts();const arrow=$('columnChoices').querySelector('[data-filter-menu="'+key+'"]');openColumnDropdown(arrow);const input=document.querySelector('.column-menu input[type=search]');input.value=needle;input.dispatchEvent(new Event('input'));};
 menu.onchange=e=>{if(e.target.type==='checkbox')apply()};menu.querySelector('[data-reset]').onclick=()=>{menu.querySelectorAll('input[type=checkbox]').forEach(i=>i.checked=false);apply()};menu.querySelector('input').focus();
}
document.addEventListener('click',e=>{if(!e.target.closest('.split-column'))document.querySelector('.column-menu')?.remove()});
$('clearDropdowns').onclick=()=>{dropdownFilters={};filters=[];columnFilters={};renderContacts()};
function validatedControl(field,value,lists,attrs,disabled){
 if(field==='EXT')attrs+=' class="compact-ext" size="4"';if(field==='Mobile No')value=value.replace(/\s/g,'').replace(/^(\d{4})(\d{4})$/,'$1 $2');
 if(lists[field])return '<select '+attrs+' '+(disabled?'disabled':'')+'><option value=""></option>'+[...new Set([...lists[field],...(value?[value]:[])])].map(v=>'<option value="'+esc(v)+'" '+(v===value?'selected':'')+'>'+esc(field==='Month of birth'?MONTHS[Number(v)-1]||v:v)+'</option>').join('')+'</select>';
 return '<input '+attrs+' value="'+esc(value)+'" '+(disabled?'readonly':'')+'>';
}
function outsideHRChoices(field,value,lists){return !!value&&Array.isArray(lists[field])&&(['Subject Modifier','Employment Modifier','MK Modifier'].includes(field)?String(value).split(/,\s*/):[value]).some(v=>v&&!lists[field].includes(v));}
function renderStaffGrid(id,data,edits,onEdit,locked=false,append=false){
 const grid=$(id),holder=document.createElement('div');holder.innerHTML='<table class="data-table source-data"><thead><tr>'+data.fields.map(f=>'<th>'+esc(f)+'</th>').join('')+'</tr></thead><tbody>'+data.rows.map(r=>'<tr class="'+((edits.get(r.id+'|'+data.fields.indexOf('Active'))?.value??r.values[data.fields.indexOf('Active')])==='N'?'inactive':'')+'">'+r.values.map((v,i)=>{const key=r.id+'|'+i,value=edits.get(key)?.value??v,outside=outsideHRChoices(data.fields[i],value,data.lists||{});return '<td'+(outside?' class="retained-hr-value" title="Outside published HR choices; value retained"':'')+'>'+validatedControl(data.fields[i],value,data.lists||{},'data-can-edit="'+!!(data.editable&&!r.computed?.[i]&&(id!=='diyGrid'||['Statutory Name','Mobile No'].includes(data.fields[i])))+'" data-person="'+esc(r.id)+'" data-field="'+i+'" aria-label="'+esc(data.fields[i])+'" class="'+(edits.has(key)?'dirty':'')+'"',!data.editable||locked||r.computed?.[i]||id==='diyGrid'&&!['Statutory Name','Mobile No'].includes(data.fields[i]))+'</td>'}).join('')+'</tr>').join('')+'</tbody></table>';
 holder.querySelectorAll('[data-can-edit="true"]').forEach(input=>{const edit=()=>{if(input.readOnly||input.disabled||id==='dataGrid'&&(dataLoading||dataSaving||dataRequest))return;const r=data.rows.find(r=>r.id===input.dataset.person),i=Number(input.dataset.field),key=r.id+'|'+i;const value=data.fields[i]==='Mobile No'?input.value.replace(/\s/g,''):input.value;if(value===r.values[i])edits.delete(key);else edits.set(key,{id:r.id,field:data.fields[i],expected:r.values[i],value});const nameIndex=data.fields.indexOf('TTb Name');if(nameIndex>=0){const profile=Object.fromEntries(data.fields.map((f,j)=>[f,edits.get(r.id+'|'+j)?.value??r.values[j]]));const rule=data.roleRules?.find(x=>x.role===profile.Role);if(rule?.requiredSubject&&!String(profile['Subject Modifier']||'').split(/,\s*/).includes(rule.requiredSubject))profile['Subject Modifier']=[rule.requiredSubject,profile['Subject Modifier']].filter(Boolean).join(', ');const eoIndex=data.fields.indexOf('EO Appt Level'),eo=input.closest('tr').querySelector('[data-field="'+eoIndex+'"]');if(eo)eo.value=rule?.level||'';const target=input.closest('tr').querySelector('[data-field="'+nameIndex+'"]');if(target)target.value=profile['Basic Name']+['Employment Modifier','Subject Modifier','MK Modifier'].map(k=>String(profile[k]||'').split(/,\s*/).filter(Boolean).map(t=>' ('+t+')').join('')).join('');}input.closest('tr').classList.toggle('inactive',(edits.get(r.id+'|'+data.fields.indexOf('Active'))?.value??r.values[data.fields.indexOf('Active')])==='N');input.classList.toggle('dirty',edits.has(key));const cell=input.closest('td'),outside=outsideHRChoices(data.fields[i],value,data.lists||{});cell.classList.toggle('retained-hr-value',outside);cell.title=outside?'Outside published HR choices; value retained':'';onEdit()};input.addEventListener(input.tagName==='SELECT'?'change':'input',edit);if(input.tagName==='SELECT')input.addEventListener('change',()=>{input.scrollIntoView?.({block:'center',inline:'center',behavior:'instant'});input.focus({preventScroll:true});});});
 if(append)grid.querySelector('tbody').append(...holder.querySelector('tbody').children);else grid.replaceChildren(...holder.children);
}
async function loadAux(kind,force=false){
 const prior=auxTables[kind];if(prior?.saving||prior?.flight)return;if(!force&&prior?.data&&(prior.request||prior.dirty||prior.edits?.size||!!prior.data.viewState?.pending===contactViewPending())){renderAux(kind);return}
 if(prior?.request){renderAux(kind);notice('Confirm this pending save before reloading.');return;}
 if(force&&(prior?.dirty||prior?.edits?.size)&&!confirm('Discard this page’s draft and reload saved values?'))return;
 const entry={edits:new Map(),dirty:false,flight:true},owner=state.user.email;auxTables[kind]=entry;$(kind+'Status').textContent='Loading…';
 try{const data=await api(kind);if(state?.user.email!==owner||auxTables[kind]!==entry)return;entry.data=data;entry.rows=structuredClone(data.rows);acceptContactViewState(data);renderAux(kind)}catch(e){if(auxTables[kind]!==entry)return;if(prior?.data){auxTables[kind]=prior;renderAux(kind)}$(kind+'Status').textContent=friendlyFailure(e)+' Retry Reload.'}finally{entry.flight=false}
}
function renderAux(kind){
 const entry=auxTables[kind],data=entry?.data;if(!data)return;const locked=!data.editable||contactViewPending()||entry.saving||!!entry.request;
 $(kind+'Save').hidden=!data.editable;$(kind+'Save').disabled=!!entry.saving||!data.editable||contactViewPending();$(kind+'Add').hidden=!data.editable||['diy','sysFields'].includes(kind);$(kind+'Add').disabled=locked;
 if(kind==='diy'){renderStaffGrid(kind+'Grid',data,entry.edits,()=>{$(kind+'Status').textContent=entry.edits.size+' unsaved cell(s)'},locked);}
 else{$(kind+'Grid').innerHTML='<table class="data-table source-data"><thead><tr>'+data.fields.map(f=>'<th>'+esc(f)+'</th>').join('')+(kind==='sysFields'?'':'<th>Delete</th>')+'</tr></thead><tbody>'+entry.rows.map((r,i)=>'<tr>'+r.map((v,j)=>{
 const attrs='data-row="'+i+'" data-col="'+j+'" aria-label="'+esc(data.fields[j])+'"';let control;
 if(kind==='membership'&&j>=2&&j<=11)control='<input type="checkbox" '+attrs+' '+(v==='1'?'checked':'')+' '+(locked?'disabled':'')+'>';
 else if(kind==='sysFields')control=j===0?esc(v):'<textarea '+attrs+' rows="3" '+(locked||['Day of Birth','Month of birth','Active'].includes(r[0])?'readonly':'')+'>'+esc(v)+'</textarea>';
 else if(kind==='offload'&&j===2)control='<textarea '+attrs+' rows="1" '+(locked?'readonly':'')+'>'+esc(v)+'</textarea>';
 else control=validatedControl(kind==='offload'&&j===0?'Offload Tags':data.fields[j],v,data.lists,attrs,locked);return '<td>'+control+'</td>'}).join('')+(kind==='sysFields'?'':'<td><button data-remove-row="'+i+'" aria-label="Delete row" '+(locked?'disabled':'')+'>×</button></td>')+'</tr>').join('')+'</tbody></table>';
 $(kind+'Grid').querySelectorAll('[data-row]').forEach(input=>{const edit=()=>{if(locked)return;entry.rows[Number(input.dataset.row)][Number(input.dataset.col)]=input.type==='checkbox'?(input.checked?'1':''):input.value;entry.dirty=true;$(kind+'Status').textContent='Unsaved changes'};input.addEventListener(input.type==='checkbox'||input.tagName==='SELECT'?'change':'input',edit)});
 $(kind+'Grid').querySelectorAll('[data-remove-row]').forEach(b=>b.onclick=()=>{entry.rows.splice(Number(b.dataset.removeRow),1);entry.dirty=true;renderAux(kind)});}
 $(kind+'Status').textContent=contactViewPending()?'Viewing saved Contacts. Editing is paused.'+(entry.dirty||entry.edits.size||entry.request?' Your draft is retained.':''):entry.request?(entry.error?entry.error+' ':'')+'Save unconfirmed. Retry the same Save, or Reload to review.':entry.dirty||entry.edits.size?'Unsaved changes':data.editable?'Up to date':'View only';
}
function mergeConfirmedDIY(data){
 const fields={'Statutory Name':'statutoryName','Mobile No':'mobile'};
 for(const row of data.rows||[]){const person=state?.people.find(p=>p.id===row.id);if(!person)continue;for(const [field,key] of Object.entries(fields)){const at=data.fields.indexOf(field);if(at>=0)person[key]=row.values[at];}}
 renderContacts();if($('signature').classList.contains('active'))renderSignature();else{signatureRenderEpoch++;signatureReady=null;$('signatureDownload').disabled=true;}
}
for(const kind of ['diy']){
 $(kind+'Reload').onclick=()=>loadAux(kind,true);
 $(kind+'Add').onclick=()=>{const e=auxTables[kind];if(!e?.data?.editable||contactViewPending()||e.request)return;e.rows.push(e.data.fields.map(()=>''));e.dirty=true;renderAux(kind)};
 $(kind+'Save').onclick=async()=>{const e=auxTables[kind];if(!e?.data?.editable||contactViewPending()||e.saving||!e.dirty&&!e.edits.size)return;e.request=e.request||{requestId:crypto.randomUUID(),...(kind==='diy'?{changes:[...e.edits.values()]}:{kind,revision:e.data.revision,rows:structuredClone(e.rows)})};const owner=state.user.email,authAttempt=loginAttempt;e.saving=true;renderAux(kind);$(kind+'Status').textContent='Saving…';
 let result,confirmed=false;try{result=await api('save-diy',e.request);confirmed=!!result.saved;if(!confirmed)throw Error('Save not confirmed');}catch(err){try{result=await api('save-receipt',{requestId:e.request.requestId});confirmed=!!result.saved;}catch(receiptError){e.confirmationError=friendlyFailure(receiptError);}if(!confirmed){e.error=friendlyFailure(err)+(e.confirmationError?' Confirmation: '+e.confirmationError:'');notice(e.error+' Draft retained.');}}
 if(state?.user.email!==owner||loginAttempt!==authAttempt||auxTables[kind]!==e||!token){e.saving=false;return;}if(confirmed){const submitted=e.request.changes;e.edits.clear();e.dirty=false;e.request=null;e.error='';try{if(result.data)e.data=result.data;else if(result.changed)for(const changed of result.changed){const row=e.data.rows.find(r=>r.id===changed.id);if(row)row.values=e.data.fields.map((k,i)=>changed.values[result.fields?.indexOf(k)??-1]??row.values[i]);}else for(const x of submitted){const row=e.data.rows.find(r=>r.id===x.id),at=e.data.fields.indexOf(x.field);if(row&&at>=0)row.values[at]=x.field==='Mobile No'?x.value.replace(/\s/g,''):x.value;}mergeConfirmedDIY(e.data);e.rows=structuredClone(e.data.rows);notice('Changes saved');}catch(err){notice('Saved · reload the display. Your save is confirmed.');}}e.saving=false;try{renderAux(kind)}catch(err){notice(confirmed?'Saved · reload the display.':err.message)}

 };
}
$('retryLogin').onclick=()=>loginCredential?authenticateContacts(loginCredential):start();
$('signInAgain').onclick=()=>start(true);


let signatureRenderEpoch=0,signatureReady=null,signatureSettingsDraft=null,signatureSettingsSaving=false;
async function renderSignature(){
 const epoch=++signatureRenderEpoch,snapshot=state;signatureReady=null;$('signatureDownload').disabled=true;$('signatureCanvas').hidden=true;$('signatureStatus').textContent='Preparing signature…';
 try{const person=window.GSISSignature.self(state.people,state.user.email),settings=state.signatureSettings||{subjects:window.GSISSignature.defaults(),revision:0};const title=window.GSISSignature.designation(person,settings,state.deploymentAvailable);
  $('signatureIdentity').textContent=person.statutoryName+' | '+title;const staging=document.createElement('canvas'),info=await window.GSISSignature.render(staging,person,settings,state.deploymentAvailable);
  if(epoch!==signatureRenderEpoch||state!==snapshot)return;const canvas=$('signatureCanvas');canvas.width=staging.width;canvas.height=staging.height;canvas.getContext('2d').drawImage(staging,0,0);canvas.hidden=false;signatureReady={person,info};$('signatureDownload').disabled=false;$('signatureStatus').textContent=info.width+' × '+info.height+' px'+(state.deploymentPending?' · Teacher subjects are loading; the preview will update.':!state.deploymentAvailable?' · Published teaching data unavailable; ordinary teachers use Teacher.':' · Uses published deployment.');
 }catch(e){if(epoch===signatureRenderEpoch&&state===snapshot){$('signatureStatus').textContent=e.message;$('signatureIdentity').textContent='';}}
}
$('signatureRetry').onclick=renderSignature;
$('signatureDownload').onclick=async()=>{if(!signatureReady)return;const ready=signatureReady;$('signatureDownload').disabled=true;try{const blob=await window.GSISSignature.png($('signatureCanvas'));if(ready!==signatureReady)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='GSiS-signature-'+ready.person.statutoryName.replace(/[^\p{L}\p{N}._-]+/gu,'-')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){$('signatureStatus').textContent=e.message;}finally{if(ready===signatureReady)$('signatureDownload').disabled=false;}};
function renderSignatureSettings(){
 if(!state?.user.roles.includes('Admin'))return;const settings=state.signatureSettings||{subjects:window.GSISSignature.defaults(),revision:0};
 const draft=signatureSettingsDraft?.owner===state.user.email?signatureSettingsDraft:null,subjects=draft?.subjects||settings.subjects;
 $('signatureSubjectChoices').innerHTML=window.GSISSignature.SUBJECTS.slice().sort((a,b)=>a[1].localeCompare(b[1])).map(([code,name])=>'<label class="checkbox"><input type="checkbox" data-signature-subject="'+esc(code)+'" '+(subjects.includes(code)?'checked ':'')+(signatureSettingsSaving?'disabled':'')+'> '+esc(name)+'</label>').join('');$('signatureSettingsStatus').textContent=draft?'Unsaved signature settings retained.':'';
 $('signatureSettingsSave').disabled=signatureSettingsSaving;
 if(draft&&draft.expectedRevision!==settings.revision){
  const review=document.createElement('button');review.type='button';review.textContent='Review saved signature settings';review.disabled=signatureSettingsSaving;
  review.onclick=()=>{if(signatureSettingsSaving||signatureSettingsDraft!==draft||!confirm('Current saved subjects: '+settings.subjects.join(', ')+'.\nYour selection: '+draft.subjects.join(', ')+'.\nKeep your selection and use the current saved version for your next save?'))return;signatureSettingsDraft=JSON.stringify(draft.subjects.slice().sort())===JSON.stringify(settings.subjects.slice().sort())?null:{...draft,expectedRevision:settings.revision,baseline:settings.subjects.slice()};renderSignatureSettings();};$('signatureSettingsStatus').append(' A newer saved version is available. ',review);
 }
}
$('signatureSubjectChoices').onchange=()=>{
 if(!state?.user.roles.includes('Admin')||signatureSettingsSaving)return;
 const settings=state.signatureSettings||{subjects:window.GSISSignature.defaults(),revision:0},base=signatureSettingsDraft||{owner:state.user.email,expectedRevision:settings.revision,baseline:settings.subjects.slice()},subjects=[...document.querySelectorAll('[data-signature-subject]:checked')].map(x=>x.dataset.signatureSubject);
 signatureSettingsDraft=base.expectedRevision===settings.revision&&JSON.stringify(subjects.slice().sort())===JSON.stringify(base.baseline.slice().sort())?null:{...base,subjects};$('signatureSettingsStatus').textContent=signatureSettingsDraft?'Unsaved signature settings':'';
};
$('signatureSettingsSave').onclick=async()=>{
 if(!state?.user.roles.includes('Admin')||signatureSettingsSaving)return;if(preview){notice('Preview only — signature settings are not saved.');return;}
 const subjects=[...document.querySelectorAll('[data-signature-subject]:checked')].map(x=>x.dataset.signatureSubject),expectedRevision=signatureSettingsDraft?.expectedRevision??state.signatureSettings?.revision??0,owner=state.user.email,authAttempt=loginAttempt,credential=token;
 const valid=()=>authAttempt===loginAttempt&&credential===token&&state?.user.email===owner&&state.user.roles.includes('Admin');signatureSettingsSaving=true;$('signatureSettingsSave').disabled=true;$('signatureSubjectChoices').querySelectorAll('input').forEach(input=>input.disabled=true);
 try{const saved=await api('save-signature-settings',{subjects,expectedRevision});if(!valid())return;state.signatureSettings=saved;signatureSettingsDraft=null;renderSignatureSettings();$('signatureSettingsStatus').textContent='Signature settings saved.';signatureReady=null;}
 catch(e){if(valid()){renderSignatureSettings();$('signatureSettingsStatus').prepend(document.createTextNode(e.message+(e.status===409?' Your selection is retained. Refresh to review the current settings. ':' Retry the same selection. ')));}}
 finally{signatureSettingsSaving=false;const editable=!!token&&!!state?.user.roles.includes('Admin');$('signatureSettingsSave').disabled=!editable;$('signatureSubjectChoices').querySelectorAll('input,button').forEach(input=>input.disabled=!editable);$('signatureSettingsStatus').querySelectorAll('button').forEach(button=>button.disabled=!editable);}
};

window.GSISContactsMobile?.init({
 get:()=>({state,columns,selectedColumns,columnFilters,dropdownFilters,filters,deploymentFilters}),options:columnFilterOptions,
 text:(key,value)=>{columnFilters[key]=value;renderContacts()},
 dropdown:(key,values)=>{dropdownFilters[key]=values;renderContacts()},
 column:key=>columnChoiceClick({target:{closest:selector=>selector==='[data-column]'?{dataset:{column:key}}:null}}),
 reset:()=>{filters=[];columnFilters={};dropdownFilters={};renderContacts()}
});

start();
