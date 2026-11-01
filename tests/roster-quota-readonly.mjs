import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readQuotaSnapshotStatus} from '../shared/roster-quota-job.js';
import {readQuotaSnapshot,writeQuotaSnapshot} from '../shared/roster-quota-snapshot.js';
import {edgeDeployQuotaUsesD1} from '../public/edge-deploy.js';
const require=createRequire(import.meta.url),db=require('./helpers/chunked-import-db.cjs')(),queries=[],prepare=db.prepare;
db.prepare=text=>{queries.push(text);return prepare(text);};
const now=Date.now(),env={GSIS_JOBS:db,APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic-deploy/exec',BRIDGE_SECRET:'b'.repeat(40)};
try{
 assert.equal(await edgeDeployQuotaUsesD1(env),false);
 const missing=await readQuotaSnapshotStatus(env,{now});assert.equal(missing.available,false);
 await assert.rejects(readQuotaSnapshot(env,{date:'2026-11-02',asOf:now}),error=>error.code==='QUOTA_SNAPSHOT_MISSING');
 assert.deepEqual(db.sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),[],'read-only quota status never creates quota or operational authority tables');
 assert(queries.every(text=>/^SELECT /i.test(text)),'source authority and health use only primary SELECTs');
 const value={versionId:'published-version',from:'2026-01-01',to:'2026-12-31',rows:[{id:'teacher',R:4}],source:{service:'deploy',versionId:'published-version',revision:1,commit:'published-commit',calculationVersion:'rules-v1',publishedAt:new Date(now-1000).toISOString(),from:'2026-01-01',to:'2026-12-31'}};
 await writeQuotaSnapshot(env,value,{now});queries.length=0;const schemaBefore=db.sql.prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
 const ready=await readQuotaSnapshotStatus(env,{now});assert.equal(ready.available,true);assert.equal((await readQuotaSnapshot(env,{date:'2026-11-02',asOf:now})).rows[0].R,4);
 assert(queries.every(text=>/^SELECT /i.test(text)));assert.deepEqual(db.sql.prepare('SELECT sql FROM sqlite_master ORDER BY name').all(),schemaBefore,'reading existing snapshots changes no schema or authority');
 await assert.rejects(edgeDeployQuotaUsesD1({GSIS_JOBS:{prepare(){throw Error('synthetic outage');}}}),error=>error.code==='QUOTA_SNAPSHOT_SOURCE','an unknown persisted source cannot silently fall back');
 console.log('PASS quota metadata reads: absent and existing stores remain SELECT-only, no operational head/schema initialization, outages fail closed');
}finally{db.sql.close();}
