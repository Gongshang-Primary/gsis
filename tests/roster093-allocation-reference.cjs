'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib'),adapter=require('./roster701-adapter.cjs');
const R=require('../shared/roster.js'),S=require('../shared/roster-stapler.js'),copy=x=>JSON.parse(JSON.stringify(x)),blob=value=>({getBytes:()=>[...Buffer.from(value)],getDataAsString:()=>Buffer.from(value).toString('utf8')});
function setup(){
 const h=adapter(),scope=h.scope,cache=new Map(),counts={register:0,deploy:0,models:0,quotas:0};
 vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 Object.assign(scope.Utilities,{formatDate:(_,tz,format)=>format==='yyyy-MM-dd'?h.date:format==='HH'?'08':'00',newBlob:blob,gzip:b=>blob(zlib.gzipSync(Buffer.from(b.getBytes()))),ungzip:b=>blob(zlib.gunzipSync(Buffer.from(b.getBytes()))),base64Encode:v=>Buffer.from(v).toString('base64'),base64Decode:v=>[...Buffer.from(v,'base64')]});
 const contacts={rosterPeople:h.people.map(p=>({...p,adhocEligible:true})),user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterSMCIds:['alice'],rosterAdminIds:['alice']};
 const register={revision:1,entries:[{id:'baseline',name:'Baseline',modelFile:'model-1',from:'2026-01-01',to:'2026-12-31',priority:1}]},entry={id:'deploy',revision:1,commit:'published-1',store:'published-store'},deploy={revision:1,publicationSchema:1,published:entry,versions:[entry]},calendar={date:h.date,schoolDay:true,parity:'even',available:true,checkedAt:'first'};
 const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:h.teachers.map(t=>({name:t.name,cells:Array.from({length:85},(_,i)=>copy(t.cells[i%17]))}))};
 const model=R.validate({layoutMode:'odd-even',odd:week,even:copy(week),timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]}),quotaRows=h.people.map(p=>({id:p.id,R:4}));
 Object.assign(scope,{GSISRosterStapler:S,GSISRelief:{model:3},CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v)})},rosterIndex_:()=>{counts.register++;return copy(register);},rosterModel_:()=>{counts.models++;return copy(model);},book_:()=>({getId:()=> 'deploy-book'}),index_:()=>{counts.deploy++;return copy(deploy);},publishedEntry_:x=>x.published,reliefGuard_:(_,before)=>{counts.deploy++;assert.equal(before.revision,deploy.revision);},reliefRosterQuota_:(_,before,en)=>{counts.quotas++;return {from:'2026-01-01',to:'2026-12-31',rows:copy(quotaRows),formClasses:[],teachingGroups:[],venues:[],subjectCategories:{},source:{versionId:en.id,revision:en.revision,commit:en.commit,calculationVersion:3,cacheDay:h.date}};}});
 const input={operation:'read',view:'allocation',compact:true,date:h.date,calendarByDate:{[h.date]:calendar}},call=extra=>scope.rosterOperationsDispatch_({identity:h.ctx.user,input:{...input,...extra}},contacts),context=()=>scope.rosterOperationsContext_({identity:h.ctx.user,input},contacts,h.state());
 return {...h,cache,counts,contacts,register,entry,deploy,calendar,model,quotaRows,input,call,context};
}
let checks=0;function check(name,run){run();checks++;console.log('PASS '+name);}
check('warm allocation keeps current records but skips repeated model and quota preparation',()=>{
 const h=setup(),first=h.call();assert.equal(first.cacheReused,false);assert.match(first.allocationReferenceKey,/^[a-f0-9]{64}$/);
 const before={...h.counts},reads=h.calls.reads;h.calendar.checkedAt='second';const warm=h.call();
 assert.equal(warm.cacheReused,true);assert.equal(warm.allocationReferenceKey,first.allocationReferenceKey);assert.equal(h.counts.models,before.models);assert.equal(h.counts.quotas,before.quotas);assert.equal(h.calls.reads,reads+1,'mutable operations still read every time');assert.equal(h.calls.writes,0);
 assert.deepEqual(copy(warm.allocationModel),copy(first.allocationModel));assert.deepEqual(copy(warm.exportContext),copy(first.exportContext));
 console.log(JSON.stringify({cold:{models:before.models,quotas:before.quotas},warm:{models:h.counts.models-before.models,quotas:h.counts.quotas-before.quotas,operations:h.calls.reads-reads}}));
});
check('live absence, allocation ownership, audit and balances survive a warm reference',()=>{
 const h=setup();h.call();const state=h.state();state.absences.push({id:'absence',date:h.date,staffId:'alice',name:'Alice',typeId:'mc',periods:[2,3],reliefRequired:true,instructions:{}});h.O.apply(state,h.ctx,{operation:'assign',date:h.date,demandIds:['absence:2'],staffId:'bob'});state.revision++;h.setState(state);
 const view=h.call();assert.equal(view.cacheReused,true);assert.equal(view.revision,state.revision);assert.equal(view.absences.length,1);assert.equal(view.cellStates['absence:2'].staffId,'bob');assert.equal(view.allocationModel.teachers.find(t=>t.id==='bob').balance.weeklyUsed,1);assert(view.manualDecisions.length);assert.equal(h.calls.writes,0);assert.deepEqual(h.state().audit,state.audit);
});
check('a concurrent covering-teacher absence still reconciles a warm read without deleting human ownership',()=>{
 const h=setup(),s=h.state();s.absences.push({id:'absence',date:h.date,staffId:'alice',name:'Alice',typeId:'mc',periods:[2],reliefRequired:true,instructions:{}});h.O.apply(s,h.ctx,{operation:'assign',date:h.date,demandIds:['absence:2'],staffId:'bob'});s.revision++;h.setState(s);h.call();
 const latest=h.state();latest.absences.push({id:'bob-away',date:h.date,staffId:'bob',name:'Bob',typeId:'mc',periods:[2],reliefRequired:true,instructions:{}});latest.revision++;h.setState(latest);const view=h.call();assert.equal(view.cacheReused,true);assert.equal(view.assignments[0].staffId,'bob');assert.equal(view.assignments[0].invalidCover,true);assert.equal(view.manualDecisions[0].staffId,'bob');assert.equal(h.calls.writes,1);assert(h.state().audit.some(e=>e.operation==='reconcile'));
});
check('changed published Deploy, model identity, Contacts and Calendar invalidate baseline cache',()=>{
 for(const change of [h=>{h.entry.revision++;h.entry.commit='published-2';h.deploy.revision++;},h=>h.register.entries[0].modelFile='model-2',h=>h.contacts.rosterPeople[1].name='Bob renamed',h=>h.calendar.parity='odd',h=>h.calendar.sourceRevision='calendar-2']){const h=setup(),first=h.call();change(h);const next=h.call();assert.equal(next.cacheReused,false);assert.notEqual(next.allocationReferenceKey,first.allocationReferenceKey);assert.equal(h.counts.models,2);}
 const h=setup();h.context();h.calendar.schoolDay=false;const next=h.context();assert.equal(next.cacheReused,false);assert.equal(next.days[h.date].schoolDay,false);
});
check('configuration and name bridge changes invalidate cached teaching profiles',()=>{
 for(const change of [s=>s.systemConfig.subjectFamilies[0].name+=' revised',s=>s.nameBridges.push({staffId:'bob',timetableName:'Bob alternate'})]){const h=setup(),first=h.call(),s=h.state();change(s);s.revision++;h.setState(s);const next=h.call();assert.equal(next.cacheReused,false);assert.notEqual(next.allocationReferenceKey,first.allocationReferenceKey);}
});
check('revoked allocation authority is rejected before cached inputs are read',()=>{const h=setup();h.call();const before={...h.counts};h.contacts.user.rosterSMC=false;h.contacts.user.rosterAdmin=false;assert.throws(()=>h.call(),e=>e.status===403);assert.deepEqual(h.counts,before);});
check('current suspended lessons are composed after baseline reuse',()=>{
 const h=setup(),ctx=h.context(),day=copy(ctx.days[h.date]),s=h.state();h.call();day.teachers[0].cells[2][0]='MA';const plan=S.create({...day,date:h.date},{date:h.date});s.staplerPlans.push({date:h.date,baselineId:'baseline',revision:2,confirmed:true,draft:plan});s.revision++;h.setState(s);
 const next=h.context();assert.equal(next.cacheReused,true);assert.equal(next.days[h.date].staplerRevision,2);assert.equal(next.days[h.date].teachers[0].cells[2][0],'MA');assert.equal(next.baselineDays[h.date].teachers[0].cells[2][0],'EL');
});
check('suspended work on another date leaves baseline caps unchanged without rebuilding baseline cells',()=>{
 const h=setup();Object.assign(h.quotaRows[0],{periodCap:12,capConfigured:true,capBasis:'teaching',capVerified:true});const first=h.context(),alice=first.days[h.date].teachers[0];assert.equal(alice.capWorkload,10);assert.equal(alice.capHeadroom,2);
 const other='2026-10-15',base=S.create({...copy(first.days[h.date]),date:other},{date:other}),plan=S.apply(base,{type:'pit',tileId:base.tiles.find(t=>t.teacherId==='alice'&&t.period===2).id}),s=h.state();s.staplerPlans.push({date:other,baselineId:'baseline',revision:1,confirmed:true,draft:plan});s.revision++;h.setState(s);const next=h.context();assert.equal(next.cacheReused,true);assert.equal(next.days[h.date].teachers[0].capWorkload,10);assert.equal(next.days[h.date].teachers[0].capHeadroom,2);assert.notEqual(next.days[h.date].workloadIgnored,true);assert.equal(next.baselineDays[h.date].teachers[0].capWorkload,10);assert.equal(h.counts.models,1);
});
check('pending Deploy publication fails closed and cache corruption falls back safely',()=>{
 const h=setup();h.call();h.deploy.pendingFieldCommit={id:'pending'};assert.throws(()=>h.call(),e=>e.status===503);delete h.deploy.pendingFieldCommit;for(const key of h.cache.keys())h.cache.set(key,'broken');const next=h.call();assert.equal(next.cacheReused,false);assert.equal(next.timetable.verified,true);assert.equal(h.counts.models,2);
});
check('writes and noncompact allocation reads bypass the cached baseline path',()=>{
 const h=setup();h.call();const first=h.counts.models;h.call({compact:false});assert.equal(h.counts.models,first+1);const request={identity:h.ctx.user,input:{...h.input,operation:'assign',demandIds:[],staffId:'bob'}};h.scope.rosterOperationsContext_(request,h.contacts,h.state());assert.equal(h.counts.models,first+2);
});
check('allocation version proves the same reference without models or quota rows',()=>{
 const h=setup(),read=h.call(),before={...h.counts},probe=h.call({operation:'allocationVersion'});assert.equal(probe.allocationReferenceKey,read.allocationReferenceKey);assert.equal(probe.dayToken,read.dayToken);assert.equal(probe.revision,read.revision);assert.equal(probe.allocationClock,read.allocationClock);assert.equal(h.counts.models,before.models);assert.equal(h.counts.quotas,before.quotas);
 h.entry.revision++;h.deploy.revision++;assert.notEqual(h.call({operation:'allocationVersion'}).allocationReferenceKey,read.allocationReferenceKey);
 assert.equal(h.call({operation:'allocationVersion',calendarByDate:{}}).allocationReferenceKey,null);
 const s=h.state();s.revision++;s.absences.push({id:'other-date',date:'2026-10-15',staffId:'bob',periods:[2],reliefRequired:true});h.setState(s);h.cache.clear();const updated=h.call({operation:'allocationVersion'});assert.notEqual(updated.allocationChangeKey,read.allocationChangeKey,'other-date balance changes invalidate a saved projection after hint expiry');assert.notEqual(updated.revision,read.revision);
});
check('allocator status is live independently of cached allocation inputs',()=>{
 const h=setup();let run={state:'running'};h.scope.rosterAllocationRunRead_=()=>run;h.scope.rosterAllocationRunPublic_=r=>r;h.call();assert.equal(h.call({operation:'allocationVersion'}).allocatorRun.state,'running');run={state:'completed'};assert.equal(h.call({operation:'allocationVersion'}).allocatorRun.state,'completed');const before={...h.counts},reads=h.calls.reads;assert.equal(h.call({operation:'allocationVersion',statusOnly:true}).allocatorRun.state,'completed');assert.deepEqual(h.counts,before);assert.equal(h.calls.reads,reads);
});
console.log(checks+' allocation reference checks passed');
