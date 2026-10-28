const assert=require('node:assert/strict'),vm=require('node:vm');
const settings=require('../package.json'),backendVersion=settings.gsisComponentVersions?.deployBackend||settings.gsisRelease;
const {ctx,sheets,props}=require('./storage.cjs'),run=s=>vm.runInContext(s,ctx);
const plain=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const stored=()=>JSON.stringify({sheets:[...sheets].map(([name,s])=>[name,s.data]),props:[...props]});
run(`
 props_().setProperty('LEASES','{}');
 var reliefId505=call('change',{operation:'create',sourceVersionId:id,duplicate:true,name:'Relief API fixture',requestId:Utilities.getUuid()}).versionId;
 var reliefDoc505=()=>document_(book_(),index_(book_()).versions.find(x=>x.id===reliefId505));
 var fixture505=reliefDoc505();
 Object.assign(fixture505,{
  from:'2027-01-01',to:'2027-12-31',
  loads:Object.fromEntries([1,2,3,4,5,6].map(level=>[String(level),{Assembly:1,FTGP:2,FTT:2,EL:level===1?12:28}])),
  classes:[{ref:'c1',level:'1',name:'A',shortName:'A'},{ref:'c2',level:'2',name:'A',shortName:'A'}],groups:[],
  teachers:[{id:'hod',name:'Illustrative HOD',active:true,profile:{Role:'HOD ICT','EO Appt Level':'HOD'}},{id:'sm',name:'Illustrative HOD SM',active:true,profile:{Role:'HOD SM','EO Appt Level':'HOD'}},{id:'inactive',name:'Inactive teacher',active:false},{id:'vp',name:'School leader',active:true,profile:{Role:'VP','EO Appt Level':'SL'}}],
  teacherDrafts:{},levelExclusions:[],
  assignments:[{id:'a1',teacher:'hod',target:'1A',subject:'EL'},{id:'a2',teacher:'hod',target:'1A',subject:'FT'},{id:'a3',teacher:'sm',target:'2A',subject:'EL'},{id:'a4',teacher:'sm',target:'2A',subject:'FT'}],
  organisations:{plt:[{id:'plt',name:'PLT',slots:['hod','sm']}]},duties:[{id:'duty',days:[0,1],teachers:{0:'hod',1:'sm'}}],
  workload:{categories:{},specialists:[]},offload:GSISTeachingRules.migrate(null),relief:GSISRelief.defaults(),
  membership:['HOD ICT','HOD SM','VP'].map(role=>{const row=Array(13).fill('');row[0]=role;row[12]=role==='VP'?'SL':'HOD';return row;})
 });
 fixture505.relief.blocks.hod=2.25;
 var publishIdx505=index_(book_());publishIdx505.active=reliefId505;publishIdx505.publishNext=reliefId505;
 persist_(book_(),publishIdx505,fixture505,null);
 var saveRelief505=value=>call('change',{operation:'saveDraft',versionId:reliefId505,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'505-relief',edits:[{operation:'setReliefSettings',expected:reliefDoc505().relief,value}]});
`);
const before=stored(),published=plain(run("call('relief',{})"));assert.equal(stored(),before,'Relief reads must not mutate sheets or properties');
assert.equal(published.version.id,run('reliefId505'));assert.equal(published.version.published,true);assert.equal(published.backendVersion,backendVersion);
assert.equal(published.units,'periods/week');assert.equal(published.schemaVersion,3);assert.equal(published.blockSource,'external');assert.equal(published.planningQuota,true);assert.equal(published.timetableAvailability,false);assert.equal(published.teachers.length,4);
let hod=published.teachers.find(t=>t.teacherId==='hod');near(hod.R,22);assert.ok(!('remainingR' in hod)&&!('blockPeriods' in hod)&&!('inputs' in hod));assert.equal(published.admin.rows[0].FTT,5);near(published.admin.rows[0].OF,0.3);assert.equal(published.admin.rows[0].legacyBlockPeriods,2.25);
assert.equal(published.teachers.find(t=>t.teacherId==='sm').R,0);assert.equal(published.teachers.find(t=>t.teacherId==='inactive').R,null);assert.equal(published.teachers.find(t=>t.teacherId==='vp').available,false);
assert.ok(!('blocks' in published.admin.settings));assert.ok(published.teachers.every(t=>!('profile' in t)&&!('email' in t)));
assert.equal(run("call('relief',{teacherId:'hod',year:'2027'}).teachers.length"),1);
for(const query of ["{teacherId:'missing'}","{versionId:'missing'}","{year:2026}"])assert.throws(()=>run(`call('relief',${query})`),e=>e.status===404);
for(const query of ["{teacherId:''}","{versionId:123}","{year:1999}","{year:2027.5}","{unknown:1}","[]"])assert.throws(()=>run(`call('relief',${query})`),e=>e.status===400);
run("c.people=[{id:'hod',name:'Unpublished Contacts change',active:false,profile:{Role:'VP'}}];c.roleCatalogue=[{role:'HOD ICT',level:'SL'}]");
assert.deepEqual(plain(run("call('relief',{})")),published,'Live Contacts changes must not silently alter version-owned calculations');
assert.throws(()=>run("saveRelief505({...reliefDoc505().relief,mode:'expected'})"),e=>e.status===400);run("saveRelief505({...reliefDoc505().relief,siuePercent:125})");
const current=plain(run("call('relief',{versionId:reliefId505})"));assert.equal(current.admin.settings.mode,'actual');assert.equal(current.version.published,false);hod=current.teachers.find(t=>t.teacherId==='hod');near(hod.R,25);assert.equal(current.admin.rows[0].comparison,undefined);assert.equal(current.admin.rows[0].FTT,5);
assert.deepEqual(plain(run("call('relief',{})")),published,'Published export must retain its immutable calculation until republished');
assert.equal(run('reliefDoc505().assignments.length'),4);assert.equal(run('reliefDoc505().loads["1"].EL'),12);assert.equal(run('reliefDoc505().membership.length'),3);
assert.ok(run("reliefDoc505().audit.some(a=>a.action==='setReliefSettings')"));
const stable=stored();assert.throws(()=>run("saveRelief505({...reliefDoc505().relief,blocks:{missing:3}})"),e=>e.status===400);assert.equal(stored(),stable);
assert.throws(()=>run("call('change',{operation:'saveDraft',versionId:reliefId505,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'505-relief',edits:[{operation:'setReliefSettings',expected:null,value:GSISRelief.defaults()}]})"),e=>e.status===409);
run("var copiedRelief505=call('change',{operation:'create',sourceVersionId:reliefId505,duplicate:true,name:'Independent relief copy',requestId:Utilities.getUuid()}).versionId;var blankRelief505=call('change',{operation:'create',sourceVersionId:reliefId505,duplicate:false,name:'Blank relief version',requestId:Utilities.getUuid()}).versionId;");
assert.equal(run("document_(book_(),index_(book_()).versions.find(x=>x.id===copiedRelief505)).relief.blocks.hod"),2.25);assert.equal(run("Object.keys(document_(book_(),index_(book_()).versions.find(x=>x.id===blankRelief505)).relief.blocks).length"),0);assert.equal(run("document_(book_(),index_(book_()).versions.find(x=>x.id===blankRelief505)).relief.schema"),3);
run("saveRelief505({...reliefDoc505().relief,blocks:{hod:4}})");assert.equal(run("call('relief',{versionId:copiedRelief505,teacherId:'hod'}).admin.rows[0].legacyBlockPeriods"),2.25);
assert.throws(()=>run("call('relief',{versionId:copiedRelief505,year:2027})"),e=>e.status===400);
for(const roles of [['KP'],['Admin']]){ctx.roles505=roles;run('c.user.roles=roles505');assert.equal(run("call('relief',{}).teachers.length"),4);assert.equal(run("'admin' in call('relief',{})"),roles.includes('Admin'));}
run('c.user.roles=[]');const denied=stored();assert.throws(()=>run("call('relief',{})"),e=>e.status===403);assert.equal(stored(),denied);run("c.user.roles=['Admin','KP']");
run("var indexSaved505=index_(book_());var blockedIndex505=JSON.parse(JSON.stringify(indexSaved505));blockedIndex505.pendingFieldCommit={id:'test-pending'};book_().getSheetByName('deploy_index').getRange('B2').setValue(JSON.stringify(blockedIndex505));");const pending=stored();assert.throws(()=>run("call('relief',{})"),e=>e.status===503);assert.equal(stored(),pending,'Read-only relief must not trigger durable recovery');
run("delete indexSaved505.published;book_().getSheetByName('deploy_index').getRange('B2').setValue(JSON.stringify(indexSaved505));");assert.throws(()=>run("call('relief',{})"),e=>e.status===404,'No implicit fallback to an unpublished version');
console.log('PASS 505 relief API: real persisted workload, actual pre-Block R, Admin detail and minimal KP contract, current roles, read-only pending refusal, published isolation, explicit version/year/teacher filters, settings validation/audit and independent version copies');
