import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),I=require('../shared/roster-inbox.js'),O=require('../shared/roster-operations.js');
const worker=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
// Actual worker + Inbox adapter/domain. Only Drive, R2, Contacts and Meta are synthetic.
// Each backend call has a fresh VM and reads the committed metadata from disk.
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gsis-inbox716-')),file=path.join(temp,'inbox.json');
const env={WHATSAPP_ENABLED:'true',WHATSAPP_MENU_ENABLED:'false',ROSTER_AUTOMATION_ENABLED:'false',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_TEMPLATE_ACCOUNT_ID:'323456789',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_ACCESS_TOKEN:'test-access-'.repeat(8),WHATSAPP_APP_SECRET:'test-app-'.repeat(8),WHATSAPP_VERIFY_TOKEN:'test-verify-'.repeat(8),ROSTER_SERVICE_SECRET:'test-service-'.repeat(8),BRIDGE_SECRET:'test-bridge-'.repeat(8),ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec'};
const origin=env.ROSTER_PUBLIC_ORIGIN,waId='6590000000',calls=[],objects=new Map(),bytes=new TextEncoder().encode('synthetic voice note');
let authorized=true,sends=0,writes=0,putCount=0;
const contacts={rosterPeople:[{id:'admin',name:'Admin',active:true,role:'T',email:'admin@gsps.edu.sg',mobile:'90000001'}],rosterSMCIds:['admin'],rosterAdminIds:['admin']};
const adapterCode=fs.readFileSync('backend/RosterInbox.gs','utf8');
function backend(req){
 let held=false;
 const scope=vm.createContext({GSISRosterInbox:I,GSISRosterOperations:O,ROSTER_DATA:'folder',Date,Utilities:{getUuid:()=>crypto.randomUUID()},props_:()=>({getProperty:()=>fs.existsSync(file)?'inbox-file':'',setProperty(){}}),rosterFindFile_:()=>null,rosterReadFile_:()=>fs.readFileSync(file,'utf8'),rosterDriveRequest_:(url,options)=>{assert(held);assert.match(url,/inbox-file/);fs.writeFileSync(file,options.payload);writes++;},rosterCreateFile_:(_folder,name,blob)=>{assert(held);assert.equal(name,'Roster WhatsApp Inbox.json');fs.writeFileSync(file,blob);writes++;return 'inbox-file';},LockService:{getScriptLock:()=>({})},deployLock_:()=>{assert(!held);held=true;return true;},deployUnlock_:()=>{assert(held);held=false;},error_:(status,message)=>{throw Object.assign(Error(message),{status});},rosterOperationsAuthority_:(_c,identity)=>({staffId:'admin',email:identity.email,smc:authorized,admin:authorized}),rosterOperationsDigest_:value=>require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex'),rosterOperationsState_:()=>O.initial(),rosterServiceContacts_:()=>({c:contacts})});
 scope.Utilities.newBlob=value=>value;
 require('./load-backend-role.cjs')(scope,'roster');
 vm.runInContext(adapterCode,scope);
 try{return {ok:true,data:req.action==='rosterService'?scope.rosterInboxServiceDispatch_(req):scope.rosterInboxDispatch_(req,contacts)};}catch(e){return {ok:false,status:e.status||503,error:e.message};}
}
const digest=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
env.WHATSAPP_INBOX_MEDIA={async head(key){const item=objects.get(key);return item?{size:item.bytes.length,httpMetadata:item.metadata.httpMetadata}:null;},async put(key,value,metadata){putCount++;objects.set(key,{bytes:new Uint8Array(value),metadata});},async get(key,options){const item=objects.get(key);if(!item)return null;const start=options?.range?.offset||0,end=options?.range?start+options.range.length:item.bytes.length;return {body:item.bytes.slice(start,end)};}};
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
 const url=new URL(input);calls.push(url.origin+url.pathname);
 if(url.href===env.APPS_SCRIPT_URL){const signed=JSON.parse(init.body),payload=JSON.parse(signed.payload);assert.equal(signed.signature,(await worker.sign(payload,payload.action==='rosterService'?env.ROSTER_SERVICE_SECRET:env.BRIDGE_SECRET)).signature);assert(['rosterInbox','rosterService'].includes(payload.action));return Response.json(backend(payload));}
 assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,'Bearer '+env.WHATSAPP_ACCESS_TOKEN);
 if(url.hostname==='graph.facebook.com'){
  if(url.pathname.endsWith('/messages')){const sent=JSON.parse(init.body);assert.equal(sent.to,waId);assert.equal(sent.type,'text');assert.equal(sent.text.body,'Reply from authorised staff');sends++;return Response.json({messages:[{id:'wamid.sent-'+sends}]});}
  assert(url.pathname.endsWith('/998877'));return Response.json({id:'998877',mime_type:'audio/ogg',file_size:bytes.length,sha256:digest,url:'https://lookaside.fbsbx.com/whatsapp_business/attachments/test'});
 }
 assert.equal(url.hostname,'lookaside.fbsbx.com','No unexpected or real network calls');return new Response(bytes,{headers:{'Content-Type':'audio/ogg','Content-Length':String(bytes.length)}});
};
const session=await worker.sign({purpose:'gsis-session-v1',origin,email:'admin@gsps.edu.sg',subject:'test-subject',issued:Date.now(),expires:Date.now()+86400000},env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin),cookie='__Host-gsis_session='+Buffer.from(session.payload).toString('base64url')+'.'+session.signature;
async function operation(input,settings=env,authenticated=true){const response=await worker.default.fetch(new Request(origin+'/api/operations',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(authenticated?{Cookie:cookie}:{})},body:JSON.stringify(input)}),settings,{});return {status:response.status,...await response.json()};}
async function webhook(messages=[],statuses=[],settings=env){const event={object:'whatsapp_business_account',entry:[{id:env.WHATSAPP_ACCOUNT_ID,changes:[{field:'messages',value:{metadata:{phone_number_id:env.WHATSAPP_PHONE_NUMBER_ID},messages,statuses}}]}]},signed=await worker.sign(event,env.WHATSAPP_APP_SECRET);return worker.whatsappWebhook(new Request(origin+'/api/whatsapp/webhook',{method:'POST',headers:{'X-Hub-Signature-256':'sha256='+signed.signature},body:signed.payload}),settings);}
try{
 let result=await operation({operation:'inboxList',filter:'all'});
 assert.equal(result.status,200);assert.equal(result.data.threads.length,0);assert.equal(result.data.configuration.liveVerified,false);
 for(const key of ['capture','replies','voice','templates'])assert.deepEqual(result.data.configuration[key],{configured:true,missing:[]});
 assert.equal(calls.length,1,'Readiness adds no network calls or sends');assert.equal(sends,0);
 const incomplete={...env,WHATSAPP_ENABLED:'false',WHATSAPP_INBOX_MEDIA:undefined,WHATSAPP_APP_SECRET:'',WHATSAPP_VERIFY_TOKEN:'',WHATSAPP_ACCESS_TOKEN:'',WHATSAPP_TEMPLATE_ACCOUNT_ID:'',ROSTER_SERVICE_SECRET:''};
 result=await operation({operation:'inboxList'},incomplete);assert.equal(result.data.configuration.enabled,false);assert(result.data.configuration.capture.missing.includes('ROSTER_SERVICE_SECRET'));assert(result.data.configuration.capture.missing.includes('WHATSAPP_APP_SECRET'));assert(result.data.configuration.capture.missing.includes('WHATSAPP_VERIFY_TOKEN'));assert(result.data.configuration.voice.missing.includes('WHATSAPP_INBOX_MEDIA'));assert(result.data.configuration.templates.missing.includes('WHATSAPP_TEMPLATE_ACCOUNT_ID'));
 for(const secret of [env.WHATSAPP_APP_SECRET,env.WHATSAPP_ACCESS_TOKEN,env.ROSTER_SERVICE_SECRET,env.WHATSAPP_VERIFY_TOKEN])assert(!JSON.stringify(result).includes(secret));
 authorized=false;result=await operation({operation:'inboxList'});assert.equal(result.status,403);assert.equal(result.data,undefined);authorized=true;assert.equal((await operation({operation:'inboxList'},env,false)).status,401);
 const incoming={id:'wamid.incoming',from:waId,type:'text',timestamp:String(Math.floor(Date.now()/1000)),text:{body:'An incoming message'}};
 assert.equal((await webhook([incoming],[],{...env,WHATSAPP_ENABLED:'false'})).status,200);assert.equal(writes,0,'Existing disabled gate is preserved');
 assert.equal((await webhook([incoming])).status,200);const firstWrites=writes;assert.equal((await webhook([incoming])).status,200);assert.equal(writes,firstWrites,'Duplicate inbound does not write another record');
 result=await operation({operation:'inboxList',filter:'all'});assert.equal(result.data.threads.length,1);assert.equal(result.data.threads[0].preview,'An incoming message');
 let thread=await operation({operation:'inboxThread',waId});assert.equal(thread.data.messages.length,1);assert.equal(thread.data.thread.canReply,true);
 const command={operation:'inboxReply',waId,kind:'text',text:'Reply from authorised staff',requestId:crypto.randomUUID(),expectedRevision:thread.data.thread.revision};
 result=await operation(command);assert.equal(result.status,200);assert.equal(result.data.message.status,'queued');assert.equal(sends,0,'Accepting a reply only saves its intent');const replyId=result.data.message.id;assert.equal((await operation(command)).data.replayed,true);
 await worker.dispatchInboxPending(env);await worker.dispatchInboxPending(env);assert.equal(sends,1,'Queue drains without duplicate sends');
 assert.equal((await webhook([], [{id:'wamid.sent-1',status:'delivered',timestamp:String(Math.floor(Date.now()/1000)),recipient_id:waId,biz_opaque_callback_data:'inbox:'+replyId}])).status,200);
 thread=await operation({operation:'inboxThread',waId});assert.equal(thread.data.messages.find(m=>m.id===replyId).deliveryStatus,'delivered');
 const audio={...incoming,id:'wamid.voice',type:'audio',audio:{id:'998877',mime_type:'audio/ogg',sha256:digest,voice:true}};delete audio.text;
 assert.equal((await webhook([audio])).status,200);assert.equal((await webhook([audio])).status,200);assert.equal(putCount,1);
 thread=await operation({operation:'inboxThread',waId});assert.equal(thread.data.messages.filter(m=>m.id===audio.id).length,1);assert.equal(thread.data.messages.find(m=>m.id===audio.id).audio.available,true);assert(!JSON.stringify(thread.data).includes('objectKey'));assert(!JSON.stringify(thread.data).includes('998877'));
 const mediaUrl=origin+'/api/whatsapp/media/'+audio.id+'?waId='+waId;
 let media=await worker.inboxMediaRoute(new Request(mediaUrl,{headers:{Cookie:cookie,Range:'bytes=0-8'}}),env);assert.equal(media.status,206);assert.equal(media.headers.get('Cache-Control'),'private, no-store');assert.equal(await media.text(),'synthetic');
 authorized=false;assert.equal((await worker.inboxMediaRoute(new Request(mediaUrl,{headers:{Cookie:cookie}}),env)).status,403);authorized=true;assert.equal((await worker.inboxMediaRoute(new Request(mediaUrl),env)).status,401);
 assert.equal(sends,1,'Inbound capture and private playback never send automatic menu replies');
 assert.equal(env.WHATSAPP_MENU_ENABLED,'false');assert.equal(env.ROSTER_AUTOMATION_ENABLED,'false');
 console.log('PASS Inbox activation: local readiness without secrets, verified authority, signed inbound persistence across fresh backend calls, duplicate suppression, queued reply single dispatch/delivery, and private voice playback. Synthetic services only.');
}finally{globalThis.fetch=nativeFetch;fs.rmSync(temp,{recursive:true,force:true});}
