/* Recoverable maintenance: planned values, approved formula replacement and
   appointment headers share one durable journal. Readers use the saved view. */
function contactRecalculateJournal_(ss){
 let sh=ss.getSheetByName('contact_recalculate_journal');
 if(!sh){sh=ss.insertSheet('contact_recalculate_journal');sh.appendRow(['Request ID','Actor','Kind','Digest','Status','At','Plan','Recovery actor','Recovery at']);contactFlush_();}return sh;
}
function contactRecalculatePlan_(ss,id,actor){
 if(contactCacheEnabled_)contactPrefetchDirectory_(ss,true,'recalculateRead');
 const physical=table_(ss,'contacts'),rolePhysical=table_(ss,'roles'),blocks=[];
 const normalise=t=>{const headers=t.headers.map(k=>k==='Appointment Level'?'EO Appt Level':k),rows=t.rows.map(r=>({...r,...(Object.prototype.hasOwnProperty.call(r,'Appointment Level')?{'EO Appt Level':r['Appointment Level']}: {})}));return {...t,headers,rows};};
 const raw=normalise(physical),roles=normalise(rolePhysical),derived=deriveContacts_(ss,{...raw,rows:raw.rows.map(r=>({...r}))},roles),writes=[];
 const replace=new Set(['Subject Modifier','Mobile No',...CONTACT_DERIVED_FIELDS]),height=Math.max(0,physical.sheet.getLastRow()-1);
 const formulas=height?physical.sheet.getRange(2,1,height,physical.headers.length).getFormulas():[],counts={};
 for(let i=0;i<derived.rows.length;i++){
  const row=derived.rows[i],before=raw.rows[i],force=[];
  const values=raw.headers.map((k,j)=>{if(replace.has(k)&&formulas[row._row-2]?.[j]){force.push(j);counts[k]=(counts[k]||0)+1;}return safeCell_(replace.has(k)?row[k]??'':before[k]??'');});
  writeContactDirtyRow_(raw.sheet,row._row,values,raw.headers.map(k=>safeCell_(before[k]??'')),writes,force);
 }
 for(const t of [physical,rolePhysical]){const col=t.sheet.getRange(1,1,1,t.headers.length).getValues()[0].indexOf('Appointment Level');if(col>=0)blocks.push({name:t.sheet.getName(),writes:[{row:1,col:col+1,values:[['EO Appt Level']]}]});}
 if(writes.length){const merged=[];for(const w of writes.sort((a,b)=>a.col-b.col||a.values[0].length-b.values[0].length||a.row-b.row)){const last=merged[merged.length-1];if(last&&last.col===w.col&&last.values[0].length===w.values[0].length&&last.row+last.values.length===w.row)last.values.push(...w.values);else merged.push(w);}blocks.push({name:'contacts',writes:merged});}
 let audit=ss.getSheetByName('contact_recalculations');if(!audit){audit=ss.insertSheet('contact_recalculations');audit.appendRow(['At','Actor','Records','Rules']);contactFlush_();}
 const count=derived.rows.filter(r=>r['Staff ID']).length,at=new Date().toISOString();
 blocks.push({name:'contact_recalculations',writes:[{row:audit.getLastRow()+1,col:1,values:[[at,actor,count,'TTb Name; EO Appt Level; request '+id]]}]});
 for(const block of blocks){const sh=ss.getSheetByName(block.name),last=Math.max(...block.writes.map(w=>w.row+w.values.length-1));if(last>sh.getMaxRows()){sh.insertRowsAfter(sh.getMaxRows(),last-sh.getMaxRows()+100);contactFlush_();}}
 // Backup and before-image are complete before the pending marker is installed.
 backupContactsOnce_(ss,physical);
 const view=contactViewCapture_(ss);for(const name of ['contacts','roles'])if(view.tables[name])view.tables[name][0]=view.tables[name][0].map(k=>k==='Appointment Level'?'EO Appt Level':k);
 return {plan:{schema:1,id,actor,count,formulaMigration:Object.entries(counts).map(([field,cells])=>({sheet:'contacts',field,cells})),blocks},view};
}
function contactRecalculateRead_(ss,found){
 const r=found.values;let meta;try{meta=JSON.parse(r[6]);}catch(e){throw fault_(409,'Recalculate journal is incomplete.');}
 if(meta?.schema!==1||!Number.isInteger(meta.parts)||meta.parts<1||meta.parts>200)throw fault_(409,'Invalid Recalculate journal.');
 const sh=ss.getSheetByName('contact_recalculate_parts'),parts=GSISSheets.read(sh,meta.row,1,meta.parts,3,false,{flush:false});
 if(parts.some((p,i)=>p[0]!==r[0]||p[1]!==i))throw fault_(409,'Recalculate plan is incomplete. Keep its journal.');
 const text=parts.map(p=>p[2]).join(''),plan=JSON.parse(text);
 if(digestData_(plan)!==r[3]||plan.schema!==1||plan.id!==r[0]||plan.actor!==r[1]||!Array.isArray(plan.blocks)||plan.blocks.some(b=>!['contacts','roles','contact_recalculations'].includes(b.name)))throw fault_(409,'Recalculate plan failed its integrity check.');
 return plan;
}
function contactRecalculateApply_(ss,found,plan,recoveryActor){
 const sh=ss.getSheetByName('contact_recalculate_journal'),r=found.values;
 if(r[4]==='Applied'){const p=contactRecoveryPointers_(ss).contact_recalculate_journal;if(p?.id===r[0]){contactPending_('contact_recalculate_journal',null);contactEpoch_();}return {saved:true,duplicate:true,requestId:r[0],recalculated:plan.count,formulaMigration:plan.formulaMigration};}
 if(r[4]!=='Pending')throw fault_(409,'Recalculate status needs administrator review.');
 const blocks=plan.blocks.map(b=>({sheet:ss.getSheetByName(b.name),writes:b.writes}));if(blocks.some(b=>!b.sheet))throw fault_(409,'A required Contacts sheet is missing.');
 if(recoveryActor)blocks.push({sheet:sh,writes:[{row:found.row,col:8,values:[[recoveryActor,new Date().toISOString()]]}]});
 contactPending_('contact_recalculate_journal',{id:r[0],actor:r[1],row:found.row});contactEpoch_();
 GSISSheets.write(ss,blocks,true,{flush:false,final:{sheet:sh,row:found.row,col:5,values:[['Applied']]}});
 contactPending_('contact_recalculate_journal',null);contactEpoch_();contactReadCache_.clear();contactPrefetchedValues_.clear();contactViewReset_();
 return {saved:true,requestId:r[0],recalculated:plan.count,formulaMigration:plan.formulaMigration};
}
function recalculateContactData_(ss,req){
 const input=req.input||{};if(Object.keys(input).some(k=>k!=='requestId')||input.requestId!==undefined&&!/^[\w-]{36}$/.test(input.requestId))throw fault_(400,'Use the original Recalculate request ID.');
 const id=input.requestId||Utilities.getUuid(),request={...req,input:{requestId:id}};
 const lock=LockService.getScriptLock();if(!contactLock_(lock,8000))throw fault_(503,'Another save is in progress. Retry Recalculate.');
 try{
  contactWriterReady_(request);requireDataAdmin_(ss,req.identity);const journal=contactRecalculateJournal_(ss);let found=contactJournalRow_(journal,id,7),plan;
  if(found){if(found.values[1]!==req.identity.email)throw fault_(403,'Recalculate belongs to another Admin. Use Recovery.');plan=contactRecalculateRead_(ss,found);}
  else{
   const prepared=contactRecalculatePlan_(ss,id,req.identity.email);plan=prepared.plan;const text=JSON.stringify(plan),rows=[];for(let i=0;i<text.length;i+=30000)rows.push([id,rows.length,text.slice(i,i+30000)]);
   if(rows.length>200)throw fault_(400,'Recalculate plan exceeds the supported size.');
   let parts=ss.getSheetByName('contact_recalculate_parts');if(!parts){parts=ss.insertSheet('contact_recalculate_parts');parts.appendRow(['Request ID','Part','JSON']);contactFlush_();}
   const start=parts.getLastRow()+1,row=journal.getLastRow()+1;
   for(const [sh,end]of [[parts,start+rows.length-1],[journal,row]])if(end>sh.getMaxRows()){sh.insertRowsAfter(sh.getMaxRows(),end-sh.getMaxRows()+100);contactFlush_();}
   const meta=JSON.stringify({schema:1,row:start,parts:rows.length}),values=[id,req.identity.email,'recalculate',digestData_(plan),'Pending',new Date().toISOString(),meta];
   const view=contactViewJournalWrites_(journal,row,id,prepared.view);
   GSISSheets.write(ss,[{sheet:parts,writes:[{row:start,col:1,values:rows}]},{sheet:journal,writes:[...view,{row,col:1,values:[values]}]}],false,{flush:false});
   if(!GSISSheets.enabled())contactFlush_();found={row,values};
  }
  const result=contactRecalculateApply_(ss,found,plan);return {...result,data:contactData_(ss,req.identity)};
 }finally{lock.releaseLock();}
}
function recoverContactRecalculate_(ss,req){
 const lock=LockService.getScriptLock();if(!contactLock_(lock,1000))throw contactBusyFault_();
 try{contactReadCache_.clear();requireDataAdmin_(ss,req.identity);const found=contactJournalRow_(ss.getSheetByName('contact_recalculate_journal'),req.input.requestId,7);
  if(!found||found.values[3]!==req.input.digest)throw fault_(409,'The saved Recalculate request changed.');
  const plan=contactRecalculateRead_(ss,found),original={action:'recalculateData',identity:{email:plan.actor},input:{requestId:plan.id}};contactWriterReady_(original);
  const result=contactRecalculateApply_(ss,found,plan,req.identity.email);return {saved:result.saved,requestId:plan.id};
 }finally{lock.releaseLock();}
}
