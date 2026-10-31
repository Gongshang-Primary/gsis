import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {runRosterMirror,releaseRosterMirror} from '../roster-update/public/edge-roster-mirror.js';
import {sha256Hex} from '../roster-update/public/edge-deploy-sha256.js';
const require=createRequire(import.meta.url),Store=require('../shared/edge-store.js'),Mirror=require('../shared/roster-mirror.js'),database=require('./helpers/chunked-import-db.cjs'),backend=require('./helpers/roster-mirror-backend.cjs');

const db=database(),google=backend(),objects=new Map(),calls=[];
function object(kind,id,value){const text=JSON.stringify(value),digest=sha256Hex(text),reference={key:'gsis/roster/'+kind+'/'+id+'/'+digest+'.json.gz',digest,encoding:'gzip-json-v1'};objects.set(reference.key,gzipSync(text));return reference;}
const model={title:'Timetable',cells:['中文😀'.repeat(70000)]},modelReference=object('baseline','one',model),draft={schema:1,date:'2026-10-31',baselineId:'one',tiles:[]},draftReference=object('stapler','plan',draft),command={operation:'saved',requestId:'saved-command'},commandDigest=await Store.digest(command);
const state={schema:1,revision:1,types:[],absences:[{id:'absence',date:'2026-10-31',staffId:'one'}],adhoc:[],assignments:[{id:'manual',ownership:'smc'}],requests:[],outbox:[{id:'uncertain',status:'uncertain',attempts:1,messageId:'provider-id'}],audit:Array.from({length:15},(_,i)=>({id:'large-'+i,date:'2026-10-'+String(i+1).padStart(2,'0'),text:'x'.repeat(940000)})),receipts:[],deliveryEvents:[],notificationTransport:{leases:{},senderPacing:{lastAt:123}},inbox:{schema:1,revision:1},inboxThreads:[],inboxMessages:[{id:'inbox',status:'sent'}],inboxAudit:[],inboxReceipts:[],inboxDeliveryEvents:[],inboxAlerts:[],edgeStaplerLeases:{'2026-11-01':{actor:'teacher',expiresAt:123}},staplerPlans:[{id:'plan',date:'2026-10-31',draft:{edgeObject:true,...draftReference}}]};
const workbook=Buffer.from([80,75,3,4,1,2,3,4]),workbookBase64=workbook.toString('base64'),workbookKey='gsis/roster/workbooks/one/'+sha256Hex(workbookBase64)+'.xlsx';objects.set(workbookKey,workbook);
const index={schema:1,revision:1,entries:[{id:'one',modelObject:modelReference,modelObjectKey:modelReference.key,modelDigest:modelReference.digest,workbookKey}],receipts:[]};
google.files.set('live-operations',{parent:'data',name:'Roster operations.json',raw:JSON.stringify({schema:1,revision:0})});google.files.set('live-register',{parent:'data',name:'Roster register.json',raw:JSON.stringify({schema:1,revision:0,entries:[]})});
async function activate(scope,value){const store=Store.open(db,scope),imported=await store.importState({state:value,actor:'admin',requestId:'import-'+scope});await store.transition({from:'imported',to:'active',expectedRevision:imported.revision,actor:'admin',proof:{legacyWritesDisabled:true,sourceDigest:imported.sourceDigest,verifiedRecords:imported.importedRecords}});return store;}
const roster=await activate('roster',state),register=await activate('roster-register',index);let current=await roster.load();await roster.commit({before:current.state,after:current.state,expectedRevision:current.revision,actor:'teacher',requestId:command.requestId,digest:commandDigest,result:{saved:true,requestId:command.requestId}});
const registerBefore=await register.load(),registerCommand={operation:'metadata',id:'one',name:'Timetable edited',requestId:'metadata-command',revision:registerBefore.state.revision},registerDigest=await Store.digest(registerCommand);
await register.commit({before:registerBefore.state,after:registerBefore.state,expectedRevision:registerBefore.revision,actor:'teacher',requestId:registerCommand.requestId,digest:registerDigest,result:{savedId:'one',revision:registerBefore.revision+1}});
let losePage=true;
const bridge=async input=>{calls.push({step:input.step,chars:JSON.stringify(input).length});const reply=google.call(input);if(input.step==='page'&&losePage){losePage=false;throw Error('lost confirmed Google page');}return reply;};
const env={GSIS_JOBS:db,ROSTER_EDGE_AUTHORITY:'d1',ROSTER_TIMETABLE_SNAPSHOTS:{async get(key){const bytes=objects.get(key);assert(bytes,'unknown immutable object');return {body:new Blob([bytes]).stream()};}}};
const options={core:Mirror,bridge,maxSteps:64,budgetMs:180000};
await assert.rejects(runRosterMirror(env,options),/lost confirmed Google page/);assert.equal(google.properties.get('ROSTER_OPERATIONS_FILE'),'live-operations');
// Simulate the next permitted lease after the lost response; no source recapture.
db.sql.prepare("UPDATE gsis_roster_mirror_generations SET lease_until=0").run();
let mirrored;for(let n=0;n<8;n++){mirrored=await runRosterMirror(env,options);if(mirrored.mirrored)break;}assert(mirrored.mirrored,'real core/client/backend mirror completes');
assert.equal(google.properties.get('ROSTER_OPERATIONS_FILE'),'live-operations');assert.equal(google.properties.get('ROSTER_INDEX_FILE'),'live-register');
const firstProof=(await Mirror.status(db)).proof;assert(firstProof.verified);assert.equal(firstProof.snapshotDigest,mirrored.proof.snapshotDigest);
const backupHead=JSON.parse(google.properties.get('ROSTER_GOOGLE_BACKUP')),manifest=JSON.parse(google.scope.rosterMirrorRead_(backupHead.manifest));
const backed=google.scope.rosterSplitReadDocument_(manifest.documents.operations.fileId,true,true).value;
assert.equal(backed.audit.length,15);assert.equal(backed.audit[14].text,state.audit[14].text);assert.equal(backed.assignments[0].ownership,'smc');assert.equal(backed.outbox[0].status,'uncertain');assert.equal(backed.outbox[0].messageId,'provider-id');assert.deepEqual(JSON.parse(JSON.stringify(backed.staplerPlans[0].draft)),draft);
const blocked=await releaseRosterMirror(env,{...options,requestId:'release-one',quiescent:async()=>false});assert.equal(blocked.phase,'blocked');assert.equal((await Mirror.status(db)).phase,'normal');
let released;for(let n=0;n<8;n++){released=await releaseRosterMirror(env,{...options,requestId:'release-one',quiescent:async()=>true});if(released.released)break;}assert(released.released,'real core/client/backend release completes');
assert.equal(google.properties.get('ROSTER_EDGE_AUTHORITY'),undefined);assert.equal(env.ROSTER_EDGE_AUTHORITY,'d1','execution never changes the Pages variable');assert.equal((await Mirror.status(db)).phase,'released');
const native=google.scope.rosterOperationsState_(true),nativeIndex=google.scope.rosterIndex_();assert.equal(native.audit.length,15);assert.deepEqual(JSON.parse(google.scope.rosterNativeRead_(nativeIndex.entries[0].modelFile)),model);
assert(nativeIndex.entries[0].workbookFile,'native source workbook remains downloadable');assert.equal(nativeIndex.entries[0].workbookKey,undefined);assert.deepEqual(google.files.get(nativeIndex.entries[0].workbookFile).bytes,workbook);
const receipt=native.receipts.find(row=>row.id===command.requestId);assert(receipt);assert(google.scope.rosterNativeReceiptMatches_(receipt,command,'teacher'));
const registerReceipt=nativeIndex.receipts.find(row=>row.id===registerCommand.requestId);assert(registerReceipt);assert.equal(registerReceipt.edgeDigest,registerDigest);assert.equal(registerReceipt.savedId,'one');assert(google.scope.rosterNativeReceiptMatches_(registerReceipt,registerCommand,'teacher'));
native.revision++;native.audit.push({id:'new-google-write',date:'2026-11-01',text:'after release'});google.scope.rosterOperationsCommit_(native);
assert.equal(google.scope.rosterOperationsState_(true).audit.at(-1).id,'new-google-write');nativeIndex.revision++;nativeIndex.entries[0].name='Native edit';google.scope.rosterCommit_(nativeIndex);assert.equal(google.scope.rosterIndex_().entries[0].name,'Native edit');
const finalPointer=google.properties.get('ROSTER_OPERATIONS_FILE');assert((await releaseRosterMirror(env,{...options,requestId:'release-one',quiescent:async()=>false})).released);assert.equal(google.properties.get('ROSTER_OPERATIONS_FILE'),finalPointer,'release replay does not rewind a native Google save');
assert(calls.filter(row=>row.step==='page').length>10);assert(calls.every(row=>row.chars<4200000));
console.log(JSON.stringify({check:'real D1 core, Worker client, Apps Script mirror and native switch-back',sourceChars:JSON.stringify(state).length,pages:calls.filter(row=>row.step==='page').length,largestCallChars:Math.max(...calls.map(row=>row.chars)),liveCalls:0}));
