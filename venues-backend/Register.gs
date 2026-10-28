/* Shared physical room metadata. The canonical Venues sheet and audit commit together. */
function venuesReadRegister_(){
 var sheet=SpreadsheetApp.openById(venuesSpreadsheetId_()).getSheetByName('Venues');
 if(!sheet)throw venuesError_('REGISTER_SETUP_REQUIRED','The shared Venues tab is missing from the configured workbook.');
 var range=sheet.getDataRange(),values=range.getValues(),formulas=range.getFormulas(),headers=values[0]||[],fields=['Unit number','Venue name','Short name','Block','Level','Capacity','Capacity basis','Notes'];
 if(fields.some(function(f){return headers.indexOf(f)<0||headers.indexOf(f)!==headers.lastIndexOf(f);}))throw venuesError_('REGISTER_INVALID','The shared room register needs its eight standard column headings.');
 var seen={},rows=[];
 values.slice(1).forEach(function(row,i){
  if(row.every(function(v){return v==='';}))return;
  var get=function(f){var value=row[headers.indexOf(f)];return value===undefined?'':value;};
  var unit=String(get('Unit number')).trim(),match=/^([A-Z])(\d+)-[A-Z0-9]+$/.exec(unit),capacity=get('Capacity');
  if(fields.some(function(f){return formulas[i+1]&&formulas[i+1][headers.indexOf(f)];})||!match||seen[unit]||String(get('Block'))!==match[1]||Number(get('Level'))!==Number(match[2])||!String(get('Venue name')).trim()||capacity!==''&&(!Number.isSafeInteger(capacity)||capacity<0))throw venuesError_('REGISTER_INVALID','Check the shared room register at sheet row '+(i+2)+'. It contains an invalid value, formula or duplicate unit.');
  seen[unit]=true;rows.push({row:i+1,unitNumber:unit,name:String(get('Venue name')),shortName:String(get('Short name')),block:match[1],level:Number(match[2]),capacity:capacity===''?null:capacity,capacityBasis:String(get('Capacity basis')),notes:String(get('Notes'))});
 });
 if(!rows.length)throw venuesError_('REGISTER_INVALID','The shared room register is empty.');
 return {sheetId:sheet.getSheetId(),headers:headers,rows:rows,revision:venuesDigest_(JSON.stringify(rows))};
}
function venuesPublicRegister_(register){return {revision:register.revision,venues:register.rows.map(function(row){var v=Object.assign({},row);delete v.row;return v;})};}
function venuesSaveRoomMetadata_(actor,envelope){
 var x=envelope.input,c=venuesContext_();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x.requestId||'')||!Number.isSafeInteger(x.expectedRevision)||x.expectedRevision<0)throw venuesError_('INVALID_REQUEST','A request identity and observed revision are required.',400);
 // Check grants before the source read, and again under the writer lock.
 var replay=venuesTransaction_(function(state){
  if(actor.sourceKey&&actor.sourceKey!==state.contacts.key)throw venuesError_('IDENTITY_CHANGED','Staff identity changed. Retry this operation.',409);
  if(!VenuesDomain.permissions(state,actor,c.today).admin)throw venuesError_('FORBIDDEN','Venues administrator access is required.',403);
  var receipt=state.receipts.find(function(r){return r.id===x.requestId;});if(!receipt)return {result:null};
  if(receipt.actorId!==actor.id||receipt.fingerprint!==VenuesDomain.stable(x))throw venuesError_('IDEMPOTENCY_MISMATCH','This request identity belongs to a different change.',409);
  venuesNonce_(state,envelope);return {state:state,result:receipt.result};
 });
 if(replay)return replay;
 var authority=venuesSourceRequest_('deploy',{operation:'manifest'});
 if(authority.registryWorkbookKey!==venuesDigest_(JSON.stringify({spreadsheetId:venuesSpreadsheetId_()})))throw venuesError_('REGISTER_SETUP_REQUIRED','Deploy LANDMARK_SHEET_ID and Venues VENUES_SPREADSHEET_ID must identify the same shared room workbook.');
 return venuesTransaction_(function(state){
  if(actor.sourceKey&&actor.sourceKey!==state.contacts.key)throw venuesError_('IDENTITY_CHANGED','Staff identity changed. Retry this operation.',409);
  if(!VenuesDomain.permissions(state,actor,c.today).admin)throw venuesError_('FORBIDDEN','Venues administrator access is required.',403);
  venuesNonce_(state,envelope);
  var fingerprint=VenuesDomain.stable(x),receipt=state.receipts.find(function(r){return r.id===x.requestId;});
  if(receipt){if(receipt.actorId!==actor.id||receipt.fingerprint!==fingerprint)throw venuesError_('IDEMPOTENCY_MISMATCH','This request identity belongs to a different change.',409);return {state:state,result:receipt.result};}
  var register=venuesReadRegister_();if(x.registryRevision!==register.revision)throw venuesError_('REVISION_CONFLICT','The shared room register changed. Reload it before saving.',409);
  var record=register.rows.find(function(v){return v.unitNumber===x.unitNumber;});if(!record)throw venuesError_('NOT_FOUND','This unit is not in the shared room register.',404);
  var updates=x.fields,allowed={name:'Venue name',shortName:'Short name',capacity:'Capacity',capacityBasis:'Capacity basis',notes:'Notes'};
  if(!updates||typeof updates!=='object'||Array.isArray(updates)||!Object.keys(updates).length||Object.keys(updates).some(function(k){return !Object.prototype.hasOwnProperty.call(allowed,k);}))throw venuesError_('INVALID_REGISTER_EDIT','Only room metadata can be edited here. Unit identities cannot be changed.',400);
  var before=Object.assign({},record),requests=[];
  Object.keys(updates).forEach(function(key){var value=updates[key];
   if(key==='capacity'){if(value!==null&&(!Number.isSafeInteger(value)||value<0||value>100000))throw venuesError_('INVALID_CAPACITY','Capacity must be blank or a whole number from 0 to 100000.',400);}
   else if(typeof value!=='string'||value.length>(key==='notes'?2000:300)||key==='name'&&!value.trim()||/^\s*=/.test(value))throw venuesError_('INVALID_REGISTER_EDIT','Use plain text within the field limit; room name is required.',400);
   if(record[key]===value)return;record[key]=value;var column=register.headers.indexOf(allowed[key]);
   requests.push({updateCells:{range:{sheetId:register.sheetId,startRowIndex:record.row,endRowIndex:record.row+1,startColumnIndex:column,endColumnIndex:column+1},rows:[{values:[{userEnteredValue:value===null?{stringValue:''}:typeof value==='number'?{numberValue:value}:{stringValue:value}}]}],fields:'userEnteredValue'}});
  });
  if(!requests.length){var unchanged={revision:state.revision,message:'No room metadata changed.'};state.receipts.push({id:x.requestId,actorId:actor.id,fingerprint:fingerprint,result:unchanged,createdAt:c.now});return {state:state,result:unchanged};}
  state.revision++;state.source.status='stale';state.source.revision++;state.source.error='Room metadata changed. Refresh the timetable to apply the shared register.';state.source.errorCode='REGISTER_CHANGED';if(state.source.manifest)state.source.manifest.status='stale';
  var matching=state.venues.filter(function(v){return v.unit===record.unitNumber;});matching.forEach(function(v){v.name=record.name;v.descriptors=[record.name,record.shortName].filter(Boolean);v.capacity=record.capacity===null?0:record.capacity;v.revision++;});state.policyRevision++;
  state.audit.push({id:c.uuid(),kind:'saveRoomMetadata',recordId:record.unitNumber,actorId:actor.id,actorName:actor.name,at:c.now,before:before,after:Object.assign({},record)});
  var result={revision:state.revision,venues:matching,registerRevision:venuesDigest_(JSON.stringify(register.rows)),source:{status:state.source.status,error:state.source.error,errorCode:state.source.errorCode},message:'Shared room metadata saved. Refresh the timetable to apply it across Venues.'};
  state.receipts.push({id:x.requestId,actorId:actor.id,fingerprint:fingerprint,result:result,createdAt:c.now});
  return {state:state,result:result,requests:requests};
 });
}
