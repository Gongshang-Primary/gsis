'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),I=require('../shared/roster-inbox.js');
const now=Date.now(),waId='6591234567',ctx={now,service:true,user:{staffId:'smc',email:'smc@school.test',smc:true},people:[{id:'smc',name:'SMC',mobile:'92222222',active:true}],smcIds:['smc'],adminIds:[],currentDutyIds:[],uuid:crypto.randomUUID,digest:JSON.stringify};
const s=I.initial(),message={id:'wamid.image',from:waId,timestamp:now,type:'image',text:'Room <2> & board',image:{mediaId:'123456',mimeType:'image/png',captureStatus:'unavailable',sha256:'a'.repeat(64)}};
I.ingest(s,ctx,{message});
let data=I.thread(s,ctx,{waId});
assert.equal(data.messages[0].image.mimeType,'image/png');
assert.equal(data.messages[0].text,message.text);
assert.equal(data.messages[0].image.available,false);
assert(!JSON.stringify(data).includes('mediaId'));
assert.equal(I.media(s,ctx,{waId,messageId:message.id}).message.type,'image');
assert.throws(()=>I.media(s,{...ctx,user:{smc:false}},{waId,messageId:message.id}),{status:403});
assert.throws(()=>I.media(s,ctx,{waId:'6599999999',messageId:message.id}),{status:404});
const revision=s.threads[0].revision;
I.ingest(s,ctx,{message:{...message,image:{...message.image,captureStatus:'stored',objectKey:'inbox/123/'+ 'b'.repeat(64)}}});
assert.equal(s.threads[0].revision,revision+1);
assert.equal(s.messages.length,1);
assert.equal(I.thread(s,ctx,{waId}).messages[0].image.available,true);
assert.throws(()=>I.ingest(s,ctx,{message:{...message,id:'badimage',image:{...message.image,mimeType:'image/svg+xml'}}}),{status:400});
// A conditional refresh still authorises and refreshes current user-facing metadata,
// while omitting unchanged history; a periodic full read updates time-derived delivery states.
for(let n=0;n<100;n++)I.ingest(s,ctx,{message:{...message,id:'wamid.text'+n,type:'text',text:'message '.repeat(100),image:undefined,timestamp:now-n}});
data=I.thread(s,ctx,{waId});
const unchanged=I.thread(s,{...ctx,now:now+1000},{waId,knownRevision:data.thread.revision,knownReadAt:now});
assert.equal(unchanged.unchanged,true);
assert.equal(unchanged.messages,undefined);
assert(JSON.stringify(unchanged).length<JSON.stringify(data).length/20);
assert.throws(()=>I.thread(s,{...ctx,user:{smc:false}},{waId,knownRevision:data.thread.revision,knownReadAt:now}),{status:403});
assert(Array.isArray(I.thread(s,{...ctx,now:now+30001},{waId,knownRevision:data.thread.revision,knownReadAt:now}).messages));
I.ingest(s,{...ctx,now:now+1000},{message:{...message,id:'wamid.new',timestamp:now+1000}});
assert(Array.isArray(I.thread(s,{...ctx,now:now+1000},{waId,knownRevision:data.thread.revision,knownReadAt:now}).messages));
// Resolve each Contacts phone once per list read, including a 5,000-thread search.
let phoneReads=0;const people=Array.from({length:150},(_,n)=>({id:'p'+n,name:'Person '+n,active:true,get mobile(){phoneReads++;return String(6591000000+n);}}));
const full=I.initial();full.threads=Array.from({length:5000},(_,n)=>({waId:String(6592000000+n),profileName:'Parent '+n,revision:1,lastMessageAt:now-n,alertRecipientIds:[]}));
const list=I.list(full,{...ctx,people},{filter:'all',search:'Parent',limit:50});
assert.equal(list.threads.length,50);assert.equal(phoneReads,150);
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/082-inbox-performance.json',JSON.stringify({fixtureOnly:true,threads:5000,contacts:150,searchPhoneReads:phoneReads,unchangedThreadBytes:Buffer.byteLength(JSON.stringify(unchanged)),fullThreadBytes:Buffer.byteLength(JSON.stringify(data)),authorityChecksRetained:true},null,2)+'\n');
console.log('PASS Inbox images: retained captions, private metadata, idempotent capture, role/thread isolation; conditional refresh >95% smaller; 5,000-thread search resolves 150 phone numbers once.');
