'use strict';
// Real capacity calculations and chart rendering with synthetic staff only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const fixture=require('./roster701-fixture.cjs'),A=require('../shared/roster-allocation.js'),root=path.resolve(__dirname,'..');
const f=fixture();A.ensure(f.state);f.teachers.find(t=>t.staffId==='bob').R=1;f.teachers.find(t=>t.staffId==='dora').R=0;
A.captureWeek(f.state,f.ctx,f.date);
const before=A.health(f.state,f.ctx,f.date,[]),assignment=(id,staffId,period,extra={})=>({id,date:f.date,period,staffId,demandId:id,status:'draft',origin:'automatic',rCost:1,...extra});
f.state.assignments.push(assignment('bob-cover','bob',0),assignment('dora-override','dora',0,{origin:'smc',overrideReason:'Reviewed'}));
const health=A.health(f.state,f.ctx,f.date,[]);health.visiblePeriods=health.periods.map(p=>p.period);
assert.equal(health.potential,before.potential);assert.equal(health.remaining,before.remaining-17);assert.equal(health.consumed,17);assert.equal(health.overrideCount,1);
assert.equal(health.percentage,100*health.remaining/health.potential);
for(const p of health.periods){assert.equal(p.potentialStaffIds.length,p.potential);assert.deepEqual(p.potentialStaffIds,before.periods.find(b=>b.period===p.period).green);}
assert(health.periods[0].potentialStaffIds.includes('bob'));assert(!health.periods[0].green.includes('bob'));assert(!health.periods[0].potentialStaffIds.includes('dora'));
assert.deepEqual(health.periods[0].red.map(a=>a.staffId),['bob','dora']);
assert.deepEqual(health.periods[0].green,['alice','charlie']);
assert.equal(fs.readFileSync(path.join(root,'shared/roster-allocation.js'),'utf8'),fs.readFileSync(path.join(root,'roster-update/public/roster-allocation.js'),'utf8'));
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.ROSTER_TEST_CHROMIUM?{executablePath:process.env.ROSTER_TEST_CHROMIUM}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<main class="ops-page ops-assign-page" id="content"></main>');
  for(const name of ['roster.css','roster-operations.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',name),'utf8')});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'roster-update/public/roster-operations-ui.js'),'utf8')});
  await page.evaluate(({health,people})=>{window.__health=health;window.__people=people;window.__renderHealth=h=>document.querySelector('#content').innerHTML=RosterOpsUI.healthSummary({data:{people:__people}},h);__renderHealth(health);},{health,people:f.people});
  const p0=page.locator('[data-health-period="0"]'),bob=p0.locator('[data-staff-id="bob"]'),dora=p0.locator('[data-staff-id="dora"]');
  assert.equal(await bob.locator('.eligible').count(),1);assert.equal(await bob.locator('.assigned').count(),1);
  assert.match(await bob.getAttribute('aria-label'),/Bob.*Baseline opportunity.*Assigned/);assert.equal(await bob.getAttribute('title'),await bob.getAttribute('aria-label'));
  assert.equal(await dora.locator('.eligible').count(),0);assert.equal(await dora.locator('.not-eligible').count(),1);assert.equal(await dora.locator('.assigned').count(),1);assert.match(await dora.getAttribute('aria-label'),/Dora.*Outside baseline eligibility.*Assigned/);
  assert.equal(await p0.locator('.ops-health-count').textContent(),'2 free now');
  const laterBob=page.locator('[data-health-period="1"] [data-staff-id="bob"]');assert.equal(await laterBob.locator('.eligible').count(),1);assert.equal(await laterBob.locator('.assigned').count(),0);assert.match(await laterBob.getAttribute('aria-label'),/Not currently free under current workload rules/);
  const positions=await page.locator('.ops-health-period').evaluateAll(columns=>columns.map(c=>{const header=c.querySelector('header').getBoundingClientRect(),bars=c.querySelector('.ops-health-bars').getBoundingClientRect(),rows=[...c.querySelectorAll('.ops-capacity-row')].map(r=>r.getBoundingClientRect());return {axis:header.top,base:bars.bottom,height:bars.height,bottomRow:rows[0]?.bottom,topRow:rows.at(-1)?.top};}));
  assert.equal(new Set(positions.map(p=>p.axis)).size,1,'period headers share a common baseline');assert.equal(new Set(positions.map(p=>p.base)).size,1);assert.equal(new Set(positions.map(p=>p.height)).size,1);
  for(const p of positions){assert(p.topRow<p.bottomRow,'rows grow upward');assert(p.bottomRow<=p.base);assert(p.base<=p.axis);}
  assert.deepEqual(await p0.locator('.ops-capacity-row').evaluateAll(rows=>rows.map(r=>r.dataset.staffId)),['bob','dora','alice','charlie'],'assigned teacher pairs are the first bottom rows');
  const assignedBottom=await p0.locator('.ops-capacity-row').evaluateAll(rows=>rows.map(r=>({assigned:!!r.querySelector('.assigned'),top:r.getBoundingClientRect().top})));
  assert(Math.min(...assignedBottom.filter(r=>r.assigned).map(r=>r.top))>Math.max(...assignedBottom.filter(r=>!r.assigned).map(r=>r.top)),'assigned pairs are all below unassigned pairs');
  const pair=await bob.evaluate(row=>[...row.children].map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right};}));assert.equal(pair[0].y,pair[1].y);assert(pair[1].x>pair[0].right,'red is beside the same teacher, never replacing green');
  assert.equal(await page.locator('.ops-capacity-bar.eligible').count(),health.potential);
  assert.match(await page.locator('.ops-health-heading').textContent(),new RegExp(health.remaining+' / '+health.potential));
  assert.deepEqual(await page.evaluate(()=>__health),health,'rendering leaves business counts unchanged');
  // A display selection changes columns only; whole-day totals and details stay intact.
  await page.evaluate(()=>__renderHealth({...__health,visiblePeriods:[0,2]}));assert.deepEqual(await page.locator('[data-health-period]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.healthPeriod))),[0,2]);
  assert.match(await page.locator('.ops-health-heading').textContent(),new RegExp('Whole day.*'+health.remaining+' / '+health.potential));
  await page.evaluate(()=>__renderHealth({...__health,visiblePeriods:undefined}));assert.deepEqual(await page.locator('[data-health-period]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.healthPeriod))),Array.from({length:12},(_,i)=>i+1));
  await page.evaluate(()=>__renderHealth({...__health,visiblePeriods:[]}));assert.equal(await page.locator('[data-health-period]').count(),0);assert.equal(await page.locator('.ops-health-scroll').isVisible(),false);assert.match(await page.locator('.empty-state').textContent(),/Choose periods in System Config/);
  assert.match(await page.locator('.ops-health-heading').textContent(),new RegExp(health.remaining+' / '+health.potential));
  // Unknown R remains neutral, while known assignments remain visible.
  await page.evaluate(()=>__renderHealth({...__health,incomplete:true,verified:false,percentage:null}));
  assert.equal(await page.locator('.ops-capacity-bar.eligible').count(),0);assert.equal(await page.locator('.ops-capacity-bar.assigned').count(),2);assert.equal(await page.locator('.ops-capacity-bar.unknown').count(),17);assert.match(await page.locator('.ops-health-heading').textContent(),/R not verified/);assert.equal(await page.locator('[data-health-period="0"] .ops-health-count').textContent(),'Not verified');
  // An older response must not invent baseline opportunities from current free rows.
  await page.evaluate(()=>__renderHealth({...__health,periods:__health.periods.map(({potentialStaffIds,...p})=>p)}));assert.equal(await page.locator('.ops-capacity-bar.eligible').count(),0);assert.match(await page.locator('.ops-health').textContent(),/Baseline opportunity details are unavailable/);
  await page.evaluate(()=>__renderHealth(__health));
  if(process.env.ROSTER_HEALTH_SCREENSHOT_DIR){fs.mkdirSync(process.env.ROSTER_HEALTH_SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.ROSTER_HEALTH_SCREENSHOT_DIR,'health-chart-desktop.png'),fullPage:true});}
  await page.setViewportSize({width:390,height:844});
  const overflow=await page.locator('.ops-health-scroll').evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth,page:document.documentElement.scrollWidth,viewport:innerWidth}));assert(overflow.scroll>overflow.client,'period chart scrolls horizontally on a phone');assert(overflow.page<=overflow.viewport,'horizontal overflow remains inside the chart');
  await page.locator('.ops-health-scroll').focus();await page.keyboard.press('End');
  await page.locator('.ops-health-scroll').evaluate(el=>el.scrollLeft=el.scrollWidth);assert(await page.locator('.ops-health-scroll').evaluate(el=>el.scrollLeft)>0);
  if(process.env.ROSTER_HEALTH_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.ROSTER_HEALTH_SCREENSHOT_DIR,'health-chart-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS health chart: fixed period baseline, upward teacher rows, paired assignment markers, real counts unchanged, honest unknown and override states, mobile scroll.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
