/* Venues coordination is optional until its two connection properties are set.
   A durable pending fence blocks reservations across independent ScriptLocks. */
function rosterVenuesConfig_(){
 const p=props_(),url=p.getProperty('VENUES_APPS_SCRIPT_URL');if(!url&&!p.getProperty('VENUES_BRIDGE_SECRET'))return null;const secret=gsisApiSecret_('VENUES_BRIDGE_SECRET');
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url||'')||!secret||secret.length<32)venuesSourceError_(503,'VENUES_SOURCE_SETUP','Set both VENUES_APPS_SCRIPT_URL and VENUES_BRIDGE_SECRET in Roster, or remove both until Venues is installed.');return {url,secret};
}
function rosterVenuesMarker_(){let marker;try{marker=JSON.parse(props_().getProperty('ROSTER_VENUES_SOURCE')||'null');}catch(_){}return marker;}
function rosterVenuesCall_(input){
 const config=rosterVenuesConfig_();if(!config)return null;
 const payload=JSON.stringify({action:'venuesService',service:'gsis-venues-v1',timestamp:Date.now(),nonce:Utilities.getUuid(),input}),signature=Utilities.computeHmacSha256Signature(payload,config.secret).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
 let response;try{const r=UrlFetchApp.fetch(config.url,{method:'post',contentType:'application/json',payload:JSON.stringify({payload,signature}),muteHttpExceptions:true});if(r.getResponseCode()!==200)throw Error('http');response=JSON.parse(r.getContentText());}catch(_){venuesSourceError_(503,'VENUES_FENCE_UNCONFIRMED','Venues coordination could not be confirmed. Keep the current plan and ask Admin to run recoverRosterVenuesSource.');}
 if(response?.ok!==true)venuesSourceError_(503,'VENUES_FENCE_UNCONFIRMED','Venues coordination is pending. Ask Admin to check the source fence before retrying.');
 const ack=response.data,valid=input.operation==='sourceBegin'?ack?.status==='pending'&&ack.pendingToken===input.token&&ack.revision===input.expectedRevision:input.operation==='sourceComplete'?ack?.revision===input.revision&&!ack.pendingToken&&['stale','ready'].includes(ack.status):false;
 if(!valid)venuesSourceError_(503,'VENUES_FENCE_UNCONFIRMED','Venues did not confirm the exact source change. Keep the source fence closed and recover it.');return ack;
}
function rosterVenuesIndexStamp_(index){return venuesSourceHash_((index.entries||[]).map(({id,modelFile,from,to,priority,pruned})=>({id,modelFile,from,to,priority,pruned:!!pruned})));}
function rosterVenuesPlanStamp_(plan,row,revision){
 // Only the server-owned stored validation proof may avoid inflation. Request
 // plans are plain values and still hash their actual accepted contents.
 const packed=typeof rosterPlanPacked_!=='undefined'?rosterPlanPacked_.get(plan):null,proof=packed?.validation;
 if(packed?.encoding==='gzip-base64-v1'&&proof?.version===GSISRosterStapler.validationVersion&&proof.date===row.date&&proof.baselineId===row.baselineId&&proof.revision===revision&&/^[a-f0-9]{64}$/.test(proof.digest||''))return proof.digest;
 return venuesSourceHash_(plan);
}
function rosterVenuesOperationsStamp_(state,legacy=false){
 // Draft edits, absences and notification receipts do not change published room use.
 const plans=(state.staplerPlans||[]).map(r=>{const c=GSISRosterOperations.confirmedStaplerSnapshot(r,state.audit);return c?[r.date,r.baselineId,c.revision,legacy?c.plan:rosterVenuesPlanStamp_(c.plan,r,c.revision)]:r.confirmed?[r.date,r.baselineId,'unproven-confirmation']:null;}).filter(Boolean);
 return (legacy?'':'v2:')+venuesSourceHash_([plans,state.dailyPublicationStates||{},state.nameBridges||[]]);
}
function rosterVenuesBegin_(kind,value){
 if(!rosterVenuesConfig_())return null;let prior=rosterVenuesMarker_();
 const field=kind==='index'?'indexStamp':'operationsStamp',stamp=kind==='index'?rosterVenuesIndexStamp_(value):rosterVenuesOperationsStamp_(value);
 if(prior&&prior.status!=='ready'){
  // A failed Venues refresh must not prevent absence reporting or unrelated
  // audit/delivery work. Only a changed occupancy source needs the fence.
  const actual=kind==='index'?rosterVenuesIndexStamp_(rosterIndex_()):rosterVenuesOperationsStamp_(rosterOperationsState_(true));
  if(actual===stamp)return null;
  venuesSourceError_(503,'VENUES_FENCE_PENDING','The previous timetable source change needs recovery. Ask Admin to run recoverRosterVenuesSource.');
 }
 if(prior?.[field]===stamp)return null;
 // Upgrade an unchanged old marker locally once. Its old full-content hash is
 // the proof that no occupancy changed; changed content still closes the fence.
 if(kind==='operations'&&prior?.status==='ready'&&!String(prior.operationsStamp||'').startsWith('v2:')&&prior.operationsStamp===rosterVenuesOperationsStamp_(value,true)){
  props_().setProperty('ROSTER_VENUES_SOURCE',JSON.stringify({...prior,operationsStamp:stamp}));return null;
 }
 if(!prior)prior={schema:1,status:'ready',revision:'',indexStamp:rosterVenuesIndexStamp_(rosterIndex_()),operationsStamp:rosterVenuesOperationsStamp_(rosterOperationsState_(true))};
 const ticket={...prior,[field]:stamp,status:'pending',token:Utilities.getUuid(),previous:prior.revision,updatedAt:new Date().toISOString()};
 props_().setProperty('ROSTER_VENUES_SOURCE',JSON.stringify(ticket));
 rosterVenuesCall_({operation:'sourceBegin',source:'roster',token:ticket.token,expectedRevision:ticket.previous});return ticket;
}
function rosterVenuesEnd_(ticket){
 if(!ticket)return;
 const committed={...ticket,status:'committed',revision:ticket.token,updatedAt:new Date().toISOString()};props_().setProperty('ROSTER_VENUES_SOURCE',JSON.stringify(committed));
 rosterVenuesCall_({operation:'sourceComplete',source:'roster',token:ticket.token,revision:ticket.token});
 props_().setProperty('ROSTER_VENUES_SOURCE',JSON.stringify({...committed,status:'ready'}));
}
function recoverRosterVenuesSource(){
 gsisRequireBackendRole_('roster');if(!rosterVenuesConfig_())venuesSourceError_(503,'VENUES_SOURCE_SETUP','Configure the Venues connection first.');
 const lock=LockService.getScriptLock();if(!lock.tryLock(8000))venuesSourceError_(503,'VENUES_SOURCE_BUSY','A Roster save is finishing. Retry recovery.');
 try{
  const index=rosterIndex_(),state=rosterOperationsState_(true),prior=rosterVenuesMarker_();
  // Reading and validating both actual documents under the writer lock is the
  // recovery proof. An incomplete/corrupt document never clears the fence.
  const ticket={schema:1,status:prior?.status==='committed'?'committed':'pending',token:prior&&prior.status!=='ready'?prior.token:Utilities.getUuid(),previous:prior&&prior.status!=='ready'?prior.previous:prior?.revision||'',indexStamp:rosterVenuesIndexStamp_(index),operationsStamp:rosterVenuesOperationsStamp_(state),updatedAt:new Date().toISOString()};
  props_().setProperty('ROSTER_VENUES_SOURCE',JSON.stringify(ticket));if(prior?.status!=='committed')rosterVenuesCall_({operation:'sourceBegin',source:'roster',token:ticket.token,expectedRevision:ticket.previous});rosterVenuesEnd_(ticket);
  return {ready:true,sourceRevision:ticket.token,note:'Run syncVenuesSources in the Venues project to activate verified occupancy.'};
 }finally{lock.releaseLock();}
}
function rosterVenuesSource_(envelope){
 if(typeof rosterEdgeAssertLegacyWrite_==='function')rosterEdgeAssertLegacyWrite_();
 gsisRequireBackendRole_('roster');const input=venuesSourceReadInput_(venuesSourceAuthenticate_(envelope,'roster'),['from','to','calendarDates']);
 if(!rosterVenuesConfig_())venuesSourceError_(503,'VENUES_SOURCE_SETUP','Enable Roster to Venues coordination before reading occupancy.');
 const marker=rosterVenuesMarker_();if(marker?.status!=='ready'||!marker.revision)venuesSourceError_(503,'VENUES_FENCE_PENDING','Run recoverRosterVenuesSource before refreshing Venues.');
 const sourceKey=venuesSourceHash_([2,'occupying-staff-names',marker.revision]);if(input.operation==='manifest')return venuesSourceResult_('roster',sourceKey,input,{},marker.updatedAt);
 const from=GSISRoster.date(input.from),to=GSISRoster.date(input.to),count=(Date.parse(to)-Date.parse(from))/86400000+1;
 if(!Number.isInteger(count)||count<1||count>366||!Array.isArray(input.calendarDates)||input.calendarDates.length!==count)venuesSourceError_(400,'VENUES_SOURCE_INPUT','Supply verified Calendar context for every selected date, up to 366 days.');
 const calendar=new Map(input.calendarDates.map(d=>[d.date,d]));if(calendar.size!==count)venuesSourceError_(400,'VENUES_SOURCE_INPUT','Calendar dates must be unique.');
 const index=rosterIndex_(),state=rosterOperationsState_(true),models=new Map(),dayPatterns=new Map(),patterns={},days=[],periodSets=new Map();
 for(let n=0;n<count;n++){
  const date=new Date(Date.parse(from+'T00:00:00Z')+n*86400000).toISOString().slice(0,10),context=calendar.get(date),entry=GSISRoster.active(index.entries,date),confirmed=GSISRosterOperations.confirmedStaplerSnapshot((state.staplerPlans||[]).find(r=>r.date===date),state.audit);
  if(!context||typeof context.schoolDay!=='boolean'||context.code){days.push({date,covered:false,patternId:'',code:'CALENDAR_UNCOVERED'});continue;}
  if(!entry&&!confirmed){days.push({date,covered:false,patternId:'',code:'TIMETABLE_BASELINE_MISSING'});continue;}
  if(entry&&!models.has(entry.id))models.set(entry.id,rosterModel_(entry));const model=entry?models.get(entry.id):null,periods=(confirmed?confirmed.plan.periods:rosterTimetableBatchPeriods_(model)).map(p=>({id:'P'+p.period,label:'P'+p.period,start:p.startMinutes,end:p.endMinutes}));periodSets.set(JSON.stringify(periods),periods);
  let result=[];try{if(context.schoolDay||confirmed){const dated=state.dailyPublicationStates?.[date]||(state.staplerPlans||[]).some(r=>r.date===date&&(r.confirmed||r.published||r.confirmedPlan)),key=JSON.stringify([entry?.id||confirmed.plan.baselineId,context.parity,new Date(date+'T12:00:00Z').getUTCDay(),dated?date:'']);if(!dayPatterns.has(key))dayPatterns.set(key,rosterVenuesDay_(model,entry,state,date,context.parity));result=dayPatterns.get(key);}}catch(e){days.push({date,covered:false,patternId:'',code:e.code||'TIMETABLE_UNVERIFIED'});continue;}
  const patternId=venuesSourceHash_(result);patterns[patternId]=result;days.push({date,covered:true,patternId});
 }
 // Different period definitions require separate client grids. Fail closed until
 // the active school-year register is made consistent; do not truncate a day.
 if(periodSets.size>1)venuesSourceError_(503,'VENUES_PERIODS_AMBIGUOUS','The selected year has different period timings. Review the baseline register.');
 const after=rosterVenuesMarker_();if(after?.status!=='ready'||after.revision!==marker.revision)venuesSourceError_(409,'VENUES_SOURCE_CHANGED','Roster changed while preparing occupancy.');
 return venuesSourceResult_('roster',sourceKey,input,{periods:[...periodSets.values()][0]||[],days,patterns},marker.updatedAt);
}
function rosterVenuesDay_(model,entry,state,date,parity){
 const record=(state.staplerPlans||[]).find(r=>r.date===date),confirmed=GSISRosterOperations.confirmedStaplerSnapshot(record,state.audit),publication=state.dailyPublicationStates?.[date];
 const dow=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7,week=model?(model.layoutMode==='single-week'?model.single:model[parity]):null;
 if(!confirmed&&(dow>4||!week))venuesSourceError_(503,'VENUES_DAY_UNVERIFIED','The school day has no verified timetable week.');
 if(record?.confirmed&&!confirmed)venuesSourceError_(503,'VENUES_DAY_UNVERIFIED','The suspended plan requires reconfirmation.');
 const periodRows=(confirmed?confirmed.plan.periods:rosterTimetableBatchPeriods_(model)).map(p=>({period:p.period,start:p.start,end:p.end,startMinutes:p.startMinutes,endMinutes:p.endMinutes})),normalize=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' '),identities=new Map();
 const identify=(name,id)=>{if(!name||!id)return;const key=normalize(name),old=identities.get(key);if(old&&old!==id)venuesSourceError_(503,'VENUES_IDENTITY_AMBIGUOUS','Timetable identities need review.');identities.set(key,id);};
 for(const bridge of state.nameBridges||[])identify(bridge.timetableName,bridge.staffId);
 for(const teacher of confirmed?.plan?.teachers||[])identify(teacher.timetableName||teacher.name,teacher.staffId);
 // Publications keep Contacts names, which may include honorifics or employment
 // suffixes. Reuse Roster's identity rules without mutating the source state.
 const publishedPeople=(publication?.teachers||[]).filter(t=>t.name).map(t=>({id:t.staffId,name:t.name}));
 for(const match of GSISRosterOperations.matchTimetableNames({...state,nameBridgesSeeded:true},publishedPeople,week?.blocks||[]))identify(match.timetableName,match.person.id);
 const base={id:entry?.id,date,periods:periodRows,teachers:(week?.blocks||[]).map((b,i)=>({staffId:identities.get(normalize(b.name))||'unmatched:'+i,name:b.name,timetableName:b.name,cells:b.cells.slice(dow*week.perDay,(dow+1)*week.perDay)}))};
 let teachers=base.teachers,label='Timetable';
 if(confirmed){if(confirmed.plan.date!==date||confirmed.plan.baselineId!==record.baselineId)venuesSourceError_(503,'VENUES_DAY_UNVERIFIED','The suspended plan identity needs review.');teachers=GSISRosterStapler.effectiveDay(confirmed.plan,base).teachers;label='Confirmed timetable';}
 const usePublication=publication&&(!confirmed||publication.staplerRevision===confirmed.revision);
 if(usePublication){
  if(publication.baselineId!==(confirmed?record.baselineId:entry?.id)||JSON.stringify(publication.periods)!==JSON.stringify(periodRows))venuesSourceError_(503,'VENUES_DAY_UNVERIFIED','The published timetable uses a different baseline or timing.');
  const changes=new Map((publication.teachers||[]).map(t=>[t.staffId,t]));teachers=teachers.map(t=>changes.has(t.staffId)?{...t,cells:changes.get(t.staffId).cells}:t);for(const row of changes.values())if(!teachers.some(t=>t.staffId===row.staffId))teachers.push(row);
 }
 const intervals=[],seen=new Map(),add=(venue,p,name='')=>{venue=String(venue||'').trim();if(!venue)return;if(/[\n\r]/.test(venue))venuesSourceError_(503,'VENUES_ALIAS_AMBIGUOUS','A multiline venue needs explicit mapping.');const period=periodRows[p];if(!period)venuesSourceError_(503,'VENUES_DAY_UNVERIFIED','A lesson has invalid timing.');if(typeof name!=='string')venuesSourceError_(503,'VENUES_DAY_UNVERIFIED','An occupying staff name is invalid.');name=name.trim().replace(/\s+/g,' ');if(name.length>200||/[\u0000-\u001f\u007f]/.test(name))venuesSourceError_(503,'VENUES_DAY_UNVERIFIED','An occupying staff name is invalid.');for(const alias of venue.split(/\s+\+\s+/).map(x=>x.trim()).filter(Boolean)){const key=alias+'|'+p;let interval=seen.get(key);if(!interval){interval={venueAlias:alias,start:period.startMinutes,end:period.endMinutes,sourceId:'period:'+p,kind:'timetable',label,staffNames:[]};seen.set(key,interval);intervals.push(interval);}if(name&&!interval.staffNames.includes(name)){if(interval.staffNames.length>=200)venuesSourceError_(503,'VENUES_DAY_UNVERIFIED','Too many occupying staff names.');interval.staffNames.push(name);}}};
 for(const teacher of teachers){if(!Array.isArray(teacher.cells)||teacher.cells.length!==periodRows.length)venuesSourceError_(503,'VENUES_DAY_UNVERIFIED','A timetable row is incomplete.');teacher.cells.forEach((cell,p)=>{if(!Array.isArray(cell)||cell.length!==4)venuesSourceError_(503,'VENUES_DAY_UNVERIFIED','A timetable cell is invalid.');if(cell.some(v=>String(v).trim())&&cell[2])add(cell[2],p,teacher.name||teacher.timetableName||'');else if(cell[0]&&!/^(?:absent|no relief required|free)$/i.test(cell[0].trim())&&(cell[1]||cell[3]))venuesSourceError_(503,'VENUES_ALIAS_MISSING','A class lesson has no verified venue.');});}
 // Published demand remains occupied when an absent teacher has no replacement.
 if(usePublication)for(const row of publication.publicReliefRows||[])if(['unassigned','no-relief'].includes(row.status))add(row.venue,row.period);
 for(const interval of intervals)interval.staffNames.sort();return intervals.sort((a,b)=>a.start-b.start||a.venueAlias.localeCompare(b.venueAlias));
}
