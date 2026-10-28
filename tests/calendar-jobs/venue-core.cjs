'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),context=vm.createContext({});
vm.runInContext(fs.readFileSync('calendar-update/public/calendar-core.js','utf8'),context);const core=vm.runInContext('GSPSCalendarCore',context);
const event={EventID:'E1',Year:2026,EventType:'ALL_DAY',StartDate:'2026-10-28',EndDate:'2026-10-28',Location:'Hall (A1-01)',VenueID:'hall'};
assert.equal(core.editableCopy(event).VenueID,'hall','Editing must preserve a selected stable venue identity independently from its display text');
assert.equal(core.relocate(event,{year:2026,anchorDate:'2026-10-28',targetDate:'2026-10-29',lane:{LaneID:'day'},shift:'NONE',copy:true}).VenueID,'hall','Move/copy must retain the original venue identity');
console.log('PASS Calendar venue core: stable ID survives editable projection and relocation');
