import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readRosterMirrorStatus,mirrorEdgeRoster} from '../roster-update/public/edge-roster.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),Store=require('../shared/edge-store.js');
const fresh={sourceDigest:'a'.repeat(64),archiveId:'b'.repeat(64),effectiveDate:'2026-11-05'};

assert.equal((await readRosterMirrorStatus({ROSTER_EDGE_AUTHORITY:'legacy'})).enabled,false,'Google status needs no D1 binding');
assert.equal((await mirrorEdgeRoster({ROSTER_EDGE_AUTHORITY:'legacy'})).enabled,false,'Google cron cannot initialize D1');
const empty=database();
try{
 assert.equal((await readRosterMirrorStatus({ROSTER_EDGE_AUTHORITY:'legacy',GSIS_JOBS:empty})).enabled,false);
 assert.equal(empty.sql.prepare("SELECT name FROM sqlite_master WHERE name='gsis_edge_heads'").get(),undefined,'a status read must not create missing migration tables');
 await assert.rejects(readRosterMirrorStatus({ROSTER_EDGE_AUTHORITY:'d1',GSIS_JOBS:empty}),undefined,'missing active storage fails closed');
}finally{empty.sql.close();}

const preparing=database();
try{
 await Store.open(preparing,'roster-references').ensure();
 const before=JSON.stringify(preparing.sql.prepare('SELECT * FROM gsis_edge_heads ORDER BY scope').all()),queries=[],prepare=preparing.prepare;
 preparing.prepare=sql=>{queries.push(sql);return prepare(sql);};
 const env={ROSTER_EDGE_AUTHORITY:'d1',GSIS_JOBS:preparing},status=await readRosterMirrorStatus(env);
 assert.equal(status.enabled,false);assert.equal(status.available,false);assert.equal(status.mode,'legacy','health can report an unfinished activation');
 await assert.rejects(mirrorEdgeRoster(env),e=>e.code==='ROSTER_EDGE_NOT_ACTIVE','preactivation status must not authorize a mirror run');
 assert(queries.every(sql=>/^SELECT\b/i.test(sql)),'preactivation health and refusal must not initialize operational heads');
 assert.equal(JSON.stringify(preparing.sql.prepare('SELECT * FROM gsis_edge_heads ORDER BY scope').all()),before);
}finally{preparing.sql.close();}

const db=database(),env={ROSTER_EDGE_AUTHORITY:'d1',GSIS_JOBS:db};
try{
 for(const scope of ['roster','roster-register']){
  const store=Store.open(db,scope),head=await store.importState({state:{revision:1},actor:'fixture',requestId:scope,source:{sourceDigest:fresh.sourceDigest}});
  await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});
 }
 db.sql.prepare('UPDATE gsis_edge_heads SET metadata_json=?').run(JSON.stringify({freshStart:fresh}));
 // The absence table can be installed separately. Reading archive status must
 // not install mirror transport triggers or write any metadata in response.
 db.sql.exec('CREATE TABLE gsis_absence_transport (id TEXT)');
 const queries=[],prepare=db.prepare;
 db.prepare=sql=>{queries.push(sql);return prepare(sql);};
 const before=JSON.stringify(db.sql.prepare('SELECT * FROM gsis_edge_heads ORDER BY scope').all());
 const status=await readRosterMirrorStatus(env);
 assert.equal(status.archiveOnly,true);assert.equal(status.enabled,false);assert.equal(status.archiveId,fresh.archiveId);assert.equal(status.phase,'normal');assert.deepEqual(status.revisions,{roster:2,register:2});
 assert(queries.every(sql=>/^SELECT\b/i.test(sql)),'fresh archive status uses SELECT only');
 assert.equal(JSON.stringify(db.sql.prepare('SELECT * FROM gsis_edge_heads ORDER BY scope').all()),before);
 assert.equal(db.sql.prepare("SELECT name FROM sqlite_master WHERE name='gsis_roster_mirror_transport_insert'").get(),undefined);
 assert.equal((await mirrorEdgeRoster(env)).archiveOnly,true,'fresh epochs never enter normal Google mirroring');
 db.sql.prepare("UPDATE gsis_edge_heads SET metadata_json='{}' WHERE scope='roster'").run();
 await assert.rejects(mirrorEdgeRoster(env),e=>e.code==='ROSTER_FRESH_START_PROOF','a fresh register with missing roster identity cannot fall back to normal mirroring');
 db.sql.prepare('UPDATE gsis_edge_heads SET metadata_json=?').run(JSON.stringify({freshStart:fresh}));
 db.sql.prepare("DELETE FROM gsis_edge_heads WHERE scope='roster-register'").run();
 await assert.rejects(readRosterMirrorStatus(env),undefined,'a missing active counterpart must not be recreated');
 assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM gsis_edge_heads WHERE scope='roster-register'").get().n,0);
}finally{db.sql.close();}
const broken={prepare(){throw Error('synthetic database unavailable');}};
await assert.rejects(mirrorEdgeRoster({ROSTER_EDGE_AUTHORITY:'d1',GSIS_JOBS:broken}),/synthetic database unavailable/,'an active database failure must not authorize normal mirroring');
console.log('PASS fresh metadata is read-only; absent legacy storage is safe; active missing, mismatched and failed storage stays closed');
