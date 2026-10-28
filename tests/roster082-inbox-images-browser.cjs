'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({executablePath:process.env.ROSTER_TEST_CHROMIUM||'/tmp/chromium',headless:true,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.fulfill({status:r.request().url().includes('/api/whatsapp/media/')?503:200,contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="content"></main>'}));await page.goto('https://roster.test/');await page.clock.install();
 for(const name of ['roster.css','roster-inbox.css'])await page.addStyleTag({content:fs.readFileSync(path.join(root,'roster-update/public',name),'utf8')});
 for(const name of ['shared/roster-inbox.js','roster-update/public/roster-inbox-ui.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,name),'utf8')});
 await page.evaluate(async()=>{const I=GSISRosterInbox;window.calls=[];window.ctx={now:Date.now(),service:true,user:{email:'smc@test.school',staffId:'smc',smc:true},people:[],smcIds:['smc'],adminIds:[],currentDutyIds:[],uuid:()=>crypto.randomUUID(),digest:JSON.stringify};window.state=I.initial();I.ingest(state,ctx,{message:{id:'wamid.image',from:'6591111111',timestamp:ctx.now,type:'image',text:'<img src=x onerror="window.unsafe=true">',image:{mediaId:'12345',mimeType:'image/png',captureStatus:'unavailable'}}});window.api=async(_route,p)=>{calls.push(p);if(window.hold&&p.operation==='inboxList'){await new Promise(r=>window.release=r);window.hold=false;}return p.operation==='inboxList'?{...I.list(state,ctx,p),configuration:{enabled:true,...Object.fromEntries(['capture','replies','voice','images','templates'].map(k=>[k,{configured:true}]))}}:I.thread(state,ctx,p);};await RosterInboxUI.render({container:document.getElementById('content'),profile:{user:ctx.user},api});});
 await page.locator('[data-conversation]').click();await page.locator('[data-inbox-image]').waitFor({state:'attached'});
 const image=page.locator('[data-inbox-image]');assert.equal(await image.getAttribute('loading'),'lazy');assert.equal(await image.getAttribute('decoding'),'async');assert.equal(await image.getAttribute('src'),'/api/whatsapp/media/wamid.image?waId=6591111111');
 await page.locator('[data-image-retry]').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.unsafe),undefined);assert.match(await page.locator('.inbox-image-error').innerText(),/could not load/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('[data-image-retry]').click();await page.locator('[data-image-retry]').waitFor({state:'visible'});
 await page.locator('[data-inbox-reply]').fill('A draft survives');
 // Two simultaneous refresh requests for the same list are one backend request.
 const before=await page.evaluate(()=>{hold=true;const n=calls.length;document.querySelector('[data-inbox-refresh]').click();document.querySelector('[data-inbox-refresh]').click();return n;});
 await page.waitForFunction(()=>!!window.release);assert.equal(await page.evaluate(n=>calls.slice(n).filter(p=>p.operation==='inboxList').length,before),1);
 await page.evaluate(()=>release());await page.waitForTimeout(50);assert.equal(await page.locator('[data-inbox-reply]').inputValue(),'A draft survives');
 // Hidden tabs cannot start background requests. Returning resumes a fresh read.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));window.hiddenCount=calls.length;});await page.clock.runFor(16000);assert.equal(await page.evaluate(()=>calls.length===hiddenCount),true);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>calls.length>hiddenCount);
 await page.evaluate(()=>RosterInboxUI.unmount());assert.deepEqual(errors,[]);
 console.log('PASS Inbox image UI: lazy private image, escaped caption, clear retry, mobile width, coalesced reads, draft preservation and hidden-tab pause.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
