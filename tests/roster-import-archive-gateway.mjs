import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import gateway from '../roster-update/public/_worker.js';
const require=createRequire(import.meta.url),Import=require('../shared/roster-import.js'),database=require('./helpers/chunked-import-db.cjs'),db=database(),original=globalThis.fetch,objects=new Map();
const env={GSIS_JOBS:db,ROSTER_D1_PREPARE:'import',ROSTER_EDGE_AUTHORITY:'legacy',ROSTER_PUBLIC_ORIGIN:'https://roster.gsps.edu.sg',APPS_SCRIPT_URL:'https://script.google.com/macros/s/archive-fixture/exec',GSIS_SECRET:'b'.repeat(40),ROSTER_SERVICE_SECRET:'s'.repeat(40),ROSTER_TIMETABLE_SNAPSHOTS:{async put(key,value){objects.set(key,Buffer.from(value));},async get(key){const bytes=objects.get(key);return bytes?{size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}:null;}}};
const now=Date.now(),session=JSON.stringify({purpose:'gsis-session-v1',origin:env.ROSTER_PUBLIC_ORIGIN,email:'admin@gsps.edu.sg',subject:'fixture-admin',issued:now,expires:now+3600000}),signature=createHmac('sha256',env.GSIS_SECRET+'|gsis-browser-session-v1|'+env.ROSTER_PUBLIC_ORIGIN).update(session).digest('hex'),cookie='__Host-gsis_session='+Buffer.from(session).toString('base64url')+'.'+signature;
let admin=false;
const send=async(input={operation:'archiveImports'},signed=true)=>{const response=await gateway.fetch(new Request(env.ROSTER_PUBLIC_ORIGIN+'/api/edge/migration',{method:'POST',headers:{Origin:env.ROSTER_PUBLIC_ORIGIN,'Content-Type':'application/json',...(signed?{Cookie:cookie}:{})},body:JSON.stringify(input)}),env);return {status:response.status,body:await response.json()};};
try{
 await Import.ensure(db);for(let i=0;i<8;i++)db.sql.prepare("INSERT INTO gsis_roster_import_sessions(session_id,actor,request_id,state,created_at,updated_at) VALUES(?,?,?,'abandoned',?,?)").run(String(i+1).repeat(64),'old@fixture.test','old-'+i,i,i);
 globalThis.fetch=async(_,options)=>{const input=JSON.parse(JSON.parse(options.body).payload).input;assert.equal(input.operation,'edgeReferences');return Response.json({ok:true,data:{adminVerified:admin}});};
 assert.equal((await send(undefined,false)).status,401,'archive requires a signed-in browser');assert.equal((await send()).status,403,'archive requires fresh current Admin proof');admin=true;
 const before=db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_sessions').get().n;await send({operation:'import',requestId:'automatic-archive-import'});assert(objects.size>0,'a new import automatically advances verified archival');assert.equal(db.sql.prepare('SELECT COUNT(*) n FROM gsis_roster_import_sessions').get().n,before+1,'bounded automatic copying permits admission without deleting unverified records');
 for(let i=0;i<100;i++){const result=await send();assert.equal(result.status,200);if(!result.body.data.pending)break;if(i===99)assert.fail('Admin archive did not finish');}
 assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM gsis_roster_import_sessions WHERE state='abandoned'").get().n,1,'new import is protected among the newest two');assert.equal((await send({operation:'archiveImports',sessionId:'arbitrary'})).status,400,'Admin cannot select a protected session for deletion');
 console.log('PASS actual Pages archive route: preparation access, current Admin, bounded automatic copying, protected sessions and no caller-selected deletion');
}finally{globalThis.fetch=original;db.sql.close();}
