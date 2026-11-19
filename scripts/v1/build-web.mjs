/** Build isolated v1 assets from the recorded production visual baseline.
 * Source files and the production build are never rewritten by this builder.
 */
import { readFile, writeFile, readdir, mkdir, rm, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from 'acorn';
import { JSDOM } from 'jsdom';
import { CONTACT_GRID_SCHEMA } from '../../v1/services/contacts/grid-projection.mjs';
import { previewTTb } from '../../v1/contacts/direct-fields.mjs';
import { removeRosterQuietMode } from './remove-roster-quiet-mode.mjs';
import { RELEASE_LABEL } from '../../v1/release.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const modules=JSON.parse(await readFile(path.join(root,'v1/web/modules.json'),'utf8'));
const {gsisBuildLabel}=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));
const defaultOutput=path.join(root,'deliverables/v1/web');
const omitted=/^(?:_worker\.js|_routes\.json|edge-.*|timetable-preparation\..*|timetable-review\..*|system-health\..*)$/;
const forbidden=/https?:\/\/(?:script\.google\.com|script\.googleusercontent\.com)(?:\/|\b)/i;
const productionHosts={ 'gsps-gsis.pages.dev':'contacts','gsps-deploy.pages.dev':'deploy','gsps-layout.pages.dev':'layout','gsps-roster.pages.dev':'roster','gsps-calendar.pages.dev':'calendar','gsps-venues.pages.dev':'venues','gsps-lord.pages.dev':'lord','gsps-overlord.pages.dev':'overlord','gsps-starlord.pages.dev':'starlord'};
const textExtensions=new Set(['.js','.mjs','.html','.css','.json','.svg','.txt','.md']);
export function normaliseReleaseChrome(source, sourceLabel, {ensureHeaderLabel = false, labelTitle = false} = {}) {
 if(typeof sourceLabel !== 'string' || !/^\d+\.\d+\.\d+[a-z]*$/i.test(sourceLabel)) throw Error('Invalid source build label');
 if(!source.includes('v'+sourceLabel) && !source.includes('data-gsis-release') && !ensureHeaderLabel && !labelTitle) return source;
 // Locate current application chrome, then patch only its original text bytes.
 // Serializing the DOM would also rewrite unrelated markup, scripts and URLs.
 const dom=new JSDOM(source,{includeNodeLocations:true});
 try {
  const {document,NodeFilter}=dom.window,edits=[];
  const markers=[...document.querySelectorAll('[data-gsis-release]')];
  const token=new RegExp('(?<![\\w.-])v'+sourceLabel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\w.-])','g');
  const walker=document.createTreeWalker(document,NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode();node;node=walker.nextNode()) {
   const parent=node.parentElement;
   if(!parent?.closest('title,header,.suite-release,.release-label,.release-version,.app-footer') || parent.closest('script,style,template')) continue;
   const location=dom.nodeLocation(node);
   if(!location) continue;
   const old=source.slice(location.startOffset,location.endOffset);
   let value=old.replace(token,RELEASE_LABEL);
   if((markers.length || labelTitle) && parent.tagName==='TITLE' && !value.includes(RELEASE_LABEL)) value+=' · '+RELEASE_LABEL;
   if(value!==old) edits.push([location.startOffset,location.endOffset,value]);
  }
  for(const marker of markers) {
   const location=dom.nodeLocation(marker);
   if(!location?.startTag || !location.endTag || marker.childNodes.length) throw Error('Release marker must be an empty source element');
   edits.push([location.startTag.endOffset,location.endTag.startOffset,RELEASE_LABEL]);
  }
  if(ensureHeaderLabel) {
   const anchor=document.querySelector('header .product, header .product-name, header h1');
   const location=anchor && dom.nodeLocation(anchor);
   if(!location?.endTag) throw Error('Application release header is missing');
   edits.push([location.endTag.startOffset,location.endTag.startOffset,
    ' <small data-gsis-release style="font-size:0.55em;font-weight:400;white-space:nowrap">'+RELEASE_LABEL+'</small>']);
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
   window.GSISContactsEditor.markSignatureStale();
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
  if (!dataRequest) { try { window.GSISContactsEditor.validateDraft(); } catch(error) { notice(error.message); return; } }
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
function updateContactsClassificationViews(source) {
 const refresh = async function refreshClassificationViews({staffId,expectedRevision}={}) {
  const outcome=(directory,grid,reason,revision=null)=>({directory,grid,revision,...(reason?{reason}: {})});
  if(preview||!token||!state||!window.GSISV1.capable('contacts.manage'))return outcome('unavailable','unavailable','Current Contacts management access is required.');
  if(staffId!==undefined&&(typeof staffId!=='string'||!Number.isSafeInteger(expectedRevision)))return outcome('unavailable','unavailable','The staff revision is not verified.');
  const epoch=++classificationViewEpoch,credential=token,authAttempt=loginAttempt,owner=state.user.email,before=state,gridBefore=contactData;
  const valid=()=>epoch===classificationViewEpoch&&credential===token&&authAttempt===loginAttempt&&state?.user.email===owner&&window.GSISV1.capable('contacts.manage');
  const pending=()=>loading||dataSaving||dataRequest||dataLoading||dataFlight||recoveryBusy||contactViewPending()||Object.values(auxTables).some(entry=>entry.request||entry.saving||entry.flight);
  if(pending())return outcome('deferred','deferred','A native Contacts read or save is in progress; its original draft and operation are retained.');
  try{
   const next=await api('bootstrap');
   if(!valid())return outcome('unavailable','unavailable','The active Contacts account changed.');
   if(state!==before||pending())return outcome('deferred','deferred','Native Contacts changed while refreshing; its current draft is retained.');
   const fields=before.fields,id=record=>record?.staffId||record?.id,uniqueIds=records=>records.every(record=>typeof id(record)==='string'&&id(record)&&(!record.staffId||!record.id||record.staffId===record.id))&&new Set(records.map(id)).size===records.length;
   if(!Array.isArray(fields)||!window.GSISContactsEditor.validProjection(next)||new Set(fields).size!==fields.length||next.user?.email!==owner||!Array.isArray(next.people)||!uniqueIds(next.people)||!Array.isArray(next.rows)||!uniqueIds(next.rows)||!Array.isArray(next.fields)||next.fields.length!==fields.length||fields.some((field,index)=>next.fields[index]!==field)||!next.aliasDomains||!Number.isSafeInteger(next.revision)||next.rows.some(row=>!Number.isSafeInteger(row.revision)||!Array.isArray(row.values)||row.values.length!==fields.length||row.values.some(value=>typeof value!=='string')||!Array.isArray(row.computed)||row.computed.length!==fields.length||row.computed.some(value=>typeof value!=='boolean')))return outcome('unavailable','unavailable','Contacts returned an incomplete view.');
   const person=staffId?next.people.find(person=>(person.staffId||person.id)===staffId):null,row=staffId?next.rows.find(row=>(row.staffId||row.id)===staffId):null;
   if(staffId&&(!person||!row||person.revision!==row.revision||person.revision!==expectedRevision))return outcome('stale','stale','A newer or different staff view was read. Refresh the classifications to reconcile.',person?.revision??row?.revision??null);
   const dirtyGrid=contactData!==gridBefore||dataEdits.size||newContactIds.size,
    dirtyAux=Object.values(auxTables).some(entry=>entry.dirty||entry.edits?.size)||signatureSettingsDraft||signatureSettingsSaving;
   if(dirtyAux)return outcome('deferred','deferred','A native Contacts form has unsaved changes; its draft is retained.',person?.revision??null);
   state=next;
   if(!dirtyGrid)contactData=sortContactData({...next});
   noteCatalogueRevision(next.catalogueRevision);
   show();loadDeployment(state);
   if(dirtyGrid){notice('Contact list refreshed. Edit Info refresh deferred; your unsaved draft is retained.');return outcome('refreshed','deferred','Edit Info has unsaved changes; its original baseline and draft are retained.',person?.revision??null);}
   window.GSISTableRefresh?.();
   return outcome('refreshed','refreshed',null,person?.revision??null);
  }catch(error){return outcome('unavailable','unavailable',valid()?error.message:'The active Contacts account changed.');}
 };
 return source+'\nlet classificationViewEpoch=0;\n'+refresh.toString()+"\nwindow.GSISV1ContactsViews=Object.freeze({refresh:refreshClassificationViews});\n";
}

function updateContactsDirectEditor(source) {
 const delegates={renderStaffGrid:'return window.GSISContactsEditor.renderGrid(id,data,edits,onEdit,locked,append);',contactSaveAttempt:'return window.GSISContactsEditor.makeAttempt();',renderSignature:'return window.GSISContactsEditor.renderSignature();'};
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),edits=[];
 for(const [name,body] of Object.entries(delegates)){
  const declaration=ast.body.find(item=>item.type==='FunctionDeclaration'&&item.id?.name===name);
  if(!declaration)throw Error('Visual baseline changed: Contacts direct '+name);
  edits.push([declaration.body.start,declaration.body.end,'{'+body+'}']);
 }
 for(const [prefix,replacement] of [
  ["$('addContactRow').onclick=","$('addContactRow').onclick=()=>window.GSISContactsEditor.addRow();"],
  ["$('signatureDownload').onclick=","$('signatureDownload').onclick=()=>window.GSISContactsEditor.downloadSignature();"],
 ]){
  const node=ast.body.find(item=>item.type==='ExpressionStatement'&&source.slice(item.start,item.end).startsWith(prefix));
  if(!node)throw Error('Visual baseline changed: Contacts direct '+prefix);
  edits.push([node.start,node.end,replacement]);
 }
 for(const [start,end,value] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+value+source.slice(end);
 source=replaceOnce(source,"if(row.formalRole!==undefined)p.formalRole=row.formalRole;","if(row.formalRole!==undefined)p.formalRole=row.formalRole;if(row.signatureSource!==undefined)p.signatureSource=row.signatureSource;if(row.revision!==undefined)p.revision=row.revision;",'Contacts saved signature source');
 source=replaceOnce(source,"state.signatureSettings=saved;signatureSettingsDraft=null;","state.signatureSettings=saved;window.GSISContactsEditor.invalidateSignature();signatureSettingsDraft=null;",'Contacts changed signature settings invalidate pending render');
 source=replaceOnce(source,"p.monthOfBirth=get('Month of birth');","p.monthOfBirth=get('Month of birth');p.groups=get('Memberships').split('\\n').filter(Boolean);",'Contacts saved direct memberships');
 const gridFields=/const gridFields=\[[^;]+\];/;
 if(!gridFields.test(source))throw Error('Visual baseline changed: Contacts loading schema');
 source=source.replace(gridFields,"const gridFields=state.gridSchema?.fields.map(field=>field.label)||[];");
 source=replaceOnce(source,"const shown=contactData||{editable:false,fields:gridFields,rows:","const shown=contactData||{editable:false,gridSchema:state.gridSchema,fields:gridFields,rows:",'Contacts loading owner schema');
 return source+`\nwindow.GSISContactsEditor.install({
 get:()=>({state,data:contactData,edits:dataEdits,additions:newContactIds,editable:contactDataEditable(),locked:dataLoading||dataSaving||!!dataRequest||contactViewPending(),saving:dataSaving||recoveryBusy,attempt:dataRequest}),
 capture:()=>{const credential=token,attempt=loginAttempt,owner=state?.user.email,epoch=window.GSISV1.saveStatus().contextEpoch;return()=>!!credential&&token===credential&&loginAttempt===attempt&&state?.user.email===owner&&window.GSISV1.saveStatus().contextEpoch===epoch;},
 render:()=>renderData(),save:()=>saveContactsGrid(),notice,
 invalidateSignature:()=>{signatureRenderEpoch++;signatureReady=null;},
 signature:()=>({epoch:signatureRenderEpoch,ready:signatureReady}),setSignature:ready=>{signatureReady=ready;},
 },${JSON.stringify(CONTACT_GRID_SCHEMA)},${previewTTb.toString()});
 window.GSISContactsContributions?.mount().catch(()=>{});
 const applySavedContactRows=applyContactSavedRows;
 applyContactSavedRows=function(rows){applySavedContactRows(rows);window.GSISContactsEditor.acceptSignatureView();if($('signature').classList.contains('active'))void renderSignature();};
 `;
}

function updateContacts(source){
 source=replaceOnce(source,"p.emails[key]=value?(value.includes('@')?value:value+'@'+domain):'';","const aliasDomain=contactData.aliasDomains?.[key]||state.aliasDomains?.[key],prior=p.emails[key],sameAlias=typeof prior==='string'&&prior.split('@')[0]===value&&prior.split('@')[1]?.toLowerCase()===aliasDomain?.toLowerCase();p.emails[key]=value?(value.includes('@')||!aliasDomain?value:sameAlias?prior:value+'@'+aliasDomain):'';",'Contacts saved aliases retain the owning configured domain');
 source=source.replaceAll("state?.user.roles.includes('Admin')","(state?.user.roles.includes('Admin')||state?.user.roles.includes('ContactsPowerUser'))");
 source=source.replaceAll("state.user.roles.includes('Admin')","(state.user.roles.includes('Admin')||state.user.roles.includes('ContactsPowerUser'))");
 source=source.replaceAll("r==='Admin'||r==='KP'","r==='Admin'||r==='KP'||r==='ContactsPowerUser'");
 // Application grants are managed by Core, separate from accepted staff records.
 source=replaceOnce(source,"$('addRole').onclick=()=>openRole();","$('addRole').onclick=()=>location.assign('/admin/');",'Contacts Core admin link');
 source=replaceOnce(source,"if(b)openRole(b.dataset.roleEmail);","if(b)location.assign('/admin/');",'Contacts Core access row');
 source=updateContactsRecovery(source);
 source=updateContactsClassificationViews(source);
 source=updateContactsDirectEditor(source);
 source=source.replaceAll('Complete this saved change','Inspect or recover this save').replaceAll('Completing the original save…','Checking durable recovery…');
 source+=`\nwindow.GSISContactsEditor.onContextClear(()=>{classificationViewEpoch++;loginAttempt++;loginAbort?.abort();clearContactsPersonalState();token='';state=null;visible=[];dataSaving=false;dataRequest=null;recoveryBusy=false;resetContactRecovery();$('dataGrid').inert=false;$('contactRows').replaceChildren();$('accessRows').replaceChildren();$('identity').replaceChildren();$('app').classList.add('hidden');});`;
 return source;
}
// Fortnight inputs have their own raw draft; the existing queue still owns every
// staged edit and submitted operation. Other editors retain the legacy controls.
function updateFortnightEditor(source) {
 const helpers = [
  function fortnightInputState(input) {
   const field = input.dataset.splitField;
   const expected = v()?.fortnight?.[input.dataset.splitRow]?.[field] ?? '';
   input.setCustomValidity('');
   const value = field === 'remarks' ? input.value : input.value === '' ? '' : Number(input.value);
   const invalid = field === 'remarks'
    ? value.length > 4000
    : input.validity.badInput || value !== '' && (!Number.isInteger(value) || value < 0 || value > 200);
   const message = invalid ? field === 'remarks'
    ? 'Use up to 4000 characters for remarks.'
    : 'Use a whole number of lesson blocks from 0 to 200, or leave it blank.' : '';
   if (!input.disabled) input.setCustomValidity(message);
   return {input, field, expected, value, invalid: !input.disabled && invalid,
    dirty: !input.disabled && (invalid || value !== expected), message: input.disabled ? '' : message};
  },
  function fortnightDraftState() {
   if (tab !== 'Fortnight Split') return [];
   return [...el('content').querySelectorAll('[data-split-field]')].map(fortnightInputState);
  },
  function syncFortnightDraft() {
   if (tab !== 'Fortnight Split') return;
   unsavedDraft = fortnightDraftState().some(input => input.dirty);
   drawQueueStatus();
  },
  function stageFortnightInput(input) {
   const state = fortnightInputState(input);
   if (state.invalid || queueFlight || !token || !kp()) { syncFortnightDraft(); return false; }
   if (!state.dirty) { syncFortnightDraft(); return true; }
   const row = input.dataset.splitRow;
   const earlier = cellQueue.find(edit => edit.operation === 'setFortnight' && edit.row === row && edit.field === state.field);
   if (earlier && state.value === earlier.expected) {
    cellQueue = cellQueue.filter(edit => edit !== earlier);
    viewEpoch++;
    invalidatePendingProjection();
    applyPendingProjection();
   } else {
    queueCell({operation: 'setFortnight', row, field: state.field, value: state.value, expected: state.expected});
   }
   syncFortnightDraft();
   return !fortnightInputState(input).dirty;
  },
  function stageFortnightInputs() {
   if (queueFlight || !token || !kp()) return false;
   const states = fortnightDraftState();
   const invalid = states.find(input => input.invalid);
   if (invalid) { syncFortnightDraft(); invalid.input.reportValidity(); return false; }
   for (const state of states) if (state.dirty) state.input.dispatchEvent(new Event('change', {bubbles: true}));
   syncFortnightDraft();
   return !unsavedDraft;
  },
  function wireFortnightEditor(root, update) {
   root.querySelectorAll('[data-fortnight-toggle]').forEach(button => button.onclick = () => {
    if (queueFlight || !token || !kp() || !stageFortnightInputs()) return;
    queueCell({operation: 'setFortnight', row: button.dataset.fortnightToggle, field: 'enabled',
     value: button.getAttribute('aria-checked') !== 'true', expected: v().fortnight[button.dataset.fortnightToggle]?.enabled ?? ''});
    update(button.closest('tr'));
    syncFortnightDraft();
   });
   root.querySelectorAll('[data-split-field]').forEach(input => {
    input.oninput = syncFortnightDraft;
    input.onchange = input.onblur = () => {
     if (stageFortnightInput(input)) update(input.closest('tr'));
    };
   });
  },
  function drawQueueStatus() {
   if (tab !== 'Fortnight Split') {
    const bar = el('saveQueue');
    if (bar) delete bar.dataset.fortnightEditor;
    drawLegacyQueueStatus();
    return;
   }
   persistClassDraft();
   let bar = el('saveQueue');
   if (!bar) { bar = document.createElement('div'); bar.id = 'saveQueue'; document.querySelector('.workspace-bar').append(bar); }
   // Stable controls preserve the button receiving a click while input blur
   // stages its edit. Replacing that button during blur loses the click.
   if (!bar.dataset.fortnightEditor) {
    bar.dataset.fortnightEditor = 'true';
    bar.replaceChildren();
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    const save = button('Save to online', () => {
     if (!token || !kp()) return;
     if (queueFlight) { pumpQueue(true); return; }
     if (!stageFortnightInputs()) return;
     document.activeElement?.blur();
     pumpQueue(true);
    });
    save.dataset.fortnightSave = '';
    const discard = button('Discard', () => {
     if (queueFlight) return;
     if (queuedEdits().length) { discardDrafts(); return; }
     if (fortnightDraftState().some(input => input.dirty) && confirm('Discard unsaved Fortnight input?')) {
      unsavedDraft = false;
      render();
     }
    });
    discard.dataset.fortnightDiscard = '';
    const review = button('Review', resolveQueue);
    review.dataset.fortnightReview = '';
    bar.append(status, save, discard, review);
   }
   const count = queuedEdits().length;
   const raw = fortnightDraftState();
   const dirty = raw.some(input => input.dirty);
   const invalid = raw.find(input => input.invalid);
   const error = teacherInputError() || teacherNameError(v()) || classRenameError();
   bar.hidden = !(kp() || admin()) && !count && !dirty;
   bar.querySelector('[role="status"]').textContent = error || invalid?.message || classDraftStorageError || queueError ||
    (count ? (queueFlight ? queueFlight.running ? 'Saving' : 'Save unconfirmed' : 'Unsaved') + ' · ' + count + ' change(s)' : dirty ? 'Unsaved input' : 'No unsaved changes');
   const save = bar.querySelector('[data-fortnight-save]');
   save.textContent = queueError ? 'Retry save' : 'Save to online';
   save.disabled = !token || !kp() || !(count || dirty) || !!queueFlight?.running || !!error || !!invalid;
   bar.querySelector('[data-fortnight-discard]').disabled = !(count || dirty) || !!queueFlight;
   bar.querySelector('[data-fortnight-review]').hidden = !queueError;
   if (count) el('status').textContent = queueError ? 'Save needs attention' : queueFlight ? 'Saving…' : 'Unsaved changes';
  },
 ];
 const ast = parse(source, {ecmaVersion: 'latest', sourceType: 'script'});
 const page = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'fortnightPage');
 const status = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'drawQueueStatus');
 if (!page || !status) throw Error('Fortnight editor baseline changed');
 const body = source.slice(page.start, page.end);
 const handlers = body.match(/ root\.querySelectorAll\('\[data-fortnight-toggle\]'\)\.forEach\([^\n]+\n root\.querySelectorAll\('\[data-split-field\]'\)\.forEach\([^\n]+/);
 if (!handlers) throw Error('Fortnight input handlers baseline changed');
 const edits = [
  [page.start, page.end, body.replace(handlers[0], ' wireFortnightEditor(root, update);')],
  [status.id.start, status.id.end, 'drawLegacyQueueStatus'],
 ];
 for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + replacement + source.slice(end);
 return source + '\n' + helpers.map(helper => helper.toString()).join('\n');
}

function updateLordPreparation(source) {
 const helpers = [
  async function retryNativePreparationCleanup() {
   const attempt=v1NativePreparation;
   if(!attempt||state.busy||state.booking!==attempt.booking||draftOwner()!==attempt.owner)return;
   state.busy=true;main.inert=true;
   try {
    if(!window.GSISV1.releasePrepared(attempt.prepared))throw Error('The original local preparation cannot be released in this context.');
    v1NativePreparation=null;attempt.booking.pendingBatch=null;attempt.booking.pendingBatchIdentity=null;
    await persistDraft();
    if(state.booking!==attempt.booking||draftOwner()!==attempt.owner)return;
    state.busy=false;main.inert=false;renderBooking();showDraftStatus('Local preparation cleared. Your selections remain editable.');
   } catch(error) {if(state.booking===attempt.booking&&draftOwner()===attempt.owner){state.busy=false;main.inert=false;renderErrorRetry(error.message+' Retry local cleanup; no booking was sent.',retryNativePreparationCleanup);document.getElementById('retryBtn').textContent='Retry local cleanup';}}
  },
  function nativeBookingIdentity(booking) {
   const pending=booking.pendingBatchIdentity,body=booking.pendingBatch;
   if(pending&&typeof pending.key==='string'&&/^lordPendingRequest:v1\.4:[a-f0-9]{64}$/.test(pending.key)&&
      typeof pending.id==='string'&&pending.id===(body?.operationId||body?.clientRequestId)){
    try {const stored=JSON.parse(localStorage.getItem(pending.key)||'null'),memory=pendingWriteIds.get(pending.key);if((stored&&stored.id!==pending.id)||(memory&&memory!==pending.id))return null;}catch{return null;}
    return pending;
   }
   return null;
  },
  async function checkNativeBookingReceipt() {
   const booking=state.booking,payload=booking.pendingBatch,owner=draftOwner();
   if(state.busy||!payload)return;
   const active=()=>state.booking===booking&&draftOwner()===owner;
   state.busy=true;main.inert=true;
   try {
    const outcome=await window.GSISV1.checkLordBookingReceipt(payload);
    if(!active())return;
    if(outcome.verified&&['committed','aborted'].includes(outcome.state)) {
     const identity=nativeBookingIdentity(booking);if(identity)clearPendingRequest(identity);
     booking.pendingBatch=null;booking.pendingBatchIdentity=null;
     state.busy=false;main.inert=false;
     if(outcome.state==='committed') {
      await clearDraft();if(active())renderMultiBookingSuccess(outcome.result?.bookings||outcome.result?.receipt?.result?.bookings||[]);
     } else {await persistDraft();if(active()){renderBooking();showDraftStatus('The original booking did not commit. Review your selections before a new submission.');}}
    } else {state.busy=false;main.inert=false;renderErrorRetry('The original booking remains unconfirmed. Its saved request is retained.',retryPendingBookingBatch);}
   } catch(error) {if(active()){state.busy=false;main.inert=false;renderErrorRetry(error.message+' Original booking retained.',retryPendingBookingBatch);}}
  },
  async function prepareNativeBookingBatch(payload) {
   const booking = state.booking, owner = draftOwner(), form = document.getElementById('confirmBookingBtn');
   const signature = JSON.stringify([state.identity,booking.date,booking.selections]);
   const active = () => draftOwner() === owner && state.booking === booking && form?.isConnected &&
    JSON.stringify([state.identity,booking.date,booking.selections]) === signature;
   state.busy = true; main.inert = true;
   let prepared = null, pending = null;
   try {
    pending = await stableClientRequestId(payload, true);
    if (!active()) throw Error('The booking form or account changed. Review the current form.');
    prepared = await window.GSISV1.prepareLordBookingRequest('/api/lord/transaction',payload,{fresh:pending.fresh});
    if (!active()) throw Error('The booking form or account changed. Review the current form.');
    booking.pendingBatch = prepared.body;booking.pendingBatchIdentity={key:pending.key,id:pending.id};
    if (!await persistDraft()) throw Error('This booking could not be saved on this device. Correct browser storage before submitting.');
    if (!active()) throw Error('The booking form or account changed. Review the current form.');
    localStorage.setItem(pending.key,JSON.stringify({id:pending.id,at:Date.now()}));
    pendingWriteIds.set(pending.key,pending.id);
    state.busy = false; main.inert = false;
    await retryPendingBookingBatch(prepared,pending);
   } catch (error) {
    prepared=prepared||error.prepared||null;
    let released = !prepared && pending?.fresh && !['RETAINED_OPERATION','OPERATION_ID_REUSED'].includes(error.code);
    if (prepared && pending?.fresh) {
     try {released = await window.GSISV1.releasePrepared(prepared);} catch (cleanup) {error.message += ' '+cleanup.message;}
    }
    if (state.booking !== booking || draftOwner() !== owner) return;
    state.busy = false; main.inert = false;
    if(prepared&&pending?.fresh&&!released){v1NativePreparation={booking,owner,prepared};renderErrorRetry(error.message+' The unsent preparation could not be cleared. Retry local cleanup before editing.',retryNativePreparationCleanup);document.getElementById('retryBtn').textContent='Retry local cleanup';return;}
    if (released || !pending) {
     booking.pendingBatch = null;booking.pendingBatchIdentity=null;
     renderBooking();showDraftStatus(error.message+' Your selections remain editable.');
    } else {
     booking.pendingBatch = booking.pendingBatch || payload;
     await persistDraft();
     if (state.booking === booking && draftOwner() === owner) renderErrorRetry(error.message+' The original booking identity is retained; it has no confirmed outcome.',retryPendingBookingBatch);
    }
   }
  },
 ];
 source=replaceOnce(source,"  state.booking.pendingBatch=payload;\n  await retryPendingBookingBatch();","  await prepareNativeBookingBatch(payload);",'LORD prepares before persisting a submitted batch');
 source=replaceOnce(source,"async function retryPendingBookingBatch(){","async function retryPendingBookingBatch(prepared=null,pending=null){",'LORD consumes explicit prepared handle');
 source=replaceOnce(source,"  const payload=state.booking.pendingBatch;","  const payload=state.booking.pendingBatch,booking=state.booking,owner=draftOwner();pending=pending||nativeBookingIdentity(booking);",'LORD frozen native context');
 source=replaceOnce(source,"    const result=await postTransaction(payload);\n    state.booking.pendingBatch=null;","    const result=await postTransaction(payload,prepared,pending);\n    if(state.booking!==booking||draftOwner()!==owner)return;\n    state.booking.pendingBatch=null;state.booking.pendingBatchIdentity=null;",'LORD exact prepared native send');
 source=replaceOnce(source,"    await clearDraft();\n    renderMultiBookingSuccess(result.bookings || []);","    await clearDraft();\n    if(state.booking!==booking||draftOwner()!==owner)return;\n    renderMultiBookingSuccess(result.bookings || []);",'LORD late completion cannot repaint another form');
 source=replaceOnce(source,"    if(error.code==='AUTH_EXPIRED')return;\n    if(error.code==='SUBMISSION_REJECTED')", "    if(state.booking!==booking||draftOwner()!==owner)return;\n    if(error.code==='AUTH_EXPIRED')return;\n    if(error.code==='SUBMISSION_REJECTED')",'LORD late failure keeps another account isolated');
 source=replaceOnce(source,"async function postTransaction(payload) {\n  const pending = await stableClientRequestId(payload);","async function postTransaction(payload, prepared=null, originalPending=null) {\n  const pending = originalPending || await stableClientRequestId(payload);",'LORD prepared request keeps selected identity');
 source=replaceOnce(source,"if(String(payload.action).toLowerCase()==='bookingcreatebatch'){state.booking.pendingBatch=payload;await persistDraft();}","if(!prepared&&String(payload.action).toLowerCase()==='bookingcreatebatch'){state.booking.pendingBatch=payload;await persistDraft();}",'LORD prepared body persists once before dispatch');
 source=replaceOnce(source,"    response = await lordFetch(API.transaction, {\n      method: 'POST',","    response = await lordFetch(API.transaction, {\n      prepared,retainedAttempt:!prepared&&String(payload.action).toLowerCase()==='bookingcreatebatch',\n      method: 'POST',",'LORD passes opaque preparation to shared client');
 source=replaceOnce(source,"async function stableClientRequestId(payload) {","async function stableClientRequestId(payload, prepareOnly=false) {",'LORD fresh identity provenance');
 source=replaceOnce(source,"  let id=pendingWriteIds.get(key);","  let id=pendingWriteIds.get(key),fresh=false;",'LORD distinguishes reused intent');
 source=replaceOnce(source,"    if(saved && Date.now()-saved.at<24*60*60*1000) id=saved.id;\n  } catch {}\n  if(!id) id=payload.clientRequestId || crypto.randomUUID();","    if(saved && (prepareOnly || Date.now()-saved.at<24*60*60*1000)) {if(typeof saved.id!=='string'||!saved.id)throw Error('Stored booking request identity is invalid. Keep the original draft.');id=saved.id;}\n  } catch(error) {if(prepareOnly)throw error;}\n  if(!id) {id=payload.clientRequestId || crypto.randomUUID();fresh=!payload.clientRequestId;}\n  if(prepareOnly){payload.clientRequestId=id;return {key,id,fresh};}",'LORD no age or absence inference for reused identity');
 source=replaceOnce(source,"  document.getElementById('retryBtn').onclick = retryFn;", "  document.getElementById('retryBtn').onclick = ()=>retryFn();\n  if(retryFn===retryPendingBookingBatch&&state.booking.pendingBatch){const check=document.createElement('button');check.id='checkBookingReceipt';check.className='secondary-button';check.textContent='Check original receipt';check.onclick=checkNativeBookingReceipt;document.getElementById('retryBtn').before(check);}",'LORD original receipt inspection is read-only');
 return source+'\nlet v1NativePreparation=null;window.addEventListener(\'gsis:clear-protected-state\',()=>{v1NativePreparation=null;});\n'+helpers.map(fn=>fn.toString()).join('\n');
}

function updateDeployRecovery(source) {
 const helpers = [
  function deployRecoveryReference(attempt) {
   if (!attempt.requestId) return null;
   try {return window.GSISV1.operationState('deploy', attempt.requestId,attempt.referenceOnly?{versionId:attempt.versionId,referenceOnly:true}:undefined) || attempt.reference;}
   catch(error) {attempt.recoveryError=error.message;return attempt.reference||null;}
  },
  function deployAttemptActive(attempt) {
   return !!token && attempt.epoch === sessionEpoch && attempt.versionId === current &&
    (queueFlight === attempt || v1DirectSave === attempt);
  },
  async function submitDeployAttempt(attempt, send) {
   const result = await send();
   attempt.reference = deployRecoveryReference(attempt);
   if (!attempt.reference) throw Error('Original save reference is unavailable. Keep this page open.');
   const outcome = await window.GSISV1.recoverOperation(attempt.reference, 'check');
   if (!outcome.verified || outcome.state !== 'committed') {
    const error = Error(outcome.state === 'aborted' && outcome.verified ? 'The original save did not commit. Check its recorded outcome before editing again.' : 'The original save is not confirmed. Check its receipt.');
    error.outcome = outcome;
    throw error;
   }
   return outcome.result || result;
  },
  function restoreDeployRecovery() {
   if (!token || !current || queueFlight || v1DirectSave) return;
   let refs;
   try {refs=window.GSISV1.operationStates('deploy').filter(ref=>ref.versionId===current);}
   catch(error) {queueFlight={versionId:current,requestId:null,edits:[],running:false,referenceOnly:true,epoch:sessionEpoch,storageBlocked:true};queueError=error.message+' Saving is blocked until original recovery references can be read. Reload after correcting browser storage.';el('content').inert=true;return;}
   if (!refs.length) return;
   const ref = refs[0];
   queueFlight = {versionId: current, requestId: ref.operationId, reference: ref, edits: [], running: false, referenceOnly: true, epoch: sessionEpoch};
   queueError = 'An earlier save needs an outcome check. Its full submitted contents are not stored in this browser reference.';
   el('content').inert = true;
  },
  function drawDeployRecovery() {
   const attempt = queueFlight || v1DirectSave;
   const bar = el('saveQueue');
   if (!bar || !attempt) return;
   bar.hidden = false;
   bar.style.maxWidth='100%';bar.style.minWidth='0';
   for (const button of bar.querySelectorAll('button,[role=status]')) {
    if (!button.closest('[data-deploy-recovery]')) { button.hidden = true; button.dataset.recoveryHidden = ''; }
   }
   let host = bar.querySelector('[data-deploy-recovery]');
   if (!host) { host = document.createElement('div'); host.dataset.deployRecovery = ''; bar.append(host); }
   host.replaceChildren();Object.assign(host.style,{display:'flex',flexWrap:'wrap',gap:'6px',minWidth:'0',maxWidth:'100%'});
   const ref = deployRecoveryReference(attempt);
   const status = document.createElement('span'); status.setAttribute('role', 'status');status.style.overflowWrap='anywhere';status.style.flexBasis='100%';
   status.textContent = attempt.recoveryError || queueError || 'The original save outcome is not confirmed.';
   host.append(status);
   for (const [mode,label,allowed] of [['check','Check original save',!!ref],['retry',ref?.canRetryPreparation?'Retry original preparation':'Retry original save',!!(ref?.canRetry||ref?.canRetryPreparation)],['withdraw','Stop original save',!!ref?.canWithdraw]]) {
    const action = button(label, () => recoverDeploySave(attempt, mode), attempt.running || !allowed);
    action.dataset.deployRecoveryAction = mode;
    host.append(action);
   }
   if (ref?.storageError) host.append(document.createTextNode(' '+ref.storageError));
   el('content').inert = true;
  },
  function drawQueueStatus() {
   const bar = el('saveQueue');
   if (bar) {
    for (const button of bar.querySelectorAll('[data-recovery-hidden]')) {button.hidden = false; delete button.dataset.recoveryHidden;}
    bar.querySelector('[data-deploy-recovery]')?.remove();
   }
   drawDraftQueueStatus();
   drawDeployRecovery();
  },
  async function finishDeployQueue(flight, result) {
   if (!deployAttemptActive(flight)) return;
   queueFlight = null; queueError = ''; cellQueue = []; draftBase = null;
   classDraftRecoveryConflict = false; unsavedDraft = false; viewEpoch++;
   persistClassDraft(); el('content').inert = false;
   el('status').textContent = 'Saved';
   // A receipt confirms the original write, not that its old snapshot is current.
   snapshotCache = null;
   await refresh(true);
   if (flight.epoch !== sessionEpoch || current !== flight.versionId) return;
   el('status').textContent = snapshotCache ? 'Saved' : 'Saved · refresh needed';
   if (!snapshotCache) {el('status').textContent = 'Saved · refresh needed';el('connection').textContent = 'Your original save is confirmed. Refresh to load the current saved version.';}
   drawQueueStatus();
  },
  async function recoverDeploySave(attempt, mode = 'check') {
   if (!deployAttemptActive(attempt) || attempt.running) return;
   if (mode === 'withdraw' && !confirm('Stop the original save if it has not committed? A committed save remains saved.')) return;
   attempt.running = true; drawQueueStatus();
   try {
    const ref = deployRecoveryReference(attempt);
    if (!ref) throw Error('The original operation reference is unavailable. Keep the draft and original save ID; do not submit it as a new save.');
    const outcome = await window.GSISV1.recoverOperation(ref, mode);
    if (!deployAttemptActive(attempt)) return;
    attempt.reference = outcome.reference || ref;
    if (outcome.verified && outcome.state === 'committed') {
     if (queueFlight === attempt) await finishDeployQueue(attempt, outcome.result);
     else {
      v1DirectSave = null; forgetLease(); unsavedDraft = false; queueError = ''; el('content').inert = false;
      const dialog = document.querySelector('dialog'); if (dialog.open) dialog.close();
      if (inlineDraftEditor?.open) inlineDraftEditor.close();
      snapshotCache = null; await refresh(true);
      if (attempt.epoch === sessionEpoch && current === attempt.versionId) el('status').textContent = snapshotCache ? 'Saved' : 'Saved · refresh needed';
     }
    } else if (outcome.verified && outcome.state === 'aborted') {
     if (queueFlight === attempt) { cellQueue = attempt.edits || []; queueFlight = null; }
     else { v1DirectSave = null; forgetLease(); }
     queueError = 'Original save did not commit. Your draft is retained; review current saved values before a new save.';
     el('content').inert = false; persistClassDraft();
    } else queueError = 'Original save remains unconfirmed. Check again or retry its exact retained request; a missing receipt does not prove it failed.';
   } catch (error) { if (deployAttemptActive(attempt)) queueError = error.message+' Original save retained.'; }
   finally { if (attempt.epoch === sessionEpoch && current === attempt.versionId) {attempt.running = false; drawQueueStatus();} }
  },
  async function pumpQueue(retry = false) {
   if (noteSaving()) {alert('Wait for the note save to finish.');return;}
   if (queueFlight) { await recoverDeploySave(queueFlight, 'check'); return; }
   if (!token || !cellQueue.length || v1DirectSave) return;
   const error = teacherInputError() || teacherNameError(v()) || classRenameError();
   if (error) {drawQueueStatus();alert(error);return;}
   document.activeElement?.blur();
   if (inlineDraftEditor?.open || unsavedDraft) {alert('Finish the current input before saving.');return;}
   const edits = cellQueue.slice(), wire = saveWireEdits(edits);
   const flight = queueFlight = {versionId:current,requestId:uid(),issuedAt:Date.now(),edits,wire,baselineRevision:snapshotCache?.revision,epoch:sessionEpoch,running:true};
   cellQueue = []; queueError = ''; drawQueueStatus();
   try {
    const result = await submitDeployAttempt(flight, () => api('change',{operation:'saveDraft',versionId:flight.versionId,requestId:flight.requestId,issuedAt:flight.issuedAt,clientId,edits:flight.wire},false,undefined,true));
    if (deployAttemptActive(flight)) await finishDeployQueue(flight,result);
   } catch (error) {
    if (deployAttemptActive(flight)) {if(window.GSISV1.isUnsentOperation(error,'deploy',flight.requestId)){cellQueue=flight.edits;queueFlight=null;el('content').inert=false;queueError=error.message+' Nothing was sent. Your draft remains editable.';}else{flight.reference = deployRecoveryReference(flight);queueError = error.message+' Original save and draft retained.';}}
   } finally {if (flight.epoch === sessionEpoch && current === flight.versionId) {flight.running = false;drawQueueStatus();}}
  },
  function updateVersionNoteControls(id) {
   updateDraftVersionNoteControls(id);
   const row = [...document.querySelectorAll('[data-version-row]')].find(row => row.dataset.versionRow === id), draft = versionNoteDrafts.get(id);
   if (!row || !draft) return;
   const input=row.querySelector('[data-note-input]');if(input.value!==draft.value)input.value=draft.value;
   row.querySelector('[data-note-recovery]')?.remove();
   row.querySelector('[data-note-save]').hidden = !!draft.attempt;
   if (!draft.attempt) return;
   const host = document.createElement('span'); host.dataset.noteRecovery = '';
   const ref = deployRecoveryReference(draft.attempt);
   for (const [mode,label,enabled] of [['check','Check original note',true],['retry',ref?.canRetryPreparation?'Retry original preparation':'Retry original note',!!(ref?.canRetry||ref?.canRetryPreparation)],['withdraw','Stop original note',!!ref?.canWithdraw]]) {
    const action = button(label,()=>recoverVersionNote(id,mode),draft.saving || !enabled);host.append(action);
   }
   row.querySelector('[data-note-save]').after(host);
  },
  async function finishVersionNote(id,draft,attempt) {
   draft.attempt=null;draft.status='Original note save confirmed.';
   const entry=state.versions.find(row=>row.id===id),notes=entry?.notes||'',rawNotes=entry?.notes,revision=entry?.revision;
   draft.expected=draft.value=notes;
   try {
    const latest=await api('versionNote',{versionId:id},false);
    if(!token||attempt.epoch!==sessionEpoch||versionNoteDrafts.get(id)!==draft||draft.attempt)return;
    const currentEntry=state.versions.find(row=>row.id===id);
    if(currentEntry!==entry||currentEntry?.notes!==rawNotes||currentEntry?.revision!==revision)return;
    if(latest.versionId!==id||typeof latest.notes!=='string')throw Error('Current note response is incomplete.');
    if(entry)entry.notes=latest.notes;
    draft.expected=draft.value=latest.notes;
    draft.status='Original note save confirmed. Current saved note loaded.';
   } catch(error) {if(attempt.epoch===sessionEpoch&&versionNoteDrafts.get(id)===draft&&!draft.attempt)draft.status='Original note save confirmed · current note refresh needed. '+error.message;}
  },
  async function recoverVersionNote(id, mode) {
   const draft = versionNoteDrafts.get(id), attempt = draft?.attempt;
   if (!attempt || draft.saving || attempt.epoch !== sessionEpoch || !token) return;
   if (mode === 'withdraw' && !confirm('Stop this original note save if it has not committed?')) return;
   draft.saving = true; updateVersionNoteControls(id);
   const active = () => !!token && attempt.epoch === sessionEpoch && versionNoteDrafts.get(id) === draft && draft.attempt === attempt;
   try {
    const outcome = await window.GSISV1.recoverOperation(deployRecoveryReference(attempt), mode);
    if (!active()) return;
    if (outcome.verified && outcome.state === 'committed') {
     await finishVersionNote(id,draft,attempt);
    } else if (outcome.verified && outcome.state === 'aborted') {
     draft.attempt = null; draft.conflict = true; draft.status = 'Original note did not commit. Review the latest saved note before a new save.';
    } else draft.status = 'Original note is unconfirmed. Its text and request are retained.';
   } catch (error) {if (active()) draft.status = error.message+' Original note retained.';}
   finally {if (attempt.epoch === sessionEpoch && versionNoteDrafts.get(id) === draft) {draft.saving = false;updateVersionNoteControls(id);}}
  },
  async function saveVersionNote(id) {
   const row = state.versions.find(row => row.id === id);if (!row || !(admin() || kp())) return;
   const draft = versionNoteDraft(row);
   if (draft.attempt) {await recoverVersionNote(id,'check');return;}
   if (draft.saving || noteSaving() || queueFlight || v1DirectSave || busy || editing || acquiring || refreshing || draft.value === draft.expected) return;
   const attempt = draft.attempt = {versionId:id,operation:'saveVersionNote',notes:draft.value,expected:draft.expected,requestId:crypto.randomUUID(),issuedAt:Date.now(),clientId,epoch:sessionEpoch};
   draft.saving = true;draft.conflict = false;draft.status = 'Saving…';updateVersionNoteControls(id);
   const active = () => !!token && attempt.epoch === sessionEpoch && versionNoteDrafts.get(id) === draft && draft.attempt === attempt;
   try {
    const {epoch,...body} = attempt;
    const result = await submitDeployAttempt(attempt,()=>api('change',body,undefined,undefined,true));
    if (!active()) return;
    await finishVersionNote(id,draft,attempt);
   } catch (error) {if (active()) {if(window.GSISV1.isUnsentOperation(error,'deploy',attempt.requestId)){draft.attempt=null;draft.status=error.message+' Nothing was sent. Your note remains editable.';}else{attempt.reference = deployRecoveryReference(attempt);draft.status = error.message+' Original note retained.';}}}
   finally {if (attempt.epoch === sessionEpoch && versionNoteDrafts.get(id) === draft) {draft.saving = false;updateVersionNoteControls(id);}}
  },
 ];
 const ast = parse(source,{ecmaVersion:'latest',sourceType:'script'}), edits = [];
 for (const [name,replacement] of [['pumpQueue',helpers.find(fn=>fn.name==='pumpQueue')],['saveVersionNote',helpers.find(fn=>fn.name==='saveVersionNote')]]) {
  const node=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name===name);
  if(!node)throw Error('Deploy recovery baseline changed: '+name);
  edits.push([node.start,node.end,replacement.toString()]);
 }
 for(const [name,replacement] of [['drawQueueStatus','drawDraftQueueStatus'],['updateVersionNoteControls','updateDraftVersionNoteControls']]) {
  const node=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name===name);
  if(!node)throw Error('Deploy recovery baseline changed: '+name);
  edits.push([node.id.start,node.id.end,replacement]);
 }
 for(const [start,end,value] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+value+source.slice(end);
 source=replaceOnce(source,"async function api(action,input={},feedback,signal){","async function api(action,input={},feedback,signal,freshAttempt=false){",'Deploy local fresh attempt provenance');
 source=replaceOnce(source,"const {r,body}=await requestJSON('/api/'+action,{method:'POST',","const {r,body}=await requestJSON('/api/'+action,{freshAttempt,method:'POST',",'Fresh provenance remains transport-only');
 source=replaceOnce(source,"current=doc.id;SEED.layout=doc.layout||[];restoreClassDraft();","current=doc.id;SEED.layout=doc.layout||[];restoreClassDraft();restoreDeployRecovery();",'Deploy restored outcome references');
 source=replaceOnce(source,"if(saved.flight){queueFlight={...saved.flight,edits:saved.edits,running:false};","if(saved.flight){queueFlight={...saved.flight,edits:saved.edits,running:false,epoch:sessionEpoch,referenceOnly:true};",'Legacy class flight never reconstructs final request');
 source=replaceOnce(source,"if(queueFlight?.running){alert('Waiting for the current save response. Your draft is retained.');return}","if(queueFlight){await recoverDeploySave(queueFlight,'check');return;}",'Submitted queue review is receipt-only');
 source=replaceOnce(source,"const beforeRevision=snapshotCache?.revision;busy=true;", "const directEpoch=sessionEpoch,directEditing=editing,beforeRevision=snapshotCache?.revision;busy=true;",'Direct edit continuation owns its context');
 source=replaceOnce(source,"editing.requestId=args.requestId||editing.requestId||crypto.randomUUID();", "const freshDirectId=!args.requestId&&!editing.requestId;editing.requestId=args.requestId||editing.requestId||crypto.randomUUID();",'Only newly allocated direct IDs are fresh');
 source=replaceOnce(source,"}catch(e){el('status').textContent='Save not confirmed — draft retained';throw e}","}catch(e){if(directEpoch===sessionEpoch&&editing===directEditing){if(v1DirectSave&&window.GSISV1.isUnsentOperation(e,'deploy',v1DirectSave.requestId)){v1DirectSave=null;delete editing.attempt;delete editing.requestId;}el('status').textContent='Save not confirmed — draft retained';}throw e}",'Direct late error cannot modify another context');
 source=replaceOnce(source,"result=await api('change',{...lease,operation,...args,requestId:editing.requestId});","const directAttempt=v1DirectSave=v1DirectSave||{versionId:editing.versionId,requestId:editing.requestId,epoch:sessionEpoch,running:true};result=await submitDeployAttempt(directAttempt,()=>api('change',{...lease,operation,...args,requestId:editing.requestId},undefined,undefined,freshDirectId));if(!deployAttemptActive(directAttempt))throw Error('The active save context changed.');v1DirectSave=null;",'Direct edit verified original outcome');
 source=replaceOnce(source,"async function release(){clearInterval(leaseTimer);","async function release(){if(v1DirectSave)return;clearInterval(leaseTimer);",'Closing an unresolved direct edit is not withdrawal');
 source=replaceOnce(source,"finally{busy=false;buttons.forEach(([b,disabled])=>b.disabled=disabled)}","finally{if(directEpoch===sessionEpoch&&editing===directEditing){busy=false;if(v1DirectSave&&v1DirectSave.requestId===directEditing.requestId){v1DirectSave.running=false;drawQueueStatus();}buttons.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled})}}",'Direct save recovery remains reachable');
 source=replaceOnce(source,"d.querySelector('#ok').onclick=async()=>{const ok=d.querySelector('#ok');ok.disabled=true;try{await submit(d);d.close()}catch(e){d.querySelector('#formerror').textContent=e.message}finally{ok.disabled=false}};", "const modalForm=d.querySelector('form'),modalEpoch=sessionEpoch;d.querySelector('#ok').onclick=async()=>{const ok=d.querySelector('#ok'),active=()=>modalEpoch===sessionEpoch&&d.open&&d.querySelector('form')===modalForm;ok.disabled=true;try{await submit(d);if(active())d.close()}catch(e){if(active())d.querySelector('#formerror').textContent=e.message}finally{if(active())ok.disabled=false}};",'Deploy modal response belongs to its original form');
 source=replaceOnce(source,"async function change(operation,args={}){","async function change(operation,args={}){\n if(v1DirectSave){await recoverDeploySave(v1DirectSave,'check');throw Error('Check the original save outcome before submitting another edit.');}",'Direct retry is explicit original recovery');
 return source+'\nlet v1DirectSave=null;\nwindow.addEventListener(\'gsis:clear-protected-state\',()=>{v1DirectSave=null;});\n'+helpers.filter(fn=>!['pumpQueue','saveVersionNote'].includes(fn.name)).map(fn=>fn.toString()).join('\n');
}

// The browser loads the embedded rule engine in app.js. Restrict adaptation to
// that initializer, leaving the shared v0.9 policy and other embedded engines intact.
function updateDeployTeachingEligibility(source) {
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'script'}),engines=[];
 function walk(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(child=>walk(child,visit));else if(value&&typeof value==='object')walk(value,visit);}
 walk(ast,node=>{if(node.type==='VariableDeclarator'&&node.id?.name==='GSISTeachingRules')engines.push(node.init);});
 if(engines.length!==1)throw Error('Teaching engine baseline changed');
 const engine=engines[0],eligible=[];walk(engine,node=>{if(node.type==='FunctionDeclaration'&&node.id?.name==='eligible')eligible.push(node);});
 if(eligible.length!==1)throw Error('Teaching eligibility baseline changed');
 const node=eligible[0],resolvers=[];walk(engine,item=>{if(item.type==='FunctionDeclaration'&&item.id?.name==='resolve')resolvers.push(item);});
 if(resolvers.length!==1)throw Error('Teaching classification baseline changed');
 const renamed=(item,name)=>source.slice(item.start,item.id.start)+name+source.slice(item.id.end,item.end);
 const legacyClassification=renamed(node,'legacyClassificationEligible')+'\n'+renamed(resolvers[0],'legacyClassificationResolve')+"\nfunction classificationEligible(role,catalogue){return legacyClassificationEligible(legacyClassificationResolve({role:role},catalogue));}\n";
 let body=source.slice(engine.start,node.start)+"function eligible(t){return t.teachingEligibility?.state==='eligible';}"+source.slice(node.end,engine.end);
 body=replaceOnce(body,"if(Array.isArray(catalogue)){p['EO Appt Level']=rule?String(rule.level||''):'';out.groups=rule?memberships(rule.role,rule.level,rule.groups):[];}","out.groups=(live&&live.groups||t.groups||[]).slice();out.authority=live&&live.authority||t.authority||{};out.teachingEligibility=(live||t).teachingEligibility||{state:'unavailable',reasons:['Current Contacts eligibility is unavailable.']};",'Accepted Contacts facts remain authoritative');
 body=replaceOnce(body,"out.active=p.Active==='Y';","out.active=(live||t).active===true;",'Deploy proposed Active cannot promote accepted employment activity');
 body=replaceOnce(body,'return {memberships:memberships,resolve:resolve,eligible:eligible,',legacyClassification+'return {memberships:memberships,resolve:resolve,classificationEligible:classificationEligible,eligible:eligible,','Separate catalogue classification from current teacher eligibility');
 return source.slice(0,engine.start)+body+source.slice(engine.end);
}
function updateDeployContactsReports(source){
 source=replaceOnce(source,"if(doc.membership)roleCatalogue=doc.membership.map(r=>({role:r[0],level:r[12],groups:['SL','SC','SMC','KP','TL','SDT','CMT','SAT','Support','MK'].filter((k,i)=>r[i+2]==='1')}));",'', 'Contacts reports do not rebuild a role authority catalogue');
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'script'}),edits=[];
 const offload=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='offloadPage'),sort=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='wireSort');
 if(!offload||!sort)throw Error('Visual baseline changed: Contacts report consumers');
 const offloadCode=source.slice(offload.start,offload.end),roleChoices='roleCatalogue.map(r=>r.role)';
 if(offloadCode.split(roleChoices).length!==3)throw Error('Visual baseline changed: Offload descriptive role choices');
 edits.push([offload.start,offload.end,offloadCode.replaceAll(roleChoices,'(hrTermLists().Role||[])')]);
 edits.push([sort.start,sort.end,replaceOnce(source.slice(sort.start,sort.end),'table:not([data-no-sort])','table:not([data-no-sort]):not([data-contacts-reference])','Contacts reference reports use the shared table sorter')]);
 for(const [name,key,fields] of [
  ['membershipPage','contactsMemberships',['Staff ID','TTb Name','Role','Memberships']],
  ['masterOptionsPage','contactsFacts',['Staff ID','TTb Name','Field','Value']],
 ]){
  const fn=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name===name);
  if(!fn)throw Error('Visual baseline changed: Contacts reference report '+name);
  const body=`{const fields=${JSON.stringify(fields)},rows=Array.isArray(v().${key})?v().${key}:[];root.innerHTML='<p class="hint">Contacts reference. Edit staff facts in Contacts → Edit Info. These reports do not grant authority.</p>'+table(fields,rows.length?rows.map(row=>'<tr>'+fields.map((_,index)=>'<td style="white-space:pre-line">'+esc(row[index])+'</td>').join('')+'</tr>'):['<tr><td colspan="4">No Contacts facts are available.</td></tr>']);root.querySelector('table').setAttribute('data-contacts-reference','');}`;
  edits.push([fn.body.start,fn.body.end,body]);
 }
 for(const [start,end,body] of edits.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+body+source.slice(end);
 return source;
}
function updateDeploy(source){
 source=replaceOnce(source,'return [...byId.values()].filter(t=>!t.active||eligibleTeacher(t));','return [...byId.values()].filter(t=>!t.active||eligibleTeacher(t)||t.orphan||(v().assignments||[]).some(a=>a.teacher===t.id)||Object.hasOwn(v().teacherNotes||{},t.id)||Object.hasOwn(v().teacherDrafts||{},t.id));','Teachers inventory retains historical references independently of new choices');
 source=replaceOnce(source,'.filter(value=>eligibleTeacher({role:value}))','.filter(value=>GSISTeachingRules.classificationEligible(value,roleCatalogue.length?roleCatalogue:undefined))','Offload catalogue labels preserve their legacy negative classification filter');
 source=replaceOnce(source,"profile.Active='Y';queueCell({operation:'upsertTeacherProfile',teacher:t.id,profile,expected:","queueCell({operation:'upsertTeacherProfile',referenceAction:'add-existing',teacher:t.id,profile,expected:",'Deploy Add existing uses current accepted eligibility without activating staff');
 source=replaceOnce(source,"(!t.active?' <small>Inactive</small>':'')","(!t.active?(t.activeKnown===false?' <small>Activity unknown</small>':' <small>Inactive</small>'):'')+(t.teachingEligibility?.state==='unavailable'?' <small>Teaching eligibility unavailable</small>':t.teachingEligibility?.state==='excluded'?' <small>Not currently eligible</small>':'')",'Deploy teacher inventory distinguishes activity and teaching eligibility');
 source=updateFortnightEditor(source);
 source=updateDeployRecovery(source);
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
 source=source.replaceAll('if(kp()&&admin())','if(kp())');
 source=source.replaceAll('Purge entire log for this version','Archive audit display').replaceAll('Permanently purge this version’s audit log?','Archive this version’s audit display? Immutable audit and recovery evidence are retained.');
 source=replaceOnce(source,"const id=t?.id||'new-'+crypto.randomUUID(),p=t?plannerProfile(t)","let id=t?.id||'new-'+crypto.randomUUID();const registrationId=crypto.randomUUID(),p=t?plannerProfile(t)",'Contacts owns new Staff IDs');
 source=replaceOnce(source,"selectionEditor(t?'Edit teacher':'Add teacher',body,d=>{const profile=read(d);","selectionEditor(t?'Edit teacher':'Add teacher',body,async d=>{const profile=read(d);",'Asynchronous permanent Staff ID registration');
 source=replaceOnce(source,"queueCell({operation:'upsertTeacherProfile',teacher:id,profile,expected:v().teacherDrafts?.[id]||v().teachers.find(r=>r.id===id)?.profile||null})","if(!t&&id.startsWith('new-')){const registered=await window.GSISV1.request('deploy','/staff/register',{method:'POST',body:{operationId:registrationId,basicName:profile['Basic Name']}});if(registered.state!=='committed'||!(registered.result?.staffId||registered.staffId))throw Error('The permanent staff identity is not yet confirmed. Retry this same registration.');id=registered.result?.staffId||registered.staffId;}queueCell({operation:'upsertTeacherProfile',teacher:id,profile,expected:v().teacherDrafts?.[id]||v().teachers.find(r=>r.id===id)?.profile||null})",'Use confirmed Contacts Staff ID');
 source=source.replaceAll('data-version-action="publish" \'+(!admin()?\'disabled\':\'\')','data-version-action="publish" \'+(!window.GSISV1.capable(\'deploy.publish\')?\'disabled\':\'\')');
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
 source=updateDeployContactsReports(source);
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
function updateRosterLocalExport(source) {
 const repaired = 'const source=localExportContext(s),data=draftCopy(source),queue=draftFor(s),assignments=(s.data.allocationModel?.assignments||[]).filter(a=>(!a.date||a.date===s.date)&&!a.remove&&!a.invalidCover';
 const original = "const source=s.data?.exportContext;if(!source||source.date!==s.date||source.revision!==s.data.revision||!source.teacherSummary?.plan)throw Error('The complete export data for this date has not loaded. Refresh records once while online, then export locally.');\n  const data=draftCopy(source),queue=draftFor(s),assignments=(s.data.allocationModel?.assignments||[]).filter(a=>!a.remove&&!a.invalidCover";
 // v0.9's independent repair may land before this v1 adaptation.
 const upstreamRepaired = source.includes(repaired);
 source = replaceOnce(source, upstreamRepaired ? repaired : original,
  'const data=window.GSISRosterLocalExport.context(s.date,hydrateTimetable(s,s.data),id=>person(s,id).name,()=>s.ctx.timetablePreload?.getPlan?.(s.date)),queue=draftFor(s),assignments=s.data.allocationModel.assignments.filter(a=>(!a.date||a.date===s.date)&&!a.remove&&!a.invalidCover',
  'Roster Excel snapshots use the selected date and current local draft');
 source = replaceOnce(source,
  'data.legend=data.snapshotLabel+\'. \'+data.legend;return data;',
  "if(data.workloadEvidence?.quality==='estimated')data.snapshotLabel+=' · Estimated workload';\n  data.legend=data.snapshotLabel+'. '+data.legend;return data;",
  'Roster Excel flags estimated workload on every workbook');
 if (upstreamRepaired) return source;
 source = replaceOnce(source,
  'It is warmed when the page loads; load it on demand if it has not arrived yet.',
  'Use only the baseline already available locally.',
  'Roster Excel baseline cache policy');
 return replaceOnce(source,
  'if(!baseline&&s.ctx.localTimetable){try{baseline=await s.ctx.localTimetable(date);}catch{baseline=null;}}',
  'if(!baseline)baseline=s.ctx.cachedTimetable?.(date)||null;',
  'Roster Excel never starts a timetable request');
}
// Native settings consume complete saved views. Check the original operation's
// committed view before native cleanup; this is not a second receipt protocol.
function updateRosterAdminSettings(source, settings) {
 const confirmation = function rosterAdminSaveConfirmed(data, input) {
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const equal = (left, right) => {
   if (left === right) return true;
   if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((value, index) => equal(value, right[index]));
   if (!object(left) || !object(right)) return false;
   const keys = Object.keys(left);
   return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equal(left[key], right[key]));
  };
  const receipt = data?.receipt, committed = receipt?.result, revision = input.revision + 1;
  if (!Number.isSafeInteger(input.revision) || input.revision < 0 || !Number.isSafeInteger(revision) || !object(data) || !object(committed) || receipt.state !== 'committed' || receipt.operationId !== input.requestId || !Number.isSafeInteger(receipt.fence) || receipt.fence < 1 || !/^[a-f0-9]{64}$/.test(receipt.digest || '')) return false;
  for (const view of [data, committed]) if (view.requestId !== input.requestId || view.revision !== revision || view.acceptedRevision !== revision || !Array.isArray(view.savedIds)) return false;
  if (!equal(data.savedIds, committed.savedIds)) return false;
  if (input.operation === 'saveTypes') {
   const ids = input.types?.map(type => type.id);
   for (const view of [data, committed]) if (view.date !== input.date || !Array.isArray(view.types) || !Array.isArray(view.periods) || !equal(view.types.map(type => type?.id), ids) || !view.types.every(type => object(type) && typeof type.id === 'string' && !!type.id && typeof type.label === 'string' && ['requiresDetail', 'allowSelectAll', 'todayOnly'].every(key => typeof type[key] === 'boolean') && (type.allowedPeriods === null || Array.isArray(type.allowedPeriods)) && ['afterMinutes', 'minStartMinutes'].every(key => type[key] === null || Number.isSafeInteger(type[key])))) return false;
   return equal(data.types, committed.types) && equal(data.periods, committed.periods);
  }
  const arrays = ['periods', 'employmentTypes', 'subjects', 'consecutiveSubjects', 'teachingGroups', 'preferenceRules'];
  const configArrays = ['allocationPreferences', 'consecutiveSubjectRules', 'consecutiveCountExclusions', 'noReliefSubjects', 'subjectFamilies', 'teachingGroupOverrides', 'reliefHealthPeriods', 'employmentPeriodRestrictions', 'sharedSubjectCoverSubjects'];
  for (const view of [data, committed]) {
   if (view.canEdit !== true || !view.savedIds.includes('systemConfig') || !object(view.config) || !arrays.every(key => Array.isArray(view[key])) || !(view.baseline === null || object(view.baseline)) || typeof view.schedulerAvailable !== 'boolean' || !(view.nameBridges === null || object(view.nameBridges))) return false;
   const config = view.config;
   if (!configArrays.every(key => Array.isArray(config[key])) || !object(config.allocationRuleEnabled) || !object(config.smcSummaryTimes) || !['morning', 'evening'].every(key => Array.isArray(config.smcSummaryTimes[key]))) return false;
   if (!['googleBackupLagMinutes', 'maxDailyPeriods', 'maxConsecutivePeriods', 'maxDailyReliefPeriods', 'adhocReliefMaxPeriods'].every(key => Number.isSafeInteger(config[key])) || !['scheduledAllocationEnabled', 'allowAdvancePublishing', 'verboseLogging', 'sharedSubjectCoverEnabled'].every(key => typeof config[key] === 'boolean')) return false;
   const backup = config.driveBackup, daily = config.driveDaily;
   if (!object(backup) || typeof backup.enabled !== 'boolean' || !Number.isSafeInteger(backup.sizeAlertMiB) || !['homeBaseFolderId', 'folderId', 'continuitySheetId'].every(key => typeof backup[key] === 'string') || !object(daily) || typeof daily.enabled !== 'boolean' || !['folderId', 'auditFolderId'].every(key => typeof daily[key] === 'string')) return false;
  }
  return ['canEdit', 'config', ...arrays, 'baseline', 'schedulerAvailable', 'nameBridges'].every(key => equal(data[key], committed[key]));
 };
 const anchor = settings ? ' function reportSaveConfirmed(data,request){' : ' async function sendPending(s,checkReceipt=false,task=pendingFor(s)){';
 source = replaceOnce(source, anchor, ' ' + confirmation.toString() + '\n' + anchor, 'Roster administrative complete-view confirmation');
 if (settings) {
  source = replaceOnce(source, "const data=await s.ctx.api('operations',request.input);", "const data=await s.ctx.api('operations',request.input);if(request.input.operation==='saveSystemConfig'&&!rosterAdminSaveConfirmed(data,request.input))throw Error('The saved system settings could not be confirmed. Retry the same request.');", 'Roster System Config confirmation before pending cleanup');
  source = replaceOnce(source, "if(s.ctx.profile.user.admin&&validateWorkloadRules(s)&&validateSummaryTimes(s)&&validateSubjectBusiness(s)&&validateConsecutiveRules(s))save(s,'saveSystemConfig',d);", `if(!s.ctx.profile.user.admin)return;try{if(!validateSummaryTimes(s)||!validateSubjectBusiness(s))return;const payload=copy(d);for(const key of ['allocationRuleEnabled','allocationPreferences','maxDailyPeriods','maxConsecutivePeriods','maxDailyReliefPeriods','adhocReliefMaxPeriods','consecutiveSubjectRules']){if(Object.hasOwn(s.data.config,key))payload[key]=copy(s.data.config[key]);else delete payload[key];}save(s,'saveSystemConfig',payload);}catch(error){message(s,error.message||'Check the settings before saving.',true);}`, 'Roster editable settings validate without changing hidden compatibility fields');
 } else source = replaceOnce(source, 'const result=await s.ctx.api(task.route,task.payload);', "const result=await s.ctx.api(task.route,task.payload);if(task.payload.operation==='saveTypes'&&!rosterAdminSaveConfirmed(result,task.payload))throw Error('The saved absence types could not be confirmed. Retry the same request.');", 'Roster absence-type confirmation before pending cleanup');
 return source;
}
// Resolve only the two established legacy subject pairs. Keep exact source
// identities and detect contradictory definitions before serializing v1 XML.
function updateAscSubjectIdentity(source) {
 const begin = '/* GSIS_ASC_EXPORT_BEGIN */', end = '/* GSIS_ASC_EXPORT_END */';
 const start = source.indexOf(begin), finish = source.indexOf(end, start);
 if (start < 0 || finish < start || source.indexOf(begin, start + begin.length) !== -1) throw Error('Embedded ASC asset baseline changed');
 const before = source.slice(0, start), after = source.slice(finish);
 source = source.slice(start, finish);
 const helpers = [
  function subjectAlternative(subject) {
   if (subject === 'Science') return 'Sci';
   if (subject === 'Sci') return 'Science';
   if (subject === 'PE') return 'PHE';
   if (subject === 'PHE') return 'PE';
  },
  function comparableSubjectValue(value) {
   if (Array.isArray(value)) return value.map(comparableSubjectValue);
   if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, comparableSubjectValue(value[key])]));
   return value;
  },
  function splitSubjectValue(split) {
   if (!split || typeof split !== 'object' || Array.isArray(split)) return split;
   const enabled = split.enabled === true, keys = enabled ? ['fs', 'fd', 'ft'] : ['ws', 'wd', 'wt'];
   return {enabled, counts: keys.map(key => split[key] === undefined || split[key] === '' ? 0 : split[key])};
  },
  function blockSubjectValue(blocks) {
   const counts = new Map();
   for (const block of blocks) {
    const key = JSON.stringify([block.length, block.week]);
    counts.set(key, (counts.get(key) || 0) + block.count);
   }
   return [...counts].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  },
  function mappingSubjectValue(mapping) {
   return {code: mapping.code, name: mapping.name};
  },
  function subjectValue(values, exact, alternative, issues, field, label, compare = comparableSubjectValue) {
   const hasExact = own(values, exact), hasAlternative = alternative !== undefined && own(values, alternative);
   if (hasExact && hasAlternative && JSON.stringify(compare(values[exact])) !== JSON.stringify(compare(values[alternative]))) {
    issues.push({field, message: label + ': conflicting definitions for ' + exact + ' and ' + alternative + '. Review the source subject keys.'});
   }
   return hasExact ? values[exact] : hasAlternative ? values[alternative] : undefined;
  },
  function sourceSubject(d, level, subject, issues, group, assigned = true) {
   // An independent TG load keeps the existing export profile's identity;
   // unused level defaults must not rename that teaching event. The legacy
   // unassigned-only profile used its raw subject identity instead.
   if (group && (group.weeklyPeriods !== undefined && group.weeklyPeriods !== null || vg().levels(group).length !== 1)) {
    if (!assigned) return subject;
    return subject === 'Science' ? 'Sci' : subject === 'PE' ? 'PHE' : subject;
   }
   const loads = d.loads?.[String(level)], alternative = subjectAlternative(subject);
   subjectValue(loads, subject, alternative, issues, 'demand', 'P' + level + ' subject load');
   return !own(loads, subject) && alternative !== undefined && own(loads, alternative) ? alternative : subject;
  },
  function sourceGroupLoad(d, group, subject) {
   // The TG override, including zero or an invalid value, must never fall back.
   if (group.weeklyPeriods !== undefined && group.weeklyPeriods !== null || vg().levels(group).length !== 1) return vg().periods(d, group);
   return wl().rate(d, vg().levels(group)[0], subject);
  },
  function sourceMapping(settings, subject, issues) {
   return subjectValue(settings.subjects, subject, subjectAlternative(subject), issues, 'subjects', 'Export subject mapping', mappingSubjectValue);
  },
  function sourceBlocks(d, event, settings, issues) {
   const alternative = subjectAlternative(event.subject);
   const splitKey = JSON.stringify([event.level, event.subject]);
   const splitAlternative = alternative === undefined ? undefined : JSON.stringify([event.level, alternative]);
   const split = subjectValue(d.fortnight, splitKey, splitAlternative, issues, 'blocks', event.label + ' source split', splitSubjectValue);
   const blockAlternative = alternative === undefined ? undefined : JSON.stringify([event.kind, event.target, alternative]);
   const explicit = subjectValue(settings.blocks, event.key, blockAlternative, issues, 'blocks', event.label + ' export blocks', blockSubjectValue);
   if (explicit !== undefined) return explicit;
   if (event.kind === 'duty') return [{length: 1, count: 1, week: 'all'}];
   if (!split || split.enabled === true) return null;
   const values = ['ws', 'wd', 'wt'].map(key => split[key]);
   if (values.every(value => value === undefined || value === '')) return null;
   if (values.some(value => value !== undefined && value !== '' && (!Number.isInteger(value) || value < 0))) return null;
   return values.flatMap((value, index) => value ? [{length: index + 1, count: value, week: 'all'}] : []);
  },
 ];
 const syntax = parse(source, {ecmaVersion: 'latest', sourceType: 'script'}), matches = [];
 function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'sourceBlocks') matches.push(node);
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
 }
 walk(syntax);
 if (matches.length !== 1) throw Error('ASC source block resolver baseline changed');
 const block = matches[0];
 source = source.slice(0, block.start) + source.slice(block.end);
 source = replaceOnce(source, " const alias=s=>s==='PE'?'PHE':s==='Science'?'Sci':s;", helpers.map(helper => helper.toString()).join('\n'), 'ASC source subject helpers');
 source = replaceOnce(source,
  "   const key=JSON.stringify([kind,target,subject]);let e=events.get(key);",
  "   const key=JSON.stringify([kind,target,subject]);let e=events.get(key);\n   const alternative=subjectAlternative(subject);if(alternative!==undefined&&events.has(JSON.stringify([kind,target,alternative])))fail(label+': multiple source subject aliases describe the same teaching target. Review them before export.');",
  'ASC duplicate alias demand');
 source = replaceOnce(source, 'venues=new Map(),events=new Map();', 'venues=new Map(),events=new Map(),assignmentSubjects=new Map();', 'ASC original assignment identities');
 source = replaceOnce(source,
  "   for(const subject of a.subject==='FT'?FT:[alias(a.subject)]){\n    const load=g?vg().periods(d,g):wl().rate(d,c.level,subject),kind=g?'tg':'class',target=g?.id||c.ref;",
  "   for(const rawSubject of a.subject==='FT'?FT:[a.subject]){\n    const sourceLevel=g?(g.level??vg().levels(g)[0]??''):c.level,subject=sourceSubject(d,sourceLevel,rawSubject,issues,g);\n    const load=g?sourceGroupLoad(d,g,subject):wl().rate(d,c.level,subject),kind=g?'tg':'class',target=g?.id||c.ref;\n    const targetKey=JSON.stringify([kind,target]),seen=assignmentSubjects.get(targetKey)||new Set();if(seen.has(subjectAlternative(rawSubject)))fail('Target '+target+': multiple source subject aliases describe the same teaching target. Review the assignments before export.');seen.add(rawSubject);assignmentSubjects.set(targetKey,seen);",
  'ASC exact source load identity');
 source = replaceOnce(source,
  "put('class',c.ref,subject,wl().rate(d,c.level,subject),[],[],vg().key(c)+' '+subject,c.level,[c.ref])",
  "put('class',c.ref,sourceSubject(d,c.level,subject,issues),wl().rate(d,c.level,subject),[],[],vg().key(c)+' '+subject,c.level,[c.ref])",
  'ASC unassigned source load checks');
 source = replaceOnce(source,
  "   for(const g of groups.values())put('tg',g.id,g.subject,vg().periods(d,g),[],[],g.name,g.level,[]);",
  "   for(const g of groups.values()){let subject=sourceSubject(d,g.level,g.subject,issues,g,false);const alternative=subjectAlternative(subject),assigned=events.get(JSON.stringify(['tg',g.id,subject]))||(alternative!==undefined?events.get(JSON.stringify(['tg',g.id,alternative])):undefined);if(assigned)subject=assigned.subject;put('tg',g.id,subject,sourceGroupLoad(d,g,subject),[],[],g.name,g.level,[]);}",
  'ASC unassigned TG load identity');
 source = replaceOnce(source, 'mapped(s.subjects,raw)', 'sourceMapping(s,raw,blockers)', 'ASC source subject crosswalk');
 source = replaceOnce(source, 'mapped(s.subjects,e.subject)', 'sourceMapping(s,e.subject,blockers)', 'ASC event subject crosswalk');
 source = replaceOnce(source, 'sourceBlocks(d,e,s)', 'sourceBlocks(d,e,s,blockers)', 'ASC split conflict evidence');
 return before + source + after;
}

function transform(module,rel,text){
 for(const [host,id]of Object.entries(productionHosts))text=text.replaceAll('https://'+host+'/', '/'+id+'/').replaceAll('https://'+host, '/'+id+'/');
 for(const id of ['contacts','deploy','roster','calendar','layout','venues','lord','overlord','starlord'])text=text.replaceAll('https://'+id+'.gsps.edu.sg/', '/'+id+'/').replaceAll('https://'+id+'.gsps.edu.sg','/'+id+'/');
 if(rel.endsWith('.html')){
  text=text.replace(/\b(src|href|action)=(['"])\/(?!\/|api\/)([^'"]*)\2/g,(_m,key,q,value)=>`${key}=${q}/${module.id}/${value}${q}`);
  text=text.replace('</head>',`<meta name="gsis-module" content="${module.id}"><link rel="stylesheet" href="/v1/shared/suite.css"><script src="/v1/shared/client.js"></script><script defer src="/v1/shared/module-shell.js"></script><link rel="stylesheet" href="/v1/shared/core-table.css"><script type="module" src="/v1/shared/core-table.js"></script></head>`);
  text=normaliseReleaseChrome(text,gsisBuildLabel,{ensureHeaderLabel:['lord','starlord','overlord'].includes(module.id)&&rel==='index.html',labelTitle:rel==='index.html'}).replaceAll('Dropdown choices are managed in Deploy.','Dropdown choices and accepted staff facts are managed in Contacts.').replaceAll('Admin access is managed in the backend sheet. Admins can assign or remove SMC access here.','Application access is managed in Core. Accepted SMC, EO and School Leader records are managed separately in Contacts.');
  if(module.id==='contacts'&&rel==='index.html')text=text.replace('</head>','<link rel="stylesheet" href="/v1/shared/contacts-ui.css"><script defer src="/v1/shared/contacts-ui.js"></script></head>');
  if(module.id==='deploy'&&rel==='index.html')text=text.replace('</head>','<script type="module" src="/v1/shared/deploy-ui.js"></script><script type="module" src="/v1/shared/deploy-loads-ui.js"></script><script type="module" src="/v1/shared/deploy-ui-tables.js"></script><script type="module" src="/v1/shared/deploy-departments-ui.js"></script></head>');
  if(module.id==='roster'&&rel==='index.html')text=text.replace('</head>','<link rel="stylesheet" href="/v1/shared/roster-capacity.css"><script src="/v1/shared/roster-capacity.js"></script><link rel="stylesheet" href="/v1/shared/roster-stapler-resize.css"><script defer src="/v1/shared/roster-stapler-resize.js"></script><script defer src="/v1/shared/roster-table-ui.js"></script><script defer src="/v1/shared/roster-local-export.js"></script></head>');
  if(module.id==='calendar'&&rel==='index.html')text=text.replace('</head>','<link rel="stylesheet" href="/v1/shared/calendar-ui.css"><script type="module" src="/v1/shared/calendar-ui.js"></script></head>');
  if(module.id==='contacts'&&rel==='index.html')text=text.replace('</body>','<script type="module" src="/v1/shared/contacts-authority.js"></script></body>');
  if(module.id==='roster'&&rel==='index.html')text=text.replaceAll('/roster/system-health.html','/admin/#health').replace('</body>','<script type="module" src="/v1/shared/roster-import.js"></script><script type="module" src="/v1/shared/roster-policy-ledger.js"></script><script type="module" src="/v1/shared/roster-continuity.js"></script></body>');
  if(module.id==='venues'&&rel==='index.html')text=text.replace('</body>','<script type="module" src="/v1/shared/venues-register.js"></script></body>');
  if(module.id==='layout'&&rel==='index.html')text=text.replace('</body>','<script type="module" src="/v1/shared/layout-editor.js"></script></body>');
  if(module.id==='deploy'&&rel==='index.html')text=text.replace('</body>','<script type="module" src="/v1/shared/deploy-publication.js"></script></body>');
  if(module.id==='lord'&&rel==='index.html')text=text.replace('</body>','<script type="module" src="/v1/shared/lord-user.js"></script></body>');
  if(module.id==='starlord'&&rel==='index.html')text=replaceOnce(text,'<script src="assets/app.js','<script src="/v1/shared/starlord-photos.js"></script><script src="assets/app.js','STARLORD photo adapter before source renderer');
  if(module.id==='overlord'&&rel==='index.html')text=replaceOnce(text,'<script src="assets/app.js','<script src="/v1/shared/lord-reference-tables.js"></script><script src="/v1/shared/reign.js"></script><script src="/v1/shared/lord-admin.js"></script><script src="assets/app.js','OVERLORD exact viewed revision adapter').replace('</body>','<script type="module" src="/v1/shared/signage.js"></script></body>');
 }
 if(rel.endsWith('.js')&&!rel.includes('vendor/')&&!/\.min\.js$/.test(rel)){
  if(module.id==='starlord'&&rel==='assets/app.js')text=updateStarlord(text);
  if(module.id==='lord'&&rel==='assets/app.js'){
   text=updateLordPreparation(text);
   text=text.replaceAll('<strong>Bookings cannot be edited.</strong> If any detail is wrong, cancel the booking and make a new booking.','<strong>Bookings can be revised before collection.</strong> Use Edit my bookings to revise a saved booking. You can also cancel and make a new booking.');
   text+=`\nwindow.addEventListener('gsis:clear-protected-state',()=>{state.referenceGeneration++;resetStateKeepTeacher(false);state.auth.session=null;state.reference=null;state.identity.teacher='';main.replaceChildren();});`;
   text=replaceOnce(text,"try { await lordFetch('/api/auth/logout', { method: 'POST', timeoutMs: 8000 }); } catch {}","try { await window.GSISV1.logout();location.assign('/');return; } catch(error) {setReloadDataStatus(error.message,true);return;}",'LORD sign-out must be confirmed');
   text=replaceOnce(text,"bookingId: state.loan.booking?.bookingId || '',","bookingId: state.loan.booking?.bookingId || '', revision:state.loan.booking?.revision,",'LORD collection preview revision');
   text=replaceOnce(text,"sessionId: state.return.selectedSession.sessionId,","sessionId: state.return.selectedSession.sessionId, bookingId:state.return.selectedSession.bookingId, revision:state.return.selectedSession.revision,",'LORD return preview revision');
   text=replaceOnce(text,"async function submitBookingResponse(payload,context) {","async function submitBookingResponse(payload,context) {\n  payload={...payload,revision:payload.revision??context.booking.revision};",'LORD explicit declaration preview revision');
  }
  if(module.id==='contacts'&&rel==='app.js')text=updateContacts(text);
  if(module.id==='venues'&&rel==='app.js'){
   const register = text.match(/ function registerSection\(data\)\{[^\n]+\n/);
   if(!register)throw Error('Venues physical register source changed');
   text=text.replace(register[0], " function registerSection(data){if(!state.permissions.admin)return '';window.GSISV1VenueRegisterContext={register:data.register,refresh:async()=>{await boot();}};queueMicrotask(()=>window.GSISV1VenueRegisterMount?.(window.GSISV1VenueRegisterContext));return '<section class=\"card\" id=\"v1VenueRegister\"></section>';}\n");
   text=replaceOnce(text,"history.replaceState(null,'','/?'+p);","history.replaceState(null,'','/venues/?'+p);",'Venues query navigation retains its module subpath');
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
   text=replaceOnce(text,"      week: week.Week || '',","      week: week.Week ?? '',",'Calendar numeric Week 0 metadata');
   text=replaceOnce(text,"((week.Term && week.Week) ? `T${week.Term}W${week.Week}` : '')","((week.Term && week.Week !== '' && week.Week != null) ? `T${week.Term}W${week.Week}` : '')",'Calendar Week 0 fallback label');
   text=text.replaceAll("meta.term&&meta.week?", "meta.term&&meta.week!==''&&meta.week!=null?").replaceAll("esc(meta.week||'')", "esc(meta.week??'')");
   text=replaceOnce(text,"structureMetaForDate(ctx.structure,isoDate(weekStart))","structureMetaForDate(ctx.structure,isoDate(weekStart)<state.year+'-01-01'?state.year+'-01-01':isoDate(weekStart))",'Calendar opening partial weekly row');
   text=replaceOnce(text,"structureMetaForDate(ctx.structure,first.dataset.date)","structureMetaForDate(ctx.structure,first.dataset.date<state.year+'-01-01'?state.year+'-01-01':first.dataset.date)",'Calendar opening weekly refresh');
   text=replaceOnce(text,"Writing term/vacation structure and 44 multi-day Events…","Saving term/vacation structure and Calendar event records…",'Calendar generation progress');
   text=replaceOnce(text,"multi-day Staff Calendar Event records created/updated.","Calendar event records created/updated. Saved in GSiS; Google Calendar sync is separate.",'Calendar generation delivery boundary');
   text=replaceOnce(text,"? `<br>${esc(flash.multiDayEventsCreatedOrUpdated)}", "? `<br>${esc(flash.materialisedEventCount ?? flash.multiDayEventsCreatedOrUpdated)} generated event records retained in this year. ${esc(flash.multiDayEventsCreatedOrUpdated)}",'Calendar receipt-backed retained count');

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
   for(const attr of ['data-workload-rules','data-consecutive-rules','data-preferences','data-default-preferences'])text=text.replaceAll(attr+' class=',attr+' hidden class=').replaceAll(attr+'>',attr+' hidden>');
   text=text.replaceAll('Annual R utilisation is first by default; same subject is last by default.','Layer settings below use daily capacity first by default.');
   text=text.replaceAll('<h4>Business preferences</h4>','<h4>Allocation layers</h4><p>Use Allocation layers and duties done below for the current per-layer limits, subject continuity and preference order. These settings replace the older annual-utilisation preferences.</p>');
   text=updateRosterAdminSettings(text,true);
  }
  if(module.id==='roster'&&rel==='roster-operations-ui.js')text=updateRosterLocalExport(removeRosterQuietMode(updateRosterAdminSettings(updateRosterCapacity(text),false)));
  if(module.id==='deploy'&&rel==='app.js')text=updateDeploy(text);
  if(module.id==='deploy'&&rel==='app.js')text=updateAscSubjectIdentity(text);
  if(module.id==='deploy'&&(rel==='app.js'||rel==='teaching-rules.js'))text=updateDeployTeachingEligibility(text);
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
 async function overlay(source,relative=''){for(const entry of await readdir(source,{withFileTypes:true})){const rel=path.join(relative,entry.name),src=path.join(source,entry.name);if(entry.isDirectory()){await overlay(src,rel);continue;}const dest=path.join(output,rel);await mkdir(path.dirname(dest),{recursive:true});if(rel.endsWith('.html'))await writeFile(dest,normaliseReleaseChrome(await readFile(src,'utf8'),gsisBuildLabel));else await copyFile(src,dest);}}
 await overlay(path.join(root,'v1/web/overlays'));
 await mkdir(path.join(output,'v1/shared'),{recursive:true});
 for(const entry of await readdir(path.join(root,'v1/web/shared'),{withFileTypes:true})){if(!entry.isFile())continue;await copyFile(path.join(root,'v1/web/shared',entry.name),path.join(output,'v1/shared',entry.name));}
 await writeFile(path.join(output,'v1/modules.json'),JSON.stringify(modules.map(({source,...module})=>module))+'\n');
 const finalAssets=[];const sources=new Map(inventory.map(item=>[item.path,item.source]));
 async function finalWalk(dir,relative=''){for(const entry of await readdir(dir,{withFileTypes:true})){const rel=path.join(relative,entry.name),file=path.join(dir,entry.name);if(entry.isDirectory()){await finalWalk(file,rel);continue;}const bytes=await readFile(file);const relpath=rel.replaceAll(path.sep,'/');finalAssets.push({path:relpath,source:sources.get(relpath)||'v1/web/',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});}}
 await finalWalk(output);finalAssets.sort((a,b)=>a.path.localeCompare(b.path));
 await writeFile(path.join(output,'asset-manifest.json'),JSON.stringify({schemaVersion:1,releaseLabel:RELEASE_LABEL,sourceBaseline:'27fa498657965169b9d971a9caabc33c8b19bc69',modules:modules.map(x=>x.id),assets:finalAssets},null,2)+'\n');
 return {output,assets:finalAssets.length,modules:modules.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildWeb(process.argv[2])));
