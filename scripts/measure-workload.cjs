// Local CPU measurement and full output parity. No network or staff data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),Module=require('node:module'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const W=require('../shared/workload'),R=require('../shared/relief'),Rules=require('../shared/teaching-rules');
function fixture(assignmentCount){
 const subjects=['EL','PHE','Art','Music','TL','HTL','CCE TL','Sci'],levels=['1','2','3','4','5','6'];
 const teachers=Array.from({length:159},(_,i)=>({id:'t'+i,name:'Synthetic '+i,active:i%29!==0,profile:{Role:'Teacher','Employment Modifier':i%11===0?'FAJT':i%7===0?'4/5':'','Subject Modifier':i%4===0?'Art':i%4===1?'Music':i%4===2?'PE':''}}));
 const classes=levels.flatMap(l=>Array.from({length:7},(_,i)=>({ref:'c'+l+'-'+i,level:l,shortName:String.fromCharCode(65+i)})));
 const groups=Array.from({length:90},(_,i)=>({id:'g'+i,name:i%9===0?'CCE TL':'Group '+i,subject:subjects[i%subjects.length],level:levels[i%6],...(i%5===0?{levels:['1','2'],weeklyPeriods:i%6+.5}:{} )}));
 const assignments=Array.from({length:assignmentCount},(_,i)=>{const teacher='t'+((i*13)%159);if(i%3){const c=classes[(i*11)%classes.length];return {id:'a'+i,teacher,target:c.level+c.shortName,...(i%2?{targetRef:c.ref}:{}),subject:i%17===0?'FT':subjects[Math.floor(i/3)%subjects.length],level:c.level};}const g=groups[Math.floor(i/3)%groups.length];return {id:'a'+i,teacher,target:g.id,subject:g.subject,level:g.level};});
 return {id:'fixture',name:'2026 CPU fixture',teachers,classes,groups,assignments,loads:Object.fromEntries(levels.map((l,i)=>[l,{Assembly:1,FTGP:2,FTT:2,TTT:2,...Object.fromEntries(subjects.map((s,j)=>[s,s==='EL'?15:2+(i+j)%5]))}])),organisations:{plt:Array.from({length:18},(_,i)=>({id:'p'+i,name:'PLT '+i,slots:Array.from({length:12},(_,j)=>'t'+((i+j*7)%159))}))},duties:Array.from({length:12},(_,i)=>({id:'d'+i,days:['Mon','Tue','Wed','Wed'],teachers:{Mon:'t'+i,Tue:'t'+(i+1),Wed:'t'+(i+2)}})),offload:Rules.migrate(null),relief:R.defaults()};
}
function loadBaseline(file){const m=new Module(path.resolve('shared/workload.js'),module);m.filename=path.resolve('shared/workload.js');m.paths=module.paths;m._compile(fs.readFileSync(file,'utf8'),m.filename);return m.exports;}
const baseline=process.env.GSIS_WORKLOAD_BASELINE?loadBaseline(process.env.GSIS_WORKLOAD_BASELINE):null;
const calc=(engine,d)=>engine.analyse(d,t=>Rules.calculate(t,d.offload));
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
const cases=[fixture(0),fixture(1500)];
const edge=fixture(120);edge.groups.push({...edge.groups[0],weeklyPeriods:7.5});edge.classes.push({...edge.classes[0],level:'2'});edge.assignments.push({...edge.assignments[0]}, {teacher:'missing',target:'absent',subject:'EL',level:'1'},{teacher:'t1',target:'p0',subject:'PD'},{teacher:'t2',target:'p1',subject:'TTT'});edge.loads['1'].Art=null;edge.workload={categories:{Sci:'Unclassified'},noFTT:['t1','t3']};cases.push(edge);
for(const d of cases){const before=JSON.stringify(d);if(baseline){const old=calc(baseline,d),next=calc(W,d);assert.deepEqual(next,old);assert.deepEqual(R.analyse(d,next),R.analyse(d,old));}assert.equal(JSON.stringify(d),before);}
// Same object edited between runs: indexes must never outlive one calculation.
const edited=cases[1],beforePeriods=calc(W,edited).totals.Teaching;edited.groups[0].weeklyPeriods=10;edited.teachers[1].active=false;edited.assignments.push({teacher:'t1',target:'g0',subject:edited.groups[0].subject});if(baseline)assert.deepEqual(calc(W,edited),calc(baseline,edited));assert.notEqual(calc(W,edited).totals.Teaching,beforePeriods);
const measurements=[];for(const count of [150,1500]){
 const d=fixture(count);for(let i=0;i<8;i++){if(baseline)calc(baseline,d);calc(W,d);}
 const times={before:[],after:[]};for(let i=0;i<25;i++){for(const label of i%2?['after','before']:['before','after']){const engine=label==='before'?baseline:W;if(!engine)continue;const start=performance.now();calc(engine,d);times[label].push(performance.now()-start);}}
 measurements.push({teachers:d.teachers.length,classes:d.classes.length,groups:d.groups.length,assignments:count,...(baseline?{beforeMedianMs:+median(times.before).toFixed(3)}:{}),afterMedianMs:+median(times.after).toFixed(3)});
}
const report={kind:'Local Node CPU only, not browser rendering, network or Apps Script latency',baselineSHA256:process.env.GSIS_WORKLOAD_BASELINE?crypto.createHash('sha256').update(fs.readFileSync(process.env.GSIS_WORKLOAD_BASELINE)).digest('hex'):null,parity:baseline?'Exact workload and relief output equality; sparse, 1500 assignments, duplicates, orphan records, missing loads, PD aliases and edits on same object':'Not requested',measurements};
if(process.env.GSIS_MEASURE_OUTPUT)fs.writeFileSync(process.env.GSIS_MEASURE_OUTPUT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
