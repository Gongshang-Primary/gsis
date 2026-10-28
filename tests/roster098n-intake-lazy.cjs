'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const fixture=require('./roster701-fixture.cjs'),pipeline=require('./roster093b-absence-pipeline.cjs'),S=require('../shared/roster-stapler.js');
const clone=value=>JSON.parse(JSON.stringify(value));
function storage(scope){
 let decodes=0;
 const blob=value=>{const bytes=Buffer.from(value);return {getBytes:()=>[...bytes],getDataAsString:()=>bytes.toString('utf8')};};
 scope.GSISRosterStapler=S;
 Object.assign(scope.Utilities,{newBlob:blob,gzip:value=>blob(zlib.gzipSync(Buffer.from(value.getBytes()))),ungzip:value=>{decodes++;return blob(zlib.gunzipSync(Buffer.from(value.getBytes())));},base64Encode:value=>Buffer.from(value).toString('base64'),base64Decode:value=>[...Buffer.from(value,'base64')]});
 return {decodes:()=>decodes};
}
function setup(){
 const f=fixture();f.ctx.minute=360;f.ctx.now=Date.parse(f.date+'T06:00:00+08:00');f.ctx.iso=new Date(f.ctx.now).toISOString();Object.assign(f.ctx,{resubmission:true,attendanceOnly:true,reportedAt:f.ctx.iso,reportSequence:1});
 const scope=vm.createContext({GSISRosterStapler:S,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(value).digest()]},error_:(status,message)=>{throw Object.assign(Error(message),{status});}});
 vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);const counts=storage(scope);
 const makeRow=(date,archived=false)=>{const plan=S.create({...clone(f.ctx.days[f.date]),date,id:archived?'archive-base':'baseline'});return {date,baselineId:plan.baselineId,revision:1,confirmed:true,confirmedRevision:1,confirmedPlan:plan,draft:plan,...(archived?{id:'retained-old-archive',archivedAt:'2026-08-01T00:00:00Z',archiveReason:'reset'}:{})};};
 const cold=makeRow('2026-08-01',true);f.state.staplerArchives=[cold];const stored=scope.rosterOperationsPackPlans_(f.state);
 // A valid compressed envelope with a mismatching content proof stays lazy
 // until its content is actually requested. Current attendance does not use it.
 stored.staplerArchives[0].draft.validation.digest='0'.repeat(64);const packedArchive=clone(stored.staplerArchives[0]);f.state=scope.rosterOperationsUnpackPlans_(clone(stored));
 const save=(periods,extra={})=>f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods,instructionsNA:true,...extra});
 const advance=()=>{f.ctx.now+=1000;f.ctx.iso=new Date(f.ctx.now).toISOString();f.ctx.reportedAt=f.ctx.iso;f.ctx.reportSequence++;};
 return {...f,scope,counts,save,advance,makeRow,packedArchive};
}
function primaryFacts(state){return clone({...state,staplerPlans:[],staplerArchives:[]});}

test('new captured attendance ignores unrelated compressed archives while retaining their exact stored bytes',()=>{
 const h=setup(),old=h.state.staplerArchives[0].draft;
 const result=h.save([2,3]);assert.equal(h.state.absences.length,1);assert.equal(result.savedIds.length,1);assert.equal(h.counts.decodes(),0);
 assert.equal(h.state.staplerArchives[0].draft,old,'read-only immutable plan identity is retained');
 assert.deepEqual(clone(h.scope.rosterOperationsPackPlans_(h.state).staplerArchives[0]),h.packedArchive);assert.equal(h.counts.decodes(),0);
});
test('same-actor duplicate, later instructions and wider coverage retain one absence without opening archives',()=>{
 const h=setup(),id=h.save([2,3]).savedIds[0],key=h.state.absences[0].lessonSnapshot[0].lessonKey;h.advance();
 assert.deepEqual(h.save([2,3]).savedIds,[id]);h.advance();h.save([2,3],{instructionsNA:false,instructionsByDate:{[h.date]:{[key]:'New worksheet'}}});h.advance();h.save([2,3,4]);
 assert.equal(h.state.absences.length,1);assert.equal(h.state.absences[0].id,id);assert.deepEqual(h.state.absences[0].periods,[2,3,4]);assert.equal(h.state.absences[0].instructions[key],'New worksheet');assert.equal(h.counts.decodes(),0);
});
test('shorter-report rejection leaves primary facts unchanged and still retains cold plan identities',()=>{
 const h=setup();h.save([2,3,4]);h.state.absences[0].updatedBy='bob@gsps.edu.sg';h.advance();const before=primaryFacts(h.state),archive=h.state.staplerArchives[0].draft;
 assert.throws(()=>h.save([2,3]),error=>error.code==='ABSENCE_SHORTER_CONFIRMATION');assert.deepEqual(primaryFacts(h.state),before);assert.equal(h.state.staplerArchives[0].draft,archive);assert.equal(h.counts.decodes(),0);
});
test('a conflicting later date cannot leave an earlier gap applied',()=>{
 const h=setup(),next='2026-10-15';h.ctx.days[next]={...clone(h.ctx.days[h.date]),date:next};h.O.apply(h.state,{...h.ctx,resubmission:false},{operation:'saveAbsence',date:next,staffId:'alice',typeId:'mc',periods:[2,3,4]});h.state.absences[0].updatedBy='bob@gsps.edu.sg';h.advance();
 const before=primaryFacts(h.state),archive=h.state.staplerArchives[0].draft;
 assert.throws(()=>h.O.apply(h.state,h.ctx,{operation:'saveAbsence',dates:[h.date,next],staffId:'alice',typeId:'mc',periods:[2,3]}),error=>error.code==='ABSENCE_SHORTER_CONFIRMATION');assert.deepEqual(primaryFacts(h.state),before);assert.equal(h.state.staplerArchives[0].draft,archive);assert.equal(h.counts.decodes(),0);
});
test('same-day confirmed timetable contents remain validated when attendance context uses them',()=>{
 const h=setup();let state=h.O.initial();state.staplerPlans=[h.makeRow(h.date)];state=h.scope.rosterOperationsPackPlans_(state);state.staplerPlans[0].draft.validation.digest='0'.repeat(64);state=h.scope.rosterOperationsUnpackPlans_(clone(state));
 assert.throws(()=>h.O.composeStaplerContext(state,{...h.ctx,baselineDays:h.ctx.days}),error=>error.status===503&&error.failurePhase==='stapler-proof');assert.equal(state.absences.length,0);assert.equal(h.counts.decodes(),1,'only the requested invalid dated plan is opened');
});
test('real intake attendance commit and exact receipt replay preserve lazy historical plans',()=>{
 const h=pipeline(),counts=storage(h.scope),f=setup();
 h.ctx.minute=360;h.ctx.now=Date.parse(h.date+'T06:00:00+08:00');h.ctx.iso=new Date(h.ctx.now).toISOString();
 const state=h.state();state.staplerArchives=[f.packedArchive];h.setState(state);
 const job=h.make({periods:[2,3]});const first=h.process(job);assert.equal(first.intakeState,'applied');assert.equal(first.absenceApplied,true);assert.equal(h.state().absences.length,1);assert.equal(h.calls.writes,1);assert.equal(counts.decodes(),0);
 job.state='pending';job.absenceApplied=false;job.savedIds=[];const replay=h.process(job);assert.equal(replay.intakeState,'applied');assert.equal(h.state().absences.length,1);assert.equal(h.calls.writes,1);assert.equal(counts.decodes(),0);assert.deepEqual(h.state().staplerArchives[0],f.packedArchive);
});
