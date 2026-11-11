const S=require('../../shared/roster-stapler.js');
module.exports=()=>{
 const day={date:'2026-11-11',id:'synthetic-period-plan',verified:true,schoolDay:true,periods:[1,2,3].map((period,i)=>({period,startMinutes:450+i*30,endMinutes:480+i*30})),recesses:[{level:1,startMinutes:480,endMinutes:510}],formClasses:[{id:'a',name:'Workshop A',traditional:false},{id:'b',name:'Workshop B',traditional:false},{id:'c',name:'1C',level:1}],teachers:[{staffId:'teacher-a',name:'Synthetic A',cells:[[],['EL','Workshop A','Room A','Group A'],['MA','Workshop A','Room A','Group A'],['SC','Workshop A','Room A','Group A']]},{staffId:'teacher-b',name:'Synthetic B',cells:[[],[],['EL','Workshop B','Room B','Group B'],[]]},{staffId:'teacher-empty',name:'Synthetic Empty',cells:[]}]};
 return {day,plan:S.create(day),people:day.teachers};
};
