import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import {runDriveBackup} from '../roster-update/public/edge-roster-backup.js';
import {readBackupChain,restoreBackupChain} from '../roster-update/public/edge-roster-backup-restore.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),Store=require('../shared/edge-store.js'),files=new Map();let next=0;
const db=database(),target=database(),now=Date.parse('2026-11-06T02:15:00+08:00');
for(const [scope,state] of [['roster',{schema:1,revision:1,absences:[{id:'a',date:'2026-11-06',reason:'restricted'}],assignments:[],requests:[{id:'request',status:'pending'}],inboxMessages:[{id:'inbox',direction:'outbound',status:'queued'}],outbox:[{id:'o',status:'sent',privateToken:'do-not-export'}],systemConfig:{driveBackup:{enabled:true,homeBaseFolderId:'home',folderId:'backups'}}}],['roster-register',{schema:1,revision:1,entries:[]}]]){
 const s=Store.open(db,scope);await s.importState({state,actor:'admin',requestId:scope,digest:await Store.digest(state)});const h=await s.head();await s.transition({from:'imported',to:'active',expectedRevision:h.revision,actor:'admin',proof:{legacyWritesDisabled:true,sourceDigest:h.sourceDigest,verifiedRecords:h.importedRecords}});
}
const bridge=async p=>{
 if(p.step==='readBackup'){const file=files.get(p.fileId);assert(file);return file;}
 const fileId='file-'+ ++next,file={fileId,name:p.name,...p.data?{data:p.data}:{text:p.text}};files.set(fileId,file);
 if(p.data){const value=JSON.parse(gunzipSync(Buffer.from(p.data,'base64')));return {verified:true,fileId,digest:p.digest,records:value.rows.length,counts:value.counts};}
 return {verified:true,fileId,digest:p.digest};
};
const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1'};assert((await runDriveBackup(env,{now,bridge})).verified);
const s=Store.open(db,'roster'),first=await s.load();await s.commit({before:first.state,after:{...first.state,revision:2,absences:[],assignments:[{id:'b',date:'2026-11-06',staffId:'teacher'}]},expectedRevision:first.revision,actor:'smc',requestId:'change',digest:await Store.digest('change')});
assert((await runDriveBackup(env,{now:now+3600000,bridge})).verified);
const id=db.sql.prepare("SELECT drive_file_id FROM gsis_backup_ledger WHERE kind='increment'").get().drive_file_id,chain=await readBackupChain({manifestFileId:id,config:{},bridge});assert.equal(chain.manifests.length,2);assert.equal(chain.state.absences.length,0);assert.equal(chain.state.assignments.length,1);assert.equal(chain.state.outbox[0].status,'sent');assert(!JSON.stringify(chain.state).includes('do-not-export'));
const result=await restoreBackupChain({sourceDb:db,targetDb:target,targetBucket:{},chain,actor:'admin',requestId:'restore-test-1'});assert(result.imported);const restored=await Store.open(target,'roster').load();assert.equal(restored.mode,'imported');assert.deepEqual(restored.state.absences,[]);assert.equal(restored.state.assignments[0].id,'b');assert.equal(restored.state.inboxMessages[0].status,'archived');assert.equal(restored.state.requests[0].status,'expired');
await assert.rejects(restoreBackupChain({sourceDb:db,targetDb:db,targetBucket:{},chain,actor:'admin',requestId:'bad-target'}),/empty|source|production/i);
await assert.rejects(restoreBackupChain({sourceDb:db,targetDb:target,targetBucket:{},chain,actor:'admin',requestId:'second'}),/empty|active|import/i);
const corrupt=files.get(id),original=corrupt.text;corrupt.text=original.replace('gsis-roster-drive-backup-v1','tampered');await assert.rejects(readBackupChain({manifestFileId:id,config:{},bridge}),/digest|manifest/i);corrupt.text=original;
console.log('full plus increment restore, deletion, privacy, stage/finalize and nonempty target refusal pass');
