'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const I=require('../shared/roster-inbox.js'),O=require('../shared/roster-operations.js');
function fixture(){
 let durable=I.initial(),held=false,clock=Date.parse('2026-10-21T08:00:00+08:00'),duty=['old'],contactsHook=null,denyContacts=false;
 const stats={contacts:0,contactsInsideLock:0,locks:0,writes:0,lockedMs:0},trace=[];
 const people=[{id:'old',name:'Old duty',active:true,role:'KP',mobile:'91234567'},{id:'new',name:'New duty',active:true,role:'KP',mobile:'92345678'}],contacts={rosterPeople:people,rosterSMCIds:['old','new'],rosterAdminIds:[]};
 const advance=ms=>{clock+=ms;if(held)stats.lockedMs+=ms;};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const scope=vm.createContext({Date:Clock,GSISRosterInbox:I,GSISRosterOperations:O,ROSTER_DATA:'folder',Utilities:{getUuid:crypto.randomUUID},props_:()=>({getProperty:()=> 'inbox-file'}),rosterFindFile_:()=>null,rosterReadFile_:()=>{assert(held);trace.push('inbox-read');advance(5);return JSON.stringify(durable);},rosterDriveRequest_:(_url,options)=>{assert(held);advance(10);stats.writes++;durable=JSON.parse(options.payload);},LockService:{getScriptLock:()=>({})},deployLock_:()=>{assert(!held);trace.push('lock');held=true;stats.locks++;return true;},deployUnlock_:()=>{assert(held);trace.push('unlock');held=false;},error_:(status,message)=>{throw Object.assign(Error(message),{status});},rosterOperationsDigest_:p=>crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex'),rosterOperationsState_:()=>{assert(held,'duty authority must be sampled from the locked latest document');trace.push('duty-read');advance(5);return {...O.initial(),smcDutyRoster:[{date:'2026-10-21',staffIds:[...duty]}]};},rosterServiceContacts_:()=>{stats.contacts++;stats.contactsInsideLock+=Number(held);trace.push('contacts');advance(100);if(denyContacts)throw Object.assign(Error('Contacts unavailable'),{status:503});if(contactsHook){const hook=contactsHook;contactsHook=null;hook();}return {c:contacts};}});
 require('./load-backend-role.cjs')(scope,'roster');vm.runInContext(fs.readFileSync('backend/RosterInbox.gs','utf8'),scope);
 return {call:input=>scope.rosterInboxServiceDispatch_({input}),stats,trace,state:()=>durable,changeDutyDuringContacts(){contactsHook=()=>{assert(!held,'unrelated Roster writers can run while Contacts is read');duty=['new'];};},deny(){denyContacts=true;},held:()=>held};
}
{
 const f=fixture();f.changeDutyDuringContacts();const result=f.call({operation:'inboxIngest',message:{id:'incoming-1',from:'6593456789',timestamp:Date.parse('2026-10-21T08:00:00+08:00')/1000,type:'text',text:'Please help'}});
 assert.equal(f.stats.contactsInsideLock,0,'remote Contacts wait must not hold the Roster writer lock');
 assert.deepEqual(f.trace,['contacts','lock','inbox-read','duty-read','unlock']);
 assert.equal(result.alerts.length,1);assert.equal(f.state().alerts.find(alert=>alert.id===result.alerts[0].alertId).recipientId,'new','a duty change during remote preparation must use the locked latest duty');
 assert.equal(f.stats.lockedMs,20,'synthetic 100 ms remote wait excluded; latest inbox/duty reads and commit stay locked');
 const writes=f.stats.writes;f.call({operation:'inboxIngest',message:{id:'incoming-1',from:'6593456789',timestamp:Date.parse('2026-10-21T08:00:00+08:00')/1000,type:'text',text:'Please help'}});assert.equal(f.stats.writes,writes,'ingest retry stays idempotent');
}
{
 const f=fixture();f.deny();assert.throws(()=>f.call({operation:'inboxPendingDispatch'}),{status:503});assert.equal(f.stats.locks,0,'failed authority lookup never blocks other writers');assert.equal(f.stats.writes,0);assert.equal(f.held(),false);
}
{
 const f=fixture();f.call({operation:'inboxDelivery',eventId:'delivery-1',state:'delivered',messageId:'unknown'});assert.equal(f.stats.contacts,0,'signed delivery receipt does not fetch unused Contacts');assert.equal(f.stats.locks,1);assert.equal(f.held(),false);
}
console.log('PASS Inbox service lock scope: remote Contacts outside lock, latest locked duty after concurrent change, idempotent ingest, denied source before lock, receipt-only path. Synthetic locked cost 120 ms → 20 ms; not production timing.');
