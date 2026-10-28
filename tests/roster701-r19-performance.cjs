const assert=require('node:assert/strict'),f=require('./roster701-fixture.cjs')();f.ctx.minute=360;
for(let n=0;n<1500;n++)f.state.assignments.push({id:'draft'+n,date:f.date,period:12,status:'draft',className:n%2?'1C':'2H',staffId:'bob',version:1});
const start=performance.now();f.O.apply(f.state,f.ctx,{operation:'saveCustomInstruction',date:f.date,levels:[1,2],periods:[12],text:'Dismiss via foyer.'});const ms=performance.now()-start;
assert(f.state.assignments.every(x=>x.customInstructions==='Dismiss via foyer.'));assert.equal(f.state.outbox.length,0);assert(ms<1000);
console.log(JSON.stringify({drafts:1500,updateMs:+ms.toFixed(2),notificationWrites:0,contextQuotaReadsRequired:false,measurement:'synthetic local CPU'}));
