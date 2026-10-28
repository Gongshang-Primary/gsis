const vm=require('vm'),assert=require('assert/strict');const {ctx,sheets}=require('./storage.cjs');const run=s=>vm.runInContext(s,ctx);
run(`var auditFixture=call('change',{operation:'create',name:'Audit read fixture',requestId:Utilities.getUuid()}).versionId;
 var auditEntry=()=>index_(book_()).versions.find(x=>x.id===auditFixture);
 var auditDoc=document_(book_(),auditEntry());auditDoc.audit=auditDoc.audit.concat(Array.from({length:141},(_,i)=>({id:'audit-'+i,at:'2026-09-28',actor:'test@gsps.edu.sg',action:'Fixture',before:{text:'x'.repeat(3000)},after:{value:i}})));persist_(book_(),index_(book_()),auditDoc,null);`);
let reads=[];const restores=[];
for(const [name,s] of sheets){const original=s.getRange.bind(s);restores.push(()=>s.getRange=original);s.getRange=(...args)=>{const r=original(...args);for(const method of ['getValue','getValues']){const fn=r[method];r[method]=(...a)=>{reads.push({name,args});return fn(...a)};}return r;};}
const en=JSON.parse(run('JSON.stringify(auditEntry())'));reads=[];
const page=run("call('auditPage',{versionId:auditFixture})");
assert.equal(page.events.length,40);assert.equal(page.total,142);assert.equal(page.events[0].id,'audit-140');
assert.equal(reads.filter(r=>r.name==='deploy_index').length,2,'only initial and post-read consistency index checks');
assert.equal(reads.filter(r=>r.name===en.store).length,0,'summary must not read canonical history');
assert.deepEqual(reads.find(r=>r.name===en.auditIndex).args,[104,1,40,4]);
reads=[];const a=page.events[0];ctx.detailInput={versionId:en.id,detailId:a.id,row:a.row,epoch:a.epoch};
assert.equal(run("call('auditPage',detailInput).event.after.value"),140);assert.equal(reads.filter(r=>r.name===en.store).length,1);
// Pending writes must never leak a partially changed audit read even before revision advances.
const sh=sheets.get(en.auditIndex),original=sh.getRange.bind(sh);let interrupt=true;
sh.getRange=(...args)=>{const r=original(...args),get=r.getValues;r.getValues=()=>{const data=get();if(interrupt){interrupt=false;run("var pendingAuditIndex=index_(book_());pendingAuditIndex.pendingFieldCommit={commit:'test'};book_().getSheetByName('deploy_index').getRange('B2').setValue(JSON.stringify(pendingAuditIndex));");}return data;};return r;};
assert.throws(()=>run("call('auditPage',{versionId:auditFixture})"),e=>e.status===503);
sh.getRange=original;run("delete pendingAuditIndex.pendingFieldCommit;book_().getSheetByName('deploy_index').getRange('B2').setValue(JSON.stringify(pendingAuditIndex));");
// Admin checks remain mandatory. The legacy snapshot fallback remains compatible.
assert.throws(()=>run("dispatch_({action:'auditPage',input:{versionId:auditFixture}}, {user:{roles:['KP']}})"),e=>e.status===403);
run("var legacyAuditIndex=index_(book_());delete legacyAuditIndex.versions.find(x=>x.id===auditFixture).auditIndex;var legacyAuditPage=auditPage_(book_(),legacyAuditIndex,c,{versionId:auditFixture});");
assert.equal(run('legacyAuditPage.events.length'),40);assert.equal(run('legacyAuditPage.total'),142);
restores.forEach(fn=>fn());console.log('PASS Audit summaries: 40 rows/160 cells, zero full-history reads, two index checks; lazy detail, pending-write fence, Admin enforcement and legacy compatibility.');
