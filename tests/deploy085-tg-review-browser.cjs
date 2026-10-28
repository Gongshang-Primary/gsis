const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.abort());
  await page.route('https://deploy.test/',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync('public/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')}));await page.goto('https://deploy.test/');await page.addStyleTag({content:fs.readFileSync('public/styles.css','utf8')});
  await page.addScriptTag({content:fs.readFileSync('public/app.js','utf8').replace(/controls\(\);startSignIn\(\);\s*$/,'')});
  await page.evaluate(()=>{
   state={versions:[{id:'v1',status:'active',name:'Synthetic TG recovery',classes:[{ref:'class-a',level:'1',name:'Perseverance',shortName:'P'}],loads:{'1':{TTT:2,Assembly:1,FTGP:2,FTT:2,EL:15,HCL:6}},venues:[],groups:[],teachers:[{id:'fayth',name:'Fayth (test fixture)',active:true}],assignments:[],levelExclusions:[],audit:[]}]};current='v1';role='Admin+KP';token='test';tab='IP Deploy';connectLive=()=>{};
   draftBase=clone(v());cellQueue=[{operation:'addTG',localId:'first',name:'3HCL1',subject:'HCL',level:'1',classRefs:[],levelWide:true,venue:'',expected:null},{operation:'addTG',localId:'second',name:'3hcl1',subject:'HCL',level:'1',classRefs:[],levelWide:true,venue:'',expected:null},{operation:'addTeacher',localId:'fayth-assignment',target:'second',subject:'HCL',teacher:'fayth',expected:false}];applyPendingProjection();queueError='Check TG name, subject and level. Draft retained.';
   api=()=>new Promise(resolve=>window.finishRead=()=>resolve({current:clone(draftBase)}));render();
  });
  await page.locator('#saveQueue button').filter({hasText:/^Review$/}).click();await page.locator('dialog[open]').waitFor();assert.match(await page.locator('dialog').innerText(),/Checking current saved/);assert.equal(await page.locator('dialog #ok').isDisabled(),true);
  await page.evaluate(()=>finishRead());await page.locator('[data-review-tg-name="1"]').fill('3HCL2');await page.locator('dialog #ok').click();await page.locator('dialog').waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>({names:v().groups.map(g=>g.name),target:v().assignments[0].target,teacher:v().assignments[0].teacher,edits:cellQueue.length})),{names:['3HCL1','3HCL2'],target:'second',teacher:'fayth',edits:3});
  assert.deepEqual(errors,[]);console.log('PASS native Chromium mobile Review: immediate modal, pending-read feedback, correction action, retained Fayth assignment and clean console');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
