const assert=require('node:assert/strict'),make=require('./dom-helper.cjs'),serverView=require('./relief-view-fixture');
const {w,run}=make(),tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const content=()=>w.document.querySelector('#content');
const label=node=>node.textContent.replace(/[↕▴▾]/g,'').trim();
const activityName='Instructional Mentoring Programme';
function refresh(){w.confirmed=serverView(JSON.parse(run('JSON.stringify(v())')));run('Object.assign(v(),confirmed);render()');}
(async()=>{
 run(`
  roleCatalogue=[{role:'Teacher',level:'EO',groups:[]}];
  Object.assign(v(),{
   teachers:[{id:'t',name:'Test Teacher',active:true,profile:{'Basic Name':'Test Teacher',Role:'Teacher','EO Appt Level':'EO',Active:'Y'}}],teacherDrafts:{},removedTeachers:{},
   classes:[{ref:'c1',level:'1',shortName:'P'}],
   loads:Object.fromEntries([1,2,3,4,5,6].map(level=>[String(level),{Assembly:1,FTGP:2,FTT:2,EL:12}])),
   assignments:[{id:'ft',teacher:'t',subject:'FT',target:'1P'},{id:'el',teacher:'t',subject:'EL',target:'1P'}],
   organisations:{plt:[{id:'plt',name:'PLT',slots:['t']}]},duties:[],offload:GSISTeachingRules.migrate(null),
   workload:{categories:{},specialists:[],nonTeachingActivities:[{id:'imp',code:'IMP',name:'Instructional Mentoring Programme',weeklyPeriods:2,teachers:['t']}]},
   relief:{schema:3,calculationVersion:'whole-week-v4',mode:'actual',weeklyPeriods:84,fourFifthsFraction:.8,fajtWeeklyPeriods:65,timetablePeriods:60,siuePercent:150,blocks:{}}
  });tab='Relief Settings';
 `);
 refresh();
 const relief=content().querySelector('.relief-table'),heads=[...relief.tHead.rows[0].cells].map(label),row=relief.tBodies[0].rows[0];
 assert.ok(heads.includes('Other non-teaching'),'Relief calculations expose the additive workload component');
 assert.equal(label(row.cells[heads.indexOf('Other non-teaching')]),'2');
 assert.match(label(row.cells[heads.indexOf('Details')]),/IMP \(Instructional Mentoring Programme\): 2 periods\/week/);
 run("tab='Ledger';render()");
 const ledger=content().querySelector('.workload-ledger'),ledgerHeads=[...ledger.tHead.rows[0].cells].map(label);
 assert.ok(ledgerHeads.includes('Countable activities'));
 const ledgerActivity=ledger.tBodies[0].rows[0].cells[ledgerHeads.indexOf('Countable activities')];
 assert.ok(label(ledgerActivity).includes(activityName));assert.match(label(ledgerActivity),/2 periods\/week/);
 run("tab='Workload Settings';render()");
 let editor=content().querySelector('.workload-settings');
 const activityTable=[...editor.querySelectorAll('table')].find(table=>table.tHead?.textContent.includes('Periods per teacher/week'));
 assert.ok(activityTable,'Workload settings show a separate activity summary');
 assert.ok(activityTable.textContent.includes(activityName));assert.ok(activityTable.textContent.includes('Test Teacher'));
 assert.equal(activityTable.querySelectorAll('input,select,textarea,button').length,0,'activity summary is read only');
 const category=editor.querySelector('[data-workload-subject="EL"]');category.value='Teaching';category.dispatchEvent(new w.Event('change',{bubbles:true}));
 editor.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 assert.equal(run('queuedEdits().length'),1);assert.equal(run('queuedEdits()[0].operation'),'setWorkload');
 assert.equal(run('queuedEdits()[0].value.nonTeachingActivities[0].name'),activityName);
 assert.equal(run('queuedEdits()[0].value.nonTeachingActivities[0].weeklyPeriods'),2);
 assert.equal(run('v().workload.nonTeachingActivities[0].teachers[0]'),'t','category save retains participant');
 run("cellQueue=[];draftBase=null;unsavedDraft=false;queueError='';tab='Teachers';render()");
 w.document.querySelector('[data-delete-teacher="t"]').click();editor=content().querySelector('.inline-editor');
 assert.ok(editor.textContent.includes(activityName),'teacher deletion review names affected IMP participation');
 assert.match(editor.textContent,/IMP.*2 periods\/week/);
 assert.equal(run('v().workload.nonTeachingActivities[0].teachers.length'),1,'review alone does not remove participation');
 editor.querySelector('[data-cancel]').click();
 assert.equal(run('queuedEdits().length'),0);assert.equal(run('v().teachers.length'),1,'cancel retains teacher');
 console.log('PASS IMP UI: confirmed relief breakdown and name, Ledger activities, read-only settings summary, category-save preservation and deletion impact review');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>w.close());
