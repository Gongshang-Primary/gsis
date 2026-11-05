'use strict';
const assert=require('node:assert/strict'),A=require('../shared/roster-allocation'),O=require('../shared/roster-operations'),S=require('../shared/roster-statistics'),fixture=require('./roster701-fixture.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
const test=(name,run)=>{run();console.log('PASS '+name);};
function fresh(){const f=fixture();f.state.freshStart={effectiveDate:'2026-10-12',fairnessMode:'opening-balances'};A.initialiseFreshStartAccounting(f.state,f.ctx,{effectiveDate:'2026-10-12'});return f;}
function rows(f,patch={}){return f.people.map(person=>({staffId:person.id,cumulativeQuota:20,cumulativeDone:4,asOfDate:'2026-10-12',version:0,...patch}));}
function confirm(f,patch={}){return O.apply(f.state,f.ctx,{operation:'saveOpeningBalances',rows:rows(f),confirmInitial:true,reason:'Verified opening totals',...patch});}
test('fresh accounting pauses empty history until Admin confirms all active Contacts rows',()=>{
 const f=fresh();assert.equal(f.state.accountingYears['2026'].verified,false);assert.equal(A.initialiseHistory(f.state,f.ctx,f.date),false);
 f.O.apply(f.state,f.ctx,{operation:'saveAbsence',date:f.date,staffId:'alice',typeId:'mc',periods:[2]});
 const paused=f.O.apply(f.state,f.ctx,{operation:'autoAllocate',date:f.date});assert.equal(paused.paused,true);assert.match(paused.reason,/Admin must confirm Opening balances/);
 const before=JSON.stringify(f.state.openingBalances);assert.throws(()=>confirm(f,{confirmInitial:false}),e=>e.status===400);assert.equal(JSON.stringify(f.state.openingBalances),before);
 assert.throws(()=>confirm(f,{rows:rows(f).slice(1)}),e=>e.status===400);
 const result=confirm(f,{rows:rows(f,{cumulativeQuota:0,cumulativeDone:0})});assert.equal(result.confirmed,true);assert.equal(f.state.accountingYears['2026'].verified,true);assert.equal(f.state.openingBalances.length,4);
 assert.equal(A.initialiseHistory(f.state,f.ctx,f.date),false);
});
test('opening grid is fresh-only, Admin editable, SMC viewable and hidden from teachers',()=>{
 const f=fresh();let view=O.read(f.state,f.ctx,{operation:'openingBalances'});assert.equal(view.canEdit,true);assert.equal(view.rows.length,4);assert.equal(view.rows[0].cumulativeQuota,null);assert.deepEqual(view.historyCoverage,{since:'2026-10-12',archiveUrl:'/archive.html'});
 const smc={...f.ctx,user:{...f.ctx.user,admin:false}};assert.equal(O.read(f.state,smc,{operation:'openingBalances'}).canEdit,false);assert.throws(()=>O.apply(f.state,smc,{operation:'saveOpeningBalances',rows:rows(f),reason:'No',confirmInitial:true}),e=>e.status===403);
 const teacher={...smc,user:{...smc.user,smc:false}};assert.throws(()=>O.read(f.state,teacher,{operation:'openingBalances'}),e=>e.status===403);
 const old=fixture();assert.throws(()=>O.read(old.state,old.ctx,{operation:'openingBalances'}),e=>e.status===409);assert.throws(()=>confirm(old),e=>e.status===409);
});
test('manual opening defaults retain first-day duties and the previous-day cutoff at year rollover',()=>{
 const f=fresh(),start=f.state.freshStart.effectiveDate;f.ctx.today=start;
 const view=O.read(f.state,f.ctx,{operation:'openingBalances'});
 assert(view.rows.every(row=>row.asOfDate===A.addDays(start,-1)),'an untouched date must leave the first D1 day open for accounting');
 confirm(f,{rows:view.rows.map(row=>({staffId:row.staffId,version:row.version,asOfDate:row.asOfDate,cumulativeQuota:10,cumulativeDone:0}))});
 f.state.assignments.push({id:'first-day-duty',staffId:'bob',date:start,period:2,status:'completed',rCost:1});
 assert.equal(A.annual(f.state,f.ctx,'bob').completed,1);assert.equal(A.annual(f.state,f.ctx,'bob').spent,1);
 assert.equal(O.read(f.state,f.ctx,{operation:'openingBalances'}).rows.find(row=>row.staffId==='bob').asOfDate,A.addDays(start,-1),'saved dates remain unchanged');
 f.ctx.today='2027-01-01';assert(O.read(f.state,f.ctx,{operation:'openingBalances'}).rows.every(row=>row.asOfDate==='2026-12-31'));
});
test('opening save validates complete identity and integer ranges without partial mutation',()=>{
 for(const change of [r=>r.push(clone(r[0])),r=>r[0].staffId='unknown',r=>r[0].cumulativeQuota=-1,r=>r[0].cumulativeDone=10000,r=>r[0].cumulativeDone=1.5,r=>r[0].asOfDate='2027-01-01',r=>r[0].asOfDate='2026-02-31',r=>r[0].version=1]){
  const f=fresh(),input=rows(f);change(input);const before=JSON.stringify(f.state);assert.throws(()=>confirm(f,{rows:input}),e=>[400,409].includes(e.status));assert.equal(JSON.stringify(f.state),before);
 }
 const f=fresh();f.ctx.people.push({...f.people[0]});assert.throws(()=>confirm(f),e=>e.status===503);
});
test('corrections require row version and audit reason, retain before/after, and warn above quota',()=>{
 const f=fresh();confirm(f);const row=clone(f.state.openingBalances.find(x=>x.staffId==='bob')),input={staffId:'bob',cumulativeQuota:2,cumulativeDone:5,asOfDate:'2026-10-13',version:row.version};
 assert.throws(()=>O.apply(f.state,f.ctx,{operation:'saveOpeningBalances',rows:[input],reason:''}),e=>e.status===400);
 const result=O.apply(f.state,f.ctx,{operation:'saveOpeningBalances',rows:[input],reason:'Correct signed source'});assert.equal(result.warnings.length,1);assert.equal(f.state.openingBalances.length,4);
 const event=f.state.audit.filter(x=>x.operation==='openingBalance').at(-1);assert.deepEqual(event.before,row);assert.equal(event.after.cumulativeDone,5);assert.equal(event.reason,'Correct signed source');assert.equal(event.after.version,2);
 assert.throws(()=>O.apply(f.state,f.ctx,{operation:'saveOpeningBalances',rows:[input],reason:'Stale edit'}),e=>e.status===409);
});
test('annual cutoffs exclude overlapping duties and quotas while weekly capacity counts all D1 work',()=>{
 const f=fresh();confirm(f);f.state.entitlements=[{staffId:'bob',week:'2026-10-05',year:'2026',quota:4},{staffId:'bob',week:'2026-10-12',year:'2026',quota:4},{staffId:'bob',week:'2026-10-19',year:'2026',quota:4}];
 f.state.assignments=[{id:'before',staffId:'bob',date:'2026-10-11',period:1,status:'completed',rCost:3},{id:'on',staffId:'bob',date:'2026-10-12',period:1,status:'completed',rCost:2},{id:'after',staffId:'bob',date:'2026-10-13',period:1,status:'completed',rCost:1},{id:'draft',staffId:'bob',date:f.date,period:2,status:'draft',rCost:1}];
 let b=A.balances(f.state,f.ctx,f.date).get('bob');assert.equal(b.completed,5);assert.equal(b.committed,1);assert.equal(b.entitlement,20);assert.equal(b.weeklyUsed,4);assert.equal(b.remaining,0);assert.equal(b.utilisation,30);
 assert.equal(A.annual(f.state,f.ctx,'bob').spent,6);
 O.apply(f.state,f.ctx,{operation:'saveOpeningBalances',rows:[{staffId:'bob',cumulativeQuota:30,cumulativeDone:8,asOfDate:'2026-10-13',version:1}],reason:'Later cutoff'});
 b=A.balances(f.state,f.ctx,f.date).get('bob');assert.equal(b.completed,8);assert.equal(b.committed,1);assert.equal(b.weeklyUsed,4);assert.equal(b.remaining,0);
 const next={...f.ctx,today:'2027-01-04',days:{}};assert.equal(A.annual(f.state,next,'bob','2027').spent,0);assert.equal(A.annual(f.state,next,'bob','2027').entitlement,0);
});
test('fairness order and source prefill use recorded values at the exact cutoff',()=>{
 const f=fresh();confirm(f,{rows:rows(f).map(r=>({...r,cumulativeDone:r.staffId==='bob'?18:1}))});
 const ranked=A.ranked(f.state,f.ctx,f.date,6).filter(x=>['bob','charlie'].includes(x.staffId));assert.equal(ranked[0].staffId,'charlie');
 const source=fixture();source.state.entitlements=[{staffId:'bob',year:'2026',week:'2026-10-05',quota:4},{staffId:'bob',year:'2026',week:'2026-10-12',quota:5},{staffId:'bob',year:'2026',week:'2026-10-19',quota:99}];source.state.assignments=[{id:'on',staffId:'bob',date:'2026-10-12',period:1,status:'completed',rCost:2},{id:'after',staffId:'bob',date:'2026-10-13',period:1,status:'completed',rCost:99},{id:'draft',staffId:'bob',date:'2026-10-12',period:2,status:'draft',rCost:99}];
 const before=JSON.stringify(source.state),proposal=A.freshStartOpeningBalances(source.state,source.ctx,'2026-10-12');assert.equal(proposal.find(r=>r.staffId==='bob').cumulativeQuota,9);assert.equal(proposal.find(r=>r.staffId==='bob').cumulativeDone,2);assert.equal(JSON.stringify(source.state),before);
});
test('coverage metadata explains fresh history without manufacturing Statistics activity',()=>{
 const f=fresh();confirm(f);const coverage={since:'2026-10-12',archiveUrl:'/archive.html'};
 assert.deepEqual(O.read(f.state,f.ctx,{operation:'accounting'}).historyCoverage,coverage);assert.deepEqual(O.notificationHistory(f.state,f.ctx,{}).historyCoverage,coverage);assert.deepEqual(O.read(f.state,f.ctx,{operation:'allocation',date:f.date}).historyCoverage,coverage);
 const p=S.project(f.state,f.ctx,{from:'2026-10-01',to:f.date});assert.deepEqual(p.historyCoverage,coverage);assert.equal(p.activityRows.length,0);assert.equal(p.importedWeekly.length,0);assert.equal(p.trackingFrom,'2026-10-12');assert.equal(p.coverage.find(row=>row.date==='2026-10-12').status,'tracked');
 const {harness}=require('./roster716-calculations.cjs'),h=harness();Object.assign(h.state,clone(f.state));h.contacts.user.rosterStaffId='plain';h.state.openingBalances=[{staffId:'plain',year:'2026',cumulativeQuota:20,cumulativeDone:4,asOfDate:'2026-10-12',updatedBy:'admin',updatedAt:f.ctx.iso,version:1}];h.state.entitlements=[{staffId:'plain',year:'2026',week:'2026-10-12',quota:999},{staffId:'plain',year:'2026',week:'2026-10-19',quota:4}];
 const x=h.read();assert.deepEqual(x.historyCoverage,coverage);assert.equal(x.completion.completed,4);assert.equal(x.completion.entitlement,24);assert.equal(x.completion.from,'2026-10-12');assert.equal(x.completion.openingBalance.cumulativeQuota,20);
});
test('January cutoff is independent of accounting year and an unconfirmed prior year cannot block rollover',()=>{
 const f=fresh();f.ctx.today='2027-01-01';f.ctx.iso='2027-01-01T00:00:00Z';f.state.freshStart.effectiveDate='2027-01-01';A.initialiseFreshStartAccounting(f.state,f.ctx,{effectiveDate:'2027-01-01'});
 confirm(f,{rows:rows(f,{cumulativeQuota:0,cumulativeDone:0,asOfDate:'2026-12-31'})});assert.equal(f.state.openingBalances[0].year,'2027');assert.equal(A.annual(f.state,f.ctx,'bob').spent,0);
 f.state.entitlements.push({staffId:'bob',year:'2026',week:'2026-12-28',quota:99});f.state.assignments.push({id:'old-year',staffId:'bob',date:'2026-12-31',status:'completed',rCost:99});assert.equal(A.annual(f.state,f.ctx,'bob').spent,0);assert.equal(A.annual(f.state,f.ctx,'bob').entitlement,0);
 const proposal=A.freshStartOpeningBalances(f.state,f.ctx,'2026-12-31');assert.equal(proposal.find(r=>r.staffId==='bob').cumulativeDone,0);
 const pending=fresh();pending.ctx.today='2027-01-04';assert.equal(A.initialiseHistory(pending.state,pending.ctx,'2027-01-04'),true);assert.equal(pending.state.accountingYears['2027'].mode,'zero-start');
});
test('Google opening command replays a lost response once and enforces current authority',()=>{
 const h=require('./roster701-adapter.cjs')(),f=fresh();h.setState(f.state);h.scope.rosterOperationsAuthority_=(_c,user)=>({...f.ctx.user,...user});h.scope.rosterOperationsPeople_=()=>f.people;
 const command={operation:'saveOpeningBalances',rows:rows(f),reason:'Reviewed source',confirmInitial:true,revision:0,requestId:require('node:crypto').randomUUID()};
 h.loseNextResponse();assert.throws(()=>h.call(command),/Uncertain response/);assert.equal(h.calls.writes,1);
 const replay=h.call(command);assert.equal(replay.replayed,true);assert.equal(replay.confirmed,true);assert.equal(replay.requestId,command.requestId);assert.equal(replay.revision,1);assert.equal(h.calls.writes,1);assert.equal(h.state().audit.filter(e=>e.operation==='openingBalance').length,4);
 assert.throws(()=>h.call({...command,reason:'Changed'}),e=>e.status===409);assert.throws(()=>h.call(command,{admin:false}),e=>e.status===403);assert.throws(()=>h.call({operation:'openingBalances'},{admin:false,smc:false}),e=>e.status===403);
 const view=h.call({operation:'openingBalances'},{admin:false,smc:true});assert.equal(view.canEdit,false);assert.equal(view.rows.length,4);
});
test('prefill refuses corrupt recorded quota rather than proposing an invented total',()=>{
 const f=fixture();f.state.entitlements=[{staffId:'bob',year:'2026',week:'2026-10-12',quota:4},{staffId:'bob',year:'2026',week:'2026-10-12',quota:4}];assert.throws(()=>A.freshStartOpeningBalances(f.state,f.ctx,'2026-10-12'),e=>e.status===503);
 f.state.entitlements=[{staffId:'bob',year:'2026',week:'2026-10-12',quota:null}];assert.throws(()=>A.freshStartOpeningBalances(f.state,f.ctx,'2026-10-12'),e=>e.status===503);
});
test('archive proposal separates the frozen cutoff from its trusted target accounting year',()=>{
 const f=fixture();f.ctx.today='2026-12-31';f.ctx.accountingYear='2027';f.state.entitlements=[{staffId:'bob',year:'2026',week:'2026-12-28',quota:40}];f.state.assignments=[{id:'prior-year',staffId:'bob',date:'2026-12-30',status:'completed',rCost:30}];
 const row=A.freshStartOpeningBalances(f.state,f.ctx,'2026-12-31').find(r=>r.staffId==='bob');assert.equal(row.cumulativeQuota,0);assert.equal(row.cumulativeDone,0);assert.equal(row.year,'2027');
 f.ctx.accountingYear='invalid';assert.throws(()=>A.freshStartOpeningBalances(f.state,f.ctx,'2026-12-31'),e=>e.status===400);
});
test('Google proposals retain distinct staff identities with the same display name',()=>{
 const f=fresh();f.people[0].name='Same Name';f.people[1].name='Same Name';
 const before=JSON.stringify(f.state),proposal=A.freshStartOpeningBalances(f.state,f.ctx,'2026-10-12');
 assert.equal(proposal.filter(row=>row.name==='Same Name').length,2);assert.equal(new Set(proposal.map(row=>row.staffId)).size,f.people.length);assert.equal(JSON.stringify(f.state),before);
 assert.equal(O.read(f.state,f.ctx,{operation:'openingBalances'}).rows.length,f.people.length);
 f.ctx.people.push({...f.people[0]});assert.throws(()=>A.freshStartOpeningBalances(f.state,f.ctx,'2026-10-12'),e=>e.status===503);
});
