const assert=require('node:assert/strict'),G=require('../shared/venue-groups'),W=require('../shared/workload'),Rules=require('../shared/teaching-rules'),L=require('../shared/layout-data'),T=require('../shared/tg-scope');
const d={id:'v',name:'2026 Test',classes:[{ref:'a',level:'1',shortName:'A'},{ref:'b',level:'2',shortName:'B'}],venues:[{id:'A1-01',form:'1A',name:'Room'}],loads:Object.fromEntries(['1','2','3','4','5','6'].map(l=>[l,{Assembly:1,FTGP:2,FTT:2,EL:l==='1'?15:12,TL:l==='1'?10:8,'CCE EL':1}])),groups:[],teachers:[{id:'t',name:'Teacher',active:true}],assignments:[],organisations:{},duties:[],offload:Rules.migrate(null)};
const x={name:'Mixed TL',subject:'TL',level:'1',levels:['2','1'],weeklyPeriods:6.5,levelWide:false,classRefs:['a','b'],venue:'A1-01'};
const g={id:'tg',name:x.name,subject:x.subject,...G.workloadFields(d,x),...G.scopeFields(d,x)};d.groups.push(g);d.assignments.push({id:'a1',teacher:'t',target:g.id,subject:g.subject,level:'1'});
const analyse=()=>W.analyse(d,t=>Rules.calculate(t,d.offload));
assert.deepEqual(g.levels,['1','2']);assert.deepEqual(G.scope(d,g).classRefs,['a','b']);assert.equal(G.periods(d,g),6.5);
let w=analyse();assert.equal(w.totals.Teaching,6.5);assert.equal(w.ledger.length,1);assert.equal(w.byLevel.multi.Teaching,6.5);assert.equal(w.byLevel['1'].Teaching+w.byLevel['2'].Teaching,0);assert.deepEqual(w.ledger[0].levels,['1','2']);assert.equal(w.special.TL.demand,6.5);assert.equal(w.special.TL.indicator.average,6.5);assert.equal(w.special.TL.detail.flatMap(x=>x.items).length,1);
// Changing either Subject Load cannot change an entered TG commitment.
d.loads['1'].TL=99;d.loads['2'].TL=3;assert.equal(analyse().totals.Teaching,6.5);
d.assignments.push({...d.assignments[0],id:'duplicate'});assert.equal(analyse().totals.Teaching,6.5);d.assignments.pop();
d.teachers.push({id:'t2',name:'Second',active:true});d.assignments.push({...d.assignments[0],id:'a2',teacher:'t2'});w=analyse();assert.equal(w.totals.Teaching,13);assert.equal(w.special.TL.demand,13);assert.equal(w.special.TL.indicator.average,6.5);d.assignments.pop();
const unchanged=structuredClone(d);
for(const weeklyPeriods of [null,-1,Infinity,NaN,101,2.25,'6',false])assert.throws(()=>G.update(d,{...x,groupId:g.id,weeklyPeriods}),/weekly periods/);
for(const levels of [[],['1','1'],['1','99'],[1,'2'],null])assert.throws(()=>G.update(d,{...x,groupId:g.id,levels}),/primary levels/);
for(const classRefs of [[],['a'],['missing'],['a','a']])assert.throws(()=>G.update(d,{...x,groupId:g.id,classRefs}));
assert.deepEqual(d,unchanged,'Invalid edits have no partial effects');
G.update(d,{...x,groupId:g.id,weeklyPeriods:0});assert.equal(analyse().totals.Teaching,0);assert.equal(analyse().special.TL.demand,0);
G.update(d,{...x,groupId:g.id});assert.equal(d.assignments[0].id,'a1');assert.equal(d.groups.length,1);
// Older frontend payloads preserve fields they do not know.
G.update(d,{name:g.name,subject:g.subject,groupId:g.id,levelWide:true,classRefs:[],venue:g.venue});assert.deepEqual(g.levels,['1','2']);assert.equal(g.weeklyPeriods,6.5);
const missing={...g};delete missing.weeklyPeriods;assert.equal(G.periods(d,missing),null,'No arbitrary level fallback for multi-level TGs');
G.update(d,{...x,groupId:g.id,levels:['2'],classRefs:['b'],weeklyPeriods:null});assert.equal(G.periods(d,g),3);assert.equal(g.level,'2');assert.equal(d.assignments[0].level,'2');assert.equal(analyse().byLevel.multi,undefined);
// Publication preserves the same Layout TG identity through scope edits.
const publish=(old,commit)=>L.publication(old,d,{id:d.id,revision:1,commit},(type,key)=>type+':'+key);
let published=publish(L.empty(2026),'one'),layoutId=published.groups[0].id;
G.update(d,{...x,groupId:g.id});published=publish(published,'two');const view=L.publicView(published);assert.equal(view.groups.length,1);assert.equal(view.groups[0].id,layoutId);assert.deepEqual(view.groups[0].levels,['1','2']);assert.equal(view.groups[0].weeklyPeriods,6.5);assert.deepEqual(view.groups[0].units,['A1-01']);assert.equal(published.groups[0].teacherLabels,'Teacher');
// A source-owned MTL group's evidence survives expansion across levels.
const mtl=structuredClone(published);Object.assign(mtl.groups[0],{sourceId:'mtl_allocation_2026',teacherLabels:'Source teacher',pupilCount:24});G.update(d,{...x,groupId:g.id,levels:['1','2','3'],classRefs:[],levelWide:true});published=publish(mtl,'three');assert.equal(published.groups.length,1);assert.equal(published.groups[0].teacherLabels,'Source teacher');assert.equal(published.groups[0].pupilCount,24);assert.equal(published.groups[0].id,layoutId);
// CCE consolidation cannot absorb a deliberate cross-level TG or its assignments.
G.update(d,{...x,groupId:g.id,subject:'CCE EL',assignments:'retain',classRefs:[],levelWide:true});T.consolidate(d);assert.equal(d.groups.find(r=>r.id==='tg').weeklyPeriods,6.5);assert.equal(d.assignments[0].target,'tg');assert.equal(d.assignments.length,1);T.consolidate(d);assert.equal(d.assignments.length,1);
console.log('PASS multi-level TG model: entered periods, no level-rate fallback, zero/half periods, validation atomicity, old payloads, one assignment per teacher, specialist demand/indicator, CCE preservation and stable Layout identity/source evidence');
