'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
const S=require('../shared/roster-stapler.js'),O=require('../shared/roster-operations.js'),A=require('../shared/roster-allocation.js'),{harness}=require('./stapler715-persistence.cjs');
const clone=x=>JSON.parse(JSON.stringify(x)),blank=periods=>periods.map(()=>['','','','']);
function fixture(){
 const periods=Array.from({length:6},(_,period)=>({period,startMinutes:420+period*30,endMinutes:450+period*30}));
 const teachers=['Unknown cap','Exceeded cap'].map((name,i)=>({staffId:'staff-'+i,name,timetableName:name,R:9,originalR:9,periodCap:2,capConfigured:true,capVerified:i===1,capWorkload:i===1?2:null,capHeadroom:i===1?0:null,cells:blank(periods)}));
 teachers[1].cells[1]=['EL','Class B','',''];
 const day={date:'2026-10-21',id:'baseline',parity:'even',verified:true,schoolDay:true,periods,teachers,formClasses:[],recesses:[]},people=teachers.map(t=>({id:t.staffId,name:t.name,active:true}));
 const payload={app:'Stapler',version:'4.3',stateType:'relief',selectedDate:day.date,selectedDay:'Wednesday',selectedSheet:'Even Week',startTime:'07:00',periodMinutes:30,addedTeachers:teachers.map(t=>t.name),reliefAbsences:[],tiles:teachers.flatMap((t,i)=>[1,2].map(p=>({id:i+':'+p,teacher:t.name,assignedPeriod:p,subject:'EL',className:'Exam '+i,venue:'Hall',group:'',sheet:'Even Week',day:'Wednesday',location:'teacher'})))};
 return {day,people,plan:S.importLegacy(S.create(day),payload,{people}),expected:[{staffId:'staff-0',code:'weekly-cap-unverified',weeklyTotal:null},{staffId:'staff-1',code:'weekly-cap-exceeded',weeklyTotal:3}]};
}
function context(day,people){const now=Date.parse(day.date+'T06:00:00+08:00');return {today:day.date,now,iso:new Date(now).toISOString(),minute:360,days:{[day.date]:day},baselineDays:{[day.date]:day},people,user:{email:'admin@gsps.edu.sg',staffId:people[0].id,smc:true,admin:true},uuid:crypto.randomUUID,timetableEntries:[{id:day.id,from:day.date,to:day.date}]};}
function unpack(state){for(const row of state.staplerPlans)for(const field of ['draft','published','confirmedPlan'])if(row[field]?.encoding==='gzip-base64-v1')row[field]=JSON.parse(zlib.gunzipSync(Buffer.from(row[field].data,'base64')).toString('utf8'));for(const row of state.staplerPlans)if(row.confirmedPlan?.encoding==='same-as-draft-v1')row.confirmedPlan=row.draft;return state;}
function warnings(data){assert(Array.isArray(data.workloadWarnings),'workload warnings have an explicit response field');assert.deepEqual(data.workloadWarnings,[],'suspended plans expose no obsolete cap warnings');}
function verify(f,label,{clearWarnings=false}={}){
 const {day,people,expected}=f,h=harness(day,people),leaseSessionId=crypto.randomUUID();let leaseFence=0;
 const call=input=>h.call(input).result,ok=result=>{assert.equal(result.ok,true,result.error);return result.data;};
 const command=(operation,fields={})=>({operation,view:'stapler',date:day.date,leaseSessionId,leaseFence,revision:h.state().revision,staplerRevision:h.state().staplerPlans[0]?.revision||0,requestId:crypto.randomUUID(),...fields});
 const read=()=>ok(call({operation:'stapler',date:day.date,leaseSessionId}));
 const acquire=()=>{leaseFence=read().lock.fence;leaseFence=ok(call(command('acquireStaplerLock'))).lock.fence;};
 const checkStored=()=>{const state=h.state(),row=state.staplerPlans[0];assert.equal(row.draft.encoding,'gzip-base64-v1');warnings(row,expected);const decoded=unpack(state).staplerPlans[0].draft;S.validate(decoded);assert.equal(decoded.workloadWarnings,undefined,'dynamic warnings are stored beside the canonical plan');return decoded;};
 try{
  acquire();const save=command('saveStapler',{plan:f.plan});let data=ok(call(save));warnings(data,expected);assert.equal(data.confirmed,null);checkStored();
  const savedWrites=h.writes();assert.equal(ok(call(save)).replayed,true);assert.equal(h.writes(),savedWrites,'Save receipt replay creates no extra write');
  const receipt=ok(call({operation:'receiptStatus',command:save}));assert.equal(receipt.accepted,true);assert.equal(receipt.confirmation,'accepted');assert.equal(h.writes(),savedWrites);
  data=read();warnings(data,expected);assert.deepEqual(S.effectiveDay(data.plan,day).teachers,S.effectiveDay(f.plan,day).teachers);
  const confirm=command('confirmStapler');data=ok(call(confirm));assert(data.confirmed);warnings(data,expected);checkStored();
  const confirmedWrites=h.writes();assert.equal(ok(call(confirm)).replayed,true);assert.equal(h.writes(),confirmedWrites,'Confirm receipt replay creates no extra write');
  data=read();assert(data.confirmed);warnings(data,expected);
  const effective=O.composeStaplerContext(unpack(h.state()),context(day,people)),teachers=A.teacherContext(unpack(h.state()),effective,day.date);
  for(const item of expected){const teacher=teachers.get(item.staffId),period=day.periods.find(p=>!teacher.base.has(p.period));assert(period,'fixture has a genuinely free period');const eligibility=A.eligibility(teacher,period.period);assert.equal(teacher.workloadIgnored,true);assert.equal(eligibility.capViolation,true);assert.equal(eligibility.available,false);assert.equal(eligibility.autoEligible,false);}
  if(people.length===expected.length){const demand={id:'new-online-relief',date:day.date,period:4,staffId:'absent-teacher',absentIds:['absent-teacher'],subject:'EL',className:'5A',venue:'Room',groupName:'',kind:'lesson'};const allocation=A.optimise(unpack(h.state()),effective,day.date,[demand]);assert.equal(allocation.assignments.length,0,'confirmed suspended dates retain unknown or exceeded employment-cap protection');assert.equal(allocation.uncovered,1);}

  acquire();const imported=data.plan.tiles.find(t=>t.kind==='lesson'&&t.location==='grid'&&t.teacherId===expected[0].staffId&&t.offlineSource&&t.classIds.length);assert(imported);
  let edited=S.apply(data.plan,{type:'edit',tileId:imported.id,patch:{subject:'SCI',venue:'Edited room 中文'}});
  const cls=edited.classes.find(c=>c.id===imported.classIds[0]);if(cls.adhoc)edited=S.apply(edited,{type:'renameClass',classId:cls.id,name:'Edited exam class'});
  const free=day.periods.find(p=>!edited.tiles.some(t=>t.location==='grid'&&t.teacherId===imported.teacherId&&t.period===p.period));assert(free);
  edited=S.apply(edited,{type:'move',tileId:imported.id,period:free.period});
  const saveEdit=command('saveStapler',{plan:edited});data=ok(call(saveEdit));assert.equal(data.confirmed.revision,1,'editing retains the prior confirmation');warnings(data,expected);checkStored();
  const editWrites=h.writes();assert.equal(ok(call(saveEdit)).replayed,true);assert.equal(h.writes(),editWrites);
  data=read();assert(data.confirmed);warnings(data,expected);assert.deepEqual(S.effectiveDay(data.plan,day).teachers,S.effectiveDay(edited,day).teachers);assert.equal(data.plan.tiles.find(t=>t.id===imported.id).venue,'Edited room 中文');
  const invalid=clone(data.plan),ownerCards=invalid.tiles.filter(t=>t.kind==='lesson'&&t.location==='grid'&&t.teacherId===imported.teacherId);assert(ownerCards.length>1);ownerCards[1].period=ownerCards[0].period;
  const beforeInvalid=JSON.stringify(h.state()),rejected=call(command('saveStapler',{plan:invalid}));assert.equal(rejected.ok,false,'workload warning does not bypass structural validation');assert.equal(JSON.stringify(h.state()),beforeInvalid,'invalid edited plan does not alter the saved record');
  if(clearWarnings){for(const t of day.teachers){t.periodCap=20;t.capConfigured=true;t.capWorkload=2;t.capVerified=true;t.capHeadroom=18;}data=ok(call(command('saveStapler',{plan:data.plan})));assert.deepEqual(data.workloadWarnings,[]);assert.deepEqual(h.state().staplerPlans[0].workloadWarnings,[]);assert.deepEqual(read().workloadWarnings,[],'resolved caps clear saved warnings');}
  for(const field of ['absences','assignments','importedRelief','outbox'])assert.equal(h.state()[field].length,0,'import warning lifecycle must not create online '+field);
  console.log('PASS '+label+': suspended edit/confirm lifecycle survives signed Save, receipt replay, Confirm, compressed reload and confirmed class/card edits; allocation caps and structural invalidity remain blocked.');
 }finally{h.close();}
}
async function supplied(file){
 const payload=JSON.parse(fs.readFileSync(file,'utf8')),{JSDOM}=require('jsdom'),JSZip=require('jszip'),window=new JSDOM('').window,scope=vm.createContext({window,DOMParser:window.DOMParser,JSZip,TextEncoder,TextDecoder,Uint8Array});
 try{vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../roster-update/public/converter.js'),'utf8'),scope);const workbook=await window.RosterConverter.parseFile(Buffer.from(payload.workbookBase64,'base64')),week=workbook.single||workbook[payload.selectedSheet.split(' ')[0].toLowerCase()],offset=week.days.indexOf(payload.selectedDay)*week.perDay,start=Number(payload.startTime.slice(0,2))*60+Number(payload.startTime.slice(3)),duration=Number(payload.periodMinutes),periods=Array.from({length:week.perDay},(_,period)=>({period,startMinutes:start+duration*period,endMinutes:start+duration*(period+1)}));
  const teachers=week.blocks.map((b,i)=>({staffId:'staff-'+i,name:b.name,timetableName:b.name,cells:clone(b.cells.slice(offset,offset+week.perDay)),R:9,originalR:9})),people=teachers.map(t=>({id:t.staffId,name:t.name,active:true}));for(const name of payload.addedTeachers||[])if(!people.some(p=>p.name===name))people.push({id:'external-'+people.length,name,active:false});
  const day={date:payload.selectedDate,id:'baseline',parity:payload.selectedSheet.startsWith('Odd')?'odd':'even',verified:true,schoolDay:true,periods,teachers,formClasses:[],recesses:[]},plan=S.importLegacy(S.create(day),payload,{people,workbook}),changed=new Set(S.changes(plan).map(t=>t.staffId));
  const target=teachers.find(t=>changed.has(t.staffId)&&plan.tiles.filter(x=>x.teacherId===t.staffId&&x.location==='grid'&&x.offlineSource&&x.classIds.length).length>1&&periods.some(p=>!plan.tiles.some(x=>x.teacherId===t.staffId&&x.location==='grid'&&x.period===p.period)));assert(target);Object.assign(target,{periodCap:30,capConfigured:true,capVerified:false,capWorkload:null,capHeadroom:null});
  verify({day,people,plan,expected:[{staffId:target.staffId,code:'weekly-cap-unverified',weeklyTotal:null}]},'supplied Offline JSON');
 }finally{window.close();}
}
verify(fixture(),'unknown and exceeded weekly caps',{clearWarnings:true});
if(process.argv[2])supplied(path.resolve(process.argv[2])).catch(error=>{console.error(error);process.exitCode=1;});
