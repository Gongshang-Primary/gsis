'use strict';
// Model: Codex. Real Deploy note and command recovery, synthetic transport only.
const assert=require('node:assert/strict'),fs=require('node:fs'),{webcrypto,randomUUID}=require('node:crypto'),make=require('./dom-helper.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
function fixture({oldState='APPLIED',submitState='APPLIED',readFails=false}={}){
 const h=make(),{w,run}=h,oldId=randomUUID(),requests=[],submits=[],reads=[];
 w.TextEncoder=TextEncoder;Object.defineProperty(w.crypto,'subtle',{value:webcrypto.subtle});run(fs.readFileSync('public/deploy-command-client.js','utf8'));
 const revision=(id,versionRevision,indexRevision)=>({indexRevision,versionId:id,versionRevision,commit:'synthetic-'+id+'-'+versionRevision});
 w.__oldId=oldId;
 run(`token='session';lastEmail='synthetic@gsps.edu.sg';tab='Versions';edgeCommandProtocol=1;snapshotCache={id:'v1',revision:3,globalRevision:7,key:'initial'};acceptedSnapshot={epoch:sessionEpoch,id:'v1',revision:7};v().edgeQueueRevision={indexRevision:7,versionId:'v1',versionRevision:3,commit:'synthetic-v1-3'};state.versions.push({...clone(v()),id:'v2',name:'Other version',notes:'',revision:4,edgeQueueRevision:{indexRevision:7,versionId:'v2',versionRevision:4,commit:'synthetic-v2-4'}});edgeClient().restored=true;`);
 if(oldState){
  w.__old={requestId:oldId,action:'metadata',payload:{operation:'metadata',versionId:'v1',requestId:oldId,protocol:500,returnDelta:true},receipt:{app:'deploy',requestId:oldId,state:oldState,saved:oldState==='APPLIED',submittedAt:Date.now()-1000,afterRevision:revision('v1',4,8),steps:[]}};
  run('edgeClient().rows.push(__old);edgeClient().save()');
 }
 w.fetch=async(url,options={})=>{
  const route=new URL(url,w.location.href).pathname,input=JSON.parse(options.body||'{}');
  const ok=data=>Response.json({ok:true,data});
  if(route==='/api/commands'){
   requests.push(copy(input));
   if(input.kind==='health')return ok({available:false});
   if(input.kind==='list')return ok({receipts:[]});
   if(input.kind==='status'){
    const state=input.requestId===oldId?oldState:submitState;
    return ok({saved:state==='APPLIED',queueReceipt:{app:'deploy',requestId:input.requestId,state,saved:state==='APPLIED',submittedAt:Date.now()-1000,afterRevision:revision(input.requestId===oldId?'v1':'v2',5,9),steps:[]}});
   }
   if(input.kind==='submit'){
    submits.push(copy(input));return ok({saved:submitState==='APPLIED',versionId:'v2',requestId:input.payload.requestId,revision:5,queueReceipt:{app:'deploy',requestId:input.payload.requestId,state:submitState,saved:submitState==='APPLIED',submittedAt:Date.now(),afterRevision:revision('v2',5,9),steps:[]}});
   }
   throw Error('Unexpected command request '+input.kind);
  }
  if(route==='/api/bootstrap'){
   reads.push(copy(input));if(readFails)throw Error('Synthetic offline read');
   const doc=copy(run("state.versions.find(x=>x.id==='v2')"));doc.revision=4;doc.edgeQueueRevision=revision('v2',4,8);
   return ok({user:{email:'synthetic@gsps.edu.sg',roles:['Admin','KP']},current:doc,currentId:'v2',versions:[{id:'v1',revision:4},{id:'v2',revision:4}],revision:8,edgeQueueRevision:revision('v2',4,8),cacheKey:'fresh-other-version',leases:[]});
  }
  throw Error('Unexpected network request '+route);
 };
 run("versionNoteDraft(state.versions.find(x=>x.id==='v2')).value='Synthetic retained note';render()");
 return {...h,requests,submits,reads,oldId,json:s=>copy(run(s))};
}
async function test(name,work){await work();console.log('PASS '+name);}
(async()=>{
 await test('a non-selected version note refreshes its own base and preserves the selected planning draft',async()=>{
  const h=fixture();try{
   h.run("queueCell({operation:'setLoad',level:'1',subject:'EL',expected:15,value:14})");
   await h.run("saveVersionNote('v2')");
   assert.equal(h.submits.length,1,'The new note submits once');
   assert.deepEqual(h.submits[0].expectedRevision,{indexRevision:8,versionId:'v2',versionRevision:4,commit:'synthetic-v2-4'});
   assert.equal(h.reads[0].versionId,'v2');assert.equal(h.run('current'),'v1');
   assert.equal(h.run("v().loads['1'].EL"),14);assert.equal(h.run('queuedEdits().length'),1);
   assert.equal(h.run("state.versions.find(x=>x.id==='v2').notes"),'Synthetic retained note');
   assert.equal(h.run("versionNoteDrafts.get('v2').attempt"),null);
   assert.equal(h.run("versionNoteDrafts.get('v2').status"),'Saved');
  }finally{h.w.close();}
 });
 await test('an older pending save leaves a never-submitted note editable',async()=>{
  const h=fixture({oldState:'CHECKING'});try{
   await h.run("saveVersionNote('v2')");
   assert(h.requests.some(x=>x.kind==='status'&&x.requestId===h.oldId));assert.equal(h.submits.length,0);
   assert.equal(h.run("versionNoteDrafts.get('v2').attempt"),null);
   assert.equal(h.run("versionNoteDrafts.get('v2').value"),'Synthetic retained note');
   assert.equal(h.w.document.querySelector('[data-version-row="v2"] [data-note-input]').readOnly,false);
   assert.equal(h.run('current'),'v1');assert.equal(h.run('edgeClient().rows.length'),1);
  }finally{h.w.close();}
 });
 await test('a failed base refresh preserves an editable unsent note',async()=>{
  const h=fixture({readFails:true});try{
   await h.run("saveVersionNote('v2')");assert.equal(h.submits.length,0);
   assert.equal(h.run("versionNoteDrafts.get('v2').attempt"),null);
   assert.equal(h.run("versionNoteDrafts.get('v2').value"),'Synthetic retained note');assert.equal(h.run('current'),'v1');
  }finally{h.w.close();}
 });
 await test('an actually submitted uncertain note retains and checks its original request ID',async()=>{
  const h=fixture({oldState:null,submitState:'CHECKING'});try{
   await h.run("saveVersionNote('v2')");assert.equal(h.submits.length,1);const id=h.submits[0].payload.requestId;
   assert.equal(h.run("versionNoteDrafts.get('v2').attempt.requestId"),id);
   await h.run("saveVersionNote('v2')");assert.equal(h.submits.length,1);assert(h.requests.some(x=>x.kind==='status'&&x.requestId===id));
   assert.equal(h.run("versionNoteDrafts.get('v2').attempt.requestId"),id);assert.equal(h.run('current'),'v1');
  }finally{h.w.close();}
 });
})().catch(error=>{console.error(error);process.exitCode=1});
