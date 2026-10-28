const assert=require('node:assert/strict'),R=require('../shared/roster.js');
const perDay=18,model={layoutMode:'single-week',single:{perDay,maxPeriod:perDay-1,days:['Monday','Tuesday','Wednesday','Thursday','Friday'],blocks:[{name:'Teacher A',cells:Array.from({length:perDay*5},()=>['','','',''])}]},timing:{startMinutes:420,periodMinutes:30,endOfDayMinutes:810},recesses:[]};
const value=R.validate(model);assert.equal(value.maxPeriod,17);assert.equal(value.timing.normalLastPeriod,17);assert.equal(value.timing.endOfDayMinutes,810);assert.equal(value.single.blocks[0].cells.length,90);
for(const endOfDayMinutes of [419,420,1441,NaN])assert.throws(()=>R.validate({...model,timing:{...model.timing,endOfDayMinutes}}),/End of day/);
const legacy=R.validate({...model,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12}});assert.equal(legacy.timing.normalLastPeriod,12);assert.equal(legacy.timing.endOfDayMinutes,undefined);
console.log('PASS baseline period timing: dynamic imported last period, independent 13:30 day end, no trimmed periods, old schema retained.');
