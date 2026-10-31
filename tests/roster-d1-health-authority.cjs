'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Health authentication must remain available after the Google writer fence.
// The caller's signed dispatch supplies fresh Contacts authority on each call.
const forbidden=()=>assert.fail('health authority must not read or mutate Roster storage');
const scope={console,gsisBackendKind_:()=>'deploy',gsisRequireBackendRole_:role=>assert.equal(role,'roster'),rosterEdgeAssertLegacyWrite_:forbidden,props_:()=>({getProperty:()=> 'd1',setProperty:forbidden}),rosterOperationsState_:forbidden,rosterIndex_:forbidden,rosterReadFile_:forbidden,LockService:{getScriptLock:forbidden},error_:(status,message)=>{throw Object.assign(Error(message),{status});}};
vm.createContext(scope);vm.runInContext(fs.readFileSync('backend/RosterOperations.gs','utf8'),scope);vm.runInContext(fs.readFileSync('backend/RosterEdgeMigration.gs','utf8'),scope);vm.runInContext(fs.readFileSync('backend/Roster.gs','utf8'),scope);scope.rosterStage_=()=>{};scope.gsisBackendKind_=()=>'roster';
const req={action:'rosterOperations',identity:{email:'staff@example.test'},input:{operation:'edgeHealthAuthority'}},context=(smc,admin)=>({rosterPeople:[{id:'staff',active:true}],user:{rosterStaffId:'staff',rosterSMC:smc,rosterAdmin:admin}});
for(const [smc,admin]of [[true,false],[false,true],[true,true],[false,false]]){const value=scope.rosterDispatch_(req,context(smc,admin));assert.equal(value.user.smc,smc);assert.equal(value.user.admin,admin);assert.deepEqual(Object.keys(value),['user']);assert.equal(value.user.email,req.identity.email);}
assert.throws(()=>scope.rosterEdgeMigrationDispatch_(req,{rosterPeople:[],user:{rosterSMC:'true',rosterAdmin:false}}),e=>e.status===503,'unverified authority is not inferred');
assert.throws(()=>scope.rosterDispatch_({...req,action:'rosterUpload'},context(true,true)),e=>e.status===409,'the permission probe cannot bypass the fence for another action');
const fresh=context(true,false);assert(scope.rosterEdgeMigrationDispatch_(req,fresh).result.user.smc);fresh.user.rosterSMC=false;assert.equal(scope.rosterEdgeMigrationDispatch_(req,fresh).result.user.smc,false,'revocation is read fresh, not cached');
console.log('PASS fenced health authority: fresh SMC/Admin role projection only, no Roster reads/writes/locks, revoked and malformed authority retained.');
