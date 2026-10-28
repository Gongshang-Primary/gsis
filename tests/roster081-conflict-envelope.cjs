const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const source=fs.readFileSync('backend/Code.gs','utf8'),start=source.indexOf('function doPost(e){'),end=source.indexOf('\nfunction auth_',start);
let failure;
const scope=vm.createContext({GSIS_DEPLOY_VERSION:'test',GSISSheets:{resetStats(){}},Utilities:{getUuid:crypto.randomUUID},PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='BRIDGE_SECRET'?'x'.repeat(32):null})},props_:()=>({getProperty:()=> 'x'.repeat(32)}),signature_:()=> 'signed',same_:(a,b)=>a===b,out_:x=>x,error_:(status,message)=>{throw Object.assign(Error(message),{status});},rosterDiagnostic_(){},rosterDiagnosticError_:()=> 'safe diagnostic',rosterDiagnosticText_:()=> '',rosterStage_(){},contacts_:()=>({}),rosterDispatch_:()=>{throw failure;}});
const detail=fs.readFileSync('backend/Roster.gs','utf8');vm.runInContext(detail.slice(detail.indexOf('function rosterFailureDetail_'),detail.indexOf('function rosterDiagnosticLog_')),scope);
require('./helpers/load-roster-diagnostic-build.cjs')(scope);
require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(fs.readFileSync('backend/ApiSecret.gs','utf8'),scope);vm.runInContext(source.slice(start,end),scope);
const send=()=>{const payload=JSON.stringify({action:'rosterOperations',identity:{email:'teacher@gsps.edu.sg',subject:'synthetic'},input:{operation:'publish'},timestamp:Date.now(),nonce:crypto.randomUUID()});return scope.doPost({postData:{contents:JSON.stringify({payload,signature:'signed'})}});};
for(const code of ['DAY_CONFLICT','PUBLICATION_CONFLICT','CONTACTS_RECOVERY_REQUIRED','ABSENCE_CONFLICT']){
 failure=Object.assign(Error('Review the selected day.'),{status:409,code});const response=send();assert.equal(response.status,409);assert.equal(response.code,code);assert.equal(response.error,failure.message);
}
failure=Object.assign(Error('Review this save.'),{status:409,code:'UNTRUSTED_INTERNAL_DETAIL'});assert.equal(send().code,undefined,'Only declared public error codes cross the API boundary');
console.log('PASS typed daily conflicts survive real doPost envelope; undeclared codes remain private');
