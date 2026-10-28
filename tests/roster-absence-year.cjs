'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const O=require('../shared/roster-operations.js'),fixture=require('./roster701-fixture.cjs'),source=fs.readFileSync('tests/roster096-absence-adapter.cjs','utf8'),box={require:createRequire(path.resolve('tests/roster096-absence-adapter.cjs')),console};
vm.runInNewContext(source.slice(0,source.indexOf('const reject='))+'\nthis.adapter=adapter;',box);
const copy=value=>JSON.parse(JSON.stringify(value)),days=(from,to)=>Array.from({length:(Date.parse(to)-Date.parse(from))/86400000+1},(_,i)=>new Date(Date.parse(from)+i*86400000).toISOString().slice(0,10));
const fail=(fn,status,pattern)=>assert.throws(fn,e=>e.status===status&&pattern.test(e.message));
function yearFixture(year=2028){
 const h=box.adapter(),from=year+'-01-01',to=year+'-12-31',dates=days(from,to),base=copy(h.ctx.days[h.date]);
 Object.assign(h.ctx,{today:from,now:Date.parse(from+'T06:00:00+08:00'),iso:from+'T00:00:00Z',quotaRequested:false,calendarDatesVerified:dates,timetableEntries:[{id:'baseline',from,to,priority:1}]});h.ctx.days={};
 for(const d of dates){const dd=copy(base),weekend=[0,6].includes(new Date(d).getUTCDay());dd.schoolDay=!weekend;dd.teachers.find(t=>t.staffId==='bob').cells[2]=['MA','4B','R2',''];if(d>year+'-06-30')for(const p of dd.periods){p.startMinutes+=10;p.endMinutes+=10;p.start=String(Math.floor(p.startMinutes/60)).padStart(2,'0')+':'+String(p.startMinutes%60).padStart(2,'0');p.end=String(Math.floor(p.endMinutes/60)).padStart(2,'0')+':'+String(p.endMinutes%60).padStart(2,'0');}h.ctx.days[d]=dd;}
 const who={...h.identity('alice'),smc:true},command=extra=>h.command('alice',{staffIds:['alice','bob'],date:from,from,to,view:'report',fullDay:true,...extra});return {...h,from,to,dates,who,command};
}
for(const year of [2027,2028]){const from=year+'-01-01',to=year+'-12-31';assert.equal(O.absenceDates({from,to}).length,year===2028?366:365);}
assert.equal(O.absenceDates({from:'2027-12-20',to:'2028-01-10'}).length,22,'existing short New Year ranges remain valid');
assert.equal(O.absenceDates({from:'2027-07-01',to:'2028-06-30'}).length,366,'a released cross-year absence can span one leap-year length');
for(const p of [{from:'2028-01-01',to:'2029-01-01'},{dates:['2028-01-01','2029-01-01']}])fail(()=>O.absenceDates(p),400,/366/);
fail(()=>O.dates({from:'2028-01-01',to:'2028-03-03'}),400,/62/);assert.equal(O.dates({from:'2028-01-01',to:'2028-03-02'}).length,62,'unrelated range limits stay unchanged');
{
 const h=yearFixture(),p=h.command(),result=h.call(p,h.who),state=h.state();assert.equal(result.savedIds.length,732);assert.equal(state.absences.length,732);assert.equal(h.counts().writes,1);assert.equal(state.receipts.length,1);
 for(const date of [h.from,'2028-02-29','2028-07-03',h.to])for(const id of ['alice','bob']){const row=state.absences.find(a=>a.date===date&&a.staffId===id);assert(row);assert.deepEqual(copy(row.periodSnapshot),copy(h.ctx.days[date].periods));assert.equal(row.coverage.kind,'fullDay');}
 assert.equal(state.absences.find(a=>a.date==='2028-07-03'&&a.staffId==='bob').lessonSnapshot[0].timeStart,'08:10','each date uses its own effective timings');
 assert.equal(h.call(p,h.who).replayed,true);assert.equal(h.counts().writes,1);assert.equal(h.state().revision,1);
 const view=O.reportView(state,{...h.ctx,user:h.who},{date:'2028-07-03',staffId:'bob',staffIds:['alice','bob']});assert.equal(view.ownAbsences.length,732);assert(view.demands.some(d=>d.staffId==='bob'&&d.timeStart==='08:10'));
 const original=state.absences.find(a=>a.staffId==='bob'&&a.date==='2028-07-03'),amend=h.command({id:original.id,staffId:'bob',staffIds:['bob'],date:original.date,revision:state.revision,periods:[2],fullDay:false,from:undefined,to:undefined});h.call(amend,h.who);assert.equal(h.state().absences.length,732);assert.deepEqual(copy(h.state().absences.find(a=>a.id===original.id).periods),[2]);
 console.log('MEASURE full leap-year two-teacher save:',JSON.stringify({records:state.absences.length,recordCharacters:JSON.stringify(state.absences).length,documentCharacters:JSON.stringify(state).length,writes:1,contexts:1}));
}
{
 const h=yearFixture(),last=h.command({staffIds:['bob'],staffId:'bob',date:h.to,from:h.to,to:h.to});h.call(last,h.who);const before=h.state();fail(()=>h.call(h.command(),h.who),409,/overlap/);assert.deepEqual(h.state(),before,'last-date overlap rejects all732 proposed records');assert.equal(h.counts().writes,1);
}
{
 const h=yearFixture(),p=h.command();h.lose();assert.throws(()=>h.call(p,h.who),/Lost commit/);assert.equal(h.state().absences.length,732);assert.equal(h.call({operation:'receiptStatus',command:p},h.who).accepted,true);assert.equal(h.call(p,h.who).replayed,true);assert.equal(h.counts().writes,1);
}
{
 const h=yearFixture();h.update(s=>{for(let n=0;n<6000;n++)s.absences.push({id:'history'+n,staffId:'alice',name:'Alice',date:'2027-01-04',periods:[2],typeId:'mc',reliefRequired:true,timetablePending:false,lessonSnapshot:[],instructions:{}});});
 h.call(h.command(),h.who);assert.equal(h.state().absences.length,6732);assert.equal(h.counts().writes,1,'a populated archive still appends the whole batch in one write');
 console.log('MEASURE populated archive:',JSON.stringify({priorRecords:6000,addedRecords:732,documentCharacters:JSON.stringify(h.state()).length,writes:1}));
}
{
 const h=yearFixture();h.ctx.calendarDatesVerified=h.dates.slice(0,-1);fail(()=>h.call(h.command(),h.who),409,/Calendar|calendar/);assert.equal(h.counts().writes,0);assert.equal(h.state().absences.length,0);
}
{
 // Exercise the production context builder and small manifest fence; only
 // remote storage boundaries are mocked, not the dated source selection.
 const h=yearFixture(),scope=h.scope,reads={index:0,models:[],catalogue:0,quota:0},entries=[{id:'first',from:h.from,to:'2028-06-30',priority:1},{id:'second',from:'2028-07-01',to:h.to,priority:1}];
 vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 scope.Utilities.formatDate=(_,tz,format)=>format==='yyyy-MM-dd'?h.from:format==='HH'?'06':'00';
 scope.rosterIndex_=()=>{reads.index++;return {entries};};
 scope.rosterModel_=entry=>{assert.equal(h.counts().locked,false,'model reads stay outside the commit lock');reads.models.push(entry.id);return {layoutMode:'single-week',maxPeriod:16,timing:{startMinutes:entry.id==='first'?420:430,periodMinutes:30},single:{perDay:17,blocks:h.ctx.people.map(p=>({name:p.name,cells:Array.from({length:85},(_,i)=>i%17===2?['EL','4A','Room','TG']:['','','',''])}))}};};
 scope.rosterOperationsSubjectCatalogue_=()=>{assert.equal(h.counts().locked,false);reads.catalogue++;return {from:h.from,to:h.to,teachingGroups:[{id:'group',name:'TG'}]};};scope.rosterOperationsQuota_=()=>{reads.quota++;throw Error('Absence does not need allocation quota');};
 const p=h.command({calendarByDate:Object.fromEntries(h.dates.map(d=>[d,{date:d,schoolDay:h.ctx.days[d].schoolDay,parity:'odd',available:true}]))}),result=h.call(p,h.who);
 assert.equal(result.savedIds.length,732);assert.equal(h.counts().writes,1);assert.deepEqual(reads,{index:2,models:['first','second'],catalogue:1,quota:0},'one preparation and one small locked manifest check; each immutable model loaded once');
 const saved=h.state().absences.find(a=>a.date==='2028-07-03'&&a.staffId==='bob');assert.equal(saved.lessonSnapshot[0].timetableId,'second');assert.equal(saved.lessonSnapshot[0].timeStart,'08:10');
 // All saved dates use their own authority for an instruction update; the
 // viewed date cannot stand in for omitted future Calendar evidence.
 const eligible=h.state().absences.filter(a=>a.staffId==='alice'&&!a.timetablePending),dates=eligible.map(a=>a.date),edit={operation:'saveInstructions',requestId:require('node:crypto').randomUUID(),revision:1,view:'report',date:dates[0],absenceIds:eligible.map(a=>a.id),dates,instructionsNA:true,calendarByDate:Object.fromEntries(dates.map(d=>[d,p.calendarByDate[d]]))};
 h.call(edit,h.who);assert.equal(h.counts().writes,2);assert.equal(h.state().absences.filter(a=>a.staffId==='alice'&&a.instructionsNA).length,eligible.length);
 fail(()=>h.call({...edit,requestId:require('node:crypto').randomUUID(),revision:2,calendarByDate:{[dates[0]]:p.calendarByDate[dates[0]]}},h.who),409,/Calendar|calendar/);assert.equal(h.counts().writes,2);
 console.log('MEASURE full-year production context:',JSON.stringify({modelsPerCreate:2,distinctModels:2,indexReadsPerCreate:2,catalogueReadsPerCreate:1,quotaReads:0,createWrites:1,instructionRecords:eligible.length}));
}
{
 // The resource budget follows actual record sizes, not an arbitrary small teacher count.
 const f=fixture(),from='2028-01-01',to='2028-12-31',dates=days(from,to),base=f.ctx.days[f.date];Object.assign(f.ctx,{today:from,now:Date.parse(from),iso:from+'T00:00:00Z',quotaRequested:false,calendarDatesVerified:dates,days:Object.fromEntries(dates.map(d=>[d,base]))});
 const names=Array.from({length:150},(_,i)=>'batch'+i);f.ctx.people.push(...names.map(id=>({id,name:id,active:true})));const before=copy(f.state.absences);
 fail(()=>O.apply(f.state,f.ctx,{operation:'saveAbsence',date:from,from,to,staffId:names[0],staffIds:names,typeId:'mc',fullDay:true,remarks:'x'.repeat(2000)}),413,/large|size/);assert.deepEqual(f.state.absences,before,'oversized preparation never appends a partial prefix');
}
console.log('PASS absence year: inclusive leap/non-leap and cross-year ranges, scoped62day legacy limits,732record single commit, timings, readback/amend, overlap atomicity, receipt recovery, Calendar authority and actual-size guard.');
