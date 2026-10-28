'use strict';
const assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js'),adapter=require('./roster701-adapter.cjs'),crypto=require('node:crypto');
{
 const {O,state,ctx,date,teachers}=fixture(),admin={...ctx,user:{...ctx.user,smc:false}};
 assert.equal(state.systemConfig.scheduledAllocationEnabled,false);
 const rules=O.normalizeNoReliefSubjects([{type:'wildcard',value:'PD *'},{type:'wildcard',value:' pd   * '},{type:'exact',value:'A*B'},{type:'wildcard',value:'BLK (X)+?*'}]);assert.equal(rules.length,3);
 for(const subject of ['PD (ART)','pd  tl'])assert(O.matchesNoReliefSubject(subject,rules));
 for(const subject of ['PD','PDP','PD(ART)','AB','BLK XZZ'])assert(!O.matchesNoReliefSubject(subject,rules));assert(O.matchesNoReliefSubject('A*B',rules));assert(O.matchesNoReliefSubject('BLK (X)+?extra',rules));
 O.apply(state,ctx,{operation:'saveAbsence',staffId:'alice',date,typeId:'mc',periods:[2]});const old=state.absences[0];
 const chosenOrder=A.preferenceRules.map(r=>r.id).reverse();
 O.apply(state,admin,{operation:'saveSystemConfig',noReliefSubjects:[{type:'exact',value:'EL'}],allocationPreferences:chosenOrder,scheduledAllocationEnabled:false});
 assert.equal(O.previewAbsence(ctx,old).length,1,'saved absence retains original subject policy');
 O.apply(state,ctx,{operation:'saveAbsence',staffId:'alice',date,typeId:'mc',periods:[3]});assert.equal(O.previewAbsence(ctx,state.absences[1]).length,0,'new report applies saved policy');
 const smc={...ctx,user:{...ctx.user,admin:false}},smcConfig=O.read(state,smc,{operation:'systemConfig'});assert.equal(smcConfig.canEdit,false);assert.equal(smcConfig.nameBridges,null);assert.deepEqual(smcConfig.config.allocationPreferences,chosenOrder);assert.throws(()=>O.read(state,{...smc,user:{...smc.user,smc:false}},{operation:'systemConfig'}),e=>e.status===403);
 assert.throws(()=>O.apply(state,{...ctx,user:{...ctx.user,admin:false}},{operation:'saveSystemConfig'}),/Admin/);
 assert.deepEqual(O.read(state,admin,{operation:'systemConfig'}).config.allocationPreferences,chosenOrder,'saved priorities retain the exact Admin-selected order');
 const compact=O.read(state,ctx,{operation:'read',view:'report',date,compact:true}),full=O.read(state,ctx,{operation:'read',view:'report',date});assert.deepEqual(compact.noReliefSubjects,[{type:'exact',value:'EL'}]);assert.deepEqual(full.noReliefSubjects,compact.noReliefSubjects);
 const preview={id:'preview',staffId:'alice',date,periods:[2,3],noReliefSubjects:compact.noReliefSubjects};assert.deepEqual(O.previewAbsence(ctx,preview),[],'frontend preview policy omits excluded lesson instruction keys');assert.equal(O.previewAbsence(ctx,compact.absences.find(a=>a.id===old.id)).length,1,'edited records use their captured policy');
 const legacy={...old,id:'legacy',noReliefSubjects:undefined};state.absences.push(legacy);const legacyPublic=O.read(state,ctx,{operation:'read',view:'mine',date}).absences.find(a=>a.id==='legacy');assert.deepEqual(legacyPublic.noReliefSubjects,['PD','BLK','BLOCK','IMP'].map(value=>({type:'exact',value})));assert.equal(O.previewAbsence(ctx,legacyPublic).length,1,'legacy edits retain historical exclusions rather than current config');state.absences.pop();
 ctx.people[1].employment='FAJT';ctx.people[2].adhocEligible=false;
 O.apply(state,ctx,{operation:'saveAdhoc',staffId:'bob',date,periods:[2],employment:'SRE'});assert.equal(state.adhoc[0].employment,'FAJT','known modifier is server authoritative');
 assert.throws(()=>O.apply(state,ctx,{operation:'saveAdhoc',staffId:'charlie',date,periods:[2]}),/staff group/);
 ctx.dutySources={[date]:{available:true,staffIds:['alice'],source:{kind:'Contacts'}}};O.apply(state,ctx,{operation:'setDutySMC',date,staffIds:['alice'],start:'06:00',end:'18:00'});assert.equal(O.read(state,ctx,{operation:'dutyRoster',date}).source.kind,'Contacts');
}
{
 const {O,state,ctx,date}=fixture();ctx.quotaRequested=true;ctx.people[0].emails=['alice@ces.test','alice@gsps.edu.sg'];
 O.apply(state,ctx,{operation:'saveDailyEmploymentSettings',recipients:[{staffId:'alice'}],subject:'Daily staffing',time:'08:00'});assert.equal(state.dailyEmploymentSettings.recipients[0].emails.length,2);
 assert.throws(()=>O.apply(state,ctx,{operation:'sendDailyEmploymentReport',date,requestId:'manual0'}),/Publish/);
 ctx.minute=420;ctx.now=Date.parse(date+'T07:00:00+08:00');ctx.iso=new Date(ctx.now).toISOString();
 O.apply(state,ctx,{operation:'publish',date,allocationRevision:0});assert(state.massPublications[date],'successful empty publish records the workday');assert.equal(state.dailyEmploymentMail.length,0);
 ctx.minute=480;ctx.now+=3600000;ctx.iso=new Date(ctx.now).toISOString();ctx.service=true;O.scheduledTick(state,ctx,ctx.now);assert.equal(state.dailyEmploymentMail.length,2);assert.equal(state.dailyEmploymentSnapshots.length,1);const original=JSON.stringify(state.dailyEmploymentSnapshots[0]);
 O.scheduledTick(state,ctx,ctx.now);assert.equal(state.dailyEmploymentMail.length,2,'same scheduler tick does not duplicate email');
 state.absences.push({id:'later',date,staffId:'alice',name:'Changed later',typeLabel:'Other',reasonDetail:'Later correction',periods:[2]});
 O.apply(state,ctx,{operation:'sendDailyEmploymentReport',date,requestId:'manual1'});O.apply(state,ctx,{operation:'sendDailyEmploymentReport',date,requestId:'manual1'});assert.equal(state.dailyEmploymentMail.length,4);assert.equal(JSON.stringify(state.dailyEmploymentSnapshots[0]),original,'resends keep first snapshot');
 const teacher={...ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',admin:false,smc:false}};assert.equal(O.read(state,teacher,{operation:'dailyEmployment',date}).original,true);assert.throws(()=>O.apply(state,teacher,{operation:'saveDailyEmploymentSettings'}),/Admin or SMC/);
 ctx.today='2026-10-15';ctx.now+=86400000;ctx.iso=new Date(ctx.now).toISOString();assert.equal(O.read(state,ctx,{operation:'dailyEmployment',date}).snapshot.capturedAt,JSON.parse(original).capturedAt);assert.equal(O.read(state,ctx,{operation:'dailyEmployment',date:'2026-10-13'}).snapshot,null);
 state.massPublications['2026-10-13']={at:'2026-10-13T00:00:00Z'};assert.throws(()=>O.apply(state,ctx,{operation:'sendDailyEmploymentReport',date:'2026-10-13',requestId:'missing'}),/No original report snapshot/);
 assert(O.employmentEmail(state.dailyEmploymentSnapshots[0],'https://roster.gsps.edu.sg').htmlBody.includes('<table'));
}
{
 const h=adapter(),command={operation:'saveSystemConfig',noReliefSubjects:[{type:'wildcard',value:'PD *'}],allocationPreferences:A.preferenceRules.map(r=>r.id),scheduledAllocationEnabled:false,revision:0,requestId:crypto.randomUUID(),view:'systemConfig'};
 h.loseNextResponse();assert.throws(()=>h.call(command),/Uncertain/);const retried=h.call(command);assert(retried.replayed);assert.equal(h.calls.writes,1);assert.equal(h.state().audit.length,1,'config retries commit once');
}
{
 const h=adapter(),s=h.state();s.systemConfig.noReliefSubjects=[{type:'exact',value:'EL'}];s.revision=2;h.setState(s);
 const loaded=h.call({operation:'read',view:'report',date:h.date,compact:true}),preview={id:'preview',staffId:'alice',date:h.date,periods:[2,3],noReliefSubjects:loaded.noReliefSubjects},lessons=h.O.previewAbsence(h.ctx,preview),instructions=Object.fromEntries(lessons.map(l=>[l.lessonKey,'']));
 const command={operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[2,3],instructionsByDate:{[h.date]:instructions},revision:1,requestId:crypto.randomUUID(),view:'report'},policy=structuredClone(h.state().systemConfig);
 const saved=h.call(command);assert(saved.savedId);assert.deepEqual(h.state().absences[0].instructions,{});assert.deepEqual(h.state().absences[0].noReliefSubjects,policy.noReliefSubjects);assert.equal(saved.demands.length,0,'stale new report validates against the latest subject policy');assert.deepEqual(h.state().systemConfig,policy,'new report does not overwrite the independently updated policy');
 const committed=h.state();assert(h.call(command).replayed);assert.deepEqual(h.state(),committed);assert.equal(h.calls.writes,1,'exact receipt replay saves no second absence');
 assert.throws(()=>h.call({...command,id:saved.savedId,revision:loaded.revision,requestId:crypto.randomUUID(),periods:[2]}),/changed/);assert.deepEqual(h.state(),committed,'stale same-record edit cannot replace the saved report');
 h.ctx.days[h.date].teachers.find(t=>t.staffId==='bob').cells[4]=['EL','4A','C1-01',''];
 const oldPolicy={...preview,staffId:'bob',periods:[4],noReliefSubjects:[]},oldKey=h.O.previewAbsence(h.ctx,oldPolicy)[0].lessonKey;
 assert.throws(()=>h.call({...command,staffId:'bob',periods:[4],requestId:crypto.randomUUID(),instructionsByDate:{[h.date]:{[oldKey]:'Outdated excluded lesson'}}}),/Lessons changed/);assert.deepEqual(h.state(),committed,'old policy instruction keys are rejected by current lesson validation');
}
{
 const {O,state,ctx,date}=fixture();ctx.days={};state.staplerPlans.push({date,baselineId:'b',revision:1,draft:{schema:1}});assert.equal(O.read(state,ctx,{operation:'staplerDates'}).dates[0].date,date,'date list needs no current timetable');
 state.staplerRequests.push({id:'request',date,staffId:'bob',status:'pending'});const limited=O.read(state,{...ctx,user:{staffId:'bob',smc:false,admin:false}},{operation:'staplerDates'});assert.equal(limited.dates[0].baselineId,null);assert.equal(limited.dates[0].draftRevision,0,'unapproved requests do not expose another planner draft metadata');
}
console.log('PASS v0.7.10 operational policies, modifier authority, Contacts duty, original reports and retry receipts.');
