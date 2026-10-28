const vm=require('vm'),fs=require('fs'),assert=require('assert/strict');const ctx=vm.createContext({});
vm.runInContext('const DEPLOY_SEED={legacy:true};',ctx);
const settings=require('../package.json'),backendVersion=settings.gsisComponentVersions?.deployBackend||settings.gsisRelease;
vm.runInContext(fs.readFileSync('Deploy_Backend_v'+backendVersion+'.gs','utf8'),ctx);
assert.equal(vm.runInContext('typeof doPost',ctx),'function');assert.equal(vm.runInContext('Array.isArray(GSIS_DEPLOY_EMBEDDED_SEED_04.venues)',ctx),true);
assert.equal(vm.runInContext('DEPLOY_SEED.legacy',ctx),true);
console.log('PASS single pasted backend parses with legacy Seed.gs present and owns separate embedded seed');
