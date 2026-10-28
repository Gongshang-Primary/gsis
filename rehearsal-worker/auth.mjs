import {fail} from './domain.mjs';
const ALLOWED=new Set(['REHEARSAL_LEDGER','REHEARSAL_TIMETABLES','REHEARSAL_MODE','REHEARSAL_INSTANCE_ID','REHEARSAL_ORIGIN','REHEARSAL_GOOGLE_CLIENT_ID','REHEARSAL_SCHOOL_DOMAIN','REHEARSAL_ADMIN_EMAILS']);
export function configuration(env){
 if(Object.keys(env).some(k=>!ALLOWED.has(k)))fail(503,'UNSAFE_CONFIGURATION','Only dedicated rehearsal bindings and configuration are permitted. Remove every extra binding, credential or variable.');
 if(env.REHEARSAL_MODE!=='simulation-only'||!/^[-a-z0-9]{8,64}$/.test(env.REHEARSAL_INSTANCE_ID||'')||!env.REHEARSAL_LEDGER?.prepare||!env.REHEARSAL_LEDGER?.batch||!env.REHEARSAL_TIMETABLES?.get||!env.REHEARSAL_TIMETABLES?.put||!env.REHEARSAL_TIMETABLES?.head)fail(503,'REHEARSAL_NOT_CONFIGURED','Dedicated simulation bindings, mode and instance identity are required.');
 let origin;try{origin=new URL(env.REHEARSAL_ORIGIN);}catch{fail(503,'REHEARSAL_NOT_CONFIGURED','An exact HTTPS rehearsal origin is required.');}
 if(origin.protocol!=='https:'||origin.origin!==env.REHEARSAL_ORIGIN||!/^gsis-roster-rehearsal\.[a-z0-9-]+\.workers\.dev$/.test(origin.hostname))fail(503,'REHEARSAL_NOT_CONFIGURED','Configure the exact dedicated gsis-roster-rehearsal workers.dev HTTPS origin.');
 const domain=String(env.REHEARSAL_SCHOOL_DOMAIN||'').toLowerCase(),client=String(env.REHEARSAL_GOOGLE_CLIENT_ID||''),admins=String(env.REHEARSAL_ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain)||!/^[-a-zA-Z0-9.]+\.apps\.googleusercontent\.com$/.test(client)||!admins.length||admins.length>20||admins.some(e=>!e.endsWith('@'+domain)||!/^[^@\s]+@[^@\s]+$/.test(e)))fail(503,'REHEARSAL_NOT_CONFIGURED','Configure the school Google client, school domain and 1–20 explicit school administrator emails.');
 return {origin:origin.origin,instance:env.REHEARSAL_INSTANCE_ID,domain,client,admins:new Set(admins)};
}
function decode(value){try{if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error();return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));}catch{fail(401,'INVALID_IDENTITY','Invalid Google identity token.');}}
function jsonPart(value){try{return JSON.parse(new TextDecoder().decode(decode(value)));}catch{fail(401,'INVALID_IDENTITY','Invalid Google identity token.');}}
let keyCache={until:0,keys:[]};
export async function verifyGoogleToken(token,config){
 if(typeof token!=='string'||token.length>16384||token.split('.').length!==3)fail(401,'INVALID_IDENTITY','A school Google ID token is required.');
 const [headerPart,payloadPart,signaturePart]=token.split('.'),header=jsonPart(headerPart),claims=jsonPart(payloadPart),now=Math.floor(Date.now()/1000);
 if(header.alg!=='RS256'||typeof header.kid!=='string'||header.kid.length>200||header.crit)fail(401,'INVALID_IDENTITY','Unsupported Google identity signature.');
 if(!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)||claims.aud!==config.client||claims.email_verified!==true||claims.hd!==config.domain||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255||!Number.isInteger(claims.exp)||claims.exp<=now||!Number.isInteger(claims.iat)||claims.iat>now+60||claims.exp-claims.iat>3900||claims.exp<=claims.iat||claims.nbf!==undefined&&(!Number.isInteger(claims.nbf)||claims.nbf>now))fail(401,'INVALID_IDENTITY','Google school identity claims are invalid or expired.');
 const email=String(claims.email||'').toLowerCase();if(!email.endsWith('@'+config.domain)||!config.admins.has(email))fail(403,'ADMIN_REQUIRED','This verified school identity is not on the rehearsal administrator allowlist.');
 if(keyCache.until<Date.now()){
  let response;try{response=await fetch('https://www.googleapis.com/oauth2/v3/certs',{redirect:'error',signal:AbortSignal.timeout(10000)});}catch{fail(503,'IDENTITY_UNAVAILABLE','Google identity verification is unavailable.');}
  if(!response.ok)fail(503,'IDENTITY_UNAVAILABLE','Google identity verification is unavailable.');
  let body;try{const raw=await response.text();if(raw.length>65536)throw Error();body=JSON.parse(raw);}catch{fail(503,'IDENTITY_UNAVAILABLE','Google identity key response is invalid.');}
  if(!Array.isArray(body.keys)||body.keys.length>10)fail(503,'IDENTITY_UNAVAILABLE','Google identity key response is invalid.');
  keyCache={until:Date.now()+300000,keys:body.keys};
 }
 const jwk=keyCache.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.alg==='RS256'&&k.use==='sig');
 if(!jwk)fail(401,'INVALID_IDENTITY','Google identity key is unavailable; sign in again after key refresh.');
 let valid=false;try{const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(signaturePart),new TextEncoder().encode(headerPart+'.'+payloadPart));}catch{}
 if(!valid)fail(401,'INVALID_IDENTITY','Google identity signature verification failed.');
 return {email,subject:claims.sub};
}
export async function authenticate(request,config){
 if(request.headers.get('Origin')!==config.origin||!['same-origin',null].includes(request.headers.get('Sec-Fetch-Site')))fail(403,'ORIGIN_REQUIRED','Use the dedicated rehearsal origin.');
 const auth=request.headers.get('Authorization')||'';if(!auth.startsWith('Bearer '))fail(401,'SIGN_IN_REQUIRED','Sign in with an allowlisted school Google identity.');
 return verifyGoogleToken(auth.slice(7),config);
}
