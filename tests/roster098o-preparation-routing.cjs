'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const names=['timetablePreparationManifest','timetablePreparationPart','timetablePreparationCheck'];
test('preparation exports use existing authenticated roster operations without Calendar reads',async()=>{
 const source=fs.readFileSync('roster-update/public/_worker.js','utf8'),fn=source.slice(source.indexOf('export async function trustedOperationsInput('),source.indexOf('\nfunction configuredSecret(',source.indexOf('export async function trustedOperationsInput('))).replace('export ','');
 let calendar=0,dates=0;const context=vm.createContext({edgeRosterEnabled:()=>false,operationDates:()=>{dates++;return ['2026-10-28'];},calendarDates:async()=>{calendar++;throw Error('Calendar unavailable');},notificationStatus:()=>({ready:false}),Object,Date,Promise,Number,Error});vm.runInContext(fn,context);
 for(const operation of names){const value=await context.trustedOperationsInput({operation,sourceKey:'a'.repeat(64),partId:'baseline:one',identity:{email:'forged'},calendarByDate:{forged:true}},{},{email:'admin@gsps.edu.sg'});assert.equal(value.operation,operation);assert.equal(value.identity,undefined);assert.equal(value.calendarByDate,undefined);assert.equal(value.trustedNow,undefined);}
 assert.equal(calendar,0);assert.equal(dates,0);
});
test('backend dispatch and release sync include read-only native preparation module',()=>{
 const code=fs.readFileSync('backend/Code.gs','utf8'),start=code.indexOf('function rosterOperationsDispatchCore_'),end=code.indexOf("if(p.intake===true",start),early=code.slice(start,end);
 assert.match(early,/rosterTimetablePreparationDispatch_\(req,c\)/);for(const name of names)assert(early.includes(name));
 assert(fs.readFileSync('scripts/build-release.py','utf8').includes('backend/RosterTimetablePreparation.gs'));
 assert(fs.readFileSync('backend/RosterOperations.gs','utf8').includes("if(['timetablePreparationManifest','timetablePreparationPart','timetablePreparationCheck'].includes(op))return rosterTimetablePreparationDispatch_(req,c)"),'Canonical module must preserve the route after release sync');
});
