'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),fixture=require('./roster701-fixture.cjs');
function setup(names=[]){
 const f=fixture();f.ctx.service=true;
 f.ctx.dutySources={[f.date]:{available:true,staffIds:['alice'],source:{versionId:'fixture'}}};
 f.state.smcDutyRoster=[{date:f.date,staffIds:['alice']}];
 names.forEach((name,i)=>{
  const id='absent-'+i;
  f.ctx.people.push({id,name,active:true,mobile:'90000000'});
  f.ctx.days[f.date].teachers.push({staffId:id,name,cells:f.blank(),R:4});
  f.state.absences.push({id:'absence-'+i,date:f.date,staffId:id,periods:[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]});
 });
 return f;
}
function tick(f,time='05:30'){
 f.ctx.now=Date.parse(f.date+'T'+time+':00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();
 f.O.scheduledTick(f.state,f.ctx,f.ctx.now);
 return f.state.outbox.filter(j=>j.data?.scheduledSummary);
}
const summary=f=>tick(f).at(-1).data.summary;
const zero=summary(setup());
assert.match(zero,/^0 absent teachers\./);
assert.match(zero,/0 periods have planned cover; 0 uncovered\. Low-capacity periods: /);
const one=summary(setup(['Amelia (FAJT)']));
assert.match(one,/^1 absent teacher: Amelia \(FAJT\)\./);
assert(!one.includes('(P0'),'saved absence periods are not repeated after the teacher name');

const names=['Jannie','Siti Fadhilah (MTL)','Egwin','Yusri','Amelia (FAJT)'],five=setup(names);
five.state.absences.push({...five.state.absences[0],id:'duplicate-absence',periods:[2,3]});
five.state.assignments.push({id:'cover',date:five.date,period:2,staffId:'bob',status:'draft'});
const compact=summary(five);
assert.match(compact,/^5 absent teachers:/,'count distinct teachers, not absence rows');
for(const name of names)assert.equal(compact.split(name).length-1,1,'include each teacher once with role qualifiers');
assert.match(compact,/1 periods have planned cover; 0 uncovered\. Low-capacity periods: /);
assert(!/\(P\d|[\r\n\t]| {5}/.test(compact),'approved-template parameter stays compact and single line');

const whitespace=summary(setup(['  Siti\n Fadhilah\t    (MTL)  ']));
assert.match(whitespace,/1 absent teacher: Siti Fadhilah \(MTL\)\./);
assert(!/[\r\n\t]| {5}/.test(whitespace),'contact whitespace cannot introduce invalid template parameters');

const large=summary(setup(Array.from({length:70},(_,i)=>'Teacher '+i+' '+('Longname '.repeat(8)).trim())));
assert(large.length<=900,'fallback remains bounded for the approved template parameter');
assert.match(large,/^70 absent teachers\./);
assert.match(large,/0 periods have planned cover; 0 uncovered\. Low-capacity periods: /,'capacity survives the long-list fallback');
assert.match(large,/Names omitted; open Roster for the full absence list\./,'long lists explicitly disclose omitted names');

const changed=setup(['Jannie']);
let jobs=tick(changed);jobs[0].status='sent';jobs[0].messageId='wamid.first';
assert.equal(tick(changed,'05:45').length,1,'unchanged absence fingerprint stays suppressed');
changed.state.absences[0].periods=[2];jobs=tick(changed,'06:00');
assert.equal(jobs.length,2,'a period change still triggers the next eligible summary');
assert.equal(jobs[0].data.summary,jobs[1].data.summary,'period-sensitive suppression remains separate from compact display');

const contracts=JSON.parse(fs.readFileSync('notification-worker/template-contracts.json','utf8'));
const templates=contracts.templates||contracts;
const evening=Array.isArray(templates)?templates.find(t=>t.key==='relief_evening'):templates.relief_evening;
assert(evening,'planning template remains registered');
assert(evening.body.includes('These allocations are drafts pending publication.'),'draft wording stays in the approved template');
console.log('PASS compact summary for zero/one/five teachers, qualifiers, duplicate rows, bounded fallback and period-sensitive suppression');
