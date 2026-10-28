function publicationText(row){return (row.publication||'Unpublished')+(row.publishedRevision!=null?' · '+(row.publication==='Published'?'':'Published ')+'r'+row.publishedRevision+' in force':'');}
/* Row-owned version controls and note drafts, independent of the planning queue. */
const versionNoteDrafts=new Map();
function noteSaving(){return [...versionNoteDrafts.values()].some(d=>d.saving);}
function notesUnresolved(){return [...versionNoteDrafts.values()].some(d=>d.saving||d.attempt||d.value!==d.expected);}
function versionNoteDraft(row){
 let d=versionNoteDrafts.get(row.id);
 if(!d){d={value:row.notes||'',expected:row.notes||'',status:'',saving:false,attempt:null};versionNoteDrafts.set(row.id,d);}
 else if(!d.saving&&!d.attempt&&d.value===d.expected&&d.expected!==(row.notes||'')){d.value=d.expected=row.notes||'';d.status='';}
 return d;
}
function updateVersionNoteControls(id){
 const row=[...document.querySelectorAll('[data-version-row]')].find(r=>r.dataset.versionRow===id),d=versionNoteDrafts.get(id);if(!row||!d)return;
 row.querySelector('[data-note-status]').textContent=d.status;const stored=state.versions.find(x=>x.id===id),status=row.querySelector('[data-publication-status]');if(stored&&status)status.textContent=publicationText(stored);if(stored&&id===current)el('tag').textContent=publicationText(stored);
 row.querySelector('[data-note-input]').readOnly=!(admin()||kp())||d.saving||!!d.attempt;
 const save=row.querySelector('[data-note-save]');save.textContent=d.attempt?'Retry save':'Save note';save.disabled=!(admin()||kp())||d.saving||(!d.attempt&&d.value===d.expected);
 row.querySelector('[data-note-review]').hidden=!d.conflict;
}
async function saveVersionNote(id){
 const row=state.versions.find(x=>x.id===id);if(!row||!(admin()||kp()))return;
 const d=versionNoteDraft(row);if(d.saving||noteSaving())return;
 if(queueFlight||busy||editing||acquiring||refreshing){alert('Wait for the current request or close the open edit first.');return;}
 if(!d.attempt&&d.value===d.expected)return;
 d.attempt=d.attempt||{versionId:id,operation:'saveVersionNote',notes:d.value,expected:d.expected,requestId:crypto.randomUUID(),issuedAt:Date.now(),clientId};
 d.saving=true;d.conflict=false;d.status='Saving…';viewEpoch++;updateVersionNoteControls(id);
 const attempt=d.attempt;
 try{
  const result=await api('change',attempt);if(!result.saved||result.versionId!==id||result.requestId!==attempt.requestId)throw Error('Save confirmation unavailable. Retry to confirm.');
  d.expected=attempt.notes;d.attempt=null;d.status='Saved';
  const entry=state.versions.find(x=>x.id===id);if(entry){entry.notes=attempt.notes;if(result.publication)Object.assign(entry,{publication:result.publication,publishedRevision:result.publishedRevision});}
  if(draftBase?.id===id)draftBase.notes=attempt.notes;
  // Keep the existing delta cursor, so unrelated remote changes are still fetched.
 }catch(e){
  d.status=e.message+' Your note is retained.';
  if(e.status>=400&&e.status<500){d.attempt=null;d.conflict=e.status===409;}
 }finally{d.saving=false;updateVersionNoteControls(id);}
}
async function reviewVersionNote(id){
 const d=versionNoteDrafts.get(id);if(!d||d.saving||d.attempt)return;
 d.saving=true;updateVersionNoteControls(id);
 try{const data=await api('versionNote',{versionId:id});if(data.versionId!==id)throw Error('This version is no longer available.');
  const latest=data.notes||'';
  if(confirm('Latest saved note:\n\n'+(latest||'(blank)')+'\n\nKeep your draft and use this as the comparison for your next Save note?')){d.expected=latest;d.conflict=false;d.status='Latest note reviewed. Your draft is retained.';const entry=state.versions.find(x=>x.id===id);if(entry)entry.notes=latest;if(draftBase?.id===id)draftBase.notes=latest;}
 }catch(e){d.status=e.message+' Your note is retained.';}finally{d.saving=false;updateVersionNoteControls(id);}
}
let versionLoad=null;
async function loadVersionRow(id){
 const restoreSelector=()=>{el('version').value=versionLoad?.id||current;};
 if(inlineDraftEditor?.open&&!inlineDraftEditor.requestLeave({redraw:true})){restoreSelector();return false;}
 if(versionCreateAttempt){restoreSelector();alert('Resolve the pending version creation first. Use New planning version or Duplicate to retry the same request.');return false;}
 if(cellQueue.length||queueFlight||unsavedDraft||editing||acquiring||(busy&&!versionLoad)||exclusionEdits.size||notesUnresolved()){restoreSelector();alert('Save or cancel the current edits, including version notes, first.');return false;}
 // Only reads can supersede another version read; pending writes/drafts stay guarded above.
 versionLoad?.controller.abort();versionLoad?.finish();document.querySelector('.version-load-error')?.remove();
 busy=true;viewEpoch++;stopLive();
 const name=state.versions.find(row=>row.id===id)?.name||id,focus=document.activeElement,finishLoading=beginLoading(el('content'),'Loading version: '+name+'…');
 const blocked=[el('nav'),el('viewFilters'),el('viewActions')].filter(Boolean).map(node=>({node,inert:node.inert}));blocked.forEach(({node})=>{node.inert=true;});
 const request={id,focus,epoch:sessionEpoch,view:viewEpoch,controller:new AbortController(),finish:()=>{finishLoading();blocked.forEach(({node,inert})=>{node.inert=inert;});}};versionLoad=request;el('version').value=id;
 const isCurrent=()=>versionLoad===request&&request.epoch===sessionEpoch&&request.view===viewEpoch;
 try{
  const data=await api('sync',{versionId:id,full:true},false,request.controller.signal);
  if(!isCurrent())return false;
  if(data.current?.id!==id)throw Error('This version is no longer available. Refresh the list.');
  acceptSnapshot(data);return current===id;
 }catch(e){
  if(isCurrent()){
   const error=document.createElement('div');error.className='version-load-error';error.setAttribute('role','alert');
   error.append(document.createTextNode('Could not load '+name+'. '+e.message+(current?' The displayed version is unchanged. ':' ')),button('Retry '+name,()=>loadVersionRow(id)));
   el('content').before(error);
  }
  return false;
 }finally{
  if(versionLoad===request){request.finish();versionLoad=null;busy=false;el('version').value=current;controls();if(request.epoch===sessionEpoch){if(document.activeElement===document.body)(request.focus?.isConnected&&request.focus!==document.body?request.focus:el('version')).focus({preventScroll:true});connectLive();}}
 }
}
async function versionRowAction(id,actionName){
 if(!(await loadVersionRow(id)))return;
 if(actionName==='publish'){await reviewTeacherPublication();return;}
 if(actionName==='delete'){if(admin()&&v().status!=='active'&&confirm('Delete “'+v().name+'” and its audit history?')){await action('delete');if(!state.versions.some(x=>x.id===id))versionNoteDrafts.delete(id);}return;}
 if(actionName==='rename'&&(admin()||kp())){
  const row=v();modal('Version details','<label>Name<input id="name" value="'+esc(row.name)+'"></label><label>From<input type="date" id="from" value="'+esc(row.from||'')+'"></label><label>To<input type="date" id="to" value="'+esc(row.to||'')+'"></label>',d=>{if(current!==id)throw Error('Version selection changed. Reopen this row.');return change('metadata',{name:d.querySelector('#name').value,from:d.querySelector('#from').value,to:d.querySelector('#to').value});},'meta');
 }
}
function versions(root){
 root.innerHTML='<p>New planning versions inherit class/TG venues and settings from the selected version. Duplicate retains its teacher assignments and notes too. Save note saves only that row’s note. Unpublished versions can be edited by Admin or KP. Published identifies the snapshot currently shown in Contacts. Saving edits leaves that snapshot unchanged. Admin Publish updates it.</p>';
 root.append(button('New planning version',()=>createVersion(false),!(kp()||admin())),button('Duplicate',()=>createVersion(true),!(kp()||admin())));
 root.append(button('Refresh venue metadata',()=>action('refreshVenueRegistry'),!(kp()||admin())));
 root.append(button('Review current Contacts',async()=>{if(busy||editing||acquiring||exclusionEdits.size||noteSaving())return;busy=true;try{const data=await api('bootstrap',{versionId:current,reviewContacts:true});busy=false;const changes=data.contactChanges||[];modal('Contacts review','<p>Current Contacts is the authority. Accepting updates the staff snapshot and keeps your Teachers proposals; it does not change Contacts.</p><pre style="white-space:pre-wrap">'+esc(changes.length?changes.join('\n'):'No staff differences.')+'</pre>',async()=>{await acquire('meta');await change('acceptContacts')});}catch(e){alert(e.message);}finally{busy=false;}},!admin()));
 root.insertAdjacentHTML('beforeend',table(['Version','Status','Actions','Notes'],state.versions.map(x=>{
  const d=versionNoteDraft(x);return '<tr data-version-row="'+esc(x.id)+'"><td>'+esc(x.name)+(x.id===current?' <small>Selected</small>':'')+'</td><td data-publication-status>'+esc(publicationText(x))+'</td><td><div class="version-row-actions"><button data-version-action="load" '+(x.id===current?'disabled':'')+'>Load</button><button data-version-action="rename" '+(!(kp()||admin())?'disabled':'')+'>Rename / dates</button><button data-version-action="delete" '+(!admin()||x.status==='active'?'disabled':'')+'>Delete</button><button data-version-action="publish" '+(!admin()?'disabled':'')+'>Publish</button></div></td><td><textarea data-note-input class="version-note full-cell-note" rows="3" maxlength="4000" aria-label="Note for '+esc(x.name)+'" '+(!(kp()||admin())||d.saving||d.attempt?'readonly':'')+'>'+esc(d.value)+'</textarea><div class="version-note-controls"><button data-note-save '+(!(kp()||admin())||d.saving||!d.attempt&&d.value===d.expected?'disabled':'')+'>'+(d.attempt?'Retry save':'Save note')+'</button><span data-note-status role="status" aria-live="polite">'+esc(d.status)+'</span><button data-note-review '+(!d.conflict?'hidden':'')+'>Review saved note</button></div></td></tr>';
 })));
 root.querySelectorAll('[data-version-row]').forEach(row=>{const id=row.dataset.versionRow,d=versionNoteDrafts.get(id);row.querySelector('[data-note-input]').oninput=e=>{d.value=e.target.value;d.status=d.value===d.expected?'':'Unsaved note';updateVersionNoteControls(id);};row.querySelector('[data-note-save]').onclick=()=>saveVersionNote(id);row.querySelector('[data-note-review]').onclick=()=>reviewVersionNote(id);row.querySelectorAll('[data-version-action]').forEach(b=>b.onclick=()=>b.dataset.versionAction==='load'?loadVersionRow(id):versionRowAction(id,b.dataset.versionAction));});
}
