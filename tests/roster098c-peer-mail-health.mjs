import assert from 'node:assert/strict';
import {safeHealthError,recordJobHealth,readSystemHealth} from '../shared/edge-health.js';
import {DatabaseSync} from 'node:sqlite';
const sql=new DatabaseSync(':memory:'),db={prepare(query){const make=(args=[])=>({bind(...next){return make(next);},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async first(){return sql.prepare(query).get(...args)||null;},async run(){return {success:true,meta:{changes:sql.prepare(query).run(...args).changes}};}});return make();},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
const now=Date.now();await recordJobHealth({GSIS_JOBS:db},{job:'peer-mail',status:'idle',now,counts:{uncertain:0,reviewedUncertain:2,newUncertain:0,pending:0,recipientName:'PRIVATE',email:'PRIVATE'}});
const health=await readSystemHealth({GSIS_JOBS:db},{jobsOnly:true,now});assert.equal(health.jobs[0].counts.reviewedUncertain,2);assert.equal(health.jobs[0].counts.uncertain,0);assert.equal(health.jobs[0].counts.newUncertain,0);assert(!JSON.stringify(health).includes('PRIVATE'));
assert.deepEqual(safeHealthError({code:'BACKEND_UNAVAILABLE',operation:'sendPeerMail',failureStage:'peer-mail-review'}),{code:'BACKEND_UNAVAILABLE',operation:'sendPeerMail',failureStage:'peer-mail-review'});
assert.deepEqual(safeHealthError({code:'BACKEND_UNAVAILABLE',operation:'TeacherName',failureStage:'PRIVATE'}),{code:'BACKEND_UNAVAILABLE'});
console.log('PASS 098c peer email health metadata: reviewed counts preserved, bounded operation diagnostics, no private summary fields');
