'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const fixture=require('./roster701-fixture.cjs'),R=require('../shared/roster.js'),A=require('../shared/roster-allocation.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function harness(){
 const f=fixture(),counts={state:0,register:0,model:0,quota:0,writes:0},events=[];let stored=clone(f.state),locked=false,quotaError=false,seq=0;
 const entry={id:'baseline',modelFile:'immutable',from:'2026-01-01',to:'2026-12-31',priority:1};
 const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:f.teachers.map(t=>({name:t.name,cells:Array.from({length:85},(_,i)=>i>=34&&i<51?t.cells[i-34].slice():['','','',''])}))};
 const model=R.validate({layoutMode:'odd-even',odd:week,even:week,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]});
 const user={rosterSMC:false,rosterAdmin:false,rosterStaffId:'alice'},c={user,rosterPeople:f.people.map(p=>({...p,adhocEligible:true})),rosterSMCIds:[],rosterAdminIds:[]};
 const quota={from:entry.from,to:entry.to,rows:f.people.map(p=>({id:p.id,R:4})),source:{versionId:'deploy',commit:'current'},formClasses:[],teachingGroups:[]};
 class Clock extends Date{constructor(...v){super(...(v.length?v:[f.ctx.now]));}static now(){return f.ctx.now;}}
 const properties=new Map([['ROSTER_OPERATIONS_FILE','ops']]),props_=()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,value),deleteProperty:key=>properties.delete(key)});
 const scope=vm.createContext({Date:Clock,GSISRosterOperations:f.O,GSISRosterAllocation:A,GSISRoster:R,ROSTER_DATA:'folder',props_,
  rosterReadFile_:()=>{counts.state++;events.push('state');return JSON.stringify(stored);},rosterIndex_:()=>{counts.register++;events.push('register');return {revision:1,entries:[entry]};},rosterModel_:()=>{counts.model++;events.push('model');return clone(model);},
  error_:(status,message)=>{throw Object.assign(Error(message),{status});},LockService:{getScriptLock:()=>({})},deployLock_:()=>{assert(!locked);locked=true;events.push('lock');return true;},deployUnlock_:()=>{assert(locked);locked=false;events.push('unlock');},
  deployPhase_:(_,fn)=>fn(),Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],getUuid:()=> 'fixture-'+(++seq),formatDate:(_,tz,format)=>format==='yyyy-MM-dd'?f.date:format==='HH'?'06':'00'},
  rosterDriveRequest_:(_,options)=>{assert(locked,'all durable writes retain the script lock');events.push('commit');counts.writes++;stored=JSON.parse(options.payload);return {};}});
 require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 require('./load-stapler-leases.cjs')(scope);
 scope.rosterOperationsQuota_=()=>{assert(!locked,'optional candidates cannot lengthen the save lock');assert(counts.writes>0,'optional candidates cannot block an uncommitted save');events.push('quota');counts.quota++;if(quotaError)throw Error('Deploy quota unavailable');return clone(quota);};
 const call=(input,identity={email:'alice@gsps.edu.sg'})=>scope.rosterOperationsDispatch_({identity,input},c);
 const payload={operation:'saveAbsence',view:'report',date:f.date,staffId:'alice',typeId:'mc',periods:[2,3],revision:0,requestId:crypto.randomUUID(),calendarByDate:{[f.date]:{date:f.date,schoolDay:true,parity:'even'}}};
 return {...f,scope,c,call,payload,counts,events,quota,stored:()=>clone(stored),setStored:s=>stored=clone(s),setQuotaError:()=>quotaError=true,locked:()=>locked};
}

// Preparing the next screen adds only the quota read, never a second authority,
// calendar, operations, register or model request; the durable save is unchanged.
const ordinary=harness(),plain=ordinary.call(ordinary.payload);
assert.deepEqual(ordinary.counts,{state:2,register:2,model:1,quota:0,writes:1});assert(!Object.hasOwn(plain,'mutualCandidates'));
const instructions=ordinary.call({...ordinary.payload,operation:'saveInstructions',absenceId:plain.savedId,instructions:{[plain.demands[0].lessonKey]:'Continue the worksheet.'},revision:1,requestId:crypto.randomUUID()});
assert.equal(instructions.revision,2);assert.equal(ordinary.counts.quota,0,'instruction saves keep their lightweight context');assert.equal(ordinary.counts.writes,2);
const h=harness(),input={...h.payload,includeMutualCandidates:true},saved=h.call(input),batch=saved.mutualCandidates;
assert.deepEqual(h.counts,{state:2,register:2,model:1,quota:1,writes:1});
assert.equal(saved.revision,1);assert.equal(batch.revision,1);assert.equal(batch.date,h.date);assert.equal(batch.absenceId,saved.savedId);assert.equal(batch.timetableId,'baseline');
assert.deepEqual(Object.keys(batch.candidatesByPeriod),['2','3']);assert.equal(batch.candidatesByPeriod[2].find(x=>x.staffId==='bob').available,true);
assert(batch.candidatesByPeriod[2].every(x=>Object.keys(x).sort().join(',')==='available,combineAllowed,external,name,reasons,staffId'),'the prepared screen does not expose quotas or contacts');
assert(h.events.indexOf('commit')<h.events.indexOf('unlock')&&h.events.indexOf('unlock')<h.events.indexOf('quota'));
const durable=h.stored();assert.equal(durable.receipts.length,1);assert.equal(durable.audit.filter(a=>a.operation==='saveAbsence').length,1);assert.equal(durable.absences.length,1);
assert(!JSON.stringify(durable.receipts).includes('candidatesByPeriod'),'screen projections are not persisted in receipts');
const same=h.O.read(durable,{...h.ctx,user:{...h.ctx.user,smc:false,admin:false}},{operation:'candidates',purpose:'mutual',byPeriod:true,date:h.date,demandIds:saved.demands.map(d=>d.id)});
assert.deepEqual(clone({...batch,absenceId:undefined}),clone(same),'combined projection matches the existing candidate contract');

// Replay uses the receipt once but computes current quota again, not stored green cells.
h.quota.rows.find(x=>x.id==='bob').R=0;
const replay=h.call(input);assert.equal(replay.replayed,true);assert.equal(h.counts.writes,1);assert.equal(h.counts.quota,2);
assert.equal(replay.mutualCandidates.candidatesByPeriod[2].find(x=>x.staffId==='bob').available,false);
assert.throws(()=>h.call({...input,includeMutualCandidates:false}),e=>e.status===409);assert.equal(h.counts.writes,1);assert.equal(h.locked(),false);
assert.throws(()=>h.call(input,{email:'bob@gsps.edu.sg'}),e=>e.status===409);assert.equal(h.counts.quota,2);

// An optional lookup failure must never turn a confirmed absence into a failed save.
const unavailable=harness();unavailable.setQuotaError();const accepted=unavailable.call({...unavailable.payload,includeMutualCandidates:true});
assert.equal(accepted.revision,1);assert.equal(accepted.savedIds.length,1);assert.equal(accepted.mutualCandidates,null);assert.equal(accepted.mutualCandidatesUnavailable,true);
assert.equal(unavailable.stored().receipts.length,1);assert.equal(unavailable.counts.writes,1);assert.equal(unavailable.locked(),false);

const uncertain=harness(),write=uncertain.scope.rosterDriveRequest_,uncertainInput={...uncertain.payload,includeMutualCandidates:true};
uncertain.scope.rosterDriveRequest_=(...args)=>{write(...args);throw Error('Lost commit acknowledgement');};
assert.throws(()=>uncertain.call(uncertainInput),/Lost commit acknowledgement/);assert.equal(uncertain.counts.quota,0);assert.equal(uncertain.counts.writes,1);assert.equal(uncertain.locked(),false);
uncertain.scope.rosterDriveRequest_=write;
const confirmed=uncertain.call(uncertainInput);assert.equal(confirmed.replayed,true);assert.equal(uncertain.counts.writes,1);assert(confirmed.mutualCandidates);assert.equal(uncertain.stored().absences.length,1);

// Candidate preparation cannot grant ownership or select another saved date.
const denied=harness();denied.c.user.rosterStaffId='bob';assert.throws(()=>denied.call({...denied.payload,includeMutualCandidates:true},{email:'bob@gsps.edu.sg'}),e=>e.status===403);assert.equal(denied.counts.writes,0);assert.equal(denied.counts.quota,0);
const wrongDate=harness();assert.throws(()=>wrongDate.call({...wrongDate.payload,from:'2026-10-15',to:'2026-10-15',includeMutualCandidates:true}),e=>e.status===400);assert.equal(wrongDate.counts.writes,0);
const deleted=h.stored();deleted.absences[0].deletedAt='2026-10-14T01:00:00Z';deleted.revision++;h.setStored(deleted);
const afterDelete=h.call(input);assert.equal(afterDelete.replayed,true);assert.equal(afterDelete.mutualCandidatesUnavailable,true);assert.equal(h.counts.quota,2,'deleted absence replay cannot prepare actionable candidates');
console.log('PASS combined absence save: one state/register/model read and commit; optional quota after unlock; exact candidate contract; fresh replay; optional failure confirms save; authority and date checks retained.');
