import * as edgeStore from './edge-store.js';
import {sha256Hex} from './edge-deploy-sha256.js';

const MAX_OBJECT_BYTES=33554432,CHUNK_CHARS=131072;
const fail=(code,message,status=503)=>{throw Object.assign(Error(message),{code,status});};
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const contentDigest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(value=>value.toString(16).padStart(2,'0')).join('');
const database=env=>{if(!env.GSIS_JOBS?.prepare||!env.GSIS_JOBS?.batch)fail('ROSTER_MIRROR_STORAGE','The Roster backup database is not configured.');return env.GSIS_JOBS;};
const coreFor=options=>{const core=options.core||edgeStore.GSiSRosterMirror;if(!core?.capture||!core?.status)fail('ROSTER_MIRROR_SETUP','The Roster backup runtime is not available.');return core;};
const enabled=env=>env.ROSTER_EDGE_AUTHORITY==='d1';
function boundReply(reply,generation){
 if(!reply||reply.generationId!==generation.id||reply.epoch!==generation.epoch)fail('ROSTER_MIRROR_ACK','Google did not confirm the selected backup generation.');
 return reply;
}
function references(items){
 const found=new Map();
 const visit=value=>{
  if(!value||typeof value!=='object')return;
  if(typeof value.workbookKey==='string'){
   const match=/^gsis\/roster\/workbooks\/[^/]+\/([a-f0-9]{64})\.xlsx$/.exec(value.workbookKey);
   if(!match)fail('ROSTER_MIRROR_OBJECT','A frozen workbook reference is invalid.');
   found.set(value.workbookKey,{key:value.workbookKey,digest:match[1],encoding:'base64-binary-v1'});
  }
  if(typeof value.key==='string'&&value.key.startsWith('gsis/roster/')&&value.digest!==undefined){
   if(!digest(value.digest)||value.encoding!=='gzip-json-v1'||!value.key.endsWith('/'+value.digest+'.json.gz'))fail('ROSTER_MIRROR_OBJECT','A frozen Roster object reference is invalid.');
   const previous=found.get(value.key);if(previous&&previous.digest!==value.digest)fail('ROSTER_MIRROR_OBJECT','Frozen object references disagree.');
   found.set(value.key,{key:value.key,digest:value.digest,encoding:value.encoding});
  }
  for(const child of Object.values(value))visit(child);
 };
 for(const item of items){const value=item.payload;visit(value);for(const key of ['value_json','result_json'])if(typeof value?.[key]==='string'){let parsed;try{parsed=JSON.parse(value[key]);}catch{fail('ROSTER_MIRROR_RECORD','A frozen backup record contains invalid JSON.');}visit(parsed);}}
 return [...found.values()];
}
async function objectText(env,reference){
 const bucket=env.ROSTER_TIMETABLE_SNAPSHOTS;if(!bucket?.get)fail('ROSTER_MIRROR_OBJECT','The private Roster object store is not configured.');
 const stored=await bucket.get(reference.key);if(!stored)fail('ROSTER_MIRROR_OBJECT','A frozen Roster object is unavailable.');
 let body=stored.body;
 if(!body){const bytes=await stored.arrayBuffer();body=new Blob([bytes]).stream();}
 if(reference.encoding==='base64-binary-v1'){
  const reader=body.getReader(),parts=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>8000000)fail('ROSTER_MIRROR_OBJECT_LIMIT','A saved workbook exceeds the 8 MB upload limit.');parts.push(part.value);}}catch(error){await reader.cancel(error).catch(()=>{});throw error;}finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  if(size<4||bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)fail('ROSTER_MIRROR_WORKBOOK','The saved source workbook is not a ZIP workbook.');
  const encoded=[];for(let at=0;at<size;at+=24576)encoded.push(btoa(String.fromCharCode(...bytes.subarray(at,at+24576))));const text=encoded.join('');
  if(await contentDigest(text)!==reference.digest)fail('ROSTER_MIRROR_OBJECT_DIGEST','A saved source workbook failed its content check.');return text;
 }
 const reader=body.pipeThrough(new DecompressionStream('gzip')).getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let text='',bytes=0;
 try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>MAX_OBJECT_BYTES)fail('ROSTER_MIRROR_OBJECT_LIMIT','A frozen object exceeds the 32 MiB backup limit.');text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}catch(error){await reader.cancel(error).catch(()=>{});throw error;}finally{reader.releaseLock();}
 if(!bytes||await contentDigest(text)!==reference.digest)fail('ROSTER_MIRROR_OBJECT_DIGEST','A frozen Roster object failed its content check.');return text;
}
function chunkOffsets(text){const offsets=[0];for(let next=CHUNK_CHARS;next<text.length;next+=CHUNK_CHARS){if(next>offsets.at(-1)&&/^[\uDC00-\uDFFF]$/.test(text[next])&&/^[\uD800-\uDBFF]$/.test(text[next-1]))next--;offsets.push(next);}offsets.push(text.length);return offsets;}
async function copyObject(env,generation,reference,saved,call,canContinue){
 if(saved.objectReady===true)return true;
 if(!canContinue())return false;
 const text=await objectText(env,reference),offsets=chunkOffsets(text),total=offsets.length-1;
 if(!Number.isSafeInteger(saved.nextIndex)||saved.nextIndex<0||saved.nextIndex>=total||saved.total!==undefined&&saved.total!==null&&saved.total!==0&&saved.total!==total)fail('ROSTER_MIRROR_OBJECT_ACK','Google returned an invalid object checkpoint.');
 for(let index=saved.nextIndex;index<total;index++){
  if(!canContinue())return false;
  const part=text.slice(offsets[index],offsets[index+1]),reply=boundReply(await call({step:'object',generationId:generation.id,epoch:generation.epoch,reference,index,total,text:part,digest:sha256Hex(part)}),generation);
  if(reply.index!==index||reply.total!==total||reply.objectReady!== (index===total-1))fail('ROSTER_MIRROR_OBJECT_ACK','Google did not confirm the frozen object chunk.');
 }
 return true;
}

// Each invocation has a bounded number of network steps. Progress commits only
// after Google confirms the exact immutable page; uncertain responses replay it.
export async function runRosterMirror(env,options={}){
 if(!enabled(env))return {enabled:false,skipped:true,reason:'google-authoritative'};
 const core=coreFor(options),db=database(env),bridge=options.bridge;if(typeof bridge!=='function')fail('ROSTER_MIRROR_BRIDGE','A signed Google backup bridge is required.');
 const now=options.now??Date.now(),clock=options.clock||Date.now,started=clock(),budget=Math.max(1,Math.min(180000,options.budgetMs??180000)),maximum=Math.max(1,Math.min(64,options.maxSteps??64));let steps=0;
 const canContinue=()=>steps<maximum&&clock()-started<budget;
 const call=async input=>{steps++;return bridge({operation:'edgeMirror',...input});};
 const currentStatus=await core.status(db,now);
 if(currentStatus.enabled===false)return {enabled:false,phase:currentStatus.phase,steps};
 let googleCleanupPending=false;
 try{googleCleanupPending=!!(await bridge({operation:'edgeMirror',step:'prune'}))?.pending;}catch{googleCleanupPending=true;}
 let cleanupPending=false;
 if(typeof core.cleanup==='function')try{await core.cleanup(db,1000);}catch{cleanupPending=true;}
 let generation=await core.capture(db,{now,leaseMs:420000});
 if(!generation||generation.enabled===false||generation.disabled||generation.busy||generation.skipped){
  const status=generation?.skipped?await core.status(db,now):null;
  return status?.proof?{enabled:true,mirrored:true,upToDate:true,steps,proof:status.proof,cleanupPending,googleCleanupPending}:{enabled:true,...generation,steps,cleanupPending,googleCleanupPending};
 }
 let relinquish=false;const finish=value=>{relinquish=true;return {...value,cleanupPending,googleCleanupPending};};
 try{
 const {id,epoch,revisions,transportRevision,recordCount,receiptCount,transportCount,initialDigest}=generation;
 const start=boundReply(await call({step:'begin',generation:{id,epoch,revisions,transportRevision,recordCount,receiptCount,transportCount,initialDigest,snapshotDigest:initialDigest}}),generation);
 if(!Number.isSafeInteger(start.cursor)||start.cursor<generation.cursor)fail('ROSTER_MIRROR_ACK','Google backup progress is behind its confirmed D1 checkpoint.');
 while(canContinue()){
  if(generation.cursor<generation.totalCount){
   const page=await core.page(db,generation.id,{cursor:generation.cursor,limit:500,maxBytes:2097152,leaseToken:generation.leaseToken});
   if(!page.items.length||page.next<=generation.cursor)fail('ROSTER_MIRROR_PAGE','The frozen backup page did not advance.');
   const refs=references(page.items);let objectStates=new Map();
   if(refs.length){const reply=boundReply(await call({step:'objectsStatus',generationId:generation.id,epoch:generation.epoch,references:refs}),generation);
    if(!Array.isArray(reply.objects)||reply.objects.length!==refs.length)fail('ROSTER_MIRROR_OBJECT_ACK','Google did not confirm the object inventory.');
    objectStates=new Map(reply.objects.map(state=>[state.key,state]));if(objectStates.size!==refs.length||refs.some(ref=>!objectStates.has(ref.key)))fail('ROSTER_MIRROR_OBJECT_ACK','Google returned a different object inventory.');
   }
   for(const reference of refs)if(!await copyObject(env,generation,reference,objectStates.get(reference.key),call,canContinue))return finish({enabled:true,pending:true,generationId:generation.id,steps});
   if(!canContinue())break;
   const reply=boundReply(await call({step:'page',generationId:generation.id,epoch:generation.epoch,cursor:page.cursor,items:page.items,digest:page.digest}),generation);
   if(reply.cursor!==page.cursor||reply.next!==page.next||reply.digest!==page.digest||reply.snapshotDigest!==page.snapshotDigest)fail('ROSTER_MIRROR_ACK','Google did not confirm the exact frozen backup page.');
   generation=await core.advance(db,generation.id,{leaseToken:generation.leaseToken,cursor:page.cursor,next:page.next,digest:page.digest,proof:reply});
  }else{
   const proof=boundReply(await call({step:'finalize',generationId:generation.id,epoch:generation.epoch,snapshotDigest:generation.snapshotDigest}),generation);
   if(proof.verified===true){await core.acknowledge(db,generation.id,{leaseToken:generation.leaseToken,...proof});return finish({enabled:true,mirrored:true,generationId:generation.id,steps,proof});}
   if(proof.preparing!==true)fail('ROSTER_MIRROR_ACK','Google did not confirm the backup manifest.');
  }
 }
 return finish({enabled:true,pending:true,generationId:generation.id,steps});
 }finally{if(relinquish&&typeof core.releaseLease==='function')await core.releaseLease(db,generation.id,generation.leaseToken);}
}

export async function rosterMirrorStatus(env,options={}){
 if(!enabled(env))return {enabled:false,mode:'legacy',lagMs:0,lagMinutes:0};
 const result=await coreFor(options).status(database(env),options.now??Date.now());
 return {enabled:true,...result,lagMinutes:Math.ceil(Math.max(0,result.lagMs||0)/60000)};
}

// The owner changes the Pages variable only after this verified handover. A
// caller must positively confirm that old claims/sends have finished settling.
export async function releaseRosterMirror(env,options={}){
 if(!enabled(env))fail('ROSTER_RELEASE_AUTHORITY','D1 must be the current record before preparing a switch back.',409);
 const {bridge,requestId}=options,core=coreFor(options),db=database(env);if(typeof bridge!=='function'||typeof requestId!=='string'||!requestId||requestId.length>200)fail('ROSTER_RELEASE_INPUT','A signed bridge and stable release request are required.',400);
 const release=await core.beginRelease(db,requestId);
 if(release.phase==='released')return {...release,released:true,nextAction:'Set the Pages ROSTER_EDGE_AUTHORITY variable to legacy.'};
 if(release.phase!=='paused'&&(typeof options.quiescent!=='function'||await options.quiescent(release)!==true)){
  await core.cancelRelease(db,requestId);
  return {released:false,pending:true,phase:'blocked',message:'Finish pending work before retrying switch-back.'};
 }
 await core.sealRelease(db,requestId);
 const mirrored=await runRosterMirror(env,options);
 if(!mirrored.mirrored)return {released:false,pending:true,phase:'mirroring',mirror:mirrored};
 const proof=mirrored.proof,reply=await bridge({operation:'edgeMirror',step:'release',generationId:proof.generationId,epoch:proof.epoch,requestId,proof:{...proof,paused:true}});
 boundReply(reply,{id:proof.generationId,epoch:proof.epoch});if(reply.released!==true||reply.manifestDigest!==proof.manifestDigest)fail('ROSTER_RELEASE_ACK','Google has not confirmed the verified switch back.');
 await core.finishRelease(db,requestId,{generationId:proof.generationId,manifestDigest:proof.manifestDigest});
 return {released:true,phase:'released',generationId:proof.generationId,nextAction:'Set the Pages ROSTER_EDGE_AUTHORITY variable to legacy.'};
}
