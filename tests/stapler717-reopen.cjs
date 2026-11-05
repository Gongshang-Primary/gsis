'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {harness,fixture,supplied}=require('./stapler715-persistence.cjs'),clone=x=>JSON.parse(JSON.stringify(x));
const f=fixture(),format=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
f.day.periods=f.day.periods.map(p=>({period:p.period,start:format(p.startMinutes),end:format(p.endMinutes),startMinutes:p.startMinutes,endMinutes:p.endMinutes}));
f.plan.periods=clone(f.day.periods);f.plan.baseline.periods=clone(f.day.periods);
const {day,people,plan}=f,h=harness(day,people),leaseSessionId=crypto.randomUUID(),read={operation:'stapler',date:day.date,leaseSessionId,calendarByDate:{[day.date]:{date:day.date,schoolDay:true,parity:day.parity}}},command=(operation,extra={})=>({...read,operation,view:'stapler',leaseFence:1,revision:1,staplerRevision:1,requestId:crypto.randomUUID(),...extra});
const counts={quota:0,profile:0,classes:0,register:0,model:0},stages=[];
function setup(scope,options={}){
 const dispatch=scope.rosterOperationsDispatch_;scope.rosterOperationsDispatch_=(...args)=>{try{return dispatch(...args);}catch(error){stages.push(error.failurePhase);throw error;}};
 scope.Utilities.formatDate=(date,tz,format)=>{const iso=new Date(date.getTime()+8*3600000).toISOString();return format==='yyyy-MM-dd'?iso.slice(0,10):format==='HH'?iso.slice(11,13):iso.slice(14,16);};
 scope.rosterIndex_=()=>{counts.register++;return {entries:[{id:options.baselineId||day.id,name:'Baseline',from:'2026-01-01',to:'2026-12-31',priority:1}]};};
 scope.rosterModel_=()=>{counts.model++;const week={perDay:day.periods.length,blocks:day.teachers.map(t=>({name:t.timetableName,cells:Array.from({length:5},()=>clone(t.cells)).flat()}))};return {layoutMode:'odd-even',odd:week,even:week,maxPeriod:day.periods.length-1,timing:{startMinutes:420,periodMinutes:30,endOfDayMinutes:810},recesses:[]};};
 scope.rosterOperationsQuota_=()=>{counts.quota++;if(options.quotaFailure)throw Object.assign(Error('Published quota unavailable'),{status:503});return {from:'2026-01-01',to:'2026-12-31',rows:[],formClasses:[],teachingGroups:[],subjectCategories:{},venues:clone(plan.venues)};};
 scope.rosterOperationsFormClasses_=()=>{counts.classes++;return [];};
 const profile=scope.GSISRosterAllocation.teachingProfile;scope.GSISRosterAllocation.teachingProfile=(...args)=>{counts.profile++;return profile(...args);};
 if(options.oldContext){vm.runInContext(scope.rosterOperationsContext_.toString().replace("const savedRead=p.operation", "const savedRead=false&&p.operation"),scope);const currentNeedsQuota=scope.rosterOperationsNeedsQuota_;scope.rosterOperationsNeedsQuota_=p=>p.operation==='stapler'||currentNeedsQuota(p);}
 if(options.untypedBlob)vm.runInContext(scope.rosterOperationsUnpackPlans_.toString().replace(",'application/x-gzip','stapler.json.gz'",''),scope);
}
try{
 assert.equal(h.call(command('acquireStaplerLock',{leaseFence:0,revision:0,staplerRevision:0})).result.ok,true);
 const saved=h.call(command('saveStapler',{plan,revision:0,staplerRevision:0})).result;assert.equal(saved.ok,true,JSON.stringify(saved));
 const stored=h.state();let startWrites=h.writes();
 // Reproduce the metadata-loss failure under a Blob adapter requiring gzip type/name.
 // This host-contract test is not evidence that the production execution failed here.
 const list=h.call({operation:'staplerDates'},{inspect:scope=>setup(scope,{untypedBlob:true})}).result;
 assert.equal(list.data.dates[0].draftRevision,1);
 const oldRead=h.call(read,{inspect:scope=>setup(scope,{untypedBlob:true})}).result;
 assert.equal(oldRead.status,503);assert.equal(stages.at(-1),'stapler-unpack');assert.equal(h.writes(),startWrites);assert.deepEqual(h.state(),stored);
 const recovered=h.call(read,{instrumentValidation:true,actualContext:true,inspect:scope=>setup(scope,{quotaFailure:true})});
 assert.equal(recovered.result.ok,true,JSON.stringify(recovered.result));assert.deepEqual(recovered.result.data.plan,plan,'exact saved tiles, blanks, sources and metadata survive typed unpack');assert.equal(recovered.result.data.staplerRevision,1);assert.equal(recovered.result.data.confirmed,null);
 assert.deepEqual(recovered.validationChecks,{full:0,incremental:0,tiles:0});assert.equal(counts.quota,0);assert.equal(counts.profile,0);assert.equal(counts.classes,0);assert.equal(counts.register,1);assert.equal(counts.model,1);
 assert.equal(recovered.result.data.canEdit,true);assert.equal(recovered.result.data.canConfirm,true);
 // Compare the actual prior full-context response, not a hand-written expected projection.
 const oldStart=performance.now(),prior=h.call(read,{actualContext:true,inspect:scope=>setup(scope,{oldContext:true})}).result,oldMs=performance.now()-oldStart;
 assert.equal(prior.ok,true,JSON.stringify(prior));assert.deepEqual(prior.data,recovered.result.data);
 const previousCounts=clone(counts),newStart=performance.now();
 assert.equal(h.call(read,{actualContext:true,inspect:scope=>setup(scope,{quotaFailure:true})}).result.ok,true);
 const newMs=performance.now()-newStart;assert.equal(counts.quota,previousCounts.quota);assert.equal(counts.profile,previousCounts.profile);assert.equal(counts.classes,previousCounts.classes);
 const quotaBeforeWrites=counts.quota;for(const operation of ['saveStapler','confirmStapler']){const current=h.state(),result=h.call(command(operation,{revision:current.revision,staplerRevision:current.staplerPlans[0].revision,...(operation==='saveStapler'?{plan}:{})}),{actualContext:true,inspect:scope=>setup(scope,{quotaFailure:true})}).result;assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(result.data.plan.tiles,plan.tiles,'source-free lifecycle preserves every saved card');}assert.equal(counts.quota,quotaBeforeWrites,'suspended Save/Confirm do not require Deploy quota');assert.equal(h.state().staplerPlans[0].confirmed,true);h.replace(stored);startWrites=h.writes();
 const changed=h.call(read,{actualContext:true,inspect:scope=>setup(scope,{baselineId:'replacement'})}).result;
 assert.equal(changed.ok,true,JSON.stringify(changed));assert.deepEqual(changed.data.plan,plan);assert.equal(changed.data.baselineChanged,false);assert.equal(changed.data.canConfirm,true);assert.equal(changed.data.canReset,false);assert.equal(changed.data.comparisonBaselineId,'replacement');
 const unverified=h.call({...read,calendarByDate:{}},{actualContext:true,inspect:setup}).result;assert.equal(unverified.ok,true);assert.equal(unverified.data.canConfirm,true);assert.deepEqual(unverified.data.plan,plan);
 const legacy=clone(stored);delete legacy.staplerPlans[0].draft.validation;h.replace(legacy);const migrated=h.call(read,{instrumentValidation:true,actualContext:true,inspect:setup});assert.equal(migrated.result.ok,true);assert.equal(migrated.validationChecks.full,1);assert.deepEqual(migrated.result.data.plan,plan);assert.deepEqual(h.state(),legacy,'legacy read never rewrites the saved document');
 const bad=clone(stored);bad.staplerPlans[0].draft.validation.digest='wrong';h.replace(bad);const rejected=h.call(read,{actualContext:true,inspect:setup}).result;assert.equal(rejected.status,503);assert.equal(stages.at(-1),'stapler-proof');assert(!rejected.data?.plan);assert.deepEqual(h.state(),bad);assert.equal(h.writes(),startWrites);
 console.log('PASS saved Stapler reopen: MIME-contract failure reproduced; exact fresh-runtime retained draft, read-only quota isolation, unchanged projection, current baseline/Calendar/lease checks, Save/Confirm quota independence, legacy and invalid proof paths.');
 const report={scope:'Local signed fresh Apps Script VM and disk-backed Drive adapter. Host MIME contract and source behavior, not a production root-cause or latency claim.',before:{quotaReads:1,teacherProfiles:day.teachers.length,classCatalogueBuilds:1,elapsedMs:Math.round(oldMs*10)/10},after:{quotaReads:0,teacherProfiles:0,classCatalogueBuilds:0,elapsedMs:Math.round(newMs*10)/10},retainedReads:{register:1,model:1,calendar:'current gateway-supplied Calendar result'},planBytes:Buffer.byteLength(JSON.stringify(plan)),writesFromReads:0};
 fs.mkdirSync(path.resolve(__dirname,'../verification'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../verification/717-stapler-reopen.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{h.close();}
if(process.argv[2])supplied(path.resolve(process.argv[2])).catch(error=>{console.error(error);process.exitCode=1;});
