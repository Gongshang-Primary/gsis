'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),acorn=require('acorn'),drive=require('./helpers/roster-daily-drive.cjs');
const f=drive(Date.now()),scope=f.sandbox,source=fs.readFileSync('backend/Code.gs','utf8');
function loadFunction(path,name){const text=fs.readFileSync(path,'utf8'),node=acorn.parse(text,{ecmaVersion:2020}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert(node,name);vm.runInContext(text.slice(node.start,node.end),scope);}
const secret='synthetic-service-secret-32-characters',sign=raw=>crypto.createHmac('sha256',secret).update(raw).digest('hex');
Object.assign(scope,{GSIS_DEPLOY_VERSION:'0.9.9n',GSISSheets:{resetStats(){}},rosterDiagnosticBuild_:()=> 'test',rosterDiagnostic_:()=>{},rosterDiagnosticError_:()=>'',rosterDiagnosticText_:()=>'',rosterAbsenceFailureDetail_:()=>({}),gsisApiSecret_:()=>secret,same_:(a,b)=>a===b,signature_:sign,gsisRequireBackendAction_:()=>{},out_:x=>x});
for(const [path,name] of [['backend/Code.gs','doPost'],['backend/Roster.gs','rosterFailureDetail_'],['backend/RosterOperations.gs','rosterServiceDispatch_']])loadFunction(path,name);
function call(input,badSignature=false){const payload=JSON.stringify({action:'rosterService',service:'gsis-roster-notifier-v1',input,timestamp:Date.now(),nonce:crypto.randomUUID()});return scope.doPost({postData:{contents:JSON.stringify({payload,signature:badSignature?'invalid':sign(payload)})}});}
const fetch=scope.UrlFetchApp.fetch;
scope.UrlFetchApp.fetch=(url,options)=>url.includes('/upload/')?{getResponseCode:()=>403,getContentText:()=>JSON.stringify({error:{status:'PERMISSION_DENIED',code:403,message:'Writer lacks permission. token=SECRET https://school.test/private#SECRET'}})}:fetch(url,options);
const p=f.payload('fixture audit',{date:new Date(Date.now()+28800000).toISOString().slice(0,10)}),result=call(p);
assert.equal(result.ok,false);assert.equal(result.code,'ROSTER_DRIVE_OUTPUT');assert.equal(result.googleCode,'PERMISSION_DENIED');assert.match(result.error,/Writer lacks permission/);assert(!result.error.includes('SECRET'));assert(result.error.length<=300);
scope.UrlFetchApp.fetch=()=>{throw Error('Unexpected writer error password=SECRET\nprivate stack');};const unexpected=call(p);assert.match(unexpected.error,/Unexpected writer error/);assert(!unexpected.error.includes('SECRET'));assert(!unexpected.error.includes('stack'));
const denied=call(p,true);assert.equal(denied.status,401);assert(!denied.error.includes('Unexpected writer'));
console.log('real signed doPost/service/writer path retains sanitized provider and unexpected errors; untrusted calls reveal no writer detail');
