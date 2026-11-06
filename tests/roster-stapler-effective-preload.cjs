'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{harness,decode}=require('./roster097-batch-backend.cjs');
(async()=>{
 for(const privileged of [true,false]){
  const h=harness(),row=h.record(h.today,{confirmed:true});row.draft=h.plan(h.today,'replacement-origin','PRIVATE DRAFT');row.draft.id='replacement-draft';row.baselineId='replacement-origin';row.confirmed=false;h.contacts.user.rosterSMC=privileged;
  const sandbox={window:{},GSISRoster:require('../shared/roster.js'),GSISRosterStapler:require('../shared/roster-stapler.js'),TextEncoder,TextDecoder,setTimeout,Date,console};vm.createContext(sandbox);vm.runInContext(fs.readFileSync('roster-update/public/roster-timetable-preload.js','utf8'),sandbox);
  const client=sandbox.window.RosterTimetablePreload.create({api:async(_,p)=>h.call({...p,encoding:'json-v1'}),scope:'alice',today:h.today,canReadDrafts:privileged});
  const started=await client.start();assert.equal(started.phase,'ready',started.error?.message);assert.equal(client.getTimetableStatus(h.today).allocationRevision,1);assert.equal(client.getTimetableStatus(h.today).baselineId,'stapler:'+h.today);assert.equal(client.getReportDay(h.today).teachers[0].cells[2][0],'Confirmed lesson');assert.equal(client.getEffectiveDay(h.today).staplerRevision,1);assert.equal(client.getReportDay(h.today).staplerBaselineId,'base');
  const batch=decode(h.call({stage:'suspended',baselineKey:h.call({stage:'baseline'}).baselineKey,encoding:'json-v1'}));assert.equal(batch.plans[0].baselineId,privileged?'replacement-origin':'base');assert.equal(batch.plans[0].confirmedPlan.baselineId,'base');
 }
 console.log('PASS real Google batch through browser preload: replacement draft origin cannot hide or replace retained confirmation for Admin or teacher');
})().catch(e=>{console.error(e);process.exitCode=1;});
