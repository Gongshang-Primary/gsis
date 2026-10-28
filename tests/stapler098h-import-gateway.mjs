import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import worker,{rosterBackend} from '../roster-update/public/_worker.js';

globalThis.crypto??=webcrypto;
const origin='https://roster.gsps.edu.sg',secret='synthetic-import-secret-'.repeat(3),now=Date.now();
const env={BRIDGE_SECRET:secret,GOOGLE_CLIENT_ID:'fixture',APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec'};
const session=JSON.stringify({purpose:'gsis-session-v1',origin,email:'admin@gsps.edu.sg',subject:'fixture',issued:now,expires:now+3600000});
const cookie='__Host-gsis_session='+Buffer.from(session).toString('base64url')+'.'+createHmac('sha256',secret+'|gsis-browser-session-v1|'+origin).update(session).digest('hex');
const request=input=>new Request(origin+'/api/operations',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify(input)});
const before=globalThis.fetch,calls=[];
globalThis.fetch=async(url,init)=>{
 assert.equal(String(url),env.APPS_SCRIPT_URL);
 const signed=JSON.parse(init.body),decoded=JSON.parse(signed.payload);
 assert.equal(signed.signature,createHmac('sha256',secret).update(signed.payload).digest('hex'));
 calls.push({signed,decoded});
 return Response.json({ok:true,data:{saved:true}});
};
try{
 const command={operation:'importStapler',date:'2026-10-27',plan:{notes:'华'.repeat(110000)}};
 const response=await worker.fetch(request(command),env,{});
 assert.equal(response.status,200);
 assert.equal((await response.json()).ok,true);
 assert.equal(calls.length,1,'large native import reaches the existing authority once');
 assert.equal(calls[0].decoded.input.plan.notes,command.plan.notes);
 assert(!calls[0].signed.payload.includes('华'),'native plans use the established ASCII signed wire');
 const receipt=await worker.fetch(request({operation:'receiptStatus',command}),env,{});
 assert.equal(receipt.status,200);
 assert.equal(calls.length,2,'recovery submits the same bounded original command');
 assert(!calls[1].signed.payload.includes('华'));
 const oversized=await worker.fetch(request({...command,plan:{notes:'x'.repeat(1900001)}}),env,{});
 assert.equal(oversized.status,413);
 assert.equal(calls.length,2,'oversized model never reaches authority');
 const ordinary=await worker.fetch(request({operation:'saveInstructions',notes:'x'.repeat(270000)}),env,{});
 assert.equal(ordinary.status,413,'ordinary operations retain their smaller bound');
 assert.equal(calls.length,2);
 const direct=await rosterBackend(env,'rosterOperations',command,{email:'admin@gsps.edu.sg',subject:'fixture'},crypto.randomUUID());
 assert.equal(direct.result.ok,true);
 assert(!calls[2].signed.payload.includes('华'));
 console.log('PASS native import and receipt use bounded authenticated ASCII transport; oversize and ordinary bounds remain enforced');
}finally{globalThis.fetch=before;}
