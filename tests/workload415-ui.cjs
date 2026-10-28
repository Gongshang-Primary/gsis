const assert=require('assert/strict'),make=require('./dom-helper.cjs');const {w,run}=make();try{
run(`v().loads=Object.fromEntries([1,2,3,4,5,6].map(l=>[l,{Assembly:1,FTGP:2,FTT:2,Art:2,Music:2,PHE:4,TL:9,EL:8}]));v().teachers=[{id:'t',name:'Missing modifier',active:true},{id:'off',name:'Inactive',active:false}];v().assignments=[{id:'a',teacher:'t',target:'1P',subject:'Art'},{id:'b',teacher:'t',target:'1P',subject:'Music'},{id:'c',teacher:'off',target:'1P',subject:'EL'}];tab='Teachers';showInactiveTeachers=true;render()`);
assert.match(w.document.querySelector('#content').textContent,/Teaches Art but is missing/);assert.match(w.document.querySelector('#content').textContent,/Teaches Music but is missing/);
run("tab='IP Deploy';render()");assert.match(w.document.querySelector('#content').textContent,/Inactive assignment/);
run("tab='Ledger';render()");const heads=[...w.document.querySelectorAll('th')].map(t=>t.textContent);assert.ok(!heads.some(t=>t.includes('Actual minus specialist target')));assert.doesNotMatch(w.document.querySelector('#content').textContent,/Capacity split pending|Pool conflict/);
run('workloadSettings()');assert.equal(w.document.querySelector('[data-pool]'),null);assert.ok(w.document.querySelector('[data-specialist]'));assert.equal(w.document.querySelector('[data-no-ftt]'),null);
console.log('PASS 415 Teacher modifier warnings, IP inactive flags, summary reference table without removed difference column and configurable assignment-based specialist settings.');
}finally{w.close();}
