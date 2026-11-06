/* Dedicated output files only. This service never opens the frozen Roster state
 * and never takes its ScriptLock. The caller is the signed Worker service. */
function rosterDriveOutputFail_(message,status=409){throw Object.assign(Error(message),{status,code:'ROSTER_DRIVE_OUTPUT'});}
function rosterDriveOutputError_(error){
 const message=String(error?.message||'Drive output failed.')
  .replace(/https?:\/\/[^\s<>"']+/gi,'[URL removed]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[credential removed]')
  .replace(/\b(?:Bearer|Basic)\s+\S+/gi,'[credential removed]')
  .replace(/\b(?:[\w-]*(?:token|secret|password|authorization|signature|nonce|capability)|api[_-]?key)\s*["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'[credential removed]')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email removed]')
  .replace(/[A-Za-z0-9_+/=-]{32,}/g,'[identifier removed]')
  .split(/[\r\n]/,1)[0].replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim().slice(0,300);
 return Object.assign(Error(message),{status:error?.status||503,code:/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code||'')?error.code:'ROSTER_DRIVE_OUTPUT',googleCode:error?.googleCode});
}
function rosterDriveOutputId_(value){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(value))rosterDriveOutputFail_('Invalid output file or folder ID.',400);return value;}
function rosterDriveOutputFetch_(url,options={}){
 gsisRequireBackendRole_('roster');
 if(!/^https:\/\/(?:www\.googleapis\.com\/(?:upload\/)?drive\/v3\/files|sheets\.googleapis\.com\/v4\/spreadsheets)(?:[/?]|$)/.test(url))rosterDriveOutputFail_('Invalid output provider.');
 const response=UrlFetchApp.fetch(url,{...options,headers:{...(options.headers||{}),Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true,followRedirects:false});
 if(response.getResponseCode()<200||response.getResponseCode()>=300){
  let detail;try{detail=JSON.parse(response.getContentText())?.error;}catch(ignore){}
  throw rosterDriveOutputError_({message:'Drive output failed (HTTP '+response.getResponseCode()+').'+(typeof detail?.message==='string'?' '+detail.message:''),status:503,code:'ROSTER_DRIVE_OUTPUT',googleCode:detail?.status||detail?.code||response.getResponseCode()});
 }return response;
}
function rosterDriveOutputJson_(url,options){const response=rosterDriveOutputFetch_(url,options);try{return JSON.parse(response.getContentText());}catch(e){rosterDriveOutputFail_('Drive output returned an invalid response.',503);}}
function rosterDriveOutputMeta_(id){return rosterDriveOutputJson_('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(rosterDriveOutputId_(id))+'?supportsAllDrives=true&fields=id,name,mimeType,parents,trashed,version,size,appProperties');}
function rosterDriveOutputDescendant_(id,home){
 const seen=new Set();for(let n=0;n<20;n++){if(id===home)return true;if(seen.has(id))break;seen.add(id);const meta=rosterDriveOutputMeta_(id);if(meta.trashed||meta.mimeType!=='application/vnd.google-apps.folder'||meta.parents?.length!==1)break;id=meta.parents[0];}
 return false;
}
function rosterDriveOutputGuard_(config,kind='backup'){
 if(!config||!rosterDriveOutputDescendant_(ROSTER_ROOT,rosterDriveOutputId_(config.homeBaseFolderId)))rosterDriveOutputFail_('The output must remain inside the configured GSiS home base.');
 const roster=rosterDriveOutputMeta_(ROSTER_ROOT),live=roster.parents?.length===1?rosterDriveOutputMeta_(roster.parents[0]):null;if(roster.name!=='Roster'||live?.name!=='01 Live Data'||live.parents?.length!==1||live.parents[0]!==config.homeBaseFolderId)rosterDriveOutputFail_('Use the exact GSiS home base/01 Live Data/Roster output path.');
 const home=rosterDriveOutputMeta_(config.homeBaseFolderId);if(home.trashed||home.mimeType!=='application/vnd.google-apps.folder')rosterDriveOutputFail_('The home base must be a Drive folder.');
 if(kind!=='backup')return ROSTER_ROOT;
 const id=rosterDriveOutputId_(config.folderId),folder=rosterDriveOutputMeta_(id);
 if(folder.trashed||folder.mimeType!=='application/vnd.google-apps.folder'||folder.name!=='Backups'||folder.parents?.length!==1||folder.parents[0]!==ROSTER_ROOT)rosterDriveOutputFail_('Choose the Backups folder directly under the GSiS Roster folder.');return id;
}
function rosterDriveOutputFind_(parent,name){
 const quote=s=>s.replace(/\\/g,'\\\\').replace(/'/g,"\\'"),q="'"+quote(parent)+"' in parents and name = '"+quote(name)+"' and trashed = false",result=rosterDriveOutputJson_('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100&fields=files(id),nextPageToken,incompleteSearch&q='+encodeURIComponent(q));
 if(result.incompleteSearch||result.nextPageToken||!Array.isArray(result.files)||result.files.length>1)rosterDriveOutputFail_('The output folder has ambiguous files. Ask Admin to review it.');return result.files[0]?.id||'';
}
function rosterDriveOutputFolder_(parent,name){
 let id=rosterDriveOutputFind_(parent,name);if(!id)id=rosterDriveOutputJson_('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id',{method:'post',contentType:'application/json',payload:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parent]})}).id;
 const meta=rosterDriveOutputMeta_(id);if(meta.mimeType!=='application/vnd.google-apps.folder'||meta.trashed||meta.parents?.length!==1||meta.parents[0]!==parent)rosterDriveOutputFail_('Invalid output subfolder.');return id;
}
function rosterDriveOutputMonth_(parent,date){if(!/^20\d\d-\d\d-\d\d$/.test(date||''))rosterDriveOutputFail_('Choose a valid output date.',400);return rosterDriveOutputFolder_(rosterDriveOutputFolder_(parent,date.slice(0,4)),date.slice(5,7));}
function rosterDriveOutputDigest_(raw){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw).map(value=>(value&255).toString(16).padStart(2,'0')).join('');}
function rosterDriveOutputNotArchive_(id){
 const properties=props_().getProperties();if(Object.entries(properties).some(([key,value])=>/ROSTER_.*(?:FILE|MANIFEST|HEAD|ARCHIVE)/.test(key)&&value===id))rosterDriveOutputFail_('Frozen archive files cannot be used as output files.');
}
function rosterDriveOutputFile_(id,parent,name){rosterDriveOutputNotArchive_(id);const meta=rosterDriveOutputMeta_(id);if(meta.trashed||meta.parents?.length!==1||meta.parents[0]!==parent||name&&meta.name!==name||meta.mimeType==='application/vnd.google-apps.shortcut')rosterDriveOutputFail_('The output file is outside its intended folder.');return meta;}
function rosterDriveOutputCreate_(parent,name,mimeType,bytes,appProperties,id){
 const boundary='gsis_output_'+Utilities.getUuid().replace(/-/g,''),meta={name,mimeType,...(!id?{parents:[parent]}:{}),...(appProperties?{appProperties}:{})},payload='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: '+mimeType+'\r\nContent-Transfer-Encoding: base64\r\n\r\n'+Utilities.base64Encode(bytes)+'\r\n--'+boundary+'--';
 return rosterDriveOutputJson_('https://www.googleapis.com/upload/drive/v3/files'+(id?'/'+encodeURIComponent(id):'')+'?uploadType=multipart&supportsAllDrives=true&fields=id,version',{method:id?'patch':'post',contentType:'multipart/related; boundary='+boundary,payload:Utilities.newBlob(payload).getBytes()}).id;
}
function rosterDriveOutputBytes_(id){return rosterDriveOutputFetch_('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?supportsAllDrives=true&alt=media').getContent();}
function rosterDriveOutputPrivacy_(value){
 if(typeof value==='string'){if(/https?:\/\/[^\s<>"']*(?:#[^\s<>"']+|[?&](?:amp;)?(?:token|cap|key|auth|signature)=|\/(?:external|private)(?:[./?]|$))/i.test(value)||/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(value))rosterDriveOutputFail_('A private link cannot be written to Drive.');return;}
 if(!value||typeof value!=='object')return;
 if(value.encoding==='gzip-audit-v1'){rosterDriveOutputPrivacy_(JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(value.data), 'application/x-gzip')).getDataAsString()));return;}
 for(const [key,child] of Object.entries(value)){if(/(?:token|capabilit|secret|password|authorization|private.?link|private.?url|signature|nonce)/i.test(key))rosterDriveOutputFail_('Credentials and private capabilities cannot be written to Drive.');if(['value_json','json'].includes(key)&&typeof child==='string')rosterDriveOutputPrivacy_(JSON.parse(child));else rosterDriveOutputPrivacy_(child);}
}
function rosterDriveOutputCounts_(payload){const counts={};for(const row of payload.rows||[]){const key=row.scope+'.'+row.collection,value=JSON.parse(row.value_json);if(counts[key]===undefined)counts[key]=0;if(row.record_id==='$'&&['array','map'].includes(value?.kind))continue;counts[key]++;}return counts;}
function rosterDriveOutputWorkbookPrivacy_(bytes){
 const parts=Utilities.unzip(Utilities.newBlob(bytes, 'application/zip'));if(!parts.length||parts.length>200)rosterDriveOutputFail_('Invalid daily workbook.');
 for(const part of parts){
  if(!/^xl\/(?:worksheets\/[^/]+|sharedStrings)\.xml$/.test(part.getName()))continue;
  // XML attributes include schema URLs, not cell text. Element values decode
  // entities and join rich-text runs so a split capability still gets refused.
  const visit=element=>{if(['c','si'].includes(element.getName()))rosterDriveOutputPrivacy_(element.getValue());else for(const child of element.getChildren())visit(child);};
  visit(XmlService.parse(part.getDataAsString()).getRootElement());
 }
}
function rosterDriveOutputVerify_(bytes,p){
 const raw=p.step==='writeBackup'?Utilities.ungzip(Utilities.newBlob(bytes, 'application/x-gzip')).getDataAsString():Utilities.newBlob(bytes).getDataAsString();
 if(Utilities.newBlob(raw).getBytes().length>33554432||rosterDriveOutputDigest_(raw)!==p.digest)rosterDriveOutputFail_('Backup digest verification failed.');
 const value=JSON.parse(raw);if(value.schema!=='gsis-roster-drive-backup-v1')rosterDriveOutputFail_('Unknown backup schema.');rosterDriveOutputPrivacy_(value);
 if(p.step==='writeBackup'){
  const counts=rosterDriveOutputCounts_(value),stable=v=>JSON.stringify(Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))));
  if(![1,2].includes(value.tier)||!Array.isArray(value.rows)||value.rows.length!==p.records||stable(counts)!==stable(p.counts)||stable(counts)!==stable(value.counts))rosterDriveOutputFail_('Backup collection-count verification failed.');
  return {digest:p.digest,counts,records:value.rows.length};
 }
 return {digest:p.digest};
}
function rosterDriveOutputBackup_(p){
 const root=rosterDriveOutputGuard_(p.config),folder=rosterDriveOutputMonth_(root,p.date),compressed=p.step==='writeBackup';
 if(typeof p.name!=='string'||!p.name.startsWith(p.date+'-')||!p.name.endsWith(p.digest+(compressed?'.json.gz':'.manifest.json'))||! /^[A-Za-z0-9.-]+$/.test(p.name)||p.name.length>250||! /^[a-f0-9]{64}$/.test(p.digest))rosterDriveOutputFail_('Invalid immutable backup name.',400);
 const bytes=compressed?Utilities.base64Decode(p.data):Utilities.newBlob(p.text).getBytes();if(bytes.length>(compressed?8388608:1048576))rosterDriveOutputFail_('The output exceeds its transfer limit.',413);
 rosterDriveOutputVerify_(bytes,p);let id=rosterDriveOutputFind_(folder,p.name);if(!id)id=rosterDriveOutputCreate_(folder,p.name,compressed?'application/gzip':'application/json',bytes);
 const meta=rosterDriveOutputFile_(id,folder,p.name),proof=rosterDriveOutputVerify_(rosterDriveOutputBytes_(id),p);return {fileId:id,version:meta.version||'',verified:true,...proof};
}
function rosterDriveOutputRead_(p){
 const root=rosterDriveOutputGuard_(p.config),id=rosterDriveOutputId_(p.fileId);rosterDriveOutputNotArchive_(id);const meta=rosterDriveOutputMeta_(id);
 if(meta.trashed||meta.parents?.length!==1||!rosterDriveOutputDescendant_(meta.parents[0],root)||!/^20\d\d-\d\d-\d\d-[A-Za-z0-9.-]+(?:\.json\.gz|\.manifest\.json)$/.test(meta.name||''))rosterDriveOutputFail_('This file is not a backup output.');
 const bytes=rosterDriveOutputBytes_(id);if(bytes.length>8388608)rosterDriveOutputFail_('The backup exceeds the transfer limit.');return {fileId:id,name:meta.name,version:meta.version||'',...(meta.name.endsWith('.gz')?{data:Utilities.base64Encode(bytes)}:{text:Utilities.newBlob(bytes).getDataAsString()})};
}
function rosterDriveOutputContinuity_(p){
 const root=rosterDriveOutputGuard_(p.config,'continuity'),name='Roster continuity',data=p.continuity;
 if(!data||!Array.isArray(data.days)||data.days.length>6||!Array.isArray(data.fairness)||data.fairness.length>1000)rosterDriveOutputFail_('Invalid continuity view.');
 let id=p.config.continuitySheetId||rosterDriveOutputFind_(root,name);
 if(!id)id=rosterDriveOutputJson_('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id',{method:'post',contentType:'application/json',payload:JSON.stringify({name,mimeType:'application/vnd.google-apps.spreadsheet',parents:[root]})}).id;
 const meta=rosterDriveOutputFile_(id,root,name);if(meta.mimeType!=='application/vnd.google-apps.spreadsheet')rosterDriveOutputFail_('Choose the dedicated Roster continuity Google Sheet.');
 const clip=x=>String(x??'').slice(0,300),relief=[['GSiS Roster continuity','Updated',clip(data.generatedAt)],['Date','Stapler day','Record','Teacher','Periods','Class','Relief teacher','Status']];
 for(const day of data.days){if(!/^20\d\d-\d\d-\d\d$/.test(day.date)||!Array.isArray(day.absences)||!Array.isArray(day.assignments))rosterDriveOutputFail_('Invalid continuity date.');for(const a of day.absences)relief.push([day.date,day.stapler?'Yes':'No','Absent',clip(a.teacher),clip(a.periods),'','','']);for(const a of day.assignments)relief.push([day.date,day.stapler?'Yes':'No','Relief',clip(a.absentTeacher),clip(a.period),clip(a.className),clip(a.reliefTeacher),clip(a.status)]);}
 const fairness=[['Teacher','Quota','Done','R%'],...data.fairness.map(row=>[clip(row.teacher),clip(row.quota),clip(row.done),clip(row.percent)])];
 const url='https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(id),sheet=rosterDriveOutputJson_(url+'?fields=sheets(properties)'),requests=[];
 for(const [title,values,defaultId] of [['Relief',relief,101],['Fairness',fairness,102]]){
  const existing=sheet.sheets?.find(s=>s.properties.title===title),sheetId=existing?.properties.sheetId??defaultId;
  if(!existing)requests.push({addSheet:{properties:{sheetId,title,gridProperties:{rowCount:Math.max(100,values.length),columnCount:8,frozenRowCount:title==='Relief'?2:1}}}});
  else requests.push({updateSheetProperties:{properties:{sheetId,gridProperties:{rowCount:Math.max(existing.properties.gridProperties?.rowCount||100,values.length),columnCount:Math.max(existing.properties.gridProperties?.columnCount||8,8),frozenRowCount:title==='Relief'?2:1}},fields:'gridProperties'}});
  requests.push({updateCells:{range:{sheetId},rows:values.map(row=>({values:row.map(value=>({userEnteredValue:{stringValue:String(value)}}))})),fields:'userEnteredValue'}});
 }
 // One atomic Sheets batch: a failure leaves the previous readable view intact.
 rosterDriveOutputJson_(url+':batchUpdate',{method:'post',contentType:'application/json',payload:JSON.stringify({requests})});return {fileId:id,verified:true,rows:relief.length+fairness.length};
}
function rosterDriveOutputDaily_(p){
 if(!['excel','log'].includes(p.kind)||!Number.isSafeInteger(p.revision)||p.revision<0||typeof p.final!=='boolean'||!/^20\d\d-\d\d-\d\d$/.test(p.date||'')||! /^[a-f0-9]{64}$/.test(p.digest||''))rosterDriveOutputFail_('Invalid daily output identity.',400);
 const today=new Date(Date.now()+28800000).toISOString().slice(0,10);if(p.final&&p.date>=today||!p.final&&p.date<today)throw Object.assign(Error('The output date closed; prepare its FINAL snapshot.'),{status:409,code:'DAILY_OUTPUT_DAY_CLOSED'});
 const root=rosterDriveOutputGuard_(p.config,'daily'),folderName=p.kind==='excel'?'Daily Relief':'Allocation Audit',configured=p.kind==='excel'?p.config.folderId:p.config.auditFolderId;
 const parent=configured||rosterDriveOutputFolder_(root,folderName),meta=rosterDriveOutputMeta_(parent);
 if(meta.trashed||meta.mimeType!=='application/vnd.google-apps.folder'||meta.name!==folderName||meta.parents?.length!==1||meta.parents[0]!==root)rosterDriveOutputFail_('Use the '+folderName+' folder directly under 01 Live Data/Roster.');
 if(typeof p.data!=='string'||p.data.length>11184816)rosterDriveOutputFail_('The daily output exceeds its transfer limit.',413);
 const bytes=Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(p.data), 'application/x-gzip')).getBytes();
 if(bytes.length!==p.bytesRaw||bytes.length>16777216||rosterDriveOutputDigest_(bytes)!==p.digest)rosterDriveOutputFail_('Daily output digest verification failed.');
 if(p.kind==='log')rosterDriveOutputPrivacy_(Utilities.newBlob(bytes).getDataAsString());else rosterDriveOutputWorkbookPrivacy_(bytes);
 // The existing output-only UserLock serialises provider retries. No planner
 // ScriptLock, frozen state read, or UserLock -> ScriptLock nesting is used.
 const lock=LockService.getUserLock();if(!lock.tryLock(1))throw Object.assign(Error('Another Drive output is still running.'),{status:503,code:'DAILY_OUTPUT_BUSY'});
 try{
  const folder=rosterDriveOutputMonth_(parent,p.date),name=p.date+(p.kind==='excel'?' Relief.xlsx':'.txt'),mime=p.kind==='excel'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/plain',id=rosterDriveOutputFind_(folder,name),old=id?rosterDriveOutputFile_(id,folder,name):null,prior=old?.appProperties||{};
  if(old&&old.mimeType!==mime)rosterDriveOutputFail_('An output with a different file type already uses this name.');
  const verify=(savedId,expected,alreadyFinal=false)=>{const actual=rosterDriveOutputFile_(savedId,folder,name),read=rosterDriveOutputBytes_(savedId);if(rosterDriveOutputDigest_(read)!==expected)rosterDriveOutputFail_('Daily output read-back failed.');return {fileId:savedId,version:actual.version||'',verified:true,digest:expected,revision:Number(actual.appProperties?.gsis_revision)||0,bytes:read.length,final:actual.appProperties?.gsis_final==='true',alreadyFinal};};
  if(prior.gsis_final==='true'){if(!/^[a-f0-9]{64}$/.test(prior.gsis_digest||''))rosterDriveOutputFail_('The final output lacks its verification digest.');return verify(id,prior.gsis_digest,true);}
  if(Number(prior.gsis_revision)>p.revision)throw Object.assign(Error('A newer daily output already exists.'),{status:409,code:'DAILY_OUTPUT_STALE'});
  if(prior.gsis_digest===p.digest&&prior.gsis_final===String(p.final)&&Number(prior.gsis_revision)===p.revision)return verify(id,p.digest);
  const saved=rosterDriveOutputCreate_(folder,name,mime,bytes,{gsis_revision:String(p.revision),gsis_final:String(p.final),gsis_digest:p.digest,gsis_kind:p.kind},id);
  return verify(saved,p.digest);
 }finally{lock.releaseLock();}
}
function rosterDriveOutputsDispatch_(req,serviceVerified=false){
 const p=req?.input||{};if(p.operation!=='edgeDriveOutput')return null;
 if(serviceVerified!==true)rosterDriveOutputFail_('Only the signed Worker output service may access Drive outputs.',403);
 if(props_().getProperty('ROSTER_EDGE_AUTHORITY')!=='d1')rosterDriveOutputFail_('Scheduled D1 outputs require D1 authority.');
 try{
  let result;if(['writeBackup','writeManifest'].includes(p.step))result=rosterDriveOutputBackup_(p);else if(p.step==='readBackup')result=rosterDriveOutputRead_(p);else if(p.step==='continuity')result=rosterDriveOutputContinuity_(p);else if(p.step==='daily')result=rosterDriveOutputDaily_(p);else rosterDriveOutputFail_('Choose a supported Drive output operation.',400);
  return {handled:true,result};
 }catch(error){throw rosterDriveOutputError_(error);}
}
