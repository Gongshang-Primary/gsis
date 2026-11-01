'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fixture=require('./roster701-fixture.cjs');
const {O,state,ctx,date,teachers,people}=fixture();
ctx.minute=360;
const actor={...ctx,user:{...ctx.user,smc:false,admin:false}};
teachers.find(t=>t.staffId==='bob').cells[2]=['MA','3B','C2-01',''];
teachers.find(t=>t.staffId==='dora').R=0;
people.push({id:'external',name:'External relief',active:false,mobile:'89876543'});
assert.throws(()=>O.apply(state,ctx,{operation:'saveAdhoc',date,staffId:'external',periods:[2]}),/inactive/);
people.find(p=>p.id==='external').active=true;
O.apply(state,ctx,{operation:'saveAdhoc',date,staffId:'external',periods:[2]});
const absenceId=O.apply(state,actor,{operation:'saveAbsence',date,staffId:'alice',typeId:'mc',periods:[2,3]}).savedId;
const ds=O.demand(ctx,state,date).filter(d=>d.absenceId===absenceId),ids=ds.map(d=>d.id);
const input={operation:'candidates',purpose:'mutual',date,demandIds:ids,byPeriod:true};
const before=JSON.stringify(state),result=O.read(state,actor,input);
assert.equal(JSON.stringify(state),before,'candidate projection does not change operational state or queue notifications');
assert.equal(result.revision,state.revision);assert.equal(result.date,date);assert.equal(result.timetableId,'baseline');assert.equal(result.parity,'even');
assert.deepEqual(Object.keys(result.candidatesByPeriod),['2','3']);
for(const [period,rows] of Object.entries(result.candidatesByPeriod)){
 const individual=O.read(state,actor,{...input,byPeriod:undefined,demandIds:ds.filter(d=>d.period===Number(period)).map(d=>d.id)});
 assert.deepEqual(rows,individual.candidates,'batch retains each individual-period result');
 for(const row of rows)assert.deepEqual(Object.keys(row).sort(),['active','available','combineAllowed','external','name','reasons','staffId'],'ordinary users receive no colleague R, balances or contact details');
}
const row=(period,id)=>result.candidatesByPeriod[period].find(c=>c.staffId===id);
assert.equal(row(2,'bob').available,false,'busy periods remain unavailable');assert.equal(row(3,'bob').available,true);
assert.equal(row(2,'dora').available,false,'mutual requests cannot bypass R warnings');
assert.equal(row(2,'external').available,true,'activated external teachers remain candidates without a timetable row');
assert.equal(row(3,'external').available,false,'external activation remains period-scoped');
assert(!JSON.stringify(result).includes('89876543'),'no mobile values are disclosed');

// SMC can inspect other sources, while each group retains the existing combined-source rules.
const bobAbsence=O.apply(state,ctx,{operation:'saveAbsence',date,staffId:'bob',typeId:'mc',periods:[2]}).savedId;
const bobId=O.demand(ctx,state,date).find(d=>d.absenceId===bobAbsence).id;
assert.throws(()=>O.read(state,actor,{...input,demandIds:[bobId]}),e=>e.status===403,'ordinary users cannot batch another teacher’s lessons');
const combined=O.read(state,ctx,{...input,demandIds:[...ids,bobId]});
const minimal=rows=>rows.map(({staffId,name,available,reasons,external,combineAllowed})=>({staffId,name,active:true,available,reasons,external,combineAllowed:combineAllowed===true}));
const singleSMC=O.read(state,ctx,{...input,byPeriod:undefined,demandIds:[ids[0],bobId]}).candidates;
assert(singleSMC.every(c=>Object.hasOwn(c,'R')&&Object.hasOwn(c,'annual')),'individual SMC candidates retain quota detail');
assert.deepEqual(combined.candidatesByPeriod[2],minimal(singleSMC));
assert.deepEqual(combined.candidatesByPeriod[3],minimal(O.read(state,ctx,{...input,byPeriod:undefined,demandIds:[ids[1]]}).candidates));
assert(Object.values(combined.candidatesByPeriod).flat().every(c=>!Object.hasOwn(c,'R')&&!Object.hasOwn(c,'annual')),'matrix batches omit unused quota detail for all roles');
for(const demandIds of [undefined,[],[ids[0],ids[0]],Array.from({length:101},(_,i)=>'unknown-'+i),['removed-demand']])assert.throws(()=>O.read(state,actor,{...input,demandIds}),e=>e.status===400||e.status===409);
assert.throws(()=>O.read(state,actor,{...input,purpose:'allocation'}),e=>e.status===400,'batch mode is restricted to colleague arrangements');
const next='2026-10-15';ctx.days[next]=structuredClone(ctx.days[date]);
const nextId=O.apply(state,actor,{operation:'saveAbsence',date:next,staffId:'alice',typeId:'mc',periods:[2]}).savedId;
const nextDemand=O.demand(ctx,state,next).find(d=>d.absenceId===nextId).id;
assert.throws(()=>O.read(state,actor,{...input,demandIds:[ids[0],nextDemand]}),e=>e.status===409,'one batch cannot cross dates');
assert.throws(()=>O.read(state,{...actor,today:next},input),e=>e.status===403,'past arrangements remain read only');

// Entry display does not use R. Candidate and mutation checks still load current quota.
const backend=vm.createContext({});vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),backend);
assert.equal(backend.rosterOperationsNeedsQuota_({operation:'read',view:'entry'}),false);
for(const operation of ['candidates','requestMutual','respondMutual'])assert.equal(backend.rosterOperationsNeedsQuota_({operation,byPeriod:true,purpose:'mutual'}),true);
console.log('PASS v0.7.02 mutual candidates: one batch equals individual periods; ownership, privacy, external activation, bounds, dates and read-only state; entry display skips quota.');
