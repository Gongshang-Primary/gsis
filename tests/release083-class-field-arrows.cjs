'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<main></main>',{url:'https://roster.test',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,q=x=>w.document.querySelector(x),copy=x=>JSON.parse(JSON.stringify(x)),date='2026-10-21',calls=[];
for(const file of ['shared/roster-stapler.js','roster-update/public/roster-stapler-ui.js'])w.eval(fs.readFileSync(file,'utf8'));
const S=w.GSISRosterStapler;
let original=S.create({date,id:'baseline',verified:true,schoolDay:true,periods:[0,1,2,3].map(period=>({period,startMinutes:420+period*30,endMinutes:450+period*30})),recesses:[{level:1,startMinutes:480,endMinutes:510}],formClasses:[{id:'a',name:'1A',level:1,traditional:true,venue:'Room A'},{id:'b',name:'Workshop',traditional:false}],teachers:[{staffId:'alice',name:'Alice',cells:[['EL','1A','Room A','G1'],['MA','1A','Room B','G2'],['','','',''],['ART','Workshop','Studio','Other']]},{staffId:'bob',name:'Bob',cells:[['','','',''],['','','',''],['','','',''],['EL','1A','Room C','G3']]}]});
original=S.apply(original,{type:'addTile',tile:{teacherId:'alice',classIds:['a'],subject:'SC',venue:'Lab',group:'Pit'}});
const baseline=JSON.stringify(original.baseline);
let online=copy(original),revision=1,readOnly=false;
const view=()=>({date,plan:copy(online),revision,staplerRevision:revision,planningAllowed:!readOnly,canEdit:!readOnly,canConfirm:!readOnly,viewMode:readOnly?'confirmed':'planner',confirmed:{revision},accessRequests:[],people:[]});
const ctx={container:q('main'),initialDate:date,today:()=>date,profile:{user:{email:'smc@school.test',smc:true}},status(){},invalidateOperations(){},api:async(_,input)=>{calls.push(copy(input));if(input.operation==='stapler')return view();if(input.operation==='saveStapler'){online=copy(input.plan);revision++;return view();}throw Error('Unexpected write '+input.operation);}};
const group=()=>q('[data-class-fields="a"]'),form=field=>group().querySelector('[data-class-field-form="'+field+'"]'),input=field=>form(field).querySelector('input'),submit=field=>form(field).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
function draft(){for(let i=0;i<w.localStorage.length;i++){const key=w.localStorage.key(i);if(key.startsWith('gsis-stapler-local-v1:'))return JSON.parse(w.localStorage.getItem(key)).plan;}return copy(online);}
function affected(plan){return plan.tiles.filter(t=>t.kind==='lesson'&&t.classIds.includes('a'));}
// Recovery persistence is queued even when JSDOM falls back from IndexedDB to localStorage.
// Wait for the asserted committed value; never weaken the class-field or undo checks.
async function eventually(check){const deadline=Date.now()+2000;for(;;){try{return check();}catch(error){if(!(error instanceof assert.AssertionError)||Date.now()>=deadline)throw error;await new Promise(resolve=>setImmediate(resolve));}}}
(async()=>{try{
 await w.RosterStaplerUI.render(ctx);
 assert.ok(group(),'class rows expose inline fields instead of an Edit tiles dialog');
 assert.equal(group().querySelectorAll('input').length,3);assert.equal(group().querySelectorAll('button[type="submit"]').length,3);assert.equal(q('[data-bulk-class]'),null);
 for(const [field,label] of [['subject','Subject'],['venue','Venue'],['group','Group']]){assert.equal(input(field).placeholder,label);assert.match(form(field).querySelector('button').getAttribute('aria-label'),new RegExp('Apply '+label+'.*1A'));}
 input('subject').value='Science';input('venue').value='Hall';input('group').value='Group Blue';submit('subject');
 await eventually(()=>assert.ok(affected(draft()).every(t=>t.subject==='Science'),'subject applies to every current class lesson, including Pit'));
 let changed=draft();assert.equal(calls.length,1,'applying a class field never saves or fetches online');
 for(const tile of affected(changed)){const previous=original.tiles.find(t=>t.id===tile.id);assert.equal(tile.venue,previous.venue);assert.equal(tile.group,previous.group);assert.equal(tile.period,previous.period);assert.equal(tile.location,previous.location);}
 assert.equal(JSON.stringify(changed.baseline),baseline,'baseline never changes');assert.deepEqual(changed.tiles.filter(t=>t.kind==='recess'||!t.classIds.includes('a')),copy(original.tiles.filter(t=>t.kind==='recess'||!t.classIds.includes('a'))));
 assert.equal(input('venue').value,'Hall','other typed field values survive the redraw');assert.equal(input('group').value,'Group Blue');
 q('[data-undo]').click();await eventually(()=>assert.deepEqual(affected(draft()),copy(affected(original)),'one Undo restores the whole field application'));q('[data-redo]').click();await eventually(()=>assert.ok(affected(draft()).every(t=>t.subject==='Science')));
 submit('venue');await eventually(()=>assert.ok(affected(draft()).every(t=>t.venue==='Hall'&&t.subject==='Science')));assert.ok(affected(draft()).every(t=>t.group===original.tiles.find(o=>o.id===t.id).group));
 submit('group');await eventually(()=>assert.ok(affected(draft()).every(t=>t.group==='Group Blue'&&t.venue==='Hall'&&t.subject==='Science')));
 const before=JSON.stringify(draft());input('venue').value=' ';submit('venue');assert.equal(JSON.stringify(draft()),before,'blank input does not erase the class field');assert.match(q('[data-stapler-message]').textContent,/Enter Venue/);
 input('venue').value='x'.repeat(501);submit('venue');assert.equal(JSON.stringify(draft()),before,'invalid text leaves the entire plan intact');assert.match(q('[data-stapler-message]').textContent,/Invalid Stapler text/);
 q('[data-save]').click();await eventually(()=>assert.deepEqual(calls.map(c=>c.operation),['stapler','saveStapler']));await eventually(()=>assert.match(q('[data-stapler-message]').textContent,/^Changes saved/));assert.equal(JSON.stringify(online.baseline),baseline);
 w.RosterStaplerUI.unmount();readOnly=true;ctx.profile.user={email:'teacher@school.test',smc:false};await w.RosterStaplerUI.render(ctx);assert.equal(q('[data-class-fields]'),null,'confirmed teacher previews have no class edit controls');assert.equal(q('[data-bulk-class]'),null);
 console.log('PASS independent class Subject/Venue/Group arrows, all current lesson tiles, local-only one-step undo, preserved other fields, baseline/recess integrity and read-only teacher controls.');
}finally{w.RosterStaplerUI.unmount();dom.window.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
