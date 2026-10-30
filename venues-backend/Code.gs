/** Standalone Venues persistence and authenticated entrypoints, GSiS 0.9.2. */
var VENUES_VERSION = '0.9.9';
var VENUES_TABLES = {meta:'VenuesMeta',venues:'VenuePolicy',admins:'AdminGrant',owners:'RoomOwnerGrant',series:'BookingSeries',occurrences:'BookingOccurrence',transfers:'TransferRequest',decisions:'ApprovalDecision',closures:'Closure',waivers:'TimetableWaiver',outbox:'NotificationOutbox',audit:'AuditEvent',receipts:'RequestReceipt',nonces:'TransportNonce',people:'StaffSnapshot'};
var VENUES_SHEET_IDS = Object.keys(VENUES_TABLES).reduce(function(out,key,index){out[VENUES_TABLES[key]]=9200+index;return out;},{});
function venuesNow_(){return new Date().toISOString();}
function venuesContext_(){var now=venuesNow_();return {now:now,today:Utilities.formatDate(new Date(now),'Asia/Singapore','yyyy-MM-dd'),uuid:function(){return Utilities.getUuid();}};}
function venuesError_(code,message,status){var e=new Error(message);e.code=code;e.status=status||503;return e;}
function venuesProperties_(){return PropertiesService.getScriptProperties();}
function venuesSpreadsheetId_(){var id=venuesProperties_().getProperty('VENUES_SPREADSHEET_ID');if(!id)throw venuesError_('SETUP_REQUIRED','Run setupVenues before using Venues.');return id;}
function venuesWithLock_(fn){var lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw venuesError_('BUSY','Another change is in progress. Try again shortly.',409);try{return fn();}finally{lock.releaseLock();}}
function venuesRows_(records){var rows=[['id','chunk','total','json']];records.forEach(function(record){var json=JSON.stringify(record),count=Math.max(1,Math.ceil(json.length/40000));for(var i=0;i<count;i++)rows.push([String(record.id),i,count,json.slice(i*40000,(i+1)*40000)]);});return rows;}
function venuesRecords_(rows,name){var groups={},order=[];(rows||[]).slice(1).forEach(function(r){if(!r[0])return;var id=String(r[0]),index=Number(r[1]),count=Number(r[2]);if(!Number.isInteger(index)||!Number.isInteger(count)||index<0||index>=count||count>10000)throw venuesError_('CORRUPT_STORAGE','Invalid stored chunks in '+name+'.');if(!groups[id]){groups[id]={count:count,chunks:[]};order.push(id);}if(groups[id].count!==count||groups[id].chunks[index]!==undefined)throw venuesError_('CORRUPT_STORAGE','Duplicate stored chunks in '+name+'.');groups[id].chunks[index]=String(r[3]||'');});return order.map(function(id){var g=groups[id];for(var i=0;i<g.count;i++)if(g.chunks[i]===undefined)throw venuesError_('CORRUPT_STORAGE','Missing stored chunks in '+name+'.');try{return JSON.parse(g.chunks.join(''));}catch(e){throw venuesError_('CORRUPT_STORAGE','Invalid JSON in '+name+'.');}});}
function venuesTableData_(state){
  // Stable per-key records separate small reservation counters from occupancy.
  var fixed=['revision','policyRevision','contacts','commitToken','source'],keys=fixed.concat(Object.keys(state).filter(function(k){return fixed.indexOf(k)<0&&VenuesDomain.TABLES.indexOf(k)<0;}).sort());
  var data={meta:keys.map(function(k){return {id:k,value:state[k]===undefined?(k==='commitToken'?'':null):state[k]};}),admins:state.grants.filter(function(g){return g.kind==='admin';}),owners:state.grants.filter(function(g){return g.kind==='owner';})};
  Object.keys(VENUES_TABLES).forEach(function(k){if(!data[k])data[k]=state[k]||[];});return data;
}
function venuesLoadState_(){var keys=Object.keys(VENUES_TABLES),response=Sheets.Spreadsheets.Values.batchGet(venuesSpreadsheetId_(),{ranges:keys.map(function(k){return "'"+VENUES_TABLES[k]+"'!A:D";}),valueRenderOption:'UNFORMATTED_VALUE'}),state=VenuesDomain.initialState(),tables={};if(!response.valueRanges||response.valueRanges.length!==keys.length)throw venuesError_('CORRUPT_STORAGE','Some Venues tables could not be read.');keys.forEach(function(k,i){tables[k]=venuesRecords_(response.valueRanges[i].values,VENUES_TABLES[k]);});if(tables.meta.length){tables.meta.forEach(function(record){if(typeof record.id!=='string'||VenuesDomain.TABLES.indexOf(record.id)>=0||record.id==='__proto__'||record.id==='constructor'||record.value===undefined)throw venuesError_('CORRUPT_STORAGE','Venues metadata is invalid.');state[record.id]=record.value;});}keys.forEach(function(k){if(!['meta','admins','owners'].includes(k))state[k]=tables[k];});state.grants=tables.admins.concat(tables.owners);return state;}
function venuesCommitState_(before,after,extraRequests){
  var oldData=venuesTableData_(before),nextData=venuesTableData_(after),changes=Object.keys(VENUES_TABLES).filter(function(k){return VenuesDomain.stable(oldData[k])!==VenuesDomain.stable(nextData[k]);});if(!changes.length)return;
  after.commitToken=Utilities.getUuid();nextData=venuesTableData_(after);if(changes.indexOf('meta')<0)changes.push('meta');
  var properties=Sheets.Spreadsheets.get(venuesSpreadsheetId_(),{fields:'sheets.properties'}).sheets.reduce(function(out,s){out[s.properties.title]=s.properties;return out;},{}),requests=(extraRequests||[]).slice();
  changes.forEach(function(k){
    var name=VENUES_TABLES[k],p=properties[name];
    if(!p)throw venuesError_('SETUP_REQUIRED','Missing table '+name+'. Run setupVenues.');
    var rows=venuesRows_(nextData[k]),prior=venuesRows_(oldData[k]),end=Math.max(rows.length,prior.length);
    if(end>p.gridProperties.rowCount)requests.push({appendDimension:{sheetId:p.sheetId,dimension:'ROWS',length:end-p.gridProperties.rowCount}});
    // Write changed contiguous row spans only. Identical historical rows and
    // headers remain untouched; the explicit range clears a removed tail.
    for(var start=0;start<end;){
      if(JSON.stringify(rows[start]||[])===JSON.stringify(prior[start]||[])){start++;continue;}
      var stop=start+1;
      while(stop<end&&JSON.stringify(rows[stop]||[])!==JSON.stringify(prior[stop]||[]))stop++;
      requests.push({updateCells:{range:{sheetId:p.sheetId,startRowIndex:start,endRowIndex:stop,startColumnIndex:0,endColumnIndex:4},rows:rows.slice(start,stop).map(function(r){return {values:r.map(function(v){return {userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:v}};})};}),fields:'userEnteredValue'}});
      start=stop;
    }
  });
  // ponytail: one school-wide writer lock and full authoritative reads; split
  // storage by school year when retained history makes reads too slow.
  if(Utilities.newBlob(JSON.stringify(requests)).getBytes().length>8000000)throw venuesError_('TRANSACTION_TOO_LARGE','This change exceeds the safe Sheets transaction size. Archive older years first.',413);
  var props=venuesProperties_(),marker={token:after.commitToken,beforeToken:before.commitToken||'',at:venuesNow_()};props.setProperty('VENUES_COMMIT_PENDING',JSON.stringify(marker));
  try{Sheets.Spreadsheets.batchUpdate({requests:requests},venuesSpreadsheetId_());props.deleteProperty('VENUES_COMMIT_PENDING');}
  catch(e){var current;try{current=venuesLoadState_();}catch(ignore){}if(current&&current.commitToken===after.commitToken){props.deleteProperty('VENUES_COMMIT_PENDING');return;}if(e.status===400||e.status===403||e.status===404){props.deleteProperty('VENUES_COMMIT_PENDING');throw e;}throw venuesError_('COMMIT_UNCERTAIN','The save could not be confirmed. Writes are paused until the stored transaction is reconciled.');}
}
function venuesCheckCommit_(state){var props=venuesProperties_(),raw=props.getProperty('VENUES_COMMIT_PENDING');if(!raw)return;var marker;try{marker=JSON.parse(raw);}catch(e){throw venuesError_('COMMIT_UNCERTAIN','The transaction recovery marker needs administrator review.');}if(state.commitToken===marker.token){props.deleteProperty('VENUES_COMMIT_PENDING');return;}throw venuesError_('COMMIT_UNCERTAIN','A prior save has an unknown outcome. An administrator must review transaction '+marker.token+'.');}
function venuesTransaction_(fn){return venuesWithLock_(function(){var before=venuesLoadState_();venuesCheckCommit_(before);var outcome=fn(JSON.parse(JSON.stringify(before)))||{};if(outcome.state)venuesCommitState_(before,outcome.state,outcome.requests);return outcome.result;});}
function venuesJson_(value){value=gsisBuildLabelPayload_(value);return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function venuesVerifyEnvelope_(event){
  var raw=event&&event.postData&&event.postData.contents;if(typeof raw!=='string'||raw.length>250000)throw venuesError_('INVALID_REQUEST','Send a signed JSON request.',400);var outer,p;try{outer=JSON.parse(raw);p=JSON.parse(outer.payload);}catch(e){throw venuesError_('INVALID_REQUEST','Invalid signed JSON request.',400);}
  if(!['venues','venuesService','calendarCatalogue'].includes(p.action))throw venuesError_('INVALID_ACTION','Unsupported signed action.',400);
  var secret=gsisApiSecret_(p.action==='venues'?'VENUES_PROXY_SECRET':'VENUES_BRIDGE_SECRET');if(!secret)throw venuesError_('SETUP_REQUIRED','The endpoint signing secret is not configured.');
  var expected=Utilities.computeHmacSha256Signature(outer.payload,secret).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join(''),given=String(outer.signature||'').toLowerCase(),different=expected.length^given.length;for(var i=0;i<expected.length;i++)different|=expected.charCodeAt(i)^(given.charCodeAt(i)||0);if(different)throw venuesError_('INVALID_SIGNATURE','The request signature is invalid.',401);
  if(!Number.isFinite(p.timestamp)||Math.abs(Date.now()-p.timestamp)>300000||typeof p.nonce!=='string'||p.nonce.length<16||p.nonce.length>200)throw venuesError_('EXPIRED_REQUEST','The signed request expired or has an invalid nonce.',401);
  if(!p.input||typeof p.input!=='object'||Array.isArray(p.input))throw venuesError_('INVALID_REQUEST','The signed request needs an input.',400);
  if(p.action==='calendarCatalogue'){
    if(p.service!=='gsis-calendar-catalogue-v1'||p.purpose!=='calendar-venue-catalogue-v1'||Object.keys(p).some(k=>!['action','service','purpose','timestamp','nonce','identity','input'].includes(k))||Object.keys(p.input).length!==1||p.input.operation!=='calendarLookup'||!p.identity||typeof p.identity.email!=='string'||!p.identity.email.includes('@')||typeof p.identity.subject!=='string'||!p.identity.subject)throw venuesError_('INVALID_SERVICE','Calendar catalogue requests are read-only and identity-scoped.',403);
    return p;
  }
  if(p.action==='venuesService'){if(p.service!=='gsis-venues-v1'||p.identity!==undefined||!['sourceBegin','sourceComplete','sourceStatus'].includes(p.input.operation))throw venuesError_('INVALID_SERVICE','Service requests cannot act as school users.',403);}
  else if(!p.identity||typeof p.identity.email!=='string'||typeof p.identity.subject!=='string'||!p.identity.subject||!p.identity.email.includes('@')||!VenuesDomain.READS.concat(VenuesDomain.COMMANDS).includes(p.input.operation))throw venuesError_('INVALID_IDENTITY','A verified Access identity and valid operation are required.',401);
  return p;
}
function venuesNonce_(state,p){var prior=state.nonces.find(function(n){return n.id===p.nonce;});if(prior)throw venuesError_('REPLAY','This signed transport request was already consumed. Retry with a fresh signature.',409);state.nonces.push({id:p.nonce,createdAt:venuesNow_(),action:p.action});state.nonces=state.nonces.filter(function(n){return Date.parse(n.createdAt)>=Date.now()-600000;});}
function doGet(){return venuesJson_({ok:false,status:405,code:'METHOD_NOT_ALLOWED',error:'Use the authenticated Venues application.'});}
function doPost(event){try{var p=venuesVerifyEnvelope_(event),result;
  if(p.action==='venuesService'){result=venuesTransaction_(function(state){if(p.input.operation!=='sourceStatus')venuesNonce_(state,p);var out=VenuesDomain.sourceEvent(state,p.input,venuesContext_());return out;});}
  else{
    // Every operation resolves staff from live Contacts outside the writer lock.
    var actor=venuesResolveActor_(p.identity,true),operation=p.input.operation;
    if(['book','decide','requestTransfer','decideTransfer'].includes(operation)||operation==='amend'&&(p.input.date!==undefined||p.input.periodIds!==undefined))venuesEnsureFreshSources_(actor.sourceObservation);
    // A staff refresh may recover verified read projections without granting
    // any room policy or booking mutation permission. Failure returns the last
    // safe state and its diagnostic, never an empty available timetable.
    if(operation==='bootstrap'&&p.input.refreshSources===true){try{venuesEnsureFreshSources_(actor.sourceObservation);}catch(_){} }
    if(operation==='sync'){var allowed=venuesTransaction_(function(state){return {result:VenuesDomain.permissions(state,actor,venuesContext_().today).admin};});if(!allowed)throw venuesError_('FORBIDDEN','Venues administrator access is required.',403);venuesRefreshSources_(true);}
    if(operation==='calendarLookup'&&p.action==='calendarCatalogue'){
      var register=venuesReadRegister_();
      result=venuesTransaction_(function(state){if(actor.sourceKey&&state.contacts.key!==actor.sourceKey)throw venuesError_('IDENTITY_CHANGED','Staff identity changed. Retry this operation.',409);return {result:venuesCalendarCatalogue_(state,register)};});
    }
    else if(operation==='saveRoomMetadata'){result=venuesSaveRoomMetadata_(actor,p);}
    else if(operation==='piece'){var pieceState=venuesTransaction_(function(state){if(actor.sourceKey&&state.contacts.key!==actor.sourceKey)throw venuesError_('IDENTITY_CHANGED','Staff identity changed. Retry this operation.',409);return {result:state};});result=venuesReadPiece_(p.input.key,pieceState);}
    else result=venuesTransaction_(function(state){if(actor.sourceKey&&state.contacts.key!==actor.sourceKey)throw venuesError_('IDENTITY_CHANGED','Staff identity changed. Retry this operation.',409);if(VenuesDomain.READS.includes(operation))return {result:VenuesDomain.read(state,actor,p.input,venuesContext_())};venuesNonce_(state,p);return VenuesDomain.execute(state,actor,p.input,venuesContext_());});
  }
  if(p.action==='venues'&&p.input.operation==='admin'&&result.permissions.admin){try{result.register=venuesPublicRegister_(venuesReadRegister_());}catch(registerError){result.registerError=registerError.code?registerError.message:'The shared physical room register could not be read.';}}
  return venuesJson_({ok:true,data:result});
}catch(e){var out={ok:false,status:e.status||503,code:e.code||'BACKEND_UNAVAILABLE',error:e.code?e.message:'The Venues backend is temporarily unavailable.'};if(e.conflicts)out.conflicts=e.conflicts;return venuesJson_(out);}}
function setupVenues(){
  var props=venuesProperties_();if(!props.getProperty('VENUES_SPREADSHEET_ID'))props.setProperty('VENUES_SPREADSHEET_ID',SpreadsheetApp.create('GSiS Venues').getId());
  if(!props.getProperty('VENUES_SNAPSHOT_FOLDER_ID'))props.setProperty('VENUES_SNAPSHOT_FOLDER_ID',Drive.Files.create({name:'GSiS Venues immutable snapshots',mimeType:'application/vnd.google-apps.folder'}).id);
  venuesWithLock_(function(){var id=venuesSpreadsheetId_(),sheets=Sheets.Spreadsheets.get(id,{fields:'sheets.properties'}).sheets||[],requests=[];Object.keys(VENUES_TABLES).forEach(function(k){var title=VENUES_TABLES[k];if(!sheets.some(function(s){return s.properties.title===title;})){requests.push({addSheet:{properties:{sheetId:VENUES_SHEET_IDS[title],title:title,gridProperties:{rowCount:1000,columnCount:4}}}});requests.push({updateCells:{range:{sheetId:VENUES_SHEET_IDS[title],startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:4},rows:[{values:['id','chunk','total','json'].map(function(v){return {userEnteredValue:{stringValue:v}};})}],fields:'userEnteredValue'}});}});if(requests.length)Sheets.Spreadsheets.batchUpdate({requests:requests},id);});
  // Source reads happen before taking the Venues lock, including initial grants.
  var configured=(props.getProperty('VENUES_ADMIN_EMAILS')||'').split(/[,;\n]/).map(function(s){return s.trim().toLowerCase();}).filter(Boolean),actors=[];if(configured.length){configured.forEach(function(email){actors.push(venuesResolveActor_({email:email,subject:'initial-setup'}));});venuesTransaction_(function(state){if(state.grants.some(function(g){return g.kind==='admin';}))return {result:null};var c=venuesContext_();actors.forEach(function(a){state.grants.push({id:c.uuid(),kind:'admin',staffId:a.id,active:true,from:c.today,to:'',revision:1});});state.policyRevision++;state.audit.push({id:c.uuid(),kind:'setupAdmins',actorId:'setup',actorName:'Apps Script operator',at:c.now,staffIds:actors.map(function(a){return a.id;})});return {state:state,result:null};});}
  if(!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='venuesRunJobs';}))ScriptApp.newTrigger('venuesRunJobs').timeBased().everyMinutes(1).create();return venuesHealthCheck();
}
function venuesHealthCheck(){return venuesTransaction_(function(state){return {result:{version:VENUES_VERSION,revision:state.revision,source:{status:state.source.status,checkedAt:state.source.checkedAt,generation:state.source.generation},admins:state.grants.filter(function(g){return g.kind==='admin'&&g.active;}).length,tables:Object.values(VENUES_TABLES),pendingCommit:false}};});}
function venuesPruneReceipts(){return venuesTransaction_(function(state){var cutoff=Date.now()-30*86400000,prior=state.receipts.length+state.nonces.length;state.receipts=state.receipts.filter(function(r){return Date.parse(r.createdAt)>=cutoff;});state.nonces=state.nonces.filter(function(r){return Date.parse(r.createdAt)>=Date.now()-600000;});return {state:state,result:{removed:prior-state.receipts.length-state.nonces.length}};});}
/** Operator-only recovery. No endpoint invokes this function. Never clear on age. */
function venuesRecoverCommit(expectedToken,evidence){if(typeof evidence!=='string'||evidence.trim().length<20)throw venuesError_('REVIEW_REQUIRED','Record the evidence that this transaction did not commit.',400);return venuesWithLock_(function(){var props=venuesProperties_(),raw=props.getProperty('VENUES_COMMIT_PENDING');if(!raw)return {recovered:false};var marker=JSON.parse(raw),state=venuesLoadState_();if(marker.token!==expectedToken)throw venuesError_('REVISION_CONFLICT','The pending transaction changed.',409);if(state.commitToken===marker.token){props.deleteProperty('VENUES_COMMIT_PENDING');return {recovered:true,committed:true};}if((state.commitToken||'')!==marker.beforeToken)throw venuesError_('COMMIT_UNCERTAIN','The stored state has another transaction. Do not clear this marker.');var before=JSON.parse(JSON.stringify(state)),c=venuesContext_();state.audit.push({id:c.uuid(),kind:'commitRecovery',actorId:'setup',actorName:'Apps Script operator',at:c.now,token:marker.token,evidence:evidence});props.deleteProperty('VENUES_COMMIT_PENDING');venuesCommitState_(before,state);return {recovered:true,committed:false};});}

/** Explicit operator source refresh; reads sources outside the Venues lock. */
function syncVenuesSources(){return venuesRefreshSources_(true);}

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

/* GSIS_VENUES_CALENDAR_CATALOGUE_BEGIN */
/* Current physical register joined to persistent Venues identities. This
 * endpoint returns no reservations, permissions, people, policies or notes. */
function venuesCalendarCatalogue_(state,register){
  const seen=new Set(),venues=(register.rows||[]).map(room=>{
    const matches=state.venues.filter(v=>String(v.unit||'')===room.unitNumber);
    if(matches.length!==1||seen.has(matches[0].id))throw venuesError_('CATALOGUE_UNVERIFIED','Refresh Venues sources to verify the current room directory.',503);
    const venue=matches[0];seen.add(venue.id);
    const aliases=Array.from(new Set([room.shortName].concat(venue.aliases||[],venue.descriptors||[]).filter(value=>typeof value==='string'&&value.trim()&&value.length<=300).map(value=>value.trim()))).slice(0,100);
    return {id:venue.id,unit:room.unitNumber,name:room.name,aliases:aliases,active:true};
  });
  return {venues:venues.sort((a,b)=>a.unit.localeCompare(b.unit,undefined,{numeric:true}))};
}

/* GSIS_VENUES_CALENDAR_CATALOGUE_END */
