/* Fetch-only preparation. No cron, provider messaging, activation or production bindings. */
import {LIMITS,RELEASE,PROTOCOL_RELEASE,fail,exact} from './domain.mjs';
import {configuration,authenticate} from './auth.mjs';
import {bounded,checkBindings,upload,commit,state,read} from './storage.mjs';
import {loginPage,adminControls} from './ui.mjs';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cross-Origin-Opener-Policy':'same-origin-allow-popups','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}});
const routes=new Set(['/api/prep/ui','/api/prep/state','/api/prep/part','/api/prep/commit','/api/prep/read']);
async function body(request){
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||'')||!request.body)fail(415,'JSON_REQUIRED','Send application/json.');
 if(Number(request.headers.get('Content-Length'))>LIMITS.body)fail(413,'SIZE_LIMIT','The part upload exceeds its supported request bound.');
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bounded(request.body,LIMITS.body)));}catch(error){if(error.status)throw error;fail(400,'INVALID_JSON','Invalid JSON request.');}
}
export default {async fetch(request,env){
 try{
  const config=configuration(env),url=new URL(request.url);if(url.origin!==config.origin)fail(403,'ORIGIN_REQUIRED','Use the configured dedicated rehearsal origin.');
  if(url.search)fail(400,'INVALID_ROUTE','Storage selectors and query strings are unsupported.');
  if(url.pathname==='/'&&request.method==='GET'){
   const nonce=crypto.randomUUID().replaceAll('-','');return new Response(loginPage(config,nonce),{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"' https://accounts.google.com; connect-src 'self' https://accounts.google.com; frame-src https://accounts.google.com; style-src 'nonce-"+nonce+"' https://accounts.google.com; img-src https://accounts.google.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
  }
  if(!routes.has(url.pathname)||request.method!=='POST')fail(404,'NOT_FOUND','Timetable preparation route not found.');
  const who=await authenticate(request,config);await checkBindings(env,config);const input=await body(request);
  if(url.pathname==='/api/prep/part')return json(await upload(env,config,input));
  if(url.pathname==='/api/prep/commit')return json(await commit(env,config,who,input));
  if(url.pathname==='/api/prep/read')return json(await read(env,config,input));
  exact(input,[],'Read request');if(url.pathname==='/api/prep/ui')return json({html:adminControls,identity:who.email,release:RELEASE,protocolRelease:PROTOCOL_RELEASE});return json({...await state(env,config),release:RELEASE,protocolRelease:PROTOCOL_RELEASE,limits:LIMITS});
 }catch(error){return json({ok:false,code:error.code||'PREPARATION_UNAVAILABLE',error:error.code||'PREPARATION_UNAVAILABLE',message:error.status?error.message:'Timetable preparation storage is unavailable. Retry reads; retry uncertain commits using the same request identity.'},error.status||503);}
}};
