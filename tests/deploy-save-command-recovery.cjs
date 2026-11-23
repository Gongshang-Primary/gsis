'use strict';
// Model: Codex. Exercise the production app, command client and HTTP boundary.
const assert=require('node:assert/strict'),fs=require('node:fs'),{webcrypto,randomUUID}=require('node:crypto'),make=require('./dom-helper.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
function page({oldState,oldStatusError,submitState='APPLIED',submitError}={}){
 const h=make(),{w,run}=h,oldId=randomUUID(),requests=[],submits=[],receiptReads=[],reads=[];
 w.console.debug=()=>{};w.console.info=()=>{};
 w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
 Object.defineProperty(w.crypto,'subtle',{value:webcrypto.subtle});
 run(fs.readFileSync('public/deploy-command-client.js','utf8'));
 const teachers=Array.from({length:6},(_,i)=>({id:'synthetic-teacher-'+i,name:'Synthetic teacher '+(i+1),active:true}));
 let server={id:'v1',status:'planning',name:'Synthetic save recovery',classes:[{ref:'synthetic-class',level:'1',name:'Perseverance',shortName:'P'}],loads:{'1':{TTT:2,Assembly:1,FTGP:2,FTT:2,EL:15,CL:12,ML:12,TL:12}},venues:[{id:'F1-16',form:'1P'}],groups:[{id:'synthetic-tg',name:'1CL3',subject:'CL',level:'1',form:'1P',sources:['1P'],venue:'F1-16'}],teachers,assignments:teachers.map((t,i)=>({id:'synthetic-assignment-'+i,teacher:t.id,target:'synthetic-tg',subject:'CL',level:'1',venue:'F1-16'})),teacherNotes:{},levelExclusions:[],audit:[]};
 let versionRevision=3,indexRevision=7;
 const revision=()=>({indexRevision,versionId:'v1',versionRevision,commit:'synthetic-commit-'+versionRevision});
 const applied=(requestId)=>({app:'deploy',requestId,state:'APPLIED',saved:true,submittedAt:Date.now()-1000,updatedAt:Date.now(),appliedAt:Date.now(),afterRevision:revision(),steps:[]});
 const response=data=>Response.json({ok:true,data});
 const fail=(status,error)=>Response.json({ok:false,status,error},{status});
 const setOldApplied=()=>{versionRevision=Math.max(versionRevision,4);indexRevision=Math.max(indexRevision,8);server.teacherNotes['synthetic-teacher-0']='Earlier save retained';};
 const bootstrap=()=>({user:{email:'synthetic@gsps.edu.sg',roles:['Admin','KP']},currentId:'v1',current:{...copy(server),edgeQueueRevision:revision()},versions:[{id:'v1',name:server.name,status:server.status,revision:versionRevision,edgeQueueRevision:revision()}],revision:indexRevision,cacheKey:'synthetic-snapshot-'+versionRevision,edgeQueueRevision:revision(),leases:[]});
 w.fetch=async(url,options={})=>{
  const route=new URL(url,w.location.href).pathname,input=JSON.parse(options.body||'{}');
  if(route==='/api/commands'){
   requests.push(copy(input));
   if(input.kind==='health')return response({available:false});
   if(input.kind==='list')return response({receipts:[],cursor:0});
   if(input.kind==='status'||input.kind==='check'){
    if(input.requestId===oldId){if(oldStatusError)return fail(oldStatusError,'The previous save cannot currently be checked.');if(oldState==='APPLIED'){setOldApplied();return response({saved:true,queueReceipt:applied(oldId)});}return response({saved:false,queueReceipt:{app:'deploy',requestId:oldId,state:oldState||'CHECKING',saved:false,submittedAt:Date.now()-1000,updatedAt:Date.now(),steps:[]}});}
    const sent=submits.find(x=>x.payload.requestId===input.requestId);
    if(sent)return response({saved:submitState==='APPLIED',queueReceipt:submitState==='APPLIED'?applied(input.requestId):{app:'deploy',requestId:input.requestId,state:submitState,saved:false,submittedAt:Date.now(),steps:[]}});
    return fail(404,'No command with this ID.');
   }
   if(input.kind==='submit'){
    submits.push(copy(input));
    if(submitError)return fail(submitError,'Synthetic transport rejection without a terminal receipt.');
    if(submitState!=='APPLIED')return response({saved:false,queueReceipt:{app:'deploy',requestId:input.payload.requestId,state:submitState,saved:false,submittedAt:Date.now(),steps:[]}});
    w.__beforeServer=copy(server);w.__afterServer=copy(server);w.__submittedEdits=copy(input.payload.edits||[]);
    run('for(const edit of __submittedEdits)projectEdit(__afterServer,edit)');
    server=copy(w.__afterServer);versionRevision++;indexRevision++;
    const changes=copy(run(`(()=>{const before=GSISFields.flat(__beforeServer),after=GSISFields.flat(__afterServer);return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>JSON.stringify(before[key])!==JSON.stringify(after[key])).map(key=>({key,value:after[key]===undefined?null:after[key]}));})()`));
    return response({saved:true,versionId:'v1',requestId:input.payload.requestId,revision:versionRevision,queueReceipt:applied(input.payload.requestId),delta:{versionId:'v1',revision:versionRevision,globalRevision:indexRevision,changes}});
   }
   throw Error('Unexpected command request: '+input.kind);
  }
  if(route==='/api/bootstrap'||route==='/api/sync'){reads.push({route,input:copy(input)});return response(bootstrap());}
  if(route==='/api/receipt'){receiptReads.push(copy(input));return response({saved:false});}
  if(route==='/api/delta')return response({versionId:'v1',revision:versionRevision,globalRevision:indexRevision,changes:[]});
  throw Error('Unexpected network request: '+route);
 };
 w.__initial=copy(server);w.__revision=revision();
 run("state={versions:[__initial]};current='v1';role='Admin+KP';token='session';lastEmail='synthetic@gsps.edu.sg';tab='IP Deploy';edgeCommandProtocol=1;snapshotCache={id:'v1',revision:3,globalRevision:7,key:'initial'};acceptedSnapshot={epoch:sessionEpoch,id:'v1',revision:7};v().edgeQueueRevision=__revision;render();");
 if(oldState){
  if(oldState==='APPLIED')setOldApplied();
  w.__retained={requestId:oldId,action:'metadata',payload:{operation:'metadata',versionId:'v1',requestId:oldId,name:'Earlier save',protocol:500,returnDelta:true},expectedRevision:{indexRevision:7,versionId:'v1',versionRevision:3,commit:'synthetic-commit-3'},issuedAt:Date.now()-1000,receipt:{app:'deploy',requestId:oldId,state:oldState,saved:oldState==='APPLIED',submittedAt:Date.now()-1000,...(oldState==='APPLIED'?{afterRevision:revision()}:{}),steps:[]}};
  run('edgeClient().rows.push(__retained);edgeClient().save()');
 }
 const stage=()=>run("for(const teacher of [...v().teachers])queueCell({operation:'removeTeacher',target:'synthetic-tg',subject:'CL',teacher:teacher.id,expected:true})");
 return {...h,oldId,requests,submits,receiptReads,reads,stage,json:s=>copy(run(s)),setOldState:value=>{oldState=value;},setSubmitState:value=>{submitState=value;},server:()=>copy(server)};
}
async function test(name,work){await work();console.log('PASS '+name);}
(async()=>{
 await test('older uncertain command keeps six unsent assignment edits editable, then recovers and saves once',async()=>{
  const h=page({oldState:'CHECKING'});
  try{
   h.stage();assert.equal(h.run('queuedEdits().length'),6);
   await h.run('pumpQueue(true)');
   assert(h.requests.some(r=>r.kind==='status'&&r.requestId===h.oldId),'Save checks the actual retained command');
   assert.equal(h.submits.length,0,'Unresolved original command blocks only submission');
   assert.equal(h.run('queueFlight'),null,'No never-submitted save may become an unconfirmed flight');
   assert.equal(h.run('queuedEdits().length'),6,'All new input remains in the draft');
   assert.equal(h.w.document.querySelector('#content').inert,false,'The draft remains editable');
   assert.equal(h.run('edgeClient().rows.length'),1,'Only the original uncertain command is retained');
   assert.equal(h.receiptReads.length,0,'No invented request ID is checked as a saved receipt');
   h.setOldState('APPLIED');await h.run('pumpQueue(true)');
   assert.equal(h.submits.length,1,'The newer edits are sent once after the original is confirmed');
   assert.notEqual(h.submits[0].payload.requestId,h.oldId);
   assert.equal(h.submits[0].payload.edits.length,6);
   assert.deepEqual(h.submits[0].expectedRevision,{indexRevision:8,versionId:'v1',versionRevision:4,commit:'synthetic-commit-4'},'The new command binds to the refreshed saved revision');
   assert(h.reads.some(r=>r.route==='/api/bootstrap'),'The confirmed saved version is refreshed before dependent edits');
   assert.equal(h.server().assignments.length,0);
   assert.equal(h.run('v().assignments.length'),0);
   assert.equal(h.run("v().teacherNotes['synthetic-teacher-0']"),'Earlier save retained');
   assert.equal(h.run('queuedEdits().length'),0);assert.equal(h.run('queueFlight'),null);
   assert.equal(h.w.document.querySelector('#content').inert,false);
  }finally{h.w.close();}
 });
 await test('an unavailable original status keeps the new draft editable without submitting it',async()=>{
  const h=page({oldState:'CHECKING',oldStatusError:503});
  try{
   h.stage();await h.run('pumpQueue(true)');
   assert(h.requests.some(r=>r.kind==='status'&&r.requestId===h.oldId));
   assert.equal(h.submits.length,0);assert.equal(h.run('queueFlight'),null);
   assert.equal(h.run('queuedEdits().length'),6);assert.equal(h.w.document.querySelector('#content').inert,false);
   assert.equal(h.run('edgeClient().rows.length'),1);assert.equal(h.run('edgeClient().rows[0].receipt.state'),'CHECKING');
  }finally{h.w.close();}
 });
 await test('a known applied receipt refreshes a stale base before sending the dependent draft',async()=>{
  const h=page({oldState:'APPLIED'});
  try{
   h.stage();await h.run('pumpQueue(true)');
   assert.equal(h.submits.length,1);assert.equal(h.submits[0].payload.edits.length,6);
   assert.deepEqual(h.submits[0].expectedRevision,{indexRevision:8,versionId:'v1',versionRevision:4,commit:'synthetic-commit-4'});
   assert(h.reads.some(r=>r.route==='/api/bootstrap'));
   assert.equal(h.run("v().teacherNotes['synthetic-teacher-0']"),'Earlier save retained');
   assert.equal(h.run('v().assignments.length'),0);
  }finally{h.w.close();}
 });
 await test('a restored phantom flight is returned to the draft and checks the actual blocker',async()=>{
  const h=page({oldState:'CHECKING'});
  try{
   h.stage();h.w.__phantom=randomUUID();
   h.run("queueFlight={versionId:current,requestId:__phantom,issuedAt:Date.now(),edits:cellQueue.splice(0),baselineRevision:3,running:false};queueFlight.wire=saveWireEdits(queueFlight.edits);document.querySelector('#content').inert=true;");
   await h.run('pumpQueue(true)');
   assert.equal(h.run('queueFlight'),null);assert.equal(h.run('queuedEdits().length'),6);
   assert.equal(h.w.document.querySelector('#content').inert,false);
   assert.equal(h.submits.length,0);assert(h.requests.some(r=>r.kind==='status'&&r.requestId===h.oldId));
   assert(!h.requests.some(r=>r.requestId===h.w.__phantom),'The phantom was never submitted and must not be treated as the original command');
   assert(!h.receiptReads.some(r=>r.requestId===h.w.__phantom));
  }finally{h.w.close();}
 });
 await test('a genuine submitted uncertain save keeps and checks its original ID without another submission',async()=>{
  const h=page({submitState:'CHECKING'});
  try{
   h.stage();await h.run('pumpQueue(false)');assert.equal(h.submits.length,1);
   const original=h.submits[0].payload.requestId;
   assert.equal(h.run('queueFlight.requestId'),original);assert.equal(h.run('queuedEdits().length'),6);
   h.run('snapshotCache=null;edgeAppliedBases.clear()');
   await h.run('pumpQueue(true)');
   assert.equal(h.submits.length,1);assert.equal(h.run('queueFlight.requestId'),original);
   assert(h.requests.some(r=>r.kind==='status'&&r.requestId===original));
   assert.equal(h.run('edgeClient().rows[0].requestId'),original);
  }finally{h.w.close();}
 });
 await test('a transport 4xx without terminal evidence stays uncertain and cannot cause another submit',async()=>{
  const h=page({submitError:400,submitState:'CHECKING'});
  try{
   h.stage();await h.run('pumpQueue(false)');assert.equal(h.submits.length,1);
   const original=h.submits[0].payload.requestId;
   assert.equal(h.run('edgeClient().rows[0].receipt.state'),'CHECKING');
   await h.run('pumpQueue(true)');
   assert.equal(h.submits.length,1);assert.equal(h.run('edgeClient().rows[0].requestId'),original);
   assert(h.requests.some(r=>r.kind==='status'&&r.requestId===original));
  }finally{h.w.close();}
 });
})().catch(error=>{console.error(error);process.exitCode=1;});
