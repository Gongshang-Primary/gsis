import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import gateway from '../roster-update/public/_worker.js';
import worker from '../notification-worker/index.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),Store=require('../shared/edge-store.js'),Import=require('../shared/roster-import.js'),db=require('./helpers/chunked-import-db.cjs')(),previousFetch=globalThis.fetch;
const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',APPS_SCRIPT_URL:'https://script.google.com/macros/s/backup-fixture/exec',NOTIFICATION_DISPATCH_URL:'https://worker.gsps.edu.sg/dispatch',BRIDGE_SECRET:'b'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40),GOOGLE_CLIENT_ID:'fixture-client'},who={email:'admin@gsps.edu.sg',subject:'admin'},requestId=crypto.randomUUID(),binding={actor:who.email,requestId,sessionId:sha256Hex(JSON.stringify([who.email,requestId]))},wakes=[];
let admin=true,mirrorCalls=0,allowMirror=false;const google=require('./helpers/roster-mirror-backend.cjs')();
try{
 const frozen=Import.freeze({sourceDigest:'a'.repeat(64),state:{schema:1,revision:1,audit:[],receipts:[]},index:{schema:1,revision:1,entries:[],receipts:[]}},binding,{hash:sha256Hex}),store=Import.open(db,binding);await store.reserve();await store.bind(frozen.manifest,frozen.manifestDigest);for(let i=0;i<frozen.parts.length;i++)await store.stage(frozen.manifest.parts[i].id,frozen.parts[i]);await store.referencesReady();await store.finalize();
 for(const scope of Import.SCOPES){const authority=Store.open(db,scope),head=await authority.head();await authority.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:who.email,proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});}
 env.NOTIFICATION_QUEUE={async send(message){wakes.push(message);}};
 globalThis.fetch=async(url,options)=>{
  if(String(url)===env.NOTIFICATION_DISPATCH_URL)return worker.fetch(new Request(url,{method:'POST',body:options.body}),env);
  const input=JSON.parse(JSON.parse(options.body).payload).input;if(input.operation==='edgeReferences')return Response.json({ok:true,data:{adminVerified:admin,legacyWritesDisabled:true}});if(input.operation==='edgeMirror'){mirrorCalls++;if(allowMirror)return Response.json({ok:true,data:google.call(input)});throw Error('Pages must not run any Google mirror step');}throw Error('Unexpected operation');
 };
 const now=Date.now(),session=JSON.stringify({purpose:'gsis-session-v1',origin:env.ROSTER_PUBLIC_ORIGIN,...who,issued:now,expires:now+3600000}),signature=createHmac('sha256',env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+env.ROSTER_PUBLIC_ORIGIN).update(session).digest('hex'),cookie='__Host-gsis_session='+Buffer.from(session).toString('base64url')+'.'+signature;
 const send=async auth=>{const response=await gateway.fetch(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/edge/migration',{method:'POST',headers:{Origin:env.ROSTER_PUBLIC_ORIGIN,'Content-Type':'application/json',...(auth?{Cookie:cookie}:{})},body:JSON.stringify({operation:'mirror'})}),env);return {status:response.status,body:await response.json()};};
 assert.equal((await send(false)).status,401);admin=false;assert.equal((await send(true)).status,403);admin=true;
 const result=await send(true);assert.equal(result.status,200);assert.equal(result.body.data.queued,true);assert.equal(mirrorCalls,0);assert.equal(wakes.length,1);assert.equal(wakes[0].purpose,'gsis-roster-backup-wake-v1');assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_mirror_generations').get().n,0,'Pages never captures or leases a backup generation');
 // A failed optional wake still returns durable current status for cron recovery.
 env.NOTIFICATION_DISPATCH_URL=undefined;const fallback=await send(true);assert.equal(fallback.status,200);assert.equal(fallback.body.data.wake.mode,'scheduled');assert.equal(mirrorCalls,0);
 allowMirror=true;let ack=false,retry=false;await worker.queue({messages:[{body:wakes[0],ack(){ack=true;},retry(){retry=true;}}]},env);assert(ack);assert.equal(retry,false);assert(mirrorCalls>0,'only the Worker runs mirror I/O');
 for(const scope of Import.SCOPES)assert.equal((await Store.open(db,scope).head()).mode,'active','the backup wake never changes authority');
 console.log('PASS actual Pages Update backup: current Admin, signed dedicated wake, status only, no capture or mirror lease and cron fallback');
}finally{globalThis.fetch=previousFetch;db.sql.close();}
