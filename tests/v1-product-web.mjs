import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile,mkdtemp,rm,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM,VirtualConsole} from 'jsdom';
import JSZip from 'jszip';
import {buildWeb} from '../scripts/v1/build-web.mjs';
import {encodeWorkbook,decodeWorkbook} from '../v1/web/shared/workbooks.mjs';
import {runCases,main} from './v1-core-authority.mjs';
import {digest as ownerDigest} from '../v1/runtime/store.mjs';
const root=new URL('../',import.meta.url),client=await readFile(new URL('../v1/web/shared/client.js',import.meta.url),'utf8');
const identity={schoolId:'school-a',user:{accountId:'account-a',email:'actor@example.test',staffId:'staff-a',roles:['Admin']},capabilities:['admin','core.admin','deploy.edit','deploy.publish'],csrfToken:'csrf-proof',expiresAt:9999999999999};
function browser(module,handler){const vc=new VirtualConsole(),dom=new JSDOM('<meta name="gsis-module" content="'+module+'"><p>fixture</p>',{url:'https://school.test/'+module+'/',runScripts:'outside-only',virtualConsole:vc});const w=dom.window;Object.assign(w,{fetch:handler,Response,Request,Headers,structuredClone,TextEncoder,TextDecoder});Object.defineProperty(w.crypto,'subtle',{value:webcrypto.subtle});w.eval(client);return {window:w,api:w.GSISV1,close:()=>w.close()};}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const workbook={schemaVersion:1,metadata:{'School ID':'school-a','Version ID':'version-a','Base Working Revision':3,'Table Scope':'IP','Schema Version':1,mode:'importable'},sheets:{Classes:{columns:['Class ID','Level','Class Name','Short Name','Ability','Venue ID'],rows:[['0001',1,'=literal name','1A',null,'venue-1']]},FormTeachers:{columns:['Class ID','Staff ID','TTb Name'],rows:[['0001','staff-a','One'],['0001','staff-b','Two']]},TeachingAssignments:{columns:['Assignment ID','Class ID','Subject Code','Staff ID','TTb Name'],rows:[['assignment-1','0001','ENG','staff-a','One']]}}};
// Response contracts below come from the owning services. These are transport
// compatibility tests with real WebCrypto, not evidence of a durable owner write.
async function directCompatibility(domain,path,body,data,expectedPending=0) {
 const calls=[];
 const b=browser(domain,async(input,init={})=>{
  const requestPath=new URL(input.url||input,'https://school.test').pathname;
  if(requestPath==='/api/core/session')return json({ok:true,data:identity});
  const wire=JSON.parse(init.body);calls.push({path:requestPath,wire});
  return json({ok:true,data:typeof data==='function'?await data(wire):data});
 });
 try {
  const result=await b.api.request(domain,path,{method:'POST',body:structuredClone(body)});
  assert.equal(calls.length,1,'compatibility handling must not resend or query another endpoint');
  assert.equal(calls[0].path,'/api/'+domain+path);
  const pending=b.api.pending();
  assert.equal(pending.length,expectedPending,'only a complete bound direct result settles its slot');
  if(expectedPending)assert.equal(pending[0].operationId,body.operationId||body.payload.operationId);
  return result;
 } finally {b.close();}
}
async function compatibilityVariants(domain,path,body,success,invalid) {
 await directCompatibility(domain,path,body,success);
 for(const result of invalid)await directCompatibility(domain,path,body,result,1);
}
if(main(import.meta.url))await runCases([
 ['web transport namespaces requests and binds CSRF without supplied identity',async()=>{const calls=[];const b=browser('deploy',async(input,init={})=>{const path=new URL(input.url||input,'https://school.test').pathname;calls.push({path,init});return json({ok:true,data:path==='/api/core/session'?identity:{state:'committed',saved:true}});});try{await b.api.fetch('/api/change',{method:'POST',headers:{'Content-Type':'application/json','X-GSiS-Actor':'attacker','X-GSiS-Roles':'Admin'},body:JSON.stringify({operation:'metadata',versionId:'version-a',revision:3,leaseFence:2,authority:'Admin',requestId:'op-a'})});const call=calls.find(x=>x.path==='/api/deploy/change');assert(call);const headers=new Headers(call.init.headers);assert.equal(headers.get('x-csrf-token'),'csrf-proof');assert.equal(headers.get('x-gsis-actor'),null);assert.equal(headers.get('x-gsis-roles'),null);const body=JSON.parse(call.init.body);assert.equal(body.operationId,'op-a');assert.equal(body.authority,undefined);assert.equal(call.init.credentials,'same-origin');}finally{b.close();}}],
 ['web ambiguous save retry retains operation identity and never fabricates commit',async()=>{let attempt=0;const writes=[];const b=browser('deploy',async(input,init={})=>{const path=new URL(input.url||input,'https://school.test').pathname;if(path==='/api/core/session')return json({ok:true,data:identity});writes.push(JSON.parse(init.body));if(++attempt===1)throw new TypeError('response lost');return json({ok:true,data:{state:'pending'}});});try{const options={method:'POST',body:JSON.stringify({operation:'metadata',versionId:'version-a',revision:3,leaseFence:2,name:'Plan'})};await assert.rejects(b.api.fetch('/api/change',options));const reply=await(await b.api.fetch('/api/change',options)).json();assert.equal(writes.length,2);assert.equal(writes[0].operationId,writes[1].operationId);assert.equal(reply.data.state,'pending');assert.equal(reply.data.saved,undefined);assert.equal(b.api.pending().length,1);}finally{b.close();}}],
 ['web logout confirms server invalidation and clears protected drafts only',async()=>{let loggedOut=false;const b=browser('home',async(input,init={})=>{if(String(input).endsWith('/session'))return json({ok:true,data:identity});if(String(input).endsWith('/logout')){assert.equal(new Headers(init.headers).get('x-csrf-token'),'csrf-proof');assert.equal(typeof JSON.parse(init.body).operationId,'string');loggedOut=true;return json({ok:true,data:{state:'committed'}});}return json({ok:true,data:{}});});try{b.window.localStorage.setItem('gsis.deploy.draft','private');b.window.sessionStorage.setItem('lord_reference','private');b.window.localStorage.setItem('unrelatedPreference','keep');await b.api.logout();assert(loggedOut);assert.equal(b.window.localStorage.getItem('gsis.deploy.draft'),null);assert.equal(b.window.sessionStorage.getItem('lord_reference'),null);assert.equal(b.window.localStorage.getItem('unrelatedPreference'),'keep');}finally{b.close();}}],
 ['web logout invalidates late protected responses and retries an uncertain logout with one identity',async()=>{let finishRead,startedRead,logoutCalls=0;const began=new Promise(resolve=>startedRead=resolve),ids=[];const b=browser('contacts',async(input,init={})=>{const path=new URL(input.url||input,'https://school.test').pathname;if(path==='/api/core/session')return json({ok:true,data:identity});if(path==='/api/core/logout'){ids.push(JSON.parse(init.body).operationId);return json({ok:true,data:{state:++logoutCalls===1?'pending':'committed'}});}startedRead();return new Promise(resolve=>finishRead=()=>resolve(json({ok:true,data:{rows:[{private:'old account data'}]}})));});try{await b.api.getSession();const pending=b.api.fetch('/api/contacts/staff');await began;await assert.rejects(b.api.logout(),/not.*confirmed|unconfirmed/i);assert.equal(b.api.capable('admin'),true);await b.api.logout();finishRead();const result=await(await pending).json();assert.equal(result.code||result.error?.code,'SESSION_CHANGED');assert.equal(ids[0],ids[1]);assert.equal(result.data,undefined);}finally{b.close();}}],
 ['web late native session revalidation cannot restore a signed-out actor',async()=>{let reads=0,finish;const b=browser('home',async input=>{if(String(input).endsWith('/logout'))return json({ok:true,data:{state:'committed'}});if(++reads===1)return json({ok:true,data:identity});return new Promise(resolve=>finish=()=>resolve(json({ok:true,data:identity})));});try{await b.api.getSession();const inflight=b.api.getSession(true);await b.api.logout();finish();assert.equal(await inflight,null);assert.equal(b.api.capable('admin'),false);}finally{b.close();}}],
 ['web read-only impersonation disables mutation affordances',async()=>{const b=browser('home',async()=>json({ok:true,data:{...identity,impersonating:true}}));try{await b.api.getSession();assert.equal(b.api.capable('deploy.publish'),false);}finally{b.close();}}],
 ['web transport rejects Apps Script egress before network access',async()=>{let requests=0;const b=browser('home',async()=>{requests++;return json({});});try{await assert.rejects(b.api.fetch('https://script.google.com/macros/s/not-used/exec'),/not a v1 runtime dependency/);assert.equal(requests,0);}finally{b.close();}}],
 ['web scoped-link reads preserve private headers and never coalesce different tokens',async()=>{const calls=[];const b=browser('lord',async(input,init={})=>{const url=new URL(input.url||input,'https://school.test'),token=new Headers(init.headers).get('X-GSiS-Incident-Token');calls.push({url:url.href,token});return json({ok:true,data:{tokenScope:token}});});try{const values=await Promise.all(['scope-a','scope-b'].map(token=>b.api.request('lord','/incidents/respond-context?incidentId=incident-a',{headers:{'X-GSiS-Incident-Token':token}})));assert.deepEqual(values.map(v=>v.tokenScope),['scope-a','scope-b']);assert.equal(calls.length,2);assert(calls.every(call=>!call.url.includes(call.token)));}finally{b.close();}}],
 ['web calendar adapter preserves explicit result and pending status',async()=>{const b=browser('calendar',async input=>new URL(input.url||input,'https://school.test').pathname==='/api/core/session'?json({ok:true,data:identity}):json({ok:true,data:{state:'pending',operationId:'op-calendar'}}));try{const response=await(await b.api.fetch('/api',{method:'POST',body:JSON.stringify({action:'publishVersion',payload:{year:2026}})})).json();assert.equal(response.result.state,'pending');assert.equal(response.result.operationId,'op-calendar');}finally{b.close();}}],
 ['web runtime failure projection preserves exact denial code and retryability',async()=>{const b=browser('contacts',async input=>new URL(input.url||input,'https://school.test').pathname==='/api/core/session'?json({ok:true,data:identity}):json({ok:false,error:{code:'SELF_ACCEPTANCE_DENIED',message:'Another linked manager must accept this record.',retryable:false}},403));try{await assert.rejects(b.api.request('contacts','/staff/staff-a/accept',{method:'POST',body:{operationId:'op-self',field:'eo',value:true,revision:0}}),error=>error.code==='SELF_ACCEPTANCE_DENIED'&&error.retryable===false&&error.message.includes('Another linked manager'));assert.equal(b.api.capable('contacts.manage'),true,'A domain-specific rejection does not invalidate an unrelated Admin session');}finally{b.close();}}],
 ['web Contacts projection preserves missing authority and accepted catalogue labels without role inference',async()=>{const rows=[{staffId:'staff-a',basicName:'A',ttbName:'A',active:null,fields:{role:{state:'accepted',effective:true,value:{catalogueId:'roles',revision:'1',code:'HOD'}}}}];const b=browser('contacts',async()=>json({ok:true,data:{rows,user:{email:'a@example.test',admin:false,powerUser:true},access:{read:true,write:true}}}));try{const bootstrap=await(await b.api.fetch('/api/bootstrap')).json();assert.deepEqual(Array.from(bootstrap.data.user.roles),['ContactsPowerUser']);assert.equal(bootstrap.data.people[0].role,'HOD');assert.equal(bootstrap.data.people[0].appointmentLevel,'');assert.equal(bootstrap.data.people[0].active,'');const grid=await(await b.api.fetch('/api/data')).json();assert.equal(grid.data.rows[0].values[grid.data.fields.indexOf('EO Appt Level')],'');assert.equal(grid.data.rows[0].computed[grid.data.fields.indexOf('EO Appt Level')],true);}finally{b.close();}}],
 ['web Deploy import acknowledgements settle only the original import contract',async()=>{
  for(const [path,extra] of [['/imports/apply',{previewId:'preview-a',digest:'a'.repeat(64)}],['/change',{clientId:'v1-settings-import',edits:[{operation:'setLoad',level:'1',subject:'Science',value:4,expected:3}]}]]) {
   const body={operationId:'import-a',requestId:'transport-a',versionId:'version-a',revision:3,scope:'meta',leaseFence:2,...extra};
   const result={saved:true,versionId:'version-a',requestId:'transport-a',changedRows:2};
   await compatibilityVariants('deploy',path,body,result,[
    {saved:true}, {...result,versionId:'version-b'}, {...result,requestId:'another-request'},
    {...result,changedRows:-1}, {...result,changedRows:1.5}, {...result,saved:false},
   ]);
  }
 }],
 ['web publication acknowledgement preserves queued delivery and validates immutable publication binding',async()=>{
  for(const path of ['/publish','/change']) {
   const body={operationId:'publish-a',versionId:'version-a',revision:3,expectedPointerSequence:4,leaseFence:2,...(path==='/change'?{operation:'publish'}:{})};
   const publicationId='pub-'+(await ownerDigest({school:identity.schoolId,operationId:body.operationId})).slice(0,24);
   const result={saved:true,state:'committed',versionId:'version-a',requestId:'publish-a',publicationId,sequence:5,workingRevision:3,contactsSync:{status:'pending',publicationCommit:publicationId},deliveries:{contacts:'pending',roster:'pending',venues:'pending',layout:'pending'}};
   const reply=await directCompatibility('deploy',path,body,result);
   assert.equal(reply.contactsSync.status,'pending');
   assert(Object.values(reply.deliveries).every(value=>value==='pending'),'local publication does not fabricate recipient delivery');
   for(const invalid of [{saved:true,state:'committed'}, {...result,publicationId:'pub-other'}, {...result,versionId:'version-b'}, {...result,requestId:'another-operation'}, {...result,sequence:6}, {...result,workingRevision:2}, {...result,state:'prepared'}])
    await directCompatibility('deploy',path,body,invalid,1);
  }
 }],
 ['web Contacts delivery requeue settles locally while its recipient remains pending',async()=>{
  const body={operationId:'retry-a',operation:'retryContactsSync',versionId:'version-a',publicationCommit:'pub-a',leaseFence:2};
  const result={saved:true,versionId:'version-a',publicationId:'pub-a',contactsSync:{status:'pending',publicationCommit:'pub-a'}};
  const reply=await directCompatibility('deploy','/change',body,result);
  assert.equal(reply.contactsSync.status,'pending');
  await directCompatibility('deploy','/change',body,{...result,contactsSync:{...result.contactsSync,status:'updated'}});
  for(const invalid of [{saved:true}, {...result,versionId:'version-b'}, {...result,publicationId:'pub-b'}, {...result,contactsSync:{status:'pending',publicationCommit:'pub-b'}}, {...result,contactsSync:{status:'unknown',publicationCommit:'pub-a'}}, {...result,saved:false}])
   await directCompatibility('deploy','/change',body,invalid,1);
 }],
 ['web Calendar definition imports retain partial or differently bound outcomes',async()=>{
  const sourceRevision='a'.repeat(64);
  for(const kind of ['lanes','tags']) {
   const payload={operationId:'calendar-import',workbook:{kind,sourceRevision},expiresAt:9999999999999,previewToken:'preview-proof'};
   const body={action:'tableImportApply',payload},result={saved:true,kind,sourceRevision,changedRecords:12};
   await compatibilityVariants('calendar','/action',body,result,[
    {saved:true}, {...result,kind:kind==='lanes'?'tags':'lanes'}, {...result,sourceRevision:'b'.repeat(64)},
    {...result,changedRecords:13}, {...result,changedRecords:-1}, {...result,changedRecords:0.5}, {...result,saved:false},
   ]);
   await directCompatibility('calendar','/tableImportApply',payload,{...result,changedRecords:0});
  }
 }],
 ['web Calendar archive confirmation preserves queued export and rejects incomplete artifact scope',async()=>{
  const body={action:'archiveYearsCommit',payload:{operationId:'archive-a',selections:[{year:2025,status:'RELEASED'}],previewDigest:'a'.repeat(64),confirm:true}};
  const key='school-a/calendar/archive/'+'b'.repeat(64)+'.json';
  const result={state:'committed',archived:true,fileName:'GSiS Calendar archive 2025.json',artifactKey:key,downloadUrl:'/api/calendar/archive-download?key='+encodeURIComponent(key),counts:{years:1,events:2,Events:2},historyRetained:true,driveExport:'queued'};
  const reply=await directCompatibility('calendar','/action',body,result);
  assert.equal(reply.driveExport,'queued','owner archive receipt is not Drive delivery');
  for(const invalid of [{state:'committed'}, {...result,state:'pending'}, {...result,artifactKey:key.replace('school-a','school-b')}, {...result,downloadUrl:'/wrong-download'}, {...result,historyRetained:false}, {...result,archived:false}, {...result,driveExport:'pending'}, {...result,counts:{years:1,events:2,Events:3}}, {...result,counts:{years:-1,events:2,Events:2}}])
   await directCompatibility('calendar','/action',body,invalid,1);
 }],
 ['web Calendar PDF confirmation uses raw content identity and never confuses it with operation intent',async()=>{
  const payload={operationId:'pdf-a',base64:Buffer.from('%PDF-1.4\nSynthetic local fixture').toString('base64'),name:'Synthetic.pdf'};
  const digest=await ownerDigest(payload.base64),key='school-a/calendar/pdf/'+digest+'.pdf';
  const result={saved:true,key,digest};
  await compatibilityVariants('calendar','/action',{action:'savePdf',payload},result,[
   {saved:true}, {...result,digest:await ownerDigest(JSON.stringify(payload.base64))},
   {...result,digest:await ownerDigest({operationId:payload.operationId})}, {...result,key:key.replace('school-a','school-b')}, {...result,saved:false},
  ]);
  await directCompatibility('calendar','/savePdf',payload,result);
 }],
 ['web plain success cannot clear an ordinary save or settle another endpoint slot',async()=>{
  const ordinary={operationId:'ordinary-a',operation:'saveDraft',versionId:'version-a',revision:3,leaseFence:2,edits:[]};
  await directCompatibility('deploy','/change',ordinary,{saved:true,versionId:'version-a',requestId:'ordinary-a',changedRows:0},1);
  const original={operationId:'import-a',versionId:'version-a',revision:3,previewId:'preview-a',digest:'a'.repeat(64),leaseFence:2};
  const committed={saved:true,versionId:'version-a',requestId:'import-a',changedRows:1};
  let finish=false;
  const b=browser('deploy',async(input)=>{
   const path=new URL(input.url||input,'https://school.test').pathname;
   if(path==='/api/core/session')return json({ok:true,data:identity});
   return json({ok:true,data:path.endsWith('/receipt')||finish?committed:{state:'unknown'}});
  });
  try {
   await b.api.request('deploy','/imports/apply',{method:'POST',body:original});
   assert.equal(b.api.pending().length,1);
   await b.api.request('calendar','/receipt',{method:'POST',body:{operationId:'import-a'}});
   await b.api.request('deploy','/receipt',{method:'POST',body:{operationId:'import-a'}});
   assert.equal(b.api.pending().length,1,'a plain result at a receipt endpoint is not the original direct response');
   finish=true;
   await b.api.request('deploy','/imports/apply',{method:'POST',body:original});
   assert.equal(b.api.pending().length,0);
  } finally {b.close();}
 }],
 ['canonical XLSX round trip preserves multi-table scope, identifiers, null and literal formula-looking text',async()=>{const dom=new JSDOM();try{const bytes=await encodeWorkbook(workbook,{Zip:JSZip});const result=await decodeWorkbook(bytes,{Zip:JSZip,XMLParser:dom.window.DOMParser});assert.deepEqual(result,workbook);const zip=await JSZip.loadAsync(bytes);const sheet=await zip.file('xl/worksheets/sheet2.xml').async('string');assert(!sheet.includes('<f>'));assert(sheet.includes('=literal name'));}finally{dom.window.close();}}],
 ['canonical XLSX rejects executable formulas and external relationships',async()=>{const dom=new JSDOM();try{const bytes=await encodeWorkbook(workbook,{Zip:JSZip}),formula=await JSZip.loadAsync(bytes);formula.file('xl/worksheets/sheet2.xml',(await formula.file('xl/worksheets/sheet2.xml').async('string')).replace('<sheetData>','<sheetData><row r="999"><c r="A999"><f>WEBSERVICE("https://invalid.test")</f><v>1</v></c></row>'));await assert.rejects(decodeWorkbook(await formula.generateAsync({type:'uint8array'}),{Zip:JSZip,XMLParser:dom.window.DOMParser}),/Formulas/);const external=await JSZip.loadAsync(bytes);external.file('xl/_rels/workbook.xml.rels',(await external.file('xl/_rels/workbook.xml.rels').async('string')).replace('Target="worksheets/sheet1.xml"','Target="https://invalid.test/secret" TargetMode="External"'));await assert.rejects(decodeWorkbook(await external.generateAsync({type:'uint8array'}),{Zip:JSZip,XMLParser:dom.window.DOMParser}),/External/);}finally{dom.window.close();}}],
 ['canonical XLSX rejects silently discarded cells and conflicting metadata',async()=>{const dom=new JSDOM();try{const bytes=await encodeWorkbook(workbook,{Zip:JSZip}),extra=await JSZip.loadAsync(bytes);extra.file('xl/worksheets/sheet2.xml',(await extra.file('xl/worksheets/sheet2.xml').async('string')).replace('</sheetData>','<row r="3"><c r="G3" t="inlineStr"><is><t>unreviewed extra column</t></is></c></row></sheetData>'));await assert.rejects(decodeWorkbook(await extra.generateAsync({type:'uint8array'}),{Zip:JSZip,XMLParser:dom.window.DOMParser}),/header|column|declared/i);const duplicate=await JSZip.loadAsync(bytes);duplicate.file('xl/worksheets/sheet1.xml',(await duplicate.file('xl/worksheets/sheet1.xml').async('string')).replace('</sheetData>','<row r="50"><c r="A50" t="inlineStr"><is><t>School ID</t></is></c><c r="B50" t="inlineStr"><is><t>different-school</t></is></c></row></sheetData>'));await assert.rejects(decodeWorkbook(await duplicate.generateAsync({type:'uint8array'}),{Zip:JSZip,XMLParser:dom.window.DOMParser}),/Duplicate|metadata/i);}finally{dom.window.close();}}],
 ['canonical XLSX bounds actual XML inflation even when declared sizes are small',async()=>{const archive=new JSZip();archive.file('xl/workbook.xml','<xml>'+('x'.repeat(9*1024*1024))+'</xml>');const bytes=await archive.generateAsync({type:'uint8array',compression:'DEFLATE'}),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<bytes.length-46;i++)if(view.getUint32(i,true)===0x02014b50&&view.getUint32(i+24,true)>8*1024*1024)view.setUint32(i+24,8,true);await assert.rejects(decodeWorkbook(bytes,{Zip:JSZip}),/XML exceeds/);}],
 ['canonical XLSX checks declared expansion bounds before inflating untrusted parts',async()=>{const archive=new JSZip();archive.file('oversized-part.xml','<xml/>');const bytes=await archive.generateAsync({type:'uint8array',compression:'DEFLATE'}),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let central=-1;for(let i=0;i<bytes.length-24;i++)if(view.getUint32(i,true)===0x02014b50){central=i;break;}assert(central>=0);view.setUint32(central+24,33*1024*1024,true);await assert.rejects(decodeWorkbook(bytes,{Zip:JSZip}),/expands beyond/);}],
 ['canonical XLSX rejects reporting exports and oversized files',async()=>{const dom=new JSDOM();try{const input=structuredClone(workbook);input.metadata.mode='reporting-only';await assert.rejects(decodeWorkbook(await encodeWorkbook(input,{Zip:JSZip}),{Zip:JSZip,XMLParser:dom.window.DOMParser}),/Export All/);await assert.rejects(decodeWorkbook(new Uint8Array(8*1024*1024+1),{Zip:JSZip,XMLParser:dom.window.DOMParser}),/8 MiB/);}finally{dom.window.close();}}],
 ['isolated browser build preserves all nine source screens and removes legacy runtime bridges',async()=>{const directory=await mkdtemp(join(tmpdir(),'gsis-web-test-'));try{const result=await buildWeb(join(directory,'web'));assert.equal(result.modules,9);const modules=JSON.parse(await readFile(new URL('../v1/web/modules.json',import.meta.url),'utf8'));for(const module of modules){const html=await readFile(join(result.output,module.id,'index.html'),'utf8');assert(html.includes('meta name="gsis-module" content="'+module.id+'"'));assert(html.includes('/v1/shared/client.js'));assert(!html.includes('https://gsps-'));await assert.rejects(stat(join(result.output,module.id,'_worker.js')),e=>e.code==='ENOENT');}const deploy=await readFile(join(result.output,'deploy/app.js'),'utf8');assert(deploy.includes('const readOnly=true;'));assert(deploy.includes('window.GSISV1Publication.open'));assert(!deploy.includes('Publish the saved revision and replace Contacts'));const contacts=await readFile(join(result.output,'contacts/app.js'),'utf8');assert(!contacts.includes("if(eo)eo.value=rule?.level||'';"));assert(contacts.includes('ContactsPowerUser'));}finally{await rm(directory,{recursive:true,force:true});}}]
]);
