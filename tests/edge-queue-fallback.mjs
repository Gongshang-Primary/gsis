import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import crypto from 'node:crypto';
import Q from '../shared/edge-command-queue.js';
import {deployCommandGateway} from '../public/deploy-command-gateway.js';
import {googleDeploy} from '../edge-command-worker/deploy-adapter.js';
import {CommandService} from '../edge-command-worker/worker.mjs';
import database from './helpers/edge-queue-db.cjs';
const require=createRequire(import.meta.url),{ctx,props}=require('./storage.cjs');const run=s=>vm.runInContext(s,ctx),actor=run('who'),secret=props.get('GSIS_SECRET');
ctx.Utilities.computeHmacSha256Signature=(text,key)=>[...crypto.createHmac('sha256',key).update(text).digest()];ctx.out_=x=>x;run("contacts_=()=>c");
const savedFetch=globalThis.fetch;let executions=0;
globalThis.fetch=async(url,options)=>{assert.equal(new URL(url).hostname,'script.google.com');const request=JSON.parse(options.body),payload=JSON.parse(request.payload);if(payload.kind==='execute')executions++;return Response.json(ctx.doPost({postData:{contents:options.body}}));};
const env={GSIS_SECRET:secret,APPS_SCRIPT_URL:'https://script.google.com/macros/s/synthetic-deploy/exec'};
const make=()=>{const requestId=crypto.randomUUID(),expectedRevision=run('deployQueueRevision_(index_(book_()),id)');return {kind:'submit',issuedAt:Date.now(),expectedRevision,payload:{operation:'metadata',versionId:run('id'),key:'meta',name:'Synthetic fallback decision',requestId,expectedRevision:expectedRevision.versionRevision,protocol:500}};};
const commandFor=input=>({app:'deploy',document:'workbook',requestId:input.payload.requestId,issuedAt:input.issuedAt,actor,action:input.payload.operation,schemaVersion:1,expectedRevision:input.expectedRevision,payload:input.payload});
try{
 // Both deliveries reach the actual native lock/ledger. Exact repeats never enter mutation twice.
 for(const first of ['direct','queue']){
  const input=make(),command=commandFor(input),before=run('index_(book_()).revision');
  if(first==='queue')await googleDeploy(env,{kind:'execute',delivery:'direct',actor,command,configGeneration:1});
  const result=await deployCommandGateway(env,input,actor);assert.equal(result.data.saved,true);
  if(first==='direct')await googleDeploy(env,{kind:'execute',delivery:'direct',actor,command,configGeneration:1});
  assert.equal(run('index_(book_()).revision'),before+1,'both arrival orders mutate once');
 }
 // A rolling-deployment /api/change request must consult that same ledger too.
 const rolling=make(),beforeRolling=run('index_(book_()).revision');await deployCommandGateway(env,rolling,actor);const ordinary=await Q.sign({action:'change',input:rolling.payload,identity:actor,timestamp:Date.now(),nonce:crypto.randomUUID()},secret),ordinaryReply=ctx.doPost({postData:{contents:JSON.stringify(ordinary)}});assert.equal(ordinaryReply.ok,true);assert.equal(ordinaryReply.data.saved,true);assert.equal(run('index_(book_()).revision'),beforeRolling+1,'ordinary direct route cannot bypass the command ledger');
 const cancelledInput=make(),beforeCancel=run('index_(book_()).revision'),cancelled=await deployCommandGateway(env,{...cancelledInput,kind:'cancel'},actor);assert.equal(cancelled.data.queueReceipt.state,'REJECTED');const late=await deployCommandGateway(env,cancelledInput,actor);assert.equal(late.ok,false);assert.equal(run('index_(book_()).revision'),beforeCancel,'durable cancellation fences a delayed direct execute');
 // A local synthetic queued scope admits durably, then loses the admission response.
 // Override configuration only in this isolated Google fixture, never production settings.
 run("var actualQueueConfig=deployQueueConfig_;deployQueueConfig_=()=>({...actualQueueConfig(),mode:'queued'})");
 const db=database(),service=new CommandService({...env,DEPLOY_EDGE_QUEUE:db});let admittedId;

 env.DEPLOY_COMMAND_SERVICE={async fetch(request){const incoming=JSON.parse(JSON.parse(await request.clone().text()).payload),result=await service.fetch(request);if(incoming.kind==='enqueue'){assert.equal(result.status,202);admittedId=incoming.command.requestId;throw Error('synthetic lost enqueue response');}return result;}};
 const input=make(),before=run('index_(book_()).revision'),result=await deployCommandGateway(env,input,actor);assert.equal(admittedId,input.payload.requestId);assert.equal(result.data.saved,true);await service.drain();assert.equal((await service.store.lookup(admittedId)).state,'APPLIED');assert.equal(run('index_(book_()).revision'),before+1,'lost admission fallback and later dispatcher still mutate once');
 run('deployQueueConfig_=actualQueueConfig');
 const configuration=await googleDeploy(env,{kind:'observe',actor,versionId:run('id')});const grant=await Q.verify(configuration,secret,'edge-command-google-role-v1');assert.equal(grant.config.mode,'direct');
 await assert.rejects(googleDeploy(env,{kind:'configure',actor,configuration:{mode:'queued',generation:1,admissionPaused:false,dispatchPaused:false}}),'P1 cannot enable queued');
 // A browser cannot select app/document/actor or inject an unrestricted action.
 await assert.rejects(deployCommandGateway(env,{...make(),app:'roster'},actor),e=>e.status===400);
 console.log('PASS actual gateway/Google ledger fallback in both arrival orders, durable local admission then lost response, later queued delivery deduplicated, direct default and queued-enablement rejection');
}finally{globalThis.fetch=savedFetch;}
