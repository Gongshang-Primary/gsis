'use strict';
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks'),{harness,fixture,supplied}=require('./stapler715-persistence.cjs'),S=require('../shared/roster-stapler.js'),crypto=require('node:crypto');
const rows=[],round=x=>Math.round(x*10)/10,measure=fn=>{const start=performance.now(),value=fn();return {ms:round(performance.now()-start),value};};
function check(f,label){
 const {day,people,plan}=f,h=harness(day,people),leaseSessionId=crypto.randomUUID(),req=(operation,extra={})=>({operation,view:'stapler',date:day.date,leaseSessionId,leaseFence:1,revision:0,staplerRevision:0,requestId:crypto.randomUUID(),...extra});
 try{
  h.call(req('acquireStaplerLock',{leaseFence:0}));
  const accept=measure(()=>h.call(req('saveStapler',{plan})));if(!accept.value.result.ok)throw Error(JSON.stringify(accept.value.result));
  const reopen=measure(()=>h.call({operation:'stapler',date:day.date,leaseSessionId}));if(!reopen.value.result.ok)throw Error(JSON.stringify(reopen.value.result));
  const accepted=reopen.value.result.data.plan;if(S.acceptStored&&reopen.value.result.data.structuralValidation)S.acceptStored(accepted);if(S.canonical)S.canonical(accepted);
  const first=accepted.tiles.find(t=>t.kind==='lesson'&&t.location==='grid'),edit=measure(()=>S.apply(accepted,{type:'edit',tileId:first.id,patch:{venue:'Test room'}}));
  const projections=measure(()=>{for(let i=0;i<5;i++){S.effectiveDay(accepted,day);S.accounting(accepted);S.changes(accepted);}});
  const save=measure(()=>h.call(req('saveStapler',{plan:edit.value,revision:1,staplerRevision:1})));if(!save.value.result.ok)throw Error(JSON.stringify(save.value.result));
  const confirm=measure(()=>h.call(req('confirmStapler',{revision:2,staplerRevision:2})));if(!confirm.value.result.ok)throw Error(JSON.stringify(confirm.value.result));
  rows.push({label,teachers:plan.teachers.length,tiles:plan.tiles.length,planBytes:Buffer.byteLength(JSON.stringify(plan)),acceptMs:accept.ms,reopenMs:reopen.ms,editMs:edit.ms,projections15Ms:projections.ms,saveEditMs:save.ms,confirmMs:confirm.ms});
 }finally{h.close();}
}
(async()=>{if(process.argv[2])await supplied(path.resolve(process.argv[2]),check);else check(fixture(),'synthetic 104 teachers');const report={scope:'Local Node, fresh Apps Script VM and disk-backed Drive adapter per API request; no production network or Google/Cloudflare latency. Projections = five effective-day/accounting/changes passes.',rows};if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));})().catch(e=>{console.error(e);process.exitCode=1;});
