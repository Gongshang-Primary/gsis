/* Read-only school date context. Existing Calendar proxy authentication applies. */
function rosterCalendarStamp_(){try{const value=JSON.parse(PropertiesService.getScriptProperties().getProperty('ROSTER_CALENDAR_REVISION')||'null');return value?.schema===1&&typeof value.ready==='boolean'&&/^[a-f0-9]{64}$/.test(value.key||'')?value:null;}catch(_){return null;}}
function rosterCalendarBeginWrite_(){
 const value={schema:1,key:sha256_(Utilities.getUuid()),updatedAt:isoNow_(),ready:false};
 PropertiesService.getScriptProperties().setProperty('ROSTER_CALENDAR_REVISION',JSON.stringify(value));return value;
}
function rosterCalendarEndWrite_(ticket){if(ticket&&rosterCalendarStamp_()?.key===ticket.key)PropertiesService.getScriptProperties().setProperty('ROSTER_CALENDAR_REVISION',JSON.stringify({...ticket,ready:true}));}
function rosterCalendarFields_(name){return {Years:['Year','ReleasedToTeachers','Status'],YearStructure:['Year','Kind','Term','Week','StartDate','EndDate','DeletedAt','Label'],Events:['Year','OwnerTag','EventType','StartDate','EndDate','Status','DeletedAt','StaffTitle']}[name]||[];}
function rosterCalendarWritesAffect_(requests,ss){
 const sheets=new Map(ss.getSheets().map(s=>[s.getSheetId(),s]));
 return requests.some(request=>{const body=request.updateCells||request.appendCells||request.deleteDimension;if(!body)return false;const sheet=sheets.get(body.sheetId??body.start?.sheetId??body.range?.sheetId),wanted=sheet&&rosterCalendarFields_(sheet.getName());if(!wanted?.length)return false;if(!request.updateCells)return true;if(body.fields&&!body.fields.includes('userEnteredValue')&&!body.fields.includes('*'))return false;
  const headers=rc18Headers_(sheet),start=body.start?.columnIndex??body.range?.startColumnIndex??0,end=body.range?(body.range.endColumnIndex??headers.length):start+Math.max(0,...(body.rows||[]).map(row=>(row.values||[]).length));
  return (body.start?.rowIndex??body.range?.startRowIndex??0)===0||headers.slice(start,end).some(field=>wanted.includes(field));
 });
}
// Manual sheet edits do not have the application's commit acknowledgement.
// Mark them dirty immediately; fresh reads remain available without certification.
function onEdit(e){
 const range=e?.range;if(!range)return;const sheet=range.getSheet(),wanted=rosterCalendarFields_(sheet.getName());if(!wanted.length)return;
 if(range.getRow()===1||rc18Headers_(sheet).slice(range.getColumn()-1,range.getColumn()-1+range.getNumColumns()).some(field=>wanted.includes(field)))rosterCalendarBeginWrite_();
}
function rosterDateKeys_(keys){
 if(!Array.isArray(keys)||!keys.length||keys.length>62||new Set(keys).size!==keys.length||keys.some(key=>typeof key!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(key)||!Number.isFinite(Date.parse(key+'T12:00:00Z'))||new Date(key+'T12:00:00Z').toISOString().slice(0,10)!==key))throw mutationError_('INVALID_DATE','Choose up to 62 unique valid dates.',400,true);
 return keys;
}
function apiRosterWindow_(payload){
 const keys=rosterDateKeys_(payload.dates);
 if(keys.some((key,i)=>i&&Date.parse(key)-Date.parse(keys[i-1])!==86400000))throw mutationError_('INVALID_DATE','Choose a consecutive Calendar window.',400,true);
 const before=rosterCalendarStamp_(),now=Date.now(),header={schema:1,from:keys[0],to:keys[keys.length-1],checkedAt:isoNow_()},cacheKey='roster-calendar-window-v1:'+CALV2.RELEASE_VERSION+':'+sha256_(JSON.stringify(keys));let cache=null,proof=null;
 try{cache=CacheService.getScriptCache();proof=JSON.parse(cache.get(cacheKey)||'null');}catch(_){}
 // Even direct Sheets/API edits without an edit trigger are observed within
 // five minutes. Conditional checks never extend the original source-read age.
 if(before?.ready!==false&&proof?.schema===1&&proof.markerKey===(before?.key||null)&&proof.sourceRevision===payload.knownRevision&&/^[a-f0-9]{64}$/.test(proof.sourceRevision)&&Number.isFinite(proof.readAt)&&now>=proof.readAt&&now-proof.readAt<300000)return {...header,sourceRevision:proof.sourceRevision,sourceCheckedAt:new Date(proof.readAt).toISOString(),updatedAt:before?.updatedAt||null,cacheable:true,unchanged:true};
 const dates=apiRosterDates_({dates:keys}).dates,after=rosterCalendarStamp_();
 if(before?.key!==after?.key||before?.ready!==after?.ready)throw mutationError_('CALENDAR_SOURCE_CHANGED','Calendar changed during this read. Retry the current view.',503,true);
 const sourceRevision=sha256_(JSON.stringify(dates.map(({checkedAt,...day})=>day))),cacheable=after?.ready!==false;
 if(cache&&cacheable)try{cache.put(cacheKey,JSON.stringify({schema:1,markerKey:after?.key||null,sourceRevision,readAt:now}),300);}catch(_){}
 return {...header,sourceRevision,sourceCheckedAt:new Date(now).toISOString(),updatedAt:after?.updatedAt||null,cacheable,dates:dates.map(day=>({...day,sourceRevision}))};
}
function apiRosterDate_(payload){
 const value=apiRosterDates_({dates:[String(payload.date||'')]}).dates[0];
 if(value.code==='YEAR_UNAVAILABLE')throw mutationError_('YEAR_UNAVAILABLE','Calendar year is not released to staff.',403,true);
 return value;
}
function apiRosterDates_(payload){
 const keys=rosterDateKeys_(payload.dates);
 const ss=SpreadsheetApp.getActiveSpreadsheet(),years=tableObjects_(ss.getSheetByName(CALV2.SHEETS.YEARS)),byYear=new Map();
 // One fresh release check and one bounded year read per year, regardless of date count.
 return {dates:keys.map(key=>{
  const year=Number(key.slice(0,4));
  if(!byYear.has(year)){
   const matches=years.filter(r=>Number(r.Year)===year),released=matches.length===1&&yes_(matches[0].ReleasedToTeachers)&&String(matches[0].Status).toUpperCase()!=='ARCHIVED';
   byYear.set(year,released?rc18YearData_(year,[CALV2.SHEETS.EVENTS,CALV2.SHEETS.YEAR_STRUCTURE]):null);
  }
  const data=byYear.get(year);return data?rosterDateContext_(key,data):{date:key,code:'YEAR_UNAVAILABLE'};
 })};
}
function rosterDateContext_(key,data){
 const n=Date.parse(key+'T12:00:00Z'),structures=data[CALV2.SHEETS.YEAR_STRUCTURE].filter(r=>!r.DeletedAt&&dateKeyInRange_(key,r.StartDate,r.EndDate));
 const weeks=structures.filter(r=>String(r.Kind).toUpperCase()==='TERM_WEEK');
 const week=weeks.length===1?weeks[0]:null,match=week&&String(week.Week||'').match(/^(?:T\d+W)?(\d+)$/i),schoolWeek=match?Number(match[1]):null;
 const parity=schoolWeek>0?(schoolWeek%2?'odd':'even'):null;
 const holidays=data[CALV2.SHEETS.EVENTS].filter(r=>!r.DeletedAt&&String(r.Status).toUpperCase()==='PUBLISHED'&&String(r.OwnerTag).toLowerCase()==='hol'&&['ALL_DAY','MULTI_DAY'].includes(String(r.EventType).toUpperCase())&&eventCoversDate_(r,key));
 const vacation=structures.filter(r=>String(r.Kind).toUpperCase()==='VACATION'),weekend=[0,6].includes(new Date(n).getUTCDay());
 const reasons=[...holidays.map(r=>String(r.StaffTitle||'Holiday')),...vacation.map(r=>String(r.Label||'School vacation')),...(weekend?['Weekend']:[])];
 return {version:CALV2.RELEASE_VERSION,date:key,term:week?String(week.Term||''):null,schoolWeek,parity,schoolDay:reasons.length?false:parity?true:null,reason:[...new Set(reasons)].join('; '),warning:weeks.length>1?'Conflicting term weeks.':!parity?'School week is not defined for this date.':'',checkedAt:isoNow_()};
}

// Compact academic boundaries for Roster Statistics. Dates come from saved term
// weeks, not assumed month boundaries; school semester grouping is configurable.
function apiRosterStatisticsCalendar_(payload){
 const current=Number(payload.year),actual=Number(Utilities.formatDate(new Date(),'Asia/Singapore','yyyy'));
 if(!Number.isInteger(current)||current<actual-20||current>actual+2)throw mutationError_('INVALID_YEAR','Choose a supported statistics year.',400,true);
 const ss=SpreadsheetApp.getActiveSpreadsheet(),years=tableObjects_(ss.getSheetByName(CALV2.SHEETS.YEARS)),terms=[];
 for(const year of [current-1,current]){
  const rows=years.filter(r=>Number(r.Year)===year);if(rows.length!==1||!yes_(rows[0].ReleasedToTeachers)||String(rows[0].Status).toUpperCase()==='ARCHIVED')continue;
  const structure=rc18YearData_(year,[CALV2.SHEETS.YEAR_STRUCTURE])[CALV2.SHEETS.YEAR_STRUCTURE],groups=new Map();
  for(const row of structure){if(row.DeletedAt||String(row.Kind).toUpperCase()!=='TERM_WEEK')continue;const term=Number(String(row.Term).replace(/^T(?:erm)?\s*/i,'')),from=dateText_(row.StartDate),to=dateText_(row.EndDate);if(!Number.isInteger(term)||term<1||term>12||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<from)continue;const prior=groups.get(term);groups.set(term,{year,term,from:prior&&prior.from<from?prior.from:from,to:prior&&prior.to>to?prior.to:to});}
  terms.push(...groups.values());
 }
 let mapping=[[1,2],[3,4]],semesterBasis='Terms 1–2 and Terms 3–4';
 const configured=PropertiesService.getScriptProperties().getProperty('ROSTER_STATS_SEMESTER_TERMS');
 if(configured){try{mapping=JSON.parse(configured);}catch(_){mapping=[];}semesterBasis='Configured term groups';}
 if(!Array.isArray(mapping)||mapping.length>4||mapping.some(g=>!Array.isArray(g)||!g.length||g.some(n=>!Number.isInteger(n)||n<1||n>12))||new Set(mapping.flat()).size!==mapping.flat().length)mapping=[];
 const semesters=[];for(const year of [current-1,current])mapping.forEach((group,index)=>{const members=group.map(term=>terms.find(t=>t.year===year&&t.term===term));if(members.every(Boolean))semesters.push({year,semester:index+1,terms:group,from:members.map(t=>t.from).sort()[0],to:members.map(t=>t.to).sort().at(-1)});});
 return {terms:terms.sort((a,b)=>a.from.localeCompare(b.from)),semesters,semesterBasis,checkedAt:isoNow_()};
}
