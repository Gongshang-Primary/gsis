/* GSIS_BUILD_LABEL_BEGIN */
const GSIS_BUILD_LABEL='0.9.9f';
/* Executing gateway identity is separate from the observed upstream build. */
function gsisBuildMetadata(value){
 const label=value?.gsisBuildLabel;
 return typeof label==='string'&&label.length<=32&&/^\d+\.\d+\.\d+[a-z]?$/.test(label)?{gsisBuildLabel:label}:{};
}
function gsisBuildHeaders(value){
 const label=gsisBuildMetadata(value).gsisBuildLabel;
 return {'X-GSiS-Worker-Build-Label':GSIS_BUILD_LABEL,...(label?{'X-GSiS-Build-Label':label}:{})};
}
/* GSIS_BUILD_LABEL_END */
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
function json(data,status=200){return Response.json(data,{status,headers:{...gsisBuildHeaders(data),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}})}
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
export async function sign(data,secret){const payload=JSON.stringify(data),k=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(payload))),b=>b.toString(16).padStart(2,'0')).join('');return {payload,signature}}
const PUBLIC_TTL_SECONDS=45,publicReads=new Map();
const PUBLIC_FIELDS='schemaVersion modelVersion layoutYear layoutRevision layoutState repository deploymentVersionId deploymentRevision registryRevision cursor otherTGStatus'.split(' ');
const publicObject=x=>x&&typeof x==='object'&&!Array.isArray(x);
function publicPick(value,fields){const result={};if(!publicObject(value))return result;for(const key of fields.split(' ')){const item=value[key];if(item===null||['string','number','boolean'].includes(typeof item))result[key]=item;}return result;}
function publicPublication(value){return value===null?null:publicPick(value,'id name year revision commit updatedAt');}
function publicCounts(value){const result={};if(publicObject(value))for(const [key,count]of Object.entries(value))if(Number.isFinite(count))Object.defineProperty(result,key,{value:count,enumerable:true});return result;}
// Cache only the already-public Layout schema, never authority, identity or
// request diagnostics. The backend remains the only publication authority.
function publicSnapshot(result,year){
 const data=result?.data;if(result?.ok!==true||!publicObject(data)||data.unchanged||data.delta||data.repository!=='layout-current'||data.schemaVersion!==2||data.modelVersion!=='1.1.0'||!Number.isInteger(data.layoutYear)||data.layoutYear<2000||data.layoutYear>2099||(year!==undefined&&Number(year)!==data.layoutYear)||typeof data.layoutRevision!=='string'||!data.layoutRevision||data.cursor!==data.layoutRevision||!['venues','classes','groups'].every(key=>Array.isArray(data[key])))return null;
 if(data.venues.some(v=>!publicObject(v)||typeof v.unitNumber!=='string'||!Array.isArray(v.allocations))||new Set(data.venues.map(v=>v.unitNumber)).size!==data.venues.length||data.classes.some(v=>!publicObject(v)||!Array.isArray(v.units))||data.groups.some(v=>!publicObject(v)||!Array.isArray(v.units)))return null;
 if(data.groups.some(g=>g.levels!==undefined&&(!Array.isArray(g.levels)||!g.levels.length||g.levels.some(l=>typeof l!=='string'||!/^\d{1,2}$/.test(l))||new Set(g.levels).size!==g.levels.length)||g.weeklyPeriods!==undefined&&g.weeklyPeriods!==null&&(typeof g.weeklyPeriods!=='number'||!Number.isFinite(g.weeklyPeriods)||g.weeklyPeriods<0||g.weeklyPeriods>100||!Number.isInteger(g.weeklyPeriods*2))))return null;
 const clean=publicPick(data,PUBLIC_FIELDS.join(' '));clean.publication=publicPublication(data.publication??null);
 clean.venues=data.venues.map(v=>({...publicPick(v,'id unitNumber geometryUnit name shortName block level capacity'),allocations:v.allocations.map(a=>publicPick(a,'id unitNumber kind targetId label'))}));
 clean.classes=data.classes.map(c=>({...publicPick(c,'id code name shortName level'),units:c.units.filter(x=>typeof x==='string')}));
 clean.groups=data.groups.map(g=>({...publicPick(g,'id code name level weeklyPeriods subject teacherLabels pupilCount pupilCountText programmes sourceVenueText notes sourceId sourceLocator'),...(g.levels?{levels:g.levels.slice()}:{}),publication:publicPublication(g.publication??null),units:g.units.filter(x=>typeof x==='string'),breakdown:publicCounts(g.breakdown),countRows:(Array.isArray(g.countRows)?g.countRows:[]).map(r=>({...publicPick(r,'sourceLocator countText count'),breakdown:publicCounts(r.breakdown)}))}));
 clean.sources=(Array.isArray(data.sources)?data.sources:[]).map(r=>({...publicPick(r,'id name driveId url contentDate snapshotSha256 scope'),...(r.publication?{publication:publicPublication(r.publication)}:{})}));
 clean.reviews=(Array.isArray(data.reviews)?data.reviews:[]).map(r=>publicPick(r,'id kind target sourceValue referenceValue action sourceLocator'));
 clean.sourceSummaries=(Array.isArray(data.sourceSummaries)?data.sourceSummaries:[]).map(r=>publicPick(r,'level label totalText breakdownText sourceLocator'));
 clean.handoff=data.handoff?publicPick(data.handoff,'status year versionId revision commit layoutRevision message'):null;
 return {ok:true,...gsisBuildMetadata(result),data:clean};
}
function requestTrace(req){const supplied=req.headers.get('X-GSiS-Trace-ID');return supplied&&/^[\w-]{36}$/.test(supplied)?supplied:crypto.randomUUID();}
async function backend(env,action,input,who,traceId){
 const started=Date.now(),nonce=crypto.randomUUID();
 try{
  const endpoint=new URL(env.APPS_SCRIPT_URL);
  if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname))throw Object.assign(Error('Invalid backend URL'),{code:'BACKEND_CONFIG'});
  const body=await sign({action,input,identity:who,timestamp:Date.now(),nonce,traceId},gsisApiSecret(env,'BRIDGE_SECRET'));
  const response=await fetch(endpoint,{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'},redirect:'follow',signal:AbortSignal.timeout(25000)});
  const result=await readGSiSBackendResponse(response);
  return {result,backendMs:Date.now()-started,upstreamTraceId:traceId,upstreamRequestId:nonce};
 }catch(error){error.backendMs=Date.now()-started;error.upstreamTraceId=traceId;error.upstreamRequestId=nonce;throw error;}
}
async function publicCampus(req,env,year,traceId){
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify([env.APPS_SCRIPT_URL,year??'default'])))),b=>b.toString(16).padStart(2,'0')).join('');
 const key=new URL('/__gsis_public_layout_cache/tg-levels-v1/'+digest,req.url).href;
 const existing=publicReads.get(key);if(existing)return {...await existing,cache:'coalesced'};
 const pending=(async()=>{
  const cache=globalThis.caches?.default;
  if(cache)try{const cached=await cache.match(new Request(key));if(cached&&Number(cached.headers.get('X-GSiS-Expires'))>Date.now()){const result=publicSnapshot(await cached.json(),year);if(result)return {result,cache:'hit',backendMs:0};}}catch{} // Cache outages are not data outages.
  const value=await backend(env,'publicLayout',{year},null,traceId),canonical=publicSnapshot(value.result,year);
  if(value.result.ok&&!canonical)throw Object.assign(Error('Incompatible Layout data'),{code:'UPSTREAM_SCHEMA'});
  if(canonical){value.result=canonical;if(cache)try{await cache.put(new Request(key),Response.json(canonical,{headers:{'Cache-Control':'public, max-age='+PUBLIC_TTL_SECONDS,'X-GSiS-Expires':String(Date.now()+PUBLIC_TTL_SECONDS*1000)}}));}catch{}}
  return {...value,cache:'miss'};
 })();
 publicReads.set(key,pending);try{return {...await pending};}finally{publicReads.delete(key);}
}
function gatewayResult(value,traceId,started){return {...value.result,gatewayTiming:{diagnosticId:traceId,traceId,totalMs:Date.now()-started,backendMs:value.backendMs,...(value.upstreamTraceId?{upstreamTraceId:value.upstreamTraceId,upstreamRequestId:value.upstreamRequestId}:{}),...(value.cache?{cache:value.cache}: {})}};}
export default {async fetch(req,env){
 const u=new URL(req.url),traceId=requestTrace(req),started=Date.now(); if(u.pathname.startsWith('/api/')&&!['/api/session','/api/logout'].includes(u.pathname))try{gsisApiSecret(env,'BRIDGE_SECRET');}catch(error){return json({ok:false,code:error.code,error:error.message},503);}
const session=await sessionRoute(req,env);if(session)return session;
 if(!u.pathname.startsWith('/api/'))return env.ASSETS.fetch(req);
 if(u.pathname==='/api/config')return json({version:'0.9.9',clientId:env.GOOGLE_CLIENT_ID||''});
 if(!env.APPS_SCRIPT_URL||!gsisApiSecret(env,'BRIDGE_SECRET')||gsisApiSecret(env,'BRIDGE_SECRET').length<32)return json({ok:false,error:'Campus connection is not configured.'},503);
 try{
  if(u.pathname==='/api/public/campus'){
   if(req.method!=='GET')return json({ok:false,error:'GET required'},405);
   const year=u.searchParams.get('year')||env.LAYOUT_YEAR||undefined,value=await publicCampus(req,env,year,traceId),since=u.searchParams.get('since');
   // Always cache the complete publication. A caller's cursor only changes
   // this response and cannot replace the canonical cache with 'unchanged'.
   if(since&&value.result.ok&&value.result.data?.cursor===since&&publicSnapshot(value.result,year))value.result={ok:true,...gsisBuildMetadata(value.result),data:{unchanged:true,cursor:since,handoff:value.result.data.handoff}};
   const result=gatewayResult(value,traceId,started),response=json(result,result.ok?200:result.status||503);response.headers.set('Access-Control-Allow-Origin','*');return response;
  }
  if(u.pathname==='/api/unit/rename')return json({ok:false,error:'Edit venues in Deploy and explicitly republish to update Layout.'},410);
  const action={'/api/profile':'campusProfile'}[u.pathname];
  if(!action)return json({ok:false,error:'Not found'},404);
  if(req.method!=='POST'||req.headers.get('Origin')!==u.origin)return json({ok:false,error:'Same-origin POST required'},403);
  let who;try{who=await requestIdentity(req,env)}catch{return json({ok:false,error:'Sign in again.'},401)}
  const raw=await req.text();if(raw.length>4000)return json({ok:false,error:'Request too large'},413);
  let input;try{input=JSON.parse(raw);if(!input||Array.isArray(input)||typeof input!=='object')throw Error()}catch{return json({ok:false,error:'Invalid JSON'},400)}
  const result=gatewayResult(await backend(env,action,input,who,traceId),traceId,started);return json(result,result.ok?200:result.status||503);
 }catch(e){const diagnosticId=traceId,code=['TimeoutError','AbortError'].includes(e.name)?'UPSTREAM_TIMEOUT':e.code||'UPSTREAM_CONNECTION';console.error('GSiS campus gateway',{diagnosticId,traceId,code,status:e.upstreamStatus,responseInfo:e.responseInfo});const response=json({ok:false,code,diagnosticId,...(e.responseInfo?{responseInfo:e.responseInfo}:{}),gatewayTiming:{diagnosticId,traceId,totalMs:Date.now()-started,backendMs:e.backendMs||0,...(e.upstreamTraceId?{upstreamTraceId:e.upstreamTraceId,upstreamRequestId:e.upstreamRequestId}:{})},error:u.pathname==='/api/unit/rename'?'Connection interrupted. Keep the pending unit change and retry after sign-in.':(gsisResponseAdvice(e,true)||'Campus data is temporarily unavailable.')+' Use Refresh to retry. Reference: '+diagnosticId.slice(0,8)},503);if(u.pathname==='/api/public/campus')response.headers.set('Access-Control-Allow-Origin','*');return response;}
}};
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
