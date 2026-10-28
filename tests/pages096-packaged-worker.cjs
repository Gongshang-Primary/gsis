// Exercise the delivered entry point with no sibling-module resolver, matching
// the self-contained _worker.js contract of dashboard direct-upload packages.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const JSZip=require('jszip'),acorn=require('acorn');
const root=path.resolve(__dirname,'..'),settings=require('../package.json');
function assertSelfContained(node,label){
 if(!node||typeof node!=='object')return;
 assert(!['ImportDeclaration','ImportExpression'].includes(node.type)&&
  !(node.source&&['ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)),
  label+' must bundle dependencies into _worker.js for dashboard upload');
 for(const value of Object.values(node)){
  if(Array.isArray(value))value.forEach(child=>assertSelfContained(child,label));
  else if(value&&typeof value==='object')assertSelfContained(value,label);
 }
}
(async()=>{
 const packagePath=process.argv[2]||(settings.gsisRelease==='0.9.8q'?require('./helpers/calendar098q-package.cjs')(root):settings.gsisPackageKind==='component-patch'
  ?path.resolve(root,'../deliverables',`GSiS_v${settings.gsisRelease}_Updated_Deployments.zip`)
  :path.join(root,`GSiS_v${settings.gsisRelease}_Deployment.zip`));
 const release=await JSZip.loadAsync(fs.readFileSync(packagePath));
 const failures=[];
 if(settings.gsisRelease==='0.9.8q'){
  assert(release.file(`Calendar_Frontend_v${settings.gsisRelease}.zip`),'Calendar matched frontend is required');
  for(const app of ['Roster','Deploy','Contacts','LORD','OVERLORD','STARLORD','Venues','Layout'])assert.equal(release.file(`${app}_Frontend_v${settings.gsisRelease}.zip`),null,'unchanged frontend must not ship');
 }
 for(const app of (settings.gsisRelease==='0.9.8q'?['Calendar']:settings.gsisRelease==='0.9.9'?['Roster','Deploy','Calendar']:['Roster','Deploy'])){
  const name=`${app}_Frontend_v${settings.gsisRelease}.zip`;
  if(!release.file(name))continue;
  try{
   const zip=await JSZip.loadAsync(await release.file(name).async('nodebuffer'));
   const source=await zip.file('_worker.js').async('string');
   assertSelfContained(acorn.parse(source,{ecmaVersion:'latest',sourceType:'module'}),app);
   const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
   assert.equal(typeof worker.fetch,'function');
   let assetCalls=0;
   const env={GOOGLE_CLIENT_ID:'test-client',CALENDAR_SESSION_SECRET:'offline-packaging-session-secret',APPS_SCRIPT_URL:'https://script.google.com/macros/s/test/exec',
    BRIDGE_SECRET:'packaging-test-secret-that-is-never-published',
    ASSETS:{fetch:async req=>{assetCalls++;return new Response('asset:'+new URL(req.url).pathname);}}};
   const ctx={waitUntil(){throw Error('Smoke routes must not schedule work');}};
   const origin=`https://${app.toLowerCase()}.example.test`;
   const config=await worker.fetch(new Request(origin+(app==='Calendar'?'/api/client-config':'/api/config')),env,ctx);
   assert.equal(config.status,200);
   const body=await config.json();assert.equal(app==='Calendar'?body.frontendVersion:body.version,settings.gsisRelease);
   assert.equal(app==='Calendar'?body.googleClientId:body.clientId,env.GOOGLE_CLIENT_ID);
   assert(!JSON.stringify(body).includes(env.BRIDGE_SECRET));
   const asset=await worker.fetch(new Request(origin+'/index.html'),env,ctx);
   assert.equal(await asset.text(),'asset:/index.html');assert.equal(assetCalls,1);
   const route=app==='Calendar'?'/api':app==='Roster'?'/api/operations':'/api/bootstrap';
   const denied=await worker.fetch(new Request(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:app==='Calendar'?JSON.stringify({action:'calendarSyncStatus',payload:{syncRunId:'arbitrary'}}):'{}'}),env,ctx);
   assert.equal(denied.status,401,'Packaged API still requires authentication');
   console.log('PASS '+app+': standalone import, config, assets and authentication');
  }catch(error){failures.push(app+': '+error.message);}
 }
 assert.equal(failures.length,0,failures.join('\n'));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
