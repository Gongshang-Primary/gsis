const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),assert=require('assert/strict'),{ctx,props}=require('./storage.cjs');
props.set('CONTACTS_API_URL','https://script.google.com/macros/s/test/exec');props.set('CONTACTS_BRIDGE_SECRET','c'.repeat(32));props.set('BRIDGE_SECRET','d'.repeat(32));
ctx.Utilities.computeHmacSha256Signature=(text,key,charset='utf8')=>[...crypto.createHmac('sha256',Buffer.from(key,charset)).update(text,charset).digest()];ctx.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this}})};
ctx.UrlFetchApp={fetch:()=>({getContentText:()=>JSON.stringify({ok:false,status:503,code:'CONTACTS_RECOVERY_REQUIRED',error:'A Contacts save is awaiting recovery. Open Contacts.'})})};
const payload=JSON.stringify({action:'sync',input:{},identity:{email:'a@gsps.edu.sg',subject:'a'},timestamp:Date.now(),nonce:crypto.randomUUID()});ctx.signed={postData:{contents:JSON.stringify({payload,signature:crypto.createHmac('sha256','d'.repeat(32)).update(payload).digest('hex')})}};
const result=JSON.parse(vm.runInContext('doPost(signed).text',ctx));assert.equal(result.ok,false);assert.equal(result.status,503);assert.equal(result.code,'CONTACTS_RECOVERY_REQUIRED');assert.match(result.error,/Open Contacts/);
console.log('PASS Contacts recovery code and actionable message survive the signed Deploy backend boundary.');
