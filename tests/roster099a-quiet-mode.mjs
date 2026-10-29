// 0.9.9a quiet mode: D1 state, expiry rules and audit log.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {quietExpiry,readQuietMode,startQuietMode,endQuietMode,bindQuietRequest,endQuietModeSession,QUIET_PAUSED_JOBS,QUIET_END_OPERATIONS} from '../shared/roster-quiet-mode.js';

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
assert.deepEqual(QUIET_END_OPERATIONS,{publish:'publish-accepted',notifyDaily:'whatsapp-queued'},'reasons record acceptance, not provider delivery');

{
 const db=d1();
 assert.equal((await readQuietMode(db,at('06:30'))).active,false,'off by default');
 const on=await startQuietMode(db,'smc@gsps.edu.sg',at('06:40'));
 assert.equal(on.active,true);assert.equal(on.expiresAt,at('07:15'));
 assert.equal((await readQuietMode(db,at('07:14'))).active,true);
 const expired=await readQuietMode(db,at('07:15'));
 assert.equal(expired.active,false,'expires at 07:15 without any writer');assert.equal(expired.endReason,'expired');
 const late=await endQuietMode(db,'smc@gsps.edu.sg','publish-accepted',at('07:20'));
 assert.equal(late.endReason,'expired','ending after expiry does not rewrite history');
 assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM gsis_quiet_mode_log WHERE action='off'").get().n,0);
}
{
 const db=d1();
 await startQuietMode(db,'smc@gsps.edu.sg',at('06:40'));
 const off=await endQuietMode(db,'smc@gsps.edu.sg','publish-accepted',at('06:58'));
 assert.equal(off.active,false);assert.equal(off.endReason,'publish-accepted');
 await endQuietMode(db,'smc@gsps.edu.sg','whatsapp-queued',at('06:59'));
 assert.equal((await readQuietMode(db,at('06:59'))).endReason,'publish-accepted','a second end is a no-op');
 const log=db.raw.prepare('SELECT action,reason FROM gsis_quiet_mode_log ORDER BY id').all().map(r=>[r.action,r.reason]);
 assert.deepEqual(log,[['on',null],['off','publish-accepted']],'every change is logged once');
 const again=await startQuietMode(db,'admin@gsps.edu.sg',at('10:00'));
 assert.equal(again.active,true);assert.equal(again.expiresAt,at('10:30'),'daytime quiet mode lasts 30 minutes');
}
{
 // A replayed request from an older session cannot end a newer one.
 const db=d1();
 await startQuietMode(db,'smc-a@gsps.edu.sg',at('06:10'));
 const a=await bindQuietRequest(db,'req-a',at('06:11'));
 assert.equal(a,at('06:10'),'request binds to the active session');
 await endQuietMode(db,'smc-a@gsps.edu.sg','manual',at('06:15'));
 await startQuietMode(db,'smc-b@gsps.edu.sg',at('06:20'));
 assert.equal(await bindQuietRequest(db,'req-a',at('06:21')),at('06:10'),'a retry keeps its first binding');
 assert.equal((await endQuietModeSession(db,'smc-a@gsps.edu.sg','publish-accepted',a,at('06:21'))).active,true,'old receipt leaves the newer session on');
 const b=await bindQuietRequest(db,'req-b',at('06:22'));
 const ended=await endQuietModeSession(db,'smc-b@gsps.edu.sg','publish-accepted',b,at('06:23'));
 assert.equal(ended.active,false);assert.equal(ended.endReason,'publish-accepted','same-session request ends it');
 assert.equal(await bindQuietRequest(db,'req-c',at('06:30')),0,'no active session binds to 0');
 assert.equal((await endQuietModeSession(db,'x','publish-accepted',0,at('06:31'))).active,false,'session 0 ends nothing');
}
assert.equal((await readQuietMode(undefined)).active,false,'missing storage reads as off');
await assert.rejects(()=>startQuietMode(undefined,'smc@gsps.edu.sg'),/not configured/);
console.log('PASS 0.9.9a quiet mode state, expiry and audit');
