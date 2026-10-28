const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const [name,width,height] of [['desktop',1280,900],['mobile',390,844]]){
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.abort());
   await page.route('https://deploy.test/',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync('public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')}));
   await page.goto('https://deploy.test/');
   await page.addStyleTag({content:fs.readFileSync('public/styles.css','utf8')+'\n'+fs.readFileSync('public/loading.css','utf8')});
   await page.addScriptTag({content:fs.readFileSync('public/app.js','utf8').replace(/controls\(\);startSignIn\(\);\s*$/,'')});
   await page.evaluate(()=>{
    const base={id:'v1',status:'active',name:'Current plan',classes:[{level:'1',name:'Perseverance',shortName:'P'}],loads:{'1':{TTT:2,Assembly:1,FTGP:2,FTT:2,EL:15}},venues:[],groups:[],teachers:[{id:'t',name:'Test Teacher',active:true}],assignments:[],levelExclusions:[],audit:[]};
    state={versions:[base,{...structuredClone(base),id:'v2',name:'Next plan'},{...structuredClone(base),id:'v3',name:'Latest plan'}]};current='v1';role='Admin+KP';token='test';tab='Versions';connectLive=()=>{};
    window.requests=[];api=(action,input,feedback,signal)=>new Promise((resolve,reject)=>requests.push({input,signal,resolve,reject}));
    window.reply=id=>({user:{email:'admin@gsps.edu.sg',roles:['Admin','KP']},versions:state.versions.map(x=>({id:x.id,name:x.name,status:x.status})),current:{...structuredClone(base),id,name:state.versions.find(x=>x.id===id).name},revision:1});render();controls();
   });
   await page.locator('#version').selectOption('v2');await page.locator('.loading-overlay').waitFor({state:'visible'});
   assert.match(await page.locator('.loading-overlay').innerText(),/Next plan/);
   const progress=await page.evaluate(()=>{
    const spinner=document.querySelector('.loading-overlay .spinner'),label=document.querySelector('.loading-label'),editor=document.querySelector('#content button');editor.focus();
    return {inert:document.querySelector('#content').inert,toolbarInert:document.querySelector('#viewActions').inert,blocked:document.activeElement!==editor,colour:getComputedStyle(label).backgroundColor,animation:getComputedStyle(spinner).animationName,duration:getComputedStyle(spinner).animationDuration,current};
   });
   assert.deepEqual(progress,{inert:true,toolbarInert:true,blocked:true,colour:'rgb(255, 242, 206)',animation:'gsis-busy-turn',duration:'2.4s',current:'v1'});
   fs.mkdirSync('verification',{recursive:true});await page.screenshot({path:'verification/86-deploy-version-'+name+'.png'});
   await page.locator('#version').selectOption('v3');assert.equal(await page.evaluate(()=>requests[0].signal.aborted),true);
   await page.evaluate(()=>requests[0].resolve(reply('v2')));
   assert.equal(await page.locator('#version').inputValue(),'v3');assert.equal(await page.evaluate(()=>current),'v1');assert.match(await page.locator('.loading-overlay').innerText(),/Latest plan/);
   await page.evaluate(()=>requests[1].reject(Error('Test connection interrupted')));await page.locator('.version-load-error').waitFor();
   assert.equal(await page.locator('#version').inputValue(),'v1');assert.equal(await page.locator('.loading-overlay').count(),0);assert.equal(await page.evaluate(()=>document.querySelector('#content').inert),false);
   await page.locator('.version-load-error button').click();await page.locator('.loading-overlay').waitFor();
   assert.equal(await page.evaluate(()=>requests[2].input.versionId),'v3');await page.evaluate(()=>requests[2].resolve(reply('v3')));
   await page.waitForFunction(()=>current==='v3'&&!document.querySelector('.loading-overlay'));
   assert.equal(await page.locator('#version').inputValue(),'v3');assert.equal(await page.locator('.version-load-error').count(),0);assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS Chromium desktop/mobile version overlay: yellow progress, reduced-motion spinner, actual inert controls, newest selection, failure and named retry');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
