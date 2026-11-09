const assert=require('assert/strict'),crypto=require('crypto'),vm=require('vm'),fixture=require('./contacts503-fixture.js');
function cacheService(map){return {getScriptCache:()=>({get:k=>map.get(k)||null,getAll:ks=>Object.fromEntries(ks.filter(k=>map.has(k)).map(k=>[k,map.get(k)])),remove:k=>map.delete(k),put:(k,v)=>map.set(k,v),putAll:vs=>Object.entries(vs).forEach(([k,v])=>map.set(k,v))})};}
const f=fixture(),contactCache=new Map();f.ctx.CacheService=cacheService(contactCache);
let first=f.post('deploySnapshot',{readOnly:true});assert.equal(first.ok,true);assert.equal(first.data.authoritative,true);assert.match(first.data.catalogueHash,/^[a-f0-9]{64}$/);assert.equal(first.data.people.length,181);const firstHash=first.data.catalogueHash;
f.reset();let hit=f.post('deploySnapshot',{readOnly:true,knownCatalogueHash:firstHash});assert.equal(hit.data.catalogueUnchanged,true);for(const k of ['people','sysFields','roleCatalogue'])assert.equal(k in hit.data,false);assert.equal(f.stats.reads.flat().length,1,'only live admin_users needed on warm catalogue hit');assert.ok(f.stats.reads.flat()[0].includes('admin_users'));
f.props.set('CONTACTS_DATA_EPOCH',crypto.randomUUID());let epoch=f.post('deploySnapshot',{readOnly:true,knownCatalogueHash:firstHash});assert.equal(epoch.data.catalogueUnchanged,true);assert.notEqual(epoch.data.catalogueEpoch,first.data.catalogueEpoch);assert.equal(epoch.data.catalogueHash,firstHash,'epoch and catalogue content are distinct');
f.sheets.get('admin_users').data[1][1]='';let revoked=f.post('deploySnapshot',{readOnly:true,knownCatalogueHash:firstHash});assert.deepEqual(revoked.data.user.roles,[]);assert.equal('people' in revoked.data,false);assert.equal('catalogueHash' in revoked.data,false);f.sheets.get('admin_users').data[1][1]='Admin';
const contacts=f.sheets.get('contacts');contacts.data[18][5]='Updated Person';f.props.set('CONTACTS_DATA_EPOCH',crypto.randomUUID());const changed=f.post('deploySnapshot',{readOnly:true,knownCatalogueHash:firstHash});assert.equal(changed.ok,true);assert.notEqual(changed.data.catalogueHash,firstHash);assert.equal(changed.data.people.find(x=>x.id==='staff-17').name,'Updated Person');assert.equal(changed.data.catalogueUnchanged,undefined);
{
 const pending=fixture();pending.ctx.CacheService=cacheService(new Map());const before=pending.post('deploySnapshot',{readOnly:true});pending.seedSnapshot({changes:[{id:'staff-17',field:'Basic Name',expected:'Person 17',value:'Not committed'}],additions:[]});const view=pending.post('deploySnapshot',{readOnly:true,knownCatalogueHash:before.data.catalogueHash});assert.equal(view.ok,true);assert.equal(view.data.authoritative,false);assert.equal(view.data.viewState.pending,true);assert.equal(view.data.catalogueUnchanged,undefined);assert.ok(view.data.people);
}
// An unavailable epoch-property write still evicts the exact current manifests.
{
 const isolated=fixture(),cache=new Map();isolated.ctx.CacheService=cacheService(cache);isolated.post('deploySnapshot',{readOnly:true});isolated.post('bootstrap');assert.ok([...cache.keys()].some(k=>k.startsWith('staff-v601-memberships:')));const original=isolated.ctx.PropertiesService.getScriptProperties;isolated.ctx.PropertiesService.getScriptProperties=()=>({...original(),setProperty(){throw Error('Property unavailable')}});isolated.run('invalidateDeployReadCache_()');assert.equal([...cache.keys()].some(k=>/^staff-v601-memberships:[^:]+:[^:]+:[^:]+$/.test(k)),false);assert.equal([...cache.keys()].some(k=>/^directory-v601-memberships:[^:]+:[^:]+:[^:]+$/.test(k)),false);
}
// Exercise the real Deploy bridge, actual signed Contacts dispatcher and immutable cache.
const {ctx,props}=require('./storage.cjs'),run=s=>vm.runInContext(s,ctx),deployCache=new Map(),requests=[];ctx.CacheService=cacheService(deployCache);ctx.Utilities.computeHmacSha256Signature=(s,k,charset='utf8')=>[...crypto.createHmac('sha256',Buffer.from(k,charset)).update(s,charset).digest()];
props.set('CONTACTS_API_URL','https://script.google.com/macros/s/synthetic/exec');props.set('GSIS_SECRET','x'.repeat(32));
const trace=crypto.randomUUID();ctx.trace=trace;run('deployTrace_={requestId:trace,phases:{}}');
ctx.UrlFetchApp={fetch(url,options){const envelope=JSON.parse(options.payload),request=JSON.parse(envelope.payload);requests.push(request);f.ctx.signed={postData:{contents:options.payload}};return {getContentText:()=>f.run('doPost(signed).text')};}};
const bridge=()=>run("realContactsBridge({email:'admin@gsps.edu.sg',subject:'admin'},false,'deploySnapshot',{readOnly:true})");
let data=bridge();assert.equal(data.people.length,181);assert.equal(requests.at(-1).input.knownCatalogueHash,undefined);assert.equal(requests.at(-1).traceId,trace);assert.equal(data.timing.requestId,trace);assert.equal(run('deployTrace_.contacts.at(-1).timing.requestId'),trace);
data=bridge();assert.equal(data.people.length,181);assert.equal(data.catalogueUnchanged,true);assert.equal(requests.at(-1).input.knownCatalogueHash,data.catalogueHash);assert.ok(data.sysFields&&data.roleCatalogue);
f.props.set('CONTACTS_DATA_EPOCH',crypto.randomUUID());const previousEpoch=data.catalogueEpoch;data=bridge();assert.equal(data.people.length,181);assert.equal(data.catalogueUnchanged,true);assert.notEqual(data.catalogueEpoch,previousEpoch,'fresh signed epoch validates identical immutable contents');
f.sheets.get('admin_users').data[1][1]='';data=bridge();assert.deepEqual(Array.from(data.user.roles),[]);assert.equal(data.people,undefined,'revoked caller must not receive cached staff');f.sheets.get('admin_users').data[1][1]='Admin';
const fetch=ctx.UrlFetchApp.fetch;ctx.UrlFetchApp.fetch=()=>{throw Error('Bridge unavailable')};assert.throws(bridge,/Bridge unavailable/,'authority failures cannot use cached permissions');ctx.UrlFetchApp.fetch=fetch;
for(const [k] of deployCache)if(/:\d+$/.test(k)){deployCache.delete(k);break;}data=bridge();assert.equal(data.people.length,181);assert.equal(requests.at(-1).input.knownCatalogueHash,undefined,'evicted chunk causes one full signed read');
// A response claiming an unknown hash must retry without a conditional cursor.
let injected=false;ctx.UrlFetchApp.fetch=(url,options)=>{const req=JSON.parse(JSON.parse(options.payload).payload);if(!injected&&req.input.knownCatalogueHash){injected=true;return {getContentText:()=>JSON.stringify({ok:true,data:{user:{roles:['Admin']},authoritative:true,catalogueUnchanged:true,catalogueHash:'f'.repeat(64),catalogueEpoch:'current'}})}}return fetch(url,options)};
const count=requests.length;data=bridge();assert.equal(injected,true);assert.equal(data.people.length,181);assert.equal(requests.length-count,1);assert.equal(requests.at(-1).input.knownCatalogueHash,undefined);ctx.UrlFetchApp.fetch=fetch;
// Snapshot omission is independent of document revision and preserves old clients.
ctx.catalogue=data;const oldClient=run("snapshot_(book_(),index_(book_()),catalogue,{full:true})");assert.ok(oldClient.staffCatalog&&oldClient.sysFields&&oldClient.roleCatalogue);ctx.catalogueHash=oldClient.catalogueHash;const conditional=run("snapshot_(book_(),index_(book_()),catalogue,{full:true,knownCatalogueHash:catalogueHash})");assert.equal(conditional.catalogueUnchanged,true);assert.ok(conditional.current);assert.equal('staffCatalog' in conditional,false);assert.equal('sysFields' in conditional,false);assert.equal('roleCatalogue' in conditional,false);assert.equal(conditional.catalogueHash,oldClient.catalogueHash);
// Version-owned HR context can differ despite an identical Contacts source hash.
run(`
var source505=JSON.parse(JSON.stringify(catalogue)),index505=index_(book_());
var versionA505=document_(book_(),index505.versions.find(x=>x.id===id));
var versionB505=document_(book_(),index505.versions.find(x=>x.id===planningId));
for(const [doc,label,level]of [[versionA505,'Version A','HOD'],[versionB505,'Version B','SH']]){doc.masterOptions=JSON.parse(JSON.stringify(source505.sysFields));doc.masterOptions['Subject Modifier']=[label];doc.membership=[['Teacher','Teacher',...Array(10).fill(''),level]];doc.hrChoicesSchema=1;}
var sourceCopy505=()=>({...JSON.parse(JSON.stringify(source505)),sourceCatalogueHash:source505.catalogueHash});
var snapA505=snapshot_(book_(),index505,sourceCopy505(),{versionId:id,full:true},JSON.parse(JSON.stringify(versionA505)));
var snapB505=snapshot_(book_(),index505,sourceCopy505(),{versionId:planningId,full:true,knownCatalogueHash:snapA505.catalogueHash},JSON.parse(JSON.stringify(versionB505)));
var repeatB505=snapshot_(book_(),index505,sourceCopy505(),{versionId:planningId,full:true,knownCatalogueHash:snapB505.catalogueHash},JSON.parse(JSON.stringify(versionB505)));
`);
assert.notEqual(run('snapA505.catalogueHash'),run('snapB505.catalogueHash'));assert.equal(run('snapB505.catalogueUnchanged'),false);assert.equal(run('snapB505.sysFields["Subject Modifier"][0]'),'Version B');assert.equal(run('snapB505.roleCatalogue[0].level'),'SH');assert.equal(run('repeatB505.catalogueUnchanged'),true);assert.equal(run('repeatB505.sysFields'),undefined);
// Legacy unchanged-document requests skip planningContext and emit Contacts context.
// They resend that different catalogue once without reading the document, then omit.
run(`var document505=document_;document_=()=>{throw Error('Unchanged snapshot must not load a document')};try{
var legacy505=snapshot_(book_(),index505,sourceCopy505(),{versionId:planningId,cacheKey:snapB505.cacheKey,knownCatalogueHash:snapB505.catalogueHash});
var legacyRepeat505=snapshot_(book_(),index505,sourceCopy505(),{versionId:planningId,cacheKey:snapB505.cacheKey,knownCatalogueHash:legacy505.catalogueHash});
}finally{document_=document505;}`);
assert.equal(run('legacy505.unchanged'),true);assert.equal(run('legacy505.current'),null);assert.equal(run('legacy505.catalogueUnchanged'),false);assert.notEqual(run('legacy505.catalogueHash'),run('snapB505.catalogueHash'));assert.ok(run('legacy505.sysFields'));assert.equal(run('legacyRepeat505.catalogueUnchanged'),true);
// Browser catalogue hashes include version HR context; bridge cache keys do not.
const sourceHash505=data.catalogueHash;run("realContactsBridge({email:'admin@gsps.edu.sg',subject:'admin'},false,'deploySnapshot',{readOnly:true,knownCatalogueHash:snapB505.catalogueHash})");assert.equal(requests.at(-1).input.knownCatalogueHash,sourceHash505,'browser cursor must not replace the independently validated Contacts cache key');
console.log('PASS 505 catalogue: conditional payloads, live authority and revocation, validated epoch with unchanged content, cache eviction/full-fetch fallback, signed trace and nested timing, pending-view isolation, version-owned catalogue binding and legacy unchanged-document context');
