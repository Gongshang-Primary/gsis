'use strict';
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const contacts=require('./contacts-data.cjs'),deploy=require('./storage.cjs'),secret='fixture-lord-service-key-32-characters';contacts.ctx.console={...console,info(){},error(){}};deploy.ctx.console={...console,info(){},error(){},log(){}};
const signed=(source,input={operation:'manifest'},changes={})=>{const payload=JSON.stringify({action:'lordService',service:'gsis-lord-v1',source,timestamp:Date.now(),nonce:crypto.randomUUID(),input,...changes});return {postData:{contents:JSON.stringify({payload,signature:crypto.createHmac('sha256',secret).update(payload).digest('hex')})}};};
for(const h of [contacts,deploy]){
 h.props.set('LORD_BRIDGE_SECRET',secret);h.ctx.Utilities.computeHmacSha256Signature=(s,k)=>[...crypto.createHmac('sha256',k).update(s).digest()];h.ctx.ContentService={MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})};
 for(const file of ['backend/LordBridge.gs',h===contacts?'backend/Contacts_Lord.gs':'backend/LordDeploy.gs'])vm.runInContext(fs.readFileSync(file,'utf8'),h.ctx);
}
contacts.props.set('GSIS_SECRET',secret); // Only the migrated Contacts provider changes its configuration name.
const call=(h,event)=>{h.ctx.lordEvent=event;return JSON.parse(vm.runInContext('doPost(lordEvent).text',h.ctx));};
let checks=0;const test=(name,fn)=>{try{fn();checks++;console.log('PASS',name);}catch(e){console.error('FAIL',name);throw e;}};
const contactsPost=(input,changes)=>call(contacts,signed('contacts',input,changes)),deployPost=(input,changes)=>call(deploy,signed('deploy',input,changes));
const cReads=[],cSheet=contacts.sheets.get('contacts'),cHeaders=cSheet.data[0],put=(name,value)=>cSheet.data[1][cHeaders.indexOf(name)]=value;
put('GSPS Alias (@gsps.edu.sg)','Teacher.One');put('CES Alias (@schools.gov.sg)','Teacher.Ces');put('Mobile No','91234567');put('Day of Birth','12');put('Month of birth','3');
const readTables=contacts.ctx.GSISSheets.readTables;contacts.ctx.GSISSheets.readTables=(b,names,...args)=>{cReads.push(Array.from(names));return readTables(b,names,...args);};
let firstContact,firstDeploy;
test('actual signed Contacts route returns exact field allowlist and a fresh two-table batch',()=>{
 const r=contactsPost();assert.equal(r.ok,true,JSON.stringify(r));firstContact=r.data;assert.match(r.data.key,/^[a-f0-9]{64}$/);assert.equal(r.data.source,'contacts');assert.equal(r.data.authoritative,true);assert.equal(r.data.updatedAt,undefined);assert.equal(r.data.people.length,1);assert.deepEqual(Object.keys(r.data.people[0]).sort(),['active','cesEmail','email','id','mobile','name','statutoryName']);assert.equal(r.data.people[0].email,'teacher.one@gsps.edu.sg');assert.equal(r.data.people[0].cesEmail,'teacher.ces@schools.gov.sg');assert.equal(r.data.people[0].mobile,'91234567');assert.deepEqual(cReads,[['contacts','roles']]);assert(!JSON.stringify(r.data).includes('Day of Birth'));
});
test('Contacts known-key check still reads source and direct sheet edits change digest without epoch changes',()=>{
 cReads.length=0;const epochs=[contacts.props.get('CONTACTS_DATA_EPOCH'),contacts.props.get('DEPLOY_READ_EPOCH')];const same=contactsPost({operation:'manifest',knownKey:firstContact.key});assert.equal(same.data.unchanged,true);assert.equal(same.data.people,undefined);assert.deepEqual(cReads,[['contacts','roles']]);
 put('Basic Name','Direct edit');const changed=contactsPost({operation:'manifest',knownKey:firstContact.key});assert.equal(changed.data.unchanged,undefined);assert.notEqual(changed.data.key,firstContact.key);assert.equal(changed.data.people[0].name.startsWith('Direct edit'),true);assert.deepEqual([contacts.props.get('CONTACTS_DATA_EPOCH'),contacts.props.get('DEPLOY_READ_EPOCH')],epochs);
 assert.equal(contactsPost({operation:'snapshot',expectedKey:firstContact.key}).code,'SOURCE_CHANGED');firstContact=changed.data;
});
test('Contacts direct role-derived name and phone edits invalidate, while unrelated birthday edits do not',()=>{
 put('Role','PE');contacts.sheets.get('roles').data.push(['PE','']);const changed=contactsPost({operation:'manifest',knownKey:firstContact.key});assert.notEqual(changed.data.key,firstContact.key);assert.match(changed.data.people[0].name,/\(PE\)/);firstContact=changed.data;
 put('Mobile No','92345678');const phone=contactsPost({operation:'manifest',knownKey:firstContact.key});assert.notEqual(phone.data.key,firstContact.key);firstContact=phone.data;put('Day of Birth','13');assert.equal(contactsPost({operation:'manifest',knownKey:firstContact.key}).data.unchanged,true);
});
test('Contacts refuses pending/changed boundary or ambiguous identity without exposing partial or stale unchanged data',()=>{
 contacts.props.set('CONTACTS_PENDING_V2','{"contact_save_journal":{"id":"pending"}}');cReads.length=0;assert.equal(contactsPost({operation:'manifest',knownKey:firstContact.key}).code,'SOURCE_UNAVAILABLE');assert.equal(cReads.length,0);contacts.props.set('CONTACTS_PENDING_V2','{}');
 const reader=contacts.ctx.GSISSheets.readTables;contacts.ctx.GSISSheets.readTables=(...args)=>{const value=reader(...args);contacts.props.set('CONTACTS_DATA_EPOCH',crypto.randomUUID());return value;};assert.equal(contactsPost({operation:'manifest',knownKey:firstContact.key}).code,'SOURCE_CHANGED');contacts.ctx.GSISSheets.readTables=reader;
 const original=cSheet.data[1].slice();cSheet.data.push(original.slice());assert.equal(contactsPost().code,'SOURCE_INVALID');cSheet.data.pop();
});
let deployReads=0,indexReads=0;const docRead=deploy.ctx.lordDeployDocument_,indexRead=deploy.ctx.index_;
deploy.ctx.lordDeployDocument_=(...args)=>{deployReads++;return docRead(...args);};deploy.ctx.index_=(...args)=>{indexReads++;return indexRead(...args);};
test('actual signed Deploy route reads frozen publication with stable refs and no private planning data',()=>{
 const r=deployPost();assert.equal(r.ok,true,JSON.stringify(r));firstDeploy=r.data;assert.equal(r.data.source,'deploy');assert.match(r.data.key,/^[a-f0-9]{64}$/);assert.equal(r.data.publication.commit,vm.runInContext('publishedEntry_(index_(book_())).commit',deploy.ctx));assert.equal(r.data.publication.updatedAt,r.data.updatedAt);assert(r.data.classes.every(c=>c.id&&c.name));assert(r.data.subjects.every(s=>s.id===s.name));assert.equal(r.data.assignments,undefined);assert.equal(r.data.teachers,undefined);assert.equal(r.data.workloads,undefined);assert.equal(deployReads,1);
});
test('unpublished 2027 edits do not reload or invalidate published reference',()=>{
 vm.runInContext("var lordPlanningId=call('change',{operation:'create',name:'Unpublished 2027 fixture',sourceVersionId:publishedEntry_(index_(book_())).id,duplicate:true,requestId:Utilities.getUuid()}).versionId;var lordDraftIndex=index_(book_()),lordDraft=document_(book_(),lordDraftIndex.versions.find(e=>e.id===lordPlanningId));lordDraft.from='2027-01-01';lordDraft.to='2027-12-31';lordDraft.classes[0].name='Unpublished label';persist_(book_(),lordDraftIndex,lordDraft,Utilities.getUuid());",deploy.ctx);
 deployReads=0;indexReads=0;const r=deployPost({operation:'manifest',knownKey:firstDeploy.key});assert.equal(r.data.unchanged,true);assert.equal(r.data.key,firstDeploy.key);assert.equal(deployReads,0);assert(indexReads<=2);assert.equal(r.data.classes,undefined);
});
test('Deploy expected-key and pending guards run before document reads and never perform recovery',()=>{
 deployReads=0;assert.equal(deployPost({operation:'snapshot',expectedKey:'f'.repeat(64)}).code,'SOURCE_CHANGED');assert.equal(deployReads,0);
 const idx=vm.runInContext('index_(book_())',deploy.ctx),prior=JSON.stringify(idx);idx.pendingFieldCommit={commit:'unfinished'};deploy.sheets.get('deploy_index').data[1][1]=JSON.stringify(idx);assert.equal(deployPost({operation:'manifest',knownKey:firstDeploy.key}).code,'SOURCE_UNAVAILABLE');assert.equal(deployReads,0);assert.equal(deploy.sheets.get('deploy_index').data[1][1],JSON.stringify(idx));deploy.sheets.get('deploy_index').data[1][1]=prior;
});
test('Deploy changed publication during snapshot fails instead of labelling mixed content with old key',()=>{
 const prior=deploy.sheets.get('deploy_index').data[1][1],reader=deploy.ctx.lordDeployDocument_;deploy.ctx.lordDeployDocument_=(...args)=>{const data=reader(...args),idx=JSON.parse(prior);idx.published.commit='new-published-commit';deploy.sheets.get('deploy_index').data[1][1]=JSON.stringify(idx);return data;};
 assert.equal(deployPost({operation:'snapshot',expectedKey:firstDeploy.key}).code,'SOURCE_CHANGED');deploy.ctx.lordDeployDocument_=reader;deploy.sheets.get('deploy_index').data[1][1]=prior;
});
test('no publication is unavailable; a planning version is never substituted',()=>{
 const prior=deploy.sheets.get('deploy_index').data[1][1],idx=JSON.parse(prior);idx.published=null;idx.publicationSchema=1;deploy.sheets.get('deploy_index').data[1][1]=JSON.stringify(idx);assert.equal(deployPost().code,'SOURCE_UNAVAILABLE');deploy.sheets.get('deploy_index').data[1][1]=prior;
});
test('both signed entry paths reject expired/wrong-source/extra-field/bad signatures before source reads',()=>{
 for(const [h,source]of [[contacts,'contacts'],[deploy,'deploy']])for(const change of [{timestamp:0},{source:source==='contacts'?'deploy':'contacts'},{identity:{email:'invented@gsps.edu.sg',subject:'invented'}}]){cReads.length=0;deployReads=0;indexReads=0;assert.equal(call(h,signed(source,{operation:'manifest'},change)).ok,false);assert.equal(cReads.length,0);assert.equal(deployReads,0);assert.equal(indexReads,0);}
 for(const [h,source]of [[contacts,'contacts'],[deploy,'deploy']]){const event=signed(source),env=JSON.parse(event.postData.contents);env.signature='0'.repeat(64);event.postData.contents=JSON.stringify(env);assert.equal(call(h,event).status,401);assert.equal(call(h,signed(source,{operation:'snapshot',versionId:'planning'})).status,400);}
});
test('explicit publication changes key, carries stored dates and retains stable class references',()=>{
 const classId=vm.runInContext('lordDraft.classes[0].ref',deploy.ctx);
 vm.runInContext("var lordLease=call('lease',{versionId:lordPlanningId,key:'meta',clientId:'lord-test'});call('change',{...lordLease,versionId:lordPlanningId,key:'meta',clientId:'lord-test',requestId:Utilities.getUuid(),operation:'publish'})",deploy.ctx);
 const r=deployPost({operation:'manifest',knownKey:firstDeploy.key});assert.equal(r.ok,true,JSON.stringify(r));assert.notEqual(r.data.key,firstDeploy.key);assert.equal(r.data.publication.name,'Unpublished 2027 fixture');assert.equal(r.data.publication.from,'2027-01-01');assert.equal(r.data.publication.to,'2027-12-31');assert.equal(r.data.classes.find(c=>c.id===classId).fullName,'Unpublished label');assert.equal(r.data.publication.id,vm.runInContext('lordPlanningId',deploy.ctx));
});
test('legacy published classes without stable refs fail closed instead of generating rename-sensitive IDs',()=>{
 const reader=deploy.ctx.lordDeployDocument_;deploy.ctx.lordDeployDocument_=(...args)=>{const d=reader(...args);delete d.classes[0].ref;return d;};assert.equal(deployPost({operation:'snapshot'}).code,'SOURCE_INVALID');deploy.ctx.lordDeployDocument_=reader;
});
test('class labels use the exact published classKey convention without a second normalisation',()=>{
 const reader=deploy.ctx.lordDeployDocument_;let expected;deploy.ctx.lordDeployDocument_=(...args)=>{const d=reader(...args);d.classes[0].shortName='1A';d.classes[0].level='1';expected={id:d.classes[0].ref,name:'11A'};return d;};const r=deployPost({operation:'snapshot'});assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.data.classes.find(c=>c.id===expected.id).name,expected.name);deploy.ctx.lordDeployDocument_=reader;
});
test('the Roster build cannot serve the Deploy source even with a valid LORD signature',()=>{
 let opens=0;const context=vm.createContext({console:{info(){},error(){},log(){}},PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='LORD_BRIDGE_SECRET'?secret:null})},Utilities:deploy.ctx.Utilities,ContentService:deploy.ctx.ContentService,SpreadsheetApp:{openById(){opens++;throw Error('Wrong backend must not open a workbook');}}});
 vm.runInContext(fs.readFileSync('backend/Code.gs','utf8').replace("const GSIS_BACKEND_KIND='deploy';","const GSIS_BACKEND_KIND='roster';"),context);context.event=signed('deploy');const r=JSON.parse(vm.runInContext('doPost(event).text',context));assert.equal(r.ok,false);assert.equal(r.status,503);assert.equal(opens,0);
});
console.log('PASS '+checks+' signed LORD source contracts.');
