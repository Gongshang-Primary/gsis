'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {harness}=require('./roster-draft-cell-save-speed.cjs'),S=require('../shared/roster-stapler.js'),O=require('../shared/roster-operations.js');
function suspended(h){
 const day={...h.ctx.days[h.date],date:h.date,periods:h.ctx.days[h.date].periods.map(({period,start,end,startMinutes,endMinutes})=>({period,start,end,startMinutes,endMinutes})),teachers:h.ctx.days[h.date].teachers.map((t,i)=>({...t,cells:t.cells.map(c=>c.some(Boolean)?[c[0],'Workshop '+i,c[2],c[3]]:c)})),formClasses:[],recesses:[]};
 const plan=S.create(day);plan.tiles.find(t=>t.teacherId==='teacher0'&&t.period===2).subject='SCI';plan.revision=3;
 const state=h.state();state.staplerPlans=[{date:h.date,baselineId:'baseline',revision:3,confirmed:true,draft:plan}];h.setState(state);return {plan,day,state};
}
{
 const h=harness(),{plan,day,state}=suspended(h),data=h.call({operation:'read',view:'report',compact:true});
 assert.equal(data.timetable.teachers.length,1,'selected-day report must not construct all suspended teacher rows');
 assert.equal(data.timetable.teachers[0].staffId,'teacher0');assert.equal(data.timetable.teachers[0].cells[2][0],'SCI');assert.equal(data.timetable.staplerRevision,3);
 assert.equal(h.stats.teachingProfile,0);assert.equal(h.stats.quota,0);assert.equal(h.stats.reconcile,0);assert.equal(h.stats.writes,0);
 console.log('MEASURED suspended report',JSON.stringify({teachers:150,teacherRows:data.timetable.teachers.length,stats:h.stats}));
 const selected=h.call({operation:'read',view:'report',compact:true,staffId:'teacher1'});assert.equal(selected.timetable.teachers[0].staffId,'teacher1');assert.equal(selected.timetable.teachers[0].cells[2][0],'EL');
 // A different saved date must stay unopened if this projection has no capped teachers.
 const other={date:'2026-10-15',baselineId:'baseline',revision:1,confirmed:true};Object.defineProperty(other,'draft',{get(){throw Error('unrelated plan loaded');}});state.staplerPlans.push(other);
 const composed=O.composeStaplerContext(state,{...h.ctx,quotaRequested:false,days:{[h.date]:day}});assert.equal(composed.days[h.date].teachers.length,150);
 console.log('PASS selected suspended day retains canonical lessons and revision without unrelated plans or quotas');
}
for(const operation of ['unassign','setNoRelief']){
 const h=harness(),s=h.state(),p=h.command();h.O.apply(s,h.ctx,{operation:'assign',date:h.date,demandIds:p.demandIds,staffId:'teacher20'});h.setState(s);for(const key in h.stats)h.stats[key]=0;
 const command={...p,operation,confirm:true},result=h.call(command);assert.equal(result.allocationPatch,true);assert.equal(result.refreshRequired,true,'real cover requires authoritative candidate budget refresh');assert.equal(result.assignments[0].status,'cancelled');
 for(const key of ['quota','reconcile','initialiseHistory','captureWeek','health','manualModel'])assert.equal(h.stats[key],0,key+' omitted from durable write');assert.equal(h.stats.writes,1);assert.equal(h.state().outbox.length,0);
 console.log('MEASURED draft write '+operation,JSON.stringify(h.stats));
 const again=h.call(command);assert.equal(again.replayed,true);assert.equal(again.refreshRequired,true);assert.equal(h.stats.writes,1);
 const fresh=h.call({operation:'read',view:'allocation',compact:true}),teacher=fresh.allocationModel.teachers.find(t=>t.id==='teacher20');assert.equal(teacher.balance.weeklyUsed,0);assert.equal(teacher.balance.remaining,4);assert.equal(h.stats.quota,1);
 console.log('MEASURED draft '+operation,JSON.stringify(h.stats));
}
{
 const h=harness(),s=h.state(),p=h.command();h.O.apply(s,h.ctx,{operation:'assign',date:h.date,demandIds:p.demandIds,staffId:'teacher20'});s.healthWarningState[h.date+':2']={seen:[2],episode:1,last:2};h.setState(s);const result=h.call({...p,confirm:true});assert.equal(result.allocationPatch,undefined,'active low-capacity episodes retain full warning recovery');const warning=h.state().healthWarningState[h.date+':2'];assert.deepEqual(warning.seen,[]);assert.equal(warning.episode,2);assert.equal(h.stats.quota,1);
 console.log('PASS cover removal preserves recovery of active capacity-warning episodes');
}
{
 const source=fs.readFileSync(require.resolve('../backend/Roster.gs'),'utf8');
 function load(settings={}){let calls=0,reads=0;const context=vm.createContext({PropertiesService:{getScriptProperties(){calls++;return {getProperty(k){reads++;return settings[k]||null;}};}}});require('./load-backend-role.cjs')(context,'roster');vm.runInContext(source,context);return {calls,reads,folders:vm.runInContext('[ROSTER_ROOT,ROSTER_ARCHIVE,ROSTER_DATA]',context)};}
 assert.equal(load().reads,4);assert.equal(load().calls,1);
 const settings={ROSTER_ROOT_FOLDER_ID:'root-id',ROSTER_ARCHIVE_FOLDER_ID:'archive-id',ROSTER_DATA_FOLDER_ID:'data-id',DEPLOY_SHEET_ID:'custom'};assert.deepEqual([...load(settings).folders],['root-id','archive-id','data-id']);settings.ROSTER_DATA_FOLDER_ID='new-data';assert.equal(load(settings).folders[2],'new-data');
 assert.throws(()=>load({DEPLOY_SHEET_ID:'custom'}),/all three/);assert.throws(()=>load({...settings,ROSTER_DATA_FOLDER_ID:'https://bad'}),/folder ID/);
 console.log('PASS fresh folder configuration uses 4 keyed reads and preserves custom-installation validation');
}
