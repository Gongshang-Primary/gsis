'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {makeHarness}=require('./calendar/backend_harness.cjs');
const room={id:'room',unit:'A1-01',name:'Synthetic Hall',aliases:[],active:true};
function fixture({url='https://script.google.com/macros/s/synthetic/exec',secret='k'.repeat(33),status=200,body={ok:true,data:{venues:[room]}}}={}){
 const h=makeHarness();vm.runInContext(fs.readFileSync('calendar-backend/VenueDirectory.gs','utf8'),h.sandbox);
 if(url!==null)h.props.set('VENUES_APPS_SCRIPT_URL',url);if(secret!==null)h.props.set('GSIS_SECRET',secret);
 let calls=0;
 h.sandbox.Utilities.computeHmacSha256Signature=(p,s)=>[...crypto.createHmac('sha256',s).update(p).digest()];
 h.sandbox.UrlFetchApp={fetch(){calls++;return{getResponseCode:()=>status,getContentText:()=>typeof body==='string'?body:JSON.stringify(body)};}};
 return {...h,calls:()=>calls,status:()=>JSON.parse(JSON.stringify(h.sandbox.calendarVenueDirectoryStatus_(h.actor('admin'))))};
}
for(const [options,code] of [
 [{url:null},'VENUES_URL_MISSING'],[{url:'https://example.test/private?secret=private-value'},'VENUES_URL_INVALID'],
 [{secret:null},'VENUES_SECRET_MISSING'],[{secret:'has a space'},'GSIS_SECRET_INVALID'],
 [{status:502,body:'private backend response'},'VENUES_HTTP_ERROR'],[{body:'<html>private login</html>'},'VENUES_RESPONSE_INVALID'],
 [{body:'x'.repeat(2000001)},'VENUES_RESPONSE_TOO_LARGE'],
 [{body:{ok:false,code:'INVALID_SIGNATURE',error:'private key material'}},'INVALID_SIGNATURE'],
 [{body:{ok:false,code:'REGISTER_INVALID',error:'private row values'}},'REGISTER_INVALID'],
 [{body:{ok:false,code:'SECRET_PRIVATE_DATA',error:'private details'}},'VENUES_SOURCE_UNAVAILABLE'],
 [{body:{ok:true,data:{venues:[room,room]}}},'VENUES_CATALOGUE_INVALID']
]){
 const f=fixture(options),result=f.status();assert.equal(result.status,'unavailable');assert.equal(result.code,code);
 assert(!/private-value|private backend response|private login|private key material|private row values|private details|SECRET_PRIVATE_DATA|\/s\/synthetic\/|k{33}/.test(JSON.stringify(result)),'Only fixed safe diagnostic fields may escape');
 assert.equal(f.audit.writes,0);assert.equal(f.status().code,code);assert(f.calls()<=1,'One request-local lookup only');
 const catalogue=f.sandbox.calendarVenueCatalogue_(f.actor('admin'));assert.deepEqual(JSON.parse(JSON.stringify(catalogue.venues)),[]);assert.equal(catalogue.venueSource.code,undefined,'Normal catalogue consumers do not receive technical diagnostics');
}
{
 const f=fixture(),result=f.status();assert.equal(result.status,'ready');assert.equal(result.venueCount,1);assert.equal(result.code,'READY');assert.equal(f.calls(),1);assert.equal(f.audit.writes,0);
}
{
 const f=fixture();f.sandbox.UrlFetchApp.fetch=()=>{throw new Error('private transport URL and token');};assert.equal(f.status().code,'VENUES_TRANSPORT_FAILED');
}
{
 const f=fixture({url:null});
 assert.throws(()=>f.call('healthCheck',{year:2026},'teacher'),/admin/i);assert.equal(f.calls(),0);
 const result=f.call('healthCheck',{year:2026});assert.equal(result.venueDirectory.code,'VENUES_URL_MISSING');assert(result.venueDirectory.message.includes('VENUES_APPS_SCRIPT_URL'));
}
console.log('PASS Calendar venue diagnostics: safe configuration/HTTP/source/catalogue distinctions, 33-character key, request-local reuse and no private response disclosure');
