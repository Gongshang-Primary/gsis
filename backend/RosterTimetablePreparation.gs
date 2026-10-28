/* Native timetable preparation only. Reads Google sources; never changes source
   ownership, plans, receipts, properties, queues or Cloudflare configuration. */
function rosterTimetablePreparationFail_(code,message,status){throw Object.assign(Error(message),{code,status:status||503});}
function rosterTimetablePreparationStable_(value){
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(rosterTimetablePreparationStable_).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+rosterTimetablePreparationStable_(value[key])).join(',')+'}';
 rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_INVALID','The source contains unsupported timetable values.');
}
function rosterTimetablePreparationHash_(value){return rosterOperationsPlanDigest_(typeof value==='string'?value:rosterTimetablePreparationStable_(value));}
function rosterTimetablePreparationPick_(value,keys){const out={};for(const key of keys){if(!Object.prototype.hasOwnProperty.call(value||{},key))rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_INVALID','The saved timetable is missing a required schedule field.');out[key]=value[key];}return out;}
function rosterTimetablePreparationPeriods_(rows){return rows.map(row=>rosterTimetablePreparationPick_(row,['period','startMinutes','endMinutes']));}
function rosterTimetablePreparationTeachers_(rows){return rows.map(row=>rosterTimetablePreparationPick_(row,['staffId','name','timetableName']));}
function rosterTimetablePreparationClasses_(rows){return rows.map(row=>({id:row.id,name:row.name,level:row.level??null,traditional:row.traditional===true,venue:row.venue||''}));}
function rosterTimetablePreparationCategories_(value){
 const out={};for(const [key,category] of Object.entries(value||{})){if(!key||key.length>500||['__proto__','constructor','prototype'].includes(key)||!['Teaching','FTT','Non-teaching','Unclassified'].includes(category))rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_INVALID','A saved timetable activity category needs review before preparation.');out[key]=category;}return out;
}
function rosterTimetablePreparationTiles_(rows){return rows.map(row=>{
 const out=rosterTimetablePreparationPick_(row,['id','kind','teacherId','classIds','period','location','subject','venue','group','baselineId']);
 if(Object.prototype.hasOwnProperty.call(row,'durationMinutes'))out.durationMinutes=row.durationMinutes;
 // Keep the domain's source field order before validation: its legacy recess
 // comparison uses JSON.stringify against this exact native source shape.
 out.source=rosterTimetablePreparationPick_(row.source,['teacherId','classIds','period','subject','venue','group']);return out;
});}
function rosterTimetablePreparationPlan_(plan,revision){
 const source=GSISRosterOperations.confirmedStaplerProjection(plan),base=source.baseline;
 const project=value=>({parity:value.parity,endOfDayMinutes:value.endOfDayMinutes,venues:value.venues.slice(),tiles:rosterTimetablePreparationTiles_(value.tiles),teachers:rosterTimetablePreparationTeachers_(value.teachers),classes:rosterTimetablePreparationClasses_(value.classes),periods:rosterTimetablePreparationPeriods_(value.periods),subjectCategories:rosterTimetablePreparationCategories_(value.subjectCategories),recessDefaults:value.recessDefaults.map(r=>rosterTimetablePreparationPick_(r,['level','startMinutes','endMinutes']))});
 const out={schema:1,date:source.date,baselineId:source.baselineId,parity:source.parity,endOfDayMinutes:source.endOfDayMinutes,venues:source.venues.slice(),status:'draft',revision,nextId:source.nextId,periods:rosterTimetablePreparationPeriods_(source.periods),teachers:rosterTimetablePreparationTeachers_(source.teachers),classes:rosterTimetablePreparationClasses_(source.classes),subjectCategories:rosterTimetablePreparationCategories_(source.subjectCategories),tiles:rosterTimetablePreparationTiles_(source.tiles),mats:(source.mats||[]).map(mat=>({...rosterTimetablePreparationPick_(mat,['target','targetId','fromPeriod','toPeriod']),reason:'Suspended'})),warnings:[],recessDefaults:source.recessDefaults.map(r=>rosterTimetablePreparationPick_(r,['level','startMinutes','endMinutes'])),baseline:project(base)};
 GSISRosterStapler.validate(out);return out;
}
function rosterTimetablePreparationProjection_(plan){
 const day=GSISRosterStapler.effectiveDay(plan);
 return {date:day.date,baselineId:day.id,parity:day.parity,endOfDayMinutes:day.endOfDayMinutes,periods:rosterTimetablePreparationPeriods_(day.periods),teachers:day.teachers.map(row=>({...rosterTimetablePreparationPick_(row,['staffId','name','timetableName']),cells:row.cells})),classes:rosterTimetablePreparationClasses_(plan.classes),recesses:day.staplerRecesses};
}
function rosterTimetablePreparationBaselineHashes_(model){
 const periods=Array.from({length:model.maxPeriod+1},(_,period)=>({period,startMinutes:model.timing.startMinutes+period*model.timing.periodMinutes,endMinutes:model.timing.startMinutes+(period+1)*model.timing.periodMinutes})),out={};
 for(const key of model.layoutMode==='single-week'?['single']:['odd','even']){const week=model[key];out[key]=Array.from({length:5},(_,day)=>rosterTimetablePreparationHash_({periods,teachers:week.blocks.map(row=>({name:row.name,cells:row.cells.slice(day*week.perDay,(day+1)*week.perDay)}))}));}return out;
}
function rosterTimetablePreparationSnapshot_(from,to){
 const index=rosterIndex_(),state=rosterOperationsState_(true),baselineMap=Array.from({length:31},(_,n)=>{const date=new Date(Date.parse(from+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);return {date,baselineId:GSISRoster.active(index.entries,date)?.id||null};}),ids=new Set(baselineMap.map(row=>row.baselineId).filter(Boolean));
 const entries=index.entries.filter(row=>ids.has(row.id)&&!row.pruned).map(row=>{
  if(typeof row.id!=='string'||!row.id||row.id.length>500||typeof row.name!=='string'||!row.name||row.name.length>160||typeof row.modelFile!=='string'||!row.modelFile||!Number.isSafeInteger(row.priority)||row.priority<0)rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_INVALID','Baseline metadata needs review before preparation.');
  GSISRoster.date(row.from);GSISRoster.date(row.to);return {entry:rosterTimetablePreparationPick_(row,['id','name','from','to','priority']),modelFile:row.modelFile};
 }).sort((a,b)=>a.entry.id<b.entry.id?-1:a.entry.id>b.entry.id?1:0);
 if(new Set(entries.map(row=>row.entry.id)).size!==entries.length||entries.length>31)rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_INVALID','Baseline identities are duplicated or exceed the date window.');
 const seen=new Set(),suspended=[];
 for(const row of state.staplerPlans||[]){if(row.date<from||row.date>to)continue;if(seen.has(row.date))rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_INVALID','More than one saved suspended timetable uses the same date.');seen.add(row.date);
  const confirmed=GSISRosterOperations.confirmedStaplerSnapshot(row,state.audit||[]);if(!confirmed){if(row.confirmed===true)rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_CONFIRMATION','A suspended timetable has an unproven confirmation. Review its saved confirmation before exporting.');continue;}
  if(confirmed.plan.date!==row.date||confirmed.plan.baselineId!==row.baselineId)rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_INVALID','A confirmed suspended timetable has inconsistent source identity.');
  const at=confirmed.at||null;if(at!==null&&(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(at)||new Date(at).toISOString()!==at))rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_INVALID','A confirmed timetable timestamp needs review.');
  suspended.push({date:row.date,name:String(row.name||''),baselineId:confirmed.plan.baselineId,revision:confirmed.revision,confirmedAt:at,independentBaseline:true,plan:rosterTimetablePreparationPlan_(confirmed.plan,confirmed.revision)});
 }
 suspended.sort((a,b)=>a.date.localeCompare(b.date));return {baselineMap,entries,suspended};
}
function rosterTimetablePreparationBaseline_(row){
 const raw=rosterReadFile_(row.modelFile);if(typeof raw!=='string'||raw.length>4*1024*1024||Utilities.newBlob(raw,'application/json').getBytes().length>4*1024*1024)rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_SIZE','A native baseline source exceeds 4 MiB.',413);
 const model=GSISRoster.validate(JSON.parse(raw));return {schema:'gsis.timetable.preparation.baseline',version:1,id:row.entry.id,entry:row.entry,model,expectedProjectionHashes:rosterTimetablePreparationBaselineHashes_(model)};
}
function rosterTimetablePreparationBuild_(partId){
 const from=GSISRoster.date(rosterToday_()),to=new Date(Date.parse(from+'T00:00:00Z')+30*86400000).toISOString().slice(0,10),before=rosterTimetablePreparationSnapshot_(from,to),parts=[];let selected=null,total=0;
 const add=(id,kind,payload)=>{const data=rosterTimetablePreparationStable_(payload),bytes=Utilities.newBlob(data,'application/json').getBytes().length;if(bytes>4*1024*1024)rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_SIZE','A timetable part exceeds 4 MiB. Split or review the source before preparation.',413);total+=bytes;if(total>64*1024*1024)rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_SIZE','The timetable window exceeds the 64 MiB preparation limit.',413);const descriptor={id,kind,sha256:rosterTimetablePreparationHash_(data),bytes};parts.push(descriptor);if(partId===id)selected={...descriptor,data};};
 for(const row of before.entries){
  // Direct GET, not the production model cache: this proves the current native
  // model bytes and causes no persistent cache write during preparation.
  add('baseline:'+row.entry.id,'baseline',rosterTimetablePreparationBaseline_(row));
 }
 for(const row of before.suspended)add('suspended:'+row.date,'suspended',{schema:'gsis.timetable.preparation.suspended',version:1,...row,expectedProjectionHash:rosterTimetablePreparationHash_(rosterTimetablePreparationProjection_(row.plan))});
 for(const row of before.entries){const check=rosterTimetablePreparationHash_(rosterTimetablePreparationBaseline_(row)),prior=parts.find(part=>part.id==='baseline:'+row.entry.id);if(check!==prior.sha256)rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_CHANGED','Native baseline content changed during preparation. Export a fresh manifest.',409);}
 const after=rosterTimetablePreparationSnapshot_(from,to);if(rosterToday_()!==from||rosterTimetablePreparationStable_(before)!==rosterTimetablePreparationStable_(after))rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_CHANGED','Timetable source changed during preparation. Export a fresh manifest.',409);
 if(parts.length>62)rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_SIZE','The timetable window has too many parts.',413);
 const sourceKey=rosterTimetablePreparationHash_({schema:'gsis.timetable.preparation.source',version:1,from,to,baselineMap:before.baselineMap,parts}),manifest={schema:'gsis.timetable.preparation.manifest',version:1,release:'0.9.8o',mode:'shadow-only',capturedAt:new Date().toISOString(),from,to,timeZone:'Asia/Singapore',calendar:{status:'not-exported',verified:false},baselineMap:before.baselineMap,parts,sourceKey};
 if(Utilities.newBlob(rosterTimetablePreparationStable_(manifest),'application/json').getBytes().length>256*1024)rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_SIZE','The timetable manifest exceeds 256 KiB.',413);
 return {manifest,selected};
}
function rosterTimetablePreparationDispatch_(req,c){
 const p=req.input||{},operation=p.operation;if(!['timetablePreparationManifest','timetablePreparationPart','timetablePreparationCheck'].includes(operation))return null;
 if(c?.user?.rosterAdmin!==true)rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_ADMIN','Administrator access is required for timetable preparation.',403);
 const keys=operation==='timetablePreparationManifest'?['operation']:operation==='timetablePreparationPart'?['operation','sourceKey','partId']:['operation','sourceKey'];
 if(Object.keys(p).length!==keys.length||keys.some(key=>!Object.prototype.hasOwnProperty.call(p,key)))rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_INPUT','Use only the documented read-only preparation fields.',400);
 if(operation!=='timetablePreparationManifest'&&(!/^[a-f0-9]{64}$/.test(p.sourceKey||'')||operation==='timetablePreparationPart'&&(typeof p.partId!=='string'||p.partId.length>520||!p.partId)))rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_INPUT','A valid source key and timetable part identity are required.',400);
 const built=rosterTimetablePreparationBuild_(p.partId);if(operation==='timetablePreparationManifest')return built.manifest;
 if(built.manifest.sourceKey!==p.sourceKey)rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_CHANGED','Google timetable source changed. Export a fresh manifest and parts before continuing.',409);
 if(operation==='timetablePreparationCheck')return {schema:'gsis.timetable.preparation.check',version:1,sourceKey:p.sourceKey,checkedAt:new Date().toISOString(),unchanged:true,readOnly:true,calendarVerified:false};
 if(!built.selected)rosterTimetablePreparationFail_('TIMETABLE_PREPARATION_PART','The requested part is not in this timetable manifest.',404);
 return {schema:'gsis.timetable.preparation.part',version:1,sourceKey:p.sourceKey,...built.selected};
}
