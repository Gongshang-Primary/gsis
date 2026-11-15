import assert from 'node:assert/strict';
import {createDatabase,syntheticAdmission} from './v1-product/helpers.mjs';
import {storageInventory,storagePreview,confirmStoragePrune,finishStoragePrune} from '../v1/runtime/storage.mjs';
import {backupOwner} from '../v1/runtime/backup.mjs';
import {prepareOperation,commitOperation,one,query,digest,canonical,abortOperation} from '../v1/runtime/store.mjs';
import {productSuite,origin} from './v1-product/suite.mjs';
import {chromium} from 'playwright';
const h=await createDatabase('calendar'),school='synthetic-school';
const principal={schoolId:school,actorId:'admin',capabilities:['admin','core.admin'],validUntil:Date.now()+3600000,requestDigest:'a'.repeat(64),action:'core.admin',decisionId:'synthetic-decision'};
function ctx(body={}){return {env:{DB:h.db,ARTIFACTS:h.bucket,SCHOOL_ID:school,SERVICE_NAME:'calendar'},principal,body,now:Date.now()};}
async function pre(c,action){const op=await prepareOperation(h.db,{schoolId:school,actorId:principal.actorId,operationId:c.body.operationId,action,intent:c.body,now:c.now,validUntil:principal.validUntil,authorization:principal});await syntheticAdmission(h.db,op);return op;}
try{
 const now=Date.now();
 for(const [id,expiry] of [['expired',now-1000],['live',now+60000]])await h.db.prepare("INSERT INTO calendar_previews VALUES(?,?,'actor','archive','digest',?,'{}')").bind(school,id,expiry).run();
 const inventory=await storageInventory(ctx());assert(inventory.d1.allocatedBytes>0);assert.equal(inventory.d1.reusablePageBytes,null);assert.equal(inventory.d1.expiredPreviews,1);assert.equal(inventory.automaticDeletion,false);
 const p=await storagePreview(ctx({kind:'expired-previews'}));assert.deepEqual(p.selection.map(x=>x.id),['expired']);
 const command={kind:p.kind,cutoff:p.cutoff,operationId:'clear-expired',previewDigest:p.previewDigest,confirmation:p.confirmation};
 const c=ctx(command);await pre(c,'system.storage.prune');
 const receipt=await confirmStoragePrune(c);assert.equal(receipt.result.state,'complete');
 assert.equal((await query(h.db,'SELECT preview_id FROM calendar_previews')).length,1);
 assert.equal((await confirmStoragePrune(ctx(command))).digest,receipt.digest,'lost response replays original receipt');
 assert.equal((await one(h.db,'SELECT state FROM storage_cleanup WHERE cleanup_id=?',['clear-expired'])).state,'complete');
 await assert.rejects(()=>storagePreview(ctx({kind:'expired-previews',cutoff:now+100000})),e=>e.code==='PRUNE_PREVIEW_EXPIRED');
 await assert.rejects(()=>storagePreview(ctx({kind:'audit-history'})),e=>e.code==='PRUNE_KIND_UNAVAILABLE');
 await h.db.prepare("INSERT INTO calendar_previews VALUES(?,'changed','actor','archive','digest',?,'{}')").bind(school,now-1000).run();
 const stale=await storagePreview(ctx({kind:'expired-previews'}));await h.db.prepare("UPDATE calendar_previews SET expires_at=? WHERE preview_id='changed'").bind(now+600000).run();
 const staleCtx=ctx({...stale,operationId:'stale',confirmation:stale.confirmation});const staleOp=await pre(staleCtx,'system.storage.prune');
 await assert.rejects(()=>confirmStoragePrune(staleCtx),e=>e.code==='PRUNE_PREVIEW_CHANGED');await abortOperation(h.db,staleOp,'TEST_REJECTED',Date.now());
 assert(await one(h.db,"SELECT 1 ok FROM calendar_previews WHERE preview_id='changed'"));
 // Real backup snapshot plus two abandoned immutable attempt parts.
 await h.bucket.put(school+'/retained-evidence.json','important evidence');
 const {manifest}=await backupOwner({db:h.db,bucket:h.bucket,owner:'calendar',schoolId:school,backupId:'backup',now:Date.now()});
 const backupOp=await prepareOperation(h.db,{schoolId:school,actorId:'admin',operationId:'backup',action:'system.backup',intent:{},now:Date.now(),validUntil:principal.validUntil});
 await syntheticAdmission(h.db,backupOp);
 await commitOperation(h.db,backupOp,{now:Date.now(),result:{backupId:'backup'},admission:{decisionId:'synthetic-decision'}});
 const prefix=`backups/${school}/backup/`,orphans=[];
 for(const body of ['abandoned one','abandoned two']){const key=prefix+'database-'+await digest(body)+'.json';await h.bucket.put(key,body);orphans.push(key);}
 const bp=await storagePreview(ctx({kind:'backup-orphans',backupId:'backup'}));assert.deepEqual(bp.selection.map(o=>o.key).sort(),orphans.sort());
 const bc=ctx({kind:bp.kind,backupId:'backup',cutoff:bp.cutoff,previewDigest:bp.previewDigest,confirmation:bp.confirmation,operationId:'orphan-plan'});await pre(bc,'system.storage.prune');
 assert.equal((await confirmStoragePrune(bc)).result.state,'pending');
 const finish=ctx({operationId:'finish-orphans',cleanupId:'orphan-plan'});await pre(finish,'system.storage.finish');
 let attempts=0;const real=h.bucket;
 finish.env.ARTIFACTS=new Proxy(real,{get(target,key){if(key==='delete')return async name=>{if(++attempts===2)throw Error('simulated crash after first deletion');return target.delete(name);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 await assert.rejects(()=>finishStoragePrune(finish),/simulated crash/);
 assert.equal((await one(h.db,"SELECT state FROM storage_cleanup WHERE cleanup_id='orphan-plan'")).state,'pending');
 await h.restart();
 const done=await finishStoragePrune(ctx(finish.body));assert.equal(done.result.state,'complete');
 for(const key of orphans)assert.equal(await h.bucket.head(key),null);
 for(const key of [prefix+'manifest.json',manifest.data.key,...manifest.objects.map(o=>o.backupKey),school+'/retained-evidence.json'])assert(await h.bucket.head(key),'protected evidence and valid backup part retained');
 assert.equal((await finishStoragePrune(ctx(finish.body))).digest,done.digest);
 // A corrupted/changed manifest must block even an already-confirmed plan.
 const extra=prefix+'database-'+await digest('later orphan')+'.json';await h.bucket.put(extra,'later orphan');
 const again=await storagePreview(ctx({kind:'backup-orphans',backupId:'backup'}));
 const ac=ctx({kind:again.kind,backupId:'backup',cutoff:again.cutoff,previewDigest:again.previewDigest,confirmation:again.confirmation,operationId:'manifest-plan'});await pre(ac,'system.storage.prune');await confirmStoragePrune(ac);
 const originalManifest=await (await h.bucket.get(prefix+'manifest.json')).text();
 await h.bucket.put(prefix+'manifest.json',canonical({...JSON.parse(originalManifest),sourceCommit:'changed'}));
 const fc=ctx({operationId:'changed-manifest',cleanupId:'manifest-plan'});const rejected=await pre(fc,'system.storage.finish');
 await assert.rejects(()=>finishStoragePrune(fc),e=>e.code==='PRUNE_MANIFEST_CHANGED');assert(await h.bucket.head(extra));
 await abortOperation(h.db,rejected,'TEST_REJECTED',Date.now());
 await h.bucket.put(prefix+'manifest.json',originalManifest);
 const resumed=ctx({operationId:'resume-manifest',cleanupId:'manifest-plan'});await pre(resumed,'system.storage.finish');assert.equal((await finishStoragePrune(resumed)).result.state,'complete');
 for(let i=0;i<105;i++)await h.db.prepare("INSERT INTO calendar_previews VALUES(?,?,'actor','archive','digest',?,'{}')").bind(school,'bounded-'+i,Date.now()-1000).run();
 const bounded=await storagePreview(ctx({kind:'expired-previews'}));assert.equal(bounded.selection.length,100,'preview never silently selects more than its visible batch');
 const boundedCtx=ctx({kind:bounded.kind,cutoff:bounded.cutoff,previewDigest:bounded.previewDigest,confirmation:bounded.confirmation,operationId:'bounded-prune'});await pre(boundedCtx,'system.storage.prune');assert.equal((await confirmStoragePrune(boundedCtx)).result.count,100);
 assert.equal((await one(h.db,"SELECT COUNT(*) n FROM calendar_previews WHERE preview_id LIKE 'bounded-%'")).n,5);
 await assert.rejects(()=>storagePreview(ctx({kind:'backup-orphans',backupId:'../other-school'})));
 assert((await query(h.db,'SELECT * FROM product_audit')).length>=3);
 console.log('PASS actual D1 allocated size with unavailable free-page metric, expired-only atomic prune, stale/invalid selection, receipt replay, R2 retained references, partial-delete restart and retained journal/audit');
}finally{await h.close();}
const suite=await productSuite();
try{
 const admin=await suite.seedAccount('storage-admin'),ordinary=await suite.seedAccount('storage-user',{capabilities:['calendar.admin']});
 for (const owner of ['core','contacts','deploy','roster','calendar','lord','venues','layout']) {const status=await suite.request(admin,owner,'/system/storage');assert.equal(status.status,200,owner+': '+JSON.stringify(status.body));}
 for(const path of ['/system/storage','/system/storage/preview','/system/storage/confirm','/system/storage/finish']){
  const r=await suite.request(ordinary,'calendar',path,path==='/system/storage'?{}:{method:'POST',body:{kind:'expired-previews',operationId:'denied-operation'}});assert.equal(r.status,403,'domain admin cannot invoke '+path);
 }
 const db=await suite.db('calendar');
 await db.prepare("INSERT INTO calendar_previews VALUES(?,'browser-expired','actor','archive','digest',?,'{}')").bind(school,Date.now()-1000).run();
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM||undefined});
 try {
  const context=await browser.newContext();await context.addCookies([{name:'__Host-gsis_session',value:admin.token,domain:'gsis.example.invalid',path:'/',secure:true,httpOnly:true,sameSite:'Lax'}]);
  await context.route('**/*',async route=>{const r=route.request();if(!r.url().startsWith(origin+'/'))return route.abort();const response=await suite.mf.dispatchFetch(r.url(),{method:r.method(),headers:await r.allHeaders(),body:['GET','HEAD'].includes(r.method())?undefined:r.postDataBuffer()});const headers=Object.fromEntries(response.headers);delete headers['transfer-encoding'];return route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});});
  const page=await context.newPage();await page.goto(origin+'/admin/#storage');await page.locator('#storage').waitFor({state:'visible'});await page.locator('#storageOwner').selectOption('calendar');await page.locator('#storageRefresh').click();
  await page.getByRole('button',{name:'Preview expired temporary previews (1)',exact:true}).click();
  await page.locator('#storagePrune form input').fill('PRUNE 1 calendar SCRATCH ITEMS');
  await page.getByRole('button',{name:'Confirm this prune',exact:true}).click();
  await page.getByText('Expired previews removed. The audit and cleanup journal are retained.',{exact:true}).waitFor();
  assert.equal(await one(db,"SELECT 1 ok FROM calendar_previews WHERE preview_id='browser-expired'"),null);
 } finally {await browser.close();}
 console.log('PASS real gateway/Core Global Admin and domain-Admin denial; browser inspect/preview/typed-confirm produces actual atomic owner deletion');
}finally{await suite.close();}
