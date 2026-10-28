'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),adapter=require('./roster701-adapter.cjs');
function setup(){
 const h=adapter();vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),h.scope);
 h.scope.Utilities.formatDate=(date,zone,format)=>{assert.equal(zone,'Asia/Singapore');const value=new Date(date.getTime()+8*3600000).toISOString();return format==='yyyy-MM-dd'?value.slice(0,10):format==='HH'?value.slice(11,13):value.slice(14,16);};
 for(const name of ['rosterIndex_','rosterModel_','rosterOperationsQuota_','rosterOperationsReconcile_','rosterOperationsReadReconcile_','rosterOperationsPlanningAttach_','rosterOperationsAttachDayToken_'])h.scope[name]=()=>assert.fail('Current duty read used '+name);
 const people=[{id:'teacher',name:'Normal Teacher',active:true,role:'Teacher',groups:[]},{id:'duty',name:'Duty Leader',active:true,role:'HOD',groups:['SMC'],mobile:'PRIVATE_PHONE',email:'PRIVATE_EMAIL'},{id:'inactive',name:'Inactive',active:false,role:'HOD',groups:['SMC']},{id:'not-smc',name:'Former SMC',active:true,role:'HOD',groups:[]},{id:'support',name:'Support',active:true,role:'OM',groups:['SMC','Support']}];
 const c={user:{rosterStaffId:'teacher',rosterSMC:false,rosterAdmin:false},rosterPeople:people,rosterSMCIds:['duty','inactive','support']};
 const s=h.state();s.smcDutyRoster=[{date:h.date,staffIds:['duty','inactive','not-smc','support','duty']},{date:'2026-11-01',staffIds:['not-smc']}];h.setState(s);
 h.call=input=>h.scope.rosterOperationsDispatch_({identity:{email:'teacher@example.edu'},input},c);return {...h,c};
}
{
 const h=setup(),before=h.state(),result=h.call({operation:'currentDuty',date:'2026-11-01',today:'2026-11-01',view:'allocation',staffId:'not-smc',trustedNow:0});
 assert.deepEqual(JSON.parse(JSON.stringify(result)),{date:h.date,checkedAt:new Date(h.ctx.now).toISOString(),available:true,people:[{name:'Duty Leader'}]},'current Singapore day and current active verified names only');
 assert.equal(h.calls.writes,0);assert.deepEqual(h.state(),before);assert(h.O.READS.includes('currentDuty'));assert.equal(h.scope.rosterOperationsRecordOnly_({operation:'currentDuty'}),true);assert.equal(h.scope.rosterOperationsNeedsQuota_({operation:'currentDuty',view:'allocation'}),false);
 const alias=h.call({operation:'read',view:'currentDuty',date:'not-a-date'});assert.deepEqual(JSON.parse(JSON.stringify(alias)),JSON.parse(JSON.stringify(result)));
 assert.throws(()=>h.call({operation:'dutyRoster'}),e=>e.status===403,'the full duty roster remains SMC/Admin only');
}
{
 const h=setup(),s=h.state();s.smcDutyRoster=[];h.setState(s);assert.deepEqual(JSON.parse(JSON.stringify(h.call({operation:'currentDuty'}))).people,[],'verified empty duty is a valid empty result');
 delete h.c.rosterSMCIds;assert.throws(()=>h.call({operation:'currentDuty'}),e=>e.status===503,'missing current SMC authority cannot masquerade as no duty');
}
{
 const h=setup();h.ctx.now=Date.parse('2026-10-21T16:30:00Z');const s=h.state();s.smcDutyRoster.push({date:'2026-10-22',staffIds:['duty']});h.setState(s);
 assert.equal(h.call({operation:'currentDuty',date:'2026-10-21'}).date,'2026-10-22','Singapore midnight, not browser or UTC date, selects the duty');
}
{
 for(const profile of [{role:'Teacher',mk:'MK',groups:['MK']},{role:'Principal',mk:'',groups:['SL']}]){
  const h=setup();Object.assign(h.c.rosterPeople[0],profile);assert.deepEqual(JSON.parse(JSON.stringify(h.call({operation:'currentDuty'}))).people,[{name:'Duty Leader'}],'an active authorised viewer need not be eligible to report absence or perform relief');
 }
}
{
 const h=setup();h.c.user.rosterStaffId='unknown';assert.throws(()=>h.call({operation:'currentDuty'}),e=>e.status===403);h.c.user.rosterStaffId='teacher';h.c.rosterPeople[0].active=false;assert.throws(()=>h.call({operation:'currentDuty'}),e=>e.status===403);assert.equal(h.calls.writes,0);
}
console.log('PASS current duty is a minimal teacher-safe Singapore-today projection with no timetable, quota, reconciliation or writes');
