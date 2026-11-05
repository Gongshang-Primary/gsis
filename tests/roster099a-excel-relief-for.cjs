'use strict';
// 0.9.9a: relief cells in Report Absence → Export Excel read "Art (for Nisha)" even when
// the allocation row carries only ids. Combined classes list each absent teacher once.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('roster-update/public/roster-operations-ui.js','utf8');
const start=src.indexOf(' function localExportSnapshot(s){'),end=src.indexOf('\n }\n',start)+3;assert(start>0&&end>start);
const ctx={draftCopy:v=>v===undefined?v:structuredClone(v),draftFor:()=>null,draftWork:()=>false,dateText:d=>d,stamp:v=>v,
 person:(s,id)=>s.data.people.find(p=>p.id===id)||{id,name:id||'Unknown teacher'},GSISRosterOperations:{publicDuty:()=>({assignedBy:'Auto-allocation'})}};
vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
const people=[{id:'nisha',name:'Nisha'},{id:'wl',name:'Wei Ling'},{id:'bob',name:'Bob Tan'}];
const demands=[{id:'d1',staffId:'nisha',name:'Nisha',period:3,className:'4A',subject:'Art'},{id:'d2',staffId:'wl',name:'Wei Ling',period:5,className:'4B',subject:'Art',members:[{id:'d2',staffId:'wl',name:'Wei Ling',period:5,className:'4B',subject:'Art'},{id:'d3',staffId:'nisha',name:'Nisha',period:5,className:'4C',subject:'Art'}]}];
const assignments=[{id:'a1',demandId:'d1',staffId:'bob',period:3,subject:'Art',status:'published'},{id:'a2',demandId:'d2',staffId:'bob',period:5,subject:'Art',status:'published',combination:true,absentIds:['wl','nisha']},{id:'a3',demandId:'d1',staffId:'bob',period:7,subject:'MA',status:'published',absentName:'Given Name'},{id:'a4',demandId:'unknown',staffId:'bob',period:8,subject:'EL',status:'published',absentId:'not-in-people'}];
const s={date:'2026-10-30',ctx:{profile:{user:{email:'smc@test.invalid'}}},data:{revision:9,people,demands,cellProvenance:{},allocationModel:{assignments},
 exportContext:{date:'2026-10-30',revision:9,rows:[],periods:[3,5,7,8].map(period=>({period})),legend:'',teacherSummary:{plan:{teachers:[{staffId:'bob'}]},assignments:[]}}}};
const out=vm.runInContext('localExportSnapshot(__s)',Object.assign(ctx,{__s:s})).teacherSummary.assignments,by=id=>out.find(a=>a.id===id);
assert.equal(by('a1').absentName,'Nisha','name from the demand when the row has no absent fields');
assert.equal(by('a2').absentName,'Wei Ling, Nisha','combined class lists every absent teacher once');
assert.equal(by('a3').absentName,'Given Name','an explicit absentName is kept');
assert.equal(by('a4').absentName,undefined,'an unknown id is never shown as a name');
// The existing workbook label then reads "Art (for Nisha)".
const label=a=>(a.subject||'Relief')+(a.absentName?' (for '+a.absentName+')':'');
assert.equal(label(by('a1')),'Art (for Nisha)');assert.equal(label(by('a2')),'Art (for Wei Ling, Nisha)');
assert.match(fs.readFileSync('roster-update/public/roster-export.js','utf8'),/\(a\.subject\|\|'Relief'\)\+\(absentName\?' \(for '\+absentName\+'\)'/,'workbook label uses absentName');
console.log('PASS Excel relief cells: "Art (for Nisha)" from demand, combined names once, explicit name kept, unknown ids hidden');

assert.match(fs.readFileSync('roster-update/public/roster-stapler-export.js','utf8'),/RosterExport\.applyReliefSummary\(summary/, 'Stapler uses the shared overlay');
