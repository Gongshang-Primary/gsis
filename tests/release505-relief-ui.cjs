const assert=require('node:assert/strict'),serverView=require('./relief-view-fixture');
const {w,run}=require('./dom-helper.cjs')();
try{
 w.confirmed=serverView(JSON.parse(run('JSON.stringify(v())')));
 run("state.versions=[confirmed];tab='Relief Settings';render()");
 const factor=key=>w.document.querySelector('[data-relief-factor="'+key+'"]');
 const submit=()=>w.document.querySelector('form[data-relief-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 const change=(key,value)=>{factor(key).value=value;factor(key).dispatchEvent(new w.Event('input',{bubbles:true}));};
 assert.equal(run('typeof GSISRelief'),'undefined','No private calculation engine in the public bundle');
 assert.equal(factor('weeklyPeriods').value,'84');assert.equal(factor('daysPerWeek'),null);
 assert.equal(factor('lunchPeriodsPerDay'),null);assert.equal(factor('siuePercent').value,'150');
 assert.equal(factor('periodsPerDay'),null);assert.equal(w.document.querySelector('[data-relief-block]'),null);
 assert.ok(w.document.querySelector('.relief-formulas'));assert.equal(factor('mode'),null);
 assert.match(w.document.querySelector('#content').textContent,/FTT/);
 change('weeklyPeriods','65');assert.equal(run('unsavedDraft'),true);assert.equal(run('queuedEdits().length'),0);
 assert.match(w.document.querySelector('[data-relief-status]').textContent,/last saved results/);
 change('weeklyPeriods','84');assert.equal(run('unsavedDraft'),false);
 change('siuePercent','-1');assert.match(w.document.querySelector('[data-relief-error]').textContent,/SIUE/);submit();assert.equal(run('queuedEdits().length'),0);
 w.document.querySelector('[data-relief-reset]').click();assert.equal(factor('siuePercent').value,'150');assert.equal(run('unsavedDraft'),false);
 change('weeklyPeriods','');assert.match(w.document.querySelector('[data-relief-error]').textContent,/greater than zero/);submit();assert.equal(run('queuedEdits().length'),0);
 w.document.querySelector('[data-relief-reset]').click();change('fourFifthsFraction','2.5');assert.match(w.document.querySelector('[data-relief-error]').textContent,/fraction/);
 w.document.querySelector('[data-relief-reset]').click();change('timetablePeriods','100');assert.match(w.document.querySelector('[data-relief-error]').textContent,/fit/);
 w.document.querySelector('[data-relief-reset]').click();
 // Saved schema-1 versions retain their exact effective week and legacy Blocks.
 const legacy=JSON.parse(run('JSON.stringify(v())'));legacy.relief={schema:1,mode:'expected',periodsPerDay:13,daysPerWeek:5,lunchPeriodsPerDay:2,siuePercent:150,blocks:{t:2.25}};
 w.legacy=serverView(legacy);run('state.versions=[legacy];render()');assert.equal(factor('weeklyPeriods').value,'84');assert.equal(factor('mode'),null);
 const savedR=w.document.querySelector('[data-relief-value="quota"]').textContent;
 change('weeklyPeriods','70');change('siuePercent','125');
 assert.equal(w.document.querySelector('[data-relief-value="quota"]').textContent,savedR,'Unsaved controls must not pretend to be confirmed R');
 submit();assert.equal(run('queuedEdits().length'),1);assert.equal(run('queuedEdits()[0].expected.schema'),1);assert.equal(run('v().relief.schema'),3);assert.equal(run('v().relief.weeklyPeriods'),70);assert.equal(run('v().relief.blocks.t'),2.25);assert.equal(run('v().reliefResults.pending'),true);
 assert.equal(w.document.querySelector('[data-relief-value="quota"]').textContent,'Save to update');assert.equal(run('reliefResultData().byTeacher.t.quota'),null);
 assert.equal(w.document.querySelector('#saveQueue').hidden,false);assert.equal(run('unsavedDraft'),false);
 // A saved response refreshes the calculated results, with per-version isolation.
 w.saved=serverView(JSON.parse(run('JSON.stringify(v())')));run('cellQueue=[];draftBase=null;state.versions=[saved];render()');
 assert.equal(factor('weeklyPeriods').value,'70');assert.equal(run('reliefResultData().byTeacher.t.quota'),60);
 w.other=serverView({...legacy,id:'v2',relief:undefined});run("state.versions.push(other);current='v2';render()");assert.equal(factor('weeklyPeriods').value,'84');run("current='v1';render()");assert.equal(factor('weeklyPeriods').value,'70');
 run('queueFlight={};render()');assert.ok(factor('weeklyPeriods').disabled);run('queueFlight=null');
 run("role='KP';render()");assert.ok(!w.document.querySelector('[data-relief-form]'));assert.ok(!w.document.querySelector('#navReliefSettings')||w.document.querySelector('#navReliefSettings').hidden);
 const before=run('queuedEdits().length');run("queueCell({operation:'setReliefSettings',value:{},expected:null})");assert.equal(run('queuedEdits().length'),before);
 console.log('PASS relief UI: real application queue, Admin-only editor, server-only R, direct weekly budget, legacy settings/Blocks, saved vs pending results, validation, reset and version isolation.');
}finally{w.close();}
