// Read availability is independent of the writer/recovery fence. Before-images
// contain shared source values only; application authority always stays live.
var contactViewTables_=new Map(),contactViewHidden_=new Set(),contactViewStatus_=null;
function contactViewReset_(){contactViewTables_.clear();contactViewHidden_.clear();contactViewStatus_=null;}
function contactViewCapture_(ss){
 const tables={};for(const name of ['contacts','roles','sys_fields'])if(ss.getSheetByName(name)){
  const t=table_(ss,name);tables[name]=[t.headers,...t.rows.map(r=>t.headers.map(k=>r[k]||''))];
 }else if(name==='sys_fields')tables[name]=[['Field','Value']];
 return {schema:1,at:new Date().toISOString(),tables};
}
function contactViewPack_(view,id){
 let text=JSON.stringify(view),encoding='json';
 if(typeof Utilities.gzip==='function'){
  text=Utilities.base64EncodeWebSafe(Utilities.gzip(Utilities.newBlob(text,'application/json')).getBytes());encoding='gzip';
 }
 const parts=[];for(let start=0;start<text.length;){let end=Math.min(start+30000,text.length);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;parts.push(text.slice(start,end));start=end;}
 if(parts.length>80)throw fault_(400,'The saved Contacts view is too large. Ask an administrator to review the directory.');
 return {meta:{schema:1,requestId:id,parts:parts.length,encoding,digest:digestData_(view)},parts};
}
function contactViewUnpack_(pack,id){
 const m=pack?.meta;if(m?.schema!==1||m.requestId!==id||!Number.isInteger(m.parts)||m.parts<1||m.parts>80||!Array.isArray(pack.parts)||pack.parts.length!==m.parts||pack.parts.some(p=>typeof p!=='string'||p.length>30000))throw Error('Incomplete saved view');
 let text=pack.parts.join('');if(m.encoding==='gzip')text=Utilities.ungzip(Utilities.newBlob(Utilities.base64DecodeWebSafe(text),'application/x-gzip','contacts-view.json.gz')).getDataAsString('UTF-8');else if(m.encoding!=='json')throw Error('Unknown saved view');
 const view=JSON.parse(text);if(view?.schema!==1||digestData_(view)!==m.digest||typeof view.at!=='string'||!view.tables||Object.keys(view.tables).some(n=>!['contacts','roles','sys_fields'].includes(n)))throw Error('Invalid saved view');
 for(const name of Object.keys(view.tables))if(!Array.isArray(view.tables[name])||!Array.isArray(view.tables[name][0])||view.tables[name][0].some(h=>typeof h!=='string')||view.tables[name].some(r=>!Array.isArray(r)||r.some(v=>typeof v!=='string')))throw Error('Invalid saved source');
 for(const [name,headers]of [['contacts',[...DATA_FIELDS,'Staff ID']],['roles',['Role Shortform','EO Appt Level']],['sys_fields',['Field','Value']]])if((name!=='sys_fields'||view.tables[name])&&(!view.tables[name]||headers.some(h=>!view.tables[name][0].includes(h))))throw Error('Incomplete saved source');
 return view;
}
function contactViewJournalWrites_(sheet,row,id,view){
 if(!view)return [];const pack=contactViewPack_(view,id),width=1+pack.parts.length;
 if(9+width>sheet.getMaxColumns()){sheet.insertColumnsAfter(sheet.getMaxColumns(),9+width-sheet.getMaxColumns());contactFlush_();}
 const header=sheet.getRange(1,10,1,1).getValues()[0][0];if(header&&header!=='View metadata')throw fault_(409,'The journal viewing columns are already in use. Keep the journal for administrator review.');
 return [{row:1,col:10,values:[['View metadata',...pack.parts.map((_,i)=>'View part '+i)]]},{row,col:10,values:[[JSON.stringify(pack.meta),...pack.parts]]}];
}
function contactViewRowSnapshot_(row,id){
 try{const meta=JSON.parse(row[9]);return contactViewUnpack_({meta,parts:row.slice(10,10+meta.parts)},id);}catch(e){return null;}
}
function contactViewMarker_(){
 // A fresh property snapshot at EACH boundary preserves changed-while-reading
 // detection; never reuse this snapshot across the directory read.
 const p=PropertiesService.getScriptProperties(),all=typeof p.getProperties==='function'?p.getProperties():null;
 const value=k=>all?(all[k]??null):p.getProperty(k);
 return JSON.stringify(['CONTACTS_DATA_EPOCH','CONTACTS_PENDING_V2','DEPLOY_CATALOGUE_PENDING'].map(value));
}
function contactViewInstall_(snapshot,source='saved'){
 contactViewTables_.clear();for(const [name,values]of Object.entries(snapshot.tables))contactViewTables_.set(name,values);
 if(!contactViewTables_.has('sys_fields'))contactViewTables_.set('sys_fields',[['Field','Value']]);
 contactViewHidden_.clear();contactViewStatus_={pending:true,source,asOf:snapshot.at||'',hiddenRecords:0};
}
function contactViewPinned_(){return ['contacts','roles','sys_fields'].every(name=>contactViewTables_.has(name));}
function contactViewHistorical_(ss){
 const sheet=ss.getSheetByName('contact_save_journal');if(!sheet||sheet.getLastRow()<2||sheet.getLastColumn()<10)return null;
 // Read only bounded metadata first. Original request payloads are not needed.
 const last=sheet.getLastRow(),start=Math.max(2,last-19),height=last-start+1;
 const [rows,metadata]=GSISSheets.readAcross(ss,[{sheet,row:start,col:1,height,width:6},{sheet,row:start,col:10,height,width:1}],false,{flush:false});
 let tried=0;for(let i=rows.length-1;i>=0&&tried<3;i--){const r=rows[i];if(r[4]!=='Applied'||!['contacts','diy'].includes(r[2]))continue;
  try{const meta=JSON.parse(metadata[i][0]);if(meta?.requestId!==r[0]||!Number.isInteger(meta.parts)||meta.parts<1||meta.parts>80||10+meta.parts>sheet.getMaxColumns())continue;tried++;
   const parts=GSISSheets.readAcross(ss,[{sheet,row:start+i,col:11,height:1,width:meta.parts}],false,{flush:false})[0][0];return contactViewUnpack_({meta,parts},r[0]);
  }catch(e){}
 }return null;
}
function contactViewSafeFallback_(ss){
 let snapshot=null;try{snapshot=contactViewHistorical_(ss);}catch(e){}
 if(snapshot){contactViewInstall_(snapshot);return;}
 const tables={contacts:[[...DATA_FIELDS,'Staff ID']],roles:[['Role Shortform','Formal Role Name',...MEMBERSHIP_FLAGS,'EO Appt Level']],sys_fields:[['Field','Value']]};let source='unavailable';
 // A backup can preserve the staff's own fields. Unknown current catalogues
 // must not add unconfirmed names, groups, appointments or validation options.
 try{const name=PropertiesService.getScriptProperties().getProperty('CONTACT_VALUE_MIGRATION_BACKUP');if(name&&ss.getSheetByName(name)){
  const backup=readContactTable_(ss,name);if([...DATA_FIELDS,'Staff ID'].every(k=>backup.headers.includes(k))){tables.contacts=[backup.headers,...backup.rows.map(r=>backup.headers.map(k=>r[k]||''))];source='backup';}
 }}catch(e){}
 contactViewInstall_({tables,at:''},source);
}
function contactViewPrepare_(ss){
 contactViewReset_();const snapshots=[];let pointers={},damaged=false,pending=false,cataloguePending=false;
 try{pointers=contactRecoveryPointers_(ss);if(!pointers||typeof pointers!=='object'||Array.isArray(pointers))throw Error('Invalid pending pointers');}catch(e){pointers={};pending=damaged=true;}
 for(const [key,p]of Object.entries(pointers)){
  if(!p||typeof p!=='object'){pending=damaged=true;continue;}
  const name=p.name||key,sh=ss.getSheetByName(name);let row=[];
  try{if(sh&&Number.isInteger(p.row)&&p.row>=2&&p.row<=sh.getLastRow())row=contactJournalValues_(sh,p.row,Math.min(90,Math.max(11,sh.getLastColumn())));}catch(e){pending=damaged=true;continue;}
  if(row[0]===p.id&&row[4]==='Applied')continue;pending=true;
  const snapshot=row[0]===p.id&&row[1]===p.actor?contactViewRowSnapshot_(row,p.id):null;if(snapshot){snapshots.push(snapshot);continue;}
  try{
   if(row[0]!==p.id||row[1]!==p.actor||row[4]!=='Pending')throw Error('Invalid pending journal');
   if(name==='contact_save_journal'){
    const payload=savedContactPayload_(row);for(const x of [...payload.changes,...payload.additions]){if(typeof x.id!=='string')throw Error('Invalid pending record');contactViewHidden_.add(x.id);}
   }else if(name==='contact_deploy_approvals'){
    const items=JSON.parse(row[3]);if(!Array.isArray(items))throw Error('Invalid publication');for(const x of items){if(typeof x.id!=='string')throw Error('Invalid pending record');contactViewHidden_.add(x.id);}
   }else throw Error('Unknown journal');
  }catch(e){damaged=true;}
 }
 const raw=PropertiesService.getScriptProperties().getProperty('DEPLOY_CATALOGUE_PENDING');
 if(raw){pending=cataloguePending=true;try{
  const at=JSON.parse(raw),sh=ss.getSheetByName('catalogue_journal');if(!sh||!Number.isInteger(at.row)||!Number.isInteger(at.parts)||at.parts<1||at.parts>100)throw Error('Invalid catalogue journal');
  const rows=GSISSheets.readAcross(ss,[{sheet:sh,row:at.row,col:1,height:at.parts,width:3}],false,{flush:false})[0];
  if(rows.some((r,i)=>r[0]!==at.commit||Number(r[1])!==i))throw Error('Incomplete catalogue journal');
  const tx=JSON.parse(rows.map(r=>r[2]).join(''));if(tx.view)snapshots.push(contactViewUnpack_(tx.view,at.commit));
 }catch(e){damaged=true;}}
 if(!pending)return;
 let source='legacy',at='';
 if(snapshots.length){const snapshot=snapshots.sort((a,b)=>a.at.localeCompare(b.at))[0];contactViewInstall_(snapshot);return;}
 else{
  // Older releases did not save a before-image. Keep unaffected staff visible,
  // and omit touched records rather than disclose partial or unconfirmed fields.
  if(damaged){contactViewSafeFallback_(ss);return;}
  if(cataloguePending){contactViewTables_.set('roles',[['Role Shortform','Formal Role Name',...MEMBERSHIP_FLAGS,'EO Appt Level']]);contactViewTables_.set('sys_fields',[['Field','Value']]);}
 }
 contactViewStatus_={pending:true,source,asOf:at,hiddenRecords:contactViewHidden_.size};
}
function contactViewTable_(ss,name){
 const values=contactViewTables_.get(name);if(!values)return null;
 return {sheet:ss.getSheetByName(name),headers:values[0].slice(),rows:values.slice(1).map((r,i)=>{const item={_row:i+2};values[0].forEach((k,j)=>item[k]=r[j]||'');return item;})};
}
function contactPrepareViewSafely_(ss){try{contactPhase_('viewMarkers',()=>contactViewPrepare_(ss));}catch(e){contactViewReset_();contactViewSafeFallback_(ss);}}
function contactViewRead_(ss,req,build){
 let saved=null;
 for(let attempt=0;attempt<3;attempt++){
  contactReadCache_.clear();contactPrefetchedValues_.clear();const marker=contactViewMarker_();contactPrepareViewSafely_(ss);let data,error;
  if(contactViewPinned_())saved={tables:new Map(contactViewTables_),status:{...contactViewStatus_}};
  try{data=build();}catch(e){error=e;}
  if(marker!==contactViewMarker_())continue;
  if(error)throw error;return contactViewResult_(data);
 }
 // Three changing reads are never accepted as a coherent directory. Pin a
 // verified old source for one final build and re-read the caller's authority.
 contactReadCache_.clear();contactPrefetchedValues_.clear();contactPrepareViewSafely_(ss);
 if(!contactViewPinned_()){
  if(saved){contactViewTables_=saved.tables;contactViewHidden_.clear();contactViewStatus_=saved.status;}
  else contactViewSafeFallback_(ss);
 }
 return contactViewResult_(build());
}
function contactViewResult_(data){
 if(contactViewStatus_){data.viewState={...contactViewStatus_};data.authoritative=false;if('editable'in data)data.editable=false;}
 return data;
}
