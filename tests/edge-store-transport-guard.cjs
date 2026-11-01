'use strict';
const assert=require('node:assert/strict');
const database=require('./helpers/chunked-import-db.cjs');
const Store=require('../shared/edge-store.js'),Mirror=require('../shared/roster-mirror.js');
async function active(db,scope){const store=Store.open(db,scope),imported=await store.importState({state:{revision:0,value:'before'},actor:'fixture',requestId:'import-'+scope});await store.transition({from:'imported',to:'active',expectedRevision:imported.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:imported.sourceDigest,verifiedRecords:imported.importedRecords}});return store;}
async function main(){
 const db=database(),store=await active(db,'roster');db.sql.exec("CREATE TABLE gsis_absence_transport(namespace TEXT,actor TEXT,request_id TEXT,state TEXT)");await Mirror.ensure(db);db.sql.prepare("INSERT INTO gsis_absence_transport VALUES('school','staff','request','needsReview')").run();
 const original=await store.load(),readCounter=()=>db.sql.prepare('SELECT transport_revision FROM gsis_roster_mirror_control WHERE id=1').get().transport_revision,observed=readCounter();
 const command={before:original.state,after:{...original.state,value:'replacement'},expectedRevision:original.revision,actor:'fixture',requestId:'repair',digest:await Store.digest('repair'),rosterTransportRevision:observed};
 db.onBatch(()=>db.sql.prepare("UPDATE gsis_absence_transport SET state='queued'").run());
 await assert.rejects(store.commit(command),error=>error.code==='EDGE_CONFLICT','transport status change must invalidate a prepared replacement');assert.equal((await store.head()).revision,original.revision);assert.deepEqual((await store.load()).state,original.state);assert.equal(await store.receipt('fixture','repair'),null);
 assert(readCounter()>observed);const saved=await store.commit({...command,rosterTransportRevision:readCounter()});assert(saved.saved);assert.equal((await store.load()).state.value,'replacement');const replay=await store.commit(command);assert(replay.duplicate,'accepted receipt replays even when its old transport guard is stale');
 for(const value of [-1,1.2,'2',Number.MAX_SAFE_INTEGER+1])await assert.rejects(store.commit({...command,expectedRevision:saved.revision,requestId:'invalid-'+String(value),rosterTransportRevision:value}),error=>error.code==='EDGE_GUARD');
 const deploy=await active(db,'deploy'),before=await deploy.load();await assert.rejects(deploy.commit({before:before.state,after:before.state,expectedRevision:before.revision,actor:'fixture',requestId:'deploy-guard',digest:await Store.digest('deploy'),rosterTransportRevision:0}),error=>error.code==='EDGE_GUARD');
 console.log('PASS transport revision guard: atomic pending-report race, retry, receipt replay and bounded Roster-only validation');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
