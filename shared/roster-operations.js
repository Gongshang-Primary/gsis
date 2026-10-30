/* Dated relief operations. Pure rules; storage, identity and timetable context come from the backend. */
var GSISRosterOperations=(()=>{
 const TYPE_LABELS=['Sick Leave (w/ MC)','Sick Leave (w/o MC)','Leave School Early (LSE)','Leave School in Between (LSB)','Time Off','CCL (w/ MC)','CCL (w/o MC)','PCL / FCL','Hospitalisation Leave','Reservist','UPA','NPL','Maternity / Paternity Leave','Marriage Leave','Compassionate Leave','Others'];
 const TYPE_IDS=['mc','sick','lse','lsb','timeoff','cclmc','ccl','pclfcl','hospital','reservist','upa','npl','parental','marriage','compassionate','others'];
 const READS=['read','candidates','availability','audit','prunePreview','externalLink','health','accounting','allocation','history','exportDaily','dutyRoster','stapler','dailyTimetable','timetableDay','systemConfig','dailyEmployment','staplerDates','dailyNotify','nameBridges','teacherDailyUpdate','currentDuty','previewRestoreStapler'];
 function fail(status,message,code){throw Object.assign(new Error(message),{status,...(code?{code}:{})});}
 function copy(x){return JSON.parse(JSON.stringify(x));}
 function text(x,max=2000){if(typeof x!=='string'||x.length>max)fail(400,'Invalid text.');return x.trim();}
 function date(x){if(typeof x!=='string'||!/^20\d\d-\d\d-\d\d$/.test(x)||!Number.isFinite(Date.parse(x))||new Date(x).toISOString().slice(0,10)!==x)fail(400,'Choose a valid date.');return x;}
 function dates(p,max=62){if(Array.isArray(p.dates)){const a=[...new Set(p.dates.map(date))].sort();if(!a.length||a.length>max)fail(400,'Select 1 to '+max+' dates.');return a;}const from=date(p.from||p.date),to=date(p.to||from);if(to<from||Date.parse(to)-Date.parse(from)>(max-1)*86400000)fail(400,'Choose a range of no more than '+max+' days.');const out=[];for(let n=Date.parse(from);n<=Date.parse(to);n+=86400000)out.push(new Date(n).toISOString().slice(0,10));return out;}
 function absenceDates(p,ctx){const selected=dates(p,366);if(Date.parse(selected.at(-1))-Date.parse(selected[0])>365*86400000)fail(400,'Choose an absence range of no more than 366 days.');if(ctx&&selected.length>62){const verified=new Set(ctx.calendarDatesVerified||[]);if(selected.some(d=>!verified.has(d)))fail(409,'Calendar must verify every selected date before reporting or updating an absence longer than 62 days.');}return selected;}
 function mobile(s){let v=String(s||'').replace(/\D/g,'');if(v.startsWith('00'))v=v.slice(2);if(v.length===8)v='65'+v;return v;}
 function absentTeacherContact(person){const number=mobile(person?.mobile),email=String(person?.email||'').trim();return /^[1-9]\d{7,14}$/.test(number)?'https://wa.me/'+number:/^[^@\s]+@gsps\.edu\.sg$/i.test(email)?email:'';}
 function publishedOnDate(at,d){const stamp=Date.parse(at);return Number.isFinite(stamp)&&new Date(stamp+8*3600000).toISOString().slice(0,10)===d;}
 function publishDateIssue(ctx,d,s){return d>ctx.today&&s?.systemConfig?.allowAdvancePublishing!==true?'Publish is available only for the current Singapore workday. Keep other dates as drafts.':ctx.days[d]?.verified!==true||ctx.days[d]?.schoolDay!==true?'Calendar must confirm the selected date as a school day before publishing.':'';}
 function defaults(){return TYPE_LABELS.map((label,i)=>({id:TYPE_IDS[i],label,requiresDetail:TYPE_IDS[i]==='others',allowSelectAll:![2,3,4].includes(i),allowedPeriods:i===3?Array.from({length:12},(_,n)=>n):null,afterMinutes:i===2?675:null,minStartMinutes:i===2?690:null,todayOnly:i===2}));}
 function initial(){return operationalSettings(allocation().ensure({schema:1,typeDetailsVersion:1,revision:0,types:defaults(),absences:[],adhoc:[],assignments:[],requests:[],outbox:[],audit:[],receipts:[],deliveryEvents:[]}));}
 function validateState(s){if(!s||s.schema!==1||!Number.isInteger(s.revision)||['types','absences','adhoc','assignments','requests','outbox','audit','receipts','deliveryEvents'].some(k=>!Array.isArray(s[k])))fail(503,'Relief records need review.');if(!s.typeDetailsVersion){const existing=s.types.find(t=>t.id==='others'||String(t.label).trim().toLowerCase()==='others');if(existing)existing.requiresDetail=true;else s.types.push(defaults().find(t=>t.id==='others'));s.typeDetailsVersion=1;}return operationalSettings(allocation().ensure(s));}
 // Policy and report records share the operational document, revision and receipt lock.
 function operationalSettings(s){
  if(!s.cellDecisionVersions)s.cellDecisionVersions={};if(typeof s.cellDecisionVersions!=='object'||Array.isArray(s.cellDecisionVersions))fail(503,'Stored allocation decision versions need review.');
  if(!s.systemConfig)s.systemConfig={noReliefSubjects:['PD','BLK','BLOCK','IMP'].map(value=>({type:'exact',value})),allocationPreferences:['annualUtilisation','alternatives','weeklyRemaining','rotation'],scheduledAllocationEnabled:false};
  if(s.systemConfig.allowAdvancePublishing===undefined)s.systemConfig.allowAdvancePublishing=false;if(typeof s.systemConfig.allowAdvancePublishing!=='boolean')fail(503,'Stored advance publication setting needs review.');
  const A=allocation();if(s.systemConfig.consecutiveCountExclusions===undefined)s.systemConfig.consecutiveCountExclusions=[];s.systemConfig.consecutiveCountExclusions=A.normalizeSubjectPatterns(s.systemConfig.consecutiveCountExclusions);if(s.systemConfig.verboseLogging===undefined)s.systemConfig.verboseLogging=true;if(typeof s.systemConfig.verboseLogging!=='boolean')fail(503,'Stored verbose logging setting needs review.');s.systemConfig.allocationPreferences=A.preferenceOrder(s.systemConfig.allocationPreferences);
  if(s.systemConfig.subjectFamilies===undefined)s.systemConfig.subjectFamilies=A.defaultSubjectFamilies();if(s.systemConfig.teachingGroupOverrides===undefined)s.systemConfig.teachingGroupOverrides=[];
  if(s.systemConfig.consecutiveSubjectRules===undefined)s.systemConfig.consecutiveSubjectRules=A.defaultConsecutiveSubjectRules();A.normalizeConsecutiveSubjectRules(s.systemConfig.consecutiveSubjectRules);
  A.normalizeSubjectFamilies(s.systemConfig.subjectFamilies);A.normalizeTeachingGroupOverrides(s.systemConfig.teachingGroupOverrides,s.systemConfig.subjectFamilies);
  if(!s.systemConfig.allocationRulesVersion){s.systemConfig.allocationPreferences=[...s.systemConfig.allocationPreferences.filter(id=>id!=='subjectMatch'),'subjectMatch'];s.systemConfig.allocationRulesVersion=1;}
  s.systemConfig.allocationRuleEnabled=A.ruleToggles(s.systemConfig.allocationRuleEnabled);for(const r of A.workloadRules)if(s.systemConfig[r.field]===undefined)s.systemConfig[r.field]=r.defaultValue;A.workloadLimits(s.systemConfig);
  if(s.systemConfig.reliefHealthPeriods===undefined)s.systemConfig.reliefHealthPeriods=Array.from({length:12},(_,i)=>i+1);
  if(s.systemConfig.employmentPeriodRestrictions===undefined)s.systemConfig.employmentPeriodRestrictions=allocation().defaultEmploymentRestrictions();
  normalizePeriods(s.systemConfig.reliefHealthPeriods);normalizeEmploymentRestrictions(s.systemConfig.employmentPeriodRestrictions);
  if(s.systemConfig.sharedSubjectCoverEnabled===undefined)s.systemConfig.sharedSubjectCoverEnabled=true;
  if(s.systemConfig.sharedSubjectCoverSubjects===undefined)s.systemConfig.sharedSubjectCoverSubjects=['Form'];
  if(typeof s.systemConfig.sharedSubjectCoverEnabled!=='boolean'||!Array.isArray(s.systemConfig.sharedSubjectCoverSubjects)||s.systemConfig.sharedSubjectCoverSubjects.some(v=>typeof v!=='string'))fail(503,'Stored shared lesson rules need review.');
  if(s.systemConfig.smcSummaryTimes===undefined)s.systemConfig.smcSummaryTimes=defaultSmcSummaryTimes();
  if(!s.dailyEmploymentSettings)s.dailyEmploymentSettings={recipients:[],subject:'Daily Updates',time:'08:00'};
  for(const k of ['dailyEmploymentSnapshots','dailyEmploymentMail'])if(!Array.isArray(s[k]))s[k]=[];
  if(!s.dailyEmploymentAutomatic)s.dailyEmploymentAutomatic={};if(!s.dailyPublicationStates)s.dailyPublicationStates={};if(!s.nameBridges)s.nameBridges=[];if(!Array.isArray(s.nameBridges)||typeof s.dailyPublicationStates!=='object'||Array.isArray(s.dailyPublicationStates))fail(503,'Stored Roster identity or publication records need review.');return s;
 }
 function defaultSmcSummaryTimes(){return {evening:Array.from({length:12},(_,i)=>String(16+Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00')),morning:['05:30','05:45','06:00','06:15','06:29']};}
 function normalizeSmcSummaryTimes(value){
  if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'Choose evening and morning SMC summary times.');
  const result={};for(const phase of ['evening','morning']){const rows=value[phase];if(!Array.isArray(rows)||rows.length>96)fail(400,'Choose at most 96 '+phase+' summary times.');const seen=new Set();result[phase]=rows.map(v=>{if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))fail(400,'Use HH:MM for each '+phase+' summary time.');const minute=clock(v);if(phase==='evening'?minute<960:minute>389)fail(400,phase==='evening'?'Evening summaries must be from 16:00 to 23:59 and cover the following school date.':'Morning summaries must be from 00:00 to 06:29 and cover the current school date.');if(seen.has(v))fail(400,'Remove the duplicate '+phase+' summary time '+v+'.');seen.add(v);return v;}).sort();}return result;
 }
 function smcSummarySlot(s,now){
  operationalSettings(s);const slot=allocation().schedule(now),phase=slot.minute>=960?'evening':slot.minute<390?'morning':null;if(!phase)return null;
  const time=String(Math.floor(slot.minute/60)).padStart(2,'0')+':'+String(slot.minute%60).padStart(2,'0'),times=s.systemConfig.smcSummaryTimes[phase],index=times.indexOf(time);return index<0?null:{date:slot.date,phase,time,first:index===0,at:Math.floor(now/60000)*60000,key:slot.date+':'+phase+':'+time};
 }
 function summaryAbsences(s,d){const rows=new Map(),coverage=new Map();for(const a of s.absences){if(a.deletedAt||a.date!==d)continue;if(!rows.has(a.staffId))rows.set(a.staffId,new Set());for(const p of a.periods)rows.get(a.staffId).add(p);if(a.coverage){if(!coverage.has(a.staffId))coverage.set(a.staffId,[]);coverage.get(a.staffId).push(a.coverage);}}return [...rows].sort(([a],[b])=>a.localeCompare(b)).map(([staffId,periods])=>({staffId,periods:[...periods].sort((a,b)=>a-b),...(coverage.has(staffId)?{coverage:copy(coverage.get(staffId)).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))}:{})}));}
 function lastSuccessfulSummary(index,recipientId,d,phase){return index.successfulSummaries.get(recipientId+'|'+d+'|'+phase);}
 function summaryBucketKey(j){const summary=j.data.scheduledSummary;return JSON.stringify([j.recipientId,j.date,summary.phase,summary.fingerprint]);}
 function pendingSummary(index,j){return (index.summaryBuckets.get(summaryBucketKey(j))||[]).some(other=>other.id!==j.id&&['sending','uncertain'].includes(other.status));}
 function scheduledSummaryCurrent(s,j){
  const summary=j.data?.scheduledSummary;if(j.kind!=='smc_report'||j.data?.audience!=='duty-smc'||!summary)return false;
  const slot=smcSummarySlot(s,summary.at);return !!slot&&slot.key===summary.key&&slot.date===j.date;
 }
 function subjectNormal(value){return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();}
 function normalizeNoReliefSubjects(rules){return allocation().normalizeSubjectPatterns(rules);}
 function matchesNoReliefSubject(subject,rules){return allocation().matchesSubjectPattern(subject,rules);}

 function normalizePeriods(values){if(!Array.isArray(values)||values.length>40||values.some(v=>!Number.isInteger(v)||v<0||v>=40))fail(400,'Choose valid timetable periods.');return [...new Set(values)].sort((a,b)=>a-b);}
 function normalizeEmploymentRestrictions(rows){if(!Array.isArray(rows)||rows.length>100)fail(400,'Choose at most 100 employment rules.');const seen=new Set();return rows.map(row=>{const employment=text(row?.employment,80).trim().toUpperCase();if(!employment||seen.has(employment))fail(400,'Choose a different employment type for each rule.');seen.add(employment);return {employment,periods:normalizePeriods(row.periods)};});}
 function configPeriods(s,ctx){return [...new Set([...(ctx.availablePeriods||Array.from({length:17},(_,i)=>i)),...s.systemConfig.reliefHealthPeriods,...s.systemConfig.employmentPeriodRestrictions.flatMap(r=>r.periods)])].sort((a,b)=>a-b);}
 function consecutiveSubjects(s,ctx){
  const raw=new Set(ctx.subjects||[]);
  // The confirmation is immutable even when a newer working draft exists.
  for(const row of s.staplerPlans||[]){
   if(row.date<ctx.today||row.deletedAt||row.archivedAt)continue;
   const snapshot=confirmedStaplerSnapshot(row,s.audit),plan=snapshot?.plan;
   if(!plan||plan.baselineId!==row.baselineId||plan.date!==row.date||!Array.isArray(plan.tiles))continue;
   for(const tile of plan.tiles)if(tile.kind==='lesson'&&tile.location==='grid')raw.add(tile.subject);
  }
  const values=new Set();
  for(const value of raw){
   if(typeof value!=='string'||!value.trim()||value.length>100||absentTimetableCell([value]))continue;
   // Some legal timetable labels (e.g. annotation-only cells) cannot form a rule.
   // Use the allocator's canonical form; skip only its expected input rejection.
   try{values.add(allocation().normalizeConsecutiveSubjectRules([{subject:value,periods:2}])[0].subject);}catch(e){if(e.status!==400)throw e;}
  }
  return [...values].sort((a,b)=>a.localeCompare(b));
 }
 function systemConfigView(s,ctx){smc(ctx);operationalSettings(s);return {revision:s.revision,canEdit:ctx.user.admin===true,config:copy(s.systemConfig),periods:configPeriods(s,ctx),employmentTypes:[...new Set([...ctx.people.map(p=>String(p.employment||'').trim().toUpperCase()).filter(Boolean),...s.systemConfig.employmentPeriodRestrictions.map(r=>r.employment)])].sort(),subjects:copy(ctx.subjects||[]),consecutiveSubjects:consecutiveSubjects(s,ctx),teachingGroups:copy(ctx.teachingGroups||[]),baseline:copy(ctx.subjectBaseline||null),preferenceRules:copy(allocation().preferenceRules||[]),schedulerAvailable:ctx.schedulerAvailable===true,nameBridges:ctx.user.admin?nameBridgesView(s,ctx):null};}
 function allocationLearningView(s,ctx){
  if(!ctx.user?.smc&&!ctx.user?.admin&&!(ctx.user?.staffId&&(ctx.people||[]).some(p=>p.id===ctx.user.staffId&&p.active===true)))fail(403,'A linked staff account, SMC or Admin access is required.');
  // Normalize an isolated policy copy with the same rules as allocation. This
  // read neither migrates the operational state nor exposes its private records.
  const A=allocation(),c=operationalSettings({systemConfig:copy(s.systemConfig||null)}).systemConfig,families=A.normalizeSubjectFamilies(c.subjectFamilies),enabled=A.ruleToggles(c.allocationRuleEnabled),preferences=A.preferenceOrder(c.allocationPreferences);
  const config={
   allocationRulesVersion:Number.isInteger(c.allocationRulesVersion)?c.allocationRulesVersion:null,allocationPreferences:preferences,allocationRuleEnabled:enabled,
   maxDailyPeriods:c.maxDailyPeriods,maxConsecutivePeriods:c.maxConsecutivePeriods,
   noReliefSubjects:A.normalizeSubjectPatterns(c.noReliefSubjects),consecutiveCountExclusions:A.normalizeSubjectPatterns(c.consecutiveCountExclusions),consecutiveSubjectRules:A.normalizeConsecutiveSubjectRules(c.consecutiveSubjectRules),
   subjectFamilies:families,teachingGroupOverrides:A.normalizeTeachingGroupOverrides(c.teachingGroupOverrides,families),
   employmentPeriodRestrictions:normalizeEmploymentRestrictions(c.employmentPeriodRestrictions),reliefHealthPeriods:normalizePeriods(c.reliefHealthPeriods),
   scheduledAllocationEnabled:c.scheduledAllocationEnabled===true,sharedSubjectCoverEnabled:c.sharedSubjectCoverEnabled,sharedSubjectCoverSubjects:c.sharedSubjectCoverSubjects.map(value=>text(value,100)),allowAdvancePublishing:c.allowAdvancePublishing
  };
  const appliedRuleOrder=preferences.filter(id=>enabled[id]).map(id=>{const rule=A.preferenceRules.find(rule=>rule.id===id);return {id,label:rule.label,description:rule.description,enabled:true};});
  return {learning:{config,appliedRuleOrder,updatedAt:typeof c.updatedAt==='string'&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(c.updatedAt)&&Number.isFinite(Date.parse(c.updatedAt))?c.updatedAt:null,revision:s.revision}};
 }
 function saveSystemConfig(s,ctx,p){admin(ctx);operationalSettings(s);const consecutiveCountExclusions=allocation().normalizeSubjectPatterns(p.consecutiveCountExclusions===undefined?s.systemConfig.consecutiveCountExclusions:p.consecutiveCountExclusions),verboseLogging=p.verboseLogging===undefined?s.systemConfig.verboseLogging:p.verboseLogging;if(typeof verboseLogging!=='boolean')fail(400,'Set verbose logging to On or Off.');if(typeof p.scheduledAllocationEnabled!=='boolean')fail(400,'Set scheduled allocation to On or Off.');const advance=p.allowAdvancePublishing??s.systemConfig.allowAdvancePublishing;if(typeof advance!=='boolean')fail(400,'Set advance publishing to On or Off.');const enabled=p.sharedSubjectCoverEnabled??s.systemConfig.sharedSubjectCoverEnabled,subjects=p.sharedSubjectCoverSubjects??s.systemConfig.sharedSubjectCoverSubjects;if(typeof enabled!=='boolean'||!Array.isArray(subjects)||subjects.length>200)fail(400,'Choose the shared lesson rule and its subjects.');const known=new Set([...(ctx.subjects||[]),...s.systemConfig.sharedSubjectCoverSubjects].map(subjectNormal));const selected=[...new Set(subjects.map(v=>text(v,100)))];if(selected.some(v=>!v||!known.has(subjectNormal(v))))fail(400,'Choose shared lesson subjects from the baseline timetable.');const reliefHealthPeriods=normalizePeriods(p.reliefHealthPeriods??s.systemConfig.reliefHealthPeriods),employmentPeriodRestrictions=normalizeEmploymentRestrictions(p.employmentPeriodRestrictions??s.systemConfig.employmentPeriodRestrictions),knownPeriods=new Set(configPeriods(s,ctx)),knownEmployment=new Set([...ctx.people.map(p=>String(p.employment||'').trim().toUpperCase()),...s.systemConfig.employmentPeriodRestrictions.map(r=>r.employment)]);if([...reliefHealthPeriods,...employmentPeriodRestrictions.flatMap(r=>r.periods)].some(v=>!knownPeriods.has(v)))fail(400,'Choose periods from the baseline timetable.');if(employmentPeriodRestrictions.some(r=>!knownEmployment.has(r.employment)))fail(400,'Choose employment types from Contacts.');const allocationRuleEnabled=allocation().ruleToggles(p.allocationRuleEnabled===undefined?s.systemConfig.allocationRuleEnabled:p.allocationRuleEnabled),limits=Object.fromEntries(allocation().workloadRules.map(r=>[r.field,p[r.field]===undefined?s.systemConfig[r.field]:p[r.field]]));allocation().workloadLimits({...limits,allocationRuleEnabled});const subjectFamilies=allocation().normalizeSubjectFamilies(p.subjectFamilies??s.systemConfig.subjectFamilies),teachingGroupOverrides=allocation().normalizeTeachingGroupOverrides(p.teachingGroupOverrides??s.systemConfig.teachingGroupOverrides,subjectFamilies),knownGroups=new Set([...(ctx.teachingGroups||[]).map(g=>g.id),...s.systemConfig.teachingGroupOverrides.map(g=>g.groupId)]);if(teachingGroupOverrides.some(g=>!knownGroups.has(g.groupId)))fail(400,'Choose teaching groups from the published Deploy catalogue.');const consecutiveInput=p.consecutiveSubjectRules===undefined?s.systemConfig.consecutiveSubjectRules:p.consecutiveSubjectRules,consecutiveSubjectRules=allocation().normalizeConsecutiveSubjectRules(consecutiveInput),knownConsecutive=new Set(consecutiveSubjects(s,ctx));if(consecutiveInput.some(rule=>!knownConsecutive.has(subjectNormal(rule.subject))))fail(400,'Choose consecutive subjects from the current baseline or confirmed suspended timetables. Replace or remove unavailable subjects.');s.systemConfig={consecutiveCountExclusions,verboseLogging,subjectFamilies,teachingGroupOverrides,consecutiveSubjectRules,allowAdvancePublishing:advance,allocationRulesVersion:1,allocationRuleEnabled,...limits,reliefHealthPeriods,employmentPeriodRestrictions,noReliefSubjects:normalizeNoReliefSubjects(p.noReliefSubjects),allocationPreferences:allocation().preferenceOrder(p.allocationPreferences),scheduledAllocationEnabled:p.scheduledAllocationEnabled,sharedSubjectCoverEnabled:enabled,sharedSubjectCoverSubjects:selected,smcSummaryTimes:normalizeSmcSummaryTimes(p.smcSummaryTimes??s.systemConfig.smcSummaryTimes),updatedAt:ctx.iso,updatedBy:ctx.user.email};reconcile(s,ctx);allocation().addAudit(s,ctx,'saveSystemConfig',{config:copy(s.systemConfig)});return {savedIds:['systemConfig']};}
 function employmentEditor(ctx){if(!ctx.user.admin&&!(ctx.user.smc||ctx.user.admin))fail(403,'Admin or SMC access is required.');}
 function reportEmails(person){return [...new Set((Array.isArray(person.emails)?person.emails:[person.email,person.cesEmail]).map(v=>String(v||'').trim().toLowerCase()).filter(v=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)))];}
 function reportPublished(s,d){return !!s.massPublications[d]||s.staplerPlans.some(r=>r.date===d&&r.published&&publishedOnDate(r.publishedAt,d));}
 function employmentSnapshot(s,ctx,d){
  const A=allocation(),balances=A.balances(s,ctx,d),rows=A.accounted(s,ctx).filter(a=>a.date===d&&['published','completed'].includes(a.status)),byTeacher=new Map();
  for(const a of rows){const row=byTeacher.get(a.staffId)||{staffId:a.staffId,name:ctx.people.find(t=>t.id===a.staffId)?.name||a.relieverName||a.staffId,load:0,periods:[],annualPercentage:balances.get(a.staffId)?.utilisation??null};row.load+=A.cost(a);if(!row.periods.includes(a.period))row.periods.push(a.period);byTeacher.set(a.staffId,row);}
  let health={percentage:null,incomplete:true,reason:'Verified timetable and quota are unavailable.'};if(ctx.days[d]?.schoolDay===true&&ctx.quotaRequested===true)health=A.health(s,ctx,d,demand(ctx,s,d));
  return {date:d,capturedAt:ctx.iso,revision:s.revision,health:copy(health),absences:s.absences.filter(a=>a.date===d&&!a.deletedAt).map(a=>({staffId:a.staffId,name:a.name,reason:[a.typeLabel,a.reasonDetail].filter(Boolean).join(': '),periods:copy(absencePeriods(ctx,a)),...(a.coverage?{coverage:copy(a.coverage)}:{})})),reliefTeachers:[...byTeacher.values()].sort((a,b)=>a.name.localeCompare(b.name)),externalTeachers:s.adhoc.filter(a=>a.date===d&&!a.deletedAt).filter(a=>ctx.people.find(t=>t.id===a.staffId)?.active===false).map(a=>({staffId:a.staffId,name:ctx.people.find(t=>t.id===a.staffId)?.name||a.name||a.staffId,employment:a.employment||ctx.people.find(t=>t.id===a.staffId)?.employment||''}))};
 }
 function dailyEmploymentView(s,ctx,p){
  operationalSettings(s);const d=date(p.date||ctx.today),canEdit=(ctx.user.smc||ctx.user.admin),original=s.dailyEmploymentSnapshots.find(r=>r.date===d),preview=!original&&d===ctx.today?employmentSnapshot(s,ctx,d):null;
  return {revision:s.revision,date:d,canEdit:!!canEdit,settings:canEdit?copy(s.dailyEmploymentSettings):null,recipientPeople:canEdit?s.dailyEmploymentSettings.recipients.map(r=>({id:r.staffId,name:ctx.people.find(t=>t.id===r.staffId)?.name||'Former recipient',emails:copy(r.emails)})):[],people:canEdit?ctx.people.filter(t=>reportEmails(t).length).map(t=>({id:t.id,name:t.name,emails:reportEmails(t)})):[],snapshot:copy(original||preview),original:!!original,published:reportPublished(s,d),delivery:canEdit?s.dailyEmploymentMail.filter(j=>j.date===d).map(({id,status,error,createdAt,sentAt})=>({id,status,error:error||'',at:sentAt||createdAt})):[],unavailableReason:original?'':d<ctx.today?'No original report snapshot was captured for this date.':preview?'Live preview. The original report is captured when the first report is queued.':'No report is available for this date.'};
 }
 function saveDailyEmploymentSettings(s,ctx,p){
  employmentEditor(ctx);operationalSettings(s);clock(p.time);const subject=text(p.subject,180);if(!subject||/[\r\n]/.test(subject))fail(400,'Enter a single-line email subject.');if(!Array.isArray(p.recipients)||p.recipients.length>200)fail(400,'Choose at most 200 report recipients.');const seen=new Set();const recipients=p.recipients.map(row=>{const person=staff(ctx,row.staffId),allowed=reportEmails(person);if(seen.has(person.id))fail(400,'Remove the duplicate recipient.');seen.add(person.id);const emails=row.emails===undefined?allowed:row.emails;if(!Array.isArray(emails)||!emails.length||emails.some(e=>!allowed.includes(String(e).trim().toLowerCase())))fail(400,'Choose email addresses recorded in Contacts.');return {staffId:person.id,emails:[...new Set(emails.map(e=>e.trim().toLowerCase()))]};});s.dailyEmploymentSettings={recipients,subject,time:p.time,updatedAt:ctx.iso,updatedBy:ctx.user.email};allocation().addAudit(s,ctx,'saveDailyEmploymentSettings',{settings:copy(s.dailyEmploymentSettings)});return {savedIds:['dailyEmploymentSettings']};
 }
 function queueDailyEmployment(s,ctx,d,manualKey){
  operationalSettings(s);if(!reportPublished(s,d)){if(manualKey)fail(409,'Publish this workday before sending its report.');return {dailyEmploymentMailQueued:false};}
  if(!manualKey&&(d!==ctx.today||ctx.minute<clock(s.dailyEmploymentSettings.time)||s.dailyEmploymentAutomatic[d]))return {dailyEmploymentMailQueued:false};
  let snapshot=s.dailyEmploymentSnapshots.find(r=>r.date===d);if(!snapshot){if(d!==ctx.today){if(manualKey)fail(409,'No original report snapshot exists for that date.');return {dailyEmploymentMailQueued:false};}snapshot=employmentSnapshot(s,ctx,d);s.dailyEmploymentSnapshots.push(snapshot);}
  const addresses=new Set();for(const row of s.dailyEmploymentSettings.recipients){const person=ctx.people.find(t=>t.id===row.staffId),allowed=reportEmails(person||{});for(const email of row.emails)if(allowed.includes(email))addresses.add(email);}
  if(manualKey&&!addresses.size)fail(400,'Select current report recipient addresses before sending.');
  const key=manualKey?'manual:'+manualKey:'automatic:'+d,ids=[];for(const email of addresses){if(s.dailyEmploymentMail.some(j=>j.key===key&&j.to===email))continue;const row={id:ctx.uuid(),key,date:d,to:email,subject:s.dailyEmploymentSettings.subject+' | '+d,status:'queued',createdAt:ctx.iso,requestedBy:manualKey?ctx.user.email:'scheduled'};s.dailyEmploymentMail.push(row);ids.push(row.id);}
  if(!manualKey)s.dailyEmploymentAutomatic[d]={at:ctx.iso,status:addresses.size?'queued':'no-recipients'};allocation().addAudit(s,ctx,'dailyEmploymentReportQueued',{date:d,manual:!!manualKey,ids,capturedAt:snapshot.capturedAt,recipientCount:addresses.size});return {savedIds:ids,dailyEmploymentMailQueued:ids.length>0};
 }
 function employmentEmail(snapshot,publicOrigin){
  const origin=String(publicOrigin||'').trim().replace(/\/$/,'');if(!/^https:\/\/[^\s/?#]+$/i.test(origin))fail(503,'Configure the Roster public origin before sending Daily Updates.');
  const notifyUrl=origin+'/?date='+encodeURIComponent(date(snapshot.date))+'#dailyNotify';
  const lines=['Daily Updates',snapshot.date,'Original snapshot: '+snapshot.capturedAt,'','Relief health: '+(Number.isFinite(snapshot.health.percentage)?snapshot.health.percentage.toFixed(1)+'%':'Unavailable'),'','External relief employed',...snapshot.externalTeachers.map(r=>r.name+' | '+r.employment),'','Absent teachers | Reason | Periods',...snapshot.absences.map(r=>r.name+' | '+r.reason+' | '+r.periods.join(', ')),'','Relief teachers | Daily load',...snapshot.reliefTeachers.map(r=>r.name+' | '+r.load),'','Daily Notify: '+notifyUrl,'Open Daily Notify to see where teachers are deployed. The page shows the current published timetable for this date.'];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),table=(heads,rows)=>'<table style="border-collapse:collapse"><thead><tr>'+heads.map(v=>'<th style="text-align:left;border:1px solid #ccd;padding:6px">'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td style="border:1px solid #ccd;padding:6px">'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  return {body:lines.join('\n'),htmlBody:'<h2>Daily Updates: '+esc(snapshot.date)+'</h2><p>Original snapshot: '+esc(snapshot.capturedAt)+'</p><p>Relief health: '+(Number.isFinite(snapshot.health.percentage)?esc(snapshot.health.percentage.toFixed(1))+'%':'Unavailable')+'</p><h3>External relief employed</h3>'+table(['Teacher','Employment'],snapshot.externalTeachers.map(r=>[r.name,r.employment]))+'<h3>Absent teachers</h3>'+table(['Teacher','Reason','Periods'],snapshot.absences.map(r=>[r.name,r.reason,r.periods.join(', ')]))+'<h3>Relief load</h3>'+table(['Teacher','Daily load'],snapshot.reliefTeachers.map(r=>[r.name,r.load]))+'<p><a href="'+esc(notifyUrl)+'">Daily Notify</a>: see where teachers are deployed in the current published timetable for this date.</p>'};
 }
 function confirmedStaplerSnapshot(record,audit=[]){
  if(!record)return null;
  if(record.confirmedPlan&&Number.isSafeInteger(record.confirmedRevision)&&record.confirmedRevision>0)return {plan:record.confirmedPlan,revision:record.confirmedRevision,at:record.confirmedAt,by:record.confirmedBy};
  if(record.published&&Number.isSafeInteger(record.publishedRevision)&&record.publishedRevision>0)return {plan:record.published,revision:record.publishedRevision,at:record.publishedAt,by:record.publishedBy};
  if(!record.confirmed||!record.draft||!record.confirmedAt)return null;
  const snapshot=revision=>({plan:record.draft,revision,at:record.confirmedAt,by:record.confirmedBy});
  if(record.confirmedAt===record.updatedAt)return snapshot(record.revision);
  // Older renames advanced metadata without retaining the confirmed contents.
  // Recover only a complete audited chain of name changes; missing history or
  // any saved lesson edit still requires explicit reconfirmation.
  const confirmedAt=Date.parse(record.confirmedAt),updatedAt=Date.parse(record.updatedAt);
  if(!Number.isSafeInteger(record.revision)||record.revision<1||!Number.isFinite(confirmedAt)||!Number.isFinite(updatedAt))return null;
  const events=audit.filter(e=>e.date===record.date),confirmations=events.filter(e=>e.operation==='confirmStapler'&&e.at===record.confirmedAt&&e.actor===record.confirmedBy);
  if(confirmations.length!==1)return null;
  const revision=confirmations[0].staplerRevision;
  if(!Number.isSafeInteger(revision)||revision<1||revision>record.revision)return null;
  if(revision===record.revision)return updatedAt<=confirmedAt?snapshot(revision):null;
  const changes=events.filter(e=>Number.isSafeInteger(e.staplerRevision)&&e.staplerRevision>revision&&e.staplerRevision<=record.revision).sort((a,b)=>a.staplerRevision-b.staplerRevision);
  if(changes.length!==record.revision-revision)return null;
  let at=confirmedAt,name;
  for(let i=0;i<changes.length;i++){const e=changes[i],time=Date.parse(e.at);if(e.operation!=='renameStapler'||e.staplerRevision!==revision+i+1||!Number.isFinite(time)||time<at||time>updatedAt||typeof e.name!=='string'||i>0&&e.before!==name)return null;at=time;name=e.name;}
  return changes[changes.length-1].at===record.updatedAt&&name===(record.name||'')?snapshot(revision):null;
 }
 function retainConfirmedStaplerSnapshot(record,audit){const confirmed=confirmedStaplerSnapshot(record,audit);if(confirmed&&!record.confirmedPlan){record.confirmedPlan=stapler().canonical(stapler().copyValidated(confirmed.plan));record.confirmedRevision=confirmed.revision;}}

 function confirmedDateAccess(ctx){const person=ctx.people.find(p=>p.id===ctx.user.staffId);return !person?'unmapped':person.active===true&&absenceEligible(person)?'available':'ineligible';}
 function mayViewConfirmed(s,ctx,record){return !!record&&record.date>=ctx.today&&!!confirmedStaplerSnapshot(record,s.audit)&&confirmedDateAccess(ctx)==='available';}
 // A legacy confirmation can prove the date without proving the contents of a
 // later draft. Listing that date must not grant permission to read the draft.
 function confirmedStaplerDate(record,today){return record.date>=today&&(!!confirmedStaplerSnapshot(record)||record.confirmed===true&&typeof record.confirmedAt==='string'&&Number.isFinite(Date.parse(record.confirmedAt)));}
 function confirmedStaplerProjection(plan){
  const out=copy(plan);out.warnings=[];for(const mat of out.mats||[])mat.reason='Suspended';
  // Imported absence reasons occur in the visible card and its source copies.
  // Redact the read-only projection consistently, keeping stored evidence intact.
  for(const tile of [...out.tiles,...out.baseline.tiles])for(const value of [tile,tile.source,tile.offlineSource])if(value&&stapler().isOfflineAbsence(value.subject.replace(/[\r\n\u2028\u2029]/g,' ')))value.subject='Absent';
  return out;
 }
 function staplerDatesView(s,ctx){
  const privileged=ctx.user.smc||ctx.user.admin,confirmedAccess=privileged?'available':confirmedDateAccess(ctx),requests=s.staplerRequests.filter(r=>!r.retiredAt&&(privileged||r.staffId===ctx.user.staffId)),approved=new Set(),latestRequest=new Map(),plans=new Map();
  for(const r of requests){latestRequest.set(r.date,r);if(r.status==='approved')approved.add(r.date);}
  // Keep the first canonical record, matching find() even for a legacy duplicate.
  for(const r of s.staplerPlans)if(!plans.has(r.date))plans.set(r.date,r);
  const historyDates=new Set(s.publicationSnapshots.map(r=>r.date));
  for(const r of s.assignments)if(r.publishedAt||['published','completed'].includes(r.status))historyDates.add(r.date);
  for(const r of s.importedRelief)if(['published','completed'].includes(r.status))historyDates.add(r.date);
  const canList=record=>!!record&&confirmedAccess==='available'&&confirmedStaplerDate(record,ctx.today),canListUpcoming=record=>!!record&&confirmedAccess==='available'&&record.date>=ctx.today,keys=new Set([...plans.values()].filter(r=>privileged||approved.has(r.date)||canListUpcoming(r)).map(r=>r.date).concat(requests.map(r=>r.date)));
  const dates=[...keys].sort().reverse().map(d=>{
   const record=plans.get(d),canListConfirmed=canList(record),canViewConfirmed=mayViewConfirmed(s,ctx,record),mayEdit=staplerPermission(s,ctx,d);
    // Unconfirmed dates are public metadata; draft names, revisions and contents stay private.
    if(canListUpcoming(record)&&!canListConfirmed&&!mayEdit&&!privileged)return {date:d,name:'',status:latestRequest.get(d)?.status||'Not yet confirmed',canListUpcoming:true,canListConfirmed:false,canViewConfirmed:false,mayEdit:false,mayManage:false,mayConfirm:false,mayPublish:false,draftRevision:0,confirmedRevision:0};
   if(canListConfirmed&&!canViewConfirmed&&!mayEdit&&!privileged)return {date:d,name:'',status:'Needs reconfirmation',confirmedSnapshotAvailable:false,canListConfirmed,canViewConfirmed:false,previewUnavailable:true,viewMode:'confirmed',draftRevision:0,confirmedRevision:0,mayEdit:false,mayManage:false,mayConfirm:false,mayPublish:false};
   const row=privileged||approved.has(d)||canViewConfirmed?record:null,confirmed=confirmedStaplerSnapshot(row,s.audit),active=(typeof GSISRoster!=='undefined'?GSISRoster:require('./roster.js')).active(ctx.timetableEntries||[],d);
   return {date:d,name:row?.name||'',mayManage:!!row&&privileged&&d>=ctx.today,lifecycleIssue:staplerHistoryIssue(s,d,row,historyDates),status:confirmed?'Confirmed':row?.confirmed?'Needs reconfirmation':row?.draft?'Draft':latestRequest.get(d)?.status||'New',confirmedSnapshotAvailable:!!confirmed,draftRevision:mayEdit?row?.revision||0:confirmed?.revision||0,confirmedRevision:confirmed?.revision||0,canListConfirmed,canViewConfirmed,viewMode:!mayEdit&&canViewConfirmed?'confirmed':'planner',publishedRevision:row?.publishedRevision||0,mayEdit,mayConfirm:mayEdit,mayPublish:false,baselineId:row?.baselineId||null,baselineChanged:!!row&&active?.id!==row.baselineId};
  });
  return {revision:s.revision,confirmedAccess,dates,resetArchives:privileged?s.staplerArchives.filter(r=>resetStaplerArchive(s,r)&&!r.restoredAt).map(r=>({id:r.id,date:r.date,name:r.name||'',archivedAt:r.archivedAt,confirmed:!!confirmedStaplerSnapshot(r,s.audit),mayRestore:r.date>=ctx.today,issue:r.date<ctx.today?'Past plans remain archived.':''})):[],deletedArchives:privileged?s.staplerArchives.filter(r=>r.archiveReason==='deleted'&&!r.restoredAt).map(r=>({id:r.id,date:r.date,name:r.name||'',archivedAt:r.archivedAt,mayRestore:r.date>=ctx.today&&!plans.has(r.date),issue:r.date<ctx.today?'Past plans remain archived.':plans.has(r.date)?'This date already has a saved plan.':''})):[],sponsors:ctx.staplerSponsors||ctx.people.filter(t=>(ctx.smcIds||[]).includes(t.id)&&teacherSponsor(t)).map(({id,name})=>({id,name})),sponsorships:copy(requests)};
 }

 function teacherSponsor(person){return person?.active===true&&person.adhocEligible===true&&!['SL','Support'].some(g=>(person.groups||[]).includes(g))&&!/^(?:SL|P|VP|AM|OM|SAT|Principal|Vice Principal)$/i.test(String(person.role||'').replace(/^(?:Acting|Ag)\s+/i,''));}
 function dutyEligible(person){return person?.active===true&&!['SL','Support'].some(g=>(person.groups||[]).includes(g))&&!/^(?:SL|P|VP|AM|OM|Principal|Vice Principal)$/i.test(String(person.role||'').replace(/^(?:Acting|Ag)\s+/i,''));}
 function nameKey(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/^(mr|mrs|ms|mdm|miss|dr)\.?\s+/,'').replace(/\s*\((?:sre|fajt|bt|ut|rt|4\/5)\)\s*/g,' ').replace(/[^a-z0-9]/g,'');}
 function seedNameBridges(s,people){operationalSettings(s);if(s.nameBridgesSeeded)return;const seeds=[['Yasmin','Yasmin (Art)'],['Tseh Chyn','Tseh Chyn (PE)'],['Fae Deng (BT) (MTL)','Fae (BT) (MTL)'],['Nisha','Nisha (Art)'],['Hazmi','Hazmi (Art)'],['Ahyoung (UT)','Ahyoung (UT) (Art)'],['Fadzriel (UT)','Fadzriel (UT) (PE)']];for(const [timetableName,target] of seeds){const matches=people.filter(p=>p.name===target);if(matches.length===1&&!s.nameBridges.some(r=>nameKey(r.timetableName)===nameKey(timetableName)))s.nameBridges.push({timetableName,staffId:matches[0].id,source:'Confirmed v0.7.11 migration'});}s.nameBridgesSeeded=true;}
 function matchTimetableNames(s,people,blocks){
  seedNameBridges(s,people);const names=new Map(),byId=new Map(),bridges=new Map(),add=(map,key,row)=>{const rows=map.get(key);if(rows)rows.push(row);else map.set(key,[row]);};
  for(const person of people){add(names,nameKey(person.name),person);if(!byId.has(person.id))byId.set(person.id,person);}
  for(const bridge of s.nameBridges)add(bridges,nameKey(bridge.timetableName),bridge);
  const matched=blocks.flatMap((block,index)=>{const key=nameKey(block.name),direct=names.get(key)||[];if(direct.length>1)return [];const links=bridges.get(key)||[],person=direct.length===1?direct[0]:links.length===1?byId.get(links[0].staffId):null;return person?[{index,person,timetableName:block.name}]:[];});
  const counts=new Map();for(const row of matched)counts.set(row.person.id,(counts.get(row.person.id)||0)+1);return matched.filter(row=>counts.get(row.person.id)===1);
 }
 function nameBridgesView(s,ctx){admin(ctx);seedNameBridges(s,ctx.people);return {revision:s.revision,timetableNames:copy(ctx.timetableNames||[]),baseline:copy(ctx.subjectBaseline||null),unmatched:copy(ctx.unmatchedTimetableNames||[]),links:s.nameBridges.map(r=>({...r,name:ctx.people.find(p=>p.id===r.staffId)?.name||'',missing:!ctx.people.some(p=>p.id===r.staffId),stale:!(ctx.timetableNames||[]).includes(r.timetableName)})),people:ctx.people.map(({id,name})=>({id,name}))};}
 function saveNameBridge(s,ctx,p){admin(ctx);seedNameBridges(s,ctx.people);const timetableName=text(p.timetableName,160),key=nameKey(timetableName);if(!key)fail(400,'Enter a timetable name.');const previous=s.nameBridges.find(r=>nameKey(r.timetableName)===key);if(p.operation==='deleteNameBridge'){s.nameBridges=s.nameBridges.filter(r=>nameKey(r.timetableName)!==key);}else{if(!(ctx.timetableNames||[]).includes(timetableName))fail(400,'Choose an exact teacher name from the current baseline timetable. Reload the list if the baseline changed.');const person=staff(ctx,p.staffId),direct=ctx.people.filter(t=>nameKey(t.name)===key);if(direct.length>1||direct.length===1&&direct[0].id!==person.id)fail(409,'This timetable name already matches a different or ambiguous Contacts identity.');const row={timetableName,staffId:person.id,updatedAt:ctx.iso,updatedBy:ctx.user.email};if(previous)s.nameBridges[s.nameBridges.indexOf(previous)]=row;else s.nameBridges.push(row);}allocation().addAudit(s,ctx,p.operation,{timetableName,staffId:p.staffId||previous?.staffId});return {savedIds:[key]};}
 // Report Absence has a narrower exclusion policy than ad hoc teaching relief.
 function absenceEligible(person){
  if(!person)return false;const role=String(person.role||'').trim().replace(/^(?:Acting|Ag)\s+/i,'');
  return !String(person.mk||'').trim()&&String(person.appointmentLevel||'').trim().toUpperCase()!=='SL'&&!(person.groups||[]).some(g=>['SL','MK','Support','SAT'].includes(g))&&!/^(?:SLs?|School Leaders?|P|VP(?:\b.*)?|Principal|Vice Principal|MK(?:\b.*)?|MKE|Support(?: Staff)?|SAT|OSOs?|AE)$/i.test(role);
 }
 function staff(ctx,id){const p=ctx.people.find(x=>x.id===id);if(!p)fail(404,'Teacher is no longer in Contacts.');return p;}
 function samePerson(ctx,a,b){if(a===b)return true;const am=mobile(ctx.people.find(p=>p.id===a)?.mobile),bm=mobile(ctx.people.find(p=>p.id===b)?.mobile);return !!am&&!!bm&&am===bm;}
 function absenceStaffIds(ctx,p){
  const ids=p.staffIds===undefined?[p.staffId||ctx.user.staffId]:p.staffIds;
  if(!Array.isArray(ids)||!ids.length||ids.length>150||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)fail(400,'Select 1 to 150 different absent teachers.');
  if(p.staffIds!==undefined&&p.staffId&&!ids.includes(p.staffId))fail(400,'The reviewed teacher must be included in the absence selection.');
  const selected=[];for(const id of ids){staff(ctx,id);if(id!==ctx.user.staffId)smc(ctx);if(selected.some(other=>samePerson(ctx,id,other)))fail(400,'Select each teacher only once; these Contacts entries share an identity.');selected.push(id);}return selected;
 }
 function smc(ctx){if(!(ctx.user.smc||ctx.user.admin))fail(403,'SMC membership is required.');}
 function admin(ctx){if(!ctx.user.admin)fail(403,'Contacts Admin access is required.');}
 function owned(ctx,a){if(!(ctx.user.smc||ctx.user.admin)&&a.staffId!==ctx.user.staffId)fail(403,'You can manage only your own absence records.');}
 function editable(ctx,a){owned(ctx,a);if(a.date<ctx.today)fail(403,'Past absence entries are view only.');if(a.deletedAt)fail(409,'This absence entry has been deleted.');}
 function day(ctx,d,required=true){const v=ctx.days[d];if(!v&&required)fail(503,'Timetable or school date information is unavailable. Refresh before planning relief.');return v||null;}
 function periods(ctx,d,p){const max=day(ctx,d).periods.length;if(!Array.isArray(p)||!p.length||p.some(n=>!Number.isInteger(n)||n<0||n>=max))fail(400,'Select valid periods.');return [...new Set(p)].sort((a,b)=>a-b);}
 function absencePeriods(ctx,a){return allocation().absencePeriods(a,a.date<ctx.today&&a.periodSnapshot?{periods:a.periodSnapshot}:ctx.days[a.date]);}
 function absenceTimingPending(ctx,a){const dd=ctx.days[a.date];return dd?!(dd.id&&dd.periods?.length&&dd.schoolDay===true&&dd.verified!==false):a.timetablePending===true;}
 function absenceCoverage(input,existing){
  if(input==null)return null;if(typeof input!=='object'||Array.isArray(input))fail(400,'Choose full day or a valid start and end time.');
  if(input.kind==='fullDay')return {kind:'fullDay'};
  if(input.kind==='timeRanges'&&existing?.coverage?.kind==='timeRanges'&&JSON.stringify(input)===JSON.stringify(existing.coverage))return copy(existing.coverage);
  if(input.kind!=='timeRange'||!Number.isInteger(input.startMinutes)||!Number.isInteger(input.endMinutes)||input.startMinutes<0||input.endMinutes>1440||input.startMinutes>=input.endMinutes)fail(400,'Enter a start time before the end time on the same day.');
  return {kind:'timeRange',startMinutes:input.startMinutes,endMinutes:input.endMinutes};
 }
 function absenceIntervals(a,dd){
  if(a.coverage?.kind==='fullDay')return [{startMinutes:0,endMinutes:1440}];
  if(a.coverage?.kind==='timeRange')return [a.coverage];
  if(a.coverage?.kind==='timeRanges')return a.coverage.ranges;
  const timing=dd?.periods?.length?dd.periods:a.periodSnapshot||[];
  return (a.periods||[]).map(p=>timing.find(t=>t.period===p)).filter(p=>Number.isFinite(p?.startMinutes)&&Number.isFinite(p?.endMinutes));
 }
 function absenceOverlap(a,b,dd){const left=absenceIntervals(a,dd),right=absenceIntervals(b,dd);if(left.length&&right.length)return left.some(x=>right.some(y=>x.startMinutes<y.endMinutes&&x.endMinutes>y.startMinutes));return (a.periods||[]).some(p=>(b.periods||[]).includes(p))||!!(a.coverage&&b.periods?.length||b.coverage&&a.periods?.length);}
 function inWeek(a,b){const monday=d=>{const n=new Date(d+'T12:00:00Z'),w=(n.getUTCDay()+6)%7;return Date.UTC(n.getUTCFullYear(),n.getUTCMonth(),n.getUTCDate()-w);};return monday(a)===monday(b);}
 function needsCover(cell){const code=String(cell?.[0]||'').trim().toUpperCase();return !stapler().isOfflineAbsence(cell?.[0])&&!!cell?.some(v=>String(v).trim())&&!['PD','BLK','BLOCK','IMP'].includes(code);}
 function lessons(ctx,a){if(a.date<ctx.today&&Array.isArray(a.lessonSnapshot))return copy(a.lessonSnapshot);const d=day(ctx,a.date,false),t=d?.teachers.find(t=>t.staffId===a.staffId);if(!t||d.schoolDay!==true||d.verified===false)return [];const ps=absencePeriods(ctx,a);return ps.filter(p=>!stapler().isOfflineAbsence(t.cells[p]?.[0])).filter(p=>a.noReliefSubjects?!!t.cells[p]?.some(v=>String(v).trim())&&!matchesNoReliefSubject(t.cells[p][0],a.noReliefSubjects):needsCover(t.cells[p])).map(p=>{const c=t.cells[p];let start=p;while(start>0&&ps.includes(start-1)&&JSON.stringify(t.cells[start-1])===JSON.stringify(c))start--;return {id:a.id+':'+p,absenceId:a.id,staffId:a.staffId,name:a.name,date:a.date,period:p,timeStart:d.periods[p]?.start||'',timeEnd:d.periods[p]?.end||'',subject:c[0],className:c[1],venue:c[2],groupName:c[3],groupIds:(d.teachingGroups||[]).filter(g=>g.name===c[3]).length===1?(d.teachingGroups||[]).filter(g=>g.name===c[3]).map(g=>g.id):[],lessonKey:a.date+':'+start+':'+JSON.stringify(c),timetableId:d.id};});}
 function individualDemand(ctx,s,d){const resolve=allocation().subjectResolver(ctx.days[d]?.teachingGroups,operationalSettings(s).systemConfig);return s.absences.filter(a=>!a.deletedAt&&a.date===d&&a.reliefRequired).flatMap(a=>lessons(ctx,a)).map(lesson=>{if(d<ctx.today)return lesson;const policy=resolve(lesson);return {...lesson,noReliefRequired:!policy.reliefRequired,subjectFamilyId:policy.familyId,subjectFamilyName:policy.familyName};});}
 // Exact physical venue identity only. Blank, placeholder and multi-venue cells cannot
 // establish a shared supervision group. Subject/date/period remain part of its key.
 function sharedLessonKey(d,period,cell){const rawVenue=String(cell?.[2]||''),venue=subjectNormal(rawVenue);return !venue||/^(?:-|—|N\/?A|NIL|TBC|TBD|UNKNOWN|UNASSIGNED|NONE|\?)$/.test(venue)||/[,;\r\n/]/.test(rawVenue)?null:JSON.stringify([d,period,subjectNormal(cell[0]),venue]);}
 function demand(ctx,s,d){
  const raw=individualDemand(ctx,s,d),dd=ctx.days[d],config=operationalSettings(s).systemConfig;
  if(d<ctx.today){const prior=allocation().effectiveAssignments(s).filter(a=>a.date===d&&a.sharedLessonKey),members=new Set(prior.flatMap(a=>(a.members||[]).map(m=>m.id)));return [...raw.filter(r=>!members.has(r.id)),...prior.map(a=>({...copy(a),id:a.demandId,staffId:a.absentId,name:a.absentName})),...recessDemand(ctx,s,d)];}
  if(!config.sharedSubjectCoverEnabled||!dd||dd.verified===false)return [...raw,...recessDemand(ctx,s,d)];
  const selected=new Set(config.sharedSubjectCoverSubjects.map(subjectNormal));if(!raw.some(row=>selected.has(subjectNormal(row.subject))))return [...raw,...recessDemand(ctx,s,d)];
  const groups=new Map(),A=allocation(),live=A.effectiveAssignments(s).filter(a=>a.date===d),explicit=new Set(live.filter(a=>!a.sharedLessonKey&&a.origin!=='automatic'&&a.origin!=='shared-subject').map(a=>a.demandId));
  for(const t of dd.teachers){const person=ctx.people.find(p=>p.id===t.staffId);if(!person)continue;for(let period=0;period<t.cells.length;period++){if(!person.active&&!s.adhoc.some(a=>!a.deletedAt&&a.date===d&&a.staffId===person.id&&a.periods.includes(period)))continue;const cell=t.cells[period];if(!selected.has(subjectNormal(cell?.[0])))continue;const key=sharedLessonKey(d,period,cell);if(!key)continue;if(!groups.has(key))groups.set(key,[]);const rows=groups.get(key);if(!rows.some(row=>samePerson(ctx,row.staffId,t.staffId)))rows.push(t);}}
  const identityConflicts=new Set(A.teacherSource(ctx,d).rows.filter(r=>r.identityConflict).map(r=>r.person.id)),grouped=new Map(),out=[];
  for(const row of raw){const key=!row.noReliefRequired&&selected.has(subjectNormal(row.subject))?sharedLessonKey(d,row.period,[row.subject,row.className,row.venue]):null;if(!key||!groups.has(key)||groups.get(key).length<2||explicit.has(row.id)){out.push(row);continue;}if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);}
  for(const [key,members] of grouped){members.sort((a,b)=>a.id.localeCompare(b.id));const first=members[0],join=k=>[...new Set(members.map(m=>m[k]).filter(Boolean))].join(' + '),present=groups.get(key).filter(t=>!identityConflicts.has(t.staffId)&&!s.absences.some(a=>!a.deletedAt&&a.date===d&&samePerson(ctx,a.staffId,t.staffId)&&absencePeriods(ctx,a).includes(first.period))&&!live.some(a=>a.demandId!=='shared:'+key&&samePerson(ctx,a.staffId,t.staffId)&&a.period===first.period&&!a.noRelief&&!a.remove)).map(t=>t.staffId).sort();
   out.push({...first,id:'shared:'+key,sharedLessonKey:key,members:copy(members),absenceIds:members.map(m=>m.absenceId),absentIds:members.map(m=>m.staffId),name:join('name'),className:join('className'),groupName:join('groupName'),groupIds:[...new Set(members.flatMap(m=>m.groupIds||[]))],sharedPresentIds:present});
  }
  return [...out,...recessDemand(ctx,s,d)];
 }

 function recessPeriods(activation,dd,level){
  const custom=activation.periodsByLevel?.[level],recess=(dd.recesses||[]).find(r=>r.level===level);
  return [...new Set(custom||recess?.periods||(Number.isInteger(recess?.period)?[recess.period]:[]))].filter(p=>dd.periods.some(t=>t.period===p)).sort((a,b)=>a-b);
 }
 function recessClassKey(name){return String(name||'').trim().replace(/^(?:primary|pri|p)\s*(?=[1-6])/i,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
 function recessActiveOn(row,d){return !row.deletedAt&&(Array.isArray(row.dates)?row.dates.includes(d):d>=row.from&&d<=row.to);}
 function recessBaseName(s){return String(s.recessSettings?.baseName||'Haze Recess');}
 function recessGroups(s,dd){
  const groups=new Map();
  for(const cls of dd?.formClasses||[]){
   const suffix=String(cls.suffix||cls.name.replace(/^(?:P(?:rimary)?\s*)?[1-6]\s*/i,'')).trim()||cls.name,key=allocation().norm(suffix),id='recess-group:'+encodeURIComponent(key);
   if(!groups.has(id))groups.set(id,{id,name:recessBaseName(s)+' '+suffix,suffix,classes:[],classNames:[],levels:[]});
   const group=groups.get(id);if(group.classes.some(c=>c.id===cls.id))continue;group.classes.push(copy(cls));group.classNames.push(cls.name);if(!group.levels.includes(cls.level))group.levels.push(cls.level);
  }
  return [...groups.values()].map(g=>({...g,levels:g.levels.sort((a,b)=>a-b)})).sort((a,b)=>a.suffix.localeCompare(b.suffix,'en',{numeric:true}));
 }
 function recessSettingsApply(s,ctx,p){
  smc(ctx);const baseName=text(p.baseName,80);if(!baseName)fail(400,'Enter a base name for recess supervision.');
  const before={baseName:recessBaseName(s)};s.recessSettings={baseName};allocation().addAudit(s,ctx,'saveRecessSettings',{before,after:copy(s.recessSettings)});return {savedIds:[],settings:copy(s.recessSettings)};
 }
 function recessDemand(ctx,s,d){
  const dd=ctx.days[d];if(!dd?.schoolDay||dd.verified===false)return [];
  const found=new Map(),groups=recessGroups(s,dd),byClass=new Map(groups.flatMap(g=>g.classes.map(c=>[c.id,g]))),existing=allocation().effectiveAssignments(s).filter(a=>a.date===d&&a.recessActivationId);
  for(const activation of s.recessActivations||[]){
   if(!recessActiveOn(activation,d))continue;
   for(const cls of dd.formClasses||[]){if(!activation.levels.includes(cls.level))continue;
    const moved=dd.staplerRecesses?.find(r=>r.classId===cls.id),periodsForClass=activation.periodsByLevel?.[cls.level]||moved?.periods||recessPeriods(activation,dd,cls.level);for(const period of periodsForClass){
     const slot='recess:'+d+':'+(cls.timetableClassId||cls.id)+':'+period,prior=found.get(slot);if(prior){prior.recessActivationIds.push(activation.id);continue;}
     const priorCover=existing.find(a=>a.period===period&&recessClassKey(a.className)===recessClassKey(cls.name)),id=priorCover?.demandId||slot;
     const timing=dd.periods.find(p=>p.period===period),group=byClass.get(cls.id),venue=ctx.quotaRequested===false&&priorCover?.timetableId===dd.id?priorCover.venue||'':cls.venue||'';
     found.set(slot,{id,absenceId:null,staffId:null,name:group.name,virtualTeacherId:group.id,virtualTeacherName:group.name,groupSuffix:group.suffix,date:d,period,timeStart:timing.start,timeEnd:timing.end,subject:'Recess supervision',className:cls.name,classId:cls.id,level:cls.level,venue,groupName:'',lessonKey:id,timetableId:dd.id,recessActivationId:activation.id,recessActivationIds:[activation.id]});
    }
   }
  }
  return [...found.values()];
 }
 function recessView(s,ctx,p){
  smc(ctx);const d=date(p.date||ctx.today),dd=day(ctx,d,false);
  return {settings:{baseName:recessBaseName(s)},virtualTeachers:recessGroups(s,dd),activations:copy(s.recessActivations.filter(a=>!a.deletedAt)),formClasses:copy(dd?.formClasses||[]),recesses:copy(dd?.recesses||[]),date:d,available:dd?.schoolDay===true&&dd?.verified!==false};
 }
 function recessApply(s,ctx,p){
  smc(ctx);const A=allocation(),old=p.id?s.recessActivations.find(a=>a.id===p.id&&!a.deletedAt):null;
  if(p.id&&!old)fail(409,'This activation changed. Refresh.');
  const removing=p.operation==='deleteRecess';if(removing&&!old)fail(404,'Activation not found.');
  let row=old,values;
  if(!removing){
   const ds=dates(p),levels=p.levels;if(!Array.isArray(levels)||!levels.length||levels.some(n=>!Number.isInteger(n)||n<1||n>6))fail(400,'Select affected primary levels.');
   if(ds.at(-1)<ctx.today)fail(403,'Past supervision uses audited historical correction.');
   const selected=[...new Set(levels)].sort(),periodsByLevel={};
   for(const [key,ps] of Object.entries(p.periodsByLevel||{})){if(!selected.includes(Number(key))||!Array.isArray(ps)||!ps.length||ps.some(n=>!Number.isInteger(n)||n<0||n>39))fail(400,'Choose valid recess periods.');periodsByLevel[key]=[...new Set(ps)].sort((a,b)=>a-b);}
   for(const d of ds){const dd=day(ctx,d);if(dd.verified===false)fail(409,'Verify the school calendar before activating Recess Regression.');if(!dd.schoolDay)continue;
    if(!dd.formClasses?.length)fail(409,'Form classes are unavailable. Check the active timetable.');
    for(const level of selected){if(!dd.formClasses.some(c=>c.level===level)||!recessPeriods({periodsByLevel},dd,level).length)fail(409,'Missing form classes or recess timing for Primary '+level+'.');}
   }
   values={from:ds[0],to:ds.at(-1),dates:ds,levels:selected,periodsByLevel};
  }
  const before=row?copy(row):null;if(!row){row={id:ctx.uuid(),version:0,createdAt:ctx.iso,createdBy:ctx.user.email};s.recessActivations.push(row);}
  if(removing)row.deletedAt=ctx.iso;else Object.assign(row,values);row.version++;row.updatedAt=ctx.iso;row.updatedBy=ctx.user.email;
  const affected=new Set([...Object.keys(ctx.days),...s.assignments.filter(a=>(a.recessActivationIds||[a.recessActivationId]).includes(row.id)).map(a=>a.date)]);
  for(const a of s.assignments){if(!a.recessActivationId||!['draft','published'].includes(a.status))continue;
   const stillRequired=s.recessActivations.some(r=>recessActiveOn(r,a.date)&&r.levels.includes(a.level||primaryLevel(a.className))&&(!(r.periodsByLevel||{})[a.level||primaryLevel(a.className)]||r.periodsByLevel[a.level||primaryLevel(a.className)].includes(a.period)));
   if(!stillRequired)releaseAssignment(s,ctx,a,'Recess Regression shortened or deactivated.');
  }
  for(const d of affected)A.bumpDay(s,d);
  A.addAudit(s,ctx,p.operation,{date:ctx.today,ids:[row.id],before,after:copy(row)});
  reconcile(s,ctx);updateHealthWarnings(s,ctx,[...affected]);
  // Activation only creates demand. SMC explicitly runs Auto-allocate, then publishes.
  return {savedIds:[row.id],savedId:row.id,drafts:[]};
 }

 function allDemand(ctx,s){return Object.keys(ctx.days).flatMap(d=>demand(ctx,s,d));}
 function demandChoices(ctx,s){const grouped=allDemand(ctx,s),ids=new Set(grouped.map(d=>d.id));return [...grouped,...Object.keys(ctx.days).flatMap(d=>individualDemand(ctx,s,d)).filter(d=>!ids.has(d.id))];}
 function currentAssignments(s,d){return s.assignments.filter(a=>a.date===d&&['draft','published'].includes(a.status));}
 function assignedCount(s,id,d){return allocation().accounted(s).filter(a=>a.staffId===id&&inWeek(a.date,d)).reduce((n,a)=>n+allocation().cost(a),0);}
 function availability(s,ctx,id,d,ps,ignoreDemands=[],teachers,lessons=[]){
  if(new Set(ps).size!==ps.length)fail(409,'One teacher cannot cover multiple lessons in the same period.');staff(ctx,id);day(ctx,d);const A=allocation(),t=(teachers||A.teacherContext({...s,assignments:s.assignments.filter(a=>!ignoreDemands.includes(a.demandId))},ctx,d)).get(id),values=[],added=[];
  for(const p of [...ps].sort((a,b)=>a-b)){const lesson=lessons.find(row=>row.period===p)||{period:p};values.push(A.eligibility(t,p,added,{demand:lesson}));added.push(lesson);}const first=values[0]||A.eligibility(t,0),reasons=[...new Set(values.flatMap(v=>v.reasons))],warnings=[...new Set(values.flatMap(v=>v.warnings))];
  return {...first,available:!reasons.length,autoEligible:values.every(v=>v.autoEligible),employmentPeriodRestricted:values.some(v=>v.employmentPeriodRestricted),reasons,warnings,capViolation:values.some(v=>v.capViolation),capOnlyViolation:values.some(v=>v.capViolation)&&values.every(v=>v.available||v.capOnlyViolation),consecutive:Math.max(0,...values.map(v=>v.consecutive))};
 }
 function candidates(s,ctx,ids,source){const ds=demandChoices(ctx,s).filter(d=>ids.includes(d.id));if(!ids.length||ds.length!==new Set(ids).size||new Set(ds.map(d=>d.date)).size!==1)fail(400,'Select current lessons for one date.');if(!(ctx.user.smc||ctx.user.admin)&&ds.some(d=>d.staffId!==ctx.user.staffId))fail(403,'Select your own affected lessons.');const d=ds[0].date,ps=[...new Set(ds.map(d=>d.period))],sourceIds=ds.map(d=>d.staffId),teachers=allocation().teacherContext({...s,assignments:s.assignments.filter(a=>!ids.includes(a.demandId))},ctx,d,source);return ctx.people.filter(p=>allocation().reliefCandidateEligible(p)&&!sourceIds.includes(p.id)&&(p.active||s.adhoc.some(a=>a.staffId===p.id&&a.date===d&&!a.deletedAt))).map(p=>availability(s,ctx,p.id,d,ps,ids,teachers,ds)).sort((a,b)=>Number(b.available)-Number(a.available)||Number(b.external)-Number(a.external)||a.assigned-b.assigned||a.consecutive-b.consecutive||a.name.localeCompare(b.name));}
 function protectedOwnCover(a,ids){return allocation().protectedAssignment(a)&&ids.some(id=>a.demandId===id||(a.members||[]).some(m=>m.id===id)&&!(a.status==='draft'&&a.origin==='shared-subject'&&!a.replaces));}
 function peerReservation(s,ctx,recipientId,d,ps,ignoreId){return allocation().pendingPeerRequests(s,ctx,d).find(r=>r.id!==ignoreId&&samePerson(ctx,r.recipientId,recipientId)&&r.periods.some(period=>ps.includes(period)));}
 // Proposal capture needs source and attendance checks, not quota accounting.
 // Acceptance below still performs the full current eligibility check.
 function peerProposalChoice(s,ctx,input,d,ds){
  const A=allocation(),person=staff(ctx,input.recipientId),dd=day(ctx,d),source=A.teacherSource(ctx,d)?.rows.find(row=>row.person.id===person.id),external=s.adhoc.find(row=>row.date===d&&!row.deletedAt&&samePerson(ctx,row.staffId,person.id)),ps=ds.map(row=>row.period);
  if(!A.reliefCandidateEligible(person))fail(403,'This staff category is not included in relief candidates.');
  if(dd.schoolDay!==true||dd.verified===false||!source||source.identityConflict||person.adhocEligible===false||!external&&(!person.active||!source.t||source.t.adhoc))fail(409,'Choose a colleague with an active verified timetable or activated relief availability.');
  if(new Set(ps).size!==ps.length)fail(409,'One colleague cannot cover multiple lessons in the same period.');
  if(external&&ps.some(period=>!external.periods.includes(period)))fail(409,'The colleague is not activated for these periods.');
  if(s.absences.some(a=>a.date===d&&!a.deletedAt&&source.ids.has(a.staffId)&&absencePeriods(ctx,a).some(period=>ps.includes(period))))fail(409,'The colleague is reported absent during a selected period.');
  if(peerReservation(s,ctx,person.id,d,ps))fail(409,'This colleague already has a peer arrangement awaiting approval in a selected period.');
  const ids=new Set(ds.map(row=>row.id)),own=A.effectiveAssignments(s).filter(a=>a.date===d&&source.ids.has(a.staffId)&&!a.noRelief&&!ids.has(a.demandId));
  if(input.combination===true){
   if(ds.length!==1)fail(400,'Combine one lesson and period at a time.');const dem=ds[0],cell=source.t?.cells[dem.period]||['','','',''],ordinary=own.find(a=>a.period===dem.period&&!a.combination&&!a.repurposedDuty),base=A.isClassLesson(cell)?{subject:cell[0],className:cell[1],venue:cell[2],groupName:cell[3]}:ordinary||null,sameClass=!!base&&A.norm(base.className)===A.norm(dem.className);
   if(!person.active||!base||!sameClass&&own.some(a=>a.period===dem.period&&a.combination&&!a.sameClass))fail(409,'This colleague cannot combine that class during this period.');
   if(input.expectedRecipientCell!==undefined&&JSON.stringify(cell)!==JSON.stringify(input.expectedRecipientCell))fail(409,'The colleague’s lesson changed. Review this class combination.');
   return {combineBase:base,sameClass};
  }
  if(ps.some(period=>source.base.has(period)||own.some(a=>a.period===period)))fail(409,'The colleague is already occupied during a selected period.');
  return {};
 }
 function peerProposalSource(ctx,input,ds){
  if(input.expectedLessons===undefined)return;
  if(!input.expectedLessons||typeof input.expectedLessons!=='object'||Array.isArray(input.expectedLessons))fail(400,'Supply the selected lesson sources.');
  for(const dem of ds){const expected=input.expectedLessons[dem.id],dd=day(ctx,dem.date);if(!expected||expected.lessonKey!==dem.lessonKey||expected.timetableId!==dem.timetableId||expected.parity!==dd.parity)fail(409,'A selected lesson changed. Review your retained colleague choices.');}
 }
 function createPeerRequests(s,ctx,p,a){
  if(!Array.isArray(p.requests)||!p.requests.length||p.requests.length>40)fail(400,'Select colleagues for at least one lesson.');
  const A=allocation(),used=new Set(),rows=[],retained=[],preview={...s,requests:s.requests.slice()};
  for(const input of p.requests){
   const ds=findDemands(s,ctx,input.demandIds);if(ds.some(x=>x.sharedLessonKey||x.absenceId!==a.id))fail(400,'Select this absence’s lessons.');
   if(ds.some(x=>used.has(x.id)))fail(400,'A lesson can be requested only once.');ds.forEach(x=>used.add(x.id));
   if(ctx.intakePeer){const prior=preview.requests.find(r=>r.absenceId===a.id&&r.recipientId===input.recipientId&&r.combination===(input.combination===true)&&r.createdBy===ctx.user.email&&['pending','accepted','approved'].includes(r.status)&&r.demandIds.length===input.demandIds.length&&r.demandIds.every(id=>input.demandIds.includes(id))&&r.lessons?.every(old=>ds.some(d=>d.id===old.id&&d.lessonKey===old.lessonKey&&d.timetableId===old.timetableId)));if(prior){peerProposalSource(ctx,input,ds);retained.push(prior.id);continue;}}
   if(A.pendingPeerRequests(preview,ctx,a.date).some(r=>r.demandIds.some(id=>input.demandIds.includes(id))))fail(409,'A colleague request is already pending for this lesson.');
   if(A.effectiveAssignments(s).some(x=>protectedOwnCover(x,input.demandIds)))fail(409,'A lesson already has protected or published cover.');
   if(samePerson(ctx,input.recipientId,a.staffId))fail(409,'Choose another colleague.');peerProposalSource(ctx,input,ds);
   const choice=p.proposalOnly===true?peerProposalChoice(preview,ctx,input,a.date,ds):mutualChoice(preview,ctx,input.recipientId,a.date,ds,input.combination===true);
   const row={id:ctx.uuid(),staffId:a.staffId,absentName:a.name,absenceId:a.id,date:a.date,periods:ds.map(x=>x.period),demandIds:input.demandIds.slice(),lessons:copy(ds),recipientId:input.recipientId,recipientName:staff(ctx,input.recipientId).name,combination:input.combination===true,originalLesson:input.combination===true?copy(choice.combineBase):null,status:'pending',peerArranged:true,proposalOnly:p.proposalOnly===true,createdAt:ctx.iso,createdBy:ctx.user.email,expiresAt:expiry(ctx,a.date),reason:''};
   rows.push(row);preview.requests.push(row);
  }
  for(const row of rows){
   for(const assignment of s.assignments)if(row.demandIds.includes(assignment.demandId)&&assignment.status==='draft'&&!A.protectedAssignment(assignment)){assignment.status='cancelled';assignment.cancelledAt=ctx.iso;assignment.cancellationReason='Peer arrangement awaiting approval replaces unpublished automatic allocation.';}
   s.requests.push(row);queue(s,ctx,'mutual_request',row.recipientId,row.date,{peerRequestId:row.id,combination:row.combination,periods:row.periods.slice(),channels:['whatsapp','email'],recipientEmails:reportEmails(staff(ctx,row.recipientId)),summary:a.name+' requests '+(row.combination?'class combination':'relief')+' for period(s) '+row.periods.join(', ')+'. Please approve or reject in GSiS.'},row.id,'mutual:'+row.id);
  }
  return [...retained,...rows.map(row=>row.id)];
 }
 function mutualChoice(s,ctx,recipientId,d,ds,combination,ignoreRequestId){if(!allocation().reliefCandidateEligible(staff(ctx,recipientId)))fail(403,'This staff category is not included in relief candidates.');if(peerReservation(s,ctx,recipientId,d,ds.map(row=>row.period),ignoreRequestId))fail(409,'This colleague already has a peer arrangement awaiting approval in a selected period.');if(ignoreRequestId)s={...s,requests:s.requests.filter(row=>row.id!==ignoreRequestId)};if(combination){if(ds.length!==1)fail(400,'Combine one lesson and period at a time.');const c=allocation().manualRanks(allocation().manualModel(s,ctx,d),ds[0]).find(t=>t.staffId===recipientId);if(!c?.combineAllowed)fail(409,'This colleague cannot combine that class during this period.');return c;}const av=availability(s,ctx,recipientId,d,ds.map(x=>x.period),ds.map(x=>x.id),undefined,ds);if(!av.available||!av.external&&av.warnings.length)fail(409,[...av.reasons,...av.warnings].join(' '));return av;}
 function expiry(ctx,d){return Math.min(ctx.now+7*86400000,Date.parse(d+'T23:59:59+08:00')+86400000);}
 function ensurePrivateLink(s,ctx,staffId,d){allocation().ensure(s);const key='duties|'+staffId+'|'+d;let link=s.privateLinks[key];if(!link){link={staffId,date:d,purpose:'duties',issuedAt:ctx.now,expiresAt:ctx.now+7*86400000};s.privateLinks[key]=link;}return copy(link);}
 function queue(s,ctx,kind,recipientId,d,data,requestId,key){if(s.outbox.some(j=>j.key===key))return;const p=staff(ctx,recipientId);s.outbox.push({id:ctx.uuid(),key,kind,recipientId,mobile:mobile(p.mobile),name:p.name,date:d,requestId:requestId||null,data,status:'queued',createdAt:ctx.iso,expiresAt:expiry(ctx,d),linkIssuedAt:ctx.now,linkExpiresAt:ctx.now+7*86400000,attempts:0});}
 function snapshot(a,dem,ctx){const person=staff(ctx,a.staffId);return {...a,...dem,staffId:person.id,relieverName:person.name,absentId:dem.staffId,absentName:dem.name,id:a.id,demandId:dem.id,sourceKey:JSON.stringify([dem.timetableId,dem.subject,dem.className,dem.venue,dem.groupName]),instructions:ctx.instruction||'',customInstructions:ctx.customInstruction||''};}
 function sameAssignmentSource(a,d){
  if(a.sharedLessonKey||d.sharedLessonKey)return a.sharedLessonKey===d.sharedLessonKey&&a.timetableId===d.timetableId;
  const className=a.recessActivationId&&d.recessActivationId&&recessClassKey(a.className)===recessClassKey(d.className)?a.className:d.className;
  return a.sourceKey===JSON.stringify([d.timetableId,d.subject,className,d.venue,d.groupName]);
 }
 function findDemands(s,ctx,ids,allowSaved=false){if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length)fail(400,'Select unique relief lessons.');const all=demandChoices(ctx,s),ds=ids.map(id=>all.find(d=>d.id===id)||((allowSaved&&(ctx.user.smc||ctx.user.admin))?savedManualDemand(s,id):null));if(ds.some(d=>!d)||new Set(ds.map(d=>d.date)).size!==1)fail(409,'Relief lessons changed. Refresh.');if(ds.some(d=>d.date<ctx.today)&&!(ctx.user.smc||ctx.user.admin))fail(403,'Past relief records are view only.');return ds;}
 function savedManualDemand(s,id){
  const manual=Object.values(s.manualDecisions||{}).find(row=>row.demandId===id);if(!manual)return null;const a=allocation().effectiveAssignments(s,true).find(row=>row.date===manual.date&&row.demandId===id)||[...s.assignments].reverse().find(row=>row.date===manual.date&&row.demandId===id&&!row.remove);let source;try{const fields=JSON.parse(manual.sourceKey||'null');if(Array.isArray(fields)&&fields.length===7)source={staffId:fields[0],timetableId:fields[1],period:fields[2],subject:fields[3],className:fields[4],venue:fields[5],groupName:fields[6]};}catch(_){}if(!a&&!source)return null;
  return {...(a?copy(a):{}),id, date:manual.date,staffId:a?.absentId??manual.absentIds?.[0]??null,name:a?.absentName||a?.name||'',...(source||{}),absentIds:copy(manual.absentIds||[]),manualDecision:copy(manual),reviewReason:a?.reviewReason||'The original lesson is no longer in the current allocation plan.'};
 }
 function manualRecoveryDemands(s,ctx,d){const current=new Set(demand(ctx,s,d).map(row=>row.id));return allocation().manualOwnership(s,d).filter(row=>!current.has(row.demandId)).map(row=>savedManualDemand(s,row.demandId)).filter(Boolean).map(row=>({...row,recoverySourceKey:cellSourceKey(row)}));}
 function overrideCheck(s,ids,p){if(s.assignments.some(a=>ids.includes(a.demandId)&&a.status==='published'&&a.mutual)&&p.confirmOverride!==true)fail(409,'Confirm overriding a mutually arranged assignment.');}
 function invalidate(s,ctx,a,reason){allocation().ensure(s);return releaseAssignment(s,ctx,a,reason);}
 function reconcile(s,ctx){
  let changed=false;const A=allocation(),ds=allDemand(ctx,s),lookup=new Map(ds.map(d=>[d.id,d])),requestLookup=new Map(demandChoices(ctx,s).map(d=>[d.id,d])),sources=new Map();
  function currentAvailability(a){
   // Only timetable/identity joins are immutable during reconciliation. A previous
   // invalidation can free a period or cap headroom, so rebuild current balances.
   if(!sources.has(a.date)){const source=A.teacherSource(ctx,a.date);sources.set(a.date,{dd:source.dd,rows:new Map(source.rows.map(row=>[row.person.id,row]))});}
   const source=sources.get(a.date),row=source.rows.get(a.staffId),teachers=A.teacherContext({...s,assignments:s.assignments.filter(x=>x.demandId!==a.demandId)},ctx,a.date,{dd:source.dd,rows:row?[row]:[]});
   return availability(s,ctx,a.staffId,a.date,[a.period],[a.demandId],teachers,[a]);
  }
  for(const a of s.assignments){if(!['draft','published'].includes(a.status)||a.date<ctx.today||a.sharedLessonKey&&s.assignments.some(r=>r.replaces===a.id&&['draft','published'].includes(r.status)))continue;const dd=ctx.days[a.date],absence=s.absences.find(x=>x.id===a.absenceId);let reason='';
   if(Array.isArray(ctx.timetableEntries)&&(typeof GSISRoster!=='undefined'?GSISRoster:require('./roster.js')).active(ctx.timetableEntries,a.date)?.id!==a.timetableId)reason='The effective timetable changed. Review and reassign this lesson.';
   else if(!a.sharedLessonKey&&a.origin!=='recess'&&!a.recessActivationId&&(!absence||absence.deletedAt||!absence.reliefRequired||!absencePeriods(ctx,absence).includes(a.period)))reason='Absence or lesson no longer requires cover.';
   else if(!a.noRelief&&!a.remove&&s.absences.some(x=>!x.deletedAt&&x.date===a.date&&samePerson(ctx,x.staffId,a.staffId)&&absencePeriods(ctx,x).includes(a.period)))reason='Covering colleague reported absent.';
   else if(dd&&dd.verified!==false){const d=lookup.get(a.demandId);if(!d)reason='Absence or lesson no longer requires cover.';else if(!sameAssignmentSource(a,d))reason='Source timetable or lesson changed.';else if(a.origin==='shared-subject'&&(!d.sharedPresentIds?.includes(a.staffId)||!a.combination))reason='Shared lesson supervision changed.';else if(a.origin!=='shared-subject'&&!a.noRelief&&!a.remove&&a.combination){const c=allocation().manualRanks(allocation().manualModel(s,ctx,a.date),d,{includeExcluded:true}).find(x=>x.staffId===a.staffId);if(!c?.combineAllowed)reason='Class combination is no longer feasible.';}else if(!a.noRelief&&!a.remove&&!a.combination){const av=a.repurposedDuty?allocation().manualRanks(allocation().manualModel(s,ctx,a.date),d,{includeExcluded:true}).find(c=>c.staffId===a.staffId):currentAvailability(a);if(!av||!av.available)reason=av?.reasons.join(' ')||'Repurposed recess duty is no longer available.';else if(allocation().protectedAssignment(a)&&ctx.quotaRequested!==false){const warnings=av.warnings.filter(w=>!a.overrideReason||!a.overrideWarnings?.includes(w));const next=warnings.join(' ');if(next!==String(a.workloadReview||'')){a.workloadReview=next;a.reviewRequired=!!next;allocation().addAudit(s,ctx,'workload-review',{date:a.date,ids:[a.id],warnings});changed=true;}}}}
   if(reason){const released=invalidate(s,ctx,a,reason);changed=released||changed;if(released&&a.status==='cancelled'&&a.sharedLessonKey&&a.replaces){const prior=s.assignments.find(r=>r.id===a.replaces&&r.sharedLessonKey&&r.staffId===a.staffId);if(prior)changed=invalidate(s,ctx,prior,reason)||changed;}}
   else if(a.invalidCover){delete a.invalidCover;delete a.reviewReason;a.reviewRequired=!!a.workloadReview;A.bumpDay(s,a.date);A.addAudit(s,ctx,'manual-choice-valid',{date:a.date,ids:[a.id]});changed=true;}
   else if(a.sharedLessonKey&&lookup.has(a.demandId)&&!A.manualDecision(s,a.date,a.demandId)){
    const dem=lookup.get(a.demandId),next=snapshot(a,dem,{...ctx,instruction:assignmentInstructions(s,dem),customInstruction:customText(s,dem)}),membersChanged=JSON.stringify(a.members)!==JSON.stringify(next.members);
    if(membersChanged&&A.periodStarted(ctx,a.date,a.period,a)){changed=invalidate(s,ctx,a,'Shared lesson membership changed after the period started.')||changed;}
    else if(membersChanged&&a.status==='published'){
     const replacement={...next,id:ctx.uuid(),status:'draft',protected:true,replaces:a.id,version:1,createdAt:ctx.iso,createdBy:ctx.user.email};delete replacement.publishedAt;delete replacement.publishedBy;s.assignments.push(replacement);A.bumpDay(s,a.date);A.addAudit(s,ctx,'shared-lesson-members-draft',{date:a.date,ids:[replacement.id],previous:a.id,absenceIds:replacement.absenceIds});changed=true;
    }
    else if(!A.periodEnded(ctx,a.date,a.period,a)&&JSON.stringify([a.members,a.instructions,a.customInstructions])!==JSON.stringify([next.members,next.instructions,next.customInstructions])){const published=a.status==='published';Object.assign(a,next,{version:(a.version||1)+1,updatedAt:ctx.iso});A.bumpDay(s,a.date);A.addAudit(s,ctx,'shared-lesson-members',{date:a.date,ids:[a.id],absenceIds:a.absenceIds});if(published)queuePublication(s,ctx,[publicationSnapshot(s,ctx,a,'instructions')]);changed=true;}
   }
  }
  for(const r of s.requests)if(r.status==='pending'&&(r.expiresAt<ctx.now||r.date<ctx.today||r.demandIds.some(id=>{if(!ctx.days[r.date]||ctx.days[r.date].verified===false)return false;const current=requestLookup.get(id),prior=r.lessons.find(x=>x.id===id);return !current||!prior||JSON.stringify([prior.timetableId,prior.subject,prior.className,prior.venue,prior.groupName])!==JSON.stringify([current.timetableId,current.subject,current.className,current.venue,current.groupName]);}))){r.status='cancelled';r.reason='Request expired or lesson changed.';r.updatedAt=ctx.iso;changed=true;}
  for(const dem of ds){if(A.manualDecisionForDemand(s,dem)||!dem.sharedLessonKey||!dem.sharedPresentIds.length||A.periodStarted(ctx,dem.date,dem.period,dem))continue;const existing=A.effectiveAssignments(s).find(a=>a.demandId===dem.id);if(existing){if(existing.origin!=='automatic')continue;if(!releaseAssignment(s,ctx,existing,'A timetabled co-teacher is present.'))continue;}
   const target=dem.sharedPresentIds[0],base=ctx.days[dem.date].teachers.find(t=>t.staffId===target).cells[dem.period],row=snapshot({id:ctx.uuid(),staffId:target,status:'draft',origin:'shared-subject',replaces:existing?.replaces||null,protected:true,combination:true,sameClass:true,originalLesson:copy(base),rCost:0,version:1,createdAt:ctx.iso,createdBy:'shared subject rule'},dem,{...ctx,instruction:assignmentInstructions(s,dem),customInstruction:customText(s,dem)});s.assignments.push(row);A.bumpDay(s,dem.date);A.addAudit(s,ctx,'shared-lesson-combine',{date:dem.date,ids:[row.id],absenceIds:dem.absenceIds,staffId:target});changed=true;
  }
  return changed;
 }
 // Instruction concurrency follows the absence and its live lesson dependencies,
 // not unrelated school-wide writes. Instruction text itself is compared per cell.
 function instructionScope(a,ctx){
  const dd=ctx.days[a.date];if(!dd)return null;
  return JSON.stringify([1,a.id,a.staffId,a.date,a.typeId,absencePeriods(ctx,a),a.coverage||null,a.reliefRequired,a.noReliefSubjects||null,a.deletedAt||null,dd.id,dd.parity,dd.staplerRevision||0,dd.schoolDay,dd.verified,lessons(ctx,a).map(l=>[l.period,l.lessonKey,l.timeStart,l.timeEnd])]);
 }
 function absencePublic(a,ctx){return {...a,periods:copy(absencePeriods(ctx,a)),timetablePending:absenceTimingPending(ctx,a),...(ctx.days[a.date]?{instructionScope:instructionScope(a,ctx)}:{}),noReliefSubjects:copy(Array.isArray(a.noReliefSubjects)?a.noReliefSubjects:['PD','BLK','BLOCK','IMP'].map(value=>({type:'exact',value}))),editable:a.date>=ctx.today&&!a.deletedAt&&((ctx.user.smc||ctx.user.admin)||a.staffId===ctx.user.staffId)};}
 function ownAnnualRelief(s,ctx){
  const A=allocation(),year=A.year(ctx.today),week=A.monday(ctx.today),id=ctx.user.staffId,historyVerified=s.accountingYears?.[year]?.verified===true,seen=new Set();
  const quotas=(s.entitlements||[]).filter(row=>row.staffId===id&&row.year===year&&row.week<=week);let entitlement=0,valid=true,completed=0,committed=0;
  for(const row of quotas){if(!/^\d{4}-\d{2}-\d{2}$/.test(row.week)||seen.has(row.week)||!Number.isFinite(row.quota)||row.quota<0){valid=false;continue;}seen.add(row.week);entitlement+=row.excluded?0:row.quota;}
  const publishedDates=new Set(),visibleAssignments=[],snapshots=new Map((s.publicationSnapshots||[]).map((entry,index)=>[entry.id,{entry,index}]));
  for(const [d,publication] of Object.entries(s.dailyPublicationStates||{})){
   if(!Array.isArray(publication.teachers)||publication.teachers.some(row=>!Array.isArray(row.snapshotIds)))continue;
   publishedDates.add(d);const selected=new Set(publication.teachers.flatMap(row=>row.snapshotIds)),latest=new Map();
   for(const {entry} of [...selected].map(key=>snapshots.get(key)).filter(value=>value?.entry.date===d).sort((a,b)=>a.index-b.index))latest.set(entry.assignmentId,entry);
   for(const entry of latest.values())if(entry.assignment)visibleAssignments.push({...entry.assignment,status:entry.kind==='cancelled'?'cancelled':entry.assignment.status==='completed'?'completed':'published'});
  }
  visibleAssignments.push(...s.assignments.filter(a=>a.status!=='draft'&&!publishedDates.has(a.date)));
  const actualIds=new Set((s.reliefCorrections||[]).map(row=>row.assignmentId));
  for(const original of s.assignments)if(original.actualReviewRequired||actualIds.has(original.id)&&original.status!=='draft'){
   const visible=visibleAssignments.find(row=>row.id===original.id);if(visible){if(original.actualReviewRequired){visible.actualReviewRequired=true;visible.actualStatusBeforeReplacement=original.actualStatusBeforeReplacement;}}else visibleAssignments.push({...original});
  }
  const accounting={...s,assignments:visibleAssignments,importedRelief:(s.importedRelief||[]).filter(a=>a.status!=='draft')};
  for(const a of A.accounted(accounting,ctx)){
   if(a.staffId!==id||(a.accountingYear||A.year(a.date))!==year||!['published','completed'].includes(a.status)&&a.completionStatus!=='completed')continue;
   if(A.reliefCompleted(a,ctx))completed+=A.cost(a);else committed+=A.cost(a);
  }
  const currentWeekRecorded=seen.has(week),reason=!valid?'Recorded weekly quotas need review.':!historyVerified?'Relief history has not been verified.':!quotas.length?'No weekly quota history is recorded.':!currentWeekRecorded?'This week’s quota has not been recorded yet.':entitlement<=0?'No relief quota is recorded for this period.':'';
  return {year,completed,committed,spent:completed+committed,entitlement:valid&&quotas.length?entitlement:null,utilisation:reason?null:100*(completed+committed)/entitlement,historyVerified,currentWeekRecorded,recordedWeeks:seen.size,reason};
 }
 function dutiesView(s,ctx,p){
  const id=ctx.user.staffId,d=date(p.date||ctx.today),ownAssignments=[...s.assignments.filter(a=>a.staffId===id&&!a.publicationWithheldAt&&!s.dailyPublicationStates?.[a.date]),...[...latestPublications(s).values()].filter(v=>v.staffId===id&&s.dailyPublicationStates?.[v.date]&&v.kind!=='cancelled').map(v=>({...v.assignment,instructions:v.instructions,customInstructions:v.customInstructions}))],requests=s.requests.filter(r=>r.recipientId===id||r.staffId===id),ids=new Set([id,...requests.flatMap(r=>[r.recipientId,r.staffId])]);
  return {annualRelief:ownAnnualRelief(s,ctx),pendingNotices:acknowledgementView(s,ctx),timetableNotices:ownTimetableNotices(s,ctx),revision:s.revision,allocationRevision:s.dayRevisions?.[d]||0,date:d,today:ctx.today,user:copy(ctx.user),quotaUnits:'periods/week',people:ctx.people.filter(x=>ids.has(x.id)).map(({id,name})=>({id,name})),types:[],periods:[],timetable:null,absences:[],ownAbsences:[],demands:[],assignments:copy(ownAssignments.filter(a=>a.date===d&&a.status==='published')),mutualRequests:copy(requests),adhoc:[],myDuties:ownAssignments.filter(a=>['published','completed'].includes(a.status)&&!a.noRelief&&!a.remove).map(publicDuty),myDutyUpdates:[],warnings:[],notifications:{configured:ctx.notificationsConfigured===true,pending:s.outbox.filter(j=>j.status==='queued'&&j.recipientId===id).length},checkedAt:ctx.iso};
 }
 function mineView(s,ctx,p){
  const d=date(p.date||ctx.today),own=s.absences.filter(a=>!a.deletedAt&&a.staffId===ctx.user.staffId).map(a=>absencePublic(a,ctx));
  return {revision:s.revision,allocationRevision:s.dayRevisions?.[d]||0,date:d,today:ctx.today,user:copy(ctx.user),quotaUnits:'periods/week',people:ctx.people.filter(x=>(ctx.user.smc||ctx.user.admin)||x.active||s.adhoc.some(a=>!a.deletedAt&&a.date===d&&a.staffId===x.id)).map(({id,name})=>({id,name})),types:copy(s.types),noReliefSubjects:copy(operationalSettings(s).systemConfig.noReliefSubjects),periods:copy(own.find(a=>a.date===d)?.periodSnapshot||own.find(a=>a.periodSnapshot)?.periodSnapshot||[]),timetable:null,absences:own,ownAbsences:own,demands:[],assignments:[],mutualRequests:[],adhoc:[],myDutyUpdates:[],myDuties:[],warnings:[],notifications:{configured:ctx.notificationsConfigured===true,pending:0}};
 }
 function schoolAbsencesRange(ctx,p){
  const from=date(p.viewFrom||p.from||ctx.today),to=date(p.viewTo||p.to||allocation().addDays(from,1));
  if(to<from)fail(400,'Choose an end date on or after the start date.');return {from,to};
 }
 function schoolAbsencesView(s,ctx,p){
  smc(ctx);const {from,to}=schoolAbsencesRange(ctx,p),records={...ctx,days:{}};
  return {revision:s.revision,date:from,from,to,today:ctx.today,user:copy(ctx.user),people:ctx.people.map(({id,name})=>({id,name})),types:copy(s.types),absences:s.absences.filter(a=>!a.deletedAt&&a.date>=from&&a.date<=to).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id)).map(a=>absencePublic(a,records)),ownAbsences:[],checkedAt:ctx.iso};
 }
 function reportFormView(s,ctx,p={}){
  const visible=ctx.people.filter(person=>ctx.user.smc||ctx.user.admin||person.id===ctx.user.staffId),mapping={...s,nameBridges:copy(s.nameBridges||[])};seedNameBridges(mapping,ctx.people);
  return {schema:1,revision:s.revision,date:date(p.date||ctx.today),today:ctx.today,minute:ctx.minute,user:{...copy(ctx.user),accessVerified:true},people:visible.map(person=>({id:person.id,name:person.name,active:person.active,absenceEligible:absenceEligible(person)})),timetablePeople:ctx.people.map(({id,name})=>({id,name})),types:copy(s.types),noReliefSubjects:copy(operationalSettings(s).systemConfig.noReliefSubjects),nameBridges:mapping.nameBridges.map(({timetableName,staffId})=>({timetableName,staffId})),checkedAt:ctx.iso};
 }
 function reportView(s,ctx,p){
  const d=date(p.date||ctx.today),dd=day(ctx,d,false),selected=(ctx.user.smc||ctx.user.admin)?(p.staffId||s.absences.find(a=>a.id===(p.absenceId||p.id))?.staffId||ctx.user.staffId):ctx.user.staffId,selectedIds=new Set(p.staffIds===undefined?[selected]:absenceStaffIds(ctx,p)),own=s.absences.filter(a=>!a.deletedAt&&selectedIds.has(a.staffId)),rows=own.filter(a=>a.date===d),ids=new Set(rows.map(a=>a.id));
  const base=ctx.baselineDays?.[d]||dd,baselineTimetable=base?{id:base.id,parity:base.parity,perDay:base.periods.length,schoolDay:base.schoolDay,warning:base.warning||'',staplerRevision:0,teachers:(base.teacherIdentities||base.teachers).map(t=>({staffId:t.staffId,name:t.name,timetableName:t.timetableName||t.name,...(selectedIds.has(t.staffId)?{cells:copy(base.teachers.find(x=>x.staffId===t.staffId)?.cells||[])}:{})}))}:null;
  return {revision:s.revision,allocationRevision:s.dayRevisions?.[d]||0,date:d,today:ctx.today,user:copy(ctx.user),compact:true,baselineTimetable,quotaUnits:'periods/week',people:ctx.people.filter(x=>(ctx.user.smc||ctx.user.admin)||x.id===selected).map(person=>({id:person.id,name:person.name,active:person.active,absenceEligible:absenceEligible(person)})),types:copy(s.types),noReliefSubjects:copy(operationalSettings(s).systemConfig.noReliefSubjects),periods:copy(dd?.periods||[]),timetable:dd?{id:dd.id,parity:dd.parity,perDay:dd.periods.length,schoolDay:dd.schoolDay,warning:dd.warning||'',staplerRevision:dd.staplerRevision||0,teachers:(dd.staplerRevision?dd.teachers:dd.teacherIdentities||dd.teachers).map(t=>{const cells=selectedIds.has(t.staffId)?dd.teachers.find(x=>x.staffId===t.staffId)?.cells:null;return {staffId:t.staffId,name:t.name,timetableName:t.timetableName||t.name,...(cells?{cells:copy(cells)}:{})};})}:null,absences:rows.map(a=>absencePublic(a,ctx)),ownAbsences:own.map(a=>absencePublic(a,ctx)),demands:rows.filter(a=>a.reliefRequired).flatMap(a=>lessons(ctx,a)),assignments:s.assignments.filter(a=>(ids.has(a.absenceId)||(a.absenceIds||[]).some(id=>ids.has(id)))&&((ctx.user.smc||ctx.user.admin)||a.status==='published'&&!a.publicationWithheldAt&&(a.staffId===ctx.user.staffId||(a.absentId===ctx.user.staffId||(a.absentIds||[]).includes(ctx.user.staffId))))).map(publicDuty),mutualRequests:copy(s.requests.filter(r=>ids.has(r.absenceId))),adhoc:[],myDutyUpdates:[],myDuties:[],warnings:dd?.warning?[dd.warning]:[],notifications:{configured:ctx.notificationsConfigured===true,pending:0},checkedAt:ctx.iso};
 }
 function notificationReadinessView(s,ctx,p){
  smc(ctx);return {revision:s.revision,date:date(p.date||ctx.today),today:ctx.today,user:copy(ctx.user),people:[],types:[],periods:[],timetable:null,absences:[],ownAbsences:[],demands:[],assignments:[],mutualRequests:[],adhoc:[],myDutyUpdates:[],myDuties:[],warnings:[],notifications:{configured:ctx.notificationsConfigured===true,pending:s.outbox.filter(j=>j.status==='queued').length},notificationIssues:s.outbox.filter(j=>['failed','uncertain','blocked'].includes(j.status)).map(({id,kind,date,status,error,providerError})=>({id,kind,date,status,error,...(providerError?{providerError:copy(providerError)}:{})})),checkedAt:ctx.iso};
 }
 function historyReady(s,ctx,d){const projection={...s,accountingYears:copy(s.accountingYears),audit:[]};allocation().initialiseHistory(projection,ctx,d);return projection.accountingYears?.[d.slice(0,4)]?.verified===true;}
 function customInstructionsView(s,ctx,p){
  smc(ctx);const d=date(p.date||ctx.today),dd=day(ctx,d,false);
  return {...notificationReadinessView(s,ctx,p),periods:copy(ctx.customPeriods||dd?.periods||[]),teachingGroups:copy(ctx.teachingGroups||dd?.teachingGroups||[]),customInstructions:s.customInstructions.filter(r=>!r.deletedAt).map(r=>({...copy(r),enabled:r.enabled!==false})),ongoingCustomInstructions:true};
 }
 function view(s,ctx,p={}){if(p.view==='allocationLearning')return allocationLearningView(s,ctx);if(p.view==='reportForm')return reportFormView(s,ctx,p);if(p.view==='schoolAbsences')return schoolAbsencesView(s,ctx,p);if(p.operation==='currentDuty'||p.view==='currentDuty')return currentDuty(s,ctx);if((p.view==='custom'||['saveCustomInstruction','deleteCustomInstruction','setCustomInstructionEnabled'].includes(p.operation))&&(ctx.user.smc||ctx.user.admin))return customInstructionsView(s,ctx,p);if(p.view==='teacherDailyUpdate')return teacherDailyUpdate(s,ctx,p);if(p.view==='systemConfig')return systemConfigView(s,ctx);if(p.view==='nameBridges'||['nameBridges','saveNameBridge','deleteNameBridge'].includes(p.operation))return nameBridgesView(s,ctx);if(p.view==='dailyNotify'||['dailyNotify','notifyDaily'].includes(p.operation))return dailyNotifyView(s,ctx,p);if(p.view==='systemConfig'||['systemConfig','saveSystemConfig'].includes(p.operation))return systemConfigView(s,ctx);if(p.view==='dailyEmployment'||['dailyEmployment','saveDailyEmploymentSettings','sendDailyEmploymentReport'].includes(p.operation))return dailyEmploymentView(s,ctx,p);if(p.view==='staplerDates'||['staplerDates','renameStapler','moveStapler','deleteStapler','restoreStapler'].includes(p.operation))return staplerDatesView(s,ctx);if(p.view==='stapler'||['stapler','createStapler','importStapler','saveStapler','confirmStapler','publishStapler','resetStapler','requestStapler','decideStapler'].includes(p.operation))return staplerView(s,ctx,p);if(p.view==='dutyRoster'||p.operation==='dutyRoster'||p.operation==='setDutySMC')return dutyRosterView(s,ctx,p);if(p.view==='notificationReadiness')return notificationReadinessView(s,ctx,p);if(p.compact===true&&['report','entry'].includes(p.view))return reportView(s,ctx,p);if(p.view==='recess')smc(ctx);if(p.view==='duties')return dutiesView(s,ctx,p);if(p.view==='mine')return mineView(s,ctx,p);const d=date(p.date||ctx.today),dd=day(ctx,d,false),own=s.absences.filter(a=>!a.deletedAt&&a.staffId===ctx.user.staffId),school=s.absences.filter(a=>!a.deletedAt&&a.date===d),requests=s.requests.filter(r=>(ctx.user.smc||ctx.user.admin)?r.date===d:r.recipientId===ctx.user.staffId||r.staffId===ctx.user.staffId),assign=s.assignments.filter(a=>a.date===d&&((ctx.user.smc||ctx.user.admin)||a.status==='published'&&!a.publicationWithheldAt&&(a.staffId===ctx.user.staffId||(a.absentId===ctx.user.staffId||(a.absentIds||[]).includes(ctx.user.staffId)))));
  return {...((ctx.user.smc||ctx.user.admin)&&p.view==='recess'?{recess:recessView(s,ctx,p)}:{}),...((ctx.user.smc||ctx.user.admin)&&['allocation','smc'].includes(p.view)?p.view==='allocation'?allocationView(s,ctx,p):{allocationModel:allocationProjection(s,ctx,p),publishAudit:publishAudit(s,ctx,d)}:{}),revision:s.revision,allocationRevision:s.dayRevisions?.[d]||0,date:d,today:ctx.today,allowAdvancePublishing:s.systemConfig.allowAdvancePublishing===true,canPublish:(ctx.user.smc||ctx.user.admin)===true&&!publishDateIssue(ctx,d,s),user:copy(ctx.user),quotaUnits:'periods/week',people:ctx.people.filter(x=>(ctx.user.smc||ctx.user.admin)||x.active||s.adhoc.some(a=>!a.deletedAt&&a.date===d&&a.staffId===x.id)).map(x=>({id:x.id,name:x.name,active:x.active,employment:x.employment,adhocEligible:x.adhocEligible!==false,absenceEligible:absenceEligible(x),...((ctx.user.smc||ctx.user.admin)?{mobile:x.mobile}: {})})),types:copy(s.types),noReliefSubjects:copy(operationalSettings(s).systemConfig.noReliefSubjects),periods:copy(dd?.periods||[]),timetable:dd?{id:dd.id,parity:dd.parity,staplerRevision:dd.staplerRevision||0,verified:dd.verified,schoolDay:dd.schoolDay,warning:dd.warning||'',teachers:dd.teachers.map(t=>{if(p.compact===true&&p.view==='allocation')return {staffId:t.staffId,name:t.name,timetableName:t.timetableName||t.name};const row=copy(t);for(const key of ['rawR','originalR','timetableFactor','teachingWeight','offloadFactor','fullTimeTeacherCount','periodCap','capConfigured','capBasis','capNonTeachingPeriods','capWeekDays','capWorkload','capHeadroom','capVerified'])delete row[key];if(!(ctx.user.smc||ctx.user.admin)&&t.staffId!==ctx.user.staffId)delete row.R;return row;})}:null,absences:((ctx.user.smc||ctx.user.admin)&&p.scope!=='mine'?school:own).map(a=>absencePublic(a,ctx)),ownAbsences:own.map(a=>absencePublic(a,ctx)),demands:(['report','entry','mine'].includes(p.view)?individualDemand(ctx,s,d):demand(ctx,s,d)).filter(x=>(ctx.user.smc||ctx.user.admin)||x.staffId===ctx.user.staffId||(x.absentIds||[]).includes(ctx.user.staffId)),assignments:copy(assign),mutualRequests:copy(requests),adhoc:(ctx.user.smc||ctx.user.admin)?copy(s.adhoc.filter(a=>!a.deletedAt&&a.date===d)):[],myDutyUpdates:copy(s.assignments.filter(a=>a.publishedAt&&['invalidated','cancelled'].includes(a.status)&&a.staffId===ctx.user.staffId)),myDuties:copy(s.assignments.filter(a=>a.status==='published'&&!a.publicationWithheldAt&&!a.noRelief&&!a.remove&&a.staffId===ctx.user.staffId)),warnings:dd?.warning?[dd.warning]:[],notifications:{configured:ctx.notificationsConfigured===true,pending:s.outbox.filter(j=>j.status==='queued'&&((ctx.user.smc||ctx.user.admin)||j.recipientId===ctx.user.staffId)).length},...((ctx.user.smc||ctx.user.admin)?{acknowledgementStatus:smcAcknowledgements(s,d),smcAlerts:copy((s.smcAlerts||[]).filter(x=>x.date===d&&(x.origin!=='whatsapp-urgent'||(x.recipients||[]).includes(ctx.user.staffId)))),accountingVerified:historyReady(s,ctx,d)}:{}),...((ctx.user.smc||ctx.user.admin)||ctx.user.admin?{notificationIssues:s.outbox.filter(j=>['failed','uncertain','blocked'].includes(j.status)).map(({id,kind,date,status,error,providerError})=>({id,kind,date,status,error,...(providerError?{providerError:copy(providerError)}:{})}))}:{})};
 }
 function instructionPatches(s,ctx,p){
  const changes=p.instructionChanges,ids=p.absenceIds||[p.absenceId];
  if(!Array.isArray(changes)||!changes.length||!Array.isArray(ids)||ids.length!==changes.length||new Set(changes.map(c=>c?.absenceId)).size!==changes.length||changes.some(c=>!ids.includes(c?.absenceId)))fail(400,'Select valid absence instruction changes.');
  const records=new Map(instructionRecords(s,ctx,ids).map(a=>[a.id,a]));
  const selected=day(ctx,date(p.date||ctx.today));
  if(p.expectedTimetableId!==selected.id||p.expectedParity!==selected.parity||p.expectedStaplerRevision!==(selected.staplerRevision||0))fail(409,'The timetable changed. Refresh instructions and review your draft.');
  // Prepare every merge before modifying any record; one conflict rejects the batch.
  return changes.map(change=>{
   const a=records.get(change.absenceId);editable(ctx,a);if(absenceTimingPending(ctx,a))fail(409,'The absence is saved. Add relief instructions when a verified school timetable is available.');
   const scope=p.expectedInstructionScopes?.[a.id];if(typeof scope!=='string'||scope!==instructionScope(a,ctx))fail(409,'The absence or its lessons changed. Refresh instructions and review your draft.');
   const lessonSnapshot=lessons(ctx,a),known=new Set(lessonSnapshot.map(l=>l.lessonKey)),base=instructionMap(change.base,known),values=instructionMap(change.values,known),keys=Object.keys(values);
   if(keys.length!==Object.keys(base).length||keys.some(key=>!Object.prototype.hasOwnProperty.call(base,key)))fail(400,'Each changed instruction needs its original value.');
   if(typeof change.baseInstructionsNA!=='boolean'||typeof change.instructionsNA!=='boolean')fail(400,'Set the original and new instruction status.');
   const instructions={...(a.instructions||{})};
   for(const key of keys){if(base[key]===values[key])continue;const current=instructions[key]||'';if(current!==base[key]&&current!==values[key])fail(409,'These lesson instructions were changed by another user. Refresh and review your draft.');instructions[key]=values[key];}
   let instructionsNA=a.instructionsNA===true;if(change.baseInstructionsNA!==change.instructionsNA){if(instructionsNA!==change.baseInstructionsNA&&instructionsNA!==change.instructionsNA)fail(409,'The instruction status changed. Refresh and review your draft.');instructionsNA=change.instructionsNA;}
   return {a,instructions,instructionsNA,lessonSnapshot};
  });
 }
 function instructionRecords(s,ctx,ids){if(!Array.isArray(ids)||!ids.length||ids.length>366*150||new Set(ids).size!==ids.length)fail(400,'Select valid absence records.');const byId=new Map(s.absences.map(a=>[a.id,a])),rows=ids.map(id=>{const a=byId.get(id);if(!a)fail(404,'Absence record not found.');return a;});absenceDates({dates:rows.map(a=>a.date)},ctx);return rows;}
 function instructionMap(input,known){
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Invalid relief instructions.');const out={};
  for(const [key,value] of Object.entries(input)){if(!known.has(key))fail(409,'Lessons changed. Refresh instructions.');if(typeof value!=='string'||value.length>8000)fail(400,'Instructions must be text of at most 8000 characters.');out[key]=value;}return out;
 }
 // R17: allocation, accounting and notification commands share the existing atomic store.
 function allocation(){return typeof GSISRosterAllocation!=='undefined'?GSISRosterAllocation:require('./roster-allocation.js');}
 // Dates, identities and authority stay server-owned; the plan is a versioned draft in the same atomic document.
 function clock(value){if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))fail(400,'Choose a valid time.');return Number(value.slice(0,2))*60+Number(value.slice(3));}
 function dutyWindow(row,d,now){if(!row)return false;if(row.startDate&&row.endDate)return d>=row.startDate&&d<=row.endDate;return row.date===d;}
 // Keep expanded days as the alert-routing contract. Named lists own future edits.
 function dutyLists(s){
  if(Array.isArray(s.smcDutyLists))return s.smcDutyLists;
  const rows=[...s.smcDutyRoster].sort((a,b)=>a.date.localeCompare(b.date)),lists=[];
  const signature=r=>JSON.stringify([r.rangeId||'',r.startDate||r.date,r.endDate||r.date,r.staffIds,r.source,r.updatedAt,r.updatedBy]);
  for(const row of rows){const prior=lists.at(-1),key=signature(row);if(prior&&prior.legacyKey===key&&Date.parse(row.date)-Date.parse(prior.endDate)===86400000){prior.endDate=row.date;prior.legacyDates.push(row.date);}else lists.push({id:'legacy-duty:'+row.date+':'+lists.length,name:'SMC duty '+row.date,startDate:row.date,endDate:row.date,staffIds:copy(row.staffIds||[]),source:copy(row.source||null),version:1,updatedAt:row.updatedAt||null,updatedBy:row.updatedBy||null,legacyKey:key,legacyDates:[row.date]});}
  return lists;
 }
 function persistDutyLists(s,lists){
  if(Array.isArray(s.smcDutyLists))return;
  s.smcDutyLists=lists.map(({legacyKey,legacyDates,...row})=>row);
  const owners=new Map(lists.flatMap(row=>(row.legacyDates||[]).map(d=>[d,row.id])));
  for(const row of s.smcDutyRoster)row.dutyListId=owners.get(row.date);
 }
 function dutyRosterView(s,ctx,p){
  smc(ctx);const d=date(p.date||ctx.today),source=ctx.dutySources?.[d],row=s.smcDutyRoster.find(r=>r.date===d),lists=dutyLists(s);
  return {date:d,today:ctx.today,revision:s.revision,people:source?.available?ctx.people.filter(t=>source.staffIds.includes(t.id)&&(ctx.smcIds||[]).includes(t.id)&&dutyEligible(t)).map(({id,name})=>({id,name})):[],lists:lists.map(({legacyKey,legacyDates,...list})=>({...copy(list),status:list.deletedAt?'Deleted':list.endDate<ctx.today?'Past':list.startDate>ctx.today?'Upcoming':'Current',members:list.staffIds.map(id=>({id,name:ctx.people.find(p=>p.id===id)?.name||id}))})).sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.id.localeCompare(b.id)),duty:row?{staffIds:copy(row.staffIds),startDate:row.startDate||d,endDate:row.endDate||d}:{staffIds:[],startDate:d,endDate:d},source:source?.source||null,available:source?.available===true,warning:source?.available?'':'Contacts could not provide a verified SMC list. Saved duty lists are retained. Retry to edit them.'};
 }
 function dutyListApply(s,ctx,p){
  smc(ctx);const d=date(p.date||ctx.today),action=p.action||'save';if(!['save','activate','delete'].includes(action))fail(400,'Choose a duty list action.');
  const lists=dutyLists(s),legacyDateRow=!p.action&&!p.listId?s.smcDutyRoster.find(r=>r.date===d):null,prior=lists.find(r=>r.id===p.listId||legacyDateRow&&(r.id===legacyDateRow.dutyListId||r.legacyDates?.includes(d)));
  if((p.listId||action!=='save')&&!prior)fail(404,'Duty list no longer exists. Refresh the list.');if(prior?.deletedAt)fail(409,'This duty list was deleted. Refresh the list.');
  if(p.action&&prior&&p.listVersion!==prior.version)fail(409,'This duty list changed. Reload it before saving.');if(prior&&prior.endDate<ctx.today)fail(409,'Past duty lists are view only. Create a new list.');
  const source=ctx.dutySources?.[d];if(!source?.available)fail(409,'Contacts could not provide a verified SMC list.');
  let next=null,selected=[];
  if(action!=='delete'){
   const name=text(action==='activate'?prior.name:p.name??prior?.name??'SMC duty '+d,160),staffIds=action==='activate'?prior.staffIds:p.staffIds;
   if(!name)fail(400,'Enter a duty list name.');if(!Array.isArray(staffIds)||staffIds.length>100||staffIds.some(id=>!source.staffIds.includes(id)||!(ctx.smcIds||[]).includes(id)||!dutyEligible(staff(ctx,id))))fail(400,'Select eligible active SMC teachers. SLs, AMs and OMs are excluded.');if(p.action&&!staffIds.length)fail(400,'Select at least one duty member.');
   const startDate=date(action==='activate'?ctx.today:p.startDate||d),endDate=date(action==='activate'?prior.endDate:p.endDate||startDate);selected=dates({from:startDate,to:endDate});
   if(startDate<ctx.today&&(!prior||startDate!==prior.startDate))fail(400,'Start a new duty range today or later. Past duty dates are retained.');if(endDate<ctx.today)fail(400,'Choose an end date today or later.');
   const overlap=lists.find(r=>r.id!==prior?.id&&!r.deletedAt&&r.endDate>=ctx.today&&startDate<=r.endDate&&endDate>=r.startDate);
   if(overlap)fail(409,'Duty dates overlap "'+overlap.name+'" ('+overlap.startDate+' to '+overlap.endDate+'). Edit or delete that list first.');
   next={id:prior?.id||ctx.uuid(),name,startDate,endDate,staffIds:[...new Set(staffIds)],source:copy(source.source||null),version:(prior?.version||0)+1,createdAt:prior?.createdAt||ctx.iso,createdBy:prior?.createdBy||ctx.user.email,updatedAt:ctx.iso,updatedBy:ctx.user.email,...(action==='activate'?{activatedAt:ctx.iso,activatedBy:ctx.user.email}:{})};
  }else if(p.confirm!==true)fail(400,'Confirm deletion of this duty list.');
  persistDutyLists(s,lists);const before=prior?copy(s.smcDutyLists.find(r=>r.id===prior.id)):null;
  // Historical daily membership survives edits, activation and deletion.
  if(prior)s.smcDutyRoster=s.smcDutyRoster.filter(r=>r.dutyListId!==prior.id||r.date<ctx.today);
  if(action==='delete'){const row=s.smcDutyLists.find(r=>r.id===prior.id);Object.assign(row,{deletedAt:ctx.iso,deletedBy:ctx.user.email,version:row.version+1});}
  else{const index=s.smcDutyLists.findIndex(r=>r.id===next.id);if(index<0)s.smcDutyLists.push(next);else s.smcDutyLists[index]=next;for(const dayKey of selected.filter(day=>day>=ctx.today))s.smcDutyRoster.push({date:dayKey,dutyListId:next.id,rangeId:next.id,staffIds:copy(next.staffIds),startDate:next.startDate,endDate:next.endDate,source:copy(next.source),updatedAt:ctx.iso,updatedBy:ctx.user.email});s.smcDutyRoster.sort((a,b)=>a.date.localeCompare(b.date));}
  allocation().addAudit(s,ctx,'setDutySMC',{date:d,action,listId:next?.id||prior.id,before,after:copy(next||s.smcDutyLists.find(r=>r.id===prior.id))});return {savedIds:[next?.id||prior.id]};
 }


 function rememberAutoBaseline(s,d,rows){if(s.massPublications[d])return;const baseline=s.manualAuditBaselines[d]||(s.manualAuditBaselines[d]={});for(const a of rows)if(a.origin==='automatic'&&!a.noRelief&&!baseline[a.demandId])baseline[a.demandId]={staffId:a.staffId,name:a.relieverName||a.staffId,period:a.period,className:a.className,assignmentId:a.id};}
 function publishAudit(s,ctx,d){if(s.massPublications[d])return {firstPublish:false,required:false,changes:[]};const before=s.manualAuditBaselines[d]||{},current=allocation().effectiveAssignments(s).filter(a=>a.date===d&&!a.noRelief&&!a.remove),changes=[];for(const a of current){if(a.origin==='automatic')continue;const old=before[a.demandId],flags=[...(old&&old.staffId!==a.staffId?['Changed automatic allocation']:[]),...(a.overrideWarnings||[])];if(flags.length)changes.push({demandId:a.demandId,period:a.period,className:a.className,beforeName:old?.name||'Unassigned',afterName:a.relieverName||staff(ctx,a.staffId).name,flags});}return {firstPublish:true,required:false,changes};}
 function decisionValue(s,ctx,dem){const a=allocation().effectiveAssignments(s,true).find(a=>a.demandId===dem.id),manual=allocation().manualDecision(s,dem.date,dem.id);return {staffId:a&&!a.noRelief?a.staffId:null,name:a&&!a.noRelief?(a.relieverName||ctx.people.find(p=>p.id===a.staffId)?.name||a.staffId):null,kind:a?.noRelief?'noRelief':a?'assignment':manual?.kind==='empty'?'empty':'unassigned',ownership:manual?'smc':a?.origin==='automatic'?'automatic':a?.origin||'automatic',invalidCover:!!a?.invalidCover,provenance:cellProvenance(s,ctx,dem.date,[dem.id])[dem.id]};}
 function clearManualOwnership(s,dem){const absent=new Set(dem.absentIds||[dem.staffId]);for(const [key,row] of Object.entries(s.manualDecisions||{}))if(row.date===dem.date&&(row.demandId===dem.id||row.period===dem.period&&(row.absentIds||[]).some(id=>absent.has(id))))delete s.manualDecisions[key];}
 function stampCellDecision(s,ctx,dem,kind){const key=dem.date+'|'+dem.id,previous=s.cellDecisionVersions?.[key];s.cellDecisionVersions=s.cellDecisionVersions||{};return s.cellDecisionVersions[key]={date:dem.date,token:ctx.uuid(),version:(previous?.version||0)+1,actor:ctx.user.email,actorName:ctx.people.find(p=>p.id===ctx.user.staffId)?.name||ctx.user.email,at:ctx.iso,kind};}
 function essentialDecisionAudit(s,ctx,operation,detail){const event=allocation().addAudit(s,ctx,operation,detail);delete event.auditExportSuppressed;event.essential=true;return event;}
 function peerOverrides(s,ctx,ds,recipientId){
  const ids=new Set(ds.flatMap(d=>[d.id,...(d.members||[]).map(m=>m.id)])),d=ds[0].date,periods=ds.map(row=>row.period);
  return s.requests.filter(r=>r.date===d&&['pending','approved'].includes(r.status)&&(r.demandIds.some(id=>ids.has(id))||r.status==='pending'&&recipientId&&samePerson(ctx,r.recipientId,recipientId)&&r.periods.some(period=>periods.includes(period))));
 }
 function supersedePeerRequests(s,ctx,p,rows){
  if(!rows.length)return;const reason=text(p.reason||'',1000)||'SMC manually superseded this peer arrangement with '+p.operation+'.';
  for(const r of rows){const previousStatus=r.status,previousActor=r.respondedBy||r.createdBy||r.staffId;r.status='cancelled';r.peerApproved=false;r.reason=reason;r.supersededBy=ctx.user.email;r.supersededAt=ctx.iso;r.updatedAt=ctx.iso;
   essentialDecisionAudit(s,ctx,'peer-override',{date:r.date,ids:[r.id],demandIds:r.demandIds.slice(),previousStatus,previousActor,previousName:previousStatus==='approved'?r.recipientName:ctx.people.find(person=>person.email===previousActor||person.id===previousActor)?.name||r.absentName,recipientId:r.recipientId,recipientName:r.recipientName,reason,choice:p.operation,requestId:ctx.requestId||null});allocation().bumpDay(s,r.date);
  }
 }
 function recordManualDecision(s,ctx,dem,kind,row,before,operation,warnings=[]){clearManualOwnership(s,dem);const key=dem.date+'|'+dem.id,provenance=stampCellDecision(s,ctx,dem,kind);s.manualDecisions[key]={date:dem.date,demandId:dem.id,kind,absentIds:[...new Set(dem.absentIds||[dem.staffId])],staffId:kind==='assignment'?row.staffId:null,assignmentId:row?.id||null,actor:ctx.user.email,at:ctx.iso,period:dem.period,sourceKey:cellSourceKey(dem)};allocation().bumpDay(s,dem.date);essentialDecisionAudit(s,ctx,operation,{date:dem.date,ids:row?[row.id]:[],decisionChanges:[{lesson:{demandId:dem.id,period:dem.period,className:dem.className,subject:dem.subject,venue:dem.venue},before,after:decisionValue(s,ctx,dem),warnings,provenance}],requestId:ctx.requestId||null});}
 function cellProvenance(s,ctx,d,ids){const A=allocation(),rows=new Map(A.effectiveAssignments(s,true).filter(a=>a.date===d).map(a=>[a.demandId,a]));return Object.fromEntries(ids.map(id=>{const a=rows.get(id),manual=A.manualDecision(s,d,id),meta=s.cellDecisionVersions?.[d+'|'+id],latest=manual?(meta||manual):a?{actor:a.updatedBy||a.createdBy||a.origin,at:a.updatedAt||a.createdAt,kind:a.origin}:meta,actor=latest?.actor||null,actorName=latest?.actorName||ctx.people.find(p=>p.email===actor||p.id===actor)?.name||(actor==='automatic'?'Automatic allocation':actor);return [id,{token:JSON.stringify([meta?.token||null,manual?.assignmentId||null,manual?.kind||null,manual?.actor||null,manual?.at||null,a?.id||null,a?.invalidCover===true]),version:meta?.version||0,actor,actorName,at:latest?.at||null,kind:latest?.kind||'unassigned'}];}));}

 function cellDecisions(s,d,ids){
  const A=allocation(),byDemand=new Map();for(const a of A.effectiveAssignments(s,true))if(a.date===d&&!byDemand.has(a.demandId))byDemand.set(a.demandId,a);
  return Object.fromEntries(ids.map(id=>{const a=byDemand.get(id),manual=A.manualDecision(s,d,id);return [id,{staffId:a&&!a.noRelief?a.staffId:null,noRelief:!!a?.noRelief,combination:!!a?.combination,manual:!!manual,cleared:manual?.kind==='empty'}];}));
 }
 function cellDecision(s,d,id){return cellDecisions(s,d,[id])[id];}
 function unassign(s,ctx,p){smc(ctx);const A=allocation(),ds=findDemands(s,ctx,p.demandIds||[],true),rows=A.effectiveAssignments(s,true).filter(a=>ds.some(d=>d.id===a.demandId));rememberAutoBaseline(s,ds[0].date,rows);supersedePeerRequests(s,ctx,p,peerOverrides(s,ctx,ds));for(const dem of ds){const before=decisionValue(s,ctx,dem);for(const a of rows.filter(a=>a.demandId===dem.id))releaseAssignment(s,{...ctx,draftBatch:true,manualMutation:true},a,'SMC cleared this allocation');recordManualDecision(s,ctx,dem,'empty',null,before,p.operation||'unassign');}return {savedIds:rows.map(a=>a.id)};}
 function returnAutomatic(s,ctx,p){smc(ctx);const A=allocation(),ds=findDemands(s,ctx,p.demandIds||[],true),savedIds=[];supersedePeerRequests(s,ctx,p,peerOverrides(s,ctx,ds));for(const dem of ds){const before=decisionValue(s,ctx,dem),old=A.effectiveAssignments(s,true).find(a=>a.demandId===dem.id);clearManualOwnership(s,dem);if(old){if(old.invalidCover||old.noRelief){releaseAssignment(s,{...ctx,draftBatch:true,manualMutation:true},old,'SMC returned the lesson to automatic allocation');}else if(old.status==='draft'){old.origin='automatic';old.protected=false;old.mutual=false;old.peerArranged=false;old.peerApproved=false;old.updatedBy=ctx.user.email;old.updatedAt=ctx.iso;}else{const row={...copy(old),id:ctx.uuid(),status:'draft',origin:'automatic',protected:false,mutual:false,peerArranged:false,peerApproved:false,replaces:old.id,createdAt:ctx.iso,createdBy:ctx.user.email};delete row.publishedAt;delete row.publishedBy;s.assignments.push(row);savedIds.push(row.id);}savedIds.push(old.id);}const provenance=stampCellDecision(s,ctx,dem,'automatic');A.bumpDay(s,dem.date);essentialDecisionAudit(s,ctx,'returnAutomatic',{date:dem.date,ids:savedIds,decisionChanges:[{lesson:{demandId:dem.id,period:dem.period,className:dem.className,subject:dem.subject},before,after:decisionValue(s,ctx,dem),warnings:[],provenance}]});}return {savedIds};}
 function stapler(){return typeof GSISRosterStapler!=='undefined'?GSISRosterStapler:require('./roster-stapler.js');}
 function staplerPermission(s,ctx,d){return (ctx.user.smc||ctx.user.admin)||d>=ctx.today&&(s.staplerRequests.some(r=>!r.retiredAt&&r.date===d&&r.staffId===ctx.user.staffId&&r.status==='approved'&&ctx.people.some(t=>t.id===r.staffId&&t.active)));}
 function staplerBaselineDay(ctx,d){const dd=ctx.baselineDays?.[d]||day(ctx,d,false);if(!dd?.id)fail(409,'No baseline timetable is in force on this date. Choose another date or ask Admin to upload its baseline.');if(dd.verified===false)fail(409,'Calendar has not verified this date. Retry Calendar before opening the planner.');if(!dd.parity)fail(409,'Calendar has not supplied the odd or even week for this date.');if(!dd.schoolDay)fail(409,'This is not a confirmed school day. Choose another suspension date.');return dd;}
 function staplerBaseline(s,ctx,d){const dd=staplerBaselineDay(ctx,d);return stapler().create({...dd,date:d},{date:d,venues:ctx.venues?.[d]||[],endOfDayMinutes:dd.endOfDayMinutes});}
 function staplerBaselineChanged(record,plan,dd){return !!record&&(record.baselineId!==dd.id||plan.parity!==dd.parity||JSON.stringify(plan.periods)!==JSON.stringify(dd.periods)||plan.endOfDayMinutes!==(dd.endOfDayMinutes??810));}
 function staplerView(s,ctx,p){const d=date(p.date||ctx.today),record=s.staplerPlans.find(r=>r.date===d),canEdit=staplerPermission(s,ctx,d),canViewConfirmed=mayViewConfirmed(s,ctx,record),confirmed=confirmedStaplerSnapshot(record,s.audit),plannerView=canEdit||!!record&&((ctx.user.smc||ctx.user.admin)||s.staplerRequests.some(r=>!r.retiredAt&&r.date===d&&r.staffId===ctx.user.staffId&&r.status==='approved')),source=ctx.dutySources?.[d],dd=canEdit?(ctx.baselineDays?.[d]||ctx.days[d]):null,saved=record?.draft||record?.published,baseline=canEdit&&!saved&&dd?.id&&dd.verified!==false&&dd.schoolDay&&dd.parity?staplerBaseline(s,ctx,d):null,plan=plannerView?(saved||baseline):canViewConfirmed?confirmed.plan:null,visibleRevision=plannerView?record?.revision||0:canViewConfirmed?confirmed.revision:0,baselineChanged=!!dd&&!!saved&&staplerBaselineChanged(record,saved,dd),comparison=plan?stapler().comparison(plan,dd):null;if(plan)stapler().validate(plan);const currentAbsences=plannerView&&plan?{date:d,revision:s.revision,checkedAt:ctx.iso,records:s.absences.filter(a=>a.date===d&&!a.deletedAt).map(a=>({id:a.id,staffId:a.staffId,name:a.name||ctx.people.find(t=>t.id===a.staffId)?.name||a.staffId,periods:copy(allocation().absencePeriods(a,{periods:plan.periods})),updatedAt:a.updatedAt||a.createdAt||''}))}:null;if(p.absencesOnly===true)return {date:d,currentAbsences};return {date:d,name:record?.name||'',today:ctx.today,revision:s.revision,currentAbsences,staplerRevision:visibleRevision,plan:plan?(plannerView?copy(plan):confirmedStaplerProjection(plan)):null,canViewConfirmed,viewMode:!plannerView&&canViewConfirmed?'confirmed':'planner',workloadWarnings:[],structuralValidation:plan?{version:stapler().validationVersion,date:d,baselineId:plan.baselineId,revision:visibleRevision}:null,published:plannerView&&record?.published?{revision:record.publishedRevision,at:record.publishedAt,by:record.publishedBy}:null,confirmed:confirmed&&(plannerView||canViewConfirmed)?{revision:confirmed.revision,at:confirmed.at,by:confirmed.by}:null,canEdit,planningAllowed:canEdit,canConfirm:canEdit&&!!plan,canPublish:false,baselineChanged,comparisonAvailable:!!dd?.id&&!!dd.periods?.length,comparisonBaselineId:dd?.id||null,comparisonIssues:comparison?.issues||[],comparisonGhosts:plannerView?comparison?.ghosts||[]:[],comparisonTiles:plannerView?comparison?.tiles||[]:[],canReset:canEdit&&!!dd?.id&&baselineChanged&&d>=ctx.today,accessRequests:copy(s.staplerRequests.filter(r=>!r.retiredAt&&r.date===d&&((ctx.user.smc||ctx.user.admin)||r.staffId===ctx.user.staffId))),sponsors:plannerView?ctx.people.filter(t=>(ctx.smcIds||[]).includes(t.id)&&teacherSponsor(t)).map(({id,name})=>({id,name})):[],people:canEdit?ctx.people.map(person=>({id:person.id,name:person.name,active:person.active,importEligible:stapler().importContactEligible(person)})):[],nameBridges:canEdit?copy(s.nameBridges.map(({timetableName,staffId})=>({timetableName,staffId}))):[],venues:canEdit?copy(ctx.venues?.[d]||[]):[],source:plannerView?source?.source||null:null};}
 const staplerAccountingCache=new WeakMap();
 function staplerAccounting(plan,subjectCategories=plan.subjectCategories){if(!staplerAccountingCache.has(plan))staplerAccountingCache.set(plan,new Map());const cached=staplerAccountingCache.get(plan),key=JSON.stringify(subjectCategories||{});if(!cached.has(key))cached.set(key,stapler().accounting(plan,subjectCategories));return cached.get(key);}

 function readyStaplerPlan(row){return row&&(row.confirmed||row.published)?row.draft||row.published:null;}
 function composeStaplerContext(s,ctx){
  if(ctx.snapshotContext||!s.staplerPlans?.length)return ctx;const base=ctx.baselineDays||ctx.days||{},days={...base},seen=new Set(),requested=new Set(Object.keys(base));if(!requested.size&&ctx.today)requested.add(ctx.today);
  for(const row of s.staplerPlans){if(!requested.has(row.date)||seen.has(row.date))continue;seen.add(row.date);const plan=readyStaplerPlan(row);if(!plan)continue;days[row.date]=stapler().effectiveDay(plan,base[row.date]);days[row.date].staplerRevision=row.revision;days[row.date].workloadIgnored=true;}
  return {...ctx,baselineDays:base,days};
 }

 // Schedule-only browsing deliberately shares the baseline viewer's all-staff scope.
 // Unlike dailyTimetable, this projection never includes private absence or duty details.
 function timetableBaseline(plan,d){
  const original=plan.baseline;
  if(!original||!Array.isArray(original.periods)||!Array.isArray(original.teachers)||!Array.isArray(original.tiles))return null;
  const periods=copy(original.periods),classes=original.classes||plan.classes,teachers=original.teachers.map(t=>({staffId:t.staffId,name:t.name,timetableName:t.timetableName||t.name,cells:periods.map(()=>['','','',''])})),byId=new Map(teachers.map(t=>[t.staffId,t]));
  for(const tile of original.tiles){
   const teacher=byId.get(tile.teacherId);if(!teacher||tile.kind!=='lesson'||tile.location!=='grid'||!periods.some(p=>p.period===tile.period))continue;
   const subject=String(tile.subject||''),safe=stapler().isOfflineAbsence(subject.replace(/[\r\n\u2028\u2029]/g,' '))?'Absent':subject;
   teacher.cells[tile.period]=[safe,(tile.classIds||[]).map(id=>classes.find(c=>c.id===id)?.name||'').filter(Boolean).join(', '),String(tile.venue||''),String(tile.group||'')];
  }
  const recesses=classes.flatMap(c=>{const rule=(original.recessDefaults||[]).find(r=>r.level===c.level),selected=rule?periods.filter(p=>p.startMinutes>=rule.startMinutes&&p.endMinutes<=rule.endMinutes).map(p=>p.period):[];return selected.length?[{className:c.name,periods:selected}]:[];});
  return {date:d,periods,teachers,classes:classes.map(c=>c.name),recesses};
 }
 function timetableDay(s,ctx,p){
  const d=date(p.date||ctx.today),base=ctx.baselineDays?.[d]||ctx.days[d],record=s.staplerPlans.find(r=>r.date===d),confirmed=ctx.user&&d>=ctx.today&&(ctx.user.smc||ctx.user.admin||Array.isArray(ctx.people)&&mayViewConfirmed(s,ctx,record))?confirmedStaplerSnapshot(record,s.audit):null;
  const useConfirmed=!!confirmed&&(!record.published||Number.isSafeInteger(record.publishedRevision)&&confirmed.revision>record.publishedRevision),snapshot=useConfirmed?null:s.dailyPublicationStates?.[d],plan=useConfirmed?confirmedStaplerProjection(confirmed.plan):record?.published,source=useConfirmed?'confirmed':'published';
  const calendar={status:'not-requested',verified:false},identity={date:d,baselineId:plan?.baselineId||base?.id||null,sourceRevision:s.revision,publicationRevision:0,calendar};
  if(!plan){if(snapshot?.staplerRevision)fail(409,'The published timetable source is unavailable. Ask SMC to review its publication.');return {...identity,source:'baseline',...(record?.confirmed&&d>=ctx.today&&ctx.user&&(ctx.user.smc||ctx.user.admin||Array.isArray(ctx.people)&&confirmedDateAccess(ctx)==='available')?{suspension:{status:'needs-reconfirmation',date:d,name:record.name||''}}:{}),periods:copy(base?.periods||[]),teachers:[]};}
  if(plan.date!==d||plan.baselineId!==record.baselineId)fail(409,'The '+source+' timetable identity does not match its saved date.');
  if(!useConfirmed&&(!Number.isSafeInteger(record.publishedRevision)||record.publishedRevision<1||snapshot&&(!Number.isSafeInteger(snapshot.sourceRevision)||snapshot.sourceRevision<0||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<1||snapshot.date!==d||snapshot.baselineId!==record.baselineId||snapshot.staplerRevision!==record.publishedRevision||JSON.stringify(snapshot.periods)!==JSON.stringify(plan.periods))))fail(409,'The timetable publication revision or period timings do not match. Ask SMC to republish.');
  const effective=stapler().effectiveDay(plan,base),deltas=new Map((snapshot?.teachers||[]).map(t=>[t.staffId,t]));
  const schedule=t=>{const cells=copy(deltas.get(t.staffId)?.cells||t.cells);if(cells.length!==plan.periods.length||cells.some(c=>!Array.isArray(c)||c.length!==4||c.some(v=>typeof v!=='string')))fail(409,'The '+source+' timetable cells need review.');for(const cell of cells)if(stapler().isOfflineAbsence(cell[0].replace(/[\r\n\u2028\u2029]/g,' ')))cell[0]='Absent';return {staffId:t.staffId,name:t.name,timetableName:t.timetableName||t.name,cells};};
  const teachers=effective.teachers.map(schedule);for(const t of deltas.values())if(!teachers.some(row=>row.staffId===t.staffId))teachers.push(schedule(t));
   const baseline=timetableBaseline(plan,d);
  return {...identity,source,...(useConfirmed?{sourceRevision:confirmed.revision,confirmedRevision:confirmed.revision,staplerRevision:confirmed.revision,readOnly:true}:{sourceRevision:snapshot?.sourceRevision??record.publishedRevision,publicationRevision:snapshot?.revision??record.publishedRevision,staplerRevision:record.publishedRevision}),periods:copy(plan.periods),teachers,baseline,classes:plan.classes.map(c=>c.name),recesses:(effective.staplerRecesses||[]).map(r=>({className:plan.classes.find(c=>c.id===r.classId)?.name||'',periods:copy(r.periods)}))};
 }
 function dailyTimetable(s,ctx,p){const d=date(p.date||ctx.today),id=((ctx.user.smc||ctx.user.admin)||ctx.user.admin)&&p.staffId?p.staffId:ctx.user.staffId;if(!id)fail(403,'A staff identity is required.');const publication=s.dailyPublicationStates?.[d],published=publication?.teachers.find(t=>t.staffId===id);if(publication){const reference=ctx.baselineDays?ctx.baselineDays[d]:ctx.days[d],matching=reference?.id===publication.baselineId&&JSON.stringify(reference.periods)===JSON.stringify(publication.periods),record=s.staplerPlans.find(r=>r.date===d),frozen=record?.published&&record.publishedRevision===publication.staplerRevision&&record.published.baselineId===publication.baselineId&&JSON.stringify(record.published.periods)===JSON.stringify(publication.periods)?stapler().effectiveDay(record.published):null,original=published?.baseline||(matching?reference.teachers.find(t=>t.staffId===id)?.cells:null),base=original||publication.periods.map(()=>['','','','']);return {date:d,name:ctx.people.find(t=>t.id===id)?.name||'',revision:publication.sourceRevision,periods:copy(publication.periods),baseline:{cells:copy(base)},modified:{cells:copy(published?.cells||(frozen?frozen.teachers.find(t=>t.staffId===id)?.cells||publication.periods.map(()=>['','','','']):base))},mats:[],...(!published&&!original&&!frozen?{unavailableReason:'The published timetable baseline is unavailable.'}:{})};}const dd=ctx.days[d],base=ctx.baselineDays?ctx.baselineDays[d]:dd,record=s.staplerPlans.find(r=>r.date===d),plan=record?.published,publicDay=plan?stapler().effectiveDay(plan,base):base,periods=publicDay?.periods||[],blank=()=>copy(periods.map(()=>['','','',''])),baseline=periods.map(p=>{const matched=base?.periods?.find(q=>q.startMinutes===p.startMinutes&&q.endMinutes===p.endMinutes);return copy(matched?base.teachers.find(t=>t.staffId===id)?.cells[matched.period]||['','','','']:['','','','']);}),modified=copy(publicDay?.teachers.find(t=>t.staffId===id)?.cells||blank());for(const a of s.absences.filter(a=>a.date===d&&a.staffId===id&&!a.deletedAt))for(const n of allocation().absencePeriods(a,{periods}))modified[n]=['Absent','','',''];for(const a of s.assignments.filter(a=>a.date===d&&a.staffId===id&&['published','completed'].includes(a.status)&&!a.publicationWithheldAt&&!a.noRelief&&!a.remove)){const next=[a.subject,a.className,a.venue,a.groupName];modified[a.period]=a.combination?modified[a.period].map((v,i)=>[v,next[i]].filter(Boolean).join(' + ')):next;}return {date:d,name:ctx.people.find(t=>t.id===id)?.name||'',revision:s.revision,periods:copy(periods),baseline:{cells:baseline},modified:{cells:modified},mats:copy(plan?.mats.filter(m=>m.target==='teacher'&&m.targetId===id)||[])};}
 function staplerTeacherChanges(s,ctx,d,plan){const base=ctx.baselineDays?.[d]||day(ctx,d),effective=stapler().effectiveDay(plan,base),rows=new Map(effective.teachers.map(t=>[t.staffId,t.cells.map(c=>c.slice())]));for(const a of s.absences.filter(a=>a.date===d&&!a.deletedAt))for(const p of allocation().absencePeriods(a,effective))if(rows.has(a.staffId))rows.get(a.staffId)[p]=['Absent','','',''];for(const a of s.assignments.filter(a=>a.date===d&&['published','completed'].includes(a.status)&&!a.noRelief&&!a.remove)){if(!rows.has(a.staffId))rows.set(a.staffId,base.periods.map(()=>['','','','']));const cells=rows.get(a.staffId),c=[a.subject,a.className,a.venue,a.groupName];cells[a.period]=a.combination?cells[a.period].map((v,i)=>[v,c[i]].filter(Boolean).join(' + ')):c;}const out=[];for(const [id,cells] of rows){const original=base.teachers.find(t=>t.staffId===id)?.cells||base.periods.map(()=>['','','','']);if(JSON.stringify(cells)!==JSON.stringify(original))out.push({staffId:id,cells});}return out;}
 function queueStaplerNotices(s,ctx,d,record,skip=new Set()){
  if(publishDateIssue(ctx,d,s)||!publishedOnDate(record.publishedAt,d))return;record.noticeSequence=record.noticeSequence||0;
  const changed=staplerTeacherChanges(s,ctx,d,record.published),previous=record.notifiedFingerprints||{},next={};
  const priorNotice={date:d,revision:record.publishedRevision,publishedAt:record.publishedAt,periods:record.published.periods,teachers:Object.values(record.timetableNotices||{})},published=dailyPublication(s,{...ctx,days:{...ctx.days,[d]:stapler().effectiveDay(record.published,ctx.baselineDays?.[d]||ctx.days[d])}},d,priorNotice);record.timetableNotices=Object.fromEntries(published.teachers.map(row=>[row.staffId,row]));
  for(const row of changed)next[row.staffId]=JSON.stringify(row.cells);
  for(const id of new Set([...Object.keys(previous),...Object.keys(next)])){if(previous[id]===next[id])continue;record.noticeSequence++;if(skip.has(id))continue;queue(s,ctx,'stapler_timetable',id,d,{templateKey:'stapler_timetable',planRevision:record.publishedRevision,fingerprint:next[id]||'baseline',timetableNoticeId:record.timetableNotices[id]?.noticeId,acknowledge:true,summary:dailyNoticeMessage()},null,'stapler:'+d+':'+record.noticeSequence+':'+id);}
  record.notifiedFingerprints=next;
 }
 function refreshStaplerNotifications(s,ctx,fromIndex=0){const effective=composeStaplerContext(s,ctx);for(const record of s.staplerPlans.filter(r=>!r.confirmed&&!s.dailyPublicationStates?.[r.date]&&r.published&&r.date===ctx.today&&effective.days[r.date]?.id===r.baselineId)){const skip=new Set(s.outbox.slice(fromIndex).filter(j=>j.date===record.date&&j.kind==='relief_publication').map(j=>j.recipientId));queueStaplerNotices(s,effective,record.date,record,skip);}}
 function staplerImportedCapScope(plan,previous){
  // Import provenance is part of each validated card, not a client exemption flag.
  // Subsequent timetable edits may keep its owner and change its subject/place/time.
  const imported=t=>plan.importSource?.mode==='final-day'&&t.kind==='lesson'&&/^offline:\d+:\d+$/.test(t.id)&&t.baselineId===null&&!!t.offlineSource&&t.source.teacherId===t.offlineSource.teacherId&&t.source.period===t.offlineSource.period&&['subject','venue','group'].every(k=>t.source[k]===t.offlineSource[k]);
  const hasImport=plan.tiles.some(imported),allowed=new Set(),newPlacements=new Set();if(!hasImport)return {allowed,newPlacements};
  const prior=new Map((previous?.tiles||plan.baseline.tiles).map(t=>[t.id,t]));
  const placed=new Map();for(const t of plan.tiles.filter(t=>t.kind==='lesson'&&t.location==='grid')){if(!placed.has(t.teacherId))placed.set(t.teacherId,[]);placed.get(t.teacherId).push(t);}
  for(const teacher of plan.teachers){const tiles=placed.get(teacher.staffId)||[],ownedImport=t=>imported(t)&&t.teacherId===t.source.teacherId;if(tiles.every(ownedImport))allowed.add(teacher.staffId);for(const t of tiles.filter(t=>!ownedImport(t)&&(!t.baselineId||t.teacherId!==t.source.teacherId))){const old=prior.get(t.id);if(!old||old.location!=='grid'||old.teacherId!==t.teacherId)newPlacements.add(teacher.staffId);}}
  return {allowed,newPlacements};
 }
 function validateStaplerCaps(s,ctx,d,record,plan,enforce=true){
  // Suspended plans retain structural/occupancy checks; workload is not a gate.
  return [];
 }

 function staplerHistoryIssue(s,d,record,historyDates){
  return record?.published||record?.publishedAt||s.massPublications?.[d]||s.dailyPublicationStates?.[d]||(historyDates?historyDates.has(d):s.publicationSnapshots.some(r=>r.date===d)||s.assignments.some(r=>r.date===d&&(r.publishedAt||['published','completed'].includes(r.status)))||s.importedRelief.some(r=>r.date===d&&['published','completed'].includes(r.status)))?'Published history must stay on its original date.':'';
 }
 function retireStaplerDraftRelief(s,ctx,d,reason){
  const requestIds=new Set();
  for(const a of s.assignments.filter(a=>a.date===d&&a.status==='draft')){a.status='cancelled';a.cancelledAt=ctx.iso;a.cancellationReason=reason;a.updatedAt=ctx.iso;a.version=(a.version||1)+1;if(a.requestId)requestIds.add(a.requestId);}
  for(const r of s.requests.filter(r=>r.date===d&&(r.status==='pending'||requestIds.has(r.id)))){r.status='cancelled';r.reason=reason;r.retiredAt=ctx.iso;r.updatedAt=ctx.iso;requestIds.add(r.id);}
  for(const j of s.outbox.filter(j=>j.date===d&&['queued','blocked'].includes(j.status)&&(requestIds.has(j.requestId)||(j.data?.peerRequestIds||[]).some(id=>requestIds.has(id))))){j.status='cancelled';j.error=reason;}
 }
 function retireStaplerLinks(s,ctx,d,reason){
  for(const a of s.importedRelief.filter(a=>a.origin==='stapler'&&a.date===d&&a.status==='draft')){a.status='cancelled';a.cancellationReason=reason;}
  for(const a of s.adhoc.filter(a=>a.origin==='stapler'&&a.date===d&&!a.deletedAt)){a.deletedAt=ctx.iso;a.deletedBy=ctx.user.email;}
  retireStaplerDraftRelief(s,ctx,d,reason);
  const requestIds=new Set();for(const r of s.staplerRequests.filter(r=>r.date===d&&!r.retiredAt)){r.retiredAt=ctx.iso;r.retiredBy=ctx.user.email;requestIds.add(r.id);}
  for(const j of s.outbox.filter(j=>j.date===d&&['queued','blocked'].includes(j.status)&&(j.kind==='stapler_timetable'||requestIds.has(j.data?.planningRequestId)))){j.status='cancelled';j.error=reason;}
  allocation().bumpDay(s,d);
 }
 function resetStaplerArchive(s,archive){return !!archive&&(archive.archiveReason==='reset'||!archive.archiveReason&&s.audit.some(e=>e.operation==='resetStapler'&&e.archiveId===archive.id&&e.date===archive.date));}
 function staplerRecoveryTag(current,archive){const json=JSON.stringify([current||null,archive]);return typeof rosterOperationsPlanDigest_==='function'?rosterOperationsPlanDigest_(json):require('node:crypto').createHash('sha256').update(json).digest('hex');}
 function previewRestoreStapler(s,ctx,p){
  smc(ctx);const d=date(p.date),archive=s.staplerArchives.find(r=>r.id===p.archiveId&&r.date===d),current=s.staplerPlans.find(r=>r.date===d);
  if(d<ctx.today)fail(403,'Past plans remain archived.');if(!resetStaplerArchive(s,archive)||archive.restoredAt)fail(409,'This reset archive is no longer available.');
  const plan=archive.draft||archive.published;stapler().validate(plan);if(plan.date!==d||plan.baselineId!==archive.baselineId)fail(409,'The archive identity needs review.');
  const confirmed=confirmedStaplerSnapshot(archive,s.audit);if(confirmed)stapler().validate(confirmed.plan);
  return {date:d,archiveId:archive.id,expectedCurrentTag:staplerRecoveryTag(current,archive),staplerRevision:current?.revision||0,confirmationPreserved:!!confirmed,plan:copy(plan),name:archive.name||''};
 }
 function createOrImportStapler(s,ctx,p,d){
  if(!staplerPermission(s,ctx,d))fail(403,'SMC approval is required to plan this date.');const current=s.staplerPlans.find(r=>r.date===d);
  if(!Number.isInteger(p.staplerRevision)||p.staplerRevision!==(current?.revision||0)){if(p.operation==='importStapler'&&current)throw Object.assign(Error('The online timetable changed. Review the current plan before replacing it with your native draft.'),{status:409,code:'STAPLER_CONFLICT',currentPlan:copy(current.draft||current.published),staplerRevision:current.revision,currentRevision:current.revision,conflicts:[{collection:'plan',id:'nativeImport',base:null,current:{revision:current.revision},local:{nativeImport:true}}]});fail(409,'The Stapler plan changed. Refresh before saving.');}
  if(p.operation==='createStapler'&&current)fail(409,'This date already has a saved plan.');
  const plan=p.operation==='createStapler'?stapler().createStandalone({date:d,id:'standalone:'+ctx.uuid(),periods:p.periods,endOfDayMinutes:p.endOfDayMinutes}):stapler().importNative(p.plan,{date:d});
  const identities=new Set();for(const t of plan.teachers){const person=staff(ctx,t.staffId);if(!stapler().importContactEligible(person))fail(400,'Choose an eligible Contacts staff member. MK staff are excluded.');for(const id of identities)if(samePerson(ctx,id,t.staffId))fail(409,'Two teachers share a verified Contacts identity.');identities.add(t.staffId);}
  const next={date:d,name:text(p.name??current?.name??'',120),baselineId:plan.baselineId,revision:(current?.revision||0)+1,draft:stapler().canonical(plan),confirmed:false,updatedAt:ctx.iso,updatedBy:ctx.user.email};
  if(current){s.staplerArchives.push({...current,id:ctx.uuid(),archiveReason:'native-import-backup',archivedAt:ctx.iso,archivedBy:ctx.user.email});s.staplerPlans[s.staplerPlans.indexOf(current)]=next;retireStaplerDraftRelief(s,ctx,d,'Native timetable imported. Review allocation before confirming.');}else s.staplerPlans.push(next);
  allocation().bumpDay(s,d);allocation().addAudit(s,ctx,p.operation,{date:d,staplerRevision:next.revision});return {savedIds:[d],staplerRevision:next.revision};
 }
 function staplerLifecycle(s,ctx,p,d){
  smc(ctx);const op=p.operation,record=s.staplerPlans.find(r=>r.date===d);
  if(!Number.isInteger(p.staplerRevision)||p.staplerRevision!==(record?.revision||0))fail(409,'The Stapler plan changed. Refresh dates before trying again.');
  if(op==='restoreStapler'&&resetStaplerArchive(s,s.staplerArchives.find(r=>r.id===p.archiveId&&r.date===d))){
   if(p.confirm!==true)fail(400,'Confirm restoration of this saved plan.');const preview=previewRestoreStapler(s,ctx,p);if(p.expectedCurrentTag!==preview.expectedCurrentTag)fail(409,'The plan or archive changed. Preview restoration again.');
   const archive=s.staplerArchives.find(r=>r.id===p.archiveId),confirmed=confirmedStaplerSnapshot(archive,s.audit),next={...copy(archive),revision:Math.max(record?.revision||0,archive.revision||0)+1,updatedAt:ctx.iso,updatedBy:ctx.user.email};
   for(const key of ['id','archivedAt','archivedBy','archiveReason','restoredAt','restoredBy','timetablePackage'])delete next[key];
   next.draft=stapler().canonical(stapler().copyValidated(archive.draft||archive.published));if(confirmed){next.confirmed=true;next.confirmedPlan=stapler().canonical(stapler().copyValidated(confirmed.plan));next.confirmedRevision=confirmed.revision;next.confirmedAt=confirmed.at;next.confirmedBy=confirmed.by;}
   if(record){s.staplerArchives.push({...record,id:ctx.uuid(),archiveReason:'recovery-backup',archivedAt:ctx.iso,archivedBy:ctx.user.email});s.staplerPlans[s.staplerPlans.indexOf(record)]=next;}else s.staplerPlans.push(next);
   archive.restoredAt=ctx.iso;archive.restoredBy=ctx.user.email;syncStaplerReservations(s,ctx,d,next,next.draft);allocation().bumpDay(s,d);allocation().addAudit(s,ctx,op,{date:d,archiveId:archive.id,staplerRevision:next.revision,confirmationPreserved:!!confirmed});return {savedIds:[d],staplerRevision:next.revision,archiveId:archive.id,confirmationPreserved:!!confirmed};
  }
  if(op==='restoreStapler'){
   if(p.confirm!==true)fail(400,'Confirm restoration of this saved plan.');if(record)fail(409,'This date already has a saved plan. Nothing was overwritten.');
   const archive=s.staplerArchives.find(r=>r.id===p.archiveId&&r.date===d&&r.archiveReason==='deleted'&&!r.restoredAt);if(!archive)fail(409,'This deleted plan is no longer available to restore.');
   const issue=staplerHistoryIssue(s,d,archive);if(issue)fail(409,issue);
   const restored=stapler().copyValidated(archive.draft||archive.published);if(restored.date!==d||restored.baselineId!==archive.baselineId)fail(409,'The archived plan identity needs review.');restored.status='draft';const draft=stapler().canonical(restored);
   const next={date:d,name:archive.name||'',baselineId:draft.baselineId,revision:archive.revision+1,draft,updatedAt:ctx.iso,updatedBy:ctx.user.email};s.staplerPlans.push(next);archive.restoredAt=ctx.iso;archive.restoredBy=ctx.user.email;allocation().bumpDay(s,d);allocation().addAudit(s,ctx,op,{date:d,archiveId:archive.id,staplerRevision:next.revision});return {operation:op,date:d,savedIds:[d],archiveId:archive.id,staplerRevision:next.revision};
  }
  if(!record)fail(409,'This saved plan is no longer present. Refresh dates.');
  if(op==='renameStapler'){
   const name=text(p.name,120);if(!name)fail(400,'Enter a plan name.');const before=record.name||'';retainConfirmedStaplerSnapshot(record,s.audit);record.name=name;record.revision++;record.updatedAt=ctx.iso;record.updatedBy=ctx.user.email;allocation().addAudit(s,ctx,op,{date:d,before,name,staplerRevision:record.revision});return {operation:op,date:d,savedIds:[d],staplerRevision:record.revision};
  }
  if(p.confirm!==true)fail(400,'Confirm this change to the saved plan.');const issue=staplerHistoryIssue(s,d,record);if(issue)fail(409,issue);
  let next=null,newDate=null;
  if(op==='moveStapler'){
   newDate=date(p.newDate);if(newDate<ctx.today)fail(403,'A plan cannot move to a past date.');if(newDate===d)fail(400,'Choose a different date.');
   if(s.staplerPlans.some(r=>r.date===newDate))fail(409,'The destination already has a saved plan. Nothing was overwritten.');
   if(staplerHistoryIssue(s,newDate))fail(409,'The destination has published history. Choose another date.');
   const draft=stapler().canonical(stapler().redate(record.draft||record.published,staplerBaseline(s,ctx,newDate)));
   next={date:newDate,name:record.name||'',baselineId:draft.baselineId,revision:record.revision+1,draft,updatedAt:ctx.iso,updatedBy:ctx.user.email};
  }
  const archived={...record,id:ctx.uuid(),archiveReason:op==='deleteStapler'?'deleted':'moved',...(newDate?{movedTo:newDate}:{}),archivedAt:ctx.iso,archivedBy:ctx.user.email};s.staplerArchives.push(archived);
  s.staplerPlans=s.staplerPlans.filter(r=>r!==record);if(next)s.staplerPlans.push(next);
  retireStaplerLinks(s,ctx,d,op==='deleteStapler'?'Suspended timetable deleted.':'Suspended timetable moved to '+newDate+'.');
  if(newDate){retireStaplerDraftRelief(s,ctx,newDate,'Suspended timetable moved here. Review allocation after confirming.');allocation().bumpDay(s,newDate);}
  allocation().addAudit(s,ctx,op,{date:d,newDate,archiveId:archived.id,staplerRevision:next?.revision||record.revision});return {operation:op,date:d,...(newDate?{newDate}:{}),savedIds:next?[d,newDate]:[d],archiveId:archived.id,...(next?{staplerRevision:next.revision}:{})};
 }
 function staplerPlanChanges(before,after){const S=stapler(),oldDay=S.effectiveDay(before),newDay=S.effectiveDay(after),oldRows=new Map(oldDay.teachers.map(t=>[t.staffId,t])),changes=[];for(const teacher of newDay.teachers){const old=oldRows.get(teacher.staffId);for(const period of after.periods){const prior=old?.cells[period.period]||['','','',''],next=teacher.cells[period.period]||['','','',''];if(!S.sameCell(prior,next))changes.push({staffId:teacher.staffId,name:teacher.name,period:period.period,before:copy(prior),after:copy(next)});}}return changes;}
 // A save carries only changed domain records/fields and their comparison values.
 // No client paths are followed: identity, immutable baseline and unrelated fields
 // remain those of the fresh locked plan. Receipts hash the original command.
 const staplerPatchCollections={tiles:'id',mats:'id',teachers:'staffId',classes:'id'};
 const staplerPatchFields={tiles:['kind','teacherId','classIds','period','location','subject','venue','group','baselineId','source','durationMinutes','offlineSource','importedRelief'],mats:['target','targetId','fromPeriod','toPeriod','reason'],teachers:['name','timetableName','adhoc'],classes:['name','level','traditional','venue','adhoc']};
 function staplerMergeChoice(base,local,current,where,conflicts){const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);if(same(local,base)||same(local,current))return current;if(same(current,base))return local;conflicts.push({...where,base:base??null,current:current??null,local:local??null});return current;}
 function staplerMergeConflict(conflicts,current){if(conflicts.length)throw Object.assign(new Error('Some timetable cards changed online. Compare your retained choices with the online plan.'),{status:409,code:'STAPLER_CONFLICT',conflicts,currentPlan:copy(current)});}
 function staplerPlanPatch(base,local){
  const S=stapler();S.validate(base);S.validate(local,{baseline:base,previous:base});const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),changes=[];
  for(const key of new Set([...Object.keys(base),...Object.keys(local)]))if(!Object.prototype.hasOwnProperty.call(staplerPatchCollections,key)&&!['revision','nextId','warnings','status','importSource'].includes(key)&&!same(base[key],local[key]))fail(400,'The Stapler patch cannot change its baseline.');
  const change=(collection,id,field,before,after)=>changes.push({collection,id,...(field?{field}:{}),...(before===undefined?{}:{before:copy(before)}),...(after===undefined?{}:{after:copy(after)})});
  for(const [collection,idKey] of Object.entries(staplerPatchCollections)){const before=new Map(base[collection].map(row=>[row[idKey],row])),after=new Map(local[collection].map(row=>[row[idKey],row]));
   for(const id of new Set([...before.keys(),...after.keys()])){const b=before.get(id),l=after.get(id);if(same(b,l))continue;if(!b||!l)change(collection,id,null,b,l);else for(const field of new Set([...Object.keys(b),...Object.keys(l)]))if(!same(b[field],l[field]))change(collection,id,field,b[field],l[field]);}
  }
  if(!same(base.importSource,local.importSource))change('plan','importSource',null,base.importSource,local.importSource);
  const patch={schema:1,date:base.date,baselineId:base.baselineId,changes,nextId:local.nextId||1,revision:local.revision||0,warnings:(local.warnings||[]).filter(w=>!(base.warnings||[]).includes(w))};validateStaplerPlanPatch(patch);return patch;
 }
 function validateStaplerPlanPatch(patch){
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v),own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k),invalid=()=>fail(400,'The Stapler changes are invalid or too large. Reload the saved plan and review your retained changes.');
  if(!object(patch)||patch.schema!==1||Object.keys(patch).some(k=>!['schema','date','baselineId','changes','nextId','revision','warnings'].includes(k))||typeof patch.date!=='string'||typeof patch.baselineId!=='string'||!patch.baselineId||patch.baselineId.length>500||!Array.isArray(patch.changes)||patch.changes.length>60000||!Number.isSafeInteger(patch.nextId)||patch.nextId<1||patch.nextId>1000000000||!Number.isSafeInteger(patch.revision)||patch.revision<0||!Array.isArray(patch.warnings)||patch.warnings.some(w=>typeof w!=='string'||w.length>4000)||unescape(encodeURIComponent(JSON.stringify(patch))).length>1900000)invalid();
  date(patch.date);const targets=new Map();for(const change of patch.changes){
   if(!object(change)||Object.keys(change).some(k=>!['collection','id','field','before','after'].includes(k))||typeof change.id!=='string'||!change.id||change.id.length>500||!own(change,'before')&&!own(change,'after'))invalid();
   const collection=change.collection;if(collection==='plan'){if(change.id!=='importSource'||own(change,'field'))invalid();}
   else{if(!own(staplerPatchCollections,collection))invalid();const idKey=staplerPatchCollections[collection],fields=staplerPatchFields[collection];
    if(own(change,'field')){if(!fields.includes(change.field))invalid();}
    else{if(own(change,'before')&&own(change,'after'))invalid();for(const key of ['before','after'])if(own(change,key)){const row=change[key];if(!object(row)||row[idKey]!==change.id||Object.keys(row).some(k=>k!==idKey&&!fields.includes(k)))invalid();}}
   }
   const key=JSON.stringify([collection,change.id]),fields=targets.get(key)||new Set(),field=own(change,'field')?change.field:'*';if(fields.has(field)||fields.has('*')||field==='*'&&fields.size)invalid();fields.add(field);targets.set(key,fields);
  }
  return patch;
 }
 function applyStaplerPlanPatch(current,patch){
  validateStaplerPlanPatch(patch);stapler().validate(current);if(patch.date!==current.date||patch.baselineId!==current.baselineId)fail(409,'The Stapler date or baseline changed. Review the current baseline.','STAPLER_BASELINE_CONFLICT');
  const next=copy(current),conflicts=[],maps=Object.fromEntries(Object.entries(staplerPatchCollections).map(([key,id])=>[key,new Map(next[key].map(row=>[row[id],row]))]));
  for(const change of patch.changes){const {collection,id,field,before,after}=change,where={collection,id,...(field?{field}:{})};
   if(collection==='plan'){const value=staplerMergeChoice(before,after,current[id],where,conflicts);if(value===undefined)delete next[id];else next[id]=copy(value);continue;}
   const rows=maps[collection],row=rows.get(id);if(field){if(!row){conflicts.push({...where,base:before??null,current:null,local:after??null});continue;}const value=staplerMergeChoice(before,after,row[field],where,conflicts);if(value===undefined)delete row[field];else row[field]=copy(value);}
   else{const value=staplerMergeChoice(before,after,row,where,conflicts);if(value===undefined)rows.delete(id);else rows.set(id,copy(value));}
  }
  staplerMergeConflict(conflicts,current);for(const key of Object.keys(staplerPatchCollections))next[key]=[...maps[key].values()];next.nextId=Math.max(current.nextId||1,patch.nextId);next.revision=Math.max(current.revision||0,patch.revision)+1;next.warnings=[...new Set([...(current.warnings||[]),...patch.warnings])];if(unescape(encodeURIComponent(JSON.stringify(next))).length>1900000)fail(400,'The plan is too large.');stapler().validate(next,{baseline:current,previous:current});return next;
 }
 function mergeStaplerPlans(base,local,current){
  const S=stapler();for(const plan of [base,local,current])S.validate(plan);if([local,current].some(plan=>plan.date!==base.date||plan.baselineId!==base.baselineId||JSON.stringify(plan.baseline)!==JSON.stringify(base.baseline)))fail(409,'The Stapler date or baseline changed. Review the current baseline.','STAPLER_BASELINE_CONFLICT');
  const conflicts=[],next=copy(current),collections=staplerPatchCollections;
  const choose=(b,l,c,where)=>staplerMergeChoice(b,l,c,where,conflicts);
  for(const [collection,idKey] of Object.entries(collections)){const maps=[base,local,current].map(plan=>new Map((plan[collection]||[]).map(row=>[row[idKey],row]))),ids=[...new Set([...maps[2].keys(),...maps[1].keys(),...maps[0].keys()])],rows=[];
   for(const id of ids){const [b,l,c]=maps.map(map=>map.get(id));let row;if(b&&l&&c){row={};for(const field of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(c)])){const value=choose(b[field],l[field],c[field],{collection,id,field});if(value!==undefined)row[field]=copy(value);}}else row=choose(b,l,c,{collection,id});if(row)rows.push(copy(row));}next[collection]=rows;
  }
  for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(current)])){if(collections[key]||['revision','nextId','warnings','status'].includes(key))continue;const value=choose(base[key],local[key],current[key],{collection:'plan',id:key});if(value===undefined)delete next[key];else next[key]=copy(value);}
  staplerMergeConflict(conflicts,current);
  next.nextId=Math.max(base.nextId||1,local.nextId||1,current.nextId||1);next.revision=Math.max(local.revision||0,current.revision||0)+1;next.warnings=[...new Set([...(local.warnings||[]),...(current.warnings||[])])];S.validate(next,{baseline:current,previous:current});return next;
 }
 function staplerApply(s,ctx,p){const d=date(p.date||ctx.today),op=p.operation;if(d<ctx.today&&(!(ctx.user.smc||ctx.user.admin)||!['saveStapler','confirmStapler'].includes(op)))fail(403,'Past planning lifecycle changes are read only. Their saved history cannot be renamed, moved or deleted.');
  if(['createStapler','importStapler'].includes(op))return createOrImportStapler(s,ctx,p,d);
  if(['renameStapler','moveStapler','deleteStapler','restoreStapler'].includes(op))return staplerLifecycle(s,ctx,p,d);
  if(op==='requestStapler'){const person=staff(ctx,ctx.user.staffId);if(!person.active)fail(403,'An active teacher identity is required.');if(!(ctx.smcIds||[]).includes(p.sponsorId)||!teacherSponsor(staff(ctx,p.sponsorId)))fail(400,'Choose an eligible SMC teacher sponsor.');const old=s.staplerRequests.find(r=>!r.retiredAt&&r.date===d&&r.staffId===person.id&&['pending','approved'].includes(r.status));if(old)return {savedIds:[old.id],unchanged:true};const row={id:ctx.uuid(),date:d,staffId:person.id,name:person.name,sponsorId:p.sponsorId,status:'pending',createdAt:ctx.iso};s.staplerRequests.push(row);queue(s,ctx,'stapler_request',row.sponsorId,d,{templateKey:'stapler_request',requesterName:person.name,planningRequestId:row.id,summary:person.name+' requests Stapler planning and publication access for '+d+'.'},null,'stapler-request:'+row.id);allocation().addAudit(s,ctx,op,{date:d,id:row.id});return {savedIds:[row.id]};}
  if(op==='decideStapler'){smc(ctx);const row=s.staplerRequests.find(r=>r.id===p.id&&r.date===d);if(!row||row.retiredAt||row.status!=='pending')fail(409,'This planning request is no longer pending.');if(!['approve','reject'].includes(p.decision))fail(400,'Choose approve or reject.');row.status=p.decision==='approve'?'approved':'rejected';row.comment=text(p.comment||'',1000);row.decidedAt=ctx.iso;row.decidedBy=ctx.user.email;queue(s,ctx,'stapler_decision',row.staffId,d,{templateKey:'stapler_decision',requesterName:staff(ctx,row.staffId).name,planningRequestId:row.id,decision:row.status,comment:row.comment,summary:'Stapler access for '+d+' was '+row.status+(row.comment?': '+row.comment:'.')},null,'stapler-decision:'+row.id);if(row.status==='approved'&&row.sponsorId!==row.staffId)queue(s,ctx,'stapler_decision',row.sponsorId,d,{templateKey:'stapler_decision',requesterName:staff(ctx,row.staffId).name,planningRequestId:row.id,audience:'stapler-sponsor',decision:row.status,comment:row.comment,summary:row.name+' was approved to plan and publish Stapler for '+d+'.'},null,'stapler-sponsor-decision:'+row.id);allocation().addAudit(s,ctx,op,{date:d,id:row.id,decision:row.status,comment:row.comment});return {savedIds:[row.id]};}
  if(!staplerPermission(s,ctx,d))fail(403,'SMC approval is required to plan or publish this date.');const dd=ctx.baselineDays?.[d]||ctx.days[d];let record=s.staplerPlans.find(r=>r.date===d);const saved=record?.draft||record?.published,baseline=op==='resetStapler'||!saved?staplerBaseline(s,ctx,d):saved;if(saved)stapler().validate(saved);if(!Number.isInteger(p.staplerRevision)||p.staplerRevision<0||p.staplerRevision>(record?.revision||0)||p.staplerRevision!==(record?.revision||0)&&!(op==='saveStapler'&&(p.basePlan||p.planPatch!==undefined)))fail(409,'The Stapler draft changed. Compare your retained changes before saving.');if(op==='resetStapler'){if(!record||!staplerBaselineChanged(record,saved,dd))fail(409,'This draft already uses the current baseline.');const archived={...record,id:ctx.uuid(),archiveReason:'reset',archivedAt:ctx.iso,archivedBy:ctx.user.email};s.staplerArchives.push(archived);const next={date:d,name:record.name||'',baselineId:baseline.baselineId,revision:record.revision+1,draft:baseline,updatedAt:ctx.iso,updatedBy:ctx.user.email};s.staplerPlans[s.staplerPlans.indexOf(record)]=next;for(const a of s.importedRelief.filter(a=>a.origin==='stapler'&&a.date===d&&['draft','published'].includes(a.status))){a.status='cancelled';a.cancellationReason='Stapler reset after baseline replacement.';}for(const j of s.outbox.filter(j=>j.kind==='stapler_timetable'&&j.date===d&&['queued','blocked'].includes(j.status))){j.status='cancelled';j.error='Stapler reset after baseline replacement.';}allocation().addAudit(s,ctx,op,{date:d,archiveId:archived.id,previousBaselineId:record.baselineId,baselineId:baseline.baselineId,staplerRevision:next.revision});return {savedIds:[d],staplerRevision:next.revision};}
  if(op==='saveStapler'){
   const surgical=p.planPatch!==undefined;if(surgical&&(p.plan!==undefined||p.basePlan!==undefined))fail(400,'Send either Stapler changes or a full plan.');if(!surgical&&(!p.plan||unescape(encodeURIComponent(JSON.stringify(p.plan))).length>1900000))fail(400,'The plan is missing or too large.');const previous=saved||baseline;let plan;try{plan=surgical?applyStaplerPlanPatch(previous,p.planPatch):p.basePlan&&p.staplerRevision!==(record?.revision||0)?mergeStaplerPlans(p.basePlan,p.plan,previous):copy(p.plan);}catch(error){if(error.code==='STAPLER_CONFLICT'){error.staplerRevision=record?.revision||0;error.currentRevision=record?.revision||0;}throw error;}
   if(plan.date!==d||plan.baselineId!==previous.baselineId||!Array.isArray(plan.teachers))fail(400,'The plan belongs to another date or baseline.');
   const original=new Set(baseline.baseline.teachers.map(t=>t.staffId||t.id));for(const t of plan.teachers){const id=t.staffId||t.id,person=staff(ctx,id);if(!original.has(id)&&plan.teachers.some(other=>(other.staffId||other.id)!==id&&samePerson(ctx,id,other.staffId||other.id)))fail(409,'This contact shares a verified identity with another teacher already in the plan.');if(!original.has(id)&&!stapler().importContactEligible(person))fail(400,'Choose an eligible Contacts staff member. MK staff are excluded.');if(!original.has(id)){t.name=person.name;t.timetableName=person.name;}}
   plan.status=record?.confirmed||record?.published?'confirmed':'draft';stapler().validate(plan,{baseline:previous,previous});
   if(!record){record={date:d,baselineId:plan.baselineId,revision:0};s.staplerPlans.push(record);}
   if(record.confirmed||record.published)validateStaplerPlan(s,ctx,d,record,plan);else record.workloadWarnings=validateStaplerCaps(s,ctx,d,record,plan,false);
   retainConfirmedStaplerSnapshot(record,s.audit);record.draft=stapler().canonical(plan);record.revision++;if(record.confirmed||record.published){record.confirmed=true;syncStaplerReservations(s,ctx,d,record,plan);allocation().bumpDay(s,d);}record.updatedAt=ctx.iso;record.updatedBy=ctx.user.email;allocation().addAudit(s,ctx,op,{date:d,staplerRevision:record.revision,...(s.systemConfig?.verboseLogging===false?{}:{timetableChanges:staplerPlanChanges(previous,plan)})});return {savedIds:[d],staplerRevision:record.revision};
  }
  if(!record?.draft)fail(409,'Save the draft before confirming.');const plan=stapler().copyValidated(record.draft);validateStaplerPlan(s,ctx,d,record,plan);plan.status='confirmed';stapler().acceptStored(plan);record.draft=stapler().canonical(plan);record.confirmed=true;record.confirmedAt=ctx.iso;record.confirmedBy=ctx.user.email;record.confirmedPlan=record.draft;record.confirmedRevision=record.revision;syncStaplerReservations(s,ctx,d,record,plan);allocation().bumpDay(s,d);allocation().addAudit(s,ctx,'confirmStapler',{date:d,staplerRevision:record.revision});return {savedIds:[d],staplerRevision:record.revision,confirmed:true};
 }
 function validateStaplerPlan(s,ctx,d,record,plan){
const next=stapler().effectiveDay(plan,ctx.baselineDays?.[d]||ctx.days[d]);for(const a of s.assignments.filter(a=>a.date===d&&['published','completed'].includes(a.status)&&!a.noRelief&&!a.remove&&!a.combination)){const cell=next.teachers.find(t=>t.staffId===a.staffId)?.cells[a.period];if(cell?.some(Boolean))fail(409,'Published relief would double-book '+staff(ctx,a.staffId).name+' at period '+a.period+'. Clear or rearrange that relief first.');}
  for(const change of stapler().changes(plan)){
   if(!change.after.some(Boolean)||!s.absences.some(a=>!a.deletedAt&&a.date===d&&a.staffId===change.staffId&&allocation().absencePeriods(a,next).includes(change.period)))continue;
   const tile=plan.tiles.find(t=>t.kind==='lesson'&&t.location==='grid'&&t.teacherId===change.staffId&&t.period===change.period);
   // Imported working lessons still need cover when their planned teacher is absent.
   // A later edit or transfer is an assignment and must retain the absence guard.
   if(!stapler().isImportedPlacement(plan,tile))fail(409,'A changed lesson cannot be placed with a teacher who reported absent during that period.');
  }
  record.workloadWarnings=validateStaplerCaps(s,ctx,d,record,plan);

 }
 function syncStaplerReservations(s,ctx,d,record,plan){
  const keep=new Set();for(const a of staplerAccounting(plan))for(const period of a.reliefPeriods||[]){const id='stapler:'+d+':'+a.staffId+':'+period;keep.add(id);let row=s.importedRelief.find(r=>r.id===id);if(!row){row={id,staffId:a.staffId,date:d,period,origin:'stapler',rCost:1,createdAt:ctx.iso};s.importedRelief.push(row);}Object.assign(row,{status:'draft',baselineId:record.baselineId,planRevision:record.revision});}for(const row of s.importedRelief.filter(r=>r.origin==='stapler'&&r.date===d&&!keep.has(r.id)))row.status='cancelled';
  const original=new Set((plan.baseline.teachers||[]).map(t=>t.staffId));for(const t of plan.teachers){const id=t.staffId||t.id,person=staff(ctx,id);if(!original.has(id)&&person.active===false&&person.adhocEligible!==false&&!s.adhoc.some(a=>a.date===d&&a.staffId===id&&!a.deletedAt))s.adhoc.push({id:ctx.uuid(),date:d,staffId:id,name:person.name,periods:plan.periods.map(p=>p.period),createdAt:ctx.iso,createdBy:ctx.user.email,origin:'stapler'});}
 }
 function dutySMC(s,ctx,d){const row=s.smcDutyRoster.find(r=>r.date===d),source=ctx.dutySources?.[d];if(!row||!source?.available||!dutyWindow(row,d,ctx.now))return [];const verified=new Set(source.staffIds||[]);return [...new Set(row.staffIds||[])].filter(id=>verified.has(id)&&(ctx.smcIds||[]).includes(id)&&ctx.people.some(p=>p.id===id&&dutyEligible(p)));}
 function currentDuty(s,ctx){
  const person=ctx.people.find(p=>p.id===ctx.user.staffId);if(!(ctx.user.smc||ctx.user.admin)&&person?.active!==true)fail(403,'An active school identity is required.');
  const d=date(ctx.today);if(ctx.dutySources?.[d]?.available!==true||!Array.isArray(ctx.smcIds))fail(503,'The current SMC duty list could not be verified. Retry loading.');
  return {date:d,checkedAt:ctx.iso,available:true,people:dutySMC(s,ctx,d).map(id=>({name:ctx.people.find(p=>p.id===id).name}))};
 }
 function smcAlert(s,ctx,d,key,summary,send=true,kind='smc_alert',details={},summaryIndex){
  const recipients=dutySMC(s,ctx,d),index=details.scheduledSummary?(summaryIndex||notificationIndex(s)):null;if(!s.smcAlerts.some(x=>x.key===key))s.smcAlerts.push({id:ctx.uuid(),key,date:d,summary,recipients,createdAt:ctx.iso,status:recipients.length?'open':'no-duty-recipient'});
  if(send&&(details.emergencyAbsence||!allocation().schedule(ctx.now).quiet||kind==='smc_report'&&details.scheduledSummary))for(const id of recipients.filter(id=>!details.scheduledSummary||summaryNeeded(index,id,d,details.scheduledSummary)))queue(s,ctx,kind,id,d,{summary,audience:'duty-smc',templateKey:'smc_attention',...details},null,key+':'+id);
 }
 function firstPublicationTime(s,d){
  const times=[s.massPublications?.[d]?.at,s.dailyPublicationStates?.[d]?.publishedAt,
   ...s.staplerPlans.filter(r=>r.date===d&&r.published).map(r=>r.publishedAt),
   ...s.publicationSnapshots.filter(r=>r.date===d).map(r=>r.publishedAt),
   ...s.assignments.filter(r=>r.date===d&&r.publishedAt).map(r=>r.publishedAt)].map(at=>Date.parse(at)).filter(Number.isFinite);
  return times.length?Math.min(...times):null;
 }
 function absenceAlerts(s,ctx,p,savedIds){
  const schedule=allocation().schedule(ctx.now),first=firstPublicationTime(s,ctx.today),wanted=new Set(savedIds),format=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  for(const a of s.absences){
   if(!wanted.has(a.id)||a.date!==ctx.today)continue;
   const emergency=!p.id&&first!==null&&ctx.now>first&&schedule.minute<840;
   // Once published, the new-absence policy owns the strict 14:00 cutoff. Existing
   // edit alerts and the pre-publication morning policy retain their own rules.
   const legacy=(!!p.id||first===null)&&(schedule.lateAbsenceWindow||a.periods.some(n=>allocation().periodStarted(ctx,a.date,n)));
   if(!emergency&&!legacy)continue;
   const affected=a.coverage?.kind==='fullDay'?'the full day':a.coverage?.kind==='timeRange'?format(a.coverage.startMinutes)+' to '+format(a.coverage.endMinutes):a.coverage?.kind==='timeRanges'?a.coverage.ranges.map(r=>format(r.startMinutes)+' to '+format(r.endMinutes)).join(', '):'P'+a.periods.join(', P');
   const stamp=new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(ctx.now))+' SGT';
   const summary=(emergency?'Emergency absence: ':'')+a.name+' reported absence at '+stamp+' for '+affected+'. '+(absenceTimingPending(ctx,a)?'No timetable applies yet.':'Manual allocation is required.');
   smcAlert(s,ctx,a.date,emergency?'emergency-absence:'+a.id:'late-absence:'+a.id+':'+a.updatedAt,summary,true,'smc_alert',{templateKey:p.id?'smc_attention':'absence_update',newAbsenceCount:p.id?0:1,...(emergency?{emergencyAbsence:true,absenceId:a.id}:{})});
  }
 }
 function summaryNeeded(index,id,d,summary){const last=lastSuccessfulSummary(index,id,d,summary.phase);return !last||last.data.scheduledSummary.at<summary.at&&(summary.first||last.data.scheduledSummary.fingerprint!==summary.fingerprint);}
 function latestPublications(s,byId=new Map(s.publicationSnapshots.map(v=>[v.id,v]))){
  const latest=new Map(),publications=s.dailyPublicationStates||{},legacy=new Set();
  for(const [d,publication] of Object.entries(publications))for(const row of publication.teachers)if(!row.snapshotIds)legacy.add(d+'|'+row.staffId);
  for(const v of s.publicationSnapshots){const publication=publications[v.date];if(!publication||legacy.has(v.date+'|'+v.staffId)&&Date.parse(v.publishedAt)<=Date.parse(publication.publishedAt))latest.set(v.assignmentId+'|'+v.staffId,v);}
  for(const [d,publication] of Object.entries(publications))for(const row of publication.teachers)for(const id of row.snapshotIds||[]){const v=byId.get(id);if(v&&v.date===d&&v.staffId===row.staffId)latest.set(v.assignmentId+'|'+v.staffId,v);}
  return latest;
 }
 // An unchanged day notice may capture replacement assignment IDs on republish.
 // Its original acknowledgement is evidence for those equivalent published snapshots,
 // without recording another teacher action or acknowledging unpublished instructions.
 function snapshotAcknowledgements(s){
  const result=new Map(s.acknowledgements.filter(a=>a.snapshotId).map(a=>[a.snapshotId,a])),notices=new Map(s.acknowledgements.filter(a=>a.timetableNoticeId).map(a=>[a.staffId+'|'+a.timetableNoticeId,a]));
  for(const event of s.audit)if(event.operation==='carryTimetableAcknowledgement'){const ack=notices.get(event.staffId+'|'+event.timetableNoticeId);if(ack&&ack.id===event.acknowledgementId)for(const id of event.snapshotIds)if(!result.has(id))result.set(id,{...ack,acknowledgementSource:ack.timetableNoticeId});}
  for(const publication of Object.values(s.dailyPublicationStates||{}))for(const row of publication.teachers){const ack=notices.get(row.staffId+'|'+timetableNoticeId(publication,row));if(ack)for(const id of row.snapshotIds||[])if(!result.has(id))result.set(id,{...ack,acknowledgementSource:ack.timetableNoticeId});}
  return result;
 }
 function preserveEquivalentAcknowledgements(s,ctx,snapshot){
  const covered=snapshotAcknowledgements(s),notices=new Map(s.acknowledgements.filter(a=>a.timetableNoticeId).map(a=>[a.staffId+'|'+a.timetableNoticeId,a]));
  for(const row of snapshot.teachers){const ack=notices.get(row.staffId+'|'+timetableNoticeId(snapshot,row)),ids=(row.snapshotIds||[]).filter(id=>!covered.has(id));if(ack&&ids.length)allocation().addAudit(s,ctx,'carryTimetableAcknowledgement',{date:snapshot.date,staffId:row.staffId,timetableNoticeId:ack.timetableNoticeId,acknowledgementId:ack.id,snapshotIds:ids,publicationRevision:snapshot.revision});}
 }
 function pendingPublications(s,id){
  const acknowledged=snapshotAcknowledgements(s),states=new Map();return [...latestPublications(s).values()].filter(v=>{if(v.staffId!==id||acknowledged.has(v.id))return false;if(!s.dailyPublicationStates?.[v.date])return !notificationAbsentInPeriod(s,v.date,id,v.period);if(!states.has(v.date))states.set(v.date,dailyNoticeState(s,v.date,id));const state=states.get(v.date);return state.eligible&&!state.absentPeriods.includes(v.period);});
 }
 function publicationSnapshot(s,ctx,a,kind='assigned'){
  const existing=s.publicationSnapshots.filter(x=>x.assignmentId===a.id&&x.staffId===a.staffId),rev=(existing.at(-1)?.revision||0)+1;
  const v={id:ctx.uuid(),assignmentId:a.id,revision:rev,staffId:a.staffId,date:a.date,period:a.period,kind,publishedAt:ctx.iso,publishedBy:ctx.user.email,assignment:copy(a),instructions:String(a.instructions||''),customInstructions:String(a.customInstructions||''),conditionalRules:matchingCustom(s,a).map(r=>({id:r.id,version:r.version,text:r.text}))};s.publicationSnapshots.push(v);return v;
 }
 // Teacher relief WhatsApp text: period numbers only; details stay behind the
 // private link. Peer overrides and reminders keep publicationSummary.
 function shortPublicationSummary(rows,update){
  const periods=list=>[...new Set(list.map(v=>Number(v.period??v.assignment?.period)).filter(Number.isFinite))].sort((a,b)=>a-b),label=list=>list.map(n=>'P'+n).join(', ');
  const live=periods(rows.filter(v=>v.kind!=='cancelled'));
  if(!update)return live.length+' relief dut'+(live.length===1?'y':'ies')+': '+label(live)+'.';
  // A period both cancelled and newly assigned (class, venue or cover moved) reads as Changed.
  const cancelled=periods(rows.filter(v=>v.kind==='cancelled')),assigned=periods(rows.filter(v=>v.kind==='assigned')),edited=periods(rows.filter(v=>v.kind!=='cancelled'&&v.kind!=='assigned'));
  const added=assigned.filter(n=>!cancelled.includes(n)),removed=cancelled.filter(n=>!assigned.includes(n)),changed=[...new Set([...assigned.filter(n=>cancelled.includes(n)),...edited.filter(n=>!added.includes(n)&&!removed.includes(n))])].sort((a,b)=>a-b);
  const parts=[['New',added],['Changed',changed],['Cancelled',removed]];
  return parts.filter(([,list])=>list.length).map(([name,list])=>name+': '+label(list)+'.').join(' ');
 }
 function publicationSummary(rows){return rows.map(v=>{const a=v.assignment;return (v.kind==='cancelled'?'Cancelled: ':'')+'P'+a.period+' '+(a.timeStart||'')+' '+[a.className,a.subject,a.groupName,a.venue].filter(Boolean).join(' · ')+(a.combination?' (class combination)':'')+(v.instructions?'\n'+v.instructions:'')+(v.customInstructions?'\nSMC: '+v.customInstructions:'');}).join('\n\n');}
 function assignmentStart(a){return Date.parse(a.date+'T'+(a.timeStart||'00:00')+':00+08:00');}
 function matchingCustom(s,dem){
  if(dem.members){const ids=new Set(dem.members.flatMap(m=>matchingCustom(s,m)).map(r=>r.id));return s.customInstructions.filter(r=>ids.has(r.id)).sort((a,b)=>a.id.localeCompare(b.id));}
  const groupIds=dem.groupIds||[];
  return s.customInstructions.filter(r=>!r.deletedAt&&r.enabled!==false&&(!(r.levels||[]).length||(r.levels||[]).includes(dem.level||primaryLevel(dem.className)))&&(!(r.periods||[]).length||(r.periods||[]).includes(dem.period))&&(!(r.classNames||[]).length||(r.classNames||[]).includes(dem.className))&&(!(r.groupIds||[]).length||r.groupIds.some(id=>groupIds.includes(id)))).sort((a,b)=>a.id.localeCompare(b.id));
 }
 function queueConditional(s,ctx,values){
  for(const v of values){if(v.kind==='cancelled')continue;
   const prior=s.publicationSnapshots.filter(x=>x.assignmentId===v.assignmentId&&x.staffId===v.staffId&&x.id!==v.id).at(-1);
   for(const rule of matchingCustom(s,v.assignment)){
    const previous=prior?.conditionalRules?.find(r=>r.id===rule.id);
    if(previous?.version===rule.version&&previous.text===rule.text&&publishedOnDate(prior.publishedAt,v.date))continue;
    queue(s,ctx,'conditional_relief_instruction',v.staffId,v.date,{templateKey:'conditional_relief_instruction',acknowledge:true,snapshotIds:[v.id],assignmentId:v.assignmentId,absentTeacherId:v.assignment.absentId,absentTeacherName:ctx.people.find(p=>p.id===v.assignment.absentId)?.name||'',absentTeacherContact:absentTeacherContact(ctx.people.find(p=>p.id===v.assignment.absentId)),ruleId:rule.id,ruleVersion:rule.version,className:v.assignment.className,periodAndTime:'P'+v.period+' · '+v.assignment.timeStart+' to '+v.assignment.timeEnd,instruction:rule.text,summary:rule.text},null,'conditional:'+v.id+':'+rule.id+':'+rule.version);
   }
  }
 }
 function queuePublication(s,ctx,rows){
  const grouped=new Map();for(const v of rows){if(s.dailyPublicationStates?.[v.date])continue;const key=v.staffId+'|'+v.date;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(v);}
  for(const values of grouped.values()){
   const id=values[0].staffId,d=values[0].date,ids=values.map(v=>v.id),changes=values.some(v=>v.kind!=='assigned');
   const urgent=values.filter(v=>v.kind!=='cancelled').filter(v=>{const minutes=(assignmentStart(v.assignment)-ctx.now)/60000;return minutes>0&&minutes<=20;}).sort((a,b)=>assignmentStart(a.assignment)-assignmentStart(b.assignment));
   const mutualChange=values.some(v=>v.kind==='cancelled'&&v.assignment.mutual&&v.assignment.cancellationReason==='Published replacement');
   const templateKey=mutualChange?'mutual_override':urgent.length&&!changes?'relief_urgent':changes?'relief_updated':'relief_assignment';
   queue(s,ctx,'relief_publication',id,d,{templateKey,mutualChange,summary:templateKey==='mutual_override'?publicationSummary(values):shortPublicationSummary(values,templateKey==='relief_updated'),snapshotIds:ids,acknowledge:true,startAt:urgent.length?assignmentStart(urgent[0].assignment):null},null,'publication:'+ids.join(':'));
   urgent.forEach(v=>{v.urgent=true;});
   if(urgent.length)smcAlert(s,ctx,d,'urgent:'+urgent.map(x=>x.id).join(':'),'Urgent published relief: '+urgent.map(v=>'P'+v.period+' '+v.assignment.timeStart+' '+v.assignment.className+' '+v.assignment.subject+' '+(v.assignment.venue||'')).join('; '),true,'smc_alert',{templateKey:'relief_urgent_smc',snapshotIds:urgent.map(v=>v.id),assignedTeacherId:id,assignedTeacherName:staff(ctx,id).name,startAt:assignmentStart(urgent[0].assignment)});
   queueConditional(s,ctx,values);
  }
 }
 // Build indexes once per claim batch. Validation never trusts stale browser or outbox snapshots.
 function notificationIndex(s){
  const byId=new Map(s.publicationSnapshots.map(v=>[v.id,v])),latest=latestPublications(s,byId);
  const successfulSummaries=new Map(),summaryBuckets=new Map();for(const j of s.outbox){const summary=j.data?.scheduledSummary;if(j.kind!=='smc_report'||!summary)continue;const bucket=summaryBucketKey(j);if(!summaryBuckets.has(bucket))summaryBuckets.set(bucket,[]);summaryBuckets.get(bucket).push(j);if(j.deliveryStatus==='failed'||!(j.status==='sent'||['sent','delivered','read'].includes(j.deliveryStatus)))continue;const key=j.recipientId+'|'+j.date+'|'+summary.phase,previous=successfulSummaries.get(key);if(!previous||previous.data.scheduledSummary.at<summary.at)successfulSummaries.set(key,j);}
  return {byId,latest,successfulSummaries,summaryBuckets,absenceFingerprints:new Map(),ack:new Set([...snapshotAcknowledgements(s)].map(([id,a])=>a.staffId+'|'+id)),assignments:new Map(s.assignments.map(a=>[a.id,a])),requests:new Map(s.requests.map(r=>[r.id,r]))};
 }
 function notificationCurrent(s,j,now,index=notificationIndex(s)){
  j.data=j.data||{};const data=j.data,key=data.templateKey,currentDayNotice=['stapler_timetable','relief_publication','conditional_relief_instruction','relief_reminder'].includes(j.kind)||j.kind==='smc_alert'&&['relief_unacknowledged','relief_urgent_smc'].includes(key);
  if(j.expiresAt<=now)return 'Notification expired.';
  if(data.scheduledSummary){
   if(!scheduledSummaryCurrent(s,j))return 'Scheduled SMC summary slot was removed or is invalid.';
   const summary=data.scheduledSummary;
   if(!index.absenceFingerprints.has(j.date))index.absenceFingerprints.set(j.date,JSON.stringify(summaryAbsences(s,j.date)));
   if(index.absenceFingerprints.get(j.date)!==summary.fingerprint)return 'Absence summary was superseded by changed absences.';
   if(!summaryNeeded(index,j.recipientId,j.date,summary))return 'An unchanged or newer absence summary was already sent.';
  }
  const today=new Date(now+8*3600000).toISOString().slice(0,10);
  if(j.kind==='stapler_timetable'&&data.dailyPublication===true){if(j.date<today)return 'Published timetable notification is for a past day.';}
  else if(currentDayNotice&&(j.date!==today||j.createdAt&&!publishedOnDate(j.createdAt,j.date)))return 'Published notices are available only for the current Singapore workday.';
  if(j.kind==='stapler_timetable'&&data.communicationSnapshot){const snap=data.communicationSnapshot;if(snap.date!==j.date||snap.teachers?.length!==1||snap.teachers[0].staffId!==j.recipientId)return 'Recipient communication snapshot is invalid.';const state=dailyNoticeState({...s,absences:[],dailyPublicationStates:{...s.dailyPublicationStates,[j.date]:snap}},j.date,j.recipientId);if(state.delivery.jobId&&state.delivery.jobId!==j.id)return 'Another durable notification already covers this timetable, or its delivery outcome needs review.';data.templateKey='stapler_timetable';data.acknowledge=true;data.summary=dailyNoticeMessage();}else if(j.kind==='stapler_timetable'&&data.dailyPublication){const publication=s.dailyPublicationStates?.[j.date],teacher=publication?.teachers.find(t=>t.staffId===j.recipientId),state=dailyNoticeState(s,j.date,j.recipientId);if(!state.eligible)return state.reason;if(!teacher||!parsedTimetableFingerprint(teacher.fingerprint)||dailyJobFingerprint(s,publication,teacher,j)!==state.fingerprint)return 'Timetable notification was superseded.';if(state.delivery.jobId&&state.delivery.jobId!==j.id)return 'Another durable notification already covers this timetable, or its delivery outcome needs review.';data.templateKey='stapler_timetable';data.acknowledge=true;data.timetableNoticeId=timetableNoticeId(publication,teacher);data.summary=dailyNoticeMessage();data.attendanceAbsentPeriods=state.absentPeriods;}else if(j.kind==='stapler_timetable'){const record=s.staplerPlans.find(r=>r.date===j.date);if(!record?.published||!publishedOnDate(record.publishedAt,j.date)||(record.notifiedFingerprints?.[j.recipientId]||'baseline')!==data.fingerprint)return 'Timetable notification was superseded.';const attendance=legacyTimetableAttendance(s,j,record);if(attendance.issue)return attendance.issue;data.summary=dailyNoticeMessage();if(attendance.state)data.attendanceAbsentPeriods=attendance.state.absentPeriods;data.templateKey='stapler_timetable';data.acknowledge=true;data.timetableNoticeId=timetableNoticeSource(s,j.date,j.recipientId).row?.noticeId;}
  if(j.kind==='stapler_request'||j.kind==='stapler_decision'){const request=s.staplerRequests.find(r=>r.id===data.planningRequestId&&r.date===j.date);if(!request||request.retiredAt||j.kind==='stapler_request'&&(request.status!=='pending'||request.sponsorId!==j.recipientId)||j.kind==='stapler_decision'&&((data.audience==='stapler-sponsor'?request.sponsorId!==j.recipientId:request.staffId!==j.recipientId)||request.status!==data.decision))return 'Planning request notification was superseded.';data.requesterId=request.staffId;data.requesterName=request.name;}
  if(j.kind==='mutual_request'){
   const r=index.requests.get(j.requestId);if(!r||r.retiredAt||r.status!=='pending'||r.recipientId!==j.recipientId||r.expiresAt<=now)return 'Peer request is no longer pending.';
   Object.assign(data,{templateKey:'mutual_request',requesterName:r.absentName,summary:r.lessons.map(l=>'P'+l.period+' '+l.timeStart+' to '+l.timeEnd+' · '+[l.className,l.subject,l.groupName,l.venue].filter(Boolean).join(' · ')).join('; ')});
  }
  if(j.kind==='mutual_override'&&data.peerRelease===true){
   const request=Array.isArray(data.peerRequestIds)&&data.peerRequestIds.length===1?index.requests.get(data.peerRequestIds[0]):null;
   if(!request||request.date!==j.date||![request.staffId,request.recipientId].includes(j.recipientId))return 'Peer release is not owned by this recipient.';
   if(!Array.isArray(data.peerReleasedDemandIds)||!Array.isArray(data.peerReleaseTokens))return 'Peer release has no verified lessons.';
   const lessons=releasedPeerLessons(s,request).filter(row=>data.peerReleasedDemandIds.includes(row.id)&&data.peerReleaseTokens.includes(row.releaseToken));
   if(!lessons.length)return 'Peer arrangement is no longer released.';
   data.summary='Peer arrangement released: '+request.absentName+' and '+request.recipientName+'.\n'+lessons.sort((a,b)=>a.period-b.period).map(row=>'P'+row.period+' · '+row.timeStart+' to '+row.timeEnd+' · '+[row.className,row.subject,row.venue].filter(Boolean).join(' · ')).join('\n')+'\nThese peer duties are no longer assigned. Review the latest timetable in Roster.';
   data.templateKey='mutual_override';
  }
  if(j.kind==='mutual_override'&&data.peerRelease!==true&&Array.isArray(data.peerRequestIds)){
   const requests=data.peerRequestIds.map(id=>index.requests.get(id)).filter(r=>r&&!r.retiredAt&&r.staffId===j.recipientId&&r.date===j.date);
   if(!requests.length)return 'Peer arrangement is not owned by this recipient.';
   const lessons=new Map();for(const r of requests)for(const l of r.lessons||[])lessons.set(l.id,l);
   data.summary=[...lessons.values()].sort((a,b)=>a.period-b.period).map(l=>{
    const a=s.assignments.find(a=>a.demandId===l.id&&a.status==='published'&&!a.remove);
    return 'P'+l.period+' · '+l.timeStart+' to '+l.timeEnd+' · '+[l.className,l.subject,l.venue].filter(Boolean).join(' · ')+' · '+(a?(a.noRelief?'No Relief Needed':'Published cover: '+a.relieverName):'Previous arrangement cancelled. Check the latest coverage in Roster.');
   }).join('\n');data.templateKey='mutual_override';
  }
  if(data.snapshotIds?.length){
   const values=j.kind==='conditional_relief_instruction'?data.snapshotIds.map(id=>index.byId.get(id)).filter(Boolean).map(v=>index.latest.get(v.assignmentId+'|'+v.staffId)).filter(Boolean):data.snapshotIds.map(id=>index.byId.get(id)).filter(v=>v&&index.latest.get(v.assignmentId+'|'+v.staffId)?.id===v.id);
   for(let n=values.length-1;n>=0;n--){const v=values[n];if(notificationAbsentInPeriod(s,v.date,v.staffId,v.period))values.splice(n,1);}
   if(!values.length)return 'Published instruction or assignment was superseded.';
   if(currentDayNotice&&values.some(v=>{const at=v.kind==='cancelled'?v.publishedAt:index.assignments.get(v.assignmentId)?.publishedAt,publication=s.dailyPublicationStates?.[j.date];return !publishedOnDate(at,j.date)&&!(v.date===j.date&&publication&&Date.parse(at)<=Date.parse(publication.publishedAt));}))return 'Publish these duties on their Singapore workday before sending notices.';
   if(j.kind==='relief_publication'){
    const own=values.filter(v=>v.staffId===j.recipientId&&v.date===j.date);if(!own.length)return 'Published recipient changed.';
    data.snapshotIds=own.map(v=>v.id);
    if(data.mutualChange&&own.some(v=>v.kind==='cancelled'&&v.assignment.mutual))data.templateKey='mutual_override';else if(own.some(v=>v.kind!=='assigned'))data.templateKey='relief_updated';else if(data.templateKey!=='relief_urgent')data.templateKey='relief_assignment';
    data.summary=data.templateKey==='mutual_override'?publicationSummary(own):shortPublicationSummary(own,data.templateKey==='relief_updated');
   }else if(j.kind==='conditional_relief_instruction'){
    const v=values.find(v=>v.staffId===j.recipientId&&v.kind!=='cancelled');if(!v)return 'Conditional instruction recipient changed.';
    const a=index.assignments.get(v.assignmentId),rule=(v.conditionalRules||[]).find(r=>r.id===data.ruleId&&r.version===data.ruleVersion);
    if(!a||!['published','completed'].includes(a.status)||a.staffId!==j.recipientId||a.date!==j.date||v.date!==j.date||a.absentId!==v.assignment.absentId||!rule)return 'Conditional instruction is no longer published for this teacher.';
    data.absentTeacherId=v.assignment.absentId;data.instruction=rule.text;data.templateKey='conditional_relief_instruction';data.checkedPublicationId=v.id;data.className=v.assignment.className;data.periodAndTime='P'+v.period+' · '+v.assignment.timeStart+' to '+v.assignment.timeEnd;
   }else{
    const pending=values.filter(v=>v.kind!=='cancelled'&&!index.ack.has(v.staffId+'|'+v.id)&&index.assignments.get(v.assignmentId)?.status==='published');
    if(!pending.length)return 'Duty acknowledged, cancelled or superseded.';
    const v=pending.sort((a,b)=>assignmentStart(a.assignment)-assignmentStart(b.assignment))[0];data.snapshotIds=pending.map(v=>v.id);data.startAt=assignmentStart(v.assignment);data.assignedTeacherId=v.staffId;data.assignedTeacherName=v.assignment.relieverName;
    data.summary=pending.map(v=>'P'+v.period+' · '+v.assignment.timeStart+' to '+v.assignment.timeEnd+' · '+[v.assignment.className,v.assignment.subject,v.assignment.venue].filter(Boolean).join(' · ')).join('; ');
    const minutes=(data.startAt-now)/60000;
    if(minutes<=0)return 'The lesson has started. Review outstanding acknowledgement in Roster.';
    if(data.templateKey==='relief_reminder'&&!(minutes>19&&minutes<=20))data.templateKey='relief_urgent';
    // Choose the text after the final template: a reminder keeps full detail, an urgent notice is compact.
    if(j.kind==='relief_reminder')data.summary=data.templateKey==='relief_urgent'?shortPublicationSummary(pending,false):publicationSummary(pending);
    if(data.templateKey==='relief_unacknowledged'&&!(minutes>9&&minutes<=10))data.templateKey='relief_urgent_smc';
   }
  }else if(['relief_publication','relief_reminder','conditional_relief_instruction'].includes(j.kind))return 'Legacy notification has no publication revision. Review it in Roster.';
  if(j.kind==='relief_publication'&&data.templateKey==='relief_urgent'&&!(data.startAt>now))data.templateKey='relief_assignment';
  if(!data.templateKey)data.templateKey=({contact_review:'contact_review',mutual_override:'mutual_override',capacity_warning:'capacity_warning',smc_alert:'smc_attention'})[j.kind];
  if(!data.templateKey)return 'Legacy planning notification has no verified template contract.';
  return null;
 }
 function releaseAssignment(s,ctx,a,reason){
  if(!['draft','published','completed'].includes(a.status))return false;
  if(ctx.manualMutation!==true&&(allocation().manualDecision(s,a.date,a.demandId)||a.origin==='smc')){if(a.reviewReason===reason&&a.invalidCover)return false;a.invalidCover=true;a.reviewReason=reason;a.reviewRequired=true;a.reviewAt=ctx.iso;allocation().bumpDay(s,a.date);allocation().addAudit(s,ctx,'manual-choice-invalid',{date:a.date,ids:[a.id],reason});return true;}
  if(ctx.draftBatch&&a.remove)return false;
  // A started automatic replacement remains a reviewable duty, not a removal tombstone.
  if((ctx.draftBatch||a.replaces)&&(['published','completed'].includes(a.status)||a.replaces)&&!(ctx.manualMutation!==true&&a.origin==='automatic'&&allocation().periodStarted(ctx,a.date,a.period,a))){
   const replaces=['published','completed'].includes(a.status)?a.id:a.replaces;if(a.status==='draft'){a.status='cancelled';a.cancelledAt=ctx.iso;}
   if(!s.assignments.some(row=>row.status==='draft'&&row.remove&&row.replaces===replaces))s.assignments.push({...copy(a),id:ctx.uuid(),status:'draft',origin:ctx.manualMutation?'smc':'automatic',remove:true,noRelief:false,rCost:0,replaces,publishedAt:null,createdAt:ctx.iso,createdBy:ctx.user.email});
   allocation().bumpDay(s,a.date);allocation().addAudit(s,ctx,'draft-release',{date:a.date,ids:[a.id],reason});return true;
  }
  if(allocation().periodStarted(ctx,a.date,a.period,a)){if(a.reviewReason!==reason){a.reviewReason=reason;a.reviewRequired=true;a.reviewAt=ctx.iso;allocation().addAudit(s,ctx,'started-relief-review',{date:a.date,ids:[a.id],reason});smcAlert(s,ctx,a.date,'started-review:'+a.id+':'+reason,'Review started relief: '+a.relieverName+', P'+a.period+'. '+reason);return true;}return false;}
  const published=a.status==='published';a.status='cancelled';a.cancelledAt=ctx.iso;a.cancellationReason=reason;a.updatedAt=ctx.iso;a.version=(a.version||1)+1;allocation().bumpDay(s,a.date);
  allocation().addAudit(s,ctx,'automatic-release',{date:a.date,ids:[a.id],reason,previousPublished:published});if(published&&!a.noRelief)queuePublication(s,ctx,[publicationSnapshot(s,ctx,a,'cancelled')]);return true;
 }
 // Report-only contexts omit current Deploy R, so cannot issue capacity warnings.
 function updateHealthWarnings(s,ctx,dates){if(ctx.quotaRequested===false)return;for(const d of new Set(dates)){if(!ctx.days[d]||ctx.days[d].schoolDay!==true)continue;const h=allocation().health(s,ctx,d,demand(ctx,s,d));if(h.incomplete)continue;const events=allocation().warningEvents(s,ctx,h);for(const e of events)smcAlert(s,ctx,d,e.key,'Relief capacity: P'+e.period+' has '+e.count+' eligible opportunities. Health '+(h.percentage===null?'No eligible capacity':h.percentage.toFixed(1)+'%')+'. '+h.uncovered.length+' uncovered periods.'+(e.count===0?' Consider external ad hoc relief.':''),!e.quiet,'capacity_warning',{templateKey:'capacity_warning',healthSummary:h.percentage===null?'No eligible capacity':h.percentage.toFixed(1)+'%',period:e.period,remaining:e.count});}}
 function healthRead(s,ctx,p){smc(ctx);const d=date(p.date||ctx.today),A=allocation(),projection={...s,accountingYears:copy(s.accountingYears),entitlements:s.entitlements.map(r=>({...r})),audit:[]};A.initialiseHistory(projection,ctx,d);A.captureWeek(projection,ctx,d);const bal=A.balances(projection,ctx,d);return {revision:s.revision,date:d,allocationRevision:s.dayRevisions[d]||0,health:A.health(projection,ctx,d,demand(ctx,s,d)),annual:ctx.people.map(x=>({staffId:x.id,...bal.get(x.id)})),dutySMC:copy(s.smcDutyRoster.find(r=>r.date===d)?.staffIds||[]),dutyStart:s.smcDutyRoster.find(r=>r.date===d)?.start||'',dutyEnd:s.smcDutyRoster.find(r=>r.date===d)?.end||'',dutySourceValid:ctx.dutySources?.[d]?.available===true,smcPeople:ctx.people.filter(x=>(ctx.dutySources?.[d]?.staffIds||[]).includes(x.id)&&(ctx.smcIds||[]).includes(x.id)&&x.active).map(({id,name})=>({id,name})),alerts:copy(s.smcAlerts.filter(x=>x.date===d&&(x.origin!=='whatsapp-urgent'||(x.recipients||[]).includes(ctx.user.staffId)))),accounting:copy(projection.accountingYears[A.year(d)]||{verified:false}),lastRun:copy(s.optimisationRuns.filter(x=>x.date===d).at(-1)||null)};}
 function captureOptimisationRun(s,run){if(s.systemConfig?.verboseLogging===false){delete run.decisionEvidence;run.auditExportSuppressed=true;}if(run.decisionEvidence){run.decisionInputs=copy(run.decisionEvidence.inputs);const comparable=e=>JSON.stringify({...e,inputs:{...e.inputs,allocationRevision:0}}),previous=s.optimisationRuns.filter(r=>r.date===run.date&&r.decisionEvidence).at(-1);if(previous&&comparable(previous.decisionEvidence)===comparable(run.decisionEvidence)){run.decisionEvidenceRef=previous.id;delete run.decisionEvidence;}}s.optimisationRuns.push(run);return run;}
 function runOptimisation(s,ctx,d,cycleKey,fillOnly=false,manual=false){
  reconcile(s,ctx);const A=allocation();if(d<ctx.today)fail(409,'Past dates are view only.');if(!manual&&!fillOnly&&!A.mayOptimise(ctx,d))fail(409,'Scheduled allocation is outside its permitted window.');
  if(!ctx.days[d]?.schoolDay||ctx.days[d]?.verified===false)fail(409,'A confirmed school timetable is required.');
  A.initialiseHistory(s,ctx,d);A.captureWeek(s,ctx,d);const Y=A.year(d);
  if(!s.accountingYears[Y]?.verified){smcAlert(s,ctx,d,'accounting-required:'+Y,'Automatic allocation is paused: Admin must verify '+Y+' historical weekly R entitlements and relief already performed. No history has been invented.',false);captureOptimisationRun(s,{id:ctx.uuid(),date:d,key:cycleKey,at:ctx.iso,status:'paused',reason:'Annual accounting history is not verified.',...(s.systemConfig?.verboseLogging===false?{}:{decisionEvidence:{version:1,inputs:{baselineId:ctx.days[d]?.id||null,staplerRevision:ctx.days[d]?.staplerRevision||0},lessons:[],periods:[],teachers:[]}})});return {paused:true,reason:'Annual accounting history is not verified.',savedIds:[]};}
  const proposal=A.optimise(s,ctx,d,demand(ctx,s,d),{maxNodes:256,fillOnly,preferences:operationalSettings(s).systemConfig.allocationPreferences,...(!manual&&ctx.allocationBudgetCheck?{checkBudget:ctx.allocationBudgetCheck}:{})}),existing=fillOnly?[]:A.effectiveAssignments(s).filter(a=>a.date===d&&!A.protectedAssignment(a)&&!A.periodStarted(ctx,d,a.period,a)&&!ctx.people.some(person=>person.id===a.staffId&&!A.reliefCandidateEligible(person))),savedIds=[],changes=[],replacementAncestry=new Map([...s.assignments.filter(a=>a.date===d&&a.status==='draft'&&a.replaces),...existing].filter(a=>a.replaces).map(a=>[a.demandId,a.replaces]));
  if(!manual&&ctx.allocationBudgetCheck)ctx.allocationBudgetCheck();
  if(!proposal.coverageProven){smcAlert(s,ctx,d,'solver-budget:'+cycleKey,'Optimisation reached its deterministic search bound. The last valid draft is retained for SMC review.',false);captureOptimisationRun(s,{id:ctx.uuid(),date:d,key:cycleKey,at:ctx.iso,status:'bounded',upperBound:proposal.upperBound,solver:proposal.solver,decisionEvidence:proposal.decisionEvidence});return {paused:true,reason:'Coverage could not be certified within the search bound.',savedIds:[]};}
  if(proposal.changed){const byDem=new Map(demand(ctx,s,d).map(x=>[x.id,x]));for(const a of existing)if(!proposal.assignments.some(x=>x.demandId===a.demandId&&x.staffId===a.staffId&&x.period===a.period&&A.cost(x)===A.cost(a)&&!!x.repurposedDuty===!!a.repurposedDuty)){changes.push({demandId:a.demandId,period:a.period,from:a.staffId,to:proposal.assignments.find(x=>x.demandId===a.demandId)?.staffId||null});a.status='cancelled';a.cancellationReason='Automatic reoptimisation';a.cancelledAt=ctx.iso;if(a.replaces&&!proposal.assignments.some(x=>x.demandId===a.demandId))s.assignments.push({...copy(a),id:ctx.uuid(),status:'draft',origin:'automatic',protected:false,remove:true,noRelief:false,rCost:0,createdAt:ctx.iso,createdBy:'automatic'});}
   for(const x of proposal.assignments){if(existing.some(a=>a.status==='draft'&&a.demandId===x.demandId&&a.staffId===x.staffId&&a.period===x.period&&A.cost(a)===A.cost(x)&&!!a.repurposedDuty===!!x.repurposedDuty))continue;const dem=byDem.get(x.demandId);if(!dem)fail(409,'Relief demand changed.');const abs=s.absences.find(a=>a.id===dem.absenceId),row=snapshot({id:ctx.uuid(),demandId:dem.id,staffId:x.staffId,status:'draft',origin:'automatic',protected:false,mutual:false,noRelief:false,remove:false,replaces:replacementAncestry.get(dem.id)||null,rCost:x.rCost??1,repurposedDuty:x.repurposedDuty===true,version:1,createdAt:ctx.iso,createdBy:'automatic'},dem,{...ctx,instruction:assignmentInstructions(s,dem),customInstruction:customText(s,dem)});for(const removal of s.assignments.filter(a=>a.demandId===dem.id&&a.status==='draft'&&a.remove)){removal.status='cancelled';removal.cancelledAt=ctx.iso;}s.assignments.push(row);savedIds.push(row.id);if(!changes.some(c=>c.demandId===dem.id))changes.push({demandId:dem.id,period:dem.period,from:null,to:x.staffId});
    const tied=proposal.candidates.filter(c=>c.staffId===x.staffId||Number.isFinite(c.annual)&&Number.isFinite(proposal.candidates.find(v=>v.staffId===x.staffId)?.annual)&&Math.abs(c.annual-proposal.candidates.find(v=>v.staffId===x.staffId).annual)<=1);s.rotationEvents.push({id:ctx.uuid(),sequence:s.rotationEvents.length+1,year:Y,assignmentId:row.id,staffId:row.staffId,candidates:tied.map(c=>c.staffId).sort(),at:ctx.iso,source:'automatic'});
   }A.bumpDay(s,d);A.addAudit(s,ctx,fillOnly?'autoAllocate':'optimise',{date:d,ids:savedIds,reason:proposal.reason,changes,fairness:proposal.fairness,preferences:proposal.preferences,ruleEnabled:proposal.ruleEnabled,workloadLimits:proposal.workloadLimits,policyScore:proposal.policyScore,configUpdatedAt:s.systemConfig.updatedAt||null,candidates:proposal.candidates});
  }
  const consecutiveBlockWarnings=copy(proposal.consecutiveBlockWarnings||[]);for(const warning of consecutiveBlockWarnings)smcAlert(s,ctx,d,'consecutive-subject:'+cycleKey+':'+warning.demandIds.join('|'),warning.subject+' '+warning.periods+'-period block: '+warning.reason,false);
  const run={id:ctx.uuid(),date:d,key:cycleKey,at:ctx.iso,status:'complete',consecutiveBlockWarnings,changed:proposal.changed,coverage:proposal.coverage,uncovered:proposal.uncovered,reason:proposal.reason,fairness:proposal.fairness,solver:proposal.solver,coverageProven:proposal.coverageProven,preferencesProven:proposal.solver.preferencesProven,preferenceSearchNote:proposal.solver.preferencesProven?'Minimum deviation proved.':'Search limit reached; best rule match found at maximum coverage.',preferences:proposal.preferences,ruleEnabled:proposal.ruleEnabled,workloadLimits:proposal.workloadLimits,policyScore:proposal.policyScore,configUpdatedAt:s.systemConfig.updatedAt||null,decisionEvidence:proposal.decisionEvidence};captureOptimisationRun(s,run);updateHealthWarnings(s,ctx,[d]);return {savedIds,run};
 }
 function allocationMode(p){
  if(p.allocationMode!==undefined&&!['fill-only','reoptimise'].includes(p.allocationMode))fail(400,'Choose Auto-allocate or Auto-fill blanks.');
  return p.operation==='autoAllocate'?(p.allocationMode||'fill-only'):'reoptimise';
 }
 function r17Apply(s,ctx,p){
  const A=allocation(),d=date(p.date||ctx.today),op=p.operation;let result={savedIds:[]};
  if(op==='optimise'||op==='autoAllocate'){smc(ctx);const fillOnly=allocationMode(p)==='fill-only';result=runOptimisation(s,ctx,d,(fillOnly?'fill-only:':'manual-trigger:')+p.requestId,fillOnly,true);}
  else if(op==='setDutySMC')result=dutyListApply(s,ctx,p);
  else if(op==='importRHistory'){
   admin(ctx);const reason=text(p.reason||'',1000);if(!reason)fail(400,'Give the historical source and reason.');if(!Array.isArray(p.rows)||!p.rows.length||p.rows.length>500)fail(400,'Import 1 to 500 verified weekly rows at a time.');
   for(const v of p.rows){staff(ctx,v.staffId);const w=date(v.week),Y=String(v.year||w.slice(0,4));if(A.monday(w)!==w||!/^20\d\d$/.test(Y)||!Number.isFinite(v.quota)||v.quota<0||v.quota>84||!Number.isFinite(v.completedOutsideRoster||0)||v.completedOutsideRoster<0||v.completedOutsideRoster>500)fail(400,'Use Monday dates, non-negative weekly R and verified completed periods.');if(w>A.monday(ctx.today)&&v.completedOutsideRoster>0)fail(400,'Future relief cannot be imported as completed.');
    const prev=s.entitlements.find(x=>x.staffId===v.staffId&&x.week===w&&x.year===Y);if(prev){if(prev.quota!==v.quota||prev.excluded!==(v.excluded===true))fail(409,'An existing historical weekly quota differs. It cannot be overwritten by an import.');}else{s.entitlements.push({id:ctx.uuid(),staffId:v.staffId,week:w,year:Y,quota:v.quota,excluded:v.excluded===true,source:reason,capturedAt:ctx.iso,mode:v.specialHoliday?'special-holiday':'imported',importedBy:ctx.user.email});}
    const id='history:'+Y+':'+v.staffId+':'+w,old=s.importedRelief.find(x=>x.id===id);if(old&&old.rCost!==(v.completedOutsideRoster||0))fail(409,'Historical completed relief already exists with a different value. Use audited correction.');if(!old&&v.completedOutsideRoster>0)s.importedRelief.push({id,staffId:v.staffId,date:w,accountingYear:Y,period:null,status:'completed',rCost:v.completedOutsideRoster,source:reason,origin:'imported',createdAt:ctx.iso});result.savedIds.push(id);
   }A.addAudit(s,ctx,op,{date:d,ids:result.savedIds,reason});
  }else if(op==='verifyRYear'){admin(ctx);const Y=String(p.year||d.slice(0,4)),reason=text(p.reason||'',1000);if(!/^20\d\d$/.test(Y)||!reason||p.confirm!==true)fail(400,'Confirm the year, historical completeness and source.');s.accountingYears[Y]={verified:true,at:ctx.iso,by:ctx.user.email,reason};A.addAudit(s,ctx,op,{date:d,year:Y,reason});}
  else if(op==='correctRelief'){
   smc(ctx);const source=s.assignments.find(a=>a.id===p.id)||s.importedRelief.find(a=>a.id===p.id);if(!source)fail(404,'Relief record not found.');if(!A.periodStarted(ctx,source.date,source.period,source)&&source.status!=='completed')fail(400,'Use ordinary assignment controls before the period starts.');const reason=text(p.reason||'',1000);const actual={staffId:p.staffId||source.staffId,date:date(p.actualDate||source.date),period:p.period===undefined?source.period:p.period,completionStatus:p.completionStatus};staff(ctx,actual.staffId);if(actual.date>ctx.today||!['completed','not-completed','in-progress'].includes(actual.completionStatus)||actual.period!==null&&(!Number.isInteger(actual.period)||actual.period<0||actual.period>39))fail(400,'Choose a valid actual teacher, past/current date, period and completion status.');
   if(actual.completionStatus==='completed'&&actual.period!==null&&A.accounted(s,ctx).some(a=>a.id!==source.id&&a.staffId===actual.staffId&&a.date===actual.date&&a.period===actual.period&&A.cost(a)>0))fail(409,'This teacher already has a counted relief record for that period.');
   const row={id:ctx.uuid(),assignmentId:source.id,sequence:s.reliefCorrections.length+1,original:A.corrected(s,source),actual,reason,at:ctx.iso,by:ctx.user.email};s.reliefCorrections.push(row);A.addAudit(s,ctx,op,{date:d,ids:[source.id],reason,actual,rotation:A.rotation(s,A.year(actual.date))});result.savedIds=[row.id];
  }else if(op==='confirmCompleted'){
   smc(ctx);if(p.confirm!==true)fail(400,'Confirm that these relief duties took place.');const ids=new Set(p.ids||[]),rows=s.assignments.filter(a=>ids.has(a.id));if(!rows.length||rows.length!==ids.size||rows.some(a=>a.status!=='published'||a.noRelief||!A.periodEnded(ctx,a.date,a.period,a)))fail(400,'Select ended, published relief duties only.');for(const a of rows){a.status='completed';a.completionStatus='completed';a.accountingPending=false;a.completedAt=ctx.iso;a.completedVerifiedBy=ctx.user.email;result.savedIds.push(a.id);}A.addAudit(s,ctx,op,{date:d,ids:result.savedIds});
  }else return null;return result;
 }
 function scheduledTick(s,ctx,scheduledTime){
  const A=allocation();A.ensure(s);if(!ctx.service)fail(403,'Only the signed scheduler may run this operation.');if(!Number.isFinite(scheduledTime)||scheduledTime>ctx.now+60000||ctx.now-scheduledTime>120000)fail(400,'Scheduled tick is stale.');const slot=A.schedule(scheduledTime),d=slot.date,key=slot.key;
  const allocationKey=ctx.scheduledAllocationKey||key,allocationSlot=slot.optimise||ctx.scheduledAllocationRetry===true&&slot.allocationKey===allocationKey,cancellation=s.scheduleReceipts[allocationKey]?.cancelled?s.scheduleReceipts[allocationKey]:null;let skipAllocation=ctx.skipScheduledAllocation===true||!!cancellation;
  if(s.scheduleReceipts[key]&&(!cancellation||cancellation.reportComplete))return {replayed:true,savedIds:[]};let result={savedIds:[],allocationPaused:operationalSettings(s).systemConfig.scheduledAllocationEnabled!==true,...(skipAllocation?{allocationSkipped:true}:{})};
  if(!skipAllocation&&allocationSlot&&operationalSettings(s).systemConfig.scheduledAllocationEnabled&&ctx.days[d]?.schoolDay===true){if(A.mayOptimise(ctx,d)){try{result=runOptimisation(s,ctx,d,allocationKey);}catch(error){if(error.code!=='ALLOCATION_BUDGET')throw error;skipAllocation=true;result={savedIds:[],allocationSkipped:true,allocationTimedOut:true};}}else smcAlert(s,ctx,d,'missed-cutoff:'+d,'Final optimisation did not complete before the cut-off. Review the last valid draft and allocate manually.',false);}
  const summarySlot=smcSummarySlot(s,scheduledTime),window=summarySlot?.phase||null;
  const finalRunComplete=result.run?.status==='complete'||s.optimisationRuns.some(r=>r.date===d&&r.key.includes('T06:29')&&r.status==='complete');
  if([389,390].includes(slot.minute)&&ctx.days[d]?.schoolDay===true&&!finalRunComplete)smcAlert(s,ctx,d,'final-incomplete:'+d,'The final scheduled optimisation has NOT completed successfully. Review the last valid draft and allocate manually.',true,'smc_alert',{templateKey:'smc_attention'});
  if(summarySlot&&ctx.days[d]?.verified===true&&ctx.days[d]?.schoolDay===true){
   const absences=summaryAbsences(s,d),fingerprint=JSON.stringify(absences),scheduledSummary={...summarySlot,fingerprint},summaryIndex=notificationIndex(s);
   if(dutySMC(s,ctx,d).some(id=>summaryNeeded(summaryIndex,id,d,scheduledSummary))){
    const h=A.health(s,ctx,d,demand(ctx,s,d)),healthSummary=h.percentage===null?'No eligible capacity':h.percentage.toFixed(1)+'%',coverage=A.effectiveAssignments(s).filter(a=>a.date===d&&!a.noRelief).length;
    const absentText=absences.map(a=>String(ctx.people.find(p=>p.id===a.staffId)?.name||a.staffId).replace(/\s+/g,' ').trim()||a.staffId).join('; ');
    const absentCount=absences.length+' absent teacher'+(absences.length===1?'':'s'),coverageText=coverage+' periods have planned cover; '+h.uncovered.length+' uncovered. Low-capacity periods: '+(h.periods.filter(p=>p.green.length<=2).map(p=>'P'+p.period+' ('+p.green.length+')').join(', ')||'None')+'.';
    let summary=absentCount+(absentText?': '+absentText:'')+'. '+coverageText;
    if(summary.length>900)summary=absentCount+'. '+coverageText+' Names omitted; open Roster for the full absence list.';
    // Morning summaries describe absence state, including cancellations, without claiming new absences.
    const templateKey=summarySlot.phase==='evening'?'relief_evening':'relief_morning';
    smcAlert(s,ctx,d,'report:'+summarySlot.key,summary,true,'smc_report',{templateKey,healthSummary,finalRunComplete,scheduledSummary},summaryIndex);
   }
  }
  for(const id of new Set(s.publicationSnapshots.map(v=>v.staffId))){for(const v of pendingPublications(s,id)){if(v.kind==='cancelled'||v.date!==ctx.today||s.dailyPublicationStates?.[v.date]&&!s.outbox.some(j=>j.date===v.date&&j.recipientId===id&&j.data?.dailyPublication&&j.data.fingerprint===s.dailyPublicationStates[v.date].teachers.find(t=>t.staffId===id)?.fingerprint))continue;const start=assignmentStart(v.assignment),before=(start-ctx.now)/60000;if(before<=0)continue;
    if(before<=20&&!v.urgent)queue(s,ctx,'relief_reminder',id,v.date,{templateKey:before>19?'relief_reminder':'relief_urgent',summary:before>19?publicationSummary([v]):shortPublicationSummary([v],false),snapshotIds:[v.id],startAt:start},null,'reminder:'+v.id);
    if(before<=10)smcAlert(s,ctx,v.date,'unacknowledged:'+v.id,'Unacknowledged relief: '+staff(ctx,id).name+', P'+v.period+' at '+v.assignment.timeStart+'.',true,'smc_alert',{templateKey:before>9?'relief_unacknowledged':'relief_urgent_smc',snapshotIds:[v.id],assignedTeacherId:id,assignedTeacherName:staff(ctx,id).name,startAt:start});
  }}
  const report=queueDailyEmployment(s,ctx,ctx.today),allocated=!skipAllocation&&allocationSlot&&s.systemConfig.scheduledAllocationEnabled;
  s.scheduleReceipts[key]={...(key===allocationKey?cancellation:null),at:ctx.iso,report:window,optimise:allocated,...(cancellation&&key===allocationKey?{reportComplete:true}:{}),...(result.allocationTimedOut?{allocationStatus:'budget'}:allocated?{allocationStatus:'complete'}:{})};
  if(key!==allocationKey&&(allocated||result.allocationTimedOut))s.scheduleReceipts[allocationKey]={...s.scheduleReceipts[allocationKey],at:ctx.iso,optimise:allocated,allocationStatus:result.allocationTimedOut?'budget':'complete'};return {...result,...report};
 }

 // A human assigner shows as a name: the timetable (TTb) name, then the Contacts
 // name, then the GSPS email alias ("ngiam.song.wee@..." -> "Ngiam Song Wee").
 function actorAlias(actor){return String(actor).split('@')[0].split('.').filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()).join(' ');}
 function actorName(actor,s,ctx){
  if(!/@/.test(String(actor)))return actor;const email=String(actor).toLowerCase(),person=(ctx?.people||[]).find(p=>String(p.email||'').toLowerCase()===email||(p.emails||[]).some(e=>String(e).toLowerCase()===email));
  const ttb=person&&(Object.values(ctx?.days||{}).flatMap(day=>day?.teachers||[]).find(t=>t.staffId===person.id)||{}),bridge=person&&(s?.nameBridges||[]).find(b=>b.staffId===person.id&&!b.retiredAt);
  return ttb?.timetableName||ttb?.name||bridge?.timetableName||person?.name||actorAlias(actor);
 }
 function assignmentBy(a,s,ctx){
  if(a.origin==='automatic'||!a.origin&&a.createdBy==='automatic')return 'Auto-allocation';
  if(a.origin==='mutual'||a.origin!=='smc'&&(a.mutual||a.peerApproved))return 'Peer arrangement';
  if(a.origin==='shared-subject')return 'Shared subject rule';
  const actor=a.updatedBy||a.createdBy;return actor&&!['automatic','smc','mutual','shared-subject'].includes(actor)?actorName(actor,s,ctx):'Not recorded';
 }
 function publicDuty(a,s,ctx){
  const keys=['id','demandId','absenceId','date','period','timeStart','timeEnd','staffId','relieverName','absentId','absentName','subject','className','venue','groupName','instructions','customInstructions','status','version','publishedAt','combination','sameClass','repurposedDuty','mutual','noRelief','remove','cancelledAt','cancellationReason','recessActivationId','recessActivationIds','classId','level','groupIds','sharedLessonKey','absenceIds','absentIds','members'];
  return {...Object.fromEntries(keys.filter(k=>a[k]!==undefined).map(k=>[k,copy(a[k])])),assignedBy:assignmentBy(a,s,ctx)};
 }
 function noticeView(s,ctx,v,acks){const ack=acks?acks.get(v.id):snapshotAcknowledgements(s).get(v.id);return {id:v.id,assignmentId:v.assignmentId,revision:v.revision,date:v.date,period:v.period,kind:v.kind,publishedAt:v.publishedAt,instructions:v.instructions,customInstructions:v.customInstructions,assignment:publicDuty(v.assignment,s,ctx),acknowledgedAt:ack?.at||null,...(ack?.acknowledgementSource?{acknowledgementSource:ack.acknowledgementSource}:{}),urgent:!!v.urgent&&!ack};}
 function smcAcknowledgements(s,d){const latest=new Map(),acks=snapshotAcknowledgements(s);for(const v of s.publicationSnapshots)latest.set(v.assignmentId+'|'+v.staffId,v.id);return s.publicationSnapshots.filter(v=>v.date===d).map(v=>({id:v.id,assignmentId:v.assignmentId,staffId:v.staffId,period:v.period,kind:v.kind,revision:v.revision,acknowledgedAt:acks.get(v.id)?.at||null,...(acks.get(v.id)?.acknowledgementSource?{acknowledgementSource:acks.get(v.id).acknowledgementSource}:{}),latest:latest.get(v.assignmentId+'|'+v.staffId)===v.id}));}
 function acknowledgementView(s,ctx){const acks=snapshotAcknowledgements(s);return pendingPublications(s,ctx.user.staffId).map(v=>noticeView(s,ctx,v,acks));}
 function notificationHistory(s,ctx,p){
  const offset=Number(p.offset||0),limit=Math.min(100,Math.max(1,Number(p.limit)||30));if(!Number.isInteger(offset)||offset<0||offset>1000000)fail(400,'Choose a valid history page.');
  const current=latestPublications(s),visible=new Set(),rows=[],acks=snapshotAcknowledgements(s);for(let i=s.publicationSnapshots.length-1;i>=0;i--){const v=s.publicationSnapshots[i];if(v.staffId!==ctx.user.staffId)continue;const key=v.assignmentId+'|'+v.staffId;if(current.get(key)?.id===v.id)visible.add(key);if(visible.has(key))rows.push(v);}return {revision:s.revision,history:rows.slice(offset,offset+limit).map(v=>noticeView(s,ctx,v,acks)),nextOffset:offset+limit<rows.length?offset+limit:null};
 }
 function syncLessonInstructions(s,ctx,absenceIds){
  const wanted=new Set(absenceIds),notices=[];
  for(const a of s.assignments){if(!(wanted.has(a.absenceId)||(a.absenceIds||[]).some(id=>wanted.has(id)))||!['draft','published'].includes(a.status)||a.noRelief||a.remove||allocation().periodEnded(ctx,a.date,a.period,a))continue;
   const next=assignmentInstructions(s,a);if(String(a.instructions||'')===next)continue;
   if(a.status==='published'&&!s.publicationSnapshots.some(v=>v.assignmentId===a.id))publicationSnapshot(s,{...ctx,iso:a.publishedAt||ctx.iso},a);
   a.instructions=next;a.version=(a.version||1)+1;a.updatedAt=ctx.iso;allocation().bumpDay(s,a.date);
   if(a.status==='published')notices.push(publicationSnapshot(s,ctx,a,'instructions'));
  }queuePublication(s,ctx,notices);
 }
 function noReliefApply(s,ctx,p){
  smc(ctx);const A=allocation(),ds=findDemands(s,ctx,p.demandIds||[]),set=p.noRelief!==false;
  const prior=A.effectiveAssignments(s,true).filter(a=>ds.some(d=>d.id===a.demandId));if(!set)return unassign(s,ctx,p);supersedePeerRequests(s,ctx,p,peerOverrides(s,ctx,ds));
  const ids=[];for(const dem of ds){
   const before=decisionValue(s,ctx,dem),policy=prior.find(a=>a.demandId===dem.id&&a.noRelief);if(set&&policy){ids.push(policy.id);continue;}
   if(!set){if(policy){if(ctx.draftBatch&&(policy.status==='published'||policy.replaces)){releaseAssignment(s,ctx,policy,'SMC restored Unassigned');ids.push(policy.id);continue;}policy.status='cancelled';policy.cancelledAt=ctx.iso;policy.cancelledBy=ctx.user.email;policy.cancellationReason='SMC restored Unassigned';ids.push(policy.id);}else continue;}
   else{
    for(const a of s.assignments.filter(a=>a.demandId===dem.id&&['draft','published'].includes(a.status)))releaseAssignment(s,{...ctx,draftBatch:true,manualMutation:true},a,'SMC marked No Relief Needed');
    const policy={...copy(dem),id:ctx.uuid(),demandId:dem.id,staffId:dem.staffId,absentId:dem.staffId,absentName:dem.name,status:'draft',origin:'smc',protected:true,noRelief:true,remove:false,rCost:0,version:1,sourceKey:JSON.stringify([dem.timetableId,dem.subject,dem.className,dem.venue,dem.groupName]),createdAt:ctx.iso,createdBy:ctx.user.email};s.assignments.push(policy);ids.push(policy.id);
   }
   recordManualDecision(s,ctx,dem,'noRelief',s.assignments.find(a=>a.id===ids.at(-1)),before,'noRelief');A.addAudit(s,ctx,set?'noRelief':'restoreUnassigned',{date:dem.date,ids:[ids.at(-1)],demandId:dem.id,previous:prior.filter(a=>a.demandId===dem.id).map(a=>a.id),reason:null});
  }// Bounded draft removals refresh capacity separately after the durable acknowledgement.
  if(ctx.cellMutation!==true)updateHealthWarnings(s,ctx,ds.map(d=>d.date));return {savedIds:ids,savedId:ids[0]||null};
 }
 function publishAssignments(s,ctx,p){
  smc(ctx);const A=allocation(),d=date(p.date||ctx.today),issue=publishDateIssue(ctx,d,s);if(issue)fail(403,issue);
  if(!Number.isInteger(p.allocationRevision)||p.allocationRevision!==(s.dayRevisions[d]||0))fail(409,'The allocation changed. Review the latest matrix and change summary, then publish again.','DAY_CONFLICT');
  const replaced=new Set(s.assignments.filter(a=>a.date===d&&a.status==='draft'&&a.replaces).map(a=>a.replaces)),rows=s.assignments.filter(a=>a.date===d&&(a.status==='draft'||!replaced.has(a.id)&&(a.status==='published'&&!s.dailyPublicationStates?.[d]&&!publishedOnDate(a.publishedAt,d)||a.publicationWithheldAt&&['published','completed'].includes(a.status)))).sort((a,b)=>a.period-b.period||a.id.localeCompare(b.id)),notices=[],savedIds=[],peerRequestIds=new Set();
  const invalidChoices=[],withheld=[];
  const review=publishAudit(s,ctx,d),auditReason=text(p.auditReason||'',2000);
  for(const a of rows){
   const old=s.assignments.find(x=>x.id===a.replaces&&['published','completed'].includes(x.status));
   if(old){if(old.mutual&&old.requestId)peerRequestIds.add(old.requestId);if(!s.publicationSnapshots.some(v=>v.assignmentId===old.id))publicationSnapshot(s,{...ctx,iso:old.publishedAt||ctx.iso},old);if(A.periodStarted(ctx,old.date,old.period,old)){old.actualReviewRequired=true;old.actualStatusBeforeReplacement=old.status;a.accountingPending=!a.noRelief&&!a.remove;}old.status='cancelled';old.cancelledAt=ctx.iso;old.cancellationReason='Published replacement';old.version=(old.version||1)+1;if(!old.noRelief)notices.push(publicationSnapshot(s,ctx,old,'cancelled'));}
   delete a.publicationWithheldAt;delete a.publicationWithheldBy;a.status=a.remove?'cancelled':a.status==='completed'?'completed':'published';a.publishedAt=ctx.iso;a.publishedBy=ctx.user.email;a.version=(a.version||1)+1;
   if(!a.noRelief&&!a.remove){a.instructions=assignmentInstructions(s,a);a.customInstructions=customText(s,a);notices.push(publicationSnapshot(s,ctx,a));}savedIds.push(a.id);
  }
  if(rows.length||withheld.length){if(!s.massPublications[d])s.massPublications[d]={at:ctx.iso,by:ctx.user.email,reason:auditReason||null,changes:review.changes};A.bumpDay(s,d);if(p.notifyMode===undefined)queuePublication(s,ctx,notices);
   const requesters=new Map();for(const id of peerRequestIds){const r=s.requests.find(r=>r.id===id);if(r){if(!requesters.has(r.staffId))requesters.set(r.staffId,[]);requesters.get(r.staffId).push(id);}}
   if(p.notifyMode===undefined)for(const [recipient,ids] of requesters)queue(s,ctx,'mutual_override',recipient,d,{templateKey:'mutual_override',peerRequestIds:ids,summary:'Your peer relief arrangement has changed. Review the latest published cover in Roster.'},null,'peer-change:'+d+':'+s.dayRevisions[d]+':'+recipient);
   A.addAudit(s,ctx,'publish',{date:d,ids:savedIds,reviewedRevision:p.allocationRevision,publishedRevision:s.dayRevisions[d],snapshotIds:notices.map(v=>v.id),auditReason:auditReason||null,reviewedChanges:review.changes,skippedChoiceIds:invalidChoices.map(a=>a.id)});}
  if(!s.massPublications[d]){s.massPublications[d]={at:ctx.iso,by:ctx.user.email,reason:auditReason||null,changes:review.changes};A.addAudit(s,ctx,'publish',{date:d,ids:[],reviewedRevision:p.allocationRevision,publishedRevision:s.dayRevisions[d]||0});}const report=p.notifyMode===undefined?queueDailyEmployment(s,ctx,d):{};return {...report,savedIds,allocationRevision:s.dayRevisions[d]||0,published:rows.length,skippedChoiceCount:invalidChoices.length,uncoveredCount:publishedReliefRows(s,ctx,d).filter(row=>row.status==='unassigned').length};
 }
 // A timetable notice belongs to one teacher's exact published content. The ID survives
 // unrelated republishing; delivery/read receipts never count as acknowledgement.
 function timetableSnapshotIds(s,d,id,publishedAt){
  const latest=new Map();for(const v of s.publicationSnapshots)if(v.date===d&&v.staffId===id&&(!publishedAt||Date.parse(v.publishedAt)<=Date.parse(publishedAt)))latest.set(v.assignmentId,v.id);return [...latest.values()];
 }
 function timetableInstructionRows(s,ids){const included=new Set(ids);return s.publicationSnapshots.filter(v=>included.has(v.id)&&v.kind!=='cancelled').map(v=>({period:v.period,instructions:v.instructions||'',customInstructions:v.customInstructions||'',conditionalInstructions:(v.conditionalRules||[]).map(r=>r.text)}));}
 function timetableNoticeId(snapshot,row){return row.noticeId||'daily:'+snapshot.date+':'+snapshot.revision+':'+encodeURIComponent(row.staffId);}
 function timetableAcknowledgement(s,snapshot,row,acks){const id=timetableNoticeId(snapshot,row),at=acks?acks.get(id):s.acknowledgements.find(a=>a.timetableNoticeId===id&&a.staffId===row.staffId)?.at;return {id,status:at?'acknowledged':'pending',acknowledgedAt:at||null};}
 function canonicalTimetableCells(cells){return (cells||[]).map(cell=>stapler().canonicalCell(cell));}
 function parsedTimetableFingerprint(value){try{const parts=JSON.parse(value);return Array.isArray(parts)&&[2,3].includes(parts.length)&&Array.isArray(parts[0])&&Array.isArray(parts[1])&&(parts.length===2||Array.isArray(parts[2]))?parts:null;}catch{return null;}}
 function canonicalDutyFingerprint(rows){return rows.map(a=>[a[1],a[2]||'',a[3]||'',a[4]||'',...stapler().canonicalCell(a.slice(5,9)),a[9]||'',a[10]||'',a[11]||[]]).sort((a,b)=>a[0]-b[0]||JSON.stringify(a).localeCompare(JSON.stringify(b)));}
 function capturedDutyFingerprint(s,d,id,at,ids){const selected=new Set(ids||timetableSnapshotIds(s,d,id,at));return s.publicationSnapshots.filter(v=>selected.has(v.id)&&v.kind!=='cancelled').map(v=>{const a=v.assignment;return [a.id,a.period,a.absentId,a.timeStart,a.timeEnd,a.subject,a.className,a.venue,a.groupName,v.instructions||'',v.customInstructions||'',(v.conditionalRules||[]).map(r=>r.text)];});}
 function legacyDutyFingerprint(s,publication,row,parts,at=publication.publishedAt){
  const captured=capturedDutyFingerprint(s,publication.date,row.staffId,at,row.snapshotIds);
  return parts[1].map(([period,instructions,customInstructions])=>{const previous=captured.find(a=>a[1]===period),detail=(row.rows||[]).find(r=>r.period===period),time=publication.periods.find(p=>p.period===period),cell=parts[0][period]||[];
   return previous?[...previous.slice(0,9),instructions||'',customInstructions||'',previous[11]||[]]:['',period,detail?.absentId||'',time?.start||'',time?.end||'',...cell,instructions||'',customInstructions||'',[]];
  });
 }
 function publishedContentFingerprint(s,publication,row){
  const parts=parsedTimetableFingerprint(row.fingerprint),duties=parts?.length===2?legacyDutyFingerprint(s,publication,row,parts):parts?.[2]||capturedDutyFingerprint(s,publication.date,row.staffId,publication.publishedAt,row.snapshotIds),periods=parts?.length===3?parts[1]:publication.periods.map(p=>[p.period,p.start,p.end]);
  return JSON.stringify([canonicalTimetableCells(row.cells||parts?.[0]),periods,canonicalDutyFingerprint(duties)]);
 }
 function dailyJobFingerprint(s,publication,row,job){
  // A carried correction keeps its notice identity only when every currently
  // present period is equivalent. Unrelated absence cells cannot obsolete it.
  if(row.targetedCorrectionPeriods?.length&&job.data?.timetableNoticeId===timetableNoticeId(publication,row))return publishedContentFingerprint(s,publication,row);
  if(job.data?.contentFingerprint)return job.data.contentFingerprint;
  if(job.data?.fingerprint===row.fingerprint)return publishedContentFingerprint(s,publication,row);
  const parts=parsedTimetableFingerprint(job.data?.fingerprint);if(!parts)return null;
  const duties=parts.length===2?legacyDutyFingerprint(s,publication,{staffId:job.recipientId,snapshotIds:job.data.snapshotIds},parts,job.createdAt):parts[2],periods=parts.length===3?parts[1]:publication.periods.map(p=>[p.period,p.start,p.end]);
  return JSON.stringify([canonicalTimetableCells(parts[0]),periods,canonicalDutyFingerprint(duties)]);
 }
 function dailyDeliveryState(job){if(!job)return 'not-requested';if(['delivered','read'].includes(job.deliveryStatus))return job.deliveryStatus;if(job.deliveryStatus==='failed')return 'failed';if(job.deliveryStatus==='sent'||job.status==='sent')return 'sent';return job.status;}
 // Publication history and delivery history are different: a return to baseline
 // only needs a correction when a different timetable may have reached the teacher.
 // Attendance narrows notification relevance; it never edits the released timetable.
 function absentTimetableCell(cell){return ['absent','#abs#'].includes(String(cell?.[0]||'').trim().toLowerCase())||stapler().isOfflineAbsence(cell?.[0]);}
 function notificationAttendance(s,publication,row){
  const periods=[...new Set((publication?.periods||[]).map(p=>p.period).filter(Number.isInteger))],absent=new Set([...(row?.absentPeriods||[]),...periods.filter(p=>absentTimetableCell(row?.cells?.[p])),...s.absences.filter(a=>!a.deletedAt&&a.date===publication?.date&&a.staffId===row?.staffId).flatMap(a=>allocation().absencePeriods(a,{periods:publication?.periods||[]}))]),presentPeriods=periods.filter(p=>!absent.has(p));
  return {absentPeriods:periods.filter(p=>absent.has(p)),presentPeriods,fullyAbsent:periods.length>0&&presentPeriods.length===0};
 }
 // Older publications may retain only the raw published cell fingerprint.
 // Decode it for attendance without inventing a missing baseline or rewriting history.
 function notificationAttendanceSource(s,d,id){
  const source=timetableNoticeSource(s,d,id);let row=source.row||{staffId:id};
  if(!Array.isArray(row.cells)){const fingerprint=row.fingerprint||s.staplerPlans.find(r=>r.date===d)?.notifiedFingerprints?.[id];let cells;try{cells=JSON.parse(fingerprint);}catch(_){}if(Array.isArray(cells)&&cells.every(cell=>Array.isArray(cell)&&cell.length===4&&cell.every(value=>typeof value==='string')))row={...row,cells};}
  return {publication:source.publication,row};
 }
 function notificationAbsentInPeriod(s,d,id,period){const {publication,row}=notificationAttendanceSource(s,d,id);return notificationAttendance(s,publication||{date:d,periods:[{period}]},row).absentPeriods.includes(period);}
 function presentNoticeDiffers(current,previous,presentPeriods,previousAbsentPeriods=[]){
  if(!previous)return false;let before,after;try{before=JSON.parse(previous);after=JSON.parse(current);}catch(_){return false;}if(!Array.isArray(before?.[0])||!Array.isArray(before?.[2]))return false;
  const excluded=new Set(previousAbsentPeriods),periods=presentPeriods.filter(p=>!excluded.has(p)&&!absentTimetableCell(before[0][p])),included=new Set(periods),project=parts=>[periods.map(p=>[p,parts[0][p]||['','','','']]),(parts[1]||[]).filter(p=>included.has(p[0])),parts[2].filter(row=>included.has(row[0]))];return JSON.stringify(project(before))!==JSON.stringify(project(after));
 }
 // A previously absent period has no delivered lesson to compare. Compare its
 // newly present work with baseline, so absence-only returns do not resend and new duties do.
 function presentExposureDiffers(current,previous,presentPeriods,baseline,previousAbsentPeriods=[]){
  let before;try{before=JSON.parse(previous);}catch(_){return true;}if(!Array.isArray(before?.[0])||!Array.isArray(before?.[2]))return true;
  const absent=new Set([...previousAbsentPeriods,...presentPeriods.filter(p=>absentTimetableCell(before[0][p]))]);for(const p of presentPeriods)if(absent.has(p))before[0][p]=baseline[p]||['','','',''];before[2]=before[2].filter(duty=>!absent.has(duty[0]));return presentNoticeDiffers(current,JSON.stringify(before),presentPeriods);
 }
 function dailyNoticeState(s,d,id){
  const publication=s.dailyPublicationStates?.[d],row=publication?.teachers.find(t=>t.staffId===id);
  if(!row)return {eligible:false,reason:'No published timetable changes for this teacher.',changed:false,correctionRequired:false,delivery:{state:'not-requested'},canNotify:false};
  const fingerprint=publishedContentFingerprint(s,publication,row),parts=JSON.parse(fingerprint),attendance=notificationAttendance(s,publication,row),present=new Set(attendance.presentPeriods),baseline=canonicalTimetableCells(row.baseline),changed=!attendance.fullyAbsent&&(attendance.presentPeriods.some(p=>JSON.stringify(parts[0][p])!==JSON.stringify(baseline[p]))||parts[2].some(duty=>present.has(duty[0])));
  const jobs=s.outbox.filter(j=>j.kind==='stapler_timetable'&&j.data?.dailyPublication&&j.date===d&&j.recipientId===id),acceptedStates=['sent','delivered','read'];
  const eventOrder=(a,b)=>a.at-b.at||a.revision-b.revision||a.order-b.order,jobEvent=j=>({at:Date.parse(j.completedAt||j.createdAt)||0,revision:j.data.publicationRevision||0,order:jobs.indexOf(j),fingerprint:dailyJobFingerprint(s,publication,row,j),job:j}),acceptedEvents=jobs.filter(j=>acceptedStates.includes(dailyDeliveryState(j))).map(jobEvent).sort(eventOrder);
  const acknowledgedEvents=s.acknowledgements.filter(a=>a.staffId===id&&a.date===d&&a.timetableNoticeId&&a.publicationFingerprint).map((a,i)=>({at:Date.parse(a.at)||0,revision:a.publicationRevision||0,order:jobs.length+i,absentPeriods:a.attendanceAbsentPeriods||[],fingerprint:dailyJobFingerprint(s,publication,row,{date:d,recipientId:id,createdAt:a.at,data:{fingerprint:a.publicationFingerprint}})})),exposures=[...acceptedEvents,...acknowledgedEvents].sort(eventOrder),lastExposure=exposures.at(-1),lastDifferent=exposures.filter(e=>e.fingerprint&&e.fingerprint!==fingerprint).at(-1),lastAccepted=acceptedEvents.at(-1);
  const accepted=lastAccepted?.fingerprint&&lastExposure?.fingerprint&&!presentExposureDiffers(fingerprint,lastAccepted.fingerprint,attendance.presentPeriods,baseline,lastAccepted.job.data.attendanceAbsentPeriods||[])&&!presentExposureDiffers(fingerprint,lastExposure.fingerprint,attendance.presentPeriods,baseline,lastExposure.absentPeriods||lastExposure.job?.data?.attendanceAbsentPeriods||[])&&(!row.targetedCorrectionPeriods||lastAccepted.job.data.timetableNoticeId===timetableNoticeId(publication,row))?lastAccepted.job:null,matching=jobs.filter(j=>!acceptedStates.includes(dailyDeliveryState(j))&&dailyJobFingerprint(s,publication,row,j)===fingerprint&&(j.data.timetableNoticeId===timetableNoticeId(publication,row)||!lastDifferent||eventOrder(jobEvent(j),lastDifferent)>0)),unresolved=jobs.find(j=>['sending','uncertain'].includes(dailyDeliveryState(j))),priorAcknowledged=acknowledgedEvents.some(e=>presentNoticeDiffers(fingerprint,e.fingerprint,attendance.presentPeriods,e.absentPeriods));
  const correctionAcknowledged=!changed&&!!lastExposure?.fingerprint&&!lastExposure.job&&!presentExposureDiffers(fingerprint,lastExposure.fingerprint,attendance.presentPeriods,baseline,lastExposure.absentPeriods||[])&&!unresolved;
  const correctionRequired=!attendance.fullyAbsent&&!changed&&((row.targetedCorrectionPeriods||[]).some(p=>present.has(p))||priorAcknowledged||jobs.some(j=>{if(!['sent','delivered','read','sending','uncertain'].includes(dailyDeliveryState(j)))return false;return presentNoticeDiffers(fingerprint,dailyJobFingerprint(s,publication,row,j),attendance.presentPeriods,j.data.attendanceAbsentPeriods||[]);}));
  const job=unresolved||accepted||matching.at(-1),state=dailyDeliveryState(job),eligible=changed||correctionRequired,reason=eligible?'':attendance.fullyAbsent?'This teacher is absent for the full school day.':attendance.absentPeriods.length?'No published timetable change or correction applies during periods this teacher is present.':'This published timetable matches the baseline and no previously sent change needs correction.';
  const delivery={state,...(job?{jobId:job.id,attempts:job.attempts||0,error:job.error||'',createdAt:job.createdAt,sentAt:job.completedAt||null,deliveryAt:job.deliveryAt||null,...(job.holdReason?{holdReason:job.holdReason}:{}),...(job.nextEligibleAt?{nextEligibleAt:job.nextEligibleAt}:{})}:{})},notifyBlockedReason=!eligible?reason:correctionAcknowledged?'This corrected timetable has already been acknowledged.':['sending','uncertain'].includes(state)?'A notification is in progress or its delivery outcome is unconfirmed. Check delivery before sending again.':['sent','delivered','read'].includes(state)?'This published timetable has already been sent.':'';
  return {eligible,reason,...attendance,noticeId:timetableNoticeId(publication,row),fingerprint,changed,correctionRequired,correctionAcknowledged,delivery,canNotify:eligible&&!notifyBlockedReason,notifyBlockedReason};
 }
 function timetableNoticeSource(s,d,id){
  const publication=s.dailyPublicationStates?.[d];if(publication)return {publication,row:publication.teachers.find(t=>t.staffId===id)};
  const record=s.staplerPlans.find(r=>r.date===d);if(!record?.published)return {};
  const legacy={date:d,revision:record.publishedRevision,publishedAt:record.publishedAt,periods:record.published.periods};
  if(record.timetableNotices?.[id])return {publication:legacy,row:record.timetableNotices[id]};
  // Existing queued legacy notices acquire a stable pending ID without rewriting history.
  const job=s.outbox.filter(j=>j.kind==='stapler_timetable'&&!j.data?.dailyPublication&&j.date===d&&j.recipientId===id&&j.data?.fingerprint===(record.notifiedFingerprints?.[id]||'baseline')).at(-1);
  return job?{publication:legacy,row:{staffId:id,noticeId:'legacy:'+job.id,noticePublishedAt:job.createdAt,fingerprint:job.data.fingerprint,snapshotIds:timetableSnapshotIds(s,d,id,job.createdAt)}}:{};
 }
 function timetableNotice(s,ctx,p){
  const d=date(p.date||ctx.today),id=ctx.user.staffId;if(!id)fail(403,'A staff identity is required.');const {publication,row}=timetableNoticeSource(s,d,id);
  if(!row||s.dailyPublicationStates?.[d]&&!dailyNoticeState(s,d,id).eligible)return null;const snapshotIds=row.snapshotIds||timetableSnapshotIds(s,d,id,publication.publishedAt);
  return {...timetableAcknowledgement(s,publication,row),date:d,publishedAt:row.noticePublishedAt||publication.publishedAt,snapshotIds:copy(snapshotIds),publishedInstructions:copy(row.publishedInstructions||timetableInstructionRows(s,snapshotIds))};
 }
 function ownTimetableNotices(s,ctx){
  const dates=new Set([...Object.keys(s.dailyPublicationStates||{}),...s.staplerPlans.filter(r=>r.published).map(r=>r.date)]),from=allocation().addDays(ctx.today,-1),notices=[];
  for(const d of [...dates].filter(d=>d>=from).sort()){const notice=timetableNotice(s,ctx,{date:d});if(!notice)continue;const {publication,row}=timetableNoticeSource(s,d,ctx.user.staffId);if(!row.cells)continue;notices.push({...notice,timetable:{date:d,name:row.name||'',periods:copy(publication.periods),baseline:{cells:copy(row.baseline)},modified:{cells:copy(row.cells)}}});}return notices;
 }
 // Capture the saved effective timetable; publication and recipient communication store separate snapshots.
 function dailyPublication(s,ctx,d,previous,preview=false){
  const dd=ctx.days[d]||day(ctx,d),reference=ctx.baselineDays?.[d]||dd,base={...dd,teachers:JSON.stringify(reference.periods)===JSON.stringify(dd.periods)?reference.teachers:[]},blank=()=>base.periods.map(()=>['','','','']),cells=new Map(dd.teachers.map(t=>[t.staffId,copy(t.cells)])),baseline=new Map(base.teachers.map(t=>[t.staffId,copy(t.cells)])),assignments=s.assignments.filter(a=>a.date===d&&['published','completed'].includes(a.status)&&!a.publicationWithheldAt&&!a.noRelief&&!a.remove);
  for(const a of s.absences.filter(a=>a.date===d&&!a.deletedAt)){if(!cells.has(a.staffId))cells.set(a.staffId,blank());for(const n of absencePeriods(ctx,a))cells.get(a.staffId)[n]=['Absent','','',''];}
  for(const a of assignments){if(!cells.has(a.staffId))cells.set(a.staffId,blank());const row=cells.get(a.staffId),next=[a.subject||'',a.className||'',a.venue||'',a.groupName||''];row[a.period]=a.combination?row[a.period].map((v,i)=>[v,next[i]].filter(Boolean).join(' + ')):next;}
  const before=new Map((previous?.teachers||[]).map(t=>[t.staffId,t])),teachers=[];
  for(const id of new Set([...cells.keys(),...before.keys()])){
   const current=cells.get(id)||blank(),original=baseline.get(id)||blank(),prior=before.get(id),withdrawn=s.assignments.filter(a=>a.date===d&&a.staffId===id&&a.publicationWithheldAt),own=assignments.filter(a=>a.staffId===id),changed=JSON.stringify(canonicalTimetableCells(current))!==JSON.stringify(canonicalTimetableCells(original))||own.length>0;
   let fingerprint=JSON.stringify([current,base.periods.map(p=>[p.period,p.start,p.end]),own.map(a=>[a.id,a.period,a.absentId,a.timeStart,a.timeEnd,a.subject,a.className,a.venue,a.groupName,a.instructions||'',a.customInstructions||'',matchingCustom(s,a).map(r=>r.text)]).sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0]))]);const updated=!prior?changed:publishedContentFingerprint(s,previous,prior)!==publishedContentFingerprint(s,{date:d,periods:base.periods,publishedAt:ctx.iso},{staffId:id,cells:current,fingerprint});if(!updated&&prior)fingerprint=prior.fingerprint;
   if(!changed&&!prior&&!withdrawn.length)continue;let rows=[];
   if(!preview)for(const time of base.periods){const period=time.period,cell=current[period]||['','','',''],old=original[period]||['','','',''],was=prior?.cells?.[period],a=own.find(a=>a.period===period);if(!a&&stapler().sameCell(cell,old)&&(!was||stapler().sameCell(cell,was))&&!withdrawn.some(a=>a.period===period))continue;rows.push({period,timeStart:time.start,timeEnd:time.end,subject:cell[0],className:cell[1],venue:cell[2],groupName:cell[3],absentId:a?.absentId||null,absentName:a?.absentName||'',...(a?.members?{members:copy(a.members),absentIds:copy(a.absentIds),absenceIds:copy(a.absenceIds)}:{}),instructions:a?.instructions||'',customInstructions:a?.customInstructions||'',assignedBy:a?assignmentBy(a,s,ctx):s.staplerPlans.find(r=>r.date===d)?.confirmedBy||ctx.user.email,kind:a?'relief':stapler().sameCell(cell,old)?'restored':cell[0]==='Absent'?'absence':'stapler'});}
   if(!preview&&!updated&&prior)rows=copy(prior.rows);
   if(!preview)for(const row of rows){const a=own.find(a=>a.period===row.period);if(a&&row.kind==='relief')row.assignedBy=assignmentBy(a,s,ctx);}
   const snapshotIds=preview?[]:timetableSnapshotIds(s,d,id).filter(snapshotId=>{const snapshot=s.publicationSnapshots.find(row=>row.id===snapshotId);return snapshot?.kind==='cancelled'||own.some(a=>a.id===snapshot?.assignmentId);}),noticeId=preview?null:!updated&&prior?timetableNoticeId(previous,prior):ctx.uuid(),noticePublishedAt=!updated&&prior?(prior.noticePublishedAt||previous.publishedAt):ctx.iso;
   teachers.push({staffId:id,absentPeriods:notificationAttendance(s,{date:d,periods:base.periods},{staffId:id,cells:current}).absentPeriods,name:ctx.people.find(t=>t.id===id)?.name||prior?.name||id,cells:current,baseline:original,rows,changed,updated,fingerprint,noticeId,noticePublishedAt,snapshotIds,...(!prior&&withdrawn.length?{targetedCorrectionPeriods:[...new Set(withdrawn.map(a=>a.period))]}:{}),publishedInstructions:preview?[]:timetableInstructionRows(s,snapshotIds)});
  }
  const snapshot={date:d,baselineId:base.id,revision:(previous?.revision||0)+1,publishedAt:ctx.iso,publishedBy:ctx.user.email,sourceRevision:s.revision+1,allocationRevision:s.dayRevisions[d]||0,staplerRevision:s.staplerPlans.find(r=>r.date===d)?.revision||0,periods:copy(base.periods),publicReliefRows:preview?[]:publishedReliefRows(s,ctx,d),teachers:teachers.sort((a,b)=>a.name.localeCompare(b.name))},changes=publicationChangedPeriods(s,snapshot,previous);
  for(const row of snapshot.teachers){
   const prior=before.get(row.staffId);if(!prior?.targetedCorrectionPeriods?.length)continue;
   const priorId=timetableNoticeId(previous,prior),settled=s.acknowledgements.some(a=>a.staffId===row.staffId&&a.timetableNoticeId===priorId)||s.outbox.some(j=>j.recipientId===row.staffId&&j.data?.timetableNoticeId===priorId&&['sent','delivered','read'].includes(dailyDeliveryState(j)));
   if(settled)continue;const present=new Set(notificationAttendance(s,snapshot,row).presentPeriods),changed=new Set(changes.get(row.staffId)||[]),carried=prior.targetedCorrectionPeriods.filter(p=>present.has(p)&&!changed.has(p));if(!carried.length)continue;
   row.targetedCorrectionPeriods=carried;
   if(!changed.size){row.noticeId=priorId;row.noticePublishedAt=prior.noticePublishedAt||previous.publishedAt;}
   if(!preview)for(const detail of prior.rows||[])if(carried.includes(detail.period)&&!row.rows.some(r=>r.period===detail.period))row.rows.push(copy(detail));
  }
  return snapshot;
 }
 // The update action compares two publications, independently of whether the
 // earlier notice was sent. Attendance still excludes changes while absent.
 function publicationChangedPeriods(s,snapshot,previous){
  const prior=new Map((previous?.teachers||[]).map(row=>[row.staffId,row])),changes=new Map();
  for(const row of snapshot.teachers){
   const old=prior.get(row.staffId),attendance=notificationAttendance(s,snapshot,row);if(attendance.fullyAbsent)continue;
   const current=JSON.parse(publishedContentFingerprint(s,snapshot,row)),before=old?JSON.parse(publishedContentFingerprint(s,previous,old)):[canonicalTimetableCells(row.baseline),current[1],[]],oldAbsent=new Set(old?.absentPeriods||[]);
   const baseline=[canonicalTimetableCells(row.baseline),current[1],[]],project=(parts,p)=>[parts[0][p]||['','','',''],parts[1].find(time=>time[0]===p)||null,parts[2].filter(duty=>duty[0]===p)];
   // Returning from absence alone is not a relief update; newly assigned duties
   // in that now-present period must still be compared with its baseline.
   const changed=attendance.presentPeriods.filter(p=>JSON.stringify(project(current,p))!==JSON.stringify(project(oldAbsent.has(p)||absentTimetableCell(before[0][p])?baseline:before,p)));if(!old)for(const p of row.targetedCorrectionPeriods||[])if(attendance.presentPeriods.includes(p)&&!changed.includes(p))changed.push(p);if(changed.length)changes.set(row.staffId,changed);
  }
  return changes;
 }
 function publicationPreview(s,ctx,d){
  const previous=s.dailyPublicationStates?.[d],assignments=allocation().effectiveAssignments(s,true).map(a=>a.date===d&&a.status==='draft'?{...a,status:'published',instructions:assignmentInstructions(s,a),customInstructions:customText(s,a)}:a),projected={...s,assignments};
  const snapshot=dailyPublication(projected,ctx,d,previous,true),changes=publicationChangedPeriods(projected,snapshot,previous),changedTeachers=snapshot.teachers.filter(row=>changes.has(row.staffId)&&ctx.people.some(person=>person.id===row.staffId)).map(({staffId,name})=>({staffId,name}));
  return {previousRevision:previous?.revision||0,count:changedTeachers.length,changedTeachers};
 }
 // Capture these public schedule facts only when SMC publishes. Reads must never
 // reconstruct a teacher report from today's changing absences or working choices.
 function publishedReliefRows(s,ctx,d){
  const assignments=new Map(s.assignments.filter(a=>a.date===d&&['published','completed'].includes(a.status)&&!a.publicationWithheldAt&&!a.remove).map(a=>[a.demandId,a]));
  return demand(ctx,s,d).map(lesson=>{const assignment=assignments.get(lesson.id),absentIds=lesson.absentIds?.length?lesson.absentIds:[lesson.staffId||lesson.virtualTeacherId].filter(Boolean),absentTeachers=absentIds.map(staffId=>({staffId,name:ctx.people.find(t=>t.id===staffId)?.name||([lesson.staffId,lesson.virtualTeacherId].includes(staffId)?lesson.name:staffId)||staffId})),noRelief=assignment?.noRelief||lesson.noReliefRequired;
   return {period:lesson.period,timeStart:lesson.timeStart||'',timeEnd:lesson.timeEnd||'',subject:lesson.subject||'',className:lesson.className||'',venue:lesson.venue||'',absentTeachers,reliefStaffId:!noRelief&&assignment?assignment.staffId:null,reliefTeacher:!noRelief&&assignment?(ctx.people.find(t=>t.id===assignment.staffId)?.name||assignment.relieverName||assignment.staffId):'',status:noRelief?'no-relief':assignment?'assigned':'unassigned'};
  });
 }
 function teacherDailyUpdate(s,ctx,p){
  const person=ctx.people.find(t=>t.id===ctx.user.staffId);if(!(ctx.user.smc||ctx.user.admin)&&!(person?.active===true&&absenceEligible(person)))fail(403,'An active school teacher identity is required.');
  const d=date(p.date||ctx.today),publication=s.dailyPublicationStates?.[d],byAbsent=new Map(),byRelief=new Map();let rows=publication?.publicReliefRows||[];
  // Older snapshots can prove assigned lessons only. Do not invent historical
  // unassigned lessons or read current unpublished absence records to fill them.
  const limitedHistoricalData=!!publication&&!Array.isArray(publication.publicReliefRows);
  if(limitedHistoricalData)rows=publication.teachers.flatMap(teacher=>(teacher.rows||[]).filter(row=>row.kind==='relief').map(row=>({...row,absentTeachers:(row.absentIds?.length?row.absentIds:[row.absentId]).filter(Boolean).map(staffId=>({staffId,name:row.members?.find(m=>m.staffId===staffId)?.name||(staffId===row.absentId?row.absentName:staffId)||staffId})),reliefStaffId:teacher.staffId,reliefTeacher:teacher.name,status:'assigned'})));
  for(const row of rows){const lesson={period:row.period,timeStart:row.timeStart||'',timeEnd:row.timeEnd||'',subject:row.subject||'',className:row.className||'',venue:row.venue||'',status:row.status},absentTeachers=row.absentTeachers||[];
   for(const absent of absentTeachers){if(!byAbsent.has(absent.staffId))byAbsent.set(absent.staffId,{staffId:absent.staffId,name:absent.name,lessons:[]});byAbsent.get(absent.staffId).lessons.push({...lesson,reliefTeacher:row.reliefTeacher||''});}
   if(row.status==='assigned'&&row.reliefStaffId){if(!byRelief.has(row.reliefStaffId))byRelief.set(row.reliefStaffId,{staffId:row.reliefStaffId,name:row.reliefTeacher,lessons:[]});byRelief.get(row.reliefStaffId).lessons.push({...lesson,absentTeacher:absentTeachers.map(t=>t.name).join(', ')});}
  }
  const groups=map=>[...map.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(group=>({...group,lessons:group.lessons.sort((a,b)=>a.period-b.period||a.className.localeCompare(b.className))}));
  return {date:d,publishedAt:publication?.publishedAt||null,publicationRevision:publication?.revision||0,limitedHistoricalData,byAbsent:groups(byAbsent),byRelief:groups(byRelief)};
 }
 function notifyDateIssue(s,ctx,d,snapshot){return d<ctx.today?'Send notifications only for the current or a future day.':!snapshot?'A saved timetable is required before sending notifications.':'';}
 function dailyRecipientRows(row,state){const absent=new Set(state.absentPeriods||[]);return (row.rows||[]).filter(r=>!absent.has(r.period)&&(r.kind==='relief'||!stapler().sameCell(row.cells?.[r.period],row.baseline?.[r.period])||state.correctionRequired&&r.kind==='restored'));}
 function dailyNoticeMessage(){return 'Your timetable arrangements have been updated. Please check View Detail for your latest lessons and duties.';}
 function legacyTimetableAttendance(s,j,record){
  const source=notificationAttendanceSource(s,j.date,j.recipientId),publication={...source.publication,date:j.date,periods:record.published.periods},row=source.row,attendance=notificationAttendance(s,publication,row);
  if(!Array.isArray(row.cells)||!Array.isArray(row.baseline))return {issue:attendance.fullyAbsent?'This teacher is absent for the full school day.':attendance.absentPeriods.length?'Republish this timetable to verify changes during periods the teacher is present.':null};
  const periodRows=publication.periods.map(p=>[p.period,p.start,p.end]),normalise=job=>{if(job.kind!=='stapler_timetable'||job.date!==j.date||job.recipientId!==j.recipientId||job.data?.dailyPublication)return job;let cells;try{cells=job.data?.fingerprint==='baseline'?row.baseline:JSON.parse(job.data?.fingerprint);}catch(_){}const fingerprint=Array.isArray(cells)&&cells.every(cell=>Array.isArray(cell)&&cell.length===4)?JSON.stringify([canonicalTimetableCells(cells),periodRows,[]]):null;return {...job,data:{...job.data,dailyPublication:true,...(fingerprint?{contentFingerprint:fingerprint}:{})}};};
  const shadow={...s,dailyPublicationStates:{...s.dailyPublicationStates,[j.date]:{...publication,teachers:[row]}},outbox:s.outbox.map(normalise)},state=dailyNoticeState(shadow,j.date,j.recipientId);return {issue:state.eligible?null:state.reason,state,publication,row};
 }
 function dailyNotifyView(s,ctx,p){smc(ctx);const d=date(p.date||ctx.today),visiblePublication=s.dailyPublicationStates?.[d];s=communicationState(s,ctx,d);const snapshot=s.dailyPublicationStates?.[d],record=s.staplerPlans.find(r=>r.date===d),issue=publishDateIssue(ctx,d,s),notifyIssue=notifyDateIssue(s,ctx,d,snapshot),acknowledged=new Map(s.acknowledgements.filter(a=>a.timetableNoticeId).map(a=>[a.timetableNoticeId,a.at])),teachers=[];
  for(const row of snapshot?.teachers||[]){const state=dailyNoticeState(s,d,row.staffId);if(!state.eligible)continue;const {cells,fingerprint,noticeId,noticePublishedAt,snapshotIds,publishedInstructions,...teacher}=row;teachers.push({...teacher,changed:state.changed,correctionRequired:state.correctionRequired,rows:dailyRecipientRows(row,state),notification:state.delivery,canNotify:state.canNotify,notifyBlockedReason:state.notifyBlockedReason,acknowledgement:timetableAcknowledgement(s,snapshot,row,acknowledged)});}
  return {revision:s.revision,date:d,today:ctx.today,allocationRevision:s.dayRevisions[d]||0,allowAdvancePublishing:s.systemConfig.allowAdvancePublishing===true,canPublish:!issue,publishBlockedReason:issue,canNotify:!notifyIssue,notifyBlockedReason:notifyIssue,teachers:copy(teachers),publishedAt:visiblePublication?.publishedAt||null,publishedRevision:visiblePublication?.revision||0,sourceRevision:snapshot?.sourceRevision||null,pendingDraft:!!visiblePublication&&visiblePublication.allocationRevision!==(s.dayRevisions[d]||0)||s.assignments.some(a=>a.date===d&&a.status==='draft')||!!record&&(record.confirmed||record.published)&&record.revision!==(visiblePublication?.staplerRevision||0),publishAudit:publishAudit(s,ctx,d)};
 }
 function queueDailyNotices(s,ctx,snapshot,recipients){
  const outcome={queued:0,reused:0,skipped:0,blocked:0,retried:0};
  for(const row of snapshot.teachers.filter(t=>recipients.has(t.staffId))){const state=dailyNoticeState(s,snapshot.date,row.staffId);if(!state.eligible||!ctx.people.some(t=>t.id===row.staffId))continue;
   if(['sending','uncertain'].includes(state.delivery.state)){outcome.blocked++;continue;}
   if(state.correctionAcknowledged||['sent','delivered','read'].includes(state.delivery.state)){outcome.skipped++;continue;}
   const existing=s.outbox.find(j=>j.id===state.delivery.jobId),data={communicationSnapshot:existing?.data?.communicationSnapshot||{date:snapshot.date,baselineId:snapshot.baselineId,revision:snapshot.revision,sourceRevision:snapshot.sourceRevision,periods:copy(snapshot.periods),teachers:[copy({...row,noticeId:state.noticeId,snapshotIds:[]})]},templateKey:'stapler_timetable',dailyPublication:true,manualSend:true,publicationRevision:snapshot.revision,fingerprint:row.fingerprint,contentFingerprint:state.fingerprint,timetableNoticeId:state.noticeId,acknowledge:true,attendanceAbsentPeriods:state.absentPeriods,summary:dailyNoticeMessage()};
   if(existing?.data?.communicationSnapshot){for(const key of ['fingerprint','contentFingerprint','timetableNoticeId','attendanceAbsentPeriods','publicationRevision'])data[key]=existing.data[key];}
   if(existing){existing.notificationIntentRevision=(existing.notificationIntentRevision||0)+1;existing.notificationIntentAction=['failed','cancelled'].includes(state.delivery.state)?'retry':'manual-send';existing.notificationIntentAt=ctx.iso;Object.assign(existing.data,data);if(['queued','blocked'].includes(state.delivery.state)){existing.expiresAt=expiry(ctx,snapshot.date);delete existing.holdReason;delete existing.nextEligibleAt;outcome.reused++;continue;}
    if(['failed','cancelled'].includes(state.delivery.state)){allocation().addAudit(s,ctx,'retryDailyNotification',{date:snapshot.date,notificationId:existing.id,previousStatus:existing.status,previousError:existing.error||'',previousProviderError:copy(existing.providerError||null)});existing.status='queued';existing.error='';existing.retryable=true;existing.expiresAt=expiry(ctx,snapshot.date);for(const key of ['providerError','deliveryStatus','nextAttemptAt','claimId','claimExpiresAt','preparedAt','holdReason','nextEligibleAt'])delete existing[key];outcome.retried++;continue;}
   }
   queue(s,ctx,'stapler_timetable',row.staffId,snapshot.date,data,null,'daily:'+snapshot.date+':'+state.noticeId+':'+row.staffId);outcome.queued++;
  }
  return {notificationOutcome:outcome,notificationsQueued:outcome.queued+outcome.reused+outcome.retried};
 }
 // Recipient snapshots live in the durable notification intent; publication stays independent.
 function communicationState(s,ctx,d){
  const assignments=allocation().effectiveAssignments(s,true).map(a=>a.date===d&&a.status==='draft'?{...a,status:'published',instructions:assignmentInstructions(s,a),customInstructions:customText(s,a)}:a),projected={...s,assignments},published=s.dailyPublicationStates?.[d],previousRows=new Map((published?.teachers||[]).map(row=>[row.staffId,row]));
  for(const job of s.outbox)if(job.date===d&&job.data?.communicationSnapshot&&(!published||job.data.publicationRevision>published.revision))for(const row of job.data.communicationSnapshot.teachers)if(row.staffId===job.recipientId)previousRows.set(row.staffId,row);
  const previous={...published,date:d,revision:published?.revision||0,publishedAt:published?.publishedAt||ctx.iso,periods:ctx.days[d]?.periods||[],teachers:[...previousRows.values()]},snapshot=dailyPublication(projected,ctx,d,previous);
  for(const row of snapshot.teachers){
   const job=s.outbox.filter(j=>j.date===d&&j.recipientId===row.staffId&&j.data?.communicationSnapshot).at(-1);if(!job||!job.data.contentFingerprint||!['queued','blocked','failed'].includes(dailyDeliveryState(job))||s.acknowledgements.some(a=>a.staffId===row.staffId&&a.timetableNoticeId===job.data.timetableNoticeId))continue;
   const captured=job.data.communicationSnapshot.teachers[0],attendance=notificationAttendance(projected,snapshot,row),restored=(captured.rows||[]).filter(r=>r.kind==='restored'&&attendance.presentPeriods.includes(r.period));if(!restored.length||presentExposureDiffers(publishedContentFingerprint(projected,snapshot,row),job.data.contentFingerprint,attendance.presentPeriods,canonicalTimetableCells(row.baseline),job.data.attendanceAbsentPeriods||[]))continue;
   row.targetedCorrectionPeriods=restored.map(r=>r.period);row.noticeId=job.data.timetableNoticeId;row.noticePublishedAt=job.createdAt;for(const detail of restored)if(!row.rows.some(r=>r.period===detail.period))row.rows.push(copy(detail));
  }
  return {...projected,outbox:s.outbox,audit:s.audit,dailyPublicationStates:{...s.dailyPublicationStates,[d]:snapshot}};
 }
 function communicationProjection(s,cap){
  const job=s.outbox.find(j=>j.id===cap.communicationId&&j.recipientId===cap.staffId&&j.date===cap.date&&j.kind==='stapler_timetable'),publication=job?.data?.communicationSnapshot,row=publication?.teachers?.find(t=>t.staffId===cap.staffId);
  if(cap.purpose!=='duties'||!row||publication.teachers.length!==1)fail(403,'This recipient communication is unavailable.');
  const acknowledged=s.acknowledgements.find(a=>a.staffId===cap.staffId&&a.communicationId===job.id),duties=(row.rows||[]).filter(r=>r.kind==='relief').map(r=>({...copy(r),staffId:cap.staffId,date:cap.date})),daily={date:cap.date,viewMode:'communication',communicatedAt:job.createdAt,name:row.name,revision:publication.sourceRevision,periods:copy(publication.periods),baseline:{cells:copy(row.baseline)},modified:{cells:copy(row.cells)},mats:[]},notice={id:row.noticeId,date:cap.date,name:row.name,rows:copy(row.rows),publishedInstructions:(row.rows||[]).filter(r=>r.kind==='relief').map(r=>({period:r.period,instructions:r.instructions||'',customInstructions:r.customInstructions||'',conditionalInstructions:[]})),periods:copy(publication.periods),snapshotIds:[],publishedAt:null,communicatedAt:job.createdAt,status:acknowledged?'acknowledged':'pending',acknowledgedAt:acknowledged?.at||null};
  return {date:cap.date,viewMode:'communication',communicatedAt:job.createdAt,linkExpiresAt:cap.expiresAt,timetableNotice:notice,pendingNotices:[],history:[],overlay:daily,timetable:{monday:allocation().monday(cap.date),name:row.name,periods:copy(publication.periods),perDay:publication.periods.length,baseline:[],duties,daily},duties,changes:[],arrangements:[],request:null};
 }
 function acknowledgeCommunication(s,ctx,cap,p){
  const projection=communicationProjection(s,cap);if((p.snapshotIds||[]).length||p.timetableNoticeId!==projection.timetableNotice.id)fail(403,'Acknowledge only this recipient communication.');
  const old=s.acknowledgements.find(a=>a.staffId===cap.staffId&&a.communicationId===cap.communicationId);if(old)return {savedIds:[]};
  const job=s.outbox.find(j=>j.id===cap.communicationId),row=job.data.communicationSnapshot.teachers[0];s.acknowledgements.push({id:ctx.uuid(),communicationId:cap.communicationId,staffId:cap.staffId,date:cap.date,timetableNoticeId:p.timetableNoticeId,publicationFingerprint:row.fingerprint,publicationRevision:job.data.publicationRevision,attendanceAbsentPeriods:row.absentPeriods||[],at:ctx.iso,by:ctx.user.email});return {savedIds:[p.timetableNoticeId]};
 }
 function releasedPeerLessons(s,request){
  if(!request||request.retiredAt)return [];
  const effective=allocation().effectiveAssignments(s,true),rows=[];
  for(const lesson of request.lessons||[]){
   if(effective.some(a=>a.requestId===request.id&&a.demandId===lesson.id&&!a.remove&&!a.noRelief))continue;
   const original=s.assignments.filter(a=>a.requestId===request.id&&a.demandId===lesson.id&&!a.remove&&!a.noRelief).at(-1);
   if(!original)continue;
   const removal=s.assignments.find(a=>a.remove&&a.replaces===original.id&&['draft','published','completed'].includes(a.status));
   if(!removal&&original.status!=='cancelled')continue;
   rows.push({...lesson,releaseToken:JSON.stringify([lesson.id,original.id,removal?.id||original.cancelledAt||original.version||original.status])});
  }
  return rows;
 }
 function queuePeerReleaseNotices(s,ctx,d,selectedId){
  const outcome={queued:0,reused:0,skipped:0,blocked:0,retried:0};
  for(const request of s.requests.filter(r=>r.date===d&&(!selectedId||[r.staffId,r.recipientId].includes(selectedId)))){
   const released=releasedPeerLessons(s,request);if(!released.length)continue;
   const currentTokens=new Set(released.map(row=>row.releaseToken));
   for(const recipientId of new Set([request.staffId,request.recipientId])){
    if(!ctx.people.some(person=>person.id===recipientId))continue;
    const jobs=s.outbox.filter(j=>j.kind==='mutual_override'&&j.recipientId===recipientId&&j.data?.peerRelease===true&&j.data?.peerRequestIds?.includes(request.id));
    for(const job of jobs){
     const status=dailyDeliveryState(job);if(!job.data.peerReleaseTokens?.length||!job.data.peerReleaseTokens.every(token=>currentTokens.has(token)))continue;
     if(['sending','uncertain'].includes(status)){outcome.blocked++;continue;}if(['sent','delivered','read'].includes(status)){outcome.skipped++;continue;}if(status==='queued'){outcome.reused++;continue;}if(!['failed','cancelled','blocked'].includes(status))continue;
     allocation().addAudit(s,ctx,'retryPeerReleaseNotification',{date:d,notificationId:job.id,previousStatus:status,previousError:job.error||'',previousProviderError:copy(job.providerError||null)});
     job.status='queued';job.error='';job.retryable=true;job.expiresAt=expiry(ctx,d);job.notificationIntentRevision=(job.notificationIntentRevision||0)+1;job.notificationIntentAt=ctx.iso;
     for(const key of ['providerError','deliveryStatus','nextAttemptAt','claimId','claimExpiresAt','preparedAt','holdReason','nextEligibleAt'])delete job[key];outcome.retried++;
    }
    const previous=new Set(jobs.filter(j=>!['failed','cancelled','blocked'].includes(dailyDeliveryState(j))).flatMap(j=>j.data.peerReleaseTokens||[]));
    const lessons=released.filter(row=>!previous.has(row.releaseToken));if(!lessons.length)continue;
    const tokens=lessons.map(row=>row.releaseToken),before=s.outbox.length;
    queue(s,ctx,'mutual_override',recipientId,d,{templateKey:'mutual_override',peerRelease:true,peerRequestIds:[request.id],peerReleasedDemandIds:lessons.map(row=>row.id),peerReleaseTokens:tokens,summary:'Your peer relief arrangement has been released. Review the updated timetable in Roster.'},null,'peer-release:'+request.id+':'+recipientId+':'+JSON.stringify(tokens));
    outcome.queued+=s.outbox.length-before;
   }
  }
  return outcome;
 }
 function notifyDaily(s,ctx,p){smc(ctx);const d=date(p.date||ctx.today),shadow=communicationState(s,ctx,d),snapshot=shadow.dailyPublicationStates[d],issue=notifyDateIssue(s,ctx,d,snapshot);if(issue)fail(403,issue);if(p.expectedPublicationRevision!==undefined&&p.expectedPublicationRevision!==(s.dailyPublicationStates?.[d]?.revision||0))fail(409,'The published timetable changed. Refresh before notifying.','PUBLICATION_CONFLICT');if(p.staffId&&!snapshot.teachers.some(t=>t.staffId===p.staffId))fail(400,'Choose a teacher with saved timetable changes.');const recipients=new Set(snapshot.teachers.filter(t=>(!p.staffId||t.staffId===p.staffId)&&dailyNoticeState(shadow,d,t.staffId).eligible).map(t=>t.staffId)),result=queueDailyNotices(shadow,ctx,snapshot,recipients);
  for(const id of snapshot.teachers.filter(t=>!p.staffId||t.staffId===p.staffId).map(t=>t.staffId)){const state=dailyNoticeState(shadow,d,id);for(const job of s.outbox)if(job.date===d&&job.recipientId===id&&job.data?.communicationSnapshot&&['queued','blocked','failed'].includes(dailyDeliveryState(job))&&job.data.contentFingerprint!==state.fingerprint){job.status='cancelled';job.error='Superseded by a newer explicit communication.';}}

  const peerOutcome=queuePeerReleaseNotices(s,ctx,d,p.staffId),peerReleaseNoticesQueued=peerOutcome.queued+peerOutcome.reused+peerOutcome.retried;for(const key of ['queued','reused','skipped','blocked','retried'])result.notificationOutcome[key]+=peerOutcome[key];allocation().addAudit(s,ctx,'notifyDaily',{date:d,staffIds:[...recipients],peerReleaseNoticesQueued,publicationRevision:s.dailyPublicationStates?.[d]?.revision||0});return {savedIds:[...recipients],...result,peerReleaseNoticesQueued,notificationsQueued:(result.notificationsQueued||0)+peerReleaseNoticesQueued};}

 function publishDay(s,ctx,p){
  smc(ctx);const dateIssue=publishDateIssue(ctx,date(p.date||ctx.today),s);if(dateIssue)fail(403,dateIssue);
  if(p.expectedPublicationRevision!==undefined&&(!Number.isSafeInteger(p.expectedPublicationRevision)||p.expectedPublicationRevision<0||p.expectedPublicationRevision!==(s.dailyPublicationStates?.[date(p.date||ctx.today)]?.revision||0)))fail(409,'The published timetable changed. Refresh and review the affected teachers before publishing.','PUBLICATION_CONFLICT');
  p={...p,notifyMode:'none'};if(!['all','affected','none'].includes(p.notifyMode))fail(400,'Choose a valid publication notification option.');const d=date(p.date||ctx.today),before=s.outbox.length,previous=s.dailyPublicationStates?.[d],result=publishAssignments(s,ctx,p),record=s.staplerPlans.find(r=>r.date===d),plan=readyStaplerPlan(record);if(plan){stapler().validate(plan);record.published=stapler().canonical(stapler().copyValidated(plan));record.publishedRevision=record.revision;record.publishedAt=ctx.iso;record.publishedBy=ctx.user.email;record.confirmedPlan=record.published;record.confirmedRevision=record.revision;record.confirmedAt=ctx.iso;record.confirmedBy=ctx.user.email;for(const row of s.importedRelief.filter(r=>r.origin==='stapler'&&r.date===d&&r.status==='draft'))row.status='published';}
  // Publication and notification are separate user actions; discard any reconciliation notices
  // created inside this transaction and replace them with the selected day-level recipient set.
  s.outbox.splice(before);const snapshot=dailyPublication(s,ctx,d,previous),changes=publicationChangedPeriods(s,snapshot,previous);if(p.notifyMode==='affected')for(const row of snapshot.teachers)if(changes.has(row.staffId))row.targetedCorrectionPeriods=changes.get(row.staffId);preserveEquivalentAcknowledgements(s,ctx,snapshot);s.dailyPublicationStates[d]=snapshot;const recipients=new Set(snapshot.teachers.filter(t=>dailyNoticeState(s,d,t.staffId).eligible&&(p.notifyMode==='all'||p.notifyMode==='affected'&&changes.has(t.staffId))).map(t=>t.staffId)),notifications=queueDailyNotices(s,ctx,snapshot,recipients);allocation().addAudit(s,ctx,'publishDaily',{date:d,publicationRevision:snapshot.revision,notifyMode:p.notifyMode,staffIds:[...recipients]});return {...result,...notifications,publishedRevision:snapshot.revision};
 }
 function acknowledgePublications(s,ctx,p){
  if(!ctx.user.staffId)fail(403,'A staff identity is required.');const supplied=p.snapshotIds||[],hasTimetable=p.timetableNoticeId!==undefined;
  if(!Array.isArray(supplied)||supplied.length>1000||new Set(supplied).size!==supplied.length||!supplied.length&&!hasTimetable)fail(400,'Select the publication versions you have reviewed.');
  let notice=null;if(hasTimetable){if(typeof p.timetableNoticeId!=='string'||!p.timetableNoticeId||p.timetableNoticeId.length>300)fail(400,'Select the timetable version you have reviewed.');notice=timetableNotice(s,ctx,p);if(!notice)fail(403,'You may acknowledge only your own published timetable.');if(notice.id!==p.timetableNoticeId)fail(409,'Your published timetable has changed. Refresh and review it before acknowledging.');}
  const ids=[...new Set([...supplied,...(notice?.snapshotIds||[])])],owned=s.publicationSnapshots.filter(v=>v.staffId===ctx.user.staffId),byId=new Map(owned.map(v=>[v.id,v])),latest=new Map(owned.map(v=>[v.assignmentId,v.id])),covered=new Set(notice?.snapshotIds||[]);
  for(const id of ids){const v=byId.get(id);if(!v)fail(403,'You may acknowledge only your own notices.');if(!covered.has(id)&&latest.get(v.assignmentId)!==id)fail(409,'One of these duties has changed. Review the latest timetable before acknowledging.');}
  const saved=[];
  if(notice&&!s.acknowledgements.some(a=>a.timetableNoticeId===notice.id&&a.staffId===ctx.user.staffId)){s.acknowledgements.push({id:ctx.uuid(),timetableNoticeId:notice.id,date:notice.date,staffId:ctx.user.staffId,publicationFingerprint:timetableNoticeSource(s,notice.date,ctx.user.staffId).row.fingerprint,publicationRevision:timetableNoticeSource(s,notice.date,ctx.user.staffId).publication.revision,attendanceAbsentPeriods:dailyNoticeState(s,notice.date,ctx.user.staffId).absentPeriods||[],snapshotIds:copy(notice.snapshotIds),at:ctx.iso,by:ctx.user.email});saved.push(notice.id);}
  for(const id of ids){const v=byId.get(id);if(!s.acknowledgements.some(a=>a.snapshotId===id&&a.staffId===ctx.user.staffId)){s.acknowledgements.push({id:ctx.uuid(),snapshotId:id,assignmentId:v.assignmentId,assignmentRevision:v.revision,date:v.date,staffId:ctx.user.staffId,at:ctx.iso,by:ctx.user.email});saved.push(id);}
   for(const j of s.outbox)if(j.kind==='relief_reminder'&&j.data?.snapshotIds?.includes(id)&&j.status==='queued'){j.status='cancelled';j.error='Acknowledged in Roster.';}
   for(const alert of s.smcAlerts)if(alert.key==='unacknowledged:'+id||alert.key.startsWith('urgent:')&&alert.key.split(':').includes(id)){alert.status='acknowledged';alert.acknowledgedAt=ctx.iso;}
  }
  if(saved.length)allocation().addAudit(s,ctx,'acknowledgeAll',{date:p.date||ctx.today,ids:saved});return {savedIds:saved};
 }
 function removeManualAssignment(s,ctx,p){smc(ctx);const ids=p.ids||[p.id],rows=allocation().effectiveAssignments(s,true).filter(a=>ids.includes(a.id));if(!rows.length||rows.length!==new Set(ids).size)fail(409,'Assignments changed. Review the current cell.');return unassign(s,ctx,{...p,demandIds:rows.map(a=>a.demandId)});}
 function dailyExport(s,ctx,p){
  smc(ctx);const d=date(p.date||ctx.today),dd=day(ctx,d,false);if(!dd)fail(503,'Load the selected date before exporting.');const assignments=new Map(allocation().effectiveAssignments(s).filter(a=>a.date===d).map(a=>[a.demandId,a])),rows=new Map();
  for(const a of s.absences.filter(a=>a.date===d&&!a.deletedAt))rows.set(a.staffId,{id:a.staffId,name:a.name,cells:dd.periods.map(()=>({text:'',status:'blank'}))});
  for(const group of demand(ctx,s,d))for(const dem of group.members||[group]){
   const key=dem.recessActivationId?'recess:'+dem.className:dem.staffId;if(!rows.has(key))rows.set(key,{id:key,name:dem.recessActivationId?'Recess · '+dem.className:dem.name,cells:dd.periods.map(()=>({text:'',status:'blank'}))});
   const a=assignments.get(group.id),status=!a?(dem.noReliefRequired?'no-relief':'unassigned'):a.noRelief?'no-relief':a.status==='draft'?'draft':'published';
   const label=!a?(dem.noReliefRequired?'No Relief Required':'UNASSIGNED'):a.noRelief?'No Relief Needed':[a.relieverName||ctx.people.find(p=>p.id===a.staffId)?.name||a.staffId,dem.className,dem.subject,dem.groupName,dem.venue,a.combination?'Combined':a.repurposedDuty?'Repurposed recess duty':a.mutual?'Mutual':''].filter(Boolean).join('\n');
   rows.get(key).cells[dem.period]={text:label,status};
  }
  const record=s.staplerPlans.find(r=>r.date===d),plan=readyStaplerPlan(record);if(plan)for(const change of stapler().changes(plan)){const key='stapler:'+change.staffId;if(!rows.has(key))rows.set(key,{id:key,name:(ctx.people.find(t=>t.id===change.staffId)?.name||change.staffId)+' · Stapler',cells:dd.periods.map(()=>({text:'',status:'blank'}))});rows.get(key).cells[change.period]={text:(change.after.some(Boolean)?change.after.filter(Boolean).join('\n'):'Suspended / available'),status:record.publishedRevision===record.revision?'published':'draft'};}
  let teacherSummary;
  if(p.fullTeachers===true){
   const base=ctx.baselineDays?.[d]||dd,fullPlan=copy(plan||stapler().create({...base,date:d,recesses:[]},{date:d,venues:ctx.venues?.[d]||[],endOfDayMinutes:base.endOfDayMinutes}));
   const absent=s.absences.filter(a=>a.date===d&&!a.deletedAt).map(a=>({staffId:a.staffId,name:a.name,periods:copy(absencePeriods(ctx,a)),...(a.coverage?{coverage:copy(a.coverage)}:{}),reason:a.typeLabel||'Unspecified'}));
   const effective=allocation().effectiveAssignments(s).filter(a=>a.date===d).map(a=>{const out={};for(const k of ['id','demandId','staffId','absentId','absentIds','absentName','name','relieverName','period','subject','className','venue','groupName','status','noRelief','remove','combination','repurposedDuty','mutual'])if(a[k]!==undefined)out[k]=copy(a[k]);out.assignedBy=assignmentBy(a,s,ctx);return out;});
   const project=dem=>{const out={};for(const k of ['id','staffId','name','period','subject','className','venue','groupName','recessActivationId'])if(dem[k]!==undefined)out[k]=copy(dem[k]);if(dem.members)out.members=dem.members.map(project);return out;};
   const extraIds=new Set([...s.adhoc.filter(a=>a.date===d&&!a.deletedAt).map(a=>a.staffId),...effective.map(a=>a.staffId),...absent.map(a=>a.staffId)]);
   teacherSummary={plan:fullPlan,absences:absent,assignments:effective,demands:demand(ctx,s,d).map(project),addedTeachers:ctx.people.filter(t=>extraIds.has(t.id)&&!fullPlan.teachers.some(p=>p.staffId===t.id)).map(({id,name})=>({staffId:id,name,timetableName:name})),staplerStatus:plan?(record.publishedRevision===record.revision?'published':'confirmed'):'baseline'};
  }
  return {revision:s.revision,allocationRevision:s.dayRevisions[d]||0,date:d,exportedAt:ctx.iso,...(teacherSummary?{teacherSummary}:{}),periods:copy(dd.periods),rows:[...rows.values()].sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true})),legend:'Grey: unpublished allocation or explicit No Relief Needed. Light red: UNASSIGNED. White: published allocation. Blank: no vacancy.'};
 }

 function primaryLevel(className){const m=/^(?:P(?:rimary)?\s*)?([1-6])(?=$|[^0-9])/i.exec(String(className||'').trim());return m?Number(m[1]):null;}
 function customText(s,dem){return matchingCustom(s,dem).map(r=>r.text).join('\n\n');}
 function customApply(s,ctx,p){
  smc(ctx);const d=ctx.today,old=p.id?s.customInstructions.find(r=>r.id===p.id&&!r.deletedAt):null;
  if(p.id&&!old)fail(409,'This custom instruction changed. Refresh.');const removing=p.operation==='deleteCustomInstruction',toggling=p.operation==='setCustomInstructionEnabled';if((removing||toggling)&&!old)fail(404,'Custom instruction not found.');
  if(toggling){if(typeof p.enabled!=='boolean')fail(400,'Set this instruction to On or Off.');if((old.enabled!==false)===p.enabled)return {savedIds:[old.id],savedId:old.id};}
  let values;if(!removing&&!toggling){
   const levels=p.levels||[],ps=p.periods||[],classNames=p.classNames||[],groupIds=p.groupIds||[],dd=day(ctx,d,false),groups=ctx.teachingGroups||dd?.teachingGroups||[],periods=ctx.customPeriods||dd?.periods||[];
   if(!Array.isArray(groupIds)||groupIds.length>100||groupIds.some(id=>!groups.some(g=>g.id===id)))fail(400,'Choose teaching groups from the current published deployment.');
   if(!Array.isArray(levels)||levels.some(n=>!Number.isInteger(n)||n<1||n>6)||!Array.isArray(ps)||ps.some(n=>!Number.isInteger(n)||!periods.some(t=>t.period===n))||!Array.isArray(classNames)||classNames.length>100)fail(400,'Choose valid levels, classes and periods.');
   if(typeof p.text!=='string'||!p.text.trim()||p.text.length>8000)fail(400,'Enter an operational instruction of at most 8000 characters.');
   values={groupIds:[...new Set(groupIds)].sort(),levels:[...new Set(levels)].sort(),periods:[...new Set(ps)].sort((a,b)=>a-b),classNames:[...new Set(classNames.map(n=>text(n,100)))],text:p.text};
  }
  const row=old||{id:ctx.uuid(),date:d,createdAt:ctx.iso,createdBy:ctx.user.email,version:0,enabled:true},before=old?copy(old):null;
  if(removing)row.deletedAt=ctx.iso;else if(toggling)row.enabled=p.enabled;else Object.assign(row,values);row.version++;row.updatedAt=ctx.iso;row.updatedBy=ctx.user.email;if(!old)s.customInstructions.push(row);
  allocation().addAudit(s,ctx,p.operation,{date:d,scope:'ongoing',ids:[row.id],before,after:copy(row)});
  const notices=[],changedDates=new Set();for(const a of s.assignments){
   if(a.date<ctx.today||!['draft','published'].includes(a.status)||a.noRelief||a.remove||allocation().periodEnded(ctx,a.date,a.period,a))continue;
   const next=customText(s,a);if(String(a.customInstructions||'')===next)continue;a.customInstructions=next;a.version=(a.version||1)+1;a.updatedAt=ctx.iso;changedDates.add(a.date);
   if(a.status==='published')notices.push(publicationSnapshot(s,ctx,a,'instructions'));
  }
  for(const date of changedDates)allocation().bumpDay(s,date);queuePublication(s,ctx,notices);return {savedIds:[row.id],savedId:row.id};
 }

 function assignmentInstructions(s,dem){if(dem.members)return dem.members.map(m=>{const note=assignmentInstructions(s,m);return note?m.name+': '+note:'';}).filter(Boolean).join('\n\n');const a=s.absences.find(a=>a.id===dem.absenceId);return a?.instructionsNA?'':a?.instructions?.[dem.lessonKey]||'';}
 function manualApply(s,ctx,p){
  smc(ctx);const A=allocation(),op=p.operation,d=date(p.date||ctx.today);A.ensure(s);
  if(op==='undo'){
   const ids=new Set(p.ids||[p.id]),rows=A.effectiveAssignments(s,true).filter(a=>ids.has(a.id));if(!rows.length||rows.length!==ids.size)fail(409,'The selected assignment no longer exists. Review the current cell.');
   return unassign(s,ctx,{...p,demandIds:rows.map(a=>a.demandId)});
  }
  const ds=findDemands(s,ctx,p.demandIds||[]);
  const person=staff(ctx,p.staffId);if(ds.some(x=>samePerson(ctx,x.staffId,p.staffId)))fail(409,'An absent teacher cannot cover their own class.');
  const existing=A.effectiveAssignments(s,true).filter(a=>ds.some(d=>d.id===a.demandId)),reason=text(p.reason||'',1000),changingProtected=existing.some(a=>!a.noRelief&&(a.origin==='automatic'||a.status==='published'));
  if(existing.length===ds.length&&existing.every(a=>a.staffId===p.staffId&&!!a.combination===(op==='combine')&&!a.noRelief&&!a.invalidCover&&a.origin==='smc'&&A.manualDecision(s,d,a.demandId)))return {savedIds:existing.map(a=>a.id),unchanged:true};
  if(!A.reliefCandidateEligible(person))fail(403,'This staff category is not included in relief candidates. Existing assignments can still be managed.');
  const overrides=peerOverrides(s,ctx,ds,p.staffId),overrideIds=new Set(overrides.map(r=>r.id)),planning={...s,requests:s.requests.filter(r=>!overrideIds.has(r.id))},model=A.manualModel(planning,ctx,d),rankings=ds.map(dem=>A.manualRanks(model,dem).find(c=>c.staffId===p.staffId));
  let warnings=[];
  if(op==='combine'){
   if(ds.length!==1)fail(400,'Combine one class and period at a time.');const c=rankings[0];if(!c?.combineAllowed)fail(409,'This teacher cannot take another class during this period. Check attendance, existing supervision and the one-additional-class limit.');
  }else{
   const av=ds.length===1&&rankings[0]?.repurposedDuty?rankings[0]:availability(planning,ctx,p.staffId,d,ds.map(x=>x.period),ds.map(x=>x.id),undefined,ds);if(!av.available)fail(409,av.reasons.join(' '));warnings=av.warnings;
  }
  supersedePeerRequests(s,ctx,p,overrides);rememberAutoBaseline(s,d,existing);
  const savedIds=[];
  for(let i=0;i<ds.length;i++){
   const dem=ds[i],before=decisionValue(s,ctx,dem),old=existing.find(a=>a.demandId===dem.id);if(old?.status==='draft'){old.status='cancelled';old.cancelledAt=ctx.iso;old.cancellationReason=op==='combine'?'SMC class combination':'SMC reassignment';}
   const row=snapshot({id:ctx.uuid(),staffId:person.id,demandId:dem.id,status:'draft',origin:'smc',protected:true,oneClick:!changingProtected&&!warnings.length,version:1,combination:op==='combine',sameClass:op==='combine'&&rankings[i].sameClass,originalLesson:op==='combine'?copy(rankings[i].combineBase):null,repurposedDuty:op!=='combine'&&rankings[i]?.repurposedDuty===true,rCost:op==='combine'||rankings[i]?.repurposedDuty?0:1,noRelief:false,remove:false,replaces:['published','completed'].includes(old?.status)?old.id:old?.replaces||null,createdAt:ctx.iso,createdBy:ctx.user.email,employmentPeriodOverride:op!=='combine'&&rankings[i]?.employmentPeriodRestricted===true,overrideReason:reason,overrideWarnings:warnings},dem,{...ctx,instruction:assignmentInstructions(s,dem),customInstruction:customText(s,dem)});
   s.assignments.push(row);savedIds.push(row.id);recordManualDecision(s,ctx,dem,'assignment',row,before,op,warnings);A.addAudit(s,ctx,op,{date:dem.date,ids:[row.id],previous:old?.id||null,reason:reason||null,warnings,employmentPeriodOverride:row.employmentPeriodOverride,combination:row.combination,originalLesson:row.originalLesson});
  }
  updateHealthWarnings(s,ctx,[d]);return {savedIds,savedId:savedIds[0]};
 }
 function cellSourceKey(d){return JSON.stringify([d.staffId,d.timetableId,d.period,d.subject,d.className,d.venue,d.groupName]);}
 function allocationCellView(s,ctx,p){
  smc(ctx);const d=date(p.date||ctx.today),dd=day(ctx,d),A=allocation(),recovery=manualRecoveryDemands(s,ctx,d);
  // Project current assignments without rebuilding quotas, candidate ranks or annual rotation.
  return {allocationPatch:true,baseRevision:p.revision,revision:s.revision,date:d,allocationRevision:s.dayRevisions[d]||0,publicationPreview:publicationPreview(s,ctx,d),timetableId:dd.id,parity:dd.parity,staplerRevision:dd.staplerRevision||0,assignments:copy(s.assignments.filter(a=>a.date===d)),mutualRequests:copy(s.requests.filter(r=>r.date===d)),effectiveAssignments:A.manualAssignments(s,d),manualDecisions:copy(A.manualOwnership(s,d)),manualRecoveryDemands:recovery,cellStates:cellDecisions(s,d,[...demand(ctx,s,d),...recovery].map(dem=>dem.id)),publishAudit:publishAudit(s,ctx,d),canPublish:!publishDateIssue(ctx,d,s)};
 }
 function allocationView(s,ctx,p){smc(ctx);const d=date(p.date||ctx.today),A=allocation(),projection={...s,accountingYears:copy(s.accountingYears),entitlements:s.entitlements.map(r=>({...r})),audit:[]};A.initialiseHistory(projection,ctx,d);A.captureWeek(projection,ctx,d);const teachers=A.teacherContext(projection,ctx,d),demands=demand(ctx,s,d),recovery=manualRecoveryDemands(s,ctx,d);return {publicationPreview:publicationPreview(s,ctx,d),publishedAt:s.dailyPublicationStates?.[d]?.publishedAt||null,publishedRevision:s.dailyPublicationStates?.[d]?.revision||0,publishAudit:publishAudit(s,ctx,d),manualRecoveryDemands:recovery,cellStates:cellDecisions(s,d,[...demands,...recovery].map(dem=>dem.id)),manualDecisions:copy(A.manualOwnership(s,d)),allocationModel:A.manualModel(projection,ctx,d,teachers),health:A.health(projection,ctx,d,demands,teachers)};}
 function allocationProjection(s,ctx,p){smc(ctx);const d=date(p.date||ctx.today),A=allocation(),projection={...s,accountingYears:copy(s.accountingYears),entitlements:s.entitlements.map(r=>({...r})),audit:[]};A.initialiseHistory(projection,ctx,d);A.captureWeek(projection,ctx,d);return A.manualModel(projection,ctx,d);}
 function reliefBatch(s,ctx,p){
  smc(ctx);const d=date(p.date),dd=day(ctx,d),allowed=['assign','combine','unassign','setNoRelief','returnAutomatic'];
  if(p.revision!==s.revision)fail(409,'Relief records changed. Review the latest assignments before saving.');
  if(!Array.isArray(p.commands)||!p.commands.length||p.commands.length>100)fail(400,'Save between 1 and 100 relief changes together.');
  if(dd.verified!==true||dd.schoolDay!==true||dd.id!==p.expectedTimetableId||(dd.staplerRevision||0)!==p.expectedStaplerRevision||dd.parity!==p.expectedParity)fail(409,'The timetable or confirmed Stapler plan changed. Review your choices.');
  const sources=new Map(demand(ctx,s,d).map(dem=>[dem.id,cellSourceKey(dem)])),recovery=new Map(manualRecoveryDemands(s,ctx,d).map(dem=>[dem.id,dem.recoverySourceKey]));
  for(const command of p.commands){if(!command||!allowed.includes(command.operation)||command.date&&command.date!==d||!Array.isArray(command.demandIds)||!command.demandIds.length||command.demandIds.some(id=>{const source=sources.get(id)||(['unassign','returnAutomatic'].includes(command.operation)?recovery.get(id):null);return !source||source!==p.expectedDemandSources?.[id];}))fail(409,'A selected lesson changed. Review your retained choices before saving.');}
  // Validate every ordered command on an isolated working state. No rejected prefix escapes.
  const next=copy(s),draftCtx={...ctx,draftBatch:true,requestId:p.requestId},savedIds=[];
  for(const command of p.commands){const result=apply(next,draftCtx,{...command,date:d});savedIds.push(...result.savedIds);
   for(const demId of command.demandIds){const rows=next.assignments.filter(a=>a.demandId===demId&&a.status==='draft'),replacement=rows.filter(a=>!a.remove).at(-1),removals=rows.filter(a=>a.remove);if(replacement&&removals.length){replacement.replaces=removals.at(-1).replaces;for(const row of removals){row.status='cancelled';row.cancelledAt=ctx.iso;}}}
  }
  allocation().addAudit(next,ctx,'reliefBatch',{date:d,commands:p.commands.length,ids:savedIds});Object.assign(s,next);return {savedIds};
 }
 function absenceWorkingState(s){
  // Absence commands read immutable plans. Keep their lazy/frozen content
  // identities so unrelated archived plans are neither inflated nor repacked.
  const next=copy({...s,staplerPlans:[],staplerArchives:[]});
  for(const key of ['staplerPlans','staplerArchives'])next[key]=(s[key]||[]).map(row=>({...row}));return next;
 }
 // Reuse the existing absence and colleague validators on an isolated state.
 // A rejected colleague choice must never leave the absence or queued jobs behind.
 function saveAbsenceWithArrangements(s,ctx,p){
  const map=p.ownArrangementsByStaffDate,object=value=>value&&typeof value==='object'&&!Array.isArray(value);
  if(!object(map))fail(400,'Supply dated colleague arrangements for each selected teacher.');
  const command={...p};delete command.ownArrangementsByStaffDate;if(!Object.keys(map).length)return apply(s,ctx,command);
  const next=absenceWorkingState(s),result=apply(next,ctx,command),saved=new Set(result.savedIds),mutualRequestIds=[];
  for(const [staffId,dated] of Object.entries(map)){
   if(!object(dated))fail(400,'Supply valid dated colleague arrangements.');
   for(const [dayKey,picks] of Object.entries(dated)){
    const a=next.absences.find(row=>saved.has(row.id)&&row.staffId===staffId&&row.date===dayKey);
    if(!a||!Array.isArray(picks)||!picks.length||picks.length>40)fail(400,'Select current absence lessons for colleague arrangements.');
    if(!a.reliefRequired)fail(400,'Colleague arrangements require relief for this absence.');
    const dd=day(ctx,dayKey),current=lessons(ctx,a),requests=picks.map(pick=>{
     const lesson=current.find(row=>row.period===pick?.period);
     if(!lesson||typeof pick.lessonKey!=='string'||lesson.lessonKey!==pick.lessonKey||dd.id!==pick.expectedTimetableId||dd.parity!==pick.expectedParity||!Number.isInteger(pick.expectedStaplerRevision))fail(409,'A selected lesson changed. Review your retained colleague choices.');
     if(pick.combination===true){const cells=dd.teachers.find(row=>row.staffId===pick.recipientId)?.cells?.[pick.period];if(!Array.isArray(pick.expectedRecipientCell)||JSON.stringify(cells)!==JSON.stringify(pick.expectedRecipientCell))fail(409,'The colleague’s lesson changed. Review this class combination.');}
     return {demandIds:[lesson.id],recipientId:pick.recipientId,combination:pick.combination===true};
    });
    const requested=apply(next,ctx,{operation:'requestMutual',absenceId:a.id,date:dayKey,requests,proposalOnly:p.proposalOnly===true});mutualRequestIds.push(...requested.savedIds);
   }
  }
  Object.assign(s,next);return {...result,mutualRequestIds};
 }
 function previewAbsenceCandidates(s,ctx,p){
  const input=p.previewAbsence;if(!input||typeof input!=='object'||Array.isArray(input)||p.purpose!=='mutual'||p.byPeriod!==true)fail(400,'Choose an absence to preview colleague arrangements.');
  const ids=absenceStaffIds(ctx,{staffId:input.staffId}),person=staff(ctx,ids[0]),d=date(input.date||p.date||ctx.today),dd=day(ctx,d);
  if(d!==date(p.date||ctx.today)||d<ctx.today||!absenceEligible(person))fail(403,'Choose a current eligible absence date.');
  const coverage=absenceCoverage(input.fullDay===true?{kind:'fullDay'}:input.coverage),ps=coverage?allocation().absencePeriods({coverage},dd):periods(ctx,d,input.periods),a={id:'preview:'+person.id+':'+d,staffId:person.id,name:person.name,date:d,periods:ps,...(coverage?{coverage}:{}),reliefRequired:true,instructions:{},instructionsNA:false,noReliefSubjects:copy(s.systemConfig.noReliefSubjects)};
  const previewDemands=lessons(ctx,a);if(!previewDemands.length)fail(400,'No individual relief lessons are available for these periods.');
  const next=absenceWorkingState(s);next.absences.push(a);const command={...p,demandIds:previewDemands.map(row=>row.id)};delete command.previewAbsence;
  return {...read(next,ctx,command),previewDemands};
 }
 // Intake resubmissions reuse existing row identities. Work on a candidate so a
 // later conflicting date cannot leave an earlier date partially applied.
 function mergeSubmittedInstructions(a,input,ctx){
  const at=ctx.reportedAt||ctx.iso,sequence=ctx.reportSequence||0,values={...(a.instructions||{})},authors=copy(a.instructionAuthors||{});
  for(const [key,value] of Object.entries(input||{})){
   if(!String(value).trim())continue; // A repeat with blank fields is not deletion.
   const prior=authors[key]||(Object.prototype.hasOwnProperty.call(values,key)?{actor:a.instructionsUpdatedBy||a.reportedBy,at:a.instructionsUpdatedAt||a.reportedAt,sequence:0}:{actor:a.reportedBy,at:a.reportedAt,sequence:0});
   if(Date.parse(at)<Date.parse(prior.at)||at===prior.at&&sequence<(prior.sequence||0))continue;
   if(values[key]&&values[key]!==value&&prior.actor&&prior.actor!==ctx.user.email)fail(409,'These instructions were written by another person. Review the changed instructions.','ABSENCE_INSTRUCTIONS_CONFLICT');
   values[key]=value;authors[key]={actor:ctx.user.email,at,sequence};
  }
  return {instructions:values,instructionAuthors:authors};
 }
 function resubmissionIntervals(rows,dd){
  const values=rows.flatMap(a=>absenceIntervals(a,dd)).map(r=>({startMinutes:r.startMinutes,endMinutes:r.endMinutes})).sort((a,b)=>a.startMinutes-b.startMinutes),result=[];
  for(const r of values){const last=result.at(-1);if(last&&r.startMinutes<=last.endMinutes)last.endMinutes=Math.max(last.endMinutes,r.endMinutes);else result.push({...r});}return result;
 }
 function subtractAbsenceIntervals(left,right){let result=left.map(r=>({...r}));for(const b of right){const next=[];for(const a of result){if(b.endMinutes<=a.startMinutes||b.startMinutes>=a.endMinutes)next.push(a);else{if(a.startMinutes<b.startMinutes)next.push({startMinutes:a.startMinutes,endMinutes:b.startMinutes});if(a.endMinutes>b.endMinutes)next.push({startMinutes:b.endMinutes,endMinutes:a.endMinutes});}}result=next;}return result;}
 function applyAbsenceResubmission(s,ctx,p){
  const staffIds=absenceStaffIds(ctx,p),dates=absenceDates(p,ctx),candidate=absenceWorkingState(s),savedIds=[],changes=[];
  const incomingAt=ctx.reportedAt||ctx.iso,sequence=ctx.reportSequence||0;
  for(const date of dates)for(const staffId of staffIds){
   const dd=day(ctx,date),coverage=p.fullDay===true?{kind:'fullDay'}:p.coverage,requested={periods:p.periods||[],coverage},want=resubmissionIntervals([requested],dd);
   // 0.9.9a: the latest action wins. A deletion saved after this report supersedes it.
   if(candidate.absences.some(a=>a.deletedAt&&Date.parse(a.deletedAt)>=Date.parse(incomingAt)&&a.date===date&&samePerson(ctx,a.staffId,staffId)&&absenceOverlap(a,requested,dd)))continue;
   const overlapping=candidate.absences.filter(a=>!a.deletedAt&&a.date===date&&samePerson(ctx,a.staffId,staffId)&&absenceOverlap(a,requested,dd));
   if(!overlapping.length){const command={...p,staffId,date};delete command.staffIds;delete command.dates;delete command.from;delete command.to;const r=apply(candidate,{...ctx,resubmission:false},command);for(const id of r.savedIds){const a=candidate.absences.find(a=>a.id===id);a.lastSubmissionAt=incomingAt;a.lastSubmissionSequence=sequence;if(Object.keys(a.instructions||{}).length){const notes=mergeSubmittedInstructions({...a,instructions:{},instructionAuthors:{}},a.instructions,ctx);Object.assign(a,notes);}}savedIds.push(...r.savedIds);continue;}
   const stale=a=>Date.parse(incomingAt)<Date.parse(a.lastSubmissionAt||a.reportedAt)||incomingAt===(a.lastSubmissionAt||a.reportedAt)&&sequence<(a.lastSubmissionSequence||0);
   if(overlapping.every(stale)){savedIds.push(...overlapping.map(a=>a.id));continue;}
   // 0.9.9a: saved portions newer than this report keep their coverage; older portions follow it.
   savedIds.push(...overlapping.filter(stale).map(a=>a.id));const matches=overlapping.filter(a=>!stale(a));
   const existing=resubmissionIntervals(matches,dd),gaps=subtractAbsenceIntervals(want,existing),outside=subtractAbsenceIntervals(existing,want),shorter=!gaps.length&&outside.length>0;
   // 0.9.9a: a later report replaces the saved coverage without SMC review.
   // Periods that have already started keep their recorded absence and relief.
   // Equal-order replays are not later reports: they keep the saved coverage.
   const later=matches.every(a=>Date.parse(incomingAt)>Date.parse(a.lastSubmissionAt||a.reportedAt)||incomingAt===(a.lastSubmissionAt||a.reportedAt)&&sequence>(a.lastSubmissionSequence||0));
   const choice=ctx.resubmissionChoice||(shorter?(later?'replace':'keep'):null);
   if(shorter&&choice==='replace'){
    const keep=[...new Set(matches.flatMap(a=>absencePeriods(ctx,a).filter(n=>!allocation().absencePeriods(requested,dd).includes(n)&&allocation().periodEnded(ctx,date,n))))];
    if(keep.length)want.splice(0,want.length,...resubmissionIntervals([requested,{periods:keep}],dd));
   }
   for(const a of matches){
    const last=a.lastSubmissionAt||a.reportedAt,lastSeq=a.lastSubmissionSequence||0;
    if(Date.parse(incomingAt)<Date.parse(last)||incomingAt===last&&sequence<lastSeq){savedIds.push(a.id);continue;}
    let selected=matches.length===1?resubmissionIntervals([a,requested],dd):resubmissionIntervals([a],dd);
    if(shorter&&choice==='replace')selected=selected.flatMap(r=>want.map(w=>({startMinutes:Math.max(r.startMinutes,w.startMinutes),endMinutes:Math.min(r.endMinutes,w.endMinutes)})).filter(r=>r.startMinutes<r.endMinutes));
    if(!selected.length)fail(409,'Removing a separate saved absence requires Manage reported absences.','ABSENCE_COVERAGE_REVIEW');
    const command={operation:'saveAbsence',id:a.id,staffId,date,typeId:p.typeId,reasonDetail:p.reasonDetail,reliefRequired:p.reliefRequired,remarks:p.remarks};
    if(!gaps.length&&!(shorter&&choice==='replace')){if(a.coverage)command.coverage=copy(a.coverage);else command.periods=a.periods.slice();}
    else if(selected.length===1)command.coverage=selected[0].startMinutes===0&&selected[0].endMinutes===1440?{kind:'fullDay'}:{kind:'timeRange',...selected[0]};
    else if(!a.coverage&&!coverage)command.periods=dd.periods.filter(period=>selected.some(r=>period.startMinutes<r.endMinutes&&r.startMinutes<period.endMinutes)).map(period=>period.period);
    else fail(409,'Disjoint absence time ranges require review.','ABSENCE_COVERAGE_REVIEW');
    const input=(p.instructionsByStaffDate?.[staffId]||p.instructionsByDate)?.[date],merged=input===undefined?null:mergeSubmittedInstructions(a,input,ctx);
    if(merged)command.instructionsByDate={[date]:merged.instructions};
    if(p.instructionsNA===true&&!Object.values(merged?.instructions||a.instructions||{}).some(v=>String(v).trim()))command.instructionsNA=true;
    else if(merged&&Object.values(input||{}).some(v=>String(v).trim()))command.instructionsNA=false;
    const sameCoverage=JSON.stringify(selected)===JSON.stringify(resubmissionIntervals([a],dd));
    const unchanged=sameCoverage&&p.typeId===a.typeId&&(p.reasonDetail||'')===(a.reasonDetail||'')&&(p.reliefRequired!==false)===(a.reliefRequired!==false)&&(p.remarks===undefined||p.remarks===(a.remarks||''))&&(!merged||JSON.stringify(merged.instructions)===JSON.stringify(a.instructions||{}))&&(command.instructionsNA===undefined||command.instructionsNA===a.instructionsNA);
    if(unchanged){a.lastSubmissionAt=incomingAt;a.lastSubmissionSequence=sequence;if(merged)a.instructionAuthors=merged.instructionAuthors;savedIds.push(a.id);continue;}
    const before=JSON.stringify([a.periods,a.coverage,a.typeId,a.reasonDetail,a.reliefRequired,a.instructions,a.instructionsNA,a.remarks]);
    apply(candidate,{...ctx,resubmission:false},command);
    const updated=candidate.absences.find(x=>x.id===a.id);if(merged)updated.instructionAuthors=merged.instructionAuthors;
    updated.lastSubmissionAt=incomingAt;updated.lastSubmissionSequence=sequence;
    if(before!==JSON.stringify([updated.periods,updated.coverage,updated.typeId,updated.reasonDetail,updated.reliefRequired,updated.instructions,updated.instructionsNA,updated.remarks]))changes.push(a.id);savedIds.push(a.id);
   }
   // With multiple existing rows keep their IDs and append only uncovered spans.
   if(matches.length>1)for(const gap of gaps){const command={...p,staffId,date,coverage:{kind:'timeRange',...gap}};for(const key of ['staffIds','dates','from','to','fullDay','periods','instructionsByDate','instructionsByStaffDate','ownArrangementsByStaffDate'])delete command[key];const r=apply(candidate,{...ctx,resubmission:false},command);savedIds.push(...r.savedIds);}
  }
  Object.assign(s,candidate);return {savedIds:[...new Set(savedIds)],savedId:savedIds[0]||null,resubmission:true,changedIds:changes};
 }
 function apply(s,ctx,p){if(p.operation==='saveAbsence'&&!p.id&&ctx.resubmission===true)return applyAbsenceResubmission(s,ctx,p);if(p.operation==='saveAbsence'&&p.ownArrangementsByStaffDate!==undefined)return saveAbsenceWithArrangements(s,ctx,p);if(p.view==='schoolAbsences'){smc(ctx);schoolAbsencesRange(ctx,p);}validateState(s);if(p.operation!=='acknowledge'&&typeof GSISRosterStatistics!=='undefined')GSISRosterStatistics.markTracking(s,ctx);if(p.operation==='reliefBatch')return reliefBatch(s,ctx,p);if(['saveNameBridge','deleteNameBridge'].includes(p.operation))return saveNameBridge(s,ctx,p);if(p.operation==='notifyDaily')return notifyDaily(s,ctx,p);if(p.operation==='saveSystemConfig')return saveSystemConfig(s,ctx,p);if(p.operation==='saveDailyEmploymentSettings')return saveDailyEmploymentSettings(s,ctx,p);if(p.operation==='sendDailyEmploymentReport'){employmentEditor(ctx);return queueDailyEmployment(s,ctx,date(p.date||ctx.today),p.requestId);} if(['createStapler','importStapler','saveStapler','confirmStapler','publishStapler','resetStapler','requestStapler','decideStapler','renameStapler','moveStapler','deleteStapler','restoreStapler'].includes(p.operation))return staplerApply(s,ctx,p);if(p.operation==='unassign')return unassign(s,ctx,p);if(p.operation==='returnAutomatic')return returnAutomatic(s,ctx,p);if(p.operation==='saveRecessSettings')return recessSettingsApply(s,ctx,p);if(['saveRecess','deleteRecess'].includes(p.operation))return recessApply(s,ctx,p);if(p.operation==='setNoRelief'||p.operation==='noRelief')return noReliefApply(s,ctx,p);if(p.operation==='publish')return publishDay(s,ctx,p);if(p.operation==='acknowledge')return acknowledgePublications(s,ctx,p);if(p.operation==='removeAssignment')return removeManualAssignment(s,ctx,p);if(['saveCustomInstruction','deleteCustomInstruction','setCustomInstructionEnabled'].includes(p.operation))return customApply(s,ctx,p);if(['assign','combine','undo'].includes(p.operation))return manualApply(s,ctx,p);if(['optimise','autoAllocate','setDutySMC','importRHistory','verifyRYear','correctRelief','confirmCompleted'].includes(p.operation))return r17Apply(s,ctx,p);const op=p.operation,d=date(p.date||ctx.today);let savedIds=[];const getAbs=id=>{const a=s.absences.find(x=>x.id===id);if(!a)fail(404,'Absence record not found.');return a;};
  if(op==='saveAbsence'){
   // Only the server's durable intake timestamp can preserve reporting authority
   // across a delayed projection. Never take reporting time from the payload.
   const captured=Date.parse(ctx.reportedAt||''),localCapture=Number.isFinite(captured)&&captured<=ctx.now?new Date(captured+8*3600000):null,reportContext=localCapture?{...ctx,today:localCapture.toISOString().slice(0,10),minute:localCapture.getUTCHours()*60+localCapture.getUTCMinutes(),iso:ctx.reportedAt}:ctx;
   const staffIds=absenceStaffIds(ctx,p),people=staffIds.map(id=>staff(ctx,id));if(p.id&&people.length!==1)fail(400,'Edit one teacher at a time on an existing absence.');if(!p.id&&people.some(person=>!absenceEligible(person)))fail(403,'This staff category is not included in Report Absence. Existing absence records can still be managed.');const days=p.id?[getAbs(p.id).date]:absenceDates(p,ctx);if(days.some(d=>d<reportContext.today))fail(403,'Past absence entries are view only.');const type=s.types.find(t=>t.id===p.typeId);if(!type)fail(400,'Select an available absence type.');const reasonDetail=type.requiresDetail||type.id==='others'?text(p.reasonDetail||'',500):'';if((type.requiresDetail||type.id==='others')&&!reasonDetail)fail(400,'Please specify the absence reason.');if(type.afterMinutes!==null&&reportContext.minute<type.afterMinutes)fail(400,'This absence type can be submitted only after '+Math.floor(type.afterMinutes/60)+':'+String(type.afterMinutes%60).padStart(2,'0')+' Singapore time.');if(type.todayOnly&&days.some(v=>v!==reportContext.today))fail(400,'LSE can be reported for today only.');
   const existing=p.id?getAbs(p.id):null,requestedCoverage=absenceCoverage(p.fullDay===true?{kind:'fullDay'}:p.coverage,existing);
   if(existing){editable(reportContext,existing);if(existing.staffId!==people[0].id)fail(400,'The absent teacher cannot be changed on an existing entry.');}
   if((p.selectAll===true||requestedCoverage?.kind==='fullDay')&&!type.allowSelectAll)fail(400,'Select All is not available for this absence type.');
   const object=value=>value&&typeof value==='object'&&!Array.isArray(value),dated=value=>object(value)&&Object.keys(value).every(key=>days.includes(key));
   if(p.instructionsByDate!==undefined&&(!object(p.instructionsByDate)||people.length>1||p.instructionsByStaffDate!==undefined))fail(400,'Supply dated instructions for each selected teacher.');
   if(p.instructionsByStaffDate!==undefined&&(!object(p.instructionsByStaffDate)||Object.entries(p.instructionsByStaffDate).some(([id,value])=>!staffIds.includes(id)||!dated(value))))fail(400,'Supply valid dated instructions for the selected teachers.');
   if(p.expectedInstructionScopes!==undefined&&(!dated(p.expectedInstructionScopes)||Object.values(p.expectedInstructionScopes).some(scope=>!object(scope)||typeof scope.timetableId!=='string'||!Number.isInteger(scope.staplerRevision)||typeof scope.parity!=='string')))fail(400,'Supply valid dated timetable sources for the instruction draft.');
   const reference=days.map(key=>day(ctx,key)).find(dd=>dd.periods.length),fallbackRanges=!requestedCoverage&&reference?periods({days:{reference}},'reference',p.periods).map(n=>reference.periods.find(t=>t.period===n)).map(({startMinutes,endMinutes})=>({startMinutes,endMinutes})):null,prepared=[],overlapByDate=new Map();let preparedCharacters=0;
   for(const a of s.absences)if(!a.deletedAt){if(!overlapByDate.has(a.date))overlapByDate.set(a.date,[]);overlapByDate.get(a.date).push(a);}
   // Validate every teacher and date before changing a single absence record.
   for(const dayKey of days){const dd=day(ctx,dayKey),timing=dd.periods,coverage=requestedCoverage||(!timing.length&&fallbackRanges?{kind:'timeRanges',ranges:fallbackRanges}:null);
    const expected=p.expectedInstructionScopes?.[dayKey];if(expected&&(expected.timetableId!==dd.id||expected.parity!==dd.parity||expected.staplerRevision!==(dd.staplerRevision||0)))fail(409,'The timetable for this instruction draft changed. Review your retained instructions.');
    if(!timing.length&&!coverage)fail(400,'No timetable is available. Choose full day or start and end times.');
    if(type.allowedPeriods&&!timing.length)fail(409,'Period timings are required to verify this absence type. Retry when the timetable is available.');
    const ps=coverage?allocation().absencePeriods({coverage},dd):periods(ctx,dayKey,p.periods),ranges=coverage?absenceIntervals({coverage},dd):[];
    if(type.allowedPeriods&&ps.some(n=>!type.allowedPeriods.includes(n))||type.minStartMinutes!==null&&(ps.some(n=>timing.find(t=>t.period===n).startMinutes<type.minStartMinutes)||ranges.some(r=>r.startMinutes<type.minStartMinutes)))fail(400,'The absence type is not permitted in these periods.');
    for(const person of people){
    if((overlapByDate.get(dayKey)||[]).some(a=>a.id!==p.id&&samePerson(ctx,a.staffId,person.id)&&absenceOverlap(a,{periods:ps,coverage},dd)))fail(409,'This absence overlaps an existing entry. Edit that entry or select different periods.');
    const a=existing?copy(existing):{id:ctx.uuid(),staffId:person.id,name:person.name,date:dayKey,reportedBy:ctx.user.email,reportedById:ctx.user.staffId,reportedByName:ctx.people.find(x=>x.id===ctx.user.staffId)?.name||ctx.user.email,reportedAt:reportContext.iso,instructions:{},instructionsNA:false,noReliefSubjects:copy(s.systemConfig.noReliefSubjects)};
    Object.assign(a,{lastSubmissionAt:ctx.reportedAt||ctx.iso,lastSubmissionSequence:ctx.reportedAt?(ctx.reportSequence||0):Number.MAX_SAFE_INTEGER,periods:ps,typeId:type.id,typeLabel:type.label,reasonDetail,remarks:p.remarks===undefined?(a.remarks||''):text(p.remarks||''),reliefRequired:p.reliefRequired!==false,updatedBy:ctx.user.email,updatedAt:ctx.iso});
    if(coverage)a.coverage=copy(coverage);else delete a.coverage;
    a.timetablePending=absenceTimingPending(ctx,a);a.lessonSnapshot=lessons(ctx,a);a.periodSnapshot=copy(timing);
    const input=(p.instructionsByStaffDate?.[person.id]||p.instructionsByDate)?.[dayKey];if(input!==undefined){const out=instructionMap(input,new Set(a.lessonSnapshot.map(l=>l.lessonKey)));a.instructionAuthors=a.instructionAuthors||{};for(const key of new Set([...Object.keys(a.instructions||{}),...Object.keys(out)]))if((a.instructions?.[key]||'')!==(out[key]||''))a.instructionAuthors[key]={actor:ctx.user.email,at:ctx.reportedAt||ctx.iso,sequence:ctx.reportedAt?(ctx.reportSequence||0):Number.MAX_SAFE_INTEGER};a.instructions=out;}
    if(p.instructionsNA!==undefined)a.instructionsNA=p.instructionsNA===true;
    // Empty unresolved snapshots are not a completed instruction submission.
    if(a.timetablePending&&!existing){a.instructions={};a.instructionsNA=coverage?.kind==='fullDay'&&p.instructionsNA===true;}
    // Match the durable document ceiling while validating before any append.
    // Count actual rows/lessons, so long leave does not impose a small teacher cap.
    preparedCharacters+=JSON.stringify(a).length;if(preparedCharacters>12000000)fail(413,'This absence selection is too large to save together. Shorten the date range or select fewer teachers.');
    prepared.push(a);
    }
   }
   for(const a of prepared){if(existing){Object.assign(existing,a);if(!a.coverage)delete existing.coverage;}else s.absences.push(a);savedIds.push(a.id);}
  }else if(op==='deleteAbsences'){if(p.confirm!==true||!Array.isArray(p.ids)||!p.ids.length)fail(400,'Confirm the selected absence deletions.');const rows=p.ids.map(getAbs);rows.forEach(a=>editable(ctx,a));rows.forEach(a=>{a.deletedAt=ctx.iso;a.deletedBy=ctx.user.email;});
   const deleted=new Set(p.ids),remaining=allDemand(ctx,s);for(const a of allocation().effectiveAssignments(s,true)){if(![a.absenceId,...(a.absenceIds||[])].some(id=>deleted.has(id))||remaining.some(d=>d.id===a.demandId||a.sharedLessonKey&&d.sharedLessonKey===a.sharedLessonKey)||allocation().periodStarted(ctx,a.date,a.period,a))continue;releaseAssignment(s,{...ctx,draftBatch:true,manualMutation:true},a,'Absence deleted; this lesson no longer requires cover.');}
   savedIds=p.ids;
  }else if(op==='saveInstructions'&&p.instructionChanges!==undefined){
   const patches=instructionPatches(s,ctx,p);for(const {a,instructions,instructionsNA,lessonSnapshot} of patches){a.instructionAuthors=a.instructionAuthors||{};for(const key of new Set([...Object.keys(a.instructions||{}),...Object.keys(instructions)]))if((a.instructions?.[key]||'')!==(instructions[key]||''))a.instructionAuthors[key]={actor:ctx.user.email,at:ctx.iso,sequence:0};a.instructionsUpdatedBy=ctx.user.email;a.instructionsUpdatedAt=ctx.iso;Object.assign(a,{instructions,instructionsNA,lessonSnapshot,updatedAt:ctx.iso});savedIds.push(a.id);}
  }else if(op==='saveInstructions'){
   for(const a of instructionRecords(s,ctx,p.absenceIds||[p.absenceId])){editable(ctx,a);if(absenceTimingPending(ctx,a))fail(409,'The absence is saved. Add relief instructions when a verified school timetable is available.');const known=new Set(lessons(ctx,a).map(l=>l.lessonKey));
    const input=p.instructionsByDate?p.instructionsByDate[a.date]:p.instructions,merged=ctx.intakeInstructions?mergeSubmittedInstructions(a,instructionMap(input||{},known),ctx):null;const out=merged?merged.instructions:input===undefined?a.instructions:instructionMap(input,known);
    a.instructionAuthors=a.instructionAuthors||{};for(const key of new Set([...Object.keys(a.instructions||{}),...Object.keys(out)]))if((a.instructions?.[key]||'')!==(out[key]||''))a.instructionAuthors[key]={actor:ctx.user.email,at:ctx.iso,sequence:0};a.instructionsUpdatedBy=ctx.user.email;a.instructionsUpdatedAt=ctx.iso;a.lessonSnapshot=lessons(ctx,a);a.instructions=out;if(merged)a.instructionAuthors=merged.instructionAuthors;a.instructionsNA=merged?(!Object.values(out).some(v=>String(v).trim())&&a.instructionsNA===true):p.instructionsNA===true;a.updatedAt=ctx.iso;savedIds.push(a.id);

   }
  }else if(op==='saveAdhoc'){smc(ctx);if(d<ctx.today)fail(403,'Past daily relief records are view only.');const person=staff(ctx,p.staffId);if(person.adhocEligible===false)fail(400,'This staff group is not eligible for ad hoc relief.');const ps=periods(ctx,d,p.periods),employment=text(person.employment||'',40);let a=s.adhoc.find(x=>x.staffId===person.id&&x.date===d&&!x.deletedAt);if(!a){a={id:ctx.uuid(),staffId:person.id,date:d};s.adhoc.push(a);}Object.assign(a,{periods:ps,employment,updatedAt:ctx.iso,updatedBy:ctx.user.email});savedIds=[a.id];
  }else if(op==='deleteAdhoc'){smc(ctx);const a=s.adhoc.find(x=>x.id===p.id&&!x.deletedAt);if(!a)fail(404,'Daily relief entry not found.');if(a.date<ctx.today)fail(403,'Past daily relief records are view only.');a.deletedAt=ctx.iso;savedIds=[a.id];
  }else if(op==='saveTypes'){admin(ctx);if(!Array.isArray(p.types)||!p.types.length||p.types.length>80)fail(400,'Supply 1 to 80 absence types.');const ids=new Set();s.types=p.types.map(t=>{const id=text(t.id,60);if(!/^[a-zA-Z0-9_-]+$/.test(id)||ids.has(id))fail(400,'Absence type IDs must be unique.');ids.add(id);const label=text(t.label,100);if(!label)fail(400,'Name each absence type.');if(t.allowedPeriods!=null&&!Array.isArray(t.allowedPeriods))fail(400,'Invalid allowed periods.');const allowed=t.allowedPeriods==null?null:[...new Set(t.allowedPeriods)];if(allowed&&allowed.some(n=>!Number.isInteger(n)||n<0||n>39))fail(400,'Invalid allowed periods.');for(const k of ['afterMinutes','minStartMinutes'])if(t[k]!=null&&(!Number.isInteger(t[k])||t[k]<0||t[k]>1439))fail(400,'Invalid time rule.');return {id,label,requiresDetail:t.requiresDetail===true||id==='others',allowSelectAll:t.allowSelectAll!==false,allowedPeriods:allowed,afterMinutes:t.afterMinutes??null,minStartMinutes:t.minStartMinutes??null,todayOnly:t.todayOnly===true};});
  }else if(op==='requestMutual'){const a=getAbs(p.absenceId);editable(ctx,a);savedIds=createPeerRequests(s,ctx,p,a);
  }else if(op==='respondMutual'){const r=s.requests.find(x=>x.id===p.id);if(!r||r.recipientId!==ctx.user.staffId)fail(403,'This relief request is not addressed to you.');if(r.status!=='pending'||r.expiresAt<ctx.now||r.date<ctx.today)fail(409,'This relief request is no longer pending.');if(!['approve','reject'].includes(p.decision))fail(400,'Choose Approve or Reject.');const reason=text(p.reason||'',1000);if(p.decision==='reject'&&!reason)fail(400,'Enter a reason for rejection.');if(p.decision==='approve'){const ds=findDemands(s,ctx,r.demandIds);if(ds.some(x=>x.sharedLessonKey||x.absenceId!==r.absenceId))fail(409,'Own arrangements cover only the requesting teacher’s individual lessons.');if(ds.some(x=>{const prior=r.lessons.find(l=>l.id===x.id);return !prior||JSON.stringify([prior.timetableId,prior.subject,prior.className,prior.venue,prior.groupName])!==JSON.stringify([x.timetableId,x.subject,x.className,x.venue,x.groupName]);}))fail(409,'The requested lessons changed. Ask the teacher to submit a new request.');if(allocation().effectiveAssignments(s).some(a=>protectedOwnCover(a,r.demandIds)))fail(409,'Cover was assigned while this request was pending.');const choice=mutualChoice(s,ctx,r.recipientId,r.date,ds,r.combination===true,r.id);if(r.combination&&JSON.stringify(choice.combineBase)!==JSON.stringify(r.originalLesson))fail(409,'The colleague’s original lesson changed. Submit a new arrangement request.');for(const a of s.assignments)if(r.demandIds.includes(a.demandId)&&a.status==='draft'){a.status='cancelled';a.cancelledAt=ctx.iso;a.cancellationReason='Accepted peer arrangement replaces unpublished automatic allocation.';}for(const dem of ds){const abs=getAbs(dem.absenceId),a={id:ctx.uuid(),demandId:dem.id,staffId:r.recipientId,status:'draft',origin:'mutual',protected:true,rCost:r.combination?0:1,combination:r.combination===true,sameClass:r.combination&&choice.sameClass,originalLesson:r.combination?copy(choice.combineBase):null,version:1,mutual:true,peerArranged:true,peerApproved:true,noRelief:false,remove:false,requestId:r.id,createdAt:ctx.iso,createdBy:ctx.user.email,acceptedAt:ctx.iso,acceptedBy:ctx.user.email};s.assignments.push(snapshot(a,dem,{...ctx,instruction:abs.instructionsNA?'':abs.instructions[dem.lessonKey]||'',customInstruction:customText(s,dem)}));}}r.status=p.decision==='approve'?'approved':'rejected';r.peerApproved=p.decision==='approve';r.reason=reason;r.respondedAt=ctx.iso;r.respondedBy=ctx.user.email;savedIds=[r.id];
  }else if(op==='prune'){admin(ctx);const range=pruneRange(p);if(range.to>=ctx.today)fail(400,'Prune only past dates.');if(p.confirm!==true)fail(400,'Confirm pruning the selected date range.');const selection=pruneSelection(s,range,ctx.now);if(typeof GSISRosterStatistics!=='undefined')GSISRosterStatistics.captureBeforePrune(s,selection,ctx);for(const [key,rows] of Object.entries(selection.lists)){const removed=new Set(rows);s[key]=s[key].filter(x=>!removed.has(x));}for(const [key,keys] of Object.entries(selection.maps))for(const d of keys)delete s[key][d];
  }else fail(404,'Unknown relief operation.');
  if(op==='requestMutual'&&p.proposalOnly===true){for(const date of new Set(s.requests.filter(r=>savedIds.includes(r.id)).map(r=>r.date)))allocation().bumpDay(s,date);allocation().addAudit(s,ctx,op,{date:d,ids:savedIds});return {savedIds,savedId:savedIds[0]||null};}
  // Only the server's durable intake projection selects this boundary. Attendance
  // facts are committed before unrelated allocation repair or capacity accounting.
  if(op==='saveAbsence'&&ctx.attendanceOnly===true){const wanted=new Set(savedIds);for(const date of new Set(s.absences.filter(a=>wanted.has(a.id)).map(a=>a.date)))allocation().bumpDay(s,date);absenceAlerts(s,ctx,p,savedIds);essentialDecisionAudit(s,ctx,op,{date:d,ids:savedIds,attendanceOnly:true});return {savedIds,savedId:savedIds[0]||null};}
  if(op==='saveAbsence'||op==='saveInstructions')syncLessonInstructions(s,ctx,savedIds);
  reconcile(s,ctx);for(const dayKey of Object.keys(ctx.days)){if(['saveAbsence','deleteAbsences','assign','noRelief','removeAssignment','requestMutual','respondMutual','deleteAdhoc'].includes(op)){allocation().bumpDay(s,dayKey);updateHealthWarnings(s,ctx,[dayKey]);}}if(op==='saveAbsence')absenceAlerts(s,ctx,p,savedIds);allocation().addAudit(s,ctx,op,{date:d,ids:savedIds});return {savedIds,savedId:savedIds[0]||null};
 }
 function urgentMessageParts(message){
  const encoded=message.split(/\r\n|[\r\n\u0085\u2028\u2029]/u).map(line=>line.replace(/[\t\p{Zs}]+/gu,' ').trim()).filter(Boolean).join('; ');
  if([...encoded].length<=1024)return [message];
  // Keep source characters intact. Count line breaks twice for the outbound
  // '; ' encoding, leaving 24 characters for the numbered part prefix.
  const parts=[];let value='',length=0;
  for(const character of message){const size=/[\r\n\u0085\u2028\u2029]/u.test(character)?2:1;
   if(length+size>1000){parts.push(value);value='';length=0;}
   value+=character;length+=size;
  }
  if(value)parts.push(value);
  return parts.map((part,i)=>'[Part '+(i+1)+' of '+parts.length+'] '+part);
 }
 // Inbound events are facts, not authority. Identity is resolved from live Contacts in the service adapter.
 function inboundMessage(s,ctx,p){
  if(!ctx.service)fail(403,'Only the signed WhatsApp webhook may submit messages.');
  if(typeof p.messageId!=='string'||!/^wamid\.[\w=.+/-]{1,500}$/.test(p.messageId)||!/^\d{8,15}$/.test(mobile(p.from)))fail(400,'Invalid incoming message.');
  s.inboundEvents=s.inboundEvents||[];s.inboundSessions=s.inboundSessions||{};
  const prior=s.inboundEvents.find(e=>e.id===p.messageId);if(prior)return {duplicate:true,receiptId:prior.id,reply:null};
  if(!Number.isFinite(p.timestamp)||p.timestamp>ctx.now+60000||p.timestamp<ctx.now-86400000)fail(400,'Incoming message is outside the reply window.');
  const number=mobile(p.from),matches=ctx.people.filter(x=>mobile(x.mobile)===number&&(x.active||s.adhoc.some(a=>a.staffId===x.id&&a.date===ctx.today&&!a.deletedAt))),person=matches.length===1?matches[0]:null;
  const recent=s.inboundEvents.filter(e=>e.from===number&&ctx.now-e.receivedAt<60000),entry={id:p.messageId,from:number,receivedAt:ctx.now,providerTimestamp:p.timestamp,staffId:person?.id||null,replyStatus:'sending',replyClaimId:ctx.uuid()};s.inboundEvents.push(entry);
  let action='menu',text='';
  if(!person)action='unknown';
  else if(recent.length>=6)action='rate-limited';
  else if(p.selection){
   const choices={gsis_report_absence:'report-absence',gsis_urgent:'urgent-prompt',gsis_layout:'layout',gsis_devices:'devices',gsis_office:'office'};
   action=choices[p.selection]||'menu';delete s.inboundSessions[number];
   if(action==='urgent-prompt')s.inboundSessions[number]={staffId:person.id,expiresAt:ctx.now+15*60000,requestedAt:ctx.iso};
  }else if(s.inboundSessions[number]?.expiresAt>ctx.now&&s.inboundSessions[number].staffId===person.id){
   if(p.type!=='text')action='unsupported';
   else{
    if(typeof p.text!=='string'||!p.text.trim()||p.text.length>4096)fail(400,'Type a non-empty urgent message of at most 4096 characters.');
    const recipients=[...new Set(ctx.urgentSMCIds||[])].filter(id=>ctx.people.some(x=>x.id===id&&x.active));
    const alert={id:ctx.uuid(),key:'urgent-inbound:'+p.messageId,date:ctx.today,createdAt:ctx.iso,recipients,status:recipients.length?'open':'no-urgent-recipient',summary:p.text,senderName:person.name,senderContact:number,origin:'whatsapp-urgent',inboundId:p.messageId};s.smcAlerts.push(alert);
    const parts=urgentMessageParts(p.text);
    for(const recipient of recipients)parts.forEach((part,i)=>queue(s,ctx,'urgent_forward',recipient,ctx.today,{templateKey:'urgent_forward',audience:ctx.inboxMode?'duty-smc':'urgent-smc',originalMessage:part,senderName:person.name,senderContact:number,summary:part,inboundId:p.messageId,...(parts.length>1?{partNumber:i+1,partCount:parts.length}:{})},null,'urgent-forward:'+p.messageId+':'+recipient+(parts.length>1?':part:'+(i+1):'')));
    allocation().addAudit(s,ctx,'urgent-message-recorded',{date:ctx.today,inboundId:p.messageId,staffId:person.id,recipientIds:recipients});delete s.inboundSessions[number];action=recipients.length?'urgent-confirm':'urgent-no-recipient';
   }
  }
  entry.action=action;return {receiptId:entry.id,replyClaimId:entry.replyClaimId,reply:{action,to:number,text},queued:s.outbox.filter(j=>j.data?.inboundId===p.messageId).length};
 }
 function availabilityView(s,ctx,p){
  const d=date(p.date||ctx.today),dd=day(ctx,d),complete=p.complete===true,confirmed=dd.schoolDay===true&&dd.verified!==false,external=new Set(s.adhoc.filter(a=>a.date===d&&!a.deletedAt).map(a=>a.staffId)),people=ctx.people.filter(x=>allocation().reliefCandidateEligible(x)&&(x.active||external.has(x.id))),selected=people.filter(x=>complete||Array.isArray(p.staffIds)&&p.staffIds.includes(x.id)),teachers=confirmed&&selected.length?allocation().teacherContext(s,ctx,d):null,mapped=new Map((dd.teacherIdentities||dd.teachers).map(t=>[t.staffId,t]));
  return {revision:s.revision,allocationRevision:s.dayRevisions?.[d]||0,date:d,checkedAt:ctx.iso,complete,confirmed,warning:dd.warning||'',timetableId:dd.id,parity:dd.parity,people:people.map(x=>({id:x.id,name:x.name,timetableName:mapped.get(x.id)?.timetableName||mapped.get(x.id)?.name||null,active:x.active,external:external.has(x.id)})),periods:dd.periods.map(t=>({...t,available:confirmed?selected.filter(x=>allocation().eligibility(teachers.get(x.id),t.period).available).map(x=>({id:x.id,name:x.name})):[]}))};
 }
 function pruneSelection(s,range,now){
  const retained=new Set([...Object.values(s.privateLinks||{}),...s.outbox.map(j=>({date:j.date,expiresAt:j.linkExpiresAt||Date.parse(j.createdAt)+7*86400000}))].filter(link=>link.expiresAt>now).map(link=>link.date));
  const inRange=x=>x.date>=range.from&&x.date<=range.to&&!retained.has(x.date),A=allocation(),removed=new Set([...s.assignments,...s.importedRelief].filter(x=>inRange(x)||inRange(A.corrected(s,x))).map(x=>x.id)),lists={},maps={};
  for(const key of ['absences','adhoc','requests','outbox','staplerPlans','staplerRequests','staplerArchives','smcAlerts','smcDutyRoster','recessActivations','dailyEmploymentSnapshots','dailyEmploymentMail'])lists[key]=s[key].filter(inRange);
  // Ongoing active and paused policies survive pruning of their legacy origin dates.
  lists.customInstructions=s.customInstructions.filter(x=>x.deletedAt&&inRange(x));
  if(Array.isArray(s.smcDutyLists)){const retainedOwners=new Set(s.smcDutyRoster.filter(r=>!inRange(r)).map(r=>r.dutyListId)),removedOwners=new Set(lists.smcDutyRoster.map(r=>r.dutyListId));lists.smcDutyLists=s.smcDutyLists.filter(r=>!retainedOwners.has(r.id)&&(removedOwners.has(r.id)||r.endDate>=range.from&&r.endDate<=range.to));}
  for(const key of ['assignments','importedRelief'])lists[key]=s[key].filter(x=>removed.has(x.id));
  for(const key of ['reliefCorrections','rotationEvents'])lists[key]=s[key].filter(x=>removed.has(x.assignmentId));
  lists.entitlements=s.entitlements.filter(x=>x.week>=range.from&&A.addDays(x.week,4)<=range.to);
  lists.publicationSnapshots=s.publicationSnapshots.filter(x=>inRange(x)||removed.has(x.assignmentId));
  const removedSnapshots=new Set(lists.publicationSnapshots),retainedSnapshots=new Set(s.publicationSnapshots.filter(x=>!removedSnapshots.has(x)).map(x=>x.id));lists.acknowledgements=s.acknowledgements.filter(x=>x.timetableNoticeId?inRange(x):!retainedSnapshots.has(x.snapshotId));
  for(const key of ['dayRevisions','manualAuditBaselines','massPublications','dailyPublicationStates','dailyEmploymentAutomatic'])maps[key]=Object.keys(s[key]||{}).filter(d=>inRange({date:d}));
  maps.cellDecisionVersions=Object.keys(s.cellDecisionVersions||{}).filter(key=>inRange(s.cellDecisionVersions[key]));
  const prunableAudit=x=>{if(!inRange(x))return false;if(x.auditExportSuppressed===true)return true;const record=s.allocationAuditExports?.[x.date];return x.auditExportCaptured===true&&Number.isInteger(x.auditExportVersion)&&x.auditExportVersion>0&&!!record?.archiveFileId&&record.archiveVersion>=x.auditExportVersion&&record.exportedVersion>=x.auditExportVersion;};
  lists.audit=s.audit.filter(prunableAudit);lists.optimisationRuns=s.optimisationRuns.filter(prunableAudit);return {lists,maps};
 }
 // Read-only size of each top-level record collection, for Admin capacity review.
 // Characters approximate the saved JSON; nothing is changed or removed. The
 // host's storageView supplies the stored (compressed) form, so lazy history is never inflated.
 function storageReport(state,ctx){
  const s=typeof ctx.storageView==='function'?ctx.storageView(state):state,size=v=>{try{return JSON.stringify(v)?.length||0;}catch{return 0;}},breakdown=(rows,key)=>{const m=new Map();for(const row of rows||[]){const k=String(row?.[key]||'other');m.set(k,(m.get(k)||0)+size(row));}return [...m].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,chars])=>({name,chars}));};
  const collections=Object.entries(s).map(([name,value])=>({name,chars:size(value),items:Array.isArray(value)?value.length:value&&typeof value==='object'?Object.keys(value).length:1})).sort((a,b)=>b.chars-a.chars);
  return {total:collections.reduce((n,c)=>n+c.chars,0),limit:ctx.storageMaxChars||null,collections,audit:breakdown(s.audit,'operation'),outbox:breakdown(s.outbox,'kind')};
 }
 function pruneRange(p){const from=date(p.from),to=date(p.to);if(to<from)fail(400,'The end date must follow the start.');return {from,to};}
 function read(s,ctx,p){if(p.operation==='read'&&p.view==='allocationLearning')return allocationLearningView(s,ctx);if(p.operation==='currentDuty'||p.operation==='read'&&p.view==='currentDuty')return currentDuty(s,ctx);operationalSettings(allocation().ensure(s));const op=p.operation;if(op==='teacherDailyUpdate')return teacherDailyUpdate(s,ctx,p);if(op==='nameBridges')return nameBridgesView(s,ctx);if(op==='dailyNotify')return dailyNotifyView(s,ctx,p);if(op==='systemConfig')return systemConfigView(s,ctx);if(op==='dailyEmployment')return dailyEmploymentView(s,ctx,p);if(op==='staplerDates')return staplerDatesView(s,ctx);if(op==='previewRestoreStapler')return previewRestoreStapler(s,ctx,p);if(op==='timetableDay')return timetableDay(s,ctx,p);if(op==='dailyTimetable')return dailyTimetable(s,ctx,p);if(op==='dutyRoster')return dutyRosterView(s,ctx,p);if(op==='stapler')return staplerView(s,ctx,p);if(op==='history')return notificationHistory(s,ctx,p);if(op==='exportDaily')return dailyExport(s,ctx,p);if(op==='allocation'){smc(ctx);return view(s,ctx,{...p,view:'allocation'});}if(op==='health')return healthRead(s,ctx,p);if(op==='accounting'){smc(ctx);return {revision:s.revision,entitlements:copy(s.entitlements),importedRelief:copy(s.importedRelief),profiles:copy(s.accountingProfiles),years:copy(s.accountingYears),corrections:copy(s.reliefCorrections),dutySMC:copy(s.smcDutyRoster),smcPeople:ctx.people.filter(x=>(ctx.smcIds||[]).includes(x.id)).map(({id,name})=>({id,name}))};}if(op==='availability')return availabilityView(s,ctx,p);if(op==='candidates'){
  if(p.previewAbsence!==undefined)return previewAbsenceCandidates(s,ctx,p);
  let source;const project=ids=>{const ds=demandChoices(ctx,s).filter(d=>ids.includes(d.id)),combine=ds.length===1&&p.purpose==='mutual'?new Map(allocation().manualRanks(allocation().manualModel(s,ctx,ds[0].date),ds[0]).map(c=>[c.staffId,c.combineAllowed&&!c.peerReserved])):new Map();return candidates(s,ctx,ids,source).map(x=>p.purpose==='mutual'?{...x,available:x.available&&(x.external||!x.warnings.length),combineAllowed:combine.get(x.staffId)===true}:x).map(x=>(ctx.user.smc||ctx.user.admin)&&p.byPeriod!==true?x:{staffId:x.staffId,name:x.name,available:x.available,reasons:x.reasons,external:x.external,combineAllowed:x.combineAllowed===true});};
  if(p.byPeriod===true){
   if(p.purpose!=='mutual')fail(400,'Per-period candidates are available only for colleague arrangements.');
   const ds=findDemands(s,ctx,p.demandIds),d=ds[0].date,dd=day(ctx,d),groups=new Map();
   if(!(ctx.user.smc||ctx.user.admin)&&ds.some(d=>d.staffId!==ctx.user.staffId))fail(403,'Select your own affected lessons.');
   if(p.includeTimetable===true&&dd.staplerRevision&&!(ctx.user.smc||ctx.user.admin)){const confirmed=confirmedStaplerSnapshot(s.staplerPlans.find(r=>r.date===d),s.audit);if(!confirmed||confirmed.revision!==dd.staplerRevision)fail(409,'Your absence is still saved. The school timetable has updates awaiting confirmation. Ask SMC to confirm them, then refresh availability.','TIMETABLE_CONFIRMATION_REQUIRED');}
   source=allocation().teacherSource(ctx,d);
   for(const dem of ds){if(!groups.has(dem.period))groups.set(dem.period,[]);groups.get(dem.period).push(dem.id);}
   const candidatesByPeriod=Object.fromEntries([...groups].map(([period,ids])=>[period,project(ids)])),result={revision:s.revision,date:d,timetableId:dd.id,parity:dd.parity,staplerRevision:dd.staplerRevision||0,candidatesByPeriod,quotaUnits:'periods/week'};
   if(p.includeTimetable===true){
    // Reuse this authorised candidate context: no second full-day read and no
    // colleague quotas, contact details or private attendance records in the grid.
    const teachers=dd.teachers.map(({staffId,name,cells})=>({staffId,name,cells:cells.map(c=>stapler().isOfflineAbsence(String(c[0]||'').replace(/[\r\n\u2028\u2029]/g,' '))?['Absent',...c.slice(1)]:copy(c))})),known=new Set(teachers.map(t=>t.staffId));
    for(const candidate of Object.values(candidatesByPeriod).flat())if(candidate.external&&!known.has(candidate.staffId)){known.add(candidate.staffId);teachers.push({staffId:candidate.staffId,name:candidate.name,cells:dd.periods.map(()=>['','','',''])});}
    result.timetable={id:dd.id,parity:dd.parity,staplerRevision:dd.staplerRevision||0,periods:copy(dd.periods),teachers};
   }
   return result;
  }
  return {revision:s.revision,candidates:project(p.demandIds||[]),quotaUnits:'periods/week'};
 }if(op==='audit'){if(!(ctx.user.smc||ctx.user.admin))fail(403,'SMC or Admin access is required.');return {revision:s.revision,audit:copy(s.audit.filter(x=>!p.date||x.date===p.date).slice(-500))};}if(op==='prunePreview'){admin(ctx);const r=pruneRange(p);if(r.to>=ctx.today)fail(400,'Prune only past dates.');const selection=pruneSelection(s,r,ctx.now),counts=Object.fromEntries(Object.entries({...selection.lists,...selection.maps}).map(([key,rows])=>[key,rows.length]));return {revision:s.revision,counts,count:Object.values(counts).reduce((a,b)=>a+b,0),storage:storageReport(s,ctx)};}if(op==='externalLink'){smc(ctx);staff(ctx,p.staffId);const d=date(p.date);if(!s.adhoc.some(x=>x.staffId===p.staffId&&x.date===d&&!x.deletedAt))fail(403,'Activate this external teacher for the selected date first.');return {revision:s.revision,capability:ensurePrivateLink(s,ctx,p.staffId,d)};}return view(s,ctx,p);}
 return {timetableBaseline,ownAnnualRelief,releasedPeerLessons,queuePeerReleaseNotices,shortPublicationSummary,allocationMode,allocationLearningView,communicationState,communicationProjection,acknowledgeCommunication,previewRestoreStapler,mergeSubmittedInstructions,resubmissionIntervals,subtractAbsenceIntervals,absenceDates,absenceStaffIds,cellProvenance,essentialDecisionAudit,schoolAbsencesRange,schoolAbsencesView,currentDuty,manualRecoveryDemands,teacherDailyUpdate,confirmedStaplerSnapshot,confirmedStaplerProjection,mayViewConfirmed,mergeStaplerPlans,staplerPlanPatch,applyStaplerPlanPatch,ensurePrivateLink,cellDecision,cellDecisions,returnAutomatic,dailyNoticeState,publishedContentFingerprint,latestPublications,timetableNotice,pendingSummary,defaultSmcSummaryTimes,normalizeSmcSummaryTimes,smcSummarySlot,summaryAbsences,scheduledSummaryCurrent,staplerPermission,teacherSponsor,dutyEligible,absenceEligible,seedNameBridges,matchTimetableNames,nameBridgesView,readyStaplerPlan,dailyNotifyView,notifyDaily,operationalSettings,normalizeNoReliefSubjects,matchesNoReliefSubject,systemConfigView,dailyEmploymentView,queueDailyEmployment,employmentEmail,staplerDatesView,absentTeacherContact,refreshStaplerNotifications,timetableDay,dailyTimetable,clock,dutyWindow,dutyRosterView,staplerView,staplerApply,composeStaplerContext,publishAudit,recessActiveOn,recessGroups,recessSettingsApply,availabilityView,cellSourceKey,allocationCellView,notificationReadinessView,reportFormView,reportView,inboundMessage,queue,smcAlert,notificationIndex,notificationCurrent,matchingCustom,queueConditional,publicationSummary,recessDemand,recessView,recessApply,recessPeriods,publicDuty,dailyExport,noReliefApply,publishDay,acknowledgePublications,notificationHistory,acknowledgementView,syncLessonInstructions,customApply,customText,primaryLevel,allocationProjection,manualApply,assignmentInstructions,allocation,scheduledTick,dutySMC,healthRead,updateHealthWarnings,releaseAssignment,publicationSnapshot,queuePublication,pendingPublications,initial,validateState,defaults,dates,date,mobile,needsCover,previewAbsence:lessons,availability,demand,candidates,apply,read,view,reconcile,invalidate,READS};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISRosterOperations;
