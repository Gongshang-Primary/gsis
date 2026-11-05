/* Real SQLite transactions and explicit mock R2; not a Cloudflare-runtime claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyGoogleToken} from '../timetable-prep-worker/auth.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import Roster from '../shared/roster.js';
import Stapler from '../shared/roster-stapler.js';
import {stable,hash,baselineProjection,suspendedProjection} from '../timetable-prep-worker/domain.mjs';
const worker=(await import(process.env.TIMETABLE_PREP_TEST_BUNDLE?'../timetable-prep-worker/dist/worker.mjs':'../timetable-prep-worker/index.mjs')).default;
const client='prep-test.apps.googleusercontent.com',domain='school.example';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'prep-test-key',alg:'RS256',use:'sig'};
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function token(overrides={}){const now=Math.floor(Date.now()/1000),body=b64({alg:'RS256',kid:jwk.kid})+'.'+b64({iss:'https://accounts.google.com',aud:client,hd:domain,email:'operator@'+domain,email_verified:true,sub:'prep-test-subject',iat:now,exp:now+3600,...overrides});return body+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(body))).toString('base64url');}
const config={client,domain,admins:new Set(['operator@'+domain])};
await test('server key fetch uses Cloudflare-supported manual redirects and fails closed on 3xx',async()=>{
 let calls=0;globalThis.fetch=async(url,options)=>{calls++;assert.equal(String(url),'https://www.googleapis.com/oauth2/v3/certs');assert.equal(options.redirect,'manual');if(calls===1)return new Response('',{status:302,headers:{Location:'https://untrusted.example'}});return Response.json({keys:[jwk]});};
 await assert.rejects(verifyGoogleToken(await token(),config),e=>e.code==='IDENTITY_UNAVAILABLE');
 assert.equal((await verifyGoogleToken(await token(),config)).email,'operator@'+domain);assert.equal(calls,2);
 await assert.rejects(verifyGoogleToken(await token({email:'other@'+domain}),config),e=>e.status===403);
});
const adminToken=await token(),origin='https://gsis-roster-rehearsal.prep-account.workers.dev';
class SQLiteD1{
 constructor(instance){this.sqlite=new DatabaseSync(':memory:');this.sqlite.exec('PRAGMA foreign_keys=ON;'+readFileSync(new URL('../rehearsal-worker/schema.sql',import.meta.url),'utf8'));this.sqlite.prepare("INSERT INTO rehearsal_meta VALUES(1,'gsis.rehearsal.ledger',1,?,'simulation-only')").run(instance);this.sqlite.prepare('INSERT INTO rehearsal_ledger(singleton,instance_id) VALUES(1,?)').run(instance);this.sqlite.exec(readFileSync(new URL('../timetable-prep-worker/schema.sql',import.meta.url),'utf8'));this.failAt='';this.batches=0;}
 prepare(sql){const owner=this;return {sql,values:[],bind(...values){return {...this,values};},async first(){return owner.sqlite.prepare(sql).get(...this.values)||null;},async all(){return {success:true,results:owner.sqlite.prepare(sql).all(...this.values)};}};}
 withSession(){return this;}
 async batch(statements){this.batches++;this.sqlite.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>{if(this.failAt&&s.sql.startsWith(this.failAt)){this.failAt='';throw Error('Injected D1 failure');}const r=this.sqlite.prepare(s.sql).run(...s.values);return {success:true,meta:{changes:Number(r.changes)}};});this.sqlite.exec('COMMIT');return results;}catch(e){this.sqlite.exec('ROLLBACK');throw e;}}
 row(){return this.sqlite.prepare('SELECT * FROM gsis_ttprep_heads').get();}
 count(table){return this.sqlite.prepare('SELECT count(*) AS n FROM '+table).get().n;}
}
class MockR2{
 constructor(instance){this.objects=new Map();this.writes=0;this.fail=false;this.corrupt=false;this.objects.set('rehearsal/'+instance+'/marker.json',{bytes:new TextEncoder().encode(JSON.stringify({schema:'gsis.rehearsal.bucket',version:1,instanceId:instance,mode:'simulation-only'})),customMetadata:{}});}
 object(key){const value=this.objects.get(key);return value?{key,size:value.bytes.length,customMetadata:{...value.customMetadata},body:new Blob([value.bytes]).stream()}:null;}
 async get(key){return this.object(key);}
 async head(key){return this.object(key);}
 async put(key,bytes,options){assert.match(key,/^rehearsal\/[-a-z0-9]+\/timetable-preparation\/v1\//);assert.deepEqual(options.onlyIf,{etagDoesNotMatch:'*'});if(this.fail)throw Error('Injected R2 failure');if(this.objects.has(key))return null;this.writes++;this.objects.set(key,{bytes:this.corrupt?new TextEncoder().encode('corrupted-gzip'):new Uint8Array(bytes),customMetadata:{...options.customMetadata}});return this.object(key);}
}
function fixture(instance='prep-synthetic-instance'){
 const env={REHEARSAL_MODE:'simulation-only',REHEARSAL_INSTANCE_ID:instance,REHEARSAL_ORIGIN:origin,REHEARSAL_GOOGLE_CLIENT_ID:client,REHEARSAL_SCHOOL_DOMAIN:domain,REHEARSAL_ADMIN_EMAILS:'operator@'+domain,REHEARSAL_LEDGER:new SQLiteD1(instance),REHEARSAL_TIMETABLES:new MockR2(instance)};
 const originalLedger=JSON.stringify(env.REHEARSAL_LEDGER.sqlite.prepare('SELECT * FROM rehearsal_ledger').get());
 async function call(path,body={},options={}){const response=await worker.fetch(new Request((options.origin||origin)+path,{method:options.method||'POST',headers:{Origin:options.requestOrigin||origin,'Content-Type':'application/json',...(options.auth===false?{}:{Authorization:'Bearer '+(options.token||adminToken)}),...(options.headers||{})},...(options.method==='GET'?{}:{body:JSON.stringify(body)})}),env);return {status:response.status,data:await response.json()};}
 const untouched=()=>{assert.equal(JSON.stringify(env.REHEARSAL_LEDGER.sqlite.prepare('SELECT * FROM rehearsal_ledger').get()),originalLedger);for(const table of ['rehearsal_receipts','rehearsal_outbox','rehearsal_timetable_versions'])assert.equal(env.REHEARSAL_LEDGER.count(table),0);};
 return {env,call,untouched};
}
async function sampleBundle(venue='Room 1',layout='single-week'){
 const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:4,maxPeriod:3,blocks:[{name:'Teacher A',cells:Array.from({length:20},(_,i)=>i===0?['EL','3A',venue,'']:['','','',''])}]};
 const model=Roster.validate({layoutMode:layout,...(layout==='single-week'?{single:week}:{odd:week,even:{...week,blocks:week.blocks.map(t=>({...t,cells:t.cells.map((c,i)=>i===1?['MA','3A','Even Room','']:c)}))}}),timing:{startMinutes:450,periodMinutes:30,normalLastPeriod:3,endOfDayMinutes:570},recesses:[]});
 const keys=model.layoutMode==='single-week'?['single']:['odd','even'],expectedProjectionHashes={};for(const key of keys){expectedProjectionHashes[key]=[];for(let i=0;i<5;i++)expectedProjectionHashes[key].push(await hash(stable(baselineProjection(model,key,i))));}
 const baseline={schema:'gsis.timetable.preparation.baseline',version:1,id:'baseA',entry:{id:'baseA',name:'Current baseline',from:'2026-10-28',to:'2026-11-27',priority:1},model,expectedProjectionHashes};
 const plan=Stapler.create({date:'2026-10-29',id:'historical-plan-base',parity:'odd',periods:Array.from({length:4},(_,period)=>({period,startMinutes:450+period*30,endMinutes:480+period*30})),endOfDayMinutes:570,teachers:[{staffId:'a',name:'Teacher A',timetableName:'Teacher A',cells:[['EL','3A','Confirmed Room',''],['','','',''],['','','',''],['','','','']]}],formClasses:[],recesses:[]});plan.warnings=[];delete plan.daySnapshot; // Match the preparation exporter: captured private day metadata is not part of this wire format.
 const suspended={schema:'gsis.timetable.preparation.suspended',version:1,date:plan.date,name:'Confirmed independently',baselineId:plan.baselineId,revision:plan.revision,confirmedAt:'2026-10-20T00:00:00.000Z',independentBaseline:true,plan,expectedProjectionHash:await hash(stable(suspendedProjection(plan)))};
 const native=[baseline,suspended],parts=[];for(const value of native){const data=stable(value);parts.push({schema:'gsis.timetable.preparation.part',version:1,sourceKey:'',id:value===baseline?'baseline:baseA':'suspended:'+plan.date,kind:value===baseline?'baseline':'suspended',sha256:await hash(data),bytes:Buffer.byteLength(data),data});}
 const manifest={schema:'gsis.timetable.preparation.manifest',version:1,release:'0.9.8o',mode:'shadow-only',capturedAt:'2026-10-28T01:00:00.000Z',from:'2026-10-28',to:'2026-11-27',timeZone:'Asia/Singapore',calendar:{status:'not-exported',verified:false},baselineMap:Array.from({length:31},(_,i)=>({date:new Date(Date.parse('2026-10-28T00:00:00Z')+i*86400000).toISOString().slice(0,10),baselineId:'baseA'})),parts:parts.map(({id,kind,sha256,bytes})=>({id,kind,sha256,bytes})),sourceKey:''};
 manifest.sourceKey=await hash(stable({schema:'gsis.timetable.preparation.source',version:1,from:manifest.from,to:manifest.to,baselineMap:manifest.baselineMap,parts:manifest.parts}));parts.forEach(p=>p.sourceKey=manifest.sourceKey);
 return {schema:'gsis.timetable.preparation.bundle',version:1,manifest,parts,sourceCheck:{schema:'gsis.timetable.preparation.check',version:1,sourceKey:manifest.sourceKey,checkedAt:'2026-10-28T01:01:00.000Z',unchanged:true,readOnly:true,calendarVerified:false}};
}
async function uploadAll(f,bundle){for(const part of bundle.parts){const result=await f.call('/api/prep/part',{part});assert.equal(result.status,200,JSON.stringify(result.data));}}
function command(bundle,id='prep-import-identity',expectedRevision=0){return {requestId:id,expectedRevision,manifest:bundle.manifest,sourceCheck:bundle.sourceCheck};}
async function reseal(bundle){bundle.manifest.parts=bundle.parts.map(({id,kind,sha256,bytes})=>({id,kind,sha256,bytes}));bundle.manifest.sourceKey=await hash(stable({schema:'gsis.timetable.preparation.source',version:1,from:bundle.manifest.from,to:bundle.manifest.to,baselineMap:bundle.manifest.baselineMap,parts:bundle.manifest.parts}));bundle.parts.forEach(p=>p.sourceKey=bundle.manifest.sourceKey);bundle.sourceCheck.sourceKey=bundle.manifest.sourceKey;return bundle;}

await test('admin authentication, configuration and storage markers fail closed; schema is additive/idempotent',async()=>{
 const f=fixture();for(const [options,status] of [[{auth:false},401],[{token:await token({iss:'https://evil.example'})},401],[{token:await token({aud:'wrong'})},401],[{token:await token({hd:'wrong.example'})},401],[{token:await token({email_verified:false})},401],[{token:await token({email:'teacher@'+domain})},403],[{token:adminToken.slice(0,-6)+'bogus'},401],[{requestOrigin:'https://evil.example'},403],[{headers:{'Sec-Fetch-Site':'cross-site'}},403]])assert.equal((await f.call('/api/prep/state',{},options)).status,status);
 f.env.REHEARSAL_LEDGER.sqlite.exec(readFileSync(new URL('../timetable-prep-worker/schema.sql',import.meta.url),'utf8'));assert.equal((await f.call('/api/prep/state')).status,200);f.untouched();
 f.env.GSIS_SECRET='not-permitted';assert.equal((await f.call('/api/prep/state')).data.code,'UNSAFE_CONFIGURATION');delete f.env.GSIS_SECRET;
 f.env.REHEARSAL_LEDGER.sqlite.exec("UPDATE rehearsal_meta SET instance_id='wrong-instance'");assert.equal((await f.call('/api/prep/state')).data.code,'BINDING_CHECK_FAILED');assert.equal(f.env.REHEARSAL_TIMETABLES.writes,0);
 const g=fixture();g.env.REHEARSAL_TIMETABLES.objects.clear();assert.equal((await g.call('/api/prep/state')).status,503);
 assert.deepEqual(Object.keys(worker),['fetch']);assert.equal((await g.call('/api/activate')).status,404);
});
await test('native baseline odd/even and independent confirmed timetables persist as per-date verified gzip pointers',async()=>{
 const f=fixture(),bundle=await sampleBundle('Room 1','odd-even');await uploadAll(f,bundle);const r=await f.call('/api/prep/commit',command(bundle));assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.revision,1);assert.equal(r.data.productionAuthority,'google');assert.equal(r.data.sourceFreshness,'not-independently-verified');assert.equal(r.data.comparison.projectionHashesVerified,11);
 const state=await f.call('/api/prep/state');assert.equal(state.data.snapshot.dates.length,31);assert.equal(f.env.REHEARSAL_LEDGER.count('gsis_ttprep_receipts'),1);assert.equal(f.env.REHEARSAL_LEDGER.count('gsis_ttprep_versions'),1);
 const base=await f.call('/api/prep/read',{date:'2026-10-28',kind:'baseline'});assert.equal(base.data.timetable.candidates.length,2);assert.equal(base.data.timetable.calendarVerified,false);
 const suspended=await f.call('/api/prep/read',{date:'2026-10-29',kind:'suspended'});assert.equal(suspended.data.timetable.projection.baselineId,'stapler:2026-10-29');assert.equal(suspended.data.timetable.projection.teachers[0].cells[0][2],'Confirmed Room');assert.equal(suspended.data.timetable.independentBaseline,true);
 assert.equal((await f.call('/api/prep/read',{date:'2026-10-31',kind:'baseline'})).data.timetable.candidates.length,0);f.untouched();
});
await test('current runtime imports the preserved O wire contract without rewriting snapshot identity',async()=>{
 const f=fixture(),bundle=await sampleBundle();
 const before=await f.call('/api/prep/state');assert.equal(before.data.release,'0.9.9');assert.equal(before.data.protocolRelease,'0.9.8o');
 await uploadAll(f,bundle);const body=command(bundle,'preserved-o-contract');assert.equal((await f.call('/api/prep/commit',body)).status,200);
 const state=await f.call('/api/prep/state');assert.equal(state.data.snapshot.manifest.release,'0.9.8o');assert.equal(state.data.productionAuthority,'google');assert.equal(state.data.sourceFreshness,'not-independently-verified');
 assert.equal((await f.call('/api/prep/commit',body)).data.replayed,true);
 const renamed=structuredClone(bundle);renamed.manifest.release='0.9.9';assert.equal((await f.call('/api/prep/commit',command(renamed,'unsupported-wire-rename',1))).data.code,'UNSUPPORTED_SCHEMA');
 assert.equal(f.env.REHEARSAL_LEDGER.row().revision,1);f.untouched();
});
await test('exact commit retry is idempotent; unchanged source keeps revision and reuses immutable compressed content',async()=>{
 const f=fixture(),bundle=await sampleBundle();await uploadAll(f,bundle);const body=command(bundle);let r=await f.call('/api/prep/commit',body);assert.equal(r.status,200);const writes=f.env.REHEARSAL_TIMETABLES.writes;
 r=await f.call('/api/prep/commit',body);assert.equal(r.data.replayed,true);assert.equal(f.env.REHEARSAL_TIMETABLES.writes,writes);
 r=await f.call('/api/prep/commit',command(bundle,'unchanged-new-request',1));assert.equal(r.status,200);assert.equal(r.data.noChange,true);assert.equal(r.data.revision,1);assert.equal(f.env.REHEARSAL_TIMETABLES.writes,writes);assert.equal(f.env.REHEARSAL_LEDGER.count('gsis_ttprep_receipts'),2);assert.equal(f.env.REHEARSAL_LEDGER.count('gsis_ttprep_versions'),1);
 assert.equal((await f.call('/api/prep/commit',{...body,expectedRevision:1})).data.code,'REQUEST_ID_CONFLICT');f.untouched();
});
await test('concurrent duplicate commit recovers one receipt; different CAS writers have one winner',async()=>{
 const f=fixture(),bundle=await sampleBundle();await uploadAll(f,bundle);const same=await Promise.all([f.call('/api/prep/commit',command(bundle)),f.call('/api/prep/commit',command(bundle))]);assert(same.every(r=>r.status===200));assert.equal(f.env.REHEARSAL_LEDGER.row().revision,1);assert.equal(f.env.REHEARSAL_LEDGER.count('gsis_ttprep_receipts'),1);
 const a=await sampleBundle('Changed A'),b=await sampleBundle('Changed B');await uploadAll(f,a);await uploadAll(f,b);const race=await Promise.all([f.call('/api/prep/commit',command(a,'race-alpha-identity',1)),f.call('/api/prep/commit',command(b,'race-bravo-identity',1))]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);assert.equal(f.env.REHEARSAL_LEDGER.row().revision,2);assert.equal(f.env.REHEARSAL_LEDGER.count('gsis_ttprep_versions'),2);f.untouched();
});
await test('R2 failures and corrupt existing content never advance D1; transaction failure rolls back pointers and retains retry identity',async()=>{
 const f=fixture(),bundle=await sampleBundle();f.env.REHEARSAL_TIMETABLES.fail=true;assert.equal((await f.call('/api/prep/part',{part:bundle.parts[0]})).status,503);assert.equal(f.env.REHEARSAL_LEDGER.row().revision,0);f.env.REHEARSAL_TIMETABLES.fail=false;await uploadAll(f,bundle);
 f.env.REHEARSAL_LEDGER.failAt='INSERT INTO gsis_ttprep_versions';const body=command(bundle);assert.equal((await f.call('/api/prep/commit',body)).data.code,'WRITE_UNCERTAIN');assert.equal(f.env.REHEARSAL_LEDGER.row().revision,0);assert.equal(f.env.REHEARSAL_LEDGER.count('gsis_ttprep_receipts'),0);assert.equal((await f.call('/api/prep/commit',body)).status,200);
 const row=f.env.REHEARSAL_LEDGER.row(),snapshot=JSON.parse(row.document),native=snapshot.nativeParts[0];f.env.REHEARSAL_TIMETABLES.objects.get(native.key).bytes=new TextEncoder().encode('corrupt-existing-object');assert.equal((await f.call('/api/prep/part',{part:bundle.parts[0]})).data.code,'OBJECT_INVALID');assert.equal((await f.call('/api/prep/commit',command(bundle,'corrupt-unchanged-id',1))).data.code,'OBJECT_INVALID');assert.equal(f.env.REHEARSAL_LEDGER.row().revision,1);f.untouched();
});
await test('source, manifest, projection, private fields and unsupported routes fail before pointer commit',async()=>{
 const f=fixture(),bundle=await sampleBundle();await uploadAll(f,bundle);
 for(const edit of [b=>b.manifest.sourceKey='f'.repeat(64),b=>b.sourceCheck.sourceKey='f'.repeat(64),b=>b.manifest.calendar.verified=true,b=>b.manifest.to='2026-11-28']){const b=structuredClone(bundle);edit(b);assert.notEqual((await f.call('/api/prep/commit',command(b))).status,200);}
 for(const edit of [value=>value.model.privateContacts={email:'private'},value=>value.expectedProjectionHashes.single[0]='f'.repeat(64)]){const b=structuredClone(bundle),p=b.parts[0],value=JSON.parse(p.data);edit(value);p.data=stable(value);p.sha256=await hash(p.data);p.bytes=Buffer.byteLength(p.data);assert.equal((await f.call('/api/prep/part',{part:p})).status,400);}
 const b=structuredClone(bundle),p=b.parts[1],value=JSON.parse(p.data);value.plan.teachers[0].email='private';p.data=stable(value);p.sha256=await hash(p.data);p.bytes=Buffer.byteLength(p.data);assert.equal((await f.call('/api/prep/part',{part:p})).data.code,'UNSUPPORTED_SCHEMA');
 for(const path of ['/api/activate','/api/command','/api/scheduled','/api/prep/delete'])assert.equal((await f.call(path)).status,404);
 assert.equal((await f.call('/api/prep/state?bucket=production')).status,400);assert.equal(f.env.REHEARSAL_LEDGER.row().revision,0);f.untouched();
});
await test('browser sign-in imports one native bundle, retries durable identity and reads compressed dates',async()=>{
 const f=fixture(),bundle=await sampleBundle(),html=await (await worker.fetch(new Request(origin+'/'),f.env)).text();let signIn;
 assert(!html.includes('<button id="import"'));assert(html.includes('SHADOW ONLY'));
 const dom=new JSDOM(html,{url:origin,runScripts:'dangerously',beforeParse(window){Object.defineProperty(window,'crypto',{value:crypto});window.google={accounts:{id:{initialize(settings){signIn=settings.callback;},renderButton(){}}}};window.fetch=(path,options)=>worker.fetch(new Request(origin+path,{...options,headers:{...options.headers,Origin:origin}}),f.env);}});
 await new Promise(resolve=>dom.window.addEventListener('load',resolve,{once:true}));await signIn({credential:adminToken});const d=dom.window.document;
 assert(d.getElementById('identity').textContent.includes('operator@'+domain));
 const raw=JSON.stringify(bundle);Object.defineProperty(d.getElementById('sourceFile'),'files',{value:[{size:Buffer.byteLength(raw),text:async()=>raw}]});
 const click=async id=>{await d.getElementById(id).onclick();assert.equal(d.getElementById('message').dataset.error,'false',d.getElementById('message').textContent);};
 await click('inspect');assert(d.getElementById('output').textContent.includes(bundle.manifest.sourceKey));await click('import');assert.equal(f.env.REHEARSAL_LEDGER.row().revision,1);await click('retry');assert(d.getElementById('message').textContent.includes('Original durable commit receipt recovered'));
 d.getElementById('readDate').value='2026-10-29';d.getElementById('readKind').value='suspended';await click('read');assert(d.getElementById('output').textContent.includes('Confirmed Room'));assert(d.getElementById('output').textContent.includes('not-independently-verified'));
 f.env.REHEARSAL_TIMETABLES.fail=true;await d.getElementById('import').onclick();assert.equal(d.getElementById('message').dataset.error,'true');await d.getElementById('retry').onclick();assert(d.getElementById('message').textContent.includes('No commit was issued'));assert.equal(f.env.REHEARSAL_LEDGER.count('gsis_ttprep_receipts'),1);f.env.REHEARSAL_TIMETABLES.fail=false;
 const normalFetch=dom.window.fetch;let drop=true;dom.window.fetch=async(path,options)=>{const response=await normalFetch(path,options);if(path==='/api/prep/commit'&&drop){drop=false;throw Error('Lost commit response');}return response;};
 await d.getElementById('import').onclick();assert(d.getElementById('message').textContent.includes('Lost commit response'));assert.equal(f.env.REHEARSAL_LEDGER.count('gsis_ttprep_receipts'),2);await d.getElementById('import').onclick();assert(d.getElementById('message').textContent.includes('previous commit outcome is unconfirmed'));assert.equal(f.env.REHEARSAL_LEDGER.count('gsis_ttprep_receipts'),2);await click('retry');assert(d.getElementById('message').textContent.includes('Original durable commit receipt recovered'));assert.equal(f.env.REHEARSAL_LEDGER.count('gsis_ttprep_receipts'),2);f.untouched();dom.window.close();
});
await test('large native baseline processes bounded per-date copies; over-bound input is refused before R2',async()=>{
 const f=fixture(),bundle=await sampleBundle(),value=JSON.parse(bundle.parts[0].data),rows=350,perDay=20;
 value.model=Roster.validate({layoutMode:'single-week',single:{days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay,maxPeriod:perDay-1,blocks:Array.from({length:rows},(_,n)=>({name:'Synthetic teacher '+n,cells:Array.from({length:perDay*5},(_,i)=>['EL','3A','Synthetic training room '+String(i).padStart(3,'0')+' '+('x'.repeat(32)),'Training group'])}))},timing:{startMinutes:420,periodMinutes:20,normalLastPeriod:perDay-1,endOfDayMinutes:820},recesses:[]});
 value.expectedProjectionHashes={single:[]};for(let i=0;i<5;i++)value.expectedProjectionHashes.single.push(await hash(stable(baselineProjection(value.model,'single',i))));
 const p=bundle.parts[0];p.data=stable(value);p.bytes=Buffer.byteLength(p.data);p.sha256=await hash(p.data);assert(p.bytes>2*1024*1024&&p.bytes<4*1024*1024,p.bytes);
 bundle.manifest.parts[0]={id:p.id,kind:p.kind,sha256:p.sha256,bytes:p.bytes};bundle.manifest.sourceKey=await hash(stable({schema:'gsis.timetable.preparation.source',version:1,from:bundle.manifest.from,to:bundle.manifest.to,baselineMap:bundle.manifest.baselineMap,parts:bundle.manifest.parts}));bundle.parts.forEach(p=>p.sourceKey=bundle.manifest.sourceKey);bundle.sourceCheck.sourceKey=bundle.manifest.sourceKey;
 await uploadAll(f,bundle);const r=await f.call('/api/prep/commit',command(bundle));assert.equal(r.status,200,JSON.stringify(r.data));const read=await f.call('/api/prep/read',{date:'2026-10-28',kind:'baseline'});assert.equal(read.data.timetable.candidates[0].projection.teachers.length,rows);assert.equal(read.data.timetable.candidates[0].projection.teachers[349].cells.length,perDay);
 const g=fixture(),bad=structuredClone(p);bad.bytes=4*1024*1024+1;assert.equal((await g.call('/api/prep/part',{part:bad})).status,413);assert.equal(g.env.REHEARSAL_TIMETABLES.writes,0);f.untouched();
});
await test('unchanged-source import refuses a damaged D1 dated pointer instead of certifying the no-op',async()=>{
 const f=fixture(),bundle=await sampleBundle();await uploadAll(f,bundle);assert.equal((await f.call('/api/prep/commit',command(bundle))).status,200);
 const row=f.env.REHEARSAL_LEDGER.row(),document=JSON.parse(row.document);document.dates[0].baseline.sha256='f'.repeat(64);f.env.REHEARSAL_LEDGER.sqlite.prepare('UPDATE gsis_ttprep_heads SET document=? WHERE singleton=1').run(JSON.stringify(document));
 const result=await f.call('/api/prep/commit',command(bundle,'damaged-head-noop-id',1));assert.equal(result.status,503);assert.equal(result.data.code,'SNAPSHOT_INVALID');assert.equal(f.env.REHEARSAL_LEDGER.row().revision,1);assert.equal(f.env.REHEARSAL_LEDGER.count('gsis_ttprep_receipts'),1);f.untouched();
});
await test('empty baseline window preserves confirmed intended plan; overlapping mappings and SG chronology must agree',async()=>{
 const f=fixture(),standalone=await sampleBundle();standalone.parts=standalone.parts.filter(p=>p.kind==='suspended');standalone.manifest.baselineMap.forEach(row=>row.baselineId=null);await reseal(standalone);await uploadAll(f,standalone);let r=await f.call('/api/prep/commit',command(standalone));assert.equal(r.status,200,JSON.stringify(r.data));assert.equal((await f.call('/api/prep/read',{date:'2026-10-29',kind:'baseline'})).data.timetable,null);assert.equal((await f.call('/api/prep/read',{date:'2026-10-29',kind:'suspended'})).data.timetable.projection.baselineId,'stapler:2026-10-29');
 const g=fixture(),overlap=await sampleBundle(),native=JSON.parse(overlap.parts[0].data);native.id=native.entry.id='baseB';native.entry.name='Later baseline';native.entry.from='2026-11-03';const data=stable(native);overlap.parts.push({...overlap.parts[0],id:'baseline:baseB',data,sha256:await hash(data),bytes:Buffer.byteLength(data)});overlap.manifest.baselineMap.forEach(row=>{if(row.date>='2026-11-03')row.baselineId='baseB';});await reseal(overlap);await uploadAll(g,overlap);r=await g.call('/api/prep/commit',command(overlap));assert.equal(r.status,200,JSON.stringify(r.data));
 const damaged=structuredClone(overlap);damaged.manifest.baselineMap.find(row=>row.date==='2026-11-04').baselineId='baseA';await reseal(damaged);r=await g.call('/api/prep/commit',command(damaged,'wrong-active-baseline',1));assert.equal(r.data.code,'MANIFEST_PART_MISMATCH');assert.equal(g.env.REHEARSAL_LEDGER.row().revision,1);
 for(const change of [bundle=>bundle.manifest.capturedAt='2026-10-28T17:00:00.000Z',bundle=>bundle.sourceCheck.checkedAt='2026-10-28T17:00:00.000Z']){const b=structuredClone(overlap);change(b);assert.notEqual((await g.call('/api/prep/commit',command(b,'wrong-sg-chronology',1))).status,200);}f.untouched();g.untouched();
});
