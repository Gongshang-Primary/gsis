const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),fixture=require('./contacts502-fixture'),Rules=require('../shared/teaching-rules');
const f=fixture(),roles=f.sheets.get('roles'),contacts=f.sheets.get('contacts'),flags=['SL','SC','SMC','KP','TL','SDT','CMT','SAT','Support','MK'];
const examples=[['SH SL','SH'],['SH ML','SH'],['ST HAL','ST'],['LT','LT'],['MTT','MTT']];
examples.forEach(([role,level],i)=>{roles.data.push([role,role,...flags.map(k=>k==='CMT'?'1':''),level]);const row=contacts.data[i+2];row[f.headers.indexOf('Role')]=role;row[f.headers.indexOf('Appointment Status')]=i%2?'Ag':'Acting';});
const directory=f.post('bootstrap').data,people=directory.people.filter(p=>examples.some(([role])=>role===p.role));
assert.equal(people.length,5);
for(const p of people){assert.ok(p.groups.includes(p.role.startsWith('SH')?'SMC':'TL'));assert.ok(p.groups.includes('CMT'));assert.match(p.appointmentStatus,/^(Ag|Acting)$/);}
const catalogue=examples.map(([role,level])=>({role,level,groups:['CMT']}));
const teachers=people.map(p=>Rules.resolve({id:p.id,active:true,profile:{Role:p.role,'Appointment Status':p.appointmentStatus}},catalogue));
for(const t of teachers){assert.ok(t.groups.includes(t.role.startsWith('SH')?'SMC':'TL'));const substantive=Rules.resolve({...t,profile:{...t.profile,'Appointment Status':''}},catalogue);assert.deepEqual(t.groups,substantive.groups);}
const ctx={GSISTeachingRules:Rules};vm.runInNewContext(fs.readFileSync('shared/planning.js','utf8'),ctx);
const d={teachers,membership:examples.map(([role,level])=>[role,role,...flags.map(()=>''),level]),teacherDrafts:{},organisations:{dept:[]}};
for(const t of teachers)assert.equal(ctx.GSISPlanning.tlEligible(d,t.id),!t.role.startsWith('SH'));
ctx.GSISPlanning.checkGroups(d,'dept',[{id:'a',name:'Example',slots:['',''],tls:teachers.filter(t=>!t.role.startsWith('SH')).map(t=>t.id)}]);
for(const t of teachers.filter(t=>t.role.startsWith('SH')||t.role.startsWith('ST')))assert.equal(Rules.calculate(t,Rules.migrate(null)).offloadPercent,0,'Acting OF remains separate');
const st=teachers.find(t=>t.role==='ST HAL');d.teacherDrafts[st.id]={'Appointment Status':''};assert.equal(ctx.GSISPlanning.tlEligible(d,st.id),true);d.teacherDrafts[st.id]={Active:'N'};assert.equal(ctx.GSISPlanning.tlEligible(d,st.id),false);
assert.deepEqual(directory.user.roles,['Admin'],'Derived membership does not grant application access');
console.log('PASS 601 acting memberships: real Contacts directory and Deploy resolver agree, missing SH/ST flags repaired, TL selection/validation and acting OF preserved');
