// Production backend and Worker paths; service fakes measure calls, not latency.
const assert=require('assert/strict');
const {harness,request,addExisting,plain}=require('./backend_harness.cjs');
const {worker,response,staff,fresh,deferred}=require('./frontend_harness.cjs');
const results=[];
async function test(name,fn){try{await fn();results.push({name,ok:true});}catch(error){results.push({name,ok:false,error:error.stack});}}
function bookingBatch(n){return request({action:'bookingCreateBatch',bookings:Array.from({length:n},(_,i)=>({date:'2026-11-'+String(i+1).padStart(2,'0')}))});}
function tasks(h){return Object.entries(h.properties).filter(([key])=>key.startsWith(h.ctx.LORD_SECONDARY.PREFIX));}
(async()=>{
await test('Booking opening returns current references and the requested day in one read',()=>{
 const h=harness();addExisting(h);const out=h.get({action:'reference',bookingDate:'2026-10-09'});
 assert(out.ok,out.error);assert.equal(out.date,'2026-10-09');assert.equal(out.daySchedule.length,1);assert.equal(out.daySchedule[0].bookingId,'EXISTING');assert(out.data.periods.length);
 assert.equal(h.batches.length,0);assert.equal(tasks(h).length,0);
});
await test('Ordinary reference responses and invalid dates contain no booking data',()=>{
 for(const parameters of [{},{bookingDate:'not-a-date'}]){const h=harness();addExisting(h);const out=h.get({action:'reference',...parameters});assert(out.ok);assert.equal(out.daySchedule,undefined);assert.equal(out.date,undefined);}
});
await test('Worker fetches a dated opening once and never stores booking rows in shared reference cache',async()=>{
 const h=worker('lord',()=>response({ok:true,data:fresh,date:'2026-10-09',daySchedule:[{bookingId:'private-day'}]}),staff);
 h.cache.set('https://lord-reference-cache.local/v1.3',new Response(JSON.stringify({ok:true,data:{old:true}}),{headers:{'X-LORD-Fetched-At':String(Date.now())}}));
 const out=await (await h.call('/api/reference?latest=1&date=2026-10-09')).json();
 assert.equal(h.requests.length,1);assert.equal(h.requests[0].url.searchParams.get('bookingDate'),'2026-10-09');assert.equal(out.daySchedule[0].bookingId,'private-day');
 const cached=await h.cache.get('https://lord-reference-cache.local/v1.3').clone().json();assert.equal(cached.daySchedule,undefined);assert.equal(cached.date,undefined);
});
await test('Dated read bypasses cached references even without latest and requires staff sign-in',async()=>{
 const h=worker('lord',()=>response({ok:true,data:fresh,date:'2026-10-09',daySchedule:[]}),staff);
 h.cache.set('https://lord-reference-cache.local/v1.3',new Response('{"ok":true,"data":{"old":true}}',{headers:{'X-LORD-Fetched-At':String(Date.now())}}));
 await h.call('/api/reference?date=2026-10-09');assert.equal(h.requests.length,1);
 const guest=worker('lord',()=>{throw Error('must not read');},null);assert.equal((await guest.call('/api/reference?date=2026-10-09')).status,401);assert.equal(guest.requests.length,0);
 const relief=worker('lord',()=>response({ok:true,data:fresh}),{...staff,identityType:'RELIEF'});await relief.call('/api/reference?latest=1&date=2026-10-09');assert.equal(relief.requests[0].url.searchParams.get('bookingDate'),null);
});
await test('Concurrent dates do not share a schedule response',async()=>{
 const gate=deferred();const h=worker('lord',async url=>{await gate.promise;const date=new URL(url).searchParams.get('bookingDate');return response({ok:true,data:fresh,date,daySchedule:[{date}]});},staff);
 const first=h.call('/api/reference?latest=1&date=2026-10-09'),second=h.call('/api/reference?latest=1&date=2026-10-10');
 gate.resolve();const outputs=await Promise.all([first,second]);assert.equal(h.requests.length,2);assert.equal((await outputs[0].json()).date,'2026-10-09');assert.equal((await outputs[1].json()).date,'2026-10-10');
});
await test('Twenty bookings queue forty tasks with three full property snapshots and one atomic commit',()=>{
 const h=harness();const out=h.post(bookingBatch(20));assert(out.ok,out.error);assert.equal(out.result.bookings.length,20);assert.equal(h.batches.length,1);assert.equal(h.locks,1);assert.equal(tasks(h).length,40);assert.equal(h.snapshots,3);assert.equal(h.propertyWrites.length,41);
 assert.equal(tasks(h).filter(([,raw])=>JSON.parse(raw).kind==='booking_email').length,20);
});
await test('Batch admission retains queued work and respects live item capacity',()=>{
 const h=harness();for(let i=0;i<99;i++)h.properties[h.ctx.LORD_SECONDARY.PREFIX+'existing-'+i]=JSON.stringify({kind:'event',createdAt:h.now,payload:{sessionId:'keep-'+i}});
 const out=h.post(bookingBatch(2));assert(out.ok,out.error);assert.equal(tasks(h).length,100);for(let i=0;i<99;i++)assert(h.properties[h.ctx.LORD_SECONDARY.PREFIX+'existing-'+i]);assert(out.result.maintenanceWarnings.length);
});
await test('Lost property write acknowledgement forces a fresh snapshot before continuing admission',()=>{
 const h=harness();const original=h.props.setProperty;let injected=false;
 h.props.setProperty=(key,value)=>{const out=original(key,value);if(key.startsWith(h.ctx.LORD_SECONDARY.PREFIX)&&!injected){injected=true;throw Error('lost acknowledgement');}return out;};
 const queued=h.ctx.queueSecondaryTasks_([{kind:'event',payload:{sessionId:'one'}},{kind:'event',payload:{sessionId:'two'}}]);
 assert.deepEqual(plain(queued),[false,true]);assert.equal(tasks(h).length,2);assert(h.snapshots>=2);assert.equal(h.locks,1);assert.equal(h.releases,1);
});
await test('A separate queue admission reads changes made after the preceding lock release',()=>{
 const h=harness();assert(h.ctx.queueSecondaryTask_('event',{sessionId:'first'}));for(let i=0;i<99;i++)h.properties[h.ctx.LORD_SECONDARY.PREFIX+'other-'+i]=JSON.stringify({kind:'event',createdAt:h.now,payload:{}});
 assert.equal(h.ctx.queueSecondaryTask_('event',{sessionId:'must-not-admit'}),false);assert.equal(tasks(h).length,100);assert.equal(h.locks,2);
});
await test('Timings expose phase durations without payloads and Worker backend duration',async()=>{
 const h=harness();const out=h.post(bookingBatch(1));assert(out.ok);const timing=JSON.parse(h.logs[0]);for(const key of ['bookingReadMs','queueMs'])assert.equal(typeof timing[key],'number');assert(!h.logs[0].includes('staff@'));
 const w=worker('lord',()=>response({ok:true,bookings:[]}),staff);const res=await w.call('/api/transaction?action=bookingDaySchedule&date=2026-10-09');assert.match(res.headers.get('Server-Timing'),/^backend;dur=\d+$/);
});
for(const result of results)if(!result.ok)console.error(result.name+'\n'+result.error);
console.log(JSON.stringify({passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,total:results.length}));
process.exitCode=results.some(r=>!r.ok)?1:0;
})();
