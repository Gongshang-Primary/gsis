/* Explicit synthetic interchange, using the same pure rules as production. No I/O. */
import Operations from '../shared/roster-operations.js';
import Allocation from '../shared/roster-allocation.js';
import Stapler from '../shared/roster-stapler.js';

export const RELEASE='0.9.8i';
export const LIMITS=Object.freeze({body:524288,document:524288,timetable:65536,gzip:65536,commands:100,receipts:1000,intents:500});
export const IDS=Object.freeze(['alice','bob','charlie','dora']);
export const fail=(status,code,message)=>{throw Object.assign(new Error(message),{status,code});};
export const clone=value=>JSON.parse(JSON.stringify(value));
export function exact(value,keys,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k))||keys.some(k=>!(k in value)))fail(400,'UNSUPPORTED_SCHEMA',label+' must contain exactly: '+keys.join(', ')+'. Raw production/native operational documents are unsupported.');
}
export function string(value,max,label){if(typeof value!=='string'||!value.length||value.length>max)fail(400,'INVALID_INPUT','Invalid '+label+'.');return value;}
export function date(value){string(value,10,'date');if(!/^20\d\d-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail(400,'INVALID_DATE','Use a valid YYYY-MM-DD date.');return value;}
export function requestId(value){if(typeof value!=='string'||!/^[-A-Za-z0-9_]{8,80}$/.test(value))fail(400,'INVALID_ID','Request IDs must contain 8–80 letters, numbers, hyphens or underscores.');return value;}
export function stable(value){
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
function syntheticName(id){return 'Synthetic '+id[0].toUpperCase()+id.slice(1);}
export function sampleDay(d){
 date(d);const teachers=IDS.map(staffId=>({staffId,name:syntheticName(staffId),cells:Array.from({length:8},()=>['','','','']),R:8}));
 teachers[0].cells[2]=['EL','4A','Demo-01',''];teachers[0].cells[3]=['EL','4A','Demo-01',''];teachers[0].cells[4]=['MA','4A','Demo-01',''];teachers[0].cells[5]=['FORM','4A','Demo-01',''];teachers[0].cells[6]=['FORM','4A','Demo-01',''];
 return {id:'synthetic-school-day-v1',parity:'even',schoolDay:true,verified:true,periods:Array.from({length:8},(_,period)=>({period,startMinutes:420+period*30,endMinutes:450+period*30})),teachers};
}
export function validateDay(day){
 exact(day,['id','parity','schoolDay','verified','periods','teachers'],'Timetable day');
 if(day.id!=='synthetic-school-day-v1'||day.parity!=='even'||day.schoolDay!==true||day.verified!==true)fail(400,'UNSUPPORTED_TIMETABLE','Only the synthetic-school-day-v1 school day is supported.');
 if(!Array.isArray(day.periods)||day.periods.length!==8)fail(400,'UNSUPPORTED_TIMETABLE','Supply exactly eight synthetic periods.');
 day.periods.forEach((p,i)=>{exact(p,['period','startMinutes','endMinutes'],'Period');if(p.period!==i||!Number.isInteger(p.startMinutes)||!Number.isInteger(p.endMinutes)||p.startMinutes<0||p.endMinutes>1440||p.startMinutes>=p.endMinutes||i&&p.startMinutes<day.periods[i-1].endMinutes)fail(400,'INVALID_TIMING','Periods must be ordered, non-overlapping and within one day.');});
 if(!Array.isArray(day.teachers)||day.teachers.length!==IDS.length)fail(400,'UNSUPPORTED_TIMETABLE','Supply the four synthetic teachers.');
 day.teachers.forEach((t,i)=>{exact(t,['staffId','name','cells','R'],'Teacher');if(t.staffId!==IDS[i]||t.name!==syntheticName(IDS[i])||t.R!==8||!Array.isArray(t.cells)||t.cells.length!==8)fail(400,'UNSUPPORTED_TIMETABLE','Teacher identities, names and R must match the synthetic fixture.');for(const cell of t.cells){if(!Array.isArray(cell)||cell.length!==4||cell.some(c=>typeof c!=='string'||c.length>100||/[\u0000-\u001f<>]/.test(c)))fail(400,'INVALID_CELL','Each synthetic cell needs four plain text strings of at most 100 characters.');}});
 if(new TextEncoder().encode(JSON.stringify(day)).length>LIMITS.timetable)fail(413,'SIZE_LIMIT','Timetable exceeds 64 KiB.');
 // The production Stapler validator is also exercised before persistence.
 Stapler.create({...clone(day),date:'2026-10-27'});
 return clone(day);
}
export function validateCommand(command){
 if(!command||typeof command!=='object'||Array.isArray(command))fail(400,'INVALID_COMMAND','Supply a supported rehearsal command.');
 switch(command.operation){
 case 'seedSynthetic':exact(command,['operation','date'],'Seed command');date(command.date);break;
 case 'saveAbsence':
  exact(command,['operation','staffId','periods'],'Absence command');
  if(!IDS.includes(command.staffId)||!Array.isArray(command.periods)||!command.periods.length||command.periods.length>8||new Set(command.periods).size!==command.periods.length||command.periods.some(p=>!Number.isInteger(p)||p<0||p>7))fail(400,'INVALID_ABSENCE','Choose a synthetic teacher and 1–8 unique periods.');break;
 case 'assign':
  exact(command,['operation','staffId','demandIds'],'Assignment command');
  if(!IDS.includes(command.staffId)||!Array.isArray(command.demandIds)||!command.demandIds.length||command.demandIds.length>8||new Set(command.demandIds).size!==command.demandIds.length||command.demandIds.some(id=>typeof id!=='string'||id.length>160))fail(400,'INVALID_ASSIGNMENT','Choose a synthetic relief teacher and 1–8 demand IDs.');break;
 case 'autoAllocate':case 'simulateNotifications':exact(command,['operation'],'Command');break;
 case 'saveTimetable':exact(command,['operation','day'],'Timetable command');validateDay(command.day);break;
 default:fail(400,'UNSUPPORTED_OPERATION','Supported operations: seedSynthetic, saveAbsence, assign, autoAllocate, saveTimetable, simulateNotifications. Native operations, activation and production migration are unsupported.');
 }
 return clone(command);
}
function context(dataset,day,entry){
 let sequence=0;const now=Date.parse(dataset.seed.date+'T06:00:00+08:00');
 return {subjects:['EL','MA','FORM'],today:dataset.seed.date,now,iso:new Date(now).toISOString(),minute:360,user:{staffId:'alice',email:'synthetic-admin@example.invalid',smc:true,admin:true},people:IDS.map(id=>({id,name:syntheticName(id),active:true})),days:{[dataset.seed.date]:clone(day)},uuid:()=>entry.requestId+'-'+(++sequence),notificationsConfigured:false,adminRecipients:[],smcIds:['alice'],schedulerAvailable:false,requestId:entry.requestId};
}
export function replay(dataset){
 exact(dataset,['schema','version','seed','journal'],'Dataset');
 if(dataset.schema!=='gsis.rehearsal.dataset'||dataset.version!==1)fail(400,'UNSUPPORTED_SCHEMA','Supported dataset: gsis.rehearsal.dataset version 1.');
 exact(dataset.seed,['kind','date'],'Seed');if(dataset.seed.kind!=='synthetic-school-day-v1')fail(400,'UNSUPPORTED_SCHEMA','Only synthetic-school-day-v1 seed is supported.');date(dataset.seed.date);
 if(!Array.isArray(dataset.journal)||dataset.journal.length>LIMITS.commands)fail(413,'COUNT_LIMIT','A dataset supports at most 100 journal entries.');
 let day=sampleDay(dataset.seed.date),state=Operations.initial(),result=null;const ids=new Set();
 state.systemConfig.consecutiveSubjectRules=[{subject:'FORM',periods:2},{subject:'PAL',periods:3}];
 state.accountingYears[dataset.seed.date.slice(0,4)]={verified:true,reason:'Synthetic rehearsal only; no historical staff data.'};
 for(const [index,entry] of dataset.journal.entries()){
  exact(entry,['requestId','command'],'Journal entry');requestId(entry.requestId);if(ids.has(entry.requestId))fail(400,'DUPLICATE_ID','Journal request IDs must be unique.');ids.add(entry.requestId);
  const command=validateCommand(entry.command);if(command.operation==='seedSynthetic')fail(400,'UNSUPPORTED_SCHEMA','Seed commands are represented only by dataset.seed.');
  if(command.operation==='saveTimetable'){
   day=validateDay(command.day);
   Operations.reconcile(state,context(dataset,day,entry));
   result={saved:true,timetableVersion:1};
  }
  else if(command.operation==='simulateNotifications')result={simulated:true,delivery:'never-sent'};
  else{
   const ctx=context(dataset,day,entry),p={...command,date:dataset.seed.date,requestId:entry.requestId};
   if(command.operation==='saveAbsence')Object.assign(p,{typeId:'mc',instructionsNA:true});
   result=Operations.apply(state,ctx,p);
  }
  state.revision=index+1;
 }
 return {dataset:clone(dataset),state,day,result};
}
export function advance(current,command,id){
 validateCommand(command);
 if(command.operation==='seedSynthetic'){
  if(current)fail(409,'ALREADY_SEEDED','This rehearsal already has a dataset. Export it first; use explicit snapshot import to replace it.');
  return replay({schema:'gsis.rehearsal.dataset',version:1,seed:{kind:'synthetic-school-day-v1',date:command.date},journal:[]});
 }
 if(!current)fail(409,'SEED_REQUIRED','Create the synthetic school day first.');
 const dataset=clone(current.dataset);dataset.journal.push({requestId:id,command:clone(command)});return replay(dataset);
}
export function validateSnapshot(snapshot){
 exact(snapshot,['schema','version','release','mode','source','dataset'],'Snapshot');
 if(snapshot.schema!=='gsis.rehearsal.snapshot'||snapshot.version!==1||snapshot.release!==RELEASE||snapshot.mode!=='simulation-only')fail(400,'UNSUPPORTED_SCHEMA','Only 0.9.8i gsis.rehearsal.snapshot version 1 simulation-only snapshots are supported. Raw native operational state is not imported.');
 exact(snapshot.source,['system','instanceId','snapshotId','exportedAt'],'Snapshot source');
 if(snapshot.source.system!=='gsis-roster-rehearsal'||!/^[-a-z0-9]{8,64}$/.test(snapshot.source.instanceId)||!/^[-a-zA-Z0-9]{8,80}$/.test(snapshot.source.snapshotId)||typeof snapshot.source.exportedAt!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(snapshot.source.exportedAt)||!Number.isFinite(Date.parse(snapshot.source.exportedAt)))fail(400,'INVALID_SOURCE','Snapshot source identity is invalid.');
 return {...replay(snapshot.dataset),importSource:clone(snapshot.source)};
}
export function projection(current){
 if(!current)return {initialized:false};
 const ctx=context(current.dataset,current.day,{requestId:'read-projection'});
 return {initialized:true,date:current.dataset.seed.date,people:ctx.people,demands:Operations.demand(ctx,current.state,current.dataset.seed.date),assignments:Allocation.effectiveAssignments(current.state),absences:current.state.absences,lastRun:current.state.optimisationRuns.at(-1)||null,journalEntries:current.dataset.journal.length,domainRevision:current.state.revision};
}
