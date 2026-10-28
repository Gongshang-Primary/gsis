const assert=require('node:assert/strict'),fs=require('node:fs'),make=require('./dom-helper.cjs');
const {dom,w,run}=make();
try{
 // Test authored UI modules before release integration regenerates app.js.
 run(fs.readFileSync('public/relief-ui.js','utf8'));
 run('(function(){'+fs.readFileSync('public/workload-ui.js','utf8')+';globalThis.currentWorkloadTable=workloadTeacherTable;})();');
 run(`v().reliefResults={teachers:[{teacherId:'t',name:'Test Teacher',R:0,breakdown:{capConfigured:true,normalR:10,periodCap:26,capWorkload:26,capHeadroom:0,capBasis:'total'}}]};renderReliefBreakdown(el('content'));`);
 assert.match(w.document.querySelector('.relief-table tbody').textContent,/weekly cap 26; counted total actual workload 26; cap headroom 0; final R 0/);
 assert.match(w.document.querySelector('.relief-formulas').textContent,/UT.*FTT, teaching, PD, duties and other countable non-teaching periods/);
 run(`v().reliefResults.teachers[0].breakdown.capBasis='teaching';renderReliefBreakdown(el('content'));`);
 assert.match(w.document.querySelector('.relief-table tbody').textContent,/counted FTT \+ teaching 26/);
 run(`const report=workloadData();report.rows[0].capBasis='total';report.rows[0].capUsed=26;el('content').replaceChildren();currentWorkloadTable(el('content'),report);`);
 const headers=[...w.document.querySelectorAll('.workload-ledger thead tr:first-child th')].map(x=>x.textContent),cap=headers.indexOf('Cap-counted periods');
 assert.ok(cap>=0);assert.equal(w.document.querySelector('.workload-ledger tbody tr').cells[cap].textContent,'26');
 assert.match(w.document.querySelector('.workload-ledger tbody tr').cells[cap].title,/total actual workload/i);
 run("offloadPage(el('content'))");assert.ok([...w.document.querySelectorAll('th')].some(th=>th.textContent==='Weekly cap'));
 assert.match(w.document.querySelector('#content .hint').textContent,/UT.*total actual workload/);
 console.log('PASS Deploy cap basis labels, UT/non-UT explanations, cap-counted totals and unchanged generic HR numeric cap control');
}finally{dom.window.close();}
