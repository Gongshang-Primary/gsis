/* GSiS relief accounting and deterministic allocation. No I/O, timers or authority supplied by the browser.
   Quantities are numbered timetable periods. A green bar is an individual opportunity, not an independent R unit. */
var GSISRosterAllocation = (() => {
  'use strict';
  const DAY=86400000, EPS=1e-9, LIVE=new Set(['draft','published','completed']);
  const clone=x=>JSON.parse(JSON.stringify(x));
  const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
  const preferenceRules=Object.freeze([
    {id:'annualUtilisation',label:'Lower annual R utilisation',description:'Balance annual relief against recorded R entitlement; candidates within one percentage point share a band.'},
    {id:'alternatives',label:'Fewer alternative relief periods',description:'Keep teachers with more eligible periods available for other lessons.'},
    {id:'weeklyRemaining',label:'More weekly R remaining',description:'Prefer greater unused weekly R, within the employment cap.'},
    {id:'rotation',label:'Rotation order',description:'Prefer teachers not yet selected automatically, then the least recently selected.'},
    {id:'levelMatch',label:'Same teaching level',description:'Prefer teachers who teach the lesson’s primary level in the verified baseline timetable.'},
    {id:'subjectMatch',label:'Same teaching subject',description:'Prefer the same configured subject family, using the precise Deploy teaching-group subject when available.'}
  ].map(Object.freeze));
  function preferenceOrder(value){
    if(value===undefined)return preferenceRules.map(r=>r.id);
    const legacy=preferenceRules.slice(0,4).map(r=>r.id);
    if(Array.isArray(value)&&value.length===legacy.length&&new Set(value).size===legacy.length&&value.every(id=>legacy.includes(id)))return [...value,'levelMatch','subjectMatch'];
    if(!Array.isArray(value)||value.length!==preferenceRules.length||new Set(value).size!==preferenceRules.length||value.some(id=>!preferenceRules.some(r=>r.id===id)))fail(400,'Allocation preferences must include each rule exactly once.');
    return value.slice();
  }
  const workloadRules=Object.freeze([
    {id:'dailyTotal',field:'maxDailyPeriods',label:'Maximum total daily periods',defaultValue:9},
    {id:'adhocDailyTotal',field:'adhocReliefMaxPeriods',label:'Ad hoc relief max periods',defaultValue:10},
    {id:'consecutive',field:'maxConsecutivePeriods',label:'Maximum consecutive periods',defaultValue:6},
    {id:'dailyRelief',field:'maxDailyReliefPeriods',label:'Maximum relief periods per day (non-SRE)',defaultValue:3,defaultEnabled:false,maxValue:17}
  ].map(Object.freeze));
  function ruleToggles(value={}){
    const ids=[...preferenceRules,...workloadRules].map(r=>r.id);
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(id=>!ids.includes(id)||typeof value[id]!=='boolean'))fail(400,'Set each allocation rule to On or Off.');
    return Object.fromEntries(ids.map(id=>[id,value[id]??workloadRules.find(rule=>rule.id===id)?.defaultEnabled??true]));
  }
  function workloadLimits(config={}){
    const enabled=ruleToggles(config.allocationRuleEnabled),out={};
    for(const rule of workloadRules){const value=config[rule.field]===undefined?rule.defaultValue:config[rule.field],max=rule.maxValue??40;if(!Number.isInteger(value)||value<1||value>max)fail(400,'Workload limits must be whole periods from 1 to '+max+'.');out[rule.id]=enabled[rule.id]?value:null;}
    return out;
  }
  function compareCost(a,b){if(!Array.isArray(a)&&!Array.isArray(b))return Math.abs(a-b)<=EPS?0:a<b?-1:1;const aa=Array.isArray(a)?a:[a],bb=Array.isArray(b)?b:[b];for(let i=0;i<Math.max(aa.length,bb.length);i++){const x=aa[i]||0,y=bb[i]||0;if(x===y)continue;if(Math.abs(x-y)>EPS)return x<y?-1:1;}return 0;}
  function addCost(a,b){if(a===0)return b;if(b===0)return a;if(!Array.isArray(a)&&!Array.isArray(b))return a+b;const aa=Array.isArray(a)?a:[a],bb=Array.isArray(b)?b:[b],out=[];for(let i=0;i<Math.max(aa.length,bb.length);i++)out.push((aa[i]||0)+(bb[i]||0));return out;}
  function improvesCost(a,b,current){
    if(current===null)return true;if(a===0)return compareCost(b,current)<0;if(b===0)return compareCost(a,current)<0;
    if(!Array.isArray(a)&&!Array.isArray(b))return compareCost(a+b,current)<0;
    const aa=Array.isArray(a)?a:[a],bb=Array.isArray(b)?b:[b],cc=Array.isArray(current)?current:[current];
    for(let i=0;i<Math.max(aa.length,bb.length,cc.length);i++){const difference=(aa[i]||0)+(bb[i]||0)-(cc[i]||0);if(Math.abs(difference)>EPS)return difference<0;}return false;
  }
  const negateCost=x=>Array.isArray(x)?x.map(v=>-v):-x;
  // Compare weekly SRE headroom with annual staff utilisation on the same scale.
  // Historical SRE entitlement remains visible, but never sets a ranking key.
  const rankingUtilisation=(r,remaining=r.remaining)=>r.sreMode==='long-term'?(Number.isFinite(r.R)&&r.R>0&&Number.isFinite(remaining)?100*(r.R-remaining)/r.R:null):r.annual;
  const preferenceValues=r=>r.dailyRoster?{annualUtilisation:[0,0],alternatives:[0],weeklyRemaining:[0],rotation:[0],subjectMatch:[0],levelMatch:[0]}:({annualUtilisation:[Number.isFinite(r.fairnessBand)?0:1,Number.isFinite(r.fairnessBand)?r.fairnessBand:0],alternatives:[r.alternatives],weeklyRemaining:[-(r.remaining??0)],rotation:[r.rotation],subjectMatch:[r.subjectPenalty||0],levelMatch:[r.levelPenalty||0]});
  const orderedValues=(values,order)=>order.flatMap(id=>values[id]);
  const norm=x=>String(x||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
  const addDays=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*DAY).toISOString().slice(0,10);
  const monday=d=>addDays(d,-((new Date(d+'T12:00:00Z').getUTCDay()+6)%7));
  const year=d=>d.slice(0,4);
  const occupied=c=>Array.isArray(c)&&c.some(x=>String(x||'').trim());
  const subjectCode=x=>norm(x).replace(/\s+\((?:for|swapped w\/) .+\)$/,'').replace(/\s*\([^)]*\)\s*$/,'').trim();
  function normalizeSubjectPatterns(rules){
    if(!Array.isArray(rules)||rules.length>200)fail(400,'Choose at most 200 subject rules.');
    const seen=new Set();return rules.map(row=>{if(!row||!['exact','wildcard'].includes(row.type))fail(400,'Choose an exact subject or wildcard rule.');if(typeof row.value!=='string'||row.value.length>100)fail(400,'Use a subject rule of at most 100 characters.');const value=row.value.trim().replace(/\s+/g,' ');if(!value||row.type==='wildcard'&&!value.includes('*'))fail(400,'Use * only in a wildcard rule.');const key=row.type+':'+norm(value);if(seen.has(key))return null;seen.add(key);return {type:row.type,value};}).filter(Boolean);
  }
  function matchesSubjectPattern(subject,rules=[]){
    const value=norm(subject);return rules.some(row=>{const pattern=norm(row.value);if(row.type==='exact')return value===pattern;
      // Bounded glob matching; user patterns are never regular expressions.
      let i=0,j=0,star=-1,retry=0;while(i<value.length){if(j<pattern.length&&pattern[j]===value[i]){i++;j++;}else if(pattern[j]==='*'){star=j++;retry=i;}else if(star>=0){j=star+1;i=++retry;}else return false;}while(pattern[j]==='*')j++;return j===pattern.length;
    });
  }
  const countsConsecutive=(t,lesson)=>!t.consecutiveExcludedDemands?.has(lesson.demandId)&&!matchesSubjectPattern(lesson.subject,t.consecutiveCountExclusions);
  function consecutivePeriods(t,added=[],workload=false){return new Set([...(workload?t.consecutiveWorkloadBase||t.workloadBase||t.base:t.consecutiveBase||t.base),...(t.consecutiveAssigned||t.assigned),...added.filter(a=>countsConsecutive(t,a)).map(a=>a.period)]);}
  // Relief-period limits count held slots, independently of R cost or own work.
  // Imported slots stay separate so manual replacements can rebase assigned work.
  function heldReliefPeriods(t,added=[]){return new Set([...(t.importedReliefPeriods||[]),...t.assigned,...added.map(a=>typeof a==='number'?a:a.period)].filter(p=>Number.isInteger(p)&&p>=0&&p<t.periodCount));}
  function defaultConsecutiveSubjectRules(){return [{subject:'PAL',periods:3}];}
  function normalizeConsecutiveSubjectRules(rows=defaultConsecutiveSubjectRules()){
    if(!Array.isArray(rows)||rows.length>50)fail(400,'Choose at most 50 consecutive subject rules.');
    const seen=new Set();return rows.map(row=>{
      if(!row||typeof row.subject!=='string'||!row.subject.trim()||row.subject.length>100||!Number.isInteger(row.periods)||row.periods<2||row.periods>40)fail(400,'Each consecutive subject rule needs a subject and a whole number of periods from 2 to 40.');
      const subject=subjectCode(row.subject).toUpperCase();if(!subject||seen.has(subject))fail(400,'Use each subject only once in consecutive subject rules.');seen.add(subject);return {subject,periods:row.periods};
    });
  }
  function defaultSubjectFamilies(){return [{id:'chinese',name:'Chinese',subjects:['CL','HCL','FCL'],reliefRequired:true},{id:'malay',name:'Malay',subjects:['ML','HML','FML'],reliefRequired:true},{id:'tamil',name:'Tamil',subjects:['TL','HTL','FTL'],reliefRequired:false}];}
  function normalizeSubjectFamilies(rows=defaultSubjectFamilies()){
    if(!Array.isArray(rows)||rows.length>50)fail(400,'Choose at most 50 subject families.');const ids=new Set(),codes=new Set();
    return rows.map(row=>{if(!row||typeof row.id!=='string'||!/^[a-z][a-z0-9_-]{0,79}$/.test(row.id)||ids.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>80||typeof row.reliefRequired!=='boolean'||!Array.isArray(row.subjects)||!row.subjects.length||row.subjects.length>100)fail(400,'Each subject family needs a unique ID, name, subjects and relief setting.');ids.add(row.id);const subjects=row.subjects.map(value=>{if(typeof value!=='string'||!value.trim()||value.length>100)fail(400,'Enter a valid subject code.');const code=value.normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();if(codes.has(code))fail(400,'Each subject code can belong to only one family.');codes.add(code);return code;});return {id:row.id,name:row.name.trim(),subjects,reliefRequired:row.reliefRequired};});
  }
  function normalizeTeachingGroupOverrides(rows=[],families=defaultSubjectFamilies()){
    if(!Array.isArray(rows)||rows.length>2000)fail(400,'Choose at most 2000 teaching-group overrides.');const ids=new Set(),familyIds=new Set(families.map(f=>f.id));
    return rows.map(row=>{if(!row||typeof row.groupId!=='string'||!row.groupId.trim()||row.groupId.length>200||ids.has(row.groupId))fail(400,'Choose a unique Deploy teaching group for each override.');ids.add(row.groupId);if(row.familyId!==undefined&&!familyIds.has(row.familyId))fail(400,'Choose an existing subject family for the teaching group.');if(row.reliefRequired!==undefined&&typeof row.reliefRequired!=='boolean')fail(400,'Choose whether the teaching group requires relief.');return {groupId:row.groupId,...(row.familyId!==undefined?{familyId:row.familyId}:{}),...(row.reliefRequired!==undefined?{reliefRequired:row.reliefRequired}:{})};}).filter(row=>row.familyId!==undefined||row.reliefRequired!==undefined);
  }
  function subjectResolver(groups=[],config={}){
    const families=config.subjectFamilies??defaultSubjectFamilies(),bySubject=new Map(families.flatMap(f=>f.subjects.map(code=>[subjectCode(code),f]))),byFamily=new Map(families.map(f=>[f.id,f])),overrides=new Map((config.teachingGroupOverrides||[]).map(r=>[r.groupId,r])),byId=new Map(),byName=new Map();
    for(const group of groups){if(!byId.has(group.id))byId.set(group.id,[]);byId.get(group.id).push(group);const name=norm(group.name);if(!byName.has(name))byName.set(name,[]);byName.get(name).push(group);}
    const broad={mtl:['cl','ml','tl','hcl','hml','htl','fcl','fml','ftl'],hmtl:['hcl','hml','htl'],fmtl:['fcl','fml','ftl']};
    return lesson=>{const code=subjectCode(lesson.subject),ids=lesson.groupIds?.length?lesson.groupIds:lesson.groupId?[lesson.groupId]:[],matches=ids.length===1?byId.get(ids[0])||[]:ids.length?[]:byId.get(lesson.groupName||lesson.group)||byName.get(norm(lesson.groupName||lesson.group))||[],group=matches.length===1?matches[0]:null,groupCode=subjectCode(group?.subject),direct=bySubject.get(code),groupFamily=bySubject.get(groupCode),compatible=!!groupCode&&(code===groupCode||broad[code]?.includes(groupCode)||!!direct&&direct.id===groupFamily?.id),resolved=compatible?group:null,subject=resolved?groupCode:code,override=resolved?overrides.get(resolved.id):null,family=override?.familyId?byFamily.get(override.familyId):bySubject.get(subject);
      return {subject,key:family?'family:'+family.id:broad[subject]?'':subject,familyId:family?.id||null,familyName:family?.name||null,groupId:resolved?.id||null,reliefRequired:override?.reliefRequired??family?.reliefRequired??true};};
  }
  function lessonSubject(lesson,groups=[],config={}){return subjectResolver(groups,config)(lesson);}
  function lessonLevels(lesson,classes=[],groups=[]){
    const levels=new Set(),add=value=>{const n=Number(value);if(Number.isInteger(n)&&n>=1&&n<=6)levels.add(n);};
    add(lesson.level);for(const n of lesson.levels||[])add(n);
    for(const [value,catalogue] of [[lesson.className,classes],[lesson.groupName,groups]])for(const label of String(value||'').split(/[,;\n/]+/)){
      const matches=catalogue.filter(row=>norm(row.name)===norm(label));
      if(matches.length===1){add(matches[0].level);for(const n of matches[0].levels||[])add(n);}
      const m=/^(?:(?:primary|pri|p)\s*)?([1-6])(?:\s*[-.]?\s*[a-z][a-z0-9 '-]*)?$/i.exec(label.trim());if(m)add(m[1]);
    }
    for(const id of lesson.groupIds||[])for(const row of groups.filter(g=>g.id===id)){add(row.level);for(const n of row.levels||[])add(n);}
    return [...levels].sort((a,b)=>a-b);
  }
  function teachingProfile(cells,classes=[],groups=[],categories={},config={}){
    const S=typeof GSISRosterStapler!=='undefined'?GSISRosterStapler:require('./roster-stapler.js'),classify=S.activityClassifier(categories),resolve=subjectResolver(groups,config),subjects=new Set(),levels=new Set(),subjectLessons=new Map();
    for(const cell of cells||[]){const activity=classify({subject:String(cell[0]||'').normalize('NFKC'),classIds:cell[1]?[cell[1]]:[],group:cell[3]});if(activity.kind!=='teaching'||!activity.known)continue;const lesson={subject:cell[0],groupName:cell[3]},policy=resolve(lesson);subjects.add(policy.key);if(policy.familyId||!policy.key){if(policy.groupId)lesson.groupIds=[policy.groupId];subjectLessons.set(JSON.stringify(lesson),lesson);}for(const level of lessonLevels({className:cell[1],groupName:cell[3]},classes,groups))levels.add(level);}
    return {subjects:[...subjects].filter(Boolean).sort(),levels:[...levels].sort((a,b)=>a-b),...(subjectLessons.size?{subjectLessons:[...subjectLessons.values()]}:{})};
  }
  // R and the employment cap are independent hard limits, including historical R overrides.
  // A suspended timetable skips the workload formula, never these allocation rules.
  function deploymentTeachingEvidence(quota,d){return {verified:quota?.teachingEvidenceVersion===1&&!!quota.source?.versionId&&d>=quota.from&&d<=quota.to,rows:(quota?.rows||[]).map(r=>({id:r.id,periods:r.teachingPeriods,verified:r.teachingVerified===true}))};}
  function sreBasis(person,evidence){
    if(!String(person?.employment||'').split(/[,;]/).some(p=>p.trim().toUpperCase()==='SRE'))return null;
    if(!evidence?.verified||!Array.isArray(evidence.rows))return 'unknown';const rows=evidence.rows.filter(r=>r.id===person.id);
    if(rows.length>1||rows.length===1&&(!rows[0].verified||!Number.isFinite(rows[0].periods)||rows[0].periods<0))return 'unknown';
    return !rows.length||rows[0].periods===0?'daily':'long-term';
  }
  function rosterBasis(ctx,d,id){return sreBasis((ctx.people||[]).find(p=>p.id===id),(ctx.baselineDays?.[d]||ctx.days?.[d])?.deployTeachingEvidence);}
  function dailyRosterCalculation(data,person){const basis=sreBasis(person,data.deployTeachingEvidence);if(!basis)return data;if(basis!=='daily')return {...data,reliefBasis:basis};return {...data,reliefBasis:basis,calculation:null,calculationReason:'Daily roster, no R%',completion:{...data.completion,dailyRoster:true,entitlement:null,percentage:null,reason:'Daily roster, no R%'}};}
  const srePriority=r=>r.dailyRoster?[0,r.dailyPeriods||0,r.rotation??-1]:[1,0,0];
  function allocationCapacity(t){const b=t.balance,capped=b.capConfigured===true||b.periodCap!==null&&b.periodCap!==undefined;return Math.max(0,Math.floor(Math.min(t.dailyRoster?t.periodCount:b.remaining||0,capped?(b.capVerified===true&&Number.isFinite(b.capRemaining)?b.capRemaining:0):Infinity)));}
  const cost=a=>a.noRelief||a.remove||a.combination||a.repurposedDuty?0:Number.isFinite(a.rCost)?Math.max(0,a.rCost):1;
  const active=a=>LIVE.has(a.status)&&!a.remove;
  const protectedAssignment=a=>a.status==='published'||a.status==='completed'||a.protected===true||a.mutual===true||a.origin!=='automatic';
  function sameVenue(a,b){const parts=x=>String(x||'').normalize('NFKC').split(/[,;\n/]+/).map(v=>norm(v).replace(/\s+/g,'')).filter(Boolean),left=new Set(parts(a));return parts(b).some(v=>left.has(v));}
  function validateAccounting(s){
    const own=k=>Object.prototype.hasOwnProperty.call(s,k),record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
    for(const k of ['entitlements','importedRelief','reliefCorrections'])if(own(k)&&!Array.isArray(s[k]))fail(503,'Annual relief accounting records could not be read. Restore the last verified records before allocating.');
    if(own('accountingYears')&&(!record(s.accountingYears)||Object.entries(s.accountingYears).some(([key,value])=>!/^20\d\d$/.test(key)||!record(value)||typeof value.verified!=='boolean')))fail(503,'Annual relief accounting status could not be read. Restore the last verified records before allocating.');
  }
  function ensure(s){
    validateAccounting(s);
    for(const k of ['entitlements','reliefCorrections','importedRelief','rotationEvents','optimisationRuns','smcDutyRoster','smcAlerts','publicationSnapshots','acknowledgements','customInstructions','recessActivations','inboundEvents','staplerPlans','staplerRequests','staplerArchives'])if(!Array.isArray(s[k]))s[k]=[];
    for(const k of ['healthWarningState','dayRevisions','accountingProfiles','accountingYears','scheduleReceipts','notificationWatermarks','inboundSessions','manualAuditBaselines','massPublications','manualDecisions','privateLinks'])if(!s[k]||typeof s[k]!=='object'||Array.isArray(s[k]))s[k]={};
    for(const a of s.assignments){if(!a.origin)a.origin=a.mutual?'mutual':'smc';if(!Number.isInteger(a.version))a.version=1;if(a.origin!=='automatic')a.protected=true;}
    if(!s.manualDecisionsSchema){for(const a of effectiveAssignments(s,true))if(a.origin==='smc')s.manualDecisions[a.date+'|'+a.demandId]={date:a.date,demandId:a.demandId,kind:a.noRelief?'noRelief':'assignment',absentIds:a.absentIds||[a.absentId],staffId:a.noRelief?null:a.staffId,assignmentId:a.id,actor:a.createdBy||'legacy SMC',at:a.createdAt,period:a.period,sourceKey:a.sourceKey||null};s.manualDecisionsSchema=1;}
    if(!s.publicationSchema){for(const a of s.assignments){if(['published','completed'].includes(a.status)&&!a.noRelief&&!a.remove&&!s.publicationSnapshots.some(v=>v.assignmentId===a.id))s.publicationSnapshots.push({id:'baseline-publication:'+a.id,assignmentId:a.id,revision:1,staffId:a.staffId,date:a.date,period:a.period,kind:'assigned',publishedAt:a.publishedAt||a.createdAt,publishedBy:a.publishedBy||'baseline import',assignment:clone(a),instructions:String(a.instructions||''),customInstructions:String(a.customInstructions||''),migrated:true});}s.publicationSchema=1;}
    s.allocationSchema=1;return s;
  }
  function manualDecision(s,d,id){return s.manualDecisions?.[d+'|'+id]||null;}
  function manualDecisionForDemand(s,dem){const direct=manualDecision(s,dem.date,dem.id);if(direct)return direct;const absent=new Set(dem.absentIds||[dem.staffId]);return manualOwnership(s,dem.date).find(row=>row.period===dem.period&&(row.absentIds||[]).some(id=>absent.has(id)))||null;}
  function manualOwnership(s,d){return Object.values(s.manualDecisions||{}).filter(row=>row.date===d);}
  function effectiveAssignments(s,includeInvalid=false){
    const replaced=new Set(s.assignments.filter(a=>LIVE.has(a.status)&&a.replaces).map(a=>a.replaces));
    return s.assignments.filter(a=>active(a)&&!replaced.has(a.id)&&(includeInvalid||!a.invalidCover));
  }
  function corrected(s,a,latest){const change=latest?latest.get(a.id):(s.reliefCorrections||[]).filter(c=>c.assignmentId===a.id).reduce((last,c)=>!last||c.sequence>=last.sequence?c:last,null);if(!change)return a;const actual=change.actual;return {...a,...actual,accountingPending:false,actualReviewRequired:false,status:actual.completionStatus==='completed'?'completed':actual.completionStatus==='not-completed'?'cancelled':a.status==='completed'?'published':a.status};}
  // Coverage is the durable absence fact; period numbers are a timetable projection.
  // An explicitly supplied empty day must never fall back to an old period map.
  function absencePeriods(a,day){
    if(!a.coverage)return a.periods||[];
    const timing=day?day.periods||[]:a.periodSnapshot||[],coverage=a.coverage;
    if(coverage.kind==='fullDay')return timing.map(p=>p.period);
    const ranges=coverage.kind==='timeRange'?[coverage]:coverage.kind==='timeRanges'?coverage.ranges||[]:[];
    const minute=(value,label)=>Number.isFinite(value)?value:/^\d\d:\d\d$/.test(label||'')?Number(label.slice(0,2))*60+Number(label.slice(3)):null;
    return timing.filter(p=>{const start=minute(p.startMinutes,p.start),end=minute(p.endMinutes,p.end);return start!==null&&end!==null&&ranges.some(r=>start<r.endMinutes&&end>r.startMinutes);}).map(p=>p.period);
  }
  function accounted(s,ctx){
    const effective=effectiveAssignments(s),kept=new Set(effective.map(a=>a.id)),latest=new Map();
    for(const c of s.reliefCorrections||[]){const prior=latest.get(c.assignmentId);if(!prior||c.sequence>=prior.sequence)latest.set(c.assignmentId,c);}
    const slot=(id,date,period)=>JSON.stringify([id,date,period]),absent=new Set(),wholeDays=new Set(),published=new Set();
    for(const a of s.absences)if(!a.deletedAt){if(a.coverage?.kind==='fullDay')wholeDays.add(JSON.stringify([a.staffId,a.date]));const current=ctx?.days?.[a.date],frozen=s.dailyPublicationStates?.[a.date],timing=current&&a.date>=ctx.today?current:frozen?.periods?.length?frozen:undefined;for(const p of absencePeriods(a,timing))absent.add(slot(a.staffId,a.date,p));}
    for(const a of s.assignments)if(['published','completed'].includes(a.status)&&!a.noRelief&&!a.remove)published.add(slot(a.staffId,a.date,a.period));
    const source=[...effective,...s.assignments.filter(a=>!kept.has(a.id)&&(latest.has(a.id)||a.actualReviewRequired&&a.actualStatusBeforeReplacement)).map(a=>a.actualStatusBeforeReplacement&&!latest.has(a.id)?{...a,status:a.actualStatusBeforeReplacement,accountingUnconfirmed:true}:a),...(s.importedRelief||[])],ids=new Set(),out=[];
    for(const original of source){const a=corrected(s,original,latest),key=slot(a.staffId,a.date,a.period);if(a.origin==='stapler'&&(wholeDays.has(JSON.stringify([a.staffId,a.date]))||absent.has(key)||published.has(key)))continue;if(!active(a)||a.invalidCover||a.completionStatus==='not-completed'||a.noRelief||a.remove||!a.staffId||ids.has(a.id))continue;ids.add(a.id);out.push(a);}return out;
  }
  // An empty successfully loaded ledger starts at zero. Existing history remains intact.
  function initialiseHistory(s,ctx,d){
    validateAccounting(s);
    const Y=year(d);if(s.accountingYears?.[Y]?.verified)return false;
    const historical=(s.entitlements||[]).some(r=>r.year===Y&&(r.mode!=='observed'||r.week<monday(ctx.today)))||accounted(s,ctx).some(a=>(a.accountingYear||year(a.date))===Y&&cost(a)>0&&(a.origin==='imported'||a.date<ctx.today||a.status==='completed'||a.completionStatus==='completed'));
    if(historical)return false;
    if(!s.accountingYears)s.accountingYears={};s.accountingYears[Y]={verified:true,mode:'zero-start',at:ctx.iso,by:ctx.user.email,reason:'No annual history exists; counting begins at zero.'};return true;
  }
  // Contacts classifications are separate from application permissions and the
  // broader teaching-load/ad-hoc eligibility rules. Missing timetable is not a category.
  function reliefCandidateEligible(person){
    if(!person)return false;const role=norm(person.role).replace(/^(?:acting|ag)\s+/,'');
    return !String(person.mk||'').trim()&&norm(person.appointmentLevel)!=='sl'&&!(person.groups||[]).some(group=>['mk','oso','sat','sl'].includes(norm(group)))&&!/^(?:sls?|school leaders?|p|vp(?:\b.*)?|principal|vice principal|mk(?:\b.*)?|mke|sat|osos?)$/.test(role);
  }
  // Pool membership is independent of R: missing quota is never an exclusion.
  function mainPoolTeacher(person,teacher){return person?.active===true&&person.adhocEligible!==false&&!!teacher&&teacher.adhoc!==true;}
  function weekQuota(s,ctx,id,d,weeklyQuotas){
    const key=monday(d),row=weeklyQuotas?weeklyQuotas.get(id):(s.entitlements||[]).find(r=>r.staffId===id&&r.week===key&&r.year===year(d)),current=d>=ctx.today&&ctx.quotaRequested===true;
    // The observed ledger is the annual denominator. Current planning uses Deploy's matched
    // daily projection; an unavailable source cannot be replaced by an older observation.
    if(row&&(!current||row.excluded||row.mode==='special-holiday'))return {quota:row.excluded?0:row.quota,source:row.source,verified:true,week:key};
    const t=ctx.days[d]?.teachers.find(t=>t.staffId===id);
    return {quota:Number.isFinite(t?.R)?Math.max(0,t.R):null,source:t?.quotaSource||ctx.days[d]?.quotaSource||null,verified:Number.isFinite(t?.R),week:key};
  }
  function annual(s,ctx,id,accountYear=year(ctx.today)){
    const maxWeek=monday(ctx.today),rows=(s.entitlements||[]).filter(r=>r.staffId===id&&r.year===accountYear&&r.week<=maxWeek),denominator=rows.reduce((n,r)=>n+(r.excluded?0:r.quota),0);
    let completed=0,committed=0;
    for(const a of accounted(s,ctx)){if(a.staffId!==id||(a.accountingYear||year(a.date))!==accountYear)continue;if(reliefCompleted(a,ctx))completed+=cost(a);else committed+=cost(a);}
    const dailyRoster=rosterBasis(ctx,ctx.today,id)==='daily';return {...(dailyRoster?{dailyRoster:true}:{}),entitlement:dailyRoster?null:denominator,completed,committed,spent:completed+committed,utilisation:dailyRoster?null:denominator>0?(completed+committed)/denominator*100:completed+committed===0?0:null,historyVerified:s.accountingYears?.[accountYear]?.verified===true};
  }
  // Employment caps use numbered timetable-period units, exactly as capWorkload
  // and relief rCost do. No clock-duration conversion or guessed week is added.
  function effectiveUTTeacher(s,ctx,d,teacher,person){
    // Contacts identity survives an unavailable/out-of-range Deploy quota row.
    // Missing cap metadata is unknown UT capacity, never an uncapped teacher.
    const contactsUT=String(person?.employment||'').split(/[,;]/).some(value=>value.trim().toUpperCase()==='UT');
    if(contactsUT&&(!teacher||teacher.capBasis!=='total'||teacher.capVerified!==true||!Number.isFinite(teacher.periodCap)||teacher.periodCap<0||!Number.isFinite(teacher.capHeadroom)))return {...teacher,staffId:person.id,capConfigured:true,capBasis:'total',periodCap:teacher?.periodCap??null,capVerified:false,capHeadroom:null,capVerificationReason:'The configured weekly UT employment cap cannot be verified.'};
    if(!teacher||teacher.capBasis!=='total'||teacher.capVerified!==true)return teacher;
    const S=typeof GSISRosterStapler!=='undefined'?GSISRosterStapler:require('./roster-stapler.js'),week=monday(d),days=teacher.capWeekDays;
    if(!Array.isArray(days)||days.length!==5){
      if((s.staplerPlans||[]).some(r=>monday(r.date)===week&&(r.confirmed||r.published)))return {...teacher,capVerified:false,capHeadroom:null,capVerificationReason:'Effective weekly UT workload cannot be verified.'};
      return teacher;
    }
    const cells=[],categories={...(ctx.baselineDays?.[d]||ctx.days[d])?.subjectCategories};
    for(let n=0;n<5;n++){
      const date=addDays(week,n),evidence=days.find(row=>row.date===date);if(!evidence||!Array.isArray(evidence.cells))return {...teacher,capVerified:false,capHeadroom:null,capVerificationReason:'Effective weekly UT workload cannot be verified.'};
      const record=(s.staplerPlans||[]).find(r=>r.date===date),plan=record?.confirmed?(record.confirmedPlan||record.draft||record.published):record?.published;
      let current=clone(evidence.cells),periods=evidence.periods||current.map((_,period)=>({period}));
      if(plan){
        try{const actual=S.effectiveDay(plan);current=clone(actual.teachers.find(t=>t.staffId===teacher.staffId)?.cells||actual.periods.map(()=>['','','','']));periods=actual.periods;Object.assign(categories,plan.subjectCategories||{});
          // Transferred relief is counted by the same durable relief ledger below.
          for(const tile of plan.tiles||[])if(tile.location==='grid'&&tile.kind==='lesson'&&tile.teacherId===teacher.staffId&&tile.source?.teacherId&&tile.source.teacherId!==tile.teacherId)current[tile.period]=['','','',''];
        }catch(_){return {...teacher,capVerified:false,capHeadroom:null,capVerificationReason:'The effective UT timetable requires review.'};}
      }
      for(const absence of s.absences.filter(a=>!a.deletedAt&&a.staffId===teacher.staffId&&a.date===date))for(const p of absencePeriods(absence,{periods}))current[p]=['','','',''];
      cells.push(...current);
    }
    const diagnostics={},workload=S.capWorkload(cells,categories,'total',teacher.capNonTeachingPeriods,diagnostics);
    return {...teacher,capWorkload:workload,capVerified:Number.isFinite(workload),capHeadroom:Number.isFinite(workload)?teacher.periodCap-workload:null,capVerificationReason:diagnostics.reason||null};
  }
  function balances(s,ctx,d){
    const rows=accounted(s,ctx),totals=new Map(),weekly=new Map(),denominators=new Map(),weeklyQuotas=new Map(),week=monday(d),teachers=new Map((ctx.days[d]?.teachers||[]).map(t=>[t.staffId,t])),Y=year(d),through=monday(ctx.today);
    for(const r of s.entitlements||[])if(r.year===Y){if(r.week<=through)denominators.set(r.staffId,(denominators.get(r.staffId)||0)+(r.excluded?0:r.quota));if(r.week===week&&!weeklyQuotas.has(r.staffId))weeklyQuotas.set(r.staffId,r);}
    for(const a of rows){if((a.accountingYear||year(a.date))===Y){const t=totals.get(a.staffId)||{completed:0,committed:0};t[reliefCompleted(a,ctx)?'completed':'committed']+=cost(a);totals.set(a.staffId,t);}if(monday(a.date)===monday(d))weekly.set(a.staffId,(weekly.get(a.staffId)||0)+cost(a));}
    const result=new Map();for(const p of ctx.people){const q=weekQuota(s,ctx,p.id,d,weeklyQuotas),teacher=effectiveUTTeacher(s,ctx,d,teachers.get(p.id),p),capped=teacher?.capConfigured===true||teacher?.periodCap!==null&&teacher?.periodCap!==undefined,v=totals.get(p.id)||{completed:0,committed:0},entitlement=denominators.get(p.id)||0,spent=v.completed+v.committed,used=weekly.get(p.id)||0,dailyRoster=rosterBasis(ctx,d,p.id)==='daily',quota=dailyRoster?null:q.quota;result.set(p.id,{...v,spent,...(dailyRoster?{dailyRoster:true}:{}),entitlement:dailyRoster?null:entitlement,utilisation:dailyRoster?null:entitlement>0?100*spent/entitlement:spent===0?0:null,R:quota,remaining:quota===null?null:quota-used,weeklyUsed:used,periodCap:capped?teacher.periodCap:null,utCap:capped&&teacher.capBasis==='total',capConfigured:capped,capWorkload:capped?teacher.capWorkload:null,capRemaining:capped&&teacher.capVerified===true&&Number.isFinite(teacher.capHeadroom)?teacher.capHeadroom-used:null,capVerified:!capped||teacher.capVerified===true,capVerificationReason:capped?teacher.capVerificationReason||null:null,quotaVerified:q.verified&&quota!==null,historyVerified:s.accountingYears?.[Y]?.verified===true});}return result;
  }
  // Each cross-project decision names the immutable published Deploy snapshot it
  // actually read. These references are evidence, not a distributed writer lock.
  function deploySource(ctx,d){const source=(ctx.baselineDays?.[d]||ctx.days?.[d])?.quotaSource;if(!source)return null;return {service:'deploy',versionId:source.versionId||null,revision:source.revision??null,commit:source.commit||'',calculationVersion:source.calculationVersion||null,from:source.from||'',to:source.to||''};}
  function auditIdConflict(){throw Object.assign(new Error('A new audit event has a conflicting identity.'),{status:409,code:'ROSTER_AUDIT_ID_CONFLICT'});}
  function assertNewAuditIds(before,after){
    const counts=rows=>{const result=new Map();for(const row of rows||[]){const id=String(row.id);result.set(id,(result.get(id)||0)+1);}return result;},old=counts(before);
    for(const [id,count]of counts(after))if(count>1&&count>(old.get(id)||0))auditIdConflict();
  }
  function addAudit(s,ctx,operation,detail={}){
    if(['id','at','actor','operation'].some(key=>Object.prototype.hasOwnProperty.call(detail,key)))auditIdConflict();
    const id=ctx.uuid();if(s.audit.some(row=>String(row.id)===String(id)))auditIdConflict();
    const date=detail.date||ctx.today,source=deploySource(ctx,date),event={...detail,id,at:ctx.iso,date,actor:ctx.user.email,operation,...(source?{deploySource:source}:{}),...(s.systemConfig?.verboseLogging===false?{auditExportSuppressed:true}:{})};s.audit.push(event);return event;
  }
  function bumpDay(s,d){s.dayRevisions[d]=(s.dayRevisions[d]||0)+1;return s.dayRevisions[d];}
  function captureWeek(s,ctx,d){
    ensure(s);const dd=ctx.days[d];if(!dd||dd.schoolDay!==true||dd.verified===false||monday(d)>monday(ctx.today))return false;
    let changed=false;const w=monday(d),Y=year(d);
    for(const t of dd.teachers){const person=ctx.people.find(x=>x.id===t.staffId);if(rosterBasis(ctx,d,t.staffId)==='daily'||!mainPoolTeacher(person,t)||!Number.isFinite(t.originalR??t.R))continue;const existing=s.entitlements.find(r=>r.staffId===t.staffId&&r.week===w&&r.year===Y);
      const service=s.accountingProfiles[t.staffId]||{},end=addDays(w,4);if(service.from&&service.from>end||service.to&&service.to<w)continue;
      // No retrospective guessing: only the current week may be observed from the current published source.
      if(w!==monday(ctx.today))continue;
      const weekdays=[0,1,2,3,4].map(n=>addDays(w,n)).filter(x=>year(x)===Y),extended=s.absences.filter(a=>!a.deletedAt&&a.staffId===t.staffId&&(s.types.find(x=>x.id===a.typeId)?.extendedLeave===true||['parental','hospital','npl'].includes(a.typeId)));
      const wholeLeave=weekdays.length>0&&weekdays.every(key=>extended.some(a=>a.date===key&&(a.coverage?.kind==='fullDay'||dd.periods.every(p=>absencePeriods(a,ctx.days[key]||dd).includes(p.period)))));
      if(existing){if(existing.mode==='observed'&&existing.excluded!==wholeLeave){const before=existing.excluded;existing.excluded=wholeLeave;existing.exclusion=wholeLeave?'Complete week of extended leave':'';addAudit(s,ctx,'weekly-applicability',{date:d,staffId:t.staffId,week:w,before,after:wholeLeave,quota:existing.quota});changed=true;}continue;}s.entitlements.push({id:ctx.uuid(),staffId:t.staffId,week:w,year:Y,quota:Math.max(0,t.originalR??t.R),excluded:wholeLeave,exclusion:wholeLeave?'Complete week of extended leave':'',source:t.quotaSource||dd.quotaSource||{timetableId:dd.id},capturedAt:ctx.iso,parity:dd.parity,mode:'observed'});changed=true;
    }return changed;
  }
  // Capture the same composed days used by the allocator, before any planning.
  // A missing or partially timed day cannot prove a clock advance harmless.
  function prepareClock(ctx,state={},command={}){
    const days=Object.entries(ctx.days||{}),starts=[],cutoffs=[];
    let timed=days.length>0&&days.every(([,day])=>Array.isArray(day.periods)&&day.periods.length>0&&day.periods.every(p=>Number.isFinite(p.startMinutes)&&p.startMinutes>=0&&p.startMinutes<1440));
    for(const [date,day] of days)if(date===ctx.today){
      for(const p of day.periods||[])if(Number.isFinite(p.startMinutes))starts.push(p.startMinutes);
      // End boundaries affect retained absence coverage, relief edits and
      // cumulative fairness, including the last period with no following start.
      const ending=new Set([...(state.assignments||[]),...(state.importedRelief||[])].filter(a=>a.date===date&&(['draft','published'].includes(a.status)||a.actualReviewRequired)&&!a.completionStatus).map(a=>a.period));
      for(const p of day.periods||[])if(command.operation==='saveAbsence'||ending.has(p.period)){
        if(Number.isFinite(p.endMinutes)&&p.endMinutes>=0&&p.endMinutes<=1440)cutoffs.push(Date.parse(date+'T00:00:00+08:00')+p.endMinutes*60000);
        else timed=false;
      }
    }
    for(const r of state.requests||[])if(r.status==='pending'&&!r.retiredAt&&ctx.days?.[r.date]&&Number.isFinite(r.expiresAt))cutoffs.push(r.expiresAt);
    if(command.operation==='scheduledRoster'&&!ctx.skipScheduledAllocation&&state.systemConfig?.scheduledAllocationEnabled)cutoffs.push(Date.parse((command.date||ctx.today)+'T06:30:00+08:00'));
    return {today:ctx.today,minute:ctx.minute,now:ctx.now,timed,starts,cutoffs};
  }
  function preparedClockConflict(prepared,current){
    const conflict=(reasonCode,message)=>({code:'PLANNING_CLOCK_CHANGED',reasonCode,message});
    if(prepared.today!==current.today)return conflict('SCHOOL_DATE_CHANGED','The school date changed while planning; re-run.');
    if(prepared.cutoffs.some(at=>prepared.now<at&&at<=current.now))return conflict('PLANNING_CUTOFF_PASSED','A planning cutoff passed while planning; re-run.');
    if(prepared.minute===current.minute)return null;
    if(!prepared.timed)return conflict('PERIOD_DATA_MISSING','Period times are unavailable and the clock changed while planning; re-run.');
    if(prepared.starts.some(start=>prepared.minute<start&&start<=current.minute))return conflict('PERIOD_STARTED','A period started while planning; re-run.');
    return null;
  }
  function periodStarted(ctx,d,p,snapshot){const start=ctx.days[d]?.periods.find(x=>x.period===p)?.startMinutes;const label=snapshot?.timeStart||snapshot?.start;const n=Number.isFinite(start)?start:/^\d\d:\d\d$/.test(label||'')?Number(label.slice(0,2))*60+Number(label.slice(3)):null;return d<ctx.today||d===ctx.today&&(n===null||ctx.minute>=n);}
  function periodEnded(ctx,d,p,snapshot){const end=ctx.days[d]?.periods.find(x=>x.period===p)?.endMinutes,label=snapshot?.timeEnd||snapshot?.end,n=Number.isFinite(end)?end:/^\d\d:\d\d$/.test(label||'')?Number(label.slice(0,2))*60+Number(label.slice(3)):null;return d<ctx.today||d===ctx.today&&n!==null&&ctx.minute>=n;}
  // Classify counted records without rewriting publication or notification history.
  // Explicit SMC completion corrections take precedence over the school clock.
  function reliefCompleted(a,ctx){if(a.completionStatus)return a.completionStatus==='completed';return a.status==='completed'||a.status==='published'&&periodEnded(ctx,a.date,a.period,a);}
  function assignedPeriods(s,id,d,ignore=new Set()){return new Set(effectiveAssignments(s).filter(a=>a.date===d&&a.staffId===id&&!a.noRelief&&!ignore.has(a.demandId)).map(a=>a.period));}
  // Immutable identity and timetable joins are reused only inside one read projection.
  // Mutable absence, assignment and R state is rebuilt for every candidate/mutation state.
  function teacherSource(ctx,d){
    const dd=ctx.days[d];if(!dd)return null;
    const S=typeof GSISRosterStapler!=='undefined'?GSISRosterStapler:require('./roster-stapler.js'),classify=S.activityClassifier(dd.subjectCategories);
    const phone=v=>{let n=String(v||'').replace(/\D/g,'');if(n.startsWith('00'))n=n.slice(2);return n.length===8?'65'+n:n;},phones=new Map(),blocks=new Map();
    for(const p of ctx.people){const key=phone(p.mobile);if(key){if(!phones.has(key))phones.set(key,[]);phones.get(key).push(p);}}
    for(const t of dd.teachers){if(!blocks.has(t.staffId))blocks.set(t.staffId,[]);blocks.get(t.staffId).push(t);}
    return {dd,rows:ctx.people.map(person=>{const key=phone(person.mobile),linked=key?phones.get(key):[person],ids=new Set(linked.map(p=>p.id)),joined=linked.flatMap(p=>blocks.get(p.id)||[]),t=joined.find(t=>t.staffId===person.id),activeAliases=linked.filter(p=>p.active&&blocks.has(p.id)),base=new Set(),workloadBase=new Set(),activities=[];for(const b of joined)(b.cells||[]).forEach((c,i)=>{if(!occupied(c))return;base.add(i);const activity=classify({subject:c[0],classIds:c[1]?[c[1]]:[],group:c[3]});const workload=activity.kind!==null&&(activity.kind==='teaching'||activity.cap||/^invigil(?:ation|ate|ator)?\b/.test(subjectCode(c[0])));if(workload)workloadBase.add(i);activities.push({period:i,subject:c[0],workload});});return {person,ids,aliasIds:[...ids],t,base,workloadBase,activities,canonicalId:(activeAliases.length?activeAliases:linked).map(p=>p.id).sort()[0],identityConflict:activeAliases.length>1};})};
  }
  function pendingPeerRequests(s,ctx,d){return (s.requests||[]).filter(r=>r.date===d&&r.status==='pending'&&!r.retiredAt&&r.expiresAt>(ctx.now||0));}
  function teacherContext(s,ctx,d,source=teacherSource(ctx,d)){
    if(!source)return new Map();const dd=source.dd,limits=workloadLimits(s.systemConfig),bal=balances(s,ctx,d),out=new Map(),assignedById=new Map(),importedById=new Map(),absentById=new Map(),peerById=new Map(),externalById=new Map(),consecutiveCountExclusions=s.systemConfig?.consecutiveCountExclusions||[];
    for(const a of effectiveAssignments(s))if(a.date===d&&!a.noRelief&&!a.remove){if(!assignedById.has(a.staffId))assignedById.set(a.staffId,[]);assignedById.get(a.staffId).push(a);}
    if(limits.dailyRelief!==null){const importedIds=new Set((s.importedRelief||[]).map(a=>a.id));for(const a of accounted(s,ctx))if(importedIds.has(a.id)&&a.date===d&&Number.isInteger(a.period)&&a.period>=0&&a.period<dd.periods.length){if(!importedById.has(a.staffId))importedById.set(a.staffId,new Set());importedById.get(a.staffId).add(a.period);}}
    for(const a of s.absences)if(!a.deletedAt&&a.date===d){if(!absentById.has(a.staffId))absentById.set(a.staffId,new Set());for(const p of absencePeriods(a,dd))absentById.get(a.staffId).add(p);}
    for(const request of pendingPeerRequests(s,ctx,d)){if(!peerById.has(request.recipientId))peerById.set(request.recipientId,new Set());for(const period of request.periods)peerById.get(request.recipientId).add(period);}
    s.adhoc.forEach((row,index)=>{if(row.date===d&&!row.deletedAt&&!externalById.has(row.staffId))externalById.set(row.staffId,{row,index});});
    for(const raw of source.rows){const {person:p,ids,t,base,workloadBase,canonicalId,identityConflict,aliasIds}=raw,peerReserved=new Set(),assigned=new Set(),importedReliefPeriods=new Set(),consecutiveAssigned=new Set(),absent=new Set(),counted=raw.activities.filter(a=>!matchesSubjectPattern(a.subject,consecutiveCountExclusions)),consecutiveBase=new Set(counted.map(a=>a.period)),consecutiveWorkloadBase=new Set(counted.filter(a=>a.workload).map(a=>a.period));let external;
      for(const id of ids){for(const period of peerById.get(id)||[])peerReserved.add(period);for(const a of assignedById.get(id)||[]){assigned.add(a.period);if(!matchesSubjectPattern(a.subject,consecutiveCountExclusions))consecutiveAssigned.add(a.period);}for(const period of importedById.get(id)||[])importedReliefPeriods.add(period);for(const period of absentById.get(id)||[])absent.add(period);const e=externalById.get(id);if(e&&(!external||e.index<external.index))external=e;}
      const sreMode=rosterBasis(ctx,d,p.id),dailyRoster=sreMode==='daily',b={...bal.get(p.id)},otherUsed=[...ids].filter(id=>id!==p.id).reduce((n,id)=>n+(bal.get(id)?.weeklyUsed||0),0);b.weeklyUsed+=otherUsed;if(b.remaining!==null)b.remaining-=otherUsed;if(b.capRemaining!==null)b.capRemaining-=otherUsed;
      out.set(p.id,{id:p.id,dailyRoster,sreMode,canonicalId,identityConflict,aliasIds,person:p,t,ext:external?.row,base,workloadBase,consecutiveBase,consecutiveWorkloadBase,consecutiveAssigned,consecutiveCountExclusions,assigned,importedReliefPeriods,peerReserved,absent,balance:b,workloadIgnored:dd.workloadIgnored===true,allocationLimits:{dailyTotal:dailyRoster?limits.adhocDailyTotal:limits.dailyTotal,consecutive:limits.consecutive,dailyRelief:sreMode?null:limits.dailyRelief},restrictedPeriods:restrictedPeriods(s,p.employment),periodCount:dd.periods.length,schoolDay:dd.schoolDay===true&&dd.verified!==false});
    }return out;
  }
  function defaultRestrictedPeriods(){return [0,13,14,15,16];}
  function defaultEmploymentRestrictions(){return ['SRE','FAJT'].map(employment=>({employment,periods:defaultRestrictedPeriods()}));}
  function restrictedPeriods(s,employment){const raw=String(employment||'').trim().toUpperCase(),sre=raw.split(/[,;]/).some(v=>v.trim()==='SRE');return (s.systemConfig?.employmentPeriodRestrictions??defaultEmploymentRestrictions()).filter(r=>String(r.employment).trim().toUpperCase()===raw||sre&&String(r.employment).trim().toUpperCase()==='SRE').flatMap(r=>r.periods);}
  function runAt(set,p,total){if(!set.has(p))return 0;let left=p,right=p;while(left>0&&set.has(left-1))left--;while(right+1<total&&set.has(right+1))right++;return right-left+1;}

  function longestRun(set,total){let longest=0,run=0;for(let p=0;p<total;p++){run=set.has(p)?run+1:0;longest=Math.max(longest,run);}return longest;}

  function recessDuty(t,p,dem){
    if(!dem?.recessActivationId||!t.t||!t.person.active||t.absent.has(p)||t.assigned.has(p)||t.identityConflict)return false;
    const c=t.t.cells[p]||[],subject=norm(c[0]),all=norm(c.join(' '));
    const explicit=(t.t.recessDuties||[]).find(r=>r.period===p&&(!r.levels?.length||r.levels.includes(dem.level)));
    if(explicit)return true;
    if(!(/recess.*(?:duty|supervision)|(?:duty|supervision).*recess/.test(subject)||/^(?:rd|recess duty|recess supervision|r[1-6])$/.test(subject)))return false;
    const levels=[...all.matchAll(/(?:primary\s*|p)([1-6])\b/g)].map(m=>Number(m[1]));const coded=/^r([1-6])$/.exec(subject);if(coded)levels.push(Number(coded[1]));
    return !levels.length||levels.includes(dem.level);
  }
  function eligibility(t,p,added=[],options={}){
    const additions=added.map(a=>typeof a==='number'?{period:a}:a),addedPeriods=additions.map(a=>a.period),prospective={...options.demand,period:p};const reasons=[],b=t.balance,poolMember=t.dailyRoster||mainPoolTeacher(t.person,t.t);if(!t.schoolDay)reasons.push('School date is unverified.');if(!t.ext&&(!t.person.active||!t.t))reasons.push('No active verified timetable.');if(t.person.adhocEligible===false||!t.ext&&t.person.active&&t.t&&!poolMember)reasons.push('Outside the main relief pool.');if(t.ext&&!t.ext.periods.includes(p))reasons.push('Outside activated periods.');if(t.absent.has(p))reasons.push('Reported absent.');if(t.base.has(p)&&!options.repurpose)reasons.push('Timetabled lesson or duty.');if(t.assigned.has(p)||addedPeriods.includes(p))reasons.push('Already assigned relief.');const peerReserved=t.peerReserved?.has(p)===true;if(peerReserved&&!options.peerOverride)reasons.push('Reserved for a peer arrangement awaiting approval.');
    const capped=b.capConfigured===true||b.periodCap!==null&&b.periodCap!==undefined,capViolation=!options.repurpose&&capped&&(b.capVerified!==true||b.capRemaining===null||b.capRemaining-added.length<1),capReason=capViolation?(b.capVerified!==true||b.capRemaining===null?'Weekly employment cap cannot be verified.':'Weekly employment cap would be exceeded.'):'';if(capReason&&!b.utCap)reasons.push(capReason);
    const employmentPeriodRestricted=!options.repurpose&&(t.restrictedPeriods||[]).includes(p),employmentPeriodWarning=employmentPeriodRestricted?'Employment rule: '+String(t.person.employment||'this teacher')+' is not auto-allocated P'+p+'. SMC may select this teacher manually.':'';
    const set=consecutivePeriods(t,[...additions,prospective]),consecutive=runAt(set,p,t.periodCount),remaining=t.ext||b.remaining===null?null:b.remaining-added.length,unknown=poolMember&&!t.ext&&!t.dailyRoster&&remaining===null,weeklyRExceeded=poolMember&&!t.ext&&!t.dailyRoster&&!options.repurpose&&(unknown||remaining<1),peerROverride=options.peerApproval===true&&weeklyRExceeded,Rviolation=weeklyRExceeded&&!peerROverride,streakViolation=consecutive>=6&&!options.repurpose,limits=t.allocationLimits||workloadLimits(),workload=new Set([...(t.workloadBase||t.base),...t.assigned,...addedPeriods,p]),automaticDailyViolation=limits.dailyTotal!==null&&workload.size>limits.dailyTotal,automaticStreakViolation=limits.consecutive!==null&&longestRun(consecutivePeriods(t,[...additions,prospective]),t.periodCount)>limits.consecutive,relief=limits.dailyRelief==null?null:heldReliefPeriods(t,[...additions,prospective]),automaticReliefViolation=relief!==null&&relief.size>limits.dailyRelief,dailyReliefWarning=automaticReliefViolation?'Daily relief limit '+limits.dailyRelief+' reached.':'',automaticCategory=reasons.length?4:Rviolation||employmentPeriodRestricted||capViolation||t.sreMode==='unknown'?1:automaticDailyViolation||automaticStreakViolation||automaticReliefViolation?2:0;
    return {staffId:t.id,name:t.person.name,...(t.sreMode?{dailyRoster:t.dailyRoster===true,sreMode:t.sreMode}:{}),workloadIgnored:t.workloadIgnored===true,available:reasons.length===0,...(peerReserved?{peerReserved:true}:{}),autoEligible:reasons.length===0&&!capViolation&&!peerReserved&&!employmentPeriodRestricted&&(!t.ext||t.dailyRoster===true)&&t.sreMode!=='unknown'&&!t.identityConflict&&(!t.canonicalId||t.canonicalId===t.id)&&!Rviolation&&!automaticDailyViolation&&!automaticStreakViolation&&!automaticReliefViolation,automaticDailyViolation,automaticStreakViolation,...(relief!==null?{automaticReliefViolation,dailyReliefPeriods:relief.size,dailyReliefWarning}:{}),automaticCategory,dailyPeriods:workload.size,employmentPeriodRestricted,override:capViolation||employmentPeriodRestricted||Rviolation||streakViolation,capViolation,capOnlyViolation:capViolation&&reasons.length===1,category:reasons.length?4:(Rviolation||employmentPeriodRestricted||capViolation)&&streakViolation?3:streakViolation?2:Rviolation||employmentPeriodRestricted||capViolation?1:0,reasons,warnings:[...(t.sreMode==='unknown'?['SRE deployment basis is unverified.']:[]),...(peerReserved?['Peer arrangement awaiting approval; an SMC choice will supersede it.']:[]),...(employmentPeriodWarning?[employmentPeriodWarning]:[]),...(capReason?[capReason]:[]),...(t.identityConflict?['Duplicate active timetable identity. Resolve Contacts before automatic allocation.']:[]),...(unknown&&!options.repurpose&&!options.peerApproval?['R is unverified.']:Rviolation?['Weekly R quota exceeded.']:[]),...(streakViolation?['Six or more consecutive occupied periods.']:[])],R:b.R,remaining:b.remaining,assigned:b.weeklyUsed,annual:b.utilisation,entitlement:b.entitlement,consecutive,Rviolation,...(peerROverride?{peerROverride:true}:{}),streakViolation,external:!!t.ext};
  }
  function opportunities(s,ctx,d,teachers=teacherContext(s,ctx,d)){const dd=ctx.days[d];if(!dd)return [];return dd.periods.map(p=>({...p,green:[...teachers.values()].filter(t=>reliefCandidateEligible(t.person)&&eligibility(t,p.period).autoEligible).map(t=>t.id)}));}
  function health(s,ctx,d,demands,teachers){
    const activeRows=effectiveAssignments(s).filter(a=>a.date===d&&!a.noRelief),base={...s,assignments:s.assignments.filter(a=>a.date!==d||!LIVE.has(a.status)),reliefCorrections:(s.reliefCorrections||[]).filter(c=>!activeRows.some(a=>a.id===c.assignmentId))};
    const potential=opportunities(base,ctx,d),remaining=opportunities(s,ctx,d,teachers),potMap=new Map(potential.map(p=>[p.period,new Set(p.green)]));
    const resolve=subjectResolver(ctx.days[d]?.teachingGroups,s.systemConfig),total=potential.reduce((n,p)=>n+p.green.length,0),left=remaining.reduce((n,p)=>n+p.green.length,0),valid=effectiveAssignments(s).filter(a=>a.date===d),covered=new Set(valid.map(a=>a.demandId)),uncovered=demands.filter(x=>!covered.has(x.id)&&(d<ctx.today||!x.noReliefRequired&&resolve(x).reliefRequired));
    const incomplete=ctx.days[d]?.verified===false||!(ctx.days[d]?.schoolDay)||ctx.days[d]?.teachers.some(t=>rosterBasis(ctx,d,t.staffId)==='unknown'||mainPoolTeacher(ctx.people.find(p=>p.id===t.staffId),t)&&rosterBasis(ctx,d,t.staffId)!=='daily'&&!Number.isFinite(t.R));
    return {visiblePeriods:clone(s.systemConfig?.reliefHealthPeriods??(ctx.days[d]?.periods||[]).map(p=>p.period).filter(p=>!defaultRestrictedPeriods().includes(p))),incomplete,verified:!incomplete,reason:incomplete?'Relief capacity is incomplete until the active timetable and current in-force Deploy R values are verified.':'',date:d,potential:total,remaining:left,consumed:Math.max(0,total-left),percentage:!incomplete&&total?Math.min(100,100*left/total):null,label:incomplete?'Capacity not yet verified':total?left===0?'Critical capacity':'Remaining relief flexibility':'No eligible capacity',critical:!incomplete&&(!total||left===0),uncovered:uncovered.map(({id,period,className,groupName,name})=>({id,period,className,groupName,name})),overrideCount:activeRows.filter(a=>a.overrideReason||a.override||!potMap.get(a.period)?.has(a.staffId)&&cost(a)>0).length,periods:remaining.map(p=>({...p,potential:potMap.get(p.period)?.size||0,potentialStaffIds:[...(potMap.get(p.period)||[])],red:activeRows.filter(a=>a.period===p.period).map(a=>({id:a.id,staffId:a.staffId,kind:a.combination?'combination':a.repurposedDuty?'repurposed-duty':a.origin||'smc'})),warning:p.green.length<=2?(p.green.length===0?'critical':p.green.length===1?'very-low':'low'):null})),note:'Green bars overlap across periods and are not additive R units.'};
  }
  function rotation(s,Y){
    const order=[],validRows=accounted(s).filter(a=>(a.accountingYear||year(a.date))===Y&&cost(a)>0),valid=new Map(validRows.map(a=>[a.id,a.staffId]));
    const events=(s.rotationEvents||[]).filter(e=>e.year===Y&&valid.has(e.assignmentId)).sort((a,b)=>a.sequence-b.sequence||a.id.localeCompare(b.id));
    for(const e of events){const id=valid.get(e.assignmentId),i=order.indexOf(id);if(i>=0)order.splice(i,1);order.push(id);}return order;
  }
  function ranked(s,ctx,d,period,demands=[],teacherMap,preferences,enabled=ruleToggles(s.systemConfig?.allocationRuleEnabled)){
    const order=preferenceOrder(preferences).filter(id=>enabled[id]),teachers=teacherMap||teacherContext(s,ctx,d),rot=rotation(s,year(d)),rotationValue=id=>rot.indexOf(id)<0?-1:rot.indexOf(id),list=[...teachers.values()].filter(t=>reliefCandidateEligible(t.person)).map(t=>({...eligibility(t,period,[],{demand:demands.find(dem=>dem.period===period)}),alternatives:Array.from({length:t.periodCount},(_,p)=>p).filter(p=>p!==period&&eligibility(t,p).autoEligible).length,rotation:rotationValue(t.id)}));
    for(const category of [0,1,2,3,4]){const same=list.filter(x=>x.automaticCategory===category),finite=same.map(x=>rankingUtilisation(x)).filter(Number.isFinite),min=finite.length?Math.min(...finite):null;for(const x of same){const value=rankingUtilisation(x);x.fairnessBand=value===null?Infinity:min!==null&&value-min<=1+EPS?min:value;}}
    return list.sort((a,b)=>a.automaticCategory-b.automaticCategory||compareCost(srePriority(a),srePriority(b))||compareCost(orderedValues(preferenceValues(a),order),orderedValues(preferenceValues(b),order))||a.staffId.localeCompare(b.staffId)).map((t,i)=>({...t,rank:i+1}));
  }
  /* Manual recommendations share the configured business policy. Eligibility
     and special-duty groups remain intact; high daily load is a soft preference. */
  function manualAssignments(s,d){return effectiveAssignments(s,true).filter(a=>a.date===d).map(a=>({id:a.id,demandId:a.demandId,staffId:a.staffId,period:a.period,className:a.className,subject:a.subject,venue:a.venue,groupName:a.groupName,combination:!!a.combination,sameClass:!!a.sameClass,repurposedDuty:!!a.repurposedDuty,noRelief:!!a.noRelief,remove:!!a.remove,rCost:cost(a),status:a.status,origin:a.origin,protected:protectedAssignment(a),peerArranged:!!(a.peerArranged||a.mutual),peerApproved:!!(a.peerApproved||a.origin==='mutual'),...(a.peerROverride?{peerROverride:true}:{}),requestId:a.requestId||null,acceptedAt:a.acceptedAt||null,acceptedBy:a.acceptedBy||null,manual:!!manualDecision(s,d,a.demandId),invalidCover:!!a.invalidCover,reviewReason:a.reviewReason||'',manualDecision:manualDecision(s,d,a.demandId)}));}
  function manualModel(s,ctx,d,teachers=teacherContext(s,ctx,d)){
    const rows=[...teachers.values()],day=ctx.days[d]||{},baseline=ctx.baselineDays?.[d]||day,baselineTeachers=new Map((baseline.teachers||[]).map(t=>[t.staffId,t])),config=s.systemConfig||{};return {date:d,policy:{allocationPreferences:preferenceOrder(config.allocationPreferences),allocationRuleEnabled:ruleToggles(config.allocationRuleEnabled),subjectFamilies:clone(config.subjectFamilies??defaultSubjectFamilies()),teachingGroupOverrides:clone(config.teachingGroupOverrides||[])},formClasses:clone(day.formClasses||[]),teachingGroups:clone(day.teachingGroups||[]),schoolDay:ctx.days[d]?.schoolDay===true,workloadIgnored:day.workloadIgnored===true,periods:clone(ctx.days[d]?.periods||[]),rotation:rotation(s,year(d)),teachers:rows.map(t=>({id:t.id,...(t.sreMode?{dailyRoster:t.dailyRoster,sreMode:t.sreMode}:{}),teachingProfile:clone(baselineTeachers.get(t.id)?.teachingProfile||teachingProfile(baselineTeachers.get(t.id)?.weekCells||baselineTeachers.get(t.id)?.cells||[],baseline.formClasses,baseline.teachingGroups,baseline.subjectCategories,config)),canonicalId:t.canonicalId,identityConflict:t.identityConflict,aliasIds:t.aliasIds,person:{id:t.id,name:t.person.name,active:t.person.active,employment:t.person.employment,adhocEligible:t.person.adhocEligible,reliefCandidateEligible:reliefCandidateEligible(t.person)},t:t.t?{adhoc:t.t.adhoc,cells:clone(t.t.cells),recessDuties:clone(t.t.recessDuties||[])}:null,ext:t.ext?{periods:t.ext.periods}:null,base:[...t.base],workloadBase:[...(t.workloadBase||t.base)],consecutiveBase:[...(t.consecutiveBase||t.base)],consecutiveWorkloadBase:[...(t.consecutiveWorkloadBase||t.workloadBase||t.base)],consecutiveCountExclusions:t.consecutiveCountExclusions,importedReliefPeriods:[...(t.importedReliefPeriods||[])],peerReserved:[...(t.peerReserved||[])],absent:[...t.absent],balance:t.balance,workloadIgnored:t.workloadIgnored===true,allocationLimits:t.allocationLimits,restrictedPeriods:t.restrictedPeriods,periodCount:t.periodCount,schoolDay:t.schoolDay})),assignments:manualAssignments(s,d),manualDecisions:clone(manualOwnership(s,d))};
  }
  // Rebase only changed assignment costs onto the server's weekly/yearly totals.
  // Applying this to an already projected model remains incremental, not cumulative.
  function withManualAssignments(model,assignments){
    const totals=rows=>{const values=new Map();for(const row of rows)if(!row.invalidCover)values.set(row.staffId,(values.get(row.staffId)||0)+cost(row));return values;},before=totals(model.assignments),after=totals(assignments);
    const teachers=model.teachers.map(t=>{const ids=new Set(t.aliasIds?.length?t.aliasIds:[t.id]),delta=[...ids].reduce((n,id)=>n+(after.get(id)||0)-(before.get(id)||0),0);if(!delta)return t;
      const b={...t.balance};for(const field of ['remaining','capRemaining'])if(Number.isFinite(b[field]))b[field]-=delta;
      for(const field of ['weeklyUsed','committed','spent'])if(Number.isFinite(b[field]))b[field]+=delta;
      if(Number.isFinite(b.spent))b.utilisation=b.dailyRoster?null:b.entitlement>0?100*b.spent/b.entitlement:b.spent===0?0:null;
      return {...t,balance:b};});return {...model,teachers,assignments};
  }
  function isClassLesson(cell){return !!String(cell?.[1]||'').trim()&&!/^(PD|BLK|BLOCK|IMP|.*DUTY.*)$/i.test(String(cell?.[0]||'').trim());}
  function manualRanks(model,dem,options={}){
    // Only historical reconciliation opts in to excluded identities; saved
    // combinations and repurposed duties keep their existing validation policy.
    if(!dem)return [];const config=model.policy||{},enabled=ruleToggles(config.allocationRuleEnabled),order=preferenceOrder(config.allocationPreferences).filter(id=>enabled[id]),resolve=subjectResolver(model.teachingGroups,config),wanted={subject:resolve(dem).key,levels:lessonLevels(dem,model.formClasses,model.teachingGroups)},period=dem.period,ignored=model.assignments.filter(a=>a.demandId===dem.id),live=model.assignments.filter(a=>a.demandId!==dem.id&&!a.noRelief&&!a.remove&&!a.invalidCover),rot=model.rotation||[];
    // A request-local index joins each assignment to its teacher once. Preserve
    // source order for alias identities, so replacement/combine choices stay exact.
    const position=new Map(model.assignments.map((row,index)=>[row,index])),index=rows=>{const byStaff=new Map();for(const row of rows){const id=row.staffId,list=byStaff.get(id);if(list)list.push(row);else byStaff.set(id,[row]);}return byStaff;},allByStaff=index(model.assignments),liveByStaff=index(live),ignoredByStaff=index(ignored),select=(byStaff,ids)=>{const rows=[...ids].flatMap(id=>byStaff.get(id)||[]);return ids.size>1?rows.sort((a,b)=>position.get(a)-position.get(b)):rows;};
    const rows=model.teachers.filter(raw=>options.includeExcluded===true||raw.person.reliefCandidateEligible!==false).map(raw=>{const alias=new Set(raw.aliasIds?.length?raw.aliasIds:[raw.id]),all=select(allByStaff,alias),own=select(liveByStaff,alias),restored=select(ignoredByStaff,alias).reduce((n,a)=>n+cost(a),0),balance={...raw.balance};if(balance.remaining!==null)balance.remaining+=restored;if(balance.capRemaining!==null)balance.capRemaining+=restored;balance.weeklyUsed-=restored;
      const t={...raw,balance,base:new Set(raw.base),workloadBase:new Set(raw.workloadBase||raw.base),consecutiveBase:new Set(raw.consecutiveBase||raw.base),consecutiveWorkloadBase:new Set(raw.consecutiveWorkloadBase||raw.workloadBase||raw.base),consecutiveAssigned:new Set(own.filter(a=>countsConsecutive(raw,a)).map(a=>a.period)),absent:new Set(raw.absent),peerReserved:new Set(raw.peerReserved||[]),assigned:new Set(own.map(a=>a.period))},repurposedDuty=recessDuty(t,period,dem),e=eligibility(t,period,[],{repurpose:repurposedDuty,demand:dem,peerOverride:true}),samePerson=alias.has(dem.staffId),current=t.t?.cells[period]||['','','',''],existingOrdinary=own.find(a=>a.period===period&&!a.combination&&!a.repurposedDuty),baseLesson=isClassLesson(current)?{subject:current[0],className:current[1],venue:current[2],groupName:current[3]}:existingOrdinary||null;
      const additional=own.filter(a=>a.period===period&&a.combination&&!a.sameClass),sameClass=!!baseLesson&&norm(baseLesson.className)===norm(dem.className),combineAllowed=t.schoolDay&&t.person.active&&t.person.adhocEligible!==false&&(t.ext||mainPoolTeacher(t.person,t.t))&&!t.absent.has(period)&&!samePerson&&!!baseLesson&&(sameClass||additional.length<1)&&!t.identityConflict;
      if(e.dailyReliefWarning)e.warnings.push(e.dailyReliefWarning);
      if(samePerson){e.available=false;e.autoEligible=false;e.category=4;e.reasons.push('This is the absent teacher.');}
      const occupied=new Set([...t.base,...t.assigned]),load=new Set([...[...t.workloadBase].filter(p=>!t.absent.has(p)),...all.filter(a=>!a.noRelief&&!a.remove&&!a.invalidCover).map(a=>a.period)]).size,nearFree=[period-2,period-1,period+1,period+2].filter(p=>p>=0&&p<t.periodCount).every(p=>!occupied.has(p)),surrounded=occupied.has(period-1)&&occupied.has(period+1),alternatives=Array.from({length:t.periodCount},(_,p)=>p).filter(p=>p!==period&&eligibility(t,p).autoEligible).length;
      const profile=raw.teachingProfile||{subjects:[],levels:[]},subjects=new Set([...(profile.subjects||[]).filter(code=>!profile.subjectLessons||!code.startsWith('family:')).map(code=>code.startsWith('family:')?code:resolve({subject:code}).key),...(profile.subjectLessons||[]).map(lesson=>resolve(lesson).key)]),subjectPenalty=wanted.subject&&!subjects.has(wanted.subject)?1:0,levelPenalty=wanted.levels.length&&!wanted.levels.every(level=>(profile.levels||[]).includes(level))?1:0;
      return {...e,repurposedDuty,subjectPenalty,levelPenalty,highDailyLoad:load>=8,remaining:raw.balance.remaining,remainingWithReplacement:balance.remaining,id:raw.id,cells:raw.t?.cells||Array.from({length:t.periodCount},()=>['','','','']),assignments:all.filter(a=>!a.noRelief&&!a.remove),absent:[...t.absent],base:[...t.base],load,nearFree,surrounded,alternatives,rotation:rot.indexOf(raw.id),combineAllowed,combineBase:baseLesson,sameClass,venueWarning:combineAllowed&&!sameVenue(baseLesson.venue,dem.venue),unknownR:!t.dailyRoster&&mainPoolTeacher(t.person,t.t)&&e.remaining===null&&!e.external};
    });
    const loads=rows.filter(r=>r.available).map(r=>r.load).sort((a,b)=>a-b),low=loads.length?loads[Math.floor((loads.length-1)*.35)]:0;
    for(const r of rows){r.suitabilityTier=r.category===4?6:r.repurposedDuty?-1:r.external?0:r.streakViolation?5:r.nearFree&&r.load<=low?1:r.nearFree?2:r.surrounded?4:3;r.tier=r.category===4?6:r.repurposedDuty?-1:r.external?0:r.category+1;r.why=r.category===4?r.reasons.join(' '):r.dailyRoster?'Daily roster, no R%; daily SRE priority':r.repurposedDuty?'Repurpose existing recess duty; no additional R':r.external?'Activated ad hoc relief':r.suitabilityTier===1?'Free within two periods either side; lighter daily load':r.suitabilityTier===2?'Free within two periods either side':r.suitabilityTier===4?'Occupied immediately before and after':r.suitabilityTier===5?'Consecutive workload override':'Standard free-period fit';}
    const fairness=new Map(),group=r=>r.category+'|'+r.tier+'|'+r.highDailyLoad;for(const r of rows)if(Number.isFinite(rankingUtilisation(r,r.remainingWithReplacement))){const key=group(r);fairness.set(key,Math.min(fairness.get(key)??Infinity,rankingUtilisation(r,r.remainingWithReplacement)));}
    for(const r of rows){const min=fairness.get(group(r))??null,value=rankingUtilisation(r,r.remainingWithReplacement);r.fairnessBand=value===null?Infinity:value-min<=1+EPS?min:value;}
    for(const r of rows)if(r.highDailyLoad)r.why+='; already '+r.load+' work periods today, lower priority within this eligibility group';
    return rows.sort((a,b)=>a.category-b.category||compareCost(srePriority({...a,dailyPeriods:a.load}),srePriority({...b,dailyPeriods:b.load}))||a.tier-b.tier||Number(a.highDailyLoad)-Number(b.highDailyLoad)||compareCost(orderedValues(preferenceValues({...a,remaining:a.remainingWithReplacement}),order),orderedValues(preferenceValues({...b,remaining:b.remainingWithReplacement}),order))||a.suitabilityTier-b.suitabilityTier||a.id.localeCompare(b.id)).map((r,i)=>({...r,rank:i+1}));
  }
  /* The flow limits daily headroom as well as weekly R. Branches forbid one
     added period in an overlong run; any feasible plan must omit one such edge. */
  function flow(teachers,demands,banned,weights,checkBudget){
    if(checkBudget)checkBudget();
    const graph=[];const node=()=>{graph.push([]);return graph.length-1;};const source=node(),sink=node(),dn=new Map(),links=[];
    const edge=(u,v,cap,cost,tag)=>{const a={to:v,rev:graph[v].length,cap,cost,initial:cap,tag},b={to:u,rev:graph[u].length,cap:0,cost:negateCost(cost)};graph[u].push(a);graph[v].push(b);return a;};
    for(const d of demands){const n=node();dn.set(d.id,n);edge(n,sink,1,0);}
    for(const t of teachers){if(checkBudget)checkBudget();const n=node();const limits=t.allocationLimits||workloadLimits(),daily=limits.dailyTotal,headroom=daily==null?Infinity:Math.max(0,daily-new Set([...(t.workloadBase||t.base),...t.assigned]).size),relief=limits.dailyRelief==null?null:heldReliefPeriods(t),reliefHeadroom=relief===null?Infinity:Math.max(0,limits.dailyRelief-relief.size)+[...t.eligible].filter(p=>relief.has(p)).length,capacity=Math.min(demands.length,allocationCapacity(t),headroom,reliefHeadroom);for(let i=0;i<capacity;i++)edge(source,n,1,(weights.teacherCost?.(t,i)||0));
      for(const p of new Set([...t.eligible,...(t.repurposePeriods||[])])){const key=t.id+'|'+p;if(banned.has(key))continue;const pn=node(),repurpose=t.repurposePeriods?.has(p);edge(repurpose?source:n,pn,1,repurpose?(weights.repurposeCost??-100000000):0);
        for(const d of demands)if(d.period===p&&d.staffId!==t.id&&!banned.has(t.id+'|d:'+d.id)&&(!t.eligibleDemands||t.eligibleDemands.has(d.id))&&(!repurpose||recessDuty(t,p,d))){const e=edge(pn,dn.get(d.id),1,weights.edgeCost?.(t,d,repurpose)||0,{staffId:t.id,demandId:d.id,period:p,...(repurpose?{rCost:0,repurposedDuty:true}:{})});links.push(e);}
      }
    }
    let total=0,totalCost=0,potentials=null;const N=graph.length;
    while(true){if(checkBudget)checkBudget();const dist=Array(N).fill(null),prev=Array(N);dist[source]=0;
      if(potentials){
        // Previous shortest distances make reduced residual costs nonnegative. A
        // small binary heap avoids repeatedly scanning the school-sized graph.
        const heap=[],negative=potentials.map(negateCost),push=(u,value)=>{const item={u,value,priority:addCost(value,negative[u])};let i=heap.length;heap.push(item);while(i){const p=(i-1)>>1;if(compareCost(heap[p].priority,item.priority)<=0)break;heap[i]=heap[p];i=p;}heap[i]=item;};
        const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&compareCost(heap[c+1].priority,heap[c].priority)<0)c++;if(compareCost(last.priority,heap[c].priority)<=0)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
        push(source,0);while(heap.length){if(checkBudget)checkBudget();const {u,value}=pop();if(compareCost(value,dist[u])!==0)continue;for(let i=0;i<graph[u].length;i++){const e=graph[u][i];if(e.cap>0&&improvesCost(value,e.cost,dist[e.to])){dist[e.to]=addCost(value,e.cost);prev[e.to]=[u,i];push(e.to,dist[e.to]);}}}
      }else{
        const inQueue=Array(N).fill(false),queue=[source];inQueue[source]=true;
        for(let qi=0;qi<queue.length;qi++){if(checkBudget)checkBudget();const u=queue[qi];inQueue[u]=false;for(let i=0;i<graph[u].length;i++){const e=graph[u][i];if(e.cap>0&&improvesCost(dist[u],e.cost,dist[e.to])){dist[e.to]=addCost(dist[u],e.cost);prev[e.to]=[u,i];if(!inQueue[e.to]){inQueue[e.to]=true;queue.push(e.to);}}}}
      }
      potentials=dist.map((value,i)=>value??potentials?.[i]??0);
      if(dist[sink]===null)break;for(let v=sink;v!==source;){const [u,i]=prev[v],e=graph[u][i];e.cap--;graph[v][e.rev].cap++;v=u;}total++;totalCost=addCost(totalCost,dist[sink]);
    }
    return {coverage:total,cost:totalCost,assignments:links.filter(e=>e.initial-e.cap===1).map(e=>e.tag)};
  }
  function violation(teachers,assignments){
    const by=new Map();for(const a of assignments){const rows=by.get(a.staffId)||[];rows.push(a);by.set(a.staffId,rows);}
    for(const t of teachers){
      const rows=by.get(t.id)||[],base=new Set([...(t.workloadBase||t.base),...t.assigned]),set=new Set([...base,...rows.map(a=>a.period)]),limits=t.allocationLimits||workloadLimits(),variables=rows.filter(a=>!base.has(a.period)),key=a=>t.id+'|d:'+a.demandId;
      if(limits.dailyTotal!==null&&set.size>limits.dailyTotal&&variables.length)return variables.map(key);
      if(limits.dailyRelief!=null){const relief=heldReliefPeriods(t),added=rows.filter(a=>!relief.has(a.period));if(heldReliefPeriods(t,rows).size>limits.dailyRelief&&added.length)return added.map(key);}
      if(limits.consecutive===null)continue;
      const consecutive=consecutivePeriods(t,rows),countedBase=consecutivePeriods(t,[]);
      for(let p=0;p<t.periodCount-limits.consecutive;p++){
        const window=Array.from({length:limits.consecutive+1},(_,i)=>p+i);
        if(window.every(q=>consecutive.has(q))){const added=rows.filter(a=>!countedBase.has(a.period)&&countsConsecutive(t,a)&&a.period>=p&&a.period<=p+limits.consecutive);if(added.length)return added.sort((a,b)=>a.period-b.period).map(key);}
      }
    }return null;
  }
  function solveCoverage(teachers,demands,weights,limits={}){
    let best={coverage:0,assignments:[],cost:0},upper=0,nodes=0,exhausted=false;const maxNodes=limits.maxNodes||256,seen=new Set(),stack=[new Set()];
    // Each relaxed flow bounds both coverage and the complete ordered policy score.
    // Reaching full coverage alone does not prove the best business-rule fit.
    while(stack.length){if(limits.checkBudget)limits.checkBudget();if(nodes>=maxNodes){exhausted=true;break;}const banned=stack.pop(),key=[...banned].sort().join('\n');if(seen.has(key))continue;seen.add(key);nodes++;const result=flow(teachers,demands,banned,weights,limits.checkBudget);if(nodes===1)upper=result.coverage;if(result.coverage<best.coverage||result.coverage===best.coverage&&compareCost(result.cost,best.cost)>=0)continue;const bad=violation(teachers,result.assignments);if(!bad){best=result;continue;}for(let i=bad.length-1;i>=0;i--){const branch=new Set(banned);branch.add(bad[i]);stack.push(branch);}}
    return {...best,proven:!exhausted||best.coverage===upper,preferencesProven:!exhausted,searchComplete:!exhausted,nodes,upper};
  }
  // Consecutive subject rules are hard lesson units, separate from ranking and
  // maximum teacher workload. Existing cover anchors a unit and is never moved.
  function consecutiveBlocks(s,day,demands,pending,fixed){
    const rules=normalizeConsecutiveSubjectRules(s.systemConfig?.consecutiveSubjectRules),sizes=new Map(rules.map(r=>[subjectCode(r.subject),r.periods])),resolve=subjectResolver(day.teachingGroups,s.systemConfig),groups=new Map(),pendingIds=new Set(pending.map(d=>d.id)),fixedById=new Map(fixed.map(a=>[a.demandId,a])),blocks=[],byDemand=new Map();
    const identity=(ids,label)=>ids?.length?[...ids].sort():norm(label);
    // FORM pairs belong to the effective source timetable, not to the absence
    // slice. A partial absence may need only one period; a real solo needs no block.
    const formPair=dem=>{
      const pairs=(dem.members||[dem]).map(member=>{
        const cells=day.teachers?.find(t=>t.staffId===member.staffId)?.cells;
        const matches=p=>{const c=cells?.[p];return !!c&&resolve({subject:c[0],groupName:c[3]}).subject==='form'&&norm(c[1])===norm(member.className)&&norm(c[3])===norm(member.groupName);};
        if(!matches(member.period))return undefined;
        let start=member.period;while(start>0&&matches(start-1))start--;
        start+=2*Math.floor((member.period-start)/2);
        return matches(start+1)?[start,start+1]:null;
      });
      if(pairs.some(pair=>pair===undefined))return undefined;
      return pairs[0]&&pairs.every(pair=>pair&&pair[0]===pairs[0][0])?pairs[0]:null;
    };
    for(const dem of demands){const subject=resolve(dem).subject,size=sizes.get(subject);if(!size)continue;
      const sourcePeriods=subject==='form'&&size===2?formPair(dem):undefined;if(sourcePeriods===null)continue;
      const key=JSON.stringify([subject,identity(dem.absentIds,dem.staffId),identity(dem.classIds,dem.className),identity(dem.groupIds,dem.groupId||dem.groupName),sourcePeriods]);
      if(!groups.has(key))groups.set(key,{subject,size,sourcePeriods,rows:[]});groups.get(key).rows.push(dem);
    }
    for(const {subject,size,sourcePeriods,rows} of groups.values()){
      rows.sort((a,b)=>a.period-b.period||a.id.localeCompare(b.id));const runs=[];
      for(const row of rows){const run=runs.at(-1);if(!run||run.at(-1).period+1!==row.period)runs.push([row]);else run.push(row);}
      for(const run of runs)for(let start=0;start<run.length;start+=size){
        const lessons=run.slice(start,start+size),open=lessons.filter(d=>pendingIds.has(d.id)),existing=lessons.map(d=>fixedById.get(d.id)),anchors=new Set(existing.filter(a=>a&&!a.noRelief&&!a.remove).map(a=>a.staffId)),label=subject.toUpperCase()+' consecutive '+size+'-period block',missing=lessons.some((d,i)=>!pendingIds.has(d.id)&&(!existing[i]||existing[i].noRelief||existing[i].remove));
        if(!open.length&&anchors.size<=1)continue;
        const blockedReason=!sourcePeriods&&lessons.length!==size?label+' is incomplete in the lessons requiring relief. Review the timetable; no additional periods were created.':anchors.size>1?label+' has different existing teachers. SMC choices are kept; review this block.':missing?label+' includes an SMC choice or excluded lesson without cover. SMC choices are kept; review this block.':'';
        const block={subject:subject.toUpperCase(),periods:size,demandIds:lessons.map(d=>d.id),pendingIds:open.map(d=>d.id),anchor:anchors.size===1?[...anchors][0]:null,blockedReason};blocks.push(block);for(const d of lessons)byDemand.set(d.id,block);
      }
    }
    const valid=assignments=>{const selected=new Map(assignments.map(a=>[a.demandId,a]));return blocks.every(block=>{const rows=block.pendingIds.map(id=>selected.get(id)).filter(Boolean);return !rows.length||!block.blockedReason&&rows.length===block.pendingIds.length&&new Set(rows.map(a=>a.staffId)).size===1&&(!block.anchor||rows[0].staffId===block.anchor);});};
    return {rules,blocks,byDemand,valid};
  }
  function solveConsecutiveCoverage(teachers,demands,weights,policy,limits={}){
    if(!policy.blocks.length)return solveCoverage(teachers,demands,weights,limits);
    const blocked=new Set(policy.blocks.filter(b=>b.blockedReason).flatMap(b=>b.pendingIds)),usable=demands.filter(d=>!blocked.has(d.id)),byId=new Map(demands.map(d=>[d.id,d])),maxNodes=limits.maxNodes||256;
    let best={coverage:0,assignments:[],cost:0},nodes=0,upper=0,exhausted=false;const stack=[{forced:[],omitted:new Set()}];
    // Relax the block constraint to retain the existing flow's coverage bound.
    // When a block is split, branch on its complete teacher choices or no cover.
    // This is bounded by the same deterministic search budget as workload rules.
    while(stack.length){
      if(limits.checkBudget)limits.checkBudget();
      if(nodes>=maxNodes){exhausted=true;break;}
      const {forced,omitted}=stack.pop(),reserved=new Set(forced.map(a=>a.demandId)),remaining=usable.filter(d=>!reserved.has(d.id)&&!omitted.has(d.id)),counts=new Map(),periods=new Map();
      for(const a of forced){counts.set(a.staffId,(counts.get(a.staffId)||0)+cost(a));if(!periods.has(a.staffId))periods.set(a.staffId,[]);periods.get(a.staffId).push(a.period);}
      const residual=teachers.map(t=>{const used=counts.get(t.id)||0,added=periods.get(t.id)||[];return {...t,balance:{...t.balance,remaining:t.balance.remaining-used,capRemaining:t.balance.capRemaining===null?null:t.balance.capRemaining-used},assigned:new Set([...t.assigned,...added]),consecutiveAssigned:new Set([...(t.consecutiveAssigned||t.assigned),...forced.filter(a=>a.staffId===t.id&&countsConsecutive(t,a)).map(a=>a.period)]),eligible:new Set([...t.eligible].filter(p=>!added.includes(p))),repurposePeriods:new Set([...(t.repurposePeriods||[])].filter(p=>!added.includes(p)))};});
      const result=solveCoverage(residual,remaining,{...weights,teacherCost:(t,i)=>weights.teacherCost(t,i+(counts.get(t.id)||0))},{maxNodes:maxNodes-nodes,checkBudget:limits.checkBudget});nodes+=result.nodes;
      if(!result.searchComplete)exhausted=true;
      const plan=[...forced,...result.assignments],coverage=plan.length,value=weights.total(plan);
      if(nodes===result.nodes)upper=forced.length+result.upper;
      if(coverage<best.coverage&&result.proven||coverage===best.coverage&&result.preferencesProven&&compareCost(value,best.cost)>=0)continue;
      const selected=new Map(plan.map(a=>[a.demandId,a])),bad=policy.blocks.find(block=>{const rows=block.pendingIds.map(id=>selected.get(id)).filter(Boolean);return rows.length&&(rows.length!==block.pendingIds.length||new Set(rows.map(a=>a.staffId)).size!==1||block.anchor&&rows[0].staffId!==block.anchor);});
      if(!bad){if(coverage>best.coverage||coverage===best.coverage&&compareCost(value,best.cost)<0)best={coverage,assignments:plan,cost:value};continue;}
      const lessons=bad.pendingIds.map(id=>byId.get(id)),options=[];
      for(const teacher of residual){
        if(bad.anchor&&teacher.id!==bad.anchor)continue;
        const t={...teacher,balance:{...teacher.balance},assigned:new Set(teacher.assigned),consecutiveAssigned:new Set(teacher.consecutiveAssigned||teacher.assigned)},assignments=[];
        for(const dem of lessons){
          const repurpose=recessDuty(t,dem.period,dem);if(dem.staffId===t.id||!eligibility(t,dem.period,[],{repurpose,demand:dem}).autoEligible)break;
          assignments.push({staffId:t.id,demandId:dem.id,period:dem.period,...(repurpose?{rCost:0,repurposedDuty:true}:{})});t.assigned.add(dem.period);if(countsConsecutive(t,dem))t.consecutiveAssigned.add(dem.period);
          if(!repurpose){t.balance.remaining--;if(t.balance.capRemaining!==null)t.balance.capRemaining--;}
        }
        if(assignments.length===lessons.length)options.push({id:t.id,assignments});
      }
      stack.push({forced,omitted:new Set([...omitted,...bad.pendingIds])});
      // Try the flow's preferred teacher first; all alternatives remain searchable.
      const preferred=selected.get(bad.pendingIds[0])?.staffId;options.sort((a,b)=>(b.id===preferred)-(a.id===preferred)||a.id.localeCompare(b.id));
      for(let i=options.length-1;i>=0;i--)stack.push({forced:[...forced,...options[i].assignments],omitted});
    }
    return {...best,proven:!exhausted||best.coverage===upper,preferencesProven:!exhausted,searchComplete:!exhausted,nodes,upper};
  }
  function score(teachers,population,assignments,previous){
    const counts=new Map();for(const a of assignments)counts.set(a.staffId,(counts.get(a.staffId)||0)+cost(a));
    const values=teachers.filter(t=>population.has(t.id)&&t.balance.entitlement>0).map(t=>100*(t.balance.spent+(counts.get(t.id)||0))/t.balance.entitlement),spread=values.length?Math.max(...values)-Math.min(...values):0;
    const next=new Map(assignments.map(a=>[a.demandId,a.staffId])),changes=previous.filter(a=>next.get(a.demandId)!==a.staffId).length;
    return {coverage:assignments.length,spread,changes,values};
  }
  // Compare whole allocations in the saved order, without scalar weights that let a
  // lower preference overwhelm a higher one. Annual cost sums each selected teacher's
  // current fairness band and marginal utilisation; weekly cost consumes headroom in
  // the same way. Spread remains a diagnostic, not an independent acceptance gate.
  function allocationCosts(teachers,candidates,order,demands,day,config){
    const resolve=subjectResolver(day.teachingGroups,config),ids=teachers.map(t=>t.id).sort(),byId=new Map(teachers.map(t=>[t.id,t])),profiles=new Map(teachers.map(t=>{const p=t.teachingProfile;return [t.id,{...p,subjects:[...new Set([...(p.subjects||[]).filter(code=>!p.subjectLessons||!code.startsWith('family:')).map(code=>code.startsWith('family:')?code:resolve({subject:code}).key),...(p.subjectLessons||[]).map(lesson=>resolve(lesson).key)])]}];})),demandProfiles=new Map(demands.map(d=>[d.id,{subject:resolve(d).key,levels:lessonLevels(d,day.formClasses,day.teachingGroups)}]));
    const dailyPriority=teachers.some(t=>t.dailyRoster),priority=r=>dailyPriority?srePriority(r):[];
    const teacherCost=(t,i)=>[0,...(dailyPriority?[0,t.dailyRoster?i:0,0]:[]),...orderedValues({annualUtilisation:[0,t.dailyRoster?0:t.sreMode==='long-term'?(t.balance.R>0?100*i/t.balance.R:0):t.balance.entitlement>0?100*i/t.balance.entitlement:0],alternatives:[0],weeklyRemaining:[t.dailyRoster?0:i],rotation:[0],subjectMatch:[0],levelMatch:[0]},order),0];
    // Policy inputs stay fixed throughout the search; reuse every edge's score
    // across branch flows and local exchanges instead of rebuilding the vectors.
    const edgeScores=new Map(),dutyScores=new Map();
    for(const t of teachers){const profile=profiles.get(t.id),scores=new Map();edgeScores.set(t.id,scores);dutyScores.set(t.id,[0,...(dailyPriority?[0,0,0]:[]),...order.flatMap(id=>id==='annualUtilisation'?[0,0]:[0]),ids.indexOf(t.id)]);for(const dem of demands){const wanted=demandProfiles.get(dem.id),subjectPenalty=wanted.subject&&!profile.subjects.includes(wanted.subject)?1:0,levelPenalty=wanted.levels.length&&!wanted.levels.every(level=>profile.levels.includes(level))?1:0;scores.set(dem.id,[0,...priority(candidates.get(t.id+'|d:'+dem.id)||candidates.get(t.id+'|'+dem.period)),...orderedValues(preferenceValues({...(candidates.get(t.id+'|d:'+dem.id)||candidates.get(t.id+'|'+dem.period)),subjectPenalty,levelPenalty}),order),ids.indexOf(t.id)]);}}
    const edgeCost=(t,dem,repurpose)=>repurpose?dutyScores.get(t.id):edgeScores.get(t.id).get(dem.demandId||dem.id);
    const repurposeCost=[-1];
    const total=assignments=>{let value=0;const counts=new Map();for(const a of assignments){const t=byId.get(a.staffId);if(!t)return null;value=addCost(value,edgeCost(t,a,a.repurposedDuty));if(a.repurposedDuty)value=addCost(value,repurposeCost);else{const i=counts.get(t.id)||0;value=addCost(value,teacherCost(t,i));counts.set(t.id,i+1);}}return value;};
    return {teacherCost,edgeCost,repurposeCost,total};
  }
  function optimise(s,ctx,d,demands,options={}){
    const checkBudget=options.checkBudget;if(checkBudget)checkBudget();
    ensure(s);const resolve=subjectResolver(ctx.days[d]?.teachingGroups,s.systemConfig),preferencePriority=preferenceOrder(options.preferences??s.systemConfig?.allocationPreferences),enabled=ruleToggles(options.ruleEnabled??s.systemConfig?.allocationRuleEnabled),preferences=preferencePriority.filter(id=>enabled[id]),fillOnly=options.fillOnly===true,excludedIds=new Set(ctx.people.filter(p=>!reliefCandidateEligible(p)).map(p=>p.id)),live=effectiveAssignments(s).filter(a=>a.date===d),fixed=fillOnly?live:live.filter(a=>protectedAssignment(a)||excludedIds.has(a.staffId)||periodStarted(ctx,d,a.period,a)),peerPending=pendingPeerRequests(s,ctx,d),peerDemandIds=new Set(peerPending.flatMap(r=>r.demandIds)),fixedIds=new Set([...peerDemandIds,...fixed.map(a=>a.demandId),...manualOwnership(s,d).map(a=>a.demandId),...demands.filter(dem=>manualDecisionForDemand(s,dem)).map(dem=>dem.id)]),pending=demands.filter(dem=>!dem.noReliefRequired&&resolve(dem).reliefRequired&&!fixedIds.has(dem.id)&&!periodStarted(ctx,d,dem.period,dem)).sort((a,b)=>a.period-b.period||a.id.localeCompare(b.id)),byDemand=new Map(pending.map(dem=>[dem.id,dem])),previous=fillOnly?[]:live.filter(a=>!protectedAssignment(a)&&!a.noRelief&&!excludedIds.has(a.staffId)&&!periodStarted(ctx,d,a.period,a)),oldIds=new Set(previous.map(a=>a.id));
    const base={...s,assignments:s.assignments.filter(a=>!oldIds.has(a.id))},tm=teacherContext(base,ctx,d),teachers=[...tm.values()].filter(t=>reliefCandidateEligible(t.person)&&(t.person.active||t.dailyRoster&&t.ext)&&(!t.ext||t.dailyRoster)&&!t.identityConflict&&(!t.canonicalId||t.canonicalId===t.id)).map(t=>{if(checkBudget)checkBudget();const eligible=pending.filter(dem=>eligibility(t,dem.period,[],{demand:dem,repurpose:recessDuty(t,dem.period,dem)}).autoEligible);return {...t,eligibleDemands:new Set(eligible.map(dem=>dem.id)),consecutiveExcludedDemands:new Set(pending.filter(dem=>!countsConsecutive(t,dem)).map(dem=>dem.id)),eligible:new Set(eligible.filter(dem=>!recessDuty(t,dem.period,dem)).map(dem=>dem.period)),repurposePeriods:new Set(eligible.filter(dem=>recessDuty(t,dem.period,dem)).map(dem=>dem.period))};}).filter(t=>t.eligible.size||t.repurposePeriods.size).sort((a,b)=>a.id.localeCompare(b.id)),population=new Set(teachers.map(t=>t.id)),candidates=new Map();
    for(const p of new Set(pending.map(d=>d.period))){if(checkBudget)checkBudget();ranked(base,ctx,d,p,[],tm,preferencePriority,enabled).forEach(r=>candidates.set(r.staffId+'|'+p,r));}
    for(const dem of pending.filter(dem=>matchesSubjectPattern(dem.subject,s.systemConfig?.consecutiveCountExclusions)))ranked(base,ctx,d,dem.period,[dem],tm,preferencePriority,enabled).forEach(r=>candidates.set(r.staffId+'|d:'+dem.id,r));
    const baseline=ctx.baselineDays?.[d]||ctx.days[d];for(const t of teachers){const row=baseline.teachers.find(row=>row.staffId===t.id);t.teachingProfile=row?.teachingProfile||teachingProfile(row?.weekCells||row?.cells||[],baseline.formClasses,baseline.teachingGroups,baseline.subjectCategories,s.systemConfig);}
    const blockPolicy=consecutiveBlocks(s,ctx.days[d],demands,pending,fixed),weights=allocationCosts(teachers,candidates,preferences,pending,ctx.days[d],s.systemConfig),result=solveConsecutiveCoverage(teachers,pending,weights,blockPolicy,options),originalScore=score(teachers,population,previous,previous);
    const validPrevious=blockPolicy.valid(previous)&&new Set(previous.map(a=>a.demandId)).size===previous.length&&new Set(previous.map(a=>a.staffId+'|'+a.period)).size===previous.length&&previous.every(a=>{const dem=byDemand.get(a.demandId);return dem&&dem.period===a.period&&dem.staffId!==a.staffId&&teachers.some(t=>t.id===a.staffId&&(a.repurposedDuty?recessDuty(t,a.period,dem):cost(a)===1&&t.eligibleDemands.has(a.demandId)));})&&!violation(teachers,previous)&&teachers.every(t=>previous.filter(a=>a.staffId===t.id).reduce((n,a)=>n+cost(a),0)<=allocationCapacity(t));
    const originalCost=validPrevious?weights.total(previous):null;let next=result.assignments,bestScore=score(teachers,population,next,previous),bestCost=weights.total(next);
    // Bounded local exchanges use the same complete-allocation comparison as the flow.
    // They cannot reinstate annual balancing above an Admin's higher ranked preference.
    let improvementPasses=0;for(;!blockPolicy.blocks.length&&!result.preferencesProven&&improvementPasses<Math.min(40,pending.length*2);improvementPasses++){if(checkBudget)checkBudget();let candidate=null,candidateScore=bestScore,candidateCost=bestCost;const counts=new Map(),added=new Map();for(const a of next)if(!a.repurposedDuty){counts.set(a.staffId,(counts.get(a.staffId)||0)+1);if(!added.has(a.staffId))added.set(a.staffId,[]);added.get(a.staffId).push(a);}
      for(let i=0;i<next.length;i++){if(checkBudget)checkBudget();const from=next[i];if(from.repurposedDuty)continue;const oldTeacher=tm.get(from.staffId),without=addCost(bestCost,negateCost(addCost(weights.edgeCost(oldTeacher,from,false),weights.teacherCost(oldTeacher,counts.get(from.staffId)-1))));
        for(const t of teachers){if(t.id===from.staffId||t.id===byDemand.get(from.demandId).staffId||!t.eligibleDemands.has(from.demandId))continue;const value=addCost(without,addCost(weights.edgeCost(t,from,false),weights.teacherCost(t,counts.get(t.id)||0))),comparison=compareCost(value,candidateCost);if(comparison>0||!eligibility(t,from.period,added.get(t.id)||[],{demand:byDemand.get(from.demandId)}).autoEligible)continue;
          // Check the receiver's complete work, including zero-R recess cover.
          const trial=next.map((a,j)=>j===i?{...a,staffId:t.id}:a);if(violation([t],trial))continue;const sc=score(teachers,population,trial,previous);if(comparison<0||sc.changes<candidateScore.changes){candidate=trial;candidateScore=sc;candidateCost=value;}}
      }if(!candidate)break;next=candidate;bestScore=candidateScore;bestCost=candidateCost;
    }
    const same=previous.length===next.length&&previous.every(a=>next.some(b=>a.demandId===b.demandId&&a.staffId===b.staffId&&a.period===b.period&&cost(a)===cost(b)&&!!a.repurposedDuty===!!b.repurposedDuty));
    const accept=!same&&(bestScore.coverage>originalScore.coverage||!validPrevious||bestScore.coverage===originalScore.coverage&&compareCost(bestCost,originalCost)<0);
    const accepted=accept?next:previous,selected=new Map(accepted.map(a=>[a.demandId,a])),fixedById=new Map(fixed.map(a=>[a.demandId,a]));let decisionEvidence;
    if(s.systemConfig?.verboseLogging!==false){const candidateTeachers=new Map(teachers.map(t=>[t.id,t])),periodEvidence=[],reliefCapReasons=new Map();
    if(enabled.dailyRelief){
      const planned=new Map();for(const a of accepted){if(!planned.has(a.staffId))planned.set(a.staffId,[]);planned.get(a.staffId).push(a);}
      for(const dem of pending){if(selected.has(dem.id))continue;const block=blockPolicy.byDemand.get(dem.id);if(block?.blockedReason)continue;const unit=block?block.pendingIds.map(id=>byDemand.get(id)):[dem],available=teachers.filter(t=>(!block?.anchor||t.id===block.anchor)&&unit.every(lesson=>t.eligibleDemands.has(lesson.id)));
        if(available.length&&available.every(t=>t.allocationLimits.dailyRelief!=null&&heldReliefPeriods(t,[...(planned.get(t.id)||[]),...unit]).size>t.allocationLimits.dailyRelief))reliefCapReasons.set(dem.id,'Daily relief limit '+available[0].allocationLimits.dailyRelief+' reached.');
      }
    }
    for(const period of [...new Set(demands.map(dem=>dem.period))].sort((a,b)=>a-b)){if(checkBudget)checkBudget();const eligible=[],excluded=new Map(),eligibleRanks=new Map(),lessons=demands.filter(dem=>dem.period===period);for(const t of tm.values()){const rows=lessons.map(dem=>candidates.get(t.id+'|d:'+dem.id)||{...candidates.get(t.id+'|'+period),...eligibility(t,period,[],{demand:dem})}),e=rows.find(r=>r.autoEligible)||rows[0];if(e.autoEligible&&!excludedIds.has(t.id)){eligible.push(t.id);eligibleRanks.set(t.id,e);}else {const reasons=[...(excludedIds.has(t.id)?['This staff category is not included in relief candidates.']:[]),...e.reasons,...e.warnings,...(e.dailyReliefWarning?[e.dailyReliefWarning]:[]),...(e.automaticDailyViolation?['Configured maximum daily periods.']:[]),...(e.automaticStreakViolation?['Configured maximum consecutive periods.']:[]),...(t.ext?['External teachers are allocated manually.']:[])];const reason=reasons.join(' ')||'Not eligible for automatic allocation.';if(!excluded.has(reason))excluded.set(reason,[]);excluded.get(reason).push(t.id);}}periodEvidence.push({period,eligibleStaffIds:eligible,comparisons:eligible.map(id=>{const r=eligibleRanks.get(id);return r?{staffId:id,rank:r.rank,fairnessBand:Number.isFinite(r.fairnessBand)?r.fairnessBand:null,alternatives:r.alternatives,rotation:r.rotation}:null;}).filter(Boolean),excluded:[...excluded].map(([reason,staffIds])=>({reason,staffIds}))});}
    decisionEvidence={version:1,inputs:{baselineId:baseline.id||null,deploySource:deploySource(ctx,d),staplerRevision:ctx.days[d]?.staplerRevision||0,allocationRevision:s.dayRevisions?.[d]||0,accountingYear:year(d),accountingVerified:s.accountingYears?.[year(d)]?.verified===true,configUpdatedAt:s.systemConfig?.updatedAt||null},policy:{preferences,ruleEnabled:enabled,workloadLimits:workloadLimits(s.systemConfig),effectiveWorkloadLimits:workloadLimits(s.systemConfig),workloadCalculationSkipped:ctx.days[d]?.workloadIgnored===true,consecutiveSubjectRules:blockPolicy.rules,consecutiveCountExclusions:clone(s.systemConfig?.consecutiveCountExclusions||[]),objective:'Maximum feasible coverage, then ordered preferences across the complete plan.'},teachers:[...tm.values()].map(t=>({staffId:t.id,name:t.person.name,remaining:t.balance.remaining,capRemaining:t.balance.capRemaining,annualUtilisation:t.balance.utilisation,entitlement:t.balance.entitlement,alternatives:candidateTeachers.get(t.id)?.eligible.size||0,teachingProfile:candidateTeachers.get(t.id)?.teachingProfile||null})),periods:periodEvidence,lessons:demands.map(dem=>{const block=blockPolicy.byDemand.get(dem.id),manual=manualDecisionForDemand(s,dem),chosen=selected.get(dem.id),existing=fixedById.get(dem.id),policy=resolve(dem),disposition=manual?'smc-choice':peerDemandIds.has(dem.id)?'peer-pending':existing?'already-covered':dem.noReliefRequired||!policy.reliefRequired?'exempt':chosen?'selected':'uncovered';return {demandId:dem.id,period:dem.period,className:dem.className||'',subject:dem.subject||'',groupName:dem.groupName||'',venue:dem.venue||'',disposition,selectedStaffId:chosen?.staffId||existing?.staffId||null,subjectPolicy:policy,...(block?{consecutiveBlock:{subject:block.subject,periods:block.periods,demandIds:block.demandIds,anchor:block.anchor},...(block.blockedReason?{reviewReason:block.blockedReason}:{})}:{}),levels:lessonLevels(dem,ctx.days[d]?.formClasses,ctx.days[d]?.teachingGroups),...(manual?{manual:clone(manual)}:{}),...(chosen?{selectionExplanation:'Selected by the complete-plan coverage and ordered-preference comparison; this does not claim an individual first rank.'}:disposition==='uncovered'?{uncoveredReason:reliefCapReasons.get(dem.id)||(block?(block.blockedReason||block.subject+' consecutive '+block.periods+'-period block needs one eligible teacher for all remaining periods within quota and workload limits.'):periodEvidence.find(p=>p.period===dem.period)?.eligibleStaffIds.length?'Available candidates were needed elsewhere or reached complete-plan capacity or workload constraints.':'No automatically eligible teacher for this period.')}:{})};})};}
    if(checkBudget)checkBudget();
    const consecutiveBlockWarnings=blockPolicy.blocks.filter(block=>block.blockedReason||block.pendingIds.some(id=>!selected.has(id))).map(block=>({subject:block.subject,periods:block.periods,demandIds:block.demandIds,reason:block.blockedReason||block.subject+' needs one eligible teacher across the whole '+block.periods+'-period block. Remaining lessons are unfilled for review.'}));
    return {date:d,decisionEvidence,consecutiveBlockWarnings,preferences,ruleEnabled:enabled,workloadLimits:workloadLimits(s.systemConfig),policyScore:{before:originalCost,after:accept?bestCost:originalCost},assignments:accept?next:previous.map(({demandId,staffId,period,rCost,repurposedDuty})=>({demandId,staffId,period,rCost,repurposedDuty})),changed:accept,coverage:accept?bestScore.coverage:originalScore.coverage,fixedCoverage:fixed.filter(a=>!a.noRelief).length,manualUncovered:demands.filter(dem=>manualDecisionForDemand(s,dem)&&!fixedById.has(dem.id)&&!dem.noReliefRequired&&resolve(dem).reliefRequired).length,uncovered:pending.length-(accept?bestScore.coverage:originalScore.coverage)+demands.filter(dem=>peerDemandIds.has(dem.id)&&!fixed.some(a=>a.demandId===dem.id)).length+demands.filter(dem=>manualDecisionForDemand(s,dem)&&!fixedById.has(dem.id)&&!dem.noReliefRequired&&resolve(dem).reliefRequired).length,coverageProven:result.proven&&(!validPrevious||result.coverage>=previous.length),upperBound:result.upper,fairness:{before:originalScore.spread,after:accept?bestScore.spread:originalScore.spread,improvement:accept?originalScore.spread-bestScore.spread:0,population:[...population].sort(),changes:accept?bestScore.changes:0,search:'ordered allocation preferences; spread diagnostic only'},solver:{nodes:result.nodes,improvementPasses,preferencesProven:result.preferencesProven,searchComplete:result.searchComplete,status:result.preferencesProven?'optimal':'bounded',limits:{maxNodes:options.maxNodes||256}},candidates:teachers.map(t=>({staffId:t.id,annual:t.balance.utilisation,remaining:t.balance.remaining,alternatives:t.eligible.size,entitlement:t.balance.entitlement})),reason:same?'unchanged':accept?bestScore.coverage>originalScore.coverage?'higher coverage':!validPrevious?'invalid draft repaired':'saved allocation preferences improved':'retain stable draft: no ordered preference improvement'};
  }
  function schedule(now){
    const iso=new Date(now+8*3600000).toISOString(),today=iso.slice(0,10),minute=Number(iso.slice(11,13))*60+Number(iso.slice(14,16)),quiet=minute>=1290||minute<345;
    let date=today,optimise=false,report=null;
    if(minute>=960){date=addDays(today,1);optimise=minute%30===0;if(minute===960)report='initial';else if(optimise&&!quiet)report='new-absence';}
    else if(minute<345)optimise=minute%30===0;
    else if([345,360,375,389].includes(minute)){optimise=true;report=minute===345?'morning':minute===389?'final':'new-absence';}
    else if(minute===390)report='handover';
    // The tick receipt is minute-specific; retries belong to the last actual
    // allocation slot and expire at the next slot (or the 06:30 cutoff).
    const allocationMinute=minute>=960||minute<345?Math.floor(minute/30)*30:minute<390?[345,360,375,389].filter(n=>n<=minute).at(-1):null,allocationKey=allocationMinute===null?null:date+':'+today+'T'+String(Math.floor(allocationMinute/60)).padStart(2,'0')+':'+String(allocationMinute%60).padStart(2,'0');
    return {today,date,minute,quiet,optimise,report,key:date+':'+iso.slice(0,16),allocationKey,lateAbsenceWindow:minute>=390&&minute<=450};
  }
  function mayOptimise(ctx,d){const start=Date.parse(addDays(d,-1)+'T16:00:00+08:00'),end=Date.parse(d+'T06:29:59.999+08:00');return ctx.now>=start&&ctx.now<=end;}
  function warningEvents(s,ctx,summary){ensure(s);const quiet=schedule(ctx.now).quiet,events=[];for(const p of summary.periods){if(periodStarted(ctx,summary.date,p.period))continue;const key=summary.date+':'+p.period,old=s.healthWarningState[key]||{seen:[],episode:0};if(p.green.length>2){s.healthWarningState[key]={seen:[],episode:old.seen.length?old.episode+1:old.episode,last:p.green.length};continue;}if(!old.seen.includes(p.green.length)){events.push({key:'capacity:'+key+':'+old.episode+':'+p.green.length,period:p.period,count:p.green.length,date:summary.date,quiet});old.seen.push(p.green.length);}old.last=p.green.length;s.healthWarningState[key]=old;}return events;}
  return {deploymentTeachingEvidence,sreBasis,dailyRosterCalculation,reliefCandidateEligible,normalizeSubjectPatterns,matchesSubjectPattern,absencePeriods,defaultConsecutiveSubjectRules,normalizeConsecutiveSubjectRules,manualDecision,manualDecisionForDemand,manualOwnership,defaultSubjectFamilies,normalizeSubjectFamilies,normalizeTeachingGroupOverrides,subjectResolver,lessonSubject,teachingProfile,defaultRestrictedPeriods,defaultEmploymentRestrictions,preferenceRules,workloadRules,ruleToggles,workloadLimits,preferenceOrder,sameVenue,teacherSource,recessDuty,manualAssignments,manualModel,withManualAssignments,manualRanks,isClassLesson,ensure,clone,fail,norm,addDays,monday,year,cost,active,protectedAssignment,effectiveAssignments,accounted,corrected,initialiseHistory,annual,balances,weekQuota,captureWeek,addAudit,assertNewAuditIds,bumpDay,prepareClock,preparedClockConflict,periodStarted,periodEnded,reliefCompleted,teacherContext,eligibility,runAt,opportunities,health,rotation,ranked,optimise,score,solveCoverage,schedule,mayOptimise,warningEvents,pendingPeerRequests};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISRosterAllocation;
