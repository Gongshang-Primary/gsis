import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const worker=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const env={WHATSAPP_ENABLED:'true',WHATSAPP_MENU_ENABLED:'true',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_ACCOUNT_ID:'223456789',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_ACCESS_TOKEN:'access-'.repeat(20),WHATSAPP_APP_SECRET:'app-'.repeat(20),WHATSAPP_VERIFY_TOKEN:'verify-'.repeat(20),ROSTER_SERVICE_SECRET:'service-'.repeat(20),BRIDGE_SECRET:'bridge-'.repeat(20),ROSTER_PUBLIC_ORIGIN:'https://roster.example.test',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec'};
const now=Date.now(),who={email:'smc@gsps.edu.sg',subject:'smc'},signed=await worker.sign({purpose:'gsis-session-v1',origin:env.ROSTER_PUBLIC_ORIGIN,...who,issued:now,expires:now+86400000},env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+env.ROSTER_PUBLIC_ORIGIN),cookie='__Host-gsis_session='+Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature;
const bytes=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3,4]),digest=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex'),waId='6591234567';
const image={id:'wamid.image',from:waId,timestamp:String(Math.floor(now/1000)),type:'image',image:{id:'998877',mime_type:'image/png',sha256:digest,caption:'A <b>caption</b>'}};
let retained,puts=0,downloads=0,authorized=true,badHost=false,badType=false,oversize=false;const objects=new Map();
const bucket={async head(key){const v=objects.get(key);return v?{size:v.byteLength}:null;},async put(key,value){puts++;objects.set(key,value);},async get(key){const v=objects.get(key);return v?{body:v}:null;}};
const mediaEnv={...env,WHATSAPP_INBOX_MEDIA:bucket};
globalThis.fetch=async(input,init={})=>{
 const url=new URL(input);
 if(url.hostname==='script.google.com'){
  const payload=JSON.parse(JSON.parse(init.body).payload),p=payload.input;
  if(p.operation==='inboxIngest'){retained=p.message;return Response.json({ok:true,data:{recorded:true}});}
  if(p.operation==='inboxMediaAuthorize')return Response.json(authorized?{ok:true,data:{...retained.image,message:{id:image.id,from:waId,timestamp:now,type:'image'}}}:{ok:false,status:403,error:'Denied'});
  if(p.operation==='inboxThread'){assert.equal(p.knownRevision,3);assert.equal(p.knownReadAt,now);return Response.json({ok:true,data:{unchanged:true}});}
  assert.fail('Unexpected operation '+p.operation);
 }
 assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,'Bearer '+env.WHATSAPP_ACCESS_TOKEN);
 if(url.hostname==='graph.facebook.com')return Response.json({id:'998877',mime_type:badType?'image/svg+xml':'image/png',file_size:oversize?5*1024*1024+1:bytes.length,sha256:digest,url:badHost?'https://attacker.invalid/x':'https://lookaside.fbsbx.com/x'});
 assert.equal(url.hostname,'lookaside.fbsbx.com');downloads++;return new Response(bytes,{headers:{'Content-Type':'image/png','Content-Length':String(bytes.length)}});
};
const event={object:'whatsapp_business_account',entry:[{id:env.WHATSAPP_ACCOUNT_ID,changes:[{field:'messages',value:{metadata:{phone_number_id:env.WHATSAPP_PHONE_NUMBER_ID},messages:[image]}}]}]},eventSignature=await worker.sign(event,env.WHATSAPP_APP_SECRET);
let response=await worker.whatsappWebhook(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/whatsapp/webhook',{method:'POST',headers:{'X-Hub-Signature-256':'sha256='+eventSignature.signature},body:eventSignature.payload}),mediaEnv);
assert.equal(response.status,200);assert.equal(retained.text,image.image.caption);assert.equal(retained.image.mediaId,'998877');assert.equal(downloads,0,'Webhook retains image metadata without waiting for download');
const mediaUrl=env.ROSTER_PUBLIC_ORIGIN+'/api/whatsapp/media/'+image.id+'?waId='+waId;
response=await worker.inboxMediaRoute(new Request(mediaUrl,{headers:{Cookie:cookie}}),mediaEnv);
assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(response.headers.get('Cross-Origin-Resource-Policy'),'same-origin');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);assert.equal(puts,1);
response=await worker.inboxMediaRoute(new Request(mediaUrl,{headers:{Cookie:cookie}}),mediaEnv);assert.equal(response.status,200);assert.equal(downloads,1,'Subsequent reads use stored bytes after fresh authority check');
authorized=false;assert.equal((await worker.inboxMediaRoute(new Request(mediaUrl,{headers:{Cookie:cookie}}),mediaEnv)).status,403);assert.equal(downloads,1);authorized=true;
assert.equal((await worker.inboxMediaRoute(new Request(mediaUrl),mediaEnv)).status,401);
assert.equal((await worker.inboxMediaRoute(new Request(mediaUrl,{headers:{Cookie:cookie,Origin:'https://attacker.invalid'}}),mediaEnv)).status,403);
objects.clear();const beforeRecovery=downloads;response=await worker.inboxMediaRoute(new Request(mediaUrl,{headers:{Cookie:cookie}}),mediaEnv);assert.equal(response.status,200);assert.equal(downloads,beforeRecovery+1,'Missing stored bytes are restored through fresh authorised provider retrieval');
objects.clear();const beforeParallel=downloads;await Promise.all([worker.captureInboxMedia(image,mediaEnv),worker.captureInboxMedia(image,mediaEnv)]);assert.equal(downloads-beforeParallel,1,'Concurrent viewers share one bounded media capture after their independent authority checks');
for(const mode of ['host','mime','size']){objects.clear();retained.image.objectKey='';retained.image.captureStatus='unavailable';badHost=mode==='host';badType=mode==='mime';oversize=mode==='size';const before=downloads;response=await worker.inboxMediaRoute(new Request(mediaUrl,{headers:{Cookie:cookie}}),mediaEnv);assert.notEqual(response.status,200);assert.equal(downloads,before);}
response=await worker.default.fetch(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/operations',{method:'POST',headers:{Cookie:cookie,Origin:env.ROSTER_PUBLIC_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({operation:'inboxThread',waId,knownRevision:3,knownReadAt:now})}),mediaEnv,{});assert.equal(response.status,200);
console.log('PASS Inbox images worker: quick signed metadata capture, private authorised PNG retrieval, R2 reuse, source/mime/size checks, caption retention and conditional refresh forwarding.');
