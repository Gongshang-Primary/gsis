/* Native timetable snapshot preparation. No production ownership or delivery I/O. */
import Roster from '../shared/roster.js';
import Stapler from '../shared/roster-stapler.js';
export const RELEASE='0.9.9';
// Native manifests retain their existing wire identity across runtime releases.
export const PROTOCOL_RELEASE='0.9.8o';
export const LIMITS=Object.freeze({part:4*1024*1024,gzip:5*1024*1024,body:9*1024*1024,manifest:256*1024,aggregate:64*1024*1024,parts:62});
export const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
export function exact(value,keys,label='Value'){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('\0')!==keys.slice().sort().join('\0'))fail(400,'UNSUPPORTED_SCHEMA',label+' has unsupported or missing fields.');
}
export function stable(value){
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
 fail(400,'UNSUPPORTED_SCHEMA','Only finite JSON values are supported.');
}
export const encoder=new TextEncoder();
export async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function text(value,max=500,empty=false){if(typeof value!=='string'||value.length>max||!empty&&!value.length)fail(400,'INVALID_NATIVE_PART','Invalid timetable text.');return value;}
export function day(value){if(typeof value!=='string'||!/^20\d\d-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail(400,'INVALID_DATE','Use a valid YYYY-MM-DD date.');return value;}
export function iso(value){if(typeof value!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString()!==value)fail(400,'INVALID_SOURCE','Invalid source timestamp.');return value;}
export function requestId(value){if(typeof value!=='string'||!/^[-A-Za-z0-9_]{8,80}$/.test(value))fail(400,'INVALID_ID','Request IDs require 8–80 letters, numbers, hyphens or underscores.');return value;}
export function sha(value){if(typeof value!=='string'||! /^[a-f0-9]{64}$/.test(value))fail(400,'INVALID_DIGEST','A SHA256 digest is required.');return value;}
export const addDays=(value,n)=>new Date(Date.parse(day(value)+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const singaporeDay=value=>new Date(Date.parse(value)+8*3600000).toISOString().slice(0,10);
function integer(value,min=0,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(value)||value<min||value>max)fail(400,'INVALID_NATIVE_PART','Invalid timetable number.');}
function list(value,max){if(!Array.isArray(value)||value.length>max)fail(400,'INVALID_NATIVE_PART','Invalid timetable collection.');return value;}
export async function manifest(value){
 exact(value,['schema','version','release','mode','capturedAt','from','to','timeZone','calendar','baselineMap','parts','sourceKey'],'Manifest');
 if(value.schema!=='gsis.timetable.preparation.manifest'||value.version!==1||value.release!==PROTOCOL_RELEASE||value.mode!=='shadow-only'||value.timeZone!=='Asia/Singapore')fail(400,'UNSUPPORTED_SCHEMA','Only the O shadow timetable manifest is supported.');
 iso(value.capturedAt);day(value.from);if(value.from!==singaporeDay(value.capturedAt)||value.to!==addDays(value.from,30))fail(400,'INVALID_WINDOW','The window must contain the Singapore capture date through 30 days later.');
 exact(value.calendar,['status','verified'],'Calendar');if(value.calendar.status!=='not-exported'||value.calendar.verified!==false)fail(400,'INVALID_SOURCE','Calendar freshness is not proved by this export.');
 if(!Array.isArray(value.baselineMap)||value.baselineMap.length!==31)fail(400,'INVALID_WINDOW','Supply 31 ordered date mappings.');
 value.baselineMap.forEach((row,i)=>{exact(row,['date','baselineId'],'Date mapping');if(row.date!==addDays(value.from,i))fail(400,'INVALID_WINDOW','Supply consecutive Singapore dates.');if(row.baselineId!==null)text(row.baselineId);});
 list(value.parts,LIMITS.parts);const ids=new Set();let size=0;
 value.parts.forEach(p=>{exact(p,['id','kind','sha256','bytes'],'Part descriptor');text(p.id,520);if(!['baseline','suspended'].includes(p.kind)||ids.has(p.id))fail(400,'INVALID_NATIVE_PART','Part kinds or identities are invalid.');ids.add(p.id);sha(p.sha256);integer(p.bytes,1,LIMITS.part);size+=p.bytes;});
 if(size>LIMITS.aggregate||encoder.encode(stable(value)).length>LIMITS.manifest)fail(413,'SIZE_LIMIT','The timetable snapshot exceeds the supported bound.');
 const source={schema:'gsis.timetable.preparation.source',version:1,from:value.from,to:value.to,baselineMap:value.baselineMap,parts:value.parts};
 if(await hash(stable(source))!==sha(value.sourceKey))fail(400,'SOURCE_HASH_MISMATCH','The manifest source digest does not match its content.');return value;
}
function periods(rows){list(rows,40).forEach(p=>{exact(p,['period','startMinutes','endMinutes'],'Period');integer(p.period,0,39);integer(p.startMinutes,0,1439);integer(p.endMinutes,1,1440);});}
function teachers(rows){list(rows,500).forEach(t=>{exact(t,['staffId','name','timetableName'],'Teacher');text(t.staffId,200);text(t.name,160);text(t.timetableName,160);});}
function classes(rows){list(rows,1000).forEach(c=>{exact(c,['id','name','level','traditional','venue'],'Class');text(c.id,200);text(c.name,160);if(c.level!==null)integer(c.level,1,6);if(typeof c.traditional!=='boolean')fail(400,'INVALID_NATIVE_PART','Invalid class type.');text(c.venue,500,true);});}
function categories(value){if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length>1000)fail(400,'INVALID_NATIVE_PART','Invalid subject categories.');for(const [key,v] of Object.entries(value)){text(key,500);if(['__proto__','constructor','prototype'].includes(key)||!['Teaching','FTT','Non-teaching','Unclassified'].includes(v))fail(400,'INVALID_NATIVE_PART','Invalid subject category.');}}
function recesses(rows){list(rows,6).forEach(r=>{exact(r,['level','startMinutes','endMinutes'],'Recess');integer(r.level,1,6);integer(r.startMinutes,0,1439);integer(r.endMinutes,1,1440);});}
function tiles(rows){list(rows,20000).forEach(t=>{
 exact(t,['id','kind','teacherId','classIds','period','location','subject','venue','group','baselineId','source',...(Object.hasOwn(t,'durationMinutes')?['durationMinutes']:[])],'Tile');
 text(t.id,1000);if(t.teacherId!==null)text(t.teacherId,200);if(t.baselineId!==null)text(t.baselineId);list(t.classIds,1000).forEach(x=>text(x,200));if(t.period!==null)integer(t.period,0,39);['subject','venue','group'].forEach(k=>text(t[k],500,true));if(t.durationMinutes!==undefined)integer(t.durationMinutes,1,1440);
 exact(t.source,['teacherId','classIds','period','subject','venue','group'],'Tile source');if(t.source.teacherId!==null)text(t.source.teacherId,200);list(t.source.classIds,1000).forEach(x=>text(x,200));if(t.source.period!==null)integer(t.source.period,0,39);['subject','venue','group'].forEach(k=>text(t.source[k],500,true));
 });}
export function validatePlan(plan){
 exact(plan,['schema','date','baselineId','parity','endOfDayMinutes','venues','status','revision','nextId','periods','teachers','classes','subjectCategories','tiles','mats','warnings','recessDefaults','baseline',...(Object.hasOwn(plan,'id')?['id']:[])],'Plan');
 if(plan.schema!==1||plan.status!=='draft'||![null,'single','odd','even'].includes(plan.parity))fail(400,'INVALID_NATIVE_PART','Invalid schedule-only plan.');
 day(plan.date);if(Object.hasOwn(plan,'id'))text(plan.id);text(plan.baselineId);integer(plan.revision);integer(plan.nextId,1);integer(plan.endOfDayMinutes,451,1440);
 const catalogue=p=>{periods(p.periods);teachers(p.teachers);classes(p.classes);categories(p.subjectCategories);tiles(p.tiles);recesses(p.recessDefaults);list(p.venues,10000).forEach(x=>text(x,500));};catalogue(plan);
 exact(plan.baseline,['parity','endOfDayMinutes','venues','tiles','teachers','classes','periods','subjectCategories','recessDefaults'],'Plan baseline');catalogue(plan.baseline);
 list(plan.mats,20000).forEach(m=>{exact(m,['target','targetId','fromPeriod','toPeriod','reason'],'Suspension');if(m.reason!=='Suspended')fail(400,'PRIVATE_FIELDS_REFUSED','Private suspension reasons are unsupported.');text(m.targetId,200);integer(m.fromPeriod,0,39);integer(m.toPeriod,0,39);});
 if(!Array.isArray(plan.warnings)||plan.warnings.length)fail(400,'PRIVATE_FIELDS_REFUSED','Warnings are excluded from timetable preparation.');
 // Native recess validation compares insertion order against its source literal.
 // Canonical wire JSON sorts keys, so restore that known literal before validation.
 for(const tile of [...plan.tiles,...plan.baseline.tiles]){const s=tile.source;tile.source={teacherId:s.teacherId,classIds:s.classIds,period:s.period,subject:s.subject,venue:s.venue,group:s.group};}
 try{Stapler.validate(plan);}catch{fail(400,'INVALID_NATIVE_PART','The confirmed schedule has invalid native timetable structure.');}return plan;
}
export function baselineProjection(model,parity,weekday){const week=model[parity];return {periods:Array.from({length:model.maxPeriod+1},(_,period)=>({period,startMinutes:model.timing.startMinutes+period*model.timing.periodMinutes,endMinutes:model.timing.startMinutes+(period+1)*model.timing.periodMinutes})),teachers:week.blocks.map(({name,cells})=>({name,cells:cells.slice(weekday*week.perDay,(weekday+1)*week.perDay)}))};}
export const baselineMapping=(entries,date)=>Roster.active(entries,date)?.id||null;
export function suspendedProjection(plan){const out=Stapler.effectiveDay(plan);return {date:out.date,baselineId:out.id,parity:out.parity,endOfDayMinutes:out.endOfDayMinutes,periods:out.periods.map(({period,startMinutes,endMinutes})=>({period,startMinutes,endMinutes})),teachers:out.teachers.map(({staffId,name,timetableName,cells})=>({staffId,name,timetableName,cells})),classes:plan.classes.map(({id,name,level,traditional,venue})=>({id,name,level,traditional,venue})),recesses:out.staplerRecesses};}
export async function nativePart(value){
 if(!value||typeof value!=='object')fail(400,'INVALID_NATIVE_PART','A native timetable part is required.');
 if(value.schema==='gsis.timetable.preparation.baseline'){
  exact(value,['schema','version','id','entry','model','expectedProjectionHashes'],'Baseline part');if(value.version!==1)fail(400,'UNSUPPORTED_SCHEMA','Unsupported baseline version.');text(value.id);exact(value.entry,['id','name','from','to','priority'],'Baseline entry');if(value.entry.id!==value.id)fail(400,'INVALID_NATIVE_PART','Baseline identities differ.');text(value.entry.name,160);day(value.entry.from);day(value.entry.to);if(value.entry.to<value.entry.from)fail(400,'INVALID_NATIVE_PART','Invalid baseline validity.');integer(value.entry.priority);
  let model;try{model=Roster.validate(value.model);}catch{fail(400,'INVALID_NATIVE_PART','The baseline model is invalid.');}if(stable(model)!==stable(value.model))fail(400,'PRIVATE_FIELDS_REFUSED','Only normalized native baseline fields are accepted.');
  const keys=model.layoutMode==='single-week'?['single']:['odd','even'];exact(value.expectedProjectionHashes,keys,'Projection hashes');
  for(const key of keys){if(!Array.isArray(value.expectedProjectionHashes[key])||value.expectedProjectionHashes[key].length!==5)fail(400,'PROJECTION_MISMATCH','Five weekday projection hashes are required.');for(let i=0;i<5;i++)if(await hash(stable(baselineProjection(model,key,i)))!==sha(value.expectedProjectionHashes[key][i]))fail(400,'PROJECTION_MISMATCH','Baseline weekday reconstruction differs from its source projection.');}
  return {kind:'baseline',id:'baseline:'+value.id,value};
 }
 if(value.schema==='gsis.timetable.preparation.suspended'){
  exact(value,['schema','version','date','name','baselineId','revision','confirmedAt','independentBaseline','plan','expectedProjectionHash'],'Suspended part');if(value.version!==1||value.independentBaseline!==true)fail(400,'UNSUPPORTED_SCHEMA','Only independent confirmed schedules are accepted.');day(value.date);text(value.name,160,true);text(value.baselineId);integer(value.revision);if(value.confirmedAt!==null)iso(value.confirmedAt);validatePlan(value.plan);
  if(value.plan.date!==value.date||value.plan.baselineId!==value.baselineId||value.plan.revision!==value.revision)fail(400,'INVALID_NATIVE_PART','Confirmed schedule identities differ.');
  if(await hash(stable(suspendedProjection(value.plan)))!==sha(value.expectedProjectionHash))fail(400,'PROJECTION_MISMATCH','Suspended timetable reconstruction differs from its source projection.');return {kind:'suspended',id:'suspended:'+value.date,value};
 }
 fail(400,'UNSUPPORTED_SCHEMA','Only native baseline and confirmed suspended timetable parts are supported.');
}
export async function part(value){
 exact(value,['schema','version','sourceKey','id','kind','sha256','bytes','data'],'Part');if(value.schema!=='gsis.timetable.preparation.part'||value.version!==1)fail(400,'UNSUPPORTED_SCHEMA','Unsupported part wrapper.');sha(value.sourceKey);sha(value.sha256);text(value.id,520);if(value.bytes>LIMITS.part)fail(413,'SIZE_LIMIT','A native timetable part exceeds the 4 MiB preparation bound.');integer(value.bytes,1,LIMITS.part);if(typeof value.data!=='string'||encoder.encode(value.data).length!==value.bytes||await hash(value.data)!==value.sha256)fail(400,'PART_HASH_MISMATCH','Part bytes or SHA256 differ from the export.');
 let data;try{data=JSON.parse(value.data);}catch{fail(400,'INVALID_JSON','Invalid native part JSON.');}if(stable(data)!==value.data)fail(400,'UNSUPPORTED_SCHEMA','Native parts must use the canonical JSON representation.');const native=await nativePart(data);if(value.id!==native.id||value.kind!==native.kind)fail(400,'INVALID_NATIVE_PART','Part identities differ.');return {...native,sha256:value.sha256,bytes:value.bytes,data:value.data};
}
export function sourceCheck(value,m){exact(value,['schema','version','sourceKey','checkedAt','unchanged','readOnly','calendarVerified'],'Source check');if(value.schema!=='gsis.timetable.preparation.check'||value.version!==1||value.sourceKey!==m.sourceKey||value.unchanged!==true||value.readOnly!==true||value.calendarVerified!==false)fail(409,'SOURCE_CHECK_MISMATCH','The final source check does not match the snapshot.');iso(value.checkedAt);if(value.checkedAt<m.capturedAt||singaporeDay(value.checkedAt)!==m.from)fail(409,'SOURCE_CHECK_MISMATCH','The final source check predates its manifest or crossed the Singapore date window.');return value;}
