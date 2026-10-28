/** Contacts-owned birthday reconciliation. Network reads occur before the
 * Calendar write lock. Source ownership is stored in protected CreatedBy plus
 * a deterministic EventID; no workbook schema or manual event is repurposed. */
function calendarBirthdaySource_(actor) {
  const props=PropertiesService.getScriptProperties();
  const url=String(props.getProperty('CONTACTS_APPS_SCRIPT_URL')||'').trim();
  const secret=String(gsisApiSecret_('CONTACTS_BRIDGE_SECRET')||'');
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)||secret.length<32) {
    throw mutationError_('CONTACTS_NOT_CONFIGURED','Set CONTACTS_APPS_SCRIPT_URL and CONTACTS_BRIDGE_SECRET in Calendar Script Properties. No birthday was changed.',503,true);
  }
  const payload=JSON.stringify({action:'calendarBirthdays',identity:{email:actor.email,subject:actor.sub},input:{},timestamp:Date.now(),nonce:Utilities.getUuid()});
  const signature=Utilities.computeHmacSha256Signature(payload,secret).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
  let response,body;
  try {
    response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify({payload:payload,signature:signature}),muteHttpExceptions:true,followRedirects:true});
    const text=response.getContentText();
    if(response.getResponseCode()!==200||text.length>1000000)throw Error('Unexpected source response');
    body=JSON.parse(text);
  } catch(ignored) {
    throw mutationError_('CONTACTS_UNAVAILABLE','Contacts could not be read. No birthday was changed. Try Update birthdays from Contacts again.',503,true);
  }
  if(!body||body.ok!==true||!body.data)throw mutationError_('CONTACTS_UNAVAILABLE','Contacts did not provide a complete birthday source. Check your Contacts access and retry. No birthday was changed.',503,true);
  return calendarBirthdayValidateSource_(body.data);
}

function calendarBirthdayValidateSource_(source) {
  if(!source||source.schema!==1||source.complete!==true||source.authoritative!==true||!Array.isArray(source.people)||source.count!==source.people.length||source.people.length>5000||typeof source.revision!=='string'||!source.revision||!Number.isFinite(source.observedAt)||source.observedAt<Date.now()-120000||source.observedAt>Date.now()+300000) {
    throw mutationError_('INCOMPLETE_BIRTHDAY_SOURCE','Contacts birthday source is incomplete or stale. No birthday was changed.',409,true);
  }
  const seen=new Set();
  for(const p of source.people) {
    if(!p||typeof p.id!=='string'||!p.id.trim()||p.id.length>256||seen.has(p.id)||['name','active','mk','day','month'].some(k=>typeof p[k]!=='string'))throw mutationError_('INVALID_BIRTHDAY_IDENTITY','Contacts birthday identity is missing or duplicated. No birthday was changed.',409,true);
    seen.add(p.id);
  }
  return source;
}
function calendarBirthdayId_(staffId,year) {return 'BDAY-'+year+'-'+sha256_('gsis-contacts-birthday-v1\n'+staffId).slice(0,40);}
function calendarBirthdayMarker_(staffId) {return 'CONTACTS-BIRTHDAY-V1|'+encodeURIComponent(staffId);}
function calendarBirthdayOwner_(event) {
  const marker=String(event.CreatedBy||'');
  if(!marker.startsWith('CONTACTS-BIRTHDAY-V1|'))return '';
  let id;try{id=decodeURIComponent(marker.slice(21));}catch(ignored){return '';}
  return id&&event.EventID===calendarBirthdayId_(id,Number(event.Year))?id:'';
}
function calendarBirthdayEligibility_(person,year) {
  const name=person.name.trim(),active=person.active.trim().toUpperCase(),mk=person.mk.trim();
  if(!['Y','N'].includes(active))return {kind:'skip',reason:'invalid active status'};
  if(active==='N'||mk&&!/^(?:N|NO|FALSE)$/i.test(mk))return {kind:'remove',reason:'not eligible'};
  const day=person.day.trim(),month=person.month.trim();
  // Only two explicitly empty fields represent an intentional birthday clear.
  if(!day&&!month)return {kind:'remove',reason:'birthday cleared'};
  if(!name||!/^\d{1,2}$/.test(day)||!/^\d{1,2}$/.test(month))return {kind:'skip',reason:'incomplete birthday'};
  const d=Number(day),m=Number(month),max=new Date(Date.UTC(year,m,0)).getUTCDate();
  if(m<1||m>12||d<1||d>max)return {kind:'skip',reason:'invalid birthday for year'};
  return {kind:'event',name:name,date:String(year)+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')};
}

function calendarBirthdayPlan_(source,events,year,config,visibility) {
  calendarBirthdayValidateSource_(source);
  const lanes=(config.lanes||[]).filter(l=>yes_(l.Active)&&String(l.LaneID)==='day');
  const tags=(config.tags||[]).filter(t=>yes_(t.Active)&&String(t.Tag).toUpperCase()==='SWC');
  if(lanes.length!==1||tags.length!==1)throw mutationError_('BIRTHDAY_CATEGORY_MISSING','The existing Day column and SWC tag must be active. No new category was created.',409,true);
  const byId=new Map(),owned=new Map(),people=new Set(source.people.map(p=>p.id));
  for(const e of events) {
    if(Number(e.Year)!==year)continue;
    if(byId.has(e.EventID))throw mutationError_('BIRTHDAY_EVENT_DUPLICATE','Calendar event identity is duplicated. Ask an Admin to review it.',409,true);
    byId.set(e.EventID,e);const owner=calendarBirthdayOwner_(e);if(owner)owned.set(owner,e);
  }
  const plan={created:0,updated:0,removed:0,skipped:0,unchanged:0,changes:[]};
  for(const p of source.people) {
    const decision=calendarBirthdayEligibility_(p,year),id=calendarBirthdayId_(p.id,year),before=owned.get(p.id);
    if(decision.kind==='skip'){plan.skipped++;continue;}
    if(byId.has(id)&&!before)throw mutationError_('BIRTHDAY_OWNERSHIP_CONFLICT','A birthday identity belongs to a manual or unverified event. No event was replaced.',409,true);
    if(decision.kind==='remove') {
      if(before&&!before.DeletedAt){plan.removed++;plan.changes.push({kind:'remove',before:before});}else plan.skipped++;
      continue;
    }
    const fields={EventID:id,Year:year,Status:before?before.Status:visibility,LaneID:String(lanes[0].LaneID),OwnerTag:String(tags[0].Tag),ShiftSpan:'NONE',StaffTitle:'Happy Bday '+decision.name,EventType:'ALL_DAY',StartDate:decision.date,EndDate:decision.date,StartTime:'',EndTime:'',DeletedAt:''};
    if(before&&!before.DeletedAt&&Object.keys(fields).every(k=>String(before[k]??'')===String(fields[k]))) {plan.unchanged++;continue;}
    const event=Object.assign({StaffDescription:'',Location:'',ParentEnabled:'No',ParentTitle:'',ParentDescription:''},before||{},fields);
    event.CreatedBy=calendarBirthdayMarker_(p.id);
    plan.changes.push({kind:before?'update':'create',before:before||null,event:event});
    if(before)plan.updated++;else plan.created++;
  }
  // Missing people are not proof of an intentional clear. Keep their owned
  // events for review rather than treating an incomplete identity as deletion.
  for(const [id,event]of owned)if(!people.has(id)&&!event.DeletedAt)plan.skipped++;
  return plan;
}

function calendarBirthdayReceipt_(log,actor,identity) {
  const hit=mutationLookup_(log,identity.operationId);
  if(!hit)return null;
  mutationCheckIdentity_(hit.object,actor,'pullBirthdays',identity.hash);
  if(hit.object.State==='COMMITTED')return JSON.parse(hit.object.ResultJSON);
  if(hit.object.State==='REJECTED')return unwrapMutationOutcome_(mutationOutcome_(hit.object));
  throw mutationError_('UNKNOWN','Birthday update status is not confirmed. Retry the same update to check its receipt. Do not start another update.',503,false);
}
function calendarBirthdayRows_(sheet,field,value) {
  const column=rc18Headers_(sheet).indexOf(field)+1;
  if(!column)throw new Error('Calendar source column is missing: '+field);
  rc18IO_().metrics.keySearches++;
  const rows=sheet.getRange(rc18Column_(column)+'2:'+rc18Column_(column)).createTextFinder(String(value)).matchEntireCell(true).useRegularExpression(false).matchCase(true).findAll().map(cell=>cell.getRow());
  const hits=rc18Rows_(sheet,rows);
  if(hits.some(hit=>String(hit.object[field])!==String(value)))throw mutationError_('BIRTHDAY_READ_CHANGED','Calendar rows changed during the birthday read. Retry without discarding your work.',409,true);
  return hits;
}
function apiPullBirthdays_(actor,payload,requestId) {
  const year=Number(payload.year);
  if(!Number.isInteger(year)||year<2000||year>2100)throw mutationError_('INVALID_YEAR','Choose a valid Calendar year.',400,true);
  const identity=mutationIdentity_(actor,'pullBirthdays',{year:year,operationId:payload.operationId});
  const log=mutationSheet_(),prior=calendarBirthdayReceipt_(log,actor,identity);
  if(prior)return prior;
  // The source call is deliberately outside the Calendar writer lock.
  const source=calendarBirthdayValidateSource_(calendarBirthdaySource_(actor));
  return withRC17WriteLock_(()=>{
    const previous=calendarBirthdayReceipt_(log,actor,identity);if(previous)return previous;
    const yearRow=yearsCached_().find(y=>Number(y.Year)===year);
    if(!yearRow||String(yearRow.Status).toUpperCase()==='ARCHIVED')throw mutationError_('YEAR_UNAVAILABLE','This Calendar year is missing or archived.',409,true);
    rc18AssertNoPendingEvent_('',identity.operationId,year,true);
    const receipts=calendarBirthdayRows_(log,'Action','pullBirthdays').filter(h=>h.object.State==='COMMITTED');
    for(const hit of receipts){let value;try{value=JSON.parse(hit.object.ResultJSON);}catch(ignored){continue;}if(Number(value.year)===year&&(Number(value.sourceObservedAt)>source.observedAt||Number(value.sourceObservedAt)===source.observedAt&&value.sourceRevision!==source.revision))throw mutationError_('STALE_BIRTHDAY_SOURCE','A newer Contacts birthday snapshot was already applied. Retry with the current source.',409,true);}
    const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CALV2.SHEETS.EVENTS);
    const hits=calendarBirthdayRows_(sheet,'Year',year),hitById=new Map(hits.map(h=>[h.object.EventID,h]));
    const plan=calendarBirthdayPlan_(source,hits.map(h=>h.object),year,configCached_(),defaultEventVisibilityFromYearStatus_(yearRow.Status));
    const now=isoNow_(),changes=plan.changes.map(change=>{
      const before=change.before;
      if(change.kind==='remove')return {kind:change.kind,before:before,event:Object.assign({},before,{DeletedAt:now,UpdatedAt:now,UpdatedBy:actor.userAlias,LastMutationID:identity.operationId,StaffSyncState:'PENDING_REMOVAL',ParentSyncState:'PENDING_REMOVAL'})};
      const event=validateEvent_(change.event,before);
      Object.assign(event,{CreatedAt:before?before.CreatedAt:now,CreatedBy:change.event.CreatedBy,UpdatedAt:now,UpdatedBy:actor.userAlias,LastMutationID:identity.operationId,DeletedAt:'',StaffCalendarEventId:before?before.StaffCalendarEventId:'',StaffSyncHash:before?before.StaffSyncHash:'',ParentCalendarEventId:before?before.ParentCalendarEventId:'',ParentSyncHash:before?before.ParentSyncHash:'',LastSyncedAt:before?before.LastSyncedAt:''});
      event.StaffSyncState=calendarApiSourceLinked_('staff',event)||staffDesiredNowForEvent_(event)?'PENDING_SYNC':'SYNCED';
      event.ParentSyncState=yes_(event.ParentEnabled)||calendarApiSourceLinked_('parent',event)?'PENDING_SYNC':'SYNCED';
      return {kind:change.kind,before:before,event:event};
    });
    const result={year:year,created:plan.created,updated:plan.updated,removed:plan.removed,skipped:plan.skipped,unchanged:plan.unchanged,sourceRevision:source.revision,sourceObservedAt:source.observedAt,operationId:identity.operationId};
    const record={OperationID:identity.operationId,UserAlias:actor.userAlias,Action:'pullBirthdays',PayloadHash:identity.hash,State:'DISPATCHED',EventID:'YEAR:'+year,CreatedAt:now,UpdatedAt:now};
    try {
      mutationWrite_(log,record);
      return rc18Atomic_(()=>{
        for(const change of changes)rc18SaveObject_(sheet,CALV2.HEADERS.Events,hitById.get(change.event.EventID)||null,change.event);
        // Sheets limits one cell to 50,000 characters. Keep a bounded sample
        // plus a digest of every changed identity; exact counts and per-event
        // LastMutationID remain on each native event row. The success receipt
        // is flushed only after every event and the audit write completes.
        const eventIds=changes.map(c=>c.event.EventID).sort();
        appendAudit_(actor,'PULL_CONTACTS_BIRTHDAYS','Year',String(year),null,{...result,eventIdsTotal:eventIds.length,eventIds:eventIds.slice(0,50),eventIdsTruncated:eventIds.length>50,eventIdsSha256:sha256_(JSON.stringify(eventIds))},requestId);
        record.State='COMMITTED';record.ResultJSON=JSON.stringify(result);mutationWrite_(log,record);
        return result;
      });
    } catch(err) {
      if(err.code==='WRITE_BATCH_TOO_LARGE'){rejectMutation_(log,record,err);throw err;}
      rc18InvalidateIO_();
      try{const receipt=calendarBirthdayReceipt_(log,actor,identity);if(receipt)return receipt;}catch(ignored){}
      throw mutationError_('UNKNOWN','Birthday update status is not confirmed. Retry the same update to check its receipt.',503,false);
    } finally {invalidateCalendarCaches_();}
  },true);
}
