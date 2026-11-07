'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),dom=new JSDOM('<main id="content"></main>',{url:'https://roster.test/',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,document=w.document;
w.confirm=()=>true;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
for(const file of ['shared/roster-stapler.js','roster-update/public/roster-operations-ui.js','roster-update/public/roster-stapler-ui.js','tests/fixtures/stapler-lease-api.js'])w.eval(fs.readFileSync(path.join(root,file),'utf8'));
const calls=[],date='2026-10-19';let saved=null,confirmed=false,revision=0;
const base=()=>w.GSISRosterStapler.create({date,id:'baseline',verified:true,schoolDay:true,periods:[{period:0,startMinutes:450,endMinutes:480},{period:1,startMinutes:480,endMinutes:510}],subjectCategories:{EL:'Teaching',ART:'Teaching'},formClasses:[{id:'workshop',name:'Workshop',traditional:false}],teachers:[
 {staffId:'a',name:'Alice',timetableName:'Alice',cells:[['EL','Workshop','Room A','Group A'],['','','','']]},
 {staffId:'b',name:'Bob',timetableName:'Bob',cells:[['','','',''],['','','','']]},
 {staffId:'c',name:'Suriawati (FAJT)',timetableName:'Suriawati',cells:[['','','',''],['','','','']]},
 {staffId:'d',name:'Mei Ling (MTL)',timetableName:'Mei Ling',cells:[['','','',''],['','','','']]},
 {staffId:'e',name:'André (Art)',timetableName:'André',cells:[['','','',''],['','','','']]},
 {staffId:'f',name:'Siti (MTL)',timetableName:'Siti Aminah',cells:[['','','',''],['','','','']]}]});
const view=()=>({date,plan:JSON.parse(JSON.stringify(saved||base())),staplerRevision:revision,revision,canEdit:true,canConfirm:true,confirmed:confirmed?{revision}:null,people:[{id:'a',name:'Alice',active:true},{id:'b',name:'Bob',active:true}],accessRequests:[],venues:['Room A','Room B']});
const ctx={container:document.querySelector('#content'),initialDate:date,today:()=> '2026-10-18',profile:{user:{smc:true,email:'a@school.test'}},status(){},invalidateOperations(){},api:async(route,input)=>{calls.push(JSON.parse(JSON.stringify(input)));if(input.operation==='staplerDates')return {revision,dates:[],sponsors:[{id:'b',name:'Bob'}],sponsorships:[{id:'access',date,staffId:'teacher',name:'Teacher',status:'pending'}]};if(input.operation==='stapler')return view();if(input.operation==='saveStapler'){saved=JSON.parse(JSON.stringify(input.plan));revision++;return view();}if(input.operation==='confirmStapler'){assert.ok(saved);confirmed=true;saved.status='confirmed';return view();}throw Error(input.operation);}};
const q=selector=>document.querySelector(selector),all=selector=>[...document.querySelectorAll(selector)],click=selector=>q(selector).click(),set=(selector,value)=>{q(selector).value=value;},submit=()=>q('dialog form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})),flush=()=>new Promise(resolve=>setImmediate(resolve));
const type=query=>{const search=q('[data-teacher-search]');search.value=query;search.dispatchEvent(new w.Event('input',{bubbles:true}));},options=()=>all('[data-teacher-option]').map(b=>b.textContent),key=key=>q('[data-teacher-search]').dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
(async()=>{
 await w.RosterStaplerUI.render(ctx);
 click('[data-add-card]');
 type('wati');assert.deepEqual(options(),['Suriawati (FAJT)'],'partial text finds Suriawati');
 type('MTL');assert.deepEqual(options(),['Mei Ling (MTL)','Siti (MTL)'],'tag search, alphabetical');
 type('andre');assert.deepEqual(options(),['André (Art)'],'accent-insensitive search');
 type('aminah');assert.deepEqual(options(),['Siti (MTL)'],'timetable name search');
 type('zzz');assert.deepEqual(options(),[],'no match, no options');assert.equal(q('.ops-teacher-options .hint').textContent,'No matching teacher','no-match message');
 type('a');assert.deepEqual(options(),['Alice','André (Art)','Siti (MTL)','Suriawati (FAJT)'],'prefix matches first, then alphabetical');
 type('mtl');key('ArrowDown');key('Enter');assert.equal(q('[name=teacherId]').value,'f','keyboard select picks the highlighted teacher');assert.equal(q('[data-teacher-search]').value,'Siti (MTL)','keyboard select shows the teacher name');
 type('wati');q('[data-teacher-option]').click();assert.equal(q('[name=teacherId]').value,'c','clicked option sets the teacher id');
 set('[name=subject]','EL');submit();assert.equal(all('[data-pit-cards] [data-tile]').length,1,'one tile in the pit');
 click('[data-save]');await flush();const extra=saved.tiles.filter(t=>!t.baselineId);assert.equal(extra.length,1);assert.equal(extra[0].teacherId,'c','saved tile carries the picked staff id');
 click('[data-pit-cards] [data-edit-tile]');assert.equal(q('[data-teacher-search]').value,'Suriawati (FAJT)','edit dialog shows the tile teacher');assert.equal(q('[name=teacherId]').value,'c','edit dialog keeps the tile teacher id');
 click('[data-dialog-close]');
 w.RosterStaplerUI.unmount();dom.window.close();console.log('PASS v712 Stapler teacher picker: partial, tag, timetable-name and accent-insensitive search; prefix-first order; keyboard select; no-match; saved staff id; edit dialog.');
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1;});
