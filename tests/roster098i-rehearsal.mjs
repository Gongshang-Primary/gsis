/* Real SQLite executes the shipped SQL/CAS transactions. R2 is an explicit mock, not Cloudflare. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {sampleDay,replay,validateSnapshot} from '../rehearsal-worker/domain.mjs';
const worker=(await import(process.env.REHEARSAL_TEST_BUNDLE?'../rehearsal-worker/dist/worker.mjs':'../rehearsal-worker/index.mjs')).default;

const origin='https://gsis-roster-rehearsal.test-account.workers.dev',client='synthetic-client.apps.googleusercontent.com',domain='school.example';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'synthetic-test-key',alg:'RS256',use:'sig'};
let network=[];globalThis.fetch=async(url)=>{network.push(String(url));assert.equal(String(url),'https://www.googleapis.com/oauth2/v3/certs','No provider or production network request may occur');return Response.json({keys:[jwk]});};
const b64=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
async function token(overrides={}){const now=Math.floor(Date.now()/1000),body=b64({alg:'RS256',kid:jwk.kid})+'.'+b64({iss:'https://accounts.google.com',aud:client,hd:domain,email:'operator@'+domain,email_verified:true,sub:'synthetic-google-subject',iat:now,exp:now+3600,...overrides});return body+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(body))).toString('base64url');}
const adminToken=await token();

class SQLiteD1 {
 constructor(instance){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec('PRAGMA foreign_keys=ON;'+readFileSync(new URL('../rehearsal-worker/schema.sql',import.meta.url),'utf8'));this.sqlite.prepare("INSERT INTO rehearsal_meta VALUES(1,'gsis.rehearsal.ledger',1,?,'simulation-only')").run(instance);this.sqlite.prepare('INSERT INTO rehearsal_ledger(singleton,instance_id) VALUES(1,?)').run(instance);this.failAt='';this.batches=0;}
 prepare(sql){const self=this;return {sql,values:[],bind(...values){return {...this,values};},async first(){return self.sqlite.prepare(sql).get(...this.values)||null;},async all(){return {success:true,results:self.sqlite.prepare(sql).all(...this.values)};}};}
 withSession(){return this;}
 async batch(statements){this.batches++;this.sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>{if(this.failAt&&s.sql.startsWith(this.failAt)){this.failAt='';throw Error('Injected transaction failure');}const row=this.sqlite.prepare(s.sql).run(...s.values);return {success:true,results:[],meta:{changes:Number(row.changes)}};});this.sqlite.exec('COMMIT');return results;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
 count(table){return this.sqlite.prepare('SELECT count(*) AS n FROM '+table).get().n;}
 row(){return this.sqlite.prepare('SELECT * FROM rehearsal_ledger').get();}
}
class MockR2 {
 constructor(instance){this.objects=new Map();this.puts=0;this.failPut=false;this.objects.set('rehearsal/'+instance+'/marker.json',{bytes:new TextEncoder().encode(JSON.stringify({schema:'gsis.rehearsal.bucket',version:1,instanceId:instance,mode:'simulation-only'})),customMetadata:{}});}
 object(key){const value=this.objects.get(key);return value?{key,size:value.bytes.byteLength,customMetadata:{...value.customMetadata},body:new Blob([value.bytes]).stream()}:null;}
 async get(key){return this.object(key);}
 async head(key){return this.object(key);}
 async put(key,bytes,options){this.puts++;if(this.failPut)throw Error('Injected R2 failure');assert.deepEqual(options.onlyIf,{etagDoesNotMatch:'*'});if(this.objects.has(key))return null;this.objects.set(key,{bytes:new Uint8Array(bytes),customMetadata:{...options.customMetadata}});return this.object(key);}
}
function fixture(instance='rehearsal-synthetic-test'){
 const env={REHEARSAL_MODE:'simulation-only',REHEARSAL_INSTANCE_ID:instance,REHEARSAL_ORIGIN:origin,REHEARSAL_GOOGLE_CLIENT_ID:client,REHEARSAL_SCHOOL_DOMAIN:domain,REHEARSAL_ADMIN_EMAILS:'operator@'+domain,REHEARSAL_LEDGER:new SQLiteD1(instance),REHEARSAL_TIMETABLES:new MockR2(instance)};
 async function call(path,body={},options={}){const request=new Request((options.origin||origin)+path,{method:options.method||'POST',headers:{Origin:options.requestOrigin||origin,'Content-Type':'application/json',...(options.auth===false?{}:{Authorization:'Bearer '+(options.token||adminToken)}),...(options.headers||{})},...(options.method==='GET'?{}:{body:JSON.stringify(body)})});const response=await worker.fetch(request,env);return {status:response.status,data:await response.json()};}
 return {env,call,write:(command,id='request-seed-0001',revision=0)=>call('/api/command',{requestId:id,expectedRevision:revision,command})};
}
const seed={operation:'seedSynthetic',date:'2026-10-27'};

await test('fails closed for configuration, token signature/claims, allowlist and origin; login never includes controls',async()=>{
 const f=fixture();for(const [options,status] of [[{auth:false},401],[{token:await token({email:'teacher@'+domain})},403],[{token:await token({hd:'other.example'})},401],[{token:await token({email_verified:false})},401],[{token:await token({aud:'other-client'})},401],[{token:await token({exp:0})},401],[{token:adminToken.slice(0,-5)+'bogus'},401],[{requestOrigin:'https://evil.example'},403],[{headers:{'Sec-Fetch-Site':'cross-site'}},403]]){assert.equal((await f.call('/api/state',{},options)).status,status);}
 assert.equal(f.env.REHEARSAL_LEDGER.batches,0);assert.equal(f.env.REHEARSAL_TIMETABLES.puts,0);
 f.env.GSIS_JOBS={};assert.equal((await f.call('/api/state')).data.error,'UNSAFE_CONFIGURATION');delete f.env.GSIS_JOBS;
 f.env.REHEARSAL_ADMIN_EMAILS='';assert.equal((await f.call('/api/state')).status,503);f.env.REHEARSAL_ADMIN_EMAILS='operator@'+domain;
 const response=await worker.fetch(new Request(origin+'/'),f.env),html=await response.text();assert.equal(response.status,200);assert(html.includes('SIMULATION ONLY'));assert(!html.includes('id="seed"'));assert(!html.includes('id="import"'));assert(response.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));
 assert.equal((await f.call('/api/ui',{}, {auth:false})).status,401);assert((await f.call('/api/ui')).data.html.includes('id="seed"'));
});
await test('dedicated schema and bucket markers reject swapped live bindings',async()=>{
 const f=fixture();f.env.REHEARSAL_LEDGER.sqlite.prepare("UPDATE rehearsal_meta SET instance_id='wrong-instance'").run();assert.equal((await f.call('/api/health')).data.error,'BINDING_CHECK_FAILED');
 const g=fixture();g.env.REHEARSAL_TIMETABLES.objects.clear();assert.equal((await g.call('/api/health')).status,503);
 const h=fixture();h.env.REHEARSAL_LEDGER.sqlite.exec('DROP TABLE rehearsal_meta');assert.equal((await h.call('/api/health')).status,503);
});
await test('synthetic school day persists shared absence/manual/automatic allocation, gzip readback and simulated intents',async()=>{
 const f=fixture();assert.equal((await f.call('/api/health')).data.persistenceProof.verified,false);
 let r=await f.write(seed);assert.equal(r.status,200);assert.equal(r.data.revision,1);
 r=await f.write({operation:'saveAbsence',staffId:'alice',periods:[2,3,4,5,6]},'request-absence-0002',1);assert.equal(r.status,200);assert.equal(r.data.projection.demands.length,5);const demands=r.data.projection.demands;
 r=await f.write({operation:'assign',staffId:'bob',demandIds:[demands[0].id]},'request-manual-0003',2);assert.equal(r.status,200);assert.equal(r.data.projection.assignments[0].staffId,'bob');
 r=await f.write({operation:'autoAllocate'},'request-auto-0004',3);assert.equal(r.status,200);assert.equal(r.data.result.paused,undefined);assert.equal(r.data.projection.assignments.length,5);assert.equal(r.data.projection.assignments.find(a=>a.demandId===demands[0].id).origin,'smc');const form=r.data.projection.assignments.filter(a=>[5,6].includes(a.period));assert.equal(form[0].staffId,form[1].staffId);
 const timetable=await f.call('/api/timetable/read');assert.equal(timetable.status,200);assert.deepEqual(timetable.data.timetable.day,sampleDay(seed.date));
 const health=await f.call('/api/health');assert.equal(health.data.persistenceProof.verified,true);assert.equal(health.data.persistenceProof.revision,4);
 const state=await f.call('/api/state');assert.equal(state.data.intents.length,4);assert(state.data.intents.every(j=>j.status==='simulated'&&j.detail.delivery==='never-sent'));assert.equal(f.env.REHEARSAL_LEDGER.count('rehearsal_receipts'),4);assert.equal(f.env.REHEARSAL_LEDGER.count('rehearsal_timetable_versions'),4);
 assert(network.every(u=>u==='https://www.googleapis.com/oauth2/v3/certs'));
});
await test('lost response exact retry and concurrent duplicate identities have one receipt/revision/outbox',async()=>{
 const f=fixture();await f.write(seed);const repeated=await f.write(seed);assert.equal(repeated.data.replayed,true);assert.equal(repeated.data.revision,1);assert.equal(f.env.REHEARSAL_LEDGER.row().revision,1);
 assert.equal((await f.write({...seed,date:'2026-10-28'})).data.error,'REQUEST_ID_CONFLICT');
 const body={operation:'saveAbsence',staffId:'alice',periods:[2,3]},results=await Promise.all([f.write(body,'concurrent-same-identity',1),f.write(body,'concurrent-same-identity',1)]);assert(results.every(r=>r.status===200));assert.equal(f.env.REHEARSAL_LEDGER.row().revision,2);assert.equal(f.env.REHEARSAL_LEDGER.count('rehearsal_receipts'),2);assert.equal(f.env.REHEARSAL_LEDGER.count('rehearsal_outbox'),2);
 assert.equal((await f.write({operation:'simulateNotifications'},'new-stale-identity',1)).data.error,'STALE_REVISION');assert.equal(f.env.REHEARSAL_LEDGER.row().revision,2);
});
await test('concurrent timetable CAS has one winner; immutable orphan is retained; atomic failure never advances pointer',async()=>{
 const f=fixture();await f.write(seed);const a=sampleDay(seed.date),b=sampleDay(seed.date);a.teachers[0].cells[2][2]='Demo-A';b.teachers[0].cells[2][2]='Demo-B';
 const result=await Promise.all([f.write({operation:'saveTimetable',day:a},'race-timetable-alpha',1),f.write({operation:'saveTimetable',day:b},'race-timetable-bravo',1)]);assert.deepEqual(result.map(r=>r.status).sort(),[200,409]);assert.equal(f.env.REHEARSAL_LEDGER.row().revision,2);assert.equal(f.env.REHEARSAL_LEDGER.count('rehearsal_receipts'),2);assert.equal(f.env.REHEARSAL_TIMETABLES.objects.size,4,'marker + original + both contenders, including retained orphan');assert.equal((await f.call('/api/health')).data.persistenceProof.verified,true);
 const old=f.env.REHEARSAL_LEDGER.row();f.env.REHEARSAL_LEDGER.failAt='INSERT INTO rehearsal_outbox';const changed=sampleDay(seed.date);changed.teachers[0].cells[2][2]='Demo-C';let r=await f.write({operation:'saveTimetable',day:changed},'atomic-failure-identity',2);assert.equal(r.status,503);assert.equal(r.data.error,'WRITE_UNCERTAIN');assert.equal(f.env.REHEARSAL_LEDGER.row().timetable_key,old.timetable_key);assert.equal(f.env.REHEARSAL_LEDGER.count('rehearsal_receipts'),2);assert.equal(f.env.REHEARSAL_LEDGER.count('rehearsal_outbox'),2);
 r=await f.write({operation:'saveTimetable',day:changed},'atomic-failure-identity',2);assert.equal(r.status,200);assert.equal(r.data.revision,3);assert.equal((await f.call('/api/timetable/read')).data.timetable.day.teachers[0].cells[2][2],'Demo-C');
 const g=fixture();g.env.REHEARSAL_TIMETABLES.failPut=true;assert.equal((await g.write(seed)).status,503);assert.equal(g.env.REHEARSAL_LEDGER.row().revision,0);assert.equal(g.env.REHEARSAL_LEDGER.count('rehearsal_receipts'),0);
});
await test('versioned synthetic snapshot roundtrip preserves complete supported journal; raw state/fields refused',async()=>{
 const f=fixture();await f.write(seed);await f.write({operation:'saveAbsence',staffId:'alice',periods:[2,3]},'snapshot-absence-id',1);await f.write({operation:'autoAllocate'},'snapshot-auto-id',2);const snapshot=(await f.call('/api/snapshot/export')).data;
 const g=fixture('rehearsal-other-instance');let r=await g.call('/api/snapshot/import',{requestId:'snapshot-import-id',expectedRevision:0,snapshot});assert.equal(r.status,200);const exported=(await g.call('/api/snapshot/export')).data;assert.deepEqual(exported.dataset,snapshot.dataset);assert.equal(exported.source.instanceId,'rehearsal-other-instance');assert.deepEqual((await g.call('/api/timetable/read')).data.timetable.day,(await f.call('/api/timetable/read')).data.timetable.day);
 const before=g.env.REHEARSAL_LEDGER.row().revision;
 for(const bad of [{schema:1,revision:0,absences:[]},{...snapshot,keys:{provider:'forbidden'}},{...snapshot,version:2},{...snapshot,source:{...snapshot.source,instanceId:''}},{...snapshot,dataset:{...snapshot.dataset,nativeState:{}}},{...snapshot,dataset:{...snapshot.dataset,journal:[{requestId:'bad-journal-id',command:{operation:'publish'}}]}}]){r=await g.call('/api/snapshot/import',{requestId:'refused-snapshot-'+crypto.randomUUID(),expectedRevision:before,snapshot:bad});assert.equal(r.status,400);assert.match(r.data.message,/unsupported|exactly|supported|invalid/i);}
 assert.equal(g.env.REHEARSAL_LEDGER.row().revision,before);
 assert.throws(()=>validateSnapshot({...snapshot,dataset:{...snapshot.dataset,journal:[...snapshot.dataset.journal,snapshot.dataset.journal[0]]}}),/unique/);
});
await test('effective timetable removal or subject change reconciles shared manual cover before persistence and snapshot replay',async()=>{
 for(const remove of [true,false]){
  const f=fixture();await f.write(seed);let r=await f.write({operation:'saveAbsence',staffId:'alice',periods:[2]},'reconcile-absence-id',1);const demandId=r.data.projection.demands[0].id;await f.write({operation:'assign',staffId:'bob',demandIds:[demandId]},'reconcile-manual-id',2);
  const day=sampleDay(seed.date);day.teachers[0].cells[2]=remove?['','','','']:['MA','4A','Demo-01',''];
  r=await f.write({operation:'saveTimetable',day},'reconcile-timetable-id',3);assert.equal(r.status,200);assert.equal(r.data.projection.assignments.length,0,'obsolete EL duty is not active');assert.equal(r.data.projection.demands.length,remove?0:1);if(!remove)assert.equal(r.data.projection.demands[0].subject,'MA');
  assert.equal((await f.call('/api/state')).data.projection.assignments.length,0);assert.deepEqual((await f.call('/api/timetable/read')).data.timetable.day,day);assert.equal((await f.call('/api/health')).data.persistenceProof.verified,true);
  const snapshot=(await f.call('/api/snapshot/export')).data,g=fixture('rehearsal-reconcile-import');r=await g.call('/api/snapshot/import',{requestId:'reconcile-import-id',expectedRevision:0,snapshot});assert.equal(r.status,200);assert.equal(r.data.projection.assignments.length,0);assert.deepEqual((await g.call('/api/snapshot/export')).data.dataset,snapshot.dataset);
 }
});
await test('bounds, unsupported endpoints, corrupted gzip and false receipt proof fail closed',async()=>{
 const f=fixture();assert.equal((await f.call('/api/activate')).status,404);assert.equal((await f.call('/api/scheduled')).status,404);assert.deepEqual(Object.keys(worker),['fetch']);assert.equal((await f.call('/api/state?bucket=production')).status,400);
 assert.equal((await f.write({operation:'seedSynthetic',date:'2026-10-27',role:'admin'})).status,400);
 assert.equal((await f.write({operation:'saveAbsence',staffId:'alice',periods:[2]})).data.error,'SEED_REQUIRED');
 const tooMany={schema:'gsis.rehearsal.dataset',version:1,seed:{kind:'synthetic-school-day-v1',date:seed.date},journal:Array.from({length:101},(_,i)=>({requestId:'limit-request-'+i,command:{operation:'simulateNotifications'}}))};assert.throws(()=>replay(tooMany),/100/);
 await f.write(seed);const key=f.env.REHEARSAL_LEDGER.row().timetable_key;f.env.REHEARSAL_TIMETABLES.objects.get(key).bytes=new TextEncoder().encode('not-gzip');assert.equal((await f.call('/api/timetable/read')).data.error,'TIMETABLE_INVALID');
 const g=fixture();await g.write(seed);g.env.REHEARSAL_LEDGER.sqlite.exec('DELETE FROM rehearsal_outbox');assert.equal((await g.call('/api/health')).data.error,'PERSISTENCE_PROOF_FAILED');
 const oversized='x'.repeat(524289),response=await worker.fetch(new Request(origin+'/api/command',{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+adminToken,'Content-Type':'application/json'},body:oversized}),g.env);assert.equal(response.status,413);
});
await test('admin browser UI performs sign-in, absence/manual/automatic, gzip save/read, retry, stale refusal and snapshot import',async()=>{
 const f=fixture();const html=await (await worker.fetch(new Request(origin+'/'),f.env)).text();let signIn;
 const dom=new JSDOM(html,{url:origin,runScripts:'dangerously',beforeParse(window){
  Object.defineProperty(window,'crypto',{value:crypto});const NativeDate=window.Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-26T20:00:00Z']));}static now(){return Date.parse('2026-10-26T20:00:00Z');}};window.google={accounts:{id:{initialize(settings){signIn=settings.callback;},renderButton(){}}}};
  window.fetch=(path,options)=>worker.fetch(new Request(origin+path,{...options,headers:{...options.headers,Origin:origin}}),f.env);
 }});
 const w=dom.window,d=w.document;await new Promise(resolve=>w.addEventListener('load',resolve,{once:true}));assert(signIn);assert.equal(d.getElementById('seed'),null);
 await signIn({credential:adminToken});assert(d.getElementById('identity').textContent.includes('operator@'+domain));assert.equal(d.getElementById('date').value,'2026-10-27','initial school date follows Singapore before UTC midnight');d.getElementById('date').value=seed.date;
 const click=async id=>{await d.getElementById(id).onclick();assert(!d.getElementById('message').dataset.error.includes('true'),d.getElementById('message').textContent);};
 await click('seed');assert.equal(f.env.REHEARSAL_LEDGER.row().revision,1);await click('absence');const boxes=[...d.querySelectorAll('[name=demand]')];assert.equal(boxes.length,5);boxes.forEach((box,i)=>box.checked=i===0);await click('assign');await click('auto');assert.equal(JSON.parse(d.getElementById('output').textContent).projection.assignments.length,5);
 await click('readTimetable');const day=JSON.parse(d.getElementById('timetable').value);day.teachers[0].cells[2][2]='Demo-UI';d.getElementById('timetable').value=JSON.stringify(day);await click('saveTimetable');const revision=f.env.REHEARSAL_LEDGER.row().revision;await click('retry');assert.equal(f.env.REHEARSAL_LEDGER.row().revision,revision);assert(d.getElementById('message').textContent.includes('original durable receipt'));
 await click('readTimetable');assert.equal(JSON.parse(d.getElementById('timetable').value).teachers[0].cells[2][2],'Demo-UI');
 await d.getElementById('stale').onclick();assert(d.getElementById('message').textContent.includes('STALE_REVISION'));assert.equal(f.env.REHEARSAL_LEDGER.row().revision,revision);
 await click('refresh');const snapshot=(await f.call('/api/snapshot/export')).data;d.getElementById('snapshot').value=JSON.stringify(snapshot);await click('import');await click('health');assert.equal(JSON.parse(d.getElementById('output').textContent).persistenceProof.verified,true);dom.window.close();
});
