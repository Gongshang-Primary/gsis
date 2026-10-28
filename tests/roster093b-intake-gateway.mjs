import {toWorkerModuleURL} from './helpers/worker-module.cjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
process.on('uncaughtException',error=>{console.error(error.stack.replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'worker-source'));process.exitCode=1;});
const M=await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('roster-update/public/_worker.js','utf8')).toString('base64')));
const env={APPS_SCRIPT_URL:'https://script.google.com/macros/s/roster/exec',BRIDGE_SECRET:'fixture-bridge-'.repeat(4),ROSTER_SERVICE_SECRET:'fixture-service-'.repeat(4),CALENDAR_APPS_SCRIPT_URL:'https://script.google.com/macros/s/calendar/exec',CALENDAR_PROXY_SECRET:'fixture-calendar-'.repeat(4)},who={email:'alice@gsps.edu.sg',subject:'alice'},date='2026-10-26',requestId='11111111-1111-4111-8111-111111111111';
let calls=[];
globalThis.fetch=async()=>{throw Error('Capture must not call Calendar');};
const capture=await M.trustedOperationsInput({operation:'saveAbsence',intake:true,requestId,from:'2026-01-01',to:'2026-12-31',fullDay:true,calendarByDate:{forged:true},identity:{email:'forged'},service:'forged'},env,who);
assert.deepEqual(capture.calendarByDate,{});assert.equal(capture.identity,undefined);assert.equal(capture.service,undefined);assert.equal(capture.intake,true);
await M.trustedOperationsInput({operation:'requestMutual',intake:true,requestId,date},env,who);
await M.trustedOperationsInput({operation:'read',view:'intake',date},env,who);
await assert.rejects(M.trustedOperationsInput({operation:'publish',intake:true,date},env,who),/intake|capture/i);
assert.equal(typeof M.dispatchAbsenceIntake,'function');
let jobs=[{requestId,claimId:'claim',identity:who,command:{operation:'saveAbsence',intake:true,requestId,date,staffId:'alice',typeId:'mc',periods:[2]},dates:[date]}],calendarFails=false;
globalThis.fetch=async(url,init)=>{
 const envelope=JSON.parse(init.body);
 if(String(url)===env.CALENDAR_APPS_SCRIPT_URL){calls.push('calendar');if(calendarFails)throw Error('Calendar unavailable');return Response.json({ok:true,result:{date,schoolDay:true,parity:'odd'}});}
 const request=JSON.parse(envelope.payload);assert.equal(request.action,'rosterService');const p=request.input;calls.push(p.operation);
 if(p.operation==='nextAbsenceIntake')return Response.json({ok:true,data:{job:jobs.shift()||null}});
 if(p.operation==='processAbsenceIntake'){assert.equal(p.command,undefined);assert.equal(p.identity,undefined);assert.equal(p.calendarByDate[date].schoolDay,true);assert.equal(p.requestId,requestId);assert.equal(p.claimId,'claim');return Response.json({ok:true,data:{intakeState:'applied',absenceApplied:true,notificationsQueued:1}});}
 if(p.operation==='deferAbsenceIntake'){assert.equal(p.reasonCode,'CALENDAR_UNAVAILABLE');return Response.json({ok:true,data:{intakeState:'pending'}});}
 throw Error('Unexpected service operation '+p.operation);
};
const applied=await M.dispatchAbsenceIntake(env,{limit:1});assert.equal(applied.applied,1);assert.equal(applied.notificationsQueued,1);assert.deepEqual(calls,['nextAbsenceIntake','calendar','processAbsenceIntake']);
jobs=[{requestId,claimId:'claim',identity:who,command:{operation:'saveAbsence',intake:true,requestId,date,staffId:'alice',typeId:'mc',periods:[2]},dates:[date]}];calls=[];calendarFails=true;
const deferred=await M.dispatchAbsenceIntake(env,{limit:1});assert.equal(deferred.deferred,1);assert.deepEqual(calls,['nextAbsenceIntake','calendar','deferAbsenceIntake']);
console.log('PASS independent intake gateway: capture skips Calendar; server authority replaces client fields; only claimed jobs process; Calendar failure retains durable work; drain runs without allocation enabled.');
