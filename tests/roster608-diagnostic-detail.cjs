const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const loadBackendRole=require('./load-backend-role.cjs');
const source=loadBackendRole.sourceForRole(fs.readFileSync(process.env.GSIS_DEPLOY_DIAGNOSTIC_SOURCE||'backend/Code.gs','utf8'),'roster');
const diagnosticBuild=/const GSIS_DEPLOY_VERSION='([^']+)'/.exec(source)[1]+'-roster-diag1';
const bridge='bridge-private-'+ 'b'.repeat(40),contactsSecret='contacts-private-'+ 'c'.repeat(40);
const contactsUrl='https://script.google.com/macros/s/contacts-test/exec',publishedUrl='https://script.google.com/macros/s/deploy-test/exec';
const reference='11111111-2222-3333-4444-555555555555',email='private.owner@gsps.edu.sg',driveToken='private-drive-oauth-token';
const digest=(text,key)=>crypto.createHmac('sha256',key).update(text).digest('hex');
const activeEntry={id:'active-timetable',name:'Private timetable',from:'2020-01-01',to:'2099-12-31',priority:1,modelFile:'model-file'};
const register=JSON.stringify({schema:1,revision:1,entries:[activeEntry],receipts:[]});
function harness(options={}){
 const logs=[],cache=new Map(),calls={contacts:0,published:0,drive:0,writes:0,output:0},properties={BRIDGE_SECRET:bridge,CONTACTS_API_URL:contactsUrl,CONTACTS_BRIDGE_SECRET:contactsSecret,...options.properties};
 const forbidden=()=>{calls.writes++;throw Error('Unexpected business write');};
 const log=text=>{if(options.logFailure)throw Error('Console unavailable');logs.push(JSON.parse(text));};
 const cacheApi={get(key){if(options.cacheFailure)throw Error('Cache unavailable');return cache.get(key)||null;},put(key,value,ttl){if(options.cacheFailure)throw Error('Cache unavailable');assert.ok(ttl<=21600);cache.set(key,value);}};
 const response=(raw,status=200)=>({getContentText:()=>raw,getResponseCode:()=>status});
 let ctx;
 const globals={
  console:{log,info:log,error:log},Logger:{log:text=>{if(options.loggerFailure)throw Error('Logger unavailable');logs.push(JSON.parse(text));}},
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key]??null,setProperty:forbidden,deleteProperty:forbidden})},
  CacheService:{getScriptCache:()=>cacheApi},
  Utilities:{Charset:{UTF_8:'utf8'},getUuid:crypto.randomUUID,DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,text)=>[...crypto.createHash('sha256').update(text).digest()],computeHmacSha256Signature:(text,key,charset='utf8')=>[...crypto.createHmac('sha256',Buffer.from(key,charset)).update(text,charset).digest()],formatDate:()=> '2026-10-13'},
  ContentService:{MimeType:{JSON:'application/json'},createTextOutput(text){calls.output++;if(options.outputFailures>0){options.outputFailures--;throw Error('Response output unavailable');}return {setMimeType(){return this;},getContent:()=>text};}},
  Session:{getEffectiveUser:()=>({getEmail:()=>email})},ScriptApp:{getService:()=>({getUrl:()=>publishedUrl}),getOAuthToken:()=>driveToken},
  SpreadsheetApp:{openById(){throw Error('Roster must not read Deploy spreadsheet');},flush:forbidden},
  UrlFetchApp:{fetch(url,request){
   if(url.startsWith('https://www.googleapis.com/')){
    calls.drive++;if(request.method&&request.method.toLowerCase()!=='get')return forbidden();
    const endpoint=new URL(url);assert.equal(request.headers.Authorization,'Bearer '+driveToken);assert.equal(request.muteHttpExceptions,true);assert.equal(request.followRedirects,false);assert.equal(endpoint.searchParams.get('supportsAllDrives'),'true');
    const denied=message=>response(JSON.stringify({error:{message,errors:[{reason:'insufficientFilePermissions'}]}}),403);
    if(endpoint.pathname==='/drive/v3/files'){
     assert.equal(endpoint.searchParams.get('includeItemsFromAllDrives'),'true');assert.equal(endpoint.searchParams.get('corpora'),'drive');assert.equal(endpoint.searchParams.get('driveId'),'private-shared-drive-id');assert.match(endpoint.searchParams.get('q'),/name = 'Roster register\.json'/);
     return response(JSON.stringify({files:options.registerRaw===undefined?[]:[{id:'register-file'}]}));
    }
    if(endpoint.searchParams.get('alt')==='media'){
     const id=decodeURIComponent(endpoint.pathname.split('/').at(-1));assert.ok(['register-file','model-file'].includes(id));
     const fault=id==='register-file'?options.registerError:options.modelError;if(fault)return denied(fault);
     return response(id==='register-file'?options.registerRaw:options.modelRaw);
    }
    assert.match(endpoint.pathname,/^\/drive\/v3\/files\/[^/]+$/);if(options.folderError)return denied(options.folderError);
    return response(JSON.stringify({mimeType:'application/vnd.google-apps.folder',driveId:'private-shared-drive-id',capabilities:{canAddChildren:true,canEdit:true}}));
   }
   assert.equal(request.method,'post');assert.equal(request.muteHttpExceptions,true);
   const envelope=JSON.parse(request.payload),payload=JSON.parse(envelope.payload);
   if(url===contactsUrl){calls.contacts++;assert.equal(envelope.signature,digest(envelope.payload,contactsSecret));assert.equal(payload.action,'deploySnapshot');assert.equal(payload.input.rosterAuthority,true);assert.equal(payload.input.authorityOnly,true);assert.equal(payload.identity.email,email);if(options.contactsError)throw Error(options.contactsError);return response(options.contactsRaw??JSON.stringify({ok:true,data:{user:{rosterSMC:true}}}),options.contactsHttpStatus||200);}
   assert.equal(url,publishedUrl);calls.published++;assert.equal(envelope.signature,digest(envelope.payload,bridge));assert.equal(payload.action,'rosterProfile');
   if(options.publishedHtml)return response('<html>Private response body</html>');
   // A separate VM represents the published deployment; it runs the actual
   // signed doPost/Contacts/Drive/output path with its own invocation globals.
   const remote=harness({buildOverride:options.oldPublishedBuild?'older-diagnostic-build':undefined});
   const result=remote.ctx.doPost({postData:{contents:request.payload}}).getContent();assert.equal(remote.calls.writes,0);return response(result);
  }}
 };
 ctx=vm.createContext(globals);vm.runInContext(source,ctx);if(options.buildOverride)ctx.rosterDiagnosticBuild_=()=>options.buildOverride;loadBackendRole(ctx,'roster');
 const run=text=>vm.runInContext(text,ctx);
 function call(changes={},signature){const payload=JSON.stringify({action:'rosterProfile',input:{date:'2026-10-13'},identity:{email,subject:'private-google-subject'},timestamp:Date.now(),nonce:reference,traceId:reference,...changes});return JSON.parse(ctx.doPost({postData:{contents:JSON.stringify({payload,signature:signature??digest(payload,bridge)})}}).getContent());}
 const failures=()=>logs.filter(x=>x.event==='roster-backend-failed');
 return {ctx,run,call,failures,logs,cache,calls,properties,options};
}
function expectFailure(h,result,status,phase){assert.equal(result.ok,false);assert.equal(result.status,status);assert.equal(h.failures().at(-1).phase,phase);assert.equal(h.failures().at(-1).diagnosticId,reference);assert.equal(h.calls.writes,0);}

// Signed request handling uses the real HMAC implementation, including failures
// before dispatch and before a browser-supplied action is known to be trusted.
{
 const h=harness();expectFailure(h,h.call({},'incorrect'),401,'bridge-signature');assert.equal(h.calls.contacts,0);assert.equal(h.failures()[0].authenticated,false);
 const save=harness(),saveFailure=save.call({action:'rosterOperations',input:{operation:'saveStapler',date:'2026-10-21',plan:{privateText:'PRIVATE_IMPORTED_PLAN — 华文'}}},'incorrect');
 expectFailure(save,saveFailure,401,'bridge-signature');assert.equal(saveFailure.diagnosticId,reference);assert.equal(saveFailure.failureStage,'bridge-signature');assert.equal(saveFailure.backendVersion,save.run('GSIS_DEPLOY_VERSION'));assert.equal(save.failures()[0].action,'rosterOperations');assert.equal(save.failures()[0].authenticated,false);assert.equal(save.calls.contacts,0);assert.equal(save.calls.drive,0);assert.doesNotMatch(JSON.stringify([saveFailure,save.logs]),/PRIVATE_IMPORTED_PLAN|华文/);
 const expired=harness();expectFailure(expired,expired.call({timestamp:Date.now()-120000}),401,'request-freshness');assert.equal(expired.calls.contacts,0);
 const config=harness({properties:{BRIDGE_SECRET:null}});expectFailure(config,config.call(),503,'bridge-config');assert.equal(config.calls.contacts,0);
 const contactsConfig=harness({properties:{CONTACTS_API_URL:null}});expectFailure(contactsConfig,contactsConfig.call(),503,'contacts-config');assert.equal(contactsConfig.calls.contacts,0);
 const invalid=harness(),result=JSON.parse(invalid.ctx.doPost({postData:{contents:'not JSON'}}).getContent());assert.equal(result.ok,false);assert.equal(invalid.failures().at(-1).phase,'request-envelope');assert.equal(invalid.calls.contacts,0);
}

// Contacts transport/shape failures remain safe JSON errors with precise stages.
for(const [raw,phase,format] of [
 ['<html>Private response body</html>','contacts-json','html'],
 ['{"ok":','contacts-json','other'],
 ['null','contacts-result','json'],
 [JSON.stringify({ok:true,data:{user:{}}}),'contacts-authority','json']
]){
 const h=harness({contactsRaw:raw});expectFailure(h,h.call(),503,phase);assert.equal(h.failures().at(-1).contacts.format,format);assert.equal(h.calls.drive,0);assert.doesNotMatch(JSON.stringify(h.logs),/Private response body/);
}
{
 const h=harness({contactsRaw:JSON.stringify({ok:false,status:403,error:'School account required'})});expectFailure(h,h.call(),403,'contacts-result');
 const success=harness(),result=success.call();assert.equal(result.ok,true);assert.equal(result.data.user.accessVerified,true);assert.equal(result.data.active,null);assert.deepEqual(result.data.entries,[]);assert.equal(result.data.timing.diagnosticBuild,diagnosticBuild);assert.equal(success.logs.at(-1).event,'roster-response-ready');assert.equal(success.logs.at(-1).roster.registerFound,false);assert.equal(success.calls.writes,0);
}

// Storage reads and parsing/validation are distinct; no test operation writes.
for(const [options,action,phase] of [
 [{folderError:'Permission denied'},'rosterProfile','register-discovery'],
 [{registerRaw:register,registerError:'Permission denied'},'rosterProfile','register-read'],
 [{registerRaw:'{"schema":'},'rosterProfile','register-json'],
 [{registerRaw:JSON.stringify({schema:2,revision:0,entries:[]})},'rosterProfile','register-schema'],
 [{registerRaw:register,modelError:'Permission denied'},'rosterRead','timetable-read'],
 [{registerRaw:register,modelRaw:'{"layoutMode":'},'rosterRead','timetable-json'],
 [{registerRaw:register,modelRaw:'{}'},'rosterRead','timetable-validation']
]){const h=harness(options);expectFailure(h,h.call({action}),503,phase);}

// One failed response creation is caught and returned as a JSON failure. A failed
// telemetry service cannot turn a successful business read into an error.
{
 const h=harness({outputFailures:1});expectFailure(h,h.call(),503,'response-create');assert.equal(h.calls.output,2);assert.equal(h.logs.at(-1).event,'roster-response-error');
 const fallback=harness({logFailure:true});assert.equal(fallback.call().ok,true);assert.ok(fallback.logs.some(x=>x.event==='roster-response-ready'));
 const unavailable=harness({logFailure:true,loggerFailure:true,cacheFailure:true});assert.equal(unavailable.call().ok,true);assert.equal(unavailable.calls.writes,0);
 const failedUnavailable=harness({logFailure:true,loggerFailure:true,cacheFailure:true,contactsRaw:'<html>private</html>'});assert.equal(failedUnavailable.call().status,503);
}

// Reports and fallback cache must never copy service payloads or user details.
{
 const sensitive='Alice Tan PRIVATE_WORKBOOK_CELL '+email+' '+contactsUrl+' '+bridge+' '+contactsSecret+' 1PrivateDriveIdentifier0123456789';
 const h=harness({contactsError:sensitive});assert.equal(h.call().status,503);
 const report=h.ctx.showRosterDiagnostics();assert.equal(report.readOnly,true);assert.equal(report.lastFailure.diagnosticId,reference);assert.equal(report.latest.event,'roster-response-error');
 const ownerReport=h.ctx.diagnoseRoster();assert.equal(ownerReport.ready,false);assert.equal(h.calls.writes,0);
 assert.doesNotMatch(JSON.stringify([h.logs,[...h.cache.values()],report,ownerReport]),/Alice Tan|PRIVATE_WORKBOOK_CELL|private\.owner|private-google-subject|contacts-test|bridge-private|contacts-private|1PrivateDriveIdentifier|private-drive-oauth-token|private-shared-drive-id/);
 const unavailable=harness({cacheFailure:true});assert.equal(unavailable.ctx.showRosterDiagnostics().readOnly,true);
}

// The editor diagnostic exercises real Contacts and an isolated published
// doPost, reports old deployments, and restores the caller's tracing state.
{
 const h=harness();h.run('deployTrace_={sentinel:true}');const report=h.ctx.diagnoseRoster();assert.equal(report.ready,true);assert.equal(report.checks.length,5);assert.equal(h.calls.contacts,1);assert.equal(h.calls.published,1);assert.equal(h.calls.writes,0);assert.equal(h.run('deployTrace_.sentinel'),true);assert.doesNotMatch(JSON.stringify([report,h.logs]),/private\.owner|private-google-subject|Private folder|Private timetable|bridge-private|contacts-private|private-drive-oauth-token|private-shared-drive-id/);
 const old=harness({oldPublishedBuild:true}),oldReport=old.ctx.diagnoseRoster();assert.equal(oldReport.ready,false);assert.match(oldReport.checks.find(x=>x.name==='Published Roster profile').message,/does not contain this diagnostic build/);assert.equal(old.calls.writes,0);
 const html=harness({publishedHtml:true}),htmlReport=html.ctx.diagnoseRoster();assert.equal(htmlReport.ready,false);assert.equal(htmlReport.checks.find(x=>x.name==='Published Roster profile').format,'html');assert.doesNotMatch(JSON.stringify(htmlReport),/Private response body/);
}
console.log('PASS Roster diagnostic detail: real signed backend, early failures, Contacts/Drive stages, output and telemetry failures, private reports, and read-only published deployment checks');
