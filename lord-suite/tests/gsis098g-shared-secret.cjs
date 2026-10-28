'use strict';
// Synthetic credentials only. These checks exercise the existing proxy and
// GSiS reference boundaries without making any network request.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {harness}=require('./backend_harness.cjs');
const {fixture}=require('./run_gsis_bridge_checks.cjs');
const shared='S'.repeat(32),legacy='legacy-proxy-fixture';
const tests=[];function test(name,run){tests.push([name,run]);}
test('GSIS_SECRET alone authenticates the proxy and satisfies configuration',()=>{
 const h=harness({properties:{GSIS_SECRET:shared,LORD_PROXY_SECRET:null}}),c=h.ctx;
 assert.doesNotThrow(()=>c.requireProxySecret_(shared));
 assert.equal(c.lordConfigurationStatus_().ready,true);
 assert.throws(()=>c.requireProxySecret_('wrong'),/Unauthorised/);
 const result=JSON.parse(c.doGet({parameter:{action:'reference',proxySecret:shared}}).content);
 assert.equal(result.ok,true,result.error);
 assert(!JSON.stringify(h.logs).includes(shared));
});
test('Configured shared secret takes precedence over legacy proxy bytes',()=>{
 const h=harness({properties:{GSIS_SECRET:shared,LORD_PROXY_SECRET:legacy}}),c=h.ctx;
 assert.doesNotThrow(()=>c.requireProxySecret_(shared));
 assert.throws(()=>c.requireProxySecret_(legacy),/Unauthorised/);
});
test('Malformed configured shared secret fails closed without legacy fallback',()=>{
 for(const invalid of ['', ' ', 'X'.repeat(31), 'X'.repeat(8001), 'X'.repeat(31)+' ', 'X'.repeat(31)+'\n','X'.repeat(32)+'\n','X'.repeat(32)+'\r\n','X'.repeat(31)+'é']){
  const h=harness({properties:{GSIS_SECRET:invalid,LORD_PROXY_SECRET:legacy}}),c=h.ctx;
  assert.throws(()=>c.requireProxySecret_(legacy),e=>e.code==='GSIS_SECRET_INVALID'&&e.status===503&&!e.message.includes(legacy));
 }
});
test('Unset shared secret preserves legacy proxy credentials and exact peppers',()=>{
 const h=harness({properties:{LORD_PROXY_SECRET:legacy,LORD_BOOKING_TOKEN_PEPPER:' exact original pepper '}}),c=h.ctx;
 assert.doesNotThrow(()=>c.requireProxySecret_(legacy));
 assert.equal(c.LORD_CONFIG.BOOKING_TOKEN_PEPPER,' exact original pepper ');
 h.properties.GSIS_SECRET=shared;h.reset();
 assert.equal(c.LORD_CONFIG.BOOKING_TOKEN_PEPPER,' exact original pepper ');
});
test('Outbound GSiS requests sign with shared secret without LORD_BRIDGE_SECRET',()=>{
 const h=fixture(),c=h.ctx;h.properties.GSIS_SECRET=shared;delete h.properties.LORD_BRIDGE_SECRET;
 let calls=0;c.UrlFetchApp.fetch=(url,options)=>{
  calls++;const env=JSON.parse(options.payload),r=JSON.parse(env.payload);
  assert.equal(env.signature,crypto.createHmac('sha256',shared).update(env.payload).digest('hex'));
  assert.equal(r.action,'lordService');assert.equal(r.source,'contacts');
  return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,data:h.source.contacts})};
 };
 assert.equal(c.gsisFetchSource_('contacts').source,'contacts');assert.equal(calls,1);
});
test('Invalid shared secret stops outbound calls even with valid legacy bridge',()=>{
 const h=fixture(),c=h.ctx;h.properties.GSIS_SECRET='short';let calls=0;
 c.UrlFetchApp.fetch=()=>{calls++;throw Error('must not fetch');};
 assert.throws(()=>c.gsisFetchSource_('contacts'),e=>e.code==='GSIS_SECRET_INVALID');assert.equal(calls,0);
});
test('Legacy cleanup preserves shared configuration and reports names only',()=>{
 const h=harness({properties:{GSIS_SECRET:shared}}),c=h.ctx;
 const report=c.cleanLegacyScriptPropertiesV1();assert(!report.deletedLegacyKeys.includes('GSIS_SECRET'));
 const inspection=c.inspectLORDV1ScriptProperties();assert(inspection.currentRuntimeKeys.includes('GSIS_SECRET'));
 assert(!JSON.stringify(h.warnings).includes(shared));
});
let passed=0;for(const[name,run]of tests){try{run();passed++;console.log('PASS '+name);}catch(e){process.exitCode=1;console.error('FAIL '+name+': '+e.message);}}
console.log(JSON.stringify({passed,failed:tests.length-passed}));
