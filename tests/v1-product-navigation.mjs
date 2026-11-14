import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';
const root = new URL('../', import.meta.url);
const read = p => readFile(new URL(p,root),'utf8');
const [shell,home,css,html,modules] = await Promise.all(['v1/web/shared/module-shell.js','v1/web/shared/home.js','v1/web/shared/suite.css','v1/web/overlays/index.html','v1/web/modules.json'].map(read));
const evidence=fileURLToPath(new URL('../deliverables/v1/evidence/navigation/',import.meta.url));await mkdir(evidence,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM||undefined});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.route('https://gsis.example.invalid/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/v1/modules.json') return route.fulfill({contentType:'application/json',body:modules});
  if(path==='/v1/shared/home.js')return route.fulfill({contentType:'application/javascript',body:home});
  if(path==='/v1/shared/client.js')return route.fulfill({contentType:'application/javascript',body:`window.GSISV1={getConfig:async()=>({schoolName:'Test school'}),getSession:async()=>({user:{email:'test@example.invalid'},capabilities:['core.admin']})}`});
  if(path==='/v1/shared/suite.css')return route.fulfill({contentType:'text/css',body:css});
  if(path==='/')return route.fulfill({contentType:'text/html',body:html});
  const module=JSON.parse(modules).find(module=>path.startsWith('/'+module.id+'/'));
  if(module){const relative=path.slice(module.id.length+2);try{const bytes=await readFile(new URL(module.source+'/'+relative,root));return route.fulfill({body:bytes,contentType:relative.endsWith('.svg')?'image/svg+xml':relative.endsWith('.png')?'image/png':relative.endsWith('.css')?'text/css':'application/octet-stream'});}catch{}}
  return route.fulfill({body:'',contentType:'text/plain'});
 });
 await page.goto('https://gsis.example.invalid/');
 await page.waitForFunction(()=>document.querySelectorAll('.module').length===9);
 assert.deepEqual(await page.locator('.module h2').allTextContents(),['Roster','Contacts','Calendar','Venues','Layout','Deploy','LORD','STARLORD','OVERLORD']);
 const boxes=await page.locator('.module').evaluateAll(nodes=>nodes.map(n=>({x:n.offsetLeft,y:n.offsetTop,w:n.offsetWidth,h:n.offsetHeight})));
 assert.equal(new Set(boxes.map(b=>b.x)).size,3);
 assert.equal(new Set(boxes.map(b=>b.y)).size,3);
 assert(boxes.every(b=>Math.abs(b.w-b.h)<=1),'desktop equal square tiles');
 assert.equal(await page.locator('.module-icon').count(),9);
 assert.equal(await page.locator('.module-icon img[src="/calendar/gsps-calendar-logo.png"]').count(),1);
 await page.waitForFunction(()=>[...document.querySelectorAll('.module-icon img')].every(i=>i.complete&&i.naturalWidth>0));
 const iconBounds=await page.locator('.module-icon').evaluateAll(nodes=>nodes.map(n=>({box:n.getBoundingClientRect().height,image:n.firstElementChild.getBoundingClientRect().height})));assert(iconBounds.every(x=>x.image<=x.box+1),'all reused icons fit their equal square icon bounds');
 await page.screenshot({path:join(evidence,'home-desktop.png')});await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(evidence,'home-narrow.png')});await page.setViewportSize({width:1440,height:1000});
 // Native Contacts tab handlers remain the source of navigation and dirty guards.
 await page.setContent(`<style>${css}.page:not(.active){display:none}</style><nav class="navbar"><button class="nav-button" data-page="contacts">Contact list</button><button class="nav-button active" data-page="data">Edit Info</button><button class="nav-button" data-page="admin">Sys Admin</button></nav><section class="page" id="contacts"></section><section class="page active" id="data"></section><section class="page" id="admin"></section><section id="diy"></section><details class="gsis-panel"><summary>Staff classifications and controlled catalogues</summary><input id="keptDraft" value="unsaved"></details>`);
 await page.evaluate(()=>{
  window.GSISV1={module:'contacts',capable:()=>true,getSession:async()=>({user:{email:'test@example.invalid',accountId:'test'},schoolId:'school'})};
  window.dirty=true;
  for(const b of document.querySelectorAll('[data-page]'))b.onclick=()=>{if(window.dirty)return;document.querySelectorAll('.active').forEach(n=>n.classList.remove('active'));b.classList.add('active');document.getElementById(b.dataset.page).classList.add('active');};
 });
 await page.addScriptTag({content:shell});
 await page.waitForFunction(()=>document.querySelector('#data details.gsis-panel'));
 assert.equal(await page.locator('.gsis-suitebar [aria-current=page]').textContent(),'Edit Info');
 assert.equal(await page.locator('.gsis-suitebar').getByRole('button',{name:'Catalogues & staff'}).count(),0);
 await page.locator('.gsis-suitebar').getByRole('link',{name:'Contacts',exact:true}).click();
 assert.equal(await page.locator('.gsis-suitebar [aria-current=page]').textContent(),'Edit Info','native dirty guard remains effective');
 await page.evaluate(()=>window.dirty=false);
 await page.locator('.gsis-suitebar').getByRole('link',{name:'Contacts',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.gsis-suitebar [aria-current=page]').textContent==='Contact list');
 assert.equal(await page.locator('#keptDraft').inputValue(),'unsaved','panel move preserves draft node');
 assert.equal(await page.locator('#data details').isVisible(),false);
 assert.equal(await page.locator('body > details.gsis-panel').count(),0);
 // Role-hidden panels stay hidden after placement, even when their host is visible.
 await page.evaluate(()=>{const p=document.createElement('details');p.className='gsis-panel';p.hidden=true;p.innerHTML='<summary>Accepted authority records and readiness</summary>';document.body.append(p);});
 await page.waitForFunction(()=>document.querySelector('#admin details'));
 assert.equal(await page.locator('#admin details').getAttribute('hidden'),'');
 // The owner renderer replaces content on each tab: preserve the same panel and draft.
 const deploy=await browser.newPage();
 await deploy.setContent(`<style>${css}</style><nav id="nav"><button data-tab="IP Deploy">IP Deploy</button><button data-tab="Versions" class="selected">Versions</button></nav><main id="content" data-view="Versions"></main><details class="gsis-panel" data-panel-id="deploy-publication"><summary>Canonical Excel and publication receipts</summary><input id="versionDraft" value="keep this"></details>`);
 await deploy.evaluate(()=>window.GSISV1={module:'deploy',capable:()=>true,getSession:async()=>({user:{email:'test@example.invalid',accountId:'test'},schoolId:'school'})});
 await deploy.addScriptTag({content:shell});
 await deploy.waitForFunction(()=>document.querySelector('#content #versionDraft'));
 await deploy.evaluate(()=>{const c=document.getElementById('content');c.dataset.view='IP Deploy';c.replaceChildren(document.createElement('table'));dispatchEvent(new Event('gsis:navigation'));});
 await deploy.waitForFunction(()=>document.querySelector('[data-gsis-panel-parking] #versionDraft'));
 assert.equal(await deploy.locator('#versionDraft').isVisible(),false);
 await deploy.evaluate(()=>{document.getElementById('content').dataset.view='Versions';dispatchEvent(new Event('gsis:navigation'));});
 await deploy.waitForFunction(()=>document.querySelector('#content #versionDraft'));
 assert.equal(await deploy.locator('#versionDraft').inputValue(),'keep this');
 await deploy.locator('summary').click();
 await deploy.waitForFunction(()=>!document.querySelector('details').open);
 assert.equal(await deploy.locator('#versionDraft').isVisible(),false,'native disclosure remains user-controlled');
 await deploy.close();
 console.log('PASS home 3x3 square/order/icons; compact native breadcrumbs; permission-hidden panel placement; native navigation guard; panel drafts survive renderer replacement');
} finally {await browser.close();}
