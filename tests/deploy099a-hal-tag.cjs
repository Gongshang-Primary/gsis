'use strict';
// 0.9.9a: HAL is a recognised Employment Modifier token. Its 30% offload is a
// Deploy "Staff tag" rule (configured in Teaching rules), and offloads stack:
// SH (Jnr KP 20%) + HAL 30% retains (1-0.2)*(1-0.3) = 0.56, i.e. OF 0.44.
const assert=require('node:assert/strict');
const Relief=require('../shared/relief.js'),Rules=require('../shared/teaching-rules.js');
const test=(name,run)=>{run();console.log('PASS',name);};
test('HAL in Employment Modifier keeps the employment type valid',()=>{
 assert.equal(Relief.employment({profile:{'Employment Modifier':'HAL'}}),'Full time');
 assert.equal(Relief.employment({profile:{'Employment Modifier':'4/5, HAL'}}),'4/5');
 assert.equal(Relief.employment({profile:{'Employment Modifier':'FAJT; HAL'}}),'FAJT');
 assert.equal(Relief.employment({profile:{'Employment Modifier':'XYZ'}}),null,'unknown tokens are still refused');
});
test('SH plus a HAL rule at 30% stacks multiplicatively',()=>{
 const catalogue=Rules.migrate(null);catalogue.tags.push({id:'staff-hal',name:'HAL',source:'Staff tag',match:'HAL',percent:30,actingPercent:'',periods:'',notes:''});
 const teacher={id:'bryan',name:'Bryan',active:true,profile:{Role:'Teacher','EO Appt Level':'SH','Employment Modifier':'HAL',Active:'Y'}};
 const rules=Rules.calculate(teacher,catalogue);
 assert.equal(rules.eligible,true);
 const of=Relief.offload(rules,catalogue);
 assert.equal(of.reason,'');assert.ok(Math.abs(of.OF-(1-(1-0.2)*(1-0.3)))<1e-9,'OF '+of.OF);
 assert.deepEqual(of.components.map(c=>[c.label,c.percent]).sort(),[['HAL',30],['Jnr KP',20]]);
 const without={...teacher,profile:{...teacher.profile,'Employment Modifier':''}};
 assert.ok(Math.abs(Relief.offload(Rules.calculate(without,catalogue),catalogue).OF-0.2)<1e-9,'SH alone stays 20%');
});
