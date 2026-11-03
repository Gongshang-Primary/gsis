'use strict';
const zlib=require('node:zlib'),test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),vm=require('node:vm'),adapter=require('./roster701-adapter.cjs'),A=require('../shared/roster-allocation.js');
function setup(time='06:00:00'){
 const h=adapter(),properties=new Map([['ROSTER_OPERATIONS_FILE','ops-file'],['ROSTER_VERSION_HINT','initial']]);
 const at=time=>{h.ctx.now=Date.parse(h.date+'T'+time+'+08:00');h.ctx.minute=Number(time.slice(0,2))*60+Number(time.slice(3,5));h.ctx.iso=new Date(h.ctx.now).toISOString();};at(time);
 h.ctx.dutySources={[h.date]:{available:true,staffIds:['alice'],source:{versionId:'fixture'}}};
 h.scope.props_=()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value),getProperties:()=>Object.fromEntries(properties),deleteProperty:key=>properties.delete(key)});
 const files=new Map(),read=h.scope.rosterReadFile_,blob=value=>{const bytes=Buffer.from(value);return {getBytes:()=>[...bytes],getDataAsString:()=>bytes.toString('utf8')};};
 Object.assign(h.scope.Utilities,{newBlob:blob,gzip:b=>blob(zlib.gzipSync(Buffer.from(b.getBytes()))),ungzip:b=>blob(zlib.gunzipSync(Buffer.from(b.getBytes()))),base64Encode:value=>Buffer.from(value).toString('base64'),base64Decode:value=>[...Buffer.from(value,'base64')]});
 h.scope.rosterCreateFile_=(_folder,name,content)=>{assert(!h.locked(),'checkpoint uploads stay outside writer lock');const id='work-'+files.size;files.set(id,{name,raw:content.getDataAsString()});return id;};
 h.scope.rosterReadFile_=id=>{if(files.has(id)){assert(!h.locked(),'checkpoint reads stay outside writer lock');return files.get(id).raw;}return read(id);};
 const c={user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true},rosterPeople:h.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']};
 let locks=0,contexts=0;const lock=h.scope.deployLock_,context=h.scope.rosterOperationsContext_;
 h.scope.deployLock_=(...args)=>{locks++;return lock(...args);};h.scope.rosterOperationsContext_=(...args)=>{contexts++;assert(!h.locked(),'preparation must stay outside writer lock');return context(...args);};
 h.scope.rosterServiceContacts_=()=>({identity:h.ctx.user,c});h.scope.rosterIndex_=()=>({entries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]});
 vm.runInContext(fs.readFileSync('backend/RosterAllocationRun.gs','utf8'),h.scope);
 const state=h.state();state.systemConfig.scheduledAllocationEnabled=true;state.accountingYears['2026']={verified:true};h.O.apply(state,h.ctx,{operation:'saveAbsence',date:h.date,staffId:'alice',typeId:'mc',periods:[2,3]});h.setState(state);
 return {...h,at,properties,files,c,counts:()=>({locks,contexts,reads:h.calls.reads,writes:h.calls.writes}),tick:()=>h.scope.rosterScheduledDispatch_({input:{operation:'scheduledRoster',scheduledTime:h.ctx.now}}),row:()=>h.scope.rosterAllocationRunRead_(h.date),manual:()=>h.scope.rosterOperationsDispatch_({identity:h.ctx.user,input:{operation:'autoAllocate',allocationMode:'reoptimise',date:h.date,requestId:crypto.randomUUID(),revision:h.state().revision}},c)};
}
test('minute receipts remain distinct while allocation retries keep the last actual scheduled slot',()=>{
 const s=t=>A.schedule(Date.parse('2026-10-14T'+t+':00+08:00'));
 assert.equal(s('06:01').allocationKey,s('06:00').key);assert.notEqual(s('06:01').key,s('06:00').key);assert.equal(s('06:14').allocationKey,s('06:00').key);assert.equal(s('06:15').allocationKey,s('06:15').key);assert.equal(s('05:44').allocationKey,s('05:30').key);assert.equal(s('06:30').allocationKey,null);assert.equal(s('16:29').allocationKey,s('16:00').key);assert.equal(s('16:00').date,'2026-10-15');assert.equal(s('06:01').optimise,false);
});
test('successful slot skips later minutes before any operational read, intake gate or writer lock',()=>{
 const h=setup();assert.equal(h.tick().run.status,'complete');const before=h.counts();h.scope.rosterAbsenceIntakeGate_=()=>{throw Error('completed slot must not enter intake');};
 for(let n=1;n<10;n++){h.at('06:'+String(n).padStart(2,'0')+':00');assert.equal(h.tick().allocationSkipped,true);}
 assert.deepEqual(h.counts(),before);assert.equal(h.state().optimisationRuns.length,1);
});
test('ten minute ticks after hard terminations consume two durable attempts then show a stopped state',()=>{
 const h=setup(),settle=h.scope.rosterAllocationRunLocked_;let attempts=0,terminated=false;
 h.scope.GSISRosterOperations={...h.O,scheduledTick(){attempts++;terminated=true;throw Error('Simulated hard termination');}};
 // The process cannot run its catch/finally settlement after Apps Script kills it.
 h.scope.rosterAllocationRunLocked_=fn=>{if(terminated)throw Error('Execution has terminated');return settle(fn);};
 let last;
 for(let n=0;n<10;n++){h.at('06:'+String(n).padStart(2,'0')+':00');terminated=false;try{last=h.tick();}catch(e){assert.match(e.message,/hard termination|already running/);}}
 assert.equal(attempts,2);assert.equal(h.row().state,'failed');assert.match(h.row().log.at(-1).message,/Auto-allocation stopped.*2 attempts/);assert.equal(last.allocationStopped,true);
 const before=h.counts();h.at('06:10:00');h.tick();assert.deepEqual(h.counts(),before);assert.equal(h.calls.writes,0);
});
test('attempt is durable before the first operations read, including a hard termination in that read',()=>{
 const h=setup(),read=h.scope.rosterReadFile_,settle=h.scope.rosterAllocationRunLocked_;let terminated=false;
 h.scope.rosterReadFile_=()=>{assert.equal(h.row().attempts,1);terminated=true;throw Error('Read timed out');};h.scope.rosterAllocationRunLocked_=fn=>{if(terminated)throw Error('Execution terminated');return settle(fn);};
 assert.throws(()=>h.tick(),/Relief records could not be read/);assert(h.row(),'first attempt must exist before the initial Google read');assert.equal(h.row().attempts,1);assert.equal(h.row().state,'running');h.scope.rosterReadFile_=read;
});
test('budget exhaustion checkpoints the due summary, preserves the draft and stops after two completed attempts',()=>{
 const h=setup('05:30:00');h.ctx.notificationsConfigured=true;const state=h.state();state.smcDutyRoster=[{date:h.date,staffIds:['alice']}];h.setState(state);
 const optimise=A.optimise;A.optimise=(...args)=>{h.ctx.now+=14500;return optimise(...args);};
 try{
  const first=h.tick();assert.equal(first.allocationYielded,true);assert.equal(h.row().state,'yielded');assert.equal(h.state().assignments.length,0);assert.equal(h.row().attempts,1);
  h.at('05:31:00');const resumed=h.tick();assert.equal(resumed.allocationTimedOut,true);assert.equal(resumed.notificationsQueued,1,'cached summary reports its newly queued intent');assert.equal(h.state().outbox.filter(j=>j.kind==='smc_report').length,1);assert.equal(h.row().state,'failed');
  h.at('05:32:00');assert.equal(h.tick().allocationYielded,true);assert.equal(h.row().attempts,2);
  h.at('05:33:00');assert.equal(h.tick().allocationTimedOut,true);assert.match(h.row().log.at(-1).message,/Auto-allocation stopped/);assert.equal(h.state().outbox.filter(j=>j.kind==='smc_report').length,1);
 }finally{A.optimise=optimise;}
 h.at('05:34:00');const before=h.counts();assert.equal(h.tick().allocationStopped,true);assert.deepEqual(h.counts(),before);assert.equal(h.manual().run.status,'complete');assert.equal(h.row().trigger,'manual');
});

test('accepted but unacknowledged allocation is recovered by its receipt before retry',()=>{
 const h=setup(),props=h.scope.props_;h.scope.props_=()=>({...props(),setProperty(key,value){if(key.startsWith('ROSTER_ALLOCATION_')&&/"state":"completed"/.test(value))throw Error('Status storage unavailable');return props().setProperty(key,value);}});
 h.loseNextResponse();assert.throws(()=>h.tick(),/Uncertain response/);assert.equal(h.state().assignments.length,2);assert.equal(h.calls.writes,1);
 h.scope.props_=props;h.at('06:03:00');h.tick();assert.equal(h.row().state,'completed');assert.equal(h.row().attempts,1);assert.equal(h.calls.writes,1);assert.equal(h.state().optimisationRuns.length,1);
});
test('an unknown save remains uncertain when receipt recovery cannot read Google',()=>{
 const h=setup(),drive=h.scope.rosterDriveRequest_,read=h.scope.rosterReadFile_;h.scope.rosterDriveRequest_=()=>{throw Error('Drive response unknown');};
 assert.throws(()=>h.tick(),/Drive response unknown/);assert.equal(h.row().state,'uncertain');h.scope.rosterReadFile_=()=>{throw Error('Google read unavailable');};h.at('06:03:00');assert.throws(()=>h.tick(),/Relief records could not be read/);assert.equal(h.row().state,'uncertain');assert.equal(h.row().attempts,1);
 h.scope.rosterReadFile_=read;h.scope.rosterDriveRequest_=drive;h.at('06:04:00');assert.equal(h.tick().run.status,'complete');assert.equal(h.row().attempts,2);assert.equal(h.calls.writes,1);
});
test('a later scheduled slot still allocates after an earlier slot stops',()=>{
 const h=setup(),tick=h.O.scheduledTick;let attempts=0;h.scope.GSISRosterOperations={...h.O,scheduledTick(s,ctx,stamp){attempts++;throw Error('Calculation unavailable');}};
 assert.throws(()=>h.tick(),/Calculation unavailable/);h.at('06:01:00');assert.throws(()=>h.tick(),/Calculation unavailable/);h.at('06:02:00');assert.equal(h.tick().allocationStopped,true);assert.equal(attempts,2);
 h.scope.GSISRosterOperations={...h.O,scheduledTick:tick};h.at('06:15:00');assert.equal(h.tick().run.status,'complete');assert.equal(h.row().attempts,1);
});
test('an expired first attempt is fenced before its successor and cannot submit a late draft',()=>{
 const h=setup(),slot=A.schedule(h.ctx.now),old=h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:{operation:'scheduledRoster',scheduledTime:h.ctx.now}},h.c,{trigger:'scheduled',date:h.date,scheduleKey:slot.key,tickKey:slot.key});
 h.at('06:03:00');const next=h.tick();assert(next.run,'expired slot must receive its bounded second attempt');assert.equal(next.run.status,'complete');assert.notEqual(h.row().fence,old.fence);assert.throws(()=>h.scope.rosterAllocationRunBeforeCommit_(old),e=>e.code==='ALLOCATION_ABANDONED');assert.equal(h.calls.writes,1);
});
test('changed configuration invalidates a cheap skip and keeps a newly due summary',()=>{
 const h=setup();h.ctx.notificationsConfigured=true;const state=h.state();state.smcDutyRoster=[{date:h.date,staffIds:['alice']}];h.setState(state);h.tick();
 const latest=h.state();latest.systemConfig.smcSummaryTimes.morning.push('06:01');h.setState(latest);h.scope.rosterOperationsVersionChanged_();const before=h.counts();h.at('06:01:00');h.tick();assert(h.counts().reads>before.reads);assert.equal(h.state().outbox.filter(j=>j.kind==='smc_report').length,2);assert.equal(h.state().optimisationRuns.length,1);
});
test('deadline checkpoints reach the flow search and discard an unfinished proposal',()=>{
 const h=setup(),state=h.state(),before=JSON.stringify(state);let flowChecks=0;
 assert.throws(()=>A.optimise(state,h.ctx,h.date,h.O.demand(h.ctx,state,h.date),{checkBudget(){if(new Error().stack.includes('at flow ')){flowChecks++;if(flowChecks===3)throw Object.assign(Error('Budget reached'),{code:'ALLOCATION_BUDGET'});}}}),e=>e.code==='ALLOCATION_BUDGET');
 assert.equal(flowChecks,3);assert.equal(JSON.stringify(state),before);
});
test('manual status replacement cannot reopen a completed scheduled slot',()=>{
 const h=setup();h.tick();h.manual();assert.equal(h.row().trigger,'manual');h.at('06:01:00');const before=h.counts();assert.equal(h.tick().allocationSkipped,true);assert.equal(h.counts().locks,before.locks);assert.equal(h.counts().contexts,before.contexts);assert.equal(h.state().optimisationRuns.length,2);assert.equal(h.row().trigger,'manual');h.at('06:02:00');const after=h.counts();h.tick();assert.deepEqual(h.counts(),after);
});
test('the second hard-killed attempt is reconciled after cutoff without running the allocator again',()=>{
 const h=setup('06:15:00'),lock=h.scope.rosterAllocationRunLocked_;let terminated=false,attempts=0;
 h.scope.GSISRosterOperations={...h.O,scheduledTick(){attempts++;terminated=true;throw Error('Hard stop');}};h.scope.rosterAllocationRunLocked_=fn=>{if(terminated)throw Error('Terminated');return lock(fn);};
 assert.throws(()=>h.tick(),/Hard stop/);terminated=false;h.at('06:28:00');assert.throws(()=>h.tick(),/Hard stop/);terminated=false;h.at('06:31:00');h.tick();assert.equal(attempts,2);assert.equal(h.row().state,'failed');assert.match(h.row().log.at(-1).message,/Auto-allocation stopped.*2 attempts/);
});
test('late source preparation cannot submit a draft after the reserved save deadline',()=>{
 const h=setup();h.scope.rosterVenuesBegin_=()=>{h.ctx.now+=111000;return null;};assert.throws(()=>h.tick(),e=>e.code==='ALLOCATION_BUDGET');assert.equal(h.calls.writes,0);assert.equal(h.state().assignments.length,0);assert.equal(h.row().state,'failed');
});
test('an invalidation failure cannot leave a successful publication hidden behind an idle hint',()=>{
 const h=setup(),props=h.scope.props_;h.tick();const state=h.state();state.massPublications[h.date]={at:h.ctx.iso};
 h.scope.props_=()=>({...props(),setProperty(key,value){if(key==='ROSTER_VERSION_HINT')throw Error('Version unavailable');return props().setProperty(key,value);}});
 h.scope.rosterAllocationRunLocked_(()=>h.scope.rosterOperationsCommit_(state));h.at('06:01:00');const before=h.counts();assert.equal(h.tick().code,'SKIPPED_BUSY','an uncertain version never authorizes a cached no-work result or a scheduled commit');assert.equal(h.counts().reads,before.reads);h.scope.props_=props;h.scope.rosterOperationsVersionChanged_();h.tick();assert(h.counts().reads>before.reads,'the recovered version must invalidate the old idle hint and read the successful publication');
});
test('all 32 distinct dated slots fit in one small ledger and old terminal dates are bounded',()=>{
 const h=setup(),day='2026-10-14',start=Date.parse('2026-10-13T16:00:00+08:00'),end=Date.parse(day+'T06:30:00+08:00');let count=0;
 for(let stamp=start;stamp<end;stamp+=60000){const slot=A.schedule(stamp);if(!slot.optimise)continue;h.ctx.now=stamp;const run=h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:{operation:'scheduledRoster',scheduledTime:stamp}},h.c,{trigger:'scheduled',date:day,scheduleKey:slot.key});h.scope.rosterAllocationRunLocked_(()=>h.scope.rosterAllocationRunWrite_({...run,state:'completed'},'Fixture durable completion'));count++;}
 assert.equal(count,32);const raw=h.properties.get('ROSTER_ALLOCATION_SLOTS:'+day);assert(raw.length<7500);assert.equal(Object.keys(JSON.parse(raw).slots).length,32);
 for(let n=0;n<20;n++){const date=new Date(Date.UTC(2026,8,n+1)).toISOString().slice(0,10);h.properties.set('ROSTER_ALLOCATION_SLOTS:'+date,JSON.stringify({...JSON.parse(raw),date}));h.properties.set('ROSTER_ALLOCATION_RUN:'+date,JSON.stringify({...h.row(),date,state:'completed'}));}
 h.at('06:29:00');const slot=A.schedule(h.ctx.now+86400000);h.ctx.now+=86400000;h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:{operation:'scheduledRoster',scheduledTime:h.ctx.now}},h.c,{trigger:'scheduled',date:slot.date,scheduleKey:slot.key});assert([...h.properties.keys()].filter(k=>k.startsWith('ROSTER_ALLOCATION_SLOTS:')).length<=2);assert([...h.properties.keys()].filter(k=>k.startsWith('ROSTER_ALLOCATION_RUN:')).length<=2);
});
test('duplicate delivery of a failed minute does not consume its next allocation attempt',()=>{
 const h=setup(),tick=h.O.scheduledTick;let attempts=0;
 h.scope.GSISRosterOperations={...h.O,scheduledTick(){attempts++;throw Error('Calculation unavailable');}};
 assert.throws(()=>h.tick(),/Calculation unavailable/);h.scope.GSISRosterOperations={...h.O,scheduledTick:tick};h.tick();assert.equal(h.row().attempts,1);assert.equal(h.state().assignments.length,0);
 h.at('06:01:00');assert.equal(h.tick().run.status,'complete');assert.equal(h.row().attempts,2);assert.equal(attempts,1);
});
test('manual takeover settles an expired scheduled ledger only after resolving its durable receipt',()=>{
 for(const outcome of ['absent','accepted','cancelled']){
  const h=setup(),slot=A.schedule(h.ctx.now),run=h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:{operation:'scheduledRoster',scheduledTime:h.ctx.now}},h.c,{trigger:'scheduled',date:h.date,scheduleKey:slot.key});
  if(outcome!=='absent'){const state=h.state();state.scheduleReceipts[slot.key]=outcome==='accepted'?{at:h.ctx.iso,optimise:true,allocationStatus:'complete'}:{at:h.ctx.iso,cancelled:true};h.setState(state);}
  h.at('06:03:00');h.manual();assert.equal(h.row().trigger,'manual');h.at('06:31:00');h.tick();const ledger=JSON.parse(h.properties.get('ROSTER_ALLOCATION_SLOTS:'+h.date));assert.equal(ledger.slots[slot.key.slice(11)].state,outcome==='accepted'?'completed':'stopped');assert.throws(()=>h.scope.rosterAllocationRunBeforeCommit_(run),e=>e.code==='ALLOCATION_ABANDONED');
 }
 const h=setup(),slot=A.schedule(h.ctx.now);h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:{operation:'scheduledRoster',scheduledTime:h.ctx.now}},h.c,{trigger:'scheduled',date:h.date,scheduleKey:slot.key});h.at('06:03:00');h.scope.rosterReadFile_=()=>{throw Error('Receipt read unavailable');};assert.throws(()=>h.manual(),/Relief records could not be read/);assert.equal(h.row().trigger,'scheduled');assert.equal(JSON.parse(h.properties.get('ROSTER_ALLOCATION_SLOTS:'+h.date)).slots[slot.key.slice(11)].state,'running');
});
test('slow context yields before 25 seconds and resumes without rebuilding it',()=>{
 const h=setup(),context=h.scope.rosterOperationsContext_;let builds=0;
 h.scope.rosterOperationsContext_=(...args)=>{builds++;const ctx=context(...args);h.ctx.now+=15000;return ctx;};
 const started=h.ctx.now,first=h.tick();assert.equal(first.code,'ALLOCATION_YIELDED');assert(h.ctx.now-started<25000);assert.equal(h.row().work.stage,'context');assert.equal(h.calls.writes,0);assert.equal(builds,1);
 const fence=h.row().fence;h.at('06:01:00');assert.equal(h.tick().run.status,'complete');assert.equal(builds,1,'resume reuses the verified dated context');assert.notEqual(h.row().fence,fence);assert.equal(h.row().attempts,1);assert.equal(h.state().assignments.length,2);
});
test('finished proposal checkpoints only a bounded delta and resumes without recalculating',()=>{
 const h=setup(),tick=h.O.scheduledTick,state=h.state(),marker='UNRELATED_RETAINED_HISTORY_';state.unrelatedHistory=marker.repeat(40000);h.setState(state);let calculations=0;
 h.scope.GSISRosterOperations={...h.O,scheduledTick(...args){calculations++;const result=tick(...args);h.ctx.now+=15000;return result;}};
 const started=h.ctx.now;assert.equal(h.tick().code,'ALLOCATION_YIELDED');assert(h.ctx.now-started<25000);assert.equal(h.row().work.stage,'prepared');assert.equal(h.calls.writes,0);
 const file=h.files.get(h.row().work.fileId);assert(file.raw.length<=262144);const data=JSON.parse(zlib.gunzipSync(Buffer.from(JSON.parse(file.raw).data,'base64')).toString());assert(!JSON.stringify(data).includes(marker),'unchanged historical payload does not enter the checkpoint');
 h.at('06:01:00');assert.equal(h.tick().run.status,'complete');assert.equal(calculations,1,'resume commits the saved proposal instead of running allocation again');assert.equal(h.row().attempts,1);assert.equal(h.calls.writes,1);assert.equal(h.state().unrelatedHistory,state.unrelatedHistory);
});
test('changed source and corrupt checkpoint fail closed before any source write',()=>{
 for(const corrupt of [false,true]){
  const h=setup(),tick=h.O.scheduledTick;h.scope.GSISRosterOperations={...h.O,scheduledTick(...args){const value=tick(...args);h.ctx.now+=15000;return value;}};h.tick();
  if(corrupt){const ref=h.row().work,file=h.files.get(ref.fileId);file.raw=file.raw.slice(0,-1)+'!';}
  else{const state=h.state();state.systemConfig.maxDailyPeriods=8;h.setState(state);h.scope.rosterOperationsVersionChanged_();}
  h.at('06:01:00');assert.throws(()=>h.tick());assert.equal(h.calls.writes,0);assert.equal(h.state().assignments.length,0);assert.equal(h.row().state,'failed');
 }
});
test('an overlapping tick returns SKIPPED_BUSY before Google or intake work',()=>{
 const h=setup(),slot=A.schedule(h.ctx.now);h.scope.rosterAllocationRunStart_({identity:h.ctx.user,input:{operation:'scheduledRoster'}},h.c,{trigger:'scheduled',date:h.date,scheduleKey:slot.key,tickKey:slot.key});const before=h.counts();
 h.scope.rosterReadFile_=()=>{throw Error('busy tick read Google');};h.scope.rosterAbsenceIntakeGate_=()=>{throw Error('busy tick entered intake');};
 assert.deepEqual(JSON.parse(JSON.stringify(h.tick())),{skipped:true,skippedBusy:true,code:'SKIPPED_BUSY'});assert.deepEqual(h.counts(),before);
});
test('same-revision foreground writes between preparation and lock are preserved on retry',()=>{
 const h=setup(),phase=h.scope.rosterOperationsPhase_;let injected=false;
 h.scope.rosterOperationsPhase_=(name,work)=>{if(name==='lock-wait'&&!injected){injected=true;assert(!h.locked());const current=h.state();current.outbox.push({id:'foreground-job',key:'foreground-key',kind:'fixture',status:'queued'});current.audit.push({id:'foreground-event',operation:'fixture',date:h.date});current.receipts.push({id:'foreground-receipt',actor:'fixture',digest:'fixture',revision:current.revision,result:{}});h.scope.rosterAllocationRunLocked_(()=>h.scope.rosterOperationsCommit_(current));}return phase(name,work);};
 assert.equal(h.tick().run.status,'complete');const saved=h.state();assert.equal(saved.outbox.filter(row=>row.id==='foreground-job').length,1);assert.equal(saved.audit.filter(row=>row.id==='foreground-event').length,1);assert.equal(saved.receipts.filter(row=>row.id==='foreground-receipt').length,1);assert.equal(h.calls.writes,2);assert.equal(h.counts().contexts,2,'version fencing forces new preparation after an intervening same-revision save');
});
test('cancellation and slot cutoff fence a yielded prepared proposal',()=>{
 for(const cancel of [true,false]){
  const h=setup(cancel?'06:00:00':'06:29:00'),tick=h.O.scheduledTick;h.scope.GSISRosterOperations={...h.O,scheduledTick(...args){const value=tick(...args);h.ctx.now+=15000;return value;}};assert.equal(h.tick().code,'ALLOCATION_YIELDED');
  if(cancel){h.scope.rosterAllocationRunCancel_({identity:h.ctx.user,input:{date:h.date,runId:h.row().id,requestId:crypto.randomUUID()}},h.c);h.at('06:01:00');h.tick();assert.equal(h.row().state,'cancelled');}
  else{h.at('06:31:00');h.tick();assert.equal(h.row().state,'failed');assert.equal(h.row().slotStopped,true);}
  assert.equal(h.state().assignments.length,0,'a cached proposal cannot bypass cancellation or the final cutoff');
 }
});
test('actual backend date context survives checkpoint serialization and restored callbacks',()=>{
 const h=setup(),acorn=require('acorn'),R=require('../shared/roster.js'),source=fs.readFileSync('backend/RosterOperations.gs','utf8'),node=acorn.parse(source,{ecmaVersion:'latest'}).body.find(row=>row.type==='FunctionDeclaration'&&row.id.name==='rosterOperationsContext_');vm.runInContext(source.slice(node.start,node.end),h.scope);
 const context=h.scope.rosterOperationsContext_,week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:h.teachers.map(t=>({name:t.name,cells:Array.from({length:85},(_,i)=>JSON.parse(JSON.stringify(t.cells[i%17])))}))},model=R.validate({layoutMode:'odd-even',odd:week,even:JSON.parse(JSON.stringify(week)),timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]});
 h.c.rosterPeople=h.people.map(row=>({...row,adhocEligible:true}));h.scope.rosterModel_=()=>model;h.scope.rosterOperationsQuota_=()=>({from:'2026-01-01',to:'2026-12-31',rows:h.people.map(row=>({id:row.id,R:4})),formClasses:[],teachingGroups:[],venues:[],subjectCategories:{},source:{versionId:'deploy-fixture',revision:1,commit:'fixture'}});
 h.scope.Utilities.formatDate=(value,_zone,format)=>{const sg=new Date(Number(value)+8*3600000);return format==='yyyy-MM-dd'?sg.toISOString().slice(0,10):String(format==='HH'?sg.getUTCHours():sg.getUTCMinutes()).padStart(2,'0');};
 let builds=0;h.scope.rosterOperationsContext_=(...args)=>{builds++;assert(!h.locked());const ctx=context(...args);h.ctx.now+=15000;return ctx;};
 const run=()=>h.scope.rosterScheduledDispatch_({input:{operation:'scheduledRoster',scheduledTime:h.ctx.now,calendarByDate:{[h.date]:{date:h.date,schoolDay:true,parity:'even',available:true}}}});
 assert.equal(run().code,'ALLOCATION_YIELDED');assert.equal(h.row().work.stage,'context');h.at('06:01:00');assert.equal(run().run.status,'complete');assert.equal(builds,1);assert.equal(h.state().assignments.length,2);
});
test('scheduled recovery reads durable receipts outside the writer lock',()=>{
 for(const outcome of ['absent','accepted','cancelled']){
  const h=setup(),slot=A.schedule(h.ctx.now),run=h.scope.rosterAllocationRunStart_({input:{operation:'scheduledRoster'}},h.c,{trigger:'scheduled',date:h.date,scheduleKey:slot.key,tickKey:slot.key});
  h.scope.rosterAllocationRunLocked_(()=>h.scope.rosterAllocationRunWrite_({...run,state:'committing'},'Fixture interrupted source submission'));
  if(outcome!=='absent'){const state=h.state();state.scheduleReceipts[slot.key]=outcome==='accepted'?{at:h.ctx.iso,optimise:true,allocationStatus:'complete'}:{at:h.ctx.iso,cancelled:true};h.setState(state);h.scope.rosterOperationsVersionChanged_();}
  const read=h.scope.rosterReadFile_;h.scope.rosterReadFile_=id=>{assert(!h.locked(),'scheduled receipt confirmation cannot hold the writer lock');return read(id);};h.at('06:03:00');h.tick();
  assert.equal(h.row().state,outcome==='cancelled'?'cancelled':'completed');assert.equal(h.row().attempts,outcome==='absent'?2:1);
 }
});
test('scheduled startup contention uses a short wait and skips without a Google read',()=>{
 const h=setup(),before=h.counts();h.scope.deployLock_=(_lock,wait)=>{assert(wait<=500,'scheduler admission cannot wait eight seconds for a foreground save');return false;};
 assert.equal(h.tick().code,'SKIPPED_BUSY');assert.equal(h.calls.reads,before.reads);assert.equal(h.calls.writes,0);assert.equal(h.row(),null);
});
test('a foreground receipt arriving during recovery is retained and confirmed on the next tick',()=>{
 const h=setup(),slot=A.schedule(h.ctx.now),run=h.scope.rosterAllocationRunStart_({input:{operation:'scheduledRoster'}},h.c,{trigger:'scheduled',date:h.date,scheduleKey:slot.key,tickKey:slot.key});h.scope.rosterAllocationRunLocked_(()=>h.scope.rosterAllocationRunWrite_({...run,state:'committing'},'Fixture unknown save'));
 const read=h.scope.rosterReadFile_;let injected=false;h.scope.rosterReadFile_=id=>{assert(!h.locked());const old=read(id);if(!injected){injected=true;const state=h.state();state.scheduleReceipts[slot.key]={at:h.ctx.iso,optimise:true,allocationStatus:'complete'};h.setState(state);h.scope.rosterOperationsVersionChanged_();}return old;};
 h.at('06:03:00');assert.equal(h.tick().code,'SKIPPED_BUSY');assert.equal(h.row().state,'committing');assert.equal(h.row().attempts,1);assert.equal(h.calls.writes,0);
 h.at('06:04:00');h.tick();assert.equal(h.row().state,'completed');assert.equal(h.row().attempts,1);assert.equal(h.calls.writes,0);
});
test('scheduled failure settlement reads its receipt outside the writer lock',()=>{
 const h=setup(),read=h.scope.rosterReadFile_;h.scope.rosterReadFile_=id=>{assert(!h.locked(),'failure settlement cannot read Google while holding the writer lock');return read(id);};h.scope.GSISRosterOperations={...h.O,scheduledTick(){throw Error('Fixture calculation failed');}};
 assert.throws(()=>h.tick(),/Fixture calculation failed/);assert.equal(h.row().state,'failed');assert.equal(h.calls.writes,0);
});
test('five-second state, Contacts and checkpoint I/O makes bounded forward progress',()=>{
 const h=setup(),state=h.state();h.ctx.notificationsConfigured=true;state.smcDutyRoster=[{date:h.date,staffIds:['alice']}];h.setState(state);
 const read=h.scope.rosterReadFile_,contacts=h.scope.rosterServiceContacts_,create=h.scope.rosterCreateFile_,write=h.scope.rosterDriveRequest_,context=h.scope.rosterOperationsContext_,tick=h.O.scheduledTick;let contexts=0,calculations=0;
 h.scope.rosterReadFile_=id=>{h.ctx.now+=5000;return read(id);};h.scope.rosterServiceContacts_=()=>{h.ctx.now+=5000;return contacts();};h.scope.rosterCreateFile_=(...args)=>{h.ctx.now+=5000;return create(...args);};h.scope.rosterDriveRequest_=(...args)=>{h.ctx.now+=5000;return write(...args);};
 h.scope.rosterOperationsContext_=(...args)=>{contexts++;const ctx=context(...args);h.ctx.now+=8000;return ctx;};h.scope.GSISRosterOperations={...h.O,scheduledTick(...args){calculations++;return tick(...args);}};
 let result;const elapsed=[],reads=[];
 for(let n=0;n<3;n++){h.at('06:0'+n+':00');const started=h.ctx.now,before=h.calls.reads;result=h.tick();elapsed.push(h.ctx.now-started);reads.push(h.calls.reads-before);assert(elapsed.at(-1)<25000,'cooperative fixture call must finish before25seconds');if(result.run?.status==='complete')break;assert.equal(result.code,'ALLOCATION_YIELDED');}
 assert.equal(result.run?.status,'complete','checkpoint continuation must complete instead of repeatedly saving the same preparation');assert.equal(contexts,1);assert.equal(calculations,1);assert.equal(reads.at(-1),1,'prepared resume reuses the one full operations read');assert.equal(h.row().attempts,1);assert.equal(h.calls.writes,1);assert.equal(h.state().assignments.length,2);assert.equal(h.state().outbox.filter(row=>row.kind==='smc_report').length,1,'the originally due summary survives staged preparation');assert.equal(result.notificationsQueued,h.state().outbox.length,'cached response counts every newly saved notification intent');
});
