import {dispatchQuotaSnapshot as runQuotaSnapshotJob,readQuotaCheckpointEvidence,readQuotaSnapshotStatus} from '../../shared/roster-quota-job.js';
import {recoveryTimetableSnapshot} from './roster-recovery-timetable-cache.js';
import {dispatchEdgeDeliveryReview,edgeDeliveryReportRead,edgeDeliveryReviewBackend} from './edge-notification-review.js';
import {edgeRosterEnabled,edgeRosterService,edgeRosterBackend,edgeRosterMigration,readEdgeRosterReferences,mirrorEdgeRoster,readRosterMirrorStatus} from './edge-roster.js';
import {edgeNotificationService,edgeInboxBackend,supportsEdgeNotificationOperation,dispatchEdgePeerMail,dispatchEdgeEmploymentMail,reserveEdgeWhatsAppSend,recordEdgeWhatsAppThrottle,edgeDispatchHasWork} from './edge-notifications.js';
import {backendAvailable,callOperationalBackend,forwardOperationalRequest} from '../../shared/backend-service.js';
import {assertRecoveryWritable} from '../../shared/edge-recovery.js';
import {readSystemHealth,safeHealthError} from '../../shared/edge-health.js';
import {rosterRecoveryEnvironment,resolveRosterAuthorityEnvironment} from '../../shared/roster-recovery-profile.js';
import {readQuietMode,startQuietMode,endQuietMode,endQuietModeSession,QUIET_END_OPERATIONS} from '../../shared/roster-quiet-mode.js';
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
// GSiS Deploy: same-origin authenticated gateway. No secrets in browser assets.
const enc=new TextEncoder();let keys=null,keysAt=0;
function json(data,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}})}
function decode(s){if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Invalid token');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
// Coalesce concurrent key reads. A missing key refreshes once per short cooldown;
// known keys remain usable and a failed fetch never replaces the last valid set.
let keysFlight=null,unknownKeyRefreshAt=-Infinity;
async function googleSigningKey(kid){
 const now=Date.now(),fresh=keys&&now-keysAt<=3600000,known=fresh&&keys.find(k=>k.kid===kid);
 if(known)return known;
 if(!keysFlight){
  if(fresh&&now-unknownKeyRefreshAt<30000)throw Error('Unknown signing key; retry later');
  if(fresh)unknownKeyRefreshAt=now;
  keysFlight=(async()=>{
   const r=await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(8000)});
   if(!r.ok)throw Error('Key service unavailable');
   const next=(await r.json()).keys;
   if(!Array.isArray(next)||!next.length||next.length>20||new Set(next.map(k=>k?.kid)).size!==next.length||next.some(k=>!k||k.kty!=='RSA'||typeof k.kid!=='string'||!k.kid||k.kid.length>200||typeof k.n!=='string'||! /^[A-Za-z0-9_-]+$/.test(k.n)||typeof k.e!=='string'||! /^[A-Za-z0-9_-]+$/.test(k.e)||k.alg&&k.alg!=='RS256'||k.use&&k.use!=='sig'))throw Error('Invalid signing key response');
   keys=next;keysAt=Date.now();
  })().finally(()=>{keysFlight=null;});
 }
 await keysFlight;
 const key=keys.find(k=>k.kid===kid);if(!key)throw Error('Unknown signing key; retry later');return key;
}
export async function identity(token,audience){const parts=token.split('.');if(parts.length!==3)throw Error('Invalid token');const head=JSON.parse(new TextDecoder().decode(decode(parts[0]))),p=JSON.parse(new TextDecoder().decode(decode(parts[1])));if(head.alg!=='RS256'||!head.kid)throw Error('Invalid algorithm');const jwk=await googleSigningKey(head.kid);const k=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',k,decode(parts[2]),enc.encode(parts[0]+'.'+parts[1])))throw Error('Invalid signature');const now=Date.now()/1000;if(!['https://accounts.google.com','accounts.google.com'].includes(p.iss)||p.aud!==audience||typeof p.exp!=='number'||p.exp<=now||typeof p.iat!=='number'||p.iat>now+60||p.hd!=='gsps.edu.sg'||p.email_verified!==true||typeof p.sub!=='string'||!p.sub||! /^[^@\s]+@gsps\.edu\.sg$/i.test(p.email||''))throw Error('Invalid school identity');return {email:p.email.toLowerCase(),subject:p.sub,expiresAt:p.exp*1000}}
// Full Stapler saves can use ASCII JSON to protect Unicode timetable text at
// transport boundaries. Other callers keep their existing wire size and format.
export async function sign(data,secret,ascii=false){const raw=JSON.stringify(data),payload=ascii?raw.replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')):raw,k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(payload))),b=>b.toString(16).padStart(2,'0')).join('');return {payload,signature}}
async function backend(env,action,input,who,traceId){
 assertRecoveryWritable(env);
 const delegated=await callOperationalBackend(env,'roster',{action,input,identity:who,traceId});if(delegated!==undefined)return delegated;
 if(action==='edgeMigration'){try{return {result:{ok:true,data:await edgeRosterMigration(env,input,who)},backendMs:0};}catch(error){return {result:{ok:false,status:error.status||503,code:error.code,error:error.message},backendMs:0};}}
 if(edgeRosterEnabled(env)){
  const inbox=action==='rosterInbox',review=action==='rosterOperations'&&['deliveryReview','dismissDeliveryIssues','cancelPendingNotifications'].includes(input.operation);
  if(inbox||review){const started=Date.now();try{return {result:{ok:true,data:await (inbox?edgeInboxBackend(env,input,who):edgeDeliveryReviewBackend(env,input,who))},backendMs:Date.now()-started};}catch(error){return {result:{ok:false,status:error.status||503,code:error.code,error:error.status&&error.status<500?error.message:'The operation could not be confirmed.'},backendMs:Date.now()-started};}}
  return edgeRosterBackend(env,action,input,who,traceId);
 }
 const started=Date.now(),nonce=crypto.randomUUID();
 try{
  const endpoint=new URL(env.APPS_SCRIPT_URL);
  if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname))throw Object.assign(Error('Invalid backend URL'),{code:'BACKEND_CONFIG'});
  const carriesStaplerPlan=action==='rosterOperations'&&(['saveStapler','importStapler'].includes(input.operation)||input.operation==='receiptStatus'&&['saveStapler','importStapler'].includes(input.command?.operation));
  const body=await sign({action,input,identity:who,timestamp:Date.now(),nonce,traceId},gsisApiSecret(env,'BRIDGE_SECRET'),carriesStaplerPlan);
  const response=await fetch(endpoint,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json; charset=utf-8'},redirect:'follow',signal:AbortSignal.timeout(action==='rosterUpload'?55000:25000)});
  const result=await readGSiSBackendResponse(response);
  // Browser identity has already been checked. A rejected service signature must
  // not become a browser 401, which would clear the user's unsaved Stapler draft.
  if(!result.ok&&result.status===401)throw Object.assign(Error('Backend authentication failed'),{code:'BACKEND_AUTHENTICATION',upstreamStatus:401,...rosterBackendFailure(result),...(/^[a-f0-9-]{36}$/i.test(result.diagnosticId||'')?{diagnosticId:result.diagnosticId}:{})});
  return {result,backendMs:Date.now()-started,upstreamTraceId:traceId,upstreamRequestId:nonce};
 }catch(error){if(error.upstreamStatus===401)error.code='BACKEND_AUTHENTICATION';error.backendMs=Date.now()-started;error.upstreamTraceId=traceId;error.upstreamRequestId=nonce;throw error;}
}
export {backend as rosterBackend};
// Each request obtains a fresh authorised manifest from Apps Script. R2 stores
// only immutable, complete projections; it never grants access on its own.
const timetableSnapshotFlights=new WeakMap();
const orderedSnapshotValue=value=>Array.isArray(value)?value.map(orderedSnapshotValue):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,orderedSnapshotValue(value[key])])):value;
export async function timetableSnapshot(env,input,who,traceId){
 if(input.encoding==='gzip-parts-v1')return recoveryTimetableSnapshot(env,input,who,traceId,command=>backend(env,'rosterOperations',command,who,traceId));
 if(!env.ROSTER_TIMETABLE_SNAPSHOTS?.get||env.ROSTER_SNAPSHOT_CACHE!=='true')return backend(env,'rosterOperations',input,who,traceId);
 const started=Date.now(),manifestRead=await backend(env,'rosterOperations',{...input,manifestOnly:true},who,traceId),manifest=manifestRead.result.data;
 if(!manifestRead.result.ok||input.manifestOnly===true)return manifestRead;
 if(!manifest||!['baseline','suspended'].includes(manifest.stage)||![manifest.sourceKey,manifest.authorityKey].every(key=>/^[a-f0-9]{64}$/.test(key||'')))return backend(env,'rosterOperations',input,who,traceId);
 if(input.knownSourceKey===manifest.sourceKey)return {...manifestRead,result:{...manifestRead.result,data:{...manifest,unchanged:true}},backendMs:Date.now()-started};
 const bucket=env.ROSTER_TIMETABLE_SNAPSHOTS,requestKey=await sha256Hex(enc.encode(JSON.stringify(orderedSnapshotValue({stage:manifest.stage,sourceKey:manifest.sourceKey,authorityKey:manifest.authorityKey,baselineKey:manifest.baselineKey,encoding:input.encoding||'gzip-base64-v1',knownModelKeys:input.knownModelKeys||null,knownPlanKeys:input.knownPlanKeys||null})))),pointerKey='roster/timetables/v1/manifests/'+requestKey;
 const read=async()=>{
  const pointer=await bucket.get(pointerKey);if(!pointer)return null;
  const ref=await pointer.json();if(ref.sourceKey!==manifest.sourceKey||ref.authorityKey!==manifest.authorityKey||!/^roster\/timetables\/v1\/content\/[a-f0-9]{64}$/.test(ref.contentKey||''))return null;
  const object=await bucket.get(ref.contentKey);if(!object)return null;
  const data=await object.json();if(data.sourceKey!==manifest.sourceKey||data.stage!==manifest.stage||data.baselineKey!==manifest.baselineKey||typeof data.data!=='string')return null;
  return data;
 };
 let flights=timetableSnapshotFlights.get(bucket);if(!flights){flights=new Map();timetableSnapshotFlights.set(bucket,flights);}
 const build=async()=>{
  const cached=await read();if(cached)return cached;
  const claimId=crypto.randomUUID(),claimKey='timetable:'+requestKey,db=env.GSIS_JOBS;
  let claimed=false;
  if(db?.prepare){
   const now=Date.now(),result=await db.prepare('INSERT INTO gsis_read_claims (id,claim_id,lease_until) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET claim_id=excluded.claim_id,lease_until=excluded.lease_until WHERE gsis_read_claims.lease_until<=? RETURNING claim_id').bind(claimKey,claimId,now+45000,now).all();
   if(result.success===false)throw Error('Snapshot claim failed.');
   claimed=(result.results||[]).some(row=>row.claim_id===claimId);
   if(!claimed){
    // Bounded waiting, not a second origin build. A later retry reads the
    // completed object or claims the lease after a crashed builder expires.
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,250));const ready=await read();if(ready)return ready;}
    throw Object.assign(Error('Timetable snapshot is being prepared. Retry shortly.'),{code:'SNAPSHOT_BUILDING'});
   }
  }
  try{
   const value=await backend(env,'rosterOperations',{...input,expectedSourceKey:manifest.sourceKey},who,traceId);
   if(!value.result.ok)return {failure:value};
   const data=value.result.data;if(data?.sourceKey!==manifest.sourceKey||data?.stage!==manifest.stage||data?.baselineKey!==manifest.baselineKey||data?.unchanged||typeof data?.data!=='string')return {uncached:value};
   const body=JSON.stringify({...data,checkedAt:undefined}),contentKey='roster/timetables/v1/content/'+await sha256Hex(enc.encode(body));
   // An immutable request key includes the committed source and role scope.
   // Slow old builds cannot replace a newer revision's manifest. The pointer
   // is promoted only after its complete content object is durable.
   await bucket.put(contentKey,body,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
   await bucket.put(pointerKey,JSON.stringify({sourceKey:manifest.sourceKey,authorityKey:manifest.authorityKey,contentKey}),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
   return data;
  }finally{if(claimed)try{await db.prepare('DELETE FROM gsis_read_claims WHERE id=? AND claim_id=?').bind(claimKey,claimId).run();}catch{console.error(JSON.stringify({event:'roster-snapshot-lease-expiry-required'}));}}
 };
 try{
  if(!flights.has(requestKey))flights.set(requestKey,build().finally(()=>flights.delete(requestKey)));
  const data=await flights.get(requestKey);if(data.failure||data.uncached)return data.failure||data.uncached;
  return {result:{ok:true,data:{...data,checkedAt:new Date().toISOString()}},backendMs:Date.now()-started,upstreamTraceId:traceId};
 }catch(error){
  if(error.code==='SNAPSHOT_BUILDING')throw error;
  // A cache/storage failure cannot turn a permitted timetable into lost data.
  console.error(JSON.stringify({event:'roster-snapshot-cache-fallback'}));
  return backend(env,'rosterOperations',input,who,traceId);
 }
}
// Cache preparation follows confirmed business writes. It never owns the write
// receipt and cannot turn a successful save into an ambiguous browser response.
export async function warmRecoveryTimetables(env,who,traceId,{baseline=false}={}){
 if(env.ROSTER_SNAPSHOT_CACHE!=='true'||!env.ROSTER_TIMETABLE_SNAPSHOTS?.get||!env.ROSTER_TIMETABLE_SNAPSHOTS?.put||!env.GSIS_JOBS?.prepare||!env.GSIS_JOBS?.batch)return {configured:false};
 const input={operation:'timetableBatch',stage:'baseline',encoding:'gzip-parts-v1'},read=await timetableSnapshot(env,{...input,...(!baseline?{manifestOnly:true}:{})},who,traceId);
 if(!read.result?.ok)throw rosterScheduledFailure(read.result);
 const manifest=read.result.data;if(!manifest?.baselineKey)return {prepared:false};
 const suspended=await timetableSnapshot(env,{...input,stage:'suspended',baselineKey:manifest.baselineKey,baselineSourceKey:manifest.sourceKey},who,traceId);
 if(!suspended.result?.ok)throw rosterScheduledFailure(suspended.result);
 return {prepared:true};
}
function warmAfterRosterWrite(env,who,traceId,ctx,{baseline=false}={}){
 if(!ctx?.waitUntil||env.ROSTER_SNAPSHOT_CACHE!=='true')return;
 ctx.waitUntil(warmRecoveryTimetables(env,who,traceId,{baseline}).catch(error=>console.error(JSON.stringify({event:'roster-cache-preparation-pending',...safeHealthError(error),diagnosticId:traceId}))));
}

async function calendarDate(env,date,who,diagnostic){return (await calendarDates(env,[date],who,diagnostic))[date];}
async function calendarDates(env,dates,who,diagnostic={}){
 if(backendAvailable(env))return callOperationalBackend(env,'roster-calendar',{dates});
 if(edgeRosterEnabled(env)){const refs=await readEdgeRosterReferences(env);return Object.fromEntries(dates.map(date=>[date,refs.calendarByDate?.[date]||{available:false}]));}
 if(!dates.length)return {};
 const started=Date.now();
 Object.assign(diagnostic,{phase:'configuration',httpStatus:null,code:'CALENDAR_NOT_CONFIGURED'});
 const failed=message=>Object.fromEntries(dates.map(date=>[date,{available:false,message}]));
 if(!env.CALENDAR_APPS_SCRIPT_URL||!gsisApiSecret(env,'CALENDAR_PROXY_SECRET'))return failed('Calendar connection is not configured.');
 try{
  diagnostic.code='INVALID_CALENDAR_URL';
  const url=new URL(env.CALENDAR_APPS_SCRIPT_URL);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname))throw Error();
  diagnostic.code='CALENDAR_REQUEST_INVALID';
  const batch=dates.length>1;
  const requester=who?{actor:{email:who.email,sub:who.subject,userAlias:who.email.split('@')[0]}}:{service:'gsis-roster-notifier-v1'};
  Object.assign(diagnostic,{phase:'request',code:'FETCH_FAILED'});
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:batch?'rosterDates':'rosterDate',payload:batch?{dates}:{date:dates[0]},...requester,proxySecret:gsisApiSecret(env,'CALENDAR_PROXY_SECRET'),requestId:crypto.randomUUID()}),signal:AbortSignal.timeout(12000),redirect:'follow'});
  const contentType=r.headers.get('Content-Type')||'';
  Object.assign(diagnostic,{phase:'response',httpStatus:r.status,redirected:r.redirected===true,responseFormat:/\bjson\b/i.test(contentType)?'json':/\bhtml\b/i.test(contentType)?'html':'other',code:'HTTP_ERROR'});
  if(!r.ok)throw Error();
  Object.assign(diagnostic,{phase:'response-json',code:'NON_JSON_RESPONSE'});
  const x=await r.json();
  Object.assign(diagnostic,{phase:'backend-response',code:'INVALID_RESPONSE_ENVELOPE'});
  if(!x||typeof x!=='object'||Array.isArray(x))throw Error();
  if(!x.ok){
   // Log only fixed classifications, never backend text, URLs or credentials.
   diagnostic.code='BACKEND_REJECTED';
   diagnostic.backendCode=['YEAR_UNAVAILABLE','INVALID_DATE','BACKEND_ERROR'].includes(x.code)?x.code:'UNRECOGNISED_CODE';
   if(Number.isInteger(x.status)&&x.status>=100&&x.status<=599)diagnostic.backendStatus=x.status;
   diagnostic.backendError=new Map([
    ['Unauthorised proxy.','PROXY_SECRET_MISMATCH'],
    ['Backend is not configured: CALENDAR_PROXY_SECRET missing.','CALENDAR_SECRET_MISSING'],
    ['Calendar service action is not allowed.','SERVICE_ACTION_NOT_ALLOWED'],
    ['GSPS account required.','SERVICE_IDENTITY_NOT_ACCEPTED'],
    ['Verified Google subject missing.','SERVICE_IDENTITY_NOT_ACCEPTED'],
    ["Cannot read properties of null (reading 'getSheetByName')",'SPREADSHEET_UNAVAILABLE']
   ]).get(x.error)||'OTHER_BACKEND_ERROR';
   if(x.code==='YEAR_UNAVAILABLE'){diagnostic.code='YEAR_UNAVAILABLE';return failed('Calendar year is not released to staff.');}
   throw Error();
  }
  Object.assign(diagnostic,{phase:'result-validation',code:'INVALID_CALENDAR_RESULT'});
  const values=batch?x.result?.dates:[x.result];
  if(!Array.isArray(values)||values.length!==dates.length||new Set(values.map(c=>c?.date)).size!==dates.length||values.some(c=>!c||!dates.includes(c.date)||!(c.code==='YEAR_UNAVAILABLE'&&Object.keys(c).every(k=>['date','code'].includes(k)))&&(![true,false,null].includes(c.schoolDay)||!['odd','even',null].includes(c.parity))))throw Error();
  diagnostic.phase='complete';delete diagnostic.code;
  return Object.fromEntries(values.map(c=>[c.date,c.code==='YEAR_UNAVAILABLE'?{available:false,message:'Calendar year is not released to staff.'}:{...c,available:true}]));
 }catch(error){
  if(['AbortError','TimeoutError'].includes(error?.name))diagnostic.code='TIMEOUT';
  return failed('Calendar is temporarily unavailable. School timetable shown as uploaded.');
 }finally{diagnostic.elapsedMs=Date.now()-started;}
}
// Only a Worker-signed, actor/configuration-bound window may return from the
// browser. This is a bounded read optimisation; mutations always fetch Calendar.
const CALENDAR_READ_AGE=5*60000,CALENDAR_PROOF_AGE=7*86400000;
function calendarProofKey(env){return gsisApiSecret(env,'BRIDGE_SECRET')+'|roster-calendar-window-v1|'+env.CALENDAR_APPS_SCRIPT_URL+'|'+gsisApiSecret(env,'CALENDAR_PROXY_SECRET');}
function calendarWindowValues(values,dates,sourceRevision){
 if(!Array.isArray(values)||values.length!==dates.length||new Set(values.map(c=>c?.date)).size!==dates.length||values.some((c,i)=>!c||c.date!==dates[i]||c.code!=='YEAR_UNAVAILABLE'&&(![true,false,null].includes(c.schoolDay)||!['odd','even',null].includes(c.parity))))throw Error('Invalid Calendar window');
 return Object.fromEntries(values.map(c=>[c.date,c.code==='YEAR_UNAVAILABLE'?{date:c.date,sourceRevision,available:false,message:'Calendar year is not released to staff.'}:{...c,sourceRevision,available:true}]));
}
export async function cachedCalendarWindow(env,dates,who,proof,now=Date.now()){
 const failed=()=>({calendarByDate:Object.fromEntries(dates.map(date=>[date,{available:false,message:'Calendar is temporarily unavailable. Retry checking this date.'}]))});
 let saved;
 try{
  if(configuredSecret(gsisApiSecret(env,'BRIDGE_SECRET'))&&typeof proof?.payload==='string'&&enc.encode(proof.payload).byteLength<=65536&&await verifyHmac(proof.payload,proof.signature,calendarProofKey(env))){
   const data=JSON.parse(proof.payload);
   if(data.type==='roster-calendar-window-v1'&&data.email===who.email&&data.subject===who.subject&&Number.isFinite(data.checkedAt)&&data.checkedAt<=now&&now-data.checkedAt<=CALENDAR_PROOF_AGE&&/^[a-f0-9]{64}$/.test(data.sourceRevision||'')&&Array.isArray(data.dates)&&data.dates.length===62){
    const keys=data.dates.map(d=>d.date);if(keys.every((key,i)=>validDate(key)&&(!i||Date.parse(key)-Date.parse(keys[i-1])===86400000))&&dates.every(date=>keys.includes(date))){calendarWindowValues(data.dates,keys,data.sourceRevision);saved=data;}
   }
  }
 }catch{/* Invalid local data is an ordinary cache miss. */}
 if(saved&&now-saved.checkedAt<CALENDAR_READ_AGE)return {calendarByDate:calendarWindowValues(saved.dates,saved.dates.map(d=>d.date),saved.sourceRevision),calendarCache:proof,calendarCheckedAt:saved.checkedAt};
 const keys=saved?saved.dates.map(d=>d.date):Array.from({length:62},(_,i)=>new Date(Date.parse(dates[0]+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
 try{
  if(!gsisApiSecret(env,'CALENDAR_PROXY_SECRET'))throw Error();
  const url=new URL(env.CALENDAR_APPS_SCRIPT_URL);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname))throw Error();
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'rosterWindow',payload:{dates:keys,...(saved?{knownRevision:saved.sourceRevision}:{})},actor:{email:who.email,sub:who.subject,userAlias:who.email.split('@')[0]},proxySecret:gsisApiSecret(env,'CALENDAR_PROXY_SECRET'),requestId:crypto.randomUUID()}),signal:AbortSignal.timeout(12000),redirect:'follow'});
  const envelope=await response.json(),result=envelope.result;
  // Rolling deployments may briefly retain the old Calendar read contract.
  if(response.ok&&!envelope.ok&&/Unknown action|Unsupported action|Unknown API action/i.test(envelope.error||''))return {calendarByDate:await calendarDates(env,dates,who)};
  if(!response.ok||!envelope.ok||result?.schema!==1||result.from!==keys[0]||result.to!==keys.at(-1)||!/^[a-f0-9]{64}$/.test(result.sourceRevision||''))throw Error();
  const sourceAt=Date.parse(result.sourceCheckedAt),checkedAt=Math.min(now,sourceAt),certified=Number.isFinite(sourceAt)&&sourceAt<=now+60000&&now-checkedAt<CALENDAR_READ_AGE;
  if(result.unchanged&&(!saved||result.sourceRevision!==saved.sourceRevision||!certified||result.cacheable===false))throw Error();
  const values=result.unchanged?saved.dates:result.dates,calendarByDate=calendarWindowValues(values,keys,result.sourceRevision);
  // Preserve the source-read age across both cache layers. A server-side
  // conditional hit must not grant another five minutes of browser trust.
  const data={type:'roster-calendar-window-v1',email:who.email,subject:who.subject,checkedAt,sourceRevision:result.sourceRevision,dates:values};
  const calendarCache=result.cacheable!==false&&certified&&configuredSecret(gsisApiSecret(env,'BRIDGE_SECRET'))&&enc.encode(JSON.stringify(data)).byteLength<=65536?await sign(data,calendarProofKey(env)):undefined;
  return {calendarByDate,calendarCheckedAt:result.cacheable!==false&&certified?checkedAt:null,...(calendarCache?{calendarCache}:{})};
 }catch{return failed();}
}
// Calendar supplies school-day authority; an unknown earlier date cannot be
// skipped to choose a later one. This read never loads or changes allocations.
export async function nextSchoolDay(env,who,now=Date.now(),proof){
 if(edgeRosterEnabled(env)){const reply=await edgeRosterBackend(env,'rosterOperations',{operation:'nextSchoolDay'},who,crypto.randomUUID());if(!reply.result.ok)throw Object.assign(Error(reply.result.error),{status:reply.result.status});return reply.result.data;}
 const today=singaporeDate(now),dates=Array.from({length:62},(_,i)=>new Date(Date.parse(today+'T00:00:00Z')+(i+1)*86400000).toISOString().slice(0,10)),cached=configuredSecret(gsisApiSecret(env,'BRIDGE_SECRET'))?await cachedCalendarWindow(env,dates,who,proof,now):{calendarByDate:await calendarDates(env,dates,who)},values=cached.calendarByDate,extra=cached.calendarCache?{calendarCache:cached.calendarCache}:{};
 for(const date of dates){const value=values[date];if(value?.available!==true||typeof value.schoolDay!=='boolean')return {today,date:null,available:false,...extra,message:'The next school day could not be verified. Choose a date manually or retry.'};if(value.schoolDay)return {today,date,available:true,...extra};}
 return {today,date:null,available:false,...extra,message:'No school day was found in the next 62 days. Choose a date manually.'};
}
// Assign Relief quiet mode. Status is readable by any signed-in user; switching
// needs current SMC or Admin authority from a fresh signed Google read.
async function quietModeRoute(req,env,u){
 let who;try{who=await requestIdentity(req,env);}catch{return json({ok:false,error:'Sign in with your school account.'},401);}
 try{
  if(req.method==='GET')return json({ok:true,data:await readQuietMode(env.GSIS_JOBS)});
  if(req.method!=='POST'||req.headers.get('Origin')!==u.origin)return json({ok:false,error:'Same-origin POST required'},403);
  let input;try{input=await req.json();}catch{return json({ok:false,error:'Invalid request'},400);}
  if(!['on','off'].includes(input?.action))return json({ok:false,error:'Choose on or off.'},400);
  const auth=(await backend((typeof resolveRosterAuthorityEnvironment==='function'?await resolveRosterAuthorityEnvironment(env):rosterRecoveryEnvironment(env)),'rosterOperations',{operation:'read',view:'intake',scope:'mine'},who,crypto.randomUUID())).result;
  if(!auth?.ok)return json({ok:false,error:'Current school authority could not be confirmed.'},[401,403].includes(auth?.status)?403:503);
  if(auth.data?.user?.smc!==true&&auth.data?.user?.admin!==true)return json({ok:false,error:'SMC or Admin access is required.'},403);
  return json({ok:true,data:input.action==='on'?await startQuietMode(env.GSIS_JOBS,who.email):await endQuietMode(env.GSIS_JOBS,who.email,'manual')});
 }catch(error){return json({ok:false,error:error.status&&error.status<500?error.message:'Quiet mode could not be confirmed.'},error.status||503);}
}
const D1_PREPARE_OPERATIONS=new Set(['status','import','export','restart']);
async function d1PrepareAllows(req,env){
 if(env.ROSTER_D1_PREPARE!=='import'||req.method!=='POST')return false;
 try{const input=JSON.parse(await req.clone().text());return D1_PREPARE_OPERATIONS.has(input?.operation);}catch{return false;}
}
export default {async fetch(req,env,ctx){
 const u=new URL(req.url);
 if(u.pathname==='/api/venues-source')return json({ok:false,code:'RECOVERY_VENUES_SUSPENDED',error:'Venue occupancy export is paused during Roster recovery.'},503);
 // Health validates the caller and current Google role before reading any D1 ownership metadata.
 if(u.pathname==='/api/system-health')return systemHealthRoute(req,{...rosterRecoveryEnvironment(env),GSIS_REQUEST_ORIGIN:u.origin},env);
 try{env={...(typeof resolveRosterAuthorityEnvironment==='function'?await resolveRosterAuthorityEnvironment(env):rosterRecoveryEnvironment(env)),GSIS_REQUEST_ORIGIN:u.origin};}
 catch(error){return json({ok:false,code:error.code||'ROSTER_AUTHORITY_UNVERIFIED',error:error.message},error.status||503);}
 if(u.pathname.startsWith('/api/')&&!['/api/session','/api/logout'].includes(u.pathname))try{gsisApiSecret(env,'BRIDGE_SECRET');}catch(error){return json({ok:false,code:error.code,error:error.message},503);}
 // Migration is deliberately absent from the restoration release. In
 // particular, an old dashboard binding must not reactivate a second writer.
 // 0.9.9a D1 preparation: ROSTER_D1_PREPARE=import reopens only read and copy
 // controls plus the guarded abandonment of an incomplete import. Activation,
 // pause and resume stay closed, so Google remains the only writer.
 if(u.pathname==='/api/edge/migration'&&!edgeRosterEnabled(env)&&!(await d1PrepareAllows(req,env)))return json({ok:false,code:'RECOVERY_MIGRATION_DISABLED',error:'Migration is disabled in this Roster restoration release.'},404);
 if(u.pathname==='/api/venues-source')return json({ok:false,code:'RECOVERY_VENUES_SUSPENDED',error:'Venue occupancy export is paused during Roster recovery.'},503);
 if(u.pathname.startsWith('/api/')&&!['/api/config','/api/session'].includes(u.pathname)){try{assertRecoveryWritable(env);}catch(error){return json({ok:false,code:error.code,error:error.message},503);}}
 if(u.pathname==='/api/venues-source'||/^\/api\/whatsapp\/(?:media|reports)\//.test(u.pathname)){try{const delegated=await forwardOperationalRequest(req,env,'roster');if(delegated!==undefined)return delegated;}catch(error){return json({ok:false,code:error.code,error:error.status<500?error.message:'The operational service could not be confirmed.'},error.status||503);}}
 if(u.pathname==='/api/whatsapp/webhook')return whatsappWebhook(req,env,ctx);
 if(u.pathname.startsWith('/api/whatsapp/media/'))return inboxMediaRoute(req,env);
 if(u.pathname.startsWith('/api/whatsapp/reports/'))return deliveryReportRoute(req,env);
 if(u.pathname==='/api/external')return externalRoute(req,env);
 if(u.pathname==='/api/venues-source'){const {edgeVenuesSourceRoute}=await import('./edge-timetable-cache.js');return edgeVenuesSourceRoute(req,env);}
 const session=await sessionRoute(req,env);if(session)return session;
 if(!u.pathname.startsWith('/api/')){
  const response=await env.ASSETS.fetch(req);
  if(!['/external.html','/external.js','/external.css'].includes(u.pathname))return response;
  const safe=new Response(response.body,response);safe.headers.set('Cache-Control','no-store');safe.headers.set('Referrer-Policy','no-referrer');safe.headers.set('X-Content-Type-Options','nosniff');safe.headers.set('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");return safe;
 }
 if(u.pathname==='/api/config'){const {routes,...notifications}=notificationStatus(env);return json({version:'0.9.9',clientId:env.GOOGLE_CLIENT_ID||'',notifications});}
 if(u.pathname==='/api/quiet-mode')return quietModeRoute(req,env,u);
 const action={'/api/profile':'rosterProfile','/api/read':'rosterRead','/api/upload':'rosterUpload','/api/update':'rosterUpdate','/api/operations':'rosterOperations','/api/edge/migration':'edgeMigration'}[u.pathname];
 if(!action)return json({ok:false,error:'Not found'},404);
 if(req.method!=='POST'||req.headers.get('Origin')!==u.origin)return json({ok:false,error:'Same-origin POST required'},403);
 if(!env.APPS_SCRIPT_URL||!gsisApiSecret(env,'BRIDGE_SECRET')||gsisApiSecret(env,'BRIDGE_SECRET').length<32)return json({ok:false,error:'Roster connection is not configured.'},503);
 let who;try{who=await requestIdentity(req,env)}catch{return json({ok:false,error:'Sign in with your school account.'},401)}
 const raw=await req.text(),requestBytes=enc.encode(raw).byteLength;if(requestBytes>(action==='rosterUpload'?11000000:action==='rosterOperations'?4100000:action==='rosterProfile'?131072:4000))return json({ok:false,error:'Request too large'},413);
 let input;try{input=JSON.parse(raw);if(!input||Array.isArray(input)||typeof input!=='object')throw Error()}catch{return json({ok:false,error:'Invalid request'},400)}
 if(action==='rosterProfile'&&input.view!=='report'&&requestBytes>4000)return json({ok:false,error:'Request too large'},413);
 const carriesStaplerPlan=action==='rosterOperations'&&(['saveStapler','importStapler'].includes(input.operation)||input.operation==='receiptStatus'&&['saveStapler','importStapler'].includes(input.command?.operation));
 if(action==='rosterOperations'&&!carriesStaplerPlan&&requestBytes>262144)return json({ok:false,error:'Request too large'},413);
 if(carriesStaplerPlan){const command=input.operation==='receiptStatus'?input.command:input;for(const plan of [command.plan,command.basePlan])if(plan!==undefined&&enc.encode(JSON.stringify(plan)).byteLength>1900000)return json({ok:false,error:'Timetable plan is too large'},413);}
 const traceId=crypto.randomUUID(),requestStarted=Date.now();let calendarMs=0,backendMs=0;
 try{
  if(action==='rosterOperations'){
   if(INBOX_OPERATIONS.has(input.operation))return inboxOperation(input,env,who,traceId,ctx);
   if(String(input.operation||'').startsWith('inbox'))return json({ok:false,error:'Inbox operation not allowed.'},403);
   if(input.operation==='nextSchoolDay'&&!backendAvailable(env))return json({ok:true,data:await nextSchoolDay(env,who,Date.now(),input.calendarCache)});
   const captured=await absenceTransportRoute(req,input,env,who,traceId,ctx);if(captured)return captured;
   if(['autoAllocate','optimise'].includes(input.operation))await assertAbsenceTransportReady(env,[input.date||singaporeDate()],['autoAllocate','optimise'].includes(input.operation),who);
   const calendarOutput={};
   try{const stage=Date.now();input=await trustedOperationsInput(input,env,who,calendarOutput);calendarMs=Date.now()-stage;}catch(error){return json({ok:false,error:error.message},400)}
   const quietEnds=Object.hasOwn(QUIET_END_OPERATIONS,input.operation),quietSession=quietEnds?await readQuietMode(env.GSIS_JOBS,requestStarted).then(q=>q.active&&q.startedAt<=requestStarted?q.startedAt:0).catch(()=>0):0;
   const value=input.operation==='timetableBatch'&&!edgeRosterEnabled(env)&&!backendAvailable(env)?await timetableSnapshot(env,input,who,traceId):await backend(env,action,input,who,traceId);backendMs=value.backendMs;
   value.result=await reconcileInactiveReplacements(env,input,value.result,who,traceId);
   // A confirmed publish or WhatsApp send ends quiet mode on the server, not in the browser.
   // Only work done now ends it: a replayed receipt (a retry, or a request from an
   // earlier session) ends nothing, and only the session active when this request
   // arrived can end. A lost-response retry leaves quiet on until expiry or manual end.
   if(value.result?.ok&&quietSession&&!(value.result.data?.replayed||value.result.replayed))await endQuietModeSession(env.GSIS_JOBS,who.email,QUIET_END_OPERATIONS[input.operation],quietSession).catch(()=>{});
   if(input.operation==='statisticsCalendar'&&!edgeRosterEnabled(env)&&!backendAvailable(env)&&value.result.ok){const stage=Date.now();value.result.data=await statisticsCalendar(env,who,input.year);calendarMs=Date.now()-stage;}
   if(value.result.ok&&['createStapler','importStapler','saveStapler','confirmStapler','publishStapler','resetStapler','moveStapler','restoreStapler','deleteStapler','renameStapler'].includes(input.operation))warmAfterRosterWrite(env,who,traceId,ctx);
   if(value.result.ok&&value.result.data)Object.assign(value.result.data,calendarOutput);
   if(value.result.ok&&value.result.data?.notificationsQueued)value.result.data.notificationDispatch={state:'queued',mode:env.NOTIFICATION_DISPATCH_URL?'immediate':'scheduled'};
   if(value.result.ok&&value.result.data?.capability){
    const capability=value.result.data.capability;
    if(input.operation!=='externalLink')throw Error('Unexpected delegated access');
    if(!configuredSecret(env.EXTERNAL_LINK_SECRET)||!env.ROSTER_PUBLIC_ORIGIN)return json({ok:false,error:'Private relief links are not configured. Ask Admin to complete the Roster link settings.'},503);
    value.result.data={...value.result.data,externalUrl:await externalUrl(capability,env)};delete value.result.data.capability;
   }
   if(value.result.ok&&value.result.data?.notifications&&(value.result.data.user?.smc===true||value.result.data.user?.admin===true)&&input.view==='notificationReadiness')value.result.data.notifications.readiness=notificationStatus(env);
   if(value.result.ok&&value.result.data?.notificationsQueued&&ctx?.waitUntil)ctx.waitUntil(enqueueNotificationWake(env).catch(()=>console.error(JSON.stringify({event:'roster-notification-wake-failed',diagnosticId:traceId}))));
   if(value.result.ok&&value.result.data?.intakeReceipt&&ctx?.waitUntil)ctx.waitUntil(wakeAbsenceIntake(env).catch(()=>console.error(JSON.stringify({event:'roster-intake-wake-failed',diagnosticId:traceId}))));
   if(value.result.ok&&value.result.data?.dailyEmploymentMailQueued&&ctx?.waitUntil)ctx.waitUntil(dispatchDailyEmploymentReports(env).catch(()=>console.error(JSON.stringify({event:'roster-employment-email-dispatch-failed',diagnosticId:traceId}))));
   if(!value.result.ok&&(value.result.status||503)>=500)return rosterFailure(action,traceId,{operation:input.operation,calendarMs,backendMs,totalMs:Date.now()-requestStarted,code:'BACKEND_ERROR',status:value.result.status||503,...rosterBackendFailure(value.result)});
   console.info(JSON.stringify({event:'roster-operation',operation:input.operation,diagnosticId:traceId,calendarMs,backendMs,totalMs:Date.now()-requestStarted,status:value.result.ok?200:value.result.status||503}));
   const response=json(value.result,value.result.ok?200:value.result.status||503);response.headers.set('Server-Timing','calendar;dur='+calendarMs+', backend;dur='+backendMs);return response;
  }
  const reportProfile=action==='rosterProfile'&&input.view==='report',reportCalendarOutput={};
  if(reportProfile){
   try{const stage=Date.now(),{operation,...trusted}=await trustedOperationsInput({...input,operation:'read',view:'report',compact:true},env,who,reportCalendarOutput);input=trusted;calendarMs=Date.now()-stage;}catch(error){return json({ok:false,error:error.message},400)}
  }
  const needsCalendar=action==='rosterRead'&&input.view!=='names'&&input.calendar!==false||action==='rosterProfile'&&!reportProfile&&input.view!=='reportForm'&&input.preload===true&&input.calendar!==false;
  const calendarDiagnostic={};
  const [backendRead,calendarRead]=await Promise.allSettled([backend(env,action,input,who,traceId),needsCalendar?(async()=>{const started=Date.now();try{return await calendarDate(env,input.date,who,calendarDiagnostic);}finally{calendarMs=Date.now()-started;}})():Promise.resolve(null)]);
  if(needsCalendar)console.info(JSON.stringify({event:'roster-calendar-read',diagnosticId:traceId,calendarMs,...calendarDiagnostic}));
  if(backendRead.status==='rejected')throw backendRead.reason;
  if(calendarRead.status==='rejected')throw calendarRead.reason;
  const value=backendRead.value,calendar=calendarRead.value;backendMs=value.backendMs;
  if(!value.result.ok&&(value.result.status||503)>=500)return rosterFailure(action,traceId,{calendarMs,backendMs,totalMs:Date.now()-requestStarted,code:'BACKEND_ERROR',status:value.result.status||503,...rosterBackendFailure(value.result)});
  if(value.result.ok&&['rosterUpload','rosterUpdate'].includes(action))warmAfterRosterWrite(env,who,traceId,ctx,{baseline:true});
  if(value.result.ok&&calendar)value.result.data.calendar=calendar;
  if(value.result.ok&&reportProfile){Object.assign(value.result.data,reportCalendarOutput);if(value.result.data.reportData)Object.assign(value.result.data.reportData,reportCalendarOutput);}
  const response=json(value.result,value.result.ok?200:value.result.status||503);response.headers.set('Server-Timing','calendar;dur='+calendarMs+', backend;dur='+backendMs);return response;
 }catch(error){if(error.code==='ABSENCE_TRANSPORT_PENDING')return json({ok:false,error:error.message,code:error.code},409);return rosterFailure(action,error.diagnosticId||traceId,{operation:action==='rosterOperations'?input.operation:undefined,calendarMs,backendMs:error.backendMs||backendMs,totalMs:Date.now()-requestStarted,code:['AbortError','TimeoutError'].includes(error.name)?'UPSTREAM_TIMEOUT':error.code||'BACKEND_UNAVAILABLE',responseInfo:error.responseInfo,upstreamStatus:error.upstreamStatus,...rosterBackendFailure(error)});}
}};
function rosterBackendFailure(result){
 const safe=safeHealthError(result),{code,httpStatus,...detail}=safe;
 return {...detail,...(code===result.code?{code}:{}),...(['ABSENCE_PREPARATION_RETRY','ABSENCE_INTAKE_BUSY','ABSENCE_INTAKE_PENDING'].includes(result.code)?{backendCode:result.code,...(['TIMETABLE_MANIFEST_CHANGED','ABSENCE_CONTEXT_CHANGED','SCHOOL_DATE_CHANGED','REFERENCE_SOURCE_CHANGED'].includes(result.reasonCode)?{reasonCode:result.reasonCode}:{}),...(result.attempts===2?{attempts:2}:{})}:{})};
}
function rosterFailure(action,diagnosticId,detail){
 console.error(JSON.stringify({event:'roster-request-failed',action,diagnosticId,...detail}));
 const saving=action==='rosterUpload'||action==='rosterUpdate',reading=action==='rosterOperations'&&['archiveItems','archivedItem','statistics','statisticsCalendar','acknowledgementStatus','deliveryReview','calculations','read','directory','candidates','availability','audit','prunePreview','externalLink','health','accounting','allocation','allocationVersion','history','exportDaily','dailyTimetable','teacherDailyUpdate','currentDuty','timetableBatch','timetableDay','timetablePreparationManifest','timetablePreparationPart','timetablePreparationCheck','stapler','staplerDates','dutyRoster','systemConfig','dailyEmployment','dailyNotify','nameBridges'].includes(detail.operation);
 let error=saving?'The timetable save could not be confirmed. Retry the same save.':action==='rosterOperations'?(reading?'Roster records could not load. Retry loading.':'The Roster save could not be confirmed. Retry the same save.'):'Roster is temporarily unavailable. Use Retry or Refresh to try again.';
 if(reading&&detail.operation==='stapler')error+=' Keep the saved date; share the reference with Admin.';
 if(detail.code==='UPSTREAM_TIMEOUT')error+=' The backend took too long to respond.';
 else if(detail.code==='BACKEND_AUTHENTICATION')error+=' The Roster connection could not be verified. Ask Admin to check the backend deployment and shared secret.';
 else if(detail.code==='UPSTREAM_RESPONSE'||detail.code==='BACKEND_CONFIG')error+=' '+gsisResponseAdvice(detail);
 const response=json({ok:false,error,diagnosticId,code:detail.code,...rosterBackendFailure(detail)},503);
 if(Number.isFinite(detail.backendMs))response.headers.set('Server-Timing','calendar;dur='+(detail.calendarMs||0)+', backend;dur='+detail.backendMs);
 return response;
}
// Browser session: host-only HttpOnly cookie. Google identity is verified once at
// issuance; application permissions remain authoritative in Apps Script on every call.
const SESSION_COOKIE='__Host-gsis_session';
const sessionAge=env=>Math.max(1,Math.min(30,Number(env.SESSION_DAYS)||7))*86400000;
const sessionKey=(env,origin)=>env.BRIDGE_SECRET+'|gsis-browser-session-v1|'+origin;
function sessionHeader(value,age){return SESSION_COOKIE+'='+value+'; Path=/; Max-Age='+Math.floor(age/1000)+'; Secure; HttpOnly; SameSite=Lax'}
export async function readSession(req,env){
 const origin=new URL(req.url).origin,raw=(req.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1);
 if(!raw||raw.length>5000||!env.BRIDGE_SECRET||env.BRIDGE_SECRET.length<32)throw Error('No session');
 const [encoded,signature,...extra]=raw.split('.');if(extra.length||!signature||!/^[a-f0-9]{64}$/.test(signature))throw Error('Invalid session');
 const payload=new TextDecoder().decode(decode(encoded)),key=await crypto.subtle.importKey('raw',enc.encode(sessionKey(env,origin)),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)),enc.encode(payload)))throw Error('Invalid session');
 const data=JSON.parse(payload),now=Date.now();if(data.purpose!=='gsis-session-v1'||data.origin!==origin||!Number.isFinite(data.issued)||!Number.isFinite(data.expires)||data.issued>now+60000||data.expires<=now||data.expires-data.issued>sessionAge(env)||!data.subject||typeof data.subject!=='string'||! /^[^@\s]+@gsps\.edu\.sg$/.test(data.email||''))throw Error('Expired session');
 return {email:data.email,subject:data.subject,expiresAt:data.expires};
}
async function requestIdentity(req,env){const auth=req.headers.get('Authorization');if(auth){if(!auth.startsWith('Bearer ')||auth.length>16000)throw Error('Invalid identity');return identity(auth.slice(7),env.GOOGLE_CLIENT_ID)}return readSession(req,env)}
export async function systemHealthRoute(req,env,authorityEnv=env){
 const origin=new URL(req.url).origin;
 if(req.method!=='POST'||req.headers.get('Origin')!==origin)return json({ok:false,error:'Same-origin POST required.'},403);
 let who;try{who=await requestIdentity(req,env);}catch{return json({ok:false,error:'Sign in with your school account.'},401);}
 const raw=await req.text();if(enc.encode(raw).byteLength>4000)return json({ok:false,error:'Request too large.'},413);
 let input;try{input=JSON.parse(raw);if(!input||Array.isArray(input)||typeof input!=='object'||!['read','retryBackgroundJob','recordRecoveryCheckpoint','peerMailReview','reviewPeerMail'].includes(input.operation))throw Error();}catch{return json({ok:false,error:'Choose a supported health operation.'},400);}
 try{
  if(['peerMailReview','reviewPeerMail'].includes(input.operation)){
   // The backend verifies current Admin authority under its notification lock.
   // This separate command cannot route into the retired operational authority.
   const result=(await backend(env,'rosterOperations',input,who,crypto.randomUUID())).result;
   if(!result?.ok)return json({ok:false,...safeHealthError(result),error:[401,403].includes(result?.status)?'Current Admin access is required.':'Colleague email review could not be confirmed. Retry the same action.'},[401,403].includes(result?.status)?403:result?.status||503);
   return json(result);
  }
  const result=await callOperationalBackend({...env,GSIS_REQUEST_ORIGIN:origin},'health',{input,identity:who});
  if(result===undefined){
   env={...rosterRecoveryEnvironment(env),GSIS_REQUEST_ORIGIN:origin};
   if(input.operation!=='read')return json({ok:false,code:'RECOVERY_HEALTH_READ_ONLY',error:'Recovery health supports status reads only.'},400);
   // A fresh signed Google request checks current Contacts authority on every
   // read. Browser role claims and old D1 authority are never trusted.
   const authInput=authorityEnv.ROSTER_EDGE_AUTHORITY==='d1'?{operation:'edgeHealthAuthority'}:{operation:'read',view:'intake',scope:'mine'};
   const auth=(await backend(env,'rosterOperations',authInput,who,crypto.randomUUID())).result;
   if(!auth?.ok)return json({ok:false,...safeHealthError(auth),error:'Current school authority could not be confirmed.'},[401,403].includes(auth?.status)?403:503);
   if(auth.data?.user?.smc!==true&&auth.data?.user?.admin!==true)return json({ok:false,error:'SMC or Admin access is required.'},403);
   const statusEnv=typeof resolveRosterAuthorityEnvironment==='function'?await resolveRosterAuthorityEnvironment(authorityEnv):env;
   const snapshot={...await readSystemHealth(statusEnv,{jobsOnly:true}),googleBackup:await readRosterMirrorStatus(statusEnv),quotaSnapshot:await readQuotaSnapshotStatus(statusEnv).catch(()=>({configured:true,available:false,status:'missing',lastCode:'QUOTA_SNAPSHOT_STORAGE'}))},jobs=new Set(['quota-snapshot','google-backup','allocation','notifications','received-reports','inbox','webhook','peer-mail','r2-cleanup','audit-export']);
   snapshot.jobs=snapshot.jobs.filter(row=>jobs.has(row.job));snapshot.recentFailures=snapshot.recentFailures.filter(row=>jobs.has(row.job));
   const reports={available:false,transportAvailable:false,href:'/'};let peerMailReviewAllowed=false;
   try{
    const review=(await backend(env,'rosterOperations',{operation:'read',view:'intake'},who,crypto.randomUUID())).result;
    if([401,403].includes(review?.status)||review?.ok&&review.data?.user?.smc!==true&&review.data?.user?.admin!==true)return json({ok:false,error:'Current SMC or Admin access is required.'},403);
    if(review?.ok&&(review.data?.user?.smc===true||review.data?.user?.admin===true)){
     peerMailReviewAllowed=review.data.user.admin===true;
     const count=value=>Number.isSafeInteger(value)&&value>=0&&value<=1e9;
     if(count(review.data.pendingCaptureCount)&&count(review.data.peerReviewCount))Object.assign(reports,{available:true,pendingCaptureCount:review.data.pendingCaptureCount,peerReviewCount:review.data.peerReviewCount,checkedAt:Date.now()});
    }
   }catch(error){if([401,403].includes(error?.status)||[401,403].includes(error?.upstreamStatus))return json({ok:false,error:'Current school authority could not be confirmed.'},403);/* A report read outage must stay unavailable, never become zero. */}
   return json({ok:true,data:{...snapshot,readOnly:true,profile:'google-recovery',reports,peerMailReviewAllowed}});
  }
  return json(result,result.ok?200:result.status||503);
 }catch(error){return json({ok:false,...safeHealthError(error),error:'System Health could not be confirmed.'},[401,403].includes(error.status)?403:503);}
}
async function sessionRoute(req,env){
 const u=new URL(req.url);if(!['/api/session','/api/logout'].includes(u.pathname))return null;
 if(!env.BRIDGE_SECRET||env.BRIDGE_SECRET.length<32||!env.GOOGLE_CLIENT_ID)return json({ok:false,error:'Configure school sign-in first.'},503);
 if(req.method==='POST'&&req.headers.get('Origin')!==u.origin)return json({ok:false,error:'Origin not allowed'},403);
 if(u.pathname==='/api/logout'){if(req.method!=='POST')return json({ok:false,error:'POST required'},405);const res=json({ok:true});res.headers.set('Set-Cookie',sessionHeader('',0));return res}
 if(req.method==='GET'){try{return json({ok:true,data:{user:await readSession(req,env)}})}catch{return json({ok:false,error:'Sign in required'},401)}}
 if(req.method!=='POST')return json({ok:false,error:'POST required'},405);
 try{const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer ')||auth.length>16000)throw Error();const who=await identity(auth.slice(7),env.GOOGLE_CLIENT_ID),issued=Date.now(),age=sessionAge(env),data={purpose:'gsis-session-v1',origin:u.origin,email:who.email,subject:who.subject,issued,expires:issued+age};const signed=await sign(data,sessionKey(env,u.origin)),value=btoa(signed.payload).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')+'.'+signed.signature;const response=json({ok:true,data:{user:who,expiresAt:data.expires}});response.headers.set('Set-Cookie',sessionHeader(value,age));return response}catch{return json({ok:false,error:'Sign in again with your school account.'},401)}
}

/* GSIS_BACKEND_RESPONSE_BEGIN */
/* Shared gateway response diagnostics. Never return or log the upstream body/URL. */
function gsisResponseInfo(response,raw){
 let kind='invalid-json',format='text';
 const text=String(raw||'').trim(),html=/^<!doctype\s+html|^<html\b/i.test(text)||/<(?:html|body)\b/i.test(text.slice(0,500));
 if(html){format='html';kind='html';}
 if(/^[\[{]/.test(text))format='json';
 let host='';try{host=new URL(response.url).hostname;}catch{}
 if(host==='accounts.google.com'||html&&/accounts\.google\.com\/ServiceLogin|Sign in.*Google|Access denied|You need permission/i.test(text))kind='access';
 else if(html&&/Script function not found|ReferenceError|SyntaxError|TypeError|script.*(?:error|failed)|Exception:/i.test(text))kind='execution';
 else if(html&&/file.*(?:does not exist|not found)|Page not found|unable to open/i.test(text))kind='deployment';
 return {kind,format,status:Number(response.status)||0};
}
async function readGSiSBackendResponse(response){
 if(!response.ok)throw Object.assign(Error('Backend HTTP failure'),{code:'UPSTREAM_HTTP',upstreamStatus:response.status});
 let raw='',result;
 try{
  // The fallback supports minimal service test doubles; Fetch Response always has text().
  if(typeof response.text==='function'){raw=await response.text();result=JSON.parse(raw.replace(/^\uFEFF/,''));}
  else result=await response.json();
  if(!result||Array.isArray(result)||typeof result.ok!=='boolean')throw Error('Invalid envelope');
  return result;
 }catch(error){
  if(['TimeoutError','AbortError'].includes(error.name))throw error;
  throw Object.assign(Error('Invalid backend response'),{code:'UPSTREAM_RESPONSE',responseInfo:gsisResponseInfo(response,raw)});
 }
}
function gsisResponseAdvice(error,layout=false){
 if(error.code==='UPSTREAM_SCHEMA')return 'Layout received an incompatible data response. Ask an Admin to check the installed Deploy backend version.';
 if(error.code==='BACKEND_CONFIG')return 'The backend connection URL is not configured correctly.';
 if(error.code!=='UPSTREAM_RESPONSE')return '';
 switch(error.responseInfo?.kind){
  case 'access':return 'Google blocked the backend request. Ask an Admin to check the Apps Script web app access settings.';
  case 'execution':return 'Apps Script returned an execution error. '+(layout?'Ask an Admin to run diagnoseLayout601 in the Deploy script and read its execution log.':'Ask an Admin to check the backend execution log.');
  case 'deployment':return 'The Apps Script deployment could not be opened. Ask an Admin to check the existing web app URL.';
  default:return 'Apps Script returned an unreadable response. '+(layout?'Ask an Admin to check the deployed backend and run diagnoseLayout601 in the Deploy script.':'Ask an Admin to check the deployed backend and its access settings.');
 }
}

/* GSIS_BACKEND_RESPONSE_END */

// Operational context is assembled here, after authentication. Browser-supplied
// calendar decisions, clock values and capability claims are never trusted.
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value}
function singaporeDate(now=Date.now()){return new Date(now+8*3600000).toISOString().slice(0,10)}
export function operationDates(input,selectionOnly=false){
 const absence=['saveAbsence','saveInstructions'].includes(input.operation),max=absence?366:62,from=input.from||input.startDate||input.fromDate,to=input.to||input.endDate||input.toDate,viewDate=absence&&(input.dates!==undefined||from||to)?input.date:undefined,dates=new Set();
 const add=date=>{if(!validDate(date))throw Error('Choose a valid date.');dates.add(date);if(dates.size>max)throw Error('Choose a date range of at most '+max+' days.')};
 if(input.date!==undefined&&viewDate===undefined)add(input.date);
 if(input.operation==='moveStapler')add(input.newDate);
 if(input.dates!==undefined){if(!Array.isArray(input.dates)||input.dates.length>max)throw Error('Choose at most '+max+' dates.');input.dates.forEach(add)}
 if(from||to){if(!validDate(from)||!validDate(to)||from>to)throw Error('Choose a valid date range.');if((Date.parse(to)-Date.parse(from))/86400000>max-1)throw Error('Choose a date range of at most '+max+' days.');for(let t=Date.parse(from);t<=Date.parse(to);t+=86400000)add(new Date(t).toISOString().slice(0,10))}
 if(!dates.size)add(singaporeDate());const selected=[...dates].sort();if(absence&&Date.parse(selected.at(-1))-Date.parse(selected[0])>365*86400000)throw Error('Choose an absence range of no more than 366 days.');
 // The viewed day is context, not another day of the absence selection.
 if(!selectionOnly&&viewDate!==undefined){if(!validDate(viewDate))throw Error('Choose a valid date.');dates.add(viewDate);}return [...dates].sort();
}
async function statisticsCalendar(env,who,year){
 if(!Number.isInteger(Number(year))||Number(year)<2000||Number(year)>2200)throw Error('Choose a valid calendar year.');
 if(!env.CALENDAR_APPS_SCRIPT_URL||!gsisApiSecret(env,'CALENDAR_PROXY_SECRET'))throw Error('Calendar connection is not configured.');
 const url=new URL(env.CALENDAR_APPS_SCRIPT_URL);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(url.pathname))throw Error('Invalid Calendar connection.');
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'rosterStatisticsCalendar',payload:{year:Number(year)},actor:{email:who.email,sub:who.subject,userAlias:who.email.split('@')[0]},proxySecret:gsisApiSecret(env,'CALENDAR_PROXY_SECRET'),requestId:crypto.randomUUID()}),signal:AbortSignal.timeout(12000),redirect:'follow'});
 const value=await response.json();if(!response.ok||!value.ok||!Array.isArray(value.data?.terms)||!Array.isArray(value.data?.semesters))throw Error('School calendar periods could not be loaded.');return value.data;
}
export async function trustedOperationsInput(input,env,who,calendarOutput={},now=Date.now()){
 const {inactiveReconcileDates,...browserInput}=input;input=browserInput;
 if(edgeRosterEnabled(env)){const safe={...input};for(const key of ['calendarByDate','calendarCache','calendar','capability','identity','service','trustedIntakeAt','trustedNow','pendingTransportDates'])delete safe[key];return safe;}
 if(typeof input.operation!=='string'||!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(input.operation))throw Error('Choose a valid Roster operation.');
 // Preparation has a narrow read-only contract and no Calendar dependency.
 if(['timetablePreparationManifest','timetablePreparationPart','timetablePreparationCheck'].includes(input.operation)){const safe={...input};for(const key of ['calendarByDate','calendarCache','calendar','capability','identity','service','trustedIntakeAt','trustedNow','pendingTransportDates'])delete safe[key];return safe;}
 const intake=input.intake===true&&['saveAbsence','requestMutual'].includes(input.operation);
 if(input.intake===true&&!intake)throw Error('Intake capture is available only for absence reports and peer proposals.');
 // Saved-record projections do not need a live school-day decision. Planning
 // and every timetable-dependent save still obtain fresh Calendar context.
 const schoolDeletion=input.operation==='deleteAbsences'&&input.view==='schoolAbsences'&&Array.isArray(input.dates);
 const requestedDates=intake||(input.operation==='read'&&['intake','intakeReview','reportForm','currentDuty','schoolAbsences'].includes(input.view))||['archiveColdOutput','archiveItems','archivedItem','statistics','statisticsCalendar','acknowledgementStatus','deliveryReview','peerMailReview','reviewPeerMail','dismissDeliveryIssues','cancelPendingNotifications','saveCustomInstruction','deleteCustomInstruction','setCustomInstructionEnabled','allocationVersion','teacherDailyUpdate','currentDuty','timetableBatch','timetableDay','receiptStatus','retryAbsenceIntake','resolveAbsenceIntake','cancelAllocationRun','renameStapler','deleteStapler','calculations','directory','prune','prunePreview','saveRecessSettings','dutyRoster','setDutySMC','systemConfig','saveSystemConfig','dailyEmployment','saveDailyEmploymentSettings','staplerDates','requestStapler','decideStapler','acquireStaplerLock','renewStaplerLock','releaseStaplerLock','nameBridges','saveNameBridge','deleteNameBridge'].includes(input.operation)?[]:schoolDeletion?[...new Set(input.dates.map(date=>{if(!validDate(date))throw Error('Choose a valid date.');return date;}))]:operationDates(input),dates=['history','acknowledge','audit','accounting'].includes(input.operation)||input.operation==='read'&&['custom','duties','mine','prune','notificationReadiness','nameBridges'].includes(input.view)?[]:requestedDates;
 // Wide school-absence selections keep one atomic save; Calendar accepts up
 // to 62 selected dates per context request, never the entire search interval.
 const cacheRead=input.operation==='read'&&['allocation','report','entry'].includes(input.view)||input.operation==='allocationVersion'&&input.statusOnly!==true;
 const wanted=cacheRead?operationDates(input):dates;
 const cached=cacheRead?await cachedCalendarWindow(env,wanted,who,input.calendarCache,now):null;
 if(cached?.calendarCache)calendarOutput.calendarCache=cached.calendarCache;
 if(cached&&input.operation==='read'&&['report','entry'].includes(input.view)){calendarOutput.calendarByDate=cached.calendarByDate;calendarOutput.calendarCheckedAt=cached.calendarCheckedAt??null;}
 const calendarByDate=cached?Object.fromEntries(wanted.map(date=>[date,cached.calendarByDate[date]||{available:false}])):Object.assign({},...await Promise.all(Array.from({length:Math.ceil(dates.length/62)},(_,i)=>calendarDates(env,dates.slice(i*62,(i+1)*62),who))));
 if(!intake&&['saveAbsence','saveInstructions'].includes(input.operation)){const selected=operationDates(input,true);if(selected.length>62){const unavailable=selected.find(date=>calendarByDate[date]?.available!==true);if(unavailable)throw Error(calendarByDate[unavailable]?.message||'Calendar must verify every selected date before reporting or updating an absence longer than 62 days.');}}
 const safe={...input,calendarByDate,trustedNow:now,schedulerAvailable:env.ROSTER_AUTOMATION_ENABLED==='true',notificationsReady:notificationStatus(env).ready};delete safe.calendarCache;delete safe.calendar;delete safe.capability;delete safe.identity;delete safe.service;delete safe.trustedIntakeAt;delete safe.pendingTransportDates;if(intake&&env.ROSTER_PUBLIC_ORIGIN)safe.publicOrigin=publicOrigin(env);return safe;
}

// Most requests need no extra source read. Only pending inactive-teacher duties
// request their missing Calendar dates, followed by one reconciliation-only read.
// A completed save is never replayed or reported as failed by this maintenance.
export async function reconcileInactiveReplacements(env,input,result,who,traceId,service=false){
 if(!result?.ok||!result.data||!Array.isArray(result.data.inactiveReplacementDates))return result;
 const pending=result.data.inactiveReplacementDates;delete result.data.inactiveReplacementDates;
 if(edgeRosterEnabled(env)||!pending.length)return result;
 const dates=[...new Set(pending)];
 if(dates.length>366||dates.some(date=>!validDate(date))){result.data.inactiveReconciliationPending=true;return result;}
 const missing=dates.filter(date=>input.calendarByDate?.[date]?.available!==true);
 if(!missing.length)return result;
 try{
  const calendar={...input.calendarByDate};
  for(let offset=0;offset<missing.length;offset+=62)Object.assign(calendar,await calendarDates(env,missing.slice(offset,offset+62),who));
  const ready=missing.filter(date=>calendar[date]?.available===true);
  if(!ready.length){result.data.inactiveReconciliationPending=true;return result;}
  const followInput={...(service||input.operation==='read'?input:{operation:'read',view:'reportForm',date:ready[0],notificationsReady:input.notificationsReady,schedulerAvailable:input.schedulerAvailable}),inactiveReconcileDates:ready,calendarByDate:calendar};
  const follow=service?await serviceBackend(env,followInput):(await backend(env,'rosterOperations',followInput,who,traceId)).result;
  if(!follow?.ok){result.data.inactiveReconciliationPending=true;return result;}
  if(follow.data)delete follow.data.inactiveReplacementDates;
  const queued=Number(result.data.notificationsQueued||0)+Number(follow.data?.notificationsQueued||0);
  if(!service&&input.operation==='read')result=follow;
  if(queued)result.data.notificationsQueued=queued;
  if(ready.length<missing.length)result.data.inactiveReconciliationPending=true;
  return result;
 }catch(_){result.data.inactiveReconciliationPending=true;return result;}
}

function configuredSecret(secret){return typeof secret==='string'&&secret.length>=32}
function publicOrigin(env){const u=new URL(env.ROSTER_PUBLIC_ORIGIN||'');if(u.protocol!=='https:'||u.pathname!=='/'||u.username||u.password||u.search||u.hash)throw Error('Configure the public Roster origin.');return u.origin}
async function verifyHmac(payload,hex,secret){if(!/^[a-f0-9]{64}$/.test(hex||'')||!configuredSecret(secret))return false;const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);return crypto.subtle.verify('HMAC',key,Uint8Array.from(hex.match(/../g),x=>parseInt(x,16)),typeof payload==='string'?enc.encode(payload):payload)}
const LINK_AGE=7*86400000;
function privateLinkError(code){
 const messages={PRIVATE_LINK_EXPIRED:'This private link has expired after seven days. Ask SMC for a new link.',PRIVATE_LINK_INVALID:'This private link is invalid. Open the complete link from your notification.',PRIVATE_LINK_CONFIGURATION:'Private timetable access is temporarily unavailable. Please retry later.'};
 return Object.assign(Error(messages[code]||messages.PRIVATE_LINK_INVALID),{code,status:code==='PRIVATE_LINK_CONFIGURATION'?503:401});
}
function capabilityFields(claims,now){
 if(!claims||!['duties','mutual'].includes(claims.purpose)||typeof claims.staffId!=='string'||!claims.staffId||claims.staffId.length>200||!validDate(claims.date)||!Number.isFinite(claims.expiresAt)||!Number.isFinite(claims.issuedAt)||claims.issuedAt<0||claims.issuedAt>now+60000||claims.expiresAt<=claims.issuedAt||claims.expiresAt-claims.issuedAt>LINK_AGE)throw privateLinkError('PRIVATE_LINK_INVALID');
 if(claims.purpose==='mutual'&&(typeof claims.requestId!=='string'||!claims.requestId||claims.requestId.length>200))throw privateLinkError('PRIVATE_LINK_INVALID');
 if(claims.communicationId!==undefined&&(claims.purpose!=='duties'||typeof claims.communicationId!=='string'||!claims.communicationId||claims.communicationId.length>200))throw privateLinkError('PRIVATE_LINK_INVALID');
 if(claims.expiresAt<=now)throw privateLinkError('PRIVATE_LINK_EXPIRED');
 return {staffId:claims.staffId,date:claims.date,purpose:claims.purpose,...(claims.communicationId?{communicationId:claims.communicationId}:{}),...(claims.purpose==='mutual'?{requestId:claims.requestId}:{}),issuedAt:claims.issuedAt,expiresAt:claims.expiresAt};
}
export async function createCapability(claims,env,now=Date.now()){
 if(!configuredSecret(env.EXTERNAL_LINK_SECRET))throw privateLinkError('PRIVATE_LINK_CONFIGURATION');
 let aud;try{aud=publicOrigin(env);}catch{throw privateLinkError('PRIVATE_LINK_CONFIGURATION');}
 const issuedAt=Number.isFinite(claims?.issuedAt)?claims.issuedAt:now;
 const expiresAt=claims?.purpose==='duties'?issuedAt+LINK_AGE:Math.min(claims?.expiresAt,issuedAt+LINK_AGE);
 const data={...capabilityFields({...claims,issuedAt,expiresAt},now),aud,type:'gsis-roster-link-v2',nonce:crypto.randomUUID()};
 const signed=await sign(data,env.EXTERNAL_LINK_SECRET);
 return btoa(unescape(encodeURIComponent(signed.payload))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')+'.'+signed.signature;
}
export async function readCapability(token,env,origin,now=Date.now()){
 if(!configuredSecret(env.EXTERNAL_LINK_SECRET))throw privateLinkError('PRIVATE_LINK_CONFIGURATION');
 let aud;try{aud=publicOrigin(env);}catch{throw privateLinkError('PRIVATE_LINK_CONFIGURATION');}
 try{
  if(typeof token!=='string'||token.length>3000)throw privateLinkError('PRIVATE_LINK_INVALID');
  const [encoded,signature,...extra]=token.split('.');if(extra.length||!encoded||!signature)throw privateLinkError('PRIVATE_LINK_INVALID');
  const payload=new TextDecoder().decode(decode(encoded));
  const valid=await verifyHmac(payload,signature,env.EXTERNAL_LINK_SECRET)||configuredSecret(env.EXTERNAL_LINK_PREVIOUS_SECRET)&&await verifyHmac(payload,signature,env.EXTERNAL_LINK_PREVIOUS_SECRET);
  if(!valid)throw privateLinkError('PRIVATE_LINK_INVALID');
  const data=JSON.parse(payload);
  if(!['gsis-roster-link-v1','gsis-roster-link-v2'].includes(data.type)||data.aud!==origin||data.aud!==aud||!Number.isFinite(data.issuedAt)||data.issuedAt<0||data.issuedAt>now+60000||!Number.isFinite(data.expiresAt)||data.expiresAt<=data.issuedAt||data.expiresAt-data.issuedAt>LINK_AGE)throw privateLinkError('PRIVATE_LINK_INVALID');
  // Only correctly signed legacy timetable capabilities receive this bounded
  // migration. Mutual approval deadlines are never extended.
  if(data.type==='gsis-roster-link-v1'&&data.purpose==='duties')data.expiresAt=data.issuedAt+LINK_AGE;
  return capabilityFields(data,now);
 }catch(error){if(error?.code?.startsWith('PRIVATE_LINK_'))throw error;throw privateLinkError('PRIVATE_LINK_INVALID');}
}
export async function externalUrl(claims,env){return publicOrigin(env)+'/external.html#'+await createCapability(claims,env)}

export async function serviceBackend(env,input){
 assertRecoveryWritable(env);
 const delegated=await callOperationalBackend(env,'roster-service',{input});if(delegated!==undefined)return delegated;
 if(edgeRosterEnabled(env)){
  try{
   if(input.operation==='sendPeerMail')return {ok:true,data:await dispatchEdgePeerMail(env,mail=>legacyServiceBackend(env,mail))};
   if(input.operation==='dailyEmploymentMailDispatch')return {ok:true,data:await dispatchEdgeEmploymentMail(env,mail=>legacyServiceBackend(env,mail))};
   if(input.operation==='deliveryReviewMailDispatch')return {ok:true,data:await dispatchEdgeDeliveryReview(env,input)};
   if(supportsEdgeNotificationOperation(input.operation))return {ok:true,data:await edgeNotificationService(env,input)};
   return {ok:true,data:await edgeRosterService(env,input)};
  }catch(error){return {ok:false,status:error.status||503,code:error.code||'EDGE_SERVICE_UNAVAILABLE',error:error.status&&error.status<500?error.message:'The service could not be confirmed. Retry with the same request.'};}
 }
 try{const result=await legacyServiceBackend(env,input);return result?.ok?result:{...result,operation:input.operation};}catch(error){error.operation=input.operation;throw error;}
}
async function legacyServiceBackend(env,input){
 if(!configuredSecret(gsisApiSecret(env,'ROSTER_SERVICE_SECRET')))throw Error('Roster service is not configured.');
 const endpoint=new URL(env.APPS_SCRIPT_URL||'');
 if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname))throw Error('Roster service is not configured.');
 const body=await sign({action:'rosterService',service:'gsis-roster-notifier-v1',input,timestamp:Date.now(),nonce:crypto.randomUUID(),traceId:crypto.randomUUID()},gsisApiSecret(env,'ROSTER_SERVICE_SECRET'));
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'follow',signal:AbortSignal.timeout(25000)});
 return readGSiSBackendResponse(response);
}

// Captured reports survive the submitting browser. The scheduled Worker uses
// this same drain even when automatic allocation has been switched off.
export async function dispatchAbsenceIntake(env,{limit=2,budgetMs=180000}={}){
 const result={claimed:0,applied:0,deferred:0,needsReview:0,notificationsQueued:0},started=Date.now(),count=Math.max(1,Math.min(10,Number(limit)||2)),budget=Math.max(1,Math.min(240000,Number(budgetMs)||180000));
 if(!configuredSecret(gsisApiSecret(env,'ROSTER_SERVICE_SECRET')))return {...result,configured:false};
 for(let i=0;i<count&&Date.now()-started<budget;i++){
  const next=await serviceBackend(env,{operation:'nextAbsenceIntake'});
  if(!next.ok)throw rosterScheduledFailure(next);
  const job=next.data?.job;if(!job)break;
  if(typeof job.requestId!=='string'||typeof job.claimId!=='string'||!job.command||!['saveAbsence','requestMutual'].includes(job.command.operation)||!job.identity?.email||!job.identity?.subject)throw Error('Captured report claim is invalid.');
  result.claimed++;let trusted;
  try{const command={...job.command};delete command.intake;trusted=await trustedOperationsInput(command,env,job.identity);if(operationDates(command,true).some(date=>trusted.calendarByDate[date]?.available!==true))throw Error('Calendar has not verified the captured dates.');}
  catch(error){const deferred=await serviceBackend(env,{operation:'deferAbsenceIntake',requestId:job.requestId,claimId:job.claimId,reasonCode:'CALENDAR_UNAVAILABLE'});if(!deferred.ok)throw rosterScheduledFailure(deferred);result.deferred++;continue;}
  const processed=await serviceBackend(env,{operation:'processAbsenceIntake',requestId:job.requestId,claimId:job.claimId,calendarByDate:trusted.calendarByDate,notificationsReady:trusted.notificationsReady,schedulerAvailable:trusted.schedulerAvailable,trustedNow:trusted.trustedNow});
  if(!processed.ok)throw rosterScheduledFailure(processed);
  const data=processed.data||{};
  if(data.intakeState==='applied')result.applied++;else if(data.intakeState==='needsReview')result.needsReview++;else result.deferred++;
  result.notificationsQueued+=Math.max(0,Number(data.notificationsQueued)||0);
 }
 return {...result,hasMore:result.claimed>=count||Date.now()-started>=budget};
}

export async function dispatchPeerMail(env){
 if(!configuredSecret(gsisApiSecret(env,'ROSTER_SERVICE_SECRET')))return {configured:false};
 const result=await serviceBackend(env,{operation:'sendPeerMail',publicOrigin:publicOrigin(env),limit:6});
 if(!result.ok)throw rosterScheduledFailure({...result,operation:'sendPeerMail'});return result.data;
}

async function wakeAbsenceIntake(env){
 const wake=await enqueueNotificationWake(env);
 // HTTP work is only a best-effort accelerator. Cron/Queue owns continuation;
 // its durable D1/journal lease survives an interrupted waitUntil invocation.
 if(!wake.queued){await forwardAbsenceTransport(env,{limit:1,budgetMs:20000});if(edgeRosterEnabled(env))await serviceBackend(env,{operation:'processEdgePeerProposals',limit:1});}
}

export async function forwardAbsenceTransport(env,options={}){
 assertRecoveryWritable(env);
 const delegated=await callOperationalBackend(env,'roster-service',{input:{operation:'forwardAbsenceTransport',limit:options.limit,budgetMs:options.budgetMs,concurrency:options.concurrency}});if(delegated!==undefined)return delegated;
 return dispatchAbsenceTransport(env,{...options,capture:async(command,identity,metadata)=>{
  const value=await backend(env,'rosterOperations',{...command,trustedIntakeAt:metadata.acceptedAt},identity,crypto.randomUUID());return value.result;
 }});
}
export async function receivedReportWorkDue(env,{now=Date.now()}={}){
 assertRecoveryWritable(env);
 const delegated=await callOperationalBackend(env,'roster-service',{input:{operation:'receivedReportWorkDue',now}});if(delegated!==undefined)return delegated;
 if(!Number.isSafeInteger(now)||now<0)throw Object.assign(Error('Supply a valid scheduling time.'),{status:400,code:'INVALID_SCHEDULE_TIME'});
 if(!env.GSIS_JOBS?.prepare)return false;
 const db=typeof env.GSIS_JOBS.withSession==='function'?env.GSIS_JOBS.withSession('first-primary'):env.GSIS_JOBS;
 if(!await db.prepare("SELECT 1 present FROM sqlite_master WHERE type='table' AND name='gsis_absence_transport'").first())return false;
 const context=await absenceTransportContext_(env),row=await db.prepare("SELECT EXISTS (SELECT 1 FROM gsis_absence_transport WHERE namespace=? AND ((state='queued' AND available_at<=?) OR (state='claimed' AND lease_until<=?))) has_work").bind(context.namespace,now,now).first();
 return row?.has_work===1;
}
export async function dispatchReceivedReports(env,{limit=8,budgetMs=150000}={}){
 if(edgeRosterEnabled(env)){
  const context=await absenceTransportContext_(env);
  if(context){const db=typeof context.db.withSession==='function'?context.db.withSession('first-primary'):context.db,now=Date.now(),row=await db.prepare("SELECT EXISTS (SELECT 1 FROM gsis_absence_transport WHERE namespace=? AND ((state='queued' AND available_at<=?) OR (state='claimed' AND lease_until<=?))) AS has_work").bind(context.namespace,now,now).first();
   // D1 applies captured attendance directly; nextAbsenceIntake has no second
   // queue in this authority. A newly arriving report is picked up next wake.
   if(row?.has_work===0)return {transport:{enabled:true,claimed:0,forwarded:0,pending:0,needsReview:0},intake:{claimed:0,applied:0,deferred:0,needsReview:0,notificationsQueued:0,...(!configuredSecret(gsisApiSecret(env,'ROSTER_SERVICE_SECRET'))?{configured:false}:{})},hasMore:false};
  }
 }
 const started=Date.now(),transport=await forwardAbsenceTransport(env,{limit,budgetMs:Math.min(budgetMs,60000)});
 const remaining=budgetMs-(Date.now()-started),intake=remaining>1000?await dispatchAbsenceIntake(env,{limit,budgetMs:remaining}):{deferred:1};
 // A bounded batch reaching its limit may have more work. Keep a Queue wake
 // alive even when every attempted item succeeded; cron remains a backstop.
 return {transport,intake,hasMore:transport.claimed>=limit||intake.claimed>=limit||intake.hasMore===true};
}
export async function assertAbsenceTransportReady(env,dates,includePeers=false,who){
 if(backendAvailable(env)){await callOperationalBackend(env,'roster-transport',{operation:'ready',dates,includePeers,identity:who});return;}
 const pending=await pendingAbsenceTransport(env,dates);
 if(pending.pendingCaptureCount||includePeers&&pending.pendingPeerCount)throw Object.assign(Error('A received absence is awaiting processing. Retry allocation or publication after it has been applied.'),{status:409,code:'ABSENCE_TRANSPORT_PENDING'});
}
function mergeAbsenceIntake(backendData,transport){
 if(!transport)return backendData;const rows=new Map((transport.entries||[]).map(row=>[row.requestId,row]));
 for(const row of backendData.entries||[])rows.set(row.requestId,{...rows.get(row.requestId),...row});
 const entries=[...rows.values()].sort((a,b)=>String(b.acceptedAt).localeCompare(String(a.acceptedAt)));
 return {...backendData,entries,total:Math.max(entries.length,Number(backendData.total)||0,Number(transport.total)||0),hasMore:backendData.hasMore||transport.hasMore,pendingCaptureCount:entries.filter(row=>row.command?.operation==='saveAbsence'&&!row.absenceApplied&&!['applied','withdrawn'].includes(row.intakeState)&&!(row.transportState==='needsReview'&&/^BACKEND_REJECTED_(400|403|404|413|422)$/.test(row.reasonCode||''))).length,peerReviewCount:entries.filter(row=>row.peerState==='needsReview').length};
}
export async function absenceTransportRoute(req,input,env,who,traceId,ctx){
 if(backendAvailable(env)){
  const result=await callOperationalBackend(env,'roster-transport',{operation:'route',input,identity:who,traceId});
  return result===null?null:json(result.body,result.status);
 }
 const wake=()=>{if(ctx?.waitUntil)ctx.waitUntil(wakeAbsenceIntake(env).catch(()=>console.error(JSON.stringify({event:'roster-intake-wake-failed',diagnosticId:traceId}))));};
 try{
  if(input.intake===true&&['saveAbsence','requestMutual'].includes(input.operation)){
   const receipt=await captureAbsenceTransport(env,who,input);if(!receipt)return null;wake();return json({ok:true,data:receipt},202);
  }
  if(input.operation==='receiptStatus'&&input.command?.intake===true){
   const receipt=await absenceTransportReceipt(env,who,input.command);if(!receipt)return null;
   if(receipt.transportState==='forwarded')try{
    const result=(await backend(env,'rosterOperations',{operation:'receiptStatus',command:normalizeAbsenceTransportCommand(env,input.command)},who,traceId)).result;
    if(result.ok&&result.data?.accepted===true&&result.data.requestId===receipt.requestId)return json({ok:true,data:{...receipt,...result.data}});
    if(!result.ok&&result.status<500)return json(result,result.status||403);
   }catch{receipt.processingStatusUnavailable=true;}
   wake();return json({ok:true,data:receipt});
  }
  if(input.operation==='read'&&input.view==='intake'&&env.GSIS_JOBS){
   let result;try{result=(await backend(env,'rosterOperations',await trustedOperationsInput(input,env,who),who,traceId)).result;}catch{result=null;}
   if(result&&!result.ok&&result.status<500)return json(result,result.status||403);
   if(!result?.ok&&input.scope!=='mine')return json({ok:false,error:'School-wide received reports require a current SMC permission check.'},503);
   const data=result?.data||{entries:[],user:{smc:false,admin:false},processingStatusUnavailable:true},all=data.user?.smc===true||data.user?.admin===true;
   const transport=await readAbsenceTransport(env,who,{all,date:input.date,scope:input.scope,includeForwarded:!result?.ok});return json({ok:true,data:mergeAbsenceIntake(data,transport)});
  }
  if(['retryAbsenceIntake','resolveAbsenceIntake'].includes(input.operation)&&env.GSIS_JOBS){
   const auth=(await backend(env,'rosterOperations',{operation:'read',view:'intake',scope:'mine'},who,traceId)).result;if(!auth.ok)return json(auth,auth.status||403);
   const all=auth.data?.user?.smc===true||auth.data?.user?.admin===true,resolving=input.operation==='resolveAbsenceIntake';
   if(resolving&&!all)return json({ok:false,error:'Only SMC or Admin can resolve a received report.'},403);
   if(resolving&&input.resolution!=='withdraw')return json({ok:false,error:'Choose a valid report resolution.'},400);
   const result=resolving?await resolveAbsenceTransport(env,who,{requestId:input.intakeRequestId,reason:input.reason,all}):await retryAbsenceTransport(env,who,{requestId:input.requestId,all});
   if(result&&result.transportState!=='forwarded'){wake();return json({ok:true,data:result});}
  }
  return null;
 }catch(error){if([400,401,403,409,413].includes(error.status))return json({ok:false,error:error.message,code:error.code},error.status);throw error;}
}

// Inbox has its own durable state and never loads a timetable or Calendar.
const INBOX_OPERATIONS=new Set(['inboxList','inboxThread','inboxAssign','inboxSetHandled','inboxReply','inboxTemplates']);
const INBOX_MEDIA_LIMIT=16*1024*1024,INBOX_IMAGE_LIMIT=5*1024*1024;
function inboxSenderConfigured(env){return env.WHATSAPP_ENABLED==='true'&&/^\d{5,30}$/.test(env.WHATSAPP_PHONE_NUMBER_ID||'')&&/^v\d+\.\d+$/.test(env.WHATSAPP_API_VERSION||'')&&configuredSecret(env.WHATSAPP_ACCESS_TOKEN);}
function inboxConfiguration(env){
 // Presence and format only. Never expose values or infer live provider/cron health.
 const valid={WHATSAPP_ENABLED:env.WHATSAPP_ENABLED==='true',WHATSAPP_INBOX_MEDIA:!!env.WHATSAPP_INBOX_MEDIA,WHATSAPP_API_VERSION:/^v\d+\.\d+$/.test(env.WHATSAPP_API_VERSION||'')};
 for(const field of ['WHATSAPP_ACCOUNT_ID','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_TEMPLATE_ACCOUNT_ID'])valid[field]=/^\d{5,30}$/.test(env[field]||'');
 for(const field of ['WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN','WHATSAPP_ACCESS_TOKEN','ROSTER_SERVICE_SECRET'])valid[field]=configuredSecret(field==='ROSTER_SERVICE_SECRET'?gsisApiSecret(env,field):env[field]);
 const capture=['WHATSAPP_ENABLED','WHATSAPP_ACCOUNT_ID','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN','ROSTER_SERVICE_SECRET'],replies=['WHATSAPP_ENABLED','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_API_VERSION','WHATSAPP_ACCESS_TOKEN','ROSTER_SERVICE_SECRET'];
 const groups={capture,replies,voice:[...replies,'WHATSAPP_INBOX_MEDIA'],images:[...replies,'WHATSAPP_INBOX_MEDIA'],templates:[...replies,'WHATSAPP_TEMPLATE_ACCOUNT_ID']};
 return {enabled:valid.WHATSAPP_ENABLED,liveVerified:false,...Object.fromEntries(Object.entries(groups).map(([key,fields])=>{const missing=fields.filter(field=>!valid[field]);return [key,{configured:missing.length===0,missing}];}))};
}
function inboxPublic(value){
 if(Array.isArray(value))return value.map(inboxPublic);
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).filter(([key])=>!['dispatch','alerts','objectKey','mediaId','claimId','approvedTemplate'].includes(key)).map(([key,item])=>[key,inboxPublic(item)]));
}
function inboxInput(input){
 const fields=['operation','waId','messageId','expectedRevision','requestId','assignedTo','handled','limit','cursor','before','knownRevision','knownReadAt','search','filter','kind','text'];
 const result=Object.fromEntries(fields.filter(key=>Object.hasOwn(input,key)).map(key=>[key,input[key]]));
 if(input.kind==='template')result.template={name:input.template?.name,language:input.template?.language,parameters:input.template?.parameters};
 return result;
}
function inboxTemplate(record){
 if(record?.status!=='APPROVED'||!['UTILITY','MARKETING'].includes(record.category)||! /^[a-z0-9_]{1,512}$/.test(record.name||'')||! /^[A-Za-z]{2,3}(?:_[A-Za-z0-9]{2,8})?$/.test(record.language||''))return null;
 if(record.parameter_format&&record.parameter_format!=='POSITIONAL')return null;
 const components=record.components;
 if(!Array.isArray(components)||components.length!==1||components[0].type!=='BODY'||typeof components[0].text!=='string')return null;
 const body=components[0].text,params=[...new Set([...body.matchAll(/{{(\d+)}}/g)].map(x=>Number(x[1])))].sort((a,b)=>a-b);
 if(body.length>4096||/[{}]/.test(body.replace(/{{\d+}}/g,''))||params.length>100||params.some((n,i)=>n!==i+1))return null;
 return {name:record.name,language:record.language,body,parameterCount:params.length};
}
export async function inboxTemplates(env){
 if(!inboxSenderConfigured(env)||!/^\d{5,30}$/.test(env.WHATSAPP_TEMPLATE_ACCOUNT_ID||''))throw Error('WhatsApp Inbox sending is not configured or enabled.');
 return (await readTemplateCatalogue(env)).map(inboxTemplate).filter(Boolean);
}
function inboxTemplateText(template,value,index){
 const contract=Object.values(WHATSAPP_CONTRACTS).find(c=>c.name===template.name&&c.language===template.language),field=contract?.fields[index]||'parameter_'+(index+1);
 // Generic BODY values may contain instructions before or after a URL. Only
 // a known field contract establishes that the whole parameter is a URL.
 return templateText(value,field,1024,field.endsWith('_url')||field==='absent_teacher_contact'&&/^https?:\/\//i.test(value));
}
async function verifiedInboxTemplate(template,env){
 try{if(!template||!Array.isArray(template.parameters)||template.parameters.length>100||template.parameters.some(x=>typeof x!=='string'))throw Error();template.parameters.forEach((value,i)=>inboxTemplateText(template,value,i));}catch{throw Object.assign(Error('Enter valid approved template parameters (up to 1,024 characters each).'),{status:400});}
 const match=(await inboxTemplates(env)).find(t=>t.name===template.name&&t.language===template.language&&t.parameterCount===template.parameters.length);
 if(!match)throw Object.assign(Error('This template is no longer approved or its fields changed. Refresh the template list.'),{status:409});
 return {name:match.name,language:match.language,parameters:template.parameters.map(x=>x.trim())};
}
async function inboxOperation(raw,env,who,traceId,ctx){
 const input=inboxInput(raw);
 try{
  if(input.operation==='inboxReply'){
   if(!inboxSenderConfigured(env))throw Object.assign(Error('WhatsApp Inbox sending is not configured or enabled.'),{status:503,inboxValidation:true});
   if(input.kind==='text'&&(typeof input.text!=='string'||!input.text.trim()||[...input.text].length>4096))return json({ok:false,error:'Enter a reply of up to 4,096 characters.'},400);
   if(input.kind==='template'){
    const gate=await backend(env,'rosterInbox',{operation:'inboxTemplates'},who,traceId);
    if(!gate.result.ok)return json(inboxPublic(gate.result),gate.result.status||403);
    try{input.approvedTemplate=await verifiedInboxTemplate(input.template,env);}catch(error){error.inboxValidation=true;throw error;}
   }
  }
  const {result}=await backend(env,'rosterInbox',input,who,traceId);
  if(!result.ok)return json(inboxPublic(result),result.status||503);
  if(input.operation==='inboxTemplates')return json({ok:true,data:{templates:await inboxTemplates(env)}});
  if(input.operation==='inboxList')result.data={...result.data,configuration:inboxConfiguration(env)};
  // The intent is durable. The scheduled worker sends it within the next cycle;
  // HTTP waitUntil has too short a lifetime for prepare + provider + result.
  // Browser retries return the same intent and never initiate another send.
  return json(inboxPublic(result));
 }catch(error){
  if(error.inboxValidation){
   // A template can be paused after a successful save whose response was lost.
   // Recover only an existing same-actor/command receipt; this flag can never
   // authorize a new intent or bypass current provider approval.
   try{const prior=await backend(env,'rosterInbox',{...input,receiptOnly:true},who,traceId);if(!prior.result.ok||prior.result.data?.replayed===true)return json(inboxPublic(prior.result),prior.result.ok?200:prior.result.status||503);}catch{}
  }
  return json({ok:false,error:error.status?error.message:'WhatsApp Inbox could not be confirmed. Refresh the conversation; retry an unconfirmed save using the same request.',diagnosticId:traceId},error.status||503);
 }
}
function providerDiagnostic(value,payload){
 const e=value?.error||value||{};
 if(!Number.isSafeInteger(e.code)||e.code<0)return null;
 // Provider details can echo recipient data, full text or signed links. Keep
 // only fixed diagnostic descriptions; the trace ID supports investigation.
 const raw=String(e.error_data?.details||''),details=/(?:new[- ]?line|line break|tab characters|consecutive spaces)/i.test(raw)?'Template parameters cannot contain line breaks, tabs or more than four consecutive spaces.':/(?:number.*(?:param|variable)|(?:param|variable).*count)/i.test(raw)?'The number of template parameters does not match the approved template.':/(?:too long|length|exceed|too many characters)/i.test(raw)?'A template parameter exceeds the permitted length.':/(?:format|invalid.*param|param.*invalid)/i.test(raw)?'A template parameter has an invalid format.':'Provider details withheld; use the Meta trace ID for investigation.';
 const result={code:e.code,details};
 if(Number.isSafeInteger(e.error_subcode)&&e.error_subcode>=0)result.subcode=e.error_subcode;
 if(typeof e.fbtrace_id==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(e.fbtrace_id))result.traceId=e.fbtrace_id;
 if(payload?.type==='template'&&/^[a-z0-9_]{1,128}$/.test(payload.template?.name||'')){
  result.templateName=payload.template.name;
  const contract=Object.values(WHATSAPP_CONTRACTS).flatMap(c=>[c,...Object.values(c.variants||{})]).find(c=>c.name===payload.template.name),parameters=payload.template.components?.find(c=>c.type==='body')?.parameters||[];
  result.fields=parameters.slice(0,32).map((p,i)=>({field:contract?.fields[i]||'parameter_'+(i+1),index:i+1,characters:[...String(p.text||'')].length}));
 }
 return result;
}
function inboxProviderError(value,fallback,payload){
 const diagnostic=providerDiagnostic(value,payload);
 return {message:fallback,metaErrorCode:diagnostic?.code??null,metaErrorSubcode:diagnostic?.subcode??null,...(diagnostic?.traceId?{fbtraceId:diagnostic.traceId}:{}),...(diagnostic?{details:diagnostic.details,...(diagnostic.templateName?{templateName:diagnostic.templateName,fields:diagnostic.fields}:{})}:{})};
}
async function sendWhatsAppPayload(payload,env){
 if(edgeRosterEnabled(env)){
  const reservation=await reserveEdgeWhatsAppSend(env,payload.to);
  if(!reservation.reserved)return Response.json({error:{code:130429}},{status:429,headers:{'Retry-After':String(Math.max(1,Math.ceil((reservation.readyAt-Date.now())/1000)))}});
  const delay=reservation.at-Date.now();if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
 }
 const response=await fetch('https://graph.facebook.com/'+env.WHATSAPP_API_VERSION+'/'+env.WHATSAPP_PHONE_NUMBER_ID+'/messages',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.WHATSAPP_ACCESS_TOKEN},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),redirect:'manual'});
 if(edgeRosterEnabled(env)){
  let value;try{value=await response.clone().json();}catch{}
  if(response.status===429||[130429,131048,131056].includes(value?.error?.code)){
   const header=response.headers.get('Retry-After'),seconds=Number(header),duration=header&&Number.isFinite(seconds)?seconds*1000:header?Date.parse(header)-Date.now():60000;
   await recordEdgeWhatsAppThrottle(env,Number.isFinite(duration)?duration:60000);
  }
 }
 return response;
}
async function inboxSend(payload,env){
 let state='uncertain',messageId='',error=inboxProviderError(null,'Send result is unconfirmed.');
 try{
  const response=await sendWhatsAppPayload(payload,env),value=await response.json();
  if(response.ok&&typeof value.messages?.[0]?.id==='string'&&value.messages[0].id.startsWith('wamid.')){state='sent';messageId=value.messages[0].id;error=null;}
  else {error=inboxProviderError(value,'Meta did not confirm this message.',payload);if(!response.ok&&response.status>=400&&response.status<500&&Number.isInteger(value.error?.code))state='failed';}
 }catch{}
 return {state,messageId,error};
}
export async function dispatchInboxReply(dispatch,env){
 if(!dispatch?.replyId||!dispatch.claimId)throw Error('Invalid inbox dispatch.');
 // Prepare owns the one-send claim and rechecks the current reply window. The
 // template proof is regenerated here, never taken from a browser assertion.
 const peek=dispatch.template;
 let approvedTemplate;
 try{if(peek)approvedTemplate=await verifiedInboxTemplate(peek,env);}catch(error){if(!error.status)throw error;} // Retry an unattempted catalogue outage; changed approval fails closed at prepare.
 const prepared=await serviceBackend(env,{operation:'inboxReplyPrepare',replyId:dispatch.replyId,claimId:dispatch.claimId,...(approvedTemplate?{approvedTemplate}:{})});
 if(!prepared.ok)throw rosterScheduledFailure(prepared);
 const row=prepared.data?.reply;if(!row)return;
 let outcome={state:'failed',messageId:'',error:inboxProviderError(null,'Invalid inbox reply or sending is disabled. No send was attempted.')};
 if(inboxSenderConfigured(env)&&row.id===dispatch.replyId&&row.claimId===dispatch.claimId&&/^\d{8,15}$/.test(row.to||'')){
  const payload={messaging_product:'whatsapp',recipient_type:'individual',to:row.to,biz_opaque_callback_data:'inbox:'+row.id};
  if(row.kind==='text'){
   if(!Number.isFinite(row.replyWindowExpiresAt)||row.replyWindowExpiresAt<=Date.now())outcome.error=inboxProviderError(null,'The 24-hour reply window ended before this reply was sent.');
   else if(typeof row.text==='string'&&row.text.trim()&&[...row.text].length<=4096)Object.assign(payload,{type:'text',text:{preview_url:false,body:row.text}});
  }
  if(row.kind==='template'&&approvedTemplate&&JSON.stringify(row.template)===JSON.stringify(approvedTemplate))Object.assign(payload,{type:'template',template:{name:approvedTemplate.name,language:{code:approvedTemplate.language},...(approvedTemplate.parameters.length?{components:[{type:'body',parameters:approvedTemplate.parameters.map((value,i)=>({type:'text',text:inboxTemplateText(approvedTemplate,value,i)}))}]}:{})}});
  if(payload.type)outcome=await inboxSend(payload,env);
 }
 const saved=await serviceBackend(env,{operation:'inboxReplyResult',replyId:row.id,claimId:row.claimId,...outcome});
 if(!saved.ok)throw rosterScheduledFailure(saved);
}
export async function dispatchInboxPending(env){
 if(env.WHATSAPP_ENABLED!=='true')return {enabled:false};
 if(edgeRosterEnabled(env)&&!await edgeDispatchHasWork(env,'inbox'))return {enabled:true,replies:0,alerts:0,unconfirmed:0};
 const pending=await serviceBackend(env,{operation:'inboxPendingDispatch'});if(!pending.ok)throw rosterScheduledFailure(pending);
 const replies=pending.data?.replies||[],alerts=pending.data?.alerts||[];
 if(!Array.isArray(replies)||replies.length>5||!Array.isArray(alerts)||alerts.length>5)throw Error('Invalid inbox dispatch queue.');
 const result={enabled:true,replies:replies.length,alerts:alerts.length,unconfirmed:0};
 // Each prepare atomically claims an unprepared intent. Overlapping cron ticks
 // cannot resend an attempted or uncertain message.
 for(const reply of replies)try{await dispatchInboxReply(reply,env);}catch{result.unconfirmed++;}
 try{await dispatchInboxAlerts(alerts,env);}catch{result.unconfirmed++;}
 return result;
}
function audioMime(value){
 if(typeof value!=='string'||value.length>100)return null;
 const [type,...parameters]=value.toLowerCase().split(';').map(x=>x.trim());
 if(!['audio/aac','audio/mp4','audio/mpeg','audio/amr','audio/ogg'].includes(type)||parameters.some(p=>p!=='codecs=opus'))return null;
 return type==='audio/ogg'?'audio/ogg; codecs=opus':type;
}
async function sha256Hex(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),b=>b.toString(16).padStart(2,'0')).join('');}
function mediaDigest(value){if(/^[a-f\d]{64}$/i.test(value||''))return value.toLowerCase();try{const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));if(bytes.length===32)return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}catch{}return null;}
function inboxMediaMime(value,kind){return kind==='image'?(['image/jpeg','image/png'].includes(String(value).toLowerCase())?String(value).toLowerCase():null):audioMime(value);}
function inboxMediaMetadata(message,kind){
 const source=message[kind]||{};
 return {mediaId:String(source.mediaId||source.id||''),mimeType:inboxMediaMime(source.mimeType||source.mime_type,kind)||'',sha256:source.sha256||'',...(kind==='audio'?{voice:source.voice===true}:{}),captureStatus:'unavailable'};
}
async function boundedMedia(response,limit){
 const size=Number(response.headers.get('Content-Length'));if(Number.isFinite(size)&&size>limit)throw Object.assign(Error('Attachment exceeds the size limit.'),{permanent:true});
 const reader=response.body?.getReader();if(!reader)throw Error('Attachment download is unavailable.');
 const chunks=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit)throw Object.assign(Error('Attachment exceeds the size limit.'),{permanent:true});chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}
 if(!length)throw Error('Attachment download was empty.');const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
function imageSignature(bytes,mime){
 return mime==='image/png'?[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v):bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
}
export async function captureInboxAudio(message,env){return captureInboxMedia(message,env,'audio');}
const inboxMediaCaptures=new WeakMap();
export function captureInboxMedia(message,env,kind=message.type){
 const bucket=env.WHATSAPP_INBOX_MEDIA;
 if(!bucket||typeof bucket!=='object')return captureInboxMediaBytes(message,env,kind);
 let pending=inboxMediaCaptures.get(bucket);if(!pending){pending=new Map();inboxMediaCaptures.set(bucket,pending);}
 const source=message[kind]||{},key=kind+'|'+message.id+'|'+String(source.mediaId||source.id||'');
 if(pending.has(key))return pending.get(key);
 const task=captureInboxMediaBytes(message,env,kind);
 // Bounded in-flight work only; authority is checked separately for every viewer.
 if(pending.size>=16)return task;
 const tracked=task.finally(()=>pending.delete(key));pending.set(key,tracked);return tracked;
}
async function captureInboxMediaBytes(message,env,kind){
 if(!['audio','image'].includes(kind))throw Error('Unsupported attachment type.');
 const attachment=inboxMediaMetadata(message,kind),limit=kind==='image'?INBOX_IMAGE_LIMIT:INBOX_MEDIA_LIMIT;
 if(!/^\d{1,100}$/.test(attachment.mediaId)||!attachment.mimeType)return {[kind]:attachment,retry:false};
 if(!env.WHATSAPP_INBOX_MEDIA||!inboxSenderConfigured(env))return {[kind]:attachment,retry:false};
 const key='inbox/'+env.WHATSAPP_PHONE_NUMBER_ID+'/'+await sha256Hex(enc.encode(message.id+'|'+attachment.mediaId));
 try{
  const existing=await env.WHATSAPP_INBOX_MEDIA.head(key);
  if(existing)return {[kind]:{...attachment,objectKey:key,captureStatus:'stored'},retry:false};
  const response=await fetch('https://graph.facebook.com/'+env.WHATSAPP_API_VERSION+'/'+attachment.mediaId+'?phone_number_id='+env.WHATSAPP_PHONE_NUMBER_ID,{headers:{Authorization:'Bearer '+env.WHATSAPP_ACCESS_TOKEN},signal:AbortSignal.timeout(10000),redirect:'manual'});
  if(!response.ok)throw Object.assign(Error('Attachment metadata is unavailable.'),{permanent:response.status>=400&&response.status<500&&response.status!==429});
  const metadata=await response.json(),mime=inboxMediaMime(metadata.mime_type,kind),url=new URL(metadata.url||'');
  // Retrieve a fresh provider URL, never retain it or forward credentials to redirects.
  if(metadata.id&&String(metadata.id)!==attachment.mediaId||!mime||mime!==attachment.mimeType||!Number.isFinite(metadata.file_size)||metadata.file_size<1||metadata.file_size>limit||url.protocol!=='https:'||url.username||url.password||url.port||!['lookaside.fbsbx.com','lookaside.whatsapp.net'].includes(url.hostname))throw Object.assign(Error('Unsupported attachment metadata.'),{permanent:true});
  const media=await fetch(url,{headers:{Authorization:'Bearer '+env.WHATSAPP_ACCESS_TOKEN},signal:AbortSignal.timeout(15000),redirect:'manual'});
  if(!media.ok)throw Object.assign(Error('Attachment download is unavailable.'),{permanent:media.status>=400&&media.status<500&&media.status!==429});
  if(inboxMediaMime(media.headers.get('Content-Type'),kind)!==mime)throw Object.assign(Error('Unexpected attachment type.'),{permanent:true});
  const bytes=await boundedMedia(media,limit),digest=await sha256Hex(bytes),expected=mediaDigest(metadata.sha256),incoming=mediaDigest(attachment.sha256);
  if(bytes.length!==metadata.file_size||!expected||digest!==expected||incoming&&incoming!==digest||kind==='image'&&!imageSignature(bytes,mime))throw Object.assign(Error('Attachment integrity check failed.'),{permanent:true});
  await env.WHATSAPP_INBOX_MEDIA.put(key,bytes,{httpMetadata:{contentType:mime},customMetadata:{sha256:digest}});
  return {[kind]:{...attachment,mimeType:mime,sha256:digest,objectKey:key,captureStatus:'stored'},retry:false};
 }catch(error){return {[kind]:{...attachment,captureStatus:'failed'},retry:error.permanent!==true};}
}
async function deliveryReportRoute(req,env){
 const url=new URL(req.url);if(req.method!=='GET'&&req.method!=='HEAD')return json({ok:false,error:'GET required.'},405);
 if(req.headers.get('Origin')&&req.headers.get('Origin')!==url.origin||req.headers.get('Sec-Fetch-Site')==='cross-site')return json({ok:false,error:'Same-origin report access required.'},403);
 if(!edgeRosterEnabled(env))return json({ok:false,error:'Report unavailable.'},404);
 let who;try{who=await requestIdentity(req,env);}catch{return json({ok:false,error:'Sign in with your school account.'},401);}
 try{const date=url.pathname.slice('/api/whatsapp/reports/'.length),text=await edgeDeliveryReportRead(env,date,who);return new Response(req.method==='HEAD'?null:text,{headers:{'Content-Type':'text/plain; charset=UTF-8','Content-Disposition':'attachment; filename="gsis-delivery-review-'+date+'.txt"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}catch(error){return json({ok:false,error:error.status&&error.status<500?error.message:'Report could not be verified.'},error.status||503);}
}
export async function inboxMediaRoute(req,env){
 const url=new URL(req.url);
 if(req.method!=='GET'&&req.method!=='HEAD')return json({ok:false,error:'GET required.'},405);
 if(req.headers.get('Origin')&&req.headers.get('Origin')!==url.origin||req.headers.get('Sec-Fetch-Site')==='cross-site')return json({ok:false,error:'Same-origin media required.'},403);
 let who;try{who=await requestIdentity(req,env);}catch{return json({ok:false,error:'Sign in with your school account.'},401);}
 let messageId;try{messageId=decodeURIComponent(url.pathname.slice('/api/whatsapp/media/'.length));}catch{return json({ok:false,error:'Invalid message.'},400);}
 const waId=url.searchParams.get('waId')||url.searchParams.get('threadId');
 if(!messageId||messageId.length>300||!/^\d{8,15}$/.test(waId||''))return json({ok:false,error:'Invalid message.'},400);
 try{
  const authorized=await backend(env,'rosterInbox',{operation:'inboxMediaAuthorize',waId,messageId},who,crypto.randomUUID());
  if(!authorized.result.ok)return json(inboxPublic(authorized.result),authorized.result.status||403);
  let media=authorized.result.data;const kind=media.message?.type==='image'||String(media.mimeType).startsWith('image/')?'image':'audio';
  if(!env.WHATSAPP_INBOX_MEDIA)return json({ok:false,error:'Attachment storage is not configured. The message record is retained.'},503);
  const validKey=key=>typeof key==='string'&&new RegExp('^inbox/'+env.WHATSAPP_PHONE_NUMBER_ID+'/[a-f0-9]{64}$').test(key);
  let head=validKey(media.objectKey)?await env.WHATSAPP_INBOX_MEDIA.head(media.objectKey):null;
  if(!head&&media.message){
   const captured=await captureInboxMedia({...media.message,[kind]:media},env,kind);
   if(captured[kind].captureStatus==='stored'){
    const saved=await serviceBackend(env,{operation:'inboxIngest',message:{...media.message,[kind]:captured[kind]}});if(!saved.ok)throw Error('Capture not recorded.');media={...media,...captured[kind]};
   }
  }
  if(!validKey(media.objectKey))return json({ok:false,error:'Attachment is currently unavailable. Its message record is retained.'},404);
  if(!head)head=await env.WHATSAPP_INBOX_MEDIA.head(media.objectKey);if(!head)return json({ok:false,error:'Attachment is currently unavailable.'},404);
  const mime=inboxMediaMime(media.mimeType,kind);if(!mime||head.size<1||head.size>(kind==='image'?INBOX_IMAGE_LIMIT:INBOX_MEDIA_LIMIT))throw Error('Invalid stored attachment.');
  let offset=0,length=head.size,partial=false;const range=req.headers.get('Range');
  if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||!m[1]&&!m[2])return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+head.size,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});if(m[1]){offset=Number(m[1]);const end=m[2]?Math.min(Number(m[2]),head.size-1):head.size-1;length=end-offset+1;}else{length=Math.min(Number(m[2]),head.size);offset=head.size-length;}if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset>=head.size||length<=0)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+head.size,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});partial=true;}
  const headers={'Content-Type':mime,'Content-Length':String(length),'Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Content-Disposition':'inline'};
  if(partial)headers['Content-Range']='bytes '+offset+'-'+(offset+length-1)+'/'+head.size;
  if(req.method==='HEAD')return new Response(null,{status:partial?206:200,headers});
  const object=await env.WHATSAPP_INBOX_MEDIA.get(media.objectKey,partial?{range:{offset,length}}:undefined);if(!object)return json({ok:false,error:'Attachment is currently unavailable.'},404);
  return new Response(object.body,{status:partial?206:200,headers});
 }catch{return json({ok:false,error:'Attachment could not load. Retry the attachment.'},503);}
}
export async function externalRoute(req,env){
 const origin=new URL(req.url).origin;
 if(req.method!=='POST'||req.headers.get('Origin')!==origin)return json({ok:false,error:'Same-origin POST required.'},403);
 let capability;try{const auth=req.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))throw privateLinkError('PRIVATE_LINK_INVALID');capability=await readCapability(auth.slice(7),env,origin)}catch(error){const safe=error?.code?.startsWith('PRIVATE_LINK_')?error:privateLinkError('PRIVATE_LINK_INVALID');return json({ok:false,error:safe.message,code:safe.code},safe.status)}
 const raw=await req.text();if(raw.length>6000)return json({ok:false,error:'Request too large.'},413);
 let input;try{input=JSON.parse(raw);if(!input||Array.isArray(input)||typeof input!=='object')throw Error()}catch{return json({ok:false,error:'Invalid request.'},400)}
 if(!['view','respond','acknowledge'].includes(input.operation))return json({ok:false,error:'Operation not allowed.'},403);
 // Construct the delegation ourselves. Never forward an arbitrary client id,
 // date, staff identity, role or purpose into the service bridge.
 const serviceInput={operation:input.operation==='view'?'externalDuties':input.operation==='acknowledge'?'externalAcknowledge':'externalRespond',capability};
 if(input.operation==='acknowledge'){
  const notice=input.timetableNoticeId;
  if(notice!==undefined&&(typeof notice!=='string'||!notice.trim()||notice.length>300||/[\u0000-\u001f\u007f]/.test(notice))||!Array.isArray(input.snapshotIds)||!input.snapshotIds.length&&!notice||input.snapshotIds.length>100||input.snapshotIds.some(x=>typeof x!=='string'||!x.trim()||x.length>160))return json({ok:false,error:'Invalid acknowledgement.'},400);
  serviceInput.snapshotIds=input.snapshotIds;if(notice!==undefined)serviceInput.timetableNoticeId=notice;
 }
 if(!edgeRosterEnabled(env)&&input.operation==='view'&&capability.purpose==='mutual')serviceInput.calendarByDate={[capability.date]:await calendarDate(env,capability.date,null)};
 if(input.operation==='respond'){
  if(capability.purpose!=='mutual')return json({ok:false,error:'This link cannot approve relief.'},403);
  if(!['approve','reject'].includes(input.decision)||typeof input.requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestId))return json({ok:false,error:'Choose Approve or Reject.'},400);
  const reason=String(input.reason||'').trim();if(reason.length>1000||input.decision==='reject'&&!reason)return json({ok:false,error:'Give a reason for rejection (up to 1,000 characters).'},400);
  Object.assign(serviceInput,{decision:input.decision,reason,requestId:input.requestId});
  if(!edgeRosterEnabled(env)&&input.decision==='approve')serviceInput.calendarByDate={[capability.date]:await calendarDate(env,capability.date,null)};
 }
 try{const result=await serviceBackend(env,serviceInput);return json(result,result.ok?200:result.status||503)}catch{return json({ok:false,error:'The request could not be confirmed. Reload this page to check its current state.'},503)}
}

/* GSIS_WHATSAPP_CONTRACTS_BEGIN */
const WHATSAPP_CONTRACTS={"mutual_request":{"name":"gsis_relief_request_v1","language":"en_GB","category":"UTILITY","id":"1406506811640852","fields":["recipient_name","requesting_teacher_name","duty_date","lessons_and_periods","private_approval_url"],"body":"*Peer Relief Arrangement*\n\nHi {{1}}, {{2}} has requested on https://roster.gsps.edu.sg that you cover his/her lesson(s) on {{3}}: {{4}}.\n\nAccept or reject using this link: {{5}}.\n\nThank you.","bodySha256":"e2f88d19f08ce961bf513224028e820d8b6a08f258d36f2ce700d8fadfc7ad36","submissionState":"APPROVED","privateLinkPurpose":"mutual","variants":{"buttons":{"name":"gsis_relief_request_v2","language":"en_GB","category":"UTILITY","id":"1860613241950793","fields":["recipient_name","requesting_teacher_name","duty_date","lessons_and_periods"],"body":"*Peer Relief Arrangement*\n\nHi {{1}}, {{2}} has requested on https://roster.gsps.edu.sg that you cover his/her lesson(s) on {{3}}: {{4}}.\n\nPlease use the button below to review and accept or reject this request.\n\nThank you.","bodySha256":"8d1496eda9cb385716226219d725c2e1d43b62c23dcccdcd9b8b0ad3a2232244","submissionState":"PENDING","privateLinkPurpose":"mutual","urlButtons":[{"text":"Review request","url":"https://roster.gsps.edu.sg/external.html#{{1}}"}]}}},"mutual_override":{"name":"gsis_relief_changed_v1","language":"en_GB","category":"UTILITY","id":"1775720290362486","fields":["recipient_name","duty_date","change_details","private_published_duties_url"],"body":"*Peer Relief Arrangement Updated*\n\nHi {{1}}, Relief Team has changed the peer relief arrangement for {{2}}.\n\n{{3}}\n\nView the published arrangement here: {{4}}.\n\nThank you.","bodySha256":"749edb8920ccd75bdf30526742eec67cadfe392a75878baaf80e9f67f7aae5c3","submissionState":"APPROVED","privateLinkPurpose":"duties"},"contact_review":{"name":"gsis_contact_review_v1","language":"en_GB","category":"UTILITY","id":"1777525793360691","fields":["recipient_name","request_date","contact_review_details","contacts_review_url"],"body":"*Contact Details for Ad Hoc External Relief*\n\nHi {{1}}.\n\nOn https://roster.gsps.edu.sg, contact details for an ad hoc external relief teacher were added or updated on {{2}}.\n\nPlease review these details as a Contacts Admin:\n\n{{3}}\n\nReview and confirm the details in Contacts: {{4}}.\n\nThank you.","bodySha256":"5e0c7080d0386968c042e19b1d4a5cb968e05953eb69ca6286b87d5000914e40","submissionState":"APPROVED"},"relief_assignment":{"name":"gsis_relief_assignment_v1","language":"en_GB","category":"UTILITY","id":"2331306544355004","fields":["recipient_name","duty_date","lessons_periods_venues","private_timetable_url"],"body":"*Relief Assignment*\n\nHi {{1}}, Relief Team has assigned you relief duties on {{2}}.\n\n{{3}}\n\nView the relief instructions and acknowledge your duties here: {{4}}.\n\nThank you.","bodySha256":"dbbc03f5d5d708029b5c62c7025276bfc14ab6434244a3f9ad70a4835a583dd2","submissionState":"APPROVED","privateLinkPurpose":"duties"},"relief_updated":{"name":"gsis_relief_updated_v1","language":"en_GB","category":"UTILITY","id":"1753999250059547","fields":["recipient_name","duty_date","changed_or_cancelled_duties","private_timetable_url"],"body":"*Relief Assignment Updated*\n\nHi {{1}}, Relief Team has changed your relief duties for {{2}}.\n\n{{3}}\n\nView your updated timetable and acknowledge the change here: {{4}}.\n\nThank you.","bodySha256":"07063c548041f467f9e7b1e9159efffc26afd6ae31bc9883e80222b3fe21fc0f","submissionState":"APPROVED","privateLinkPurpose":"duties"},"relief_reminder":{"name":"gsis_relief_reminder_v1","language":"en_GB","category":"UTILITY","id":"2175089153046382","fields":["recipient_name","duty_date","lesson_period_time_venue","private_timetable_url"],"body":"*Relief Duty Reminder*\n\nHi {{1}}, your relief duty on {{2}} starts in 20 minutes and has not been acknowledged in Roster.\n\n{{3}}\n\nView the relief instructions and acknowledge your duty here: {{4}}.\n\nThank you.","bodySha256":"85faa0c817ea716fa85db1fdbce59f383ee6ad6fdce28acf16e258365629ac57","submissionState":"APPROVED","privateLinkPurpose":"duties"},"relief_unacknowledged":{"name":"gsis_relief_unacknowledged_v1","language":"en_GB","category":"UTILITY","id":"3993441010951993","fields":["duty_smc_name","assigned_teacher_name","duty_date","lesson_period_start_venue","roster_status_url"],"body":"*Relief Duty Not Acknowledged*\n\nHi {{1}}, {{2}} has not acknowledged the relief duty on {{3}}.\n\n{{4}}\n\nThe lesson starts in 10 minutes. Please contact the teacher and confirm cover.\n\nView the current status here: {{5}}.\n\nThank you.","bodySha256":"d998fc781f72ed863069c7171edf9bc6baa8e61e370c1544e5ec82719eece0cf","submissionState":"APPROVED"},"relief_urgent":{"name":"gsis_relief_urgent_v1","language":"en_GB","category":"UTILITY","id":"2373646553447066","fields":["recipient_name","duty_date","minutes_remaining","lesson_period_start_venue","private_timetable_url"],"body":"*Urgent Relief Assignment*\n\nHi {{1}}, Relief Team has assigned you a relief duty on {{2}} that starts in {{3}} minutes.\n\n{{4}}\n\nPlease view the relief instructions and acknowledge your duty now: {{5}}.\n\nThank you.","bodySha256":"9d9e8965667a01205be101d2d85524966c194b0c1cd223a4b0f02cddb948f5da","submissionState":"APPROVED","privateLinkPurpose":"duties"},"relief_urgent_smc":{"name":"gsis_relief_urgent_smc_v1","language":"en_GB","category":"UTILITY","id":"4510849222577421","fields":["duty_smc_name","assigned_teacher_name","duty_date","minutes_remaining","lesson_period_start_venue","roster_status_url"],"body":"*Urgent Relief Cover*\n\nHi {{1}}, {{2}} has been assigned relief on {{3}}. The lesson starts in {{4}} minutes.\n\n{{5}}\n\nThe duty has not yet been acknowledged. Please check that cover is confirmed.\n\nView the current status here: {{6}}.\n\nThank you.","bodySha256":"04a471667a7b4ab196723faf083c03d3efa2564fe4b5e2d36e369f56c216d4c5","submissionState":"APPROVED"},"relief_evening":{"name":"gsis_relief_evening_v1","language":"en_GB","category":"UTILITY","id":"1662539355443373","fields":["duty_smc_name","duty_date","absence_allocation_uncovered_summary","roster_plan_url"],"body":"*Relief Planning Update*\n\nHi {{1}}, here is the relief planning update for {{2}}.\n\n{{3}}\n\nThese allocations are drafts pending publication.\n\nReview the plan here: {{4}}.\n\nThank you.","bodySha256":"2a304cb253c2a479054456b59eaee42bfcfd7f84ab850f253892dcec786811a7","submissionState":"APPROVED"},"relief_morning":{"name":"gsis_relief_morning_v1","language":"en_GB","category":"UTILITY","id":"1082281697770168","fields":["duty_smc_name","duty_date","overnight_absence_allocation_summary","relief_health_summary","roster_plan_url"],"body":"*Morning Relief Summary*\n\nHi {{1}}, here is the relief summary for {{2}}.\n\n{{3}}\n\nRelief Health: {{4}}\n\nThese allocations are drafts pending publication.\n\nReview the plan here: {{5}}.\n\nThank you.","bodySha256":"b3009ec5257e543007a1f4376ce17d3496c73242806d3ea2776ae68ea7f6f771","submissionState":"APPROVED"},"absence_update":{"name":"gsis_absence_update_v1","language":"en_GB","category":"UTILITY","id":"934616792782108","fields":["duty_smc_name","new_absence_count","duty_date","additional_periods_allocation_summary","roster_plan_url"],"body":"*New Absence Update*\n\nHi {{1}}, {{2}} new absence(s) have been reported for {{3}} since the previous update.\n\n{{4}}\n\nReview the latest allocation and publication status here: {{5}}.\n\nThank you.","bodySha256":"a420012bd6329823f4230d2f07d3ce6b67fb66a08eec141d2780edf3e3d72ad5","submissionState":"APPROVED"},"relief_manual_review":{"name":"gsis_relief_manual_review_v1","language":"en_GB","category":"UTILITY","id":"2188657595398105","fields":["duty_smc_name","duty_date","uncovered_periods_summary","roster_plan_url"],"body":"*Relief Allocation Requires Review*\n\nHi {{1}}, please review the relief plan for {{2}}.\n\nThe final scheduled allocation run is complete.\n{{3}}\n\nPlease allocate the remaining cover and publish the relief plan here: {{4}}.\n\nThank you.","bodySha256":"f5e3f7566836c327251efcf5098e9041b82edf2301514fd060b418ce0d7aaded","submissionState":"APPROVED"},"capacity_warning":{"name":"gsis_relief_capacity_warning_v1","language":"en_GB","category":"UTILITY","id":"1417951669852452","fields":["duty_smc_name","duty_date","capacity_details","relief_health_summary","roster_plan_url"],"body":"*Relief Capacity Warning*\n\nHi {{1}}, relief capacity for {{2}} needs your attention.\n\n{{3}}\n\nRelief Health: {{4}}\n\nReview the affected periods in Roster: {{5}}.\n\nPlease consider external ad hoc relief where needed. External staff are not activated automatically.","bodySha256":"485c4c68a32d419879943334a6ea9c28bc146c94f33c7bb317862af1e7802066","submissionState":"APPROVED"},"relief_final":{"name":"gsis_relief_final_v1","language":"en_GB","category":"UTILITY","id":"1465945335400661","fields":["duty_smc_name","duty_date","allocation_summary","relief_health_summary","roster_plan_url"],"body":"*Final Draft Relief Allocation*\n\nHi {{1}}, the final scheduled relief allocation for {{2}} is complete.\n\n{{3}}\n\nRelief Health: {{4}}\n\nReview and publish the draft in Roster: {{5}}.\n\nThank you.","bodySha256":"924dfff4c90543569170ba65da8705c6a444b2d92bc08d88aefed8742bd3d7cb","submissionState":"APPROVED"},"conditional_relief_instruction":{"name":"gsis_relief_instruction_v1","language":"en_GB","category":"UTILITY","id":"2516068742237019","fields":["recipient_name","class","duty_date","period_and_time","conditional_instruction","absent_teacher_name","absent_teacher_contact"],"body":"*Instructions for relief lesson*\n\nHi {{1}}, please note the following instructions for your assigned relief lesson at Gongshang Primary School.\n\nClass: {{2}}\nDate: {{3}}\nPeriod and time: {{4}}\n\nLesson instructions:\n{{5}}\n\nFor clarification, please contact {{6}}, the absent teacher:\n{{7}}\n\nThank you.","bodySha256":"93eb9ef8c917dd27080fb8f662eb2eee1aa8a277d18b9f24d3c4d2730da82723","submissionState":"PENDING"},"urgent_forward":{"name":"gsis_urgent_forward_v1","language":"en_GB","category":"UTILITY","id":"1617835963217353","fields":["recipient_name","original_message","sender_name","sender_contact"],"body":"*Urgent Message to Relief Team*\n\nHi {{1}}, a staff member has sent this urgent message:\n\n{{2}}\n\nFrom: {{3}}\nContact: {{4}}\n\nPlease contact the sender directly. This message does not create an absence report or confirm relief cover.","bodySha256":"ff20ca9b56ac87b376e07dae5055e106b58ab1a29695a2cb42049b13e7df5356","submissionState":"APPROVED"},"smc_attention":{"name":"gsis_relief_attention_v2","language":"en_GB","category":"UTILITY","id":"1612531343710304","fields":["duty_smc_name","duty_date","attention_details","roster_status_url"],"body":"*School Relief Allocation Requires Action*\n\nHi {{1}}, you are on SMC relief duty at Gongshang Primary School on {{2}}.\n\nThe following issue has been recorded in the teacher relief allocation for your duty date:\n\n{{3}}\n\nPlease review the affected lessons and confirm or correct their teacher coverage in Roster: {{4}}.\n\nThank you.","bodySha256":"640ce7d7db1fed87483ea77c32c5286ea473b09c42f4ac9b3fcf292652bcc43e","submissionState":"APPROVED"},"stapler_timetable":{"name":"gsis_timetable_updated_v1","language":"en_GB","category":"UTILITY","id":"1116798554168000","fields":["recipient_name","duty_date","change_details","private_timetable_url"],"body":"*Your timetable for today has changed*\n\nHi {{1}}, your timetable for today, {{2}}, has updates.\n\nSpecifically, the changes are:\n{{3}}\n\nView your updated timetable alongside your usual timetable:\n{{4}}\n\nThank you.\nGSiS Roster","bodySha256":"b7ea3b9c0741face4f14e08d84793fe3588a2f010ec8d629d2801db59f3bffcb","submissionState":"PENDING","privateLinkPurpose":"duties","variants":{"buttons":{"name":"gsis_timetable_updated_button_v2","language":"en_GB","category":"UTILITY","id":"1009634445543507","fields":["recipient_name","duty_date","change_details"],"body":"*Your timetable for today has changed*\n\nHi {{1}}, your timetable for today, {{2}}, has updates.\n\nSpecifically, the changes are:\n{{3}}\n\nPlease use the buttons below to view your updated timetable alongside your usual timetable and acknowledge this update.\n\nThank you.\nAccess https://roster.gsps.edu.sg for more info.","bodySha256":"c045ccb418e1680e2f528de915ba3897511bd7514eb9941b67f83fab2917c5b0","submissionState":"APPROVED","privateLinkPurpose":"duties","urlButtons":[{"text":"View Detail","url":"https://roster.gsps.edu.sg/external.html#{{1}}"},{"text":"Acknowledge","url":"https://roster.gsps.edu.sg/external.html?action=ack#{{1}}"}],"verifiedAt":"2026-10-22"}}},"stapler_request":{"name":"gsis_timetable_sponsor_v1","language":"en_GB","category":"UTILITY","id":"1647877567013330","fields":["recipient_name","requesting_teacher_name","duty_date","roster_plan_url"],"body":"*Request to plan Suspended Timetable*\n\nHi {{1}}, {{2}} has requested your approval to plan and publish a suspended timetable for {{3}}.\n\nPlease review the request and approve or reject it here:\n{{4}}\n\nThank you.","bodySha256":"740a0dbae98d03ada92af8e11602d180daa3054221fabc67d0442a7080a9a37f","submissionState":"PENDING"},"stapler_decision":{"name":"gsis_timetable_access_v1","language":"en_GB","category":"UTILITY","id":"2207471319799180","fields":["requesting_teacher_name","duty_date","change_details","roster_plan_url"],"body":"*Suspended timetable request outcome*\n\n{{1}} made a request to plan a suspended timetable for {{2}}.\n\nThe request has been reviewed and the outcome is:\n{{3}}\n\nView the request and decision here:\n{{4}}\n\nThank you.","bodySha256":"f36a327edb998054baf402b6a7c6df03c77804ad00425d659d3936c7e72d63b5","submissionState":"PENDING"}};
/* GSIS_WHATSAPP_CONTRACTS_END */
export {WHATSAPP_CONTRACTS};
function notificationConfig(env,requireEnabled=true,diagnostic=null){
 // Attribute the existing validation failure without logging values or errors.
 let field='WHATSAPP_ENABLED';
 try{
  if(requireEnabled&&env.WHATSAPP_ENABLED!=='true')throw Error('Notifications are disabled.');
  field='WHATSAPP_PHONE_NUMBER_ID';if(!/^\d{5,30}$/.test(env[field]||''))throw Error('WhatsApp setup is incomplete.');
  field='WHATSAPP_API_VERSION';if(!/^v\d+\.\d+$/.test(env[field]||''))throw Error('WhatsApp setup is incomplete.');
  for(field of ['WHATSAPP_ACCESS_TOKEN','WHATSAPP_APP_SECRET','ROSTER_SERVICE_SECRET','EXTERNAL_LINK_SECRET']){
   if(!configuredSecret(field==='ROSTER_SERVICE_SECRET'?gsisApiSecret(env,field):env[field]))throw Error('WhatsApp setup is incomplete.');
  }
  field='ROSTER_PUBLIC_ORIGIN';publicOrigin(env);
  field='APPS_SCRIPT_URL';const endpoint=new URL(env[field]||'');
  if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname))throw Error('WhatsApp setup is incomplete.');
  field='WHATSAPP_VERIFY_TOKEN';if(!configuredSecret(env[field]))throw Error('WhatsApp setup is incomplete.');
  for(field of ['WHATSAPP_ACCOUNT_ID','WHATSAPP_TEMPLATE_ACCOUNT_ID']){
   if(!/^\d{5,30}$/.test(env[field]||''))throw Error('WhatsApp setup is incomplete.');
  }
  field='CONTACTS_PUBLIC_URL';const contacts=new URL(env[field]||'');
  if(contacts.protocol!=='https:'||contacts.username||contacts.password||contacts.search||contacts.hash)throw Error('Configure the Contacts URL.');
  field='WHATSAPP_TEMPLATES_JSON';const templates=JSON.parse(env[field]||'{}');
  if(!templates||Array.isArray(templates)||typeof templates!=='object')throw Error('Invalid template configuration.');
  for(const [key,t] of Object.entries(templates)){
   const contract=configuredTemplateContract(key,t);
   if(!contract||!t||t.name!==contract.name||t.language!==contract.language||t.bodySha256!==contract.bodySha256)throw Error('Template contract mismatch: '+key);
  }
  // v0.9.7 user-approved migration: an already enabled legacy timetable route
  // adopts the verified button contract. Disabled routes remain disabled. Live
  // Meta approval/components are still checked before any send.
  const timetable=templates.stapler_timetable,base=WHATSAPP_CONTRACTS.stapler_timetable,buttons=base.variants?.buttons;
  if(publicOrigin(env)==='https://roster.gsps.edu.sg'&&timetable?.enabled===true&&timetable.name===base.name&&buttons?.submissionState==='APPROVED')templates.stapler_timetable={...timetable,name:buttons.name,language:buttons.language,bodySha256:buttons.bodySha256};
  return {templates,contactsUrl:contacts.href};
 }catch(error){if(diagnostic)diagnostic.field=error?.code==='GSIS_SECRET_INVALID'?'GSIS_SECRET':field;throw error;}
}
let templateApprovalCache=null,templateApprovalFailure=null;
function configuredTemplateContract(key,configured){
 const base=WHATSAPP_CONTRACTS[key];if(!base)return null;
 if(!configured)return base;
 return [base,...Object.values(base.variants||{})].find(c=>c.name===configured.name&&c.language===configured.language&&c.bodySha256===configured.bodySha256)||null;
}
function templateFingerprint(env,config){return [env.WHATSAPP_API_VERSION,env.WHATSAPP_TEMPLATE_ACCOUNT_ID,env.WHATSAPP_ACCESS_TOKEN,JSON.stringify(config.templates)].join('|')}
export function notificationStatus(env){
 let config,templates={};
 try{const parsed=JSON.parse(env.WHATSAPP_TEMPLATES_JSON||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))templates=parsed;config=notificationConfig(env,false);templates=config.templates;}catch{}
 const enabled=env.WHATSAPP_ENABLED==='true',cached=config&&templateApprovalCache?.fingerprint===templateFingerprint(env,config)&&templateApprovalCache.until>Date.now()?templateApprovalCache:null;
 if(cached)Object.assign(templates,cached.selectedTemplates||{});
 const routes=Object.fromEntries(Object.entries(WHATSAPP_CONTRACTS).map(([key,base])=>{
  const t=templates[key],contract=configuredTemplateContract(key,t)||base,approval=cached?.approvals[key]||'unverified',configured=!!t&&!!configuredTemplateContract(key,t);
  const status=!t?'not_configured':!configured?'mismatch':!enabled||t.enabled!==true?'disabled':!config?'not_configured':approval;
  return [key,{name:contract.name,enabled:t?.enabled===true,status,approval,ready:status==='approved'}];
 }));
 const values=Object.values(routes),active=values.filter(t=>t.enabled);
 return {enabled,configured:!!config,ready:enabled&&active.length>0&&active.every(t=>t.ready),templatesEnabled:active.length,templatesReady:values.filter(t=>t.ready).length,approvalCheckRequired:!cached,checkedAt:cached?.checkedAt||null,routes};
}
function notificationTemplateKey(row){
 if(row?.data?.templateKey&&WHATSAPP_CONTRACTS[row.data.templateKey])return row.data.templateKey;
 const old={mutual_request:'mutual_request',mutual_override:'mutual_override',contact_review:'contact_review',relief_publication:'relief_assignment',relief_reminder:'relief_reminder',capacity_warning:'capacity_warning',smc_alert:'smc_attention'};
 return old[row?.kind]||null;
}
async function readTemplateCatalogue(env){
 let url='https://graph.facebook.com/'+env.WHATSAPP_API_VERSION+'/'+env.WHATSAPP_TEMPLATE_ACCOUNT_ID+'/message_templates?fields=name,language,status,category,parameter_format,components&limit=100';
 const live=[];
 for(let page=0;page<3&&url;page++){
  const u=new URL(url);if(u.hostname!=='graph.facebook.com'||u.protocol!=='https:')throw Error('Invalid template pagination.');
  const response=await fetch(u,{headers:{Authorization:'Bearer '+env.WHATSAPP_ACCESS_TOKEN},signal:AbortSignal.timeout(10000),redirect:'manual'});
  if(!response.ok)throw Error('Template approval check failed. No send was attempted.');
  const value=await response.json();if(!Array.isArray(value.data))throw Error('Invalid template approval response.');live.push(...value.data);url=value.paging?.next||null;
 }
 if(url)throw Error('Template catalogue exceeds the bounded approval check.');
 return live;
}
function templateContractMatches(record,expected){
 if(!record||record.category!=='UTILITY'||record.name!==expected.name||record.language!==expected.language)return false;
 if(record.parameter_format&&record.parameter_format!=='POSITIONAL')return false;
 const components=record.components||[],body=components.find(c=>c.type==='BODY');
 const buttons=components.find(c=>c.type==='BUTTONS');
 if(components.length!==(expected.urlButtons?.length?2:1)||body?.text!==expected.body)return false;
 if(expected.urlButtons?.length&&(!Array.isArray(buttons?.buttons)||buttons.buttons.length!==expected.urlButtons.length||buttons.buttons.some((b,i)=>b.type!=='URL'||b.text!==expected.urlButtons[i].text||b.url!==expected.urlButtons[i].url)))return false;
 const nums=[...new Set([...body.text.matchAll(/{{(\d+)}}/g)].map(m=>Number(m[1])))].sort((a,b)=>a-b);
 return nums.length===expected.fields.length&&nums.every((n,i)=>n===i+1);
}
function cacheTemplateApprovals(env,config,live){
 const fingerprint=templateFingerprint(env,config),selectedTemplates={};
 // The submitted v2 peer template remains pending until Meta returns an exact
 // approved body/button contract. Keep working v1 for pending/rejected variants.
 const base=WHATSAPP_CONTRACTS.mutual_request,buttons=base.variants?.buttons,current=config.templates.mutual_request;
 if(publicOrigin(env)==='https://roster.gsps.edu.sg'&&current?.enabled===true&&current.name===base.name&&buttons&&live.some(record=>record.status==='APPROVED'&&templateContractMatches(record,buttons))){
  config.templates.mutual_request={...current,name:buttons.name,language:buttons.language,bodySha256:buttons.bodySha256};selectedTemplates.mutual_request=config.templates.mutual_request;
 }
 const approvals=Object.fromEntries(Object.keys(WHATSAPP_CONTRACTS).map(key=>{
  const contract=configuredTemplateContract(key,config.templates[key]);if(!contract)return [key,'mismatch'];
  const records=live.filter(t=>t.name===contract.name&&t.language===contract.language),matching=records.filter(t=>templateContractMatches(t,contract));
  const status=matching.some(t=>t.status==='APPROVED')?'approved':!records.length?'missing':!matching.length?'mismatch':String(matching[0].status||'').toLowerCase();
  return [key,['approved','pending','missing','mismatch','rejected','paused','disabled','in_appeal','pending_deletion','deleted'].includes(status)?status:'unverified'];
 }));
 const keys=Object.keys(config.templates).filter(key=>config.templates[key].enabled===true&&approvals[key]==='approved'),checkedAt=Date.now();
 return templateApprovalCache={fingerprint,keys,approvals,selectedTemplates,checkedAt,until:checkedAt+300000};
}
export async function approvedTemplateKeys(env,config=notificationConfig(env)){
 const requested=Object.keys(config.templates).filter(k=>config.templates[k].enabled===true);
 if(!requested.length)return [];
 const fingerprint=templateFingerprint(env,config);
 if(templateApprovalCache?.fingerprint===fingerprint&&templateApprovalCache.until>Date.now()){Object.assign(config.templates,templateApprovalCache.selectedTemplates||{});return templateApprovalCache.keys;}
 try{const keys=cacheTemplateApprovals(env,config,await readTemplateCatalogue(env)).keys;templateApprovalFailure=null;return keys;}
 catch(error){templateApprovalFailure={fingerprint,checkedAt:Date.now()};throw error;}
}
function assertCurrentTimetableDate(row){
 if(notificationTemplateKey(row)==='stapler_timetable'){const today=singaporeDate();if(row.data?.dailyPublication===true?row.date<today:row.date!==today)throw Error('STALE_TIMETABLE_NOTIFICATION');}
}
function templateText(value,field,limit=1024,isUrl=field.endsWith('_url')){
 if(value===undefined||value===null||!['string','number'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))throw Error('MISSING_OR_INVALID_TEMPLATE_FIELD:'+field);
 const raw=String(value);
 if(!raw.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u0084\u0086-\u009f]/.test(raw))throw Error('MISSING_OR_INVALID_TEMPLATE_FIELD:'+field);
 if(isUrl){
  try{const u=new URL(raw);if(u.protocol!=='https:'||!u.hostname||u.username||u.password||/[\s\u0085\\]/u.test(raw)||raw.length>4096)throw Error();}catch{throw Error('INVALID_TEMPLATE_URL:'+field);}
  return raw; // A signed capability must remain byte-for-byte identical.
 }
 // Encode only the outbound parameter. Stored instructions and approved body
 // paragraphs retain their original formatting; no words are truncated.
 const text=raw.split(/\r\n|[\r\n\u0085\u2028\u2029]/u).map(line=>line.replace(/[\t\p{Zs}]+/gu,' ').trim()).filter(Boolean).join('; ');
 if(!text)throw Error('MISSING_OR_INVALID_TEMPLATE_FIELD:'+field);
 if([...raw].length>32000||[...text].length>limit)throw Error('NOTIFICATION_CONTENT_EXCEEDS_VERIFIED_TEMPLATE');
 return text;
}
export async function templateMessage(row,env,config=notificationConfig(env)){
 const key=notificationTemplateKey(row),template=config.templates[key],contract=configuredTemplateContract(key,template);
 if(!contract||!row.id||!row.claimId||!row.recipientId||!/^\+?[1-9]\d{7,14}$/.test(row.mobile||'')||!validDate(row.date)||!Number.isFinite(row.expiresAt)||row.expiresAt<=Date.now())throw Error('INVALID_OR_EXPIRED_NOTIFICATION');
 assertCurrentTimetableDate(row);
 if(!template||template.name!==contract.name||template.language!==contract.language)throw Error('TEMPLATE_CONTRACT_MISMATCH');
 const data=row.data||{},dateValue=new Date(row.date+'T12:00:00+08:00');
 const dateLabel=new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',day:'numeric',month:'short',year:'numeric'}).format(dateValue)+' ('+new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',weekday:'short'}).format(dateValue)+')';
 const purpose=contract.privateLinkPurpose;
 // Legacy malformed jobs without an issuance timestamp retain their existing
 // cutoff. Never use the retry clock to turn them into a sliding capability.
 const issuedAt=Number.isFinite(row.linkIssuedAt)?row.linkIssuedAt:Number.isFinite(Date.parse(row.createdAt))?Date.parse(row.createdAt):row.expiresAt-LINK_AGE;
 const url=purpose?await externalUrl({staffId:row.recipientId,date:row.date,purpose,requestId:row.requestId,...(data.communicationSnapshot?{communicationId:row.id}:{}),issuedAt,expiresAt:purpose==='mutual'?row.expiresAt:row.linkExpiresAt||issuedAt+LINK_AGE},env):publicOrigin(env)+'/';
 const summary=contract.urlButtons?.length&&key==='stapler_timetable'?String(data.summary||'').replace(/ Please open the private timetable and acknowledge this update\.$/,''):data.summary;
 const valuesByField={recipient_name:row.name,duty_smc_name:row.name,duty_date:dateLabel,request_date:dateLabel,requesting_teacher_name:data.requesterName,assigned_teacher_name:data.assignedTeacherName,
  private_approval_url:url,private_published_duties_url:url,private_timetable_url:url,roster_status_url:url,roster_plan_url:url,contacts_review_url:config.contactsUrl,
  lessons_and_periods:data.summary,change_details:summary,contact_review_details:data.summary,lessons_periods_venues:data.summary,changed_or_cancelled_duties:data.summary,lesson_period_time_venue:data.summary,lesson_period_start_venue:data.summary,
  absence_allocation_uncovered_summary:data.summary,overnight_absence_allocation_summary:data.summary,relief_health_summary:data.healthSummary,additional_periods_allocation_summary:data.summary,uncovered_periods_summary:data.summary,allocation_summary:data.summary,capacity_details:data.summary,attention_details:data.summary,
  new_absence_count:data.newAbsenceCount,original_message:data.originalMessage,sender_name:data.senderName,sender_contact:data.senderContact,'class':data.className,period_and_time:data.periodAndTime,conditional_instruction:data.instruction,absent_teacher_name:data.absentTeacherName,absent_teacher_contact:data.absentTeacherContact};
 if(contract.fields.includes('minutes_remaining')){const n=Math.ceil((Number(data.startAt)-Date.now())/60000);if(!Number.isInteger(n)||n<1||n>20)throw Error('STALE_COUNTDOWN_NOTIFICATION');valuesByField.minutes_remaining=n;}
 if(key==='relief_reminder'||key==='relief_unacknowledged'){const target=key==='relief_reminder'?20:10,n=(Number(data.startAt)-Date.now())/60000;if(!(n>target-1&&n<=target))throw Error('STALE_COUNTDOWN_NOTIFICATION');}
 if(key==='relief_manual_review'||key==='relief_final'){if(data.finalRunComplete!==true)throw Error('FINAL_RUN_NOT_CONFIRMED');}
 const limit=Number(template.summaryMaxCharacters||1024);if(!Number.isInteger(limit)||limit<1||limit>32000)throw Error('INVALID_TEMPLATE_LIMIT');
 const values=contract.fields.map(field=>templateText(valuesByField[field],field,limit,field.endsWith('_url')||field==='absent_teacher_contact'&&/^https?:\/\//i.test(valuesByField[field]||'')));
 const components=[{type:'body',parameters:values.map(text=>({type:'text',text}))}];
 for(const [index,button] of (contract.urlButtons||[]).entries()){
  const target=button.url.replace('{{1}}',new URL(url).hash.slice(1));
  if(!purpose||!button.url.endsWith('#{{1}}')||new URL(target).origin!==publicOrigin(env)||new URL(target).pathname!=='/external.html')throw Error('INVALID_PRIVATE_BUTTON_CONTRACT');
  templateText(target,'private_button_url',4096,true);
  components.push({type:'button',sub_type:'url',index:String(index),parameters:[{type:'text',text:new URL(url).hash.slice(1)}]});
 }
 return {messaging_product:'whatsapp',recipient_type:'individual',to:row.mobile.replace(/^\+/,''),type:'template',biz_opaque_callback_data:row.id,template:{name:contract.name,language:{code:contract.language},components}};
}
// This function runs only in a scheduled/Queue consumer invocation. HTTP
// waitUntil may enqueue a wake, but cannot own prepare/send/result lifetimes.
export async function dispatchNotifications(env,options={}){
 let config;try{config=notificationConfig(env)}catch{return {enabled:false,claimed:0,sent:0,failed:0,uncertain:0}};
 if(edgeRosterEnabled(env)&&!await edgeDispatchHasWork(env,'notifications'))return {enabled:true,approvalChecked:false,claimed:0,sent:0,failed:0,uncertain:0,cancelled:0,prepareFailures:0,resultFailures:0,batches:0,backendCalls:0,idle:true};
 const started=Date.now(),allowed=await approvedTemplateKeys(env,config),budget=Math.max(30000,Math.min(600000,Number(options.budgetMs)||180000)),dispatchId=crypto.randomUUID();
 const maxParallel=Math.max(1,Math.min(20,Number(env.WHATSAPP_SEND_CONCURRENCY)||12)),perSecond=Math.max(1,Math.min(20,Number(env.WHATSAPP_SENDS_PER_SECOND)||12));
 let width=maxParallel,lastLaunch=0,previousResults=[];
 const summary={enabled:true,approved:allowed.length,claimed:0,sent:0,failed:0,uncertain:0,cancelled:0,prepareFailures:0,resultFailures:0,batches:0,backendCalls:0},seen=new Set();
 const call=async input=>{summary.backendCalls++;if(['claimNotifications','prepareNotification','prepareNotifications'].includes(input.operation)){const pending=await pendingAbsenceTransport(env);input={...input,pendingTransportDates:pending.blockedDates};}try{const result=await serviceBackend(env,input);if(!result.ok)summary.failure=safeHealthError({...result,operation:input.operation});return result;}catch(error){summary.failure=safeHealthError({...error,operation:input.operation,name:error.name});throw error;}};
 const settle=async results=>{let recorded=false;for(let retry=0;retry<2&&!recorded;retry++){try{recorded=(await call({operation:'notificationResults',results})).ok===true;}catch{}}if(!recorded)summary.resultFailures++;return recorded;};
 while(Date.now()-started<budget-30000&&summary.claimed<500){
  let claimed;
  try{claimed=await call({operation:'claimNotifications',claimProtocol:2,batchId:crypto.randomUUID(),dispatchId,limit:width,allowedTemplateKeys:allowed,...(previousResults.length?{previousResults}:{})});if(!claimed.ok)throw Error();}
  catch{summary.prepareFailures++;if(previousResults.length)await settle(previousResults);previousResults=[];break;}
  // A rolling deployment may answer with the older protocol. Settle known
  // outcomes explicitly before using that response; never repeat the sends.
  if(previousResults.length&&claimed.data?.transportVersion!==2&&!await settle(previousResults)){previousResults=[];break;}
  previousResults=[];
  if(claimed.data?.pending){Object.assign(summary,{pending:true,reason:claimed.data.reason,readyAt:claimed.data.readyAt});break;}
  const rows=claimed.data?.notifications||claimed.data?.items||claimed.data?.rows||[];
  if(!Array.isArray(rows)||rows.length>20)throw Error('Invalid notification queue response.');
  const fresh=rows.filter(row=>!seen.has(row.id));if(!fresh.length)break;fresh.forEach(row=>seen.add(row.id));summary.claimed+=fresh.length;
  if(Number.isInteger(claimed.data?.suggestedConcurrency))width=Math.min(maxParallel,Math.max(1,claimed.data.suggestedConcurrency));
  const combined=claimed.data?.transportVersion===2&&claimed.data?.prepared===true,batched=combined||claimed.data?.transportVersion===1;let prepared=[];
  try{
   if(combined)prepared=fresh;
   else if(batched){const checked=await call({operation:'prepareNotifications',claims:fresh.map(({id,claimId})=>({id,claimId})),allowedTemplateKeys:allowed});if(!checked.ok||!Array.isArray(checked.data?.notifications))throw Error();prepared=checked.data.notifications;}
   else for(const claim of fresh){const checked=await call({operation:'prepareNotification',id:claim.id,claimId:claim.claimId,allowedTemplateKeys:allowed});if(!checked.ok)throw Error();if(checked.data?.notification)prepared.push(checked.data.notification);}
  }catch{summary.prepareFailures++;break;}
  if(prepared.some(row=>!fresh.some(claim=>claim.id===row.id&&claim.claimId===row.claimId)))throw Error('Invalid prepared notification batch.');
  summary.cancelled+=fresh.length-prepared.length;
  const results=await Promise.all(prepared.map(async(row,index)=>{
   // Reserve launch slots before awaiting. One backend drain lease shares the
   // phone-number budget across concurrent cron and Queue invocations.
   const launch=Math.max(Date.now(),lastLaunch+1000/perSecond);lastLaunch=launch;
   const delay=Math.ceil(launch-Date.now());if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));
   let payload,state='failed',messageId='',error='INVALID_OR_EXPIRED_NOTIFICATION',providerError=null,rateLimited=false,retryAfterMs=0,submittedAt=0;
   try{payload=await templateMessage(row,env,config);assertCurrentTimetableDate(row)}catch(e){payload=null;error=String(e.message).slice(0,180);}
   if(payload){state='uncertain';error='SEND_RESULT_UNCONFIRMED';try{
    submittedAt=Date.now();if(summary.firstSubmittedMs===undefined)summary.firstSubmittedMs=submittedAt-started;
    const response=await sendWhatsAppPayload(payload,env);
    let value;try{value=await response.json();}catch{value={};}providerError=providerDiagnostic(value,payload);
    rateLimited=response.status===429||[130429,131048,131056].includes(value.error?.code);
    if(rateLimited){const retry=response.headers?.get?.('Retry-After'),seconds=Number(retry);retryAfterMs=retry&&Number.isFinite(seconds)?Math.max(1000,seconds*1000):retry?Math.max(1000,Date.parse(retry)-Date.now()):60000;if(!Number.isFinite(retryAfterMs))retryAfterMs=60000;}
    if(response.ok&&typeof value.messages?.[0]?.id==='string'&&value.messages[0].id.startsWith('wamid.')){state='sent';messageId=value.messages[0].id;error='';if(summary.firstAcceptedMs===undefined)summary.firstAcceptedMs=Date.now()-started;}
    else if(rateLimited){state='failed';error=Number.isInteger(value.error?.code)?'META_'+value.error.code:'META_RATE_LIMIT';}
    else if(!response.ok&&response.status<500&&value.error&&Number.isInteger(value.error.code)){state='failed';error='META_'+value.error.code;}
   }catch{}}
   summary[state]++;return {id:row.id,claimId:row.claimId,state,messageId,error,...(submittedAt?{submittedAt}:{}),...(providerError?{providerError}:{}),...(rateLimited?{rateLimited,retryAfterMs}:{})};
  }));
  summary.batches++;
  if(results.length){
   // Pipeline settlement with the next atomic handoff: N batches cost N+1
   // backend calls, instead of separate claim/prepare/result calls per batch.
   if(combined&&!results.some(result=>result.rateLimited)&&Date.now()-started<budget-30000&&summary.claimed<500)previousResults=results;
   else if(batched){if(!await settle(results))break;}
   else{let confirmed=true;for(const result of results){let recorded=false;for(let retry=0;retry<2&&!recorded;retry++){try{recorded=(await call({operation:'notificationResult',...result})).ok===true;}catch{}}if(!recorded){summary.resultFailures++;confirmed=false;break;}}if(!confirmed)break;}
  }
  if(results.some(result=>result.rateLimited)){width=Math.max(1,Math.floor(width/2));summary.pending=true;summary.reason='provider-cooldown';summary.readyAt=Date.now()+Math.max(...results.map(result=>result.retryAfterMs||0));break;}
  if(results.every(result=>result.state==='sent'))width=Math.min(maxParallel,width+1);
 }
 if(previousResults.length)await settle(previousResults);
 summary.elapsedMs=Date.now()-started;
 if(Date.now()-started>=budget-30000||summary.claimed>=500)summary.pending=true;
 return summary;
}
export async function enqueueNotificationWake(env){
 if(!env.NOTIFICATION_DISPATCH_URL)return {queued:false,mode:'scheduled'};
 const url=new URL(env.NOTIFICATION_DISPATCH_URL);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/dispatch')throw Error('Invalid notification dispatcher URL.');
 if(!configuredSecret(gsisApiSecret(env,'ROSTER_SERVICE_SECRET')))throw Error('Notification wake secret is not configured.');
 const body=await sign({purpose:'gsis-notification-wake-v1',timestamp:Date.now(),nonce:crypto.randomUUID()},gsisApiSecret(env,'ROSTER_SERVICE_SECRET'));
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('Notification wake could not be queued. The scheduled worker will recover the durable intent.');
 return {queued:true,mode:'immediate'};
}

export async function dispatchAllocationAudit(env){
 const result=await serviceBackend(env,{operation:'allocationAuditExport',limit:1});
 if(!result.ok)throw Object.assign(Error('Allocation audit export could not be confirmed.'),safeHealthError(result),{status:result.status,operation:'allocationAuditExport'});
 const data=result.data;
 if(!data||!Array.isArray(data.exported)||!Array.isArray(data.failures)||!Number.isSafeInteger(data.pending)||data.pending<0)throw Object.assign(Error('Invalid allocation audit status.'),{code:'INVALID_RESPONSE',operation:'allocationAuditExport'});
 // Only operational counters cross into health/logs; never persist dates,
 // file identifiers, staff facts or provider/backend error text here.
 const failed=data.failures.length,code=data.disabled?'AUDIT_LOGGING_DISABLED':data.busy?'AUDIT_EXPORT_BUSY':data.deferred==='notification-priority'?'AUDIT_NOTIFICATION_PRIORITY':undefined;
 return {exported:data.exported.length,pending:data.pending,failed,enabled:data.disabled!==true,...(code?{skipped:true,code}:{}),...(failed?{failure:{code:'AUDIT_EXPORT_PENDING',operation:'allocationAuditExport'}}:{})};
}

export function menuReply(reply,env){
 if(!reply||!/^\d{8,15}$/.test(reply.to))throw Error('Invalid menu recipient.');
 const base={messaging_product:'whatsapp',recipient_type:'individual',to:reply.to},text=body=>({...base,type:'text',text:{preview_url:false,body}});
 const safeLink=(value,label)=>{try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash)throw Error();return text(label+': '+u.href);}catch{return text(label+' is not configured. Please open Roster or contact the school directly.');}};
 switch(reply.action){
  case 'urgent-prompt':return text('Type your urgent message for the Relief Team.');
  case 'urgent-confirm':return text('Your urgent message has been recorded for the Relief Team in Roster. WhatsApp forwarding is queued; delivery or action is not yet confirmed. Please call the school directly if immediate help is needed.');
  case 'inbox-urgent-confirm':return text('Your urgent message has been recorded in the school WhatsApp Inbox for the current duty SMC. Delivery or action is not yet confirmed. Please call the school directly if immediate help is needed.');
  case 'urgent-no-recipient':return text('Your message was recorded, but no eligible Relief Team recipients are configured. Please contact the school directly.');
  case 'unknown':return text('This number could not be matched uniquely to an active staff or engaged relief teacher record. Contact the school directly; no staff records have been shared.');
  case 'unsupported':return text('Please type your urgent message as text. Voice notes, pictures and attachments are not forwarded.');
  case 'rate-limited':return text('Please wait a minute before sending another menu request. For urgent help, call the school directly.');
  case 'report-absence':return safeLink(env.WHATSAPP_CURRENT_RELIEF_URL,'Report Absence');
  case 'layout':return safeLink(env.WHATSAPP_LAYOUT_URL,'School Layout');
  case 'devices':return safeLink(env.WHATSAPP_LORD_URL,'Collect / Return ICT Devices');
  case 'office':{
   const number=String(env.GENERAL_OFFICE_PHONE||'').replace(/[\s()-]/g,'');
   if(!/^\+[1-9]\d{7,14}$/.test(number))return text('The General Office telephone number is not configured. Please use the school’s published contact details.');
   // A contact phone (without wa_id) exposes the ordinary telephone number, not a WhatsApp call endpoint.
   return {...base,type:'contacts',contacts:[{name:{formatted_name:'Gongshang Primary General Office',first_name:'General Office'},org:{company:'Gongshang Primary School'},phones:[{phone:number,type:'WORK'}]}]};
  }
  default:return {...base,type:'interactive',interactive:{type:'list',body:{text:'Gongshang Primary · Choose an action.'},action:{button:'School contact menu',sections:[{title:'School services',rows:[{id:'gsis_report_absence',title:'Report Absence',description:'Open the current relief system'},{id:'gsis_urgent',title:'Urgent Message',description:'Type a message for the Relief Team'},{id:'gsis_layout',title:'School Layout'},{id:'gsis_devices',title:'Collect / Return ICT',description:'Open the LORD device portal'},{id:'gsis_office',title:'Call General Office',description:'Use the ordinary telephone number'}]}]}}};
 }
}
const INBOX_ALERT_TEMPLATE={name:'gsis_inbox_new_message_v1',language:'en_GB',body:'*New School WhatsApp Message*\n\nHi {{1}}, a new message from {{2}} is waiting in the GSiS WhatsApp Inbox.\n\nOpen Roster to review and reply: {{3}}.'};
export async function dispatchInboxAlerts(alerts,env){
 if(!Array.isArray(alerts)||alerts.length>100)throw Error('Invalid inbox alerts.');
 let approved=false;
 if(alerts.length&&env.WHATSAPP_INBOX_ALERTS_ENABLED==='true')try{approved=(await inboxTemplates(env)).some(t=>t.name===INBOX_ALERT_TEMPLATE.name&&t.language===INBOX_ALERT_TEMPLATE.language&&t.body===INBOX_ALERT_TEMPLATE.body&&t.parameterCount===3);}catch{}
 for(const claim of alerts){
  if(!approved){const saved=await serviceBackend(env,{operation:'inboxAlertResult',...claim,state:'blocked',error:inboxProviderError(null,'Inbox duty alerts require an enabled, approved template.')});if(!saved.ok)throw Error('Inbox alert status could not be recorded.');continue;}
  const prepared=await serviceBackend(env,{operation:'inboxAlertPrepare',...claim});if(!prepared.ok)throw Error('Inbox alert eligibility could not be confirmed.');const alert=prepared.data?.alert;if(!alert)continue;
  let outcome={state:'failed',error:inboxProviderError(null,'Invalid inbox alert. No send was attempted.')};
  if(alert.id===claim.alertId&&alert.claimId===claim.claimId&&/^\d{8,15}$/.test(alert.to||'')&&[alert.name,alert.senderName].every(s=>typeof s==='string'&&s.trim()&&s.length<=1024)){
   try{
    const payload={messaging_product:'whatsapp',recipient_type:'individual',to:alert.to,type:'template',biz_opaque_callback_data:'inbox-alert:'+alert.id,template:{name:INBOX_ALERT_TEMPLATE.name,language:{code:INBOX_ALERT_TEMPLATE.language},components:[{type:'body',parameters:[alert.name,alert.senderName,publicOrigin(env)+'/#whatsappInbox'].map((value,i)=>({type:'text',text:templateText(value,'parameter_'+(i+1),1024,i===2)}))}]}};
    outcome=await inboxSend(payload,env);
   }catch{outcome.error=inboxProviderError(null,'Invalid inbox alert parameters. No send was attempted.');}
  }
  const saved=await serviceBackend(env,{operation:'inboxAlertResult',...claim,...outcome});if(!saved.ok)throw Error('Inbox alert result could not be recorded.');
 }
}
async function handleIncomingMessage(message,env,ctx){
 if(env.WHATSAPP_ENABLED!=='true')return {disabled:true};
 if(typeof message.id!=='string'||!message.id.startsWith('wamid.')||!/^\d{8,15}$/.test(String(message.from||''))||!/^\d+$/.test(String(message.timestamp||'')))throw Error('Invalid incoming message.');
 const captured=message.type==='audio'?await captureInboxAudio(message,env):message.type==='image'?((env.WHATSAPP_DURABLE_INGRESS==='true'||edgeRosterEnabled(env))?await captureInboxMedia(message,env,'image'):{image:inboxMediaMetadata(message,'image'),retry:false}):null;
 const retained={id:message.id,from:message.from,timestamp:Number(message.timestamp),type:message.type,text:message.type==='image'?message.image?.caption:message.type==='text'?message.text?.body:message.type==='interactive'?message.interactive?.list_reply?.title||message.interactive?.button_reply?.title:message.type==='button'?message.button?.text:undefined,profileName:message.profileName,context:message.context?.id?{id:message.context.id}:undefined,...(captured?{[message.type]:captured[message.type]}:{})};
 const ingested=await serviceBackend(env,{operation:'inboxIngest',message:retained});if(!ingested.ok)throw Error('Incoming message could not be retained.');
 // Duty alerts are durable intents, dispatched only by the scheduled worker.
 // Delayed events still belong in the inbox, but cannot open a free-form menu
 // reply window. Audio is retained without the old "not forwarded" response.
 if(env.WHATSAPP_MENU_ENABLED!=='true'||['audio','image'].includes(message.type)||Number(message.timestamp)*1000<=Date.now()-86400000){if(captured?.retry)throw Error('Audio capture will retry.');return {recorded:true};}
 // Keep school service menus, but their urgent forwarding is now restricted to
 // current duty SMC by the signed backend. Inbox ingestion is independent.
 const input={operation:'inboundMessage',inboxMode:true,messageId:message.id,from:message.from,timestamp:Number(message.timestamp)*1000,type:message.type,text:message.type==='text'?message.text?.body:undefined,selection:message.type==='interactive'?message.interactive?.list_reply?.id||message.interactive?.button_reply?.id:undefined};
 const saved=await serviceBackend(env,input);if(!saved.ok)throw Error('Incoming message could not be recorded.');const result=saved.data;
 if(!result?.reply){if(captured?.retry)throw Error('Audio capture will retry.');return result;}
 let state='failed',messageId='';
 try{
  const payload=menuReply(result.reply,env);state='uncertain';
  const response=await sendWhatsAppPayload(payload,env),value=await response.json();
  if(response.ok&&typeof value.messages?.[0]?.id==='string'){state='sent';messageId=value.messages[0].id;}else if(!response.ok&&response.status<500&&value.error)state='failed';
 }catch{}
 const recorded=await serviceBackend(env,{operation:'inboundReplyResult',receiptId:result.receiptId,replyClaimId:result.replyClaimId,state,messageId});if(!recorded.ok)throw Error('Reply outcome unconfirmed.');
 if(captured?.retry)throw Error('Audio capture will retry.');
 return {...result,reply:undefined,replyState:state};
}

// D1 durably captures webhook ingress before acknowledgement. In edge authority
// mode, processing also commits inbox messages and provider outcomes to Roster D1.
export const WEBHOOK_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS gsis_webhook_jobs (
 id TEXT PRIMARY KEY, phone_id TEXT NOT NULL, account_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('status','incoming')),
 payload TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','claimed','done')),
 created_at INTEGER NOT NULL, available_at INTEGER NOT NULL, claim_id TEXT,
 lease_until INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
 last_code TEXT, completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS gsis_webhook_ready ON gsis_webhook_jobs(phone_id, account_id, state, available_at, lease_until);
CREATE TABLE IF NOT EXISTS gsis_read_claims (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, lease_until INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS gsis_read_claims_expiry ON gsis_read_claims(lease_until);`;
async function webhookStatusEvents(statuses,env){
 const events=await Promise.all(statuses.map(async status=>({...status,eventId:status.eventId||await sha256Hex(enc.encode(JSON.stringify([env.WHATSAPP_PHONE_NUMBER_ID,status.messageId,status.state,status.timestamp,status.recipientId])))})));
 const inboxEvents=events.filter(status=>status.notificationId.startsWith('inbox:')||!status.notificationId);
 for(let offset=0;offset<inboxEvents.length;offset+=4)await Promise.all(inboxEvents.slice(offset,offset+4).map(async status=>{const reference=status.notificationId,result=await serviceBackend(env,{operation:'inboxDelivery',...status,...(reference.startsWith('inbox:')?{replyId:reference.slice(6)}:{})});if(!result.ok)throw Error('Status not committed.');}));
 const rosterEvents=events.filter(status=>!status.notificationId.startsWith('inbox:')&&!status.notificationId.startsWith('inbox-alert:'));
 if(rosterEvents.length){const result=await serviceBackend(env,rosterEvents.length===1?{operation:'notificationDelivery',...rosterEvents[0]}:{operation:'notificationDeliveryBatch',events:rosterEvents});if(!result.ok)throw Error('Status not committed.');}
}
async function acceptWebhookJobs(env,statuses,incoming){
 if(!env.GSIS_JOBS?.batch)throw Error('Durable webhook storage is not configured.');
 const now=Date.now(),jobs=[];
 for(const status of statuses){
  const eventId=await sha256Hex(enc.encode(JSON.stringify([env.WHATSAPP_PHONE_NUMBER_ID,status.messageId,status.state,status.timestamp,status.recipientId])));
  jobs.push({id:'status:'+eventId,kind:'status',payload:JSON.stringify({...status,eventId})});
 }
 for(const message of incoming){
  if(typeof message.id!=='string'||!/^wamid\.[\w=.+/-]{1,500}$/.test(message.id)||!/^\d{8,15}$/.test(String(message.from||''))||!/^\d+$/.test(String(message.timestamp||'')))throw Error('Invalid incoming message.');
  jobs.push({id:'incoming:'+await sha256Hex(enc.encode(JSON.stringify([env.WHATSAPP_PHONE_NUMBER_ID,message.id]))),kind:'incoming',payload:JSON.stringify(message)});
 }
 if(jobs.length){
  const results=await env.GSIS_JOBS.batch(jobs.map(job=>env.GSIS_JOBS.prepare('INSERT OR IGNORE INTO gsis_webhook_jobs (id,phone_id,account_id,kind,payload,created_at,available_at) VALUES (?,?,?,?,?,?,?)').bind(job.id,String(env.WHATSAPP_PHONE_NUMBER_ID),String(env.WHATSAPP_ACCOUNT_ID),job.kind,job.payload,now,now)));
  if(results.some(result=>result.success===false))throw Error('Webhook acceptance was not committed.');
 }
 return jobs.length;
}
export async function dispatchWebhookJobs(env,{budgetMs=240000,limit=20}={}){
 if(env.WHATSAPP_DURABLE_INGRESS!=='true')return {enabled:false};
 if(!env.GSIS_JOBS?.prepare)throw Error('Durable webhook storage is not configured.');
 const started=Date.now(),summary={enabled:true,claimed:0,completed:0,retrying:0},bounded=Math.max(1,Math.min(40,Number(limit)||20));
 while(Date.now()-started<Math.max(1,Math.min(240000,budgetMs))){
  const now=Date.now(),claimId=crypto.randomUUID();
  const claim=async(kind,count)=>{
   const result=await env.GSIS_JOBS.prepare("UPDATE gsis_webhook_jobs SET state='claimed',claim_id=?,lease_until=?,attempts=attempts+1 WHERE id IN (SELECT id FROM gsis_webhook_jobs WHERE phone_id=? AND account_id=? AND kind=? AND ((state='queued' AND available_at<=?) OR (state='claimed' AND lease_until<=?)) ORDER BY created_at,id LIMIT ?) RETURNING id,kind,payload,attempts").bind(claimId,now+300000,String(env.WHATSAPP_PHONE_NUMBER_ID),String(env.WHATSAPP_ACCOUNT_ID),kind,now,now,count).all();
   if(result.success===false)throw Error('Webhook claim failed.');return result.results||[];
  };
  // Claim only two incoming jobs: slow media and menu replies must finish well
  // inside the lease. Status facts can use the backend's bounded batch route.
  let rows=await claim('status',bounded);if(!rows.length)rows=await claim('incoming',Math.min(2,bounded));
  if(!rows.length)break;summary.claimed+=rows.length;
  const finish=async(row,success)=>{
   const delay=Math.min(3600000,15000*2**Math.min(8,Math.max(0,row.attempts-1)));
   const statement=success?env.GSIS_JOBS.prepare("UPDATE gsis_webhook_jobs SET state='done',payload='',claim_id=NULL,lease_until=0,completed_at=?,last_code=NULL WHERE id=? AND state='claimed' AND claim_id=?").bind(Date.now(),row.id,claimId):env.GSIS_JOBS.prepare("UPDATE gsis_webhook_jobs SET state='queued',claim_id=NULL,lease_until=0,available_at=?,last_code='BACKEND_RETRY' WHERE id=? AND state='claimed' AND claim_id=?").bind(Date.now()+delay,row.id,claimId);
   const saved=await statement.run();if(saved.success===false)throw Error('Webhook settlement failed.');
   if(success)summary.completed++;else summary.retrying++;
  };
  const statuses=rows.filter(row=>row.kind==='status');
  if(statuses.length){let success=false;try{await webhookStatusEvents(statuses.map(row=>JSON.parse(row.payload)),env);success=true;}catch{}for(const row of statuses)await finish(row,success);}
  // Two independent inbound jobs at a time. Backend message IDs and reply
  // claims deduplicate a replay after a timeout or lost D1 settlement.
  const incoming=rows.filter(row=>row.kind==='incoming');
  for(let offset=0;offset<incoming.length;offset+=2)await Promise.all(incoming.slice(offset,offset+2).map(async row=>{let success=false;try{if(env.WHATSAPP_ENABLED!=='true')throw Error('Disabled');await handleIncomingMessage(JSON.parse(row.payload),env);success=true;}catch{}await finish(row,success);}));
 }
 await env.GSIS_JOBS.prepare("DELETE FROM gsis_webhook_jobs WHERE state='done' AND completed_at<?").bind(Date.now()-30*86400000).run();
 return {...summary,elapsedMs:Date.now()-started};
}

export async function whatsappWebhook(req,env,ctx){
 const u=new URL(req.url);
 if(req.method==='GET'){
  if(!configuredSecret(env.WHATSAPP_VERIFY_TOKEN)||u.searchParams.get('hub.mode')!=='subscribe'||u.searchParams.get('hub.verify_token')!==env.WHATSAPP_VERIFY_TOKEN)return json({ok:false,error:'Verification failed.'},403);
  const challenge=u.searchParams.get('hub.challenge')||'';if(!/^\d{1,100}$/.test(challenge))return json({ok:false,error:'Invalid challenge.'},400);
  return new Response(challenge,{headers:{'Content-Type':'text/plain','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }
 if(req.method!=='POST')return json({ok:false,error:'POST required.'},405);
 if(!configuredSecret(env.WHATSAPP_APP_SECRET)||!env.WHATSAPP_PHONE_NUMBER_ID||!env.WHATSAPP_ACCOUNT_ID)return json({ok:false,error:'Webhook is not configured.'},503);
 const bytes=new Uint8Array(await req.arrayBuffer());if(bytes.length>262144)return json({ok:false,error:'Request too large.'},413);
 const signature=req.headers.get('X-Hub-Signature-256')||'';
 if(!signature.startsWith('sha256=')||!await verifyHmac(bytes,signature.slice(7),env.WHATSAPP_APP_SECRET))return json({ok:false,error:'Invalid signature.'},401);
 let event;try{event=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(event.object!=='whatsapp_business_account'||!Array.isArray(event.entry))throw Error()}catch{return json({ok:false,error:'Invalid event.'},400)}
 const statuses=[],incoming=[];
 for(const entry of event.entry){
  if(String(entry.id)!==String(env.WHATSAPP_ACCOUNT_ID))continue;
  for(const change of entry.changes||[]){
   if(change.field!=='messages'||String(change.value?.metadata?.phone_number_id)!==String(env.WHATSAPP_PHONE_NUMBER_ID))continue;
   for(const message of change.value?.messages||[])incoming.push({...message,profileName:(change.value?.contacts||[]).find(c=>String(c.wa_id)===String(message.from))?.profile?.name});
   for(const status of change.value?.statuses||[]){
    if(!['sent','delivered','read','failed'].includes(status.status)||typeof status.id!=='string'||!status.id.startsWith('wamid.')||!/^\d+$/.test(String(status.timestamp||'')))continue;
    // sent acknowledges API acceptance, not delivery. It can reconcile an
    // uncertain HTTP result using the opaque notification reference.
    statuses.push({messageId:status.id,state:status.status,timestamp:Number(status.timestamp)*1000,recipientId:String(status.recipient_id||''),notificationId:typeof status.biz_opaque_callback_data==='string'?status.biz_opaque_callback_data:'',...(status.errors?.[0]?{error:inboxProviderError(status.errors[0],'WhatsApp confirmed that delivery failed.'),providerError:providerDiagnostic(status.errors[0])}:{})});
   }
  }
 }
 if(statuses.length>100||incoming.length>20)return json({ok:false,error:'Too many status events.'},413);
 try{
  if((env.WHATSAPP_DURABLE_INGRESS==='true'||edgeRosterEnabled(env))){
   const accepted=await acceptWebhookJobs(env,statuses,incoming);
   // This is a latency optimisation only. Cron resumes every committed D1 job
   // if this HTTP background task is stopped, fails, or never starts.
   if(accepted&&ctx?.waitUntil)ctx.waitUntil(dispatchWebhookJobs(env,{budgetMs:10000,limit:4}).catch(()=>console.error(JSON.stringify({event:'roster-webhook-drain-retry'}))));
   return json({ok:true,accepted});
  }
  await webhookStatusEvents(statuses,env);
  for(const message of incoming)await handleIncomingMessage(message,env,ctx);
  if(incoming.length&&env.WHATSAPP_MENU_ENABLED==='true')await enqueueNotificationWake(env);
  return json({ok:true});
 }catch{return json({ok:false,error:'Delivery status could not be recorded.'},503)}
}

export async function dispatchDailyEmploymentReports(env){
 const result=await serviceBackend(env,{operation:'dailyEmploymentMailDispatch',publicOrigin:env.ROSTER_PUBLIC_ORIGIN});
 if(!result.ok)throw rosterScheduledFailure(result);
 return result.data;
}
let deliveryReportCompletion=null;
export async function dispatchDeliveryReviewReports(env,now=Date.now()){
 const local=new Date(now+8*3600000).toISOString(),date=local.slice(0,10);
 if(local.slice(11,16)<'08:00')return {reported:0,pending:0,deferred:'before-0800'};
 if(edgeRosterEnabled(env)&&!await edgeDispatchHasWork(env,'deliveryReview',date))return {reported:0,pending:0,date,alreadyReported:true};
 // This is only a warm-isolate read optimisation. The backend owns the durable
 // daily receipt and exact issue settlement across cold starts and other Workers.
 if(!edgeRosterEnabled(env)&&deliveryReportCompletion?.date===date&&deliveryReportCompletion.url===env.APPS_SCRIPT_URL&&deliveryReportCompletion.secret===gsisApiSecret(env,'ROSTER_SERVICE_SECRET'))return {reported:0,pending:0,date,alreadyReported:true};
 let monitor={state:'disabled',checkedAt:Date.now()};
 if(env.WHATSAPP_ENABLED==='true'){
  const diagnostic={};let config;
  try{config=notificationConfig(env,true,diagnostic);}catch{monitor={state:'configuration',field:diagnostic.field,checkedAt:Date.now()};}
  if(config){
   const failed=templateApprovalFailure?.fingerprint===templateFingerprint(env,config)&&Date.now()-templateApprovalFailure.checkedAt<60000;
   try{
    if(failed)throw Error('Approval monitoring failed.');
    await approvedTemplateKeys(env,config);
    const status=notificationStatus(env),routes=Object.entries(status.routes).filter(([,route])=>route.enabled);
    monitor=routes.some(([,route])=>route.approval==='unverified')?{state:'failed',checkedAt:Date.now()}:{state:'checked',checkedAt:status.checkedAt||Date.now(),routes:routes.filter(([,route])=>!route.ready).map(([key,route])=>({key,status:route.status}))};
   }catch{monitor={state:'failed',checkedAt:templateApprovalFailure?.checkedAt||Date.now()};}
  }
 }
 // Only bounded status/field identifiers cross this boundary, never exceptions,
 // template bodies, recipient numbers, provider payloads or private links.
 const result=await serviceBackend(env,{operation:'deliveryReviewMailDispatch',monitor});
 if(!result.ok)throw rosterScheduledFailure(result);
 if(result.data?.date===date&&(result.data.reported===1||result.data.alreadyReported===true))deliveryReportCompletion={date,url:env.APPS_SCRIPT_URL,secret:gsisApiSecret(env,'ROSTER_SERVICE_SECRET')};
 return result.data;
}

function rosterScheduledFailure(result){
 const counts={};for(const key of ['pendingCaptureCount','pendingPeerCount'])if(Number.isSafeInteger(result?.[key])&&result[key]>=0)counts[key]=result[key];
 return Object.assign(Error('Scheduled Roster operation could not be confirmed. Check its safe code and receipt status.'),{...safeHealthError(result),status:Number.isInteger(result?.status)?result.status:503,...counts});
}
export async function dispatchQuotaSnapshot(env){return runQuotaSnapshotJob(env);}
export async function scheduledRoster(env,scheduledTime=Date.now()){
 if(env.ROSTER_AUTOMATION_ENABLED!=='true')return {enabled:false};
 const sg=new Date(scheduledTime+8*3600000).toISOString(),minute=+sg.slice(11,13)*60+ +sg.slice(14,16),today=sg.slice(0,10),date=minute>=960?new Date(Date.parse(today+'T12:00:00Z')+86400000).toISOString().slice(0,10):today;
 const pending=await pendingAbsenceTransport(env,[date]);if(pending.pendingCaptureCount||pending.pendingPeerCount)throw rosterScheduledFailure({status:409,code:'ABSENCE_TRANSPORT_PENDING',...pending});
 // D1's scheduler verifies its persisted Calendar/Contacts references after
 // its due-work preflight. Do not fetch the legacy Calendar adapter on idle ticks.
 const dayOfWeek=new Date(today+'T12:00:00Z').getUTCDay(),monday=new Date(Date.parse(today+'T12:00:00Z')+((dayOfWeek===0?(minute>=960?1:-6):1-dayOfWeek)*86400000)).toISOString().slice(0,10);
 const weekdays=Array.from({length:5},(_,n)=>new Date(Date.parse(monday+'T12:00:00Z')+n*86400000).toISOString().slice(0,10));
 const schoolDates=calendar=>weekdays.filter(day=>calendar?.[day]?.available===true&&calendar[day].schoolDay===true);
 if(edgeRosterEnabled(env)){const references=await readEdgeRosterReferences(env,{allowExpired:true}),quotaCheckpointEvidence=await readQuotaCheckpointEvidence(env,{today,minute,now:scheduledTime,schoolDates:schoolDates(references.calendarByDate)});const result=await serviceBackend(env,{operation:'scheduledRoster',date,scheduledTime,quotaCheckpointEvidence,notificationsReady:notificationStatus(env).ready});if(!result.ok)throw rosterScheduledFailure(result);return result.data;}
 // The Calendar service is read-only and separately authenticated by its proxy secret.
 const dates=[...new Set([today,date,...weekdays])];
 const calendarByDate=await calendarDates(env,dates,null),quotaCheckpointEvidence=await readQuotaCheckpointEvidence(env,{today,minute,now:scheduledTime,schoolDates:schoolDates(calendarByDate)});
 const input={operation:'scheduledRoster',date,dates:Object.keys(calendarByDate),calendarByDate,scheduledTime,quotaCheckpointEvidence,notificationsReady:notificationStatus(env).ready};
 const result=await reconcileInactiveReplacements(env,input,await serviceBackend(env,input),null,crypto.randomUUID(),true);
 if(!result.ok)throw rosterScheduledFailure(result);return result.data;
}

// Called only by the notification Worker's scheduled handler. No HTTP route,
// queue claims, publication, allocation or message dispatch is involved.
export async function diagnoseNotificationConnections(env,scheduledTime=Date.now()){
 if(env.WHATSAPP_DIAGNOSTICS_ENABLED!=='true')return {enabled:false,readOnly:true};
 const diagnosticBuild='0.9.8-worker-diag1',configuration={};
 let config;
 try{
  config=notificationConfig(env,false,configuration);
  configuration.field='CALENDAR_APPS_SCRIPT_URL';
  const calendar=new URL(env.CALENDAR_APPS_SCRIPT_URL||'');
  if(calendar.protocol!=='https:'||calendar.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(calendar.pathname))throw Error();
  configuration.field='CALENDAR_PROXY_SECRET';if(!configuredSecret(gsisApiSecret(env,'CALENDAR_PROXY_SECRET')))throw Error();
 }catch(error){if(error?.code==='GSIS_SECRET_INVALID')configuration.field='GSIS_SECRET';return {diagnosticBuild,enabled:true,readOnly:true,connectionsReady:false,sendingTested:false,checks:[{name:'configuration',ok:false,code:'CONFIGURATION_INCOMPLETE',field:configuration.field,reason:env[configuration.field]===undefined||env[configuration.field]===null||env[configuration.field]===''?'MISSING_OR_EMPTY':'INVALID_VALUE'}]};}
 const checks=await Promise.all([
  (async()=>{
   let httpStatus=null,phase='request';
   try{
    const response=await fetch('https://graph.facebook.com/'+env.WHATSAPP_API_VERSION+'/'+env.WHATSAPP_PHONE_NUMBER_ID+'?fields=id',{headers:{Authorization:'Bearer '+env.WHATSAPP_ACCESS_TOKEN},signal:AbortSignal.timeout(10000),redirect:'manual'});
    httpStatus=response.status;phase='response-json';
    const value=await response.json();
    return {name:'metaSender',ok:response.ok&&value?.id===env.WHATSAPP_PHONE_NUMBER_ID,httpStatus,metaErrorCode:Number.isInteger(value?.error?.code)?value.error.code:null,metaErrorSubcode:Number.isInteger(value?.error?.error_subcode)?value.error.error_subcode:null,phase:'response',...(response.ok&&value?.id!==env.WHATSAPP_PHONE_NUMBER_ID?{code:'SENDER_ID_MISMATCH'}:{})};
   }catch(error){return {name:'metaSender',ok:false,httpStatus,metaErrorCode:null,metaErrorSubcode:null,phase,code:phase==='response-json'?'NON_JSON_RESPONSE':['AbortError','TimeoutError'].includes(error?.name)?'TIMEOUT':'FETCH_FAILED'};}
  })(),
  (async()=>{
   try{
    const live=await readTemplateCatalogue(env),contracts=Object.values(WHATSAPP_CONTRACTS),matched=contracts.filter(c=>live.some(t=>templateContractMatches(t,c))),cached=cacheTemplateApprovals(env,config,live);
    return {name:'metaTemplates',ok:true,contracts:contracts.length,matching:matched.length,approved:Object.values(cached.approvals).filter(s=>s==='approved').length,enabled:Object.values(config.templates).filter(t=>t.enabled===true).length,routes:notificationStatus(env).routes};
   }catch{return {name:'metaTemplates',ok:false};}
  })(),
  (async()=>{
   try{const value=await serviceBackend(env,{operation:'connectionStatus'});return {name:'signedBackendAndContacts',ok:value.ok===true&&value.data?.readOnly===true&&value.data?.contactsReady===true};}
   catch{return {name:'signedBackendAndContacts',ok:false};}
  })(),
  (async()=>{
   const diagnostic={},value=await calendarDate(env,singaporeDate(scheduledTime),null,diagnostic);
   return {name:'calendar',ok:value.available===true,...diagnostic,...(value.available===true||diagnostic.code?{}:{code:value.message==='Calendar year is not released to staff.'?'YEAR_UNAVAILABLE':'CALENDAR_REQUEST_FAILED'})};
  })()
 ]);
 return {diagnosticBuild,graphApiVersion:env.WHATSAPP_API_VERSION,enabled:true,readOnly:true,connectionsReady:checks.every(c=>c.ok),sendingTested:false,checks:[{name:'configuration',ok:true},...checks]};
}

/* GSIS_ROSTER_ABSENCE_TRANSPORT_BEGIN */
/* Durable transport receipt, not absence/allocation authority. The caller verifies
 * the Google school session; Apps Script rechecks current Contacts on delivery.
 * Keep this source import-free: the build embeds it in both Worker entry points.
 */
export const ABSENCE_TRANSPORT_SCHEMA_SQL=`CREATE TABLE IF NOT EXISTS gsis_absence_transport (
 namespace TEXT NOT NULL, actor TEXT NOT NULL, request_id TEXT NOT NULL,
 command TEXT NOT NULL, identity TEXT NOT NULL, digest TEXT NOT NULL,
 accepted_at TEXT NOT NULL, dates TEXT NOT NULL, operation TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','claimed','forwarded','needsReview','withdrawn')),
 available_at INTEGER NOT NULL, claim_id TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0, last_code TEXT, forwarded_at TEXT,
 resolved_at TEXT, resolved_by TEXT, resolution_reason TEXT,
 PRIMARY KEY(namespace,actor,request_id)
)`;
const absenceTransportSchemas_=new WeakMap();
const absenceMirrorControlSQL_="CREATE TABLE IF NOT EXISTS gsis_roster_mirror_control(id INTEGER PRIMARY KEY CHECK(id=1),epoch INTEGER NOT NULL DEFAULT 1,phase TEXT NOT NULL DEFAULT 'normal' CHECK(phase IN ('normal','quiescing','paused','released')),release_request TEXT NOT NULL DEFAULT '',transport_revision INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL DEFAULT 0)";
const absenceMirrorGate_ = "NOT EXISTS(SELECT 1 FROM gsis_roster_mirror_control WHERE id=1 AND phase<>'normal')";
function absenceTransportError_(status,code,message){return Object.assign(Error(message),{status,code});}
function absenceTransportInvalid_(){throw absenceTransportError_(400,'INVALID_ABSENCE_CAPTURE','Supply a valid absence report or colleague request.');}
const absenceTransportObject_=value=>value&&typeof value==='object'&&!Array.isArray(value);
function absenceTransportText_(value,max=240,empty=false){if(typeof value!=='string'||value.length>max||(!empty&&!value)||/[\u0000]/.test(value))absenceTransportInvalid_();return value;}
function absenceTransportMap_(value,max,convert){if(!absenceTransportObject_(value)||Object.keys(value).length>max)absenceTransportInvalid_();return Object.fromEntries(Object.entries(value).map(([key,item])=>{absenceTransportText_(key,2000);if(['__proto__','prototype','constructor'].includes(key))absenceTransportInvalid_();return [key,convert(item,key)];}));}
function absenceTransportDate_(value){if(typeof value!=='string'||!/^20\d\d-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)absenceTransportInvalid_();return value;}
function absenceTransportDates_(command){
 let dates;if(command.dates!==undefined){if(!Array.isArray(command.dates)||!command.dates.length||command.dates.length>366)absenceTransportInvalid_();dates=[...new Set(command.dates.map(absenceTransportDate_))].sort();}
 else{const from=absenceTransportDate_(command.from||command.date),to=absenceTransportDate_(command.to||from),start=Date.parse(from),end=Date.parse(to);if(end<start||end-start>365*86400000)absenceTransportInvalid_();dates=[];for(let n=start;n<=end;n+=86400000)dates.push(new Date(n).toISOString().slice(0,10));}
 if(Date.parse(dates.at(-1))-Date.parse(dates[0])>365*86400000)absenceTransportInvalid_();return dates;
}
function absenceTransportIdentity_(who){if(!who||typeof who.email!=='string'||! /^[^@\s]+@gsps\.edu\.sg$/i.test(who.email)||typeof who.subject!=='string'||!who.subject||who.subject.length>240)throw absenceTransportError_(401,'SCHOOL_SESSION_REQUIRED','Sign in with your school account.');return {email:who.email.toLowerCase(),subject:who.subject};}
function absenceTransportScope_(env){
 let backend,origin;try{backend=new URL(env.APPS_SCRIPT_URL);origin=new URL(env.ROSTER_PUBLIC_ORIGIN);}catch{throw absenceTransportError_(503,'ABSENCE_TRANSPORT_CONFIG','Configure the Roster backend and public origin for durable capture.');}
 if(backend.protocol!=='https:'||backend.hostname!=='script.google.com'||backend.port||backend.username||backend.password||backend.search||backend.hash||!/^\/macros\/s\/[-\w]+\/exec$/.test(backend.pathname)||origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||origin.port)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_CONFIG','Configure valid Roster backend and public origin URLs.');
 return {backend:backend.href,origin:origin.origin};
}
async function absenceTransportHash_(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
function absenceTransportStable_(value){return Array.isArray(value)?value.map(absenceTransportStable_):absenceTransportObject_(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,absenceTransportStable_(value[key])])):value;}
async function absenceTransportContext_(env){
 if(!env.GSIS_JOBS)return null;const db=env.GSIS_JOBS;if(typeof db.prepare!=='function')throw absenceTransportError_(503,'ABSENCE_TRANSPORT_CONFIG','Configure durable Roster storage.');
 const config=absenceTransportScope_(env),namespace=await absenceTransportHash_(JSON.stringify([config.backend,config.origin]));
 if(!absenceTransportSchemas_.has(db)){const prepare=(async()=>{for(const sql of [ABSENCE_TRANSPORT_SCHEMA_SQL,'CREATE INDEX IF NOT EXISTS gsis_absence_transport_due ON gsis_absence_transport(namespace,state,available_at,accepted_at)']){const result=await db.prepare(sql).run();if(result.success===false)throw Error('schema');}})().catch(()=>{absenceTransportSchemas_.delete(db);throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','Durable capture is unavailable. Retry the same report.');});absenceTransportSchemas_.set(db,prepare);}
 await absenceTransportSchemas_.get(db);if(env.ROSTER_EDGE_AUTHORITY==='d1'){await db.prepare(absenceMirrorControlSQL_).run();await db.prepare('INSERT OR IGNORE INTO gsis_roster_mirror_control(id) VALUES(1)').run();}return {db,namespace,...config,edge:env.ROSTER_EDGE_AUTHORITY==='d1'};
}
function absenceTransportCommand_(input,origin){
 if(!absenceTransportObject_(input)||!['saveAbsence','requestMutual'].includes(input.operation)||input.intake!==true||typeof input.requestId!=='string'||! /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(input.requestId))absenceTransportInvalid_();
 let size;try{size=JSON.stringify(input).length;}catch{absenceTransportInvalid_();}if(size>220000)throw absenceTransportError_(413,'ABSENCE_CAPTURE_TOO_LARGE','Shorten the absence instructions before submitting.');
 if(input.publicOrigin!==undefined&&input.publicOrigin!==origin)absenceTransportInvalid_();
 const out={operation:input.operation,intake:true,requestId:input.requestId,publicOrigin:origin};
 for(const key of ['date','from','to','viewFrom','viewTo'])if(input[key]!==undefined)out[key]=absenceTransportDate_(input[key]);
 for(const key of ['staffId','id','typeId','absenceId','view','scope','expectedTimetableId','expectedParity'])if(input[key]!==undefined)out[key]=absenceTransportText_(input[key]);
 if(input.expectedAbsenceToken!==undefined){if(typeof input.expectedAbsenceToken!=='string'||! /^[a-f0-9]{64}$/.test(input.expectedAbsenceToken))absenceTransportInvalid_();out.expectedAbsenceToken=input.expectedAbsenceToken;}
 for(const [key,max] of [['reasonDetail',500],['remarks',2000]])if(input[key]!==undefined)out[key]=absenceTransportText_(input[key],max,true);
 for(const key of ['fullDay','selectAll','reliefRequired','instructionsNA','receiptOnly'])if(input[key]!==undefined){if(typeof input[key]!=='boolean')absenceTransportInvalid_();out[key]=input[key];}
 for(const key of ['revision','expectedStaplerRevision'])if(input[key]!==undefined){if(!Number.isSafeInteger(input[key])||input[key]<0)absenceTransportInvalid_();out[key]=input[key];}
 if(input.staffIds!==undefined){if(!Array.isArray(input.staffIds)||!input.staffIds.length||input.staffIds.length>150||new Set(input.staffIds).size!==input.staffIds.length)absenceTransportInvalid_();out.staffIds=input.staffIds.map(id=>absenceTransportText_(id));}
 if(input.dates!==undefined){if(!Array.isArray(input.dates)||!input.dates.length||input.dates.length>366)absenceTransportInvalid_();out.dates=input.dates.map(absenceTransportDate_);}
 if(input.periods!==undefined){if(!Array.isArray(input.periods)||input.periods.length>40||input.periods.some(p=>!Number.isInteger(p)||p<0||p>=40)||new Set(input.periods).size!==input.periods.length)absenceTransportInvalid_();out.periods=input.periods.slice();}
 if(input.coverage!==undefined){const c=input.coverage;if(!absenceTransportObject_(c))absenceTransportInvalid_();if(c.kind==='fullDay')out.coverage={kind:'fullDay'};else if(c.kind==='timeRange'&&Number.isInteger(c.startMinutes)&&Number.isInteger(c.endMinutes)&&c.startMinutes>=0&&c.endMinutes<=1440&&c.startMinutes<c.endMinutes)out.coverage={kind:c.kind,startMinutes:c.startMinutes,endMinutes:c.endMinutes};else absenceTransportInvalid_();}
 const dates=absenceTransportDates_(out),dateSet=new Set(dates),dated=(value,convert)=>absenceTransportMap_(value,366,(item,date)=>{if(!dateSet.has(date))absenceTransportInvalid_();return convert(item);});
 const notes=value=>absenceTransportMap_(value,100,text=>absenceTransportText_(text,8000,true));
 if(input.instructionsByDate!==undefined)out.instructionsByDate=dated(input.instructionsByDate,notes);
 const staffIds=out.staffIds||[out.staffId].filter(Boolean),staffMap=(value,convert)=>absenceTransportMap_(value,150,(item,id)=>{if(!staffIds.includes(id))absenceTransportInvalid_();return convert(item);});
 if(input.instructionsByStaffDate!==undefined)out.instructionsByStaffDate=staffMap(input.instructionsByStaffDate,value=>dated(value,notes));
 if(input.expectedInstructionScopes!==undefined)out.expectedInstructionScopes=dated(input.expectedInstructionScopes,value=>{if(!absenceTransportObject_(value)||!Number.isSafeInteger(value.staplerRevision)||value.staplerRevision<0||!['odd','even','single'].includes(value.parity))absenceTransportInvalid_();return {timetableId:absenceTransportText_(value.timetableId),staplerRevision:value.staplerRevision,parity:value.parity};});
 const proposal=(value,periodRequired)=>{
  if(!absenceTransportObject_(value)||value.combination!==undefined&&typeof value.combination!=='boolean')absenceTransportInvalid_();const pick={recipientId:absenceTransportText_(value.recipientId)};
  if(value.combination!==undefined)pick.combination=value.combination;
  if(periodRequired){if(!Number.isInteger(value.period)||value.period<0||value.period>=40||!Number.isSafeInteger(value.expectedStaplerRevision)||value.expectedStaplerRevision<0||!['odd','even','single'].includes(value.expectedParity))absenceTransportInvalid_();Object.assign(pick,{period:value.period,lessonKey:absenceTransportText_(value.lessonKey,2000),expectedTimetableId:absenceTransportText_(value.expectedTimetableId),expectedStaplerRevision:value.expectedStaplerRevision,expectedParity:value.expectedParity});}
  if(value.expectedRecipientCell!==undefined){if(!Array.isArray(value.expectedRecipientCell)||value.expectedRecipientCell.length!==4)absenceTransportInvalid_();pick.expectedRecipientCell=value.expectedRecipientCell.map(cell=>absenceTransportText_(cell,2000,true));}
  if(periodRequired&&pick.combination&&!pick.expectedRecipientCell)absenceTransportInvalid_();return pick;
 };
 if(input.ownArrangementsByStaffDate!==undefined)out.ownArrangementsByStaffDate=staffMap(input.ownArrangementsByStaffDate,value=>dated(value,picks=>{if(!Array.isArray(picks)||picks.length>40||new Set(picks.map(p=>p?.period)).size!==picks.length)absenceTransportInvalid_();return picks.map(p=>proposal(p,true));}));
 if(out.operation==='requestMutual'){
  if(!out.absenceId||!Array.isArray(input.requests)||!input.requests.length||input.requests.length>40||dates.length!==1)absenceTransportInvalid_();const demandIds=new Set();
  out.requests=input.requests.map(request=>{const pick=proposal(request,false);if(!Array.isArray(request.demandIds)||!request.demandIds.length||request.demandIds.length>40)absenceTransportInvalid_();pick.demandIds=request.demandIds.map(id=>{absenceTransportText_(id);if(!id.startsWith(out.absenceId+':')||demandIds.has(id))absenceTransportInvalid_();demandIds.add(id);return id;});if(request.expectedLessons!==undefined)pick.expectedLessons=absenceTransportMap_(request.expectedLessons,40,(expected,id)=>{if(!pick.demandIds.includes(id)||!absenceTransportObject_(expected)||!['odd','even','single'].includes(expected.parity))absenceTransportInvalid_();return {lessonKey:absenceTransportText_(expected.lessonKey,2000),timetableId:absenceTransportText_(expected.timetableId),parity:expected.parity};});return pick;});
 }else if(!out.typeId||out.fullDay!==true&&!out.coverage&&!out.periods?.length)absenceTransportInvalid_();
 return {command:out,dates};
}
async function absenceTransportFind_(context,actor,requestId){return context.db.prepare('SELECT * FROM gsis_absence_transport WHERE namespace=? AND actor=? AND request_id=?').bind(context.namespace,actor,requestId).first();}
function absenceTransportReceiptValue_(row){const peers=row.operation==='requestMutual'||!!JSON.parse(row.command).ownArrangementsByStaffDate;return {accepted:true,intakeReceipt:true,receiptOnly:true,requestId:row.request_id,acceptedAt:row.accepted_at,intakeState:['needsReview','withdrawn'].includes(row.state)?row.state:'pending',transportState:row.state,absenceApplied:false,savedIds:[],peerState:peers?'pending':'none',mutualRequestIds:[],reasonCode:row.last_code||null,affectedDates:JSON.parse(row.dates),...(row.state==='withdrawn'?{resolution:{at:row.resolved_at,by:row.resolved_by,reason:row.resolution_reason}}:{})};}
export async function captureAbsenceTransport(env,who,input){
 const context=await absenceTransportContext_(env);if(!context)return null;const identity=absenceTransportIdentity_(who),{command,dates}=absenceTransportCommand_(input,context.origin),encoded=JSON.stringify(command),digest=await absenceTransportHash_(JSON.stringify(absenceTransportStable_(command))),now=Date.now();
 let writeFailed=false;try{const insert=context.db.prepare('INSERT OR IGNORE INTO gsis_absence_transport (namespace,actor,request_id,command,identity,digest,accepted_at,dates,operation,available_at) '+(context.edge?'SELECT ?,?,?,?,?,?,?,?,?,? WHERE '+absenceMirrorGate_:'VALUES (?,?,?,?,?,?,?,?,?,?)')).bind(context.namespace,identity.email,command.requestId,encoded,JSON.stringify(identity),digest,new Date(now).toISOString(),JSON.stringify(dates),command.operation,now);const results=env.ROSTER_EDGE_AUTHORITY==='d1'?await context.db.batch([insert,context.db.prepare("UPDATE gsis_edge_heads SET revision=revision+1,updated_at=? WHERE scope='roster' AND mode='active' AND changes()=1").bind(now)]):[await insert.run()];writeFailed=results.some(result=>result.success===false);}catch{writeFailed=true;}
 // An acknowledgement can be lost after commit. A primary read confirms only
 // the immutable command actually stored; never mint a replacement request ID.
 let row;try{row=await absenceTransportFind_(context,identity.email,command.requestId);}catch{throw absenceTransportError_(503,'ABSENCE_CAPTURE_UNCONFIRMED','Capture could not be confirmed. Retry the same report.');}
 if(!row)throw absenceTransportError_(503,writeFailed?'ABSENCE_CAPTURE_UNCONFIRMED':'ABSENCE_CAPTURE_MISSING','Capture could not be confirmed. Retry the same report.');
 if(row.digest!==digest)throw absenceTransportError_(409,'ABSENCE_CAPTURE_CONFLICT','This request ID was already used for a different report.');return absenceTransportReceiptValue_(row);
}
export async function absenceTransportReceipt(env,who,input){const context=await absenceTransportContext_(env);if(!context)return null;const identity=absenceTransportIdentity_(who),{command}=absenceTransportCommand_(input,context.origin),row=await absenceTransportFind_(context,identity.email,command.requestId);if(!row)return null;const digest=await absenceTransportHash_(JSON.stringify(absenceTransportStable_(command)));if(row.digest!==digest)throw absenceTransportError_(409,'ABSENCE_CAPTURE_CONFLICT','This request ID was already used for a different report.');return absenceTransportReceiptValue_(row);}
function absenceTransportBackendResult_(reply,requestId){
 const envelope=reply?.result??reply;if(envelope?.ok===false)return {deterministic:[400,403,404,409,413,422].includes(envelope.status),code:[400,403,404,409,413,422].includes(envelope.status)?'BACKEND_REJECTED_'+envelope.status:'BACKEND_RETRY'};
 const receipt=envelope?.ok===true?envelope.data:envelope;
 return receipt?.accepted===true&&receipt.intakeReceipt===true&&receipt.receiptOnly===true&&receipt.requestId===requestId?{forwarded:true}:{code:'RECEIPT_UNCONFIRMED'};
}
export async function dispatchAbsenceTransport(env,{limit=2,budgetMs=55000,concurrency=3,capture}={}){
 const context=await absenceTransportContext_(env),summary={enabled:!!context,claimed:0,forwarded:0,pending:0,needsReview:0};if(!context)return summary;if(typeof capture!=='function')throw Error('Supply the authenticated absence intake callback.');
 const until=Date.now()+Math.max(1,Math.min(180000,budgetMs)),count=Math.max(1,Math.min(50,Math.trunc(limit)||1)),width=Math.min(count,Math.max(1,Math.min(4,Math.trunc(concurrency)||1)));let reservations=0;
 // Reserve one total slot per lane, then claim immediately before forwarding.
 // No lane preclaims a batch that could expire while waiting behind slow I/O.
 const lane=async()=>{while(reservations<count&&Date.now()<until){reservations++;
  const now=Date.now(),claimId=crypto.randomUUID(),claimed=await context.db.prepare("UPDATE gsis_absence_transport SET state='claimed',claim_id=?,lease_until=?,attempts=attempts+1 WHERE rowid IN (SELECT rowid FROM gsis_absence_transport WHERE namespace=? AND ((state='queued' AND available_at<=?) OR (state='claimed' AND lease_until<=?)) ORDER BY accepted_at,request_id LIMIT 1)"+(context.edge?' AND '+absenceMirrorGate_:'')+" RETURNING *").bind(claimId,now+90000,context.namespace,now,now).all();if(claimed.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','Durable delivery is unavailable.');const row=claimed.results?.[0];if(!row)return;summary.claimed++;
  let outcome;try{outcome=absenceTransportBackendResult_(await capture(JSON.parse(row.command),JSON.parse(row.identity),{acceptedAt:row.accepted_at}),row.request_id);}catch(error){const deterministic=error?.code!=='BACKEND_AUTHENTICATION'&&[400,403,404,409,413,422].includes(error?.status);outcome={deterministic,code:deterministic?'BACKEND_REJECTED_'+error.status:'BACKEND_RETRY'};}
  const state=outcome.forwarded?'forwarded':outcome.deterministic?'needsReview':'queued',delay=Math.min(300000,5000*2**Math.min(6,row.attempts-1)),settled=await context.db.prepare('UPDATE gsis_absence_transport SET state=?,claim_id=NULL,lease_until=0,available_at=?,last_code=?,forwarded_at=? WHERE namespace=? AND actor=? AND request_id=? AND state=\'claimed\' AND claim_id=? AND lease_until>?').bind(state,Date.now()+delay,outcome.forwarded?null:outcome.code,outcome.forwarded?new Date().toISOString():null,context.namespace,row.actor,row.request_id,claimId,Date.now()).run();
  if(settled.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','Delivery remains recoverable in durable storage.');if(settled.meta?.changes)summary[outcome.forwarded?'forwarded':outcome.deterministic?'needsReview':'pending']++;
 }};
 // Await every live delivery even if one settlement fails. The failed lease
 // remains durable; other in-flight jobs must not be abandoned by early reject.
 const completed=await Promise.allSettled(Array.from({length:width},()=>lane())),failed=completed.find(result=>result.status==='rejected');if(failed)throw failed.reason;return summary;
}
function absenceTransportFilter_(context,who,{all=false,date,scope,includeForwarded=false}={}){const identity=absenceTransportIdentity_(who),terms=['namespace=?'],values=[context.namespace];if(includeForwarded!==true)terms.push("state!='forwarded'");if(all!==true||scope==='mine'){terms.push('actor=?');values.push(identity.email);}if(date!==undefined){absenceTransportDate_(date);terms.push('EXISTS (SELECT 1 FROM json_each(dates) WHERE value=?)');values.push(date);}return {sql:terms.join(' AND '),values};}
// all:true is an internal capability: only pass it after a fresh Apps Script
// response confirms SMC/Admin. Never spread a browser request into these options.
export async function readAbsenceTransport(env,who,options={}){
 const context=await absenceTransportContext_(env);if(!context)return null;const filter=absenceTransportFilter_(context,who,options),totals=await context.db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN operation='saveAbsence' AND (state IN ('queued','claimed') OR (state='needsReview' AND last_code='BACKEND_REJECTED_409')) THEN 1 ELSE 0 END) pendingCaptureCount, SUM(CASE WHEN state='needsReview' AND operation='requestMutual' THEN 1 ELSE 0 END) peerReviewCount FROM gsis_absence_transport WHERE ${filter.sql}`).bind(...filter.values).first(),result=await context.db.prepare(`SELECT * FROM gsis_absence_transport WHERE ${filter.sql} ORDER BY (state IN ('forwarded','withdrawn')),accepted_at,request_id LIMIT 150`).bind(...filter.values).all();
 if(result.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','Received reports could not be read.');const entries=(result.results||[]).map(row=>({...absenceTransportReceiptValue_(row),command:JSON.parse(row.command),dates:JSON.parse(row.dates)}));return {entries,total:totals.total,hasMore:totals.total>entries.length,pendingCaptureCount:totals.pendingCaptureCount||0,peerReviewCount:totals.peerReviewCount||0};
}
export async function pendingAbsenceTransport(env,dates=null){
 const context=await absenceTransportContext_(env);if(!context)return {enabled:false,pendingCaptureCount:0,pendingPeerCount:0,peerReviewCount:0,blockedDates:[],peerBlockedDates:[],requestIds:[]};if(dates!==null&&(!Array.isArray(dates)||dates.length>366))absenceTransportInvalid_();if(dates)dates.forEach(absenceTransportDate_);
 const filter=dates?` AND EXISTS (SELECT 1 FROM json_each(dates) WHERE value IN (SELECT value FROM json_each(?)))`:'',result=await context.db.prepare("SELECT request_id,dates,operation,state,last_code FROM gsis_absence_transport WHERE namespace=? AND state NOT IN ('forwarded','withdrawn')"+filter).bind(context.namespace,...(dates?[JSON.stringify(dates)]:[])).all();if(result.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','Received reports could not be checked.');
 const rows=result.results||[],pending=rows.filter(row=>row.operation==='saveAbsence'&&(['queued','claimed'].includes(row.state)||row.state==='needsReview'&&row.last_code==='BACKEND_REJECTED_409')),peers=rows.filter(row=>row.operation==='requestMutual'&&['queued','claimed'].includes(row.state));return {enabled:true,pendingCaptureCount:pending.length,pendingPeerCount:peers.length,peerBlockedDates:[...new Set(peers.flatMap(row=>JSON.parse(row.dates)))].sort(),peerReviewCount:rows.filter(row=>row.operation==='requestMutual'&&row.state==='needsReview').length,blockedDates:[...new Set(pending.flatMap(row=>JSON.parse(row.dates)))].sort(),requestIds:pending.map(row=>row.request_id)};
}

export async function retryAbsenceTransport(env,who,{requestId,all=false}={}){
 const context=await absenceTransportContext_(env);if(!context)return null;const identity=absenceTransportIdentity_(who);if(typeof requestId!=='string'||! /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(requestId))absenceTransportInvalid_();
 const query=all===true?'namespace=? AND request_id=?':'namespace=? AND request_id=? AND actor=?',values=[context.namespace,requestId,...(all===true?[]:[identity.email])],found=await context.db.prepare(`SELECT * FROM gsis_absence_transport WHERE ${query} LIMIT 2`).bind(...values).all();
 if(found.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','The report could not be read.');if(!found.results?.length)return null;if(found.results.length!==1)throw absenceTransportError_(409,'ABSENCE_CAPTURE_AMBIGUOUS','The report identity needs administrator review.');const row=found.results[0];
 if(['forwarded','withdrawn'].includes(row.state))return absenceTransportReceiptValue_(row);if(row.state==='claimed'&&row.lease_until>Date.now())throw absenceTransportError_(409,'ABSENCE_CAPTURE_PROCESSING','This report is already being processed.');
 const updated=await context.db.prepare("UPDATE gsis_absence_transport SET state='queued',available_at=?,claim_id=NULL,lease_until=0,last_code=NULL WHERE namespace=? AND actor=? AND request_id=? AND state NOT IN ('forwarded','withdrawn') AND (state!='claimed' OR lease_until<=?)").bind(Date.now(),context.namespace,row.actor,requestId,Date.now()).run();if(updated.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','The report remains retained. Retry shortly.');
 const current=await absenceTransportFind_(context,row.actor,requestId);if(!current)throw absenceTransportError_(503,'ABSENCE_CAPTURE_UNCONFIRMED','The report could not be confirmed.');if(current.state==='claimed')throw absenceTransportError_(409,'ABSENCE_CAPTURE_PROCESSING','This report is already being processed.');return absenceTransportReceiptValue_(current);
}

// Use this same normalization when probing the Apps Script receipt after D1
// forwarding; the browser's original payload can contain stripped authority data.
export function normalizeAbsenceTransportCommand(env,input){return absenceTransportCommand_(input,absenceTransportScope_(env).origin).command;}
// Fresh backend SMC/Admin authorization is required before passing all:true.
// Only deterministic delivery failures can be withdrawn here. Forwarded jobs
// belong to the Apps Script journal and must be resolved at that authority.
export async function resolveAbsenceTransport(env,who,{requestId,reason,all=false}={}){
 const context=await absenceTransportContext_(env);if(!context)return null;const identity=absenceTransportIdentity_(who);if(all!==true)throw absenceTransportError_(403,'SMC_AUTHORIZATION_REQUIRED','SMC authorization is required to withdraw a received report.');if(typeof requestId!=='string'||! /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(requestId)||typeof reason!=='string'||!reason.trim()||reason.length>1000)absenceTransportInvalid_();
 const found=await context.db.prepare('SELECT * FROM gsis_absence_transport WHERE namespace=? AND request_id=? LIMIT 2').bind(context.namespace,requestId).all();if(found.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','The report could not be read.');if(!found.results?.length)return null;if(found.results.length!==1)throw absenceTransportError_(409,'ABSENCE_CAPTURE_AMBIGUOUS','The report identity needs administrator review.');const row=found.results[0];
 if(['forwarded','withdrawn'].includes(row.state))return absenceTransportReceiptValue_(row);if(row.state!=='needsReview')throw absenceTransportError_(409,'ABSENCE_CAPTURE_PROCESSING','Only a report awaiting review can be withdrawn here.');
 const result=await context.db.prepare("UPDATE gsis_absence_transport SET state='withdrawn',resolved_at=?,resolved_by=?,resolution_reason=? WHERE namespace=? AND actor=? AND request_id=? AND state='needsReview'").bind(new Date().toISOString(),identity.email,reason.trim(),context.namespace,row.actor,requestId).run();if(result.success===false)throw absenceTransportError_(503,'ABSENCE_TRANSPORT_STORAGE','Withdrawal could not be confirmed. Retry the same review.');const current=await absenceTransportFind_(context,row.actor,requestId);if(current?.state!=='withdrawn')throw absenceTransportError_(409,'ABSENCE_CAPTURE_PROCESSING','This report changed while it was being reviewed.');return absenceTransportReceiptValue_(current);
}

/* GSIS_ROSTER_ABSENCE_TRANSPORT_END */

export async function dispatchGoogleBackup(env){const result=await mirrorEdgeRoster(env);if(result.enabled===false)return result;const status=await readRosterMirrorStatus(env);return {...result,pending:status.pending,failed:status.behindThreshold?1:0,code:status.behindThreshold?'ROSTER_MIRROR_LAG':status.pending?'ROSTER_MIRROR_PENDING':'OK'};}
