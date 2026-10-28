const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
(async()=>{
 const executablePath=process.env.GSIS_CHROMIUM||await require('@sparticuz/chromium').default.executablePath();
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1560,height:1000}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
 page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
 const root=path.resolve(process.argv[2]||'.'),prefix=process.argv[3]||'403';
 await page.route('**/*',r=>{const url=new URL(r.request().url());if(url.pathname==='/proof.html')return r.fulfill({contentType:'text/html',body:'<style>html,body,iframe{width:100%;height:100%;border:0;margin:0;display:block}</style><iframe src="/landmark.html"></iframe>'});const file=path.join(root,'layout-update/public',url.pathname);if(url.hostname!=='gsis.local'||!fs.existsSync(file)||!fs.statSync(file).isFile())return r.abort();return r.fulfill({path:file});});
 await page.goto('https://gsis.local/proof.html');
 const model=await page.locator('iframe').elementHandle().then(el=>el.contentFrame());
 await model.waitForFunction(()=>window.GSIS?.renderer);
 fs.mkdirSync('verification',{recursive:true});
 for(const spec of [
  {name:'ish-east',eye:[740,475,22],target:[450,389,6.7],floor:0,cut:false,block:'J'},
  {name:'ish-side',eye:[625,640,27],target:[450,389,6.7],floor:0,cut:true,block:'J'},
  {name:'hall-corridor',eye:[825,855,29],target:[641,645,3],floor:2,cut:true,block:'all'},
  {name:'hall-landing',eye:[740,715,14],target:[640,637,2.7],floor:2,cut:true,block:'all'}
 ]){
  await model.evaluate(spec=>{window.proof=spec;},spec);
  await model.evaluate(`S.floor=proof.floor;S.block=proof.block;S.cut=proof.cut;S.labels=false;updateView(false);camTarget.copy(pt(...proof.target));var eye=pt(...proof.eye),delta=eye.clone().sub(camTarget);distance=delta.length();theta=Math.atan2(delta.x,delta.z);phi=Math.acos(delta.y/distance);requestRender();`);
  await page.screenshot({path:'verification/'+prefix+'-'+spec.name+'.png'});
 }
 assert.deepEqual(errors,[]);
 for(const level of [1,2,4]){
  await model.evaluate(l=>window.proofLevel=l,level);
  await model.evaluate('S.block="all";S.floor=proofLevel;updateView(false)');
  const state=await model.evaluate(`({floor:S.floor,ish:scene.getObjectByName('ISH east covered metal Z stair').visible,hall:scene.getObjectByName('Stairwell A-2 L1').visible})`);
  assert.equal(state.ish,level===1||level===4);assert.equal(state.hall,level===1||level===2);
 }
 console.log('PASS Chromium model build, floor controls, stair visibility and four rendered review views; no page errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
