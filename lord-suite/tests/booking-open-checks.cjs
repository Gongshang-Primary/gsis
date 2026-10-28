/* A booking opens from one authenticated response when the backend supports it. */
const assert=require('node:assert/strict');
const {browser,response,deferred}=require('./frontend_harness.cjs');
const date='2026-10-25',nextDate='2026-10-26',reference={teachers:['Test Staff'],classes:['1A'],subjects:['Science'],periods:[{code:'1'}],bookingResources:[{resource:'Cart A',capacity:14}]};
const snapshot=(at=date,id='new')=>({ok:true,data:reference,date:at,daySchedule:[{bookingId:id,resource:'Cart A',startPeriod:'1',endPeriod:'1'}]});
function fixture(){const h=browser('lord');h.api.state.mode='booking';h.api.state.booking.date=date;return h;}
(async()=>{
  {
    const h=fixture(),requests=[];h.ctx.lordFetch=async url=>{requests.push(url);return response(snapshot());};
    await h.ctx.refreshBookingChoices();
    assert.equal(requests.length,1);const url=new URL(requests[0],'https://fixture.invalid');assert.equal(url.searchParams.get('date'),date);assert.equal(url.searchParams.get('latest'),'1');
    assert.equal(h.api.state.booking.scheduleKey,date);assert.equal(h.api.state.booking.daySchedule[0].bookingId,'new');assert.equal(h.api.state.booking.scheduleLoading,false);
    assert.deepEqual(h.renders,['booking']);assert(!JSON.stringify(h.local).includes('daySchedule'),'the shared reference cache excludes booking occupancy');
  }
  {
    const h=fixture();h.api.state.booking.date='';let requestedDate;
    h.ctx.lordFetch=async url=>{requestedDate=new URL(url,'https://fixture.invalid').searchParams.get('date');return response(snapshot(requestedDate));};await h.ctx.refreshBookingChoices();
    assert.equal(requestedDate,h.ctx.todayIso());assert.equal(h.api.state.booking.date,requestedDate);assert.equal(h.api.state.booking.scheduleKey,requestedDate);
  }
  for(const payload of [{ok:true,data:reference},{ok:true,data:reference,date,daySchedule:{}},snapshot(nextDate)]){
    const h=fixture();h.ctx.lordFetch=async()=>response(payload);await h.ctx.refreshBookingChoices();assert.equal(h.api.state.booking.scheduleKey,'','missing or mismatched occupancy leaves the day loader active');assert.deepEqual(h.renders,['booking']);
  }
  {
    const h=fixture(),pending=deferred();h.ctx.lordFetch=()=>pending.promise;const read=h.ctx.refreshBookingChoices();h.api.state.booking.date=nextDate;pending.resolve(response(snapshot()));await read;
    assert.equal(h.api.state.booking.scheduleKey,'');assert.equal(h.api.state.booking.daySchedule.length,0,'old date cannot be installed under the new date');
  }
  {
    const h=fixture(),old=deferred(),fresh=deferred();let reads=0;h.ctx.lordFetch=()=>++reads===1?old.promise:fresh.promise;
    const a=h.ctx.refreshBookingChoices(),b=h.ctx.refreshBookingChoices();fresh.resolve(response(snapshot(date,'fresh')));await b;old.resolve(response(snapshot(date,'old')));await a;
    assert.equal(h.api.state.booking.daySchedule[0].bookingId,'fresh','old form generation cannot replace latest combined read');assert.deepEqual(h.renders,['booking']);
  }
  {
    const h=fixture(),old=deferred();h.ctx.lordFetch=url=>url.includes('bookingDaySchedule')?old.promise:Promise.resolve(response(snapshot(date,'combined')));
    const priorRead=h.ctx.loadBookingDaySchedule();await h.ctx.refreshBookingChoices();old.resolve(response({ok:true,bookings:[{bookingId:'old'}]}));await priorRead;
    assert.equal(h.api.state.booking.daySchedule[0].bookingId,'combined','an earlier independent schedule read cannot overwrite combined occupancy');
  }
  console.log('PASS combined booking open: one request, local cache boundary, legacy fallback, date and generation fencing');
})().catch(error=>{console.error(error);process.exitCode=1;});
