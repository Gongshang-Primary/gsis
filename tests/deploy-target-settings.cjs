const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const W=require('../shared/workload'),R=require('../shared/relief'),Rules=require('../shared/teaching-rules'),fixture=require('./helpers/deploy-target-fixture');
const analyse=d=>W.analyse(d,t=>Rules.calculate(t,d.offload)),row=(w,id='fajt')=>w.rows.find(r=>r.teacher.id===id);
let failed=0;function check(name,fn){try{fn();console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}}
check('default FT, 4/5, FAJT and RT targets, bands, status and relief match the recorded baseline',()=>{
 for(const mode of ['mixed','eligible']){
 const d=fixture();if(mode==='eligible'){d.teachers=d.teachers.filter(t=>t.id!=='rt');d.assignments=d.assignments.filter(a=>a.teacher!=='rt');}
 const before=JSON.stringify(d),w=analyse(d),r=R.analyse(d,w);
 const actual=w.rows.map(x=>({id:x.teacher.id,target:x.quota,band:x.band,status:x.status,R:r.byTeacher[x.teacher.id].quota}));
 assert.deepEqual(actual,JSON.parse(fs.readFileSync('tests/fixtures/deploy-target-defaults.json','utf8'))[mode]);
 assert.equal(JSON.stringify(d),before,'analysis must not modify saved settings');
 }
});
check('configured FAJT budget changes Target and relief R consistently',()=>{
 const d=fixture();d.teachers=d.teachers.filter(t=>t.id!=='rt');d.assignments=d.assignments.filter(a=>a.teacher!=='rt');
 const old=analyse(d),oldR=R.analyse(d,old).byTeacher.fajt;
 assert.ok(Number.isFinite(oldR.quota));
 d.relief.fajtWeeklyPeriods=60;let w=analyse(d),r=R.analyse(d,w).byTeacher.fajt;
 assert.equal(row(w).targetRetained,60/d.relief.weeklyPeriods);
 assert.equal(row(w).quota,2+(w.D-2)*60/d.relief.weeklyPeriods);
 assert.ok(row(w).quota<row(old).quota);assert.equal(r.rawQuota,oldR.rawQuota-5);assert.equal(r.quota,oldR.quota-5);
 for(const id of ['ft','ft2','part'])assert.equal(row(w,id).quota,row(old,id).quota);
 d.relief.weeklyPeriods=90;w=analyse(d);assert.equal(row(w).targetRetained,60/90);
 d.teachers.find(t=>t.id==='fajt').role='HOD ICT';assert.equal(row(analyse(d)).targetRetained,60/90,'no appointment stacking');
});
for(const [name,change] of [
 ['absent',d=>delete d.relief],['null',d=>d.relief=null],['legacy budgets',d=>d.relief={schema:2}],
 ...['fajtWeeklyPeriods','weeklyPeriods'].flatMap(k=>[undefined,null,0,-1,NaN,Infinity,'60'].map(value=>[k+'='+String(value),d=>{d.relief[k]=value;}])),
 ['unknown schema',d=>d.relief.schema=99],
 ['overflowing ratio',d=>{d.relief.weeklyPeriods=1e-308;d.relief.timetablePeriods=1e-308;d.relief.fajtWeeklyPeriods=1e308;}]
])check('unconfigured Target: '+name,()=>{
 const d=fixture();change(d);const w=analyse(d),x=row(w);assert.equal(x.targetRetained,null);assert.equal(x.quota,null);assert.equal(x.band,null);assert.equal(x.targetPending,true);
 assert.equal(row(w,'ft').quota,28.5,'unrelated full-time target remains available');
});
check('canonical and generated workload code contains no literal budget ratio',()=>{
 for(const f of ['shared/workload.js','public/workload-ui.js','public/app.js','backend/Code.gs','Deploy_Backend_v0.9.9.gs','Roster_Backend_v0.9.9.gs','public/edge-deploy-domain.js','roster-update/public/edge-deploy-domain.js','notification-worker/dashboard-worker.mjs','operations-worker/dashboard-worker.mjs'])assert.doesNotMatch(fs.readFileSync(f,'utf8'),/\b65\s*\/\s*84\b/,f);
});
check('generated Google workload uses the same configured settings',()=>{
 const source=fs.readFileSync('backend/Code.gs','utf8'),start=source.indexOf('var GSISWorkload='),end=source.indexOf("if(typeof module!=='undefined'&&module.exports)module.exports=GSISWorkload;",start);
 assert.ok(start>=0&&end>start);const ctx=vm.createContext({GSISRelief:R,GSISVenueGroups:require('../shared/venue-groups')});vm.runInContext(source.slice(start,end),ctx);
 const d=fixture();d.relief.fajtWeeklyPeriods=60;assert.equal(row(ctx.GSISWorkload.analyse(d,t=>Rules.calculate(t,d.offload))).targetRetained,60/d.relief.weeklyPeriods);
});
process.exitCode=failed?1:0;
