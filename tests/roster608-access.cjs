const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),{JSDOM}=require('jsdom');
const contacts=require('./contacts503-fixture')({source:fs.readFileSync('backend/Contacts_Code_with_Deploy_API.gs','utf8')}),version=require('../package.json').gsisRelease;
const person=contacts.sheets.get('contacts').data[2],roles=contacts.sheets.get('roles');
person[3]='kp';person[10]='HOD ICT';roles.data.push(roles.data[0].map(k=>({'Role Shortform':'HOD ICT',SMC:'1',KP:'1','Appointment Level':'HOD'}[k]||'')));
const source=fs.readFileSync('backend/Code.gs','utf8'),start=source.indexOf('function doPost(e){'),end=source.indexOf('\nfunction auth_',start),logs=[];
let absent=false,driveReads=0;
const ctx={GSISRoster:require('../shared/roster'),GSIS_DEPLOY_VERSION:version,GSISSheets:{resetStats(){}},props_:()=>({getProperty:k=>k==='BRIDGE_SECRET'?'x'.repeat(32):null}),same_:()=>true,signature_:()=> 'signed',out_:x=>x,error_:(status,message)=>{throw Object.assign(Error(message),{status})},Utilities:{getUuid:crypto.randomUUID,formatDate:()=> '2026-10-13'},ScriptApp:{getOAuthToken:()=> 'test-drive-token'},UrlFetchApp:{fetch(url,request){
 driveReads++;assert.equal(request.method||'get','get','Access checks must not write to Drive');assert.equal(request.headers.Authorization,'Bearer test-drive-token');assert.equal(request.muteHttpExceptions,true);assert.equal(request.followRedirects,false);
 const endpoint=new URL(url);assert.equal(endpoint.origin,'https://www.googleapis.com');assert.equal(endpoint.searchParams.get('supportsAllDrives'),'true');
 let data;if(endpoint.pathname==='/drive/v3/files'){assert.equal(endpoint.searchParams.get('includeItemsFromAllDrives'),'true');assert.equal(endpoint.searchParams.get('corpora'),'drive');assert.equal(endpoint.searchParams.get('driveId'),'test-shared-drive');data={files:[]};}else{assert.match(endpoint.pathname,/^\/drive\/v3\/files\/[^/]+$/);data={mimeType:'application/vnd.google-apps.folder',driveId:'test-shared-drive',capabilities:{canAddChildren:true,canEdit:true}};}
 return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(data)};
}},console:{log:s=>logs.push(JSON.parse(s)),error:s=>logs.push(JSON.parse(s))},contacts_:(identity,authorityOnly,action,input)=>{
 assert.equal(action,'deploySnapshot');assert.equal(input.rosterAuthority,true);assert.equal(input.authorityOnly,true);
 contacts.run('contactReadCache_.clear();contactPrefetchedValues_.clear()');
 const result=contacts.post(action,input,identity.email);assert.equal(result.ok,true,JSON.stringify(result));if(absent)delete result.data.user.rosterSMC;return result.data;
}};
ctx.PropertiesService={getScriptProperties:ctx.props_};vm.createContext(ctx);require('./load-backend-role.cjs')(ctx,'roster');vm.runInContext(fs.readFileSync('backend/ApiSecret.gs','utf8'),ctx);vm.runInContext(source.slice(start,end),ctx);vm.runInContext(fs.readFileSync('backend/Roster.gs','utf8'),ctx);
const call=(action='rosterProfile',email='kp@gsps.edu.sg')=>ctx.doPost({postData:{contents:JSON.stringify({payload:JSON.stringify({action,input:{date:'2026-10-13'},identity:{email,subject:email},timestamp:Date.now(),nonce:crypto.randomUUID()}),signature:'signed'})}});
const profile=call();assert.equal(profile.ok,true);assert.equal(profile.data.user.smc,true);assert.equal(profile.data.user.accessVerified,true);assert.equal(profile.data.active,null);assert.equal(profile.data.entries.length,0);
// Incompatible Contacts is unknown authority, never a successful teacher-only profile.
absent=true;driveReads=0;assert.equal(call().status,503);assert.equal(driveReads,0);assert.equal(logs.at(-1).phase,'contacts-authority');assert.match(logs.at(-1).message,/existing Contacts web app deployment/);assert.doesNotMatch(call().error,/Contacts/);absent=false;
assert.equal(call('rosterUpload').status,403,'SMC without Admin cannot upload baseline timetables');
person[10]='Teacher';assert.equal(call().data.user.smc,false);assert.equal(call('rosterUpload').status,403);person[10]='HOD ICT';person[15]='N';assert.equal(call().data.user.smc,false);person[15]='Y';
assert.equal(call('rosterUpload','admin@gsps.edu.sg').status,400,'Admin without SMC reaches upload validation');
// Exercise the actual signed Contacts result through Deploy dispatch and the browser UI.
(async()=>{
 const dom=new JSDOM(fs.readFileSync('roster-update/public/index.html','utf8'),{url:'https://roster.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,doc=w.document;
 // This access fixture has a verified empty timetable batch. Home must not
 // infer today's status from the old current/upcoming catalogue wording.
 w.RosterTimetablePreload={create:()=>({start(){},clear(){},invalidate(){},isDue:()=>false,snapshot:()=>({phase:'ready'}),getBaseline:()=>null,getPlan:()=>null,getTimetableStatus:()=>null})};
 let legacyDeploy=false;
 w.fetch=async url=>{
  const route=String(url).split('/').pop();if(route==='config')return {ok:true,status:200,json:async()=>({clientId:'test'})};if(route==='session')return {ok:true,json:async()=>({ok:true,data:{}})};
  const result=call(route==='profile'?'rosterProfile':'rosterRead');if(legacyDeploy&&result.ok)delete result.data.user.accessVerified;
  return {ok:result.ok,status:result.status||200,json:async()=>result};
 };
 const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('Roster did not reach expected UI: '+doc.querySelector('#content').textContent)};
 try{
  for(const file of ['roster-model.js','roster-export.js','roster.js'])vm.runInContext(fs.readFileSync('roster-update/public/'+file,'utf8'),dom.getInternalVMContext());
  await wait(()=>doc.querySelector('.function-tile[data-page="Baseline Timetable"]'));assert.equal(doc.querySelector('.function-title').textContent,'Stapler');assert.match(doc.querySelector('[data-home-timetable]').textContent,/^No timetable active today /);
  doc.querySelector('.function-tile[data-page="Baseline Timetable"]').click();await wait(()=>doc.querySelector('#savedTimetables'));assert.equal(doc.querySelector('#uploadForm'),null);assert.equal(doc.querySelector('[data-baseline="upload"]'),null);
  // A stale Deploy response must not preserve an already visible privileged form.
  legacyDeploy=true;doc.querySelector('#refresh').click();await wait(()=>doc.querySelector('#retryLoad'));assert.match(doc.querySelector('.recovery').textContent,/access could not be verified/);assert.equal(doc.querySelector('#nav').hidden,true);assert.equal(doc.querySelector('#uploadForm'),null);
  legacyDeploy=false;doc.querySelector('#retryLoad').click();await wait(()=>doc.querySelector('.function-tile[data-page="Baseline Timetable"]'));
  doc.querySelector('.function-tile[data-page="Baseline Timetable"]').click();await wait(()=>doc.querySelector('#savedTimetables'));absent=true;doc.querySelector('#refresh').click();await wait(()=>doc.querySelector('#retryLoad'));assert.equal(doc.querySelector('#uploadForm'),null);assert.equal(doc.querySelector('#nav').hidden,true);
  absent=false;person[10]='Teacher';doc.querySelector('#retryLoad').click();await wait(()=>doc.querySelector('.function-tile[data-page="Timetable"]')&&!doc.querySelector('.function-tile[data-page="Baseline Timetable"]'));assert.doesNotMatch(doc.querySelector('#nav').textContent,/Baseline/);assert.equal(doc.querySelector('#uploadForm'),null);
  console.log('PASS Roster608 access: signed Contacts→Deploy→Roster UI, Admin-only upload, SMC baseline list, unknown authority recovery, teacher/inactive denial');
 }finally{w.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
