// Offline browser verification. Software rendering here is not an Intel hardware benchmark.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
(async()=>{fs.mkdirSync('verification',{recursive:true});const browser=await chromium.launch({executablePath:process.env.GSIS_CHROMIUM||'/tmp/gsis-chromium-416/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],headless:true});
try{
 const errors=[],page=await browser.newPage({viewport:{width:1366,height:850}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://gsis.local/**',r=>{const file=path.resolve('.'+new URL(r.request().url()).pathname.replace('/landmark-preview.html','/landmark.html'));return fs.existsSync(file)&&fs.statSync(file).isFile()?r.fulfill({path:file}):r.fulfill({status:404,body:''});});
 await page.goto('https://gsis.local/layout-update/public/landmark-preview.html');await page.waitForFunction(()=>window.GSIS?.showcase);
 assert.equal(await page.locator('#error').isVisible(),false);await page.screenshot({path:'verification/416-balanced.png'});
 await page.getByRole('button',{name:'Showcase',exact:false}).click();assert.equal(await page.evaluate(()=>GSIS.showcase.state.running),true);
 await page.waitForTimeout(450);await page.mouse.move(700,400);await page.mouse.move(703,402);await page.mouse.move(699,402);assert.equal(await page.evaluate(()=>GSIS.showcase.state.running),true,'jitter must be tolerated');
 await page.mouse.move(717,400);assert.equal(await page.evaluate(()=>GSIS.showcase.state.running),false,'deliberate motion must take over');
 const frozen=await page.evaluate(()=>GSIS.camera.position.toArray());await page.waitForTimeout(150);const idle=await page.evaluate(()=>GSIS.camera.position.toArray());assert.ok(frozen.every((v,i)=>Math.abs(v-idle[i])<.05),'paused pose must not drift');
 await page.mouse.move(700,400);await page.mouse.down();await page.mouse.move(740,415);await page.mouse.up();const manual=await page.evaluate(()=>GSIS.camera.position.toArray());assert.notDeepEqual(manual,idle);assert.equal(await page.evaluate(()=>GSIS.showcase.state.running),false);
 const before=await page.evaluate(()=>GSIS.camera.position.toArray());await page.mouse.wheel(0,120);await page.waitForTimeout(80);assert.notDeepEqual(await page.evaluate(()=>GSIS.camera.position.toArray()),before);
 const route=[];await page.evaluate(()=>GSIS.showcase.start());
 for(let i=0;i<13;i++){
  const pose=await page.evaluate(i=>{const t=GSIS.showcase.state;t.running=true;t.elapsed=(i+1)*8000;t.lastTime=null;advanceShowcase(performance.now());updateCamera();t.running=false;GSIS.render();return {name:GSIS.showcase.stops[i][0],eye:GSIS.camera.position.toArray(),target:camTarget.toArray(),drawCalls:GSIS.renderer.info.render.calls};},i);
  assert.ok(pose.eye[1]>26,'authored tour must stay above campus structures');route.push(pose);await page.waitForTimeout(60);await page.screenshot({path:'verification/416-route-'+String(i).padStart(2,'0')+'.png'});
 }
 await page.evaluate(()=>GSIS.setVisualQuality('lite'));await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>GSIS.renderer.shadowMap.enabled),false);await page.screenshot({path:'verification/416-lite.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);await page.evaluate(()=>{GSIS.showcase.start();const t=GSIS.showcase.state;t.elapsed=104000;t.lastTime=null;advanceShowcase(performance.now());GSIS.render();});await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>390),false);await page.screenshot({path:'verification/416-mobile.png'});
 // Touch drag takes over without relying on mouse hover events.
 await page.evaluate(()=>{GSIS.showcase.start();const e=new PointerEvent('pointerdown',{pointerId:98,pointerType:'touch',clientX:160,clientY:300,bubbles:true});document.querySelector('#canvas').dispatchEvent(e)}).catch(e=>{if(!/pointer/i.test(e.message))throw e});
 assert.equal(await page.evaluate(()=>GSIS.showcase.state.running),false);
 assert.deepEqual(errors.filter(e=>!/pointer/i.test(e)),[]);
 fs.writeFileSync('verification/416-browser.json',JSON.stringify({errors,route,jitter:'pass',manualTakeover:'pass',idlePose:'pass',wheel:'pass',touch:'pass',mobile:'pass',hardwareBenchmark:false},null,2));
 console.log('PASS Showcase route frames, deadzone, manual orbit/wheel/touch, idle pose, graphics fallback and mobile layout.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
