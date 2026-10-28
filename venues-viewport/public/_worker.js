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
// GSiS Venues 0.9.2. Access authenticates; Contacts and Venues authorise each operation.
const VERSION='0.9.9',encoder=new TextEncoder(),decoder=new TextDecoder();
const READS=new Set(['bootstrap','manifest','piece','bookings','admin']);
const COMMANDS=new Set(['book','amend','cancel','decide','requestTransfer','decideTransfer','respond','saveVenue','saveRoomOwners','saveRoomMetadata','saveGrant','saveClosure','sync','notificationDecision']);
const keySets=new Map(),keyFlights=new Map();
function json(data,status=200){return Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});}
function failure(status,code,error){return json({ok:false,status,code,error},status);}
function decode(value){if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Invalid token');return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
function config(env){
 const team=String(env.ACCESS_TEAM_DOMAIN||'').trim().replace(/^https:\/\//,'').replace(/\/$/,'');
 const access=!!(team||env.ACCESS_AUD);if(access&&(!/^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(team)||typeof env.ACCESS_AUD!=='string'||!env.ACCESS_AUD.trim()))throw Error('Invalid Access configuration');if(!access&&!env.GOOGLE_CLIENT_ID||typeof gsisApiSecret(env,'VENUES_PROXY_SECRET')!=='string'||gsisApiSecret(env,'VENUES_PROXY_SECRET').length<32)throw Error('Configuration required');
 const backend=new URL(env.VENUES_BACKEND_URL);if(backend.protocol!=='https:'||backend.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(backend.pathname)||backend.search||backend.hash||backend.username||backend.password)throw Error('Invalid backend');
 return {team,audience:env.ACCESS_AUD,backend,access};
}
async function signingKey(team,kid){
 const now=Date.now(),old=keySets.get(team),fresh=old&&now-old.at<3600000,known=fresh&&old.keys.find(key=>key.kid===kid);if(known)return known;
 if(!keyFlights.has(team)){
  if(fresh&&now-old.refreshedAt<30000)throw Error('Unknown key');
  if(old)old.refreshedAt=now;
  // workerd supports manual/follow only; reject redirects with the status check.
  const pending=(async()=>{const response=await fetch(team==='google'?'https://www.googleapis.com/oauth2/v3/certs':'https://'+team+'/cdn-cgi/access/certs',{signal:AbortSignal.timeout(8000),redirect:'manual'});if(!response.ok)throw Error('Key service unavailable');const next=(await response.json()).keys;
   if(!Array.isArray(next)||!next.length||next.length>20||new Set(next.map(k=>k?.kid)).size!==next.length||next.some(k=>!k||k.kty!=='RSA'||typeof k.kid!=='string'||!k.kid||k.kid.length>200||typeof k.n!=='string'||!/^[A-Za-z0-9_-]+$/.test(k.n)||typeof k.e!=='string'||!/^[A-Za-z0-9_-]+$/.test(k.e)||(k.alg&&k.alg!=='RS256')||(k.use&&k.use!=='sig')))throw Error('Invalid keys');
   if(keySets.size>=8&&!keySets.has(team))keySets.clear();keySets.set(team,{keys:next,at:Date.now(),refreshedAt:now});})();
  keyFlights.set(team,pending);pending.finally(()=>keyFlights.delete(team)).catch(()=>{});
 }
 await keyFlights.get(team);const key=keySets.get(team).keys.find(key=>key.kid===kid);if(!key)throw Error('Unknown key');return key;
}
export async function identity(token,settings){
 if(typeof token!=='string'||token.length>16384)throw Error('Invalid token');const parts=token.split('.');if(parts.length!==3)throw Error('Invalid token');
 const head=JSON.parse(decoder.decode(decode(parts[0]))),claims=JSON.parse(decoder.decode(decode(parts[1])));
 if(head.alg!=='RS256'||typeof head.kid!=='string'||!head.kid||head.kid.length>200)throw Error('Invalid algorithm');
 const jwk=await signingKey(settings.team,head.kid),key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),encoder.encode(parts[0]+'.'+parts[1])))throw Error('Invalid signature');
 const now=Date.now()/1000,aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
 if(claims.iss!=='https://'+settings.team||!aud.includes(settings.audience)||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>now+60))||claims.type!=='app'||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>500||typeof claims.email!=='string'||claims.email.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(claims.email))throw Error('Invalid Access identity');
 return {email:claims.email.toLowerCase(),subject:claims.sub};
}
export async function sign(value,secret){const payload=JSON.stringify(value),key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return {payload,signature:Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(payload))),x=>x.toString(16).padStart(2,'0')).join('')};}
async function readInput(request){
 if(Number(request.headers.get('Content-Length'))>65536)throw Object.assign(Error('Request too large.'),{status:413});
 const reader=request.body?.getReader();let size=0,parts=[];if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw Object.assign(Error('Request too large.'),{status:413});}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
 const input=JSON.parse(decoder.decode(bytes));if(!input||Array.isArray(input)||typeof input!=='object'||['identity','actor','staffId','role','permissions','source'].some(key=>Object.hasOwn(input,key)))throw Error('Invalid input.');return input;
}
const SESSION_COOKIE='__Host-gsis_venues_session',SESSION_AGE=7*86400000;
function cookie(value,age){return SESSION_COOKIE+'='+value+'; Path=/; Max-Age='+Math.floor(age/1000)+'; Secure; HttpOnly; SameSite=Lax';}
const sessionKey=(env,origin)=>{if(typeof env.VENUES_PROXY_SECRET!=='string'||env.VENUES_PROXY_SECRET.length<32)throw Error('School session signing is not configured.');return env.VENUES_PROXY_SECRET+'|gsis-venues-session-v1|'+origin;};
async function googleIdentity(token,audience){
 if(!audience||typeof token!=='string'||token.length>16384)throw Error('Invalid identity');const parts=token.split('.');if(parts.length!==3)throw Error('Invalid identity');const head=JSON.parse(decoder.decode(decode(parts[0]))),claims=JSON.parse(decoder.decode(decode(parts[1])));if(head.alg!=='RS256'||typeof head.kid!=='string'||!head.kid)throw Error('Invalid algorithm');
 const key=await crypto.subtle.importKey('jwk',await signingKey('google',head.kid),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),encoder.encode(parts[0]+'.'+parts[1])))throw Error('Invalid signature');
 const now=Date.now()/1000;if(!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)||claims.aud!==audience||!Number.isFinite(claims.exp)||claims.exp<=now||!Number.isFinite(claims.iat)||claims.iat>now+60||claims.hd!=='gsps.edu.sg'||claims.email_verified!==true||typeof claims.sub!=='string'||!claims.sub||! /^[^@\s]+@gsps\.edu\.sg$/i.test(claims.email||''))throw Error('Invalid school identity');return {email:claims.email.toLowerCase(),subject:claims.sub};
}
async function readSession(request,env){
 const raw=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1);if(!raw||raw.length>5000)throw Error('No session');const [encoded,signature,...extra]=raw.split('.');if(extra.length||!/^[a-f0-9]{64}$/.test(signature||''))throw Error('Invalid session');const payload=decoder.decode(decode(encoded)),origin=new URL(request.url).origin,key=await crypto.subtle.importKey('raw',encoder.encode(sessionKey(env,origin)),{name:'HMAC',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)),encoder.encode(payload)))throw Error('Invalid session');
 const value=JSON.parse(payload),now=Date.now();if(value.purpose!=='gsis-venues-session-v1'||value.origin!==origin||!Number.isFinite(value.issued)||!Number.isFinite(value.expires)||value.issued>now+60000||value.expires<=now||value.expires-value.issued>SESSION_AGE||typeof value.subject!=='string'||!value.subject||!/^[^@\s]+@gsps\.edu\.sg$/.test(value.email||''))throw Error('Expired session');return {email:value.email,subject:value.subject};
}
async function requestIdentity(request,env,settings){const assertion=request.headers.get('Cf-Access-Jwt-Assertion');if(assertion!==null){if(!settings.access)throw Error('Access is not configured');return identity(assertion,settings);}const auth=request.headers.get('Authorization');if(auth){if(!auth.startsWith('Bearer '))throw Error('Invalid identity');return googleIdentity(auth.slice(7),env.GOOGLE_CLIENT_ID);}return readSession(request,env);}
async function sessionRoute(request,env,settings){
 const url=new URL(request.url);if(!['/api/session','/api/logout'].includes(url.pathname))return null;
 if(request.method!=='GET'&&request.method!=='POST'||url.pathname==='/api/logout'&&request.method!=='POST')return failure(405,'METHOD','POST required.');
 if(request.method==='POST'&&(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site'))return failure(403,'ORIGIN','Same-origin request required.');
 if(url.pathname==='/api/logout'){const response=json({ok:true});response.headers.set('Set-Cookie',cookie('',0));return response;}
 try{if(request.method==='GET')return json({ok:true,data:{user:await requestIdentity(request,env,settings)}});const auth=request.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))throw Error('Sign-in required');const user=await googleIdentity(auth.slice(7),env.GOOGLE_CLIENT_ID),issued=Date.now(),signed=await sign({purpose:'gsis-venues-session-v1',origin:url.origin,...user,issued,expires:issued+SESSION_AGE},sessionKey(env,url.origin)),value=btoa(signed.payload).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')+'.'+signed.signature;const response=json({ok:true,data:{user}});response.headers.set('Set-Cookie',cookie(value,SESSION_AGE));return response;}catch{return failure(401,'AUTH_REQUIRED','Sign in with your school account.');}
}
export default {async fetch(request,env){
 const url=new URL(request.url),api=url.pathname.startsWith('/api/');
 if(!api){if(!['GET','HEAD'].includes(request.method))return failure(405,'METHOD','GET required.');const route=/^\/[br]\/[A-Za-z0-9_-]{1,128}\/?$/.test(url.pathname)?new Request(new URL('/index.html',url),request):request;return env.ASSETS.fetch(route);}
 let settings;try{settings=config(env);}catch{if(url.pathname==='/api/config'&&request.method==='GET')return json({version:VERSION,clientId:env.GOOGLE_CLIENT_ID||'',configured:false,accessConfigured:false});return failure(503,'SETUP_REQUIRED','Configure the Venues service and school sign-in first.');}
 if(url.pathname==='/api/config')return request.method==='GET'?json({version:VERSION,clientId:env.GOOGLE_CLIENT_ID||'',configured:true,accessConfigured:settings.access}):failure(405,'METHOD','GET required.');
 const session=await sessionRoute(request,env,settings);if(session)return session;
 if(!['/api/read','/api/command'].includes(url.pathname))return failure(404,'NOT_FOUND','Not found.');
 if(request.method!=='POST')return failure(405,'METHOD','POST required.');
 if(request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return failure(403,'ORIGIN','Same-origin request required.');
 let actor;try{actor=await requestIdentity(request,env,settings);}catch{return failure(401,'AUTH_REQUIRED','Sign in with your school account.');}
 let input;try{input=await readInput(request);const command=url.pathname==='/api/command';if(!(command?COMMANDS:READS).has(input.operation))throw Error('Operation is not allowed on this route.');if(command&&(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId||'')||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0))throw Error('A request ID and observed revision are required.');}catch(error){return failure(error.status||400,error.status===413?'BODY_TOO_LARGE':'INVALID_INPUT',error.status===413?error.message:'Invalid request.');}
 try{const envelope=await sign({action:'venues',timestamp:Date.now(),nonce:crypto.randomUUID(),identity:actor,input},gsisApiSecret(env,'VENUES_PROXY_SECRET'));const response=await fetch(settings.backend,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(envelope),redirect:'follow',signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error('Backend unavailable');const result=await response.json();if(!result||typeof result.ok!=='boolean')throw Error('Invalid backend response');return json(result,result.ok?200:([400,401,403,404,409,413,423,429,503].includes(result.status)?result.status:503));}catch{return failure(503,'UPSTREAM_UNCERTAIN','The service response could not be verified. Keep your request ID and retry the same action.');}
}};
