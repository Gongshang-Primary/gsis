'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const fixture=require('./roster701-fixture.cjs'),R=require('../shared/roster.js');
const clone=x=>JSON.parse(JSON.stringify(x));
function harness(){
 const f=fixture(),stats={calculationReads:0,indexReads:0,puts:[]},cache=new Map();let clock=Date.parse('2026-10-14T01:00:00Z'),changeAtRead=0;
 const en={id:'deploy-one',revision:2,commit:'commit-one',store:'published-one'},index={revision:3,versions:[],published:en};
 const source={id:en.id,from:'2026-01-01',to:'2026-12-31',classes:[{ref:'4A',level:4,shortName:'A',venue:'C1-01'}],groups:[{id:'tg-one',name:'CL1',level:4,classRefs:['4A']}],privateTeacherData:'not part of the quota projection'};
 const rows=f.people.map(p=>({id:p.id,quota:4}));rows.push({id:'not-in-timetable',quota:9},{id:'invalid',quota:Infinity});
 const NativeDate=Date,ClockDate=class extends NativeDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
 const scope=vm.createContext({Date:ClockDate,GSISWorkload:require('../shared/workload.js'),GSISTeachingRules:require('../shared/teaching-rules.js'),GSISRelief:{model:'test-model'},book_:()=>({getId:()=> 'school-book'}),index_:()=>{stats.indexReads++;if(stats.indexReads===changeAtRead)index.revision++;return clone(index);},publishedEntry_:idx=>idx.published,
  hash_:value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'),error_:(status,message)=>{throw Object.assign(Error(message),{status});},
  CacheService:{getScriptCache:()=>({get:key=>{const row=cache.get(key);return row&&row.expires>clock?row.text:null;},put:(key,text,ttl)=>{stats.puts.push({key,ttl});cache.set(key,{text,expires:clock+ttl*1000});}})},
  GSISRosterOperations:f.O,GSISRoster:R,GSISRosterAllocation:require('../shared/roster-allocation.js'),props_:()=>({getProperty:()=>null}),Utilities:{getUuid:crypto.randomUUID,formatDate:(now,tz,format)=>{assert.equal(tz,'Asia/Singapore');const iso=new Date(now.getTime()+8*3600000).toISOString();return format==='yyyy-MM-dd'?iso.slice(0,10):format==='HH'?iso.slice(11,13):iso.slice(14,16);}}
 });
 vm.runInContext(fs.readFileSync('backend/Relief.gs','utf8')+'\n'+fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
 scope.reliefConfirmed_=()=>{stats.calculationReads++;return {source:clone(source),result:{rows:rows.map(r=>({...r})),settings:{siuePercent:0},reference:{fullTimeTeacherCount:4}}};};
 const entries=[{id:'baseline',from:'2026-01-01',to:'2026-12-31',priority:1,modelFile:'immutable'}];
 const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:17,maxPeriod:16,blocks:f.teachers.map(t=>({name:t.name,cells:Array.from({length:85},(_,i)=>i>=34&&i<51?t.cells[i-34].slice():['','','',''])}))};
 const model=R.validate({layoutMode:'odd-even',odd:week,even:week,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:12},recesses:[]});
 scope.rosterIndex_=()=>({revision:1,entries:clone(entries)});scope.rosterModel_=()=>clone(model);
 const contacts={user:{rosterSMC:true,rosterAdmin:true,rosterStaffId:'alice'},rosterPeople:clone(f.people)},input={operation:'read',view:'allocation',date:f.date,calendarByDate:{[f.date]:{date:f.date,schoolDay:true,parity:'even'}}};
 return {...f,scope,index,en,source,rows,entries,model,contacts,input,stats,cache,setClock:v=>clock=Date.parse(v),changeAtRead:v=>changeAtRead=v,quota:dates=>clone(scope.rosterOperationsQuota_(dates||[f.date])),context:()=>scope.rosterOperationsContext_({input,identity:{email:'alice@gsps.edu.sg'}},contacts,f.state)};
}

const h=harness(),first=h.quota();
assert.equal(first.rows.find(r=>r.id==='bob').R,4);assert.equal(first.rows.find(r=>r.id==='invalid').R,null);assert.equal(first.source.service,'deploy');assert.equal(first.source.cacheDay,'2026-10-14');assert.equal(first.source.versionId,h.en.id);assert.equal(first.source.revision,h.en.revision);assert.equal(first.formClasses[0].venue,'C1-01');assert.equal(first.teachingGroups[0].name,'CL1');assert.doesNotMatch(JSON.stringify(first),/privateTeacherData/);
assert.deepEqual(h.quota(),first);assert.equal(h.stats.calculationReads,1,'same-day requests share the confirmed Deploy projection');assert.equal(h.stats.puts[0].ttl,21600);assert.equal(h.stats.indexReads,4,'both first and cached reads validate the live source index');
assert.equal(h.quota(['2027-01-01']).rows.length,0);assert.deepEqual(h.quota(),first,'date filtering must not poison the shared daily cache');
h.rows[1].quota=8;h.en.commit='commit-two';h.en.revision++;h.index.revision++;
assert.equal(h.quota().rows.find(r=>r.id==='bob').R,8,'publication revision changes invalidate a same-day cache');assert.equal(h.stats.calculationReads,2);
h.en.store='replacement-store';h.index.revision++;h.quota();assert.equal(h.stats.calculationReads,3,'a different immutable source store cannot reuse prior R');
h.index.pendingFieldCommit={id:'pending'};assert.throws(()=>h.quota(),e=>e.status===503);delete h.index.pendingFieldCommit;
h.changeAtRead(h.stats.indexReads+2);assert.throws(()=>h.quota(),e=>e.status===503,'cache hits refuse a concurrent source index change');

// Expiry uses Singapore midnight, not a rolling 24-hour period. Eviction is safe.
const midnight=harness();midnight.setClock('2026-10-14T15:59:45Z');midnight.quota();assert.equal(midnight.stats.puts[0].ttl,15);midnight.setClock('2026-10-14T16:00:01Z');assert.equal(midnight.quota().source.cacheDay,'2026-10-15');assert.equal(midnight.stats.calculationReads,2);
midnight.cache.clear();midnight.quota();assert.equal(midnight.stats.calculationReads,3,'early eviction reads the source again');
const broken=harness();delete broken.scope.CacheService;broken.quota();broken.quota();assert.equal(broken.stats.calculationReads,2,'cache service absence is only a performance miss');
const corrupt=harness();corrupt.quota();for(const row of corrupt.cache.values())row.text='not JSON';assert.equal(corrupt.quota().rows[0].R,4);assert.equal(corrupt.stats.calculationReads,2);
const mismatched=harness();mismatched.quota();for(const row of mismatched.cache.values()){const item=JSON.parse(row.text);item.value.source.versionId='other-version';item.value.rows[0].R=999;row.text=JSON.stringify(item);}assert.equal(mismatched.quota().rows[0].R,4);assert.equal(mismatched.stats.calculationReads,2,'mismatched cached provenance is a miss');
const legacyCache=harness();legacyCache.rows[0].quota=null;legacyCache.rows[0].reason='Workload data is incomplete.';legacyCache.quota();for(const row of legacyCache.cache.values()){const item=JSON.parse(row.text);item.schema=1;for(const teacher of item.value.rows)delete teacher.capVerificationReason;row.text=JSON.stringify(item);}assert.equal(legacyCache.quota().rows[0].capVerificationReason,'Workload data is incomplete.','old quota projections must refresh the verification reason');assert.equal(legacyCache.stats.calculationReads,2);
const wrongSource=harness();wrongSource.source.id='other-version';assert.throws(()=>wrongSource.quota(),e=>e.status===503);assert.equal(wrongSource.stats.puts.length,0);
const racing=harness();racing.changeAtRead(2);assert.throws(()=>racing.quota(),e=>e.status===503);assert.equal(racing.stats.puts.length,0,'a concurrent change cannot seed the cache');
const huge=harness();huge.source.groups[0].name='例'.repeat(40000);assert.equal(huge.quota().rows[0].R,4);assert.equal(huge.stats.puts.length,0,'oversized UTF-8 data bypasses the cache without breaking the read');
const missing=harness();delete missing.index.published;assert.deepEqual(missing.quota(),{from:'',to:'',rows:[]});assert.equal(missing.stats.calculationReads,0);

// Cached R is joined to the fresh active timetable and stable Contacts staff ID.
const active=harness(),ctx=active.context();assert.equal(ctx.days[active.date].id,'baseline');assert.equal(ctx.days[active.date].teachers.find(t=>t.staffId==='bob').R,4);assert(!ctx.days[active.date].teachers.some(t=>t.staffId==='not-in-timetable'));
active.input.quota={rows:[{id:'bob',R:999}]};active.entries[0].id='replacement-baseline';active.model.even.blocks.find(t=>t.name==='Bob').cells[36]=['EL','4B','C1-02',''];
const changed=active.context();assert.equal(changed.days[active.date].id,'replacement-baseline');assert.equal(changed.days[active.date].teachers.find(t=>t.staffId==='bob').cells[2][0],'EL');assert.equal(changed.days[active.date].teachers.find(t=>t.staffId==='bob').R,4);assert.equal(active.stats.calculationReads,1,'timetable change reuses quota but not availability');
active.contacts.rosterPeople.push({id:'different-bob',name:'Bob',active:true});assert(!active.context().days[active.date].teachers.some(t=>t.staffId==='bob'),'ambiguous timetable identity is never automatically matched');
const reads=active.stats.indexReads;delete active.contacts.user.rosterSMC;assert.throws(()=>active.context(),e=>e.status===503);assert.equal(active.stats.indexReads,reads,'cached quota does not bypass live Roster authority');
const outOfRange=harness();outOfRange.source.to='2026-10-13';assert(outOfRange.context().days[outOfRange.date].teachers.every(t=>t.R===null),'effective dates gate R independently of cached identity');
const noTimetable=harness();noTimetable.entries.length=0;assert.equal(noTimetable.context().days[noTimetable.date].schoolDay,false);
assert.equal(h.scope.rosterOperationsNeedsQuota_({operation:'autoAllocate'}),true);
console.log('PASS v0.7.05 Deploy quota: day/version/source cache, Singapore midnight, six-hour cap, safe misses, fresh index and authority guards, effective dates and current timetable identity/availability.');
