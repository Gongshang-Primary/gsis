const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({structuredClone, Map, Promise, JSON});
vm.runInContext(fs.readFileSync('shared/worker-read-coalescing.js','utf8') + '\nthis.read = gsisCoalescedRead; this.clear = gsisClearReadFlights;', context);
(async () => {
 let calls = 0, release;
 const gate = new Promise(resolve => {release = resolve;});
 const load = async () => {calls++; await gate; return {rows:[1]};};
 const reads = Array.from({length:30}, () => context.read(['backend','alice','subject','data',{}],load));
 await Promise.resolve(); assert.equal(calls,1); release();
 const results=await Promise.all(reads); assert.equal(results.filter(x=>x.joined).length,29);
 results[0].value.rows.push(2); assert.equal(results[1].value.rows.length,1,'each caller owns its result');
 await context.read(['backend','alice','subject','data',{}],load); assert.equal(calls,2,'settled reads are never cached');
 let releaseNext; const nextGate=new Promise(r=>{releaseNext=r;});
 const pendingLoad=async()=>{calls++;await nextGate;return {ok:true};};
 const first=context.read(['backend','alice','subject','data',{}],pendingLoad);
 const other=context.read(['backend','bob','subject','data',{}],pendingLoad);
 const changed=context.read(['backend','alice','subject','data',{version:2}],pendingLoad);
 context.clear(); // a write starts; later reads cannot join earlier state
 const afterWrite=context.read(['backend','alice','subject','data',{}],pendingLoad);
 await Promise.resolve(); assert.equal(calls,6); releaseNext();
 await Promise.all([first,other,changed,afterWrite]);
 await assert.rejects(context.read(['failure'],async()=>{throw Error('offline');}));
 assert.equal((await context.read(['failure'],async()=>42)).value,42,'failed flights allow retry');
 console.log('PASS: 30 overlapping reads use one origin call; identity/input isolation, result ownership, write barrier and failed-read recovery');
})().catch(e=>{console.error(e);process.exitCode=1;});
