'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const UI=require('../roster-update/public/roster-operations-ui.js');
(async()=>{
 let calls=0,finish;const ctx={profile:{user:{email:'a@gsps.edu.sg'}},today:'2026-10-14',api:()=>{calls++;return new Promise(r=>finish=r)}};
 const one=UI.preload(ctx),two=UI.preload(ctx);assert.equal(one,two);assert.equal(calls,1);finish({revision:7});assert.equal((await one).revision,7);
 UI.resetPreloads();let failed=0;const bad={...ctx,api:()=>{failed++;return Promise.reject(new Error('outage'))}};await assert.rejects(UI.preload(bad));await assert.rejects(UI.preload(bad));assert.equal(failed,2);
 let other=0;await UI.preload({...ctx,profile:{user:{email:'b@gsps.edu.sg'}},api:()=>{other++;return Promise.resolve({revision:8})}});assert.equal(other,1,'no cross-account cache');
 const box={};vm.runInNewContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),box);
 for(const view of ['report','mine','duties','adhoc','types','prune'])assert.equal(box.rosterOperationsNeedsQuota_({operation:'read',view}),false);
 for(const operation of ['assign','candidates','respondMutual'])assert.equal(box.rosterOperationsNeedsQuota_({operation}),true);
 assert.equal(box.rosterOperationsNeedsQuota_({operation:'publish'}),false,'visibility publication has no quota business dependency');
 assert.equal(box.rosterOperationsNeedsQuota_({operation:'read'}),true,'legacy callers retain quota context');
 console.log('R01: preload coalesces concurrent reads; failures and account changes invalidate; six lightweight read views avoid quota context.');
})().catch(e=>{console.error(e);process.exitCode=1});
