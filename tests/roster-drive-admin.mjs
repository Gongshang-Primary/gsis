import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {driveBackupAdmin} from '../roster-update/public/edge-roster.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),Store=require('../shared/edge-store.js'),db=database();
const people=[{id:'a',email:'admin@school.test',active:true},{id:'s',email:'smc@school.test',active:true},{id:'t',email:'teacher@school.test',active:true}],refs={schema:1,contacts:{rosterPeople:people,rosterAdminIds:['a'],rosterSMCIds:['a','s']},contactsCheckedAt:Date.now()};
for(const [scope,state] of [['roster',{schema:1,systemConfig:{}}],['roster-register',{schema:1,entries:[]}],['roster-references',refs]]){const store=Store.open(db,scope);await store.importState({state,actor:'admin',requestId:scope,digest:await Store.digest(state)});const h=await store.head();await store.transition({from:'imported',to:'active',expectedRevision:h.revision,actor:'admin',proof:{legacyWritesDisabled:true,sourceDigest:h.sourceDigest,verifiedRecords:h.importedRecords}});}
const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1'};
for(const email of ['smc@school.test','teacher@school.test','unknown@school.test'])await assert.rejects(driveBackupAdmin(env,{operation:'read'},{email}),e=>e.status===403);
const result=await driveBackupAdmin(env,{operation:'read'},{email:'admin@school.test'});assert.equal(result.config.enabled,false);assert.deepEqual(result.rows,[]);
const queued=await driveBackupAdmin(env,{operation:'restore',requestId:'restore-admin-1',manifestFileId:'file1'},{email:'admin@school.test'});assert(queued.queued);assert.equal(queued.request.status,'pending','Admin route only queues; no Drive call or target writes');
await assert.rejects(driveBackupAdmin({...env,ROSTER_EDGE_AUTHORITY:'google'},{operation:'read'},{email:'admin@school.test'}),e=>e.code==='BACKUP_AUTHORITY');
console.log('ledger reads and restore enqueue require current Admin; request path does no output work');
