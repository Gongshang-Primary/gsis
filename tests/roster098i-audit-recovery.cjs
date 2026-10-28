'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),adapter=require('./roster701-adapter.cjs');
let count=0;function test(name,fn){fn();count++;console.log('PASS',name);}
function fixture(){
 const h=adapter();vm.runInContext(fs.readFileSync('backend/RosterAuditExport.gs','utf8'),h.scope);
 const transfers=[];let user=false;
 h.scope.LockService.getUserLock=()=>({tryLock(){assert(!user);user=true;return true;},releaseLock(){assert(user);user=false;}});
 const script=h.scope.LockService.getScriptLock;h.scope.LockService.getScriptLock=()=>{assert.equal(user,false,'transport lock must be released before writer lock');return script();};
 h.scope.Utilities.newBlob=text=>({getBytes:()=>Buffer.from(text)});h.scope.rosterAllocationAuditFolder_=date=>{transfers.push(['folder',date]);return 'folder';};h.scope.rosterFindFile_=(_,name)=>name;
 h.scope.rosterAllocationAuditArchive_=state=>({state,fileId:'archive'});
 h.scope.rosterDriveRequest_=(url,options)=>{if(url.includes('.txt')){assert.equal(h.locked(),false);transfers.push(['text',url,options.payload]);return {};}assert(h.locked());h.setState(JSON.parse(options.payload));return {};};
 return {h,transfers,pending(dates){const s=h.state();for(const date of dates)s.audit.push({id:'event-'+date,date,operation:'assign',actor:'PRIVATE_STAFF',at:h.ctx.iso});h.setState(s);}};
}
test('retained uncaptured facts recover one oldest day per export without allocation or sends',()=>{
 const f=fixture();f.pending(['2026-10-13','2026-10-12']);const first=f.h.scope.rosterAllocationAuditExport_({limit:999});assert.equal(first.exported.length,1);assert.equal(first.exported[0].date,'2026-10-12');assert.equal(first.pending,1);assert.equal(f.h.state().revision,0);assert.equal(f.h.state().outbox.length,0);assert.equal(f.transfers.filter(row=>row[0]==='text').length,1);
 const text=f.transfers.find(row=>row[0]==='text')[2];assert.match(text,/Limited historical decision evidence/);assert.match(text,/PRIVATE_STAFF/);assert.equal(f.h.state().audit[0].acceptedRevision,null,'recovery must not pretend old evidence was accepted now');
 const second=f.h.scope.rosterAllocationAuditExport_({limit:999});assert.equal(second.exported.length,1);assert.equal(second.exported[0].date,'2026-10-13');assert.equal(second.pending,0);assert.equal(f.h.state().revision,0);
 const before=JSON.stringify(f.h.state()),transfers=f.transfers.length;assert.equal(f.h.scope.rosterAllocationAuditExport_({}).exported.length,0);assert.equal(JSON.stringify(f.h.state()),before,'repeated export creates no new intent or receipt');assert.equal(f.transfers.length,transfers,'repeated completed work performs no Drive transfer');
});
test('empty or verbose-disabled exports never take locks or read transport',()=>{
 for(const disabled of [false,true]){const f=fixture(),s=f.h.state();s.systemConfig.verboseLogging=!disabled;if(disabled){s.audit.push({id:'off',date:f.h.date,operation:'assign'});s.allocationAuditExports={[f.h.date]:{pendingVersion:1,exportedVersion:0}};}f.h.setState(s);f.h.scope.LockService.getUserLock=()=>assert.fail('No export lock without enabled work');f.h.scope.rosterNotificationState_=()=>assert.fail('No notification transport read without enabled work');const result=f.h.scope.rosterAllocationAuditExport_({});assert.equal(result.exported.length,0);assert.equal(result.pending,disabled?1:0);assert.equal(result.disabled,disabled?true:undefined);assert.equal(f.transfers.length,0);}
});
test('contention retains accurate pending count without mutating receipts',()=>{
 const f=fixture();f.pending([f.h.date]);const s=f.h.state();f.h.scope.rosterAllocationAuditCapture_(s);f.h.setState(s);f.h.scope.LockService.getUserLock=()=>({tryLock:()=>false});const before=JSON.stringify(f.h.state()),result=f.h.scope.rosterAllocationAuditExport_({});assert.equal(result.busy,true);assert.equal(result.pending,1);assert.equal(JSON.stringify(f.h.state()),before);assert.equal(f.transfers.length,0);
});
test('capture lock contention retains all uncaptured facts and retries later',()=>{
 const f=fixture();f.pending([f.h.date]);const before=JSON.stringify(f.h.state());f.h.scope.deployLock_=()=>false;const result=f.h.scope.rosterAllocationAuditExport_({});assert.equal(result.busy,true);assert.equal(result.pending,1);assert.equal(JSON.stringify(f.h.state()),before);assert.equal(f.transfers.length,0);
});
test('watermark lock failure preserves evidence and retry reuses the daily file',()=>{
 const f=fixture();f.pending([f.h.date]);const s=f.h.state();f.h.scope.rosterAllocationAuditCapture_(s);f.h.setState(s);const before=JSON.stringify(f.h.state()),acquire=f.h.scope.deployLock_;f.h.scope.deployLock_=()=>false;
 const failed=f.h.scope.rosterAllocationAuditExport_({});assert.equal(failed.failures.length,1);assert.equal(failed.pending,1);assert.equal(JSON.stringify(f.h.state()),before);assert.equal(f.transfers.filter(row=>row[0]==='text').length,1);
 f.h.scope.deployLock_=acquire;const retry=f.h.scope.rosterAllocationAuditExport_({});assert.equal(retry.exported.length,1);assert.equal(retry.pending,0);const transfers=f.transfers.filter(row=>row[0]==='text');assert.equal(transfers[0][1],transfers[1][1]);assert.equal(f.h.state().revision,0);assert.equal(f.h.state().allocationAuditExports[f.h.date].pendingVersion,1,'retry never adds an audit receipt or intent');
});
test('recovery preserves suppressed logging intervals after verbose is re-enabled',()=>{
 const f=fixture(),s=f.h.state();s.systemConfig.verboseLogging=false;s.audit.push({id:'suppressed',date:f.h.date,operation:'assign',actor:'SUPPRESSED_ACTOR'});f.h.scope.rosterAllocationAuditCapture_(s);s.systemConfig.verboseLogging=true;s.audit.push({id:'retained',date:f.h.date,operation:'assign',actor:'RETAINED_ACTOR'});f.h.setState(s);const result=f.h.scope.rosterAllocationAuditExport_({});assert.equal(result.exported.length,1);const text=f.transfers.find(row=>row[0]==='text')[2];assert.match(text,/RETAINED_ACTOR/);assert.doesNotMatch(text,/SUPPRESSED_ACTOR/);
});
console.log(count+' audit recovery checks passed');
