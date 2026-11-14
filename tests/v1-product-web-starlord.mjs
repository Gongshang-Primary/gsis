import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,webcrypto} from 'node:crypto';
import {JSDOM,VirtualConsole} from 'jsdom';
import {buildWeb} from '../scripts/v1/build-web.mjs';
const directory=await mkdtemp(join(tmpdir(),'gsis-starlord-privacy-'));
const tokenA='a'.repeat(64),tokenB='b'.repeat(64),day=new Date().toLocaleDateString('en-CA'),cache=token=>'starlord_board_v1:'+createHash('sha256').update('device:'+token).digest('hex');
const row=name=>({bookingId:'synthetic-booking',resource:'Synthetic cart',teacherTtbName:name,teacherStatutoryName:name,epochStart:Date.now()+3600000,epochEnd:Date.now()+7200000,startPeriod:'1',endPeriod:'2',requestedQuantity:10,bookingStatus:'BOOKED',classOrActivity:'Synthetic class',subject:'Science'});
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
async function until(check){for(let attempt=0;attempt<400;attempt++){if(check())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('The copied STARLORD flow did not reach its expected state.');}
try{
 const build=await buildWeb(join(directory,'web')),html=await readFile(join(build.output,'starlord/index.html'),'utf8'),client=await readFile(join(build.output,'v1/shared/client.js'),'utf8'),source=await readFile(join(build.output,'starlord/assets/app.js'),'utf8'),photos=await readFile(join(build.output,'v1/shared/starlord-photos.js'),'utf8');
 function page(token,stored={}){const dom=new JSDOM(html,{url:'https://school.test/starlord/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole()}),w=dom.window,requests=[];Object.assign(w,{Response,Request,Headers,TextEncoder,structuredClone,matchMedia:()=>({matches:true,addEventListener(){},removeEventListener(){}}),fetch:(input,options={})=>new Promise(resolve=>requests.push({url:String(input),headers:new Headers(options.headers),resolve}))});Object.defineProperty(w.crypto,'subtle',{value:webcrypto.subtle});w.sessionStorage.setItem('gsis-signage-device',token);for(const [key,value]of Object.entries(stored))w.localStorage.setItem(key,JSON.stringify(value));const created=[],revoked=[];w.URL.createObjectURL=()=>{const url='blob:synthetic-'+created.length;created.push(url);return url;};w.URL.revokeObjectURL=url=>revoked.push(url);w.eval(client);w.eval(photos);w.eval(source);return{w,requests,created,revoked,close:()=>w.close()};}
 for(const deniedStatus of [401,403]){const cached={savedAt:Date.now(),date:day,revision:'revision-a',rows:[row('Private Device A')]},p=page(tokenA,{[cache(tokenA)]:cached,starlord_board_last_good_v1_3:cached});try{await until(()=>p.requests.length===1);assert(!p.w.document.body.textContent.includes('Private Device A'),'Persisted data cannot render before a fresh authority check');assert(p.requests[0].url.includes('since=revision-a'));assert.equal(p.requests[0].headers.get('X-GSiS-Device-Token'),tokenA);p.requests[0].resolve(reply({ok:true,data:{date:day,revision:'revision-a',unchanged:true}}));await until(()=>p.w.document.body.textContent.includes('Private Device A'));assert.equal(p.w.localStorage.getItem('starlord_board_last_good_v1_3'),null);assert(p.w.localStorage.getItem(cache(tokenA)));assert(!Object.keys(p.w.localStorage).some(key=>key.includes(tokenA)));p.w.dispatchEvent(new p.w.Event('online'));await until(()=>p.requests.length===2);p.requests[1].resolve(reply({ok:false,error:{code:'DEVICE_SESSION_INVALID',message:'Revoked',retryable:false}},deniedStatus));await until(()=>p.w.document.querySelector('#feedStatus').textContent.includes('expired or was revoked'));assert(!p.w.document.body.textContent.includes('Private Device A'));assert.equal(p.w.localStorage.getItem(cache(tokenA)),null);assert.equal(p.w.document.querySelector('#activeGrid').childElementCount,0);}finally{p.close();}}
 const p=page(tokenB,{[cache(tokenA)]:{savedAt:Date.now(),date:day,revision:'revision-a',rows:[row('Private Device A')]}});try{await until(()=>p.requests.length===1);assert(!p.requests[0].url.includes('since='),'A new token cannot use another token’s cache revision');p.requests[0].resolve(reply({ok:false,error:{code:'PROVIDER_UNAVAILABLE',message:'Offline',retryable:true}},503));await until(()=>p.w.document.querySelector('#feedStatus').textContent.includes('unavailable'));assert(!p.w.document.body.textContent.includes('Private Device A'));p.w.dispatchEvent(new p.w.Event('online'));await until(()=>p.requests.length===2);p.requests[1].resolve(reply({ok:true,data:{date:day,revision:'revision-b',bookings:[row('Private Device B')]}}));await until(()=>p.w.document.body.textContent.includes('Private Device B'));p.w.dispatchEvent(new p.w.Event('online'));await until(()=>p.requests.length===3);await p.w.GSISV1.clearProtectedState();p.requests[2].resolve(reply({ok:true,data:{date:day,revision:'old-flight',bookings:[row('Private Late Response')]}}));await new Promise(resolve=>setTimeout(resolve,25));assert(!p.w.document.body.textContent.includes('Private Device B'));assert(!p.w.document.body.textContent.includes('Private Late Response'));assert.equal(p.w.localStorage.getItem(cache(tokenB)),null);}finally{p.close();}
 // A previous date or unrelated revision must never validate persisted rows.
 const yesterday=new Date(Date.now()-86400000).toLocaleDateString('en-CA');
 for(const scenario of [
   {storedDate:yesterday,replyDate:day,replyRevision:'same',expectSince:false},
   {storedDate:day,replyDate:yesterday,replyRevision:'same',expectSince:true},
   {storedDate:day,replyDate:day,replyRevision:'different',expectSince:true}
 ]){
   const q=page(tokenA,{[cache(tokenA)]:{savedAt:Date.now(),date:scenario.storedDate,revision:'same',rows:[row('Must stay hidden')]}});
   try{
     await until(()=>q.requests.length===1);
     assert.equal(q.requests[0].url.includes('since='),scenario.expectSince);
     q.requests[0].resolve(reply({ok:true,data:{date:scenario.replyDate,revision:scenario.replyRevision,unchanged:true}}));
     await until(()=>q.w.document.querySelector('#feedStatus').textContent.includes('could not be verified'));
     assert(!q.w.document.body.textContent.includes('Must stay hidden'));
     assert.equal(q.w.localStorage.getItem(cache(tokenA)),null);
   }finally{q.close();}
 }
 // Exercise the real photo overlay. Delayed fetch ignores AbortSignal deliberately:
 // an old transport callback still cannot restore a photo after local expiry.
 const q=page(tokenA);
 try{
   await until(()=>q.requests.length===1);
   const rows=[1,2].map(n=>({...row('Private Photo '+n),bookingId:'photo-booking-'+n,isOpen:true,bookingStatus:'COLLECTED',photoIds:['photo-'+n]}));
   q.requests[0].resolve(reply({ok:true,data:{date:day,revision:'photos',validUntil:Date.now()+300,bookings:rows}}));
   await until(()=>q.requests.filter(request=>request.url.includes('photoId=')).length===2);
   const photoRequests=q.requests.filter(request=>request.url.includes('photoId='));
   photoRequests[0].resolve(new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}}));
   await until(()=>q.w.document.querySelector('img[data-private-photo]'));
   assert.equal(q.created.length,1);
   await until(()=>q.w.document.querySelector('#feedStatus').textContent.includes('expired or was revoked'));
   assert.equal(q.w.document.querySelectorAll('img[data-private-photo]').length,0);
   assert.deepEqual(q.revoked,q.created);
   assert.equal(q.w.localStorage.getItem(cache(tokenA)),null);
   photoRequests[1].resolve(new Response(new Uint8Array([4,5,6]),{headers:{'content-type':'image/png'}}));
   await new Promise(resolve=>setTimeout(resolve,25));
   assert.equal(q.created.length,1,'Late private photo completion cannot create a blob after expiry');
   assert(!q.w.document.body.textContent.includes('Private Photo'));
 }finally{q.close();}
 console.log('PASS copied STARLORD privacy: token/date/revision-bound cache, 401/403 revoke clears DOM/storage, scope switching, local expiry clears photo blobs while offline, and late board/photo callbacks cannot restore protected state.');
}finally{await rm(directory,{recursive:true,force:true});}
