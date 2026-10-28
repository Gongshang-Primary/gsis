/* v0.5.02 field store. Legacy snapshots remain untouched for recovery.
   A journal is durable before any field cells change. The index is the commit marker.
   A reader validates the marker after reading; pending writes are never exposed. */
var fieldReadState_=new WeakMap(),fieldCommitState_=new WeakMap();
function fieldSheet_(b,name,headers){gsisRequireBackendRole_('deploy');let s=b.getSheetByName(name);if(!s){s=b.insertSheet(name);s.appendRow(headers);}return s;}
function fieldCapacity_(s,row,n){const max=s.getMaxRows();if(row+n-1>max){s.insertRowsAfter(max,Math.max(100,row+n-1-max));return true;}return false;}
function editFieldKey_(key){const p=JSON.parse(key);return !['audit','layout','venueRegistry','unitGeometry'].includes(p[0])||p[0]==='audit'&&(p.length===1||String(p[1]).startsWith('!order'));}
function fieldName_(id){return 'fields_'+hash_(id).slice(0,24);}
// New writes leave margin below the Sheet cell limit. A durable older journal
// may already exceed that margin, so recovery alone retains the platform limit.
function fieldIndexText_(idx,recovery=false){
 const text=JSON.stringify(idx),limit=recovery?50000:45000;
 if(text.length>limit)error_(400,recovery?'The stored recovery index exceeds the Sheet cell limit. Keep the journal for administrator recovery.':'Deployment index is too large. No new save was started; ask an administrator to archive versions.');
 if(text.length>=35000)console.warn(JSON.stringify({event:'gsis-index-size',characters:text.length,limit,recovery:!!recovery}));
 return text;
}
function fieldIndexWrite_(b,idx,recovery=false){gsisRequireBackendRole_('deploy');if(typeof deployEdgeFence_==='function')deployEdgeFence_({action:'change'});const text=fieldIndexText_(idx,recovery);b.getSheetByName('deploy_index').getRange('B2').setValue(text);deployFlush_();}
function fieldJournal_(b){return fieldSheet_(b,'deploy_field_journal',['Commit','Part','JSON']);}
function fieldJournalWrite_(b,tx,pendingIndex=tx.index,existingJournal,prepare=false){gsisRequireBackendRole_('deploy');
 // Validate both exact index forms before creating/writing the journal or marker.
 const existing=existingJournal===undefined?b.getSheetByName('deploy_field_journal'):existingJournal;
 const text=JSON.stringify(tx),row=existing?existing.getLastRow()+1:2,parts=Math.ceil(text.length/30000),locator={row,parts,commit:tx.commit};
 fieldIndexText_(tx.index);fieldIndexText_({...pendingIndex,pendingFieldCommit:locator});
 const s=existing||fieldJournal_(b),rows=[];for(let i=0;i<text.length;i+=30000)rows.push([tx.commit,rows.length,text.slice(i,i+30000)]);
 const expanded=fieldCapacity_(s,row,rows.length);
 if(prepare&&GSISSheets.enabled())GSISSheets.write(b,[{sheet:s,writes:[{row,col:1,values:rows}]}],false,{flush:!existing||expanded,final:{sheet:b.getSheetByName('deploy_index'),row:2,col:2,values:[[fieldIndexText_({...pendingIndex,pendingFieldCommit:locator})]]}});
 else {s.getRange(row,1,rows.length,3).setValues(rows);deployFlush_();if(prepare)fieldIndexWrite_(b,{...pendingIndex,pendingFieldCommit:locator});}
 return locator;
}
function fieldJournalRead_(b,p){const rows=fieldReadValues_(fieldJournal_(b),p.row,1,p.parts,3);if(rows.some((r,i)=>r[0]!==p.commit||Number(r[1])!==i))error_(503,'Incomplete field journal. Keep the current backend and recover before editing.');return JSON.parse(rows.map(r=>r[2]).join(''));}
function fieldApplyRows_(b,tx,recovery=false){gsisRequireBackendRole_('deploy');fieldIndexText_(tx.index,recovery);let structural=false;const blocks=tx.blocks.map(block=>{const existed=b.getSheetByName(block.sheet),s=existed||fieldSheet_(b,block.sheet,block.headers||['Field','JSON']);if(!existed)structural=true;const end=Math.max(1,...block.writes.map(w=>w.row+w.values.length-1));if(fieldCapacity_(s,1,end))structural=true;return {sheet:s,writes:block.writes};});GSISSheets.write(b,blocks,false,{flush:structural,final:{sheet:b.getSheetByName('deploy_index'),row:2,col:2,values:[[fieldIndexText_(tx.index,recovery)]]}});}
function fieldRecover_(b){gsisRequireBackendRole_('deploy');const idx=index_(b);if(!idx.pendingFieldCommit)return idx;const tx=fieldJournalRead_(b,idx.pendingFieldCommit);if(tx.commit!==idx.pendingFieldCommit.commit)error_(503,'Stored recovery transaction differs from its marker.');fieldApplyRows_(b,tx,true);return tx.index;}
function recoverFieldCommit(){gsisRequireBackendRole_('deploy');const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Save still running. Retry confirmation shortly.');try{return fieldRecover_(book_()).revision;}finally{deployUnlock_(lock);}}
// The transactional projection stores only editing dependencies, never receipt/history leaves.
// Canonical fields, projection and receipt are committed by the same durable journal.
function noteFieldKey_(key){const p=JSON.parse(key);return !p.length||['id','name','notes','pendingUnitRename'].includes(p[0])||p[0]==='audit'&&(p.length===1||String(p[1]).startsWith('!order'));}
function fastFieldKey_(key){const p=JSON.parse(key);return editFieldKey_(key)&&p[0]!=='saveReceipts';}
// Read projections are transactionally maintained with canonical fields. Ordinary loads
// exclude history/receipts before I/O; notices read only their indexed event ranges.
function viewFieldKey_(key){const p=JSON.parse(key);return !['audit','saveReceipts','fieldAuthors'].includes(p[0]);}
function activeFieldKey_(key){const p=JSON.parse(key);return !p.length||['id','classes','groups','assignments','loads','teachers','organisations'].includes(p[0]);}
function projectionMatrix_(fields,predicate){return Object.entries(fields).filter(([k,v])=>v!==''&&predicate(k));}
function projectionRead_(b,entry,scope){
 const name=scope==='active'?entry.activeIndex:entry.viewIndex;
 if(!name)return fieldRead_(b,entry);
 const before=index_(b);if(before.pendingFieldCommit)error_(503,'Save confirmation pending; retry shortly.');const current=[...before.versions,...(before.published?[before.published]:[]),...(before.venuePublications||[])].find(en=>en.id===entry.id&&en.store===entry.store);if(!current||current.commit!==entry.commit)error_(503,'Version changed before reading; retry.');
 const sheet=b.getSheetByName(name);if(!sheet)error_(503,'Missing read projection. Run preparePerformance418 from the Deploy editor.');
 const fields={};if(sheet.getLastRow()>1)fieldReadValues_(sheet,2,1,sheet.getLastRow()-1,2).forEach(([k,v])=>{if(k&&v!=='')fields[k]=v;});
 if(!fields['[]'])error_(503,'Incomplete read projection');
 const roots=new Set(Object.keys(fields).filter(k=>k!=='[]').map(k=>JSON.parse(k)[0])),root=JSON.parse(fields['[]']);root.o=root.o.filter(k=>roots.has(k));fields['[]']=JSON.stringify(root);
 let d=GSISFields.inflate(fields);
 if(scope!=='active'){
  d.audit=[];const notices=scope==='view'?entry.noticeRows||[]:[];
  if(notices.length){const ranges=notices.map(r=>({row:r[1],col:1,height:r[2]-r[1]+1,width:2})),values=fieldReadMany_(b.getSheetByName(entry.store),ranges);
   values.forEach((rows,i)=>{const event={};for(const [k,v] of rows){if(!k||!v)continue;const path=JSON.parse(k);if(path[0]==='audit'&&path[1]==='@'+notices[i][0])event[JSON.stringify(path.slice(2))]=v;}if(event['[]'])d.audit.push(GSISFields.inflate(event));});
  }
  d=model_(d);
 }
 const after=index_(b);if(after.pendingFieldCommit||after.revision!==before.revision)error_(503,'Version changed while reading; retry.');return d;
}
// Small Fortnight/RO saves need these version-owned dependencies, not IP assignments.
const settingsRoots_=['id','name','notes','pendingUnitRename','reporting','fortnight','loads','subjectTypes','workload','teachers','teacherDrafts','membership','fieldAuthors'];
// Explicit dependencies for small saves. Unsupported or destructive edits retain
// the complete editing projection and its cross-assignment validation.
function draftReadScope_(edits){
 const hr=['masterOptions','membership','hrTerms','hrTermsSelected','hrChoicesSchema'],roots=new Set(['id','name','notes','pendingUnitRename','fieldAuthors']);
 const classRows=['classes','classNameSets','groups','loads'],staffRows=[...hr,'teachers','teacherDrafts','removedTeachers','organisations','duties','workload','planning402','committeeRolesSchema'];
 const deps={setAscExportSettings:['ascExport'],clearVenueAssignments:['classes','venues','groups','assignments'],setFortnight:['fortnight','loads','workload'],setReportingOfficer:['reporting','teachers','teacherDrafts','membership'],setOffload:['offload'],setLoad:['loads'],setSubjectType:['loads','subjectTypes'],setReliefSettings:['relief','reliefLegacy','teachers'],setPAL:['pal','classes','assignments','subjectTypes'],setHRTerms:hr,setMasterOptions:hr,setMembership:staffRows,
  setClassAbility:['classes'],upsertClassNameSet:['classNameSets'],deleteClassNameSet:['classNameSets'],addClass:classRows,updateClass:[...classRows,'assignments','venues','pal'],deleteClass:[...classRows,'assignments','venues','pal'],
  setTeacherNote:['teachers','teacherDrafts','membership','teacherNotes'],setExclusionCell:['teachers','teacherDrafts','membership','loads','levelExclusions'],setTeacherField:[...staffRows,'assignments','reporting','relief'],upsertTeacherProfile:[...staffRows,'assignments','reporting','relief']};
 if(!Array.isArray(edits)||!edits.length)return null;
 for(const edit of edits){const op=edit.operation==='patchPlanning'?edit.source:edit.operation;if(!deps[op]||op==='setLoad'&&edit.value===null)return null;deps[op].forEach(k=>roots.add(k));}
 return {roots:[...roots],venueClearOnly:edits.every(x=>x.operation==='clearVenueAssignments'),...(edits.every(x=>x.operation==='setExclusionCell')?{exclusions:{teachers:[...new Set(edits.map(x=>String(x.teacher)))],authors:[...new Set(edits.map(x=>'exclusion:'+x.teacher+':'+x.level))]}}:{})};
}
function scopedFieldKey_(key,roots){const p=JSON.parse(key);return !p.length||roots.includes(p[0])||p[0]==='audit'&&(p.length===1||String(p[1]).startsWith('!order'));}
function rootProjectionRanges_(previous,positions){const groups={};for(const [k,row]of Object.entries(positions||{})){const path=JSON.parse(k),root=path[0]||'[]';(groups[root]||(groups[root]=new Set())).add(row);}const out={...(previous||{})};for(const [root,rows]of Object.entries(groups)){for(const [at,n]of previous?.[root]||[])for(let i=0;i<n;i++)rows.add(at+i);out[root]=fieldRuns_([...rows].map(row=>({row,col:1,values:[[]]}))).map(r=>[r.row,r.values.length]);}return out;}
function scopedRanges_(index,roots){return ['[]','audit',...roots].flatMap(k=>index[k]||[]);}
function settingsFieldKey_(key){const p=JSON.parse(key);return !p.length||settingsRoots_.includes(p[0])||p[0]==='audit'&&(p.length===1||String(p[1]).startsWith('!order'));}
function projectionRanges_(previous,positions){const rows=new Set();for(const [start,n] of previous||[])for(let i=0;i<n;i++)rows.add(start+i);for(const [k,row] of Object.entries(positions||{}))if(settingsFieldKey_(k))rows.add(row);return fieldRuns_([...rows].map(row=>({row,col:1,values:[[]]}))).map(r=>[r.row,r.values.length]);}
function rangedProjectionRows_(sheet,ranges,width){const values=fieldReadMany_(sheet,ranges.map(([row,height])=>({row,col:1,height,width})));return values.flatMap((rows,i)=>rows.map((r,j)=>[...r,ranges[i][0]+j]));}
function fieldRead_(b,entry,scope){
 if(scope==='view'||scope==='viewPlain'||scope==='active')return projectionRead_(b,entry,scope);
 const before=index_(b);if(before.pendingFieldCommit)error_(503,'Save confirmation pending; retry shortly.');
 if(scope?.exclusions){const selected=exclusionFieldRead_(b,entry,scope,before);if(selected)return selected;}
 const s=b.getSheetByName(entry.store);if(!s)error_(503,'Missing field storage');
 const settings=scope==='settings'||!!scope?.roots,selectedRoots=scope?.roots||settingsRoots_,editing=scope==='edit'||scope==='note'||settings,note=scope==='note',positions={},fields={},projectionPositions={};
 const skip=editing?['audit','layout','venueRegistry','unitGeometry','saveReceipts']:[];
 let rows,prefetchedViewPositions;
 if(editing&&entry.fastIndex){const sh=b.getSheetByName(entry.fastIndex);rows=[];if(note&&entry.noteProjection){const runs=fieldRuns_(Object.values(entry.noteProjection).map(row=>({row,col:1,values:[[]]})));fieldReadMany_(sh,runs.map(range=>({row:range.row,col:1,height:range.values.length,width:3}))).forEach((values,j)=>rows.push(...values.map((r,i)=>[...r,runs[j].row+i])));}else if(settings&&entry.rootReadRanges){
   const readRanges=scopedRanges_(entry.rootReadRanges,selectedRoots),viewSheet=entry.viewIndex&&entry.rootViewRanges?b.getSheetByName(entry.viewIndex):null;
   if(viewSheet){
    // Both range sets are known before reading. Fetch edit values and the view's
    // row addresses together; persistence reuses these addresses under the lock.
    const viewRanges=scopedRanges_(entry.rootViewRanges,selectedRoots),all=GSISSheets.readAcross(b,[...readRanges.map(([row,height])=>({sheet:sh,row,col:1,height,width:3})),...viewRanges.map(([row,height])=>({sheet:viewSheet,row,col:1,height,width:1}))],false,{flush:false});
    rows=all.slice(0,readRanges.length).flatMap((part,i)=>part.map((r,j)=>[...r,readRanges[i][0]+j]));prefetchedViewPositions={};all.slice(readRanges.length).forEach((part,i)=>part.forEach(([key],j)=>{if(key)prefetchedViewPositions[key]=viewRanges[i][0]+j;}));
   }else rows=rangedProjectionRows_(sh,readRanges,3);
  }else if(scope==='settings'&&entry.settingsReadRanges?.length)rows=rangedProjectionRows_(sh,entry.settingsReadRanges,3);else rows=sh.getLastRow()>1?fieldReadValues_(sh,2,1,sh.getLastRow()-1,3):[];rows.forEach(([k,row,v,projectionRow],i)=>{if(k){positions[k]=row;projectionPositions[k]=projectionRow||i+2;if(v!=='')fields[k]=v;}});}
 else{const size=s.getLastRow()-1;rows=size?fieldReadValues_(s,2,1,size,2):[];rows.forEach(([k,v],i)=>{if(k){positions[k]=i+2;if(v!==''&&(!editing||fastFieldKey_(k)))fields[k]=v;}});}
 const root=fields['[]'],auditOrder=fields['["audit"]'];let selected={...fields};
 if(settings){const list=JSON.parse(root);skip.push(...list.o.filter(k=>!selectedRoots.includes(k)&&!skip.includes(k)));}if(editing){const list=JSON.parse(root);list.o=list.o.filter(k=>!skip.includes(k));if(note)list.o=list.o.filter(k=>['id','name','notes','pendingUnitRename'].includes(k));selected['[]']=JSON.stringify(list);}
 // Keep only the selected roots in the comparison baseline; omitted fields must never be deleted.
 if(settings){for(const k of Object.keys(fields))if(!scopedFieldKey_(k,selectedRoots))delete fields[k];}if(note){const keep=new Set([...JSON.parse(selected['[]']).o,'audit']);for(const k of Object.keys(fields))if(k!=='[]'&&!keep.has(JSON.parse(k)[0]))delete fields[k];}
 let d=GSISFields.inflate(selected);if(editing)d.audit=[];
 const after=index_(b);if(after.pendingFieldCommit||after.revision!==before.revision)error_(503,'Version changed while reading; retry.');
 if(!note&&!settings)d=model_(d);fieldReadState_.set(d,{fields,positions,store:entry.store,skip,root,auditOrder,projectionPositions,prefetchedViewPositions,note,settings,selectedRoots,projectionComplete:!!entry.rootReadRanges||(!note&&scope!=='settings')||(note&&!entry.noteProjection)});return d;
}
function receiptSheet_(b){return fieldSheet_(b,'deploy_save_receipts',['Request ID','Version ID','Actor','Parts','JSON']);}
function findExactRow_(s,id){if(!s||s.getLastRow()<2)return 0;const hit=s.getRange(2,1,s.getLastRow()-1,1).createTextFinder(id).matchEntireCell(true).matchCase(true).useRegularExpression(false).findNext();return hit?hit.getRow():0;}
function storedReceipt_(b,en,id){
 const sh=b.getSheetByName('deploy_save_receipts'),at=findExactRow_(sh,id);
 if(at){const row=sh.getRange(at,1,1,5).getValues()[0];if(row[1]!==en.id)error_(409,'Save ID belongs to another version');const text=Number(row[3])===1?row[4]:sh.getRange(at,5,Number(row[3]),1).getValues().map(r=>r[0]).join('');return JSON.parse(text);}
 if(en.receiptSchema)return null;
 // One-time compatibility with receipts created before v0.4.05.
 const d=document_(b,en);return (d.saveReceipts||[]).find(x=>x.id===id)||null;
}
var fieldPendingReceipt_=new WeakMap();
function receiptRows_(version,receipt){const text=JSON.stringify(receipt),n=Math.ceil(text.length/30000),rows=[];for(let i=0;i<n;i++)rows.push([i?'':receipt.id,version,receipt.actor,n,text.slice(i*30000,(i+1)*30000)]);return rows;}
function fieldRuns_(items){const out=[];for(const w of items.sort((a,b)=>a.row-b.row)){const last=out[out.length-1];if(last&&last.col===w.col&&last.row+last.values.length===w.row)last.values.push(...w.values);else out.push(w);}return out;}
function auditRows_(events,positions){return events.map(a=>{const prefix=JSON.stringify(['audit','@'+a.id]).slice(0,-1),rows=Object.entries(positions).filter(([k])=>k===prefix+']'||k.startsWith(prefix+',')).map(([,row])=>row);return [a.id,a.at,a.actor,a.action,Math.min(...rows),Math.max(...rows)];});}

function fieldPersist_(b,idx,d,requestId){gsisRequireBackendRole_('deploy');if(typeof deployEdgeFence_==='function')deployEdgeFence_({action:'change'});
 if(idx.pendingFieldCommit)error_(503,'Finish the interrupted transaction first.');
 // Plan missing sheets in memory. Headers/capacity are materialized only after
 // both index forms pass preflight and the journal + pending marker are durable.
 const plannedHeaders=new Map(),sheetMemo=new Map(),lastRows=new Map();function plannedSheet(name,headers){if(sheetMemo.has(name))return sheetMemo.get(name);const existing=b.getSheetByName(name);if(existing){sheetMemo.set(name,existing);return existing;}plannedHeaders.set(name,headers);const planned={getLastRow:()=>1};sheetMemo.set(name,planned);return planned;}function lastRow(sheet){if(!lastRows.has(sheet))lastRows.set(sheet,sheet.getLastRow());return lastRows.get(sheet);}
 if(!idx.publicationSchema){idx.published=idx.versions.find(x=>x.id===idx.active)||null;idx.publicationSchema=1;}
 const priorPublic=publishedEntry_(idx);
 const prev=idx.versions.find(x=>x.id===d.id),store=prev?.store||fieldName_(d.id),s=plannedSheet(store,['Field','JSON']);
 let old=fieldReadState_.get(d);if(!old||old.store!==store){const values=lastRow(s)>1?fieldReadValues_(s,2,1,lastRow(s)-1,2):[];old={fields:{},positions:{}};values.forEach(([k,v],i)=>{if(k){old.positions[k]=i+2;if(v!=='')old.fields[k]=v;}});}
 const fields=GSISFields.flat(d);if(old.partial)fieldRestorePartial_(fields,old);if(old.skip?.length){const root=JSON.parse(old.root);const currentRoot=JSON.parse(fields['[]']);root.o=[...new Set([...root.o,...currentRoot.o])];fields['[]']=JSON.stringify(root);if(old.auditOrder){const prior=GSISFields.order(old.fields,['audit']),next=GSISFields.order(fields,['audit']);GSISFields.putOrder(fields,['audit'],prior.concat(next.filter(k=>!prior.includes(k))));}for(const key of Object.keys(fields)){const path=JSON.parse(key);if((old.skip.includes(path[0])&&path[0]!=='audit')||(old.note&&path.length&&!['id','name','notes','pendingUnitRename','audit'].includes(path[0]))||(old.settings&&path.length&&!old.selectedRoots.includes(path[0])&&path[0]!=='audit'))delete fields[key];}}const changes=[...new Set([...Object.keys(old.fields),...Object.keys(fields)])].filter(k=>old.fields[k]!==fields[k]).map(key=>({key,value:fields[key]??null}));
 let last=lastRow(s),updates=[],additions=[];for(const x of changes){if(x.value&&x.value.length>45000)error_(400,'Field too large for storage');if(old.positions[x.key])updates.push({row:old.positions[x.key],col:2,values:[[x.value??'']]});else additions.push([x.key,x.value??'']);}
 updates.sort((a,b)=>a.row-b.row);const batched=[];for(const w of updates){const p=batched[batched.length-1];if(p&&p.col===w.col&&p.row+p.values.length===w.row)p.values.push(...w.values);else batched.push(w);}if(additions.length)batched.push({row:last+1,col:1,values:additions});
 const editIndex=prev?.editIndex||'editidx_'+hash_(d.id).slice(0,23),editSheet=plannedSheet(editIndex,['Field','Row']),indexEntries=prev?.editIndex?additions.map((r,i)=>[r[0],last+1+i]).filter(r=>editFieldKey_(r[0])):Object.entries({...old.positions,...Object.fromEntries(additions.map((r,i)=>[r[0],last+1+i]))}).filter(r=>editFieldKey_(r[0]));
 const commit=Utilities.getUuid(),entry={...prev,id:d.id,name:d.name,notes:d.notes||'',store,editIndex,commit,pendingUnitRename:!!d.pendingUnitRename,revision:(prev?.revision||0)+1,updatedAt:new Date().toISOString()};
 const blocks=[{sheet:store,writes:batched}];if(indexEntries.length)blocks.push({sheet:editIndex,writes:[{row:lastRow(editSheet)+1,col:1,values:indexEntries}]});// Build or patch the compact projection. The first v0.4.05 save is an atomic upgrade.
 const positions={...old.positions,...Object.fromEntries(additions.map((r,i)=>[r[0],last+1+i]))};
 const fastIndex=prev?.fastIndex||'fastidx_'+hash_(d.id).slice(0,23),fastSheet=plannedSheet(fastIndex,['Field','Row','JSON']);
 let allFields,projectionPositions=old.projectionPositions;
 if(!prev?.fastIndex){allFields={};if(lastRow(s)>1)fieldReadValues_(s,2,1,lastRow(s)-1,2).forEach(([k,v])=>{if(k&&v!=='')allFields[k]=v;});for(const x of changes){if(x.value===null)delete allFields[x.key];else allFields[x.key]=x.value;}
  const matrix=Object.entries(allFields).filter(([k])=>fastFieldKey_(k)).map(([k,v])=>[k,positions[k],v]);projectionPositions=Object.fromEntries(matrix.map((r,i)=>[r[0],i+2]));entry.noteProjection=Object.fromEntries(matrix.map((r,i)=>[r[0],i+2]).filter(([k])=>noteFieldKey_(k)));blocks.push({sheet:fastIndex,writes:matrix.length?[{row:2,col:1,values:matrix}]:[]});
 }else{if(!projectionPositions||!Object.keys(projectionPositions).length){projectionPositions={};if(lastRow(fastSheet)>1)fieldReadValues_(fastSheet,2,1,lastRow(fastSheet)-1,1).forEach(([k],i)=>{if(k)projectionPositions[k]=i+2;});}
  const patches=[],added=[];for(const x of changes.filter(x=>fastFieldKey_(x.key))){const row=projectionPositions[x.key];if(row)patches.push({row,col:3,values:[[x.value??'']]});else added.push([x.key,positions[x.key],x.value??'']);}entry.noteProjection={...(prev.noteProjection||{})};added.forEach((r,i)=>{if(noteFieldKey_(r[0]))entry.noteProjection[r[0]]=lastRow(fastSheet)+1+i;});const writes=fieldRuns_(patches);if(added.length){const at=lastRow(fastSheet)+1;writes.push({row:at,col:1,values:added});added.forEach((r,i)=>projectionPositions[r[0]]=at+i);}if(writes.length)blocks.push({sheet:fastIndex,writes});
 }
 entry.fastIndex=fastIndex;entry.rootReadRanges=prev?.rootReadRanges||old.projectionComplete||!old.skip?.length?rootProjectionRanges_(prev?.rootReadRanges,projectionPositions):undefined;entry.settingsReadRanges=projectionRanges_(prev?.settingsReadRanges,projectionPositions);
 let viewPositions={};const viewIndex=prev?.viewIndex||'viewidx_'+hash_([d.id,commit]).slice(0,23),viewSheet=plannedSheet(viewIndex,['Field','JSON']);
 if(!prev?.viewIndex){
  if(!allFields){allFields={};if(lastRow(s)>1)fieldReadValues_(s,2,1,lastRow(s)-1,2).forEach(([k,v])=>{if(k&&v!=='')allFields[k]=v;});}
  const complete={...allFields};for(const x of changes){if(x.value===null)delete complete[x.key];else complete[x.key]=x.value;}
  const matrix=projectionMatrix_(complete,viewFieldKey_);viewPositions=Object.fromEntries(matrix.map(([k],i)=>[k,i+2]));blocks.push({sheet:viewIndex,writes:[{row:2,col:1,values:matrix}]});
 }else{
  const rows={...(old.prefetchedViewPositions||{})};if(old.prefetchedViewPositions){}else if((old.settings||old.note)&&prev.rootViewRanges)rangedProjectionRows_(viewSheet,scopedRanges_(prev.rootViewRanges,old.note?['id','name','notes','pendingUnitRename']:old.selectedRoots),1).forEach(([k,row])=>{if(k)rows[k]=row;});else if(old.settings&&!old.projectionComplete&&old.selectedRoots.every(k=>settingsRoots_.includes(k))&&prev.settingsViewRanges?.length)rangedProjectionRows_(viewSheet,prev.settingsViewRanges,1).forEach(([k,row])=>{if(k)rows[k]=row;});else if(lastRow(viewSheet)>1)fieldReadValues_(viewSheet,2,1,lastRow(viewSheet)-1,1).forEach(([k],i)=>{if(k)rows[k]=i+2;});viewPositions=rows;
  const patches=[],added=[];for(const x of changes.filter(x=>viewFieldKey_(x.key))){if(rows[x.key])patches.push({row:rows[x.key],col:2,values:[[x.value??'']]});else added.push([x.key,x.value??'']);}
  const writes=fieldRuns_(patches);if(added.length){const at=lastRow(viewSheet)+1;writes.push({row:at,col:1,values:added});added.forEach((r,i)=>viewPositions[r[0]]=at+i);}if(writes.length)blocks.push({sheet:viewIndex,writes});
 }
 entry.viewIndex=viewIndex;entry.rootViewRanges=prev?.rootViewRanges||old.projectionComplete||!old.settings?rootProjectionRanges_(prev?.rootViewRanges,viewPositions):undefined;entry.settingsViewRanges=projectionRanges_(prev?.settingsViewRanges,viewPositions);
 const receipts=[];if(!prev?.receiptSchema){if(!allFields){allFields={};if(lastRow(s)>1)fieldReadValues_(s,2,1,lastRow(s)-1,2).forEach(([k,v])=>{if(k&&v!=='')allFields[k]=v;});}if(allFields['["saveReceipts"]']){const sub={};for(const [k,v] of Object.entries(allFields))if(JSON.parse(k)[0]==='saveReceipts')sub[JSON.stringify(JSON.parse(k).slice(1))]=v;receipts.push(...GSISFields.inflate(sub));}}
 const pendingReceipt=fieldPendingReceipt_.get(d);if(pendingReceipt&&!receipts.some(x=>x.id===pendingReceipt.id))receipts.push(pendingReceipt);
 if(receipts.length){const rs=plannedSheet('deploy_save_receipts',['Request ID','Version ID','Actor','Parts','JSON']);blocks.push({sheet:'deploy_save_receipts',writes:[{row:lastRow(rs)+1,col:1,values:receipts.flatMap(x=>receiptRows_(d.id,x))}]});}entry.receiptSchema=1;
 const auditIndex=prev?.auditIndex||'auditidx_'+hash_(d.id).slice(0,22),auditSheet=plannedSheet(auditIndex,['ID','At','Actor','Action','First','Last']);
 const priorAudit=old.auditOrder?GSISFields.order(old.fields,['audit']):[],purged=!old.skip?.length&&priorAudit.length&&!(d.audit||[]).length;
 if(!prev?.auditIndex||purged){let events=d.audit||[];if(old.skip?.length&&allFields?.['["audit"]']){const sub={};for(const [k,v] of Object.entries(allFields))if(JSON.parse(k)[0]==='audit')sub[JSON.stringify(JSON.parse(k).slice(1))]=v;events=GSISFields.inflate(sub);}
  const rows=auditRows_(events,positions),writes=rows.length?[{row:2,col:1,values:rows}]:[];if(lastRow(auditSheet)>rows.length+1)writes.push({row:rows.length+2,col:1,values:Array.from({length:lastRow(auditSheet)-rows.length-1},()=>Array(6).fill(''))});blocks.push({sheet:auditIndex,writes});entry.auditCount=rows.length;entry.auditEpoch=commit;
 }else{const events=(d.audit||[]).filter(a=>!old.positions[JSON.stringify(['audit','@'+a.id])]);const rows=auditRows_(events,positions);if(rows.length)blocks.push({sheet:auditIndex,writes:[{row:(prev.auditCount||0)+2,col:1,values:rows}]});entry.auditCount=(prev.auditCount||0)+rows.length;}
 entry.auditIndex=auditIndex;
 const noticeMap=new Map((purged?[]:prev?.noticeRows||[]).map(r=>[r[0],r]));
 let noticeEvents=d.audit||[];
 if(!prev?.viewIndex&&old.skip?.length&&allFields?.['["audit"]']){const sub={};for(const [k,v] of Object.entries(allFields))if(JSON.parse(k)[0]==='audit')sub[JSON.stringify(JSON.parse(k).slice(1))]=v;noticeEvents=[...GSISFields.inflate(sub),...noticeEvents];}
 for(const r of auditRows_(noticeEvents.filter(a=>a.action==='Conflicts resolved — latest server save wins'),positions))noticeMap.set(r[0],[r[0],r[4],r[5]]);
 entry.noticeRows=[...noticeMap.values()];
 idx.versions=idx.versions.filter(x=>x.id!==d.id).concat(entry);idx.revision++;if(requestId)idx.requests=(idx.requests||[]).concat(requestId).slice(-200);
 if(idx.publishNext===d.id){const frozen='published_'+hash_([d.id,commit]).slice(0,22),matrix=Object.entries(fields);blocks.push({sheet:frozen,writes:[{row:2,col:1,values:matrix}]});const frozenView='pubview_'+hash_([d.id,commit]).slice(0,23),frozenActive='pubactive_'+hash_([d.id,commit]).slice(0,21);blocks.push({sheet:frozenView,writes:[{row:2,col:1,values:projectionMatrix_(fields,viewFieldKey_)}]},{sheet:frozenActive,writes:[{row:2,col:1,values:projectionMatrix_(fields,activeFieldKey_)}]});idx.published={...entry,store:frozen,viewIndex:frozenView,activeIndex:frozenActive,reliefReadRangesSchema:1,rootViewRanges:rootProjectionRanges_(null,Object.fromEntries(projectionMatrix_(fields,viewFieldKey_).map(([k],i)=>[k,i+2]))),noticeRows:auditRows_((d.audit||[]).filter(a=>a.action==='Conflicts resolved — latest server save wins'),Object.fromEntries(matrix.map(([k],i)=>[k,i+2]))).map(r=>[r[0],r[4],r[5]])};delete idx.published.fastIndex;delete idx.published.editIndex;delete idx.published.auditIndex;delete idx.published.noteProjection;delete idx.publishNext;idx.published.from=d.from||'';idx.published.to=d.to||'';idx.venuePublications=[...(idx.venuePublications||[]),...(priorPublic?[priorPublic]:[])].filter((e,i,all)=>e.id!==d.id&&all.findIndex(x=>x.id===e.id)===i).concat(JSON.parse(JSON.stringify(idx.published)));if(idx.venuePublications.length>200)error_(400,'At most 200 retained published versions are supported. Republish an existing version or review publication retention before adding another.');}
 if(idx.published?.commit===commit)idx.layoutHandoff=layoutPublicationIntent_(d,entry);
 for(const block of blocks)if(plannedHeaders.has(block.sheet))block.headers=plannedHeaders.get(block.sheet);
 const delta={versionId:d.id,revision:entry.revision,globalRevision:idx.revision,changes,at:entry.updatedAt};const tx={commit,blocks,index:JSON.parse(JSON.stringify(idx)),delta,requestId,previousDelta:prev?.lastDelta||null};
 if(idx.published?.commit===commit){const oldPublic=priorPublic?publicCampusDocument_(document_(b,priorPublic),priorPublic):null;const publicData=publicCampusDocument_(d,entry);publicData.cursor=commit;tx.publicData=publicData;tx.publicDelta={cursor:commit,since:priorPublic?.commit||null,delta:true,changes:oldPublic?GSISFields.diff({...oldPublic,cursor:priorPublic.commit},publicData).map(({key,value})=>({key,value})):[]};}
 // Resolve the self-referencing journal locator before writing the durable record.
 const journal=b.getSheetByName('deploy_field_journal'),row=journal?journal.getLastRow()+1:2;let locator={row,parts:1,commit};for(let i=0;i<8;i++){tx.index.versions.find(x=>x.id===d.id).lastDelta={...locator};if(tx.index.published?.commit===commit)tx.index.published.lastDelta={...locator};const parts=Math.ceil(JSON.stringify(tx).length/30000);if(parts===locator.parts)break;locator.parts=parts;}
 fieldJournalWrite_(b,tx,idx,journal,true);fieldApplyRows_(b,tx);Object.assign(idx,tx.index);delete idx.pendingFieldCommit;
 fieldCommitState_.set(d,tx.delta);fieldReadState_.set(d,{...old,fields,positions:{...old.positions,...Object.fromEntries(additions.map((r,i)=>[r[0],last+1+i]))},store,prefetchedViewPositions:old.prefetchedViewPositions?viewPositions:undefined});return entry;
}
function fieldDelta_(b,idx,c,p){if(p.authority!==undefined&&p.authority!==(c.user.roles.join('+')||'Teacher'))return {resync:true,reason:'Access changed'};const privileged=c.user.roles.some(r=>r==='KP'||r==='Admin'),en=privileged?idx.versions.find(e=>e.id===p.versionId):publishedEntry_(idx);visible_(en,idx,c);if(en.id!==p.versionId)return {resync:true,reason:'Published version changed'};if(!en.store||!Number.isInteger(p.since)||p.since>en.revision)return {resync:true};if(p.since===en.revision)return {versionId:en.id,revision:en.revision,changes:[],globalRevision:idx.revision};
 if(!privileged)return {resync:true,reason:'A new publication requires a fresh authorized baseline.'};
 let cursor=en.lastDelta,chain=[],next=en.revision;while(cursor&&next>p.since&&chain.length<32){const tx=fieldJournalRead_(b,cursor);if(tx.delta.revision!==next)break;chain.unshift(tx.delta);next--;cursor=tx.previousDelta;}
 if(next!==p.since)return {resync:true,reason:'This cursor is outside the retained delta window.'};const merged=new Map();chain.forEach(d=>d.changes.forEach(x=>merged.set(x.key,x)));const delta={versionId:en.id,revision:en.revision,globalRevision:idx.revision,changes:[...merged.values()]};const safe=publicFieldDelta_(delta,c,p);return p.reliefResults&&reliefAffectingDelta_(delta.changes)?reliefDeltaProjection_(safe,b,idx,c):safe;
}
function publicFieldDelta_(delta,c,p){
 const admin=c.user.roles.includes('Admin');
 // Rule-dependent results are calculated on the server from a coherent snapshot.
 // The caller attaches a role-scoped, confirmed calculation projection.
 const hidden=['saveReceipts','fieldAuthors','pendingUnitRename'];if(!admin)hidden.push('relief','reliefAdmin','reliefLegacy');if(p.auditPaged||!admin)hidden.push('audit');
 const safe=delta.changes.filter(x=>!hidden.includes(JSON.parse(x.key)[0]));
 return {...delta,changes:safe.map(x=>{
  if(x.key!=='[]')return {key:x.key,value:x.value};
  const n=JSON.parse(x.value);n.o=n.o.filter(k=>!hidden.includes(k));
  n.o=[...new Set(n.o.concat(['status','conflictNotices','publication','publishedRevision',...(p.reliefResults?['reliefResults',...(admin?['reliefAdmin']:[])]:[])]))];
  return {key:x.key,value:JSON.stringify(n)};
 })};
}
function committedDelta_(d,idx,c,p,priorRevision,b,calculated){if(!p.returnDelta||p.since!==priorRevision)return undefined;if(p.authority!==undefined&&p.authority!==(c.user.roles.join('+')||'Teacher'))return {resync:true,reason:'Access changed'};const raw=fieldCommitState_.get(d);if(!raw)return undefined;let safe=publicFieldDelta_(raw,c,p);if(p.reliefResults&&(calculated||reliefAffectingDelta_(raw.changes))){if(!b)return {resync:true,reason:'Reload the confirmed calculation.'};safe=reliefDeltaProjection_(safe,b,idx,c,calculated);}return {...safe,catalogue:{active:idx.active,versions:idx.versions.map(x=>versionRow_(x,idx))}};}
function fieldReceipt_(b,idx,c,p,req){const en=idx.versions.find(x=>x.id===p.versionId);visible_(en,idx,c);if(idx.pendingFieldCommit)return {saved:false,pending:true,requestId:p.requestId};const receipt=storedReceipt_(b,en,p.requestId);if(!receipt)return {saved:false,pending:false,requestId:p.requestId};if(receipt.actor!==req.identity.email)error_(403,'Receipt belongs to another editor');return {saved:true,requestId:p.requestId,versionId:en.id,revision:en.revision,conflicts:reliefSafeConflicts_(receipt.conflicts,c),...(receipt.venueClear?{venueClear:receipt.venueClear}:{})};}
function auditPage_(b,idx,c,p){
 auth_(c,'Admin');if(idx.pendingFieldCommit)error_(503,'Save confirmation pending; retry shortly.');const en=idx.versions.find(x=>x.id===p.versionId);visible_(en,idx,c);
 if(!en.auditIndex){const events=document_(b,en).audit||[];if(p.detailId){const event=events.find(x=>x.id===p.detailId);if(!event)error_(404,'Audit event not found');return {event};}const end=p.cursor?Number(JSON.parse(p.cursor).end):events.length;if(!Number.isInteger(end)||end<0||end>events.length)error_(400,'Invalid audit cursor');const start=Math.max(0,end-40);return {versionId:en.id,legacy:true,events:events.slice(start,end).reverse().map(({id,at,actor,action})=>({id,at,actor,action})),cursor:start?JSON.stringify({end:start}):null,total:events.length};}
 const epoch=en.auditEpoch,sh=b.getSheetByName(en.auditIndex);
 if(p.detailId){if(p.epoch!==epoch||!Number.isInteger(p.row)||p.row<2||p.row>en.auditCount+1)error_(409,'Audit changed. Refresh its list.');const r=sh.getRange(p.row,1,1,6).getValues()[0];if(r[0]!==p.detailId)error_(409,'Audit event changed. Refresh its list.');const fields={};fieldReadValues_(b.getSheetByName(en.store),r[4],1,r[5]-r[4]+1,2).forEach(([k,v])=>{if(!k||!v)return;const path=JSON.parse(k);if(path[0]==='audit'&&path[1]==='@'+p.detailId)fields[JSON.stringify(path.slice(2))]=v;});const event=GSISFields.inflate(fields);const after=index_(b);if(after.pendingFieldCommit||after.revision!==idx.revision)error_(503,'Audit changed while reading. Retry.');return {event};}
 let end=en.auditCount||0;if(p.cursor){const cursor=JSON.parse(p.cursor);if(cursor.epoch!==epoch)error_(409,'Audit was cleared. Refresh its list.');end=cursor.end;}if(!Number.isInteger(end)||end<0||end>(en.auditCount||0))error_(400,'Invalid audit cursor');const start=Math.max(0,end-40),rows=end>start?fieldReadValues_(sh,start+2,1,end-start,4):[];
 const events=rows.map((r,i)=>({id:r[0],at:r[1],actor:r[2],action:r[3],row:start+i+2,epoch})).reverse();const after=index_(b);if(after.pendingFieldCommit||after.revision!==idx.revision)error_(503,'Audit changed while reading. Retry.');return {versionId:en.id,events,total:en.auditCount||0,cursor:start?JSON.stringify({end:start,epoch}):null};
}

// Editor-only migration tools. Take a spreadsheet copy before running migrateFieldStore.
function preflightFieldStore(){const b=book_(),idx=index_(b);if(idx.pendingFieldCommit)error_(503,'Recover the pending commit first');return idx.versions.map(en=>{const d=document_(b,en),fields=GSISFields.flat(d),roundtrip=GSISFields.inflate(fields);if(JSON.stringify(d)!==JSON.stringify(roundtrip))error_(409,'Round-trip mismatch: '+en.name);for(const value of Object.values(fields))if(value.length>45000)error_(400,'Oversized field: '+en.name);return {id:en.id,name:en.name,storage:en.store?'fields':'legacy',fields:Object.keys(fields).length,valid:true};});}
function migrateFieldStore(){gsisRequireBackendRole_('deploy');const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Busy');try{const report=preflightFieldStore(),b=book_();for(const item of report.filter(x=>x.storage==='legacy')){const idx=index_(b),en=idx.versions.find(x=>x.id===item.id);persist_(b,idx,document_(b,en),null);}return preflightFieldStore();}finally{deployUnlock_(lock);}}
function prepareLegacyRollback(){gsisRequireBackendRole_('deploy');
 const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Busy');
 try{
  const b=book_(),idx=fieldRecover_(b),sheet=b.getSheetByName('deploy_documents'),writes=[];let next=sheet.getLastRow()+1;
  function snapshot(en){
   if(!en?.store)return en;const doc=document_(b,en);doc.saveReceipts=exportVersionReceipts_(b,en.id,doc.saveReceipts);
   const text=JSON.stringify(doc),rows=[];for(let i=0;i<text.length;i+=30000)rows.push([en.id,en.commit,rows.length,text.slice(i,i+30000)]);
   const row=next;next+=rows.length;writes.push({row,rows});const copy={...en,row,parts:rows.length};
   for(const key of ['store','editIndex','lastDelta','fastIndex','auditIndex','receiptSchema','noteProjection','viewIndex','activeIndex','noticeRows','rootReadRanges','rootViewRanges','settingsReadRanges','settingsViewRanges'])delete copy[key];
   return copy;
  }
  idx.versions=idx.versions.map(snapshot);idx.published=snapshot(idx.published);fieldIndexText_(idx);
  if(writes.length)fieldCapacity_(sheet,1,next-1);for(const w of writes)sheet.getRange(w.row,1,w.rows.length,4).setValues(w.rows);
  deployFlush_();fieldIndexWrite_(b,idx);return {ready:true,revision:idx.revision};
 }finally{deployUnlock_(lock);}
}

// Optional editor maintenance: pay the one-time read-index upgrade before reopening editing.
function preparePerformance404(){gsisRequireBackendRole_('deploy');const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Busy');try{const b=book_();let idx=fieldRecover_(b);const report=[];for(const en of idx.versions.slice()){if(en.fastIndex&&en.auditIndex&&en.receiptSchema&&en.noteProjection){report.push({id:en.id,ready:true,unchanged:true});continue;}let d=document_(b,en);const state=fieldReadState_.get(d);if(state){d=GSISFields.inflate(state.fields);fieldReadState_.set(d,state);}persist_(b,idx,d,null);report.push({id:en.id,ready:true,upgraded:true});}return report;}finally{deployUnlock_(lock);}}
function exportVersionReceipts_(b,id,existing){const sh=b.getSheetByName('deploy_save_receipts'),all=new Map((existing||[]).map(x=>[x.id,x]));if(sh&&sh.getLastRow()>1){const rows=sh.getRange(2,1,sh.getLastRow()-1,5).getValues();for(let i=0;i<rows.length;i++){const row=rows[i];if(row[0]&&row[1]===id){const receipt=JSON.parse(rows.slice(i,i+Number(row[3])).map(r=>r[4]).join(''));all.set(receipt.id,receipt);}}}return [...all.values()];}

// Editor maintenance for existing v0.4.x field stores. Safe to rerun. Content,
// version revisions, publication commits, receipts and deltas are unchanged.
function preparePerformance418(){gsisRequireBackendRole_('deploy');
 const lock=LockService.getScriptLock();if(!deployLock_(lock,8000))error_(503,'Busy');
 try{
  const b=book_(),idx=fieldRecover_(b),blocks=[],report=[],upgradeCommit=Utilities.getUuid();
  for(const en of [...idx.versions,...(idx.published?[idx.published]:[])]){
   if(!en.store){report.push({id:en.id,legacy:true,ready:false});continue;}
   const published=en===idx.published;if(en.viewIndex&&(!published||en.activeIndex)){report.push({id:en.id,published,ready:true,unchanged:true});continue;}
   const d=document_(b,en),fields=GSISFields.flat(d),key=hash_([en.store,en.commit,upgradeCommit]).slice(0,22);
   en.viewIndex='view418_'+key;blocks.push({sheet:en.viewIndex,writes:[{row:2,col:1,values:projectionMatrix_(fields,viewFieldKey_)}]});
   const positions=fieldReadState_.get(d)?.positions||{};en.noticeRows=auditRows_((d.audit||[]).filter(a=>a.action==='Conflicts resolved — latest server save wins'),positions).map(r=>[r[0],r[4],r[5]]);
   if(published){en.activeIndex='active418_'+key;blocks.push({sheet:en.activeIndex,writes:[{row:2,col:1,values:projectionMatrix_(fields,activeFieldKey_)}]});}
   report.push({id:en.id,published,ready:true,upgraded:true});
  }
  if(blocks.length){idx.revision++;const commit=Utilities.getUuid(),tx={commit,blocks,index:JSON.parse(JSON.stringify(idx))},locator=fieldJournalWrite_(b,tx,idx);fieldIndexWrite_(b,{...idx,pendingFieldCommit:locator});fieldApplyRows_(b,tx);}
  return report;
 }finally{deployUnlock_(lock);}
}

function fieldReadValues_(sheet,row,col,height,width,display){return GSISSheets.read(sheet,row,col,height,width,display,{flush:false});}
function fieldReadMany_(sheet,ranges,display){return GSISSheets.readMany(sheet,ranges,display,{flush:false});}
