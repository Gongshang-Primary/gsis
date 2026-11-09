/* GSIS_API_SECRET_BEGIN */
// Roster/Deploy transport requires one setting without legacy fallback.
// Browser sessions retain their existing purpose- and origin-bound derivation.
function gsisApiSecret(env){
 const value=env?.GSIS_SECRET;
 if(typeof value!=='string'||!/^[!-~]{32,8000}$/.test(value)){
  throw Object.assign(Error('GSIS_SECRET must contain 32 to 8000 printable ASCII characters without spaces.'),
   {status:503,code:'GSIS_SECRET_INVALID'});
 }
 return value;
}

/* GSIS_API_SECRET_END */
// Private service-binding transport. Never fall back after a delegated request:
// the remote commit may have succeeded even when its reply did not arrive.
const encoder=new TextEncoder();
// The existing upload limit is 11 MB of JSON. Signing wraps that JSON once
// more, so escaped text can nearly double without enlarging the user upload.
const MAX_ENVELOPE_BYTES=24000000;
const PURPOSES=new Set(['roster','deploy','roster-service','roster-http','deploy-http','roster-calendar','roster-transport','health']);
const USER_PURPOSES=new Set(['roster','deploy','roster-transport','health']);
const fail=(status,code,message)=>{throw Object.assign(Error(message),{status,code});};
const domainFor=purpose=>purpose.startsWith('deploy')?'deploy':'roster';
export function backendAvailable(env){
 if(env.GSIS_BACKEND_INTERNAL===true)return false;
 if(env.GSIS_BACKEND?.fetch)return true;
 if(env.GSIS_BACKEND_REQUIRED===true||env.GSIS_BACKEND_REQUIRED==='true')fail(503,'GSIS_BACKEND_CONFIG','The private operational service is not configured.');
 if(env.GSIS_BACKEND_REQUIRED!==undefined&&!['',false,'false'].includes(env.GSIS_BACKEND_REQUIRED))fail(503,'GSIS_BACKEND_CONFIG','The private operational service configuration is invalid.');
 return false;
}
function originFor(env,domain){
 const value=env[domain==='deploy'?'DEPLOY_PUBLIC_ORIGIN':'ROSTER_PUBLIC_ORIGIN'];
 let url;try{url=new URL(value);}catch{fail(503,'GSIS_BACKEND_CONFIG','Configure the public application origin.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)fail(503,'GSIS_BACKEND_CONFIG','Configure an exact HTTPS application origin.');
 return url.origin;
}
function schoolIdentity(who,now=Date.now()){
 if(!who||! /^[^@\s]+@gsps\.edu\.sg$/i.test(who.email||'')||typeof who.subject!=='string'||!who.subject||who.subject.length>240||!Number.isFinite(who.expiresAt)||who.expiresAt<=now)fail(401,'GSIS_BACKEND_IDENTITY','A current school session is required.');
 return {email:who.email.toLowerCase(),subject:who.subject,expiresAt:who.expiresAt};
}
async function keyFor(env,usage){if(typeof gsisApiSecret(env)!=='string'||gsisApiSecret(env).length<32)fail(503,'GSIS_BACKEND_CONFIG','Configure the private service credential.');return crypto.subtle.importKey('raw',encoder.encode(gsisApiSecret(env)),{name:'HMAC',hash:'SHA-256'},false,[usage]);}
async function envelopeRequest(env,purpose,data){
 if(!PURPOSES.has(purpose))fail(403,'GSIS_BACKEND_PURPOSE','This private operation is not available.');
 const expectedOrigin=originFor(env,domainFor(purpose)),origin=env.GSIS_REQUEST_ORIGIN||expectedOrigin;
 if(origin!==expectedOrigin)fail(403,'GSIS_BACKEND_ORIGIN','The application origin is not permitted.');
 const command={schema:1,purpose,origin,issuedAt:Date.now(),nonce:crypto.randomUUID(),...data};
 // Callers cannot override the signed transport's security fields.
 Object.assign(command,{schema:1,purpose,origin,issuedAt:Date.now(),nonce:crypto.randomUUID()});
 if(USER_PURPOSES.has(purpose))command.identity=schoolIdentity(data.identity);
 else delete command.identity;
 const payload=JSON.stringify(command),key=await keyFor(env,'sign'),signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(payload))),v=>v.toString(16).padStart(2,'0')).join('');
 return new Request('https://gsis-backend.internal/v1/'+purpose,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature})});
}
export async function verifyBackendEnvelope(request,env,{now=Date.now()}={}){
 const path=new URL(request.url).pathname,purpose=path.replace(/^\/v1\//,'');
 if(request.method!=='POST')fail(405,'GSIS_BACKEND_METHOD','POST required.');
 if(path!=='/v1/'+purpose||!PURPOSES.has(purpose))fail(404,'GSIS_BACKEND_PURPOSE','Private route not found.');
 if(Number(request.headers.get('Content-Length'))>MAX_ENVELOPE_BYTES)fail(413,'GSIS_BACKEND_SIZE','Request too large.');
 const raw=await request.text();if(encoder.encode(raw).byteLength>MAX_ENVELOPE_BYTES)fail(413,'GSIS_BACKEND_SIZE','Request too large.');
 let envelope;try{envelope=JSON.parse(raw);}catch{fail(401,'GSIS_BACKEND_SIGNATURE','Invalid private service request.');}
 if(typeof envelope?.payload!=='string'||! /^[a-f0-9]{64}$/.test(envelope.signature||''))fail(401,'GSIS_BACKEND_SIGNATURE','Invalid private service request.');
 const key=await keyFor(env,'verify'),signature=Uint8Array.from(envelope.signature.match(/../g),s=>parseInt(s,16));
 if(!await crypto.subtle.verify('HMAC',key,signature,encoder.encode(envelope.payload)))fail(401,'GSIS_BACKEND_SIGNATURE','Invalid private service request.');
 let command;try{command=JSON.parse(envelope.payload);}catch{fail(401,'GSIS_BACKEND_SIGNATURE','Invalid private service request.');}
 if(command?.schema!==1||command.purpose!==purpose||!Number.isFinite(command.issuedAt)||Math.abs(now-command.issuedAt)>60000||! /^[a-f0-9-]{36}$/.test(command.nonce||''))fail(401,'GSIS_BACKEND_EXPIRED','The private service request has expired.');
 if(command.origin!==originFor(env,domainFor(purpose)))fail(403,'GSIS_BACKEND_ORIGIN','The application origin is not permitted.');
 if(USER_PURPOSES.has(purpose))command.identity=schoolIdentity(command.identity,now);
 else if(command.identity!==undefined)fail(403,'GSIS_BACKEND_IDENTITY','Service requests cannot carry a browser identity.');
 return command;
}
async function bindingFetch(env,request){try{return await env.GSIS_BACKEND.fetch(request);}catch{fail(503,'GSIS_BACKEND_UNCONFIRMED','The operation could not be confirmed. Retry with the same request.');}}
export async function callOperationalBackend(env,purpose,data){
 if(!backendAvailable(env))return undefined;
 const response=await bindingFetch(env,await envelopeRequest(env,purpose,data));
 let body;try{body=await response.json();}catch{fail(503,'GSIS_BACKEND_UNCONFIRMED','The operation could not be confirmed. Retry with the same request.');}
 if(!response.ok||body?.ok!==true){const status=[400,401,403,404,409,413,423,503].includes(body?.status)?body.status:503;fail(status,/^[A-Z0-9_]{1,80}$/.test(body?.code||'')?body.code:'GSIS_BACKEND_UNCONFIRMED',status<500&&typeof body?.error==='string'?body.error:'The private operation could not be confirmed. Retry with the same request.');}
 if(!Object.hasOwn(body,'value'))fail(503,'GSIS_BACKEND_UNCONFIRMED','The private operation returned an incomplete reply.');
 return body.value;
}
export function backendDomainEnv(env,domain){
 if(!['roster','deploy'].includes(domain))fail(503,'GSIS_BACKEND_CONFIG','Unknown operational domain.');
 const prefix=domain.toUpperCase();
 return {...env,APPS_SCRIPT_URL:env[prefix+'_APPS_SCRIPT_URL'],GOOGLE_CLIENT_ID:env[prefix+'_GOOGLE_CLIENT_ID'],SESSION_DAYS:env[prefix+'_SESSION_DAYS'],GSIS_BACKEND:undefined,GSIS_BACKEND_REQUIRED:'false',GSIS_BACKEND_INTERNAL:true,GSIS_REQUEST_ORIGIN:originFor(env,domain)};
}
export function permittedRelayPath(domain,path){
 if(domain==='deploy')return ['/api/edge/service','/api/venues-source','/api/lord-source'].includes(path);
 return domain==='roster'&&(path==='/api/venues-source'||/^\/api\/whatsapp\/(?:media|reports)\/[A-Za-z0-9._~%-]+$/.test(path));
}
export async function forwardOperationalRequest(request,env,domain){
 if(!backendAvailable(env))return undefined;
 const url=new URL(request.url);
 if(!permittedRelayPath(domain,url.pathname)||url.origin!==originFor(env,domain)||url.username||url.password||url.hash)fail(403,'GSIS_BACKEND_ROUTE','This operational route cannot be relayed.');
 const headers={};for(const name of ['Authorization','Cookie','Origin','Sec-Fetch-Site','Content-Type'])if(request.headers.has(name))headers[name]=request.headers.get(name);
 const body=['GET','HEAD'].includes(request.method)?undefined:await request.text();if(body&&encoder.encode(body).byteLength>160000)fail(413,'GSIS_BACKEND_SIZE','Request too large.');
 return bindingFetch(env,await envelopeRequest(env,domain+'-http',{request:{url:url.href,method:request.method,headers,body}}));
}
