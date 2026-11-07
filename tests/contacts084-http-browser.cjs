const {toWorkerModuleURL}=require('./helpers/worker-module.cjs');
'use strict';

// Serve the real Contacts files and worker over HTTP. Set GSIS_CONTACTS_HTTP_ROOT
// to an extracted frontend ZIP to run the same acceptance check on shipped bytes.
// Identity/backend fixtures do not claim to verify Google sign-in or production data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(process.env.GSIS_CONTACTS_HTTP_ROOT||'contacts-update/public');
const expectedVersion=fs.readFileSync(path.join(root,'index.html'),'utf8').match(/<title>GSiS Contacts v([^<]+)<\/title>/)?.[1];
assert.ok(expectedVersion,'the artifact declares its Contacts version');
const data={user:{email:'fixture@gsps.edu.sg',roles:[]},people:[{id:'teacher1',name:'Teacher One',statutoryName:'Mdm TAN 李',active:'Y',groups:[],emails:{gsps:'teacher@gsps.edu.sg'},mobile:'91234567',role:'Teacher'}],groups:[],access:[],deploymentAvailable:true,deploymentPending:false};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.ttf':'font/ttf'};
const googleStub="window.google={accounts:{id:{initialize(config){window.__login=config.callback;},renderButton(el){const button=document.createElement('button');button.id='fixtureSignIn';button.textContent='Fixture Google sign in';button.onclick=()=>window.__login({credential:'fixture-token'});el.append(button);},disableAutoSelect(){}}}};";

(async()=>{
 const worker=(await import(toWorkerModuleURL('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'_worker.js'),'utf8')).toString('base64')))).default;
 let mode='restored',signedIn=false;
 const requests=[],serverErrors=[];
 const apiJSON=value=>Response.json(value,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1'),record={method:req.method,path:url.pathname,search:url.search};requests.push(record);
   let response;
   if(url.pathname==='/api/session'){
    if(req.method==='POST')signedIn=true;
    response=apiJSON({ok:mode==='restored'||signedIn});
   }else if(url.pathname==='/api/bootstrap')response=apiJSON({ok:true,data});
   else if(url.pathname==='/api/deployment')response=apiJSON({ok:true,data:{available:true,assignments:[],workloads:[],organisations:{}}});
   else response=await worker.fetch(new Request('http://127.0.0.1'+req.url),{
    GOOGLE_CLIENT_ID:'fixture-client',APPS_SCRIPT_URL:'https://fixture.invalid/',GSIS_SECRET:'fixture-secret'.repeat(3),
    ASSETS:{async fetch(request){
     const pathname=new URL(request.url).pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
     if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return new Response('Missing asset',{status:404});
     return new Response(fs.readFileSync(file),{headers:{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'public,max-age=0,must-revalidate','X-Content-Type-Options':'nosniff'}});
    }},
   });
   record.status=response.status;record.contentType=response.headers.get('Content-Type');record.nosniff=response.headers.get('X-Content-Type-Options');
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){serverErrors.push(error.message);res.writeHead(500);res.end('Fixture server failed');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||process.env.GSIS_BROWSER_EXECUTABLE||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  for(const scenario of ['restored','fresh']){
   mode=scenario;signedIn=false;requests.length=0;
   const context=await browser.newContext({acceptDownloads:true});
   try{
    const page=await context.newPage(),errors=[],externalRequests=[];page.setDefaultTimeout(7000);
    page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(!request.url().startsWith(origin))externalRequests.push(request.url());});
    // Only the external identity provider is simulated at the browser layer.
    // App, serializer, style, config and directory requests all traverse HTTP.
    await page.route('https://accounts.google.com/gsi/client',route=>route.fulfill({contentType:'text/javascript',body:googleStub}));
    await page.goto(origin);
    if(scenario==='fresh'){
     await page.locator('#fixtureSignIn').waitFor();
     assert.equal(await page.locator('#loginView .suite-release').textContent(),'Contacts v'+expectedVersion);
     assert.equal(await page.locator('#loginView .suite-release').isVisible(),true,'installed version is visible before sign-in');
     await page.locator('#fixtureSignIn').click();
    }
    const button=page.locator('[data-contact-vcard="teacher1"]');await button.waitFor();
    await page.waitForFunction(()=>document.getElementById('deploymentStatus').textContent==='');
    await page.waitForLoadState('networkidle');
    assert.equal((await page.locator('#contactHead th').first().textContent()).trim(),'add');
    assert.equal(await page.locator('#app > header .suite-release').textContent(),'v'+expectedVersion);
    assert.equal(await page.locator('[data-google-contact]').count(),0);
    for(const asset of ['/app.js','/contact-vcard.js','/core.js']){
     const served=requests.find(request=>request.path===asset);
     assert.ok(served,asset+' must load from the served artifact');
     assert.equal(served.status,200,asset+' served successfully');
     assert.match(served.contentType,/javascript/);
     assert.equal(served.nosniff,'nosniff');
    }
    assert.equal(requests.some(request=>request.status>=400),false,'all requested packaged assets must exist');
    assert.equal(externalRequests.some(url=>url!=='https://accounts.google.com/gsi/client'),false,'no unexpected external integration');
    assert.equal(externalRequests.length,scenario==='fresh'?1:0,'restored sessions need no Google provider script');
    const before=requests.length;
    await context.setOffline(true);
    const waiting=page.waitForEvent('download');await button.click();
    const download=await waiting;assert.equal(await download.failure(),null);
    const body=fs.readFileSync(await download.path(),'utf8');
    assert.match(download.suggestedFilename(),/\.vcf$/i);
    assert.match(body.replace(/\r\n[ \t]/g,''),/N:Mdm TAN 李;Teacher One;;GSPS;\r\n/);
    assert.equal(requests.length,before,'the real HTTP-loaded app exports without network verification');
    await page.setViewportSize({width:390,height:800});
    const releaseBox=await page.locator('#app > header .suite-release').boundingBox();
    assert.ok(releaseBox&&releaseBox.width>0&&releaseBox.height>0,'installed version stays visible on mobile');
    assert.ok(releaseBox.x>=0&&releaseBox.x+releaseBox.width<=390,'version remains inside the mobile viewport');
    assert.deepEqual(errors,[]);
   }finally{await context.close();}
  }
  assert.deepEqual(serverErrors,[]);
  console.log('PASS Contacts HTTP artifact: current app/helper/module assets, MIME/nosniff, restored and fresh sign-in UI, and real offline vCard download');
 }finally{
  if(browser)await browser.close();
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
