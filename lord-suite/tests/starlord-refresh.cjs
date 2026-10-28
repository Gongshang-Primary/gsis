// Offline response-stream failures: a board poll must finish even when the
// upstream headers arrive but its body does not. No production requests.
const assert=require('assert/strict');
const {worker,browser,response}=require('./frontend_harness.cjs');
const tick=()=>new Promise(setImmediate);
const results=[];
async function test(name,fn){try{await fn();results.push({name,ok:true});}catch(error){results.push({name,ok:false,error:error.stack});}}
function timers(ctx){
  let next=0;const pending=new Map();
  ctx.setTimeout=(fn,delay)=>{const id=++next;pending.set(id,{fn,delay});return id;};
  ctx.clearTimeout=id=>pending.delete(id);
  return {pending,fire(delay){for(const [id,timer] of [...pending])if(timer.delay===delay){pending.delete(id);timer.fn();}}};
}
function stalledBody(){
  let stream;return {response:new Response(new ReadableStream({start(controller){stream=controller;}})),
    finish(payload){stream.enqueue(new TextEncoder().encode(JSON.stringify(payload)));stream.close();}};
}
const route='/api/board?date=2026-10-25';
const board=id=>({ok:true,date:'2026-10-25',bookings:[{bookingId:id,teacherStatutoryName:'Teacher',resource:'Cart A'}]});
(async()=>{
  await test('A stalled response body expires for every coalesced reader and a later poll recovers',async()=>{
    const stalled=stalledBody();let slow=true;
    const h=worker('starlord',()=>slow?stalled.response:response(board('recovered'))),clock=timers(h.ctx);
    let outcome=null;const pending=Promise.all([h.call(route),h.call(route),h.call(route)]).then(values=>outcome=values);
    await tick();assert.equal(h.requests.length,1);
    clock.fire(45000);await tick();
    assert(outcome,'The complete board read must time out after headers, releasing coalesced readers.');
    await pending;
    for(const res of outcome){assert.equal(res.status,502);assert.equal((await res.json()).code,'BOARD_TIMEOUT');}
    assert.equal(h.cache.size,0);assert.equal(clock.pending.size,0);assert.equal(h.requests[0].init.signal.aborted,true);
    slow=false;const recovered=await h.call(route);
    assert.equal((await recovered.json()).bookings[0].bookingId,'recovered');assert.equal(h.requests.length,2);
    // Even an adapter that ignores abort cannot publish its late stale result.
    stalled.finish(board('late-old-result'));await tick();
    assert.equal((await (await h.call(route)).json()).bookings[0].bookingId,'recovered');assert.equal(h.requests.length,2);
  });
  await test('A response that finishes within the deadline remains cacheable and leaves no timer',async()=>{
    const stalled=stalledBody(),h=worker('starlord',()=>stalled.response),clock=timers(h.ctx);
    const pending=h.call(route);await tick();stalled.finish(board('complete'));
    const res=await pending;assert.equal(res.status,200);assert.equal((await res.json()).bookings[0].bookingId,'complete');
    assert.equal(clock.pending.size,0);assert.equal((await h.call(route)).headers.get('X-LORD-Cache'),'HIT');assert.equal(h.requests.length,1);
  });
  await test('STARLORD retains its last board, labels timeout stale, and retries once after backoff',async()=>{
    const stalled=stalledBody();let mode='first';
    const edge=worker('starlord',()=>mode==='stall'?stalled.response:response(board(mode))),edgeClock=timers(edge.ctx);
    const h=browser('starlord'),clock=timers(h.ctx);h.ctx.fetch=url=>edge.call(url);
    await h.api.loadBoard();assert.equal(h.api.snapshot().boardData[0].bookingId,'first');
    const successfulAt=h.api.snapshot().lastSuccessfulAt;
    edge.cache.clear();mode='stall';let settled=false;
    const pending=h.api.loadBoard().then(()=>settled=true);await tick();
    edgeClock.fire(45000);await tick();
    assert(settled,'The visible board poll must settle after the upstream body deadline.');await pending;
    assert.equal(h.api.snapshot().boardData[0].bookingId,'first');assert.equal(h.api.snapshot().lastSuccessfulAt,successfulAt);
    assert.match(h.nodes.feedStatus.textContent,/Live update delayed|Previous-day data/);
    assert.equal(h.api.snapshot().fetchInFlight,false);
    assert.deepEqual([...clock.pending.values()].map(x=>x.delay),[15000]);
    mode='next';clock.fire(15000);await tick();await tick();
    assert.equal(h.api.snapshot().boardData[0].bookingId,'next');assert.match(h.nodes.feedStatus.textContent,/Updated/);
    assert.equal(edge.requests.length,3);assert.deepEqual([...clock.pending.values()].map(x=>x.delay),[60000]);
    stalled.finish(board('late'));await tick();
  });
  console.log(JSON.stringify({passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results},null,2));
  process.exitCode=results.some(x=>!x.ok)?1:0;
})();
