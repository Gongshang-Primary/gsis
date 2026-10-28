const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright'),JSZip=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/jszip');
(async()=>{
 fs.mkdirSync('verification',{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.GSIS_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://accounts.google.com/**',r=>r.abort());
  await page.route('https://gsis.local/**',r=>{const path=new URL(r.request().url()).pathname;
   if(path==='/api/campus-map')return r.fulfill({contentType:'image/svg+xml',path:'layout-update/public/campus-base.svg'});
   if(path.startsWith('/api/')){if(r.request().method()!=='GET')writes.push(path);return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:false,configured:false})});}
   return r.fulfill({path:'.'+path});
  });
  await page.goto('https://gsis.local/public/index.html');
  const ctx=vm.createContext({});vm.runInContext(fs.readFileSync('backend/Seed.gs','utf8'),ctx);const doc=JSON.parse(vm.runInContext('JSON.stringify(DEPLOY_SEED)',ctx));
  Object.assign(doc,{id:'qa413',name:'Excel and position verification',status:'active',publication:'Unpublished',cceELScope:true,teachers:[{id:'t1',name:'Example One',active:true},{id:'t2',name:'Example Two',active:true}],assignments:[],groups:[],audit:[]});
  const map=JSON.parse(fs.readFileSync('public/campus-map.js','utf8').match(/=(\[.*\]);/)[1]);
  doc.venues=map.map(m=>({id:m.id,name:m.name,form:''}));doc.venues.push({id:'Z9-NEW',name:'New venue without geometry',form:''});
  doc.unitGeometry={'Z1-RENAMED':'F1-16'};doc.venues.find(r=>r.id==='F1-16').id='Z1-RENAMED';
  doc.classes=Array.from({length:48},(_,i)=>({ref:'ref'+i,level:String(Math.floor(i/8)+1),shortName:String.fromCharCode(65+i%8),name:'Example class '+i}));
  doc.classes.forEach((c,i)=>doc.venues[i].form=c.level+c.shortName);
  doc.groups=[{id:'tg1',name:'Extra long teaching group label that must wrap fully inside the room',subject:'EL',level:'1',form:'1A',venue:'A1-24B'}];
  await page.evaluate(d=>window.qaDoc=d,doc);
  await page.evaluate(`state={versions:[qaDoc]};current='qa413';role='Admin';token='test';tab='Layout';render();controls();`);
  await page.waitForFunction(()=>document.querySelector('.campus-map svg')?._gsisLayoutSnapshot);
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export Excel',exact:true}).click()]);await download.saveAs('verification/413-Layout.xlsx');
  const z=await JSZip.loadAsync(fs.readFileSync('verification/413-Layout.xlsx')),xml=await z.file('xl/worksheets/sheet1.xml').async('string');
  assert.ok(!xml.includes('#REF!')&&!xml.includes('#N/A'));assert.ok(!/<(?:\w+:)?f[ >]/.test(xml));assert.ok(xml.includes('Z1-RENAMED'));assert.ok(xml.includes('Z9-NEW'));assert.ok(xml.includes('Example class')===false);assert.ok(xml.includes('portrait'));assert.ok(xml.includes('fitToHeight="0"'));assert.ok(xml.includes('mergeCell'));
  const exported=await page.evaluate(()=>{const s=document.querySelector('.campus-map svg')._gsisLayoutSnapshot;return {count:s.rooms.length,title:s.title,version:s.version}});
  await page.evaluate(`tab='IP Deploy';render();`);await page.waitForFunction(()=>document.querySelector('#content .table-window'));
  const observations=[];
  for(const compact of [false,true]){
   if(compact)await page.getByRole('button',{name:'Compact',exact:true}).click();
   await page.evaluate(()=>{const s=document.querySelector('#content .table-window');s.scrollLeft=s.scrollWidth;s.scrollTop=s.scrollHeight*.65;});
   // Use a real available teacher cell within the far-right visible region.
   const target=await page.evaluate(()=>{const s=document.querySelector('#content .table-window'),box=s.getBoundingClientRect();const candidates=[...s.querySelectorAll('[data-target]')].filter(b=>{const r=b.getBoundingClientRect();return r.left>Math.max(...[...s.querySelectorAll('thead .frozen-col')].map(c=>c.getBoundingClientRect().right))+5&&r.right<innerWidth-10&&r.top>box.top+70&&r.bottom<innerHeight-50});const b=candidates[Math.floor(candidates.length/2)];if(!b)throw Error('No visible test cell');return {target:b.dataset.target,sub:b.dataset.sub};});
   const pick=page.locator(`[data-target="${target.target}"][data-sub="${target.sub}"]`);const before=await pick.evaluate(b=>{const r=b.closest('td').getBoundingClientRect();return {x:r.x,y:r.y}});await pick.click();
   const panel=page.locator('.search-select[open] .select-panel');await panel.getByRole('combobox').fill('Example One');
   if(compact){await panel.getByRole('combobox').press('ArrowDown');await panel.getByRole('combobox').press('Enter');}else await panel.getByRole('option',{name:'Example One',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('.search-select[open]'));await page.waitForTimeout(250);
   const after=await pick.evaluate(b=>{const c=b.closest('td'),r=c.getBoundingClientRect();const s=c.closest('.table-window,.scroll');return {x:r.x,y:r.y,width:r.width,height:r.height,text:c.textContent,focus:c.contains(document.activeElement),scroll:s.scrollLeft,max:s.scrollWidth-s.clientWidth,box:s.getBoundingClientRect().toJSON()}});
   console.log(JSON.stringify({compact,target,before,after}));await page.screenshot({path:'verification/413-IP-debug.png'});assert.ok(after.text.includes('Example One'));assert.ok(after.focus);assert.ok(Math.abs(after.x-before.x)<3,JSON.stringify({before,after}));assert.ok(Math.abs(after.y-before.y)<3||Math.abs(after.y-300)<70,JSON.stringify({before,after}));observations.push({compact,target,before,after});
  }
  await page.screenshot({path:'verification/413-IP.png'});
  // Venue selection re-groups the table; its original class remains the focus anchor.
  await page.evaluate(()=>{const s=document.querySelector('#content .table-window');s.scrollLeft=0;s.scrollTop=0;});
  const venue=page.locator('[data-venue-target="1A"]').locator('..').locator('summary');await venue.click();await page.locator('.search-select[open] input').fill('B1-04');await page.locator('.search-select[open] [role="option"]').click();await page.waitForTimeout(250);
  const venueFocus=await page.evaluate(()=>({text:document.activeElement.textContent,row:document.activeElement.closest('tr')?.dataset.row}));assert.ok(venueFocus.text.includes('B1-04'));
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  fs.writeFileSync('verification/413-browser.json',JSON.stringify({exported,observations,venueFocus,errors,writes},null,2));
  console.log('PASS editable layout download; normal/Compact mouse/keyboard cell retention; venue regrouping; no write requests or page errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
