'use strict';
// Exercise the real plan package builder while proving absence source stability.
// Prepared cache metadata must not manufacture a timetable edit between reads.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib');
const adapter=require('./roster701-adapter.cjs'),S=require('../shared/roster-stapler.js'),crypto=require('node:crypto');
const blob=value=>({getBytes:()=>[...Buffer.from(value)],getDataAsString:()=>Buffer.from(value).toString('utf8')});
function setup(){
 const h=adapter(),scope=h.scope;
 Object.assign(scope.Utilities,{newBlob:blob,gzip:b=>blob(zlib.gzipSync(Buffer.from(b.getBytes()))),ungzip:b=>blob(zlib.gunzipSync(Buffer.from(b.getBytes()))),base64Encode:v=>Buffer.from(v).toString('base64'),base64Decode:v=>[...Buffer.from(v,'base64')]});
 Object.assign(scope,{GSISRosterStapler:S,rosterToday_:()=>h.date});
 vm.runInContext(fs.readFileSync('backend/RosterTimetableBatch.gs','utf8'),scope);
 const state=h.state(),plan=S.create({...h.ctx.days[h.date],date:h.date},{date:h.date});
 state.staplerPlans.push({id:'plan',date:h.date,baselineId:'baseline',revision:1,draft:plan});
 return {...h,state};
}
let failures=0;
function check(name,fn){try{fn();console.log('PASS '+name);}catch(error){failures++;console.error('FAIL '+name+'\n'+error.stack);}}
for(const representation of ['plain','packed'])check('unchanged '+representation+' plan is stable across package generation times',()=>{
 const h=setup();let state=h.state;
 if(representation==='packed'){
  // A real published-day marker makes the stored acceleration source differ
  // from the old proof builder's partial state, which omitted publications.
  state.dailyPublicationStates[h.date]={revision:1,sourceRevision:0,baselineId:'baseline',staplerRevision:0};
  state=h.scope.rosterOperationsUnpackPlans_(JSON.parse(JSON.stringify(h.scope.rosterOperationsPackPlans_(state))));
  assert(state.staplerPlans[0].timetablePackage,'fixture includes a prepared package');
 }
 const before=JSON.stringify(state),first=h.scope.rosterAbsenceContextKey_(state,h.ctx);h.ctx.now+=1;
 assert.equal(h.scope.rosterAbsenceContextKey_(state,h.ctx),first,'unchanged source must keep one absence proof when the cache builder clock advances');
 assert.equal(JSON.stringify(state),before,'proof construction does not alter source state');
});
check('actual relevant lesson edits still invalidate the absence proof',()=>{
 const h=setup(),first=h.scope.rosterAbsenceContextKey_(h.state,h.ctx);
 h.state.staplerPlans[0].draft.tiles.find(t=>t.subject==='EL').subject='MA';
 assert.notEqual(h.scope.rosterAbsenceContextKey_(h.state,h.ctx),first);
});
check('peer relief batch does not exhaust preparation retries on unchanged sources',()=>{
 const h=setup();h.setState(h.state);
 // Model elapsed work without sleeps. This is the real builder, not a canned
 // package: a clock change alone cannot invalidate authoritative source data.
 const prepare=h.scope.rosterTimetablePreparePlan_;h.scope.rosterTimetablePreparePlan_=(...args)=>{h.ctx.now++;return prepare(...args);};
 const lesson=h.O.previewAbsence(h.ctx,{id:'preview',staffId:'alice',date:h.date,periods:[2],reliefRequired:true})[0];
 const input={operation:'saveAbsence',view:'report',requestId:crypto.randomUUID(),revision:0,staffId:'alice',date:h.date,typeId:'mc',periods:[2],receiptOnly:true,
  ownArrangementsByStaffDate:{alice:{[h.date]:[{period:2,recipientId:'bob',combination:false,lessonKey:lesson.lessonKey,expectedTimetableId:'baseline',expectedParity:'even',expectedStaplerRevision:0}]}}};
 const contacts={rosterPeople:h.people,user:{rosterStaffId:'alice',rosterSMC:true,rosterAdmin:true}};
 const receipt=h.scope.rosterOperationsDispatch_({input,identity:h.ctx.user},contacts);
 assert.equal(receipt.accepted,true);assert.equal(h.calls.writes,1);assert.equal(h.calls.contexts.length,1);
 const durable=JSON.parse(h.scope.rosterReadFile_('ops-file'));assert.equal(durable.absences.length,1);assert.equal(durable.requests.length,1);
});
if(failures)process.exitCode=1;
