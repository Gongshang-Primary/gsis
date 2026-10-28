'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const writes=[],logs=[],h=vm.createContext({
 deployTrace_:{rosterDiagnostic:true,requestId:'test-reference',action:'rosterProfile',authenticated:true,started:Date.now(),phase:'start'},
 console:{log:value=>logs.push(JSON.parse(value))},
 CacheService:{getScriptCache:()=>({put:(...args)=>writes.push(args)})}
});
require('./load-backend-role.cjs')(h,'roster');vm.runInContext(fs.readFileSync('backend/Roster.gs','utf8'),h);
for(const phase of ['contacts-fetch','contacts-json','contacts-result','contacts-authority','register-location','register-read','register-json','register-schema','register-ready','response-serialize','response-create'])h.rosterStage_(phase);
assert.equal(writes.length,0,'read phases must not incur synchronous CacheService writes');
assert.equal(logs.length,0,'read phases must not emit repeated persistent logs');
h.rosterDiagnostic_('roster-response-ready',{status:200});
assert.equal(writes.length,1);assert.equal(logs.length,1);
assert.equal(JSON.parse(writes[0][1]).phase,'response-create');
h.rosterStage_('contacts-json');h.rosterDiagnostic_('roster-backend-failed',{status:503,message:'invalid response'});
assert.equal(writes.length,3,'a failure retains latest metadata plus failure history');
assert.equal(logs.at(-1).phase,'contacts-json');assert.equal(logs.at(-1).diagnosticId,'test-reference');
assert.equal(JSON.parse(writes.at(-1)[1]).status,503);
h.deployTrace_.rosterDiagnostic=false;h.rosterStage_('unrelated');assert.equal(h.deployTrace_.phase,'contacts-json');
console.log('PASS Roster diagnostic phases stay in memory; final and failure records retain references and phases.');
