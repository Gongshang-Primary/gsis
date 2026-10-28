/* Read-only change subscriptions and bounded source delta. Cloudflare journals
 * are hints; Google-backed roles and current source rows decide every read. */
function calendarChangesAuthorize_(actor,payload){
 const year=Number(payload.year);
 if(!Number.isInteger(year)||year<2000||year>2099)throw mutationError_('CHANGE_INPUT','Choose a valid Calendar year.',400,true);
 const roles=rolesFor_(actor.userAlias,true);
 rc18InvalidateIO_(CALV2.SHEETS.YEARS);
 const years=tableObjects_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.YEARS));
 const selected=years.find(row=>Number(row.Year)===year);
 if(!selected||!roles.isAdmin&&!roles.isParentPublisher&&(!yes_(selected.ReleasedToTeachers)||String(selected.Status||'').toUpperCase()==='ARCHIVED'))throw mutationError_('YEAR_UNAVAILABLE','That year is not available to your account.',403,true);
 return {authorized:true,year:year,roles:roles};
}
function apiCalendarChangesDelta_(actor,payload){
 if(!payload||Object.keys(payload).some(key=>!['year','known'].includes(key))||!Array.isArray(payload.known)||payload.known.length>2000)throw mutationError_('CHANGE_INPUT','A bounded Calendar source revision list is required.',400,true);
 const known={};
 payload.known.forEach(row=>{
  if(!row||Object.keys(row).some(key=>!['id','revision'].includes(key))||typeof row.id!=='string'||!row.id||row.id.length>150||typeof row.revision!=='string'||row.revision.length>128||Object.prototype.hasOwnProperty.call(known,row.id))throw mutationError_('CHANGE_INPUT','Calendar row revision input is invalid.',400,true);
  Object.defineProperty(known,row.id,{value:row.revision,enumerable:true});
 });
 const priorNative=calendarNativeSourceReads_;calendarNativeSourceReads_=true;
 try{
  // Reset request-local snapshots before reading permissions and content. This
  // endpoint deliberately compares the current source; it never trusts a hint.
  rc18InvalidateIO_();
  const access=calendarChangesAuthorize_(actor,payload);
  const snapshot=apiBootstrap_(actor,access.roles,{year:access.year});
  const all=snapshot.events;
  if(all.length>2000)throw mutationError_('CHANGE_CAPACITY','This year exceeds the 2,000-event live-update limit. Use manual Refresh to load it.',413,true);
  const visible=new Set(all.map(row=>String(row.EventID)));
  const events=all.filter(row=>known[String(row.EventID)]!==(row._changeRevision||row._revision));
  const removed=Object.keys(known).filter(id=>!visible.has(id));
  delete snapshot.events;
  return {year:access.year,sourceRevision:sha256_(JSON.stringify({events:all.map(row=>[row.EventID,row._changeRevision||row._revision]),snapshot:snapshot})),events:events,removed:removed,snapshot:snapshot};
 }finally{calendarNativeSourceReads_=priorNative;}
}
