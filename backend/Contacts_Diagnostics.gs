// Editor only. No route, permission changes, reservations, journals or writes.
// Run as the actual deployment executor to inspect that account's spreadsheet
// editability. The original human actor remains independently authorized.
function inspectContactsWriteAccess504(requestId){
 const ss=SpreadsheetApp.openById(GSIS_SHEET),executionAccount=String(Session.getEffectiveUser().getEmail()||'').toLowerCase();
 const savedCache=contactCacheEnabled_,savedRead=contactReadOnly_;contactCacheEnabled_=true;contactReadOnly_=true;contactReadCache_.clear();contactPrefetchedValues_.clear();
 try{
  const pointers=Object.entries(contactRecoveryPointers_(ss)).filter(([key,p])=>(p.name||key)==='contact_save_journal');
  if(!requestId){if(pointers.length!==1)return {readOnly:true,executionAccount,pendingRequests:pointers.map(([,p])=>p.id),message:'Supply one saved Contacts request ID to inspect its planned ranges.'};requestId=pointers[0][1].id;}
  if(!/^[\w-]{36}$/.test(requestId))throw fault_(400,'A saved request ID is required.');
  const journal=ss.getSheetByName('contact_save_journal'),found=contactJournalRow_(journal,requestId,7);if(!found)throw fault_(404,'Saved request not found.');
  if(found.values[4]==='Applied')return {readOnly:true,executionAccount,requestId,status:'Applied',ranges:[],message:'Already applied. Retrying performs no contact writes.'};
  const row=found.values,payload=savedContactPayload_(row),actor=row[1],authority=contactAuthority_(ss,{email:actor}),physical=table_(ss,'contacts'),projected=calculatedContacts_(ss),added=new Set();
  for(const x of payload.changes){const record=projected.rows.find(r=>r['Staff ID']===x.id);if(!record)throw fault_(409,'A saved record no longer exists. Review recovery in Contacts.');record[x.field]=x.field==='Mobile No'?x.value.replace(/\s/g,''):x.value;}
  for(const x of payload.additions){added.add(x.id);let record=projected.rows.find(r=>r['Staff ID']===x.id);if(!record){record=Object.fromEntries(projected.headers.map(k=>[k,'']));record['Staff ID']=x.id;projected.rows.push(record);}Object.assign(record,x.values);}
  deriveContacts_(ss,projected);const plan=contactWritePlan_(physical,projected,payload.changes,added,true),ranges=[];
  function inspect(sheet,w,kind){const gridFits=w.row+w.values.length-1<=sheet.getMaxRows(),a1=contactRangeLabel_(w),range=gridFits?sheet.getRange(w.row,w.col,w.values.length,w.values[0].length):null;let editable=null,check='not-checked';try{if(range&&typeof range.canEdit==='function'){editable=range.canEdit();check='checked';}}catch(e){check=contactErrorCategory_(e);}ranges.push({sheet:sheet.getName(),range:a1,kind,editable,check,needsMoreRows:!gridFits});}
  for(const w of plan.identityWrites)inspect(projected.sheet,w,'Staff ID');for(const w of plan.pendingWrites)inspect(projected.sheet,w,'Contact fields and derived values');inspect(journal,{row:found.row,col:5,values:[['Applied']]},'Commit marker');
  inspect(journal,{row:1,col:8,values:[['Recovery actor','Recovery started']]},'Recovery audit headers');inspect(journal,{row:found.row,col:8,values:[['','']]},'Recovery audit');
  return {readOnly:true,requestId,status:row[4],executionAccount,originalActor:actor,actorCurrentlyAdmin:authority.roles.includes('Admin'),serviceMode:GSISSheets.enabled()?'sheets-api':'native',ranges,blockedRanges:ranges.filter(r=>r.editable===false).length,message:'No permissions or values changed. Spreadsheet access belongs to the executing account; app authorization belongs to the signed-in human. Recovery also validates the original request and current data.'};
 }finally{contactCacheEnabled_=savedCache;contactReadOnly_=savedRead;contactReadCache_.clear();contactPrefetchedValues_.clear();}
}
function contactRangeLabel_(w){const col=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};return col(w.col)+w.row+':'+col(w.col+w.values[0].length-1)+(w.row+w.values.length-1);}
