const GSIS_CONTACTS_VERSION='0.9.9';
/* GSIS_SHEETS_IO_BEGIN */
/* Bounded Sheets API v4 value I/O. Journals, locks and commit markers belong to callers. */
var GSISSheets = (function(){
 'use strict';
 let counters={};
 function resetStats(){counters={apiReads:0,apiWrites:0,nativeReads:0,nativeWrites:0,readRanges:0,writeRanges:0,readCells:0,writeCells:0,writeBytesUpperBound:0,serviceMs:0,metadataCalls:0};}
 function stats(){return {...counters};}
 function service(key,fn){const start=Date.now();counters[key]=(counters[key]||0)+1;try{return fn();}finally{counters.serviceMs=(counters.serviceMs||0)+Date.now()-start;}}
 resetStats();
 function enabled(){return typeof Sheets!=='undefined'&&Sheets.Spreadsheets&&Sheets.Spreadsheets.Values;}
 function column(n){let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
 function range(s,row,col,height,width,names){if(names&&!names.has(s)){counters.metadataCalls++;names.set(s,s.getName());}return "'"+(names?names.get(s):s.getName()).replace(/'/g,"''")+"'!"+column(col)+row+':'+column(col+width-1)+(row+height-1);}
 function readAcross(book,entries,display,options){
  if(!entries.length)return [];
  counters.readRanges+=entries.length;counters.readCells+=entries.reduce((n,r)=>n+r.height*r.width,0);
  if(!enabled())return entries.map(r=>{counters.metadataCalls++;const g=r.sheet.getRange(r.row,r.col,r.height,r.width);return service('nativeReads',()=>display?g.getDisplayValues():g.getValues());});
  if(options?.flush!==false)SpreadsheetApp.flush();
  const out=[],names=new Map(),id=(book||entries[0].sheet.getParent()).getId();counters.metadataCalls+=book?1:2;
  for(let start=0;start<entries.length;start+=100){const part=entries.slice(start,start+100);
   const ranges=part.map(r=>range(r.sheet,r.row,r.col,r.height,r.width,names));
   const data=service('apiReads',()=>Sheets.Spreadsheets.Values.batchGet(id,{ranges,valueRenderOption:display?'FORMATTED_VALUE':'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'}));
   if(!data.valueRanges||data.valueRanges.length!==part.length)throw Error('Incomplete Sheets API read; retry the load.');
   part.forEach((r,i)=>{const values=data.valueRanges[i].values||[];out.push(Array.from({length:r.height},(_,y)=>Array.from({length:r.width},(_,x)=>values[y]&&values[y][x]!==undefined?(display?String(values[y][x]):values[y][x]):'')));});
  }return out;
 }
 // Directory callers already need the complete tables. A quoted sheet name
 // lets Values.batchGet omit empty trailing cells without dimension lookups.
 function readTables(book,names,display){
  if(!names.length)return [];
  if(!enabled())return readAcross(book,names.map(name=>{counters.metadataCalls+=3;const sheet=book.getSheetByName(name);if(!sheet)throw Error('Missing '+name+' sheet');return {sheet,row:1,col:1,height:Math.max(1,sheet.getLastRow()),width:Math.max(1,sheet.getLastColumn())};}),display,{flush:false});
  counters.metadataCalls++;const id=book.getId(),out=[];
  for(let start=0;start<names.length;start+=100){const part=names.slice(start,start+100),ranges=part.map(name=>"'"+name.replace(/'/g,"''")+"'");
   const data=service('apiReads',()=>Sheets.Spreadsheets.Values.batchGet(id,{ranges,majorDimension:'ROWS',valueRenderOption:display?'FORMATTED_VALUE':'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'}));
   if(!data.valueRanges||data.valueRanges.length!==part.length)throw Error('Incomplete Sheets API read; retry the load.');
   counters.readRanges+=part.length;
   for(const item of data.valueRanges){const values=item.values||[],height=Math.max(1,values.length),width=values.reduce((n,r)=>Math.max(n,r.length),1);counters.readCells+=height*width;
    out.push(Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>values[y]&&values[y][x]!==undefined?(display?String(values[y][x]):values[y][x]):'')));
   }
  }return out;
 }
 function readMany(sheet,ranges,display,options){return readAcross(null,ranges.map(r=>({...r,sheet})),display,options);}
 function read(sheet,row,col,height,width,display,options){return readMany(sheet,[{row,col,height,width}],display,options)[0];}
 function write(book,blocks,escaped,options){
  // Complete the plan before mutating. A caller's completion range is always
  // last, even when limits split the data across several requests.
  const entries=[];for(const block of blocks)for(const w of block.writes)if(w.values.length)entries.push({sheet:block.sheet,row:w.row,col:w.col,values:w.values});
  const final=options?.final;
  if(final){if(final.values.length!==1||final.values[0].length!==1)throw Error('Completion marker must be one cell.');entries.push(final);}
  if(!entries.length)return;
  for(const e of entries)if(!Number.isInteger(e.row)||e.row<1||!Number.isInteger(e.col)||e.col<1||!e.values[0]?.length||e.values.some(row=>row.length!==e.values[0].length||row.some(v=>v!==null&&typeof v!=='string'&&typeof v!=='boolean'&&!(typeof v==='number'&&Number.isFinite(v)))))throw Error('Invalid Sheets write plan.');
  counters.writeRanges+=entries.length;counters.writeCells+=entries.reduce((n,e)=>n+e.values.length*e.values[0].length,0);
  if(!enabled()){for(const e of entries){if(e===final)SpreadsheetApp.flush();counters.metadataCalls++;service('nativeWrites',()=>e.sheet.getRange(e.row,e.col,e.values.length,e.values[0].length).setValues(e.values));}if(final)SpreadsheetApp.flush();return;}
  const batches=[],names=new Map();let batch=[],size=80;
  const finish=()=>{if(batch.length)batches.push({data:batch,bytes:size});batch=[];size=80;};
  for(const e of entries){const values=e.values.map(row=>row.map(v=>escaped&&typeof v==='string'&&/^'[=+@-]/.test(v)?v.slice(1):v));
   for(let start=0;start<values.length;){const first=start;let rows=[],bytes=0;while(start<values.length&&rows.length<500){const n=JSON.stringify(values[start]).length*3+3;if(n>990000)throw Error('A Sheets row exceeds the supported batch size.');if(rows.length&&bytes+n>990000)break;rows.push(values[start++]);bytes+=n;}
    const item={range:range(e.sheet,e.row+first,e.col,rows.length,rows[0].length,names),majorDimension:'ROWS',values:rows};
    const itemBytes=JSON.stringify(item).length*3+3;
    if(itemBytes+80>1000000)throw Error('A Sheets range exceeds the supported batch size.');
    if(batch.length>=100||size+itemBytes>1000000)finish();batch.push(item);size+=itemBytes;
   }
  }finish();
  if(options?.flush!==false)SpreadsheetApp.flush();
  const id=(book||entries[0].sheet.getParent()).getId();counters.metadataCalls+=book?1:2;
  for(const b of batches){counters.writeBytesUpperBound+=b.bytes;service('apiWrites',()=>Sheets.Spreadsheets.Values.batchUpdate({valueInputOption:'RAW',includeValuesInResponse:false,data:b.data},id));}
  // No transport switch or retry after an uncertain API failure.
 }
 function check(sheet){if(!enabled())throw Error('Enable Google Sheets API v4 under Apps Script Services, then run this check again.');read(sheet,1,1,1,1,true);return {ready:true,service:'Google Sheets API v4',mode:'batched exact ranges',writes:0};}
 return {enabled,read,readMany,readAcross,readTables,write,check,stats,resetStats};
})();

/* GSIS_SHEETS_IO_END */
/* GSiS Contacts v0.9.7 */
// Cloudflare verifies Google identity. This endpoint accepts only HMAC-signed envelopes.
// Set your chosen GSIS_SECRET in Script Properties and the matching Cloudflare secret. Legacy bridge keys remain supported when it is absent.
const GSIS_SHEET = PropertiesService.getScriptProperties().getProperty('CONTACTS_SHEET_ID') || '1mbKXkgL2L6OOud6aki8CgJsjReYRKxjlkMD3SdhudKI';
// Editor-only first installation. Never expose this through doPost. Existing
// installations use setupGSiS; this routine accepts only an explicitly configured
// empty workbook or its own unfinished setup. It never clears a sheet.
function setupBlankContacts(){
 const props=PropertiesService.getScriptProperties(),sheetId=String(props.getProperty('CONTACTS_SHEET_ID')||'').trim(),adminEmail=String(props.getProperty('ADMIN_EMAIL')||'').trim().toLowerCase(),adminName=String(props.getProperty('ADMIN_NAME')||'System administrator').trim();
 if(!/^[A-Za-z0-9_-]{20,}$/.test(sheetId)||! /^[A-Za-z0-9._%+-]+@gsps\.edu\.sg$/.test(adminEmail)||!adminName||adminName.length>120)throw Error('Set CONTACTS_SHEET_ID to an empty spreadsheet ID and ADMIN_EMAIL to the first Admin school account. ADMIN_NAME is optional.');
 const lock=LockService.getScriptLock();if(!contactLock_(lock,8000))throw Error('Another setup or save is running. Retry later.');
 try{
  const ss=SpreadsheetApp.openById(sheetId),raw=props.getProperty('CONTACTS_BLANK_SETUP'),saved=raw?JSON.parse(raw):null;
  if(saved&&(saved.sheetId!==sheetId||saved.adminEmail!==adminEmail))throw Error('This script already has a blank setup record for another spreadsheet or Admin. Use the original settings.');
  if(saved?.ready)return setupGSiS();
  if(!saved&&ss.getSheets().some(s=>s.getLastRow()>0))throw Error('Blank setup requires an empty spreadsheet. Existing installations must use setupGSiS.');
  const setup=saved||{sheetId,adminEmail,adminName,staffId:'contact-'+Utilities.getUuid(),adminId:Utilities.getUuid(),at:new Date().toISOString()};
  const headers=[...DATA_FIELDS,'Staff ID'],person={'Basic Name':setup.adminName,'TTb Name':setup.adminName,Role:'Teacher',Active:'Y','GSPS Alias (@gsps.edu.sg)':adminEmail.split('@')[0],'Staff ID':setup.staffId},roleHeaders=['Role Shortform','Formal Role Name','EO Appt Level',...MEMBERSHIP_FLAGS];
  const plans={contacts:[headers,headers.map(k=>person[k]||'')],roles:[roleHeaders,roleHeaders.map(k=>k==='Role Shortform'||k==='Formal Role Name'?'Teacher':'')],admin_users:[['Email','Role','Active','Updated At','Admin ID'],[adminEmail,'Admin','Y',setup.at,setup.adminId]],sys_fields:[['Field','Value'],['Employment Modifier','SRE']],offload:[['Tags','Offload Factor','Notes']]};
  // A retry may fill only missing setup cells. Any changed value aborts before
  // writing, so a person cannot mistake this entry point for a reset command.
  for(const s of ss.getSheets()){if(!s.getLastRow())continue;const wanted=plans[s.getName()];if(!wanted)throw Error('Unexpected data found during blank setup. Review the spreadsheet.');const rows=s.getDataRange().getValues();if(rows.some((r,y)=>r.some((v,x)=>String(v||'')!==''&&String(v)!==String(wanted[y]?.[x]??''))))throw Error('Setup data changed. Review '+s.getName()+' before continuing.');}
  if(!saved)props.setProperty('CONTACTS_BLANK_SETUP',JSON.stringify(setup));
  for(const [name,values] of Object.entries(plans)){const sheet=ss.getSheetByName(name)||ss.insertSheet(name);sheet.getRange(1,1,values.length,values[0].length).setValues(values);}
  SpreadsheetApp.flush();contactReadCache_.clear();contactPrefetchedValues_.clear();
  const result=setupGSiS();props.setProperty('CONTACTS_BLANK_SETUP',JSON.stringify({...setup,ready:true}));return {...result,created:true,adminEmail};
 }finally{lock.releaseLock();}
}
// Run once from the editor before deploying. Safe to rerun: no sheet writes,
// no privilege changes and no replacement of an existing bridge secret.
function setupGSiS() {
  const ss = SpreadsheetApp.openById(GSIS_SHEET);
  const contacts = table_(ss, 'contacts');
  required_(contacts, ['TTb Name', 'Statutory Name', 'Role', 'Employment Modifier', 'Subject Modifier', 'Active', 'MK Modifier', 'Staff ID']);
  const catalogue = table_(ss, 'roles');
  required_(catalogue, ['Role Shortform']);
  const access = access_(ss);
  if (!access.rows.some(r => roles_(r).includes('Admin'))) throw new Error('At least one active Admin is required in admin_users.');
  const properties = PropertiesService.getScriptProperties();
  let secret = gsisApiSecret_('BRIDGE_SECRET');
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    properties.setProperty('BRIDGE_SECRET', secret);
  }
  if (secret.length < 32) throw new Error('Existing BRIDGE_SECRET is too short. Set a random secret of at least 32 bytes.');
  console.log('GSiS setup ready. Set your chosen GSIS_SECRET in Project Settings > Script properties and the matching Cloudflare encrypted secret. The secret is not logged.');
  return {ready:true, spreadsheet:GSIS_SHEET, secretConfigured:true};
}
function doGet() { return reply_({ok:false,status:405,error:'Use the GSiS application.'}); }
function doPost(e) {
 GSISSheets.resetStats();contactTrace_={backendVersion:GSIS_CONTACTS_VERSION,started:Date.now(),phases:{}};
  contactReadCache_.clear();contactPrefetchedValues_.clear();contactViewReset_();contactReadOnly_=true;contactCacheEnabled_=true;contactRequestEpoch_=null;let catalogueMutation=false;
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 120000) throw fault_(400,'Invalid request');
    const env = JSON.parse(raw);if(typeof env.payload!=='string')throw fault_(400,'Invalid request');
    const req=JSON.parse(env.payload);
    if(req.action==='venuesSource')return reply_({ok:true,data:venuesContactsSource_(env)});
    if(req.action==='lordService'){contactTrace_.action=req.action;contactTrace_.requestId=req.nonce;return reply_({ok:true,data:lordContactsService_(env)});}
    const service=req.action==='rosterServiceDirectory',secret=gsisApiSecret_(service?'ROSTER_SERVICE_SECRET':'BRIDGE_SECRET');
    if (!secret || secret.length < 32) throw fault_(503,service?'Roster service connection is not configured.':'School connection is not configured.');
    const expected = Utilities.computeHmacSha256Signature(env.payload,secret).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
    if (!equal_(expected,env.signature)) throw fault_(401,'Invalid service signature');
    contactTrace_.requestId=/^[\w-]{36}$/.test(req.traceId||'')?req.traceId:req.input?.requestId||req.nonce;contactTrace_.action=req.action;
    if (!Number.isFinite(req.timestamp) || Math.abs(Date.now()-req.timestamp)>60000 || !/^[\w-]{36}$/.test(req.nonce||'')) throw fault_(401,'Expired request');
    if(service){
     if(req.service!=='gsis-roster-notifier-v1'||Object.keys(req).some(k=>!['action','service','timestamp','nonce','input','traceId'].includes(k))||!req.input||typeof req.input!=='object'||Array.isArray(req.input)||Object.keys(req.input).length)throw fault_(403,'Invalid Roster directory service request');
     const ss=contactPhase_('openWorkbook',()=>SpreadsheetApp.openById(GSIS_SHEET));
     return reply_({ok:true,data:contactViewRead_(ss,req,()=>{
      if(contactViewStatus_?.pending)throw fault_(503,'Contacts changes are pending. Retry the service after they complete.');
      if(contactCacheEnabled_)contactPrefetchRosterDirectory_(ss,'rosterServiceDirectoryBatch');
      const rosterPeople=rosterContactPeople_(ss);return {rosterPeople,rosterAdminIds:rosterContactAdminIds_(ss,rosterPeople),rosterSMCIds:rosterContactSMCIds_(ss,rosterPeople),rosterUrgentSMCIds:rosterContactUrgentSMCIds_(ss,rosterPeople),user:{rosterSMC:false,rosterAdmin:false,rosterStaffId:null}};
     })});
    }
    if (!req.identity || !/^[^@\s]+@gsps\.edu\.sg$/.test(req.identity.email||'') || !req.identity.subject) throw fault_(403,'School account required');
    // Published teaching data needs no Contacts workbook or directory recovery.
    if(req.action==='deployment')return reply_({ok:true,data:deploymentData_(req.identity)});
    const ss = contactPhase_('openWorkbook',()=>SpreadsheetApp.openById(GSIS_SHEET));
    // Recovery reveals only an Admin review of the durable journal, never a partial directory.
    if(req.action==='recoveryStatus')return reply_({ok:true,data:contactRecoveryStatus_(ss,req.identity)});
    // A receipt never reads the partial directory and must remain available during recovery.
    if(req.action==='saveReceipt')return reply_({ok:true,data:contactSaveReceipt_(ss,req)});
    if(req.action==='recoverSave'){try{return reply_({ok:true,data:recoverContactSave_(ss,req)});}finally{invalidateDeployReadCache_();}}
    // Authority reads depend only on admin_users, not an unrelated directory transaction.
    // They remain uncached and run only after signature, expiry and school identity checks.
    if(req.action==='deploySnapshot'&&req.input?.authorityOnly===true&&!req.input?.palAuthority&&!req.input?.rosterAuthority&&!req.input?.rosterDirectory&&req.input?.rosterProjection!=='staplerDates')return reply_({ok:true,data:{user:contactAuthority_(ss,req.identity)}});
    if(req.action==='calendarBirthdays')return reply_({ok:true,data:contactViewRead_(ss,req,()=>calendarContactBirthdays_(ss,req))});
    // Viewing never acquires a writer lock or attempts recovery. Source snapshots
    // keep unconfirmed fields out of staff reads; current access is read live.
    if(['bootstrap','data','sysFields','membership','offload','diy','deploySnapshot'].includes(req.action))return reply_({ok:true,data:contactViewRead_(ss,req,()=>{
      if(req.action==='bootstrap')return bootstrapWithDeploy_(ss,req.identity);
      if(req.action==='deploySnapshot')return deploySnapshot_(ss,req.identity,req.input);
      if(req.action==='data'){if(!contactViewStatus_)contactPrefetchDirectory_(ss,true,'dataReadBatch');return contactData_(ss,req.identity);}
      return adminTable_(ss,req.identity,req.action);
    })});
    contactRequestEpoch_=PropertiesService.getScriptProperties().getProperty('CONTACTS_DATA_EPOCH')||'';
    ensureContactsReady_(ss,req);
    catalogueMutation=['applyDeployCatalogues','approveDeployTeachers','recalculateData','saveData','saveAdminTable','saveDIY','setKP','rosterContactCreate'].includes(req.action);
    if(catalogueMutation)contactRequestEpoch_=null;
    if (req.action === 'applyDeployCatalogues') return reply_({ok:true,data:applyDeployCatalogues_(ss,req)});
    if (req.action === 'deployPublishReview') return reply_({ok:true,data:deployPublishReview_(ss,req.identity,req.input)});
    if (req.action === 'approveDeployTeachers') return reply_({ok:true,data:approveDeployTeachers_(ss,req)});
    if (req.action === 'deploySnapshot') return reply_({ok:true,data:deploySnapshot_(ss,req.identity,req.input)});
    if (req.action === 'bootstrap') return reply_({ok:true,data:bootstrapWithDeploy_(ss,req.identity)});
    if (req.action === 'data'){contactPrefetchDirectory_(ss,true,'dataReadBatch');return reply_({ok:true,data:contactData_(ss,req.identity)});}
    if (req.action === 'recalculateData') return reply_({ok:true,data:recalculateContactData_(ss,req)});
    if (req.action === 'rosterContactCreate') return reply_({ok:true,data:rosterContactCreate_(ss,req)});
    if (req.action === 'saveData') return reply_({ok:true,data:saveContactData_(ss,req)});
    if (['sysFields','membership','offload','diy'].includes(req.action)) return reply_({ok:true,data:adminTable_(ss,req.identity,req.action)});
    if (req.action === 'saveAdminTable') return reply_({ok:true,data:saveAdminTable_(ss,req)});
    if (req.action === 'saveDIY') return reply_({ok:true,data:saveContactData_(ss,req,true)});
    if (req.action === 'saveSignatureSettings') return reply_({ok:true,data:saveSignatureSettings_(ss,req)});
    if (req.action === 'setKP') return reply_({ok:true,data:setKP_(ss,req)});
    throw fault_(404,'Unknown action');
  } catch(err) {return reply_(contactFailure_(err));}finally{if(catalogueMutation)invalidateDeployReadCache_();contactCacheEnabled_=false;contactReadOnly_=false;contactReadCache_.clear();contactPrefetchedValues_.clear();contactViewReset_();}
}
var contactRequestEpoch_=null;
function contactEpoch_(){PropertiesService.getScriptProperties().setProperty('CONTACTS_DATA_EPOCH',Utilities.getUuid());}
function reply_(data){if(data.ok&&contactRequestEpoch_!==null&&(contactRequestEpoch_!==(PropertiesService.getScriptProperties().getProperty('CONTACTS_DATA_EPOCH')||'')||PropertiesService.getScriptProperties().getProperty('DEPLOY_CATALOGUE_PENDING')||Object.keys(JSON.parse(PropertiesService.getScriptProperties().getProperty('CONTACTS_PENDING_V2')||'{}')).length))throw fault_(503,'Contacts changed while reading. Retry the load.');if(contactTrace_){const timing={backendVersion:GSIS_CONTACTS_VERSION,requestId:contactTrace_.requestId,traceId:contactTrace_.requestId,action:contactTrace_.action,cache:contactTrace_.cache,phases:contactTrace_.phases,preparedIO:contactTrace_.preparedIO,io:GSISSheets.stats(),totalMs:Date.now()-contactTrace_.started};if(data.data)data.data.timing=timing;else data.timing=timing;console.info(JSON.stringify({event:'gsis-contacts-request',status:data.ok?200:data.status,...timing}));}return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function fault_(status,message){const e=new Error(message);e.status=status;return e;}
function equal_(a,b){if(typeof b!=='string'||a.length!==b.length)return false;let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);return mismatch===0;}
var contactReadCache_=new Map(),contactCacheEnabled_=false,contactPrefetchedValues_=new Map(),contactReadOnly_=false;
function table_(ss,name){let t=contactViewTable_(ss,name);if(!t){if(!contactCacheEnabled_)t=readContactTable_(ss,name);else{t=contactReadCache_.get(name);if(!t){t=readContactTable_(ss,name);contactReadCache_.set(name,t);}}}return {...t,headers:t.headers.slice(),rows:t.rows.filter(r=>name!=='contacts'||!contactViewHidden_.has(r['Staff ID'])).map(r=>({...r}))};}
function readContactTable_(ss,name){const sheet=ss.getSheetByName(name);if(!sheet)throw fault_(503,'Missing '+name+' sheet');const values=contactPrefetchedValues_.get(name)||GSISSheets.readAcross(ss,[{sheet,row:1,col:1,height:Math.max(1,sheet.getLastRow()),width:Math.max(1,sheet.getLastColumn())}],true,{flush:!contactReadOnly_})[0];contactPrefetchedValues_.delete(name);values[0]=values[0].map(h=>h==='Appointment Level'?'EO Appt Level':h);return {sheet,headers:values[0],rows:values.slice(1).map((r,i)=>{const o={_row:i+2};values[0].forEach((h,j)=>o[h]=r[j]||'');return o;})};}
function contactPrefetchDirectory_(ss,forSave=false,phase=forSave?'saveReadBatch':'directoryBatch'){
 const names=['admin_users','roles','contacts'];if(forSave&&ss.getSheetByName('sys_fields'))names.push('sys_fields');
 const current=names.filter(name=>!contactViewTables_.has(name)&&(forSave||!contactReadCache_.has(name)&&!contactPrefetchedValues_.has(name))),ranges=current.map(name=>{const sheet=ss.getSheetByName(name);if(!sheet)throw fault_(503,'Missing '+name+' sheet');return {sheet,row:1,col:1,height:Math.max(1,sheet.getLastRow()),width:Math.max(1,sheet.getLastColumn())};});
 const values=contactPhase_(phase,()=>GSISSheets.readAcross(ss,ranges,true,{flush:false}));current.forEach((name,i)=>contactPrefetchedValues_.set(name,values[i]));
}
// Whole-table value reads need no SpreadsheetApp dimension lookups. Sheets
// trims trailing empty cells; current authority and read markers stay live.
function contactPrefetchRosterDirectory_(ss,phase){
 const names=['admin_users','roles','contacts'].filter(name=>!contactViewTables_.has(name)&&!contactReadCache_.has(name)&&!contactPrefetchedValues_.has(name));
 const values=contactPhase_(phase,()=>GSISSheets.readTables(ss,names,true));names.forEach((name,i)=>contactPrefetchedValues_.set(name,values[i]));
}
function required_(table,headers){headers.forEach(h=>{if(table.headers.indexOf(h)<0)throw fault_(503,'Missing required column: '+h);});}
function roles_(r){return r&&r.Active==='Y'?r.Role.split(',').map(s=>s.trim()).filter(s=>s==='Admin'||s==='KP'):[];}
function access_(ss){const t=table_(ss,'admin_users');required_(t,['Email','Role','Active','Updated At','Admin ID']);const seen={};t.rows=t.rows.filter(r=>r.Email);t.rows.forEach(r=>{r.Email=r.Email.trim().toLowerCase();if(seen[r.Email])throw fault_(503,'Duplicate application access records need review');seen[r.Email]=true;});return t;}
function contactAuthority_(ss,identity){return {email:identity.email,roles:roles_(access_(ss).rows.find(r=>r.Email===identity.email))};}
function email_(value,domain){const s=String(value||'').trim();if(!s)return '';return s.indexOf('@')>=0?s:s+'@'+domain;}
function version_(row){return row?Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify([row.Email,row.Role,row.Active,row['Updated At'],row['Admin ID']]))):'new';}
function bootstrap_(ss,identity){
  const {people,groups}=contactDirectoryRead_(ss);
  const access=access_(ss),mine=access.rows.find(r=>r.Email===identity.email);
  const named={};people.forEach(p=>{if(p.emails.gsps)named[p.emails.gsps.toLowerCase()]=p.name;});
  return {user:{email:identity.email,roles:roles_(mine)},people,groups,
    access:access.rows.map(r=>({email:r.Email,name:named[r.Email]||'',roles:roles_(r),active:r.Active,version:version_(r)})),
    fetchedAt:new Date().toISOString(),signatureSettings:signatureSettings_(),deploymentAvailable:false};
}
// Shared data only: each caller's identity and current permissions are read separately.
function contactDirectoryRead_(ss){
 return contactCachedRead_('directory-v601-memberships',()=>{
  if(contactCacheEnabled_){contactPrefetchDirectory_(ss);access_(ss);}
  const catalogue=table_(ss,'roles'),contacts=deriveContacts_(ss,table_(ss,'contacts'),catalogue);
  required_(contacts,['TTb Name','Statutory Name','Role','Employment Modifier','Subject Modifier','Active','MK Modifier','Staff ID']);
  required_(catalogue,['Role Shortform']);
  const groupHeaders=catalogue.headers.filter(h=>!['Role Shortform','Formal Role Name','EO Appt Level','Required Subject Modifier'].includes(h));
  const lookup={};catalogue.rows.forEach(r=>{if(r['Role Shortform'])lookup[r['Role Shortform']]=r;});
  const people=contacts.rows.filter(r=>r['TTb Name']).map(r=>({
    id:r['Staff ID'],name:r['TTb Name'],formalRole:lookup[r.Role]?.['Formal Role Name']||'',statutoryName:r['Statutory Name'],role:r.Role,active:r.Active,
    employment:r['Employment Modifier'],subject:r['Subject Modifier'],mk:r['MK Modifier'],basicName:r['Basic Name'],dayOfBirth:r['Day of Birth'],monthOfBirth:r['Month of birth'],appointmentLevel:r['EO Appt Level'],appointmentStatus:r['Appointment Status'],iconAlias:r['iCON Alias (@moe.edu.sg)'],cesAlias:r['CES Alias (@schools.gov.sg)'],gspsAlias:r['GSPS Alias (@gsps.edu.sg)'],
    groups:contactRoleGroups_(lookup[r.Role],groupHeaders),
    emails:{gsps:email_(r['GSPS Alias (@gsps.edu.sg)'],'gsps.edu.sg'),icon:email_(r['iCON Alias (@moe.edu.sg)'],'moe.edu.sg'),ces:email_(r['CES Alias (@schools.gov.sg)'],'schools.gov.sg')},
    mobile:r['Mobile No'],ext:r.EXT
  }));
  // Requested directory fields are explicitly selected; raw rows and hidden identifiers are not exported.
  return {people,groups:groupHeaders};
 });
}
function setKP_(ss,req){
  const lock=LockService.getScriptLock();if(!contactLock_(lock,5000))throw fault_(503,'Another update is in progress. Refresh and try again.');
  try {
    contactWriterReady_(req);const t=access_(ss),actor=t.rows.find(r=>r.Email===req.identity.email);
    if(!roles_(actor).includes('Admin'))throw fault_(403,'Only Admins may change application access.');
    const input=req.input||{},email=String(input.email||'').trim().toLowerCase();
    if(!/^[A-Za-z0-9._%+-]+@gsps\.edu\.sg$/.test(email)||typeof input.enabled!=='boolean')throw fault_(400,'A school email and KP choice are required.');
    let row=t.rows.find(r=>r.Email===email);
    if(input.version!==version_(row))throw fault_(409,'This access record changed. Refresh before saving again.');
    // Admin may be explicitly granted. Omitted/false never revokes an existing Admin.
    if(input.grantAdmin!==undefined&&typeof input.grantAdmin!=='boolean')throw fault_(400,'Choose whether to grant Admin access.');
    if(input.grantAdmin&&row?.Role.split(',').map(s=>s.trim()).includes('KP')&&!input.enabled)throw fault_(400,'Keep existing SMC access when adding Admin. Change SMC separately.');
    if(row&&row.Active!=='Y'&&row.Role.split(',').map(s=>s.trim()).includes('Admin')&&!input.grantAdmin)throw fault_(409,'This Admin record must be managed in the backend sheet.');
    const next=(row?row.Role.split(',').map(s=>s.trim()).filter(s=>s&&s!=='KP'):[]);
    if(input.enabled)next.push('KP');
    if(input.grantAdmin&&!next.includes('Admin'))next.push('Admin');
    if(row&&row.Role===next.join(', ')&&row.Active===(next.length?'Y':'N'))return {email,roles:next,active:row.Active,version:version_(row),unchanged:true};
    const data=Object.assign({},row||{}, {Email:email,Role:next.join(', '),Active:next.length?'Y':'N','Updated At':new Date().toISOString(),'Admin ID':row?row['Admin ID']:Utilities.getUuid()});
    const rowNumber=row?row._row:Math.max(2,t.sheet.getLastRow()+1);
    if(rowNumber>t.sheet.getMaxRows())t.sheet.insertRowsAfter(t.sheet.getMaxRows(),20);
    const values=t.headers.map(h=>data[h]||'');
    writeContactDirtyRow_(t.sheet,rowNumber,values,t.headers.map(h=>row?.[h]||''));
    contactFlush_();contactReadCache_.clear();
    return {email,roles:next,active:data.Active,version:version_(data)};
  } finally {lock.releaseLock();}
}

// Additive Deploy integration: minimal staff data and current actor authority.
// Cache only the common read payload. Current authority is always read separately.
function deployReadCacheKey_(){const p=PropertiesService.getScriptProperties();return 'deploy-staff-v2:'+String(p.getProperty('DEPLOY_READ_EPOCH')||'initial')+':'+String(p.getProperty('CONTACTS_DATA_EPOCH')||'initial');}
function contactCachedRead_(kind,build){
 if(contactViewStatus_?.pending)return build();
 let cache=null,key='';
 try{
  cache=CacheService.getScriptCache();key=kind+':'+deployReadCacheKey_();const hit=cache.get(key);
  if(hit){const data=JSON.parse(hit);if(!data.chunkSet){if(contactTrace_)contactTrace_.cache={kind,hit:true};return data;}
   if(/^[\w-]{36}$/.test(data.chunkSet)&&Number.isInteger(data.chunks)&&data.chunks>0&&data.chunks<=20){const keys=Array.from({length:data.chunks},(_,i)=>key+':'+data.chunkSet+':'+i),parts=cache.getAll(keys);if(keys.every(k=>typeof parts[k]==='string')){const result=JSON.parse(keys.map(k=>parts[k]).join(''));if(contactTrace_)contactTrace_.cache={kind,hit:true};return result;}}
  }
 }catch(e){cache=null;}
 if(contactTrace_)contactTrace_.cache={kind,hit:false};const data=build();
 if(cache)try{
  const text=JSON.stringify(data);
  if(unescape(encodeURIComponent(text)).length<90000)cache.put(key,text,30);
  else if(text.length<=590000){
   // Publish a manifest only after every bounded chunk; eviction always falls back to Sheets.
   const chunkSet=Utilities.getUuid(),parts={};let at=0,count=0;
   while(at<text.length){let end=Math.min(text.length,at+30000);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;parts[key+':'+chunkSet+':'+count++]=text.slice(at,end);at=end;}
   cache.putAll(parts,30);cache.put(key,JSON.stringify({chunkSet,chunks:count}),30);
  }
 }catch(e){}return data;
}
function invalidateDeployReadCache_(){try{PropertiesService.getScriptProperties().setProperty('DEPLOY_READ_EPOCH',Utilities.getUuid());}catch(e){try{const cache=CacheService.getScriptCache(),key=deployReadCacheKey_();for(const kind of ['staff-v1','staff-v601-memberships','directory-v1','directory-v601-memberships'])cache.remove(kind+':'+key);}catch(ignored){}}}
function deploySnapshot_(ss,identity,input={}){
 const datesOnly=input.authorityOnly===true&&input.rosterProjection==='staplerDates';
 if((datesOnly||input.rosterAuthority===true||input.rosterDirectory===true)&&contactCacheEnabled_)contactPrefetchRosterDirectory_(ss,'rosterAuthorityBatch');
 const user=contactAuthority_(ss,identity);
 if(user.roles.includes('Admin'))user.palEditor=true;
 else if(user.roles.includes('KP')&&(input.authorityOnly!==true||input.palAuthority===true)){
  if(input.palAuthority===true&&contactViewStatus_?.pending)throw fault_(503,'Contacts changes are pending. Retry PAL editing after they complete.');
  const matches=table_(ss,'contacts').rows.filter(r=>email_(r['GSPS Alias (@gsps.edu.sg)'],'gsps.edu.sg').toLowerCase()===identity.email.toLowerCase());
  user.palEditor=!contactViewStatus_?.pending&&matches.length===1&&matches[0].Active==='Y'&&/^(?:Acting\s+)?YH$/i.test(String(matches[0].Role||'').trim());
 }
 const roster=datesOnly||input.rosterAuthority===true||input.rosterDirectory===true;
 if(roster)Object.assign(user,rosterContactAuthority_(ss,identity,user));
 if(datesOnly){
  // Derive and validate the entire canonical directory before selecting identities.
  const people=rosterContactPeople_(ss,true),caller=people.find(p=>p.id===user.rosterStaffId);
  const sponsors=people.filter(p=>p.active&&p.groups.includes('SMC')&&p.adhocEligible&&!['SL','Support'].some(g=>p.groups.includes(g))&&!/^(?:SL|P|VP|AM|OM|SAT|Principal|Vice Principal)$/i.test(p.role.replace(/^(?:Acting|Ag)\s+/i,''))).map(({id,name})=>({id,name}));
  return {user,rosterProjection:'staplerDates',rosterDates:{caller:caller?{id:caller.id,name:caller.name,active:caller.active,role:caller.role,groups:caller.groups,mk:caller.mk,appointmentLevel:caller.appointmentLevel}:null,sponsors}};
 }
 // The directory is for the authenticated Roster backend, never a Contacts browser route.
 // Roster projects this to names/IDs for staff and TTb name/mobile for its SMC picker.
 const rosterData=input.rosterDirectory===true?{rosterPeople:rosterContactPeople_(ss)}:{};
 if(input.rosterDirectory===true){rosterData.rosterAdminIds=rosterContactAdminIds_(ss,rosterData.rosterPeople);rosterData.rosterSMCIds=rosterContactSMCIds_(ss,rosterData.rosterPeople);}
 if(input.authorityOnly===true||!user.roles.length)return {user,...rosterData};
 const build=()=>{
 if(contactCacheEnabled_)contactPrefetchDirectory_(ss,false,'deployCatalogueBatch');
 const catalogue=table_(ss,'roles'),groupHeaders=catalogue.headers.filter(h=>!['Role Shortform','Formal Role Name','EO Appt Level','Required Subject Modifier'].includes(h)),lookup={};catalogue.rows.forEach(r=>{lookup[r['Role Shortform']]=r});
 const t=deriveContacts_(ss,table_(ss,'contacts'),catalogue); required_(t,['Staff ID','TTb Name','Active','Role','MK Modifier']);
 const people=t.rows.filter(r=>r['Staff ID']&&r['TTb Name']).map(r=>({id:r['Staff ID'],name:r['TTb Name'],active:r.Active==='Y',role:r.Role,mk:r['MK Modifier'],groups:contactRoleGroups_(lookup[r.Role],groupHeaders),profile:Object.fromEntries(DEPLOY_PROFILE_FIELDS.map(k=>[k,r[k]||'']))}));
 const seen={};people.forEach(p=>{if(seen[p.id])throw fault_(503,'Duplicate Staff ID');seen[p.id]=true;});
 const data={people,membership:{fields:['Role Shortform','Formal Role Name',...MEMBERSHIP_FLAGS,'EO Appt Level'],rows:catalogue.rows.filter(r=>r['Role Shortform']).map(r=>['Role Shortform','Formal Role Name',...MEMBERSHIP_FLAGS,'EO Appt Level'].map(k=>r[k]||''))},legacyOffload:legacyOffload_(ss),sysFields:sysFields_(ss,t,catalogue),roleCatalogue:catalogue.rows.filter(r=>r['Role Shortform']).map(r=>({role:r['Role Shortform'],level:normaliseEO_(r['EO Appt Level']),requiredSubject:requiredSubject_(r),groups:contactRoleGroups_(r,groupHeaders)}))};
 data.catalogueHash=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify([data.sysFields,data.roleCatalogue,data.people])).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');return data;};
 const catalogueEpoch=deployReadCacheKey_(),data=input.readOnly===true?contactCachedRead_('staff-v601-memberships',build):build();
 if(catalogueEpoch!==deployReadCacheKey_())throw fault_(503,'Contacts changed while reading. Retry the load.');
 const result={...data,...rosterData,user,catalogueEpoch,authoritative:!contactViewStatus_?.pending};
 // The common catalogue is content-addressed; permissions and epoch are always fresh.
 if(result.authoritative&&input.knownCatalogueHash===data.catalogueHash){delete result.people;delete result.sysFields;delete result.roleCatalogue;result.catalogueUnchanged=true;}
 return result;
}

function rosterContactAuthority_(ss,identity,user=contactAuthority_(ss,identity)){
 if(contactViewStatus_?.pending)throw fault_(503,'Contacts changes are pending. Refresh Roster after they complete.');
 const matches=table_(ss,'contacts').rows.filter(r=>email_(r['GSPS Alias (@gsps.edu.sg)'],'gsps.edu.sg').toLowerCase()===identity.email.toLowerCase());
 const catalogue=table_(ss,'roles'),person=matches.length===1&&matches[0].Active==='Y'&&matches[0]['Staff ID']?matches[0]:null;
 const role=person&&(catalogue.rows.find(r=>r['Role Shortform']===person.Role)||catalogue.rows.find(r=>r['Role Shortform']===String(person.Role).replace(/^(?:Acting|Ag)\s+/i,'')));
 return {rosterStaffId:person?person['Staff ID']:null,rosterSMC:!!person&&contactRoleGroups_(role,MEMBERSHIP_FLAGS).includes('SMC'),rosterAdmin:user.roles.includes('Admin')};
}
function rosterContactPerson_(r,role,datesOnly=false){
 if(datesOnly){const groups=contactRoleGroups_(role,MEMBERSHIP_FLAGS);return {id:r['Staff ID'],name:r['TTb Name'],active:r.Active==='Y',role:r.Role||'',groups,mk:r['MK Modifier']||'',appointmentLevel:r['EO Appt Level']||'',adhocEligible:GSISTeachingRules.eligible({profile:r,role:r.Role,groups,mk:r['MK Modifier']})};}
 const email=email_(r['GSPS Alias (@gsps.edu.sg)'],'gsps.edu.sg').toLowerCase(),ces=email_(r['CES Alias (@schools.gov.sg)'],'schools.gov.sg').toLowerCase(),groups=contactRoleGroups_(role,MEMBERSHIP_FLAGS);
 return {id:r['Staff ID'],name:r['TTb Name'],mobile:rosterContactMobile_(r['Mobile No']),email,emails:[...new Set([ces,email].filter(Boolean))],active:r.Active==='Y',employment:r['Employment Modifier']||'',mk:r['MK Modifier']||'',appointmentLevel:r['EO Appt Level']||'',role:r.Role||'',groups,adhocEligible:GSISTeachingRules.eligible({profile:r,role:r.Role,groups,mk:r['MK Modifier']})};
}
function rosterContactPeople_(ss,datesOnly=false){
 const seen=new Set(),roles=new Map(table_(ss,'roles').rows.map(r=>[r['Role Shortform'],r]));return calculatedContacts_(ss).rows.filter(r=>r['Staff ID']&&r['TTb Name']).map(r=>{if(seen.has(r['Staff ID']))throw fault_(503,'Duplicate Staff ID');seen.add(r['Staff ID']);return rosterContactPerson_(r,roles.get(r.Role)||roles.get(String(r.Role||'').replace(/^(?:Acting|Ag)\s+/i,'')),datesOnly);});
}
function rosterContactSMCIds_(ss,people){return people.filter(p=>p.active&&p.groups.includes('SMC')).map(p=>p.id);}
function rosterContactUrgentSMCIds_(ss,people){return people.filter(p=>p.active&&p.groups.includes('SMC')&&!p.groups.includes('SL')&&!p.groups.includes('Support')).map(p=>p.id);}
function rosterContactAdminIds_(ss,people){const admins=new Set(access_(ss).rows.filter(r=>roles_(r).includes('Admin')).map(r=>r.Email)),emailCounts=new Map();people.forEach(p=>emailCounts.set(p.email,(emailCounts.get(p.email)||0)+1));return people.filter(p=>p.active&&p.email&&admins.has(p.email)&&emailCounts.get(p.email)===1).map(p=>p.id);}
function requireRosterContactCreator_(ss,identity){const authority=rosterContactAuthority_(ss,identity);if(!authority.rosterSMC&&!authority.rosterAdmin)throw fault_(403,'Only SMC or Admin may add an ad-hoc contact.');return authority;}
function rosterContactMobile_(value){let digits=String(value||'').replace(/[\s()+.-]/g,'');if(/^0065\d{8}$/.test(digits))digits=digits.slice(4);else if(/^65\d{8}$/.test(digits))digits=digits.slice(2);return digits;}
function rosterContactTtbKey_(value){return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();}
function rosterContactName_(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\([^)]*\)/g,' ').replace(/^(?:mr|mrs|ms|miss|mdm|dr)\.?\s+/,'').replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).sort().join(' ');}
function rosterContactSimilarName_(a,b){
 if(!a||!b)return false;if(a===b)return true;if(Math.min(a.length,b.length)<5||Math.abs(a.length-b.length)>2)return false;
 // ponytail: short names and one school directory; bounded edit distance needs no search dependency.
 let previous=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));previous=next;}
 return previous[b.length]<=Math.min(2,Math.max(1,Math.floor(Math.max(a.length,b.length)*0.15)));
}
function rosterContactModifier_(value){
 const text=String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');
 if(typeof value!=='undefined'&&typeof value!=='string'||text.length>32||text&&!/^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u.test(text))throw fault_(400,'Use a modifier of up to 32 letters, numbers, spaces, dots, slashes, hyphens or underscores.');
 return text;
}
function validateRosterContactAddition_(p,legacyRecovery=false){
 const item=p.additions?.[0],v=item?.values;
 if(p.changes?.length!==0||p.additions?.length!==1||item.id!=='contact-'+p.requestId||!v||Object.keys(v).some(k=>!['Basic Name','Mobile No','Employment Modifier','Subject Modifier','Active'].includes(k))||v.Active!=='N'||typeof v['Basic Name']!=='string'||!v['Basic Name'].trim()||v['Basic Name'].length>120||typeof v['Mobile No']!=='string'||!/^\d{8}$/.test(v['Mobile No'])&&!(legacyRecovery&&v['Mobile No']==='')||!v['Employment Modifier']||rosterContactModifier_(v['Employment Modifier'])!==v['Employment Modifier'])throw fault_(400,'Roster may only create one inactive relief contact with a name, mobile and modifier.');
 if(v['Subject Modifier']!==undefined&&rosterContactModifier_(v['Subject Modifier'])!==v['Subject Modifier'])throw fault_(400,'Invalid timetable name modifier.');
}
function rosterContactCreate_(ss,req){
 const p=req.input||{};
 if(Object.keys(p).some(k=>!['name','modifier','mobile','employment','confirmDistinct','requestId'].includes(k))||!/^[\w-]{36}$/.test(p.requestId||'')||typeof p.name!=='string'||!p.name.trim()||p.name.trim().length>120||typeof p.mobile!=='string'||p.mobile.length>40||p.employment!==undefined&&typeof p.employment!=='string'||p.confirmDistinct!==undefined&&typeof p.confirmDistinct!=='boolean')throw fault_(400,'Provide the name, mobile number and original request ID.');
 // Store the chosen provisional modifier immediately. Admin completes the same
 // inactive record later; creating it does not change permanent active status.
 const inputName=p.name.normalize('NFKC').trim().replace(/\s+/g,' '),mobile=rosterContactMobile_(p.mobile),employment=rosterContactModifier_(p.modifier??p.employment)||'SRE',suffix=' ('+employment+')',name=inputName.toLowerCase().endsWith(suffix.toLowerCase())?inputName.slice(0,-suffix.length).trim():inputName,timetableName=name+suffix;
 if(!name)throw fault_(400,'Enter the teacher’s basic name.');
 if(!/^[89]\d{7}$/.test(mobile)||(p.employment||'').length>80)throw fault_(400,'Enter an eight-digit Singapore mobile number starting with 8 or 9, with optional +65.');
 const lock=LockService.getScriptLock();if(!contactLock_(lock,1000))throw contactBusyFault_();
 try{
  contactWriterReady_(req);if(contactCacheEnabled_)contactPrefetchDirectory_(ss,true);requireRosterContactCreator_(ss,req.identity);
  const id='contact-'+p.requestId,values={'Basic Name':name,'Mobile No':mobile,'Employment Modifier':employment,Active:'N'},payload={changes:[],additions:[{id,values}]},original={...req,input:{requestId:p.requestId,...payload}};
  const prior=contactJournalRow_(ss.getSheetByName('contact_save_journal'),p.requestId,7),people=rosterContactPeople_(ss);
  if(prior&&(prior.values[1]!==req.identity.email||prior.values[2]!=='roster'||prior.values[3]!==digestData_(payload)))throw fault_(409,'Retry payload differs. Reload before changing an unconfirmed save.');
  if(!prior){
   const key=rosterContactName_(name),ttb=rosterContactTtbKey_(timetableName),exact=people.filter(person=>person.mobile===mobile||rosterContactTtbKey_(person.name)===ttb),matches=exact.length?exact:people.filter(person=>rosterContactSimilarName_(key,rosterContactName_(person.name))),duplicates=matches.map(person=>({id:person.id,name:person.name,mobile:person.mobile,active:person.active,employment:person.employment,adhocEligible:person.adhocEligible,match:person.mobile===mobile?'mobile':rosterContactTtbKey_(person.name)===ttb?'timetableName':'name'}));
   if(exact.length)return {saved:false,duplicates,blocked:true,conflict:exact.length>1,requiresConfirmation:false,message:exact.length>1?'The name and mobile match multiple records. Correct the details before continuing.':exact[0].active?'This teacher is already active in the system.':exact[0].adhocEligible?'This teacher already exists. Select the existing teacher for this day.':'This contact already exists and is not eligible for ad-hoc teaching relief.'};
   if(duplicates.length&&!p.confirmDistinct)return {saved:false,duplicates,blocked:false,requiresConfirmation:true};
  }
  const result=saveContactDataLocked_(ss,original,false,null,[],true),row={'Staff ID':id,'TTb Name':timetableName,...values};
  return {saved:true,duplicate:!!result.duplicate,requestId:p.requestId,person:result.duplicate&&people.find(person=>person.id===id)||rosterContactPerson_(row),duplicates:[]};
 }finally{lock.releaseLock();}
}

// Optional active-only Deploy data. Configure DEPLOY_API_URL and DEPLOY_BRIDGE_SECRET.
function bootstrapWithDeploy_(ss,identity){const data=bootstrap_(ss,identity);data.deploymentPending=true;return data;}
function deploymentData_(identity){
 const current=currentContactsDeployment_(SpreadsheetApp.openById(GSIS_SHEET));if(current!==null)return current;
 const p=PropertiesService.getScriptProperties(),url=p.getProperty('DEPLOY_API_URL'),secret=gsisApiSecret_('DEPLOY_BRIDGE_SECRET');
 if(!url||!secret)return {available:false,error:'Deploy connection not configured'};
 try{
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)||secret.length<32)throw Error('Invalid Deploy configuration');
  const payload=JSON.stringify({action:'active',identity,input:{},timestamp:Date.now(),nonce:Utilities.getUuid()});
  const signature=Utilities.computeHmacSha256Signature(payload,secret).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
  const r=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify({payload,signature}),muteHttpExceptions:true});
  const result=JSON.parse(r.getContentText());if(!result.ok||!result.data.activeVersionId)throw Error('Active deployment unavailable');
  return {available:true,...result.data};
 }catch(e){return {available:false,error:'Deployment information could not be loaded. Contacts remain available.'};}
}

const DATA_FIELDS=['TTb Name','Basic Name','Statutory Name','iCON Alias (@moe.edu.sg)','CES Alias (@schools.gov.sg)','GSPS Alias (@gsps.edu.sg)','Mobile No','EXT','Day of Birth','Month of birth','Role','EO Appt Level','Appointment Status','Employment Modifier','Subject Modifier','Active','MK Modifier'];
function requireDataAdmin_(ss,identity){const mine=access_(ss).rows.find(r=>r.Email===identity.email);if(!roles_(mine).includes('Admin'))throw fault_(403,'Only Sys Admins may access staff data.');}
function requireStaffView_(ss,identity){const r=roles_(access_(ss).rows.find(r=>r.Email===identity.email));if(!r.some(x=>x==='Admin'||x==='KP'))throw fault_(403,'Admin or KP access required');return r.includes('Admin')}
function contactData_(ss,identity){
 const editable=requireStaffView_(ss,identity),raw=table_(ss,'contacts'),catalogue=table_(ss,'roles'),t=deriveContacts_(ss,raw,catalogue);required_(t,['Staff ID',...DATA_FIELDS]);const seen=new Set();
 return {fields:DATA_FIELDS,editable,roleRules:catalogue.rows.map(r=>({role:r['Role Shortform'],level:normaliseEO_(r['EO Appt Level']),requiredSubject:requiredSubject_(r)})),lists:sysFields_(ss,t,catalogue),rows:t.rows.filter(r=>r['Staff ID']).map(r=>{if(seen.has(r['Staff ID']))throw fault_(503,'Duplicate Staff ID');seen.add(r['Staff ID']);return {id:r['Staff ID'],values:DATA_FIELDS.map(k=>r[k]||''),computed:DATA_FIELDS.map(k=>CONTACT_DERIVED_FIELDS.includes(k)),groups:contactRoleGroups_(catalogue.rows.find(x=>x['Role Shortform']===r.Role),MEMBERSHIP_FLAGS),formalRole:catalogue.rows.find(x=>x['Role Shortform']===r.Role)?.['Formal Role Name']||''}})};
}
function safeCell_(v){return typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v}
function digestData_(v){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(v)))}
function saveContactData_(ss,req,diy=false){
 const lock=LockService.getScriptLock();if(!contactLock_(lock,1000))throw contactBusyFault_();
 try{return saveContactDataLocked_(ss,req,diy);}finally{lock.releaseLock();}
}
// Called only while the writer lock is held. recoveryBy is server-created, never request input.
function saveContactDataLocked_(ss,req,diy=false,recoveryBy=null,recoveryAudit=[],rosterCreate=false){
  contactWriterReady_(req);if(contactCacheEnabled_)contactPrefetchDirectory_(ss,true);if(recoveryBy)requireDataAdmin_(ss,recoveryBy);else if(rosterCreate)requireRosterContactCreator_(ss,req.identity);else if(!diy)requireDataAdmin_(ss,req.identity);const p=req.input||{},changes=p.changes,additions=p.additions||[];
  if(rosterCreate)validateRosterContactAddition_(p,!!recoveryBy);
  if(!/^[\w-]{36}$/.test(p.requestId||'')||!Array.isArray(changes)||!Array.isArray(additions)||(!changes.length&&!additions.length)||changes.length+additions.length*DATA_FIELDS.length>300||diy&&additions.length)throw fault_(400,'Save between 1 and 300 changed cells at a time.');
  // An Admin recovering an intact DIY journal uses its recorded Staff ID. The
  // original Google subject is not stored in old journals and must not be guessed.
  const own=diy&&!recoveryBy?ownStaff_(ss,req.identity,true):null,allowed=(diy?['Statutory Name','Mobile No']:DATA_FIELDS).filter(k=>!CONTACT_DERIVED_FIELDS.includes(k)&&(!diy||k!=='GSPS Alias (@gsps.edu.sg)'));
  const journal=saveJournal_(ss,p.requestId,req.identity.email,rosterCreate?'roster':diy?'diy':'contacts',additions.length?{changes,additions}:changes);
  if(journal.applied)return {saved:true,duplicate:true,requestId:p.requestId};
  // Appending a contact is not a legacy-formula migration: keep catalogue headers and existing records untouched.
  const physical=table_(ss,'contacts'),t=calculatedContacts_(ss),lists=sysFields_(ss),seen=new Set(),projected={...t,rows:t.rows.map(r=>({...r}))};required_(t,['Staff ID',...DATA_FIELDS]);
  if(rosterCreate){for(const field of ['Employment Modifier','Subject Modifier']){const modifier=p.additions[0].values[field];if(modifier&&!lists[field].includes(modifier))lists[field].push(modifier);}}
  for(const x of changes){
   if(!allowed.includes(x.field)||typeof x.value!=='string'||typeof x.expected!=='string'||x.value.length>500)throw fault_(400,'Invalid data cell');
   const r=projected.rows.find(r=>r['Staff ID']===x.id),key=x.id+'|'+x.field;if(!r||seen.has(key)||diy&&!recoveryBy&&x.id!==own['Staff ID'])throw fault_(403,'You may only edit permitted fields on your own record');seen.add(key);
   if((r[x.field]||'')!==x.expected&&(r[x.field]||'')!==x.value)throw fault_(409,x.field+' changed for '+r['Basic Name']+'. Reload and review before saving.');
   const value=x.field==='Mobile No'?x.value.replace(/\s/g,''):x.value;validateContactCell_(x.field,value,lists,r[x.field]);r[x.field]=value;
  }
  const added=new Set();for(const item of additions){
   if(!/^contact-[\w-]{36}$/.test(item?.id||'')||added.has(item.id)||!item.values||typeof item.values!=='object'||Array.isArray(item.values)||Object.keys(item.values).some(k=>!allowed.includes(k)))throw fault_(400,'Invalid new contact');added.add(item.id);
   const prior=projected.rows.find(r=>r['Staff ID']===item.id);if(prior&&!journal.pending)throw fault_(409,'Contact ID already exists. Reload and review.');
   const row=Object.fromEntries(t.headers.map(k=>[k,'']));row['Staff ID']=item.id;if(prior)row._row=prior._row;
   for(const k of allowed){const value=item.values[k]??'';if(typeof value!=='string'||value.length>500)throw fault_(400,'Invalid '+k);validateContactCell_(k,k==='Mobile No'?value.replace(/\s/g,''):value,lists,'');row[k]=value;}
   deriveContacts_(ss,{...t,rows:[row]});if(prior){if(allowed.some(k=>(prior[k]||'')!==''&&(prior[k]||'')!==(row[k]||'')))throw fault_(409,'New contact changed during recovery. Reload and review.');projected.rows[projected.rows.indexOf(prior)]=row;}else projected.rows.push(row);
  }
  deriveContacts_(ss,projected);validateDirectory_(projected.rows);if(changes.length&&!journal.pending)requireContactsBackup_(ss);const catalogue=table_(ss,'roles'),{pendingWrites,identityWrites,touched}=contactWritePlan_(physical,projected,changes,added);
  // Resolve capacity, range handles, source rows and catalogue data before the
  // first API write. IDs, fields, recovery audit and Applied share one API call.
  const api=GSISSheets.enabled(),identity=identityWrites.length&&!api?contactPrepareValues_(ss,[{sheet:t.sheet,writes:identityWrites}]):null;
  journal.prepare(journal.pending?null:contactViewCapture_(ss),[{sheet:t.sheet,writes:api?[...identityWrites,...pendingWrites]:pendingWrites},...recoveryAudit]);
  if(contactTrace_)contactTrace_.journalStarted=true;contactPhase_('journalPersist',()=>journal.begin());
  if(identity)contactPhase_('identityPersist',()=>identity.flush());
  contactPhase_('contactCommit',()=>journal.finish());contactReadCache_.clear();contactPrefetchedValues_.clear();
  return {saved:true,requestId:p.requestId,fields:DATA_FIELDS,changed:touched.map(r=>({id:r['Staff ID'],values:DATA_FIELDS.map(k=>r[k]||''),groups:contactRoleGroups_(catalogue.rows.find(x=>x['Role Shortform']===r.Role),MEMBERSHIP_FLAGS),formalRole:catalogue.rows.find(x=>x['Role Shortform']===r.Role)?.['Formal Role Name']||''}))};
}

function contactWritePlan_(physical,projected,changes,added,readOnly=false){
 const reserved=new Set(),pendingWrites=[],identityWrites=[],changedIds=new Set(changes.map(x=>x.id)),changedMobiles=new Set(changes.filter(x=>x.field==='Mobile No').map(x=>x.id)),before=new Map(physical.rows.map(r=>[r['Staff ID'],r])),t=projected,touched=t.rows.filter(r=>added.has(r['Staff ID'])||changedIds.has(r['Staff ID']));
 for(const row of touched){if(!row._row)row._row=reserveContactRow_(t,physical,row['Staff ID'],reserved,identityWrites,readOnly);const old=before.get(row['Staff ID']);writeContactDirtyRow_(t.sheet,row._row,t.headers.map(k=>safeCell_(k==='Mobile No'&&!added.has(row['Staff ID'])&&!changedMobiles.has(row['Staff ID'])?old?.[k]||'':row[k]||'')),t.headers.map(k=>safeCell_(reserved.has(row._row)&&k==='Staff ID'?row['Staff ID']:old?.[k]||'')),pendingWrites,CONTACT_DERIVED_FIELDS.map(k=>t.headers.indexOf(k)));}
 return {pendingWrites,identityWrites,touched};
}
// Reuse only genuinely empty template rows; never overwrite an unnamed record.
function reserveContactRow_(t,physical,id,reserved,pending,readOnly=false){
 const blank=physical.rows.find(r=>!reserved.has(r._row)&&physical.headers.every(k=>CONTACT_DERIVED_FIELDS.includes(k)||!String(r[k]||'').trim()));
 const row=blank?blank._row:Math.max(2,t.sheet.getLastRow()+1,...[...reserved].map(n=>n+1));reserved.add(row);
 if(!readOnly&&row>t.sheet.getMaxRows()){t.sheet.insertRowsAfter(t.sheet.getMaxRows(),Math.max(20,row-t.sheet.getMaxRows()));contactFlush_();}
 const write={row,col:t.headers.indexOf('Staff ID')+1,values:[[id]]};
 if(pending)pending.push(write);else contactValues_(null,[{sheet:t.sheet,writes:[write]}]);return row;
}
// These are the computed columns supported by this Contacts schema. No spreadsheet
// formula is evaluated or trusted by directory/Deploy reads.
const CONTACT_DERIVED_FIELDS=['TTb Name','EO Appt Level'];
function normaliseEO_(v){v=String(v||'').trim();return ['SSD','YH','HOD'].includes(v)?'HOD':['AYH','LH','SH','Jnr KP'].includes(v)?'Jnr KP':v==='0'?'':v}
function contactRoleGroups_(r,flags){return r?GSISTeachingRules.memberships(r['Role Shortform'],r['EO Appt Level'],flags.filter(k=>r[k]==='1')):[];}
function teacherRole_(r){return !!r&&GSISTeachingRules.eligible({role:r['Role Shortform'],groups:MEMBERSHIP_FLAGS.filter(k=>r[k]==='1')})}
function requiredSubject_(r){if(!r)return '';return ['MTL','PE','Art','Music'].includes(r['Role Shortform'])?r['Role Shortform']:''}

function contactFraction_(value){
 let best=[Math.round(value),1],error=Math.abs(value-best[0]);
 for(let den=1;den<=99;den++){const num=Math.round(value*den),diff=Math.abs(value-num/den);if(diff<error-1e-12){best=[num,den];error=diff}}
 return best[1]===1?String(best[0]):best[0]+'/'+best[1];
}
function deriveContacts_(ss,t,catalogue,offloadTable){
 required_(t,['Basic Name','Role','Employment Modifier','Subject Modifier','MK Modifier',...CONTACT_DERIVED_FIELDS]);
 catalogue=catalogue||table_(ss,'roles');required_(catalogue,['Role Shortform','EO Appt Level']);const lookup={};
 catalogue.rows.forEach(r=>{const key=r['Role Shortform'];if(!key)return;if(lookup[key])throw fault_(503,'Duplicate role in catalogue: '+key);lookup[key]=r});
 const tags=value=>String(value||'').split(/,\s*/).map(x=>x.trim()).filter(Boolean).map(x=>' ('+x+')').join('');
 t.rows.forEach(r=>{
  const base=String(r['Basic Name']||'').trim(),employment=String(r['Employment Modifier']||'');
  r['TTb Name']=base?base+tags(employment)+tags(r['Subject Modifier'])+tags(r['MK Modifier']):'';
  const role=lookup[r.Role];const mandatory=requiredSubject_(role);if(mandatory){const parts=String(r['Subject Modifier']||'').split(/,\s*/).filter(Boolean);if(!parts.includes(mandatory))parts.unshift(mandatory);r['Subject Modifier']=parts.join(', ');r['TTb Name']=base?base+tags(employment)+tags(r['Subject Modifier'])+tags(r['MK Modifier']):'';}
  r['EO Appt Level']=normaliseEO_(role?.['EO Appt Level']);r['Mobile No']=String(r['Mobile No']||'').replace(/\s/g,'');
 });return t;
}
function calculatedContacts_(ss){return deriveContacts_(ss,table_(ss,'contacts'))}
function backupContactsOnce_(ss,t){
 const props=PropertiesService.getScriptProperties(),key='CONTACT_VALUE_MIGRATION_BACKUP';if(props.getProperty(key))return;
 // copyTo retains formulas, values and formats. Existing history tabs are never changed.
 const name='contacts_before_values_'+Utilities.formatDate(new Date(),'UTC','yyyyMMdd_HHmmss');
 t.sheet.copyTo(ss).setName(name);props.setProperty(key,name);
}
// One-time preparation belongs in the upgrade, outside ordinary save latency.
function requireContactsBackup_(ss){
 const name=PropertiesService.getScriptProperties().getProperty('CONTACT_VALUE_MIGRATION_BACKUP');
 if(!name||!ss.getSheetByName(name))throw fault_(409,'Contacts needs one-time update preparation. Ask an administrator to complete the update, then retry.');
}
function prepareContactsPerformance410(){
 const ss=SpreadsheetApp.openById(GSIS_SHEET),req={action:'maintenance',identity:{email:''},input:{}};
 ensureContactsReady_(ss,req);contactReadOnly_=req.action==='bootstrap';const lock=LockService.getScriptLock();if(!contactLock_(lock,8000))throw fault_(503,'A save is running. Retry preparation after it finishes.');
 try{contactWriterReady_(req);backupContactsOnce_(ss,table_(ss,'contacts'));requireContactsBackup_(ss);return {ready:true,version:'0.9.9'};}
 finally{lock.releaseLock();}
}
function persistContactCalculations_(ss){const raw=table_(ss,'contacts'),t=deriveContacts_(ss,{...raw,rows:raw.rows.map(r=>({...r}))}),pending=[];for(let i=0;i<t.rows.length;i++){const r=t.rows[i],old=raw.rows[i],values=t.headers.map(k=>safeCell_((['Subject Modifier','Mobile No',...CONTACT_DERIVED_FIELDS].includes(k)?r[k]:old?.[k])||''));writeContactDirtyRow_(t.sheet,r._row,values,t.headers.map(k=>safeCell_(old?.[k]||'')),pending);}contactValues_(ss,[{sheet:t.sheet,writes:pending}]);return t.rows.filter(r=>r['Staff ID']).length;}

// Admin-only publication review; private details never enter Deploy version documents.
const DEPLOY_PROFILE_FIELDS=['Basic Name','Role','EO Appt Level','Appointment Status','Employment Modifier','Subject Modifier','Active'];
function deployPublishReview_(ss,identity,p){
 requireDataAdmin_(ss,identity);if(!Array.isArray(p?.proposals)||!p.proposals.length||p.proposals.length>100)throw fault_(400,'Invalid teacher proposals');
 const t=calculatedContacts_(ss);required_(t,['Staff ID',...DATA_FIELDS]);
 return {fields:DATA_FIELDS,changes:p.proposals.map(x=>{const r=t.rows.find(r=>r['Staff ID']===x.id),expected=r?Object.fromEntries(DATA_FIELDS.map(k=>[k,r[k]||''])):null,values=Object.fromEntries(DATA_FIELDS.map(k=>[k,expected?.[k]||'']));DEPLOY_PROFILE_FIELDS.forEach(k=>values[k]=x.profile[k]||'');deriveContacts_(ss,{headers:t.headers,rows:[values]});return {id:x.id,expected,values,isNew:!r}})};
}
function approveDeployTeachers_(ss,req){
 const lock=LockService.getScriptLock();if(!contactLock_(lock,8000))throw fault_(503,'Another Contacts save is in progress. Retry this publication.');
 try{
  contactWriterReady_(req);requireDataAdmin_(ss,req.identity);const p=req.input||{},items=p.approvals;
  if(!/^[\w-]{36}$/.test(p.requestId||'')||typeof p.versionId!=='string'||!Array.isArray(items)||!items.length||items.length>100)throw fault_(400,'Invalid publication approval');
  ensureAppointmentOverride_(ss);const physical=table_(ss,'contacts'),t=calculatedContacts_(ss);required_(t,['Staff ID',...DATA_FIELDS]);const roles=table_(ss,'roles').rows.map(r=>r['Role Shortform']),seen=new Set();
  let journal=ss.getSheetByName('contact_deploy_approvals');if(!journal){journal=ss.insertSheet('contact_deploy_approvals');journal.appendRow(['Request ID','Actor','Version','Payload','Status','At'])}
  const found=contactJournalRow_(journal,p.requestId,6),prior=found?found.row-2:-1,payload=JSON.stringify(items);
  if(prior>=0){const r=found.values;if(r[1]!==req.identity.email||r[2]!==p.versionId||r[3]!==payload)throw fault_(409,'Approval retry differs from the original request. Reopen the review.');if(r[4]==='Applied')return {saved:true,duplicate:true}}
  const projected={...t,rows:t.rows.map(r=>({...r}))};
  for(const x of items){
   if(!/^[-\w]{1,80}$/.test(x.id||'')||seen.has(x.id)||!x.values)throw fault_(400,'Invalid or duplicate teacher');seen.add(x.id);
   const matches=t.rows.filter(r=>r['Staff ID']===x.id);if(matches.length>1)throw fault_(503,'Duplicate Staff ID');const r=matches[0];
   if(!r&&!/^new-[\w-]{36}$/.test(x.id))throw fault_(409,'Teacher no longer exists. Reopen the review.');
   for(const k of DATA_FIELDS){const val=x.values[k];if(typeof val!=='string'||val.length>500)throw fault_(400,'Invalid '+k);}
   const v={...x.values};v['Mobile No']=v['Mobile No'].replace(/\s/g,'');if(v['Mobile No']&&!/^\d{8}$/.test(v['Mobile No']))throw fault_(400,'Mobile No must contain eight digits');
   if(!v['Basic Name'].trim()||!['Y','N'].includes(v.Active))throw fault_(400,'Basic Name and Active Y/N are required');
   // Admin approval accepts new staff role terms; application permissions use the separate access table.
   for(const k of DATA_FIELDS.filter(k=>k.includes('Alias')))validateContactAlias_(k,v[k]);
   for(const [k,max] of [['Day of Birth',31],['Month of birth',12]])if(v[k]&&(!/^\d+$/.test(v[k])||Number(v[k])<1||Number(v[k])>max))throw fault_(400,k+' is outside its valid range');
   const keys=DATA_FIELDS.filter(k=>!CONTACT_DERIVED_FIELDS.includes(k));
   if(r){const matchesDesired=keys.every(k=>(r[k]||'')===v[k]||(r[k]||'')===(x.expected?.[k]||'')),matchesExpected=x.expected&&keys.every(k=>(r[k]||'')===x.expected[k]);if(!matchesExpected&&!(prior>=0&&matchesDesired))throw fault_(409,'Contacts changed for '+r['Basic Name']+'. Reopen and review before publishing.');}
   else if(x.expected)throw fault_(409,'Teacher was removed from Contacts. Reopen the review.');
   let target=projected.rows.find(r=>r['Staff ID']===x.id);if(!target){target=Object.fromEntries(t.headers.map(k=>[k,'']));target['Staff ID']=x.id;projected.rows.push(target)}Object.assign(target,v);if(!r&&!v['GSPS Alias (@gsps.edu.sg)'])throw fault_(400,'GSPS Alias is required to approve a new teacher');
  }
  // Email identities must remain unique across the complete directory.
  for(const k of DATA_FIELDS.filter(k=>k.includes('Alias'))){const used=new Set();for(const r of projected.rows){const val=(r[k]||'').toLowerCase().split('@')[0];if(val){if(used.has(val))throw fault_(409,'Duplicate '+k+': '+val);used.add(val)}}}
  deriveContacts_(ss,projected);validateDirectory_(projected.rows);backupContactsOnce_(ss,t);
  if(prior<0){if(payload.length>45000)throw fault_(400,'Publish fewer teacher changes at once');const row=journal.getLastRow()+1;if(row>journal.getMaxRows()){journal.insertRowsAfter(journal.getMaxRows(),100);contactFlush_();}const viewing=contactViewJournalWrites_(journal,row,p.requestId,contactViewCapture_(ss));const start=contactPrepareValues_(ss,[{sheet:journal,writes:[...viewing,{row,col:1,values:[[p.requestId,req.identity.email,p.versionId,payload,'Pending',new Date().toISOString()]]}]}]);start.flush();contactPending_('contact_deploy_approvals',{id:p.requestId,actor:req.identity.email,row});contactEpoch_()}
  if(prior>=0){contactPending_('contact_deploy_approvals',{id:p.requestId,actor:req.identity.email,row:prior+2});contactEpoch_();}
  // Reserve stable identity first; resume dirty fields on the same physical row after interruption.
  for(const x of items){const row=projected.rows.find(r=>r['Staff ID']===x.id),existing=t.rows.find(r=>r['Staff ID']===x.id),number=existing?existing._row:Math.max(2,t.sheet.getLastRow()+1);if(number>t.sheet.getMaxRows())t.sheet.insertRowsAfter(t.sheet.getMaxRows(),20);if(!existing){t.sheet.getRange(number,t.headers.indexOf('Staff ID')+1).setValue(x.id);contactFlush_();}writeContactDirtyRow_(t.sheet,number,t.headers.map(k=>safeCell_(row[k]||'')),t.headers.map(k=>physical.rows.find(r=>r['Staff ID']===x.id)?.[k]||''));}
  contactFlush_();contactReadCache_.clear();journal.getRange(prior>=0?prior+2:journal.getLastRow(),5).setValue('Applied');contactFlush_();contactPending_('contact_deploy_approvals',null);contactEpoch_();contactReadCache_.clear();
  return {saved:true};
 }finally{lock.releaseLock()}
}

function ensureAppointmentOverride_(ss){
 for(const name of ['contacts','roles']){const sheet=ss.getSheetByName(name),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0],old=headers.indexOf('Appointment Level');if(old>=0)sheet.getRange(1,old+1).setValue('EO Appt Level');}
}

const VALIDATED_FIELDS=['Day of Birth','Month of birth','Role','EO Appt Level','Appointment Status','Employment Modifier','Subject Modifier','Active','MK Modifier'];
const DIY_FIELDS=['Statutory Name','Mobile No'];
const MEMBERSHIP_FLAGS=['SL','SC','SMC','KP','TL','SDT','CMT','SAT','Support','MK'];

function sysFields_(ss,contactsTable,roleTable){
 const sheet=ss.getSheetByName('sys_fields'),t=contactsTable||table_(ss,'contacts'),roles=roleTable||table_(ss,'roles');
 const stored=sheet?table_(ss,'sys_fields').rows:null,lists={};
 for(const k of VALIDATED_FIELDS){const saved=stored&&stored.filter(r=>r.Field===k);lists[k]=saved&&saved.length?saved.map(r=>r.Value).filter(Boolean):[...new Set((k==='Role'?roles.rows.map(r=>r['Role Shortform']):k==='EO Appt Level'?roles.rows.map(r=>r[k]).filter(x=>x!=='0'):t.rows.map(r=>r[k])).filter(Boolean))];}
 if(!stored||!stored.some(r=>r.Field==='EO Appt Level'))lists['EO Appt Level']=[...new Set(['SL','HOD','Jnr KP','TC','ST','LT',...lists['EO Appt Level'].map(normaliseEO_).filter(Boolean)])];
 lists['Day of Birth']=Array.from({length:31},(_,i)=>String(i+1));lists['Month of birth']=Array.from({length:12},(_,i)=>String(i+1));lists.Active=['Y','N'];return lists;
}
function validateContactAlias_(field,value){if(!value)return;const domain=field.match(/@([^)]*)/)[1],parts=value.split('@');if(parts.length>2||!/^[A-Za-z0-9._%+-]+$/.test(parts[0])||(parts.length===2&&parts[1].toLowerCase()!==domain))throw fault_(400,'Use an alias or an address ending @'+domain);}
function validateContactCell_(field,value,lists,previous){
 if(field==='Mobile No'&&value&&!/^\d{8}$/.test(value))throw fault_(400,'Mobile No must contain eight digits');
 if(field==='Basic Name'&&!value.trim())throw fault_(400,'Basic Name is required');
 if(field==='Active'&&!['Y','N'].includes(value))throw fault_(400,'Active must be Y or N');
 if(lists[field]&&value&&value!==previous&&!(field==='Subject Modifier'?value.split(/,\s*/).every(v=>lists[field].includes(v)||['MTL','PE','Art','Music'].includes(v)):lists[field].includes(value)))throw fault_(400,'Choose '+field+' from the Deploy-managed options');
 if(field.includes('Alias'))validateContactAlias_(field,value);
 for(const [k,max] of [['Day of Birth',31],['Month of birth',12]])if(field===k&&value&&(!/^\d+$/.test(value)||Number(value)<1||Number(value)>max))throw fault_(400,k+' is outside its valid range');
}
function validateDirectory_(rows){
 for(const k of DATA_FIELDS.filter(k=>k.includes('Alias'))){const seen=new Set();for(const r of rows){const v=(r[k]||'').trim().toLowerCase().split('@')[0];if(v){if(seen.has(v))throw fault_(409,'Duplicate '+k+': '+v);seen.add(v)}}}
 const names=new Set();for(const r of rows){if(!r['Staff ID'])continue;const n=rosterContactTtbKey_(r['TTb Name']);if(n&&names.has(n))throw fault_(409,'TTb Name must be unique, including inactive staff: '+r['TTb Name']);if(n)names.add(n);}
 for(const r of rows){const d=Number(r['Day of Birth']),m=Number(r['Month of birth']);if(d&&m&&d>new Date(2000,m,0).getDate())throw fault_(400,'Invalid birthday for '+r['Basic Name']);}
}
// Stable Google subject binding survives an authorised GSPS alias edit.
function ownStaff_(ss,identity,bind=false){
 const t=calculatedContacts_(ss),sheet=ss.getSheetByName('contact_identity_bindings'),rows=sheet?table_(ss,'contact_identity_bindings').rows:[],linked=rows.filter(r=>r.Subject===identity.subject);
 if(linked.length>1)throw fault_(503,'Duplicate identity binding');
 const matches=linked.length?t.rows.filter(r=>r['Staff ID']===linked[0]['Staff ID']):t.rows.filter(r=>email_(r['GSPS Alias (@gsps.edu.sg)'],'gsps.edu.sg').toLowerCase()===identity.email.toLowerCase());
 if(matches.length!==1||!matches[0]['Staff ID'])throw fault_(403,'No unique staff record matches your school account. Contact an Admin.');
 const row=matches[0];if(rows.some(r=>r['Staff ID']===row['Staff ID']&&r.Subject!==identity.subject))throw fault_(403,'This record is linked to another account. Contact an Admin.');
 if(bind&&!linked.length){const sh=sheet||ss.insertSheet('contact_identity_bindings');if(!sheet)sh.appendRow(['Subject','Staff ID','Original email']);sh.appendRow([identity.subject,row['Staff ID'],identity.email]);contactFlush_();contactReadCache_.clear();}return row;
}
function adminTable_(ss,identity,kind){
 if(kind==='diy'){const r=ownStaff_(ss,identity);return {kind,editable:true,fields:DIY_FIELDS,lists:{},rows:[{id:r['Staff ID'],values:DIY_FIELDS.map(k=>r[k]||''),computed:DIY_FIELDS.map(()=>false)}]};}
 const editable=requireStaffView_(ss,identity),lists=sysFields_(ss);
 if(kind==='offload')throw fault_(410,'Offload is managed per version in Deploy.');
 if(kind==='sysFields')return {kind,editable,lists,fields:['Field','Options'],rows:VALIDATED_FIELDS.map(k=>[k,lists[k].join('\n')]),revision:digestData_(lists)};
 const t=table_(ss,kind==='membership'?'roles':'offload'),fields=kind==='membership'?['Role Shortform','Formal Role Name',...MEMBERSHIP_FLAGS,'EO Appt Level']:['Tags','Offload Factor','Notes'];required_(t,kind==='membership'?['Role Shortform','EO Appt Level']:['Tags','Offload Factor']);
 lists['EO Appt Level']=[...new Set(['SL','HOD','Jnr KP','TC','ST','LT','MTT',...(lists['EO Appt Level']||[]),...t.rows.map(r=>normaliseEO_(r['EO Appt Level'])).filter(Boolean)])];const rows=t.rows.filter(r=>r[fields[0]]).map(r=>fields.map(k=>k==='EO Appt Level'?normaliseEO_(r[k]):k==='Required Subject Modifier'?requiredSubject_(r):r[k]||''));return {kind,editable,fields,rows,lists,revision:digestData_([fields,rows])};
}
function contactJournalRow_(sheet,id,width){
 if(!sheet||sheet.getLastRow()<2)return null;
 const pointer=Object.values(JSON.parse(PropertiesService.getScriptProperties().getProperty('CONTACTS_PENDING_V2')||'{}')).find(p=>p.id===id);
 if(pointer&&Number.isInteger(pointer.row)&&pointer.row>=2&&pointer.row<=sheet.getLastRow()){
  const values=contactJournalValues_(sheet,pointer.row,width);if(values[0]===id)return {row:pointer.row,values};
 }
 const hit=sheet.getRange(2,1,sheet.getLastRow()-1,1).createTextFinder(id).matchEntireCell(true).matchCase(true).useRegularExpression(false).findNext();return hit?{row:hit.getRow(),values:contactJournalValues_(sheet,hit.getRow(),width)}:null;
}
function contactJournalValues_(sheet,row,width){return GSISSheets.readAcross(null,[{sheet,row,col:1,height:1,width}],false,{flush:false})[0][0];}
// API value writes are synchronous. Flush only the SpreadsheetApp fallback or
// explicit sheet creation/expansion, rather than recalculating between every call.
function contactValues_(ss,blocks){return contactPhase_('valuesWrite',()=>{GSISSheets.write(ss,blocks,true,{flush:false});if(!GSISSheets.enabled())contactFlush_();});}
function contactPending_(name,value){const props=PropertiesService.getScriptProperties(),pending=JSON.parse(props.getProperty('CONTACTS_PENDING_V2')||'{}');if(value)pending[name]=value;else delete pending[name];props.setProperty('CONTACTS_PENDING_V2',JSON.stringify(pending));}
function saveJournal_(ss,id,actor,kind,payload){
 let sheet=ss.getSheetByName('contact_save_journal');if(!sheet){sheet=ss.insertSheet('contact_save_journal');sheet.appendRow(['Request ID','Actor','Kind','Digest','Status','At','Payload']);contactFlush_();}
 const digest=digestData_(payload),prior=contactJournalRow_(sheet,id,7),old=prior?.values;if(contactTrace_&&old?.[4]==='Pending')contactTrace_.journalStarted=true;
 if(old&&(old[1]!==actor||old[2]!==kind||old[3]!==digest))throw fault_(409,'Retry payload differs. Reload before changing an unconfirmed save.');
 if(old){if(!['Pending','Applied'].includes(old[4]))throw fault_(409,'The saved request status needs administrator review.');savedContactPayload_(old);}
 let row=prior?.row||0,start=null,finish=null,prepared=false;
 const journal={applied:old?.[4]==='Applied',pending:!!old,prepare(view,blocks=[]){
  if(prepared)throw Error('Contacts journal is already prepared.');
  if(!row){const text=JSON.stringify(payload);if(text.length>45000)throw fault_(400,'Save fewer changes at once');row=sheet.getLastRow()+1;
   if(row>sheet.getMaxRows()){sheet.insertRowsAfter(sheet.getMaxRows(),100);contactFlush_();}
   const viewing=contactViewJournalWrites_(sheet,row,id,view);
   start=contactPrepareValues_(ss,[{sheet,writes:[...viewing,{row,col:1,values:[[id,actor,kind,digest,'Pending',new Date().toISOString(),text]]}]}]);
  }
  finish=contactPrepareValues_(ss,[...blocks,{sheet,writes:[{row,col:5,values:[['Applied']]}]}]);prepared=true;
 },begin(view){
  if(!prepared)journal.prepare(view);
  if(start)start.flush();contactPending_('contact_save_journal',{id,actor,row});contactEpoch_();
 },finish(blocks){
  // The optional argument supports editor/test callers. Production writers
  // prepare both stages before begin(), then call finish() without arguments.
  if(blocks!==undefined)finish=contactPrepareValues_(ss,[...blocks,{sheet,writes:[{row,col:5,values:[['Applied']]}]}]);
  if(!finish)throw Error('Contacts journal has not been prepared.');finish.flush();contactPending_('contact_save_journal',null);contactEpoch_();
 }};return journal;
}

function saveAdminTable_(ss,req){throw fault_(410,'Manage Membership and HR Terms in Deploy.');}
function removeWorkbookFormulas_(ss){
 const report=[];const sheet=ss.getSheetByName('contacts');if(!sheet)return report;const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];for(const field of ['Subject Modifier','Mobile No',...CONTACT_DERIVED_FIELDS]){const col=headers.indexOf(field)+1;if(!col||sheet.getLastRow()<2)continue;const range=sheet.getRange(2,col,sheet.getLastRow()-1,1),formulas=range.getFormulas();if(!formulas.some(row=>row.some(Boolean)))continue;const values=range.getValues();let count=0;formulas.forEach((row,i)=>{let start=-1;for(let j=0;j<=row.length;j++){if(row[j]){if(start<0)start=j;count++;}else if(start>=0){sheet.getRange(i+2,col+start,1,j-start).setValues([values[i].slice(start,j).map(safeCell_)]);start=-1;}}});if(count)report.push({sheet:'contacts',field,cells:count});}return report;
}

function legacyOffload_(ss){
 const sh=ss.getSheetByName('offload');if(!sh)return {tags:[],staff:{}};const t=table_(ss,'offload'),staff={},contacts=table_(ss,'contacts');
 const tags=t.rows.filter(r=>r.Tags).map(r=>({id:r.Tags,name:r.Tags,factor:r['Offload Factor']||'',notes:r.Notes||'',legacy:{...r}})),known=new Set(tags.map(t=>t.id));
 const unresolved=[];for(const row of contacts.rows){const raw=row['Offload Tags']||row.Offload||'';if(!raw)continue;const selected=raw.split(/[,;]\s*/).filter(Boolean);if(row['Staff ID']&&selected.every(t=>known.has(t)))staff[row['Staff ID']]={tags:selected,notes:row['Offload Notes']||''};else unresolved.push({staffId:row['Staff ID']||'',name:row['TTb Name']||row['Basic Name'],tags:raw,notes:row['Offload Notes']||''});}
 return {tags,staff,legacyRows:t.rows,unresolved};
}

/* One teaching-load rule engine, shared by browser and Apps Script. No workload calculation. */
var GSISTeachingRules = (function () {
 'use strict';
 var excludedGroups=['SL','SAT','Support','MK'];
 var nonTeacher=/^(?:SLs?|School Leaders?|AE|AM(?: \(ICT\))?|Counsellor|CSO|DE|Dentist|ICT [AM]|Library|Librarian|Reception(?:ist)?|MK(?:\b.*)?|MKE|OM|OSO|P|VP(?:\b.*)?|Recep|SAT|SC|Sci Lab|SENO|Support(?: Staff)?)$/i;
 function eligible(t){var p=t.profile||{};return p['EO Appt Level']!=='SL'&&!t.mk&&!p['MK Modifier']&&!(t.groups||[]).some(function(g){return excludedGroups.indexOf(g)>=0})&&!nonTeacher.test(String(p.Role||t.role||'').trim())&&!nonTeacher.test(String(p['Employment Modifier']||t.employment||'').trim());}
 // Appointment membership is independent of Acting/Ag and OF. Preserve other catalogue groups.
 function memberships(role,level,groups){
  var result=(groups||[]).slice(),required=/^(SH|Jnr KP)$/.test(String(level||'').trim())&&/^SH(?:\s|$)/i.test(String(role||'').trim())?'SMC':['ST','LT','MTT'].includes(String(level||'').trim())?'TL':null;
  if(required&&!result.includes(required))result.push(required);return result;
 }
 function resolve(t,catalogue,live,draft){
  var out=Object.assign({},t),base={'Basic Name':t.name||'',Role:t.role||'','EO Appt Level':'','Appointment Status':'','Employment Modifier':t.employment||'','Subject Modifier':t.subject||'',Active:t.active?'Y':'N'};
  var legacy={};if(t.role!==undefined)legacy.Role=t.role;if(t.employment!==undefined)legacy['Employment Modifier']=t.employment;if(t.subject!==undefined)legacy['Subject Modifier']=t.subject;if(t.active!==undefined)legacy.Active=t.active===true||t.active==='Y'?'Y':'N';
  var p=Object.assign(base,live&&live.profile||{},legacy,t.profile||{},draft||{}),key=String(p.Role||'').trim().toLowerCase(),rule=(catalogue||[]).find(function(r){return String(r.role||'').trim().toLowerCase()===key});
  // A loaded master catalogue is authoritative, including deliberately blank levels.
  if(Array.isArray(catalogue)){p['EO Appt Level']=rule?String(rule.level||''):'';out.groups=rule?memberships(rule.role,rule.level,rule.groups):[];}
  out.profile=p;out.role=p.Role;out.active=p.Active==='Y';out.mk=t.mk!==undefined?t.mk:live&&live.mk||'';return out;
 }
 function group(role,level){if(level!==undefined&&level!==null){level=String(level).trim();return /^(SH|LH|AYH)$/.test(level)?'Jnr KP':/^(SSD|YH)$/.test(level)?'HOD':level;}role=String(role||'').trim();level='';if(/^(ST|LT|MTT)$/.test(role))return role;if(/^(HOD(?:\b.*)?|SSD|YH)$/.test(role))return 'HOD';if(/^(LH(?:\b.*)?|SH(?:\b.*)?|AYH|Jnr KP)$/.test(role))return 'Jnr KP';return /^(HOD|Jnr KP|ST|LT|MTT)$/.test(level)?level:/^(SH|LH|AYH)$/.test(level)?'Jnr KP':'';}
 function defaults(){return [
 ['HOD','Appointment group','HOD',30,20,'',''],['Jnr KP','Appointment group','Jnr KP',20,0,'',''],
 ['ST','Appointment group','ST',20,0,'',''],['LT','Appointment group','LT',30,'','',''],['MTT','Appointment group','MTT','','','','Rate unknown; configure if appointed.'],
 ['4/5','Employment Modifier','4/5',20,'','',''],['BT','Staff tag','BT',20,'','',''],
 ['UT','Staff tag','UT','','',26,'Weekly cap covers total actual workload, including non-teaching.'],
 ['FAJT','Staff tag','FAJT','','','','No fixed rate.'],['SRE','Staff tag','SRE','','','','No fixed rate.'],
 ['TC','Staff tag','TC',20,'','','it should be 30% but case load in our school is lower']
 ].map(function(a,i){return {id:'rule-'+i,name:a[0],source:a[1],match:a[2],percent:a[3],actingPercent:a[4],periods:a[5],notes:a[6]}});}
 function migrate(old){var cfg=old&&old.schema===2?JSON.parse(JSON.stringify(old)):{schema:2,tags:defaults(),staff:{},baseline:null,legacy:old?JSON.parse(JSON.stringify(old)):null};
  // One-time seed. The marker survives edits and deletion, including an explicit 0%.
  if(!cfg.roleOverrideSchema){if(!cfg.tags.some(function(r){return r.source==='Role'&&String(r.match).trim().toLowerCase()==='hod sm';}))cfg.tags.push({id:'role-hod-sm',name:'HOD SM',source:'Role',match:'HOD SM',percent:50,actingPercent:'',periods:'',notes:'Replaces the general appointment offload.'});cfg.roleOverrideSchema=1;}return cfg;}
 function tokens(value){return String(value||'').split(/[,;]\s*/).map(function(v){return v.trim()}).filter(Boolean)}
 function calculate(t,catalogue){var cfg=catalogue&&catalogue.schema===2&&catalogue.roleOverrideSchema?catalogue:migrate(catalogue),p=t.profile||{},g=group(p.Role||t.role,p['EO Appt Level']),acting=/^(Ag|Acting)$/i.test(String(p['Appointment Status']||'').trim()),matched=[],pending=[],retained=1,caps=[];
  if(!eligible(t))return {eligible:false,retained:null,offloadPercent:null,cap:null,limit:null,matched:[],pending:[]};
  var explicit=cfg.tags.find(function(r){return r.source==='Role'&&String(r.match).trim().toLowerCase()===String(p.Role||t.role||'').trim().toLowerCase()&&r.percent!==''&&r.percent!==null&&r.percent!==undefined;});
  cfg.tags.forEach(function(rule){var values=rule.source==='Appointment group'?[g]:rule.source==='Membership'?(t.groups||[]):rule.source==='Staff tag'?[p.Role||t.role,p['EO Appt Level']].concat(tokens(p['Employment Modifier']||t.employment),tokens(p['Subject Modifier']||t.subject),tokens(p['Appointment Status'])):tokens(p[rule.source]||(rule.source==='Role'?t.role:rule.source==='Employment Modifier'?t.employment:rule.source==='Subject Modifier'?t.subject:''));if(rule.source==='Role'?!values.some(function(v){return String(v||'').trim().toLowerCase()===String(rule.match).trim().toLowerCase();}):values.indexOf(rule.match)<0)return;var rate=rule.source==='Appointment group'&&acting?rule.actingPercent:rule.percent;
   if(rule.source==='Appointment group'&&rule.match==='ST'&&acting)rate=0;
   var replaced=rule.source==='Appointment group'&&!!explicit;if(replaced)rate='';
   if(!replaced&&rule.source==='Appointment group'&&acting&&rate==='')pending.push('Acting rate not configured: '+rule.name);
   if(!replaced&&rule.match==='MTT'&&rate==='')pending.push('MTT rate not configured');
   if(rate!==''&&rate!==null&&rate!==undefined)retained*=1-Number(rate)/100;
   if(rule.periods!==''&&rule.periods!==null&&rule.periods!==undefined)caps.push(Number(rule.periods));
   matched.push({id:rule.id,name:rule.name,source:rule.source,match:rule.match,percent:rate,periods:rule.periods,acting:rule.source==='Appointment group'&&acting,replacedBy:replaced?explicit.id:null});
  });
  var cap=caps.length?Math.min.apply(null,caps):null,baseline=cfg.baseline!==''&&cfg.baseline!==null&&cfg.baseline!==undefined?Number(cfg.baseline):null;
  return {eligible:true,retained:retained,offloadPercent:Math.round((1-retained)*1e8)/1e6,cap:cap,capBasis:matched.some(function(r){return r.match==='UT';})?'total':'teaching',limit:pending.length?null:baseline===null?cap:Math.min(baseline*retained,cap===null?Infinity:cap),baselinePending:baseline===null,matched:matched,pending:pending};
 }
 return {memberships:memberships,resolve:resolve,eligible:eligible,group:group,defaults:defaults,migrate:migrate,calculate:calculate};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISTeachingRules;

/* GSIS_CONTACTS_CATALOGUE_BEGIN */
// Signed Deploy publication: reconcile stable keys and journal physical cell patches.
function catalogueJournal_(ss){let s=ss.getSheetByName('catalogue_journal');if(!s){s=ss.insertSheet('catalogue_journal');s.appendRow(['Commit','Part','JSON']);}return s;}
function applyCatalogueTransaction_(ss,tx){const blocks=[];for(const b of tx.blocks){let s=ss.getSheetByName(b.name)||ss.insertSheet(b.name);for(const w of b.writes){if(w.row>s.getMaxRows())s.insertRowsAfter(s.getMaxRows(),w.row-s.getMaxRows()+100);if(w.col+w.values.length-1>s.getMaxColumns())s.insertColumnsAfter(s.getMaxColumns(),w.col+w.values.length-1-s.getMaxColumns());}blocks.push({sheet:s,writes:b.writes.map(w=>({row:w.row,col:w.col,values:[w.values]}))});}GSISSheets.write(ss,blocks,true);contactFlush_();const props=PropertiesService.getScriptProperties();props.setProperty('DEPLOY_CATALOGUE_REVISION',String(tx.revision));if(tx.digest)props.setProperty('DEPLOY_CATALOGUE_DIGEST',tx.digest);props.setProperty('DEPLOY_CATALOGUE_PENDING','');contactEpoch_();contactReadCache_.clear();}
function recoverCatalogue_(ss){const props=PropertiesService.getScriptProperties(),raw=props.getProperty('DEPLOY_CATALOGUE_PENDING');if(!raw)return;const at=JSON.parse(raw),rows=catalogueJournal_(ss).getRange(at.row,1,at.parts,3).getValues();if(rows.some((r,i)=>r[0]!==at.commit||Number(r[1])!==i))throw fault_(503,'Catalogue journal incomplete. Restore the spreadsheet backup.');applyCatalogueTransaction_(ss,JSON.parse(rows.map(r=>r[2]).join('')));}
function catalogueBlock_(ss,name,headers,rows){const s=ss.getSheetByName(name),height=s?Math.max(1,s.getLastRow()):1,width=Math.max(headers.length,s?.getLastColumn()||0),old=s?s.getRange(1,1,height,width).getValues():[[]],matrix=old.map(r=>r.slice()),keys=new Map(),used=new Set();const key=r=>name==='roles'?String(r[0]||''):JSON.stringify([r[0]||'',r[1]||'']);old.slice(1).forEach((r,i)=>{if(r[0]){const k=key(r);if(keys.has(k))throw fault_(409,'Duplicate catalogue key in '+name);keys.set(k,i+1);}});matrix[0]=headers.slice();for(const raw of rows){const r=raw.map(safeCell_),k=key(r);if(used.has(k))throw fault_(400,'Duplicate catalogue key');used.add(k);let at=keys.get(k);if(at===undefined){at=matrix.length;matrix.push([]);}matrix[at]=r;}for(const [k,at] of keys)if(!used.has(k))matrix[at]=[];const writes=[];matrix.forEach((r,i)=>{while(r.length<width)r.push('');let start=-1;for(let c=0;c<=width;c++){const dirty=c<width&&String(r[c])!==String(old[i]?.[c]??'');if(dirty&&start<0)start=c;if(!dirty&&start>=0){writes.push({row:i+1,col:start+1,values:r.slice(start,c)});start=-1;}}});return {name,writes};}
function applyDeployCatalogues_(ss,req){const p=req.input||{};if(!Number.isInteger(p.revision)||p.revision<0)throw fault_(400,'Invalid Deploy catalogue revision');const lock=LockService.getScriptLock();if(!contactLock_(lock,8000))throw fault_(503,'Contacts is busy. Retry publication.');try{contactWriterReady_(req);requireDataAdmin_(ss,req.identity);recoverCatalogue_(ss);const props=PropertiesService.getScriptProperties(),prior=Number(props.getProperty('DEPLOY_CATALOGUE_REVISION')||-1);if(p.revision<prior)throw fault_(409,'A newer Deploy catalogue has already been applied.');const digest=digestData_([p.membership||null,p.options||null]);if(p.revision===prior&&props.getProperty('DEPLOY_CATALOGUE_DIGEST')){if(props.getProperty('DEPLOY_CATALOGUE_DIGEST')!==digest)throw fault_(409,'Publication retry payload differs from the committed catalogue.');return {saved:true,duplicate:true,revision:p.revision};}if(p.revision>prior&&props.getProperty('DEPLOY_CATALOGUE_DIGEST')===digest){props.setProperty('DEPLOY_CATALOGUE_REVISION',String(p.revision));return {saved:true,unchanged:true,revision:p.revision};}const fields=['Role Shortform','Formal Role Name',...MEMBERSHIP_FLAGS,'EO Appt Level'];if(p.membership){if(!Array.isArray(p.membership)||p.membership.length>300||p.membership.some(r=>!Array.isArray(r)||r.length!==fields.length||r.some(v=>typeof v!=='string')))throw fault_(400,'Invalid Membership projection');validateDirectory_(deriveContacts_(ss,table_(ss,'contacts'),{headers:fields,rows:p.membership.map(r=>Object.fromEntries(fields.map((k,i)=>[k,r[i]])))}).rows);}if(p.options&&VALIDATED_FIELDS.some(k=>!Array.isArray(p.options[k])||p.options[k].length>150||p.options[k].some(v=>typeof v!=='string'||v.length>120)))throw fault_(400,'Invalid option projection');const blocks=[];if(p.membership)blocks.push(catalogueBlock_(ss,'roles',fields,p.membership));if(p.options)blocks.push(catalogueBlock_(ss,'sys_fields',['Field','Value'],VALIDATED_FIELDS.flatMap(k=>(p.options[k].length?p.options[k]:['']).map(v=>[k,v]))));const tx={commit:Utilities.getUuid(),revision:p.revision,digest,blocks};tx.view=contactViewPack_(contactViewCapture_(ss),tx.commit);const text=JSON.stringify(tx),s=catalogueJournal_(ss),row=s.getLastRow()+1,parts=[];for(let i=0;i<text.length;i+=30000)parts.push([tx.commit,parts.length,text.slice(i,i+30000)]);if(row+parts.length-1>s.getMaxRows())s.insertRowsAfter(s.getMaxRows(),row+parts.length-1-s.getMaxRows());s.getRange(row,1,parts.length,3).setValues(parts);contactFlush_();contactEpoch_();props.setProperty('DEPLOY_CATALOGUE_PENDING',JSON.stringify({row,parts:parts.length,commit:tx.commit}));applyCatalogueTransaction_(ss,tx);return {saved:true,revision:p.revision};}finally{lock.releaseLock();}}

/* GSIS_CONTACTS_CATALOGUE_END */

function writeContactDirtyRow_(sheet,row,values,old,pending,force=[]){const writes=[];let start=-1;for(let col=0;col<=values.length;col++){const dirty=col<values.length&&(force.includes(col)||String(values[col])!==String(old[col]??''));if(dirty&&start<0)start=col;if(!dirty&&start>=0){writes.push({row,col:start+1,values:[values.slice(start,col)]});start=-1;}}if(pending)pending.push(...writes);else GSISSheets.write(null,[{sheet,writes}],true);}

function contactSaveReceipt_(ss,req){
 const p=req.input||{};if(!/^[\w-]{36}$/.test(p.requestId||'')||p.digest!==undefined&&typeof p.digest!=='string'||Object.keys(p).some(k=>!['requestId','digest'].includes(k)))throw fault_(400,'A saved request ID is required.');
 const found=contactPhase_('receipt',()=>contactJournalRow_(ss.getSheetByName('contact_save_journal'),p.requestId,7)),row=found?.values;
 if(!row){const rec=contactJournalRow_(ss.getSheetByName('contact_recalculate_journal'),p.requestId,7);if(!rec)return {saved:false,pending:false,requestId:p.requestId};requireDataAdmin_(ss,req.identity);if(rec.values[1]!==req.identity.email)throw fault_(403,'Receipt belongs to another Admin.');contactRecalculateRead_(ss,rec);return {saved:rec.values[4]==='Applied',pending:rec.values[4]==='Pending',requestId:p.requestId};}
 if(row[1]!==req.identity.email){requireDataAdmin_(ss,req.identity);if(!p.digest)throw fault_(403,'Choose the original request from Recovery.');}
 if(p.digest!==undefined&&p.digest!==row[3])throw fault_(409,'The saved request changed. Reopen Recovery.');savedContactPayload_(row);
 let writing=false;if(row[4]==='Pending'){const lock=LockService.getScriptLock();writing=!lock.tryLock(1);if(!writing)lock.releaseLock();}
 return {saved:row[4]==='Applied',pending:row[4]==='Pending',writing,requestId:p.requestId};
}

// Admin recovery uses the original durable payload; callers cannot replace its values or actor.
function contactRecoveryFault_(){return Object.assign(fault_(503,'A Contacts save is awaiting recovery. Open Contacts and ask a Sys Admin to review and complete the interrupted save.'),{code:'CONTACTS_RECOVERY_REQUIRED'});}
function contactBusyFault_(){return Object.assign(fault_(503,'A Contacts save is still running. Wait briefly, then check the same save.'),{code:'CONTACTS_BUSY'});}
function savedContactPayload_(row){
 let payload;try{payload=JSON.parse(row[6]);}catch(e){throw fault_(409,'The saved request is incomplete. Keep the journal and ask an administrator to inspect it.');}
 if(digestData_(payload)!==row[3]||!['contacts','diy','roster'].includes(row[2])||!Array.isArray(payload)&&(!payload||typeof payload!=='object'||!Array.isArray(payload.changes)||!Array.isArray(payload.additions)))throw fault_(409,'The saved request failed its integrity check. No recovery changes were made.');
 return Array.isArray(payload)?{changes:payload,additions:[]}:payload;
}
function contactRecoveryPointers_(ss){
 const raw=PropertiesService.getScriptProperties().getProperty('CONTACTS_PENDING_V2');
 if(raw!=null)return JSON.parse(raw);
 const pending={};for(const name of ['contact_save_journal','contact_deploy_approvals','contact_recalculate_journal']){const sh=ss.getSheetByName(name);if(!sh||sh.getLastRow()<2)continue;sh.getRange(2,1,sh.getLastRow()-1,5).getValues().forEach((r,i)=>{if(r[4]==='Pending')pending[name+':'+(i+2)]={name,id:r[0],actor:r[1],row:i+2};});}return pending;
}
function contactRecoveryStatus_(ss,identity){
 const user=contactAuthority_(ss,identity);if(!user.roles.includes('Admin'))return {canRecover:false,user,pending:[]};
 const pending=[],names={};
 for(const [key,pointer]of Object.entries(contactRecoveryPointers_(ss))){
  const name=pointer.name||key;if(!['contact_save_journal','contact_deploy_approvals','contact_recalculate_journal'].includes(name))throw fault_(503,'Unknown recovery journal. Ask an administrator to inspect it.');
  const sh=ss.getSheetByName(name),r=sh&&Number.isInteger(pointer.row)&&pointer.row>=2?contactJournalValues_(sh,pointer.row,7):[];
  if(r[0]===pointer.id&&r[4]==='Applied')continue;
  const item={requestId:pointer.id,actor:pointer.actor,at:r[5]||'',recoverable:false};
  if(name==='contact_recalculate_journal'&&r[0]===pointer.id&&r[1]===pointer.actor&&r[4]==='Pending'){try{const plan=contactRecalculateRead_(ss,{row:pointer.row,values:r});Object.assign(item,{digest:r[3],kind:'recalculate',changes:[],additions:[],recoverable:true,message:'Resume Recalculate for '+plan.count+' staff records.'});}catch(e){item.message=e.message;}}
  else if(name!=='contact_save_journal')item.message='This is a Deploy publication. Retry its original publication in Deploy.';
  else if(r[0]!==pointer.id||r[1]!==pointer.actor||r[4]!=='Pending')item.message='The pending marker and saved request do not match. Keep both for administrator review.';
  else try{const payload=savedContactPayload_(r);item.digest=r[3];item.kind=r[2];item.changes=payload.changes;item.additions=payload.additions;item.recoverable=true;}catch(e){item.message=e.message;}
  pending.push(item);
 }
 if(pending.some(x=>x.recoverable&&x.changes.length)){const t=table_(ss,'contacts');for(const r of t.rows)names[r['Staff ID']]=r['Basic Name'];for(const x of pending)if(x.recoverable)x.changes=x.changes.map(c=>({...c,name:names[c.id]||c.id}));}
 return {canRecover:true,user,pending,cataloguePending:!!PropertiesService.getScriptProperties().getProperty('DEPLOY_CATALOGUE_PENDING')};
}
function recoverContactSave_(ss,req){
 const p=req.input||{};if(!/^[\w-]{36}$/.test(p.requestId||'')||typeof p.digest!=='string'||Object.keys(p).some(k=>!['requestId','digest'].includes(k)))throw fault_(400,'Choose a saved request from Recovery.');
 if(contactJournalRow_(ss.getSheetByName('contact_recalculate_journal'),p.requestId,7))return recoverContactRecalculate_(ss,req);
 const lock=LockService.getScriptLock();if(!contactLock_(lock,1000))throw contactBusyFault_();
 try{
  contactReadCache_.clear();requireDataAdmin_(ss,req.identity);
  const sh=ss.getSheetByName('contact_save_journal'),found=contactJournalRow_(sh,p.requestId,7),row=found?.values;
  if(!row||row[3]!==p.digest)throw fault_(409,'The saved request changed. Reopen Recovery before continuing.');
  const payload=savedContactPayload_(row),original={action:row[2]==='roster'?'rosterContactCreate':row[2]==='diy'?'saveDIY':'saveData',identity:{email:row[1]},input:{requestId:p.requestId,...payload}};
  if(row[4]==='Applied'){
   const pointer=JSON.parse(PropertiesService.getScriptProperties().getProperty('CONTACTS_PENDING_V2')||'{}').contact_save_journal;
   if(pointer?.id===p.requestId&&pointer.row===found.row){contactPending_('contact_save_journal',null);contactEpoch_();}
   return {saved:true,duplicate:true,requestId:p.requestId};
  }
  if(row[4]!=='Pending')throw fault_(409,'This journal entry is not recoverable.');
  if(contactTrace_)contactTrace_.journalStarted=true;
  // Initialize a legacy pointer only under the writer lock, and retain all other unresolved work.
  if(PropertiesService.getScriptProperties().getProperty('CONTACTS_PENDING_V2')==null){const pointers=contactRecoveryPointers_(ss),normal={};for(const [key,x]of Object.entries(pointers)){const name=x.name||key;if(normal[name])throw fault_(503,'Multiple pending saves in one journal need administrator review.');normal[name]={id:x.id,actor:x.actor,row:x.row};}PropertiesService.getScriptProperties().setProperty('CONTACTS_PENDING_V2',JSON.stringify(normal));}
  const pointer=JSON.parse(PropertiesService.getScriptProperties().getProperty('CONTACTS_PENDING_V2')||'{}').contact_save_journal;
  if(pointer?.id!==p.requestId||pointer.actor!==row[1]||pointer.row!==found.row)throw fault_(409,'This is not the current pending request. Reopen Recovery.');
  contactWriterReady_(original);
  const headers=sh.getRange(1,8,1,2).getValues()[0],wanted=['Recovery actor','Recovery started'];
  if(headers.some((h,i)=>h&&h!==wanted[i]))throw fault_(409,'Recovery audit columns are already in use. Keep the journal for review.');
  const audit=[{sheet:sh,writes:[{row:1,col:8,values:[wanted]},{row:found.row,col:8,values:[[req.identity.email,new Date().toISOString()]]}]}];
  const result=saveContactDataLocked_(ss,original,row[2]==='diy',req.identity,audit,row[2]==='roster');
  return {saved:result.saved,requestId:p.requestId};
 }finally{lock.releaseLock();}
}
function prepareContactsPerformance411(){return prepareContactsPerformance410();}
function prepareContactsPerformance412(){return prepareContactsPerformance410();}
function prepareContactsPerformance413(){return prepareContactsPerformance410();}

// Upgrade legacy pending checks once under the same lock as all writers.
// The pointer is set before a journal is created and cleared only after Applied is durable.
function ensureContactsReady_(ss,req){
 const props=PropertiesService.getScriptProperties();
 if(props.getProperty('DEPLOY_CATALOGUE_PENDING')){const lock=LockService.getScriptLock();if(!contactLock_(lock,1000))throw fault_(503,'Catalogue publication is finishing. Retry shortly.');try{recoverCatalogue_(ss);}finally{lock.releaseLock();}}
 let raw=props.getProperty('CONTACTS_PENDING_V2');
 if(raw==null){const lock=LockService.getScriptLock();if(!contactLock_(lock,1000))throw fault_(503,'Contacts is busy. Retry shortly.');try{raw=props.getProperty('CONTACTS_PENDING_V2');if(raw==null){const pending={};for(const name of ['contact_save_journal','contact_deploy_approvals','contact_recalculate_journal']){const sh=ss.getSheetByName(name);if(!sh||sh.getLastRow()<2)continue;const rows=sh.getRange(2,1,sh.getLastRow()-1,5).getValues();const found=rows.map((r,i)=>({r,i})).filter(x=>x.r[4]==='Pending');if(found.length>1)throw fault_(503,'Multiple legacy pending saves require recovery before upgrading.');if(found.length){const {r,i}=found[0];pending[name]={id:r[0],actor:r[1],row:i+2};}}raw=JSON.stringify(pending);props.setProperty('CONTACTS_PENDING_V2',raw);}}finally{lock.releaseLock();}}
 for(const [name,pending] of Object.entries(JSON.parse(raw))){const sh=ss.getSheetByName(name),row=sh?sh.getRange(pending.row,1,1,5).getValues()[0]:[];
  // A crash after Applied but before clearing the pointer needs no data replay.
  if(row[0]===pending.id&&row[4]==='Applied'){const lock=LockService.getScriptLock();if(!contactLock_(lock,1000))throw fault_(503,'Contacts save is finishing. Retry shortly.');try{const current=JSON.parse(props.getProperty('CONTACTS_PENDING_V2')||'{}')[name];if(current?.id===pending.id)contactPending_(name,null);}finally{lock.releaseLock();}continue;}
  if(!(pending.id===req.input?.requestId&&pending.actor===req.identity.email&&['saveData','saveDIY','saveReceipt','approveDeployTeachers','recalculateData','rosterContactCreate'].includes(req.action)))throw contactRecoveryFault_();
 }
}

function contactWriterReady_(req){contactReadCache_.clear();contactPrefetchedValues_.clear();const p=PropertiesService.getScriptProperties(),pending=JSON.parse(p.getProperty('CONTACTS_PENDING_V2')||'{}');if(p.getProperty('DEPLOY_CATALOGUE_PENDING')&&req.action!=='applyDeployCatalogues')throw fault_(503,'Catalogue publication needs recovery. Retry shortly.');for(const value of Object.values(pending))if(value.id!==req.input?.requestId||value.actor!==req.identity.email)throw contactRecoveryFault_();}

var contactTrace_=null;
function contactPhase_(name,fn){const start=Date.now();try{return fn();}catch(e){if(contactTrace_&&!contactTrace_.failedPhase)contactTrace_.failedPhase=name;throw e;}finally{if(contactTrace_){const p=contactTrace_.phases[name]||(contactTrace_.phases[name]={ms:0,calls:0});p.ms+=Date.now()-start;p.calls++;}}}
function contactErrorCategory_(err){const text=String(err?.message||'');return /protect|protected cell/i.test(text)?'protected-range':/permission|forbidden|access denied|not have access/i.test(text)?'permission':/quota|too many|rate limit/i.test(text)?'quota':/timed? ?out|deadline|timeout/i.test(text)?'timeout':/unavailable|internal error|service error/i.test(text)?'service':err?.status?'validation':'unknown';}
function contactFailure_(err){
 const requestId=/^[\w-]{36}$/.test(contactTrace_?.requestId||'')?contactTrace_.requestId:'unavailable',phase=contactTrace_?.failedPhase||'request',status=err.status||503;
 const category=contactErrorCategory_(err),reference={version:'0.9.9',requestId,phase,category,operation:contactTrace_?.action||'editor',serviceMode:GSISSheets.enabled()?'sheets-api':'native'};
 // Never log contact values, payloads, exception messages, credentials or stacks.
 console.error(JSON.stringify({event:'gsis-contacts-error',status,...reference,errorType:['TypeError','ReferenceError','RangeError','SyntaxError'].includes(err.name)?err.name:'Error'}));
 return {ok:false,status,...(['GSIS_SECRET_INVALID','CONTACTS_RECOVERY_REQUIRED','CONTACTS_BUSY','VENUES_SOURCE_SETUP','VENUES_SOURCE_AUTH','VENUES_SOURCE_INPUT','VENUES_SOURCE_CHANGED','VENUES_SOURCE_INVALID','VENUES_SOURCE_PENDING','VENUES_FENCE_PENDING','SOURCE_UNAUTHORIZED','SOURCE_UNAVAILABLE','SOURCE_REQUEST_INVALID','SOURCE_CHANGED','SOURCE_INVALID'].includes(err.code)?{code:err.code}:{}),error:(err.status?err.message:category==='protected-range'?'The executing Apps Script account cannot edit a required range. Ask the script maintainer to run inspectContactsWriteAccess504().':category==='permission'?'The executing Apps Script account lacks spreadsheet access.':'The school service could not complete this request.')+' [v0.9.7 · '+phase+' · '+requestId+']',reference,draftEditable:!!err.status&&([400,409].includes(status)||err.code==='CONTACTS_RECOVERY_REQUIRED')&&!contactTrace_?.journalStarted};
}
function contactFlush_(){return contactPhase_('flush',()=>SpreadsheetApp.flush());}
function contactLock_(lock,ms){return contactPhase_('lockWait',()=>lock.tryLock(ms));}
const contactMeasured_={read:readContactTable_,journal:saveJournal_,write:writeContactDirtyRow_,validate:validateDirectory_,derive:deriveContacts_,recovery:ensureContactsReady_};
readContactTable_=function(...a){return contactPhase_('read',()=>contactMeasured_.read(...a));};
saveJournal_=function(...a){return contactPhase_('journal',()=>contactMeasured_.journal(...a));};
writeContactDirtyRow_=function(...a){return contactPhase_('write',()=>contactMeasured_.write(...a));};
deriveContacts_=function(...a){return contactPhase_('derive',()=>contactMeasured_.derive(...a));};
validateDirectory_=function(...a){return contactPhase_('validate',()=>contactMeasured_.validate(...a));};
ensureContactsReady_=function(...a){return contactPhase_('recovery',()=>contactMeasured_.recovery(...a));};

function prepareContactsPerformance404(){ensureContactsReady_(SpreadsheetApp.openById(GSIS_SHEET),{action:'maintenance',identity:{email:''},input:{}});return {ready:true,version:'0.9.9'};}

// Read-only editor check; does not migrate or clear any data.
function prepareSheetsAPI414(){return GSISSheets.check(SpreadsheetApp.openById(GSIS_SHEET).getSheetByName('contacts'));}

function prepareContactsPerformance414(){return prepareContactsPerformance410();}

// Editor checks do not need a clear pending journal or a formula migration.
function prepareContactsPerformance502(){
 const ss=SpreadsheetApp.openById(GSIS_SHEET);if(!GSISSheets.enabled())throw Error('Enable Google Sheets API v4 under Apps Script Services.');
 const sheet=ss.getSheetByName('contacts');if(!sheet)throw Error('Missing contacts sheet');
 GSISSheets.readAcross(ss,[{sheet,row:1,col:1,height:1,width:Math.max(1,sheet.getLastColumn())}],true,{flush:false});
 return {ready:true,version:'0.9.9',pending:Object.keys(contactRecoveryPointers_(ss)).length,mode:'batched Contacts values; original-request recovery'};
}
// An editor-run alternative to the Recovery button. The executing account must
// be a current Contacts Admin; the helper cannot replace or discard the payload.
function recoverContactsSave502(){
 const ss=SpreadsheetApp.openById(GSIS_SHEET),email=String(Session.getEffectiveUser().getEmail()||'').toLowerCase(),identity={email,subject:'editor'};
 if(!/^[^@\s]+@gsps\.edu\.sg$/.test(email))throw fault_(403,'Run this helper as a school Contacts Admin.');
 const priorCache=contactCacheEnabled_,priorRead=contactReadOnly_;contactCacheEnabled_=true;contactReadOnly_=true;contactReadCache_.clear();contactPrefetchedValues_.clear();
 try{
  requireDataAdmin_(ss,identity);const status=contactRecoveryStatus_(ss,identity);if(!status.pending.length)return {saved:true,unchanged:true};
  if(status.pending.length!==1||!status.pending[0].recoverable)throw fault_(409,'Choose and review the saved request in Contacts Recovery.');
  const entry=status.pending[0];return recoverContactSave_(ss,{identity,input:{requestId:entry.requestId,digest:entry.digest}});
 }finally{contactCacheEnabled_=priorCache;contactReadOnly_=priorRead;contactReadCache_.clear();contactPrefetchedValues_.clear();}
}

/* GSIS_SIGNATURE_BEGIN */
/* Signature designation rules are shared by browser rendering and Admin settings validation. */
var GSISSignature=(function(){
 const SUBJECTS=[['Art','Art'],['CL','Chinese Language'],['TL','Tamil Language'],['ML','Malay Language'],['SS','Social Studies'],['Sci','Science'],['Music','Music'],['EL','English Language'],['Math','Mathematics'],['PHE','Physical Education']];
 const canonical=s=>({PE:'PHE',MA:'Math',Mathematics:'Math',Science:'Sci'}[s]||s);
 const defaults=()=>SUBJECTS.map(x=>x[0]);
 function validate(selected){if(!Array.isArray(selected)||selected.length>SUBJECTS.length||selected.some(x=>!SUBJECTS.some(([code])=>code===x))||new Set(selected).size!==selected.length)throw Error('Choose signature subjects from the available list.');return selected.slice();}
 function designation(person,settings,published){
  const formal=String(person.formalRole||'').trim();
  if(formal&&!/^Teacher(?:\b|\()/i.test(formal))return formal;
  if(!published)return 'Teacher';
  const selected=new Set(settings?.subjects||defaults()),codes=new Set((person.teachingAssignments||[]).map(a=>canonical(a.subject)));
  const names=SUBJECTS.filter(([code])=>selected.has(code)&&codes.has(code)).map(([,name])=>name).sort((a,b)=>a.localeCompare(b,'en'));
  if(!names.length)return 'Teacher';
  const text=names.length===1?names[0]:names.slice(0,-1).join(', ')+' & '+names.at(-1);
  return 'Teacher ('+text+')';
 }
 function self(people,email){const matches=(people||[]).filter(p=>String(p.emails?.gsps||'').toLowerCase()===String(email||'').toLowerCase());if(matches.length!==1)throw Error('Your school email must match exactly one contact record. Ask an Admin to check it.');if(!String(matches[0].statutoryName||'').trim())throw Error('Add your Statutory Name in DIY update before downloading a signature.');return matches[0];}
 function fit(ctx,text,weight,size,width){let n=size;ctx.font=weight+' '+n+'px "GSIS Outfit"';while(ctx.measureText(text).width>width&&n>1){n-=0.25;ctx.font=weight+' '+n+'px "GSIS Outfit"';}return n;}
 let assets=null;
 function loadAssets(){if(assets)return assets;assets=(async()=>{
  const regular=new FontFace('GSIS Outfit','url("signature-assets/Outfit-Regular.ttf")',{weight:'400'}),bold=new FontFace('GSIS Outfit','url("signature-assets/Outfit-Bold.ttf")',{weight:'700'});
  await Promise.all([regular.load(),bold.load()]);document.fonts.add(regular);document.fonts.add(bold);
  const base=new Image();base.src='signature-assets/template.png?v=0.5.0';await base.decode();return base;
 })().catch(e=>{assets=null;throw Error('Signature artwork or Outfit fonts could not load. Retry the preview.');});return assets;}
 async function render(canvas,person,settings,published){const name=String(person.statutoryName||'');if(!name.trim())throw Error('Statutory Name is required.');const title=designation(person,settings,published),base=await loadAssets();canvas.width=base.naturalWidth;canvas.height=base.naturalHeight;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Your browser cannot render a signature.');
  // Copy the supplied final-size artwork pixel for pixel. Draw only the personal text.
  ctx.drawImage(base,0,0);const scale=canvas.width/900;ctx.textBaseline='alphabetic';ctx.fillStyle='#0A2A49';const x=148*scale,width=736*scale,nameSize=fit(ctx,name,'700',28*scale,width);ctx.fillText(name,x,35*scale);ctx.fillStyle='#000000';const designationSize=fit(ctx,title,'400',22*scale,width);ctx.fillText(title,x,61*scale);return {name,designation:title,width:canvas.width,height:canvas.height,nameSize,designationSize};}
 async function png(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG export failed. Retry the preview.')),'image/png'));}
 return {SUBJECTS,defaults,canonical,validate,designation,self,fit,render,png};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISSignature;

/* GSIS_SIGNATURE_END */

function signatureSettings_(){const raw=PropertiesService.getScriptProperties().getProperty('SIGNATURE_SETTINGS_415');if(!raw)return {subjects:GSISSignature.defaults(),revision:0};const value=JSON.parse(raw);return {subjects:GSISSignature.validate(value.subjects),revision:value.revision};}
function saveSignatureSettings_(ss,req){
 requireDataAdmin_(ss,req.identity);const p=req.input||{};let subjects;try{subjects=GSISSignature.validate(p.subjects);}catch(e){throw fault_(400,e.message);}if(!Number.isInteger(p.expectedRevision)||p.expectedRevision<0)throw fault_(400,'Signature settings revision required.');
 const lock=LockService.getScriptLock();if(!contactLock_(lock,1000))throw fault_(503,'Another update is running. Retry the same selection.');
 try{contactWriterReady_(req);requireDataAdmin_(ss,req.identity);const current=signatureSettings_(),same=JSON.stringify(current.subjects.slice().sort())===JSON.stringify(subjects.slice().sort());if(same)return {...current,saved:true,duplicate:true};if(p.expectedRevision!==current.revision)throw fault_(409,'Signature settings changed. Refresh before saving.');const next={subjects,revision:current.revision+1};PropertiesService.getScriptProperties().setProperty('SIGNATURE_SETTINGS_415',JSON.stringify(next));return {...next,saved:true};}finally{lock.releaseLock();}
}

/* GSIS_CONTACTS_CURRENT_BEGIN */
/* Contacts-owned current assignment data; no named deployment versions. */
var GSISContactsCurrent=(function(){
 'use strict';
 const sheetName='contacts_current_deployment',schema=1;
 const kinds=['dept','comm','cca','plt','events'];
 function validate(data){
  const text=(x,n)=>typeof x==='string'&&x.length>0&&x.length<=n;
  if(!data||data.source!=='contacts-current'||!Number.isInteger(data.sourceYear)||data.sourceYear<2000||data.sourceYear>2100||!Number.isInteger(data.revision)||data.revision<1)throw Error('Invalid current Contacts metadata');
  if(!Array.isArray(data.subjectHeaders)||data.subjectHeaders.length>100||data.subjectHeaders.some(x=>!text(x,80))||new Set(data.subjectHeaders).size!==data.subjectHeaders.length)throw Error('Invalid current Contacts subjects');
  if(!Array.isArray(data.assignments)||data.assignments.length>10000)throw Error('Invalid current Contacts assignments');
  const ids=new Set();
  for(const a of data.assignments){
   if(!a||!text(a.id,100)||ids.has(a.id)||!text(a.staffId,100)||!/^P?[1-6]$/.test(String(a.level))||!data.subjectHeaders.includes(a.subject)||!text(a.groupName,160)||!text(a.target,100))throw Error('Invalid current Contacts assignment');
   ids.add(a.id);
   if(Object.prototype.hasOwnProperty.call(a,'periods'))throw Error('Current Contacts assignments must not guess period counts');
  }
  if(!data.organisations||typeof data.organisations!=='object'||Array.isArray(data.organisations))throw Error('Invalid current Contacts organisations');
  for(const kind of kinds){
   const groups=data.organisations[kind],used=new Set();
   if(!Array.isArray(groups)||groups.length>200)throw Error('Invalid current Contacts group list');
   for(const g of groups){
    if(!g||!text(g.id,100)||used.has(g.id)||!text(g.name,160)||!Array.isArray(g.slots)||g.slots.length>300||g.slots.some(x=>!text(x,100))||new Set(g.slots).size!==g.slots.length)throw Error('Invalid current Contacts membership');
    used.add(g.id);
   }
  }
  if(!Array.isArray(data.classes)||data.classes.length>200||data.classes.some(c=>!c||!/^P?[1-6]$/.test(String(c.level))||!text(c.name,160)||!text(c.shortName,80)))throw Error('Invalid current Contacts classes');
  if(!Array.isArray(data.duties)||data.duties.length>1000)throw Error('Invalid current Contacts duties');
  for(const d of data.duties){
   if(!d||!text(d.staffId,100)||!['Mon','Tue','Wed','Thu','Fri'].includes(d.day)||!text(d.duty,120)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.end)||d.start>=d.end)throw Error('Invalid current Contacts duty');
  }
  for(const key of ['people','teachers','profiles','loads','workloads','mobile','statutoryName'])if(Object.prototype.hasOwnProperty.call(data,key))throw Error('Current assignment feed must not overwrite staff details or invent workloads');
  return data;
 }
 function decode(marker,rows,sha256){
  if(!Array.isArray(marker)||marker[0]!=='current'||typeof marker[1]!=='string')throw Error('Missing current Contacts marker');
  const manifest=JSON.parse(marker[1]);
  if(manifest.schema!==schema||!Number.isInteger(manifest.parts)||manifest.parts<1||manifest.parts>100||!Number.isInteger(manifest.revision)||manifest.revision<1||!/^[a-f0-9]{64}$/.test(manifest.sha256)||rows.length!==manifest.parts)throw Error('Invalid current Contacts manifest');
  if(rows.some((r,i)=>r[0]!=='part:'+i||typeof r[1]!=='string'||r[1].length>30000))throw Error('Incomplete current Contacts data');
  const raw=rows.map(r=>r[1]).join('');if(sha256(raw)!==manifest.sha256)throw Error('Current Contacts data changed or is incomplete');
  const data=validate(JSON.parse(raw));
  if(data.sourceYear!==manifest.sourceYear||data.revision!==manifest.revision)throw Error('Current Contacts marker does not match data');
  return data;
 }
 return {sheetName,schema,validate,decode};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISContactsCurrent;

function currentContactsDeployment_(ss){
 const sheet=ss.getSheetByName(GSISContactsCurrent.sheetName);if(!sheet)return null;
 try{
  const header=GSISSheets.readAcross(ss,[{sheet,row:1,col:1,height:2,width:2}],false,{flush:false})[0];
  if(header[0][0]!=='Key'||header[0][1]!=='JSON')throw Error('Invalid current Contacts headers');
  const manifest=JSON.parse(header[1][1]);
  if(manifest.schema!==GSISContactsCurrent.schema||!Number.isInteger(manifest.parts)||manifest.parts<1||manifest.parts>100||manifest.parts+2>sheet.getMaxRows())throw Error('Invalid current Contacts manifest');
  const rows=GSISSheets.readAcross(ss,[{sheet,row:3,col:1,height:manifest.parts,width:2}],false,{flush:false})[0];
  const data=GSISContactsCurrent.decode(header[1],rows,raw=>Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join(''));
  const after=GSISSheets.readAcross(ss,[{sheet,row:2,col:1,height:1,width:2}],false,{flush:false})[0][0];
  if(after[0]!==header[1][0]||after[1]!==header[1][1])throw Error('Current Contacts data changed while reading');
  return {available:true,...data};
 }catch(e){
  // A configured current roster is authoritative. Never replace 2026 data
  // with an unrelated published Deploy record after a partial/failed read.
  return {available:false,source:'contacts-current',error:'Current Contacts assignment information could not be loaded. Retry teaching information.'};
 }
}

function verifyCurrentContactsDeployment(){
 const current=currentContactsDeployment_(SpreadsheetApp.openById(GSIS_SHEET));
 if(!current||!current.available)throw new Error(current?.error||'Current Contacts data is not installed');
 return {ready:true,source:current.source,year:current.sourceYear,revision:current.revision,
  classes:current.classes.length,assignments:current.assignments.length,
  organisations:Object.fromEntries(Object.entries(current.organisations).map(([k,groups])=>[k,groups.length])),duties:current.duties.length};
}

/* GSIS_CONTACTS_CURRENT_END */

/* GSIS_CONTACTS_VIEW_BEGIN */
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

/* GSIS_CONTACTS_VIEW_END */

function prepareContactsPerformance503(){return prepareContactsPerformance502();}
function recoverContactsSave503(){return recoverContactsSave502();}

/* GSIS_CONTACTS_COMMIT_BEGIN */
// Prepare every range and all metadata before a Contacts journal becomes durable.
// A prepared stage may be attempted once. Recovery prepares a new stage from the
// same saved request; an API exception never triggers a native fallback or retry.
function contactPrepareValues_(ss, blocks) {
  const fail = message => { const error = new Error(message); error.status = 400; throw error; };
  if (!Array.isArray(blocks)) fail('Invalid Contacts write plan.');
  const apiValues = typeof Sheets !== 'undefined' && Sheets.Spreadsheets && Sheets.Spreadsheets.Values;
  const entries = [], names = new Map();
  const column = value => { let text = ''; for (; value; value = Math.floor((value - 1) / 26)) text = String.fromCharCode(65 + (value - 1) % 26) + text; return text; };
  for (const block of blocks) {
    if (!block || !block.sheet || !Array.isArray(block.writes)) fail('Invalid Contacts write plan.');
    for (const write of block.writes) {
      if (!write || !Array.isArray(write.values)) fail('Invalid Contacts write values.');
      if (!write.values.length) continue;
      if (!Number.isInteger(write.row) || write.row < 1 || !Number.isInteger(write.col) || write.col < 1 || !Array.isArray(write.values[0]) || !write.values[0].length) fail('Invalid Contacts write range.');
      const width = write.values[0].length;
      const values = write.values.map(row => {
        if (!Array.isArray(row) || row.length !== width) fail('Contacts write values must form a rectangle.');
        return row.map(value => {
          if (value !== null && typeof value !== 'string' && typeof value !== 'boolean' && !(typeof value === 'number' && Number.isFinite(value))) fail('Invalid Contacts cell value.');
          return value;
        });
      });
      if (!names.has(block.sheet)) names.set(block.sheet, block.sheet.getName());
      const range = "'" + names.get(block.sheet).replace(/'/g, "''") + "'!" + column(write.col) + write.row + ':' + column(write.col + width - 1) + (write.row + values.length - 1);
      entries.push({sheet: block.sheet, row: write.row, col: write.col, values, range});
    }
  }
  const data = entries.map(entry => ({range: entry.range, majorDimension: 'ROWS', values: entry.values.map(row => row.map(value => typeof value === 'string' && /^'[=+@-]/.test(value) ? value.slice(1) : value))}));
  const request = {valueInputOption: 'RAW', includeValuesInResponse: false, data};
  // JSON UTF-16 length times three is a conservative UTF-8 upper bound,
  // including surrogate pairs. Refuse the entire stage before any write.
  const bytes = JSON.stringify(request).length * 3;
  if (bytes > 2000000) fail('This Contacts save is too large. Save fewer changes at once.');
  const spreadsheetId = entries.length ? (ss || entries[0].sheet.getParent()).getId() : null;
  const native = apiValues ? [] : entries.map(entry => ({range: entry.sheet.getRange(entry.row, entry.col, entry.values.length, entry.values[0].length), values: entry.values}));
  let attempted = false;
  return {
    mode: apiValues ? 'sheets-api' : 'native', rangeCount: entries.length, bytes,
    flush() {
      if (attempted) throw new Error('This prepared Contacts write has already been attempted. Check its saved request before retrying.');
      attempted = true;
      if (!entries.length) return;
      if(typeof contactTrace_!=='undefined'&&contactTrace_){contactTrace_.preparedIO=contactTrace_.preparedIO||{requests:0,ranges:0,bytesUpperBound:0};contactTrace_.preparedIO.requests++;contactTrace_.preparedIO.ranges+=entries.length;contactTrace_.preparedIO.bytesUpperBound+=bytes;}
      if (apiValues) return apiValues.batchUpdate(request, spreadsheetId);
      for (const entry of native) entry.range.setValues(entry.values);
      SpreadsheetApp.flush();
    }
  };
}
/* GSIS_CONTACTS_COMMIT_END */

/* GSIS_CONTACTS_DIAGNOSTICS_BEGIN */
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

/* GSIS_CONTACTS_DIAGNOSTICS_END */

/* GSIS_CONTACTS_RECALCULATE_BEGIN */
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

/* GSIS_CONTACTS_RECALCULATE_END */

/* GSIS_CONTACTS_BIRTHDAYS_BEGIN */
/** Minimal fresh source for the Calendar birthday integration. The caller is
 * already signed by the trusted bridge; access remains live and never cached. */
function calendarContactBirthdays_(ss,req) {
  requireStaffView_(ss,req.identity);
  if(contactViewStatus_?.pending)throw fault_(503,'Contacts changes are pending. Retry the birthday update after they finish.');
  const raw=deriveContacts_(ss,table_(ss,'contacts'));
  required_(raw,['Staff ID','TTb Name','Active','MK Modifier','Day of Birth','Month of birth']);
  const people=[],seen=new Set();
  for(const row of raw.rows) {
    if(!raw.headers.some(k=>String(row[k]||'').trim()))continue;
    const id=String(row['Staff ID']||'').trim();
    if(!id||seen.has(id))throw fault_(503,'A Contacts Staff ID is missing or duplicated. No birthday source was supplied.');
    seen.add(id);
    people.push({id:id,name:String(row['TTb Name']||'').trim(),active:String(row.Active||'').trim(),mk:String(row['MK Modifier']||'').trim(),day:String(row['Day of Birth']||'').trim(),month:String(row['Month of birth']||'').trim()});
  }
  return {schema:1,complete:true,authoritative:true,revision:digestData_(people),observedAt:Date.now(),count:people.length,people:people};
}

/* GSIS_CONTACTS_BIRTHDAYS_END */

/* GSIS_LORD_SOURCE_BRIDGE_BEGIN */
// Separate read-only service boundary; no school-user identity or role delegation.
function lordSourceError_(status,code,message){throw Object.assign(Error(message),{status,code});}
function lordSourceHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value)).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function lordSourceAuthenticate_(envelope,source){
 const fail=()=>lordSourceError_(401,'SOURCE_UNAUTHORIZED','Invalid LORD reference service request.');
 if(!envelope||typeof envelope.payload!=='string'||envelope.payload.length>6000||typeof envelope.signature!=='string'||!/^[a-f0-9]{64}$/.test(envelope.signature)||Object.keys(envelope).some(k=>!['payload','signature'].includes(k)))fail();
 const secret=gsisApiSecret_('LORD_BRIDGE_SECRET');if(!secret||secret.length<32)lordSourceError_(503,'SOURCE_UNAVAILABLE','Configure the LORD reference service connection.');
 const signature=Utilities.computeHmacSha256Signature(envelope.payload,secret).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');let mismatch=0;for(let i=0;i<64;i++)mismatch|=signature.charCodeAt(i)^envelope.signature.charCodeAt(i);if(mismatch)fail();
 let req;try{req=JSON.parse(envelope.payload);}catch(_){fail();}
 if(!req||req.action!=='lordService'||req.service!=='gsis-lord-v1'||req.source!==source||Object.keys(req).some(k=>!['action','service','source','timestamp','nonce','input'].includes(k))||!Number.isFinite(req.timestamp)||Math.abs(Date.now()-req.timestamp)>60000||!/^[-\w]{36}$/.test(req.nonce||''))fail();
 const p=req.input;if(!p||typeof p!=='object'||Array.isArray(p)||!['manifest','snapshot'].includes(p.operation)||Object.keys(p).some(k=>!['operation','knownKey','expectedKey'].includes(k))||['knownKey','expectedKey'].some(k=>p[k]!==undefined&&(typeof p[k]!=='string'||!/^[a-f0-9]{64}$/.test(p[k]))))lordSourceError_(400,'SOURCE_REQUEST_INVALID','Choose a supported LORD reference read.');
 return p;
}
function lordSourceResult_(source,key,input,value,updatedAt){
 if(input.expectedKey!==undefined&&input.expectedKey!==key)lordSourceError_(409,'SOURCE_CHANGED','Reference data changed. Check its manifest again.');
 const meta={schema:1,source,key,authoritative:true,observedAt:new Date().toISOString(),...(updatedAt?{updatedAt}:{})};
 return input.operation==='manifest'&&input.knownKey===key?{...meta,unchanged:true}:{...meta,...value};
}

/* GSIS_LORD_SOURCE_BRIDGE_END */

/* GSIS_LORD_CONTACTS_SOURCE_BEGIN */
// Fresh minimal projection: direct Sheet edits are detected without trusting an epoch alone.
function lordContactsMarker_(){
 const properties=PropertiesService.getScriptProperties(),all=typeof properties.getProperties==='function'?properties.getProperties():null,value=key=>all?(all[key]||''):(properties.getProperty(key)||'');
 let pending;try{pending=JSON.parse(value('CONTACTS_PENDING_V2')||'{}');}catch(_){lordSourceError_(503,'SOURCE_UNAVAILABLE','Contacts save status needs review.');}
 if(!pending||typeof pending!=='object'||Array.isArray(pending)||Object.keys(pending).length||value('DEPLOY_CATALOGUE_PENDING'))lordSourceError_(503,'SOURCE_UNAVAILABLE','Contacts changes are pending. Retry after the save completes.');
 return JSON.stringify(['CONTACTS_DATA_EPOCH','DEPLOY_READ_EPOCH','CONTACTS_PENDING_V2','DEPLOY_CATALOGUE_PENDING'].map(value));
}
function lordContactsService_(envelope){
 return lordContactsSnapshot_(lordSourceAuthenticate_(envelope,'contacts'));
}
function lordContactsSnapshot_(input){
 const before=lordContactsMarker_(),ss=SpreadsheetApp.openById(GSIS_SHEET),names=['contacts','roles'];
 const values=GSISSheets.readTables(ss,names,true),tables=values.map(rows=>({headers:rows[0],rows:rows.slice(1).map((row,i)=>Object.fromEntries([['_row',i+2],...rows[0].map((key,j)=>[key,row[j]||''])]))}));
 required_(tables[0],['Staff ID','Basic Name','TTb Name','Active','Role','Employment Modifier','Subject Modifier','MK Modifier','EO Appt Level','GSPS Alias (@gsps.edu.sg)','CES Alias (@schools.gov.sg)','Statutory Name','Mobile No']);
 const records=deriveContacts_(ss,tables[0],tables[1]).rows,ids=new Set(),ttbNames=new Set(),emails=new Set();
 const address=(raw,domain)=>{const value=String(raw||'').trim().toLowerCase();if(!value)return '';const email=value.includes('@')?value:value+'@'+domain;if(!/^[a-z0-9._%+-]+@[^@\s]+$/.test(email)||email.split('@')[1]!==domain)lordSourceError_(503,'SOURCE_INVALID','A Contacts email needs review.');return email;};
 const people=[];for(const row of records){
  if(!Object.keys(row).some(k=>k!=='_row'&&String(row[k]||'').trim()))continue;
  const id=String(row['Staff ID']||'').trim(),name=String(row['TTb Name']||'').trim(),nameKey=name.normalize('NFKC').replace(/\s+/g,' ').toLowerCase(),mobile=String(row['Mobile No']||'').replace(/\s/g,''),email=address(row['GSPS Alias (@gsps.edu.sg)'],'gsps.edu.sg'),cesEmail=address(row['CES Alias (@schools.gov.sg)'],'schools.gov.sg');
  if(!id||id.length>100||ids.has(id)||!name||name.length>240||ttbNames.has(nameKey)||!['Y','N'].includes(row.Active)||mobile&&!/^\d{8}$/.test(mobile)||[email,cesEmail].some(value=>value&&emails.has(value)))lordSourceError_(503,'SOURCE_INVALID','Contacts has a missing or duplicated staff identity, or invalid contact details. Review the directory.');
  ids.add(id);ttbNames.add(nameKey);for(const value of [email,cesEmail])if(value)emails.add(value);
  people.push({id,name,active:row.Active==='Y',email,cesEmail,statutoryName:String(row['Statutory Name']||'').trim(),mobile});
 }
 people.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 if(before!==lordContactsMarker_())lordSourceError_(409,'SOURCE_CHANGED','Contacts changed while reading. Retry the reference sync.');
 return lordSourceResult_('contacts',lordSourceHash_(['lord-contacts-v1',people]),input,{people});
}

/* GSIS_LORD_CONTACTS_SOURCE_END */

/* GSIS_VENUES_SOURCE_BRIDGE_BEGIN */
// A separate read-only service credential; never delegates a school-user role.
function venuesSourceError_(status,code,message){throw Object.assign(Error(message),{status,code});}
function venuesSourceHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value)).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function venuesSourceAuthenticate_(envelope,source){
 const deny=()=>venuesSourceError_(401,'VENUES_SOURCE_AUTH','Invalid Venues source request.');
 if(!envelope||typeof envelope.payload!=='string'||envelope.payload.length>120000||typeof envelope.signature!=='string'||!/^[a-f0-9]{64}$/.test(envelope.signature)||Object.keys(envelope).some(k=>!['payload','signature'].includes(k)))deny();
 const secret=gsisApiSecret_('VENUES_BRIDGE_SECRET');if(!secret||secret.length<32)venuesSourceError_(503,'VENUES_SOURCE_SETUP','Configure VENUES_BRIDGE_SECRET for the Venues source service.');
 const signature=Utilities.computeHmacSha256Signature(envelope.payload,secret).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');let diff=0;for(let i=0;i<64;i++)diff|=signature.charCodeAt(i)^envelope.signature.charCodeAt(i);if(diff)deny();
 let request;try{request=JSON.parse(envelope.payload);}catch(_){deny();}
 if(!request||request.action!=='venuesSource'||request.service!=='gsis-venues-v1'||request.source!==source||Object.keys(request).some(k=>!['action','service','source','timestamp','nonce','input'].includes(k))||!Number.isFinite(request.timestamp)||Math.abs(Date.now()-request.timestamp)>60000||!/^[-\w]{36}$/.test(request.nonce||''))deny();
 const input=request.input;if(!input||typeof input!=='object'||Array.isArray(input))venuesSourceError_(400,'VENUES_SOURCE_INPUT','Choose a valid source read.');return input;
}
function venuesSourceReadInput_(input,extra=[]){
 if(!['manifest','snapshot'].includes(input.operation)||Object.keys(input).some(k=>!['operation','knownKey','expectedKey',...extra].includes(k))||['knownKey','expectedKey'].some(k=>input[k]!==undefined&&(typeof input[k]!=='string'||input[k].length>200)))venuesSourceError_(400,'VENUES_SOURCE_INPUT','Choose a supported source read.');return input;
}
function venuesSourceResult_(source,key,input,value,updatedAt){
 if(input.expectedKey!==undefined&&input.expectedKey!==key)venuesSourceError_(409,'VENUES_SOURCE_CHANGED','The source changed. Refresh before trying again.');
 const result={schema:1,source,key,authoritative:true,observedAt:new Date().toISOString(),...(updatedAt?{updatedAt}:{})};
 return input.operation==='manifest'&&input.knownKey===key?{...result,unchanged:true}:{...result,...value};
}

/* GSIS_VENUES_SOURCE_BRIDGE_END */

/* GSIS_VENUES_CONTACTS_SOURCE_BEGIN */
function venuesContactsSource_(envelope){
 const input=venuesSourceReadInput_(venuesSourceAuthenticate_(envelope,'contacts'));
 const snapshot=lordContactsSnapshot_({operation:'snapshot'});
 return venuesSourceResult_('contacts',snapshot.key,input,{people:snapshot.people.map(({id,name,active,email,cesEmail,mobile})=>({id,name,active,email,cesEmail,mobile}))});
}

/* GSIS_VENUES_CONTACTS_SOURCE_END */

/* GSIS_API_SECRET_BEGIN */
// Server-to-server transport only. Session keys, private links and provider credentials stay separate.
function gsisApiSecret_(legacyName){
 const properties=PropertiesService.getScriptProperties(),value=properties.getProperty('GSIS_SECRET');
 if(value!==null&&value!==undefined){
  if(typeof value!=='string'||! /^[!-~]{32,8000}$/.test(value))throw Object.assign(Error('GSIS_SECRET must contain 32 to 8000 printable ASCII characters without spaces.'),{status:503,code:'GSIS_SECRET_INVALID'});
  return value;
 }
 return properties.getProperty(legacyName)||'';
}

/* GSIS_API_SECRET_END */
