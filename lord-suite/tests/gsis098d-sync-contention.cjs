'use strict';
const assert=require('node:assert/strict'),{fixture}=require('./run_gsis_bridge_checks.cjs');
{
 const h=fixture();h.enable();const before=h.properties.LORD_GSIS_CHECK,pointer=h.properties.LORD_GSIS_SNAPSHOT,calls=h.remote.length;h.busy=true;h.failLock=true;
 const r=h.ctx.syncLORDGSiSReferences();assert.equal(r.deferred,true);assert.equal(r.code,'GSIS_SYNC_DEFERRED');assert.equal(h.properties.LORD_GSIS_CHECK,before);assert.equal(h.properties.LORD_GSIS_SNAPSHOT,pointer);assert.equal(h.remote.length,calls);assert.equal(h.locked,false);
 h.busy=false;h.failLock=false;const next=h.ctx.syncLORDGSiSReferences();assert.equal(next.enabled,true);assert.equal(next.deferred,undefined);
}
{
 const h=fixture();h.enable();h.properties.LORD_GSIS_SYNC_LEASE=JSON.stringify({id:'other',expiresAt:h.now+90000});const r=h.ctx.syncLORDGSiSReferences();assert.equal(r.deferred,true);assert.equal(JSON.parse(h.properties.LORD_GSIS_SYNC_LEASE).id,'other');
}
{
 const h=fixture();h.enable();h.failSource='contacts';assert.throws(()=>h.ctx.syncLORDGSiSReferences(),/Injected remote failure/);assert.equal(JSON.parse(h.properties.LORD_GSIS_CHECK).ok,false);
}
console.log('PASS LORD scheduled contention waits and retries before deferring without freshness renewal; real source failures remain errors');
