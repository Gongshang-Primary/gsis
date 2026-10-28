const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.GSIS_BROWSER_EXECUTABLE});try{
 const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
 await page.route('https://deploy.test/',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync('public/index.html','utf8').replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'')}));await page.goto('https://deploy.test/');
 for(const file of ['styles.css','deploy506.css'])await page.addStyleTag({content:fs.readFileSync('public/'+file,'utf8')});
 await page.addScriptTag({content:fs.readFileSync('public/app.js','utf8').replace(/controls\(\);startSignIn\(\);\s*$/,'')});
 await page.evaluate(()=>{state={versions:[{id:'v1',status:'active',name:'Synthetic preview',classes:[{ref:'cp',level:'1',name:'Perseverance',shortName:'P'}],loads:{1:{Assembly:1,FTGP:2,FTT:2,EL:15,RRP:4,SDR:2,CCE:1,LSM:2,CL:12,PAL:2}},venues:[{id:'F1-16',form:'1P'}],groups:[],teachers:[{id:'t',name:'Test Teacher',active:true}],assignments:[],levelExclusions:[],audit:[]}]};current='v1';role='Admin+KP';token='test';connectLive=()=>{};tab='Subject Type';render();});
 await page.getByRole('radio',{name:'RRP: Both',exact:true}).click();assert.equal(await page.getByRole('radio',{name:'RRP: Both',exact:true}).isChecked(),true);
 await page.getByRole('radio',{name:'RRP: Both',exact:true}).press('ArrowLeft');assert.equal(await page.getByRole('radio',{name:'RRP: TG only',exact:true}).isChecked(),true,'native keyboard radio selection');
 assert.equal(await page.evaluate(()=>queuedEdits().length),1,'one pending subject edit');assert.equal(await page.evaluate(()=>queuedEdits()[0].expected),null);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'verification/704-subject-type-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'verification/704-subject-type-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile scroll stays in table');await page.screenshot({path:'verification/704-subject-type-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS Chromium Subject Type: native mouse and keyboard choices, stable local edit, one pending subject value, desktop/mobile without page overflow.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
