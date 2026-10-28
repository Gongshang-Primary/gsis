'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const teacher = {id:'t1', name:'Teacher One', statutoryName:'Mdm TAN 李', active:'Y', groups:[], emails:{gsps:'teacher@gsps.edu.sg', icon:'teacher@moe.edu.sg'}, mobile:'91234567', role:'Teacher'};
const otherTeacher = {id:'t2', name:'Teacher Two', statutoryName:'Ms Other Name', active:'Y', groups:[], emails:{gsps:'other@gsps.edu.sg'}, mobile:'92345678', role:'Teacher'};
const data = {user:{email:'smc@gsps.edu.sg',roles:[]}, people:[teacher,otherTeacher], groups:[], access:[], deploymentAvailable:true, deploymentPending:false};
const unfold = text => text.replace(/\r\n[ \t]/g, '');

async function setup(browser, mobile=false) {
 const context = await browser.newContext({viewport:mobile?{width:390,height:800}:{width:1280,height:900}, hasTouch:mobile, isMobile:mobile, acceptDownloads:true});
 const page = await context.newPage(), requests=[], errors=[];
 let signedOut=false;
 page.setDefaultTimeout(6000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  window.__contactUrls=[];window.__contactRevoked=[];window.__oauthRequests=0;
  const create=URL.createObjectURL.bind(URL), revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=blob=>{const url=create(blob);if(/vcard/i.test(blob.type))window.__contactUrls.push(url);return url;};
  URL.revokeObjectURL=url=>{window.__contactRevoked.push(url);return revoke(url);};
  window.google={accounts:{id:{initialize(){},renderButton(){},disableAutoSelect(){}},oauth2:{initTokenClient(){window.__oauthRequests++;throw Error('Unexpected Contacts consent');}}}};
 });
 await page.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());requests.push({url:request.url(),method:request.method()});
  if(url.origin!=='https://contacts.test')return route.abort();
  if(url.pathname==='/api/config')return route.fulfill({json:{configured:true,clientId:'fixture-client'}});
  if(url.pathname==='/api/session')return route.fulfill({json:{ok:!signedOut}});
  if(url.pathname==='/api/logout'){signedOut=true;return route.fulfill({json:{ok:true}});}
  if(url.pathname==='/api/deployment')return route.fulfill({json:{ok:true,data:{available:true,assignments:[],workloads:[],organisations:{}}}});
  if(url.pathname.startsWith('/api/'))return route.fulfill({json:{ok:true,data}});
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1),file=path.join('contacts-update/public',name);
  return fs.existsSync(file)?route.fulfill({contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':undefined,body:fs.readFileSync(file)}):route.fulfill({status:404});
 });
 await page.goto('https://contacts.test/');
 await page.locator('#contactRows tr').first().waitFor();
 await page.waitForFunction(()=>document.getElementById('deploymentStatus').textContent==='');
 return {page,context,requests,errors};
}

async function readDownload(page, trigger) {
 const waiting=page.waitForEvent('download');await trigger();
 const download=await waiting;
 assert.match(download.suggestedFilename(),/\.vcf$/i);
 assert.equal(await download.failure(),null);
 return fs.readFileSync(await download.path(),'utf8');
}

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.ROSTER_TEST_CHROMIUM||process.env.GSIS_BROWSER_EXECUTABLE||'/tmp/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  const desktop=await setup(browser),{page,context,requests,errors}=desktop;
  assert.equal((await page.locator('#contactHead th').first().textContent()).trim(),'add','heading identifies local contact export');
  assert.match(await page.locator('#contactHead th').nth(1).textContent(),/TTb Name/);
  const button=page.locator('[data-contact-vcard="t1"]');
  assert.equal((await button.textContent()).trim(),'+');
  assert.match(await button.getAttribute('aria-label'),/Add .*contact|Add to contacts/i);
  assert.equal(await page.locator('#contactRows tr').first().locator('td').first().locator('[data-contact-vcard]').count(),1,'add remains immediately before TTb Name');
  assert.equal(await page.evaluate(()=>__contactUrls.length),0,'rendering does not pre-generate vCards');
  assert.equal(await page.locator('[data-google-contact]').count(),0,'old Google action is not retained');
  assert.equal(await page.locator('script[src*="google-contacts"]').count(),0,'old Google capability is not loaded');
  const beforeRequests=requests.length;
  await context.setOffline(true);
  await button.focus();
  const text=await readDownload(page,()=>page.keyboard.press('Enter'));
  assert.ok(unfold(text).includes('N:Mdm TAN 李;Teacher One;;GSPS;\r\n'));
  assert.ok(unfold(text).includes('FN:GSPS Teacher One Mdm TAN 李\r\n'));
  assert.match(text,/\r\nTEL(?:;[^:\r\n]+)?:\+6591234567\r\n/);
  assert.equal(text.includes('Teacher Two'),false,'exports only the selected person');
  assert.equal(requests.length,beforeRequests,'click works offline from loaded data without verification calls');
  assert.equal(await page.evaluate(()=>__oauthRequests),0);
  assert.equal(await page.locator('[data-contact-vcard-download]').count(),1,'download fallback remains available');
  assert.match(await page.locator('#contactVCardStatus').textContent(),/open|import|save|download/i);
  assert.doesNotMatch(await page.locator('#contactVCardStatus').textContent(),/was added|already in your|saved to your/i,'a download must not claim native Contacts saved it');
  const fallback=await readDownload(page,()=>page.locator('[data-contact-vcard-download]').click());
  assert.equal(fallback,text);
  const textTwo=await readDownload(page,()=>page.locator('[data-contact-vcard="t2"]').click());
  assert.ok(unfold(textTwo).includes('N:Ms Other Name;Teacher Two;;GSPS;\r\n'));
  const urlState=await page.evaluate(()=>({urls:__contactUrls,revoked:__contactRevoked}));
  assert.notEqual(await page.locator('[data-contact-vcard-download]').getAttribute('href'),urlState.urls[0],'latest fallback no longer exposes the previous contact; revocation can allow an in-progress download grace');
  assert.equal(await page.locator('[data-contact-vcard-download]').count(),1,'only latest fallback is kept');
  assert.equal(requests.length,beforeRequests);
  await context.setOffline(false);
  await page.locator('#signout').click();
  await page.waitForFunction(()=>!document.getElementById('loginView').classList.contains('hidden'));
  assert.equal(await page.locator('[data-contact-vcard-download]').count(),0,'sign-out removes the previous private download link');
  assert.equal(await page.locator('[data-contact-vcard]').count(),0,'sign-out clears the directory action rows');
  const afterSignout=await page.evaluate(()=>({urls:__contactUrls,revoked:__contactRevoked}));
  assert.ok(afterSignout.urls.every(url=>afterSignout.revoked.includes(url)),'sign-out revokes outstanding contact blobs');
  assert.deepEqual(errors,[]);
  await context.close();

  const mobile=await setup(browser,true),mobileButton=mobile.page.locator('[data-contact-vcard="t1"]');
  const dimensions=await mobileButton.evaluate(button=>{
   const style=getComputedStyle(button),row=button.closest('tr'),before=row.getBoundingClientRect().height;
   const box=button.getBoundingClientRect(),parent=button.parentNode,next=button.nextSibling;
   button.remove();const without=row.getBoundingClientRect().height;parent.insertBefore(button,next);
   return {width:box.width,height:box.height,before,without,lineHeight:parseFloat(style.lineHeight),paddingLeft:parseFloat(style.paddingLeft),paddingRight:parseFloat(style.paddingRight),paddingTop:parseFloat(style.paddingTop),paddingBottom:parseFloat(style.paddingBottom),borderWidth:parseFloat(style.borderTopWidth),background:style.backgroundColor};
  });
  assert.ok(dimensions.width>=40,'horizontal touch target remains wide: '+JSON.stringify(dimensions));
  assert.ok(dimensions.paddingLeft>=10&&dimensions.paddingRight>=10,'padding widens each side of the text');
  assert.equal(dimensions.paddingTop+dimensions.paddingBottom,0,'control adds no vertical padding');
  assert.equal(dimensions.borderWidth,0,'plus has no visible button or circle outline');
  assert.ok(dimensions.height<=dimensions.lineHeight+1,'button follows text height');
  assert.ok(Math.abs(dimensions.before-dimensions.without)<=1,'plus does not enlarge row height');
  assert.ok(dimensions.height<44,'old tall touch-button height is removed');
  assert.equal(await mobile.page.locator('#mobileColumns').isEnabled(),true);
  await mobile.page.locator('#mobileColumns').click();
  await mobile.page.locator('[data-mobile-preset="defaultColumns"]').click();
  await mobile.page.locator('#mobilePanelClose').click();
  assert.equal(await mobileButton.count(),1,'mobile column controls preserve export action');
  const mobileText=await readDownload(mobile.page,()=>mobileButton.tap());
  assert.equal(mobileText,text,'touch and keyboard export the same selected contact');
  assert.deepEqual(mobile.errors,[]);
  await mobile.context.close();
  console.log('PASS Contacts vCard browser: actual offline downloads, exact names, no OAuth, fallback, per-person cleanup/sign-out, compact rows, touch and keyboard');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
