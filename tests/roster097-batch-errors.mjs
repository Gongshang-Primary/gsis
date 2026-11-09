import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHmac,randomUUID,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),R=require('../shared/roster.js');
globalThis.crypto??=webcrypto;
const gateway=await import(toWorkerModuleURL('data:text/javascript;base64,'+fs.readFileSync('roster-update/public/_worker.js').toString('base64')));
const origin='https://roster.test',env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/roster/exec',GSIS_SECRET:'synthetic-batch-read-bridge-secret-0123456789'};
const from=new Date(Date.now()+8*3600000).toISOString().slice(0,10),dates=Array.from({length:31},(_,i)=>new Date(Date.parse(from)+i*86400000).toISOString().slice(0,10)),to=dates.at(-1),key='a'.repeat(64);
const week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:2,maxPeriod:1,blocks:[{name:'Alice',cells:Array.from({length:10},()=>['EL','4A','Room',''])}]};
const model=R.validate({layoutMode:'single-week',single:week,timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:1},recesses:[]});
const baseline={schema:1,stage:'baseline',from,to,baselineKey:key,registerRevision:1,entries:[{id:'base',name:'Base',from,to,priority:1}],models:[{id:'base',model}],dates:dates.map(date=>({date,baselineId:'base'}))};
const suspended={schema:1,stage:'suspended',from,to,baselineKey:key,registerRevision:1,operationsRevision:1,plans:[],datesView:{revision:1,confirmedAccess:'available',dates:[]}};
function envelope(payload){const data=JSON.stringify(payload);return {schema:1,stage:payload.stage,from,to,baselineKey:key,key:'b'.repeat(64),bytes:Buffer.byteLength(data),encoding:'json-v1',data};}
let changed=true,mode='normal';const calls=[];
const box=vm.createContext({GSIS_DEPLOY_VERSION:'test',GSISSheets:{resetStats(){}},Utilities:{getUuid:randomUUID},props_:()=>({getProperty:name=>name==="GSIS_SECRET"?env.GSIS_SECRET:null}),signature_:(payload,secret)=>createHmac('sha256',secret).update(payload).digest('hex'),same_:(a,b)=>a===b,out_:x=>JSON.stringify(x),error_:(status,message)=>{throw Object.assign(Error(message),{status});},rosterDiagnostic_(){},rosterDiagnosticError_:()=>'',rosterDiagnosticText_:()=>'',rosterStage_(){},rosterFailureDetail_:()=>({}),contacts_:()=>({}),rosterDispatch_:req=>{
 const input=req.input;
 if(mode.startsWith('ALLOCATION_'))throw Object.assign(Error('Allocation status requires recovery.'),{status:409,code:mode});
 if(mode==='cancel'){assert.equal(input.operation,'cancelAllocationRun');assert.deepEqual(JSON.parse(JSON.stringify(input.calendarByDate)),{});return {cancellation:'accepted'};}
 assert.equal(input.operation,'timetableBatch');assert.equal(input.requestId,undefined);assert.deepEqual(JSON.parse(JSON.stringify(input.calendarByDate)),{});calls.push(input.stage);
 if(mode==='large')throw Object.assign(Error('This timetable preload is too large.'),{status:413,code:'TIMETABLE_BATCH_TOO_LARGE'});
 if(mode==='private')throw Object.assign(Error('Cannot load.'),{status:409,code:'PRIVATE_INTERNAL_CODE'});
 if(input.stage==='suspended'&&changed){changed=false;box.rosterTimetableBatchChanged_();}
 return envelope(input.stage==='baseline'?baseline:suspended);
}});
box.PropertiesService={getScriptProperties:()=>box.props_()};
vm.runInContext(fs.readFileSync('backend/ApiSecret.gs','utf8'),box);
require('./load-backend-role.cjs')(box,'roster');
require('./helpers/load-roster-diagnostic-build.cjs')(box);
const source=fs.readFileSync('backend/Code.gs','utf8'),start=source.indexOf('function doPost(e){');vm.runInContext(source.slice(start,source.indexOf('\nfunction auth_',start)),box);vm.runInContext(fs.readFileSync('backend/RosterTimetableBatch.gs','utf8'),box);
const now=Date.now(),signed=await gateway.sign({purpose:'gsis-session-v1',origin,email:'alice@gsps.edu.sg',subject:'synthetic',issued:now,expires:now+60000},env.GSIS_SECRET+'|gsis-browser-session-v1|'+origin),cookie='__Host-gsis_session='+Buffer.from(signed.payload).toString('base64url')+'.'+signed.signature;
const oldFetch=globalThis.fetch,oldError=console.error,oldInfo=console.info;console.error=console.info=()=>{};
globalThis.fetch=async(url,options)=>{assert.equal(String(url),env.APPS_SCRIPT_URL);return new Response(box.doPost({postData:{contents:options.body}}),{headers:{'Content-Type':'application/json'}});};
async function request(input){const response=await gateway.default.fetch(new Request(origin+'/api/operations',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:JSON.stringify(input)}),env,{waitUntil:()=>assert.fail('A preload must not dispatch background writes')});return {status:response.status,body:await response.json()};}
try{
 const first=await request({operation:'timetableBatch',stage:'suspended'});assert.equal(first.status,409);assert.equal(first.body.code,'TIMETABLE_BATCH_CHANGED','real doPost and gateway must retain the recovery code');
 mode='large';const large=await request({operation:'timetableBatch',stage:'baseline'});assert.equal(large.status,413);assert.equal(large.body.code,'TIMETABLE_BATCH_TOO_LARGE');
 mode='private';const hidden=await request({operation:'timetableBatch',stage:'baseline'});assert.equal(hidden.body.code,undefined,'undeclared internal codes remain private');
 for(const code of ['ALLOCATION_IN_PROGRESS','ALLOCATION_UNCONFIRMED','ALLOCATION_CANCELLED','ALLOCATION_ABANDONED','ALLOCATION_CUTOFF']){mode=code;const result=await request({operation:'allocationVersion',date:from,statusOnly:true});assert.equal(result.status,409);assert.equal(result.body.code,code,'run recovery code survives real signed serialization');}
 mode='cancel';const cancelled=await request({operation:'cancelAllocationRun',date:from,runId:key,requestId:randomUUID()});assert.equal(cancelled.body.ok,true);assert.equal(cancelled.body.data.cancellation,'accepted','cancellation must not depend on Calendar availability');
 mode='normal';changed=true;calls.length=0;
 const client={window:{},Blob,DecompressionStream,TextEncoder,TextDecoder,Uint8Array,atob,setTimeout,GSISRoster:R};vm.createContext(client);vm.runInContext(fs.readFileSync('roster-update/public/roster-timetable-preload.js','utf8'),client);
 const cache=client.window.RosterTimetablePreload.create({scope:'alice|teacher',today:from,api:async(route,input)=>{assert.equal(route,'operations');const result=await request(input);if(!result.body.ok)throw Object.assign(Error(result.body.error),{status:result.status,code:result.body.code});return result.body.data;}});
 assert.equal((await cache.start()).phase,'ready');assert.deepEqual(calls,['baseline','suspended','baseline','suspended']);assert(cache.getBaseline(to));
 console.log('PASS batch errors cross real signed doPost and gateway; client restarts both read stages once, oversize stays typed and internal codes remain private.');
}finally{globalThis.fetch=oldFetch;console.error=oldError;console.info=oldInfo;}
