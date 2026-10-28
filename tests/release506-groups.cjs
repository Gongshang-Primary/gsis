const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const ctx=vm.createContext({GSISTeachingRules:require('../shared/teaching-rules')});vm.runInContext(fs.readFileSync('shared/planning.js','utf8'),ctx);const p=ctx.GSISPlanning,plain=x=>JSON.parse(JSON.stringify(x)),copy=plain;
const doc={teachers:Array.from({length:12},(_,i)=>({id:'t'+i,active:true,profile:{'EO Appt Level':'ST'}}))};
const legacy={id:'dept-a',name:'A',slots:['t0','t1','t2','','t3']},original=copy(legacy);
assert.deepEqual(plain(p.deputies(legacy)),['t1']);assert.deepEqual(legacy,original,'reading a legacy deputy does not rewrite the saved structure');
p.setDeputies(legacy,['t1','t4','t5']);legacy.tls=['t6','t7'];p.checkGroups(doc,'dept',[legacy]);
assert.deepEqual(plain(legacy.slots),['t0','t1','t2','t3']);assert.deepEqual(plain(p.deputies(legacy)),['t1','t4','t5']);assert.deepEqual(plain(p.members(legacy)),['t0','t1','t2','t3','t4','t5','t6','t7']);
const saved=copy(legacy);p.setDeputies(legacy,['t4','t5']);assert.deepEqual(plain(p.deputies(legacy)),['t4','t5']);assert.deepEqual(plain(legacy.slots.slice(2)),['t2','t3']);assert.equal(saved.slots[1],'t1','copies retain their own selections');
p.setDeputies(legacy,[]);assert.equal(legacy.slots[1],'');assert.deepEqual(plain(legacy.additionalDeputies),[]);assert.deepEqual(plain(legacy.tls),['t6','t7']);
assert.throws(()=>p.checkGroups(doc,'dept',[{...copy(saved),additionalDeputies:['t4','t4']}]),/once within/);
assert.throws(()=>p.checkGroups(doc,'dept',[{...copy(saved),tls:['t1']}]),/once within/);
assert.throws(()=>p.checkGroups(doc,'dept',[{...copy(saved),tls:['missing']}]),/active eligible/);
assert.throws(()=>p.checkGroups(doc,'dept',[{...copy(saved),additionalDeputies:'t4'}]),/Invalid department/);
assert.throws(()=>p.checkGroups(doc,'comm',[{id:'c',name:'C',slots:['','','',''],tls:['t1']}]),/Invalid department/);
p.checkGroups(doc,'dept',[saved,{id:'b',name:'B',slots:['t1','']}]);
for(const kind of ['dept','comm','cca','plt','events']){const roles=p.roles(kind),g={id:kind,name:kind,slots:Array(roles.length).fill('').concat(['t0','','t1','','t2',''])};g.slots[0]='t9';if(kind==='comm')g.legacyLeadership=[{role:'Head',teacher:'t8'}];p.checkGroups(doc,kind,[g]);assert.deepEqual(plain(g.slots),['t9',...Array(roles.length-1).fill(''),'t0','t1','t2']);assert.equal(g.slots[1],roles.length>1?'':'t0');if(kind==='comm')assert.deepEqual(plain(g.legacyLeadership),[{role:'Head',teacher:'t8'}]);}
const blank=copy(saved);p.clearAssignments('dept',blank);assert.deepEqual(plain(blank.slots),['','']);assert.equal(blank.additionalDeputies,undefined);assert.equal(blank.tls,undefined);assert.equal(blank.id,saved.id);assert.deepEqual(plain(p.deputies(saved)),['t1','t4','t5']);
console.log('PASS 506 groups: legacy slot compatibility, deputy/TLs selections, independent copies, uniqueness/eligibility, member gap closure, fixed role preservation and blank reset');
