const fs=require('fs'),assert=require('assert/strict'),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
(async()=>{fs.mkdirSync('verification',{recursive:true});const browser=await chromium.launch({executablePath:process.env.GSIS_CHROMIUM||chromium.executablePath(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));let pending=true;
 const user={email:'qa@gsps.edu.sg',roles:['Admin']},entry={requestId:'11111111-1111-4111-8111-111111111111',digest:'fixture-digest',actor:user.email,at:'29 Sep 2026 07:00',recoverable:true,changes:Array.from({length:24},(_,i)=>({id:'staff-'+i,name:'Staff '+(i+1),field:'Active',expected:'Y',value:'N'})),additions:[]};
 await page.route('https://accounts.google.com/**',r=>r.abort());await page.route('https://gsis.local/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;let body,status=200;
 if(path==='/api/config')body={configured:true,clientId:'fixture'};
 else if(path==='/api/session')body={ok:true,data:{user}};
 else if(path==='/api/bootstrap'){status=pending?503:200;body=pending?{ok:false,code:'CONTACTS_RECOVERY_REQUIRED',error:'A Contacts save needs recovery.'}:{ok:true,data:{user,people:[],groups:[],access:[]}};}
 else if(path==='/api/recovery-status')body={ok:true,data:{canRecover:true,user,pending:pending?[entry]:[]}};
 else if(path==='/api/recover-save'){writes.push(JSON.parse(req.postData()));if(writes.length===1){status=503;body={ok:false,error:'Connection interrupted. Original request retained.'};}else{pending=false;body={ok:true,data:{saved:true,requestId:entry.requestId}};}}
 else if(path==='/api/deployment')body={ok:true,data:{available:true,assignments:[],workloads:[],organisations:{}}};
 else return route.fulfill({path:'.'+path});return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('https://gsis.local/contacts-update/public/index.html');const button=page.getByRole('button',{name:'Complete this saved change',exact:true});await button.waitFor();await page.waitForFunction(()=>!document.body.classList.contains('single-table-page'));
 assert.equal(writes.length,0);assert.equal(await page.locator('#contactRecovery tbody tr').count(),24);await page.locator('#recoveryTitle').scrollIntoViewIfNeeded();await page.screenshot({path:'verification/411-Recovery-review.png'});
 await button.scrollIntoViewIfNeeded();await button.click();const retry=page.getByRole('button',{name:'Retry this recovery',exact:true});await retry.waitFor();assert.equal(writes.length,1);await page.screenshot({path:'verification/411-Recovery-retry.png'});await retry.click();await page.waitForFunction(()=>!document.querySelector('#app').classList.contains('hidden'));
 assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.deepEqual(writes[0],{requestId:entry.requestId,digest:entry.digest});assert.equal(await page.locator('#contactRecovery').isVisible(),false);assert.deepEqual(errors,[]);await page.screenshot({path:'verification/411-Recovery-complete.png'});
 fs.writeFileSync('verification/411-browser.json',JSON.stringify({rows:24,explicitRecoveryWrites:writes.length,sameOriginalRequest:true,reenteredContacts:true,pageErrors:errors},null,2));console.log('PASS Chromium blocked sign-in review, long-list page scrolling, explicit same-request recovery retry and successful Contacts re-entry.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
