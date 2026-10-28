'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=fs.readFileSync,venueSource=read('shared/venue-groups.js','utf8');
fs.readFileSync=function(file,...args){let data=read.call(this,file,...args);if(String(file).endsWith('/backend/Code.gs')&&typeof data==='string')data=data.replace(/\/\* GSIS_VENUE_GROUPS_BEGIN \*\/[\s\S]*?\/\* GSIS_VENUE_GROUPS_END \*\//,()=> '/* GSIS_VENUE_GROUPS_BEGIN */\n'+venueSource+'\n/* GSIS_VENUE_GROUPS_END */');return data;};
let fixture;try{fixture=require('./release506-fixture.js');}finally{fs.readFileSync=read;}
const {ctx,sheets}=fixture,run=s=>vm.runInContext(s,ctx),json=s=>JSON.parse(JSON.stringify(run(s)));
run(`props_().setProperty('LEASES','{}');
var venueId=call('change',{operation:'create',sourceVersionId:id,duplicate:true,name:'Unpublished venue fixture',requestId:Utilities.getUuid()}).versionId;
var venueEntry=()=>index_(book_()).versions.find(x=>x.id===venueId),venueDoc=()=>document_(book_(),venueEntry()),venueRaw=()=>{const d=venueDoc();return GSISFields.inflate(fieldReadState_.get(d).fields);};
var venueSave=(edits,extra={})=>call('change',{operation:'saveDraft',versionId:venueId,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'venue089',reliefResults:true,returnDelta:true,auditPaged:true,since:venueEntry().revision,edits,...extra});
var seedVenue=venueDoc();seedVenue.venues[0].forms=['1P','1T'];seedVenue.venues[0].form='1P';seedVenue.groups=[{id:'g-venue',name:'Group',subject:'EL',level:'1',form:'1P',sources:['1P'],classRefs:[seedVenue.classes[0].ref],venue:seedVenue.venues[0].id},{id:'g-blank',name:'Blank',subject:'EL',level:'1',form:'1P',sources:['1P'],classRefs:[seedVenue.classes[0].ref],venue:''}];seedVenue.assignments.push({id:'g-assignment',target:'g-venue',teacher:'t1',subject:'EL',level:'1',venue:seedVenue.venues[0].id});persist_(book_(),index_(book_()),seedVenue,null);
var venueExpected=GSISVenueGroups.clearState(venueDoc()),clearEdit={operation:'clearVenueAssignments',expected:venueExpected},publishedBefore=JSON.stringify(document_(book_(),publishedEntry_(index_(book_()))));`);
assert.throws(()=>run(`dispatch_({action:'change',input:{operation:'saveDraft',versionId:venueId,requestId:Utilities.getUuid(),issuedAt:Date.now(),edits:[clearEdit]},identity:who},{...c,user:{roles:['KP']}})`),e=>e.status===403,'KP cannot clear venues');
assert.throws(()=>run(`call('change',{operation:'saveDraft',versionId:id,requestId:Utilities.getUuid(),issuedAt:Date.now(),edits:[{operation:'clearVenueAssignments',expected:GSISVenueGroups.clearState(document_(book_(),index_(book_()).versions.find(x=>x.id===id)))}]})`),e=>e.status===409&&/unpublished/.test(e.message),'Active published target rejected');
// Every row participates, including new blank rows. No partial clear on conflict.
for(const mutation of ["d.venues.push({id:'new-room',form:''})","d.groups.push({id:'new-group',venue:''})","d.assignments.push({id:'new-assignment',target:'g-venue',teacher:'t2',subject:'EL',venue:''})","d.groups[0].venue='F1-16'"]){
 run(`var preConflict=venueDoc();var d=venueDoc();${mutation};persist_(book_(),index_(book_()),d,null);var concurrentVenue=JSON.stringify(venueRaw());`);
 assert.throws(()=>run('venueSave([clearEdit])'),e=>e.status===409&&/Venue assignments changed/.test(e.message));
 assert.equal(run('JSON.stringify(venueRaw())'),run('concurrentVenue'),'Conflict keeps complete current saved state');
 run('var restoredVenue=venueDoc();for(const key of [\'venues\',\'groups\',\'assignments\'])restoredVenue[key]=preConflict[key];persist_(book_(),index_(book_()),restoredVenue,null);');
}
// An unrelated save must survive, even when clear used an older global revision.
run(`venueSave([{operation:'setLoad',level:'1',subject:'EL',expected:venueDoc().loads['1'].EL,value:12}]);var beforeClear=venueRaw(),expectedCounts=GSISVenueGroups.clearCounts(venueDoc()),clearRequest=Utilities.getUuid(),cleared=venueSave([clearEdit],{requestId:clearRequest}),afterClear=venueRaw();`);
assert.deepEqual(json('cleared.venueClear'),json('expectedCounts'));
assert.equal(run('cleared.delta.reliefProjection.unchanged'),true,'Venue-only clear reuses the confirmed previous period calculation');
assert.equal(run('afterClear.loads[1].EL'),12);
assert.equal(run("afterClear.venues.every(r=>!r.form&&!(r.forms||[]).length)&&afterClear.groups.every(g=>!g.venue)&&afterClear.assignments.every(a=>!a.venue)"),true);
const before=json('beforeClear'),after=json('afterClear'),nonVenue=d=>{delete d.audit;delete d.fieldAuthors;for(const r of d.venues){delete r.form;delete r.forms;}for(const r of [...d.groups,...d.assignments])delete r.venue;return d;};
assert.deepEqual(nonVenue(after),nonVenue(before),'Only venue links and audit/author metadata change');
assert.equal(run('JSON.stringify(document_(book_(),publishedEntry_(index_(book_()))))'),run('publishedBefore'),'Frozen publication unchanged');
assert.ok(json('venueDoc().audit').some(a=>a.action==='clearVenueAssignments'&&a.before.value.rooms.length),'Before values retained in audit');
assert.deepEqual(json("call('receipt',{versionId:venueId,requestId:clearRequest}).venueClear"),json('expectedCounts'),'Receipt returns committed counts');
// A lost response retry cannot clear venue links entered after the first save.
run(`venueSave([{operation:'moveTG',groupId:'g-venue',venue:'F1-16',expected:''}]);var postClearVenue=JSON.stringify(venueRaw()),replayed=venueSave([clearEdit],{requestId:clearRequest});`);
assert.equal(run('replayed.duplicate'),true);assert.equal(run('JSON.stringify(venueRaw())'),run('postClearVenue'));
assert.throws(()=>run(`venueSave([{...clearEdit,expected:{}}],{requestId:clearRequest})`),e=>e.status===409,'Changed payload cannot reuse receipt');
// The journal can settle after the canonical write and a failed projection write.
run(`var crashExpected=GSISVenueGroups.clearState(venueDoc()),crashId=Utilities.getUuid(),crashEdit={operation:'clearVenueAssignments',expected:crashExpected};`);
const fast=sheets.get(run('venueEntry().fastIndex')),get=fast.getRange.bind(fast);let fail=true;
fast.getRange=(...args)=>{const r=get(...args),set=r.setValues;r.setValues=function(values){if(fail){fail=false;throw Error('projection interrupted')}return set.call(this,values)};return r;};
assert.throws(()=>run('venueSave([crashEdit],{requestId:crashId})'),/projection interrupted/);fast.getRange=get;
assert.ok(run('index_(book_()).pendingFieldCommit'));
assert.equal(run("call('receipt',{versionId:venueId,requestId:crashId}).saved"),true);
assert.equal(run('venueSave([crashEdit],{requestId:crashId}).duplicate'),true);
assert.equal(run("venueDoc().groups.find(g=>g.id==='g-venue').venue"),'');
// A prior local assignment uses a client ID. The server allocates its own ID.
run(`var mixedPreview=venueDoc();mixedPreview.assignments.push({id:'pending-local',teacher:'t2',target:'g-blank',subject:'EL',level:'1',venue:''});var mixedExpected=GSISVenueGroups.clearState(mixedPreview);venueSave([{operation:'addTeacher',localId:'pending-local',teacher:'t2',target:'g-blank',subject:'EL',expected:false},{operation:'clearVenueAssignments',expected:mixedExpected}]);`);
assert.equal(run("venueDoc().assignments.filter(a=>a.target==='g-blank'&&a.teacher==='t2').length"),1,'Prior local assignment retained with real server ID');
// Legacy versions without saved class rows must retain their derived class list.
run(`var legacyId=call('change',{operation:'create',sourceVersionId:id,duplicate:true,name:'Legacy venue fixture',requestId:Utilities.getUuid()}).versionId;var legacyEntry=index_(book_()).versions.find(x=>x.id===legacyId),legacyDoc=document_(book_(),legacyEntry);delete legacyDoc.classes;persist_(book_(),index_(book_()),legacyDoc,null);var legacyView=document_(book_(),index_(book_()).versions.find(x=>x.id===legacyId)),legacyClasses=JSON.stringify(legacyView.classes);call('change',{operation:'saveDraft',versionId:legacyId,requestId:Utilities.getUuid(),issuedAt:Date.now(),clientId:'venue089',edits:[{operation:'clearVenueAssignments',expected:GSISVenueGroups.clearState(legacyView)}]});`);
assert.equal(run('JSON.stringify(document_(book_(),index_(book_()).versions.find(x=>x.id===legacyId)).classes)'),run('legacyClasses'),'Legacy derived classes are saved before venue links disappear');
console.log('PASS 089 venue clear: Admin/unpublished guard, full link-set conflicts including blank additions, unrelated saves preserved, exact field scope, audited counts, receipt replay, journal recovery, mixed local assignment.');
