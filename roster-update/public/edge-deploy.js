/* GSIS_API_SECRET_BEGIN */
// First-party API credentials share one operator-selected setting. Browser
// sessions, private relief links and third-party credentials stay independent.
function gsisApiSecret(env,legacyName){
 const value=env?.GSIS_SECRET;
 if(value!==undefined||Object.prototype.hasOwnProperty.call(env||{},'GSIS_SECRET')){
  if(typeof value!=='string'||!/^[!-~]{32,8000}$/.test(value))throw Object.assign(Error('GSIS_SECRET must contain 32 to 8000 printable ASCII characters without spaces.'),{status:503,code:'GSIS_SECRET_INVALID'});
  return value;
 }
 return env?.[legacyName];
}

/* GSIS_API_SECRET_END */
/* Deploy operational authority. D1 commits fields, revisions, receipts and delivery intent together. */
import {GSiSEdgeStore} from './edge-store.js';
import {createDeployDomain} from './edge-deploy-domain.js';
import {beginEdgeVenuesChange,completeEdgeVenuesChange,inspectEdgeVenuesFence,revokeEdgeVenuesChange} from './edge-venues-fence.js';
import {sha256Bytes,sha256Hex} from './edge-deploy-sha256.js';
const clone=x=>JSON.parse(JSON.stringify(x)),calculations=new Map(),encoder=new TextEncoder();
const fail=(status,message,code)=>{throw Object.assign(new Error(message),{status,code});};
const storeFor=env=>{if(!env.GSIS_JOBS)fail(503,'Bind the shared GSIS_JOBS D1 database.','DEPLOY_EDGE_CONFIG');return GSiSEdgeStore.open(env.GSIS_JOBS,'deploy');};
export const edgeDeployEnabled=env=>String(env.DEPLOY_EDGE_AUTHORITY||'').toLowerCase()==='d1';
// The persisted authority head also serves Roster's internal readers. The
// frontend routing flag cannot turn an active or paused D1 record back to Google.
export async function edgeDeployQuotaUsesD1(env){
 if(!env.GSIS_JOBS){if(edgeDeployEnabled(env))fail(503,'The active Deploy source binding is unavailable.','QUOTA_SNAPSHOT_SOURCE');return false;}
 let head;try{const db=typeof env.GSIS_JOBS.withSession==='function'?env.GSIS_JOBS.withSession('first-primary'):env.GSIS_JOBS;head=await db.prepare("SELECT mode FROM gsis_edge_heads WHERE scope='deploy'").first();}
 catch(error){if(!/no such table:\s*(?:main\.)?gsis_edge_heads\b/i.test(String(error?.message||'')))fail(503,'The published Deploy authority could not be verified.','QUOTA_SNAPSHOT_SOURCE');}
 if(!head){if(edgeDeployEnabled(env))fail(503,'Published Deploy authority is not active.','QUOTA_SNAPSHOT_SOURCE');return false;}
 if(head.mode==='active')return true;
 if(!edgeDeployEnabled(env)&&['legacy','imported'].includes(head.mode))return false;
 fail(503,'Published Deploy authority is paused or is not active.','QUOTA_SNAPSHOT_SOURCE');
}
const commandDigest=(action,input)=>GSiSEdgeStore.digest({action,input});
async function signed(url,secret,body){
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url||'')||typeof secret!=='string'||secret.length<32)fail(503,'Configure the signed Google integration endpoint.','DEPLOY_EDGE_CONFIG');
 const payload=JSON.stringify({...body,timestamp:Date.now(),nonce:crypto.randomUUID()}),key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(payload)))).map(n=>n.toString(16).padStart(2,'0')).join('');
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature}),signal:AbortSignal.timeout(25000),redirect:'follow'});let result;try{result=await response.json();}catch{fail(503,'The Google integration returned an invalid response.');}if(!response.ok||!result.ok)fail(result.status||503,result.error||'The Google integration is unavailable.',result.code);return result.data;
}
async function adapter(env,operation,input,identity){return signed(env.APPS_SCRIPT_URL,gsisApiSecret(env,'BRIDGE_SECRET'),{action:'deployEdge',input:{operation,...input},identity});}

// A bounded metadata cache keeps ordinary Deploy reads fast. Source verification
// always reads the live register; it must never approve a stale booking snapshot.
const registryFlights=new WeakMap(),registryCache=new WeakMap();
async function physicalRegistry(env,fresh=false){
 const db=env.GSIS_JOBS,prior=registryCache.get(db),now=Date.now();if(!fresh&&prior&&now-prior.at<30000)return clone(prior.value);
 if(!fresh&&registryFlights.has(db))return registryFlights.get(db);
 const flight=adapter(env,'physicalRegistry',{},null).then(value=>{const current=registryCache.get(db);if(!current||current.at<=now)registryCache.set(db,{at:now,value});return clone(value);}).finally(()=>{if(registryFlights.get(db)===flight)registryFlights.delete(db);});
 if(!fresh)registryFlights.set(db,flight);return flight;
}

async function contacts(env,action,input,identity){
 const result=env.CONTACTS_APPS_SCRIPT_URL&&gsisApiSecret(env,'CONTACTS_BRIDGE_SECRET')?await signed(env.CONTACTS_APPS_SCRIPT_URL,gsisApiSecret(env,'CONTACTS_BRIDGE_SECRET'),{action,input,identity}):await adapter(env,'contacts',{contactAction:action,contactInput:input},identity);
 if(['approveDeployTeachers','applyDeployCatalogues','saveRoleTruthTable'].includes(action))try{await env.GSIS_JOBS.prepare('DELETE FROM gsis_deploy_authority').run();}catch(ignore){}
 return result;
}

function domain(state,identity,responses,env){
 return createDeployDomain({state,identity,sha256:sha256Bytes,calculations,apiSecret:name=>gsisApiSecret(env,name),integration:(service,action,input,who)=>{
  const key=JSON.stringify([service,action,input,who.email]);if(responses.has(key))return clone(responses.get(key));throw Object.assign(new Error('Integration prerequisite'),{integration:{key,service,action,input,identity:who}});
 }});
}
const authorityFlights=new WeakMap(),authorityTables=new WeakSet(),AUTHORITY_MAX_AGE=60000;
async function context(env,identity,action,input,ctx){
 if(action==='active')return {user:{email:identity.email,roles:[]}};
 const db=env.GSIS_JOBS,key=sha256Hex(JSON.stringify([identity.email,identity.subject,env.CONTACTS_APPS_SCRIPT_URL||env.APPS_SCRIPT_URL]));
 if(!authorityTables.has(db)){await db.prepare('CREATE TABLE IF NOT EXISTS gsis_deploy_authority (identity_key TEXT PRIMARY KEY, verified_at INTEGER NOT NULL, snapshot_json TEXT NOT NULL)').run();authorityTables.add(db);}
 const cached=await db.prepare('SELECT verified_at,snapshot_json FROM gsis_deploy_authority WHERE identity_key=?').bind(key).first();let previous=null;try{previous=cached?JSON.parse(cached.snapshot_json):null;}catch(ignore){}
 const validate=value=>{if(!value?.user||value.user.email!==identity.email||!Array.isArray(value.user.roles))fail(403,'Contacts could not verify this school identity.');if(value.authoritative===false||value.viewState?.pending)fail(503,'Complete the pending Contacts save before changing Deploy.');return value;};
 const refresh=()=>{
  let flights=authorityFlights.get(db);if(!flights){flights=new Map();authorityFlights.set(db,flights);}if(flights.has(key))return flights.get(key);
  const flight=(async()=>{const checkedAt=Date.now();let value=await contacts(env,'deploySnapshot',{authorityOnly:false,readOnly:!['change','publishReview'].includes(action),palAuthority:true,...(previous?.catalogueHash?{knownCatalogueHash:previous.catalogueHash}:{})},identity);
   if(value?.catalogueUnchanged){if(!previous||value.catalogueHash!==previous.catalogueHash||value.authoritative!==true)fail(503,'Contacts reference version could not be confirmed.');value={...previous,...value};}validate(value);
   await db.prepare('INSERT INTO gsis_deploy_authority(identity_key,verified_at,snapshot_json) VALUES(?,?,?) ON CONFLICT(identity_key) DO UPDATE SET verified_at=excluded.verified_at,snapshot_json=excluded.snapshot_json WHERE excluded.verified_at>=gsis_deploy_authority.verified_at').bind(key,checkedAt,JSON.stringify(value)).run();return value;
  })().finally(()=>flights.delete(key));flights.set(key,flight);return flight;
 };
 const force=action==='publishReview'||action==='change'&&['publish','acceptContacts','create'].includes(input.operation)||input.freshContacts||input.reviewContacts;
 if(!force&&previous&&cached.verified_at<=Date.now()&&Date.now()-cached.verified_at<AUTHORITY_MAX_AGE){validate(previous);if(Date.now()-cached.verified_at>=AUTHORITY_MAX_AGE/2&&ctx?.waitUntil)ctx.waitUntil(refresh().catch(()=>{}));return previous;}
 return refresh();
}

function knownState(state){
 for(const key of ['drafts','publications','receipts','deltas','leases','properties','jobs'])state[key]=state[key]||{};
 state.index=state.index||{versions:[],active:null,published:null,publicationSchema:1,revision:0,requests:[]};return state;
}
function requestKey(action,input){return input.requestId||(['lease','acknowledgeNotices'].includes(action)?crypto.randomUUID():null);}
async function loadOperation(store,action,input,attempt=0){
 if(action==='change'&&['create','publish'].includes(input.operation))return store.load();
 const first=await store.load({collections:['index']}),idx=first.state?.index;if(!idx)return first;
 const id=input.versionId||idx.active||idx.versions?.at(-1)?.id,published=idx.published;
 const collections=['index','leases','properties','jobs'],prefixes={};
 if(id){collections.push('drafts','receipts','deltas');prefixes.drafts=[id+'|'];prefixes.receipts=[id+'|'];prefixes.deltas=[id+'|'];}
 if(published){collections.push('publications');prefixes.publications=[published.commit+'|'];}
 const loaded=await store.load({collections,prefixes});if(loaded.revision!==first.revision){if(attempt>=3)fail(409,'Deploy changed while loading. Retry.');return loadOperation(store,action,input,attempt+1);}return loaded;
}
export async function edgeDeployDispatch(env,action,input,identity,ctx){
 const store=storeFor(env);await store.ensure();const head=await store.head();
 if(head.mode!=='active')fail(503,'Deploy D1 authority is not active. Complete the verified migration before opening this service.','DEPLOY_EDGE_NOT_ACTIVE');
 if(action==='deployEdgeAdmin')return edgeDeployAdmin(env,input,identity);
 if(['roleTruthTable','saveRoleTruthTable'].includes(action))return contacts(env,action,input,identity);
 const c=await context(env,identity,action,input,ctx),requestId=requestKey(action,input),digest=await commandDigest(action,input),writer=['change','lease','acknowledgeNotices'].includes(action);
 if(writer&&requestId){const previous=await store.receipt(identity.email,requestId,digest);if(previous)return {...previous.result,duplicate:true};}
 const responses=new Map();responses.set(JSON.stringify(['contacts','deploySnapshot',{authorityOnly:false},identity.email]),c);
 for(let attempt=0;attempt<4;attempt++){
  const loaded=await loadOperation(store,action,input),before=knownState(loaded.state),state=clone(before);let data,model;
  for(let stage=0;stage<8;stage++){
   const working=clone(state);model=domain(working,identity,responses,env);
   try{
    if(action==='publicCampus'){const en=working.index.published;if(en){const projected=model.publicCampus(readDocument(working,en),en),cursor=en.commit+':'+projected.registryRevision;data=input.since===cursor?{unchanged:true,cursor}:{...projected,cursor,resync:!!input.since};}else data={venues:[],classes:[],groups:[],cursor:'empty'};}
    else data=model.dispatch({action,input:clone(input),identity},clone(c));
    Object.keys(state).forEach(k=>delete state[k]);Object.assign(state,working);break;
   }catch(error){
    if(!error.integration)throw error;const call=error.integration;
    const result=call.service==='contacts'?await contacts(env,call.action,call.input,identity):call.action==='registry'?await physicalRegistry(env):await adapter(env,'layoutRead',{layoutAction:call.action,layoutInput:call.input},identity);
    responses.set(call.key,result);
    if(call.service==='contacts'&&call.action==='approveDeployTeachers'){
     const refreshed=await contacts(env,'deploySnapshot',{authorityOnly:false},identity);responses.set(JSON.stringify(['contacts','deploySnapshot',{authorityOnly:false},identity.email]),refreshed);
    }
    if(stage===7)fail(503,'Deploy integration prerequisites did not settle. Retry the same request.');
   }
  }
  if(!writer)return data;
  let venuesTicket=null;
  if(action==='change'&&input.operation==='publish'&&(env.VENUES_APPS_SCRIPT_URL||env.VENUES_BRIDGE_SECRET)){
   const revision=domain(state,identity,responses,env).venuesService({operation:'manifest'}).key;venuesTicket=await beginEdgeVenuesChange(env,{source:'deploy',requestId});const id='venuesFence:'+requestId;if(!state.jobs[id])state.jobs[id]={id,kind:'venuesFence',input:{requestId,revision},identity,commit:state.index.published.commit,publicationRevision:state.index.revision,state:'pending',attempts:0,createdAt:new Date().toISOString()};
  }
  try{
   const saved=await store.commit({before,after:state,expectedRevision:loaded.revision,projection:loaded.projection,guards:venuesTicket?.guard?[venuesTicket.guard]:[],actor:identity.email,requestId,digest,result:data});
   const task=runDeployHandoffs(env,identity).catch(()=>{});if(ctx?.waitUntil)ctx.waitUntil(task);else await task;
   return {...saved.result,...(saved.duplicate?{duplicate:true}:{})};
  }catch(error){if(error.status!==409||['EDGE_REQUEST_REUSED','IDEMPOTENCY_CONFLICT'].includes(error.code)||attempt===3)throw error;}
 }
 fail(409,'Deploy changed while saving. Review the latest values and retry.');
}
function readDocument(state,entry){const fields={},prefix=(entry.edgePublished?entry.commit:entry.id)+'|';for(const [key,value] of Object.entries(state[entry.edgePublished?'publications':'drafts']||{}))if(key.startsWith(prefix))fields[key.slice(prefix.length)]=value;return inflate(fields);}
// Inflate via the generated canonical model keeps the field protocol in one place.
function inflate(fields){const state=knownState({index:{versions:[{id:'read',store:'d1'}],revision:0},drafts:Object.fromEntries(Object.entries(fields).map(([key,value])=>['read|'+key,value]))});return createDeployDomain({state,identity:{email:'internal'},sha256:sha256Bytes,calculations,integration:()=>fail(503,'Unexpected integration')}).readDocument({id:'read',store:'d1'});}
function layoutDocument(d){const fields=['id','name','from','to','layoutYear','year','venues','venueRegistry','unitGeometry','classes','groups','assignments'];const value=Object.fromEntries(fields.filter(k=>d[k]!==undefined).map(k=>[k,d[k]]));value.teachers=(d.teachers||[]).map(({id,name})=>({id,name}));return value;}
function orderedHandoffs(state){return Object.values(state.jobs||{}).filter(j=>['pending','running'].includes(j.state)).sort((a,b)=>(a.kind==='venuesFence'?0:1)-(b.kind==='venuesFence'?0:1)||(a.publicationRevision||0)-(b.publicationRevision||0)||String(a.createdAt).localeCompare(String(b.createdAt))||a.id.localeCompare(b.id));}
function handoffDue(job){return !!job&&(!job.nextAttemptAt||Date.parse(job.nextAttemptAt)<=Date.now())&&(job.state!=='running'||job.leaseUntil<Date.now());}
async function handoffReady(env,store){
 await store.ensure();
 const db=env.GSIS_JOBS,connection=typeof db.withSession==='function'?db.withSession('first-primary'):db;
 // Keep ordering in the canonical JS comparator. Only scheduling metadata crosses
 // into the Worker; completed jobs and large integration payloads stay in D1.
 const results=await connection.batch([
  connection.prepare('SELECT mode FROM gsis_edge_heads WHERE scope=?').bind('deploy'),
  connection.prepare("SELECT value_json FROM gsis_edge_records WHERE scope=? AND collection='properties' AND record_id='key:HANDOFF_LEASE'").bind('deploy'),
  connection.prepare("SELECT json_remove(value_json,'$.input','$.identity','$.result','$.error') AS handoff_schedule_json FROM gsis_edge_records WHERE scope=? AND collection='jobs' AND record_id<>'$' AND json_extract(value_json,'$.state') IN ('pending','running')").bind('deploy')
 ]);
 if(!Array.isArray(results)||results.some(result=>result?.success===false))fail(503,'The database operation could not be confirmed. Retry the same request.','EDGE_STORAGE');
 if(results[0].results[0]?.mode!=='active')return false;
 const lease=results[1].results[0];if(lease&&JSON.parse(lease.value_json)?.until>Date.now())return false;
 const jobs=results[2].results.map(row=>JSON.parse(row.handoff_schedule_json));
 return handoffDue(orderedHandoffs({jobs})[0]);
}
export async function runDeployHandoffs(env,identity){
 const store=storeFor(env);if(!await handoffReady(env,store))return;
 const snapshot=await store.load({collections:['index','jobs','properties']});if(snapshot.mode!=='active')return;
 const before=knownState(snapshot.state),existing=before.properties.HANDOFF_LEASE;if(existing?.until>Date.now()||!handoffDue(orderedHandoffs(before)[0]))return;
 const after=clone(before),claim=crypto.randomUUID();after.properties.HANDOFF_LEASE={claim,until:Date.now()+180000};
 try{await store.commit({before,after,expectedRevision:snapshot.revision,projection:snapshot.projection,actor:'deploy-handoff',requestId:claim,digest:await GSiSEdgeStore.digest(['handoff-lease',claim]),result:{claimed:true}});}catch(e){if(e.status===409)return;throw e;}
 try{return await runDeployHandoffsUnlocked(env,identity,claim);}finally{
  for(let attempt=0;attempt<3;attempt++){const loaded=await store.load({collections:['index','jobs','properties']});if(loaded.mode!=='active'||loaded.state.properties?.HANDOFF_LEASE?.claim!==claim)break;const old=loaded.state,next=clone(old);delete next.properties.HANDOFF_LEASE;
   try{await store.commit({before:old,after:next,expectedRevision:loaded.revision,projection:loaded.projection,actor:'deploy-handoff',requestId:crypto.randomUUID(),digest:await GSiSEdgeStore.digest(['handoff-release',claim]),result:{released:true}});break;}catch(e){if(e.status!==409||attempt===2)throw e;}
  }
 }
}
async function runDeployHandoffsUnlocked(env,identity,leaseClaim){
 const store=storeFor(env);const initial=await store.load({collections:['index','jobs','properties']});if(initial.mode!=='active')return;
 const pending=orderedHandoffs(initial.state).slice(0,4);
 for(const job of pending){
  if(job.nextAttemptAt&&Date.parse(job.nextAttemptAt)>Date.now()||job.state==='running'&&job.leaseUntil>=Date.now())return;
  const loaded=await store.load({collections:['index','jobs','properties']}),before=knownState(loaded.state),after=clone(before),current=after.jobs[job.id];if(!current||current.state!=='pending'&&!(current.state==='running'&&current.leaseUntil<Date.now()))continue;
  if(after.properties.HANDOFF_LEASE?.claim!==leaseClaim)return;after.properties.HANDOFF_LEASE.until=Date.now()+180000;
  const claim=crypto.randomUUID();current.state='running';current.claim=claim;current.leaseUntil=Date.now()+60000;
  try{await store.commit({before,after,expectedRevision:loaded.revision,projection:loaded.projection,actor:'deploy-handoff',requestId:claim,digest:await GSiSEdgeStore.digest([job.id,claim]),result:{claimed:true}});}catch(e){if(e.status===409)continue;throw e;}
  let outcome,error;
  try{if(job.kind==='venuesFence')outcome=await completeEdgeVenuesChange(env,{source:'deploy',requestId:job.input.requestId,revision:job.input.revision});
   else if(job.kind==='contactsCatalogue')outcome=await contacts(env,'applyDeployCatalogues',job.input,job.identity||identity);
   else {const publication=initial.state.index.venuePublications?.find(en=>en.commit===job.commit)||initial.state.index.published;if(publication?.commit!==job.commit)fail(409,'Publication handoff source is unavailable.');outcome=await adapter(env,'layoutHandoff',{requestId:job.id,publicationRevision:job.publicationRevision,entry:publication,document:layoutDocument(readDocument((await loadPublication(store,{commit:publication.commit})).state,publication))},job.identity||identity);}
  }catch(e){error=e;}
  for(let retry=0;retry<3;retry++){
   const snapshot=await store.load({collections:['index','jobs','properties']}),old=knownState(snapshot.state),next=clone(old),record=next.jobs[job.id];if(record?.claim!==claim)break;record.attempts=(record.attempts||0)+1;record.state=error?'pending':'complete';record.updatedAt=new Date().toISOString();delete record.claim;delete record.leaseUntil;if(error){record.nextAttemptAt=new Date(Date.now()+Math.min(3600000,30000*2**Math.min(7,record.attempts))).toISOString();record.error='Google handoff is pending; retry is scheduled.';}else{record.result=outcome;delete record.error;delete record.nextAttemptAt;}
   try{await store.commit({before:old,after:next,expectedRevision:snapshot.revision,projection:snapshot.projection,actor:'deploy-handoff',requestId:crypto.randomUUID(),digest:await GSiSEdgeStore.digest([job.id,claim,record.state]),result:{completed:!error}});break;}catch(e){if(e.status!==409||retry===2)throw e;}
  }
  if(error)return;
 }
}
export async function edgeDeployAdmin(env,input,identity){
 const c=await context(env,identity,'publishReview',input);if(!c.user.roles.includes('Admin'))fail(403,'Deploy administrator required.');const store=storeFor(env);await store.ensure();
 if(input.operation==='status'){const snapshot=await store.load({collections:['jobs']});return {...await store.head(),venuesFence:await inspectEdgeVenuesFence(env,'deploy'),handoffs:Object.values(snapshot.state?.jobs||{}).map(({id,kind,state,attempts,error,updatedAt,versionId})=>({id,kind,state,attempts,error,updatedAt,versionId}))};}
 if(input.operation==='recoverVenuesFence'){const fence=await inspectEdgeVenuesFence(env,'deploy');if(!fence||fence.request_id!==input.requestId)fail(409,'Select the pending Deploy occupancy request.');await revokeEdgeVenuesChange(env,{source:'deploy',requestId:input.requestId});const loaded=await loadPublication(store,{manifest:true});if(loaded.mode!=='active')fail(409,'Resume Deploy before completing its source fence.');const revision=domain(knownState(loaded.state),identity,new Map(),env).venuesService({operation:'manifest'}).key;return completeEdgeVenuesChange(env,{source:'deploy',requestId:input.requestId,revision});}
 if(input.operation==='export')return store.exportState();
 if(input.operation==='import'){
  const legacy=await adapter(env,'export',{},identity),state=normaliseLegacy(legacy);return store.importState({state,actor:identity.email,requestId:input.requestId||crypto.randomUUID(),digest:await GSiSEdgeStore.digest(state),source:{service:'deploy-apps-script',revision:legacy.index.revision}});
 }
 if(input.operation==='activate'){
  const head=await store.head();if(head.mode!=='imported')fail(409,'Import and verify Deploy before activation.');
  const proof=await adapter(env,'fence',{expectedRevision:(await store.load()).state.index.migrationSourceRevision,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords},identity);
  if(!proof.legacyWritesDisabled||proof.sourceDigest!==head.sourceDigest)fail(409,'Legacy Deploy writer fence could not be verified.');
  return store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:identity.email,proof});
 }
 if(input.operation==='resume'){const head=await store.head();if(head.mode!=='paused')fail(409,'Deploy is not paused.');const proof=await adapter(env,'fence',{expectedRevision:(await store.load()).state.index.migrationSourceRevision,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords},identity);return store.transition({from:'paused',to:'active',expectedRevision:head.revision,actor:identity.email,proof});}
 if(input.operation==='pause'){const head=await store.head();return store.transition({from:'active',to:'paused',expectedRevision:head.revision,actor:identity.email,proof:{reason:String(input.reason||'Administrator maintenance')}});}
 if(input.operation==='retryHandoffs'){await runDeployHandoffs(env,identity);return {saved:true};}
 fail(400,'Unknown Deploy migration operation.');
}
function normaliseLegacy(value){
 if(value?.schema!=='gsis-deploy-edge-v1'||!value.index||!Array.isArray(value.documents))fail(400,'Invalid Deploy export.');
 const state=knownState({index:clone(value.index),leases:{},properties:value.properties||{},receipts:value.receipts||{},drafts:{},publications:{},deltas:{},jobs:{}});
 state.index.publicationSchema=1;state.index.migrationSourceRevision=value.index.revision;state.index.requests=state.index.requests||[];
 for(const item of value.documents){const prefix=(item.published?item.entry.commit:item.entry.id)+'|',target=state[item.published?'publications':'drafts'];for(const [key,val] of Object.entries(item.fields))target[prefix+key]=val;}
 for(const en of state.index.versions){en.store='d1';delete en.lastDelta;}
 if(state.index.published){state.index.published.edgePublished=true;state.index.published.store='d1';delete state.index.published.lastDelta;}
 state.index.venuePublications=(state.index.venuePublications||[]).map(en=>({...en,store:'d1',edgePublished:true,lastDelta:null}));
 state.index.quotaPublications=(state.index.quotaPublications||[]).map(en=>({...en,store:'d1',edgePublished:true,lastDelta:null}));
 return state;
}
async function loadPublication(store,input={},attempt=0){
 const first=await store.load({collections:['index']}),idx=first.state?.index;if(!idx)return first;
 const commit=input.commit||idx.published?.commit;if(!commit||input.manifest)return first;
 const result=await store.load({collections:['index','publications'],prefixes:{publications:[commit+'|']}});
 if(first.revision!==result.revision){if(attempt>=3)fail(409,'Published Deploy changed while loading. Retry.');return loadPublication(store,input,attempt+1);}return result;
}
export async function edgeDeployPublishedReferences(env,input={}){
 const store=storeFor(env),loaded=await loadPublication(store,input);if(loaded.mode!=='active')fail(503,'Published Deploy authority is not active.');const state=knownState(loaded.state),entries=[...(state.index.venuePublications||[]),...(state.index.published?[state.index.published]:[])].filter((en,i,all)=>all.findIndex(x=>x.commit===en.commit)===i);
 const references=entries.map(en=>({versionId:en.id,name:en.name,revision:en.revision,commit:en.commit,updatedAt:en.updatedAt,from:en.from||'',to:en.to||'',inForce:en.commit===state.index.published?.commit}));
 if(input.manifest)return {schema:1,key:sha256Hex(JSON.stringify(references)),publications:references};
 const entry=input.commit?entries.find(en=>en.commit===input.commit&&(!input.versionId||en.id===input.versionId)):state.index.published;
 if(!entry)fail(404,'Published Deploy version is unavailable.');return {entry,document:readDocument(state,entry),edgeRevision:loaded.revision,source:references.find(ref=>ref.commit===entry.commit)};
}
export async function edgeDeployRosterReference(env,dates){
 if(!await edgeDeployQuotaUsesD1(env)){
  const date=Array.isArray(dates)&&dates.length?dates[0]:new Date(Date.now()+8*3600000).toISOString().slice(0,10),input={manifest:true,date},manifest=await edgeDeployQuotaSource(env,input),source=manifest.expectedSource;
  if(!source)fail(503,'No published Deploy quota covers this school date.','QUOTA_SNAPSHOT_SOURCE');
  const value=await edgeDeployQuotaSource(env,{versionId:source.versionId,revision:source.revision,commit:source.commit}),after=await edgeDeployQuotaSource(env,input);
  if(!after.expectedSource||['versionId','revision','commit','calculationVersion'].some(key=>after.expectedSource[key]!==source[key]))fail(409,'Deploy publication changed while reading its safety reference. Retry.','QUOTA_SNAPSHOT_CHANGED');
  return value;
 }
 const ref=await edgeDeployPublishedReferences(env),state=knownState({index:{versions:[],published:ref.entry,venuePublications:[ref.entry],revision:ref.entry.revision},publications:{}});
 // Canonical relief model consumes an immutable publication document.
 return {...createDeployDomain({state,identity:{email:'internal'},sha256:sha256Bytes,calculations,integration:()=>fail(503,'Unexpected integration')}).rosterReference(ref.document,ref.entry),edgeRevision:ref.edgeRevision};
}
// Internal signed producer for the separately retried Roster quota mirror.
export async function edgeDeployQuotaSource(env,input={}){
 if(!await edgeDeployQuotaUsesD1(env))return signed(env.DEPLOY_APPS_SCRIPT_URL||env.APPS_SCRIPT_URL,gsisApiSecret(env,'DEPLOY_BRIDGE_SECRET')||gsisApiSecret(env,'BRIDGE_SECRET'),{action:'deployEdge',service:'gsis-roster-quota-v1',input:{...input,operation:'quotaSnapshot'}});
 const loaded=await loadPublication(storeFor(env),{...input,manifest:input.manifest===true});if(loaded.mode!=='active')fail(503,'Published Deploy authority is not active.','QUOTA_SNAPSHOT_SOURCE');
 const state=knownState(loaded.state),model=createDeployDomain({state,identity:{email:'internal'},sha256:sha256Bytes,calculations,integration:()=>fail(503,'Unexpected integration')});
 return clone(model.quotaSource(input));
}
// Internal school-service helper; the Roster caller must derive staffId from its verified identity.
// The result contains one teacher's calculation and aggregate reference numbers only.
export async function edgeDeployPersonalCalculation(env,staffId,today=new Date(Date.now()+8*3600000).toISOString().slice(0,10)){
 if(typeof staffId!=='string'||!staffId||!/^\d{4}-\d{2}-\d{2}$/.test(today))fail(400,'A verified teacher and school date are required.');
 let ref;try{ref=await edgeDeployPublishedReferences(env);}catch(e){if(e.status!==404)throw e;return {asOf:today,units:'periods/week',source:null,calculation:null,calculationReason:'No published Deploy calculation is available.',row:null,reference:null};}
 const state=knownState({index:{versions:[],published:ref.entry,revision:ref.entry.revision}}),model=createDeployDomain({state,identity:{email:'internal'},sha256:sha256Bytes,calculations,integration:()=>fail(503,'Unexpected integration')});
 return {...model.personalCalculation(ref.document,ref.entry,staffId,today),edgeRevision:ref.edgeRevision};
}
export async function edgeDeployService(request,env,ctx){
 try{
  if(request.method!=='POST')fail(405,'POST required.');const path=new URL(request.url).pathname,body=await request.text();if(body.length>150000)fail(413,'Service request too large.');const envelope=JSON.parse(body);
  if(typeof envelope.payload!=='string'||! /^[a-f0-9]{64}$/.test(envelope.signature||''))fail(401,'Invalid service request.');
  const secret=path==='/api/venues-source'?gsisApiSecret(env,'VENUES_BRIDGE_SECRET'):path==='/api/lord-source'?gsisApiSecret(env,'LORD_BRIDGE_SECRET'):gsisApiSecret(env,'DEPLOY_EDGE_SECRET');if(typeof secret!=='string'||secret.length<32)fail(503,'Configure the Deploy source service credential.');
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']),signature=Uint8Array.from(envelope.signature.match(/../g),x=>parseInt(x,16));if(!await crypto.subtle.verify('HMAC',key,signature,encoder.encode(envelope.payload)))fail(401,'Invalid service signature.');
  const command=JSON.parse(envelope.payload);if(!Number.isFinite(command.timestamp)||Math.abs(Date.now()-command.timestamp)>60000||! /^[\w-]{36}$/.test(command.nonce||''))fail(401,'Expired service request.');
  let action;if(path==='/api/venues-source'){if(command.action!=='venuesSource'||command.service!=='gsis-venues-v1'||command.source!=='deploy')fail(401,'Invalid Venues source request.');action='venuesSource';}
  else if(path==='/api/lord-source'){if(command.action!=='lordService'||command.service!=='gsis-lord-v1'||command.source!=='deploy')fail(401,'Invalid LORD source request.');action='lordService';}
  else {if(command.service!=='gsis-deploy-edge-v1')fail(401,'Invalid Deploy service request.');action=command.action;}
  if(action==='retryHandoffs'){await runDeployHandoffs(env);return Response.json({ok:true,data:{processed:true}},{headers:{'Cache-Control':'no-store'}});}
  if(action==='quotaSnapshot'){const data=await edgeDeployQuotaSource({...env,DEPLOY_EDGE_AUTHORITY:'d1'},command.input||{});return Response.json({ok:true,data},{headers:{'Cache-Control':'no-store'}});}
  if(!['venuesSource','lordService','active','publicCampus','rosterReference'].includes(action))fail(403,'This service is read-only.');
  const input=command.input||{},store=storeFor(env),loaded=await loadPublication(store,{...input,manifest:action==='venuesSource'&&input.operation==='manifest'});if(loaded.mode!=='active')fail(503,'Deploy edge authority is not active.');const state=knownState(loaded.state),responses=new Map();if(['venuesSource','lordService','publicCampus'].includes(action))responses.set(JSON.stringify(['layout','registry',{},'internal-service']),await physicalRegistry(env,true));const model=domain(state,{email:'internal-service'},responses,env);let data;
  if(action==='venuesSource')data=model.venuesService(input);else if(action==='lordService')data=model.lordService(input);else if(action==='rosterReference'){const en=state.index.published;if(!en)fail(404,'No published Deploy version.');data=model.rosterReference(readDocument(state,en),en);}else if(action==='active'){const en=state.index.published;data=en?model.active(readDocument(state,en),state.index):{activeVersionId:null,revision:state.index.revision,assignments:[],workloads:[]};}else{const en=state.index.published;if(en){const projected=model.publicCampus(readDocument(state,en),en),cursor=en.commit+':'+projected.registryRevision;data=input.since===cursor?{unchanged:true,cursor}:{...projected,cursor};}else data={venues:[],classes:[],groups:[],cursor:'empty'};}
  return Response.json({ok:true,data},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({ok:false,status:e.status||503,error:e.status?e.message:'Deploy source unavailable.',code:e.code},{status:e.status||503,headers:{'Cache-Control':'no-store'}});}
}
