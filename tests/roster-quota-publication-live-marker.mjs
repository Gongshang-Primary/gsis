import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {sha256Bytes} from '../public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),A=require('../shared/roster-allocation.js'),fixture=require('./roster701-fixture.cjs');
// Compile the real domain generator in memory. This exercises canonical runtime
// changes before release copies are regenerated and writes no build artifacts.
let generated;const hostFs={...fs,writeFileSync(file,value){assert.equal(path.resolve(file),path.join(root,'public/edge-deploy-domain.js'));generated=value;}};
vm.runInNewContext(fs.readFileSync(path.join(root,'scripts/build-edge-deploy.cjs'),'utf8'),{require:name=>name==='fs'?hostFs:require(name),__dirname:path.join(root,'scripts'),console:{log(){}},process,Buffer});
const {createDeployDomain}=await import('data:text/javascript;base64,'+Buffer.from(generated).toString('base64'));
const identity={email:'test@gsps.edu.sg'},state={index:{versions:[],revision:0,requests:[],publicationSchema:1,published:null},drafts:{},publications:{},receipts:{},deltas:{},leases:{},properties:{},jobs:{}},domain=createDeployDomain({state,identity,sha256:sha256Bytes,calculations:new Map(),integration(){assert.fail('No external source is used');}});
domain.dispatch({action:'change',input:{operation:'create',name:'Quota',requestId:crypto.randomUUID()},identity},{user:{email:identity.email,roles:['Admin','KP']},people:[],sysFields:{},roleCatalogue:[],authoritative:true});
const entry={...state.index.versions[0],publishedAt:'2026-10-30T08:00:00.000Z'},document=domain.readDocument(entry);document.from='2026-01-01';document.to='2026-12-31';document.teachers=[{id:'teacher',name:'Teacher',active:true,role:'Teacher',groups:[],profile:{'Basic Name':'Teacher',Role:'Teacher',Active:'Y','EO Appt Level':'GEO3'}}];
const live=domain.rosterReference(document,entry),row=live.rows[0];assert(Number.isFinite(row.R)&&row.R>0,'the real live calculation supplies R before checkpoint capture');assert.equal(row.teachingVerified,true);assert.equal(row.capVerified,true);const original=JSON.stringify(live);
const f=fixture(),date='2026-11-02',now=Date.parse(date+'T06:00:00+08:00'),ctx={...f.ctx,today:date,now,iso:new Date(now).toISOString(),minute:360,quotaRequested:true,people:[{id:row.id,name:'Teacher',active:true}],days:{[date]:{verified:true,schoolDay:true,periods:[],quotaSource:live.source,teachers:[{staffId:row.id,R:row.R,originalR:row.R,quotaSource:live.source,cells:[],...row}]}}};
const unknown=A.weekQuota(f.state,ctx,row.id,date);assert.equal(unknown.quota,null,'a live D1 calculation is not a captured weekly entitlement');assert.equal(unknown.verified,false);A.captureWeek(f.state,ctx,date);assert.equal(f.state.entitlements.length,0,'ordinary D1 reads cannot bypass missing snapshot evidence');
assert.equal(live.source.weeklyCheckpoint,true);assert.equal(live.source.publishedAt,entry.publishedAt);assert.equal(JSON.stringify(live),original,'the marker does not remove or rewrite live teaching and cap evidence');
f.state.entitlements.push({staffId:row.id,week:date,year:A.year(date),quota:7,mode:'checkpoint',excluded:false,source:{commit:'captured-publication'}});const captured=A.weekQuota(f.state,ctx,row.id,date);assert.equal(captured.quota,7);assert.equal(captured.verified,true,'the captured ledger still governs weekly R');
console.log('PASS live D1 quota provenance: actual domain R cannot bypass the checkpoint, captured R wins, and live cap/teaching evidence remains intact.');
