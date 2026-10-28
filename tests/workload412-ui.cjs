const fs=require('fs'),assert=require('assert/strict'),vm=require('vm'),make=require('./dom-helper.cjs');
const {dom,w,run}=make();try{
 vm.runInContext(fs.readFileSync('public/vendor/katex/katex.min.js','utf8'),dom.getInternalVMContext());
 run(`v().teachers[0].profile={'Subject Modifier':'Art'};v().teachers[0].active=true;v().loads=Object.fromEntries([1,2,3,4,5,6].map(l=>[l,{Assembly:1,FTGP:2,FTT:2,Art:2,PHE:4,Music:2,TL:9,EL:15}]));v().classes=[{ref:'c1',level:'1',shortName:'P'}];v().assignments=[{teacher:'t',target:'1P',subject:'Art'},{teacher:'t',target:'1P',subject:'FT'}];tab='Workload';render();`);
 const metric=w.document.querySelector('.workload-totals');assert.match(metric.textContent,/Schoolwide/);assert.match(w.document.querySelector('.specialist-indicators').textContent,/Art/);assert.ok(w.document.querySelectorAll('.katex').length>0);assert.equal(w.document.querySelectorAll('.katex-error').length,0);
 const before=run('JSON.stringify(workloadData().totals)');run("workloadView='guide';render()");assert.equal(run('JSON.stringify(workloadData().totals)'),before);assert.ok(w.document.querySelectorAll('.katex').length>0);assert.ok(w.document.querySelector('math'));assert.equal(w.document.querySelectorAll('.katex-error').length,0);
 assert.ok(w.document.querySelector('.workload-guide .ledger-formula math'));assert.match(w.document.querySelector('.workload-guide').textContent,/FTT/);
 run("workloadView='overview';v().loads[1].Art=3;render()");assert.match(w.document.querySelector('.specialist-indicators').textContent,/3/);
 // Unavailable maths is not rendered as division by zero, and fallback never shows raw TeX.
 run("v().teachers[0].active=false;render()");assert.match(w.document.querySelector('.specialist-indicators').textContent,/Unavailable/);assert.match(w.document.querySelector('#content').textContent,/Unavailable/);
 run("window.katex=undefined;workloadView='guide';render()");assert.equal(w.document.querySelectorAll('.katex').length,0);assert.ok(!w.document.querySelector('.workload-guide').textContent.includes('\\frac'));assert.match(w.document.querySelector('.workload-guide').textContent,/A = actual FTT/);
 console.log('PASS one-line metric values, unchanged ledger, live draft updates, LaTeX/MathML examples, unavailable values and readable renderer fallback.');
}finally{dom.window.close();}
