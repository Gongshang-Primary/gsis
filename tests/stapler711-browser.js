'use strict';
// Real layout checks, with synthetic data and no live school operations.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main id="content"></main></body></html>'}));await page.goto('https://roster.test/');
  for(const file of ['roster.css','roster-stapler.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',file),'utf8')});
  for(const file of ['shared/roster-stapler.js','roster-update/public/roster-stapler-ui.js','tests/fixtures/stapler-lease-api.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(async()=>{
   const date='2026-10-19',plan=GSISRosterStapler.create({date,id:'baseline',periods:[{period:0,startMinutes:450,endMinutes:480},{period:1,startMinutes:480,endMinutes:510}],formClasses:[{id:'workshop',name:'Workshop',traditional:false}],teachers:[{staffId:'a',name:'Alice',cells:[['EL','Workshop','Room A','Group A'],['A long subject name that wraps onto several lines in this narrow tile','Workshop','Room A','Group A']]},{staffId:'b',name:'Bob',cells:[['','','',''],['','','','']]}]});
   await RosterStaplerUI.render({container:document.querySelector('#content'),initialDate:date,today:()=> '2026-10-18',profile:{user:{smc:true,email:'a@school.test'}},status(){},api:async()=>({date,plan,revision:1,staplerRevision:1,canEdit:true,canConfirm:true,people:[],accessRequests:[]})});
  });
  const tiles=await page.locator('[data-scroll="teacher"] [data-tile]').evaluateAll(nodes=>nodes.map(node=>({height:node.getBoundingClientRect().height,scroll:node.scrollHeight,client:node.clientHeight,lines:node.querySelectorAll('span,small').length})));
  assert.equal(tiles[0].lines,4);assert.ok(tiles[0].height<110,'four data lines have no fixed blank tail');assert.ok(tiles[1].height>tiles[0].height,'wrapped subject expands the tile');assert.ok(tiles.every(t=>t.scroll<=t.client+1),'no clipped active tile data');
  assert.equal(await page.locator('[data-filter="class"]').count(),1);assert.equal(await page.locator('[data-confirm]').isEnabled(),true);fs.mkdirSync(path.join(root,'verification'),{recursive:true});await page.screenshot({path:path.join(root,'verification/711-stapler-desktop.png'),fullPage:true});
  await page.locator('.planner-resizer').focus();for(let i=0;i<20;i++)await page.keyboard.press('ArrowDown');const bounds=await page.locator('.planner-workspace').evaluate(node=>{const box=el=>({height:el.getBoundingClientRect().height,bottom:el.getBoundingClientRect().bottom});return {workspace:box(node),pit:box(node.querySelector('.planner-pit')),left:box(node.querySelector('.planner-left'))};});assert.ok(bounds.workspace.height>2400);assert.ok(Math.abs(bounds.pit.bottom-bounds.left.bottom)<2,'Card Pit follows the resized workspace bottom');
  await page.locator('.planner-divider').focus();for(let i=0;i<9;i++)await page.keyboard.press('ArrowDown');assert.ok(Number(await page.locator('.planner-divider').getAttribute('aria-valuenow'))>82);assert.deepEqual(errors,[]);
  console.log('PASS v711 Chromium Stapler: four compact data lines, wrapping without clipping, uncapped outer resize, aligned Card Pit, adjustable split and future Confirm.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
