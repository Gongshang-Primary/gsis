const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),fixture=require('./roster701-fixture.cjs');
const {O,state,ctx,date,blank}=fixture();
for(let n=0;n<150;n++){ctx.people.push({id:'extra'+n,name:'Staff '+n,active:true,mobile:'99999999'});ctx.days[date].teachers.push({staffId:'extra'+n,name:'Staff '+n,cells:blank(),R:4});}
for(let n=0;n<1500;n++)state.assignments.push({id:'a'+n,date,staffId:n===0?'alice':'extra'+n%150,absentId:'bob',status:n%2?'draft':'published',publishedAt:ctx.iso,period:n%17,subject:'EL'});
const full=JSON.stringify(O.view(state,ctx,{date})),start=performance.now(),own=O.view(state,ctx,{date,view:'duties'}),ms=performance.now()-start;
assert.equal(own.myDuties.length,1);assert.equal(own.assignments.length,1);assert(own.people.length<5);assert.equal(own.timetable,null);assert(!JSON.stringify(own).includes('extra'));
assert(JSON.stringify(own).length<full.length/20);
const scope=vm.createContext({GSISRosterOperations:O,GSISRoster:require('../shared/roster.js'),Utilities:{formatDate:(_,tz,fmt)=>fmt==='yyyy-MM-dd'?date:fmt==='HH'?'08':'00',getUuid:()=> 'uuid'},rosterIndex_:()=>({entries:[]}),rosterModel_:()=>{throw Error('Should not load timetable');},book_:()=>{throw Error('Should not load Deploy');}});
vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);
const context=scope.rosterOperationsContext_({identity:{email:'alice@gsps.edu.sg'},input:{operation:'read',view:'duties',date}},{user:{rosterSMC:true,rosterAdmin:true,rosterStaffId:'alice'},rosterPeople:ctx.people},state);
assert.equal(Object.keys(context.days).length,0);
console.log(JSON.stringify({check:'PASS R11',fullProjectionBytes:full.length,personalProjectionBytes:JSON.stringify(own).length,personalProjectionMs:ms,fixtureAssignments:1500,timetableReads:0,quotaReads:0}));
