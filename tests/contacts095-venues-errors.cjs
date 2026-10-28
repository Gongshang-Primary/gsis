'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const fixture=require('./contacts502-fixture.js');
const f=fixture(),secret='v'.repeat(32);
function request(input,signatureSecret=secret){
 const payload=JSON.stringify({action:'venuesSource',service:'gsis-venues-v1',source:'contacts',timestamp:Date.now(),nonce:crypto.randomUUID(),input});
 f.ctx.venuesRequest={postData:{contents:JSON.stringify({payload,signature:crypto.createHmac('sha256',signatureSecret).update(payload).digest('hex')})}};
 return JSON.parse(f.run('doPost(venuesRequest).text'));
}
let r=request({operation:'manifest'});assert.equal(r.code,'VENUES_SOURCE_SETUP');
f.props.set('VENUES_BRIDGE_SECRET',secret);
r=request({operation:'manifest'},'wrong');assert.equal(r.code,'VENUES_SOURCE_AUTH');
r=request({operation:'delete'});assert.equal(r.code,'VENUES_SOURCE_INPUT');
f.run("lordContactsSnapshot_=function(){venuesSourceError_(409,'VENUES_SOURCE_CHANGED','Refresh the source.');}");
r=request({operation:'manifest'});assert.equal(r.code,'VENUES_SOURCE_CHANGED');
f.run("lordContactsSnapshot_=function(){throw new Error('private-value-must-not-leak');}");
r=request({operation:'manifest'});assert.equal(r.code,undefined);assert(!JSON.stringify(r).includes('private-value-must-not-leak'));
console.log('PASS real Contacts source entrypoint retains safe setup/auth/input/change codes and hides raw exceptions');
