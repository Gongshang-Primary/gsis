// 0.9.9a quiet mode: D1 state, expiry rules and audit log.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {quietExpiry,readQuietMode,startQuietMode,endQuietMode,QUIET_PAUSED_JOBS,QUIET_END_OPERATIONS} from '../shared/roster-quiet-mode.js';

// Minimal D1 stand-in over SQLite: prepare/bind/first/run/batch.
function d1(){
 const db=new DatabaseSync(':memory:');
 const statement=(sql,args=[])=>({bind:(...values)=>statement(sql,values),first:async()=>db.prepare(sql).get(...args)??null,run:async()=>{const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}};},all:async()=>({results:db.prepare(sql).all(...args)})});
 return {raw:db,prepare:sql=>statement(sql),batch:async list=>{const out=[];for(const item of list)out.push(await item.run());return out;}};
}
const at=time=>Date.parse('2026-10-30T'+time+':00+08:00');

assert.equal(quietExpiry(at('06:40')),at('07:15'),'before 07:15 quiet mode ends at 07:15');
assert.equal(quietExpiry(at('07:14')),at('07:15'));
assert.equal(quietExpiry(at('07:15')),at('07:45'),'from 07:15 quiet mode lasts 30 minutes');
assert.equal(quietExpiry(at('10:00')),at('10:30'));
assert.deepEqual([...QUIET_PAUSED_JOBS].sort(),['allocation','audit-export','peer-mail'],'only lock-heavy deferrable jobs pause');
assert.deepEqual(Object.keys(QUIET_END_OPERATIONS).sort(),['notifyDaily','publish']);

{
 const db=d1();
 assert.equal((await readQuietMode(db,at('06:30'))).active,false,'off by default');
 const on=await startQuietMode(db,'smc@gsps.edu.sg',at('06:40'));
 assert.equal(on.active,true);assert.equal(on.expiresAt,at('07:15'));
 assert.equal((await readQuietMode(db,at('07:14'))).active,true);
 const expired=await readQuietMode(db,at('07:15'));
 assert.equal(expired.active,false,'expires at 07:15 without any writer');assert.equal(expired.endReason,'expired');
 const late=await endQuietMode(db,'smc@gsps.edu.sg','published',at('07:20'));
 assert.equal(late.endReason,'expired','ending after expiry does not rewrite history');
 assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM gsis_quiet_mode_log WHERE action='off'").get().n,0);
}
{
 const db=d1();
 await startQuietMode(db,'smc@gsps.edu.sg',at('06:40'));
 const off=await endQuietMode(db,'smc@gsps.edu.sg','published',at('06:58'));
 assert.equal(off.active,false);assert.equal(off.endReason,'published');
 await endQuietMode(db,'smc@gsps.edu.sg','whatsapp-sent',at('06:59'));
 assert.equal((await readQuietMode(db,at('06:59'))).endReason,'published','a second end is a no-op');
 const log=db.raw.prepare('SELECT action,reason FROM gsis_quiet_mode_log ORDER BY id').all().map(r=>[r.action,r.reason]);
 assert.deepEqual(log,[['on',null],['off','published']],'every change is logged once');
 const again=await startQuietMode(db,'admin@gsps.edu.sg',at('10:00'));
 assert.equal(again.active,true);assert.equal(again.expiresAt,at('10:30'),'daytime quiet mode lasts 30 minutes');
}
assert.equal((await readQuietMode(undefined)).active,false,'missing storage reads as off');
await assert.rejects(()=>startQuietMode(undefined,'smc@gsps.edu.sg'),/not configured/);
console.log('PASS 0.9.9a quiet mode state, expiry and audit');
