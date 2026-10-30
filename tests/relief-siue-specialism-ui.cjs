'use strict';
const assert=require('node:assert/strict'),serverView=require('./relief-view-fixture');
const {w,run}=require('./dom-helper.cjs')();
try{
 w.confirmed=serverView(JSON.parse(run('JSON.stringify(v())')));
 const first=w.confirmed.reliefResults.teachers[0];first.breakdown.siuePercentApplied=0;first.breakdown.siueSpecialism='PE';
 run("state.versions=[confirmed];tab='Relief Settings';render()");
 const field=name=>w.document.querySelector('[data-relief-siue="'+name+'"]');
 assert(field('PE'),'PE override control');for(const name of ['PE','Art','Music'])assert.equal(field(name).value,'');
 assert.match(w.document.querySelector('#content').textContent,/SIUE 0% \(PE\)/);
 field('PE').value='-1';field('PE').dispatchEvent(new w.Event('input',{bubbles:true}));
 w.document.querySelector('[data-relief-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.equal(run('queuedEdits().length'),0);assert.match(w.document.querySelector('[data-relief-error]').textContent,/SIUE/);
 field('PE').value='0';field('PE').dispatchEvent(new w.Event('input',{bubbles:true}));
 w.document.querySelector('[data-relief-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 assert.deepEqual(JSON.parse(run('JSON.stringify(queuedEdits()[0].value.siuePercentBySpecialism)')),{PE:0,Art:null,Music:null});
 console.log('PASS SIUE override controls, blank inheritance, per-person label and save validation');
}finally{w.close();}
