const assert=require('node:assert/strict'),make=require('./dom-helper.cjs');
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));
function fixture(){const app=make();app.run(`tab='IP Deploy';level='';v().classes[0].ref='class-a';v().loads['1'].HCL=6;render=()=>{};`);return app;}
function stageDuplicate(run){run(`draftBase=clone(v());cellQueue=[{operation:'addTG',localId:'pending-first',name:'3HCL1',subject:'HCL',level:'1',classRefs:[],levelWide:true,venue:'',expected:null},{operation:'addTG',localId:'pending-second',name:'3hcl1',subject:'HCL',level:'1',classRefs:[],levelWide:true,venue:'',expected:null},{operation:'addTeacher',localId:'pending-teacher',target:'pending-second',subject:'HCL',teacher:'t',expected:false},{operation:'setLoad',level:'1',subject:'EL',expected:15,value:14}];applyPendingProjection();queueError='Check TG name, subject and level. Draft retained.';`);}
(async()=>{
 {const {w,run}=fixture();try{
  run(`stageChange('addTG',{name:'3HCL1',subject:'HCL',level:'1',classRefs:[],levelWide:true,venue:''})`);
  assert.throws(()=>run(`stageChange('addTG',{name:' 3hcl1 ',subject:'HCL',level:'1',classRefs:[],levelWide:true,venue:''})`),/already exists/i,'A second draft creation must fail before entering the save queue');
  assert.equal(run('cellQueue.length'),1);assert.throws(()=>run(`stageChange('addTG',{name:' ',subject:'HCL',level:'1',classRefs:[],levelWide:true,venue:''})`),/name/i);assert.equal(run('cellQueue.length'),1);
 }finally{w.close();}}
 {const {w,run}=fixture();try{
  run(`v().groups=[{id:'deleted-online',name:'Deleted TG',subject:'HCL',level:'1',levelWide:true,classRefs:[],venue:''}];draftBase=clone(v());cellQueue=[{operation:'updateTG',groupId:'deleted-online',name:'Retained local name',subject:'HCL',levelWide:true,classRefs:[],venue:'',expected:GSISVenueGroups.state(v(),{operation:'updateTG',groupId:'deleted-online'})}];applyPendingProjection();queueError='Teaching group changed';`);
  w.saved=JSON.parse(run('JSON.stringify({current:{...draftBase,groups:[]}})'));run('api=async()=>window.saved');await run('resolveQueue()');const d=w.document.querySelector('dialog');assert.equal(d.open,true);assert.match(d.textContent,/draft is retained/i);assert.equal(d.querySelectorAll('details').length,1,'A replay failure must leave a readable comparison');assert.equal(run('cellQueue[0].name'),'Retained local name');
 }finally{w.close();}}
 {const {w,run}=fixture();try{
  stageDuplicate(run);let complete;w.reviewRead=new Promise(resolve=>complete=resolve);run('api=()=>window.reviewRead');
  const review=run('resolveQueue()'),d=w.document.querySelector('dialog');
  assert.equal(d.open,true,'Review must open before the online read resolves');assert.match(d.textContent,/checking.*saved/i);assert.equal(d.querySelector('#ok').disabled,true);
  complete(JSON.parse(run('JSON.stringify({current:draftBase})')));await review;
  const fields=d.querySelectorAll('[data-review-tg-name]');assert.equal(fields.length,2);fields[1].value='3HCL2';
  await d.querySelector('#ok').onclick();assert.equal(run('cellQueue.length'),4);assert.equal(run('cellQueue[1].name'),'3HCL2');assert.equal(run('cellQueue[2].target'),'pending-second');assert.equal(run('v().assignments[0].target'),'pending-second');assert.equal(run(`v().loads['1'].EL`),14);assert.equal(run('queueFlight'),null);assert.equal(d.open,false);
 }finally{w.close();}}
 {const {w,run}=fixture();try{
  stageDuplicate(run);w.saved=JSON.parse(run('JSON.stringify({current:draftBase})'));run('api=async()=>window.saved');await run('resolveQueue()');const d=w.document.querySelector('dialog'),before=run('JSON.stringify(cellQueue)');
  await d.querySelector('#ok').onclick();assert.match(d.querySelector('#formerror').textContent,/already exists/i);assert.equal(run('JSON.stringify(cellQueue)'),before,'Invalid recovery cannot partially replace the queue');assert.equal(d.open,true);
 }finally{w.close();}}
 {const {w,run}=fixture();try{
  run(`queueCell({operation:'setLoad',level:'1',subject:'EL',expected:15,value:14});queueError='Disconnected';api=async()=>{throw Error('Network unavailable')}`);await run('resolveQueue()');const d=w.document.querySelector('dialog');assert.equal(d.open,true);assert.match(d.textContent,/Network unavailable/);assert.equal(run('queuedEdits().length'),1);assert.equal(d.querySelector('[data-review-refresh]').disabled,false);
 }finally{w.close();}}
 {const {w,run}=fixture();try{
  stageDuplicate(run);let complete;w.reviewRead=new Promise(resolve=>complete=resolve);run('api=()=>window.reviewRead');const review=run('resolveQueue()'),d=w.document.querySelector('dialog');run('sessionEpoch++;current="another-version"');complete({current:{id:'v1'}});await review;assert.equal(d.querySelectorAll('[data-review-tg-name]').length,0);assert.equal(d.querySelector('#ok').disabled,true);assert.equal(run('cellQueue.length'),4);
 }finally{w.close();}}
 {const {w,run}=fixture();try{
  stageDuplicate(run);run(`queueFlight={versionId:current,requestId:'same-receipt',issuedAt:Date.now(),edits:cellQueue,wire:saveWireEdits(cellQueue),running:false};cellQueue=[];`);w.saved=JSON.parse(run('JSON.stringify({current:draftBase})'));run('api=async()=>window.saved');await run('resolveQueue()');const d=w.document.querySelector('dialog');assert.equal(d.querySelectorAll('[data-review-tg-name]').length,0,'Unconfirmed writes cannot be edited');assert.match(d.querySelector('#ok').textContent,/same save/i);assert.equal(run('queueFlight.requestId'),'same-receipt');
 }finally{w.close();}}
 {const {w,run}=fixture();try{
  run(`v().groups=[{id:'cl',name:'Chinese group',subject:'CL',level:'1',levelWide:true},{id:'ml',name:'Malay group',subject:'ML',level:'1',levelWide:true},{id:'hcl',name:'Chinese higher group',subject:'HCL',level:'1',levelWide:true},{id:'el',name:'English group',subject:'EL',level:'1',levelWide:true}];query='MTL'`);
  assert.deepEqual(JSON.parse(run('JSON.stringify(matrixRows().flatMap(b=>b.rows.map(r=>r.id)).sort())')),['cl','hcl','ml']);
 }finally{w.close();}}
 await turn();console.log('PASS TG duplicate prevention, immediate Review, draft-name correction retains linked teachers, atomic invalid recovery, offline/stale review, immutable uncertain save and MTL search');
})().catch(error=>{console.error(error);process.exitCode=1});
