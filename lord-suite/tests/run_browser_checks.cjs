const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert/strict');
const root = path.resolve(__dirname,'../Source/starlord');
const now=Date.now();
const types=['MacBook Neo','MacBook Air','Mac Book Pro','HP Windows','iPad 9Gen','Tab S9'];
const expected=['device-mbn.webp','device-mbn.webp','device-mbn.webp','device-laptop.jpg','device-ipad.webp','device-android.webp'];
const rows=types.map((deviceType,i)=>({bookingId:'TEST-'+i,teacherStatutoryName:'Test Staff '+(i+1),resource:i<3?'Cart '+String.fromCharCode(65+i):'Test cart',deviceType,classOrActivity:'5A',subject:'SCI',requestedQuantity:i===0?41:42,startTime:'14:00',endTime:'15:00',epochStart:now+3600000,epochEnd:now+7200000,movementState:'BOOKED'}));
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try {res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.webp')?'image/webp':'image/jpeg');res.end(fs.readFileSync(file));} catch(e){res.writeHead(404).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1920,height:1080},timezoneId:'Asia/Singapore'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/board?*',route=>route.fulfill({json:{ok:true,date:'2026-09-29',bookings:rows}}));
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForSelector('.tile img');
  const loaded=await page.locator('.tile img').evaluateAll(async images=>{await Promise.all(images.map(i=>i.decode()));return images.map(i=>({alt:i.alt,src:i.src,width:i.naturalWidth}));});
  assert.equal(loaded.length,6);
  for(let i=0;i<types.length;i++){const image=loaded.find(x=>x.alt===types[i]);assert(image.src.endsWith(expected[i]));assert(image.width>0);}
  assert.equal(errors.length,0);
  await page.screenshot({path:path.join(__dirname,'STARLORD_v1.2_desktop.png'),fullPage:true});
  await page.setViewportSize({width:1366,height:768});
  await page.waitForTimeout(350);
  const bounds=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth}));
  assert(bounds.scroll<=bounds.width);
  // Past bookings share the same MacBook mapping.
  await page.route('**/api/board?*',route=>route.fulfill({json:{ok:true,date:'2026-09-29',bookings:[{...rows[0],epochStart:now-7200000,epochEnd:now-3600000,movementState:'RETURNED'}]}}));
  await page.reload();await page.waitForSelector('.past-card img');
  assert((await page.locator('.past-card img').getAttribute('src')).endsWith('device-mbn.webp'));
  const results={passed:9,failed:0,total:9,checks:['MacBook Neo image','MacBook Air alias','Mac Book Pro alias','HP Windows image','iPad image','Android image','No runtime errors','1366px viewport has no horizontal overflow','Past-strip MacBook image']};
  fs.writeFileSync(path.join(__dirname,'browser_results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
  await browser.close();await new Promise(resolve=>server.close(resolve));
})().catch(error=>{console.error(error.stack);server.close();process.exit(1);});
