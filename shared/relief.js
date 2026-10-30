/* Weekly relief planning quotas. Pure: never writes deployment or workload records. */
var GSISRelief=(function(){
 'use strict';
 const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
 const record=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
 const nonnegative=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 const model='whole-week-v6';
 function defaults(){return {schema:3,calculationVersion:model,mode:'actual',weeklyPeriods:84,fourFifthsFraction:0.8,fajtWeeklyPeriods:65,timetablePeriods:60,siuePercent:150,siuePercentBySpecialism:{PE:null,Art:null,Music:null},blocks:{}};}
 function validate(doc,value){
  const keys=Object.keys(defaults());
  if(!record(value)||Object.keys(value).some(k=>!keys.includes(k))||value.schema!==3||value.calculationVersion!==model||value.mode!=='actual')throw Error('Use the PDF relief model with actual teaching. Refresh older clients before editing rules.');
  for(const k of ['weeklyPeriods','fajtWeeklyPeriods','timetablePeriods'])if(!nonnegative(value[k])||!value[k])throw Error('Weekly budgets and timetable periods must be greater than zero.');
  if(value.timetablePeriods>value.weeklyPeriods)throw Error('Timetable periods cannot exceed the full-time weekly budget.');
  if(!nonnegative(value.fourFifthsFraction)||value.fourFifthsFraction<=0||value.fourFifthsFraction>1)throw Error('The part-time budget fraction must be greater than zero and at most one.');
  if(!nonnegative(value.siuePercent)||!Number.isFinite(1+value.siuePercent/100))throw Error('SIUE must be a finite, non-negative percentage.');
  // Optional SIUE per specialism; null inherits the general SIUE. Older settings omit it.
  const raw=value.siuePercentBySpecialism===undefined?{}:value.siuePercentBySpecialism,bySpecialism={PE:null,Art:null,Music:null};
  if(!record(raw)||Object.keys(raw).some(k=>!own(bySpecialism,k)))throw Error('Specialist SIUE applies to PE, Art and Music only.');
  for(const [k,n] of Object.entries(raw)){if(n!==null&&(!nonnegative(n)||!Number.isFinite(1+n/100)))throw Error('Specialist SIUE must be blank or a finite, non-negative percentage.');bySpecialism[k]=n;}
  if(!record(value.blocks))throw Error('Enter Block periods for teachers in this version.');
  const teachers=new Set((doc.teachers||[]).map(t=>t.id)),blocks={};
  for(const [id,n] of Object.entries(value.blocks)){if(!teachers.has(id)||!nonnegative(n))throw Error('Block periods must be finite, non-negative weekly periods for a teacher in this version.');blocks[id]=n;}
  return {...value,siuePercentBySpecialism:bySpecialism,blocks};
 }
 // Read compatibility only: never rewrite a version or publication while reading.
 // Timetable/lunch budgets from schema 1/2 are not whole-week work budgets.
 function settingsFor(doc){
  const saved=doc.relief;
  if(saved==null)return validate(doc,defaults());
  if(!record(saved)||![1,2,3].includes(saved.schema))throw Error('Unknown relief settings schema.');
  if(saved.schema===3){
   if(![model,'whole-week-v5','whole-week-v4','whole-week-v3','whole-week-v2','whole-week-v1'].includes(saved.calculationVersion)||!['actual','expected'].includes(saved.mode))throw Error('Unknown relief calculation version.');
   return validate(doc,{...saved,calculationVersion:model,mode:'actual'});
  }
  return validate(doc,{...defaults(),siuePercent:saved.siuePercent===undefined?150:saved.siuePercent,blocks:saved.blocks===undefined?{}:saved.blocks});
 }
 function employment(teacher){
  const p=teacher.profile||{},raw=String(p['Employment Modifier']||teacher.employment||'').trim();
  const parts=raw.split(/[,;]\s*/).map(x=>x.trim()).filter(Boolean),known=['4/5','FAJT','BT','UT','TC','SRE','HAL','Full time','Full-time','FT','1/1'];
  const fajt=parts.includes('FAJT')||p.Role==='FAJT'||teacher.role==='FAJT';
  const fraction=parts.includes('4/5');
  return parts.some(x=>!known.includes(x))||fajt&&fraction?null:fajt?'FAJT':fraction?'4/5':'Full time';
 }
 // PE, Art and Music specialists come from the Subject Modifier, never from display names.
 function specialisms(teacher){const p=teacher.profile||{},tokens=String(p['Subject Modifier']||teacher.subject||'').split(/[,;]\s*/).map(x=>x.trim().toUpperCase());return ['PE','Art','Music'].filter(k=>tokens.includes(k.toUpperCase()));}
 function siueFor(teacher,settings){const set=specialisms(teacher).filter(k=>settings.siuePercentBySpecialism?.[k]!=null);if(!set.length)return {percent:settings.siuePercent,basis:'general'};const k=set.reduce((a,b)=>settings.siuePercentBySpecialism[b]<settings.siuePercentBySpecialism[a]?b:a);return {percent:settings.siuePercentBySpecialism[k],basis:k};}
 function sre(teacher){const p=teacher.profile||{};return String(p['Employment Modifier']||teacher.employment||'').split(/[,;]/).some(v=>v.trim().toUpperCase()==='SRE')||String(p.Role||teacher.role||'').toUpperCase()==='SRE';}
 function offload(rules,catalogue){
  if(!rules?.eligible)return {OF:null,components:[],reason:'Not eligible for teaching.'};
  const tags=catalogue?.tags||[],components=[];let retained=1,reason=(rules.pending||[]).join('; ');
  for(const r of rules.matched||[]){
   const def=tags.find(x=>x.id===r.id),source=r.source||def?.source,match=r.match||def?.match;
   if(['4/5','FAJT'].includes(match))continue;
   if(r.replacedBy)continue;
   const hasRate=r.percent!==''&&r.percent!==null&&r.percent!==undefined;
   if(hasRate&&(!nonnegative(Number(r.percent))||Number(r.percent)>100))reason='Offload rate needs configuration.';
   if(hasRate)retained*=1-Number(r.percent)/100;
   if(hasRate||r.periods!==''&&r.periods!==null&&r.periods!==undefined)components.push({id:r.id,label:r.name,percent:hasRate?Number(r.percent):null,capPeriods:r.periods===''||r.periods==null?null:Number(r.periods),acting:!!r.acting});
  }
  return {OF:reason?null:1-retained,components,reason};
 }
 function analyse(doc,workload){
  const w=workload||{};let settings,settingsError='';
  try{settings=settingsFor(doc);}catch(e){settings=defaults();settingsError=e.message;}
  const sources=new Map((w.rows||[]).map(r=>[r.teacher.id,r])),teachers=new Map((doc.teachers||[]).map(t=>[t.id,t]));
  for(const r of w.rows||[])if(!teachers.has(r.teacher.id))teachers.set(r.teacher.id,r.teacher);
  const fullTimeTeacherCount=(w.rows||[]).filter(r=>r.active&&r.rules?.eligible&&employment(r.teacher)==='Full time').length;
  const teachingPeriodTotal=Number.isFinite(w.totals?.Teaching)?w.totals.Teaching:null;
  const demandMissing=teachingPeriodTotal===null||!!w.teachingIncomplete||(w.ledger||[]).some(e=>e.category==='Unclassified'||e.category==='Teaching'&&!nonnegative(e.periods))||(w.rows||[]).some(r=>r.teacher.orphan||r.issues?.some(x=>/^Missing class/.test(x)));
  const employmentMissing=(w.rows||[]).some(r=>r.active&&r.rules?.eligible&&!employment(r.teacher));
  const T_avg=!demandMissing&&!employmentMissing&&fullTimeTeacherCount?teachingPeriodTotal/fullTimeTeacherCount:null;
  const reference={weeklyPeriods:settings.weeklyPeriods,fourFifthsFraction:settings.fourFifthsFraction,fajtWeeklyPeriods:settings.fajtWeeklyPeriods,timetablePeriods:settings.timetablePeriods,siuePercent:settings.siuePercent,T_avg,teachingPeriodTotal:demandMissing?null:teachingPeriodTotal,fullTimeTeacherCount,available:T_avg!==null,reason:demandMissing?'Teaching demand is incomplete.':employmentMissing?'Employment category needs correction.':!fullTimeTeacherCount?'No eligible full-time teachers.':null};
  const rows=[...teachers.values()].map(teacher=>{
   const r=sources.get(teacher.id),rules=r?.rules,type=employment(teacher),of=offload(rules,doc.offload),active=r?r.active:teacher.active===true||teacher.active==='Y';
   // SRE changes the quota basis, not the existing school-average denominator.
   const isSre=sre(teacher),hasTeaching=!!r&&!r.incomplete&&!teacher.orphan&&nonnegative(r.Teaching),longTerm=isSre&&hasTeaching&&r.Teaching>0,fajtBasis=type==='FAJT'||longTerm;
   const budget=isSre&&!longTerm?null:fajtBasis?settings.fajtWeeklyPeriods:type==='4/5'?settings.weeklyPeriods*settings.fourFifthsFraction:type==='Full time'?settings.weeklyPeriods:null;
   const factor=isSre&&!longTerm?null:fajtBasis?1:type?settings.timetablePeriods/settings.weeklyPeriods:null;
   const out={teacher,id:teacher.id,name:teacher.name||teacher.id,active,eligible:!!rules?.eligible,employment:type,...(isSre?{reliefBasis:longTerm?'long-term':hasTeaching?'daily':'unknown',basisLabel:longTerm?'SRE with timetable: FAJT basis':null}:{}),OF:of.OF,offloadComponents:of.components,offloadPercent:of.OF===null?null:of.OF*100,retained:null,actualTeaching:r?.Teaching??null,teachingVerified:!!r&&!r.incomplete&&!teacher.orphan&&nonnegative(r.Teaching),teachingUsed:r?.Teaching??null,teachingBasis:'Actual teaching',FTT:r?.FTT??null,pd:r?.pd??null,duties:r?.duties??null,otherNonTeaching:r?.otherNonTeaching??null,nonTeachingActivities:r?.nonTeachingActivities||[],weeklyBudget:budget,timetableFactor:factor,Wi:null,siuePeriods:null,offloadAllowance:null,rawQuota:null,normalQuota:null,periodCap:rules?.cap??null,capConfigured:rules?.cap!=null||(rules?.matched||[]).some(r=>r.periods!==''&&r.periods!=null),capBasis:rules?.capBasis||'teaching',capNonTeachingPeriods:r?.capNonTeachingPeriods||null,capWorkload:null,capHeadroom:null,capApplied:false,quota:null,blocks:settings.blocks[teacher.id]||0,remaining:null,reason:'',comparison:null};
   const missing=reason=>{out.reason=reason;return out;};
   if(settingsError)return missing('Relief settings need correction: '+settingsError);
   if(teacher.orphan)return missing('Teacher record is missing.');
   if(!active)return missing('Inactive teacher.');
   if(!r||!rules?.eligible)return missing('Not eligible for relief.');
   if(!type)return missing('Employment category needs correction.');
   if(isSre&&hasTeaching&&!longTerm)return missing('Daily roster, no R%');
   if(T_avg===null)return missing(reference.reason);
   if(of.reason||of.OF===null)return missing(of.reason||'Offload rate needs configuration.');
   if(r.incomplete||r.capIncomplete||![r.Teaching,r.FTT,r.pd,r.duties,r.otherNonTeaching].every(nonnegative))return missing('Workload data is incomplete.');
   if(out.capConfigured&&!nonnegative(out.periodCap))return missing('Weekly period cap needs correction.');
   out.capWorkload=r.FTT+r.Teaching+(out.capBasis==='total'?r.pd+r.duties+r.otherNonTeaching:0);out.capHeadroom=out.periodCap===null?null:Math.max(0,out.periodCap-out.capWorkload);
   const applied=siueFor(teacher,settings),allowance=of.OF*T_avg,siue=(r.Teaching+allowance)*applied.percent/100;
   // Every captured period enters once; only teaching and its offload allowance receive SIUE.
   const Wi=r.FTT+r.pd+r.duties+r.otherNonTeaching+r.Teaching+allowance+siue,raw=factor*(budget-Wi);
   if(!Number.isFinite(raw)||!nonnegative(Wi))return missing('Relief factors exceed the calculation range.');
   out.offloadAllowance=allowance;out.siuePercentApplied=applied.percent;out.siueBasis=applied.basis;out.siuePeriods=siue;out.Wi=Wi;out.rawQuota=raw;out.normalQuota=Math.floor(Math.max(0,raw));out.quota=Math.floor(Math.max(0,Math.min(raw,out.capHeadroom===null?Infinity:out.capHeadroom)));out.capApplied=out.quota<out.normalQuota;out.remaining=out.quota;
   return out;
  });
  return {settings,settingsError,calculationVersion:model,reference,weeklyPeriods:settings.weeklyPeriods,weeklyLunch:0,rows,byTeacher:Object.fromEntries(rows.map(r=>[r.id,r])),issues:rows.filter(r=>r.reason).map(r=>r.name+': '+r.reason)};
 }
 return {defaults,settingsFor,validate,analyse,employment,offload,specialisms,model};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISRelief;
