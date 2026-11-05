'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createRequire}=require('node:module');
const file='tests/roster097-batch-client.cjs',source=fs.readFileSync(file,'utf8'),box={require:createRequire(path.resolve(file)),console,Buffer,Blob,DecompressionStream,TextEncoder,TextDecoder,Uint8Array,atob,setTimeout};vm.runInNewContext(source.slice(0,source.indexOf('(async()=>'))+'\nthis.fixture={harness,payload,envelope,from,to};',box);
(async()=>{
 const {harness,payload,from,to}=box.fixture,baseline=payload('baseline'),suspended=payload('suspended'),stored={schema:1,role:false,checkedAt:Date.now(),checkedDay:from,baseline:{payload:baseline},suspended:{payload:suspended}};
 let reads=0,release;const store={getGeneration:async()=>{reads++;return new Promise(r=>release=()=>r(stored));}};
 const h=harness({extra:{window:{RosterBaselineCache:store}}});assert.equal(typeof h.cache.restore,'function','local restore is separate from network preload');
 const first=h.cache.restore(),second=h.cache.restore();while(!release)await new Promise(r=>setTimeout(r,0));release();await Promise.all([first,second]);assert.equal(reads,1,'local restores coalesce');assert.equal(h.calls.length,0,'local-only restore does not initiate or await network');assert(h.cache.getBaseline(to));assert.equal(h.cache.snapshot().phase,'ready');
 await h.cache.start();assert.equal(h.calls.length,0,'next regular preload reuses restored generation');
 const other=harness({extra:{window:{RosterBaselineCache:{getGeneration:async()=>stored}}}});await other.cache.restore();other.setWho('another-account');assert.equal(other.cache.getBaseline(to),null);
 const cancelled=harness({extra:{window:{RosterBaselineCache:{getGeneration:()=>new Promise(r=>release=()=>r(stored))}}}});const pending=cancelled.cache.restore();await Promise.resolve();cancelled.cache.clear();release();await pending.catch(()=>{});assert.equal(cancelled.cache.getBaseline(to),null,'late local restore cannot repopulate a cleared account');
 const S=require('../shared/roster-stapler.js'),f=require('./roster701-fixture.cjs')(),plan=S.create({...f.ctx.days[f.date],id:'base',date:from}),row={date:from,baselineId:'base',revision:3,confirmedRevision:2,viewMode:'draft',plan,confirmedPlan:structuredClone(plan)};
 const current=harness({privileged:true,extra:{GSISRosterStapler:S},reply:p=>box.fixture.envelope(p.stage,{change:value=>p.stage==='suspended'?{...value,plans:[row]}:value})});await current.cache.start();assert.equal(typeof current.cache.getReportDay,'function');const report=current.cache.getReportDay(from);assert.equal(report.staplerRevision,3,'report uses active draft revision, not older confirmed display');assert.equal(report.teachers.length,4);assert(Object.isFrozen(report));assert.equal(current.cache.getReportDay(from),report,'repeat local report does not recalculate full plan');current.cache.invalidate([from]);assert.equal(current.cache.getReportDay(from),null);
 // A retained confirmed plan keeps its lesson content when its original
 // baseline is pruned, with independent persistent identity and cells.
 const secondDate=new Date(Date.parse(from)+16*86400000).toISOString().slice(0,10),boundary=new Date(Date.parse(from)+14*86400000).toISOString().slice(0,10),afterBoundary=new Date(Date.parse(boundary)+86400000).toISOString().slice(0,10);
 const oldPlan=S.create({...f.ctx.days[f.date],id:'pruned',date:from}),laterPlan=S.create({...f.ctx.days[f.date],id:'pruned',date:secondDate});
 const oldRows=[{date:from,baselineId:'pruned',baselineChanged:false,revision:3,confirmedRevision:2,viewMode:'draft',plan:oldPlan,confirmedPlan:structuredClone(oldPlan),timetableDay:{date:from,baselineId:oldPlan.id,source:'confirmed',periods:oldPlan.periods,teachers:[]}},{date:secondDate,baselineId:'pruned',baselineChanged:false,revision:3,confirmedRevision:2,viewMode:'draft',plan:laterPlan,confirmedPlan:structuredClone(laterPlan)}];
 let remapped=false;
 const mapping=harness({privileged:true,extra:{GSISRosterStapler:S},reply:p=>{
  if(p.stage==='suspended'&&remapped)throw Error('Suspended stage temporarily unavailable');
  return box.fixture.envelope(p.stage,{change:value=>{
   if(p.stage==='suspended')return {...value,plans:oldRows};
   if(remapped==='pruned')return {...value,baselineKey:'e'.repeat(64),entries:[],models:[],dates:value.dates.map(r=>({...r,baselineId:null}))};
   const early=remapped?'next':'base',late=remapped?'base':'next';
   return {...value,baselineKey:remapped?'f'.repeat(64):value.baselineKey,registerRevision:remapped?5:4,entries:[{id:early,name:'Early',from,to:boundary,priority:1},{id:late,name:'Late',from:afterBoundary,to,priority:1}],models:[{id:'base',model:value.models[0].model},{id:'next',model:value.models[0].model}],dates:value.dates.map(row=>({...row,baselineId:row.date<=boundary?early:late}))};
  }});
 }});
 assert.equal((await mapping.cache.start()).phase,'ready');
 const effective=mapping.cache.getEffectiveDay(from),reportDay=mapping.cache.getReportDay(from),status=mapping.cache.getTimetableStatus(from);
 assert.equal(effective.id,oldPlan.id);assert.equal(effective.modelId,oldPlan.id);assert.equal(effective.staplerBaselineId,'pruned');
 assert.equal(reportDay.id,oldPlan.id);assert.equal(reportDay.modelId,oldPlan.id);assert.equal(reportDay.staplerBaselineId,'pruned');
 assert.equal(status.baselineId,oldPlan.id);assert.equal(status.baselineChanged,false);assert.equal(status.staplerBaselineId,'pruned');
 assert.equal(mapping.cache.getEffectiveDay(secondDate).id,laterPlan.id,'different dates own different plan identities');
 assert.equal(mapping.cache.getEffectiveDay(from),effective,'unchanged register reuses the immutable day');
 const lessonCells=structuredClone(effective.teachers.map(t=>t.cells));
 remapped=true;assert.equal((await mapping.cache.start({refresh:true})).phase,'failed');
 const remappedDay=mapping.cache.getEffectiveDay(from),remappedReport=mapping.cache.getReportDay(from),remappedStatus=mapping.cache.getTimetableStatus(from);
 assert.equal(remappedDay.id,oldPlan.id);assert.equal(remappedDay.modelId,oldPlan.id);assert.equal(remappedDay,effective,'register remap leaves retained immutable plan day cached');
 assert.equal(remappedReport.id,oldPlan.id);assert.equal(remappedReport,reportDay);
 assert.equal(remappedStatus.baselineId,oldPlan.id);assert.equal(remappedStatus,status);
 assert.equal(mapping.cache.getEffectiveDay(secondDate).id,laterPlan.id,'remapped dates retain their own identity');
 assert.deepEqual(JSON.parse(JSON.stringify(remappedDay.teachers.map(t=>t.cells))),lessonCells,'confirmed lessons stay unchanged');
 assert.equal(mapping.cache.getPlan(from).plan.baselineId,'pruned','original plan provenance stays unchanged');
 remapped='pruned';assert.equal((await mapping.cache.start({refresh:true})).phase,'failed');assert.equal(mapping.cache.getBaseline(from),null);assert.equal(mapping.cache.getEffectiveDay(from),effective);assert.equal(mapping.cache.getReportDay(from),reportDay);assert.equal(mapping.cache.getTimetableStatus(from),status);
 const empty=harness({privileged:true,extra:{GSISRosterStapler:S},reply:p=>box.fixture.envelope(p.stage,{change:value=>p.stage==='baseline'?{...value,entries:[],models:[],dates:value.dates.map(r=>({...r,baselineId:null}))}:{...value,plans:oldRows}})});assert.equal((await empty.cache.start()).phase,'ready');assert.equal(empty.cache.getEffectiveDay(from).id,oldPlan.id);assert.equal(empty.cache.getBaseline(from),null);
 console.log('PASS v0.9.3a preload local restore: no network, shared disk read, reuse, account-race fence and resolved day identities');
})().catch(e=>{console.error(e);process.exitCode=1;});
