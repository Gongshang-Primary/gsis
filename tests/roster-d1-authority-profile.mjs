import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {rosterRecoveryEnvironment,resolveRosterAuthorityEnvironment} from '../shared/roster-recovery-profile.js';

const globalDigest='a'.repeat(64),manifestDigest='b'.repeat(64),session='c'.repeat(64);
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE gsis_edge_heads(scope TEXT PRIMARY KEY,mode TEXT,source_digest TEXT,imported_records INTEGER,metadata_json TEXT);
 CREATE TABLE gsis_edge_records(scope TEXT,collection TEXT,record_id TEXT);
 CREATE TABLE gsis_edge_transitions(scope TEXT,previous_mode TEXT,next_mode TEXT,proof_json TEXT);`);
 let primary=0;
 const db={sql,withSession(mode){assert.equal(mode,'first-primary');primary++;return this;},prepare(query){return {async all(){return {success:true,results:sql.prepare(query).all()};}};}};
 for(const [scope,digest]of [['roster','d'.repeat(64)],['roster-register','e'.repeat(64)]]){
  sql.prepare('INSERT INTO gsis_edge_heads VALUES(?,?,?,?,?)').run(scope,'active',digest,2,JSON.stringify({source:{sourceDigest:globalDigest,manifestDigest},importSession:session}));
  sql.prepare('INSERT INTO gsis_edge_records VALUES(?,?,?)').run(scope,'$root','$');
  sql.prepare('INSERT INTO gsis_edge_transitions VALUES(?,?,?,?)').run(scope,'imported','active',JSON.stringify({legacyWritesDisabled:true,sourceDigest:digest,verifiedRecords:2}));
 }
 return {db,primary:()=>primary,env:{GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',DEPLOY_EDGE_AUTHORITY:'d1',GSIS_BACKEND_REQUIRED:'true',GSIS_BACKEND:{fetch(){}},GSIS_BACKGROUND_JOBS:'true'}};
}
const legacy=rosterRecoveryEnvironment({ROSTER_EDGE_AUTHORITY:'d1'});assert.equal(legacy.ROSTER_EDGE_AUTHORITY,'legacy','synchronous recovery default stays unchanged');
assert.equal((await resolveRosterAuthorityEnvironment({ROSTER_EDGE_AUTHORITY:'d1'})).ROSTER_EDGE_AUTHORITY,'legacy');
assert.equal((await resolveRosterAuthorityEnvironment({ROSTER_EDGE_AUTHORITY:'legacy',GSIS_JOBS:{prepare(){assert.fail('legacy mode performs no D1 read');}}})).ROSTER_EDGE_AUTHORITY,'legacy');
{
 const h=fixture(),result=await resolveRosterAuthorityEnvironment(h.env);assert.equal(result.ROSTER_EDGE_AUTHORITY,'d1');assert.equal(h.primary(),1);
 assert.equal(result.DEPLOY_EDGE_AUTHORITY,'legacy');assert.equal(result.GSIS_BACKEND_REQUIRED,'false');assert.equal(result.GSIS_BACKEND,undefined);assert.equal(result.GSIS_BACKGROUND_JOBS,'false');
 assert.equal(h.env.GSIS_BACKEND_REQUIRED,'true','profile never mutates the caller environment');
 h.db.sql.exec("UPDATE gsis_edge_heads SET mode='paused'");assert.equal((await resolveRosterAuthorityEnvironment(h.env)).ROSTER_EDGE_AUTHORITY,'d1','paused heads retain the maintenance/release route');
}
for(const mode of ['legacy','imported']){
 const h=fixture();h.db.sql.prepare('UPDATE gsis_edge_heads SET mode=?').run(mode);assert.equal((await resolveRosterAuthorityEnvironment(h.env)).ROSTER_EDGE_AUTHORITY,'legacy');
}
{
 const sql=new DatabaseSync(':memory:'),db={prepare(query){return {async all(){return {success:true,results:sql.prepare(query).all()};}};}};
 assert.equal((await resolveRosterAuthorityEnvironment({ROSTER_EDGE_AUTHORITY:'d1',GSIS_JOBS:db})).ROSTER_EDGE_AUTHORITY,'legacy');
 assert.equal(sql.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get().n,0,'metadata routing never initializes migration tables');
}
const invalid=[
 sql=>sql.exec("UPDATE gsis_edge_heads SET mode='imported' WHERE scope='roster-register'"),
 sql=>sql.exec("DELETE FROM gsis_edge_heads WHERE scope='roster-register'"),
 sql=>sql.exec("DELETE FROM gsis_edge_records WHERE scope='roster-register'"),
 sql=>sql.exec("DELETE FROM gsis_edge_transitions WHERE scope='roster-register'"),
 sql=>sql.exec("UPDATE gsis_edge_transitions SET proof_json=json_set(proof_json,'$.verifiedRecords',3) WHERE scope='roster'"),
 sql=>sql.exec("UPDATE gsis_edge_transitions SET proof_json=json_set(proof_json,'$.legacyWritesDisabled',0) WHERE scope='roster'"),
 sql=>sql.exec("UPDATE gsis_edge_heads SET metadata_json=json_set(metadata_json,'$.source.sourceDigest','bad') WHERE scope='roster'"),
 sql=>sql.exec("UPDATE gsis_edge_heads SET metadata_json=json_set(metadata_json,'$.source.manifestDigest','"+'f'.repeat(64)+"') WHERE scope='roster'"),
 sql=>sql.exec("UPDATE gsis_edge_heads SET metadata_json=json_set(metadata_json,'$.importSession','"+'f'.repeat(64)+"') WHERE scope='roster'"),
 sql=>sql.exec("UPDATE gsis_edge_heads SET metadata_json='invalid' WHERE scope='roster'"),
];
for(const damage of invalid){const h=fixture();damage(h.db.sql);await assert.rejects(resolveRosterAuthorityEnvironment(h.env),error=>error.status===503&&error.code==='ROSTER_AUTHORITY_UNVERIFIED');}
await assert.rejects(resolveRosterAuthorityEnvironment({ROSTER_EDGE_AUTHORITY:'d1',GSIS_JOBS:{prepare(){throw Error('database temporarily unavailable');}}}),error=>error.status===503&&error.code==='ROSTER_AUTHORITY_UNVERIFIED');
console.log('PASS authority profile: stale flags stay Google; verified matching imports and activation proofs admit D1; paused maintenance stays reachable; failed proof reads never fall back.');
