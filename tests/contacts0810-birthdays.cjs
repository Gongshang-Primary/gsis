'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),base=require('./contacts503-fixture.js');
const source=fs.readFileSync('Contacts_Code.gs','utf8')+'\n'+fs.readFileSync('backend/Contacts_Birthdays.gs','utf8');
const fixture=()=>base({source});
{
 const f=fixture(),result=f.post('calendarBirthdays');assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.data.complete,true);assert.equal(result.data.authoritative,true);assert.equal(result.data.count,181);assert.equal(result.data.people[0].name,'Person 0 (AE)','matches derived Contacts TTb name');assert.deepEqual(Object.keys(result.data.people[0]).sort(),['active','day','id','mk','month','name']);assert.equal(f.stats.writes.length,0);assert.equal(f.stats.lockAttempts.length,0);assert.equal(f.stats.flush,0);
 const row=f.sheets.get('contacts').data[1];row[f.headers.indexOf('Day of Birth')]='2';row[f.headers.indexOf('Month of birth')]='3';const updated=f.post('calendarBirthdays');assert.notEqual(updated.data.revision,result.data.revision);assert.equal(updated.data.people[0].day,'2');row[f.headers.indexOf('Day of Birth')]='';row[f.headers.indexOf('Month of birth')]='';const cleared=f.post('calendarBirthdays');assert.equal(cleared.data.people[0].day,'');assert.equal(cleared.data.people[0].month,'');
 assert.equal(f.post('calendarBirthdays',{},'person2@gsps.edu.sg').status,403);assert.equal(f.post('calendarBirthdays',{},'kp@gsps.edu.sg').ok,true);f.sheets.get('admin_users').data[1][2]='N';assert.equal(f.post('calendarBirthdays').status,403);
}
{
 const f=fixture();f.seedSnapshot([{id:'staff-1',field:'Basic Name',expected:'Person 1',value:'New'}]);const result=f.post('calendarBirthdays');assert.equal(result.ok,false);assert.equal(result.status,503);assert.match(result.error,/pending/i);
}
{
 const f=fixture();f.sheets.get('contacts').data[2][f.headers.indexOf('Staff ID')]='staff-0';assert.equal(f.post('calendarBirthdays').ok,false);
}
{
 const f=fixture();f.sheets.get('contacts').data[1][f.headers.indexOf('Staff ID')]='';assert.equal(f.post('calendarBirthdays').ok,false);
}
{
 const f=fixture();f.run("var changingMarker=0;contactViewMarker_=()=>String(++changingMarker)");assert.equal(f.post('calendarBirthdays').ok,false,'a source that changes across every bounded attempt cannot authorise Calendar deletion');
}
console.log('PASS Contacts birthday source: signed dispatch, fresh minimal derived source, explicit blank fields, revision, Admin/KP role, pending/unstable source and missing/duplicate identity fail closed');
