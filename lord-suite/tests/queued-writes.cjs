const assert=require('assert/strict');
const {harness,plain}=require('./backend_harness.cjs');
const crypto=require('crypto');
const h=harness();
const actor={sub:'staff-sub',email:'staff@gsps.edu.sg'};
const jobId=h.now+'-00000000-0000-4000-8000-000000000001';
const payload={enabled:false,consentConfirmed:false,expectedRevision:'NONE'};
const canonical='{"action":"notificationPreferences","actor":{"email":"staff@gsps.edu.sg","sub":"staff-sub"},"payload":{"consentConfirmed":false,"enabled":false,"expectedRevision":"NONE"}}';
const payloadHash=crypto.createHash('sha256').update(canonical).digest('hex');
const command=extra=>h.post({action:'queueCommand',purpose:'lord-mutation-job-v1',mode:'execute',jobId,actor,operation:{action:'notificationPreferences',payload},payloadHash,...extra});
let unsigned=command();assert.equal(unsigned.ok,false,'browser transaction proxy cannot impersonate the queue service');
h.ctx.Utilities.computeHmacSha256Signature=(value,key)=>Array.from(crypto.createHmac('sha256',key).update(value).digest());
function stable(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(stable).join(',')+']';return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';}
function sign(target,body){const input={purpose:'lord-mutation-job-v1',serviceTimestamp:target.now,...body};return {...input,action:'queueCommand',serviceSignature:crypto.createHmac('sha256',target.ctx.LORD_CONFIG.PROXY_SECRET).update(stable(input)).digest('hex')};}
const acceptedInputs=new Map([[jobId,{jobId,actor,operation:{action:'notificationPreferences',payload},payloadHash}]]);
function signedCommand(extra={}) {
 const id=extra.jobId||jobId;
 if(!acceptedInputs.has(id)){
  const observed=h.get({action:'notificationPreferences',authEmail:actor.email,authSub:actor.sub});assert.equal(observed.ok,true);
  const proposal={...payload,expectedRevision:observed.data.decisionRevision};
  const hash=crypto.createHash('sha256').update(stable({action:'notificationPreferences',actor,payload:proposal})).digest('hex');
  acceptedInputs.set(id,{jobId:id,actor,operation:{action:'notificationPreferences',payload:proposal},payloadHash:hash});
 }
 return h.post(sign(h,{mode:'execute',...acceptedInputs.get(id),...extra}));
}
let r=signedCommand();assert.equal(r.ok,true,'real preference handler is available through the queue');assert.equal(r.result.state,'APPLIED');
const events=h.sheets[h.ctx.LORD_CONFIG.SHEETS.EVENTS].data.length;r=signedCommand();assert.equal(r.ok,true);assert.equal(h.sheets[h.ctx.LORD_CONFIG.SHEETS.EVENTS].data.length,events,'exact replay does not append another decision');
r=signedCommand({mode:'status'});assert.equal(r.result.state,'APPLIED');assert.equal(r.result.jobId,jobId);assert.equal(r.result.payloadHash,payloadHash);
r=signedCommand({actor:{sub:'other',email:'staff@gsps.edu.sg'}});assert.equal(r.ok,false);assert.equal(h.sheets[h.ctx.LORD_CONFIG.SHEETS.EVENTS].data.length,events);
r=signedCommand({payloadHash:'0'.repeat(64)});assert.equal(r.ok,false);
r=signedCommand({jobId:h.now+'-00000000-0000-4000-8000-000000000002',mode:'status'});assert.equal(r.result.state,'UNKNOWN');
r=signedCommand({operation:{action:'bookingCreateBatch',payload}});assert.equal(r.ok,false);assert.equal(h.sheets.Bookings.data.length,1);
assert.deepEqual(h.sends,[]);assert.deepEqual(h.photos,[]);
const denied=harness({properties:{LORD_WA_SCHOOL_AGREEMENT:JSON.stringify({enabled:true,scope:'school_operations',reference:'fixture'})}});
denied.ctx.Utilities.computeHmacSha256Signature=h.ctx.Utilities.computeHmacSha256Signature;
r=denied.post(sign(denied,{mode:'execute',jobId,actor,operation:{action:'notificationPreferences',payload},payloadHash}));assert.equal(r.ok,false);assert.equal(r.definite,true);assert.equal(denied.sheets[denied.ctx.LORD_CONFIG.SHEETS.EVENTS].data.length,1);
console.log('PASS LORD backend queue: real preference decision, exact actor/payload event replay, read-only uncertain status, school-managed rejection, no booking/photo/provider effects');
// A successful Google batch followed by a lost response stays uncertain until
// its exact decision event is read; no second preference event is appended.
const nextId=h.now+'-00000000-0000-4000-8000-000000000003';
const realBatch=h.ctx.Sheets.Spreadsheets.batchUpdate;
h.ctx.Sheets.Spreadsheets.batchUpdate=(...args)=>{realBatch(...args);throw Error('committed response lost');};
r=signedCommand({jobId:nextId});assert.equal(r.ok,false);assert.equal(r.definite,false);
h.ctx.Sheets.Spreadsheets.batchUpdate=realBatch;
const committedEvents=h.sheets[h.ctx.LORD_CONFIG.SHEETS.EVENTS].data.length;
r=signedCommand({jobId:nextId,mode:'status'});assert.equal(r.result.state,'APPLIED');
r=signedCommand({jobId:nextId});assert.equal(r.result.state,'APPLIED');assert.equal(h.sheets[h.ctx.LORD_CONFIG.SHEETS.EVENTS].data.length,committedEvents);
// Private immutable copies retry exact bytes after lost acknowledgements and
// reject a same-name content conflict. Google storage is the external boundary.
let creates=0;const files=new Map();
h.properties.LORD_QUEUE_BACKUP_FOLDER_ID='private-backup-folder';
h.ctx.DriveApp.getFolderById=id=>{assert.equal(id,'private-backup-folder');return {
 getFilesByName(name){let used=false;return {hasNext:()=>!used&&files.has(name),next(){used=true;return files.get(name);}};},
 createFile(name,content,mime){assert.equal(mime,'application/json');creates++;const file={getId:()=>name,getBlob:()=>({getDataAsString:()=>content})};files.set(name,file);return file;}
};};
const record={schema:1,authority:'D1',jobId,version:1,state:'APPLIED',payloadHash,history:[],receipt:{state:'APPLIED'}};
const digest=crypto.createHash('sha256').update(stable(record)).digest('hex');
const backup=extra=>h.post(sign(h,{mode:'backup',record,digest,...extra}));
r=backup();assert.equal(r.ok,true);assert.equal(r.result.digest,digest);r=backup();assert.equal(r.ok,true);assert.equal(creates,1);
const conflict={...record,state:'REJECTED'};r=backup({record:conflict,digest:crypto.createHash('sha256').update(stable(conflict)).digest('hex')});assert.equal(r.ok,false);assert.equal(creates,1);
console.log('PASS LORD backend lost-response recovery and immutable verified Google backup replay/conflict');
// A newer direct preference must not be overwritten by an older queued choice.
const staleId=h.now+'-00000000-0000-4000-8000-000000000004';
assert.equal(signedCommand({jobId:staleId,mode:'status'}).result.state,'UNKNOWN');
h.contacts.data[2][5]='81234567';h.now+=100;
r=h.post({action:'notificationPreferences',authEmail:actor.email,authSub:actor.sub,enabled:true,consentConfirmed:true});assert.equal(r.ok,true);
r=signedCommand({jobId:staleId});assert.equal(r.ok,false,'a newer Google preference decision fences an older queued choice');assert.equal(r.definite,true);
// Review regressions use the actual Google decision revision, not client clocks.
const reviewFailures=[];
function reviewed(name,fn){try{fn();}catch(error){reviewFailures.push(new Error(name+': '+error.message));}}
function reviewFixture(){const target=harness();target.contacts.data[2][5]='81234567';target.ctx.Utilities.computeHmacSha256Signature=h.ctx.Utilities.computeHmacSha256Signature;return target;}
function queueAt(target,id,choice){const observed=target.get({action:'notificationPreferences',authEmail:actor.email,authSub:actor.sub});assert.equal(observed.ok,true);const proposal={enabled:choice,consentConfirmed:choice,expectedRevision:observed.data.decisionRevision};const hash=crypto.createHash('sha256').update(stable({action:'notificationPreferences',actor,payload:proposal})).digest('hex');return {jobId:id,actor,operation:{action:'notificationPreferences',payload:proposal},payloadHash:hash};}
function direct(target,enabled){return target.post({action:'notificationPreferences',authEmail:actor.email,authSub:actor.sub,enabled,consentConfirmed:enabled});}
reviewed('future client timestamp cannot bypass newer direct choice',()=>{
 const target=reviewFixture();assert.equal(direct(target,false).ok,true);
 const input=queueAt(target,(target.now+3600000)+'-00000000-0000-4000-8000-000000000010',false);
 target.now+=100;assert.equal(direct(target,true).ok,true);
 const result=target.post(sign(target,{...input,mode:'execute'}));assert.equal(result.ok,false);assert.equal(result.definite,true);
});
reviewed('newer direct no-op choice fences queued opposite preference',()=>{
 const target=reviewFixture();assert.equal(direct(target,false).ok,true);
 const input=queueAt(target,target.now+'-00000000-0000-4000-8000-000000000011',true);
 target.now+=100;assert.equal(direct(target,false).ok,true);
 const result=target.post(sign(target,{...input,mode:'execute'}));assert.equal(result.ok,false);assert.equal(result.definite,true);
});
reviewed('Contacts revocation during writer-lock wait denies execution',()=>{
 const target=reviewFixture();const input=queueAt(target,target.now+'-00000000-0000-4000-8000-000000000012',false);
 const getLock=target.ctx.LockService.getScriptLock;
 target.ctx.LockService.getScriptLock=()=>{const lock=getLock(),wait=lock.waitLock;lock.waitLock=(...args)=>{target.contacts.data.splice(2,1);return wait(...args);};return lock;};
 const result=target.post(sign(target,{...input,mode:'execute'}));assert.equal(result.ok,false);assert.equal(result.definite,true);
});
if(reviewFailures.length)throw new AggregateError(reviewFailures,'Preference review regressions');
console.log('PASS LORD reviewed preference conflicts: trusted exact revision, newer repeated direct choice and under-lock Contacts revocation');
