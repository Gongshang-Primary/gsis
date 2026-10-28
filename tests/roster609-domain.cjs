const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const M=require('../shared/roster');
const clone=x=>JSON.parse(JSON.stringify(x));
function timetable(recesses){
 const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],maxPeriod:16,perDay:17,blocks:[{name:'Alpha',cells:Array.from({length:85},()=>['','','',''])}]};
 return {layoutMode:'single-week',sourceMode:'test',single:week,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},...(recesses===undefined?{}:{recesses})};
}

// New imports define recess explicitly; historical models retain no recess overlay.
const defaults=M.defaultRecesses();
assert.deepEqual(defaults,[1,2,3,4,5,6].map(level=>({level,period:level+2})));
assert.equal(420+defaults[0].period*30,510,'P1 starts at 08:30');
assert.equal(420+defaults[5].period*30,660,'P6 starts at 11:00');
defaults[0].period=10;assert.equal(M.defaultRecesses()[0].period,3);
assert.deepEqual(M.validate(timetable()).recesses,[]);
const explicit=M.validate(timetable([{level:6,period:8},{level:1,period:3}]));
assert.deepEqual(explicit.recesses,[{level:1,period:3},{level:6,period:8}]);
assert.equal(explicit.single.blocks[0].cells[3][0],'','Recess definition must not overwrite source cells');
for(const value of [null,{},[{level:'P1',period:3}],[{level:0,period:3}],[{level:7,period:3}],[{level:1,period:17}],[{level:1,period:-1}],[{level:1,period:3.5}],[{level:1,period:3},{level:1,period:4}]])assert.throws(()=>M.validate(timetable(value)),/recess/);
assert.equal(M.validate(timetable([{level:1,period:3},{level:2,period:3}])).recesses.length,2,'Two levels may share the same recess period');
const oddEven=timetable(M.defaultRecesses());oddEven.layoutMode='odd-even';oddEven.odd=oddEven.single;oddEven.even=clone(oddEven.single);delete oddEven.single;assert.equal(M.validate(oddEven).recesses.length,6);

const entries=[
 {id:'old',name:'Past',from:'2026-09-01',to:'2026-09-30',priority:1,modelFile:'old-file'},
 {id:'current',name:'Current',from:'2026-10-01',to:'2026-10-13',priority:2,modelFile:'current-file'},
 {id:'later',name:'Later',from:'2026-11-01',to:'2026-11-30',priority:3,modelFile:'later-file'},
 {id:'next',name:'Upcoming',from:'2026-10-20',to:'2026-10-31',priority:4,modelFile:'next-file'},
 {id:'pruned',name:'Pruned',from:'2026-10-14',to:'2026-10-19',priority:5,pruned:true,modelFile:'pruned-file'}
];
const before=clone(entries);
assert.equal(M.currentOrNext(entries,'2026-10-13').entry.id,'current');
assert.equal(M.currentOrNext(entries,'2026-10-14').entry.id,'next');
assert.equal(M.currentOrNext(entries,'2026-10-14').selection,'upcoming');
assert.equal(M.currentOrNext(entries,'2026-10-20').selection,'current');
assert.deepEqual(M.currentOrNext(entries,'2026-12-01'),{entry:null,selection:null});
assert.equal(M.currentOrNext([...entries,{...entries[3],id:'next-revised',priority:6}],'2026-10-14').entry.id,'next-revised');
assert.equal(M.currentOrNext([...entries,{...entries[1],id:'new-current',from:'2026-10-12',priority:1}],'2026-10-13').entry.id,'new-current');
assert.deepEqual(entries,before,'Choosing the next timetable cannot mutate the register order');
assert.throws(()=>M.currentOrNext(entries,'2026-02-30'),/valid date/);

// Exercise the real dispatch and validation path. Only Drive I/O and the lock are mocked.
let index={schema:1,revision:5,entries:clone(entries),receipts:[]},reads=[],indexReads=0;
const files=new Map(entries.map(e=>[e.modelFile,JSON.stringify(timetable(e.id==='next'?M.defaultRecesses():undefined))]));
const context=vm.createContext({GSISRoster:M,GSIS_DEPLOY_VERSION:'0.6.09',
 Utilities:{formatDate:()=> '2026-10-14',base64Decode:s=>[...Buffer.from(s,'base64')],newBlob:s=>s,DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()]},
 LockService:{getScriptLock:()=>({})},deployLock_:()=>true,deployUnlock_:()=>{},
 error_:(status,message)=>{throw Object.assign(Error(message),{status});}
});
require('./load-backend-role.cjs')(context,'roster');vm.runInContext(fs.readFileSync('backend/Roster.gs','utf8'),context);
context.rosterIndex_=()=>{indexReads++;return clone(index);};
context.rosterReadFile_=id=>{reads.push(id);return files.get(id);};
context.rosterFile_=(_,name,raw)=>{files.set(name,raw);return name;};
context.rosterCommit_=next=>{index=clone(next);};
const call=(action,input={},smc=false)=>context.rosterDispatch_({action,input,identity:{email:'staff@gsps.edu.sg'}},{user:{rosterSMC:smc,rosterAdmin:smc}});
let profile=call('rosterProfile',{date:'2026-10-14'});
assert.equal(indexReads,1);assert.deepEqual(reads,[]);assert.equal(profile.model,undefined);
assert.equal(profile.active,null);assert.equal(profile.selected.id,'next');assert.equal(profile.upcoming.id,'next');assert.equal(profile.selection,'upcoming');assert.equal(profile.entries,undefined);
assert.equal(profile.selected.modelFile,undefined,'Storage file IDs stay private');
indexReads=0;reads=[];profile=call('rosterProfile',{date:'2026-10-14',preload:true});
assert.equal(indexReads,1,'Preload must not reread the register');assert.deepEqual(reads,['next-file']);assert.equal(profile.model.recesses.length,6);
const current=call('rosterRead',{date:'2026-10-13'});assert.equal(current.active.id,'current');assert.equal(current.selection,'current');assert.equal(current.selected.id,'current');assert.deepEqual(clone(current.model.recesses),[]);
const upcoming=call('rosterRead',{date:'2026-10-14'});assert.equal(upcoming.active,null);assert.equal(upcoming.selection,'upcoming');assert.equal(upcoming.selected.id,'next');assert.equal(upcoming.model.recesses[0].period,3);
for(const id of ['next','old','pruned','unknown'])assert.throws(()=>call('rosterRead',{date:'2026-10-14',id}),e=>e.status===403,'Staff cannot use explicit IDs to browse unpublished saved timetables');
assert.equal(call('rosterRead',{date:'2026-10-13',id:'current'}).selected.id,'current');
const historical=call('rosterRead',{date:'2026-10-14',id:'old'},true);assert.equal(historical.selected.id,'old');assert.equal(historical.active.id,'old','Preserve the explicit SMC download contract');assert.equal(historical.selection,'selected');
reads=[];const none=call('rosterProfile',{date:'2026-12-01',preload:true});assert.equal(none.selected,null);assert.equal(none.model,null);assert.deepEqual(reads,[]);
assert.throws(()=>context.rosterDispatch_({action:'rosterProfile',input:{preload:true},identity:{}},{user:{}}),e=>e.status===503);

// Saving and replay keep the validated definitions in the same immutable model file.
const upload={date:'2026-10-14',requestId:crypto.randomUUID(),revision:5,name:'New baseline',from:'2026-10-15',to:'2026-10-19',model:timetable(M.defaultRecesses()),workbook:Buffer.from([80,75,3,4]).toString('base64')};
const saved=call('rosterUpload',upload,true);assert.equal(saved.revision,6);
const savedEntry=index.entries.find(e=>e.id===saved.savedId),stored=JSON.parse(files.get(savedEntry.modelFile));assert.deepEqual(stored.recesses,M.defaultRecesses());
const count=files.size;assert.equal(call('rosterUpload',upload,true).replayed,true);assert.equal(files.size,count);
const invalid={...upload,requestId:crypto.randomUUID(),revision:6,model:timetable([{level:1,period:99}])};assert.throws(()=>call('rosterUpload',invalid,true),e=>e.status===400);assert.equal(files.size,count,'Invalid recess cannot write partial files');
console.log('Roster 0.6.09 domain: recess validation, current/upcoming selection, preload, permissions and save replay passed.');
