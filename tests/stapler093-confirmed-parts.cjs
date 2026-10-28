'use strict';
const assert=require('node:assert/strict'),zlib=require('node:zlib'),{harness}=require('./roster097-batch-backend.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const h=harness();h.scope.rosterOperationsPhase_=(_,fn)=>fn();h.scope.Utilities.base64Decode=x=>[...Buffer.from(x,'base64')];h.scope.Utilities.ungzip=b=>h.scope.Utilities.newBlob(zlib.gunzipSync(Buffer.from(b.getBytes())));
 const row=h.record(h.today,{confirmed:true}),save=()=>{const packed=h.scope.rosterOperationsPackPlans_(h.state);Object.assign(h.state,h.scope.rosterOperationsUnpackPlans_(copy(packed)));return packed.staplerPlans[0];};
 return {...h,row,save};
}
for(const [label,change] of [
 ['confirmed revision',row=>row.confirmedRevision++],
 ['confirmed content',(row,h)=>{row.confirmedPlan=h.plan(row.date,row.baselineId,'New confirmed subject');row.confirmedRevision++;}],
 ['date name',row=>{row.name='New date name';row.revision++;}],
 ['published timetable',(row,h)=>{row.published=h.plan(row.date,row.baselineId,'New published subject');row.publishedRevision=3;}],
 ['daily publication',(row,h)=>{h.state.dailyPublicationStates[row.date]={date:row.date,baselineId:row.baselineId,revision:1,sourceRevision:h.state.revision,staplerRevision:0,periods:h.scope.rosterTimetableBatchPeriods_(h.model),teachers:[]};}]
]){
 const h=fixture(),old=h.save().timetablePackage;change(h.state.staplerPlans[0],h);const fresh=h.save().timetablePackage;
 assert.notEqual(fresh.confirmedSourceKey,old.confirmedSourceKey,label+' invalidates reuse');
 // A daily snapshot is currently irrelevant to a newer confirmed timetable,
 // but binding it conservatively prevents reuse if publication later wins.
 if(label!=='daily publication')assert.notEqual(fresh.confirmed.key,old.confirmed.key,label+' rebuilds the confirmed bytes');
}
{
 const h=fixture();h.save();const row=h.state.staplerPlans[0],old=copy(row.timetablePackage.confirmed);row.timetablePackage.confirmed.data='broken';row.revision++;const fresh=h.save();assert.notEqual(fresh.timetablePackage.confirmed.data,'broken');assert.equal(fresh.timetablePackage.confirmed.key,old.key,'damage is rebuilt even when the confirmed source is unchanged');
}
{
 const h=fixture();h.save();const row=h.state.staplerPlans[0];delete row.timetablePackage.confirmedSourceKey;row.revision++;const fresh=h.save();assert.match(fresh.timetablePackage.confirmedSourceKey,/^[a-f0-9]{64}$/,'legacy packages rebuild their missing source proof');
}
console.log('PASS confirmed prepared-part reuse observes confirmation, publication and metadata changes, and regenerates missing or damaged proof.');
