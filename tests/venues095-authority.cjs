'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const {ctx,book,props}=require('./storage.cjs'),copy=x=>JSON.parse(JSON.stringify(x));
ctx.console={log(){},info(){},warn(){},error(){}};
const secret='fixture-physical-room-source-32-characters';props.set('VENUES_BRIDGE_SECRET',secret);props.set('GSIS_SECRET',secret);props.set('LORD_BRIDGE_SECRET',secret);
ctx.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})};
ctx.Utilities.computeHmacSha256Signature=(s,k)=>[...crypto.createHmac('sha256',k).update(s).digest()];
const signed=(action,service,input)=>{const payload=JSON.stringify({action,service,source:'deploy',timestamp:Date.now(),nonce:crypto.randomUUID(),input});return {postData:{contents:JSON.stringify({payload,signature:crypto.createHmac('sha256',secret).update(payload).digest('hex')})}};};
const call=(action,service,input)=>JSON.parse(ctx.doPost(signed(action,service,input)).text);
const source=book.insertSheet('Venues');source.getDataRange=()=>({getValues:()=>copy(source.data),getFormulas:()=>source.data.map(r=>r.map(()=>''))});
source.data=[['Unit number','Venue name','Short name','Block','Level','Capacity','Capacity basis','Notes'],['D1-06B','EAS Store','Store','D',1,'','','PRIVATE'],['D1-06C','Pump Room','Pump','D',1,'','','PRIVATE']];props.set('LANDMARK_SHEET_ID','register');
const ref={versionId:'2026',revision:1,commit:'old',updatedAt:'2026-01-01T00:00:00Z',from:'2026-01-01',to:'2026-12-31'};
ctx.venuesDeployPublications_=()=>[{entry:{},reference:ref}];
const ven=input=>call('venuesSource','gsis-venues-v1',input),lord=input=>call('lordService','gsis-lord-v1',input);
let m=ven({operation:'manifest'});assert.equal(m.ok,true,JSON.stringify(m));assert.match(m.data.registryWorkbookKey,/^[a-f0-9]{64}$/);
let r=ven({operation:'snapshot',versionId:'2026',commit:'old',expectedKey:m.data.key});assert.equal(r.ok,true,JSON.stringify(r));assert.deepEqual(r.data.venues.map(v=>v.unit),['D1-06B','D1-06C']);assert(!JSON.stringify(r).includes('PRIVATE'));
assert.equal(ven({operation:'manifest',knownKey:m.data.key}).data.unchanged,true);
const before=vm.runInContext('JSON.stringify(document_(book_(),publishedEntry_(index_(book_()))))',ctx),layout=ctx.publicCampus_(),boot=vm.runInContext("call('sync',{versionId:id})",ctx),l1=lord({operation:'manifest'});assert.equal(l1.ok,true,JSON.stringify(l1));assert.equal(l1.data.venues[1].name,'Pump Room');
source.data[2][1]='Pump Station';source.data[2][2]='Pump';
assert.equal(ven({operation:'snapshot',versionId:'2026',commit:'old',expectedKey:m.data.key}).code,'VENUES_SOURCE_CHANGED');
assert.notEqual(ven({operation:'manifest'}).data.key,m.data.key);
const layout2=ctx.publicCampus_({since:layout.cursor});assert.notEqual(layout2.cursor,layout.cursor);assert.equal(layout2.venues[1].name,'Pump Station');assert(!JSON.stringify(layout2).includes('PRIVATE'));assert.equal(ctx.publicCampus_({since:layout2.cursor}).unchanged,true);
ctx.lastBoot=boot;const boot2=vm.runInContext("call('sync',{versionId:id,cacheKey:lastBoot.cacheKey})",ctx);assert.equal(boot2.unchanged,false);assert.equal(boot2.current.venueRegistry.venues[1].name,'Pump Station');
const l2=lord({operation:'manifest',knownKey:l1.data.key});assert.notEqual(l2.data.key,l1.data.key);assert.equal(l2.data.venues[1].name,'Pump Station');assert.equal(lord({operation:'snapshot',expectedKey:l1.data.key}).code,'SOURCE_CHANGED');assert(!JSON.stringify(l2).includes('PRIVATE'));
assert.equal(vm.runInContext('JSON.stringify(document_(book_(),publishedEntry_(index_(book_()))))',ctx),before,'physical changes never rewrite frozen publication');
source.data[2][0]='D1-06B';assert.equal(ven({operation:'manifest'}).ok,false);source.data[2][0]='D1-06C';
const reader=ctx.readLandmarkRegistry_;let reads=0;ctx.readLandmarkRegistry_=()=>{reads++;if(reads===2)source.data[2][1]='During read';return reader();};m=ven({operation:'manifest'});reads=0;assert.equal(ven({operation:'snapshot',versionId:'2026',commit:'old',expectedKey:m.data.key}).code,'VENUES_SOURCE_CHANGED');ctx.readLandmarkRegistry_=reader;
ctx.venuesDeployPublications_=()=>{throw Object.assign(Error('pending source'),{status:503,code:'VENUES_SOURCE_PENDING'});};assert.equal(ven({operation:'manifest'}).code,'VENUES_SOURCE_PENDING');
console.log('PASS v095 actual signed room source, live-sheet invalidation across Venues/Deploy/Layout/LORD, immutable publication isolation, safe diagnostics and concurrent change rejection');

// Private physical registry adapter needs the signed bridge, never a browser email.
props.set('BRIDGE_SECRET',secret);
const adapterPayload=JSON.stringify({action:'deployEdge',input:{operation:'physicalRegistry'},timestamp:Date.now(),nonce:crypto.randomUUID(),identity:null});
const adapterEvent=signature=>({postData:{contents:JSON.stringify({payload:adapterPayload,signature})}});
const adapterReply=JSON.parse(ctx.doPost(adapterEvent(crypto.createHmac('sha256',secret).update(adapterPayload).digest('hex'))).text);assert.equal(adapterReply.ok,true);assert.equal(adapterReply.data.venues[0].unitNumber,'D1-06B');assert.equal(JSON.parse(ctx.doPost(adapterEvent('0'.repeat(64))).text).status,401);
console.log('PASS signed identity-free physical registry adapter rejects invalid signatures');
// A legacy Apps Script forwarding to D1 preserves safe source diagnostics.
props.set('DEPLOY_EDGE_URL','https://deploy.example/api/edge/service');props.set('DEPLOY_EDGE_SECRET','x'.repeat(32));const oldFetch=ctx.UrlFetchApp;
ctx.UrlFetchApp={fetch:()=>({getContentText:()=>JSON.stringify({ok:false,status:409,error:'Changed source',code:'VENUES_SOURCE_CHANGED'})})};assert.throws(()=>ctx.deployEdgeForward_('venuesSource',{}),e=>e.code==='VENUES_SOURCE_CHANGED');
ctx.UrlFetchApp={fetch:()=>({getContentText:()=>JSON.stringify({ok:false,status:503,error:'Failed',code:'UNTRUSTED_CODE'})})};assert.throws(()=>ctx.deployEdgeForward_('venuesSource',{}),e=>e.code===undefined);ctx.UrlFetchApp=oldFetch;
console.log('PASS forwarded Worker source codes are preserved only from the explicit allowlist');
// UI names resolve the current register without changing allocation identifiers.
const ui=fs.readFileSync('public/app.js','utf8'),helpers=ui.split('\n').filter(line=>/^function deploy(?:PhysicalRoom|RoomName)\(/.test(line)).join('\n');
const uiContext=vm.createContext({});vm.runInContext(helpers,uiContext);
const displayDoc={venueRegistry:{venues:[{unitNumber:'D1-06B',name:'EAS Store',shortName:'EA Store'},{unitNumber:'D1-06C',name:'Pump Station',shortName:'PS'},{unitNumber:'F1-16',name:'New lab',shortName:'NL'}]}};
assert.equal(uiContext.deployPhysicalRoom({id:'D1-06B',name:'Pump Room'},displayDoc).name,'Pump Station');assert.equal(uiContext.deployPhysicalRoom({id:'D1-06B',name:'EAS Store'},displayDoc).name,'EAS Store');assert.equal(uiContext.deployRoomName({id:'F1-16',shortName:'Old'},displayDoc),'NL');assert(ui.includes('name:deployPhysicalRoom(r,v()).name'));assert(!ui.includes("r.id+' '+(r.name||'')"));
console.log('PASS Deploy venue labels and diagram use current metadata without corrupting legacy Pump/EAS distinction');

displayDoc.venueRegistry.venues[2].shortName='';assert.equal(uiContext.deployRoomName({id:'F1-16',shortName:'Old'},displayDoc),'');assert(!fs.readFileSync('public/workload-ui.js','utf8').includes("r.id+' '+(r.name||'')"));
