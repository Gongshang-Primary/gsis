const assert=require('node:assert/strict'),crypto=require('node:crypto'),fixture=require('./roster701-fixture.cjs'),adapter=require('./roster701-adapter.cjs'),A=require('../shared/roster-allocation.js');
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS',name);};
function setup(periods=[2,3]){
 const f=fixture();f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();
 for(const p of periods)f.teachers[0].cells[p]=['EL','4A','C1-01',''];
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods});
 A.captureWeek(f.state,f.ctx,f.date);f.state.accountingYears['2026']={verified:true};return f;
}
const allocate=f=>f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date,requestId:crypto.randomUUID()});
test('Manual auto allocation works after scheduled cutoff and skips started periods',()=>{
 const f=setup();f.ctx.minute=490;f.ctx.now=Date.parse(f.date+'T08:10:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();
 assert.equal(A.mayOptimise(f.ctx,f.date),false,'The scheduled optimiser remains outside its window.');
 const r=allocate(f);assert.equal(r.savedIds.length,1);assert.equal(f.state.assignments[0].period,3);assert.equal(f.state.assignments[0].status,'draft');assert.equal(f.state.publicationSnapshots.length,0);assert.equal(f.state.outbox.length,0);
 assert.equal(f.state.audit.at(-1).operation,'autoAllocate');
});
test('Fill-only preserves automatic, manual, published and No Relief Needed assignments exactly',()=>{
 const f=setup([2,3,4,5,6]),dem=f.O.demand(f.ctx,f.state,f.date),by=p=>dem.find(d=>d.period===p).id;
 for(const [period,staffId] of [[2,'bob'],[3,'charlie'],[4,'dora']])f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[by(period)],staffId});
 Object.assign(f.state.assignments[0],{origin:'automatic',protected:false});Object.assign(f.state.assignments[2],{status:'published',publishedAt:f.ctx.iso});
 f.O.apply(f.state,f.ctx,{operation:'setNoRelief',date:f.date,demandIds:[by(5)]});
 const before=structuredClone(f.state.assignments),proposal=A.optimise(f.state,f.ctx,f.date,dem,{fillOnly:true});
 assert.equal(proposal.assignments.length,1);assert.equal(proposal.assignments[0].period,6);
 const r=allocate(f);assert.equal(r.savedIds.length,1);assert.deepEqual(f.state.assignments.slice(0,before.length),before);assert.equal(f.state.assignments.at(-1).period,6);
 const after=structuredClone(f.state.assignments),rotation=f.state.rotationEvents.length;assert.equal(allocate(f).savedIds.length,0);assert.deepEqual(f.state.assignments,after);assert.equal(f.state.rotationEvents.length,rotation);
});
test('Automatic fill retains annual-history, authority, school-date and unknown-R safeguards',()=>{
 const f=setup();f.state.accountingYears={};f.state.entitlements.push({staffId:'bob',week:'2026-10-05',year:'2026',quota:4,mode:'imported'});const paused=allocate(f);assert.equal(paused.reason,'Annual accounting history is not verified.');assert.equal(f.state.assignments.length,0);
 f.state.accountingYears['2026']={verified:true};assert.throws(()=>f.O.apply(f.state,{...f.ctx,user:{...f.ctx.user,smc:false,admin:false}},{operation:'autoAllocate',date:f.date}),e=>e.status===403);
 assert.throws(()=>f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:'2026-10-13'}),/Past dates/);
 f.ctx.days[f.date].verified=false;assert.throws(()=>allocate(f),/confirmed school timetable/);f.ctx.days[f.date].verified=true;
 f.state.entitlements=[];for(const t of f.teachers)t.R=null;assert.equal(allocate(f).savedIds.length,0);assert.equal(f.state.assignments.length,0);
});
test('Fill-only accounts for existing quota use and consecutive-period constraints',()=>{
 const f=setup([2,3,5]);for(const r of f.state.entitlements)r.quota=r.staffId==='bob'?2:0;
 const ds=f.O.demand(f.ctx,f.state,f.date),assigned=ds.find(d=>d.period===2);f.O.apply(f.state,f.ctx,{operation:'assign',date:f.date,demandIds:[assigned.id],staffId:'bob'});Object.assign(f.state.assignments[0],{origin:'automatic',protected:false});
 for(const p of [0,1,4])f.teachers[1].cells[p]=['PD','','',''];
 const r=allocate(f);assert.equal(r.savedIds.length,1);assert.equal(A.balances(f.state,f.ctx,f.date).get('bob').remaining,0);assert.equal(f.state.assignments[0].period,2);
 const periods=new Set([...f.teachers[1].cells.flatMap((c,p)=>c.some(Boolean)?[p]:[]),...f.state.assignments.map(a=>a.period)]);assert(![0,1,2,3,4,5].every(p=>periods.has(p)));
});
test('Allocation projection includes health once and never exposes it to ordinary staff',()=>{
 const f=setup(),before=JSON.stringify(f.state),view=f.O.read(f.state,f.ctx,{operation:'allocation',date:f.date});assert(view.allocationModel);assert.equal(view.health.uncovered.length,2);assert.equal(view.health.date,f.date);assert.equal(JSON.stringify(f.state),before);
 const ordinary=f.O.view(f.state,{...f.ctx,user:{...f.ctx.user,smc:false,admin:false}},{view:'smc',date:f.date});assert.equal(ordinary.health,undefined);assert.equal(ordinary.allocationModel,undefined);
});
test('Within each suitability tier, remaining R precedes annual fairness with stable equal-R ties',()=>{
 const f=setup();f.state.systemConfig.allocationPreferences=['weeklyRemaining',...A.preferenceRules.map(r=>r.id).filter(id=>id!=='weeklyRemaining')];f.state.systemConfig.allocationRuleEnabled={alternatives:false,rotation:false,levelMatch:false,subjectMatch:false};const dem=f.O.demand(f.ctx,f.state,f.date)[0],model=A.manualModel(f.state,f.ctx,f.date);
 for(const t of model.teachers){if(t.id==='alice')continue;Object.assign(t.balance,{remaining:t.id==='bob'?8:4,R:10,utilisation:t.id==='bob'?90:0});}
 let rows=A.manualRanks(model,dem).filter(r=>r.id!=='alice');assert.equal(rows[0].id,'bob');assert(rows.every(r=>r.category===0&&r.tier===1));
 for(const t of model.teachers)if(t.id!=='alice')Object.assign(t.balance,{remaining:4,R:4,utilisation:0});
 const expected=['bob','charlie','dora'];assert.deepEqual(A.manualRanks(model,dem).filter(r=>r.id!=='alice').map(r=>r.id),expected);model.teachers.reverse();assert.deepEqual(A.manualRanks(model,dem).filter(r=>r.id!=='alice').map(r=>r.id),expected);
 for(const t of model.teachers)if(t.id==='bob')Object.assign(t.balance,{remaining:null,R:null,utilisation:null});
 rows=A.manualRanks(model,dem).filter(r=>r.id!=='alice');assert.equal(rows.at(-1).id,'bob');assert(rows.at(-1).unknownR);assert(!rows.at(-1).autoEligible);
});
test('Current Deploy R controls planning without rewriting historical annual entitlements',()=>{
 const f=setup(),dem=f.O.demand(f.ctx,f.state,f.date)[0];f.ctx.quotaRequested=true;const history=structuredClone(f.state.entitlements);
 f.teachers[1].R=8;f.teachers[1].quotaSource={versionId:'active-deploy',checkedFor:'2026-10-14'};let model=A.manualModel(f.state,f.ctx,f.date);
 assert.equal(A.manualRanks(model,dem)[0].id,'bob');assert.equal(A.balances(f.state,f.ctx,f.date).get('bob').R,8);assert.equal(A.annual(f.state,f.ctx,'bob').entitlement,4);
 f.teachers[1].R=null;const unavailable=A.weekQuota(f.state,f.ctx,'bob',f.date);assert.equal(unavailable.quota,null);assert.equal(unavailable.verified,false);assert.equal(A.weekQuota(f.state,f.ctx,'bob','2026-10-13').quota,4);
 model=A.manualModel(f.state,f.ctx,f.date);assert(!A.manualRanks(model,dem).find(r=>r.id==='bob').autoEligible);assert.deepEqual(f.state.entitlements,history);
 const row=f.state.entitlements.find(r=>r.staffId==='bob');row.excluded=true;assert.equal(A.weekQuota(f.state,f.ctx,'bob',f.date).quota,0);
 row.excluded=false;row.mode='special-holiday';row.quota=2;assert.equal(A.weekQuota(f.state,f.ctx,'bob',f.date).quota,2);
});
test('Existing revision and receipt contract makes auto allocation atomic and safely replayable',()=>{
 const f=setup(),h=adapter();Object.assign(h.ctx,f.ctx);h.setState(f.state);const p={operation:'autoAllocate',view:'smc',date:f.date,revision:f.state.revision,requestId:crypto.randomUUID()};
 h.loseNextResponse();assert.throws(()=>h.call(p),/Uncertain response/);assert.equal(h.calls.writes,1);const saved=h.state(),result=h.call(p);assert.equal(result.replayed,true);assert.equal(h.calls.writes,1);assert.equal(result.savedIds.length,2);assert.deepEqual(h.state(),saved);
 assert.throws(()=>h.call({...p,requestId:crypto.randomUUID()}),e=>e.status===409);assert.throws(()=>h.call({...p,date:'2026-10-15'}),e=>e.status===409);assert.equal(h.calls.writes,1);assert(!h.locked());
});
console.log(passed+' v0.7.05 allocation checks passed');
