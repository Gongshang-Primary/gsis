'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const {harness,sample}=require('./roster716-calculations.cjs'),R=require('../shared/relief'),A=require('../shared/roster-allocation'),fixture=require('./roster701-fixture.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
function workedExample(){
 const teachers=Array.from({length:84},(_,i)=>({id:'teacher'+i,name:'Teacher '+i,active:true,profile:{Role:'Teacher'}}));
 const workload={totals:{Teaching:29.13*84},rows:teachers.map((teacher,i)=>({teacher,active:true,rules:{eligible:true,cap:null,matched:i?[]:[{id:'appointment',percent:30}]},Teaching:i?(29.13*84-22)/83:22,FTT:5,pd:2,duties:0,otherNonTeaching:0}))};
 const result=R.analyse({teachers,relief:R.defaults(),offload:{tags:[]}},workload),row=result.rows[0],h=harness(),value=sample();
 const {teacherId,name,...own}=h.scope.reliefResultRows_(result,true)[0];
 assert(Math.abs(row.Wi-83.8475)<1e-10);assert(Math.abs(row.siuePeriods-46.1085)<1e-10);assert.equal(row.quota,0);
 return {...value,name:row.name,calculation:{...own,reference:result.reference}};
}
function instrument(source,delay=0){
 const h=harness(),scope=h.scope,cache=new Map(),count={index:0,source:0,history:0,projectionRows:0},times={},wait=new Int32Array(new SharedArrayBuffer(4));let uuid=0;
 for(let i=5;i<100;i++){const t={id:'teacher'+i,name:'Teacher '+i,active:true,profile:{Role:'Teacher'}};h.doc.teachers.push(t);h.doc.assignments.push({id:t.id+'EL',teacher:t.id,target:'1A',targetRef:'class1',subject:'EL'});}
 h.state.accountingYears['2026']={verified:true};h.state.entitlements=[{staffId:'plain',year:'2026',week:'2026-10-19',quota:8}];
 h.state.importedRelief=Array.from({length:3000},(_,i)=>({id:'past'+i,staffId:i%100===0?'plain':'teacher'+(i%100),date:'2026-10-12',status:'completed',rCost:1,origin:'imported'}));
 if(source)vm.runInContext(source.slice(source.indexOf('// Own-record projection.')),scope);
 scope.hash_=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');scope.Utilities={getUuid:()=>String(++uuid)};
 scope.CacheService={getScriptCache:()=>({get:k=>cache.get(k),getAll:ks=>Object.fromEntries(ks.filter(k=>cache.has(k)).map(k=>[k,cache.get(k)])),put:(k,v)=>cache.set(k,v),putAll:obj=>Object.entries(obj).forEach(([k,v])=>cache.set(k,v))})};
 const phase=(key,fn)=>{const start=performance.now();try{return fn();}finally{times[key]=(times[key]||0)+performance.now()-start;}};
 const idx=scope.index_,state=scope.rosterOperationsState_,project=scope.reliefResultRows_;
 scope.index_=b=>phase('index',()=>{count.index++;if(delay)Atomics.wait(wait,0,0,delay);return idx(b);});
 scope.reliefDocument_=()=>phase('source',()=>{count.source++;return copy(h.doc);});
 scope.rosterOperationsState_=()=>phase('history',()=>{count.history++;if(delay)Atomics.wait(wait,0,0,delay);return state();});
 scope.reliefResultRows_=(result,details)=>{count.projectionRows+=result.rows.length;return project(result,details);};
 scope.deployPhase_=(key,fn)=>phase(key,fn);
 const read=()=>{for(const key of Object.keys(count))count[key]=0;for(const key of Object.keys(times))delete times[key];const start=performance.now(),value=h.read();return {value,ms:performance.now()-start,counts:{...count},phases:{...times}};};
 return {...h,cache,read,scope};
}
function rolePolicy(){
 const snapshot=kp=>{
  const f=fixture();Object.assign(f.ctx,{minute:360,now:Date.parse(f.date+'T06:00:00+08:00')});f.ctx.iso=new Date(f.ctx.now).toISOString();
  for(const t of f.teachers){t.cells=f.blank();t.R=['bob','dora'].includes(t.staffId)?12:0;t.teachingProfile={subjects:[],levels:[]};}
  Object.assign(f.people.find(p=>p.id==='bob'),kp?{role:'HOD ICT',appointmentLevel:'HOD',groups:['KP','SMC'],offloadFactor:.3}:{role:'Teacher',appointmentLevel:'',groups:[],offloadFactor:0});
  A.captureWeek(f.state,f.ctx,f.date);f.state.accountingYears['2026']={verified:true};f.teachers.find(t=>t.staffId==='alice').cells[3]=['EL','4A','',''];
  f.O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'alice',date:f.date,typeId:'mc',periods:[3]});const dem=f.O.demand(f.ctx,f.state,f.date)[0];
  const ranked=A.ranked(f.state,f.ctx,f.date,3).map(x=>[x.staffId,x.rank]),manual=A.manualRanks(A.manualModel(f.state,f.ctx,f.date),dem).map(x=>[x.id,x.rank]);
  const automatic=copy(f.state),scheduled=copy(f.state);f.O.apply(automatic,f.ctx,{operation:'autoAllocate',date:f.date});scheduled.systemConfig.scheduledAllocationEnabled=true;f.O.scheduledTick(scheduled,{...f.ctx,service:true},f.ctx.now);
  const winners=s=>A.effectiveAssignments(s).map(a=>[a.staffId,a.period,a.demandId]);return {ranked,manual,automatic:winners(automatic),scheduled:winners(scheduled)};
 };
 const plain=snapshot(false),kp=snapshot(true);assert.deepEqual(kp,plain,'KP role alone cannot change manual, direct or scheduled selection');assert.equal(plain.automatic[0][0],'bob');assert.equal(plain.scheduled[0][0],'bob');
}
if(require.main===module){
 const h=instrument(),cold=h.read(),warm=h.read();assert.deepEqual(cold.value,warm.value);
 assert.deepEqual(cold.counts,{index:2,source:1,history:1,projectionRows:1});assert.deepEqual(warm.counts,{index:2,source:0,history:1,projectionRows:1});
 assert('roster.calculations-source' in warm.phases);assert('roster.calculations-history-read' in warm.phases);
 h.state.importedRelief.push({id:'newly-completed',staffId:'plain',date:'2026-10-19',status:'completed',rCost:2});assert.equal(h.read().value.completion.completed,warm.value.completion.completed+2,'returning view reads fresh relief history');
 h.en.revision++;h.idx.revision++;h.doc.loads[1].EL=19;const changed=h.read();assert.equal(changed.counts.source,1);assert.notEqual(changed.value.calculation.Ti,warm.value.calculation.Ti);
 h.contacts.user.rosterStaffId='hod';assert.equal(h.read().value.name,'Teacher hod');assert(!JSON.stringify(h.read().value).includes('Teacher plain'));
 const idx=h.scope.index_;let calls=0;h.scope.index_=b=>{const out=idx(b);if(++calls===2)out.revision++;return out;};assert.throws(()=>h.read(),e=>e.status===503,'source change between initial and final authoritative read is rejected');
 workedExample();rolePolicy();console.log('PASS 717 Calculations: cold/warm I/O counts, own projection, fresh history, source invalidation/race, configured arithmetic, KP-neutral direct/scheduled/manual ranking.');
 if(process.argv.includes('--compare')){
  const baseline=require('node:child_process').execFileSync('git',['show','v0.7.16:backend/Relief.gs'],{encoding:'utf8'}),median=xs=>xs.slice().sort((a,b)=>a-b)[Math.floor(xs.length/2)],output={fixture:{teachers:100,historyRows:3000,simulatedIndexAndHistoryReadMs:10,repeats:7}};
  for(const [label,source]of [['before',baseline],['after',null]]){const coldRuns=[],warmRuns=[];for(let i=0;i<7;i++){const f=instrument(source,10);coldRuns.push(f.read());warmRuns.push(f.read());}output[label]=Object.fromEntries([['cold',coldRuns],['warm',warmRuns]].map(([mode,rows])=>[mode,{medianMs:median(rows.map(x=>x.ms)),counts:rows[0].counts,phaseMedians:Object.fromEntries(Object.keys(rows[0].phases).map(k=>[k,median(rows.map(r=>r.phases[k]))]))}]));}
  fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/717-calculations-performance.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify(output,null,2));
 }
}
module.exports={workedExample};
