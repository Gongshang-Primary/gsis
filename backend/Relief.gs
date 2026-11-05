/* Versioned, read-only relief export. No Contacts records, writes or public access. */
function reliefAnalysis_(source){
 // Resolve the same version-owned inputs for snapshots and API output.
 const d={...source},catalogue=Array.isArray(d.membership)?membershipCatalogue_(d.membership):undefined;
 d.teachers=(d.teachers||[]).map(t=>GSISTeachingRules.resolve(t,catalogue,undefined,d.teacherDrafts?.[t.id]));
 d.offload=GSISTeachingRules.migrate(d.offload);
 return GSISRelief.analyse(d,GSISWorkload.analyse(d,t=>GSISTeachingRules.calculate(t,d.offload)));
}
function reliefResultRows_(result,details=false){return result.rows.map(r=>({teacherId:r.id,name:r.name,active:r.active,eligible:r.eligible,R:r.quota,available:r.quota!==null,reason:r.quota!==null?null:details?r.reason:!r.active?'Inactive teacher.':!r.eligible?'Not eligible for relief.':'Capacity unavailable. Ask Admin to review.',...(details?{OF:r.OF??null,Ti:r.actualTeaching,breakdown:{employment:r.employment??null,...(r.basisLabel?{basisLabel:r.basisLabel}:{}),teachingVerified:r.teachingVerified===true,FTT:r.FTT,PD:r.pd,duties:r.duties,otherNonTeaching:r.otherNonTeaching,nonTeachingActivities:r.nonTeachingActivities,weeklyBudget:r.weeklyBudget??null,timetableFactor:r.timetableFactor??null,Wi:r.Wi??null,rawR:r.rawQuota,normalR:r.normalQuota,periodCap:r.periodCap,capConfigured:r.capConfigured,capBasis:r.capBasis,capWorkload:r.capWorkload,capHeadroom:r.capHeadroom,capApplied:r.capApplied,offloadAllowance:r.offloadAllowance??null,siuePeriods:r.siuePeriods,siuePercentApplied:r.siuePercentApplied??null,siueBasis:r.siueBasis??null,offloadComponents:r.offloadComponents||[],available:result.calculationVersion===GSISRelief.model&&r.quota!==null,reason:result.calculationVersion!==GSISRelief.model?'Legacy calculation model.':r.reason||null}}:{})}));}
function reliefAdminDetail_(result){
 return {settings:result.settings,weeklyPeriods:result.weeklyPeriods,weeklyLunch:result.weeklyLunch,settingsError:result.settingsError||null,
  calculationVersion:result.calculationVersion,reference:result.reference,
  formula:'Wi = FTT + PD + duties + other non-teaching + (1 + SIUE / 100) × (Ti + OF × T_avg). Normal raw R = timetable factor × (weekly budget − Wi). R = floor(max(0, min(normal raw R, configured weekly cap − cap-counted workload))). UT caps count all actual workload; other caps count FTT + teaching. No cap leaves normal R unchanged. Roster uses this R quota directly and allocates only into available timetable periods. Timetable blocks indicate non-availability and do not reduce R again.',
  rows:result.rows.map(r=>({id:r.id,name:r.name,quota:r.quota,offloadPercent:r.offloadPercent,retained:r.retained,OF:r.OF,weeklyBudget:r.weeklyBudget,timetableFactor:r.timetableFactor,Wi:r.Wi,rawR:r.rawQuota,normalR:r.normalQuota,periodCap:r.periodCap,capConfigured:r.capConfigured,capBasis:r.capBasis,capWorkload:r.capWorkload,capHeadroom:r.capHeadroom,capApplied:r.capApplied,offloadComponents:r.offloadComponents,actualTeaching:r.actualTeaching,FTT:r.FTT,pd:r.pd,duties:r.duties,otherNonTeaching:r.otherNonTeaching,nonTeachingActivities:r.nonTeachingActivities,siuePeriods:r.siuePeriods,siuePercentApplied:r.siuePercentApplied??null,siueBasis:r.siueBasis??null,reason:r.reason||null,legacyBlockPeriods:r.blocks}))};
}
function reliefView_(copy,source,c,calculated){
 const result=calculated||reliefAnalysis_(source);
 const details=c.user.roles.some(r=>r==='Admin'||r==='KP');copy.reliefResults={schema:3,calculationVersion:result.calculationVersion,targetSettings:GSISWorkload.fajtTargetSettings(source.relief),reference:details?result.reference:null,units:'periods/week',teachers:reliefResultRows_(result,details)};
 if(c.user.roles.includes('Admin'))copy.reliefAdmin=reliefAdminDetail_(result);
 else {delete copy.relief;delete copy.reliefAdmin;delete copy.reliefLegacy;}
 return copy;
}
function reliefSafeConflicts_(items,c){return (items||[]).map(x=>!c.user.roles.includes('Admin')&&/relief/i.test([x.where,x.fieldKey,x.key,x.operation].join(' '))?{where:'Relief rules',requestId:x.requestId,message:'An Admin changed restricted relief rules.'}:x);}
function reliefAffectingDelta_(changes){
 const roots=['relief','assignments','teachers','teacherDrafts','membership','offload','workload','loads','subjectTypes','groups','organisations','duties','pal','venues','venueRegistry'];
 return changes.some(x=>{const p=JSON.parse(x.key);return roots.includes(p[0])&&!(p[0]==='assignments'&&['venue'].includes(p[2]))&&!(p[0]==='groups'&&['venue','name','form','sources','anchorRef','classRefs','context'].includes(p[2]))||p[0]==='classes'&&(!p[2]||['level','ref','shortName'].includes(p[2]));});
}
function reliefExport_(b,idx,c,input){
 auth_(c,'either');
 const p=input||{};
 if(typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['versionId','teacherId','year'].includes(k)))error_(400,'Use versionId, teacherId and year only.');
 for(const key of ['versionId','teacherId'])if(p[key]!==undefined&&(typeof p[key]!=='string'||!p[key]||p[key].length>160))error_(400,'Invalid '+key+'.');
 if(p.year!==undefined&&!/^(20\d{2})$/.test(String(p.year)))error_(400,'Use a year from 2000 to 2099.');
 if(idx.pendingFieldCommit)error_(503,'Save confirmation pending; retry relief after it completes.');
 const published=publishedEntry_(idx),entry=p.versionId?idx.versions.find(en=>en.id===p.versionId):published;
 if(!entry)error_(404,p.versionId?'Deploy version not found.':'No published Deploy version is available.');
 visible_(entry,idx,c);
 const cached=reliefConfirmed_(b,idx,entry),d=cached.source;
 if(p.year!==undefined){
  const year=Number(p.year),from=String(d.from||''),to=String(d.to||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))error_(400,'This version needs a valid date range before filtering by year.');
  if(from>year+'-12-31'||to<year+'-01-01')error_(404,'The selected version does not cover that year.');
 }
 // Resolve only the version-owned profiles and role catalogue. Authority was
 // checked live before dispatch; staff data is not silently imported here.
 const result=cached.result;
 if(p.teacherId&&!result.rows.some(r=>r.id===p.teacherId))error_(404,'Teacher not found in this Deploy version.');
 const teachers=reliefResultRows_(result,true).filter(r=>!p.teacherId||r.teacherId===p.teacherId);
 const after=index_(b);if(after.pendingFieldCommit||after.revision!==idx.revision)error_(503,'Deployment changed while reading. Retry.');
 const output={schemaVersion:3,calculationVersion:result.calculationVersion,reference:result.reference,backendVersion:GSIS_DEPLOY_VERSION,units:'periods/week',
  version:{id:entry.id,name:d.name,revision:entry.revision,commit:entry.commit,
   published:!!published&&published.id===entry.id&&published.commit===entry.commit,from:d.from||'',to:d.to||''},
  planningQuota:true,timetableAvailability:false,blockSource:'external',teachers};
 if(c.user.roles.includes('Admin')){output.admin=reliefAdminDetail_(result);delete output.admin.settings.blocks;if(p.teacherId)output.admin.rows=output.admin.rows.filter(r=>r.id===p.teacherId);}
 return output;
}

// Cache only version-owned inputs and pure calculations. Authority is always
// checked by dispatch before this code, and role projection happens afterward.
const reliefRoots_=['id','name','from','to','relief','teachers','teacherDrafts','membership','offload','workload','loads','subjectTypes','classes','groups','assignments','organisations','duties','pal','venues','venueRegistry'];
function reliefSource_(d){return Object.fromEntries(reliefRoots_.filter(k=>Object.prototype.hasOwnProperty.call(d,k)).map(k=>[k,d[k]]));}
function reliefCacheKey_(b,en){return 'relief099-sre-teaching:'+hash_([b.getId(),en.id,en.store||'',en.commit,en.revision,GSISRelief.model]);}
function reliefCache_(b,en,value){
 try{
  const cache=CacheService.getScriptCache(),key=reliefCacheKey_(b,en);
  if(value){
   const text=JSON.stringify(value),count=Math.ceil(text.length/26000);if(count>64)return null;
   const set=Utilities.getUuid(),parts={};for(let i=0;i<count;i++)parts[key+':'+set+':'+i]=text.slice(i*26000,(i+1)*26000);
   cache.putAll(parts,300);cache.put(key,JSON.stringify({schema:1,key,count,set,digest:hash_(text)}),300);return value;
  }
  const raw=cache.get(key);if(!raw)return null;const m=JSON.parse(raw);
  if(m.schema!==1||m.key!==key||!Number.isInteger(m.count)||m.count<1||m.count>64||typeof m.set!=='string')return null;
  const keys=Array.from({length:m.count},(_,i)=>key+':'+m.set+':'+i),parts=cache.getAll(keys);if(keys.some(k=>typeof parts[k]!=='string'))return null;
  const text=keys.map(k=>parts[k]).join('');if(hash_(text)!==m.digest)return null;
  const item=JSON.parse(text);if(!item.source||!Array.isArray(item.result?.rows)||item.source.id!==en.id||item.result.calculationVersion!==GSISRelief.model)return null;return item;
 }catch(e){return null;}
}
function reliefGuard_(b,idx,en){const after=index_(b);if(after.pendingFieldCommit||after.revision!==idx.revision||![...after.versions,...(after.published?[after.published]:[])].some(x=>x.id===en.id&&x.commit===en.commit&&x.store===en.store))error_(503,'Deployment changed while calculating relief. Retry.');}
function reliefDocument_(b,en,roots=reliefRoots_){
 if(!en.viewIndex||!en.rootViewRanges||!en.fastIndex&&!en.reliefReadRangesSchema){const d=document_(b,en,'viewPlain');return Object.fromEntries(roots.filter(k=>Object.prototype.hasOwnProperty.call(d,k)).map(k=>[k,d[k]]));}
 const sheet=b.getSheetByName(en.viewIndex);if(!sheet)error_(503,'Missing calculation projection.');
 const ranges=['[]',...roots].flatMap(k=>en.rootViewRanges[k]||[]),fields={};
 for(const [key,value]of rangedProjectionRows_(sheet,ranges,2))if(key&&value!==''&&(key==='[]'||roots.includes(JSON.parse(key)[0])))fields[key]=value;
 if(!fields['[]'])error_(503,'Incomplete calculation projection.');
 const root=JSON.parse(fields['[]']);root.o=root.o.filter(k=>roots.includes(k));fields['[]']=JSON.stringify(root);
 return GSISFields.inflate(fields);
}
function reliefTeachingGroups_(d){return (d.groups||[]).filter(g=>g.id&&g.name).map(g=>({id:g.id,name:g.name,subject:g.subject||'',level:g.level,levels:g.levels||[g.level],classRefs:g.classRefs||[]}));}
function reliefRosterSubjectCatalogue_(b,idx,en){
 if(idx.pendingFieldCommit)error_(503,'Save confirmation pending.');
 const key='roster-subjects1:'+hash_([b.getId(),en.id,en.store||'',en.commit,en.revision]);let cache=null,value=null;
 try{cache=CacheService.getScriptCache();const raw=cache.get(key),item=raw?JSON.parse(raw):null;if(item?.key===key&&item.value?.versionId===en.id&&Array.isArray(item.value.teachingGroups))value=item.value;}catch(ignore){cache=null;}
 if(!value){const d=reliefDocument_(b,en,['id','from','to','groups']);if(d.id!==en.id)error_(503,'Teaching-group source does not match the published version.');value={versionId:en.id,from:d.from||'',to:d.to||'',teachingGroups:reliefTeachingGroups_(d)};reliefGuard_(b,idx,en);if(cache)try{const text=JSON.stringify({key,value});if(unescape(encodeURIComponent(text)).length<90000)cache.put(key,text,21600);}catch(ignore){}}
 else reliefGuard_(b,idx,en);
 return {...value,source:{service:'deploy',versionId:en.id,revision:en.revision,commit:en.commit||en.publishedAt||'',from:value.from,to:value.to,scope:'teaching-groups'}};
}
function reliefConfirmed_(b,idx,en,known){
 if(idx.pendingFieldCommit)error_(503,'Save confirmation pending.');let value=reliefCache_(b,en);
 if(!value){const source=reliefSource_(known||reliefDocument_(b,en));const calculate=()=>reliefAnalysis_(source);value={source,result:typeof deployPhase_==='function'?deployPhase_('reliefCalculation',calculate):calculate()};reliefGuard_(b,idx,en);reliefCache_(b,en,value);return value;}
 else if(typeof deployTrace_!=='undefined'&&deployTrace_)deployTrace_.reliefCacheHit=true;
 reliefGuard_(b,idx,en);return value;
}
function reliefRosterQuota_(b,idx,en){
 // Roster is served by this same authenticated Deploy API. Reuse its confirmed
 // calculation rather than make a second HTTP call while a save holds the lock.
 if(idx.pendingFieldCommit)error_(503,'Save confirmation pending.');
 const now=Date.now(),day=new Date(now+8*3600000).toISOString().slice(0,10),key='roster-quota-sre-teaching1:'+hash_([b.getId(),en.id,en.store||'',en.commit,en.revision,GSISRelief.model,day]);
 let cache=null,value=null;
 try{cache=CacheService.getScriptCache();const raw=cache.get(key),item=raw?JSON.parse(raw):null;
  const v=item?.value,s=v?.source;
  if(item?.key===key&&item.schema===2&&v?.versionId===en.id&&s?.versionId===en.id&&s.revision===en.revision&&s.commit===(en.commit||en.publishedAt||'')&&s.calculationVersion===GSISRelief.model&&s.cacheDay===day&&s.from===v.from&&s.to===v.to&&Array.isArray(v.rows)&&Array.isArray(v.formClasses)&&Array.isArray(v.teachingGroups))value=v;
 }catch(ignore){cache=null;}
 if(value){reliefGuard_(b,idx,en);return value;}
 const confirmed=reliefConfirmed_(b,idx,en),d=confirmed.source;if(d.id!==en.id)error_(503,'Deployment quota source does not match the published version.');
 const formClasses=(d.classes||[]).map(c=>{const level=Number(String(c.level||'').replace(/\D/g,'')),short=String(c.shortName||c.ref||c.name||''),name=short.startsWith(String(level))?short:String(level)+short;return {id:c.ref||c.id||name,name,level,venue:c.venue||d.assignments?.[c.ref]?.venue||d.assignments?.[name]?.venue||''};}).filter(c=>c.id&&c.name&&c.level>=1&&c.level<=6);
 const catalogue=Array.isArray(d.membership)?membershipCatalogue_(d.membership):undefined,smcIds=(d.teachers||[]).map(t=>GSISTeachingRules.resolve(t,catalogue,undefined,d.teacherDrafts?.[t.id])).filter(t=>t.active&&(t.groups||[]).includes('SMC')).map(t=>t.id);
 const teachingGroups=reliefTeachingGroups_(d);
 value={teachingEvidenceVersion:1,formClasses,teachingGroups,smcIds,subjectCategories:Object.fromEntries([...GSISWorkload.subjects(d).map(subject=>[subject,GSISWorkload.category(d,subject)]),...GSISWorkload.nonTeachingActivities(d).map(a=>[a.code,'Non-teaching'])]),venues:[...new Set(formClasses.map(c=>c.venue).concat(Object.values(d.assignments||{}).map(a=>a.venue),(d.venueRegistry?.venues||d.venues||[]).flatMap(v=>[v.unitNumber||v.id,v.name])).filter(Boolean))].sort(),from:d.from||'',to:d.to||'',rows:confirmed.result.rows.map(r=>({id:r.id,R:Number.isFinite(r.quota)?r.quota:null,rawR:r.rawQuota,teachingPeriods:r.actualTeaching,teachingVerified:r.teachingVerified===true,periodCap:r.periodCap??null,capConfigured:r.capConfigured===true,capBasis:r.capBasis,capNonTeachingPeriods:r.capNonTeachingPeriods,capWorkload:r.capWorkload??null,capVerified:r.quota!==null,capVerificationReason:r.quota===null?r.reason||'Published Deploy workload is unverified.':null,timetableFactor:r.timetableFactor,teachingWeight:1+confirmed.result.settings.siuePercent/100,offloadFactor:r.OF,fullTimeTeacherCount:confirmed.result.reference.fullTimeTeacherCount})),versionId:en.id,source:{service:'deploy',versionId:en.id,revision:en.revision,from:d.from||'',to:d.to||'',commit:en.commit||en.publishedAt||'',calculationVersion:GSISRelief.model,cacheDay:day,checkedAt:new Date(now).toISOString()}};
 reliefGuard_(b,idx,en);
 // Singapore-day boundary, with the platform's six-hour maximum and possible
 // early eviction. Cache only quota data; authority and mutable cover stay live.
 // ponytail: one compact item; oversized projections use the confirmed source.
 if(cache)try{const text=JSON.stringify({schema:2,key,value});if(unescape(encodeURIComponent(text)).length<90000)cache.put(key,text,Math.min(21600,Math.max(1,Math.ceil((Date.parse(day+'T16:00:00Z')-now)/1000))));}catch(ignore){}
 return value;
}
function reliefForSave_(b,idx,d){
 const en=idx.versions.find(x=>x.id===d.id),state=fieldReadState_.get(d);
 if(!state?.settings)return {source:reliefSource_(d),result:reliefAnalysis_(d)};
 const old=reliefConfirmed_(b,idx,en),source=JSON.parse(JSON.stringify(old.source));
 for(const root of state.selectedRoots.filter(k=>reliefRoots_.includes(k)))if(Object.prototype.hasOwnProperty.call(d,root))source[root]=d[root];else delete source[root];
 const changed=reliefAffectingDelta_(GSISFields.diff(old.source,source));
 return {source,result:changed?reliefAnalysis_(source):old.result,unchanged:!changed};
}
function reliefDeltaProjection_(delta,b,idx,c,value){
 const en=idx.versions.find(x=>x.id===delta.versionId),calculated=value||reliefConfirmed_(b,idx,en);
 // A supplied value was calculated and committed while holding the write lock.
 // Unchanged inputs can retain the client's immediately preceding calculation.
 if(value?.unchanged)return {...delta,reliefProjection:{versionId:en.id,revision:en.revision,commit:en.commit,calculationVersion:GSISRelief.model,unchanged:true,...(value.previousRevision!==undefined?{previousRevision:value.previousRevision}:{})}};
 const out={};reliefView_(out,calculated.source,c,calculated.result);
 return {...delta,reliefProjection:{versionId:en.id,revision:en.revision,commit:en.commit,calculationVersion:GSISRelief.model,reliefResults:out.reliefResults,...(out.reliefAdmin?{reliefAdmin:out.reliefAdmin}:{})}};
}

var reliefSnapshotReadState_=new WeakMap();
function reliefSnapshotDocument_(b,idx,en,scope){
 // Older callers that request the complete audit keep their existing read path.
 if(!['view','viewPlain'].includes(scope))return document_(b,en,scope);
 if(idx.pendingFieldCommit)error_(503,'Save confirmation pending.');const cached=reliefCache_(b,en);
 if(cached?.document&&cached.documentScope===scope){reliefGuard_(b,idx,en);reliefSnapshotReadState_.set(cached.document,cached.result);return cached.document;}
 const document=document_(b,en,scope),source=reliefSource_(document),result=cached?.result||reliefAnalysis_(source);
 reliefGuard_(b,idx,en);reliefCache_(b,en,{source,result,document,documentScope:scope});reliefSnapshotReadState_.set(document,result);return document;
}

// Own-record projection. The caller identity comes from verified Contacts authority, never input.
function rosterPersonalCalculations_(req,c){
 const user=rosterOperationsAuthority_(c,req.identity),people=c.rosterPeople.filter(p=>String(p.id)===user.staffId);
 if(!user.staffId||people.length!==1)error_(403,'Your signed-in account is not linked to one teacher. Ask Admin to check Contacts.');
 if(['staffId','teacherId','versionId','year','date'].some(k=>req.input?.[k]!==undefined))error_(400,'Calculations shows only your own current figures.');
 const today=rosterToday_(),b=book_(),idx=rosterOperationsPhase_('calculations-index',()=>index_(b));
 if(idx.pendingFieldCommit)error_(503,'Deployment save confirmation is pending. Retry Calculations after it completes.');
 const en=publishedEntry_(idx),output={name:String(people[0].name||''),asOf:today,units:'periods/week',calculation:null,calculationReason:'No published Deploy calculation is available.',source:null};
 if(en){
  const {source:d,result}=rosterOperationsPhase_('calculations-source',()=>reliefConfirmed_(b,idx,en));
  if(d.id!==en.id)error_(503,'The published calculation could not be verified. Retry.');
  output.source={name:d.name||en.id,revision:en.revision,commit:en.commit||'',from:d.from||'',to:d.to||'',model:result.calculationVersion};
  const inRange=/^\d{4}-\d{2}-\d{2}$/.test(d.from||'')&&/^\d{4}-\d{2}-\d{2}$/.test(d.to||'')&&today>=d.from&&today<=d.to;
  const rawRows=result.rows.filter(r=>r.id===user.staffId),rows=reliefResultRows_({...result,rows:rawRows},true),row=rows.length===1?rows[0]:null;output.deployTeachingEvidence={verified:inRange&&result.calculationVersion===GSISRelief.model,rows:rawRows.map(r=>({id:r.id,periods:r.actualTeaching,verified:r.teachingVerified===true}))};
  output.calculationReason=!inRange?'The published Deploy version does not cover today.':result.calculationVersion!==GSISRelief.model?'The published calculation model needs an update.':!row?'Your teacher record is not uniquely matched in the published Deploy version.':row.reason||row.breakdown.reason||'';
  if(inRange&&result.calculationVersion===GSISRelief.model&&row){
   // Whitelist the person's calculation fields. Never return the source document or other staff.
   const {teacherId,name,...own}=row;output.calculation={...own,reference:{T_avg:result.reference.T_avg,siuePercent:result.reference.siuePercent,fullTimeTeacherCount:result.reference.fullTimeTeacherCount,teachingPeriodTotal:result.reference.teachingPeriodTotal}};
  }
  // reliefConfirmed_ already checked the source after its last read. The own-row
  // projection above is pure; repeating that spreadsheet read adds no evidence.
 }
 try{const state=rosterOperationsPhase_('calculations-history-read',()=>rosterOperationsState_());output.completion=rosterOperationsPhase_('calculations-history',()=>rosterPersonalCompletion_(state,user.staffId,today));const coverage=GSISRosterOperations.historyCoverage(state);if(coverage)output.historyCoverage=coverage;}
 catch(e){if(e.status!==503)throw e;output.completion={from:today.slice(0,4)+'-01-01',to:today,throughWeek:GSISRosterAllocation.monday(today),completed:null,entitlement:null,percentage:null,historyVerified:false,recordedWeeks:null,excludedWeeks:null,reason:'Relief history could not be read. Use Refresh to retry; ask Admin to review if this continues.'};}
 return GSISRosterAllocation.dailyRosterCalculation(output,people[0]);
}
function rosterPersonalCompletion_(state,staffId,today,now=Date.now()){
 // Shared accounting resolves replacements, duplicates, corrections and zero-cost duties.
 return GSISRosterAllocation.personalCompletion(state,staffId,today,now);
}
