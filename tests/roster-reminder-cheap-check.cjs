'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),O=require('../shared/roster-operations'),A=require('../shared/roster-allocation');
const date='2026-10-14',at=time=>Date.parse(date+'T'+time+':00+08:00');
function state(){const s=O.initial();s.massPublications[date]={at:date+'T01:00:00Z'};s.dailyEmploymentAutomatic[date]={status:'no-recipients'};s.smcDutyRoster=[{date,staffIds:['alice']}];s.publicationSnapshots=[{id:'snap',assignmentId:'a',staffId:'bob',date,period:3,kind:'assigned',publishedAt:date+'T01:00:00Z',assignment:{date,timeStart:'10:00'}}];return s;}
test('published reminder projection advances through reminder and SMC deadlines',()=>{
 const s=state();assert.equal(O.nextScheduledNoticeAt(s,date,at('09:10')),at('09:40'));
 s.outbox.push({key:'reminder:snap'});assert.equal(O.nextScheduledNoticeAt(s,date,at('09:41')),at('09:50'));
 s.outbox.push({key:'unacknowledged:snap:alice'});s.smcAlerts.push({key:'unacknowledged:snap'});assert.equal(O.nextScheduledNoticeAt(s,date,at('09:51')),null);
 s.outbox=[];s.acknowledgements=[{snapshotId:'snap'}];assert.equal(O.nextScheduledNoticeAt(s,date,at('09:10')),null);
});
test('published daily report remains a due task until recorded',()=>{
 const s=state();s.publicationSnapshots=[];delete s.dailyEmploymentAutomatic[date];s.dailyEmploymentSettings.time='10:15';assert.equal(O.nextScheduledNoticeAt(s,date,at('09:10')),at('10:15'));assert.equal(O.nextScheduledNoticeAt(s,date,at('10:16')),at('10:15'));
});
test('hint skips a published day only before its deadline and keeps mutation fences',()=>{
 let now=at('09:30');const properties=new Map([['ROSTER_VERSION_HINT','v1']]),p={getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v)};
 const source=fs.readFileSync('backend/RosterOperations.gs','utf8'),start=source.indexOf('function rosterScheduledHintWrite_'),end=source.indexOf('function rosterScheduledDispatch_',start),scope=vm.createContext({props_:()=>p,GSISRosterOperations:O,Date:class extends Date{static now(){return now;}}});vm.runInContext(source.slice(start,end),scope);
 const s=state();s.massPublications['2025-01-01']={};scope.rosterScheduledHintWrite_(s,'v1');const hint=JSON.parse(properties.get('ROSTER_SCHEDULE_HINT'));assert.equal(hint.schema,2);assert.deepEqual(hint.noticeDates,[date]);
 const slot=()=>({...A.schedule(now),stamp:now});assert.equal(scope.rosterScheduledFastSkip_(slot(),{allocate:false},date).idle,true);now=at('09:40');assert.equal(scope.rosterScheduledFastSkip_(slot(),{allocate:false},date),null);
 now=at('09:30');properties.set('ROSTER_SCHEDULE_DIRTY','1');assert.equal(scope.rosterScheduledFastSkip_(slot(),{allocate:false},date),null);properties.delete('ROSTER_SCHEDULE_DIRTY');properties.set('ROSTER_VERSION_HINT','v2');assert.equal(scope.rosterScheduledFastSkip_(slot(),{allocate:false},date),null);
});
