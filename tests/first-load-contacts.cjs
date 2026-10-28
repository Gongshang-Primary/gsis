const assert=require('assert/strict'),crypto=require('crypto');
const {ctx,run,sheets,props}=require('./contacts-data.cjs');
const cache=new Map(),writes=[],reads=[];
ctx.CacheService={getScriptCache:()=>({get:k=>cache.get(k)||null,getAll:keys=>Object.fromEntries(keys.filter(k=>cache.has(k)).map(k=>[k,cache.get(k)])),put(k,v,ttl){assert.equal(ttl,30);assert.ok(k.length<=250);assert.ok(Buffer.byteLength(v)<100000);writes.push(k);cache.set(k,v)},putAll(values,ttl){for(const [k,v]of Object.entries(values))this.put(k,v,ttl)},remove:k=>cache.delete(k)})};
ctx.recordRead=name=>reads.push(name);run('var savedRead=readContactTable_;readContactTable_=(ss,name)=>{recordRead(name);return savedRead(ss,name)}');
ctx.Utilities.computeHmacSha256Signature=(s,key)=>[...crypto.createHmac('sha256',key).update(s).digest()];ctx.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this}})};props.set('BRIDGE_SECRET','x'.repeat(32));
function post(action,input={},email='a@gsps.edu.sg',alter={}){const payload=JSON.stringify({action,input,identity:{email,subject:email},timestamp:Date.now(),nonce:crypto.randomUUID(),...alter});ctx.signed={postData:{contents:JSON.stringify({payload,signature:crypto.createHmac('sha256','x'.repeat(32)).update(payload).digest('hex')})}};return JSON.parse(run('doPost(signed).text'));}
const first=post('bootstrap');assert.ok(first.ok);assert.deepEqual(reads,['admin_users','roles','contacts']);reads.length=0;
const second=post('bootstrap',{},'second@gsps.edu.sg');assert.ok(second.ok);assert.equal(second.data.user.email,'second@gsps.edu.sg');assert.deepEqual(second.data.user.roles,[]);assert.deepEqual(reads,['admin_users']);assert.deepEqual(second.data.people,first.data.people);
for(const [k,v]of cache)if(!k.includes(':directory')){const data=JSON.parse(v);assert.ok(!data.user&&!data.access);}
sheets.get('admin_users').data[1][2]='N';assert.deepEqual(post('bootstrap').data.user.roles,[]);assert.deepEqual(post('deploySnapshot',{readOnly:true}).data.user.roles,[]);sheets.get('admin_users').data[1][2]='Y';
// Authority can be checked during unrelated pending work; viewing stays available while writers remain fenced.
props.set('CONTACTS_PENDING_V2',JSON.stringify({contact_save_journal:{id:crypto.randomUUID(),actor:'other@gsps.edu.sg',row:2}}));props.set('DEPLOY_CATALOGUE_PENDING','{"commit":"synthetic"}');reads.length=0;
assert.deepEqual(post('deploySnapshot',{authorityOnly:true}).data.user.roles,['Admin']);assert.deepEqual(reads,['admin_users']);
// An absent current roster checks only its marker; legacy published data remains independent of Contacts directory tables during recovery.
props.set('DEPLOY_API_URL','https://script.google.com/macros/s/synthetic/exec');props.set('DEPLOY_BRIDGE_SECRET','y'.repeat(32));
ctx.UrlFetchApp={fetch:()=>({getContentText:()=>JSON.stringify({ok:true,data:{activeVersionId:'published'}})})};const openBook=ctx.SpreadsheetApp.openById;ctx.SpreadsheetApp.openById=()=>({getSheetByName:name=>{assert.equal(name,'contacts_current_deployment');return null}});
assert.equal(post('deployment').data.available,true);assert.equal(post('deployment',{},'outside@example.com').status,403);ctx.SpreadsheetApp.openById=openBook;
sheets.get('admin_users').data[1][2]='N';assert.deepEqual(post('deploySnapshot',{authorityOnly:true}).data.user.roles,[]);sheets.get('admin_users').data[1][2]='Y';
props.delete('DEPLOY_CATALOGUE_PENDING');const pendingView=post('bootstrap');assert.equal(pendingView.ok,true);assert.equal(pendingView.data.viewState.pending,true);const pendingData=post('data');assert.equal(pendingData.ok,true);assert.equal(pendingData.data.editable,false);assert.equal(post('deploySnapshot',{readOnly:true}).ok,true);assert.equal(post('deploySnapshot',{authorityOnly:'true'}).ok,true);
assert.equal(post('deploySnapshot',{authorityOnly:true},'outside@example.com').status,403);assert.equal(post('deploySnapshot',{authorityOnly:true},'a@gsps.edu.sg',{timestamp:0}).status,401);
ctx.signed.postData.contents=JSON.stringify({payload:'{}',signature:'invalid'});assert.equal(JSON.parse(run('doPost(signed).text')).status,401);props.set('CONTACTS_PENDING_V2','{}');
// A real save changes the cache epoch; the next reader gets the updated directory.
assert.ok(post('saveData',{requestId:crypto.randomUUID(),changes:[{id:'s1',field:'Basic Name',expected:'New Name',value:'Cache Invalidated'}]}).ok);assert.match(post('bootstrap').data.people[0].name,/Cache Invalidated/);
// Large multilingual data no longer silently bypasses the cache. Missing/corrupt chunks fail back to the source.
run("var builds=0;var big=()=>{builds++;return {people:[{name:'😀甲'.repeat(50000)}],groups:[]}};var bigFirst=contactCachedRead_('large-test',big);var bigSecond=contactCachedRead_('large-test',big)");assert.equal(run('builds'),1);assert.equal(run('bigFirst.people[0].name===bigSecond.people[0].name'),true);
const chunkKey=[...cache.keys()].find(k=>k.startsWith('large-test:')&&/:0$/.test(k));assert.ok(chunkKey);cache.delete(chunkKey);run("contactCachedRead_('large-test',big)");assert.equal(run('builds'),2);
const manifest=[...cache.keys()].find(k=>k.startsWith('large-test:')&&cache.get(k).startsWith('{"chunkSet"'));cache.set(manifest,'invalid JSON');run("contactCachedRead_('large-test',big)");assert.equal(run('builds'),3);
ctx.CacheService={getScriptCache(){throw Error('Cache unavailable')}};assert.ok(post('bootstrap').ok);
console.log('PASS first-load Contacts: shared directory reads 3→1 tables; fresh identities/roles, revocation, strict signed authority fast path, pending view availability, mutation invalidation, large UTF-8 chunks and cache failure fallback.');
