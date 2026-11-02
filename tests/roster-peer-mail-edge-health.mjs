import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {GSiSEdgeStore} from '../roster-update/public/edge-store.js';
import {GSISRosterOperations as O,GSiSEdgeNotifications as N} from '../roster-update/public/edge-roster-domain.js';
import {dispatchEdgePeerMail,edgeDispatchHasWork} from '../roster-update/public/edge-notifications.js';
const require=createRequire(import.meta.url),database=require('./helpers/chunked-import-db.cjs'),db=database(),token=row=>createHash('sha256').update(JSON.stringify(N.peerMailReviewFields(row))).digest('hex');
async function activate(scope,state){const store=GSiSEdgeStore.open(db,scope),head=await store.importState({state,actor:'setup',requestId:crypto.randomUUID()});await store.transition({from:'imported',to:'active',expectedRevision:head.revision,actor:'setup',proof:{legacyWritesDisabled:true,sourceDigest:head.sourceDigest,verifiedRecords:head.importedRecords}});return store;}
const state=O.initial(),mail={id:'mail',requestId:'old',recipientId:'teacher',recipientName:'Teacher',date:'2026-11-01',email:'private@gsps.edu.sg',status:'uncertain',fingerprint:'proposal',claimId:'claim',preparedAt:100,completedAt:'2026-11-01T00:00:00Z',attempts:1,error:'unknown'};
state.peerMail=[mail];const store=await activate('roster',state);await activate('roster-register',{entries:[],revision:0});await activate('roster-references',{schema:1,contacts:{rosterPeople:[],rosterSMCIds:[],rosterAdminIds:[]},contactsCheckedAt:Date.now(),calendarByDate:{}});
const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_PUBLIC_ORIGIN:'https://roster.test'},send=()=>assert.fail('uncertain provider submission must never be retried');
async function change(fn){const old=await store.load(),next=structuredClone(old.state);fn(next);await store.commit({before:old.state,after:next,expectedRevision:old.revision,actor:'setup',requestId:crypto.randomUUID(),digest:await GSiSEdgeStore.digest(next),result:{}});}
const first=await dispatchEdgePeerMail(env,send);assert.equal(first.newUncertain,1);assert.equal(first.uncertain,1);assert.equal(first.reviewedUncertain,0);
let saved=(await store.load()).state;assert.equal(saved.smcAlerts.length,1);const original=structuredClone(saved.peerMail[0]);
assert.equal(await edgeDispatchHasWork(env,'peerMail'),false);const revision=(await store.head()).revision;
assert.equal((await dispatchEdgePeerMail(env,send)).newUncertain,0);assert.equal((await store.head()).revision,revision,'settled uncertainty stays a primary idle read');
await change(s=>{s.peerMail[0].reviewReceipt={schema:1,fingerprint:token(s.peerMail[0])};});
assert.equal(await edgeDispatchHasWork(env,'peerMail'),true,'a reviewed open alert still needs resolution');
const reviewed=await dispatchEdgePeerMail(env,send);assert.equal(reviewed.uncertain,0);assert.equal(reviewed.reviewedUncertain,1);assert.equal(reviewed.newUncertain,0);
saved=(await store.load()).state;assert.equal(saved.smcAlerts[0].status,'resolved');assert.equal(await edgeDispatchHasWork(env,'peerMail'),false,'reviewed uncertainty does not reopen on every tick');
assert.deepEqual(Object.fromEntries(Object.entries(saved.peerMail[0]).filter(([k])=>!['reviewReceipt'].includes(k))),original,'review only records metadata and retains provider evidence');
await change(s=>{s.peerMail[0].error='changed result';s.peerMail.push({...mail,id:'second'});});
assert.equal(await edgeDispatchHasWork(env,'peerMail'),true,'same queue length cannot conceal changed evidence');
const changed=await dispatchEdgePeerMail(env,send);assert.equal(changed.newUncertain,2);assert.equal(changed.uncertain,2);assert.equal(changed.reviewedUncertain,0);assert.equal((await store.load()).state.smcAlerts.length,2,'each delivery keeps one alert');assert.equal(await edgeDispatchHasWork(env,'peerMail'),false);
console.log('PASS real D1 peer-mail health: one failure per evidence, reviewed receipts, alert resolution/reopening, idle primary shortcut and no sends');
