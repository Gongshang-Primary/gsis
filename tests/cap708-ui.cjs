'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),serverView=require('./relief-view-fixture');
const {w,run}=require('./dom-helper.cjs')();
try{
 // Exercise the authored module before generated browser bundles are rebuilt.
 run(fs.readFileSync('public/relief-ui.js','utf8'));
 const doc=JSON.parse(run('JSON.stringify(v())'));doc.teachers[0].profile={Role:'Teacher','Employment Modifier':'UT'};w.confirmed=serverView(doc);
 const result=w.confirmed.reliefResults.teachers[0],breakdown=result.breakdown;assert.equal(result.R,26);assert.equal(breakdown.normalR,60);assert.equal(breakdown.periodCap,26);assert.equal(breakdown.capWorkload,0);assert.equal(breakdown.capHeadroom,26);assert.equal(breakdown.capApplied,true);
 run("state.versions=[confirmed];tab='Relief Settings';render()");const text=w.document.querySelector('#content').textContent;assert.match(text,/Normal R 60; weekly cap 26; counted total actual workload 0; cap headroom 26; final R 26/);assert.match(text,/Without a configured period cap, normal R applies/);
 const publicView=serverView(doc,['Teacher']);assert(!Object.hasOwn(publicView.reliefResults.teachers[0],'breakdown'));assert.equal(publicView.reliefResults.teachers[0].R,26);
 console.log('PASS cap708 permitted API breakdown reaches actual Deploy calculation table; restricted details stay role-gated.');
}finally{w.close();}
