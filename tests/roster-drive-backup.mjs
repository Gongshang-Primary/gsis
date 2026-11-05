import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gzipSync,gunzipSync} from 'node:zlib';
import {ensureBackup, captureBackup, backupPayload, finishBackup, backupStatus, runDriveBackup, sanitizeBackup, tierFor} from '../roster-update/public/edge-roster-backup.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),Store=require('../shared/edge-store.js');
const now=Date.parse('2026-11-06T02:15:00+08:00');
async function fixture(){
 const db=database();
 for(const [scope,state] of [['roster',{schema:1,revision:1,freshStart:{effectiveDate:'2026-11-06'},systemConfig:{driveBackup:{enabled:true,homeBaseFolderId:'home',folderId:'backups'}},absences:[{id:'a',date:'2026-11-06',reason:'private medical reason',token:'NEVER-TOKEN'}],assignments:[],outbox:[{id:'o',body:'Open https://roster.example/external.html#CAPABILITY',privateUrl:'https://roster.example/#SECRET'}],privateLinks:[{id:'link',token:'NEVER-LINK'}],receipts:[{id:'receipt'}]}],['roster-register',{schema:1,revision:1,entries:[],receipts:[{id:'MACHINE-RECEIPT',token:'MACHINE-SECRET'}]}]]){
  const store=Store.open(db,scope);await store.importState({state,expectedRevision:0,actor:'admin',requestId:scope,digest:await Store.digest(state)});const head=await store.head();await store.transition({expectedRevision:head.revision,from:'imported',to:'active',actor:'admin',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});
 }
 await ensureBackup(db);return db;
}
const db=await fixture(),full=await captureBackup(db,{kind:'full',now});assert.equal(full.kind,'full');
assert.equal((await captureBackup(db,{kind:'full',now})).busy,true,'overlap skips');
const one=await backupPayload({GSIS_JOBS:db},full,1),two=await backupPayload({GSIS_JOBS:db},full,2);
assert(one.rows.some(r=>r.collection==='absences'));assert(two.rows.some(r=>r.collection==='outbox'));assert(!one.rows.some(r=>['receipts','privateLinks','outbox'].includes(r.collection)));
assert(JSON.stringify(one).includes('private medical reason'),'restricted backup preserves reasons');assert(!JSON.stringify([one,two]).includes('NEVER-'));assert(!JSON.stringify(two).includes('#CAPABILITY'));assert(!JSON.stringify(two).includes('#SECRET'));
assert(!JSON.stringify(one).includes('MACHINE-'));assert.equal(tierFor('roster-register','receipts'),0);assert.equal(tierFor('roster','privateLinks'),0);assert.equal(tierFor('roster','scheduleReceipts'),0);assert.equal(tierFor('roster-register','entries'),1);
await finishBackup(db,full,{status:'verified',now:now+500,manifest:{files:[]}});
const store=Store.open(db,'roster'),before=await store.load();await store.commit({before:before.state,after:{...before.state,revision:2,absences:[],assignments:[{id:'b',date:'2026-11-06',staffId:'s'}]},expectedRevision:before.revision,actor:'smc',requestId:'edit',digest:await Store.digest('edit')});
const inc=await captureBackup(db,{kind:'increment',now:now+3600000}),payload=await backupPayload({GSIS_JOBS:db},inc,1);
assert(payload.deleted.some(r=>r.collection==='absences'&&r.record_id==='id:a'),'deletion tombstone survives');assert(payload.rows.some(r=>r.collection==='assignments'&&r.record_id==='id:b'));assert(!payload.rows.some(r=>r.collection==='outbox'));
await finishBackup(db,inc,{status:'failed',now:now+3600500,error:{code:'TEST_FAILURE'}});
const retry=await captureBackup(db,{kind:'increment',now:now+3660000});await finishBackup(db,retry,{status:'failed',now:now+3660500,error:{code:'TEST_FAILURE'}});
assert((await backupStatus(db,{now:now+3661000})).warnings.includes('two-failures'));
assert((await backupStatus(db,{now:now+27*3600000})).warnings.includes('full-overdue'));
const packed={encoding:'gzip-audit-v1',data:gzipSync(JSON.stringify({version:1,token:'PACKED-SECRET',text:'safe'})).toString('base64')};
const safePacked=await sanitizeBackup({nested:{capability:'SECRET',keep:1},packed,encoded:JSON.stringify({accessToken:'SECRET',keep:2})});assert(!gunzipSync(Buffer.from(safePacked.packed.data,'base64')).toString().includes('PACKED-SECRET'));assert(!safePacked.encoded.includes('SECRET'));assert.equal(JSON.parse(safePacked.encoded).keep,2);
const db2=await fixture();let calls=0,release;const gate=new Promise(r=>release=r);
const running=runDriveBackup({GSIS_JOBS:db2,ROSTER_EDGE_AUTHORITY:'d1'},{now,bridge:async()=>{calls++;await gate;throw Object.assign(Error('Drive unavailable'),{code:'DRIVE_UNAVAILABLE'});}});
while(!calls)await new Promise(r=>setTimeout(r,1));
const start=performance.now(),live=await Store.open(db2,'roster').load();assert(live.state.absences.length===1);assert(performance.now()-start<1000,'blocked Drive does not block request reads');
release();await running;assert.equal(db2.sql.prepare("SELECT COUNT(*) n FROM gsis_backup_ledger WHERE status='failed'").get().n,1);
assert.equal(db2.sql.prepare("SELECT COUNT(*) n FROM gsis_backup_ledger").get().n,1);
console.log('backup tiers, privacy, increments, deletion, overlap, failure alerts and request isolation pass');
