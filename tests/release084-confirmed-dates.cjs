'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom'),fixture=require('./roster701-fixture.cjs'),S=require('../shared/roster-stapler.js');
const f=fixture(),O=f.O,today=f.date,legacyDate='2026-10-15',draftDate='2026-10-16',safeDate='2026-10-17';
f.ctx.timetableEntries=[{id:'baseline',from:'2026-10-01',to:'2026-12-31',status:'active'}];
function record(date,extra={}){
 const plan=S.create({...f.ctx.days[today],date,teachers:f.ctx.days[today].teachers.filter(t=>t.staffId!=='bob')});
 return {date,baselineId:'baseline',name:'Private renamed draft',revision:4,draft:S.apply(plan,{type:'edit',tileId:plan.tiles[0].id,patch:{venue:'PRIVATE_DRAFT_ROOM'}}),...extra};
}
const confirmedAt='2026-10-12T01:00:00.000Z',updatedAt='2026-10-13T01:00:00.000Z';
f.state.staplerPlans.push(record(today,{confirmed:true,confirmedAt,updatedAt}),record(legacyDate,{confirmed:true,confirmedAt,updatedAt}),record(draftDate,{updatedAt}),record('2026-10-13',{confirmed:true,confirmedAt,updatedAt}));
const safe=record(safeDate,{name:'Confirmed plan',confirmed:true,confirmedAt,updatedAt});
safe.confirmedPlan=S.create({...f.ctx.days[today],date:safeDate});safe.confirmedRevision=2;f.state.staplerPlans.push(safe);
const teacher={...f.ctx,user:{staffId:'bob',email:'bob@gsps.edu.sg',smc:false,admin:false}};
const before=JSON.stringify(f.state),list=O.read(f.state,teacher,{operation:'staplerDates'});
assert.deepEqual(list.dates.map(r=>r.date).sort(),[today,legacyDate,draftDate,safeDate],'confirmed dates and neutral upcoming dates remain visible without exposing draft plans');
assert.equal(list.confirmedAccess,'available');
for(const date of [today,legacyDate]){
 const row=list.dates.find(r=>r.date===date);
 assert.equal(row.canListConfirmed,true);assert.equal(row.canViewConfirmed,false);assert.equal(row.previewUnavailable,true);assert.equal(row.mayEdit,false);
 assert.doesNotMatch(JSON.stringify(row),/Private renamed draft|PRIVATE_DRAFT_ROOM|baseline/,'metadata-only dates do not expose draft contents or its metadata');
 assert.equal(O.read(f.state,teacher,{operation:'stapler',date}).plan,null,'listing a date must not grant access to its unfrozen draft');
}
assert.equal(list.dates.find(r=>r.date===safeDate).canViewConfirmed,true);
assert.doesNotMatch(JSON.stringify(O.read(f.state,teacher,{operation:'stapler',date:safeDate}).plan),/PRIVATE_DRAFT_ROOM/);
assert.equal(JSON.stringify(f.state),before,'date reads cannot mutate operational state');
for(const [name,ctx,access] of [
 ['unmapped',{...teacher,user:{email:'unmapped@gsps.edu.sg'}},'unmapped'],
 ['inactive',{...teacher,people:f.people.map(p=>({...p,active:false}))},'ineligible'],
 ['support',{...teacher,people:f.people.map(p=>({...p,role:'Support'}))},'ineligible']
]){
 const view=O.read(f.state,ctx,{operation:'staplerDates'});assert.equal(view.confirmedAccess,access,name+' access reason');assert.deepEqual(view.dates,[],name+' cannot list teacher dates');
}
{
 const invalid=fixture();invalid.state.staplerPlans.push(record(today,{confirmed:true,confirmedAt:'invalid',updatedAt}));
 const neutral=O.read(invalid.state,{...invalid.ctx,user:teacher.user},{operation:'staplerDates'}).dates;
 assert.equal(neutral.length,1);assert.equal(neutral[0].canListConfirmed,false,'a malformed legacy confirmation is not evidence of a confirmed date');assert.equal(neutral[0].canListUpcoming,true);assert.equal(neutral[0].canViewConfirmed,false);assert.doesNotMatch(JSON.stringify(neutral),/Private renamed draft|PRIVATE_DRAFT_ROOM/);
}

const dom=new JSDOM('<main></main>',{url:'https://roster.test',runScripts:'dangerously',pretendToBeVisual:true}),w=dom.window,q=s=>w.document.querySelector(s),tick=()=>new Promise(resolve=>setImmediate(resolve));
w.eval(fs.readFileSync('shared/roster-stapler.js','utf8'));w.eval(fs.readFileSync('roster-update/public/roster-stapler-ui.js','utf8'));
let response=list,calls=[];
const ctx={container:q('main'),today:()=>today,profile:{user:teacher.user},status(){},api:async(_,p)=>{calls.push(p);assert.equal(p.operation,'staplerDates','metadata browsing does not write or load an unsafe plan');return response;}};
(async()=>{try{
 await w.RosterStaplerUI.render(ctx);
 let box=q('[data-confirmed-suspensions]');
 assert.deepEqual([...box.querySelectorAll('tbody tr td:first-child')].map(el=>el.textContent),[today,legacyDate,safeDate],'today and upcoming dates sort earliest first');
 assert.equal(box.querySelectorAll('[data-open-date]').length,1,'only a safely frozen plan offers a preview');
 assert.equal(box.querySelectorAll('[data-preview-unavailable]').length,2);assert.doesNotMatch(box.textContent,/revision 0|Private renamed draft/);
 assert.match(box.textContent,/To view the confirmed suspended timetable, select Timetable from the main screen\./);
 assert.equal(q('[data-planning-access]').open,false,'metadata-only date access is independent of planning access');
 response={};q('[data-refresh-dates]').click();await tick();
 assert.match(q('[data-stapler-message]').textContent,/incomplete|invalid/i);assert.match(q('[data-stapler-message]').textContent,/Showing the last checked list/);
 assert.equal(q('[data-confirmed-suspensions]').querySelectorAll('tbody tr').length,3,'invalid data cannot replace the checked list with a false empty result');
 w.RosterStaplerUI.reset();response={confirmedAccess:'unmapped',dates:[],sponsors:[],sponsorships:[]};await w.RosterStaplerUI.render(ctx);
 assert.match(q('[data-confirmed-suspensions]').textContent,/not linked to an active teacher/i);assert.doesNotMatch(q('[data-confirmed-suspensions]').textContent,/No confirmed suspensions/);
 response={confirmedAccess:'available',dates:[],sponsors:[],sponsorships:[]};q('[data-refresh-dates]').click();await tick();
 assert.match(q('[data-confirmed-suspensions]').textContent,/No confirmed suspensions are available/);
 console.log('PASS legacy confirmed dates, frozen preview boundaries, account guidance, sorted teacher list and invalid-versus-empty read handling.');
}finally{w.RosterStaplerUI.unmount();dom.window.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
