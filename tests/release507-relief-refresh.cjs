const assert=require('node:assert/strict'),serverView=require('./relief-view-fixture'),{w,run}=require('./dom-helper.cjs')();
(async()=>{try{
 w.initial=serverView(JSON.parse(run('JSON.stringify(v())')));run("state.versions=[initial];tab='Relief Settings';render()");
 let fail=true,changes=0;const future=JSON.parse(run('JSON.stringify(v())'));future.relief={...w.initial.reliefAdmin.settings,timetablePeriods:55};
 const confirmed=serverView(future);w.mockAPI=async(action)=>{
  if(action==='change'){changes++;return {saved:true,delta:{resync:true}};}
  if(action==='delta')return {resync:true};
  if(action==='sync'){if(fail)throw Error('Display connection lost');return {user:{email:'test@gsps.edu.sg',roles:['Admin','KP']},versions:[{id:'v1',name:'Test',revision:2}],current:JSON.parse(JSON.stringify(confirmed)),revision:2,cacheKey:'fresh-key'};}
  throw Error('Unexpected '+action);
 };
 assert.equal(run('reliefResultData().byTeacher.t.quota'),60,'Initial zero-workload capacity uses the 60-period timetable window');
 run('api=mockAPI;queueCell({operation:"setReliefSettings",expected:null,value:{...v().reliefAdmin.settings,timetablePeriods:55}})');
 assert.equal(run('reliefResultData().byTeacher.t.quota'),null);await run('pumpQueue()');
 assert.equal(changes,1);assert.equal(run('queuedEdits().length'),0,'A display failure cannot undo a confirmed save');assert.equal(run('reliefResultData().byTeacher.t.quota'),null,'Old R cannot reappear after a confirmed rule save');
 assert.equal(w.document.querySelector('[data-relief-value="quota"]').textContent,'Refresh to update');assert.ok(w.document.querySelector('[data-relief-factor="timetablePeriods"]').disabled);assert.match(w.document.querySelector('#status').textContent,/Saved.*refresh needed/);
 fail=false;await run('refresh(true)');assert.equal(changes,1);assert.equal(run('reliefResultData().byTeacher.t.quota'),55);assert.equal(w.document.querySelector('[data-relief-value="quota"]').textContent,'55');
 // A poll that learns of changed inputs must withhold stale R if reload fails.
 fail=true;await run('refresh(false)');assert.equal(run('reliefResultData().byTeacher.t.quota'),null);assert.equal(w.document.querySelector('[data-relief-value="quota"]').textContent,'Refresh to update');assert.equal(changes,1);
 console.log('PASS 507 confirmed save and changed-input polling: failed refresh withholds stale R, preserves durable success, and recovers by read without duplicate writes.');
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
