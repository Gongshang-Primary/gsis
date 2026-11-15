/** Build isolated v1 assets from the recorded production visual baseline.
 * Source files and the production build are never rewritten by this builder.
 */
import { readFile, writeFile, readdir, mkdir, rm, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import { JSDOM } from 'jsdom';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const modules=JSON.parse(await readFile(path.join(root,'v1/web/modules.json'),'utf8'));
const {gsisBuildLabel}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const defaultOutput=path.join(root,'deliverables/v1/web');
const omitted=/^(?:_worker\.js|_routes\.json|edge-.*|timetable-preparation\..*|timetable-review\..*|system-health\..*)$/;
const forbidden=/https?:\/\/(?:script\.google\.com|script\.googleusercontent\.com)(?:\/|\b)/i;
const productionHosts={ 'gsps-gsis.pages.dev':'contacts','gsps-deploy.pages.dev':'deploy','gsps-layout.pages.dev':'layout','gsps-roster.pages.dev':'roster','gsps-calendar.pages.dev':'calendar','gsps-venues.pages.dev':'venues','gsps-lord.pages.dev':'lord','gsps-overlord.pages.dev':'overlord','gsps-starlord.pages.dev':'starlord'};
const textExtensions=new Set(['.js','.mjs','.html','.css','.json','.svg','.txt','.md']);
export function normaliseReleaseChrome(source, sourceLabel) {
 if(typeof sourceLabel !== 'string' || !/^\d+\.\d+\.\d+[a-z]*$/i.test(sourceLabel)) throw Error('Invalid source build label');
 if(!source.includes('v'+sourceLabel)) return source;
 // Locate current application chrome, then patch only its original text bytes.
 // Serializing the DOM would also rewrite unrelated markup, scripts and URLs.
 const dom=new JSDOM(source,{includeNodeLocations:true});
 try {
  const {document,NodeFilter}=dom.window,edits=[];
  const token=new RegExp('(?<![\\w.-])v'+sourceLabel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\w.-])','g');
  const walker=document.createTreeWalker(document,NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode();node;node=walker.nextNode()) {
   const parent=node.parentElement;
   if(!parent?.closest('title,header,.suite-release,.release-label,.release-version,.app-footer') || parent.closest('script,style,template')) continue;
   const location=dom.nodeLocation(node);
   if(!location) continue;
   const old=source.slice(location.startOffset,location.endOffset),value=old.replace(token,'v1');
   if(value!==old) edits.push([location.startOffset,location.endOffset,value]);
  }
  for(const [start,end,value] of edits.sort((a,b)=>b[0]-a[0])) source=source.slice(0,start)+value+source.slice(end);
  return source;
 } finally { dom.window.close(); }
}
function replaceOnce(source,from,to,label){if(!source.includes(from))throw Error('Visual baseline changed: '+label);return source.replace(from,to);}
function replaceFetch(source,filename){
 let ast;try{ast=parse(source,{ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true});}catch(error){throw Error('Cannot parse browser source '+filename+': '+error.message);}
 const edits=[];
 function visit(node){if(!node||typeof node!=='object')return;if(node.type==='LogicalExpression'&&node.right?.type==='Identifier'&&node.right.name==='fetch')edits.push([node.right.start,node.right.end,'window.GSISV1.fetch']);if(node.type==='CallExpression'&&node.callee?.type==='Identifier'&&node.callee.name==='fetch')edits.push([node.callee.start,node.callee.end,'window.GSISV1.fetch']);for(const [key,value]of Object.entries(node)){if(key==='start'||key==='end')continue;if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}}
 visit(ast);for(const [start,end,value]of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+value+source.slice(end);return source;
}
// Keep the v1 save lifecycle tied to the original durable operation. The legacy
// frontend is copied unchanged; only its built v1 functions are replaced.
function updateContactsRecovery(source) {
 const helpers = [
  function contactAttemptContext(attempt, credential, authAttempt) {
   return !!token && token === credential && loginAttempt === authAttempt && state?.user.email === attempt.owner;
  },
  function contactAttemptOutcome(result, attempt) {
   const receipt = result?.receipt || result;
   if (receipt?.operationId === attempt.requestId) {
    if (receipt.state === 'committed') return 'committed';
    if (receipt.state === 'terminal-not-committed') return 'aborted';
   }
   return result?.state === 'prepared' ? 'prepared' : 'unknown';
  },
  async function settleContactAttempt(attempt, result, credential, authAttempt) {
   if (!contactAttemptContext(attempt, credential, authAttempt) || dataRequest !== attempt) return null;
   const outcome = contactAttemptOutcome(result, attempt);
   if (outcome === 'aborted') {
    dataRequest = null;
    resetContactRecovery();
    const reason = result.receipt?.reason || result.reason;
    return 'Not saved' + (reason ? ' (' + reason + ')' : '') + '. Your unsaved draft is retained. Review it and save as a new operation.';
   }
   if (outcome !== 'committed') return null;
   dataEdits.clear();
   newContactIds.clear();
   dataRequest = null;
   resetContactRecovery();
   try {
    const next = await api('data');
    if (!contactAttemptContext(attempt, credential, authAttempt)) return null;
    contactData = sortContactData(next);
    applyContactSavedRows(contactData.rows);
    renderContacts();
    notice('Contacts saved');
    return 'Saved';
   } catch {
    if (!contactAttemptContext(attempt, credential, authAttempt)) return null;
    contactData = null;
    return 'Saved · reload the display. Your save is confirmed.';
   }
  },
 ];
 const replacements = [
  async function confirmContactSave(attempt, {digest, credential = token, diagnostics = {}} = {}) {
   const budget = 12000, deadline = Date.now() + 27000, authAttempt = loginAttempt;
   let latest = null;
   for (const delay of [0, 1000, 2500]) {
    if (Date.now() + delay + budget > deadline || !contactAttemptContext(attempt, credential, authAttempt)) break;
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (!contactAttemptContext(attempt, credential, authAttempt)) break;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), budget);
    try {
     const result = await api('save-receipt', {requestId: attempt.requestId, ...(digest ? {digest} : {})}, controller.signal);
     if (!contactAttemptContext(attempt, credential, authAttempt)) return null;
     latest = result;
     if (['committed', 'aborted'].includes(contactAttemptOutcome(result, attempt))) return result;
    } catch (error) {
     diagnostics.confirmationError = friendlyFailure(error);
     if (error.status === 401 || error.status === 403) break;
    } finally { clearTimeout(timer); }
   }
   return latest;
  },
  async function showContactRecovery() {
   const attempt = dataRequest;
   if (!attempt || attempt.owner !== state?.user.email || !contactDataEditable() || !token) { resetContactRecovery(); return; }
   if (recoveryBusy || dataSaving) return;
   $('contactRecovery').hidden = false;
   $('contactRecovery').open = true;
   $('recoveryRequests').replaceChildren();
   $('recoveryStatus').textContent = 'Original save ' + attempt.requestId + ' is unconfirmed. Check again reads its receipt. Stop original save can stop a recorded pending save; your draft stays retained until its outcome is known.';
   $('refreshRecovery').disabled = false;
   const button = document.createElement('button');
   button.type = 'button';
   button.dataset.contactsRecoverAttempt = '';
   button.textContent = 'Stop original save';
   button.onclick = () => recoverInterruptedContact(attempt, button);
   $('recoveryRequests').append(button);
  },
  async function recoverInterruptedContact(attempt, button, stop = true) {
   if (recoveryBusy || dataSaving || dataRequest !== attempt || !contactDataEditable() || attempt.owner !== state?.user.email) return;
   const credential = token, authAttempt = loginAttempt;
   recoveryBusy = true;
   dataSaving = true;
   button.disabled = true;
   $('refreshRecovery').disabled = true;
   renderData();
   $('dataGrid').inert = true;
   $('recoveryStatus').textContent = 'Checking original save ' + attempt.requestId + '…';
   let message = '';
   try {
    let result = await api('save-receipt', {requestId: attempt.requestId});
    if (!contactAttemptContext(attempt, credential, authAttempt) || dataRequest !== attempt) return;
    if (stop && contactAttemptOutcome(result, attempt) === 'prepared') {
     result = await api('recover-save', {requestId: attempt.requestId});
     if (!contactAttemptContext(attempt, credential, authAttempt) || dataRequest !== attempt) return;
    }
    message = await settleContactAttempt(attempt, result, credential, authAttempt) || 'The original save is still unconfirmed. Your draft and save ID are retained.';
   } catch (error) {
    if (!contactAttemptContext(attempt, credential, authAttempt) || dataRequest !== attempt) return;
    const diagnostics = {};
    const result = await confirmContactSave(attempt, {credential, diagnostics});
    if (!contactAttemptContext(attempt, credential, authAttempt)) return;
    message = await settleContactAttempt(attempt, result, credential, authAttempt) || friendlyFailure(error) + ' The original save is still unconfirmed. Your draft and save ID are retained.';
   } finally {
    if (contactAttemptContext(attempt, credential, authAttempt)) {
     recoveryBusy = false;
     dataSaving = false;
     renderData();
     $('dataStatus').textContent = message || 'The original save is unconfirmed.';
     $('dataGrid').inert = false;
     syncContactDataControls();
     if (dataRequest === attempt) {
      await showContactRecovery();
      if (contactAttemptContext(attempt, credential, authAttempt) && dataRequest === attempt) $('recoveryStatus').textContent = message + ' Operation: ' + attempt.requestId;
     }
    }
   }
  },
 ];
 const save = async function saveContactsGrid() {
  if (!contactDataEditable() || dataLoading || dataSaving || recoveryBusy || (!dataEdits.size && !newContactIds.size && !dataRequest)) return;
  if (!dataRequest && dataEdits.size + newContactIds.size * 17 > 300) { notice('Save up to 300 changed cells at a time.'); return; }
  const retry = !!dataRequest;
  dataRequest ||= contactSaveAttempt();
  const attempt = dataRequest, credential = token, authAttempt = loginAttempt;
  if (attempt.owner !== state.user.email) { notice('Use the same account to confirm this save.'); return; }
  dataSaving = true;
  renderData();
  $('dataGrid').inert = true;
  $('dataStatus').textContent = 'Saving…';
  let message = '';
  try {
   let result;
   if (retry) {
    result = await api('save-receipt', {requestId: attempt.requestId});
    if (!contactAttemptContext(attempt, credential, authAttempt) || dataRequest !== attempt) return;
   }
   const outcome = contactAttemptOutcome(result, attempt);
   if (!retry || outcome === 'unknown') {
    result = await api('save-data', JSON.parse(attempt.payload));
    if (!contactAttemptContext(attempt, credential, authAttempt) || dataRequest !== attempt) return;
   }
   if (!['committed', 'aborted'].includes(contactAttemptOutcome(result, attempt))) result = await confirmContactSave(attempt, {credential});
   message = await settleContactAttempt(attempt, result, credential, authAttempt) || 'The original save is still unconfirmed. Draft locked; Retry Save changes uses the same save ID.';
  } catch (error) {
   if (!contactAttemptContext(attempt, credential, authAttempt) || dataRequest !== attempt) return;
   const diagnostics = {};
   $('dataStatus').textContent = 'Checking whether your save completed…';
   const result = await confirmContactSave(attempt, {credential, diagnostics});
   if (!contactAttemptContext(attempt, credential, authAttempt)) return;
   message = await settleContactAttempt(attempt, result, credential, authAttempt) || friendlyFailure(error) + (diagnostics.confirmationError ? ' Confirmation: ' + diagnostics.confirmationError : '') + ' Draft locked. Retry Save changes uses the same save ID.';
  } finally {
   if (contactAttemptContext(attempt, credential, authAttempt)) {
    dataSaving = false;
    renderData();
    $('dataStatus').textContent = message || 'The original save is unconfirmed.';
    syncContactDataControls();
    $('dataGrid').inert = false;
    if (dataRequest === attempt) await showContactRecovery();
    queueMicrotask(refreshCatalogueData);
   }
  }
 };
 const ast = parse(source, {ecmaVersion: 'latest', sourceType: 'module'}), edits = [];
 for (const replacement of replacements) {
  const node = ast.body.find(item => item.type === 'FunctionDeclaration' && item.id?.name === replacement.name);
  if (!node) throw Error('Visual baseline changed: Contacts ' + replacement.name);
  edits.push([node.start, node.end, replacement.toString()]);
 }
 const handler = ast.body.find(node => node.type === 'ExpressionStatement' && source.slice(node.start, node.end).startsWith("$('saveData').onclick="));
 if (!handler) throw Error('Visual baseline changed: Contacts save handler');
 edits.push([handler.start, handler.end, save.toString() + "\n$('saveData').onclick=saveContactsGrid;"]);
 for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + value + source.slice(end);
 source = replaceOnce(source, "$('refreshRecovery').onclick=()=>showContactRecovery();", "$('refreshRecovery').onclick=()=>{if(dataRequest)void recoverInterruptedContact(dataRequest,$('refreshRecovery'),false);};", 'Contacts recovery check preserves a prepared save');
 return source + '\n' + helpers.map(fn => fn.toString()).join('\n');
}
function updateContacts(source){
 // EO and authority are accepted records. A display appointment must never create them.
 source=replaceOnce(source,"if(eo)eo.value=rule?.level||'';","if(eo)eo.value=r.values[eoIndex]??'';",'Contacts role-to-EO inference');
 source=source.replaceAll("state?.user.roles.includes('Admin')","(state?.user.roles.includes('Admin')||state?.user.roles.includes('ContactsPowerUser'))");
 source=source.replaceAll("state.user.roles.includes('Admin')","(state.user.roles.includes('Admin')||state.user.roles.includes('ContactsPowerUser'))");
 source=source.replaceAll("r==='Admin'||r==='KP'","r==='Admin'||r==='KP'||r==='ContactsPowerUser'");
 // Application grants are managed by Core, separate from accepted staff records.
 source=replaceOnce(source,"$('addRole').onclick=()=>openRole();","$('addRole').onclick=()=>location.assign('/admin/');",'Contacts Core admin link');
 source=replaceOnce(source,"if(b)openRole(b.dataset.roleEmail);","if(b)location.assign('/admin/');",'Contacts Core access row');
 source=updateContactsRecovery(source);
 source=source.replaceAll('Complete this saved change','Inspect or recover this save').replaceAll('Completing the original save…','Checking durable recovery…');
 source+=`\nwindow.addEventListener('gsis:clear-protected-state',()=>{loginAttempt++;loginAbort?.abort();clearContactsPersonalState();token='';state=null;visible=[];dataSaving=false;dataRequest=null;recoveryBusy=false;resetContactRecovery();$('dataGrid').inert=false;$('contactRows').replaceChildren();$('accessRows').replaceChildren();$('app').classList.add('hidden');});`;
 return source;
}
function updateDeploy(source){
 // The server is authoritative; preventing a forbidden editor here is an extra UX boundary.
 source=replaceOnce(source,"function compact(p){const v=p.profile||{},role=v.Role||p.role||'';return {id:p.id,name:v['Basic Name']||p.basicName||p.name||p.id,role,active:v.Active!=null?v.Active==='Y':p.active===true||p.active==='Y',groups:p.groups||[],mk:!!(p.mk||v['MK Modifier']||(p.groups||[]).includes('MK')||/^MK(?:\\b|E)/i.test(role))};}","function compact(p){const v=p.profile||{},role=v.Role||p.role||'';return {id:p.id,name:v['Basic Name']||p.basicName||p.name||p.id,role,active:p.active===true||p.active==='Y',groups:p.groups||[],authority:p.authority||{},schoolSection:p.schoolSection,mk:String(p.schoolSection?.code||p.schoolSection||'').toLowerCase()==='mk'};}",'Reporting uses accepted section and authority');
 source=replaceOnce(source,"const row=compact({...p,profile:{...p.profile,...d.teacherDrafts?.[p.id]}});by.set(p.id,row);","const authoritySource=(people||[]).find(person=>person.id===p.id)||p;const row=compact({...p,active:authoritySource.active,authority:authoritySource.authority,schoolSection:authoritySource.schoolSection,profile:{...p.profile,...d.teacherDrafts?.[p.id]}});by.set(p.id,row);",'Reporting takes current Contacts authority ahead of embedded planning snapshot');
 source=replaceOnce(source,"return [...by.values()].filter(p=>p.active&&!p.mk&&!(d.membership||[]).some(r=>r[0]===p.role&&r[11]==='1'))","return [...by.values()].filter(p=>p.active&&!p.mk)",'Reporting never infers section from role');
 source=replaceOnce(source,"return {...p,sl:role?role[2]==='1':p.groups.includes('SL'),oso:p.role==='OSO'}","return {...p,sl:p.authority?.schoolLeader?.value===true,oso:p.role==='OSO'}",'Reporting root is explicit accepted School Leader');
 source=replaceOnce(source,"profile['EO Appt Level']=catalog?.level==='0'?'':GSISTeachingRules.group('',catalog?.level||'');","profile['EO Appt Level']=t.profile?.['EO Appt Level']??staffCatalog.get(input.teacher)?.profile?.['EO Appt Level']??'';",'Planning proposals cannot synthesize EO appointment');
 source=replaceOnce(source,"role:profile.Role,groups:catalog?.groups||[],mk:t.mk||''","role:profile.Role,groups:t.groups||[],mk:t.mk||''",'Planning roles cannot synthesize authoritative memberships');

 source=replaceOnce(source,"async function change(operation,args={}){","async function change(operation,args={}){\n if(['setMembership','setMasterOptions','setHRTerms'].includes(operation))throw Error('This catalogue is owned by Contacts. Open Contacts to manage it.');",'Deploy catalogue ownership');
 source=replaceOnce(source,"kp=()=>role.includes('KP')||role.includes('Admin')","kp=()=>window.GSISV1.capable('deploy.edit')",'Deploy current edit capability');
 source=replaceOnce(source,"admin=()=>role.includes('Admin')","admin=()=>window.GSISV1.capable('admin')",'Deploy preview disables administrative mutation controls');
 source=replaceOnce(source,"function canClearVenueAssignments(){const d=v();return admin()&&d?.status==='planning'&&d.publication!=='Published'&&d.publishedRevision==null;}","function canClearVenueAssignments(){const d=v();return admin()&&d?.status==='draft'&&d.publication!=='Published'&&d.publishedRevision==null;}",'Deploy venue controls use the native v1 draft state');
 source=replaceOnce(source,"viewEpoch++;editing={versionId:current,key,clientId,baseline:JSON.stringify(v()),expectedRevision:snapshotCache?.revision,hash:null};return editing;","viewEpoch++;const grant=await api('lease',{versionId:current,scope:key,key,clientId,revision:snapshotCache?.revision,operationId:crypto.randomUUID()});editing={versionId:current,key,scope:key,clientId,token:grant.token,fence:grant.fence,leaseFence:grant.fence,baseline:JSON.stringify(v()),expectedRevision:grant.revision,revision:grant.revision};return editing;",'Deploy owner lease');
 source=replaceOnce(source,"function membershipPage(root){\n const readOnly=false;","function membershipPage(root){\n const readOnly=true;",'Membership reference only');
 source=source.replaceAll("This table defines this version’s roles, memberships and EO mappings. Publishing replaces Contacts’ mappings.","Reference from Contacts. Manage role, membership and EO catalogues in Contacts; Deploy publication does not change them.");
 source=source.replaceAll("(!admin()||fixed.includes(k)?'readonly':'')","('readonly')");
 source=source.replaceAll('if(kp()&&admin())','if(kp())');
 source=source.replaceAll('Purge entire log for this version','Archive audit display').replaceAll('Permanently purge this version’s audit log?','Archive this version’s audit display? Immutable audit and recovery evidence are retained.');
 source=replaceOnce(source,"const id=t?.id||'new-'+crypto.randomUUID(),p=t?plannerProfile(t)","let id=t?.id||'new-'+crypto.randomUUID();const registrationId=crypto.randomUUID(),p=t?plannerProfile(t)",'Contacts owns new Staff IDs');
 source=replaceOnce(source,"selectionEditor(t?'Edit teacher':'Add teacher',body,d=>{const profile=read(d);","selectionEditor(t?'Edit teacher':'Add teacher',body,async d=>{const profile=read(d);",'Asynchronous permanent Staff ID registration');
 source=replaceOnce(source,"queueCell({operation:'upsertTeacherProfile',teacher:id,profile,expected:v().teacherDrafts?.[id]||v().teachers.find(r=>r.id===id)?.profile||null})","if(!t&&id.startsWith('new-')){const registered=await window.GSISV1.request('deploy','/staff/register',{method:'POST',body:{operationId:registrationId,basicName:profile['Basic Name']}});if(registered.state!=='committed'||!(registered.result?.staffId||registered.staffId))throw Error('The permanent staff identity is not yet confirmed. Retry this same registration.');id=registered.result?.staffId||registered.staffId;}queueCell({operation:'upsertTeacherProfile',teacher:id,profile,expected:v().teacherDrafts?.[id]||v().teachers.find(r=>r.id===id)?.profile||null})",'Use confirmed Contacts Staff ID');
 source=source.replaceAll('data-version-action="publish" \'+(!admin()?\'disabled\':\'\')','data-version-action="publish" \'+(!window.GSISV1.capable(\'deploy.publish\')?\'disabled\':\'\')');
 source=source.replaceAll("Choices belong to this version. Publishing replaces Contacts’ choices; other versions keep their own. Existing staff values outside these choices are retained and flagged. Edit roles and EO mappings in Membership.","Reference from Contacts. These accepted catalogue choices are read-only in Deploy. Existing proposed staff values outside the choices remain visible for review.");
 source=source.replaceAll("Defines the levels available in Membership. Each teacher’s level follows their assigned role.","Explicit accepted EO appointment evidence from Contacts.");
 // PG01/PG02 govern version-owned Subject Type edits; legacy Admin-only UI is superseded.
 const subjectAst=parse(source,{ecmaVersion:'latest',sourceType:'script'}),subjectPage=subjectAst.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='subjectTypesPage');
 if(!subjectPage)throw Error('Visual baseline changed: Subject Type view');
 const subjectCode=source.slice(subjectPage.start,subjectPage.end).replaceAll('!admin()',"!window.GSISV1.capable('deploy.edit')").replace('Only Admin can change these settings.','Current Deploy edit access is required.');
 source=source.slice(0,subjectPage.start)+subjectCode+source.slice(subjectPage.end);
 source=replaceOnce(source,"if(x.operation==='setSubjectType'&&!admin()){alert('Only Admin can change Subject Type.');return;}","if(x.operation==='setSubjectType'&&!window.GSISV1.capable('deploy.edit')){alert('Current Deploy edit access is required.');return;}",'Subject Type follows approved Deploy capability');
 source=replaceOnce(source,"tab==='Subject Type'&&admin()","tab==='Subject Type'&&window.GSISV1.capable('deploy.edit')",'Subject Type queued save follows current capability');
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'script'}),publication=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='reviewTeacherPublication');
 if(!publication)throw Error('Visual baseline changed: Deploy publication flow');
 source=source.slice(0,publication.start)+`async function reviewTeacherPublication(){if(queuedEdits().length||unsavedDraft||editing||busy){alert('Save or discard drafts before publishing.');return;}if(!window.GSISV1.capable('deploy.publish')){alert('Current Deploy publication access is required.');return;}await window.GSISV1Publication.open({versionId:current,revision:snapshotCache?.revision,name:v()?.name,onCommitted:()=>refresh(true)});}`+source.slice(publication.end);
 source+=`\nwindow.addEventListener('gsis:clear-protected-state',()=>{stopLive();sessionEpoch++;clearInterval(pollTimer);clearInterval(leaseTimer);clearTimeout(queueTimer);token='';state={versions:[]};current='';snapshotCache=null;acceptedSnapshot=null;staffCatalog=new Map();roleCatalogue=[];cellQueue=[];queueFlight=null;draftBase=null;editing=null;unsavedDraft=false;busy=false;acquiring=false;versionCreateAttempt=null;versionNoteDrafts.clear();exclusionEdits.clear();if(inlineDraftEditor){inlineDraftEditor.open=false;inlineDraftEditor.remove();inlineDraftEditor=null;}el('content').replaceChildren();el('nav').replaceChildren();controls();});`;
 return source;
}
function updateStarlord(source){
 source=replaceOnce(source,"  const CACHE_KEY = 'starlord_board_last_good_v1_3';",`  let CACHE_KEY = null, boardRevision = null, boardDate = '', cachedCandidate = null, accessExpiryTimer = null;
  async function initialiseSignageScope(){
    localStorage.removeItem('starlord_board_last_good_v1_3');
    const token=sessionStorage.getItem('gsis-signage-device');
    const session=token?null:await window.GSISV1.getSession();
    const scope=token?'device:'+token:session?'account:'+session.schoolId+':'+session.user.accountId:null;
    if(!scope)return;
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope))),b=>b.toString(16).padStart(2,'0')).join('');
    CACHE_KEY='starlord_board_v1:'+hash;
    try{const value=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(value&&Array.isArray(value.rows)&&value.date===isoDate(new Date())&&typeof value.revision==='string'){cachedCandidate=value;boardRevision=value.revision;boardDate=value.date;}}catch{localStorage.removeItem(CACHE_KEY);}
  }
  function clearSignageScope(){
    loadGeneration++;activeController?.abort();if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=null;stopStripScroll();
    clearTimeout(accessExpiryTimer);accessExpiryTimer=null;
    window.GSISV1SignagePhotos?.clear();boardData=[];cachedCandidate=null;boardRevision=null;boardDate='';lastSuccessfulAt=0;lastSuccessfulDate='';fetchInFlight=false;
    if(CACHE_KEY)localStorage.removeItem(CACHE_KEY);localStorage.removeItem('starlord_board_last_good_v1_3');
    elements.pastStrip.replaceChildren();elements.activeGrid.replaceChildren();
  }
  window.addEventListener('gsis:clear-protected-state',clearSignageScope);
  window.addEventListener('gsis:signage-access-ended',()=>{clearSignageScope();setFeedStatus('Display access expired or was revoked. Enter a current device token.',true);});`,'STARLORD device-bound private cache');
 source=replaceOnce(source,"  function start() {\n    restoreLastGood();","  async function start() {\n    await initialiseSignageScope(); // A fresh server decision precedes any persisted display.\n",'STARLORD verifies scope before cached display');
 source=replaceOnce(source,"localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), date: payload.date || isoDate(new Date()), rows }));","if(CACHE_KEY)localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), date: payload.date || isoDate(new Date()), revision:boardRevision, rows }));",'STARLORD records scoped revision');
 source=replaceOnce(source,"${forceRefresh ? '&forceRefresh=1' : ''}","${forceRefresh ? '&forceRefresh=1' : ''}${boardRevision&&boardDate===requestedDate?'&since='+encodeURIComponent(boardRevision):''}",'STARLORD validates current authority and date before cache reuse');
 source=replaceOnce(source,"const error=new Error('The booking feed is unavailable.');","const error=new Error('The booking feed is unavailable.');error.signageAccessDenied=response.status===401||response.status===403;",'STARLORD distinguishes revoked access from outage');
 source=replaceOnce(source,"      const rows = normalisePayload(payload);",`      if(payload.date!==requestedDate||(payload.unchanged===true&&(boardDate!==requestedDate||boardRevision!==payload.revision))){clearSignageScope();setFeedStatus('Display date or revision could not be verified. Refresh this display.',true);return;}
      if(Number.isFinite(payload.validUntil)){
        clearTimeout(accessExpiryTimer);
        const expire=()=>{const remaining=payload.validUntil-Date.now();if(remaining<=0)window.dispatchEvent(new CustomEvent('gsis:signage-access-ended'));else accessExpiryTimer=setTimeout(expire,Math.min(remaining,2147483647));};
        if(payload.validUntil<=Date.now()){expire();return;}
        expire();
      }
      const rows = payload.unchanged===true?(cachedCandidate?.rows||boardData):normalisePayload(payload);boardRevision=payload.revision||null;boardDate=requestedDate;cachedCandidate=null;`,'STARLORD cached rows require validated date/revision and bounded access');
 source=replaceOnce(source,"      console.error(error);","      if(error.signageAccessDenied){clearSignageScope();setFeedStatus('Display access expired or was revoked. Enter a current device token.',true);return;}\n      console.error(error);",'STARLORD revocation clears private rows');
 source=replaceOnce(source,'data-booking-card>','data-booking-card data-gsis-booking="${escapeHtml(row.bookingId)}">','STARLORD photo target identity');
 source=replaceOnce(source,"    rebuildStripScroll();\n  }\n\n  function normaliseMovementState","    rebuildStripScroll();\n    window.GSISV1SignagePhotos?.update(rows);\n  }\n\n  function normaliseMovementState",'STARLORD private photo projection');
 source=replaceOnce(source,"  start();","  start().catch(()=>{clearSignageScope();setFeedStatus('Display access could not be verified.',true);});",'STARLORD initialization failure stays private');
 return source;
}
function updateRosterCapacity(source){
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'script'}),matches=[];
 function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name==='healthSummary')matches.push(node);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
 walk(ast);if(matches.length!==1)throw Error('Roster health renderer baseline changed');
 const node=matches[0];return source.slice(0,node.start)+'function healthSummary(s,h){return window.GSISV1RosterCapacity.render(s,h);}' +source.slice(node.end);
}
function transform(module,rel,text){
 for(const [host,id]of Object.entries(productionHosts))text=text.replaceAll('https://'+host+'/', '/'+id+'/').replaceAll('https://'+host, '/'+id+'/');
 for(const id of ['contacts','deploy','roster','calendar','layout','venues','lord','overlord','starlord'])text=text.replaceAll('https://'+id+'.gsps.edu.sg/', '/'+id+'/').replaceAll('https://'+id+'.gsps.edu.sg','/'+id+'/');
 if(rel.endsWith('.html')){
  text=text.replace(/\b(src|href|action)=(['"])\/(?!\/|api\/)([^'"]*)\2/g,(_m,key,q,value)=>`${key}=${q}/${module.id}/${value}${q}`);
  text=text.replace('</head>',`<meta name="gsis-module" content="${module.id}"><link rel="stylesheet" href="/v1/shared/suite.css"><script src="/v1/shared/client.js"></script><script defer src="/v1/shared/module-shell.js"></script><link rel="stylesheet" href="/v1/shared/core-table.css"><script type="module" src="/v1/shared/core-table.js"></script></head>`);
  text=normaliseReleaseChrome(text,gsisBuildLabel).replaceAll('Dropdown choices are managed in Deploy.','Dropdown choices and accepted staff facts are managed in Contacts.').replaceAll('Admin access is managed in the backend sheet. Admins can assign or remove SMC access here.','Application access is managed in Core. Accepted SMC, EO and School Leader records are managed separately in Contacts.');
  if(module.id==='contacts'&&rel==='index.html')text=text.replace('</head>','<link rel="stylesheet" href="/v1/shared/contacts-ui.css"><script defer src="/v1/shared/contacts-ui.js"></script></head>');
  if(module.id==='deploy'&&rel==='index.html')text=text.replace('</head>','<script defer src="/v1/shared/deploy-ui.js"></script><script defer src="/v1/shared/deploy-ui-tables.js"></script></head>');
  if(module.id==='roster'&&rel==='index.html')text=text.replace('</head>','<link rel="stylesheet" href="/v1/shared/roster-capacity.css"><script src="/v1/shared/roster-capacity.js"></script><link rel="stylesheet" href="/v1/shared/roster-stapler-resize.css"><script defer src="/v1/shared/roster-stapler-resize.js"></script><script defer src="/v1/shared/roster-table-ui.js"></script></head>');
  if(module.id==='calendar'&&rel==='index.html')text=text.replace('</head>','<link rel="stylesheet" href="/v1/shared/calendar-ui.css"><script type="module" src="/v1/shared/calendar-ui.js"></script></head>');
  if(module.id==='contacts'&&rel==='index.html')text=text.replace('</body>','<script type="module" src="/v1/shared/contacts-authority.js"></script><script type="module" src="/v1/shared/contacts-catalogues.js"></script></body>');
  if(module.id==='roster'&&rel==='index.html')text=text.replaceAll('/roster/system-health.html','/admin/#health').replace('</body>','<script type="module" src="/v1/shared/roster-import.js"></script><script type="module" src="/v1/shared/roster-policy-ledger.js"></script><script type="module" src="/v1/shared/roster-continuity.js"></script></body>');
  if(module.id==='layout'&&rel==='index.html')text=text.replace('</body>','<script type="module" src="/v1/shared/layout-editor.js"></script></body>');
  if(module.id==='deploy'&&rel==='index.html')text=text.replace('</body>','<script type="module" src="/v1/shared/deploy-publication.js"></script></body>');
  if(module.id==='lord'&&rel==='index.html')text=text.replace('</body>','<script type="module" src="/v1/shared/lord-user.js"></script></body>');
  if(module.id==='starlord'&&rel==='index.html')text=replaceOnce(text,'<script src="assets/app.js','<script src="/v1/shared/starlord-photos.js"></script><script src="assets/app.js','STARLORD photo adapter before source renderer');
  if(module.id==='overlord'&&rel==='index.html')text=replaceOnce(text,'<script src="assets/app.js','<script src="/v1/shared/lord-reference-tables.js"></script><script src="/v1/shared/reign.js"></script><script src="/v1/shared/lord-admin.js"></script><script src="assets/app.js','OVERLORD exact viewed revision adapter').replace('</body>','<script type="module" src="/v1/shared/signage.js"></script></body>');
 }
 if(rel.endsWith('.js')&&!rel.includes('vendor/')&&!/\.min\.js$/.test(rel)){
  if(module.id==='starlord'&&rel==='assets/app.js')text=updateStarlord(text);
  if(module.id==='lord'&&rel==='assets/app.js'){
   text=text.replaceAll('<strong>Bookings cannot be edited.</strong> If any detail is wrong, cancel the booking and make a new booking.','<strong>Bookings can be revised before collection.</strong> Use Edit my bookings to revise a saved booking. You can also cancel and make a new booking.');
   text+=`\nwindow.addEventListener('gsis:clear-protected-state',()=>{state.referenceGeneration++;resetStateKeepTeacher(false);state.auth.session=null;state.reference=null;state.identity.teacher='';main.replaceChildren();});`;
   text=replaceOnce(text,"try { await lordFetch('/api/auth/logout', { method: 'POST', timeoutMs: 8000 }); } catch {}","try { await window.GSISV1.logout();location.assign('/');return; } catch(error) {setReloadDataStatus(error.message,true);return;}",'LORD sign-out must be confirmed');
   text=replaceOnce(text,"bookingId: state.loan.booking?.bookingId || '',","bookingId: state.loan.booking?.bookingId || '', revision:state.loan.booking?.revision,",'LORD collection preview revision');
   text=replaceOnce(text,"sessionId: state.return.selectedSession.sessionId,","sessionId: state.return.selectedSession.sessionId, bookingId:state.return.selectedSession.bookingId, revision:state.return.selectedSession.revision,",'LORD return preview revision');
   text=replaceOnce(text,"async function submitBookingResponse(payload,context) {","async function submitBookingResponse(payload,context) {\n  payload={...payload,revision:payload.revision??context.booking.revision};",'LORD explicit declaration preview revision');
  }
  if(module.id==='contacts'&&rel==='app.js')text=updateContacts(text);
  if(module.id==='venues'&&rel==='app.js'){
   text=replaceOnce(text,"finally{location.assign('/cdn-cgi/access/logout');}","catch(error){setStatus(error.message,'warning');return;}location.assign('/');",'Venues confirms shared sign-out');
   text=replaceOnce(text,"setInterval(()=>{updateNow();","window.addEventListener('gsis:clear-protected-state',()=>{state.bootEpoch++;state.bookingEpoch++;state.actor=null;state.occurrences.clear();state.transfers.clear();state.snapshot=null;state.selection=null;state.note='';$('#main').replaceChildren();});setInterval(()=>{updateNow();",'Venues clears protected source responses');
   text=replaceOnce(text,"const close=state.closures.find", "const epoch=Date.parse(date+'T00:00:00+08:00');if((state.source.pendingScopes||[]).some(scope=>related(scope.venueId)&&scope.start<epoch+slot.end*60000&&scope.end>epoch+slot.start*60000))return {kind:'closed',label:'Source update pending'};\n  const close=state.closures.find",'Venue source fence applies to exact room interval');
   text=text.replaceAll("VenuesAPI.read({operation:'bootstrap'","VenuesAPI.read({operation:'bootstrap',from:state.date,to:new Date(Date.parse(state.date)+30*86400000).toISOString().slice(0,10)");
   text=text.replaceAll("VenuesAPI.read({operation:'piece',key})","VenuesAPI.read({operation:'piece',key,from:state.manifest.from,to:state.manifest.to})");
   text=replaceOnce(text,"async function loadBookings(from,to,options={}){safeDates(from,to);", "async function loadBookings(from,to,options={}){safeDates(from,to);if(state.actor&&state.cache&&(!state.manifest||state.date<state.manifest.from||state.date>state.manifest.to)){const next=await VenuesAPI.read({operation:'manifest',from:state.date,to:new Date(Date.parse(state.date)+30*86400000).toISOString().slice(0,10)});state.manifest=next.manifest;state.source=next.source;if(next.manifest?.status==='ready'){state.snapshot=await state.cache.activate(next.manifest,key=>VenuesAPI.read({operation:'piece',key,from:next.manifest.from,to:next.manifest.to}));state.periods=state.snapshot.periods;}}",'Bounded venue occupancy window navigation');
  }
  if(module.id==='overlord'&&rel==='assets/app.js'){text=replaceOnce(text,'async function openReign(){',"async function openReign(){return window.GSISV1Reign.open();",'Native LORD verified archive and cleanup');text=replaceOnce(text,'async function openBackgroundWork(){',"async function openBackgroundWork(){return window.GSISV1LordBackground.open();",'Native LORD background controls');text=replaceOnce(text,'async function openSystemSettings(){',"async function openSystemSettings(){return window.GSISV1LordSettings.open();",'Native LORD owner settings');const grant=text.match(/  grant\.onclick=async\(\)=>\{[\s\S]*?\n  \};\n  \$\('reloadDataBtn'\)/);if(!grant)throw Error('OVERLORD Core administration source changed');text=text.replace(grant[0],"  grant.onclick=()=>location.assign('/admin/');grant.disabled=false;candidate.hidden=true;document.querySelector('label[for=adminCandidate]')?.remove();grant.textContent='Manage Core access';\n  $('reloadDataBtn')");text=text.replace("$('openBackgroundSettings').onclick=openBackgroundWork;","$('openBackgroundSettings').onclick=()=>window.GSISV1LordBackground.open();");text=text.replaceAll('Read latest from Sheets','Refresh Contacts references');text=text.replaceAll('Archive records through today, preserve future bookings and their dependent records, then compact the transactional sheets without altering backend structure.','Close the current period through today and create verified private archives. Immutable records are retained; future bookings remain live.').replaceAll('Archive files are created and verified before eligible rows are cleared. Future and unclassifiable records stay live; reference/config sheets and Photos are untouched.','Private JSON, Markdown and HTML archives are verified before the period closes. Immutable records, future bookings and photographs are retained.').replaceAll('Files created in the backend Drive folder','Verified private archive files');}
  if(module.id==='roster'&&rel==='roster.js'){text=replaceOnce(text,"});start();\n})();","});window.addEventListener('gsis:clear-protected-state',()=>{clear();pending=null;busy=false;});start();\n})();",'Roster drops old session work');text=replaceOnce(text,"payload:{...meta,model,workbook:btoa(binary),revision:profile.revision,requestId:crypto.randomUUID()}","payload:{...meta,model,...await window.GSISV1RosterMapping(model),workbook:btoa(binary),revision:profile.revision,requestId:crypto.randomUUID()}",'Explicit timetable Staff ID and Venue ID mapping');text=replaceOnce(text,"if(!Number.isInteger(result?.revision)||!Array.isArray(result.entries))","if(result?.state==='pending')throw Error('Source validation is pending ('+(result.validatedChunks??0)+' of '+(result.totalChunks??'?')+' batches). Retry the same save to continue.');if(result?.state!=='committed'&&result?.receipt?.state!=='committed')throw Error('The save outcome is not confirmed. Check or retry the original operation.');if(!Number.isInteger(result?.revision)||!Array.isArray(result.entries))",'Roster durable receipt precedes saved display');}
  if(module.id==='calendar'&&rel==='app.js'){
   text=replaceOnce(text,"  function clearCalendarOwnerState() {","  window.addEventListener('gsis:clear-protected-state',()=>{clearCalendarOwnerState();yearCache.clear();viewMemory.clear();state.data=null;state.pendingMutation=null;showLogin();});\n  function clearCalendarOwnerState() {",'Calendar session epoch clears protected work');
   text=replaceOnce(text,"const FRONTEND_VERSION = '0.9.9';","const FRONTEND_VERSION = '1.0';",'Calendar v1 transport version');
   text=replaceOnce(text,"const birthdaysBtn = $('pullBirthdaysBtn');","const birthdaysBtn = $('pullBirthdaysBtn');birthdaysBtn.textContent='Update birthdays from Contacts'+(state.data.pendingBirthdays?.length?' ('+state.data.pendingBirthdays.length+' pending changes)':'');",'Released birthday changes remain explicit');
   text=replaceOnce(text,"archivePreview.selections,","archivePreview.selections, previewDigest:archivePreview.previewDigest, confirm:$('archiveAcknowledge').checked,",'Calendar archive binds displayed preview');
   text=replaceOnce(text,"target: wipePreview.target,\n          year: wipePreview.year,","target: wipePreview.target, previewDigest:wipePreview.previewDigest, confirm:$('wipeAcknowledge').checked,\n          year: wipePreview.year,",'External calendar clear binds displayed preview');
   text=text.replaceAll('Export selected Year + Status combinations into a standalone\n            0.9.7-compatible Google Spreadsheet in the configured Shared Drive\n            folder, verify it, then eject that year-scoped operational data\n            from the working workbook.','Archive selected Year + Status combinations as a verified private JSON snapshot. Immutable owner records and history are retained. A separate Drive continuity export is queued.').replaceAll('The live Years row is retained as an ARCHIVED pointer to the\n            archive workbook. Events, DayNotes and YearStructure for the\n            selected year(s) are removed only after archive verification succeeds.','The year is marked ARCHIVED after its private snapshot is verified. Events, DayNotes and YearStructure remain recoverable from owner history.').replaceAll('Creating and verifying standalone archive workbook…','Creating and verifying the private archive…').replaceAll('Archive verified and live backend cleaned.','Archive verified and owner history retained.');
   text=replaceOnce(text,'`Archive complete: ${result.fileName}`','`Archive complete: ${result.fileName}. History retained; Drive export ${result.driveExport||\'pending\'}.`','Calendar archive delivery status');
   text=replaceOnce(text,"          } catch (err) {\n            hideWorkOverlay();\n            toast(err.message, true);\n            $('archiveCommitBtn').disabled = false;","            if(result.downloadUrl){const target=new URL(result.downloadUrl,location.origin);if(target.origin!==location.origin||!target.pathname.startsWith('/api/calendar/archive-download'))throw Error('Archive download reference is invalid.');const link=document.createElement('a');link.href=target.href;link.download=result.fileName;link.textContent='Download verified JSON archive';($('archivePreviewHost')||document.body).append(link);}\n          } catch (err) {\n            hideWorkOverlay();\n            toast(err.message, true);\n            $('archiveCommitBtn').disabled = false;",'Calendar verified private archive download');
   text=replaceOnce(text,'<input name="UserAlias" required value="${esc(p.userAlias || \'\')}" placeholder="e.g. song.wee">','<select name="TargetAccountId" required><option value="">Choose a verified account…</option></select>', 'Calendar account picker');
   text=replaceOnce(text,"    $('personForm').addEventListener('submit', async ev => {","    window.GSISV1.request('calendar','/accounts').then(result=>{const picker=$('personForm')?.elements.TargetAccountId;if(!picker)return;const accounts=result.accounts||result.rows||result;for(const account of accounts){const option=new Option(account.email+' · '+account.accountId,account.accountId);option.dataset.alias=account.email.split('@')[0];picker.append(option);}if(person?.accountId)picker.value=person.accountId;}).catch(error=>toast(error.message,true));\n    $('personForm').addEventListener('submit', async ev => {",'Calendar account lookup');
   text=replaceOnce(text,"          UserAlias: f.get('UserAlias'),","          UserAlias: form.elements.TargetAccountId.selectedOptions[0].dataset.alias, targetAccountId:f.get('TargetAccountId'),",'Calendar stable account binding');
   text=text.replace("String(f.get('UserAlias')).trim().toLowerCase()===String(person?.userAlias||'').toLowerCase()?expectedMetadataRevision:'missing'","String(f.get('TargetAccountId'))===String(person?.accountId||'')?expectedMetadataRevision:'missing'");
  }
  if(module.id==='roster')text=text.replaceAll('href="/archive.html"','href="/roster/archive.html"');
  if(module.id==='roster'&&rel==='roster-settings-ui.js'){
   for(const attr of ['data-workload-rules','data-consecutive-rules','data-consecutive-exclusions','data-preferences','data-default-preferences'])text=text.replaceAll(attr+' class=',attr+' hidden class=').replaceAll(attr+'>',attr+' hidden>');
   text=text.replaceAll('Annual R utilisation is first by default; same subject is last by default.','Layer settings below use daily capacity first by default.');
   text=text.replaceAll('<h4>Business preferences</h4>','<h4>Allocation layers</h4><p>Use Allocation layers and duties done below for the current per-layer limits, subject continuity and preference order. These settings replace the older annual-utilisation preferences.</p>');
  }
  if(module.id==='roster'&&rel==='roster-operations-ui.js')text=updateRosterCapacity(text);
  if(module.id==='deploy'&&rel==='app.js')text=updateDeploy(text);
  if(module.id==='deploy'&&rel==='teaching-rules.js'){
   text=replaceOnce(text,"if(Array.isArray(catalogue)){p['EO Appt Level']=rule?String(rule.level||''):'';out.groups=rule?memberships(rule.role,rule.level,rule.groups):[];}","out.groups=(live&&live.groups||t.groups||[]).slice();out.authority=live&&live.authority||t.authority||{};",'Accepted Contacts facts remain authoritative');
   const syntax=parse(text,{ecmaVersion:'latest',sourceType:'script'}),matches=[];function walk(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration'&&node.id?.name==='eligible')matches.push(node);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}walk(syntax);if(matches.length!==1)throw Error('Teaching eligibility baseline changed');const node=matches[0];text=text.slice(0,node.start)+"function eligible(t){return t.authority?.eo?.value===true&&t.active!==false&&t.profile?.Active!=='N'&&t.schoolSection!=='mk'&&!t.mk;}"+text.slice(node.end);
  }
  text=replaceFetch(text,module.id+'/'+rel);
  text=text.replace(/(['\"`])\/(?!api\/|v1\/|contacts\/|deploy\/|roster\/|calendar\/|layout\/|venues\/|lord\/|overlord\/|starlord\/)([a-zA-Z0-9_./-]+\.(?:html|js|css|svg|png|webp|ico)(?:\?[^'\"`]*)?)\1/g,(_all,q,value)=>q+'/'+module.id+'/'+value+q);
  text=text.replaceAll("hd:'gsps.edu.sg'","hd:window.GSISV1.config?.hostedDomain,nonce:window.GSISV1.config?.nonce");
  text=text.replaceAll("'/archive.html'","'/roster/archive.html'").replaceAll('contacts.gsps.edu.sg','GSiS Contacts').replaceAll('Reading the latest data from Sheets…','Reading the latest bookings…');
  // Avoid obsolete setup advice even when a failed call reaches legacy error presentation.
  text=text.replaceAll('Check APPS_SCRIPT_URL and publish the supplied Contacts backend as a new version.','Ask an administrator to check the v1 Contacts service.').replaceAll('Check the Contacts frontend APPS_SCRIPT_URL and published backend version.','Check the v1 Contacts service.').replaceAll('The published Contacts Apps Script does not support teaching information. Publish the supplied Contacts backend as a new version.','The Contacts service did not supply teaching information. Check the service connection.');
 }
 if(forbidden.test(text))throw Error('Forbidden Apps Script endpoint in v1 browser asset '+module.id+'/'+rel);
 return text;
}
export async function buildWeb(output=defaultOutput){
 output=path.resolve(output);if(!(output.startsWith(path.join(root,'deliverables/v1')+path.sep)||output.startsWith('/tmp/')))throw Error('Unsafe output directory');
 await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});const inventory=[];
 for(const module of modules){
  async function walk(dir,relative=''){for(const entry of await readdir(dir,{withFileTypes:true})){const rel=path.join(relative,entry.name);if(omitted.test(entry.name)||entry.name.startsWith('.'))continue;const src=path.join(dir,entry.name),dest=path.join(output,module.id,rel);if(entry.isDirectory()){await walk(src,rel);continue;}if(!entry.isFile())continue;await mkdir(path.dirname(dest),{recursive:true});const bytes=await readFile(src);let content=bytes;if(textExtensions.has(path.extname(rel)))content=Buffer.from(transform(module,rel.replaceAll(path.sep,'/'),bytes.toString('utf8')));await writeFile(dest,content);inventory.push({path:module.id+'/'+rel.replaceAll(path.sep,'/'),source:path.relative(root,src),sha256:createHash('sha256').update(content).digest('hex'),bytes:content.length});}}
  await walk(path.join(root,module.source));
 }
 async function overlay(source,relative=''){for(const entry of await readdir(source,{withFileTypes:true})){const rel=path.join(relative,entry.name),src=path.join(source,entry.name);if(entry.isDirectory()){await overlay(src,rel);continue;}const dest=path.join(output,rel);await mkdir(path.dirname(dest),{recursive:true});await copyFile(src,dest);}}
 await overlay(path.join(root,'v1/web/overlays'));
 await mkdir(path.join(output,'v1/shared'),{recursive:true});
 for(const entry of await readdir(path.join(root,'v1/web/shared'),{withFileTypes:true})){if(!entry.isFile())continue;await copyFile(path.join(root,'v1/web/shared',entry.name),path.join(output,'v1/shared',entry.name));}
 await writeFile(path.join(output,'v1/modules.json'),JSON.stringify(modules.map(({source,...module})=>module))+'\n');
 const finalAssets=[];const sources=new Map(inventory.map(item=>[item.path,item.source]));
 async function finalWalk(dir,relative=''){for(const entry of await readdir(dir,{withFileTypes:true})){const rel=path.join(relative,entry.name),file=path.join(dir,entry.name);if(entry.isDirectory()){await finalWalk(file,rel);continue;}const bytes=await readFile(file);const relpath=rel.replaceAll(path.sep,'/');finalAssets.push({path:relpath,source:sources.get(relpath)||'v1/web/',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});}}
 await finalWalk(output);finalAssets.sort((a,b)=>a.path.localeCompare(b.path));
 await writeFile(path.join(output,'asset-manifest.json'),JSON.stringify({schemaVersion:1,sourceBaseline:'27fa498657965169b9d971a9caabc33c8b19bc69',modules:modules.map(x=>x.id),assets:finalAssets},null,2)+'\n');
 return {output,assets:finalAssets.length,modules:modules.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildWeb(process.argv[2])));
