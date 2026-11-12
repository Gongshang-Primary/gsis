import Q from '../shared/edge-command-queue.js';
import {googleDeploy} from '../edge-command-worker/deploy-adapter.js';
export async function queueService(env,kind,actor,grant,fields={}){
 if(!env.DEPLOY_COMMAND_SERVICE)Q.fail(503,'QUEUE_SERVICE_UNAVAILABLE');
 const envelope=await Q.sign({purpose:Q.GATEWAY,app:'deploy',document:'workbook',kind,actor,grant,...fields,timestamp:Date.now(),nonce:crypto.randomUUID()},env.GSIS_SECRET);
 const res=await env.DEPLOY_COMMAND_SERVICE.fetch(new Request('https://deploy-queue.internal/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(envelope)}));
 const body=Q.parse(await res.text(),8388608);if(!res.ok||body.ok!==true)Q.fail(res.status,body.code||'QUEUE_SERVICE_UNAVAILABLE');return {data:body.data,status:res.status};
}
function publicReceipt(d){
 const state=d.decision==='APPLIED'?'APPLIED':['REJECTED','CANCELLED'].includes(d.decision)?'REJECTED':d.decision==='PREPARED'?'CHECKING':'UNCERTAIN';
 return {app:'deploy',requestId:d.requestId,action:d.action||null,state,resultKind:d.resultKind||'pending',saved:state==='APPLIED',submittedAt:d.preparedAt||null,updatedAt:d.updatedAt||null,appliedAt:d.appliedAt||null,beforeRevision:d.beforeRevision||null,afterRevision:d.afterRevision||null,googleReference:d.reference||null,decisionDigest:d.digest||null,code:d.code||null,steps:d.steps||[],recovery:state==='UNCERTAIN'||state==='CHECKING'?['checkStatus']:[]};
}
export async function deployCommandGateway(env,input,who,context={}){
 const actor={email:who.email,subject:who.subject};
 if(!input||typeof input!=='object'||!['submit','cancel','status','list','check','health','projection','configure','switchBack','export','archive'].includes(input.kind))Q.fail(400,'QUEUE_GATEWAY_SCHEMA');
 const allowed={submit:['kind','issuedAt','expectedRevision','payload'],cancel:['kind','issuedAt','expectedRevision','payload'],status:['kind','requestId'],list:['kind','cursor'],check:['kind','requestId'],health:['kind'],projection:['kind','versionId'],configure:['kind','configuration'],switchBack:['kind'],export:['kind','cursor'],archive:['kind']}[input.kind];
 if(Object.keys(input).some(k=>!allowed.includes(k)))Q.fail(400,'QUEUE_GATEWAY_SCHEMA');
 const versionId=input.payload?.versionId||input.versionId||'',grantEnvelope=await googleDeploy(env,{kind:'observe',actor,versionId}),grant=await Q.verify(grantEnvelope,env.GSIS_SECRET,'edge-command-google-role-v1');
 if(grant.actorSubject!==actor.subject||grant.actorEmail!==actor.email||grant.expiresAt<=Date.now()||grant.expiresAt-grant.timestamp>60000||grant.app!=='deploy'||grant.document!=='workbook')Q.fail(403,'QUEUE_ROLE_OBSERVATION');
 if(['health','configure','switchBack','export','archive','cancel'].includes(input.kind)&&!grant.admin)Q.fail(403,'QUEUE_ADMIN');
 if(input.kind==='submit'||input.kind==='cancel'){
  const payload={...input.payload};delete payload.identity;delete payload.actor;delete payload.scope;delete payload.app;delete payload.document;
  const command=Q.command({app:'deploy',document:'workbook',requestId:payload.requestId,issuedAt:input.issuedAt,actor,action:payload.operation,schemaVersion:1,expectedRevision:input.expectedRevision,payload});
  if(!grant.actions.includes(command.action))Q.fail(403,'QUEUE_ACTION_ROLE');Q.deployPermission(command,grant);
  if(input.kind==='cancel'){
   const signed=await googleDeploy(env,{kind:'cancel',actor,command}),d=await Q.verify(signed,env.GSIS_SECRET,'edge-command-google-result-v1');if(d.requestId!==command.requestId||d.actorSubject!==actor.subject||d.payloadHash!==await Q.digest(Q.binding(command)))Q.fail(409,'QUEUE_DECISION_MISMATCH');if(['APPLIED','REJECTED','CANCELLED'].includes(d.decision))await Q.decisionProof(d);return {ok:true,data:{...(d.result||{}),saved:d.decision==='APPLIED',queueReceipt:publicReceipt(d)}};
  }
  if(grant.config.mode==='queued'){
   try{const admitted=await queueService(env,'enqueue',actor,grantEnvelope,{command,configGeneration:grant.config.generation});if(admitted.data.requestId!==command.requestId||!['QUEUED','RUNNING','CHECKING','UNCERTAIN','APPLIED','REJECTED'].includes(admitted.data.state)||admitted.data.state==='QUEUED'&&admitted.data.saved!==false)Q.fail(503,'QUEUE_RECEIPT_INVALID');return {ok:true,data:{saved:admitted.data.state==='APPLIED',queueReceipt:admitted.data},httpStatus:admitted.status};}
   catch(e){if([400,401,403,409,413,429].includes(e.status))throw e;/* Unknown admission: same-ID direct continuation, never another UUID. */}
  }else if(grant.config.mode!=='direct')Q.fail(503,'QUEUE_CONFIG_INVALID');
  let signed,d;
  try{signed=await googleDeploy(env,{kind:'execute',delivery:'direct',actor,command,configGeneration:grant.config.generation});d=await Q.verify(signed,env.GSIS_SECRET,'edge-command-google-result-v1');}
  catch{return {ok:true,data:{saved:false,queueReceipt:{app:'deploy',requestId:command.requestId,state:'CHECKING',resultKind:'pending',saved:false,submittedAt:command.issuedAt,recovery:['checkStatus']}}};}
  if(d.requestId!==command.requestId||d.actorSubject!==actor.subject||d.payloadHash!==await Q.digest(Q.binding(command))||d.app!=='deploy'||d.document!=='workbook')Q.fail(503,'QUEUE_DECISION_MISMATCH');
  if(['APPLIED','REJECTED','CANCELLED'].includes(d.decision))await Q.decisionProof(d);
  const receipt=publicReceipt(d);
  if(receipt.saved){
   const invalidation=queueService(env,'directApplied',actor,grantEnvelope,{decision:signed,requestId:command.requestId}).catch(()=>{});if(context.waitUntil)context.waitUntil(invalidation);else await invalidation;
   return {ok:true,data:{...(d.result||{}),saved:true,versionId:command.payload.versionId,requestId:command.requestId,queueReceipt:receipt}};
  }
  if(receipt.state==='REJECTED')return {ok:false,status:d.resultKind==='conflict'?409:403,code:d.code||'QUEUE_REJECTED',error:d.resultKind==='conflict'?'The saved version changed. Compare it with your retained proposal before making a new decision.':'The command was rejected. Your proposal is retained.',data:{saved:false,queueReceipt:receipt}};
  return {ok:true,data:{saved:false,queueReceipt:receipt}};
 }
 if(['status','check'].includes(input.kind)){
  if(!Q.uuid(input.requestId))Q.fail(400,'QUEUE_REQUEST_ID');
  try{const r=await queueService(env,input.kind,actor,grantEnvelope,{requestId:input.requestId});if(r.data.state!=='APPLIED'||!(r.data.steps||[]).some(Q.unresolved))return {ok:true,data:{saved:r.data.state==='APPLIED',queueReceipt:r.data}};}catch(e){if([401,403].includes(e.status))throw e;}
  const signed=await googleDeploy(env,{kind:'status',actor,requestId:input.requestId}),d=await Q.verify(signed,env.GSIS_SECRET,'edge-command-google-result-v1');if(d.requestId!==input.requestId||d.app!=='deploy'||d.document!=='workbook')Q.fail(503,'QUEUE_DECISION_MISMATCH');if(['APPLIED','REJECTED','CANCELLED'].includes(d.decision))await Q.decisionProof(d);if(d.decision==='APPLIED')await queueService(env,'steps',actor,grantEnvelope,{decision:signed}).catch(()=>{});return {ok:true,data:{...(d.result||{}),saved:d.decision==='APPLIED',queueReceipt:publicReceipt(d)}};
 }
 if(input.kind==='projection'){
  try{return {ok:true,data:(await queueService(env,'projection',actor,grantEnvelope,{projection:{versionId}})).data};}catch{/* Direct Google remains authoritative when cache/service cannot verify. */}
  const p=await googleDeploy(env,{kind:'projection',actor,versionId,refreshGeneration:Date.now()}),m=await Q.verify(p.manifest,env.GSIS_SECRET,'edge-command-google-projection-v1');if(m.audienceKey!==actor.subject||m.authRevision!==grant.authRevision||m.payloadDigest!==await Q.digest(p.data))Q.fail(503,'QUEUE_CACHE_PROOF');return {ok:true,data:{mode:'direct',data:p.data,asOf:m.observedAt,googleRevision:m.googleRevision}};
 }
 if(input.kind==='configure'){const signed=await googleDeploy(env,{kind:'configure',actor,configuration:input.configuration}),configuration=await Q.verify(signed,env.GSIS_SECRET,'edge-command-google-config-v1');return {ok:true,data:{configuration,mirrorPending:true}};}
 try{return {ok:true,data:(await queueService(env,input.kind,actor,grantEnvelope,input.kind==='list'||input.kind==='export'?{cursor:input.cursor||0}:{})).data};}
 catch(e){if(e.code==='QUEUE_SERVICE_UNAVAILABLE')return {ok:true,data:{available:false,mode:'direct',code:e.code}};throw e;}
}

export async function deployCommandShadow(env,input,who,data){
 if(!env.DEPLOY_COMMAND_SERVICE||!data.current||data.unchanged||data.catalogueUnchanged)return {compared:false};
 const actor={email:who.email,subject:who.subject},grant=await googleDeploy(env,{kind:'observe',actor,versionId:data.current.id});
 return queueService(env,'shadow',actor,grant,{projection:{versionId:data.current.id},shadowObservation:{revision:data.revision,digest:await Q.digest(Q.shadowProjection(data))}});
}
