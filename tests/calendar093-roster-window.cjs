'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{makeHarness}=require('./calendar/backend_harness.cjs');
const dates=['2026-09-14','2026-09-15'];
function setup(){const h=makeHarness();vm.runInContext(fs.readFileSync('calendar-backend/RosterDate.gs','utf8'),h.sandbox);h.seed('YearStructure',[{StructureID:'week',Year:2026,Kind:'TERM_WEEK',Term:'T3',Week:'9',StartDate:'2026-09-14',EndDate:'2026-09-18',Label:'Week 9'}]);return {...h,window:p=>h.call('rosterWindow',{dates,...p}),stamp:()=>h.sandbox.rosterCalendarStamp_(),patch:(name,row,patch)=>{h.sandbox.rc18ResetIO_();h.sandbox.updateRowPatch_(h.sheets.get(name),row,patch);}};}
let checks=0;function check(name,run){run();checks++;console.log('PASS '+name);}
check('authenticated Roster service can read a bounded Calendar window only',()=>{
 const h=setup(),request={proxySecret:'synthetic-secret',service:'gsis-roster-notifier-v1',action:'rosterWindow',payload:{dates}},reply=JSON.parse(h.sandbox.doPost({postData:{contents:JSON.stringify(request)}}).text);assert.equal(reply.ok,true);assert.equal(reply.result.dates.length,2);assert.equal(reply.result.dates[0].schoolDay,true);assert.equal(h.audit.apiWrites.length,0);
 request.action='saveYear';assert.equal(JSON.parse(h.sandbox.doPost({postData:{contents:JSON.stringify(request)}}).text).ok,false);
});
check('validated identical windows skip source tables but expire after five minutes',()=>{
 const h=setup(),first=h.window();assert.match(first.sourceRevision,/^[a-f0-9]{64}$/);assert.equal(first.cacheable,true);const reads=h.audit.nativeReads.length;h.advanceClock(1000);const warm=h.window({knownRevision:first.sourceRevision});assert.equal(warm.unchanged,true);assert.equal(h.audit.nativeReads.length,reads);assert.equal(warm.dates,undefined);assert.equal(warm.sourceCheckedAt,first.sourceCheckedAt,'conditional checks do not renew source freshness');
 h.advanceClock(300001);const after=h.window({knownRevision:first.sourceRevision});assert(h.audit.nativeReads.length>reads);assert.equal(after.sourceRevision,first.sourceRevision,'checkedAt and revalidation do not churn semantic identity');assert.notEqual(after.sourceCheckedAt,first.sourceCheckedAt);
});
check('a direct spreadsheet edit is observed after the certification expires',()=>{
 const h=setup(),first=h.window(),sheet=h.sheets.get('Events'),headers=sheet.values[0];sheet.values[1][headers.indexOf('OwnerTag')]='hol';sheet.values[1][headers.indexOf('EventType')]='ALL_DAY';
 assert.equal(h.window({knownRevision:first.sourceRevision}).unchanged,true,'unreported external edits have a bounded five-minute observation interval');h.advanceClock(300001);const fresh=h.window({knownRevision:first.sourceRevision});assert.notEqual(fresh.sourceRevision,first.sourceRevision);assert.equal(fresh.dates[0].schoolDay,false);assert.match(fresh.dates[0].reason,/Synthetic staff meeting/);
});
check('source certification is scoped to its exact consecutive window',()=>{
 const h=setup(),first=h.window(),reads=h.audit.nativeReads.length,next=h.window({dates:['2026-09-15','2026-09-16'],knownRevision:first.sourceRevision});assert.equal(next.unchanged,undefined);assert(h.audit.nativeReads.length>reads);assert.equal(next.from,'2026-09-15');assert.notEqual(next.sourceRevision,first.sourceRevision);
 for(const keys of [['2026-02-30'],['2026-09-14','2026-09-16'],['2026-09-14','2026-09-14']])assert.throws(()=>h.window({dates:keys}),e=>e.code==='INVALID_DATE');
});
check('release writes are pending before Sheets and ready only after its complete acknowledgement',()=>{
 const h=setup(),first=h.window();let observed=0;h.setFault(stage=>{if(stage==='before'||stage==='after'){observed++;assert.equal(h.stamp().ready,false);}});h.patch('Years',2,{ReleasedToTeachers:'No'});h.setFault(null);assert.equal(observed,2);assert.equal(h.stamp().ready,true);const next=h.window({knownRevision:first.sourceRevision});assert.equal(next.dates[0].code,'YEAR_UNAVAILABLE');assert.notEqual(next.sourceRevision,first.sourceRevision);
});
check('term weeks and published holiday changes invalidate their real date semantics',()=>{
 const h=setup(),first=h.window();h.patch('YearStructure',2,{Week:'10'});const even=h.window({knownRevision:first.sourceRevision});assert.equal(even.dates[0].parity,'even');assert.notEqual(even.sourceRevision,first.sourceRevision);
 h.patch('Events',2,{OwnerTag:'hol',EventType:'ALL_DAY'});const holiday=h.window({knownRevision:even.sourceRevision});assert.equal(holiday.dates[0].schoolDay,false);h.patch('Events',2,{Status:'HIDDEN'});assert.equal(h.window({knownRevision:holiday.sourceRevision}).dates[0].schoolDay,true);
});
check('only source-affecting fields invalidate Calendar window certification',()=>{
 const h=setup();const ticket=h.sandbox.rosterCalendarBeginWrite_();h.sandbox.rosterCalendarEndWrite_(ticket);const before=h.stamp().key;h.patch('Events',2,{StaffSyncState:'PENDING',UpdatedAt:'later'});assert.equal(h.stamp().key,before);h.patch('DayNotes',2,{Text:'Planning note'});assert.equal(h.stamp().key,before);
 for(const [name,field,value] of [['Years','Status','ARCHIVED'],['YearStructure','DeletedAt','deleted'],['YearStructure','StartDate','2026-09-15'],['Events','Year',2027],['Events','StaffTitle','Changed holiday'],['Events','EndDate','2026-09-16'],['Events','DeletedAt','deleted']]){const key=h.stamp().key;h.patch(name,2,{[field]:value});assert.notEqual(h.stamp().key,key,name+'.'+field);assert.equal(h.stamp().ready,true);}
});
check('lost acknowledgement retains pending marker and serves fresh uncertified dates',()=>{
 const h=setup(),first=h.window();h.setFault(stage=>{if(stage==='after')throw Error('Lost acknowledgement');});assert.throws(()=>h.patch('YearStructure',2,{Week:'10'}),/Lost acknowledgement/);h.setFault(null);assert.equal(h.stamp().ready,false);
 const fresh=h.window({knownRevision:first.sourceRevision});assert.equal(fresh.cacheable,false);assert.equal(fresh.dates[0].parity,'even');const reads=h.audit.nativeReads.length,again=h.window({knownRevision:fresh.sourceRevision});assert.equal(again.cacheable,false);assert.equal(again.unchanged,undefined);assert(h.audit.nativeReads.length>reads);h.patch('YearStructure',2,{Week:'11'});assert.equal(h.stamp().ready,true);assert.equal(h.window().cacheable,true);
});
check('manual source edits immediately invalidate cached certification without declaring an unknown writer complete',()=>{
 const h=setup(),first=h.window(),sheet=h.sheets.get('YearStructure'),headers=sheet.values[0];sheet.values[1][headers.indexOf('Week')]='10';h.sandbox.onEdit({range:{getSheet:()=>sheet,getRow:()=>2,getColumn:()=>headers.indexOf('Week')+1,getNumColumns:()=>1}});assert.equal(h.stamp().ready,false);const next=h.window({knownRevision:first.sourceRevision});assert.equal(next.dates[0].parity,'even');assert.equal(next.cacheable,false);
});
check('a source marker changing during a read cannot certify a mixed window',()=>{
 const h=setup();let once=true;h.setFault(stage=>{if(stage==='nativeReadBefore'&&once){once=false;h.sandbox.rosterCalendarBeginWrite_();}});assert.throws(()=>h.window(),e=>e.code==='CALENDAR_SOURCE_CHANGED');h.setFault(null);const older=h.sandbox.rosterCalendarBeginWrite_(),newer=h.sandbox.rosterCalendarBeginWrite_();h.sandbox.rosterCalendarEndWrite_(older);assert.equal(h.stamp().ready,false);h.sandbox.rosterCalendarEndWrite_(newer);assert.equal(h.stamp().ready,true);
});
check('cache outages fall back to fresh source reads',()=>{const h=setup(),first=h.window();h.setCacheBroken(true);const reads=h.audit.nativeReads.length,next=h.window({knownRevision:first.sourceRevision});assert(h.audit.nativeReads.length>reads);assert.equal(next.sourceRevision,first.sourceRevision);assert.equal(next.dates[0].schoolDay,true);});
console.log(checks+' Calendar window checks passed');
