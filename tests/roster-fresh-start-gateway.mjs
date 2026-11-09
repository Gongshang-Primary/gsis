import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import gateway from '../roster-update/public/_worker.js';

const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),Store=require('../shared/edge-store.js');
const db=database(),previousFetch=globalThis.fetch,origin='https://roster.gsps.edu.sg';
const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_PUBLIC_ORIGIN:origin,APPS_SCRIPT_URL:'https://script.google.com/macros/s/archive-gateway-fixture/exec',GSIS_SECRET:'fixture-bridge-secret-'.repeat(3),ROSTER_SERVICE_SECRET:'fixture-service-secret-'.repeat(3)};
const fresh={effectiveDate:'2026-11-05',sourceDigest:'a'.repeat(64),archiveId:'b'.repeat(64)},calls=[];
const importedMetadata={source:{sourceDigest:fresh.sourceDigest,manifestDigest:'c'.repeat(64)},importSession:'d'.repeat(64)};
function cookie({expires=Date.now()+3600000,sessionOrigin=origin}={}){
 const payload=JSON.stringify({purpose:'gsis-session-v1',origin:sessionOrigin,email:'teacher@gsps.edu.sg',subject:'teacher',issued:Date.now(),expires});
 return '__Host-gsis_session='+Buffer.from(payload).toString('base64url')+'.'+createHmac('sha256',env.GSIS_SECRET+'|gsis-browser-session-v1|'+sessionOrigin).update(payload).digest('hex');
}
async function send(input={view:'history'},{method='POST',requestOrigin=origin,auth=cookie(),raw}={}){
 const response=await gateway.fetch(new Request(origin+'/api/edge/archive',{method,headers:{...(requestOrigin===null?{}:{Origin:requestOrigin}),...(auth?{Cookie:auth}:{}),'Content-Type':'application/json'},...(method==='GET'?{}:{body:raw??JSON.stringify(input)})}),env,{});
 return {response,body:await response.json()};
}
try{
 for(const scope of ['roster','roster-register']){
  const store=Store.open(db,scope),head=await store.importState({state:{schema:1,revision:1,rows:[]},actor:'fixture',requestId:'fixture-'+scope});
  await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'fixture',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});
  db.sql.prepare('UPDATE gsis_edge_heads SET metadata_json=? WHERE scope=?').run(JSON.stringify({...importedMetadata,freshStart:fresh}),scope);
 }
 const before=db.sql.prepare("SELECT scope,mode,revision,metadata_json FROM gsis_edge_heads ORDER BY scope").all();
 globalThis.fetch=async(url,options)=>{
  assert.equal(String(url),env.APPS_SCRIPT_URL,'archive uses only the configured signed Google bridge');
  const envelope=JSON.parse(options.body),request=JSON.parse(envelope.payload);
  assert.equal(envelope.signature,createHmac('sha256',env.GSIS_SECRET).update(envelope.payload).digest('hex'));
  assert.equal(request.identity.email,'teacher@gsps.edu.sg');
  assert.equal(request.input.operation,'edgeArchiveRead');assert.equal(request.input.archiveId,fresh.archiveId);
  calls.push(request.input);
  if(request.input.view!=='history')return Response.json({ok:false,status:403,error:'Current Admin access required.'});
  return Response.json({ok:true,data:{history:[{id:'own',date:'2026-11-04'}],archive:{id:fresh.archiveId,throughDate:'2026-11-04',readOnly:true}}});
 };
 for(const options of [{method:'GET'},{requestOrigin:null},{requestOrigin:'https://foreign.example'}])assert.equal((await send(undefined,options)).response.status,403);
 for(const auth of ['',cookie({expires:Date.now()-1}),cookie({sessionOrigin:'https://foreign.example'}),cookie()+'tampered'])assert.equal((await send(undefined,{auth})).response.status,401);
 assert.equal((await send(undefined,{raw:'{'})).response.status,400);
 assert.equal((await send(undefined,{raw:JSON.stringify({view:'history',padding:'x'.repeat(4100)})})).response.status,413);
 for(const input of [{view:'saveOpeningBalances'},{view:'history',staffId:'another-teacher'},{view:'history',archiveId:'c'.repeat(64)},{view:'history',identity:{email:'admin@gsps.edu.sg'}}])assert.equal((await send(input)).response.status,400);
 assert.equal(calls.length,0,'invalid browser requests never reach Google');
 const read=await send();assert.equal(read.response.status,200);assert.equal(read.response.headers.get('Cache-Control'),'no-store');assert.equal(read.body.data.history[0].id,'own');assert.equal(read.body.data.archive.readOnly,true);
 assert.equal((await send({view:'statistics',from:'2026-01-01',to:'2026-11-04'})).response.status,403,'current backend roles are enforced');
 assert.equal((await send({view:'openingBalances'})).response.status,403,'teacher cannot obtain Admin prefill');
 const count=calls.length;
 db.sql.prepare("UPDATE gsis_edge_heads SET metadata_json=? WHERE scope IN ('roster','roster-register')").run(JSON.stringify(importedMetadata));
 assert.equal((await send()).response.status,409,'ordinary D1 imports are not fresh archives');assert.equal(calls.length,count);
 for(const scope of ['roster','roster-register'])db.sql.prepare('UPDATE gsis_edge_heads SET metadata_json=? WHERE scope=?').run(JSON.stringify({...importedMetadata,freshStart:fresh}),scope);
 assert.deepEqual(db.sql.prepare('SELECT scope,mode,revision,metadata_json FROM gsis_edge_heads ORDER BY scope').all(),before,'archive reads never mutate operational ownership or revisions');
 console.log('PASS actual fresh archive gateway: signed session, same-origin POST, size/schema limits, current backend roles, fixed archive identity and no operational writes');
}finally{globalThis.fetch=previousFetch;db.sql.close();}
